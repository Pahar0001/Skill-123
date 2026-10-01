/**
 * Zdog и Three.js SVGRenderer — отрисовка в безголовом Chrome и сборка SVG.
 *
 * Обе библиотеки рисуют через DOM, поэтому сцена исполняется в настоящем браузере: результат тот же,
 * что увидит посетитель. Сети нет: страница живёт на несуществующем адресе, каждый запрос перехватывается
 * и отдаётся с диска (библиотеки из node_modules, сцена из своей папки). Один браузер на команду.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../lib.mjs';
import { moduleDir } from './deps.mjs';
import { num, attrs, svgDoc, normHex, visualBox, rasterize } from './svg.mjs';
import { processFaces } from './faces.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://svg3d.invalid';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.css': 'text/css' };

/**
 * Страница с перехватом запросов. mounts: { '/lib/': папка, … } — что откуда отдавать; pages: { '/': html }.
 * fn(page) → результат. Ошибки страницы и консоли копятся в log и попадают в текст исключения.
 */
export async function withPage({ mounts = {}, pages = {} }, fn) {
  const browser = await launch();
  const log = [];
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      let u; try { u = new URL(req.url()); } catch { return req.abort(); }
      if (u.origin !== ORIGIN) return req.abort();             /* наружу — ничего */
      const p = decodeURIComponent(u.pathname);
      if (p in pages) return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: pages[p] });
      if (p === '/favicon.ico') return req.respond({ status: 204, body: '' });
      for (const [prefix, dir] of Object.entries(mounts)) {
        if (!p.startsWith(prefix)) continue;
        const file = path.resolve(dir, p.slice(prefix.length));
        const rel = path.relative(path.resolve(dir), file);
        if (rel.startsWith('..') || path.isAbsolute(rel)) break;   /* за пределы папки не выходим */
        try { return req.respond({ status: 200, contentType: `${MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'}; charset=utf-8`, body: fs.readFileSync(file) }); } catch { break; }
      }
      log.push(`нет файла для ${p}`);
      return req.respond({ status: 404, contentType: 'text/plain', body: 'not found' });
    });
    page.on('pageerror', (e) => log.push(`ошибка страницы: ${String(e.message || e).split('\n')[0]}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') log.push(`консоль ${m.type()}: ${m.text().slice(0, 200)}`); });
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load', timeout: 60000 });
    try { return await fn(page, log); } catch (e) {
      const msg = String(e.message || e).split('\n')[0].replace(/^Error: /, '');
      throw new Error(`${msg}${log.length ? ` · ${log.slice(0, 4).join(' · ')}` : ''}`);
    }
  } finally { try { await browser.close(); } catch { /* уже закрыт */ } }
}

const sceneMount = (sceneFile) => ({ dir: path.dirname(path.resolve(sceneFile)), url: `${ORIGIN}/scene/${encodeURIComponent(path.basename(sceneFile))}?t=${Date.now()}` });

/* ---------------- Zdog ---------------- */

/** Сцена Zdog → данные кадров из браузера (контуры, рамка, палитра). */
export async function runZdog(sceneFile, opts) {
  const zdog = moduleDir('zdog'); if (!zdog) throw new Error('нет пакета zdog');
  const sc = sceneMount(sceneFile);
  const html = '<!doctype html><meta charset="utf-8"><body style="margin:0"><script src="/lib/zdog.dist.min.js"></script><script src="/harness/zdog-harness.js"></script>';
  return withPage({ mounts: { '/lib/': path.join(zdog, 'dist'), '/harness/': path.join(HERE, 'harness'), '/scene/': sc.dir }, pages: { '/': html } }, async (page) => {
    await page.waitForFunction('typeof window.svg3dZdog === "function" && !!window.Zdog', { timeout: 30000 });
    return page.evaluate((o) => window.svg3dZdog(o), { ...opts, scene: sc.url });
  });
}

/* у Zdog линии и стыки круглые почти всегда — выносим на группу, исключения помечаем явно */
function zdogInner(paths, precision) {
  let out = '';
  for (const p of paths) {
    const a = { ...p.attrs };
    const cap = a['stroke-linecap'], join = a['stroke-linejoin']; delete a['stroke-linecap']; delete a['stroke-linejoin'];
    if (a.stroke && a.stroke !== 'none') { if (cap !== 'round') a['stroke-linecap'] = cap || 'butt'; if (join !== 'round') a['stroke-linejoin'] = join || 'miter'; }
    for (const k of ['fill', 'stroke']) { const h = normHex(a[k]); if (h) a[k] = h; }
    if (a['stroke-width'] != null) a['stroke-width'] = num(a['stroke-width'], precision);
    out += `<${p.tag}${attrs(a)}/>`;
  }
  return `<g stroke-linecap="round" stroke-linejoin="round">${out}</g>`;
}

/**
 * Убрать из кадра фигуры, которых не видно: Zdog рисует всё подряд от дальнего к ближнему, и задние грани
 * коробок, донышки цилиндров и перекрытые детали остаются в файле мёртвым грузом (до половины узлов), а их
 * края просвечивают волосяной каймой. Каждая фигура красится своим цветом без сглаживания; чей цвет на
 * растре не остался — тот закрыт целиком. Только для непрозрачных цветов (#hex); иначе кадр не трогается.
 * → сколько фигур убрано.
 */
export async function cullHidden(sharp, data, { scale = 4, minPx = 6 } = {}) {
  let removed = 0;
  for (const f of data.frames) {
    const solid = f.paths.every((p) => ['fill', 'stroke'].every((k) => !p.attrs[k] || p.attrs[k] === 'none' || normHex(p.attrs[k])) && !p.attrs.opacity && !p.attrs['fill-opacity']);
    if (!solid || f.paths.length < 2 || f.paths.length > 4000) continue;
    const marked = f.paths.map((p, i) => { const c = `#${(i + 1).toString(16).padStart(6, '0')}`; const a = { ...p.attrs }; if (a.fill && a.fill !== 'none') a.fill = c; if (a.stroke && a.stroke !== 'none') a.stroke = c; return { tag: p.tag, attrs: a }; });
    const [x, y, w, h] = data.viewBox; const big = [x - w / 2, y - h / 2, w * 2, h * 2];   /* с запасом: вышедшее за поле тоже считается */
    const px = Math.min(2400, Math.round(big[2] * scale));
    let img; try { img = await rasterize(sharp, svgDoc(big, zdogInner(marked, 3), { 'shape-rendering': 'crispEdges' }), { width: px, viewBox: big }); } catch { continue; }
    if (!img) continue;
    const seen = new Uint32Array(f.paths.length + 1); let foreign = 0;
    for (let i = 0; i < img.width * img.height; i++) { const o = i * 4; if (img.data[o + 3] < 255) { if (img.data[o + 3] > 0) foreign++; continue; } const id = (img.data[o] << 16) | (img.data[o + 1] << 8) | img.data[o + 2]; if (id >= 1 && id <= f.paths.length) seen[id]++; else foreign++; }
    if (foreign > img.width * img.height * 0.002) continue;   /* растеризатор всё же сгладил края — считать нельзя */
    const keep = f.paths.filter((_, i) => seen[i + 1] >= minPx);
    if (keep.length && keep.length < f.paths.length) { removed += f.paths.length - keep.length; f.paths = keep; }
  }
  return removed;
}

