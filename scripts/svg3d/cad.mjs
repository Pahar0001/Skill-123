/**
 * CadQuery → чертёжная проекция в SVG: видимые линии, контур потолще, скрытые — пунктиром.
 *
 * Python с cadquery ищется сам (SVG3D_PYTHON, py -3.9 … python); модель строит cad_runner.py и отдаёт
 * линии проекции числами, SVG собирается здесь: линии сцепляются в длинные контуры (ровные стыки и
 * непрерывный пунктир), дуги и сплайны из частых точек становятся кривыми Безье (fit.mjs) — файл легче в
 * разы и гладкий при любом увеличении; толщина линии — одна на весь рисунок.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { num, attrs, svgDoc } from './svg.mjs';
import { fitPolyline } from './fit.mjs';
import { OWN_ROOT } from './deps.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, 'cad_runner.py');
const CACHE = path.join(OWN_ROOT, 'cache', 'svg3d-python.json');
export const BUILTIN = { gear: 'шестерня (teeth, module, width, bore, holes)', crate: 'ящик из реек (width, depth, height, slats, post, thickness)', nut: 'гайка (size, height, bore)' };
export const VIEWS = { iso: [1, -1, 0.8], 'iso-left': [-1, -1, 0.8], front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 0, 1], bottom: [0, 0, -1] };

const PY_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
const candidates = () => [
  process.env.SVG3D_PYTHON ? [process.env.SVG3D_PYTHON] : null,
  ...(process.platform === 'win32' ? [['py', '-3.9'], ['py', '-3.10'], ['py', '-3.11'], ['py', '-3.12'], ['py', '-3']] : []),
  ['python'], ['python3'],
].filter(Boolean);

/**
 * Интерпретатор с cadquery: { cmd: [...], version, cadquery } или { cmd: null, tried: [...] }.
 * Найденный запоминается в ~/.claude/site-rework/cache/svg3d-python.json (импорт cadquery — секунды).
 */
export function findPython({ fresh = false } = {}) {
  if (!fresh) {
    try { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); if (c && Array.isArray(c.cmd) && (process.env.SVG3D_PYTHON ? c.cmd[0] === process.env.SVG3D_PYTHON : true)) return { ...c, cached: true }; } catch { /* нет записи */ }
  }
  const tried = [];
  for (const cmd of candidates()) {
    const r = spawnSync(cmd[0], [...cmd.slice(1), '-c', 'import sys, cadquery; print(sys.version.split()[0]); print(cadquery.__version__)'], { encoding: 'utf8', env: PY_ENV, timeout: 120000, windowsHide: true });
    if (r.status === 0 && r.stdout) {
      const [version, cadquery] = r.stdout.trim().split(/\r?\n/);
      const found = { cmd, version, cadquery };
      try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(found)); } catch { /* без записи */ }
      return found;
    }
    tried.push(`${cmd.join(' ')} — ${r.error ? 'не запускается' : /No module named/.test(r.stderr || '') ? 'cadquery не установлен' : r.status === 103 || /not found|No suitable|не найден/i.test(`${r.stderr}${r.stdout}`) ? 'такой версии нет' : `код ${r.status}`}`);
  }
  try { fs.rmSync(CACHE, { force: true }); } catch { /* нечего удалять */ }
  return { cmd: null, tried };
}

/**
 * Построить проекции. source: { script: путь } | { builtin: имя }.
 * → { ok: true, views, cadquery, size } | { ok: false, error, code } (code 3 — нет cadquery, 2 — нет такой фигуры)
 */
