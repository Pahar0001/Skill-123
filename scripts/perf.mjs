#!/usr/bin/env node
/**
 * Замер скорости в живом браузере, с бюджетами и вердиктом.
 *
 *   node perf.mjs <url> [--viewport mobile] [--out папка] [--tag имя]
 *                 [--cpu 4] [--net fast3g|slow4g|none] [--runs 3]
 *                 [--overlay [селектор]] [--rounds 5] [--overlay-only] [--strict]
 *   node perf.mjs --help   (или --h, -h)
 *
 * Флаги:
 *   --viewport  экран: пресет (desktop, laptop, tablet, mobile, mobile-s, android), запись ШxВ@плотность
 *               («320x568@2») или одна ширина; по умолчанию mobile. Один экран за запуск: список
 *               через запятую — ошибка с кодом 1 (запускать по разу на экран, итоги ложатся в разные
 *               файлы). --viewports — то же самое (синоним).
 *   --cpu N     во сколько раз замедлить процессор (по умолчанию 4 на телефоне и планшете, 1 на десктопе).
 *   --net       сеть: fast3g, slow4g или none (по умолчанию fast3g на телефоне, none на десктопе).
 *   --runs N    прогонов (1…9), каждый в свежем браузере; в таблицу — медиана и разброс.
 *   --out       папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/perf/<tag>.json.
 *   --tag       имя файла итога (по умолчанию <экран>-<сеть>-cpu<N>).
 *   --overlay   ещё и цена полноэкранного слоя фактуры (зерно, вуаль): растровые задачи (RasterTask) и
 *               Paint за 2 с покоя по трассировке Chrome — со слоем и без, раунды чередуются
 *               (со слоем → без, затем без → со слоем …). Без значения слои ищет texture.mjs
 *               (findTextureLayers: закреплённые или во весь экран); со значением — CSS-селектор слоя,
 *               можно с псевдоэлементом: --overlay "body::after". Слой прячется через opacity:0 и
 *               visibility:hidden (visibility одна не прячет вывод SVG-фильтра feTurbulence).
 *               Строгий CSP (style-src без 'unsafe-inline'): вставленный <style> страница молча не
 *               применяет, и «без слоя» мерился бы со слоем — тогда стиль ставится таблицей
 *               document.adoptedStyleSheets (CSP на неё не распространяется), в выводе об этом строка.
 *               Не вставился никак — WARN «цена слоя: не измерена — CSP страницы запрещает вставку стиля».
 *   --rounds N  раундов для --overlay, не меньше 5 (по умолчанию 5).
 *   --overlay-only  только цена слоя, без замера загрузки (быстро: сеть не замедляется).
 *   --strict    код выхода 1 при итоговом вердикте FAIL (для гейта); без флага — 0 при любом вердикте.
 *   --help, --h, -h  эта справка.
 *
 * Что измеряется: TTFB, FCP, LCP, CLS, долгие задачи, вес по типам ресурсов
 * (сжатый, как передано по сети), самые тяжёлые файлы, память JS, узлы DOM,
 * кадры в секунду при прокрутке и в покое (важно для анимаций и WebGL),
 * картинки крупнее и мельче показанного, видео (вес и постер).
 *
 * По умолчанию мобильный экран, процессор в 4 раза медленнее, сеть fast3g —
 * так смотрит на сайт покупатель с телефона, а не разработчик с ноутбука.
 * Цифры одного прогона плавают на ±20%: для решения «стало хуже или нет»
 * брать --runs 3 — каждый прогон в свежем браузере, в таблицу идёт медиана,
 * рядом разброс.
 *
 * Прокрутка. Плавная прокрутка страницы (html{scroll-behavior:smooth}) превращала scrollTo в
 * анимацию: скрипт «прокручивал 12453 px», а страница сдвигалась на 149, и кадры/с считались на
 * месте. Теперь прокрутка мгновенная (forceInstantScroll и behavior:'instant'), шагами по 1/150
 * высоты на кадр (не дольше 10 с), и записывается, докуда страница дошла на самом деле (scrollY).
 * Дошла меньше чем на 90 % — FAIL замера: кадры/с при прокрутке недействительны. Если прокручивается
 * не документ, а блок во весь экран (body{overflow:auto} у «приложений»), прокручивается он.
 *
 * Картинки мельче показанного (размытые): плотность = пикселей картинки на CSS-пиксель показа,
 * с учётом object-fit и background-size: cover — масштаб max(ширина_коробки/ширина_картинки,
 * высота_коробки/высота_картинки), contain — min, fill — худшая ось, none — 1, auto у фона — 1.
 * Размер картинки — настоящий: для srcset и <picture> браузер делит naturalWidth на плотность
 * источника, поэтому файл перезагружается через new Image(). FAIL — плотность ниже 1 (меньше
 * пикселя картинки на CSS-пиксель, размыто на любом экране), WARN — ниже min(dpr, 2) (размыто на
 * этом экране; 3× на android не требуется). Допуск 3 % на округление. Проверяются <img>, постеры
 * <video> (с object-fit ролика) и фоновые картинки без повтора или с cover (узоры и плитки с
 * повтором — нет), от 64×48 CSS-пикселей, видимые (итоговая opacity > 0.05), не SVG. Проверка
 * здесь, а не в a11y.mjs: рядом «крупнее показанного» — тот же расчёт в другую сторону
 * (плотность > 1.5 × dpr — лишний вес, справочно).
 * Перед замером плотности страница проходится ещё раз — lib.scrollThrough с паузой 350 мс и
 * ожиданием картинок в кадре (до 1,5 с на шаг): быстрый проход замера кадров/с (~2 с) ленивые не
 * успевают догрузить, и на Tilda при fast3g фоны карточек оставались заглушками …/-/resizeb/20x/.
 * LCP, CLS, память и вес по сети снимаются до этого прохода (как раньше); догруженное им — отдельной
 * строкой. Что так и осталось заглушкой (≤ 64 px по стороне в коробке от 200 px и адрес заглушки,
 * data-original/data-src/… с ещё не подставленным адресом или класс lazy; без признаков — ≤ 32 px),
 * не мерится: WARN «заглушка ленивой загрузки не догрузилась — не измерено», а не FAIL «размыто».
 * В выводе у адреса — хост и хвост пути (thb.tildacdn.com/…/-/resizeb/20x/1.jpg), полный — в JSON (url).
 *
 * Видео: вес каждого ролика — полный размер файла (Content-Range или Content-Length ответа, иначе
 * запрос HEAD), не то, что успело скачаться. Бюджет роликов первого экрана: телефон и планшет
 * 1 МБ, десктоп 2.5 МБ (хорошо) / вдвое больше (терпимо), выше — FAIL. Ролик без poster — WARN:
 * до загрузки на его месте пусто (на телефоне — долго). blob: (потоковое видео) — размер не
 * определить, WARN.
 *
 * Цена слоя (--overlay): бюджет в числе растровых задач, а не в процентах процессора (разброс
 * процессора между раундами больше разницы между вариантами). Неподвижный слой в покое не
 * перерисовывается вовсе; прибавка больше 2 растровых задач или 2 Paint за 2 с покоя, если все
 * раунды со слоем выше всех раундов без слоя, — WARN «слой перерисовывается в покое» (кипение
 * GIF или background-position; сдвиг transform по steps() не перерисовывает — предпочитать его
 * именно за это, а не за «дешевле по процессору»). Под headless кадры/с упираются в потолок —
 * рывки там не видны, поэтому кадры/с слоя не мерятся.
 *
 * Бюджеты (хорошо / терпимо): LCP 2.5 с / 4 с · CLS 0.1 / 0.25 · JS 300 / 600 КБ ·
 * картинки 1000 / 2500 КБ · всего 2000 / 5000 КБ · долгие задачи 300 / 800 мс ·
 * прокрутка 55 / 40 кадров/с · видео первого экрана 1 / 2 МБ (телефон), 2.5 / 5 МБ (десктоп).
 * КБ и МБ — по 1024.
 *
 * Код выхода: 0 — замер сделан (вердикт в выводе и в JSON), 1 — неверные аргументы, ни один
 * прогон не удался или, с --strict, итоговый вердикт FAIL (WARN — всё равно 0). Аргументы (адрес,
 * экран, значения флагов) проверяются до создания папок и запуска браузера.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  launch, preparePage, openPage, gotoRetry, resolveViewport, VIEWPORTS, parseArgs, runDir, writeJson, sleep, ensureDir,
  forceInstantScroll, scrollThrough, scrollToY, settleAnimations, waitForMedia, evaluateWith, EFFECTIVE_OPACITY_FN, SIG_FN,
} from './lib.mjs';
import { findTextureLayers, hideTextureLayers, showTextureLayers, setPageStyle, dropPageStyle, CSP_NO_STYLE } from './texture.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h', 'overlay-only', 'strict'], values: ['viewport', 'viewports', 'cpu', 'net', 'runs', 'rounds', 'out', 'tag'], optional: ['overlay'] });
/* короткий -h — как --help: и на месте адреса, и на месте значения флага; до любых папок и браузера */
if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h')) { console.log(HELP); process.exit(0); }
const die = (msg) => { console.error(msg); process.exit(1); };
for (const k of ['viewport', 'viewports', 'cpu', 'net', 'runs', 'rounds', 'out', 'tag']) if (opt[k] === true) die(`--${k}: нужно значение (подробно: --help)`);
/* «--overlay http://…» без селектора: адрес ушёл в значение флага */
if (typeof opt.overlay === 'string' && /^(https?|file):/i.test(opt.overlay) && !pos[0]) { pos.unshift(opt.overlay); opt.overlay = true; }
if (opt['overlay-only'] && !opt.overlay) opt.overlay = true;
if (!pos[0]) die('Нужен адрес: node perf.mjs <url> [--viewport mobile] [--cpu 4] [--net fast3g|slow4g|none] [--runs 3] [--overlay]  (подробно: --help)');
const url = pos[0];
{
  let ok = false; try { ok = /^(https?|file|data|about):$/i.test(new URL(url).protocol); } catch { /* не адрес */ }
  if (!ok) die(`Неверный адрес «${url}»: нужен полный адрес — http://…, https://… или file:///…  (подробно: --help)`);
}
/* --viewport и --viewports — один флаг; экран один за запуск */
function oneViewport(dflt) {
  const a = opt.viewport, b = opt.viewports;
  if (a !== undefined && b !== undefined && String(a).trim() !== String(b).trim()) die(`Заданы и --viewport ${a}, и --viewports ${b} — это один флаг, оставьте один`);
  const raw = a ?? b; const list = String(raw ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!list.length) list.push(dflt);
  if (list.length > 1) die(`perf меряет один экран за запуск, а задано ${list.length}: ${list.join(', ')}. Запустите по разу на экран: ${list.map((v) => `--viewport ${v}`).join(', затем ')} — итоги лягут в разные файлы (<out>/perf/<экран>-<сеть>-cpu<N>.json)`);
  const r = resolveViewport(list[0]);
  if (!r) die(`Неизвестный экран «${list[0]}». Есть: ${Object.keys(VIEWPORTS).join(', ')} или запись ШxВ@плотность, например 320x568@2`);
  return r;
}
const [vpName, vp] = oneViewport('mobile');
if (opt.cpu !== undefined && !(Number(opt.cpu) >= 1)) die(`--cpu ${opt.cpu}: нужно число от 1 (во сколько раз замедлить процессор)`);
const cpu = opt.cpu === undefined ? (vp.isMobile ? 4 : 1) : Number(opt.cpu);
const netName = opt.net || (vp.isMobile ? 'fast3g' : 'none');
const NET = { none: null, fast3g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }, slow4g: { latency: 100, downloadThroughput: 4e6 / 8, uploadThroughput: 3e6 / 8 } };
if (!Object.prototype.hasOwnProperty.call(NET, netName)) die('Сеть: none, fast3g или slow4g');
const runs = Math.max(1, Math.min(9, Number(opt.runs) || 1));
const rounds = Math.max(5, Math.min(20, Number(opt.rounds) || 5));
if (opt.rounds !== undefined && Number(opt.rounds) < 5) console.log(`--rounds ${opt.rounds}: меньше 5 раундов разброс не виден — беру 5`);
const run = runDir(opt, url); const outDir = ensureDir(path.join(run, 'perf'));
const tag = opt.tag || `${vpName}-${netName}-cpu${cpu}`;
const MB = 1024 * 1024;
const videoBudget = vp.isMobile ? 1 * MB : 2.5 * MB;

