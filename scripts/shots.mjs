#!/usr/bin/env node
/**
 * Снимки для сравнения «до» и «после»: одинаковые экраны, одинаковые условия.
 *
 *   node shots.mjs <url> [--out папка] [--tag before|after] [--viewports desktop,tablet,mobile]
 *                  [--with-320] [--pages /,/about,/contacts] [--no-freeze] [--scheme dark]
 *                  [--segments 8] [--shot-pause 1200] [--full-mode auto|segments] [--sheet] [--strict]
 *
 * Флаги:
 *   --tag         подпапка снимков (before | after | любое имя), по умолчанию before.
 *   --viewports   экраны через запятую: пресеты desktop, laptop, tablet, mobile, mobile-s (320×568@2),
 *                 android (360×800@3), запись ШxВ@плотность («320x568@2») или одна ширина («320»).
 *                 По умолчанию desktop,tablet,mobile.
 *   --with-320    добавить к выбранным экранам mobile-s (320 px) — на нём вылезают закреплённые панели.
 *   --pages       страницы через запятую относительно адреса.
 *   --no-freeze   не останавливать движение (если нужно поймать именно фазу анимации).
 *   --scheme      light | dark — prefers-color-scheme.
 *   --segments N  сколько снимков окна по всей высоте (равномерно, последний — низ страницы);
 *                 0 — не снимать. По умолчанию 8.
 *   --shot-pause  пауза перед каждым снимком окна, мс (по умолчанию 1200: ленивое и появления успевают).
 *   --full-mode   auto (как раньше: целиком, при длинной странице ×1 или склейка) | segments (всегда
 *                 склейка из снимков окна — закреплённые слои в каждом экране).
 *   --sheet       ещё и лист миниатюр снимков окна (<страница>-<экран>-scroll-sheet.png).
 *   --strict      код выхода 1, если есть FAIL (состояние не сбрасывается).
 *
 * Что снимается на каждой странице и каждом экране (<папка>/<tag>/):
 *   <страница>-<экран>-first.png         первый экран СРАЗУ после загрузки, до всякой прокрутки;
 *   <страница>-<экран>-scroll-NN.png     снимки окна равномерно по всей высоте — на них видны
 *                                         закреплённые слои (зерно, шапка, нижняя панель), которых
 *                                         нет на снимке всей страницы ниже первого экрана;
 *   <страница>-<экран>-first-return.png  первый экран после прокрутки до низа и обратно;
 *   <страница>-<экран>-full.png          вся страница;
 *   <страница>-<экран>-stale.png         (если есть расхождение) вырезка «при загрузке | после возврата».
 * Имена одинаковые для before и after, чтобы diff.mjs сложил их в пары. В shots.json для каждого
 * файла записан масштаб (пикселей снимка на CSS-пиксель) — по нему diff.mjs приводит ×2 и ×1.
 *
 * Проверка «состояние не сбрасывается»: first и first-return сравниваются попиксельно.
 * Что меняется само (холст, видео, карусель) — отсекается вторым снимком при загрузке через 700 мс.
 * Остальное — области, в которых перечисляются элементы и что у них изменилось (класс, цвет,
 * прозрачность). Изменились класс, цвет, фон, рамка → FAIL «состояние не сбрасывается» (подсвеченный
 * пункт меню, раскрытая шапка, всплывшее сообщение). Только проявление (прозрачность 0 → 1) или
 * только холст и видео → WARN.
 *
 * Движение (без --no-freeze): перед снимком при загрузке конечные анимации доигрываются, бесконечные
 * ставятся в фазу 0; перед прокруткой — freezeMotion (переходы отключаются). Иначе два снимка одной
 * страницы различались бы фазой анимации.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  launch, openPage, scrollThrough, scrollToY, screenSegment, forceInstantScroll, freezeMotion, fullPageShot,
  waitForMedia, settleAnimations, pickViewports, parseArgs, runDir, writeJson, ensureDir, pageSlug, pagesFrom,
  sleep, loadSharp, evaluateWith, SIG_FN, EFFECTIVE_OPACITY_FN, FULLPAGE_NOTE,
} from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['with-320', 'no-freeze', 'sheet', 'strict'] });
if (!pos[0]) { console.error('Нужен адрес: node shots.mjs <url> [--tag before|after] [--pages /,/about] [--viewports ...] [--with-320]'); process.exit(1); }
const base = new URL(pos[0]);
const run = runDir(opt, pos[0]);
const tag = opt.tag || 'before';
const outDir = ensureDir(path.join(run, tag));
const pages = opt.pages ? pagesFrom(opt.pages, base) : [base.href];
const viewports = pickViewports(opt.viewports);
if (opt['with-320'] && !viewports.some(([, vp]) => vp.width === 320)) viewports.push(...pickViewports('mobile-s'));
const segments = opt.segments === undefined ? 8 : Math.max(0, Math.floor(Number(opt.segments) || 0));
const shotPause = Math.max(0, Number(opt['shot-pause']) || 1200);
const fullMode = opt['full-mode'] === 'segments' ? 'segments' : 'auto';
const freeze = !opt['no-freeze'];
const sharp = loadSharp();

/* конечные анимации и переходы — в конец, бесконечные — в фазу 0 (как freezeMotion, но без
   отключения переходов: при загрузке страница ещё должна жить своей жизнью) */
