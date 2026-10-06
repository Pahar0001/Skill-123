#!/usr/bin/env node
/**
 * blender.mjs — реалистичные предметы и физика плоскостей в Blender (Cycles): пререндер в прозрачный WebP,
 * падение и укладка (твёрдые тела), драпировка ткани, видео и GLB для сайта. Справочник — reference/blender.md,
 * образцы сцен и страница-просмотрщик GLB — templates/blender/.
 *
 *   node blender.mjs doctor [--json файл]                     где Blender, версия, Cycles и видеокарта, glTF и Draco
 *   node blender.mjs render <сцена.py|сцена.json> [--out папка] [--w 1000] [--h 1000] [--samples 256] [--denoise]
 *        [--palette "bone=#E7E3DD,accent=#C8553D"] [--variant имя[,имя…]] [--transparent | --backdrop] [--bg EFEBE4]
 *        [--trim] [--name имя] [--q 88] [--small 640] [--tone neutral|agx|filmic|standard] [--exposure 0]
 *   node blender.mjs physics <сцена> [--out папка] [--frames 120] [--sim auto|rigid|cloth] [--video] [--webm]
 *        [--webp-frames] [--glb файл.glb] [--fps 30] [--step 1] [--video-samples 64] [--frame-on end|all] (+ флаги render)
 *   node blender.mjs glb <сцена> --out файл.glb|папка [--draco] [--animation] [--for item|scene] [--max-kb N]
 *        [--bake auto|off] [--tex 1024] [--key-step 1] [--frames 120] [--no-check]
 *   node blender.mjs glb-check <файл.glb> [--poster картинка] [--shot файл.png] [--site папка] [--for item|scene] [--max-kb N]
 *   node blender.mjs vendor --out <папка сайта> [--draco]    three.js для страницы: vendor/three/… и glb-viewer.js
 *   node blender.mjs selftest [--keep]                       аргументы, задания, Python, просмотрщик GLB; есть Blender —
 *                                                            ещё и настоящие рендер, физика, экспорт GLB и doctor
 *   node blender.mjs --help | -h
 *
 * Сцена — модуль Python с функцией build(ctx) (образцы в templates/blender/: icon.py, icons.py, honeycomb.py,
 * sprout.py, ribbon.py — предметы; stack.py, drape.py — физика) или
 * описание JSON (templates/blender/cards.json). Blender запускается без окна, с заводскими настройками, со
 * скриптом scripts/blender/run.py и заданием JSON (точная команда печатается перед запуском и при --dry-run).
 * Задание пишется в папку результата (<имя>.job.json), полный вывод Blender — в <имя>.blender.log.
 *
 * Общие флаги сцены (render, physics, glb):
 *   --out           папка результата (blender-out в текущей); у glb — файл .glb или папка
 *   --name          имя файлов (по умолчанию — имя сцены; с вариантом — «имя-вариант»)
 *   --variant       вариант сцены (ctx.variant); несколько через запятую — по кадру на каждый и лист превью
 *   --palette       цвета сайта по именам поверх палитры сцены: "bone=#E7E3DD,accent=#C8553D"
 *   --param         параметры сцены (ctx.param): "count=12,fabric=silk"
 *   --seed          зерно случайности сцены и сэмплера (7)
 *   --save-blend    сохранить собранную сцену <имя>.blend — открыть в Blender и поправить руками
 *   --timeout       предел работы Blender, минут (120)
 *   --dry-run       ничего не запускать: напечатать задание и команду (с --json — записать их в файл)
 *   --json          протокол (или задания при --dry-run) — в этот файл
 *
 * Кадр (render, physics):
 *   --w, --h        размер кадра, px (1000 × 1000)
 *   --samples       сэмплов Cycles на пиксель (256; черновик — 32)
 *   --denoise       денойз OpenImageDenoise (по умолчанию включён); --no-denoise — выключить
 *   --transparent   прозрачный фон и тень на земле в альфе (по умолчанию так); --backdrop — непрозрачная
 *                   подложка-циклорама цвета bg из палитры (цвет после тональной кривой с hex сайта точно не совпадёт)
 *   --bg            цвет поля сайта: превью <имя>-on-<bg>.jpg, лист вариантов, подложка видео mp4
 *   --trim          обрезать прозрачные поля кадра; у предмета с тенью на земле — по самому предмету с запасом
 *                   под тень (--trim-side 0.3, --trim-bottom 0.07 — доли ширины и высоты предмета); печатает,
 *                   на какой доле высоты кадра стоит низ предмета (на столько кадр опускают в вёрстке)
 *   --q             качество WebP (88); --small — ширины малых копий для srcset, px, через запятую (640; 0 — без них)
 *   --tone          тональная кривая: neutral — Khronos PBR Neutral, цвета палитры без сдвига (по умолчанию);
 *                   agx — фотографичнее, яркое уводит в пастель; filmic; standard
 *   --look          «look» тональной кривой (например "Medium High Contrast" у AgX)
 *   --exposure      выдержка, ступени (0): темно — +0.5…+1, пересвет — −0.5
 *   --engine        cycles (по умолчанию) | eevee — быстрый черновик (без трассировки, нужна видеокарта)
 *   --device        auto (видеокарта, если есть) | gpu | cpu
 *
 * physics:
 *   --frames        длина симуляции, кадров (по умолчанию — FRAMES сцены или 120)
 *   --sim           что сцена строит (ctx.sim): auto | rigid — твёрдые тела | cloth — ткань
 *   --frame-on      рамка камеры: end — по улёгшимся предметам (влёт сверху в кадр) | all — весь полёт в кадре
 *   --video         ещё и кадры 1…frames → mp4 (ffmpeg, на цвете --bg); --webm — с прозрачностью (VP9);
 *                   --webp-frames — кадры в WebP; --fps (30), --step — каждый N-й кадр, --video-samples (64)
 *   --glb           ещё и GLB с анимацией падения (ключи на каждом кадре) в этот файл
 *
 * glb, glb-check:
 *   --draco         сжатие геометрии Draco (на странице — декодер, vendor --draco)
 *   --animation     анимация физики в GLB (твёрдые тела → ключи); ткань — всегда застывший последний кадр
 *   --bake          auto — процедурные материалы (шум бумаги, плетение ткани) запечь в картинки | off
 *   --tex           сторона запечённой картинки, px (1024); --key-step — ключ на каждом N-м кадре (1)
 *   --for           бюджет: item — предмет ≤ 1.5 МБ, 150 тыс. вершин | scene — сцена ≤ 4 МБ, 400 тыс.; больше — WARN
 *   --max-kb        свой бюджет веса, КБ
 *   --no-check      не открывать GLB в браузере после экспорта
 *   --poster        картинка-постер для проверки запасного вида (без WebGL); --shot — снимок живого кадра в PNG
 *   --site          папка сайта после vendor: проверять его копию three.js и glb-viewer.js, а не скилла
 *
 * vendor:  --out папка сайта; --draco — ещё декодер Draco. Печатает importmap для страницы.
 * selftest: --keep — не удалять временную папку.
 *
 * Цена: без видеокарты кадр 1000×1000 на 256 сэмплов — минуты (Ryzen 7 6800H: 200 с), черновик --samples 32
 * --w 600 --h 600 — десятки секунд; с видеокартой — секунды. Замеры — reference/blender.md.
 * Окружение: BLENDER_PATH — путь к Blender (файл или папка установки; задан — другие места не ищутся);
 * CHROME_PATH; FFMPEG_PATH; SITE_REWORK_PROJECT.
 * Вердикты: OK; WARN — сделано, посмотреть (вес сверх бюджета, не улеглось, темно, предмет ближе 6 % к краю
 * кадра); FAIL — негодно (пустой кадр,
 * GLB не грузится). Коды: 0 — сделано (и при WARN); 1 — ошибка или FAIL; 2 — нет Blender или зависимостей.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, loadSharp, writeJson, ensureDir, loadPuppeteer, requireChrome, findBrowser, getFfmpeg, contactSheet } from './lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const SKILL = path.dirname(HERE);
const PYDIR = path.join(HERE, 'blender');
const RUN_PY = path.join(PYDIR, 'run.py');
const TPL = path.join(SKILL, 'templates', 'blender');
const FX = path.join(HERE, 'fixtures', 'blender');
const HELP = fs.readFileSync(SELF, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const COMMANDS = ['doctor', 'render', 'physics', 'glb', 'glb-check', 'vendor', 'selftest'];
const MIN_VERSION = [4, 2];
const FIELD_MIN = 0.06;   // предмет ближе к краю кадра — WARN (камера ставит поле 8 %)
/* Python на Windows печатает в кодировке консоли (cp1251), а читаем мы UTF-8: без этих переменных русские
   причины ошибок приходят кракозябрами. Blender свой Python и так держит в UTF-8; run.py перенастраивает вывод сам. */
const PY_ENV = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
const BUDGET = { item: { kb: 1536, verts: 150000, name: 'предмета' }, scene: { kb: 4096, verts: 400000, name: 'сцены' } };

const { pos, opt } = parseArgs(process.argv.slice(2), {
  flags: ['help', 'denoise', 'no-denoise', 'transparent', 'backdrop', 'trim', 'draco', 'animation', 'video', 'webm', 'webp-frames', 'save-blend', 'dry-run', 'no-check', 'keep'],
  values: ['out', 'name', 'variant', 'palette', 'param', 'seed', 'timeout', 'json', 'w', 'h', 'samples', 'bg', 'q', 'small', 'tone', 'look', 'exposure', 'engine', 'device', 'trim-side', 'trim-bottom',
    'frames', 'sim', 'frame-on', 'fps', 'step', 'video-samples', 'glb', 'bake', 'tex', 'key-step', 'for', 'max-kb', 'poster', 'shot', 'site'],
  commands: COMMANDS,
  strict: true,
});
const isMain = process.argv[1] && path.resolve(process.argv[1]) === SELF;

