#!/usr/bin/env node
/**
 * Tilda как донор: точная карта из атрибутов разметки, а не замером. Язык Tilda-сайта (блоки, Zero Block
 * по брейкпоинтам, появления, пошаговая анимация, параллакс, окна и меню) лежит в data-атрибутах —
 * точнее, чем его можно замерить. Только съём донора: правок сайтов на Tilda и переноса с Tilda нет.
 *
 *   node tilda.mjs <адрес> [--out <папка>] [--viewport desktop,mobile] [--pages "тип=путь,…"] [--no-scroll]
 *   node tilda.mjs pages <адрес> [--out <папка>] [--limit 100] [--pause 300]
 *   node tilda.mjs static <файл.html | адрес> [--out <папка>]
 *   node tilda.mjs selftest            (или --selftest) фикстуры fixtures/tilda — без сети
 *   node tilda.mjs --help
 *
 * Браузерный проход (по умолчанию): страница → мгновенная прокрутка до низа (пауза 350 мс на шаг — Tilda
 * успевает запустить появления и догрузить ленивое) → снимок атрибутов и состояния. 18–25 с на экран.
 * Экраны списком (--viewport desktop,mobile), страницы — --pages от первого адреса («тип=путь»).
 * Выход — <out>/tilda/ (по умолчанию <out> — папка прогона runs/<slug>):
 *   tilda-<экран>.json и .md (с --pages — tilda-<тип>-<экран>): платформа (страница, проект, ленивая
 *     загрузка, data-blocks-animationoff, скрипты tilda-*.js, шрифты проекта и загруженные, плашка);
 *     блоки (rec, код Tnnn, экраны t-screenmin/max, появление, высота, заголовок, зона); появления
 *     стандартных блоков (.t-animate) с числами по умолчанию Tilda и «играет ли на этом экране»;
 *     Zero Block — артборды (брейкпоинты, upscale, zoom сейчас, высоты), элементы по ключу recid:elemid
 *     (поля по брейкпоинтам, zoom, кегль на экране, обрезан ли артбордом), появления, пошаговая
 *     анимация (шаги словами), параллакс (скорость, px на проход), фиксация; хуки (#popup:* → окно,
 *     #menuopen → меню); виджеты; ленивые картинки (заглушки до и после прокрутки);
 *   tilda-motion-<экран>.json — движение в схеме motion.json (kind, trigger, props, timing, scroll,
 *     recipe) с source «атрибуты Tilda», confidence «точно» и plays: играет ли у донора на этом экране;
 *   tilda-layout.json — элементы Zero Block по брейкпоинтам: left, top, width, height, кегль в единицах
 *     донора (числа для сетки и ритма, не вёрстка для переноса).
 * pages: адреса со страницы и из sitemap.xml → GET по очереди (таймаут 25 с, пауза --pause, до --limit;
 *   товары /tproduct/… — одной страницей) → подпись = коды блоков без T123 (HTML-вставки меняются от
 *   страницы к странице) → типы: доля общих кодов ≥ 0.8 и одинаковые первые три. <out>/tilda/tilda-pages.json
 *   и готовая строка --pages для discover и motion. Без браузера.
 * static: та же карта из голого HTML (без браузера, 1–3 с): для широкого (1440) и узкого (390) экрана
 *   по правилам Tilda. Zero Block, который скрипт дорисовывает после загрузки, в голом HTML неполон.
 *
 * Что верно и откуда (сверено с tilda-animation-2.0, -ext-1.0, -sbs-1.0, tilda-zero-1.1):
 * - код блока — первый класс вида t123 внутри rec, затем комментарий <!-- T123 -->, затем
 *   data-alias-record-type (data-record-type 121 — это и T123, и T1003, и T851);
 * - брейкпоинт артборда — наибольший из data-artboard-screens, не больше ширины окна; значение поля
 *   для него — -res-N, нет — ближайший больший брейкпоинт, нет — базовое (самый широкий экран);
 * - upscale=window: элементы масштабируются CSS zoom = ширина окна / брейкпоинт (1440/1200 = 1.2);
 *   computed font-size его не учитывает, кегль на экране = font-size × zoom (EFFECTIVE_ZOOM_FN из lib);
 * - появления стандартных блоков: fadein, fadeinup (Y +100 px), fadeindown (−100), fadeinleft (X +100),
 *   fadeinright (−100), zoomin (×0.9), zoomout (×1.2), fade-in-blur (12 px); 1 с, .t-title 1.2 с,
 *   .t-descr/.t-subtitle/.t-text/.t-uptitle 0.7 с, .t-item 0.5 с; cubic-bezier(.19,1,.22,1); chain —
 *   +160 мс на ряд;
 * - **экраны**: при ширине < 1200 Tilda снимает все появления, кроме элементов Zero Block с
 *   data-animate-mobile="y"; пошаговая, параллакс и фиксация Zero Block без этого атрибута выключены
 *   при брейкпоинте артборда < 1200; data-blocks-animationoff="yes" выключает появления везде (SBS — нет);
 * - атрибут не значит, что играет: plays — по классу после прокрутки (t-animate_started, снятый t-animate,
 *   обёртка SBS, data-parallax-speed), если скрипты Tilda на странице есть; иначе — по правилам выше;
 * - SBS: шаги sbs-opts (ti — мс, di — px прокрутки, mx/my — сдвиг от начала, sx/sy, op, ro, bl, fi),
 *   кривая шага — его ea (easeIn/Out/InOut, bounceFin = cubic-bezier(0.34,1.61,0.7,1), пусто — linear),
 *   dd/dt — пауза перед шагом; loop → infinite, loopwithreverse → alternate; scroll — отрезок Σdi × zoom
 *   от точки «верх элемента на trg окна (1 — низ) + trgofst»;
 * - параллакс prx-s: скорость = round((s − 100)/10), сдвиг = скорость × 100 px за проход элемента через
 *   экран (высота элемента + высота окна); без prx-s не двигается.
 *
 * Из кода (discover, motion, clicks, cliche — раунд Tilda):
 *   import { tildaSnapshot, tildaMotion, tildaSummary, staticRaw, interpret, pageTypes, groupSignatures } from './tilda.mjs';
 *   const snap = await tildaSnapshot(page, { scroll: false });   // вкладка уже открыта и прокручена
 *   tildaSummary(snap) → 10–15 строк для discovery.md; snap.motion — пункты схемы motion.json
 *
 * Код выхода: 0 — снято (или «не Tilda» — сказано в выводе); 1 — неверные аргументы, страница не открылась,
 * selftest с расхождениями.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parseArgs, launch, openPage, resolveViewport, scrollThrough, forceInstantScroll, sleep, evaluateWith, writeJson,
  ensureDir, runDir, pageSlug, pagesFrom, unmangle, SIG_FN, EFFECTIVE_OPACITY_FN, EFFECTIVE_ZOOM_FN, CLIP_SHARE_FN,
  TILDA_FN, IS_TILDA_SERVICE_FN, TILDA_PH,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ---------- правила Tilda (одно место для формул) ---------- */
/** Длительность появления стандартного блока по классу-носителю, мс (иначе 1000). */
export const STD_DUR = { 't-title': 1200, 't-descr': 700, 't-subtitle': 700, 't-text': 700, 't-uptitle': 700, 't-item': 500 };
export const STD_EASE = 'cubic-bezier(0.19, 1, 0.22, 1)';
export const CHAIN_STEP = 160;
/** Появления: откуда приходит элемент (tx/ty — в долях distance, sc — масштаб по умолчанию, blur — px). */
export const APPEAR = {
  fadein: { words: 'проявление' }, fadeinup: { ty: 1, words: 'снизу' }, fadeindown: { ty: -1, words: 'сверху' },
  fadeinleft: { tx: 1, words: 'справа' }, fadeinright: { tx: -1, words: 'слева' },
  zoomin: { sc: 0.9, words: 'увеличение' }, zoomout: { sc: 1.2, words: 'уменьшение' }, 'fade-in-blur': { blur: 12, words: 'из размытия' },
};
const EASE = { easeIn: 'ease-in', easeOut: 'ease-out', easeInOut: 'ease-in-out', bounceFin: 'cubic-bezier(0.34,1.61,0.7,1)' };
const NAMES = { tx: 'сдвиг X', ty: 'сдвиг Y', sc: 'масштаб', sx: 'масштаб X', sy: 'масштаб Y', rot: 'поворот', op: 'прозрачность', blur: 'размытие' };
const MENUS = { t228: 'верхнее', t456: 'верхнее', t199: 'верхнее', t966: 'верхнее', t446: 'верхнее', t461: 'верхнее', t450: 'шторка сбоку (#menuopen)', t451: 'шторка сбоку (#menuopen)', t280: 'на весь экран', t975: 'нижняя панель телефона' };
const SERVICE_BLOCKS = { T360: 'полоса загрузки и проявление страницы' };
const WIDE = { vw: 1440, vh: 900 }, NARROW = { vw: 390, vh: 844 };

const round = (v, n = 0) => { const k = 10 ** n; return Math.round(v * k) / k; };
const numOr = (v, d = null) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const easeOf = (ea) => { const s = String(ea == null ? '' : ea).trim(); if (!s || s === '0') return 'linear'; return EASE[s] || s; };
const fmtV = (k, v) => (k === 'sc' || k === 'sx' || k === 'sy' || k === 'op' ? String(round(v, 2)) : k === 'rot' ? `${round(v, 1)}°` : `${round(v, 1)} px`);

/** Поля с брейкпоинтами: { 'top-value': 1, 'top-res-960-value': 2 } (suffix '-value') → { top: { base: 1, res: { 960: 2 } } }. */
export function groupRes(obj, suffix = '') {
  const out = {};
  for (const [k0, v] of Object.entries(obj || {})) {
    const k = suffix && k0.endsWith(suffix) ? k0.slice(0, -suffix.length) : k0;
    const m = /^(.*)-res-(\d+)$/.exec(k);
    const name = m ? m[1] : k; const g = out[name] || (out[name] = { base: null, res: {} });
    if (m) g.res[m[2]] = v; else g.base = v;
  }
  return out;
}
/** Брейкпоинт артборда для ширины: наибольший из screens, не больше vw; меньше всех — первый (как t396_detectResolution). */
export function resOf(screens, vw) { let r = null; for (const s of screens) if (vw >= s) r = s; return r === null ? (screens[0] || null) : r; }
/**
 * Значение с брейкпоинтами для экрана res (t_animationExt__getAttrByRes, t_animationSBS__getAnimOptions):
 * res — самый широкий → базовое; gated (атрибуты движения) и нет data-animate-mobile=y и res < 1200 → ''
 * (выключено); иначе -res-N, затем ближайший больший брейкпоинт (кроме самого широкого), затем базовое.
 */
export function attrAt(g, name, res, screens, { gated = false, mobileY = false } = {}) {
  const x = g && g[name]; if (!x) return null;
  const max = screens.length ? screens[screens.length - 1] : null;
  if (res == null || res === max) return x.base;
  if (gated && !mobileY && res < 1200) return '';
  if (x.res[res] != null) return x.res[res];
  for (const s of screens) if (s > res && s !== max && x.res[s] != null) return x.res[s];
  return x.base;
}

