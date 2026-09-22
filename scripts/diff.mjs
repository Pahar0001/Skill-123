#!/usr/bin/env node
/**
 * Сравнение снимков «до» и «после»: где именно изменилась картинка.
 *
 *   node diff.mjs <папка-before> <папка-after> [--out папка] [--threshold 0.1]
 *   node diff.mjs --pair a.png b.png [--out папка]
 *
 * Пары складываются по одинаковым именам файлов. Для каждой пары:
 * доля изменившихся пикселей, полосы по высоте, где изменения сосредоточены,
 * и картинка diff/<имя>.png — изменённое красным поверх приглушённого «до».
 *
 * Если высота страницы изменилась, всё ниже точки изменения сдвигается и
 * попиксельное сравнение красит целиком. Поэтому отдельно считается
 * сравнение со сдвигом: от первой различающейся строки «после» сравнивается
 * с «до», смещённым на разницу высот. Малая доля «со сдвигом» значит, что
 * ниже точки правки содержимое то же и просто съехало.
 *
 * Скрипт отвечает «что изменилось и где», а не «стало ли лучше»:
 * на второй вопрос отвечают только открытые глазами снимки.
 * Нужен sharp (берётся из проекта, как и puppeteer-core).
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSharp, parseArgs, ensureDir, writeJson } from './lib.mjs';

const sharp = loadSharp();
if (!sharp) { console.error('Нужен sharp: запускайте из папки проекта, где он установлен, или укажите её в SITE_REWORK_PROJECT.'); process.exit(1); }

const { pos, opt } = parseArgs(process.argv.slice(2));
const threshold = Math.round(255 * (parseFloat(opt.threshold) || 0.1));

async function load(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const differ = (A, B, ia, ib) => Math.max(Math.abs(A[ia] - B[ib]), Math.abs(A[ia + 1] - B[ib + 1]), Math.abs(A[ia + 2] - B[ib + 2])) > threshold;

async function compare(a, b, outFile) {
  const A = await load(a), B = await load(b);
  const w = Math.max(A.w, B.w), h = Math.max(A.h, B.h);
  const pad = async (file, img) => (img.w === w && img.h === h) ? img : await load(await sharp(file).ensureAlpha().extend({ right: w - img.w, bottom: h - img.h, background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer());
  const pa = await pad(a, A), pb = await pad(b, B);
  const out = Buffer.alloc(w * h * 4);
  const bands = new Array(Math.ceil(h / 50)).fill(0);
  const rowChanged = new Uint32Array(h);
  let changed = 0;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    if (differ(pa.data, pb.data, p, p)) { changed++; const y = (i / w) | 0; bands[(y / 50) | 0]++; rowChanged[y]++; out[p] = 230; out[p + 1] = 30; out[p + 2] = 30; out[p + 3] = 255; }
    else { const g = Math.round((pa.data[p] * 0.3 + pa.data[p + 1] * 0.59 + pa.data[p + 2] * 0.11) * 0.35 + 165); out[p] = g; out[p + 1] = g; out[p + 2] = g; out[p + 3] = 255; }
  }
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toFile(outFile);
  const share = changed / (w * h) * 100;
  const hot = bands.map((n, i) => ({ from: i * 50, to: Math.min(h, (i + 1) * 50), share: n / (w * 50) * 100 })).filter((x) => x.share > 5);
  const regions = []; for (const x of hot) { const last = regions[regions.length - 1]; if (last && last.to === x.from) { last.to = x.to; last.max = Math.max(last.max, x.share); } else regions.push({ from: x.from, to: x.to, max: x.share }); }
  /* первая строка, где различий больше 1% ширины, и сравнение со сдвигом на разницу высот */
  let firstDiff = -1; for (let y = 0; y < h; y++) if (rowChanged[y] > w * 0.01) { firstDiff = y; break; }
  let shift = null;
  if (A.h !== B.h && firstDiff >= 0 && A.w === B.w) {
    const dy = B.h - A.h; let ch = 0, n = 0;
    for (let y = firstDiff; y < A.h; y++) { const yb = y + dy; if (yb < 0 || yb >= B.h) continue; const ra = y * w * 4, rb = yb * w * 4; for (let x = 0; x < w; x += 2) { n++; if (differ(pa.data, pb.data, ra + x * 4, rb + x * 4)) ch++; } }
    let plain = 0, pn = 0; for (let y = firstDiff; y < Math.min(A.h, B.h); y++) { const r = y * w * 4; for (let x = 0; x < w; x += 2) { pn++; if (differ(pa.data, pb.data, r + x * 4, r + x * 4)) plain++; } }
    shift = { dy, from: firstDiff, shiftedShare: n ? Math.round(ch / n * 1000) / 10 : null, plainShare: pn ? Math.round(plain / pn * 1000) / 10 : null };
  }
  return { changedShare: Math.round(share * 100) / 100, sizeA: `${A.w}×${A.h}`, sizeB: `${B.w}×${B.h}`, sizeChanged: A.w !== B.w || A.h !== B.h, firstDiff, shift, regions: regions.map((r) => ({ y: `${r.from}–${r.to}`, share: Math.round(r.max) })), verdict: share < 0.1 ? 'same' : share < 2 ? 'minor' : share < 20 ? 'changed' : 'major' };
}

