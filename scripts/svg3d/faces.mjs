/**
 * Грани Three.js SVGRenderer → аккуратные контуры.
 *
 * SVGRenderer рисует каждый треугольник отдельным контуром в порядке «от дальнего к ближнему по центру
 * грани» — отсюда три беды: «рваная» сортировка (центр дальше, а грань ближе), волосяные щели между
 * соседними гранями (сглаживание краёв) и сотни узлов. Здесь:
 *
 *   1. порядок исправляется попарно: грани, проходящие друг сквозь друга, сначала режутся по линии
 *      пересечения; затем для каждой пары граней, перекрывающихся на экране, глубина сравнивается в
 *      точке перекрытия, и грани раскладываются так, чтобы дальняя шла раньше (топологическая
 *      сортировка; исходный порядок — при равенстве). Не раскладываются только перекрытия по кругу
 *      (A над B, B над C, C над A) — о них предупреждение;
 *   2. грани одного цвета склеиваются в один контур, если перестановка ничего не перекрывает;
 *      внутри контура общие рёбра убираются (треугольники → многоугольники), точки на одной прямой тоже;
 *   3. щели между гранями разного цвета закрывает обводка цветом заливки (толщина — в пикселях экрана).
 *
 * Вход: items в порядке отрисовки —
 *   грань  { p: [x1,y1,x2,y2,x3,y3], z: [z1,z2,z3] | null, fill: '#rrggbb', opacity: 1, base: '#rrggbb' | null }
 *   прочее { raw: true, d, attrs: {…}, bbox: [x1,y1,x2,y2] }  (линии, спрайты — не сортируются и не склеиваются)
 * z — глубина в координатах устройства (меньше — ближе), как отдаёт Projector.
 */
import { num, hexRgb } from './svg.mjs';

const AREA_EPS = 0.25;   /* px²: перекрытие меньше — не перекрытие */
const Z_EPS = 1e-5;      /* грани в одной плоскости — порядок не важен */
const SAT_EPS = 0.05;    /* px: касание рёбрами — не перекрытие */

const area2 = (p) => (p[2] - p[0]) * (p[5] - p[1]) - (p[4] - p[0]) * (p[3] - p[1]);
const bboxOf = (p) => [Math.min(p[0], p[2], p[4]), Math.min(p[1], p[3], p[5]), Math.max(p[0], p[2], p[4]), Math.max(p[1], p[3], p[5])];
const boxHit = (a, b, e = 0) => a[0] < b[2] - e && b[0] < a[2] - e && a[1] < b[3] - e && b[1] < a[3] - e;

/* перекрываются ли два треугольника площадью (разделяющая ось; касание в пределах eps — нет) */
function triOverlap(a, b, eps = SAT_EPS) {
  for (const t of [a, b]) {
    for (let i = 0; i < 3; i++) {
      const x1 = t[i * 2], y1 = t[i * 2 + 1], x2 = t[(i + 1) % 3 * 2], y2 = t[(i + 1) % 3 * 2 + 1];
      let nx = y2 - y1, ny = x1 - x2; const len = Math.hypot(nx, ny); if (!len) continue; nx /= len; ny /= len;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (let k = 0; k < 3; k++) { const da = a[k * 2] * nx + a[k * 2 + 1] * ny, db = b[k * 2] * nx + b[k * 2 + 1] * ny; if (da < minA) minA = da; if (da > maxA) maxA = da; if (db < minB) minB = db; if (db > maxB) maxB = db; }
      if (maxA <= minB + eps || maxB <= minA + eps) return false;
    }
  }
  return true;
}

