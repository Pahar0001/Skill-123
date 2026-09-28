#!/usr/bin/env node
/**
 * Движение страницы: что двигается, от чего, как и с какими числами — инвентарь, чтобы повторить
 * движение донора целиком, и сверка «донор → наш сайт», чтобы ни одно не потерялось.
 *
 *   node motion.mjs <адрес> [<адрес>…] [--pages "тип=путь,…"] [--viewport desktop[,mobile]]
 *                   [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14]
 *                   [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug]
 *   node motion.mjs compare <motion.json донора> <адрес нашего сайта | наш motion.json> [ещё пары…]
 *                   [--out <папка прогона>] [--tag <имя>] [--decisions <файл>] [--viewport …]
 *   node motion.mjs selftest            проверка распознавания на стенде fixtures/motion/index.html
 *   node motion.mjs --help
 *
 * Несколько страниц и экранов за один запуск (один браузер): адреса подряд или --pages от первого
 * адреса — «тип=путь» (тип — имя протокола) или просто пути через запятую; --viewport списком.
 *   node motion.mjs https://donor.com --pages "home=/,product=/sets/x,collection=/c/y" --viewport desktop,mobile --tag donor
 *   → motion/donor-home.json, donor-home-mobile.json, donor-product.json, … и сводка по всем.
 * Одна страница и один экран — имя --tag как есть (или <страница>-<экран>), как раньше.
 * --time — базовое окно «время» (мс); медленную петлю (период длиннее окна: покачивание Framer 7–13 с) окно
 * продлевает кусками по 2 с, пока не увидит два разворота, но не дольше --time-cap (1000–60000, по умолчанию
 * 20000). Не уложилась — строка «окно N с короче периода», а не пропуск. Без медленных петель — ровно --time.
 *
 * Что распознаётся (вид → рецепт в reference/motion.md):
 *   entrance        вход при загрузке (CSS-анимация, переход, element.animate) — из чего, сколько, задержки
 *   reveal          появление при прокрутке: прозрачность, сдвиг, масштаб, размытие, шторка (clip-path);
 *                   у закреплённого — «при прокрутке вверх» (кнопка «Наверх»: видна, когда листают вверх);
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
 *   loop            бесконечные петли: парение, вращение, пульс, мигание (CSS — по ключевым кадрам; на JS —
 *                   по разворотам: период, размах); одинаковые соседи (стопка картинок Framer, у каждой свой
 *                   период — вразнобой) — одна строка ×N с parent и members
 *   hover           наведение: картинка в карточке крупнее, кнопка светлее/выше/с тенью, линия под ссылкой
 *   mouse           реакция на мышь: наклон, параллакс; cursor — свой курсор
 *   canvas, video   холст, который рисует (2D/WebGL), и видео-фон
 *   click           по клику (clicks.mjs находит, что раскрывается): меню-бургер, аккордеон (details,
 *                   aria-expanded и «свои» Framer/Tilda), вкладки (role=tab и ряд кнопок с одной активной),
 *                   раскрывающаяся кнопка [aria-expanded]. Что открылось (панель) и как: сдвиг, масштаб,
 *                   прозрачность, высота, шторка — и вход из @keyframes/element.animate, если панель показали
 *                   из display:none; значок (поворот шеврона, бургер в крестик); кнопка (фон, цвет); старая
 *                   панель вкладок; длительность и кривая (события, element.animate, последняя смена style,
 *                   снимки через 80/200/400/700 мс; пружина Framer — linear() целиком в json); блокируется ли
 *                   прокрутка; закрывается ли — повторным кликом, прежней вкладкой или Escape.
 * Плюс библиотеки движения (GSAP/ScrollTrigger, Lenis, Framer, AOS, Swiper, Lottie, Webflow, Tilda…),
 * CSS scroll-driven, плавная прокрутка и правило «меньше движения».
 *
 * Как снимается: страница открывается с перехватом событий (animationstart/end, transitionrun/end,
 * element.animate, смена классов и style) → --time без прокрутки (петли, печать, карусели; медленная петля
 * продлевает окно до --time-cap) → проход
 * прокруткой шагами по четверти экрана, на каждом шаге ждём, пока движение уляжется, и снимаем
 * прозрачность, transform, фильтр, шторку и положение у каждого заметного элемента → вверх на полтора
 * экрана (шапка) → движение мыши по первому экрану → наведение на образцы кнопок, карточек, ссылок →
 * клики (до --clicks штук, до 60 с; навести, снимок всех элементов, клик, снимки, разбор, вырезка
 * открытого cNN.png, закрыть) → вырезки элементов. Отличие: прокрутка скриптом ≠ колесо — сглаживание
 * Lenis/пружины Framer догоняют; скрипт ждёт до 0.9 с на шаг.
 *
 * Выход: <out>/motion/<tag>.json (протокол: items[], libs, clicks, verdict) и <tag>.md (таблица для
 * analysis.md), вырезки <out>/motion/<tag>/mNN.png и cNN.png (открытое кликом). По умолчанию <out> —
 * папка прогона по первому адресу (runs/<slug>). --debug — ещё <tag>.series.json: все шаги и ряды
 * значений менявшихся элементов, а в json — разбор каждого клика (clicks.tried[].diff).
 *
 * compare: для каждого движения донора ищется такое же у нас (тот же вид, похожие числа):
 *   OK — есть и совпадает; ОТЛИЧАЕТСЯ — вид тот же, числа другие (какие); НЕТ — не найдено.
 *   По клику пара — тот же подвид (меню, аккордеон, вкладки, раскрытие); высота панели не сравнивается
 *   (она от содержимого), свойства донора, которых у нас нет, — разница.
 *   Решение «почему нет / чем заменено» — в <out>/motion-decisions.json:
 *     { "m04": "у нас другой первый экран (вариант B), стопки картинок нет", "reveal:div.card": "…" }
 *   Петли одинаковых соседей (стопка картинок Framer, у каждой свой период) — одна строка ×N с parent
 *   и members; решение на всю группу — ключ loop:<родитель> > * (loop:div.framer-Nsiv9.framer-x6zctv > *),
 *   ключ вид:подпись любого участника тоже подходит. Голый loop:<родитель> — про сам родитель.
 *   Каким ключом закрыта строка — столбец «ключ решения» (в json — decisionKey).
 *   Движения, которых у донора нет, печатаются как «своё» — проверить, что это задумано (банк идей).
 *   Вердикт: FAIL — есть НЕТ без решения; WARN — есть ОТЛИЧАЕТСЯ; иначе OK. Протокол годится
 *   доказательством для state.mjs (визуал/runtime движения). Несколько пар подряд — протоколы
 *   compare-<тип донора>, итог — худший вердикт.
 * selftest: стенд с каждым видом движения, у блоков data-expect; FAIL, если вид не найден или найден вид
 * из data-expect-not (на этом блоке его быть не должно: пружина входа — не петля).
 * Плюс проход кликов на телефоне с видимым окном ×1.25 (страница шире экрана): точка нажатия попадает.
 *
 * Код выхода: 0 — снято (и compare без FAIL); 1 — FAIL сверки, неверные аргументы, не открылась страница.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parseArgs, launch, preparePage, gotoRetry, waitForOverlay, sleep, resolveViewport, evaluateWith, SIG_FN,
  scrollToY, writeJson, readJson, ensureDir, runDir, pageSlug, loadSharp, closeConsent, consentNote, unmangle,
} from './lib.mjs';
import { findClickTargets, SCREEN_POINT_FN } from './clicks.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { pos, opt } = parseArgs(process.argv.slice(2), {
  flags: ['help', 'h', 'no-hover', 'no-mouse', 'no-scroll', 'no-crops', 'no-clicks', 'debug'],
  optional: ['viewport', 'out', 'tag', 'time', 'time-cap', 'hover', 'clicks', 'decisions', 'pages'],
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
          if (mo.rec) mo.rec.set(el, t);                             /* после клика: когда скрипт в последний раз менял style */
        } else if (m.attributeName === 'class' && el.classList) {
          const was = new Set(String(m.oldValue || '').split(/\s+/).filter(Boolean));
          const added = [...el.classList].filter((c) => !was.has(c)); const removed = [...was].filter((c) => !el.classList.contains(c));
          if (added.length || removed.length) push(mo.cls, { t: now(), el, added, removed });
        }
      }
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style', 'class'], attributeOldValue: true });
  };
  if (document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
  /* смены текста с загрузки: печать заголовка один раз при загрузке заканчивается до окна «время» (shapefest:
     «UI design.» за 1.1 с, дальше стоит) — частое наблюдение её уже не видит. Элемент → [[время, текст]] */
  mo.text = new Map();
  const textStart = () => {
    new MutationObserver((list) => {
      const t = now();
      for (const m of list) {
        const el = m.type === 'characterData' ? m.target.parentElement : m.target;
        if (!el || el.nodeType !== 1) continue;
        if (m.type === 'childList' && ![...m.addedNodes, ...m.removedNodes].some((n) => n.nodeType === 3)) continue;
        let log = mo.text.get(el);
        if (!log) { if (mo.text.size >= 1500) continue; log = []; mo.text.set(el, log); }
        if (log.length >= 240) continue;
        const txt = (el.textContent || '').trim().slice(0, 80);
        if (!log.length || log[log.length - 1][1] !== txt) log.push([t, txt]);
      }
    }).observe(document.documentElement, { subtree: true, characterData: true, childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', textStart, { once: true }); else textStart();
}

/* Текст, который допечатывался по знаку с загрузки (журнал instrument): кандидаты в печать. */
function textLogInPage() {
  const mo = window.__mo; if (!mo || !mo.text) return [];
  const els = window.__moEls || []; const out = [];
  /* печать в новом элементе на каждое слово (shapefest: новый span.Typewriter__wrapper раз в ~3.5 с): у того, что
     на странице сейчас, журнал бывает в 1–3 записи (слово только начало печататься) — и печать то находилась, то
     нет (5 из 8 прогонов). Прошлые слова — отключённые элементы с тем же тегом и классом, что у подключённого:
     из них и из него берётся самый длинный журнал */
  const kk = (el) => `${el.tagName}.${el.getAttribute('class') || ''}`;
  /* «такой же есть на странице» — по DOM, а не по журналу: только что созданный элемент слова ещё без текста */
  const liveMemo = new Map(); const live = { has: (key) => { if (!liveMemo.has(key)) { const [tag, cls] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)]; liveMemo.set(key, [...document.getElementsByTagName(tag)].some((x) => (x.getAttribute('class') || '') === cls)); } return liveMemo.get(key); } };
  const best = new Map();
  for (const [el, log] of mo.text) {
    if (log.length < 4 || !(el.isConnected || live.has(kk(el)))) continue;
    let grow = 0; for (let k = 1; k < log.length; k++) { const a = log[k - 1][1], b = log[k][1]; if (b.startsWith(a) || a.startsWith(b)) grow++; }
    if (grow / (log.length - 1) < 0.7) continue;
    const b = best.get(kk(el)); if (!b || log.length > b.log.length || (log.length === b.log.length && el.isConnected)) best.set(kk(el), { el, log });
  }
  for (const { el, log } of best.values()) {
    const ex = el.closest('[data-expect]');
    out.push({ sig: sig(el), i: els.indexOf(el), log, text: (el.textContent || '').trim().slice(0, 40), expect: ex ? ex.dataset.expect : '' });
    if (out.length >= 10) break;
  }
  return out;
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
/* Кандидаты на частое наблюдение текста: текст сменился хоть раз за окно «время». Печать с паузой на слове
   (shapefest: слово стоит несколько секунд) за 6 с меняется и один раз — при пороге «две смены» её теряли. */
function textCandidatesInPage() {
  const S = window.__moS; const out = [];
  for (const [i, h] of S.series) { let n = 0; for (let k = 1; k < h.rows.length; k++) if (h.rows[k][1][10] !== h.rows[k - 1][1][10]) n++; if (n >= 1) out.push(i); }
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
  const at = new Map(els.map((e, k) => [e, k]));
  for (const [i, h] of S.series) {
    if (h.rows.length < 2) continue;
    const el = els[i]; if (!el) continue;
    const s = getComputedStyle(el);
    const p = el.parentElement;
    const cls = (el.getAttribute && el.getAttribute('class')) || '';
    const no = el.closest('[data-expect-not]');                    /* стенд: на этом блоке такого вида быть не должно */
    out.push({
      i, sig: sig(el), tag: el.tagName.toLowerCase(), cls: String(cls).slice(0, 120), id: el.id || '',
      parent: p ? sig(p) : '', pi: p && at.has(p) ? at.get(p) : -1, idx: p ? [...p.children].indexOf(el) : 0, siblings: p ? p.children.length : 0,
      ...(no ? { expectNot: no.dataset.expectNot } : {}),
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
/* Лёгкий промежуточный итог окна «время» — продлевать ли его: ряды менявшихся элементов и подпись родителя. */
function timePeekInPage() {
  const S = window.__moS; const els = window.__moEls || []; const out = [];
  for (const i of S.hot) { const h = S.series.get(i); const el = els[i]; if (!h || !el || h.rows.length < 2) continue; out.push({ i, parent: el.parentElement ? sig(el.parentElement) : '', rows: h.rows }); }
  return { t: S.steps.map((s) => s.t), series: out };
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
    const ex = el.closest('[data-expect]');
    out[i] = [s.transform, Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), s.position, sig(el), ex ? ex.dataset.expect : ''];
  }
  return out;
}

/* ---------- клики: снимки всех элементов до и после нажатия ---------- */

/* Снимок состояния всех элементов: видим ли (итоговая прозрачность в порядке документа, доля коробки,
   не обрезанная предками с overflow, пересечение с окном), коробка, прозрачность, transform, шторка, цвета.
   name 'base' — заново собрать список элементов и начать журнал; остальные — снимок в window.__ckS[name]. */
function ckSnapInPage(name) {
  const SKIPT = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR|WBR|SOURCE|TRACK)$/;
  if (name === 'base') {
    window.__ckEls = [...document.body.querySelectorAll('*')].filter((e) => !SKIPT.test(e.tagName) && !e.ownerSVGElement).slice(0, 9000);
    window.__ckS = {}; window.__ckSet = new Set(window.__ckEls);
  }
  const els = window.__ckEls; const vw = innerWidth, vh = innerHeight;
  const effM = new Map(), clipM = new Map(); const out = new Array(els.length);
  const INF = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!el.isConnected) { out[i] = null; continue; }
    const s = getComputedStyle(el); const r = el.getBoundingClientRect(); const p = el.parentElement;
    const e = (s.display === 'none' ? 0 : parseFloat(s.opacity)) * (p && effM.has(p) ? effM.get(p) : 1);
    effM.set(el, s.visibility === 'hidden' ? 0 : e);
    let c = p && clipM.has(p) ? clipM.get(p) : INF;
    if (s.position === 'fixed') c = INF;                              /* закреплённое предки не обрезают */
    const clipOf = { l: Math.max(c.l, r.left), t: Math.max(c.t, r.top), r: Math.min(c.r, r.right), b: Math.min(c.b, r.bottom) };
    const cl = s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none' ? { l: Math.max(c.l, r.left), t: Math.max(c.t, r.top), r: Math.min(c.r, r.right), b: Math.min(c.b, r.bottom) } : c;
    clipM.set(el, cl);
    const area = r.width * r.height;
    const shownA = Math.max(0, clipOf.r - clipOf.l) * Math.max(0, clipOf.b - clipOf.t);
    const inView = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
    /* checkVisibility: закрытый details и content-visibility: hidden прячут содержимое, оставляя ему коробку */
    const vis = area > 0 && e > 0.05 && s.visibility !== 'hidden' && shownA >= area * 0.25 && inView && (!el.checkVisibility || el.checkVisibility()) ? 1 : 0;
    out[i] = [vis, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), Math.round(parseFloat(s.opacity) * 100) / 100,
      s.transform === 'none' ? '' : s.transform, s.clipPath === 'none' ? '' : s.clipPath, s.backgroundColor, s.color, Math.round(shownA), s.display === 'none' ? 1 : 0];
  }
  window.__ckS[name] = { t: Math.round(performance.now()), rows: out };
  if (name === 'base') { const mo = window.__mo; if (mo) { mo.rec = new Map(); window.__ckEv0 = mo.ev.length; window.__ckWa0 = mo.waapi.length; } }
  return { n: els.length, lock: getComputedStyle(document.documentElement).overflow + '/' + getComputedStyle(document.body).overflow };
}

