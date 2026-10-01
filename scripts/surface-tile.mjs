#!/usr/bin/env node
/**
 * Своя плитка крупной фактуры: мятая бумага, камень с прожилками, ткань. Это не зерно
 * (мелкий шум — grain-tile.mjs), а светлая картинка-плитка с деталями крупнее пикселя:
 * грани и заломы, прожилки, переплетение нитей. Чужой файл (texture.webp донора и любой
 * другой) на сайт не переносится никогда: у донора снимаются только числа (texture.mjs —
 * яркость, σ, размер показа, наложение), а плитка рисуется здесь, детерминированно — при
 * одном и том же --seed файлы совпадают побайтно. Плитка бесшовная: шум периодический,
 * грани стоят на завёрнутой решётке, прожилки и нити заворачиваются через край, размытие
 * тоже идёт через край.
 *
 *   node surface-tile.mjs --out папка [--kind paper|stone|canvas] [--size 1024] [--seed 11]
 *                         [--name имя] [--formats webp,png] [--like texture.json]
 *                         [--mean 248] [--sd 2.5] [--veins N] [--quality 86] [--sheet] [--json файл]
 *   node surface-tile.mjs --check файл.webp|png|jpg [--mean M] [--sd S] [--like texture.json] [--json файл]
 *   node surface-tile.mjs selftest      самопроверка (то же: --selftest), ничего не пишет вне временной папки
 *   node surface-tile.mjs --help | -h   справка, код 0, ничего не пишет
 *   node surface-tile.mjs               без аргументов — справка и код 1, ничего не пишет
 *
 * Флаги:
 *   --out      папка для файлов (по умолчанию текущая — если задан хоть один другой флаг).
 *              Создаётся только после проверки аргументов: неизвестный --kind, неизвестное имя
 *              в --formats, позиционный аргумент, --out без папки, --like без крупной фактуры
 *              в замере — код 1, и ничего не создано.
 *   --kind     paper  — мятая бумага: грани с разным наклоном к свету, заломы по их границам,
 *                       тонкие ветвящиеся трещины, волокна и вкрапления (по умолчанию);
 *              stone  — камень: мягкие пятна и длинные извилистые ветвящиеся прожилки, тёмные
 *                       с тенью-вмятиной и светлые; граней нет;
 *              canvas — ткань: полотняное переплетение нитей (шаг нити ≈ 16 px), нити разной
 *                       толщины с утолщениями.
 *   --size     сторона плитки, px (1024; не меньше 128). Детали остаются того же размера в
 *              пикселях: меньше плитка — чаще виден повтор.
 *   --seed     зерно генератора (11). Тот же seed — побайтно тот же файл; другое число —
 *              другой, но тоже постоянный рисунок.
 *   --name     имя файлов без расширения (surface-<kind>-<size>).
 *   --formats  что писать, через запятую: webp, png. По умолчанию webp (с потерями, единицы–
 *              десятки КБ). png — без потерь и в разы тяжелее: на сайт его не класть.
 *   --like     texture.json замера texture.mjs: яркость и σ плитки крупной фактуры донора
 *              берутся из него (рецепт: recipe.surface.tile). --mean и --sd главнее.
 *   --mean     средняя яркость готовой плитки, 0…255 (248 — светлая бумага; с образца
 *              zakroma.rest снято 248.28).
 *   --sd       разброс яркости σ готовой плитки, уровней (2.5; с образца снято 2.51). Меряется
 *              по записанному файлу: сжатие сглаживает детали, поэтому усиление подгоняется
 *              повторным кодированием, пока файл не попадёт в цель.
 *   --veins    число прожилок-стволов (paper — трещины, stone — прожилки; у каждой свои ветви).
 *              По умолчанию paper 22, stone 12 на плитку 1024 px (меньше плитка — меньше, по
 *              площади). 0 — без прожилок. Для canvas не действует (WARN).
 *   --quality  качество WebP 1…100. По умолчанию 86, и если после сжатия шов больше 1.4, качество
 *              поднимается по 4 (до 96), пока стык не уйдёт; заданное явно — не меняется (шов тогда
 *              только проверяется). 100 — без потерь (файл в несколько раз тяжелее).
 *   --sheet    ещё два файла для глаз: <имя>-sheet.jpg — лист 2×2 с усиленным контрастом
 *              (стыки плиток — крестом посередине), <имя>-seam.jpg — тот же крест 1:1.
 *              Открыть и посмотреть: стыков быть не должно. На сайт эти файлы не класть.
 *   --json     записать итог (параметры, замеры каждого файла) в файл.
 *   --check    не генерировать, а проверить готовый файл: бесшовность по краям числом,
 *              яркость ± σ (с --mean/--sd или --like — попадание в цель), lag1, вес и вердикт
 *              разбора texture.mjs («крупная фактура — да / нет»).
 *
 * Бесшовность числом («шов», считает seamOf из texture.mjs): скачок яркости через край (последний
 * столбец против первого — при повторе они соседи) делится на почти самый большой из обычных
 * скачков между соседними столбцами внутри плитки (98-й процентиль: у ткани каждая шестнадцатая
 * граница — стык нитей); то же по строкам, и ещё раз по средним шести пикселей с каждой стороны
 * (ступенька, которую прячет мелкая рябь). Около 1 и меньше — край не отличить от середины; больше
 * 1.6 — WARN, больше 2.5 — FAIL «шов виден». Замерено: свои плитки до сжатия 0.5…1.0, после WebP
 * q86 до 1.4 (сжатие с потерями кодирует края независимо); вырез из плитки 5…9; плавный уклон
 * 10…20; ступенька в 1 уровень 1.9…3.5; texture.webp образца — 4.2 (у донора стык есть).
 *
 * Самопроверка после записи читает каждый файл заново: размер, вес, яркость ± σ против цели
 * (яркость ±1, σ ±15 %), lag1, шов, и спрашивает texture.mjs, узнаёт ли он плитку как крупную
 * фактуру (иначе замер своего сайта её не увидит).
 * Вердикты: OK; WARN — шов 1.6…2.5, PNG тяжелее 150 КБ, --veins у canvas, texture.mjs плитку
 * не узнаёт; FAIL — шов больше 2.5, плитка плоская (σ < 0.5), мимо цели по яркости или σ.
 *
 * selftest (без сети и браузера, во временной папке): у каждого вида — тот же seed даёт тот же
 * файл, другой seed — другой рисунок, цель по яркости и σ, шов до и после сжатия, узнаёт ли
 * texture.mjs; пять целей от почти белой до тёмной; --veins; PNG; мера шва на вырезе, уклоне,
 * ступеньке и шуме; запуск из командной строки (вес, --check, --like, --sheet, --json, имена);
 * неверные аргументы — код 1 и ничего не создано.
 *
 * Экспорт для других скриптов: KINDS, DEFAULT_MEAN, DEFAULT_SD, MEAN_TOL, SD_TOL, makeField,
 * fieldToBytes, renderTile, measureTileFile, writeSheet, targetFromJson.
 *
 * Коды выхода: 0 — готово (при любых WARN); 1 — FAIL, неверные аргументы или запуск без аргументов.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSharp, parseArgs, writeJson, readJson, flagsDump } from './lib.mjs';
import { analyzeTile, seamOf, SEAM_WARN, SEAM_FAIL } from './texture.mjs';

const SELF = fileURLToPath(import.meta.url);
/* справка — до загрузки sharp: -h и запуск без аргументов ничего не создают и работают без него */
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(SELF); } catch { return false; } })();
const HELP = `surface-tile.mjs — своя бесшовная плитка крупной фактуры: мятая бумага, камень, ткань
(детерминированно; чужой файл не переносится; мелкое зерно — grain-tile.mjs)

  node surface-tile.mjs --out папка [--kind paper|stone|canvas] [--size 1024] [--seed 11] [--name имя]
                        [--formats webp,png] [--like texture.json] [--mean 248] [--sd 2.5] [--veins N]
                        [--quality 86] [--sheet] [--json файл]
  node surface-tile.mjs --check файл.webp|png|jpg [--mean M] [--sd S] [--like texture.json] [--json файл]
  node surface-tile.mjs selftest      самопроверка (то же: --selftest)
  node surface-tile.mjs --help | -h
  node surface-tile.mjs               без аргументов — эта справка и код 1, ничего не записано

  --out        папка для файлов (по умолчанию текущая — если задан хоть один другой флаг)
  --kind       paper — мятая бумага: грани, заломы, трещины, волокна (по умолчанию);
               stone — камень: мягкие пятна и длинные ветвящиеся прожилки, без граней;
               canvas — ткань: переплетение нитей, шаг нити ≈ 16 px
  --size       сторона плитки, px (1024, не меньше 128)
  --seed       зерно генератора (11): тот же seed — побайтно тот же файл
  --name       имя файлов без расширения (surface-<kind>-<size>)
  --formats    что писать: webp, png (по умолчанию webp; png без потерь и в разы тяжелее)
  --like       texture.json замера texture.mjs: яркость и σ плитки донора — из него
  --mean       средняя яркость плитки 0…255 (248); главнее --like
  --sd         разброс яркости σ, уровней (2.5); меряется по записанному файлу; главнее --like
  --veins      число прожилок-стволов: paper 22, stone 12 на 1024 px; 0 — без прожилок; canvas — не действует
  --quality    качество WebP 1…100 (86, само поднимается до 96, пока шов больше 1.4; заданное явно не меняется);
               100 — без потерь
  --sheet      лист 2×2 с усиленным контрастом (<имя>-sheet.jpg) и крест стыков 1:1 (<имя>-seam.jpg) — для глаз
  --json       записать итог в файл
  --check      проверить готовый файл: шов по краям числом, яркость ± σ, lag1, вес, узнаёт ли его texture.mjs
  --selftest   самопроверка: детерминизм, бесшовность, попадание в яркость и σ, все виды, разбор аргументов

Шов: скачок яркости через край, делённый на почти самый большой из обычных скачков между соседними
столбцами (строками) внутри плитки, и то же по средним шести пикселей. Около 1 и меньше — край не отличить
от середины; больше 1.6 — WARN, больше 2.5 — FAIL «шов виден».

Папка --out создаётся только после проверки аргументов. Код 1 и ничего не создано: неизвестный --kind,
неизвестное имя в --formats, позиционный аргумент (кроме selftest), --out без папки, --like без крупной фактуры.

Как положить плитку — templates/surface.css; как снять числа с донора — texture.mjs <донор> (крупная фактура).

Вердикты: OK; WARN — шов 1.6…2.5, тяжёлый PNG, --veins у canvas, texture.mjs плитку не узнаёт;
FAIL — шов больше 2.5, плитка плоская, мимо цели по яркости (±1) или σ (±15 %).
Коды выхода: 0 — готово (при любых WARN); 1 — FAIL, неверные аргументы или запуск без аргументов.`;
/* флаги — одним списком: и для разбора, и для справочника flags-doc.mjs (он спрашивает до справки и выхода без аргументов) */
const ARGS = { flags: ['help', 'h', 'sheet', 'selftest'], values: ['out', 'kind', 'size', 'seed', 'name', 'formats', 'like', 'mean', 'sd', 'veins', 'quality', 'json', 'check'], commands: ['selftest'], strict: true };
if (isMain) {
  flagsDump(ARGS);
  const argv = process.argv.slice(2);
  if (!argv.length) { console.log(HELP); console.error('\nБез аргументов плитка не пишется: укажите --out папка (или --check файл, или selftest).'); process.exit(1); }
  if (argv.includes('-h') || argv.includes('--help') || argv.includes('--h')) { console.log(HELP); process.exit(0); }
}

