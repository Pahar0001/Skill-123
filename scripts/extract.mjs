#!/usr/bin/env node
/**
 * Съём дизайн-системы со страницы: палитра, шрифты, шкала, сетка, ритм,
 * форма, структура, движение, состояния, фактура. Замеряется живой DOM, не картинка.
 *
 *   node extract.mjs <url> [--out docs/design] [--name slug] [--no-shots]
 *                          [--light] [--no-pixels] [--force] [--help]
 *
 *   <url>           http://, https://, file:// или путь к файлу страницы:
 *                   C:\w\site\index.html, site\index.html или /home/u/page.html —
 *                   существующий файл. Адрес без схемы (localhost:4177/) — ошибка
 *                   с подсказкой, до папок.
 *   --out <папка>   куда писать (по умолчанию docs/design)
 *   --name <имя>    имя файлов (по умолчанию из адреса, как slugFromUrl у site-rework:
 *                   хост без www, порт, путь; порт у localhost, 127.x, [::1],
 *                   *.localhost, 0.0.0.0 — всегда, у остальных — только явный
 *                   нестандартный: localhost:4177 → localhost-4177.*, site.ru:8080 →
 *                   site-ru-8080.*, site.ru → site-ru.*; файл страницы — «file-» и две
 *                   последние части пути: C:\w\site\index.html → file-site-index-html.*;
 *                   прежние имена (без порта; у файлов — весь путь: w-site-index-html,
 *                   c-w-site-index-html) не подхватываются, extract об этом предупредит;
 *                   нужно старое — --name)
 *   --no-shots      без файлов снимков (коробки кнопок и ссылок всё равно снимаются
 *                   в память — ими подтверждается акцент, если не указан --no-pixels)
 *   --light         без состояний наведения/фокуса и без тёмной темы (быстрее)
 *   --no-pixels     не подтверждать акцент пикселями коробок кнопок и ссылок
 *   --force         перезаписать уже существующую <имя>.md
 *
 * На выходе: <slug>.json (сырые замеры), <slug>.tokens.css (переменные),
 * <slug>.md (заготовка спецификации) и снимки в <slug>-shots/.
 *
 * Из кода: extract(url, { shotsDir, light, pixels, states, browser, source }) —
 * browser: уже запущенный браузер (тогда он не закрывается); source — что писать
 * в «Источник» вместо url (путь к файлу вместо file:///…); states — снимать
 * наведение и фокус (по умолчанию — если не light; verify просит их, когда акцент
 * образца взят с наведения). Ошибки бросаются, а не завершают процесс:
 * вызывающий (discover.mjs) дописывает свои файлы.
 *
 * Как считается (коротко, подробнее — SKILL.md):
 * - видимость — итоговая прозрачность через предков (EFFECTIVE_OPACITY_FN из
 *   site-rework), максимум за проход прокрутки: блоки появления считаются,
 *   кнопки «по наведению» (прозрачный контейнер) — нет;
 * - вес цвета фона — видимая площадь × прозрачность; цвет под картинкой-заливкой
 *   не считается; полноэкранные слои с pointer-events:none — в texture, не в палитру;
 * - роли текста — по реальному фону под текстом (elementsFromPoint на каждом
 *   шаге прокрутки): пары {фон, цвет, вес}, темы dark/light; приглушённый —
 *   между текстом и фоном по яркости и с контрастом к фону ≥ 3, иначе «не выявлено»;
 * - акцент — цвет действий: заливка кнопок и ссылок-кнопок (в том числе фон
 *   вложенного блока внутри <a>, как у Framer), первый экран — в первую очередь;
 *   залитых нет — цвет, который ссылки и кнопки получают при наведении, или
 *   подчёркивание ссылок. Фоны секций, шапки и подвала — не акцент. Цвет
 *   подтверждается пикселями снимка коробки самого элемента (заливка ≥ 25%
 *   коробки, текст ≥ 3%, линия ≥ 2%), иначе «акцента нет»;
 * - шкала body — только собственный видимый текст (без style/script),
 *   кегль ≥ 6px, вес = длина текста, в блоках от 40 знаков; сверяется с самым
 *   крупным абзацем (bodyProbe — блок с самым длинным собственным текстом, не обёртка);
 * - h1 — самый крупный видимый h1 первого экрана; на первом экране h1 нет — самый
 *   крупный заголовок первого экрана любым тегом (h2–h6, role=heading, текст от 24px
 *   и от 1.4 основного), с пометкой откуда; нет и его — h1 не снят; h2–h4 — самый
 *   частый стиль своего тега;
 * - аккордеоны без details и класса accordion (Framer, Tilda) — правило clicks.mjs
 *   site-rework (вопрос, значок, спрятанный ответ), подтверждение кликом (не в --light);
 * - nav — меню шапки: nav вверху первого экрана (сначала внутри header), затем
 *   закреплённое меню (position: fixed), затем ссылки шапки; ссылки-кнопки с
 *   заливкой не в счёт; какой элемент взят — scaleFrom.nav;
 * - контейнер — ширина содержимого (без внутренних полей) центрированных обёрток
 *   уже окна, чьи дети занимают эту ширину от края до края; обёртка не стоит в ряду
 *   с соседями (карточка средней колонки тоже по центру) и не лежит в колонке;
 *   блок во всю ширину обёртки выше — не новая ширина; вес — высота обёртки;
 *   какие обёртки взяты — containerFrom;
 * - шрифты — по первой гарнитуре стека, стек хранится рядом;
 * - тёмная тема снимается, только если в CSS есть @media (prefers-color-scheme: dark);
 * - масштаб: все px из getComputedStyle (кегль, рамки, радиусы, тени, отступы) умножаются на итоговый
 *   CSS zoom элемента (EFFECTIVE_ZOOM_FN site-rework: currentCSSZoom) — computed его не учитывает, а на
 *   экране он есть. Tilda при upscale=window масштабирует Zero Block zoom = окно / брейкпоинт: madeon.studio
 *   при 1440 — h1 40px в computed, 48px на экране. Без zoom (обычный сайт) числа прежние, байт в байт;
 * - Tilda (признак TILDA_FN): служебное конструктора (TILDA_SERVICE: плашка Made on Tilda, t-mbfix, полоса
 *   T360) и элементы Zero Block, обрезанные артбордом (заглушка «Zero Block», элементы за краем) — не язык
 *   донора: вне палитры, шкалы, кнопок, секций; фон .t-bgimg с data-original (ленивая картинка ещё не
 *   пришла) — не фон; контейнер — сетка Tilda (.t-container без полей колонок, сетка артборда: брейкпоинт
 *   × zoom при upscale=window), элементы Zero Block и колонки .t-col — не кандидаты; меню — ещё и
 *   закреплённые ссылки в любом месте окна (меню Zero Block — плавающая пилюля внизу) и классы меню Tilda.
 *   Язык Tilda-донора точнее — site-rework/scripts/tilda.mjs (атрибуты, а не замер);
 * - набор (typeset, с 2026-09-28.3) — тем же замером строк, что site-rework typeset.mjs (LINES_FN импортом;
 *   без site-rework — «строки не мерены»), только у самого крупного абзаца (bodyProbe) и h1 шкалы:
 *   bodyMeasure — медиана знаков в полных строках (последняя не в счёт), h1Lines — строк всего видимого текста
 *   под h1 (вложенный span display:block — тоже его строки; sr-only и прозрачное не в счёт), textWrap заголовков (text-wrap-style), hyphens абзаца, shortNb/shortTotal — короткие слова
 *   (typography.md п. 9), привязанные неразрывным пробелом; --measure в токенах — ширина блока абзаца / кегль
 *   на экране, em (только если в абзаце от двух строк). verify сверяет bodyMeasure ±15% и h1Lines ±1.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SR, CLICKS, launch, sleep, parseArgs, slugFromUrl, legacySlugs, pageAddress, die, loadSharp, evaluateWith, gotoRetry,
  scrollPass, segmentPositions, screenAt, fullShot, HEX_SRC, EFF_SRC, SIG_SRC, guardPage, assertAlive,
} from './lib.mjs';

/* site-rework typeset.mjs — замер строк (LINES_FN) тем же кодом, что у typeset; ищется там же, где lib.mjs и clicks.mjs */
const TYPESET = SR ? await import(pathToFileURL(path.join(os.homedir(), '.claude', 'skills', 'site-rework', 'scripts', 'typeset.mjs')).href).catch(() => null) : null;

export const VERSION = 'extract 2026-09-28.3';
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** Старое правило (json до extract 2026-09-24.2): доля пикселей всех снимков окна, с которой насыщенный цвет — акцент. */
export const ACCENT_MIN_SHARE = 0.002;
/** Доля пикселей снимка коробки элемента, с которой цвет действий подтверждён: заливка, текст (наведение), линия подчёркивания. */
export const FILL_MIN = 0.25, TEXT_MIN = 0.03, LINE_MIN = 0.02;
const PIXEL_TOLERANCE = 36; /* евклидово расстояние в RGB: зерно 7% сдвигает пиксель до ~30 */

/* ---------- выполняется внутри страницы (hex, eff, sig, layer подставляются) ---------- */

/** Что элемент рисует под текстом: '#RRGGBB' — сплошной цвет, 'image' — картинка/видео/холст, null — прозрачный. */
function layerBg(e) {
  const tag = e.tagName.toUpperCase();
  if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|OBJECT|EMBED|IMAGE)$/.test(tag)) return 'image';
  const s = getComputedStyle(e);
  if (/url\(/.test(s.backgroundImage)) return 'image';
  if (/gradient\(/.test(s.backgroundImage)) {
    const cols = (s.backgroundImage.match(/(rgba?|oklch|oklab|lab|lch|hsla?|color)\([^()]*\)/g) || []).map(hex).filter(Boolean);
    if (cols.length && cols.every((c) => c.length === 7)) {
      const sum = [0, 0, 0]; for (const c of cols) for (let i = 0; i < 3; i++) sum[i] += parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
      return '#' + sum.map((v) => Math.round(v / cols.length).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    return null; /* полупрозрачный градиент — смотрим, что под ним */
  }
  const h = hex(s.backgroundColor);
  if (h && (h.length === 7 || parseInt(h.slice(7), 16) >= 217) && eff(e) >= 0.85) return h.slice(0, 7);
  return null;
}

/** До прокрутки: кандидаты на появление и пустые журналы видимости и фона. */
function beforeScroll() {
  const vw = innerWidth, vh = innerHeight;
  window.__drefSeen = new Map(); window.__drefBg = new Map();
  /* бесконечная анимация (бегущая строка) — не появление */
  const loops = new Set();
  for (const a of document.getAnimations()) { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; if (t.iterations === Infinity && a.effect.target) loops.add(a.effect.target); }
  /* сначала прозрачные (настоящие кандидаты), потом только сдвинутые — чтобы 60 мест не съели постоянно повёрнутые карточки */
  const cand = [...document.body.querySelectorAll('*')].map((el) => {
    if (loops.has(el)) return null;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 30 && r.right > 0 && r.left < vw) || s.display === 'none' || s.visibility === 'hidden' || r.top + scrollY <= vh) return null;
    const faded = parseFloat(s.opacity) < 0.95, moved = s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)';
    return faded || moved ? { el, rank: faded ? 0 : 1 } : null;
  }).filter(Boolean).sort((a, b) => a.rank - b.rank).slice(0, 80).map((x) => x.el);
  cand.forEach((el, i) => el.setAttribute('data-dref-reveal', i));
  const first = (v) => v.split(/,(?![^(]*\))/)[0].trim();
  return cand.map((el) => { const s = getComputedStyle(el); return { el: sig(el), opacity: s.opacity, transform: s.transform, transition: first(s.transitionDuration) + ' ' + first(s.transitionTimingFunction) + ', задержка ' + first(s.transitionDelay) }; });
}

/** Шаг прокрутки: максимум итоговой прозрачности элементов в окне и фон под текстом в окне. */
function stepProbe() {
  const vw = innerWidth, vh = innerHeight;
  const seen = window.__drefSeen || (window.__drefSeen = new Map());
  const bgMap = window.__drefBg || (window.__drefBg = new Map());
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    const o = eff(el); if (o > (seen.get(el) || 0)) seen.set(el, o);
  }
  const pageBg = () => { for (const e of [document.body, document.documentElement]) { const h = hex(getComputedStyle(e).backgroundColor); if (h && h.length === 7) return h; } return '#FFFFFF'; };
  const SKIP = /^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE)$/i;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n; (n = w.nextNode());) {
    const p = n.parentElement;
    if (!p || SKIP.test(p.tagName) || bgMap.has(p) || !n.textContent.trim()) continue;
    range.selectNodeContents(n);
    let rr = null;
    for (const x of range.getClientRects()) if (x.width > 0 && x.height > 0 && x.bottom > 0 && x.top < vh && x.right > 0 && x.left < vw) { rr = x; break; }
    if (!rr) continue;
    const x = Math.min(vw - 1, Math.max(0, rr.left + Math.min(rr.width / 2, 8))), y = Math.min(vh - 1, Math.max(0, rr.top + rr.height / 2));
    const stack = document.elementsFromPoint(x, y);
    let i = stack.indexOf(p); if (i < 0) i = stack.findIndex((e) => e.contains(p));
    if (i < 0) continue;
    /* текст закрыт чем-то непрозрачным (шапкой) — померим на другом шаге */
    let covered = false;
    for (let k = 0; k < i; k++) { const e = stack[k]; if (p.contains(e) || e === document.body || e === document.documentElement) continue; if (layer(e)) { covered = true; break; } }
    if (covered) continue;
    let res = null;
    for (let k = i; k < stack.length && !res; k++) {
      const e = stack[k];
      if (e === document.documentElement || e === document.body) { const h = hex(getComputedStyle(e).backgroundColor); if (h && h.length === 7) res = h; continue; }
      res = layer(e);
    }
    bgMap.set(p, res || pageBg());
  }
  return bgMap.size;
}

