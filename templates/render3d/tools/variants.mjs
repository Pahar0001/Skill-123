#!/usr/bin/env node
/* Малые ширины готового кадра — чтобы телефон не качал ленту в 2880 px.
   node variants.mjs <кадр.png|webp>… --widths 600,960 [--out папка] [--q 78]
   Пишет <имя>-<ширина>.webp рядом с исходником (или в --out). Исходником лучше брать PNG рендера:
   повторное сжатие WebP → WebP мылит. В разметке — srcset с этими ширинами и честный sizes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const files = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
const widths = String(opt('widths', '')).split(',').map(Number).filter(Boolean);
if (!files.length || !widths.length) { console.error('node variants.mjs <кадр.png>… --widths 600,960 [--out папка] [--q 78]'); process.exit(1); }
const lib = await import(pathToFileURL(path.join(os.homedir(), '.claude', 'skills', 'site-rework', 'scripts', 'lib.mjs')).href);
const sharp = lib.loadSharp();
for (const f of files) {
  const meta = await sharp(f).metadata();
  const dir = opt('out', path.dirname(f)); fs.mkdirSync(dir, { recursive: true });
  for (const w of widths) {
    if (w >= meta.width) { console.log(`пропуск ${path.basename(f)} → ${w}: исходник ${meta.width} px не шире`); continue; }
    const out = path.join(dir, `${path.basename(f).replace(/\.(png|webp)$/i, '')}-${w}.webp`);
    await sharp(f).resize(w).webp({ quality: +opt('q', 78), alphaQuality: 82, effort: 6 }).toFile(out);
    console.log(`OK   ${path.basename(out)} ← ${path.basename(f)} ${meta.width}×${meta.height} · ${Math.round(fs.statSync(out).size / 1024)} КБ`);
  }
}
