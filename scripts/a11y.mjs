#!/usr/bin/env node
/**
 * Доступность: то, что можно проверить в живом DOM без чтения экрана.
 *
 *   node a11y.mjs <url> [--viewport mobile] [--out папка] [--tag имя]
 *
 * Проверяется: контраст текста к фактическому фону (WCAG AA: 4.5:1, крупный
 * текст 3:1) — по вычисленным цветам, а на картинках и градиентах по снимку
 * фона за текстом (худшие 10% пикселей); картинки без alt, поля без подписи,
 * кнопки и ссылки без имени, порядок заголовков, число h1, lang, запрет
 * масштабирования, положительный tabindex, видимость фокуса при обходе
 * клавишей Tab, размер целей нажатия на телефоне (24 px), правило
 * prefers-reduced-motion в стилях, автоплей видео.
 *
 * Не заменяет Lighthouse и не проверяет чтение экраном — это дополнение,
 * которое работает на любом адресе и даёт список конкретных элементов.
 */
import path from 'node:path';
import { launch, openPage, VIEWPORTS, parseArgs, runDir, writeJson, sleep, ensureDir, loadSharp, SIG_FN } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
if (!pos[0]) { console.error('Нужен адрес: node a11y.mjs <url> [--viewport mobile]'); process.exit(1); }
const url = pos[0]; const vpName = opt.viewport || 'desktop'; const vp = VIEWPORTS[vpName];
if (!vp) { console.error(`Неизвестный экран ${vpName}`); process.exit(1); }
const run = runDir(opt, url); const outDir = ensureDir(path.join(run, 'a11y'));
const tag = opt.tag || vpName;

const browser = await launch();
const page = await openPage(browser, url, vp);
await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
await sleep(400);