/* Что изменилось между снимком base и end: элементы с разницей (видимость, размер, transform, прозрачность,
   шторка, цвета), у каждого — ближайший изменившийся предок, промежуточные снимки, переходы и события
   после клика (длительность, кривая), новые узлы в DOM. trg — метка нажатого элемента. */
function ckDiffInPage(arg) {
  const els = window.__ckEls || []; const S = window.__ckS || {}; const B = S.base, Z = S.end; if (!B || !Z) return null;
  const mids = (arg.mids || []).filter((n) => S[n]).map((n) => S[n]);
  const trg = document.querySelector(arg.trg);
  const tfDiff = (a, b) => a !== b;
  const changed = []; const P = S.pre;
  const differs = (a, z) => a[0] !== z[0] || Math.abs(a[3] - z[3]) > 3 || Math.abs(a[4] - z[4]) > 3 || a[6] !== z[6] || Math.abs(a[5] - z[5]) > 0.04 || a[7] !== z[7];
  let busy = 0;
  for (let i = 0; i < els.length; i++) {
    const a = B.rows[i], z = Z.rows[i]; if (!a || !z) continue;
    /* менялось и без клика (печать, бегущая строка, карусель, петля) — между двумя снимками до нажатия */
    if (P && P.rows[i] && differs(a, P.rows[i])) { busy++; continue; }
    const d = a[0] !== z[0] || Math.abs(a[3] - z[3]) > 3 || Math.abs(a[4] - z[4]) > 3 || tfDiff(a[6], z[6]) || Math.abs(a[5] - z[5]) > 0.04 || a[7] !== z[7] || a[8] !== z[8] || a[9] !== z[9] || Math.abs(a[1] - z[1]) > 3 || Math.abs(a[2] - z[2]) > 3;
    if (d) changed.push(i);
  }
  /* сдвиг коробки без своего transform и размера — страница под раскрытым блоком съехала вниз: не в счёт */
  const own = changed.filter((i) => { const a = B.rows[i], z = Z.rows[i]; return !(a[0] === z[0] && a[3] === z[3] && a[4] === z[4] && a[6] === z[6] && Math.abs(a[5] - z[5]) <= 0.04 && a[7] === z[7] && a[8] === z[8] && a[9] === z[9]); });
  const set = new Set(own); const idx = new Map(els.map((e, k) => [e, k]));
  const ev = (window.__mo ? window.__mo.ev.slice(window.__ckEv0 || 0) : []).filter((e) => e.type === 'trans-end' || e.type === 'anim-end');
  const wa = window.__mo ? window.__mo.waapi.slice(window.__ckWa0 || 0) : [];
  const rec = window.__mo && window.__mo.rec ? window.__mo.rec : new Map();
  const t0 = arg.t0;
  const out = own.slice(0, 400).map((i) => {
    const el = els[i]; let par = -1;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const k = idx.get(p); if (k !== undefined && set.has(k)) { par = k; break; } }
    const s = getComputedStyle(el);
    const inside = (x) => x && x.nodeType === 1 && (x === el || el.contains(x));
    const evs = ev.filter((e) => e.el === el).map((e) => ({ t: e.t - t0, dur: e.dur, prop: e.prop || e.name }));
    const was = wa.filter((w) => w.el === el).map((w) => ({ t: w.t - t0, dur: w.duration, easing: w.easing, props: w.props, first: w.first, last: w.last }));
    return { i, par, sig: sig(el), tag: el.tagName.toLowerCase(), text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
      trigger: !!trg && (el === trg || el.contains(trg) || trg.contains(el)), inTrigger: !!trg && trg.contains(el) && el !== trg, isTrigger: el === trg,
      base: B.rows[i], end: Z.rows[i], mids: mids.map((m) => ({ t: m.t - t0, v: m.rows[i] })),
      trans: { prop: s.transitionProperty, dur: s.transitionDuration, ease: s.transitionTimingFunction, delay: s.transitionDelay },
      anim: s.animationName !== 'none' ? { name: s.animationName, dur: s.animationDuration, ease: s.animationTimingFunction } : null,
      ev: evs, waapi: was, styleLast: rec.has(el) ? rec.get(el) - t0 : null, childEv: ev.some((e) => e.el !== el && inside(e.el)) };
  });
  /* новые узлы: появились в DOM после base и видны (меню, которое вставляется скриптом) */
  const added = []; const known = window.__ckSet || new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (known.has(el) || el.ownerSVGElement || /^(SCRIPT|STYLE|LINK|META)$/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect(); if (r.width * r.height < 400 || r.bottom <= 0 || r.top >= innerHeight) continue;
    if (added.some((a) => a.el.contains(el))) continue;
    const s = getComputedStyle(el);
    added.push({ el, sig: sig(el), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), op: parseFloat(s.opacity), tf: s.transform === 'none' ? '' : s.transform, trans: { dur: s.transitionDuration, ease: s.transitionTimingFunction }, anim: s.animationName !== 'none' ? { name: s.animationName, dur: s.animationDuration, ease: s.animationTimingFunction } : null });
    if (added.length >= 6) break;
  }
  if (window.__mo) window.__mo.rec = null;
  return { changed: out, total: own.length, busy, added: added.map((a) => ({ ...a, el: undefined })), url: location.href,
    lock: getComputedStyle(document.documentElement).overflow + '/' + getComputedStyle(document.body).overflow };
}

/* Точка нажатия по метке: элемент — в середину окна (закреплённое — как есть), центр коробки, в точке — он сам.
   Точка — в координатах видимого окна (screenPt = SCREEN_POINT_FN из clicks.mjs: сдвиг на offsetLeft/offsetTop,
   без умножения на visualViewport.scale — CDP масштабирует сам; «× scale» при scale 1.056 после discover
   промахивался на 23 px): на телефоне у страницы шире экрана окно раскладки больше видимого, и клик по
   getBoundingClientRect уходил мимо; точка за краем экрана не нажимается. Закреплённое (меню в шапке): видимое
   окно сначала — в начало окна раскладки, после кликов внизу оно остаётся сдвинутым (offsetTop 182), scrollTo(0, 0)
   его не возвращает. lx, ly — в окне раскладки (для вырезки). { sel, noScroll: true } — пересчитать прямо перед
   кликом: наведение сдвигает видимое окно. */
