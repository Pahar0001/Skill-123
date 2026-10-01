/* Объёмные предметы из мира дела — третья версия, с деталями:
   pack — пакет семян (наклонён, для первого экрана и плиток), pack-stand — тот же пакет стоит прямо, с тенью на
   земле (линейка весов); form — заявка на планшете; invoice — счёт с печатью и монетой; calc — расчёт перевозки;
   box — коробка к отгрузке; мелочь для полей страницы: seed — семя, seeds — три семени, leaf — лист, hex — ячейка сот.
   Адрес: stage.html?scene=icons&variant=pack */
import { roundedRect, plate, mesh, tube, leafGeometry, hexShape } from './_kit.js';

export function build({ THREE, root, PAL, clay, gloss, leafy, metal, printed, paper, honey, RoundedBoxGeometry, q }) {
  const v = q.get('variant') || 'pack';
  const g = new THREE.Group();
  const kraft = paper(PAL.kraft), kraftDark = paper(PAL.kraftDark), milk = paper(PAL.milk, { bumpScale: 0.7, roughness: 0.72 });
  const green = gloss(PAL.moss), greenDeep = gloss(PAL.mossDeep), greenLight = gloss(PAL.sprout), ink = gloss(PAL.ink, { roughness: 0.35 });
  const honeyM = gloss(PAL.honey, { roughness: 0.22, metalness: 0.35 });
  const line = clay(PAL.line);
  const bar = (w, h, mat, pos, d = 0.06) => mesh(plate(roundedRect(w, h, h / 2), d, 0.02, 3), mat, pos);
  let out = { view: [0, 0.12, 1], fov: 24 };

  /* семя: вытянутый эллипсоид, глянцевая оболочка, светлый рубчик */
  const seed = (scale = 1, color = PAL.bark) => {
    const s = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.5, 64, 40);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) * (1 - 0.22 * (x + 0.5))); }   // один конец острее
    geo.computeVertexNormals();
    s.add(mesh(geo, gloss(color, { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.14 }), null, null, [1.5, 0.92, 0.8]));
    s.add(mesh(new THREE.SphereGeometry(0.09, 20, 14), clay('#EADDBD'), [-0.7, 0.02, 0.16], null, [1.3, 0.8, 0.7]));   // рубчик
    s.scale.setScalar(scale);
    return s;
  };

  /* пакет семян: крафтовый «саше» — пухлое тело, заваренный верх с гофрой, боковая складка, этикетка с печатью */
  const pack = () => {
    const k = new THREE.Group();
    const body = new RoundedBoxGeometry(1.9, 2.5, 0.72, 14, 0.22);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      let f = 1 + 0.2 * Math.cos((y / 1.25) * Math.PI / 2) - 0.36 * Math.max(0, (y - 0.5) / 0.75);        // пухлее в середине, сплющен кверху
      f *= 1 - 0.1 * Math.pow(Math.abs(x) / 0.95, 6);                                                     // боковая складка втянута
      p.setZ(i, p.getZ(i) * f);
    }
    body.computeVertexNormals();
    k.add(mesh(body, kraft));
    /* заваренный верх: полоса с гофрой из валиков */
    k.add(mesh(new RoundedBoxGeometry(2.0, 0.44, 0.26, 8, 0.1), kraftDark, [0, 1.22, 0]));
    for (let i = 0; i < 7; i++) k.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.86, 10), kraft, [0, 1.06 + i * 0.054, 0.132], [0, 0, Math.PI / 2]));
    k.add(mesh(new THREE.TorusGeometry(0.07, 0.02, 10, 28), kraftDark, [0, 1.3, 0.14]));                   // отверстие под крючок
    /* этикетка: молочная бумага, рамка, знак-росток, строки названия и веса */
    k.add(mesh(plate(roundedRect(1.4, 1.26, 0.2), 0.07, 0.028), milk, [0, -0.28, 0.42]));
    k.add(mesh(plate(roundedRect(1.26, 1.12, 0.15), 0.012, 0.004), clay('#E9E4D2', { roughness: 0.8 }), [0, -0.28, 0.458]));
    k.add(mesh(leafGeometry({ len: 0.56, width: 0.4, thick: 0.1, curl: 0.05, fold: 0.1, veins: 6 }), leafy(PAL.moss), [0, -0.36, 0.5], [1.35, 0.0, 0.95], null, 'YZX'));
    k.add(mesh(leafGeometry({ len: 0.46, width: 0.34, thick: 0.1, curl: 0.05, fold: 0.1, veins: 6 }), leafy(PAL.sprout), [0, -0.36, 0.5], [-1.35, Math.PI, 0.75], null, 'YZX'));
    k.add(mesh(tube([[0, -0.6, 0.5], [0, -0.36, 0.5]], 0.032, 8, 10), greenDeep));
    k.add(bar(0.66, 0.075, gloss(PAL.mossDeep, { roughness: 0.4 }), [0, -0.7, 0.468], 0.02), bar(0.36, 0.055, line, [0, -0.8, 0.468], 0.02));
    return k;
  };

  if (v === 'pack') {
    const k = pack(); k.rotation.set(0.05, -0.45, 0.12); g.add(k);
  } else if (v === 'pack-stand') {
    const k = pack(); k.rotation.set(0, -0.36, 0); g.add(k);
    out = { view: [0, 0.2, 1], fov: 24, ground: 0.36, margin: 1.2 };
  } else if (v === 'form') {
    /* заявка: планшет с листом, строками, отметками и галочкой; зажим металлический */
    g.add(mesh(plate(roundedRect(2.0, 2.6, 0.22), 0.18, 0.06), kraftDark));
    g.add(mesh(plate(roundedRect(1.66, 2.16, 0.12), 0.05, 0.02), milk, [0.02, -0.12, 0.11], [0, 0, -0.012]));       // нижний лист чуть сдвинут
    g.add(mesh(plate(roundedRect(1.66, 2.16, 0.12), 0.05, 0.02), paper(PAL.milk, { bumpScale: 0.4 }), [0, -0.1, 0.15]));
    g.add(mesh(plate(roundedRect(0.9, 0.36, 0.14), 0.2, 0.06), metal('#aab3a4'), [0, 1.2, 0.12]));                  // зажим
    g.add(mesh(new THREE.TorusGeometry(0.16, 0.035, 12, 32, Math.PI), metal('#aab3a4'), [0, 1.36, 0.14]));
    for (let i = 0; i < 3; i++) g.add(bar(i === 2 ? 0.6 : 0.86, 0.13, line, [0.22 - (i === 2 ? 0.13 : 0), 0.42 - i * 0.48, 0.21]));
    for (let i = 0; i < 3; i++) g.add(bar(i === 1 ? 0.4 : 0.56, 0.07, clay('#E3EBCF'), [0.07 - (i === 1 ? 0.08 : 0), 0.26 - i * 0.48, 0.2], 0.03));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.11, 28, 18), i < 2 ? green : line, [-0.52, 0.42 - i * 0.48, 0.21], null, [1, 1, 0.45]));
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 64), green, [0.62, -0.92, 0.32], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.TorusGeometry(0.4, 0.035, 12, 64), greenDeep, [0.62, -0.92, 0.38]));
    g.add(mesh(tube([[0.44, -0.92, 0.42], [0.57, -1.06, 0.42], [0.82, -0.76, 0.42]], 0.055, 24, 14), milk));
    g.rotation.set(-0.12, 0.42, -0.1);
  } else if (v === 'invoice') {
    /* счёт: лист с зубчатым низом, шапка, строки, сумма, круглая печать и монета */
    const s = new THREE.Shape(); const w = 1.7, h = 2.4, r = 0.14, teeth = 7, tw = w / teeth;
    s.moveTo(-w / 2, h / 2 - r); s.quadraticCurveTo(-w / 2, h / 2, -w / 2 + r, h / 2);
    s.lineTo(w / 2 - r, h / 2); s.quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - r); s.lineTo(w / 2, -h / 2 + 0.16);
    for (let i = 0; i < teeth; i++) { const x = w / 2 - i * tw; s.lineTo(x - tw / 2, -h / 2); s.lineTo(x - tw, -h / 2 + 0.16); }
    s.closePath();
    g.add(mesh(plate(s, 0.1, 0.03), milk));
    g.add(bar(0.74, 0.16, greenDeep, [-0.3, 0.92, 0.09]));                                               // шапка счёта
    for (let i = 0; i < 4; i++) g.add(bar(i % 2 ? 0.72 : 1.1, 0.1, line, [-0.3 + (i % 2 ? -0.19 : 0), 0.56 - i * 0.3, 0.085]));
    for (let i = 0; i < 4; i++) g.add(bar(0.22, 0.1, clay('#E3EBCF'), [0.6, 0.56 - i * 0.3, 0.085]));       // столбец сумм
    g.add(bar(0.5, 0.16, green, [0.46, -0.72, 0.09]));                                                   // «итого»
    g.add(mesh(new THREE.TorusGeometry(0.34, 0.05, 14, 56), greenDeep, [-0.42, -0.74, 0.1]));              // печать
    g.add(mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 48), greenDeep, [-0.42, -0.74, 0.1]));
    g.add(mesh(new THREE.SphereGeometry(0.06, 16, 12), greenDeep, [-0.42, -0.74, 0.1], null, [1, 1, 0.5]));
    const coin = new THREE.Group();
    coin.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 72), honeyM, null, [Math.PI / 2, 0, 0]));
    coin.add(mesh(new THREE.TorusGeometry(0.46, 0.04, 12, 72), gloss(PAL.honeyDeep, { metalness: 0.4 }), [0, 0, 0.08]));
    coin.add(mesh(new THREE.TorusGeometry(0.3, 0.028, 12, 56), gloss(PAL.honeyDeep, { metalness: 0.4 }), [0, 0, 0.085]));
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; coin.add(mesh(new THREE.BoxGeometry(0.03, 0.16, 0.02), gloss(PAL.honeyDeep), [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0], [Math.PI / 2, a, 0])); }   // гурт
    coin.position.set(0.86, -1.0, 0.42); coin.rotation.set(0.1, -0.5, 0.2);
    g.add(coin);
    g.rotation.set(-0.1, 0.38, 0.08);
  } else if (v === 'calc') {
    /* расчёт перевозки: калькулятор — зелёный корпус, тёмный экран с числом, клавиши с фаской, одна медовая «итого» */
    g.add(mesh(new RoundedBoxGeometry(1.9, 2.5, 0.42, 10, 0.2), gloss(PAL.mossDeep, { roughness: 0.28 })));
    g.add(mesh(new RoundedBoxGeometry(1.74, 2.34, 0.06, 6, 0.14), gloss(PAL.moss, { roughness: 0.3 }), [0, 0, 0.2]));     // лицевая панель
    g.add(mesh(plate(roundedRect(1.5, 0.62, 0.12), 0.08, 0.03), gloss('#12301C', { roughness: 0.12 }), [0, 0.78, 0.25]));
    const screen = printed(512, 200, (c, W, H) => {
      c.clearRect(0, 0, W, H); c.fillStyle = '#D3F34A'; c.font = '700 132px "Golos Text", Arial, sans-serif'; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText('25 кг', W - 26, H / 2 + 6);
    }, { emissive: new THREE.Color('#D3F34A'), emissiveIntensity: 0.55, roughness: 0.2, clearcoat: 1 });
    g.add(mesh(new THREE.PlaneGeometry(1.36, 0.53), screen, [0, 0.78, 0.296]));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const last = r === 3 && c === 2;
      const key = new THREE.Group();
      key.add(mesh(new RoundedBoxGeometry(0.42, 0.31, 0.2, 6, 0.08), last ? honeyM : gloss(r === 0 ? PAL.sprout : PAL.milk, { roughness: 0.32 })));
      key.add(mesh(new RoundedBoxGeometry(0.3, 0.2, 0.03, 4, 0.06), last ? gloss(PAL.honeyLight) : gloss(r === 0 ? '#C4F06A' : '#FFFFFF', { roughness: 0.25 }), [0, 0.01, 0.1]));   // вогнутая площадка
      key.position.set(-0.5 + c * 0.5, 0.2 - r * 0.4, 0.28); g.add(key);
    }
    g.rotation.set(-0.16, -0.42, 0.1);
  } else if (v === 'seed') {
    const s = seed(1.4); s.rotation.set(0.3, -0.4, 0.5); g.add(s);
    out = { view: [0, 0.2, 1], fov: 24, margin: 1.1 };
  } else if (v === 'seeds') {
    const a = seed(1.2), b = seed(0.95, '#8A6A42'), c = seed(0.8, '#6C4E30');
    a.rotation.set(0.2, -0.3, 0.45); b.position.set(1.5, -0.5, 0.3); b.rotation.set(-0.2, 0.6, -0.7); c.position.set(0.5, -1.25, -0.1); c.rotation.set(0.5, 0.2, 1.6);
    g.add(a, b, c);
    out = { view: [0, 0.25, 1], fov: 24, margin: 1.08 };
  } else if (v === 'leaf') {
    g.add(mesh(leafGeometry({ len: 2.6, width: 1.5, thick: 0.26, curl: 0.2, fold: 0.2, tip: 0.5, veins: 10, twist: 0.25 }), leafy('#62C226'), [-1.2, 0, 0], [1.15, 0.2, 0.5], null, 'YZX'));
    g.add(mesh(tube([[-1.9, -0.55, 0.1], [-1.5, -0.2, 0.02], [-1.2, 0, 0]], 0.06, 20, 12), gloss('#8FD43A')));
    out = { view: [0, 0.2, 1], fov: 24, margin: 1.08 };
  } else if (v === 'hex') {
    const R = 1, WALL = 0.16, DEPTH = 0.7;
    const outer = hexShape(R, 0.16); outer.holes.push(new THREE.Path(hexShape(R - WALL, 0.14).getPoints(48)));
    const wax = clay(PAL.honeyLight, { roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.18 });
    g.add(mesh(plate(outer, DEPTH, 0.07, 6), wax));
    g.add(mesh(plate(hexShape(R - WALL * 0.6, 0.14), 0.1, 0.03, 3), clay('#F2B94A'), [0, 0, -DEPTH / 2 + 0.05]));
    g.add(mesh(plate(hexShape(R - WALL - 0.01, 0.14), DEPTH * 0.86, 0.09, 8), honey(), [0, 0, -DEPTH / 2 + 0.1 + DEPTH * 0.43]));
    g.rotation.set(-0.3, 0.5, 0.2);
    out = { view: [0, 0.05, 1], fov: 24, margin: 1.08 };
  } else {
    /* отгрузка: картонная коробка — клапаны со швом, скотч с бликом, этикетка, значок «верх» */
    g.add(mesh(new RoundedBoxGeometry(2.3, 1.7, 1.9, 10, 0.1), kraft));
    g.add(mesh(new RoundedBoxGeometry(1.14, 0.08, 1.92, 4, 0.03), kraftDark, [-0.585, 0.86, 0]));              // два клапана со щелью между ними
    g.add(mesh(new RoundedBoxGeometry(1.14, 0.08, 1.92, 4, 0.03), kraftDark, [0.585, 0.86, 0]));
    const tape = gloss(PAL.moss, { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
    g.add(mesh(new RoundedBoxGeometry(0.46, 1.76, 1.94, 4, 0.04), tape, [0, 0.02, 0]));                          // скотч вокруг
    g.add(mesh(new RoundedBoxGeometry(0.46, 0.1, 1.98, 4, 0.04), tape, [0, 0.87, 0]));
    g.add(mesh(plate(roundedRect(0.66, 0.46, 0.07), 0.05, 0.02), milk, [0.74, -0.3, 0.96]));                     // этикетка
    g.add(bar(0.4, 0.06, line, [0.72, -0.2, 1.0], 0.03), bar(0.26, 0.06, line, [0.66, -0.33, 1.0], 0.03), bar(0.34, 0.05, gloss(PAL.mossDeep), [0.7, -0.44, 1.0], 0.03));
    /* значок «верх»: две стрелки на левой половине передней стенки */
    for (const dx of [-0.92, -0.66]) {
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), clay('#A9824F'), [dx, -0.44, 0.955]));
      g.add(mesh(new THREE.ConeGeometry(0.1, 0.14, 3), clay('#A9824F'), [dx, -0.22, 0.955], [0, 0, 0], [1, 1, 0.15]));
    }
    g.rotation.set(0.32, -0.62, 0);
  }
  root.add(g);
  return out;
}