/* многоугольник пересечения двух треугольников (отсечение Сазерленда — Ходжмана); [] — не пересекаются */
function clipTri(a, b) {
  let poly = [[a[0], a[1]], [a[2], a[3]], [a[4], a[5]]];
  const s = area2(b) >= 0 ? 1 : -1;
  for (let i = 0; i < 3 && poly.length; i++) {
    const x1 = b[i * 2], y1 = b[i * 2 + 1], x2 = b[(i + 1) % 3 * 2], y2 = b[(i + 1) % 3 * 2 + 1];
    const side = (p) => s * ((x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1));
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const cur = poly[k], nxt = poly[(k + 1) % poly.length]; const dc = side(cur), dn = side(nxt);
      if (dc >= 0) out.push(cur);
      if ((dc >= 0) !== (dn >= 0)) { const t = dc / (dc - dn); out.push([cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t]); }
    }
    poly = out;
  }
  return poly;
}
const polyArea = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };

/* глубина грани в точке экрана (z на экране меняется линейно) */
function zAt(f, x, y) {
  const p = f.p; const d = area2(p); if (!d) return (f.z[0] + f.z[1] + f.z[2]) / 3;
  const w1 = ((p[2] - x) * (p[5] - y) - (p[4] - x) * (p[3] - y)) / d;
  const w2 = ((p[4] - x) * (p[1] - y) - (p[0] - x) * (p[5] - y)) / d;
  return w1 * f.z[0] + w2 * f.z[1] + (1 - w1 - w2) * f.z[2];
}

/**
 * Исправить порядок отрисовки по попарным сравнениям глубины.
 * → { order: индексы граней в новом порядке, fixed — пар, где исходный порядок был неверным (при разных заливках),
 *     crossing — взаимно пересекающихся пар, cycles — разорванных циклов, pairs — перекрывающихся пар }
 */
