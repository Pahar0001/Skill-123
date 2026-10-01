/**
 * Общие операции над SVG для svg3d.mjs: разбор и подсчёт, чистка (SVGO + свои правила безопасности),
 * палитра и CSS-переменные, растеризация для превью и сверки «до/после».
 *
 * Разбор XML — только через SVGO (свой плагин получает дерево): второго разборщика в стеке нет.
 */
import zlib from 'node:zlib';
import { importFrom } from './deps.mjs';

let svgoMod;
/** SVGO или null (нет пакета). */
export async function getSvgo() {
  if (svgoMod === undefined) svgoMod = await importFrom('svgo');
  return svgoMod;
}

export const kb1 = (b) => `${(Math.round((b || 0) / 1024 * 10) / 10).toFixed(1)} КБ`;
export const gzipSize = (text) => zlib.gzipSync(Buffer.from(text), { level: 9 }).length;
export const bytesOf = (text) => Buffer.byteLength(text, 'utf8');

/* ---------------- цвета и палитра ---------------- */

const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', yellow: '#ffff00', orange: '#ffa500', navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000', purple: '#800080', aqua: '#00ffff', lime: '#00ff00', fuchsia: '#ff00ff' };
/** Любая запись цвета → '#rrggbb' в нижнем регистре или null (none, currentColor, var(), url() — null). */
export function normHex(c) {
  const s = String(c == null ? '' : c).trim().toLowerCase();
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  m = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(s);
  if (m) return '#' + [1, 2, 3].map((i) => Math.max(0, Math.min(255, Math.round(Number(m[i])))).toString(16).padStart(2, '0')).join('');
  return NAMED[s] || null;
}
export const hexRgb = (h) => { const x = normHex(h); return x ? [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)) : null; };

/**
 * «ink=#16301F,moss=#5E7A33» → { ink: '#16301f', moss: '#5e7a33' }. Имена — латиница, цифры, дефис.
 * Ошибка в записи — исключение с понятным текстом (опечатка в цвете не должна молча дать чёрный).
 */
export function parsePalette(str) {
  const out = {};
  if (str == null || str === true || !String(str).trim()) return out;
  for (const part of String(str).split(/[,;]\s*/).filter(Boolean)) {
    const m = /^\s*([A-Za-z][\w-]*)\s*[=:]\s*(.+?)\s*$/.exec(part);
    if (!m) throw new Error(`--palette: «${part}» — нужна запись имя=#RRGGBB через запятую`);
    const hex = normHex(m[2]);
    if (!hex) throw new Error(`--palette: цвет «${m[2]}» у «${m[1]}» — нужен #RGB или #RRGGBB`);
    out[m[1]] = hex;
  }
  return out;
}

/**
 * Цвета палитры → CSS-переменные с запасным значением: fill="#5e7a33" → fill="var(--c-moss,#5e7a33)".
 * Сайт перекрашивает рисунок, задав --c-moss; без переменной (и в <img>) остаётся исходный цвет.
 * Меняются только значения fill, stroke, stop-color, color, flood-color — ссылки на id (#abc) не трогаются.
 */
export function cssVars(text, palette, prefix = 'c-') {
  const byHex = new Map();
  for (const [name, hex] of Object.entries(palette || {})) { const h = normHex(hex); if (h && !byHex.has(h)) byHex.set(h, name); }
  if (!byHex.size) return { text, used: [] };
  const used = new Set();
  const sub = (val) => { const h = normHex(val); const n = h && byHex.get(h); if (!n) return null; used.add(n); return `var(--${prefix}${n},${h})`; };
  let out = String(text).replace(/\b(fill|stroke|stop-color|flood-color|lighting-color|color)="([^"]*)"/g, (all, attr, val) => { const v = sub(val); return v ? `${attr}="${v}"` : all; });
  out = out.replace(/\bstyle="([^"]*)"/g, (all, css) => `style="${css.replace(/\b(fill|stroke|stop-color|flood-color|color)\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]*\))/g, (a, prop, val) => { const v = sub(val); return v ? `${prop}:${v}` : a; })}"`);
  return { text: out, used: [...used] };
}

/** Для растеризатора (librsvg не понимает var() и не знает цвет текста страницы): var(--x,#hex) → #hex, currentColor → color. */
export function forRaster(text, { color = '#16301f' } = {}) {
  return String(text)
    .replace(/var\(\s*--[\w-]+\s*,\s*([^()]+?)\s*\)/g, '$1')
    .replace(/var\(\s*--[\w-]+\s*\)/g, color)
    .replace(/currentColor/gi, color);
}

