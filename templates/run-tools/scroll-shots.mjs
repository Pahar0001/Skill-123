#!/usr/bin/env node
/* Кадры окна в заданных точках прокрутки — посмотреть глазами движение, привязанное к прокрутке:
   лента растёт и поворачивается, шапка прозрачнеет, предмет всплывает. Числа движения меряет motion.mjs,
   а наезжает ли лента на текст на середине пути — видно только здесь.

   RUN_DIR=<прогон> LOOK_BASE=http://localhost:3100 node scroll-shots.mjs <тег> <путь | home> <селектор> <доли экрана через запятую> [ширина=1440]
   Доля — где стоит верх элемента: 0.9 — у низа окна, 0 — у верха, −0.5 — ушёл на пол-экрана вверх.
   Кадры и лист — <прогон>/look/<тег>/scroll-*.jpg, _scroll.jpg; в выводе — transform элемента в каждой точке. */
import fs from 'node:fs';
import path from 'node:path';
import { RUN, BASE, lib, pagePath } from './run-env.mjs';

const [tag, raw, sel, fr = '0.9,0.5,0.1', width = '1440'] = process.argv.slice(2);
if (!tag || !raw || !sel) { console.error('node scroll-shots.mjs <тег> <путь | home> <селектор> <доли> [ширина]'); process.exit(1); }
const puppeteer = lib.loadPuppeteer();
const out = path.join(RUN, 'look', tag); fs.mkdirSync(out, { recursive: true });
const W = +width, H = W < 700 ? 844 : 900;
const browser = await puppeteer.launch({ executablePath: lib.requireChrome(), headless: true, args: ['--hide-scrollbars'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
  await page.goto(BASE + pagePath(raw), { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(async () => { for (const im of document.images) im.loading = 'eager'; await document.fonts.ready; await Promise.all([...document.images].map((im) => im.decode().catch(() => {}))); });
  const files = [];
  for (const f of fr.split(',').map(Number)) {
    const y = await page.evaluate((s, k, h) => { const el = document.querySelector(s); if (!el) return -1; let t = 0, n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return Math.max(0, Math.round(t - k * h)); }, sel, f, H);
    if (y < 0) { console.log(`НЕТ элемента ${sel}`); break; }
    await page.evaluate((v) => scrollTo(0, v), y);
    await new Promise((r) => setTimeout(r, 1300));
    const real = await page.evaluate(() => Math.round(scrollY));
    const o = path.join(out, `scroll-${String(f).replace('.', '_')}.jpg`);
    await page.screenshot({ path: o, type: 'jpeg', quality: 84 });
    files.push(o);
    const tr = await page.evaluate((s) => { const el = document.querySelector(s); return el ? `${el.style.transform || getComputedStyle(el).transform}` : ''; }, sel);
    console.log(`доля ${f}: прокрутка ${real}px${real !== y ? ` (просили ${y})` : ''} · transform: ${tr.slice(0, 110)}`);
  }
  if (files.length) {
    await lib.contactSheet(files, path.join(out, '_scroll.jpg'), { cols: files.length, width: Math.min(640, Math.round(1900 / files.length)), labels: files.map((f) => path.basename(f, '.jpg')), background: '#8a8a8a' });
    console.log(`OK   ${path.join(out, '_scroll.jpg')}`);
  }
} finally { await browser.close(); }
