/* Стенд самопроверки svg3d.mjs: три бруска разной высоты и пирамида. Бруски стоят вплотную — центры их граней
   обманывают сортировку «по центру» (проверяется исправление порядка), верхние грани одного цвета склеиваются. */
export const view = { size: [200, 200], pad: 10, camera: { type: 'ortho', dir: [1, 0.9, 1.2] } };
export const palette = { moss: '#5E7A33', sun: '#E8B647', clay: '#C8643C' };

export function build({ THREE, root, color, lights }) {
  lights({ ambient: 0.35, key: { dir: [0.3, 1, 0.6], power: 0.7 } });
  const mat = (name) => new THREE.MeshLambertMaterial({ color: color(name) });
  const bar = (x, z, h, name) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, h, 1), mat(name)); m.position.set(x, h / 2, z); root.add(m); };
  bar(0, 0, 2.4, 'moss'); bar(1, 0, 1.2, 'moss'); bar(0, 1, 0.6, 'sun'); bar(1, 1, 3, 'sun');
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 4), mat('clay')); cone.position.set(-1.2, 0.6, 0.5); cone.rotation.y = Math.PI / 4; root.add(cone);
}
