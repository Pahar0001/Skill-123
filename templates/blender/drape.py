# -*- coding: utf-8 -*-
"""
Ткань ложится на предмет и плоскость (cloth) — образец для blender.mjs physics.

    node blender.mjs physics templates/blender/drape.py --sim cloth --variant cube --out out --frames 90 --bg EFEBE4
    node blender.mjs physics templates/blender/drape.py --variant sphere --param fabric=silk --out out --video
    node blender.mjs glb templates/blender/drape.py --variant product --out out/drape.glb --draco

Варианты: cube — постамент со скруглёнными рёбрами; sphere — шар; product — силуэт банки под тканью
(«накрыто перед открытием»). Параметры (--param): fabric — silk | cotton | linen | denim | leather;
size — сторона ткани; grid — плотность сетки (64…120: больше — мельче складки и дольше счёт).
Ткань в GLB — застывший последний кадр (glTF не переносит кэш точек); движение ткани — только видео.
"""
FRAMES = 90


def build(ctx):
    v = ctx.variant or "cube"
    ctx.floor(friction=0.8, bounce=0.1)
    base = ctx.clay("bone", roughness=0.45)
    if v == "cube":
        o = ctx.box((1.0, 1.0, 1.0), bevel=0.06, material=base, location=(0, 0, 0.5), name="pedestal")
        top = 1.0
    elif v == "sphere":
        o = ctx.sphere(0.55, material=ctx.gloss("accent2"), location=(0, 0, 0.55), name="ball")
        top = 1.1
    elif v == "product":
        o = ctx.cylinder(0.45, 1.0, bevel=0.05, material=base, location=(0, 0, 0.5), name="jar")
        ctx.collider(ctx.cylinder(0.48, 0.14, bevel=0.03, material=ctx.metal("metal"), location=(0, 0, 1.07), name="lid"), thickness=0.008)
        top = 1.14
    else:
        raise ValueError("вариант «%s»: есть cube, sphere, product" % v)
    ctx.collider(o, thickness=0.008)
    size = ctx.param("size", 2.6, float)
    grid = ctx.param("grid", 72, int)
    cl = ctx.plane((size, size), material=ctx.fabric("accent", weave=110), location=(0, 0, top + 0.35), rotation=(0, 0, 20), subdiv=grid, name="cloth")
    ctx.cloth(cl, ctx.param("fabric", "cotton"), thickness=0.006)
    return {"view": (0.35, -1.0, 0.45), "fov": 28, "margin": 1.1, "ground": True}
