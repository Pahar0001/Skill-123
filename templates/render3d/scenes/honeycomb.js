/* Соты: гроздь шестигранных ячеек с мёдом. Аналог сиреневых «кристаллов» донора — у медоносов. */
import { hexShape, plate, mesh } from './_kit.js';

export function build({ THREE, root, PAL, clay, honey, gloss, q }) {
  const g = new THREE.Group();
  const R = 1, WALL = 0.16, DEPTH = 0.78;
  const variant = q.get('variant') || 'four';

  /* стенка ячейки: шестиугольник с шестиугольным отверстием */
  const outer = hexShape(R, 0.16);
  const hole = hexShape(R - WALL, 0.14);
  outer.holes.push(new THREE.Path(hole.getPoints(48)));
  const wallGeo = plate(outer, DEPTH, 0.07, 6);
  const floorGeo = plate(hexShape(R - WALL * 0.6, 0.14), 0.1, 0.03, 3);
  const wax = clay(PAL.honeyLight, { roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.18 });
  const waxDark = clay('#F2B94A', { roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.2 });

  /* мёд: призма чуть ниже края с выпуклой фаской — мениск */
  const fill = (level) => plate(hexShape(R - WALL - 0.01, 0.14), DEPTH * level, 0.09, 8);
  const honeyMat = honey(PAL.honey);
  const honeyDeep = honeyMat;   // один янтарный мёд: отдельный «тёмный» после тональной кривой уходил в персиковый

  /* плотная шестиугольная укладка: шаг по ширине √3·R, по высоте 1.5·R */
  const dx = Math.sqrt(3) * R * 0.985, dy = 1.5 * R * 0.985;
  const cells = variant === 'trio'
    ? [[0, 0, 0.9, 0], [1, 0, 0.55, 1], [0.5, 1, 0.0, 0]]
    : variant === 'row'
      ? [[0, 0, 0.9, 0], [1, 0, 0.6, 1], [2, 0, 0.0, 0], [0.5, 1, 0.75, 1], [1.5, 1, 0.9, 0]]
      : [[0, 0, 0.92, 0], [1, 0, 0.62, 1], [0.5, 1, 0.86, 1], [1.5, 1, 0.0, 0], [-0.5, 1, 0.4, 0]];
  for (const [cx, cy, level, dark] of cells) {
    const c = new THREE.Group();
    c.position.set(cx * dx, cy * dy, 0);
    c.add(mesh(wallGeo, dark ? waxDark : wax));
    c.add(mesh(floorGeo, waxDark, [0, 0, -DEPTH / 2 + 0.05]));
    if (level > 0) {
      const h = DEPTH * level;
      c.add(mesh(fill(level), dark ? honeyDeep : honeyMat, [0, 0, -DEPTH / 2 + 0.1 + h / 2]));
    }
    g.add(c);
  }

  /* капля мёда стекает с нижней ячейки */
  const drop = new THREE.SphereGeometry(0.2, 40, 28);
  const p = drop.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0) { const k = 1 - Math.pow(y / 0.2, 1.4) * 0.75; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, y * 2.3); } }
  drop.computeVertexNormals();
  g.add(mesh(drop, gloss(PAL.honey, { roughness: 0.08, emissive: new THREE.Color(PAL.honeyDeep), emissiveIntensity: 0.18 }), [0.02 * dx, -R - 0.42, DEPTH / 2 - 0.12]));

  const box = new THREE.Box3().setFromObject(g); const c = box.getCenter(new THREE.Vector3());
  g.position.sub(c);
  const wrap = new THREE.Group(); wrap.add(g);
  wrap.rotation.set(-0.32, 0.5, 0.18);
  root.add(wrap);
  return { view: [0, 0.05, 1], fov: 26, margin: 1.05 };
}