function ckPointInPage(arg) {
  const sel = typeof arg === 'string' ? arg : arg.sel; const noScroll = typeof arg === 'object' && !!arg.noScroll;
  const el = document.querySelector(sel); if (!el) return { skip: 'пропал из DOM' };
  let fixed = false; for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') { fixed = true; break; } }
  if (!fixed && !noScroll) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const vv0 = window.visualViewport; if (fixed && !noScroll && vv0 && (vv0.offsetTop || vv0.offsetLeft)) document.documentElement.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' });
  /* у details нажимается summary: у раскрытого «верх + 30 px» — уже текст ответа */
  const aim = el.matches('details') ? el.querySelector('summary') || el : el;
  const r = aim.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return { skip: 'не виден' };
  const x = Math.round(r.left + Math.min(r.width / 2, 160)), y = Math.round(r.top + Math.min(r.height / 2, 30));
  const hit = document.elementFromPoint(x, y);
  if (!hit || !(el.contains(hit) || hit.contains(el))) return { skip: 'точку нажатия закрывает другой элемент' };
  const a = hit.closest('a[href]'); if (a && !/^(#|javascript:)/i.test(a.getAttribute('href') || '')) return { skip: 'в точке нажатия ссылка на другой адрес' };
  for (const o of document.querySelectorAll('[data-rw-ck-hit]')) o.removeAttribute('data-rw-ck-hit');
  const btn = hit.closest('button, a, [role="button"], [role="tab"], summary, [aria-expanded]');
  (btn && el.contains(btn) ? btn : el.contains(hit) ? hit : el).setAttribute('data-rw-ck-hit', '');
  const s = screenPt(x, y); if (s.off) return { skip: 'точка нажатия за краем экрана (страница шире экрана)' };
  return { x: s.x, y: s.y, lx: x, ly: y, text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30), sig: sig(el), expect: el.closest('[data-expect]') ? el.closest('[data-expect]').dataset.expect : '' };
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
/* linear(0, 0.0184, …) из десятков точек — пружина (Framer, Motion): в таблицу коротко, значение целиком — в json */
const easeShort = (e) => { const s = String(e || ''); const m = /^linear\((.*)\)$/.exec(s); return m && s.length > 40 ? `пружина — linear() из ${m[1].split(',').length} точек (целиком в json)` : s; };
const easeName = (e) => String(e || '').split(/,(?![^(]*\))/)[0].trim();

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

/* ---------- петли во времени: развороты, что это за движение, группа соседей ---------- */
/* Окно «время» (--time, 6 с) бывает короче периода: покачивание картинок Framer — 7–13 с, и что увидит окно,
   зависит от фазы (shapefest: 35–37 разных наборов петель на 104 скользящих окнах). Поэтому развороты — с
   гистерезисом (размер шага замера не важен), петля — два разворота и размах от разворота к развороту не гаснет;
   меньше двух разворотов и не встало — «окно короче периода»: окно продлевается кусками по chunk до --time-cap. */
const LOOP = { chunk: 2000, cap: 20000, settleMin: 3000, settleShare: 0.35, decay: 0.5, spanRatio: 3 };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/* Развороты: засчитан, когда значение отошло от последнего экстремума больше чем на h; первый — только если
   он отошёл от начального значения больше чем на eps (иначе окно просто началось у разворота). */
function turningPoints(ts, ys, h, eps) {
  const ext = []; let dir = 0, ref = 0, hi = 0, lo = 0;
  for (let i = 1; i < ys.length; i++) {
    if (dir === 0) {
      if (ys[i] > ys[hi]) hi = i; if (ys[i] < ys[lo]) lo = i;
      if (ys[hi] - ys[i] > h) { if (hi > 0 && ys[hi] - ys[0] > eps) ext.push({ i: hi, t: ts[hi], y: ys[hi], type: 'max' }); dir = -1; ref = i; }
      else if (ys[i] - ys[lo] > h) { if (lo > 0 && ys[0] - ys[lo] > eps) ext.push({ i: lo, t: ts[lo], y: ys[lo], type: 'min' }); dir = 1; ref = i; }
      continue;
    }
    if (dir === 1) { if (ys[i] >= ys[ref]) ref = i; else if (ys[ref] - ys[i] > h) { ext.push({ i: ref, t: ts[ref], y: ys[ref], type: 'max' }); dir = -1; ref = i; } }
    else if (ys[i] <= ys[ref]) ref = i; else if (ys[i] - ys[ref] > h) { ext.push({ i: ref, t: ts[ref], y: ys[ref], type: 'min' }); dir = 1; ref = i; }
  }
  return ext;
}
/* сколько мс в конце наблюдения значение стоит (в пределах eps от последнего) */
const tailFlat = (ts, ys, eps) => { const n = ys.length; let j = n - 1; while (j > 0 && Math.abs(ys[j - 1] - ys[n - 1]) <= eps) j--; return ts[n - 1] - ts[j]; };

/* Одно свойство одного элемента во времени. status: small — едва сдвинулось (smooth — ровно и не встало: начало
   долгой петли), marquee, carousel, decay — пружина/вход (гаснет или встало), loop, settled — доводка,
   spin — вращение (ровная скорость ≥ 10 с), undetermined — окно короче периода, step — один переход между
   площадками (карусель с долгим показом слайда или разовый сдвиг: ждать второго). */
function classifyProp(k, ts, ysIn, vals) {
  const ys = [...ysIn];
  if (k === 'rot') for (let q = 1; q < ys.length; q++) ys[q] -= 360 * Math.round((ys[q] - ys[q - 1]) / 360);   /* 179° → −179° — это +2°, а не разворот */
  /* одиночный выброс (соседи равны, между ними — скачок) — не движение: Framer на кадр растягивает контейнер.
     Только если по обе стороны значение стоит (ещё один замер): при шаге замера 300–400 мс вершина пружины или
     петли между двумя замерами на разных склонах тоже «выброс», и её стирало — пружина выглядела петлёй */
  const still = (q) => q < 1 || q >= ys.length || Math.abs(ys[q] - ys[q - 1]) <= EPS[k];
  for (let q = 1; q + 1 < ys.length; q++) if (Math.abs(ys[q - 1] - ys[q + 1]) <= EPS[k] && Math.abs(ys[q] - ys[q - 1]) > EPS[k] * 3 && still(q - 1) && still(q + 2)) ys[q] = ys[q - 1];
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo;
  const obs = ts[ts.length - 1] - ts[0];
  if (span < EPS[k] * 3) {
    /* smooth — ровно и не встало (начало долгой петли); turn — был разворот: покачивание 0↔2° (контейнер стопки
       shapefest) в окне от спуска до подъёма даёт размах 1.77° — на волос меньше 3·EPS, и петля терялась */
    /* сдвиг на 1–2 px у элемента, чей размер меняется (полоса, растущая по ширине, с кадровыми выбросами transform —
       shapefest framer-1x8s64v), — не начало петли: окно из-за него тянулось до предела */
    if ((k === 'tx' || k === 'ty') && (() => { const sz = vals.map((v) => (k === 'tx' ? v.w : v.h)); return Math.max(...sz) - Math.min(...sz) > 1; })()) return null;
    if (span >= EPS[k]) return { k, lo, hi, span, obs, status: 'small', smooth: tailFlat(ts, ys, EPS[k] / 2) < 1500 && fit(ts, ys).r2 > 0.8, turn: span >= EPS[k] * 2 && turningPoints(ts, ys, span * 0.4, EPS[k]).length >= 1 };
    return null;
  }
  /* translate(-50%) за меняющимся размером — только когда размер и правда менялся: медленное парение ±4 px у
     картинки высотой 400 px (2% высоты) прежним правилом выбрасывалось */
  if (k === 'tx' || k === 'ty') { const sz = vals.map((v) => (k === 'tx' ? v.w : v.h)); if (Math.max(...sz) - Math.min(...sz) > 1) { const rel = vals.map((v) => v[k] / Math.max(1, k === 'tx' ? v.w : v.h)); if (Math.max(...rel) - Math.min(...rel) < 0.02) return null; } }
  const f = fit(ts, ys);
  const base = { k, lo, hi, span, obs, r2: f.r2, b: f.b, speed: Math.abs(f.b) * 1000, y0: ys[0], y1: ys[ys.length - 1] };
  if ((k === 'tx' || k === 'ty') && f.r2 > 0.95 && Math.abs(f.b) * 1000 > 5) return { ...base, status: 'marquee' };
  /* ступеньки — карусель: значение стоит (площадки: держится ≥3 замеров подряд), потом прыгает. Без опоры на число
     замеров и на фазу окна (раньше: «стоящих шагов вдвое больше прыжков» и «до первого прыжка стоит 0.6 с» — под
     нагрузкой шаг замера 250–400 мс, и карусель становилась «колебанием»; медленное парение ±4 px, окно у разворота
     — «каруселью, шаг ≈2 px»): путь (сумма |шаг|) — в основном прыжками (шаг > 3·EPS), переходов между площадками
     ≥ 2, на площадках — не меньше 40% времени */
  let pathAll = 0, pathJump = 0, segs = 0, holdMs = 0, inJump = false;
  for (let q = 1; q < ys.length; q++) { const d = Math.abs(ys[q] - ys[q - 1]); pathAll += d; if (d > EPS[k] * 3) { pathJump += d; if (!inJump) segs++; inJump = true; } else { inJump = false; if (d <= EPS[k]) holdMs += ts[q] - ts[q - 1]; } }
  /* площадка — значение стоит не меньше 0.7 с (у пружины у разворотов стоит 0.1–0.3 с, у слайда — секунды) */
  const plats = []; { let a = 0; for (let q = 1; q <= ys.length; q++) { if (q < ys.length && Math.abs(ys[q] - ys[q - 1]) <= EPS[k]) continue; if (ts[q - 1] - ts[a] >= 700) { const v = Math.round(ys[a]); if (!plats.length || Math.abs(plats[plats.length - 1] - v) > EPS[k] * 3) plats.push(v); } a = q; } }
  if ((k === 'tx' || k === 'ty') && plats.length >= 2 && segs >= 2 && pathJump >= pathAll * 0.6 && holdMs >= obs * 0.4) return { ...base, status: 'carousel', plats };
  /* один переход — карусель с долгим показом (5 с) или разовый сдвиг: не решать, ждать второго (stepWait) */
  if ((k === 'tx' || k === 'ty') && plats.length >= 2 && segs === 1 && pathJump >= pathAll * 0.6) {
    let last = 0; for (let q = 1; q < ys.length; q++) if (Math.abs(ys[q] - ys[q - 1]) > EPS[k] * 3) last = q;
    return { ...base, status: 'step', since: ts[ts.length - 1] - ts[last] };
  }
  const ext = turningPoints(ts, ys, Math.max(EPS[k] * 1.5, span * 0.15), EPS[k]);
  /* «встало» — хвост в полосе 5% размаха (не шире EPS): у медленного покачивания 0↔5° за 13 с вершина держится в
     полосе EPS 0.6° больше 3 с, и окно, начатое в покое, решало «доводка» — петля терялась */
  const flat = tailFlat(ts, ys, Math.min(EPS[k], span * 0.05));
  const settled = flat >= Math.max(LOOP.settleMin, LOOP.settleShare * obs);
  Object.assign(base, { turns: ext.length, flat, settled });
  if (ext.length >= 2) {
    const sw = ext.slice(1).map((e, q) => Math.abs(e.y - ext[q].y));
    /* гаснет: последний размах меньше половины первого — или каждый следующий меньше прежнего (< 0.85) и последний
       меньше 0.7 первого (пружина, застанная окном с середины: два размаха 12.5 → 7.3, а «встало» не хватило 24 мс) */
    /* под нагрузкой шаг замера 400 мс — треть периода пружины, вершины теряются и размахи скачут: ещё сравнить
       наибольший размах последней трети с наибольшим первой (огибающая) */
    const third = Math.max(1, Math.floor(sw.length / 3));
    const fading = sw.length >= 2 && (sw[sw.length - 1] < LOOP.decay * sw[0] || (sw.slice(1).every((v, q) => v < sw[q] * 0.85) && sw[sw.length - 1] < sw[0] * 0.7)
      || (sw.length >= 3 && Math.max(...sw.slice(-third)) < 0.6 * Math.max(...sw.slice(0, third))));
    if (fading || settled) return { ...base, status: 'decay' };
    /* два разворота (один размах — гаснет ли, не видно) и после них стоит ≥ 1.5 с: хвост пружины, застанный окном,
       или петля с паузой — решить нельзя, продлить окно (дальше: встало → пружина, новые развороты → петля) */
    if (ext.length === 2 && flat >= 1500) return { ...base, status: 'undetermined' };
    /* период — между одноимёнными разворотами; при двух разворотах — удвоенное расстояние между ними */
    const T = ext.length >= 3 ? median(ext.slice(2).map((e, q) => e.t - ext[q].t)) : 2 * (ext[1].t - ext[0].t);
    const firstMax = ext.find((e) => e.type === 'max');
    return { ...base, status: 'loop', period: Math.round(T), phase: firstMax ? Math.round((firstMax.t - ts[0]) % T) : null, full: ext.length >= 3 };
  }
  if (settled) return { ...base, status: 'settled' };
  /* вращение — ровная скорость не меньше 10 с (по четвертям наблюдения); разгон долгой петли — не вращение */
  if (k === 'rot' && f.r2 > 0.98 && obs >= 10000) {
    const q4 = Math.floor(ys.length / 4); const bs = [0, 1, 2, 3].map((q) => fit(ts.slice(q * q4, (q + 1) * q4), ys.slice(q * q4, (q + 1) * q4)).b);
    if (bs.every((b) => b / f.b > 0.8 && b / f.b < 1.25)) return { ...base, status: 'spin' };
  }
  return { ...base, status: 'undetermined' };
}

/* Элемент целиком: tx ty sc rot op по замерам idx. Свойства бесконечной CSS/WAAPI-анимации (cssLoop) — не здесь:
   их разбирают по ключевым кадрам. */
function classifyEl(el, steps, idx, { cssLoop = null } = {}) {
  const pts = idx.map((s) => [steps[s].t, propsOf(el.u[s])]).filter((x) => x[1]);
  if (pts.length < 3) return [];
  const ts = pts.map((x) => x[0]), vals = pts.map((x) => x[1]); const out = [];
  for (const k of ['tx', 'ty', 'sc', 'rot', 'op']) {
    if (cssLoop && cssLoop.props.some((p) => (k === 'op' ? p === 'opacity' : /transform|translate|rotate|scale/.test(p)))) continue;
    const c = classifyProp(k, ts, vals.map((v) => v[k]), vals); if (c) out.push(c);
  }
  return out;
}
/* нужен ли ещё кусок окна: «окно короче периода» или ровное начало долгой петли */
const slowStart = (c) => c.status === 'small' && (c.smooth || c.turn);
/* один переход между площадками — может быть карусель с долгим показом слайда: ждать второй, но не дольше 8 с после него */
const stepWait = (c) => c.status === 'step' && c.since < 8000;
const unresolved = (cls) => cls.some((c) => c.status === 'undetermined' || slowStart(c) || stepWait(c));

/* Петли → строки протокола: соседи по родителю с тем же свойством — одна строка ×N (стопка картинок Framer:
   у каждой свой период, вразнобой — это задумка донора, а не разные движения). В группу — петли и «окно короче
   периода», а ещё соседи, которые в этом окне стояли у разворота (small, settled и decay при ≤ 2 разворотах);
   пружина с тремя и больше разворотами — нет. Вращение — своей строкой.
   Разные движения соседей с тем же свойством (картинка качается на 3°, значок рядом — на 30°) — разные строки:
   решённые петли (loop) делятся по размаху, если он отличается больше чем в LOOP.spanRatio раз; остальные
   участники (размах у них увиден не целиком) идут к ближайшей по размаху — неполный размах группу не дробит. */
function loopRows(perEl) {
  const rows = []; const groups = new Map();
  const loopish = (c) => c.status === 'loop' || c.status === 'undetermined';
  for (const { el, cls } of perEl) for (const c of cls) {
    if (c.status === 'spin') { rows.push({ kind: 'loop', sub: 'вращение', trigger: 'time', props: [{ prop: NAMES.rot, from: '', to: '' }], timing: { speed: `${round(c.speed, 1)}°/с` }, source: 'js', i: el.i, el, parent: pattern(el.parent), members: [el.sig], is: [el.i], mk: [`${el.i}|rot`] }); continue; }
    if (!['loop', 'undetermined', 'settled', 'decay', 'small'].includes(c.status)) continue;
    const key = `${el.parent}|${c.k}`; const g = groups.get(key) || []; g.push({ el, c }); groups.set(key, g);
  }
  const parts = [];
  for (const g of groups.values()) {
    if (!g.some((x) => loopish(x.c))) continue;
    const pool = g.filter((x) => loopish(x.c) || x.c.status === 'small' || ((x.c.status === 'settled' || x.c.status === 'decay') && x.c.turns <= 2));
    const full = pool.filter((x) => x.c.status === 'loop');
    if (!full.length) { parts.push(pool); continue; }
    const cl = []; for (const x of [...full].sort((a, b) => a.c.span - b.c.span)) { const c = cl[cl.length - 1]; if (c && x.c.span <= c[0].c.span * LOOP.spanRatio) c.push(x); else cl.push([x]); }
    const mid = cl.map((c) => median(c.map((x) => x.c.span)));
    for (const x of pool) if (x.c.status !== 'loop') { let b = 0; for (let q = 1; q < cl.length; q++) if (Math.abs(Math.log(Math.max(x.c.span, 1e-9) / mid[q])) < Math.abs(Math.log(Math.max(x.c.span, 1e-9) / mid[b]))) b = q; cl[b].push(x); }
    for (const c of cl) parts.push(pool.filter((x) => c.includes(x)));            /* порядок участников — как в документе */
  }
  for (const members of parts) {
    const k = members[0].c.k; const first = members[0].el;
    const periods = members.map((x) => x.c.period).filter(Boolean).sort((a, b) => a - b);
    const spans = members.map((x) => x.c.span).sort((a, b) => a - b);
    const open = members.filter((x) => x.c.status !== 'loop');
    const note = [];
    if (periods.length > 1 && periods[periods.length - 1] > periods[0] * 1.08) note.push(`период ${round(periods[0] / 1000, 1)}–${round(periods[periods.length - 1] / 1000, 1)} с, у каждого свой — вразнобой`);
    if (members.length > 1) { const a = fmtV(k, spans[0]), b = fmtV(k, spans[spans.length - 1]); note.push(a === b ? `размах ${a}` : `размах ${a}–${b}`); }
    if (open.length) note.push(`окно ${round(Math.max(...members.map((x) => x.c.obs)) / 1000, 1)} с короче периода${members.length > 1 ? ` у ${open.length}` : ''}`);
    rows.push({ kind: 'loop', sub: k === 'op' ? 'мигание' : k === 'sc' ? 'пульс' : 'колебание', trigger: 'time',
      props: [{ prop: NAMES[k], from: fmtV(k, Math.min(...members.map((x) => x.c.lo))), to: fmtV(k, Math.max(...members.map((x) => x.c.hi))) }],
      timing: { period: periods.length ? median(periods) : undefined, note: note.join('; ') || undefined,
        ...(members.length > 1 ? { periods: members.map((x) => x.c.period || null), ranges: members.map((x) => `${fmtV(k, x.c.lo)}…${fmtV(k, x.c.hi)}`) } : {}),
        phases: members.map((x) => (x.c.phase === undefined ? null : x.c.phase)) },
      source: 'js', i: first.i, el: first, parent: pattern(first.parent), count: members.length, members: members.map((x) => x.el.sig).slice(0, 30), is: members.map((x) => x.el.i), mk: members.map((x) => `${x.el.i}|${k}`),
      cropI: members.length > 1 && first.pi >= 0 ? first.pi : first.i });                     /* вырезка — вся стопка (родитель), если он под наблюдением */
  }
  return rows;
}

/* ---------- фаза «без прокрутки»: петли, печать, счётчики, карусели ---------- */
function analyzeTime(el, steps, timeIdx, anims, finite, watch) {
  const vals = timeIdx.map((s) => propsOf(el.u[s])).filter(Boolean);
  if (vals.length < 3) return { items: [], cls: [] };
  let ts = timeIdx.map((s) => steps[s].t);
  const items = [];
  /* текст листа: долгое частое наблюдение, если было, иначе замеры окна «время» */
  let texts = vals.map((v) => v.text);
  const fromWatch = !!(watch && watch.length >= 3);
  if (fromWatch) { texts = watch.map((w) => w[1]); ts = watch.map((w) => w[0]); }
  const distinct = [...new Set(texts)];
  if (distinct.length >= 3) {
    const nums = distinct.map((x) => Number(String(x).replace(/[\s\u00a0,]/g, '')));
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
        items.push({ kind: 'typewriter', trigger: 'time', props: [{ prop: 'текст', from: '', to: seen.slice(0, 5).join(' / ') + (words.length ? '' : ' (видели не целиком)') }], timing: { speed: `${add.length ? `набор ≈${round(med(add))} знаков/с` : 'набор за окно не пойман'}${del.length ? `, стирание ≈${round(med(del))}/с` : ''}` } });
      } else items.push({ kind: 'rotating-words', trigger: 'time', props: [{ prop: 'текст', from: distinct[0], to: distinct.slice(1, 4).join(' / ') }], timing: {} });
    }
  }
  /* transform и прозрачность — по замерам окна «время»: бегущая строка и карусель — здесь, петли и вращение —
     строками групп (loopRows) по разбору cls всех элементов */
  if (finite) return { items, cls: [] };                         /* вход при загрузке — не петля: разберётся отдельно */
  const cssLoop = anims.find((a) => a.i === el.i && a.iterations === 'infinite' && !a.timeline) || null;   /* разберём по ключевым кадрам ниже */
  const cls = classifyEl(el, steps, timeIdx, { cssLoop });
  for (const c of cls) {
    const k = c.k;
    if (c.status === 'marquee') items.push({ kind: 'marquee', trigger: 'time', props: [{ prop: NAMES[k], from: fmtV(k, c.y0), to: fmtV(k, c.y1) }], timing: { speed: `${round(c.speed)} px/с ${k === 'tx' ? (c.b < 0 ? 'влево' : 'вправо') : (c.b < 0 ? 'вверх' : 'вниз')}` }, source: 'js' });
    else if (c.status === 'carousel') {
      /* шаг — разница соседних площадок; до первого прыжка — стоит */
      const dif = c.plats.slice(1).map((v, q) => Math.abs(v - c.plats[q])).sort((a, b) => a - b); const stepPx = dif[Math.floor(dif.length / 2)];
      items.push({ kind: 'carousel', trigger: 'time', props: [{ prop: NAMES[k], from: fmtV(k, c.plats[0]), to: fmtV(k, c.plats[c.plats.length - 1]) }], timing: { note: `шаг ≈${stepPx} px, листает сам` }, source: 'js' });
    }
  }
  return { items, cls };
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
  /* стоит на месте экрана, пока страница едет: сам fixed или внутри закреплённой обёртки (Framer: fixed — у обёртки,
     у ссылки внутри — relative); сдвиг transform не в счёт — он и есть движение */
  const onScreen = el.position === 'fixed' || (P[P.length - 1].sy - P[0].sy > vh && P.every((x) => Math.abs((top(x) - x.p.ty) - (top(P[0]) - P[0].p.ty)) <= 2));
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
  /* закреплённое, которое показывается при прокрутке ВВЕРХ и прячется при прокрутке вниз (кнопка «Наверх»,
     плавающая кнопка, нижняя панель; у шапки — ветка выше): у конца прохода вниз скрыто, на шагах вверх видно.
     Прыжками вниз этого не отличить от «исчезает» — shapefest «Back to top» так и снимался 24.09 */
  if (onScreen && ctx.upIdx && ctx.upIdx.length) {
    const shown = (q) => !!q && !q.hid && q.op >= 0.5 && q.w > 0 && q.h > 0;
    const U = ctx.upIdx.map((s) => propsOf(el.u[s])).filter(Boolean);
    const last = P[P.length - 1].p; const q = U.find(shown);
    if (q && !shown(last)) {
      const props = [{ prop: NAMES.op, from: fmtV('op', last.op), to: fmtV('op', q.op) }];
      for (const k of ['ty', 'tx', 'sc']) if (Math.abs(q[k] - last[k]) > EPS[k] * 2) props.push({ prop: NAMES[k], from: fmtV(k, last[k]), to: fmtV(k, q[k]) });
      const visStart = shown(P[0].p);
      items.push({ kind: 'reveal', sub: 'при прокрутке вверх', trigger: 'scroll', prop: 'op', from: last.op, to: q.op, props, visAtStart: visStart, timing: {},
        scroll: { at: `закреплён на экране; показывается, когда листают вверх, прячется, когда листают вниз (в начале страницы ${visStart ? 'виден' : 'скрыт'})`, fixed: true, direction: 'up' } });
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
      const where = onScreen
        ? `закреплён на экране; меняется при прокрутке ${Math.round(sy0)}–${Math.round(sy1)} px из ${Math.round(syMax)} (${syMax - sy1 < vh * 0.6 ? 'у конца страницы' : sy1 <= vh * 1.2 ? 'сразу после начала' : `${Math.round((sy1 / Math.max(1, syMax)) * 100)}% страницы`}${vis(0) ? ', виден с начала' : ', в начале скрыт'})`
        : `верх блока между ${pct(Math.max(-0.2, Math.min(1.2, tPrev)))} и ${pct(Math.max(-0.2, Math.min(1.2, tNow)))} высоты экрана`;
      items.push({ kind: 'reveal', trigger: 'scroll', prop: k, from, to, props: [{ prop: NAMES[k], from: fmtV(k, from), to: fmtV(k, to) }],
        scroll: { at: where, atPct: Math.round(((tPrev + tNow) / 2) * 100), ...(onScreen ? { fixed: true, atPx: Math.round(sy1), ofPx: Math.round(syMax) } : {}) }, step: P[first].s, visAtStart: vis(0) });
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
  const texts = P.map((x) => x.p.text); const nums = [...new Set(texts)].map((x) => Number(String(x).replace(/[\s\u00a0,]/g, ''))).filter((x) => !Number.isNaN(x));
  if (nums.length >= 2 && [...new Set(texts)].length >= 2 && nums[nums.length - 1] > nums[0]) items.push({ kind: 'counter', trigger: 'scroll', props: [{ prop: 'число', from: String(nums[0]), to: String(nums[nums.length - 1]) }], timing: {} });
  return items;
}

/* ---------- фаза кликов: меню, аккордеоны, вкладки, раскрывающиеся кнопки ---------- */
const CLICK_SUB = { toggle: 'меню', accordion: 'аккордеон', tab: 'вкладки', disclosure: 'раскрытие' };
const CLICK_RECIPE = { 'меню': 'click-menu', 'аккордеон': 'click-accordion', 'вкладки': 'click-tabs', 'раскрытие': 'click-disclosure' };
const rgbHex = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || ''); if (!m) return String(c || ''); if (m[4] !== undefined && Number(m[4]) === 0) return 'прозрачный'; return '#' + [m[1], m[2], m[3]].map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase(); };

