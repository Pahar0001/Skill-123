# -*- coding: utf-8 -*-
"""
Вход конвейера Blender для blender.mjs:

    blender -b --factory-startup --python-exit-code 3 -P run.py -- <задание.json>

Задание пишет blender.mjs (mode: probe | render | physics | glb). Скрипт строит сцену (модуль
пользователя с build(ctx) или описание JSON), ставит студию и камеру, считает физику, рендерит и
экспортирует. Протокол — строками в stdout, их читает blender.mjs:

    BLENDER-STEP <что делается>
    BLENDER-WARN <предупреждение>
    BLENDER-RESULT <json итога>          (последней строкой при успехе; тот же json — в job.result)
    BLENDER-ERROR <причина>              (код выхода 3)

Без Blender (обычный python3) скрипт проверяет задание, ничего не строя:
    python3 run.py --validate <задание.json>   → JOB-OK … | JOB-ERROR …

НЕ ПРОВЕРЕНО ЗАПУСКОМ В BLENDER (05.10.2026): при разработке Blender на машине не было. Проверены только
синтаксис (Python 3.11) и разбор заданий. Первый запуск на машине владельца — проверка самого конвейера.
"""
import sys as _sys
_sys.dont_write_bytecode = True   # Blender не оставляет __pycache__ в папке скилла

import importlib.util
import json
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

MODES = ("probe", "render", "physics", "glb")
JOB_VERSION = 1


def emit(tag, text):
    print("BLENDER-%s %s" % (tag, text), flush=True)


def step(text):
    emit("STEP", text)


def warn(text):
    emit("WARN", text)


# --------------------------------------------------------------------------------------------
# Задание (без bpy)
# --------------------------------------------------------------------------------------------

def job_path_from_argv(argv):
    rest = argv[argv.index("--") + 1:] if "--" in argv else []
    if not rest:
        raise ValueError("нужен путь к заданию JSON после «--»: blender -b -P run.py -- задание.json")
    return rest[0]


def load_job(path):
    with open(path, "r", encoding="utf-8") as f:
        job = json.load(f)
    errs = validate_job(job)
    if errs:
        raise ValueError("задание %s: %s" % (path, "; ".join(errs)))
    return job


def validate_job(job):
    """Те же правила, что у blender.mjs: задание, которое он пишет, должно здесь проходить."""
    errs = []
    if not isinstance(job, dict):
        return ["задание — объект JSON"]
    if job.get("version") != JOB_VERSION:
        errs.append("version %r — ожидалась %d (blender.mjs и run.py из разных версий скилла)" % (job.get("version"), JOB_VERSION))
    mode = job.get("mode")
    if mode not in MODES:
        errs.append("mode %r — нужно одно из %s" % (mode, ", ".join(MODES)))
    if mode == "probe":
        return errs
    sc = job.get("scene") or {}
    if sc.get("kind") not in ("py", "json"):
        errs.append("scene.kind — py или json")
    if not sc.get("file") or not os.path.isabs(str(sc.get("file"))):
        errs.append("scene.file — абсолютный путь")
    elif not os.path.isfile(sc["file"]):
        errs.append("нет файла сцены: %s" % sc["file"])
    if not job.get("out_dir") or not os.path.isabs(str(job.get("out_dir"))):
        errs.append("out_dir — абсолютный путь")
    if not job.get("name"):
        errs.append("name — имя файлов результата")
    for k, lo, hi in (("w", 16, 16384), ("h", 16, 16384), ("samples", 1, 65536), ("frames", 2, 10000), ("fps", 1, 240)):
        v = job.get(k)
        if v is not None and (not isinstance(v, int) or not lo <= v <= hi):
            errs.append("%s=%r — целое от %d до %d" % (k, v, lo, hi))
    if job.get("engine", "cycles") not in ("cycles", "eevee"):
        errs.append("engine — cycles или eevee")
    if job.get("device", "auto") not in ("auto", "cpu", "gpu"):
        errs.append("device — auto, cpu или gpu")
    if job.get("tone", "neutral") not in ("neutral", "agx", "filmic", "standard"):
        errs.append("tone — neutral, agx, filmic или standard")
    if job.get("sim", "auto") not in ("auto", "rigid", "cloth"):
        errs.append("sim — auto, rigid или cloth")
    pal = job.get("palette") or {}
    if not isinstance(pal, dict):
        errs.append("palette — объект имя: цвет")
    else:
        from studio import parse_hex
        for k, v in pal.items():
            try:
                parse_hex(v)
            except ValueError as e:
                errs.append("palette.%s: %s" % (k, e))
    if mode == "glb" or (mode == "physics" and (job.get("outputs") or {}).get("glb")):
        g = job.get("glb") or {}
        if not g.get("file") or not str(g["file"]).lower().endswith(".glb"):
            errs.append("glb.file — путь к .glb")
    if sc.get("kind") == "json" and sc.get("file") and os.path.isfile(sc["file"]):
        from studio import validate_spec
        try:
            with open(sc["file"], "r", encoding="utf-8") as f:
                spec = json.load(f)
            errs.extend(validate_spec(spec))
        except ValueError as e:
            errs.append("сцена JSON не разбирается: %s" % e)
    return errs