/** Главный замер — после прохода прокрутки, страница наверху. */
function inPage() {
  const vw = innerWidth, vh = innerHeight;
  const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const seen = window.__drefSeen || new Map(), bgMap = window.__drefBg || new Map();
  /* видимость — максимум за проход: блоки появления считаются, «по наведению» — нет */
  const effOf = (el) => Math.max(eff(el), seen.get(el) || 0);
  const bump = (map, key, w = 1) => { if (key == null || key === '' || !(w > 0)) return; map[key] = (map[key] || 0) + w; };
  const top = (map, n = 8) => Object.entries(map).filter(([, w]) => w >= 0.5).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, weight]) => ({ value, weight: Math.round(weight) }));
  const topKey = (map) => { const e = Object.entries(map || {}).sort((a, b) => b[1] - a[1])[0]; return e ? e[0] : null; };
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;
  const SKIP = /^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE)$/i;
  const ownText = (el) => (SKIP.test(el.tagName) ? '' : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim());
  const fam1 = (f) => (f || '').split(',')[0].replace(/["']/g, '').trim();
  const PAGE_BG = (() => { for (const e of [document.body, document.documentElement]) { const h = hex(getComputedStyle(e).backgroundColor); if (h && h.length === 7) return h; } return '#FFFFFF'; })();
  const bgOf = (el) => { if (bgMap.has(el)) return bgMap.get(el); for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) { const L = layer(e); if (L) return L; } return PAGE_BG; };
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (c, b, a) => { const x = rgbOf(c), y = rgbOf(b); return '#' + x.map((v, i) => Math.round(v * a + y[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  const bodyEls = [...document.body.querySelectorAll('*')];

  /* масштаб: Z(el) — итоговый CSS zoom (px из getComputedStyle × zoom = на экране; без zoom — 1, числа прежние);
     zs — px внутри строки ('10px', тень) × zoom. Tilda: служебное конструктора и элементы Zero Block, обрезанные
     артбордом (заглушка «Zero Block» высотой артборда 0, элементы за краем) — не язык донора */
  const TILDA = tilda(); const isTilda = !!TILDA.tilda;
  const zM = new Map(); const Z = (el) => { if (!el) return 1; let v = zM.get(el); if (v === undefined) { v = zoom(el) || 1; zM.set(el, v); } return v; };
  const zs = (v, z) => (z === 1 || v == null ? v : String(v).replace(/(-?\d*\.?\d+)px/g, (m, n) => `${Math.round(parseFloat(n) * z * 100) / 100}px`));
  const zeroCut = new Map();
  if (isTilda) for (const e of document.querySelectorAll('.t396__artboard .t396__elem')) zeroCut.set(e, clip(e) < 0.05);
  const excluded = { service: 0, clipped: 0 };
  const tildaOut = (el) => { if (!isTilda) return false; if (tsvc(el)) return 'service'; const z = el.closest('.t396__elem'); return z && zeroCut.get(z) ? 'clipped' : false; };

  /* фактура: полноэкранные слои с pointer-events:none (зерно, плёнка, виньетка) — не палитра */
  const texture = [], texEls = new Set();
  const isFixed = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true; return false; };
  /* url() в вычисленном стиле всегда в двойных кавычках; внутри data:svg бывают «)» — поэтому по кавычкам, а не до первой скобки */
  const shortUrl = (u) => {
    if (/^data:/i.test(u)) { const t = (/^data:([^;,]+)/i.exec(u) || [])[1] || '?'; let dd = u; try { dd = decodeURIComponent(u); } catch { /* как есть */ } return `url(data:${t}…${/feTurbulence/i.test(dd) ? ' feTurbulence' : ''})`; }
    return `url(${u.length > 140 ? u.slice(0, 70) + '…' + u.slice(-60) : u})`;
  };
  const shortImg = (v) => (!v || v === 'none' ? null : v.replace(/url\("((?:[^"\\]|\\.)*)"\)/g, (m, u) => shortUrl(u)).replace(/url\(([^)"']*)\)/g, (m, u) => (/^data:|…/.test(u) ? m : shortUrl(u))).slice(0, 260));
  const paints = (s, media) => media || s.backgroundImage !== 'none' || !!hex(s.backgroundColor) || s.mixBlendMode !== 'normal' || (!!s.backdropFilter && s.backdropFilter !== 'none');
  const texInfo = (el, s, pseudo, w, h, o) => ({
    el: sig(el) + pseudo, position: s.position, width: Math.round(w), height: Math.round(h), opacity: Math.round(o * 1000) / 1000,
    blend: s.mixBlendMode, zIndex: s.zIndex, pointerEvents: s.pointerEvents,
    backgroundColor: hex(s.backgroundColor), backgroundImage: shortImg(s.backgroundImage), backgroundSize: s.backgroundSize, backgroundRepeat: s.backgroundRepeat,
    animation: s.animationName && s.animationName !== 'none' ? [s.animationName, s.animationDuration, s.animationTimingFunction, s.animationIterationCount].join(' ') : null,
    filter: s.filter !== 'none' ? s.filter : null, backdropFilter: s.backdropFilter && s.backdropFilter !== 'none' ? s.backdropFilter : null,
    media: pseudo ? null : (/^(CANVAS|VIDEO|IMG)$/.test(el.tagName) ? el.tagName.toLowerCase() : null),
    noise: /noise|grain|зерн|шум|feTurbulence/i.test(s.backgroundImage + ' ' + (typeof el.className === 'string' ? el.className : '')),
  });
  for (const el of bodyEls) {
    const s = getComputedStyle(el);
    if (s.pointerEvents !== 'none' || s.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (!(r.width >= vw * 0.8 && r.height >= vh * 0.8) || !(r.height >= docH * 0.8 || isFixed(el))) continue;
    if (!paints(s, /^(CANVAS|VIDEO|IMG)$/.test(el.tagName)) || (el.innerText || '').trim().length > 2) continue;
    const o = effOf(el); if (!(o > 0.001)) continue;
    texEls.add(el); el.setAttribute('data-dref-tex', ''); /* проверка пикселей потом обходит слой */
    if (texture.length < 12) texture.push(texInfo(el, s, '', r.width, r.height, o));
  }
  for (const el of [document.documentElement, document.body, ...bodyEls]) {
    for (const p of ['::before', '::after']) {
      const s = getComputedStyle(el, p);
      if (!s.content || s.content === 'none' || s.display === 'none' || s.pointerEvents !== 'none' || !/^(fixed|absolute)$/.test(s.position)) continue;
      const w = parseFloat(s.width), h = parseFloat(s.height);
      const full = s.position === 'fixed' ? w >= vw * 0.8 && h >= vh * 0.8 : w >= vw * 0.8 && h >= Math.max(vh, docH * 0.8);
      if (!full || !paints(s, false)) continue;
      const o = parseFloat(s.opacity) * (el === document.documentElement ? 1 : effOf(el));
      if (o > 0.001 && texture.length < 12) texture.push(texInfo(el, s, p, w, h, o));
    }
  }
  const underTex = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (texEls.has(e)) return true; return false; };

  /* видимое: есть размер, в окне по горизонтали, в пределах документа, итоговая прозрачность > 0.05 */
  const all = bodyEls.filter((el) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw)) return false;
    if (r.bottom + scrollY <= 0 || r.top + scrollY >= docH) return false;
    if (!(effOf(el) > 0.05 && !underTex(el))) return false;
    const t = tildaOut(el); if (t) { excluded[t]++; return false; }
    return true;
  });
  const allSet = new Set(all);

  const bg = {}, fg = {}, border = {}, fam = {}, famStack = {}, radius = {}, shadow = {}, bw = {}, space = {}, trans = {}, pairs = {};
  const passport = { textElements: 0, caps: 0, smallCapsTracked: 0, smallText: 0, tracking: {}, radius: [], components: {} };
  const gridInfo = [], containers = {};
  for (const el of all) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), o = effOf(el), z = Z(el);
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom + scrollY, docH) - Math.max(r.top + scrollY, 0));
    /* цвет под картинкой-заливкой не виден; у Tilda фон .t-bgimg с data-original — подложка ленивой картинки (d1: #FFF705 под шумом) */
    const covered = (/url\(/.test(s.backgroundImage) && (/^(repeat|round|space)$/.test(s.backgroundRepeat) || s.backgroundSize === 'cover')) || (isTilda && el.classList.contains('t-bgimg') && el.hasAttribute('data-original'));
    if (!covered) bump(bg, hex(s.backgroundColor), w * h * o);
    const t = ownText(el), fs0 = parseFloat(s.fontSize), fs = fs0 * z;
    if (t.length && fs >= 6) {
      const col = hex(s.color);
      bump(fg, col, t.length * o);
      const f1 = fam1(s.fontFamily); bump(fam, f1, t.length * o); bump(famStack[f1] || (famStack[f1] = {}), s.fontFamily, t.length);
      if (col) {
        const under = bgOf(el);
        const a = (col.length === 9 ? parseInt(col.slice(7), 16) / 255 : 1) * (o >= 0.95 ? 1 : o);
        const seenC = /^#[0-9A-F]{6}$/i.test(under) ? mix(col.slice(0, 7), under, a) : col.slice(0, 7);
        bump(pairs, under + ' ' + seenC + ' ' + col, t.length);
      }
      passport.textElements++;
      const ls = s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing) / fs0;
      const caps = s.textTransform === 'uppercase' || (/[A-ZА-ЯЁ]{3}/.test(t) && t === t.toUpperCase());
      if (Math.abs(ls) >= 0.02) bump(passport.tracking, Math.round(ls * 100) / 100 + 'em');
      if (caps) passport.caps++;
      if (caps && fs <= 13 && ls >= 0.05) passport.smallCapsTracked++;
      if (fs < 12) passport.smallText++;
    }
    const bt = px(s.borderTopWidth), bb = px(s.borderBottomWidth);
    if (bt > 0 || bb > 0) { bump(border, bt > 0 ? hex(s.borderTopColor) : hex(s.borderBottomColor), o); bump(bw, (z === 1 ? Math.max(bt, bb) : Math.round(Math.max(bt, bb) * z * 100) / 100) + 'px'); }
    if (s.borderTopLeftRadius !== '0px') bump(radius, zs(s.borderTopLeftRadius, z));
    if (s.boxShadow !== 'none') bump(shadow, zs(s.boxShadow, z));
    for (const k of ['paddingTop', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
      const v = z === 1 ? px(s[k]) : Math.round(px(s[k]) * z * 100) / 100; if (v >= 4 && v <= 320) bump(space, v);
    }
    if (s.display.includes('grid')) {
      const cols = s.gridTemplateColumns.split(' ').filter((x) => x && x !== 'none').length;
      if (cols > 1) gridInfo.push({ el: sig(el), columns: cols, gap: s.columnGap, rowGap: s.rowGap, width: Math.round(r.width) });
    } else if (s.display.includes('flex') && s.flexDirection.startsWith('row') && el.children.length > 1 && r.width > vw * 0.5) {
      gridInfo.push({ el: sig(el), flexItems: el.children.length, gap: s.columnGap, width: Math.round(r.width) });
    }
    const dur = s.transitionDuration.split(',').map((x) => parseFloat(x) * (x.includes('ms') ? 1 : 1000));
    if (dur.some((d) => d > 0)) bump(trans, [s.transitionProperty, s.transitionDuration, s.transitionTimingFunction, s.transitionDelay].join(' | '));
  }
  passport.radius = Object.keys(radius);
  const outermost = (sel) => { const list = [...document.querySelectorAll(sel)].filter((el) => allSet.has(el)); return list.filter((el) => !list.some((o) => o !== el && o.contains(el))).length; };
  passport.components = {
    form: outermost('form'), input: outermost('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="image"])'),
    textarea: outermost('textarea'), select: outermost('select'), checkbox: outermost('input[type="checkbox"],input[type="radio"]'),
    accordion: outermost('details, [class*="accordion"]'), tabs: outermost('[role="tablist"]'), dialog: outermost('dialog, [role="dialog"]'),
    video: outermost('video'), iframe: outermost('iframe'), canvas: outermost('canvas'),
  };

  /* типографская шкала: стиль берётся у элемента, который несёт больше всего собственного текста.
     Кегль — на экране (× zoom носителя); межстрочный и разрядка — доли кегля, zoom на них не влияет */
  const styleKey = (el) => keyOf(getComputedStyle(el), Z(el));
  const keyOf = (s, z = 1) => JSON.stringify({ fontSize: zs(s.fontSize, z), fontWeight: s.fontWeight, lineHeight: s.lineHeight === 'normal' ? 'normal' : Math.round(parseFloat(s.lineHeight) / parseFloat(s.fontSize) * 100) / 100, letterSpacing: s.letterSpacing === 'normal' ? '0' : Math.round(parseFloat(s.letterSpacing) / parseFloat(s.fontSize) * 1000) / 1000 + 'em', fontFamily: fam1(s.fontFamily), textTransform: s.textTransform });
  const carrier = (el) => {
    const cnt = new Map(); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const p = n.parentElement; if (!p || SKIP.test(p.tagName)) continue; const l = n.textContent.trim().length; if (l) cnt.set(p, (cnt.get(p) || 0) + l); }
    let best = null, bl = 0;
    for (const [p, l] of cnt) if (l > bl && effOf(p) > 0.05 && parseFloat(getComputedStyle(p).fontSize) >= 6) { best = p; bl = l; }
    return best;
  };

  /* ---------- роли по элементам: действия (акцент), h1, меню, контейнер ---------- */
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width >= 4 && r.height >= 4; };
  /* доля коробки, не обрезанная предками с overflow hidden/clip: свёрнутое меню, заглушки конструкторов */
  const clipShare = (el) => {
    const r = el.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/hidden|clip/.test(s.overflowX)) { const q = p.getBoundingClientRect(); L = Math.max(L, q.left); R = Math.min(R, q.right); }
      if (/hidden|clip/.test(s.overflowY)) { const q = p.getBoundingClientRect(); T = Math.max(T, q.top); B = Math.min(B, q.bottom); }
      if (s.position === 'fixed') break;
    }
    return (Math.max(0, R - L) * Math.max(0, B - T)) / Math.max(1, r.width * r.height);
  };
  const docTop = (el) => el.getBoundingClientRect().top + scrollY;
  const onFirst = (el) => { const r = el.getBoundingClientRect(); return r.top + scrollY < vh && r.bottom + scrollY > 0; };
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const isHex = (h) => /^#[0-9A-F]{6}$/i.test(h || '');
  const distOf = (a, b) => { const x = rgbOf(a), y = rgbOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  /* насыщенный: насыщенность > 0.4 и разброс каналов ≥ 60 (у почти чёрных насыщенность врёт) */
  const vivid = (h) => { if (!isHex(h)) return false; const c = rgbOf(h), mx = Math.max(...c), mn = Math.min(...c); return mx > 0 && (mx - mn) / mx > 0.4 && mx - mn >= 60; };

  /* действия: ссылки и кнопки размером с кнопку (карточка-ссылка выше 100px — не кнопка); заливка — у самого
     элемента или у вложенного блока, закрывающего ≥ 60% коробки (Framer: фон у div внутри <a>); заливка должна
     отличаться от фона под кнопкой. Насыщенные — кандидаты в акцент, их коробки помечаются для проверки пикселями */
  const filledSet = new Set(), fills = [], underlines = []; let actId = 0;
  const fillOf = (b) => {
    const r = b.getBoundingClientRect(), area = r.width * r.height;
    for (const x of [b, ...[...b.querySelectorAll('*')].slice(0, 40)]) {
      const q = x.getBoundingClientRect(); if (q.width * q.height < area * 0.6) continue;
      const L = layer(x); if (L && L !== 'image') return { x, color: L };
    }
    return null;
  };
  for (const b of document.body.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]')) {
    if (!allSet.has(b) || !(effOf(b) >= 0.5)) continue;
    const r = b.getBoundingClientRect();
    if (r.height < 20 || r.height > 100 || r.width < 32 || r.width > 600 || clipShare(b) < 0.5) continue;
    const f = fillOf(b); if (!f) continue;
    const under = bgOf(b.parentElement || b);
    if (isHex(under) && distOf(f.color, under) <= 20) continue;
    filledSet.add(b);
    if (!vivid(f.color) || fills.length >= 60) continue;
    const id = String(actId++); f.x.setAttribute('data-dref-act', id);
    fills.push({ id, value: f.color, el: sig(b), fill: f.x === b ? null : sig(f.x), text: textOf(b).slice(0, 40), first: onFirst(b), w: Math.round(r.width), h: Math.round(r.height) });
  }
  /* подчёркивание ссылок насыщенным цветом: text-decoration у текста или у самой ссылки, либо нижняя рамка */
  for (const a of document.body.querySelectorAll('a')) {
    if (underlines.length >= 40) break;
    if (!allSet.has(a) || filledSet.has(a) || !shown(a) || clipShare(a) < 0.5) continue;
    const p = carrier(a); if (!p) continue;
    let c = null;
    for (let e = p; e && !c; e = e === a ? null : e.parentElement) { const s = getComputedStyle(e); if (/underline/.test(s.textDecorationLine)) c = hex(s.textDecorationColor); }
    if (!c) { const s = getComputedStyle(a); if (parseFloat(s.borderBottomWidth) >= 1 && s.borderBottomStyle !== 'none') c = hex(s.borderBottomColor); }
    if (!c || !vivid(c)) continue;
    const under = bgOf(p); if (isHex(under) && distOf(c, under) <= 60) continue;
    const id = String(actId++); p.setAttribute('data-dref-act', id);
    const r = p.getBoundingClientRect();
    underlines.push({ id, value: c, el: sig(a), text: textOf(a).slice(0, 40), first: onFirst(a), w: Math.round(r.width), h: Math.round(r.height) });
  }

  /* h1 — самый крупный видимый h1 первого экрана (на Framer-странице h1 бывает двадцать: подписи, подвал).
     На первом экране h1 нет — самый крупный заголовок первого экрана любым тегом (h2–h6, role=heading или
     текст от 24px и от 1.4 основного, не в меню, ссылке-кнопке или кнопке): у товара shapefest название —
     не h1, а крупный h1 ниже — слово плашки «All Access» 90px. Нет и его — h1 не снят (from.el null) */
  const pickH1 = () => {
    const bodyPx = (() => { const b = top(bodyVotes, 1)[0]; return b ? parseFloat(JSON.parse(b.value).fontSize) : 16; })(); /* bodyVotes считаются ниже, до вызова */
    const list = [...document.querySelectorAll('h1')].filter((h) => allSet.has(h) && shown(h) && clipShare(h) > 0.5).map((h) => ({ h, p: carrier(h) })).filter((x) => x.p);
    const fsz = (x) => parseFloat(getComputedStyle(x.p).fontSize) * Z(x.p);
    list.sort((a, b) => (onFirst(b.h) - onFirst(a.h)) || (fsz(b) - fsz(a)) || (docTop(a.h) - docTop(b.h)));
    if (list.length && onFirst(list[0].h)) {
      const { h, p } = list[0];
      return { p, h, from: { el: sig(h), text: textOf(h).slice(0, 60), first: true, of: list.length, how: list.length === 1 ? 'единственный видимый h1' : 'самый крупный h1 первого экрана' } };
    }
    const below = list.length ? `; h1 ниже первого экрана не взят: «${textOf(list[0].h).slice(0, 30)}» ${Math.round(fsz(list[0]))}px` : '';
    const NOT_HEAD = 'nav, [role="navigation"], button, [role="button"], a[class*="btn"], a[class*="button"], label, select, option';
    const heads = [];
    for (const el of all) {
      if (!onFirst(el) || !shown(el) || clipShare(el) <= 0.5 || el.closest(NOT_HEAD)) continue;
      const tagged = /^H[2-6]$/.test(el.tagName) || el.getAttribute('role') === 'heading';
      const p = tagged ? carrier(el) : (ownText(el).length >= 3 ? el : null); if (!p) continue;
      const px = parseFloat(getComputedStyle(p).fontSize) * Z(p);
      if (!tagged && !(px >= 24 && px >= bodyPx * 1.4)) continue;
      if (tagged && !(px >= bodyPx * 1.15)) continue;
      const a = el.closest('a[href]'); if (a && filledSet.has(a)) continue;
      heads.push({ h: el, p, px });
    }
    heads.sort((a, b) => (b.px - a.px) || (docTop(a.h) - docTop(b.h)));
    if (!heads.length) return { p: null, from: { el: null, how: `на первом экране нет ни h1, ни крупного заголовка — h1 не снят${below}` } };
    const { h, p } = heads[0];
    const tag = h.getAttribute('role') === 'heading' ? 'role=heading' : h.tagName.toLowerCase();
    return { p, h, from: { el: sig(h), text: textOf(h).slice(0, 60), first: true, of: 0, tag, how: `на первом экране h1 нет — самый крупный заголовок первого экрана (${tag})${below}` } };
  };

  /* меню (nav) — одна и та же роль на любой странице: nav вверху первого экрана (сначала внутри header, выше —
     раньше), затем закреплённое меню (position: fixed), затем ссылки шапки или верхней полосы. Ссылок в меню
     не меньше двух; ссылки-кнопки с заливкой («Корзина», «Get All Access») не в счёт. Стиль — самый частый
     среди ссылок меню. Меню скрыто (бургер на телефоне) — уровня nav нет, в scaleFrom.nav причина */
  const pickMenu = () => {
    const band = Math.min(vh * 0.25, 220);
    const inBand = (el) => { const r = el.getBoundingClientRect(); return r.top + scrollY < band && r.bottom + scrollY > 0; };
    const linkOk = (a) => allSet.has(a) && shown(a) && !filledSet.has(a) && clipShare(a) > 0.5 && !!carrier(a);
    const linksIn = (root, where) => [...root.querySelectorAll('a, [role="menuitem"]')].filter((a) => linkOk(a) && where(a));
    const hdrs = [...document.querySelectorAll('header, [role="banner"]')].filter((h) => allSet.has(h));
    const inHdr = (el) => hdrs.some((h) => h.contains(el));
    const navs = [...document.querySelectorAll('nav, [role="navigation"]')].filter((n) => allSet.has(n));
    let pick = null;
    const tryList = (list, how, where) => { for (const n of list) { const l = linksIn(n, where); if (l.length >= 2) return { root: n, links: l, how }; } return null; };
    pick = tryList(navs.filter(inBand).sort((a, b) => (inHdr(b) - inHdr(a)) || (docTop(a) - docTop(b))), 'меню шапки', inBand)
      || tryList(navs.filter((n) => isFixed(n)), 'закреплённое меню (position: fixed)', () => true)
      || tryList(hdrs.filter(inBand), 'ссылки шапки', inBand);
    if (!pick) {
      const l = [...document.body.querySelectorAll('a')].filter((a) => linkOk(a) && inBand(a));
      if (l.length >= 2) { let root = l[0].parentElement; while (root && root !== document.body && !l.every((a) => root.contains(a))) root = root.parentElement; pick = { root: root || document.body, links: l, how: 'ссылки вверху страницы' }; }
    }
    /* закреплённые ссылки в любом месте окна (3+): меню, собранное в Zero Block Tilda, — отдельные закреплённые
       элементы (streetwearbrands: плавающая пилюля внизу окна); группа — артборд или ближайший закреплённый предок */
    if (!pick) {
      const fixedOf = (a) => { for (let e = a; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return e; return null; };
      const groups = new Map();
      for (const a of document.body.querySelectorAll('a')) {
        if (!linkOk(a)) continue; const f = fixedOf(a); if (!f) continue;
        const r = a.getBoundingClientRect(); if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) continue;
        const k = a.closest('.t396__artboard') || f; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a);
      }
      const best = [...groups.values()].sort((x, y) => y.length - x.length)[0];
      if (best && best.length >= 3) {
        let root = best[0].parentElement; while (root && root !== document.body && !best.every((a) => root.contains(a))) root = root.parentElement;
        const cy = best.reduce((acc, a) => { const r = a.getBoundingClientRect(); return acc + r.top + r.height / 2; }, 0) / best.length;
        pick = { root: root || document.body, links: best, how: `закреплённое меню (fixed) ${cy > vh * 2 / 3 ? 'внизу' : cy < vh / 3 ? 'вверху' : 'посередине'} окна` };
      }
    }
    /* стандартные меню Tilda: T228/T456/T199 — верхние, T450 — шторка, T280 — на весь экран, T975 — нижняя панель телефона */
    if (!pick && isTilda) {
      pick = tryList([...document.querySelectorAll('.t228__list, .t450__menu, .t456__list, .t199__menu, .t280__menu, .t975')].filter((n) => allSet.has(n)), 'меню Tilda', () => true);
      if (pick) { const c = [pick.root, ...(function* () { for (let e = pick.root.parentElement; e; e = e.parentElement) yield e; })()].map((e) => [...(e.classList || [])].find((x) => /^t\d{3,4}$/.test(x))).find(Boolean); pick.how = `меню Tilda${c ? ` (${c.toUpperCase()})` : ''}`; }
    }
    if (!pick) return { style: null, from: { el: null, how: navs.some(inBand) || hdrs.some(inBand) ? 'меню шапки скрыто (бургер) или в нём меньше двух ссылок' : 'меню не найдено: нет nav, ссылок вверху страницы и закреплённого меню' } };
    const votes = {}; for (const a of pick.links) bump(votes, styleKey(carrier(a)), 1);
    const best = top(votes, 1)[0];
    return { style: best ? JSON.parse(best.value) : null, from: { el: sig(pick.root), how: pick.how, links: pick.links.length, texts: pick.links.slice(0, 6).map((a) => textOf(a).slice(0, 24)) } };
  };

  const levels = { h1: null, h2: 'h2', h3: 'h3', h4: 'h4', body: null, small: 'small, figcaption, .caption, label', button: 'button, .btn, .button, a[class*="btn"], a[class*="button"]', nav: null };
  const scale = {}, scaleFrom = {};
  /* body: собственный видимый текст в блоках от 40 знаков, вес — длина текста */
  const bodyVotes = {}, blockLen = new Map(), blockKeys = new Map();
  const blockOf = (e) => { for (; e && e !== document.body; e = e.parentElement) { const d = getComputedStyle(e).display; if (!/^inline/.test(d) && d !== 'contents') return e; } return document.body; };
  const NOT_BODY = 'h1,h2,h3,h4,h5,h6,[role="heading"],button,[role="button"],nav,label,select,option,textarea,small,figcaption,sup,sub,.btn,.button,a[class*="btn"],a[class*="button"]';
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    const p = n.parentElement; if (!p || SKIP.test(p.tagName) || !allSet.has(p)) continue;
    const t = n.textContent.replace(/\s+/g, ' ').trim().length; if (!t || p.closest(NOT_BODY)) continue;
    const s = getComputedStyle(p); if (parseFloat(s.fontSize) < 6) continue;
    const b = blockOf(p);
    let L = blockLen.get(b); if (L === undefined) { L = (b.innerText || '').replace(/\s+/g, ' ').trim().length; blockLen.set(b, L); }
    if (L < 40) continue;
    const k = keyOf(s, Z(p)); bump(bodyVotes, k, t);
    const bk = blockKeys.get(b) || {}; bump(bk, k, t); blockKeys.set(b, bk);
  }
  if (!Object.keys(bodyVotes).length) {
    /* длинных блоков нет — как раньше, по p и li, но собственным текстом */
    for (const el of document.querySelectorAll('p, li')) { if (!allSet.has(el)) continue; const s = getComputedStyle(el); const t = ownText(el).length; if (t && parseFloat(s.fontSize) >= 6) bump(bodyVotes, keyOf(s, Z(el)), t); }
  }
  /* самый крупный абзац — по собственному тексту основного стиля, а не по innerText: обёртка секции (div.wrap: h2, два p
     и ссылка) иначе обгоняет настоящий абзац. chars — innerText блока, как раньше; own — собственный текст */
  let bodyProbe = null, bodyEl = null, h1El = null;
  for (const [b, keys] of blockKeys) { const own = Object.values(keys).reduce((a, v) => a + v, 0); if (!bodyProbe || own > bodyProbe.own) { bodyProbe = { el: sig(b), chars: blockLen.get(b), own, key: topKey(keys) }; bodyEl = b; } }
  if (bodyProbe) { const { key, ...rest } = bodyProbe; bodyProbe = { ...rest, ...JSON.parse(key) }; }
  for (const [name, sel] of Object.entries(levels)) {
    if (name === 'h1') { const x = pickH1(); if (x.p) { scale.h1 = JSON.parse(styleKey(x.p)); h1El = x.h; } scaleFrom.h1 = x.from; continue; }
    if (name === 'nav') { const x = pickMenu(); scaleFrom.nav = x.from; if (x.style) scale.nav = x.style; continue; }
    let votes = bodyVotes;
    if (sel) {
      votes = {};
      for (const el of document.querySelectorAll(sel)) { if (!allSet.has(el)) continue; const p = carrier(el); if (p) bump(votes, styleKey(p), 1); }
    }
    const best = top(votes, 1)[0]; if (best) scale[name] = JSON.parse(best.value);
  }
  /* h1 мелкий (меньше 2× основного) — рядом самый крупный текст первого экрана: у Tilda T941 h1 — надстрочная строка
     14px, а крупное «ВИТРИНА МАРКЕТ» 105px — не заголовок. Шкалу не меняет — только пометка откуда */
  if (scale.h1 && scale.body && scaleFrom.h1 && parseFloat(scale.h1.fontSize) < 2 * parseFloat(scale.body.fontSize)) {
    let big = null;
    for (const el of all) {
      if (!onFirst(el) || !shown(el) || el.closest('nav, [role="navigation"], button, [role="button"]')) continue;
      if (ownText(el).length < 3) continue;
      const v = parseFloat(getComputedStyle(el).fontSize) * Z(el);
      if ((!big || v > big.px) && clipShare(el) > 0.5) big = { el, px: v };
    }
    if (big && big.px > parseFloat(scale.h1.fontSize) * 1.2) {
      const bs = getComputedStyle(big.el);
      scaleFrom.h1.biggest = { el: sig(big.el), text: textOf(big.el).slice(0, 40), fontSize: Math.round(big.px * 100) / 100 + 'px', fontWeight: bs.fontWeight, fontFamily: fam1(bs.fontFamily), body: scale.body.fontSize };
    }
  }

  /* контейнер: блоки с центрированным содержимым уже окна (коробка без внутренних отступов: .wrap 1200 с полями
     40 → 1120; полноширинная секция с полями — тоже), содержимое которых занимает эту ширину (дети от края до
     края — одна обёртка или ряд колонок; секция с полями 40 и узкой обёрткой внутри — не контейнер). Ни сам блок,
     ни предки не стоят в ряду с соседями (карточка средней колонки тоже по центру — её отсекает ряд);
     display: contents прозрачен. Блок, который целиком заполняет содержимое обёртки выше (сетка в .wrap,
     карточка во всю колонку на телефоне), новой ширины не задаёт. Вес — высота обёртки: узкая колонка
     текста не перевешивает обёртку секций */
  const layoutParent = (e) => { let p = e.parentElement; while (p && p !== document.body && getComputedStyle(p).display === 'contents') p = p.parentElement; return p; };
  const layoutKids = (p) => { const out = []; for (const k of p.children) { if (getComputedStyle(k).display === 'contents') out.push(...layoutKids(k)); else out.push(k); } return out; };
  const rowMemo = new Map();
  const inRow = (e) => {
    if (rowMemo.has(e)) return rowMemo.get(e);
    let res = false; const p = layoutParent(e);
    if (p) {
      const r = e.getBoundingClientRect();
      for (const k of layoutKids(p)) {
        if (k === e || /^(absolute|fixed)$/.test(getComputedStyle(k).position) || !(effOf(k) > 0.05)) continue;
        const q = k.getBoundingClientRect(); if (q.width < 24 || q.height < 24) continue;
        const ov = Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top);
        if (ov > 0.5 * Math.min(q.height, r.height) && (q.right <= r.left + 1 || q.left >= r.right - 1)) { res = true; break; }
      }
    }
    rowMemo.set(e, res); return res;
  };
  const inColumns = (e) => { for (let x = e; x && x !== document.body && x !== document.documentElement; x = layoutParent(x)) if (inRow(x)) return true; return false; };
  /* дети блока (в потоке, видимые, не строчные) от левого до правого края его содержимого */
  const spans = (el, L, R) => {
    let lo = Infinity, hi = -Infinity;
    for (const k of layoutKids(el)) {
      const s = getComputedStyle(k); if (/^inline$/.test(s.display) || /^(absolute|fixed)$/.test(s.position) || !(effOf(k) > 0.05)) continue;
      const q = k.getBoundingClientRect(); if (q.width < 24 || q.height < 8) continue;
      lo = Math.min(lo, q.left); hi = Math.max(hi, q.right);
    }
    return lo <= L + 2 && hi >= R - 2;
  };
  const wrapBox = new Map();
  /* Tilda: элементы Zero Block (абсолютные, в артборде) и колонки сетки .t-col — не обёртки; .t-container и сетка
     артборда добавляются ниже как сетка Tilda */
  const TILDA_GRID = '.t-col, [class*="t-col_"], .t-container, .t-container_flex';
  for (const el of all) {
    const s = getComputedStyle(el);
    if (/^inline|^contents$/.test(s.display) || /^(absolute|fixed)$/.test(s.position)) continue;
    if (isTilda && (el.closest('.t396__artboard') || el.matches(TILDA_GRID))) continue;
    const r = el.getBoundingClientRect(); if (!(r.height > 80)) continue;
    const z = Z(el);
    const L = z === 1 ? r.left + px(s.paddingLeft) + px(s.borderLeftWidth) : r.left + (px(s.paddingLeft) + px(s.borderLeftWidth)) * z;
    const R = z === 1 ? r.right - px(s.paddingRight) - px(s.borderRightWidth) : r.right - (px(s.paddingRight) + px(s.borderRightWidth)) * z;
    if (!(R - L > 320 && R - L < vw - 8 && L > 0 && Math.abs(L - (vw - R)) <= 2)) continue;
    if (isFixed(el) || inColumns(el) || !spans(el, L, R)) continue;
    wrapBox.set(el, { L, R });
  }
  const wraps = [];
  for (const [el, b] of wrapBox) {
    /* ближайшая обёртка выше; блок во всю её ширину содержимого — не новая ширина */
    let up = layoutParent(el); while (up && up !== document.body && !wrapBox.has(up)) up = layoutParent(up);
    const r = el.getBoundingClientRect();
    if (up && wrapBox.has(up)) { const u = wrapBox.get(up); if (Math.abs(r.left - u.L) <= 2 && Math.abs(r.right - u.R) <= 2) continue; }
    wraps.push({ el, w: Math.round(b.R - b.L), h: r.height });
  }
  /* сетка Tilda: .t-container 1200 (содержимое 1160: 12 колонок по 60, зазор 40, t-col_N = 100·N − 40) — ширина без полей
     колонок; Zero Block — сетка артборда: брейкпоинт (upscale=grid) или брейкпоинт × zoom (upscale=window, растёт с окном) */
  if (isTilda) {
    for (const el of all) {
      if (!el.matches('.t-container, .t-container_flex')) continue;
      const r = el.getBoundingClientRect(); if (!(r.height > 80)) continue;
      const col = [...el.children].find((k) => k.matches('.t-col, [class*="t-col_"]'));
      const m = col ? Math.round(px(getComputedStyle(col).marginLeft) * Z(col) * 100) / 100 : 20;
      wraps.push({ el, w: Math.round(r.width - 2 * m), h: r.height, how: `сетка Tilda: .t-container ${Math.round(r.width)} без полей колонок 2×${m}` });
    }
    for (const ab of document.querySelectorAll('.t396__artboard')) {
      const r = ab.getBoundingClientRect(); if (!(r.height > 80 && r.width > 0)) continue;
      const screens = String(ab.getAttribute('data-artboard-screens') || '').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b); if (!screens.length) continue;
      let res = null; for (const sc of screens) if (vw >= sc) res = sc; if (res === null) res = screens[0];
      const up = ab.getAttribute('data-artboard-upscale') === 'window'; const el0 = ab.querySelector('.t396__elem');
      const z = up ? (el0 ? Z(el0) : vw / res) : 1;
      wraps.push({ el: ab, w: Math.round(Math.min(vw, res * z)), h: r.height, how: `сетка артборда Zero Block: брейкпоинт ${res}${up ? ` × zoom ${Math.round(z * 1000) / 1000} (upscale=window)` : ''}` });
    }
  }
  for (const x of wraps) bump(containers, x.w, x.h);
  const containerFrom = wraps.sort((a, b) => b.h - a.h).slice(0, 8).map((x) => ({ value: x.w, el: sig(x.el), height: Math.round(x.h), ...(x.how ? { how: x.how } : {}) }));

  /* секции и ритм */
  let root = document.querySelector('main') || document.body;
  let kids = [...root.children];
  while (kids.filter((k) => k.getBoundingClientRect().height > 150).length < 2 && kids.length) { const big = kids.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]; if (!big || !big.children.length) break; root = big; kids = [...root.children]; }
  const header = document.querySelector('header'), footer = document.querySelector('footer');
  const secEls = [...new Set([header, ...kids, footer].filter(Boolean))].filter((el) => allSet.has(el) && el.getBoundingClientRect().height > 40);
  const sections = secEls.map((el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    const hd = el.querySelector('h1,h2,h3');
    return { el: sig(el), top: Math.round(r.top + scrollY), height: Math.round(r.height), paddingTop: px(s.paddingTop), paddingBottom: px(s.paddingBottom), marginTop: px(s.marginTop), background: hex(s.backgroundColor), position: s.position, heading: hd ? hd.tagName.toLowerCase() + ': ' + (hd.innerText || '').trim().slice(0, 40) : null, images: el.querySelectorAll('img,picture,video,svg').length, links: el.querySelectorAll('a,button').length };
  });

  /* шрифты: что объявлено и откуда грузится; есть ли тёмная тема в CSS */
  const fontFaces = [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ''), weight: f.weight, style: f.style, status: f.status, unicodeRange: f.unicodeRange }));
  const fontLinks = [...new Set([...document.querySelectorAll('link[href*="font"], link[rel="preload"][as="font"]')].map((l) => l.href))];
  const keyframes = [], faceSrc = []; let reducedMotion = false, unreadableSheets = 0, darkMedia = false, lightDark = false;
  const unreadable = [];
  const DARK = /prefers-color-scheme\s*:\s*dark/i;
  const walkSheet = (sh, depth = 0) => {
    try { if (sh.media && DARK.test(sh.media.mediaText)) darkMedia = true; } catch { /* нет media */ }
    let rules; try { rules = sh.cssRules; } catch { unreadableSheets++; if (sh.href && unreadable.length < 20) unreadable.push(sh.href); return; }
    const walk = (list) => { for (const r of list) {
      if (r.type === CSSRule.KEYFRAMES_RULE) keyframes.push({ name: r.name, css: r.cssText.slice(0, 600) });
      else if (r.type === CSSRule.FONT_FACE_RULE) faceSrc.push({ family: r.style.getPropertyValue('font-family').replace(/["']/g, ''), src: r.style.getPropertyValue('src').slice(0, 200) });
      else if (r.type === CSSRule.IMPORT_RULE) { if (r.media && DARK.test(r.media.mediaText)) darkMedia = true; if (r.styleSheet && depth < 4) walkSheet(r.styleSheet, depth + 1); }
      else if (r.type === CSSRule.MEDIA_RULE) { const c = r.conditionText || (r.media && r.media.mediaText) || ''; if (/prefers-reduced-motion/.test(c)) reducedMotion = true; if (DARK.test(c)) darkMedia = true; walk(r.cssRules); }
      else if (r.type === CSSRule.STYLE_RULE) { if (!lightDark && r.style && r.style.cssText.includes('light-dark(')) lightDark = true; if (r.cssRules && r.cssRules.length) walk(r.cssRules); }
      else if (r.cssRules) walk(r.cssRules);
    } };
    walk(rules);
  };
  for (const sh of document.styleSheets) walkSheet(sh);
  const metaScheme = ((document.querySelector('meta[name="color-scheme"]') || {}).content || '').trim();

  /* набор: тот же замер строк, что у site-rework typeset.mjs (LINES_FN), — только самый крупный абзац (bodyProbe)
     и h1 шкалы. bodyMeasure — медиана знаков в полных строках (без последней), h1Lines —
     строк h1; em — ширина блока абзаца / кегль на экране (для --measure); короткие слова — список typography.md п. 9 */
  const typeset = (() => {
    if (!lines) return { source: 'нет site-rework — строки не мерены', bodyMeasure: null, h1Lines: null };
    const one = (el, deep) => { try { return lines(el, null, { deep }); } catch (e) { return null; } };
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
    const wrapOf = (e) => { const s = getComputedStyle(e); return s.textWrapStyle || s.textWrap || null; };
    const r1 = (x) => Math.round(x * 10) / 10;
    let body = null, h1 = null;
    if (bodyEl) {
      /* блок — по правилу замера строк: inline-block (кнопка, бейдж) — свой блок; у абзаца своего текста нет (весь
         в inline-block внутри) — самый длинный такой блок внутри него */
      let el = bodyEl, m = one(bodyEl, false), via = null;
      if (!m || !m.lines.length) {
        let best = null;
        for (const [o, nodes] of lines.collect(bodyEl)) { if (o === bodyEl || blockOf(o) !== bodyEl) continue; const n = nodes.reduce((a, x) => a + (x && x.nodeType === 3 ? x.nodeValue.trim().length : 0), 0); if (!best || n > best.n) best = { o, n }; }
        if (best) { el = best.o; m = one(el, false); via = `свой блок внутри ${sig(bodyEl)}`; }
      }
      if (m && m.lines.length) { const z = Z(el), s = getComputedStyle(el); body = { el: sig(el), ...(via ? { via } : {}), lines: m.lines.length, chars: m.lines.map((l) => l.chars), measure: med(m.lines.slice(0, -1).map((l) => l.chars)), box: m.box, fontSize: r1(m.fs * z), em: r1(m.box / (m.fs * z)), hyphens: s.hyphens || s.webkitHyphens || null, shortTotal: m.shortTotal, shortNb: m.shortNb }; }
    }
    /* h1 — весь видимый текст под ним (lines.deepNodes): «Холст<br><span style="display:block">на вашей<br>стене</span>» —
       3 строки, а не 1 (у typeset.mjs блок h1 — только свой текст, «Холст»). Невидимое не в счёт: sr-only (clip,
       коробка до 2 px с overflow hidden, clip-path inset), прозрачное (eff < 0.05), visibility: hidden */
    if (h1El) {
      const memo = new Map();
      const hid = (e) => {
        if (memo.has(e)) return memo.get(e);
        let v = false;
        if (e && e !== h1El.parentElement && e.nodeType === 1) {
          const s = getComputedStyle(e), r = e.getBoundingClientRect(), tiny = r.width <= 2 || r.height <= 2;
          v = s.visibility === 'hidden' || (tiny && (s.clip !== 'auto' || /hidden|clip/.test(s.overflow))) || /inset\(\s*(50|100)%/.test(s.clipPath || '') || (e !== h1El && hid(e.parentElement));
        }
        memo.set(e, v); return v;
      };
      const nodes = lines.deepNodes(h1El).filter((n) => !n || n.nodeType !== 3 || !(hid(n.parentElement) || eff(n.parentElement) < 0.05));
      let m = null; try { m = lines(h1El, nodes); } catch (e) { /* не мерен */ }
      if (m && m.lines.length) h1 = { el: sig(h1El), lines: m.lines.length, chars: m.lines.map((l) => l.chars), textWrap: wrapOf(h1El), shortTotal: m.shortTotal, shortNb: m.shortNb };
    }
    const heads = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')].filter((e) => allSet.has(e) && shown(e)).slice(0, 300);
    const textWrap = [...new Set((h1El ? [h1El] : []).concat(heads).map(wrapOf).filter(Boolean))];
    const sT = (body ? body.shortTotal : 0) + (h1 ? h1.shortTotal : 0), sN = (body ? body.shortNb : 0) + (h1 ? h1.shortNb : 0);
    return { source: 'LINES_FN (site-rework typeset.mjs)', bodyMeasure: body ? body.measure : null, h1Lines: h1 ? h1.lines : null, textWrap, hyphens: body ? body.hyphens : null, shortNb: sN, shortTotal: sT, nbShare: sT ? Math.round(sN / sT * 100) / 100 : null, body, h1 };
  })();

  /* движение */
  const libs = {};
  const probes = { gsap: 'gsap', ScrollTrigger: 'ScrollTrigger', Lenis: 'Lenis', Swiper: 'Swiper', AOS: 'AOS', anime: 'anime', THREE: 'THREE', barba: 'barba', LocomotiveScroll: 'LocomotiveScroll', Splitting: 'Splitting', lottie: 'lottie', Framer: '__framer_importFromPackage' };
  for (const [name, g] of Object.entries(probes)) if (window[g]) libs[name] = (window[g] && window[g].version) || true;
  const scriptHints = [...document.scripts].map((s) => s.src).filter((s) => /gsap|lenis|swiper|aos|anime|three|barba|locomotive|lottie|framer|motion|splide|scrollreveal/i.test(s));
  const running = document.getAnimations().slice(0, 40).map((a) => { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; return { name: a.animationName || a.transitionProperty || a.constructor.name, target: a.effect && a.effect.target ? sig(a.effect.target) : null, duration: t.duration, delay: t.delay, easing: t.easing, iterations: t.iterations === Infinity ? 'infinite' : t.iterations }; });
  const sticky = all.filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position)).slice(0, 10).map((el) => ({ el: sig(el), position: getComputedStyle(el).position, height: Math.round(el.getBoundingClientRect().height) }));

  const bodyS = getComputedStyle(document.body), htmlS = getComputedStyle(document.documentElement);
  const pairList = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, weight]) => { const [bgC, color, raw] = k.split(' '); return { bg: bgC, color, raw, weight }; });
  return {
    viewport: { width: vw, height: vh }, pageHeight: docH,
    page: { background: hex(bodyS.backgroundColor) || hex(htmlS.backgroundColor) || '#FFFFFF', color: hex(bodyS.color), scrollBehavior: htmlS.scrollBehavior, lang: document.documentElement.lang },
    palette: { backgrounds: top(bg, 8), text: top(fg, 6), borders: top(border, 5), pairs: pairList },
    fonts: { used: top(fam, 5).map((f) => ({ ...f, stack: topKey(famStack[f.value]) || f.value })), faces: fontFaces, links: fontLinks, faceSrc, unreadableSheets },
    scale, scaleFrom, bodyProbe, typeset, containers: top(containers, 5), containerFrom, grids: gridInfo.slice(0, 25),
    actions: { fills, underlines },
    spacing: top(space, 16), shape: { radius: top(radius, 6), shadow: top(shadow, 4), borderWidth: top(bw, 4) },
    sections, texture, passport,
    colorScheme: { darkMedia, lightDark, root: htmlS.colorScheme || 'normal', meta: metaScheme || null, unreadableSheets, unreadable },
    motion: { libs, scriptHints, transitions: top(trans, 10), running, keyframes: keyframes.slice(0, 30), sticky, reducedMotion },
    tilda: isTilda ? (() => { let zMax = 1, zN = 0; for (const v of zM.values()) if (v !== 1) { zN++; if (v > zMax) zMax = v; } return { ...TILDA, excluded, zoom: { max: zMax, elements: zN } }; })() : undefined,
  };
}

