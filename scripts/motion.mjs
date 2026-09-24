#!/usr/bin/env node
/**
 * Движение страницы: что двигается, от чего, как и с какими числами — инвентарь, чтобы повторить
 * движение донора целиком, и сверка «донор → наш сайт», чтобы ни одно не потерялось.
 *
 *   node motion.mjs <адрес> [--viewport desktop] [--out <папка прогона>] [--tag <имя>]
 *                   [--time 6000] [--hover 14] [--no-hover] [--no-mouse] [--no-scroll] [--no-crops] [--debug]
 *   node motion.mjs compare <motion.json донора> <адрес нашего сайта | наш motion.json>
 *                   [--out <папка прогона>] [--tag <имя>] [--decisions <файл>] [--viewport …]
 *   node motion.mjs selftest            проверка распознавания на стенде fixtures/motion/index.html
 *   node motion.mjs --help
 *
 * Что распознаётся (вид → рецепт в reference/motion.md):
 *   entrance        вход при загрузке (CSS-анимация, переход, element.animate) — из чего, сколько, задержки
 *   reveal          появление при прокрутке: прозрачность, сдвиг, масштаб, размытие, шторка (clip-path);
 *                   где срабатывает (верх блока на N% экрана), длительность, по очереди (+N мс), чем
 *                   запускается (класс «in» от IntersectionObserver, Framer, AOS…)
 *   scroll-linked   свойство привязано к прокрутке: из → в на отрезке «верх блока на A% → B% экрана»
 *                   (масштаб, прозрачность, поворот, размытие; CSS animation-timeline тоже)
 *   parallax        сдвиг на долю прокрутки (коэффициент у каждого слоя)
 *   pinned          закреплённый раздел (sticky / pin) и лента внутри него, которая едет вбок
 *   header          шапка при прокрутке: плотнеет, прячется вниз, возвращается вверх
 *   progress        полоса прогресса прокрутки
 *   marquee         бегущая строка (скорость, направление)
 *   typewriter      печатающийся текст (слова, скорость набора и стирания); rotating-words — смена слов
 *   counter         числа, которые считают
 *   carousel        слайды листаются сами (интервал, шаг)
 *   loop            бесконечные петли: парение, вращение, пульс, мигание
 *   hover           наведение: картинка в карточке крупнее, кнопка светлее/выше/с тенью, линия под ссылкой
 *   mouse           реакция на мышь: наклон, параллакс; cursor — свой курсор
 *   canvas, video   холст, который рисует (2D/WebGL), и видео-фон
 * Плюс библиотеки движения (GSAP/ScrollTrigger, Lenis, Framer, AOS, Swiper, Lottie, Webflow, Tilda…),
 * CSS scroll-driven, плавная прокрутка и правило «меньше движения».
 *
 * Как снимается: страница открывается с перехватом событий (animationstart/end, transitionrun/end,
 * element.animate, смена классов и style) → 4 с без прокрутки (петли, печать, карусели) → наведение
 * на образцы кнопок, карточек, ссылок → движение мыши по первому экрану → проход прокруткой шагами
 * по четверти экрана, на каждом шаге ждём, пока движение уляжется, и снимаем прозрачность, transform,
 * фильтр, шторку и положение у каждого заметного элемента → вверх на полтора экрана (шапка) →
 * вырезки элементов. Отличие: прокрутка скриптом ≠ колесо — сглаживание Lenis/пружины Framer
 * догоняют; скрипт ждёт до 0.9 с на шаг.
 *
 * Выход: <out>/motion/<tag>.json (протокол: items[], libs, verdict) и <tag>.md (таблица для
 * analysis.md), вырезки <out>/motion/<tag>/mNN.png. По умолчанию <out> — папка прогона по адресу
 * (runs/<slug>), <tag> — <страница>-<экран>. --debug — ещё <tag>.series.json: все шаги и ряды значений
 * менявшихся элементов (разбирать спорное распознавание).
 *
 * compare: для каждого движения донора ищется такое же у нас (тот же вид, похожие числа):
 *   OK — есть и совпадает; ОТЛИЧАЕТСЯ — вид тот же, числа другие (какие); НЕТ — не найдено.
 *   Решение «почему нет / чем заменено» — в <out>/motion-decisions.json:
 *     { "m04": "у нас другой первый экран (вариант B), стопки картинок нет", "reveal:div.card": "…" }
 *   Движения, которых у донора нет, печатаются как «своё» — проверить, что это задумано (банк идей).
 *   Вердикт: FAIL — есть НЕТ без решения; WARN — есть ОТЛИЧАЕТСЯ; иначе OK. Протокол годится
 *   доказательством для state.mjs (визуал/runtime движения).
 * selftest: стенд с каждым видом движения, у блоков data-expect; FAIL, если вид не найден.
 *
 * Код выхода: 0 — снято (и compare без FAIL); 1 — FAIL сверки, неверные аргументы, не открылась страница.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parseArgs, launch, preparePage, gotoRetry, waitForOverlay, sleep, resolveViewport, evaluateWith, SIG_FN,
  scrollToY, writeJson, readJson, ensureDir, runDir, pageSlug, loadSharp, closeConsent, consentNote,
} from './lib.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { pos, opt } = parseArgs(process.argv.slice(2), {
  flags: ['help', 'h', 'no-hover', 'no-mouse', 'no-scroll', 'no-crops', 'debug'],
  optional: ['viewport', 'out', 'tag', 'time', 'hover', 'decisions'],
  commands: ['compare', 'selftest'],
});
if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
const die = (m) => { console.error(m); process.exit(1); };

/* =====================================================================
   Код внутри страницы
   ===================================================================== */

/* Перехват до загрузки: события анимаций и переходов, element.animate, смена классов и style. */
function instrument() {
  if (window.__mo) return;
  const now = () => Math.round(performance.now());
  const mo = window.__mo = { ev: [], waapi: [], cls: [], style: new Map(), capped: false };
  const push = (arr, x) => { if (arr.length < 8000) arr.push(x); else mo.capped = true; };
  addEventListener('animationstart', (e) => push(mo.ev, { t: now(), type: 'anim', el: e.target, name: e.animationName, pseudo: e.pseudoElement || '' }), true);
  addEventListener('animationend', (e) => push(mo.ev, { t: now(), type: 'anim-end', el: e.target, name: e.animationName, dur: Math.round(e.elapsedTime * 1000), pseudo: e.pseudoElement || '' }), true);
  addEventListener('transitionrun', (e) => push(mo.ev, { t: now(), type: 'trans', el: e.target, prop: e.propertyName, pseudo: e.pseudoElement || '' }), true);
  addEventListener('transitionend', (e) => push(mo.ev, { t: now(), type: 'trans-end', el: e.target, prop: e.propertyName, dur: Math.round(e.elapsedTime * 1000), pseudo: e.pseudoElement || '' }), true);
  try {
    const orig = Element.prototype.animate;
    const wrapped = function animate(kf, o) {
      try {
        const op = typeof o === 'number' ? { duration: o } : (o || {});
        const frames = Array.isArray(kf) ? kf : (kf && typeof kf === 'object' ? [kf] : []);
        const props = [...new Set(frames.flatMap((f) => Object.keys(f || {})).filter((k) => !/^(offset|easing|composite)$/.test(k)))];
        push(mo.waapi, { t: now(), el: this, props, first: frames[0] ? JSON.stringify(frames[0]).slice(0, 200) : '', last: frames.length ? JSON.stringify(frames[frames.length - 1]).slice(0, 200) : '',
          duration: typeof op.duration === 'number' ? Math.round(op.duration) : null, delay: Math.round(op.delay || 0), easing: op.easing || '', iterations: op.iterations === Infinity ? 'infinite' : (op.iterations || 1) });
      } catch (e) { /* не мешать странице */ }
      return orig.apply(this, arguments);
    };
    try { Object.defineProperty(wrapped, 'toString', { value: () => orig.toString() }); } catch (e) { /* нет */ }
    Element.prototype.animate = wrapped;
  } catch (e) { /* нет WAAPI */ }
  const start = () => {
    new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target;
        if (m.attributeName === 'style') {
          const s = mo.style.get(el); const t = now();
          if (s) { s.n++; s.last = t; } else if (mo.style.size < 10000) mo.style.set(el, { n: 1, first: t, last: t });
        } else if (m.attributeName === 'class' && el.classList) {
          const was = new Set(String(m.oldValue || '').split(/\s+/).filter(Boolean));
          const added = [...el.classList].filter((c) => !was.has(c)); const removed = [...was].filter((c) => !el.classList.contains(c));
          if (added.length || removed.length) push(mo.cls, { t: now(), el, added, removed });
        }
      }
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style', 'class'], attributeOldValue: true });
  };
  if (document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
}

/* Библиотеки движения, CSS scroll-driven, плавная прокрутка, правило «меньше движения». */
function libsInPage() {
  const w = window; const q = (s) => { try { return document.querySelectorAll(s).length; } catch (e) { return 0; } };
  const libs = []; const add = (name, detail) => libs.push(detail ? `${name} (${detail})` : name);
  if (w.gsap) { let n = '?'; try { n = w.ScrollTrigger && w.ScrollTrigger.getAll ? w.ScrollTrigger.getAll().length : 0; } catch (e) { /* нет */ } add('GSAP', w.ScrollTrigger ? `ScrollTrigger ×${n}` : ''); }
  if (w.Lenis || w.lenis || document.documentElement.classList.contains('lenis')) add('Lenis — плавная прокрутка');
  if (w.LocomotiveScroll || q('[data-scroll-container]')) add('Locomotive Scroll');
  if (w.AOS || q('[data-aos]')) add('AOS', `${q('[data-aos]')} блоков`);
  if (w.Swiper || q('.swiper')) add('Swiper');
  if (w.Splide || q('.splide')) add('Splide');
  if (q('[data-framer-appear-id], [data-framer-component-type], [data-framer-name]')) add('Framer', `появлений ${q('[data-framer-appear-id]')}`);
  if (document.documentElement.classList.contains('w-mod-ix') || q('[data-w-id]')) add('Webflow Interactions');
  if (q('.t-animate, [data-animate-style], .t-animate_started')) add('Tilda', `анимированных блоков ${q('.t-animate, [data-animate-style]')}`);
  if (q('lottie-player, dotlottie-player') || w.lottie || w.bodymovin) add('Lottie');
  if (w.anime) add('anime.js');
  if (w.Motion || w.motion) add('Motion One / Framer Motion');
  if (w.THREE) add('Three.js');
  if (w.barba || q('[data-barba]')) add('Barba — переходы страниц');
  if (w.ScrollReveal) add('ScrollReveal');
  if (q('.wow')) add('WOW.js');
  if (w.Rellax || q('.rellax')) add('Rellax');
  let scrollDriven = 0, reducedRule = false, keyframes = 0, unreadable = 0;
  const walk = (rules) => { for (const r of rules) {
    const t = r.cssText || '';
    if (r.type === CSSRule.KEYFRAMES_RULE) keyframes++;
    if (/animation-timeline|view-timeline|scroll-timeline/.test(t) && r.type === CSSRule.STYLE_RULE) scrollDriven++;
    if (r.type === CSSRule.MEDIA_RULE && /prefers-reduced-motion/.test(r.conditionText || '')) reducedRule = true;
    if (r.cssRules && r.type !== CSSRule.KEYFRAMES_RULE) walk(r.cssRules);
  } };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) { unreadable++; } }
  if (scrollDriven) add('CSS scroll-driven (animation-timeline)', `${scrollDriven} правил`);
  const smooth = getComputedStyle(document.documentElement).scrollBehavior === 'smooth';
  return { libs, scrollDriven, reducedRule, keyframes, unreadable, smoothCss: smooth };
}

/* Ключевые кадры CSS-анимации по имени: первый и последний кадр (для «из → в»). */
function keyframesInPage(names) {
  const out = {};
  const want = new Set(names);
  const walk = (rules) => { for (const r of rules) {
    if (r.type === CSSRule.KEYFRAMES_RULE && want.has(r.name) && !out[r.name]) {
      const frames = [...r.cssRules].map((k) => ({ at: k.keyText, css: k.style.cssText.slice(0, 200) }));
      out[r.name] = frames;
    } else if (r.cssRules && r.type !== CSSRule.KEYFRAMES_RULE) walk(r.cssRules);
  } };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) { /* чужой домен */ } }
  return out;
}

/* Что прокручивается: документ или блок на весь экран (у «приложений» body{height:100%;overflow:auto}).
   Ссылка — в window.__rwScroller (так же её понимает lib.scrollToY). */
function detectScrollerInPage() {
  const se = document.scrollingElement || document.documentElement;
  const docH = Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0);
  if (docH > innerHeight + 2) { window.__rwScroller = null; return docH; }
  let best = null;
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    if (el.scrollHeight <= el.clientHeight + 50 || el.clientHeight < innerHeight * 0.5 || el.clientWidth < innerWidth * 0.5) continue;
    if (!/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
    if (!best || el.scrollHeight > best.scrollHeight) best = el;
  }
  window.__rwScroller = best;
  return best ? best.scrollHeight : docH;
}

