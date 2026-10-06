# -*- coding: utf-8 -*-
"""
Студия для пререндера в Blender (Cycles): свет из софтбоксов, материалы-заготовки, камера по рамке
предметов, тень на земле, прозрачный фон. Общий модуль для run.py (render, physics, glb).

Планка (reference/blender.md → «Планка качества»): студия из узких ярких плоскостей вместо HDRI, глянец
рядом с матовым, детали, тень под стоящим предметом, цвет из палитры сайта, поле кадра не уже 8 %.
Трассировка путей даёт отражения, преломление, мягкие тени и затенение в стыках; сверху — денойз и
тональная кривая Khronos PBR Neutral / AgX.

Код написан под Blender 4.2 LTS и новее; имена входов Principled BSDF, тональных кривых и устройств
перебираются по спискам, чтобы пережить переименования между версиями. Что проверено настоящим запуском
(macOS и Windows, 06.10.2026) — reference/blender.md → «Что проверено запуском».

Чистые функции (палитра, цвет, поле зрения, проверка JSON-сцены) не зависят от bpy и проверяются
обычным python3 в `blender.mjs selftest`.
"""
import math
import os
import random

try:
    import bpy
    import bmesh
    from mathutils import Vector
except ImportError:  # python3 без Blender: доступны только чистые функции ниже
    bpy = None
    bmesh = None
    Vector = None


# --------------------------------------------------------------------------------------------
# Чистые функции (без bpy)
# --------------------------------------------------------------------------------------------

# Нейтральная палитра образцов. Свой сайт — свои цвета: --palette "bone=#E7E3DD,accent=#C8553D".
DEFAULT_PALETTE = {
    "ink": "#1E2420",
    "bone": "#E7E3DD",
    "paper": "#FBF9F5",
    "kraft": "#D6B585",
    "accent": "#C8553D",
    "accent2": "#2F6B5A",
    "sun": "#F0A92B",
    "metal": "#C9CFC4",
    "glass": "#EEF4F1",
    "bg": "#EFEBE4",
}

MATERIAL_KINDS = ("clay", "gloss", "satin", "metal", "paper", "glass", "glow", "fabric", "rubber", "leafy", "honey", "printed")
DEFAULT_MARGIN = 1.19   # поле кадра: предмет занимает 1/1.19 = 84 % стороны — по 8 % с каждого края
SHAPES = ("box", "card", "cylinder", "sphere", "torus", "plane", "cloth", "text", "import")
TONES = {
    # тональная кривая → какие view transform пробовать по очереди (имена разных версий Blender)
    "neutral": ("Khronos PBR Neutral", "AgX", "Filmic", "Standard"),
    "agx": ("AgX", "Filmic", "Standard"),
    "filmic": ("Filmic", "AgX", "Standard"),
    "standard": ("Standard",),
}


def parse_hex(value):
    """'#E7E3DD' | 'E7E3DD' | '#abc' → (r, g, b) в 0…1 (sRGB). Неверный цвет — ValueError."""
    s = str(value).strip().lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) not in (6, 8) or any(ch not in "0123456789abcdefABCDEF" for ch in s):
        raise ValueError("нужен цвет #RGB или #RRGGBB, а не «%s»" % value)
    return tuple(int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_rgba(value):
    """Цвет из палитры сайта → линейный RGBA для входов шейдера (Blender считает в линейном свете)."""
    r, g, b = parse_hex(value)
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def merge_palette(base, over):
    """Палитра сцены + --palette. Неизвестные имена тоже добавляются (сцена может их читать)."""
    out = dict(base or {})
    for k, v in (over or {}).items():
        parse_hex(v)
        out[str(k)] = "#" + str(v).strip().lstrip("#")
    return out


def fov_pair(fov_deg, width, height):
    """Поле зрения Blender (sensor_fit AUTO: угол — по большей стороне кадра) → (по горизонтали, по вертикали), рад."""
    a = math.radians(fov_deg)
    if width >= height:
        return a, 2 * math.atan(math.tan(a / 2) * height / float(width))
    return 2 * math.atan(math.tan(a / 2) * width / float(height)), a


def fit_distance(radius, fov_deg, width, height, margin=DEFAULT_MARGIN):
    """Расстояние, на котором сфера радиуса radius целиком в кадре с полем margin."""
    h, v = fov_pair(fov_deg, width, height)
    return radius * margin / math.sin(min(h, v) / 2)


def light_power(radiance, distance):
    """Мощность прямоугольного источника (Вт), чтобы белый матовый предмет на distance светился ≈ radiance.
    На оси площадного источника сила света I = P/π; освещённость E = I/d²; яркость белого L = E/π."""
    return radiance * math.pi * math.pi * distance * distance


def rounded_polygon(pts, rad, seg=6):
    """Многоугольник со скруглёнными углами: [(x, y)] → [(x, y)] (в каждом углу дуга из seg отрезков)."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n]
        if rad <= 0:
            out.append((p1[0], p1[1]))
            continue
        d1 = (p0[0] - p1[0], p0[1] - p1[1])
        d2 = (p2[0] - p1[0], p2[1] - p1[1])
        l1, l2 = math.hypot(*d1), math.hypot(*d2)
        r1, r2 = min(rad, l1 / 2), min(rad, l2 / 2)
        a = (p1[0] + d1[0] / l1 * r1, p1[1] + d1[1] / l1 * r1)
        b = (p1[0] + d2[0] / l2 * r2, p1[1] + d2[1] / l2 * r2)
        for k in range(seg + 1):
            t = k / float(seg)
            out.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * p1[0] + t * t * b[0],
                        (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * p1[1] + t * t * b[1]))
    return out


def hex_points(r=1.0, k=0.16, rot=30.0, seg=6):
    """Шестиугольник радиуса r по вершинам со скруглением углов k·r; rot — поворот, градусы."""
    pts = [(r * math.cos(math.radians(rot + 60 * i)), r * math.sin(math.radians(rot + 60 * i))) for i in range(6)]
    return rounded_polygon(pts, k * r, seg)


def catmull(points, n):
    """n + 1 точек по сглаженной кривой через points (Catmull-Rom). Точки — кортежи из трёх чисел."""
    P = [tuple(float(c) for c in p) for p in points]
    if len(P) < 2:
        raise ValueError("кривой нужно хотя бы две точки")
    first = tuple(2 * a - b for a, b in zip(P[0], P[1]))
    last = tuple(2 * a - b for a, b in zip(P[-1], P[-2]))
    P = [first] + P + [last]
    segs = len(P) - 3
    out = []
    for i in range(n + 1):
        t = i / float(n) * segs
        k = min(int(t), segs - 1)
        u = t - k
        p0, p1, p2, p3 = P[k:k + 4]
        out.append(tuple(0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u ** 3)
                         for a, b, c, d in zip(p0, p1, p2, p3)))
    return out


def frame_margins(points):
    """Проекции точек в кадр (0…1 по обеим осям) → наименьшее поле до края кадра, доля стороны."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(min(xs), 1 - max(xs), min(ys), 1 - max(ys))


def validate_spec(spec):
    """Проверка JSON-сцены без Blender → список ошибок (пустой — годится)."""
    errs = []
    if not isinstance(spec, dict):
        return ["сцена JSON — объект { objects: [...] }"]
    objs = spec.get("objects")
    if not isinstance(objs, list) or not objs:
        errs.append("нет списка objects (хотя бы один предмет)")
        objs = []
    pal = spec.get("palette") or {}
    if not isinstance(pal, dict):
        errs.append("palette — объект имя: цвет")
        pal = {}
    for k, v in pal.items():
        try:
            parse_hex(v)
        except ValueError as e:
            errs.append("palette.%s: %s" % (k, e))
    names = set(DEFAULT_PALETTE) | set(pal)

    def vec(o, key, n, where):
        if key in o:
            v = o[key]
            if not isinstance(v, list) or len(v) != n or not all(isinstance(x, (int, float)) for x in v):
                errs.append("%s.%s — список из %d чисел" % (where, key, n))

    for i, o in enumerate(objs):
        where = "objects[%d]" % i
        if not isinstance(o, dict):
            errs.append(where + " — объект")
            continue
        t = o.get("type")
        if t not in SHAPES:
            errs.append("%s.type «%s» — нужно одно из %s" % (where, t, ", ".join(SHAPES)))
            continue
        for key, n in (("location", 3), ("rotation", 3)):
            vec(o, key, n, where)
        if t in ("box", "card"):
            vec(o, "size", 3, where)
        if t in ("plane", "cloth"):
            vec(o, "size", 2, where)
        if t == "import" and not o.get("file"):
            errs.append(where + ": у import нужен file (glb, gltf, obj, fbx, stl, ply)")
        if t == "text" and not o.get("text"):
            errs.append(where + ": у text нужен text")
        m = o.get("material")
        if m is not None and m not in MATERIAL_KINDS:
            errs.append("%s.material «%s» — нужно одно из %s" % (where, m, ", ".join(MATERIAL_KINDS)))
        if m == "printed" and not o.get("image"):
            errs.append(where + ": у material printed нужен image (png, jpg или webp рядом со сценой)")
        c = o.get("color")
        if c is not None and c not in names:
            try:
                parse_hex(c)
            except ValueError:
                errs.append("%s.color «%s» — имя из палитры (%s) или #RRGGBB" % (where, c, ", ".join(sorted(names))))
        rb = o.get("rigid")
        if rb is not None and not isinstance(rb, (dict, bool)):
            errs.append(where + ".rigid — true или { mass, friction, bounce, shape }")
        if isinstance(rb, dict) and rb.get("shape") and rb["shape"] not in ("BOX", "SPHERE", "CAPSULE", "CYLINDER", "CONE", "CONVEX_HULL", "MESH"):
            errs.append(where + ".rigid.shape — BOX, SPHERE, CAPSULE, CYLINDER, CONE, CONVEX_HULL или MESH")
    cam = spec.get("camera") or {}
    if not isinstance(cam, dict):
        errs.append("camera — объект { view, fov, margin }")
    else:
        vec(cam, "view", 3, "camera")
    return errs


# --------------------------------------------------------------------------------------------
# Сцена и рендер (нужен bpy)
# --------------------------------------------------------------------------------------------

def _need_bpy():
    if bpy is None:
        raise RuntimeError("модуль studio вызван без Blender: функции сцены работают только внутри blender -b")


def clear_scene():
    """Пустая сцена: --factory-startup даёт куб, камеру и лампу — убираем всё."""
    _need_bpy()
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.curves):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def set_input(node, names, value):
    """Вход Principled BSDF по одному из имён (между версиями Blender их переименовывали)."""
    if isinstance(names, str):
        names = (names,)
    for n in names:
        sock = node.inputs.get(n)
        if sock is None:
            continue
        try:
            sock.default_value = value
            return True
        except (TypeError, ValueError, AttributeError):
            continue
    return False