let sharpMod;
function needSharp() {
  if (sharpMod === undefined) sharpMod = loadSharp() || null;
  if (!sharpMod) throw new Error('нужен sharp: npm i sharp --prefix ~/.claude/site-rework (или запускать из папки проекта, где он есть)');
  return sharpMod;
}

const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const kb1 = (b) => `${Math.round(b / 1024 * 10) / 10} КБ`;

/** Виды плитки: имя → подпись и число прожилок-стволов на плитку 1024 px. */
export const KINDS = {
  paper: { title: 'мятая бумага', veins: 22 },
  stone: { title: 'камень с прожилками', veins: 12 },
  canvas: { title: 'ткань, переплетение нитей', veins: 0 },
};
/** Цель по умолчанию — с образца (zakroma.rest, texture.webp): яркость 248.28 ± 2.51. */
export const DEFAULT_MEAN = 248, DEFAULT_SD = 2.5;
/** Допуски самопроверки файла: яркость ± уровней, σ ± доля. */
export const MEAN_TOL = 1, SD_TOL = 0.15;
/** PNG тяжелее этого — WARN: на сайт класть WebP. */
const PNG_HEAVY = 150 * 1024;
/** До какого шва доводится WebP подъёмом качества (с запасом до SEAM_WARN = 1.6). */
export const SEAM_AIM = 1.4;

/* ---------------- генерация: общие части ---------------- */

/* mulberry32 — одинаковый рисунок при каждом запуске */
function rng(seed) {
  let s = seed | 0;
  return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const wrap = (i, n) => ((i % n) + n) % n;

/* Периодический градиентный шум: решётка P×P единичных векторов заворачивается через край,
   между узлами — плавная интерполяция. Значения примерно −0.7…0.7. */
function gradGrid(P, rnd) {
  const gx = new Float32Array(P * P), gy = new Float32Array(P * P);
  for (let i = 0; i < P * P; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  return { P, gx, gy };
}
function gradNoise(g, fx, fy) {
  const P = g.P; const xf = Math.floor(fx), yf = Math.floor(fy); const tx = fx - xf, ty = fy - yf;
  const x0 = wrap(xf, P), y0 = wrap(yf, P), x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
  const u = tx * tx * tx * (tx * (tx * 6 - 15) + 10), v = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  const a = g.gx[y0 * P + x0] * tx + g.gy[y0 * P + x0] * ty;
  const b = g.gx[y0 * P + x1] * (tx - 1) + g.gy[y0 * P + x1] * ty;
  const c = g.gx[y1 * P + x0] * tx + g.gy[y1 * P + x0] * (ty - 1);
  const d = g.gx[y1 * P + x1] * (tx - 1) + g.gy[y1 * P + x1] * (ty - 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/* несколько слоёв шума: каждый следующий вдвое мельче и слабее в gain раз; периоды — целые, плитка бесшовная */
function cloud(N, rnd, { cell = 256, octaves = 4, gain = 0.5 } = {}) {
  const grids = []; let P = Math.max(2, Math.round(N / cell));
  for (let o = 0; o < octaves && P <= N / 2; o++, P *= 2) grids.push(gradGrid(P, rnd));
  const out = new Float32Array(N * N);
  let amp = 1;
  for (const g of grids) {
    const k = g.P / N;
    for (let y = 0; y < N; y++) { const fy = y * k; for (let x = 0; x < N; x++) out[y * N + x] += amp * gradNoise(g, x * k, fy); }
    amp *= gain;
  }
  return out;
}

/* Размытие через край: скользящее среднее радиуса r по строкам и столбцам, passes раз (3 прохода ≈ гауссово).
   sharp.blur для плитки не годится: у края он повторяет крайний пиксель — выходит шов. */
function blurWrap(src, N, r, passes = 3) {
  if (r < 1) return src;
  let a = Float32Array.from(src), b = new Float32Array(N * N); const win = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < N; y++) {
      const row = y * N; let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + wrap(k, N)];
      for (let x = 0; x < N; x++) { b[row + x] = s / win; s += a[row + wrap(x + r + 1, N)] - a[row + wrap(x - r, N)]; }
    }
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += b[wrap(k, N) * N + x];
      for (let y = 0; y < N; y++) { a[y * N + x] = s / win; s += b[wrap(y + r + 1, N) * N + x] - b[wrap(y - r, N) * N + x]; }
    }
  }
  return a;
}
/* лёгкое сглаживание в три точки (край — через край): линия в 1 px становится мягкой в 2 px */
function soften(src, N, w = 0.22) {
  const b = new Float32Array(N * N), a = new Float32Array(N * N); const c = 1 - 2 * w;
  for (let y = 0; y < N; y++) { const row = y * N; for (let x = 0; x < N; x++) b[row + x] = c * src[row + x] + w * (src[row + wrap(x - 1, N)] + src[row + wrap(x + 1, N)]); }
  for (let y = 0; y < N; y++) { const up = wrap(y - 1, N) * N, dn = wrap(y + 1, N) * N, row = y * N; for (let x = 0; x < N; x++) a[row + x] = c * b[row + x] + w * (b[up + x] + b[dn + x]); }
  return a;
}
/* точка «краски» в слой: делится между четырьмя соседними пикселями, через край заворачивается */
function splat(L, N, x, y, v) {
  const xf = Math.floor(x), yf = Math.floor(y), tx = x - xf, ty = y - yf;
  const x0 = wrap(xf, N), y0 = wrap(yf, N), x1 = (x0 + 1) % N, y1 = (y0 + 1) % N;
  L[y0 * N + x0] += v * (1 - tx) * (1 - ty); L[y0 * N + x1] += v * tx * (1 - ty);
  L[y1 * N + x0] += v * (1 - tx) * ty; L[y1 * N + x1] += v * tx * ty;
}
/* n точек по плитке без сгущений: клетки решётки в случайном порядке, в каждой — по точке. Чисто случайные
   точки собираются в кучу, и при повторе плитки эта куча бросается в глаза раньше, чем сама фактура */