/* Разбор одного клика: панель (самое крупное появившееся, иначе выросшее по высоте, иначе новый узел DOM),
   как она приходит (сдвиг, масштаб, прозрачность, высота, шторка — у неё и изменившихся предков),
   значок (маленький элемент с поворотом), смена вида кнопки, старая панель вкладок, длительность и кривая
   (события переходов и element.animate после клика, последняя смена style скриптом, промежуточные снимки). */
/* «opacity: 0; transform: translateY(8px) scale(.96)» → { op, tx, ty, sc } (проценты сдвига — от ширины/высоты) */
function cssProps(css, w, h) {
  const out = {}; const t = String(css || '');
  const op = /opacity:\s*([\d.]+)/.exec(t); if (op) out.op = Number(op[1]);
  const px = (v, size) => (/%/.test(v) ? parseFloat(v) / 100 * size : parseFloat(v));
  let m = /translateX\(([^)]+)\)/.exec(t); if (m) out.tx = px(m[1], w);
  m = /translateY\(([^)]+)\)/.exec(t); if (m) out.ty = px(m[1], h);
  m = /translate(?:3d)?\(([^,)]+),\s*([^,)]+)/.exec(t); if (m) { out.tx = px(m[1], w); out.ty = px(m[2], h); }
  m = /scale\(([\d.]+)/.exec(t); if (m) out.sc = Number(m[1]);
  if (/transform:\s*none/.test(t)) { out.tx = 0; out.ty = 0; out.sc = 1; }
  return out;
}

function summarizeClick(t, pt, diff, kf = {}) {
  const ch = diff.changed; if (!ch.length && !diff.added.length) return null;
  const byI = new Map(ch.map((c) => [c.i, c]));
  const isAnc = (o, c) => { for (let p = c.par; p >= 0; p = byI.has(p) ? byI.get(p).par : -1) if (p === o.i) return true; return false; };
  const tops = (list) => list.filter((c) => !list.some((o) => o !== c && isAnc(o, c)));
  const area = (v) => (v ? v[3] * v[4] : 0);
  const appeared = tops(ch.filter((c) => c.base[0] === 0 && c.end[0] === 1 && c.end[10] >= 400 && !c.isTrigger)).sort((a, b) => b.end[10] - a.end[10]);
  const grown = ch.filter((c) => !c.isTrigger && c.end[4] - c.base[4] > 12).sort((a, b) => (b.end[4] - b.base[4]) - (a.end[4] - a.base[4]));
  const gone = tops(ch.filter((c) => c.base[0] === 1 && c.end[0] === 0 && area(c.base) >= 1000 && !c.trigger)).sort((a, b) => area(b.base) - area(a.base));
  let panel = appeared.find((c) => c.end[10] >= 1000) || grown[0] || null;
  /* появившийся блок был обрезан предком (Framer: ответ полной высоты внутри пункта с overflow: hidden) —
     панель — предок, который вырос, чтобы его показать; выше — пока предок растёт на столько же и в нём
     не было другого видимого (высота «до» та же). Блок сам рос с нуля (обёртка ответа height 0 → N) — он и панель */
  if (panel && panel.base[4] > 0 && panel.base[0] === 0) {
    const grow = (q) => q.end[4] - q.base[4];
    let p = panel.par; const first = p >= 0 && byI.get(p);
    if (first && grow(first) >= Math.max(12, panel.end[4] * 0.4)) {
      panel = first;
      for (p = panel.par; p >= 0 && byI.has(p); p = byI.get(p).par) { const q = byI.get(p); if (Math.abs(grow(q) - grow(panel)) <= Math.max(4, grow(panel) * 0.15) && q.base[4] <= panel.base[4] + 12) panel = q; else break; }
    }
  }
  const props = []; const put = (prop, from, to) => { if (!props.some((p) => p.prop === prop)) props.push({ prop, from, to }); };
  const chain = [];
  if (panel) { chain.push(panel); for (let p = panel.par, n = 0; p >= 0 && byI.has(p) && n < 2; p = byI.get(p).par, n++) if (!byI.get(p).trigger) chain.push(byI.get(p)); }
  for (const c of chain) {
    const a = decompose(c.base[6]), z = decompose(c.end[6]);
    if (Math.abs(a.tx - z.tx) > 2) put('панель: сдвиг X', fmtV('tx', a.tx), fmtV('tx', z.tx));
    if (Math.abs(a.ty - z.ty) > 2) put('панель: сдвиг Y', fmtV('ty', a.ty), fmtV('ty', z.ty));
    if (Math.abs((a.sx + a.sy) / 2 - (z.sx + z.sy) / 2) > 0.02) put('панель: масштаб', fmtV('sc', (a.sx + a.sy) / 2), fmtV('sc', (z.sx + z.sy) / 2));
    if (Math.abs(c.base[5] - c.end[5]) > 0.04) put('панель: прозрачность', fmtV('op', c.base[5]), fmtV('op', c.end[5]));
    if (c.base[7] !== c.end[7]) { const f = clipShare(c.base[7], c.base[3], c.base[4]), g = clipShare(c.end[7], c.end[3], c.end[4]); if (f !== null && g !== null && Math.abs(f - g) > 0.02) put('панель: шторка (видно)', pct(f), pct(g)); }
    if (c === chain[0] && Math.abs(c.end[4] - c.base[4]) > 3 && !c.base[11] && !(c.base[4] === 0 && props.length)) put('панель: высота', `${c.base[4]} px`, `${c.end[4]} px`);
  }
  /* панель, которую показали (display:none → блок), входит анимацией: «из» — первый кадр @keyframes или element.animate */
  const lead0 = chain[0];
  if (lead0) {
    let fromCss = '', toCss = '';
    const w = lead0.waapi.find((x) => x.first);
    const an = lead0.anim ? String(lead0.anim.name).split(',')[0].trim() : '';
    if (w) { fromCss = kfText(w.first); toCss = w.last && w.last !== w.first ? kfText(w.last) : ''; }
    else if (an && kf && kf[an] && kf[an].length) { const fr = kf[an]; fromCss = fr[0].css; toCss = fr.length > 1 ? fr[fr.length - 1].css : ''; }
    if (fromCss) {
      const a = cssProps(fromCss, lead0.end[3], lead0.end[4]), z = cssProps(toCss, lead0.end[3], lead0.end[4]); const e = decompose(lead0.end[6]);
      if (a.op !== undefined && Math.abs(a.op - (z.op ?? lead0.end[5])) > 0.04) put('панель: прозрачность', fmtV('op', a.op), fmtV('op', z.op ?? lead0.end[5]));
      if (a.tx !== undefined && Math.abs(a.tx - (z.tx ?? e.tx)) > 2) put('панель: сдвиг X', fmtV('tx', a.tx), fmtV('tx', z.tx ?? e.tx));
      if (a.ty !== undefined && Math.abs(a.ty - (z.ty ?? e.ty)) > 2) put('панель: сдвиг Y', fmtV('ty', a.ty), fmtV('ty', z.ty ?? e.ty));
      if (a.sc !== undefined && Math.abs(a.sc - (z.sc ?? (e.sx + e.sy) / 2)) > 0.02) put('панель: масштаб', fmtV('sc', a.sc), fmtV('sc', z.sc ?? (e.sx + e.sy) / 2));
    }
    if (lead0.base[11] && !lead0.end[11]) put('панель: показ', 'display: none', 'видна');
  }
  if (panel && !props.length) put('панель: показ', 'скрыта', 'видна');
  if (!panel && diff.added.length) { const a = diff.added[0]; put('панель: показ', 'нет в DOM', `вставлена ${a.w}×${a.h}`); }
  const icon = ch.find((c) => c.end[3] <= 48 && c.end[4] <= 48 && Math.abs(decompose(c.end[6]).rot - decompose(c.base[6]).rot) >= 10);
  if (icon) put('значок: поворот', fmtV('rot', decompose(icon.base[6]).rot), fmtV('rot', decompose(icon.end[6]).rot));
  const btn = ch.find((c) => (c.isTrigger || c.inTrigger) && c.base[8] !== c.end[8]); if (btn) put('кнопка: фон', rgbHex(btn.base[8]), rgbHex(btn.end[8]));
  const col = ch.find((c) => (c.isTrigger || c.inTrigger) && c.base[9] !== c.end[9]); if (col) put('кнопка: цвет', rgbHex(col.base[9]), rgbHex(col.end[9]));
  if (t.type === 'tab' && gone.length) put('старая панель', 'видна', 'скрыта');
  if (!props.length) return null;
  /* время: события и element.animate после клика у участников, последняя смена style скриптом, снимки */
  const who = [...chain, icon, gone[0]].filter(Boolean);
  const durs = []; let easing = '';
  for (const c of who) {
    for (const e of c.ev) if (e.dur > 0) durs.push(e.dur);
    for (const w of c.waapi) { if (w.dur) durs.push(w.dur + Math.max(0, w.t)); if (!easing && w.easing) easing = w.easing; }
    if (c.styleLast != null && c.styleLast > 60) durs.push(c.styleLast);
  }
  const lead = chain[0] || icon;
  if (!easing && lead) { const d0 = msOf(lead.trans.dur).some((x) => x > 0); easing = d0 ? easeName(lead.trans.ease) : lead.anim ? easeName(lead.anim.ease) : ''; }
  const cssDur = lead ? Math.max(0, ...msOf(lead.trans.dur), ...(lead.anim ? msOf(lead.anim.dur) : [])) : 0;
  const same = (a, b) => !!a && !!b && a[0] === b[0] && Math.abs(a[4] - b[4]) <= 2 && Math.abs(a[3] - b[3]) <= 2 && a[6] === b[6] && Math.abs(a[5] - b[5]) <= 0.02 && a[7] === b[7];
  const midsLead = lead ? lead.mids.filter((m) => m.v) : [];
  const moving = midsLead.some((m) => !same(m.v, lead.end));
  const settledAt = moving ? (midsLead.find((m, k) => same(m.v, lead.end) && midsLead.slice(k).every((x) => same(x.v, lead.end))) || {}).t : null;
  let duration = durs.length ? Math.round(Math.max(...durs)) : cssDur ? Math.round(cssDur) : settledAt ? Math.round(settledAt) : 0;
  const notes = [];
  if (!moving && !durs.length && !cssDur) { duration = 0; notes.push('сразу, без анимации'); }
  else if (!durs.length && !cssDur && moving) notes.push(settledAt ? `по снимкам — улеглось к ${Math.round(settledAt)} мс` : 'двигалось дольше 0.7 с — длительность по снимкам не видна');
  if (diff.lockBase && diff.lock !== diff.lockBase && /hidden|clip/.test(diff.lock)) notes.push('прокрутка страницы блокируется');
  if (t.type === 'accordion' && t.count) notes.push(`пунктов ${t.count}`);
  if (t.type === 'tab' && t.count) notes.push(`вкладок ${t.count}`);
  return { kind: 'click', sub: CLICK_SUB[t.type], trigger: 'click', component: t.how, props: props.slice(0, 6), timing: { duration: duration || undefined, easing: easing || undefined, note: notes.join(', ') || undefined },
    el: { sig: pt.sig, text: pt.text, expect: t.expect ? { kind: t.expect } : pt.expect ? { kind: pt.expect } : null }, box: panel ? { x: panel.end[1], y: panel.end[2], w: panel.end[3], h: panel.end[4] } : null };
}

