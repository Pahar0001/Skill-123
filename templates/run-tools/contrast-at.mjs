#!/usr/bin/env node
/* Контраст текста на картинке — своим замером, когда a11y.mjs дал провал и хочется понять, что под текстом:
   текст делается прозрачным, снимается коробка элемента, цвет текста сравнивается с каждым пикселем подложки.
   Если худшие 10 % дают ≈ 1:1 при хорошей медиане — текст частично перекрыт светлым соседом (карточка внахлёст).

   LOOK_BASE=http://localhost:3100 node contrast-at.mjs <путь | home> <селектор> [ширина=390]
   Осторожно: clip у снимка считается от начала документа, а не окна — к координатам прибавлена прокрутка. */
import { BASE, lib, pagePath } from './run-env.mjs';

const [raw, sel, width = '390'] = process.argv.slice(2);
if (!raw || !sel) { console.error('node contrast-at.mjs <путь | home> <селектор> [ширина]'); process.exit(1); }
const puppeteer = lib.loadPuppeteer(); const sharp = lib.loadSharp();
const W = +width;
const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const browser = await puppeteer.launch({ executablePath: lib.requireChrome(), headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: W < 700 ? 844 : 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(BASE + pagePath(raw), { waitUntil: 'networkidle0' });
  const n = await page.$$eval(sel, (els) => els.length);
  if (!n) console.log(`НЕТ элементов ${sel}`);
  for (let i = 0; i < n; i++) {
    const info = await page.evaluate(async (s, k) => {
      const el = document.querySelectorAll(s)[k];
      el.scrollIntoView({ block: 'center' });
      for (const im of document.images) im.loading = 'eager';
      await Promise.all([...document.images].map((im) => im.decode().catch(() => {})));
      const cs = getComputedStyle(el); const color = cs.color; el.style.color = 'transparent';
      const r = el.getBoundingClientRect();
      return { color, text: el.textContent.trim(), size: cs.fontSize, x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
    }, sel, i);
    await new Promise((r) => setTimeout(r, 400));
    const buf = await page.screenshot({ clip: { x: info.x, y: info.y, width: info.w, height: info.h } });
    const { data, info: im } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const [tr, tg, tb] = info.color.match(/\d+/g).map(Number); const lt = lum(tr, tg, tb);
    const ratios = [];
    for (let p = 0; p < data.length; p += im.channels) { const lb = lum(data[p], data[p + 1], data[p + 2]); ratios.push((Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05)); }
    ratios.sort((a, b) => a - b);
    console.log(`«${info.text.slice(0, 50)}» ${info.size} ${info.color} · коробка ${Math.round(info.w)}×${Math.round(info.h)} · контраст: худший ${ratios[0].toFixed(2)}, худшие 10% ${ratios[Math.floor(ratios.length * 0.1)].toFixed(2)}, медиана ${ratios[Math.floor(ratios.length / 2)].toFixed(2)}`);
  }
} finally { await browser.close(); }