function scatter(n, rnd) {
  if (n <= 0) return [];
  const gx = Math.ceil(Math.sqrt(n)), gy = Math.ceil(n / gx); const cells = [];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) cells.push([i, j]);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
  return cells.slice(0, n).map(([i, j]) => [(i + rnd()) / gx, (j + rnd()) / gy]);
}
/**
 * Прожилка: линия идёт шагами в пиксель, слегка гуляет, изредка ломается или плавно загибается,
 * ветвится и заворачивается через край. К концам тоньше. o: { wobble — дрожание угла на шаг,
 * kink — вероятность излома на шаг, curl — плавная извилистость, branch — вероятность ветви на шаг,
 * depth — глубина ветвления, width — толщина ствола в проходах }.
 */
function vein(L, N, rnd, x, y, ang, len, ink, o, depth = 0) {
  let curl = 0; const side = [0, 0.7, -0.7].slice(0, Math.max(1, Math.round((o.width || 1) * (depth ? 0.5 : 1))));
  for (let t = 0; t < len; t++) {
    ang += (rnd() - 0.5) * o.wobble;
    if (o.curl) { curl += (rnd() - 0.5) * o.curl; curl *= 0.95; ang += curl; }
    if (o.kink && rnd() < o.kink) ang += (rnd() - 0.5) * 0.9;
    x += Math.cos(ang); y += Math.sin(ang);
    const fade = depth ? Math.pow(Math.max(0, 1 - t / len), 0.7) : Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, (t + 0.5) / len))), 0.6);
    for (const d of side) splat(L, N, x - Math.sin(ang) * d, y + Math.cos(ang) * d, ink * fade / side.length * (side.length > 1 ? 1.6 : 1));
    if (depth < o.depth && rnd() < o.branch) {
      vein(L, N, rnd, x, y, ang + (rnd() > 0.5 ? 1 : -1) * (0.35 + rnd() * 0.7), Math.max(12, (len - t) * (0.3 + rnd() * 0.45)), ink * fade * 0.72, o, depth + 1);
    }
  }
}

/* ---------------- три вида ---------------- */

/* Мятая бумага — это грани: лист сломан по прямым заломам, у каждой грани свой наклон к свету.
   Грани — ячейки вокруг точек на завёрнутой решётке G×G (по точке в клетке); залом — граница ячеек;
   у ячейки свой уклон: от него ровный тон грани и плавный перепад поперёк неё. Три размера граней. */
function facets(N, rnd, size) {
  const G = Math.max(2, Math.round(N / size));
  const px = new Float32Array(G * G), py = new Float32Array(G * G), sx = new Float32Array(G * G), sy = new Float32Array(G * G), tone = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) { px[i] = rnd(); py[i] = rnd(); const a = rnd() * Math.PI * 2, m = 0.35 + rnd() * 0.65; sx[i] = Math.cos(a) * m; sy[i] = Math.sin(a) * m; tone[i] = rnd() - 0.5; }
  const edge = new Float32Array(N * N), shade = new Float32Array(N * N), lean = new Float32Array(N * N);
  const k = G / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x * k, v = y * k, cx = Math.floor(u), cy = Math.floor(v);
    let d1 = 1e9, d2 = 1e9, id = 0, ox = 0, oy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j, c = wrap(gy, G) * G + wrap(gx, G);
      const dx = gx + px[c] - u, dy = gy + py[c] - v, d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; id = c; ox = dx; oy = dy; } else if (d < d2) d2 = d;
    }
    const i = y * N + x;
    edge[i] = (d2 - d1) / k;                                   /* примерно расстояние до залома, px */
    shade[i] = sx[id] * 0.62 - sy[id] * 0.5 + tone[id] * 0.5;  /* тон грани: свет сверху слева */
    lean[i] = -(ox * sx[id] + oy * sy[id]);                    /* перепад поперёк грани */
  }
  return { edge, shade, lean };
}
/* Залом — прямой отрезок, по которому лист согнут: с одной стороны бумага повёрнута к свету, с другой —
   от него. Яркость по сторонам залома расходится резко и плавно сходит на нет на расстоянии W, к концам
   отрезка залом затухает. Залом вдоль света не виден, поперёк — самый сильный. Через край заворачивается. */
function creases(N, rnd, count) {
  const out = new Float32Array(N * N); const lx = -0.6, ly = -0.8;   /* свет сверху слева */
  for (const [px, py] of scatter(count, rnd)) {
    const a = rnd() * Math.PI, L = 110 + rnd() * rnd() * 560, W = 14 + rnd() * 90, s = (0.7 + rnd() * 1.9) * (rnd() > 0.5 ? 1 : -1);
    const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    const lit = (nx * lx + ny * ly) * 0.6 + (rnd() > 0.5 ? 0.4 : -0.4);   /* и рассеянный свет: залом вдоль света тоже виден, слабее */
    const x0 = px * N, y0 = py * N, cx = x0 + dx * L / 2, cy = y0 + dy * L / 2;
    const rx = Math.abs(dx) * L / 2 + Math.abs(nx) * W + 1, ry = Math.abs(dy) * L / 2 + Math.abs(ny) * W + 1;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const t = (x - x0) * dx + (y - y0) * dy; if (t < 0 || t > L) continue;
      const d = (x - x0) * nx + (y - y0) * ny, ad = Math.abs(d); if (ad >= W) continue;
      const fall = 1 - ad / W, side = d >= 0 ? 1 : -1;
      /* в пределах пикселя от залома яркость переходит плавно, а не ступенькой в один пиксель */
      out[wrap(y, N) * N + wrap(x, N)] += s * lit * Math.sqrt(Math.sin(Math.PI * t / L)) * fall * fall * (ad < 1 ? d : side);
    }
  }
  return out;
}
function paperField(N, rnd, veins) {
  const area = (N * N) / (1024 * 1024);
  const A = facets(N, rnd, 256), B = facets(N, rnd, 114);
  const m1 = cloud(N, rnd, { cell: 340, octaves: 2 }), m2 = cloud(N, rnd, { cell: 146, octaves: 2 });   /* где бумага смята сильнее */
  const fold = creases(N, rnd, Math.max(6, Math.round(150 * area)));
  const F = new Float32Array(N * N);
  const line = (e, w) => (e < w ? 1 - e / w : 0);
  for (let i = 0; i < N * N; i++) {
    const m = Math.min(1, Math.max(0, 0.5 + m1[i] * 1.1)), n = Math.min(1, Math.max(0, 0.5 + m2[i] * 1.1));
    F[i] = fold[i] * (0.55 + 0.9 * m)
      + A.shade[i] * 0.55 + A.lean[i] * 1.6                        /* крупные грани — общий наклон листа */
      + B.shade[i] * 0.4 * (0.4 + n) + B.lean[i] * 1.0
      + m1[i] * 1.4                                                /* лист и сам лежит неровно */
      - Math.min(2.6, line(A.edge[i], 1.6) * 2.4 * (0.35 + 0.65 * n) + line(B.edge[i], 1.3) * 1.8 * m * m)
      + (rnd() - 0.5) * 0.9;                                       /* шероховатость листа */
  }
  /* трещины: почти прямые, с изломами, тёмная нитка со светлой кромкой с одной стороны */
  const dark = new Float32Array(N * N), light = new Float32Array(N * N);
  const crack = { wobble: 0.045, kink: 0.011, curl: 0, branch: 0.0045, depth: 2, width: 1 };
  for (const [px, py] of scatter(veins, rnd)) vein(dark, N, rnd, px * N, py * N, rnd() * Math.PI * 2, 260 + rnd() * 520, 3.4 + rnd() * 3.8, crack);
  for (const [px, py] of scatter(Math.round(veins * 0.4), rnd)) vein(light, N, rnd, px * N, py * N, rnd() * Math.PI * 2, 160 + rnd() * 300, 2.2 + rnd() * 1.4, crack);
  /* волокна и вкрапления: короткие штрихи светлее и темнее бумаги */
  const fibre = { wobble: 0.02, kink: 0, curl: 0, branch: 0, depth: 0, width: 1 };
  for (const [px, py] of scatter(Math.round(260 * area), rnd)) vein(rnd() > 0.5 ? light : dark, N, rnd, px * N, py * N, rnd() * Math.PI * 2, 12 + rnd() * 38, 1.9, fibre);
  for (const [px, py] of scatter(Math.round(20 * area), rnd)) vein(dark, N, rnd, px * N, py * N, rnd() * Math.PI * 2, 2 + rnd() * 4, 3.5 + rnd() * 4, fibre);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    F[i] += light[i] - dark[i] + dark[wrap(y - 1, N) * N + wrap(x - 1, N)] * 0.4;   /* кромка трещины ловит свет */
  }
  return soften(F, N, 0.2);
}