/**
 * Уточнить рамку каждого кадра по растру: браузер отдаёт рамку заливки, а у Zdog почти всё — обводка
 * (шар — точка с толстой линией, бок цилиндра — отрезок толщиной в диаметр). Без sharp остаётся оценка
 * из браузера (с запасом).
 */
export async function measureZdog(sharp, data) {
  for (const f of data.frames) {
    try { const b = await visualBox(sharp, svgDoc(data.viewBox, zdogInner(f.paths, 2)), data.viewBox); if (b) f.box = b; } catch { /* оценка из браузера */ }
  }
}

/**
 * Кадры Zdog → документы SVG. fit — обрезать по содержимому (общая рамка всех кадров) с полем pad.
 * → { docs: [svg…], viewBox, box }
 */
export function buildZdog(data, { fit = false, pad = 4, precision = 2 } = {}) {
  let vb = data.viewBox.slice();
  let box = null; for (const f of data.frames) if (f.box) box = box ? [Math.min(box[0], f.box[0]), Math.min(box[1], f.box[1]), Math.max(box[2], f.box[2]), Math.max(box[3], f.box[3])] : f.box.slice();
  if (fit && box) vb = [Math.floor(box[0] - pad), Math.floor(box[1] - pad), Math.ceil(box[2] + pad) - Math.floor(box[0] - pad), Math.ceil(box[3] + pad) - Math.floor(box[1] - pad)];
  const docs = data.frames.map((f) => svgDoc(vb, zdogInner(f.paths, precision)));
  /* содержимое выходит за рамку? (без --fit размер задаёт сцена) */
  const clipped = !fit && box ? Math.max(vb[0] - box[0], vb[1] - box[1], box[2] - (vb[0] + vb[2]), box[3] - (vb[1] + vb[3])) : 0;
  return { docs, viewBox: vb, box, clipped };
}