def _role(obj, role):
    obj["sr_role"] = role
    return obj


def is_helper(obj):
    return obj.get("sr_role") == "helper"


def items():
    """Предметы кадра: всё видимое с геометрией, кроме служебного (земля, подложка, коллайдеры-невидимки)."""
    return [o for o in bpy.context.scene.objects
            if o.type in ("MESH", "CURVE", "FONT", "SURFACE", "META") and not is_helper(o) and not o.hide_render]


class Studio(object):
    """Материалы, предметы, свет и камера одной сцены. Сцена пользователя получает его как ctx."""

    def __init__(self, job):
        _need_bpy()
        self.job = job
        self.bpy = bpy
        self.scene = bpy.context.scene
        self.PAL = merge_palette(DEFAULT_PALETTE, job.get("palette") or {})
        self.variant = job.get("variant") or ""
        self.params = job.get("params") or {}
        self.seed = int(job.get("seed") or 7)
        self.random = random.Random(self.seed)
        self.mode = job.get("mode")
        self.sim = job.get("sim") or "rigid"
        self.frames = int(job.get("frames") or 120)
        self.warnings = []
        self._mats = {}
        self.Vector = Vector
        self.math = math

    # ---------- общее ----------
    def warn(self, msg):
        self.warnings.append(msg)
        print("BLENDER-WARN " + msg, flush=True)

    def param(self, name, default=None, cast=None):
        v = self.params.get(name, default)
        if cast is not None and v is not None:
            try:
                return cast(v)
            except (TypeError, ValueError):
                self.warn("параметр %s=%r не приводится к %s — взято %r" % (name, v, cast.__name__, default))
                return default
        return v

    def color(self, c):
        """Имя из палитры или #hex → линейный RGBA."""
        if c is None:
            c = "bone"
        return linear_rgba(self.PAL.get(c, c))

    # ---------- материалы ----------
    def _principled(self, name):
        m = bpy.data.materials.new(name)
        try:
            m.use_nodes = True  # в 5.x узлы всегда включены, свойство устарело
        except (AttributeError, TypeError):
            pass
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
            out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None) or nt.nodes.new("ShaderNodeOutputMaterial")
            nt.links.new(bsdf.outputs[0], out.inputs[0])
        return m, nt, bsdf

    def _material(self, kind, color, opts, build):
        key = (kind, str(color), tuple(sorted((k, repr(v)) for k, v in opts.items())))
        if key in self._mats:
            return self._mats[key]
        m, nt, bsdf = self._principled("%s-%s" % (kind, str(color).lstrip("#")))
        rgba = self.color(color)
        set_input(bsdf, "Base Color", rgba)
        m.diffuse_color = rgba  # цвет в окне Blender и запасной цвет экспорта
        build(m, nt, bsdf, rgba)
        if opts.get("vcol"):  # цвет из атрибута вершин (ctx.mesh(colors=…)): лента с тёмными ложбинами
            vc = nt.nodes.new("ShaderNodeVertexColor")
            vc.layer_name = str(opts["vcol"])
            nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        m["sr_kind"] = kind
        self._mats[key] = m
        return m

    def _bump(self, nt, bsdf, height_socket, strength, distance):
        bump = nt.nodes.new("ShaderNodeBump")
        set_input(bump, "Strength", strength)
        set_input(bump, "Distance", distance)
        nt.links.new(height_socket, bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        return bump

    def clay(self, color="bone", roughness=0.5, coat=0.25, **o):
        """Мягкий с тонким лаком: керамика, пластик, «пластилин»."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Roughness", roughness)
            set_input(bsdf, ("Coat Weight", "Clearcoat"), coat)
            set_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), 0.3)
            set_input(bsdf, ("Sheen Weight", "Sheen"), 0.12)
            set_input(bsdf, "Sheen Roughness", 0.6)
        return self._material("clay", color, dict(roughness=roughness, coat=coat, **o), b)

    def _aniso(self, nt, bsdf, amount):
        """Блик, вытянутый вдоль U развёртки (лента, атлас)."""
        if not amount:
            return
        set_input(bsdf, ("Anisotropic",), amount)
        try:
            tg = nt.nodes.new("ShaderNodeTangent")
            tg.direction_type = "UV_MAP"
            nt.links.new(tg.outputs["Tangent"], bsdf.inputs["Tangent"])
        except (KeyError, TypeError, AttributeError, RuntimeError):
            pass

    def gloss(self, color="accent", roughness=0.2, coat=1.0, metallic=0.0, anisotropy=0.0, **o):
        """Гладкий под плотным лаком: лента, лак, глазурь, монета. Длинные блики от софтбоксов.
        anisotropy > 0 — блик тянется вдоль U развёртки (атлас); vcol="Col" — цвет из атрибута вершин."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Roughness", roughness)
            set_input(bsdf, "Metallic", metallic)
            set_input(bsdf, ("Coat Weight", "Clearcoat"), coat)
            set_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), 0.04)
            self._aniso(nt, bsdf, anisotropy)
        return self._material("gloss", color, dict(roughness=roughness, coat=coat, metallic=metallic, anisotropy=anisotropy, **o), b)

    def satin(self, color="accent", roughness=0.36, **o):
        """Полуматовый: карточки, ламинат, крашеное дерево. Между бумагой и глянцем."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Roughness", roughness)
            set_input(bsdf, ("Coat Weight", "Clearcoat"), 0.45)
            set_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), 0.16)
        return self._material("satin", color, dict(roughness=roughness, **o), b)

    def metal(self, color="metal", roughness=0.22, anisotropy=0.0, **o):
        """Металл: крышка, зажим, гурт монеты. anisotropy > 0 — шлифовка, блик вытянут."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Metallic", 1.0)
            set_input(bsdf, "Roughness", roughness)
            if anisotropy:
                set_input(bsdf, ("Anisotropic",), anisotropy)
        return self._material("metal", color, dict(roughness=roughness, anisotropy=anisotropy, **o), b)

    def paper(self, color="paper", roughness=0.84, grain=1.0, **o):
        """Матовая бумага и картон с волокном: рельеф из шума и вытянутого шума (волокна)."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Roughness", roughness)
            set_input(bsdf, ("Sheen Weight", "Sheen"), 0.3)
            set_input(bsdf, "Sheen Roughness", 0.8)
            tc = nt.nodes.new("ShaderNodeTexCoord")
            fine = nt.nodes.new("ShaderNodeTexNoise")
            set_input(fine, "Scale", 220.0 * grain)
            set_input(fine, "Detail", 6.0)
            mp = nt.nodes.new("ShaderNodeMapping")
            set_input(mp, "Scale", (1.0, 14.0, 1.0))
            fib = nt.nodes.new("ShaderNodeTexNoise")
            set_input(fib, "Scale", 60.0 * grain)
            set_input(fib, "Detail", 3.0)
            nt.links.new(tc.outputs["Object"], fine.inputs["Vector"])
            nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
            nt.links.new(mp.outputs["Vector"], fib.inputs["Vector"])
            mix = nt.nodes.new("ShaderNodeMath")
            mix.operation = "ADD"
            nt.links.new(fine.outputs["Fac"], mix.inputs[0])
            nt.links.new(fib.outputs["Fac"], mix.inputs[1])
            self._bump(nt, bsdf, mix.outputs[0], 0.12, 0.002)
        return self._material("paper", color, dict(roughness=roughness, grain=grain, **o), b)

    def glass(self, color="glass", roughness=0.02, ior=1.45, **o):
        """Стекло: пропускание 1, лёгкий оттенок цветом."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Roughness", roughness)
            set_input(bsdf, "IOR", ior)
            set_input(bsdf, ("Transmission Weight", "Transmission"), 1.0)
            try:
                m.blend_method = "HASHED"  # EEVEE и окно; Cycles и так честный
            except (AttributeError, TypeError):
                pass
        return self._material("glass", color, dict(roughness=roughness, ior=ior, **o), b)

    def glow(self, color="sun", strength=3.0, **o):
        """Светящийся акцент: экран, лампочка, капля мёда. Яркий тёплый — не пересвечивать (персиковый уход)."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, ("Emission Color", "Emission"), rgba)
            set_input(bsdf, "Emission Strength", strength)
            set_input(bsdf, "Roughness", 0.3)
        return self._material("glow", color, dict(strength=strength, **o), b)

    def fabric(self, color="accent", roughness=0.8, weave=120.0, **o):
        """Ткань: блеск ворса (sheen) по краям складок и плетение рельефом по UV."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Roughness", roughness)
            set_input(bsdf, ("Sheen Weight", "Sheen"), 0.8)
            set_input(bsdf, "Sheen Roughness", 0.35)
            tc = nt.nodes.new("ShaderNodeTexCoord")
            w1 = nt.nodes.new("ShaderNodeTexWave")
            w2 = nt.nodes.new("ShaderNodeTexWave")
            for w, d in ((w1, "X"), (w2, "Y")):
                w.wave_type = "BANDS"
                try:
                    w.bands_direction = d
                except (AttributeError, TypeError):
                    pass
                set_input(w, "Scale", weave)
                set_input(w, "Distortion", 0.6)
                nt.links.new(tc.outputs["UV"], w.inputs["Vector"])
            mx = nt.nodes.new("ShaderNodeMath")
            mx.operation = "MAXIMUM"
            nt.links.new(w1.outputs["Fac"], mx.inputs[0])
            nt.links.new(w2.outputs["Fac"], mx.inputs[1])
            self._bump(nt, bsdf, mx.outputs[0], 0.18, 0.001)
        return self._material("fabric", color, dict(roughness=roughness, weave=weave, **o), b)

    def rubber(self, color="ink", roughness=0.62, **o):
        """Резина, мягкий пластик: матовый без лака."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Roughness", roughness)
        return self._material("rubber", color, dict(roughness=roughness, **o), b)

    def leafy(self, color="accent2", roughness=0.22, depth=0.08, glow=0.05, **o):
        """Лист: глянец под лаком, свет проходит сквозь тонкую пластину (подповерхностное рассеяние, зелёный
        канал глубже), светлый блеск по краю. depth — глубина рассеяния в единицах сцены (толщина листа)."""
        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Roughness", roughness)
            set_input(bsdf, ("Coat Weight", "Clearcoat"), 0.9)
            set_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), 0.06)
            set_input(bsdf, ("Subsurface Weight", "Subsurface"), 0.5)
            set_input(bsdf, "Subsurface Radius", (0.45, 1.0, 0.15))
            set_input(bsdf, "Subsurface Scale", depth)
            set_input(bsdf, ("Sheen Weight", "Sheen"), 0.4)
            set_input(bsdf, "Sheen Roughness", 0.35)
            set_input(bsdf, "Sheen Tint", (0.96, 1.0, 0.72, 1.0))
            if glow:
                set_input(bsdf, ("Emission Color", "Emission"), rgba)
                set_input(bsdf, "Emission Strength", glow)
        return self._material("leafy", color, dict(roughness=roughness, depth=depth, glow=glow, **o), b)

    def honey(self, color="sun", depth=0.2, clarity=0.0, glow=0.22, roughness=0.05, **o):
        """Мёд, сироп, янтарь: полупрозрачный, тёплое свечение на просвет. Свет рассеивается в толще (красный
        канал глубже — края и тонкие места теплее), сверху плотный лак с бликом. depth — глубина рассеяния в
        единицах сцены (порядка трети толщины слоя: больше — мутнее и зеленее, красный уходит вглубь);
        clarity — доля прямого пропускания (сквозь мёд становится виден тёмный купол студии — темнеет);
        glow — собственное свечение густым янтарём: заменяет свет, который в настоящем мёде приходит сзади;
        держать до 0.4 (яркий оранжевый тональная кривая уводит в персиковый). Мёд за стеклом: стеклу —
        ctx.clear_shadow(), иначе стенка затеняет его."""
        def b(m, nt, bsdf, rgba):
            deep = (rgba[0], rgba[1] * 0.8, rgba[2] * 0.45, 1.0)   # в толще мёд гуще и краснее цвета палитры
            set_input(bsdf, "Base Color", deep)
            set_input(bsdf, "Roughness", roughness)
            set_input(bsdf, "IOR", 1.49)
            set_input(bsdf, ("Subsurface Weight", "Subsurface"), 1.0)
            set_input(bsdf, "Subsurface Radius", (1.0, 0.55, 0.2))
            set_input(bsdf, "Subsurface Scale", depth)
            set_input(bsdf, "Subsurface Anisotropy", 0.7)
            set_input(bsdf, ("Transmission Weight", "Transmission"), clarity)
            set_input(bsdf, ("Coat Weight", "Clearcoat"), 1.0)
            set_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), 0.03)
            if glow:
                set_input(bsdf, ("Emission Color", "Emission"), (rgba[0], rgba[1] * 0.55, rgba[2] * 0.3, 1.0))
                set_input(bsdf, "Emission Strength", glow)
        return self._material("honey", color, dict(depth=depth, clarity=clarity, glow=glow, roughness=roughness, **o), b)

    def printed(self, image, color="paper", roughness=0.5, coat=0.3, glow=0.0, **o):
        """Печатная поверхность: картинка (png, jpg, webp) по UV — этикетка, экран, упаковка. Прозрачные места
        картинки показывают color (бумага под печатью). glow > 0 — печать светится (экран). Надпись из SVG —
        сначала в PNG (sharp); объёмная надпись — ctx.text."""
        path = os.path.abspath(image)
        if not os.path.isfile(path):
            raise RuntimeError("printed: нет картинки " + path)

        def b(m, nt, bsdf, rgba):
            set_input(bsdf, "Roughness", roughness)
            set_input(bsdf, ("Coat Weight", "Clearcoat"), coat)
            set_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), 0.12)
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(path, check_existing=True)
            tex.extension = "EXTEND"
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.inputs["A"].default_value = rgba
            nt.links.new(tex.outputs["Alpha"], mix.inputs["Factor"])
            nt.links.new(tex.outputs["Color"], mix.inputs["B"])
            nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
            if glow:
                nt.links.new(tex.outputs["Color"], bsdf.inputs.get("Emission Color") or bsdf.inputs["Emission"])
                em = nt.nodes.new("ShaderNodeMath")
                em.operation = "MULTIPLY"
                em.inputs[1].default_value = glow
                nt.links.new(tex.outputs["Alpha"], em.inputs[0])
                nt.links.new(em.outputs[0], bsdf.inputs["Emission Strength"])
        return self._material("printed", color, dict(image=path, roughness=roughness, coat=coat, glow=glow, **o), b)

    def clear_shadow(self, obj):
        """Стекло не затеняет то, что внутри: лучи теней проходят сквозь предмет (банка с мёдом, колба, витрина).
        Без этого Cycles считает стенку непрозрачной для света — содержимое выходит тёмным и мутным."""
        try:
            obj.visible_shadow = False
        except AttributeError:
            self.warn("у этой версии Blender нет visible_shadow — содержимое за стеклом будет темнее")
        return obj

    def material(self, kind, color=None, **o):
        if kind not in MATERIAL_KINDS:
            raise ValueError("материал «%s» — нужно одно из %s" % (kind, ", ".join(MATERIAL_KINDS)))
        if kind == "printed":
            if not o.get("image"):
                raise ValueError("материалу printed нужен image — путь к картинке")
            return self.printed(o.pop("image"), **(dict(o, color=color) if color is not None else o))
        fn = getattr(self, kind)
        return fn(color, **o) if color is not None else fn(**o)

    # ---------- предметы ----------
    def _mesh_obj(self, name, bm, material=None, location=(0, 0, 0), rotation=(0, 0, 0), smooth=True, sharp_angle=40):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = tuple(math.radians(a) for a in rotation)
        if smooth:
            self.smooth(obj, sharp_angle)
        if material is not None:
            me.materials.append(material)
        return obj

    def smooth(self, obj, angle=40):
        me = obj.data
        try:
            me.shade_smooth()
        except AttributeError:
            for p in me.polygons:
                p.use_smooth = True
        try:
            me.set_sharp_from_angle(angle=math.radians(angle))  # 4.1+
        except (AttributeError, TypeError):
            try:
                me.use_auto_smooth = True  # до 4.1
                me.auto_smooth_angle = math.radians(angle)
            except AttributeError:
                pass

    def bevel(self, obj, width, segments=4):
        if width <= 0:
            return obj
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = width
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30)
        try:
            mod.harden_normals = True
        except AttributeError:
            pass
        return obj

    def _bm(self):
        bm = bmesh.new()
        bm.loops.layers.uv.new("UVMap")
        return bm

    def box(self, size=(1, 1, 1), bevel=0.04, material=None, location=(0, 0, 0), rotation=(0, 0, 0), name="box", subdiv=0):
        """Брусок со скруглёнными рёбрами (фаска модификатором — в GLB применяется). subdiv > 0 — грани сеткой
        (для ctx.deform: пухлый пакет, подушка)."""
        bm = self._bm()
        bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
        if subdiv:
            bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=int(subdiv), use_grid_fill=True)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        obj = self._mesh_obj(name, bm, material or self.clay(), location, rotation)
        return self.bevel(obj, min(bevel, min(size) * 0.49))

    def card(self, w=1.6, h=1.0, t=0.03, corner=0.08, material=None, location=(0, 0, 0), rotation=(0, 0, 0), name="card", segments=8):
        """Карточка со скруглёнными углами в плане и мягкой кромкой."""
        bm = self._bm()
        r = min(corner, w / 2 - 1e-4, h / 2 - 1e-4)
        pts = []
        for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
            for i in range(segments + 1):
                a = math.radians(a0 + 90.0 * i / segments)
                pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        bot = [bm.verts.new((x, y, -t / 2)) for x, y in pts]
        top = [bm.verts.new((x, y, t / 2)) for x, y in pts]
        bm.faces.new(list(reversed(bot)))
        bm.faces.new(top)
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
        uv = bm.loops.layers.uv.active
        for f in bm.faces:
            for loop in f.loops:
                co = loop.vert.co
                loop[uv].uv = (co.x / w + 0.5, co.y / h + 0.5)
        obj = self._mesh_obj(name, bm, material or self.satin(), location, rotation, sharp_angle=60)
        return self.bevel(obj, min(t * 0.3, 0.01), segments=3)

    def cylinder(self, radius=0.5, depth=1.0, bevel=0.02, segments=64, material=None, location=(0, 0, 0), rotation=(0, 0, 0), name="cylinder", radius_top=None, caps=True):
        """Цилиндр или конус (radius_top). caps=False — открытая трубка (этикетка, обечайка)."""
        bm = self._bm()
        r2 = radius if radius_top is None else radius_top
        try:
            bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segments, radius1=radius, radius2=r2, depth=depth, calc_uvs=True)
        except TypeError:
            bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segments, diameter1=radius, diameter2=r2, depth=depth, calc_uvs=True)
        obj = self._mesh_obj(name, bm, material or self.clay(), location, rotation, sharp_angle=40 if caps else 180)
        return self.bevel(obj, min(bevel, radius * 0.4, depth * 0.45)) if caps else obj

    def solidify(self, obj, thickness, offset=-1.0):
        """Толщина стенки: стекло банки, ткань, тонкая оболочка."""
        mod = obj.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = thickness
        mod.offset = offset
        try:
            mod.use_even_offset = True
        except AttributeError:
            pass
        return obj

    def sphere(self, radius=0.5, material=None, location=(0, 0, 0), rotation=(0, 0, 0), name="sphere", segments=64, arc=1.0):
        """Шар. arc < 1 — открытая чаша: доля от верхнего полюса вниз (0.5 — полусфера); толщину даёт ctx.solidify."""
        if arc < 1.0:
            rings = max(4, int(segments / 2 * arc))
            verts, faces, uvs = [(0.0, 0.0, radius)], [], [(0.5, 1.0)]
            for i in range(1, rings + 1):
                th = math.pi * arc * i / rings
                for j in range(segments):
                    ph = 2 * math.pi * j / segments
                    verts.append((radius * math.sin(th) * math.cos(ph), radius * math.sin(th) * math.sin(ph), radius * math.cos(th)))
                    uvs.append((j / float(segments), 1 - i / float(rings)))
            for j in range(segments):
                faces.append((0, 1 + j, 1 + (j + 1) % segments))
            for i in range(rings - 1):
                for j in range(segments):
                    a, b = 1 + i * segments + j, 1 + i * segments + (j + 1) % segments
                    faces.append((a, a + segments, b + segments, b))
            return self.mesh(verts, faces, material or self.clay(), uvs, None, location, rotation, name)
        bm = self._bm()
        try:
            bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments // 2, radius=radius, calc_uvs=True)
        except TypeError:
            bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments // 2, diameter=radius, calc_uvs=True)
        return self._mesh_obj(name, bm, material or self.clay(), location, rotation, sharp_angle=180)

    def torus(self, major=0.5, minor=0.12, material=None, location=(0, 0, 0), rotation=(0, 0, 0), name="torus", seg_major=96, seg_minor=32):
        bm = self._bm()
        rings = []
        for i in range(seg_major):
            u = 2 * math.pi * i / seg_major
            ring = []
            for j in range(seg_minor):
                v = 2 * math.pi * j / seg_minor
                rr = major + minor * math.cos(v)
                ring.append(bm.verts.new((rr * math.cos(u), rr * math.sin(u), minor * math.sin(v))))
            rings.append(ring)
        uv = bm.loops.layers.uv.active
        for i in range(seg_major):
            for j in range(seg_minor):
                a, b2 = rings[i][j], rings[(i + 1) % seg_major][j]
                c, d = rings[(i + 1) % seg_major][(j + 1) % seg_minor], rings[i][(j + 1) % seg_minor]
                f = bm.faces.new((a, b2, c, d))
                for loop, (uu, vv) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                    loop[uv].uv = (uu / float(seg_major), vv / float(seg_minor))
        return self._mesh_obj(name, bm, material or self.gloss(), location, rotation, sharp_angle=180)

    def plane(self, size=(2, 2), material=None, location=(0, 0, 0), rotation=(0, 0, 0), name="plane", subdiv=1):
        bm = self._bm()
        bmesh.ops.create_grid(bm, x_segments=max(1, subdiv), y_segments=max(1, subdiv), size=0.5, calc_uvs=True)
        bmesh.ops.scale(bm, vec=Vector((size[0], size[1], 1)), verts=bm.verts)
        return self._mesh_obj(name, bm, material or self.paper(), location, rotation, smooth=subdiv > 1, sharp_angle=180)

    def mesh(self, verts, faces, material=None, uvs=None, colors=None, location=(0, 0, 0), rotation=(0, 0, 0), name="mesh", sharp_angle=180, vcol="Col"):
        """Своя сетка: verts — [(x, y, z)], faces — [(i, j, k, l)]; uvs — (u, v) на каждую вершину; colors —
        линейные (r, g, b) на каждую вершину (ctx.color(...)[:3]) в атрибут vcol — материал читает его при vcol="Col"."""
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
        me.update()
        if uvs is not None:
            layer = me.uv_layers.new(name="UVMap")
            for loop in me.loops:
                layer.data[loop.index].uv = uvs[loop.vertex_index]
        if colors is not None:
            attr = me.color_attributes.new(vcol, "FLOAT_COLOR", "POINT")
            flat = []
            for c in colors:
                flat.extend((c[0], c[1], c[2], 1.0))
            attr.data.foreach_set("color", flat)
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = tuple(math.radians(a) for a in rotation)
        self.smooth(obj, sharp_angle)
        if material is not None:
            me.materials.append(material)
        return obj

    def prism(self, outline, depth=0.2, hole=None, bevel=0.03, material=None, location=(0, 0, 0), rotation=(0, 0, 0), name="prism"):
        """Пластина по контуру: outline — [(x, y)] против часовой, толщина depth по Z, центр по толщине в нуле.
        hole — контур отверстия с тем же числом точек (стенка ячейки сот, рамка, кольцо). Контуры — hex_points,
        rounded_polygon из studio или свои."""
        bm = self._bm()
        z0, z1 = -depth / 2.0, depth / 2.0
        ob = [bm.verts.new((x, y, z0)) for x, y in outline]
        ot = [bm.verts.new((x, y, z1)) for x, y in outline]
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        if hole:
            if len(hole) != n:
                raise ValueError("prism: у отверстия должно быть столько же точек, сколько у контура (%d, а не %d)" % (n, len(hole)))
            hb = [bm.verts.new((x, y, z0)) for x, y in hole]
            ht = [bm.verts.new((x, y, z1)) for x, y in hole]
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((hb[j], hb[i], ht[i], ht[j]))      # стенка отверстия смотрит внутрь
                bm.faces.new((ot[i], ot[j], ht[j], ht[i]))      # верхнее кольцо
                bm.faces.new((ob[j], ob[i], hb[i], hb[j]))      # нижнее кольцо
        else:
            bm.faces.new(ot)
            bm.faces.new(list(reversed(ob)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        uv = bm.loops.layers.uv.active
        xs, ys = [p[0] for p in outline], [p[1] for p in outline]
        w, h = (max(xs) - min(xs)) or 1.0, (max(ys) - min(ys)) or 1.0
        for f in bm.faces:
            for loop in f.loops:
                loop[uv].uv = ((loop.vert.co.x - min(xs)) / w, (loop.vert.co.y - min(ys)) / h)
        obj = self._mesh_obj(name, bm, material or self.clay(), location, rotation, sharp_angle=40)
        return self.bevel(obj, min(bevel, depth * 0.45), segments=4)

    def tube(self, points, radius=0.06, material=None, segments=80, radial=18, caps=True, location=(0, 0, 0), rotation=(0, 0, 0), name="tube"):
        """Трубка по сглаженной кривой через points. radius — число или функция от доли длины 0…1 (стебель к верху
        тоньше). UV: u — вдоль, v — вокруг."""
        path = [Vector(p) for p in catmull(points, segments)]
        rad = radius if callable(radius) else (lambda u: radius)
        nrm = None
        verts, uvs, faces = [], [], []
        for i, c in enumerate(path):
            t = (path[min(i + 1, segments)] - path[max(i - 1, 0)]).normalized()
            if nrm is None:
                nrm = t.orthogonal().normalized()
            nrm = (nrm - t * nrm.dot(t)).normalized()          # перенос рамки вдоль кривой: трубка не перекручивается
            bi = t.cross(nrm)
            r = rad(i / float(segments))
            for j in range(radial):
                a = 2 * math.pi * j / radial
                verts.append(tuple(c + (nrm * math.cos(a) + bi * math.sin(a)) * r))
                uvs.append((i / float(segments), j / float(radial)))
        for i in range(segments):
            for j in range(radial):
                a, b = i * radial + j, i * radial + (j + 1) % radial
                faces.append((a, b, b + radial, a + radial))
        if caps:
            faces.append(tuple(reversed(range(radial))))
            faces.append(tuple(range(segments * radial, (segments + 1) * radial)))
        return self.mesh(verts, faces, material or self.gloss(), uvs, None, location, rotation, name, sharp_angle=60)

    def leaf(self, length=2.0, width=1.0, thick=0.16, curl=0.25, fold=0.18, tip=0.55, twist=0.0, veins=9, material=None,
             location=(0, 0, 0), rotation=(0, 0, 0), name="leaf", segments=96):
        """Лист: основание в начале координат, тянется вдоль +X, лицевая сторона вверх (+Z). Заострён к кончику
        (tip), загнут вверх (curl), сложен по жилке (fold), прожилки ёлочкой рельефом (veins), twist — скрутка, рад."""
        rings = segments // 2
        verts, faces = [], []
        for i in range(rings + 1):
            th = math.pi * i / rings
            for j in range(segments):
                ph = 2 * math.pi * j / segments
                sx, sy, sz = math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)
                u = (sx + 1) / 2.0
                taper = 1 - tip * u ** 2.2
                base = 0.55 + 0.45 * min(1.0, u * 4)
                y = sy * (width / 2.0) * taper * base
                z = sz * (thick / 2.0) * (0.6 + 0.4 * math.sin(math.pi * u))
                z += fold * abs(y)
                if veins and sz > 0:
                    side = abs(sy)
                    rib = (0.5 + 0.5 * math.cos((u * veins - side * 2.2) * 2 * math.pi)) ** 6
                    z -= thick * 0.11 * rib * min(1.0, side * 5) * math.sin(math.pi * u) + thick * 0.2 * math.exp(-side * side * 420) * math.sin(math.pi * min(1.0, u * 1.15))
                z += curl * length * u * u
                if twist:
                    a = twist * u
                    y, z = y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)
                verts.append((u * length, y, z))
        for i in range(rings):
            for j in range(segments):
                a, b = i * segments + j, i * segments + (j + 1) % segments
                faces.append((a, b, b + segments, a + segments))
        obj = self.mesh(verts, faces, material or self.leafy(), None, None, location, rotation, name)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)   # полюса сферы — в одну вершину
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(obj.data)
        bm.free()
        return obj

    def deform(self, obj, fn):
        """Сдвинуть вершины сетки: fn(x, y, z) → (x, y, z) в координатах предмета (пухлый пакет, капля, семя)."""
        for v in obj.data.vertices:
            v.co = fn(v.co.x, v.co.y, v.co.z)
        obj.data.update()
        return obj

    def group(self, objs, location=(0, 0, 0), rotation=(0, 0, 0), scale=1.0, order="XYZ"):
        """Повернуть, сдвинуть и растянуть собранную вещь целиком (вокруг начала координат): rotation — градусы,
        order — порядок осей Эйлера (XYZ — сначала вокруг X; ZYX — сначала вокруг Z)."""
        from mathutils import Euler, Matrix
        m = Matrix.Translation(Vector(location)) @ Euler(tuple(math.radians(a) for a in rotation), order).to_matrix().to_4x4() @ Matrix.Scale(scale, 4)
        for o in objs:
            o.matrix_basis = m @ o.matrix_basis
        return objs

    def stand(self, objs, tilt=(0, 0, 0)):
        """Вещь собрана лёжа — в плоскости XY лицом вверх (+Z), как рисуют на листе: поставить лицом к камере.
        tilt — наклон в градусах уже в кадре: (назад, поворот вбок, крен)."""
        self.group(objs, rotation=(0, 0, tilt[2]))
        self.group(objs, rotation=(0, tilt[1], 0))
        self.group(objs, rotation=(90 + tilt[0], 0, 0))
        return objs

    def center(self, objs):
        """Сдвинуть собранную вещь так, чтобы середина её рамки встала в начало координат."""
        c = bounds(objs)[0]
        return self.group(objs, location=(-c.x, -c.y, -c.z))

    def curve(self, points, n=64):
        """n + 1 точек по сглаженной кривой через points (Catmull-Rom) — путь для своей сетки."""
        return catmull(points, n)

    def palette(self, **defaults):
        """Цвета сцены по именам: значения по умолчанию, которые перекрывает --palette. Сцена зовёт один раз в
        начале build и дальше берёт цвета по именам — сайт подставляет свои."""
        self.PAL = merge_palette(merge_palette(self.PAL, defaults), self.job.get("palette") or {})
        return self.PAL

    def text(self, body, size=0.4, depth=0.04, material=None, location=(0, 0, 0), rotation=(0, 0, 0), font=None, name="text"):
        """Объёмная надпись → сразу сетка (в GLB уходит только сетка). Кириллица — шрифтом font=путь.ttf/otf."""
        cu = bpy.data.curves.new(name, "FONT")
        cu.body = str(body)
        cu.size = size
        cu.extrude = depth / 2
        cu.bevel_depth = min(depth * 0.15, size * 0.02)
        cu.align_x = "CENTER"
        cu.align_y = "CENTER"
        if font:
            try:
                cu.font = bpy.data.fonts.load(font, check_existing=True)
            except (RuntimeError, OSError) as e:
                self.warn("шрифт %s не загрузился (%s) — встроенный; кириллица может не отрисоваться" % (font, e))
        tmp = bpy.data.objects.new(name + "-curve", cu)
        bpy.context.scene.collection.objects.link(tmp)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
        bpy.data.objects.remove(tmp, do_unlink=True)
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = tuple(math.radians(a) for a in rotation)
        me.materials.clear()
        me.materials.append(material or self.gloss("ink"))
        self.smooth(obj, 30)
        return obj

    def import_model(self, file, location=(0, 0, 0), rotation=(0, 0, 0), scale=1.0):
        """Своя модель владельца: glb/gltf/obj/fbx/stl/ply. → список новых объектов."""
        file = os.path.abspath(file)
        if not os.path.isfile(file):
            raise RuntimeError("нет файла модели: " + file)
        before = set(bpy.data.objects)
        ext = os.path.splitext(file)[1].lower()
        if ext in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=file)
        elif ext == ".obj":
            bpy.ops.wm.obj_import(filepath=file)
        elif ext == ".fbx":
            bpy.ops.import_scene.fbx(filepath=file)
        elif ext == ".stl":
            try:
                bpy.ops.wm.stl_import(filepath=file)
            except AttributeError:
                bpy.ops.import_mesh.stl(filepath=file)
        elif ext == ".ply":
            bpy.ops.wm.ply_import(filepath=file)
        else:
            raise RuntimeError("формат %s не поддержан: glb, gltf, obj, fbx, stl, ply" % ext)
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.type in ("CAMERA", "LIGHT"):
                bpy.data.objects.remove(o, do_unlink=True)
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.parent is None:
                o.location = Vector(o.location) * scale + Vector(location)
                o.scale = Vector(o.scale) * scale
                if any(rotation):
                    o.rotation_mode = "XYZ"
                    o.rotation_euler = tuple(math.radians(a) for a in rotation)
        return new

    # ---------- служебное: земля, подложка ----------
    def floor(self, z=0.0, size=None, collide=True, friction=0.7, bounce=0.3):
        """Земля под стоящими предметами: в кадре видна только тень (shadow catcher), для физики — опора.
        В GLB не уходит (служебная)."""
        s = size or 60.0
        obj = self.plane((s, s), material=self._floor_mat(), location=(0, 0, z), name="floor")
        _role(obj, "helper")
        try:
            obj.is_shadow_catcher = True
        except AttributeError:
            self.warn("у этой версии Blender нет is_shadow_catcher — земля будет видна")
        if collide:
            from physics import passive, collider
            passive(obj, friction=friction, bounce=bounce, shape="MESH")  # плоскость как BOX толщины не имеет
            collider(obj)
        return obj

    def _floor_mat(self):
        # отражённый от «пола» свет — цветом поля сайта: предмет подсвечен снизу тем же тоном, что фон страницы
        return self.clay(self.PAL.get("bg", "#EFEBE4"), roughness=0.9, coat=0.0)

    def backdrop(self, z, radius):
        """Бесшовная подложка-циклорама цвета bg: пол плавно переходит в стену за предметом."""
        R = radius
        bm = self._bm()
        prof = [(y, z) for y in (-8 * R, -4 * R, -1 * R, 1.5 * R)]
        rc = 2.5 * R
        for i in range(1, 13):
            a = math.radians(90.0 * i / 12)
            prof.append((1.5 * R + rc * math.sin(a), z + rc * (1 - math.cos(a))))
        prof.append((1.5 * R + rc, z + 9 * R))
        xs = (-10 * R, 10 * R)
        rows = [[bm.verts.new((x, y, zz)) for (y, zz) in prof] for x in xs]
        for i in range(len(prof) - 1):
            bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
        obj = self._mesh_obj("backdrop", bm, self.clay(self.PAL.get("bg"), roughness=0.95, coat=0.0), sharp_angle=180)
        return _role(obj, "helper")

    def helper(self, obj):
        """Служебный предмет: в рамку камеры и в GLB не входит (опора-невидимка, коллайдер)."""
        return _role(obj, "helper")

    # ---------- физика (physics.py) ----------
    def rigid(self, obj, **kw):
        """Падающий предмет: mass, friction, bounce, shape (BOX для карточек и коробок), margin."""
        import physics
        return physics.rigid(obj, **kw)

    def passive(self, obj, **kw):
        """Неподвижная опора: полка, ступень (shape BOX для досок, MESH — точная форма)."""
        import physics
        return physics.passive(obj, **kw)

    def collider(self, obj, **kw):
        """Препятствие для ткани."""
        import physics
        return physics.collider(obj, **kw)

    def cloth(self, obj, preset="cotton", **kw):
        """Ткань из сетки ctx.plane(..., subdiv=64): silk, cotton, linen, denim, leather."""
        import physics
        kw.setdefault("frames", self.frames)
        return physics.cloth(obj, preset, **kw)


# --------------------------------------------------------------------------------------------
# Свет, камера, рендер
# --------------------------------------------------------------------------------------------

def bounds(objs):
    """Рамка предметов в мире: (центр, радиус описанной сферы, min, max) по вычисленной геометрии."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(dg)
        for c in ev.bound_box:
            pts.append(ev.matrix_world @ Vector(c))
    return bounds_of(pts)