/* Камень: граней нет. Мягкие пятна в несколько размеров, длинные извилистые прожилки с ветвями:
   тёмные лежат во вмятине (широкая слабая тень вокруг), светлые тоньше и короче. */
function stoneField(N, rnd, veins) {
  const big = cloud(N, rnd, { cell: 380, octaves: 4, gain: 0.55 }), mid = cloud(N, rnd, { cell: 120, octaves: 3, gain: 0.5 });
  const F = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) F[i] = big[i] * 4.2 + Math.abs(mid[i]) * 2.4 - 0.6 + (rnd() - 0.5) * 0.5;
  const dark = new Float32Array(N * N), light = new Float32Array(N * N);
  const river = { wobble: 0.035, kink: 0.006, curl: 0.004, branch: 0.016, depth: 3, width: 2 };
  const hair = { wobble: 0.04, kink: 0.008, curl: 0.005, branch: 0.018, depth: 3, width: 1 };
  for (const [px, py] of scatter(veins, rnd)) vein(dark, N, rnd, px * N, py * N, rnd() * Math.PI * 2, 300 + rnd() * 520, 3.2 + rnd() * 3.4, river);
  for (const [px, py] of scatter(Math.round(veins * 0.75), rnd)) vein(light, N, rnd, px * N, py * N, rnd() * Math.PI * 2, 220 + rnd() * 380, 2.0 + rnd() * 1.8, hair);
  const dent = blurWrap(dark, N, 5, 3), glow = blurWrap(light, N, 3, 2);
  for (let i = 0; i < N * N; i++) F[i] += light[i] * 1.0 + glow[i] * 1.6 - dark[i] * 1.0 - dent[i] * 5.5;
  return soften(F, N, 0.24);
}

/* Ткань: полотняное переплетение. Нитей M по каждой оси (чётное число — рисунок сходится на краю);
   в клетке сверху то продольная нить, то поперечная, через одну. Нить круглая: светлее по оси, темнее
   у краёв, и выгибается над той, что под ней. У каждой нити своя толщина и утолщения по длине. */
function canvasField(N, rnd) {
  const M = Math.max(4, 2 * Math.round(N / 32));          /* шаг нити ≈ 16 px */
  const K = Math.max(4, Math.round(M / 4));               /* узлов неровности вдоль нити */
  const mk = () => { const t = new Float32Array(M * K), w = new Float32Array(M); for (let i = 0; i < M; i++) { w[i] = 1 + (rnd() - 0.5) * 0.34 + (rnd() < 0.08 ? (rnd() - 0.5) * 0.7 : 0); for (let k = 0; k < K; k++) t[i * K + k] = rnd() - 0.5; } return { t, w }; };
  const warp = mk(), weft = mk();
  /* утолщение нити i в точке s (0…M вдоль нити): плавно между K узлами, через край заворачивается */
  const slub = (th, i, s) => { const f = s * K / M, k0 = Math.floor(f), a = f - k0, u = a * a * (3 - 2 * a); return th.t[i * K + wrap(k0, K)] * (1 - u) + th.t[i * K + wrap(k0 + 1, K)] * u; };
  const tone = cloud(N, rnd, { cell: 300, octaves: 3 });
  const F = new Float32Array(N * N); const k = M / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    /* сдвиг на полнити: край плитки проходит по оси нити, где она ровная, а не по стыку нитей —
       стык на краю сжатие с потерями кодирует резче, чем стыки внутри, и выходит шов */
    const u = x * k + 0.5, v = y * k + 0.5, iu = Math.floor(u), jv = Math.floor(v), fu = u - iu, fv = v - jv;
    const i = iu % M, j = jv % M;
    const over = ((i + j) & 1) === 0;                     /* сверху продольная (вертикальная) нить */
    const across = over ? fu : fv, along = over ? fv : fu;
    const th = over ? warp : weft, id = over ? i : j, s = over ? v : u;
    const fat = th.w[id] * (1 + 0.5 * slub(th, id, s));
    const round = Math.pow(Math.sin(Math.PI * across), 0.8 / Math.max(0.5, fat));
    const arch = 0.5 + 0.5 * Math.sin(Math.PI * along);
    F[y * N + x] = round * (0.45 + 0.55 * arch) * 6 * (0.8 + 0.2 * fat) + tone[y * N + x] * 2.2 + (rnd() - 0.5) * 0.7;
  }
  return soften(F, N, 0.18);
}

/**
 * Рисунок плитки: поле N×N в условных единицах (ещё без яркости и σ). Детерминированно по seed.
 * { kind: 'paper'|'stone'|'canvas', size, seed, veins — число прожилок-стволов (null — по умолчанию) }.
 */
export function makeField({ kind = 'paper', size = 1024, seed = 11, veins = null } = {}) {
  if (!KINDS[kind]) throw new Error(`неизвестный вид ${kind}: ${Object.keys(KINDS).join(', ')}`);
  const N = size; const rnd = rng(seed);
  const n = veins == null ? Math.max(1, Math.round(KINDS[kind].veins * (N * N) / (1024 * 1024))) : Math.max(0, Math.round(veins));
  return kind === 'stone' ? stoneField(N, rnd, n) : kind === 'canvas' ? canvasField(N, rnd) : paperField(N, rnd, n);
}

/** Поле → серые пиксели 0…255 с заданным средним и разбросом: (F − среднее) / σ поля × sd × gain + mean + shift. */
export function fieldToBytes(F, { mean = DEFAULT_MEAN, sd = DEFAULT_SD, gain = 1, shift = 0 } = {}) {
  let s = 0, s2 = 0; for (let i = 0; i < F.length; i++) { s += F[i]; s2 += F[i] * F[i]; }
  const m = s / F.length, d = Math.sqrt(Math.max(1e-12, s2 / F.length - m * m));
  const k = sd * gain / d, c = mean + shift; const buf = Buffer.alloc(F.length);
  for (let i = 0; i < F.length; i++) { const v = Math.round(c + (F[i] - m) * k); buf[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
  return buf;
}

/* ---------------- замер плитки ---------------- */

/* среднее и σ яркости, связь соседних пикселей по строкам и столбцам */
function stats(Y, w, h) {
  let s = 0, s2 = 0; const n = w * h;
  for (let i = 0; i < n; i++) { s += Y[i]; s2 += Y[i] * Y[i]; }
  const m = s / n, v = Math.max(0, s2 / n - m * m); let ch = 0, cv = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) ch += (Y[y * w + x] - m) * (Y[y * w + x + 1] - m);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) cv += (Y[y * w + x] - m) * (Y[(y + 1) * w + x] - m);
  return { mean: m, sd: Math.sqrt(v), lag1: v > 0 ? ch / (h * (w - 1)) / v : null, lag1v: v > 0 ? cv / ((h - 1) * w) / v : null };
}
const lumaFromRaw = (data, n, ch) => { const Y = new Float32Array(n); for (let i = 0; i < n; i++) Y[i] = ch >= 3 ? 0.2126 * data[i * ch] + 0.7152 * data[i * ch + 1] + 0.0722 * data[i * ch + 2] : data[i * ch]; return Y; };