/* Все заметные элементы: список живёт в window.__moEls, дальше на него ссылаются индексами. */
function collectInPage(maxN) {
  const skip = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR|HEAD|TITLE|SOURCE|TRACK|WBR|PARAM)$/;
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (skip.test(el.tagName)) continue;
    if (el.ownerSVGElement) continue;                             /* внутренности svg — только сам svg */
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 100 && !(el.childElementCount === 0 && (el.textContent || '').trim())) {
      const p = getComputedStyle(el).position;                     /* полоса прогресса начинается с ширины 0 */
      if (!(p === 'fixed' || p === 'sticky') || getComputedStyle(el).display === 'none') continue;
    }
    out.push(el);
    if (out.length >= maxN) break;
  }
  window.__moEls = out;
  window.__moS = { steps: [], series: new Map(), hot: new Set() };
  return out.length;
}

/* Снимок состояния: у каждого элемента — строка, только если что-то изменилось с прошлой
   (положение в документе, размер, transform, прозрачность, фильтр, шторка, видимость, фон, текст листа). */
function sampleInPage(tag) {
  const S = window.__moS; const els = window.__moEls || [];
  const sy = Math.round(window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller.scrollTop : scrollY);
  const step = S.steps.length; S.steps.push({ tag, sy, t: Math.round(performance.now()) });
  let changed = 0;
  for (let i = 0; i < els.length; i++) {
    const el = els[i]; if (!el.isConnected) continue;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    let leaf = ''; for (const c of el.childNodes) if (c.nodeType === 3) leaf += c.textContent; leaf = leaf.trim().slice(0, 60);
    const v = [Math.round(r.top + sy), Math.round(r.left), Math.round(r.width), Math.round(r.height),
      s.transform === 'none' ? '' : s.transform, Math.round(parseFloat(s.opacity) * 1000) / 1000,
      s.filter === 'none' ? '' : s.filter, s.clipPath === 'none' ? '' : s.clipPath,
      s.visibility === 'hidden' ? 1 : 0, s.backgroundColor, leaf, el.parentElement ? Math.round(el.parentElement.getBoundingClientRect().top + sy) : Math.round(r.top + sy)];
    const h = S.series.get(i);
    if (!h) { S.series.set(i, { rows: [[step, v]] }); continue; }
    const last = h.rows[h.rows.length - 1][1];
    let diff = false; for (let k = 0; k < v.length; k++) if (v[k] !== last[k]) { diff = true; break; }
    if (diff) { h.rows.push([step, v]); S.hot.add(i); changed++; }
  }
  return { step, sy, changed };
}

/* Где за окно «время» текст листа менялся хотя бы дважды — кандидаты на печать/смену слов. */
function textCandidatesInPage() {
  const S = window.__moS; const out = [];
  for (const [i, h] of S.series) { let n = 0; for (let k = 1; k < h.rows.length; k++) if (h.rows[k][1][10] !== h.rows[k - 1][1][10]) n++; if (n >= 2) out.push(i); }
  return out.slice(0, 6);
}
/* Частая выборка текста у этих элементов (печать: знак за 30–80 мс, пауза на слове — секунды). */
async function textWatchInPage(arg) {
  const els = window.__moEls || []; const out = {}; for (const i of arg.idx) out[i] = [];
  const t0 = performance.now();
  while (performance.now() - t0 < arg.ms) {
    for (const i of arg.idx) { const el = els[i]; let txt = ''; if (el) for (const c of el.childNodes) if (c.nodeType === 3) txt += c.textContent; txt = txt.trim().slice(0, 60); const a = out[i]; if (!a.length || a[a.length - 1][1] !== txt) a.push([Math.round(performance.now()), txt]); }
    await new Promise((r) => setTimeout(r, 40));
  }
  return out;
}

/* Сумма состояний «горячих» элементов — улеглось ли движение после шага прокрутки. */
function hotHashInPage() {
  const S = window.__moS; const els = window.__moEls || []; let h = '';
  for (const i of S.hot) { const el = els[i]; if (!el || !el.isConnected) continue; const s = getComputedStyle(el); h += s.transform + s.opacity + s.filter + s.clipPath + '|'; }
  const busy = document.getAnimations().filter((a) => { try { const t = a.effect.getComputedTiming(); return a.playState === 'running' && t.iterations !== Infinity && t.endTime !== Infinity && !(a.timeline && a.timeline.constructor && /Scroll|View/.test(a.timeline.constructor.name)); } catch (e) { return false; } }).length;
  return { h, busy };
}

/* Итог по элементам, которые менялись: ряды, подпись и то, что нужно для разбора. */
function seriesOutInPage() {
  const S = window.__moS; const els = window.__moEls || []; const out = [];
  for (const [i, h] of S.series) {
    if (h.rows.length < 2) continue;
    const el = els[i]; if (!el) continue;
    const s = getComputedStyle(el);
    const p = el.parentElement;
    const cls = (el.getAttribute && el.getAttribute('class')) || '';
    out.push({
      i, sig: sig(el), tag: el.tagName.toLowerCase(), cls: String(cls).slice(0, 120), id: el.id || '',
      parent: p ? sig(p) : '', idx: p ? [...p.children].indexOf(el) : 0, siblings: p ? p.children.length : 0,
      position: s.position, text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      trans: { dur: s.transitionDuration, delay: s.transitionDelay, ease: s.transitionTimingFunction, prop: s.transitionProperty },
      anim: { name: s.animationName, dur: s.animationDuration, delay: s.animationDelay, ease: s.animationTimingFunction, iter: s.animationIterationCount, timeline: s.animationTimeline || '' },
      expect: el.closest('[data-expect]') ? { kind: el.closest('[data-expect]').dataset.expect, self: el.hasAttribute('data-expect') } : null,
      expectInside: [...el.querySelectorAll('[data-expect]')].map((x) => x.dataset.expect).slice(0, 4),
      rows: h.rows,
    });
  }
  return { steps: S.steps, series: out };
}

/* Бесконечные и идущие анимации (getAnimations): цель, имя, длительность, ключевые кадры. */
function animationsInPage() {
  return document.getAnimations().map((a) => {
    let t = {}; try { t = a.effect.getTiming(); } catch (e) { /* нет */ }
    let props = []; let first = '', last = '';
    try { const kf = a.effect.getKeyframes(); props = [...new Set(kf.flatMap((k) => Object.keys(k)).filter((k) => !/^(offset|computedOffset|easing|composite)$/.test(k)))]; first = JSON.stringify(kf[0] || {}).slice(0, 200); last = JSON.stringify(kf[kf.length - 1] || {}).slice(0, 200); } catch (e) { /* нет */ }
    const target = a.effect && a.effect.target;
    const i = target && window.__moEls ? window.__moEls.indexOf(target) : -1;
    const tl = a.timeline && a.timeline.constructor ? a.timeline.constructor.name : '';
    return { i, target: target ? sig(target) : '', pseudo: (a.effect && a.effect.pseudoElement) || '', kind: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || '',
      state: a.playState, duration: typeof t.duration === 'number' ? Math.round(t.duration) : String(t.duration || ''), delay: Math.round(t.delay || 0), easing: t.easing || '',
      iterations: t.iterations === Infinity ? 'infinite' : t.iterations, direction: t.direction || '', fill: t.fill || '', props, first, last, timeline: /Scroll|View/.test(tl) ? tl : '' };
  }).slice(0, 400);
}

/* События перехвата: разложить по индексам элементов. */
function eventsInPage() {
  const mo = window.__mo || { ev: [], waapi: [], cls: [], style: new Map() }; const els = window.__moEls || [];
  const idx = (el) => els.indexOf(el);
  const styleHot = [];
  for (const [el, s] of mo.style) if (s.n >= 5) styleHot.push({ i: idx(el), sig: sig(el), n: s.n, first: s.first, last: s.last });
  return {
    ev: mo.ev.map((e) => ({ t: e.t, type: e.type, i: idx(e.el), sig: e.el && e.el.nodeType === 1 ? sig(e.el) : '', name: e.name || '', prop: e.prop || '', dur: e.dur || 0, pseudo: e.pseudo || '' })),
    waapi: mo.waapi.map((w) => ({ ...w, el: undefined, i: idx(w.el), sig: w.el && w.el.nodeType === 1 ? sig(w.el) : '' })),
    cls: mo.cls.map((c) => ({ t: c.t, i: idx(c.el), sig: c.el && c.el.nodeType === 1 ? sig(c.el) : '', added: c.added, removed: c.removed })),
    styleHot: styleHot.sort((a, b) => b.n - a.n).slice(0, 60), capped: mo.capped,
  };
}

/* Образцы для наведения: кнопки, карточки-ссылки, пункты меню, ссылки в тексте — по одному на вид. */
function hoverCandidatesInPage(maxN) {
  const seen = new Set(); const out = []; const vw = innerWidth;
  const kindOf = (el) => {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    const hasImg = !!el.querySelector('img, picture, video, canvas, svg, [style*="background-image"]') || [...el.querySelectorAll('*')].some((x) => getComputedStyle(x).backgroundImage !== 'none');
    /* логотип: первая ссылка шапки, ссылка на главную или с «logo» в классе — свой вид, чтобы сверка не путала его с карточкой или меню */
    /* хлебные крошки — не шапка и не меню: «Главная» в них — ссылка в тексте, а не логотип */
    const crumbs = (n) => !!n && /crumb|хлебн|вы здесь|you are here/i.test(`${n.className || ''} ${n.getAttribute('aria-label') || ''}`);
    const head0 = el.closest('header, [class*="header"], nav'); const head = head0 && !crumbs(head0) ? head0 : null;
    const firstLink = head && head.querySelector('a[href]') === el;
    const href = el.getAttribute('href') || '';
    const isHome = href === '/' || href === './' || href === '#' || href === location.origin + '/';
    if (el.tagName === 'A' && (/logo/i.test(String(el.className || '')) || (head && ((firstLink && (!!el.querySelector('img, svg') || isHome)) || isHome)))) return 'logo';
    const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
    if (hasImg && r.width * r.height > 15000) return 'card';
    const inNav = el.closest('header, nav');
    if (inNav && !crumbs(inNav) && el.tagName === 'A' && !filled) return 'nav';
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || (filled && parseFloat(s.paddingLeft) >= 8) || parseFloat(s.borderTopWidth) >= 1) return 'button';
    if (el.tagName === 'A') return 'link';
    return '';
  };
  const els = [...document.querySelectorAll('a[href], button, [role="button"], [class*="card"]')];
  window.__moHover = [];
  for (const el of els) {
    const r = el.getBoundingClientRect(); if (!(r.width > 8 && r.height > 8)) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || parseFloat(s.opacity) < 0.1 || s.display === 'none') continue;
    const kind = kindOf(el); if (!kind) continue;
    const key = kind + ':' + el.tagName + '.' + [...el.classList].filter((c) => !/active|current|is-|js-/.test(c)).slice(0, 2).join('.');
    if (seen.has(key)) continue; seen.add(key);
    window.__moHover.push(el);
    out.push({ h: window.__moHover.length - 1, kind, sig: sig(el), text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), expect: el.closest('[data-expect]') ? el.closest('[data-expect]').dataset.expect : '' });
    if (out.length >= maxN) break;
  }
  return out;
}

/* Состояние элемента наведения: он сам, самая крупная картинка внутри, ::after/::before, первый текст. */
function hoverStateInPage(h) {
  const el = window.__moHover[h]; if (!el || !el.isConnected) return null;
  const pick = (x, pseudo) => { const s = getComputedStyle(x, pseudo || null); return { transform: s.transform, opacity: s.opacity, bg: s.backgroundColor, color: s.color, shadow: s.boxShadow, border: s.borderColor, filter: s.filter, deco: s.textDecorationLine, width: s.width, outline: s.outlineStyle !== 'none' ? s.outlineColor : '' }; };
  let pic = null, area = 0;
  for (const x of el.querySelectorAll('img, picture, video, canvas, div, span')) { const r = x.getBoundingClientRect(); const bg = getComputedStyle(x).backgroundImage !== 'none'; if ((/IMG|PICTURE|VIDEO|CANVAS/.test(x.tagName) || bg) && r.width * r.height > area) { area = r.width * r.height; pic = x; } }
  const durs = [el, pic].filter(Boolean).flatMap((x) => getComputedStyle(x).transitionDuration.split(',').map((d) => parseFloat(d) * (/ms/.test(d) ? 1 : 1000)));
  const pseudoDur = ['::after', '::before'].flatMap((p) => getComputedStyle(el, p).transitionDuration.split(',').map((d) => parseFloat(d) * (/ms/.test(d) ? 1 : 1000)));
  const r = el.getBoundingClientRect();
  return { self: pick(el), pic: pic ? pick(pic) : null, picSig: pic ? sig(pic) : '', after: pick(el, '::after'), before: pick(el, '::before'),
    dur: Math.round(Math.max(0, ...durs, ...pseudoDur)), box: { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }, ease: getComputedStyle(pic || el).transitionTimingFunction };
}

