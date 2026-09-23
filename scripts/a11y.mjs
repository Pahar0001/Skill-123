#!/usr/bin/env node
/**
 * Доступность: то, что можно проверить в живом DOM без чтения экрана.
 *
 *   node a11y.mjs <url> [--viewport desktop] [--out папка] [--tag имя] [--no-grain]
 *   node a11y.mjs --help
 *
 * Флаги:
 *   --viewport  экран: пресет (desktop, laptop, tablet, mobile, mobile-s, android), запись ШxВ@плотность
 *               («320x568@2») или одна ширина; по умолчанию desktop.
 *   --out       папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/a11y/<tag>.json.
 *   --tag       имя файла итога (по умолчанию имя экрана).
 *   --no-grain  не учитывать слой зерна поверх текста в контрасте (см. ниже).
 *   --help      эта справка.
 * Код выхода: 0 — проверка сделана (вердикт в выводе и в JSON), 1 — неверные аргументы.
 *
 * Проверяется: контраст текста к фактическому фону (WCAG AA: 4.5:1, крупный
 * текст 3:1) — по вычисленным цветам, а на картинках, градиентах и чужих подложках по снимку
 * фона за текстом (худшие 10% пикселей). Чужая подложка — блок с фоном, который лежит под центром
 * текста, но не его предок (фигура под текстом в Tilda Zero Block, плашка плавающего меню), или
 * предок с фоном, чья коробка под текстом не лежит (текст вынесен fixed/absolute).
 * Ещё: мелкий текст; картинки без alt, поля без подписи, кнопки и ссылки без имени,
 * порядок заголовков, число h1, lang, запрет масштабирования, положительный tabindex,
 * видимость фокуса при обходе клавишей Tab, размер целей нажатия на телефоне (24 px),
 * правило prefers-reduced-motion в стилях, автоплей видео.
 *
 * Прокрутка. Сначала страница проходится целиком (lib.scrollThrough, прокрутка мгновенная —
 * forceInstantScroll): иначе при html{scroll-behavior:smooth} страница не доезжала, блоки
 * появления оставались скрытыми (на стенде было 2 из 21) и в проверку попадала часть текста и
 * заголовков. В выводе — сколько блоков с текстом было скрыто до прокрутки и сколько показано после.
 *
 * Контраст с прозрачностью. Цвет текста с альфой (rgba) и opacity самого элемента и предков
 * смешиваются с фоном так, как их складывает браузер (группы прозрачности по цепочке предков),
 * а не отбрасываются: раньше такой текст молча пропускался или считался непрозрачным
 * (белый с opacity .25 на чёрном проходил как 21:1). Цвета любых записей (oklch, color-mix…)
 * переводятся в sRGB через HEX_FN из lib.mjs.
 *
 * Зерно поверх текста. Полноэкранный закреплённый слой фактуры (texture.mjs → findTextureLayers,
 * слой во весь экран с position:fixed, z-index не отрицательный) меняет и цвет текста, и фон.
 * Действие слоя меряется по снимкам: всё, кроме слоя, прячется, под слоем по очереди чёрный,
 * серый 128 и белый фон; средний цвет снимка даёт отображение канала c → c' (кусочно-линейное
 * по трём точкам: для normal это c' = c(1−α) + α·среднее плитки, для multiply и screen тоже
 * точно, для overlay и soft-light — приближение). Каждая пара «текст/фон» пересчитывается с
 * этим отображением; пары, которые без зерна проходят норму, а с зерном нет, — FAIL
 * «контраст с учётом зерна»; пары в пределах 10 % над нормой перечисляются. Для текста на
 * картинке снимок фона уже содержит слой: отображение применяется только к цвету текста.
 *
 * Мелкий текст: видимый текст кеглем меньше 12 px — WARN, меньше 10 px — FAIL (подписи вроде
 * «не обязательно» 9 px читать трудно, особенно на телефоне). Скрытый для глаз текст
 * (sr-only: коробка 1–2 px или clip) не в счёт.
 *
 * Фокус. Обход клавишей Tab идёт на СВЕЖЕЙ странице — отдельная вкладка, без прокруток и кликов:
 * после проверок контраста фокус оставался в нижней панели, обход проходил 1 элемент и писал OK
 * (связка blur()+scrollTo+body.focus() старт не сбрасывает, сбрасывает только загрузка). Если
 * обошли меньше min(5, число фокусируемых) — WARN «обход не состоялся», а не OK.
 *
 * Не заменяет Lighthouse и не проверяет чтение экраном — это дополнение,
 * которое работает на любом адресе и даёт список конкретных элементов.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  launch, openPage, resolveViewport, parseArgs, runDir, writeJson, sleep, ensureDir, loadSharp,
  forceInstantScroll, scrollThrough, scrollToY, settleAnimations, evaluateWith,
  SIG_FN, EFFECTIVE_OPACITY_FN, VISIBLE_FN, HEX_FN,
} from './lib.mjs';
import { findTextureLayers } from './texture.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'no-grain'], values: ['viewport', 'out', 'tag'] });
if (opt.help) { console.log(HELP); process.exit(0); }
if (!pos[0]) { console.error('Нужен адрес: node a11y.mjs <url> [--viewport mobile]  (подробно: --help)'); process.exit(1); }
const url = pos[0];
const [vpName, vp] = resolveViewport(opt.viewport || 'desktop') || [];
if (!vp) { console.error(`Неизвестный экран ${opt.viewport}`); process.exit(1); }
const run = runDir(opt, url); const outDir = ensureDir(path.join(run, 'a11y'));
const tag = opt.tag || vpName;
const sharp = loadSharp();
const DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN, vis: VISIBLE_FN, hexc: HEX_FN };

/* ---------- функции страницы (свободные переменные sig, eff, vis, hexc — из lib.mjs) ---------- */

