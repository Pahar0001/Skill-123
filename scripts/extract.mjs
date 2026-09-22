#!/usr/bin/env node
/**
 * Съём дизайн-системы со страницы: палитра, шрифты, шкала, сетка, ритм,
 * форма, структура, движение, состояния. Замеряется живой DOM, не картинка.
 *
 *   node extract.mjs <url> [--out docs/design] [--name slug] [--no-shots]
 *
 * На выходе: <slug>.json (сырые замеры), <slug>.tokens.css (переменные),
 * <slug>.md (заготовка спецификации) и снимки в <slug>-shots/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep, parseArgs, slugFromUrl } from './lib.mjs';

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/* ---------- выполняется внутри страницы ---------- */
function inPage() {
  const vw = innerWidth, vh = innerHeight;
  const hex = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length > 3 && p[3] === 0) return null;
    const h = '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
    return p.length > 3 && p[3] < 1 ? h + Math.round(p[3] * 255).toString(16).padStart(2, '0').toUpperCase() : h;
  };
  const bump = (map, key, w = 1) => { if (key == null || key === '') return; map[key] = (map[key] || 0) + w; };
  const top = (map, n = 8) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, weight]) => ({ value, weight: Math.round(weight) }));
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
  const sig = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '');

  const all = [...document.body.querySelectorAll('*')].filter((el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw) || s.visibility === 'hidden' || s.display === 'none') return false;
    /* прозрачное ниже первого экрана — это блоки, ждущие появления при прокрутке; их считаем */
    return parseFloat(s.opacity) > 0.01 || r.top + scrollY > vh;
  });

  const bg = {}, fg = {}, border = {}, fam = {}, radius = {}, shadow = {}, bw = {}, space = {}, trans = {};
  const gridInfo = [], containers = {};
  for (const el of all) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    const area = Math.min(r.width, vw) * r.height;
    bump(bg, hex(s.backgroundColor), area);
    const t = ownText(el);
    if (t.length) { bump(fg, hex(s.color), t.length); bump(fam, s.fontFamily, t.length); }
    if (px(s.borderTopWidth) > 0 || px(s.borderBottomWidth) > 0) { bump(border, hex(s.borderTopColor) || hex(s.borderBottomColor)); bump(bw, Math.max(px(s.borderTopWidth), px(s.borderBottomWidth)) + 'px'); }
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

  /* типографская шкала */
  const levels = { h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', body: 'p, li', small: 'small, figcaption, .caption, label', button: 'button, .btn, .button, a[class*="btn"], a[class*="button"]', nav: 'nav a, header a' };
  const scale = {};
  for (const [name, sel] of Object.entries(levels)) {
    const votes = {};
    for (const el of document.querySelectorAll(sel)) {
      if (!all.includes(el)) continue;
      const s = getComputedStyle(el); const len = (el.textContent || '').trim().length; if (!len) continue;
      const key = JSON.stringify({ fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight === 'normal' ? 'normal' : Math.round(parseFloat(s.lineHeight) / parseFloat(s.fontSize) * 100) / 100, letterSpacing: s.letterSpacing === 'normal' ? '0' : Math.round(parseFloat(s.letterSpacing) / parseFloat(s.fontSize) * 1000) / 1000 + 'em', fontFamily: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), textTransform: s.textTransform });
      bump(votes, key, name === 'body' ? len : 1);
    }
    const best = top(votes, 1)[0]; if (best) scale[name] = JSON.parse(best.value);
  }

  /* секции и ритм */
  let root = document.querySelector('main') || document.body;
  let kids = [...root.children];
  while (kids.filter((k) => k.getBoundingClientRect().height > 150).length < 2 && kids.length) { const big = kids.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]; if (!big || !big.children.length) break; root = big; kids = [...root.children]; }
  const header = document.querySelector('header'), footer = document.querySelector('footer');
  const secEls = [...new Set([header, ...kids, footer].filter(Boolean))].filter((el) => all.includes(el) && el.getBoundingClientRect().height > 40);
  const sections = secEls.map((el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    const h = el.querySelector('h1,h2,h3');
    return { el: sig(el), top: Math.round(r.top + scrollY), height: Math.round(r.height), paddingTop: px(s.paddingTop), paddingBottom: px(s.paddingBottom), marginTop: px(s.marginTop), background: hex(s.backgroundColor), position: s.position, heading: h ? h.tagName.toLowerCase() + ': ' + h.textContent.trim().slice(0, 40) : null, images: el.querySelectorAll('img,picture,video,svg').length, links: el.querySelectorAll('a,button').length };
  });

  /* шрифты: что объявлено и откуда грузится */
  const fontFaces = [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ''), weight: f.weight, style: f.style, status: f.status, unicodeRange: f.unicodeRange }));
  const fontLinks = [...document.querySelectorAll('link[href*="font"], link[rel="preload"][as="font"]')].map((l) => l.href);
  const keyframes = [], faceSrc = []; let reducedMotion = false, unreadableSheets = 0;
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch { unreadableSheets++; continue; }
    const walk = (list) => { for (const r of list) {
      if (r.type === CSSRule.KEYFRAMES_RULE) keyframes.push({ name: r.name, css: r.cssText.slice(0, 600) });
      else if (r.type === CSSRule.FONT_FACE_RULE) faceSrc.push({ family: r.style.getPropertyValue('font-family').replace(/["']/g, ''), src: r.style.getPropertyValue('src').slice(0, 200) });
      else if (r.type === CSSRule.MEDIA_RULE) { if (/prefers-reduced-motion/.test(r.conditionText)) reducedMotion = true; walk(r.cssRules); }
      else if (r.cssRules) walk(r.cssRules);
    } };
    walk(rules);
  }

  /* движение */
  const libs = {};
  const probes = { gsap: 'gsap', ScrollTrigger: 'ScrollTrigger', Lenis: 'Lenis', Swiper: 'Swiper', AOS: 'AOS', anime: 'anime', THREE: 'THREE', barba: 'barba', LocomotiveScroll: 'LocomotiveScroll', Splitting: 'Splitting', lottie: 'lottie', Framer: '__framer_importFromPackage' };
  for (const [name, g] of Object.entries(probes)) if (window[g]) libs[name] = (window[g] && window[g].version) || true;
  const scriptHints = [...document.scripts].map((s) => s.src).filter((s) => /gsap|lenis|swiper|aos|anime|three|barba|locomotive|lottie|framer|motion|splide|scrollreveal/i.test(s));
  const running = document.getAnimations().slice(0, 40).map((a) => { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; return { name: a.animationName || a.transitionProperty || a.constructor.name, target: a.effect && a.effect.target ? sig(a.effect.target) : null, duration: t.duration, delay: t.delay, easing: t.easing, iterations: t.iterations === Infinity ? 'infinite' : t.iterations }; });
  const sticky = all.filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position)).slice(0, 10).map((el) => ({ el: sig(el), position: getComputedStyle(el).position, height: Math.round(el.getBoundingClientRect().height) }));
  /* кандидаты на появление при прокрутке: ниже первого экрана и пока спрятаны */
  const hiddenBelow = all.filter((el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.top + scrollY > vh && r.height > 30 && (parseFloat(s.opacity) < 0.95 || (s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)')); }).slice(0, 60);
  hiddenBelow.forEach((el, i) => el.setAttribute('data-dref-reveal', i));
  const revealBefore = hiddenBelow.map((el) => { const s = getComputedStyle(el); const first = (v) => v.split(/,(?![^(]*\))/)[0].trim(); return { el: sig(el), opacity: s.opacity, transform: s.transform, transition: first(s.transitionDuration) + ' ' + first(s.transitionTimingFunction) + ', задержка ' + first(s.transitionDelay) }; });

  const bodyS = getComputedStyle(document.body), htmlS = getComputedStyle(document.documentElement);
  return {
    viewport: { width: vw, height: vh }, pageHeight: document.documentElement.scrollHeight,
    page: { background: hex(bodyS.backgroundColor) || hex(htmlS.backgroundColor) || '#FFFFFF', color: hex(bodyS.color), scrollBehavior: htmlS.scrollBehavior, lang: document.documentElement.lang },
    palette: { backgrounds: top(bg, 8), text: top(fg, 6), borders: top(border, 5) },
    fonts: { used: top(fam, 5), faces: fontFaces, links: fontLinks, faceSrc, unreadableSheets },
    scale, containers: top(containers, 5), grids: gridInfo.slice(0, 25),
    spacing: top(space, 16), shape: { radius: top(radius, 6), shadow: top(shadow, 4), borderWidth: top(bw, 4) },
    sections,
    motion: { libs, scriptHints, transitions: top(trans, 10), running, keyframes: keyframes.slice(0, 30), sticky, reducedMotion, revealBefore },
  };
}

/* ---------- прокрутка: подгрузить ленивое и поймать появление блоков ---------- */
async function scrollThrough(page, shotsDir, tag) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewport().height; let n = 0;
  for (let y = 0; y < total; y += Math.round(vh * 0.8)) {
    await page.evaluate((yy) => scrollTo({ top: yy, behavior: 'instant' }), y); await sleep(450);
    if (shotsDir && n < 10) await page.screenshot({ path: path.join(shotsDir, `${tag}-scroll-${String(n).padStart(2, '0')}.png`) });
    n++;
  }
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
  for (const h of handles) {
    if (out.length >= 14) break;
    const info = await h.evaluate((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { sig: el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 3).join('.'), ok: r.width > 8 && r.height > 8 && s.visibility !== 'hidden', transition: s.transitionProperty + ' ' + s.transitionDuration + ' ' + s.transitionTimingFunction }; });
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

/* ---------- один проход по странице ---------- */
async function measure(browser, url, viewport, { shotsDir, tag, withStates, scheme = 'light' }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready); await sleep(600);
  const data = await page.evaluate(inPage);
  await scrollThrough(page, shotsDir, tag);
  const after = await revealAfter(page);
  data.motion.scrollReveal = data.motion.revealBefore.map((b, i) => { const a = after.find((x) => x.i === i); return a && (a.opacity !== b.opacity || a.transform !== b.transform) ? { ...b, becomes: { opacity: a.opacity, transform: a.transform } } : null; }).filter(Boolean).slice(0, 20);
  delete data.motion.revealBefore;
  if (shotsDir) { await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(300); await page.screenshot({ path: path.join(shotsDir, `${tag}-full.png`), fullPage: true }); }
  if (withStates) data.states = await states(page);
  await page.close();
  return data;
}

export async function extract(url, { shotsDir = null, light = false } = {}) {
  const browser = await launch();
  try {
    const desktop = await measure(browser, url, DESKTOP, { shotsDir, tag: 'desktop', withStates: !light });
    const mobile = await measure(browser, url, MOBILE, { shotsDir, tag: 'mobile', withStates: false });
    let dark = null;
    if (!light) { const d = await measure(browser, url, DESKTOP, { shotsDir: null, tag: 'dark', withStates: false, scheme: 'dark' }); dark = { page: d.page, palette: d.palette, differs: d.page.background !== desktop.page.background }; }
    return { source: url, takenAt: new Date().toLocaleDateString('sv-SE'), desktop, mobile, dark };
  } finally { await browser.close(); }
}

/* ---------- роли цветов и переменные ---------- */
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const alpha = (h) => (h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1);
/** Цвет с прозрачностью, наложенный на фон — таким его видит глаз. */
const flat = (h, bgHex) => { const a = alpha(h), c = rgb(h), b = rgb(bgHex); return '#' + c.map((v, i) => Math.round(v * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase(); };
const sat = (h) => { const [r, g, b] = rgb(h).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
export const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.round(Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])); };

export function roles(d) {
  const background = d.page.background.slice(0, 7);
  const see = (list) => list.map((c) => ({ ...c, seen: flat(c.value, background) }));
  const bgs = see(d.palette.backgrounds), txt = see(d.palette.text), brd = see(d.palette.borders);
  const surface = (bgs.find((c) => alpha(c.value) === 1 && dist(c.seen, background) > 3 && dist(c.seen, background) < 90 && sat(c.seen) < 0.35) || {}).value || null;
  /* основной текст — самый контрастный из частых нейтральных; приглушённый — самый частый из остальных нейтральных */
  const neutral = txt.filter((c) => sat(c.seen) < 0.35 && dist(c.seen, background) > 60).slice(0, 4);
  const textC = [...neutral].sort((a, b) => dist(b.seen, background) - dist(a.seen, background))[0];
  const text = textC ? textC.value : d.page.color;
  const muted = (neutral.find((c) => c !== textC && dist(c.seen, textC.seen) > 25) || {}).value || null;
  const pool = [...bgs, ...txt, ...brd].filter((c) => sat(c.seen) > 0.4 && dist(c.seen, background) > 60);
  const accent = (pool.sort((a, b) => sat(b.seen) * Math.log(b.weight + 2) - sat(a.seen) * Math.log(a.weight + 2))[0] || {}).value || null;
  const border = (brd.find((c) => c.value !== accent && sat(c.seen) < 0.35) || {}).value || null;
  return { background, surface, text, muted, accent, border };
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
  const d = data.desktop, m = data.mobile, r = roles(d), mo = motionSummary(d);
  const L = [`/* Снято с ${data.source} · ${data.takenAt}. Значения — замеры, роли цветов определены автоматически: проверить глазами. */`, ':root{'];
  for (const [k, v] of Object.entries(r)) if (v) L.push(`  --c-${k}: ${v};`);
  d.fonts.used.slice(0, 2).forEach((f, i) => L.push(`  --font-${i === 0 ? 'body' : 'alt'}: ${f.value};`));
  if (d.scale.h1) L.push(`  --font-display: "${d.scale.h1.fontFamily}";`);
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
  L.push('}');
  return L.join('\n') + '\n';
}

export function spacingModule(d) {
  const vals = d.spacing.map((s) => ({ v: +s.value, w: s.weight })); const total = vals.reduce((a, b) => a + b.w, 0) || 1;
  const share = (n) => Math.round(vals.filter((x) => x.v % n === 0).reduce((a, b) => a + b.w, 0) / total * 100);
  return { by8: share(8), by4: share(4), by5: share(5) };
}

const chg = (o) => Object.entries(o).map(([k, v]) => `${k} ${String(v.from).slice(0, 40)} → ${String(v.to).slice(0, 40)}`).join(', ') || 'без изменений';
function skeleton(data, slug) {
  const d = data.desktop, m = data.mobile, r = roles(d), mo = motionSummary(d), mod = spacingModule(d);
  const sc = (s) => Object.entries(s).map(([k, v]) => `| ${k} | ${v.fontFamily} | ${v.fontSize} | ${v.fontWeight} | ${v.lineHeight} | ${v.letterSpacing} | ${v.textTransform} |`).join('\n');
  const head = '| уровень | гарнитура | размер | вес | интерлиньяж | трекинг | регистр |\n|---|---|---|---|---|---|---|\n';
  const libs = Object.keys(d.motion.libs).join(', ') || 'не выявлено';
  return `# ${slug}

Источник: ${data.source}
Дата съёма: ${data.takenAt}
Сырые замеры: \`${slug}.json\` · переменные: \`${slug}.tokens.css\` · снимки: \`${slug}-shots/\`

> Заготовка собрана скриптом. Цифры — замеры. Роли цветов, разделы «Приём»
> и «Что берём себе» — дописать руками, посмотрев снимки.

## 1. Палитра
${Object.entries(r).map(([k, v]) => `- ${k}: ${v || 'не выявлено'}`).join('\n')}
- тёмная тема: ${data.dark ? (data.dark.differs ? `есть, фон ${data.dark.page.background}, текст ${data.dark.page.color}` : 'не выявлена') : 'не проверялась'}

Все фоны по площади: ${d.palette.backgrounds.map((c) => c.value).join(', ')}
Все цвета текста: ${d.palette.text.map((c) => c.value).join(', ')}

## 2. Шрифты
${d.fonts.used.map((f) => `- ${f.value}`).join('\n')}
- грузятся: ${d.fonts.links.join(', ') || (d.fonts.faceSrc.length ? 'свои файлы (@font-face)' : 'не выявлено')}
- кириллица: **проверить** \`cyrillic-check.mjs\` для каждой гарнитуры

## 3. Типографская шкала
Широкий экран:
${head}${sc(d.scale)}

Узкий экран (390):
${head}${sc(m.scale)}

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

/* ---------- запуск из командной строки ---------- */
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  if (!pos[0]) { console.error('Нужен адрес: node extract.mjs <url> [--out docs/design] [--name slug] [--no-shots]'); process.exit(1); }
  const url = pos[0], out = path.resolve(opt.out || 'docs/design'), slug = opt.name || slugFromUrl(url);
  const shotsDir = opt['no-shots'] ? null : path.join(out, slug + '-shots');
  fs.mkdirSync(shotsDir || out, { recursive: true });
  const data = await extract(url, { shotsDir });
  fs.writeFileSync(path.join(out, slug + '.json'), JSON.stringify(data, null, 1));
  fs.writeFileSync(path.join(out, slug + '.tokens.css'), tokensCss(data));
  const md = path.join(out, slug + '.md');
  if (fs.existsSync(md) && !opt.force) console.log(`Спецификация ${md} уже есть — не перезаписываю (нужно — добавьте --force).`);
  else fs.writeFileSync(md, skeleton(data, slug));
  console.log(`Снято: ${out}${path.sep}${slug}.{json,tokens.css,md}` + (shotsDir ? `, снимки в ${shotsDir}` : ''));
}
