#!/usr/bin/env node
/**
 * Проверка в живом браузере того, что статикой не проверить: консоль,
 * холсты (рисует ли WebGL/2D), анимации, реакция на наведение, клик, ввод,
 * прокрутку, режим «меньше движения».
 *
 *   node runtime.mjs <url> [--viewport mobile] [--out папка] [--tag имя]
 *        [--reduced-motion] [--scheme dark] [--no-fail] [--init "js"]
 *
 *   шаги, выполняются в порядке записи:
 *        --wait 800            подождать
 *        --scroll              прокрутить до конца: появления, переполнение, липкие
 *        --hover "sel"         навести и записать, что изменилось в стилях
 *        --click "sel"         кликнуть и записать, что изменилось: адрес, видимые
 *                              элементы, aria-expanded, диалоги, ошибки
 *        --type "sel=текст"    ввести текст и проверить, что он в поле
 *        --key Tab             нажать клавишу, записать, где фокус
 *        --canvas              холсты: тип контекста, есть ли рисунок (пять зон:
 *                              центр и углы), меняется ли кадр, частота кадров
 *        --motion              анимации: сколько, какие, что остаётся при
 *                              «меньше движения»
 *        --eval "js"           выполнить выражение (можно Promise) и записать результат
 *        --shot имя            снимок экрана
 *        --fullpage            снимок всей страницы в конце
 *   не шаг, а настройка:
 *        --init "js"           выполнить код до всех скриптов страницы — например,
 *                              поставить PerformanceObserver на layout-shift и потом
 *                              прочитать его через --eval
 *
 * Выход: <папка>/runtime/<tag>.json, снимки рядом и протокол с вердиктами
 * OK / WARN / FAIL. Код выхода 1 при ошибках консоли или проваленных шагах.
 *
 * Вердикт OK означает «в браузере произошло то, что ожидалось». Красиво ли
 * это — отвечает только снимок, открытый глазами.
 */
import path from 'node:path';
import { launch, preparePage, gotoRetry, waitForOverlay, scrollThrough, fullPageShot, VIEWPORTS, runDir, writeJson, sleep, ensureDir, loadSharp } from './lib.mjs';

/* ---------- аргументы: шаги в порядке записи ---------- */
const argv = process.argv.slice(2);
const STEP = new Set(['wait', 'scroll', 'hover', 'click', 'type', 'key', 'canvas', 'motion', 'eval', 'shot', 'fullpage']);
const FLAG = new Set(['scroll', 'canvas', 'motion', 'fullpage', 'reduced-motion', 'no-fail']);
const steps = []; const opt = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { pos.push(a); continue; }
  const k = a.slice(2); const v = FLAG.has(k) ? true : argv[++i];
  if (STEP.has(k)) steps.push({ k, v }); else opt[k] = v;
}
const url = pos[0];
if (!url) { console.error('Нужен адрес: node runtime.mjs <url> [--viewport mobile] [--scroll] [--click sel] [--canvas] [--motion] ...'); process.exit(1); }
const vpName = opt.viewport || 'desktop';
const vp = VIEWPORTS[vpName];
if (!vp) { console.error(`Неизвестный экран ${vpName}. Есть: ${Object.keys(VIEWPORTS).join(', ')}`); process.exit(1); }
const run = runDir(opt, url);
const outDir = ensureDir(path.join(run, 'runtime'));
const tag = opt.tag || `${vpName}${opt['reduced-motion'] ? '-reduced' : ''}`;

