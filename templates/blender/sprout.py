# -*- coding: utf-8 -*-
"""
Росток: лопнувшее семя, стебель и две семядоли — «дело идёт в рост» (образец сцены для blender.mjs).

    node blender.mjs render templates/blender/sprout.py --out out --bg EFEBE4
    node blender.mjs render templates/blender/sprout.py --variant stand --out out --bg EFEBE4 --trim
    node blender.mjs glb templates/blender/sprout.py --out out/sprout.glb --draco

Варианты: (без варианта) — парит с наклоном, для первого экрана; stand — стоит прямо, с тенью на земле.
Цвета (--palette): bark — оболочка семени, pulp — мякоть, stem — стебель, leaf и leaf2 — семядоли.
Что здесь от планки: листья — ctx.leafy (свет проходит сквозь пластину, прожилки рельефом), рядом матовая
мякоть семени и лакированная оболочка; стебель к верху тоньше (ctx.tube с радиусом-функцией).
Оси Blender: Z вверх, камера смотрит со стороны −Y.
"""


def build(ctx):
    v = ctx.variant or "float"
    if v not in ("float", "stand"):
        raise ValueError("вариант «%s»: есть stand (без варианта — парящий росток)" % v)
    ctx.palette(bark="#7A5A38", pulp="#EADDBD", stem="#B2E84A", leaf="#4FB81E", leaf2="#86E02E")
    objs = []
    # семя: оболочка лопнула — нижняя чаша и откинутая крышка, внутри светлая мякоть
    shell = ctx.gloss("bark", roughness=0.38, coat=0.6)
    bowl = ctx.sphere(0.66, material=shell, rotation=(180, 0, 9), name="seed-bowl", arc=0.5)
    bowl.scale = (1.3, 1.0, 0.95)
    lid = ctx.sphere(0.66, material=shell, location=(0.66, 0.1, 0.2), rotation=(14, 62, 0), name="seed-lid", arc=0.5)
    lid.scale = (1.22, 0.95, 0.86)
    for o in (bowl, lid):
        ctx.solidify(o, 0.05)
    pulp = ctx.sphere(0.6, material=ctx.clay("pulp", roughness=0.75, coat=0.0), location=(0, 0, -0.03), name="seed-pulp")
    pulp.scale = (1.26, 0.96, 0.5)
    objs += [bowl, lid, pulp]
    # стебель: из семени вверх с изгибом, к верху тоньше
    stem = ctx.gloss("stem")
    objs.append(ctx.tube([(-0.06, -0.02, 0.02), (-0.3, -0.08, 0.75), (-0.2, -0.04, 1.55), (0.12, 0.02, 2.3), (0.24, 0.0, 2.85)],
                         radius=lambda u: 0.17 - 0.06 * u, material=stem, segments=90, radial=24, name="stem"))
    # семядоли: пухлые овальные листья, раскрыты в стороны и повёрнуты лицом к зрителю
    top = (0.24, 0.0, 2.8)
    objs.append(ctx.leaf(2.0, 1.5, 0.34, curl=0.16, fold=0.16, tip=0.42, material=ctx.leafy("leaf", depth=0.12), location=top, rotation=(58, -24, 0), name="leaf-big"))
    objs.append(ctx.leaf(1.55, 1.25, 0.3, curl=0.18, fold=0.16, tip=0.42, material=ctx.leafy("leaf2", depth=0.1), location=top, rotation=(-56, -34, 180), name="leaf-small"))
    bud = ctx.sphere(0.19, material=stem, location=(0.25, -0.06, 2.93), name="bud")
    bud.scale = (0.85, 0.85, 1.45)
    objs.append(bud)
    if v == "stand":
        return {"view": (0.2, -1.0, 0.22), "fov": 26, "ground": True}
    ctx.group(objs, rotation=(0, 11, 0))   # наклон в сторону движения
    return {"view": (0.2, -1.0, 0.18), "fov": 26}