/**
 * Замер файла плитки (или Buffer) тем же разбором, каким texture.mjs разбирает файл слоя на странице:
 * { file, format, bytes, width, height, pages, mean, sd, lag1, lag1v, alpha, chroma, seam { x, y, max },
 *   surfaceLike — узнаёт ли texture.mjs в ней крупную фактуру, surfaceWhy[] — чем не подошла }.
 */
export async function measureTileFile(input, { name = null } = {}) {
  const t = await analyzeTile(input, { name, seam: true }); const f = t.frames[0];
  return {
    file: t.file, format: t.format, bytes: t.bytes, width: t.width, height: t.height, pages: t.pages,
    mean: f.mean, sd: f.sd, lag1: f.lag1, lag1v: f.lag1v, alpha: f.alphaMean, chroma: f.chroma,
    seam: t.seam ? { x: t.seam.x, y: t.seam.y, max: t.seam.max } : null, surfaceLike: t.surfaceLike, surfaceWhy: t.surfaceWhy,
  };
}

/* ---------------- запись ---------------- */

async function encode(buf, N, format, quality) {
  const sharp = needSharp(); const img = sharp(buf, { raw: { width: N, height: N, channels: 1 } });
  if (format === 'png') return img.png({ compressionLevel: 9, palette: false }).toBuffer();
  return quality >= 100 ? img.webp({ lossless: true, effort: 6 }).toBuffer() : img.webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
}
/**
 * Плитка в файл нужного формата с попаданием в яркость и σ ПОСЛЕ кодирования (fitTile), а у WebP с потерями
 * ещё и с проверкой шва: сжатие кодирует края плитки независимо, и на гладком рисунке стык может выйти
 * резче соседних столбцов. seamLimit — предел шва (null — не проверять): выше него качество поднимается
 * на 4 (не больше 96) и плитка кодируется заново. Всё детерминированно: тот же вход — тот же файл.
 * → { data: Buffer, mean, sd, tries, history, quality — с каким качеством записано, seam, raised — { from, steps[] } или null }.
 */
export async function renderTile(F, N, { format = 'webp', mean = DEFAULT_MEAN, sd = DEFAULT_SD, quality = 86, seamLimit = null } = {}) {
  const sharp = needSharp(); const steps = [];
  for (let q = quality; ; q = Math.min(96, q + 4)) {
    const res = await fitTile(F, N, { format, mean, sd, quality: q });
    if (seamLimit == null || format !== 'webp' || q >= 100) return { ...res, quality: q, seam: null, raised: null };
    const raw = await sharp(res.data).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const seam = seamOf(lumaFromRaw(raw.data, N * N, raw.info.channels), N, N).max;
    steps.push({ quality: q, seam, bytes: res.data.length });
    if (seam <= seamLimit || q >= 96) return { ...res, quality: q, seam, raised: q !== quality ? { from: quality, steps } : null };
  }
}
/* подгонка усиления и сдвига под цель: сжатие сглаживает детали, обрезка по 255 сдвигает среднее — плитка
   кодируется повторно (до 8 раз), пока яркость и σ записанного файла не попадут в цель. → { data, mean, sd, tries, history } */
async function fitTile(F, N, { format, mean, sd, quality }) {
  const sharp = needSharp();
  let gain = 1, shift = 0, best = null, lo = null, hi = null; const history = [];
  for (let t = 1; t <= 8; t++) {
    const data = await encode(fieldToBytes(F, { mean, sd, gain, shift }), N, format, quality);
    const raw = await sharp(data).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const st = stats(lumaFromRaw(raw.data, N * N, raw.info.channels), N, N);
    history.push({ gain: Math.round(gain * 1000) / 1000, shift: r2(shift), mean: r2(st.mean), sd: r2(st.sd), bytes: data.length });
    const err = Math.abs(st.mean - mean) + Math.abs(st.sd - sd) / Math.max(0.1, sd) * 4;
    if (!best || err < best.err) best = { data, mean: st.mean, sd: st.sd, tries: t, err };
    if (Math.abs(st.mean - mean) <= 0.12 && Math.abs(st.sd - sd) <= 0.02 * sd) break;
    /* σ после сжатия растёт с усилением не по прямой (кодек то выбрасывает мелкие детали, то оставляет):
       шаг «во сколько раз не хватило» качается вокруг цели. Поэтому цель берётся в вилку — усиление,
       при котором σ мала, и усиление, при котором велика, — и дальше ищется между ними */
    if (st.sd < sd) { if (!lo || gain > lo.gain) lo = { gain, sd: st.sd }; } else if (!hi || gain < hi.gain) hi = { gain, sd: st.sd };
    if (lo && hi && hi.gain > lo.gain) {
      const span = hi.gain - lo.gain; let g = hi.sd > lo.sd ? lo.gain + (sd - lo.sd) * span / (hi.sd - lo.sd) : lo.gain + span / 2;
      g = Math.min(hi.gain - span * 0.1, Math.max(lo.gain + span * 0.1, g));
      if (span < 0.004) break;
      gain = g;
    } else if (st.sd > 0.01) gain *= sd / st.sd;
    shift += mean - st.mean;
  }
  return { ...best, history };
}

/** Лист 2×2 и крест стыков 1:1 с усиленным контрастом — чтобы стыки увидел человек. → { sheet, seam, gain }. */
export async function writeSheet(tileFile, outBase) {
  const sharp = needSharp();
  const { data, info } = await sharp(tileFile).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height; const st = stats(Float32Array.from(data), w, h);
  const gain = Math.max(1, Math.min(40, 30 / Math.max(0.5, st.sd)));      /* σ на листе ≈ 30 уровней */
  const big = Buffer.alloc(4 * w * h);
  for (let y = 0; y < 2 * h; y++) for (let x = 0; x < 2 * w; x++) { const v = Math.round(140 + (data[(y % h) * w + (x % w)] - st.mean) * gain); big[y * 2 * w + x] = v < 0 ? 0 : v > 255 ? 255 : v; }
  const sheet = `${outBase}-sheet.jpg`, seam = `${outBase}-seam.jpg`;
  const full = () => sharp(big, { raw: { width: 2 * w, height: 2 * h, channels: 1 } });
  await full().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84 }).toFile(sheet);
  const cw = Math.min(2 * w, 900), chh = Math.min(2 * h, 900);
  await full().extract({ left: Math.round(w - cw / 2), top: Math.round(h - chh / 2), width: cw, height: chh }).jpeg({ quality: 88 }).toFile(seam);
  return { sheet, seam, gain: r2(gain) };
}

/* ---------------- цель из замера ---------------- */

/**
 * Яркость и σ для своей плитки из texture.json замера texture.mjs: рецепт крупной фактуры
 * (recipe.surface: tileMean, tileSd — уже с поправкой на прозрачность слоя донора), иначе плитка первого
 * экрана, где она снята. Нет файла, файл не читается или крупной фактуры в нём нет — исключение.
 * → { mean, sd, size — период показа у донора, px (или null), tile — имя файла донора }.
 */
export function targetFromJson(file) {
  if (!fs.existsSync(file)) throw new Error(`нет файла ${file}`);
  const j = readJson(file); if (!j) throw new Error(`${file} не читается как JSON`);
  const S = j.recipe && j.recipe.surface && !j.recipe.surface.none ? j.recipe.surface : null;
  if (S && S.tileMean != null && S.tileSd != null) return { mean: S.tileMean, sd: S.tileSd, size: S.size || null, tile: S.tile ? S.tile.file : null };
  const list = Array.isArray(j) ? j : j.results || [j];
  const r = list.find((x) => x && x.surface && x.surface.tile);
  if (r) return { mean: r.surface.tile.mean, sd: r.surface.tile.sd, size: null, tile: r.surface.tile.file };
  throw new Error(`в ${file} крупной фактуры нет — задайте --mean и --sd или перемерьте донора: texture.mjs <донор>`);
}