const SIG = `(el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '')`;
const STATE_PROPS = ['color', 'backgroundColor', 'borderTopColor', 'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'outlineStyle', 'outlineColor', 'filter', 'letterSpacing', 'scale', 'translate'];

const report = { url, viewport: vpName, tag, reducedMotion: !!opt['reduced-motion'], startedAt: new Date().toISOString(), steps: [], console: null, verdict: null };
let fails = 0, warns = 0;
const line = (status, what, details) => {
  if (status === 'FAIL') fails++; if (status === 'WARN') warns++;
  console.log(`${status.padEnd(4)} ${what}${details ? ' — ' + details : ''}`);
  report.steps.push({ status, what, details });
};
let shotN = 0;
const shot = async (page, name) => { const file = path.join(outDir, `${tag}-${String(++shotN).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: file }); return path.basename(file); };

/* ---------- страница ---------- */
const browser = await launch();
let page;
try {
  page = await preparePage(browser, vp, { scheme: opt.scheme || 'light', reducedMotion: !!opt['reduced-motion'] });
  /* --cpu 4 — процессор в четыре раза медленнее, как у слабого телефона: ловить долгие задачи там, где они есть */
  if (Number(opt.cpu) > 1) { const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt.cpu) }); }
  if (opt.init) await page.evaluateOnNewDocument(String(opt.init));
  await gotoRetry(page, url);
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  page.overlay = await waitForOverlay(page, 5000);
  await sleep(500);
} catch (e) { console.error(`FAIL открыть ${url}: ${e.message}`); await browser.close(); process.exit(1); }
if (page.retries) line('WARN', 'соединение', `страница открылась с ${page.retries + 1}-й попытки — сервер или сеть отвечают нестабильно`);
const errCount = () => page.log.console.filter((c) => c.type === 'error').length + page.log.errors.length;
const loadErrors = errCount();
line(loadErrors ? 'FAIL' : 'OK', `загрузка ${url} (${vpName}${opt['reduced-motion'] ? ', меньше движения' : ''})`, loadErrors ? `${loadErrors} ошибок в консоли: ${[...page.log.console.filter((c) => c.type === 'error').map((c) => c.text), ...page.log.errors].slice(0, 3).map((t) => t.replace(/\n/g, ' ').slice(0, 120)).join(' | ')}` : `ошибок в консоли нет, ${page.log.requests.length} запросов`);
if (page.log.failed.length) line('WARN', 'упавшие запросы', page.log.failed.slice(0, 4).map((f) => `${f.reason} ${f.url.split('/').pop().slice(0, 50)}`).join('; '));
if (page.overlay.hadOverlay) line(page.overlay.gone ? 'OK' : 'WARN', `заставка ${page.overlay.overlay} при загрузке`, page.overlay.gone ? `ушла через ${page.overlay.waitedMs} мс` : `не ушла за ${page.overlay.waitedMs} мс — закрывает страницу`);

const readState = (h) => h.evaluate((el, props) => { const s = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, s[p]])); }, STATE_PROPS);
const diffState = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${String(a[k]).slice(0, 28)} → ${String(b[k]).slice(0, 28)}`);
const snapshot = () => page.evaluate((sigSrc) => {
  const sig = eval(sigSrc); const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.05; };
  const all = [...document.body.querySelectorAll('*')];
  return { url: location.href, title: document.title, visible: all.filter(vis).length, dialogs: [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"], [class*="modal"], [class*="popup"], [class*="overlay"]')].filter(vis).length, expanded: [...document.querySelectorAll('[aria-expanded="true"]')].length, active: document.activeElement ? sig(document.activeElement) : null, scrollY: Math.round(scrollY), bodyClass: document.body.className, htmlClass: document.documentElement.className };
}, SIG);
/* первое видимое совпадение: селектор вроде «.btn» часто первым даёт скрытую кнопку в закрытом меню */
const find = async (sel) => {
  let list = []; try { list = await page.$$(sel); } catch { find.info = { total: 0 }; return null; }
  find.info = { total: list.length };
  for (const h of list) {
    const ok = await h.evaluate((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.05; }).catch(() => false);
    if (ok) return h;
  }
  return null;
};
const notFound = () => (find.info && find.info.total ? `найдено ${find.info.total}, но все невидимы` : 'элемент не найден');

for (const { k, v } of steps) {
  const errBefore = errCount();
  try {
    if (k === 'wait') { await sleep(Number(v) || 500); line('OK', `ждали ${v} мс`); }

    else if (k === 'scroll') {
      /* кандидаты на появление при прокрутке: спрятанные ниже первого экрана; то, что по замыслу
         показывается при наведении (классы вроде _show-hover), не считаем */
      await page.evaluate(() => { document.querySelectorAll('[data-rw-hidden]').forEach((e) => e.removeAttribute('data-rw-hidden')); const vh = innerHeight; [...document.body.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 30 && r.top + scrollY > vh && s.display !== 'none' && s.position !== 'fixed' && !/hover/i.test(el.className) && (parseFloat(s.opacity) < 0.95 || (s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)')); }).slice(0, 80).forEach((el, i) => el.setAttribute('data-rw-hidden', i)); });
      const res = await scrollThrough(page, { shotsDir: outDir, tag: `${tag}-scroll`, maxShots: 6 });
      const after = await page.evaluate((sigSrc) => { const sig = eval(sigSrc); const marked = [...document.querySelectorAll('[data-rw-hidden]')]; const still = marked.filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.05).map(sig); return { marked: marked.length, still, overflow: document.documentElement.scrollWidth > innerWidth + 1, sticky: [...document.querySelectorAll('*')].filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position) && el.getBoundingClientRect().height > 20).slice(0, 5).map(sig) }; }, SIG);
      const st = after.overflow ? 'FAIL' : after.still.length ? 'WARN' : 'OK';
      line(st, `прокрутка ${res.pageHeight}px, ${res.screens} экранов`, `${after.marked} блоков ждали появления, не появились: ${after.still.length}${after.still.length ? ` (${after.still.slice(0, 4).join(', ')})` : ''}${after.overflow ? ' · ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА' : ''}${after.sticky.length ? ` · закреплены: ${after.sticky.join(', ')}` : ''}`);
    }

    else if (k === 'hover') {
      const h = await find(v);
      if (!h) { line('FAIL', `наведение ${v}`, notFound()); continue; }
      await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.mouse.move(0, 0); await sleep(150);
      const base = await readState(h); await h.hover(); await sleep(700); const hov = await readState(h);
      const file = await shot(page, 'hover'); const d = diffState(base, hov); await page.mouse.move(0, 0);
      line(d.length ? 'OK' : 'WARN', `наведение ${v}`, d.length ? `${d.join('; ')} · ${file}` : `ничего не изменилось · ${file}`);
    }

    else if (k === 'click') {
      const h = await find(v);
      if (!h) { line('FAIL', `клик ${v}`, notFound()); continue; }
      const before = await snapshot(); const targetBefore = await h.evaluate((el) => el.getAttribute('aria-expanded'));
      await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(150);
      const nav = page.waitForNavigation({ timeout: 4000 }).catch(() => null);
      try { await h.click(); } catch { await h.evaluate((el) => el.click()); }
      await Promise.race([nav, sleep(900)]); await sleep(400);
      let after; try { after = await snapshot(); } catch { await sleep(1200); after = await snapshot(); }
      const targetAfter = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.getAttribute('aria-expanded') : null; }, v).catch(() => null);
      const changes = [];
      if (after.url !== before.url) changes.push(`адрес → ${after.url}`);
      if (after.visible !== before.visible) changes.push(`видимых элементов ${before.visible} → ${after.visible}`);
      if (after.dialogs !== before.dialogs) changes.push(`диалогов ${before.dialogs} → ${after.dialogs}`);
      if (targetAfter !== targetBefore) changes.push(`aria-expanded ${targetBefore} → ${targetAfter}`);
      else if (after.expanded !== before.expanded) changes.push(`раскрытых ${before.expanded} → ${after.expanded}`);
      if (Math.abs(after.scrollY - before.scrollY) > 20) changes.push(`прокрутка ${before.scrollY} → ${after.scrollY}`);
      if (after.bodyClass !== before.bodyClass || after.htmlClass !== before.htmlClass) changes.push('класс на body/html изменился');
      if (after.active !== before.active) changes.push(`фокус → ${after.active}`);
      const file = await shot(page, 'click'); const newErr = errCount() - errBefore;
      line(newErr ? 'FAIL' : changes.length ? 'OK' : 'WARN', `клик ${v}`, `${changes.join('; ') || 'ничего наблюдаемого не изменилось'}${newErr ? ` · НОВЫХ ОШИБОК ${newErr}` : ''} · ${file}`);
    }

    else if (k === 'type') {
      const eq = String(v).indexOf('='); const sel = String(v).slice(0, eq), text = String(v).slice(eq + 1);
      const h = await find(sel);
      if (!h) { line('FAIL', `ввод в ${sel}`, notFound()); continue; }
      /* выделяем всё, что было в поле, и печатаем поверх — так же, как человек с Ctrl+A */
      await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await h.focus(); await h.evaluate((el) => { try { el.select(); } catch { el.value = ''; } });
      await h.type(text, { delay: 20 });
      const { val, kind } = await h.evaluate((el) => ({ val: el.value, kind: (el.getAttribute('type') || '').toLowerCase() }));
      const sortDigits = (s) => s.replace(/\D/g, '').split('').sort().join('');
      const digits = /\d/.test(text) && val.replace(/\D/g, '').endsWith(text.replace(/\D/g, '')); /* маска телефона переставляет скобки и добавляет код страны — не ошибка */
      const dateLike = /^(date|time|datetime-local|month|week)$/.test(kind) && val !== '' && sortDigits(val) === sortDigits(text); /* поле даты хранит ISO, а печатают по-русски */
      const ok = val === text || digits || dateLike;
      line(ok ? 'OK' : 'FAIL', `ввод в ${sel}`, ok ? `в поле «${val}»` : `ожидали «${text}», в поле «${val}» (маска или обработчик переписывает)`);
    }

    else if (k === 'key') {
      await page.keyboard.press(String(v)); await sleep(250);
      const s = await snapshot(); line('OK', `клавиша ${v}`, `фокус на ${s.active}${s.dialogs ? `, диалогов ${s.dialogs}` : ''}`);
    }

    else if (k === 'canvas') {
      const res = await page.evaluate(async (sigSrc) => {
        const sig = eval(sigSrc); const out = [];
        for (const c of document.querySelectorAll('canvas')) {
          const r = c.getBoundingClientRect();
          const rec = { el: sig(c), w: Math.round(r.width), h: Math.round(r.height), buffer: `${c.width}×${c.height}`, visible: r.width > 0 && r.height > 0, ctx: 'unknown', filled: null, regions: null, regionsTotal: 5, variance: null, animated: null, error: null };
          let gl = null, c2d = null;
          try { gl = c.getContext('webgl2') || c.getContext('webgl'); } catch { /* другой тип */ }
          if (gl) rec.ctx = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) ? 'webgl2' : 'webgl';
          else { try { c2d = c.getContext('2d'); if (c2d) rec.ctx = '2d'; } catch { /* нет */ } }
          /* пять зон — центр и четыре угла: сцена, нарисованная по краям, не должна считаться пустой */
          const rw = Math.max(8, Math.min(128, Math.floor(c.width / 3))), rh = Math.max(8, Math.min(128, Math.floor(c.height / 3)));
          const regions = [[(c.width - rw) / 2, (c.height - rh) / 2], [c.width * 0.08, c.height * 0.08], [c.width * 0.92 - rw, c.height * 0.08], [c.width * 0.08, c.height * 0.92 - rh], [c.width * 0.92 - rw, c.height * 0.92 - rh]].map(([x, y]) => [Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y))]);
          const readOnce = () => new Promise((res) => requestAnimationFrame(() => { try { res(regions.map(([x, y]) => { if (gl) { const b = new Uint8Array(rw * rh * 4); gl.readPixels(x, y, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; } if (c2d) return c2d.getImageData(x, y, rw, rh).data; return null; })); } catch (e) { rec.error = String(e.message || e).slice(0, 100); res(null); } }));
          const nonEmpty = (b) => { let n = 0; for (let i = 0; i < b.length; i += 4) if (b[i + 3] > 8 && (b[i] > 8 || b[i + 1] > 8 || b[i + 2] > 8)) n++; return n; };
          const total = (bs) => bs.reduce((s, b) => s + (b ? nonEmpty(b) : 0), 0);
          /* без preserveDrawingBuffer буфер пуст после композиции: пробуем три кадра и берём самый полный */
          const read = async () => { let best = null; for (let k = 0; k < 3; k++) { const bs = await readOnce(); if (bs && bs.some(Boolean) && (!best || total(bs) > total(best))) best = bs; if (best && total(best)) break; } return best; };
          const A = await read();
          if (A && A.some(Boolean)) {
            const px = rw * rh; const per = A.map((b) => (b ? nonEmpty(b) / px : 0));
            rec.filled = Math.round(per.reduce((s, v) => s + v, 0) / per.length * 1000) / 10;
            rec.regions = per.filter((v) => v > 0.005).length;
            const a = A[0]; if (a) { let sum = 0, sq = 0; const n = a.length / 4; for (let i = 0; i < a.length; i += 4) { const l = (a[i] + a[i + 1] + a[i + 2]) / 3; sum += l; sq += l * l; } rec.variance = Math.round(Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2))); }
            await new Promise((r2) => setTimeout(r2, 350)); const B = await read();
            if (B) { let d = 0, t = 0; A.forEach((a2, ri) => { const b2 = B[ri]; if (!a2 || !b2) return; for (let i = 0; i < a2.length; i += 16) { t++; if (Math.abs(a2[i] - b2[i]) > 6 || Math.abs(a2[i + 1] - b2[i + 1]) > 6) d++; } }); rec.changedShare = t ? Math.round(d / t * 1000) / 10 : null; rec.animated = t ? d / t > 0.005 : null; }
          }
          out.push(rec);
        }
        const fps = await new Promise((r2) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r2(n); }; requestAnimationFrame(f); });
        return { canvases: out, fps };
      }, SIG);
      if (!res.canvases.length) line('WARN', 'холсты', 'на странице нет <canvas>');
      /* главная проверка — по снимкам: тот же участок экрана с холстом и со спрятанным холстом.
         Различаются — холст что-то рисует, независимо от типа контекста и preserveDrawingBuffer.
         Два снимка с холстом через 350 мс — меняется ли кадр. Чтение буфера выше — подробность. */
      const sharp = loadSharp(); const handles = await page.$$('canvas');
      /* снимок всего окна и вырезка прямоугольника элемента в координатах окна: clip у page.screenshot
         считается от начала документа, и после прокрутки к элементу попадал не туда */
      const dprS = vp.deviceScaleFactor || 1;
      const raw = async (buf, box) => (await sharp(buf).extract({ left: Math.round(box.x * dprS), top: Math.round(box.y * dprS), width: Math.max(1, Math.round(box.width * dprS)), height: Math.max(1, Math.round(box.height * dprS)) }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
      /* допуск 24 уровня на канал: перерисовка слоёв при скрытии холста даёт мелкий шум сглаживания,
         а нарисованное холстом отличается от фона на десятки уровней */
      const diffShare = (a, b) => { const A = a.data, B = b.data; const n = Math.min(A.length, B.length); let d = 0, t = 0; for (let i = 0; i < n; i += 16) { t++; if (Math.abs(A[i] - B[i]) > 24 || Math.abs(A[i + 1] - B[i + 1]) > 24 || Math.abs(A[i + 2] - B[i + 2]) > 24) d++; } return t ? d / t * 100 : 0; };
      for (let i = 0; i < res.canvases.length; i++) {
        const c = res.canvases[i]; let paints = null, moves = null, waited = 0;
        if (sharp && handles[i] && c.visible) {
          try {
            await handles[i].evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(150);
            const box = await handles[i].boundingBox();
            if (box && box.width >= 4 && box.height >= 4) {
              const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
              const clip = { x: x0, y: y0, width: Math.max(1, Math.min(box.width - (x0 - box.x), vp.width - x0)), height: Math.max(1, Math.min(box.height - (y0 - box.y), vp.height - y0)) };
              /* 3D часто стартует лениво (после load, в свободную минуту): даём холсту до 4 с ожить */
              const t0 = Date.now();
              for (let attempt = 0; attempt < 5; attempt++) {
                const A = await raw(await page.screenshot(), clip);
                await handles[i].evaluate((el) => { el.__rwVis = el.style.visibility; el.style.visibility = 'hidden'; }); await sleep(120);
                const H = await raw(await page.screenshot(), clip);
                const H2 = await raw(await page.screenshot(), clip);          /* уровень шума: два снимка одного состояния */
                await handles[i].evaluate((el) => { el.style.visibility = el.__rwVis || ''; }); await sleep(350);
                const C = await raw(await page.screenshot(), clip);
                const p = diffShare(A, H), m = diffShare(A, C), noise = diffShare(H, H2);
                paints = p > 0.3 && p > noise * 3; moves = m > 0.3 && m > noise * 3;
                c.paintShare = Math.round(p * 10) / 10; c.moveShare = Math.round(m * 10) / 10; c.noiseShare = Math.round(noise * 100) / 100;
                if (paints) break;
                await sleep(700); waited = Date.now() - t0;
              }
            }
          } catch { /* холст ушёл со страницы */ }
        }
        const status = !c.visible ? 'WARN' : paints === true ? 'OK' : paints === false ? (c.regions ? 'WARN' : 'FAIL') : (c.regions ? 'OK' : 'WARN');
        const buffer = c.regions != null ? `буфер: содержимое в ${c.regions} из ${c.regionsTotal} зон, ${c.filled}% пикселей` : `буфер не читается (${c.error || 'без preserveDrawingBuffer'})`;
        const why = !c.visible ? 'невидим' : paints === true ? `РИСУЕТ${waited ? ` (ожил через ${(waited / 1000).toFixed(1)} с)` : ''}: холст меняет ${c.paintShare}% своей площади, ${moves ? `кадр меняется (${c.moveShare}%)` : 'кадр статичен'} · ${buffer}` : paints === false ? `ПУСТОЙ: за ${(waited / 1000).toFixed(1)} с со спрятанным холстом картинка та же · ${buffer}` : `снимок не сделан (нет sharp или холст за экраном) · ${buffer}${c.animated ? ', кадр меняется' : ''}`;
        line(status, `холст ${c.el} ${c.w}×${c.h} (${c.ctx})`, `${why} · ${res.fps} кадров/с на странице`);
      }
      report.canvas = res;
    }

    else if (k === 'motion') {
      const list = () => page.evaluate((sigSrc) => { const sig = eval(sigSrc); return document.getAnimations().map((a) => { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; return { name: a.animationName || a.transitionProperty || a.constructor.name, target: a.effect && a.effect.target ? sig(a.effect.target) : null, duration: t.duration, iterations: t.iterations === Infinity ? 'infinite' : t.iterations, state: a.playState }; }); }, SIG);
      const before = await list();
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await sleep(400);
      const reduced = await list();
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
      const inf = before.filter((a) => a.iterations === 'infinite');
      const names = [...new Set(before.map((a) => a.name))].slice(0, 8).join(', ');
      const st = before.length && reduced.length >= before.length && inf.length ? 'WARN' : 'OK';
      line(st, `анимации: ${before.length} идут (${inf.length} бесконечных)`, `${names || 'нет'} · при «меньше движения» остаётся ${reduced.length}${st === 'WARN' ? ' — бесконечные анимации не останавливаются' : ''}`);
      report.motion = { before, reduced: reduced.length };
    }

    else if (k === 'eval') {
      const r = await page.evaluate(String(v)); line('OK', `eval ${String(v).slice(0, 60)}`, JSON.stringify(r).slice(0, 300));
    }

    else if (k === 'shot') { const f = await shot(page, String(v)); line('OK', `снимок ${v}`, f); }
    else if (k === 'fullpage') { const file = path.join(outDir, `${tag}-full.png`); const how = await fullPageShot(page, file); line('OK', 'снимок всей страницы', `${path.basename(file)}${how !== 'full' ? ` (снято как ${how}: страница выше предела Chrome)` : ''}`); }
  } catch (e) {
    line('FAIL', `${k} ${v === true ? '' : v}`, e.message.replace(/\n/g, ' ').slice(0, 160));
  }
  const newErr = errCount() - errBefore;
  if (newErr && k !== 'click') line('FAIL', `новые ошибки после шага ${k}`, [...page.log.console.filter((c) => c.type === 'error'), ...page.log.errors.map((t) => ({ text: t }))].slice(-newErr).map((c) => c.text.replace(/\n/g, ' ').slice(0, 120)).join(' | '));
}

report.console = { errors: page.log.console.filter((c) => c.type === 'error').map((c) => c.text), pageErrors: page.log.errors, warnings: page.log.console.filter((c) => c.type === 'warning').length, failedRequests: page.log.failed };
report.verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
await browser.close();
writeJson(path.join(outDir, `${tag}.json`), report);
console.log(`\n${report.verdict}: ${fails} провалов, ${warns} предупреждений · ${path.join(outDir, `${tag}.json`)}`);
if (fails && !opt['no-fail']) process.exit(1);
