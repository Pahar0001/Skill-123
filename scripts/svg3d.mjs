#!/usr/bin/env node
/**
 * svg3d.mjs — «3D SVG»: фоны, иконки и украшения с объёмом, чистым вектором, на бесплатных библиотеках.
 * Справочник — reference/svg-3d.md, образцы сцен и страница-образец — templates/svg3d/.
 *
 *   node svg3d.mjs doctor [--json файл]                       что установлено и работает, чем грозит отсутствие
 *   node svg3d.mjs zdog <сцена.mjs> [--out файл.svg|папка] [--palette "ink=#16301F,moss=#5E7A33"] [--css-vars]
 *        [--rotate x,y,z] [--size 240|320x200] [--zoom 1] [--fit] [--pad 4] [--frames N] [--axis y] [--sprite] [--no-cull]
 *   node svg3d.mjs three <сцена.mjs> [--out …] [--palette …] [--rotate x,y,z] [--size …] [--pad 8] [--frames N]
 *        [--axis y] [--sprite] [--seam 1] [--tones N] [--no-merge] [--no-sort]
 *   node svg3d.mjs cad <файл.py | gear | crate | nut> [--out …] [--view iso,front] [--param teeth=16,width=10]
 *        [--size 480] [--stroke 1.2] [--hidden dashed|faint|none] [--color "#16301F"] [--draw]
 *   node svg3d.mjs trace <картинка> [--out …] [--colors 6] [--simplify 4] [--mono] [--engine vtracer|potrace]
 *        [--palette …] [--max-size 1024] [--threshold 128] [--color "#16301F"] [--drop-bg]
 *   node svg3d.mjs rough <svg> [--out …] [--seed 7] [--roughness 1] [--bowing 1] [--fill-style hachure] [--ink "#16301F"] [--paper "#E9EEDD"] [--single-stroke]
 *   node svg3d.mjs icon <набор:имя>… --out <папка сайта> [--caption "роль на сайте"] [--stroke-width 1.5] [--allow-attribution]
 *   node svg3d.mjs icon --search <слово> [--set lucide,tabler] [--limit 24] [--preview]
 *   node svg3d.mjs scatter <svg>… --out фон.svg [--size 1440x600] [--count 14] [--item 120] [--seed 7] [--area full|edges|left|right]
 *   node svg3d.mjs optimize <svg>… [--out …] [--id-prefix p] [--precision 2] [--keep-size] [--label "…"]
 *   node svg3d.mjs preview <svg>… [--out файл.png|папка] [--bg "#E9EEDD"] [--width 480] [--color "#16301F"]
 *   node svg3d.mjs sheet <svg|папка>… --out лист.png [--bg "#E9EEDD"] [--cols 4] [--cell 220]
 *   node svg3d.mjs blender <файл.blend> [--out …]             необязательная ветка: нет Blender — отказ с подсказкой
 *   node svg3d.mjs selftest [--keep]                          стенды scripts/fixtures/svg3d: каждый движок, детерминизм, бюджеты
 *   node svg3d.mjs --help | -h
 *
 * Движки (какой когда — reference/svg-3d.md):
 *   zdog    псевдо-3D из круглых фигур с толстой обводкой: «игрушечные» иконки и предметы. Сцена — ES-модуль с
 *           export function build({ Zdog, illo, palette, TAU }); та же сцена ставится на сайт «живой» (templates/svg3d).
 *   three   настоящая сцена Three.js через SVGRenderer: плоские грани со светом, «гранёный» вид. Порядок граней
 *           исправляется по глубине (пересекающиеся грани режутся по линии пересечения), грани одной заливки
 *           склеиваются, щели между гранями закрываются.
 *   cad     модель CadQuery (Python) → проекция со скрытыми линиями пунктиром, чертёжный стиль.
 *   blender Freestyle SVG Exporter — только если Blender установлен; при разработке не проверялось.
 * Zdog и Three рисуют через DOM — сцена исполняется в безголовом Chrome (сеть при этом закрыта).
 *
 * Общие флаги:
 *   --out          файл .svg (.png у preview и sheet) или папка; по умолчанию — текущая папка, имя — по сцене
 *   --palette      цвета по именам: "ink=#16301F,moss=#5E7A33" — подменяют палитру сцены (export const palette);
 *                  у trace — к этим цветам притягиваются цвета результата
 *   --css-vars     цвета палитры — CSS-переменными с запасным значением (переменная «c-moss» с запасным #5e7a33):
 *                  сайт перекрашивает рисунок, вписанный в страницу (в <img> и фоне CSS остаётся запасной цвет);
 *                  у three не действует: оттенки граней считает свет
 *   --var-prefix   приставка имён переменных (c-: цвет moss → переменная c-moss)
 *   --for          для чего рисунок — бюджет веса и узлов: icon (4 КБ, 40 узлов) | decor (15 КБ, 200) |
 *                  background (60 КБ, 800); больше бюджета — WARN (для фона — «лучше WebP»)
 *   --budget       свой бюджет веса в КБ вместо табличного
 *   --precision    знаков после запятой в координатах (zdog — 2; three, cad, trace и rough — 1)
 *   --id-prefix    приставка id и классов внутри SVG (по умолчанию — из имени файла): несколько рисунков,
 *                  вписанных в одну страницу, не делят id
 *   --label        рисунок со смыслом: role="img" и aria-label="…"; без флага — декор: aria-hidden="true" и focusable="false"
 *   --keep-size    оставить width и height у корня (по умолчанию убираются: размер задаёт вёрстка)
 *   --allow-raster не убирать вложенные картинки <image> data:image (внешние ссылки убираются всегда)
 *   --keep-anim    не убирать SMIL-анимации (они не слушают «меньше движения» — по умолчанию убираются)
 *   --preview      рядом PNG-превью на фоне: --preview "#E9EEDD" (без цвета — белый); у кадров — лист всех кадров
 *   --json         записать итог (файлы, вес, узлы, предупреждения) в файл
 *
 * zdog и three:
 *   --rotate       поворот сцены, градусы: x,y,z (прибавляется к повороту из сцены)
 *   --size         поле рисунка: 240 или 320x200 (по умолчанию — export const view = { size } сцены)
 *   --zoom         увеличение Zdog (1): поле то же, предмет крупнее
 *   --fit          Zdog: обрезать поле по содержимому (с обводкой) и отступить --pad
 *   --pad          отступ от края, единицы поля (zdog --fit: 4; three: 8 — камера подгоняется сама)
 *   --frames       N кадров полного оборота вокруг --axis: файлы имя-01.svg … (общее поле — предмет не «прыгает»)
 *   --axis         ось оборота кадров: x | y | z (y)
 *   --sprite       вместо отдельных кадров — одна лента кадров имя-spriteN.svg (для steps() и background-position)
 *   --no-cull      zdog: не убирать фигуры, закрытые целиком (по умолчанию убираются: задние грани коробок,
 *                  донышки и перекрытые детали — до половины узлов файла)
 *   --seam         three: обводка цветом заливки, закрывает волосяные щели между гранями, px экрана (1 — по полпикселя
 *                  в каждую сторону, щель закрыта при любом масштабе; 0 — без неё)
 *   --tones        three: свести оттенки каждого материала к N ступеням (плакатный вид, меньше узлов); 0 — как есть
 *   --no-merge     three: не склеивать грани одной заливки (для разбора «что не так»)
 *   --no-sort      three: не исправлять порядок граней (оставить «по центру грани», как у SVGRenderer)
 *
 * cad:
 *   --view         вид или несколько через запятую — в ряд, в одном масштабе: iso, iso-left, front, back, right, left,
 *                  top, bottom или направление на зрителя "1,-1,0.8"
 *   --param        параметры модели: "teeth=16,width=10" — встроенным фигурам и словарём params в свой сценарий
 *   --stroke       толщина видимой линии, px при ширине --size (1.2); скрытые и плавные переходы — ×0.75
 *   --hidden       скрытые линии: dashed — пунктир (по умолчанию) | faint — бледные сплошные | none — не рисовать
 *   --color        цвет линий; по умолчанию currentColor — рисунок красится цветом текста блока.
 *                  У trace --mono — цвет рисунка; у preview и sheet — чем показать currentColor
 *   --draw         готово к прорисовке линией (templates/decor-kit, .dk-draw): каждому контуру pathLength="1",
 *                  скрытые линии без пунктира
 *
 * trace:
 *   --colors       число цветов (6): картинка сначала сводится к палитре — пятна ровные
 *   --simplify     0…10 — насколько грубо: мелкие пятна выбрасываются, кривые короче (4)
 *   --mono         одним цветом --color; порог яркости — --threshold
 *   --engine       vtracer (по умолчанию) | potrace (только с --mono; по умолчанию для --mono, если установлен)
 *   --max-size     наибольшая сторона картинки перед трассировкой, px (1024)
 *   --threshold    порог яркости 0…255 для --mono (128)
 *   --drop-bg      убрать фон картинки (цвет её четырёх углов) — для готового рендера на ровном фоне
 *
 * rough:
 *   --seed         зерно случайности (7): тот же seed — побайтно тот же файл; у scatter — раскладка
 *   --roughness    дрожание линии (1; 0.5 — аккуратнее, 2 — небрежнее)
 *   --bowing       изгиб прямых (1)
 *   --fill-style   заливка: hachure — штриховка | solid | zigzag | cross-hatch | dots | none
 *   --hachure-gap  шаг штриховки в единицах рисунка (по умолчанию — 1/60 его размера)
 *   --ink          цвет контура у всех фигур (иначе — своя обводка фигуры, а без неё — цвет заливки)
 *   --paper        цвет фона страницы — подложкой под каждую фигуру: штриховка просвечивает, и у объёмного рисунка
 *                  (three, zdog) без подложки дальние грани видны сквозь ближние; или --fill-style solid
 *   --single-stroke  одна линия контура вместо двойной: файл вдвое легче, вид суше (для чертежей cad)
 *   --stroke-width толщина линии; у icon — заменить толщину линии контурной иконки (единая линия на сайте)
 *
 * icon (Iconify; лицензия у каждого набора своя и берётся из сведений о наборе):
 *   --search       слово по-английски → список «набор:имя» с лицензиями; с --preview — лист найденного глазами
 *   --set          искать только в этих наборах: lucide,tabler,ph
 *   --limit        сколько показать (24)
 *   --caption      роль иконок на сайте — в credits.json (по умолчанию «иконка»)
 *   --allow-attribution  взять иконку из набора CC BY / CC BY-SA: в credits.json — обязательная подпись, которую
 *                  ставит `media.mjs credits`; без флага такие наборы — отказ (код 2). Некоммерческие, GPL и
 *                  неизвестные лицензии — отказ всегда
 *   Иконка пишется в --out как <набор>-<имя>.svg с currentColor; запись — в credits.json этой папки.
 *
 * scatter (фон-россыпь: каждый рисунок описан один раз, расставлен много раз — вес почти не растёт):
 *   --count        сколько предметов (14)
 *   --item         средний размер предмета, px (120)
 *   --scale        разброс размера: "0.6,1.15"
 *   --tilt         наибольший наклон, градусы (24)
 *   --area         full — по всему полю | edges — у левого и правого краёв, середина свободна под текст |
 *                  left, right — у одного края
 *   --band         ширина полосы для --area, доля поля: у edges — 0.18 с каждой стороны, у left и right — 0.45
 *   --opacity      прозрачность всей россыпи 0…1 (1)
 *
 * preview и sheet:
 *   --bg           цвет фона (#ffffff)
 *   --width        ширина превью, px (480)
 *   --cols         колонок на листе (4)
 *   --cell         сторона ячейки листа, px (220)
 *
 * selftest:
 *   --keep         не удалять временную папку с результатами (путь печатается)
 *
 * Каждая команда печатает: файл, вес до и после SVGO (и после gzip), число узлов и точек контуров,
 * что убрано при чистке и предупреждения. В выходе нет <script>, обработчиков, внешних ссылок и растра
 * (если не просили); картинка «до и после чистки» сверяется попиксельно.
 *
 * Вердикты: OK; WARN — сделано, но посмотреть (вес сверх бюджета, грани пересекаются, картинка после чистки
 * изменилась); FAIL — результат негоден.
 * Код выхода: 0 — сделано (и при WARN); 1 — ошибка (аргументы, сцена, FAIL); 2 — не сделано по правилу или
 * нет движка (нет Blender или CadQuery, лицензия иконки не подходит).
 *
 * Окружение: CHROME_PATH — другой Chrome; SVG3D_PYTHON — интерпретатор с cadquery; BLENDER_PATH;
 * SVG3D_ICONIFY_BASE — другой адрес API Iconify (selftest поднимает свой).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, loadSharp, writeJson, ensureDir } from './lib.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const COMMANDS = ['doctor', 'zdog', 'three', 'cad', 'trace', 'rough', 'icon', 'scatter', 'optimize', 'preview', 'sheet', 'blender', 'selftest'];
const { pos, opt } = parseArgs(process.argv.slice(2), {
  flags: ['help', 'h', 'css-vars', 'fit', 'sprite', 'no-cull', 'no-merge', 'no-sort', 'single-stroke', 'drop-bg', 'draw', 'mono', 'keep-size', 'allow-raster', 'keep-anim', 'allow-attribution', 'keep'],
  values: ['out', 'palette', 'var-prefix', 'for', 'budget', 'precision', 'id-prefix', 'label', 'json', 'rotate', 'size', 'zoom', 'pad', 'frames', 'axis', 'seam', 'tones',
    'view', 'param', 'stroke', 'hidden', 'color', 'colors', 'simplify', 'engine', 'max-size', 'threshold', 'seed', 'roughness', 'bowing', 'fill-style', 'hachure-gap', 'ink', 'paper',
    'stroke-width', 'search', 'set', 'limit', 'caption', 'count', 'item', 'scale', 'tilt', 'area', 'band', 'opacity', 'bg', 'width', 'cols', 'cell'],
  optional: ['preview'],
  commands: COMMANDS,
  strict: true,
});
/* «-h» parseArgs кладёт в позиционные */
if (opt.help || opt.h || pos.includes('-h') || !pos.length) { console.log(HELP); process.exit(pos.length || opt.help || opt.h ? 0 : 1); }

