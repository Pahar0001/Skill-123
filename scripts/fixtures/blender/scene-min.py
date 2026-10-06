# -*- coding: utf-8 -*-
"""Стенд blender.mjs selftest: самая короткая сцена — брусок и шар на земле, палитра и параметр из задания."""
FRAMES = 60


def build(ctx):
    h = ctx.param("height", 0.6, float)
    ctx.box((1.0, 0.7, h), bevel=0.04, material=ctx.satin("accent"), location=(0, 0, h / 2))
    ctx.sphere(0.25, material=ctx.gloss("bone"), location=(0.2, -0.1, h + 0.25))
    return {"view": (0.35, -1.0, 0.3), "fov": 28, "ground": True}