/* ---------------- разбор и подсчёт ---------------- */

const ANIM = new Set(['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set']);
const EMBED = new Set(['foreignObject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas']);
const isLocalRef = (v) => /^\s*#/.test(v);
const isInlineImage = (v) => /^\s*data:image\/(png|jpe?g|webp|gif|avif);/i.test(v);
const extUrl = /url\(\s*['"]?\s*(?!#|['"]?#)([^)'"]+)/i;

/**
 * Разобрать SVG и посчитать: { ok, error, viewBox, width, height, elements, tags, points, scripts,
 * handlers, external[], raster, embedded, animations, styles, ids, bytes, gzip }.
 * ok: false — не разбирается как XML или корень не <svg>.
 */
export function inspectSvg(svgo, text) {
  const info = { ok: false, error: null, viewBox: null, width: null, height: null, elements: 0, tags: {}, points: 0, scripts: 0, handlers: 0, external: [], raster: 0, embedded: 0, animations: 0, styles: 0, ids: [], bytes: bytesOf(text), gzip: gzipSize(text) };
  let rootSeen = false;
  const plugin = { name: 'svg3dInspect', fn: () => ({ element: { enter(node, parent) {
    if (parent.type === 'root') { rootSeen = node.name === 'svg'; if (rootSeen) { info.viewBox = node.attributes.viewBox || null; info.width = node.attributes.width || null; info.height = node.attributes.height || null; } }
    info.elements++; info.tags[node.name] = (info.tags[node.name] || 0) + 1;
    const local = node.name.includes(':') ? node.name.split(':')[1] : node.name;
    if (local === 'script') info.scripts++;
    if (local === 'image') info.raster++;
    if (EMBED.has(local)) info.embedded++;
    if (ANIM.has(local)) info.animations++;
    if (local === 'style') { info.styles++; const css = (node.children || []).map((c) => c.value || '').join(''); if (/@import/i.test(css) || extUrl.test(css)) info.external.push('style: @import или url()'); }
    for (const [k, v] of Object.entries(node.attributes)) {
      if (/^on[a-z]+$/i.test(k)) info.handlers++;
      if (k === 'id') info.ids.push(v);
      if (k === 'd' || k === 'points') info.points += Math.ceil((String(v).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).length / 2);
      if (/^(xlink:)?href$|^src$/i.test(k)) { if (!isLocalRef(v) && !(local === 'image' && isInlineImage(v))) info.external.push(`${node.name} ${k}="${String(v).slice(0, 60)}"`); } else if (!k.startsWith('xmlns') && extUrl.test(String(v))) info.external.push(`${node.name} ${k}="${String(v).slice(0, 60)}"`);
      if (/javascript:/i.test(String(v))) info.scripts++;
    }
  } } }) };
  try { svgo.optimize(String(text), { plugins: [plugin] }); } catch (e) { info.error = String(e.reason || e.message || e).split('\n')[0]; return info; }
  if (!rootSeen) { info.error = 'корень документа — не <svg>'; return info; }
  info.ok = true;
  return info;
}

/** viewBox строкой → [x, y, w, h] числами или null. */
export function parseViewBox(vb) {
  const p = String(vb || '').trim().split(/[\s,]+/).map(Number);
  return p.length === 4 && p.every(Number.isFinite) && p[2] > 0 && p[3] > 0 ? p : null;
}

/* ---------------- чистка ---------------- */

/**
 * Чистка и сжатие: SVGO (набор по умолчанию, viewBox сохраняется) + свои правила.
 *   precision   знаков после запятой в координатах (2)
 *   idPrefix    приставка id и классов (встроенные в одну страницу рисунки не должны делить id)
 *   keepSize    оставить width и height корня (по умолчанию убираются: размер задаёт вёрстка)
 *   allowRaster оставить <image> с вложенной картинкой data:image (внешние ссылки убираются всегда)
 *   label       рисунок со смыслом: role="img" и aria-label; без него — декор: aria-hidden и focusable="false"
 *   keepAnim    оставить SMIL-анимации (по умолчанию убираются: они не слушают «меньше движения»)
 * → { data, removed: { 'что': сколько }, addedViewBox }
 */
