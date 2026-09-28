/**
 * Что на странице раскрывается по клику: аккордеоны (details, [aria-expanded] и «свои» — Framer,
 * Tilda, Webflow), переключатели меню (бургер), вкладки (role=tab и ряды кнопок с одной активной),
 * раскрывающиеся кнопки ([aria-expanded="false"]). Одно правило для discover.mjs (FAQ, паспорт,
 * меню с селектором для runtime --click), motion.mjs (движение по клику) и extract.mjs скилла
 * design-reference (паспорт: аккордеон). Меняете правило — прогоните все три (стенд, shapefest, VN3D).
 *
 *   const found = await findClickTargets(page, { want: ['accordions', 'toggles', 'tabs', 'disclosures'], maxToggles: 3 });
 *   await probeAccordions(page, found.accordions.groups, { touch });   // подтверждение кликом (details — последними)
 *   await probeToggles(page, found.toggles, { touch });                // открывает ли меню ссылки (до 2 переключателей)
 *   accordionItems(found.accordions)                                  // details + подтверждённые пункты
 *
 * Точка нажатия — в координатах видимого окна (visualViewport): на телефоне у страницы шире экрана
 * окно раскладки больше видимого, и клик по getBoundingClientRect уходит мимо; точка за краем экрана
 * не нажимается («за краем экрана»), а не считается «клик не раскрыл». Пересчёт — SCREEN_POINT_FN
 * (сдвиг на offsetLeft/offsetTop, без умножения на scale; исходник для evaluateWith, им же может
 * пользоваться motion.mjs). Перед кликом точка берётся заново: наведение сдвигает видимое окно.
 *
 * Метки в странице: data-rw-cacc (пункт аккордеона), data-rw-ctog (меню), data-rw-ctab
 * («n:t» — вкладка, на которую нажать, «n:c» — активная, к ней вернуться), data-rw-cexp, data-rw-chook.
 *
 * Tilda (#allrecords с data-tilda-page-id или блоки .t-rec[data-record-type]): служебное конструктора
 * (IS_TILDA_SERVICE_FN: плашка Made on Tilda, t-mbfix, полоса T360) и обрезанное артбордом Zero Block
 * (внутри .t396__artboard: CLIP_SHARE_FN < 0.05 или спрятано обрезкой overflow — элементы других
 * брейкпоинтов и вынесенные за край, текст автолейаута .tn-molecule) не нажимается и не считается;
 * пункт аккордеона — не обёртка Tilda (блок .t-rec, #t-footer/footer.t-records, артборд). Так уходят
 * ложные «свои аккордеоны» (madeon footer.t-records ×7, zero.tilda.cc div.t396__artboard ×6 и
 * div.tn-molecule ×13); бегущая строка T1003 и магазин — как слайдер. Хуки окон и меню (want 'hooks'):
 * ссылка a[href^="#popup:"] → окно [data-tooltip-hook="<href>"] (T1093, T702…), a[href="#menuopen"] →
 * шторка T450/T451 — соответствие из разметки, не эвристикой; нажимает их motion.mjs.
 *
 *   node clicks.mjs selftest    стенд fixtures/clicks/index.html: desktop, mobile и mobile с увеличенным
 *                               видимым окном (scale 1.25); fixtures/clicks/tilda.html — desktop и mobile
 *                               (артборды, автолейаут, подвал — не аккордеон; T668 — аккордеон; хуки);
 *                               что ждём — data-expect у блоков
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateWith, scrollToY, launch, openPage, pickViewports, EFFECTIVE_OPACITY_FN, SIG_FN, HEX_FN, CLIP_SHARE_FN, IS_TILDA_SERVICE_FN, sleep } from './lib.mjs';

/**
 * Точка из координат окна раскладки (getBoundingClientRect, elementFromPoint) — в координаты видимого
 * окна, в которых нажимают page.mouse и page.touchscreen. На телефоне у страницы шире экрана окно
 * раскладки больше видимого (стенд motion: innerWidth 469 при экране 390) и видимое сдвинуто
 * (visualViewport.offsetTop 169): без пересчёта клик уходит на 169 px ниже. off — точка за краем экрана.
 * Только сдвиг, без умножения на visualViewport.scale: мышь и касание в CDP — в CSS px от угла видимого
 * окна, масштаб Chrome применяет сам. Проверено: после прохода discover у стенда motion scale 1.056, и
 * клик по «(x − offset) × scale» уходил на 23 px ниже summary (details не раскрывался), по «x − offset» —
 * раскрывал (24 → 88 px); selftest ловит это проходом с масштабом 1.25.
 * Исходник для eval внутри страницы: evaluateWith(page, fn, arg, { screenPt: SCREEN_POINT_FN }).
 */
export const SCREEN_POINT_FN = `(x, y) => {
  const vv = window.visualViewport; if (!vv) return { x: Math.round(x), y: Math.round(y), off: false };
  const cx = Math.round(x - vv.offsetLeft), cy = Math.round(y - vv.offsetTop);
  return { x: cx, y: cy, off: cx < 1 || cy < 1 || cx > vv.width - 1 || cy > vv.height - 1 };
}`;

const DEPS = { eff: EFFECTIVE_OPACITY_FN, sig: SIG_FN, hex: HEX_FN, screenPt: SCREEN_POINT_FN, clip: CLIP_SHARE_FN, svc: IS_TILDA_SERVICE_FN };

