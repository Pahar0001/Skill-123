/**
 * Ломаная → плавные кривые Безье (алгоритм Шнайдера, «Graphics Gems», 1990).
 *
 * Ядро CAD отдаёт дуги и сплайны частыми точками: окружность — сотня отрезков, файл тяжёлый, а при
 * увеличении видны грани. Здесь ломаная режется в углах, и каждый плавный участок заменяется кубическими
 * кривыми с отклонением не больше tol; прямые остаются прямыми.
 *
 *   fitPolyline(pts, closed, { tol: 0.12, corner: 32, precision: 2 }) → { d, nodes }
 *   pts — [[x, y], …] (у замкнутой — без повтора первой точки в конце); corner — излом в градусах, с которого
 *   точка считается углом.
 */
import { num } from './svg.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a); return l ? [a[0] / l, a[1] / l] : [0, 0]; };

const B0 = (u) => (1 - u) ** 3, B1 = (u) => 3 * u * (1 - u) ** 2, B2 = (u) => 3 * u * u * (1 - u), B3 = (u) => u ** 3;
const bezAt = (b, t) => { const m = 1 - t; return [m * m * m * b[0][0] + 3 * m * m * t * b[1][0] + 3 * m * t * t * b[2][0] + t * t * t * b[3][0], m * m * m * b[0][1] + 3 * m * m * t * b[1][1] + 3 * m * t * t * b[2][1] + t * t * t * b[3][1]]; };

function chordParams(d, first, last) {
  const u = [0]; for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + len(sub(d[i], d[i - 1])));
  const total = u[u.length - 1] || 1; return u.map((v) => v / total);
}
function generate(d, first, last, u, t1, t2) {
  const p0 = d[first], p3 = d[last]; let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i <= last - first; i++) {
    const a0 = mul(t1, B1(u[i])), a1 = mul(t2, B2(u[i]));
    c00 += dot(a0, a0); c01 += dot(a0, a1); c11 += dot(a1, a1);
    const tmp = sub(d[first + i], add(mul(p0, B0(u[i]) + B1(u[i])), mul(p3, B2(u[i]) + B3(u[i]))));
    x0 += dot(a0, tmp); x1 += dot(a1, tmp);
  }
  const det = c00 * c11 - c01 * c01; const seg = len(sub(p3, p0)); const eps = 1e-6 * seg;
  let al = 0, ar = 0;
  if (Math.abs(det) > 1e-12) { al = (x0 * c11 - x1 * c01) / det; ar = (c00 * x1 - c01 * x0) / det; }
  if (al < eps || ar < eps) al = ar = seg / 3;   /* вырожденный случай — правило «треть хорды» */
  return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3];
}
function maxError(d, first, last, bez, u) {
  let max = 0, split = Math.floor((last - first + 1) / 2) + first;
  for (let i = 1; i < last - first; i++) { const p = bezAt(bez, u[i]); const e = (p[0] - d[first + i][0]) ** 2 + (p[1] - d[first + i][1]) ** 2; if (e >= max) { max = e; split = first + i; } }
  return [max, split];
}
/* уточнить параметр точки одним шагом Ньютона */
function reparam(d, first, last, u, bez) {
  const q1 = [0, 1, 2].map((i) => mul(sub(bez[i + 1], bez[i]), 3)); const q2 = [0, 1].map((i) => mul(sub(q1[i + 1], q1[i]), 2));
  const quad = (q, t) => { const m = 1 - t; return [m * m * q[0][0] + 2 * m * t * q[1][0] + t * t * q[2][0], m * m * q[0][1] + 2 * m * t * q[1][1] + t * t * q[2][1]]; };
  const lin = (q, t) => [q[0][0] + (q[1][0] - q[0][0]) * t, q[0][1] + (q[1][1] - q[0][1]) * t];
  return u.map((t, i) => {
    const p = bezAt(bez, t), d1 = quad(q1, t), d2 = lin(q2, t); const diff = sub(p, d[first + i]);
    const den = dot(d1, d1) + dot(diff, d2); return Math.abs(den) < 1e-12 ? t : Math.max(0, Math.min(1, t - dot(diff, d1) / den));
  });
}
function fitCubic(d, first, last, t1, t2, err2, out, depth = 0) {
  if (last - first === 1) { const k = len(sub(d[last], d[first])) / 3; out.push([d[first], add(d[first], mul(t1, k)), add(d[last], mul(t2, k)), d[last]]); return; }
  let u = chordParams(d, first, last); let bez = generate(d, first, last, u, t1, t2); let [e, split] = maxError(d, first, last, bez, u);
  if (e < err2) { out.push(bez); return; }
  if (e < err2 * 16) {
    for (let i = 0; i < 4; i++) { const up = reparam(d, first, last, u, bez); bez = generate(d, first, last, up, t1, t2); [e, split] = maxError(d, first, last, bez, up); if (e < err2) { out.push(bez); return; } u = up; }
  }
  if (depth > 40 || split <= first || split >= last) { out.push(bez); return; }
  let tc = norm(sub(d[split - 1], d[split + 1])); if (!tc[0] && !tc[1]) tc = norm(sub(d[split - 1], d[split]));
  fitCubic(d, first, split, t1, tc, err2, out, depth + 1);
  fitCubic(d, split, last, mul(tc, -1), t2, err2, out, depth + 1);
}

