#!/usr/bin/env node
/* Кадр стоящего предмета с тенью на земле: рамка по самому предмету (плотные пиксели) с запасом под тень.
   Тень от «купола» расходится далеко — без обрезки предмет в кадре мелкий, а в вёрстке не встаёт на линию.
   node crop-ground.mjs <кадр.png> [--side 0.3] [--bottom 0.07] [--out файл.webp] [--q 88]
   Печатает, на какой доле высоты кадра стоит низ предмета: на столько же кадр опускают в вёрстке
   (transform: translateY(…%)), чтобы предмет стоял на линии, а тень лежала ниже неё. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const src = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
if (!src) { console.error('node crop-ground.mjs <кадр.png> [--side 0.3] [--bottom 0.07] [--out файл.webp]'); process.exit(1); }
const lib = await import(pathToFileURL(path.join(os.homedir(), '.claude', 'skills', 'site-rework', 'scripts', 'lib.mjs')).href);
const sharp = lib.loadSharp();
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let x0 = info.width, x1 = 0, y0 = info.height, y1 = 0;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
if (x1 <= x0) { console.error('FAIL плотных пикселей нет — кадр пустой или целиком полупрозрачный'); process.exit(1); }
const w = x1 - x0, h = y1 - y0, side = +opt('side', 0.3), bot = +opt('bottom', 0.07);
const left = Math.max(0, Math.round(x0 - w * side)), right = Math.min(info.width, Math.round(x1 + w * side)), top = Math.max(0, y0 - 4), bottom = Math.min(info.height, Math.round(y1 + h * bot));
const out = opt('out', src.replace(/\.png$/i, '.webp'));
await sharp(src).extract({ left, top, width: right - left, height: bottom - top }).webp({ quality: +opt('q', 88), alphaQuality: 90, effort: 5 }).toFile(out);
const m = await sharp(out).metadata();
console.log(`OK   ${path.basename(out)}: ${m.width}×${m.height}, ${Math.round(fs.statSync(out).size / 1024)} КБ · предмет ${w}×${h}, низ предмета на ${(100 * (y1 - top) / (bottom - top)).toFixed(1)}% высоты кадра`);
