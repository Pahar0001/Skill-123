/**
 * Утилиты стека: растр → вектор (vtracer, potrace), «от руки» (Rough.js), иконки Iconify, россыпь для фона.
 */
import fs from 'node:fs';
import path from 'node:path';
import { requireFrom, loadError } from './deps.mjs';
import { normHex, hexRgb, innerOf, parseViewBox, num, attrs, svgDoc, cleanSvg } from './svg.mjs';

/* одинаковый шум при каждом запуске (mulberry32) */
export function rng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------------- растр → вектор ---------------- */

/**
 * Картинка → SVG. engine: 'vtracer' (цвет и одноцветно) | 'potrace' (только одноцветно, плавнее линия).
 *   colors — число цветов (картинка заранее сводится к палитре — ровные пятна вместо «ряби»)
 *   simplify 0…10 — насколько грубо: мелкие пятна выбрасываются, кривые короче
 *   mono — одним цветом color; threshold — порог яркости 0…255
 *   palette — { имя: '#hex' }: цвета результата притягиваются к ближайшим цветам палитры
 *   dropBg — убрать фон (цвет четырёх углов картинки), если он лёг нижним слоем
 * → { svg, engine, width, height, note }
 */
export async function traceImage(sharp, file, { colors = 6, simplify = 4, mono = false, engine = null, maxSize = 1024, color = '#16301f', threshold = 128, palette = null, dropBg = false } = {}) {
  const meta = await sharp(file).metadata();
  const k = Math.min(1, maxSize / Math.max(meta.width, meta.height));
  const w = Math.max(1, Math.round(meta.width * k)), h = Math.max(1, Math.round(meta.height * k));
  const eng = engine || (mono && requireFrom('potrace') ? 'potrace' : 'vtracer');
  let note = k < 1 ? `уменьшена до ${w}×${h} перед трассировкой` : '';
  if (eng === 'potrace') {
    if (!mono) throw new Error('potrace трассирует только в один цвет: добавьте --mono или уберите --engine potrace');
    const potrace = requireFrom('potrace'); if (!potrace) throw new Error(`нет пакета potrace (${loadError('potrace') || 'не установлен'}): npm i potrace --prefix ~/.claude/site-rework — или --engine vtracer`);
    const png = await sharp(file).resize(w, h).flatten({ background: '#ffffff' }).png().toBuffer();
    const svg = await new Promise((resolve, reject) => potrace.trace(png, { threshold, turdSize: Math.round(2 + simplify * 2), optTolerance: 0.2 + simplify * 0.06, color, background: 'transparent' }, (err, out) => (err ? reject(err) : resolve(out))));
    return { svg, engine: eng, width: w, height: h, note };
  }
  const vt = requireFrom('@neplex/vectorizer'); if (!vt) throw new Error(`нет пакета @neplex/vectorizer (${loadError('@neplex/vectorizer') || 'не установлен'}): npm i @neplex/vectorizer --prefix ~/.claude/site-rework`);
  let img = sharp(file).resize(w, h);
  let buf;
  if (mono) {
    /* чёрное по белому: всё темнее порога — рисунок; прозрачное — фон */
    buf = await img.flatten({ background: '#ffffff' }).grayscale().threshold(threshold).png().toBuffer();
  } else {
    /* сначала — к палитре из N цветов без размытия: трассировщик получает ровные пятна */
    buf = await img.png({ palette: true, colours: Math.max(2, Math.min(64, colors)), dither: 0, effort: 10 }).toBuffer();
  }
  const svgRaw = await vt.vectorize(buf, {
    colorMode: mono ? vt.ColorMode.Binary : vt.ColorMode.Color,
    hierarchical: vt.Hierarchical.Stacked,
    filterSpeckle: Math.round(1 + simplify * 1.5), colorPrecision: 8, layerDifference: mono ? 16 : 8,
    mode: vt.PathSimplifyMode.Spline, cornerThreshold: 60, lengthThreshold: 3 + simplify * 0.7, maxIterations: 10, spliceThreshold: 45, pathPrecision: 2,
  });
  let svg = String(svgRaw);
  if (dropBg && !mono) {
    /* фон — цвет углов картинки: его пятно, если оно идёт первым (нижний слой), убирается */
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => { const o = (y * info.width + x) * 4; return data[o + 3] < 128 ? null : '#' + [0, 1, 2].map((k) => data[o + k].toString(16).padStart(2, '0')).join(''); };
    const corners = [at(0, 0), at(info.width - 1, 0), at(0, info.height - 1), at(info.width - 1, info.height - 1)];
    const first = /<path[^>]*fill="(#[0-9a-fA-F]{6})"[^>]*\/>/.exec(svg);
    /* трассировщик усредняет цвет пятна: сверяем с допуском */
    const near = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return !!x && !!y && Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2])) <= 12; };
    if (corners[0] && corners.every((c) => c === corners[0]) && first && near(first[1], corners[0])) { svg = svg.replace(first[0], ''); note += `${note ? '; ' : ''}фон ${corners[0]} убран`; }
    else note += `${note ? '; ' : ''}фон не убран: углы картинки разного цвета или фон не нижним слоем`;
  }
  if (mono) svg = svg.replace(/fill="#000000"/gi, `fill="${normHex(color) || '#16301f'}"`).replace(/<path[^>]*fill="#ffffff"[^>]*\/>/gi, '');
  if (palette && Object.keys(palette).length && !mono) {
    const pal = Object.values(palette).map((hx) => ({ hx: normHex(hx), rgb: hexRgb(hx) })).filter((p) => p.rgb);
    svg = svg.replace(/fill="(#[0-9a-fA-F]{6})"/g, (all, hx) => { const c = hexRgb(hx); let best = null, bd = Infinity; for (const p of pal) { const d = (p.rgb[0] - c[0]) ** 2 + (p.rgb[1] - c[1]) ** 2 + (p.rgb[2] - c[2]) ** 2; if (d < bd) { bd = d; best = p; } } return `fill="${best.hx}"`; });
    note += `${note ? '; ' : ''}цвета притянуты к палитре (${pal.length})`;
  }
  return { svg, engine: eng, width: w, height: h, note };
}