/* ---------------- вывод ---------------- */
let fails = 0, warns = 0;
const line = (status, what, details) => { if (status === 'FAIL') fails++; if (status === 'WARN') warns++; console.log(`${status.padEnd(4)} ${what}${details ? ' — ' + details : ''}`); };

/* вердикт по замеру файла: цель (если задана), шов, плоская ли, узнаёт ли её texture.mjs, вес PNG */
function judge(m, { mean = null, sd = null } = {}) {
  const probs = [], notes = [];
  if (m.pages > 1) probs.push(`кадров ${m.pages} — анимация, не плитка фактуры`);
  if (m.sd < 0.5) probs.push(`плитка плоская (σ ${m.sd})`);
  if (m.seam && m.seam.max > SEAM_FAIL) probs.push(`шов виден: ${m.seam.x} по ширине, ${m.seam.y} по высоте (порог ${SEAM_FAIL})`);
  else if (m.seam && m.seam.max > SEAM_WARN) notes.push(`шов больше ${SEAM_WARN} — посмотреть лист стыков глазами (--sheet)`);
  if (mean != null && Math.abs(m.mean - mean) > MEAN_TOL) probs.push(`яркость ${m.mean} мимо цели ${mean} (допуск ±${MEAN_TOL})`);
  if (sd != null && Math.abs(m.sd - sd) > SD_TOL * sd) probs.push(`σ ${m.sd} мимо цели ${sd} (допуск ±${Math.round(SD_TOL * 100)} %)`);
  if (!m.surfaceLike && m.sd >= 0.5) notes.push(`texture.mjs не узнает в ней крупную фактуру: ${(m.surfaceWhy || []).slice(0, 2).join('; ')}`);
  if (m.format === 'png' && m.bytes > PNG_HEAVY) notes.push(`PNG весит ${kb1(m.bytes)} — на сайт класть WebP`);
  const st = probs.length ? 'FAIL' : notes.length ? 'WARN' : 'OK';
  const seamTxt = m.seam && m.seam.max != null ? `шов ${m.seam.x} по ширине / ${m.seam.y} по высоте${m.seam.max <= SEAM_WARN ? ' — бесшовная' : ''}` : 'шов не измерен';
  const goal = mean != null || sd != null ? ` (цель ${mean ?? '—'} ± ${sd ?? '—'})` : '';
  line(st, m.file, `${m.format} ${m.width}×${m.height}, ${kb1(m.bytes)}; яркость ${m.mean} ± ${m.sd}${goal}, lag1 ${m.lag1}/${m.lag1v}, ${seamTxt}${m.surfaceLike ? '; texture.mjs: крупная фактура' : ''}${probs.length ? ' · ' + probs.join('; ') : ''}${notes.length ? ' · ' + notes.join('; ') : ''}`);
  return st;
}

/* ---------------- самопроверка ---------------- */

/* Без сети и браузера, во временной папке: детерминизм, цель, шов, узнаваемость — у всех видов; мера шва
   на заведомо бесшовных и небесшовных картинках; разбор аргументов и коды выхода. → код выхода. */