/**
 * Нажать на всё, что раскрывается по клику (clicks.mjs: меню, аккордеоны — до 2 групп, вкладки,
 * [aria-expanded]), до maxN штук и не дольше 60 с: навести (наведение — до снимка «до»), снимок всех
 * элементов, клик, снимки через 80/200/400/700 мс и через 1.5 с, разбор; вырезка открытого; закрыть
 * (повторный клик, для вкладок — клик по прежней, иначе Escape) и записать, закрылось ли.
 */
async function probeClicks(page, vp, deps, { maxN = 6, cropDir = null, out = null, debug = false } = {}) {
  const items = [], notes = [], tried = [];
  await scrollToY(page, 0); await page.mouse.move(1, 1).catch(() => {}); await sleep(300);
  let found;
  try { found = await findClickTargets(page); } catch (e) { notes.push(`поиск нажимаемого: ${String(e.message || e).slice(0, 120)}`); return { items, notes, tried }; }
  for (const e of found.errors || []) notes.push(`поиск нажимаемого: ${e}`);
  const targets = [];
  for (const x of found.toggles) targets.push({ type: 'toggle', sel: `[data-rw-ctog="${x.i}"]`, how: x.how, expect: x.expect });
  for (const g of [...found.accordions.groups].sort((a, b) => b.count - a.count).slice(0, 2)) if (g.probe[0]) targets.push({ type: 'accordion', sel: `[data-rw-cacc="${g.probe[0].id}"]`, how: `${g.chevron || 'без значка'}, ответ ${g.how}`, count: g.count, expect: g.expect });
  for (const x of found.tabs) targets.push({ type: 'tab', sel: `[data-rw-ctab="${x.n}:t"]`, back: `[data-rw-ctab="${x.n}:c"]`, how: x.how, count: x.count, expect: x.expect });
  for (const x of found.disclosures) targets.push({ type: 'disclosure', sel: `[data-rw-cexp="${x.i}"]`, how: x.controls ? `aria-expanded, aria-controls=${x.controls}` : 'aria-expanded', expect: x.expect });
  const t0all = Date.now(); let k = 0;
  const snap = (name) => evaluateWith(page, ckSnapInPage, name, deps);
  for (const t of targets.slice(0, maxN)) {
    if (Date.now() - t0all > 60000) { notes.push(`клики: не хватило 60 с, не нажато ${targets.length - tried.length}`); break; }
    const sub = CLICK_SUB[t.type];
    const pt = await evaluateWith(page, ckPointInPage, t.sel, deps).catch(() => null);
    if (!pt || pt.skip) { tried.push({ ...t, skip: pt ? pt.skip : 'не найден' }); notes.push(`клик (${sub}) ${t.sel}: ${pt ? pt.skip : 'не найден'}`); continue; }
    const url0 = page.url();
    try {
      await page.mouse.move(pt.x, pt.y, { steps: 3 }); await sleep(450);
      const b = await snap('base'); await sleep(300); await snap('pre');   /* второй снимок до клика: что меняется само */
      /* точка заново, без прокрутки: на телефоне наведение сдвигает видимое окно (у страницы шире экрана) */
      const pn = await evaluateWith(page, ckPointInPage, { sel: t.sel, noScroll: true }, deps).catch(() => null); const cp = pn && !pn.skip ? pn : pt;
      const tIn = await page.evaluate(() => performance.now());
      await page.mouse.click(cp.x, cp.y); const tc = Date.now();
      const MIDS = [80, 200, 400, 700];
      for (let q = 0; q < MIDS.length; q++) { const w = MIDS[q] - (Date.now() - tc); if (w > 0) await sleep(w); await snap('m' + q); }
      await sleep(Math.max(0, 1500 - (Date.now() - tc)));
      await snap('end');
      if (page.url().split('#')[0] !== url0.split('#')[0]) { notes.push(`клик по «${pt.text || pt.sig}» (${sub}) увёл на ${page.url()} — вернулся, клики остановлены`); await page.goBack({ waitUntil: 'load' }).catch(() => {}); break; }
      let diff = await evaluateWith(page, ckDiffInPage, { t0: tIn, mids: ['m0', 'm1', 'm2', 'm3'], trg: '[data-rw-ck-hit]' }, deps);
      const kfNames = diff ? [...new Set(diff.changed.filter((c) => c.anim).map((c) => String(c.anim.name).split(',')[0].trim()))].slice(0, 20) : [];
      const kf = kfNames.length ? await evaluateWith(page, keyframesInPage, kfNames, deps).catch(() => ({})) : {};
      let it = diff ? summarizeClick(t, pt, { ...diff, lockBase: b.lock }, kf) : null;
      if (!it && vp.hasTouch) { await page.touchscreen.tap(cp.x, cp.y).catch(() => {}); await sleep(1500); await snap('end'); diff = await evaluateWith(page, ckDiffInPage, { t0: tIn, mids: [], trg: '[data-rw-ck-hit]' }, deps); it = diff ? summarizeClick(t, pt, { ...diff, lockBase: b.lock }, kf) : null; }
      tried.push({ ...t, text: pt.text, changed: diff ? diff.total : 0, item: !!it, ...(debug && diff ? { diff: { added: diff.added, changed: diff.changed.slice(0, 40).map((c) => ({ i: c.i, par: c.par, sig: c.sig, text: c.text.slice(0, 30), trigger: c.trigger, base: c.base, end: c.end, mids: c.mids.map((m) => [m.t, m.v && m.v.slice(0, 7)]), ev: c.ev, waapi: c.waapi.map((w) => ({ t: w.t, dur: w.dur, easing: String(w.easing).slice(0, 40) })), styleLast: c.styleLast })) } } : {}) });
      if (!it) { notes.push(`клик по «${pt.text || pt.sig}» (${sub}) видимо ничего не изменил`); continue; }
      k++;
      if (cropDir && it.box) {
        try {
          const sc = await page.evaluate(() => ({ x: scrollX, y: scrollY, vw: innerWidth, vh: innerHeight }));
          const px = cp.lx ?? cp.x, py = cp.ly ?? cp.y;                /* коробка панели — в окне раскладки, точка — тоже */
          const L = Math.max(0, Math.min(it.box.x, px - 40) - 12), T = Math.max(0, Math.min(it.box.y, py - 30) - 12);
          const R = Math.min(sc.vw, Math.max(it.box.x + it.box.w, px + 40) + 12), B = Math.min(sc.vh, Math.max(it.box.y + it.box.h, py + 30) + 12);
          if (R - L > 8 && B - T > 8) { const f = path.join(cropDir, `c${String(k).padStart(2, '0')}.png`); await page.screenshot({ path: f, clip: { x: L + sc.x, y: T + sc.y, width: R - L, height: B - T }, captureBeyondViewport: false }); it.crop = path.relative(out, f).replace(/\\/g, '/'); }
        } catch (e) { /* без вырезки */ }
      }
      delete it.box;
      /* закрыть: повторный клик (вкладки — по прежней), иначе Escape */
      /* закрылось: то, что клик открыл (видимость, высота), вернулось как было; менявшееся само (снимок pre) — не в счёт */
      const shut = async () => { await snap('close'); return page.evaluate(() => { const S = window.__ckS, P = S.pre; let n = 0, back = 0; for (let i = 0; i < S.base.rows.length; i++) { const a = S.base.rows[i], z = S.end.rows[i], c = S.close.rows[i]; if (!a || !z || !c) continue; if (P && P.rows[i] && (P.rows[i][0] !== a[0] || Math.abs(P.rows[i][4] - a[4]) > 3)) continue; if (a[0] !== z[0] || Math.abs(a[4] - z[4]) > 12) { n++; if (c[0] === a[0] && Math.abs(c[4] - a[4]) <= 12) back++; } } return n ? back / n : 1; }); };
      const again = await evaluateWith(page, ckPointInPage, t.back || t.sel, deps).catch(() => null);
      let closedBy = null;
      const waitShut = Math.min(2600, Math.max(1100, (it.timing.duration || 0) + 450));
      if (again && !again.skip) { await page.mouse.click(again.x, again.y).catch(() => {}); await sleep(waitShut); if ((await shut()) >= 0.8) closedBy = t.type === 'tab' ? 'клик по прежней вкладке' : 'повторный клик'; }
      if (!closedBy) { await page.keyboard.press('Escape').catch(() => {}); await sleep(waitShut); if ((await shut()) >= 0.8) closedBy = 'Escape'; }
      it.timing.note = [it.timing.note, closedBy ? `закрывается: ${closedBy}` : 'не закрылся ни повторным кликом, ни Escape'].filter(Boolean).join(', ');
      items.push(it);
    } catch (e) { notes.push(`клик (${sub}) ${t.sel}: ${String(e.message || e).slice(0, 100)}`); }
    await page.mouse.move(1, 1).catch(() => {});
  }
  if (!targets.length) notes.push('по клику раскрываться нечему: меню-бургера, аккордеонов, вкладок и [aria-expanded] не найдено');
  return { items, notes, tried, found: { toggles: found.toggles.length, accordions: found.accordions.groups.length, tabs: found.tabs.length, disclosures: found.disclosures.length } };
}

/* ---------- сборка ---------- */
function describeTrigger(it) {
  if (it.kind === 'reveal') return `прокрутка: ${it.scroll.at}${it.cause ? `; ${it.cause}` : ''}`;
  if (it.kind === 'parallax') return `прокрутка: сдвиг = коэффициент × прокрутка${it.coefs && it.coefs.length > 1 ? ` (слои: ${it.coefs.join(', ')})` : ` (${it.scroll.coefficient})`}`;
  if (it.kind === 'scroll-linked') return it.scroll && it.scroll.from ? `прокрутка: ${it.scroll.from} → ${it.scroll.to} (${it.scroll.rangePx} px)` : `прокрутка${it.scroll && it.scroll.note ? `: ${it.scroll.note}` : ''}`;
  return { load: 'загрузка', time: 'время (само)', scroll: 'прокрутка', hover: 'наведение', mouse: 'движение мыши', click: 'клик' }[it.trigger] || it.trigger;
}
function describeTiming(it) {
  const t = it.timing || {}; const p = [];
  if (t.duration) p.push(`${t.duration} мс`); if (t.easing) p.push(easeShort(t.easing)); if (t.delay) p.push(`задержка ${t.delay} мс`);
  if (t.stagger) p.push(`по очереди +${t.stagger} мс`);
  if (t.period && !/у каждого свой/.test(t.note || '')) p.push(`период ${round(t.period / 1000, 1)} с`);   /* у группы вразнобой — диапазон в note */ if (t.speed) p.push(t.speed); if (t.note) p.push(t.note);
  if (it.scroll && it.scroll.coefficient !== null && it.scroll.coefficient !== undefined) p.push(`коэффициент ${it.scroll.coefficient} (px сдвига на px прокрутки)`);
  return p.join(', ') || '—';
}
const RECIPE = { entrance: 'entrance', reveal: 'reveal', 'scroll-linked': 'scroll-scrub', parallax: 'parallax', pinned: 'pin', header: 'header-scroll', progress: 'scroll-progress',
  marquee: 'marquee', typewriter: 'typewriter', 'rotating-words': 'rotating-words', counter: 'counter', carousel: 'carousel-auto', loop: 'loop', hover: 'hover', mouse: 'mouse-tilt', cursor: 'custom-cursor', canvas: 'canvas', video: 'video-bg' };