const { getSvgo, inspectSvg, cleanSvg, cssVars, parsePalette, normHex, rasterize, rasterDiff, kb1, bytesOf, innerOf } = await import('./svg3d/svg.mjs');

/* ---------------- общее ---------------- */
let fails = 0, warns = 0; const report = { command: pos[0], files: [], warnings: [] };
const die = (m, code = 1) => { console.error(m); process.exit(code); };
const line = (status, what, details) => { if (status === 'FAIL') fails++; if (status === 'WARN') { warns++; report.warnings.push(`${what}${details ? ' — ' + details : ''}`); } console.log(`${status.padEnd(4)} ${what}${details ? ' — ' + details : ''}`); };
const str = (v) => (v == null || v === true ? null : String(v));
const numOpt = (k, def, { min = -Infinity, max = Infinity, int = false } = {}) => {
  if (opt[k] == null) return def;
  const v = Number(opt[k]); if (opt[k] === true || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) die(`--${k} ${opt[k] === true ? '(пусто)' : opt[k]}: нужно ${int ? 'целое ' : ''}число${min > -Infinity ? ` от ${min}` : ''}${max < Infinity ? ` до ${max}` : ''}`);
  return v;
};
const oneOf = (k, list, def) => { if (opt[k] == null) return def; if (!list.includes(String(opt[k]))) die(`--${k} ${opt[k] === true ? '(пусто)' : opt[k]}: нужно одно из ${list.join(' | ')}`); return String(opt[k]); };
const colorOpt = (k, def) => { if (opt[k] == null) return def; const h = normHex(opt[k]); if (!h) die(`--${k} ${opt[k] === true ? '(пусто)' : opt[k]}: нужен цвет #RGB или #RRGGBB`); return h; };
const listOf = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);
function sizeOpt(def = null) {
  if (opt.size == null) return def;
  const m = /^(\d+(?:\.\d+)?)(?:[x×*](\d+(?:\.\d+)?))?$/i.exec(String(opt.size));
  if (!m) die(`--size ${opt.size}: нужно 240 или 320x200`);
  return [Number(m[1]), Number(m[2] || m[1])];
}
function paletteOpt() { try { return parsePalette(opt.palette); } catch (e) { return die(e.message); } }
const BUDGET = { icon: { kb: 4, nodes: 40, name: 'иконки' }, decor: { kb: 15, nodes: 200, name: 'украшения' }, background: { kb: 60, nodes: 800, name: 'фона' } };
const need = (file, what) => { if (!file) die(`Нужно: node svg3d.mjs ${cmd} <${what}> (справка: --help)`); if (!fs.existsSync(file)) die(`Нет файла: ${file}`); return path.resolve(file); };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'g';
/* куда писать: --out с расширением — файл, иначе папка (по умолчанию текущая) */
function target(name, ext = '.svg') {
  const o = str(opt.out);
  if (o && path.extname(o).toLowerCase() === ext) return path.resolve(o);
  return path.join(path.resolve(o || '.'), `${name}${ext}`);
}
const outDir = () => { const o = str(opt.out); return path.resolve(o && path.extname(o) ? path.dirname(o) : o || '.'); };

