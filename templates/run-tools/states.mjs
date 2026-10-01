#!/usr/bin/env node
/* Состояния, которых нет на обычном снимке страницы: открытое меню, панель фильтров, подсказки поиска,
   ошибки формы, сообщение после действия, страница «заявка принята». Сценарий — файл JSON, по шагу на состояние.
   Разовый инструмент прогона: проверки чисел делает runtime.mjs, здесь — снять и посмотреть глазами листом.

   RUN_DIR=<прогон> LOOK_BASE=http://localhost:3100 node states.mjs <тег> <сценарий.json> [--cookie "a=b;c=d"] [--allow-remote]
   Кадры — <прогон>/look/<тег>/st-*.jpg, лист — _states.jpg; в выводе по шагу — что вернул report и ошибки консоли.

   Сценарий: [{ "name": "menu-m", "viewport": "m", "path": "/", "do": [ … ], "report": "<выражение JS>" }, …]
   Действия в do — по одному ключу:
     { "click": "селектор" }            { "type": ["селектор", "текст"] }      { "wait": 700 }
     { "press": "Escape" }              { "eval": "выражение JS в странице" }   { "scroll": "селектор" }
     { "submit": "селектор формы", "novalidate": true }   отправить форму (novalidate — снять required: увидеть ошибки сервера)
     { "cookies": true }                заново поставить куки из --cookie (корзина опустела после заявки)
   viewport: "d" — 1440×900, "m" — 390×844@2. Шаг с ошибкой — строка «НЕ СНЯТО», остальные идут дальше.

   Отправка форм создаёт записи в базе стенда — поэтому по умолчанию только localhost; чужой адрес — --allow-remote,
   и только когда это стенд, а не боевой сайт. */
import fs from 'node:fs';
import path from 'node:path';
import { RUN, BASE, lib, args, cookieList } from './run-env.mjs';

const { opt, has, pos } = args();
const [tag, file] = pos;
if (!tag || !file) { console.error('node states.mjs <тег> <сценарий.json> [--cookie "a=b"] [--allow-remote]'); process.exit(1); }
if (!has('allow-remote') && !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(BASE + '/')) { console.error(`Адрес ${BASE} — не localhost: формы сценария создают записи. Стенд на другом адресе — флаг --allow-remote.`); process.exit(2); }
const steps = JSON.parse(fs.readFileSync(file, 'utf8'));
const puppeteer = lib.loadPuppeteer();
const out = path.join(RUN, 'look', tag); fs.mkdirSync(out, { recursive: true });
const cookies = cookieList(opt('cookie'), new URL(BASE).hostname);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const files = [];

const browser = await puppeteer.launch({ executablePath: lib.requireChrome(), headless: true, args: ['--hide-scrollbars'] });
try {
  if (cookies.length) await browser.setCookie(...cookies);
  for (const st of steps) {
    try {
      const [W, H, D] = st.viewport === 'm' ? [390, 844, 2] : [1440, 900, 1];
      const page = await browser.newPage();
      await page.setViewport({ width: W, height: H, deviceScaleFactor: D, isMobile: W < 700, hasTouch: W < 700 });
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e.message)));
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await page.goto(BASE + (st.path || '/'), { waitUntil: 'networkidle0', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      for (const a of st.do || []) {
        if (a.cookies) { if (cookies.length) await browser.setCookie(...cookies); await page.reload({ waitUntil: 'networkidle0' }); }
        else if (a.click) await page.click(a.click);
        else if (a.type) await page.type(a.type[0], a.type[1], { delay: 50 });
        else if (a.press) await page.keyboard.press(a.press);
        else if (a.wait) await wait(a.wait);
        else if (a.scroll) await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), a.scroll);
        else if (a.eval) await page.evaluate(a.eval);
        else if (a.submit) {
          if (a.novalidate) await page.evaluate((s) => { const f = document.querySelector(s); f.noValidate = true; for (const i of f.querySelectorAll('[required]')) i.removeAttribute('required'); }, a.submit);
          await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}), page.evaluate((s) => document.querySelector(s).submit(), a.submit)]);
        }
      }
      const note = st.report ? await page.evaluate(st.report).then((v) => (typeof v === 'string' ? v : JSON.stringify(v))).catch((e) => `report: ${e.message}`) : '';
      const o = path.join(out, `st-${st.name}.jpg`);
      await page.screenshot({ path: o, type: 'jpeg', quality: 84 });
      files.push(o);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
      console.log(`${st.name}: ${note}${m.sw > m.w + 1 ? ` · ШИРЕ ОКНА ${m.sw}` : ''}${errs.length ? ` · консоль: ${errs.slice(0, 2).join(' | ').slice(0, 200)}` : ''} · ${page.url().replace(BASE, '')}`);
      await page.close();
    } catch (e) { console.log(`${st.name}: НЕ СНЯТО — ${String(e.message).split('\n')[0].slice(0, 200)}`); }
  }
  if (files.length) {
    await lib.contactSheet(files, path.join(out, '_states.jpg'), { cols: 5, width: 380, labels: files.map((f) => path.basename(f, '.jpg').replace('st-', '')), background: '#8a8a8a' });
    console.log(`OK   ${path.join(out, '_states.jpg')}: кадров ${files.length}`);
  }
} finally { await browser.close(); }