export function cleanSvg(svgo, text, { precision = 2, idPrefix = 'g', keepSize = false, allowRaster = false, label = null, keepAnim = false, mergePaths = true } = {}) {
  const removed = {}; const note = (k) => { removed[k] = (removed[k] || 0) + 1; };
  /* скрипты и обработчики убирает встроенное правило SVGO — посчитать их можно только до него */
  const pre = inspectSvg(svgo, text); if (pre.scripts) removed['script и javascript:'] = pre.scripts; if (pre.handlers) removed['обработчик on…'] = pre.handlers;
  let addedViewBox = false;
  const drop = (node, parent) => { parent.children = parent.children.filter((c) => c !== node); };
  const sanitize = { name: 'svg3dSanitize', fn: () => ({ element: { enter(node, parent) {
    const local = node.name.includes(':') ? node.name.split(':')[1] : node.name;
    if (local === 'script') return drop(node, parent);
    if (EMBED.has(local)) { note(local); return drop(node, parent); }
    if (ANIM.has(local) && !keepAnim) { note('SMIL-анимация'); return drop(node, parent); }
    if (local === 'style') { const css = (node.children || []).map((c) => c.value || '').join(''); if (/@import/i.test(css) || extUrl.test(css)) { note('style с внешней ссылкой'); return drop(node, parent); } }
    if (local === 'image') {
      const href = node.attributes.href || node.attributes['xlink:href'] || '';
      if (!(allowRaster && isInlineImage(href))) { note(isInlineImage(href) ? 'растр <image>' : 'внешняя картинка <image>'); return drop(node, parent); }
    }
    if (local === 'a') { node.name = 'g'; for (const k of Object.keys(node.attributes)) if (/href$|^target$|^rel$|^download$/i.test(k)) delete node.attributes[k]; note('ссылка <a>'); }
    for (const [k, v] of Object.entries(node.attributes)) {
      if (/^on[a-z]+$/i.test(k)) { delete node.attributes[k]; continue; }
      if (/^(xlink:)?href$|^src$/i.test(k)) {
        if (isLocalRef(v) || (local === 'image' && isInlineImage(v))) continue;
        note('внешняя ссылка'); if (local === 'use' || local === 'feImage') return drop(node, parent); delete node.attributes[k]; continue;
      }
      if (k === 'xml:base') { delete node.attributes[k]; note('xml:base'); continue; }
      if (!k.startsWith('xmlns') && (extUrl.test(String(v)) || /javascript:/i.test(String(v)))) { delete node.attributes[k]; note('внешний url()'); }
    }
    return undefined;
  } } }) };
  const root = { name: 'svg3dRoot', fn: () => ({ element: { exit(node, parent) {
    if (parent.type !== 'root' || node.name !== 'svg') return;
    const a = node.attributes;
    if (!a.viewBox) { const w = parseFloat(a.width), h = parseFloat(a.height); if (w > 0 && h > 0 && !/%/.test(`${a.width}${a.height}`)) { a.viewBox = `0 0 ${w} ${h}`; addedViewBox = true; } }
    if (!keepSize && a.viewBox) { delete a.width; delete a.height; }
    if (!a.xmlns) a.xmlns = 'http://www.w3.org/2000/svg';
    delete a['aria-hidden']; delete a.focusable; delete a.role; delete a['aria-label'];
    if (label) { a.role = 'img'; a['aria-label'] = String(label); } else { a['aria-hidden'] = 'true'; a.focusable = 'false'; }
  } } }) };
  const res = svgo.optimize(String(text), {
    multipass: true, floatPrecision: precision,
    js2svg: { indent: 0, pretty: false },
    plugins: [
      'removeScripts', sanitize,
      { name: 'preset-default', params: { overrides: {
        convertColors: { shortname: false },
        ...(mergePaths ? {} : { mergePaths: false }),
      } } },
      { name: 'prefixIds', params: { prefix: String(idPrefix || 'g'), delim: '-', prefixClassNames: true } },
      root,
    ],
  });
  return { data: res.data, removed, addedViewBox };
}

/* ---------------- растеризация (sharp) ---------------- */

