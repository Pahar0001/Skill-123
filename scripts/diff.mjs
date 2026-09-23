#!/usr/bin/env node
/**
 * Сравнение снимков «до» и «после»: где именно изменилась картинка.
 *
 *   node diff.mjs <папка-before> <папка-after> [--out папка] [--threshold 0.1] [--no-rescale] [--all]
 *   node diff.mjs --pair a.png b.png [--out папка] [--threshold 0.1] [--no-rescale]
 *   node diff.mjs --help
 *
 * Флаги:
 *   --out         куда положить картинки различий и diff.json (по умолчанию <папка-after>/../diff,
 *                 для --pair — <папка b>/../diff).
 *   --threshold   порог различия пикселя, доля от 255 по худшему каналу, от 0 до 1 (по умолчанию
 *                 0.1). 0 — считать любое отличие канала хотя бы на 1 из 255; вне 0…1 — код 1.
 *   --pair        сравнить два файла (без папок).
 *   --no-rescale  не приводить масштаб: сравнивать пиксели как есть (раньше так было всегда).
 *   --all         сравнивать и служебные файлы shots.mjs — вырезки *-stale*.png и листы *-sheet.png
 *                 (по умолчанию пропускаются: это не снимки страницы, а их производные).
 *   --help, -h    эта справка.
 *
 * Папка --out создаётся только после проверки аргументов: неверный --threshold, нет папки
 * или файла, лишние аргументы, нет ни одной пары — код 1, и ничего не создано.
 *
 * Пары складываются по одинаковым именам файлов. Для каждой пары:
 * доля изменившихся пикселей, полосы по высоте, где изменения сосредоточены,
 * и картинка diff/<имя>.png — изменённое красным поверх приглушённого «до».
 *
 * Масштаб. Одна и та же страница, снятая ×2 (обычный снимок на телефоне) и ×1 (длинная страница,
 * способ dpr1 или склейка ×1), попиксельно отличается почти целиком — «major» на одинаковом
 * содержимом. Поэтому перед сравнением масштаб приводится к общему: из shots.json каждой папки
 * (поле files[имя].scale — пикселей снимка на CSS-пиксель; для --pair — shots.json рядом с файлом),
 * а если его нет (старые снимки, чужие файлы) — по ширине: снимок шире уменьшается до ширины
 * другого (ширина в CSS-пикселях у пары одна — тот же экран). Разный масштаб печатается
 * предупреждением: после уменьшения края букв всё равно немного расходятся (×1 рисуется иначе, чем
 * уменьшенный ×2), поэтому «minor» и «changed» на таких парах — ещё не правка, смотреть глазами.
 * Если по shots.json у пары разные экраны (ширина в CSS-пикселях), масштаб не приводится.
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
 * Код выхода: 0 — сравнение сделано (сколько бы ни изменилось) и после --help/-h; 1 — нет sharp,
 * нет пар, нет папки или файла, неверные аргументы.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSharp, parseArgs, ensureDir, writeJson, readJson } from './lib.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h', 'no-rescale', 'all'] });
if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
const die = (m) => { console.error(m); process.exit(1); };

/* порог: доля 0…1; 0 — любое отличие канала хотя бы на 1 из 255 */
let thr = 0.1;
if (opt.threshold !== undefined) {
  thr = opt.threshold === true ? NaN : Number(String(opt.threshold).trim().replace(',', '.'));
  if (String(opt.threshold).trim() === '' || !Number.isFinite(thr) || thr < 0 || thr > 1) die(`--threshold: доля от 0 до 1 (0 — любое отличие, по умолчанию 0.1), а не «${opt.threshold === true ? '' : opt.threshold}»`);
}
if (opt.out === true) die('--out без папки: --out <папка>');
const threshold = Math.round(255 * thr);
const rescale = !opt['no-rescale'];

const sharp = loadSharp();
if (!sharp) die('Нужен sharp: запускайте из папки проекта, где он установлен, или укажите её в SITE_REWORK_PROJECT.');