async function selftest() {
  const sharp = needSharp();
  let n = 0, bad = 0;
  const say = (ok, msg) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-selftest-'));
  const run = (args, cwd = tmp) => spawnSync(process.execPath, [SELF, ...args], { cwd, encoding: 'utf8', timeout: 240000, windowsHide: true });
  const text = (r) => `${r.stdout || ''}${r.stderr || ''}`;
  const near = (m, mean, sd) => Math.abs(m.mean - mean) <= MEAN_TOL && Math.abs(m.sd - sd) <= SD_TOL * sd;
  try {
    /* 1. три вида: тот же seed — тот же файл, другой — другой; цель; шов; узнаёт ли texture.mjs */
    const N = 512; const fields = {};
    for (const kind of Object.keys(KINDS)) {
      const F = fields[kind] = makeField({ kind, size: N, seed: 11 });
      const a = await renderTile(F, N, {}), b = await renderTile(makeField({ kind, size: N, seed: 11 }), N, {});
      say(a.data.equals(b.data), `${kind}: тот же seed — побайтно тот же файл (${kb1(a.data.length)}, попыток подгонки ${a.tries})`);
      const c = await renderTile(makeField({ kind, size: N, seed: 12 }), N, {});
      say(!a.data.equals(c.data), `${kind}: другой seed — другой рисунок`);
      const m = await measureTileFile(a.data, { name: kind });
      say(near(m, DEFAULT_MEAN, DEFAULT_SD), `${kind}: яркость ${m.mean} ± ${m.sd} при цели ${DEFAULT_MEAN} ± ${DEFAULT_SD} (после сжатия)`);
      say(m.seam.max <= SEAM_WARN, `${kind}: бесшовная после сжатия — шов ${m.seam.x} по ширине, ${m.seam.y} по высоте (порог ${SEAM_WARN})`);
      const s0 = seamOf(Float32Array.from(fieldToBytes(F, {})), N, N);
      say(s0.max <= 1.15, `${kind}: до сжатия шов ${s0.x} / ${s0.y} — край не отличить от середины`);
      say(m.surfaceLike, `${kind}: texture.mjs узнаёт крупную фактуру (lag1 ${m.lag1}/${m.lag1v}${m.surfaceLike ? '' : `; ${m.surfaceWhy.join('; ')}`})`);
    }
    /* 2. попадание в заданные яркость и σ: светлая, средняя, тёмная, почти белая */
    for (const [kind, mean, sd] of [['paper', 235, 5], ['paper', 128, 8], ['stone', 40, 3], ['stone', 252, 1.2], ['canvas', 200, 6]]) {
      const r = await renderTile(fields[kind], N, { mean, sd }); const m = await measureTileFile(r.data, { name: kind });
      say(near(m, mean, sd) && m.surfaceLike, `${kind}: цель ${mean} ± ${sd} → ${m.mean} ± ${m.sd} за ${r.tries} попыток, texture.mjs узнаёт: ${m.surfaceLike ? 'да' : 'нет'}`);
    }
    /* 3. прожилки: --veins меняет рисунок, цель держится; 0 — без прожилок */
    {
      const eq = (A, B) => { for (let i = 0; i < A.length; i += 97) if (A[i] !== B[i]) return false; return true; };
      const f0 = makeField({ kind: 'stone', size: N, seed: 11, veins: 0 }), f40 = makeField({ kind: 'stone', size: N, seed: 11, veins: 40 });
      say(!eq(f0, fields.stone) && !eq(f40, fields.stone) && !eq(f0, f40), 'stone: --veins 0, по умолчанию и --veins 40 — три разных рисунка');
      const m = await measureTileFile((await renderTile(f40, N, {})).data, { name: 'stone' });
      say(near(m, DEFAULT_MEAN, DEFAULT_SD) && m.seam.max <= SEAM_WARN, `stone --veins 40: яркость ${m.mean} ± ${m.sd}, шов ${m.seam.max} — цель и бесшовность держатся`);
      const c0 = makeField({ kind: 'canvas', size: N, seed: 11, veins: 0 });
      say(eq(c0, fields.canvas), 'canvas: --veins на рисунок не влияет (у ткани прожилок нет)');
    }
    /* 4. PNG без потерь: шов как до сжатия, цель точнее */
    {
      const r = await renderTile(fields.paper, N, { format: 'png' }); const m = await measureTileFile(r.data, { name: 'paper.png' });
      say(m.format === 'png' && m.seam.max <= 1.15 && Math.abs(m.mean - DEFAULT_MEAN) <= 0.3 && Math.abs(m.sd - DEFAULT_SD) <= 0.05 * DEFAULT_SD, `paper PNG: яркость ${m.mean} ± ${m.sd}, шов ${m.seam.max}, ${kb1(m.bytes)}`);
    }
    /* 5. мера шва на заведомых случаях */
    {
      const raw = fieldToBytes(fields.stone, {});
      const crop = await sharp(raw, { raw: { width: N, height: N, channels: 1 } }).extract({ left: 19, top: 31, width: 440, height: 440 }).raw().toBuffer();
      const sc = seamOf(Float32Array.from(crop), 440, 440);
      say(sc.max > SEAM_FAIL, `вырез 440 px из плитки (уже не бесшовный): шов ${sc.x} / ${sc.y} — больше ${SEAM_FAIL}`);
      const half = Buffer.alloc(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) half[y * N + x] = raw[((y + N / 2) % N) * N + ((x + N / 2) % N)];
      const sh = seamOf(Float32Array.from(half), N, N);
      say(sh.max <= 1.15, `плитка, сдвинутая на полплитки по обеим осям: шов ${sh.x} / ${sh.y} — бесшовная осталась бесшовной`);
      const ramp = Buffer.from(raw); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) ramp[y * N + x] = Math.max(0, Math.min(255, Math.round(raw[y * N + x] - 3 + 6 * x / N)));
      const sr = seamOf(Float32Array.from(ramp), N, N);
      say(sr.x > SEAM_FAIL && sr.y <= 1.15, `плавный уклон 6 уровней слева направо: шов по ширине ${sr.x} (виден), по высоте ${sr.y} (нет)`);
      const step = Buffer.from(raw); for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) step[y * N + x] = Math.max(0, raw[y * N + x] - 1);
      const ss = seamOf(Float32Array.from(step), N, N);
      say(ss.x > SEAM_WARN, `ступенька в 1 уровень на краю: шов по ширине ${ss.x} — больше ${SEAM_WARN}`);
      let s = 7; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      const noise = new Float32Array(256 * 256); for (let i = 0; i < noise.length; i++) noise[i] = rnd() * 255;
      const sn = seamOf(noise, 256, 256);
      say(sn.max <= 1.2, `белый шум: шов ${sn.x} / ${sn.y} — у шума края и середина одинаковы`);
      const mn = await measureTileFile(await sharp(Buffer.from(Uint8Array.from(noise, (v) => Math.round(v))), { raw: { width: 256, height: 256, channels: 1 } }).png().toBuffer(), { name: 'шум' });
      say(!mn.surfaceLike, `шум (σ ${mn.sd}, lag1 ${mn.lag1}) — не крупная фактура: ${mn.surfaceWhy[0]}`);
    }
    /* 6. запуск из командной строки: файлы, вес, коды, --check, --like, --sheet, --json */
    {
      const out = path.join(tmp, 'out');
      for (const kind of Object.keys(KINDS)) {
        const r = run(['--out', out, '--kind', kind, ...(kind === 'paper' ? ['--sheet', '--json', path.join(tmp, 'paper.json')] : [])]);
        const f = path.join(out, `surface-${kind}-1024.webp`); const ok = r.status === 0 && fs.existsSync(f);
        const kbs = ok ? fs.statSync(f).size / 1024 : 0;
        say(ok && kbs > 1 && kbs < 60 && /OK: 0 провалов/.test(text(r)), `${kind} 1024 px из командной строки: код ${r.status}, ${Math.round(kbs * 10) / 10} КБ (единицы–десятки КБ), итог OK`);
      }
      say(fs.existsSync(path.join(out, 'surface-paper-1024-sheet.jpg')) && fs.existsSync(path.join(out, 'surface-paper-1024-seam.jpg')), '--sheet: лист 2×2 и крест стыков записаны');
      const rep = readJson(path.join(tmp, 'paper.json'));
      say(!!rep && rep.params && rep.params.kind === 'paper' && rep.files && rep.files[0].seam.max <= SEAM_WARN, '--json: параметры и замер файла записаны');
      const again = path.join(tmp, 'again'); run(['--out', again, '--kind', 'paper']);
      say(fs.existsSync(path.join(again, 'surface-paper-1024.webp')) && fs.readFileSync(path.join(again, 'surface-paper-1024.webp')).equals(fs.readFileSync(path.join(out, 'surface-paper-1024.webp'))), 'два запуска из командной строки — побайтно один файл');
      const chk = run(['--check', path.join(out, 'surface-stone-1024.webp')]);
      say(chk.status === 0 && /бесшовная/.test(text(chk)) && /крупная фактура/.test(text(chk)), `--check своей плитки: код ${chk.status}, «бесшовная», texture.mjs узнаёт`);
      const miss = run(['--check', path.join(out, 'surface-stone-1024.webp'), '--mean', '200']);
      say(miss.status === 1 && /мимо цели/.test(text(miss)), `--check с чужой целью (--mean 200): код ${miss.status}, «мимо цели»`);
      const cropFile = path.join(tmp, 'crop.png');
      await sharp(path.join(out, 'surface-stone-1024.webp')).extract({ left: 37, top: 61, width: 900, height: 900 }).png().toFile(cropFile);
      const bad1 = run(['--check', cropFile]);
      say(bad1.status === 1 && /шов виден/.test(text(bad1)), `--check выреза 900 px из плитки: код ${bad1.status}, «шов виден»`);
      const like = path.join(tmp, 'texture.json'); writeJson(like, { url: 'https://donor.example/', results: [], recipe: { surface: { none: false, tileMean: 240, tileSd: 4, size: 1416, tile: { file: 'texture.webp' } } } });
      const lk = run(['--out', path.join(tmp, 'like'), '--kind', 'stone', '--size', '512', '--like', like, '--json', path.join(tmp, 'like.json')]);
      const lj = readJson(path.join(tmp, 'like.json'));
      say(lk.status === 0 && !!lj && near(lj.files[0], 240, 4), `--like: яркость и σ из замера (240 ± 4) → ${lj ? `${lj.files[0].mean} ± ${lj.files[0].sd}` : 'нет отчёта'}`);
      const lk2 = run(['--out', path.join(tmp, 'like2'), '--size', '512', '--like', like, '--mean', '220', '--json', path.join(tmp, 'like2.json')]);
      const lj2 = readJson(path.join(tmp, 'like2.json'));
      say(lk2.status === 0 && !!lj2 && near(lj2.files[0], 220, 4), `--mean главнее --like: ${lj2 ? `${lj2.files[0].mean} ± ${lj2.files[0].sd}` : 'нет отчёта'} при --mean 220 и σ 4 из замера`);
      const old = path.join(tmp, 'old.json'); writeJson(old, { url: 'https://donor.example/', results: [{ viewport: { name: 'desktop' }, grain: {} }], recipe: { none: true } });
      const lk3 = run(['--out', path.join(tmp, 'nolike'), '--like', old]);
      say(lk3.status === 1 && /крупной фактуры нет/.test(text(lk3)) && !fs.existsSync(path.join(tmp, 'nolike')), `--like с замером без крупной фактуры: код ${lk3.status}, папка не создана`);
      const far = run(['--out', path.join(tmp, 'far'), '--size', '256', '--mean', '255', '--sd', '6']);
      say(far.status === 1 && /мимо цели/.test(text(far)), `недостижимая цель (яркость 255 при σ 6): код ${far.status}, «мимо цели» — честный FAIL`);
      const cv = run(['--out', path.join(tmp, 'cv'), '--kind', 'canvas', '--size', '256', '--veins', '9']);
      say(cv.status === 0 && /WARN/.test(text(cv)) && /не действует/.test(text(cv)), `canvas с --veins: код ${cv.status}, WARN «не действует»`);
      const both = run(['--out', path.join(tmp, 'both'), '--size', '256', '--formats', 'webp,png', '--name', 'my-paper']);
      say(both.status === 0 && fs.existsSync(path.join(tmp, 'both', 'my-paper.webp')) && fs.existsSync(path.join(tmp, 'both', 'my-paper.png')), '--formats webp,png и --name: оба файла под своим именем');
    }
    /* 7. разбор аргументов: неверное — код 1 и ничего не создано */
    {
      const empty = fs.mkdtempSync(path.join(tmp, 'cwd-'));
      const none = run([], empty);
      say(none.status === 1 && fs.readdirSync(empty).length === 0 && /surface-tile\.mjs/.test(text(none)), `без аргументов: код ${none.status}, справка, в папке ничего не появилось`);
      const h = run(['-h'], empty);
      const missing = [...ARGS.values, ...ARGS.flags].filter((f) => f !== 'h' && f !== 'help' && !new RegExp(`--${f}(?![\\w-])`).test(h.stdout || ''));
      say(h.status === 0 && !missing.length && fs.readdirSync(empty).length === 0, `-h: код ${h.status}, все флаги названы${missing.length ? ` (нет: ${missing.join(', ')})` : ''}`);
      const cases = [
        [['--out', path.join(tmp, 'x1'), '--kind', 'wood'], 'x1', /--kind/, 'неизвестный --kind'],
        [['--out', path.join(tmp, 'x2'), '--formats', 'webp,jpg'], 'x2', /--formats/, 'неизвестный формат'],
        [['--out', path.join(tmp, 'x3'), '--size', '64'], 'x3', /--size/, '--size меньше 128'],
        [['--out', path.join(tmp, 'x4'), '--sd', '0'], 'x4', /--sd/, '--sd 0'],
        [['--out', path.join(tmp, 'x5'), '--mean', '300'], 'x5', /--mean/, '--mean 300'],
        [['--out', path.join(tmp, 'x6'), 'лишнее'], 'x6', /Лишний аргумент/, 'позиционный аргумент'],
        [['--out', path.join(tmp, 'x7'), '--kindd', 'paper'], 'x7', /--kind\?/, 'опечатка во флаге (--kindd)'],
        [['--out'], null, /--out/, '--out без папки'],
        [['--out', path.join(tmp, 'x8'), '--quality', '0'], 'x8', /--quality/, '--quality 0'],
      ];
      for (const [args, dir, re, what] of cases) {
        const r = run(args, empty);
        say(r.status === 1 && re.test(text(r)) && (!dir || !fs.existsSync(path.join(tmp, dir))) && fs.readdirSync(empty).length === 0, `${what}: код ${r.status}, ничего не создано`);
      }
      const nf = run(['--check', path.join(tmp, 'нет-такого.webp')]);
      say(nf.status === 1 && /Нет файла/.test(text(nf)), `--check несуществующего файла: код ${nf.status}`);
    }
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* временная папка занята — останется */ } }
  console.log(`\n${bad ? 'FAIL' : 'OK'}: проверок ${n}, провалов ${bad}`);
  return bad ? 1 : 0;
}