/* ---------------- общее ---------------- */
let fails = 0, warns = 0;
const report = { command: null, files: [], checks: [], warnings: [] };
const die = (m, code = 1) => { console.error(m); process.exit(code); };
const line = (status, what, details = '') => {
  if (status === 'FAIL') fails++;
  if (status === 'WARN') { warns++; report.warnings.push(`${what}${details ? ' — ' + details : ''}`); }
  report.checks.push({ status, what, details });
  console.log(`${status.padEnd(4)} ${what}${details ? ' — ' + details : ''}`);
};
const str = (v) => (v == null || v === true ? null : String(v));
const listOf = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
function numOpt(k, def, { min = -Infinity, max = Infinity, int = false } = {}) {
  if (opt[k] == null) return def;
  const v = Number(opt[k]);
  if (opt[k] === true || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) die(`--${k} ${opt[k] === true ? '(пусто)' : opt[k]}: нужно ${int ? 'целое ' : ''}число${min > -Infinity ? ` от ${min}` : ''}${max < Infinity ? ` до ${max}` : ''}`);
  return v;
}
const oneOf = (k, list, def) => { if (opt[k] == null) return def; if (!list.includes(String(opt[k]))) die(`--${k} ${opt[k] === true ? '(пусто)' : opt[k]}: нужно одно из ${list.join(' | ')}`); return String(opt[k]); };
export const normHex = (v) => { const s = String(v || '').trim().replace(/^#/, ''); if (/^[0-9a-f]{3}$/i.test(s)) return '#' + [...s].map((c) => c + c).join('').toUpperCase(); return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toUpperCase() : null; };
export function parsePalette(v) {
  const out = {};
  for (const kv of listOf(v)) {
    const m = /^([A-Za-z_][\w-]*)\s*=\s*(\S+)$/.exec(kv);
    if (!m) throw new Error(`--palette: «${kv}» — нужна запись имя=#RRGGBB`);
    const h = normHex(m[2]);
    if (!h) throw new Error(`--palette: ${m[1]}=${m[2]} — нужен цвет #RGB или #RRGGBB`);
    out[m[1]] = h;
  }
  return out;
}
export function parseParams(v) {
  const out = {};
  for (const kv of listOf(v)) {
    const m = /^([A-Za-z_]\w*)=(.*)$/.exec(kv);
    if (!m) throw new Error(`--param: «${kv}» — нужна запись имя=значение`);
    out[m[1]] = m[2] !== '' && Number.isFinite(Number(m[2])) ? Number(m[2]) : m[2];
  }
  return out;
}
const kb = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
const sizeOf = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
const exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const isDir = (f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } };

/* ---------------- где Blender ---------------- */
const verKey = (s) => (String(s).match(/\d+/g) || []).map(Number);
const byVersionDesc = (a, b) => { const x = verKey(a), y = verKey(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (y[i] || 0) - (x[i] || 0); if (d) return d; } return 0; };
const safeReaddir = (d) => { try { return fs.readdirSync(d); } catch { return []; } };

/**
 * Места, где ищется Blender, по порядку: [{ path, how }]. platform, env, home, readdir подменяются в selftest —
 * так проверяются Windows, macOS и Linux на любой машине.
 */
export function blenderCandidates({ platform = process.platform, env = process.env, home = os.homedir(), readdir = safeReaddir } = {}) {
  const P = platform === 'win32' ? path.win32 : path.posix;
  const exe = platform === 'win32' ? 'blender.exe' : 'blender';
  const out = [];
  const add = (p, how) => { if (p && !out.some((c) => c.path === p)) out.push({ path: p, how }); };
  for (const dir of String(env.PATH || env.Path || '').split(P.delimiter).filter(Boolean)) add(P.join(dir.replace(/^"|"$/g, ''), exe), 'PATH');
  if (platform === 'darwin') {
    for (const base of ['/Applications', P.join(home, 'Applications')]) {
      add(P.join(base, 'Blender.app', 'Contents', 'MacOS', 'Blender'), base);
      for (const d of readdir(base).filter((n) => /^Blender.*\.app$/i.test(n) && n !== 'Blender.app').sort(byVersionDesc)) add(P.join(base, d, 'Contents', 'MacOS', 'Blender'), base);
    }
    add('/opt/homebrew/bin/blender', 'Homebrew');
    add('/usr/local/bin/blender', 'Homebrew');
  } else if (platform === 'win32') {
    const roots = [env.ProgramW6432, env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && P.join(env.LOCALAPPDATA, 'Programs')].filter(Boolean);
    for (const r of [...new Set(roots)]) {
      const bf = P.join(r, 'Blender Foundation');
      for (const d of readdir(bf).filter((n) => /^Blender/i.test(n)).sort(byVersionDesc)) add(P.join(bf, d, exe), 'Program Files');
    }
    if (env['ProgramFiles(x86)']) add(P.join(env['ProgramFiles(x86)'], 'Steam', 'steamapps', 'common', 'Blender', exe), 'Steam');
    add(P.join(home, 'scoop', 'apps', 'blender', 'current', exe), 'Scoop');
    if (env.LOCALAPPDATA) add(P.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', exe), 'Microsoft Store');
  } else {
    for (const f of ['/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender']) add(f, f.includes('snap') ? 'snap' : 'система');
    add('/var/lib/flatpak/exports/bin/org.blender.Blender', 'flatpak');
    add(P.join(home, '.local', 'share', 'flatpak', 'exports', 'bin', 'org.blender.Blender'), 'flatpak');
    for (const base of ['/opt', home, P.join(home, 'Applications'), P.join(home, 'opt')]) {
      for (const d of readdir(base).filter((n) => /^blender/i.test(n)).sort(byVersionDesc)) add(P.join(base, d, exe), `архив в ${base}`);
    }
  }
  return out;
}

/** Путь из BLENDER_PATH: файл, папка установки или Blender.app. → путь к исполняемому или null. */
function fromBlenderPath(p, platform = process.platform) {
  if (exists(p)) return p;
  if (!isDir(p)) return null;
  const tries = platform === 'win32' ? ['blender.exe'] : platform === 'darwin' ? ['Contents/MacOS/Blender', 'Blender.app/Contents/MacOS/Blender', 'blender'] : ['blender'];
  for (const t of tries) { const f = path.join(p, t); if (exists(f)) return f; }
  return null;
}

/** → { exe, how, tried } или { exe: null, error, tried }. BLENDER_PATH задан — другие места не смотрим. */
export function findBlender(env = process.env) {
  if (env.BLENDER_PATH) {
    const f = fromBlenderPath(env.BLENDER_PATH);
    return f ? { exe: f, how: 'BLENDER_PATH', tried: [env.BLENDER_PATH] } : { exe: null, error: `BLENDER_PATH=${env.BLENDER_PATH}: ни файла Blender, ни папки установки с ним (другие места не проверялись — исправьте или уберите переменную)`, tried: [env.BLENDER_PATH] };
  }
  const list = blenderCandidates({ env });
  const hit = list.find((c) => exists(c.path));
  return hit ? { exe: hit.path, how: hit.how, tried: list.map((c) => c.path) } : { exe: null, error: 'Blender не найден', tried: list.map((c) => c.path) };
}

const shellNeeded = (exe) => process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe);
const q = (s) => (/[\s"&|<>^]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);

/** Версия: blender -b --factory-startup --version → { text, major, minor, patch } или { error }. */
export function blenderVersion(exe) {
  const args = ['-b', '--factory-startup', '--version'];
  const r = shellNeeded(exe) ? spawnSync([q(exe), ...args].join(' '), { shell: true, encoding: 'utf8', timeout: 120000, windowsHide: true }) : spawnSync(exe, args, { encoding: 'utf8', timeout: 120000, windowsHide: true });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const m = /Blender\s+(\d+)\.(\d+)(?:\.(\d+))?([^\r\n]*)/.exec(out);
  if (!m) return { error: r.error ? String(r.error.message) : `не похоже на Blender (код ${r.status}): ${out.trim().split(/\r?\n/)[0] || 'пустой вывод'}` };
  return { text: `${m[1]}.${m[2]}${m[3] ? '.' + m[3] : ''}${m[4] ? m[4].replace(/\s*\(.*$/, '') : ''}`.trim(), major: +m[1], minor: +m[2], patch: +(m[3] || 0) };
}
const oldVersion = (v) => v && !v.error && (v.major < MIN_VERSION[0] || (v.major === MIN_VERSION[0] && v.minor < MIN_VERSION[1]));

/**
 * Запуск задания в Blender. Протокол run.py — строки BLENDER-STEP/WARN/RESULT/ERROR/TRACE; прогресс Cycles
 * («Fra:… Sample 12/256», Blender 4.x) печатается не чаще раза в 15 с; молчит дольше 30 с (Blender 5.x) —
 * строка «считает: N с». Полный вывод — в log.
 */
export function runBlender(exe, jobFile, { timeoutMin = 120, log = null, quiet = false } = {}) {
  const args = ['-b', '--factory-startup', '--python-exit-code', '3', '-P', RUN_PY, '--', jobFile];
  return new Promise((resolve) => {
    const p = shellNeeded(exe) ? spawn([q(exe), ...args.map(q)].join(' '), { shell: true, windowsHide: true, env: PY_ENV }) : spawn(exe, args, { windowsHide: true, env: PY_ENV });
    const res = { code: null, result: null, error: null, trace: [], warnings: [], steps: [] };
    let buf = '', all = '', lastProgress = Date.now();
    const t0 = Date.now();
    /* Blender 5.x в фоновом режиме хода по сэмплам не печатает: чтобы минуты рендера на процессоре не выглядели зависанием — раз в 30 с строка «считает» */
    const beat = quiet ? null : setInterval(() => { if (Date.now() - lastProgress >= 30000) { lastProgress = Date.now(); console.log(`     … Blender считает: ${Math.round((Date.now() - t0) / 1000)} с`); } }, 5000);
    const timer = setTimeout(() => { res.error = `Blender не уложился в ${timeoutMin} мин (--timeout) — остановлен`; p.kill('SIGKILL'); }, timeoutMin * 60000);
    const onLine = (ln) => {
      const m = /^BLENDER-(STEP|WARN|RESULT|ERROR|TRACE) ?(.*)$/.exec(ln);
      if (m) {
        const [, tag, text] = m;
        if (tag === 'STEP') { res.steps.push(text); lastProgress = Date.now(); if (!quiet) console.log(`     · ${text}`); }
        else if (tag === 'WARN') res.warnings.push(text);
        else if (tag === 'RESULT') { try { res.result = JSON.parse(text); } catch (e) { res.error = `итог Blender не разбирается: ${e.message}`; } }
        else if (tag === 'ERROR') res.error = text;
        else res.trace.push(text);
      } else if (/^Fra:\d+/.test(ln) && !quiet && Date.now() - lastProgress > 15000) {
        lastProgress = Date.now();
        console.log(`     … ${ln.replace(/\s*\|\s*Mem:[^|]*/g, '').replace(/\s+/g, ' ').slice(0, 150)}`);
      }
    };
    const feed = (d) => { const s = d.toString(); all += s; buf += s; const parts = buf.split(/\r?\n|\r/); buf = parts.pop(); parts.forEach(onLine); };
    p.stdout.on('data', feed);
    p.stderr.on('data', feed);
    p.on('error', (e) => { res.error = `Blender не запустился: ${e.message}`; });
    p.on('close', (code) => {
      clearTimeout(timer); if (beat) clearInterval(beat);
      if (buf) onLine(buf);
      res.code = code;
      if (log) { try { ensureDir(path.dirname(log)); fs.writeFileSync(log, all); } catch { /* лог — не главное */ } }
      if (!res.result && !res.error) res.error = `Blender вышел с кодом ${code} без итога${/Segmentation|EXCEPTION_ACCESS_VIOLATION|Abort/i.test(all) ? ' — упал (сбой Blender; лог рядом)' : ''}`;
      resolve(res);
    });
  });
}

/* ---------------- зависимости ---------------- */
export function threeDir() {
  const roots = [process.env.SITE_REWORK_PROJECT, path.join(os.homedir(), '.claude', 'site-rework')].filter(Boolean);
  for (const r of roots) { const d = path.join(r, 'node_modules', 'three'); if (exists(path.join(d, 'build', 'three.module.js'))) return d; }
  return null;
}
function findPython() {
  for (const c of process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) {
    const r = spawnSync(c, c === 'py' ? ['-3', '--version'] : ['--version'], { encoding: 'utf8', timeout: 20000, windowsHide: true, env: PY_ENV });
    const m = /Python (\d+)\.(\d+)/.exec(`${r.stdout || ''}${r.stderr || ''}`);
    if (m && +m[1] === 3 && +m[2] >= 8) return { cmd: c === 'py' ? ['py', '-3'] : [c], version: `${m[1]}.${m[2]}` };
  }
  return null;
}

/* ---------------- задание ---------------- */
function sceneArg(file) {
  if (!file) die(`Нужна сцена: node blender.mjs ${report.command} <сцена.py|сцена.json> (образцы — templates/blender/; справка: -h)`);
  const abs = path.resolve(file);
  if (!exists(abs)) die(`Нет файла сцены: ${abs}`);
  const ext = path.extname(abs).toLowerCase();
  if (ext !== '.py' && ext !== '.json') die(`Сцена ${path.basename(abs)}: нужен модуль .py с build(ctx) или описание .json`);
  if (ext === '.json') {
    let spec; try { spec = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { die(`Сцена JSON не разбирается: ${e.message}`); }
    const errs = specErrors(spec);
    if (errs.length) die(`Сцена ${path.basename(abs)}: ${errs.join('; ')}`);
  }
  return { kind: ext.slice(1), file: abs };
}
/* быстрая проверка JSON-сцены до запуска Blender (полная — studio.validate_spec в Python) */
const SHAPES = ['box', 'card', 'cylinder', 'sphere', 'torus', 'plane', 'cloth', 'text', 'import'];
const MATS = ['clay', 'gloss', 'satin', 'metal', 'paper', 'glass', 'glow', 'fabric', 'rubber', 'leafy', 'honey', 'printed'];
export function specErrors(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['сцена JSON — объект { objects: [...] }'];
  if (!Array.isArray(spec.objects) || !spec.objects.length) return ['нет списка objects (хотя бы один предмет)'];
  const errs = [];
  spec.objects.forEach((o, i) => {
    if (!o || typeof o !== 'object') { errs.push(`objects[${i}] — объект`); return; }
    if (!SHAPES.includes(o.type)) errs.push(`objects[${i}].type «${o.type}» — нужно одно из ${SHAPES.join(', ')}`);
    if (o.material != null && !MATS.includes(o.material)) errs.push(`objects[${i}].material «${o.material}» — нужно одно из ${MATS.join(', ')}`);
    if (o.material === 'printed' && !o.image) errs.push(`objects[${i}]: у material printed нужен image (png, jpg или webp рядом со сценой)`);
  });
  return errs;
}

function commonJob(mode, scene, variant) {
  let palette, params;
  try { palette = parsePalette(opt.palette); params = parseParams(opt.param); } catch (e) { die(e.message); }
  if (opt.transparent && opt.backdrop) die('--transparent и --backdrop вместе не бывают: прозрачный фон или подложка');
  if (opt.denoise && opt['no-denoise']) die('--denoise и --no-denoise вместе не бывают');
  const out = path.resolve(str(opt.out) || 'blender-out');
  const base = str(opt.name) || path.basename(scene.file).replace(/\.[^.]+$/, '');
  const name = variant ? `${base}-${variant}` : base;
  return {
    version: 1, mode, scene, out_dir: mode === 'glb' && path.extname(out).toLowerCase() === '.glb' ? path.dirname(out) : out, name,
    w: numOpt('w', 1000, { min: 16, max: 16384, int: true }), h: numOpt('h', 1000, { min: 16, max: 16384, int: true }),
    samples: numOpt('samples', 256, { min: 1, max: 65536, int: true }), denoise: !opt['no-denoise'],
    palette, params, variant: variant || '', seed: numOpt('seed', 7, { min: 0, max: 2 ** 31 - 1, int: true }),
    engine: oneOf('engine', ['cycles', 'eevee'], 'cycles'), device: oneOf('device', ['auto', 'cpu', 'gpu'], 'auto'),
    tone: oneOf('tone', ['neutral', 'agx', 'filmic', 'standard'], 'neutral'), look: str(opt.look), exposure: numOpt('exposure', 0, { min: -10, max: 10 }),
    backdrop: !!opt.backdrop, frames: opt.frames != null ? numOpt('frames', 120, { min: 2, max: 10000, int: true }) : null,
    fps: numOpt('fps', 30, { min: 1, max: 240, int: true }), sim: oneOf('sim', ['auto', 'rigid', 'cloth'], 'auto'),
  };
}
function finishJob(job) {
  job.save_blend = opt['save-blend'] ? path.join(job.out_dir, `${job.name}.blend`) : null;
  job.result = path.join(job.out_dir, `${job.name}.result.json`);
  return job;
}
function buildJobs(cmd) {
  const scene = sceneArg(pos[0]);
  const variants = listOf(opt.variant);
  const jobs = (variants.length ? variants : ['']).map((v) => {
    const job = commonJob(cmd, scene, v);
    if (cmd === 'physics') {
      job.frame_on = oneOf('frame-on', ['end', 'all'], 'end');
      job.outputs = { still: true, video: !!opt.video || !!opt.webm || !!opt['webp-frames'], glb: opt.glb != null };
      job.video = { step: numOpt('step', 1, { min: 1, max: 100, int: true }), samples: numOpt('video-samples', Math.min(64, job.samples), { min: 1, max: 65536, int: true }) };
      if (opt.glb != null) {
        const g = str(opt.glb); if (!g || path.extname(g).toLowerCase() !== '.glb') die('--glb: нужен путь к файлу .glb');
        job.glb = { file: path.resolve(variants.length > 1 ? g.replace(/\.glb$/i, `-${v}.glb`) : g), draco: !!opt.draco, animation: true, bake: oneOf('bake', ['auto', 'off'], 'auto'), tex: numOpt('tex', 1024, { min: 128, max: 8192, int: true }), key_step: numOpt('key-step', 1, { min: 1, max: 100, int: true }) };
      }
    }
    if (cmd === 'glb') {
      const o = str(opt.out); if (!o) die('glb: нужен --out файл.glb или папка');
      const ext = path.extname(o).toLowerCase(); if (ext && ext !== '.glb') die(`--out ${o}: нужен файл .glb или папка`);
      const file = ext === '.glb' ? path.resolve(variants.length > 1 ? o.replace(/\.glb$/i, `-${v}.glb`) : o) : path.join(path.resolve(o), `${job.name}.glb`);
      if (ext === '.glb' && !opt.name) job.name = path.basename(file, '.glb');
      job.glb = { file, draco: !!opt.draco, animation: !!opt.animation, bake: oneOf('bake', ['auto', 'off'], 'auto'), tex: numOpt('tex', 1024, { min: 128, max: 8192, int: true }), key_step: numOpt('key-step', 1, { min: 1, max: 100, int: true }) };
    }
    return finishJob(job);
  });
  return jobs;
}
const commandLine = (exe, jobFile) => [exe || 'blender', '-b', '--factory-startup', '--python-exit-code', '3', '-P', RUN_PY, '--', jobFile].map(q).join(' ');

function needBlender() {
  const b = findBlender();
  if (!b.exe) {
    die(`НЕ СДЕЛАНО: ${b.error}.${b.tried.length && !process.env.BLENDER_PATH ? ` Искал: ${b.tried.slice(0, 8).join('; ')}${b.tried.length > 8 ? ` и ещё ${b.tried.length - 8}` : ''}.` : ''}
Поставить Blender 4.2 LTS или новее (бесплатно) и/или указать путь в BLENDER_PATH; что ставить на этой системе — node blender.mjs doctor.
Предметы с объёмом рендерит только Blender. Без него остаются: мелкий объёмный значок в SVG — svg3d.mjs, набросок — templates/sketch2d; задание без запуска — --dry-run.`, 2);
  }
  const v = blenderVersion(b.exe);
  if (v.error) die(`FAIL Blender ${b.exe} не отвечает: ${v.error}`, 1);
  if (oldVersion(v)) console.log(`WARN Blender ${v.text} старше ${MIN_VERSION.join('.')}: конвейер писался под 4.2 LTS+, имена в API могли быть другими — лучше обновить`);
  return { ...b, version: v };
}

/* ---------------- после Blender: кадр, видео, GLB ---------------- */

/** Пиксели кадра: доля заполнения, яркость предмета, пересвет, упор в край. */
export async function measureImage(sharp, buf, { opaque = false } = {}) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  let ref = null;
  if (opaque) { const corners = [0, W - 1, (H - 1) * W, N - 1].map((i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]); ref = corners.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2])[1]; }
  let filled = 0, solid = 0, lum = 0, clipped = 0, edge = 0, edgeN = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    const on = opaque ? Math.max(Math.abs(r - ref[0]), Math.abs(g - ref[1]), Math.abs(b - ref[2])) > 14 : a > 8;
    const firm = opaque ? on : a > 200;
    if (on) filled++;
    if (firm) { solid++; lum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; if (Math.min(r, g, b) >= 250) clipped++; }
    const x = i % W, y = (i / W) | 0;
    if (firm) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { edgeN++; if (firm && !opaque) edge++; }
  }
  /* поле: от плотных пикселей предмета (тень на земле полупрозрачна — не в счёт) до ближайшего края, доля стороны */
  const box = x1 >= x0 ? { x0, x1, y0, y1 } : null;
  const field = box ? Math.min(x0 / W, (W - 1 - x1) / W, y0 / H, (H - 1 - y1) / H) : null;
  return { width: W, height: H, share: filled / N, light: solid ? lum / solid : 0, clipped: solid ? clipped / solid : 0, edge: edgeN ? edge / edgeN : 0, field, box };
}