async function load(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const differ = (A, B, ia, ib) => Math.max(Math.abs(A[ia] - B[ib]), Math.abs(A[ia + 1] - B[ib + 1]), Math.abs(A[ia + 2] - B[ib + 2])) > threshold;

/* масштаб снимка из shots.json его папки: { scale, cssWidth, dpr, fullMode } или null */
const metaCache = new Map();
function metaOf(file) {
  const dir = path.dirname(path.resolve(file));
  if (!metaCache.has(dir)) metaCache.set(dir, readJson(path.join(dir, 'shots.json'), null));
  const j = metaCache.get(dir);
  const f = j && j.files && j.files[path.basename(file)];
  return f && f.scale ? f : null;
}
const r3 = (v) => Math.round(v * 1000) / 1000;

/* привести пару к общему масштабу: уменьшить тот, что крупнее; вернуть входы для сравнения и заметку */
async function common(a, b) {
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const A = metaOf(a), B = metaOf(b);
  const info = { scaleA: A ? A.scale : null, scaleB: B ? B.scale : null, from: null, widthA: ma.width, widthB: mb.width };
  if (!rescale || ma.width === mb.width) return { inA: a, inB: b, note: null, info };
  if (A && B && A.cssWidth && B.cssWidth && A.cssWidth !== B.cssWidth) return { inA: a, inB: b, note: `разные экраны (${A.cssWidth} и ${B.cssWidth} CSS-пикселей) — масштаб не приводится`, info };
  /* по shots.json — если оба масштаба известны; иначе по ширине */
  const sa = A && B ? A.scale : ma.width, sb = A && B ? B.scale : mb.width;
  const bigA = sa > sb; const target = bigA ? mb.width : ma.width;
  const src = bigA ? a : b; const meta = bigA ? ma : mb;
  const buf = await sharp(src).resize({ width: target, height: Math.round(meta.height * target / meta.width), fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  info.from = A && B ? 'shots.json' : 'ширина';
  const label = (m, s) => (m ? `×${r3(m.scale)}` : `${s} px`);
  const note = `разный масштаб: до ${label(A, ma.width)} (${ma.width}×${ma.height}), после ${label(B, mb.width)} (${mb.width}×${mb.height}) — ${bigA ? '«до»' : '«после»'} уменьшен до ширины ${target} px (по ${info.from}); края букв после уменьшения расходятся — смотреть глазами`;
  return bigA ? { inA: buf, inB: b, note, info } : { inA: a, inB: buf, note, info };
}

async function compare(a, b, outFile) {
  const cm = await common(a, b);
  const A = await load(cm.inA), B = await load(cm.inB);
  const w = Math.max(A.w, B.w), h = Math.max(A.h, B.h);
  const pad = async (input, img) => (img.w === w && img.h === h) ? img : await load(await sharp(input).ensureAlpha().extend({ right: w - img.w, bottom: h - img.h, background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer());
  const pa = await pad(cm.inA, A), pb = await pad(cm.inB, B);
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
  return { changedShare: Math.round(share * 100) / 100, sizeA: `${A.w}×${A.h}`, sizeB: `${B.w}×${B.h}`, sizeChanged: A.w !== B.w || A.h !== B.h, firstDiff, shift, rescaled: cm.note ? { note: cm.note, ...cm.info } : null, regions: regions.map((r) => ({ y: `${r.from}–${r.to}`, share: Math.round(r.max) })), verdict: share < 0.1 ? 'same' : share < 2 ? 'minor' : share < 20 ? 'changed' : 'major' };
}

let pairs = [];
let outDir;
if (opt.pair) {
  const [a, b] = typeof opt.pair === 'string' ? [opt.pair, pos[0]] : pos;
  if (!a || !b) { console.error('Нужно: node diff.mjs --pair a.png b.png'); process.exit(1); }
  const extra = typeof opt.pair === 'string' ? pos.slice(1) : pos.slice(2);
  if (extra.length) die(`лишние аргументы: ${extra.join(' ')} — для --pair нужно ровно два файла`);
  for (const f of [a, b]) if (!fs.existsSync(f) || !fs.statSync(f).isFile()) die(`нет файла ${path.resolve(f)}`);
  outDir = opt.out ? path.resolve(String(opt.out)) : path.join(path.dirname(path.resolve(b)), '..', 'diff');
  pairs = [{ name: path.basename(b), a, b }];
} else {
  if (pos.length < 2) { console.error('Нужно: node diff.mjs <папка-before> <папка-after> [--out папка]  или  --pair a.png b.png  (подробно: --help)'); process.exit(1); }
  const [da, db] = pos.map((p) => path.resolve(p));
  for (const d of [da, db]) if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) die(`нет папки ${d}${fs.existsSync(d) ? ' (это файл: два файла сравниваются через --pair a.png b.png)' : ''}`);
  if (pos.length > 2) die(`лишние аргументы: ${pos.slice(2).join(' ')} — нужно ровно две папки`);
  outDir = opt.out ? path.resolve(String(opt.out)) : path.join(path.dirname(db), 'diff');
  /* производные shots.mjs (вырезки залипания, листы миниатюр) — не снимки страницы */
  const service = (f) => !opt.all && /-(stale(-up)?|scroll-sheet|sheet)\.png$/.test(f);
  const pngs = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.png') && !service(f));
  const names = pngs(da).filter((f) => fs.existsSync(path.join(db, f)));
  const onlyA = pngs(da).filter((f) => !fs.existsSync(path.join(db, f)));
  const onlyB = pngs(db).filter((f) => !fs.existsSync(path.join(da, f)));
  if (onlyA.length || onlyB.length) console.log(`Без пары: только в первой ${onlyA.length}${onlyA.length ? ` (${onlyA.slice(0, 4).join(', ')}${onlyA.length > 4 ? '…' : ''})` : ''}, только во второй ${onlyB.length}${onlyB.length ? ` (${onlyB.slice(0, 4).join(', ')}${onlyB.length > 4 ? '…' : ''})` : ''}`);
  pairs = names.map((n) => ({ name: n, a: path.join(da, n), b: path.join(db, n) }));
}
if (!pairs.length) { console.error('Нет пар снимков с одинаковыми именами.'); process.exit(1); }
/* папка результатов — только после проверки аргументов и пар */
ensureDir(outDir);

const results = [];
for (const p of pairs) {
  try { const r = await compare(p.a, p.b, path.join(outDir, p.name)); results.push({ name: p.name, ...r }); }
  catch (e) { results.push({ name: p.name, error: e.message }); }
}
results.sort((x, y) => (y.changedShare || 0) - (x.changedShare || 0));
const rescaledList = results.filter((r) => r.rescaled);
for (const r of rescaledList) console.log(`WARN ${r.name}: ${r.rescaled.note}`);
if (rescaledList.length) console.log('');
console.log('| снимок | изменилось | вердикт | размер до → после | где (y) | со сдвигом |');
console.log('|---|---|---|---|---|---|');
for (const r of results) console.log(r.error ? `| ${r.name} | — | ошибка: ${r.error} | | | |` : `| ${r.name} | ${r.changedShare}% | ${r.verdict}${r.rescaled && r.rescaled.from ? ' (масштаб приведён)' : ''} | ${r.sizeA} → ${r.sizeB}${r.sizeChanged ? ' (высота изменилась)' : ''} | ${r.regions.map((x) => `${x.y} (${x.share}%)`).join(', ') || '—'} | ${r.shift ? `с y=${r.shift.from} сдвиг на ${r.shift.dy > 0 ? '+' : ''}${r.shift.dy}px: со сдвигом отличается ${r.shift.shiftedShare}% (без сдвига ${r.shift.plainShare}%)` : '—'} |`);
writeJson(path.join(outDir, 'diff.json'), { threshold, rescale, takenAt: new Date().toISOString(), results });
console.log(`\nКартинки различий: ${outDir}`);
