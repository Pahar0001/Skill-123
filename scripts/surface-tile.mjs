#!/usr/bin/env node
/**
 * Своя плитка крупной фактуры: мятая бумага, зернистая бумага, камень с прожилками, ткань. Это не зерно
 * (мелкий шум — grain-tile.mjs), а светлая картинка-плитка с деталями крупнее пикселя:
 * грани и заломы, прожилки, переплетение нитей. Чужой файл (texture.webp донора и любой
 * другой) на сайт не переносится никогда: у донора снимаются только числа (texture.mjs —
 * яркость, σ, размер показа, наложение), а плитка рисуется здесь, детерминированно — при
 * одном и том же --seed файлы совпадают побайтно. Плитка бесшовная: шум периодический,
 * грани стоят на завёрнутой решётке, прожилки и нити заворачиваются через край, размытие
 * тоже идёт через край.
 *
 *   node surface-tile.mjs --out папка [--kind paper|pulp|stone|canvas] [--size 1024] [--seed 11]
 *                         [--name имя] [--formats webp,png] [--like texture.json]
 *                         [--mean 248] [--sd 2.5] [--veins N] [--thread N] [--dir градусы]
 *                         [--quality 86] [--sheet] [--json файл]
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
 *   --kind     по умолчанию — из замера --like, а без него paper.
 *              paper  — мятая бумага: грани с разным наклоном к свету, заломы по их границам,
 *                       тонкие ветвящиеся трещины, волокна и вкрапления;
 *              pulp   — зернистая бумага без заломов: мелкая бугристость (тёмные комки в 4–8 px),
 *                       редкие вкрапления и короткие ворсинки (крафт, картон, упаковочная и «мясная»
 *                       бумага, пергамент). Добавлен 02.10.2026: из семи бумажных фонов набора калибровки
 *                       шесть — такие, а мятый лист (paper) на них не похож. Ворсинки — --veins,
 *                       направление волокон — --dir;
 *              stone  — камень: мягкие пятна и длинные извилистые ветвящиеся прожилки, тёмные
 *                       с тенью-вмятиной и светлые; граней нет;
 *              canvas — ткань: полотняное переплетение нитей, нити разной толщины с утолщениями;
 *                       шаг переплетения — --thread (по умолчанию 32 px: нить ≈ 16 px).
 *   --size     сторона плитки, px (не меньше 128). По умолчанию — период показа из замера --like
 *              (рецепт и --css называют файл surface-<вид>-<период>.webp — имя и размер сходятся),
 *              без --like — 1024. Детали остаются того же размера в пикселях: меньше плитка —
 *              чаще виден повтор.
 *   --seed     зерно генератора (11). Тот же seed — побайтно тот же файл; другое число —
 *              другой, но тоже постоянный рисунок.
 *   --name     имя файлов без расширения (surface-<kind>-<size>).
 *   --formats  что писать, через запятую: webp, png. По умолчанию webp (с потерями, единицы–
 *              десятки КБ). png — без потерь и в разы тяжелее: на сайт его не класть.
 *   --like     texture.json замера texture.mjs: вид, яркость и σ плитки крупной фактуры донора, период
 *              показа, шаг переплетения ткани и направление волокон зернистой бумаги берутся из него
 *              (рецепт: recipe.surface — kind, tileMean, tileSd, size, thread, dir; в замере до доводки
 *              02.10.2026 шаг и направление — из признаков плитки). --kind, --mean, --sd, --size,
 *              --thread и --dir главнее. Вид в замере «не определён» (признаки слабые или дерево — своего вида нет) —
 *              берётся первый из двух кандидатов замера, WARN «выбрать глазами», оба названы.
 *              С --check: если вид проверяемой плитки не тот, что у донора, — WARN-подсказка (не FAIL).
 *   --mean     средняя яркость готовой плитки, 0…255 (248 — светлая бумага; с образца
 *              zakroma.rest снято 248.28).
 *   --sd       разброс яркости σ готовой плитки, уровней (2.5; с образца снято 2.51). Меряется
 *              по записанному файлу: сжатие сглаживает детали, поэтому усиление подгоняется
 *              повторным кодированием, пока файл не попадёт в цель.
 *   --veins    число прожилок-стволов (paper — трещины, stone — прожилки; у каждой свои ветви), у pulp —
 *              число ворсинок. По умолчанию paper 22, stone 12, pulp 240 на плитку 1024 px (меньше
 *              плитка — меньше, по площади). 0 — без прожилок и без ворсинок. Для canvas не действует (WARN).
 *              У pulp в первой версии ворсинок было 1500, длинных (до 58 px), и флаг на них не действовал:
 *              рядом с донорами своя плитка читалась «бумагой с длинными ворсинками», каких у них нет.
 *   --thread   шаг переплетения ткани, px (только canvas; 3…128, по умолчанию 32): расстояние, через
 *              которое рисунок повторяется, — то число, которое texture.mjs печатает как «шаг N px».
 *              С --like берётся из замера. У доноров шаг 3 px (acehotel.com) и 6 px (frauncestavern.com):
 *              без флага своя ткань выходила крупной корзинкой. В плитку укладывается целое число
 *              повторов — точный шаг печатается; мелкий шаг (нить уже 4 px) рисуется на плотной сетке.
 *              Для других видов не действует (WARN).
 *   --dir      направление волокон зернистой бумаги, градусов (только pulp; 0 — вдоль ширины, 90 — вдоль
 *              высоты; по умолчанию — вразброс). С --like берётся из замера, если волокна там уложены в
 *              одну сторону (направленность от 0.35). С направлением рисунок листа другой: тонкие короткие
 *              штрихи вдоль него (разброс ±10°) и длинные слабые — «линовка»; комки вдвое слабее и (до 25° от
 *              оси) слегка вытянуты. Так выглядят доноры с уложенными волокнами (dogfish.com,
 *              4rsmokehouse.com): штрихи на ровном поле, а не бугристость. Для других видов — WARN.
 *   --quality  качество WebP 1…100. По умолчанию 86, и если после сжатия шов больше 1.4, качество
 *              поднимается по 4 (до 96), пока стык не уйдёт; заданное явно — не меняется (шов тогда
 *              только проверяется). 100 — без потерь (файл в несколько раз тяжелее). У зернистой
 *              плитки (pulp) шов меряется по средним шести пикселей (см. seamOf в texture.mjs): скачок
 *              в один пиксель у неё после сжатия 1.6…2.0 при невидимом стыке и раньше поднимал
 *              качество до 90–94 — плитка 1024 px весила 54 КБ, теперь 40 КБ при качестве 86.
 *              Проверено на 149 сочетаниях размера (256…2048), зерна, направления и цели (от 30 ± 10 до
 *              248 ± 2.5): качество у pulp не поднялось ни разу. Исключение — почти белая слабая плитка
 *              (252 ± 1): разброс там в долях уровня, качество поднимается до 90–94 (1024 px — 24 КБ).
 *   --sheet    ещё два файла для глаз: <имя>-sheet.jpg — лист 2×2 с усиленным контрастом
 *              (стыки плиток — крестом посередине), <имя>-seam.jpg — тот же крест 1:1.
 *              Открыть и посмотреть: стыков быть не должно. На сайт эти файлы не класть.
 *   --json     записать итог (параметры, замеры каждого файла) в файл.
 *   --check    не генерировать, а проверить готовый файл: бесшовность по краям числом,
 *              яркость ± σ (с --mean/--sd или --like — попадание в цель), lag1, вес, вердикт
 *              разбора texture.mjs («крупная фактура — да / нет») и вид плитки (paper, pulp, stone, canvas
 *              или «не определён» — с уверенностью и основанием; с --like — сверка с видом донора).
 *
 * Бесшовность числом («шов», считает seamOf из texture.mjs): скачок яркости через край (последний
 * столбец против первого — при повторе они соседи) делится на почти самый большой из обычных
 * скачков между соседними столбцами внутри плитки (98-й процентиль: у ткани каждая шестнадцатая
 * граница — стык нитей); то же по строкам, и ещё раз по средним шести пикселей с каждой стороны
 * (ступенька, которую прячет мелкая рябь). Около 1 и меньше — край не отличить от середины; больше
 * 1.6 — WARN, больше 2.5 — FAIL «шов виден». Замерено: свои плитки до сжатия 0.5…1.0, после WebP
 * q86 до 1.4 (сжатие с потерями кодирует края независимо); вырез из плитки 5…9; плавный уклон
 * 10…20; ступенька в 1 уровень 1.9…3.5; texture.webp образца — 4.2 (у донора стык есть).
 * У плитки с повтором рисунка (ткань) к мере добавлен сбой фазы: нить у одного края не продолжается у
 * другого, хотя скачка яркости нет. Вырез из ткани с шириной, не кратной шагу нити: раньше 0.5…1.5
 * («бесшовная»), теперь 3.1…5 — FAIL; вырез с шириной, кратной шагу (нити стыкуются, но это другие
 * нити), — 1.0…1.5.
 *
 * Самопроверка после записи читает каждый файл заново: размер, вес, яркость ± σ против цели
 * (яркость ±1, σ ±15 %), lag1, шов, и спрашивает texture.mjs, узнаёт ли он плитку как крупную
 * фактуру (иначе замер своего сайта её не увидит).
 * Вес WebP при яркости 248 ± 2.5, 1024 px: stone 8 КБ, paper 15 КБ, canvas 26 КБ, pulp 40 КБ (зерно по всей
 * площади сжимается хуже; при σ 4.6 — 71 КБ, при σ 6.3 — 95–100 КБ; 512 px — 10 КБ, 2048 px — 162 КБ).
 * Вердикты: OK; WARN — шов 1.6…2.5, PNG тяжелее 150 КБ, --veins у canvas, --thread не у canvas, --dir не у pulp,
 * texture.mjs плитку не узнаёт, вид плитки не тот, что у донора (--like) или в замере не определён;
 * FAIL — шов больше 2.5, плитка плоская (σ < 0.5), мимо цели по яркости или σ.
 *
 * selftest (без сети и браузера, во временной папке): у каждого вида — тот же seed даёт тот же
 * файл, другой seed — другой рисунок, цель по яркости и σ, шов до и после сжатия, узнаёт ли
 * texture.mjs; пять целей от почти белой до тёмной и слабая плитка 252 ± 1; --veins (и ворсинки pulp);
 * шаг переплетения и направление волокон; PNG; мера шва на вырезе, уклоне, ступеньке и шуме; запуск из
 * командной строки (вес, --check, --like с размером, шагом и направлением из замера, --sheet, --json, имена);
 * неверные аргументы — код 1 и ничего не создано.
 *
 * Экспорт для других скриптов: KINDS, DEFAULT_MEAN, DEFAULT_SD, DEFAULT_THREAD, THREAD_MIN, THREAD_MAX, MEAN_TOL, SD_TOL, makeField,
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
import { analyzeTile, seamOf, SEAM_WARN, SEAM_FAIL, FIBRE_COH } from './texture.mjs';

const SELF = fileURLToPath(import.meta.url);
/* справка — до загрузки sharp: -h и запуск без аргументов ничего не создают и работают без него */
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(SELF); } catch { return false; } })();
const HELP = `surface-tile.mjs — своя бесшовная плитка крупной фактуры: мятая и зернистая бумага, камень, ткань
(детерминированно; чужой файл не переносится; мелкое зерно — grain-tile.mjs)

  node surface-tile.mjs --out папка [--kind paper|pulp|stone|canvas] [--size 1024] [--seed 11] [--name имя]
                        [--formats webp,png] [--like texture.json] [--mean 248] [--sd 2.5] [--veins N]
                        [--thread N] [--dir градусы] [--quality 86] [--sheet] [--json файл]
  node surface-tile.mjs --check файл.webp|png|jpg [--mean M] [--sd S] [--like texture.json] [--json файл]
  node surface-tile.mjs selftest      самопроверка (то же: --selftest)
  node surface-tile.mjs --help | -h
  node surface-tile.mjs               без аргументов — эта справка и код 1, ничего не записано

  --out        папка для файлов (по умолчанию текущая — если задан хоть один другой флаг)
  --kind       по умолчанию — вид из замера --like, без него paper;
               paper — мятая бумага: грани, заломы, трещины, волокна;
               pulp — зернистая бумага без заломов: мелкая бугристость, вкрапления, короткие ворсинки (крафт, картон);
               stone — камень: мягкие пятна и длинные ветвящиеся прожилки, без граней;
               canvas — ткань: переплетение нитей, шаг — --thread
  --size       сторона плитки, px (не меньше 128); по умолчанию — период показа из замера --like, без него 1024
  --seed       зерно генератора (11): тот же seed — побайтно тот же файл
  --name       имя файлов без расширения (surface-<kind>-<size>)
  --formats    что писать: webp, png (по умолчанию webp; png без потерь и в разы тяжелее)
  --like       texture.json замера texture.mjs: вид, яркость и σ плитки донора, период показа, шаг переплетения
               ткани и направление волокон — из него; вид в замере не определён — первый из двух кандидатов
               и WARN «выбрать глазами»
  --mean       средняя яркость плитки 0…255 (248); главнее --like
  --sd         разброс яркости σ, уровней (2.5); меряется по записанному файлу; главнее --like
  --veins      число прожилок-стволов: paper 22, stone 12 на 1024 px; у pulp — число ворсинок (240); 0 — без них;
               canvas — не действует
  --thread     шаг переплетения ткани, px (canvas; 3…128, по умолчанию 32 — нить ≈ 16 px): то число, которое
               texture.mjs печатает как «шаг N px»; с --like — из замера
  --dir        направление волокон зернистой бумаги, градусов (pulp; 0 — вдоль ширины, 90 — вдоль высоты;
               по умолчанию — вразброс); с --like — из замера. С направлением рисунок — тонкие штрихи вдоль него
               на ровном поле, а не бугристость
  --quality    качество WebP 1…100 (86, само поднимается до 96, пока шов больше 1.4; заданное явно не меняется);
               100 — без потерь. У pulp шов меряется по средним шести пикселей — качество остаётся 86 (кроме почти
               белой слабой цели вроде 252 ± 1 и части тёмных направленных вроде 127 ± 3.3 с --dir: на пороге
               зернистости качество поднимается, 64–66 КБ вместо 48–51 — 2 пробы из 7, 02.10). Вес 1024 px при 248 ± 2.5: stone 8, paper 15, canvas 26, pulp 40 КБ
               (pulp при σ 4.6 — 71 КБ, при σ 6.3 — 95–100 КБ; 512 px — 10 КБ, 2048 px — 162 КБ)
  --sheet      лист 2×2 с усиленным контрастом (<имя>-sheet.jpg) и крест стыков 1:1 (<имя>-seam.jpg) — для глаз
  --json       записать итог в файл
  --check      проверить готовый файл: шов по краям числом, яркость ± σ, lag1, вес, узнаёт ли его texture.mjs,
               вид плитки; с --like — тот ли это вид, что у донора (другой — WARN-подсказка, не FAIL)
  --selftest   самопроверка: детерминизм, бесшовность, попадание в яркость и σ, все виды, шаг переплетения и
               направление волокон, вес, --check и --like, разбор аргументов

Шов: скачок яркости через край, делённый на почти самый большой из обычных скачков между соседними
столбцами (строками) внутри плитки, и то же по средним шести пикселей. Около 1 и меньше — край не отличить
от середины; больше 1.6 — WARN, больше 2.5 — FAIL «шов виден».

Папка --out создаётся только после проверки аргументов. Код 1 и ничего не создано: неизвестный --kind,
неизвестное имя в --formats, позиционный аргумент (кроме selftest), --out без папки, --like без крупной фактуры.

Как положить плитку — templates/surface.css; как снять числа с донора — texture.mjs <донор> (крупная фактура).

Вердикты: OK; WARN — шов 1.6…2.5, тяжёлый PNG, --veins у canvas, --thread не у canvas, --dir не у pulp, texture.mjs плитку
не узнаёт, вид не тот, что у донора (--like), или в замере не определён;
FAIL — шов больше 2.5, плитка плоская, мимо цели по яркости (±1) или σ (±15 %).
Коды выхода: 0 — готово (при любых WARN); 1 — FAIL, неверные аргументы или запуск без аргументов.`;
/* флаги — одним списком: и для разбора, и для справочника flags-doc.mjs (он спрашивает до справки и выхода без аргументов) */
const ARGS = { flags: ['help', 'h', 'sheet', 'selftest'], values: ['out', 'kind', 'size', 'seed', 'name', 'formats', 'like', 'mean', 'sd', 'veins', 'thread', 'dir', 'quality', 'json', 'check'], commands: ['selftest'], strict: true };
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
  pulp: { title: 'зернистая бумага', veins: 240 },
  stone: { title: 'камень с прожилками', veins: 12 },
  canvas: { title: 'ткань, переплетение нитей', veins: 0 },
};
/** Шаг переплетения ткани по умолчанию, px: через столько рисунок повторяется (две нити по 16 px). */
export const DEFAULT_THREAD = 32;
/** Пределы шага переплетения: меньше 3 px рисунок не нарисовать, больше 128 px — это уже не ткань. */
export const THREAD_MIN = 3, THREAD_MAX = 128;
/** Шаг переплетения, мельче которого ткань пишется с качеством WebP не ниже 92. */
export const FINE_THREAD = 16;
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

