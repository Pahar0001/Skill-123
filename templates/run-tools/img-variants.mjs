#!/usr/bin/env node
/* Малые копии картинок под карточки: карточка на телефоне — 170 px, а снимок — 760. На каталоге из 80 позиций
   это 7 МБ против 2,4 МБ и крупнейший элемент 3,5 с против 1,3 с (боевой замер, медленный телефон).

   node img-variants.mjs <папка с .webp|.jpg|.png> [--width 400] [--min-height 300] [--q 76] [--map карта.json]
   Пишет <имя>-<ширина>.webp рядом. Узкие ленты (после уменьшения ниже --min-height) и и так малые картинки
   пропускает: карточка кадрирует по высоте, малая копия вышла бы мутной.
   --map — записать { "<имя>.webp": { w, h, sm: "<имя>-400.webp" | null } } для шаблона: по ней разметка
   ставит srcset="<малая> 400w, <полная> <w>w" и sizes по сетке карточек. */
import fs from 'node:fs';
import path from 'node:path';
import { lib, args } from './run-env.mjs';

const { opt, pos } = args();
const dir = pos[0];
if (!dir) { console.error('node img-variants.mjs <папка> [--width 400] [--min-height 300] [--q 76] [--map карта.json]'); process.exit(1); }
const sharp = lib.loadSharp();
const W = +opt('width', 400), MINH = +opt('min-height', 300), Q = +opt('q', 76);
const map = {}; let full = 0, small = 0, made = 0;
for (const f of fs.readdirSync(dir).filter((x) => /\.(webp|jpe?g|png)$/i.test(x) && !new RegExp(`-${W}\\.webp$`).test(x)).sort()) {
  const file = path.join(dir, f); const m = await sharp(file).metadata(); const size = fs.statSync(file).size; full += size;
  const out = path.join(dir, f.replace(/\.(webp|jpe?g|png)$/i, `-${W}.webp`));
  if (m.width <= W * 1.2 || m.height * W / m.width < MINH) { fs.rmSync(out, { force: true }); small += size; map[f] = { w: m.width, h: m.height, sm: null }; continue; }
  await sharp(file).resize(W).webp({ quality: Q, effort: 6 }).toFile(out);
  small += fs.statSync(out).size; made++; map[f] = { w: m.width, h: m.height, sm: path.basename(out) };
}
if (opt('map')) fs.writeFileSync(opt('map'), JSON.stringify(map, null, 1) + '\n');
console.log(`картинок ${Object.keys(map).length}, малых сделано ${made} · полные ${Math.round(full / 1024)} КБ → для карточек ${Math.round(small / 1024)} КБ`);