def bounds_of(pts):
    if not pts:
        raise RuntimeError("сцена ничего не построила: нет ни одного предмета с геометрией")
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    radius = max((p - center).length for p in pts)
    return center, max(radius, 1e-3), lo, hi, pts


def _look(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def _area(name, size_x, size_y, power, color, location, target):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "RECTANGLE"
    ld.size = size_x
    ld.size_y = size_y
    ld.energy = power
    ld.color = linear_rgba(color)[:3]
    try:
        ld.use_shadow = True
    except AttributeError:
        pass
    obj = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    _look(obj, target)
    try:
        obj.visible_camera = False  # софтбокс за предметом не должен попасть в кадр прямоугольником
    except AttributeError:
        pass
    return _role(obj, "helper")


def softboxes(center, radius, key=1.0, fill=1.0, rim=1.0, view=(0.35, -1.0, 0.3)):
    """Студия как в stage.html: верхний тёплый ключевой софтбокс, длинные полосы слева и справа (блики вдоль
    рёбер), контровой сзади сверху, слабое заполнение от камеры. Положение — в долях радиуса рамки предметов,
    мощность — от расстояния: кадр одинаково освещён и у монеты, и у шкафа.
    Оси Blender: Z вверх, камера по умолчанию со стороны −Y."""
    C, R = Vector(center), radius
    side = Vector((view[0], view[1], 0))
    if side.length < 1e-6:
        side = Vector((0, -1, 0))
    side.normalize()
    right = Vector((-side.y, side.x, 0))  # вправо, если смотреть с камеры

    def at(f_side, f_right, f_up, k):
        return C + (side * f_side + right * f_right + Vector((0, 0, f_up))).normalized() * (k * R)

    rig = [
        # имя, (вперёд, вправо, вверх), расстояние в R, ширина × высота в R, целевая яркость белого, цвет
        ("key", (0.55, -0.55, 1.1), 6.5, (2.6, 2.0), 0.72 * key, "#FFF4E0"),
        ("strip-left", (0.3, -1.0, 0.18), 7.0, (0.55, 4.6), 0.22 * fill, "#FFFFFF"),
        ("strip-right", (0.45, 1.0, 0.12), 7.0, (0.4, 3.6), 0.16 * fill, "#F4F8FF"),
        ("rim", (-1.0, 0.25, 0.65), 6.0, (3.6, 0.8), 0.34 * rim, "#FFFFFF"),
        ("front-fill", (1.0, 0.0, 0.05), 8.0, (2.0, 1.3), 0.07 * fill, "#FFFFFF"),
    ]
    out = []
    for name, (a, b, c), k, (sx, sy), L, col in rig:
        pos = at(a, b, c, k)
        out.append(_area(name, sx * R, sy * R, light_power(L, k * R), col, pos, C))
    return out


def world_dome(color="#5D6658", strength=0.16):
    """Тёмный купол: слабый рассеянный свет и тёмные отражения — блик от софтбокса читается на лаке."""
    w = bpy.context.scene.world or bpy.data.worlds.new("studio")
    bpy.context.scene.world = w
    try:
        w.use_nodes = True
    except (AttributeError, TypeError):
        pass
    bg = next((n for n in w.node_tree.nodes if n.type == "BACKGROUND"), None)
    if bg is not None:
        set_input(bg, "Color", linear_rgba(color))
        set_input(bg, "Strength", strength)
    return w


def bounce_plane(center, radius, color):
    """Отсвет «поля» снизу для парящего предмета (без земли): светящаяся плоскость, невидимая камере."""
    st = bpy.context.scene
    m = bpy.data.materials.new("bounce")
    try:
        m.use_nodes = True
    except (AttributeError, TypeError):
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    em = nt.nodes.new("ShaderNodeEmission")
    set_input(em, "Color", linear_rgba(color))
    set_input(em, "Strength", 0.35)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs[0])
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=radius * 6)
    me = bpy.data.meshes.new("bounce")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(m)
    obj = bpy.data.objects.new("bounce", me)
    st.collection.objects.link(obj)
    obj.location = Vector(center) + Vector((0, 0, -radius * 3.5))
    try:
        obj.visible_camera = False
        obj.visible_shadow = False
    except AttributeError:
        pass
    return _role(obj, "helper")


