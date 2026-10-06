#!/usr/bin/env node
/* Покадровый съём поведения страницы — донора или своей — листами с метками времени: как живёт первый экран
   при загрузке и в покое, что делает шапка при прокрутке колёсиком вниз и вверх, как меняется превью при
   наведении на строки списка, что происходит после клика. Вынесено из прогона burbey.ru (03.10): поведение
   owlsdepartment.com пришлось снимать разовым скриптом. Вердиктов нет — это для глаз; числа движения —
   motion.mjs, переполнение и ошибки — runtime.mjs.

   RUN_DIR=<прогон> node frames.mjs <тег> <адрес | путь | home> [сценарии…] [флаги]
   Путь без ведущей косой (catalog/x) или home — от LOOK_BASE; полный адрес https://… — как есть.

   Сценарии — в порядке флагов в команде (загрузка — всегда первой, это сам переход):
     --load [мс=4000]          screencast (CDP Page.startScreencast) с момента перехода, --frames кадров равномерно
     --idle [длит.=6s]         покой: кадр окна каждые --every мс («6s», «6000», «6000ms»)
     --scroll-down [px=1200]   колёсиком мыши вниз: окно до, полоса шапки по ходу (screencast), окно после
     --scroll-up [px=400]      колёсиком вверх — то же; вместе с --scroll-down видно «прячется / возвращается»
     --hover <селектор строк>  навести на 1-ю, затем на 2-ю строку; кадры перехода 0–1400 мс (screencast)
     --click <селектор>        клик по первому видимому; кадры 0–1400 мс после клика
   Флаги:
     --frames N=12             кадров на листе загрузки
     --tframes N=8             кадров на листе перехода (прокрутка, наведение, клик)
     --dur мс=1400             длина перехода для screencast прокрутки, наведения и клика
     --every мс=500            шаг кадров покоя
     --band px                 высота полосы шапки (по умолчанию — по найденной закреплённой шапке, иначе 160)
     --width 1440 --height 900 окно (ширина меньше 700 — телефон: касание, 844 по высоте)
     --cookie "a=b;c=d"        куки до перехода
     --keep-consent            не нажимать «Принять» у плашки cookie (по умолчанию нажимается, если видна)
     --quality 80              качество JPEG кадров
     -h                        эта справка

   Выход — <прогон>/frames/<тег>/: кадры <сценарий>-NN.jpg, листы _load.png, _idle.png, _scroll-down.png
   (полоса шапки по ходу), _scroll-down-win.png (окно до и после), то же для -up, _hover.png, _click.png;
   подписи «сценарий · мс» («= прежний» — кадр не менялся с прошлой метки). frames.json — что снято: адрес,
   окно, по сценарию метки, время кадров, число кадров screencast (сколько раз картинка менялась), прокрутка
   и состояние шапки (top, transform, opacity, фон) до и после.

   Пример (донор):
     node frames.mjs owls https://www.owlsdepartment.com/ --load --idle 4s --scroll-down --scroll-up --hover ".works-table-row"
   Осторожно: screencast шлёт кадр только когда картинка поменялась — между метками держится последний кадр;
   страница, которая вообще не менялась, даёт лист одинаковых кадров, и это тоже ответ. */
import fs from 'node:fs';
import path from 'node:path';
import { RUN, BASE, lib, pagePath, cookieList } from './run-env.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\s?/, '');
const argv = process.argv.slice(2);
if (!argv.length || argv.includes('-h') || argv.includes('--help')) { console.log(HELP); process.exit(argv.length ? 0 : 1); }