/* ---------------- «от руки» ---------------- */

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline']);
const INHERIT = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity'];
const GEOM = ['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points'];
/* фигуры, которые SVGO оставил фигурами (прямоугольник со скруглением), — в контур */
function shapeToD(node) {
  const a = node.attributes; const n = (k) => Number(a[k]) || 0;
  if (node.name === 'rect') {
    const x = n('x'), y = n('y'), w = n('width'), h = n('height'); if (!(w > 0 && h > 0)) return null;
    let rx = a.rx != null ? n('rx') : n('ry'), ry = a.ry != null ? n('ry') : rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    if (!rx || !ry) return `M${x} ${y}h${w}v${h}h${-w}Z`;
    return `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
  }
  if (node.name === 'circle' || node.name === 'ellipse') {
    const cx = n('cx'), cy = n('cy'), rx = node.name === 'circle' ? n('r') : n('rx'), ry = node.name === 'circle' ? n('r') : n('ry'); if (!(rx > 0 && ry > 0)) return null;
    return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  }
  if (node.name === 'line') return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
  if (node.name === 'polygon' || node.name === 'polyline') { const p = String(a.points || '').trim().split(/[\s,]+/).map(Number); if (p.length < 4 || p.some((v) => !Number.isFinite(v))) return null; let d = ''; for (let i = 0; i + 1 < p.length; i += 2) d += `${i ? 'L' : 'M'}${p[i]} ${p[i + 1]}`; return d + (node.name === 'polygon' ? 'Z' : ''); }
  return null;
}
/**
 * SVG → вариант «нарисовано от руки» (Rough.js). Одинаковый --seed — побайтно тот же файл.
 *   roughness (1), bowing (1) — дрожание и изгиб линии; fillStyle — hachure | solid | zigzag | cross-hatch | dots | none
 *   hachureGap — шаг штриховки (по умолчанию от размера рисунка); stroke — цвет контура для всех фигур
 *   (у граней без своей обводки контур — цветом заливки); strokeWidth — толщина линии;
 *   paper — цвет фона страницы: подложка под штриховку, чтобы ближние фигуры закрывали дальние
 *   single — одна линия контура вместо двойной (вдвое легче, чуть суше)
 * → { svg, shapes, thick } (thick — фигур с толстой обводкой: Zdog; их вид rough не сохраняет)
 */
export function roughen(svgo, text, { seed = 7, roughness = 1, bowing = 1, fillStyle = 'hachure', hachureGap = null, stroke = null, strokeWidth = null, fillWeight = null, paper = null, single = false } = {}) {
  const rough = requireFrom('roughjs'); if (!rough) throw new Error(`нет пакета roughjs (${loadError('roughjs') || 'не установлен'}): npm i roughjs --prefix ~/.claude/site-rework`);
  const gen = (rough.default || rough).generator();
  /* фигуры → контуры, стили → атрибуты: дальше работаем только с <path d fill stroke> */
  const flat = svgo.optimize(String(text), { multipass: true, plugins: [
    { name: 'preset-default', params: { overrides: { convertShapeToPath: { convertArcs: true }, mergePaths: false, convertColors: { shortname: false }, cleanupIds: false, removeUselessStrokeAndFill: false } } },
    { name: 'convertStyleToAttrs' },
  ] }).data;
  const vb = parseViewBox((/<svg\b[^>]*\bviewBox="([^"]+)"/.exec(flat) || [])[1]);
  const span = vb ? Math.max(vb[2], vb[3]) : 100;
  const gap = hachureGap || Math.max(1.5, span / 45); const sw = strokeWidth || Math.max(0.6, span / 160);
  let shapes = 0, thick = 0;
  const plugin = { name: 'svg3dRough', fn: () => {
    const stack = [{}]; const made = new WeakSet();   /* свои же контуры обходчик увидит следом — второй раз не трогаем */
    return { element: {
      enter(node) {
        if (made.has(node)) { stack.push(stack[stack.length - 1]); return; }
        const inh = { ...stack[stack.length - 1] };
        for (const k of INHERIT) if (node.attributes[k] != null) inh[k] = node.attributes[k];
        stack.push(inh);
        if (node.name === 'g' || node.name === 'svg') for (const k of ['stroke-dasharray', 'vector-effect']) delete node.attributes[k];
        if (!SHAPES.has(node.name)) return;
        if (!node.attributes.d) { const d0 = shapeToD(node); if (!d0) return; node.attributes = { ...node.attributes, d: d0 }; for (const k of GEOM) delete node.attributes[k]; }
        const fill = inh.fill == null ? '#000000' : inh.fill; const own = inh.stroke && inh.stroke !== 'none' ? inh.stroke : null;
        const hasFill = fill !== 'none' && fillStyle !== 'none';
        const line = stroke || own || (hasFill ? fill : null);
        if (!hasFill && !line) return;
        if (own && parseFloat(inh['stroke-width']) > span / 14) thick++;
        const d = gen.path(node.attributes.d, {
          seed: seed + shapes * 101 + 1, roughness, bowing, fixedDecimalPlaceDigits: 2, disableMultiStroke: single, disableMultiStrokeFill: true,
          stroke: line || 'none', strokeWidth: strokeWidth || (own && parseFloat(inh['stroke-width'])) || sw,
          fill: hasFill ? fill : undefined, fillStyle, hachureGap: gap, fillWeight: fillWeight || sw * 0.9, hachureAngle: -41 + (shapes % 3) * 14,
        });
        shapes++;
        const keep = {}; for (const k of ['transform', 'opacity', 'fill-opacity', 'id', 'class']) if (node.attributes[k] != null) keep[k] = node.attributes[k];
        const node0d = node.attributes.d;
        node.name = 'g'; node.attributes = keep;
        node.children = gen.toPaths(d).map((p) => ({ type: 'element', name: 'path', attributes: {
          d: p.d, fill: p.fill && p.fill !== 'none' ? p.fill : 'none',
          ...(p.stroke && p.stroke !== 'none' ? { stroke: p.stroke, 'stroke-width': String(Math.round(p.strokeWidth * 100) / 100) } : {}),
        }, children: [] }));
        /* штриховка просвечивает: у объёмного рисунка дальние грани видны сквозь ближние. Подложка цветом фона
           (исходный контур, без дрожания) возвращает перекрытие */
        if (paper && hasFill && fillStyle !== 'solid') node.children.unshift({ type: 'element', name: 'path', attributes: { d: node0d, fill: paper }, children: [] });
        for (const c of node.children) made.add(c);
      },
      exit() { stack.pop(); },
    } };
  } };
  const out = svgo.optimize(flat, { plugins: [plugin] }).data
    .replace(/<svg\b([^>]*)>/, (all, a) => `<svg${a.replace(/\s(stroke-linecap|stroke-linejoin|stroke-width|stroke|fill)="[^"]*"/g, '')} fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  return { svg: out, shapes, thick };
}

/* ---------------- иконки Iconify ---------------- */

export const ICONIFY_BASE = () => String(process.env.SVG3D_ICONIFY_BASE || 'https://api.iconify.design').replace(/\/$/, '');
async function getJson(url, timeout = 15000) {
  let res; try { res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { Accept: 'application/json' } }); } catch (e) { throw new Error(`сеть: ${String(e.cause ? e.cause.code || e.cause.message : e.message)} (${new URL(url).host})`); }
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  const t = await res.text(); try { return JSON.parse(t); } catch { throw new Error(`ответ не JSON (${url}): ${t.slice(0, 80)}`); }
}

