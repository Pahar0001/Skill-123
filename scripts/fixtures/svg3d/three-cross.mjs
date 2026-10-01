/* Стенд самопроверки svg3d.mjs: две плиты крест-накрест, проходящие друг сквозь друга. Сортировка «по центру
   грани» здесь ошибается неизбежно; исправление порядка должно разрезать грани по линии пересечения. */
export const view = { size: [200, 200], pad: 12, camera: { type: 'ortho', dir: [1, 0.8, 1.3] } };
export const palette = { moss: '#5E7A33', clay: '#C8643C' };

export function build({ THREE, root, color, lights }) {
  lights({ ambient: 0.4, key: { dir: [0.3, 1, 0.6], power: 0.6 } });
  const a = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 1.2), new THREE.MeshLambertMaterial({ color: color('moss') }));
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 3), new THREE.MeshLambertMaterial({ color: color('clay') }));
  a.rotation.z = 0.35; b.rotation.x = 0.35;
  root.add(a, b);
}