let svgo = null, sharp;
async function needSvgo() { if (!svgo) svgo = await getSvgo(); if (!svgo) die('Нет пакета svgo — без него не работает ни одна команда: npm i svgo --prefix ~/.claude/site-rework (node svg3d.mjs doctor)', 2); return svgo; }
function getSharp() { if (sharp === undefined) sharp = loadSharp(); return sharp; }
const previewBg = () => (opt.preview == null ? null : opt.preview === true ? '#ffffff' : normHex(opt.preview) || die(`--preview ${opt.preview}: нужен цвет фона #RGB или #RRGGBB (или без значения — белый)`));

/**
 * Довести сырой SVG до файла: чистка, CSS-переменные, проверка, вес, бюджет, превью.
 * raw — что дал движок; file — куда; kind — icon | decor | background.
 */
async function emit(raw, file, { kind = 'decor', precision = 2, palette = null, vars = false, notes = [], mergePaths = true, quiet = false, compare = true, tips = 'упростить сцену' } = {}) {
  await needSvgo();
  const before = bytesOf(raw);
  let clean;
  try { clean = cleanSvg(svgo, raw, { precision, idPrefix: str(opt['id-prefix']) || slug(path.basename(file, path.extname(file))), keepSize: !!opt['keep-size'], allowRaster: !!opt['allow-raster'], label: str(opt.label), keepAnim: !!opt['keep-anim'], mergePaths }); } catch (e) { line('FAIL', path.basename(file), `SVG не разбирается: ${String(e.reason || e.message).split('\n')[0]}`); return null; }
  let text = clean.data; let used = [];
  if (vars && palette && Object.keys(palette).length) { const r = cssVars(text, palette, str(opt['var-prefix']) || 'c-'); text = r.text; used = r.used; }
  const info = inspectSvg(svgo, text);
  if (!info.ok) { line('FAIL', path.basename(file), `после чистки не разбирается: ${info.error}`); return null; }
  ensureDir(path.dirname(file)); fs.writeFileSync(file, text);
  const removed = Object.entries(clean.removed).map(([k, n]) => `${k} × ${n}`);
  const rec = { file, bytes: info.bytes, bytesBefore: before, gzip: info.gzip, elements: info.elements, points: info.points, viewBox: info.viewBox, removed: clean.removed, kind, cssVars: used };
  report.files.push(rec);
  if (!quiet) {
    console.log(`     ${file}`);
    console.log(`     вес ${kb1(before)} до SVGO → ${kb1(info.bytes)} после (gzip ${kb1(info.gzip)}) · узлов ${info.elements}, точек контуров ${info.points} · viewBox ${info.viewBox || 'нет'}${used.length ? ` · переменные: ${used.map((n) => `--${str(opt['var-prefix']) || 'c-'}${n}`).join(', ')}` : ''}`);
    if (removed.length) console.log(`     убрано при чистке: ${removed.join(', ')}`);
    for (const n of notes) console.log(`     ${n}`);
  }
  const bad = [info.scripts && `<script> или javascript: × ${info.scripts}`, info.handlers && `обработчики × ${info.handlers}`, info.external.length && `внешние ссылки: ${info.external.slice(0, 3).join('; ')}`, info.raster && !opt['allow-raster'] && `растр <image> × ${info.raster}`, info.embedded && `встроенное содержимое × ${info.embedded}`].filter(Boolean);
  if (bad.length) line('FAIL', path.basename(file), `в выходе осталось: ${bad.join(', ')}`);
  if (!info.viewBox) line('WARN', path.basename(file), 'нет viewBox — рисунок не будет масштабироваться; задайте у исходника width и height или viewBox');
  /* чистка не должна менять картинку: сверяем растром (если при чистке ничего не выбрасывалось) */
  if (compare && getSharp() && !removed.length) {
    try {
      const a = await rasterize(getSharp(), raw, { width: 320 }), b = await rasterize(getSharp(), text, { width: 320 });
      const d = rasterDiff(a, b); rec.cleanDiff = d;
      if (d && d.mean > 0.6) line('WARN', path.basename(file), `картинка после чистки отличается от исходной на ${d.mean}% (наибольшее ${d.max}/255) — открыть превью обоих вариантов; чище — меньше --precision не ставить`);
    } catch { /* растеризатор не смог — сверки нет */ }
  }
  const b = BUDGET[kind] || BUDGET.decor; const limit = opt.budget != null ? numOpt('budget', b.kb, { min: 0.1 }) : b.kb;
  if (info.bytes > limit * 1024 || info.elements > b.nodes) {
    const why = [info.bytes > limit * 1024 && `вес ${kb1(info.bytes)} больше ${limit} КБ`, info.elements > b.nodes && `узлов ${info.elements} больше ${b.nodes}`].filter(Boolean).join(', ');
    line('WARN', path.basename(file), `${why} — бюджет ${b.name}: ${tips}${kind === 'background' ? '; для фона такого веса лучше растровый пререндер (WebP)' : kind === 'icon' ? '; или считать украшением (--for decor)' : '; или считать фоном (--for background)'}`);
  }
  const bg = previewBg();
  if (bg && !quiet) await writePreview(text, file.replace(/\.svg$/i, '.png'), bg);
  return rec;
}