async function revealAfter(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-dref-reveal]')].map((el) => { const s = getComputedStyle(el); return { i: +el.getAttribute('data-dref-reveal'), opacity: s.opacity, transform: s.transform }; }));
}

/* ---------- состояния: наведение и фокус ---------- */
const STATE_PROPS = ['color', 'backgroundColor', 'borderTopColor', 'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'outlineStyle', 'outlineColor', 'outlineWidth', 'outlineOffset', 'filter', 'letterSpacing'];
/* цвета элемента в #RRGGBB[AA] — для цвета наведения (любая запись: rgb, oklch, color-mix) */
const HOVER_HEX = new Function('el', `const hex = ${HEX_SRC}; const s = getComputedStyle(el); return { backgroundColor: hex(s.backgroundColor), color: hex(s.color), borderTopColor: parseFloat(s.borderTopWidth) > 0 ? hex(s.borderTopColor) : null };`);
/**
 * Наведение и фокус первых 14 разных ссылок, кнопок и полей. sharp — если есть,
 * насыщенный цвет, который элемент получает при наведении (фон, текст, рамка),
 * проверяется пикселями снимка его коробки под курсором: hoverColor { prop, color, share }.
 */
async function states(page, sharp = null) {
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  const handles = await page.$$('a, button, input, [role="button"], summary');
  const seen = new Set(); const out = [];
  const DEPS = { eff: EFF_SRC };
  for (const h of handles) {
    if (out.length >= 14) break;
    /* спрятанные (ссылка-пропуск за краем, прозрачный контейнер) не наводим */
    const info = await h.evaluate(new Function('el', `const eff = ${DEPS.eff}; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { sig: el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 3).join('.'), ok: r.width > 8 && r.height > 8 && r.right > 0 && r.left < innerWidth && r.bottom + scrollY > 0 && s.visibility !== 'hidden' && eff(el) > 0.05, transition: s.transitionProperty + ' ' + s.transitionDuration + ' ' + s.transitionTimingFunction, text: (el.innerText || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 40), first: r.top + scrollY < innerHeight, w: Math.round(r.width), h: Math.round(r.height) };`)).catch(() => ({ ok: false }));
    if (!info.ok || seen.has(info.sig)) continue; seen.add(info.sig);
    const read = () => h.evaluate((el, props) => { const s = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, s[p]])); }, STATE_PROPS);
    try {
      await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.mouse.move(0, 0); await sleep(120);
      const base = await read();
      await h.hover(); await sleep(650);
      const hov = await read();
      /* цвет действия при наведении: первый насыщенный непрозрачный цвет, которого не было до наведения */
      let hoverColor = null;
      const hx = await h.evaluate(HOVER_HEX).catch(() => ({}));
      for (const p of ['backgroundColor', 'color', 'borderTopColor']) {
        let c = hx[p]; if (!c || hov[p] === base[p]) continue;
        if (c.length === 9) { if (parseInt(c.slice(7), 16) < 217) continue; c = c.slice(0, 7); }
        if (!vividHex(c)) continue;
        hoverColor = { prop: p, color: c, share: null };
        if (sharp) { try { hoverColor.share = r6(await boxShare(page, h, sharp, c)); } catch { /* коробка вне окна или ушла */ } }
        break;
      }
      await page.mouse.move(0, 0); await sleep(200);
      await h.focus(); await sleep(250);
      const foc = await read();
      await h.evaluate((el) => el.blur());
      const diff = (a, b) => Object.fromEntries(Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => [k, { from: a[k], to: b[k] }]));
      out.push({ el: info.sig, text: info.text, first: info.first, w: info.w, h: info.h, transition: info.transition, hover: diff(base, hov), focus: diff(base, foc), ...(hoverColor ? { hoverColor } : {}) });
    } catch { /* элемент ушёл со страницы или перекрыт — пропускаем */ }
  }
  return out;
}