/* ---------- функции страницы ---------- */

/* прокрутка по кадрам: мгновенно, 1/150 высоты на кадр, настоящий scrollY; не дольше 10 с */
function scrollInPage() {
  return new Promise((resolve) => {
    const se = document.scrollingElement || document.documentElement;
    let sc = null; let total = Math.max(0, se.scrollHeight - innerHeight);
    if (total < 2 && document.body) {
      for (const el of document.body.querySelectorAll('*')) {
        if (el.scrollHeight <= el.clientHeight + 50 || el.clientHeight < innerHeight * 0.5 || el.clientWidth < innerWidth * 0.5) continue;
        if (!/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
        if (!sc || el.scrollHeight > sc.scrollHeight) sc = el;
      }
      if (sc) total = sc.scrollHeight - sc.clientHeight;
    }
    const go = (y) => (sc ? sc.scrollTo({ top: y, behavior: 'instant' }) : scrollTo({ top: y, behavior: 'instant' }));
    const cur = () => (sc ? sc.scrollTop : scrollY);
    let y = 0, n = 0, maxReal = 0; const s = performance.now(); const step = Math.max(8, total / 150);
    const done = () => { maxReal = Math.max(maxReal, cur()); resolve({ frames: n, ms: Math.round(performance.now() - s), planned: Math.round(total), reached: Math.round(maxReal), endY: Math.round(cur()), scroller: sc ? sc.tagName.toLowerCase() + (sc.id ? '#' + sc.id : '') : 'document', share: total > 0 ? Math.round(Math.min(1, maxReal / total) * 1000) / 1000 : null }); };
    if (total < 2) { resolve({ frames: 0, ms: 0, planned: 0, reached: 0, endY: 0, scroller: 'document', share: null }); return; }
    /* положение читается в начале следующего кадра: к этому времени обработчики прокрутки сайта
       (заставка, «держатель») уже вернули страницу, и в счёт идёт то, где она осталась */
    const f = () => { if (n) maxReal = Math.max(maxReal, cur()); y += step; go(Math.min(y, total)); n++; if (y < total && performance.now() - s < 10000) requestAnimationFrame(f); else setTimeout(done, 60); };
    requestAnimationFrame(f);
  });
}

/* картинки: плотность показа с учётом object-fit / background-size; видео первого экрана.
   Свободные переменные eff и sig — из lib.mjs (evaluateWith). */
async function mediaInPage() {
  const dpr = devicePixelRatio; const need = Math.min(dpr, 2); const TOL = 0.97;
  /* адрес для вывода: чужой хост и хвост пути — по «1.jpg» не видно, что это заглушка …/-/resizeb/20x/1.jpg */
  const short = (u) => { if (!u) return ''; if (/^data:/i.test(u)) return u.slice(0, 30) + '…'; try { const p = new URL(u, location.href); const segs = p.pathname.split('/').filter(Boolean); const tail = segs.slice(-4).join('/'); return ((p.host !== location.host ? p.host : '') + (segs.length > 4 ? '/…/' : '/') + tail).slice(-100); } catch (e) { return String(u).slice(0, 100); } };
  /* заглушка ленивой загрузки: крошечная картинка (≤ 64 px по стороне) в коробке от 200 px и признак
     ленивой загрузки — адрес заглушки (Tilda …/-/resize/20x/, …/-/empty/, lqip, placeholder, blank)
     или атрибут с настоящим адресом (data-original, data-src, data-bg…), который ещё не подставлен,
     или класс lazy без loaded; без признаков — если картинка не больше 32 px (растянута в 6+ раз) */
  const PH_URL = /\/-\/(resizeb?\/\d{1,2}x\d{0,2}|empty)\/|(lqip|placeholder|blank|spacer|lazy[-_]?load)[^/]*\.(gif|png|jpe?g|webp)(\?|#|$)/i;
  const LAZY_ATTRS = ['data-original', 'data-src', 'data-lazy', 'data-lazy-src', 'data-bg', 'data-background', 'data-background-image', 'data-srcset', 'data-lazy-srcset', 'data-bgset'];
  const abs = (u) => { try { return new URL(String(u).trim().split(/[\s,]+/)[0], location.href).href; } catch (e) { return String(u); } };
  const lazyEvidence = (el, cur) => {
    const curAbs = cur ? abs(cur) : '';
    for (const host of [el, el.parentElement && el.parentElement.tagName === 'PICTURE' ? el.parentElement : null]) {
      if (!host) continue;
      for (const a of LAZY_ATTRS) { const v = host.getAttribute(a); if (v && v.trim() && !/^data:/i.test(v.trim()) && abs(v) !== curAbs) return a; }
    }
    const cls = typeof el.className === 'string' ? el.className : '';
    if (/(^|[\s_-])lazy/i.test(cls) && !/lazy-?loaded/i.test(cls)) return `класс ${cls.split(/\s+/).find((c) => /lazy/i.test(c))}`;
    return null;
  };
  const placeholderOf = (el, src, nw, nh, bw, bh) => {
    const tiny = (nw <= 64 && bw >= 200) || (nh <= 64 && bh >= 200); if (!tiny) return null;
    if (PH_URL.test(src || '')) return 'адрес заглушки';
    const ev = lazyEvidence(el, src); if (ev) return `ленивая загрузка: ${ev}`;
    if ((nw <= 32 && bw >= 200) || (nh <= 32 && bh >= 200)) return 'крошечная картинка, растянутая в 6+ раз';
    return null;
  };
  const isSvg = (u) => /^data:image\/svg|\.svg(\?|#|$)/i.test(u || '');
  const px = (v) => parseFloat(v) || 0;
  const splitTop = (str) => { const out = []; let depth = 0, cur = ''; for (const ch of String(str || '')) { if (ch === '(') depth++; else if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; } cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const urlsOf = (layer) => [...String(layer).matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map((m) => m[2]).filter(Boolean);
  const cache = new Map();
  const realSize = (src) => { if (!cache.has(src)) cache.set(src, new Promise((res) => { const im = new Image(); const t = setTimeout(() => res(null), 6000); im.onload = () => { clearTimeout(t); res(im.naturalWidth ? { w: im.naturalWidth, h: im.naturalHeight } : null); }; im.onerror = () => { clearTimeout(t); res(null); }; im.src = src; })); return cache.get(src); };
  const densityOf = (fit, bw, bh, nw, nh) => {
    const sx = bw / nw, sy = bh / nh; let s;
    if (fit === 'contain') s = Math.min(sx, sy); else if (fit === 'none') s = 1; else if (fit === 'scale-down') s = Math.min(1, Math.min(sx, sy)); else s = Math.max(sx, sy); /* cover и fill (худшая ось) */
    return s > 0 ? 1 / s : null;
  };
  const items = []; let notLoaded = 0, checked = 0;
  const imgs = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.width >= 64 && r.height >= 48 && eff(i) > 0.05; });
  /* подождать то, что ещё грузится (сеть замедлена), но не дольше 5 с на всё */
  await Promise.race([Promise.all(imgs.filter((i) => !i.complete).map((i) => i.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 5000))]);
  for (const img of imgs) {
    const src = img.currentSrc || img.src; if (!src || isSvg(src)) continue;
    if (!img.naturalWidth) { notLoaded++; continue; }
    const r = img.getBoundingClientRect(); const s = getComputedStyle(img);
    const kx = img.offsetWidth ? r.width / img.offsetWidth : 1, ky = img.offsetHeight ? r.height / img.offsetHeight : 1;
    const bw = (img.clientWidth - px(s.paddingLeft) - px(s.paddingRight)) * kx, bh = (img.clientHeight - px(s.paddingTop) - px(s.paddingBottom)) * ky;
    if (bw < 8 || bh < 8) continue;
    let nw = img.naturalWidth, nh = img.naturalHeight, how = 'natural';
    if (img.srcset || img.getAttribute('sizes') || (img.parentElement && img.parentElement.tagName === 'PICTURE')) { const z = await realSize(src); if (z) { nw = z.w; nh = z.h; how = 'файл'; } }
    const d = densityOf(s.objectFit, bw, bh, nw, nh); if (d == null) continue;
    const ph = placeholderOf(img, src, nw, nh, bw, bh);
    if (!ph) checked++;
    items.push({ kind: 'img', el: sig(img), src: short(src), url: src.slice(0, 300), natural: `${nw}×${nh}`, box: `${Math.round(bw)}×${Math.round(bh)}`, fit: s.objectFit, density: Math.round(d * 100) / 100, sizeFrom: how, placeholder: ph });
  }
  for (const v of document.querySelectorAll('video[poster]')) {
    const r = v.getBoundingClientRect(); if (r.width < 64 || r.height < 48 || eff(v) <= 0.05) continue;
    const src = v.poster; if (!src || isSvg(src)) continue;
    const z = await realSize(src); if (!z) { notLoaded++; continue; }
    const s = getComputedStyle(v); const d = densityOf(s.objectFit === 'fill' ? 'contain' : s.objectFit, r.width, r.height, z.w, z.h); if (d == null) continue;
    checked++;
    items.push({ kind: 'poster', el: sig(v), src: short(src), url: src.slice(0, 300), natural: `${z.w}×${z.h}`, box: `${Math.round(r.width)}×${Math.round(r.height)}`, fit: s.objectFit, density: Math.round(d * 100) / 100, sizeFrom: 'файл', placeholder: null });
  }
  const bgEls = document.body ? [...document.body.querySelectorAll('*')] : [];
  for (const el of bgEls) {
    for (const pseudo of [null, '::before', '::after']) {
      const s = getComputedStyle(el, pseudo);
      if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
      const bi = s.backgroundImage; if (!bi || bi === 'none' || !/url\(/.test(bi)) continue;
      const r = el.getBoundingClientRect();
      let bw, bh;
      if (pseudo) { bw = px(s.width); bh = px(s.height); if (!bw || !bh) continue; } else { const kx = el.offsetWidth ? r.width / el.offsetWidth : 1, ky = el.offsetHeight ? r.height / el.offsetHeight : 1; bw = el.clientWidth * kx; bh = el.clientHeight * ky; }
      if (bw < 64 || bh < 48 || eff(el) <= 0.05 || (pseudo && parseFloat(s.opacity) <= 0.05)) continue;
      const layers = splitTop(bi), sizes = splitTop(s.backgroundSize), reps = splitTop(s.backgroundRepeat), atts = splitTop(s.backgroundAttachment);
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i]; const us = urlsOf(layer).filter((u) => !isSvg(u)); if (!us.length) continue;
        const size = (sizes[i % sizes.length] || 'auto').trim(); const rep = (reps[i % reps.length] || 'repeat').trim();
        const photo = /cover/.test(size) || /^no-repeat( no-repeat)?$/.test(rep); if (!photo) continue; /* узор с повтором — не фото */
        if (/image-set\(/.test(layer) && /^auto( auto)?$/.test(size)) continue; /* размер зависит от плотности источника — не определить */
        let z = null, zsrc = us[0]; for (const u of us) { const q = await realSize(u); if (q && (!z || q.w > z.w)) { z = q; zsrc = u; } }
        if (!z) { notLoaded++; continue; }
        let W = bw, H = bh; if ((atts[i % atts.length] || '').trim() === 'fixed') { W = innerWidth; H = innerHeight; }
        let d;
        if (size === 'cover') d = densityOf('cover', W, H, z.w, z.h);
        else if (size === 'contain') d = densityOf('contain', W, H, z.w, z.h);
        else {
          const [a, b = 'auto'] = size.split(/\s+/);
          const len = (v, base) => (v === 'auto' ? null : /%$/.test(v) ? base * parseFloat(v) / 100 : px(v));
          const pw = len(a, W), ph = len(b, H);
          if (pw && ph) d = Math.min(z.w / pw, z.h / ph); else if (pw) d = z.w / pw; else if (ph) d = z.h / ph; else d = 1;
        }
        if (!(d > 0)) continue;
        const ph = placeholderOf(el, zsrc, z.w, z.h, W, H);
        if (!ph) checked++;
        items.push({ kind: 'фон', el: sig(el) + (pseudo || ''), src: short(zsrc), url: String(zsrc).slice(0, 300), natural: `${z.w}×${z.h}`, box: `${Math.round(W)}×${Math.round(H)}`, fit: `background-size:${size}`, density: Math.round(d * 100) / 100, sizeFrom: 'файл', placeholder: ph });
      }
    }
  }
  /* LAZY — заглушка ленивой загрузки не догрузилась: плотность не мерится (иначе ложный FAIL «размыто») */
  for (const it of items) it.status = it.placeholder ? 'LAZY' : it.density < TOL ? 'FAIL' : it.density < need * TOL ? 'WARN' : it.density > Math.max(dpr, 1) * 1.5 ? 'BIG' : 'OK';
  const videos = [...document.querySelectorAll('video')].filter((v) => { const r = v.getBoundingClientRect(); return r.width >= 24 && r.height >= 24 && eff(v) > 0.05; }).map((v) => {
    const r = v.getBoundingClientRect(); const srcEl = v.querySelector('source[src]');
    return { el: sig(v), src: v.currentSrc || v.src || (srcEl ? srcEl.src : ''), poster: v.getAttribute('poster') || '', autoplay: v.autoplay, muted: v.muted, loop: v.loop, preload: v.preload, first: r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0, w: Math.round(r.width), h: Math.round(r.height), videoSize: v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : null };
  });
  return { dpr, need, checked, notLoaded, items, videos, scrollY: Math.round(scrollY) };
}

/* ---------- один прогон в свежем браузере ---------- */
async function measure() {
  const browser = await launch();
  try {
    const page = await preparePage(browser, vp, { trackBytes: false });
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    if (NET[netName]) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NET[netName] });
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await cdp.send('Performance.enable');
    const req = new Map(); const res = [];
    const hdr = (h, name) => { for (const k of Object.keys(h || {})) if (k.toLowerCase() === name) return h[k]; return null; };
    cdp.on('Network.responseReceived', (e) => {
      const h = e.response.headers; const cr = hdr(h, 'content-range'); const cl = hdr(h, 'content-length');
      const total = cr && /\/(\d+)\s*$/.test(cr) ? Number(/\/(\d+)\s*$/.exec(cr)[1]) : e.response.status === 200 && cl ? Number(cl) : null;
      req.set(e.requestId, { url: e.response.url, type: e.type, mime: e.response.mimeType, fromCache: !!e.response.fromDiskCache, status: e.response.status, total });
    });
    cdp.on('Network.loadingFinished', (e) => { const r = req.get(e.requestId); if (r) res.push({ ...r, bytes: e.encodedDataLength }); });

    await page.evaluateOnNewDocument(() => {
      window.__rw = { lcp: 0, cls: 0, longTasks: 0, longTotal: 0 };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__rw.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* нет */ }
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__rw.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* нет */ }
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__rw.longTasks++; window.__rw.longTotal += e.duration; } }).observe({ type: 'longtask', buffered: true }); } catch { /* нет */ }
    });

    const t0 = Date.now();
    await gotoRetry(page, url, { timeout: 90000 });
    const loadMs = Date.now() - t0;
    await forceInstantScroll(page);
    await sleep(1500);
    const idleFps = await page.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
    /* прокрутка: кадры во время настоящей прокрутки, попутно CLS и ленивые картинки */
    const scroll = await page.evaluate(scrollInPage);
    await sleep(800);
    await page.evaluate(() => { const se = document.scrollingElement || document.documentElement; scrollTo({ top: 0, behavior: 'instant' }); se.scrollTop = 0; }); await sleep(500);
    /* показатели загрузки и памяти — сразу после замера прокрутки, до прохода за ленивым (он догружает
       картинки и сдвигал бы CLS и вес по сети относительно прежних замеров) */
    const m = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0] || {}; const p = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]));
      return { ttfb: Math.round(n.responseStart || 0), domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0), fcp: p['first-contentful-paint'] || null, lcp: window.__rw.lcp || null, cls: Math.round(window.__rw.cls * 1000) / 1000, longTasks: window.__rw.longTasks, longTotal: Math.round(window.__rw.longTotal), nodes: document.getElementsByTagName('*').length, images: [...document.images].filter((i) => i.naturalWidth > 0).length, fonts: [...document.fonts].filter((f) => f.status === 'loaded').length, canvases: document.querySelectorAll('canvas').length, animations: document.getAnimations().length };
    });
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const resAtMetrics = res.length;
    /* плотность картинок: сначала проход с паузами и ожиданием картинок в кадре — быстрый проход замера
       кадров/с (~2 с) ленивые не успевают догрузить, и фоны оставались заглушками …/-/resizeb/20x/ */
    const t1 = Date.now();
    const lazyPass = await scrollThrough(page, { pause: 350, onStep: () => waitForMedia(page, { timeout: 1500 }) }).catch((e) => ({ error: String(e.message || e).slice(0, 120) }));
    await scrollToY(page, 0).catch(() => {}); await waitForMedia(page, { timeout: 3000 });
    const lazyMs = Date.now() - t1;
    const media = await evaluateWith(page, mediaInPage, null, { eff: EFFECTIVE_OPACITY_FN, sig: SIG_FN }).catch((e) => ({ error: String(e.message || e).slice(0, 200), items: [], videos: [], checked: 0, notLoaded: 0 }));
    media.lazyPass = { ms: lazyMs, steps: lazyPass.screens ?? null, error: lazyPass.error || null };
    /* вес по сети — как раньше, до прохода за ленивым; догруженное проходом — отдельно */
    return { loadMs, m, res: res.slice(0, resAtMetrics), resLazy: res.slice(resAtMetrics), idleFps, scroll, media, fpsScroll: scroll.ms ? Math.round(scroll.frames / scroll.ms * 1000) : null, heapMb: Math.round((metrics.JSHeapUsedSize || 0) / 1048576), scriptMs: Math.round((metrics.ScriptDuration || 0) * 1000), layoutCount: metrics.LayoutCount, styleRecalcs: metrics.RecalcStyleCount };
  } finally { await browser.close(); }
}