# --------------------------------------------------------------------------------------------
# Внутри Blender
# --------------------------------------------------------------------------------------------

def load_scene_module(path):
    name = "sr_scene_%s" % abs(hash(path))
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.dirname(path))  # сцена может импортировать свои помощники рядом
    spec.loader.exec_module(mod)
    if not hasattr(mod, "build"):
        raise RuntimeError("в сцене %s нет функции build(ctx)" % path)
    return mod


def build(job):
    import bpy
    import studio
    studio.clear_scene()
    scene = bpy.context.scene
    sc = job["scene"]
    frames = job.get("frames")
    mod = spec = None
    if sc["kind"] == "py":
        mod = load_scene_module(sc["file"])
        frames = frames or getattr(mod, "FRAMES", None)
    else:
        with open(sc["file"], "r", encoding="utf-8") as f:
            spec = json.load(f)
        frames = frames or (spec.get("physics") or {}).get("frames")
    frames = int(frames or 120)
    scene.frame_start = 1
    scene.frame_end = frames
    scene.render.fps = int(job.get("fps") or 30)
    job["frames"] = frames
    ctx = studio.Studio(job)
    step("сцена %s%s" % (os.path.basename(sc["file"]), (" · вариант " + ctx.variant) if ctx.variant else ""))
    if mod is not None:
        opt = mod.build(ctx) or {}
    else:
        opt = studio.build_from_spec(ctx, spec, os.path.dirname(sc["file"]))
    if not isinstance(opt, dict):
        raise RuntimeError("build(ctx) вернул %r — нужен словарь { view, fov, margin, ground } или None" % type(opt).__name__)
    if not studio.items():
        raise RuntimeError("сцена ничего не построила: нет предметов с геометрией (служебные — земля, подложка — не в счёт)")
    return ctx, opt


def render_still(job, path):
    import bpy
    scene = bpy.context.scene
    scene.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    if not os.path.isfile(path):
        raise RuntimeError("рендер прошёл, но файла нет: " + path)
    return round(time.time() - t, 1)


def save_blend(job):
    import bpy
    p = job.get("save_blend")
    if p:
        bpy.ops.wm.save_as_mainfile(filepath=p, copy=True)
        step("сцена сохранена для правки руками: " + p)


def do_probe(job):
    import bpy
    import studio
    import export
    res = {"blender": bpy.app.version_string, "version": list(bpy.app.version), "python": sys.version.split()[0]}
    try:
        res["platform"] = bpy.app.build_platform.decode() if isinstance(bpy.app.build_platform, bytes) else str(bpy.app.build_platform)
    except AttributeError:
        pass
    res["cycles"] = "cycles" in bpy.context.preferences.addons
    gpus = []
    if res["cycles"]:
        try:
            gpus = studio.list_gpus(bpy.context.preferences.addons["cycles"].preferences)
        except Exception as e:
            warn("видеокарты не перечислились: %s" % e)
    res["gpus"] = [{"type": t, "names": n} for t, n in gpus]
    res["gltf"] = hasattr(bpy.ops.export_scene, "gltf")
    res["draco"] = export.draco_available() if res["gltf"] else None
    vs = bpy.context.scene.view_settings
    have = []
    for name in ("Khronos PBR Neutral", "AgX", "Filmic", "Standard"):
        try:
            vs.view_transform = name
            have.append(name)
        except TypeError:
            pass
    res["view_transforms"] = have
    eng = None
    for name in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            bpy.context.scene.render.engine = name
            eng = name
            break
        except TypeError:
            continue
    res["eevee"] = eng
    res["shadow_catcher"] = "is_shadow_catcher" in bpy.types.Object.bl_rna.properties.keys()   # у класса RNA-свойства нет как атрибута
    return res


