#!/usr/bin/env node
/* Длинный снимок страницы — листами по несколько экранов рядом: главную в 11 000 px иначе не просмотреть.
   node slices.mjs <снимок.png> [высота куска=1000] [кусков на лист=3] [ширина куска на листе=640]
   Листы — рядом со снимком: <имя>_s1.jpg, <имя>_s2.jpg …; отдельные куски — в _slices/. */
import fs from 'node:fs';
import path from 'node:path';
import { lib } from './run-env.mjs';

const sharp = lib.loadSharp();
const [file, cut = '1000', per = '3', width = '640'] = process.argv.slice(2);
if (!file) { console.error('node slices.mjs <снимок.png> [высота куска] [кусков на лист] [ширина]'); process.exit(1); }
const meta = await sharp(file).metadata();
/* снимок телефона снят с плотностью 2: кусок в CSS px вдвое выше в пикселях снимка */
const scale = meta.width <= 1000 ? meta.width / 390 : 1;
const H = Math.round(+cut * scale);
const dir = path.join(path.dirname(file), '_slices'); fs.mkdirSync(dir, { recursive: true });
const base = path.basename(file, '.png');
const parts = [];
for (let top = 0, i = 0; top < meta.height; top += H, i++) {
  const o = path.join(dir, `${base}-${String(i).padStart(2, '0')}.jpg`);
  await sharp(file).extract({ left: 0, top, width: meta.width, height: Math.min(H, meta.height - top) }).jpeg({ quality: 84 }).toFile(o);
  parts.push(o);
}
for (let i = 0, n = 1; i < parts.length; i += +per, n++) {
  const chunk = parts.slice(i, i + +per);
  const out = path.join(path.dirname(file), `${base}_s${n}.jpg`);
  await lib.contactSheet(chunk, out, { cols: chunk.length, width: +width, labels: chunk.map((_, k) => `${(i + k) * +cut}px`), background: '#8a8a8a' });
  console.log(`OK   ${out}`);
}