const still = (page) => page.evaluate(() => {
  for (const a of document.getAnimations()) {
    try { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; if (t.iterations === Infinity) { a.pause(); a.currentTime = 0; } else if (a.playState !== 'finished') a.finish(); } catch { /* без конца или привязана к прокрутке */ }
  }
}).catch(() => {});

/* состояние элементов первого экрана: по нему потом говорим, ЧТО изменилось в области */
function rememberFirstInPage() {
  const vw = innerWidth, vh = innerHeight; const m = new Map();
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    const s = getComputedStyle(el);
    m.set(el, { cls: el.getAttribute('class') || '', o: eff(el), color: s.color, bg: s.backgroundColor, bd: `${s.borderTopColor} ${s.borderBottomColor} ${s.outlineStyle} ${s.outlineColor}`, tr: s.transform, td: s.textDecorationLine, aria: ['aria-current', 'aria-expanded', 'aria-selected', 'aria-pressed', 'open'].map((a) => el.getAttribute(a) || '').join('|'), src: el.currentSrc || el.getAttribute('src') || '' });
    if (m.size >= 5000) break;
  }
  window.__rwFirst = m;
  return m.size;
}

function explainInPage(regions) {
  const first = window.__rwFirst || new Map();
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const short = (c) => String(c).replace(/rgba?\(([^)]+)\)/g, (m0, v) => { const p = v.split(/[,\s/]+/).filter(Boolean).map(Number); return '#' + p.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase() + (p.length > 3 && p[3] < 1 ? `/${p[3]}` : ''); });
  return regions.map((R) => {
    const hit = (r) => !(r.right < R.x || r.left > R.x + R.w || r.bottom < R.y || r.top > R.y + R.h);
    const changed = [];
    for (const [el, a] of first) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect(); if (!hit(r)) continue;
      const s = getComputedStyle(el); const d = [];
      const cls = el.getAttribute('class') || '';
      if (cls !== a.cls) { const A = new Set(a.cls.split(/\s+/).filter(Boolean)), B = new Set(cls.split(/\s+/).filter(Boolean)); const add = [...B].filter((c) => !A.has(c)), rem = [...A].filter((c) => !B.has(c)); d.push(`класс ${add.map((c) => '+' + c).concat(rem.map((c) => '−' + c)).join(' ')}`); }
      const o = eff(el);
      if (Math.abs(o - a.o) > 0.1) d.push(`прозрачность ${a.o}→${o}`);
      if (s.color !== a.color) d.push(`цвет ${short(a.color)}→${short(s.color)}`);
      if (s.backgroundColor !== a.bg) d.push(`фон ${short(a.bg)}→${short(s.backgroundColor)}`);
      if (`${s.borderTopColor} ${s.borderBottomColor} ${s.outlineStyle} ${s.outlineColor}` !== a.bd) d.push('рамка или обводка');
      if (s.transform !== a.tr) d.push('сдвиг (transform)');
      if (s.textDecorationLine !== a.td) d.push('подчёркивание');
      const aria = ['aria-current', 'aria-expanded', 'aria-selected', 'aria-pressed', 'open'].map((x) => el.getAttribute(x) || '').join('|');
      if (aria !== a.aria) d.push(`атрибуты ${a.aria}→${aria}`);
      if ((el.currentSrc || el.getAttribute('src') || '') !== a.src) d.push('другая картинка');
      if (d.length) changed.push({ sig: sig(el), text: txt(el), diffs: d, appeared: a.o <= 0.05 && o > 0.5 });
    }
    /* что лежит сверху в области — для случаев, когда по стилям причину не видно */
    const top = new Set(); const media = [];
    for (let y = R.y + 2; y < R.y + R.h; y += Math.max(4, R.h / 5)) for (let x = R.x + 2; x < R.x + R.w; x += Math.max(4, R.w / 8)) {
      const el = document.elementFromPoint(x, y); if (!el) continue;
      if (/^(CANVAS|VIDEO|IFRAME)$/.test(el.tagName)) media.push(sig(el));
      if (!first.has(el)) top.add(`${sig(el)} «${txt(el)}» (новый)`); else top.add(`${sig(el)} «${txt(el)}»`);
    }
    /* внешние изменившиеся: потомка с теми же отличиями, что у предка, не повторяем */
    const uniq = []; const seen = new Set();
    for (const c of changed) { const key = c.diffs.join(';') + c.text; if (seen.has(key)) continue; seen.add(key); uniq.push(c); }
    const newEls = [...top].filter((t) => t.endsWith('(новый)'));
    return { changed: uniq.slice(0, 8), changedCount: uniq.length, top: [...top].slice(0, 6), media: [...new Set(media)], newEls };
  });
}