let pairs = [];
let outDir;
if (opt.pair) {
  const [a, b] = pos.length >= 2 ? pos : [opt.pair, pos[0]];
  outDir = ensureDir(opt.out ? path.resolve(String(opt.out)) : path.join(path.dirname(path.resolve(b)), '..', 'diff'));
  pairs = [{ name: path.basename(b), a, b }];
} else {
  if (pos.length < 2) { console.error('Нужно: node diff.mjs <папка-before> <папка-after> [--out папка]  или  --pair a.png b.png'); process.exit(1); }
  const [da, db] = pos.map((p) => path.resolve(p));
  outDir = ensureDir(opt.out ? path.resolve(String(opt.out)) : path.join(path.dirname(db), 'diff'));
  const names = fs.readdirSync(da).filter((f) => f.endsWith('.png') && fs.existsSync(path.join(db, f)));
  const onlyA = fs.readdirSync(da).filter((f) => f.endsWith('.png') && !fs.existsSync(path.join(db, f)));
  const onlyB = fs.readdirSync(db).filter((f) => f.endsWith('.png') && !fs.existsSync(path.join(da, f)));
  if (onlyA.length || onlyB.length) console.log(`Без пары: только в первой ${onlyA.length}, только во второй ${onlyB.length}`);
  pairs = names.map((n) => ({ name: n, a: path.join(da, n), b: path.join(db, n) }));
}
if (!pairs.length) { console.error('Нет пар снимков с одинаковыми именами.'); process.exit(1); }

const results = [];
for (const p of pairs) {
  try { const r = await compare(p.a, p.b, path.join(outDir, p.name)); results.push({ name: p.name, ...r }); }
  catch (e) { results.push({ name: p.name, error: e.message }); }
}
results.sort((x, y) => (y.changedShare || 0) - (x.changedShare || 0));
console.log('| снимок | изменилось | вердикт | размер до → после | где (y) | со сдвигом |');
console.log('|---|---|---|---|---|---|');
for (const r of results) console.log(r.error ? `| ${r.name} | — | ошибка: ${r.error} | | | |` : `| ${r.name} | ${r.changedShare}% | ${r.verdict} | ${r.sizeA} → ${r.sizeB}${r.sizeChanged ? ' (высота изменилась)' : ''} | ${r.regions.map((x) => `${x.y} (${x.share}%)`).join(', ') || '—'} | ${r.shift ? `с y=${r.shift.from} сдвиг на ${r.shift.dy > 0 ? '+' : ''}${r.shift.dy}px: со сдвигом отличается ${r.shift.shiftedShare}% (без сдвига ${r.shift.plainShare}%)` : '—'} |`);
writeJson(path.join(outDir, 'diff.json'), { threshold, takenAt: new Date().toISOString(), results });
console.log(`\nКартинки различий: ${outDir}`);