const KIND_RU = { entrance: 'вход при загрузке', reveal: 'появление', 'scroll-linked': 'привязано к прокрутке', parallax: 'параллакс', pinned: 'закреплённый раздел', header: 'шапка при прокрутке', progress: 'прогресс прокрутки',
  marquee: 'бегущая строка', typewriter: 'печатающийся текст', 'rotating-words': 'смена слов', counter: 'счётчик', carousel: 'карусель сама', loop: 'петля', hover: 'наведение', mouse: 'реакция на мышь', cursor: 'свой курсор', canvas: 'холст рисует', video: 'видео-фон', click: 'по клику' };

async function inventory(url, vpSpec, { out, tag, timeMs = 6000, capMs = LOOP.cap, hoverN = 14, doHover = true, doMouse = true, doScroll = true, doClicks = true, clickN = 6, crops = true, quiet = false, debug = false, browser: shared = null } = {}) {
  const say = (s) => { if (!quiet) console.log(s); };
  const rv = resolveViewport(vpSpec || 'desktop'); if (!rv) die(`Неизвестный экран: ${vpSpec}`);
  const [vpName, vp] = rv;
  const browser = shared || await launch();
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
    const deps = { sig: SIG_FN, screenPt: SCREEN_POINT_FN };
    result.libs = await evaluateWith(page, libsInPage, null, deps);
    let n = await evaluateWith(page, collectInPage, 5000, deps);
    /* под наблюдение попала малая доля элементов (у остальных коробка меньше 100 px²) — страница не дорисовалась:
       shapefest в 2 из 7 открытий давал 69–214 вместо 850–1500, и петли стопки не находились вовсе. Подождать и
       собрать заново один раз; не помогло — записать в протокол */
    const domAll = async () => page.evaluate(() => (document.body ? document.body.getElementsByTagName('*').length : 0)).catch(() => 0);
    let all = await domAll();
    if (all > 300 && n < all * 0.3) { await sleep(2000); n = await evaluateWith(page, collectInPage, 5000, deps); all = await domAll(); }
    if (all > 300 && n < all * 0.3) result.notes.push(`под наблюдением ${n} элементов из ${all} в DOM — страница, похоже, не дорисовалась; снимок неполный, переснять`);
    say(`Страница открыта за ${round((Date.now() - tLoad0) / 1000, 1)} с · элементов под наблюдением: ${n} (в DOM ${all}) · ${result.libs.libs.join(', ') || 'библиотек движения не видно'}`);

    /* 1. без прокрутки: время. Базовое окно timeMs; если кто-то движется медленнее окна (меньше двух разворотов
       и не встал, или едва начал и движется ровно) — продлевать кусками по LOOP.chunk, но не дольше capMs */
    const timeSteps = [];
    const tStart = Date.now(); let tStop = tStart + timeMs; let peeks = 0; let slow = 0;
    for (;;) {
      while (Date.now() < tStop) { timeSteps.push((await evaluateWith(page, sampleInPage, 'time', deps)).step); await sleep(110); }
      if (Date.now() - tStart >= capMs) break;
      const peek = await evaluateWith(page, timePeekInPage, null, deps); peeks++;
      const an = await evaluateWith(page, animationsInPage, null, deps);
      const cssOf = (i) => an.find((a) => a.i === i && a.iterations === 'infinite' && !a.timeline) || null;
      const st = peek.t.map((t) => ({ t }));
      slow = peek.series.filter((el) => { el.u = unroll(el.rows, st.length); return unresolved(classifyEl(el, st, timeSteps, { cssLoop: cssOf(el.i) })); }).length;
      if (!slow) break;
      tStop = Math.min(tStart + capMs, Date.now() + LOOP.chunk);
    }
    const timeObs = Date.now() - tStart;
    if (timeObs > timeMs + 500) say(`Окно «время» продлено до ${round(timeObs / 1000, 1)} с: медленное движение (период длиннее окна ${round(timeMs / 1000, 1)} с)${Date.now() - tStart >= capMs && slow ? ', упёрлось в --time-cap' : ''}`);
    const animsTop = await evaluateWith(page, animationsInPage, null, deps);
    /* текст, который менялся: наблюдать чаще и дольше — слово печатается, держится секунды и стирается */
    const txtIdx = await evaluateWith(page, textCandidatesInPage, null, deps);
    const textWatch = txtIdx.length ? await evaluateWith(page, textWatchInPage, { idx: txtIdx, ms: 9000 }, deps) : {};
    const textLog = await evaluateWith(page, textLogInPage, null, deps).catch((e) => { result.notes.push(`журнал смен текста не прочитан: ${String(e.message || e).slice(0, 120)}`); return []; });
    const textLogSize = debug ? await page.evaluate(() => { const mo = window.__mo; if (!mo || !mo.text) return null; const by = {}; for (const [el, log] of mo.text) { const k = el.tagName + '.' + String(el.getAttribute('class') || '').split(' ')[0] + (el.isConnected ? '' : ' (отключён)'); (by[k] = by[k] || []).push(log.length); } return { size: mo.text.size, by }; }).catch((e) => String(e.message || e)) : null;

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

    /* 5. клики — после наведения: меню, аккордеоны, вкладки, [aria-expanded] (раскрывают и закрывают обратно) */
    const tClick0 = await page.evaluate(() => performance.now());
    let clicks = null;
    if (doClicks) {
      const cropDir = crops ? ensureDir(path.join(out, 'motion', tag)) : null;
      clicks = await probeClicks(page, vp, deps, { maxN: clickN, cropDir, out, debug }).catch((e) => ({ items: [], notes: [`клики: ${String(e.message || e).slice(0, 120)}`], tried: [] }));
      await scrollToY(page, 0); await sleep(300);
    }

    const animsEnd = await evaluateWith(page, animationsInPage, null, deps);
    const ev = await evaluateWith(page, eventsInPage, null, deps);
    const data = await evaluateWith(page, seriesOutInPage, null, deps);
    const kfNames = [...new Set([...animsTop, ...animsEnd].filter((a) => a.kind === 'CSSAnimation').map((a) => a.name).concat(ev.ev.filter((e) => e.type === 'anim').map((e) => e.name)))].slice(0, 80);
    const kf = await evaluateWith(page, keyframesInPage, kfNames, deps);

    if (debug) writeJson(path.join(out, "motion", `${tag}.series.json`), { steps: data.steps, series: data.series.map((x) => ({ ...x, u: undefined })), timeIdx: timeSteps, scrollIdx: scrollSteps, upIdx: upSteps, anims: animsTop, textWatch, textLog, textLogSize });
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
    /* окно «время»: сначала все элементы (петли — группами соседей по родителю), потом прокрутка */
    const timeOf = new Map(); const perEl = [];
    for (const el of data.series) {
      const r = analyzeTime(el, steps, timeIdx, animsTop, finiteEls.has(el.i), textWatch[el.i]);
      timeOf.set(el.i, r); if (r.cls.length) perEl.push({ el, cls: r.cls });
    }
    const loops = loopRows(perEl);
    const inLoop = new Set(loops.flatMap((r) => r.mk));
    const loopAt = new Map(); for (const r of loops) loopAt.set(r.i, [...(loopAt.get(r.i) || []), r]);
    for (const el of data.series) {
      /* какие свойства менялись во времени (петли) — их прокрутке не приписываем: вторая половина окна (как было)
         и то, что разбор окна признал петлёй, вращением, «окном короче периода» или ровным началом долгой петли —
         медленный поворот стопки во второй половину окна не попадал и утекал в параллакс */
      const tv = timeIdx.slice(Math.floor(timeIdx.length / 2)).map((s) => propsOf(el.u[s])).filter(Boolean);
      const timeChanged = new Set();
      for (const k of ['tx', 'ty', 'sc', 'rot', 'op', 'blur', 'clip']) { const ys = tv.map((v) => v[k]); if (ys.length > 2 && Math.max(...ys) - Math.min(...ys) > EPS[k] * 2) timeChanged.add(k); }
      if (tv.length > 2 && new Set(tv.map((v) => v.text)).size > 2) timeChanged.add('text');
      const r = timeOf.get(el.i);
      for (const c of r.cls) if (inLoop.has(`${el.i}|${c.k}`) || c.status === 'undetermined' || slowStart(c)) timeChanged.add(c.k);
      for (const it of r.items) items.push({ ...it, i: el.i, el });
      for (const it of loopAt.get(el.i) || []) items.push(it);
      if (loopTargets.has(el.i)) { for (const k of ['tx', 'ty', 'sc', 'rot', 'op']) timeChanged.add(k); }
      for (const it of analyzeScroll(el, steps, scrollIdx, vh, { vw, upIdx: upSteps, timeChanged })) items.push({ ...it, i: el.i, el });
    }
    /* печать с загрузки (журнал смен текста), которую окна «время» и частое наблюдение не поймали */
    for (const lg of textLog) {
      const prev = items.findIndex((x) => (x.kind === 'typewriter' || x.kind === 'rotating-words') && ((lg.i >= 0 && x.i === lg.i) || (x.el && x.el.sig === lg.sig)));
      const L = lg.log; const add = [], del = [];
      for (let k = 1; k < L.length; k++) { const dl = L[k][1].length - L[k - 1][1].length, dt = (L[k][0] - L[k - 1][0]) / 1000; if (dt > 0 && dt < 1 && dl) (dl > 0 ? add : del).push(Math.abs(dl) / dt); }
      if (add.length < 3) continue;
      const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const once = !del.length && L[L.length - 1][0] < tTime0 + 1500;
      /* окно «время» застало хвост печати, что идёт один раз при загрузке (стенд: печать 1.2 с, страница открылась
         за 0.1 с — «набор ≈1 знаков/с, видели не целиком»): журнал с загрузки видел её целиком — строка из журнала */
      /* то же, если окно видело слово урывками («видели не целиком», «набор ≈0 знаков/с»: shapefest печатает каждое
         слово в новом элементе, под наблюдением только тот, что был при сборе, — длинное окно чаще застаёт его) */
      const weak = (x) => /видели не целиком/.test(x.props.map((p) => p.to).join(' ')) || /≈0 знаков|не пойман/.test((x.timing && x.timing.speed) || '');
      if (prev >= 0 && !once && !weak(items[prev])) continue;
      if (prev >= 0) items.splice(prev, 1);
      const series = lg.i >= 0 ? data.series.find((s) => s.i === lg.i) : null;
      /* слова — допечатанные до стирания (пики длины); ни одного — самое длинное из увиденного */
      const seq = L.map((x) => x[1]); const words = [...new Set(seq.filter((w, q) => q + 1 < seq.length && seq[q + 1].length < w.length && (q === 0 || seq[q - 1].length < w.length) && w.length > 1))];
      /* допечатанное стоит на странице (последняя запись = текущий текст) — слово целое, даже если стирания не видели */
      const settled = seq[seq.length - 1] === lg.text && seq[seq.length - 1].length > 1;
      const shown = once || (!words.length && settled) ? [seq[seq.length - 1]] : words.length ? words.slice(0, 5) : [[...seq].sort((a, b) => b.length - a.length)[0] + ' (видели не целиком)'];
      items.push({ kind: 'typewriter', trigger: once ? 'load' : 'time', props: [{ prop: 'текст', from: '', to: shown.join(' / ').slice(0, 90) }],
        timing: { speed: `набор ≈${round(med(add))} знаков/с${del.length ? `, стирание ≈${round(med(del))}/с` : ''}`, note: once ? `печатается один раз при загрузке (за ${round((L[L.length - 1][0] - L[0][0]) / 1000, 1)} с), дальше стоит` : 'по журналу смен текста с загрузки' },
        ...(lg.i >= 0 ? { i: lg.i } : {}), el: series || { sig: lg.sig, text: lg.text, expect: lg.expect ? { kind: lg.expect } : null } });
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
    /* вход при загрузке: события до конца фазы «время» у элементов первого экрана (базового окна: продление ради
       медленной петли входов не добавляет) */
    const tTimeEnd = Math.min(steps[timeIdx[timeIdx.length - 1]] ? steps[timeIdx[timeIdx.length - 1]].t : Infinity, tTime0 + timeMs);
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
      const isScrollReveal = items.some((x) => (x.i === g.i || (x.is && x.is.includes(g.i))) && ['reveal', 'carousel', 'marquee', 'loop', 'typewriter', 'rotating-words', 'counter'].includes(x.kind));
      if (isScrollReveal) continue;
      items.push({ kind: 'entrance', trigger: 'load', props: [{ prop: g.prop || g.name, from: first.slice(0, 70) || (p0 ? `прозрачность ${p0.op}` : ''), to: last.slice(0, 70) || (p1 ? `прозрачность ${p1.op}` : '') }],
        timing: { duration: Math.max(...g.durs), easing: g.waapi ? g.waapi.easing : (el ? easeName(g.name ? el.anim.ease : el.trans.ease) : '') }, source: g.waapi ? 'element.animate' : (g.name ? `css @keyframes ${g.name}` : `переход ${g.prop}`), i: g.i, el: el || { sig: g.sig }, count: g.n > 1 ? g.n : undefined });
    }
    /* появления: причина (класс, событие) и длительность */
    for (const it of items.filter((x) => x.kind === 'reveal')) {
      const cls = ev.cls.filter((c) => c.i === it.i && c.added.length && c.t < tClick0);
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
        const mEl = el || { sig: pos[0][4] || '', text: '', expect: pos[0][5] ? { kind: pos[0][5] } : null };
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

    if (clicks) { for (const it of clicks.items) items.push(it); result.clicks = { found: clicks.found || null, tried: clicks.tried.map((x) => ({ type: x.type, sel: x.sel, text: x.text, skip: x.skip, changed: x.changed, item: x.item, ...(x.diff ? { diff: x.diff } : {}) })) }; result.notes.push(...clicks.notes); }
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
      if (same) {
        if (it.members) { same.count = (same.count || 1) + (it.count || 1); same.members = [...(same.members || []), ...it.members].slice(0, 30); same.is = [...(same.is || []), ...it.is]; for (const m of it.members) if (same.examples.length < 3) same.examples.push(m); continue; }
        same.count = (same.count || 1) + 1; if (same.examples.length < 3) same.examples.push(it.el.sig); if (it.kind === 'parallax' && it.scroll) same.coefs.push(it.scroll.coefficient); continue;
      }
      /* строка группы петель — участники в examples (первые три), решение compare — и на группу (members, parent) */
      final.push({ ...it, _key: key, count: it.count || 1, examples: it.members ? it.members.slice(0, 3) : [it.el.sig], coefs: it.scroll && it.kind === 'parallax' ? [it.scroll.coefficient] : [] });
    }
    /* строки без изменения («сдвиг X 0 px → 0 px»: дрожь меньше шага округления) — не движение */
    for (const it of final) it.props = it.props.filter((p) => !(p.from !== '' && p.from === p.to));
    for (let q = final.length - 1; q >= 0; q--) if (!final[q].props.length) final.splice(q, 1);
    /* номера, рецепты, вырезки */
    let k = 0;
    const cropDir = path.join(out, 'motion', tag);
    if (crops) ensureDir(cropDir);
    for (const it of final) {
      k++; it.id = `m${String(k).padStart(2, '0')}`; it.recipe = it.kind === 'click' ? CLICK_RECIPE[it.sub] || 'click' : RECIPE[it.kind] || it.kind;
      it.target = it.el.sig; it.text = it.el.text || ''; it.expect = it.el.expect ? it.el.expect.kind : (it.el.expectInside && it.el.expectInside[0]) || '';
      if (crops && (it.i !== undefined || it.hover !== undefined)) {
        try {
          const box = await page.evaluate((ref) => {
            const el = ref.hover !== undefined ? window.__moHover[ref.hover] : window.__moEls[ref.i]; if (!el || !el.isConnected) return null;
            el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect();
            const x = Math.max(0, r.left - 12), y = Math.max(0, r.top - 12);
            /* область снимка — в координатах документа (puppeteer 25), внутри окна */
            return { x: x + scrollX, y: y + scrollY, width: Math.max(8, Math.min(innerWidth - x, r.width + 24)), height: Math.max(8, Math.min(innerHeight - y, r.height + 24)) };
          }, { i: it.cropI ?? it.i, hover: it.hover });
          if (box) { await sleep(250); const f = path.join(cropDir, `${it.id}.png`); await page.screenshot({ path: f, clip: box, captureBeyondViewport: false }); it.crop = path.relative(out, f).replace(/\\/g, '/'); }
        } catch (e) { /* без вырезки */ }
      }
      if (it.el.expectNot) it.expectNot = it.el.expectNot;
      delete it.el; delete it._key; delete it.is; delete it.mk; delete it.cropI; if (!it.coefs.length) delete it.coefs;
    }
    result.items = final;
    result.stats = { steps: { time: timeIdx.length, scroll: scrollIdx.length, up: upSteps.length, timeMs: timeObs, timeBaseMs: timeMs, peeks }, slowUnresolved: perEl.filter((x) => unresolved(x.cls)).length || undefined, observed: n, inDom: all, changed: data.series.length, events: ev.ev.length, waapi: ev.waapi.length, classChanges: ev.cls.length, capped: ev.capped, seconds: round((Date.now() - t0) / 1000, 1) };
    if (!result.libs.reducedRule) result.notes.push('правила prefers-reduced-motion в CSS нет — у нас обязательно (reference/motion.md)');
    if (ev.capped) result.notes.push('событий больше 8000 — часть не записана');
    await page.close();
  } finally { if (!shared) await browser.close(); }
  result.verdict = 'OK';
  return result;
}