def do_render(job):
    import bpy
    import studio
    ctx, opt = build(job)
    info = studio.setup_render(job, ctx.warn)
    step("студия: %s, %s сэмплов, %s, денойз %s" % (info.get("engine"), info.get("samples", "—"), _dev(info), "да" if info.get("denoise") else "нет"))
    cam, cinfo = studio.light_scene(ctx, opt, job["w"], job["h"])
    stats = studio.scene_stats(studio.items())
    save_blend(job)
    png = os.path.join(job["out_dir"], job["name"] + ".png")
    step("рендер %d×%d → %s" % (job["w"], job["h"], png))
    sec = render_still(job, png)
    return {"png": png, "seconds": sec, "render": info, "camera": cinfo, "stats": stats, "warnings": ctx.warnings, "variant": ctx.variant}


def _floor_z():
    import bpy
    zs = [o.matrix_world.translation.z for o in bpy.context.scene.objects if o.name.startswith("floor") and o.get("sr_role") == "helper"]
    return min(zs) if zs else 0.0


def _simulate(job, ctx):
    import bpy
    import physics
    import studio
    act, cl = physics.bodies()
    want = job.get("sim", "auto")
    if not act and not cl:
        raise RuntimeError("сцена не создала ни твёрдых тел (ctx.rigid), ни ткани (ctx.cloth) — физике нечего считать")
    if want == "rigid" and not act:
        ctx.warn("--sim rigid, а твёрдых тел в сцене нет (только ткань)")
    if want == "cloth" and not cl:
        ctx.warn("--sim cloth, а ткани в сцене нет (только твёрдые тела)")
    frames = job["frames"]
    step("физика: твёрдых тел %d, тканей %d, кадров %d" % (len(act), len(cl), frames))
    t = time.time()
    tracks = physics.simulate(1, frames, act)
    sim_s = round(time.time() - t, 1)
    _, R, _, _, _ = studio.bounds(studio.items())
    sinfo, sw = physics.checks(tracks, _floor_z(), R, frames)
    for w in sw:
        ctx.warn(w)
    keys = physics.bake_keys(tracks, int((job.get("glb") or {}).get("key_step") or 1)) if act else 0
    bpy.context.scene.frame_set(frames)
    sinfo.update({"seconds": sim_s, "keys": keys, "cloth": [o.name for o in cl], "rigid": len(act), "frames": frames})
    return sinfo, cl


def _all_frames_points(frames, every=6):
    """Углы рамок предметов на кадрах 1…frames: камера, в которую влезает весь полёт."""
    import bpy
    import studio
    pts = []
    for f in list(range(1, frames + 1, every)) + [frames]:
        bpy.context.scene.frame_set(f)
        pts.extend(studio.bounds(studio.items())[4])
    bpy.context.scene.frame_set(frames)
    return pts


def do_physics(job):
    import bpy
    import studio
    import physics
    ctx, opt = build(job)
    info = studio.setup_render(job, ctx.warn)
    sinfo, cloths = _simulate(job, ctx)
    out = {"simulation": sinfo, "render": info, "warnings": ctx.warnings}
    outputs = job.get("outputs") or {}
    if outputs.get("still", True) or outputs.get("video"):
        if job.get("frame_on") == "all":
            opt = dict(opt, points=_all_frames_points(job["frames"]))
        cam, cinfo = studio.light_scene(ctx, opt, job["w"], job["h"])
        out["camera"] = cinfo
    out["stats"] = studio.scene_stats(studio.items())
    save_blend(job)
    scene = bpy.context.scene
    if outputs.get("still", True):
        png = os.path.join(job["out_dir"], job["name"] + ".png")
        step("кадр %d (всё улеглось) → %s" % (job["frames"], png))
        out["png"] = png
        out["seconds"] = render_still(job, png)
    if outputs.get("video"):
        v = job.get("video") or {}
        fdir = os.path.join(job["out_dir"], job["name"] + "-frames")
        os.makedirs(fdir, exist_ok=True)
        if scene.render.engine == "CYCLES" and v.get("samples"):
            scene.cycles.samples = int(v["samples"])
        scene.frame_start, scene.frame_end, scene.frame_step = 1, job["frames"], int(v.get("step") or 1)
        scene.render.filepath = os.path.join(fdir, job["name"] + "-")
        step("кадры 1…%d (шаг %d) → %s" % (job["frames"], scene.frame_step, fdir))
        t = time.time()
        bpy.ops.render.render(animation=True)
        out["frames_dir"] = fdir
        out["video_seconds"] = round(time.time() - t, 1)
        scene.frame_set(job["frames"])
    if outputs.get("glb"):
        out["glb"] = _export(job, ctx, cloths)
    return out