const dom = await page.evaluate((sigSrc, isMobile) => {
  const sig = eval(sigSrc);
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.05; };
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  /* фактический фон: идём вверх, накладывая полупрозрачные слои; картинка или градиент на пути — по снимку (ниже) */
  const bgOf = (el) => {
    const layers = []; let n = el; let solid = null;
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n); if (s.backgroundImage !== 'none') return null;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) { if (c.a >= 1) { solid = c; break; } layers.push(c); }
      n = n.parentElement;
    }
    if (!solid) { const h = parse(getComputedStyle(document.documentElement).backgroundColor); solid = h && h.a >= 1 ? h : { r: 255, g: 255, b: 255, a: 1 }; }
    let acc = solid;
    for (let i = layers.length - 1; i >= 0; i--) { const c = layers[i]; acc = { r: c.r * c.a + acc.r * (1 - c.a), g: c.g * c.a + acc.g * (1 - c.a), b: c.b * c.a + acc.b * (1 - c.a), a: 1 }; }
    return acc;
  };
  const contrast = { checked: 0, unknown: 0, failures: {}, imgList: [] };
  const textEls = [...document.body.querySelectorAll('*')].filter((el) => vis(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)).slice(0, 600);
  /* картинки, лежащие не в предках текста, а рядом (карточка: фото и подпись поверх — соседи):
     если такой элемент накрывает центр текста, фон надо мерить по снимку, а не по цвету секции */
  const imgLike = [...document.body.querySelectorAll('img, video, canvas, picture, *')].filter((e) => { if (!vis(e)) return false; if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(e.tagName)) return true; const bi = getComputedStyle(e).backgroundImage; return bi && bi !== 'none'; }).map((e) => { const r = e.getBoundingClientRect(); return { e, l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY }; });
  const coveredByImage = (el) => { const r = el.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2 + scrollY; return imgLike.some((i) => i.e !== el && !i.e.contains(el) && !el.contains(i.e) && cx >= i.l && cx <= i.r && cy >= i.t && cy <= i.b); };
  for (const el of textEls) {
    const s = getComputedStyle(el); const fg = parse(s.color); if (!fg || fg.a < 0.99) continue;
    const size = parseFloat(s.fontSize); const large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700); const need = large ? 3 : 4.5;
    let bg = bgOf(el);
    if (bg && coveredByImage(el)) bg = null;
    if (!bg) {
      contrast.unknown++;
      /* по снимку — до 60 элементов, но не больше трёх одинаковых (по тегу и классам): сто карточек одного вида не нужны */
      const key = sig(el) + '|' + hex(fg); contrast.perSig = contrast.perSig || {}; contrast.perSig[key] = (contrast.perSig[key] || 0) + 1;
      if (contrast.imgList.length < 60 && contrast.perSig[key] <= 3) { const idx = contrast.imgList.length; el.setAttribute('data-rw-imgbg', idx); contrast.imgList.push({ idx, sig: sig(el), text: el.textContent.trim().slice(0, 30), fg: hex(fg), fgRgb: fg, size: Math.round(size), need }); }
      continue;
    }
    contrast.checked++;
    const r = ratio(fg, bg);
    if (r < need) { const key = `${hex(fg)} на ${hex(bg)}`; const f = contrast.failures[key] || (contrast.failures[key] = { ratio: Math.round(r * 100) / 100, need, count: 0, examples: [] }); f.count++; if (f.examples.length < 3) f.examples.push(`${sig(el)} «${el.textContent.trim().slice(0, 30)}» ${Math.round(size)}px`); }
  }
  const imgsNoAlt = [...document.images].filter((i) => vis(i) && !i.hasAttribute('alt')).map((i) => (i.currentSrc || i.src).split('/').pop().slice(0, 50)).slice(0, 10);
  const decorativeEmpty = [...document.images].filter((i) => i.getAttribute('alt') === '').length;
  const unlabeled = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')].filter((i) => vis(i) && !((i.labels && i.labels.length) || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.getAttribute('title'))).map((i) => `${sig(i)}${i.placeholder ? ` (только placeholder «${i.placeholder}»)` : ''}`).slice(0, 10);
  const nameless = [...document.querySelectorAll('a, button, [role=button]')].filter((el) => vis(el) && !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.querySelector('img[alt]:not([alt=""]), svg[aria-label], svg title'))).map(sig).slice(0, 10);
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map((h) => +h.tagName[1]);
  const skips = []; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skips.push(`h${hs[i - 1]}→h${hs[i]}`);
  const vpMeta = (document.querySelector('meta[name=viewport]') || {}).content || '';
  const targets = isMobile ? [...document.querySelectorAll('a[href], button, [role=button], input[type=checkbox], input[type=radio], summary')].filter((el) => { if (!vis(el)) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); const inline = s.display === 'inline' && el.parentElement && /^(p|li|td|span|dd)$/i.test(el.parentElement.tagName); return !inline && (r.width < 24 || r.height < 24); }).map((el) => { const r = el.getBoundingClientRect(); return `${sig(el)} ${Math.round(r.width)}×${Math.round(r.height)}`; }).slice(0, 10) : [];
  const smallInputs = isMobile ? [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((i) => vis(i) && parseFloat(getComputedStyle(i).fontSize) < 16).map(sig).slice(0, 6) : [];
  let reduced = false; for (const sh of document.styleSheets) { try { const walk = (rs) => { for (const r of rs) { if (r.type === CSSRule.MEDIA_RULE) { if (/prefers-reduced-motion/.test(r.conditionText)) reduced = true; walk(r.cssRules); } } }; walk(sh.cssRules); } catch { /* кросс-домен */ } }
  return { contrast, imgsNoAlt, imgsNoAltCount: [...document.images].filter((i) => vis(i) && !i.hasAttribute('alt')).length, decorativeEmpty, unlabeled, nameless, headings: { count: hs.length, h1: hs.filter((h) => h === 1).length, skips }, lang: document.documentElement.lang || null, zoomBlocked: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?(\D|$)/i.test(vpMeta), positiveTabindex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length, targets, smallInputs, reducedMotionRule: reduced, autoplayVideo: [...document.querySelectorAll('video[autoplay]')].filter((v) => !v.muted).length, skipLink: !!document.querySelector('a[href^="#"][class*="skip"], a[href="#main"], a[href="#content"]'), landmarks: { main: document.querySelectorAll('main, [role=main]').length, nav: document.querySelectorAll('nav, [role=navigation]').length, header: document.querySelectorAll('header, [role=banner]').length, footer: document.querySelectorAll('footer, [role=contentinfo]').length }, iframesNoTitle: [...document.querySelectorAll('iframe')].filter((f) => !f.title).length };
}, SIG_FN, !!vp.isMobile);

