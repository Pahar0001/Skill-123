/* Соты — гранёный предмет-украшение (Three.js через SVGRenderer): шестигранные ячейки разной высоты.
   node svg3d.mjs three scenes/three-honeycomb.mjs --out out
   Правила сцены для SVG: только плоские грани (MeshLambertMaterial), предметы не проходят друг сквозь друга
   (между ячейками зазор), света два — тогда у каждой стороны свой ровный оттенок, а верхние грани
   одного цвета склеиваются в один контур. Текстур, теней и бликов в SVG нет. */
export const view = { size: [320, 300], pad: 10, camera: { type: 'ortho', dir: [0.9, 1.05, 1] } };
export const palette = { sun: '#E8B647', honey: '#D99A2B', moss: '#5E7A33', paper: '#F4F1E4' };

export function build({ THREE, root, color, lights }) {
  /* сила света — в линейном пространстве: окружающий 0.34 + верхний 0.74 дают верхней грани почти чистый цвет палитры */
  lights({ ambient: 0.34, key: { dir: [0.25, 1, 0.45], power: 0.74 }, fill: { dir: [1, 0.15, 0.2], power: 0.2 } });
  const R = 1, GAP = 0.1, STEP = Math.sqrt(3) * R + GAP;
  const mats = { sun: new THREE.MeshLambertMaterial({ color: color('sun') }), honey: new THREE.MeshLambertMaterial({ color: color('honey') }), moss: new THREE.MeshLambertMaterial({ color: color('moss') }), paper: new THREE.MeshLambertMaterial({ color: color('paper') }) };
  /* постоянный «случайный» ряд: одна и та же раскладка при каждом запуске */
  let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const cell = (q, r) => {
    const x = STEP * (q + r / 2), z = STEP * r * Math.sqrt(3) / 2;
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    const h = 0.5 + rnd() * 1.5 + (2 - ring) * 0.25;
    const pick = rnd(); const mat = pick < 0.14 ? mats.moss : pick < 0.26 ? mats.paper : pick < 0.6 ? mats.honey : mats.sun;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, h, 6, 1), mat);
    m.position.set(x, h / 2, z); root.add(m);
  };
  for (let q = -2; q <= 2; q++) for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) cell(q, r);
}
