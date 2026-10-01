# -*- coding: utf-8 -*-
"""
Проекция модели CadQuery с удалением скрытых линий — данные для svg3d.mjs cad.

Запуск (его делает svg3d.mjs, руками не нужно):
    python cad_runner.py <запрос.json>      запрос: { "script": путь | null, "builtin": имя | null,
                                                      "params": {…}, "views": [{ "name", "dir": [x, y, z] }],
                                                      "deflection": доля от размера (0.0002) }
Ответ — JSON в stdout: { ok, cadquery, views: [{ name, bbox, lines: { outline, sharp, smooth, hidden } }] },
каждая линия — список точек [x, y] в плоскости проекции (ось Y вверх). Файлов не пишет: пути с кириллицей
ядру OCCT не передаются.

Сценарий модели — обычный файл CadQuery: результат в переменной `result` (Workplane, Shape, Assembly)
или через show_object(obj). В сценарий передаётся словарь params (из --param).
"""
import io
import json
import math
import sys
import traceback


def fail(msg, code=1):
    sys.stdout.write(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
    sys.exit(code)


try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    import cadquery as cq
    from OCP.gp import gp_Ax2, gp_Pnt, gp_Dir
    from OCP.BRepLib import BRepLib
    from OCP.HLRBRep import HLRBRep_Algo, HLRBRep_HLRToShape
    from OCP.HLRAlgo import HLRAlgo_Projector
    from OCP.GCPnts import GCPnts_QuasiUniformDeflection
    from cadquery.occ_impl.shapes import Shape, TOLERANCE
except Exception as e:  # нет cadquery — код 3, чтобы вызывающий отличил от ошибки модели
    fail("нет cadquery: %s" % e, 3)


# ---------- встроенные фигуры ----------

def builtin_gear(p):
    """Шестерня: зубчатый венец, ступица, отверстие со шпоночным пазом, облегчающие отверстия."""
    teeth = int(p.get("teeth", 18)); module = float(p.get("module", 4)); width = float(p.get("width", 10))
    bore = float(p.get("bore", 12)); holes = int(p.get("holes", 6))
    r_pitch = teeth * module / 2.0; r_tip = r_pitch + module; r_root = r_pitch - 1.25 * module
    step = 2 * math.pi / teeth; pts = []
    for i in range(teeth):   # зуб: узкая вершина, широкое основание (трапеция — на рисунке читается как эвольвента)
        a = i * step
        for frac, r in ((-0.27, r_root), (-0.11, r_tip), (0.11, r_tip), (0.27, r_root)):
            pts.append((r * math.cos(a + frac * step), r * math.sin(a + frac * step)))
    body = cq.Workplane("XY").polyline(pts).close().extrude(width)
    hub_r = bore * 0.95; rim = r_root - module * 1.1
    body = body.union(cq.Workplane("XY").circle(hub_r).extrude(width * 1.5))                     # ступица выше венца
    if rim - hub_r > module * 1.5:                                                               # выемка на торце: обод и диск
        body = body.cut(cq.Workplane("XY").workplane(offset=width * 0.65).circle(rim).circle(hub_r + module * 0.5).extrude(width))
        if holes > 0:
            body = body.cut(cq.Workplane("XY").polarArray((rim + hub_r + module * 0.5) / 2.0, 0, 360, holes).circle((rim - hub_r) * 0.27).extrude(width))
    body = body.cut(cq.Workplane("XY").circle(bore / 2.0).extrude(width * 2))
    return body.cut(cq.Workplane("XY").center(0, bore / 2.0).rect(bore * 0.28, bore * 0.3).extrude(width * 2))   # шпоночный паз


def builtin_crate(p):
    """Ящик из реек: угловые стойки, по три рейки на сторону, дно."""
    w = float(p.get("width", 120)); d = float(p.get("depth", 80)); h = float(p.get("height", 70))
    post = float(p.get("post", 8)); slats = int(p.get("slats", 3)); t = float(p.get("thickness", 5))
    gap = h * 0.1; sh = (h - gap * (slats + 1)) / slats
    box = cq.Workplane("XY").box(w, d, t, centered=(True, True, False))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box = box.union(cq.Workplane("XY").box(post, post, h, centered=(True, True, False)).translate((sx * (w - post) / 2, sy * (d - post) / 2, 0)))
    for i in range(slats):
        z = gap + i * (sh + gap)
        for sy in (-1, 1):
            box = box.union(cq.Workplane("XY").box(w, t, sh, centered=(True, True, False)).translate((0, sy * (d + t) / 2, z)))
        for sx in (-1, 1):
            box = box.union(cq.Workplane("XY").box(t, d + 2 * t, sh, centered=(True, True, False)).translate((sx * (w + t) / 2, 0, z)))
    return box


def builtin_nut(p):
    """Гайка: шестигранник с отверстием и фасками."""
    size = float(p.get("size", 30)); h = float(p.get("height", 14)); bore = float(p.get("bore", 16))
    nut = cq.Workplane("XY").polygon(6, size).extrude(h)
    # фаски по углам — пересечением с телом вращения, как у настоящей гайки
    nut = nut.intersect(cq.Workplane("XZ").polyline([(0, 0), (size * 0.44, 0), (size * 0.5, h * 0.14), (size * 0.5, h * 0.86), (size * 0.44, h), (0, h)]).close().revolve(360, (0, 0, 0), (0, 1, 0)))
    return nut.faces(">Z").workplane().circle(bore / 2.0).cutThruAll()


BUILTIN = {"gear": builtin_gear, "crate": builtin_crate, "nut": builtin_nut}


# ---------- модель из сценария ----------

def to_shape(obj):
    if obj is None:
        return None
    if isinstance(obj, cq.Assembly):
        return obj.toCompound()
    if isinstance(obj, cq.Workplane):
        vals = [v for v in obj.vals() if isinstance(v, Shape)]
        if not vals:
            return None
        return vals[0] if len(vals) == 1 else cq.Compound.makeCompound(vals)
    if isinstance(obj, Shape):
        return obj
    if isinstance(obj, (list, tuple)):
        parts = [to_shape(o) for o in obj]
        parts = [s for s in parts if s is not None]
        return cq.Compound.makeCompound(parts) if parts else None
    return None


def load_script(path, params):
    shown = []
    ns = {"__name__": "__svg3d__", "__file__": path, "cq": cq, "cadquery": cq, "params": params,
          "show_object": lambda o, *a, **k: shown.append(o), "debug": lambda *a, **k: None}
    with io.open(path, "r", encoding="utf-8") as f:
        src = f.read()
    exec(compile(src, path, "exec"), ns)
    obj = shown if shown else ns.get("result")
    shape = to_shape(obj)
    if shape is None:
        raise ValueError("сценарий не дал модели: нужна переменная result (Workplane, Shape, Assembly) или show_object(obj)")
    return shape


# ---------- проекция ----------

def polyline(edge, tol):
    curve = edge._geomAdaptor()
    pts = GCPnts_QuasiUniformDeflection(curve, tol, curve.FirstParameter(), curve.LastParameter())
    if not pts.IsDone():
        return None
    out = []
    for i in range(pts.NbPoints()):
        p = pts.Value(i + 1)
        out.append([round(p.X(), 6), round(p.Y(), 6)])
    return out if len(out) >= 2 else None


def project(shape, direction, deflection):
    n = [float(v) for v in direction]
    ln = math.sqrt(sum(v * v for v in n)) or 1.0
    n = [v / ln for v in n]
    up = (0.0, 1.0, 0.0) if abs(n[2]) > 0.999 else (0.0, 0.0, 1.0)   # вид сверху и снизу: вверх на листе — ось Y
    x = (up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0])
    hlr = HLRBRep_Algo()
    hlr.Add(shape.wrapped)
    hlr.Projector(HLRAlgo_Projector(gp_Ax2(gp_Pnt(), gp_Dir(*n), gp_Dir(*x))))
    hlr.Update()
    hlr.Hide()
    res = HLRBRep_HLRToShape(hlr)
    groups = {"sharp": res.VCompound(), "smooth": res.Rg1LineVCompound(), "outline": res.OutLineVCompound(),
              "hidden": res.HCompound(), "hidden_outline": res.OutLineHCompound()}
    shapes = {}
    for k, comp in groups.items():
        if comp is None or comp.IsNull():
            continue
        BRepLib.BuildCurves3d_s(comp, TOLERANCE)
        shapes[k] = Shape(comp)
    if not shapes:
        raise ValueError("проекция пуста")
    bb = cq.Compound.makeCompound(list(shapes.values())).BoundingBox()
    tol = max(bb.xlen, bb.ylen) * deflection
    lines = {"outline": [], "sharp": [], "smooth": [], "hidden": []}
    for k, s in shapes.items():
        key = "hidden" if k.startswith("hidden") else k
        for e in s.Edges():
            pl = polyline(e, tol)
            if pl:
                lines[key].append(pl)
    return {"bbox": [bb.xmin, bb.ymin, bb.xmax, bb.ymax], "lines": lines}