/* Тот же шум с разной ячейкой по осям: детали вытянуты вдоль оси, где ячейка больше (волокна вдоль ширины или высоты).
   Решётка Px×Py, периоды целые — плитка бесшовная. */
function cloudXY(N, rnd, { cellX = 16, cellY = 16, octaves = 2, gain = 0.5 } = {}) {
  const out = new Float32Array(N * N); let Px = Math.max(2, Math.round(N / cellX)), Py = Math.max(2, Math.round(N / cellY)), amp = 1;
  const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let o = 0; o < octaves && Px <= N / 2 && Py <= N / 2; o++, Px *= 2, Py *= 2) {
    const gx = new Float32Array(Px * Py), gy = new Float32Array(Px * Py);
    for (let i = 0; i < Px * Py; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const kx = Px / N, ky = Py / N;
    for (let y = 0; y < N; y++) {
      const fy = y * ky, yf = Math.floor(fy), ty = fy - yf, y0 = wrap(yf, Py) * Px, y1 = ((wrap(yf, Py) + 1) % Py) * Px, v = ease(ty);
      for (let x = 0; x < N; x++) {
        const fx = x * kx, xf = Math.floor(fx), tx = fx - xf, x0 = wrap(xf, Px), x1 = (x0 + 1) % Px, u = ease(tx);
        const a = gx[y0 + x0] * tx + gy[y0 + x0] * ty, b = gx[y0 + x1] * (tx - 1) + gy[y0 + x1] * ty, c = gx[y1 + x0] * tx + gy[y1 + x0] * (ty - 1), d = gx[y1 + x1] * (tx - 1) + gy[y1 + x1] * (ty - 1);
        out[y * N + x] += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
      }
    }
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

/* Зернистая бумага — лист лежит ровно: ни граней, ни заломов. Рисунок — сама бумажная масса: пятнистость в
   несколько пикселей (комки волокон), слабые пятна покрупнее, тёмные вкрапления и ворсинки. Образцы — фоны набора
   калибровки 02.10.2026: tabasco.com (кремовая, ровная мелкая бугристость, ворсинок нет), dogfish.com (короткая
   штриховка вдоль ширины), 4rsmokehouse.com (мясная бумага: линии вдоль ширины и мягкие пятна): доля разброса мельче
   5 px у них 0.2…0.4 — у мятого листа и камня она до 0.06, поэтому на таких доноров они не похожи.
   fibres — число ворсинок на плитку (0 — без них). В первой версии их было 1500 на 1024 px, длиной до 58 px, тёмных
   и светлых — на всех трёх парах с донорами своя плитка читалась «бумагой с длинными ворсинками вразброс», каких нет
   ни у одного донора. Теперь по умолчанию 240, короткие (4…22 px) и слабее; основной рисунок — комки и вкрапления.
   dir — направление волокон, градусов (0 — вдоль ширины, 90 — вдоль высоты; null — вразброс): ворсинки ложатся
   вдоль него с разбросом ±20°, а рисунок листа меняется: комки и рябь вдвое слабее, поверх — штриховка (5200 коротких
   тонких штрихов на 1024 px с разбросом ±10° и 420 длинных слабых — «линовка»). У доноров с уложенными волокнами
   (dogfish.com, 4rsmokehouse.com) рисунок — штрихи на ровном поле (эксцесс остатка 25…40), а первая версия направленной
   плитки давала вытянутые комки (эксцесс 2…2.6): на парах она читалась «рябью», а не волосками. Теперь эксцесс 5.6…6.4,
   направленность 0.33…0.42 (у доноров 0.39 и 0.43; порог «дерево» — 0.5). */
function pulpField(N, rnd, fibres, dir = null) {
  const area = (N * N) / (1024 * 1024);
  /* волокна вдоль ширины или высоты (до 25° от оси): сами комки слегка вытянуты вдоль этой оси (1.3 : 1); под другим
     углом вытянуть шум без шва нельзя — направление несут только штрихи и ворсинки */
  const flat = dir != null && (dir <= 25 || dir >= 155), tall = dir != null && Math.abs(dir - 90) <= 25;
  const grain = (cell, o) => (flat ? cloudXY(N, rnd, { cellX: cell * 1.3, cellY: cell * 1, ...o }) : tall ? cloudXY(N, rnd, { cellX: cell * 1, cellY: cell * 1.3, ...o }) : cloud(N, rnd, { cell, ...o }));
  const lump = grain(5, { octaves: 2, gain: 0.7 }), blot = cloud(N, rnd, { cell: 72, octaves: 2 }), tone = cloud(N, rnd, { cell: 320, octaves: 2 });
  /* комки потемнее листа: где шум с ячейкой 8 px выше порога — тёмное пятнышко в 4–8 px. От них «бугристость» и тёмная
     асимметрия, как у доноров (tabasco.com −1.55), и без ворсинок; крупные мягкие пятна рядом с ними — десятая часть разброса (у tabasco 0.13) */
  const clump = grain(8, { octaves: 2, gain: 0.6 });
  const F = new Float32Array(N * N);
  /* у бумаги с уложенными волокнами (dogfish.com, 4rsmokehouse.com) рисунок — тонкие штрихи на ровном поле (эксцесс остатка
     25…40), а не комки: комки и рябь при заданном направлении вдвое слабее, рисунок несут штрихи (ниже) */
  const kLump = dir == null ? 1.5 : 0.8, kClump = dir == null ? 5 : 2;
  for (let i = 0; i < N * N; i++) F[i] = lump[i] * kLump - Math.max(0, clump[i] - 0.12) * kClump + blot[i] * 0.75 + tone[i] * 0.55 + (rnd() - 0.5) * 1.5;
  const dark = new Float32Array(N * N), light = new Float32Array(N * N);
  const along = dir == null ? null : dir * Math.PI / 180;
  const angle = () => (along == null ? rnd() * Math.PI * 2 : along + (rnd() - 0.5) * 0.7 + (rnd() < 0.5 ? Math.PI : 0));
  const fibre = { wobble: 0.07, kink: 0.012, curl: 0.012, branch: 0, depth: 0, width: 1 };
  for (const [px, py] of scatter(fibres, rnd)) vein(rnd() < 0.8 ? dark : light, N, rnd, px * N, py * N, angle(), 4 + rnd() * rnd() * 18, 1.3 + rnd() * 1.7, fibre);
  /* вкрапления: тёмные точки в 2–5 px — их число от ворсинок не зависит */
  for (const [px, py] of scatter(Math.round(170 * area), rnd)) vein(dark, N, rnd, px * N, py * N, rnd() * Math.PI * 2, 2 + rnd() * 3, 4 + rnd() * 7, fibre);
  if (along != null) {
    /* штриховка: почти прямые тонкие штрихи вдоль направления — короткие (волоски dogfish.com: 5–20 px) и длинные
       слабые («линовка» мясной бумаги 4rsmokehouse.com). Их число от --veins не зависит: это сам рисунок листа */
    const rule = { wobble: 0.012, kink: 0, curl: 0.002, branch: 0, depth: 0, width: 1 };
    const turn = (spread) => along + (rnd() - 0.5) * spread + (rnd() < 0.5 ? Math.PI : 0);
    /* разброс угла у коротких штрихов ±20°: направленность выходит как у доноров (0.39…0.43), с запасом до порога «дерево» (0.5) */
    for (const [px, py] of scatter(Math.round(5200 * area), rnd)) vein(rnd() < 0.85 ? dark : light, N, rnd, px * N, py * N, turn(0.35), 5 + rnd() * rnd() * 22, 2.2 + rnd() * 2.6, rule);
    for (const [px, py] of scatter(Math.round(420 * area), rnd)) vein(rnd() < 0.7 ? dark : light, N, rnd, px * N, py * N, turn(0.16), 40 + rnd() * 130, 1.0 + rnd() * 1.1, rule);
  }
  for (let i = 0; i < N * N; i++) F[i] += light[i] * 0.7 - dark[i];
  return soften(F, N, 0.14);
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
function canvasField(N, rnd, thread = DEFAULT_THREAD) {
  /* thread — шаг переплетения, px: через столько рисунок повторяется (две нити). Мелкий шаг (нить уже 6 px) рисуется
     на сетке в S раз плотнее и усредняется — иначе профиль нити попадает на 1–2 отсчёта и выходит рябь, а не ткань */
  const M = Math.max(4, 2 * Math.round(N / thread));      /* нитей по оси; при шаге 32 px нить ≈ 16 px */
  /* S чётное: при целой нити (3, 4, 5 px) граница нитей ложится между отсчётами плотной сетки, а не на отсчёт */
  const S = N / M >= 6 ? 1 : N / M >= 3 ? 2 : 4;
  if (S > 1) return canvasFine(N, rnd, M, S);
  /* свой шаг: отсчёт по центру пикселя — граница нитей не попадает на столбец, и при почти целой нити (5.95 px) столбцы
     через край плитки не меняют нить. При шаге по умолчанию отсчёт прежний: плитка побайтно та же, что раньше */
  const half = thread === DEFAULT_THREAD ? 0 : 0.5;
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
    const u = (x + half) * k + 0.5, v = (y + half) * k + 0.5, iu = Math.floor(u), jv = Math.floor(v), fu = u - iu, fv = v - jv;
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

/* Ткань с мелким шагом: то же переплетение на сетке в S раз плотнее, усреднённое до N×N. Нити без утолщений по длине
   (на нити в 1.5–3 px их не видно); общий тон и шероховатость добавляются уже на итоговой сетке. */
function canvasFine(N, rnd, M, S) {
  const mk = () => { const w = new Float32Array(M); for (let i = 0; i < M; i++) w[i] = 1 + (rnd() - 0.5) * 0.34 + (rnd() < 0.08 ? (rnd() - 0.5) * 0.7 : 0); return w; };
  const warp = mk(), weft = mk(); const tone = cloud(N, rnd, { cell: 300, octaves: 3 });
  const F = new Float32Array(N * N); const H = N * S, k = M / H;
  /* номер нити и место поперёк неё зависят только от одной координаты — считаются раз на строку и столбец плотной сетки */
  const id = new Int32Array(H), fr = new Float32Array(H);
  /* отсчёт — по центру ячейки плотной сетки: при целом шаге отсчёты не попадают на границу нитей, и при почти целом
     (в плитку укладывается целое число нитей, шаг выходит 6.02 px) столбцы через край плитки не меняют нить */
  for (let t = 0; t < H; t++) { const u = (t + 0.5) * k + 0.5, iu = Math.floor(u); id[t] = iu % M; fr[t] = u - iu; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let acc = 0;
    for (let sy = 0; sy < S; sy++) { const j = id[y * S + sy], fv = fr[y * S + sy]; for (let sx = 0; sx < S; sx++) {
      const i = id[x * S + sx], fu = fr[x * S + sx]; const over = ((i + j) & 1) === 0; const across = over ? fu : fv, along = over ? fv : fu; const fat = over ? warp[i] : weft[j];
      /* продольная нить чуть светлее поперечной (как у двухцветной ткани): иначе у мелкой ткани клетки «нить сверху» и
         «нить снизу» после усреднения почти одинаковы, и рисунок повторяется через одну нить, а не через две — вдвое мельче заданного шага */
      acc += Math.pow(Math.sin(Math.PI * across), 0.8 / Math.max(0.5, fat)) * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(Math.PI * along))) * 6 * (0.8 + 0.2 * fat) * (over ? 1 : 0.7);
    } }
    /* общий тон — едва: мелкая ткань ровная, а пятна на маленькой плитке повторялись бы на виду (пара с acehotel.com) */
    F[y * N + x] = acc / (S * S) + tone[y * N + x] * 0.22 + (rnd() - 0.5) * 0.5;
  }
  return F;
}

/**
 * Рисунок плитки: поле N×N в условных единицах (ещё без яркости и σ). Детерминированно по seed.
 * { kind: 'paper'|'pulp'|'stone'|'canvas', size, seed, veins — число прожилок-стволов у paper и stone, ворсинок у pulp
 *   (null — по умолчанию, по площади; 0 — без них), thread — шаг переплетения ткани, px (canvas; null — 32),
 *   dir — направление волокон зернистой бумаги, градусов (pulp; null — вразброс) }.
 */
export function makeField({ kind = 'paper', size = 1024, seed = 11, veins = null, thread = null, dir = null } = {}) {
  if (!KINDS[kind]) throw new Error(`неизвестный вид ${kind}: ${Object.keys(KINDS).join(', ')}`);
  const N = size; const rnd = rng(seed);
  /* у paper и stone прожилок не меньше одной; у pulp ворсинок может не быть вовсе */
  const n = veins == null ? Math.max(kind === 'pulp' ? 0 : 1, Math.round(KINDS[kind].veins * (N * N) / (1024 * 1024))) : Math.max(0, Math.round(veins));
  const step = thread == null ? DEFAULT_THREAD : Math.max(THREAD_MIN, Math.min(THREAD_MAX, Number(thread)));
  return kind === 'stone' ? stoneField(N, rnd, n) : kind === 'canvas' ? canvasField(N, rnd, step) : kind === 'pulp' ? pulpField(N, rnd, n, dir == null ? null : Number(dir)) : paperField(N, rnd, n);
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
 *   surfaceLike — узнаёт ли texture.mjs в ней крупную фактуру, surfaceWhy[] — чем не подошла,
 *   kind — вид плитки по разбору texture.mjs: { kind, conf, word, basis, alt } или null }.
 */
export async function measureTileFile(input, { name = null } = {}) {
  const t = await analyzeTile(input, { name, seam: true }); const f = t.frames[0];
  return {
    file: t.file, format: t.format, bytes: t.bytes, width: t.width, height: t.height, pages: t.pages,
    mean: f.mean, sd: f.sd, lag1: f.lag1, lag1v: f.lag1v, alpha: f.alphaMean, chroma: f.chroma,
    seam: t.seam ? { x: t.seam.x, y: t.seam.y, max: t.seam.max, phase: t.seam.detail && t.seam.detail.phase ? t.seam.detail.phase : null } : null, surfaceLike: t.surfaceLike, surfaceWhy: t.surfaceWhy,
    kind: t.kind || null,
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
 * fullSeam: true — шов для подбора качества полной мерой seamOf (зернистая плитка pulp и ткань с мелким шагом).
 * → { data: Buffer, mean, sd, tries, history, quality — с каким качеством записано, seam, raised — { from, steps[] } или null }.
 */
export async function renderTile(F, N, { format = 'webp', mean = DEFAULT_MEAN, sd = DEFAULT_SD, quality = 86, seamLimit = null, fullSeam = false } = {}) {
  const sharp = needSharp(); const steps = [];
  for (let q = quality; ; q = Math.min(96, q + 4)) {
    const res = await fitTile(F, N, { format, mean, sd, quality: q });
    if (seamLimit == null || format !== 'webp' || q >= 100) return { ...res, quality: q, seam: null, raised: null };
    const raw = await sharp(res.data).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    /* подбор качества — по скачку яркости на краю (как раньше): сбой фазы у своей плитки от сжатия не зависит, а его
       мера на сжатом файле шумит (ткань q86 — до 1.4) и зря поднимала бы качество и вес файла */
    /* fullSeam — шов полной мерой seamOf: у зернистой плитки (pulp) она смотрит только на ступеньку по средним шести
       пикселей (мера по одному пикселю у неё после сжатия 1.6…2.0 при невидимом стыке и поднимала качество до 90–94 —
       плитка 1024 px весила 54 КБ вместо 40); у ткани с мелким шагом в неё входит сбой фазы на краю */
    const seam = seamOf(lumaFromRaw(raw.data, N * N, raw.info.channels), N, N, 6, fullSeam ? null : false).max;
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
 * → { mean, sd, size — период показа у донора, px (или null), tile — имя файла донора,
 *     kind — вид плитки донора из замера: { kind, conf, word, basis, alt, guess } или null (замер до 02.10.2026),
 *     thread — шаг переплетения у ткани донора, px (или null), dir — направление волокон, градусов (или null — вразброс) }.
 */
export function targetFromJson(file) {
  if (!fs.existsSync(file)) throw new Error(`нет файла ${file}`);
  const j = readJson(file); if (!j) throw new Error(`${file} не читается как JSON`);
  const S = j.recipe && j.recipe.surface && !j.recipe.surface.none ? j.recipe.surface : null;
  const list = Array.isArray(j) ? j : j.results || [j];
  const r = list.find((x) => x && x.surface && x.surface.tile);
  /* шаг переплетения и направление волокон: из рецепта, а в замере до доводки 02.10.2026 (полей в рецепте нет) — из
     признаков плитки: повтор рисунка по осям и направленность штрихов */
  const F = r && r.surface.tile.feat ? r.surface.tile.feat : null;
  const per = F && F.per && F.per.x && F.per.y && F.per.x.lag >= 2 && F.per.y.lag >= 2 ? Math.round((F.per.x.lag + F.per.y.lag) / 2) : null;
  const extra = (K) => ({ thread: S && S.thread != null ? S.thread : K && K.kind === 'canvas' ? per : null, dir: S && S.dir !== undefined ? S.dir : F && F.coh >= FIBRE_COH && F.dir != null ? F.dir : null });
  if (S && S.tileMean != null && S.tileSd != null) return { mean: S.tileMean, sd: S.tileSd, size: S.size || null, tile: S.tile ? S.tile.file : null, kind: S.kind || null, ...extra(S.kind) };
  if (r) return { mean: r.surface.tile.mean, sd: r.surface.tile.sd, size: null, tile: r.surface.tile.file, kind: r.surface.tile.kind || null, ...extra(r.surface.tile.kind) };
  throw new Error(`в ${file} крупной фактуры нет — задайте --mean и --sd или перемерьте донора: texture.mjs <донор>`);
}

/* ---------------- вывод ---------------- */
let fails = 0, warns = 0;
const line = (status, what, details) => { if (status === 'FAIL') fails++; if (status === 'WARN') warns++; console.log(`${status.padEnd(4)} ${what}${details ? ' — ' + details : ''}`); };

const KIND_RU = { paper: 'мятая бумага', pulp: 'зернистая бумага', stone: 'камень', canvas: 'ткань' };
/* вердикт по замеру файла: цель (если задана), шов, плоская ли, узнаёт ли её texture.mjs, вес PNG, вид против вида
   донора (donorKind — вид из замера --like; другой вид — подсказка, не провал: вид определяется с допуском) */
function judge(m, { mean = null, sd = null, donorKind = null } = {}) {
  const probs = [], notes = [];
  if (m.pages > 1) probs.push(`кадров ${m.pages} — анимация, не плитка фактуры`);
  if (m.sd < 0.5) probs.push(`плитка плоская (σ ${m.sd})`);
  const ph = m.seam && m.seam.phase ? [m.seam.phase.x, m.seam.phase.y].filter((p) => p && p.seam > SEAM_FAIL) : [];
  if (m.seam && m.seam.max > SEAM_FAIL) probs.push(`шов виден: ${m.seam.x} по ширине, ${m.seam.y} по высоте (порог ${SEAM_FAIL})${ph.length ? ` — рисунок сбит по фазе: шаг ${ph[0].lag} px, связь через край ${ph[0].edge} при ${ph[0].inner} внутри плитки` : ''}`);
  else if (m.seam && m.seam.max > SEAM_WARN) notes.push(`шов больше ${SEAM_WARN} — посмотреть лист стыков глазами (--sheet)`);
  if (mean != null && Math.abs(m.mean - mean) > MEAN_TOL) probs.push(`яркость ${m.mean} мимо цели ${mean} (допуск ±${MEAN_TOL})`);
  if (sd != null && Math.abs(m.sd - sd) > SD_TOL * sd) probs.push(`σ ${m.sd} мимо цели ${sd} (допуск ±${Math.round(SD_TOL * 100)} %)`);
  if (!m.surfaceLike && m.sd >= 0.5) notes.push(`texture.mjs не узнает в ней крупную фактуру: ${(m.surfaceWhy || []).slice(0, 2).join('; ')}`);
  const mk = m.kind;
  if (donorKind && donorKind.kind && mk && mk.kind && mk.kind !== donorKind.kind) notes.push(`вид другой: эта плитка — ${KIND_RU[mk.kind]} (${mk.kind}, уверенность ${mk.conf}), у донора — ${KIND_RU[donorKind.kind]} (${donorKind.kind}, уверенность ${donorKind.conf}); подсказка, не провал — сверить глазами вырезки 1:1`);
  else if (donorKind && donorKind.kind && mk && !mk.kind) notes.push(`вид этой плитки не определён (${mk.basis}), у донора — ${KIND_RU[donorKind.kind]} (${donorKind.kind}) — сверить глазами вырезки 1:1`);
  if (m.format === 'png' && m.bytes > PNG_HEAVY) notes.push(`PNG весит ${kb1(m.bytes)} — на сайт класть WebP`);
  const st = probs.length ? 'FAIL' : notes.length ? 'WARN' : 'OK';
  const seamTxt = m.seam && m.seam.max != null ? `шов ${m.seam.x} по ширине / ${m.seam.y} по высоте${m.seam.max <= SEAM_WARN ? ' — бесшовная' : ''}` : 'шов не измерен';
  const goal = mean != null || sd != null ? ` (цель ${mean ?? '—'} ± ${sd ?? '—'})` : '';
  line(st, m.file, `${m.format} ${m.width}×${m.height}, ${kb1(m.bytes)}; яркость ${m.mean} ± ${m.sd}${goal}, lag1 ${m.lag1}/${m.lag1v}, ${seamTxt}${m.surfaceLike ? `; texture.mjs: крупная фактура${mk ? `, вид ${mk.kind || 'не определён'} (${mk.conf})` : ''}` : ''}${probs.length ? ' · ' + probs.join('; ') : ''}${notes.length ? ' · ' + notes.join('; ') : ''}`);
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
      const a = await renderTile(F, N, { fullSeam: kind === 'pulp' }), b = await renderTile(makeField({ kind, size: N, seed: 11 }), N, { fullSeam: kind === 'pulp' });
      say(a.data.equals(b.data), `${kind}: тот же seed — побайтно тот же файл (${kb1(a.data.length)}, попыток подгонки ${a.tries})`);
      const c = await renderTile(makeField({ kind, size: N, seed: 12 }), N, { fullSeam: kind === 'pulp' });
      say(!a.data.equals(c.data), `${kind}: другой seed — другой рисунок`);
      const m = await measureTileFile(a.data, { name: kind });
      say(near(m, DEFAULT_MEAN, DEFAULT_SD), `${kind}: яркость ${m.mean} ± ${m.sd} при цели ${DEFAULT_MEAN} ± ${DEFAULT_SD} (после сжатия)`);
      say(m.seam.max <= SEAM_WARN, `${kind}: бесшовная после сжатия — шов ${m.seam.x} по ширине, ${m.seam.y} по высоте (порог ${SEAM_WARN})`);
      const s0 = seamOf(Float32Array.from(fieldToBytes(F, {})), N, N);
      say(s0.max <= 1.15, `${kind}: до сжатия шов ${s0.x} / ${s0.y} — край не отличить от середины`);
      say(m.surfaceLike, `${kind}: texture.mjs узнаёт крупную фактуру (lag1 ${m.lag1}/${m.lag1v}${m.surfaceLike ? '' : `; ${m.surfaceWhy.join('; ')}`})`);
      say(!!m.kind && m.kind.kind === kind, `${kind}: texture.mjs называет вид верно — ${m.kind ? `${m.kind.kind || 'не определён'} (уверенность ${m.kind.conf}, ${m.kind.word})` : 'вида нет'}`);
    }
    /* 2. попадание в заданные яркость и σ: светлая, средняя, тёмная, почти белая */
    /* 252 ± 1 — слабая плитка на почти белом: почти все пиксели на двух соседних уровнях, и правило «рисунок в два тона»
       её отсекало (находка проверки 02.10.2026) */
    for (const [kind, mean, sd] of [['paper', 235, 5], ['paper', 128, 8], ['stone', 40, 3], ['stone', 252, 1.2], ['canvas', 200, 6], ['paper', 252, 1], ['stone', 252, 1], ['pulp', 252, 1]]) {
      const r = await renderTile(fields[kind], N, { mean, sd, fullSeam: kind === 'pulp' }); const m = await measureTileFile(r.data, { name: kind });
      /* при σ 1 разброс после сжатия ловится грубее (своя бумага 512 px: 1.18 при цели 1) — здесь важно, что плитку узнают */
      const hit = sd > 1 ? near(m, mean, sd) : Math.abs(m.mean - mean) <= MEAN_TOL && Math.abs(m.sd - sd) <= 0.3 * sd;
      say(hit && m.surfaceLike, `${kind}: цель ${mean} ± ${sd} → ${m.mean} ± ${m.sd} за ${r.tries} попыток, texture.mjs узнаёт: ${m.surfaceLike ? 'да' : `нет — ${(m.surfaceWhy || []).join('; ').slice(0, 90)}`}`);
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
      /* зернистая бумага: ворсинки управляются --veins (в первой версии флаг на них не действовал), 0 — без них */
      const p0 = makeField({ kind: 'pulp', size: N, seed: 11, veins: 0 }), p9 = makeField({ kind: 'pulp', size: N, seed: 11, veins: 900 });
      say(!eq(p0, fields.pulp) && !eq(p9, fields.pulp) && !eq(p0, p9), 'pulp: --veins 0, по умолчанию и --veins 900 — три разных рисунка (ворсинки управляются)');
      const mp = await measureTileFile((await renderTile(p0, N, { fullSeam: true })).data, { name: 'pulp' });
      say(near(mp, DEFAULT_MEAN, DEFAULT_SD) && mp.surfaceLike && !!mp.kind && mp.kind.kind === 'pulp', `pulp --veins 0 (без ворсинок): яркость ${mp.mean} ± ${mp.sd}, texture.mjs узнаёт зернистую бумагу — ${mp.kind ? `${mp.kind.kind || 'не определён'} (${mp.kind.conf})` : mp.surfaceWhy.join('; ')}`);
    }
    /* 3а. шаг переплетения ткани и направление волокон зернистой бумаги */
    {
      const eq = (A, B) => { for (let i = 0; i < A.length; i += 97) if (A[i] !== B[i]) return false; return true; };
      for (const step of [8, 12]) {
        /* мелкий шаг пишется с качеством 92 и полной мерой шва — как из командной строки */
        const t = await analyzeTile((await renderTile(makeField({ kind: 'canvas', size: N, seed: 11, thread: step }), N, { quality: 92, seamLimit: SEAM_AIM, fullSeam: true })).data, { name: 'canvas', seam: true }); const P = t.frames[0].feat.per;
        say(t.surfaceLike && !!t.kind && t.kind.kind === 'canvas' && Math.abs(P.x.lag - step) <= 1 && Math.abs(P.y.lag - step) <= 1 && t.seam.max <= SEAM_WARN, `canvas --thread ${step}: texture.mjs видит ткань с шагом ${P.x.lag} px по ширине и ${P.y.lag} px по высоте, шов ${t.seam.max}${t.surfaceLike ? '' : ` — ${t.surfaceWhy.join('; ')}`}`);
      }
      const t3 = await analyzeTile((await renderTile(makeField({ kind: 'canvas', size: 256, seed: 11, thread: 3 }), 256, { mean: 43, sd: 4.4, quality: 92, seamLimit: SEAM_AIM, fullSeam: true })).data, { name: 'canvas 3', seam: true }); const P3 = t3.frames[0].feat.per;
      say(t3.surfaceLike && !!t3.kind && t3.kind.kind === 'canvas' && P3.x.lag === 3 && P3.y.lag === 3, `canvas --thread 3 (как у acehotel.com: 42.8 ± 4.4): texture.mjs видит ткань с шагом ${P3.x.lag} и ${P3.y.lag} px — ${t3.kind ? `${t3.kind.kind || 'не определён'} (${t3.kind.conf})` : t3.surfaceWhy.join('; ')}`);
      say(eq(makeField({ kind: 'canvas', size: N, seed: 11, thread: 32 }), fields.canvas), 'canvas --thread 32 — тот же рисунок, что по умолчанию');
      const td = await analyzeTile((await renderTile(makeField({ kind: 'pulp', size: N, seed: 11, dir: 0 }), N, { fullSeam: true })).data, { name: 'pulp dir 0' }), tv = await analyzeTile((await renderTile(makeField({ kind: 'pulp', size: N, seed: 11, dir: 90 }), N, { fullSeam: true })).data, { name: 'pulp dir 90' });
      const Fd = td.frames[0].feat, Fv = tv.frames[0].feat;
      say(!!td.kind && td.kind.kind === 'pulp' && Fd.coh >= 0.25 && Fd.coh < 0.5 && (Fd.dir <= 15 || Fd.dir >= 165) && !!tv.kind && tv.kind.kind === 'pulp' && Math.abs(Fv.dir - 90) <= 15, `pulp --dir 0 и --dir 90: волокна уложены вдоль ширины (направленность ${Fd.coh}, ${Fd.dir}°) и вдоль высоты (${Fv.coh}, ${Fv.dir}°), вид остаётся pulp — не «дерево»`);
    }
    /* 4. PNG без потерь: шов как до сжатия, цель точнее */
    {
      const r = await renderTile(fields.paper, N, { format: 'png' }); const m = await measureTileFile(r.data, { name: 'paper.png' });
      say(m.format === 'png' && m.seam.max <= 1.15 && Math.abs(m.mean - DEFAULT_MEAN) <= 0.3 && Math.abs(m.sd - DEFAULT_SD) <= 0.05 * DEFAULT_SD, `paper PNG: яркость ${m.mean} ± ${m.sd}, шов ${m.seam.max}, ${kb1(m.bytes)}`);
    }
    /* 5. мера шва на заведомых случаях */
    {
      const raw = fieldToBytes(fields.stone, {});
      /* вырез — из массива напрямую: sharp отдаёт серую картинку тремя каналами, и раньше они читались здесь как
         яркость подряд (мера шва считалась по перемешанным пикселям) */
      const cropOf = (src, l, t, w) => { const o = new Float32Array(w * w); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) o[y * w + x] = src[(y + t) * N + x + l]; return o; };
      const sc = seamOf(cropOf(raw, 19, 31, 440), 440, 440);
      say(sc.max > SEAM_FAIL, `вырез 440 px из плитки (уже не бесшовный): шов ${sc.x} / ${sc.y} — больше ${SEAM_FAIL}`);
      /* ткань: скачка яркости на краю выреза нет, а нить сбита по фазе (440 не кратно шагу 32) — раньше мера давала
         0.5…1.5 («бесшовная»); вырез, кратный шагу (480), рисунок продолжает */
      const craw = fieldToBytes(fields.canvas, {}); const sc1 = seamOf(cropOf(craw, 19, 31, 440), 440, 440), sc2 = seamOf(cropOf(craw, 0, 0, 480), 480, 480);
      say(sc1.max > SEAM_FAIL && !!sc1.detail.phase.x && sc1.detail.phase.x.lag === 32 && sc2.max <= SEAM_FAIL && sc2.max < sc1.max / 2, `ткань, вырез 440 px (не кратно шагу нити 32 px): шов ${sc1.x} / ${sc1.y} — больше ${SEAM_FAIL} (связь через край ${sc1.detail.phase.x ? sc1.detail.phase.x.edge : '—'} при ${sc1.detail.phase.x ? sc1.detail.phase.x.inner : '—'} внутри); вырез 480 px (кратно шагу): ${sc2.max}`);
      const half = Buffer.alloc(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) half[y * N + x] = raw[((y + N / 2) % N) * N + ((x + N / 2) % N)];
      const sh = seamOf(Float32Array.from(half), N, N);
      say(sh.max <= 1.15, `плитка, сдвинутая на полплитки по обеим осям: шов ${sh.x} / ${sh.y} — бесшовная осталась бесшовной`);
      const ramp = Buffer.from(raw); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) ramp[y * N + x] = Math.max(0, Math.min(255, Math.round(raw[y * N + x] - 3 + 6 * x / N)));
      const sr = seamOf(Float32Array.from(ramp), N, N);
      say(sr.x > SEAM_FAIL && sr.y <= 1.15, `плавный уклон 6 уровней слева направо: шов по ширине ${sr.x} (виден), по высоте ${sr.y} (нет)`);
      const step = Buffer.from(raw); for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) step[y * N + x] = Math.max(0, raw[y * N + x] - 1);
      const ss = seamOf(Float32Array.from(step), N, N);
      say(ss.x > SEAM_WARN, `ступенька в 1 уровень на краю: шов по ширине ${ss.x} — больше ${SEAM_WARN}`);
      /* порог зернистости SEAM_GRAIN (texture.mjs): вырез своей направленной бумаги — стык есть, скачок внутри плитки
         0.19 σ — зернистой плиткой не считается. При пороге 0.12 мера давала 1.42 («бесшовная»), а стык на листе виден */
      {
        const Fd = makeField({ kind: 'pulp', size: 1024, seed: 29, dir: 0 });
        const td = await renderTile(Fd, 1024, { format: 'webp', mean: 248, sd: 2.5, quality: 86, seamLimit: SEAM_AIM });
        const rd = await sharp(td.data).greyscale().raw().toBuffer({ resolveWithObject: true }); const ch = rd.info.channels;
        const cd = new Float32Array(512 * 512); for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) cd[y * 512 + x] = rd.data[((y + 300) * 1024 + x + 200) * ch];
        const sg = seamOf(cd, 512, 512);
        say(sg.max > SEAM_WARN, `вырез 512 px из направленной зернистой бумаги (стык есть): шов ${sg.x} / ${sg.y} — больше ${SEAM_WARN}, порог зернистости его не прощает`);
      }
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
        /* зернистая бумага сжимается хуже остальных (зерно по всей площади), но качество у неё больше не поднимается:
           было 54 КБ при качестве 90–94, стало около 40 при 86 */
        say(ok && kbs > 1 && kbs < (kind === 'pulp' ? 48 : 60) && /OK: 0 провалов, 0 предупреждений/.test(text(r)) && !/качество WebP поднято/.test(kind === 'pulp' ? text(r) : ''), `${kind} 1024 px из командной строки: код ${r.status}, ${Math.round(kbs * 10) / 10} КБ (единицы–десятки КБ${kind === 'pulp' ? '; у зернистой бумаги до 48, качество 86 без подъёма' : ''}), итог OK`);
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
      /* размер из замера: рецепт и --css называют surface-<вид>-<период>.webp — --like без --size делает файл с этим именем
         (раньше выходил 1024 и только подсказка) */
      const lkS = run(['--out', path.join(tmp, 'likeS'), '--kind', 'stone', '--like', like, '--json', path.join(tmp, 'likeS.json')]); const ljS = readJson(path.join(tmp, 'likeS.json'));
      say(lkS.status === 0 && fs.existsSync(path.join(tmp, 'likeS', 'surface-stone-1416.webp')) && !!ljS && ljS.files[0].width === 1416 && ljS.params.size === 1416 && ljS.params.sizeFrom === 'замер' && /url\(surface-stone-1416\.webp\); --surface-size: 1416px/.test(text(lkS)), `--like без --size: размер из замера — файл surface-stone-1416.webp ${ljS ? `${ljS.files[0].width}×${ljS.files[0].height}` : '—'} (имя и размер сходятся с рецептом и CSS)`);
      const lk2 = run(['--out', path.join(tmp, 'like2'), '--size', '512', '--like', like, '--mean', '220', '--json', path.join(tmp, 'like2.json')]);
      const lj2 = readJson(path.join(tmp, 'like2.json'));
      say(lk2.status === 0 && !!lj2 && near(lj2.files[0], 220, 4), `--mean главнее --like: ${lj2 ? `${lj2.files[0].mean} ± ${lj2.files[0].sd}` : 'нет отчёта'} при --mean 220 и σ 4 из замера`);
      /* вид из замера: --like с видом stone → плитка stone без --kind; заданный --kind главнее (WARN-подсказка);
         вид в замере не определён → первый кандидат и WARN «выбрать глазами» */
      const kd = (kind, conf, alt = ['stone', 'paper']) => ({ kind, conf, word: conf >= 0.7 ? 'высокая' : conf >= 0.45 ? 'средняя' : 'низкая', basis: 'тонкие тёмные линии на гладком поле', alt, guess: kind || alt[0] });
      const likeK = path.join(tmp, 'like-kind.json'); writeJson(likeK, { url: 'https://donor.example/', results: [], recipe: { surface: { none: false, tileMean: 244, tileSd: 3, size: 1024, tile: { file: 'marble.webp' }, kind: kd('stone', 0.92) } } });
      const k1 = run(['--out', path.join(tmp, 'k1'), '--size', '512', '--like', likeK, '--json', path.join(tmp, 'k1.json')]); const kj1 = readJson(path.join(tmp, 'k1.json'));
      say(k1.status === 0 && !!kj1 && kj1.params.kind === 'stone' && kj1.params.kindFrom === 'замер' && fs.existsSync(path.join(tmp, 'k1', 'surface-stone-512.webp')) && /вид stone — из замера/.test(text(k1)) && !/WARN/.test(text(k1)), `--like с видом stone, без --kind: плитка ${kj1 ? kj1.params.kind : '—'} (${kj1 ? kj1.params.kindFrom : '—'}), код ${k1.status}`);
      const k2 = run(['--out', path.join(tmp, 'k2'), '--size', '512', '--like', likeK, '--kind', 'paper', '--json', path.join(tmp, 'k2.json')]); const kj2 = readJson(path.join(tmp, 'k2.json'));
      say(k2.status === 0 && !!kj2 && kj2.params.kind === 'paper' && /WARN вид плитки/.test(text(k2)) && /по замеру у донора stone/.test(text(k2)), `--kind paper при замере с видом stone: плитка ${kj2 ? kj2.params.kind : '—'}, код ${k2.status}, WARN-подсказка о виде`);
      const likeU = path.join(tmp, 'like-unknown.json'); writeJson(likeU, { url: 'https://donor.example/', results: [], recipe: { surface: { none: false, tileMean: 244, tileSd: 3, size: 1024, tile: { file: 'wood.jpg' }, kind: { ...kd(null, 0.3), basis: 'штрихи вытянуты вдоль ширины — дерево' } } } });
      const k3 = run(['--out', path.join(tmp, 'k3'), '--size', '512', '--like', likeU, '--json', path.join(tmp, 'k3.json')]); const kj3 = readJson(path.join(tmp, 'k3.json'));
      say(k3.status === 0 && !!kj3 && kj3.params.kind === 'stone' && /WARN вид плитки/.test(text(k3)) && /в замере не определён/.test(text(k3)) && /--kind paper/.test(text(k3)) && /выбрать глазами/.test(text(k3)), `--like с видом «не определён»: взят первый кандидат (${kj3 ? kj3.params.kind : '—'}), код ${k3.status}, WARN «выбрать глазами» со вторым кандидатом`);
      /* ткань: шаг переплетения из замера (рецепт) и из признаков плитки (замер до доводки — поля thread в рецепте нет) */
      const cvK = { ...kd('canvas', 0.66, ['canvas', 'paper']), basis: 'рисунок повторяется по обеим осям: шаг 3 px' };
      const likeC = path.join(tmp, 'like-canvas.json'); writeJson(likeC, { url: 'https://donor.example/', results: [], recipe: { surface: { none: false, tileMean: 43, tileSd: 4.4, size: 256, tile: { file: 'weave.jpeg' }, kind: cvK, thread: 3 } } });
      const kc = run(['--out', path.join(tmp, 'kc'), '--like', likeC, '--json', path.join(tmp, 'kc.json')]); const kjc = readJson(path.join(tmp, 'kc.json'));
      say(kc.status === 0 && !!kjc && kjc.params.kind === 'canvas' && kjc.params.thread === 3 && kjc.params.size === 256 && /шаг переплетения 3 px \(из замера\)/.test(text(kc)) && fs.existsSync(path.join(tmp, 'kc', 'surface-canvas-256.webp')), `--like с тканью и шагом 3 px в рецепте: плитка ${kjc ? `${kjc.params.kind}, шаг ${kjc.params.thread} px, ${kjc.params.size} px` : '—'}, код ${kc.status}`);
      const likeC2 = path.join(tmp, 'like-canvas-old.json'); writeJson(likeC2, { url: 'https://donor.example/', results: [{ viewport: { name: 'desktop' }, grain: {}, surface: { tile: { file: 'weave.png', mean: 200, sd: 5, kind: cvK, feat: { per: { x: { lag: 6, peak: 0.6, depth: 0.8 }, y: { lag: 6, peak: 0.6, depth: 0.8 } }, coh: 0.1, dir: 0 } } } }], recipe: { surface: { none: false, tileMean: 200, tileSd: 5, size: 256, tile: { file: 'weave.png' }, kind: cvK } } });
      const kc2 = run(['--out', path.join(tmp, 'kc2'), '--like', likeC2, '--json', path.join(tmp, 'kc2.json')]); const kjc2 = readJson(path.join(tmp, 'kc2.json'));
      say(kc2.status === 0 && !!kjc2 && kjc2.params.thread === 6, `--like с замером до доводки (шага в рецепте нет): шаг из признаков плитки — ${kjc2 ? kjc2.params.thread : '—'} px`);
      const kt = run(['--out', path.join(tmp, 'kt'), '--kind', 'canvas', '--size', '256', '--thread', '6', '--like', likeC, '--json', path.join(tmp, 'kt.json')]); const kjt = readJson(path.join(tmp, 'kt.json'));
      say(kt.status === 0 && !!kjt && kjt.params.thread === 6, `--thread главнее --like: шаг ${kjt ? kjt.params.thread : '—'} px при 3 px в замере`);
      /* зернистая бумага: направление волокон из замера */
      const puK = { ...kd('pulp', 0.62, ['pulp', 'paper']), basis: 'зерно и волокна, волокна вдоль ширины' };
      const likeP = path.join(tmp, 'like-pulp.json'); writeJson(likeP, { url: 'https://donor.example/', results: [], recipe: { surface: { none: false, tileMean: 127.4, tileSd: 3.3, size: 512, tile: { file: 'paper.webp' }, kind: puK, dir: 0 } } });
      const kp = run(['--out', path.join(tmp, 'kp'), '--like', likeP, '--json', path.join(tmp, 'kp.json')]); const kjp = readJson(path.join(tmp, 'kp.json'));
      say(kp.status === 0 && !!kjp && kjp.params.kind === 'pulp' && kjp.params.dir === 0 && /волокна под 0° \(из замера\)/.test(text(kp)) && /OK: 0 провалов/.test(text(kp)), `--like с зернистой бумагой и волокнами вдоль ширины: плитка ${kjp ? `${kjp.params.kind}, направление ${kjp.params.dir}°` : '—'}, код ${kp.status}`);
      const c1 = run(['--check', path.join(out, 'surface-paper-1024.webp'), '--like', likeK, '--mean', '248', '--sd', '2.5']);
      say(c1.status === 0 && /вид другой: эта плитка — мятая бумага \(paper/.test(text(c1)) && /у донора — камень \(stone/.test(text(c1)) && /^WARN /m.test(text(c1)) && !/^FAIL/m.test(text(c1)), `--check бумажной плитки против замера с камнем: код ${c1.status}, WARN «вид другой» (подсказка, не FAIL)`);
      const c2 = run(['--check', path.join(out, 'surface-stone-1024.webp'), '--like', likeK, '--mean', '248', '--sd', '2.5']);
      say(c2.status === 0 && !/вид другой/.test(text(c2)) && /вид: камень \(stone\)/.test(text(c2)) && /у донора — stone/.test(text(c2)), `--check каменной плитки против замера с камнем: код ${c2.status}, вид совпал, подсказки нет`);
      const cropC = path.join(tmp, 'crop-canvas.png');
      await sharp(path.join(out, 'surface-canvas-1024.webp')).extract({ left: 37, top: 61, width: 904, height: 904 }).png().toFile(cropC);   /* 904 = 28 × 32 + 8: нить сдвинута на полширины */
      const c3 = run(['--check', cropC]);
      say(c3.status === 1 && /шов виден/.test(text(c3)) && /сбит по фазе/.test(text(c3)), `--check выреза 904 px из ткани (нить сдвинута на 8 px из 16): код ${c3.status}, «шов виден … рисунок сбит по фазе»`);
      const old = path.join(tmp, 'old.json'); writeJson(old, { url: 'https://donor.example/', results: [{ viewport: { name: 'desktop' }, grain: {} }], recipe: { none: true } });
      const lk3 = run(['--out', path.join(tmp, 'nolike'), '--like', old]);
      say(lk3.status === 1 && /крупной фактуры нет/.test(text(lk3)) && !fs.existsSync(path.join(tmp, 'nolike')), `--like с замером без крупной фактуры: код ${lk3.status}, папка не создана`);
      const far = run(['--out', path.join(tmp, 'far'), '--size', '256', '--mean', '255', '--sd', '6']);
      say(far.status === 1 && /мимо цели/.test(text(far)), `недостижимая цель (яркость 255 при σ 6): код ${far.status}, «мимо цели» — честный FAIL`);
      const cv = run(['--out', path.join(tmp, 'cv'), '--kind', 'canvas', '--size', '256', '--veins', '9']);
      say(cv.status === 0 && /WARN/.test(text(cv)) && /не действует/.test(text(cv)), `canvas с --veins: код ${cv.status}, WARN «не действует»`);
      const pw = run(['--out', path.join(tmp, 'pw'), '--kind', 'paper', '--size', '256', '--thread', '6', '--dir', '0']);
      say(pw.status === 0 && /WARN --thread/.test(text(pw)) && /WARN --dir/.test(text(pw)) && (text(pw).match(/не действует/g) || []).length === 2, `paper с --thread и --dir: код ${pw.status}, два WARN «не действует»`);
      const pv = run(['--out', path.join(tmp, 'pv'), '--kind', 'pulp', '--size', '256', '--veins', '0']);
      say(pv.status === 0 && !/не действует/.test(text(pv)) && /ворсинок 0/.test(text(pv)), `pulp с --veins 0: код ${pv.status}, флаг действует (ворсинок 0), WARN нет`);
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
    if (m.kind) console.log(`     вид: ${m.kind.kind ? `${KIND_RU[m.kind.kind]} (${m.kind.kind}) — уверенность ${m.kind.conf}, ${m.kind.word}` : `не определён (уверенность ${m.kind.conf})`}: ${m.kind.basis}${target && target.kind ? `; у донора — ${target.kind.kind ? `${target.kind.kind} (${target.kind.conf})` : 'не определён'}` : ''}`);
    judge(m, { mean, sd, donorKind: target ? target.kind : null });
    report.files.push({ ...m, path: path.resolve(f) }); report.target = { mean, sd, kind: target && target.kind ? target.kind.kind : null };
  } else {
    /* вид: заданный --kind; иначе вид из замера --like (не определён — первый кандидат замера); иначе paper */
    const likeKind = target && target.kind ? target.kind : null;
    const fromLike = opt.kind === undefined && likeKind ? (likeKind.kind || likeKind.guess || (likeKind.alt || [])[0] || null) : null;
    const kind = opt.kind === undefined ? (fromLike && KINDS[fromLike] ? fromLike : 'paper') : String(opt.kind);
    if (!KINDS[kind]) die(`Неизвестный --kind ${kind}: ${Object.keys(KINDS).join(', ')}`);
    /* размер: заданный --size; иначе период показа из замера --like (рецепт и --css называют файл surface-<вид>-<период>.webp —
       раньше --like без --size делал 1024, и имя файла расходилось с тем, на что ссылается CSS); иначе 1024 */
    const sizeFromLike = opt.size === undefined && target && target.size ? Math.max(128, Math.min(4096, Math.round(target.size))) : null;
    const size = num('size', 128, 4096, 'нужна сторона плитки от 128 до 4096 px') ?? sizeFromLike ?? 1024;
    if (!Number.isInteger(size)) die(`--size ${opt.size}: нужно целое число пикселей`);
    const seed = opt.seed === undefined ? 11 : Number(opt.seed);
    if (!Number.isFinite(seed)) die(`--seed ${opt.seed}: нужно число`);
    const quality = num('quality', 1, 100, 'нужно качество WebP от 1 до 100') ?? 86;
    const veins = num('veins', 0, 4000, 'нужно число прожилок (у pulp — ворсинок) от 0 до 4000');
    /* шаг переплетения ткани и направление волокон зернистой бумаги: заданные флагом, иначе из замера --like */
    const threadArg = num('thread', THREAD_MIN, THREAD_MAX, `нужен шаг переплетения от ${THREAD_MIN} до ${THREAD_MAX} px`);
    const dirArg = num('dir', 0, 180, 'нужно направление волокон от 0 до 180 градусов (0 — вдоль ширины, 90 — вдоль высоты)');
    const thread = kind !== 'canvas' ? null : threadArg ?? (target && target.thread ? Math.max(THREAD_MIN, Math.min(THREAD_MAX, target.thread)) : null);
    const dir = kind !== 'pulp' ? null : dirArg ?? (target && target.dir != null ? target.dir : null);
    const formats = [...new Set(String(opt.formats === undefined ? 'webp' : opt.formats).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
    const unknown = formats.filter((x) => !['webp', 'png'].includes(x));
    if (unknown.length || !formats.length) die(`Неизвестный формат в --formats: ${unknown.join(', ') || '(пусто)'} — есть webp и png`);
    const mean = meanArg ?? (target ? target.mean : DEFAULT_MEAN), sd = sdArg ?? (target ? target.sd : DEFAULT_SD);
    const name = opt.name === undefined ? `surface-${kind}-${size}` : String(opt.name);
    if (/[\\/]/.test(name)) die(`--name ${name}: только имя файла, без папок (папка — --out)`);
    const out = path.resolve(String(opt.out === undefined ? '.' : opt.out));
    fs.mkdirSync(out, { recursive: true });
    const nVeins = !KINDS[kind].veins ? 0 : veins == null ? Math.max(kind === 'pulp' ? 0 : 1, Math.round(KINDS[kind].veins * size * size / (1024 * 1024))) : Math.round(veins);
    console.log(`плитка ${name}: ${KINDS[kind].title}, ${size}×${size}, seed ${seed}${!KINDS[kind].veins ? '' : `, ${kind === 'pulp' ? 'ворсинок' : 'прожилок'} ${nVeins}`}${kind === 'canvas' ? `, шаг переплетения ${thread ?? DEFAULT_THREAD} px${thread != null && threadArg == null ? ' (из замера)' : ''}` : ''}${kind === 'pulp' && dir != null ? `, волокна под ${dir}°${dirArg == null ? ' (из замера)' : ''}` : ''}, цель — яркость ${mean} ± ${sd}${target && meanArg == null && sdArg == null ? ` (из замера ${path.basename(String(opt.like))}${target.tile ? `, плитка донора ${target.tile}` : ''})` : ''} → ${out}`);
    if (sizeFromLike != null) console.log(`     размер ${size} px — период показа у донора из замера (другой — задать --size)`);
    if (kind === 'canvas' && thread != null) { const real = size / Math.max(2, Math.round(size / thread)); if (Math.abs(real - thread) > 0.01) console.log(`     шаг переплетения выйдет ${r2(real)} px: в плитку ${size} px укладывается целое число повторов (для ровно ${thread} px — --size, кратный ${thread})`); }
    if (likeKind && opt.kind === undefined && likeKind.kind) console.log(`     вид ${kind} — из замера: ${likeKind.basis} (уверенность ${likeKind.conf}, ${likeKind.word})`);
    else if (likeKind && opt.kind === undefined) line('WARN', 'вид плитки', `в замере не определён (${likeKind.basis}) — взят ${kind}; сделать и --kind ${(likeKind.alt || ['paper', 'stone']).find((k) => k !== kind) || 'stone'}, положить вырезки 1:1 рядом с вырезкой донора и выбрать глазами`);
    else if (likeKind && likeKind.kind && likeKind.kind !== kind) line('WARN', 'вид плитки', `задан --kind ${kind}, а по замеру у донора ${likeKind.kind} (уверенность ${likeKind.conf}: ${likeKind.basis}) — подсказка, не провал`);
    if (!KINDS[kind].veins && veins != null) line('WARN', '--veins', `у вида ${kind} прожилок нет — флаг не действует`);
    if (kind !== 'canvas' && threadArg != null) line('WARN', '--thread', `шаг переплетения есть только у ткани (canvas) — у вида ${kind} флаг не действует`);
    if (kind !== 'pulp' && dirArg != null) line('WARN', '--dir', `направление волокон есть только у зернистой бумаги (pulp) — у вида ${kind} флаг не действует`);
    const F = makeField({ kind, size, seed, veins, thread, dir });
    for (const fmt of formats) {
      /* качество задано явно — оно и остаётся; по умолчанию поднимается, пока шов не уйдёт под SEAM_AIM */
      /* ткань с мелким шагом (до FINE_THREAD px): при качестве 86 сжатие ломает сам рисунок — шаг 6 px читается как 12, сбой
         фазы на краю 3…8; с 92 рисунок цел. Заданное явно качество не меняется */
      const fineWeave = kind === 'canvas' && thread != null && thread < FINE_THREAD;
      const r = await renderTile(F, size, { format: fmt, mean, sd, quality: opt.quality === undefined && fineWeave ? Math.max(quality, 92) : quality, seamLimit: opt.quality === undefined ? SEAM_AIM : null, fullSeam: kind === 'pulp' || fineWeave });
      const f = path.join(out, `${name}.${fmt}`); fs.writeFileSync(f, r.data);
      if (r.raised) console.log(`     качество WebP поднято с ${r.raised.from} до ${r.quality}: ${r.raised.steps.map((s) => `при ${s.quality} шов ${s.seam}`).join(', ')} (сжатие кодирует края плитки независимо)`);
      const m = await measureTileFile(f);
      judge(m, { mean, sd }); report.files.push({ ...m, path: f, tries: r.tries, quality: fmt === 'webp' ? r.quality : null });
      /* своя плитка должна узнаваться как свой вид: иначе сверка «вид плитки» с донором даст ложную подсказку */
      if (m.kind && m.kind.kind && m.kind.kind !== kind) line('WARN', 'вид плитки', `плитка сделана как ${kind}, а разбор texture.mjs видит в ней ${m.kind.kind} (уверенность ${m.kind.conf}: ${m.kind.basis}) — на мелкой плитке или без прожилок виды сходятся; сверить глазами`);
    }
    if (opt.sheet) {
      const sh = await writeSheet(report.files[0].path, path.join(out, name));
      console.log(`     для глаз (контраст ×${sh.gain}): лист 2×2 — ${path.basename(sh.sheet)}, крест стыков 1:1 — ${path.basename(sh.seam)}; на сайт их не класть`);
      report.sheet = sh;
    }
    const main = report.files.find((x) => x.format === 'webp') || report.files[0];
    console.log(`\nкак положить: templates/surface.css — --surface-tile: url(${path.basename(main.path)}); --surface-size: ${size}px; светлые и цветные поля — multiply, тёмные — color-burn`);
    report.params = { kind, kindFrom: opt.kind !== undefined ? 'флаг' : fromLike ? 'замер' : 'по умолчанию', size, seed, veins: !KINDS[kind].veins ? 0 : nVeins, ...(kind === 'canvas' ? { thread: thread ?? DEFAULT_THREAD } : {}), ...(kind === 'pulp' ? { dir } : {}), mean, sd, quality, name, formats, sizeFrom: opt.size !== undefined ? 'флаг' : sizeFromLike != null ? 'замер' : 'по умолчанию' };
  }
  if (opt.json !== undefined) writeJson(String(opt.json), report);
  console.log(`\n${fails ? 'FAIL' : warns ? 'WARN' : 'OK'}: ${fails} провалов, ${warns} предупреждений`);
  if (fails) process.exit(1);
}