/** Рамка стоящего предмета с тенью на земле: по плотным пикселям предмета, с запасом по бокам и снизу под тень.
 *  → { left, top, width, height, foot } — foot: на какой доле высоты новой рамки стоит низ предмета. */
export function groundCrop(box, W, H, { side = 0.3, bottom = 0.07 } = {}) {
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  const left = Math.max(0, Math.round(box.x0 - w * side)), right = Math.min(W, Math.round(box.x1 + w * side));
  const top = Math.max(0, box.y0 - 4), bot = Math.min(H, Math.round(box.y1 + h * bottom));
  return { left, top, width: right - left, height: bot - top, foot: (box.y1 - top) / (bot - top) };
}

async function postStill(png, job, { label = job.name, bleed = false, ground = false } = {}) {
  const sharp = loadSharp();
  if (!sharp) { line('WARN', label, `нет sharp — WebP и проверки кадра не сделаны (npm i sharp --prefix ~/.claude/site-rework); PNG: ${png}`); return null; }
  if (!exists(png)) { line('FAIL', label, `Blender не записал кадр ${png}`); return null; }
  const out = path.dirname(png), base = path.basename(png, '.png');
  let buf = fs.readFileSync(png);
  const whole = await measureImage(sharp, buf, { opaque: !!job.backdrop });   // поле до края — по кадру до обрезки
  let foot = null;
  if (opt.trim && !job.backdrop) {
    /* предмет на земле: тень расходится далеко — обрезка «по прозрачному» оставила бы предмет мелким; режем по
       самому предмету с запасом под тень и говорим, где его низ */
    if (ground && whole.box) {
      const c = groundCrop(whole.box, whole.width, whole.height, { side: numOpt('trim-side', 0.3, { min: 0, max: 5 }), bottom: numOpt('trim-bottom', 0.07, { min: 0, max: 5 }) });
      buf = await sharp(buf).extract({ left: c.left, top: c.top, width: c.width, height: c.height }).png().toBuffer();
      foot = c.foot;
    } else buf = await sharp(buf).trim({ threshold: 2 }).png().toBuffer();
    fs.writeFileSync(png, buf);
  }
  const q = numOpt('q', 88, { min: 1, max: 100, int: true });
  const webp = path.join(out, `${base}.webp`);
  await sharp(buf).webp({ quality: q, alphaQuality: 90, effort: 5 }).toFile(webp);
  const m = await measureImage(sharp, buf, { opaque: !!job.backdrop });
  const files = [png, webp];
  const smalls = [];
  for (const sv of opt.small == null ? ['640'] : listOf(opt.small)) {
    const small = Number(sv);
    if (!Number.isInteger(small) || small < 0 || small > 8192) die(`--small ${sv}: нужны целые ширины от 0 до 8192 через запятую`);
    if (small && m.width > small) { const f = path.join(out, `${base}-${small}.webp`); await sharp(buf).resize({ width: small }).webp({ quality: q, alphaQuality: 90, effort: 5 }).toFile(f); files.push(f); smalls.push(f); }
    else if (small) console.log(`     малая копия ${small} px не нужна: кадр ${m.width} px не шире`);
  }
  const bg = opt.bg != null ? normHex(opt.bg) : null;
  if (opt.bg != null && !bg) line('WARN', '--bg', `${opt.bg}: не цвет — превью не построено`);
  if (bg) { const f = path.join(out, `${base}-on-${bg.slice(1)}.jpg`); await sharp(buf).flatten({ background: bg }).jpeg({ quality: 88 }).toFile(f); files.push(f); }
  report.files.push(...files);
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const detail = `${m.width}×${m.height}, заполнено ${pct(m.share)}, яркость предмета ${m.light.toFixed(2)}, ${whole.field != null ? `поле ${pct(whole.field)}, ` : ''}webp ${kb(sizeOf(webp))}${smalls.length ? `, малые ${smalls.map((f) => kb(sizeOf(f))).join(' и ')}` : ''}`;
  if (m.share < 0.01) line('FAIL', `${label}: пустой кадр`, `${detail} — предмет не в кадре или не построен; открыть ${png}`);
  else line('OK', label, detail);
  if (m.share >= 0.01 && m.light < 0.12) line('WARN', `${label}: темно`, `средняя яркость ${m.light.toFixed(2)} — --exposure +0.5…+1 или светлее материалы`);
  if (m.clipped > 0.03) line('WARN', `${label}: пересвет`, `${pct(m.clipped)} предмета белые без деталей — --exposure −0.5, слабее glow, --tone agx`);
  /* край кадра: у сцены, которая сама выводит предмет за край (bleed: лента через весь экран), это замысел */
  if (!bleed && whole.edge > 0.02) line('WARN', `${label}: упирается в край кадра`, `${pct(whole.edge)} рамки занято предметом — больше margin в ответе сцены или --frame-on all`);
  else if (!bleed && whole.share >= 0.01 && whole.field != null && whole.field < FIELD_MIN) line('WARN', `${label}: предмет близко к краю кадра`, `поле ${pct(whole.field)}, нужно не меньше ${pct(FIELD_MIN)} — больше margin в ответе сцены (по умолчанию 1.19 — поля по 8 %); свои distance и target — отодвинуть камеру`);
  if (foot != null) console.log(`     низ предмета на ${pct(foot)} высоты кадра — на столько же опустить кадр в вёрстке (transform: translateY), тень ляжет ниже линии`);
  return { png, files, ...m, field: whole.field, foot };
}

