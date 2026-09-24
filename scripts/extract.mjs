#!/usr/bin/env node
/**
 * Съём дизайн-системы со страницы: палитра, шрифты, шкала, сетка, ритм,
 * форма, структура, движение, состояния, фактура. Замеряется живой DOM, не картинка.
 *
 *   node extract.mjs <url> [--out docs/design] [--name slug] [--no-shots]
 *                          [--light] [--no-pixels] [--force] [--help]
 *
 *   <url>           http://, https://, file:// или путь к файлу страницы:
 *                   C:\w\site\index.html (имя файлов — как раньше, w-site-index-html),
 *                   site\index.html или /home/u/page.html — существующий файл.
 *                   Адрес без схемы (localhost:4177/) — ошибка с подсказкой, до папок.
 *   --out <папка>   куда писать (по умолчанию docs/design)
 *   --name <имя>    имя файлов (по умолчанию из адреса: хост без www, порт, путь;
 *                   порт у localhost, 127.x, [::1], *.localhost, 0.0.0.0 — всегда,
 *                   у остальных — только явный нестандартный: localhost:4177 →
 *                   localhost-4177.*, site.ru:8080 → site-ru-8080.*, site.ru → site-ru.*;
 *                   до 24.09.2026 порт не писался — старые файлы localhost.* не
 *                   подхватываются, extract об этом предупредит; нужно старое — --name)
 *   --no-shots      без снимков (в память снимки окна всё равно делаются —
 *                   ими подтверждается акцент, если не указан --no-pixels)
 *   --light         без состояний наведения/фокуса и без тёмной темы (быстрее)
 *   --no-pixels     не подтверждать акцент по пикселям снимков окна
 *   --force         перезаписать уже существующую <имя>.md
 *
 * На выходе: <slug>.json (сырые замеры), <slug>.tokens.css (переменные),
 * <slug>.md (заготовка спецификации) и снимки в <slug>-shots/.
 *
 * Из кода: extract(url, { shotsDir, light, pixels, browser, source }) — browser:
 * уже запущенный браузер (тогда он не закрывается); source — что писать в
 * «Источник» вместо url (путь к файлу вместо file:///…). Ошибки бросаются, а не
 * завершают процесс: вызывающий (discover.mjs) дописывает свои файлы.
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
 * - акцент — насыщенный цвет, подтверждённый долей пикселей на снимках окна
 *   ≥ 0.2%, иначе «акцента нет»;
 * - шкала body — только собственный видимый текст (без style/script),
 *   кегль ≥ 6px, вес = длина текста, в блоках от 40 знаков; сверяется с самым
 *   крупным абзацем (bodyProbe);
 * - шрифты — по первой гарнитуре стека, стек хранится рядом;
 * - тёмная тема снимается, только если в CSS есть @media (prefers-color-scheme: dark).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR, launch, sleep, parseArgs, slugFromUrl, slugFromUrlOld, pageAddress, die, loadSharp, evaluateWith, gotoRetry,
  scrollPass, segmentPositions, screenAt, fullShot, HEX_SRC, EFF_SRC, SIG_SRC, guardPage, assertAlive,
} from './lib.mjs';

export const VERSION = 'extract 2026-09-24';
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** Доля пикселей снимков окна, с которой насыщенный цвет считается акцентом. */
export const ACCENT_MIN_SHARE = 0.002;
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
    return effOf(el) > 0.05 && !underTex(el);
  });
  const allSet = new Set(all);

  const bg = {}, fg = {}, border = {}, fam = {}, famStack = {}, radius = {}, shadow = {}, bw = {}, space = {}, trans = {}, pairs = {};
  const passport = { textElements: 0, caps: 0, smallCapsTracked: 0, smallText: 0, tracking: {}, radius: [], components: {} };
  const gridInfo = [], containers = {};
  for (const el of all) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), o = effOf(el);
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom + scrollY, docH) - Math.max(r.top + scrollY, 0));
    /* цвет под картинкой-заливкой не виден */
    const covered = /url\(/.test(s.backgroundImage) && (/^(repeat|round|space)$/.test(s.backgroundRepeat) || s.backgroundSize === 'cover');
    if (!covered) bump(bg, hex(s.backgroundColor), w * h * o);
    const t = ownText(el), fs = parseFloat(s.fontSize);
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
      const ls = s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing) / fs;
      const caps = s.textTransform === 'uppercase' || (/[A-ZА-ЯЁ]{3}/.test(t) && t === t.toUpperCase());
      if (Math.abs(ls) >= 0.02) bump(passport.tracking, Math.round(ls * 100) / 100 + 'em');
      if (caps) passport.caps++;
      if (caps && fs <= 13 && ls >= 0.05) passport.smallCapsTracked++;
      if (fs < 12) passport.smallText++;
    }
    const bt = px(s.borderTopWidth), bb = px(s.borderBottomWidth);
    if (bt > 0 || bb > 0) { bump(border, bt > 0 ? hex(s.borderTopColor) : hex(s.borderBottomColor), o); bump(bw, Math.max(bt, bb) + 'px'); }
    if (s.borderTopLeftRadius !== '0px') bump(radius, s.borderTopLeftRadius);
    if (s.boxShadow !== 'none') bump(shadow, s.boxShadow);
    for (const k of ['paddingTop', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
      const v = px(s[k]); if (v >= 4 && v <= 320) bump(space, v);
    }
    if (s.display.includes('grid')) {
      const cols = s.gridTemplateColumns.split(' ').filter((x) => x && x !== 'none').length;
      if (cols > 1) gridInfo.push({ el: sig(el), columns: cols, gap: s.columnGap, rowGap: s.rowGap, width: Math.round(r.width) });
    } else if (s.display.includes('flex') && s.flexDirection.startsWith('row') && el.children.length > 1 && r.width > vw * 0.5) {
      gridInfo.push({ el: sig(el), flexItems: el.children.length, gap: s.columnGap, width: Math.round(r.width) });
    }
    const left = Math.round(r.left), right = Math.round(vw - r.right);
    if (r.width > 320 && r.width < vw - 8 && Math.abs(left - right) <= 2 && left > 0 && r.height > 80) bump(containers, Math.round(r.width));
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

  /* типографская шкала: стиль берётся у элемента, который несёт больше всего собственного текста */
  const keyOf = (s) => JSON.stringify({ fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight === 'normal' ? 'normal' : Math.round(parseFloat(s.lineHeight) / parseFloat(s.fontSize) * 100) / 100, letterSpacing: s.letterSpacing === 'normal' ? '0' : Math.round(parseFloat(s.letterSpacing) / parseFloat(s.fontSize) * 1000) / 1000 + 'em', fontFamily: fam1(s.fontFamily), textTransform: s.textTransform });
  const carrier = (el) => {
    const cnt = new Map(); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const p = n.parentElement; if (!p || SKIP.test(p.tagName)) continue; const l = n.textContent.trim().length; if (l) cnt.set(p, (cnt.get(p) || 0) + l); }
    let best = null, bl = 0;
    for (const [p, l] of cnt) if (l > bl && effOf(p) > 0.05 && parseFloat(getComputedStyle(p).fontSize) >= 6) { best = p; bl = l; }
    return best;
  };
  const levels = { h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', body: null, small: 'small, figcaption, .caption, label', button: 'button, .btn, .button, a[class*="btn"], a[class*="button"]', nav: 'nav a, header a' };
  const scale = {};
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
    const k = keyOf(s); bump(bodyVotes, k, t);
    const bk = blockKeys.get(b) || {}; bump(bk, k, t); blockKeys.set(b, bk);
  }
  if (!Object.keys(bodyVotes).length) {
    /* длинных блоков нет — как раньше, по p и li, но собственным текстом */
    for (const el of document.querySelectorAll('p, li')) { if (!allSet.has(el)) continue; const s = getComputedStyle(el); const t = ownText(el).length; if (t && parseFloat(s.fontSize) >= 6) bump(bodyVotes, keyOf(s), t); }
  }
  let bodyProbe = null;
  for (const [b, keys] of blockKeys) { const L = blockLen.get(b); if (!bodyProbe || L > bodyProbe.chars) bodyProbe = { el: sig(b), chars: L, key: topKey(keys) }; }
  if (bodyProbe) { const { key, ...rest } = bodyProbe; bodyProbe = { ...rest, ...JSON.parse(key) }; }
  for (const [name, sel] of Object.entries(levels)) {
    let votes = bodyVotes;
    if (sel) {
      votes = {};
      for (const el of document.querySelectorAll(sel)) { if (!allSet.has(el)) continue; const p = carrier(el); if (p) bump(votes, keyOf(getComputedStyle(p)), 1); }
    }
    const best = top(votes, 1)[0]; if (best) scale[name] = JSON.parse(best.value);
  }

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
    scale, bodyProbe, containers: top(containers, 5), grids: gridInfo.slice(0, 25),
    spacing: top(space, 16), shape: { radius: top(radius, 6), shadow: top(shadow, 4), borderWidth: top(bw, 4) },
    sections, texture, passport,
    colorScheme: { darkMedia, lightDark, root: htmlS.colorScheme || 'normal', meta: metaScheme || null, unreadableSheets, unreadable },
    motion: { libs, scriptHints, transitions: top(trans, 10), running, keyframes: keyframes.slice(0, 30), sticky, reducedMotion },
  };
}

