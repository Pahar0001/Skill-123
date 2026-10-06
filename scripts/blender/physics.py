# -*- coding: utf-8 -*-
"""
Физика плоскостей для run.py: твёрдые тела (карточки, коробки, предметы падают и укладываются на
плоскость или полки) и ткань (драпируется по предметам и плоскости). Симуляция прогоняется кадр за
кадром — кэш заполняется по порядку, — затем:
  · твёрдые тела → ключи положения и поворота на каждом кадре (для видео и GLB с анимацией);
  · ткань → «заморозка» последнего кадра в сетку (GLB не умеет кэш точек; анимация ткани — видео).

Написано под 4.2 LTS+; что проверено настоящим запуском — reference/blender.md → «Что проверено запуском».

Параметры по умолчанию подобраны для предметов размером 0.05…2 единицы (метры Blender):
  · трение 0.6, отскок 0.1 (у Bullet отскок двух тел перемножается — у пола 0.3, иначе отскока не видно);
  · запас столкновения 1 мм (у тонких карточек стандартные 4 см дают «парение» над столом);
  · 20 подшагов на кадр и 30 итераций решателя: тонкие тела не проваливаются друг сквозь друга.
"""
import math

try:
    import bpy
    from mathutils import Vector
except ImportError:
    bpy = None
    Vector = None

# Ткани: масса (кг на всю ткань), жёсткость на растяжение/сжатие/сдвиг/изгиб, качество (шагов на кадр)
CLOTH_PRESETS = {
    "silk": dict(mass=0.15, tension=5.0, compression=5.0, shear=5.0, bending=0.05, quality=10, air=1.0),
    "cotton": dict(mass=0.3, tension=15.0, compression=15.0, shear=15.0, bending=0.5, quality=8, air=1.0),
    "linen": dict(mass=0.4, tension=30.0, compression=30.0, shear=25.0, bending=2.0, quality=10, air=1.0),
    "denim": dict(mass=1.0, tension=40.0, compression=40.0, shear=40.0, bending=10.0, quality=12, air=1.0),
    "leather": dict(mass=0.4, tension=80.0, compression=80.0, shear=80.0, bending=150.0, quality=15, air=1.0),
}
SHAPES = ("BOX", "SPHERE", "CAPSULE", "CYLINDER", "CONE", "CONVEX_HULL", "MESH")


def _override(obj):
    """Контекст «этот предмет выделен и активен» для операторов rigidbody в безголовом режиме."""
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    obj.select_set(True)
    vl.objects.active = obj
    try:
        return bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj], selected_editable_objects=[obj])
    except AttributeError:  # до 3.2 — обычный контекст с активным предметом
        class _Null(object):
            def __enter__(self):
                return None

            def __exit__(self, *a):
                return False
        return _Null()


def world(frames=120, substeps=20, iterations=30):
    scene = bpy.context.scene
    if scene.rigidbody_world is None:
        bpy.ops.rigidbody.world_add()
    w = scene.rigidbody_world
    w.enabled = True
    try:
        w.substeps_per_frame = substeps
    except AttributeError:
        pass
    w.solver_iterations = iterations
    w.point_cache.frame_start = scene.frame_start
    w.point_cache.frame_end = max(scene.frame_end, frames)
    if w.collection is None:
        coll = bpy.data.collections.get("RigidBodyWorld") or bpy.data.collections.new("RigidBodyWorld")
        w.collection = coll
    return w


def _add_body(obj, kind):
    world(bpy.context.scene.frame_end)
    if obj.rigid_body is None:
        with _override(obj):
            bpy.ops.rigidbody.object_add(type=kind)
    rb = obj.rigid_body
    if rb is None:
        raise RuntimeError("не удалось сделать «%s» твёрдым телом (rigidbody.object_add)" % obj.name)
    rb.type = kind
    return rb


def rigid(obj, mass=1.0, friction=0.6, bounce=0.1, shape="CONVEX_HULL", margin=0.001, damping=(0.04, 0.1), sleep=True):
    """Падающий предмет. shape: BOX для карточек и коробок (устойчивее всего), CONVEX_HULL — для прочих."""
    if shape not in SHAPES:
        raise ValueError("форма столкновения %s — нужно одно из %s" % (shape, ", ".join(SHAPES)))
    rb = _add_body(obj, "ACTIVE")
    rb.mass = mass
    rb.friction = friction
    rb.restitution = bounce
    rb.collision_shape = shape
    rb.use_margin = True
    rb.collision_margin = margin
    rb.linear_damping, rb.angular_damping = damping
    try:
        rb.use_deactivation = sleep
        rb.use_start_deactivated = False
    except AttributeError:
        pass
    obj["sr_sim"] = "rigid"
    return rb


def passive(obj, friction=0.7, bounce=0.3, shape="MESH", margin=0.001):
    """Неподвижная опора: пол, полка, ступенька. MESH — точная форма (только для неподвижных)."""
    rb = _add_body(obj, "PASSIVE")
    rb.friction = friction
    rb.restitution = bounce
    rb.collision_shape = shape
    rb.use_margin = True
    rb.collision_margin = margin
    try:
        rb.mesh_source = "FINAL"
    except (AttributeError, TypeError):
        pass
    obj["sr_sim"] = "passive"
    return rb