/* ---------- цена слоя фактуры: трассировка покоя со слоем и без ---------- */
const TRACE_CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'disabled-by-default-devtools.timeline.frame'];
async function traceIdle(page, ms = 2000) {
  await page.tracing.start({ categories: TRACE_CATS });
  await sleep(ms);
  const buf = await page.tracing.stop();
  const ev = JSON.parse(Buffer.from(buf).toString('utf8')); const events = ev.traceEvents || ev;
  const of = (name) => events.filter((e) => e.name === name && (e.ph === 'X' || e.ph === 'B'));
  const raster = of('RasterTask'), paint = of('Paint');
  const dur = (list) => Math.round(list.reduce((a, e) => a + (e.dur || 0), 0) / 100) / 10;
  return { raster: raster.length, paint: paint.length, rasterMs: dur(raster), paintMs: dur(paint) };
}
async function overlayCost() {
  const browser = await launch();
  try {
    const page = await openPage(browser, url, vp, { settle: 3000 });
    const cdp = await page.createCDPSession();
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await forceInstantScroll(page);
    await scrollThrough(page, { pause: 200 });
    await scrollToY(page, 0); await settleAnimations(page, 3000); await sleep(500);
    let layers = []; let hide, show;
    const hideInfo = { via: null }; /* как прятался слой: 'style' или 'adopted' (строгий CSP) */
    if (typeof opt.overlay === 'string') {
      const sel = opt.overlay; const host = sel.replace(/::?(before|after)\s*$/i, '').trim() || '*';
      const found = await page.evaluate((h) => { try { return document.querySelectorAll(h).length; } catch (e) { return -1; } }, host);
      if (found < 0) return { error: `неверный селектор «${sel}»` };
      if (!found) return { found: false, note: `селектор «${sel}» ничего не нашёл` };
      layers = [{ el: sel, how: 'селектор' }];
      /* строгий CSP молча не применял <style>: «без слоя» мерился со слоем. setPageStyle тогда ставит
         таблицу adoptedStyleSheets; не вставилось никак — ошибка, цена слоя «не измерена» (WARN) */
      const css = `${sel}{visibility:hidden!important;opacity:0!important}`;
      hide = async () => { hideInfo.via = await setPageStyle(page, 'overlay-hide', css); if (!hideInfo.via) throw new Error(`${CSP_NO_STYLE} — слой не спрятать`); };
      show = () => dropPageStyle(page, 'overlay-hide');
    } else {
      const f = await findTextureLayers(page, { mark: true });
      const big = f.layers.filter((L) => L.coversViewport || ((L.position === 'fixed' || L.fixedBy) && L.rect.w >= f.vw * 0.6 && L.rect.h >= f.vh * 0.4));
      if (!big.length) return { found: false, note: `полноэкранных слоёв фактуры не найдено (всего слоёв ${f.layers.length})` };
      layers = big.map((L) => ({ el: L.el + (L.pseudo || ''), blend: L.mixBlendMode, opacity: L.effectiveOpacity, animation: L.animation || (L.animChain && L.animChain.length ? L.animChain.join('; ') : null), how: 'texture.mjs' }));
      hide = () => hideTextureLayers(page, big, hideInfo); show = () => showTextureLayers(page);
    }
    const out = { found: true, layers, rounds, order: [], with: [], without: [] };
    for (let r = 0; r < rounds; r++) {
      const order = r % 2 === 0 ? ['with', 'without'] : ['without', 'with'];
      for (const v of order) {
        if (v === 'with') await show(); else await hide();
        await sleep(1000); /* перерисовка от самого переключения — не в счёт */
        const t = await traceIdle(page, 2000);
        out[v].push(t); out.order.push(v);
        process.stdout.write(`  раунд ${r + 1} ${v === 'with' ? 'со слоем' : 'без слоя'}: RasterTask ${t.raster}, Paint ${t.paint}\n`);
      }
    }
    await show();
    out.hideVia = hideInfo.via;
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    const stat = (list, k) => { const a = list.map((x) => x[k]); return { median: med(a), min: Math.min(...a), max: Math.max(...a), all: a }; };
    out.stats = {};
    for (const v of ['with', 'without']) out.stats[v] = { raster: stat(out[v], 'raster'), paint: stat(out[v], 'paint'), rasterMs: stat(out[v], 'rasterMs') };
    const W = out.stats.with, N = out.stats.without;
    out.extraRaster = W.raster.median - N.raster.median; out.extraPaint = W.paint.median - N.paint.median;
    out.separated = { raster: W.raster.min > N.raster.max, paint: W.paint.min > N.paint.max };
    out.status = (out.extraRaster > 2 && out.separated.raster) || (out.extraPaint > 2 && out.separated.paint) ? 'WARN' : 'OK';
    return out;
  } finally { await browser.close(); }
}