async function revealAfter(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-dref-reveal]')].map((el) => { const s = getComputedStyle(el); return { i: +el.getAttribute('data-dref-reveal'), opacity: s.opacity, transform: s.transform }; }));
}

/* ---------- состояния: наведение и фокус ---------- */
const STATE_PROPS = ['color', 'backgroundColor', 'borderTopColor', 'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'outlineStyle', 'outlineColor', 'outlineWidth', 'outlineOffset', 'filter', 'letterSpacing'];
async function states(page) {
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  const handles = await page.$$('a, button, input, [role="button"], summary');
  const seen = new Set(); const out = [];
  const DEPS = { eff: EFF_SRC };
  for (const h of handles) {
    if (out.length >= 14) break;
    /* спрятанные (ссылка-пропуск за краем, прозрачный контейнер) не наводим */
    const info = await h.evaluate(new Function('el', `const eff = ${DEPS.eff}; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { sig: el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 3).join('.'), ok: r.width > 8 && r.height > 8 && r.right > 0 && r.left < innerWidth && r.bottom + scrollY > 0 && s.visibility !== 'hidden' && eff(el) > 0.05, transition: s.transitionProperty + ' ' + s.transitionDuration + ' ' + s.transitionTimingFunction };`)).catch(() => ({ ok: false }));
    if (!info.ok || seen.has(info.sig)) continue; seen.add(info.sig);
    const read = () => h.evaluate((el, props) => { const s = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, s[p]])); }, STATE_PROPS);
    try {
      await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.mouse.move(0, 0); await sleep(120);
      const base = await read();
      await h.hover(); await sleep(650);
      const hov = await read();
      await page.mouse.move(0, 0); await sleep(200);
      await h.focus(); await sleep(250);
      const foc = await read();
      await h.evaluate((el) => el.blur());
      const diff = (a, b) => Object.fromEntries(Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => [k, { from: a[k], to: b[k] }]));
      out.push({ el: info.sig, transition: info.transition, hover: diff(base, hov), focus: diff(base, foc) });
    } catch { /* элемент ушёл со страницы или перекрыт — пропускаем */ }
  }
  return out;
}

