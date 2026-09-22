#!/usr/bin/env node
/**
 * Разведка сайта: снимки на нескольких экранах, техника, содержимое, визуал,
 * ошибки в консоли и сети. Всё снимается с живой страницы в браузере, не из HTML.
 *
 *   node discover.mjs <url> [--out <папка прогона>] [--viewports desktop,tablet,mobile]
 *                     [--no-design] [--light] [--scheme dark] [--tag before]
 *
 * В папке прогона появляются:
 *   discovery.json   сырые данные по каждому экрану
 *   discovery.md     сводка для чтения: что найдено и какие снимки открыть глазами
 *   <tag>/           снимки: первый экран, серия по прокрутке, вся страница
 *   design/          дизайн-система через скилл design-reference (если он рядом)
 *
 * Разведка — это состояние ANALYZED. Она ничего не подтверждает про то, как
 * работают анимации, 3D и клики: для этого runtime.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage, scrollThrough, fullPageShot, pickViewports, parseArgs, runDir, writeJson, summarizeRequests, ensureDir, kb } from './lib.mjs';

/* ---------- выполняется внутри страницы ---------- */
function inPage() {
  const vw = innerWidth, vh = innerHeight;
  /* innerText, а не textContent: иначе в «текст» попадает содержимое <style> и <script>
     внутри блоков (Tilda кладёт стили прямо в разметку) */
  const txt = (el) => ((el && (typeof el.innerText === 'string' ? el.innerText : el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const sig = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '');
  const hex = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length > 3 && p[3] === 0) return null;
    return '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const bump = (map, key, w = 1) => { if (key == null || key === '') return; map[key] = (map[key] || 0) + w; };
  const top = (map, n = 8) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, weight]) => ({ value, weight: Math.round(weight) }));
  const g = window;

  /* --- техника --- */
  const frameworks = [];
  const has = (sel) => !!document.querySelector(sel);
  if (g.React || has('[data-reactroot]') || Object.keys(document.body).some((k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'))) frameworks.push('React');
  if (g.__NEXT_DATA__ || has('#__next')) frameworks.push('Next.js');
  if (g.__NUXT__ || has('#__nuxt')) frameworks.push('Nuxt');
  if (g.Vue || has('[data-v-app]') || [...document.querySelectorAll('body *')].slice(0, 400).some((e) => e.__vue__ || e.__vue_app__)) frameworks.push('Vue');
  if (has('[ng-version]')) frameworks.push('Angular');
  if (has('[class*="svelte-"]')) frameworks.push('Svelte');
  if (g.jQuery) frameworks.push('jQuery ' + ((g.jQuery.fn && g.jQuery.fn.jquery) || ''));
  if (g.Webflow || has('html[data-wf-page]')) frameworks.push('Webflow');
  if (has('.t-records, .t-body, [data-tilda-root]') || g.t_onReady) frameworks.push('Tilda');
  if (has('link[href*="wp-content"], script[src*="wp-content"], meta[name="generator"][content*="WordPress"]')) frameworks.push('WordPress');
  if (g.BX || has('script[src*="/bitrix/"]')) frameworks.push('Bitrix');
  if (g.wixBiSession || has('meta[name="generator"][content*="Wix"]')) frameworks.push('Wix');
  if (has('meta[name="generator"][content*="Astro"]')) frameworks.push('Astro');
  if (g.Alpine) frameworks.push('Alpine');
  if (g.htmx) frameworks.push('htmx');
  const generator = (document.querySelector('meta[name="generator"]') || {}).content || null;

  const libs = {};
  const probes = { gsap: 'gsap', ScrollTrigger: 'ScrollTrigger', Lenis: 'Lenis', Swiper: 'Swiper', AOS: 'AOS', anime: 'anime', THREE: 'THREE', PIXI: 'PIXI', BABYLON: 'BABYLON', barba: 'barba', LocomotiveScroll: 'LocomotiveScroll', Splitting: 'Splitting', lottie: 'lottie', Splide: 'Splide', Motion: 'Motion', rive: 'rive', ymaps: 'ymaps' };
  for (const [name, key] of Object.entries(probes)) { const v = g[key]; if (v) libs[name] = (v && (v.version || v.REVISION)) || true; }
  if (g.google && g.google.maps) libs.googleMaps = true;
  const scriptSrcs = [...document.scripts].map((s) => s.src).filter(Boolean);
  const scriptHints = [...new Set(scriptSrcs.filter((s) => /gsap|lenis|swiper|aos|anime|three|barba|locomotive|lottie|framer|motion|splide|scrollreveal|pixi|babylon|rive|spline|matter|p5/i.test(s)).map((s) => s.split('/').pop().split('?')[0]))];
  const thirdParty = [...new Set(scriptSrcs.map((s) => { try { return new URL(s).hostname; } catch { return null; } }).filter((h) => h && h !== location.hostname))];
  const styles = { external: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href), inlineBlocks: document.querySelectorAll('style').length };
  const meta = {
    title: document.title, description: (document.querySelector('meta[name="description"]') || {}).content || null,
    viewport: (document.querySelector('meta[name="viewport"]') || {}).content || null, lang: document.documentElement.lang || null,
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null, ogImage: (document.querySelector('meta[property="og:image"]') || {}).content || null,
    favicon: has('link[rel*="icon"]'), h1Count: document.querySelectorAll('h1').length, robots: (document.querySelector('meta[name="robots"]') || {}).content || null,
  };
  const imgs = [...document.images];
  const ext = (u) => { const m = /\.(avif|webp|jpe?g|png|gif|svg)(\?|$)/i.exec(u || ''); return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'other'; };
  const formats = {}; imgs.forEach((i) => bump(formats, ext(i.currentSrc || i.src)));
  const images = {
    count: imgs.length, lazy: imgs.filter((i) => i.loading === 'lazy').length, noAlt: imgs.filter((i) => !(i.alt || '').trim()).length,
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.src).length,
    oversized: imgs.filter((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && i.naturalWidth > r.width * devicePixelRatio * 2; }).map((i) => ({ src: (i.currentSrc || i.src).split('/').pop().slice(0, 60), natural: i.naturalWidth, shown: Math.round(i.getBoundingClientRect().width) })).slice(0, 8),
    formats, bgImages: [...document.querySelectorAll('body *')].filter((e) => /url\(/.test(getComputedStyle(e).backgroundImage) && visible(e)).length,
  };
  const canvases = [...document.querySelectorAll('canvas')].map((c) => {
    const r = c.getBoundingClientRect(); let ctx = 'unknown';
    for (const t of ['webgl2', 'webgl', '2d', 'bitmaprenderer']) { try { if (c.getContext(t)) { ctx = t; break; } } catch { /* занят другим типом */ } }
    return { el: sig(c), w: Math.round(r.width), h: Math.round(r.height), ctx, visible: r.width > 0 && r.height > 0 };
  });
  const media = { video: document.querySelectorAll('video').length, autoplayVideo: document.querySelectorAll('video[autoplay]').length, iframes: [...document.querySelectorAll('iframe')].map((f) => (f.src || '').slice(0, 80)), svgInline: document.querySelectorAll('svg').length, lottie: document.querySelectorAll('lottie-player, dotlottie-player, [data-lottie], [data-animation-path]').length };
  const dom = { nodes: document.getElementsByTagName('*').length, pageHeight: document.documentElement.scrollHeight, screens: Math.round(document.documentElement.scrollHeight / vh * 10) / 10, horizontalOverflow: document.documentElement.scrollWidth > vw + 1, htmlBytes: document.documentElement.outerHTML.length };
  const overflowing = dom.horizontalOverflow ? [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > vw + 2 && r.width > 20 && visible(e); }).slice(0, 6).map(sig) : [];

  /* --- содержимое --- */
  const headings = [...document.querySelectorAll('h1,h2,h3')].filter(visible).map((h) => ({ level: h.tagName.toLowerCase(), text: txt(h).slice(0, 120), aboveFold: h.getBoundingClientRect().top < vh })).slice(0, 60);
  const nav = [...document.querySelectorAll('nav a, header a')].filter(visible).map((a) => ({ text: txt(a).slice(0, 40), href: a.getAttribute('href') })).filter((a) => a.text).slice(0, 30);
  const ctas = [...document.querySelectorAll('a,button,[role="button"],input[type="submit"]')].filter(visible).map((el) => {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    const filled = !!hex(s.backgroundColor); const bordered = parseFloat(s.borderTopWidth) > 0 && !!hex(s.borderTopColor);
    return { text: (txt(el) || el.value || el.getAttribute('aria-label') || '').slice(0, 50), tag: el.tagName.toLowerCase(), href: el.getAttribute('href'), filled, bordered, bg: hex(s.backgroundColor), color: hex(s.color), aboveFold: r.top < vh, w: Math.round(r.width), h: Math.round(r.height), radius: s.borderTopLeftRadius };
  }).filter((c) => c.text && (c.filled || c.bordered || c.tag === 'button')).slice(0, 40);
  const forms = [...document.querySelectorAll('form')].map((f) => ({
    action: f.getAttribute('action'), method: f.method, visible: visible(f),
    fields: [...f.querySelectorAll('input,select,textarea')].filter((i) => i.type !== 'hidden').map((i) => ({ type: i.type || i.tagName.toLowerCase(), name: i.name, placeholder: i.placeholder, required: i.required, labelled: !!((i.labels && i.labels.length) || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby')) })),
    submit: txt(f.querySelector('button[type="submit"],input[type="submit"],button:not([type])')).slice(0, 40),
    consent: !!f.querySelector('input[type="checkbox"]'),
  }));
  const bodyText = txt(document.body);
  const words = bodyText.split(' ').filter(Boolean).length;
  const phones = [...new Set((bodyText.match(/\+?\d[\d\s()-]{8,}\d/g) || []).map((s) => s.trim()))].slice(0, 5);
  const emails = [...new Set(bodyText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [])].slice(0, 5);
  const prices = [...new Set(bodyText.match(/(?:от\s)?\d[\d\s]{1,9}(?:₽|руб\.?|\$|€)/g) || [])].slice(0, 12);
  const paragraphs = [...document.querySelectorAll('p, li')].filter(visible).map(txt).filter((t) => t.length > 40);
  const faq = document.querySelectorAll('details').length + headings.filter((h) => /faq|вопрос/i.test(h.text)).length;
  const social = [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /t\.me|vk\.com|instagram|wa\.me|whatsapp|youtube|max\.ru|dzen|ok\.ru/i.test(h)))].slice(0, 8);
  const heroText = (() => {
    const cands = [...document.querySelectorAll('h1,h2,p,span,div')].filter((e) => visible(e) && e.getBoundingClientRect().top < vh && txt(e).length > 3 && e.children.length < 3);
    cands.sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize));
    return cands.slice(0, 3).map((e) => ({ el: sig(e), size: getComputedStyle(e).fontSize, text: txt(e).slice(0, 120) }));
  })();

  /* --- визуал --- */
  const all = [...document.body.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && s.visibility !== 'hidden' && s.display !== 'none'; });
  const bg = {}, fg = {}, fam = {}, radius = {}, shadows = {};
  for (const el of all) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    bump(bg, hex(s.backgroundColor), Math.min(r.width, vw) * r.height);
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (own.length) { bump(fg, hex(s.color), own.length); bump(fam, s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), own.length); }
    if (s.borderTopLeftRadius !== '0px') bump(radius, s.borderTopLeftRadius);
    if (s.boxShadow !== 'none') bump(shadows, s.boxShadow.slice(0, 80));
  }
  const hEl = document.querySelector('h1,h2');
  const headingFont = hEl ? getComputedStyle(hEl).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null;
  /* шрифт текста — тот, которым набрано больше всего знаков, а не значение на body (у конструкторов там дефолт) */
  const famTop = top(fam, 1)[0];
  const bodyFont = famTop ? famTop.value : getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const pEl = [...document.querySelectorAll('p')].find(visible);
  const bodySize = getComputedStyle(pEl || document.body).fontSize;
  const h1 = document.querySelector('h1'); const h1s = h1 ? getComputedStyle(h1) : null;

  /* секции: потоковые дети body; обёртки (main, div с несколькими крупными детьми,
     идущими друг под другом) раскрываются; абсолютные слои — подложки,
     затемнения, холсты — секциями не считаются */
  const skipTag = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|SVG|CANVAS|DIALOG|IFRAME)$/;
  const inflow = (el) => { const s = getComputedStyle(el); return !skipTag.test(el.tagName) && s.position !== 'absolute' && s.position !== 'fixed' && s.display !== 'none' && el.getBoundingClientRect().height > 40; };
  const unwrap = (els, depth) => els.flatMap((el) => {
    if (!inflow(el)) return [];
    const kids = [...el.children].filter(inflow);
    const tall = kids.filter((k) => k.getBoundingClientRect().height > 150);
    const stacked = tall.every((k, i) => i === 0 || k.getBoundingClientRect().top >= tall[i - 1].getBoundingClientRect().bottom - 10);
    const wrapper = el.tagName === 'MAIN' || (depth < 4 && tall.length >= 2 && stacked && !el.querySelector(':scope > h1, :scope > h2'));
    return wrapper && kids.length ? unwrap(kids, depth + 1) : [el];
  });
  const header = document.querySelector('header'), footer = document.querySelector('footer');
  const secEls = [...new Set([header, ...unwrap([...document.body.children], 0), footer].filter(Boolean))].filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 40);
  const sections = secEls.map((el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect(); const h = el.querySelector('h1,h2,h3');
    return { el: sig(el), top: Math.round(r.top + scrollY), height: Math.round(r.height), paddingTop: Math.round(parseFloat(s.paddingTop)), background: hex(s.backgroundColor), hasBgImage: /url\(/.test(s.backgroundImage), heading: h ? txt(h).slice(0, 50) : null, images: el.querySelectorAll('img,picture,video,canvas,svg').length, ctas: el.querySelectorAll('a[class*="btn"],a[class*="button"],button').length, textChars: txt(el).length, position: s.position };
  });
  const headerEl = header || document.querySelector('[class*="header"], [role="banner"]');
  const headerInfo = headerEl ? { height: Math.round(headerEl.getBoundingClientRect().height), position: getComputedStyle(headerEl).position, shareOfScreen: Math.round(headerEl.getBoundingClientRect().height / vh * 100) } : null;
  const firstScreen = { h1AboveFold: !!(h1 && h1.getBoundingClientRect().top < vh), ctasAboveFold: ctas.filter((c) => c.aboveFold).length, hasHeroMedia: [...document.querySelectorAll('img,video,canvas,picture')].some((e) => visible(e) && e.getBoundingClientRect().top < vh && e.getBoundingClientRect().height > vh * 0.25), header: headerInfo, text: heroText };

  /* --- движение и интерактив --- */
  let keyframes = 0, reducedMotion = false, unreadable = 0;
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch { unreadable++; continue; }
    const walk = (list) => { for (const r of list) { if (r.type === CSSRule.KEYFRAMES_RULE) keyframes++; else if (r.type === CSSRule.MEDIA_RULE) { if (/prefers-reduced-motion/.test(r.conditionText)) reducedMotion = true; walk(r.cssRules); } else if (r.cssRules) walk(r.cssRules); } };
    walk(rules);
  }
  const anims = document.getAnimations();
  const motion = {
    running: anims.length, infinite: anims.filter((a) => a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity).length,
    keyframes, unreadableSheets: unreadable, reducedMotionRule: reducedMotion, smoothScroll: getComputedStyle(document.documentElement).scrollBehavior === 'smooth',
    withTransitions: all.filter((el) => parseFloat(getComputedStyle(el).transitionDuration) > 0).length,
    hiddenBelowFold: all.filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.top + scrollY > vh && r.height > 30 && (parseFloat(s.opacity) < 0.95 || (s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)')); }).length,
    sticky: all.filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position)).slice(0, 8).map((el) => ({ el: sig(el), position: getComputedStyle(el).position })),
  };
  const interactive = {
    toggles: [...document.querySelectorAll('[aria-expanded], [aria-controls], .burger, [class*="burger"], [class*="menu-toggle"], [class*="hamburger"]')].filter(visible).slice(0, 10).map(sig),
    dialogs: document.querySelectorAll('dialog, [role="dialog"], [class*="modal"], [class*="popup"]').length,
    sliders: document.querySelectorAll('.swiper, .splide, [class*="slider"], [class*="carousel"]').length,
    tabs: document.querySelectorAll('[role="tab"]').length, accordions: document.querySelectorAll('details, [class*="accordion"]').length,
    inputs: document.querySelectorAll('input:not([type="hidden"]), textarea, select').length, links: document.querySelectorAll('a[href]').length, buttons: document.querySelectorAll('button, [role="button"]').length,
    hashLinks: document.querySelectorAll('a[href^="#"]').length, telLinks: document.querySelectorAll('a[href^="tel:"]').length,
  };

  return {
    viewport: { width: vw, height: vh, dpr: devicePixelRatio },
    tech: { frameworks, generator, libs, scriptHints, scripts: scriptSrcs.length, inlineScripts: [...document.scripts].filter((s) => !s.src).length, thirdParty, styles, images, canvases, media, dom, overflowing, meta },
    content: { headings, nav, ctas, forms, words, paragraphs: paragraphs.length, longestParagraphs: paragraphs.sort((a, b) => b.length - a.length).slice(0, 3).map((t) => t.slice(0, 220)), phones, emails, prices, faq, social },
    visual: { palette: { backgrounds: top(bg, 8), text: top(fg, 6), ctaBackgrounds: top(ctas.reduce((m, c) => { if (c.filled) bump(m, c.bg); return m; }, {}), 4) }, fonts: { used: top(fam, 5), heading: headingFont, body: bodyFont, bodySize, h1: h1s ? { size: h1s.fontSize, weight: h1s.fontWeight, lineHeight: h1s.lineHeight, transform: h1s.textTransform, family: h1s.fontFamily.split(',')[0].replace(/["']/g, '') } : null, loaded: [...document.fonts].filter((f) => f.status === 'loaded').length, failed: [...document.fonts].filter((f) => f.status === 'error').length }, radius: top(radius, 4), shadows: Object.keys(shadows).length, sections, firstScreen },
    motion, interactive,
  };
}

/* ---------- прогон одного экрана ---------- */
async function inspect(browser, url, name, vp, shotsDir, opt) {
  const page = await openPage(browser, url, vp, { scheme: opt.scheme || 'light' });
  const t0 = Date.now();
  await page.screenshot({ path: path.join(shotsDir, `${name}-first.png`) });
  const data = await page.evaluate(inPage);
  const scroll = await scrollThrough(page, { shotsDir: opt.light ? null : shotsDir, tag: `${name}-scroll` });
  /* после прокрутки: что из спрятанного появилось, и ошибки, накопившиеся по пути */
  const afterScroll = await page.evaluate(() => {
    const vh = innerHeight; const els = [...document.body.querySelectorAll('*')];
    const stillHidden = els.filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 30 && r.top + scrollY > vh && s.display !== 'none' && parseFloat(s.opacity) < 0.05; }).length;
    return { stillHidden, pageHeight: document.documentElement.scrollHeight, animationsNow: document.getAnimations().length, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  await fullPageShot(page, path.join(shotsDir, `${name}-full.png`));
  const timing = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const p = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)])); return n ? { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: p['first-contentful-paint'] || null, transferKb: Math.round((n.transferSize || 0) / 1024) } : null; });
  const out = { ...data, overlay: page.overlay, afterScroll, timing, log: { consoleErrors: page.log.console.filter((c) => c.type === 'error'), consoleWarnings: page.log.console.filter((c) => c.type === 'warning').length, pageErrors: page.log.errors, failedRequests: page.log.failed.slice(0, 20) }, resources: summarizeRequests(page.log.requests), took: Date.now() - t0, scroll };
  await page.close();
  return out;
}