/* Для мыши: transform элементов первого экрана и центры закреплённых элементов. */
function mouseSnapInPage() {
  const els = window.__moEls || []; const vh = innerHeight; const out = {};
  for (let i = 0; i < els.length; i++) {
    const el = els[i]; if (!el.isConnected) continue; const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue;
    const s = getComputedStyle(el);
    out[i] = [s.transform, Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), s.position];
  }
  return out;
}

/* =====================================================================
   Разбор в Node
   ===================================================================== */

const round = (x, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; };
const pct = (x) => `${Math.round(x * 100)}%`;
function decompose(tf) {
  const id = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, rx: 0, ry: 0 };
  if (!tf) return id;
  let m = /^matrix\(([^)]+)\)$/.exec(tf);
  if (m) {
    const [a, b, c, d, e, f] = m[1].split(',').map(Number); const sx = Math.hypot(a, b);
    return { tx: e, ty: f, sx, sy: sx ? (a * d - b * c) / sx : 1, rot: Math.atan2(b, a) * 180 / Math.PI, rx: 0, ry: 0 };
  }
  m = /^matrix3d\(([^)]+)\)$/.exec(tf);
  if (m) {
    const v = m[1].split(',').map(Number);
    return { tx: v[12], ty: v[13], sx: Math.hypot(v[0], v[1], v[2]), sy: Math.hypot(v[4], v[5], v[6]), rot: Math.atan2(v[1], v[0]) * 180 / Math.PI,
      rx: Math.atan2(v[6], v[10]) * 180 / Math.PI, ry: Math.asin(Math.max(-1, Math.min(1, -v[2]))) * 180 / Math.PI };
  }
  return id;
}
const blurOf = (f) => { const m = /blur\(([\d.]+)px\)/.exec(f || ''); return m ? Number(m[1]) : 0; };
/* шторка: доля видимой площади по inset(…) в процентах/пикселях */
function clipShare(cp, w, h) {
  if (!cp) return 1;
  const m = /inset\(([^)]+)\)/.exec(cp); if (!m) return null;
  const parts = m[1].replace(/round.*$/, '').trim().split(/\s+/).map((x) => ({ v: parseFloat(x), pc: /%/.test(x) }));
  const [t, r, b, l] = parts.length === 1 ? [parts[0], parts[0], parts[0], parts[0]] : parts.length === 2 ? [parts[0], parts[1], parts[0], parts[1]] : parts.length === 3 ? [parts[0], parts[1], parts[2], parts[1]] : parts;
  const px = (q, size) => (q.pc ? q.v / 100 : size ? q.v / size : 0);
  return Math.max(0, 1 - px(l, w) - px(r, w)) * Math.max(0, 1 - px(t, h) - px(b, h));
}
const msOf = (s) => String(s || '').split(',').map((d) => parseFloat(d) * (/ms/.test(d) ? 1 : 1000)).filter((x) => !Number.isNaN(x));
const easeName = (e) => String(e || '').split(',')[0].trim();