/* ---------- пиксели снимков: сколько на экране каждого цвета-кандидата ---------- */

/**
 * В странице: где на экране CSS ставит каждый цвет-кандидат — прямоугольники
 * (в пикселях окна) видимых элементов с таким фоном, цветом собственного текста
 * или рамкой. Слои фактуры и невидимое (итоговая прозрачность ≤ 0.05) не в счёт.
 * Пиксели считаются только внутри них: жёлтый баннер на фотографии — не акцент
 * интерфейса, а цвет, который в CSS есть, но на экране закрыт, — не виден.
 */
function colorRects(values) {
  const vw = innerWidth, vh = innerHeight;
  const want = new Map(values.map((v, i) => [v, i]));
  const out = values.map(() => []);
  const own = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; };
  for (const el of document.body.querySelectorAll('*')) {
    if (/^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE)$/i.test(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    const s = getComputedStyle(el);
    const hits = new Set();
    const b = hex(s.backgroundColor); if (b && want.has(b)) hits.add(want.get(b));
    const c = hex(s.color); if (c && want.has(c) && own(el)) hits.add(want.get(c));
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s['border' + side + 'Width']) > 0) { const x = hex(s['border' + side + 'Color']); if (x && want.has(x)) hits.add(want.get(x)); }
    if (!hits.size || el.closest('[data-dref-tex]') || !(eff(el) > 0.05)) continue;
    const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom);
    for (const k of hits) if (out[k].length < 800) out[k].push([x0, y0, x1 - x0, y1 - y0]);
  }
  return out;
}

