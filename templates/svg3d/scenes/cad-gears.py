# -*- coding: utf-8 -*-
"""Пара шестерён на плите — чертёжная проекция со скрытыми линиями (CadQuery).

    node svg3d.mjs cad scenes/cad-gears.py --out out --view iso --size 640
    node svg3d.mjs cad scenes/cad-gears.py --out out/cad-gears-sheet.svg --view top,front --size 720 --hidden faint
    node svg3d.mjs cad scenes/cad-gears.py --param teeth=24,pinion=10 …        свои числа зубьев

Сценарий — обычный файл CadQuery: модель кладётся в переменную result. Словарь params приходит из --param.
Цвета в SVG нет: линии рисуются цветом текста блока (currentColor), толщина — --stroke.
"""
import math

import cadquery as cq

TEETH = int(params.get("teeth", 20))      # большое колесо
PINION = int(params.get("pinion", 11))    # малая шестерня
MODULE = float(params.get("module", 4))
WIDTH = float(params.get("width", 9))


def gear(teeth, bore, holes):
    r_pitch = teeth * MODULE / 2.0
    r_tip, r_root = r_pitch + MODULE, r_pitch - 1.25 * MODULE
    step = 2 * math.pi / teeth
    pts = []
    for i in range(teeth):   # зуб — трапеция: узкая вершина, широкое основание
        a = i * step
        for frac, r in ((-0.27, r_root), (-0.11, r_tip), (0.11, r_tip), (0.27, r_root)):
            pts.append((r * math.cos(a + frac * step), r * math.sin(a + frac * step)))
    body = cq.Workplane("XY").polyline(pts).close().extrude(WIDTH)
    hub, rim = bore * 0.95, r_root - MODULE * 1.1
    body = body.union(cq.Workplane("XY").circle(hub).extrude(WIDTH * 1.5))   # ступица выше венца
    if rim - hub > MODULE * 1.5:   # выемка на торце и облегчающие отверстия
        body = body.cut(cq.Workplane("XY").workplane(offset=WIDTH * 0.65).circle(rim).circle(hub + MODULE * 0.5).extrude(WIDTH))
        if holes:
            body = body.cut(cq.Workplane("XY").polarArray((rim + hub + MODULE * 0.5) / 2.0, 0, 360, holes).circle((rim - hub) * 0.27).extrude(WIDTH))
    return body.cut(cq.Workplane("XY").circle(bore / 2.0).extrude(WIDTH * 2))


center = MODULE * (TEETH + PINION) / 2.0   # межосевое расстояние
big = gear(TEETH, 12, 6)
small = gear(PINION, 9, 0).rotate((0, 0, 0), (0, 0, 1), 180.0 / PINION + 180).translate((center, 0, 0))   # зуб во впадину

# плита со скруглёнными углами и два вала
plate_w = center + MODULE * (TEETH + PINION) / 2.0 + 34
plate = (cq.Workplane("XY").workplane(offset=-10).center(center / 2.0 - MODULE * (TEETH - PINION) / 4.0, 0)
         .rect(plate_w, MODULE * TEETH + 34).extrude(6).edges("|Z").fillet(10))
shafts = cq.Workplane("XY").workplane(offset=-4).pushPoints([(0, 0), (center, 0)]).circle(4).extrude(WIDTH * 1.5 + 12)

result = plate.union(shafts).union(big.translate((0, 0, 0))).union(small)