/* разбор: сценарии с необязательным значением, сценарии с обязательным, флаги со значением, флаги-переключатели */
const SCEN_OPT = { load: /^\d+(ms)?$/, idle: /^\d+(\.\d+)?(s|ms)?$/, 'scroll-down': /^\d+$/, 'scroll-up': /^\d+$/ };
const SCEN_REQ = ['hover', 'click'];
const VALS = ['frames', 'tframes', 'dur', 'every', 'band', 'width', 'height', 'cookie', 'quality'];
const BOOLS = ['keep-consent'];
const scen = [], o = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { pos.push(a); continue; }
  const k = a.slice(2), nx = argv[i + 1];
  if (k in SCEN_OPT) { const v = nx != null && SCEN_OPT[k].test(nx) ? (i++, nx) : null; scen.push({ kind: k, val: v }); }
  else if (SCEN_REQ.includes(k)) { if (nx == null || nx.startsWith('--')) die(`--${k}: нужен селектор`); scen.push({ kind: k, val: nx }); i++; }
  else if (VALS.includes(k)) { if (nx == null || nx.startsWith('--')) die(`--${k}: нужно значение`); o[k] = nx; i++; }
  else if (BOOLS.includes(k)) o[k] = true;
  else die(`неизвестный флаг --${k} (все флаги — node frames.mjs -h)`);
}
function die(m) { console.error(`frames.mjs: ${m}`); process.exit(2); }
const [tag, raw] = pos;
if (!tag || !raw) die('нужны <тег> и <адрес | путь | home>');
if (pos.length > 2) die(`лишнее в команде: ${pos.slice(2).join(' ')} (селектор с пробелами — в кавычки)`);
if (!scen.length) die('не задано ни одного сценария: --load, --idle, --scroll-down, --scroll-up, --hover, --click');
const num = (k, d) => { const v = o[k] == null ? d : Number(o[k]); if (!Number.isFinite(v) || v <= 0) die(`--${k}: нужно положительное число`); return v; };
const ms = (s, d) => { if (s == null) return d; const m = String(s).match(/^(\d+(?:\.\d+)?)(s|ms)?$/); return m[2] === 's' ? Math.round(+m[1] * 1000) : Math.round(+m[1]); };

const url = /^https?:\/\//i.test(raw) ? raw : BASE + pagePath(raw);
const W = num('width', 1440), H = num('height', W < 700 ? 844 : 900), MOBILE = W < 700;
const NF = num('frames', 12), NT = num('tframes', 8), DUR = num('dur', 1400), EVERY = num('every', 500), Q = num('quality', 80);
const out = path.join(RUN, 'frames', tag); fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/\.(jpg|png)$/.test(f) || f === 'frames.json') fs.rmSync(path.join(out, f));
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const puppeteer = lib.loadPuppeteer(); const sharp = lib.loadSharp();
if (!sharp) die('нет sharp — листы не собрать (npm i sharp --prefix ~/.claude/site-rework)');