/**
 * Снимок окна → сколько пикселей каждого кандидата: всего на снимке и внутри
 * его прямоугольников (rects[k], пиксели окна; scale — сколько пикселей
 * снимка в пикселе окна). acc копит суммы по всем снимкам.
 */
async function countPixels(sharp, buf, targets, rects, dpr, acc) {
  let img = sharp(buf); const meta = await img.metadata();
  let scale = dpr || 1;
  if (meta.width > 1600) { img = img.resize({ width: Math.round(meta.width / 2), kernel: 'nearest' }); scale /= 2; }
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H, t2 = PIXEL_TOLERANCE * PIXEL_TOLERANCE;
  acc.pixels += N;
  const mask = new Uint8Array(N);
  for (let k = 0; k < targets.length; k++) {
    mask.fill(0);
    for (const [x, y, w, h] of rects[k] || []) {
      const X0 = Math.max(0, Math.floor(x * scale)), X1 = Math.min(W, Math.ceil((x + w) * scale));
      const Y0 = Math.max(0, Math.floor(y * scale)), Y1 = Math.min(H, Math.ceil((y + h) * scale));
      if (X1 > X0) for (let row = Y0; row < Y1; row++) mask.fill(1, row * W + X0, row * W + X1);
    }
    const T = targets[k].rgb; let all = 0, ui = 0;
    for (let p = 0, i = 0; p < N; p++, i += 3) {
      const dr = data[i] - T[0], dg = data[i + 1] - T[1], db = data[i + 2] - T[2];
      if (dr * dr + dg * dg + db * db <= t2) { all++; if (mask[p]) ui++; }
    }
    acc.all[k] += all; acc.ui[k] += ui;
    if (ui / N > acc.maxShot[k]) acc.maxShot[k] = ui / N;
  }
}

/* ---------- один проход по странице ---------- */
const DEPS = { hex: HEX_SRC, eff: EFF_SRC, sig: SIG_SRC, layer: layerBg.toString() };
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