async function writePreview(text, file, bg, width = null) {
  const sh = getSharp(); if (!sh) { line('WARN', 'превью', 'нет sharp — PNG не построен: npm i sharp --prefix ~/.claude/site-rework'); return null; }
  const { previewPng } = await import('./svg3d/preview.mjs');
  try {
    const p = await previewPng(sh, text, file, { bg, width: width || numOpt('width', 480, { min: 32, max: 4000 }), color: opt.color != null ? colorOpt('color') : null });
    console.log(`     превью: ${p.file} (${p.width}×${p.height}, рисунок занимает ${Math.round(p.ink * 100)}% поля)`);
    if (p.ink < 0.003) line('FAIL', path.basename(file), 'превью пустое: рисунок не виден на этом фоне (цвет совпал с фоном или сцена пуста)');
    return p;
  } catch (e) { line('WARN', 'превью', String(e.message).split('\n')[0]); return null; }
}

function finish() {
  if (opt.json && opt.json !== true) writeJson(String(opt.json), { ...report, verdict: fails ? 'FAIL' : warns ? 'WARN' : 'OK' });
  console.log(`\n${fails ? 'FAIL' : warns ? 'WARN' : 'OK'}: файлов ${report.files.length}, провалов ${fails}, предупреждений ${warns}`);
  process.exit(fails ? 1 : 0);
}

const kindOpt = (def) => oneOf('for', Object.keys(BUDGET), def);
const rotateOpt = () => { if (opt.rotate == null) return [0, 0, 0]; const r = String(opt.rotate).split(',').map(Number); if (r.length > 3 || r.some((v) => !Number.isFinite(v))) die(`--rotate ${opt.rotate}: нужно x,y,z в градусах (например -20,35,0)`); return [r[0] || 0, r[1] || 0, r[2] || 0]; };

/* ---------------- команды ---------------- */
const cmd = pos.shift();
if (!COMMANDS.includes(cmd)) die(`Не знаю команду «${cmd}»: есть ${COMMANDS.join(', ')} (--help)`);

if (cmd === 'selftest') { const { selftest } = await import('./svg3d/selftest.mjs'); process.exit(await selftest({ keep: !!opt.keep })); }

if (cmd === 'doctor') {
  const { doctor } = await import('./svg3d/doctor.mjs');
  const d = await doctor();
  console.log(`Стек «3D SVG» — ${os.platform()} ${os.arch()}, Node ${process.version}\n`);
  for (const i of d.items) {
    console.log(`${(i.ok ? 'OK' : i.core ? 'FAIL' : 'нет').padEnd(4)} ${i.name.padEnd(38)} ${i.detail}`);
    if (!i.ok) { console.log(`     чем грозит: ${i.impact}`); console.log(`     что сделать: ${i.fix}`); }
  }
  const cmds = { zdog: ['chrome', 'zdog'], three: ['chrome', 'three'], cad: ['cadquery'], trace: ['vtracer'], rough: ['roughjs'], icon: ['iconify'], blender: ['blender'] };
  const okId = new Set(d.items.filter((i) => i.ok).map((i) => i.id));
  console.log(`\nКоманды: ${Object.entries(cmds).map(([c, needs]) => `${c} — ${needs.every((n) => okId.has(n)) ? 'работает' : 'НЕТ'}`).join('; ')}; optimize, preview, sheet, scatter — ${d.core ? 'работают' : 'НЕТ'}`);
  if (opt.json && opt.json !== true) writeJson(String(opt.json), d);
  console.log(`\n${d.core ? 'OK' : 'FAIL'}: ${d.items.filter((i) => i.ok).length} из ${d.items.length} на месте${d.core ? '' : ' — нет обязательного (SVGO, sharp)'}`);
  process.exit(d.core ? 0 : 1);
}

