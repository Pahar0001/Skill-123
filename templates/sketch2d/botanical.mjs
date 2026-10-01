#!/usr/bin/env node
/* Образец: ботанические наброски для магазина семян — клевер, колос, горчица, пчела, росток.
   Сделаны в боевом прогоне «Зелёный уголок» (01.10.2026) после слов владельца «в фон встроены красивые 2D
   картинки в тему — это тоже надо уметь». Это пример, а не заготовка: у кофейни будут чашка и зерно,
   у мастерской — рубанок; рисунки собираются из тех же фигур набора.

   node botanical.mjs --out <папка> [--ink "#2F6B2A"] [--sheet лист.png]
   node botanical.mjs --help */
import path from 'node:path';
import { leaf, ellipse, place, P as path0, curve, line, svg, build } from './sketch-kit.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
if (!opt('out') || argv.includes('--help') || argv.includes('-h')) {
  console.log('node botanical.mjs --out <папка> [--ink "#2F6B2A"] [--sheet лист.png]\nПять набросков «рваной линией» в папку --out; --sheet — лист-контакт, открыть глазами.');
  process.exit(opt('out') ? 0 : 1);
}
const INK = opt('ink', '#2F6B2A'), FILL = '#6FA93A', FILL2 = '#B7D97A', BROWN = '#8A6A42', HONEY = '#D9A23A', DARK = '#3B2A14', PALE = '#F3EAC6';
const P = (d, o = {}) => path0(d, { stroke: INK, ...o });

