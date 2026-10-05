# -*- coding: utf-8 -*-
"""Стенд blender.mjs selftest: сцена с опечатками — проверка ловит их без Blender."""


def build(ctx):
    ctx.box((1, 1, 1), sise=0.2)
    ctx.cilinder(0.5, 1.0)
    return {"view": viw}
