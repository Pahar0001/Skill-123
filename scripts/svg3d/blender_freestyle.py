# -*- coding: utf-8 -*-
"""
Blender + Freestyle SVG Exporter: линии сцены в SVG. Запускает svg3d.mjs blender:
    blender -b файл.blend --python blender_freestyle.py -- --out папка [--frame N]

НЕ ПРОВЕРЕНО ЗАПУСКОМ: при разработке (01.10.2026) Blender на машине не было. Ветка необязательная;
если что-то пойдёт не так, скрипт печатает причину строкой «SVG3D-ERROR: …», а svg3d.mjs её показывает.
Дополнение: до Blender 4.1 встроено (render_freestyle_svg), с 4.2 — расширение «Freestyle SVG Exporter»
с extensions.blender.org (ставится в самом Blender, скрипт ничего не скачивает).
"""
import os
import sys

import bpy


def die(msg):
    print("SVG3D-ERROR: " + msg)
    sys.exit(1)


argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = None
frame = None
i = 0
while i < len(argv):
    if argv[i] == "--out" and i + 1 < len(argv):
        out = argv[i + 1]; i += 2
    elif argv[i] == "--frame" and i + 1 < len(argv):
        frame = int(argv[i + 1]); i += 2
    else:
        i += 1
if not out:
    die("нужна папка --out")

import addon_utils

enabled = False
for name in ("render_freestyle_svg", "bl_ext.blender_org.freestyle_svg_exporter"):
    try:
        addon_utils.enable(name, default_set=False)
        if hasattr(bpy.context.scene, "svg_export"):
            enabled = True
            break
    except Exception:
        pass
if not enabled:
    die("дополнение Freestyle SVG Exporter не включилось: в Blender 4.2+ поставьте расширение «Freestyle SVG Exporter» (Edit → Preferences → Get Extensions)")

scene = bpy.context.scene
if frame is not None:
    scene.frame_set(frame)
scene.render.use_freestyle = True
scene.svg_export.use_svg_export = True
scene.svg_export.mode = "FRAME"
os.makedirs(out, exist_ok=True)
scene.render.filepath = os.path.join(out, "freestyle")
bpy.ops.render.render(write_still=False)
found = [f for f in os.listdir(out) if f.lower().endswith(".svg")]
if not found:
    die("рендер прошёл, но SVG не появился: проверьте, что в сцене включён слой Freestyle (View Layer → Freestyle)")
print("SVG3D-OK: " + os.path.join(out, sorted(found)[-1]))