const report = { url, tag, viewport: { width: W, height: H, mobile: MOBILE }, started: new Date().toISOString(), scenarios: [] };
const browser = await puppeteer.launch({ executablePath: lib.requireChrome(), headless: true, args: ['--hide-scrollbars'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: MOBILE, hasTouch: MOBILE });
  const cookies = cookieList(o.cookie, new URL(url).hostname);
  if (cookies.length) await browser.setCookie(...cookies);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).split('\n')[0]));
  const cdp = await page.createCDPSession();

  /* screencast: кадры с временем от t0 (мс); act — что сделать после старта записи */
  async function cast(durMs, act) {
    const frames = []; let t0 = 0;
    const on = (e) => {
      const t = e.metadata && e.metadata.timestamp ? e.metadata.timestamp * 1000 : Date.now();
      frames.push({ t, buf: Buffer.from(e.data, 'base64') });
      cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
    };
    cdp.on('Page.screencastFrame', on);
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: Q, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    t0 = Date.now();
    const done = act ? act() : Promise.resolve();
    await sleep(durMs);
    await done.catch((e) => errs.push(`действие: ${String(e.message).split('\n')[0]}`));
    await cdp.send('Page.stopScreencast').catch(() => {});
    cdp.off('Page.screencastFrame', on);
    return { t0, frames: frames.map((f) => ({ ...f, ms: Math.round(f.t - t0) })).sort((a, b) => a.ms - b.ms) };
  }
  /* выбрать n меток равномерно 0…dur; на метке — последний кадр не позже неё */
  function pick({ frames }, n, dur) {
    const marks = []; let prev = null;
    for (let i = 0; i < n; i++) {
      const T = Math.round((dur * i) / Math.max(1, n - 1));
      let f = null; for (const x of frames) { if (x.ms <= T) f = x; else break; }
      if (!f) f = frames[0] || null;
      marks.push({ T, f, same: !!f && f === prev }); prev = f;
    }
    return marks;
  }
  async function saveMarks(name, marks, crop) {
    const files = [], labels = [], rows = [];
    for (let i = 0; i < marks.length; i++) {
      const { T, f, same } = marks[i];
      if (!f) { rows.push({ ms: T, frame: null }); continue; }
      const file = path.join(out, `${name}-${String(i).padStart(2, '0')}.jpg`);
      let img = sharp(f.buf);
      if (crop) { const m = await sharp(f.buf).metadata(); const k = m.width / W; img = img.extract({ left: 0, top: 0, width: m.width, height: Math.min(m.height, Math.round(crop * k)) }); }
      await img.jpeg({ quality: 88 }).toFile(file);
      files.push(file); labels.push(`${name} · ${T}${same ? ' = прежний' : ''}`);
      rows.push({ ms: T, frameMs: f.ms, same, file: path.basename(file) });
    }
    return { files, labels, rows };
  }
  async function sheet(file, files, labels, wide) {
    if (!files.length) return null;
    const r = await lib.contactSheet(files, path.join(out, file), wide ? { cols: 1, width: Math.min(1400, W), labels } : { cols: files.length <= 4 ? files.length : files.length <= 9 ? 3 : 4, width: MOBILE ? 260 : files.length <= 2 ? 720 : 460, labels });
    if (r) console.log(`OK   ${r.file} — кадров ${r.count}`);
    return r ? path.basename(r.file) : null;
  }
  async function shot(name) { const f = path.join(out, `${name}.jpg`); await page.screenshot({ path: f, type: 'jpeg', quality: Q }); return f; }

  /* закреплённая шапка: самый внешний fixed/sticky у верха окна; запоминается в странице */
  const headerState = () => page.evaluate(() => {
    const fixed = (e) => /fixed|sticky/.test(getComputedStyle(e).position);
    if (!window.__frHead || !window.__frHead.isConnected) {
      let best = null;
      for (const x of [innerWidth / 2, 40, innerWidth - 40]) for (const el of document.elementsFromPoint(x, 4)) {
        let n = el, top = null; while (n && n !== document.body) { if (fixed(n)) top = n; n = n.parentElement; }
        if (top && top.getBoundingClientRect().height < innerHeight * 0.6) { best = top; break; }
      }
      if (!best) best = [...document.querySelectorAll('header, [class*="header" i], [class*="nav" i]')].find((e) => fixed(e) && e.getBoundingClientRect().height < innerHeight * 0.6) || null;
      window.__frHead = best;
    }
    const h = window.__frHead; const y = Math.round(scrollY);
    if (!h) return { scrollY: y, header: null };
    const r = h.getBoundingClientRect(), cs = getComputedStyle(h);
    const sel = h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') + (typeof h.className === 'string' && h.className.trim() ? '.' + h.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    return { scrollY: y, header: { sel, top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), transform: cs.transform, opacity: cs.opacity, background: cs.backgroundColor, backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none', blend: cs.mixBlendMode } };
  });

  async function consent() {
    if (o['keep-consent']) return null;
    const hit = await page.evaluate(() => {
      const re = /^((i\s+)?(accept|agree|allow)( all)?( cookies)?|ok(ay)?(,? got it)?|got it|принять( все)?( cookie| куки)?|принимаю|согласен|согласна|хорошо|понятно|ок(,? понятно)?)[\s!.]*$/i;
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.bottom > 0 && r.top < innerHeight; };
      /* первая строка надписи: у кнопок с «бегущей» надписью текст продублирован («I ACCEPT\nI ACCEPT») */
      const txt = (e) => { const t = String(e.innerText || e.value || '').trim(); return t.length > 60 ? '' : t.split(/\n+/)[0].trim(); };
      const b = [...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')].find((e) => vis(e) && re.test(txt(e)));
      if (!b) return null; b.click(); return txt(b);
    }).catch(() => null);
    if (hit) { await sleep(800); console.log(`     cookie: нажато «${hit}»`); }
    return hit;
  }

  async function wheel(dy) {
    await page.mouse.move(W / 2, H / 2);
    /* щелчки колеса по 120 px, остаток — последним щелчком */
    const sg = Math.sign(dy); let left = Math.abs(dy);
    while (left > 0) { const d = Math.min(120, left); left -= d; await page.mouse.wheel({ deltaY: sg * d }); await sleep(60); }
  }

  /* --- загрузка: всегда первой --- */
  const loadSc = scen.find((s) => s.kind === 'load');
  let nav = null;
  if (loadSc) {
    const dur = ms(loadSc.val, 4000);
    const rec = await cast(dur, () => (nav = page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })));
    const marks = pick(rec, NF, dur);
    const { files, labels, rows } = await saveMarks('load', marks);
    const sh = await sheet('_load.png', files, labels);
    report.scenarios.push({ kind: 'load', durMs: dur, castFrames: rec.frames.length, firstFrameMs: rec.frames[0]?.ms ?? null, lastChangeMs: rec.frames.at(-1)?.ms ?? null, marks: rows, sheet: sh });
    console.log(`load: ${dur} мс, кадров screencast ${rec.frames.length}${rec.frames.length ? `, последняя смена картинки — ${rec.frames.at(-1).ms} мс` : ''}`);
  } else nav = page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const res = await nav;
  report.status = res ? res.status() : null;
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {});
  report.consent = await consent();

  for (const s of scen) {
    if (s.kind === 'load') continue;
    try {
      if (s.kind === 'idle') {
        const dur = ms(s.val, 6000), n = Math.floor(dur / EVERY) + 1, files = [], labels = [], rows = [];
        const t0 = Date.now();
        for (let i = 0; i < n; i++) {
          const T = i * EVERY; const wait = t0 + T - Date.now(); if (wait > 0) await sleep(wait);
          const at = Date.now() - t0; const f = await shot(`idle-${String(i).padStart(2, '0')}`);
          files.push(f); labels.push(`idle · ${at}`); rows.push({ ms: at, file: path.basename(f) });
        }
        const sh = await sheet('_idle.png', files, labels);
        report.scenarios.push({ kind: 'idle', durMs: dur, everyMs: EVERY, marks: rows, sheet: sh });
        console.log(`idle: ${dur} мс, кадров ${n}`);
      } else if (s.kind === 'scroll-down' || s.kind === 'scroll-up') {
        const px = s.val ? +s.val : s.kind === 'scroll-down' ? 1200 : 400;
        const before = await headerState();
        const band = o.band ? +o.band : before.header ? Math.min(Math.max(before.header.bottom, 60) + 24, 260) : 160;
        const fBefore = await shot(`${s.kind}-win-before`);
        const rec = await cast(DUR, () => wheel(s.kind === 'scroll-down' ? px : -px));
        await sleep(300);
        const after = await headerState();
        const fAfter = await shot(`${s.kind}-win-after`);
        const { files, labels, rows } = await saveMarks(s.kind, pick(rec, NT, DUR), band);
        const sh = await sheet(`_${s.kind}.png`, files, labels, true);
        const shw = await sheet(`_${s.kind}-win.png`, [fBefore, fAfter], [`${s.kind} · до (scrollY ${before.scrollY})`, `${s.kind} · после ${DUR + 300} мс (scrollY ${after.scrollY})`]);
        report.scenarios.push({ kind: s.kind, px, bandPx: band, castFrames: rec.frames.length, before, after, marks: rows, sheet: sh, sheetWindow: shw });
        const hs = (x) => (x.header ? `шапка top ${x.header.top}, transform ${x.header.transform}, opacity ${x.header.opacity}, фон ${x.header.background}` : 'закреплённой шапки нет');
        console.log(`${s.kind}: ${px}px колёсиком, scrollY ${before.scrollY} → ${after.scrollY}\n     до: ${hs(before)}\n     после: ${hs(after)}`);
      } else if (s.kind === 'hover') {
        const n = await page.$$eval(s.val, (els) => els.length);
        if (!n) { console.log(`hover: НЕТ элементов ${s.val}`); report.scenarios.push({ kind: 'hover', selector: s.val, error: 'нет элементов' }); continue; }
        await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), s.val);
        await page.mouse.move(4, H - 4); await sleep(900);
        const center = (k) => page.evaluate((sel, i) => { const e = document.querySelectorAll(sel)[i]; if (!e) return null; const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight ? { x: r.left + Math.min(r.width / 2, innerWidth / 2), y: r.top + r.height / 2 } : null; }, s.val, k);
        const allFiles = [], allLabels = [], parts = [];
        for (const k of [0, 1].filter((i) => i < n)) {
          const c = await center(k);
          if (!c) { parts.push({ row: k + 1, error: 'строка вне окна' }); console.log(`hover: строка ${k + 1} вне окна`); continue; }
          const rec = await cast(DUR, () => page.mouse.move(c.x, c.y, { steps: 8 }));
          const { files, labels, rows } = await saveMarks(`hover${k + 1}`, pick(rec, NT, DUR));
          allFiles.push(...files); allLabels.push(...labels);
          parts.push({ row: k + 1, point: { x: Math.round(c.x), y: Math.round(c.y) }, castFrames: rec.frames.length, lastChangeMs: rec.frames.at(-1)?.ms ?? null, marks: rows });
          console.log(`hover ${k + 1}: кадров screencast ${rec.frames.length}${rec.frames.length ? `, последняя смена — ${rec.frames.at(-1).ms} мс` : ''}`);
        }
        const sh = await sheet('_hover.png', allFiles, allLabels);
        report.scenarios.push({ kind: 'hover', selector: s.val, count: n, parts, sheet: sh });
      } else if (s.kind === 'click') {
        const c = await page.evaluate((sel) => {
          const e = [...document.querySelectorAll(sel)].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, s.val);
        if (!c) { console.log(`click: НЕТ видимого ${s.val}`); report.scenarios.push({ kind: 'click', selector: s.val, error: 'нет видимого элемента' }); continue; }
        await sleep(500);
        const fBefore = await shot('click-win-before');
        const rec = await cast(DUR, () => page.mouse.click(c.x, c.y));
        const { files, labels, rows } = await saveMarks('click', pick(rec, NT, DUR));
        const sh = await sheet('_click.png', [fBefore, ...files], ['click · до', ...labels]);
        report.scenarios.push({ kind: 'click', selector: s.val, castFrames: rec.frames.length, url: page.url(), marks: rows, sheet: sh });
        console.log(`click: кадров screencast ${rec.frames.length}, адрес после — ${page.url()}`);
      }
    } catch (e) {
      console.log(`${s.kind}: НЕ СНЯТО — ${String(e.message).split('\n')[0].slice(0, 200)}`);
      report.scenarios.push({ kind: s.kind, error: String(e.message).split('\n')[0] });
    }
  }
  report.pageErrors = errs.slice(0, 20);
  if (errs.length) console.log(`консоль: ${errs.slice(0, 3).join(' | ').slice(0, 300)}`);
} finally {
  await browser.close();
  fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify(report, null, 2));
  console.log(`OK   ${path.join(out, 'frames.json')}`);
}