/* подпись без состояний и номеров — для объединения одинаковых элементов */
function pattern(sig) {
  return String(sig || '').replace(/#[\w-]+/, '').split('.').filter((c, k) => k === 0 || !/^(in|is-|active|visible|show|shown|animated|aos-|t-animate_started|framer-v-|js-|done|loaded|current)/.test(c)).slice(0, 3).join('.');
}

/* Значения свойств по шагам: ряды разворачиваются на все шаги (значение держится до следующего ряда). */
function unroll(rows, nSteps) {
  const out = new Array(nSteps); let k = 0; let cur = rows[0][1];
  for (let s = 0; s < nSteps; s++) { while (k < rows.length && rows[k][0] <= s) { cur = rows[k][1]; k++; } out[s] = s < rows[0][0] ? null : cur; }
  return out;
}
function propsOf(v) {
  if (!v) return null;
  const d = decompose(v[4]);
  return { docTop: v[0], left: v[1], w: v[2], h: v[3], tx: d.tx, ty: d.ty, sc: (d.sx + d.sy) / 2, rot: d.rot, rx: d.rx, ry: d.ry, op: v[5], blur: blurOf(v[6]), clip: clipShare(v[7], v[2], v[3]), hid: v[8], bg: v[9], text: v[10], ptop: v[11], moved: !!v[4] };
}
const EPS = { tx: 0.6, ty: 0.6, sc: 0.012, rot: 0.6, rx: 0.8, ry: 0.8, op: 0.02, blur: 0.4, clip: 0.02 };
const NAMES = { tx: 'сдвиг X', ty: 'сдвиг Y', sc: 'масштаб', rot: 'поворот', rx: 'наклон X', ry: 'наклон Y', op: 'прозрачность', blur: 'размытие', clip: 'шторка (видно)' };
const UNIT = { tx: ' px', ty: ' px', rot: '°', rx: '°', ry: '°', blur: ' px', sc: '', op: '', clip: '' };
const fmtV = (k, v) => (k === 'clip' ? pct(v) : k === 'sc' || k === 'op' ? String(round(v, 2)) : `${round(v, 1)}${UNIT[k]}`);

/* линейная подгонка y = a + b·x и доля объяснённого разброса */
function fit(xs, ys) {
  const n = xs.length; if (n < 2) return { b: 0, a: ys[0] || 0, r2: 0 };
  const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const b = sxx ? sxy / sxx : 0; const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 1;
  return { b, a: my - b * mx, r2 };
}

/* ---------- фаза «без прокрутки»: петли, печать, счётчики, карусели ---------- */
function analyzeTime(el, steps, timeIdx, anims, finite, watch) {
  const vals = timeIdx.map((s) => propsOf(el.u[s])).filter(Boolean);
  if (vals.length < 3) return [];
  let ts = timeIdx.map((s) => steps[s].t);
  const items = [];
  /* текст листа: долгое частое наблюдение, если было, иначе замеры окна «время» */
  let texts = vals.map((v) => v.text);
  const fromWatch = !!(watch && watch.length >= 3);
  if (fromWatch) { texts = watch.map((w) => w[1]); ts = watch.map((w) => w[0]); }
  const distinct = [...new Set(texts)];
  if (distinct.length >= 3) {
    const nums = distinct.map((x) => Number(String(x).replace(/[\s ,]/g, '')));
    const shape = (x) => String(x).replace(/\d+/g, '#');
    const shapes = {}; for (const x of texts) shapes[shape(x)] = (shapes[shape(x)] || 0) + 1;
    const topShape = Object.entries(shapes).sort((a, b) => b[1] - a[1])[0];
    if (nums.every((x) => !Number.isNaN(x))) items.push({ kind: 'counter', trigger: 'load', props: [{ prop: 'текст', from: distinct[0], to: distinct[distinct.length - 1] }], timing: {} });
    else if (/#/.test(topShape[0]) && topShape[1] >= texts.length * 0.4 && new Set(texts.filter((x) => shape(x) === topShape[0])).size >= 3) items.push({ kind: 'counter', sub: 'цифры в тексте', trigger: 'time', props: [{ prop: 'текст', from: distinct[0], to: distinct[distinct.length - 1] }], timing: { note: `«${topShape[0]}» — числа меняются сами` } });
    else {
      let grow = 0, pairs = 0;
      for (let k = 1; k < texts.length; k++) { if (texts[k] === texts[k - 1]) continue; pairs++; if (texts[k].startsWith(texts[k - 1]) || texts[k - 1].startsWith(texts[k])) grow++; }
      /* слово — то, что допечаталось и начало стираться (последнее недопечатанное не в счёт) */
      const seq = texts.filter((w, q) => q === 0 || w !== texts[q - 1]);            /* подряд одинаковые — одним */
      const words = [...new Set(seq.filter((w, q) => q + 1 < seq.length && seq[q + 1].length < w.length && (q === 0 || seq[q - 1].length < w.length) && w.length > 1))];
      if (pairs && grow / pairs > 0.7) {
        /* скорость — по участкам набора и стирания целиком (между соседними замерами бывает и 1, и 3 знака) */
        const add = [], del = []; let q0 = 0;
        /* частое наблюдение пишет только смены текста: скорость — по соседним сменам (паузы на слове длиннее 1 с — не в счёт) */
        if (fromWatch) for (let k = 1; k < texts.length; k++) { const dl = texts[k].length - texts[k - 1].length, dt = (ts[k] - ts[k - 1]) / 1000; if (dt > 0 && dt < 1 && dl) (dl > 0 ? add : del).push(Math.abs(dl) / dt); }
        else for (let k = 1; k <= texts.length; k++) {
          const sg = k < texts.length ? Math.sign(texts[k].length - texts[k - 1].length) : 0; const sg0 = Math.sign(texts[Math.min(q0 + 1, texts.length - 1)].length - texts[q0].length);
          if (k === texts.length || (sg && sg0 && sg !== sg0)) { const dl = texts[k - 1].length - texts[q0].length, dt = (ts[k - 1] - ts[q0]) / 1000; if (dt > 0.15 && Math.abs(dl) >= 2) (dl > 0 ? add : del).push(Math.abs(dl) / dt); q0 = k - 1; }
        }
        const med = (a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
        /* ни одно слово не допечаталось до стирания за окно — показать самые длинные из увиденных */
        const seen = words.length ? words : [...new Set(seq)].filter((w) => w.length > 2 && !seq.some((o) => o !== w && o.startsWith(w))).sort((a, b) => b.length - a.length).slice(0, 3);
        items.push({ kind: 'typewriter', trigger: 'time', props: [{ prop: 'текст', from: '', to: seen.slice(0, 5).join(' / ') + (words.length ? '' : ' (видели не целиком)') }], timing: { speed: `набор ≈${round(med(add))} знаков/с${del.length ? `, стирание ≈${round(med(del))}/с` : ''}` } });
      } else items.push({ kind: 'rotating-words', trigger: 'time', props: [{ prop: 'текст', from: distinct[0], to: distinct.slice(1, 4).join(' / ') }], timing: {} });
    }
  }
  /* transform и прозрачность — по замерам окна «время» */
  ts = timeIdx.map((s) => steps[s].t);
  const cssLoop = anims.find((a) => a.i === el.i && a.iterations === 'infinite' && !a.timeline);
  if (finite) return items;                                      /* вход при загрузке — не петля: разберётся отдельно */
  for (const k of ['tx', 'ty', 'sc', 'rot', 'op']) {
    const ys = vals.map((v) => v[k]);
    /* одиночный выброс (соседи равны, между ними — скачок) — не движение: Framer на кадр растягивает контейнер */
    for (let q = 1; q + 1 < ys.length; q++) if (Math.abs(ys[q - 1] - ys[q + 1]) <= EPS[k] && Math.abs(ys[q] - ys[q - 1]) > EPS[k] * 3) ys[q] = ys[q - 1];
    const span = Math.max(...ys) - Math.min(...ys);
    if (span < EPS[k] * 3) continue;
    if (k === 'tx' || k === 'ty') { const rel = vals.map((v) => v[k] / Math.max(1, k === 'tx' ? v.w : v.h)); if (Math.max(...rel) - Math.min(...rel) < 0.02) continue; } /* translate(-50%) за меняющимся размером */
    const f = fit(ts, ys);
    if (cssLoop && cssLoop.props.some((p) => (k === 'op' ? p === 'opacity' : /transform|translate|rotate|scale/.test(p)))) continue; /* разберём по ключевым кадрам ниже */
    if ((k === 'tx' || k === 'ty') && f.r2 > 0.95 && Math.abs(f.b) * 1000 > 5) { items.push({ kind: 'marquee', trigger: 'time', props: [{ prop: NAMES[k], from: fmtV(k, ys[0]), to: fmtV(k, ys[ys.length - 1]) }], timing: { speed: `${round(Math.abs(f.b) * 1000)} px/с ${k === 'tx' ? (f.b < 0 ? 'влево' : 'вправо') : (f.b < 0 ? 'вверх' : 'вниз')}` }, source: 'js' }); continue; }
    /* ступеньки: значение стоит, потом прыгает — карусель */
    let jumps = 0, holds = 0; for (let q = 1; q < ys.length; q++) { if (Math.abs(ys[q] - ys[q - 1]) > EPS[k] * 3) jumps++; else holds++; }
    /* площадки: значение держится ≥3 замеров подряд; шаг — разница соседних площадок; до первого прыжка — стоит */
    const plats = []; for (let q = 2; q < ys.length; q++) if (Math.abs(ys[q] - ys[q - 1]) <= EPS[k] && Math.abs(ys[q - 1] - ys[q - 2]) <= EPS[k]) { const v = Math.round(ys[q]); if (!plats.length || Math.abs(plats[plats.length - 1] - v) > EPS[k] * 3) plats.push(v); }
    const firstMove = ys.findIndex((y, q) => q > 0 && Math.abs(y - ys[0]) > EPS[k] * 3);
    const heldBefore = firstMove > 0 ? (ts[firstMove] - ts[0]) : 0;
    if ((k === 'tx' || k === 'ty') && plats.length >= 2 && holds > jumps * 2 && heldBefore >= 600) {
      const dif = plats.slice(1).map((v, q) => Math.abs(v - plats[q])).sort((a, b) => a - b); const stepPx = dif[Math.floor(dif.length / 2)];
      items.push({ kind: 'carousel', trigger: 'time', props: [{ prop: NAMES[k], from: fmtV(k, plats[0]), to: fmtV(k, plats[plats.length - 1]) }], timing: { note: `шаг ≈${stepPx} px, листает сам` }, source: 'js' }); continue;
    }
    /* колебание — хотя бы два разворота; монотонное изменение без площадок — не петля */
    let turns = 0, dir = 0; for (let q = 1; q < ys.length; q++) { const dd = ys[q] - ys[q - 1]; if (Math.abs(dd) <= EPS[k]) continue; const sg = Math.sign(dd); if (dir && sg !== dir) turns++; dir = sg; }
    if (turns < 2 && k !== 'rot') continue;
    { const hN = Math.floor(ys.length / 2); const a1 = Math.max(...ys.slice(0, hN)) - Math.min(...ys.slice(0, hN)); const a2 = Math.max(...ys.slice(hN)) - Math.min(...ys.slice(hN));
      if (a2 < a1 * 0.5 || a2 < EPS[k] * 3) continue; }                  /* затухает — пружина доводится, это не петля */
    if (k === 'rot' && f.r2 > 0.9 && Math.abs(f.b) * 1000 < 3) continue;           /* медленный дрейф — доводка пружины после загрузки */
    if (k === 'rot' && f.r2 > 0.9) { items.push({ kind: 'loop', sub: 'вращение', trigger: 'time', props: [{ prop: 'поворот', from: '', to: '' }], timing: { speed: `${round(Math.abs(f.b) * 1000)}°/с` }, source: 'js' }); continue; }
    items.push({ kind: k === 'op' ? 'loop' : 'loop', sub: k === 'op' ? 'мигание' : k === 'sc' ? 'пульс' : 'колебание', trigger: 'time', props: [{ prop: NAMES[k], from: fmtV(k, Math.min(...ys)), to: fmtV(k, Math.max(...ys)) }], timing: {}, source: 'js' });
  }
  return items;
}

/* кадр анимации {"offset":0,"transform":"…"} → «transform: …; opacity: …» */
function kfText(json) {
  try { const o = JSON.parse(json); return Object.entries(o).filter(([k]) => !/^(offset|computedOffset|easing|composite)$/.test(k)).map(([k, v]) => `${k}: ${v}`).join('; '); } catch (e) { return String(json || '').slice(0, 60); }
}
const kfEase = (json) => { try { return JSON.parse(json).easing || ''; } catch (e) { return ''; } };
/* transform-матрица словами: «сдвиг Y −3 px», «масштаб 1.08», «поворот 45°» */
function tfWords(tf) {
  if (!tf || tf === 'none') return 'нет';
  if (!/^matrix/.test(tf)) return tf;
  const d = decompose(tf); const p = [];
  if (Math.abs(d.tx) >= 0.5) p.push(`сдвиг X ${round(d.tx, 1)} px`); if (Math.abs(d.ty) >= 0.5) p.push(`сдвиг Y ${round(d.ty, 1)} px`);
  if (Math.abs(d.sx - 1) > 0.005 || Math.abs(d.sy - 1) > 0.005) p.push(Math.abs(d.sx - d.sy) < 0.005 ? `масштаб ${round(d.sx, 2)}` : `масштаб ${round(d.sx, 2)}×${round(d.sy, 2)}`);
  if (Math.abs(d.rot) >= 0.5) p.push(`поворот ${round(d.rot, 1)}°`); if (Math.abs(d.rx) + Math.abs(d.ry) >= 0.5) p.push(`наклон ${round(d.rx, 1)}°/${round(d.ry, 1)}°`);
  return p.join(', ') || 'нет';
}

/* бесконечные CSS/WAAPI-анимации по ключевым кадрам */
function classifyLoop(a, kf, el) {
  const txt = `${a.first} ${a.last} ${(kf || []).map((f) => f.css).join(' ')}`;
  const dur = Number(a.duration) || 0;
  const trs = [...txt.matchAll(/translate(?:X|3d)?\((-?[\d.]+)(%|px)/g)].sort((p, q) => Math.abs(parseFloat(q[1])) - Math.abs(parseFloat(p[1])));
  const tr = trs[0] || null;
  if (/rotate\((-?)360deg\)|rotate\(1turn\)|rotate\(-?360/.test(txt)) return { kind: 'loop', sub: 'вращение', timing: { period: dur, speed: dur ? `${round(360 / (dur / 1000))}°/с` : '' } };
  if (tr && ((tr[2] === '%' && Math.abs(parseFloat(tr[1])) >= 25) || (tr[2] === 'px' && Math.abs(parseFloat(tr[1])) > 200))) {
    const v = parseFloat(tr[1]); const unit = tr[2];
    const dist = unit === '%' && el ? Math.abs(v) / 100 * el.w : Math.abs(v);
    return { kind: 'marquee', timing: { period: dur, speed: dur && dist ? `${round(dist / (dur / 1000))} px/с ${v < 0 ? 'влево' : 'вправо'}` : '' } };
  }
  if (/scale\(/.test(txt) && !/translate/.test(txt)) return { kind: 'loop', sub: 'пульс', timing: { period: dur } };
  if (/translateY|translate\(0(px)?,/.test(txt)) return { kind: 'loop', sub: 'парение', timing: { period: dur } };
  if (/opacity/.test(txt)) return { kind: 'loop', sub: 'мигание', timing: { period: dur } };
  if (/background-position|backgroundPosition/.test(txt)) return { kind: 'loop', sub: 'перелив фона', timing: { period: dur } };
  return { kind: 'loop', sub: 'другое', timing: { period: dur } };
}

/* ---------- фаза прокрутки ---------- */
function analyzeScroll(el, steps, scrollIdx, vh, ctx) {
  const items = [];
  const P = scrollIdx.map((s) => ({ s, sy: steps[s].sy, p: propsOf(el.u[s]) })).filter((x) => x.p);
  if (P.length < 3) return items;
  const top = (x) => x.p.docTop - x.sy;                           /* верх в окне */
  /* верх блока для отрезков прокрутки: у слоя с transform — верх родителя (масштаб и сдвиг искажают свой) */
  const btop = (x) => ((x.p.moved && Number.isFinite(x.p.ptop)) ? x.p.ptop : x.p.docTop) - x.sy;
  const fixedLike = el.position === 'fixed' || el.position === 'sticky';
  /* закреплённый: верх в окне стоит, пока прокрутка идёт */
  if (el.position === 'sticky' && P.every((x) => x.p.w > 0 && x.p.h > 0)) {
    let run = 0, best = 0, b0 = -1, bStart = -1;
    for (let k = 1; k < P.length; k++) { if (Math.abs(top(P[k]) - top(P[k - 1])) <= 2 && P[k].sy > P[k - 1].sy) { if (!run) b0 = k - 1; run++; if (run > best) { best = run; bStart = b0; } } else run = 0; }
    if (best >= 3) { const pinPx = P[bStart + best].sy - P[bStart].sy; items.push({ kind: 'pinned', sub: P[bStart].p.h < vh * 0.35 ? 'полоса' : 'раздел', trigger: 'scroll', props: [{ prop: 'закреплён', from: `верх на ${pct(Math.max(0, top(P[bStart])) / vh)} экрана`, to: `на ${round(pinPx)} px прокрутки` }], scroll: { rangePx: pinPx }, timing: {} }); }
  }
  /* шапка/прогресс — закреплённые у верха */
  if (el.position === 'fixed' && P[0].p.docTop - P[0].sy <= 10 && P[0].p.w >= ctx.vw * 0.8) {
    const widths = P.map((x) => x.p.w); const ws = fit(P.map((x) => x.sy), widths);
    if (P[0].p.h <= 12 && ws.b > 0 && ws.r2 > 0.8) { items.push({ kind: 'progress', trigger: 'scroll', props: [{ prop: 'ширина', from: `${Math.round(widths[0])} px`, to: `${Math.round(widths[widths.length - 1])} px` }], timing: {} }); return items; }
  }
  if (el.position === 'fixed' && P[0].p.docTop - P[0].sy <= 10 && P[0].p.h <= 12) {
    const widths = P.map((x) => x.p.w); if (widths[widths.length - 1] - widths[0] > ctx.vw * 0.3) { items.push({ kind: 'progress', trigger: 'scroll', props: [{ prop: 'ширина', from: `${Math.round(widths[0])} px`, to: `${Math.round(widths[widths.length - 1])} px` }], timing: {} }); return items; }
  }
  if (fixedLike && P[0].p.docTop - P[0].sy <= 10 && P[0].p.h < 220 && P[0].p.w >= ctx.vw * 0.6) {
    const bgs = [...new Set(P.map((x) => x.p.bg))]; const tys = P.map((x) => x.p.ty);
    const hid = tys.some((t) => t <= -P[0].p.h * 0.5); const back = ctx.upIdx.length && ctx.upIdx.some((s) => { const q = propsOf(el.u[s]); return q && q.ty > -2; });
    if (bgs.length > 1 || hid) {
      items.push({ kind: 'header', trigger: 'scroll', props: [...(bgs.length > 1 ? [{ prop: 'фон', from: bgs[0], to: bgs[bgs.length - 1] }] : []), ...(hid ? [{ prop: 'прячется при прокрутке вниз', from: '0', to: `${round(Math.min(...tys))} px` }] : [])],
        timing: { note: hid ? (back ? 'возвращается при прокрутке вверх' : 'при прокрутке вверх не вернулась') : '' } });
      return items;
    }
  }
  /* свойства: прыжок (появление) или привязка к прокрутке */
  for (const k of ['op', 'ty', 'tx', 'sc', 'rot', 'blur', 'clip']) {
    const ys = P.map((x) => x.p[k]);
    if (ys.some((y) => y === null)) continue;
    const span = Math.max(...ys) - Math.min(...ys);
    if (span < EPS[k] * 2) continue;
    if (ctx.timeChanged.has(k)) continue;                         /* это петля во времени, не прокрутка */
    /* отрезки изменения */
    const ch = []; for (let q = 1; q < P.length; q++) if (Math.abs(ys[q] - ys[q - 1]) > EPS[k]) ch.push(q);
    if (!ch.length) continue;
    let first = ch[0], last = ch[ch.length - 1];
    const contiguous = last - first + 1 === ch.length;
    if (ch.length >= 3) {                                          /* самый длинный участок в одну сторону */
      let bs = ch[0], be = ch[0], cs = ch[0], dir0 = Math.sign(ys[ch[0]] - ys[ch[0] - 1]);
      for (let q = 1; q < ch.length; q++) { const dq = Math.sign(ys[ch[q]] - ys[ch[q] - 1]); if (ch[q] === ch[q - 1] + 1 && dq === dir0) { if (ch[q] - cs > be - bs) { bs = cs; be = ch[q]; } } else { cs = ch[q]; dir0 = dq; } }
      if (be > bs) { first = bs; last = be; }
    }
    const from = ys[first - 1], to = ys[last];
    const vis = (q) => { const t = top(P[q]); return t < vh && t + P[q].p.h > 0; };
    if (ch.length <= 2 && contiguous && P.slice(last).every((x, j) => Math.abs(ys[last + j] - to) <= EPS[k] * 2)) {
      /* появление: изменилось за 1–2 шага у входа в экран и осталось */
      const tPrev = btop(P[first - 1]) / vh, tNow = btop(P[first]) / vh;
      /* закреплённое на экране (кнопка «Наверх», плавающая кнопка) стоит на одном месте окна — важна не его высота
         в окне, а где на странице оно меняется: у начала, у конца (подвал) или после N px прокрутки */
      const syMax = Math.max(...P.map((x) => x.sy)); const sy0 = P[first - 1].sy, sy1 = P[first].sy;
      const where = el.position === 'fixed'
        ? `закреплён на экране; меняется при прокрутке ${Math.round(sy0)}–${Math.round(sy1)} px из ${Math.round(syMax)} (${syMax - sy1 < vh * 0.6 ? 'у конца страницы' : sy1 <= vh * 1.2 ? 'сразу после начала' : `${Math.round((sy1 / Math.max(1, syMax)) * 100)}% страницы`}${vis(0) ? ', виден с начала' : ', в начале скрыт'})`
        : `верх блока между ${pct(Math.max(-0.2, Math.min(1.2, tPrev)))} и ${pct(Math.max(-0.2, Math.min(1.2, tNow)))} высоты экрана`;
      items.push({ kind: 'reveal', trigger: 'scroll', prop: k, from, to, props: [{ prop: NAMES[k], from: fmtV(k, from), to: fmtV(k, to) }],
        scroll: { at: where, atPct: Math.round(((tPrev + tNow) / 2) * 100), ...(el.position === 'fixed' ? { fixed: true, atPx: Math.round(sy1), ofPx: Math.round(syMax) } : {}) }, step: P[first].s, visAtStart: vis(0) });
      continue;
    }
    /* привязка к прокрутке: меняется несколько шагов подряд, почти линейно */
    const seg = P.slice(first - 1, last + 1); const sy = seg.map((x) => x.sy); const yv = seg.map((x) => x.p[k]);
    const f = fit(sy, yv);
    if (ch.length >= 2 && f.r2 > 0.8) {
      let t0 = btop(P[first - 1]) / vh, t1 = btop(P[last]) / vh;
      /* внутри отрезка значение идёт по прямой: где прямая даёт «из» и «в» — там и края (точнее шага прокрутки) */
      const inner = P.slice(first, last); 
      if (inner.length >= 2) {
        const g = fit(inner.map((x) => x.sy), inner.map((x) => x.p[k]));
        if (g.b && g.r2 > 0.9) {
          const ref = P[first - 1]; const topAt = (yy) => (btop(ref) - (yy - ref.sy)) / vh;
          const e0 = topAt((from - g.a) / g.b), e1 = topAt((to - g.a) / g.b);
          if (Number.isFinite(e0) && Number.isFinite(e1) && Math.abs(e0 - t0) < 0.5 && Math.abs(e1 - t1) < 0.5) { t0 = e0; t1 = e1; }
        }
      }
      const coef = (k === 'tx' || k === 'ty') ? round(f.b, 3) : null;
      if ((k === 'ty' || k === 'tx') && Math.abs(Math.abs(f.b) - 1) < 0.06 && el.position !== 'fixed') {
        items.push({ kind: 'pinned', trigger: 'scroll', props: [{ prop: 'держится сдвигом (pin)', from: fmtV(k, from), to: fmtV(k, to) }], scroll: { rangePx: round(sy[sy.length - 1] - sy[0]) }, timing: {} });
        continue;
      }
      const whole = first <= 2 && last >= P.length - 2;
      const isPar = (k === 'ty' || k === 'tx') && (whole || Math.abs(f.b) < 0.9);
      items.push({ kind: isPar && k === 'ty' ? 'parallax' : 'scroll-linked', sub: k === 'tx' ? 'лента вбок' : undefined, trigger: 'scroll', prop: k, from, to,
        props: [{ prop: NAMES[k], from: fmtV(k, from), to: fmtV(k, to) }],
        scroll: { from: `верх блока на ${pct(t0)} экрана`, to: `на ${pct(t1)}`, rangePx: round(sy[sy.length - 1] - sy[0]), coefficient: coef, startPct: Math.round(t0 * 100), endPct: Math.round(t1 * 100) } });
    } else if (ch.length >= 2) {
      items.push({ kind: 'scroll-linked', trigger: 'scroll', prop: k, from, to, props: [{ prop: NAMES[k], from: fmtV(k, from), to: fmtV(k, to) }], scroll: { note: `меняется на ${ch.length} шагах, не по прямой` }, confidence: 'средняя' });
    }
  }
  /* счётчик после входа в экран */
  const texts = P.map((x) => x.p.text); const nums = [...new Set(texts)].map((x) => Number(String(x).replace(/[\s ,]/g, ''))).filter((x) => !Number.isNaN(x));
  if (nums.length >= 2 && [...new Set(texts)].length >= 2 && nums[nums.length - 1] > nums[0]) items.push({ kind: 'counter', trigger: 'scroll', props: [{ prop: 'число', from: String(nums[0]), to: String(nums[nums.length - 1]) }], timing: {} });
  return items;
}

/* ---------- сборка ---------- */
function describeTrigger(it) {
  if (it.kind === 'reveal') return `прокрутка: ${it.scroll.at}${it.cause ? `; ${it.cause}` : ''}`;
  if (it.kind === 'parallax') return `прокрутка: сдвиг = коэффициент × прокрутка${it.coefs && it.coefs.length > 1 ? ` (слои: ${it.coefs.join(', ')})` : ` (${it.scroll.coefficient})`}`;
  if (it.kind === 'scroll-linked') return it.scroll && it.scroll.from ? `прокрутка: ${it.scroll.from} → ${it.scroll.to} (${it.scroll.rangePx} px)` : `прокрутка${it.scroll && it.scroll.note ? `: ${it.scroll.note}` : ''}`;
  return { load: 'загрузка', time: 'время (само)', scroll: 'прокрутка', hover: 'наведение', mouse: 'движение мыши' }[it.trigger] || it.trigger;
}
function describeTiming(it) {
  const t = it.timing || {}; const p = [];
  if (t.duration) p.push(`${t.duration} мс`); if (t.easing) p.push(t.easing); if (t.delay) p.push(`задержка ${t.delay} мс`);
  if (t.stagger) p.push(`по очереди +${t.stagger} мс`); if (t.period) p.push(`период ${round(t.period / 1000, 1)} с`); if (t.speed) p.push(t.speed); if (t.note) p.push(t.note);
  if (it.scroll && it.scroll.coefficient !== null && it.scroll.coefficient !== undefined) p.push(`коэффициент ${it.scroll.coefficient} (px сдвига на px прокрутки)`);
  return p.join(', ') || '—';
}
const RECIPE = { entrance: 'entrance', reveal: 'reveal', 'scroll-linked': 'scroll-scrub', parallax: 'parallax', pinned: 'pin', header: 'header-scroll', progress: 'scroll-progress',
  marquee: 'marquee', typewriter: 'typewriter', 'rotating-words': 'rotating-words', counter: 'counter', carousel: 'carousel-auto', loop: 'loop', hover: 'hover', mouse: 'mouse-tilt', cursor: 'custom-cursor', canvas: 'canvas', video: 'video-bg' };
const KIND_RU = { entrance: 'вход при загрузке', reveal: 'появление', 'scroll-linked': 'привязано к прокрутке', parallax: 'параллакс', pinned: 'закреплённый раздел', header: 'шапка при прокрутке', progress: 'прогресс прокрутки',
  marquee: 'бегущая строка', typewriter: 'печатающийся текст', 'rotating-words': 'смена слов', counter: 'счётчик', carousel: 'карусель сама', loop: 'петля', hover: 'наведение', mouse: 'реакция на мышь', cursor: 'свой курсор', canvas: 'холст рисует', video: 'видео-фон' };

async function inventory(url, vpSpec, { out, tag, timeMs = 6000, hoverN = 14, doHover = true, doMouse = true, doScroll = true, crops = true, quiet = false, debug = false } = {}) {
  const say = (s) => { if (!quiet) console.log(s); };
  const rv = resolveViewport(vpSpec || 'desktop'); if (!rv) die(`Неизвестный экран: ${vpSpec}`);
  const [vpName, vp] = rv;
  const browser = await launch();
  const t0 = Date.now();
  const result = { url, viewport: vpName, size: `${vp.width}×${vp.height}@${vp.deviceScaleFactor || 1}`, takenAt: new Date().toISOString(), items: [], libs: {}, notes: [] };
  try {
    const page = await preparePage(browser, vp, {});
    await page.evaluateOnNewDocument(instrument);
    const tLoad0 = Date.now();
    await gotoRetry(page, url, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await waitForOverlay(page, 4000).catch(() => null);
    /* окно cookie закрыть до замеров: оно перекрывает первый экран на вырезках и ловит наведение */
    result.consent = consentNote(await closeConsent(page).catch((e) => ({ found: false, error: String(e.message || e).slice(0, 100) })));
    const deps = { sig: SIG_FN };
    result.libs = await evaluateWith(page, libsInPage, null, deps);
    const n = await evaluateWith(page, collectInPage, 5000, deps);
    say(`Страница открыта за ${round((Date.now() - tLoad0) / 1000, 1)} с · элементов под наблюдением: ${n} · ${result.libs.libs.join(', ') || 'библиотек движения не видно'}`);

    /* 1. без прокрутки: время */
    const timeSteps = [];
    const tEnd = Date.now() + timeMs;
    while (Date.now() < tEnd) { timeSteps.push((await evaluateWith(page, sampleInPage, 'time', deps)).step); await sleep(110); }
    const animsTop = await evaluateWith(page, animationsInPage, null, deps);
    /* текст, который менялся: наблюдать чаще и дольше — слово печатается, держится секунды и стирается */
    const txtIdx = await evaluateWith(page, textCandidatesInPage, null, deps);
    const textWatch = txtIdx.length ? await evaluateWith(page, textWatchInPage, { idx: txtIdx, ms: 9000 }, deps) : {};

    /* 2. прокрутка */
    const scrollSteps = []; const upSteps = [];
    if (doScroll) {
      await scrollToY(page, 0); await sleep(300);
      let H = await evaluateWith(page, detectScrollerInPage, null, deps);
      const step = Math.max(Math.round(vp.height * 0.25), Math.ceil((H - vp.height) / 80));
      const settle = async () => {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        let prev = null;
        for (let i = 0; i < 6; i++) { await sleep(150); const s = await evaluateWith(page, hotHashInPage, null, deps); if (prev && s.h === prev.h && !s.busy) break; prev = s; }
      };
      for (let y = 0; ; y += step) {
        const target = Math.min(y, H - vp.height); await scrollToY(page, target); await settle();
        scrollSteps.push((await evaluateWith(page, sampleInPage, 'scroll', deps)).step);
        H = await page.evaluate(() => { const sc = window.__rwScroller; return sc && sc.isConnected ? sc.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0); });
        if (target >= H - vp.height || scrollSteps.length > 140) break;
      }
      const bottom = await page.evaluate(() => { const sc = window.__rwScroller; return sc && sc.isConnected ? sc.scrollTop : scrollY; });
      for (const k of [0.6, 1.4]) { await scrollToY(page, Math.max(0, bottom - vp.height * k)); await settle(); upSteps.push((await evaluateWith(page, sampleInPage, 'up', deps)).step); }
    }
    /* 3. мышь по первому экрану (после прокрутки — вернуться наверх) */
    let mouse = null;
    if (doMouse) {
      await scrollToY(page, 0); await sleep(400);
      const snaps = []; const pts = [[0.25, 0.35], [0.75, 0.35], [0.75, 0.75], [0.25, 0.75]];
      for (const [fx, fy] of pts) { await page.mouse.move(vp.width * fx, vp.height * fy, { steps: 8 }); await sleep(380); snaps.push({ x: vp.width * fx, y: vp.height * fy, s: await evaluateWith(page, mouseSnapInPage, null, deps) }); }
      await page.mouse.move(1, 1); mouse = snaps;
    }

    /* 4. наведение — последним: прыгает по странице */
    const hovers = [];
    if (doHover) {
      const cands = await evaluateWith(page, hoverCandidatesInPage, hoverN, deps);
      for (const c of cands) {
        try {
          await page.evaluate((h) => window.__moHover[h].scrollIntoView({ block: 'center', behavior: 'instant' }), c.h); await sleep(200);
          const before = await evaluateWith(page, hoverStateInPage, c.h, deps); if (!before) continue;
          await page.mouse.move(before.box.x, before.box.y, { steps: 4 });
          await sleep(Math.min(1500, before.dur + 150));
          const after = await evaluateWith(page, hoverStateInPage, c.h, deps);
          await page.mouse.move(1, 1); await sleep(Math.min(800, before.dur + 50));
          if (after) hovers.push({ ...c, before, after });
        } catch (e) { /* элемент ушёл — дальше */ }
      }
      await scrollToY(page, 0); await sleep(300);
    }

    const animsEnd = await evaluateWith(page, animationsInPage, null, deps);
    const ev = await evaluateWith(page, eventsInPage, null, deps);
    const data = await evaluateWith(page, seriesOutInPage, null, deps);
    const kfNames = [...new Set([...animsTop, ...animsEnd].filter((a) => a.kind === 'CSSAnimation').map((a) => a.name).concat(ev.ev.filter((e) => e.type === 'anim').map((e) => e.name)))].slice(0, 80);
    const kf = await evaluateWith(page, keyframesInPage, kfNames, deps);

    if (debug) writeJson(path.join(out, "motion", `${tag}.series.json`), { steps: data.steps, series: data.series.map((x) => ({ ...x, u: undefined })), timeIdx: timeSteps, scrollIdx: scrollSteps, upIdx: upSteps, anims: animsTop, textWatch });
    /* ---------- разбор ---------- */
    const steps = data.steps; const nSteps = steps.length;
    const timeIdx = timeSteps; const scrollIdx = scrollSteps;
    const vw = vp.width, vh = vp.height;
    const items = [];
    const byI = new Map(data.series.map((s) => [s.i, s]));
    for (const el of data.series) el.u = unroll(el.rows, nSteps);
    const loopTargets = new Set(animsTop.filter((a) => a.iterations === 'infinite' && !a.timeline).map((a) => a.i));
    /* конечные анимации и переходы, начавшиеся в первые 1.5 с окна «время» без нашего участия, — вход при загрузке */
    const tTime0 = steps[timeIdx[0]] ? steps[timeIdx[0]].t : 0;
    const finiteEls = new Set([...ev.ev.filter((e) => (e.type === 'anim-end' || e.type === 'trans-end') && e.t <= tTime0 + 1500).map((e) => e.i), ...ev.waapi.filter((w) => w.t <= tTime0 + 1500 && w.iterations !== 'infinite').map((w) => w.i)].filter((i) => i >= 0 && !loopTargets.has(i)));
    for (const el of data.series) {
      /* какие свойства менялись во времени (петли) — их прокрутке не приписываем */
      const tv = timeIdx.slice(Math.floor(timeIdx.length / 2)).map((s) => propsOf(el.u[s])).filter(Boolean);
      const timeChanged = new Set();
      for (const k of ['tx', 'ty', 'sc', 'rot', 'op', 'blur', 'clip']) { const ys = tv.map((v) => v[k]); if (ys.length > 2 && Math.max(...ys) - Math.min(...ys) > EPS[k] * 2) timeChanged.add(k); }
      if (tv.length > 2 && new Set(tv.map((v) => v.text)).size > 2) timeChanged.add('text');
      for (const it of analyzeTime(el, steps, timeIdx, animsTop, finiteEls.has(el.i), textWatch[el.i])) items.push({ ...it, i: el.i, el });
      if (loopTargets.has(el.i)) { for (const k of ['tx', 'ty', 'sc', 'rot', 'op']) timeChanged.add(k); }
      for (const it of analyzeScroll(el, steps, scrollIdx, vh, { vw, upIdx: upSteps, timeChanged })) items.push({ ...it, i: el.i, el });
    }
    /* бесконечные анимации (CSS/WAAPI): по ключевым кадрам */
    const seenLoop = new Set();
    for (const a of animsTop.filter((x) => x.iterations === 'infinite' && !x.timeline)) {
      const key = `${a.target}|${a.name}|${a.pseudo}`; if (seenLoop.has(key)) continue; seenLoop.add(key);
      const el = byI.get(a.i) || { i: a.i, sig: a.target, text: '', rows: [], u: [] };
      const p0 = el.u && el.u.length ? propsOf(el.u.find(Boolean)) : null;
      const c = classifyLoop(a, kf[a.name], p0);
      const frames = kf[a.name] && kf[a.name].length ? kf[a.name].map((q) => `${q.at}: ${q.css}`).join(' · ') : '';
      items.push({ ...c, trigger: 'time', props: [{ prop: `${a.pseudo ? a.pseudo + ' ' : ''}кадры`, from: frames ? '' : kfText(a.first), to: frames || kfText(a.last) }],
        timing: { ...c.timing, easing: easeName(kfEase(a.first) || a.easing), period: Number(a.duration) || c.timing.period }, source: a.kind === 'CSSAnimation' ? `css @keyframes ${a.name}` : 'element.animate', i: a.i, el, pseudo: a.pseudo });
    }
    /* CSS scroll-driven: анимации на временной шкале прокрутки */
    for (const a of animsEnd.filter((x) => x.timeline)) {
      const el = byI.get(a.i); const dup = items.find((x) => x.i === a.i && x.kind === 'scroll-linked');
      if (dup) { dup.source = `CSS animation-timeline (${a.timeline}) @keyframes ${a.name}`; continue; }
      items.push({ kind: 'scroll-linked', trigger: 'scroll', props: [{ prop: 'кадры', from: kfText(a.first), to: kfText(a.last) }], scroll: { note: `CSS animation-timeline (${a.timeline})` }, timing: {}, source: `css @keyframes ${a.name}`, i: a.i, el: el || { sig: a.target } });
    }
    /* вход при загрузке: события до конца фазы «время» у элементов первого экрана */
    const tTimeEnd = steps[timeIdx[timeIdx.length - 1]] ? steps[timeIdx[timeIdx.length - 1]].t : Infinity;
    const entrance = new Map();
    for (const e of ev.ev.filter((x) => (x.type === 'anim-end' || x.type === 'trans-end') && x.t <= tTimeEnd + 200)) {
      const el = byI.get(e.i); const key = `${pattern(e.sig)}|${e.name || e.prop}`;
      if (loopTargets.has(e.i)) continue;
      const g = entrance.get(key) || { sig: e.sig, name: e.name, prop: e.prop, durs: [], starts: [], n: 0, i: e.i, el };
      g.durs.push(e.dur); g.n++; entrance.set(key, g);
    }
    for (const w of ev.waapi.filter((x) => x.t <= tTimeEnd && x.iterations !== 'infinite')) {
      const key = `${pattern(w.sig)}|waapi`; const g = entrance.get(key) || { sig: w.sig, name: 'element.animate', prop: w.props.join(', '), durs: [], n: 0, i: w.i, el: byI.get(w.i), waapi: w }; g.durs.push(w.duration || 0); g.n++; entrance.set(key, g);
    }
    for (const g of entrance.values()) {
      const el = g.el; const p0 = el ? propsOf(el.u.find(Boolean)) : null; const p1 = el ? propsOf(el.u[timeIdx[timeIdx.length - 1]] || el.u.find(Boolean)) : null;
      const first = g.waapi ? g.waapi.first : (kf[g.name] && kf[g.name][0] ? kf[g.name][0].css : '');
      const last = g.waapi ? g.waapi.last : (kf[g.name] && kf[g.name].length ? kf[g.name][kf[g.name].length - 1].css : '');
      const isScrollReveal = items.some((x) => x.i === g.i && ['reveal', 'carousel', 'marquee', 'loop', 'typewriter', 'rotating-words', 'counter'].includes(x.kind));
      if (isScrollReveal) continue;
      items.push({ kind: 'entrance', trigger: 'load', props: [{ prop: g.prop || g.name, from: first.slice(0, 70) || (p0 ? `прозрачность ${p0.op}` : ''), to: last.slice(0, 70) || (p1 ? `прозрачность ${p1.op}` : '') }],
        timing: { duration: Math.max(...g.durs), easing: g.waapi ? g.waapi.easing : (el ? easeName(g.name ? el.anim.ease : el.trans.ease) : '') }, source: g.waapi ? 'element.animate' : (g.name ? `css @keyframes ${g.name}` : `переход ${g.prop}`), i: g.i, el: el || { sig: g.sig }, count: g.n > 1 ? g.n : undefined });
    }
    /* появления: причина (класс, событие) и длительность */
    for (const it of items.filter((x) => x.kind === 'reveal')) {
      const cls = ev.cls.filter((c) => c.i === it.i && c.added.length);
      if (cls.length) it.cause = `класс «${cls[0].added.slice(0, 2).join(' ')}» при входе в экран (IntersectionObserver)`;
      const ends = ev.ev.filter((e) => e.i === it.i && (e.type === 'trans-end' || e.type === 'anim-end'));
      const wa = ev.waapi.filter((w) => w.i === it.i && w.iterations !== 'infinite');
      if (it.prop === 'op' && it.to < it.from) it.sub = 'исчезает';
      const el = it.el;
      const dur = ends.length ? Math.max(...ends.map((e) => e.dur)) : Math.max(0, ...msOf(el.trans.dur), ...msOf(el.anim.dur));
      const delay = Math.max(0, ...msOf(el.trans.delay), ...msOf(el.anim.delay));
      it.timing = { duration: Math.round(dur) || undefined, easing: easeName(ends.length && ends[0].type === 'anim-end' ? el.anim.ease : el.trans.ease), delay: delay || undefined };
      if (!ends.length && wa.length) { it.timing.duration = wa[wa.length - 1].duration || undefined; it.timing.easing = wa[wa.length - 1].easing || it.timing.easing; it.timing.delay = wa[wa.length - 1].delay || it.timing.delay; it.source = 'element.animate'; }
      else if (!ends.length && !dur) it.timing.note = 'без CSS-перехода — рисует скрипт (длительность по кадрам не видна)';
      if (ev.styleHot.some((s) => s.i === it.i)) it.source = 'скрипт (style меняется покадрово)';
    }
    /* наведение */
    for (const hv of hovers) {
      const HN = { transform: 'transform', bg: 'фон', color: 'цвет', shadow: 'тень', border: 'рамка', filter: 'фильтр', deco: 'подчёркивание', opacity: 'прозрачность', outline: 'обводка', width: 'ширина' };
      const human = (k, v) => (k === 'transform' ? tfWords(v) : k === 'shadow' ? (v === 'none' ? 'нет' : String(v).slice(0, 48)) : String(v).slice(0, 50));
      const d = []; const cmp = (label, a, b, keys) => { if (!a || !b) return; for (const k of keys) if (a[k] !== b[k]) d.push({ prop: `${label}${HN[k] || k}`, from: human(k, a[k]), to: human(k, b[k]) }); };
      cmp('', hv.before.self, hv.after.self, ['transform', 'bg', 'color', 'shadow', 'border', 'filter', 'deco', 'opacity', 'outline']);
      cmp('картинка: ', hv.before.pic, hv.after.pic, ['transform', 'filter', 'opacity']);
      cmp('::after ', hv.before.after, hv.after.after, ['transform', 'width', 'opacity', 'bg']);
      cmp('::before ', hv.before.before, hv.after.before, ['transform', 'width', 'opacity', 'bg']);
      if (!d.length) continue;
      const sub = d.some((x) => /^картинка/.test(x.prop) && /transform/.test(x.prop)) ? 'картинка крупнее' : d.some((x) => /::(after|before)/.test(x.prop)) ? 'линия' : d.some((x) => x.prop === 'transform') ? 'сдвиг/масштаб' : d.some((x) => /тень/.test(x.prop)) ? 'тень' : 'цвет';
      items.push({ kind: 'hover', sub, trigger: 'hover', component: hv.kind, props: d.slice(0, 6), timing: { duration: hv.before.dur || undefined, easing: easeName(hv.before.ease) }, el: { sig: hv.sig, text: hv.text, expect: hv.expect ? { kind: hv.expect } : null }, hover: hv.h });
    }
    /* мышь */
    if (mouse) {
      const keys = new Set(Object.keys(mouse[0].s));
      for (const i of keys) {
        const tfs = mouse.map((m) => m.s[i] && m.s[i][0]); if (tfs.some((x) => x === undefined)) continue;
        const el = byI.get(Number(i)) || null; const tv = el ? timeIdx.map((s) => propsOf(el.u[s])).filter(Boolean) : [];
        const loops = el && tv.length > 2 && new Set(tv.map((v) => v && v.tx + ',' + v.ty + ',' + v.sc)).size > 2;
        if (new Set(tfs).size < 2 || loops) continue;
        const pos = mouse.map((m) => m.s[i]); const fixed = pos[0][3] === 'fixed' || pos[0][3] === 'absolute';
        const near = mouse.every((m, k) => Math.hypot(pos[k][1] - m.x, pos[k][2] - m.y) < 40);
        const ds = tfs.map(decompose);
        const mEl = el || { sig: '', text: '' };
        if (near && fixed) { items.push({ kind: 'cursor', trigger: 'mouse', props: [{ prop: 'следует за мышью', from: '', to: '' }], timing: {}, i: Number(i), el: mEl }); continue; }
        const rot = Math.max(...ds.map((x) => Math.abs(x.rx) + Math.abs(x.ry)));
        const mv = Math.max(...ds.map((x) => Math.hypot(x.tx - ds[0].tx, x.ty - ds[0].ty)));
        if (rot < 0.8 && mv < 2) continue;
        items.push({ kind: 'mouse', sub: rot >= 0.8 ? 'наклон' : 'параллакс', trigger: 'mouse', props: [{ prop: rot >= 0.8 ? 'наклон X/Y' : 'сдвиг', from: '0', to: rot >= 0.8 ? `до ${round(rot, 1)}°` : `до ${round(mv)} px` }], timing: {}, i: Number(i), el: mEl });
      }
    }
    /* холсты и видео */
    const media = await page.evaluate(async () => {
      const vids = [...document.querySelectorAll('video')].map((v) => ({ sig: v.tagName.toLowerCase() + (v.className ? '.' + String(v.className).split(' ')[0] : ''), t0: v.currentTime, autoplay: v.autoplay, loop: v.loop, muted: v.muted, w: Math.round(v.getBoundingClientRect().width), h: Math.round(v.getBoundingClientRect().height), el: v }));
      await new Promise((r) => setTimeout(r, 600));
      const canv = [...document.querySelectorAll('canvas')].map((c) => { const r = c.getBoundingClientRect(); return { sig: 'canvas' + (c.className ? '.' + String(c.className).split(' ')[0] : ''), ctx: c.__rwCtx || '?', w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top + scrollY), x: Math.round(r.left), expect: c.closest('[data-expect]') ? c.closest('[data-expect]').dataset.expect : '' }; }).filter((c) => c.w * c.h > 2000);
      return { videos: vids.map((v) => ({ ...v, el: undefined, playing: v.el.currentTime > v.t0 })), canvases: canv };
    });
    for (const v of media.videos.filter((x) => x.playing && x.w * x.h > 20000)) items.push({ kind: 'video', trigger: 'load', props: [{ prop: 'видео', from: '', to: `${v.w}×${v.h}${v.loop ? ', по кругу' : ''}${v.muted ? ', без звука' : ''}` }], timing: {}, el: { sig: v.sig } });
    let sharp = null; try { sharp = loadSharp(); } catch (e) { /* без sharp — «движется ли — не проверено» */ }
    for (const c of media.canvases.slice(0, 4)) {
      let animated = null;
      try {
        await scrollToY(page, Math.max(0, c.y - vh / 3)); await sleep(250);
        const box = await page.evaluate((cc) => { const el = [...document.querySelectorAll('canvas')].find((x) => Math.round(x.getBoundingClientRect().top + scrollY) === cc.y) || document.querySelector('canvas'); const r = el.getBoundingClientRect(); const x = Math.max(0, r.left), y = Math.max(0, r.top); /* область снимка — в координатах документа (puppeteer 25) */ return { x: x + scrollX, y: y + scrollY, width: Math.min(r.right, innerWidth) - x, height: Math.min(r.bottom, innerHeight) - y }; }, c);
        if (sharp && box.width > 4 && box.height > 4) {
          const a = await page.screenshot({ clip: box, captureBeyondViewport: false }); await sleep(600); const b = await page.screenshot({ clip: box, captureBeyondViewport: false });
          const [ra, rb] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer(), sharp(b).removeAlpha().raw().toBuffer()]);
          let diff = 0; for (let q = 0; q + 2 < Math.min(ra.length, rb.length); q += 3) if (Math.abs(ra[q] - rb[q]) + Math.abs(ra[q + 1] - rb[q + 1]) + Math.abs(ra[q + 2] - rb[q + 2]) > 30) diff++;
          animated = diff / (ra.length / 3) > 0.002;
        }
      } catch (e) { c.err = String(e.message || e).slice(0, 120); }
      if (animated === false) continue;
      items.push({ kind: 'canvas', trigger: 'time', props: [{ prop: `холст ${c.ctx}`, from: '', to: `${c.w}×${c.h}${animated === null ? `, движется ли — не проверено${c.err ? ' (' + c.err + ')' : ''}` : ', рисует движение'}` }], timing: {}, el: { sig: c.sig, expect: c.expect ? { kind: c.expect } : null } });
    }

    /* по очереди: появления у соседей с растущей задержкой */
    const reveals = items.filter((x) => x.kind === 'reveal');
    const groups = new Map();
    for (const r of reveals) { const key = `${r.el.parent}|${pattern(r.el.sig)}|${r.prop}`; const g = groups.get(key) || []; g.push(r); groups.set(key, g); }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const delays = g.map((r) => r.timing.delay || 0).sort((a, b) => a - b); const dd = delays.slice(1).map((d, k) => d - delays[k]).filter((x) => x > 0);
      if (dd.length) for (const r of g) r.timing.stagger = Math.round(dd.reduce((a, b) => a + b, 0) / dd.length);
    }
    /* одно появление = одно движение: у элемента несколько свойств (прозрачность + сдвиг) — склеить */
    /* у слоя параллакса поворот/масштаб тоже от прокрутки — одной строкой со сдвигом */
    for (const it of items.filter((x) => x.kind === 'scroll-linked' && x.i !== undefined)) { const par = items.find((x) => x.kind === 'parallax' && x.i === it.i); if (par) { par.props.push(...it.props); it.kind = '_merged'; } }
    const merged = [];
    for (const it of items.filter((x) => x.kind !== '_merged')) {
      const twin = merged.find((m) => m.kind === it.kind && m.kind !== 'hover' && m.i !== undefined && m.i === it.i && (it.kind === 'reveal' ? m.step === it.step : true) && m.trigger === it.trigger);
      if (twin) { twin.props.push(...it.props.filter((p) => !twin.props.some((q) => q.prop === p.prop))); if (it.scroll && twin.scroll && !twin.scroll.coefficient && it.scroll.coefficient) twin.scroll.coefficient = it.scroll.coefficient; continue; }
      merged.push({ ...it, props: [...it.props] });
    }
    /* одинаковые элементы — одной строкой ×N */
    const final = [];
    for (const it of merged) {
      const r1 = (x) => String(x).replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m) * 10) / 10)); /* 0.51 и 0.5 — одно и то же движение */
      const key = `${it.kind}|${it.sub || ''}|${pattern(it.el.sig)}|${it.props.map((p) => p.prop + ':' + r1(p.from) + '>' + r1(p.to)).join(';')}|${it.el.parent || ''}`;
      const same = final.find((f) => f._key === key
        || (f.kind === it.kind && it.kind === 'reveal' && pattern(f.el.sig) === pattern(it.el.sig) && f.el.parent === it.el.parent)
        || (f.kind === 'reveal' && it.kind === 'reveal' && f.sub === it.sub && f.props.map((p) => p.prop + p.from + p.to).join() === it.props.map((p) => p.prop + p.from + p.to).join() && (f.timing.duration || 0) === (it.timing.duration || 0))
        || (f.kind === 'scroll-linked' && it.kind === 'scroll-linked' && f.props.map((p) => p.prop + r1(p.from) + r1(p.to)).join() === it.props.map((p) => p.prop + r1(p.from) + r1(p.to)).join())
        || (f.kind === 'hover' && it.kind === 'hover' && f.component === it.component && f.sub === it.sub && f.props.map((p) => p.prop + p.from + p.to).join() === it.props.map((p) => p.prop + p.from + p.to).join())
        || (f.kind === 'parallax' && it.kind === 'parallax' && f.el.parent && f.el.parent === it.el.parent));
      if (same) { same.count = (same.count || 1) + 1; if (same.examples.length < 3) same.examples.push(it.el.sig); if (it.kind === 'parallax' && it.scroll) same.coefs.push(it.scroll.coefficient); continue; }
      final.push({ ...it, _key: key, count: it.count || 1, examples: [it.el.sig], coefs: it.scroll && it.kind === 'parallax' ? [it.scroll.coefficient] : [] });
    }
    /* номера, рецепты, вырезки */
    let k = 0;
    const cropDir = path.join(out, 'motion', tag);
    if (crops) ensureDir(cropDir);
    for (const it of final) {
      k++; it.id = `m${String(k).padStart(2, '0')}`; it.recipe = RECIPE[it.kind] || it.kind;
      it.target = it.el.sig; it.text = it.el.text || ''; it.expect = it.el.expect ? it.el.expect.kind : (it.el.expectInside && it.el.expectInside[0]) || '';
      if (crops && (it.i !== undefined || it.hover !== undefined)) {
        try {
          const box = await page.evaluate((ref) => {
            const el = ref.hover !== undefined ? window.__moHover[ref.hover] : window.__moEls[ref.i]; if (!el || !el.isConnected) return null;
            el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect();
            const x = Math.max(0, r.left - 12), y = Math.max(0, r.top - 12);
            /* область снимка — в координатах документа (puppeteer 25), внутри окна */
            return { x: x + scrollX, y: y + scrollY, width: Math.max(8, Math.min(innerWidth - x, r.width + 24)), height: Math.max(8, Math.min(innerHeight - y, r.height + 24)) };
          }, { i: it.i, hover: it.hover });
          if (box) { await sleep(250); const f = path.join(cropDir, `${it.id}.png`); await page.screenshot({ path: f, clip: box, captureBeyondViewport: false }); it.crop = path.relative(out, f).replace(/\\/g, '/'); }
        } catch (e) { /* без вырезки */ }
      }
      delete it.el; delete it._key; if (!it.coefs.length) delete it.coefs;
    }
    result.items = final;
    result.stats = { steps: { time: timeIdx.length, scroll: scrollIdx.length, up: upSteps.length }, observed: n, changed: data.series.length, events: ev.ev.length, waapi: ev.waapi.length, classChanges: ev.cls.length, capped: ev.capped, seconds: round((Date.now() - t0) / 1000, 1) };
    if (!result.libs.reducedRule) result.notes.push('правила prefers-reduced-motion в CSS нет — у нас обязательно (reference/motion.md)');
    if (ev.capped) result.notes.push('событий больше 8000 — часть не записана');
    await page.close();
  } finally { await browser.close(); }
  result.verdict = 'OK';
  return result;
}