/* ---------- пошаговая анимация (SBS) ---------- */
/** sbs-opts (JSON в одинарных кавычках) → массив шагов или null. */
export function parseSbsOpts(s) {
  if (!s || s === 'null') return null;
  try { const a = JSON.parse(String(s).replace(/'/g, '"')); return Array.isArray(a) ? a : null; } catch { return null; }
}
/**
 * Шаги SBS → [{ t (мс, события во времени) | d (px прокрутки), pause, tx, ty, sx, sy, op, rot, blur, fix, ease }]:
 * значения — состояние на шаге (сдвиг — от начального места), ease — кривая отрезка, который ведёт к шагу.
 * px (d, tx, ty, blur) — на экране: × zoom артборда (upscale=window масштабирует и сдвиги, и отрезок прокрутки).
 * dd/dt перед шагом — вставленная пауза (копия предыдущего состояния), как t_animationSBS__addDelayToSteps.
 */
export function sbsSteps(raw, { scroll = false, zoom = 1 } = {}) {
  if (!Array.isArray(raw)) return [];
  const list = [];
  raw.forEach((st, i) => {
    const pause = i > 0 && (parseInt(st.dd, 10) || parseInt(st.dt, 10));
    if (pause) { const p = { ...list[list.length - 1], pause: true, ease: 'linear' }; if (scroll) p.d = round((parseInt(st.dd, 10) || 0) * zoom, 1); else p.t = parseInt(st.dt, 10) || 0; list.push(p); }
    const s = {
      tx: round((parseInt(st.mx, 10) || 0) * zoom, 1), ty: round((parseInt(st.my, 10) || 0) * zoom, 1),
      sx: Number.isNaN(parseFloat(st.sx)) ? 1 : parseFloat(st.sx), sy: Number.isNaN(parseFloat(st.sy)) ? 1 : parseFloat(st.sy),
      op: Number.isNaN(parseFloat(st.op)) ? 1 : parseFloat(st.op), rot: parseInt(st.ro, 10) || 0, blur: round((parseInt(st.bl, 10) || 0) * zoom, 1),
      fix: st.fi === 'fixed', ease: easeOf(st.ea),
    };
    if (scroll) s.d = round((parseFloat(st.di) || 0) * zoom, 1); else s.t = parseFloat(st.ti) || 0;
    list.push(s);
  });
  return list;
}
const KEYS = ['tx', 'ty', 'sx', 'sy', 'op', 'rot', 'blur'];
/** Какие свойства меняются по ходу шагов; масштаб sx = sy — одним «sc». */
function changed(steps) {
  const out = KEYS.filter((k) => steps.some((s) => Math.abs(s[k] - steps[0][k]) > 1e-6));
  if (out.includes('sx') && out.includes('sy') && steps.every((s) => Math.abs(s.sx - s.sy) < 1e-6)) return [...out.filter((k) => k !== 'sx' && k !== 'sy'), 'sc'];
  return out;
}
const val = (s, k) => (k === 'sc' ? s.sx : s[k]);
/**
 * Вид движения по шагам. Петля (loop) — как у motion.mjs: мигание, вращение, пульс, парение, другое.
 * Без повтора: мигание (прозрачность меняет направление 3+ раз), прозрачность, поворот, масштаб, сдвиг, другое.
 */
export function sbsSub(steps, loop = false) {
  const ch = changed(steps);
  if (!ch.length) return 'без изменений';
  const ops = steps.map((x) => x.op).filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > 1e-6);
  const blink = ops.length >= 4;
  if (ch.length === 1 && ch[0] === 'op') return loop || blink ? 'мигание' : 'прозрачность';
  if (ch.every((k) => k === 'rot')) return loop || steps.some((x) => Math.abs(x.rot) >= 360) ? 'вращение' : 'поворот';
  if (ch.every((k) => k === 'sc' || k === 'sx' || k === 'sy' || k === 'op')) return loop ? 'пульс' : 'масштаб';
  if (ch.every((k) => k === 'tx' || k === 'ty' || k === 'op')) return loop ? 'парение' : 'сдвиг';
  return 'другое';
}
/** Шаги словами: «старт прозрачность 0 → за 400 мс прозрачность 1 → …». */
export function sbsWords(steps, { scroll = false, loop = '' } = {}) {
  if (!steps.length) return 'шагов нет';
  const ch = changed(steps);
  const state = (s, prev) => ch.filter((k) => !prev || Math.abs(val(s, k) - val(prev, k)) > 1e-6).map((k) => `${NAMES[k]} ${fmtV(k, val(s, k))}`).join(', ');
  const idn = { tx: 0, ty: 0, sx: 1, sy: 1, op: 1, rot: 0, blur: 0 };
  const start = ch.filter((k) => Math.abs(val(steps[0], k) - (k === 'sc' ? 1 : idn[k])) > 1e-6).map((k) => `${NAMES[k]} ${fmtV(k, val(steps[0], k))}`).join(', ');
  const parts = [start ? `старт: ${start}` : 'старт: исходное'];
  for (let i = 1; i < steps.length; i++) {
    const s = steps[i], p = steps[i - 1];
    const amount = scroll ? s.d : s.t;
    if (s.pause) { parts.push(`пауза ${amount} ${scroll ? 'px' : 'мс'}`); continue; }
    const what = state(s, p);
    if (!what) { parts.push(amount ? `${scroll ? 'стоит' : 'держит'} ${amount} ${scroll ? 'px' : 'мс'}` : 'без изменений'); continue; }
    const when = amount ? `${scroll ? 'на' : 'за'} ${amount} ${scroll ? 'px' : 'мс'}` : 'сразу';
    parts.push(`${when}${s.ease !== 'linear' && amount ? ` (${s.ease})` : ''}: ${what}${s.fix ? ', закреплён' : ''}`);
  }
  return parts.join(' → ') + (loop ? `; повтор ${loop === 'loopwithreverse' ? 'туда-обратно (alternate)' : loop === 'noreverse' ? 'без обратного хода' : 'по кругу (infinite)'}` : '');
}
/** Ключевые кадры для @keyframes: offset = накопленное время / общее; у кадра — кривая следующего отрезка. */
export function sbsKeyframes(steps) {
  const total = steps.reduce((a, s, i) => a + (i ? s.t || 0 : 0), 0);
  let acc = 0; const out = [];
  steps.forEach((s, i) => {
    if (i) acc += s.t || 0;
    const next = steps[i + 1];
    out.push({ offset: total ? round(acc / total, 4) : i / Math.max(1, steps.length - 1), transform: `translate(${s.tx}px, ${s.ty}px) rotate(${s.rot}deg) scale(${s.sx}, ${s.sy})`, opacity: s.op, ...(s.blur ? { filter: `blur(${s.blur}px)` } : {}), ...(next ? { easing: next.ease } : {}) });
  });
  return { total, frames: out };
}

/* ---------- параллакс ---------- */
/** prx-s → скорость, px на проход, коэффициент (px сдвига на px прокрутки; знак — как у motion: вверх быстрее). */
export function prxInfo(s, h, vh) {
  const sp = s == null || s === '' ? null : Math.round((parseInt(s, 10) - 100) / 10);
  if (!sp) return { speed: sp, moves: false, px: 0, coefficient: null };
  const px = sp * 100;
  return { speed: sp, moves: true, px, pass: h > 0 && vh > 0 ? round(h + vh) : null, coefficient: h > 0 && vh > 0 ? round(-px / (h + vh), 4) : null };
}

/* =====================================================================
   В странице: сырые атрибуты и состояние (истолкование — в Node, общее с голым HTML)
   ===================================================================== */
function tildaRawInPage() {
  const q = (s, r = document) => { try { return [...r.querySelectorAll(s)]; } catch (e) { return []; } };
  const txt = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const pre = (el, p) => { const o = {}; for (const a of el.attributes) if (a.name.startsWith(p)) o[a.name.slice(p.length)] = a.value; return o; };
  const cs = (el) => getComputedStyle(el);
  const info = tilda();
  if (!info.tilda) return { tilda: false, url: location.href, vw: innerWidth, vh: innerHeight };
  const root = document.getElementById('allrecords') || document.querySelector('.t-records');
  const scripts = [...new Set([...document.scripts].map((s) => s.src).filter((s) => /tildacdn|tilda\.ws|\/tilda-[\w.-]+\.js/.test(s)).map((s) => s.split('/').pop().split('?')[0]))];
  const rcs = cs(document.documentElement); const cssVar = (n) => (rcs.getPropertyValue(n) || (root ? cs(root).getPropertyValue(n) : '') || '').trim() || null;
  const byStyle = {};
  for (const el of q('.tn-atom, .t-title, .t-descr, .t-text, .t-name, .t-uptitle, .t-subtitle, .t-menu__link-item')) {
    if (svc(el)) continue; const n = txt(el).length; if (!n) continue;
    const f = cs(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(); byStyle[f] = (byStyle[f] || 0) + n;
  }
  const platform = {
    ...info, attrs: root ? pre(root, 'data-') : {}, scripts, tnPresent: !!window.tn,
    fonts: { headline: cssVar('--t-headline-font'), text: cssVar('--t-text-font'), loaded: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))], byStyle },
    madeOn: q('#tildacopy, .t-tildalabel').filter((e, i, a) => !a.some((o) => o !== e && o.contains(e))).map((e) => ({ sel: sig(e), visible: e.getBoundingClientRect().height > 0 })),
  };
  const codeOf = (r) => {
    for (const e of q('[class]', r).slice(0, 60)) { const c = [...e.classList].find((x) => /^t\d{2,4}$/.test(x)); if (c) return [c.toUpperCase(), 'класс'] ; }
    for (const n of r.childNodes) if (n.nodeType === 8) { const m = /^\s*(t\d{2,4})\b/i.exec(n.nodeValue); if (m) return [m[1].toUpperCase(), 'комментарий']; }
    const al = r.getAttribute('data-alias-record-type'); if (al) return [`T${al.padStart(3, '0')}`, 'data-alias-record-type'];
    if (r.querySelector('a[name]') && !r.querySelector('div, section, img')) return ['якорь', 'a[name]'];
    return [null, null];
  };
  const records = q('.t-rec').filter((r) => /^rec\d+/.test(r.id)).map((r) => {
    const b = r.getBoundingClientRect(); const [code, codeFrom] = codeOf(r);
    const head = r.querySelector('h1, h2, h3, .t-title, .t-name, .tn-atom');
    return { id: r.id, type: r.getAttribute('data-record-type'), alias: r.getAttribute('data-alias-record-type'), code, codeFrom,
      screens: [...r.classList].filter((c) => /^t-screen(min|max)-/.test(c)).map((c) => c.replace('t-screen', '')), appear: r.getAttribute('data-animationappear') || 'on',
      shown: b.height > 0 && cs(r).display !== 'none', top: Math.round(b.top + scrollY), h: Math.round(b.height), head: head ? txt(head).slice(0, 50) : '',
      zone: r.closest('#t-header') ? 'header' : r.closest('#t-footer') ? 'footer' : 'page', bg: r.getAttribute('data-bg-color') || null };
  });
  const ROLES = ['t-title', 't-descr', 't-subtitle', 't-text', 't-uptitle', 't-item'];
  const standard = q('[data-animate-style]').filter((e) => !e.closest('.t396') && !svc(e)).map((e) => {
    const s = cs(e); const rec = e.closest('.t-rec'); const first = (v) => String(v || '').split(',')[0].trim(); const b = e.getBoundingClientRect();
    return { rec: rec ? rec.id : null, sig: sig(e), role: ROLES.find((c) => e.classList.contains(c)) || '', attrs: pre(e, 'data-animate-'),
      cls: { animate: e.classList.contains('t-animate'), started: e.classList.contains('t-animate_started'), wait: e.classList.contains('t-animate_wait') },
      computed: { duration: first(s.transitionDuration), delay: first(s.transitionDelay), easing: first(s.transitionTimingFunction) },
      text: txt(e).slice(0, 50), top: Math.round(b.top + scrollY), shown: b.width > 0 && b.height > 0 };
  });
  const artboards = q('.t396__artboard').map((ab) => {
    const id = ab.getAttribute('data-artboard-recid'); const b = ab.getBoundingClientRect(); const s = cs(ab); const tn = window.tn && window.tn['ab' + id];
    const el0v = [...ab.querySelectorAll('.t396__elem')].find((x) => x.getClientRects().length && x.getBoundingClientRect().width > 0); const el0 = el0v ? (el0v.querySelector('.tn-atom') || el0v) : null;
    return { recid: id, attrs: pre(ab, 'data-artboard-'), rect: { top: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) }, overflow: s.overflow, display: s.display,
      scaleClass: ab.classList.contains('t396__artboard_scale'), tnScale: tn && tn.scaleFactor || null, tnRes: tn && tn.curResolution || null, zoom: el0 ? zoom(el0) : null,
      shown: s.display !== 'none' && !!ab.closest('.t-rec') && ab.closest('.t-rec').getBoundingClientRect().height > 0, inPopup: !!ab.closest('.t-popup, .t1093') };
  });
  /* элементы и группы Zero Block (у группы — data-group-id и поля data-group-*-value; SBS бывает и на группе: romashka ×28) */
  const elems = q('.t396__elem, .t396__group').map((e) => {
    const grp = e.classList.contains('t396__group');
    const ab = e.closest('.t396__artboard'); const recid = ab ? ab.getAttribute('data-artboard-recid') : null; const id = grp ? 'g' + e.getAttribute('data-group-id') : e.getAttribute('data-elem-id');
    const atom = (!grp && e.querySelector('.tn-atom')) || e; const s = cs(e); const as = cs(atom); const b = e.getBoundingClientRect(); const fixed = s.position === 'fixed';
    const pw = e.querySelector(':scope > .tn-atom__prx-wrapper, .tn-atom__prx-wrapper');
    return { key: `${recid}:${id}`, id, recid, type: grp ? 'group' : e.getAttribute('data-elem-type'), text: txt(e).slice(0, 60), fields: pre(e, grp ? 'data-group-' : 'data-field-'), anim: pre(e, 'data-animate-'),
      pos: s.position, display: s.display, rect: { x: Math.round(b.left), y: Math.round(b.top + (fixed ? 0 : scrollY)), w: Math.round(b.width), h: Math.round(b.height) },
      zoom: zoom(atom), font: { family: as.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: parseFloat(as.fontSize) || null, weight: as.fontWeight },
      clip: clip(e), hrefs: q('a[href]', e).map((a) => a.getAttribute('href')).filter((h) => /^#/.test(h || '')).slice(0, 4),
      state: { animate: e.classList.contains('t-animate'), started: e.classList.contains('t-animate_started'), sbsWrapper: !!e.querySelector('.tn-atom__sbs-anim-wrapper'),
        sbsStarted: e.classList.contains('t-sbs-anim_started') || !!e.querySelector('.t-sbs-anim_started'), prxSpeed: pw ? pw.getAttribute('data-parallax-speed') : null,
        prxProcessed: e.getAttribute('data-animate-prx-processed'), fixProcessed: e.getAttribute('data-animate-fix-processed') } };
  });
  const hookSel = 'a[href^="#popup:"], a[href="#menuopen"], a[href="#closepopup"], a[href="#closeallpopup"]';
  const hooks = {
    links: q(hookSel).map((a) => { const el = a.closest('.t396__elem'); const ab = a.closest('.t396__artboard'); return { href: a.getAttribute('href'), text: txt(a).slice(0, 40), rec: (a.closest('.t-rec') || {}).id || null, key: el && ab ? `${ab.getAttribute('data-artboard-recid')}:${el.getAttribute('data-elem-id')}` : null }; }),
    targets: q('[data-tooltip-hook]').map((t) => { const r = t.closest('.t-rec'); return { hook: t.getAttribute('data-tooltip-hook'), rec: r ? r.id : null, code: r ? codeOf(r)[0] : null, anim: t.getAttribute('data-anim'), timeout: t.getAttribute('data-anim-timeout'), popupRecs: t.getAttribute('data-popup-rec-ids'), cls: String(t.className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.') }; }),
  };
  const has = (s) => q(s).length;
  const widgets = {
    menus: ['t228', 't450', 't451', 't280', 't456', 't446', 't461', 't199', 't975', 't966'].filter((c) => has('.' + c)).map((c) => c.toUpperCase()),
    menuburger: has('.t-menuburger'), popups: has('.t-popup'), popupsOpen: has('.t-popup_show'), sliders: has('.t-slds'), sliderItems: has('.t-slds__item'),
    store: has('.t-store, .js-store'), forms: has('.t-form, form.js-form-proccess'), covers: has('.t-cover'), zero: has('.t396'), groups: has('.t396__group'),
    marquee: has('.t1003'), typing: has('.t635__typing-text, .t635'), toTop: has('.t890'), messenger: has('.t825'), progress: has('.t360__progress'), accordions: has('.t668, .t585, .t1089'),
  };
  const phOf = (e) => ph.test(e.tagName === 'IMG' ? (e.currentSrc || e.src || '') : cs(e).backgroundImage || '');
  const lazy = { bgimg: has('.t-bgimg'), bgimgLoaded: has('.t-bgimg.loaded'), dataOriginal: has('[data-original]'), placeholders: q('.t-bgimg, img, [data-original]').filter(phOf).length };
  return { tilda: true, url: location.href, vw: innerWidth, vh: innerHeight, touch: matchMedia('(hover: none)').matches, platform, records, standard, artboards, elems, hooks, widgets, lazy };
}
function lazyCountsInPage() {
  const q = (s) => [...document.querySelectorAll(s)];
  const phOf = (e) => ph.test(e.tagName === 'IMG' ? (e.currentSrc || e.src || '') : getComputedStyle(e).backgroundImage || '');
  return { started: q('.t-animate_started').length, animate: q('.t-animate').length, bgLoaded: q('.t-bgimg.loaded').length, bg: q('.t-bgimg').length, placeholders: q('.t-bgimg, img, [data-original]').filter(phOf).length };
}
const DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN, zoom: EFFECTIVE_ZOOM_FN, clip: CLIP_SHARE_FN, tilda: TILDA_FN, svc: IS_TILDA_SERVICE_FN, ph: TILDA_PH };

/* =====================================================================
   Голый HTML → то же сырьё (без браузера)
   ===================================================================== */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–' };
const decode = (s) => String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));
/** Атрибуты открывающего тега: { имя: значение } (кавычки обоих видов, переносы строк внутри тега). */
export function tagAttrs(tag) {
  const out = {}; const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g; let m;
  const body = tag.replace(/^<\w+/, '').replace(/\/?>$/, '');
  while ((m = re.exec(body))) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}
function balancedDiv(h, pos, max = 40000) {
  const tagRe = /<\/?div\b[^>]*>/gi; tagRe.lastIndex = pos; let depth = 0, t;
  while ((t = tagRe.exec(h))) { if (tagRe.lastIndex - pos > max) break; if (t[0][1] === '/') depth--; else depth++; if (depth === 0) return h.slice(pos, tagRe.lastIndex); }
  return h.slice(pos, Math.min(h.length, pos + 2000));
}
const stripText = (s) => decode(s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const pick = (o, p) => { const r = {}; for (const [k, v] of Object.entries(o)) if (k.startsWith(p)) r[k.slice(p.length)] = v; return r; };

/** Коды блоков по порядку (для подписи типов страниц): [{ id, code, screens, type }]. */
export function staticRecords(h) {
  const out = []; const re = /<div\s[^>]*\bid="(rec\d+)"[^>]*>/g; let m;
  const idx = []; while ((m = re.exec(h))) { if (!/data-record-type=/.test(m[0])) continue; idx.push({ pos: m.index, end: re.lastIndex, tag: m[0], id: m[1] }); }
  const hdr = /<header\b[^>]*id="t-header"/.exec(h), hdrEnd = hdr ? h.indexOf('</header>', hdr.index) : -1;
  const ftr = /<footer\b[^>]*id="t-footer"/.exec(h), ftrEnd = ftr ? h.indexOf('</footer>', ftr.index) : -1;
  idx.forEach((r, i) => {
    const a = tagAttrs(r.tag); const next = idx[i + 1] ? idx[i + 1].pos : h.length;
    const inner = h.slice(r.end, Math.min(next, r.end + 6000));
    const cm = /^\s*<!--\s*(t\d{2,4})\b/i.exec(inner);
    const cl = /<[a-z]+\b[^>]*\bclass\s*=\s*["']\s*(t\d{2,4})(?=[\s_"'])/i.exec(inner);
    /* якорь: в блоке только <a name="…"></a> (у Tilda «якорная ссылка» — кода в классе и комментарии нет) */
    const anchor = !cl && !cm && !a['data-alias-record-type'] && /^\s*(<!--[^>]*-->\s*)?<a\b[^>]*\bname=[^>]*>\s*<\/a>\s*(<\/div>\s*)?$/i.test(inner.split(/<div\s[^>]*\bid="rec\d+/)[0]);
    const code = cl ? cl[1].toUpperCase() : cm ? cm[1].toUpperCase() : a['data-alias-record-type'] ? `T${a['data-alias-record-type'].padStart(3, '0')}` : anchor ? 'якорь' : null;
    const headM = /<(h1|h2|h3)\b[^>]*>([\s\S]{0,400}?)<\/\1>/i.exec(inner) || /class=["'][^"']*\b(t-title|tn-atom)\b[^"']*["'][^>]*>([\s\S]{0,300}?)<\//i.exec(inner);
    out.push({ id: r.id, type: a['data-record-type'] || null, alias: a['data-alias-record-type'] || null, code, codeFrom: cl ? 'класс' : cm ? 'комментарий' : a['data-alias-record-type'] ? 'data-alias-record-type' : anchor ? 'a[name]' : null,
      screens: (String(a.class || '').match(/t-screen(min|max)-\d+px/g) || []).map((c) => c.replace('t-screen', '')), appear: a['data-animationappear'] || 'on',
      shown: null, top: null, h: null, head: headM ? stripText(headM[2]).slice(0, 50) : '',
      zone: hdr && r.pos > hdr.index && r.pos < hdrEnd ? 'header' : ftr && r.pos > ftr.index && r.pos < ftrEnd ? 'footer' : 'page', bg: a['data-bg-color'] || null, pos: r.pos, end: next });
  });
  return out;
}
/** Голый HTML → сырьё той же формы, что даёт браузер (без прямоугольников, zoom и состояния классов). */
export function staticRaw(h, url = null) {
  const rootTag = /<div\s[^>]*\bid="allrecords"[^>]*>/.exec(h);
  const tilda = !!rootTag || /\bt-rec\b[^>]*data-record-type=/.test(h) || /tildacdn\.com/.test(h);
  if (!tilda) return { tilda: false, url, source: 'голый HTML' };
  const ra = rootTag ? tagAttrs(rootTag[0]) : {};
  const scripts = [...new Set((h.match(/<script\b[^>]*\bsrc=["'][^"']+["']/gi) || []).map((s) => /src=["']([^"']+)/i.exec(s)[1]).filter((s) => /tildacdn|tilda\.ws|\/tilda-[\w.-]+\.js/.test(s)).map((s) => s.split('/').pop().split('?')[0]))];
  const byStyle = {}; for (const m of h.matchAll(/font-family\s*:\s*['"]?([^'",;}]+)/gi)) { const f = m[1].trim(); if (!/^var\(/.test(f)) byStyle[f] = (byStyle[f] || 0) + 1; }
  const fontLinks = [...new Set([...(h.match(/[\w.-]*tildacdn\.com\/[^"' )]*fonts-[\w-]+\.css/g) || []), ...(h.match(/fonts\.googleapis\.com\/css2?\?family=[^"'&]+/g) || [])])].map((s) => s.replace(/^.*\//, '').replace(/^css2?\?family=/, 'Google Fonts: '));
  const madeOn = /\bid=["']tildacopy["']/.test(h);
  const records = staticRecords(h);
  const recAt = (pos) => { let r = null; for (const x of records) { if (x.pos <= pos && pos < x.end) { r = x; break; } } return r; };
  /* артборды и элементы Zero Block */
  const artboards = []; const elems = [];
  for (const m of h.matchAll(/<div\s+class=(["'])(t396__artboard|t396__elem|t396__group)\b[^"']*\1[^>]*>/g)) {
    const a = tagAttrs(m[0]);
    if (m[2] === 't396__artboard') { artboards.push({ recid: a['data-artboard-recid'], attrs: pick(a, 'data-artboard-'), rect: null, overflow: null, display: null, scaleClass: false, tnScale: null, tnRes: null, zoom: null, shown: null, pos: m.index }); continue; }
    const ab = [...artboards].reverse().find((x) => x.pos < m.index) || null;
    const grp = m[2] === 't396__group'; const id = grp ? 'g' + a['data-group-id'] : a['data-elem-id'];
    const outer = balancedDiv(h, m.index);
    const hrefs = grp ? [] : [...outer.matchAll(/href=["'](#[^"']+)["']/g)].map((x) => x[1]).slice(0, 4);
    elems.push({ key: `${ab ? ab.recid : null}:${id}`, id, recid: ab ? ab.recid : null, type: grp ? 'group' : a['data-elem-type'] || null, text: stripText(outer).slice(0, 60),
      fields: pick(a, grp ? 'data-group-' : 'data-field-'), anim: pick(a, 'data-animate-'), pos: null, display: null, rect: null, zoom: null, font: null, clip: null, hrefs, state: null, classes: a.class || '' });
  }
  /* появления стандартных блоков: data-animate-style вне .t396 */
  const ROLES = ['t-title', 't-descr', 't-subtitle', 't-text', 't-uptitle', 't-item'];
  const standard = [];
  for (const m of h.matchAll(/<(div|a|h[1-6]|p|span|img|section|ul|li|button|figure)\b[^>]*\bdata-animate-style=[^>]*>/gi)) {
    const a = tagAttrs(m[0]); const cls = String(a.class || '').split(/\s+/);
    if (cls.includes('t396__elem') || cls.includes('t396__group')) continue;
    const rec = recAt(m.index); if (rec && rec.code === 'T396') continue;
    const inner = h.slice(m.index + m[0].length, m.index + m[0].length + 600);
    standard.push({ rec: rec ? rec.id : null, sig: `${m[1].toLowerCase()}${cls.filter(Boolean).length ? '.' + cls.filter(Boolean).slice(0, 3).join('.') : ''}`, role: ROLES.find((c) => cls.includes(c)) || '', attrs: pick(a, 'data-animate-'), cls: null, computed: null, text: stripText(inner.split(/<\/(div|a|h[1-6]|p)>/i)[0]).slice(0, 50), top: null, shown: null });
  }
  const hooks = {
    links: [...h.matchAll(/<a\b[^>]*href=["'](#popup:[^"']+|#menuopen|#closepopup|#closeallpopup)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)].map((m) => { const rec = recAt(m.index); return { href: m[1], text: stripText(m[2]).slice(0, 40), rec: rec ? rec.id : null, key: null }; }),
    targets: [...h.matchAll(/<[a-z]+\b[^>]*data-tooltip-hook=["']([^"']+)["'][^>]*>/gi)].map((m) => { const a = tagAttrs(m[0]); const rec = recAt(m.index); return { hook: m[1], rec: rec ? rec.id : null, code: rec ? rec.code : null, anim: a['data-anim'] || null, timeout: a['data-anim-timeout'] || null, popupRecs: a['data-popup-rec-ids'] || null, cls: String(a.class || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.') }; }),
  };
  /* ссылки-хуки внутри элементов Zero Block — к ключу элемента */
  for (const e of elems) for (const href of e.hrefs) { const l = hooks.links.find((x) => x.href === href && !x.key); if (l) l.key = e.key; }
  const hasCls = (c) => new RegExp(`class=["'][^"']*\\b${c}\\b`).test(h);
  const cnt = (re) => (h.match(re) || []).length;
  const widgets = {
    menus: ['t228', 't450', 't451', 't280', 't456', 't446', 't461', 't199', 't975', 't966'].filter(hasCls).map((c) => c.toUpperCase()),
    menuburger: cnt(/class=["'][^"']*\bt-menuburger\b/g), popups: cnt(/class=["'][^"']*\bt-popup\b(?!_)/g), popupsOpen: 0, sliders: cnt(/class=["'][^"']*\bt-slds\b(?!_)/g), sliderItems: cnt(/\bt-slds__item\b/g),
    store: cnt(/class=["'][^"']*\b(t-store|js-store)\b/g), forms: cnt(/class=["'][^"']*\bt-form\b(?!_)/g), covers: cnt(/class=["'][^"']*\bt-cover\b(?!_)/g), zero: cnt(/class=["']t396["']/g), groups: cnt(/\bt396__group\b/g),
    marquee: hasCls('t1003') ? 1 : 0, typing: hasCls('t635') ? 1 : 0, toTop: hasCls('t890') ? 1 : 0, messenger: hasCls('t825') ? 1 : 0, progress: records.some((r) => r.code === 'T360') ? 1 : 0, accordions: cnt(/class=["'][^"']*\b(t668|t585|t1089)\b/g),
  };
  const lazy = { bgimg: cnt(/class=["'][^"']*\bt-bgimg\b/g), bgimgLoaded: 0, dataOriginal: cnt(/\bdata-original=/g), placeholders: cnt(new RegExp(TILDA_PH.source, 'gi')) };
  return {
    tilda: true, source: 'голый HTML', url, vw: null, vh: null, touch: null,
    platform: { tilda: true, pageId: ra['data-tilda-page-id'] || null, projectId: ra['data-tilda-project-id'] || null, alias: ra['data-tilda-page-alias'] || null, lazy: ra['data-tilda-lazy'] === 'yes', animationOff: ra['data-blocks-animationoff'] === 'yes', mobileY: cnt(/data-animate-mobile=["']y["']/g), madeOnTilda: madeOn, attrs: pick(ra, 'data-'), scripts, tnPresent: false, fonts: { headline: null, text: null, loaded: [], byStyle, links: fontLinks }, madeOn: madeOn ? [{ sel: 'div#tildacopy.t-tildalabel', visible: null }] : [] },
    records: records.map(({ pos, end, ...r }) => r), standard, artboards: artboards.map(({ pos, ...a }) => a), elems, hooks, widgets, lazy,
  };
}

/* =====================================================================
   Истолкование сырья: числа, «играет ли», движение в схеме motion.json
   ===================================================================== */
const screensOf = (ab) => String((ab && ab.attrs && ab.attrs.screens) || '1200').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
/** Показан ли блок на ширине w по классам t-screenmin/max; cur — показан ли по факту (браузер, w — ширина снимка). */
const recShownAt = (r, w, cur = null) => !r || (cur !== null && cur !== undefined ? cur : r.screens.every((s) => { const m = /^(min|max)-(\d+)px$/.exec(s); if (!m) return true; return m[1] === 'min' ? w >= +m[2] : w <= +m[2]; }));

/**
 * Сырьё (браузер или голый HTML) → карта для экрана { vw, vh }: platform, blocks, appear, zero, sbs, prx, mouse,
 * fix, hooks, widgets, lazy, motion (пункты схемы motion.json). Для браузерного сырья vw/vh берутся из него.
 */
export function interpret(raw, { vw: vw0 = null, vh: vh0 = null, viewport = null } = {}) {
  if (!raw || !raw.tilda) return { tilda: false, url: raw && raw.url };
  const browser = raw.source !== 'голый HTML';
  const vw = raw.vw || vw0 || WIDE.vw, vh = raw.vh || vh0 || WIDE.vh;
  const touch = raw.touch !== null && raw.touch !== undefined ? raw.touch : vw < 1024;
  const P = raw.platform; const scripts = (P.scripts || []).join(' ');
  const hasAnim = browser && /tilda-animation-\d/.test(scripts), hasSbs = browser && /tilda-animation-sbs/.test(scripts), hasExt = browser && /tilda-animation-ext/.test(scripts);
  const recById = new Map(raw.records.map((r) => [r.id, r]));
  const notes = [];

  /* артборды: брейкпоинт, upscale, zoom, высоты */
  const abs = new Map();
  const popupRecs = new Set(raw.hooks.targets.flatMap((t) => String(t.popupRecs || '').split(',').map((x) => x.trim()).filter(Boolean)));
  for (const a of raw.artboards) {
    const screens = screensOf(a); const g = groupRes(a.attrs);
    const at = (w) => { const res = resOf(screens, w); const up = attrAt(g, 'upscale', res, screens) || 'grid'; return { res, upscale: up, zoom: up === 'window' ? +(w / res).toFixed(3) : 1, height: numOr(attrAt(g, 'height', res, screens)), pos: attrAt(g, 'pos', res, screens) || null }; };
    const now = at(vw); const rec = recById.get('rec' + a.recid);
    const heights = {}; for (const s of screens) heights[s] = numOr(attrAt(g, 'height', s, screens));
    abs.set(String(a.recid), { recid: String(a.recid), rec, popup: popupRecs.has(String(a.recid)) || !!a.inPopup, screens, g, at, now, heights, rect: a.rect, overflow: a.overflow || (g.ovrflw && g.ovrflw.base) || null, zoomMeasured: a.zoom, tnScale: a.tnScale,
      shown: browser ? (a.shown !== false && recShownAt(rec, vw, rec && rec.shown)) : recShownAt(rec, vw), ovrflw: g.ovrflw ? g.ovrflw.base : null, code: rec ? rec.code : 'T396', elements: 0, byType: {} });
  }
  const abOf = (e) => abs.get(String(e.recid)) || { recid: String(e.recid), screens: [1200], g: {}, at: () => ({ res: 1200, upscale: 'grid', zoom: 1 }), now: { res: 1200, upscale: 'grid', zoom: 1 }, heights: {}, shown: true, byType: {}, elements: 0 };

  /* элементы Zero Block */
  const elems = raw.elems.map((e) => {
    const ab = abOf(e); ab.elements++; ab.byType[e.type || '?'] = (ab.byType[e.type || '?'] || 0) + 1;
    const f = groupRes(e.fields, '-value'); const an = groupRes(e.anim);
    const mobileY = an.mobile && an.mobile.base === 'y';
    const res = ab.now.res; const zoom = browser && e.zoom ? e.zoom : ab.now.zoom;
    const field = (n, r = res) => attrAt(f, n, r, ab.screens);
    const clipped = e.clip !== null && e.clip !== undefined && e.rect && e.rect.w > 0 && e.rect.h > 0 ? e.clip < 0.05 : false;
    /* заглушка конструктора — текст «Zero Block», который не виден: обрезан артбордом (браузер) или стоит в артборде
       высотой 0 (голый HTML). Видимый заголовок «ZERO BLOCK» (zero.tilda.cc) — не заглушка */
    const placeholder = /^zero block$/i.test(e.text || '') && (clipped || (!browser && !(numOr(ab.now.height) > 1)));
    const hNow = e.rect && e.rect.h ? e.rect.h : (() => { const hh = numOr(field('height')); if (hh) return hh * zoom; const w = numOr(field('width')), fw = numOr(field('filewidth')), fh = numOr(field('fileheight')); return w && fw && fh ? w * fh / fw * zoom : null; })();
    return { ...e, ab, f, an, mobileY, res, zoom, field, clipped, placeholder, service: placeholder ? 'заглушка «Zero Block»' : null, hNow,
      fontScreen: e.font && e.font.size ? round(e.font.size * (zoom || 1), 2) : numOr(field('fontsize')) ? round(numOr(field('fontsize')) * ab.now.zoom, 2) : null };
  });
  const byKey = new Map(elems.map((e) => [e.key, e]));
  const animOff = !!P.animationOff;

  /* «играет ли» — правило Tilda для ширины w и свидетельство классов после прокрутки */
  const decide = (rule, ev) => { const plays = ev.value !== null ? ev.value : rule.value; const out = { plays, playsBy: ev.value !== null ? ev.by : rule.by }; if (ev.value !== null && ev.value !== rule.value) out.mismatch = `правило Tilda: ${rule.value ? 'играет' : 'не играет'} (${rule.by}), по классам — ${ev.value ? 'играет' : 'нет'}`; return out; };
  const screensWord = (wide, narrow) => (wide && narrow ? 'все экраны' : wide ? 'только ≥ 1200' : narrow ? 'только < 1200' : 'нигде');

  /* 1. появления стандартных блоков */
  const stdRule = (e, w) => { const rec = recById.get(e.rec); if (animOff) return { value: false, by: 'data-blocks-animationoff' }; if (!recShownAt(rec, w, browser && w === vw && rec ? rec.shown : null)) return { value: false, by: 'блок скрыт на этом экране' }; if (w < 1200) return { value: false, by: 'ширина < 1200: Tilda снимает появления' }; return { value: true, by: 'правило Tilda (ширина ≥ 1200)' }; };
  const appearStd = raw.standard.map((e) => {
    const A = e.attrs; const style = A.style; const def = APPEAR[style] || {};
    const duration = A.duration ? round(parseFloat(A.duration) * 1000) : (STD_DUR[e.role] || 1000);
    const dist = numOr(A.distance, 100), delay = A.delay ? round(parseFloat(A.delay) * 1000) : 0;
    const ev = !hasAnim || !e.cls ? { value: null } : e.cls.started ? { value: true, by: 'класс t-animate_started после прокрутки' } : !e.cls.animate ? { value: false, by: 'класс t-animate снят' } : { value: null };
    const recE = recById.get(e.rec); const d = recE && !recShownAt(recE, vw, browser ? recE.shown : null) ? { plays: false, playsBy: 'блок скрыт на этом экране' } : decide(stdRule(e, vw), ev);
    return { rec: e.rec, code: (recById.get(e.rec) || {}).code || null, sig: e.sig, role: e.role, text: e.text, style, words: def.words || (/word|line/.test(style || '') ? 'по словам/строкам' : style), duration, delay, distance: dist, scale: numOr(A.scale, def.sc || null),
      chain: A.chain === 'yes', group: A.group === 'yes', triggerOffset: numOr(A['trigger-offset'], 0), easing: STD_EASE, computed: e.computed, ...d,
      screens: screensWord(stdRule(e, WIDE.vw).value, stdRule(e, NARROW.vw).value) };
  });

  /* 2. Zero Block: появления, SBS, параллакс, мышь, фиксация */
  /* артборд окна (T1093: data-popup-rec-ids, или внутри .t-popup) на странице скрыт, пока окно закрыто, — его движение
     играет в открытом окне: видимость — по классам экрана, а не по факту */
  const abShown = (ab, w) => (ab.popup ? recShownAt(ab.rec, w) : w === vw ? ab.shown !== false : recShownAt(ab.rec, w));
  const zeroRule = (e, w) => { if (animOff) return { value: false, by: 'data-blocks-animationoff' }; const a = e.ab.at(w); if (!abShown(e.ab, w)) return { value: false, by: 'артборд скрыт на этом экране' }; if (w < 1200 && !e.mobileY) return { value: false, by: 'ширина < 1200 без data-animate-mobile=y' }; return { value: true, by: `правило Tilda (брейкпоинт ${a.res})` }; };
  const gatedRule = (e, w, name) => { const a = e.ab.at(w); if (!abShown(e.ab, w)) return { value: false, by: 'артборд скрыт на этом экране' }; const v = attrAt(e.an, name, a.res, e.ab.screens, { gated: true, mobileY: e.mobileY }); if (v === '') return { value: false, by: `брейкпоинт ${a.res} < 1200 без data-animate-mobile=y` }; if (v == null) return { value: false, by: 'атрибута нет' }; return { value: true, by: `правило Tilda (брейкпоинт ${a.res})`, v }; };
  const appearZero = [], sbs = [], prx = [], mouse = [], fix = [];
  const CUT = { value: false, by: 'обрезан артбордом — на этом экране не виден' };
  /* скрытый на этом экране артборд (t-screenmin/max) — не играет, даже если скрипт Tilda обработал элемент (обёртка SBS есть и у скрытых) */
  const mark = (e, d) => (e.ab.popup && d.plays ? { ...d, playsBy: `${d.playsBy}; в окне — когда окно открыто`, where: 'окно' } : d);
  const off = (e) => (!abShown(e.ab, vw) ? { plays: false, playsBy: 'артборд скрыт на этом экране' } : e.clipped ? { plays: false, playsBy: CUT.by } : null);
  for (const e of elems) {
    if (e.service) continue;
    const A = (n) => attrAt(e.an, n, e.res, e.ab.screens);
    const style = A('style');
    if (style) {
      const def = APPEAR[style] || {};
      const ev = !hasAnim || !e.state ? { value: null } : e.state.started ? { value: true, by: 'класс t-animate_started после прокрутки' } : !e.state.animate ? { value: false, by: 'класс t-animate снят' } : { value: null };
      const d = mark(e, off(e) || decide(zeroRule(e, vw), ev));
      appearZero.push({ key: e.key, type: e.type, text: e.text, style, words: def.words || style, duration: A('duration') ? round(parseFloat(A('duration')) * 1000) : 1000, delay: A('delay') ? round(parseFloat(A('delay')) * 1000) : 0,
        distance: numOr(A('distance'), 100), distanceScreen: round(numOr(A('distance'), 100) * (e.zoom || 1), 1), zoom: e.zoom || 1, scale: numOr(A('scale'), def.sc || null), triggerOffset: numOr(A('trigger-offset'), 0), mobileY: e.mobileY, easing: STD_EASE, ...d,
        screens: screensWord(zeroRule(e, WIDE.vw).value, zeroRule(e, NARROW.vw).value) });
    }
    if (e.an['sbs-event']) {
      const event = e.an['sbs-event'].base; const rule = gatedRule(e, vw, 'sbs-opts');
      const opts = rule.v || e.an['sbs-opts'] && e.an['sbs-opts'].base; const rawSteps = parseSbsOpts(opts);
      const scroll = event === 'scroll'; const steps = sbsSteps(rawSteps, { scroll, zoom: e.zoom || 1 });
      const ev = !hasSbs || !e.state ? { value: null } : { value: !!e.state.sbsWrapper, by: e.state.sbsWrapper ? 'обёртка SBS создана скриптом' : 'обёртки SBS нет — скрипт выключил' };
      const d = mark(e, off(e) || decide(rule.value ? { value: true, by: rule.by } : rule, ev));
      const trgels = String(A('sbs-trgels') || '').split(',').map((x) => x.trim()).filter(Boolean);
      sbs.push({ key: e.key, type: e.type, text: e.text, event, trg: numOr(A('sbs-trg'), 1), trgofst: numOr(A('sbs-trgofst'), 0), loop: A('sbs-loop') || '', trgels: trgels.map((id) => { const t = byKey.get(`${e.recid}:${id}`); return { id, key: `${e.recid}:${id}`, type: t ? t.type : null, text: t ? t.text : null, hrefs: t ? t.hrefs : [] }; }),
        steps, parsed: !!rawSteps, zoom: e.ab.now.zoom, mobileY: e.mobileY, h: e.hNow, ...d, screens: screensWord(gatedRule(e, WIDE.vw, 'sbs-opts').value, gatedRule(e, NARROW.vw, 'sbs-opts').value) });
    }
    const pk = e.an.prx ? e.an.prx.base : null;
    if (pk === 'scroll') {
      const rule = gatedRule(e, vw, 'prx-s'); const s = rule.v != null ? rule.v : null; const info = prxInfo(rule.value ? s : null, e.hNow, vh);
      const ev = !hasExt || !e.state ? { value: null } : e.state.prxSpeed != null ? { value: true, by: `data-parallax-speed ${e.state.prxSpeed}` } : e.an['prx-s'] ? { value: false, by: 'скорость не выставлена скриптом' } : { value: null };
      const moves = info.moves; const d = mark(e, off(e) || decide(moves ? { value: true, by: rule.by } : { value: false, by: rule.value ? 'без prx-s не двигается' : rule.by }, ev));
      prx.push({ key: e.key, type: e.type, text: e.text, s: e.an['prx-s'] ? e.an['prx-s'].base : null, ...info, h: e.hNow ? round(e.hNow) : null, vh, zoom: e.zoom || 1, mobileY: e.mobileY, ...d,
        screens: screensWord(prxInfo(gatedRule(e, WIDE.vw, 'prx-s').v, 1, 1).moves, prxInfo(gatedRule(e, NARROW.vw, 'prx-s').v, 1, 1).moves) });
    } else if (pk === 'mouse') {
      const rule = gatedRule(e, vw, 'prx-dx'); const dx = numOr(rule.v, 0), dy = numOr(attrAt(e.an, 'prx-dy', e.res, e.ab.screens, { gated: true, mobileY: e.mobileY }), 0);
      const r2 = touch && vw < 1200 ? { value: false, by: 'сенсорный экран < 1200: реакция на мышь выключена' } : rule;
      const ev = !hasExt || !e.state ? { value: null } : e.state.prxProcessed ? { value: true, by: 'обработан скриптом' } : { value: null };
      mouse.push({ key: e.key, type: e.type, text: e.text, dx, dy, mobileY: e.mobileY, ...(off(e) || decide(r2, ev)), screens: screensWord(gatedRule(e, WIDE.vw, 'prx-dx').value, false) });
    }
    if (e.an.fix) {
      const rule = gatedRule(e, vw, 'fix');
      const ev = !hasExt || !e.state ? { value: null } : e.state.fixProcessed ? { value: true, by: 'обработан скриптом' } : { value: null };
      fix.push({ key: e.key, type: e.type, text: e.text, trigger: numOr(rule.v, 0), dist: round(numOr(attrAt(e.an, 'fix-dist', e.res, e.ab.screens), 0) * e.ab.now.zoom), trgofst: numOr(attrAt(e.an, 'fix-trgofst', e.res, e.ab.screens), 0), ...(off(e) || decide(rule, ev)), screens: screensWord(gatedRule(e, WIDE.vw, 'fix').value, gatedRule(e, NARROW.vw, 'fix').value) });
    }
  }

  /* 3. хуки: ссылка → окно или меню */
  const hooks = raw.hooks.links.filter((l) => !/^#close/.test(l.href)).map((l) => {
    const t = raw.hooks.targets.find((x) => x.hook === l.href);
    return { href: l.href, text: l.text, from: l.key || l.rec, target: t ? { rec: t.rec, code: t.code, anim: t.anim, timeout: t.timeout ? round(parseFloat(t.timeout) * 1000) : null, popupRecs: t.popupRecs } : null, kind: l.href === '#menuopen' ? 'меню' : 'окно' };
  });
  const uniqHooks = []; for (const x of hooks) { const u = uniqHooks.find((y) => y.href === x.href); if (u) u.count++; else uniqHooks.push({ ...x, count: 1 }); }
  const orphanTargets = raw.hooks.targets.filter((t) => !raw.hooks.links.some((l) => l.href === t.hook)).map((t) => t.hook);

  /* 4. блоки */
  const blocks = raw.records.map((r) => ({ ...r, service: SERVICE_BLOCKS[r.code] || null, shownNow: recShownAt(r, vw, browser ? r.shown : null) }));
  const service = { placeholders: elems.filter((e) => e.placeholder).map((e) => `${e.key}${e.clipped ? ' (обрезана артбордом)' : ''}`), clipped: elems.filter((e) => e.clipped && !e.placeholder).length, madeOnTilda: !!P.madeOnTilda, blocks: blocks.filter((b) => b.service).map((b) => `${b.code} ${b.id}`) };

  const snap = {
    tilda: true, url: raw.url, source: browser ? 'браузер' : 'голый HTML', viewport: viewport || (browser ? null : `${vw}×${vh} (по правилам)`), vw, vh, touch,
    platform: { pageId: P.pageId, projectId: P.projectId, alias: P.alias, lazy: !!P.lazy, animationOff: animOff, mobileY: P.mobileY || 0, scripts: P.scripts || [], fonts: P.fonts, madeOnTilda: !!P.madeOnTilda, madeOn: P.madeOn || [], tnPresent: !!P.tnPresent,
      appearNow: animOff ? 'нет (data-blocks-animationoff)' : vw < 1200 ? 'только Zero с data-animate-mobile=y' : 'все',
      scripted: { animation: hasAnim, sbs: hasSbs, ext: hasExt } },
    blocks, appear: { standard: appearStd, zero: appearZero },
    zero: { artboards: [...abs.values()].map((a) => ({ recid: a.recid, code: a.code, screens: a.screens, res: a.now.res, upscale: a.now.upscale, zoomCalc: a.now.zoom, zoomMeasured: a.shown ? a.zoomMeasured : null, tnScale: a.tnScale, height: a.now.height, heights: a.heights, pos: a.now.pos, overflow: a.overflow, shown: a.shown, elements: a.elements, byType: a.byType, rect: a.rect })),
      elements: elems.length, groups: raw.widgets.groups || 0 },
    elems: elems.map((e) => ({ key: e.key, type: e.type, text: e.text, res: e.res, zoom: e.zoom, font: e.font, fontScreen: e.fontScreen, clipped: e.clipped, service: e.service, rect: e.rect,
      now: { left: numOr(e.field('left')), top: numOr(e.field('top')), width: numOr(e.field('width')), height: numOr(e.field('height')), fontsize: numOr(e.field('fontsize')), container: e.field('container'), axisx: e.field('axisx'), axisy: e.field('axisy') } })),
    sbs, prx, mouse, fix, hooks: uniqHooks, orphanTargets, widgets: raw.widgets, lazy: raw.lazy, service, notes,
  };
  snap.motion = tildaMotion(snap);
  snap.counts = { blocks: blocks.length, appearStd: appearStd.length, appearStdPlays: appearStd.filter((x) => x.plays).length, appearZero: appearZero.length, appearZeroPlays: appearZero.filter((x) => x.plays).length,
    sbs: sbs.length, sbsPlays: sbs.filter((x) => x.plays).length, sbsByEvent: sbs.reduce((o, x) => { o[x.event] = (o[x.event] || 0) + 1; return o; }, {}), prx: prx.length, prxMoves: prx.filter((x) => x.moves).length,
    mouse: mouse.length, fix: fix.length, artboards: abs.size, elements: elems.length, hooks: uniqHooks.length, motion: snap.motion.length, motionPlays: snap.motion.filter((m) => m.plays).length };
  return snap;
}

/* ---------- движение в схеме motion.json ---------- */
/* селектор по ключу recid:elemid (группа — recid:g<data-group-id>) */
const selOf = (key) => { const [rec, id] = String(key).split(':'); return /^g\d/.test(id) ? `#rec${rec} [data-group-id="${id.slice(1)}"]` : `#rec${rec} [data-elem-id="${id}"]`; };
function appearProps(style, dist, scale) {
  const d = APPEAR[style] || {}; const p = [{ prop: NAMES.op, from: '0', to: '1' }];
  if (d.ty) p.push({ prop: NAMES.ty, from: `${d.ty * dist} px`, to: '0 px' });
  if (d.tx) p.push({ prop: NAMES.tx, from: `${d.tx * dist} px`, to: '0 px' });
  if (d.sc) p.push({ prop: NAMES.sc, from: String(scale || d.sc), to: '1' });
  if (d.blur) p.push({ prop: NAMES.blur, from: `${d.blur} px`, to: '0 px' });
  return p;
}
function stepsProps(steps) {
  const ch = changed(steps); if (!steps.length) return [];
  const last = steps[steps.length - 1], first = steps[0];
  return ch.map((k) => {
    let to = val(last, k);
    if (Math.abs(to - val(first, k)) < 1e-6) { let best = to; for (const s of steps) if (Math.abs(val(s, k) - val(first, k)) > Math.abs(best - val(first, k))) best = val(s, k); to = best; }
    return { prop: NAMES[k], from: fmtV(k, val(first, k)), to: fmtV(k, to) };
  });
}
/** Карта (interpret) → пункты движения в схеме motion.json: source «атрибуты Tilda», confidence «точно», plays. */
export function tildaMotion(snap) {
  const items = []; const vh = snap.vh || WIDE.vh;
  const base = (x) => ({ source: 'атрибуты Tilda', confidence: 'точно', plays: x.plays, playsBy: x.playsBy, screens: x.screens, ...(x.where ? { where: x.where } : {}), ...(x.mismatch ? { mismatch: x.mismatch } : {}) });
  /* появления стандартных блоков — группами: блок, вид, длительность, задержка, chain */
  const groups = new Map();
  for (const a of snap.appear.standard) {
    const k = [a.rec, a.style, a.duration, a.delay, a.distance, a.chain, a.group, a.plays].join('|');
    if (!groups.has(k)) groups.set(k, { a, members: [] }); groups.get(k).members.push(a);
  }
  for (const { a, members } of groups.values()) {
    items.push({ kind: 'reveal', sub: a.chain ? 'по очереди' : a.group ? 'группой' : undefined, trigger: 'scroll', props: appearProps(a.style, a.distance, a.scale),
      scroll: { at: `верх элемента входит в окно снизу${a.triggerOffset ? ` − ${a.triggerOffset} px` : ''}`, atPct: round(100 - a.triggerOffset / vh * 100) },
      timing: { duration: a.duration, easing: a.easing, delay: a.delay, ...(a.chain ? { stagger: CHAIN_STEP, note: `+${CHAIN_STEP} мс на ряд` } : {}) },
      recipe: a.chain ? 'reveal-stagger' : 'reveal', count: members.length, examples: members.slice(0, 3).map((m) => m.sig), target: members[0].sig, rec: a.rec, block: a.code, text: a.text, style: a.style, ...base(a) });
  }
  /* появления Zero Block — группами: артборд, вид, длительность, сдвиг, масштаб, точка; задержки донора — списком как есть */
  const zg = new Map();
  for (const a of snap.appear.zero) {
    const rec = a.key.split(':')[0];
    const k = [rec, a.style, a.duration, a.distanceScreen, a.scale, a.triggerOffset, a.plays].join('|');
    if (!zg.has(k)) zg.set(k, { a, members: [] }); zg.get(k).members.push(a);
  }
  for (const { a, members } of zg.values()) {
    const delays = [...new Set(members.map((m) => m.delay))].sort((x, y) => x - y);
    items.push({ kind: 'reveal', trigger: 'scroll', props: appearProps(a.style, a.distanceScreen, a.scale), scroll: { at: `верх элемента входит в окно снизу${a.triggerOffset ? ` − ${a.triggerOffset} px` : ''}`, atPct: round(100 - a.triggerOffset / vh * 100) },
      timing: { duration: a.duration, easing: a.easing, delay: delays[0], ...(delays.length > 1 ? { delays, note: `задержки донора как есть: ${delays.join(' / ')} мс` } : {}) },
      recipe: 'reveal', count: members.length, examples: members.slice(0, 3).map((m) => selOf(m.key)), target: selOf(a.key), key: a.key, keys: members.map((m) => m.key), text: a.text, style: a.style, ...base(a) });
  }
  /* пошаговая анимация */
  for (const s of snap.sbs) {
    const scroll = s.event === 'scroll'; const loop = /loop/.test(s.loop);
    const steps = s.steps; const props = stepsProps(steps); const sub = sbsSub(steps, loop);
    const words = sbsWords(steps, { scroll, loop: s.loop });
    const common = { key: s.key, target: selOf(s.key), wrapper: `sbs-${s.key.replace(':', '-')}`, text: s.text, steps, words, count: 1, examples: [selOf(s.key)], ...base(s) };
    if (!s.parsed) { items.push({ kind: 'reveal', trigger: 'scroll', props: [], timing: {}, recipe: 'keyframes', note: 'sbs-opts не разобрать', ...common }); continue; }
    if (scroll) {
      const range = round(steps.reduce((a, x, i) => a + (i ? x.d || 0 : 0), 0), 1);
      const startPct = round(s.trg * 100 + s.trgofst / vh * 100), endPct = round(startPct - range / vh * 100);
      /* коэффициент (px сдвига на px прокрутки) — только у одного отрезка: у многошагового он свой на каждом шаге (steps) */
      const move = changed(steps).filter((k) => k === 'tx' || k === 'ty');
      const coef = move.length === 1 && range && steps.length === 2 ? round((val(steps[steps.length - 1], move[0]) - val(steps[0], move[0])) / range, 3) : null;
      items.push({ kind: 'scroll-linked', sub: move.length === 1 && move[0] === 'tx' && changed(steps).length === 1 ? 'лента вбок' : undefined, trigger: 'scroll', props,
        scroll: { from: `верх элемента на ${startPct}% экрана (trg ${s.trg}${s.trgofst ? `, смещение ${s.trgofst} px` : ''})`, to: `на ${endPct}%`, rangePx: range, coefficient: coef, startPct, endPct }, timing: {},
        recipe: steps.some((x) => x.fix) ? 'pin' : 'scroll-scrub', ...common });
      continue;
    }
    const kf = sbsKeyframes(steps);
    const easing = (steps.find((x, i) => i && x.ease !== 'linear' && x.t) || {}).ease || 'linear';
    const timing = { duration: kf.total, easing, ...(loop ? { iterations: 'infinite', direction: s.loop === 'loopwithreverse' ? 'alternate' : 'normal' } : {}) };
    if (s.event === 'hover') {
      const trg = s.trgels.length ? s.trgels : [{ key: s.key, type: s.type, text: s.text }];
      const t0 = trg[0]; const comp = t0.type === 'button' || (t0.hrefs && t0.hrefs.length) ? 'button' : t0.type === 'image' ? 'card' : t0.type === 'text' ? 'link' : '';
      items.push({ kind: 'hover', sub: changed(steps).some((k) => k === 'rot' || k === 'tx' || k === 'ty' || k === 'sc' || k === 'sx' || k === 'sy') ? 'сдвиг/масштаб' : changed(steps).includes('op') ? 'прозрачность' : 'цвет', trigger: 'hover', component: comp, props, timing, keyframes: kf.frames,
        hover: { trigger: trg.map((x) => x.key), reverse: s.loop !== 'noreverse' }, recipe: 'hover', ...common });
      continue;
    }
    if (s.event === 'click') { items.push({ kind: 'click', sub: 'Tilda SBS', trigger: 'click', props, timing, keyframes: kf.frames, recipe: null, ...common }); continue; }
    const at = s.event === 'blockintoview' ? 'блок входит в окно' : `верх элемента на ${round(s.trg * 100)}% экрана${s.trgofst ? ` ${s.trgofst > 0 ? '+' : ''}${s.trgofst} px` : ''}`;
    if (loop) items.push({ kind: 'loop', sub, trigger: 'time', start: `при входе в экран (${s.event})`, props, timing: { ...timing, period: kf.total }, keyframes: kf.frames, scroll: { at }, recipe: 'loop', ...common });
    else items.push({ kind: 'reveal', sub: steps.length > 2 ? `${sub === 'мигание' ? 'мигание' : 'многошаговое'}, ${steps.length} шагов` : sub, trigger: 'scroll', props, timing, keyframes: kf.frames, scroll: { at, atPct: s.event === 'blockintoview' ? null : round(s.trg * 100) }, recipe: steps.length > 2 ? 'keyframes' : 'reveal', ...common });
  }
  /* параллакс, мышь, фиксация */
  for (const p of snap.prx) {
    if (!p.moves) continue;
    items.push({ kind: 'parallax', trigger: 'scroll', props: [{ prop: NAMES.ty, from: '0 px', to: `${-p.px} px` }], scroll: { rangePx: p.pass, coefficient: p.coefficient, note: `скорость ${p.speed} (prx-s ${p.s}) × 100 px за проход элемента через экран (${p.h || '?'} + ${p.vh} px)${p.zoom && Math.abs(p.zoom - 1) > 0.01 ? `; zoom артборда ${p.zoom} — на экране сдвиг, вероятно, × zoom: не сверено, проверить замером motion` : ''}` },
      timing: {}, recipe: 'parallax', key: p.key, target: selOf(p.key), text: p.text, count: 1, examples: [selOf(p.key)], coefs: [p.coefficient], ...base(p) });
  }
  for (const m of snap.mouse) items.push({ kind: 'mouse', sub: 'параллакс', trigger: 'mouse', props: [m.dx ? { prop: NAMES.tx, from: '0 px', to: `${m.dx} px` } : null, m.dy ? { prop: NAMES.ty, from: '0 px', to: `${m.dy} px` } : null].filter(Boolean), timing: {}, recipe: 'mouse-tilt', key: m.key, target: selOf(m.key), text: m.text, count: 1, examples: [selOf(m.key)], ...base(m) });
  for (const f of snap.fix) items.push({ kind: 'pinned', trigger: 'scroll', props: [], scroll: { from: `точка ${f.trigger} окна${f.trgofst ? ` + ${f.trgofst} px` : ''}`, rangePx: f.dist }, timing: {}, recipe: 'pin', key: f.key, target: selOf(f.key), text: f.text, count: 1, examples: [selOf(f.key)], ...base(f) });
  items.forEach((it, i) => { it.id = `t${String(i + 1).padStart(2, '0')}`; if (it.sub === undefined) delete it.sub; });
  return items;
}

/** Раскладка Zero Block по брейкпоинтам — числа донора (tilda-layout.json). */
export function tildaLayout(raw) {
  if (!raw || !raw.tilda) return null;
  const out = [];
  for (const a of raw.artboards) {
    const screens = screensOf(a); const g = groupRes(a.attrs);
    const heights = {}; for (const s of screens) heights[s] = numOr(attrAt(g, 'height', s, screens));
    /* заглушка «Zero Block» (не видна: обрезана артбордом или артборд высотой 0) — не в раскладке */
    const hidden = (e) => /^zero block$/i.test(e.text || '') && (e.clip != null && e.rect && e.rect.w > 0 ? e.clip < 0.05 : !(heights[screens[screens.length - 1]] > 1));
    const els = raw.elems.filter((e) => String(e.recid) === String(a.recid) && !hidden(e)).map((e) => {
      const f = groupRes(e.fields, '-value'); const byRes = {};
      for (const s of screens) { const v = (n) => attrAt(f, n, s, screens); byRes[s] = { left: numOr(v('left')), top: numOr(v('top')), width: numOr(v('width')), height: numOr(v('height')), fontsize: numOr(v('fontsize')), container: v('container'), axisx: v('axisx'), axisy: v('axisy'), leftunits: v('leftunits'), widthunits: v('widthunits') }; }
      return { key: e.key, type: e.type, text: e.text, byRes };
    });
    out.push({ recid: a.recid, screens, upscale: attrAt(g, 'upscale', screens[screens.length - 1], screens) || 'grid', heights, elements: els });
  }
  return { note: 'поля Zero Block по брейкпоинтам в единицах донора (px сетки брейкпоинта; при container=grid x = (ширина окна − ширина сетки)/2 + left). Не вёрстка для переноса — числа для сетки и ритма.', artboards: out };
}

/* ---------- вывод ---------- */
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\s+/g, ' ');
/** 10–15 строк о Tilda для discovery.md (discover, раунд Tilda) и для консоли. */
export function tildaSummary(snap) {
  if (!snap || !snap.tilda) return ['- не Tilda'];
  const P = snap.platform, c = snap.counts, L = [];
  const codes = snap.blocks.map((b) => b.code || '?');
  L.push(`- страница ${P.pageId || '—'}, проект ${P.projectId || '—'}; ленивая загрузка ${P.lazy ? 'да' : 'нет'}; появления выключены проектом: ${P.animationOff ? '**да** (data-blocks-animationoff)' : 'нет'}`);
  const t123 = codes.filter((x) => x === 'T123').length;
  L.push(`- блоки сверху вниз (${codes.length}): ${codes.slice(0, 40).join(' ')}${codes.length > 40 ? ' …' : ''}${t123 ? `; HTML-вставок T123: ${t123} — свой код (CSS/JS) дизайнера, смотреть отдельно` : ''}`);
  const ab = snap.zero.artboards;
  if (ab.length) {
    const scr = [...new Set(ab.map((a) => a.screens.join('/')))];
    const win = ab.filter((a) => a.upscale === 'window');
    L.push(`- Zero Block: артбордов ${ab.length}, элементов ${snap.zero.elements}; брейкпоинты ${scr.join(' | ')}; upscale=window у ${win.length}${win.length ? ` — zoom сейчас ${[...new Set(win.map((a) => a.zoomMeasured || a.zoomCalc))].join(', ')} (кегли и размеры на экране = computed × zoom)` : ''}`);
  }
  L.push(`- появления на этом экране (${snap.vw}px): ${P.appearNow}; стандартных ${c.appearStd} (играют ${c.appearStdPlays}), в Zero ${c.appearZero} (играют ${c.appearZeroPlays})`);
  if (c.sbs) L.push(`- пошаговая анимация (SBS): ${c.sbs} — ${Object.entries(c.sbsByEvent).map(([k, n]) => `${k} ${n}`).join(', ')}; играют ${c.sbsPlays}`);
  if (c.prx || c.mouse || c.fix) L.push(`- параллакс: ${c.prx} (двигаются ${c.prxMoves}: ${snap.prx.filter((p) => p.moves).map((p) => `скорость ${p.speed} → ${p.px} px за проход`).join('; ') || '—'}); мышь ${c.mouse}; фиксация ${c.fix}`);
  if (snap.hooks.length) L.push(`- хуки: ${snap.hooks.map((h) => `${h.href}${h.count > 1 ? ` ×${h.count}` : ''} → ${h.target ? `${h.target.code || '?'} ${h.target.rec}${h.target.anim ? ` (data-anim ${h.target.anim}${h.target.timeout ? `, timeout ${h.target.timeout} мс` : ''})` : ''}` : 'окно в разметке не найдено'}`).join('; ')}`);
  const W = snap.widgets; const menus = (W.menus || []).map((m) => `${m} (${MENUS[m.toLowerCase()] || 'меню'})`);
  L.push(`- меню: ${menus.join(', ') || 'стандартных нет'}${W.menuburger ? `, бургеров ${W.menuburger}` : ''}; окна ${W.popups || 0}; слайдеры ${W.sliders || 0}; магазин ${W.store ? 'да' : 'нет'}; формы ${W.forms || 0}${W.marquee ? '; бегущая строка T1003' : ''}${W.typing ? '; печать T635' : ''}${W.accordions ? `; аккордеоны ${W.accordions}` : ''}`);
  const lz = snap.lazy; L.push(`- ленивые (Tilda data-original): ${lz.dataOriginal}, фонов .t-bgimg ${lz.bgimg}${lz.before ? ` — загружено до прокрутки ${lz.before.bgLoaded}/${lz.before.bg}, после ${lz.after.bgLoaded}/${lz.after.bg}` : ''}; заглушек /-/resize/20x/ сейчас ${lz.placeholders}`);
  const f = P.fonts || {}; L.push(`- шрифты проекта: ${f.headline || f.text ? `заголовки ${f.headline || '—'}, текст ${f.text || '—'}` : '—'}; ${f.loaded && f.loaded.length ? `загружены ${f.loaded.join(', ')}` : f.links && f.links.length ? `подключены ${f.links.join(', ')}` : 'загруженные не известны'}${f.byStyle && Object.keys(f.byStyle).length ? `; по стилям текста ${Object.entries(f.byStyle).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ')}` : ''}`);
  const sv = snap.service; L.push(`- служебное Tilda (не язык донора): ${[sv.madeOnTilda ? 'плашка Made on Tilda' : null, sv.placeholders.length ? `заглушки «Zero Block» ×${sv.placeholders.length}` : null, sv.clipped ? `обрезано артбордом ${sv.clipped}` : null, ...sv.blocks].filter(Boolean).join(', ') || 'нет'}`);
  return L;
}

function mdSnap(snap, { title }) {
  const L = [`# Tilda: ${title}`, '', `Снято: ${snap.source}${snap.viewport ? `, ${snap.viewport}` : ''} · ширина ${snap.vw}, высота окна ${snap.vh}. Числа — из атрибутов Tilda; «играет» — ${snap.source === 'браузер' ? 'по классам после прокрутки, где скрипты Tilda есть, иначе по правилам' : 'по правилам Tilda'}.`, '', '## Коротко', '', ...tildaSummary(snap), ''];
  const P = snap.platform;
  L.push('## Платформа', '', `- скрипты Tilda: ${P.scripts.join(', ') || '—'}`, `- плашка «Made on Tilda»: ${P.madeOn.length ? P.madeOn.map((m) => `${m.sel}${m.visible === null ? '' : m.visible ? ' видна' : ' скрыта'}`).join(', ') : 'нет'} — **не язык донора**`, `- элементов с data-animate-mobile="y": ${P.mobileY}`, '');
  L.push('## Блоки', '', '| # | rec | код | экраны | появление | показан | верх | высота | заголовок | зона |', '|---|---|---|---|---|---|---|---|---|---|');
  snap.blocks.forEach((r, i) => L.push(`| ${i + 1} | ${r.id} | ${r.code || '?'}${r.service ? ` (${r.service})` : ''} | ${r.screens.join(' ') || 'все'} | ${r.appear} | ${r.shownNow ? 'да' : 'нет'} | ${r.top ?? '—'} | ${r.h ?? '—'} | ${cell(r.head)} | ${r.zone} |`));
  const st = snap.appear.standard;
  L.push('', `## Появления стандартных блоков: ${st.length} (играют на этом экране: ${st.filter((x) => x.plays).length})`, '');
  if (!st.length) L.push('- нет');
  st.slice(0, 40).forEach((a) => L.push(`- ${a.code || '?'} ${a.rec} \`${a.sig}\` «${cell(a.text)}»: ${a.style} (${a.words}), ${a.duration} мс${a.delay ? `, задержка ${a.delay} мс` : ''}${/up|down|left|right/.test(a.style || '') ? `, сдвиг ${a.distance} px` : ''}${a.chain ? `, по очереди +${CHAIN_STEP} мс на ряд` : ''}${a.group ? ', группой' : ''}, ${a.easing} — ${a.plays ? '**играет**' : 'не играет'} (${a.playsBy}); экраны: ${a.screens}${a.mismatch ? `; ${a.mismatch}` : ''}`));
  if (st.length > 40) L.push(`- … и ещё ${st.length - 40}`);
  L.push('', `## Zero Block: артбордов ${snap.zero.artboards.length}, элементов ${snap.zero.elements}`, '');
  for (const a of snap.zero.artboards) L.push(`- ab ${a.recid}: брейкпоинты ${a.screens.join('/')}, сейчас ${a.res}; upscale ${a.upscale}${a.upscale === 'window' ? ` → zoom ${a.zoomMeasured || a.zoomCalc}${a.zoomMeasured && Math.abs(a.zoomMeasured - a.zoomCalc) > 0.01 ? ` (по формуле ${a.zoomCalc})` : ''}` : ''}; высота ${a.height ?? '—'} (${Object.entries(a.heights).map(([k, v]) => `${k}: ${v ?? '—'}`).join(', ')})${a.pos ? `, pos ${a.pos}` : ''}${a.overflow ? `, overflow ${a.overflow}` : ''}; ${a.shown ? 'показан' : 'скрыт'}; элементов ${a.elements} ${JSON.stringify(a.byType)}`);
  if (snap.service.placeholders.length) L.push(`- заглушки «Zero Block»: ${snap.service.placeholders.join(', ')} — не язык донора`);
  const big = snap.elems.filter((e) => !e.service && !e.clipped && e.type === 'text' && e.fontScreen).sort((a, b) => b.fontScreen - a.fontScreen).slice(0, 8);
  if (big.length) L.push('', 'Крупные тексты Zero Block (кегль на экране = computed × zoom):', '', ...big.map((e) => `- ${e.key} «${cell(e.text).slice(0, 40)}»: ${e.font && e.font.size ? `${e.font.size}px × ${e.zoom} = ` : ''}**${e.fontScreen}px**${e.font ? ` ${e.font.family} ${e.font.weight}` : ''}; поля сейчас: left ${e.now.left}, top ${e.now.top}, width ${e.now.width}, кегль ${e.now.fontsize ?? '—'}, container ${e.now.container || '—'}`));
  const az = snap.appear.zero;
  L.push('', `### Появления в Zero Block: ${az.length} (играют: ${az.filter((x) => x.plays).length})`, '');
  az.slice(0, 40).forEach((a) => L.push(`- ${a.key} ${a.type} «${cell(a.text).slice(0, 30)}»: ${a.style} (${a.words}), ${a.duration} мс${a.delay ? `, задержка ${a.delay} мс` : ''}${/up|down|left|right/.test(a.style) ? `, сдвиг ${a.distance} px` : ''}${a.scale && /zoom/.test(a.style) ? `, масштаб ${a.scale}` : ''}${a.triggerOffset ? `, срабатывание −${a.triggerOffset} px` : ''} — ${a.plays ? '**играет**' : 'не играет'} (${a.playsBy}); экраны: ${a.screens}`));
  if (az.length > 40) L.push(`- … и ещё ${az.length - 40}`);
  L.push('', `### Пошаговая анимация (SBS): ${snap.sbs.length}`, '');
  for (const s of snap.sbs.slice(0, 60)) L.push(`- ${s.key} ${s.type} «${cell(s.text).slice(0, 30)}»: ${s.event}${s.trgels.length ? ` (триггер ${s.trgels.map((t) => `${t.key}${t.type ? ` ${t.type}` : ''}${t.text ? ` «${cell(t.text).slice(0, 20)}»` : ''}`).join(', ')})` : ''}, точка ${s.trg}${s.trgofst ? ` ${s.trgofst > 0 ? '+' : ''}${s.trgofst} px` : ''} — ${sbsSub(s.steps, /loop/.test(s.loop))}: ${sbsWords(s.steps, { scroll: s.event === 'scroll', loop: s.loop })} — ${s.plays ? '**играет**' : 'не играет'} (${s.playsBy}); экраны: ${s.screens}`);
  if (snap.sbs.length > 60) L.push(`- … и ещё ${snap.sbs.length - 60}`);
  L.push('', `### Параллакс: ${snap.prx.length}; мышь: ${snap.mouse.length}; фиксация: ${snap.fix.length}`, '');
  for (const p of snap.prx) L.push(`- ${p.key} ${p.type} «${cell(p.text).slice(0, 30)}»: prx-s ${p.s ?? '—'} → ${p.moves ? `скорость ${p.speed}, ${p.px} px за проход (${p.h ?? '?'} + ${p.vh} px), коэффициент ${p.coefficient ?? '—'}` : 'не двигается (без prx-s)'} — ${p.plays ? 'играет' : 'не играет'} (${p.playsBy})`);
  for (const m of snap.mouse) L.push(`- мышь ${m.key}: dx ${m.dx}, dy ${m.dy} — ${m.plays ? 'играет' : 'не играет'} (${m.playsBy})`);
  for (const f of snap.fix) L.push(`- фиксация ${m2(f)}`);
  L.push('', '## Хуки: окна и меню', '', ...(snap.hooks.length ? snap.hooks.map((h) => `- \`${h.href}\`${h.count > 1 ? ` ×${h.count}` : ''} (${h.kind}, ссылка в ${h.from || '—'}) → ${h.target ? `${h.target.code || '?'} ${h.target.rec}${h.target.anim ? `, data-anim ${h.target.anim}${h.target.timeout ? `, data-anim-timeout ${h.target.timeout} мс (длительность окна — сверить замером по клику)` : ''}` : ''}${h.target.popupRecs ? `, содержимое rec${h.target.popupRecs}` : ''}` : '**окно в разметке не найдено**'}`) : ['- нет']));
  if (snap.orphanTargets.length) L.push(`- окна без ссылки на странице: ${snap.orphanTargets.join(', ')}`);
  L.push('', '## Виджеты', '', `- ${Object.entries(snap.widgets).filter(([, v]) => (Array.isArray(v) ? v.length : v)).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join('/') : v}`).join(', ') || '—'}`);
  const lz = snap.lazy;
  L.push('', '## Ленивая загрузка', '', `- data-original ${lz.dataOriginal}, .t-bgimg ${lz.bgimg} (загружено ${lz.bgimgLoaded}), заглушек сейчас ${lz.placeholders}`);
  if (lz.before) L.push(`- до прокрутки: появлений запущено ${lz.before.started}/${lz.before.animate}, фонов загружено ${lz.before.bgLoaded}/${lz.before.bg}, заглушек ${lz.before.placeholders}; после: ${lz.after.started}/${lz.after.animate}, ${lz.after.bgLoaded}/${lz.after.bg}, заглушек ${lz.after.placeholders}`);
  L.push('', `## Движение (tilda-motion): ${snap.motion.length}, играет на этом экране ${snap.motion.filter((m) => m.plays).length}`, '', '| id | вид | где | что | когда | играет | рецепт |', '|---|---|---|---|---|---|---|');
  for (const m of snap.motion) {
    const what = m.words || m.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ');
    const when = m.scroll ? (m.scroll.from ? `${m.scroll.from} → ${m.scroll.to || ''}${m.scroll.rangePx ? `, ${m.scroll.rangePx} px` : ''}` : m.scroll.at || m.scroll.note || '') : m.kind === 'hover' ? 'наведение' : '';
    L.push(`| ${m.id} | ${m.kind}${m.sub ? ` (${m.sub})` : ''} | \`${cell(m.target)}\`${m.count > 1 ? ` ×${m.count}` : ''} | ${cell(what).slice(0, 160)}${m.timing && m.timing.duration ? `; ${m.timing.duration} мс ${m.timing.easing || ''}` : ''}${m.timing && m.timing.delays ? `; задержки ${m.timing.delays.join('/')}` : m.timing && m.timing.delay ? `; задержка ${m.timing.delay}` : ''} | ${cell(when)} | ${m.plays ? 'да' : 'нет'} (${cell(m.playsBy)}); ${m.screens} | \`${m.recipe || '—'}\` |`);
  }
  if (!snap.motion.length) L.push('| — | движения в атрибутах нет | | | | | |');
  L.push('', 'Переносить то, что **играет у донора на этом экране** (поле plays). Появления, которые Tilda выключает на телефоне, у нас на телефоне не делать (reference/donor-tilda.md).');
  return L.join('\n') + '\n';
}
const m2 = (f) => `${f.key}: точка ${f.trigger}${f.trgofst ? ` + ${f.trgofst} px` : ''}, отрезок ${f.dist} px — ${f.plays ? 'играет' : 'не играет'} (${f.playsBy})`;

/* =====================================================================
   Браузерный проход
   ===================================================================== */
/**
 * Снимок Tilda с открытой вкладки: { tilda: false } — не Tilda; иначе карта interpret() + raw (сырьё).
 * scroll: true — сначала пройти страницу до низа (появления, ленивое), как CLI; вкладка, уже прокрученная
 * вызывающим (discover, motion), — scroll: false.
 */
export async function tildaSnapshot(page, { scroll = true, viewport = null } = {}) {
  const before = await evaluateWith(page, lazyCountsInPage, null, DEPS).catch(() => null);
  if (scroll) { await forceInstantScroll(page); await scrollThrough(page, { pause: 350 }); await sleep(800); }
  const raw = await evaluateWith(page, tildaRawInPage, null, DEPS);
  if (!raw.tilda) return { tilda: false, url: raw.url };
  if (before) raw.lazy.before = before;
  if (scroll) raw.lazy.after = await evaluateWith(page, lazyCountsInPage, null, DEPS).catch(() => null);
  const snap = interpret(raw, { viewport });
  snap.raw = raw;
  return snap;
}

async function runBrowser(url, { out, viewports, pages, noScroll }) {
  const dir = ensureDir(path.join(out, 'tilda'));
  const targets = pages.length ? pages : [{ name: null, url }];
  const br = await launch(); const done = []; let layoutWritten = false;
  try {
    for (const t of targets) {
      for (const [vpName, vp] of viewports) {
        const tag = [t.name, vpName].filter(Boolean).join('-');
        const t0 = Date.now();
        const page = await openPage(br, t.url, vp, { settle: 3000 });
        try {
          const snap = await tildaSnapshot(page, { scroll: !noScroll, viewport: `${vpName} ${vp.width}×${vp.height}` });
          if (!snap.tilda) { console.log(`не Tilda: ${t.url} — нет #allrecords с data-tilda-page-id, блоков .t-rec и t_onReady`); done.push({ tag, tilda: false }); continue; }
          const { raw, ...rest } = snap;
          writeJson(path.join(dir, `tilda-${tag}.json`), { url: t.url, type: t.name, takenAt: new Date().toISOString(), ms: Date.now() - t0, ...rest });
          fs.writeFileSync(path.join(dir, `tilda-${tag}.md`), mdSnap(snap, { title: `${t.url} (${vpName} ${vp.width}×${vp.height})` }));
          writeJson(path.join(dir, `tilda-motion-${tag}.json`), { url: t.url, viewport: vpName, size: `${vp.width}×${vp.height}`, takenAt: new Date().toISOString(), source: 'атрибуты Tilda (tilda.mjs)', items: snap.motion, notes: [`появления на этом экране: ${snap.platform.appearNow}`, 'поле plays — играет ли у донора на этом экране; переносить только то, что играет'] });
          if (!layoutWritten) { writeJson(path.join(dir, 'tilda-layout.json'), { url: t.url, ...tildaLayout(raw) }); layoutWritten = true; }
          const c = snap.counts;
          console.log(`ок ${tag}: блоков ${c.blocks}, появлений ${c.appearStd}+${c.appearZero} (играют ${c.appearStdPlays}+${c.appearZeroPlays}), SBS ${c.sbs} (играют ${c.sbsPlays}), параллакс ${c.prx}, артбордов ${c.artboards}, движения ${c.motion} (играет ${c.motionPlays}) — ${Math.round((Date.now() - t0) / 1000)} с`);
          done.push({ tag, tilda: true, snap });
        } finally { await page.close().catch(() => {}); }
      }
    }
  } finally { await br.close().catch(() => {}); }
  const first = done.find((d) => d.tilda);
  if (first) { console.log(''); for (const l of tildaSummary(first.snap)) console.log(l); }
  console.log(`\nФайлы: ${dir}`);
  return done;
}

/* =====================================================================
   Типы страниц по подписи блоков (без браузера)
   ===================================================================== */
/** Подпись страницы: коды блоков по порядку без T123 (HTML-вставки). */
export const signatureOf = (html) => staticRecords(html).map((r) => r.code || (r.type ? `?${r.type}` : '?')).filter((c) => c !== 'T123');
const overlap = (a, b) => { const m = new Map(); for (const c of a) m.set(c, (m.get(c) || 0) + 1); let k = 0; for (const c of b) { const n = m.get(c) || 0; if (n) { k++; m.set(c, n - 1); } } return k / Math.max(1, a.length, b.length); };
/**
 * Группы страниц по подписи: доля общих кодов ≥ 0.8 и одинаковые первые три кода. pages: [{ path, codes }] →
 * [{ name, count, example, examples, signature, paths }]. Имя: home для «/»; первый сегмент адреса, общий у всех
 * страниц группы (пути из 2+ частей: /news/…) — он; иначе tpl2, tpl3…
 */
export function groupSignatures(pages) {
  const groups = [];
  for (const p of pages) {
    const g = groups.find((x) => x.codes.slice(0, 3).join(' ') === p.codes.slice(0, 3).join(' ') && overlap(x.codes, p.codes) >= 0.8);
    if (g) g.pages.push(p); else groups.push({ codes: p.codes, pages: [p] });
  }
  let n = 1; const used = new Set();
  return groups.map((g) => {
    const paths = g.pages.map((p) => p.path);
    const segs = paths.map((x) => x.split('/').filter(Boolean));
    const first = segs[0] && segs[0].length >= 2 ? segs[0][0] : null;
    let name = paths.includes('/') ? 'home' : first && segs.every((s) => s.length >= 2 && s[0] === first) ? first.replace(/[^a-z0-9-]/gi, '-').toLowerCase() : null;
    if (!name || used.has(name)) { n++; name = `tpl${n}`; }
    used.add(name);
    return { name, count: g.pages.length, example: paths[0], examples: paths.slice(0, 5), signature: g.codes.join(' '), paths };
  });
}
async function getText(url, timeout = 25000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36 site-rework/tilda', accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' } });
    const text = await r.text(); return { status: r.status, url: r.url, text };
  } finally { clearTimeout(t); }
}
/**
 * Типы страниц Tilda-сайта по подписи блоков: ссылки стартовой страницы + sitemap.xml (и вложенные) →
 * GET по очереди (до limit, пауза pause мс, таймаут 25 с) → groupSignatures. /tproduct/… — одной страницей.
 */
export async function pageTypes(start, { limit = 100, pause = 300, log = () => {} } = {}) {
  const base = new URL(start); const host = base.host.replace(/^www\./, '');
  const same = (u) => { try { const x = new URL(u, base); return /^https?:$/.test(x.protocol) && x.host.replace(/^www\./, '') === host; } catch { return false; } };
  const norm = (u) => { const x = new URL(u, base); x.hash = ''; x.search = ''; let p = x.pathname.replace(/\/+$/, '') || '/'; return p; };
  const skipExt = /\.(jpe?g|png|gif|webp|svg|pdf|zip|docx?|xlsx?|mp4|mp3|xml|css|js|ico|txt)$/i;
  const found = new Map(); const add = (u, from) => { if (!same(u)) return; const p = norm(u); if (skipExt.test(p) || found.has(p)) return; found.set(p, from); };
  const errors = []; let startHtml = '';
  try { const r = await getText(base.href); startHtml = r.text; add(base.href, 'старт'); for (const m of startHtml.matchAll(/href=["']([^"'#][^"']*)["']/g)) add(m[1], 'ссылка'); } catch (e) { errors.push(`стартовая страница: ${String(e.message || e).slice(0, 80)}`); }
  const maps = [new URL('/sitemap.xml', base).href]; const seenMaps = new Set();
  while (maps.length && seenMaps.size < 6) {
    const sm = maps.shift(); if (seenMaps.has(sm)) continue; seenMaps.add(sm);
    try { const r = await getText(sm, 20000); if (r.status >= 400) continue; for (const m of r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) { if (/\.xml(\?|$)/i.test(m[1])) maps.push(m[1]); else add(m[1], 'sitemap'); } } catch (e) { errors.push(`${sm}: ${String(e.message || e).slice(0, 60)}`); }
  }
  /* товары магазина — одна страница-шаблон */
  const all = [...found.keys()]; const product = all.filter((p) => /\/tproduct\//.test(p)); const list = [...all.filter((p) => !/\/tproduct\//.test(p)), ...product.slice(0, 1)];
  const pagesOut = []; let i = 0;
  for (const p of list.slice(0, limit)) {
    i++; const u = new URL(p, base).href;
    try {
      const r = p === norm(base.href) && startHtml ? { status: 200, text: startHtml } : await getText(u);
      const codes = r.status < 400 ? signatureOf(r.text) : [];
      pagesOut.push({ path: p, url: u, status: r.status, codes, from: found.get(p) });
      log(`  ${i}/${Math.min(limit, list.length)} ${p} — ${r.status < 400 ? `${codes.length} блоков` : `HTTP ${r.status}`}`);
    } catch (e) { errors.push(`${p}: ${String(e.message || e).slice(0, 60)}`); log(`  ${i}/${Math.min(limit, list.length)} ${p} — ошибка`); }
    if (pause) await sleep(pause);
  }
  const ok = pagesOut.filter((x) => x.codes.length);
  const types = groupSignatures(ok);
  if (product.length) { const t = types.find((x) => x.paths.some((p) => /\/tproduct\//.test(p))); if (t) t.note = `товары /tproduct/: ${product.length} адресов, запрошен один`; }
  return { base: base.href, found: found.size, fetched: pagesOut.length, limit, skipped: Math.max(0, list.length - limit), products: product.length, errors, pages: pagesOut, types, pagesArg: types.map((t) => `${t.name}=${t.example}`).join(',') };
}

/* =====================================================================
   Самопроверка (без сети): фикстуры fixtures/tilda
   ===================================================================== */
async function selftest() {
  const FX = path.join(HERE, 'fixtures', 'tilda');
  let bad = 0, n = 0;
  const check = (what, ok, got) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}: ${got}`); };
  const near = (a, b, tol = 0.002) => Number.isFinite(a) && Math.abs(a - b) <= tol;
  const rd = (f) => fs.readFileSync(path.join(FX, f), 'utf8');

  /* 1. zero.tilda.cc (голый HTML): SBS, параллакс, появления, ключи recid:elemid */
  {
    const raw = staticRaw(rd('zero-tilda-cc.html'), 'https://zero.tilda.cc/ru/'); const W = interpret(raw, WIDE), N = interpret(raw, NARROW);
    const S = (k) => W.sbs.find((s) => s.key === k); const M = (k) => W.motion.find((m) => m.key === k);
    check('zero: элементов и артбордов', W.zero.elements === 16 && W.zero.artboards.length === 10, `элементов ${W.zero.elements}, артбордов ${W.zero.artboards.length}`);
    const dup = W.elems.filter((e) => /:1467388269475$/.test(e.key)).map((e) => e.key);
    check('zero: один data-elem-id в трёх артбордах — три ключа', new Set(dup).size === 3, dup.join(', '));
    check('zero: SBS по видам', W.counts.sbs === 6 && W.counts.sbsByEvent.scroll === 3 && W.counts.sbsByEvent.intoview === 3, JSON.stringify(W.counts.sbsByEvent));
    const m07 = M('803535428:1467624405549');
    check('zero m07: петля-пульс 1700 мс до ×0.6 и 1300 мс обратно (не прокрутка)', m07 && m07.kind === 'loop' && m07.sub === 'пульс' && m07.timing.duration === 3000 && S('803535428:1467624405549').steps[1].t === 1700 && S('803535428:1467624405549').steps[1].sx === 0.6 && S('803535428:1467624405549').steps[2].t === 1300, m07 ? `${m07.kind} (${m07.sub}), ${m07.timing.duration} мс — ${m07.words}` : 'нет');
    const m12 = M('803535944:1576856390005');
    check('zero m12: вращение 360° за 25 000 мс, играет и на телефоне (mobile=y)', m12 && m12.kind === 'loop' && m12.sub === 'вращение' && m12.timing.duration === 25000 && m12.screens === 'все экраны', m12 ? `${m12.kind} (${m12.sub}), ${m12.timing.duration} мс, экраны: ${m12.screens}` : 'нет');
    const m14 = M('803536904:1467628059504'); const s14 = S('803536904:1467628059504');
    check('zero m14: кнопка — пульс 800 мс до ×1.1 ease-out, 2000 мс обратно', m14 && m14.kind === 'loop' && s14.steps[1].t === 800 && s14.steps[1].sx === 1.1 && s14.steps[1].ease === 'ease-out' && s14.steps[2].t === 2000 && /Создать классный сайт/.test(m14.text), m14 ? m14.words : 'нет');
    const m03 = M('803534332:1467388269475');
    check('zero m03: лента вбок 340 px на 500 px прокрутки = 0.68, край 100% → 44%', m03 && m03.kind === 'scroll-linked' && m03.scroll.coefficient === 0.68 && m03.scroll.startPct === 100 && Math.round(m03.scroll.endPct) === 44, m03 ? `коэффициент ${m03.scroll.coefficient}, ${m03.scroll.startPct}% → ${m03.scroll.endPct}%` : 'нет');
    const s04 = S('803534506:1467388269475');
    check('zero m04: один SBS scroll: на 120 px сдвиг Y 100, на 180 px поворот 180°', s04 && s04.steps.length === 3 && s04.steps[1].d === 120 && s04.steps[1].ty === 100 && s04.steps[2].d === 180 && s04.steps[2].rot === 180 && s04.trg === 0.5, s04 ? sbsWords(s04.steps, { scroll: true }) : 'нет');
    const p = W.prx.find((x) => x.key === '803526880:1467818882478');
    check('zero m01: prx-s 115 → скорость 2, 200 px за проход (446 + 900) = 0.1486', p && p.speed === 2 && p.px === 200 && p.h === 446 && near(Math.abs(p.coefficient), 0.1486, 0.0002), p ? `скорость ${p.speed}, ${p.px} px, h ${p.h}, коэффициент ${p.coefficient}` : 'нет');
    check('zero: параллакс без prx-s не двигается', W.prx.length === 4 && W.prx.filter((x) => !x.moves).length === 3, `всего ${W.prx.length}, стоят ${W.prx.filter((x) => !x.moves).length}`);
    const ap = W.appear.zero.filter((a) => a.key.startsWith('803535542:'));
    const zg = W.motion.find((m) => m.kind === 'reveal' && (m.keys || []).some((k) => k.startsWith('803535542:')));
    check('zero: появления fadeinup 1200 мс, сдвиг 100, задержки донора 0/300/600 как есть (не «по очереди +N»)', ap.length === 4 && ap.every((a) => a.duration === 1200 && a.distance === 100) && zg && (zg.timing.delays || []).join('/') === '0/300/600' && zg.count === 4, `${ap.map((a) => a.delay).join('/')}; в движении: ${zg ? `×${zg.count}, задержки ${(zg.timing.delays || []).join('/')}` : 'нет'}`);
    const zi = W.appear.zero.find((a) => a.style === 'zoomin');
    check('zero: zoomin — масштаб 0.5, срабатывание −200 px', zi && zi.scale === 0.5 && zi.triggerOffset === 200 && zi.duration === 1100, zi ? `масштаб ${zi.scale}, −${zi.triggerOffset} px, ${zi.duration} мс` : 'нет');
    check('zero: телефон — играет только data-animate-mobile=y', N.motion.filter((m) => m.plays).every((m) => /1576856390005/.test(m.key || '')) && N.motion.some((m) => m.plays), N.motion.filter((m) => m.plays).map((m) => m.key).join(', ') || 'ничего');
    check('zero: плашка Made on Tilda — признак, но не блок и не элемент', W.platform.madeOnTilda && !W.blocks.some((b) => /Made on/i.test(b.head)) && !W.elems.some((e) => /Made on/i.test(e.text || '')), `madeOnTilda ${W.platform.madeOnTilda}`);
  }

  /* 2. madeon.studio (голый HTML): upscale=window, animationoff, наведение SBS, мигание, хуки */
  {
    const raw = staticRaw(rd('madeon.html'), 'https://madeon.studio/'); const W = interpret(raw, WIDE), N = interpret(raw, NARROW);
    const ab = W.zero.artboards.find((a) => a.recid === '649722566'); const abN = N.zero.artboards.find((a) => a.recid === '649722566');
    check('madeon: upscale=window, 1440 → брейкпоинт 1200, zoom 1.2; 390 → 320, zoom 1.219', ab && ab.res === 1200 && ab.zoomCalc === 1.2 && abN.res === 320 && abN.zoomCalc === 1.219, ab ? `${ab.res}/${ab.zoomCalc}; ${abN.res}/${abN.zoomCalc}` : 'нет');
    check('madeon: data-blocks-animationoff — zoomin не играет и на широком', W.platform.animationOff && W.appear.zero.length >= 1 && W.appear.zero.every((a) => !a.plays), W.appear.zero.map((a) => `${a.key} ${a.plays ? 'играет' : 'нет'} (${a.playsBy})`).join('; '));
    const hv = W.sbs.filter((s) => s.event === 'hover' && s.key.startsWith('649722566:'));
    const btn = hv.find((s) => s.key === '649722566:1693510343943');
    check('madeon: наведение «Стать клиентом» — триггер кнопка с #popup, прозрачность за 200 мс', btn && btn.trgels[0].key === '649722566:1693510119803' && btn.trgels[0].type === 'button' && btn.steps[1].t === 200 && btn.steps[1].op === 0, btn ? sbsWords(btn.steps) : 'нет');
    const plus = W.motion.find((m) => m.key === '649722566:1696072826151');
    check('madeon: фигура — поворот 45° ease-in-out за 200 мс', plus && plus.kind === 'hover' && /поворот 45°/.test(plus.words) && /ease-in-out/.test(plus.words), plus ? plus.words : 'нет');
    const bl = W.motion.find((m) => m.key === '675385492:1701428534256');
    check('madeon: мигание blockintoview в 5 шагов по 400 мс, не «прозрачность 0→1»', bl && bl.kind === 'reveal' && /мигание/.test(bl.sub || '') && bl.steps.length === 5 && bl.recipe === 'keyframes', bl ? `${bl.sub}: ${bl.words}` : 'нет');
    check('madeon: ключ recid:elemid — одинаковые id в двух артбордах', W.elems.filter((e) => /:1693510202890$/.test(e.key)).length === 2, W.elems.filter((e) => /:1693510202890$/.test(e.key)).map((e) => e.key).join(', '));
    const hk = W.hooks.find((h) => h.href === '#menuopen');
    check('madeon: #menuopen → шторка T450', hk && hk.target && hk.target.code === 'T450', hk ? `${hk.target ? hk.target.code + ' ' + hk.target.rec : 'нет'}` : 'хука нет');
    const pop = W.hooks.find((h) => /^#popup:/.test(h.href));
    check('madeon: ссылка #popup:razrabotka-saita1 — окно этой выжимки не содержит (честно: не найдено)', pop && pop.target === null, pop ? `${pop.href} → ${pop.target ? pop.target.rec : 'не найдено'}` : 'нет');
    const nOff = N.sbs.find((s) => s.key === '665811767:1693510343943'), nOn = N.sbs.find((s) => s.key === '665811767:1693510202890'), nHid = N.sbs.find((s) => s.key === '649722566:1693510202890');
    check('madeon: телефон — наведение без mobile=y выключено, с mobile=y играет, блок только ≥980 скрыт', nOff && !nOff.plays && nOn && nOn.plays && nHid && !nHid.plays, `${nOff && nOff.playsBy}; ${nOn && nOn.playsBy}; ${nHid && nHid.playsBy}`);
    check('madeon: T360 — служебный блок', W.blocks.some((b) => b.code === 'T360' && b.service), W.blocks.map((b) => b.code).join(' '));
  }

  /* 3. типы страниц по подписи блоков */
  {
    const dir = path.join(FX, 'pages');
    const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort().map((f) => ({ path: f === 'home.html' ? '/' : f === 'news-vitrine-market.html' ? '/news/vitrine-market' : `/${f.replace(/\.html$/, '')}`, codes: signatureOf(fs.readFileSync(path.join(dir, f), 'utf8')) }));
    const types = groupSignatures(pages);
    const brand = types.find((t) => t.paths.includes('/abuse'));
    check('pages: 7 страниц streetwearbrands → 3 типа (главная, бренд ×5, новость)', types.length === 3 && brand && brand.count === 5 && types.some((t) => t.name === 'home' && t.count === 1), types.map((t) => `${t.name} ×${t.count} (${t.example})`).join('; '));
    check('pages: код T396 из комментария, когда класса нет', pages.find((p) => p.path === '/abuse').codes.includes('T396'), pages.find((p) => p.path === '/abuse').codes.join(' '));
    const anc = staticRecords('<div id="rec1" class="r t-rec" data-record-type="215"> <a name="services" style="font-size:0;"></a> </div> <div id="rec2" class="r t-rec" data-record-type="121" data-alias-record-type="1003"> <!-- cover --> </div>').map((r) => r.code);
    check('pages: якорь <a name> — «якорь», T1003 — из data-alias-record-type', anc.join(' ') === 'якорь T1003', anc.join(' '));
    /* SBS на группе Zero Block (romashka.media: 28 из 147) — ключ recid:g<id>, селектор по data-group-id */
    const gh = `<div id="allrecords" class="t-records" data-tilda-page-id="9"><div id="rec5" class="r t-rec" data-record-type="396"> <!-- T396 --><div class='t396'><div class="t396__artboard" data-artboard-recid="5" data-artboard-screens="320,640,1200" data-artboard-height="600"><div class="t396__group tn-group" data-group-id="777" data-group-top-value="100" data-group-left-value="40" data-animate-sbs-event="intoview" data-animate-sbs-loop="loop" data-animate-sbs-opts="[{'ti':0,'mx':0,'my':0,'sx':1,'sy':1,'op':1,'ro':0},{'ti':3000,'mx':0,'my':-20,'sx':1,'sy':1,'op':1,'ro':0,'ea':'easeInOut'}]"><div class='t396__elem tn-elem' data-elem-id='1' data-elem-type='text'><div class='tn-atom'>Группа</div></div></div></div></div></div></div>`;
    const G = interpret(staticRaw(gh, 'x'), WIDE); const gm = G.motion.find((m) => /:g777$/.test(m.key || ''));
    check('группа Zero Block с SBS — ключ 5:g777, парение 3000 мс, селектор data-group-id', gm && gm.kind === 'loop' && gm.sub === 'парение' && gm.target === '#rec5 [data-group-id="777"]' && G.elems.some((e) => e.key === '5:1'), gm ? `${gm.key} ${gm.kind} (${gm.sub}) ${gm.timing.duration} мс → ${gm.target}` : 'нет');
  }

  /* 4. браузер: стенд index.html на 1440 и 390 */
  const br = await launch();
  try {
    for (const [name, vp] of [resolveViewport('desktop'), resolveViewport('mobile')]) {
      const page = await openPage(br, pathToFileURL(path.join(FX, 'index.html')).href, vp, { settle: 0 });
      try {
        const snap = await tildaSnapshot(page, { scroll: true, viewport: name });
        const wide = vp.width >= 1200;
        const h1 = snap.elems.find((e) => e.key === '20:100');
        if (wide) {
          check(`${name}: zoom Zero Block (upscale=window) 1.2, кегль 40 → 48 px на экране`, h1 && h1.zoom === 1.2 && h1.fontScreen === 48, h1 ? `zoom ${h1.zoom}, ${h1.font && h1.font.size}px → ${h1.fontScreen}px` : 'нет');
          check(`${name}: ключи 20:100 и 21:100 не слиты`, snap.elems.filter((e) => /:100$/.test(e.key)).length === 2, snap.elems.filter((e) => /:100$/.test(e.key)).map((e) => e.key).join(', '));
          const t = snap.appear.standard.find((a) => a.role === 't-title'), d = snap.appear.standard.find((a) => a.role === 't-descr'), it = snap.appear.standard.filter((a) => a.chain);
          check(`${name}: стандартные появления — заголовок 1200, текст 700, карточки 500 по очереди +160, играют`, t && t.duration === 1200 && d && d.duration === 700 && it.length === 3 && it.every((x) => x.duration === 500 && x.plays) && t.plays, `${t && t.duration}/${d && d.duration}/${it.map((x) => x.duration).join(',')}; играют ${snap.counts.appearStdPlays}/${snap.counts.appearStd}`);
          const lp = snap.motion.find((m) => m.key === '20:101');
          check(`${name}: SBS intoview + loop → петля (пульс), не прокрутка`, lp && lp.kind === 'loop' && lp.sub === 'пульс', lp ? `${lp.kind} (${lp.sub}) ${lp.timing.duration} мс` : 'нет');
          const sc = snap.motion.find((m) => m.key === '20:102');
          check(`${name}: SBS scroll при zoom 1.2 — сдвиг 408 px на отрезке 600 px, коэффициент 0.68 как у донора`, sc && sc.kind === 'scroll-linked' && sc.scroll.rangePx === 600 && sc.scroll.coefficient === 0.68 && sc.props[0].to === '408 px', sc ? `отрезок ${sc.scroll.rangePx} px, ${sc.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ')}, коэффициент ${sc.scroll.coefficient}` : 'нет');
          const hv = snap.motion.find((m) => m.key === '20:103');
          check(`${name}: наведение с trgels → триггер 20:100`, hv && hv.kind === 'hover' && hv.hover.trigger[0] === '20:100', hv ? `${hv.hover.trigger.join(',')}: ${hv.words}` : 'нет');
          const p = snap.prx.find((x) => x.key === '20:104'), p0 = snap.prx.find((x) => x.key === '20:105');
          check(`${name}: параллакс prx-s 115 → скорость 2, 200 px; без prx-s стоит`, p && p.speed === 2 && p.px === 200 && near(p.coefficient, -200 / (p.h + p.vh), 0.0005) && p0 && !p0.moves, p ? `скорость ${p.speed}, h ${p.h}, коэффициент ${p.coefficient}; без s: ${p0 && p0.moves ? 'двигается' : 'стоит'}` : 'нет');
          const g = snap.elems.find((e) => e.key === '21:100');
          check(`${name}: поля по брейкпоинту — left 690, кегль 34 на 1440`, g && g.now.left === 690 && g.now.fontsize === 34, g ? `left ${g.now.left}, кегль ${g.now.fontsize}` : 'нет');
        } else {
          check(`${name}: zoom на 390 при upscale=window — 390/320`, h1 && near(h1.zoom, 1.2188, 0.002), h1 ? `zoom ${h1.zoom}` : 'нет');
          const plays = snap.motion.filter((m) => m.plays);
          check(`${name}: < 1200 играет только data-animate-mobile=y`, plays.length === 1 && plays[0].key === '20:107', plays.map((m) => `${m.id} ${m.key || m.target}`).join(', ') || 'ничего');
          const g = snap.elems.find((e) => e.key === '21:100');
          check(`${name}: поля по брейкпоинту — left 20, кегль 30 на 390 (брейкпоинт 320)`, g && g.now.left === 20 && g.now.fontsize === 30, g ? `left ${g.now.left}, кегль ${g.now.fontsize}` : 'нет');
        }
        check(`${name}: #tildacopy — не блок, не элемент, не движение`, snap.platform.madeOnTilda && !snap.blocks.some((b) => /Made on/i.test(b.head)) && !snap.elems.some((e) => /Made on/i.test(e.text || '')) && !snap.motion.some((m) => /Made on/i.test(m.text || '')), `плашка ${snap.platform.madeOnTilda ? 'есть' : 'нет'}`);
        check(`${name}: заглушка «Zero Block» обрезана артбордом — служебное`, snap.service.placeholders.length === 1 && /обрезана/.test(snap.service.placeholders[0]), snap.service.placeholders.join(', ') || 'нет');
        const hk = snap.hooks.find((x) => x.href === '#popup:x');
        check(`${name}: #popup:x → окно T1093 (data-anim fadein, timeout 300 мс)`, hk && hk.target && hk.target.code === 'T1093' && hk.target.timeout === 300, hk ? JSON.stringify(hk.target) : 'нет');
        check(`${name}: ленивые — data-original 1, заглушка /-/resize/20x/ 1`, snap.lazy.dataOriginal === 1 && snap.lazy.placeholders === 1, `data-original ${snap.lazy.dataOriginal}, заглушек ${snap.lazy.placeholders}`);
      } finally { await page.close().catch(() => {}); }
    }
  } finally { await br.close().catch(() => {}); }
  console.log(`${bad ? 'FAIL' : 'OK'}: проверок ${n}, расхождений ${bad} · ${FX}`);
  return bad ? 1 : 0;
}

/* =====================================================================
   Командная строка
   ===================================================================== */
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
  const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h', 'no-scroll', 'selftest'], values: ['out', 'viewport', 'viewports', 'pages', 'limit', 'pause'], commands: ['pages', 'static', 'selftest'] });
  const die = (m) => { console.error(m); process.exit(1); };
  if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
  const cmd = opt.selftest ? 'selftest' : ['pages', 'static', 'selftest'].includes(pos[0]) ? pos.shift() : 'map';
  if (cmd === 'selftest') process.exit(await selftest());
  const arg = pos[0] ? unmangle(pos[0]) : null;
  if (!arg) die('Нужен адрес: node tilda.mjs <адрес> [--viewport desktop,mobile] [--out <папка>] | pages <адрес> | static <файл|адрес> | selftest  (подробно: --help)');
  if (cmd === 'static') {
    let html, url = null;
    if (/^https?:/i.test(arg)) { const r = await getText(arg).catch((e) => die(`не открылся ${arg}: ${e.message}`)); html = r.text; url = r.url || arg; }
    else { if (!fs.existsSync(arg)) die(`Нет файла ${arg}`); html = fs.readFileSync(arg, 'utf8'); url = pathToFileURL(path.resolve(arg)).href; }
    const raw = staticRaw(html, url);
    if (!raw.tilda) { console.log(`не Tilda: ${arg} — нет #allrecords, блоков .t-rec и адресов tildacdn`); process.exit(0); }
    const W = interpret(raw, WIDE), N = interpret(raw, NARROW);
    console.log(`Голый HTML: ${arg}\n`); for (const l of tildaSummary(W)) console.log(l);
    console.log(`\nна телефоне (390, по правилам): движения ${N.counts.motion}, играет ${N.counts.motionPlays}; на широком — ${W.counts.motionPlays}`);
    if (opt.out) {
      const dir = ensureDir(path.join(path.resolve(String(opt.out)), 'tilda'));
      writeJson(path.join(dir, 'tilda-static.json'), { url, takenAt: new Date().toISOString(), wide: W, narrow: N });
      fs.writeFileSync(path.join(dir, 'tilda-static.md'), mdSnap(W, { title: `${arg} (голый HTML, 1440 по правилам)` }));
      writeJson(path.join(dir, 'tilda-layout.json'), { url, ...tildaLayout(raw) });
      console.log(`Файлы: ${dir}`);
    }
    process.exit(0);
  }
  let url; try { url = new URL(arg).href; } catch { die(`Неверный адрес «${arg}»: нужен полный адрес http://, https:// или file:///`); }
  const out = runDir(opt, url);
  if (cmd === 'pages') {
    const limit = Math.max(1, Math.min(300, Number(opt.limit) || 100)); const pause = Math.max(0, Math.min(5000, opt.pause !== undefined ? Number(opt.pause) : 300));
    console.log(`Типы страниц по подписи блоков Tilda: ${url} (до ${limit} страниц, пауза ${pause} мс)`);
    const res = await pageTypes(url, { limit, pause, log: (l) => console.log(l) });
    const dir = ensureDir(path.join(out, 'tilda'));
    writeJson(path.join(dir, 'tilda-pages.json'), { takenAt: new Date().toISOString(), ...res });
    console.log(`\nадресов найдено ${res.found}, запрошено ${res.fetched}${res.skipped ? `, не запрошено сверх --limit ${res.skipped}` : ''}${res.products ? `, товаров /tproduct/ ${res.products} (запрошен один)` : ''}; типов ${res.types.length}:`);
    for (const t of res.types) console.log(`  ${t.name} ×${t.count}: ${t.examples.join(', ')}${t.count > 5 ? ' …' : ''}${t.note ? ` (${t.note})` : ''}\n      ${t.signature}`);
    if (res.errors.length) console.log(`ошибки: ${res.errors.slice(0, 6).join('; ')}`);
    console.log(`\n--pages "${res.pagesArg}"\nФайл: ${path.join(dir, 'tilda-pages.json')}`);
    process.exit(0);
  }
  const vpList = String(opt.viewport || opt.viewports || 'desktop').split(',').map((x) => x.trim()).filter(Boolean);
  const viewports = vpList.map((v) => resolveViewport(v) || die(`Неизвестный экран: ${v}`));
  const pages = opt.pages ? String(opt.pages).split(',').map((s) => s.trim()).filter(Boolean).map((s, i) => { const m = /^([\w-]+)=(.+)$/.exec(s); const p = m ? m[2] : s; return { name: m ? m[1] : pageSlug(new URL(unmangle(p), url).href) || `p${i + 1}`, url: pagesFrom(p, url)[0] }; }) : [];
  try { await runBrowser(url, { out, viewports, pages, noScroll: !!opt['no-scroll'] }); }
  catch (e) { die(`не снято: ${String(e.message || e).split('\n')[0]}`); }
  process.exit(0);
}
