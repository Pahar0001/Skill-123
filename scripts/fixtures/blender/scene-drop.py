# -*- coding: utf-8 -*-
"""Стенд blender.mjs selftest (настоящий Blender): три бруска падают на землю, на постамент ложится редкая ткань —
твёрдые тела, ткань, запекание ключей и заморозка ткани за секунды."""
FRAMES = 40


def build(ctx):
    ctx.floor(friction=0.8, bounce=0.2)
    for i in range(3):
        b = ctx.box((0.4, 0.3, 0.12), bevel=0.02, material=ctx.satin(("accent", "bone", "accent2")[i]), location=(-1.2 + 0.05 * i, 0.03 * i, 0.3 + 0.35 * i), rotation=(8 * i, 5, 20 * i), name="brick")
        ctx.rigid(b, mass=0.2, friction=0.6, bounce=0.05, shape="BOX")
    post = ctx.box((0.5, 0.5, 0.5), bevel=0.04, material=ctx.clay("bone"), location=(0.8, 0, 0.25), name="post")
    ctx.collider(post, thickness=0.01)
    cl = ctx.plane((1.2, 1.2), material=ctx.fabric("accent"), location=(0.8, 0, 0.7), subdiv=18, name="cloth")
    ctx.cloth(cl, "cotton", thickness=0.01)
    return {"view": (0.3, -1.0, 0.5), "fov": 30, "ground": True}