async function framesToVideo(dir, job) {
  const sharp = loadSharp();
  const frames = safeReaddir(dir).filter((f) => /\.png$/i.test(f)).sort();
  const expect = Math.ceil(job.frames / job.video.step);
  if (!frames.length) { line('FAIL', 'кадры видео', `в ${dir} нет PNG`); return; }
  line(frames.length === expect ? 'OK' : 'WARN', 'кадры видео', `${frames.length}${frames.length === expect ? '' : ` из ${expect} ожидаемых`} → ${dir}`);
  if (opt['webp-frames'] && sharp) {
    for (const f of frames) await sharp(path.join(dir, f)).webp({ quality: numOpt('q', 88, { min: 1, max: 100, int: true }), alphaQuality: 90 }).toFile(path.join(dir, f.replace(/\.png$/i, '.webp')));
    line('OK', 'кадры WebP', `${frames.length} шт. рядом с PNG (для покадровой анимации на холсте)`);
  }
  if (!opt.video && !opt.webm) return;
  const ff = getFfmpeg();
  if (!ff) { line('WARN', 'видео', 'нет ffmpeg — mp4 не собран: npm i ffmpeg-static --prefix ~/.claude/site-rework или FFMPEG_PATH'); return; }
  if (!sharp) { line('WARN', 'видео', 'нет sharp — кадры не подготовить'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-video-'));
  const bg = normHex(opt.bg) || '#FFFFFF';
  const fps = Math.max(1, job.fps / job.video.step);
  try {
    for (let i = 0; i < frames.length; i++) {
      const src = path.join(dir, frames[i]), n = String(i + 1).padStart(5, '0');
      if (opt.video) await sharp(src).flatten({ background: bg }).png().toFile(path.join(tmp, `f-${n}.png`));
      if (opt.webm) fs.copyFileSync(src, path.join(tmp, `a-${n}.png`));
    }
    const enc = (args, file, what) => {
      const r = spawnSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(fps), ...args, file], { encoding: 'utf8', timeout: 30 * 60000, windowsHide: true });
      if (r.status !== 0 || !exists(file)) { line('FAIL', what, `ffmpeg: ${(r.stderr || r.error || '').toString().trim().split('\n').pop()}`); return; }
      report.files.push(file);
      const sz = sizeOf(file);
      line(sz > 4 * 1024 * 1024 ? 'WARN' : 'OK', what, `${kb(sz)}, ${frames.length} кадров, ${(frames.length / fps).toFixed(1)} с${sz > 4 * 1024 * 1024 ? ' — тяжело для сайта: меньше --w/--h, --step 2 или короче --frames' : ''} → ${file}`);
    };
    const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    if (opt.video) enc(['-i', path.join(tmp, 'f-%05d.png'), '-vf', even, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', '-an'], path.join(job.out_dir, `${job.name}.mp4`), `видео mp4 на ${bg}`);
    if (opt.webm) enc(['-i', path.join(tmp, 'a-%05d.png'), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-an'], path.join(job.out_dir, `${job.name}.webm`), 'видео webm с прозрачностью');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** Разбор GLB без браузера: заголовок, JSON, вершины по аксессорам, анимации, расширения, картинки. */
export function parseGlb(buf) {
  if (buf.length < 20) throw new Error(`файл ${buf.length} байт — не GLB`);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('нет сигнатуры glTF — не GLB (может быть, .gltf с отдельным .bin?)');
  const ver = buf.readUInt32LE(4), len = buf.readUInt32LE(8);
  if (ver !== 2) throw new Error(`версия контейнера ${ver}, нужна 2`);
  if (len !== buf.length) throw new Error(`длина в заголовке ${len}, файл ${buf.length} байт — файл обрезан или испорчен`);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const cl = buf.readUInt32LE(off), ct = buf.readUInt32LE(off + 4);
    if (off + 8 + cl > buf.length) throw new Error('кусок данных выходит за конец файла — файл обрезан');
    const chunk = buf.subarray(off + 8, off + 8 + cl);
    if (ct === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').replace(/[\s\0]+$/, ''));
    else if (ct === 0x004e4942) bin = chunk;
    off += 8 + cl;
  }
  if (!json) throw new Error('нет JSON-части');
  if (!json.asset || !String(json.asset.version).startsWith('2')) throw new Error(`asset.version ${json.asset && json.asset.version} — нужен glTF 2.0`);
  const acc = json.accessors || [];
  let vertices = 0, triangles = 0, prims = 0;
  for (const m of json.meshes || []) for (const p of m.primitives || []) {
    prims++;
    const a = acc[p.attributes && p.attributes.POSITION];
    const n = a ? a.count : 0; vertices += n;
    const mode = p.mode == null ? 4 : p.mode;
    if (mode === 4) triangles += p.indices != null && acc[p.indices] ? acc[p.indices].count / 3 : n / 3;
  }
  let duration = 0;
  for (const an of json.animations || []) for (const s of an.samplers || []) { const a = acc[s.input]; if (a && a.max) duration = Math.max(duration, a.max[0]); }
  const views = json.bufferViews || [];
  const images = (json.images || []).map((im) => ({ mime: im.mimeType || (im.uri ? 'внешний файл' : '?'), bytes: im.bufferView != null && views[im.bufferView] ? views[im.bufferView].byteLength : 0, view: im.bufferView, uri: im.uri || null }));
  const external = (json.buffers || []).filter((b) => b.uri).map((b) => b.uri).concat(images.filter((i) => i.uri && !/^data:/.test(i.uri)).map((i) => i.uri));
  return {
    bytes: buf.length, generator: json.asset.generator || '', meshes: (json.meshes || []).length, primitives: prims, nodes: (json.nodes || []).length,
    materials: (json.materials || []).length, vertices, triangles: Math.round(triangles), animations: (json.animations || []).length, duration: +duration.toFixed(3),
    extensions: json.extensionsUsed || [], required: json.extensionsRequired || [], images, external, json, bin,
  };
}

async function glbStatic(file, { kind = 'item' } = {}) {
  let g;
  try { g = parseGlb(fs.readFileSync(file)); } catch (e) { line('FAIL', path.basename(file), `не GLB: ${e.message}`); return null; }
  const b = BUDGET[kind];
  const limit = opt['max-kb'] != null ? numOpt('max-kb', b.kb, { min: 1 }) : b.kb;
  line('OK', path.basename(file), `${kb(g.bytes)} · сеток ${g.meshes} (частей ${g.primitives}), вершин ${g.vertices}, треугольников ${g.triangles}, материалов ${g.materials}, картинок ${g.images.length}, анимаций ${g.animations}${g.duration ? ` (${g.duration} с)` : ''}${g.extensions.length ? ` · ${g.extensions.join(', ')}` : ''}`);
  if (g.bytes > limit * 1024) line('WARN', `вес сверх бюджета ${b.name}`, `${kb(g.bytes)} > ${kb(limit * 1024)} — --draco, меньше --tex, меньше сегментов и предметов; для сцены — --for scene`);
  if (g.vertices > b.verts) line('WARN', `вершин сверх бюджета ${b.name}`, `${g.vertices} > ${b.verts} — меньше сегментов, Subdivision ниже, у ткани реже сетка (--param grid=48)`);
  if (g.external.length) line('FAIL', 'внешние файлы', `GLB ссылается наружу (${g.external.slice(0, 3).join(', ')}) — на сайте не загрузятся; экспортировать GLB целиком`);
  const sharp = loadSharp();
  if (sharp && g.bin) for (const im of g.images) {
    if (im.view == null) continue;
    const v = g.json.bufferViews[im.view];
    try { const md = await sharp(g.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)).metadata(); if (Math.max(md.width, md.height) > 2048) line('WARN', 'картинка в GLB', `${md.width}×${md.height} (${kb(v.byteLength)}) — для сайта хватает 1024–2048: --tex 1024`); } catch { /* не растр — пропустить */ }
  }
  if (g.required.includes('KHR_draco_mesh_compression')) line('OK', 'Draco', 'на странице нужен декодер: vendor --draco (vendor/three/examples/jsm/libs/draco/gltf/)');
  delete g.json; delete g.bin;
  return g;
}

/* сервер страницы проверки: viewer.html и viewer.js из шаблона (или сайта), three — из зависимостей (или сайта) */
function viewerServer({ file, poster, site }) {
  const three = site ? path.join(site, 'vendor', 'three') : threeDir();
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
  const hits = [];
  const inside = (root, rel) => { const p = path.normalize(path.join(root, rel)); return p.startsWith(path.normalize(root + path.sep)) ? p : null; };
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    hits.push(u);
    let p = null;
    /* ?below=1 — блок ниже экрана (проверка ленивого запуска): правка страницы только в этом сервере */
    /* ?loop=1 — анимация по кругу (проверка паузы вне экрана: сама такая анимация не остановится) */
    if ((u === '/viewer.html' || u === '/') && /[?&](below|loop)=1/.test(req.url)) {
      let html = fs.readFileSync(path.join(TPL, 'viewer.html'), 'utf8');
      if (/[?&]below=1/.test(req.url)) html = html.replace('</head>', '<style>.glb-viewer{margin-top:300vh}</style></head>');
      if (/[?&]loop=1/.test(req.url)) html = html.replaceAll('<figure class="glb-viewer"', '<figure class="glb-viewer" data-loop="repeat"');
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (u === '/model.glb') p = file;
    else if (poster && (u === '/poster' + path.extname(poster).toLowerCase() || u === '/model.webp')) p = poster;
    else if (u.startsWith('/vendor/three/')) p = inside(three, u.slice('/vendor/three/'.length));
    else if (u === '/viewer.js' && site) p = path.join(site, 'glb-viewer.js');
    else if (u === '/' || u === '/viewer.html' || u === '/viewer.js') p = path.join(TPL, u === '/' ? 'viewer.html' : u.slice(1));
    if (!p || !exists(p)) { res.writeHead(404); return res.end('нет файла'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  });
  return { server, hits, three };
}

/** Проверка GLB в странице viewer.html (один браузер, вкладки по очереди). */
async function glbBrowser(file, { poster = null, shot = null, site = null } = {}) {
  const sharp = loadSharp();
  const { server, hits, three } = viewerServer({ file, poster, site });
  if (!three || !exists(path.join(three, 'build', 'three.module.js'))) { line('FAIL', 'страница', site ? `в ${site} нет vendor/three — node blender.mjs vendor --out ${site}` : 'нет three.js — npm i three --prefix ~/.claude/site-rework'); return null; }
  if (site && !exists(path.join(site, 'glb-viewer.js'))) { line('FAIL', 'страница', `в ${site} нет glb-viewer.js — node blender.mjs vendor --out ${site}`); return null; }
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const posterQ = poster ? `&poster=/poster${path.extname(poster).toLowerCase()}` : '&poster=';
  const url = `${base}/viewer.html?src=/model.glb${posterQ}`;
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({ executablePath: requireChrome(), headless: true, protocolTimeout: 300000, args: ['--no-sandbox', '--hide-scrollbars', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = (page) => page.evaluate(() => { const f = document.querySelector('.glb-viewer'); const c = f && f.glbViewer; return c ? { state: c.state, frames: c.frames, stats: c.stats, reduced: c.reduced } : null; });
  /* пределы ожидания — под нагрузкой (рядом ещё несколько браузеров): программный WebGL грузит three.js и модель до минуты */
  const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v || Date.now() - t > ms) return v; await sleep(150); } };
  const waitState = (page, list, ms = 150000) => page.waitForFunction((l) => { const f = document.querySelector('.glb-viewer'); return f && f.glbViewer && l.includes(f.glbViewer.state); }, { timeout: ms, polling: 100 }, list).then(() => true, () => false);
  const open = async ({ vp = { width: 1200, height: 900, deviceScaleFactor: 1 }, before = null, reduced = false, query = '' } = {}) => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    /* «Failed to load resource» без адреса не берём — тот же случай ловит response с адресом; постер образца
       (model.webp) без --poster не существует — не ошибка */
    const skipUrl = (u) => /favicon/.test(u) || (!poster && /\/model\.webp$/.test(u));
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/^Failed to load resource/.test(t)) errors.push(t); if (m.type() === 'warning' && /glb-viewer/.test(t)) errors.push(t); });
    /* ERR_ABORTED — запрос прервала сама страница (закрытие вкладки, пауза вне экрана): не сбой; настоящий сбой — код ответа (ниже) или другая причина */
    page.on('requestfailed', (r) => { const why = (r.failure() || {}).errorText || ''; if (!skipUrl(r.url()) && !/ERR_ABORTED/.test(why)) errors.push(`не загрузилось: ${r.url().replace(base, '')}${why ? ' (' + why + ')' : ''}`); });
    page.on('response', (r) => { if (r.status() >= 400 && !skipUrl(r.url())) errors.push(`HTTP ${r.status()}: ${r.url().replace(base, '')}`); });
    await page.setViewport(vp);
    if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (before) await page.evaluateOnNewDocument(before);
    await page.goto(url + query, { waitUntil: 'load', timeout: 150000 });
    return { page, errors };
  };
  let stats = null;
  try {
    /* 1. обычный показ: грузится, рисует непустой кадр, плотность буфера ≤ 2, в покое не рисует, анимация идёт */
    {
      const { page, errors } = await open({ vp: { width: 1200, height: 900, deviceScaleFactor: 3 } });
      const ok = await waitState(page, ['ready', 'error', 'fallback']);
      const s = await state(page);
      if (!ok || !s || s.state !== 'ready') { line('FAIL', 'GLB в странице', `состояние ${s ? s.state : 'нет просмотрщика'}${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`); await page.close(); return null; }
      stats = s.stats;
      line('OK', 'GLB в странице', `загрузился: сеток ${stats.meshes}, вершин ${stats.vertices}, треугольников ${stats.triangles}, анимаций ${stats.animations}${stats.duration ? ` (${stats.duration} с)` : ''}`);
      const buf = await page.evaluate(() => { const c = document.querySelector('.glb-canvas'); return { w: c.width, css: c.clientWidth }; });
      line(buf.w <= buf.css * 2 + 2 ? 'OK' : 'WARN', 'плотность холста', `буфер ${buf.w} px на ${buf.css} CSS px при DPR 3 (предел 2)`);
      const f0 = (await state(page)).frames;
      /* анимация: ждём первый новый кадр до 10 с (под нагрузкой за 1.2 с кадра могло не быть); покой — те же 1.2 с */
      let s1;
      if (stats.animations) s1 = (await until(async () => { const x = await state(page); return x.frames > f0 && x.stats.time > 0 ? x : null; })) || await state(page);
      else { await sleep(1200); s1 = await state(page); }
      if (stats.animations) line(s1.frames > f0 && s1.stats.time > 0 ? 'OK' : 'FAIL', 'анимация идёт', `новых кадров: ${s1.frames - f0}, время ${s1.stats.time} с`);
      else line(s1.frames === f0 ? 'OK' : 'WARN', 'в покое не рисует', `кадров за 1.2 с без движения: ${s1.frames - f0}`);
      line(errors.length ? 'FAIL' : 'OK', 'консоль', errors.length ? errors.slice(0, 4).join(' | ') : 'без ошибок');
      await page.close();
    }
    /* 1б. пауза вне экрана — на анимации по кругу: анимация «один раз» длиной 1,6 с под нагрузкой успевала доиграть раньше,
       чем срабатывал наблюдатель видимости, и счётчик кадров замирал сам — проверка то мигала, то проходила зря */
    if (stats.animations) {
      const { page } = await open({ query: '&loop=1' });
      const ok = await waitState(page, ['ready']);
      const looped = ok && await page.evaluate(() => document.querySelector('.glb-viewer').dataset.loop === 'repeat');
      const f0 = ok ? (await state(page)).frames : 0;
      const runs = ok && await until(async () => (await state(page)).frames > f0);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      let a = ok ? (await state(page)).frames : 0, stopped = false;
      for (let k = 0; k < 30 && ok; k++) { await sleep(400); const n = (await state(page)).frames; if (n === a) { stopped = true; break; } a = n; }
      await sleep(1000);
      const b2 = ok ? (await state(page)).frames : 0;
      line(ok && looped && runs && stopped && b2 === a ? 'OK' : 'FAIL', 'вне экрана — пауза', !ok ? `страница с анимацией по кругу не загрузилась: ${(await state(page) || {}).state}` : !looped ? 'анимация по кругу не включилась (data-loop) — проверка не состоялась' : !runs ? 'анимация по кругу не пошла' : `анимация по кругу; кадров за 1 с вне экрана: ${b2 - a}${stopped ? '' : ' — за 12 с вне экрана рисование не остановилось'}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      const c = ok ? ((await until(async () => { const x = (await state(page)).frames; return x > b2 ? x : 0; })) || (await state(page)).frames) : 0;
      line(c > b2 ? 'OK' : 'WARN', 'снова на экране — продолжает', `кадров после возврата: ${c - b2}`);
      await page.close();
    }
    /* 2. ленивый запуск: блок ниже экрана — ни three.js, ни модели; подвели — загрузилось */
    {
      hits.length = 0;
      const { page } = await open({ query: '&below=1' });
      await sleep(1500);
      const s = await state(page);
      const early = hits.filter((h) => h === '/model.glb' || /three\.module\.js$/.test(h));
      line(s && s.state === 'idle' && !early.length ? 'OK' : 'FAIL', 'ленивый запуск', s && s.state === 'idle' && !early.length ? 'блок ниже экрана: ни three.js, ни модели не скачано' : `состояние ${s && s.state}, скачано заранее: ${early.join(', ') || '—'}`);
      await page.evaluate(() => document.querySelector('.glb-viewer').scrollIntoView());
      const ok = await waitState(page, ['ready']);
      line(ok ? 'OK' : 'FAIL', 'подвели к экрану — загрузилось', ok ? '' : `состояние ${(await state(page) || {}).state}`);
      await page.close();
    }
    /* 3. «меньше движения»: статичный кадр, анимация в конечном положении */
    {
      const { page } = await open({ reduced: true });
      const ok = await waitState(page, ['ready']);
      const a = await state(page); await sleep(1200); const b2 = await state(page);
      const still = ok && b2.frames === a.frames;
      /* кадр — конечное положение («улеглось»): он же годится постером; пустой — модель вне камеры */
      if (ok) {
        const snap = await page.evaluate(() => document.querySelector('.glb-viewer').glbViewer.snapshot());
        const png = Buffer.from(snap.split(',')[1], 'base64');
        if (shot) { ensureDir(path.dirname(path.resolve(shot))); fs.writeFileSync(path.resolve(shot), png); report.files.push(path.resolve(shot)); }
        if (sharp) { const m = await measureImage(sharp, png); line(m.share > 0.005 ? 'OK' : 'FAIL', 'кадр в странице', `модель занимает ${(m.share * 100).toFixed(1)}% холста${m.share > 0.005 ? '' : ' — пусто: модель вне камеры или без материалов'}${shot ? ` → ${path.resolve(shot)}` : ''}`); }
      }
      const end = !stats.animations || Math.abs(b2.stats.time - stats.duration) < 0.05;
      line(still && end ? 'OK' : 'FAIL', '«меньше движения»', still && end ? `статичный кадр${stats.animations ? ', анимация в конечном положении' : ''}` : `кадров за 1.2 с: ${b2 ? b2.frames - a.frames : '?'}, время ${b2 && b2.stats ? b2.stats.time : '?'} из ${stats.duration}`);
      await page.close();
    }
    /* 4. без WebGL: запасная картинка, three.js не скачивается */
    {
      hits.length = 0;
      const { page } = await open({ before: () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(String(t)) ? null : g.call(this, t, ...a); }; } });
      const ok = await waitState(page, ['fallback'], 60000);
      const pv = await page.evaluate(() => { const i = document.querySelector('.glb-poster'); return i ? { ok: i.complete && i.naturalWidth > 0, op: getComputedStyle(i).opacity } : null; });
      const three = hits.some((h) => /three\.module\.js$/.test(h));
      const posterOk = !poster || (pv && pv.ok && pv.op !== '0');
      line(ok && !three && posterOk ? 'OK' : 'FAIL', 'без WebGL — запасная картинка', ok && !three && posterOk ? (poster ? 'постер на месте, three.js не скачан' : 'состояние fallback, three.js не скачан (постер не задан — --poster)') : `состояние ${(await state(page) || {}).state}, three.js ${three ? 'скачан' : 'нет'}, постер ${pv ? (pv.ok ? 'есть' : 'не загрузился') : 'нет'}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return stats;
}

async function glbReport(file, { kind, poster = null, shot = null, site = null, check = true } = {}) {
  const g = await glbStatic(file, { kind });
  if (!g) return null;
  if (!check) return g;
  if (!findBrowser('chrome')) { line('WARN', 'проверка в браузере', 'Chrome не найден (CHROME_PATH) — GLB в странице не проверен'); return g; }
  try { await glbBrowser(file, { poster, shot, site }); } catch (e) { line('FAIL', 'проверка в браузере', String(e.message || e).split('\n')[0]); }
  return g;
}

/* ---------------- vendor: three.js для страницы ---------------- */
export function importClosure(root, entries) {
  const seen = new Set(), missing = [], queue = [...entries];
  while (queue.length) {
    const rel = queue.shift().split(path.sep).join('/');
    if (seen.has(rel)) continue;
    const abs = path.join(root, rel);
    if (!exists(abs)) { missing.push(rel); continue; }
    seen.add(rel);
    if (!/\.m?js$/.test(rel)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/(?:^|[;\s])(?:import|export)\s*(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1] || m[2];
      if (spec === 'three') queue.push('build/three.module.js');
      else if (spec.startsWith('.')) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
    }
  }
  return { files: [...seen], missing };
}

function vendor() {
  const o = str(opt.out); if (!o) die('vendor: нужен --out <папка сайта>');
  const three = threeDir(); if (!three) die('НЕ СДЕЛАНО: нет three.js — npm i three --prefix ~/.claude/site-rework', 2);
  const site = path.resolve(o);
  const entries = ['build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/loaders/DRACOLoader.js'];
  const { files, missing } = importClosure(three, entries);
  if (missing.length) line('FAIL', 'three.js', `не найдены модули: ${missing.join(', ')}`);
  const extra = ['LICENSE', 'package.json'];
  if (opt.draco) extra.push(...safeReaddir(path.join(three, 'examples', 'jsm', 'libs', 'draco', 'gltf')).map((f) => `examples/jsm/libs/draco/gltf/${f}`));
  let js = 0, gz = 0;
  for (const rel of [...files, ...extra]) {
    const src = path.join(three, rel); if (!exists(src)) continue;
    const dst = path.join(site, 'vendor', 'three', rel);
    ensureDir(path.dirname(dst)); fs.copyFileSync(src, dst); report.files.push(dst);
    if (/\.js$/.test(rel) && !/draco/.test(rel)) { const b = fs.readFileSync(src); js += b.length; gz += zlib.gzipSync(b, { level: 9 }).length; }
  }
  const viewer = path.join(site, 'glb-viewer.js');
  fs.copyFileSync(path.join(TPL, 'viewer.js'), viewer); report.files.push(viewer);
  let ver = ''; try { ver = JSON.parse(fs.readFileSync(path.join(three, 'package.json'), 'utf8')).version; } catch { /* без версии */ }
  line('OK', `three.js ${ver}`, `${files.length} модулей${opt.draco ? ' + декодер Draco' : ''} → ${path.join(site, 'vendor', 'three')}; JS ${kb(js)}, gzip ${kb(gz)} — скачивается только когда блок подошёл к экрану`);
  line('OK', 'glb-viewer.js', viewer);
  if (!opt.draco) console.log('     GLB со сжатием Draco (--draco) не откроются без декодера: vendor --draco');
  console.log(`
В <head> страницы (пути — от страницы до папки сайта):
  <script type="importmap">{ "imports": { "three": "./vendor/three/build/three.module.js", "three/addons/": "./vendor/three/examples/jsm/" } }</script>
В конце <body>:
  <script type="module">import { mountAll } from './glb-viewer.js'; mountAll();</script>
Блок — как в templates/blender/viewer.html (figure.glb-viewer + img.glb-poster). Проверить копию сайта:
  node blender.mjs glb-check <модель.glb> --site ${site} --poster <постер.webp>`);
}

/* ---------------- doctor ---------------- */
/* что ставить, по системам; размеры переносного архива Windows — замер 06.10.2026 (Blender 5.2.2 LTS) */
const INSTALL = {
  win32: 'поставить Blender 4.2 LTS или новее: winget install BlenderFoundation.Blender — или переносной архив .zip с download.blender.org/release (404 МБ, на диске 914 МБ, установка не нужна): распаковать и задать BLENDER_PATH=<папка>\\blender.exe',
  darwin: 'поставить Blender 4.2 LTS или новее: .dmg с blender.org в «Программы» или brew install --cask blender; свой путь — BLENDER_PATH',
  linux: 'поставить Blender 4.2 LTS или новее: архив с blender.org (распаковать в /opt или домашнюю папку), snap install blender --classic или flatpak install org.blender.Blender; свой путь — BLENDER_PATH',
};
async function doctor() {
  const items = [];
  const add = (id, name, ok, detail, impact = '', fix = '') => items.push({ id, name, ok: !!ok, detail, impact: ok ? '' : impact, fix: ok ? '' : fix });
  const b = findBlender();
  let probe = null, ver = null;
  add('blender', 'Blender', !!b.exe, b.exe ? `${b.exe} (${b.how})` : `${b.error}${b.tried.length ? `; искал в ${b.tried.length} местах (${b.tried.slice(0, 4).join('; ')}…)` : ''}`, 'не работают render, physics и glb', INSTALL[process.platform] || INSTALL.linux);
  if (b.exe) {
    ver = blenderVersion(b.exe);
    add('version', `версия ≥ ${MIN_VERSION.join('.')}`, !ver.error && !oldVersion(ver), ver.error || ver.text, 'конвейер писался под 4.2 LTS+: старые имена в API — вероятные ошибки', 'обновить Blender');
    if (/flatpak|snap/.test(b.exe)) add('sandbox', 'песочница snap/flatpak', true, 'Blender в песочнице видит домашнюю папку; папку результата и сцену держать в ней, не в /tmp');
    if (!ver.error) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-probe-'));
      const jf = path.join(tmp, 'probe.json');
      fs.writeFileSync(jf, JSON.stringify({ version: 1, mode: 'probe' }));
      const r = await runBlender(b.exe, jf, { timeoutMin: 3, quiet: true });
      fs.rmSync(tmp, { recursive: true, force: true });
      probe = r.result;
      add('probe', 'скрипт внутри Blender', !!probe, probe ? `Python ${probe.python}${probe.platform ? `, сборка ${probe.platform}` : ''}` : `${r.error}${r.trace.length ? ' · ' + r.trace.slice(-2).join(' · ') : ''}`, 'конвейер не запустится', 'смотреть ошибку; если дело в версии — обновить Blender');
      if (probe) {
        const gpu = (probe.gpus || [])[0];
        add('cycles', 'Cycles', probe.cycles, probe.cycles ? 'включён' : 'выключен', 'рендер только EEVEE (--engine eevee) — без трассировки', 'сборка без Cycles: поставить официальную с blender.org');
        add('gpu', 'видеокарта для Cycles', !!gpu, gpu ? `${gpu.type}: ${gpu.names.join(', ')}${probe.gpus.length > 1 ? ` (ещё ${probe.gpus.slice(1).map((g) => g.type).join(', ')})` : ''}` : 'нет — считает процессор', 'кадр 1000×1000 на 256 сэмплов — минуты вместо секунд (Ryzen 7 6800H: 200 с); черновики — --samples 32 --w 600 --h 600; видео физики — часы: --video-samples 32, --step 2', 'драйвер NVIDIA (OptiX/CUDA), AMD (HIP), Apple (Metal — сам), Intel Arc (oneAPI)');
        add('gltf', 'экспорт glTF', probe.gltf, probe.gltf ? 'есть' : 'нет', 'не работает glb', 'включить дополнение «glTF 2.0 format» (в официальной сборке включено)');
        add('draco', 'сжатие Draco', probe.draco !== false, probe.draco === true ? 'есть' : probe.draco === false ? 'нет библиотеки' : 'не определилось (проверится при экспорте)', 'glb --draco даст GLB без сжатия', 'официальная сборка с blender.org содержит Draco');
        const vt = probe.view_transforms || [];
        add('tone', 'тональные кривые', vt.includes('Khronos PBR Neutral') && vt.includes('AgX'), vt.join(', ') || 'не определились', '--tone neutral подменится AgX/Filmic: цвета палитры чуть сдвинутся', 'Blender 4.2+');
        add('shadow', 'тень на земле (shadow catcher)', probe.shadow_catcher, probe.shadow_catcher ? 'есть' : 'нет', 'земля будет видна в кадре', 'Blender 3.0+');
      }
    }
  }
  const sharp = loadSharp();
  add('sharp', 'sharp (WebP, проверки кадра)', !!sharp, sharp ? 'есть' : 'нет', 'нет WebP, малой копии, превью и проверки пустого кадра', 'npm i sharp --prefix ~/.claude/site-rework');
  const ff = getFfmpeg();
  add('ffmpeg', 'ffmpeg (видео физики)', !!ff, ff || 'нет', 'physics --video даст только кадры PNG', 'npm i ffmpeg-static --prefix ~/.claude/site-rework или FFMPEG_PATH');
  const three = threeDir();
  const loaders = three && ['examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/loaders/DRACOLoader.js', 'examples/jsm/libs/draco/gltf/draco_decoder.wasm'].every((f) => exists(path.join(three, f)));
  add('three', 'three.js + GLTFLoader + Draco', !!loaders, three ? (loaders ? three : 'нет загрузчиков в пакете') : 'нет', 'нет glb-check, vendor и просмотрщика', 'npm i three --prefix ~/.claude/site-rework');
  const chrome = findBrowser('chrome');
  add('chrome', 'Chrome (glb-check)', !!chrome, chrome || 'не найден', 'нет проверки GLB в странице', 'поставить Chrome или задать CHROME_PATH');
  const py = findPython();
  add('python', 'python3 (только selftest)', !!py, py ? `${py.cmd.join(' ')} ${py.version}` : 'нет', 'selftest пропустит проверку синтаксиса скриптов Blender', 'необязательно');
  console.log(`Blender для сайта — ${os.platform()} ${os.arch()}, Node ${process.version}\n`);
  for (const i of items) {
    console.log(`${(i.ok ? 'OK' : ['blender', 'probe', 'sharp'].includes(i.id) ? 'FAIL' : 'нет').padEnd(4)} ${i.name.padEnd(34)} ${i.detail}`);
    if (!i.ok && i.impact) { console.log(`     чем грозит: ${i.impact}`); console.log(`     что сделать: ${i.fix}`); }
  }
  const res = { platform: `${os.platform()} ${os.arch()}`, blender: b.exe, version: ver, probe, items };
  if (opt.json && opt.json !== true) writeJson(path.resolve(String(opt.json)), res);
  const have = (id) => (items.find((i) => i.id === id) || {}).ok;
  if (!b.exe) { console.log('\nНЕ СДЕЛАНО: Blender не найден — render, physics и glb не работают; glb-check, vendor и selftest — работают'); return 2; }
  const bad = !have('probe') || !have('sharp');
  console.log(`\n${bad ? 'FAIL' : 'OK'}: ${items.filter((i) => i.ok).length} из ${items.length} на месте${have('gpu') ? '' : ' · считать будет процессор'}`);
  return bad ? 1 : 0;
}

/* ---------------- команды render, physics, glb ---------------- */
async function runScene(cmd) {
  const jobs = buildJobs(cmd);
  const kind = oneOf('for', ['item', 'scene'], 'item');
  if (opt['dry-run']) {
    const cmds = jobs.map((j) => commandLine(null, path.join(j.out_dir, `${j.name}.job.json`)));
    for (let i = 0; i < jobs.length; i++) { console.log(`задание ${jobs[i].name}:\n${JSON.stringify(jobs[i], null, 1)}\nкоманда: ${cmds[i]}\n`); }
    if (opt.json && opt.json !== true) writeJson(path.resolve(String(opt.json)), { jobs, commands: cmds });
    console.log(`OK: --dry-run — заданий ${jobs.length}, ничего не запущено и не записано${opt.json && opt.json !== true ? ' (кроме --json)' : ''}`);
    return 0;
  }
  const bl = needBlender();
  console.log(`${cmd} ${path.basename(jobs[0].scene.file)} · Blender ${bl.version.text} (${bl.exe})${jobs.length > 1 ? ` · вариантов ${jobs.length}` : ''}`);
  const timeoutMin = numOpt('timeout', 120, { min: 1, max: 10080 });
  const stills = [];
  for (const job of jobs) {
    ensureDir(job.out_dir);
    const jf = path.join(job.out_dir, `${job.name}.job.json`);
    fs.writeFileSync(jf, JSON.stringify(job, null, 1));
    console.log(`\n${job.name}: ${commandLine(bl.exe, jf)}`);
    const t0 = Date.now();
    const r = await runBlender(bl.exe, jf, { timeoutMin, log: path.join(job.out_dir, `${job.name}.blender.log`) });
    for (const w of r.warnings) line('WARN', job.name, w);
    if (r.error || !r.result) {
      line('FAIL', job.name, `${r.error}${r.trace.length ? '\n     ' + r.trace.slice(-6).join('\n     ') : ''}\n     полный вывод: ${path.join(job.out_dir, `${job.name}.blender.log`)}`);
      continue;
    }
    const res = r.result;
    const dev = res.render && res.render.device ? (res.render.device.device === 'GPU' ? `GPU ${res.render.device.type}` : 'CPU') : '';
    if (res.stats) console.log(`     сцена: предметов ${res.stats.objects}, треугольников ${res.stats.triangles}${dev ? ` · ${dev}` : ''}${res.render && res.render.view_transform ? ` · ${res.render.view_transform}` : ''} ${res.seconds != null ? ` · рендер ${res.seconds} с` : ''} · всего ${((Date.now() - t0) / 1000).toFixed(0)} с`);
    if (res.simulation) {
      const s = res.simulation;
      line(s.moving && s.moving.length ? 'WARN' : 'OK', 'физика', `твёрдых тел ${s.rigid}, тканей ${(s.cloth || []).length}, кадров ${job.frames || '(из сцены)'}, ключей ${s.keys}, счёт ${s.seconds} с${s.moving && s.moving.length ? ` — не улеглось: ${s.moving.slice(0, 4).join(', ')}` : ', всё улеглось'}${s.fallen && s.fallen.length ? `; упало за край: ${s.fallen.slice(0, 4).join(', ')}` : ''}`);
    }
    if (res.png) { const st = await postStill(res.png, job, { bleed: !!(res.camera && res.camera.bleed), ground: !!(res.camera && res.camera.ground) }); if (st) stills.push({ ...st, label: job.variant || job.name }); }
    if (res.frames_dir) await framesToVideo(res.frames_dir, { ...job, frames: job.frames || (res.simulation && res.simulation.frames) || safeReaddir(res.frames_dir).filter((f) => /\.png$/i.test(f)).length * job.video.step });
    if (res.glb) {
      if (res.glb.skipped && res.glb.skipped.length) console.log(`     экспортёр этой версии не знает: ${res.glb.skipped.join(', ')}`);
      if (res.glb.baked) console.log(`     запечено материалов в картинки: ${res.glb.baked}`);
      report.files.push(res.glb.file);
      const g = await glbReport(res.glb.file, { kind, check: !opt['no-check'], poster: stills.length ? stills[stills.length - 1].files.find((f) => f.endsWith('.webp')) : null });
      if (g && job.glb.animation && !g.animations && res.simulation && res.simulation.rigid) line('WARN', 'анимация', 'просили анимацию, в GLB её нет — смотреть протокол экспорта');
    }
    report.blender = { exe: bl.exe, version: bl.version.text };
    const proto = path.join(job.out_dir, `${job.name}.json`);
    writeJson(proto, { command: cmd, job, blender: report.blender, result: res, files: report.files, checks: report.checks, verdict: fails ? 'FAIL' : warns ? 'WARN' : 'OK' });
  }
  const bg = normHex(opt.bg);
  if (stills.length > 1 && bg) {
    const s = await contactSheet(stills.map((x) => x.png), path.join(jobs[0].out_dir, `${str(opt.name) || path.basename(jobs[0].scene.file).replace(/\.[^.]+$/, '')}-sheet.png`), { cols: Math.min(4, stills.length), width: 360, background: bg, labels: stills.map((x) => x.label) });
    if (s) { line('OK', 'лист вариантов', `${s.count} кадров на ${bg} → ${s.file}`); report.files.push(s.file); }
  }
  return done();
}

function done() {
  if (opt.json && opt.json !== true && !opt['dry-run']) writeJson(path.resolve(String(opt.json)), { ...report, verdict: fails ? 'FAIL' : warns ? 'WARN' : 'OK' });
  console.log(`\n${fails ? 'FAIL' : warns ? 'WARN' : 'OK'}: файлов ${report.files.length}, провалов ${fails}, предупреждений ${warns}`);
  return fails ? 1 : 0;
}

/* ---------------- selftest ---------------- */
async function selftest({ keep = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-selftest-'));
  let total = 0, failed = 0, skipped = 0;
  const check = (name, ok, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + String(extra).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };
  const skip = (name, why) => { skipped++; console.log(`SKIP ${name} — ${why}`); };
  const run = (args, env = {}) => new Promise((resolve) => {
    const p = spawn(process.execPath, [SELF, ...args], { env: { ...process.env, ...env }, cwd: tmp, windowsHide: true });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  const last = (r) => r.out.trim().split(/\r?\n/).pop();
  const jobsOf = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).jobs; } catch { return null; } };
  const SCENE = path.join(FX, 'scene-min.py');
  const GLB = path.join(FX, 'stack.glb');
  console.log(`blender selftest · стенды ${FX} · результаты ${tmp}\n`);
  const real = findBlender();
  console.log(real.exe ? `(Blender на машине есть: ${real.exe} — в конце настоящие рендер, физика, экспорт GLB и doctor; проверки пути Node идут на заглушке)\n` : '(Blender на машине не найден — настоящие рендер, физика и экспорт будут пропущены; BLENDER_PATH)\n');

  /* ---------- аргументы и справка ---------- */
  let r = await run(['-h']);
  check('справка: -h — код 0, все команды названы, побочных файлов нет', r.code === 0 && COMMANDS.every((c) => new RegExp(`blender\\.mjs ${c}\\b`).test(r.out)) && !fs.readdirSync(tmp).length);
  r = await run([]);
  check('без аргументов — справка и код 1', r.code === 1 && /blender\.mjs doctor/.test(r.out));
  r = await run(['render', SCENE, '--sampels', '64']);
  check('опечатка во флаге — ошибка с подсказкой, код 1', r.code === 1 && /неизвестный флаг --sampels — может быть, --samples\?/.test(r.out), last(r));
  r = await run(['rendr', SCENE]);
  check('неизвестная команда — код 1', r.code === 1 && /Не знаю команду «rendr»/.test(r.out), last(r));
  r = await run(['render', SCENE, '--w', 'abc', '--dry-run']);
  check('--w abc — ошибка числа', r.code === 1 && /--w abc: нужно целое число/.test(r.out), last(r));
  r = await run(['physics', SCENE, '--sim', 'jelly', '--dry-run']);
  check('--sim jelly — ошибка выбора', r.code === 1 && /--sim jelly: нужно одно из auto \| rigid \| cloth/.test(r.out), last(r));
  r = await run(['render', SCENE, '--palette', 'bone=серый', '--dry-run']);
  check('--palette с не-цветом — ошибка', r.code === 1 && /bone=серый — нужен цвет/.test(r.out), last(r));
  r = await run(['render', path.join(tmp, 'нет.py'), '--dry-run']);
  check('нет файла сцены — код 1', r.code === 1 && /Нет файла сцены/.test(r.out), last(r));
  fs.writeFileSync(path.join(tmp, 'scene.txt'), 'x');
  r = await run(['render', 'scene.txt', '--dry-run']);
  check('сцена не .py и не .json — код 1', r.code === 1 && /нужен модуль \.py/.test(r.out), last(r));
  r = await run(['render', path.join(FX, 'bad-scene.json'), '--dry-run']);
  check('JSON-сцена с неизвестным типом и материалом — отказ до Blender', r.code === 1 && /teapot/.test(r.out) && /chrome/.test(r.out), last(r));
  r = await run(['render', SCENE, '--transparent', '--backdrop', '--dry-run']);
  check('--transparent вместе с --backdrop — ошибка', r.code === 1 && /вместе не бывают/.test(r.out), last(r));

  /* ---------- сборка заданий ---------- */
  const jf = (n) => path.join(tmp, `${n}.jobs.json`);
  r = await run(['render', SCENE, '--out', 'o', '--w', '800', '--h', '600', '--samples', '64', '--palette', 'bone=#e7e3dd,accent=C8553D', '--param', 'height=0.8,mode=tall', '--dry-run', '--json', jf('render')]);
  let J = jobsOf(jf('render'));
  let j = J && J[0];
  check('render --dry-run: задание собрано, ничего не запущено', r.code === 0 && !!j && j.mode === 'render' && j.w === 800 && j.h === 600 && j.samples === 64 && j.denoise === true && j.backdrop === false && j.tone === 'neutral' && j.scene.kind === 'py' && path.isAbsolute(j.scene.file) && path.isAbsolute(j.out_dir) && !fs.existsSync(path.join(tmp, 'o')), last(r));
  check('палитра нормализована, параметры — числа и строки', !!j && j.palette.bone === '#E7E3DD' && j.palette.accent === '#C8553D' && j.params.height === 0.8 && j.params.mode === 'tall');
  check('команда Blender: -b --factory-startup -P run.py -- задание', /-b --factory-startup --python-exit-code 3 -P .*run\.py -- .*o[\\/]scene-min\.job\.json/.test(r.out));
  r = await run(['render', SCENE, '--variant', 'jar,box', '--no-denoise', '--backdrop', '--tone', 'agx', '--save-blend', '--dry-run', '--json', jf('var')]);
  J = jobsOf(jf('var'));
  check('варианты через запятую — задание на каждый, имена с вариантом', r.code === 0 && J && J.length === 2 && J[0].name === 'scene-min-jar' && J[1].variant === 'box' && J[0].denoise === false && J[0].backdrop === true && J[0].tone === 'agx' && /scene-min-jar\.blend$/.test(J[0].save_blend));
  r = await run(['physics', SCENE, '--out', 'p', '--video', '--webm', '--glb', 'p/drop.glb', '--frames', '90', '--step', '2', '--draco', '--dry-run', '--json', jf('phys')]);
  j = (jobsOf(jf('phys')) || [])[0];
  check('physics --dry-run: кадры, видео, GLB с анимацией', r.code === 0 && !!j && j.mode === 'physics' && j.frames === 90 && j.sim === 'auto' && j.outputs.video && j.outputs.glb && j.video.step === 2 && j.video.samples === 64 && j.glb.animation === true && j.glb.draco === true && /drop\.glb$/.test(j.glb.file) && j.frame_on === 'end', last(r));
  r = await run(['physics', SCENE, '--dry-run', '--json', jf('phys2')]);
  j = (jobsOf(jf('phys2')) || [])[0];
  check('physics без --frames — длина из сцены (FRAMES), только кадр', !!j && j.frames === null && j.outputs.video === false && j.outputs.glb === false);
  r = await run(['glb', SCENE, '--out', 'g', '--dry-run', '--json', jf('glb')]);
  j = (jobsOf(jf('glb')) || [])[0];
  check('glb --out папка → папка/имя.glb, без анимации и Draco по умолчанию', r.code === 0 && !!j && j.mode === 'glb' && j.glb.file === path.join(fs.realpathSync(tmp), 'g', 'scene-min.glb') && j.glb.animation === false && j.glb.draco === false && j.glb.bake === 'auto');
  r = await run(['glb', SCENE, '--out', 'g/model.gltf', '--dry-run']);
  check('glb --out не .glb — ошибка', r.code === 1 && /нужен файл \.glb или папка/.test(r.out), last(r));
  r = await run(['render', path.join(TPL, 'cards.json'), '--dry-run', '--json', jf('json')]);
  j = (jobsOf(jf('json')) || [])[0];
  check('JSON-сцена образца — задание kind json', r.code === 0 && !!j && j.scene.kind === 'json');

  /* ---------- Python: синтаксис и чистые функции без Blender ---------- */
  const py = findPython();
  const pyFiles = [...safeReaddir(PYDIR).filter((f) => f.endsWith('.py')).map((f) => path.join(PYDIR, f)), ...safeReaddir(TPL).filter((f) => f.endsWith('.py')).map((f) => path.join(TPL, f)), SCENE, path.join(FX, 'scene-mats.py'), path.join(FX, 'scene-drop.py')];
  if (!py) skip('Python: синтаксис скриптов Blender', 'python3 не найден');
  else {
    const code = `import ast,sys\nbad=[]\nfor f in sys.argv[1:]:\n    try:\n        ast.parse(open(f,encoding='utf-8').read(), f, feature_version=(3,11))\n    except SyntaxError as e:\n        bad.append('%s:%s %s' % (f, e.lineno, e.msg))\nprint('\\n'.join(bad) or 'SYNTAX-OK')`;
    const pr = spawnSync(py.cmd[0], [...py.cmd.slice(1), '-c', code, ...pyFiles], { encoding: 'utf8', timeout: 60000, env: PY_ENV });
    check(`Python ${py.version}: синтаксис ${pyFiles.length} файлов под Python 3.11 (Blender 4.2+), без __pycache__`, /SYNTAX-OK/.test(pr.stdout), (pr.stdout || pr.stderr).trim());
    const unit = `import sys, json, math\nsys.path.insert(0, ${JSON.stringify(PYDIR)})\nimport studio, physics, export, run\nr = {}\nr['hex'] = studio.parse_hex('#E7E3DD')\nr['short'] = studio.parse_hex('abc')\ntry:\n    studio.parse_hex('серый'); r['bad'] = False\nexcept ValueError:\n    r['bad'] = True\nr['lin'] = round(studio.srgb_to_linear(0.5), 4)\nr['fov'] = [round(x, 4) for x in studio.fov_pair(28, 1600, 900)]\nr['dist'] = round(studio.fit_distance(1.0, 28, 1000, 1000, 1.0), 4)\nr['power'] = round(studio.light_power(0.72, 6.5), 1)\nr['spec_ok'] = studio.validate_spec(json.load(open(${JSON.stringify(path.join(TPL, 'cards.json'))}, encoding='utf-8')))\nr['spec_bad'] = studio.validate_spec(json.load(open(${JSON.stringify(path.join(FX, 'bad-scene.json'))}, encoding='utf-8')))\nr['pal'] = studio.merge_palette(studio.DEFAULT_PALETTE, {'bone': 'E7E3DD'})['bone']\nr['presets'] = sorted(physics.CLOTH_PRESETS)\nr['proc'] = 'TEX_NOISE' in export.PROCEDURAL\nhp = studio.hex_points(1.0, 0.16)\nr['hexp'] = [len(hp), round(max(math.hypot(*p) for p in hp), 3), round(min(math.hypot(*p) for p in hp), 3)]\nr['sharp'] = len(studio.rounded_polygon([(0, 0), (1, 0), (0, 1)], 0))\ncm = studio.catmull([(0, 0, 0), (1, 0, 1), (2, 0, 0)], 8)\nr['cm'] = [len(cm), list(cm[0]), list(cm[4]), list(cm[-1])]\nr['field'] = studio.frame_margins([(0.1, 0.2), (0.9, 0.85)])\nr['margin'] = studio.DEFAULT_MARGIN\nr['kinds'] = list(studio.MATERIAL_KINDS)\nr['printed'] = studio.validate_spec({'objects': [{'type': 'plane', 'material': 'printed'}, {'type': 'plane', 'material': 'printed', 'image': 'a.png'}]})\nprint('UNIT ' + json.dumps(r, ensure_ascii=False))`;
    const ur = spawnSync(py.cmd[0], [...py.cmd.slice(1), '-B', '-c', unit], { encoding: 'utf8', timeout: 60000, env: PY_ENV });
    let u = null; try { u = JSON.parse((/UNIT (.*)/.exec(ur.stdout) || [])[1]); } catch { /* ниже FAIL */ }
    check('Python без bpy: модули импортируются, чистые функции считают', !!u && u.hex[0] === 0xE7 / 255 && u.short[0] === 0xAA / 255 && u.bad === true && u.lin === 0.214 && u.fov[0] === +(28 * Math.PI / 180).toFixed(4) && u.fov[1] < u.fov[0] && Math.abs(u.dist - 1 / Math.sin(14 * Math.PI / 180)) < 1e-3 && u.power > 0 && u.pal === '#E7E3DD' && u.presets.includes('silk') && u.proc, (ur.stdout || ur.stderr).trim().slice(0, 300));
    check('Python: контуры (шестиугольник со скруглением, острый многоугольник), кривая через точки, поле кадра', !!u && u.hexp[0] === 42 && u.hexp[1] <= 1 && u.hexp[2] > 0.8 && u.sharp === 3 && u.cm[0] === 9 && u.cm[1].join() === '0,0,0' && u.cm[2].join() === '1,0,1' && u.cm[3].join() === '2,0,0' && Math.abs(u.field - 0.1) < 1e-9, u && JSON.stringify([u.hexp, u.sharp, u.cm, u.field]));
    check('поле кадра по умолчанию — не уже 8 % с каждого края (DEFAULT_MARGIN)', !!u && (1 - 1 / u.margin) / 2 >= 0.0795, u && String(u.margin));
    check('материалы: leafy, honey, printed есть и в студии, и в проверке JSON-сцены Node; printed без image — ошибка с местом (обе проверки)', !!u && ['leafy', 'honey', 'printed'].every((k) => u.kinds.includes(k)) && u.kinds.length === 12 && u.printed.length === 1 && /objects\[0\].*image/.test(u.printed[0]) && specErrors({ objects: [{ type: 'plane', material: 'leafy' }, { type: 'plane', material: 'honey' }, { type: 'plane', material: 'printed', image: 'a.png' }] }).length === 0 && /objects\[0\].*image/.test(specErrors({ objects: [{ type: 'plane', material: 'printed' }] }).join()), u && JSON.stringify(u.printed));
    check('Python: JSON-сцена образца проходит, сломанная — три ошибки с местом', !!u && u.spec_ok.length === 0 && u.spec_bad.length === 3 && /teapot/.test(u.spec_bad.join()) && /chrome/.test(u.spec_bad.join()), u && JSON.stringify(u.spec_bad));
    let allOk = true; const bad = [];
    for (const name of ['render', 'var', 'phys', 'glb', 'json']) {
      for (const job of jobsOf(jf(name)) || []) {
        const f = path.join(tmp, `${job.name}-${name}.job.json`); fs.writeFileSync(f, JSON.stringify(job));
        const vr = spawnSync(py.cmd[0], [...py.cmd.slice(1), '-B', path.join(PYDIR, 'run.py'), '--validate', f], { encoding: 'utf8', timeout: 60000, env: PY_ENV });
        if (!/JOB-OK/.test(vr.stdout)) { allOk = false; bad.push(`${name}: ${(vr.stdout || vr.stderr).trim()}`); }
      }
    }
    check('run.py --validate принимает все задания, которые пишет blender.mjs', allOk, bad.join(' | '));
    const broken = path.join(tmp, 'broken.job.json');
    fs.writeFileSync(broken, JSON.stringify({ version: 1, mode: 'render', scene: { kind: 'py', file: 'rel.py' }, w: 10, palette: { a: 'x' } }));
    const br = spawnSync(py.cmd[0], [...py.cmd.slice(1), '-B', path.join(PYDIR, 'run.py'), '--validate', broken], { encoding: 'utf8', timeout: 60000, env: PY_ENV });
    check('run.py --validate отвергает сломанное задание с причинами — по-русски, без кракозябр (вывод Python в UTF-8)', br.status === 1 && /JOB-ERROR задание/.test(br.stdout) && /абсолютный путь/.test(br.stdout) && /scene\.file/.test(br.stdout) && /w=10/.test(br.stdout) && /palette\.a/.test(br.stdout), br.stdout.trim().slice(0, 200));
    {
      /* run.py печатает UTF-8 сам, без переменных окружения: так его зовут и руками, и из чужих сценариев */
      const bare = { ...process.env }; delete bare.PYTHONUTF8; delete bare.PYTHONIOENCODING; delete bare.PYTHONLEGACYWINDOWSSTDIO;
      const b2 = spawnSync(py.cmd[0], [...py.cmd.slice(1), '-B', path.join(PYDIR, 'run.py'), '--validate', broken], { encoding: 'utf8', timeout: 60000, env: bare });
      check('run.py сам печатает UTF-8 — причины по-русски и без переменных окружения', b2.status === 1 && /JOB-ERROR задание/.test(b2.stdout) && /абсолютный путь/.test(b2.stdout), b2.stdout.trim().slice(0, 160));
    }
    /* код внутри Blender здесь не исполнить — ловим хотя бы опечатки: имя нигде не определено; ctx.метод сцены
       есть у Studio, а его именованные аргументы — в подписи метода */
    const lint = `import ast, builtins, sys, json\nout = []\ndef names(t):\n    d = set(dir(builtins)) | {'__file__', '__name__'}\n    for n in ast.walk(t):\n        if isinstance(n, ast.Name) and not isinstance(n.ctx, ast.Load): d.add(n.id)\n        elif isinstance(n, (ast.FunctionDef, ast.ClassDef)): d.add(n.name)\n        elif isinstance(n, ast.arg): d.add(n.arg)\n        elif isinstance(n, (ast.Import, ast.ImportFrom)): d.update((a.asname or a.name).split('.')[0] for a in n.names)\n        elif isinstance(n, ast.ExceptHandler) and n.name: d.add(n.name)\n    return d\nsig = {}\nst = ast.parse(open(sys.argv[1], encoding='utf-8').read())\nfor c in [n for n in st.body if isinstance(n, ast.ClassDef) and n.name == 'Studio']:\n    for f in c.body:\n        if isinstance(f, ast.FunctionDef): sig[f.name] = ([a.arg for a in f.args.args][1:], f.args.kwarg is not None)\n        if isinstance(f, ast.FunctionDef) and f.name == '__init__':\n            for n in ast.walk(f):\n                if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == 'self' and isinstance(n.ctx, ast.Store): sig.setdefault(n.attr, None)\nfor fn in sys.argv[2:]:\n    t = ast.parse(open(fn, encoding='utf-8').read())\n    d = names(t)\n    for n in ast.walk(t):\n        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load) and n.id not in d: out.append('%s:%d имя %s не определено' % (fn, n.lineno, n.id))\n        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and isinstance(n.func.value, ast.Name) and n.func.value.id == 'ctx':\n            m = n.func.attr\n            if m not in sig: out.append('%s:%d нет ctx.%s' % (fn, n.lineno, m)); continue\n            if sig[m] is None: continue\n            params, kw = sig[m]\n            if len(n.args) > len(params) and not kw: out.append('%s:%d ctx.%s: лишние аргументы' % (fn, n.lineno, m))\n            for k in n.keywords:\n                if k.arg and k.arg not in params and not kw: out.append('%s:%d ctx.%s(%s=) — нет такого аргумента' % (fn, n.lineno, m, k.arg))\nprint('LINT ' + json.dumps(out, ensure_ascii=False))`;
    const lr = spawnSync(py.cmd[0], [...py.cmd.slice(1), '-B', '-c', lint, path.join(PYDIR, 'studio.py'), ...pyFiles], { encoding: 'utf8', timeout: 60000, env: PY_ENV });
    let lintOut = null; try { lintOut = JSON.parse((/LINT (.*)/.exec(lr.stdout) || [])[1]); } catch { /* ниже FAIL */ }
    check('Python: имена определены; ctx.* в сценах есть у студии, аргументы совпадают с подписью', !!lintOut && !lintOut.length, lintOut ? lintOut.slice(0, 5).join(' | ') : (lr.stdout || lr.stderr).trim().slice(0, 200));
    const lt = spawnSync(py.cmd[0], [...py.cmd.slice(1), '-B', '-c', lint, path.join(PYDIR, 'studio.py'), path.join(FX, 'typo-scene.py')], { encoding: 'utf8', timeout: 60000, env: PY_ENV });
    let typo = null; try { typo = JSON.parse((/LINT (.*)/.exec(lt.stdout) || [])[1]); } catch { /* ниже FAIL */ }
    check('Python: сцена с опечатками — все три пойманы (аргумент, метод, имя)', !!typo && typo.length === 3 && typo.some((x) => /sise=/.test(x)) && typo.some((x) => /нет ctx\.cilinder/.test(x)) && typo.some((x) => /имя viw/.test(x)), typo && typo.join(' | '));
    const pyc = [PYDIR, TPL, FX].some((d) => fs.existsSync(path.join(d, '__pycache__')));
    check('проверки Python не оставили __pycache__ в скилле', !pyc);
  }

  /* ---------- где искать Blender: три ОС на любой машине ---------- */
  const fakeDirs = { '/Applications': ['Blender.app', 'Blender 4.5.app', 'Blender 4.2.app', 'Safari.app'], 'C:\\Program Files\\Blender Foundation': ['Blender 4.2', 'Blender 4.5', 'Blender 3.6'], '/opt': ['blender-4.5.1-linux-x64', 'blender-4.2.0-linux-x64', 'other'] };
  const rd = (d) => fakeDirs[d] || [];
  const mac = blenderCandidates({ platform: 'darwin', env: { PATH: '/usr/bin:/opt/homebrew/bin' }, home: '/Users/u', readdir: rd }).map((c) => c.path);
  check('macOS: PATH, /Applications/Blender.app, версии новее — раньше, ~/Applications, Homebrew', mac[0] === '/usr/bin/blender' && mac.includes('/Applications/Blender.app/Contents/MacOS/Blender') && mac.indexOf('/Applications/Blender 4.5.app/Contents/MacOS/Blender') < mac.indexOf('/Applications/Blender 4.2.app/Contents/MacOS/Blender') && mac.includes('/Users/u/Applications/Blender.app/Contents/MacOS/Blender') && !mac.some((p) => /Safari/.test(p)), mac.slice(0, 6).join(' ; '));
  const win = blenderCandidates({ platform: 'win32', env: { PATH: 'C:\\Tools;C:\\Windows', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, home: 'C:\\Users\\u', readdir: rd }).map((c) => c.path);
  check('Windows: PATH (blender.exe), Program Files\\Blender Foundation\\Blender 4.5 раньше 4.2, Steam, Scoop, Store', win[0] === 'C:\\Tools\\blender.exe' && win.indexOf('C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe') >= 0 && win.indexOf('C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe') < win.indexOf('C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe') && win.some((p) => /Steam/.test(p)) && win.some((p) => /scoop/.test(p)) && win.some((p) => /WindowsApps/.test(p)), win.slice(0, 5).join(' ; '));
  const lin = blenderCandidates({ platform: 'linux', env: { PATH: '/usr/local/bin:/usr/bin' }, home: '/home/u', readdir: rd }).map((c) => c.path);
  check('Linux: PATH, /usr/bin, snap, flatpak (система и пользователь), архив в /opt — новее раньше', lin.includes('/snap/bin/blender') && lin.includes('/var/lib/flatpak/exports/bin/org.blender.Blender') && lin.includes('/home/u/.local/share/flatpak/exports/bin/org.blender.Blender') && lin.indexOf('/opt/blender-4.5.1-linux-x64/blender') < lin.indexOf('/opt/blender-4.2.0-linux-x64/blender') && !lin.some((p) => /other/.test(p)), lin.join(' ; ').slice(0, 200));

  /* ---------- нет Blender: честный отказ ---------- */
  const NOBL = { BLENDER_PATH: path.join(tmp, 'нет-blender') };
  r = await run(['render', SCENE, '--out', 'nb'], NOBL);
  check('render без Blender (BLENDER_PATH неверен) — НЕ СДЕЛАНО, код 2, ничего не записано, подсказка', r.code === 2 && /НЕ СДЕЛАНО: BLENDER_PATH=/.test(r.out) && /node blender\.mjs doctor/.test(r.out) && /svg3d\.mjs/.test(r.out) && /Предметы с объёмом рендерит только Blender/.test(r.out) && !fs.existsSync(path.join(tmp, 'nb')), last(r));
  r = await run(['doctor', '--json', 'doc.json'], NOBL);
  const dj = (() => { try { return JSON.parse(fs.readFileSync(path.join(tmp, 'doc.json'), 'utf8')); } catch { return null; } })();
  check('doctor без Blender — код 2, «что сделать» и протокол', r.code === 2 && /НЕ СДЕЛАНО: Blender не найден/.test(r.out) && /что сделать: поставить Blender 4\.2/.test(r.out) && /BLENDER_PATH/.test(r.out) && !!dj && dj.items.find((i) => i.id === 'blender').ok === false, last(r));

  /* ---------- заглушка Blender: весь путь Node до и после Blender ---------- */
  const sharp = loadSharp();
  const stubDir = path.join(tmp, 'stub'); ensureDir(stubDir);
  const stubJs = path.join(stubDir, 'stub-blender.mjs');
  fs.writeFileSync(stubJs, stubSource(path.join(HERE, 'lib.mjs'), GLB));
  let stub;
  if (process.platform === 'win32') { stub = path.join(stubDir, 'blender.cmd'); fs.writeFileSync(stub, `@"${process.execPath}" "${stubJs}" %*\r\n`); }
  else { stub = path.join(stubDir, 'blender'); fs.writeFileSync(stub, `#!/bin/sh\nexec "${process.execPath}" "${stubJs}" "$@"\n`); fs.chmodSync(stub, 0o755); }
  const STUB = { BLENDER_PATH: stub };
  if (!sharp) skip('заглушка Blender', 'нет sharp — заглушке нечем рисовать кадры');
  else {
    r = await run(['doctor', '--json', 'doc2.json'], STUB);
    check('doctor с заглушкой: версия, Cycles, Metal, glTF и Draco разобраны из ответа скрипта', /OK\s+Blender\s/.test(r.out) && /4\.2\.3/.test(r.out) && /METAL: Apple/.test(r.out) && /Khronos PBR Neutral/.test(r.out), r.out.split('\n').filter((l) => /Blender|версия|видеокарта/.test(l)).join(' | ').slice(0, 240));
    r = await run(['render', SCENE, '--out', 'r', '--w', '400', '--h', '300', '--bg', 'EFEBE4', '--small', '200', '--json', 'r.json'], STUB);
    const rf = (f) => fs.existsSync(path.join(tmp, 'r', f));
    check('render (заглушка): PNG → WebP, малая копия, превью на цвете сайта, задание, лог, протокол', r.code === 0 && ['scene-min.png', 'scene-min.webp', 'scene-min-200.webp', 'scene-min-on-EFEBE4.jpg', 'scene-min.job.json', 'scene-min.blender.log', 'scene-min.json'].every(rf), r.out.split('\n').filter((l) => /^(OK|WARN|FAIL)/.test(l)).join(' | '));
    check('render (заглушка): шаги и предупреждение Blender переданы, кадр не пустой', /· сцена scene-min\.py/.test(r.out) && /WARN\s+scene-min — заглушка: предупреждение сцены/.test(r.out) && /OK\s+scene-min — 400×300, заполнено/.test(r.out));
    check('поле кадра 10 % — в строке кадра, предупреждения о крае нет', /поле 10\.\d%/.test(r.out) && !/близко к краю|упирается в край/.test(r.out), r.out.split('\n').filter((l) => /scene-min —/.test(l)).join(' | '));
    r = await run(['render', SCENE, '--out', 't1', '--w', '300', '--h', '300'], { ...STUB, SR_STUB_MODE: 'tight' });
    check('предмет в 3 % от края кадра — WARN «предмет близко к краю кадра» с числом и подсказкой, код 0', r.code === 0 && /WARN\s+scene-min: предмет близко к краю кадра — поле [23]\.\d%, нужно не меньше 6\.0% — больше margin/.test(r.out), r.out.split('\n').filter((l) => /^(OK|WARN|FAIL)/.test(l)).join(' | '));
    r = await run(['render', SCENE, '--out', 't2', '--w', '300', '--h', '300'], { ...STUB, SR_STUB_MODE: 'tight', SR_STUB_BLEED: '1' });
    check('сцена сама выводит предмет за край (bleed: лента) — того же кадра предупреждение не касается', r.code === 0 && !/близко к краю|упирается в край/.test(r.out) && /поле [23]\.\d%/.test(r.out), r.out.split('\n').filter((l) => /^(OK|WARN|FAIL)/.test(l)).join(' | '));
    r = await run(['render', SCENE, '--out', 't3', '--w', '400', '--h', '300', '--trim', '--small', '200,100'], { ...STUB, SR_STUB_GROUND: '1' });
    const t3 = (f) => fs.existsSync(path.join(tmp, 't3', f));
    check('--trim у предмета на земле: рамка по предмету с запасом под тень, сказано, где низ предмета; --small списком — две малые копии', r.code === 0 && /OK\s+scene-min — 2[67]\d×18\d,/.test(r.out) && /низ предмета на 9[2-5]\.\d% высоты кадра/.test(r.out) && t3('scene-min-200.webp') && t3('scene-min-100.webp'), r.out.split('\n').filter((l) => /scene-min —|низ предмета/.test(l)).join(' | '));
    r = await run(['render', SCENE, '--out', 't4', '--w', '400', '--h', '300', '--trim'], STUB);
    check('--trim у парящего предмета — по прозрачным полям, как раньше (про низ предмета — ни слова)', r.code === 0 && !/низ предмета/.test(r.out) && !/OK\s+scene-min — 400×300/.test(r.out), r.out.split('\n').filter((l) => /scene-min —/.test(l)).join(' | '));
    r = await run(['render', SCENE, '--out', 't5', '--small', 'abc'], STUB);
    check('--small abc — ошибка, код 1', r.code === 1 && /--small abc: нужны целые ширины/.test(r.out), last(r));
    {
      const img = await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await sharp({ create: { width: 100, height: 50, channels: 4, background: { r: 200, g: 80, b: 60, alpha: 1 } } }).png().toBuffer(), left: 20, top: 10 }]).png().toBuffer();
      const mi = await measureImage(sharp, img);
      const gc = groundCrop({ x0: 300, x1: 700, y0: 200, y1: 800 }, 1000, 1000);
      check('measureImage: поле — от плотных пикселей до ближайшего края; groundCrop: запас по бокам и под тень, доля низа', Math.abs(mi.field - 0.1) < 1e-9 && mi.box.x0 === 20 && mi.box.y1 === 59 && gc.left === 180 && gc.top === 196 && gc.width === 640 && gc.height === 646 && Math.abs(gc.foot - 604 / 646) < 1e-9, JSON.stringify([mi.field, mi.box, gc]));
    }
    r = await run(['render', SCENE, '--out', 'e'], { ...STUB, SR_STUB_MODE: 'empty' });
    check('пустой кадр — FAIL и код 1', r.code === 1 && /FAIL scene-min: пустой кадр/.test(r.out), last(r));
    r = await run(['render', SCENE, '--out', 'x'], { ...STUB, SR_STUB_MODE: 'error' });
    check('ошибка в сцене — причина из Blender, хвост трассировки, код 1', r.code === 1 && /в сцене нет функции build/.test(r.out) && /Traceback/.test(r.out) && /полный вывод:/.test(r.out), last(r));
    r = await run(['render', SCENE, '--out', 'v', '--variant', 'a,b', '--bg', '#EFEBE4', '--trim', '--w', '300', '--h', '300'], STUB);
    check('варианты: кадр на каждый и лист на цвете сайта', r.code === 0 && fs.existsSync(path.join(tmp, 'v', 'scene-min-a.webp')) && fs.existsSync(path.join(tmp, 'v', 'scene-min-b.webp')) && fs.existsSync(path.join(tmp, 'v', 'scene-min-sheet.png')), last(r));
    const ff = getFfmpeg();
    r = await run(['physics', SCENE, '--out', 'ph', '--frames', '24', '--video', '--webm', '--webp-frames', '--glb', 'ph/drop.glb', '--bg', 'EFEBE4', '--w', '320', '--h', '240', '--no-check'], STUB);
    const pf = (f) => fs.existsSync(path.join(tmp, 'ph', f));
    if (!ff) skip('physics (заглушка): видео', 'нет ffmpeg');
    check(`physics (заглушка): итог физики, кадр, ${ff ? 'mp4 и webm, ' : ''}кадры WebP, GLB с анимацией`, r.code === 0 && /OK\s+физика — твёрдых тел 3/.test(r.out) && pf('scene-min.webp') && pf('scene-min-frames/scene-min-0001.webp') && (!ff || (pf('scene-min.mp4') && pf('scene-min.webm'))) && pf('drop.glb') && /анимаций 1/.test(r.out), r.out.split('\n').filter((l) => /^(OK|WARN|FAIL)/.test(l)).join(' | ').slice(0, 400));
    if (ff && pf('scene-min.mp4')) { const head = fs.readFileSync(path.join(tmp, 'ph', 'scene-min.mp4')).subarray(4, 8).toString(); check('mp4 — настоящий контейнер (ftyp)', head === 'ftyp', head); }
    r = await run(['physics', SCENE, '--out', 'ph2', '--frames', '24'], { ...STUB, SR_STUB_MODE: 'moving' });
    check('не улеглось к последнему кадру — WARN с подсказкой', r.code === 0 && /WARN\s+физика — .*не улеглось/.test(r.out), last(r));
    r = await run(['glb', SCENE, '--out', 'gl/item.glb', '--max-kb', '10', '--no-check'], STUB);
    check('glb (заглушка): разбор GLB и бюджет веса — WARN сверх --max-kb', r.code === 0 && /OK\s+item\.glb — \d+ КБ · сеток 4/.test(r.out) && /WARN вес сверх бюджета предмета/.test(r.out), r.out.split('\n').filter((l) => /^(OK|WARN|FAIL)/.test(l)).join(' | '));
  }

  /* ---------- GLB в странице (viewer.html), vendor ---------- */
  const three = threeDir();
  const chromeOk = !!findBrowser('chrome');
  if (!three || !chromeOk) skip('glb-check и viewer.html', !three ? 'нет three.js' : 'нет Chrome');
  else {
    const poster = path.join(tmp, 'poster.webp');
    if (sharp) await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 200, g: 85, b: 61, alpha: 1 } } }).webp().toFile(poster);
    r = await run(['glb-check', GLB, ...(sharp ? ['--poster', poster] : []), '--shot', 'shot.png']);
    const ok = (re) => new RegExp(`^OK\\s+${re}`, 'm').test(r.out);
    /* при провале — сами строки FAIL и WARN просмотрщика (с причиной), а не начало вывода: под нагрузкой проверки мигают, и нужен текст */
    const why = () => r.out.split('\n').filter((l) => /^(FAIL|WARN)/.test(l)).join(' | ') || last(r);
    check('glb-check стенда (GLTFExporter): разбор, загрузка в viewer.html, кадр не пустой, код 0', r.code === 0 && ok('stack\\.glb — ') && ok('GLB в странице') && ok('кадр в странице') && fs.existsSync(path.join(tmp, 'shot.png')), why());
    check('viewer: анимация идёт, вне экрана пауза, снова продолжает', ok('анимация идёт') && ok('вне экрана — пауза') && ok('снова на экране'), why());
    check('viewer: ленивый запуск (ни three.js, ни модели до экрана), подвели — загрузилось', ok('ленивый запуск') && ok('подвели к экрану'), why());
    check('viewer: «меньше движения» — статичный конечный кадр; без WebGL — постер, three.js не скачан', ok('«меньше движения»') && ok('без WebGL'), why());
    check('viewer: плотность холста ≤ 2 при DPR 3, консоль без ошибок', ok('плотность холста') && ok('консоль'), why());
    const trunc = path.join(tmp, 'broken.glb'); fs.writeFileSync(trunc, fs.readFileSync(GLB).subarray(0, 4000));
    r = await run(['glb-check', trunc]);
    check('обрезанный GLB — FAIL и код 1', r.code === 1 && /FAIL broken\.glb — не GLB: .*обрезан/.test(r.out), last(r));
    r = await run(['vendor', '--out', 'site', '--draco']);
    const vs = (f) => fs.existsSync(path.join(tmp, 'site', f));
    check('vendor: three.module.js, three.core.js, GLTFLoader с зависимостями, DRACOLoader, декодер, glb-viewer.js', r.code === 0 && ['vendor/three/build/three.module.js', 'vendor/three/build/three.core.js', 'vendor/three/examples/jsm/loaders/GLTFLoader.js', 'vendor/three/examples/jsm/utils/BufferGeometryUtils.js', 'vendor/three/examples/jsm/utils/SkeletonUtils.js', 'vendor/three/examples/jsm/loaders/DRACOLoader.js', 'vendor/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm', 'vendor/three/LICENSE', 'glb-viewer.js'].every(vs) && /importmap/.test(r.out), last(r));
    r = await run(['glb-check', GLB, '--site', 'site']);
    check('glb-check --site: копия сайта (vendor) самодостаточна — грузится и рисует', r.code === 0 && /^OK\s+GLB в странице/m.test(r.out) && /^OK\s+кадр в странице/m.test(r.out), r.out.split('\n').filter((l) => /^(FAIL)/.test(l)).join(' | ') || last(r));
  }

  /* ---------- настоящий Blender: рендер, физика, экспорт, doctor ---------- */
  if (!real.exe || !sharp) {
    const why = !real.exe ? 'Blender на машине не найден (BLENDER_PATH) — bpy-код проверен только синтаксисом и чистыми функциями' : 'нет sharp';
    skip('настоящий рендер Cycles (студия, все материалы и заготовки геометрии, тень на земле, поле кадра)', why);
    skip('настоящая физика (rigid body, cloth), запекание ключей, заморозка ткани', why);
    skip('настоящий экспорт glTF из Blender (применение модификаторов, запекание материалов, Draco)', why);
    skip('doctor на настоящем Blender (Metal/OptiX/CUDA/HIP)', why);
  } else {
    const MATSCENE = path.join(FX, 'scene-mats.py'), DROP = path.join(FX, 'scene-drop.py');
    const lines = (x) => x.out.split('\n').filter((l) => /^(OK|WARN|FAIL)/.test(l)).join(' | ').slice(0, 500);
    const resOf = (f) => { try { return JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8')); } catch { return null; } };
    r = await run(['doctor', '--json', 'docr.json']);
    const dr = resOf('docr.json');
    const has = (id) => !!dr && (dr.items.find((i) => i.id === id) || {}).ok === true;
    check('doctor на настоящем Blender: скрипт внутри отвечает, Cycles, glTF, тень на земле, тональные кривые', r.code === 0 && !!dr && !!dr.probe && ['blender', 'version', 'probe', 'cycles', 'gltf', 'shadow', 'tone'].every(has), r.out.split('\n').filter((l) => /^(FAIL|нет)/.test(l)).join(' | ') || last(r));
    r = await run(['render', SCENE, '--out', 'rr', '--w', '240', '--h', '240', '--samples', '8', '--bg', 'EFEBE4', '--small', '0']);
    let rj = resOf('rr/scene-min.result.json');
    const fieldPx = +((/поле (\d+\.\d)%/.exec(r.out) || [])[1] || -1);
    check('настоящий рендер Cycles: кадр не пустой, шаги по-русски без кракозябр, тень на земле', r.code === 0 && /^OK\s+scene-min — 240×240, заполнено/m.test(r.out) && /· сцена scene-min\.py/.test(r.out) && /· студия: CYCLES, 8 сэмплов/.test(r.out) && !!rj && rj.camera.ground === true, lines(r) || last(r));
    check('поле кадра: камера ставит предмет не ближе 7 % к краю (по вершинам, не по углам рамки), пиксели подтверждают', !!rj && rj.camera.field >= 0.07 && rj.camera.field <= 0.1 && fieldPx >= 6.5 && !/близко к краю|упирается в край/.test(r.out), `камера ${rj && rj.camera.field}, пиксели ${fieldPx}%`);
    const tightScene = path.join(tmp, 'tight.json');
    fs.writeFileSync(tightScene, JSON.stringify({ objects: [{ type: 'sphere', radius: 0.5, location: [0, 0, 0.5] }], camera: { view: [0, -1, 0.2], margin: 1.05 }, ground: false }));
    r = await run(['render', tightScene, '--out', 'rt', '--w', '200', '--h', '200', '--samples', '4', '--small', '0']);
    check('настоящий рендер: сцена с margin 1.05 (поле 2–3 %) — WARN «предмет близко к краю кадра»', r.code === 0 && /WARN\s+tight: предмет близко к краю кадра — поле [1-4]\.\d%/.test(r.out), lines(r) || last(r));
    r = await run(['render', MATSCENE, '--out', 'rm', '--w', '240', '--h', '160', '--samples', '4', '--small', '0']);
    rj = resOf('rm/scene-mats.result.json');
    check('настоящий рендер: все 12 материалов (в т. ч. leafy, honey, printed) и заготовки геометрии строятся и рендерятся', r.code === 0 && /^OK\s+scene-mats — 240×160/m.test(r.out) && !!rj && rj.stats.objects >= 19 && !rj.warnings.length, lines(r) || r.out.split('\n').filter((l) => /BLENDER|Error|ошиб/i.test(l)).slice(-3).join(' | ') || last(r));
    r = await run(['physics', DROP, '--out', 'rp', '--w', '200', '--h', '200', '--samples', '4', '--glb', 'rp/drop.glb', '--no-check', '--small', '0']);
    let g = null; try { g = parseGlb(fs.readFileSync(path.join(tmp, 'rp', 'drop.glb'))); } catch { /* ниже FAIL */ }
    check('настоящая физика: три твёрдых тела и ткань посчитаны, кадр, GLB с анимацией падения (ткань — застывшая)', r.code === 0 && /^(OK|WARN)\s+физика — твёрдых тел 3, тканей 1/m.test(r.out) && /^OK\s+scene-drop — 200×200/m.test(r.out) && !!g && g.animations >= 1 && g.duration > 0.5 && g.meshes >= 5, lines(r) || last(r));
    r = await run(['glb', MATSCENE, '--out', 'rg/mats.glb', '--draco', ...(three && chromeOk ? [] : ['--no-check'])]);
    g = null; try { g = parseGlb(fs.readFileSync(path.join(tmp, 'rg', 'mats.glb'))); } catch { /* ниже FAIL */ }
    check('настоящий экспорт glTF: модификаторы применены, материалы запечены, печать картинкой, Draco, стекло с пропусканием', r.code === 0 && !!g && g.required.includes('KHR_draco_mesh_compression') && g.images.length >= 2 && g.extensions.includes('KHR_materials_transmission') && g.vertices > 3000 && !g.external.length && /запечено материалов в картинки: [1-9]/.test(r.out), `${lines(r) || last(r)} · ${g ? g.extensions.join(',') + ' картинок ' + g.images.length : 'GLB не разобран'}`);
    if (three && chromeOk) check('GLB из настоящего Blender грузится в viewer.html и рисует непустой кадр', /^OK\s+GLB в странице/m.test(r.out) && /^OK\s+кадр в странице/m.test(r.out), lines(r));
    else skip('GLB из настоящего Blender в viewer.html', !three ? 'нет three.js' : 'нет Chrome');
  }

  if (!keep) fs.rmSync(tmp, { recursive: true, force: true }); else console.log(`\nпапка оставлена: ${tmp}`);
  console.log(`\n${total} проверок, ${failed} провалов, ${skipped} пропусков`);
  return failed ? 1 : 0;
}

/* Заглушка Blender для selftest: тот же порядок аргументов и протокол, что у run.py, но кадры рисует sharp,
   а GLB берёт со стенда. Режимы: SR_STUB_MODE=empty (пустой кадр), error (ошибка сцены), moving (не улеглось),
   tight (предмет в 3 % от края); SR_STUB_BLEED=1 — сцена сама выводит предмет за край; SR_STUB_GROUND=1 — тень на земле. */
function stubSource(libPath, glb) {
  return `import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { loadSharp } = await import(pathToFileURL(${JSON.stringify(libPath)}).href);
const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('Blender 4.2.3 LTS (заглушка selftest)'); process.exit(0); }
const job = JSON.parse(fs.readFileSync(a[a.indexOf('--') + 1], 'utf8'));
const mode = process.env.SR_STUB_MODE || 'ok';
const say = (t, s) => console.log('BLENDER-' + t + ' ' + s);
const done = (r) => { r.mode = job.mode; if (job.result) fs.writeFileSync(job.result, JSON.stringify(r)); say('RESULT', JSON.stringify(r)); process.exit(0); };
if (job.mode === 'probe') done({ blender: '4.2.3 LTS', version: [4, 2, 3], python: '3.11.9', cycles: true, gpus: [{ type: 'METAL', names: ['Apple M2 (заглушка)'] }], gltf: true, draco: true, view_transforms: ['Khronos PBR Neutral', 'AgX', 'Filmic', 'Standard'], eevee: 'BLENDER_EEVEE_NEXT', shadow_catcher: true });
if (mode === 'error') { say('ERROR', 'в сцене нет функции build(ctx)'); say('TRACE', 'Traceback (most recent call last):'); say('TRACE', 'RuntimeError: в сцене нет функции build(ctx)'); process.exit(3); }
const sharp = loadSharp();
const tight = mode === 'tight';
fs.mkdirSync(job.out_dir, { recursive: true });
say('STEP', 'сцена ' + path.basename(job.scene.file));
say('WARN', 'заглушка: предупреждение сцены');
console.log('Fra:1 Mem:12.00M (Peak 12.00M) | Time:00:00.10 | Sample 1/' + job.samples);
const frame = async (file, k = 0) => {
  const W = job.w, H = job.h, r = Math.round(Math.min(W, H) * (tight ? 0.47 : 0.28)), cx = Math.round(W / 2), cy = Math.round(H * (tight ? 0.5 : 0.2 + 0.3 * k));
  const svg = mode === 'empty' ? '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"/>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><ellipse cx="' + cx + '" cy="' + Math.round(H * 0.82) + '" rx="' + r + '" ry="' + Math.round(r / 4) + '" fill="#000" fill-opacity="0.25"/><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#C8553D"/></svg>';
  await sharp(Buffer.from(svg)).png().toFile(file);
};
const png = path.join(job.out_dir, job.name + '.png');
const res = { render: { engine: 'CYCLES', device: { device: 'GPU', type: 'METAL', names: ['Apple M2 (заглушка)'] }, samples: job.samples, denoise: job.denoise, view_transform: 'Khronos PBR Neutral' }, stats: { objects: 4, triangles: 1234, vertices: 900 }, warnings: [], camera: { field: tight ? 0.03 : 0.1, bleed: process.env.SR_STUB_BLEED === '1', ground: process.env.SR_STUB_GROUND === '1' } };
if (job.mode === 'render') { await frame(png, 0.6); done({ ...res, png, seconds: 0.1 }); }
const frames = job.frames || 60;
res.simulation = { bodies: 3, rigid: 3, cloth: [], keys: 3 * frames, seconds: 0.2, frames, moving: mode === 'moving' ? ['card.001'] : [], fallen: [] };
if (mode === 'moving') say('WARN', 'не улеглось к кадру ' + frames + ': card.001 — больше --frames');
if (job.mode === 'physics') {
  await frame(png, 0.6); res.png = png;
  if (job.outputs.video) {
    const dir = path.join(job.out_dir, job.name + '-frames'); fs.mkdirSync(dir, { recursive: true });
    for (let f = 1; f <= frames; f += job.video.step) await frame(path.join(dir, job.name + '-' + String(f).padStart(4, '0') + '.png'), f / frames);
    res.frames_dir = dir;
  }
}
if (job.glb) { fs.mkdirSync(path.dirname(job.glb.file), { recursive: true }); fs.copyFileSync(${JSON.stringify(glb)}, job.glb.file); res.glb = { file: job.glb.file, bytes: fs.statSync(job.glb.file).size, skipped: [], baked: 0, animation: job.glb.animation, objects: 4 }; }
done(res);
`;
}

/* ---------------- вход ---------------- */
async function main() {
  /* -h (одна черта) — справка; --h — высота кадра */
  if (opt.help || pos.includes('-h') || !pos.length) { console.log(HELP); return pos.length || opt.help ? 0 : 1; }
  const cmd = pos.shift();
  report.command = cmd;
  if (!COMMANDS.includes(cmd)) die(`Не знаю команду «${cmd}»: есть ${COMMANDS.join(', ')} (-h)`);
  if (cmd === 'selftest') return selftest({ keep: !!opt.keep });
  if (cmd === 'doctor') return doctor();
  if (cmd === 'vendor') { vendor(); return done(); }
  if (cmd === 'glb-check') {
    const f = pos[0]; if (!f) die('Нужно: node blender.mjs glb-check <файл.glb>');
    if (!exists(f)) die(`Нет файла: ${f}`);
    const poster = str(opt.poster); if (poster && !exists(poster)) die(`Нет постера: ${poster}`);
    const site = str(opt.site) ? path.resolve(String(opt.site)) : null;
    await glbReport(path.resolve(f), { kind: oneOf('for', ['item', 'scene'], 'item'), poster: poster && path.resolve(poster), shot: str(opt.shot), site, check: true });
    return done();
  }
  return runScene(cmd);
}
if (isMain) main().then((code) => process.exit(code), (e) => { console.error(`FAIL ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e}`); process.exit(1); });