/* попиксельное сравнение двух снимков окна: области (в CSS-пикселях), где отличие не объясняется «живыми» местами */
async function staleRegions(bufA, bufB, bufNoise, dpr) {
  const a = await sharp(bufA).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bufB).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = bufNoise ? await sharp(bufNoise).removeAlpha().raw().toBuffer({ resolveWithObject: true }) : null;
  const { width: w, height: h } = a.info;
  if (b.info.width !== w || b.info.height !== h) return { error: `размеры снимков разные: ${w}×${h} и ${b.info.width}×${b.info.height}` };
  const d3 = (X, Y, i) => Math.abs(X[i] - Y[i]) + Math.abs(X[i + 1] - Y[i + 1]) + Math.abs(X[i + 2] - Y[i + 2]);
  /* «живое» — то, что меняется само за 700 мс при загрузке; расширяем на 6 CSS-пикселей */
  const cell = Math.max(4, Math.round(8 * dpr)); const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
  const live = new Uint8Array(cw * ch); let liveCount = 0;
  if (n && n.info.width === w && n.info.height === h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; if (d3(a.data, n.data, i) > 60) { liveCount++; live[((y / cell) | 0) * cw + ((x / cell) | 0)] = 1; } }
    const grown = new Uint8Array(live); for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) if (live[cy * cw + cx]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = cy + dy, xx = cx + dx; if (yy >= 0 && yy < ch && xx >= 0 && xx < cw) grown[yy * cw + xx] = 1; }
    live.set(grown);
  }
  const cnt = new Uint32Array(cw * ch); let changed = 0, liveSkipped = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3; if (d3(a.data, b.data, i) <= 60) continue;
    const c = ((y / cell) | 0) * cw + ((x / cell) | 0);
    if (live[c]) { liveSkipped++; continue; }
    changed++; cnt[c]++;
  }
  /* клетки с заметным числом отличий → связные области */
  const on = new Uint8Array(cw * ch); for (let i = 0; i < on.length; i++) on[i] = cnt[i] >= 3 ? 1 : 0;
  const seen = new Uint8Array(cw * ch); const regions = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen[i]) continue;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1, px = 0; const st = [i]; seen[i] = 1;
    while (st.length) {
      const k = st.pop(); const cx = k % cw, cy = (k / cw) | 0; px += cnt[k];
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = cy + dy, xx = cx + dx; if (yy < 0 || yy >= ch || xx < 0 || xx >= cw) continue; const j = yy * cw + xx; if (on[j] && !seen[j]) { seen[j] = 1; st.push(j); } }
    }
    if (px < 20) continue;
    regions.push({ x: Math.round(x0 * cell / dpr), y: Math.round(y0 * cell / dpr), w: Math.round((x1 - x0 + 1) * cell / dpr), h: Math.round((y1 - y0 + 1) * cell / dpr), pixels: px });
  }
  regions.sort((p, q) => q.pixels - p.pixels);
  return { changed, liveSkipped, livePixels: liveCount, regions: regions.slice(0, 6), share: Math.round(changed / (w * h) * 10000) / 100 };
}