export function depthOrder(faces) {
  const n = faces.length; const after = Array.from({ length: n }, () => []); const indeg = new Int32Array(n);
  let fixed = 0, crossing = 0, pairs = 0, fixedArea = 0, crossArea = 0;
  for (let i = 0; i < n; i++) {
    const A = faces[i];
    for (let j = i + 1; j < n; j++) {
      const B = faces[j];
      if (!boxHit(A.box, B.box, SAT_EPS) || !triOverlap(A.p, B.p)) continue;
      const poly = clipTri(A.p, B.p); const ar = poly.length >= 3 ? polyArea(poly) : 0;
      if (ar < AREA_EPS) continue;
      pairs++;
      let cx = 0, cy = 0; for (const q of poly) { cx += q[0]; cy += q[1]; } cx /= poly.length; cy /= poly.length;
      const d = zAt(A, cx, cy) - zAt(B, cx, cy);   /* > 0: A дальше B */
      /* знак разности в углах перекрытия (чуть внутрь): разные знаки — грани пересекаются в пространстве */
      let pos = 0, neg = 0;
      for (const q of poly) { const x = q[0] + (cx - q[0]) * 0.05, y = q[1] + (cy - q[1]) * 0.05; const dd = zAt(A, x, y) - zAt(B, x, y); if (dd > Z_EPS) pos++; else if (dd < -Z_EPS) neg++; }
      if (pos && neg) { crossing++; crossArea += ar; }
      if (Math.abs(d) <= Z_EPS) continue;
      if (d > 0) { after[i].push(j); indeg[j]++; }            /* A дальше: A раньше B — как и было */
      else { after[j].push(i); indeg[i]++; if (A.fill !== B.fill || A.opacity !== B.opacity) { fixed++; fixedArea += ar; } }  /* B дальше, а рисовался поверх */
    }
  }
  /* топологическая сортировка; из готовых — с наименьшим исходным номером (исходный порядок сохраняется, где можно) */
  const order = []; const done = new Uint8Array(n); let cycles = 0;
  const heap = []; const push = (v) => { heap.push(v); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p] <= heap[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l] < heap[m]) m = l; if (r < heap.length && heap[r] < heap[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (let i = 0; i < n; i++) if (!indeg[i]) push(i);
  let next = 0;
  while (order.length < n) {
    if (!heap.length) { while (done[next]) next++; cycles++; indeg[next] = 0; push(next); }   /* цикл: рвём на грани с наименьшим номером */
    const v = pop(); if (done[v]) continue; done[v] = 1; order.push(v);
    for (const w of after[v]) if (!done[w] && --indeg[w] === 0) push(w);
  }
  return { order, fixed, crossing, cycles, pairs, fixedArea, crossArea };
}

/* ---------- грани, проходящие друг сквозь друга ---------- */

/* пересекаются ли две грани в пространстве там, где перекрываются на экране */
function crosses(A, B) {
  if (!boxHit(A.box, B.box, SAT_EPS) || !triOverlap(A.p, B.p)) return false;
  const poly = clipTri(A.p, B.p); if (poly.length < 3 || polyArea(poly) < AREA_EPS) return false;
  let cx = 0, cy = 0; for (const q of poly) { cx += q[0]; cy += q[1]; } cx /= poly.length; cy /= poly.length;
  let pos = 0, neg = 0;
  for (const q of poly) { const x = q[0] + (cx - q[0]) * 0.05, y = q[1] + (cy - q[1]) * 0.05; const dd = zAt(A, x, y) - zAt(B, x, y); if (dd > Z_EPS) pos++; else if (dd < -Z_EPS) neg++; }
  return pos > 0 && neg > 0;
}
/* разрезать грань A по линии, где она проходит сквозь плоскость грани B: куски лежат целиком перед B или за ней */
function splitByPlane(A, B) {
  const dz = [0, 1, 2].map((i) => A.z[i] - zAt(B, A.p[i * 2], A.p[i * 2 + 1]));
  if (!(dz.some((d) => d > Z_EPS) && dz.some((d) => d < -Z_EPS))) return null;
  const V = [0, 1, 2].map((i) => [A.p[i * 2], A.p[i * 2 + 1], A.z[i]]); const out = [];
  for (const sign of [1, -1]) {
    const poly = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3; const di = dz[i] * sign, dj = dz[j] * sign;
      if (di >= 0) poly.push(V[i]);
      if ((di > 0 && dj < 0) || (di < 0 && dj > 0)) { const t = di / (di - dj); poly.push([V[i][0] + (V[j][0] - V[i][0]) * t, V[i][1] + (V[j][1] - V[i][1]) * t, V[i][2] + (V[j][2] - V[i][2]) * t]); }
    }
    for (let k = 1; k < poly.length - 1; k++) {
      const p = [poly[0][0], poly[0][1], poly[k][0], poly[k][1], poly[k + 1][0], poly[k + 1][1]];
      if (Math.abs(area2(p)) < 1e-6) continue;
      out.push({ ...A, p, z: [poly[0][2], poly[k][2], poly[k + 1][2]], box: bboxOf(p) });
    }
  }
  return out.length > 1 ? out : null;
}
/**
 * Разрезать взаимно пересекающиеся грани по линиям пересечения (до maxPasses проходов): после этого порядок
 * «дальняя раньше» существует и для предметов, вставленных друг в друга. Куски одной грани — одного цвета и в
 * одной плоскости: при склейке они снова сходятся в один контур, если между ними никто не встал.
 * → { faces, split — сколько граней разрезано, left — сколько пересекающихся пар осталось }
 */
export function splitCrossings(faces, maxPasses = 6) {
  let split = 0, left = 0;
  for (let pass = 0; pass <= maxPasses; pass++) {
    const pairs = [];
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) if (crosses(faces[i], faces[j])) pairs.push([i, j]);
    left = pairs.length;
    if (!left || pass === maxPasses || faces.length > 20000) break;
    const cut = new Map();
    for (const [i, j] of pairs) {
      for (const [a, b] of [[i, j], [j, i]]) { if (cut.has(a)) continue; const pieces = splitByPlane(faces[a], faces[b]); if (pieces) { cut.set(a, pieces); split++; break; } }
    }
    if (!cut.size) break;
    faces = faces.flatMap((f, i) => cut.get(i) || [f]);
  }
  return { faces, split, left };
}