/* ---------- отчёт ---------- */
function mdTable(res) {
  const L = [`# Движение: ${res.url} (${res.viewport} ${res.size})`, '',
    `Снято ${res.takenAt.slice(0, 16).replace('T', ' ')} · motion.mjs · за ${res.stats ? res.stats.seconds : '?'} с · окно cookie: ${res.consent || '—'} · библиотеки: ${res.libs.libs && res.libs.libs.length ? res.libs.libs.join(', ') : 'не видно'} · «меньше движения»: ${res.libs.reducedRule ? 'правило есть' : 'НЕТ'}${res.libs.smoothCss ? ' · html{scroll-behavior:smooth}' : ''}`, '',
    '| № | вид | где | запуск | что меняется | параметры | как повторить |', '|---|---|---|---|---|---|---|'];
  for (const it of res.items) {
    /* одинаковый эффект у разных элементов — назвать и остальные (до двух) */
    const others = [...new Set((it.examples || []).map(pattern))].filter((x) => x !== pattern(it.target)).slice(0, 2);
    const where = `\`${it.target}\`${it.count > 1 ? ` ×${it.count}` : ''}${others.length ? ` (и ${others.map((x) => `\`${x}\``).join(', ')})` : ''}${it.text ? ` «${it.text.slice(0, 28)}»` : ''}${it.crop ? ` [вырезка](${it.crop})` : ''}`;
    const what = it.props.map((p) => `${p.prop}${p.from || p.to ? `: ${p.from} → ${p.to}` : ''}`).join('; ');
    const par = describeTiming(it) + (it.coefs && it.coefs.length > 1 ? `; слои: ${it.coefs.join(', ')}` : '') + (it.source ? ` · ${it.source}` : '');
    L.push(`| ${it.id} | ${KIND_RU[it.kind] || it.kind}${it.sub ? ` (${it.sub})` : ''}${it.component ? `, ${it.component}` : ''} | ${where} | ${describeTrigger(it)} | ${what.replace(/\|/g, '/')} | ${par.replace(/\|/g, '/')} | \`${it.recipe}\` |`);
  }
  if (!res.items.length) L.push('| — | движения не найдено | | | | | |');
  L.push('', 'Рецепты — `reference/motion.md`. Решение по каждой строке донора — в analysis.md («Движение донора → блоки»);', 'сверка с нашим сайтом — `motion.mjs compare`.');
  if (res.notes.length) L.push('', ...res.notes.map((n) => `- ${n}`));
  return L.join('\n') + '\n';
}