/* вырезка «при загрузке | после возврата» по общей рамке областей */
async function staleCrop(bufA, bufB, regions, dpr, file) {
  const meta = await sharp(bufA).metadata();
  const x0 = Math.min(...regions.map((r) => r.x)) - 12, y0 = Math.min(...regions.map((r) => r.y)) - 12;
  const x1 = Math.max(...regions.map((r) => r.x + r.w)) + 12, y1 = Math.max(...regions.map((r) => r.y + r.h)) + 12;
  const left = Math.max(0, Math.round(x0 * dpr)), top = Math.max(0, Math.round(y0 * dpr));
  const width = Math.max(1, Math.min(meta.width - left, Math.round((x1 - x0) * dpr))), height = Math.max(1, Math.min(meta.height - top, Math.round((y1 - y0) * dpr)));
  const A = await sharp(bufA).extract({ left, top, width, height }).png().toBuffer();
  const B = await sharp(bufB).extract({ left, top, width, height }).png().toBuffer();
  const gap = 10;
  await sharp({ create: { width: width * 2 + gap, height, channels: 4, background: { r: 230, g: 30, b: 30, alpha: 1 } } }).composite([{ input: A, left: 0, top: 0 }, { input: B, left: width + gap, top: 0 }]).png().toFile(file);
}