/* блоки с текстом, скрытые до прокрутки (своя opacity ≈ 0): метка data-rw-hid, только внешние */
function markHiddenInPage() {
  let n = 0;
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    const s = getComputedStyle(el); if (s.display === 'none' || parseFloat(s.opacity) > 0.05) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || !(el.textContent || '').trim()) continue;
    if (el.parentElement && el.parentElement.closest('[data-rw-hid]')) continue;
    el.setAttribute('data-rw-hid', ''); n++;
  }
  return n;
}
function revealInPage() {
  const els = [...document.querySelectorAll('[data-rw-hid]')];
  const shown = els.filter((el) => parseFloat(getComputedStyle(el).opacity) > 0.5);
  return { hidden: els.length, shown: shown.length, still: els.filter((el) => !shown.includes(el)).map((el) => sig(el)).slice(0, 8) };
}

function domInPage({ isMobile, map }) {
  const V = (el) => vis(el);
  const parseC = (css) => { const h = hexc(css); if (!h) return null; return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: h.length > 7 ? parseInt(h.slice(7, 9), 16) / 255 : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  /* действие слоя зерна: канал c → c' по трём точкам (0, 128, 255) */
  const f1 = (pts, c) => (c <= 128 ? pts[0] + (pts[1] - pts[0]) * c / 128 : pts[1] + (pts[2] - pts[1]) * (c - 128) / 127);
  const grain = (c) => (map ? { r: f1(map[0], c.r), g: f1(map[1], c.g), b: f1(map[2], c.b) } : c);
  /* сложение слоёв как в браузере: цвета с предумноженной альфой, opacity — группа */
  const P = (c) => (c ? { r: c.r * c.a, g: c.g * c.a, b: c.b * c.a, a: c.a } : { r: 0, g: 0, b: 0, a: 0 });
  const over = (t, b) => ({ r: t.r + b.r * (1 - t.a), g: t.g + b.g * (1 - t.a), b: t.b + b.b * (1 - t.a), a: t.a + b.a * (1 - t.a) });
  const mul = (c, o) => ({ r: c.r * o, g: c.g * o, b: c.b * o, a: c.a * o });
  const opOf = (s) => { if (s.display === 'contents') return 1; let o = parseFloat(s.opacity); const m = s.filter && s.filter !== 'none' ? s.filter.match(/opacity\(([\d.]+)(%?)\)/) : null; if (m) o *= m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]); return o; };
  const canvasBg = /dark/.test(getComputedStyle(document.documentElement).colorScheme || '') && !/light/.test(getComputedStyle(document.documentElement).colorScheme || '') ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  /* итоговые цвета текста и фона под ним; null — на пути картинка или градиент (тогда по снимку) */
  const colorsOf = (el) => {
    const chain = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    const st = chain.map((n) => getComputedStyle(n)); const ops = st.map(opOf);
    const rest = new Array(chain.length + 1).fill(1); for (let i = chain.length - 1; i >= 0; i--) rest[i] = rest[i + 1] * ops[i];
    const fill = st[0].webkitTextFillColor; const fg = parseC(fill && fill !== st[0].color ? fill : st[0].color);
    if (!fg) return { transparentText: true };
    let X = P(fg), Y = P(null); let bgNode = null;
    for (let i = 0; i < chain.length; i++) {
      if (i > 0 && X.a >= 0.999 && Y.a >= 0.999 && rest[i] >= 0.999) break;
      if (st[i].backgroundImage && st[i].backgroundImage !== 'none') return { imageBg: true, fg, alpha: fg.a * rest[0] };
      const bg = P(parseC(st[i].backgroundColor)); X = over(X, bg); Y = over(Y, bg);
      if (!bgNode && Y.a >= 0.999) bgNode = chain[i];
      if (ops[i] < 1) { X = mul(X, ops[i]); Y = mul(Y, ops[i]); }
    }
    /* фон дал предок, но под текстом его нет (текст вынесен fixed/absolute за его коробку) — по снимку */
    if (bgNode && bgNode !== document.documentElement && bgNode !== document.body) {
      const a = el.getBoundingClientRect(), b = bgNode.getBoundingClientRect(); const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
      if (cx < b.left - 1 || cx > b.right + 1 || cy < b.top - 1 || cy > b.bottom + 1) return { imageBg: true, displaced: true, fg, alpha: fg.a * rest[0] };
    }
    X = over(X, canvasBg); Y = over(Y, canvasBg);
    return { fg: { r: X.r, g: X.g, b: X.b }, bg: { r: Y.r, g: Y.g, b: Y.b }, raw: fg, alpha: fg.a, opacity: rest[0] };
  };
  const contrast = { checked: 0, translucent: 0, unknown: 0, transparentText: 0, failures: {}, imgList: [], grain: map ? { checked: 0, failures: {}, near: {} } : null };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  const allText = [...document.body.querySelectorAll('*')].filter((el) => !(el instanceof SVGElement) && ownText(el) && V(el));
  const textEls = allText.slice(0, 600);
  /* картинки, лежащие не в предках текста, а рядом (карточка: фото и подпись поверх — соседи):
     если такой элемент накрывает центр текста, фон надо мерить по снимку, а не по цвету секции */
  /* Чужие подложки: картинки, видео, холсты и блоки с фоном (цвет или картинка), которые не предки и
     не потомки текста, но лежат под его центром — карточка «фото и подпись поверх» или фигура под
     текстом в Tilda Zero Block (соседи, а не предки). Тогда фон по цепочке предков неверен — по снимку.
     Слой зерна во весь экран (data-rw-grain) не в счёт: его действие учтено отображением map.
     Закреплённые (fixed) сравниваются только с закреплённым текстом: у них другие координаты. */
  const fixedOf = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; };
  const imgLike = [...document.body.querySelectorAll('*')].filter((e) => {
    if ((map && e.hasAttribute('data-rw-grain')) || e instanceof SVGElement || !V(e)) return false;
    if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(e.tagName)) return true;
    const s = getComputedStyle(e); const bi = s.backgroundImage;
    if (bi && bi !== 'none' && !/^linear-gradient\(rgba\(0, 0, 0, 0\)/.test(bi)) return true;
    const c = parseC(s.backgroundColor); return !!(c && c.a > 0.05);
  }).map((e) => { const r = e.getBoundingClientRect(); const fx = fixedOf(e); const oy = fx ? 0 : scrollY; return { e, fx, l: r.left, t: r.top + oy, r: r.right, b: r.bottom + oy }; });
  const coveredByImage = (el) => { const r = el.getBoundingClientRect(); const fx = fixedOf(el); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2 + (fx ? 0 : scrollY); const hit = imgLike.filter((i) => i.fx === fx && i.e !== el && !i.e.contains(el) && !el.contains(i.e) && cx >= i.l && cx <= i.r && cy >= i.t && cy <= i.b); return hit.length ? hit.map((i) => sig(i.e)).join('+') : null; };
  const r2 = (v) => Math.round(v * 100) / 100;
  const add = (bucket, key, rec, example) => { const f = bucket[key] || (bucket[key] = { ...rec, count: 0, examples: [] }); f.count++; if (f.examples.length < 3) f.examples.push(example); };
  for (const el of textEls) {
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize); const large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700); const need = large ? 3 : 4.5;
    let c = colorsOf(el);
    if (c.transparentText) { contrast.transparentText++; continue; }
    const under = coveredByImage(el);
    if (!c.imageBg && under) c = { imageBg: true, fg: c.raw, alpha: c.alpha * c.opacity };
    const label = `${sig(el)} «${el.textContent.trim().slice(0, 30)}» ${Math.round(size)}px`;
    if (c.imageBg) {
      contrast.unknown++;
      /* по снимку — до 60 элементов, но не больше трёх одинаковых (по тегу и классам): сто карточек одного вида не нужны */
      /* ключ ограничения «не больше трёх одинаковых»: подпись без id (у карточек он у каждой свой) и то,
         что лежит под текстом (пункт меню на плашке и такой же на плашке поверх фото — разные случаи) */
      const key = sig(el).replace(/#[^.]*/, '') + '|' + hex(c.fg) + '|' + (under || (c.displaced ? 'вынесен' : '')); contrast.perSig = contrast.perSig || {}; contrast.perSig[key] = (contrast.perSig[key] || 0) + 1;
      if (contrast.imgList.length < 60 && contrast.perSig[key] <= 3) { const idx = contrast.imgList.length; el.setAttribute('data-rw-imgbg', idx); const fgG = grain(c.fg); contrast.imgList.push({ idx, sig: sig(el), text: el.textContent.trim().slice(0, 30), fg: hex(c.fg), fgRgb: { r: c.fg.r, g: c.fg.g, b: c.fg.b }, fgGrain: map ? { r: fgG.r, g: fgG.g, b: fgG.b } : null, alpha: r2(Math.min(1, c.alpha)), size: Math.round(size), need }); }
      continue;
    }
    contrast.checked++;
    const tr = c.alpha < 0.999 || c.opacity < 0.999; if (tr) contrast.translucent++;
    const r = ratio(c.fg, c.bg);
    const ex = label + (tr ? `, прозрачность ${r2(c.alpha * c.opacity)}` : '');
    if (r < need) add(contrast.failures, `${hex(c.fg)} на ${hex(c.bg)}`, { ratio: r2(r), need, translucent: tr }, ex);
    else if (map) {
      contrast.grain.checked++;
      const rg = ratio(grain(c.fg), grain(c.bg));
      const key = `${hex(c.fg)} на ${hex(c.bg)}`;
      if (rg < need) add(contrast.grain.failures, key, { ratio: r2(r), ratioGrain: r2(rg), need, withGrain: `${hex(grain(c.fg))} на ${hex(grain(c.bg))}` }, ex);
      else if (rg < need * 1.1) add(contrast.grain.near, key, { ratio: r2(r), ratioGrain: r2(rg), need }, ex);
    }
  }
  /* мелкий текст: всё видимое, кроме sr-only */
  const smallText = { checked: 0, groups: {} };
  for (const el of allText) {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (r.width <= 2 || r.height <= 2 || /rect\(0(px)?,? 0(px)?/.test(s.clip) || /inset\(50%\)/.test(s.clipPath)) continue;
    smallText.checked++;
    const size = Math.round(parseFloat(s.fontSize) * 10) / 10; if (size >= 12) continue;
    add(smallText.groups, `${size}`, { size, status: size < 10 ? 'FAIL' : 'WARN' }, `${sig(el)} «${el.textContent.trim().slice(0, 24)}»`);
  }
  const imgsNoAlt = [...document.images].filter((i) => V(i) && !i.hasAttribute('alt')).map((i) => (i.currentSrc || i.src).split('/').pop().slice(0, 50)).slice(0, 10);
  const decorativeEmpty = [...document.images].filter((i) => i.getAttribute('alt') === '').length;
  const unlabeled = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')].filter((i) => V(i) && !((i.labels && i.labels.length) || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.getAttribute('title'))).map((i) => `${sig(i)}${i.placeholder ? ` (только placeholder «${i.placeholder}»)` : ''}`).slice(0, 10);
  const nameless = [...document.querySelectorAll('a, button, [role=button]')].filter((el) => V(el) && !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.querySelector('img[alt]:not([alt=""]), svg[aria-label], svg title'))).map((el) => sig(el)).slice(0, 10);
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(V).map((h) => +h.tagName[1]);
  const skips = []; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skips.push(`h${hs[i - 1]}→h${hs[i]}`);
  const vpMeta = (document.querySelector('meta[name=viewport]') || {}).content || '';
  const targets = isMobile ? [...document.querySelectorAll('a[href], button, [role=button], input[type=checkbox], input[type=radio], summary')].filter((el) => { if (!V(el)) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); const inline = s.display === 'inline' && el.parentElement && /^(p|li|td|span|dd)$/i.test(el.parentElement.tagName); return !inline && (r.width < 24 || r.height < 24); }).map((el) => { const r = el.getBoundingClientRect(); return `${sig(el)} ${Math.round(r.width)}×${Math.round(r.height)}`; }).slice(0, 10) : [];
  const smallInputs = isMobile ? [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((i) => V(i) && parseFloat(getComputedStyle(i).fontSize) < 16).map((el) => sig(el)).slice(0, 6) : [];
  let reduced = false; for (const sh of document.styleSheets) { try { const walk = (rs) => { for (const r of rs) { if (r.type === CSSRule.MEDIA_RULE) { if (/prefers-reduced-motion/.test(r.conditionText)) reduced = true; walk(r.cssRules); } } }; walk(sh.cssRules); } catch { /* кросс-домен */ } }
  return { contrast, smallText, imgsNoAlt, imgsNoAltCount: [...document.images].filter((i) => V(i) && !i.hasAttribute('alt')).length, decorativeEmpty, unlabeled, nameless, headings: { count: hs.length, h1: hs.filter((h) => h === 1).length, skips }, lang: document.documentElement.lang || null, zoomBlocked: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?(\D|$)/i.test(vpMeta), positiveTabindex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length, targets, smallInputs, reducedMotionRule: reduced, autoplayVideo: [...document.querySelectorAll('video[autoplay]')].filter((v) => !v.muted).length, skipLink: !!document.querySelector('a[href^="#"][class*="skip"], a[href="#main"], a[href="#content"]'), landmarks: { main: document.querySelectorAll('main, [role=main]').length, nav: document.querySelectorAll('nav, [role=navigation]').length, header: document.querySelectorAll('header, [role=banner]').length, footer: document.querySelectorAll('footer, [role=contentinfo]').length }, iframesNoTitle: [...document.querySelectorAll('iframe')].filter((f) => !f.title).length };
}