/* ---------- ступени тона ---------- */
const toLin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => { const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
const lum = (rgb) => 0.2126 * toLin(rgb[0]) + 0.7152 * toLin(rgb[1]) + 0.0722 * toLin(rgb[2]);
/**
 * Свести освещённые оттенки каждого материала к N ступеням («плакатный» вид, меньше цветов — больше склеек).
 * Нужен base — цвет материала у каждой грани; оттенок цвета света при этом теряется.
 */
export function quantizeTones(faces, tones) {
  const by = new Map();
  for (const f of faces) { if (!f.base) continue; const b = hexRgb(f.base), c = hexRgb(f.fill); const lb = lum(b); if (lb <= 1e-4) continue; f.k = Math.sqrt(lum(c) / lb); if (!by.has(f.base)) by.set(f.base, []); by.get(f.base).push(f); }
  for (const [base, list] of by) {
    let lo = Infinity, hi = -Infinity; for (const f of list) { if (f.k < lo) lo = f.k; if (f.k > hi) hi = f.k; }
    const b = hexRgb(base).map(toLin);
    for (const f of list) {
      const step = hi - lo < 1e-6 || tones < 2 ? 0 : Math.round((f.k - lo) / (hi - lo) * (tones - 1));
      const k = (tones < 2 ? (lo + hi) / 2 : lo + (hi - lo) * step / (tones - 1)) ** 2;
      f.fill = '#' + b.map((v) => toSrgb(v * k).toString(16).padStart(2, '0')).join('');
    }
  }
}

/* ---------- склейка по заливке ---------- */

/**
 * Грани (уже в верном порядке) и прочие элементы → группы одной заливки. Грань уходит в самую позднюю
 * группу своего цвета, если по пути назад не перекрывает ни одной чужой грани (тогда перестановка не видна).
 */
export function groupByFill(items, { merge = true } = {}) {
  const groups = [];
  for (const it of items) {
    if (it.raw) { groups.push({ raw: it, box: it.bbox || [-Infinity, -Infinity, Infinity, Infinity], faces: [] }); continue; }
    const key = `${it.fill}/${it.opacity}`;
    let target = null;
    for (let k = groups.length - 1; k >= 0; k--) {
      const g = groups[k];
      if (!g.raw && g.key === key) { target = g; break; }
      if (!merge) break;
      if (!boxHit(g.box, it.box, SAT_EPS)) continue;
      if (g.raw || g.faces.some((f) => boxHit(f.box, it.box, SAT_EPS) && triOverlap(f.p, it.p))) break;
    }
    if (!target) { target = { key, fill: it.fill, opacity: it.opacity, faces: [], box: [Infinity, Infinity, -Infinity, -Infinity] }; groups.push(target); }
    target.faces.push(it);
    target.box = [Math.min(target.box[0], it.box[0]), Math.min(target.box[1], it.box[1]), Math.max(target.box[2], it.box[2]), Math.max(target.box[3], it.box[3])];
  }
  return groups;
}

/* ---------- объединение треугольников одной группы в контуры ---------- */

/** Треугольники → замкнутые контуры без внутренних рёбер; координаты на сетке 10^-precision. → строка d */
export function unionPath(faces, precision = 1) {
  const k = 10 ** precision; const edges = new Map(); const pts = new Map();
  const id = (x, y) => { const ix = Math.round(x * k), iy = Math.round(y * k); const key = `${ix},${iy}`; if (!pts.has(key)) pts.set(key, [ix, iy]); return key; };
  for (const f of faces) {
    let v = [id(f.p[0], f.p[1]), id(f.p[2], f.p[3]), id(f.p[4], f.p[5])];
    const [a, b, c] = v.map((q) => pts.get(q)); const ar = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (!ar) continue;                    /* выродился на сетке */
    if (ar < 0) v = [v[0], v[2], v[1]];   /* единое направление обхода: правило nonzero даёт объединение */
    for (let i = 0; i < 3; i++) {
      const from = v[i], to = v[(i + 1) % 3]; const rev = `${to}|${from}`; const cnt = edges.get(rev) || 0;
      if (cnt > 0) { if (cnt === 1) edges.delete(rev); else edges.set(rev, cnt - 1); } else { const e = `${from}|${to}`; edges.set(e, (edges.get(e) || 0) + 1); }
    }
  }
  const out = new Map();   /* вершина → куда идут рёбра (в порядке появления — детерминированно) */
  for (const [e, cnt] of edges) { const [from, to] = e.split('|'); for (let i = 0; i < cnt; i++) { if (!out.has(from)) out.set(from, []); out.get(from).push(to); } }
  const loops = [];
  for (const start of out.keys()) {
    while (out.get(start) && out.get(start).length) {
      const loop = [start]; let cur = start;
      for (;;) { const list = out.get(cur); if (!list || !list.length) break; const nxt = list.shift(); if (nxt === start) break; loop.push(nxt); cur = nxt; }
      if (loop.length >= 3) loops.push(loop.map((q) => pts.get(q)));
    }
  }
  let d = '';
  for (let loop of loops) {
    /* точки на одной прямой — лишние (на целой сетке сравнение точное) */
    let changed = true;
    while (changed && loop.length > 3) {
      changed = false;
      for (let i = 0; i < loop.length; i++) {
        const a = loop[(i + loop.length - 1) % loop.length], b = loop[i], c = loop[(i + 1) % loop.length];
        const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
        if (cr === 0 && dot >= 0) { loop = loop.filter((_, x) => x !== i); changed = true; break; }
      }
    }
    if (loop.length < 3) continue;
    d += loop.map((q, i) => `${i ? 'L' : 'M'}${num(q[0] / k, precision)} ${num(q[1] / k, precision)}`).join('') + 'Z';
  }
  return d;
}

/**
 * Весь путь: порядок → ступени тона → склейка → контуры.
 * → { paths: [{ d, fill, opacity } | { raw }], stats }
 */
export function processFaces(items, { precision = 1, merge = true, sort = true, tones = 0 } = {}) {
  let faces = []; let hasRaw = false;
  const list = items.map((it) => { if (it.raw) { hasRaw = true; return it; } const f = { ...it, box: bboxOf(it.p) }; faces.push(f); return f; });
  const stats = { faces: faces.length, raw: list.length - faces.length, sorted: false, fixed: 0, crossing: 0, split: 0, cycles: 0, pairs: 0, fixedShare: 0, crossShare: 0, colorsBefore: new Set(faces.map((f) => f.fill)).size };
  let ordered = list;
  const canSort = sort && faces.length > 1 && faces.every((f) => Array.isArray(f.z));
  if (canSort && !hasRaw) {
    const sp = splitCrossings(faces); faces = sp.faces; stats.split = sp.split;
    const r = depthOrder(faces);
    let total = 0; for (const f of faces) total += Math.abs(area2(f.p)) / 2;
    Object.assign(stats, { fixed: r.fixed, crossing: r.crossing, cycles: r.cycles, pairs: r.pairs, fixedShare: total ? r.fixedArea / total : 0, crossShare: total ? r.crossArea / total : 0, sorted: true });
    ordered = r.order.map((i) => faces[i]);
  } else if (faces.length > 1 && faces.every((f) => Array.isArray(f.z))) {
    const r = depthOrder(faces);   /* порядок не трогаем (--no-sort или в сцене линии и спрайты) — только считаем, что с ним не так */
    Object.assign(stats, { crossing: r.crossing, cycles: r.cycles, pairs: r.pairs, unfixed: r.fixed });
  }
  if (tones > 0) quantizeTones(faces, tones);
  stats.colors = new Set(faces.map((f) => f.fill)).size;
  const groups = groupByFill(ordered, { merge });
  const paths = [];
  for (const g of groups) {
    if (g.raw) { paths.push({ raw: g.raw }); continue; }
    const d = unionPath(g.faces, precision);
    if (d) paths.push({ d, fill: g.fill, opacity: g.opacity });
  }
  stats.paths = paths.length;
  return { paths, stats };
}