if (cmd === 'zdog' || cmd === 'three') {
  const scene = need(pos[0], 'сцена.mjs'); const name = path.basename(scene).replace(/\.[^.]+$/, '');
  const palette = paletteOpt(); const size = sizeOpt(); const frames = numOpt('frames', 1, { min: 1, max: 120, int: true });
  const axis = oneOf('axis', ['x', 'y', 'z'], 'y'); const kind = kindOpt('decor');
  const precision = numOpt('precision', cmd === 'three' ? 1 : 2, { min: 0, max: 4, int: true });
  const D = await import('./svg3d/deps.mjs');
  if (!D.moduleDir(cmd === 'zdog' ? 'zdog' : 'three')) die(`НЕ СДЕЛАНО: нет пакета ${cmd === 'zdog' ? 'zdog' : 'three'} — npm i zdog three --prefix ~/.claude/site-rework (node svg3d.mjs doctor)`, 2);
  const R = await import('./svg3d/render.mjs');
  const base = { rotate: rotateOpt(), frames, axis, palette, width: size ? size[0] : null, height: size ? size[1] : null };
  let docs, viewBox, full = palette; const notes = [];
  console.log(`${cmd} ${path.basename(scene)}${frames > 1 ? ` · кадров ${frames} вокруг ${axis}` : ''}`);
  try {
    if (cmd === 'zdog') {
      const data = await R.runZdog(scene, { ...base, zoom: numOpt('zoom', 1, { min: 0.05, max: 50 }) });
      const unknown = Object.keys(palette).filter((k) => !data.known.includes(k));
      if (unknown.length) line('WARN', 'палитра', `сцена не объявляет цвет ${unknown.map((k) => `«${k}»`).join(', ')} (в ней: ${data.known.join(', ') || 'палитры нет'}) — проверьте имя`);
      const shapes = data.frames[0].paths.length; let culled = 0;
      if (getSharp() && !opt['no-cull']) culled = await R.cullHidden(getSharp(), data);
      if (getSharp()) await R.measureZdog(getSharp(), data);
      const b = R.buildZdog(data, { fit: !!opt.fit, pad: numOpt('pad', 4, { min: 0 }), precision });
      docs = b.docs; viewBox = b.viewBox; full = data.palette;
      if (b.clipped > 0.5) line('WARN', name, `рисунок выходит за поле на ${Math.round(b.clipped)} ед. и будет обрезан: --fit, больше --size или меньше --zoom`);
      if (!shapes) line('FAIL', name, 'сцена ничего не нарисовала: фигуры добавляются в illo (addTo: illo)');
      notes.push(`Zdog ${D.version('zdog') || ''}: фигур ${shapes}${culled ? `, из них закрытых целиком и убранных — ${frames > 1 ? `${culled} по всем кадрам` : culled}` : ''}, рамка содержимого ${b.box ? b.box.map((v) => Math.round(v)).join(' ') : '—'}; порядок слоёв — по центру фигуры: крупные фигуры, проходящие друг сквозь друга, смотреть в кадрах (--frames 8 --preview)`);
    } else {
      const data = await R.runThree(scene, { ...base, pad: opt.pad != null ? numOpt('pad', 8, { min: 0 }) : null });
      const unknown = Object.keys(palette).filter((k) => !data.known.includes(k));
      if (unknown.length) line('WARN', 'палитра', `сцена не объявляет цвет ${unknown.map((k) => `«${k}»`).join(', ')} (в ней: ${data.known.join(', ') || 'палитры нет'}) — проверьте имя`);
      if (opt['css-vars']) line('WARN', '--css-vars', 'у three не действует: оттенок каждой грани считает свет, переменной его не задать — другой цвет даёт повторный запуск с --palette');
      const b = R.buildThree(data, { precision, seam: numOpt('seam', 1, { min: 0, max: 4 }), merge: !opt['no-merge'], sort: !opt['no-sort'], tones: numOpt('tones', 0, { min: 0, max: 16, int: true }) });
      docs = b.docs; viewBox = data.viewBox;
      const st = b.stats[0]; const worst = b.stats.reduce((a, s) => (s.crossing + s.cycles > a.crossing + a.cycles ? s : a), st);
      if (!st.faces) line('FAIL', name, 'сцена ничего не нарисовала: предметы кладутся в root, материал — MeshLambertMaterial или MeshBasicMaterial');
      notes.push(`Three r${data.three}, камера ${data.camera === 'ortho' ? 'без перспективы' : 'с перспективой'}: граней ${st.faces} → контуров ${st.paths}, оттенков ${st.colors}${st.sorted ? `; порядок граней исправлен в ${st.fixed} парах из ${st.pairs} перекрывающихся${st.split ? `, ${st.split} граней, проходивших сквозь другие, разрезаны по линии пересечения` : ''}` : opt['no-sort'] ? '; порядок граней — как у SVGRenderer' : ''}`);
      if (worst.unfixed || st.unfixed) line('WARN', 'сортировка глубины', `порядок «по центру грани» неверен в ${Math.max(worst.unfixed || 0, st.unfixed || 0)} парах перекрывающихся граней — возможны артефакты${opt['no-sort'] ? ': убрать --no-sort' : ' (в сцене линии или спрайты — с ними порядок не исправляется)'}`);
      if (b.stats.some((s) => !s.matched)) line('WARN', name, 'глубину граней сопоставить не удалось — порядок оставлен как у SVGRenderer (по центру грани): возможны перекрытия не в том порядке, смотреть превью');
      if (worst.crossing || worst.cycles) line('WARN', 'сортировка глубины', `${worst.crossing ? `грани пересекаются (${worst.crossing} пар, ≈ ${Math.max(1, Math.round(worst.crossShare * 100))}% площади)${opt['no-sort'] ? '' : ' и после разрезания'}` : 'грани'}${worst.cycles ? `${worst.crossing ? ', и' : ''} перекрываются по кругу (${worst.cycles})` : ''} — возможны артефакты: развести предметы, чтобы они не проходили друг сквозь друга, или разбить длинные грани; смотреть превью`);
    }
  } catch (e) { die(`FAIL ${cmd}: ${e.message}`); }
  if (fails) finish();
  const useVars = !!opt['css-vars'] && cmd === 'zdog';
  const tips = cmd === 'three' ? 'меньше оттенков (--tones 3–4: соседние грани склеятся), меньше сегментов у круглых тел, меньше предметов' : 'меньше фигур в сцене';
  if (frames > 1 && opt.sprite) {
    await needSvgo();
    const inners = docs.map((d, i) => innerOf(cleanSvg(svgo, d, { precision, idPrefix: `${slug(name)}${i}` }).data));
    await emit(R.spriteStrip(inners, viewBox), target(`${name}-sprite${frames}`), { kind, precision, palette: full, vars: useVars, notes: [...notes, `лента ${frames} кадров: кадр ${viewBox[2]}×${viewBox[3]}, шаг ${viewBox[2]} — animation: … steps(${frames}) или background-position`], mergePaths: false });
  } else {
    const files = [];
    for (let i = 0; i < docs.length; i++) {
      const f = frames > 1 ? `${target(name).replace(/\.svg$/i, '')}-${String(i + 1).padStart(2, '0')}.svg` : target(name);
      const rec = await emit(docs[i], f, { kind, precision, palette: full, vars: useVars, notes: i === 0 ? notes : [], quiet: frames > 1 && i > 0, tips });
      if (rec) files.push(f);
    }
    if (frames > 1) {
      console.log(`     … всего кадров ${files.length}: ${path.basename(files[0])} … ${path.basename(files[files.length - 1])}`);
      const bg = previewBg();
      if (bg && getSharp()) { const { sheetPng } = await import('./svg3d/preview.mjs'); const s = await sheetPng(getSharp(), files.map((f) => ({ text: fs.readFileSync(f, 'utf8'), label: path.basename(f) })), path.join(path.dirname(files[0]), `${name}-frames.png`), { bg, cols: Math.min(frames, 6), cell: 180 }); console.log(`     лист кадров: ${s.file}`); }
    }
  }
  finish();
}