/* ---------- отчёт ---------- */
function mdTable(res) {
  const L = [`# Движение: ${res.url} (${res.viewport} ${res.size})`, '',
    `Снято ${res.takenAt.slice(0, 16).replace('T', ' ')} · motion.mjs · за ${res.stats ? res.stats.seconds : '?'} с${res.stats && res.stats.steps.timeMs > res.stats.steps.timeBaseMs + 500 ? ` · окно «время» ${round(res.stats.steps.timeMs / 1000, 1)} с (продлено ради медленного движения)` : ''} · окно cookie: ${res.consent || '—'} · библиотеки: ${res.libs.libs && res.libs.libs.length ? res.libs.libs.join(', ') : 'не видно'} · «меньше движения»: ${res.libs.reducedRule ? 'правило есть' : 'НЕТ'}${res.libs.smoothCss ? ' · html{scroll-behavior:smooth}' : ''}`, '',
    '| № | вид | где | запуск | что меняется | параметры | как повторить |', '|---|---|---|---|---|---|---|'];
  for (const it of res.items) {
    /* одинаковый эффект у разных элементов — назвать и остальные (до двух) */
    const others = [...new Set((it.examples || []).map(pattern))].filter((x) => x !== pattern(it.target)).slice(0, 2);
    const where = `\`${it.target}\`${it.count > 1 ? ` ×${it.count}` : ''}${others.length ? ` (и ${others.map((x) => `\`${x}\``).join(', ')})` : ''}${it.members && it.count > 1 && it.parent ? ` · соседи в \`${it.parent}\`` : ''}${it.text ? ` «${it.text.slice(0, 28)}»` : ''}${it.crop ? ` [вырезка](${it.crop})` : ''}`;
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
  if (it.kind === 'reveal') return it.sub === 'исчезает' ? 'reveal:out' : it.sub === 'при прокрутке вверх' ? 'reveal:up' : 'reveal:in';
  if (it.kind === 'hover') return `hover:${it.component || ''}`;
  if (it.kind === 'counter') return 'counter';
  if (it.kind === 'click') return `click:${it.sub || ''}`;
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
      if (['reveal', 'scroll-linked', 'parallax', 'entrance', 'click'].includes(d.kind)) { const pr = (d.props || []).find((x) => x.prop === prop); diffs.push(`нет «${prop}» (${pr ? `${pr.from} → ${pr.to}` : `${a} → ${b}`})`); score -= 0.25; }
      /* наведение: у донора меняется цвет, у нас — только подчёркивание — это другое наведение, а не то же */
      else if (d.kind === 'hover') { const pr = (d.props || []).find((x) => x.prop === prop); diffs.push(`у нас не меняется «${prop}»${pr ? ` (у донора ${pr.from} → ${pr.to})` : ''}`); score -= 0.15; }
      continue;
    }
    const [c, e] = no[prop];
    if (d.kind === 'click' && /высота/.test(prop)) continue;       /* высота панели — от содержимого, не язык движения */
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
/* Решение по строке донора: первый найденный ключ — номер, «вид:подпись», «вид:подпись» любого участника группы
   (старые решения на картинку стопки работают), «вид:<родитель> > *» — на всю группу детей, вид. Голый
   «loop:<родитель>» — решение про сам родитель (у shapefest он качается своей строкой), детей не закрывает. */
function decisionFor(d, dec) {
  const keys = [d.id, `${d.kind}:${pattern(d.target)}`, ...(d.members || []).map((m) => `${d.kind}:${pattern(m)}`), ...(d.parent ? [`${d.kind}:${d.parent} > *`] : []), d.kind];
  const k = keys.find((x) => x && Object.prototype.hasOwnProperty.call(dec, x) && dec[x]); return k ? { key: k, text: String(dec[k]) } : null;
}
/* одно наше движение может закрывать несколько одинаковых у донора (одна анимация карточек на весь каталог) */
function compare(donor, ours, decisions) {
  const rows = []; const used = new Set();
  for (const d of donor.items) {
    let best = null;
    for (const o of ours.items) { const s = similar(d, o); if (s.score > 0 && (!best || s.score > best.s.score || (s.score === best.s.score && !used.has(o.id) && used.has(best.o.id)))) best = { o, s }; }
    const hit = decisionFor(d, decisions); const dec = hit ? hit.text : ''; const key = hit ? hit.key : '';
    if (best) { used.add(best.o.id); rows.push({ d, o: best.o, status: best.s.diffs.length ? 'ОТЛИЧАЕТСЯ' : 'OK', diffs: best.s.diffs, notes: best.s.notes || [], decision: dec, key }); }
    else rows.push({ d, o: null, status: dec ? 'РЕШЕНО' : 'НЕТ', diffs: [], notes: [], decision: dec, key });
  }
  const extra = ours.items.filter((o) => !used.has(o.id));
  const miss = rows.filter((r) => r.status === 'НЕТ').length, diff = rows.filter((r) => r.status === 'ОТЛИЧАЕТСЯ' && !r.decision).length;
  const verdict = miss ? 'FAIL' : diff ? 'WARN' : 'OK';
  return { rows, extra, verdict, miss, diff };
}
function mdCompare(c, donor, ours) {
  const L = [`# Сверка движения: донор → наш сайт`, '', `Донор: ${donor.url} (${donor.viewport}) · наш: ${ours.url} (${ours.viewport}) · вердикт **${c.verdict}** (нет без решения: ${c.miss}, отличается: ${c.diff})`, '',
    '| донор | вид | у донора | у нас | статус | разница / решение | ключ решения |', '|---|---|---|---|---|---|---|'];
  for (const r of c.rows) {
    const d = r.d; const dWhat = `\`${d.target}\`${d.count > 1 ? ` ×${d.count}` : ''}: ${d.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ').slice(0, 90)}`;
    const hint = !r.key && r.status !== 'OK' && d.parent && d.count > 1 ? `на группу — \`${d.kind}:${d.parent} > *\`` : '—';   /* строка ×N без решения: каким ключом закрыть */
    L.push(`| ${d.id} | ${KIND_RU[d.kind] || d.kind}${d.sub ? ` (${d.sub})` : ''} | ${dWhat.replace(/\|/g, '/')} | ${r.o ? `${r.o.id} \`${r.o.target}\`` : '—'} | ${r.status} | ${[...r.diffs, ...(r.notes || []), r.decision].filter(Boolean).join('; ').replace(/\|/g, '/') || '—'} | ${r.key ? `\`${r.key.replace(/\|/g, '/')}\`` : hint} |`);
  }
  L.push('', `## Своё (у донора нет) — ${c.extra.length}`, '', ...(c.extra.length ? c.extra.map((o) => `- ${o.id} ${KIND_RU[o.kind] || o.kind}${o.sub ? ` (${o.sub})` : ''} — \`${o.target}\`: ${o.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ').slice(0, 100)}`) : ['- нет']),
    '', 'Решения «почему нет / чем заменено» — `motion-decisions.json` в папке прогона: { "m04": "почему", "reveal:div.card": "почему" }; на группу петель (строка ×N) — "loop:<родитель> > *".', 'Своё — сверить с банком идей (`ideas.mjs list`): задумано ли, записать удачное.');
  return L.join('\n') + '\n';
}

/* =====================================================================
   Команды
   ===================================================================== */
const cmd = pos[0] === 'compare' || pos[0] === 'selftest' ? pos.shift() : 'inventory';
const timeMs = opt.time !== undefined ? Number(opt.time) : 6000;
if (!(timeMs >= 1000 && timeMs <= 20000)) die('--time: от 1000 до 20000 мс');
const capMs = opt['time-cap'] !== undefined && opt['time-cap'] !== true ? Number(opt['time-cap']) : LOOP.cap;
if (!(capMs >= 1000 && capMs <= 60000)) die('--time-cap: от 1000 до 60000 мс');
const hoverN = opt.hover !== undefined && opt.hover !== true ? Number(opt.hover) : 14;
if (!(hoverN >= 0 && hoverN <= 60)) die('--hover: от 0 до 60');
const clickN = opt.clicks !== undefined && opt.clicks !== true ? Number(opt.clicks) : 6;
if (!(clickN >= 0 && clickN <= 20)) die('--clicks: от 0 до 20');
const phases = { timeMs, capMs, hoverN, clickN, doHover: !opt['no-hover'], doMouse: !opt['no-mouse'], doScroll: !opt['no-scroll'], doClicks: !opt['no-clicks'] && clickN > 0, crops: !opt['no-crops'] };
const vpList = (v) => String(v && v !== true ? v : 'desktop').split(',').map((x) => x.trim()).filter(Boolean);
for (const v of vpList(opt.viewport)) if (!resolveViewport(v)) die(`Неизвестный экран: ${v}`);