def main():
    if len(sys.argv) < 2:
        fail("нужен файл запроса")
    with io.open(sys.argv[1], "r", encoding="utf-8") as f:
        req = json.load(f)
    params = req.get("params") or {}
    try:
        if req.get("builtin"):
            if req["builtin"] not in BUILTIN:
                fail("встроенной фигуры «%s» нет (есть: %s)" % (req["builtin"], ", ".join(sorted(BUILTIN))), 2)
            shape = to_shape(BUILTIN[req["builtin"]](params))
        else:
            shape = load_script(req["script"], params)
    except SystemExit:
        raise
    except Exception as e:
        tb = traceback.extract_tb(sys.exc_info()[2])
        where = ""
        for fr in reversed(tb):
            if req.get("script") and fr.filename == req["script"]:
                where = " (строка %d)" % fr.lineno
                break
        fail("модель не построена%s: %s: %s" % (where, type(e).__name__, e))
    bb = shape.BoundingBox()
    views = []
    for v in req.get("views") or [{"name": "iso", "dir": [1, -1, 0.8]}]:
        try:
            r = project(shape, v["dir"], float(req.get("deflection") or 0.0002))
        except Exception as e:
            fail("проекция «%s» не построена: %s: %s" % (v.get("name"), type(e).__name__, e))
        r["name"] = v.get("name")
        views.append(r)
    sys.stdout.write(json.dumps({"ok": True, "cadquery": cq.__version__, "size": [bb.xlen, bb.ylen, bb.zlen], "views": views}))


main()