const browser = await launch();
const index = []; const files = {}; let fails = 0, warns = 0;
const scaleOf = async (file, cssWidth) => { if (!sharp) return null; try { const m = await sharp(file).metadata(); return Math.round(m.width / cssWidth * 1000) / 1000; } catch { return null; } };
try {
  for (const url of pages) {
    const slug = pageSlug(url);
    for (const [name, vp] of viewports) {
      process.stdout.write(`· ${slug} ${name} … `);
      const dpr = vp.deviceScaleFactor || 1; const stem = `${slug}-${name}`;
      try {
        const page = await openPage(browser, url, vp, { scheme: opt.scheme || 'light' });
        await forceInstantScroll(page);
        await waitForMedia(page, { timeout: 6000 });
        /* 1. первый экран как его видит человек при загрузке — до прокрутки */
        if (freeze) { await settleAnimations(page, 2500); await still(page); await sleep(150); }
        const first = path.join(outDir, `${stem}-first.png`);
        const bufFirst = await page.screenshot({ path: first });
        await evaluateWith(page, rememberFirstInPage, null, { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN }).catch(() => 0);
        /* второй снимок при загрузке: что меняется само (холст, видео, карусель) — не «залипание» */
        await sleep(700); if (freeze) await still(page);
        const bufNoise = await page.screenshot();
        /* 2. проход до низа: ленивое, появления; затем снимки окна по всей высоте */
        if (freeze) await freezeMotion(page);
        const sc = await scrollThrough(page, { pause: 250, shotsDir: segments ? outDir : null, tag: `${stem}-scroll`, maxShots: segments, shotPause, skipTop: true, sheet: !!opt.sheet });
        /* 3. снова наверх — первый экран после возврата */
        await scrollToY(page, 0); await sleep(Math.min(800, shotPause));
        if (freeze) await still(page);
        const firstReturn = path.join(outDir, `${stem}-first-return.png`);
        const seg = await screenSegment(page, 0, { file: firstReturn, pause: 400, settle: 1500 });
        if (freeze) await still(page);
        /* 4. вся страница */
        const full = path.join(outDir, `${stem}-full.png`);
        const how = await fullPageShot(page, full, { mode: fullMode });
        const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
        const errors = page.log.console.filter((c) => c.type === 'error').length + page.log.errors.length;
        /* 5. сравнение первого экрана при загрузке и после возврата */
        let stale = { verdict: 'OK', regions: [] };
        if (seg.scrollY > 2) stale = { verdict: 'WARN', note: `страница не вернулась наверх (scrollY ${seg.scrollY}) — сравнение недостоверно`, regions: [] };
        else if (!sharp) stale = { verdict: 'WARN', note: 'нет sharp — первый экран не сравнивался', regions: [] };
        else {
          const r = await staleRegions(bufFirst, fs.readFileSync(firstReturn), bufNoise, dpr);
          if (r.error) stale = { verdict: 'WARN', note: r.error, regions: [] };
          else if (r.regions.length) {
            const why = await evaluateWith(page, explainInPage, r.regions.map(({ x, y, w, h: hh }) => ({ x, y, w, h: hh })), { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN }).catch(() => r.regions.map(() => ({ changed: [], top: [], media: [], newEls: [] })));
            const regions = r.regions.map((g, i) => {
              const e = why[i] || { changed: [], top: [], media: [], newEls: [] };
              const real = e.changed.filter((c) => !c.appeared);
              const kind = real.length || e.newEls.length ? 'stuck' : e.changed.length ? 'appeared' : e.media.length ? 'media' : 'unknown';
              return { ...g, kind, changed: e.changed, top: e.top, media: e.media };
            });
            const bad = regions.filter((g) => g.kind === 'stuck' || g.kind === 'unknown');
            stale = { verdict: bad.length ? 'FAIL' : 'WARN', share: r.share, liveSkipped: r.liveSkipped, regions };
            const crop = path.join(outDir, `${stem}-stale.png`);
            await staleCrop(bufFirst, fs.readFileSync(firstReturn), regions, dpr, crop).then(() => { stale.crop = path.basename(crop); }).catch(() => {});
          } else stale = { verdict: 'OK', share: r.share, liveSkipped: r.liveSkipped, regions: [] };
        }
        if (stale.verdict === 'FAIL') fails++; else if (stale.verdict === 'WARN') warns++;
        const scrollNote = sc.stuck ? 'страница не прокручивается — снимки окна и появления недостоверны' : !sc.reachedBottom ? `до низа не доехали: ${sc.maxScrollY} из ${sc.pageHeight - (vp.height || 0)} px` : '';
        if (scrollNote) warns++;
        /* масштаб каждого файла — для diff.mjs */
        const segFiles = (sc.shots || []).map((s) => s.file);
        for (const f of [path.basename(first), path.basename(firstReturn), path.basename(full), ...segFiles]) files[f] = { scale: await scaleOf(path.join(outDir, f), vp.width), cssWidth: vp.width, viewport: name };
        for (const s of sc.shots || []) files[s.file].y = s.scrollY;
        index.push({ url, page: slug, viewport: name, width: vp.width, height: h, dpr, first: path.basename(first), firstReturn: path.basename(firstReturn), full: path.basename(full), fullMode: how, segments: (sc.shots || []).map((s) => ({ file: s.file, y: s.scrollY, pendingMedia: s.media ? s.media.pending : null })), sheet: sc.sheet, scroll: { pageHeight: sc.pageHeight, maxScrollY: sc.maxScrollY, reachedBottom: sc.reachedBottom, stuck: sc.stuck }, stale, consoleErrors: errors });
        console.log(`ок, высота ${h}px, снимков окна ${segFiles.length}${how !== 'full' ? ` (вся страница снята как ${how})` : ''}${errors ? `, ошибок в консоли ${errors}` : ''}`);
        if (scrollNote) console.log(`  WARN прокрутка — ${scrollNote}`);
        if (stale.verdict === 'OK') console.log(`  OK   первый экран после прокрутки туда и обратно тот же${stale.liveSkipped ? ` (живые места — холст, видео — не в счёт)` : ''}`);
        else if (stale.note) console.log(`  WARN первый экран: ${stale.note}`);
        else {
          console.log(`  ${stale.verdict.padEnd(4)} ${stale.verdict === 'FAIL' ? 'состояние не сбрасывается' : 'первый экран после возврата отличается'}: ${stale.share}% пикселей${stale.crop ? `, вырезка ${stale.crop}` : ''}`);
          for (const g of stale.regions) {
            const what = g.kind === 'stuck' ? 'залипло' : g.kind === 'appeared' ? 'проявилось только после прокрутки (при загрузке пусто)' : g.kind === 'media' ? `холст или видео (${g.media.join(', ')})` : 'причина по стилям не видна — смотреть вырезку';
            const list = g.changed.length ? g.changed.slice(0, 4).map((c) => `${c.sig}${c.text ? ` «${c.text}»` : ''}: ${c.diffs.join(', ')}`).join(' | ') : g.top.slice(0, 3).join(' | ');
            console.log(`       x${g.x} y${g.y} ${g.w}×${g.h}: ${what} — ${list}`);
          }
        }
        await page.close();
      } catch (e) { console.log(`сбой: ${e.message}`); index.push({ url, page: slug, viewport: name, error: e.message }); fails++; }
    }
  }
} finally { await browser.close(); }
writeJson(path.join(outDir, 'shots.json'), { tag, takenAt: new Date().toISOString(), note: FULLPAGE_NOTE, files, shots: index });
const verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
console.log(`\n${verdict}: ${fails} провалов, ${warns} предупреждений`);
console.log(`Снимки: ${outDir}`);
console.log(`Оговорка: ${FULLPAGE_NOTE}`);
if (opt.strict && fails) process.exit(1);