async function measure(browser, url, viewport, { shotsDir, tag, withStates, scheme = 'light', pixels = false, readCss = false }) {
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
    const data = await evaluateWith(page, inPage, null, DEPS);
    data.motion.scrollReveal = revealBefore.map((b, i) => { const a = after.find((x) => x.i === i); return a && (a.opacity !== b.opacity || a.transform !== b.transform) ? { ...b, becomes: { opacity: a.opacity, transform: a.transform } } : null; }).filter(Boolean).slice(0, 20);
    data.scroll = { steps: pass.screens, pageHeight: pass.pageHeight, maxScrollY: pass.maxScrollY, reachedBottom: pass.reachedBottom, stuck: !!pass.stuck };
    data.tool = { goto: gotoInfo };
    if (readCss) {
      page.off('response', onResp);
      /* читаемые таблицы CSSOM уже проверил — значит, найденное в тексте пришло из нечитаемой */
      if (!data.colorScheme.darkMedia && data.colorScheme.unreadableSheets) {
        for (const c of cssTexts) if (DARK_TEXT.test(await c.text)) { data.colorScheme.darkMedia = true; data.colorScheme.darkFrom = 'css-text'; data.colorScheme.darkSheet = c.url.slice(0, 200); break; }
      }
    }
    /* проход 2: снимки окна равномерно по высоте — в файлы и для проверки акцента по пикселям */
    const targets = pixels ? accentPool(data).slice(0, 6).map((c) => ({ value: c.value, rgb: rgb(c.seen) })) : [];
    const sharp = targets.length ? loadSharp() : null;
    if (shotsDir || sharp) {
      const ys = segmentPositions(data.pageHeight, viewport.height, { maxShots: shotsDir ? 10 : 8 });
      const acc = { pixels: 0, all: targets.map(() => 0), ui: targets.map(() => 0), maxShot: targets.map(() => 0) };
      for (let k = 0; k < ys.length; k++) {
        const s = await screenAt(page, ys[k]);
        if (shotsDir) fs.writeFileSync(path.join(shotsDir, `${tag}-scroll-${String(k).padStart(2, '0')}.png`), s.buffer);
        if (sharp) {
          const rects = await evaluateWith(page, colorRects, targets.map((t) => t.value), DEPS);
          await countPixels(sharp, s.buffer, targets, rects, viewport.deviceScaleFactor || 1, acc);
        }
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(300);
      if (pixels) {
        data.palette.pixelCheck = targets.length && !sharp
          ? { error: 'нет sharp — акцент не проверен по снимкам', shots: ys.length }
          : {
            shots: ys.length, pixels: acc.pixels, tolerance: PIXEL_TOLERANCE, min: ACCENT_MIN_SHARE,
            /* share — доля пикселей всех снимков окна, где цвет стоит на своём месте (фон, текст или рамка элемента с этим цветом) */
            share: Object.fromEntries(targets.map((t, k) => [t.value, acc.pixels ? r6(acc.ui[k] / acc.pixels) : 0])),
            /* shareAll — тот же цвет где угодно на снимке, в том числе на фотографиях; maxShot — наибольшая доля на одном снимке */
            shareAll: Object.fromEntries(targets.map((t, k) => [t.value, acc.pixels ? r6(acc.all[k] / acc.pixels) : 0])),
            maxShot: Object.fromEntries(targets.map((t, k) => [t.value, r6(acc.maxShot[k])])),
          };
      }
    } else if (pixels) data.palette.pixelCheck = targets.length ? { error: 'нет sharp — акцент не проверен по снимкам', shots: 0 } : { shots: 0, pixels: 0, tolerance: PIXEL_TOLERANCE, min: ACCENT_MIN_SHARE, share: {} };
    if (shotsDir) data.fullShot = await fullShot(page, path.join(shotsDir, `${tag}-full.png`));
    if (withStates) data.states = await states(page);
    return data;
  } finally { page.off('response', onResp); await page.close().catch(() => {}); }
}

/**
 * Снять дизайн-систему. shotsDir — папка снимков или null; light — без состояний
 * и тёмной темы; pixels — подтверждать акцент по снимкам окна; browser — уже
 * запущенный браузер (не закрывается); source — что писать в «Источник» (по
 * умолчанию url).
 */
export async function extract(url, { shotsDir = null, light = false, pixels = true, browser = null, source = null } = {}) {
  const own = !browser;
  const br = browser || await launch();
  try {
    if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
    const desktop = await measure(br, url, DESKTOP, { shotsDir, tag: 'desktop', withStates: !light, pixels, readCss: !light });
    const mobile = await measure(br, url, MOBILE, { shotsDir, tag: 'mobile', withStates: false });
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
        mutedWhy = gray ? `${gray.value} на ${bgC} — контраст ${contrast(gray.value, bgC).toFixed(1)} < 3` : 'серого между текстом и фоном нет';
      }
    } else mutedWhy = 'нет текста с контрастом ≥ 3';
    out[name] = { bg: bgC, text: textC ? textC.value : null, muted: muted ? muted.value : null, weight, share: Math.round(weight / total * 100) / 100, mutedWhy };
  }
  return out.dark || out.light ? out : null;
}