/* ---------- сверка ---------- */
/* семейство для сверки: вид + то, что делает его другим движением */
const FAMILY = (it) => {
  if (it.kind === 'rotating-words' || it.kind === 'typewriter') return 'typewriter';
  if (it.kind === 'loop') return `loop:${it.sub || ''}`;
  if (it.kind === 'reveal') return it.sub === 'исчезает' ? 'reveal:out' : 'reveal:in';
  if (it.kind === 'hover') return `hover:${it.component || ''}`;
  if (it.kind === 'counter') return 'counter';
  return it.kind;
};
function nums(it) { const out = {}; for (const p of it.props || []) { const a = parseFloat(String(p.from).replace(',', '.')), b = parseFloat(String(p.to).replace(',', '.')); out[p.prop] = [a, b]; } return out; }
/* Появление, исчезание и привязка к прокрутке — одно и то же изменение, снятое по-разному: если отрезок не
   укладывается в проход (блок у конца короткой страницы), привязанное к прокрутке видно как скачок — «появление».
   Пара между ними — только когда у нас есть все свойства донора и числа близки. */
const SCROLL_GROUP = new Set(['reveal:in', 'reveal:out', 'scroll-linked']);
const kindRu = (it) => `${KIND_RU[it.kind] || it.kind}${it.sub ? ` (${it.sub})` : ''}`;
function similar(d, o) {
  const fd = FAMILY(d), fo = FAMILY(o);
  const cross = fd !== fo;
  if (cross && !(SCROLL_GROUP.has(fd) && SCROLL_GROUP.has(fo))) return { score: 0 };
  const diffs = []; let score = 1;
  if (d.kind === 'hover' && d.sub !== o.sub) { diffs.push(`наведение: у донора «${d.sub}», у нас «${o.sub}»`); score -= 0.3; }
  const nd = nums(d), no = nums(o);
  for (const [prop, [a, b]] of Object.entries(nd)) {
    if (!(prop in no)) {
      if (['reveal', 'scroll-linked', 'parallax', 'entrance'].includes(d.kind)) { diffs.push(`нет «${prop}» (${a} → ${b})`); score -= 0.25; }
      /* наведение: у донора меняется цвет, у нас — только подчёркивание — это другое наведение, а не то же */
      else if (d.kind === 'hover') { const pr = (d.props || []).find((x) => x.prop === prop); diffs.push(`у нас не меняется «${prop}»${pr ? ` (у донора ${pr.from} → ${pr.to})` : ''}`); score -= 0.15; }
      continue;
    }
    const [c, e] = no[prop];
    const bad = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) > Math.max(0.05, Math.abs(x) * 0.25);
    if (bad(a, c) || bad(b, e)) { diffs.push(`${prop}: у донора ${a} → ${b}, у нас ${c} → ${e}`); score -= 0.15; }
  }
  const dt = d.timing || {}, ot = o.timing || {};
  if (dt.duration && ot.duration && (ot.duration > dt.duration * 1.6 || ot.duration < dt.duration / 1.6)) { diffs.push(`длительность: ${dt.duration} → у нас ${ot.duration} мс`); score -= 0.1; }
  if (cross) {
    const keys = Object.keys(nd);
    if (!keys.length || diffs.length || !keys.every((k) => k in no)) return { score: 0 };
    return { score: 0.6, diffs: [], notes: [`у донора снято как «${kindRu(d)}», у нас — «${kindRu(o)}»: числа те же (вид зависит от того, уложился ли отрезок в проход прокрутки)`] };
  }
  if (d.scroll && o.scroll && Number.isFinite(d.scroll.startPct) && Number.isFinite(o.scroll.startPct) && (Math.abs(d.scroll.startPct - o.scroll.startPct) > 20 || Math.abs(d.scroll.endPct - o.scroll.endPct) > 20)) { diffs.push(`отрезок прокрутки: у донора ${d.scroll.startPct}% → ${d.scroll.endPct}%, у нас ${o.scroll.startPct}% → ${o.scroll.endPct}%`); score -= 0.1; }
  return { score: Math.max(0.05, score), diffs, notes: [] };
}
/* одно наше движение может закрывать несколько одинаковых у донора (одна анимация карточек на весь каталог) */
function compare(donor, ours, decisions) {
  const rows = []; const used = new Set();
  for (const d of donor.items) {
    let best = null;
    for (const o of ours.items) { const s = similar(d, o); if (s.score > 0 && (!best || s.score > best.s.score || (s.score === best.s.score && !used.has(o.id) && used.has(best.o.id)))) best = { o, s }; }
    const dec = decisions[d.id] || decisions[`${d.kind}:${pattern(d.target)}`] || decisions[d.kind];
    if (best) { used.add(best.o.id); rows.push({ d, o: best.o, status: best.s.diffs.length ? 'ОТЛИЧАЕТСЯ' : 'OK', diffs: best.s.diffs, notes: best.s.notes || [], decision: dec || '' }); }
    else rows.push({ d, o: null, status: dec ? 'РЕШЕНО' : 'НЕТ', diffs: [], notes: [], decision: dec || '' });
  }
  const extra = ours.items.filter((o) => !used.has(o.id));
  const miss = rows.filter((r) => r.status === 'НЕТ').length, diff = rows.filter((r) => r.status === 'ОТЛИЧАЕТСЯ' && !r.decision).length;
  const verdict = miss ? 'FAIL' : diff ? 'WARN' : 'OK';
  return { rows, extra, verdict, miss, diff };
}
function mdCompare(c, donor, ours) {
  const L = [`# Сверка движения: донор → наш сайт`, '', `Донор: ${donor.url} (${donor.viewport}) · наш: ${ours.url} (${ours.viewport}) · вердикт **${c.verdict}** (нет без решения: ${c.miss}, отличается: ${c.diff})`, '',
    '| донор | вид | у донора | у нас | статус | разница / решение |', '|---|---|---|---|---|---|'];
  for (const r of c.rows) {
    const d = r.d; const dWhat = `\`${d.target}\`${d.count > 1 ? ` ×${d.count}` : ''}: ${d.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ').slice(0, 90)}`;
    L.push(`| ${d.id} | ${KIND_RU[d.kind] || d.kind}${d.sub ? ` (${d.sub})` : ''} | ${dWhat.replace(/\|/g, '/')} | ${r.o ? `${r.o.id} \`${r.o.target}\`` : '—'} | ${r.status} | ${[...r.diffs, ...(r.notes || []), r.decision].filter(Boolean).join('; ').replace(/\|/g, '/') || '—'} |`);
  }
  L.push('', `## Своё (у донора нет) — ${c.extra.length}`, '', ...(c.extra.length ? c.extra.map((o) => `- ${o.id} ${KIND_RU[o.kind] || o.kind}${o.sub ? ` (${o.sub})` : ''} — \`${o.target}\`: ${o.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ').slice(0, 100)}`) : ['- нет']),
    '', 'Решения «почему нет / чем заменено» — `motion-decisions.json` в папке прогона: { "m04": "почему", "reveal:div.card": "почему" }.', 'Своё — сверить с банком идей (`ideas.mjs list`): задумано ли, записать удачное.');
  return L.join('\n') + '\n';
}