export function runCad(py, source, { views, params = {}, deflection = 0.0002 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svg3d-cad-'));
  const reqFile = path.join(dir, 'request.json');
  fs.writeFileSync(reqFile, JSON.stringify({ script: source.script ? path.resolve(source.script) : null, builtin: source.builtin || null, params, views, deflection }));
  const r = spawnSync(py.cmd[0], [...py.cmd.slice(1), RUNNER, reqFile], { encoding: 'utf8', env: PY_ENV, timeout: 300000, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* временная папка */ }
  let out = null; try { out = JSON.parse(r.stdout); } catch { /* не JSON */ }
  if (out && out.ok) return out;
  if (out && out.error) return { ok: false, error: out.error, code: r.status };
  const tail = String(r.stderr || r.stdout || (r.error && r.error.message) || '').trim().split(/\r?\n/).slice(-3).join(' · ').slice(0, 400);
  return { ok: false, error: `Python завершился с кодом ${r.status}: ${tail || 'без вывода'}`, code: r.status };
}

/* ---------- линии → контуры ---------- */

/* сцепить отрезки с общими концами в длинные линии: в точке, где сходятся ровно две линии, они продолжают
   друг друга; где три и больше (узел чертежа) — линии кончаются */
function chain(lines, grid = 100) {
  const key = (p) => `${Math.round(p[0] * grid)},${Math.round(p[1] * grid)}`;
  const ends = new Map();
  lines.forEach((l, i) => { for (const e of [0, 1]) { const k = key(e ? l[l.length - 1] : l[0]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push([i, e]); } });
  const used = new Uint8Array(lines.length); const out = [];
  const other = (k, i) => { const list = ends.get(k); if (!list || list.length !== 2) return null; const o = list[0][0] === i ? list[1] : list[0]; return o[0] === i || used[o[0]] ? null : o; };
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue; used[i] = 1;
    let pts = lines[i].slice(); let closed = false;
    for (;;) {   /* вперёд от конца */
      const o = other(key(pts[pts.length - 1]), i); if (!o) break;
      used[o[0]] = 1; const seg = o[1] ? lines[o[0]].slice().reverse() : lines[o[0]]; pts = pts.concat(seg.slice(1));
      if (key(pts[0]) === key(pts[pts.length - 1])) { closed = true; break; }
    }
    if (!closed) for (;;) {   /* назад от начала */
      const o = other(key(pts[0]), i); if (!o) break;
      used[o[0]] = 1; const seg = o[1] ? lines[o[0]] : lines[o[0]].slice().reverse(); pts = seg.slice(0, -1).concat(pts);
      if (key(pts[0]) === key(pts[pts.length - 1])) { closed = true; break; }
    }
    if (!closed && pts.length > 2 && key(pts[0]) === key(pts[pts.length - 1])) closed = true;
    out.push({ pts, closed });
  }
  return out;
}

/* линии группы → один атрибут d: сцепленные контуры, дуги и сплайны — кривыми Безье */
function pathD(lines, precision, tol) {
  let d = ''; let points = 0;
  for (const { pts, closed } of chain(lines)) { const r = fitPolyline(pts, closed, { tol, precision }); d += r.d; points += r.nodes; }
  return { d, points };
}

/**
 * Проекции → документ SVG.
 *   size      ширина рисунка в px (480); высота — по содержимому
 *   stroke    толщина видимой линии (1.2); скрытые и плавные переходы — ×0.75
 *   eps       допуск замены частых точек дуг и сплайнов кривыми Безье, px (0.1)
 *   hidden    'dashed' | 'faint' | 'none'
 *   color     цвет линий ('currentColor' — рисунок красится цветом текста блока) ; hiddenColor — свой цвет скрытых
 *   draw      готово к прорисовке линией (decor-kit): один <path pathLength="1"> на контур, скрытые — без пунктира
 * → { doc, width, height, counts: { outline, sharp, smooth, hidden }, points }
 */
export function buildCad(views, { size = 480, pad = 6, gap = 28, stroke = 1.2, hidden = 'dashed', color = 'currentColor', hiddenColor = null, precision = 2, draw = false, eps = 0.1 } = {}) {
  const dims = views.map((v) => ({ w: v.bbox[2] - v.bbox[0], h: v.bbox[3] - v.bbox[1] }));
  const sumW = dims.reduce((a, d) => a + d.w, 0); const maxH = Math.max(...dims.map((d) => d.h));
  const s = (size - 2 * pad - gap * (views.length - 1)) / sumW;
  const W = size, H = Math.ceil(maxH * s + 2 * pad);
  const groups = { hidden: [], smooth: [], sharp: [], outline: [] }; const counts = { outline: 0, sharp: 0, smooth: 0, hidden: 0 };
  let x0 = pad;
  views.forEach((v, i) => {
    const d = dims[i]; const y0 = pad + (maxH - d.h) * s;   /* виды стоят на общей нижней линии, как на чертеже */
    for (const k of Object.keys(groups)) {
      const lines = (v.lines[k] || []).map((l) => l.map((p) => [x0 + (p[0] - v.bbox[0]) * s, y0 + (v.bbox[3] - p[1]) * s]));
      counts[k] += lines.length; groups[k].push(...lines);
    }
    x0 += d.w * s + gap;
  });
  let points = 0;
  const part = (k, a) => {
    if (!groups[k].length) return '';
    if (draw) {   /* по контуру на <path>: прорисовка идёт у каждого своя */
      const paths = chain(groups[k]).map(({ pts, closed }) => { const r = fitPolyline(pts, closed, { tol: eps, precision }); points += r.nodes; return r.d ? `<path pathLength="1" d="${r.d}"/>` : ''; }).join('');
      return `<g${attrs(a)}>${paths}</g>`;
    }
    const r = pathD(groups[k], precision, eps); points += r.points;
    return r.d ? `<path${attrs({ ...a, d: r.d })}/>` : '';
  };
  let inner = '';
  if (hidden !== 'none') inner += part('hidden', { 'stroke-width': num(stroke * 0.75, 2), stroke: hiddenColor || null, opacity: hiddenColor ? null : hidden === 'faint' || draw ? '.35' : '.55', 'stroke-dasharray': hidden === 'dashed' && !draw ? `${num(stroke * 3.5, 1)} ${num(stroke * 2.5, 1)}` : null });
  inner += part('smooth', { 'stroke-width': num(stroke * 0.75, 2) });
  /* «контур» у OCCT — силуэт гладких поверхностей (бок цилиндра), а не внешняя граница предмета: рисуется
     вместе с рёбрами, одной толщиной, и сцепляется с ними в общие линии */
  groups.sharp.push(...groups.outline); groups.outline = [];
  inner += part('sharp', { 'stroke-width': num(stroke, 2) });
  const doc = svgDoc([0, 0, W, H], inner, { fill: 'none', stroke: color, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  return { doc, width: W, height: H, counts, points };
}