def _export(job, ctx, cloths):
    import bpy
    import export
    import physics
    import studio
    g = job.get("glb") or {}
    anim = bool(g.get("animation"))
    if cloths:
        if anim:
            ctx.warn("анимация ткани в GLB не переносится (glTF не знает кэш точек): ткань — застывшим последним кадром; движение ткани — видео (--video)")
        bpy.context.scene.frame_set(job["frames"])
        for o in cloths:
            physics.freeze(o)
    objs = studio.items()
    has_keys = any(o.animation_data and o.animation_data.action for o in objs)
    if anim and not has_keys:
        ctx.warn("--animation: в сцене нет ключей (нет твёрдых тел) — GLB без анимации")
        anim = False
    baked = 0
    if g.get("bake", "auto") != "off":
        step("запекание процедурных материалов (шум, плетение) в картинки %d px" % int(g.get("tex") or 1024))
        baked = export.bake_materials(objs, int(g.get("tex") or 1024), ctx.warn)
    if g.get("draco") and export.draco_available() is False:
        ctx.warn("в этой сборке Blender нет библиотеки Draco — GLB без сжатия")
        g = dict(g, draco=False)
    step("экспорт GLB → %s%s%s" % (g["file"], " · Draco" if g.get("draco") else "", " · анимация" if anim else ""))
    r = export.export_glb(g["file"], objs, draco=bool(g.get("draco")), animation=anim, frame_range=(1, job["frames"]) if anim else None, warn=ctx.warn)
    r.update({"baked": baked, "animation": anim, "objects": len(objs)})
    return r


def do_glb(job):
    import studio
    import physics
    ctx, opt = build(job)
    act, cl = physics.bodies()
    out = {"warnings": ctx.warnings}
    cloths = []
    if act or cl:
        studio.setup_render(dict(job, samples=16), ctx.warn)
        sinfo, cloths = _simulate(job, ctx)
        out["simulation"] = sinfo
    else:
        studio.setup_render(dict(job, samples=16), ctx.warn)  # Cycles нужен для запекания материалов
        if (job.get("glb") or {}).get("animation"):
            ctx.warn("--animation: в сцене нет физики — анимации нет (свою анимацию сцена ставит ключами сама)")
    out["stats"] = studio.scene_stats(studio.items())
    save_blend(job)
    out["glb"] = _export(job, ctx, cloths)
    return out


def _dev(info):
    d = info.get("device") or {}
    if d.get("device") == "GPU":
        return "GPU %s (%s)" % (d.get("type"), ", ".join(d.get("names") or []))
    return "CPU"


def main():
    path = job_path_from_argv(sys.argv)
    job = load_job(path)
    t = time.time()
    fn = {"probe": do_probe, "render": do_render, "physics": do_physics, "glb": do_glb}[job["mode"]]
    if job["mode"] != "probe":
        os.makedirs(job["out_dir"], exist_ok=True)
    res = fn(job)
    res["mode"] = job["mode"]
    res["total_seconds"] = round(time.time() - t, 1)
    text = json.dumps(res, ensure_ascii=False)
    if job.get("result"):
        with open(job["result"], "w", encoding="utf-8") as f:
            f.write(text)
    emit("RESULT", text)


def cli_validate(argv):
    """python3 run.py --validate задание.json — без Blender."""
    try:
        p = argv[argv.index("--validate") + 1]
        job = load_job(p)
        print("JOB-OK mode=%s%s" % (job["mode"], (" scene=" + os.path.basename(job["scene"]["file"])) if job.get("scene") else ""))
        return 0
    except (IndexError, ValueError, OSError) as e:
        print("JOB-ERROR %s" % e)
        return 1


if __name__ == "__main__":
    try:
        import bpy  # noqa: F401 — внутри Blender
        inside = True
    except ImportError:
        inside = False
    if not inside:
        sys.exit(cli_validate(sys.argv) if "--validate" in sys.argv else 2)
    try:
        main()
    except SystemExit:
        raise
    except BaseException as e:  # причина — одной строкой для blender.mjs, хвост — строками TRACE
        emit("ERROR", str(e).replace("\n", " ") or type(e).__name__)
        for ln in traceback.format_exc().strip().splitlines()[-12:]:
            emit("TRACE", ln)
        sys.stdout.flush()
        sys.exit(3)