/** Насыщенные цвета — кандидаты в акцент, по убыванию насыщенность × log(вес). c.seen — цвет на фоне страницы. */
export function accentPool(d) {
  const background = d.page.background.slice(0, 7);
  const see = (list) => (list || []).map((c) => ({ ...c, seen: flat(c.value, background) }));
  const pool = [...see(d.palette.backgrounds), ...see(d.palette.text), ...see(d.palette.borders)].filter((c) => sat(c.seen) > 0.4 && dist(c.seen, background) > 60);
  pool.sort((a, b) => sat(b.seen) * Math.log(b.weight + 2) - sat(a.seen) * Math.log(a.weight + 2));
  const uniq = []; for (const c of pool) if (!uniq.some((u) => u.value === c.value)) uniq.push(c);
  return uniq;
}

/**
 * Акцент: { value, status, share, note, candidates }. status: 'подтверждён'
 * (≥ 0.2% пикселей снимков окна), 'нет' (насыщенных цветов нет или ни один не
 * виден на снимках), 'не проверен' (снимков не было — старый json, --no-pixels, нет sharp).
 */
export function accentInfo(d) {
  const pool = accentPool(d);
  const pc = d.palette.pixelCheck;
  if (!pool.length) return { value: null, status: 'нет', note: 'насыщенных цветов в палитре нет' };
  if (!pc || pc.error || !pc.share) return { value: pool[0].value, status: 'не проверен', note: pc && pc.error ? pc.error : 'снимками окна не проверялся', candidates: pool.slice(0, 6).map((c) => ({ value: c.value })) };
  const min = pc.min || ACCENT_MIN_SHARE;
  const cand = pool.slice(0, 6).map((c) => ({ value: c.value, share: pc.share[c.value], shareAll: pc.shareAll ? pc.shareAll[c.value] : undefined }));
  const ok = cand.find((c) => c.share != null && c.share >= min);
  if (ok) return { value: ok.value, status: 'подтверждён', share: ok.share, note: `${pct(ok.share)} пикселей снимков окна`, candidates: cand };
  const onPhotos = cand.filter((c) => c.shareAll != null && c.shareAll >= min && !(c.share >= min));
  const list = cand.slice(0, 3).map((c) => `${c.value} (${c.share == null ? '—' : pct(c.share)}${c.shareAll != null && c.shareAll > (c.share || 0) * 2 && c.shareAll >= 0.0001 ? `, на снимке всего ${pct(c.shareAll)}` : ''})`).join(', ');
  return { value: null, status: 'нет', note: `в CSS есть ${list}, на своих местах на снимках окна меньше ${pct(min)} — акцента нет${onPhotos.length ? `; ${onPhotos.map((c) => c.value).join(', ')} видно только вне элементов с этим цветом (фото, картинки)` : ''}`, candidates: cand };
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
  ];
}