/* ---------- зерно поверх текста: действие слоя по трём снимкам ---------- */
async function grainMap(page) {
  if (!sharp) return { skipped: 'нет sharp' };
  const f = await findTextureLayers(page, { mark: true });
  const over = f.layers.filter((L) => L.coversViewport && (L.position === 'fixed' || L.fixedBy) && !(parseInt(L.zIndex, 10) < 0));
  if (!over.length) return { layers: [], found: f.layers.length };
  /* сами слои-элементы помечаются: в контрасте они не «картинка за текстом», их действие — в map */
  await page.evaluate((ks) => { for (const k of ks) { const el = document.querySelector(`[data-rw-tex="${k}"]`); if (el) el.setAttribute('data-rw-grain', ''); } }, over.filter((L) => !L.pseudo).map((L) => L.k));
  const css =['html,body{background:var(--rw-probe)!important;background-image:none!important}', 'body *{visibility:hidden!important}']
    .concat(over.map((L) => (L.pseudo ? `[data-rw-tex-${L.pseudo.slice(2)}="${L.k}"]${L.pseudo}{visibility:visible!important}` : `[data-rw-tex="${L.k}"],[data-rw-tex="${L.k}"] *{visibility:visible!important}`))).join('\n');
  await page.evaluate((c) => { const st = document.createElement('style'); st.setAttribute('data-rw', 'grain-probe'); st.textContent = c; document.head.appendChild(st); }, css);
  const vpx = page.viewport(); const d = vpx.deviceScaleFactor || 1;
  const means = [];
  try {
    for (const lvl of [0, 128, 255]) {
      await page.evaluate((v) => document.documentElement.style.setProperty('--rw-probe', `rgb(${v},${v},${v})`), lvl);
      await sleep(250);
      const buf = await page.screenshot({ type: 'png' });
      const W = Math.round(vpx.width * d), H = Math.round(vpx.height * d);
      const { data, info } = await sharp(buf).extract({ left: Math.round(W * 0.1), top: Math.round(H * 0.1), width: Math.round(W * 0.8), height: Math.round(H * 0.8) }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const sum = [0, 0, 0]; const n = info.width * info.height;
      for (let i = 0; i < n; i++) { sum[0] += data[i * 3]; sum[1] += data[i * 3 + 1]; sum[2] += data[i * 3 + 2]; }
      means.push(sum.map((s) => Math.round(s / n * 100) / 100));
    }
  } finally {
    await page.evaluate(() => { const st = document.querySelector('style[data-rw="grain-probe"]'); if (st) st.remove(); document.documentElement.style.removeProperty('--rw-probe'); });
    await sleep(200);
  }
  const map = [0, 1, 2].map((ch) => [means[0][ch], means[1][ch], means[2][ch]]);
  const identity = map.every((p) => Math.abs(p[0]) < 0.6 && Math.abs(p[1] - 128) < 0.6 && Math.abs(p[2] - 255) < 0.6);
  return { layers: over.map((L) => ({ el: L.el + (L.pseudo || ''), blend: L.mixBlendMode, opacity: L.effectiveOpacity, zIndex: L.zIndex })), map, identity, points: { black: means[0], gray: means[1], white: means[2] } };
}

/* ---------- фокус: обход Tab на свежей странице ---------- */
const PROPS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'backgroundColor', 'borderTopColor', 'color', 'textDecorationLine'];
async function focusWalk(page) {
  const focusables = await page.evaluate(() => [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, iframe, [tabindex], [contenteditable=""], [contenteditable="true"]')].filter((el) => {
    if (el.disabled) return false; const ti = el.getAttribute('tabindex'); if (ti !== null && Number(ti) < 0) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === 'visible';
  }).length);
  const focus = { focusables, expected: Math.min(5, focusables), visited: 0, invisible: [], trapped: false, first: null, stuckAt: null };
  let sameSteps = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab'); await sleep(80);
    /* сравниваем сами элементы, а не подписи: пять ссылок подряд с одной подписью — не ловушка */
    const cur = await page.evaluate((props, sigSrc) => { const sig = eval(sigSrc); const el = document.activeElement; if (!el || el === document.body) return null; const type = (el.getAttribute('type') || '').toLowerCase(); if (el.__rwSeen) return { sig: sig(el), same: true, type }; el.__rwSeen = true; const s = getComputedStyle(el); const focused = Object.fromEntries(props.map((p) => [p, s[p]])); el.blur(); const s2 = getComputedStyle(el); const base = Object.fromEntries(props.map((p) => [p, s2[p]])); el.focus({ preventScroll: true }); return { sig: sig(el), changed: props.some((p) => focused[p] !== base[p]), same: false, type }; }, PROPS, SIG_FN);
    if (!cur) break;
    /* поле даты в Chrome — три внутренних сегмента: Tab ходит по ним, это не ловушка */
    if (cur.same) { if (/^(date|time|datetime-local|month|week)$/.test(cur.type) && (sameSteps = sameSteps + 1) <= 4) continue; focus.trapped = true; focus.stuckAt = cur.sig; break; }
    sameSteps = 0; focus.visited++; if (!focus.first) focus.first = cur.sig;
    if (!cur.changed) focus.invisible.push(cur.sig);
  }
  return focus;
}