/* =====================================================================
   Команды
   ===================================================================== */
const cmd = pos[0] === 'compare' || pos[0] === 'selftest' ? pos.shift() : 'inventory';
const timeMs = opt.time !== undefined ? Number(opt.time) : 6000;
if (!(timeMs >= 1000 && timeMs <= 20000)) die('--time: от 1000 до 20000 мс');
const hoverN = opt.hover !== undefined && opt.hover !== true ? Number(opt.hover) : 14;
if (!(hoverN >= 0 && hoverN <= 60)) die('--hover: от 0 до 60');

if (cmd === 'selftest') {
  const url = pathToFileURL(path.join(HERE, 'fixtures', 'motion', 'index.html')).href;
  const out = path.resolve(String(opt.out || path.join(process.env.TEMP || process.env.TMPDIR || '.', 'motion-selftest')));
  const res = await inventory(url, opt.viewport || 'desktop', { out, tag: 'selftest', timeMs, hoverN, crops: false });
  writeJson(path.join(out, 'motion', 'selftest.json'), res);
  const html = fs.readFileSync(path.join(HERE, 'fixtures', 'motion', 'index.html'), 'utf8');
  const expected = [...html.matchAll(/data-expect="([\w-]+)"/g)].map((m) => m[1]);
  const need = [...new Set(expected)];
  const key = (i) => (i.kind === 'loop' ? ({ 'парение': 'float', 'вращение': 'spin', 'пульс': 'pulse', 'мигание': 'blink' }[i.sub] || 'loop') : i.kind);
  const found = new Set(res.items.map(key));
  const byExpect = new Set(res.items.map((i) => i.expect).filter(Boolean));
  let bad = 0;
  for (const k of need) { const ok = found.has(k); const at = byExpect.has(k); if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${k}${ok ? (at ? '' : ' (найдено, но не на своём блоке)') : ' — не найдено'}`); }
  console.log(`\n${mdTable(res)}`);
  console.log(`${bad ? 'FAIL' : 'OK'}: видов ${need.length}, не найдено ${bad} · ${path.join(out, 'motion', 'selftest.json')}`);
  process.exit(bad ? 1 : 0);
}

if (cmd === 'compare') {
  const [donorFile, ourArg] = pos;
  if (!donorFile || !ourArg) die('Нужно: node motion.mjs compare <motion.json донора> <адрес или motion.json нашего> (подробно: --help)');
  const donor = readJson(path.resolve(donorFile)); if (!donor || !Array.isArray(donor.items)) die(`Не читается протокол донора: ${donorFile}`);
  let ours; let out;
  if (/^(https?|file):/i.test(ourArg)) {
    out = opt.out ? path.resolve(String(opt.out)) : runDir(opt, ourArg);
    const vp = opt.viewport || donor.viewport || 'desktop';
    const tag = `${pageSlug(ourArg)}-${vp}`;
    ours = await inventory(ourArg, vp, { out, tag, timeMs, hoverN, doHover: !opt['no-hover'], doMouse: !opt['no-mouse'], doScroll: !opt['no-scroll'], crops: !opt['no-crops'] });
    writeJson(path.join(out, 'motion', `${tag}.json`), ours); fs.writeFileSync(path.join(out, 'motion', `${tag}.md`), mdTable(ours));
  } else {
    ours = readJson(path.resolve(ourArg)); if (!ours || !Array.isArray(ours.items)) die(`Не читается наш протокол: ${ourArg}`);
    out = opt.out ? path.resolve(String(opt.out)) : path.dirname(path.dirname(path.resolve(ourArg)));
  }
  const decFile = path.resolve(String(opt.decisions && opt.decisions !== true ? opt.decisions : path.join(out, 'motion-decisions.json')));
  const decisions = readJson(decFile, {}) || {};
  const c = compare(donor, ours, decisions);
  const tag = opt.tag && opt.tag !== true ? String(opt.tag) : 'compare';
  const proto = { url: ours.url, donor: donor.url, viewport: ours.viewport, takenAt: new Date().toISOString(), verdict: c.verdict, decisionsFile: fs.existsSync(decFile) ? decFile : null,
    steps: c.rows.map((r) => ({ status: r.status === 'OK' || r.status === 'РЕШЕНО' ? 'OK' : r.status === 'ОТЛИЧАЕТСЯ' ? (r.decision ? 'OK' : 'WARN') : 'FAIL', what: `${r.d.id} ${KIND_RU[r.d.kind] || r.d.kind} ${r.d.target}`, details: [r.o ? `у нас ${r.o.id}` : 'у нас нет', ...r.diffs, ...(r.notes || []), r.decision].filter(Boolean).join('; ') })),
    extra: c.extra.map((o) => ({ id: o.id, kind: o.kind, target: o.target })) };
  writeJson(path.join(out, 'motion', `${tag}.json`), proto);
  fs.writeFileSync(path.join(out, 'motion', `${tag}.md`), mdCompare(c, donor, ours));
  for (const r of c.rows) console.log(`${(r.status === 'НЕТ' ? 'FAIL' : r.status === 'ОТЛИЧАЕТСЯ' && !r.decision ? 'WARN' : 'OK').padEnd(4)} ${r.d.id} ${KIND_RU[r.d.kind] || r.d.kind} ${r.d.target} → ${r.o ? r.o.id : 'нет'}${r.diffs.length ? ` — ${r.diffs.join('; ')}` : ''}${r.notes && r.notes.length ? ` — ${r.notes.join('; ')}` : ''}${r.decision ? ` — решение: ${r.decision}` : ''}`);
  console.log(`своё (у донора нет): ${c.extra.length}${c.extra.length ? ' — ' + c.extra.slice(0, 8).map((o) => `${o.id} ${KIND_RU[o.kind] || o.kind}`).join(', ') : ''}`);
  console.log(`${c.verdict}: сверка движения · ${path.join(out, 'motion', `${tag}.md`)}`);
  process.exit(c.verdict === 'FAIL' ? 1 : 0);
}

/* инвентарь */
const url = pos[0];
if (!url || !/^(https?|file):/i.test(url)) die('Нужно: node motion.mjs <адрес> [--viewport desktop] [--out папка] (подробно: --help)');
if (pos.length > 1) die(`Лишние слова после адреса: ${pos.slice(1).join(' ')}`);
const out = runDir(opt, url);
const vp = opt.viewport && opt.viewport !== true ? String(opt.viewport) : 'desktop';
const tag = opt.tag && opt.tag !== true ? String(opt.tag) : `${pageSlug(url)}-${vp}`;
const res = await inventory(url, vp, { out, tag, timeMs, hoverN, doHover: !opt['no-hover'], doMouse: !opt['no-mouse'], doScroll: !opt['no-scroll'], crops: !opt['no-crops'], debug: !!opt.debug });
writeJson(path.join(out, 'motion', `${tag}.json`), res);
fs.writeFileSync(path.join(out, 'motion', `${tag}.md`), mdTable(res));
const byKind = {}; for (const it of res.items) byKind[KIND_RU[it.kind] || it.kind] = (byKind[KIND_RU[it.kind] || it.kind] || 0) + (it.count || 1);
console.log(`Найдено движений: ${res.items.length} (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ') || 'нет'})`);
for (const it of res.items) console.log(`  ${it.id} ${KIND_RU[it.kind] || it.kind}${it.sub ? ` (${it.sub})` : ''} — ${it.target}${it.count > 1 ? ` ×${it.count}` : ''}: ${it.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ').slice(0, 110)} · ${describeTiming(it).slice(0, 80)}`);
if (res.notes.length) for (const n of res.notes) console.log(`WARN ${n}`);
console.log(`OK: инвентарь движения · ${path.join(out, 'motion', `${tag}.md`)}`);