const draws = {
  /* клевер: стебель, три листочка с выемкой и светлой «галочкой», головка цветка из лепестков */
  clover() {
    const b = [P(curve(170, 480, 130, 350, 176, 232), { w: 3 }), P(curve(170, 480, 262, 400, 300, 286), { w: 3 })];
    for (const a of [-1.22, 0, 1.22]) {
      b.push(P(place(leaf(118, 58, 10), 176, 234, a), { fill: FILL }));
      b.push(P(place([['M', -30, -56], ['Q', 0, -38, 30, -56]], 176, 234, a), { stroke: '#DDF0B4', w: 3.4 }));
      b.push(P(place([['M', 0, -8], ['L', 0, -98]], 176, 234, a), { w: 1.4 }));
    }
    for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; b.push(P(place(leaf(40, 7.5), 304 + Math.sin(a) * 8, 252 - Math.cos(a) * 8, a), { fill: i % 2 ? FILL2 : '#F4F8E6', w: 1.3 })); }
    b.push(P(place(ellipse(11, 11), 304, 252), { fill: FILL2, w: 1.4 }));
    b.push(P(place(leaf(46, 17), 300, 290, 2.3), { fill: FILL, w: 1.6 }), P(place(leaf(46, 17), 302, 290, -2.3), { fill: FILL, w: 1.6 }));
    return svg(400, 500, b);
  },
  /* колос: стебель, зёрна попарно, ости, два узких листа */
  ear() {
    const b = [P(curve(140, 560, 120, 330, 150, 70), { w: 3 })];
    b.push(P(place(leaf(210, 15), 136, 470, 0.55), { fill: FILL }), P(place(leaf(170, 13), 132, 400, -0.6), { fill: FILL2 }));
    for (let i = 0; i < 11; i++) {
      const t = i / 10, y = 250 - t * 175, x = 131 + t * 17 + (t * t) * 3, side = i % 2 ? 1 : -1, a = side * (0.42 - t * 0.14);
      b.push(P(place(ellipse(11 - t * 3, 23 - t * 5), x + side * 13, y - 4, a), { fill: i % 3 ? '#E8D9A4' : PALE, w: 1.7 }));
      b.push(P(line([[x + side * 17, y - 22], [x + side * (40 + (1 - t) * 26), y - 84 - (1 - t) * 22]]), { w: 1.2 }));
    }
    b.push(P(place(ellipse(8, 18), 150, 64, 0.04), { fill: PALE, w: 1.7 }), P(line([[150, 46], [156, -4]]), { w: 1.2 }));
    return svg(280, 570, b);
  },
  /* горчица: ветка с четырёхлепестковыми цветками, бутонами и стручками */
  mustard() {
    const b = [P(curve(90, 540, 150, 330, 190, 110), { w: 3 }), P(curve(152, 318, 220, 290, 262, 210), { w: 2.4 }), P(curve(128, 392, 70, 350, 46, 268), { w: 2.4 })];
    const flower = (x, y, s, a0) => { for (let k = 0; k < 4; k++) b.push(P(place(leaf(30 * s, 15 * s), x, y, a0 + k * Math.PI / 2), { fill: '#F1DC6A', w: 1.6 })); b.push(P(place(ellipse(6 * s, 6 * s), x, y), { fill: HONEY, w: 1.4 })); };
    flower(192, 100, 1.2, 0.3); flower(232, 142, 0.95, 0.9); flower(152, 138, 0.9, -0.2); flower(266, 200, 1.05, 0.5); flower(44, 258, 1.0, 0.1);
    for (const [x, y] of [[176, 62], [206, 56], [218, 80]]) b.push(P(place(ellipse(7, 10), x, y, 0.3), { fill: FILL2, w: 1.4 }));
    for (const [x, y, a] of [[150, 300, 0.95], [134, 352, -0.9], [118, 420, 1.0], [106, 466, -0.85]]) b.push(P(place(leaf(74, 6.5), x, y, a), { fill: FILL, w: 1.6 }));
    b.push(P(place(leaf(120, 34), 100, 500, -1.0), { fill: FILL }), P(place([['M', 0, -6], ['L', 0, -104]], 100, 500, -1.0), { w: 1.3 }));
    return svg(330, 560, b);
  },
  /* пчела: брюшко в полоску, грудь, голова, две пары крыльев, усики, лапки */
  bee() {
    const b = [];
    b.push(P(place(ellipse(62, 22), 136, 106, 0.52), { fill: '#F7FBEF', w: 1.6 }), P(place(ellipse(50, 17), 158, 84, 0.95), { fill: '#F7FBEF', w: 1.6 }));
    b.push(P(place([['M', -46, 0], ['L', 44, 0]], 136, 106, 0.52), { w: 1 }), P(place([['M', -36, 0], ['L', 34, 0]], 158, 84, 0.95), { w: 1 }));
    b.push(P(place(ellipse(60, 36), 112, 168, 0.3), { fill: HONEY }));
    for (const dx of [-30, -6, 18]) { const hgt = 36 * Math.sqrt(1 - (dx * dx) / 3600) - 3; b.push(P(place([['M', dx, -hgt], ['Q', dx + 8, 0, dx, hgt]], 112, 168, 0.3), { stroke: DARK, w: 8 })); }
    b.push(P(place(ellipse(30, 27), 188, 190, 0.3), { fill: BROWN }), P(place(ellipse(19, 18), 226, 204, 0.3), { fill: DARK }));
    b.push(P(curve(236, 192, 256, 166, 272, 160), { w: 1.8 }), P(curve(242, 200, 270, 186, 286, 190), { w: 1.8 }));
    for (const [x, y, dx, dy] of [[176, 214, -10, 30], [196, 216, 8, 30], [150, 198, -22, 30]]) b.push(P(line([[x, y], [x + dx * 0.4, y + dy * 0.6], [x + dx, y + dy]]), { w: 2 }));
    return svg(300, 260, b);
  },
  /* росток: семя, стебель, две семядоли, крошки земли */
  sprout() {
    const b = [P(curve(150, 320, 120, 230, 160, 130), { w: 3.2 })];
    b.push(P(place(leaf(118, 46), 160, 132, 0.95), { fill: FILL }), P(place([['M', 0, -6], ['L', 0, -100]], 160, 132, 0.95), { w: 1.4 }));
    b.push(P(place(leaf(96, 40), 160, 132, -0.8), { fill: FILL2 }), P(place([['M', 0, -6], ['L', 0, -82]], 160, 132, -0.8), { w: 1.4 }));
    b.push(P(place(ellipse(48, 26), 146, 338, -0.2), { fill: BROWN }), P(curve(104, 344, 146, 322, 190, 328), { stroke: PALE, w: 3 }));
    for (const [x, y] of [[60, 372], [92, 386], [214, 380], [238, 364], [36, 356]]) b.push(P(place(ellipse(9, 5), x, y, 0.3), { fill: BROWN, w: 1.2 }));
    return svg(300, 400, b);
  },
};

const made = await build(draws, { out: path.resolve(opt('out')), ink: INK, sheet: opt('sheet') ? path.resolve(opt('sheet')) : undefined });
for (const m of made) console.log(`OK   ${m.name}.svg — ${m.kb} КБ, viewBox ${m.viewBox}`);
if (opt('sheet')) console.log(`лист: ${path.resolve(opt('sheet'))} — открыть глазами до вёрстки`);
