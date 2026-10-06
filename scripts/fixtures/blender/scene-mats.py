# -*- coding: utf-8 -*-
"""Стенд blender.mjs selftest (настоящий Blender): все двенадцать материалов и все заготовки геометрии студии —
каждая строка bpy-кода исполняется хотя бы раз. Картинка печати — print.png рядом."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def build(ctx):
    from studio import hex_points, MATERIAL_KINDS
    ctx.palette(leaf="#4FB81E", honey="#F0A92B")
    mats = [ctx.clay(), ctx.gloss("accent", anisotropy=0.5), ctx.satin(), ctx.metal(anisotropy=0.4), ctx.paper(), ctx.glass(), ctx.glow(),
            ctx.fabric(), ctx.rubber(), ctx.leafy("leaf"), ctx.honey("honey"), ctx.printed(os.path.join(HERE, "print.png"), glow=0.2)]
    kinds = sorted(m["sr_kind"] for m in mats)
    if kinds != sorted(MATERIAL_KINDS):
        raise RuntimeError("стенд не покрывает материалы: %s" % ", ".join(sorted(set(MATERIAL_KINDS) - set(kinds))))
    objs = []
    for i, m in enumerate(mats):
        objs.append(ctx.sphere(0.2, material=m, location=(-1.5 + (i % 6) * 0.6, 0, 0.25 + (i // 6) * 0.6), segments=24))
    jar = ctx.cylinder(0.3, 0.5, material=ctx.glass(), location=(2.4, 0, 0.25))
    ctx.clear_shadow(ctx.solidify(jar, 0.02))
    objs.append(ctx.prism(hex_points(0.3, 0.16), 0.2, hole=hex_points(0.22, 0.14), material=ctx.clay("kraft"), location=(-2.2, 0, 0.1)))
    objs.append(ctx.tube([(-2.2, 0, 0.3), (-2.3, 0, 0.7), (-2.0, 0, 1.0)], radius=lambda u: 0.06 - 0.03 * u, material=ctx.gloss("accent2"), segments=24, radial=10))
    objs.append(ctx.leaf(0.7, 0.4, 0.08, material=ctx.leafy("leaf", depth=0.04), location=(-2.0, 0, 1.0), rotation=(60, -20, 0), segments=32))
    bowl = ctx.sphere(0.25, material=ctx.gloss("ink"), location=(2.4, 0, 0.9), rotation=(180, 0, 0), arc=0.5, segments=24)
    ctx.solidify(bowl, 0.03)
    pillow = ctx.box((0.5, 0.3, 0.3), bevel=0.05, material=ctx.paper("kraft"), location=(0, 0, 1.5), subdiv=6)
    ctx.deform(pillow, lambda x, y, z: (x, y * (1 + 0.3 * (1 - (2 * z / 0.3) ** 2)), z))
    strip = ctx.mesh([(0, 0, 0), (1, 0, 0), (1, 0, 0.3), (0, 0, 0.3)], [(0, 1, 2, 3)], material=ctx.gloss("accent", vcol="Col"),
                     uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], colors=[ctx.color("accent")[:3], ctx.color("sun")[:3]] * 2)
    ctx.group([strip], location=(-0.5, 0.2, 1.9), rotation=(0, 0, 10))
    label = ctx.plane((0.5, 0.25), material=mats[-1], location=(0.9, 0, 1.6))
    ctx.stand([label], tilt=(-10, 15, 0))
    ctx.center([pillow])
    ctx.group([pillow], location=(0, 0, 1.5))
    pts = ctx.curve([(0, 0, 0), (1, 0, 1), (2, 0, 0)], 8)
    if len(pts) != 9:
        raise RuntimeError("ctx.curve вернул %d точек, а не 9" % len(pts))
    return {"view": (0.2, -1.0, 0.25), "fov": 30, "ground": True}
