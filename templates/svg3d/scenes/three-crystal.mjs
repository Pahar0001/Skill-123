/* Друза кристаллов — гранёный предмет-украшение (Three.js через SVGRenderer).
   node svg3d.mjs three scenes/three-crystal.mjs --out out
   Кристалл — шестигранная призма с пирамидой сверху; друза — пять кристаллов разного наклона на плоском
   основании. Кристаллы входят в основание и друг в друга нарочно: svg3d.mjs режет такие грани по линии
   пересечения, и порядок «дальняя раньше» остаётся верным. */
export const view = { size: [300, 320], pad: 10, camera: { type: 'ortho', dir: [0.8, 0.7, 1] } };
export const palette = { moss: '#5E7A33', leaf: '#8DB04A', sun: '#E8B647', ink: '#16301F' };

export function build({ THREE, root, color, lights }) {
  lights({ ambient: 0.3, key: { dir: [-0.5, 1, 0.6], power: 0.8 }, fill: { dir: [1, 0.2, 0.3], power: 0.28 } });
  const mat = (name) => new THREE.MeshLambertMaterial({ color: color(name) });
  const crystal = (r, h, tip, name, pos, tilt) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.86, h, 6, 1), mat(name)); body.position.y = h / 2; g.add(body);
    const top = new THREE.Mesh(new THREE.ConeGeometry(r, tip, 6, 1), mat(name)); top.position.y = h + tip / 2; g.add(top);
    g.position.set(...pos); g.rotation.set(tilt[0], tilt[1], tilt[2]); root.add(g);
  };
  crystal(0.62, 2.5, 0.95, 'leaf', [0, 0, 0], [0.06, 0.3, -0.05]);
  crystal(0.44, 1.7, 0.7, 'moss', [-0.95, 0, 0.3], [0.1, 0.1, 0.42]);
  crystal(0.4, 1.4, 0.62, 'sun', [0.95, 0, 0.25], [0.12, 0.5, -0.46]);
  crystal(0.32, 1.0, 0.5, 'moss', [0.3, 0, 0.95], [0.5, 0.2, -0.12]);
  crystal(0.3, 0.9, 0.46, 'leaf', [-0.5, 0, 0.9], [0.44, 0.6, 0.28]);
  /* основание — низкая плита с неровным шестиугольным краем */
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.05, 0.28, 7, 1), mat('ink')); base.position.y = -0.1; root.add(base);
}
