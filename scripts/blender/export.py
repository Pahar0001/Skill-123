# -*- coding: utf-8 -*-
"""
Экспорт glTF 2.0 (GLB) для run.py: модификаторы применяются, процедурные материалы (шум бумаги,
плетение ткани) запекаются в картинки — в glTF нет узлов шума, без запекания рельеф пропал бы молча;
анимация физики — ключами (rigid body → keyframes делает physics.bake_keys); Draco — по флагу.

Параметры экспортёра в разных версиях Blender добавлялись и переименовывались: передаются только те,
что есть у оператора этой сборки, остальные перечисляются в протоколе («не поддержано этой версией»).

Написано под 4.2 LTS+; что проверено настоящим запуском — reference/blender.md → «Что проверено запуском».
"""
import os

try:
    import bpy
except ImportError:
    bpy = None

# узлы, которых нет в glTF: материал с ними запекается (цвет и/или рельеф)
PROCEDURAL = {"TEX_NOISE", "TEX_WAVE", "TEX_VORONOI", "TEX_MUSGRAVE", "TEX_MAGIC", "TEX_GRADIENT", "TEX_CHECKER", "TEX_BRICK", "TEX_WHITE_NOISE", "BUMP"}


def _upstream(socket, seen=None):
    """Все узлы, от которых зависит вход."""
    seen = seen if seen is not None else set()
    for link in socket.links:
        n = link.from_node
        if n.name in seen:
            continue
        seen.add(n.name)
        yield n
        for inp in n.inputs:
            for x in _upstream(inp, seen):
                yield x


def needs_bake(mat):
    """→ {'color': bool, 'normal': bool}: какие входы Principled питаются процедурными узлами."""
    out = {"color": False, "normal": False}
    if mat is None or not mat.node_tree:
        return out
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return out
    for key, names in (("color", ("Base Color",)), ("normal", ("Normal",))):
        for nm in names:
            s = bsdf.inputs.get(nm)
            if s is not None and s.is_linked and any(n.type in PROCEDURAL for n in _upstream(s)):
                out[key] = True
    return out


def _select_only(objs):
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    if objs:
        vl.objects.active = objs[0]


def bake_materials(objs, size=1024, warn=print):
    """Запечь процедурный цвет и рельеф в картинки и переподключить материал. Каждому предмету — свой
    материал-копия (развёртка у предметов разная). → число запечённых предметов."""
    scene = bpy.context.scene
    if scene.render.engine != "CYCLES":
        scene.render.engine = "CYCLES"
    samples = scene.cycles.samples
    scene.cycles.samples = 16
    done = 0
    for o in objs:
        if o.type != "MESH" or not o.data.materials:
            continue
        if len(o.data.materials) > 1:
            if any(any(needs_bake(m).values()) for m in o.data.materials):
                warn("%s: несколько материалов с процедурными узлами — не запекается, рельеф в GLB пропадёт" % o.name)
            continue
        mat = o.data.materials[0]
        need = needs_bake(mat)
        if not any(need.values()):
            continue
        if not o.data.uv_layers:
            warn("%s: нет UV-развёртки — запекание пропущено" % o.name)
            continue
        try:
            m2 = mat.copy()
            o.data.materials[0] = m2
            nt = m2.node_tree
            bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            _select_only([o])
            if need["color"]:
                img = bpy.data.images.new("%s-color" % o.name, size, size, alpha=False)
                tex = nt.nodes.new("ShaderNodeTexImage")
                tex.image = img
                nt.nodes.active = tex
                bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=8, use_clear=True)
                for link in list(bsdf.inputs["Base Color"].links):
                    nt.links.remove(link)
                nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
                img.pack()
            if need["normal"]:
                img = bpy.data.images.new("%s-normal" % o.name, size, size, alpha=False)
                img.colorspace_settings.name = "Non-Color"
                tex = nt.nodes.new("ShaderNodeTexImage")
                tex.image = img
                nt.nodes.active = tex
                bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=8, use_clear=True)
                for link in list(bsdf.inputs["Normal"].links):
                    nt.links.remove(link)
                nm = nt.nodes.new("ShaderNodeNormalMap")
                nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
                nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
                img.pack()
            done += 1
        except Exception as e:  # запекание — улучшение, не условие экспорта
            warn("%s: запекание материала не удалось (%s) — в GLB без процедурного рельефа" % (o.name, e))
    scene.cycles.samples = samples
    return done


def export_glb(path, objs, draco=False, animation=False, frame_range=None, warn=print):
    """GLB по списку предметов. → {'file', 'bytes', 'skipped': [параметры, которых нет у этой версии]}."""
    _select_only(objs)
    op = bpy.ops.export_scene.gltf
    try:
        known = set(op.get_rna_type().properties.keys())
    except Exception:
        known = None
    want = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="WEBP",          # запечённые текстуры: PNG давал 1,2 МБ на картинку, WebP — в разы меньше (EXT_texture_webp, three.js понимает)
        export_image_quality=86,
        export_image_webp_fallback=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_animations=bool(animation),
        export_animation_mode="SCENE",  # 4.0+: одна анимация на всю сцену, а не по одной на каждую карточку
        export_frame_range=True,
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_morph=False,
        export_skins=False,
        export_draco_mesh_compression_enable=bool(draco),
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_draco_color_quantization=10,
    )
    if frame_range:
        scene = bpy.context.scene
        scene.frame_start, scene.frame_end = frame_range
    skipped = []
    kw = {}
    for k, v in want.items():
        if known is None or k in known or k == "filepath":
            kw[k] = v
        else:
            skipped.append(k)
    important = [k for k in skipped if k in ("export_apply", "export_animations", "export_draco_mesh_compression_enable", "use_selection")]
    if important:
        warn("экспортёр glTF этой версии не знает %s — результат проверить glb-check" % ", ".join(important))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    try:
        op(**kw)
    except TypeError as e:  # версия без WEBP в export_image_format — JPEG
        if kw.get("export_image_format") == "WEBP":
            warn("экспортёр glTF не принял WEBP (%s) — текстуры в JPEG" % e)
            kw["export_image_format"] = "JPEG"
            op(**kw)
        else:
            raise
    if not os.path.isfile(path):
        raise RuntimeError("экспортёр отработал, но файла нет: " + path)
    return {"file": path, "bytes": os.path.getsize(path), "skipped": skipped}


def draco_available():
    """Есть ли библиотека Draco в сборке Blender (без неё флаг сжатия даёт ошибку экспорта)."""
    for mod, fn in (("io_scene_gltf2.io.com.draco", "dll_exists"), ("io_scene_gltf2.io.com.gltf2_io_draco_compression_extension", "dll_exists")):
        try:
            m = __import__(mod, fromlist=[fn])
            return bool(getattr(m, fn)())
        except Exception:
            continue
    return None
