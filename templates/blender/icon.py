# -*- coding: utf-8 -*-
"""
Предмет-иконка в студии (образец сцены для blender.mjs render и glb).

    node blender.mjs render templates/blender/icon.py --variant jar --out out --bg EFEBE4
    node blender.mjs render templates/blender/icon.py --variant jar,box,stamp --out out --bg EFEBE4 --trim
    node blender.mjs glb templates/blender/icon.py --variant box --out out/box.glb --draco

Варианты: jar — стеклянная банка с мёдом, металлической крышкой и бумажной этикеткой; box — коробка из крафта
с атласной лентой и бантом; stamp — печать: деревянная ручка, металлическое кольцо, резиновая подошва.
Каждый держит планку: глянец рядом с матовым, металл, детали, по которым вещь узнают, тень на земле.

Предметы у каждого сайта свои — это образец, а не набор на любой случай: копировать в прогон и писать своё.
Оси Blender: Z вверх, «перед» предмета смотрит в −Y (туда же смотрит камера по умолчанию).
"""


def build(ctx):
    v = ctx.variant or "jar"
    if v == "jar":
        jar(ctx)
    elif v == "box":
        gift(ctx)
    elif v == "stamp":
        stamp(ctx)
    else:
        raise ValueError("вариант «%s»: есть jar, box, stamp" % v)
    return {"view": (0.35, -1.0, 0.32), "fov": 26, "margin": 1.12, "ground": True}


def jar(ctx):
    # стекло: закрытый цилиндр с толщиной стенки (полый внутри — мёд виден сквозь стекло, а не «в куске стекла»)
    body = ctx.cylinder(0.5, 1.1, bevel=0.06, material=ctx.glass("glass"), location=(0, 0, 0.55), name="jar-glass")
    ctx.solidify(body, 0.025)
    ctx.cylinder(0.462, 0.78, bevel=0.05, material=ctx.glass("sun", roughness=0.04, ior=1.49), location=(0, 0, 0.44), name="jar-honey")
    # крышка: шлифованный металл с рёбрами по краю
    ctx.cylinder(0.53, 0.16, bevel=0.03, material=ctx.metal("metal", roughness=0.18, anisotropy=0.6), location=(0, 0, 1.17), name="jar-lid")
    for z in (1.1, 1.24):
        ctx.torus(0.528, 0.016, material=ctx.metal("metal", roughness=0.25), location=(0, 0, z), name="jar-lid-rib")
    # этикетка: открытая бумажная обечайка и глянцевая полоса печати
    ctx.cylinder(0.508, 0.42, material=ctx.paper("kraft"), location=(0, 0, 0.52), caps=False, name="jar-label")
    ctx.cylinder(0.511, 0.06, material=ctx.gloss("accent"), location=(0, 0, 0.6), caps=False, name="jar-label-print")


def gift(ctx):
    kraft = ctx.paper("kraft")
    ribbon = ctx.gloss("accent", roughness=0.26)
    ctx.box((1.2, 1.2, 0.8), bevel=0.02, material=kraft, location=(0, 0, 0.4), name="box-body")
    ctx.box((1.26, 1.26, 0.22), bevel=0.025, material=kraft, location=(0, 0, 0.75), name="box-lid")
    top = 0.86
    # лента крест-накрест: по крышке и вниз по бокам
    ctx.box((1.28, 0.16, 0.012), bevel=0.004, material=ribbon, location=(0, 0, top + 0.006), name="ribbon-x")
    ctx.box((0.16, 1.28, 0.012), bevel=0.004, material=ribbon, location=(0, 0, top + 0.007), name="ribbon-y")
    for sx in (-1, 1):
        ctx.box((0.012, 0.16, top), bevel=0.004, material=ribbon, location=(sx * 0.636, 0, top / 2), name="ribbon-side")
        ctx.box((0.16, 0.012, top), bevel=0.004, material=ribbon, location=(0, sx * 0.636, top / 2), name="ribbon-side")
    # бант: две приплюснутые петли и узел
    for sx in (-1, 1):
        loop = ctx.torus(0.17, 0.045, material=ribbon, location=(sx * 0.15, 0, top + 0.12), rotation=(90, 0, sx * 20), name="bow-loop")
        loop.scale = (1.0, 0.55, 1.0)
    ctx.sphere(0.07, material=ribbon, location=(0, 0, top + 0.05), name="bow-knot")


def stamp(ctx):
    ctx.box((0.86, 0.56, 0.04), bevel=0.012, material=ctx.rubber("accent"), location=(0, 0, 0.02), name="stamp-rubber")
    ctx.box((0.9, 0.6, 0.16), bevel=0.03, material=ctx.satin("ink"), location=(0, 0, 0.12), name="stamp-base")
    ctx.cylinder(0.19, 0.12, bevel=0.02, material=ctx.metal("metal"), location=(0, 0, 0.26), name="stamp-collar")
    ctx.cylinder(0.16, 0.7, bevel=0.02, material=ctx.clay("kraft", roughness=0.45, coat=0.4), location=(0, 0, 0.67), radius_top=0.12, name="stamp-handle")
    ctx.sphere(0.21, material=ctx.gloss("accent2"), location=(0, 0, 1.12), name="stamp-knob")