/* ---------- сводка для чтения ---------- */
function writeSummary(url, run, per, design, order) {
  const d = per.desktop || per[order[0]]; const m = per.mobile;
  const L = [];
  L.push(`# Разведка: ${url}`, '', `Дата: ${new Date().toLocaleDateString('sv-SE')} · папка прогона: \`${run}\``, '', '> Состояние: ANALYZED. Снято с живой страницы, но ни одна анимация, клик или 3D ещё не проверены как работающие — это runtime.mjs.', '');
  L.push('## Что открыть глазами', '', ...order.map((v) => `- \`${v}-first.png\`, \`${v}-full.png\` — первый экран и вся страница (${v})`), '- `*-scroll-NN.png` — страница по мере прокрутки: видно появления блоков и ленивую подгрузку', '');
  const t = d.tech, im = t.images;
  L.push('## Техника', '',
    `- платформа: ${t.frameworks.join(', ') || 'без фреймворка (обычный HTML/CSS/JS)'}${t.generator ? ` · generator: ${t.generator}` : ''}`,
    `- библиотеки: ${Object.entries(t.libs).map(([k, v]) => (v === true ? k : `${k} ${v}`)).join(', ') || 'не выявлено'}${t.scriptHints.length ? ` · по именам скриптов: ${t.scriptHints.join(', ')}` : ''}`,
    `- скрипты: ${t.scripts} внешних, ${t.inlineScripts} встроенных · стили: ${t.styles.external.length} файлов, ${t.styles.inlineBlocks} блоков · сторонние домены: ${t.thirdParty.join(', ') || 'нет'}`,
    `- DOM: ${t.dom.nodes} узлов · высота ${t.dom.pageHeight}px (${t.dom.screens} экранов) · HTML ${kb(t.dom.htmlBytes)}`,
    `- заставка при загрузке: ${d.overlay && d.overlay.hadOverlay ? `${d.overlay.overlay}, ${d.overlay.gone ? `ушла через ${d.overlay.waitedMs} мс` : `НЕ ушла за ${d.overlay.waitedMs} мс — закрывает страницу`}` : 'нет'}`,
    `- холсты: ${t.canvases.length ? t.canvases.map((c) => `${c.el} ${c.w}×${c.h} ${c.ctx}`).join('; ') : 'нет'} · видео: ${t.media.video} (автоплей ${t.media.autoplayVideo}) · iframe: ${t.media.iframes.length} · Lottie: ${t.media.lottie} · встроенных SVG: ${t.media.svgInline}`,
    `- картинки: ${im.count}, ленивых ${im.lazy}, без alt ${im.noAlt}, битых ${im.broken}, фоновых ${im.bgImages} · форматы: ${Object.entries(im.formats).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}${im.oversized.length ? ` · грузятся крупнее, чем показаны: ${im.oversized.map((o) => `${o.src} ${o.natural}→${o.shown}`).join('; ')}` : ''}`,
    `- meta: title «${t.meta.title}» · description ${t.meta.description ? 'есть' : 'НЕТ'} · viewport ${t.meta.viewport || 'НЕТ'} · lang ${t.meta.lang || 'НЕТ'} · h1 на странице: ${t.meta.h1Count} · og:image ${t.meta.ogImage ? 'есть' : 'нет'} · favicon ${t.meta.favicon ? 'есть' : 'нет'}`,
    `- загрузка: ${d.timing ? `TTFB ${d.timing.ttfb} мс · FCP ${d.timing.fcp || '?'} мс · load ${d.timing.load} мс` : 'не измерена'} · передано ${d.resources.totalKb} КБ в ${d.resources.count} запросах: ${Object.entries(d.resources.byType).map(([k, v]) => `${k} ${v.count}/${Math.round(v.bytes / 1024)}КБ`).join(', ')}`,
    `- самое тяжёлое: ${d.resources.largest.slice(0, 5).map((r) => `${r.url.split('/').pop().slice(0, 40)} ${r.kb}КБ`).join('; ') || '—'}`, '');
  L.push('## Ошибки и сбои', '');
  for (const v of order) {
    const p = per[v]; const errs = p.log.consoleErrors.length + p.log.pageErrors.length;
    L.push(`- ${v}: консоль ${p.log.consoleErrors.length} ошибок, исключений ${p.log.pageErrors.length}, предупреждений ${p.log.consoleWarnings}, упавших запросов ${p.log.failedRequests.length}${p.tech.dom.horizontalOverflow || p.afterScroll.horizontalOverflow ? ' · **горизонтальная прокрутка**' + (p.tech.overflowing.length ? ` (${p.tech.overflowing.join(', ')})` : '') : ''}${p.afterScroll.stillHidden ? ` · после прокрутки остались невидимыми ${p.afterScroll.stillHidden} блоков (появление не сработало или ждёт клика)` : ''}`);
    if (errs) L.push(...[...p.log.consoleErrors.map((c) => c.text), ...p.log.pageErrors].slice(0, 6).map((e) => `    - ${e.replace(/\n/g, ' ').slice(0, 160)}`));
    if (p.log.failedRequests.length) L.push(...p.log.failedRequests.slice(0, 4).map((f) => `    - ${f.reason}: ${f.url}`));
  }
  L.push('');
  const c = d.content;
  L.push('## Содержимое', '', `- слов на странице: ${c.words} · абзацев: ${c.paragraphs} · цен: ${c.prices.length ? c.prices.slice(0, 6).join(', ') : 'не найдено'} · FAQ: ${c.faq ? 'есть' : 'нет'}`, `- контакты: ${[...c.phones, ...c.emails].join(', ') || 'не найдены в тексте'} · соцсети: ${c.social.map((s) => s.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]).join(', ') || 'нет'}`, '', '### Заголовки', '', ...c.headings.map((h) => `${h.level === 'h1' ? '' : h.level === 'h2' ? '  ' : '    '}- ${h.level}: ${h.text}${h.aboveFold ? ' (первый экран)' : ''}`), '', '### Навигация', '', c.nav.map((n) => `${n.text} → ${n.href}`).join(' · ') || '— нет', '', '### Кнопки и призывы', '', ...c.ctas.slice(0, 15).map((b) => `- «${b.text}» ${b.tag}${b.href ? ` → ${b.href}` : ''} · ${b.filled ? `заливка ${b.bg}` : b.bordered ? 'контурная' : 'без стиля'}, ${b.w}×${b.h}, радиус ${b.radius}${b.aboveFold ? ' · первый экран' : ''}`), '', '### Формы', '', ...(c.forms.length ? c.forms.map((f) => `- ${f.fields.map((x) => `${x.type}${x.name ? `:${x.name}` : ''}${x.required ? '*' : ''}${x.labelled ? '' : ' (без подписи)'}`).join(', ')} → «${f.submit || '?'}» · action ${f.action || '—'} · согласие ${f.consent ? 'есть' : 'нет'}${f.visible ? '' : ' · скрыта'}`) : ['— нет']), '', '### Самые длинные абзацы (тон голоса)', '', ...c.longestParagraphs.map((p) => `> ${p}`), '');
  const vis = d.visual;
  L.push('## Визуал (замеры, не мнение)', '', `- фоны по площади: ${vis.palette.backgrounds.map((x) => x.value).join(', ')}`, `- цвета текста: ${vis.palette.text.map((x) => x.value).join(', ')}`, `- заливки кнопок: ${vis.palette.ctaBackgrounds.map((x) => x.value).join(', ') || 'нет'}`, `- шрифты: заголовки «${vis.fonts.heading}», текст «${vis.fonts.body}» ${vis.fonts.bodySize}${vis.fonts.h1 ? ` · h1: ${vis.fonts.h1.size}/${vis.fonts.h1.weight}, ${vis.fonts.h1.transform}` : ''} · загружено начертаний ${vis.fonts.loaded}, не загрузилось ${vis.fonts.failed}`, `- радиусы: ${vis.radius.map((x) => x.value).join(', ') || 'нет'} · теней: ${vis.shadows}`, `- первый экран: h1 ${vis.firstScreen.h1AboveFold ? 'виден' : 'НЕ виден'} · кнопок ${vis.firstScreen.ctasAboveFold} · крупное медиа ${vis.firstScreen.hasHeroMedia ? 'есть' : 'нет'} · шапка ${vis.firstScreen.header ? `${vis.firstScreen.header.height}px (${vis.firstScreen.header.shareOfScreen}% экрана, ${vis.firstScreen.header.position})` : 'не найдена'}`, `- самый крупный текст первого экрана: ${vis.firstScreen.text.map((x) => `«${x.text}» ${x.size}`).join(' · ')}`, '', '### Секции сверху вниз', '', '| # | блок | высота | фон | заголовок | медиа | кнопок | текста |', '|---|---|---|---|---|---|---|---|', ...vis.sections.map((s, i) => `| ${i + 1} | \`${s.el}\` | ${s.height} | ${s.background || (s.hasBgImage ? 'картинка' : '—')} | ${s.heading || '—'} | ${s.images} | ${s.ctas} | ${s.textChars} |`), '');
  if (m) L.push('### Мобильный экран', '', `- высота ${m.tech.dom.pageHeight}px (${m.tech.dom.screens} экранов) · секций ${m.visual.sections.length} · шапка ${m.visual.firstScreen.header ? `${m.visual.firstScreen.header.height}px, ${m.visual.firstScreen.header.shareOfScreen}%` : '—'} · h1 ${m.visual.firstScreen.h1AboveFold ? 'виден' : 'НЕ виден'} · кнопок на первом экране ${m.visual.firstScreen.ctasAboveFold}`, `- переключатели меню: ${m.interactive.toggles.join(', ') || 'не найдены'} · кнопка позвонить: ${m.interactive.telLinks ? 'есть' : 'нет'}`, '');
  const mo = d.motion, it = d.interactive;
  L.push('## Движение и интерактив (наличие, не качество)', '', `- анимаций запущено при загрузке: ${mo.running} (бесконечных ${mo.infinite}) · после прокрутки ${d.afterScroll.animationsNow} · ключевых кадров в CSS: ${mo.keyframes}${mo.unreadableSheets ? ` (+${mo.unreadableSheets} таблиц стилей не прочитаны, кросс-домен)` : ''}`, `- элементов с переходами: ${mo.withTransitions} · кандидатов на появление при прокрутке: ${mo.hiddenBelowFold} · закреплённые: ${mo.sticky.map((s) => `${s.el} (${s.position})`).join(', ') || 'нет'}`, `- уважает «меньше движения»: ${mo.reducedMotionRule ? 'правило есть' : 'НЕТ'} · плавная прокрутка: ${mo.smoothScroll ? 'да' : 'нет'}`, `- меню/переключатели: ${it.toggles.length} · диалоги: ${it.dialogs} · слайдеры: ${it.sliders} · вкладки: ${it.tabs} · аккордеоны: ${it.accordions} · полей ввода: ${it.inputs} · ссылок ${it.links}, кнопок ${it.buttons}, якорей ${it.hashLinks}`, '');
  L.push('## Дизайн-система', '', design ? `Снята скиллом design-reference: \`${design}\` — переменные в \`.tokens.css\`, замеры в \`.json\`.` : 'Не снималась (нет скилла design-reference рядом или указан --no-design). Палитра и шрифты выше — только по замерам этой страницы.', '');
  L.push('## Что дальше', '', '1. Открыть снимки и заполнить визуальный разбор по `reference/discovery.md` (язык дизайна, иерархия, приём, что сохранить).', '2. Прогнать `runtime.mjs` по всему, что зависит от JS: меню, формы, слайдеры, холсты, появления.', '3. Составить матрицу «менять / не трогать» и план по приоритетам P0–P5 (`reference/analysis.md`).', '');
  return L.join('\n');
}