if (cmd === 'cad') {
  const C = await import('./svg3d/cad.mjs');
  const src = pos[0]; if (!src) die(`Нужно: node svg3d.mjs cad <файл.py | ${Object.keys(C.BUILTIN).join(' | ')}>`);
  const builtin = C.BUILTIN[src] ? src : null;
  if (!builtin && !fs.existsSync(src)) die(`Нет файла «${src}» и встроенной фигуры с таким именем нет (есть: ${Object.entries(C.BUILTIN).map(([k, v]) => `${k} — ${v}`).join('; ')})`);
  const views = listOfViews(C.VIEWS);
  const params = {}; for (const p of listOf(str(opt.param) || '')) { const m = /^([A-Za-z_]\w*)=(.+)$/.exec(p); if (!m) die(`--param: «${p}» — нужна запись имя=значение`); params[m[1]] = Number.isFinite(Number(m[2])) ? Number(m[2]) : m[2]; }
  const py = C.findPython();
  if (!py.cmd) die(`НЕ СДЕЛАНО: Python с cadquery не найден (${(py.tried || []).join('; ')}). Поставить: pip install cadquery в Python 3.9–3.12 или указать интерпретатор в SVG3D_PYTHON. Чертёжный вид без CadQuery не делается; гранёный предмет — node svg3d.mjs three`, 2);
  const name = builtin || path.basename(src).replace(/\.[^.]+$/, '');
  console.log(`cad ${builtin ? `встроенная фигура «${builtin}»` : path.basename(src)} · виды: ${views.map((v) => v.name).join(', ')} · ${py.cmd.join(' ')} (cadquery ${py.cadquery})`);
  const size = sizeOpt([480, 0])[0];
  let res = C.runCad(py, builtin ? { builtin } : { script: src }, { views, params, deflection: 0.08 / size });
  if (!res.ok && res.code === 3 && py.cached) { const fresh = C.findPython({ fresh: true }); if (fresh.cmd) res = C.runCad(fresh, builtin ? { builtin } : { script: src }, { views, params, deflection: 0.08 / size }); }
  if (!res.ok) die(`${res.code === 3 ? 'НЕ СДЕЛАНО' : 'FAIL'} cad: ${res.error}`, res.code === 3 || res.code === 2 ? 2 : 1);
  const draw = !!opt.draw; const hidden = oneOf('hidden', ['dashed', 'faint', 'none'], 'dashed');
  const cadPrec = numOpt('precision', 1, { min: 0, max: 4, int: true });
  const b = C.buildCad(res.views, { size, stroke: numOpt('stroke', 1.2, { min: 0.1, max: 20 }), hidden, color: opt.color != null ? colorOpt('color') : 'currentColor', precision: cadPrec + 1, draw });
  const notes = [`линий: видимые ${b.counts.sharp + b.counts.outline}, плавные переходы ${b.counts.smooth}, скрытые ${hidden === 'none' ? 'не рисуются' : b.counts.hidden} · поле ${b.width}×${b.height} · модель ${res.size.map((v) => Math.round(v * 10) / 10).join(' × ')}`];
  if (draw) notes.push('прорисовка линией: каждому контуру pathLength="1" — класс .dk-draw и data-dk-draw (templates/decor-kit); скрытые линии без пунктира');
  await emit(b.doc, target(name), { kind: kindOpt('decor'), precision: cadPrec, notes, mergePaths: !draw, tips: 'скрытые линии бледными или без них (--hidden faint | none), меньше мелких деталей в модели, один вид вместо нескольких' });
  finish();
}
function listOfViews(VIEWS) {
  return listOfViewNames(str(opt.view) || 'iso').map((v) => {
    if (VIEWS[v]) return { name: v, dir: VIEWS[v] };
    const d = v.split(/[ ;]/).join(',').split(',').map(Number);
    if (d.length === 3 && d.every(Number.isFinite) && d.some((x) => x)) return { name: v, dir: d };
    return die(`--view ${v}: нужно ${Object.keys(VIEWS).join(' | ')} или направление "1,-1,0.8"`);
  });
}
/* «iso,front» — два вида; «1,-1,0.8» — одно направление; «iso,1,-1,0.8» — вид и направление */
function listOfViewNames(s) {
  const parts = listOf(s); const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (/^-?[\d.]+$/.test(parts[i])) { out.push(parts.slice(i, i + 3).join(',')); i += 2; } else out.push(parts[i]);
  }
  return out;
}

if (cmd === 'trace') {
  const file = need(pos[0], 'картинка'); const sh = getSharp(); if (!sh) die('НЕ СДЕЛАНО: нет sharp — npm i sharp --prefix ~/.claude/site-rework', 2);
  const T = await import('./svg3d/tools.mjs');
  const mono = !!opt.mono; const engine = oneOf('engine', ['vtracer', 'potrace'], null);
  console.log(`trace ${path.basename(file)} · ${mono ? 'один цвет' : `цветов ${numOpt('colors', 6, { min: 2, max: 64, int: true })}`}`);
  let r;
  try { r = await T.traceImage(sh, file, { colors: numOpt('colors', 6, { min: 2, max: 64, int: true }), simplify: numOpt('simplify', 4, { min: 0, max: 10 }), mono, engine, maxSize: numOpt('max-size', 1024, { min: 16, max: 8192, int: true }), color: colorOpt('color', '#16301f'), threshold: numOpt('threshold', 128, { min: 0, max: 255 }), palette: paletteOpt(), dropBg: !!opt['drop-bg'] }); } catch (e) { die(`${/нет пакета/.test(e.message) ? 'НЕ СДЕЛАНО' : 'FAIL'} trace: ${e.message}`, /нет пакета/.test(e.message) ? 2 : 1); }
  const notes = [`движок ${r.engine}, поле ${r.width}×${r.height}${r.note ? ` · ${r.note}` : ''}`];
  await emit(r.svg, target(T.baseName(file)), { kind: kindOpt('decor'), precision: numOpt('precision', 1, { min: 0, max: 4, int: true }), palette: paletteOpt(), vars: !!opt['css-vars'], notes, tips: 'меньше цветов (--colors), грубее (--simplify), меньше исходник (--max-size)' });
  finish();
}

if (cmd === 'rough') {
  const file = need(pos[0], 'svg'); await needSvgo();
  const T = await import('./svg3d/tools.mjs');
  const seed = numOpt('seed', 7, { int: true });
  console.log(`rough ${path.basename(file)} · seed ${seed}`);
  let r;
  try { r = T.roughen(svgo, fs.readFileSync(file, 'utf8'), { seed, roughness: numOpt('roughness', 1, { min: 0, max: 10 }), bowing: numOpt('bowing', 1, { min: 0, max: 20 }), fillStyle: oneOf('fill-style', ['hachure', 'solid', 'zigzag', 'cross-hatch', 'dots', 'none'], 'hachure'), hachureGap: opt['hachure-gap'] != null ? numOpt('hachure-gap', 4, { min: 0.2 }) : null, stroke: opt.ink != null ? colorOpt('ink') : null, paper: opt.paper != null ? colorOpt('paper') : null, single: !!opt['single-stroke'], strokeWidth: opt['stroke-width'] != null ? numOpt('stroke-width', 1, { min: 0.05 }) : null }); } catch (e) { die(`${/нет пакета/.test(e.message) ? 'НЕ СДЕЛАНО' : 'FAIL'} rough: ${String(e.reason || e.message).split('\n')[0]}`, /нет пакета/.test(e.message) ? 2 : 1); }
  if (!r.shapes) line('FAIL', path.basename(file), 'в SVG нет фигур с заливкой или обводкой — нечего перерисовывать');
  else {
    if (r.thick) line('WARN', path.basename(file), `у ${r.thick} фигур толстая обводка (так рисует Zdog: шар — точка, бок цилиндра — отрезок) — rough перерисует её тонкой линией, и форма поплывёт; для Zdog вариант «от руки» не годится, брать three, cad или обычный контурный SVG`);
    await emit(r.svg, target(`${T.baseName(file)}-rough`), { kind: kindOpt('decor'), precision: numOpt('precision', 1, { min: 0, max: 4, int: true }), palette: paletteOpt(), vars: !!opt['css-vars'], notes: [`фигур ${r.shapes}; вид другой нарочно — сверка «до и после» не делается`], mergePaths: false, compare: false, tips: 'реже штриховка (--hachure-gap), --single-stroke, --fill-style solid' });
  }
  finish();
}