/* ---------- в странице ---------- */
function clickTargetsInPage(arg) {
  const want = new Set((arg && arg.want) || ['accordions', 'toggles', 'tabs', 'disclosures']);
  const maxToggles = Math.max(1, Math.min(10, (arg && arg.maxToggles) || 3));
  const vw = innerWidth, vh = innerHeight, sy = scrollY;
  for (const a of ['data-rw-cacc', 'data-rw-ctog', 'data-rw-ctab', 'data-rw-cexp', 'data-rw-chook']) for (const e of document.querySelectorAll(`[${a}]`)) e.removeAttribute(a);
  const csM = new Map(); const cs = (el, p) => { if (p) return getComputedStyle(el, p); let s = csM.get(el); if (!s) { s = getComputedStyle(el); csM.set(el, s); } return s; };
  const effM = new Map(); const E = (el) => { let v = effM.get(el); if (v === undefined) { v = eff(el); effM.set(el, v); } return v; };
  const rM = new Map(); const R = (el) => { let r = rM.get(el); if (!r) { r = el.getBoundingClientRect(); rM.set(el, r); } return r; };
  const txt = (el) => ((el && (typeof el.innerText === 'string' ? el.innerText : el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const ownText = (el) => { let t = ''; for (const n of el.childNodes) if (n.nodeType === 3) t += ' ' + n.textContent; return t.replace(/\s+/g, ' ').trim(); };
  const sigNoId = (el) => el.tagName.toLowerCase() + (el.classList && el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '');
  /* Tilda: служебное конструктора и обрезанное артбордом Zero Block — не нажимать и не считать */
  const root0 = document.getElementById('allrecords');
  const TILDA = !!(root0 && root0.hasAttribute('data-tilda-page-id')) || !!document.querySelector('.t-rec[data-record-type]');
  const cutM = new Map();
  const tildaCut = (el) => {
    if (!TILDA) return false;
    let v = cutM.get(el); if (v !== undefined) return v;
    v = svc(el) ? 'service' : el.closest('.t396__artboard') && clip(el) < 0.05 ? 'clipped' : false;
    cutM.set(el, v); return v;
  };
  const onScreen = (el, min = 0.05) => { const r = R(el); if (!(r.width > 0 && r.height > 0)) return false; if (r.bottom + sy <= 0 || r.right <= 0 || r.left >= vw) return false; return E(el) > min && !tildaCut(el); };
  const inConsent = (el) => !!el.closest('[data-rw-consent-box]');
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR|WBR|HEAD|TITLE)$/;
  const TAIL_GLYPH = /[\s›»>+＋−–—×✕✚▾▼▿▸▶⌄˅∨⌃^❯⟩〉⏷↓-]+$/;
  const errors = [];
  const everything = [...document.body.querySelectorAll('*')].filter((el) => !SKIP.test(el.tagName) && !el.ownerSVGElement);
  const all = everything.filter((el) => onScreen(el));
  const cssPath = (el) => {
    const esc = (x) => (window.CSS && CSS.escape ? CSS.escape(x) : x);
    const uniqSel = (x) => { try { const l = document.querySelectorAll(x); return l.length === 1 && l[0] === el; } catch (e) { return false; } };
    if (el.id && uniqSel('#' + esc(el.id))) return '#' + esc(el.id);
    for (const at of ['aria-label', 'data-framer-name', 'title', 'data-testid']) { const v = el.getAttribute(at); if (v) { const x = `${el.tagName.toLowerCase()}[${at}="${v.replace(/"/g, '\\"')}"]`; if (uniqSel(x)) return x; } }
    const cls = [...el.classList].filter((c) => !/^(is-|has-)|active|open|hover|focus/.test(c)).slice(0, 3).map(esc);
    if (cls.length && uniqSel(el.tagName.toLowerCase() + '.' + cls.join('.'))) return el.tagName.toLowerCase() + '.' + cls.join('.');
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 10; e = e.parentElement) {
      if (e.id && e !== el) { parts.unshift('#' + esc(e.id)); if (uniqSel(parts.join(' > '))) return parts.join(' > '); break; }
      let p = e.tagName.toLowerCase(); const c = [...e.classList].filter((x) => !/^(is-|has-)|active|open|hover|focus/.test(x)).slice(0, 2).map(esc); if (c.length) p += '.' + c.join('.');
      const sib = e.parentElement ? [...e.parentElement.children].filter((k) => k.tagName === e.tagName) : [];
      if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(p); if (uniqSel(parts.join(' > '))) return parts.join(' > ');
    }
    return parts.join(' > ');
  };
  const nameOf = (e) => [e.getAttribute('data-framer-name'), e.getAttribute('aria-label'), typeof e.className === 'string' ? e.className : '', e.id].filter(Boolean).join(' ');

  /* --- аккордеоны: видимый вопрос, значок и спрятанный внутри ответ от 30 знаков --- */
  let accordions = { details: 0, groups: [], byClass: 0, detailsNearFaq: 0, faq: null };
  if (want.has('accordions')) try {
    const hidM = new Map();
    const hiddenHow = (el) => {
      if (hidM.has(el)) return hidM.get(el);
      let how = null; const r = R(el);
      if (cs(el).display === 'contents') how = null;
      else if (!(r.width > 0 && r.height > 1)) how = el.getClientRects().length ? 'нулевая высота' : 'display:none';
      else if (E(el) <= 0.05) how = 'прозрачен';
      else {
        let l = r.left, t = r.top, rt = r.right, b = r.bottom;
        for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
          const s = cs(p); if (s.overflowX === 'visible' && s.overflowY === 'visible' && s.clipPath === 'none') continue;
          const pr = R(p); l = Math.max(l, pr.left); t = Math.max(t, pr.top); rt = Math.min(rt, pr.right); b = Math.min(b, pr.bottom);
          if (rt <= l || b <= t) { how = 'обрезан overflow'; break; }
        }
        if (!how && (rt - l) * (b - t) < r.width * r.height * 0.1) how = 'обрезан overflow';
      }
      hidM.set(el, how); return how;
    };
    const fixM = new Map();
    const fixedAnc = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { let f = fixM.get(e); if (f === undefined) { f = cs(e).position === 'fixed'; fixM.set(e, f); } if (f) return true; } return false; };
    const ACC_EXCL = 'nav, header, [role="navigation"], [role="menu"], [role="menubar"], [role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"], [role="tabpanel"], [role="tablist"], [data-rw-consent-box], select, template';
    const GLYPH = /^[›»>+＋−–—×✕✚▾▼▿▸▶⌄˅∨⌃^❯⟩〉⏷↓-]$/;
    const ICON_NAME = /chevron|arrow|caret|plus|toggle|icon|expand|collapse|стрелк|плюс/i;
    const chevronIn = (item, hid) => {
      for (const e of item.querySelectorAll('*')) {
        if (hid.contains(e)) continue; const r = R(e);
        if (!(r.width >= 2 && r.height >= 6 && r.width <= 44 && r.height <= 44) || E(e) <= 0.3) continue;
        const t = ownText(e); if (t && GLYPH.test(t)) return `знак «${t}»`;
        if (r.width < 6) continue;
        const tag = e.tagName.toLowerCase();
        if (tag === 'svg' || tag === 'img') return tag === 'svg' ? 'svg-значок' : 'картинка-значок';
        const nm = nameOf(e); if (ICON_NAME.test(nm)) return `значок ${(e.getAttribute('data-framer-name') || nm).slice(0, 24)}`;
        const s = cs(e); if (!t && r.width <= 24 && r.height <= 24 && s.transform !== 'none' && (parseFloat(s.borderRightWidth) > 0 || parseFloat(s.borderBottomWidth) > 0)) return 'уголок из рамки';
      }
      for (const e of [item, ...item.querySelectorAll('*')]) {
        if (hid.contains(e)) continue;
        for (const pe of ['::before', '::after']) { const c = String(cs(e, pe).content || '').replace(/^["']|["']$/g, '').trim(); if (c && c !== 'none' && c !== 'normal' && GLYPH.test(c)) return `знак «${c}» (${pe})`; }
      }
      return null;
    };
    const questionIn = (item, hid) => {
      for (const e of [item, ...item.querySelectorAll('*')]) {
        if (hid.contains(e)) continue;
        const o = ownText(e); if (o.length < 2 || E(e) <= 0.3 || hiddenHow(e)) continue;
        const t = (e.contains(hid) ? o : txt(e)).replace(TAIL_GLYPH, '');
        if (t.length >= 3) return t.slice(0, 160);
      }
      return null;
    };
    const SLIDER = '.swiper, .splide, .slick-slider, .glide, .flickity-enabled, .t-slds, .t1003, .t-store, .js-store, [class*="carousel"], [class*="slider"], [aria-roledescription="carousel"]';
    /* Tilda: спрятанное обрезкой внутри артборда Zero Block — элементы других брейкпоинтов, вынесенные за край, текст
       автолейаута (.tn-molecule); у Zero Block своих аккордеонов нет (раскрытие по клику — SBS click, оно прозрачностью).
       Пункт — не обёртка Tilda: блок, подвал и шапка проекта, артборд целиком */
    const TILDA_WRAP = '.t-records, #t-footer, #t-header, footer.t-records, .t-rec, .t396, .t396__artboard, .t396__carrier, .t396__filter';
    const tildaHidden = (el) => TILDA && (!!tildaCut(el) || (!!el.closest('.t396__artboard') && hiddenHow(el) === 'обрезан overflow'));
    const prevQuestion = (h, item) => {
      for (let x = h; x && x !== item; x = x.parentElement) {
        for (let p = x.previousElementSibling; p; p = p.previousElementSibling) {
          if (hiddenHow(p) || E(p) <= 0.3) continue;
          const t = txt(p).replace(TAIL_GLYPH, ''); if (t.length >= 3 && t.length <= 300) return t.slice(0, 160);
        }
      }
      return null;
    };
    const FAQ_RE = /(^|[^a-zа-яё])(faq|f\.a\.q\.?)([^a-zа-яё]|$)|frequently\s+asked|частые\s+вопросы|часто\s+задаваемые|вопросы\s+и\s+ответы|ответы\s+на\s+(частые\s+)?вопросы|^\s*вопросы\s*[:.!?]?\s*$|^\s*questions\s*[:.!?]?\s*$|q\s*&\s*a/i;
    const faqHeadEl = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],[class*="title"],[class*="heading"]')].find((h) => { if (!onScreen(h) || inConsent(h)) return false; const t = txt(h); return t.length <= 80 && FAQ_RE.test(t); });
    /* бегущая строка и карусель по кругу: обрезанная копия ленты — не спрятанный ответ (VN3D: дорожка игр) */
    const loopEls = new Set(); try { for (const a of document.getAnimations()) { const tm = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; if (tm.iterations === Infinity && a.effect.target) loopEls.add(a.effect.target); } } catch (e) { /* нет WAAPI */ }
    const inLoop = (el) => { for (const t of loopEls) if (t.contains(el) || el.contains(t)) return true; return false; };
    const byItem = new Map();
    for (const el of everything) {
      if (!hiddenHow(el) || (loopEls.size && inLoop(el)) || tildaHidden(el)) continue;
      const par = el.parentElement; if (!par || par === document.body || hiddenHow(par)) continue;
      const tc = (el.textContent || '').replace(/\s+/g, ' ').trim(); if (tc.length < 30) continue;
      if (el.closest(ACC_EXCL) || el.closest('details') || el.closest(SLIDER) || fixedAnc(par)) continue;
      const linkChars = [...el.querySelectorAll('a')].reduce((a, x) => a + (x.textContent || '').trim().length, 0);
      if (linkChars > tc.length * 0.5) continue;
      if (el.querySelector('img,video,iframe,canvas') && tc.length < 80) continue;
      let item = par, q = null;
      for (let d = 0; d < 6 && item && item !== document.body; d++) { if (cs(item).display !== 'contents') { q = questionIn(item, el); if (q) break; } item = item.parentElement; }
      if (!q || !item || item === document.body || tc.startsWith(q) || (TILDA && item.matches(TILDA_WRAP))) continue;
      let rec = byItem.get(item); if (!rec) byItem.set(item, rec = { item, q, hids: [] });
      rec.hids.push({ el, tc });
    }
    const accItems = [];
    for (const rec of byItem.values()) {
      const n = rec.hids.length; const ir = R(rec.item);
      if (ir.height < 16 || ir.height > 240 * n || ir.width < 140) continue;
      const link = rec.item.closest('a[href]'); if (link && !/^(#|javascript:)/i.test(link.getAttribute('href') || '')) continue;
      const kind = rec.item.querySelector('[aria-expanded]') || rec.item.matches('[aria-expanded]') ? 'aria-expanded' : 'свой';
      for (const h of rec.hids) accItems.push({ item: rec.item, how: hiddenHow(h.el), q: (n > 1 && prevQuestion(h.el, rec.item)) || rec.q, answer: h.tc.slice(0, 60), chevron: chevronIn(rec.item, h.el), kind });
    }
    const gmap = new Map();
    for (const rec of accItems) { const key = [sigNoId(rec.item), rec.kind, rec.chevron ? 'значок' : '', rec.how].join('|'); if (!gmap.has(key)) gmap.set(key, { sig: sigNoId(rec.item), kind: rec.kind, how: rec.how, chevron: rec.chevron, items: [] }); gmap.get(key).items.push(rec); }
    let accId = 0;
    for (const gr of gmap.values()) {
      const n = gr.items.length; const qm = gr.items.filter((x) => /\?\s*$/.test(x.q)).length;
      if (!((gr.chevron && (n >= 2 || faqHeadEl || qm)) || (n >= 3 && (faqHeadEl || qm >= n / 2)))) continue;
      const probe = gr.items.slice(0, 2).map((x) => { const id = x.item.getAttribute('data-rw-cacc') || 'a' + (accId++); x.item.setAttribute('data-rw-cacc', id); return { id, q: x.q.slice(0, 80), answer: x.answer }; });
      const inClass = gr.items.every((x) => !!x.item.closest('[class*="accordion"]'));
      const ex = gr.items[0].item.closest('[data-expect]');
      accordions.groups.push({ sig: gr.sig, kind: gr.kind, how: gr.how, chevron: gr.chevron, count: n, flat: new Set(gr.items.map((x) => x.item)).size < n, qMarks: qm, inClass, top: Math.round(R(gr.items[0].item).top + sy), questions: gr.items.slice(0, 4).map((x) => x.q.slice(0, 80)), probe, expect: ex ? ex.dataset.expect : '' });
    }
    /* details/summary: считаются отдельно (accordions.details), а для кликов — группой по родителю
       (kind 'details'; в паспорт второй раз не идут) */
    const dets = [...document.querySelectorAll('details')].filter((d) => onScreen(d) && !inConsent(d) && !d.open && d.querySelector('summary'));
    const byPar = new Map(); for (const d of dets) { const k = d.parentElement; if (!byPar.has(k)) byPar.set(k, []); byPar.get(k).push(d); }
    for (const list of [...byPar.values()].sort((a, b) => b.length - a.length).slice(0, 3)) {
      const d = list[0]; const sm = d.querySelector('summary'); const id = 'd' + (accId++); d.setAttribute('data-rw-cacc', id);
      const answer = [...d.childNodes].filter((n) => n !== sm).map((n) => n.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
      const ex = d.closest('[data-expect]');
      accordions.groups.push({ sig: sigNoId(d), kind: 'details', how: 'details/summary', chevron: chevronIn(sm, document.createElement('i')) || 'маркер details', count: list.length, flat: false, qMarks: list.filter((x) => /\?\s*$/.test(txt(x.querySelector('summary')))).length, inClass: false, native: true,
        top: Math.round(R(d).top + sy), questions: list.slice(0, 4).map((x) => txt(x.querySelector('summary')).slice(0, 80)), probe: [{ id, q: txt(sm).slice(0, 80), answer: answer.slice(0, 60) }], expect: ex ? ex.dataset.expect : '' });
    }
    const detVis = [...document.querySelectorAll('details')].filter((d) => onScreen(d));
    accordions.details = detVis.length;
    accordions.byClass = [...document.querySelectorAll('[class*="accordion"]')].filter((e) => onScreen(e)).length;
    accordions.faq = faqHeadEl ? { heading: txt(faqHeadEl).slice(0, 60), top: Math.round(R(faqHeadEl).top + sy) } : null;
    /* details под заголовком FAQ (до 4000 px ниже) — пункты FAQ для discover (faqSummary) */
    const faqTop = accordions.faq ? accordions.faq.top : null;
    accordions.detailsNearFaq = faqTop == null ? 0 : detVis.filter((d) => { const y = R(d).top + sy; return y >= faqTop - 50 && y <= faqTop + 4000; }).length;
  } catch (e) { errors.push(`аккордеоны: ${String(e.message || e).slice(0, 120)}`); }

  /* --- переключатель меню (бургер) в шапке: aria-expanded, имя, знак, 2–4 полоски --- */
  const toggles = [];
  if (want.has('toggles')) try {
    const clickable = (e) => { for (let x = e, d = 0; x && d < 3; x = x.parentElement, d++) { if (x.matches('button,[role="button"],a,label,summary,[onclick],[tabindex]') || cs(x).cursor === 'pointer') return true; } return false; };
    const rotated = (s) => { const m = /matrix\(([^)]+)\)/.exec(s.transform || ''); return !!m && Math.abs(parseFloat(m[1].split(',')[1]) || 0) > 0.05; };
    /* полоска — залита видимым цветом (hex из lib: прозрачный в любой записи, в том числе oklch(… / 0), — null) или с рамкой */
    const barsIn = (e) => {
      let n = 0;
      for (const k of [e, ...e.querySelectorAll('*')]) {
        if (k !== e) { const r = R(k); const s = cs(k); if (r.height > 0 && r.height <= 4 && r.width >= 10 && r.width <= 48 && E(k) > 0.3 && !rotated(s) && (hex(s.backgroundColor) || parseFloat(s.borderTopWidth) > 0)) n++; }
        for (const pe of ['::before', '::after']) { const ps = cs(k, pe); if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue; const h = parseFloat(ps.height) || 0, w = parseFloat(ps.width) || 0; if (h > 0 && h <= 4 && w >= 10 && w <= 48 && !rotated(ps) && (hex(ps.backgroundColor) || parseFloat(ps.borderTopWidth) > 0)) n++; }
      }
      return n;
    };
    const headZone = (e) => {
      if (e.closest('header, nav, [role="banner"], [role="navigation"]')) return true;
      for (let x = e; x && x !== document.body; x = x.parentElement) { const p = cs(x).position; if (p === 'fixed' || p === 'sticky') { const r = R(x); return r.top < vh * 0.3 && r.height < vh * 0.5; } }
      return R(e).top + sy < Math.min(160, vh * 0.3);
    };
    const togM = new Map();
    for (const e of all) {
      const r = R(e); if (r.height < 16 || r.height > 72 || r.width < 16 || r.width > 160) continue;
      if (inConsent(e) || !headZone(e) || !clickable(e)) continue;
      const t = txt(e); const label = nameOf(e) + ' ' + (e.getAttribute('title') || '');
      let how = null;
      if ((e.hasAttribute('aria-expanded') || e.hasAttribute('aria-controls')) && r.width <= 72) how = 'aria-expanded';
      else if (/burger|hamburger|menu-?toggle|nav-?toggle|navbar-toggler|menu-?(button|btn|icon|trigger)|mobile-?menu|меню/i.test(label) && t.length <= 12) how = `имя «${label.trim().slice(0, 30)}»`;
      else if (/^(☰|≡|menu|меню)$/i.test(t)) how = `знак «${t}»`;
      else if (r.width <= 72 && t.length <= 1) { const bars = barsIn(e); if (bars >= 2 && bars <= 4) how = `${bars} полоски`; else if (e.querySelector('svg') && /menu|nav|burger|toggle|меню|навигац/i.test(label)) how = 'svg-значок'; }
      if (!how) continue;
      const link = e.closest('a[href]'); if (link && !/^(#|javascript:)/i.test(link.getAttribute('href') || '')) continue;
      togM.set(e, how);
    }
    const toggleEls = [...togM.keys()].filter((e) => ![...togM.keys()].some((o) => o !== e && o.contains(e)));
    toggleEls.slice(0, maxToggles).forEach((e, i) => { e.setAttribute('data-rw-ctog', String(i)); const r = R(e); const ex = e.closest('[data-expect]'); toggles.push({ i, sig: sig(e), selector: cssPath(e), how: togM.get(e), w: Math.round(r.width), h: Math.round(r.height), text: txt(e).slice(0, 20), expect: ex ? ex.dataset.expect : '' }); });
  } catch (e) { errors.push(`переключатели меню: ${String(e.message || e).slice(0, 120)}`); }

  /* --- вкладки: role=tablist, иначе ряд однотипных кнопок (2–8), из которых активна ровно одна
     (класс active/current/selected, aria-pressed, aria-current), не в меню, шапке и подвале --- */
  const tabs = [];
  if (want.has('tabs')) try {
    const STATE = /(^|[-_])(active|current|selected|is-active|is-selected|is-current|w--current|on)($|[-_])/i;
    const isOn = (e) => e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || !!e.getAttribute('aria-current') && e.getAttribute('aria-current') !== 'false' || [...e.classList].some((c) => STATE.test(c));
    const pat = (e) => e.tagName + '.' + [...e.classList].filter((c) => !STATE.test(c)).slice(0, 2).join('.');
    let n = 0;
    const push = (list, cur, how, box) => {
      const target = list.find((t) => t !== cur); if (!target || n >= 3) return;
      target.setAttribute('data-rw-ctab', `${n}:t`); cur.setAttribute('data-rw-ctab', `${n}:c`);
      const ex = box.closest('[data-expect]');
      tabs.push({ n, how, count: list.length, sig: sig(box), target: txt(target).slice(0, 30), current: txt(cur).slice(0, 30), top: Math.round(R(box).top + sy), expect: ex ? ex.dataset.expect : '' }); n++;
    };
    const used = new Set();
    for (const tl of document.querySelectorAll('[role="tablist"]')) {
      if (!onScreen(tl) || inConsent(tl)) continue;
      const list = [...tl.querySelectorAll('[role="tab"]')].filter((t) => onScreen(t));
      if (list.length < 2) continue;
      list.forEach((t) => used.add(t));
      push(list, list.find((t) => t.getAttribute('aria-selected') === 'true') || list[0], 'role=tab', tl);
    }
    const parents = new Set();
    for (const e of all) {
      if (used.has(e) || !e.matches('button, [role="button"], a[href^="#"], a:not([href]), li, [class*="tab"]')) continue;
      if (e.closest('nav, header, footer, [role="navigation"], [role="tablist"], [role="menu"], [data-rw-consent-box], [data-rw-cacc], form')) continue;
      if (e.parentElement) parents.add(e.parentElement);
    }
    for (const p of parents) {
      const kids = [...p.children].filter((k) => onScreen(k));
      if (kids.length < 2 || kids.length > 8) continue;
      const pt = pat(kids[0]); if (!kids.every((k) => pat(k) === pt)) continue;
      if (!kids.every((k) => { const r = R(k); const t = txt(k); return r.height >= 20 && r.height <= 90 && r.width >= 30 && r.width <= 420 && t.length >= 1 && t.length <= 40; })) continue;
      const on = kids.filter(isOn); if (on.length !== 1) continue;
      if (kids.some((k) => { const a = k.closest('a[href]') || k.querySelector('a[href]'); return a && !/^(#|javascript:)/i.test(a.getAttribute('href') || ''); })) continue;
      push(kids, on[0], 'ряд кнопок, одна активна', p);
    }
  } catch (e) { errors.push(`вкладки: ${String(e.message || e).slice(0, 120)}`); }

  /* --- раскрывающиеся кнопки: [aria-expanded="false"] вне меню шапки, аккордеонов и вкладок --- */
  const disclosures = [];
  if (want.has('disclosures')) try {
    for (const e of all) {
      if (disclosures.length >= 3) break;
      if (e.getAttribute('aria-expanded') !== 'false' || inConsent(e) || e.closest('[data-rw-cacc], [data-rw-ctog], [role="tablist"]') || e.querySelector('[data-rw-ctog]')) continue;
      const r = R(e); if (r.width < 16 || r.width > 420 || r.height < 12 || r.height > 90) continue;
      const link = e.closest('a[href]'); if (link && !/^(#|javascript:)/i.test(link.getAttribute('href') || '')) continue;
      e.setAttribute('data-rw-cexp', String(disclosures.length));
      const ex = e.closest('[data-expect]');
      disclosures.push({ i: disclosures.length, sig: sig(e), text: txt(e).slice(0, 30), controls: e.getAttribute('aria-controls') || '', top: Math.round(r.top + sy), expect: ex ? ex.dataset.expect : '' });
    }
  } catch (e) { errors.push(`раскрывающиеся кнопки: ${String(e.message || e).slice(0, 120)}`); }

  /* --- хуки Tilda: ссылка → окно или меню по атрибуту data-tooltip-hook (соответствие точное, из разметки) --- */
  const hooks = [];
  if (want.has('hooks') && TILDA) try {
    const codeOf = (r) => { if (!r) return null; for (const e of [r, ...r.querySelectorAll('[class]')].slice(0, 60)) { const c = [...e.classList].find((x) => /^t\d{2,4}$/.test(x)); if (c) return c.toUpperCase(); } return null; };
    const byHref = new Map();
    for (const a of document.querySelectorAll('a[href^="#popup:"], a[href="#menuopen"]')) {
      const href = a.getAttribute('href'); const g = byHref.get(href) || { href, links: 0, a: null };
      g.links++; if (!g.a && onScreen(a)) g.a = a; byHref.set(href, g);
    }
    for (const g of byHref.values()) {
      if (!g.a || hooks.length >= 6) continue;
      let t = null; try { t = document.querySelector(`[data-tooltip-hook="${g.href.replace(/"/g, '\\"')}"]`); } catch (e) { /* селектор */ }
      const rec = t ? t.closest('.t-rec') : null; const i = hooks.length; g.a.setAttribute('data-rw-chook', String(i));
      const ex = g.a.closest('[data-expect]'); const r = R(g.a);
      hooks.push({ i, href: g.href, kind: g.href === '#menuopen' ? 'меню' : 'окно', links: g.links, sig: sig(g.a), selector: cssPath(g.a), text: txt(g.a).slice(0, 30), top: Math.round(r.top + sy),
        target: t ? { rec: rec ? rec.id : null, code: codeOf(rec) || codeOf(t), sig: sig(t), anim: t.getAttribute('data-anim') || null } : null, expect: ex ? ex.dataset.expect : '' });
    }
  } catch (e) { errors.push(`хуки Tilda: ${String(e.message || e).slice(0, 120)}`); }

  /* что Tilda-правило убрало из поиска (служебное, обрезанное артбордом) — для заметки вызывающего */
  const tilda = TILDA ? { service: [...cutM.values()].filter((v) => v === 'service').length, clipped: [...cutM.values()].filter((v) => v === 'clipped').length } : null;
  return { accordions, toggles, tabs, disclosures, hooks, tilda, errors };
}

/** Найти, что раскрывается по клику. want — какие виды искать; maxToggles — сколько переключателей
    меню вернуть (по умолчанию 3, discover берёт 6). Метки остаются в странице для кликов. */
export function findClickTargets(page, { want = ['accordions', 'toggles', 'tabs', 'disclosures'], maxToggles = 3 } = {}) {
  return evaluateWith(page, clickTargetsInPage, { want, maxToggles }, DEPS);
}

/* ---------- подтверждение аккордеона кликом ---------- */
const sameDoc = (a, b) => String(a).split('#')[0] === String(b).split('#')[0];

function accPointInPage(p) {
  const item = document.querySelector(`[data-rw-cacc="${p.id}"]`); if (!item) return { skip: 'пункт пропал из DOM' };
  if (!p.noScroll) item.scrollIntoView({ block: 'center', behavior: 'instant' });
  const want = String(p.q || '').slice(0, 30); let target = null;
  for (const e of item.querySelectorAll('*')) { const t = (e.innerText || '').replace(/\s+/g, ' ').trim(); if (t && t.startsWith(want)) target = e; }
  const r = (target || item).getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 160)), y = Math.round(r.top + Math.min(r.height / 2, 30));
  const hit = document.elementFromPoint(x, y);
  if (!hit || !(item.contains(hit) || hit.contains(item))) return { skip: 'точку нажатия закрывает другой элемент' };
  const a = hit.closest('a[href]'); if (a && !/^(#|javascript:)/i.test(a.getAttribute('href') || '')) return { skip: 'в точке нажатия ссылка на другой адрес' };
  const s = screenPt(x, y); if (s.off) return { skip: 'точка нажатия за краем экрана (страница шире экрана)' };
  return { x: s.x, y: s.y };
}
/* Видимая доля ответа (ищется по тексту: Framer пересоздаёт узлы при смене варианта) и высота пункта. */
function accStateInPage(p) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const want = norm(p.answer).slice(0, 40); const item = document.querySelector(`[data-rw-cacc="${p.id}"]`);
  let best = null;
  for (const e of document.body.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|TEMPLATE)$/.test(e.tagName) || (e.textContent || '').length < want.length || !e.getClientRects().length) continue;
    if (!norm(e.textContent).startsWith(want)) continue;
    if (!best || best.contains(e) || (item && item.contains(e) && !item.contains(best))) best = e;
  }
  const frac = (el) => {
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || eff(el) <= 0.05) return 0;
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    for (let q = el.parentElement; q && q !== document.body && q !== document.documentElement; q = q.parentElement) {
      const s = getComputedStyle(q); if (s.overflowX === 'visible' && s.overflowY === 'visible' && s.clipPath === 'none') continue;
      const qr = q.getBoundingClientRect(); l = Math.max(l, qr.left); t = Math.max(t, qr.top); rt = Math.min(rt, qr.right); b = Math.min(b, qr.bottom);
      if (rt <= l || b <= t) return 0;
    }
    return Math.round((rt - l) * (b - t) / (r.width * r.height) * 100) / 100;
  };
  const ir = item && item.isConnected ? item.getBoundingClientRect() : null;
  return { found: !!best, frac: best ? frac(best) : 0, h: ir ? Math.round(ir.height) : null };
}

/**
 * До 4 групп (сначала свои, details — последними; внутри — самые большие) и 2 пунктов в группе, не
 * дольше 40 с: навести (ответ показался — наведение, не аккордеон), нажать (ответ виден наполовину или
 * пункт вырос на 20+ px), нажать ещё раз (закрылся ли). На сенсорном экране, если клик мышью не
 * раскрыл, — касание. Пишет в группу tried/opened/closed/status, а если ни один пункт не нажат —
 * skip: почему (точка за краем экрана, закрыта другим элементом, ссылка на другой адрес).
 */
export async function probeAccordions(page, groups, { touch = false } = {}) {
  const t0 = Date.now(); let probed = 0;
  for (const g of [...groups].sort((a, b) => (a.native ? 1 : 0) - (b.native ? 1 : 0) || b.count - a.count)) {
    if (probed >= 4 || Date.now() - t0 > 40000) { g.status = 'не проверен'; g.tried = 0; continue; }
    probed++;
    const tries = [];
    for (const p of g.probe || []) {
      const st = () => evaluateWith(page, accStateInPage, p, DEPS).catch(() => ({ found: false, frac: 0, h: null }));
      const pt = await evaluateWith(page, accPointInPage, p, DEPS).catch(() => null);
      if (!pt || pt.skip) { tries.push({ q: p.q, skip: pt ? pt.skip : 'пункт не найден' }); continue; }
      await sleep(150);
      const s0 = await st();
      await page.mouse.move(pt.x, pt.y, { steps: 3 }).catch(() => {}); await sleep(450);
      const s1 = await st();
      if (s0.frac < 0.5 && s1.frac >= 0.5) { tries.push({ q: p.q, hover: true }); await page.mouse.move(1, 1).catch(() => {}); await sleep(250); continue; }
      const opened = (x) => (x.frac >= 0.5 && s0.frac < 0.5) || (x.h != null && s0.h != null && x.h - s0.h >= 20);
      const url0 = page.url();
      const pn = await evaluateWith(page, accPointInPage, { ...p, noScroll: true }, DEPS).catch(() => null); const cp0 = pn && !pn.skip ? pn : pt;
      await page.mouse.click(cp0.x, cp0.y).catch(() => {}); await sleep(800);
      let s2 = await st();
      if (!opened(s2) && touch && sameDoc(page.url(), url0)) { await page.touchscreen.tap(cp0.x, cp0.y).catch(() => {}); await sleep(800); s2 = await st(); }
      if (!sameDoc(page.url(), url0)) { tries.push({ q: p.q, navigated: page.url() }); g.navigated = page.url(); break; }
      const t = { q: p.q, opened: opened(s2), before: { frac: s0.frac, h: s0.h }, after: { frac: s2.frac, h: s2.h } };
      if (t.opened) {
        const pt2 = await evaluateWith(page, accPointInPage, p, DEPS).catch(() => null); const cp = pt2 && !pt2.skip ? pt2 : pt;
        await page.mouse.click(cp.x, cp.y).catch(() => {}); await sleep(800);
        const s3 = await st(); t.closed = s3.frac < 0.5 || (s3.h != null && s2.h != null && s2.h - s3.h >= 20);
      }
      tries.push(t); await page.mouse.move(1, 1).catch(() => {});
    }
    g.tries = tries; g.tried = tries.filter((t) => !t.skip).length; g.opened = tries.filter((t) => t.opened).length;
    g.closed = tries.filter((t) => t.closed).length; g.hoverOnly = tries.filter((t) => t.hover).length;
    g.status = g.opened ? 'подтверждён' : g.hoverOnly ? 'наведение, не аккордеон' : g.tried ? 'клик не раскрыл' : 'не проверен';
    const sk = !g.tried && tries.find((t) => t.skip); if (sk) g.skip = sk.skip; else delete g.skip;
    if (g.navigated) break;
  }
  return groups;
}

/* ---------- переключатель меню: открывает ли клик навигацию ---------- */

/* Ссылки, видимые в окне и не закрытые другим элементом: «href|текст». */
function linksInViewInPage() {
  const out = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    const r = a.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth || eff(a) <= 0.3) continue;
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 2);
    const hit = document.elementFromPoint(x, y); if (!hit || !(a === hit || a.contains(hit) || hit.contains(a))) continue;
    out.add(`${a.getAttribute('href') || ''}|${(a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30)}`);
  }
  return [...out];
}
/* Точка нажатия переключателя data-rw-ctog: центр, и в центре — он сам. Видимое окно сначала — в начало
   окна раскладки: после проверки аккордеонов внизу страницы шире экрана оно остаётся внизу (offsetTop 182
   на стенде clicks), scrollTo(0, 0) его не возвращает, и шапка выходила «за краем экрана». */
function togPointInPage(i) {
  const e = document.querySelector(`[data-rw-ctog="${i}"]`); if (!e) return null;
  const vv = window.visualViewport; if (vv && (vv.offsetTop || vv.offsetLeft)) document.documentElement.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' });
  const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return null;
  const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y);
  const s = screenPt(x, y);
  return { x: s.x, y: s.y, ok: !!hit && (e.contains(hit) || hit.contains(e)), off: s.off };
}
/**
 * До max переключателей (по умолчанию 2): наверху страницы нажать, открылись ли ссылки (2+ новых видимых
 * и не закрытых), закрыть повторным кликом или Escape. Пишет в переключатель probe:
 * { opens, added, sample, closedBy } | { skip } | { navigated }.
 */
export async function probeToggles(page, toggles, { touch = false, max = 2 } = {}) {
  const links = () => evaluateWith(page, linksInViewInPage, null, DEPS).catch(() => []);
  for (const t of toggles.slice(0, max)) {
    await scrollToY(page, 0); await page.mouse.move(1, 1).catch(() => {}); await sleep(300);
    const pt = await evaluateWith(page, togPointInPage, t.i, DEPS).catch(() => null);
    if (!pt || !pt.ok || pt.off) { t.probe = { skip: !pt ? 'пропал из DOM или не виден' : pt.off ? 'за краем экрана (страница шире экрана)' : 'закрыт другим элементом' }; continue; }
    const before = await links(); const url0 = page.url();
    await page.mouse.click(pt.x, pt.y).catch(() => {}); await sleep(800);
    let added = (await links()).filter((x) => !before.includes(x));
    if (added.length < 2 && touch && sameDoc(page.url(), url0)) { await page.touchscreen.tap(pt.x, pt.y).catch(() => {}); await sleep(800); added = (await links()).filter((x) => !before.includes(x)); }
    if (!sameDoc(page.url(), url0)) { t.probe = { navigated: page.url() }; break; }
    t.probe = { opens: added.length >= 2, added: added.length, sample: added.slice(0, 4).map((x) => x.slice(x.indexOf('|') + 1) || x.split('|')[0]) };
    if (t.probe.opens) {
      const still = async () => (await links()).filter((x) => added.includes(x)).length;
      await page.mouse.click(pt.x, pt.y).catch(() => {}); await sleep(800);
      if ((await still()) <= added.length / 2) t.probe.closedBy = 'повторный клик';
      else { await page.keyboard.press('Escape').catch(() => {}); await sleep(500); t.probe.closedBy = (await still()) <= added.length / 2 ? 'Escape' : null; }
    }
  }
  return toggles;
}

/** Группа считается аккордеоном: подтверждена кликом или кликом не проверялась. */
export const accordionOk = (g) => !g.status || g.status === 'подтверждён' || g.status === 'не проверен';

/** Пунктов аккордеона: details + пункты «своих» групп, которые не отвергнуты кликом (группы details — уже в acc.details). */
export function accordionItems(acc) {
  if (!acc) return 0;
  return (acc.details || 0) + (acc.groups || []).filter((g) => !g.native && accordionOk(g)).reduce((a, g) => a + g.count, 0);
}

/** «свой аккордеон ×7: svg-значок + ответ обрезан overflow, клик раскрывает (2 из 2), второй клик закрывает» */
export function accordionNote(g) {
  const st = g.status === 'подтверждён' ? `клик раскрывает (${g.opened} из ${g.tried})${g.closed === g.opened ? ', второй клик закрывает' : ''}` : g.skip ? `клик не проверен: ${g.skip}` : g.status === 'не проверен' || !g.status ? 'кликом не проверялся' : g.status;
  return `${g.kind === 'details' ? 'аккордеон на details' : g.kind === 'aria-expanded' ? 'аккордеон с aria-expanded' : 'свой аккордеон'} ×${g.count}: ${g.chevron || 'без значка'} + ответ ${g.how}, ${st}`;
}

/* ---------- самопроверка: fixtures/clicks/index.html — desktop, mobile и mobile с масштабом 1.25 ----------
   Третий проход — видимое окно увеличено (Emulation.setPageScaleFactor): так бывает после прохода discover
   (стенд motion: scale 1.056), и точка, умноженная на scale, промахивалась мимо пунктов. */
async function selftest() {
  const url = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'clicks', 'index.html')).href;
  let bad = 0, n = 0;
  const check = (vp, what, ok, got) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${vp} ${what}: ${got}`); };
  const br = await launch();
  try {
    const [[, desk], [, mob]] = pickViewports('desktop,mobile');
    for (const [name, vp, scale] of [['desktop', desk, 1], ['mobile', mob, 1], ['mobile×1.25', mob, 1.25]]) {
      const page = await openPage(br, url, vp, { settle: 0 });
      try {
        if (scale !== 1) {
          const cdp = await page.createCDPSession(); await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale }); await sleep(300);
          const sc = await page.evaluate(() => visualViewport.scale);
          check(name, 'масштаб видимого окна', Math.abs(sc - scale) < 0.01, `visualViewport.scale ${sc}`);
        }
        const found = await findClickTargets(page, { want: ['accordions', 'toggles'] });
        for (const e of found.errors) check(name, 'поиск', false, e);
        const wide = await page.evaluate(() => ({ iw: innerWidth, vw: Math.round(visualViewport.width) }));
        const acc = found.accordions, touch = !!vp.hasTouch;
        await probeAccordions(page, acc.groups, { touch });
        await probeToggles(page, found.toggles, { touch });
        const G = (e) => acc.groups.filter((g) => g.expect === e), T = (e) => found.toggles.filter((t) => t.expect === e);
        const gs = (l) => l.map((g) => `${g.kind}×${g.count} ${g.sig} — ${accordionNote(g)}`).join('; ') || 'нет';
        const ts = (l) => l.map((t) => `${t.selector} (${t.how}) ${JSON.stringify(t.probe || null)}`).join('; ') || 'нет';
        const own = G('acc-own'), hov = G('acc-hover'), det = G('acc-details');
        check(name, 'свой аккордеон', own.length === 1 && own[0].count === 3 && own[0].status === 'подтверждён' && own[0].closed === own[0].opened, gs(own));
        check(name, 'ответ при наведении', hov.length === 1 && hov[0].status === 'наведение, не аккордеон', gs(hov));
        check(name, 'details группой', det.length === 1 && det[0].native && det[0].count === 3 && det[0].status === 'подтверждён', gs(det));
        check(name, 'бегущая строка — не аккордеон', !G('not-acc').length, gs(G('not-acc')));
        check(name, 'details и FAQ', acc.details === 3 && acc.detailsNearFaq === 3 && !!acc.faq && acc.faq.heading === 'Частые вопросы', `details ${acc.details}, у FAQ ${acc.detailsNearFaq}, заголовок ${acc.faq ? `«${acc.faq.heading}»` : 'нет'}`);
        check(name, 'пунктов аккордеона', accordionItems(acc) === 6, `${accordionItems(acc)} (ждали 6: details 3 + свой 3, наведение не в счёт)`);
        const tg = T('toggle'), edge = T('toggle-edge');
        check(name, 'бургер', tg.length === 1 && tg[0].probe && tg[0].probe.opens && tg[0].probe.closedBy === 'повторный клик', ts(tg));
        check(name, 'прозрачные полоски — не бургер', !T('not-toggle').length, ts(T('not-toggle')));
        if (touch) {
          check(name, 'страница шире экрана', wide.iw > wide.vw, `окно раскладки ${wide.iw}, видимое ${wide.vw}`);
          check(name, 'бургер за краем экрана', edge.length === 1 && edge[0].probe && /за краем экрана/.test(edge[0].probe.skip || ''), ts(edge));
        } else check(name, 'бургер у правого края', edge.length === 1 && edge[0].probe && edge[0].probe.opens, ts(edge));
      } finally { await page.close().catch(() => {}); }
    }
    /* Tilda: ложные «свои аккордеоны» из обрезанного артбордом (артборд, автолейаут, подвал проекта), T668,
       хуки окон и меню, служебная плашка */
    const turl = url.replace(/index\.html$/, 'tilda.html');
    for (const [name, vp] of [['tilda desktop', desk], ['tilda mobile', mob]]) {
      const page = await openPage(br, turl, vp, { settle: 0 });
      try {
        const found = await findClickTargets(page, { want: ['accordions', 'toggles', 'hooks'], maxToggles: 6 });
        for (const e of found.errors) check(name, 'поиск', false, e);
        const acc = found.accordions, touch = !!vp.hasTouch;
        await probeAccordions(page, acc.groups, { touch });
        await probeToggles(page, found.toggles, { touch });
        const gs = (l) => l.map((g) => `${g.kind}×${g.count} ${g.sig} — ${accordionNote(g)}`).join('; ') || 'нет';
        const falseAcc = acc.groups.filter((g) => /^not-acc/.test(g.expect || ''));
        check(name, 'артборд, автолейаут, подвал проекта — не аккордеон', !falseAcc.length && !acc.groups.some((g) => /t396__artboard|tn-molecule|t-records/.test(g.sig)), gs(falseAcc.length ? falseAcc : acc.groups.filter((g) => /t396__artboard|tn-molecule|t-records/.test(g.sig))));
        const t668 = acc.groups.filter((g) => g.expect === 'acc-tilda');
        check(name, 'T668 — аккордеон, клик раскрывает', t668.length === 1 && t668[0].count === 3 && t668[0].status === 'подтверждён', gs(t668));
        const H = (h) => (found.hooks || []).find((x) => x.href === h);
        const hm = H('#menuopen'), hp = H('#popup:zayavka');
        check(name, 'хуки из разметки: #menuopen → T450, #popup:zayavka → T1093 (ссылок 2)', !!hm && hm.target && hm.target.code === 'T450' && !!hp && hp.target && hp.target.code === 'T1093' && hp.links === 2 && hp.target.anim === 'fadein', JSON.stringify((found.hooks || []).map((x) => [x.href, x.target && x.target.code, x.links])));
        const tm = found.toggles.filter((t) => t.expect === 'hook-menu');
        check(name, '#menuopen — переключатель меню, клик открывает шторку', tm.length === 1 && tm[0].probe && tm[0].probe.opens, tm.map((t) => `${t.selector} ${JSON.stringify(t.probe || null)}`).join('; ') || 'нет');
        const svcHit = [...acc.groups.filter((g) => g.expect === 'service'), ...found.toggles.filter((t) => t.expect === 'service'), ...(found.hooks || []).filter((x) => x.expect === 'service')];
        check(name, 'плашка Made on Tilda — вне поиска', !svcHit.length && found.tilda && found.tilda.service >= 1, `служебных ${found.tilda && found.tilda.service}, обрезанных артбордом ${found.tilda && found.tilda.clipped}; попало: ${svcHit.length}`);
      } finally { await page.close().catch(() => {}); }
    }
  } finally { await br.close().catch(() => {}); }
  console.log(`${bad ? 'FAIL' : 'OK'}: проверок ${n}, расхождений ${bad} · ${url}`);
  return bad ? 1 : 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  if (process.argv[2] === 'selftest') process.exit(await selftest());
  console.log('clicks.mjs — модуль (findClickTargets, probeAccordions, probeToggles); из командной строки только: node clicks.mjs selftest');
  process.exit(process.argv[2] && !/^(-h|--help)$/.test(process.argv[2]) ? 1 : 0);
}