def collider(obj, thickness=0.004, friction=5.0, damping=0.1):
    """Препятствие для ткани (пол, предмет, на который она ложится)."""
    if not any(m.type == "COLLISION" for m in obj.modifiers):
        obj.modifiers.new("Collision", "COLLISION")
    c = obj.collision
    c.thickness_outer = thickness
    try:
        c.cloth_friction = friction
        c.damping = damping
    except AttributeError:
        pass
    return c


def cloth(obj, preset="cotton", frames=120, pin_group=None, self_collision=True, thickness=0.004, subsurf=1, solidify=0.002, **over):
    """Ткань из плоской сетки (ctx.plane(..., subdiv=64)). После симуляции — сглаживание и толщина."""
    p = dict(CLOTH_PRESETS.get(preset) or CLOTH_PRESETS["cotton"])
    if preset not in CLOTH_PRESETS:
        print("BLENDER-WARN ткань «%s» неизвестна — взят cotton (есть: %s)" % (preset, ", ".join(CLOTH_PRESETS)), flush=True)
    p.update(over)
    mod = obj.modifiers.new("Cloth", "CLOTH")
    s = mod.settings
    s.quality = int(p["quality"])
    s.mass = p["mass"]
    s.air_damping = p["air"]
    s.tension_stiffness = p["tension"]
    s.compression_stiffness = p["compression"]
    s.shear_stiffness = p["shear"]
    s.bending_stiffness = p["bending"]
    if pin_group:
        s.vertex_group_mass = pin_group
    c = mod.collision_settings
    c.collision_quality = 4
    c.distance_min = thickness
    c.use_self_collision = self_collision
    c.self_distance_min = thickness
    try:
        c.self_friction = 5.0
    except AttributeError:
        pass
    mod.point_cache.frame_start = bpy.context.scene.frame_start
    mod.point_cache.frame_end = max(bpy.context.scene.frame_end, frames)
    if subsurf:
        sm = obj.modifiers.new("Subdivision", "SUBSURF")
        sm.levels = subsurf
        sm.render_levels = subsurf
    if solidify:
        so = obj.modifiers.new("Solidify", "SOLIDIFY")
        so.thickness = solidify
        so.offset = 0
    obj["sr_sim"] = "cloth"
    return mod


def bodies():
    scene = bpy.context.scene
    act = [o for o in scene.objects if o.rigid_body is not None and o.rigid_body.type == "ACTIVE"]
    cl = [o for o in scene.objects if any(m.type == "CLOTH" for m in o.modifiers)]
    return act, cl


def simulate(start, end, record):
    """Прогон кадр за кадром; положения твёрдых тел — по вычисленным предметам. → {имя: [(кадр, матрица)]}."""
    scene = bpy.context.scene
    tracks = {o.name: [] for o in record}
    for f in range(start, end + 1):
        scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        for o in record:
            tracks[o.name].append((f, o.evaluated_get(dg).matrix_world.copy()))
    try:  # закрепить кэш, чтобы рендер кадров не пересчитывал (не обязательно)
        bpy.ops.ptcache.bake_all(bake=True)
    except Exception:
        pass
    return tracks


def checks(tracks, floor_z, radius, end):
    """Улеглось ли к последнему кадру и не упало ли за край. → (сведения, предупреждения)."""
    warns = []
    moving, fallen = [], []
    for name, seq in tracks.items():
        if len(seq) < 2:
            continue
        a, b = seq[-2][1], seq[-1][1]
        v = (b.translation - a.translation).length
        if v > max(1e-4, radius * 0.002):
            moving.append(name)
        if b.translation.z < floor_z - radius * 0.5:
            fallen.append(name)
    if moving:
        warns.append("не улеглось к кадру %d: %s — больше --frames, больше трения или меньше высота падения" % (end, ", ".join(moving[:6])))
    if fallen:
        warns.append("упало за край опоры: %s — шире пол или ближе к центру" % ", ".join(fallen[:6]))
    return {"bodies": len(tracks), "moving": moving, "fallen": fallen}, warns


def bake_keys(tracks, step=1):
    """Твёрдые тела → ключи положения и поворота (линейные, без «перелёта» между ключами); мир физики
    выключается — дальше предметы ведут ключи (видео, GLB)."""
    scene = bpy.context.scene
    try:
        bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    except (AttributeError, TypeError):
        pass
    if scene.rigidbody_world is not None:
        scene.rigidbody_world.enabled = False
    keys = 0
    for name, seq in tracks.items():
        o = bpy.data.objects[name]
        o.rotation_mode = "QUATERNION"
        prev = None
        for i, (f, M) in enumerate(seq):
            if step > 1 and i % step and i != len(seq) - 1:
                continue
            loc, rot, sca = M.decompose()
            if prev is not None and prev.dot(rot) < 0:  # кватернион того же поворота с другим знаком — без кувырка
                rot.negate()
            prev = rot.copy()
            o.location = loc
            o.rotation_quaternion = rot
            o.scale = sca
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("rotation_quaternion", frame=f)
            keys += 1
    return keys


def freeze(obj):
    """Ткань на текущем кадре → обычная сетка (все модификаторы применены). Для GLB и для правки руками."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    obj["sr_sim"] = "frozen"
    return obj
