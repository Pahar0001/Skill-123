#!/usr/bin/env node
/* Лист верхних частей снимков look.mjs — десять страниц одним взглядом.
   RUN_DIR=<прогон> node tops.mjs <тег> <d|m> [высота обрезки=1100] [колонок=4] [с какой высоты=0]
   Лист — <прогон>/look/<тег>/_tops-<экран>.jpg; дальше — открыть глазами (Read). */
import fs from 'node:fs';
import path from 'node:path';
import { RUN, lib } from './run-env.mjs';

const sharp = lib.loadSharp();
const [tag, vp = 'd', cut = '1100', cols = '4', from = '0'] = process.argv.slice(2);
if (!tag) { console.error('node tops.mjs <тег> <d|m> [высота] [колонок] [с высоты]'); process.exit(1); }
const dir = path.join(RUN, 'look', tag);
const tmp = path.join(dir, '_crop'); fs.mkdirSync(tmp, { recursive: true });
const files = fs.readdirSync(dir).filter((f) => f.endsWith(`-${vp}.png`)).sort();
const out = [];
for (const f of files) {
  const m = await sharp(path.join(dir, f)).metadata();
  const scale = vp === 'm' ? 2 : 1;
  const top = Math.min(+from * scale, Math.max(0, m.height - 10));
  const h = Math.min(m.height - top, +cut * scale);
  const o = path.join(tmp, f.replace('.png', '.jpg'));
  await sharp(path.join(dir, f)).extract({ left: 0, top, width: m.width, height: h }).jpeg({ quality: 82 }).toFile(o);
  out.push(o);
}
const sheet = path.join(dir, `_tops-${vp}${+from ? `-${from}` : ''}.jpg`);
await lib.contactSheet(out, sheet, { cols: +cols, width: vp === 'm' ? 300 : 460, labels: out.map((f) => path.basename(f).replace(`-${vp}.jpg`, '')), background: '#8a8a8a' });
console.log(`OK   ${sheet}: кадров ${out.length}`);