/* ---------- пиксели: цвет действия на снимке коробки самого элемента ---------- */

/**
 * Доля пикселей коробки элемента, которые ближе PIXEL_TOLERANCE к цвету '#RRGGBB'.
 * Снимается окно целиком и вырезается по getBoundingClientRect: ElementHandle.screenshot
 * на странице Framer после scrollIntoView снимал не то место (голубой фон вместо кнопки).
 */
async function boxShare(page, h, sharp, color) {
  const r = await h.evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, vw: innerWidth }; });
  const buf = await page.screenshot({ type: 'png' });
  const img = sharp(buf), meta = await img.metadata(), k = meta.width / r.vw;
  const left = Math.max(0, Math.round(r.x * k)), top = Math.max(0, Math.round(r.y * k));
  const width = Math.min(meta.width, Math.round((r.x + r.w) * k)) - left, height = Math.min(meta.height, Math.round((r.y + r.h) * k)) - top;
  if (!(width >= 2 && height >= 2)) throw new Error('коробка вне окна');
  const { data } = await img.extract({ left, top, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const T = rgb(color), t2 = PIXEL_TOLERANCE * PIXEL_TOLERANCE;
  let hit = 0;
  for (let i = 0; i < data.length; i += 3) { const dr = data[i] - T[0], dg = data[i + 1] - T[1], db = data[i + 2] - T[2]; if (dr * dr + dg * dg + db * db <= t2) hit++; }
  return hit / (width * height);
}

/**
 * Проверка кандидатов в акцент пикселями: для каждого цвета до двух элементов
 * (первый экран — раньше, затем крупнее), элемент — в середину окна, снимок его
 * коробки, доля пикселей этого цвета → item.share. Заливок — до 6 цветов,
 * подчёркиваний — до 4. Не цвет всего снимка: голубой фон шапки в коробку
 * кнопки не попадает, а кнопка, закрытая другим слоем, не подтвердится.
 */
async function checkActions(page, actions) {
  const sharp = loadSharp();
  if (!sharp) return { error: 'нет sharp — акцент не проверен по снимкам' };
  const colorsOf = (list, n) => {
    const by = new Map(); for (const it of list) { if (!by.has(it.value)) by.set(it.value, []); by.get(it.value).push(it); }
    return [...by.values()].sort((a, b) => (b.some((i) => i.first) - a.some((i) => i.first)) || (b.length - a.length)).slice(0, n);
  };
  let shots = 0;
  for (const items of [...colorsOf(actions.fills, 6), ...colorsOf(actions.underlines, 4)]) {
    const pick = [...items].sort((a, b) => (b.first - a.first) || (b.w * b.h - a.w * a.h)).slice(0, 2);
    for (const it of pick) {
      const h = await page.$(`[data-dref-act="${it.id}"]`).catch(() => null);
      if (!h) continue;
      try {
        await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(350);
        it.share = r6(await boxShare(page, h, sharp, it.value)); shots++;
      } catch { /* элемент ушёл или коробка вне окна — не проверен */ } finally { await h.dispose().catch(() => {}); }
    }
  }
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(200);
  return { shots, tolerance: PIXEL_TOLERANCE, fillMin: FILL_MIN, textMin: TEXT_MIN, lineMin: LINE_MIN };
}

/* ---------- один проход по странице ---------- */
/* масштаб и Tilda — из lib.mjs site-rework; без него — запасные: zoom через currentCSSZoom, Tilda не распознаётся */
const ZOOM_SRC = (SR && SR.EFFECTIVE_ZOOM_FN) || `(el) => { try { const z = el && el.currentCSSZoom; return typeof z === 'number' && z > 0 ? Math.round(z * 10000) / 10000 : 1; } catch (e) { return 1; } }`;
const CLIP_SRC = (SR && SR.CLIP_SHARE_FN) || '() => 1';
const TILDA_SRC = (SR && SR.TILDA_FN) || '() => ({ tilda: false })';
const TSVC_SRC = (SR && SR.IS_TILDA_SERVICE_FN) || '() => false';
/* замер строк — исходник LINES_FN из site-rework typeset.mjs (импорт командную строку не запускает); без него — null */
const LINES_SRC = (TYPESET && TYPESET.LINES_FN) || 'null';
const DEPS = { hex: HEX_SRC, eff: EFF_SRC, sig: SIG_SRC, layer: layerBg.toString(), zoom: ZOOM_SRC, clip: CLIP_SRC, tilda: TILDA_SRC, tsvc: TSVC_SRC };
const DARK_TEXT = /prefers-color-scheme\s*:\s*dark/i;
const MOBILE_UA = (SR && SR.MOBILE_UA) || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const r6 = (x) => Math.round(x * 1e6) / 1e6;

/** Есть ли у страницы тёмная тема: причина строкой или null. */
export function darkSource(cs) {
  if (!cs) return null;
  if (cs.darkMedia) return cs.darkFrom === 'css-text' ? '@media (prefers-color-scheme: dark) в таблице стилей с чужого домена' : '@media (prefers-color-scheme: dark)';
  if (cs.lightDark) return 'light-dark() в CSS';
  if (/dark/i.test(cs.root || '')) return `color-scheme: ${cs.root}`;
  if (/dark/i.test(cs.meta || '')) return `<meta name="color-scheme" content="${cs.meta}">`;
  return null;
}

/* Аккордеоны без details и класса accordion (Framer, Tilda): правило clicks.mjs site-rework — вопрос,
   значок и спрятанный ответ; 'probe' — подтвердить кликом (раскрывает, второй клик закрывает), 'find' —
   только найти. В паспорт: элементы по селектору + пункты «своих» групп, не отвергнутых кликом. */
function accordionPassport(data, acc) {
  const P = data.passport; if (!P) return;
  if (!acc) { P.accordions = { source: CLICKS ? 'не искались' : 'нет site-rework — только details и класс accordion', groups: [] }; return; }
  const own = acc.groups.filter((g) => CLICKS.accordionOk(g) && !g.inClass && !g.native);   /* details уже посчитаны селектором */
  P.components.accordion = (P.components.accordion || 0) + own.reduce((a, g) => a + g.count, 0);
  P.accordions = { source: 'clicks.mjs (site-rework)', details: acc.details, byClass: acc.byClass, groups: acc.groups.map((g) => ({ sig: g.sig, kind: g.kind, how: g.how, chevron: g.chevron, count: g.count, status: g.status || 'не проверен', opened: g.opened, tried: g.tried, closed: g.closed, questions: g.questions, inClass: g.inClass })) };
}

async function measure(browser, url, viewport, { shotsDir, tag, withStates, scheme = 'light', pixels = false, readCss = false, clicks = null }) {
  const page = guardPage(await browser.newPage());
  /* таблицы стилей с чужого домена CSSOM не читает — тёмную тему в них ищем по тексту ответа */
  const cssTexts = [];
  const onResp = (resp) => { try { if (resp.request().resourceType() === 'stylesheet') cssTexts.push({ url: resp.url(), text: resp.text().catch(() => '') }); } catch { /* ответ без тела */ } };
  try {
    await page.setViewport(viewport);
    if (viewport.isMobile) await page.setUserAgent(MOBILE_UA);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    if (readCss) page.on('response', onResp);
    await gotoRetry(page, url, { waitUntil: 'networkidle2', timeout: 60000 });
    const gotoInfo = page.gotoInfo || { attempt: 1, waitUntil: 'networkidle2' };
    await page.evaluate(() => document.fonts.ready).catch(() => {}); await sleep(600);
    const revealBefore = await evaluateWith(page, beforeScroll, null, DEPS);
    /* проход 1: подгрузить ленивое, дать сработать появлениям, на каждом шаге — видимость и фон под текстом */
    const pass = await scrollPass(page, { pause: 450, onStep: () => { assertAlive(page); return evaluateWith(page, stepProbe, null, DEPS); } });
    assertAlive(page);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(400);
    const after = await revealAfter(page);
    const data = await evaluateWith(page, inPage, null, { ...DEPS, lines: LINES_SRC });
    data.motion.scrollReveal = revealBefore.map((b, i) => { const a = after.find((x) => x.i === i); return a && (a.opacity !== b.opacity || a.transform !== b.transform) ? { ...b, becomes: { opacity: a.opacity, transform: a.transform } } : null; }).filter(Boolean).slice(0, 20);
    data.scroll = { steps: pass.screens, pageHeight: pass.pageHeight, maxScrollY: pass.maxScrollY, reachedBottom: pass.reachedBottom, stuck: !!pass.stuck };
    data.tool = { goto: gotoInfo };
    let acc = null;
    if (clicks && CLICKS) { try { acc = (await CLICKS.findClickTargets(page, { want: ['accordions'] })).accordions; } catch (e) { data.tool.clicksError = String(e.message || e).slice(0, 120); } }
    if (readCss) {
      page.off('response', onResp);
      /* читаемые таблицы CSSOM уже проверил — значит, найденное в тексте пришло из нечитаемой */
      if (!data.colorScheme.darkMedia && data.colorScheme.unreadableSheets) {
        for (const c of cssTexts) if (DARK_TEXT.test(await c.text)) { data.colorScheme.darkMedia = true; data.colorScheme.darkFrom = 'css-text'; data.colorScheme.darkSheet = c.url.slice(0, 200); break; }
      }
    }
    /* проход 2: снимки окна равномерно по высоте — в файлы */
    if (shotsDir) {
      const ys = segmentPositions(data.pageHeight, viewport.height, { maxShots: 10 });
      for (let k = 0; k < ys.length; k++) {
        const s = await screenAt(page, ys[k]);
        fs.writeFileSync(path.join(shotsDir, `${tag}-scroll-${String(k).padStart(2, '0')}.png`), s.buffer);
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(300);
    }
    /* акцент: цвет действий подтверждается пикселями коробок самих кнопок и ссылок, а не долей по всему снимку */
    if (pixels) data.actions.pixels = await checkActions(page, data.actions);
    if (shotsDir) data.fullShot = await fullShot(page, path.join(shotsDir, `${tag}-full.png`));
    if (withStates) data.states = await states(page, pixels ? loadSharp() : null);
    /* клики — последними: раскрывают пункты */
    if (acc && clicks === 'probe' && acc.groups.length) { try { await CLICKS.probeAccordions(page, acc.groups, { touch: !!viewport.hasTouch }); } catch (e) { data.tool.clicksError = String(e.message || e).slice(0, 120); } }
    if (clicks) accordionPassport(data, acc);
    return data;
  } finally { page.off('response', onResp); await page.close().catch(() => {}); }
}

/**
 * Снять дизайн-систему. shotsDir — папка снимков или null; light — без состояний
 * и тёмной темы; pixels — подтверждать акцент пикселями коробок кнопок и ссылок;
 * states — снимать наведение и фокус (по умолчанию — если не light); browser —
 * уже запущенный браузер (не закрывается); source — что писать в «Источник»
 * (по умолчанию url).
 */
export async function extract(url, { shotsDir = null, light = false, pixels = true, states = null, browser = null, source = null } = {}) {
  const own = !browser;
  const br = browser || await launch();
  try {
    if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
    const desktop = await measure(br, url, DESKTOP, { shotsDir, tag: 'desktop', withStates: states == null ? !light : !!states, pixels, readCss: !light, clicks: light ? 'find' : 'probe' });
    const mobile = await measure(br, url, MOBILE, { shotsDir, tag: 'mobile', withStates: false, clicks: 'find' });
    let dark = null, darkReason = null;
    const why = darkSource(desktop.colorScheme);
    if (light) darkReason = 'не снималась (--light)';
    else if (!why) darkReason = 'не снималась: в CSS нет @media (prefers-color-scheme: dark), light-dark() и color-scheme с dark' + (desktop.colorScheme.unreadableSheets ? ` (таблиц стилей с чужого домена: ${desktop.colorScheme.unreadableSheets}, их текст тоже проверен)` : '');
    else {
      const d = await measure(br, url, DESKTOP, { shotsDir: null, tag: 'dark', withStates: false, scheme: 'dark' });
      const th = themes(d);
      dark = { page: d.page, palette: d.palette, themes: th, source: why, differs: d.page.background !== desktop.page.background || d.page.color !== desktop.page.color };
    }
    let sharpOk = false; try { sharpOk = !!loadSharp(); } catch { /* нет */ }
    return { source: source || url, takenAt: new Date().toLocaleDateString('sv-SE'), tool: { version: VERSION, siteRework: !!SR, sharp: sharpOk }, desktop, mobile, dark, darkReason };
  } finally { if (own) await br.close().catch(() => {}); }
}

/* ---------- цвета: яркость, контраст, роли ---------- */
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const alpha = (h) => (h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1);
/** Цвет с прозрачностью, наложенный на фон — таким его видит глаз. */
const flat = (h, bgHex) => { const a = alpha(h), c = rgb(h), b = rgb(bgHex); return '#' + c.map((v, i) => Math.round(v * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase(); };
const sat = (h) => { const [r, g, b] = rgb(h).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
export const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.round(Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])); };
/** Относительная яркость по WCAG. */
export const lum = (h) => { const [r, g, b] = rgb(h).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** Контраст по WCAG, 1…21. */
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const isHex6 = (h) => /^#[0-9A-F]{6}$/i.test(h || '');
const fam1 = (f) => String(f || '').split(',')[0].replace(/["']/g, '').trim();
const pct = (x) => (x * 100).toFixed(x < 0.001 ? 3 : 2) + '%';

/**
 * Темы по реальному фону под текстом: { dark, light } — у каждой { bg, text,
 * muted, weight, share, mutedWhy }. Тёмная — фон с яркостью < 0.18. Приглушённый —
 * нейтральный цвет между текстом и фоном по яркости, с контрастом к фону ≥ 3 и
 * заметным весом; иначе null и mutedWhy. null — в замерах нет пар (старый json).
 */
export function themes(d) {
  const pairs = ((d.palette && d.palette.pairs) || []).filter((p) => isHex6(p.bg) && isHex6(p.color));
  if (!pairs.length) return null;
  const total = pairs.reduce((a, p) => a + p.weight, 0);
  const byBg = {}; for (const p of pairs) byBg[p.bg] = (byBg[p.bg] || 0) + p.weight;
  const out = { dark: null, light: null };
  for (const name of ['dark', 'light']) {
    const bgs = Object.entries(byBg).filter(([h]) => (lum(h) < 0.18) === (name === 'dark')).sort((a, b) => b[1] - a[1]);
    if (!bgs.length) continue;
    const bgC = bgs[0][0];
    const near = pairs.filter((p) => dist(p.bg, bgC) <= 24);
    const weight = near.reduce((a, p) => a + p.weight, 0);
    if (weight < Math.max(40, total * 0.03)) continue;
    const byC = {}; for (const p of near) byC[p.color] = (byC[p.color] || 0) + p.weight;
    const colors = Object.entries(byC).map(([value, w]) => ({ value, weight: w })).sort((a, b) => b.weight - a.weight);
    const neutral = colors.filter((c) => sat(c.value) < 0.35 && contrast(c.value, bgC) >= 3);
    const head = neutral.slice(0, 4); const maxW = head.length ? head[0].weight : 0;
    const textC = head.filter((c) => c.weight >= maxW * 0.25).sort((a, b) => contrast(b.value, bgC) - contrast(a.value, bgC))[0] || null;
    let muted = null, mutedWhy = null;
    if (textC) {
      const lb = lum(bgC), lt = lum(textC.value), minW = Math.max(20, weight * 0.01);
      muted = neutral.find((c) => c.value !== textC.value && dist(c.value, textC.value) > 25 && (lum(c.value) - lb) * (lum(c.value) - lt) < 0 && c.weight >= minW) || null;
      if (!muted) {
        const gray = colors.find((c) => sat(c.value) < 0.35 && c.value !== textC.value && dist(c.value, textC.value) > 25 && (lum(c.value) - lb) * (lum(c.value) - lt) < 0);
        /* причина — настоящая: серый с контрастом ≥ 3 отсеян весом, а не контрастом (madeon: «#636363 — контраст 6.0 < 3») */
        mutedWhy = !gray ? 'серого между текстом и фоном нет' : contrast(gray.value, bgC) >= 3 ? `${gray.value} на ${bgC} — мало текста этим цветом (вес ${Math.round(gray.weight)} < ${Math.round(minW)})` : `${gray.value} на ${bgC} — контраст ${contrast(gray.value, bgC).toFixed(1)} < 3`;
      }
    } else mutedWhy = 'нет текста с контрастом ≥ 3';
    out[name] = { bg: bgC, text: textC ? textC.value : null, muted: muted ? muted.value : null, weight, share: Math.round(weight / total * 100) / 100, mutedWhy };
  }
  return out.dark || out.light ? out : null;
}

/** Насыщенные цвета палитры (фоны, текст, рамки), по убыванию насыщенность × log(вес). c.seen — цвет на фоне страницы. */
export function accentPool(d) {
  const background = d.page.background.slice(0, 7);
  const see = (list) => (list || []).map((c) => ({ ...c, seen: flat(c.value, background) }));
  const pool = [...see(d.palette.backgrounds), ...see(d.palette.text), ...see(d.palette.borders)].filter((c) => sat(c.seen) > 0.4 && dist(c.seen, background) > 60);
  pool.sort((a, b) => sat(b.seen) * Math.log(b.weight + 2) - sat(a.seen) * Math.log(a.weight + 2));
  const uniq = []; for (const c of pool) if (!uniq.some((u) => u.value === c.value)) uniq.push(c);
  return uniq;
}

/** Насыщенный цвет действия: насыщенность > 0.4 и разброс каналов ≥ 60 (как в странице). */
const vividHex = (h) => { if (!isHex6(h)) return false; const c = rgb(h), mx = Math.max(...c), mn = Math.min(...c); return mx > 0 && (mx - mn) / mx > 0.4 && mx - mn >= 60; };
const KIND = { fill: 'заливка кнопки', hover: 'наведение', underline: 'подчёркивание ссылки' };

/**
 * Кандидаты в акцент — цвета действий, группами по цвету (близкие, до 12 по RGB, — одна группа):
 * ярус 1 — заливки кнопок и ссылок-кнопок; ярус 2 — цвет при наведении (d.states[].hoverColor)
 * и подчёркивание ссылок. Порядок: ярус, есть ли на первом экране, сколько элементов, площадь.
 * У группы: confirmed — хоть один элемент прошёл порог пикселей своей коробки, checked — проверялся.
 */
export function actionGroups(d) {
  const A = d.actions || {}, items = [];
  for (const f of A.fills || []) items.push({ ...f, kind: 'fill', tier: 1, min: FILL_MIN });
  for (const s of d.states || []) {
    const hc = s.hoverColor; if (!hc) continue;
    items.push({ value: hc.color, el: s.el, text: s.text || '', first: !!s.first, w: s.w, h: s.h, share: hc.share, prop: hc.prop, kind: 'hover', tier: 2, min: hc.prop === 'backgroundColor' ? FILL_MIN : TEXT_MIN });
  }
  for (const u of A.underlines || []) items.push({ ...u, kind: 'underline', tier: 2, min: LINE_MIN });
  const groups = [];
  for (const it of items) {
    let g = groups.find((x) => x.tier === it.tier && dist(x.value, it.value) <= 12);
    if (!g) groups.push(g = { value: it.value, tier: it.tier, items: [] });
    g.items.push(it);
  }
  for (const g of groups) {
    g.first = g.items.some((i) => i.first); g.count = g.items.length; g.area = g.items.reduce((a, i) => a + (i.w || 0) * (i.h || 0), 0);
    const checked = g.items.filter((i) => i.share != null);
    g.checked = checked.length > 0;
    g.passed = checked.filter((i) => i.share >= i.min).sort((a, b) => (b.first - a.first) || (b.share - a.share));
    g.confirmed = g.passed.length > 0;
    g.lead = g.passed[0] || [...g.items].sort((a, b) => (b.first - a.first) || ((b.w || 0) * (b.h || 0) - (a.w || 0) * (a.h || 0)))[0];
    g.value = g.lead.value;
  }
  return groups.sort((a, b) => (a.tier - b.tier) || (b.first - a.first) || (b.count - a.count) || (b.area - a.area));
}

/** «заливка кнопки «Browse 3D illustrations» (первый экран, ещё 2)» — чем подтверждён цвет. */
function describeGroup(g) {
  const i = g.lead, what = i.kind === 'hover' ? `наведение (${i.prop === 'backgroundColor' ? 'фон' : i.prop === 'color' ? 'текст' : 'рамка'}) у ${i.text ? `«${i.text}»` : i.el}` : `${KIND[i.kind]} ${i.text ? `«${i.text}»` : i.el}`;
  const more = [i.first ? 'первый экран' : null, g.count > 1 ? `ещё ${g.count - 1}` : null].filter(Boolean).join(', ');
  return what + (more ? ` (${more})` : '');
}

/** Насыщенные фоны палитры, которые не цвет действий (шапка, подвал, секции): для пояснения. */
function decorColors(d, groups) {
  const bgs = new Set(((d.palette && d.palette.backgrounds) || []).map((c) => c.value));
  return accentPool(d).filter((c) => bgs.has(c.value) && vividHex(c.value) && !groups.some((g) => g.items.some((i) => dist(c.value, i.value) <= 12))).map((c) => c.value).slice(0, 3);
}

/**
 * Акцент — цвет действий: { value, status, share, note, source, candidates, old }.
 * status: 'подтверждён' (элемент прошёл порог пикселей своей коробки: заливка ≥ 25%,
 * текст при наведении ≥ 3%, линия ≥ 2%), 'нет' (цветных кнопок и ссылок нет или ни одна
 * не видна на снимке своей коробки), 'не проверен' (--no-pixels, нет sharp).
 * json до extract 2026-09-24.2 (нет actions) — старое правило по доле всего снимка, old: true.
 */
export function accentInfo(d) {
  if (!d.actions) return { ...accentInfoOld(d), old: true };
  const groups = actionGroups(d), P = d.actions.pixels;
  const candidates = groups.slice(0, 6).map((g) => ({ value: g.value, kind: g.lead.kind, first: g.first, count: g.count, share: g.passed[0] ? g.passed[0].share : Math.max(0, ...g.items.map((i) => i.share || 0)), confirmed: g.confirmed }));
  const dc = decorColors(d, groups), decor = dc.length ? `; насыщенные фоны ${dc.join(', ')} — оформление (секции, шапка, подвал), не цвет действий` : '';
  if (!groups.length) return { value: null, status: 'нет', note: `залитых цветом кнопок, цветного наведения и подчёркивания ссылок нет — акцента нет${decor}`, source: null, candidates };
  if (!P || P.error) {
    const g = groups[0];
    return { value: g.value, status: 'не проверен', note: `${describeGroup(g)}; пикселями не проверялся${P && P.error ? ` (${P.error})` : ' (--no-pixels)'}`, source: g.lead.kind, candidates };
  }
  const ok = groups.find((g) => g.confirmed);
  if (ok) return { value: ok.value, status: 'подтверждён', share: ok.lead.share, note: `${describeGroup(ok)} — ${pct(ok.lead.share)} пикселей коробки${decor}`, source: ok.lead.kind, candidates };
  const list = groups.slice(0, 3).map((g) => `${g.value} ${KIND[g.lead.kind]} ${g.checked ? pct(Math.max(0, ...g.items.map((i) => i.share || 0))) : 'не снят'}`).join(', ');
  return { value: null, status: 'нет', note: `цвета действий на снимках своих коробок не видны (${list}) — акцента нет${decor}`, source: null, candidates };
}

/** Старое правило (json до extract 2026-09-24.2): насыщенный цвет палитры, ≥ 0.2% пикселей всех снимков окна. */
function accentInfoOld(d) {
  const pool = accentPool(d);
  const pc = d.palette.pixelCheck;
  const why = 'json снят до правила «цвет действий» — переснять extract';
  if (!pool.length) return { value: null, status: 'нет', note: `насыщенных цветов в палитре нет (${why})` };
  if (!pc || pc.error || !pc.share) return { value: pool[0].value, status: 'не проверен', note: `${pc && pc.error ? pc.error : 'снимками окна не проверялся'} (${why})`, candidates: pool.slice(0, 6).map((c) => ({ value: c.value })) };
  const min = pc.min || ACCENT_MIN_SHARE;
  const cand = pool.slice(0, 6).map((c) => ({ value: c.value, share: pc.share[c.value], shareAll: pc.shareAll ? pc.shareAll[c.value] : undefined }));
  const ok = cand.find((c) => c.share != null && c.share >= min);
  if (ok) return { value: ok.value, status: 'подтверждён', share: ok.share, note: `${pct(ok.share)} пикселей снимков окна, по старому правилу (${why})`, candidates: cand };
  const list = cand.slice(0, 3).map((c) => `${c.value} (${c.share == null ? '—' : pct(c.share)})`).join(', ');
  return { value: null, status: 'нет', note: `в CSS есть ${list}, на снимках окна меньше ${pct(min)} — акцента нет (${why})`, candidates: cand };
}

/** Тема, к которой относится фон страницы (для старых ролей text/muted). */
function mainTheme(th, background) {
  if (!th) return null;
  const list = [th.dark, th.light].filter(Boolean);
  const near = list.filter((t) => dist(t.bg, background) <= 24).sort((a, b) => dist(a.bg, background) - dist(b.bg, background))[0];
  return near || (lum(background) < 0.18 ? th.dark : th.light) || list.sort((a, b) => b.weight - a.weight)[0];
}

export function roles(d) {
  const background = d.page.background.slice(0, 7);
  const see = (list) => (list || []).map((c) => ({ ...c, seen: flat(c.value, background) }));
  const bgs = see(d.palette.backgrounds), txt = see(d.palette.text), brd = see(d.palette.borders);
  /* поверхность — заметная площадь (от четверти экрана), а не заливка одной кнопки */
  const minArea = d.viewport ? d.viewport.width * d.viewport.height * 0.25 : 0;
  const surface = (bgs.find((c) => alpha(c.value) === 1 && dist(c.seen, background) > 3 && dist(c.seen, background) < 90 && sat(c.seen) < 0.35 && c.weight >= minArea) || {}).value || null;
  const mt = mainTheme(themes(d), background);
  let text, muted;
  if (mt && mt.text) { text = mt.text; muted = mt.muted; }
  else {
    /* старый json без пар: основной — самый контрастный из частых нейтральных; приглушённый — между ним и фоном, контраст с фоном ≥ 3 */
    const neutral = txt.filter((c) => sat(c.seen) < 0.35 && dist(c.seen, background) > 60).slice(0, 4);
    const textC = [...neutral].sort((a, b) => dist(b.seen, background) - dist(a.seen, background))[0];
    text = textC ? textC.value : d.page.color;
    const lb = lum(background), lt = textC ? lum(textC.seen) : null;
    muted = textC ? (neutral.find((c) => c !== textC && dist(c.seen, textC.seen) > 25 && (lum(c.seen) - lb) * (lum(c.seen) - lt) < 0 && contrast(c.seen, background) >= 3) || {}).value || null : null;
  }
  const accent = accentInfo(d).value;
  const border = (brd.find((c) => c.value !== accent && sat(c.seen) < 0.35 && dist(c.seen, background) > 3) || {}).value || null;
  return { background, surface, text, muted, accent, border };
}

/** Роли шрифтов по уровням шкалы: body — у основного текста, display — у h1 (или h2), heading — у h2, если другой, alt — следующий по частоте. */
export function fontRoles(d) {
  const used = (d.fonts && d.fonts.used) || [];
  const stackOf = (f) => { if (!f) return null; const u = used.find((x) => fam1(x.value) === f); return u ? (u.stack || u.value) : `"${f}"`; };
  const body = d.scale.body ? d.scale.body.fontFamily : (used[0] ? fam1(used[0].value) : null);
  const display = (d.scale.h1 || d.scale.h2 || {}).fontFamily || null;
  const heading = d.scale.h2 && d.scale.h2.fontFamily !== display ? d.scale.h2.fontFamily : null;
  const alt = used.map((u) => fam1(u.value)).find((f) => f && f !== body && f !== display && f !== heading) || null;
  return { body, display, heading, alt, stacks: { body: stackOf(body), display: stackOf(display), heading: stackOf(heading), alt: stackOf(alt) } };
}

/** Набор строкой: «строка ~62 знаков (desktop) / 34 (телефон), h1 в 2 строки (телефон 4), …»; null — json до extract 2026-09-28.3. */
export function typesetLine(data) {
  const d = data.desktop && data.desktop.typeset, m = data.mobile && data.mobile.typeset;
  if (!d) return null;
  if (!/^LINES/.test(d.source || '')) return `не мерен — ${d.source}`;
  const v = (x, k) => (x && x[k] != null ? x[k] : '—');
  const lines = (n) => (n === '—' ? '— строк' : `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'строку' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'строки' : 'строк'}`);
  const nb = (x) => (x && x.shortTotal ? `${x.shortNb} из ${x.shortTotal}` : 'коротких слов нет');
  return `строка ~${v(d, 'bodyMeasure')} знаков (desktop) / ${v(m, 'bodyMeasure')} (телефон)${d.body ? ` — ${d.body.el}, ${d.body.lines} стр., блок ${d.body.em}em` : ' — абзаца нет'}, h1 в ${lines(v(d, 'h1Lines'))} (телефон ${v(m, 'h1Lines')}), text-wrap заголовков: ${(d.textWrap || []).join(', ') || '—'}, переносы: ${d.hyphens || '—'}, короткие слова привязаны неразрывным пробелом: ${nb(d)} (телефон ${nb(m)})`;
}

/** Сверка шкалы body с самым крупным абзацем: { ok, note } или null (абзаца нет). */
export function bodyCheck(d) {
  const b = d.scale.body, p = d.bodyProbe;
  if (!b || !p) return null;
  const ok = fam1(b.fontFamily) === fam1(p.fontFamily) && Math.abs(parseFloat(b.fontSize) - parseFloat(p.fontSize)) <= 2 && String(b.fontWeight) === String(p.fontWeight);
  const f = (s) => `${s.fontFamily} ${s.fontSize}/${s.fontWeight}/${s.lineHeight}`;
  return { ok, note: `шкала body ${f(b)}; самый крупный абзац (${p.el}, ${p.chars} зн.) ${f(p)}` };
}

const msList = (s) => s.split(',').map((x) => Math.round(parseFloat(x) * (x.includes('ms') ? 1 : 1000)));
export const seenColor = (h, bg) => flat(h, bg);
export function motionSummary(d) {
  const durs = {}, eases = {};
  for (const t of d.motion.transitions) { const [, dur, ease] = t.value.split(' | '); msList(dur).filter((v) => v > 0).forEach((v) => { durs[v] = (durs[v] || 0) + t.weight; }); const e = ease.split(/,(?![^(]*\))/)[0].trim(); eases[e] = (eases[e] || 0) + t.weight; }
  const order = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { durations: order(durs).slice(0, 3).map(Number), easings: order(eases).slice(0, 2) };
}

export function tokensCss(data) {
  const d = data.desktop, m = data.mobile, r = roles(d), mo = motionSummary(d), th = themes(d), ac = accentInfo(d), fr = fontRoles(d);
  const L = [`/* Снято с ${data.source} · ${data.takenAt}. Значения — замеры, роли цветов определены автоматически: проверить глазами. */`, ':root{'];
  for (const [k, v] of Object.entries(r)) {
    if (v) L.push(`  --c-${k}: ${v};`);
    else if (k === 'muted') L.push(`  /* --c-muted: не выявлено${th && mainTheme(th, r.background) && mainTheme(th, r.background).mutedWhy ? ' — ' + mainTheme(th, r.background).mutedWhy : ''} */`);
    else if (k === 'accent') L.push(`  /* --c-accent: акцента нет — ${ac.note} */`);
  }
  if (ac.status === 'не проверен' && ac.value) L.push(`  /* --c-accent не подтверждён снимками: ${ac.note} */`);
  if (th) for (const name of ['dark', 'light']) {
    const t = th[name]; if (!t) continue;
    L.push(`  --c-${name}-bg: ${t.bg};`);
    if (t.text) L.push(`  --c-${name}-text: ${t.text};`);
    L.push(t.muted ? `  --c-${name}-muted: ${t.muted};` : `  /* --c-${name}-muted: не выявлено — ${t.mutedWhy} */`);
  }
  if (fr.stacks.body) L.push(`  --font-body: ${fr.stacks.body};`);
  if (fr.stacks.alt) L.push(`  --font-alt: ${fr.stacks.alt};`);
  if (fr.stacks.display) L.push(`  --font-display: ${fr.stacks.display};`);
  if (fr.stacks.heading) L.push(`  --font-heading: ${fr.stacks.heading};`);
  for (const [lvl, s] of Object.entries(d.scale)) { L.push(`  --fs-${lvl}: ${s.fontSize};`); if (m.scale[lvl] && m.scale[lvl].fontSize !== s.fontSize) L.push(`  --fs-${lvl}-mobile: ${m.scale[lvl].fontSize};`); L.push(`  --lh-${lvl}: ${s.lineHeight};`); if (s.letterSpacing !== '0') L.push(`  --ls-${lvl}: ${s.letterSpacing};`); L.push(`  --fw-${lvl}: ${s.fontWeight};`); }
  if (d.containers[0]) L.push(`  --container: ${d.containers[0].value}px;`);
  const tsb = d.typeset && d.typeset.body; if (tsb && tsb.em && tsb.lines >= 2) L.push(`  --measure: ${tsb.em}em;`);
  if (m.containers[0]) L.push(`  --gutter-mobile: ${Math.round((m.viewport.width - m.containers[0].value) / 2)}px;`);
  const pads = d.sections.map((s) => s.paddingTop).filter((v) => v >= 24).sort((a, b) => a - b);
  if (pads.length) L.push(`  --section-pad: ${pads[Math.floor(pads.length / 2)]}px;`);
  const mpads = m.sections.map((s) => s.paddingTop).filter((v) => v >= 16).sort((a, b) => a - b);
  if (mpads.length) L.push(`  --section-pad-mobile: ${mpads[Math.floor(mpads.length / 2)]}px;`);
  d.spacing.slice(0, 8).map((s) => +s.value).sort((a, b) => a - b).forEach((v, i) => L.push(`  --space-${i + 1}: ${v}px;`));
  d.shape.radius.slice(0, 3).forEach((x, i) => L.push(`  --radius-${i + 1}: ${x.value};`));
  d.shape.shadow.slice(0, 2).forEach((x, i) => L.push(`  --shadow-${i + 1}: ${x.value};`));
  mo.durations.forEach((v, i) => L.push(`  --dur-${i + 1}: ${v}ms;`));
  mo.easings.forEach((v, i) => L.push(`  --ease-${i + 1}: ${v};`));
  const tx = (d.texture || [])[0];
  if (tx) {
    L.push(`  /* фактура: ${tx.el}, ${tx.position}, ${tx.backgroundImage || tx.media || 'заливка'}${tx.noise ? ' (шум)' : ''}, наложение ${tx.blend} — рецепт переносить, файл картинки не брать */`);
    L.push(`  --texture-opacity: ${tx.opacity};`, `  --texture-blend: ${tx.blend};`);
  }
  L.push('}');
  return L.join('\n') + '\n';
}

export function spacingModule(d) {
  const vals = d.spacing.map((s) => ({ v: +s.value, w: s.weight })); const total = vals.reduce((a, b) => a + b.w, 0) || 1;
  const share = (n) => Math.round(vals.filter((x) => x.v % n === 0).reduce((a, b) => a + b.w, 0) / total * 100);
  return { by8: share(8), by4: share(4), by5: share(5) };
}

/** Аккордеоны без details (Framer и др.): как найдены и подтверждены ли кликом. json до 2026-09-28 — ничего. */
function accordionLines(a) {
  if (!a) return [];
  if (!a.groups || !a.groups.length) return a.source && !/clicks/.test(a.source) ? [`- свои аккордеоны (без details): ${a.source}`] : [];
  return a.groups.map((g) => {
    const st = g.status === 'подтверждён' ? `клик раскрывает (${g.opened} из ${g.tried})${g.closed === g.opened ? ', второй клик закрывает' : ''}` : g.status === 'не проверен' ? 'кликом не проверялся' : `${g.status} — не считается`;
    return `- ${g.kind === 'details' ? 'аккордеон на details' : g.kind === 'aria-expanded' ? 'аккордеон с aria-expanded' : 'свой аккордеон'} \`${g.sig}\` ×${g.count}: ${g.chevron || 'без значка'} + ответ ${g.how}, ${st}${g.questions && g.questions[0] ? ` — «${g.questions[0].slice(0, 50)}»` : ''}`;
  });
}

const COMPONENT_NAMES = { form: 'форма', input: 'поля ввода', textarea: 'многострочное поле', select: 'выпадающий список', checkbox: 'флажки и переключатели', accordion: 'аккордеон', tabs: 'вкладки', dialog: 'окно поверх страницы', video: 'видео', iframe: 'встроенная страница (iframe)', canvas: 'холст (canvas)' };
export function passportLines(d) {
  const p = d.passport; if (!p) return ['- паспорт не снят (json старой версии)'];
  const tr = Object.entries(p.tracking || {}).sort((a, b) => b[1] - a[1]);
  const has = Object.entries(p.components || {}).filter(([, n]) => n > 0).map(([k, n]) => `${COMPONENT_NAMES[k] || k} ×${n}`);
  const not = Object.entries(p.components || {}).filter(([, n]) => !n).map(([k]) => COMPONENT_NAMES[k] || k);
  return [
    `- разрядка букв: ${tr.length ? tr.map(([v, n]) => `${v} ×${n}`).join(', ') : 'нет ни у одного текста'} (текстов всего ${p.textElements})`,
    `- капс: ${p.caps} из ${p.textElements}; мелкий капс с разрядкой (≤13px, ≥0.05em): ${p.smallCapsTracked}`,
    `- мелкий текст < 12px: ${p.smallText}`,
    `- радиусы: ${(p.radius || []).join(', ') || 'нет'}`,
    `- есть: ${has.join(', ') || 'ничего из списка'}`,
    `- нет: ${not.join(', ') || '—'} — проектировать из языка образца, а не по умолчанию`,
    ...accordionLines(p.accordions),
  ];
}

/**
 * Строка о Tilda для спецификации и сводки или null (не Tilda, json до extract 2026-09-28.2): масштаб Zero Block
 * (кегли и размеры — с поправкой на zoom), что исключено как служебное, что Tilda делает с появлениями.
 */
export function tildaLine(data) {
  const d = data.desktop, m = data.mobile, t = d && d.tilda; if (!t || !t.tilda) return null;
  const z = (x) => (x && x.tilda && x.tilda.zoom && x.tilda.zoom.max > 1.001 ? `×${x.tilda.zoom.max} при ${x.viewport.width}px` : null);
  const zz = [z(d), z(m)].filter(Boolean);
  const ex = [t.madeOnTilda ? 'плашка Made on Tilda' : null, t.excluded && t.excluded.service ? `служебных узлов ${t.excluded.service}` : null, t.excluded && t.excluded.clipped ? `обрезанных артбордом узлов ${t.excluded.clipped} (заглушки «Zero Block», элементы за краем)` : null].filter(Boolean);
  return `Tilda — ${zz.length ? `масштаб Zero Block ${zz.join(', ')} (upscale=window): кегли, отступы, радиусы и рамки даны на экране, computed × zoom` : 'масштаба Zero Block нет'}; служебное исключено из палитры, шкалы и кнопок: ${ex.join(', ') || 'нечего'}; появления: ${t.animationOff ? 'выключены проектом (data-blocks-animationoff)' : 'на ширине < 1200 Tilda выключает все, кроме data-animate-mobile=y'}. Язык донора точнее — site-rework/scripts/tilda.mjs`;
}

/** Строка про тёмную тему системы для спецификации и сводки. */
function darkLine(data) {
  const dk = data.dark;
  if (!dk) return data.darkReason || 'не снималась';
  const t = dk.themes && mainTheme(dk.themes, (dk.page.background || '#FFFFFF').slice(0, 7));
  return `${dk.differs ? 'есть' : 'объявлена, но фон и текст страницы не меняются'} (${dk.source}): фон ${dk.page.background}, текст ${dk.page.color}${t && t.muted ? ', приглушённый ' + t.muted : ''}`;
}

/**
 * Откуда взят уровень шкалы (h1 или nav) — строка для спецификации, сводки и verify;
 * null — json до extract 2026-09-24.2 (scaleFrom нет). code — имя элемента в `…`.
 */
export function levelSource(d, lvl, code = false) {
  const f = d && d.scaleFrom && d.scaleFrom[lvl];
  if (!f) return null;
  const q = (s) => (code ? `\`${s}\`` : s);
  if (!f.el) return f.how;
  if (lvl === 'h1') { const b = f.biggest; return `${q(f.el)} «${f.text}» — ${f.how}${f.of > 1 ? ` (видимых h1: ${f.of})` : ''}${b ? `; h1 мелкий (${d.scale && d.scale.h1 ? d.scale.h1.fontSize : '?'} при основном ${b.body}) — самый крупный текст первого экрана: ${q(b.el)} «${b.text}» ${b.fontSize}/${b.fontWeight} ${b.fontFamily}` : ''}`; }
  return `${q(f.el)} — ${f.how}: ${(f.texts || []).join(', ')}${f.links > (f.texts || []).length ? ' …' : ''}`;
}

/** Контейнер и откуда он: «1120px — div.framer-126l6gr и ещё 5, по высоте 10829px»; старый json — только число. */
export function containerNote(d) {
  const c = (d.containers || [])[0]; if (!c) return 'не выявлено';
  const from = (d.containerFrom || []).filter((x) => String(x.value) === String(c.value));
  return `${c.value}px` + (from.length ? ` — ${from[0].el}${from[0].how ? ` (${from[0].how})` : ''}${from.length > 1 ? ` и ещё ${from.length - 1}` : ''}, по высоте ${c.weight}px` : '');
}

const chg = (o) => Object.entries(o).map(([k, v]) => `${k} ${String(v.from).slice(0, 40)} → ${String(v.to).slice(0, 40)}`).join(', ') || 'без изменений';
function skeleton(data, slug) {
  const d = data.desktop, m = data.mobile, r = roles(d), mo = motionSummary(d), mod = spacingModule(d), th = themes(d), ac = accentInfo(d), fr = fontRoles(d), bc = bodyCheck(d), bcm = bodyCheck(m);
  const sc = (s) => Object.entries(s).map(([k, v]) => `| ${k} | ${v.fontFamily} | ${v.fontSize} | ${v.fontWeight} | ${v.lineHeight} | ${v.letterSpacing} | ${v.textTransform} |`).join('\n');
  const head = '| уровень | гарнитура | размер | вес | интерлиньяж | трекинг | регистр |\n|---|---|---|---|---|---|---|\n';
  const libs = Object.keys(d.motion.libs).join(', ') || 'не выявлено';
  const mt = mainTheme(th, r.background);
  const roleLine = ([k, v]) => {
    if (k === 'accent') return `- accent: ${v ? `${v} (${ac.status}${ac.note ? ', ' + ac.note : ''})` : `нет — ${ac.note}`}`;
    if (k === 'muted' && !v) return `- muted: не выявлено${mt && mt.mutedWhy ? ' — ' + mt.mutedWhy : ''}`;
    return `- ${k}: ${v || 'не выявлено'}`;
  };
  const themeLine = (name, label) => { const t = th && th[name]; return t ? `- ${label}: фон ${t.bg}, текст ${t.text || 'не выявлен'}, приглушённый ${t.muted || 'не выявлен' + (t.mutedWhy ? ' (' + t.mutedWhy + ')' : '')} — ${Math.round(t.share * 100)}% текста` : `- ${label}: нет`; };
  const texLines = (d.texture || []).length ? d.texture.map((t) => `- \`${t.el}\` — ${t.position}, ${t.width}×${t.height}, прозрачность ${t.opacity}, наложение ${t.blend}, z ${t.zIndex}${t.backgroundImage ? ', ' + t.backgroundImage : ''}${t.backgroundSize && t.backgroundImage ? ' (' + t.backgroundSize + ', ' + t.backgroundRepeat + ')' : ''}${t.backgroundColor ? ', цвет ' + t.backgroundColor : ''}${t.animation ? ', анимация ' + t.animation : ''}${t.noise ? ' — шум' : ''}`).join('\n') : '- полноэкранных слоёв поверх страницы нет';
  return `# ${slug}

Источник: ${data.source}
Дата съёма: ${data.takenAt}${data.tool && data.tool.version ? ` · ${data.tool.version}` : ''}
Сырые замеры: \`${slug}.json\` · переменные: \`${slug}.tokens.css\` · снимки: \`${slug}-shots/\`${tildaLine(data) ? `\nПлатформа: ${tildaLine(data)}` : ''}

> Заготовка собрана скриптом. Цифры — замеры. Роли цветов, разделы «Приём»
> и «Что берём себе» — дописать руками, посмотрев снимки.

## 1. Палитра
${Object.entries(r).map(roleLine).join('\n')}
- цвета действий (кандидаты в акцент): ${(ac.candidates || []).filter((c) => c.kind).map((c) => `${c.value} ${KIND[c.kind]} ×${c.count}${c.first ? ', первый экран' : ''}${c.share ? `, ${pct(c.share)} коробки` : ''}${c.confirmed ? '' : ' — не подтверждён'}`).join('; ') || 'нет'}
- тёмная тема системы: ${darkLine(data)}

Роли текста по реальному фону секций:
${themeLine('dark', 'тёмные секции')}
${themeLine('light', 'светлые секции')}

Пары «фон → цвет текста» (вес — знаков): ${(d.palette.pairs || []).slice(0, 8).map((p) => `${p.bg} → ${p.color} ${p.weight}`).join('; ') || 'не сняты'}
Все фоны по площади (с учётом прозрачности): ${d.palette.backgrounds.map((c) => c.value).join(', ')}
Все цвета текста: ${d.palette.text.map((c) => c.value).join(', ')}

## 1а. Фактура
${texLines}
${(d.texture || []).length ? '- переносить рецепт (прозрачность, наложение, размер крупинки, анимацию), а не файл; сверять по снимкам окна (*-scroll-NN.png): на снимке всей страницы закреплённый слой есть только в верхнем экране' : ''}
- на узком экране: ${(m.texture || []).length ? m.texture.map((t) => `\`${t.el}\` прозрачность ${t.opacity}`).join(', ') : 'слоёв нет'}

## 2. Шрифты
- основной текст: ${fr.stacks.body || 'не выявлено'}
- крупные заголовки: ${fr.stacks.display || 'не выявлено'}${fr.heading ? `\n- заголовки секций (h2): ${fr.stacks.heading}` : ''}
- ещё: ${fr.stacks.alt || 'нет'}
- по частоте: ${d.fonts.used.map((f) => `${f.value} (${f.weight})`).join(', ')}
- грузятся: ${d.fonts.links.join(', ') || (d.fonts.faceSrc.length ? 'свои файлы (@font-face)' : 'не выявлено')}
- кириллица: **проверить** \`cyrillic-check.mjs\` для каждой гарнитуры

## 3. Типографская шкала
Широкий экран:
${head}${sc(d.scale)}

Узкий экран (390):
${head}${sc(m.scale)}

Откуда взяты уровни (h2–h4, body, small, button — самый частый стиль своего тега):
- h1: ${levelSource(d, 'h1', true) || 'не выявлено'}; на узком: ${levelSource(m, 'h1', true) || 'не выявлено'}
- nav: ${levelSource(d, 'nav', true) || 'не выявлено'}; на узком: ${levelSource(m, 'nav', true) || 'не выявлено'}

Сверка основного текста: ${bc ? (bc.ok ? 'совпадает — ' : '**расходится, проверить глазами** — ') + bc.note : 'длинных абзацев нет'}${bcm && !bcm.ok ? `\nНа узком: **расходится** — ${bcm.note}` : ''}
${typesetLine(data) ? `\nНабор: ${typesetLine(data)}\n` : ''}
## 4. Сетка
- ширина контента: ${d.containers.map((c) => c.value + 'px').join(', ') || 'не выявлено'}${d.containerFrom && d.containers.length ? ` (вес — высота обёрток; --container ${containerNote(d)})` : ''}
- узкий экран, ширина контента: ${m.containers.map((c) => c.value + 'px').join(', ') || 'не выявлено'}${m.containerFrom && m.containers.length ? ` (${containerNote(m)})` : ''}
- колонки: ${d.grids.slice(0, 8).map((g) => `${g.el} — ${g.columns ? g.columns + ' кол.' : g.flexItems + ' в ряд'}, желоб ${g.gap}`).join('; ') || 'не выявлено'}
- на узком: ${m.grids.slice(0, 8).map((g) => `${g.el} — ${g.columns ? g.columns + ' кол.' : g.flexItems + ' в ряд'}`).join('; ') || 'всё в одну колонку'}

## 5. Ритм отступов
- частые значения: ${d.spacing.slice(0, 10).map((s) => s.value).join(', ')} px
- кратно 8 — ${mod.by8}%, кратно 4 — ${mod.by4}%, кратно 5 — ${mod.by5}%
- отступы секций сверху: ${d.sections.map((s) => s.paddingTop).join(', ')}

## 6. Форма
- радиусы: ${d.shape.radius.map((x) => x.value).join(', ') || 'нет'}
- тени: ${d.shape.shadow.map((x) => x.value).join(' ; ') || 'нет'}
- границы: ${d.shape.borderWidth.map((x) => x.value).join(', ') || 'нет'}

## 6а. Паспорт образца: что есть и чего нет
${passportLines(d).join('\n')}

## 7. Структура
${d.sections.map((s, i) => `${i + 1}. \`${s.el}\` — высота ${s.height}, фон ${s.background || 'прозрачный'}, картинок ${s.images}, ссылок ${s.links} — задача: …`).join('\n')}

## 8. Приём
…

## 9. Движение
- библиотеки: ${libs}${d.motion.scriptHints.length ? ' (скрипты: ' + d.motion.scriptHints.map((s) => s.split('/').pop()).join(', ') + ')' : ''}
- длительности переходов: ${mo.durations.join(', ') || 'не выявлено'} мс; кривые: ${mo.easings.join(' ; ') || 'не выявлено'}
- появление при прокрутке: ${d.motion.scrollReveal.length ? d.motion.scrollReveal.slice(0, 5).map((x) => `${x.el}: прозрачность ${x.opacity}→${x.becomes.opacity}, сдвиг ${x.transform === x.becomes.transform ? 'нет' : 'есть'}, ${x.transition}`).join('; ') : 'не выявлено'}
- ключевые кадры: ${d.motion.keyframes.map((k) => k.name).join(', ') || 'нет'}
- закреплённые элементы: ${d.motion.sticky.map((x) => `${x.el} (${x.position})`).join(', ') || 'нет'}
- плавная прокрутка: ${d.page.scrollBehavior}; уважает «меньше движения»: ${d.motion.reducedMotion ? 'да' : 'нет'}

### Состояния
${(d.states || []).map((s) => `- \`${s.el}\` — наведение: ${chg(s.hover)}; фокус: ${chg(s.focus)}; переход: ${s.transition}`).join('\n') || 'не выявлено'}

## 10. Мобильная версия
- размеры: ${Object.keys(d.scale).filter((k) => m.scale[k] && m.scale[k].fontSize !== d.scale[k].fontSize).map((k) => `${k} ${d.scale[k].fontSize}→${m.scale[k].fontSize}`).join(', ') || 'не меняются'}
- секций: ${d.sections.length} → ${m.sections.length}
- что прячется и перестраивается: …

## Что берём себе
- …

Что сознательно не переносим и почему:
- …
`;
}

/** Короткая сводка для консоли: строки «OK/WARN …». */
export function summaryLines(data) {
  const d = data.desktop, m = data.mobile, r = roles(d), ac = accentInfo(d), th = themes(d), bc = bodyCheck(d), bcm = bodyCheck(m);
  const out = [];
  const g = (x) => (x && x.goto ? `${x.goto.attempt}-й попытки${x.goto.waitUntil === 'domcontentloaded' ? ' (только DOMContentLoaded)' : ''}` : '—');
  out.push(`${[d, m].some((x) => x.tool && x.tool.goto && x.tool.goto.attempt > 1) ? 'WARN' : 'OK  '} переход: широкий экран с ${g(d.tool)}, узкий с ${g(m.tool)}`);
  if ([d, m].some((x) => x.scroll && (x.scroll.stuck || !x.scroll.reachedBottom))) out.push('WARN прокрутка не дошла до низа (страница держит прокрутку) — появления и снимки недостоверны');
  out.push(`${ac.status === 'не проверен' ? 'WARN' : 'OK  '} акцент: ${ac.value ? `${ac.value} — ${ac.status}${ac.note ? ', ' + ac.note : ''}` : ac.note}`);
  if (th) for (const [name, label] of [['dark', 'тёмные'], ['light', 'светлые']]) { const t = th[name]; if (t) out.push(`OK   ${label} секции: фон ${t.bg}, текст ${t.text || '—'}, приглушённый ${t.muted || 'не выявлен (' + t.mutedWhy + ')'}`); }
  else out.push('WARN роли текста по фону секций не сняты — роли по фону страницы');
  out.push(`OK   роли: ${Object.entries(r).map(([k, v]) => `${k} ${v || '—'}`).join(', ')}`);
  const lv = (x, k) => (x.scale[k] ? `${x.scale[k].fontSize}/${x.scale[k].fontWeight} ${x.scale[k].fontFamily}` : 'нет');
  if (d.scaleFrom) {
    out.push(`${d.scale.h1 ? 'OK  ' : 'WARN'} h1: ${lv(d, 'h1')} — ${levelSource(d, 'h1') || 'h1 не найден'}`);
    out.push(`OK   меню (nav): ${lv(d, 'nav')} — ${levelSource(d, 'nav') || 'не найдено'}; на узком: ${lv(m, 'nav')}${m.scaleFrom && m.scaleFrom.nav && !m.scaleFrom.nav.el ? ` (${m.scaleFrom.nav.how})` : ''}`);
    out.push(`OK   контейнер: ${containerNote(d)}; на узком: ${containerNote(m)}`);
  }
  for (const [b, label] of [[bc, 'широкий'], [bcm, 'узкий']]) if (b) out.push(`${b.ok ? 'OK  ' : 'WARN'} основной текст (${label}): ${b.note}`);
  if (typesetLine(data)) out.push(`${d.typeset && d.typeset.bodyMeasure != null ? 'OK  ' : 'WARN'} набор: ${typesetLine(data)}`);
  if (m.scale.body && parseFloat(m.scale.body.fontSize) < 6) out.push(`FAIL основной текст на узком экране ${m.scale.body.fontSize}`);
  out.push(`OK   фактура: ${(d.texture || []).length ? d.texture.map((t) => `${t.el} ${t.opacity}/${t.blend}`).join('; ') : 'полноэкранных слоёв нет'}`);
  out.push(`OK   тёмная тема: ${darkLine(data)}`);
  if (tildaLine(data)) out.push(`OK   платформа: ${tildaLine(data)}`);
  const pa = d.passport && d.passport.accordions;
  if (pa && pa.groups && pa.groups.length) out.push(`OK   аккордеоны (проверка кликом): ${pa.groups.map((g) => `${g.kind === 'details' ? 'details' : g.kind === 'aria-expanded' ? 'aria-expanded' : 'свой'} ${g.sig} ×${g.count} — ${g.status}`).join('; ')}`);
  if (d.tool && d.tool.clicksError) out.push(`WARN поиск аккордеонов: ${d.tool.clicksError}`);
  if (!data.tool || !data.tool.siteRework) out.push('WARN site-rework рядом нет — запасной путь: без ожидания картинок на снимках, прозрачность без теневого DOM, свои аккордеоны (Framer, Tilda) не ищутся');
  return out;
}

/* ---------- запуск из командной строки ---------- */
const HELP = `Съём дизайн-системы со страницы.

  node extract.mjs <url> [--out docs/design] [--name slug] [--no-shots] [--light] [--no-pixels] [--force]

  <url>           http://, https://, file:// или путь к существующему файлу страницы
                  (C:\\w\\site\\index.html, site\\index.html, /home/u/page.html)
  --out <папка>   куда писать (по умолчанию docs/design)
  --name <имя>    имя файлов (по умолчанию из адреса, как у site-rework: хост без www,
                  порт, путь; порт у localhost, 127.x, [::1], *.localhost, 0.0.0.0 —
                  всегда, у остальных доменов — только явный нестандартный:
                  http://localhost:4177/ → localhost-4177.*, https://www.site.ru/a → site-ru-a.*;
                  файл страницы — «file-» и две последние части пути:
                  C:\\w\\site\\index.html → file-site-index-html.*)
  --no-shots      без файлов снимков (акцент всё равно проверяется снимками коробок кнопок)
  --light         без состояний наведения/фокуса и без тёмной темы
  --no-pixels     не подтверждать акцент пикселями коробок кнопок и ссылок
  --force         перезаписать существующую <имя>.md
  --selftest      самопроверка на стендах fixtures/extract (h1, аккордеон Framer, масштаб Tilda,
                  набор: знаков в строке абзаца и строк h1)
  --help, -h      эта справка

Набор (поле typeset в json, тем же замером строк, что site-rework typeset.mjs): знаков в строке
самого крупного абзаца (bodyMeasure), строк h1 (h1Lines), text-wrap заголовков, hyphens, короткие слова
с неразрывным пробелом; в .md — строка «Набор: …», в токенах — --measure (ширина абзаца / кегль, em).

Переменные: DESIGN_REF_PROJECT / SITE_REWORK_PROJECT — папка с puppeteer-core;
CHROME_PATH — свой браузер; DESIGN_REF_NO_SR=1 — без помощников site-rework.`;
/**
 * Самопроверка на стендах fixtures/extract/*.html: ожидания в <meta name="expect-h1"> («32px 700 …» —
 * размер и вес h1 шкалы; «не снят» — h1 шкалы нет), <meta name="expect-accordion"> (пунктов в паспорте) и
 * <meta name="expect-typeset"> («59 3 balance 3/5 manual 19» — знаков в полной строке абзаца, строк h1, text-wrap,
 * привязано/коротких, hyphens, наибольшая строка h1 в знаках; плюс --measure в tokens.css и строка «Набор» в .md).
 * Код 0 — всё совпало.
 */
async function selftest() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'extract');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
  let bad = 0; const br = await launch();
  try {
    for (const f of files) {
      const html = fs.readFileSync(path.join(dir, f), 'utf8');
      const meta = (n) => { const m = new RegExp(`<meta name="${n}" content="([^"]*)"`).exec(html); return m ? m[1] : null; };
      const data = await extract(pathToFileURL(path.join(dir, f)).href, { browser: br, light: false, pixels: false, source: f });
      const d = data.desktop, h1 = d.scale.h1, from = levelSource(d, 'h1') || '—';
      const eh = meta('expect-h1');
      if (eh) {
        const [size, weight] = eh.split(' ');
        const ok = size === 'не' ? !h1 : !!h1 && h1.fontSize === size && String(h1.fontWeight) === weight;
        if (!ok) bad++;
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${f} h1: ждали ${eh}; снято ${h1 ? `${h1.fontSize}/${h1.fontWeight}` : 'нет'} — ${from}`);
      }
      /* масштаб и Tilda (tilda-zoom.html): основной текст и меню — кегль на экране; служебные шрифты — не в палитре шрифтов */
      const eb = meta('expect-body');
      if (eb) { const b = d.scale.body, ok = !!b && b.fontSize === eb; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${f} основной текст: ждали ${eb}; снято ${b ? `${b.fontSize}/${b.fontWeight} ${b.fontFamily}` : 'нет'}`); }
      const en = meta('expect-nav');
      if (en) {
        const [size, ...rest] = en.split(' '); const how = rest.join(' '); const nv = d.scale.nav, fromN = d.scaleFrom && d.scaleFrom.nav;
        const ok = !!nv && nv.fontSize === size && (!how || (fromN && String(fromN.how || '').includes(how))); if (!ok) bad++;
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${f} меню: ждали ${en}; снято ${nv ? nv.fontSize : 'нет'} — ${levelSource(d, 'nav') || '—'}`);
      }
      const ef = meta('expect-no-font');
      if (ef) { const used = (d.fonts.used || []).map((u) => fam1(u.value)); const hit = ef.split(',').map((x) => x.trim()).filter((x) => used.includes(x)); if (hit.length) bad++; console.log(`${hit.length ? 'FAIL' : 'OK  '} ${f} служебные шрифты вне палитры: ${hit.length ? `попали ${hit.join(', ')}` : `нет (${used.join(', ')})`}${d.tilda ? `; исключено: служебных узлов ${d.tilda.excluded.service}, обрезанных ${d.tilda.excluded.clipped}` : ''}`); }
      const ea = meta('expect-accordion');
      if (ea !== null) {
        const n = d.passport.components.accordion || 0, ok = n === Number(ea);
        if (!ok) bad++;
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${f} аккордеон: ждали ${ea}; в паспорте ${n}${accordionLines(d.passport.accordions).map((l) => '\n       ' + l.slice(2)).join('')}`);
      }
      /* набор (typeset.html): «знаков в полной строке, строк h1, text-wrap h1, привязано/коротких, hyphens» */
      const et = meta('expect-typeset');
      if (et) {
        const [ms, hl, wrap, nb, hy, h1max] = et.split(' '); const t = d.typeset || {}, b = t.body || {}, tok = tokensCss(data), md = skeleton(data, 'selftest');
        const rows = [
          [t.bodyMeasure === Number(ms), `строка абзаца: ждали ${ms} знаков; снято ${t.bodyMeasure} (${b.el || '—'}, строк ${b.lines}: ${(b.chars || []).join(' ')})${/^LINES/.test(t.source || '') ? '' : ' — ' + t.source}`],
          [t.h1Lines === Number(hl) && (!h1max || (t.h1 && Math.max(...t.h1.chars) <= Number(h1max))), `строк h1: ждали ${hl}${h1max ? ` по ≤ ${h1max} знаков (sr-only не в счёт)` : ''}; снято ${t.h1Lines}${t.h1 ? ` (${t.h1.chars.join(' ')})` : ''}`],
          [(t.textWrap || []).includes(wrap) && `${t.shortNb}/${t.shortTotal}` === nb && t.hyphens === hy, `text-wrap ${wrap}, привязано ${nb}, переносы ${hy}; снято ${(t.textWrap || []).join(', ') || '—'}, ${t.shortNb}/${t.shortTotal}, ${t.hyphens}`],
          [b.em > 0 && Math.abs(b.em - b.box / 16) < 0.06 && tok.includes(`  --measure: ${b.em}em;`) && md.includes(`Набор: строка ~${ms} знаков (desktop)`), `--measure: ${b.em}em (блок ${b.box}px / 16px) в tokens.css, строка «Набор: строка ~${ms} знаков» в .md`],
        ];
        for (const [ok, note] of rows) { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${f} ${note}`); }
      }
    }
  } finally { await br.close().catch(() => {}); }
  console.log(`${bad ? 'FAIL' : 'OK'}: стендов ${files.length}, расхождений ${bad}${CLICKS ? '' : ' (site-rework рядом нет — свои аккордеоны не ищутся)'}`);
  return bad ? 1 : 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['no-shots', 'light', 'no-pixels', 'force', 'help', 'h', 'selftest'], optional: ['out', 'name'] });
    if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
    if (opt.selftest) process.exit(await selftest());
    if (!pos[0]) { console.error('Нужен адрес: node extract.mjs <url> [--out docs/design] [--name slug] [--no-shots] (--help — все флаги)'); process.exit(1); }
    for (const k of ['out', 'name']) if (k in opt && (typeof opt[k] !== 'string' || !opt[k].trim())) { console.error(`--${k} без значения: нужно --${k} <${k === 'out' ? 'папка' : 'имя'}>`); process.exit(1); }
    if (opt.name && /[\\/]/.test(opt.name)) { console.error(`--name — имя файлов, а не путь (${opt.name}); папка задаётся --out`); process.exit(1); }
    /* в Windows «:» в имени файла — поток NTFS или ошибка, «*?"<>|» запрещены; точки и пробелы в конце обрезаются */
    if (opt.name && (/[:*?"<>|\x00-\x1f]/.test(opt.name) || /[. ]$/.test(opt.name))) { console.error(`--name ${opt.name}: в имени файлов нельзя «: * ? " < > |» и точку или пробел в конце — например, --name ${String(opt.name).replace(/[:*?"<>|\x00-\x1f]+/g, '-').replace(/[-. ]+$/, '') || 'reference'}`); process.exit(1); }
    /* адрес или путь к файлу — до папок и браузера: «localhost:4177/» без схемы URL читает как схему localhost:,
       а C:\…\page.html — путь: переход по file:///…, «Источник» — строка пути */
    let addr;
    try { addr = pageAddress(pos[0]); } catch (e) { console.error(e.message); process.exit(1); }
    const url = addr.url;
    const out = path.resolve(opt.out || 'docs/design'), slug = opt.name || slugFromUrl(addr.name);
    /* прежние имена (без порта; у файлов — весь путь): файлы под ними в этой папке не подхватятся — сказать заранее */
    const olds = opt.name ? [] : legacySlugs(addr).filter((o) => o !== slug && ['.md', '.json', '.tokens.css', '.ignore'].some((e) => fs.existsSync(path.join(out, o + e))));
    if (olds.length) console.log(`Внимание: в ${out} есть файлы под прежним именем ${olds.map((o) => o + '.*').join(', ')} (до 24.09.2026: без порта у локальных адресов, у файлов страниц — весь путь). Теперь имя ${slug}.* — правленая ${olds[0]}.md не подхватится; нужно старое имя — --name ${olds[0]}.`);
    const shotsDir = opt['no-shots'] ? null : path.join(out, slug + '-shots');
    fs.mkdirSync(shotsDir || out, { recursive: true });
    const data = await extract(url, { shotsDir, light: !!opt.light, pixels: !opt['no-pixels'], source: addr.source });
    fs.writeFileSync(path.join(out, slug + '.json'), JSON.stringify(data, null, 1));
    fs.writeFileSync(path.join(out, slug + '.tokens.css'), tokensCss(data));
    const md = path.join(out, slug + '.md');
    if (fs.existsSync(md) && !opt.force) console.log(`Спецификация ${md} уже есть — не перезаписываю (нужно — добавьте --force).`);
    else fs.writeFileSync(md, skeleton(data, slug));
    for (const l of summaryLines(data)) console.log(l);
    console.log(`Снято: ${out}${path.sep}${slug}.{json,tokens.css,md}` + (shotsDir ? `, снимки в ${shotsDir}` : ''));
  } catch (e) { die(e); }
}