/* ---------- прогон ---------- */
const browser = await launch();
let dom, focus, reveal, sc, grain = null; const imgContrast = { measured: 0, skipped: 0, failures: [] };
try {
  const page = await openPage(browser, url, vp);
  await forceInstantScroll(page);
  await evaluateWith(page, markHiddenInPage, null, {}).catch(() => 0);
  sc = await scrollThrough(page, { pause: 250 });
  await scrollToY(page, 0); await settleAnimations(page, 3000); await sleep(300);
  reveal = await evaluateWith(page, revealInPage, null, DEPS).catch(() => null);
  if (!opt['no-grain']) grain = await grainMap(page).catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  const map = grain && grain.map && !grain.identity ? grain.map : null;
  dom = await evaluateWith(page, domInPage, { isMobile: !!vp.isMobile, map }, DEPS);

  /* контраст на картинках и градиентах: прячем текст, снимаем фон за ним, считаем по пикселям */
  if (sharp && dom.contrast.imgList.length) {
    const lumRgb = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    await page.addStyleTag({ content: '.rw-hide-text,.rw-hide-text *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}' });
    for (const it of dom.contrast.imgList) {
      const h = await page.$(`[data-rw-imgbg="${it.idx}"]`); if (!h) { imgContrast.skipped++; continue; }
      try {
        await h.evaluate((el) => { el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.classList.add('rw-hide-text'); });
        await sleep(120);
        const box = await h.boundingBox();
        if (!box || box.width < 4 || box.height < 4 || box.width * box.height > 1600 * 1200) { imgContrast.skipped++; await h.evaluate((el) => el.classList.remove('rw-hide-text')); continue; }
        /* снимок окна и вырезка по координатам окна: снимок элемента у закреплённых (position: fixed)
           и прокрученных элементов брал не ту область */
        const dprS = vp.deviceScaleFactor || 1; const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
        const cw = Math.max(1, Math.min(box.width - (x0 - box.x), vp.width - x0)), chh = Math.max(1, Math.min(box.height - (y0 - box.y), vp.height - y0));
        const buf = await page.screenshot({ type: 'png' });
        await h.evaluate((el) => el.classList.remove('rw-hide-text'));
        const { data, info } = await sharp(buf).extract({ left: Math.round(x0 * dprS), top: Math.round(y0 * dprS), width: Math.round(cw * dprS), height: Math.round(chh * dprS) }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        /* цвет текста над пикселем фона: альфа и opacity смешивают его с этим пикселем; слой зерна
           уже есть на снимке фона — к цвету текста он применяется отдельно (fgGrain) */
        const F = it.fgGrain || it.fgRgb; const a = it.alpha;
        const n = info.width * info.height; const stride = Math.max(1, Math.floor(n / 4000)); const ratios = [];
        for (let p = 0; p < n; p += stride) {
          const i = p * 4; const R = data[i], G = data[i + 1], Bb = data[i + 2];
          const l = lumRgb(R, G, Bb); const fl = lumRgb(a * F.r + (1 - a) * R, a * F.g + (1 - a) * G, a * F.b + (1 - a) * Bb);
          ratios.push((Math.max(l, fl) + 0.05) / (Math.min(l, fl) + 0.05));
        }
        ratios.sort((x, y) => x - y);
        const p10 = ratios[Math.floor(ratios.length * 0.1)], median = ratios[Math.floor(ratios.length / 2)];
        imgContrast.measured++;
        if (p10 < it.need) imgContrast.failures.push({ sig: it.sig, text: it.text, fg: it.fg, alpha: it.alpha, size: it.size, p10: Math.round(p10 * 100) / 100, median: Math.round(median * 100) / 100, need: it.need });
      } catch { imgContrast.skipped++; try { await h.evaluate((el) => el.classList.remove('rw-hide-text')); } catch { /* ушёл */ } }
    }
  }
  await page.close();

  /* фокус — на свежей странице (отдельная вкладка): старт обхода не должен зависеть от прокруток выше */
  const fp = await openPage(browser, url, vp);
  await forceInstantScroll(fp);
  await fp.bringToFront();
  focus = await focusWalk(fp);
  await fp.close();
} finally { await browser.close(); }

/* ---------- вердикты ---------- */
const lines = []; let fails = 0, warns = 0;
const L = (st, what, det) => { if (st === 'FAIL') fails++; if (st === 'WARN') warns++; lines.push({ status: st, what, details: det }); console.log(`${st.padEnd(4)} ${what}${det ? ' — ' + det : ''}`); };
{
  const bad = sc.stuck ? 'страница не прокручивается — появления и часть текста не проверены' : !sc.reachedBottom ? `до низа не доехали: ${sc.maxScrollY} из ${sc.pageHeight - vp.height} px` : '';
  L(bad ? 'WARN' : 'OK', `прокрутка: страница пройдена целиком (${sc.pageHeight} px, ${sc.screens} шагов)`, bad || (reveal ? `блоков с текстом скрыто до прокрутки ${reveal.hidden}, показано после ${reveal.shown}${reveal.hidden - reveal.shown ? `; скрытыми остались ${reveal.hidden - reveal.shown} (меню, окна, наведение): ${reveal.still.slice(0, 4).join(', ')}` : ''}` : ''));
}
const C = dom.contrast;
const cf = Object.entries(C.failures).sort((a, b) => b[1].count - a[1].count);
L(cf.length ? 'FAIL' : 'OK', `контраст: проверено ${C.checked} элементов${C.translucent ? ` (из них ${C.translucent} полупрозрачных — смешаны с фоном)` : ''}${C.unknown ? `, ещё ${C.unknown} на картинке, градиенте или чужой подложке — см. ниже` : ''}${C.transparentText ? `, прозрачный цвет текста (градиент через background-clip) — ${C.transparentText}, не проверялись` : ''}`, cf.length ? cf.slice(0, 5).map(([k, v]) => `${k} = ${v.ratio}:1 (нужно ${v.need}:1), ${v.count} эл.: ${v.examples.join(', ')}`).join(' | ') : 'все пары проходят AA');
if (C.unknown) L(imgContrast.failures.length ? 'FAIL' : imgContrast.measured ? 'OK' : 'WARN', `контраст по снимку фона за текстом (картинка, градиент, чужая подложка): измерено ${imgContrast.measured}${imgContrast.skipped ? `, пропущено ${imgContrast.skipped}` : ''}${C.unknown > C.imgList.length ? `, не измерялось ${C.unknown - C.imgList.length}` : ''}`, imgContrast.failures.length ? imgContrast.failures.slice(0, 6).map((f) => `${f.sig} «${f.text}» ${f.fg}${f.alpha < 1 ? ` (прозрачность ${f.alpha})` : ''} ${f.size}px: худшие 10% фона дают ${f.p10}:1 при медиане ${f.median}:1 (нужно ${f.need}:1)`).join(' | ') : imgContrast.measured ? 'везде не ниже нормы' : 'нет sharp — не измерено');
if (grain && grain.error) L('WARN', 'зерно поверх текста: не измерено', grain.error);
else if (grain && grain.layers && grain.layers.length) {
  const G = C.grain; const hexs = (m) => '#' + m.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lay = `${grain.layers.map((l) => `${l.el}${l.blend && l.blend !== 'normal' ? ` ${l.blend}` : ''} α${l.opacity}`).join(', ')}: чёрный → ${hexs(grain.points.black)}, серый → ${hexs(grain.points.gray)}, белый → ${hexs(grain.points.white)}`;
  if (grain.identity || !G) L('OK', 'зерно поверх текста', `${lay} — цвета не меняет`);
  else {
    const gf = Object.entries(G.failures).sort((a, b) => b[1].count - a[1].count); const gn = Object.entries(G.near);
    L(gf.length ? 'FAIL' : 'OK', `контраст с учётом зерна: пересчитано ${G.checked} проходящих пар`, `${lay}${gf.length ? ` | ниже нормы из-за зерна: ${gf.slice(0, 5).map(([k, v]) => `${k} ${v.ratio}:1 → ${v.ratioGrain}:1 (нужно ${v.need}:1; с зерном ${v.withGrain}), ${v.count} эл.: ${v.examples.join(', ')}`).join(' | ')}` : ''}${gn.length ? ` | в пределах 10 % над нормой: ${gn.slice(0, 4).map(([k, v]) => `${k} ${v.ratio}→${v.ratioGrain}:1, ${v.count} эл.`).join('; ')}` : ''}`);
  }
}
{
  const g = Object.values(dom.smallText.groups).sort((a, b) => a.size - b.size);
  const st = g.some((x) => x.status === 'FAIL') ? 'FAIL' : g.length ? 'WARN' : 'OK';
  L(st, `мелкий текст: проверено ${dom.smallText.checked} элементов, мельче 12px — ${g.reduce((a, x) => a + x.count, 0)}`, g.length ? g.slice(0, 5).map((x) => `${x.size}px (${x.status === 'FAIL' ? 'меньше 10' : 'меньше 12'}) ×${x.count}: ${x.examples.join(', ')}`).join(' | ') : 'везде от 12px');
}
L(dom.imgsNoAltCount ? 'FAIL' : 'OK', `картинки без alt: ${dom.imgsNoAltCount}`, dom.imgsNoAlt.join(', ') || `у декоративных alt="" — ${dom.decorativeEmpty}`);
L(dom.unlabeled.length ? 'FAIL' : 'OK', `поля без подписи: ${dom.unlabeled.length}`, dom.unlabeled.join(', '));
L(dom.nameless.length ? 'FAIL' : 'OK', `кнопки и ссылки без имени: ${dom.nameless.length}`, dom.nameless.join(', '));
L(dom.headings.h1 === 1 && !dom.headings.skips.length ? 'OK' : 'WARN', `заголовки: ${dom.headings.count}, h1 — ${dom.headings.h1}`, dom.headings.skips.length ? `пропуски уровней: ${dom.headings.skips.join(', ')}` : dom.headings.h1 !== 1 ? 'h1 должен быть один' : 'порядок соблюдён');
L(dom.lang ? 'OK' : 'FAIL', `lang документа: ${dom.lang || 'нет'}`, dom.lang ? '' : 'читалка не поймёт язык, переносы и произношение будут чужими');
L(dom.zoomBlocked ? 'FAIL' : 'OK', 'масштабирование', dom.zoomBlocked ? 'запрещено в meta viewport — слабовидящие не смогут увеличить' : 'разрешено');
L(dom.positiveTabindex ? 'WARN' : 'OK', `положительный tabindex: ${dom.positiveTabindex}`, dom.positiveTabindex ? 'ломает естественный порядок обхода' : '');
{
  const f = focus; const short = f.visited < f.expected;
  const st = f.invisible.length ? 'FAIL' : f.trapped ? 'WARN' : short ? 'WARN' : f.focusables ? 'OK' : 'OK';
  const det = f.invisible.length ? `не видно фокуса на: ${f.invisible.slice(0, 8).join(', ')}${short ? `; к тому же обход не состоялся (${f.visited} из ${f.focusables})` : ''}`
    : f.trapped ? `ловушка фокуса или перехват Tab на ${f.stuckAt} — проверить руками`
      : short ? `обход не состоялся: Tab прошёл ${f.visited} из ожидаемых ${f.expected} (фокусируемых на странице ${f.focusables}) — Tab перехвачен, фокус уходит из страницы или стартует не сначала`
        : f.focusables ? `фокус виден везде (первым — ${f.first})` : 'фокусируемых элементов нет';
  L(st, `фокус: обошли ${f.visited} элементов на свежей странице`, det);
}
if (vp.isMobile) { L(dom.targets.length ? 'WARN' : 'OK', `цели нажатия мельче 24px: ${dom.targets.length}`, dom.targets.join(', ')); L(dom.smallInputs.length ? 'WARN' : 'OK', `поля мельче 16px: ${dom.smallInputs.length}`, dom.smallInputs.length ? 'iOS увеличит страницу при фокусе: ' + dom.smallInputs.join(', ') : ''); }
L(dom.reducedMotionRule ? 'OK' : 'WARN', 'prefers-reduced-motion', dom.reducedMotionRule ? 'правило есть' : 'правила нет — анимации не отключаются для тех, кому от них плохо');
L(dom.autoplayVideo ? 'FAIL' : 'OK', `видео с автоплеем и звуком: ${dom.autoplayVideo}`);
L(dom.landmarks.main ? 'OK' : 'WARN', `ориентиры: main ${dom.landmarks.main}, nav ${dom.landmarks.nav}, header ${dom.landmarks.header}, footer ${dom.landmarks.footer}`, dom.landmarks.main ? '' : 'нет <main> — читалка не найдёт начало содержимого');
if (dom.iframesNoTitle) L('WARN', `iframe без title: ${dom.iframesNoTitle}`);
const verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
console.log(`\n${verdict}: ${fails} провалов, ${warns} предупреждений`);
const file = path.join(outDir, `${tag}.json`);
writeJson(file, { url, viewport: vpName, takenAt: new Date().toISOString(), scroll: { pageHeight: sc.pageHeight, screens: sc.screens, maxScrollY: sc.maxScrollY, reachedBottom: sc.reachedBottom, stuck: sc.stuck }, reveal, grain, dom: { ...dom, contrast: { ...dom.contrast, imgList: dom.contrast.imgList.map(({ fgRgb, fgGrain, ...rest }) => rest) } }, imgContrast, focus, lines, verdict });
console.log(`Сохранено: ${file}`);