/* ---------- прогоны ---------- */
const samples = [];
if (!opt['overlay-only']) {
  for (let i = 0; i < runs; i++) {
    if (runs > 1) process.stdout.write(`· прогон ${i + 1}/${runs} … `);
    try { const s = await measure(); samples.push(s); if (runs > 1) console.log(`LCP ${s.m.lcp} мс · FCP ${s.m.fcp} мс · CLS ${s.m.cls} · долгие ${s.m.longTotal} мс · прокрутка до ${s.scroll.share == null ? '—' : Math.round(s.scroll.share * 100) + '%'}`); }
    catch (e) { console.log(`сбой: ${e.message}`); }
  }
  if (!samples.length) { console.error('FAIL: ни один прогон не удался'); process.exit(1); }
}
let overlay = null;
if (opt.overlay) {
  console.log(`Цена слоя фактуры: ${rounds} раундов по 2 с покоя со слоем и без${cpu > 1 ? `, процессор ×${cpu}` : ''} …`);
  try { overlay = await overlayCost(); } catch (e) { overlay = { error: e.message }; }
}

/* ---------- видео: полный размер файла ---------- */
async function headSize(u) {
  try {
    const r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    const cl = Number(r.headers.get('content-length') || 0); if (r.ok && cl) return cl;
  } catch { /* нет HEAD */ }
  try {
    const r = await fetch(u, { headers: { Range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    const cr = r.headers.get('content-range'); await r.body?.cancel().catch(() => {});
    if (cr && /\/(\d+)\s*$/.test(cr)) return Number(/\/(\d+)\s*$/.exec(cr)[1]);
  } catch { /* нет */ }
  return null;
}

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const mbs = (b) => (b == null ? '?' : `${r2(b / MB)} МБ`);
const lines = [];
const table = {};
let worst = 'OK';
const bump = (st) => { if (st === 'FAIL') worst = 'FAIL'; else if (st === 'WARN' && worst !== 'FAIL') worst = 'WARN'; };
let report = { url, viewport: vpName, cpu, net: netName, takenAt: new Date().toISOString() };

if (samples.length) {
  /* медиана по каждому числу; сеть и списки — из прогона с медианным LCP */
  const med = (arr) => { const a = arr.filter((v) => v != null && !Number.isNaN(v)).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
  const pick = (f) => med(samples.map(f));
  const spread = (f, unit = '') => { const a = samples.map(f).filter((v) => v != null); return runs > 1 && a.length ? `${Math.min(...a)}–${Math.max(...a)}${unit}` : ''; };
  const medLcp = pick((s) => s.m.lcp);
  const ref = samples.find((s) => s.m.lcp === medLcp) || samples[0];
  const m = { ...ref.m, ttfb: pick((s) => s.m.ttfb), fcp: pick((s) => s.m.fcp), lcp: medLcp, cls: pick((s) => s.m.cls), longTotal: pick((s) => s.m.longTotal), longTasks: pick((s) => s.m.longTasks), nodes: pick((s) => s.m.nodes) };
  const idleFps = pick((s) => s.idleFps), fpsScroll = pick((s) => s.fpsScroll), heapMb = pick((s) => s.heapMb), loadMs = pick((s) => s.loadMs);
  const res = ref.res;

  /* вес по типам — сжатый, как передано по сети */
  const by = {};
  const kind = (r) => { const t = (r.type || '').toLowerCase(); const mm = r.mime || ''; if (t === 'document') return 'html'; if (t === 'script' || /javascript/.test(mm)) return 'js'; if (t === 'stylesheet' || /css/.test(mm)) return 'css'; if (t === 'image' || /^image\//.test(mm)) return 'images'; if (t === 'font' || /font/.test(mm)) return 'fonts'; if (t === 'media' || /^(video|audio)\//.test(mm)) return 'media'; if (t === 'xhr' || t === 'fetch') return 'api'; return 'other'; };
  for (const r of res) { const k = kind(r); by[k] = by[k] || { count: 0, kb: 0 }; by[k].count++; by[k].kb += r.bytes / 1024; }
  for (const k in by) by[k].kb = Math.round(by[k].kb);
  const totalKb = Math.round(res.reduce((a, r) => a + r.bytes, 0) / 1024);
  const largest = [...res].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((r) => ({ file: r.url.split('/').pop().split('?')[0].slice(0, 50) || r.url.slice(0, 50), kind: kind(r), kb: Math.round(r.bytes / 1024) }));
  const thirdParty = Math.round(res.filter((r) => { try { return new URL(r.url).hostname !== new URL(url).hostname; } catch { return false; } }).reduce((a, r) => a + r.bytes, 0) / 1024);

  /* прокрутка: дошли ли на самом деле */
  const shares = samples.map((s) => s.scroll.share).filter((v) => v != null);
  const minShare = shares.length ? Math.min(...shares) : null;
  const scrollValid = minShare == null || minShare >= 0.9;

  /* картинки и видео — из прогона с медианным LCP */
  const media = ref.media || { items: [], videos: [], checked: 0, notLoaded: 0 };
  const small = media.items.filter((i) => i.status === 'FAIL' || i.status === 'WARN').sort((a, b) => a.density - b.density);
  const big = media.items.filter((i) => i.status === 'BIG').sort((a, b) => b.density - a.density);
  const lazy = media.items.filter((i) => i.status === 'LAZY');
  const smallStatus = small.some((i) => i.status === 'FAIL') ? 'FAIL' : small.length ? 'WARN' : 'OK';
  const resLazy = ref.resLazy || [];
  for (const v of media.videos) {
    if (!v.src) { v.bytes = null; v.sizeFrom = 'нет источника'; continue; }
    if (/^blob:/i.test(v.src)) { v.bytes = null; v.sizeFrom = 'поток (blob:)'; continue; }
    const hit = samples.flatMap((s) => s.res.concat(s.resLazy || [])).find((r) => r.url === v.src && r.total);
    if (hit) { v.bytes = hit.total; v.sizeFrom = 'ответ сервера'; } else { v.bytes = await headSize(v.src); v.sizeFrom = v.bytes ? 'HEAD' : 'не определён'; }
  }
  const firstVideos = media.videos.filter((v) => v.first);
  const firstBytes = firstVideos.reduce((a, v) => a + (v.bytes || 0), 0);
  const firstUnknown = firstVideos.filter((v) => v.bytes == null);
  const noPoster = media.videos.filter((v) => !v.poster);

  /* бюджеты */
  const B = (v, good, ok, unit, lowerBetter = true, sp = '') => { const s = v == null ? 'n/a' : lowerBetter ? (v <= good ? 'OK' : v <= ok ? 'WARN' : 'FAIL') : (v >= good ? 'OK' : v >= ok ? 'WARN' : 'FAIL'); return { value: v, unit, status: s, budget: `${good}${unit} / ${ok}${unit}`, spread: sp }; };
  const scrollRow = B(fpsScroll, 55, 40, '', false, spread((s) => s.fpsScroll));
  if (!scrollValid) { scrollRow.status = 'FAIL'; scrollRow.note = `замер недействителен: страница дошла до ${Math.round(minShare * 100)}% высоты`; }
  const checks = {
    'LCP (самый крупный элемент)': B(m.lcp, 2500, 4000, ' мс', true, spread((s) => s.m.lcp, ' мс')),
    'FCP (первая отрисовка)': B(m.fcp, 1800, 3000, ' мс', true, spread((s) => s.m.fcp, ' мс')),
    'TTFB (ответ сервера)': B(m.ttfb, 800, 1800, ' мс', true, spread((s) => s.m.ttfb, ' мс')),
    'CLS (сдвиги вёрстки)': B(m.cls, 0.1, 0.25, '', true, spread((s) => s.m.cls)),
    'Долгие задачи, всего': B(m.longTotal, 300, 800, ' мс', true, spread((s) => s.m.longTotal, ' мс')),
    'JS по сети': B(by.js ? by.js.kb : 0, 300, 600, ' КБ'),
    'Картинки по сети': B(by.images ? by.images.kb : 0, 1000, 2500, ' КБ'),
    'Шрифты по сети': B(by.fonts ? by.fonts.kb : 0, 150, 400, ' КБ'),
    'Всего по сети': B(totalKb, 2000, 5000, ' КБ'),
    'Кадров/с при прокрутке': scrollRow,
    'Кадров/с в покое': B(idleFps, 55, 40, '', false, spread((s) => s.idleFps)),
    'Узлов DOM': B(m.nodes, 1500, 3000, ''),
    'Память JS': B(heapMb, 30, 80, ' МБ', true, spread((s) => s.heapMb, ' МБ')),
    'Картинки мельче показанного': { value: small.length, unit: '', status: smallStatus, budget: `плотность ≥ ${media.need || 2} / ≥ 1`, spread: '' },
  };
  if (lazy.length) checks['Заглушки ленивой загрузки (не измерены)'] = { value: lazy.length, unit: '', status: 'WARN', budget: '0', spread: '', note: 'полная картинка не догрузилась к замеру — плотность не мерилась' };
  if (media.videos.length) {
    const st = firstUnknown.length ? 'WARN' : firstBytes <= videoBudget ? 'OK' : firstBytes <= videoBudget * 2 ? 'WARN' : 'FAIL';
    checks['Видео первого экрана'] = { value: r2(firstBytes / MB), unit: ' МБ', status: firstVideos.length ? st : 'OK', budget: `${r1(videoBudget / MB)} МБ / ${r1(videoBudget * 2 / MB)} МБ`, spread: '', note: firstUnknown.length ? `размер не определён: ${firstUnknown.map((v) => v.el).join(', ')}` : '' };
    checks['Видео без постера'] = { value: noPoster.length, unit: '', status: noPoster.length ? 'WARN' : 'OK', budget: '0', spread: '' };
  }
  if (overlay && overlay.found) checks['Цена слоя фактуры (растровых задач за 2 с покоя)'] = { value: overlay.extraRaster, unit: '', status: overlay.status, budget: '≤ 2 прибавки', spread: `со слоем ${overlay.stats.with.raster.min}–${overlay.stats.with.raster.max}, без ${overlay.stats.without.raster.min}–${overlay.stats.without.raster.max}` };
  for (const c of Object.values(checks)) bump(c.status);

  console.log(`Условия: ${vpName} ${vp.width}×${vp.height}@${vp.deviceScaleFactor || 1}, процессор ×${cpu} медленнее, сеть ${netName}${runs > 1 ? `, прогонов ${samples.length} (медиана)` : ''} · загрузка до тишины ${loadMs} мс`);
  console.log(runs > 1 ? '| показатель | медиана | разброс | бюджет (хорошо / терпимо) | вердикт |\n|---|---|---|---|---|' : '| показатель | значение | бюджет (хорошо / терпимо) | вердикт |\n|---|---|---|---|');
  for (const [k, c] of Object.entries(checks)) {
    const note = c.note ? ` (${c.note})` : '';
    console.log(runs > 1 ? `| ${k} | ${c.value == null ? '—' : c.value}${c.unit} | ${c.spread || '—'} | ${c.budget} | ${c.status}${note} |` : `| ${k} | ${c.value == null ? '—' : c.value}${c.unit} | ${c.budget} | ${c.status}${note} |`);
  }
  const sc = ref.scroll;
  console.log(`\nПрокрутка: ${sc.planned ? `дошли до ${sc.reached} из ${sc.planned} px (${Math.round((sc.share || 0) * 100)}%) за ${sc.frames} кадров, ${sc.ms} мс, прокручивается ${sc.scroller}` : 'страница не выше окна — прокручивать нечего'}${!scrollValid ? ' — FAIL замера: кадры/с при прокрутке не в счёт (прокрутка не доехала: заставка держит, скрипт возвращает или прокручивается не тот блок)' : ''}`);
  console.log(`По сети (${res.length} ответов): ${Object.entries(by).map(([k, v]) => `${k} ${v.count}/${v.kb} КБ`).join(' · ')} · сторонние домены ${thirdParty} КБ`);
  console.log(`Самое тяжёлое: ${largest.map((l) => `${l.file} ${l.kb} КБ`).join('; ')}`);
  const fmtImg = (i) => `${i.kind} ${i.src} ${i.natural} в ${i.box} (${i.fit}) — ${i.density} пикс./CSS-пикс.`;
  if (resLazy.length) console.log(`Догружено проходом за ленивым (${media.lazyPass ? `${Math.round(media.lazyPass.ms / 100) / 10} с` : ''}; в вес выше не входит): ${resLazy.length} ответов, ${Math.round(resLazy.reduce((a, r) => a + r.bytes, 0) / 1024)} КБ`);
  console.log(`Плотность картинок (dpr ${media.dpr}, нужно ≥ ${media.need}): проверено ${media.checked}${lazy.length ? `, заглушек ленивой загрузки ${lazy.length} (не измерены)` : ''}${media.notLoaded ? `, не загрузились к замеру ${media.notLoaded}` : ''}${media.error ? `, ошибка: ${media.error}` : ''}`);
  if (small.length) for (const i of small.slice(0, 10)) console.log(`  ${i.status.padEnd(4)} ${fmtImg(i)}${i.status === 'FAIL' ? ' — меньше пикселя картинки на CSS-пиксель: размыто на любом экране' : ` — ниже ${media.need}: размыто на этом экране`}`);
  if (lazy.length) for (const i of lazy.slice(0, 6)) console.log(`  WARN ${i.kind} ${i.src} ${i.natural} в ${i.box} — заглушка ленивой загрузки не догрузилась (${i.placeholder}) — не измерено`);
  if (lazy.length > 6) console.log(`       … и ещё ${lazy.length - 6} заглушек (полный список — в JSON, images.lazy)`);
  if (big.length) console.log(`Картинки крупнее показанного (лишний вес, справочно): ${big.slice(0, 8).map((o) => `${o.src} ${o.natural}→${o.box} (×${o.density})`).join('; ')}`);
  if (media.videos.length) {
    console.log(`Видео (${media.videos.length}): бюджет первого экрана ${r1(videoBudget / MB)} МБ (${vp.isMobile ? 'телефон' : 'десктоп'}) — роликов в первом экране ${firstVideos.length}, вес ${mbs(firstBytes)}`);
    for (const v of media.videos) console.log(`  ${v.first ? 'первый экран' : 'ниже'}: ${v.el} ${v.src.split('/').pop().split('?')[0].slice(0, 50) || v.src.slice(0, 50)} — ${mbs(v.bytes)} (${v.sizeFrom})${v.videoSize ? `, кадр ${v.videoSize}` : ''}, показ ${v.w}×${v.h}${v.autoplay ? ', autoplay' : ''}${v.muted ? ' muted' : ''}${v.loop ? ' loop' : ''}, preload ${v.preload || '—'}, ${v.poster ? 'постер есть' : 'БЕЗ постера'}`);
  }
  if (m.canvases) console.log(`Холстов: ${m.canvases}, анимаций в момент замера: ${m.animations} — кадры/с выше говорят, тянет ли их страница`);
  report = { ...report, runs: samples.length, loadMs, metrics: m, checks, byType: by, totalKb, thirdPartyKb: thirdParty, largest, scroll: { ...ref.scroll, fps: fpsScroll, valid: scrollValid, minShare }, idleFps, images: { dpr: media.dpr, need: media.need, checked: media.checked, notLoaded: media.notLoaded, lazyPass: media.lazyPass || null, small, big, lazy, all: media.items }, lazyLoadedKb: Math.round(resLazy.reduce((a, r) => a + r.bytes, 0) / 1024), videos: { budgetBytes: videoBudget, firstBytes, list: media.videos }, cdp: { heapMb, scriptMs: ref.scriptMs, layoutCount: ref.layoutCount, styleRecalcs: ref.styleRecalcs }, samples: samples.map((s) => ({ lcp: s.m.lcp, fcp: s.m.fcp, ttfb: s.m.ttfb, cls: s.m.cls, longTotal: s.m.longTotal, fpsScroll: s.fpsScroll, idleFps: s.idleFps, heapMb: s.heapMb, loadMs: s.loadMs, scrollShare: s.scroll.share, scrollReached: s.scroll.reached, scrollPlanned: s.scroll.planned })) };
  lines.push(...Object.entries(checks).filter(([, c]) => c.status !== 'OK' && c.status !== 'n/a').map(([k, c]) => `${k} ${c.status}`));
}

if (opt.overlay) {
  if (!overlay || overlay.error) { console.log(`\nWARN цена слоя: не измерена${overlay && overlay.error ? ` — ${overlay.error}` : ''}`); bump('WARN'); lines.push('цена слоя не измерена WARN'); }
  else if (!overlay.found) console.log(`\nOK   цена слоя: ${overlay.note} — мерить нечего`);
  else {
    const W = overlay.stats.with, N = overlay.stats.without;
    console.log(`\nЦена слоя фактуры: ${overlay.layers.map((l) => `${l.el}${l.blend && l.blend !== 'normal' ? ` ${l.blend}` : ''}${l.opacity != null ? ` α${l.opacity}` : ''}${l.animation ? ` [${l.animation}]` : ''}`).join(', ')}; ${overlay.rounds} раундов по 2 с покоя, чередуются`);
    if (overlay.hideVia === 'adopted') console.log('  «без слоя»: CSP страницы не применяет вставленный <style> — слой спрятан таблицей adoptedStyleSheets');
    console.log('| вариант | RasterTask: медиана (мин–макс) | Paint: медиана (мин–макс) | растр, мс: медиана |\n|---|---|---|---|');
    for (const [label, S] of [['со слоем', W], ['без слоя', N]]) console.log(`| ${label} | ${S.raster.median} (${S.raster.min}–${S.raster.max}) | ${S.paint.median} (${S.paint.min}–${S.paint.max}) | ${S.rasterMs.median} |`);
    const why = overlay.status === 'WARN' ? `слой перерисовывается в покое: +${overlay.extraRaster} растровых задач и +${overlay.extraPaint} Paint за 2 с (все раунды со слоем выше всех без) — кипение GIF или background-position; сдвиг transform по steps() обходится без перерисовки` : overlay.separated.raster || overlay.separated.paint ? `прибавка в пределах бюджета: +${overlay.extraRaster} растровых задач, +${overlay.extraPaint} Paint за 2 с` : `разницы нет или она в пределах разброса раундов (+${overlay.extraRaster} растровых задач, +${overlay.extraPaint} Paint)`;
    console.log(`${overlay.status.padEnd(4)} цена слоя — ${why}`);
    if (!samples.length) { bump(overlay.status); if (overlay.status !== 'OK') lines.push(`цена слоя ${overlay.status}`); }
  }
  report.overlay = overlay;
}

console.log(`\n${worst}: ${lines.join(', ') || 'все бюджеты соблюдены'}`);
report.verdict = worst;
const file = path.join(outDir, `${tag}${opt['overlay-only'] ? '-overlay' : ''}.json`);
writeJson(file, report);
console.log(`Сохранено: ${file}`);
if (opt.strict && worst === 'FAIL') { console.log('Код выхода 1: вердикт FAIL (--strict)'); process.exitCode = 1; }