/** Корню <svg> — явные width и height (librsvg берёт размер из них). */
export function withSize(text, w, h) {
  return String(text).replace(/<svg\b([^>]*)>/, (all, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${w}" height="${h}">`);
}

/**
 * SVG → RGBA-буфер шириной width (высота по viewBox). → { data, width, height } или null (нет viewBox и размеров).
 * bg — цвет фона (#hex) или null (прозрачный); color — чем заменить currentColor.
 */
export async function rasterize(sharp, text, { width = 256, bg = null, color = '#16301f', viewBox = null } = {}) {
  const vb = viewBox || parseViewBox((/<svg\b[^>]*\bviewBox="([^"]+)"/.exec(text) || [])[1]);
  let w = width, h;
  if (vb) h = Math.max(1, Math.round(width * vb[3] / vb[2]));
  else {
    const m = /<svg\b[^>]*>/.exec(text); const ww = m && parseFloat((/\bwidth="([^"]+)"/.exec(m[0]) || [])[1]), hh = m && parseFloat((/\bheight="([^"]+)"/.exec(m[0]) || [])[1]);
    if (!(ww > 0 && hh > 0)) return null;
    h = Math.max(1, Math.round(width * hh / ww));
    text = String(text).replace(/<svg\b/, `<svg viewBox="0 0 ${ww} ${hh}"`);
  }
  const src = Buffer.from(withSize(forRaster(text, { color }), w, h));
  let img = sharp(src, { density: 96 }).resize(w, h, { fit: 'fill' });
  if (bg) img = img.flatten({ background: bg });
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Видимая рамка рисунка в единицах viewBox — по растру (обводки, скругления и дуги учтены как есть).
 * Смотрит шире исходного поля в grow раз: содержимое, вышедшее за viewBox, тоже попадает в рамку.
 * → [x1, y1, x2, y2] или null (рисунок пуст). Точность — около половины единицы.
 */
export async function visualBox(sharp, text, viewBox, { grow = 3, maxPx = 1500 } = {}) {
  const [x, y, w, h] = viewBox; const big = [x - w * (grow - 1) / 2, y - h * (grow - 1) / 2, w * grow, h * grow];
  const px = Math.min(maxPx, Math.round(big[2] * 2)); const k = px / big[2];
  const doc = String(text).replace(/(<svg\b[^>]*\bviewBox=")[^"]*(")/, `$1${big.join(' ')}$2`);
  const img = await rasterize(sharp, doc, { width: px, viewBox: big }); if (!img) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (let yy = 0; yy < img.height; yy++) for (let xx = 0; xx < img.width; xx++) if (img.data[(yy * img.width + xx) * 4 + 3] > 24) { if (xx < x1) x1 = xx; if (xx > x2) x2 = xx; if (yy < y1) y1 = yy; if (yy > y2) y2 = yy; }
  if (x2 < 0) return null;
  return [big[0] + x1 / k, big[1] + y1 / k, big[0] + (x2 + 1) / k, big[1] + (y2 + 1) / k];
}

/** Насколько две картинки расходятся: { mean — среднее отличие в %, max — наибольшее по каналу 0…255 } (на белом). */
export function rasterDiff(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return null;
  let sum = 0, max = 0; const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4; const aa = a.data[o + 3] / 255, ba = b.data[o + 3] / 255;
    for (let k = 0; k < 3; k++) { const x = a.data[o + k] * aa + 255 * (1 - aa), y = b.data[o + k] * ba + 255 * (1 - ba); const d = Math.abs(x - y); sum += d; if (d > max) max = d; }
  }
  return { mean: Math.round(sum / (n * 3) / 255 * 10000) / 100, max: Math.round(max) };
}

/** Доля пикселей, отличных от фона (для проверки «превью не пустое»): 0…1. */
export function inkShare(img, bg) {
  const [r, g, b] = hexRgb(bg) || [255, 255, 255]; let n = 0; const total = img.width * img.height;
  for (let i = 0; i < total; i++) { const o = i * 4; if (Math.abs(img.data[o] - r) + Math.abs(img.data[o + 1] - g) + Math.abs(img.data[o + 2] - b) > 24) n++; }
  return n / total;
}

/* ---------------- сборка корня ---------------- */

const escAttr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Число для SVG: округлить до p знаков, без хвостовых нулей и «-0». */
export function num(v, p = 2) { const k = 10 ** p; const r = Math.round(Number(v) * k) / k; return Object.is(r, -0) || r === 0 ? '0' : String(r); }
/** Атрибуты объектом → строка. */
export const attrs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
/** Собрать документ: viewBox числами, содержимое строкой. */
export function svgDoc(viewBox, inner, extra = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.map((v) => num(v, 3)).join(' ')}"${attrs(extra)}>${inner}</svg>`;
}
/**
 * Содержимое корня <svg> без самого корня (для встраивания в <symbol> и кадры спрайта). Оформление, заданное
 * на корне (fill="none" stroke="currentColor" у чертежа), переезжает на группу — иначе рисунок его теряет.
 */
export function innerOf(text) {
  const m = /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(String(text)); if (!m) return '';
  const keep = [...m[1].matchAll(/\s([\w:-]+)="([^"]*)"/g)].filter(([, k]) => !/^(xmlns(:.*)?|viewBox|width|height|x|y|aria-.*|focusable|role|preserveAspectRatio|version|id|class)$/.test(k)).map(([all]) => all).join('');
  return keep ? `<g${keep}>${m[2]}</g>` : m[2];
}