/** Строка про тёмную тему системы для спецификации и сводки. */
function darkLine(data) {
  const dk = data.dark;
  if (!dk) return data.darkReason || 'не снималась';
  const t = dk.themes && mainTheme(dk.themes, (dk.page.background || '#FFFFFF').slice(0, 7));
  return `${dk.differs ? 'есть' : 'объявлена, но фон и текст страницы не меняются'} (${dk.source}): фон ${dk.page.background}, текст ${dk.page.color}${t && t.muted ? ', приглушённый ' + t.muted : ''}`;
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
Сырые замеры: \`${slug}.json\` · переменные: \`${slug}.tokens.css\` · снимки: \`${slug}-shots/\`

> Заготовка собрана скриптом. Цифры — замеры. Роли цветов, разделы «Приём»
> и «Что берём себе» — дописать руками, посмотрев снимки.

## 1. Палитра
${Object.entries(r).map(roleLine).join('\n')}
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

Сверка основного текста: ${bc ? (bc.ok ? 'совпадает — ' : '**расходится, проверить глазами** — ') + bc.note : 'длинных абзацев нет'}${bcm && !bcm.ok ? `\nНа узком: **расходится** — ${bcm.note}` : ''}

## 4. Сетка
- ширина контента: ${d.containers.map((c) => c.value + 'px').join(', ') || 'не выявлено'}
- узкий экран, ширина контента: ${m.containers.map((c) => c.value + 'px').join(', ') || 'не выявлено'}
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
  for (const [b, label] of [[bc, 'широкий'], [bcm, 'узкий']]) if (b) out.push(`${b.ok ? 'OK  ' : 'WARN'} основной текст (${label}): ${b.note}`);
  if (m.scale.body && parseFloat(m.scale.body.fontSize) < 6) out.push(`FAIL основной текст на узком экране ${m.scale.body.fontSize}`);
  out.push(`OK   фактура: ${(d.texture || []).length ? d.texture.map((t) => `${t.el} ${t.opacity}/${t.blend}`).join('; ') : 'полноэкранных слоёв нет'}`);
  out.push(`OK   тёмная тема: ${darkLine(data)}`);
  if (!data.tool || !data.tool.siteRework) out.push('WARN site-rework рядом нет — запасной путь: без ожидания картинок на снимках, прозрачность без теневого DOM');
  return out;
}

/* ---------- запуск из командной строки ---------- */
const HELP = `Съём дизайн-системы со страницы.

  node extract.mjs <url> [--out docs/design] [--name slug] [--no-shots] [--light] [--no-pixels] [--force]

  <url>           http://, https://, file:// или путь к существующему файлу страницы
                  (C:\\w\\site\\index.html, site\\index.html, /home/u/page.html)
  --out <папка>   куда писать (по умолчанию docs/design)
  --name <имя>    имя файлов (по умолчанию из адреса: хост без www, порт, путь;
                  порт у localhost, 127.x, [::1], *.localhost, 0.0.0.0 — всегда,
                  у остальных доменов — только явный нестандартный:
                  http://localhost:4177/ → localhost-4177.*, https://www.site.ru/a → site-ru-a.*)
  --no-shots      без файлов снимков (акцент всё равно проверяется снимками в памяти)
  --light         без состояний наведения/фокуса и без тёмной темы
  --no-pixels     не подтверждать акцент по пикселям снимков окна
  --force         перезаписать существующую <имя>.md
  --help, -h      эта справка

Переменные: DESIGN_REF_PROJECT / SITE_REWORK_PROJECT — папка с puppeteer-core;
CHROME_PATH — свой браузер; DESIGN_REF_NO_SR=1 — без помощников site-rework.`;
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['no-shots', 'light', 'no-pixels', 'force', 'help', 'h'] });
    if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
    if (!pos[0]) { console.error('Нужен адрес: node extract.mjs <url> [--out docs/design] [--name slug] [--no-shots] (--help — все флаги)'); process.exit(1); }
    for (const k of ['out', 'name']) if (k in opt && (typeof opt[k] !== 'string' || !opt[k].trim())) { console.error(`--${k} без значения: нужно --${k} <${k === 'out' ? 'папка' : 'имя'}>`); process.exit(1); }
    if (opt.name && /[\\/]/.test(opt.name)) { console.error(`--name — имя файлов, а не путь (${opt.name}); папка задаётся --out`); process.exit(1); }
    /* адрес или путь к файлу — до папок и браузера: «localhost:4177/» без схемы URL читает как схему localhost:,
       а C:\…\page.html (как до 24.09.2026) — путь: переход по file:///…, имя и «Источник» по строке пути */
    let addr;
    try { addr = pageAddress(pos[0]); } catch (e) { console.error(e.message); process.exit(1); }
    const url = addr.url;
    const out = path.resolve(opt.out || 'docs/design'), slug = opt.name || slugFromUrl(addr.name);
    /* имя без порта до 24.09.2026: файлы под старым именем в этой папке не подхватятся — сказать заранее */
    const old = opt.name ? null : slugFromUrlOld(addr.name);
    if (old && old !== slug && ['.md', '.json'].some((e) => fs.existsSync(path.join(out, old + e)))) console.log(`Внимание: в ${out} есть файлы под прежним именем ${old}.* (без порта). Теперь имя ${slug}.* — правленая ${old}.md не подхватится; нужно старое имя — --name ${old}.`);
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