def outline_points(objs, limit=12000):
    """Вершины вычисленной геометрии предметов в мире (не больше limit, с равным шагом): по ним камера видит
    настоящий силуэт, а не углы рамок — у цилиндра и шара углы рамки торчат далеко за предмет."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(dg)
        try:
            me = ev.to_mesh()
        except RuntimeError:
            me = None
        if me is None or not len(me.vertices):
            pts.extend(ev.matrix_world @ Vector(c) for c in ev.bound_box)
            continue
        mw = ev.matrix_world.copy()
        pts.extend(mw @ v.co for v in me.vertices)
        ev.to_mesh_clear()
    if len(pts) > limit:
        step = len(pts) / float(limit)
        pts = [pts[int(i * step)] for i in range(limit)]
    return pts


def camera_fit(objs, width, height, view=(0.35, -1.0, 0.3), fov=28.0, margin=DEFAULT_MARGIN, target=None, distance=None, points=None):
    """Камера по предметам: сначала по описанной сфере, затем уточнение по проекции вершин — предмет по центру
    кадра (сдвиг объектива, без перекоса перспективы) и с полем со всех сторон: по большей стороне предмет
    занимает 1/margin кадра (margin 1.19 — поля по 8 %). Свои distance и target — рамка как задано (ленты)."""
    from bpy_extras.object_utils import world_to_camera_view
    scene = bpy.context.scene
    cd = bpy.data.cameras.new("camera")
    cd.sensor_fit = "AUTO"
    cd.angle = math.radians(fov)
    cam = bpy.data.objects.new("camera", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    center, R, lo, hi, pts = bounds_of(points) if points else bounds(objs)
    tgt = Vector(target) if target else center
    d = Vector(view)
    if d.length < 1e-6:
        d = Vector((0.35, -1.0, 0.3))
    d.normalize()
    dist = distance or fit_distance(R, fov, width, height, margin)

    def place(k):
        cam.location = tgt + d * k
        _look(cam, tgt)
        cd.clip_start = max(0.001, k - R * 3)
        cd.clip_end = k + R * 6
        bpy.context.view_layer.update()

    place(dist)
    if not points:
        pts = outline_points(objs)
    field = None
    if not distance and not target:
        big = float(max(width, height))
        for _ in range(6):
            ps = [world_to_camera_view(scene, cam, p) for p in pts]
            ps = [p for p in ps if p.z > 0]
            if not ps:
                break
            x0, x1 = min(p.x for p in ps), max(p.x for p in ps)
            y0, y1 = min(p.y for p in ps), max(p.y for p in ps)
            cd.shift_x += ((x0 + x1) / 2 - 0.5) * (width / big)
            cd.shift_y += ((y0 + y1) / 2 - 0.5) * (height / big)
            span = max(x1 - x0, y1 - y0)
            if span <= 0:
                break
            dist *= span * margin
            place(dist)
    ps = [world_to_camera_view(scene, cam, p) for p in pts]
    ps = [p for p in ps if p.z > 0]
    if ps:
        field = round(frame_margins([(p.x, p.y) for p in ps]), 4)
    return cam, dict(center=list(center), radius=R, distance=dist, zmin=lo.z, shift=[cd.shift_x, cd.shift_y], field=field)


def setup_render(job, warn):
    """Cycles, размер, сэмплы, денойз, прозрачная плёнка, тональная кривая. → сведения для протокола."""
    scene = bpy.context.scene
    r = scene.render
    info = {}
    engine = job.get("engine", "cycles")
    if engine == "eevee":
        for name in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
            try:
                r.engine = name
                info["engine"] = name
                break
            except TypeError:
                continue
    else:
        r.engine = "CYCLES"
        info["engine"] = "CYCLES"
        cy = scene.cycles
        cy.samples = int(job.get("samples", 256))
        try:
            cy.use_adaptive_sampling = True
            cy.adaptive_threshold = 0.01
        except AttributeError:
            pass
        cy.use_denoising = bool(job.get("denoise", True))
        if cy.use_denoising:
            try:
                cy.denoiser = "OPENIMAGEDENOISE"
                cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
                cy.denoising_prefilter = "ACCURATE"
            except (AttributeError, TypeError):
                pass
            try:
                cy.denoising_use_gpu = True  # 4.1+: OIDN на видеокарте, если она есть
            except AttributeError:
                pass
        cy.max_bounces = 12
        cy.diffuse_bounces = 4
        cy.glossy_bounces = 6
        cy.transmission_bounces = 12
        cy.transparent_max_bounces = 16
        cy.caustics_reflective = False
        cy.caustics_refractive = False
        try:
            cy.blur_glossy = 0.5  # меньше светлячков на лаке
        except AttributeError:
            pass
        cy.seed = int(job.get("seed") or 7)
        try:
            cy.film_transparent_glass = True
        except AttributeError:
            pass
        info["device"] = setup_device(job.get("device", "auto"), warn)
        info["samples"] = cy.samples
        info["denoise"] = cy.use_denoising
    r.resolution_x = int(job.get("w", 1000))
    r.resolution_y = int(job.get("h", 1000))
    r.resolution_percentage = 100
    r.film_transparent = not job.get("backdrop")
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA" if r.film_transparent else "RGB"
    r.image_settings.color_depth = "8"
    try:
        r.image_settings.compression = 15
    except AttributeError:
        pass
    vs = scene.view_settings
    try:
        scene.display_settings.display_device = "sRGB"
    except TypeError:
        pass
    tone = job.get("tone", "neutral")
    for name in TONES.get(tone, TONES["neutral"]):
        try:
            vs.view_transform = name
            info["view_transform"] = name
            break
        except TypeError:
            continue
    if info.get("view_transform") and TONES.get(tone, ("",))[0] != info["view_transform"]:
        warn("тональной кривой «%s» в этой версии нет — взята %s" % (TONES.get(tone, ("?",))[0], info["view_transform"]))
    look = job.get("look")
    if look:
        for cand in (look, "%s - %s" % (info.get("view_transform", ""), look)):
            try:
                vs.look = cand
                info["look"] = cand
                break
            except TypeError:
                continue
        else:
            warn("look «%s» не найден — без него" % look)
    vs.exposure = float(job.get("exposure", 0.0))
    vs.gamma = 1.0
    return info


def setup_device(want, warn):
    """GPU, если есть (OptiX, CUDA, HIP, Metal, oneAPI), иначе CPU. → {'device', 'type', 'names'}."""
    scene = bpy.context.scene
    scene.cycles.device = "CPU"
    if want == "cpu":
        return {"device": "CPU", "type": "CPU", "names": []}
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        warn("дополнение Cycles не включено — считаем на процессоре")
        return {"device": "CPU", "type": "CPU", "names": []}
    found = list_gpus(prefs)
    if found:
        t, devs = found[0]
        prefs.compute_device_type = t
        try:
            prefs.refresh_devices()
        except AttributeError:
            pass
        for d in prefs.devices:
            d.use = d.type == t
        scene.cycles.device = "GPU"
        return {"device": "GPU", "type": t, "names": devs}
    if want == "gpu":
        warn("--device gpu: видеокарта для Cycles не найдена (OptiX, CUDA, HIP, Metal, oneAPI) — считаем на процессоре")
    try:
        prefs.compute_device_type = "NONE"
    except TypeError:
        pass
    return {"device": "CPU", "type": "CPU", "names": []}


def list_gpus(prefs):
    """[(тип, [имена устройств])] по убыванию предпочтения. Перебирает типы, которые знает эта сборка."""
    out = []
    for t in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = t
        except TypeError:
            continue
        try:
            prefs.refresh_devices()
        except AttributeError:
            try:
                prefs.get_devices()
            except Exception:
                pass
        names = [d.name for d in prefs.devices if d.type == t]
        if names:
            out.append((t, names))
    return out


def scene_stats(objs):
    """Треугольники и вершины вычисленной геометрии (с модификаторами)."""
    dg = bpy.context.evaluated_depsgraph_get()
    tris = verts = 0
    for o in objs:
        ev = o.evaluated_get(dg)
        try:
            me = ev.to_mesh()
        except RuntimeError:
            continue
        if me is None:
            continue
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        verts += len(me.vertices)
        ev.to_mesh_clear()
    return {"objects": len(objs), "triangles": tris, "vertices": verts}


def light_scene(ctx, opt, width, height):
    """Свет, земля, камера по ответу сцены opt = { view, fov, margin, ground, target, distance, key, fill, rim }."""
    objs = items()
    center, R, lo, hi, _ = bounds(objs)  # свет и земля — по предметам на текущем кадре
    view = tuple(opt.get("view") or (0.35, -1.0, 0.3))
    world_dome()
    softboxes(center, R, key=opt.get("key", 1.0), fill=opt.get("fill", 1.0), rim=opt.get("rim", 1.0), view=view)
    has_floor = any(o.name.startswith("floor") and is_helper(o) for o in bpy.context.scene.objects)
    if ctx.job.get("backdrop"):
        ctx.backdrop(lo.z, R)
    elif opt.get("ground") and not has_floor:
        g = ctx.floor(z=lo.z, size=R * 20, collide=False)
        g.location = (center.x, center.y, lo.z - R * 0.0005)  # чуть ниже дна: без мерцания совпавших граней
    elif not opt.get("ground") and not has_floor:
        bounce_plane(center, R, ctx.PAL.get("bg", "#EFEBE4"))
    cam, cinfo = camera_fit(objs, width, height, view=view, fov=float(opt.get("fov", 28)), margin=float(opt.get("margin") or DEFAULT_MARGIN),
                            target=opt.get("target"), distance=opt.get("distance"), points=opt.get("points"))
    cinfo["bleed"] = bool(opt.get("bleed"))   # сцена сама выводит предмет за край (лента через весь кадр)
    cinfo["ground"] = bool((opt.get("ground") or has_floor) and not ctx.job.get("backdrop"))   # тень на земле: --trim режет по предмету
    return cam, cinfo


# --------------------------------------------------------------------------------------------
# Сцена из JSON
# --------------------------------------------------------------------------------------------

def build_from_spec(ctx, spec, base_dir):
    """Сцена-описание JSON → предметы. Ответ — как у build(ctx) модуля."""
    errs = validate_spec(spec)
    if errs:
        raise RuntimeError("сцена JSON: " + "; ".join(errs))
    from physics import rigid, passive, collider, cloth
    ctx.PAL = merge_palette(ctx.PAL, spec.get("palette") or {})
    ctx.PAL = merge_palette(ctx.PAL, ctx.job.get("palette") or {})  # флаг важнее файла
    floor_needed = False
    for o in spec["objects"]:
        t = o["type"]
        kind = o.get("material") or {"box": "clay", "card": "satin", "cylinder": "clay", "sphere": "gloss", "torus": "gloss",
                                     "plane": "paper", "cloth": "fabric", "text": "gloss"}.get(t, "clay")
        extra = {"image": o["image"] if os.path.isabs(o["image"]) else os.path.join(base_dir, o["image"])} if kind == "printed" else {}
        mat = ctx.material(kind, o.get("color"), **extra) if t != "import" else None
        loc = tuple(o.get("location", (0, 0, 0)))
        rot = tuple(o.get("rotation", (0, 0, 0)))
        made = []
        if t == "box":
            made = [ctx.box(tuple(o.get("size", (1, 1, 1))), o.get("bevel", 0.04), mat, loc, rot)]
        elif t == "card":
            sz = o.get("size", (1.6, 1.0, 0.03))
            made = [ctx.card(sz[0], sz[1], sz[2], o.get("corner", 0.08), mat, loc, rot)]
        elif t == "cylinder":
            made = [ctx.cylinder(o.get("radius", 0.5), o.get("depth", 1.0), o.get("bevel", 0.02), material=mat, location=loc, rotation=rot, radius_top=o.get("radius_top"))]
        elif t == "sphere":
            made = [ctx.sphere(o.get("radius", 0.5), mat, loc, rot)]
        elif t == "torus":
            made = [ctx.torus(o.get("major", 0.5), o.get("minor", 0.12), mat, loc, rot)]
        elif t == "plane":
            made = [ctx.plane(tuple(o.get("size", (2, 2))), mat, loc, rot)]
        elif t == "text":
            font = o.get("font")
            if font and not os.path.isabs(font):
                font = os.path.join(base_dir, font)
            made = [ctx.text(o["text"], o.get("size", 0.4), o.get("depth", 0.04), mat, loc, rot, font)]
        elif t == "cloth":
            sz = o.get("size", (2, 2))
            p = ctx.plane(tuple(sz), mat, loc, rot, name="cloth", subdiv=int(o.get("subdiv", 64)))
            cloth(p, o.get("preset", "cotton"), frames=ctx.frames)
            made = [p]
        elif t == "import":
            f = o["file"] if os.path.isabs(o["file"]) else os.path.join(base_dir, o["file"])
            made = ctx.import_model(f, loc, rot, float(o.get("scale", 1.0)))
        for m in made:
            if o.get("name"):
                m.name = o["name"]
            rb = o.get("rigid")
            if rb:
                rb = rb if isinstance(rb, dict) else {}
                rigid(m, mass=rb.get("mass", 1.0), friction=rb.get("friction", 0.6), bounce=rb.get("bounce", 0.1), shape=rb.get("shape", "CONVEX_HULL"))
                floor_needed = True
            if o.get("passive"):
                passive(m, shape=o.get("shape", "MESH"))
            if o.get("collider"):
                collider(m)
            if t == "cloth":
                floor_needed = True
            if o.get("helper"):
                ctx.helper(m)
    cam = spec.get("camera") or {}
    phys = spec.get("physics") or {}
    if floor_needed or phys:
        ctx.floor(z=float(phys.get("floor", 0.0)))
    opt = {"view": cam.get("view"), "fov": cam.get("fov", 28), "margin": cam.get("margin"), "ground": spec.get("ground", True)}
    if phys.get("frames"):
        opt["frames"] = int(phys["frames"])
    return {k: v for k, v in opt.items() if v is not None}
