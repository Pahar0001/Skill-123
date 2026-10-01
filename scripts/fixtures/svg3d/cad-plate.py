# -*- coding: utf-8 -*-
# Стенд самопроверки svg3d.mjs cad: плита с отверстием и бобышкой. Отверстие с этого вида закрыто телом —
# его линии должны уйти в скрытые (пунктир). Параметр hole приходит из --param.
import cadquery as cq

hole = float(params.get("hole", 8))
result = (
    cq.Workplane("XY").box(60, 40, 10)
    .faces(">Z").workplane().circle(12).extrude(8)
    .faces("<Z").workplane().circle(hole / 2.0).cutBlind(-12)
)
