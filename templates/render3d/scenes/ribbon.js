/* Ребристая глянцевая лента — главный декор донора (X5 Tech BIG IN), у нас в зелёных тонах заказчика.
   Лента ведёт себя как полоса бумаги: гнётся только вокруг своей ширины (ширина смотрит в глубину кадра),
   поэтому на перегибах не складывается. u — вдоль пути, v — поперёк; поперёк идут рёбра-валики. */
export function build({ THREE, root, scene, PAL, q, lights }) {
  lights.key.intensity = 2.2; lights.fill.intensity = 0.55;
  const variant = q.get('variant') || 'wave';

  class Wave extends THREE.Curve {
    constructor(f) { super(); this.f = f; }
    getPoint(u, target = new THREE.Vector3()) { const [x, y, z] = this.f(u); return target.set(x, y, z); }
  }
  const cat = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);

  const defs = {
    /* широкая волна через весь кадр 2:1 — первый экран; концы уходят за края кадра */
    wave: {
      curve: new Wave((u) => { const x = -16 + 32 * u; return [x, 2.1 * Math.sin(x * 0.36 + 0.5) + 0.5 * Math.sin(x * 0.8 + 1.3), 0.9 * Math.sin(x * 0.25)]; }),
      width: 4.6, ribs: 26, twist: (u) => 0.42 * Math.sin(u * 7.2 + 0.8) + 0.12, view: [0, 0.62, 1], fov: 24, distance: 21, target: [0, 0, 0],
    },
    /* дуга из верхнего угла — у заголовков секций и у вопросов */
    arc: {
      curve: cat([[-3.4, 6.4, -1.0], [-1.0, 2.6, 0.2], [2.2, 0.4, 0.5], [5.4, 1.4, 0.2], [7.6, 5.6, -0.8], [9.4, 9, -1.4]]),
      width: 3.6, ribs: 22, twist: (u) => 0.55 * Math.sin(u * 4.2 + 0.4), view: [0.05, 0.55, 1], fov: 24, distance: 17, target: [2.4, 3.0, 0],
    },
    /* петля-серпантин — над ступенями шагов */
    loop: {
      curve: new Wave((u) => { const x = -9 + 18 * u; return [x + 1.4 * Math.sin(x * 0.7), 2.4 * Math.sin(x * 0.55 + 0.3) + 0.2 * x, 1.2 * Math.cos(x * 0.5)]; }),
      width: 3.2, ribs: 20, twist: (u) => 0.5 * Math.sin(u * 6 + 2), view: [0.1, 0.6, 1], fov: 24, distance: 20, target: [0, 0.4, 0],
    },
    /* короткий завиток — акцент у карточек и пустых состояний */
    curl: {
      curve: cat([[-4.2, -2.2, -0.4], [-1.6, 0.8, 0.5], [1.2, 1.4, 0.0], [3.6, -0.8, 0.4], [5.2, -3.4, -0.2]]),
      width: 2.6, ribs: 16, twist: (u) => 0.6 * Math.sin(u * 5 + 1), view: [0, 0.6, 1], fov: 24, distance: 14, target: [0.4, -0.4, 0],
    },
  };
  const P = defs[variant] || defs.wave;
  const ribs = +q.get('ribs') || P.ribs;
  const NU = +q.get('nu') || 720, NV = ribs * 14;

  const count = (NU + 1) * (NV + 1);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const c = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), t = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const cRidge = new THREE.Color(q.get('ridge') ? '#' + q.get('ridge') : '#86D41C'), cMid = new THREE.Color('#3E8E1A'), cValley = new THREE.Color('#0F3A17'), cEdge = new THREE.Color('#D3F34A'), cWarm = new THREE.Color('#C4E22A'), tmp = new THREE.Color(), ridgeU = new THREE.Color();
  const pitch = P.width / ribs, AMP = pitch * 0.46;
  let k = 0;
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    P.curve.getPoint(u, c);
    P.curve.getTangent(u, t);
    b.copy(Z).addScaledVector(t, -t.dot(Z)).normalize();          // ширина — в глубину кадра
    n.crossVectors(b, t).normalize();                             // лицевая сторона
    const a = P.twist(u);
    b.applyAxisAngle(t, a); n.applyAxisAngle(t, a);
    ridgeU.copy(cRidge).lerp(cWarm, 0.38 * Math.pow(Math.sin(u * Math.PI * 1.7 + 0.4), 2));   // вдоль ленты зелёный местами теплеет к оливково-медовому
    for (let j = 0; j <= NV; j++, k++) {
      const v = j / NV;
      const ridge = Math.pow(0.5 + 0.5 * Math.cos(v * ribs * Math.PI * 2), 0.55);   // круглый валик с острой ложбиной
      const cup = Math.sin(v * Math.PI) * P.width * 0.07;                              // лёгкий желоб поперёк
      const w = (v - 0.5) * P.width;
      const h = ridge * AMP + cup;
      pos[k * 3] = c.x + b.x * w + n.x * h;
      pos[k * 3 + 1] = c.y + b.y * w + n.y * h;
      pos[k * 3 + 2] = c.z + b.z * w + n.z * h;
      tmp.copy(cValley).lerp(cMid, Math.min(1, ridge * 1.5)).lerp(ridgeU, Math.pow(ridge, 2.4));
      tmp.lerp(cEdge, Math.pow(Math.abs(v - 0.5) * 2, 5) * 0.45);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      uv[k * 2] = u; uv[k * 2 + 1] = v;
    }
  }
  const idx = new Uint32Array(NU * NV * 6);
  let m = 0;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a0 = i * (NV + 1) + j, a1 = a0 + 1, b0 = a0 + NV + 1, b1 = b0 + 1;
    idx[m++] = a0; idx[m++] = b0; idx[m++] = a1; idx[m++] = a1; idx[m++] = b0; idx[m++] = b1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.2, metalness: 0.08,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.0,
    anisotropy: 0.7, anisotropyRotation: 0,          // блик тянется вдоль ленты, как на атласе
    sheen: 0.4, sheenRoughness: 0.3, sheenColor: new THREE.Color('#eaff8a'),
  });
  scene.environmentIntensity = +q.get('env') || 1.1;
  root.add(new THREE.Mesh(geo, mat));
  return { view: P.view, fov: P.fov, distance: P.distance, target: P.target };
}
