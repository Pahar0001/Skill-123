# -*- coding: utf-8 -*-
"""
Стопка карточек или коробок падает на плоскость и укладывается (твёрдые тела) — образец для blender.mjs physics.

    node blender.mjs physics templates/blender/stack.py --variant cards --out out --frames 120 --bg EFEBE4
    node blender.mjs physics templates/blender/stack.py --variant boxes --out out --video --glb out/boxes.glb
    node blender.mjs physics templates/blender/stack.py --variant shelf --out out --param count=10 --seed 3

Варианты: cards — карточки (визитки, открытки) с небольшим вращением падают в стопку; boxes — коробки разных
размеров; shelf — предметы падают на две полки и на пол.
Параметры (--param): count — сколько предметов; spread — разброс по плоскости (доля размера карточки).
Форма столкновения BOX — самая устойчивая для плоских предметов; запас 1 мм — без «парения» над столом.
Отскок у Bullet перемножается (тело × опора): у пола 0.2…0.4, иначе отскока не видно.
"""
FRAMES = 120


def build(ctx):
    v = ctx.variant or "cards"
    r = ctx.random
    ctx.floor(friction=0.8, bounce=0.25)
    colors = ["bone", "accent", "paper", "accent2", "kraft", "ink"]
    if v == "cards":
        n = ctx.param("count", 14, int)
        spread = ctx.param("spread", 0.22, float)
        for i in range(n):
            w, h = r.uniform(1.4, 1.7), r.uniform(0.9, 1.05)
            mat = ctx.satin(colors[i % len(colors)]) if i % 2 else ctx.paper(colors[i % len(colors)])
            c = ctx.card(w, h, 0.025, corner=0.07, material=mat,
                         location=(r.uniform(-spread, spread) * w, r.uniform(-spread, spread) * h, 0.5 + i * 0.2),
                         rotation=(r.uniform(-10, 10), r.uniform(-10, 10), r.uniform(0, 360)), name="card")
            ctx.rigid(c, mass=0.05, friction=0.55, bounce=0.05, shape="BOX")
        return {"view": (0.3, -1.0, 0.75), "fov": 28, "ground": True}
    if v == "boxes":
        n = ctx.param("count", 7, int)
        for i in range(n):
            s = (r.uniform(0.3, 0.7), r.uniform(0.3, 0.7), r.uniform(0.25, 0.55))
            mat = ctx.paper("kraft") if i % 3 else ctx.satin(colors[i % len(colors)])
            b = ctx.box(s, bevel=0.02, material=mat, location=(r.uniform(-0.5, 0.5), r.uniform(-0.4, 0.4), 0.6 + i * 0.55),
                        rotation=(r.uniform(-25, 25), r.uniform(-25, 25), r.uniform(0, 360)), name="box")
            ctx.rigid(b, mass=s[0] * s[1] * s[2] * 8, friction=0.65, bounce=0.12, shape="BOX")
        return {"view": (0.4, -1.0, 0.55), "fov": 30, "ground": True}
    if v == "shelf":
        n = ctx.param("count", 8, int)
        for k, (x, z) in enumerate(((-0.9, 0.9), (0.9, 0.5))):
            board = ctx.box((1.6, 0.6, 0.06), bevel=0.01, material=ctx.satin("bone"), location=(x, 0, z), name="shelf")
            ctx.passive(board, shape="BOX", friction=0.7, bounce=0.2)
            for sx in (-0.75, 0.75):
                leg = ctx.box((0.05, 0.5, z), bevel=0.008, material=ctx.metal("metal"), location=(x + sx, 0, z / 2), name="shelf-leg")
                ctx.passive(leg, shape="BOX")
        for i in range(n):
            x = r.choice((-0.9, 0.9)) + r.uniform(-0.5, 0.5)
            if i % 2:
                o = ctx.card(0.5, 0.34, 0.02, corner=0.04, material=ctx.satin(colors[i % len(colors)]), location=(x, r.uniform(-0.15, 0.15), 1.6 + i * 0.25),
                             rotation=(r.uniform(-20, 20), r.uniform(-20, 20), r.uniform(0, 360)), name="card")
                ctx.rigid(o, mass=0.02, friction=0.55, bounce=0.05, shape="BOX")
            else:
                o = ctx.cylinder(0.09, 0.22, bevel=0.015, material=ctx.gloss(colors[i % len(colors)]), location=(x, r.uniform(-0.15, 0.15), 1.6 + i * 0.25),
                                 rotation=(r.uniform(-40, 40), 0, 0), name="jar")
                ctx.rigid(o, mass=0.2, friction=0.6, bounce=0.1, shape="CYLINDER")
        return {"view": (0.25, -1.0, 0.35), "fov": 30, "ground": True}
    raise ValueError("вариант «%s»: есть cards, boxes, shelf" % v)
