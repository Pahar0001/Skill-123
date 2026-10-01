/* sketch-kit — рисунки от руки для фона: фигуры собираются кодом и проходят через «рваную линию»
   (Rough.js, команда svg3d.mjs rough): контур дрожит, заливка — штриховкой. Так делаются свои
   наброски «в тему» вместо чужих картинок: клевер, колос, чашка, ключ — что есть в мире дела.

   Здесь — заготовки фигур и сборка; сами рисунки у каждого сайта свои (образец — botanical.mjs).

   import { leaf, ellipse, place, P, curve, line, svg, build } from './sketch-kit.mjs';
   await build({ имя: () => svg(300, 400, [P(place(leaf(120, 46), 150, 380), { fill: '#6FA93A' })]) }, { out: 'папка' }); */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SVG3D = path.join(os.homedir(), '.claude', 'skills', 'site-rework', 'scripts', 'svg3d.mjs');
const f = (n) => +n.toFixed(1);
const K = 0.5523;

/** Поворот точки на угол a (радианы). */
export const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** Фигура в своих координатах → строка пути на листе: поворот a, сдвиг (x, y).
 *  Фигура — список команд [['M', x, y], ['C', x1, y1, x2, y2, x, y], ['L', x, y], ['Q', cx, cy, x, y], ['Z']].
 *  Преобразований SVG (transform) в рисунке нет нарочно: «рваная линия» работает с готовыми координатами. */
export const place = (cmds, x = 0, y = 0, a = 0) => cmds.map(([c, ...p]) => {
  const o = [c];
  for (let i = 0; i < p.length; i += 2) { const [px, py] = rot(p[i], p[i + 1], a); o.push(f(px + x), f(py + y)); }
  return o.join(' ');
}).join(' ');

/** Эллипс с центром в нуле: полуоси rx, ry. Круг — ellipse(r, r). */
export const ellipse = (rx, ry) => [['M', rx, 0], ['C', rx, ry * K, rx * K, ry, 0, ry], ['C', -rx * K, ry, -rx, ry * K, -rx, 0], ['C', -rx, -ry * K, -rx * K, -ry, 0, -ry], ['C', rx * K, -ry, rx, -ry * K, rx, 0], ['Z']];

/** Лист (лепесток, зерно, стручок) от основания вверх: len — длина, w — полуширина,
 *  notch — выемка на конце (листочек клевера, сердечко). Узкий w — стручок или травинка. */
export const leaf = (len, w, notch = 0) => [['M', 0, 0], ['C', -w * 1.15, -len * 0.25, -w * 1.05, -len * 0.92, -w * 0.12 * (notch ? 2 : 0), -len + notch], ...(notch ? [['L', 0, -len + notch * 2.2], ['L', w * 0.24, -len + notch]] : []), ['C', w * 1.05, -len * 0.92, w * 1.15, -len * 0.25, 0, 0], ['Z']];

/** Прямоугольник со скруглением: центр в нуле. */
export const box = (w, h, r = 0) => { const x = w / 2, y = h / 2; r = Math.min(r, x, y); return [['M', -x + r, -y], ['L', x - r, -y], ['Q', x, -y, x, -y + r], ['L', x, y - r], ['Q', x, y, x - r, y], ['L', -x + r, y], ['Q', -x, y, -x, y - r], ['L', -x, -y + r], ['Q', -x, -y, -x + r, -y], ['Z']]; };

/** Ломаная по точкам [[x, y], …] и дуга через одну опорную точку — уже готовые строки пути. */
export const line = (pts) => 'M ' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ');
export const curve = (x0, y0, cx, cy, x1, y1) => `M ${f(x0)} ${f(y0)} Q ${f(cx)} ${f(cy)} ${f(x1)} ${f(y1)}`;

/** Один путь рисунка. fill — цвет штриховки (none — только контур), stroke — тушь, w — толщина. */
export const P = (d, { fill = 'none', stroke = '#16301F', w = 2.2 } = {}) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Лист рисунка: размер поля и список путей. */
export const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${body.join('\n')}\n</svg>\n`;

/** Собрать рисунки: draws — { имя: () => строка svg }, out — папка готовых файлов.
 *  ink — цвет туши у всех контуров; roughness, bowing, gap — характер линии и шаг штриховки;
 *  src — куда положить исходники до «рваной линии» (по умолчанию out/_src); sheet — файл листа-контакта.
 *  Возвращает [{ name, file, kb, viewBox }]. Тот же seed — побайтно тот же файл. */
export async function build(draws, { out, ink = '#16301F', roughness = 1.15, bowing = 1.2, gap = 5.5, fillStyle = 'hachure', seed = 7, src, sheet, bg = '#FBF9F5', cell = 380 } = {}) {
  if (!out) throw new Error('build: нужна папка out');
  if (!fs.existsSync(SVG3D)) throw new Error(`нет ${SVG3D}`);
  const srcDir = src || path.join(out, '_src');
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(srcDir, { recursive: true });
  const made = [];
  let i = 0;
  for (const [name, draw] of Object.entries(draws)) {
    const from = path.join(srcDir, `${name}.svg`), to = path.join(out, `${name}.svg`);
    fs.writeFileSync(from, draw());
    execFileSync(process.execPath, [SVG3D, 'rough', from, '--out', to, '--seed', String(seed + i++), '--roughness', String(roughness), '--bowing', String(bowing), '--fill-style', fillStyle, '--hachure-gap', String(gap), '--ink', ink], { stdio: 'pipe' });
    try { execFileSync(process.execPath, [SVG3D, 'optimize', to, '--out', to, '--precision', '1'], { stdio: 'pipe' }); } catch { /* без сжатия файл тоже годен */ }
    const m = fs.readFileSync(to, 'utf8').match(/viewBox="([^"]+)"/);
    made.push({ name, file: to, kb: Math.round(fs.statSync(to).size / 1024), viewBox: m ? m[1] : '' });
  }
  if (sheet) execFileSync(process.execPath, [SVG3D, 'sheet', ...made.map((x) => x.file), '--out', sheet, '--bg', bg, '--cols', String(Math.min(5, made.length)), '--cell', String(cell)], { stdio: 'pipe' });
  return made;
}