/* отклонение точек участка от хорды */
function straight(pts, tol) {
  const a = pts[0], b = pts[pts.length - 1]; const ab = sub(b, a); const l = len(ab); if (!l) return false;
  for (let i = 1; i < pts.length - 1; i++) if (Math.abs(ab[0] * (pts[i][1] - a[1]) - ab[1] * (pts[i][0] - a[0])) / l > tol) return false;
  return true;
}

export function fitPolyline(points, closed, { tol = 0.12, corner = 32, precision = 2 } = {}) {
  /* подряд совпадающие точки мешают касательным */
  let pts = points.filter((p, i) => i === 0 || len(sub(p, points[i - 1])) > 1e-9);
  if (closed && pts.length > 2 && len(sub(pts[0], pts[pts.length - 1])) < 1e-9) pts = pts.slice(0, -1);
  const n = pts.length; const P = (v) => `${num(v[0], precision)} ${num(v[1], precision)}`;
  if (n < 2) return { d: '', nodes: 0 };
  if (n === 2) return { d: `M${P(pts[0])}L${P(pts[1])}`, nodes: 2 };
  const cosC = Math.cos(corner * Math.PI / 180);
  const isCorner = (i) => { const a = norm(sub(pts[i], pts[(i - 1 + n) % n])), b = norm(sub(pts[(i + 1) % n], pts[i])); return dot(a, b) < cosC; };
  const breaks = [];
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) if (isCorner(i)) breaks.push(i);
  let ring = pts, smoothSeam = false;
  if (closed) {
    /* начать контур с угла; углов нет (окружность) — шов гладкий, касательная в нём общая */
    const start = breaks.length ? breaks[0] : 0; smoothSeam = !breaks.length;
    ring = pts.slice(start).concat(pts.slice(0, start)).concat([pts[start]]);
    const shifted = breaks.map((b) => (b - start + n) % n).filter((b) => b > 0).sort((a, b) => a - b);
    breaks.length = 0; breaks.push(...shifted);
  }
  const cuts = [0, ...breaks, ring.length - 1];
  let d = `M${P(ring[0])}`; let nodes = 1;
  for (let c = 0; c < cuts.length - 1; c++) {
    const run = ring.slice(cuts[c], cuts[c + 1] + 1);
    if (run.length < 2) continue;
    const last = c === cuts.length - 2;
    if (run.length === 2 || straight(run, tol)) { if (!(closed && last)) d += `L${P(run[run.length - 1])}`; nodes++; continue; }
    let t1 = norm(sub(run[1], run[0])), t2 = norm(sub(run[run.length - 2], run[run.length - 1]));
    if (smoothSeam) { const t = norm(sub(ring[1], ring[ring.length - 2])); t1 = t; t2 = mul(t, -1); }
    const out = []; fitCubic(run, 0, run.length - 1, t1, t2, tol * tol, out);
    for (const b of out) {
      /* кривая, не отличимая от прямой, — прямая */
      const ab = sub(b[3], b[0]); const l = len(ab) || 1; const off = Math.max(Math.abs(ab[0] * (b[1][1] - b[0][1]) - ab[1] * (b[1][0] - b[0][0])), Math.abs(ab[0] * (b[2][1] - b[0][1]) - ab[1] * (b[2][0] - b[0][0]))) / l;
      d += off < tol / 3 ? `L${P(b[3])}` : `C${P(b[1])} ${P(b[2])} ${P(b[3])}`; nodes++;
    }
  }
  if (closed) d += 'Z';
  return { d, nodes };
}