if (cmd === 'selftest') {
  const url = pathToFileURL(path.join(HERE, 'fixtures', 'motion', 'index.html')).href;
  const out = path.resolve(String(opt.out || path.join(process.env.TEMP || process.env.TMPDIR || '.', 'motion-selftest')));
  const res = await inventory(url, vpList(opt.viewport)[0], { out, tag: 'selftest', ...phases, crops: false });
  writeJson(path.join(out, 'motion', 'selftest.json'), res);
  const html = fs.readFileSync(path.join(HERE, 'fixtures', 'motion', 'index.html'), 'utf8');
  const expected = [...html.matchAll(/data-expect="([\w-]+)"/g)].map((m) => m[1]).filter((k) => phases.doClicks || !/^click-/.test(k));
  const need = [...new Set(expected)];
  const CK = { 'меню': 'click-menu', 'аккордеон': 'click-accordion', 'вкладки': 'click-tabs', 'раскрытие': 'click-disclosure' };
  /* петли на JS (source js): группа соседей ×N — loop-group, одна — loop-js (колебание), pulse-js, blink-js, spin-js */
  const JSK = { 'колебание': 'loop-js', 'пульс': 'pulse-js', 'мигание': 'blink-js', 'вращение': 'spin-js' };
  const key = (i) => (i.kind === 'loop' && i.source === 'js' ? (i.count > 1 ? 'loop-group' : JSK[i.sub] || 'loop-js') : i.kind === 'loop' ? ({ 'парение': 'float', 'вращение': 'spin', 'пульс': 'pulse', 'мигание': 'blink' }[i.sub] || 'loop') : i.kind === 'reveal' && i.sub === 'при прокрутке вверх' ? 'reveal-up' : i.kind === 'typewriter' && i.trigger === 'load' ? 'typewriter-load' : i.kind === 'click' ? (i.sub === 'аккордеон' && /details/.test(i.component || '') ? 'click-details' : CK[i.sub] || 'click') : i.kind);
  const found = new Set(res.items.map(key));
  const byExpect = new Set(res.items.map((i) => i.expect).filter(Boolean));
  let bad = 0;
  for (const k of need) { const ok = found.has(k); const at = byExpect.has(k); if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${k}${ok ? (at ? '' : ' (найдено, но не на своём блоке)') : ' — не найдено'}`); }
  /* data-expect-not: на этом блоке такого вида быть не должно (пружина входа — не петля) */
  const nots = [...new Set([...html.matchAll(/data-expect-not="([\w -]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean))]; let wrong = 0;
  for (const k of nots) { const hit = res.items.filter((i) => i.expectNot && i.expectNot.split(/\s+/).includes(k) && (i.kind === k || key(i) === k)); if (hit.length) wrong++; console.log(`${hit.length ? 'FAIL' : 'OK  '} не ${k}${hit.length ? ` — найдено на блоке, где его быть не должно: ${hit.map((i) => `${i.id} ${i.target}`).join(', ')}` : ''}`); }
  /* data-expect-n: строка ×N на своём блоке — одна и участников ровно N (стопка — одной строкой, не поштучно) */
  for (const [, k, n] of html.matchAll(/data-expect="([\w-]+)"[^>]*?data-expect-n="(\d+)"/g)) {
    const rows = res.items.filter((i) => i.expect === k && key(i) === k); const ok = rows.length === 1 && rows[0].count === Number(n); if (!ok) wrong++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${k} ×${n}${ok ? '' : ` — строк ${rows.length}${rows.length ? `, участников ${rows.map((i) => i.count).join('/')}` : ''}`}`);
  }
  const st = res.stats.steps;
  console.log(`\n${mdTable(res)}`);
  /* клики на телефоне со страницей шире экрана: видимое окно увеличено ×1.25 (Emulation.setPageScaleFactor — так
     бывает после прохода discover, scale 1.056), окно раскладки больше видимого. Точка из getBoundingClientRect
     должна попадать (сдвиг на offset, без «× scale»), меню в шапке — нажаться или честно «за краем экрана» */
  let wide = 0;
  if (phases.doClicks) {
    const [, mvp] = resolveViewport('mobile'); const br = await launch();
    try {
      const page = await preparePage(br, mvp, {}); await page.evaluateOnNewDocument(instrument);
      await gotoRetry(page, url, { waitUntil: 'load', timeout: 60000 });
      const cdp = await page.createCDPSession(); await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 }); await sleep(300);
      const w = await page.evaluate(() => ({ iw: innerWidth, vw: Math.round(visualViewport.width), sc: Math.round(visualViewport.scale * 100) / 100 }));
      const ck = await probeClicks(page, mvp, { sig: SIG_FN, screenPt: SCREEN_POINT_FN }, { maxN: clickN });
      const got = new Set(ck.items.map((it) => (it.sub === 'аккордеон' && /details/.test(it.component || '') ? 'click-details' : CK[it.sub])));
      console.log(`\nклики на телефоне ×${w.sc}: окно раскладки ${w.iw} px, видимое ${w.vw} px`);
      for (const k of ['click-accordion', 'click-details', 'click-tabs', 'click-disclosure']) { const ok = got.has(k); if (!ok) wide++; console.log(`${ok ? 'OK  ' : 'FAIL'} ×1.25 ${k}${ok ? '' : ` — не найдено (${ck.notes.filter((n) => !/меню/.test(n)).join('; ').slice(0, 200) || 'без заметок'})`}`); }
      const edge = ck.notes.find((n) => /меню/.test(n) && /за краем экрана/.test(n)); const ok = got.has('click-menu') || !!edge; if (!ok) wide++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ×1.25 click-menu — ${got.has('click-menu') ? 'нажато' : edge ? 'за краем экрана (не нажимается, как у человека)' : `не найдено (${ck.notes.join('; ').slice(0, 200)})`}`);
      await page.close();
    } finally { await br.close().catch(() => {}); }
  }
  console.log(`${bad || wrong || wide ? 'FAIL' : 'OK'}: видов ${need.length}, не найдено ${bad}; запретов и счётов ×N не выполнено ${wrong}; кликов ×1.25 мимо ${wide} · окно «время» ${round(st.timeMs / 1000, 1)} с (базовое ${round(st.timeBaseMs / 1000, 1)}) · ${path.join(out, 'motion', 'selftest.json')}`);
  bad += wrong + wide;
  process.exit(bad ? 1 : 0);
}

/* страницы запуска: адреса подряд и --pages «тип=путь,…» или «путь,…» от первого адреса.
   Имя протокола: одна страница и один экран — --tag как есть (или <страница>-<экран>); несколько —
   <--tag>-<тип или страница>, у экрана не desktop — ещё -<экран> (donor-home, donor-product-mobile);
   без --tag — <тип или страница>-<экран>. */
function pagePlan() {
  const urls = pos.filter((p) => /^(https?|file):/i.test(p));
  const junk = pos.filter((p) => !/^(https?|file):/i.test(p));
  if (junk.length) die(`Не адрес: ${junk.join(' ')} — адреса начинаются с http://, https:// или file:// (страницы от первого адреса — --pages)`);
  const list = urls.map((u) => ({ url: u, type: null }));
  if (opt.pages && opt.pages !== true) {
    if (!urls.length) die('--pages считаются от первого адреса: node motion.mjs <адрес> --pages "home=/,product=/p/x"');
    for (const part of String(opt.pages).split(',').map((x) => x.trim()).filter(Boolean)) {
      const m = /^([\p{L}\w-]+)=(.+)$/u.exec(part);
      const href = new URL(unmangle(m ? m[2] : part), urls[0]).href;
      const same = list.find((x) => x.url === href);
      if (same) { if (m) same.type = m[1]; continue; }
      list.push({ url: href, type: m ? m[1] : null });
    }
  }
  if (!list.length) die('Нужно: node motion.mjs <адрес> [<адрес>…] [--pages "тип=путь,…"] [--viewport desktop,mobile] [--out папка] (подробно: --help)');
  const vps = vpList(opt.viewport); const prefix = opt.tag && opt.tag !== true ? String(opt.tag) : '';
  const single = list.length === 1 && vps.length === 1;
  const runs = [];
  for (const p of list) for (const vp of vps) {
    const name = p.type || pageSlug(p.url);
    const tag = single ? (prefix || `${name}-${vp}`) : prefix ? `${prefix}-${name}${vp === 'desktop' ? '' : '-' + vp}` : `${name}-${vp}`;
    if (runs.some((r) => r.tag === tag)) die(`Два протокола с одним именем ${tag}: задайте типы в --pages («тип=путь»)`);
    runs.push({ url: p.url, vp, tag, type: p.type });
  }
  return runs;
}

if (cmd === 'compare') {
  /* пары «протокол донора — наш адрес или протокол» подряд: compare d1.json url1 d2.json url2 … */
  if (pos.length < 2 || pos.length % 2) die('Нужно: node motion.mjs compare <motion.json донора> <адрес или motion.json нашего> [ещё пары…] (подробно: --help)');
  const pairs = []; for (let q = 0; q < pos.length; q += 2) pairs.push([pos[q], pos[q + 1]]);
  const many = pairs.length > 1;
  let browser = null; let worst = 'OK'; const rank = { OK: 0, WARN: 1, FAIL: 2 };
  try {
    for (const [donorFile, ourArg] of pairs) {
      const donor = readJson(path.resolve(donorFile)); if (!donor || !Array.isArray(donor.items)) die(`Не читается протокол донора: ${donorFile}`);
      let ours; let out;
      if (/^(https?|file):/i.test(ourArg)) {
        out = opt.out ? path.resolve(String(opt.out)) : runDir(opt, ourArg);
        const vp = opt.viewport && opt.viewport !== true ? vpList(opt.viewport)[0] : donor.viewport || 'desktop';
        const tag = `${pageSlug(ourArg)}-${vp}`;
        if (!browser) browser = await launch();
        ours = await inventory(ourArg, vp, { out, tag, ...phases, browser });
        writeJson(path.join(out, 'motion', `${tag}.json`), ours); fs.writeFileSync(path.join(out, 'motion', `${tag}.md`), mdTable(ours));
      } else {
        ours = readJson(path.resolve(ourArg)); if (!ours || !Array.isArray(ours.items)) die(`Не читается наш протокол: ${ourArg}`);
        out = opt.out ? path.resolve(String(opt.out)) : path.dirname(path.dirname(path.resolve(ourArg)));
      }
      const decFile = path.resolve(String(opt.decisions && opt.decisions !== true ? opt.decisions : path.join(out, 'motion-decisions.json')));
      const decisions = readJson(decFile, {}) || {};
      const c = compare(donor, ours, decisions);
      const dname = path.basename(donorFile, '.json').replace(/^donor-/, '');
      const tag = opt.tag && opt.tag !== true ? (many ? `${opt.tag}-${dname}` : String(opt.tag)) : many ? `compare-${dname}` : 'compare';
      const proto = { url: ours.url, donor: donor.url, viewport: ours.viewport, takenAt: new Date().toISOString(), verdict: c.verdict, decisionsFile: fs.existsSync(decFile) ? decFile : null,
        steps: c.rows.map((r) => ({ status: r.status === 'OK' || r.status === 'РЕШЕНО' ? 'OK' : r.status === 'ОТЛИЧАЕТСЯ' ? (r.decision ? 'OK' : 'WARN') : 'FAIL', what: `${r.d.id} ${KIND_RU[r.d.kind] || r.d.kind} ${r.d.target}${r.d.count > 1 ? ` ×${r.d.count}` : ''}`, ...(r.key ? { decisionKey: r.key } : {}), details: [r.o ? `у нас ${r.o.id}` : 'у нас нет', ...r.diffs, ...(r.notes || []), r.decision].filter(Boolean).join('; ') })),
        extra: c.extra.map((o) => ({ id: o.id, kind: o.kind, target: o.target })) };
      writeJson(path.join(out, 'motion', `${tag}.json`), proto);
      fs.writeFileSync(path.join(out, 'motion', `${tag}.md`), mdCompare(c, donor, ours));
      if (many) console.log(`\n== ${donorFile} → ${ourArg}`);
      for (const r of c.rows) console.log(`${(r.status === 'НЕТ' ? 'FAIL' : r.status === 'ОТЛИЧАЕТСЯ' && !r.decision ? 'WARN' : 'OK').padEnd(4)} ${r.d.id} ${KIND_RU[r.d.kind] || r.d.kind}${r.d.sub ? ` (${r.d.sub})` : ''} ${r.d.target}${r.d.count > 1 ? ` ×${r.d.count}` : ''} → ${r.o ? r.o.id : 'нет'}${r.diffs.length ? ` — ${r.diffs.join('; ')}` : ''}${r.notes && r.notes.length ? ` — ${r.notes.join('; ')}` : ''}${r.decision ? ` — решение (${r.key}): ${r.decision}` : r.status === 'НЕТ' && r.d.parent && r.d.count > 1 ? ` — решение на группу: "${r.d.kind}:${r.d.parent} > *"` : ''}`);
      console.log(`своё (у донора нет): ${c.extra.length}${c.extra.length ? ' — ' + c.extra.slice(0, 8).map((o) => `${o.id} ${KIND_RU[o.kind] || o.kind}`).join(', ') : ''}`);
      console.log(`${c.verdict}: сверка движения · ${path.join(out, 'motion', `${tag}.md`)}`);
      if (rank[c.verdict] > rank[worst]) worst = c.verdict;
    }
  } finally { if (browser) await browser.close().catch(() => {}); }
  if (many) console.log(`\n${worst}: пар ${pairs.length}`);
  process.exit(worst === 'FAIL' ? 1 : 0);
}

/* инвентарь: одна или несколько страниц, один или несколько экранов — один браузер на всё */
const runs = pagePlan();
const out = runDir(opt, runs[0].url);
const browser = await launch();
const summary = [];
try {
  for (const r of runs) {
    if (runs.length > 1) console.log(`\n== ${r.tag}: ${r.url} (${r.vp})`);
    let res;
    try { res = await inventory(r.url, r.vp, { out, tag: r.tag, ...phases, debug: !!opt.debug, browser }); } catch (e) { console.log(`FAIL ${r.tag}: ${String(e.message || e).slice(0, 200)}`); summary.push({ ...r, error: String(e.message || e).slice(0, 120) }); continue; }
    writeJson(path.join(out, 'motion', `${r.tag}.json`), res);
    fs.writeFileSync(path.join(out, 'motion', `${r.tag}.md`), mdTable(res));
    const byKind = {}; for (const it of res.items) byKind[KIND_RU[it.kind] || it.kind] = (byKind[KIND_RU[it.kind] || it.kind] || 0) + (it.count || 1);
    console.log(`Найдено движений: ${res.items.length} (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ') || 'нет'})`);
    for (const it of res.items) console.log(`  ${it.id} ${KIND_RU[it.kind] || it.kind}${it.sub ? ` (${it.sub})` : ''} — ${it.target}${it.count > 1 ? ` ×${it.count}` : ''}: ${it.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ').slice(0, 110)} · ${describeTiming(it).slice(0, 80)}`);
    if (res.notes.length) for (const n of res.notes) console.log(`WARN ${n}`);
    console.log(`OK: инвентарь движения · ${path.join(out, 'motion', `${r.tag}.md`)}`);
    summary.push({ ...r, items: res.items.length, byKind });
  }
} finally { await browser.close().catch(() => {}); }
if (runs.length > 1) {
  console.log(`\nСтраниц ${new Set(runs.map((r) => r.url)).size}, экранов ${new Set(runs.map((r) => r.vp)).size}, протоколов ${summary.filter((s) => !s.error).length} из ${runs.length}:`);
  for (const s of summary) console.log(`  ${s.error ? 'FAIL' : 'OK  '} ${s.tag.padEnd(28)} ${s.error ? s.error : `${s.items} движений (${Object.entries(s.byKind).map(([k, n]) => `${k} ${n}`).join(', ') || 'нет'})`}`);
}
process.exit(summary.some((s) => s.error) ? 1 : 0);
