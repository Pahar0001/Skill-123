# -*- coding: utf-8 -*-
"""
Ребристая глянцевая лента по кривой — декор первого экрана и секций (образец сцены для blender.mjs).

    node blender.mjs render templates/blender/ribbon.py --variant wave --w 1440 --h 640 --out out --bg EFEBE4 --small 960
    node blender.mjs render templates/blender/ribbon.py --variant arc,loop,curl --w 900 --h 900 --out out --bg EFEBE4
    node blender.mjs render templates/blender/ribbon.py --palette "ridge=#C8553D,mid=#8E2F1F,valley=#3A0F0A,edge=#F4B9A6,warm=#E2893A"

Варианты: wave — широкая волна через весь кадр 2:1, концы уходят за края (первый экран); arc — дуга из верхнего
угла (у заголовков секций); loop — петля-серпантин (над шагами); curl — короткий завиток (у карточек).
Параметры (--param): ribs — число рёбер поперёк; nu — число сечений вдоль (480; меньше — быстрее строится).
Цвета (--palette): ridge — гребень ребра, mid — склон, valley — ложбина, edge — кромка, warm — куда гребень
местами теплеет вдоль ленты.

Лента ведёт себя как полоса бумаги: гнётся только вокруг своей ширины (ширина смотрит в глубину кадра), поэтому
на перегибах не складывается. Цвет — по вершинам (тёмная ложбина, светлый гребень), блик тянется вдоль ленты
(anisotropy) — как на атласе. Камера стоит как задано сценой (distance, target), а не по рамке предмета, и лента
сама выходит за край кадра: ответ сцены bleed — «упор в край» здесь замысел, предупреждения нет.
Считается в координатах «X вправо, Y вверх, Z к зрителю» и в конце переводится в оси Blender (Z вверх, камера с −Y).
"""
import math


def build(ctx):
    v = ctx.variant or "wave"
    ctx.palette(ridge="#86D41C", mid="#3E8E1A", valley="#0F3A17", edge="#D3F34A", warm="#C4E22A")

    def wave(u):
        x = -16 + 32 * u
        return (x, 2.1 * math.sin(x * 0.36 + 0.5) + 0.5 * math.sin(x * 0.8 + 1.3), 0.9 * math.sin(x * 0.25))

    def loop(u):
        x = -9 + 18 * u
        return (x + 1.4 * math.sin(x * 0.7), 2.4 * math.sin(x * 0.55 + 0.3) + 0.2 * x, 1.2 * math.cos(x * 0.5))

    defs = {
        "wave": dict(curve=wave, width=4.6, ribs=26, twist=lambda u: 0.42 * math.sin(u * 7.2 + 0.8) + 0.12, view=(0, 0.62, 1), distance=21, target=(0, 0, 0)),
        "arc": dict(points=[(-3.4, 6.4, -1.0), (-1.0, 2.6, 0.2), (2.2, 0.4, 0.5), (5.4, 1.4, 0.2), (7.6, 5.6, -0.8), (9.4, 9, -1.4)],
                    width=3.6, ribs=22, twist=lambda u: 0.55 * math.sin(u * 4.2 + 0.4), view=(0.05, 0.55, 1), distance=17, target=(2.4, 3.0, 0)),
        "loop": dict(curve=loop, width=3.2, ribs=20, twist=lambda u: 0.5 * math.sin(u * 6 + 2), view=(0.1, 0.6, 1), distance=20, target=(0, 0.4, 0)),
        "curl": dict(points=[(-4.2, -2.2, -0.4), (-1.6, 0.8, 0.5), (1.2, 1.4, 0.0), (3.6, -0.8, 0.4), (5.2, -3.4, -0.2)],
                     width=2.6, ribs=16, twist=lambda u: 0.6 * math.sin(u * 5 + 1), view=(0, 0.6, 1), distance=14, target=(0.4, -0.4, 0)),
    }
    if v not in defs:
        raise ValueError("вариант «%s»: есть wave, arc, loop, curl" % v)
    P = defs[v]
    V = ctx.Vector
    ribs = ctx.param("ribs", P["ribs"], int)
    NU = ctx.param("nu", 480, int)
    NV = ribs * 10
    path = [V(p) for p in (ctx.curve(P["points"], NU) if "points" in P else [P["curve"](i / float(NU)) for i in range(NU + 1)])]
    c_ridge, c_mid, c_valley, c_edge, c_warm = [V(ctx.color(k)[:3]) for k in ("ridge", "mid", "valley", "edge", "warm")]
    pitch = P["width"] / ribs
    amp = pitch * 0.46
    Z = V((0, 0, 1))
    # поперечный профиль одинаков на всех сечениях — считаем один раз: (смещение по ширине, высота, гребень 0…1, кромка 0…1)
    prof = []
    for j in range(NV + 1):
        q = j / float(NV)
        ridge = (0.5 + 0.5 * math.cos(q * ribs * 2 * math.pi)) ** 0.55   # круглый валик с острой ложбиной
        cup = math.sin(q * math.pi) * P["width"] * 0.07                    # лёгкий желоб поперёк
        prof.append(((q - 0.5) * P["width"], ridge * amp + cup, ridge, abs(q - 0.5) * 2))
    from mathutils import Quaternion
    verts, cols, uvs = [], [], []
    for i, c in enumerate(path):
        u = i / float(NU)
        t = (path[min(i + 1, NU)] - path[max(i - 1, 0)]).normalized()
        b = (Z - t * t.dot(Z)).normalized()          # ширина — в глубину кадра
        n = b.cross(t).normalized()                  # лицевая сторона
        rot = Quaternion(t, P["twist"](u))
        b, n = rot @ b, rot @ n
        ridge_u = c_ridge.lerp(c_warm, 0.38 * math.sin(u * math.pi * 1.7 + 0.4) ** 2)   # вдоль ленты цвет местами теплеет
        for w, h, ridge, side in prof:
            p = c + b * w + n * h
            verts.append((p.x, -p.z, p.y))           # в оси Blender
            col = c_valley.lerp(c_mid, min(1.0, ridge * 1.5)).lerp(ridge_u, ridge ** 2.4).lerp(c_edge, side ** 5 * 0.45)
            cols.append((col.x, col.y, col.z))
            uvs.append((u, (w / P["width"]) + 0.5))
    faces = []
    for i in range(NU):
        for j in range(NV):
            a = i * (NV + 1) + j
            faces.append((a, a + NV + 1, a + NV + 2, a + 1))
    mat = ctx.gloss("ridge", roughness=0.2, coat=1.0, metallic=0.08, anisotropy=0.7, vcol="Col")
    ctx.mesh(verts, faces, material=mat, uvs=uvs, colors=cols, name="ribbon")
    vx, vy, vz = P["view"]
    tx, ty, tz = P["target"]
    # поле зрения ленты задано по высоте кадра (24°), а студия меряет его по большей стороне: у широкого кадра пересчитать
    w, h = float(ctx.job.get("w") or 1000), float(ctx.job.get("h") or 1000)
    fov = 24.0 if w <= h else math.degrees(2 * math.atan(math.tan(math.radians(12.0)) * w / h))
    return {"view": (vx, -vz, vy), "fov": fov, "distance": P["distance"], "target": (tx, -tz, ty), "bleed": True, "key": 1.25}
