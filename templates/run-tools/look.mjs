#!/usr/bin/env node
/* Быстрый взгляд на страницы: вся страница на 1440 и 390 (движение остановлено, всё проявлено).
   Не замена runtime.mjs и shots.mjs: это «посмотреть глазами после правки» — за секунды, без протокола.

   RUN_DIR=<прогон> LOOK_BASE=http://localhost:3100 node look.mjs <тег> <путь без ведущей косой | home>… [--only d|m] [--cookie "a=b;c=d"]
   Снимки — <прогон>/look/<тег>/<страница>-d.png и -m.png; в выводе — высота, переполнение по ширине,
   число h1, ошибки консоли. Дальше — tops.mjs (лист верхов) или slices.mjs (длинная страница кусками). */
import fs from 'node:fs';
import path from 'node:path';
import { RUN, BASE, lib, args, pagePath, pageName, cookieList } from './run-env.mjs';

const { opt, pos } = args();
const [tag, ...paths] = pos;
if (!tag || !paths.length) { console.error('node look.mjs <тег> <путь | home>… [--only d|m] [--cookie "a=b"]'); process.exit(1); }
const puppeteer = lib.loadPuppeteer();
const out = path.join(RUN, 'look', tag); fs.mkdirSync(out, { recursive: true });
const only = opt('only'), cookies = cookieList(opt('cookie'));

const browser = await puppeteer.launch({ executablePath: lib.requireChrome(), headless: true, args: ['--hide-scrollbars'] });
try {
  for (const [vp, W, H, D] of [['d', 1440, 900, 1], ['m', 390, 844, 2]]) {
    if (only && only !== vp) continue;
    const page = await browser.newPage();
    if (cookies.length) await browser.setCookie(...cookies);
    await page.setViewport({ width: W, height: H, deviceScaleFactor: D, isMobile: W < 700, hasTouch: W < 700 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    for (const raw of paths) {
      const p = pagePath(raw);
      const res = await page.goto(BASE + p, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.evaluate(async () => {
        for (const im of document.images) im.loading = 'eager';
        await document.fonts.ready;
        await Promise.all([...document.images].map((im) => im.decode().catch(() => {})));
      });
      const m = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, h1: document.querySelectorAll('h1').length }));
      await page.screenshot({ path: path.join(out, `${pageName(p)}-${vp}.png`), fullPage: true, captureBeyondViewport: true });
      console.log(`${vp} ${res.status()} ${p} — высота ${m.h}${m.sw > W + 1 ? ` · ШИРЕ ОКНА: ${m.sw}` : ''}${m.h1 !== 1 ? ` · h1: ${m.h1}` : ''}${errs.length ? ` · ошибки: ${errs.splice(0).slice(0, 2).join(' | ')}` : ''}`);
    }
    await page.close();
  }
} finally { await browser.close(); }