/* ---------------- Three.js ---------------- */

/** Сцена Three.js → грани SVGRenderer с глубиной по кадрам. */
export async function runThree(sceneFile, opts) {
  const three = moduleDir('three'); if (!three) throw new Error('нет пакета three');
  if (!fs.existsSync(path.join(three, 'examples', 'jsm', 'renderers', 'SVGRenderer.js'))) throw new Error('в пакете three нет examples/jsm/renderers/SVGRenderer.js');
  const sc = sceneMount(sceneFile);
  /* карта импортов — до первого модуля (Firefox и Chrome одинаково требуют этот порядок) */
  const html = '<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><body style="margin:0"><script type="module" src="/harness/three-harness.js"></script>';
  return withPage({ mounts: { '/three/': three, '/harness/': path.join(HERE, 'harness'), '/scene/': sc.dir }, pages: { '/': html } }, async (page) => {
    await page.waitForFunction('window.svg3dThreeReady === true', { timeout: 60000 });
    return page.evaluate((o) => window.svg3dThree(o), { ...opts, scene: sc.url });
  });
}

/**
 * Кадры Three.js → документы SVG.
 *   seam — толщина обводки цветом заливки, закрывающей щели между гранями (px экрана; 0 — без обводки)
 *   merge — склеивать грани одной заливки; sort — исправлять порядок по глубине; tones — ступени тона (0 — как есть)
 * → { docs, stats: [по кадрам] }
 */
export function buildThree(data, { precision = 1, seam = 1, merge = true, sort = true, tones = 0 } = {}) {
  const docs = []; const stats = [];
  for (const f of data.frames) {
    const { paths, stats: st } = processFaces(f.items, { precision, merge, sort: sort && f.matched, tones });
    st.matched = f.matched;
    let inner = '';
    for (const p of paths) {
      if (p.raw) { inner += `<path d="${p.raw.d}"${attrs(p.raw.attrs)}/>`; continue; }
      const solid = p.opacity == null || p.opacity >= 1;
      inner += `<path${attrs({ fill: p.fill, 'fill-opacity': solid ? null : num(p.opacity, 3), stroke: seam > 0 && solid ? p.fill : null, 'vector-effect': seam > 0 && solid ? 'non-scaling-stroke' : null, d: p.d })}/>`;
    }
    docs.push(svgDoc(data.viewBox, seam > 0 ? `<g stroke-width="${num(seam, 2)}" stroke-linejoin="round">${inner}</g>` : inner));
    stats.push(st);
  }
  return { docs, stats };
}

/* ---------------- спрайт кадров ---------------- */

/** Кадры в одну ленту (для steps() или смены background-position): viewBox [0 0 N·w h]. */
export function spriteStrip(inners, viewBox) {
  const [x, y, w, h] = viewBox;
  const body = inners.map((inner, i) => `<svg x="${num(i * w, 3)}" y="0" width="${num(w, 3)}" height="${num(h, 3)}" viewBox="${[x, y, w, h].map((v) => num(v, 3)).join(' ')}">${inner}</svg>`).join('');
  return svgDoc([0, 0, w * inners.length, h], body);
}