/* контраст на картинках и градиентах: прячем текст, снимаем фон за ним, считаем по пикселям */
const imgContrast = { measured: 0, skipped: 0, failures: [] };
const sharp = loadSharp();
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
      const fgL = lumRgb(it.fgRgb.r, it.fgRgb.g, it.fgRgb.b); const n = info.width * info.height; const stride = Math.max(1, Math.floor(n / 4000)); const ratios = [];
      for (let p = 0; p < n; p += stride) { const i = p * 4; const l = lumRgb(data[i], data[i + 1], data[i + 2]); ratios.push((Math.max(l, fgL) + 0.05) / (Math.min(l, fgL) + 0.05)); }
      ratios.sort((a, b) => a - b);
      const p10 = ratios[Math.floor(ratios.length * 0.1)], median = ratios[Math.floor(ratios.length / 2)];
      imgContrast.measured++;
      if (p10 < it.need) imgContrast.failures.push({ sig: it.sig, text: it.text, fg: it.fg, size: it.size, p10: Math.round(p10 * 100) / 100, median: Math.round(median * 100) / 100, need: it.need });
    } catch { imgContrast.skipped++; try { await h.evaluate((el) => el.classList.remove('rw-hide-text')); } catch { /* ушёл */ } }
  }
  await page.evaluate(() => scrollTo(0, 0)); await sleep(200);
}

/* фокус: обходим Tab и смотрим, видно ли, где мы */
const focus = { visited: 0, invisible: [], trapped: false };
const PROPS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'backgroundColor', 'borderTopColor', 'color', 'textDecorationLine'];
let prev = null, sameSteps = 0;
for (let i = 0; i < 30; i++) {
  await page.keyboard.press('Tab'); await sleep(80);
  /* сравниваем сами элементы, а не подписи: пять ссылок подряд с одной подписью — не ловушка */
  const cur = await page.evaluate((props, sigSrc) => { const sig = eval(sigSrc); const el = document.activeElement; if (!el || el === document.body) return null; const type = (el.getAttribute('type') || '').toLowerCase(); if (el.__rwSeen) return { sig: sig(el), same: true, type }; el.__rwSeen = true; const s = getComputedStyle(el); const focused = Object.fromEntries(props.map((p) => [p, s[p]])); el.blur(); const s2 = getComputedStyle(el); const base = Object.fromEntries(props.map((p) => [p, s2[p]])); el.focus({ preventScroll: true }); return { sig: sig(el), changed: props.some((p) => focused[p] !== base[p]), same: false, type }; }, PROPS, SIG_FN);
  if (!cur) break;
  /* поле даты в Chrome — три внутренних сегмента: Tab ходит по ним, это не ловушка */
  if (cur.same) { if (/^(date|time|datetime-local|month|week)$/.test(cur.type) && (sameSteps = sameSteps + 1) <= 4) continue; focus.trapped = true; break; }
  sameSteps = 0; prev = cur.sig; focus.visited++;
  if (!cur.changed) focus.invisible.push(cur.sig);
}
await browser.close();