/* ---------------- CLI ---------------- */

if (isMain) {
  const { pos, opt } = parseArgs(process.argv.slice(2), ARGS);
  const die = (m) => { console.error(m); process.exit(1); };
  if (pos[0] === 'selftest' || opt.selftest) process.exit(await selftest());
  /* всё проверяется до первой записи: папка --out не появляется, если аргументы неверны */
  if (pos.length) die(`Лишний аргумент «${pos[0]}»: папка для плитки задаётся только --out папка, файл для проверки — --check файл (справка: --help)`);
  for (const k of ARGS.values) if (opt[k] === true) die(`--${k}: нужно значение (справка: --help)`);
  const num = (k, lo, hi, what) => { if (opt[k] === undefined) return null; const v = Number(opt[k]); if (!Number.isFinite(v) || v < lo || v > hi) die(`--${k} ${opt[k]}: ${what}`); return v; };
  let target = null;
  if (opt.like !== undefined) { try { target = targetFromJson(String(opt.like)); } catch (e) { die(`--like: ${e.message}`); } }
  const meanArg = num('mean', 0, 255, 'нужна яркость от 0 до 255'), sdArg = num('sd', 0.3, 60, 'нужен разброс от 0.3 до 60 уровней');
  const report = { files: [] };
  if (opt.check !== undefined) {
    const f = String(opt.check);
    if (!fs.existsSync(f)) die(`Нет файла ${f}`);
    const mean = meanArg ?? (target ? target.mean : null), sd = sdArg ?? (target ? target.sd : null);
    const m = await measureTileFile(f);
    if (m.seam && m.seam.max != null) console.log(`     шов: по ширине ${m.seam.x}, по высоте ${m.seam.y} (1 — край не отличить от середины; больше ${SEAM_WARN} — WARN, больше ${SEAM_FAIL} — FAIL)`);
    judge(m, { mean, sd });
    report.files.push({ ...m, path: path.resolve(f) }); report.target = { mean, sd };
  } else {
    const kind = opt.kind === undefined ? 'paper' : String(opt.kind);
    if (!KINDS[kind]) die(`Неизвестный --kind ${kind}: ${Object.keys(KINDS).join(', ')}`);
    const size = num('size', 128, 4096, 'нужна сторона плитки от 128 до 4096 px') ?? 1024;
    if (!Number.isInteger(size)) die(`--size ${opt.size}: нужно целое число пикселей`);
    const seed = opt.seed === undefined ? 11 : Number(opt.seed);
    if (!Number.isFinite(seed)) die(`--seed ${opt.seed}: нужно число`);
    const quality = num('quality', 1, 100, 'нужно качество WebP от 1 до 100') ?? 86;
    const veins = num('veins', 0, 400, 'нужно число прожилок от 0 до 400');
    const formats = [...new Set(String(opt.formats === undefined ? 'webp' : opt.formats).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
    const unknown = formats.filter((x) => !['webp', 'png'].includes(x));
    if (unknown.length || !formats.length) die(`Неизвестный формат в --formats: ${unknown.join(', ') || '(пусто)'} — есть webp и png`);
    const mean = meanArg ?? (target ? target.mean : DEFAULT_MEAN), sd = sdArg ?? (target ? target.sd : DEFAULT_SD);
    const name = opt.name === undefined ? `surface-${kind}-${size}` : String(opt.name);
    if (/[\\/]/.test(name)) die(`--name ${name}: только имя файла, без папок (папка — --out)`);
    const out = path.resolve(String(opt.out === undefined ? '.' : opt.out));
    fs.mkdirSync(out, { recursive: true });
    const nVeins = veins == null ? Math.max(1, Math.round(KINDS[kind].veins * size * size / (1024 * 1024))) : Math.round(veins);
    console.log(`плитка ${name}: ${KINDS[kind].title}, ${size}×${size}, seed ${seed}${kind === 'canvas' ? '' : `, прожилок ${nVeins}`}, цель — яркость ${mean} ± ${sd}${target && meanArg == null && sdArg == null ? ` (из замера ${path.basename(String(opt.like))}${target.tile ? `, плитка донора ${target.tile}` : ''})` : ''} → ${out}`);
    if (target && target.size && opt.size === undefined && target.size !== size) console.log(`     в замере период показа у донора ${target.size} px — чтобы повторить и его: --size ${target.size}`);
    if (kind === 'canvas' && veins != null) line('WARN', '--veins', 'у ткани прожилок нет — флаг не действует');
    const F = makeField({ kind, size, seed, veins });
    for (const fmt of formats) {
      /* качество задано явно — оно и остаётся; по умолчанию поднимается, пока шов не уйдёт под SEAM_AIM */
      const r = await renderTile(F, size, { format: fmt, mean, sd, quality, seamLimit: opt.quality === undefined ? SEAM_AIM : null });
      const f = path.join(out, `${name}.${fmt}`); fs.writeFileSync(f, r.data);
      if (r.raised) console.log(`     качество WebP поднято с ${r.raised.from} до ${r.quality}: ${r.raised.steps.map((s) => `при ${s.quality} шов ${s.seam}`).join(', ')} (сжатие кодирует края плитки независимо)`);
      const m = await measureTileFile(f);
      judge(m, { mean, sd }); report.files.push({ ...m, path: f, tries: r.tries, quality: fmt === 'webp' ? r.quality : null });
    }
    if (opt.sheet) {
      const sh = await writeSheet(report.files[0].path, path.join(out, name));
      console.log(`     для глаз (контраст ×${sh.gain}): лист 2×2 — ${path.basename(sh.sheet)}, крест стыков 1:1 — ${path.basename(sh.seam)}; на сайт их не класть`);
      report.sheet = sh;
    }
    const main = report.files.find((x) => x.format === 'webp') || report.files[0];
    console.log(`\nкак положить: templates/surface.css — --surface-tile: url(${path.basename(main.path)}); --surface-size: ${size}px; светлые и цветные поля — multiply, тёмные — color-burn`);
    report.params = { kind, size, seed, veins: kind === 'canvas' ? 0 : nVeins, mean, sd, quality, name, formats };
  }
  if (opt.json !== undefined) writeJson(String(opt.json), report);
  console.log(`\n${fails ? 'FAIL' : warns ? 'WARN' : 'OK'}: ${fails} провалов, ${warns} предупреждений`);
  if (fails) process.exit(1);
}