/**
 * Что лицензия набора требует от сайта: 'ok' — ничего на странице (текст лицензии едет в credits);
 * 'attribution' — подпись на сайте (CC BY); 'share-alike' — подпись и те же условия для изменённого (CC BY-SA);
 * 'refuse' — не берём (некоммерческая, GPL, неизвестная).
 */
export function licenseVerdict(lic) {
  const spdx = String((lic && lic.spdx) || '').trim(); const title = String((lic && lic.title) || '').trim();
  const s = (spdx || title).toUpperCase().replace(/\s+/g, '-');
  if (!s) return { level: 'refuse', why: 'у набора не указана лицензия' };
  if (/NC/.test(s) && /^CC/.test(s)) return { level: 'refuse', why: `${spdx || title} — только некоммерческое использование, сайт клиента — коммерческий` };
  if (/-ND/.test(s) && /^CC/.test(s)) return { level: 'refuse', why: `${spdx || title} — нельзя изменять, а мы чистим и перекрашиваем` };
  if (/^(A?GPL|LGPL)/.test(s)) return { level: 'refuse', why: `${spdx || title} — условия копилефта для встроенных в страницу рисунков не выполняем` };
  if (/^CC-BY-SA/.test(s)) return { level: 'share-alike', why: `${spdx || title} — подпись на сайте и те же условия для изменённых иконок` };
  if (/^CC-BY/.test(s)) return { level: 'attribution', why: `${spdx || title} — нужна подпись автора на сайте` };
  if (/^(MIT|ISC|APACHE-2\.0|CC0-1\.0|UNLICENSE|0BSD|BSD-[23]-CLAUSE|OFL-1\.1|MPL-2\.0|CC-PDDC|WTFPL)$/.test(s)) return { level: 'ok', why: `${spdx || title} — подпись на странице не нужна, сведения — в credits.json` };
  return { level: 'refuse', why: `лицензию «${spdx || title}» скрипт не знает — проверить условия вручную и взять иконку из набора с MIT, ISC, Apache-2.0 или CC0` };
}