const lines = []; let fails = 0, warns = 0;
const L = (st, what, det) => { if (st === 'FAIL') fails++; if (st === 'WARN') warns++; lines.push({ status: st, what, details: det }); console.log(`${st.padEnd(4)} ${what}${det ? ' — ' + det : ''}`); };
const cf = Object.entries(dom.contrast.failures).sort((a, b) => b[1].count - a[1].count);
L(cf.length ? 'FAIL' : 'OK', `контраст: проверено ${dom.contrast.checked} элементов${dom.contrast.unknown ? `, ещё ${dom.contrast.unknown} на картинке или градиенте — см. ниже` : ''}`, cf.length ? cf.slice(0, 5).map(([k, v]) => `${k} = ${v.ratio}:1 (нужно ${v.need}:1), ${v.count} эл.: ${v.examples.join(', ')}`).join(' | ') : 'все пары проходят AA');
if (dom.contrast.unknown) L(imgContrast.failures.length ? 'FAIL' : imgContrast.measured ? 'OK' : 'WARN', `контраст на картинке и градиенте (оценка по снимку фона за текстом): измерено ${imgContrast.measured}${imgContrast.skipped ? `, пропущено ${imgContrast.skipped}` : ''}${dom.contrast.unknown > dom.contrast.imgList.length ? `, не измерялось ${dom.contrast.unknown - dom.contrast.imgList.length}` : ''}`, imgContrast.failures.length ? imgContrast.failures.slice(0, 6).map((f) => `${f.sig} «${f.text}» ${f.fg} ${f.size}px: худшие 10% фона дают ${f.p10}:1 при медиане ${f.median}:1 (нужно ${f.need}:1)`).join(' | ') : imgContrast.measured ? 'везде не ниже нормы' : 'нет sharp — не измерено');
L(dom.imgsNoAltCount ? 'FAIL' : 'OK', `картинки без alt: ${dom.imgsNoAltCount}`, dom.imgsNoAlt.join(', ') || `у декоративных alt="" — ${dom.decorativeEmpty}`);
L(dom.unlabeled.length ? 'FAIL' : 'OK', `поля без подписи: ${dom.unlabeled.length}`, dom.unlabeled.join(', '));
L(dom.nameless.length ? 'FAIL' : 'OK', `кнопки и ссылки без имени: ${dom.nameless.length}`, dom.nameless.join(', '));
L(dom.headings.h1 === 1 && !dom.headings.skips.length ? 'OK' : 'WARN', `заголовки: ${dom.headings.count}, h1 — ${dom.headings.h1}`, dom.headings.skips.length ? `пропуски уровней: ${dom.headings.skips.join(', ')}` : dom.headings.h1 !== 1 ? 'h1 должен быть один' : 'порядок соблюдён');
L(dom.lang ? 'OK' : 'FAIL', `lang документа: ${dom.lang || 'нет'}`, dom.lang ? '' : 'читалка не поймёт язык, переносы и произношение будут чужими');
L(dom.zoomBlocked ? 'FAIL' : 'OK', 'масштабирование', dom.zoomBlocked ? 'запрещено в meta viewport — слабовидящие не смогут увеличить' : 'разрешено');
L(dom.positiveTabindex ? 'WARN' : 'OK', `положительный tabindex: ${dom.positiveTabindex}`, dom.positiveTabindex ? 'ломает естественный порядок обхода' : '');
L(focus.invisible.length ? 'FAIL' : focus.trapped ? 'WARN' : focus.visited ? 'OK' : 'WARN', `фокус: обошли ${focus.visited} элементов${focus.trapped ? `, дальше Tab не двигает фокус с ${prev}` : ''}`, focus.invisible.length ? `не видно фокуса на: ${focus.invisible.slice(0, 8).join(', ')}` : focus.trapped ? 'ловушка фокуса или перехват Tab — проверить руками' : focus.visited ? 'фокус виден везде' : 'нечего обходить или Tab не работает');
if (vp.isMobile) { L(dom.targets.length ? 'WARN' : 'OK', `цели нажатия мельче 24px: ${dom.targets.length}`, dom.targets.join(', ')); L(dom.smallInputs.length ? 'WARN' : 'OK', `поля мельче 16px: ${dom.smallInputs.length}`, dom.smallInputs.length ? 'iOS увеличит страницу при фокусе: ' + dom.smallInputs.join(', ') : ''); }
L(dom.reducedMotionRule ? 'OK' : 'WARN', 'prefers-reduced-motion', dom.reducedMotionRule ? 'правило есть' : 'правила нет — анимации не отключаются для тех, кому от них плохо');
L(dom.autoplayVideo ? 'FAIL' : 'OK', `видео с автоплеем и звуком: ${dom.autoplayVideo}`);
L(dom.landmarks.main ? 'OK' : 'WARN', `ориентиры: main ${dom.landmarks.main}, nav ${dom.landmarks.nav}, header ${dom.landmarks.header}, footer ${dom.landmarks.footer}`, dom.landmarks.main ? '' : 'нет <main> — читалка не найдёт начало содержимого');
if (dom.iframesNoTitle) L('WARN', `iframe без title: ${dom.iframesNoTitle}`);
const verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
console.log(`\n${verdict}: ${fails} провалов, ${warns} предупреждений`);
const file = path.join(outDir, `${tag}.json`);
writeJson(file, { url, viewport: vpName, takenAt: new Date().toISOString(), dom: { ...dom, contrast: { ...dom.contrast, imgList: dom.contrast.imgList.map(({ fgRgb, ...rest }) => rest) } }, imgContrast, focus, lines, verdict });
console.log(`Сохранено: ${file}`);
