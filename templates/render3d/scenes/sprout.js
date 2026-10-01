/* Росток: семя, стебель и две семядоли. Аналог ракеты донора — «идёт в рост». */
import { leafGeometry, taperedTube, mesh } from './_kit.js';

export function build({ THREE, root, PAL, clay, gloss, leafy }) {
  const g = new THREE.Group();

  /* семя: оболочка лопнула — нижняя чаша и откинутая крышка */
  const seedMat = gloss(PAL.bark, { roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const half = new THREE.SphereGeometry(0.66, 56, 36, 0, Math.PI * 2, 0, Math.PI / 2);
  const s1 = mesh(half, seedMat, [0, 0, 0], [Math.PI, 0, 0.16], [1.3, 0.95, 1.0]);          // нижняя чаша
  const s2 = mesh(half, seedMat, [0.62, 0.26, -0.12], [0.35, 0.25, -1.05], [1.22, 0.86, 0.95]); // крышка
  const inner = mesh(new THREE.SphereGeometry(0.6, 48, 28), clay('#EADDBD', { roughness: 0.75 }), [0, -0.03, 0], [0, 0, 0.16], [1.26, 0.5, 0.96]);
  g.add(s1, s2, inner);

  /* стебель: из семени вверх с изгибом, к верху тоньше */
  const stemMat = gloss('#B2E84A');
  const pts = [[-0.06, 0.02, 0.02], [-0.3, 0.75, 0.08], [-0.2, 1.55, 0.04], [0.12, 2.3, -0.02], [0.24, 2.85, 0]];
  g.add(mesh(taperedTube(pts, (u) => 0.17 - 0.06 * u, 90, 24), stemMat));

  /* семядоли: пухлые овальные листья, раскрыты в стороны и повёрнуты лицом к зрителю */
  const top = [0.24, 2.8, 0];
  const big = mesh(leafGeometry({ len: 2.0, width: 1.5, thick: 0.34, curl: 0.16, fold: 0.16, tip: 0.42 }), leafy('#4FB81E'), top, [0.95, 0.18, 0.5], null, 'YZX');
  const small = mesh(leafGeometry({ len: 1.55, width: 1.25, thick: 0.3, curl: 0.18, fold: 0.16, tip: 0.42 }), leafy('#86E02E'), top, [-0.9, Math.PI - 0.3, 0.72], null, 'YZX');
  const bud = mesh(new THREE.SphereGeometry(0.19, 32, 24), stemMat, [0.25, 2.93, 0.06], [0, 0, 0.1], [0.85, 1.45, 0.85]);
  g.add(big, small, bud);

  g.rotation.z = -0.2;                                        // наклон в сторону движения, как у ракеты донора
  root.add(g);
  return { view: [0.2, 0.18, 1], fov: 26 };
}