/* ---------- запуск ---------- */
const { pos, opt } = parseArgs(process.argv.slice(2));
if (!pos[0]) { console.error('Нужен адрес: node discover.mjs <url> [--out папка] [--viewports desktop,tablet,mobile] [--no-design] [--light]'); process.exit(1); }
const url = pos[0];
const run = ensureDir(runDir(opt, url));
const tag = opt.tag || 'before';
const shotsDir = ensureDir(path.join(run, tag));
const viewports = pickViewports(opt.viewports);

const browser = await launch();
const per = {};
try {
  for (const [name, vp] of viewports) {
    process.stdout.write(`· ${name} ${vp.width}×${vp.height} … `);
    try { per[name] = await inspect(browser, url, name, vp, shotsDir, opt); console.log(`ок (${(per[name].took / 1000).toFixed(1)} с, ошибок в консоли ${per[name].log.consoleErrors.length})`); }
    catch (e) { console.log(`сбой: ${e.message}`); per[name] = { error: e.message }; }
  }
} finally { await browser.close(); }

const good = Object.fromEntries(Object.entries(per).filter(([, v]) => !v.error));
if (!Object.keys(good).length) { console.error('Ни один экран не снялся — адрес недоступен или браузер не поднялся.'); process.exit(1); }

/* дизайн-система — через соседний скилл, если он есть */
let design = null;
if (!opt['no-design']) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const extractPath = path.join(here, '..', '..', 'design-reference', 'scripts', 'extract.mjs');
  if (fs.existsSync(extractPath)) {
    process.stdout.write('· дизайн-система (design-reference) … ');
    try {
      const mod = await import(new URL('file:///' + extractPath.replace(/\\/g, '/')).href);
      const designDir = ensureDir(path.join(run, 'design'));
      const data = await mod.extract(url, { shotsDir: null, light: !!opt.light });
      fs.writeFileSync(path.join(designDir, 'site.json'), JSON.stringify(data, null, 1));
      fs.writeFileSync(path.join(designDir, 'site.tokens.css'), mod.tokensCss(data));
      design = path.join(designDir, 'site');
      console.log('ок');
    } catch (e) { console.log(`пропущена: ${e.message}`); }
  }
}

writeJson(path.join(run, 'discovery.json'), { url, takenAt: new Date().toISOString(), viewports: Object.keys(good), per: good, design });
fs.writeFileSync(path.join(run, 'discovery.md'), writeSummary(url, run, good, design, Object.keys(good)));
console.log(`\nГотово: ${run}\n  discovery.md — сводка, discovery.json — данные, ${tag}/ — снимки${design ? ', design/ — переменные' : ''}`);