const infoCache = new Map();
/** Сведения о наборе: { name, total, author: { name, url }, license: { title, spdx, url }, version, palette } или null. */
export async function collectionInfo(prefix) {
  if (infoCache.has(prefix)) return infoCache.get(prefix);
  const j = await getJson(`${ICONIFY_BASE()}/collections?prefix=${encodeURIComponent(prefix)}`);
  const info = j && j[prefix] ? j[prefix] : null;
  infoCache.set(prefix, info);
  return info;
}
/** Поиск по слову (английскому): → { icons: ['набор:имя'], total, collections: { набор: сведения } }. */
export async function searchIcons(query, { prefixes = null, limit = 32 } = {}) {
  const u = new URL(`${ICONIFY_BASE()}/search`); u.searchParams.set('query', query); u.searchParams.set('limit', String(Math.max(32, Math.min(999, limit))));
  if (prefixes && prefixes.length) u.searchParams.set('prefixes', prefixes.join(','));
  const j = await getJson(u.href);
  return { icons: (j.icons || []).slice(0, limit), total: j.total || 0, collections: j.collections || {} };
}
/** Сама иконка: текст SVG (у одноцветных наборов цвет — currentColor). */
export async function fetchIcon(prefix, name) {
  const url = `${ICONIFY_BASE()}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;
  let res; try { res = await fetch(url, { signal: AbortSignal.timeout(15000) }); } catch (e) { throw new Error(`сеть: ${String(e.cause ? e.cause.code || e.cause.message : e.message)}`); }
  if (res.status === 404) throw new Error(`иконки «${prefix}:${name}» нет в наборе (поиск: node svg3d.mjs icon --search <слово> --set ${prefix})`);
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  const text = await res.text();
  if (!/<svg[\s>]/i.test(text)) throw new Error(`ответ — не SVG (${url})`);
  return { text, url };
}

/* ---------------- россыпь для фона ---------------- */

/**
 * Несколько SVG → один фон: каждый рисунок описан один раз (<symbol>), расставлен много раз (<use>) —
 * вес почти не растёт с числом предметов. Раскладка постоянна при одном seed.
 *   width, height — поле; count — сколько предметов; item — средний размер предмета, px
 *   scale [min, max] — разброс размера; tilt — наибольший наклон, градусы
 *   area — 'full' | 'edges' (у обоих краёв, середина свободна под текст) | 'left' | 'right'; band — ширина полосы, доля поля
 * → { svg, placed, symbols }
 */
export function scatter(svgo, sources, { width = 1440, height = 600, count = 14, seed = 7, item = 120, scale = [0.6, 1.15], tilt = 24, area = 'full', band = null, opacity = 1, precision = 2 } = {}) {
  const R = rng(seed); const symbols = []; let defs = '';
  sources.forEach((s, i) => {
    const clean = cleanSvg(svgo, s.text, { idPrefix: `s${i}`, precision }).data;
    const vb = parseViewBox((/<svg\b[^>]*\bviewBox="([^"]+)"/.exec(clean) || [])[1]);
    if (!vb) throw new Error(`${s.name}: нет viewBox — россыпь не собрать`);
    symbols.push({ id: `sc${i}`, ratio: vb[2] / vb[3] });
    defs += `<symbol id="sc${i}" viewBox="${vb.map((v) => num(v, 3)).join(' ')}">${innerOf(clean)}</symbol>`;
  });
  const placed = []; let uses = '';
  for (let n = 0; n < count; n++) {
    let best = null;
    for (let tries = 0; tries < 40; tries++) {   /* лучшая из попыток — та, что дальше всех от соседей */
      const size = item * (scale[0] + R() * (scale[1] - scale[0]));
      /* предмет целиком внутри поля (наклон учтён с запасом) и в своей полосе: у краёв середина остаётся под текст */
      const half = size * 0.62; const b = band == null ? (area === 'edges' ? 0.18 : 0.45) : band;
      const side = R(); let x = R();
      if (area === 'edges') x = side < 0.5 ? x * b : 1 - x * b; else if (area === 'left') x *= b; else if (area === 'right') x = 1 - x * b;
      const cx = Math.min(width - half, Math.max(half, x * width)), cy = Math.min(height - half, Math.max(half, R() * height));
      let d = Infinity; for (const p of placed) d = Math.min(d, Math.hypot(p.cx - cx, p.cy - cy) - (p.size + size) / 2);
      if (!best || d > best.d) best = { cx, cy, size, d };
      if (d > size * 0.35) break;
    }
    const sym = symbols[n % symbols.length]; const rot = (R() * 2 - 1) * tilt;
    const w = sym.ratio >= 1 ? best.size : best.size * sym.ratio, h = sym.ratio >= 1 ? best.size / sym.ratio : best.size;
    placed.push(best);
    uses += `<use${attrs({ href: `#${sym.id}`, x: num(best.cx - w / 2, 1), y: num(best.cy - h / 2, 1), width: num(w, 1), height: num(h, 1), transform: Math.abs(rot) > 0.5 ? `rotate(${num(rot, 1)} ${num(best.cx, 1)} ${num(best.cy, 1)})` : null })}/>`;
  }
  const svg = svgDoc([0, 0, width, height], `<defs>${defs}</defs>${opacity < 1 ? `<g opacity="${num(opacity, 2)}">${uses}</g>` : uses}`, { preserveAspectRatio: 'xMidYMid slice' });
  return { svg, placed: placed.length, symbols: symbols.length };
}

export const readText = (f) => fs.readFileSync(f, 'utf8');
export const baseName = (f) => path.basename(f).replace(/\.[^.]+$/, '');