if (cmd === 'icon') {
  const T = await import('./svg3d/tools.mjs');
  const limit = numOpt('limit', 24, { min: 1, max: 200, int: true });
  if (opt.search != null) {
    const q = str(opt.search); if (!q) die('--search без слова: --search leaf');
    let r; try { r = await T.searchIcons(q, { prefixes: opt.set != null ? listOf(str(opt.set) || '') : null, limit }); } catch (e) { die(`НЕ СДЕЛАНО: Iconify недоступен — ${e.message}`, 2); }
    console.log(`icon --search ${q}: найдено ${r.total}, показано ${r.icons.length}`);
    const sets = new Map();
    for (const id of r.icons) { const [p] = id.split(':'); if (!sets.has(p)) sets.set(p, []); sets.get(p).push(id); }
    for (const [p, ids] of sets) {
      const info = r.collections[p] || {}; const v = T.licenseVerdict(info.license);
      console.log(`  ${p} — ${info.name || '?'}, ${(info.license && (info.license.spdx || info.license.title)) || 'лицензия не указана'} [${v.level === 'ok' ? 'можно' : v.level === 'refuse' ? 'не берём' : 'нужна подпись'}]`);
      console.log(`    ${ids.join('  ')}`);
    }
    if (!r.icons.length) line('WARN', 'поиск', 'ничего не найдено: слово — по-английски (leaf, gift, cup), набор — в --set');
    else if (opt.preview != null && getSharp()) {
      await needSvgo(); const { sheetPng } = await import('./svg3d/preview.mjs'); const entries = [];
      for (const id of r.icons) { const [p, n] = id.split(':'); try { const ic = await T.fetchIcon(p, n); entries.push({ text: cleanSvg(svgo, ic.text, { idPrefix: 'i' }).data, label: id }); } catch { /* одна иконка не скачалась — лист без неё */ } }
      const f = target(`icons-${slug(q)}`, '.png'); const s = await sheetPng(getSharp(), entries, f, { bg: previewBg(), cols: numOpt('cols', 6, { min: 1, max: 12, int: true }), cell: numOpt('cell', 120, { min: 32, max: 600, int: true }), color: opt.color != null ? colorOpt('color') : null });
      console.log(`  лист: ${s.file} (${s.count} иконок) — открыть глазами и выбрать`);
    }
    finish();
  }
  if (!pos.length) die('Нужно: node svg3d.mjs icon <набор:имя>… --out <папка сайта>   или   icon --search <слово>');
  if (!str(opt.out)) die('icon: нужен --out <папка картинок сайта> — рядом ляжет credits.json с лицензией набора');
  await needSvgo();
  const { saveCredit, readCredits, creditsTarget, creditNeed } = await import('./media/manifest.mjs');
  const dest = outDir(); let refused = 0;
  for (const id of pos) {
    const m = /^([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)$/i.exec(id);
    if (!m) { line('FAIL', id, 'нужна запись набор:имя, например lucide:leaf'); continue; }
    const [, prefix, name] = m;
    let info, ic;
    try { info = await T.collectionInfo(prefix); if (!info) { line('FAIL', id, `набора «${prefix}» в Iconify нет (поиск: icon --search <слово>)`); continue; } } catch (e) { die(`НЕ СДЕЛАНО: Iconify недоступен — ${e.message}`, 2); }
    const v = T.licenseVerdict(info.license);
    const licName = (info.license && (info.license.spdx || info.license.title)) || 'не указана';
    if (v.level === 'refuse') { refused++; console.log(`НЕ ВЗЯТО ${id}: ${v.why}`); continue; }
    if (v.level !== 'ok' && !opt['allow-attribution']) { refused++; console.log(`НЕ ВЗЯТО ${id}: ${v.why}. Либо иконка из набора без подписи (MIT, ISC, Apache-2.0, CC0), либо осознанно: --allow-attribution — подпись в подвал поставит media.mjs credits`); continue; }
    try { ic = await T.fetchIcon(prefix, name); } catch (e) { line('FAIL', id, e.message); continue; }
    let raw = ic.text;
    if (opt['stroke-width'] != null) { const sw = numOpt('stroke-width', 1.5, { min: 0.1, max: 20 }); if (/stroke-width=/.test(raw)) raw = raw.replace(/stroke-width="[^"]*"/g, `stroke-width="${sw}"`); else line('WARN', id, 'набор не контурный (в иконке нет stroke-width) — --stroke-width не применён'); }
    const fileName = `${prefix}-${name}.svg`; const file = path.join(dest, fileName);
    console.log(`icon ${id} · ${info.name}, ${licName}`);
    const rec = await emit(raw, file, { kind: 'icon', precision: numOpt('precision', 2, { min: 0, max: 4, int: true }) });
    if (!rec) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!/currentColor/.test(text)) line('WARN', id, `цвет иконки задан жёстко (набор ${info.palette ? 'цветной' : 'без currentColor'}) — цветом текста она краситься не будет`);
    const author = (info.author && info.author.name) || info.name;
    const credit = {
      name: fileName, kind: 'icon', role: 'icon', source: 'iconify', source_id: `${prefix}:${name}`, title: `${info.name}: ${name}`,
      page_url: `https://icon-sets.iconify.design/${prefix}/${name}/`, file_url: ic.url,
      author, author_url: (info.author && info.author.url) || '', license: (info.license && info.license.title) || licName, license_code: (info.license && info.license.spdx) || '', license_url: (info.license && info.license.url) || '',
      attribution_required: v.level !== 'ok', attribution_text: `«${name}» — ${author}, набор ${info.name}, ${licName} (https://icon-sets.iconify.design/${prefix}/${name}/)`,
      ...(v.level === 'share-alike' ? { share_alike: true } : {}),
      credit_need: '', changes: `Изменено: очищено SVGO${opt['stroke-width'] != null ? `; толщина линии ${opt['stroke-width']}` : ''}.`,
      seen: `иконка «${name}» из набора ${info.name}`, caption: str(opt.caption) || 'иконка', hotlink: false, date: new Date().toLocaleDateString('sv-SE'),
    };
    credit.credit_need = creditNeed(credit);
    saveCredit(dest, credit);
    console.log(`     лицензия: ${licName} — ${v.why}`);
    if (v.level !== 'ok') line('WARN', id, `подпись на сайте обязательна: ${credit.attribution_text} — node media.mjs credits ${dest} --md <сайт>/CREDITS.md даст строку для подвала`);
  }
  if (report.files.length) console.log(`     credits: ${creditsTarget(dest).file} — записей ${readCredits(dest).length}`);
  if (refused && !report.files.length && !fails) { console.log(`\nНЕ СДЕЛАНО: ни одна иконка не взята (отказов по лицензии: ${refused})`); process.exit(2); }
  finish();
}

if (cmd === 'scatter') {
  if (!pos.length) die('Нужно: node svg3d.mjs scatter <svg>… --out фон.svg');
  await needSvgo(); const T = await import('./svg3d/tools.mjs');
  const files = expandSvg(pos); const size = sizeOpt([1440, 600]);
  const sc = String(opt.scale || '0.6,1.15').split(',').map(Number); if (sc.length !== 2 || sc.some((v) => !(v > 0)) || sc[0] > sc[1]) die(`--scale ${opt.scale}: нужно "мин,макс", например 0.6,1.15`);
  console.log(`scatter ${files.length} рисунков → поле ${size[0]}×${size[1]}`);
  let r; try { r = T.scatter(svgo, files.map((f) => ({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') })), { width: size[0], height: size[1], count: numOpt('count', 14, { min: 1, max: 400, int: true }), seed: numOpt('seed', 7, { int: true }), item: numOpt('item', 120, { min: 4 }), scale: sc, tilt: numOpt('tilt', 24, { min: 0, max: 180 }), area: oneOf('area', ['full', 'edges', 'left', 'right'], 'full'), band: opt.band != null ? numOpt('band', 0.18, { min: 0.05, max: 1 }) : null, opacity: numOpt('opacity', 1, { min: 0.01, max: 1 }) }); } catch (e) { die(`FAIL scatter: ${String(e.reason || e.message).split('\n')[0]}`); }
  await emit(r.svg, target('scatter'), { kind: kindOpt('background'), precision: numOpt('precision', 2, { min: 0, max: 4, int: true }), palette: paletteOpt(), vars: !!opt['css-vars'], notes: [`предметов ${r.placed} из ${r.symbols} рисунков (каждый описан один раз, <use>); как фон: preserveAspectRatio="xMidYMid slice" — заполняет блок без искажения`], mergePaths: false });
  finish();
}
function expandSvg(list) {
  const out = [];
  for (const p of list) {
    if (!fs.existsSync(p)) die(`Нет файла или папки: ${p}`);
    if (fs.statSync(p).isDirectory()) out.push(...fs.readdirSync(p).filter((f) => /\.svg$/i.test(f)).sort().map((f) => path.join(p, f)));
    else out.push(path.resolve(p));
  }
  if (!out.length) die('Не найдено ни одного .svg');
  return out;
}

if (cmd === 'optimize') {
  if (!pos.length) die('Нужно: node svg3d.mjs optimize <svg>… [--out файл|папка]');
  const files = expandSvg(pos); const single = files.length === 1;
  if (!single && str(opt.out) && path.extname(str(opt.out)).toLowerCase() === '.svg') die('Несколько файлов — --out должен быть папкой');
  for (const f of files) {
    console.log(`optimize ${path.basename(f)}`);
    const name = path.basename(f).replace(/\.svg$/i, '');
    /* без --out — рядом, с «.min»: исходник не затирается */
    const out = str(opt.out) ? target(name) : path.join(path.dirname(f), `${name}.min.svg`);
    await emit(fs.readFileSync(f, 'utf8'), out, { kind: kindOpt('decor'), precision: numOpt('precision', 2, { min: 0, max: 4, int: true }), palette: paletteOpt(), vars: !!opt['css-vars'] });
  }
  finish();
}

if (cmd === 'preview') {
  if (!pos.length) die('Нужно: node svg3d.mjs preview <svg>… [--out файл.png|папка] [--bg "#E9EEDD"]');
  if (!getSharp()) die('НЕ СДЕЛАНО: нет sharp — npm i sharp --prefix ~/.claude/site-rework', 2);
  const files = expandSvg(pos); const bg = colorOpt('bg', '#ffffff');
  if (files.length > 1 && str(opt.out) && path.extname(str(opt.out)).toLowerCase() === '.png') die('Несколько файлов — --out должен быть папкой (или один лист: node svg3d.mjs sheet)');
  for (const f of files) {
    console.log(`preview ${path.basename(f)} на ${bg}`);
    const out = str(opt.out) ? target(path.basename(f).replace(/\.svg$/i, ''), '.png') : f.replace(/\.svg$/i, '.png');
    const p = await writePreview(fs.readFileSync(f, 'utf8'), out, bg);
    if (p) report.files.push({ file: p.file, ink: p.ink });
  }
  finish();
}

if (cmd === 'sheet') {
  if (!pos.length) die('Нужно: node svg3d.mjs sheet <svg|папка>… --out лист.png');
  if (!getSharp()) die('НЕ СДЕЛАНО: нет sharp — npm i sharp --prefix ~/.claude/site-rework', 2);
  const files = expandSvg(pos); const bg = colorOpt('bg', '#ffffff');
  const { sheetPng } = await import('./svg3d/preview.mjs');
  const out = target('sheet', '.png');
  const s = await sheetPng(getSharp(), files.map((f) => ({ text: fs.readFileSync(f, 'utf8'), label: path.basename(f) })), out, { bg, cols: numOpt('cols', 4, { min: 1, max: 12, int: true }), cell: numOpt('cell', 220, { min: 32, max: 1200, int: true }), color: opt.color != null ? colorOpt('color') : null });
  console.log(`sheet: ${s.file} — ${s.count} рисунков, ${s.width}×${s.height}, фон ${bg}`);
  report.files.push({ file: s.file });
  finish();
}

if (cmd === 'blender') {
  const { findBlender } = await import('./svg3d/doctor.mjs');
  const bl = findBlender();
  if (!bl) die('НЕ СДЕЛАНО: Blender не установлен (нет в PATH, в Program Files и в BLENDER_PATH). Скрипт его не ставит: blender.org → установить → повторить (или BLENDER_PATH=<путь к blender>). Без Blender: чертёжные линии модели — node svg3d.mjs cad; гранёный предмет — node svg3d.mjs three; готовый рендер в вектор — node svg3d.mjs trace', 2);
  const file = need(pos[0], 'файл.blend');
  const { spawnSync } = await import('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svg3d-blender-'));
  console.log(`blender ${path.basename(file)} · ${bl}`);
  const r = spawnSync(bl, ['-b', file, '--python', path.join(path.dirname(fileURLToPath(import.meta.url)), 'svg3d', 'blender_freestyle.py'), '--', '--out', tmp], { encoding: 'utf8', timeout: 600000, windowsHide: true });
  const outText = `${r.stdout || ''}${r.stderr || ''}`;
  const ok = /SVG3D-OK: (.+)/.exec(outText); const err = /SVG3D-ERROR: (.+)/.exec(outText);
  if (!ok) die(`FAIL blender: ${err ? err[1].trim() : `код ${r.status}: ${outText.trim().split(/\r?\n/).slice(-2).join(' · ').slice(0, 300)}`}`);
  line('WARN', 'blender', 'ветка не проверялась при разработке (Blender не было): результат открыть глазами (--preview)');
  await emit(fs.readFileSync(decodeURIComponent(ok[1].trim()), 'utf8'), target(path.basename(file).replace(/\.[^.]+$/, '')), { kind: kindOpt('decor'), precision: numOpt('precision', 2, { min: 0, max: 4, int: true }) });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* временная папка */ }
  finish();
}
