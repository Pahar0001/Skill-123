/* Общие заготовки геометрии для сцен декора. */
import * as THREE from 'three';

/** Лист: сплющенный эллипсоид с заострением к кончику, изгибом вверх и складкой по жилке.
 *  Основание — в начале координат, лист тянется вдоль +X. */
export function leafGeometry({ len = 2, width = 1, thick = 0.16, curl = 0.25, fold = 0.18, tip = 0.55, twist = 0, veins = 9 } = {}) {
  const g = new THREE.SphereGeometry(1, 192, 112);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const u = (v.x + 1) / 2;                                   // 0 — основание, 1 — кончик
    const taper = 1 - tip * Math.pow(u, 2.2);                    // к кончику уже
    const base = 0.55 + 0.45 * Math.min(1, u * 4);               // у черешка тоже уже
    let x = u * len;
    let z = v.z * (width / 2) * taper * base;
    let y = v.y * (thick / 2) * (0.6 + 0.4 * Math.sin(Math.PI * u));
    y += fold * Math.abs(z);                                     // половинки приподняты — складка по жилке
    if (veins && v.y > 0) {                                      // боковые прожилки ёлочкой на лицевой стороне и желобок по центральной
      const side = Math.abs(v.z), rib = Math.pow(0.5 + 0.5 * Math.cos((u * veins - side * 2.2) * Math.PI * 2), 6);
      y -= thick * 0.11 * rib * Math.min(1, side * 5) * Math.sin(Math.PI * u) + thick * 0.2 * Math.exp(-side * side * 420) * Math.sin(Math.PI * Math.min(1, u * 1.15));
    }
    y += curl * len * u * u;                                     // изгиб вверх к кончику
    if (twist) { const a = twist * u, c = Math.cos(a), s = Math.sin(a); const y2 = y * c - z * s; z = y * s + z * c; y = y2; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Шестиугольник (плоской гранью вверх не важно): радиус по вершинам r, со скруглением углов k (0..0.4). */
export function hexShape(r = 1, k = 0.18, rot = Math.PI / 6) {
  const pts = [];
  for (let i = 0; i < 6; i++) { const a = rot + (i * Math.PI) / 3; pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
  return roundedPolygon(pts, k * r);
}

/** Многоугольник со скруглёнными углами (квадратичные кривые в вершинах). */
export function roundedPolygon(pts, rad) {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const d1 = p0.clone().sub(p1), d2 = p2.clone().sub(p1);
    const r1 = Math.min(rad, d1.length() / 2), r2 = Math.min(rad, d2.length() / 2);
    const a = p1.clone().add(d1.normalize().multiplyScalar(r1));
    const b = p1.clone().add(d2.normalize().multiplyScalar(r2));
    if (i === 0) s.moveTo(a.x, a.y); else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(p1.x, p1.y, b.x, b.y);
  }
  s.closePath();
  return s;
}

/** Прямоугольник со скруглёнными углами, центр в нуле. */
export function roundedRect(w, h, r) {
  const x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  const s = new THREE.Shape();
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Пластина из формы: выдавливание с мягкой фаской, центр по толщине в нуле. */
export function plate(shape, depth, bevel = 0.04, seg = 5) {
  const b = Math.min(bevel, depth / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: seg, curveSegments: 24 });
  g.translate(0, 0, -(depth - 2 * b) / 2);
  return g;
}

/** Трубка по точкам (сглаженная кривая). */
export function tube(points, radius = 0.06, seg = 80, radial = 18, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, seg, radius, radial, closed);
}

/** Трубка переменной толщины: radiusAt(u) — радиус по длине 0..1. */
export function taperedTube(points, radiusAt, seg = 80, radial = 18) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, nrm = g.attributes.normal;
  const frames = curve.computeFrenetFrames(seg, false);
  const c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, c);
    const r = radiusAt(i / seg);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + nrm.getX(k) * r, c.y + nrm.getY(k) * r, c.z + nrm.getZ(k) * r);
    }
  }
  void frames;
  g.computeVertexNormals();
  return g;
}

export const mesh = (geo, mat, pos, rot, scale, order) => {
  const m = new THREE.Mesh(geo, mat);
  if (order) m.rotation.order = order;
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale != null) { if (Array.isArray(scale)) m.scale.set(...scale); else m.scale.setScalar(scale); }
  return m;
};

/** Детерминированный датчик случайных чисел. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
