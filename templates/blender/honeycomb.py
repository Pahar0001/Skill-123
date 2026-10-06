# -*- coding: utf-8 -*-
"""
Соты с мёдом: гроздь шестигранных ячеек, часть залита, с нижней стекает капля (образец сцены для blender.mjs).

    node blender.mjs render templates/blender/honeycomb.py --out out --bg EFEBE4
    node blender.mjs render templates/blender/honeycomb.py --variant four,trio,row --out out --bg EFEBE4 --samples 32 --w 600 --h 600
    node blender.mjs render templates/blender/honeycomb.py --palette "honey=#E89A1C,wax=#F6D27A" --out out

Варианты: four — пять ячеек гроздью (по умолчанию); trio — три; row — два ряда. Цвета (--palette): honey — мёд,
wax и wax2 — воск светлый и тёмный. Парящий предмет первого экрана: земли и тени под ним нет.
Что здесь от планки: воск под тонким лаком рядом с мёдом, который светится на просвет (ctx.honey); фаски на
каждом ребре ловят блик софтбокса; уровень мёда в ячейках разный — по этому соты и узнают.
Собрано лёжа (плоскость XY, лицом вверх) и поставлено к камере ctx.stand — так проще считать укладку.
"""
import math


def build(ctx):
    from studio import hex_points
    v = ctx.variant or "four"
    ctx.palette(honey="#F0A92B", wax="#F8D072", wax2="#F2B94A")
    R, WALL, DEPTH = 1.0, 0.16, 0.78
    wax = ctx.clay("wax", roughness=0.4, coat=0.7)
    wax2 = ctx.clay("wax2", roughness=0.42, coat=0.7)
    honey = ctx.honey("honey", depth=0.22)
    outer, hole = hex_points(R, 0.16), hex_points(R - WALL, 0.14)
    # плотная шестиугольная укладка: шаг по ширине √3·R, по высоте 1.5·R; (столбец, ряд, уровень мёда, тёмный воск)
    dx, dy = math.sqrt(3) * R * 0.985, 1.5 * R * 0.985
    cells = {
        "trio": [(0, 0, 0.9, 0), (1, 0, 0.55, 1), (0.5, 1, 0.0, 0)],
        "row": [(0, 0, 0.9, 0), (1, 0, 0.6, 1), (2, 0, 0.0, 0), (0.5, 1, 0.75, 1), (1.5, 1, 0.9, 0)],
        "four": [(0, 0, 0.92, 0), (1, 0, 0.62, 1), (0.5, 1, 0.86, 1), (1.5, 1, 0.0, 0), (-0.5, 1, 0.4, 0)],
    }
    if v not in cells:
        raise ValueError("вариант «%s»: есть four, trio, row" % v)
    objs = []
    for cx, cy, level, dark in cells[v]:
        x, y = cx * dx, cy * dy
        objs.append(ctx.prism(outer, DEPTH, hole=hole, bevel=0.07, material=wax2 if dark else wax, location=(x, y, 0), name="cell-wall"))
        objs.append(ctx.prism(hex_points(R - WALL * 0.6, 0.14), 0.1, bevel=0.03, material=wax2, location=(x, y, -DEPTH / 2 + 0.05), name="cell-floor"))
        if level > 0:
            h = DEPTH * level
            # мёд чуть ниже края, с выпуклой фаской — мениск
            objs.append(ctx.prism(hex_points(R - WALL - 0.01, 0.14), h, bevel=0.09, material=honey, location=(x, y, -DEPTH / 2 + 0.1 + h / 2), name="cell-honey"))
    # капля стекает с нижней ячейки: шар, вытянутый кверху в хвост
    drop = ctx.sphere(0.2, material=ctx.honey("honey", depth=0.12, glow=0.3), location=(0.02 * dx, -R - 0.42, DEPTH / 2 - 0.12), name="drop", segments=48)

    def tail(x, y, z):
        if y <= 0:
            return (x, y, z)
        k = 1 - (y / 0.2) ** 1.4 * 0.75
        return (x * k, y * 2.3, z * k)
    ctx.deform(drop, tail)
    objs.append(drop)
    ctx.center(objs)
    ctx.stand(objs, tilt=(-18, 29, 10))
    return {"view": (0.0, -1.0, 0.05), "fov": 26}
