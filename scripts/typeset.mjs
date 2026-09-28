#!/usr/bin/env node
/**
 * Набор текста числами: как текст лёг в строки на этой ширине и каким шрифтом он нарисован на самом деле.
 * Правила и числа — reference/typography.md; здесь — что меряется и когда это WARN или FAIL.
 *
 *   node typeset.mjs <url> [--viewports desktop,mobile] [--pages /,/about] [--out <папка прогона>] [--tag имя]
 *                    [--baseline <протокол донора>] [--decisions <json>] [--browser chrome|firefox]
 *                    [--crops N] [--strict] [--json <файл>|-]
 *   node typeset.mjs --selftest [--browser firefox] [--viewports desktop,mobile]
 *   node typeset.mjs --help   (или -h)
 *
 * Флаги:
 *   --viewports   экраны через запятую: пресеты lib.mjs (desktop, laptop, tablet, mobile, mobile-s, android),
 *                 запись ШxВ@плотность («320x568@2») или ширина. По умолчанию desktop,mobile.
 *                 --viewport — то же самое; оба сразу с разными списками — ошибка.
 *   --pages       страницы от адреса через запятую («/,/about»); каждая страница и экран — свой протокол.
 *   --out         папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>). Протоколы —
 *                 <out>/typeset/<tag>-<экран>[-<страница>].json, вырезки — в папке с тем же именем.
 *                 Суффикс страницы — только с --pages.
 *   --tag         имя протокола: base, donor, after… По умолчанию typeset (не в Chrome — typeset-firefox,
 *                 typeset-edge: протокол Chrome не затирается).
 *   --baseline    протокол донора или «до» того же экрана: правила стиля (leading, caps-track, scale,
 *                 families, weights), совпавшие с донором, опускаются до INFO «как у донора». Для других
 *                 экранов берётся соседний файл (donor-desktop.json → donor-mobile.json); «{vp}» в пути
 *                 заменяется именем экрана. Дефекты (висячие, синтетика, системный шрифт) не опускаются.
 *   --decisions   решения { "правило": { "<подпись блока, id или *>": "почему" } }: снимают WARN стиля и
 *                 композиции (measure, h-lines, proximity, justify, leading, caps-track, scale, families,
 *                 weights, hero), но не дефекты. По умолчанию <out>/typeset-decisions.json, если он есть.
 *   --browser     chrome (по умолчанию), firefox, edge. Firefox — для переносов (Chrome без окна не
 *                 переносит: у него нет словарей) и text-wrap: pretty (Firefox 156 его не понимает, а это
 *                 браузер пользователя). В Firefox нет CDP: подмена шрифта видна только по unicode-range.
 *   --crops N     вырезок с подсветкой на экран, по умолчанию 12; 0 — без вырезок.
 *   --strict      код выхода 1, если хоть один экран FAIL.
 *   --json <файл>|-  все протоколы запуска одним файлом; «-» — JSON в stdout, текст — в stderr.
 *   --selftest    стенд fixtures/typeset на своём сервере (порт 4211–4219): каждый случай сверяется с ожидаемым.
 *   --help, -h    эта справка.
 * Неизвестный флаг — ошибка с кодом 1 и подсказкой. Адрес, экраны и значения флагов проверяются до
 * создания папок и запуска браузера.
 *
 * Проход (экран × страница): переход, окно cookie, заставка, document.fonts.ready; прокрутка до низа
 * (появления показаны) и наверх; наблюдение 1 с — блоки, где текст меняется сам (печать, счётчики,
 * бегущая строка), помечаются «меняется само», строчные правила для них не выносятся; замер; шрифты
 * на экране (CDP); проба синтетики; вердикты; вырезки.
 *
 * Замер (LINES_FN). Блок — ближайший предок текста с блочным display. inline-block, inline-flex и
 * inline-grid — свой блок (кнопка, бейдж), кроме разбивки слов для анимации: одно слово внутри и не
 * меньше трёх таких соседей. Текстовые узлы блока склеиваются по порядку, <br> — разделитель, пробелы
 * между span не выбрасываются. Слово — Range через границы узлов («по<b>полам</b>» — одно слово);
 * коробки на одной строке сливаются, коробки на разных — слово разорвано (перенос, дефис, overflow-wrap).
 * Строка — новая, если центр части слова дальше max(4px, 0.5·line-height) от центра текущей. Не берутся:
 * svg, math, script, style, noscript, template, textarea, code, pre, поля ввода; невидимое (итоговая
 * прозрачность < 0.05, коробка до 2 px, clip — sr-only), блок целиком за краем экрана или за краем
 * обрезающего предка. Видимый текст с aria-hidden берётся. white-space: nowrap и pre — только для шрифтов.
 * Заголовок, чей текст разложен по вложенным блокам, меряется целиком. Теневой DOM и iframe не обходятся.
 *
 * Роли: semantic — h1–h6 и role=heading; display — кегль ≥ max(24, 1.5 × основного), текст ≤ 160 знаков;
 * prose — не display, не внутри nav, button, label, figcaption, td, th, текст от 60 знаков; other —
 * остальное. Основной кегль — самый частый по длине текста у блоков от 40 знаков. Экран: телефон — уже 600,
 * планшет — 600–1023, desktop — от 1024.
 *
 * Правила (id — ключ в протоколе и в --decisions):
 *   measure      медиана знаков в полных строках prose: desktop 45–80 OK, 30–44 INFO, < 30 и 81–95 WARN,
 *                > 95 FAIL; планшет 40–80 OK; телефон 28–50 OK, 22–27 и 51–55 INFO, < 22 и > 55 WARN
 *   hang         короткий предлог или союз в конце строки (в, к, с, у, о, и, а, я, во, от, до, по, на, не,
 *                для, при, без, над, под, или…) — WARN одной строкой со счётом; на первом экране (h1, лид,
 *                кнопка) — отдельная строка. Все блоки от 2 строк, кроме nav
 *   orphan       одно слово в последней строке: заголовок — WARN; абзац — если слово ≤ 12 знаков или
 *                строка < 20% ширины
 *   lead, num-unit, hyphen-break   строка начинается с же/ли/бы/тире; «1 000 | ₽»; разрыв «3D-|принтере»
 *   h-lines      h1: desktop ≤ 3 OK, 4–5 WARN, ≥ 6 FAIL; телефон и планшет ≤ 4, 5–6, ≥ 7; h2 > 3 (телефон > 4) WARN
 *   balance      последняя строка заголовка < 40% самой длинной без text-wrap: balance — INFO с рецептом
 *   proximity    h2–h4 ближе к блоку сверху, чем к своему тексту — WARN (> 0.75 — INFO); короткая подпись вплотную
 *                над заголовком (надзаголовок) — часть заголовка
 *   justify      выключка по ширине у prose — WARN; зазор > 3 пробелов — FAIL
 *   hyphens      переносы в заголовках на desktop, без lang — WARN; > 2 переноса подряд — WARN; браузер не
 *                переносит — INFO «проверьте --browser firefox»
 *   leading      интерлиньяж ниже таблицы typography.md п. 2 (допуск 0.03) — WARN, выше — INFO (длинная строка,
 *                тонкий текст на тёмном); h1 и дисплей от 80 px — 0.8–1.05, вне — INFO; < 1.0 у текста до 24 px — FAIL
 *   caps-track   разрядка капса и строчного дисплея (INFO/WARN); разрядка основного текста > 0.03em — WARN
 *   scale        кеглей с текстом от 20 знаков > 8; соседние уровни заголовков ближе 1.1 при одном весе или
 *                перевёрнуты (h2 крупнее h1) — WARN
 *   families     своих гарнитур с ≥ 2% знаков: 3 — WARN, 4 и больше — FAIL (моноширинные и иконки не в счёт)
 *   weights      начертаний одной гарнитуры с ≥ 1% текста больше 4 — WARN
 *   synthetic    синтетический жирный или курсив (проба пикселями, расхождение > 10%) — FAIL
 *   weight-miss  запрошенного веса нет среди граней — рисуется ближайший — INFO
 *   fallback     часть знаков набрана системным шрифтом — WARN, кириллица — FAIL; знаки названы по пробе
 *   fallback-all весь текст блока системным при заданном веб-шрифте — FAIL
 *   font-error   шрифт не загрузился — FAIL
 *   font-display auto или block у шрифта текста — WARN; preload без crossorigin или неиспользованный — WARN;
 *   format       файл шрифта не woff2 — WARN
 *   lang-mismatch кириллицы > 50%, а lang не ru/uk/be/bg/sr/kk — WARN (переносы и кавычки чужие)
 *   nbsp, tnum   «привязано неразрывным пробелом N из M»; колонка цифр без tabular-nums — INFO
 *   hero         первый экран: главная кнопка (первая залитая ниже h1 и до следующего заголовка, без него —
 *                3 экрана) ниже окна — WARN (mobile-s с закреплённой панелью действия — INFO); ось h1, лида и
 *                кнопки (у первого экрана по центру — центры), h1 к основному тексту вне 3–6× (телефон 2–3×) — INFO
 *   word-overflow, near-align   слово шире блока (предок не обрезает); левые края блоков секции расходятся на
 *                2–8 px — INFO (near-align не откалиброван)
 * Кегль — с CSS zoom (currentCSSZoom): у Tilda Zero Block на 1440 zoom 1.2, вычисленный кегль мельче экранного.
 * Итог экрана: FAIL, если есть FAIL; WARN, если есть WARN; иначе OK.
 *
 * Какой шрифт нарисовал текст (Chrome, Edge): CDP CSS.getPlatformFontsForNode для каждого элемента со своим
 * видимым текстом (считает на два уровня вглубь; сумма знаков приблизительная, вердикт — по факту системного
 * шрифта). Какие знаки системные — отдельной пробой: каждый знак блока своим span тем же шрифтом.
 * В Firefox — только знаки вне unicode-range всех граней первой гарнитуры (это наверняка системный шрифт);
 * знаки внутри диапазона, которых нет в файле, видит только прогон в Chrome.
 * Синтетика: проба «ЖёлудьЩиЁж Handglove 0123» 32 px каждым сочетанием гарнитура/вес/стиль у элементов со своим
 * текстом (<em> внутри абзаца — своё сочетание), снимки с font-synthesis и без, доля различающихся пикселей
 * (> 64 из 255) от тёмных; работает в Chrome и Firefox. Ширина не годится: синтетический жирный в Chrome
 * ширину не меняет. Вес вне граней — по правилу подбора CSS: при весе больше 500 сначала тяжелее (700 при
 * 600 и 800 → 800), меньше 400 — легче.
 *
 * Вывод: первая строка — браузер, экран, адрес, блоки по ролям; строки OK/WARN/FAIL/INFO; итог; путь
 * протокола. Вырезки: <tag>-<экран>/NN-<правило>-<id>.png — блок в пунктирной рамке, слова в красной (по
 * коробкам замера); 00-hero.png — первый экран 1:1 с h1, лидом и кнопкой. Порядок вырезок: FAIL, первый
 * экран, hang, orphan, justify, fallback, hyphen-break.
 *
 * Код выхода: 0 — сделано (вердикт в выводе и протоколе); 1 — неверные аргументы, провал --selftest или
 * FAIL с --strict; 3 — страница не открылась или упал браузер.
 *
 * Модуль: export LINES_FN — исходник замера строк для evaluateWith (как SIG_FN):
 *   const lines = eval(LINES_FN);  lines(el) → { lines[], lastLine, hang[], lead[], numSplit[], broken[],
 *   shortTotal, shortNb, maxGap, space, fs, lh, ls, … }; lines(el, null, { deep: true }) — весь текст под el;
 *   lines.collect(root) → Map(блок → текстовые узлы). export measureLines(page, selector) — то же из Node.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launch, preparePage, gotoRetry, waitForOverlay, closeConsent, parseArgs, parseViewport, resolveViewport,
  parseBrowser, findBrowser, browserInfo, defaultBrowser, defaultBrowserHint, VIEWPORTS, pagesFrom, pageSlug,
  runDir, ensureDir, writeJson, readJson, sleep, loadSharp, forceInstantScroll, scrollThrough, scrollToY,
  evaluateWith, collectWarnings, takeWarnings, addStyleSafe, SIG_FN, EFFECTIVE_OPACITY_FN,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* =====================================================================
   В странице: замер строк одного блока (LINES_FN)
   ===================================================================== */
/* Фабрика выполняется в странице и ничего не берёт снаружи: исходник уходит туда строкой */
function linesFactory() {
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|INPUT|SELECT|OPTION|OPTGROUP|DATALIST|CODE|PRE|KBD|SAMP|CANVAS|IFRAME|OBJECT|EMBED|VIDEO|AUDIO|IMG|HEAD|TITLE)$/;
  /* короткие слова, которые не оставляют в конце строки (typography.md п. 9) */
  const SHORT = new Set('в во к ко с со у о об обо от ото до по за из изо на не ни и а но да я мы вы он для при про без над под или'.split(' '));
  const STARTERS = /^(же|ли|ль|бы|б|ж|—|–)$/i;
  const UNIT = /^(₽|руб\.?|р\.|коп\.?|см|мм|м|км|кг|г|л|мл|%|шт\.?|лет|года?|мес\.?|мин\.?|ч|сек\.?|тыс\.?|млн|млрд|°C?|€|\$|кВт|Вт|ГБ|МБ|КБ)[.,;:!?)»]*$/i;
  const NUM = /^[(\[«"„]?[−–-]?\d[\d.,]*$/;
  const LEAD_PUNCT = /^[«„“"'‘(\[]+/;
  const csMemo = new Map();
  const cs = (e) => { let s = csMemo.get(e); if (!s) { s = getComputedStyle(e); csMemo.set(e, s); } return s; };
  const inlineBox = (d) => /^inline-(block|flex|grid|table)$/.test(d) || /^inline (flow-root|flex|grid|table|list-item)/.test(d);
  const flowInline = (d) => d === 'inline' || d === 'contents' || /^ruby/.test(d);
  const oneWord = (e) => { const t = (e.textContent || '').trim(); return !!t && !/\s/.test(t); };
  const splitMemo = new Map();
  /* разбивка слов для анимации: одно слово внутри и не меньше трёх таких соседей */
  const isSplit = (e) => {
    if (splitMemo.has(e)) return splitMemo.get(e);
    let r = false;
    if (oneWord(e) && e.parentElement) { let n = 0; for (const c of e.parentElement.children) { if (inlineBox(cs(c).display) && oneWord(c)) n++; if (n >= 3) { r = true; break; } } }
    splitMemo.set(e, r); return r;
  };
  /* 'skip' — не текст страницы; 'flow' — строчный, текст идёт хозяину выше; 'own' — свой блок */
  const kind = (e) => {
    if (e.namespaceURI !== XHTML || SKIP.test(e.tagName.toUpperCase())) return 'skip';
    const d = cs(e).display;
    if (d === 'none') return 'skip';
    if (flowInline(d)) return 'flow';
    if (inlineBox(d)) return isSplit(e) ? 'flow' : 'own';
    return 'own';
  };
  /* текстовые узлы по блокам-хозяевам в порядке документа; null — разделитель между словами разбивки без пробела */
  function collect(root, { limit = 60000 } = {}) {
    const map = new Map(); const splitLast = new Map(); let count = 0;
    const push = (o, n) => { let l = map.get(o); if (!l) { l = []; map.set(o, l); } l.push(n); };
    const walk = (el, owner, inSplit) => {
      for (let c = el.firstChild; c; c = c.nextSibling) {
        if (++count > limit) return;
        if (c.nodeType === 3) { push(owner, c); if (/\S/.test(c.nodeValue)) splitLast.set(owner, inSplit); continue; }
        if (c.nodeType !== 1) continue;
        if (c.tagName === 'BR') { push(owner, c); splitLast.set(owner, false); continue; }
        const k = kind(c); if (k === 'skip') continue;
        if (k === 'own') { walk(c, c, false); continue; }
        const split = inlineBox(cs(c).display) && (c.textContent || '').trim().length > 1;
        if (split && !inSplit && splitLast.get(owner)) { const l = map.get(owner); const last = l && l[l.length - 1]; if (last && last.nodeType === 3 && /\S$/.test(last.nodeValue)) push(owner, null); }
        walk(c, owner, inSplit || split);
      }
    };
    walk(root, root, false);
    for (const [o, l] of map) if (!l.some((n) => n && n.nodeType === 3 && /\S/.test(n.nodeValue))) map.delete(o);
    return map;
  }
  /* весь текст под el, включая вложенные блоки (заголовок, разложенный по строкам-span) */
  function deepNodes(el) {
    const out = [];
    const walk = (e) => {
      for (let c = e.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { out.push(c); continue; }
        if (c.nodeType !== 1) continue;
        if (c.tagName === 'BR') { out.push(c); continue; }
        const k = kind(c); if (k === 'skip') continue;
        if (k === 'own') { out.push(null); walk(c); out.push(null); } else walk(c);
      }
    };
    walk(el); return out;
  }
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
  let ctx = null;
  function measure(el, nodes, o = {}) {
    const maxWords = o.maxWords || 3000;
    if (!nodes) nodes = o.deep ? deepNodes(el) : (collect(el).get(el) || []);
    const s = cs(el);
    const fs = parseFloat(s.fontSize) || 16;
    const lhPx = s.lineHeight === 'normal' ? fs * 1.2 : (parseFloat(s.lineHeight) || fs * 1.2);
    const tol = Math.max(4, lhPx * 0.5);
    /* склейка текста; parts — где в склейке начинается каждый узел */
    let text = ''; const parts = [];
    for (const n of nodes) { parts.push({ node: n, start: text.length }); text += n && n.nodeType === 3 ? n.nodeValue : '\n'; }
    const at = (i) => { let lo = 0, hi = parts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (parts[mid].start <= i) lo = mid; else hi = mid - 1; } const p = parts[lo]; return p && p.node && p.node.nodeType === 3 && i - p.start < p.node.nodeValue.length ? [p.node, i - p.start] : null; };
    const range = document.createRange();
    const rectsOf = (i, j) => { const a = at(i), b = at(j - 1); if (!a || !b) return []; try { range.setStart(a[0], a[1]); range.setEnd(b[0], b[1] + 1); } catch (e) { return []; } return [...range.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5); };
    const cy = (q) => (q.top + q.bottom) / 2;
    /* слова: коробки через границы узлов; коробки одной строки сливаются */
    const words = []; const re = /\S+/g; let m;
    while ((m = re.exec(text)) && words.length < maxWords) {
      const w = m[0], i0 = m.index, i1 = i0 + w.length;
      const rects = rectsOf(i0, i1); if (!rects.length) continue;
      const segs = [];
      for (const q of rects) { const g = segs.find((x) => Math.abs(cy(q) - x.cy) < tol); if (g) { g.left = Math.min(g.left, q.left); g.right = Math.max(g.right, q.right); g.top = Math.min(g.top, q.top); g.bottom = Math.max(g.bottom, q.bottom); } else segs.push({ left: q.left, right: q.right, top: q.top, bottom: q.bottom, cy: cy(q) }); }
      segs.sort((a, b) => a.cy - b.cy);
      let pieces = [{ t: w, left: segs[0].left, right: segs[0].right, top: segs[0].top, bottom: segs[0].bottom }]; const brk = [];
      if (segs.length > 1) {
        /* слово разорвано: какой знак на какой строке — по коробке каждого знака */
        const idx = [];
        for (let k = 0; k < w.length; k++) {
          const q = w.length <= 80 ? rectsOf(i0 + k, i0 + k + 1)[0] : null;
          if (!q) { idx.push(idx.length ? idx[idx.length - 1] : (w.length > 80 ? Math.min(segs.length - 1, Math.floor(k / w.length * segs.length)) : 0)); continue; }
          let best = 0, bd = Infinity; segs.forEach((g, gi) => { const d = Math.abs(cy(q) - g.cy); if (d < bd) { bd = d; best = gi; } }); idx.push(best);
        }
        pieces = []; let st = 0;
        for (let k = 1; k <= w.length; k++) if (k === w.length || idx[k] !== idx[st]) { const g = segs[idx[st]]; pieces.push({ t: w.slice(st, k), left: g.left, right: g.right, top: g.top, bottom: g.bottom }); st = k; }
        if (pieces.length < 2) pieces = segs.map((g, gi) => ({ t: gi ? '…' : w, left: g.left, right: g.right, top: g.top, bottom: g.bottom }));
        for (let k = 0; k < pieces.length - 1; k++) {
          const ch = pieces[k].t.slice(-1);
          brk.push({ type: /[-‐]/.test(ch) ? 'hyphen' : ch === '\u00ad' ? 'shy' : /auto/.test(s.hyphens || s.webkitHyphens || '') ? 'auto' : 'wrap', before: pieces[k].t, after: pieces[k + 1].t });
        }
      }
      words.push({ w, pieces, brk, nb: /[\u00a0\u202f\u2007]/.test(text[i1] || '') });
    }
    const r = el.getBoundingClientRect();
    const padL = parseFloat(s.paddingLeft) || 0, padR = parseFloat(s.paddingRight) || 0, bL = parseFloat(s.borderLeftWidth) || 0, bR = parseFloat(s.borderRightWidth) || 0;
    const box = Math.max(1, r.width - padL - padR - bL - bR); const boxRight = r.right - padR - bR;
    const dr = (p) => ({ x: Math.round(p.left + scrollX), y: Math.round(p.top + scrollY), w: Math.round(p.right - p.left), h: Math.round(p.bottom - p.top) });
    /* строки: часть слова открывает новую строку, если её центр дальше tol от центра текущей */
    const rows = []; let cur = null;
    for (const wd of words) wd.pieces.forEach((p, pi) => { const c = cy(p); if (!cur || Math.abs(c - cur.cy) > tol) { cur = { cy: c, it: [] }; rows.push(cur); } cur.it.push({ wd, pi, p }); });
    const L = rows.map((row) => {
      const it = row.it; const f = it[0], l = it[it.length - 1];
      const chars = it.reduce((a, x) => a + [...x.p.t].length, 0) + it.length - 1;
      const left = Math.min(...it.map((x) => x.p.left)), right = Math.max(...it.map((x) => x.p.right));
      const lastBroken = l.pi < l.wd.pieces.length - 1;
      return { chars, width: Math.round(right - left), n: it.length, first: f.p.t, last: l.p.t, lastWhole: l.wd.w, lastBroken, lastBreak: lastBroken ? l.wd.brk[l.pi].type : null, firstCont: f.pi > 0, top: Math.round(Math.min(...it.map((x) => x.p.top)) + scrollY), x0: Math.round(f.p.left + scrollX), it };
    });
    const hang = [], lead = [], numSplit = [], broken = [];
    L.forEach((ln, i) => {
      const lastIt = ln.it[ln.it.length - 1];
      if (i < L.length - 1) {
        if (!ln.lastBroken && !lastIt.wd.nb && SHORT.has(ln.lastWhole.replace(LEAD_PUNCT, '').toLowerCase())) hang.push({ line: i + 1, word: ln.lastWhole, at: dr(lastIt.p) });
        const nx = L[i + 1];
        if (!ln.lastBroken && !lastIt.wd.nb && ((NUM.test(ln.lastWhole) && (UNIT.test(nx.first) || /^\d{3}(?!\d)/.test(nx.first))) || /^[№§]$/.test(ln.lastWhole))) numSplit.push({ line: i + 1, pair: `${ln.lastWhole} | ${nx.first}`, at: dr(lastIt.p) });
      }
      if (i > 0 && !ln.firstCont && STARTERS.test(ln.first.replace(LEAD_PUNCT, ''))) lead.push({ line: i + 1, word: ln.first, at: dr(ln.it[0].p) });
      for (const x of ln.it) if (x.pi < x.wd.pieces.length - 1) { const b = x.wd.brk[x.pi]; broken.push({ word: x.wd.w, type: b.type, before: b.before, after: b.after, line: i + 1, at: dr(x.p) }); }
    });
    let shortTotal = 0, shortNb = 0;
    words.forEach((wd, k) => { if (k === words.length - 1) return; if (!SHORT.has(wd.w.replace(LEAD_PUNCT, '').toLowerCase())) return; shortTotal++; if (wd.nb) shortNb++; });
    let maxGap = 0; L.forEach((ln, i) => { if (i === L.length - 1) return; for (let k = 1; k < ln.it.length; k++) maxGap = Math.max(maxGap, ln.it[k].p.left - ln.it[k - 1].p.right); });
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const lsPx = s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing) || 0;
    const space = ctx.measureText(' ').width + (parseFloat(s.wordSpacing) || 0) + lsPx;
    /* переносов подряд (лесенка): строки, которые кончаются перенесённым словом */
    let hyRun = 0, run = 0; for (const ln of L) { if (ln.lastBreak === 'auto' || ln.lastBreak === 'shy') { run++; hyRun = Math.max(hyRun, run); } else run = 0; }
    /* слово шире блока: правее содержимого, а блок не обрезает */
    const overflow = [];
    if (!/hidden|clip|auto|scroll/.test(s.overflowX)) { const tolX = Math.max(2, fs * 0.05); for (const ln of L) for (const x of ln.it) if (x.p.right > boxRight + tolX && overflow.length < 3) overflow.push({ word: x.wd.w, over: Math.round(x.p.right - boxRight), at: dr(x.p) }); }
    const last = L[L.length - 1];
    const lastLine = last ? { n: last.n, chars: last.chars, share: r2(last.width / box), word: last.last, at: dr(last.it[last.it.length - 1].p) } : null;
    return {
      text: text.replace(/[ \t\n\r\f\v\u2028\u2029]+/g, ' ').trim(), words: words.length, fs, lhPx: r1(lhPx), lh: r2(lhPx / fs), ls: r3(lsPx / fs), box: Math.round(box),
      lines: L.map(({ it, ...x }) => x), lastLine, hang, lead, numSplit, broken, shortTotal, shortNb,
      maxGap: r1(maxGap), space: r1(space), hyRun, overflow, x0: L.length ? L[0].x0 : null, capped: words.length >= maxWords,
    };
  }
  measure.collect = collect; measure.deepNodes = deepNodes; measure.kind = kind; measure.SHORT = SHORT;
  return measure;
}
/** Исходник замера строк для evaluateWith (зависимость `lines`) — см. справку, раздел «Модуль». */
export const LINES_FN = `(${linesFactory.toString()})()`;

/** Замер строк одного элемента из Node: measureLines(page, 'h1') → результат lines(el) или null. */
export async function measureLines(page, selector, { deep = false } = {}) {
  return evaluateWith(page, ({ selector, deep }) => { const el = document.querySelector(selector); if (!el) return null; return lines(el, null, { deep }); }, { selector, deep }, { lines: LINES_FN });
}

/* =====================================================================
   В странице: наблюдение за текстом, который меняется сам
   ===================================================================== */
function observeInPage(ms) {
  return new Promise((res) => {
    const ch = (window.__tsChange = { targets: [], added: [], n: 0 });
    const seen = new Set();
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        ch.n++;
        const t = m.type === 'characterData' ? m.target.parentElement : m.target;
        if (t && t.nodeType === 1 && !seen.has(t) && ch.targets.length < 400) { seen.add(t); ch.targets.push(t); }
        if (m.type === 'childList') for (const a of m.addedNodes) if (a.nodeType === 1 && ch.added.length < 200 && /\S/.test(a.textContent || '')) ch.added.push(a);
      }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    setTimeout(() => { mo.disconnect(); res(ch.n); }, ms);
  });
}

/* =====================================================================
   В странице: все блоки, роли, шрифты, первый экран
   ===================================================================== */
async function measureInPage(o) {
  const vw = innerWidth, vh = innerHeight;
  const r2 = (x) => Math.round(x * 100) / 100;
  const cs = (e) => getComputedStyle(e);
  const ch = window.__tsChange || { targets: [], added: [] };
  const changing = (el) => ch.targets.some((t) => t.isConnected && el.contains(t)) || ch.added.some((a) => a.isConnected && a.contains(el));
  const HEAD_SEL = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
  const NOT_PROSE = 'nav, [role="navigation"], button, [role="button"], label, figcaption, td, th, select, option';
  const clipTiny = (c) => { const m = /^rect\((.*)\)$/.exec(c || ''); return !!m && m[1].split(/[\s,]+/).filter(Boolean).every((x) => Math.abs(parseFloat(x) || 0) <= 1); };
  const srOnly = (el) => { for (let e = el, d = 0; e && d < 4; e = e.parentElement, d++) { const s = cs(e); if (clipTiny(s.clip) || /inset\(\s*(50|100)%/.test(s.clipPath || '')) return true; if (/hidden|clip/.test(s.overflow)) { const q = e.getBoundingClientRect(); if (q.width <= 2 || q.height <= 2) return true; } } return false; };
  const rectMemo = new Map();
  const clipRect = (e) => { if (!rectMemo.has(e)) { const s = cs(e); rectMemo.set(e, /visible/.test(s.overflowX) && /visible/.test(s.overflowY) ? null : e.getBoundingClientRect()); } return rectMemo.get(e); };
  const clippedAway = (el, r) => { for (let e = el.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) { const q = clipRect(e); if (q && (r.right <= q.left + 1 || r.left >= q.right - 1 || r.bottom <= q.top + 1 || r.top >= q.bottom - 1)) return true; } return false; };
  const fixedOf = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const p = cs(e).position; if (p === 'fixed' || p === 'sticky') return p; } return null; };
  const firstFam = (stack) => { const m = /^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/.exec(stack || ''); return m ? (m[1] || m[2] || m[3]).trim() : ''; };
  const dr = (q) => ({ x: Math.round(q.left + scrollX), y: Math.round(q.top + scrollY), w: Math.round(q.width), h: Math.round(q.height) });

  /* шрифты страницы: грани document.fonts и покрытие unicode-range по гарнитурам */
  const faces = [...document.fonts].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ''), weight: String(f.weight), style: f.style, status: f.status, display: f.display === undefined ? null : f.display, unicodeRange: f.unicodeRange || 'U+0-10FFFF' }));
  const parseRanges = (u) => String(u || 'U+0-10FFFF').split(',').map((x) => x.trim().replace(/^u\+/i, '')).filter(Boolean).map((x) => { if (x.includes('?')) return [parseInt(x.replace(/\?/g, '0'), 16), parseInt(x.replace(/\?/g, 'F'), 16)]; const [a, b] = x.split('-'); return [parseInt(a, 16), parseInt(b || a, 16)]; });
  const famKey = (f) => String(f || '').toLowerCase();
  const famFaces = new Map();
  for (const f of faces) { const k = famKey(f.family); if (!famFaces.has(k)) famFaces.set(k, { all: 0, ok: [] }); const e = famFaces.get(k); e.all++; if (f.status !== 'error') e.ok.push(parseRanges(f.unicodeRange)); }
  const covered = (fam, cp) => { const e = famFaces.get(famKey(fam)); if (!e) return null; return e.ok.some((rs) => rs.some(([a, b]) => cp >= a && cp <= b)); };
  /* знаки, которые не проверяем на подмену: пробелы, эмодзи и значки, невидимые */
  const skipChar = (cp) => cp <= 0x20 || (cp >= 0x2600 && cp <= 0x27bf) || cp >= 0x1f000 || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0x2060 || cp === 0xad || cp === 0xfeff;

  const owners = lines.collect(document.body);
  const blocks = []; const byEl = new Map(); const secIds = new Map(); let id = 0; let capped = false;
  const add = (el, m, extra = {}) => {
    const s = cs(el); const r = el.getBoundingClientRect(); const tag = el.tagName.toLowerCase();
    const bid = String(++id); el.setAttribute('data-ts', bid);
    const head = el.closest(HEAD_SEL);
    const headTag = head ? (/^h[1-6]$/i.test(head.tagName) ? head.tagName.toLowerCase() : `h${Math.min(6, Math.max(1, parseInt(head.getAttribute('aria-level'), 10) || 2))}`) : null;
    const fam = firstFam(s.fontFamily);
    const fe = famFaces.get(famKey(fam));
    /* CSS zoom (Tilda Zero Block: zoom 1.2 на 1440) — вычисленный кегль без него, на экране крупнее */
    const zoom = typeof el.currentCSSZoom === 'number' && Math.abs(el.currentCSSZoom - 1) > 0.01 ? r2(el.currentCSSZoom) : 1;
    if (zoom !== 1) m = { ...m, fsCss: m.fs, fs: r2(m.fs * zoom), lhPx: r2(m.lhPx * zoom), zoom };
    /* слово шире блока, но предок его обрезает (бегущая строка, огромное слово-лента) — задумано, не в счёт */
    if (m.overflow && m.overflow.length) { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (/hidden|clip/.test(cs(e).overflowX)) { m = { ...m, overflow: [], overflowClipped: sig(e) }; break; } }
    const out = new Set();
    if (fe) for (const c of m.text) { const cp = c.codePointAt(0); if (!skipChar(cp) && !covered(fam, cp)) out.add(c); if (out.size >= 24) break; }
    const b = {
      id: bid, el, sig: sig(el), tag, headTag, ...m, text: m.text.slice(0, 200), textLen: m.text.length,
      weight: s.fontWeight, style: s.fontStyle, family: s.fontFamily, fam, webFont: !!fe, famAllError: !!fe && !fe.ok.length, outChars: [...out],
      align: s.textAlign, hyphens: s.hyphens || s.webkitHyphens || null, textWrap: s.textWrap || null, textWrapStyle: s.textWrapStyle || null,
      whiteSpace: s.whiteSpace, nowrap: /^(nowrap|pre)$/.test(s.whiteSpace) || s.textWrapMode === 'nowrap', position: s.position,
      lang: ((el.closest('[lang]') || document.documentElement).getAttribute('lang') || '').trim(), tnum: /tabular-nums/.test(s.fontVariantNumeric || ''),
      upper: s.textTransform === 'uppercase' || (/[A-ZА-ЯЁ]{3}/.test(m.text) && m.text === m.text.toUpperCase()),
      nav: !!el.closest('nav, [role="navigation"]'), inButton: !!el.closest('button, [role="button"]'), inLink: !!el.closest('a[href]'), notProse: !!el.closest(NOT_PROSE),
      fixed: fixedOf(el), changing: changing(el), first: r.top < vh && r.bottom > 0, rect: dr(r), ...extra,
    };
    blocks.push(b); byEl.set(el, b); return b;
  };
  for (const [el, nodes] of owners) {
    if (blocks.length >= o.maxBlocks) { capped = true; break; }
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || r.right <= 0 || r.left >= vw) continue;
    if (eff(el) < 0.05 || srOnly(el) || clippedAway(el, r)) continue;
    let m; try { m = lines(el, nodes); } catch (e) { continue; }
    if (!m || !m.lines.length) continue;
    const b = add(el, m);
    for (const n of nodes) if (n && n.nodeType === 3 && /\S/.test(n.nodeValue) && n.parentElement) n.parentElement.setAttribute('data-ts-t', b.id);
  }
  /* заголовок, чей текст разложен по вложенным блокам (span-строки): меряется целиком, вложенные — его части */
  for (const h of document.querySelectorAll(HEAD_SEL)) {
    if (byEl.has(h)) continue;
    const inner = blocks.filter((b) => !b.partOf && h.contains(b.el)); if (!inner.length) continue;
    let m; try { m = lines(h, null, { deep: true }); } catch (e) { continue; }
    if (!m || !m.lines.length) continue;
    const b = add(h, m, { composite: true, inner: inner.map((x) => x.id) });
    for (const x of inner) { x.partOf = b.id; if (x.changing) b.changing = true; }
  }
  /* основной кегль: самый частый по длине текста у блоков от 40 знаков вне заголовков */
  const votes = new Map();
  for (const b of blocks) if (!b.partOf && !b.headTag && b.textLen >= 40 && b.fs < 30) { const k = Math.round(b.fs * 2) / 2; votes.set(k, (votes.get(k) || 0) + b.textLen); }
  const bodyFs = votes.size ? [...votes].sort((a, b) => b[1] - a[1])[0][0] : (parseFloat(cs(document.body).fontSize) || 16);
  for (const b of blocks) {
    const semantic = !!b.headTag;
    const display = !semantic && b.fs >= Math.max(24, 1.5 * bodyFs) && b.textLen <= 160;
    b.role = semantic ? 'semantic' : display ? 'display' : (!b.notProse && b.textLen >= 60 && !b.nowrap ? 'prose' : 'other');
    /* близость для h2–h4: зазор до видимого соседа сверху и снизу */
    if (semantic && /^h[2-4]$/.test(b.headTag) && (b.el.matches(HEAD_SEL) || b.composite)) {
      const vis = (e) => { const q = e.getBoundingClientRect(); return q.height > 0 && q.width > 0 && eff(e) > 0.05; };
      const sib = (e, dir) => { for (let x = e; x && x !== document.body; x = x.parentElement) { let y = dir < 0 ? x.previousElementSibling : x.nextElementSibling; while (y && !vis(y)) y = dir < 0 ? y.previousElementSibling : y.nextElementSibling; if (y) return y; } return null; };
      const el = b.el.closest(HEAD_SEL) || b.el; const r = el.getBoundingClientRect();
      let p = sib(el, -1); const n = sib(el, 1); let kicker = null;
      if (p) { const pr = p.getBoundingClientRect(); const pt = (p.textContent || '').trim(); if (pt && pt.length <= 60 && parseFloat(cs(p).fontSize) < b.fs * 0.75 && r.top - pr.bottom <= 24 && pr.height < b.fs * 2) { kicker = sig(p); p = sib(p, -1); } }
      b.gaps = { kicker, above: p ? Math.round((kicker ? r.top : r.top) - p.getBoundingClientRect().bottom) : null, below: n ? Math.round(n.getBoundingClientRect().top - r.bottom) : null, prev: p ? sig(p) : null, next: n ? sig(n) : null, position: cs(el).position };
    }
    /* секция — для «почти одной оси» */
    const sec = b.el.closest('section') || (() => { for (let e = b.el.parentElement; e && e !== document.body; e = e.parentElement) { if ((e.parentElement && e.parentElement.tagName === 'MAIN') || e.getBoundingClientRect().width >= vw * 0.8) return e; } return null; })();
    if (sec && !secIds.has(sec)) secIds.set(sec, String(secIds.size + 1));
    b.sec = sec ? secIds.get(sec) : null;
  }
  /* сочетания гарнитура / вес / стиль у каждого элемента со своим текстом (<em> внутри абзаца — своё сочетание) */
  const styles = new Map(); const byBid = new Map(blocks.map((x) => [x.id, x]));
  for (const el of document.querySelectorAll('[data-ts-t]')) {
    const b = byBid.get(el.getAttribute('data-ts-t')); if (!b) continue;
    const s = cs(el); const fam = firstFam(s.fontFamily); if (!famFaces.has(famKey(fam))) continue;
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    own = own.replace(/\s+/g, ' ').trim(); if (!own) continue;
    const key = `${s.fontFamily}|${s.fontWeight}|${s.fontStyle}`;
    if (!styles.has(key)) styles.set(key, { key, stack: s.fontFamily, fam, weight: s.fontWeight, style: s.fontStyle, n: 0, blocks: [], example: sig(el), chars: new Set(), allError: !famFaces.get(famKey(fam)).ok.length });
    const st = styles.get(key); st.n += own.length; if (!st.blocks.includes(b.id)) st.blocks.push(b.id); for (const c of own) if (st.chars.size < 400) st.chars.add(c);
  }

  /* страница: язык, кириллица, поддержка CSS, переносы этим браузером */
  let cyr = 0, letters = 0;
  for (const b of blocks) if (!b.partOf) for (const c of b.text) { if (/[A-Za-zА-Яа-яЁё]/.test(c)) { letters++; if (/[А-Яа-яЁё]/.test(c)) cyr++; } }
  const lang = (document.documentElement.getAttribute('lang') || '').trim();
  const sup = (p, v) => { try { return CSS.supports(p, v); } catch (e) { return false; } };
  const hyProbe = (lg, word) => { const d = document.createElement('div'); d.lang = lg; d.style.cssText = 'position:absolute;left:-9999px;top:0;width:80px;font:16px/20px serif;hyphens:auto;-webkit-hyphens:auto;overflow-wrap:normal;word-break:normal'; d.textContent = word; document.body.appendChild(d); const rg = document.createRange(); rg.selectNodeContents(d); const n = new Set([...rg.getClientRects()].map((q) => Math.round(q.top))).size; d.remove(); return n > 1; };
  const env = {
    lang, cyrShare: letters ? r2(cyr / letters) : 0, bodyFs, vw, vh, dpr: devicePixelRatio,
    supports: { balance: sup('text-wrap', 'balance'), pretty: sup('text-wrap', 'pretty'), textBox: sup('text-box', 'trim-both cap alphabetic'), hyphenateLimit: sup('hyphenate-limit-chars', '6 3 3'), hangingPunctuation: sup('hanging-punctuation', 'first') },
    hyphenation: { ru: hyProbe('ru', 'высокодетализированные'), en: hyProbe('en', 'internationalization'), page: hyProbe(lang || 'ru', /^en/i.test(lang) ? 'internationalization' : 'высокодетализированные') },
    fontDisplayKnown: faces.length ? faces.some((f) => f.display !== null) : null,
  };
  const preload = [...document.querySelectorAll('link[rel~="preload"][as="font"]')].map((l) => ({ href: l.href, crossorigin: l.hasAttribute('crossorigin'), type: l.type || null }));
  const files = performance.getEntriesByType('resource').filter((e) => /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(e.name)).map((e) => e.name);

  /* цифры в колонку: не меньше 3 числовых блоков одного контейнера с общим краем, без tabular-nums */
  const NUMERIC = /^[\s\d.,:+−–\-%₽$€£¥]*\d[\s\d.,:+−–\-%₽$€£¥]*(руб\.?|р\.|шт\.?)?$/i;
  const groups = new Map();
  for (const b of blocks) {
    if (b.partOf || !NUMERIC.test(b.text) || (b.text.match(/\d/g) || []).length < 2) continue;
    const c = b.el.closest('table, ul, ol, dl, [role="table"], [role="list"], [role="grid"]') || (b.el.parentElement && b.el.parentElement.parentElement) || b.el.parentElement;
    if (!groups.has(c)) groups.set(c, []); groups.get(c).push(b);
  }
  const tnum = [];
  const wOf = (b, t) => { const sp = document.createElement('span'); const s = cs(b.el); sp.style.cssText = `position:absolute;left:-9999px;top:0;white-space:pre;font:${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily};font-variant-numeric:${s.fontVariantNumeric}`; sp.textContent = t; document.body.appendChild(sp); const w = sp.getBoundingClientRect().width; sp.remove(); return w; };
  for (const [c, list] of groups) {
    if (list.length < 3) continue;
    for (const edge of ['right', 'left']) {
      const pos = (b) => (edge === 'right' ? b.rect.x + b.rect.w : b.rect.x);
      const col = list.filter((b) => list.filter((x) => Math.abs(pos(x) - pos(b)) <= 2).length >= 3);
      if (col.length < 3) continue;
      const plain = col.filter((b) => !b.tnum);
      if (!plain.length) { tnum.push({ container: sig(c), count: col.length, tabular: true, edge }); break; }
      const d = Math.abs(wOf(plain[0], '1111') - wOf(plain[0], '8888'));
      tnum.push({ container: sig(c), count: col.length, tabular: false, differ: d > 0.5, diff: Math.round(d * 10) / 10, edge, ids: col.map((b) => b.id), sample: col.slice(0, 3).map((b) => b.text) });
      break;
    }
  }

  /* первый экран: h1 по правилу extract (pickH1), лид, главная кнопка */
  const onFirst = (q) => q.y < vh && q.y + q.h > 0;
  const top = blocks.filter((b) => !b.partOf && !b.fixed);
  let h1 = top.filter((b) => b.headTag === 'h1' && (b.el.matches('h1') || b.composite || b.el.closest('h1'))).sort((a, b) => (onFirst(b.rect) - onFirst(a.rect)) || (b.fs - a.fs) || (a.rect.y - b.rect.y))[0] || null;
  let h1How = h1 && onFirst(h1.rect) ? 'h1' : null;
  if (!h1How) {
    const heads = top.filter((b) => onFirst(b.rect) && !b.nav && !b.inButton && !b.el.closest('label, select, option, a[class*="btn"], a[class*="button"]') && ((b.headTag && b.fs >= bodyFs * 1.15) || (!b.headTag && b.fs >= 24 && b.fs >= bodyFs * 1.4)));
    heads.sort((a, b) => (b.fs - a.fs) || (a.rect.y - b.rect.y));
    h1 = heads[0] || null; h1How = h1 ? `на первом экране h1 нет — самый крупный заголовок (${h1.headTag || h1.tag})` : null;
  }
  const painted = (e) => { const s = cs(e); const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor); let a = 0; if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean); a = p.length >= 4 ? parseFloat(p[3]) * (p[3].endsWith('%') ? 0.01 : 1) : 1; } else if (s.backgroundColor && s.backgroundColor !== 'transparent') a = 1; const border = ['Top', 'Right', 'Bottom', 'Left'].every((k) => parseFloat(s[`border${k}Width`]) >= 0.9 && s[`border${k}Style`] !== 'none'); return a > 0.3 || border || /gradient/.test(s.backgroundImage); };
  const paintBox = (e) => { if (painted(e)) return e; const r = e.getBoundingClientRect(); const A = r.width * r.height; for (const d of e.querySelectorAll('*')) { if (d.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue; const q = d.getBoundingClientRect(); const a = q.width * q.height; if (a < 0.8 * A || a > 1.25 * A || Math.abs(q.left - r.left) > r.width * 0.2 || Math.abs(q.top - r.top) > r.height * 0.2) continue; if (painted(d) && eff(d) > 0.05) return d; } return null; };
  /* меню: nav, а header — только короткой полосой (у VN3D первый экран лежит внутри <header>) */
  const navLike = (e) => { if (e.closest('nav, [role="navigation"]')) return true; const h = e.closest('header'); return !!h && h.getBoundingClientRect().height < vh * 0.35; };
  const ctas = [];
  for (const e of document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], input[type="button"]')) {
    if (ctas.length >= 40) break;
    const r = e.getBoundingClientRect();
    if (r.height < 24 || r.height > 90 || r.width < 40 || r.width > vw * 0.95 || r.right <= 0 || r.left >= vw || r.top + scrollY > vh * 4) continue;
    if (eff(e) < 0.5 || !paintBox(e)) continue;
    const t = (e.innerText || e.value || '').replace(/\s+/g, ' ').trim(); if (!t) continue;
    ctas.push({ sig: sig(e), text: t.slice(0, 40), rect: dr(r), vpBottom: Math.round(r.bottom), nav: navLike(e), fixed: fixedOf(e), parent: e.parentElement ? sig(e.parentElement) : null, ids: [...e.querySelectorAll('[data-ts]')].map((x) => x.getAttribute('data-ts')).concat(e.getAttribute('data-ts') || []).filter(Boolean) });
  }
  const stickyBar = ctas.some((c) => c.fixed === 'fixed' && c.vpBottom >= vh - 140);
  const hero = {}; let lede = null, cta = null;
  if (h1) {
    const hb = h1.rect.y + h1.rect.h;
    lede = top.filter((b) => b.id !== h1.id && !b.headTag && b.role !== 'display' && !b.nav && !b.inButton && !b.inLink && b.textLen >= 20 && b.rect.y >= hb - 4 && b.rect.y < vh * 1.5 && b.rect.x < h1.rect.x + h1.rect.w && b.rect.x + b.rect.w > h1.rect.x).sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x))[0] || null;
    const free = ctas.filter((c) => !c.nav && !c.fixed);
    const nextHead = top.filter((b) => b.id !== h1.id && b.role === 'semantic' && /^h[1-3]$/.test(b.headTag) && b.rect.y > hb).sort((a, b) => a.rect.y - b.rect.y)[0];
    const limit = nextHead ? nextHead.rect.y : hb + vh * 3;
    cta = free.filter((c) => c.rect.y >= h1.rect.y - 4 && c.rect.y < limit).sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x))[0] || free.filter((c) => onFirst(c.rect)).sort((a, b) => a.rect.y - b.rect.y)[0] || null;
    if (!cta) { const far = free.filter((c) => c.rect.y >= h1.rect.y - 4).sort((a, b) => a.rect.y - b.rect.y)[0]; if (far) hero.farCta = { text: far.text, y: far.rect.y }; }
  }
  const brief = (b) => b && { id: b.id, sig: b.sig, text: b.text.slice(0, 80), fs: b.fs, lines: b.lines.length, chars: b.lines.map((l) => l.chars), x0: b.x0, rect: b.rect, align: b.align };
  Object.assign(hero, {
    h1: h1 ? { ...brief(h1), how: h1How } : null, lede: brief(lede),
    cta: cta ? { ...cta, visible: cta.rect.y + cta.rect.h <= vh, topShare: r2(cta.rect.y / vh) } : null,
    ratio: h1 ? r2(h1.fs / bodyFs) : null, ledeRatio: lede ? r2(lede.fs / bodyFs) : null, stickyBar,
    ledeToCta: lede && cta ? Math.round(cta.rect.y - (lede.rect.y + lede.rect.h)) : null,
  });
  if (h1 && cta) {
    /* ряд кнопок (соседи того же родителя на той же высоте) — для оси по центру */
    const row = ctas.filter((c) => c.parent === cta.parent && Math.abs(c.rect.y - cta.rect.y) <= 4);
    const rx0 = Math.min(...row.map((c) => c.rect.x)), rx1 = Math.max(...row.map((c) => c.rect.x + c.rect.w));
    const centered = /center/.test(h1.align);
    const hc = h1.rect.x + h1.rect.w / 2, cc = (rx0 + rx1) / 2;
    const hl = h1.x0 != null ? h1.x0 : h1.rect.x;
    const dLeft = Math.round(Math.abs(cta.rect.x - hl)), dCenter = Math.round(Math.abs(cc - hc));
    const ledeD = lede ? Math.round(centered ? Math.abs(lede.rect.x + lede.rect.w / 2 - hc) : Math.abs((lede.x0 != null ? lede.x0 : lede.rect.x) - hl)) : null;
    hero.axis = { centered, dLeft, dCenter, row: row.length, ok: centered ? dCenter <= 6 : dLeft <= 4, lede: ledeD };
  }
  for (const b of blocks) delete b.el;
  return { blocks, bodyFs, env, fonts: { faces: faces.map((f) => ({ ...f, unicodeRange: f.unicodeRange.slice(0, 400) })), preload, files }, styles: [...styles.values()].map((s) => ({ ...s, chars: [...s.chars].join('') })), tnum, hero, capped, changes: ch.n || 0 };
}

/* =====================================================================
   Node: шрифты на экране (CDP), знаки системным шрифтом, синтетика
   ===================================================================== */
/* CSS.getPlatformFontsForNode для каждого элемента со своим текстом (метка data-ts-t=<блок>) → по блокам */
async function platformFonts(page, limit = 2500) {
  const cdp = await page.createCDPSession();
  const byBlock = {}; let calls = 0, errors = 0, total = 0;
  try {
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-ts-t]' });
    total = nodeIds.length;
    const ids = nodeIds.slice(0, limit);
    for (let i = 0; i < ids.length; i += 25) {
      await Promise.all(ids.slice(i, i + 25).map(async (nodeId) => {
        try {
          const { attributes } = await cdp.send('DOM.getAttributes', { nodeId });
          const k = attributes.indexOf('data-ts-t'); const bid = attributes[k + 1];
          const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }); calls++;
          const m = (byBlock[bid] = byBlock[bid] || {});
          for (const f of fonts) { const e = (m[f.familyName] = m[f.familyName] || { glyphs: 0, custom: f.isCustomFont }); e.glyphs += f.glyphCount; }
        } catch { errors++; }
      }));
    }
  } finally { await cdp.detach().catch(() => {}); }
  return { byBlock, calls, errors, total, capped: total > limit };
}

/* Какие именно знаки системные: каждый знак — свой span тем же шрифтом, getPlatformFontsForNode по каждому */
async function fallbackChars(page, combos) {
  if (!combos.length) return {};
  await page.evaluate(async (combos) => {
    const old = document.getElementById('__ts_chars'); if (old) old.remove();
    const host = document.createElement('div'); host.id = '__ts_chars';
    host.style.cssText = 'position:absolute;left:-10000px;top:0;width:9000px;pointer-events:none;opacity:0';
    combos.forEach((c, ci) => {
      const d = document.createElement('div'); d.style.cssText = `font-family:${c.stack};font-weight:${c.weight};font-style:${c.style};font-size:20px;white-space:pre`;
      [...c.chars].forEach((ch, k) => { const s = document.createElement('span'); s.setAttribute('data-ts-c', `${ci}:${k}`); s.textContent = ch; d.appendChild(s); });
      host.appendChild(d);
    });
    document.body.appendChild(host);
    await Promise.all(combos.map((c) => document.fonts.load(`${c.style} ${c.weight} 20px ${c.stack}`, c.chars).catch(() => null)));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, combos.map((c) => ({ stack: c.stack, weight: c.weight, style: c.style, chars: c.chars.join('') })));
  const out = {};
  const cdp = await page.createCDPSession();
  try {
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-ts-c]' });
    for (let i = 0; i < nodeIds.length; i += 25) {
      await Promise.all(nodeIds.slice(i, i + 25).map(async (nodeId) => {
        try {
          const { attributes } = await cdp.send('DOM.getAttributes', { nodeId });
          const [ci, k] = attributes[attributes.indexOf('data-ts-c') + 1].split(':').map(Number);
          const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
          const sys = fonts.filter((f) => !f.isCustomFont).map((f) => f.familyName);
          if (sys.length) { const key = combos[ci].key; (out[key] = out[key] || []).push({ ch: [...combos[ci].chars][k] || combos[ci].chars[k], sys: sys[0] }); }
        } catch { /* узел ушёл */ }
      }));
    }
  } finally { await cdp.detach().catch(() => {}); await page.evaluate(() => { const x = document.getElementById('__ts_chars'); if (x) x.remove(); }).catch(() => {}); }
  return out;
}

/* Синтетика пикселями: проба с font-synthesis и без; расхождение > 10% — браузер рисует начертание сам */
const PROBE_TEXT = 'ЖёлудьЩиЁж Handglove 0123';
async function synthProbe(page, combos, sharp) {
  const out = [];
  for (const c of combos) {
    const raw = {};
    try {
      for (const syn of ['weight style', 'none']) {
        const box = await page.evaluate(async (c, syn, text) => {
          const old = document.getElementById('__ts_probe'); if (old) old.remove();
          const sp = document.createElement('div'); sp.id = '__ts_probe'; sp.textContent = text;
          sp.style.cssText = `position:fixed;left:0;top:0;z-index:2147483647;background:#fff;color:#000;padding:4px 6px;margin:0;white-space:nowrap;font-family:${c.stack};font-weight:${c.weight};font-style:${c.style};font-size:32px;line-height:1.3;font-synthesis:${syn};letter-spacing:0;word-spacing:0;text-transform:none;font-feature-settings:normal;font-variation-settings:normal;opacity:1;transform:none;filter:none;mix-blend-mode:normal`;
          document.body.appendChild(sp);
          await document.fonts.load(`${c.style} ${c.weight} 32px ${c.stack}`, text).catch(() => null);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const r = sp.getBoundingClientRect(); return { x: 0, y: 0, width: Math.ceil(r.width), height: Math.ceil(r.height) };
        }, c, syn, PROBE_TEXT);
        const buf = await page.screenshot({ clip: box, type: 'png' });
        const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
        let ink = 0; for (let i = 0; i < data.length; i++) ink += (255 - data[i]) / 255;
        raw[syn === 'none' ? 'none' : 'auto'] = { data, w: info.width, h: info.height, ink };
      }
    } catch (e) { out.push({ ...c, error: String((e && e.message) || e).split('\n')[0].slice(0, 120) }); continue; }
    finally { await page.evaluate(() => { const x = document.getElementById('__ts_probe'); if (x) x.remove(); }).catch(() => {}); }
    const A = raw.auto, B = raw.none; let mis = 0, inkPx = 0;
    const W = Math.min(A.w, B.w), H = Math.min(A.h, B.h);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = A.data[y * A.w + x], b = B.data[y * B.w + x]; if (b < 128) inkPx++; if (Math.abs(a - b) > 64) mis++; }
    out.push({ ...c, mismatch: Math.round(mis / Math.max(1, inkPx) * 1000) / 10, inkDiff: Math.round((A.ink - B.ink) / Math.max(1, B.ink) * 1000) / 10, sameSize: A.w === B.w && A.h === B.h });
  }
  return out;
}

/* =====================================================================
   Вердикты
   ===================================================================== */
const ORDER = { FAIL: 3, WARN: 2, INFO: 1, OK: 0 };
const worse = (a, b) => (ORDER[b] > ORDER[a] ? b : a);
const short = (t, n = 32) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const S = (b) => `${b.sig} «${short(b.text, 30)}»`;
const pl = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return `${n} ${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const U = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
const isCyr = (ch) => /[Ѐ-ӿ]/.test(ch);
const SPACE_CH = /[\u00a0\u202f\u2007\u2009\u200a\u2002-\u2006]/;
const LEADING = [[0, 14.5, 1.4, 1.6], [14.5, 18.5, 1.5, 1.65], [18.5, 24.5, 1.35, 1.5], [24.5, 40.5, 1.15, 1.3], [40.5, 64.5, 1.0, 1.15], [64.5, 1e9, 0.9, 1.05]];
const leadingRange = (fs) => LEADING.find(([a, b]) => fs >= a && fs < b) || LEADING[0];
const STYLE_RULES = new Set(['leading', 'caps-track', 'scale', 'families', 'weights']);
const DECIDABLE = new Set([...STYLE_RULES, 'measure', 'h-lines', 'proximity', 'justify', 'hero', 'balance', 'near-align']);
const RULE_IDS = ['measure', 'hang', 'orphan', 'lead', 'num-unit', 'hyphen-break', 'h-lines', 'balance', 'proximity', 'justify', 'hyphens', 'leading', 'caps-track', 'scale', 'families', 'weights', 'synthetic', 'weight-miss', 'fallback', 'fallback-all', 'font-error', 'font-display', 'preload', 'format', 'lang-mismatch', 'nbsp', 'tnum', 'hero', 'word-overflow', 'near-align'];
const LANG_OK = /^(ru|uk|be|bg|sr|kk)\b/i;
const MONO_ICON = /mono|code|courier|consol|icon|awesome|material|symbols|glyph|fontello|icomoon/i;

/**
 * Вердикты одного прохода: d — замер (blocks, env, fonts, hero, synth, platform…), ctx — { vp, base, decisions, gecko }.
 * → { rules: { id: { status, count, items } }, lines: [{ status, what, details, rule, items }], verdict }
 */
function judge(d, ctx) {
  const vw = d.env.vw; const phone = vw < 600, tablet = !phone && vw < 1024;
  const lines = []; const rules = {};
  const B = d.blocks; const byId = new Map(B.map((b) => [b.id, b]));
  const top = B.filter((b) => !b.partOf);
  const lineRules = top.filter((b) => !b.changing && !b.nowrap && b.lines.length >= 2);
  const heroIds = new Set([d.hero.h1 && d.hero.h1.id, d.hero.lede && d.hero.lede.id, ...((d.hero.cta && d.hero.cta.ids) || [])].filter(Boolean));
  const isHero = (b) => heroIds.has(b.id);
  const base = ctx.base || null;
  const baseTop = base ? base.blocks.filter((b) => !b.partOf) : [];
  const decisions = ctx.decisions || {};
  const decide = (id, item) => {
    if (!DECIDABLE.has(id) || !decisions[id]) return null;
    const dmap = decisions[id];
    for (const k of [item.sig, item.block, '*']) if (k && dmap[k]) return dmap[k];
    return null;
  };
  const L = (status, what, details, rule, items) => lines.push({ status, what, details: details || '', rule: rule || null, items: items || [] });
  /* emit: решения и донор → статусы пунктов, строки по статусу (FAIL, WARN, INFO), правило в протокол */
  const emit = (id, items, fmt, { baseMatch = null } = {}) => {
    for (const it of items) {
      const why = decide(id, it);
      if (why && it.status !== 'FAIL') { it.decided = why; it.status = 'INFO'; continue; }
      if (baseMatch && STYLE_RULES.has(id) && it.status !== 'OK' && baseMatch(it)) { it.asDonor = true; it.status = 'INFO'; }
    }
    const r = (rules[id] = { status: 'OK', count: items.length, items });
    for (const it of items) r.status = worse(r.status, it.status);
    for (const st of ['FAIL', 'WARN', 'INFO']) {
      const g = items.filter((x) => x.status === st); if (!g.length) continue;
      const [what, det] = fmt(st, g, items);
      const notes = [...new Set(g.filter((x) => x.decided).map((x) => `решение: ${x.decided}`)), ...(g.some((x) => x.asDonor) ? ['как у донора'] : [])];
      L(st, what, [det, notes.join('; ')].filter(Boolean).join(' — '), id, g);
    }
    return r;
  };
  const ex = (g, n = 5, f = (x) => x.note) => g.slice(0, n).map(f).join('; ') + (g.length > n ? `; … ещё ${g.length - n}` : '');

  /* ---- шрифты: не загрузился, весь текст системным, часть знаков системным ---- */
  const errFaces = d.fonts.faces.filter((f) => f.status === 'error');
  const failedFont = (d.failedFonts || []);
  emit('font-error', errFaces.length ? [{ status: 'FAIL', note: [...new Set(errFaces.map((f) => `${f.family} ${f.weight} ${f.style}`))].join(', ') }] : [], (st, g) => ['шрифт не загрузился', `${g[0].note}${failedFont.length ? ` — ${failedFont.slice(0, 3).map((f) => `${f.reason} ${f.url.split('/').pop().slice(0, 60)}`).join('; ')}` : ''}`]);
  const allSys = [];
  for (const b of top) {
    if (!b.webFont) continue;
    const pf = b.platform ? Object.entries(b.platform) : null;
    const allOut = b.outChars.length && [...b.text].filter((c) => !/\s/.test(c)).every((c) => b.outChars.includes(c));
    if (b.famAllError) allSys.push({ status: 'FAIL', sig: b.sig, block: b.id, text: b.text, note: `${S(b)} → запасной (все грани «${b.fam}» не загрузились)`, marks: [], b });
    else if (pf && pf.length && !pf.some(([, v]) => v.custom) && !allOut) allSys.push({ status: 'FAIL', sig: b.sig, block: b.id, text: b.text, note: `${S(b)} → ${pf.map(([k]) => k).join(', ')}`, marks: [], b });
  }
  emit('fallback-all', allSys, (st, g) => [`текст целиком системным шрифтом, хотя назначен веб-шрифт: ${pl(g.length, 'блок', 'блока', 'блоков')}`, `${ex(g, 4)} — шрифт не загрузился, не подошёл по весу или в нём нет этих знаков`]);
  const allSysIds = new Set(allSys.map((x) => x.block));
  /* часть знаков системным: Chrome — по CDP, знаки — по пробе; Firefox — знаки вне unicode-range */
  const fb = new Map();
  for (const b of top) {
    if (!b.webFont || allSysIds.has(b.id)) continue;
    let chars = [], sysName = null;
    if (b.platform) {
      const pf = Object.entries(b.platform); const sys = pf.filter(([, v]) => !v.custom);
      if (!sys.length || !pf.some(([, v]) => v.custom)) continue;
      sysName = sys.sort((x, y) => y[1].glyphs - x[1].glyphs)[0][0];
      const own = (d.styles || []).filter((st) => st.blocks.includes(b.id)).flatMap((st) => (d.sysChars || {})[st.key] || []);
      chars = [...new Set(own.filter((x) => b.text.includes(x.ch)).map((x) => x.ch))];
      if (!chars.length && b.outChars.length) chars = b.outChars;
    } else if (ctx.gecko && b.outChars.length) { chars = b.outChars; sysName = 'системный (вне unicode-range)'; }
    else continue;
    const k = sysName;
    if (!fb.has(k)) fb.set(k, []);
    fb.get(k).push({ b, chars, unknown: !chars.length });
  }
  const fbItems = [];
  for (const [name, all0] of fb) {
    /* знаки не нашлись у блока, а у соседа в той же группе нашлись — это текст вложенного блока (CDP считает на два уровня) */
    const list = all0.some((x) => !x.unknown) ? all0.filter((x) => !x.unknown) : all0;
    const chars = [...new Set(list.flatMap((x) => x.chars))];
    const visible = chars.filter((c) => !SPACE_CH.test(c));
    const cyr = visible.filter(isCyr);
    const st = cyr.length ? 'FAIL' : visible.length || !chars.length ? 'WARN' : 'INFO';
    const fams = [...new Set(list.map((x) => x.b.fam))];
    const byText = new Map(); for (const x of list) { const k2 = `${x.b.sig} «${short(x.b.text, 24)}»`; byText.set(k2, (byText.get(k2) || 0) + 1); }
    const where = [...byText].slice(0, 3).map(([k2, n]) => `${k2}${n > 1 ? ` ×${n}` : ''}`).join(', ') + (byText.size > 3 ? ` и ещё ${byText.size - 3}` : '');
    const rub = chars.includes('₽');
    fbItems.push({
      status: st, sys: name, chars, blocks: list.map((x) => x.b.id), block: list[0].b.id, sig: list[0].b.sig, text: list[0].b.text,
      note: `«${name}»: ${chars.length ? chars.slice(0, 10).map((c) => `${SPACE_CH.test(c) ? 'пробел' : c} (${U(c)})`).join(', ') : 'какие знаки — проба не нашла'} — ${where}; ${fams.join(', ')}${rub ? ' — у Google Fonts ₽ в подмножестве latin-ext (U+20AD–20C0), не в cyrillic и latin' : chars.length ? ' — знаков нет в шрифте или в его unicode-range' : ''}${!visible.length && chars.length ? ' (пробельный знак: на вид не заметно, ширина чужая)' : ''}`,
      marks: list.flatMap((x) => (x.b.charRects || []).slice(0, 4)),
    });
  }
  emit('fallback', fbItems, (st, g) => [st === 'FAIL' ? 'кириллица набрана системным шрифтом' : 'часть знаков набрана системным шрифтом', ex(g, 3)]);
  if (!fbItems.length && !allSys.length && !errFaces.length && B.some((b) => b.webFont)) L('OK', ctx.gecko ? 'знаков вне unicode-range веб-шрифтов нет' : 'системным шрифтом ничего не набрано', ctx.gecko ? 'в Firefox нет CDP: знаки внутри диапазона, которых нет в файле, видит только прогон в Chrome' : `CDP по ${d.platformStats ? d.platformStats.calls : 0} элементам`);

  /* ---- синтетика и вес вне граней ---- */
  const syn = (d.synth || []).filter((s) => !s.error);
  emit('synthetic', syn.filter((s) => s.mismatch > 10).map((s) => ({ status: 'FAIL', sig: s.example, block: s.blocks[0], text: '', note: `${s.weight}${/italic|oblique/.test(s.style) ? ' курсив' : ''} «${s.fam}» — расхождение с font-synthesis: none ${s.mismatch}% (${s.example}${s.blocks.length > 1 ? ` и ещё ${s.blocks.length - 1}` : ''})${s.faces ? `; грани: ${s.faces}` : ''}`, marks: [] })), (st, g) => ['синтетическое начертание: браузер рисует жирный или курсив сам', `${ex(g, 4)} — загрузить начертание или не просить его; font-synthesis: none — страховка, а не решение`]);
  emit('weight-miss', syn.filter((s) => s.mismatch <= 10 && s.nearest && String(s.nearest) !== String(s.weight)).map((s) => ({ status: 'INFO', sig: s.example, block: s.blocks[0], note: `запрошено ${s.weight} — рисуется ${s.nearest}: ${s.example} («${s.fam}» ${s.faces})` })), (st, g) => ['вес не загружен — рисуется ближайший', ex(g, 4)]);
  if (syn.length && !syn.some((s) => s.mismatch > 10)) L('OK', `синтетических начертаний нет (${pl(syn.length, 'сочетание', 'сочетания', 'сочетаний')})`, '');
  const synErr = (d.synth || []).filter((s) => s.error);
  if (synErr.length) L('INFO', 'проба синтетики не сработала', synErr.map((s) => `${s.fam} ${s.weight}: ${s.error}`).join('; '));

  /* ---- длина строки ---- */
  const meas = [];
  for (const b of lineRules) {
    if (b.role !== 'prose') continue;
    const m = median(b.lines.slice(0, -1).map((l) => l.chars)); if (m == null) continue;
    let st = 'OK';
    if (phone) st = m < 22 || m > 55 ? 'WARN' : m < 28 || m > 50 ? 'INFO' : 'OK';
    else if (tablet) st = m > 95 ? 'FAIL' : m > 80 || m < 30 ? 'WARN' : m < 40 ? 'INFO' : 'OK';
    else st = m > 95 ? 'FAIL' : m > 80 || m < 30 ? 'WARN' : m < 45 ? 'INFO' : 'OK';
    const full = b.lines.slice(0, -1).map((l) => l.chars);
    meas.push({ status: st, sig: b.sig, block: b.id, text: b.text, med: m, note: `${S(b)} медиана ${m} (строки ${Math.min(...full)}–${Math.max(...full)})`, marks: [] });
  }
  const norm = phone ? '28–50' : tablet ? '40–80' : '45–80';
  emit('measure', meas.filter((x) => x.status !== 'OK'), (st, g) => [st === 'FAIL' ? `строки длиннее 95 знаков: ${pl(g.length, 'абзац', 'абзаца', 'абзацев')}` : st === 'WARN' ? `длина строки вне нормы ${norm}: ${pl(g.length, 'абзац', 'абзаца', 'абзацев')}` : `узкая или широкая колонка (норма ${norm}): ${pl(g.length, 'абзац', 'абзаца', 'абзацев')}`, `${ex(g, 4)}${st !== 'INFO' ? ' — сузить или расширить колонку (max-width в em), не кегль' : ' — для карточек и FAQ допустимо'}`]);
  if (meas.length && !meas.some((x) => x.status !== 'OK')) L('OK', `длина строки в норме ${norm}: ${pl(meas.length, 'абзац', 'абзаца', 'абзацев')}`, `медианы ${[...new Set(meas.map((x) => x.med))].sort((a, b) => a - b).slice(0, 8).join(', ')}`);

  /* ---- висячие предлоги, частицы и тире, число и единица, дефис ---- */
  const hangAll = lineRules.filter((b) => !b.nav && b.hang.length);
  const hangItems = hangAll.map((b) => ({ status: 'WARN', sig: b.sig, block: b.id, text: b.text, first: isHero(b), note: `${S(b)} ${b.hang.map((h) => `«${h.word}» (стр. ${h.line})`).join(', ')}`, marks: b.hang.map((h) => h.at), places: b.hang.length }));
  emit('hang', hangItems, (st, g) => {
    const fst = g.filter((x) => x.first), rest = g.filter((x) => !x.first);
    const parts = [];
    if (fst.length) parts.push(`ПЕРВЫЙ ЭКРАН: ${ex(fst, 3)}`);
    if (rest.length) parts.push(ex(rest, 5));
    return [`короткое слово в конце строки: ${pl(g.length, 'блок', 'блока', 'блоков')}, ${pl(g.reduce((a, x) => a + x.places, 0), 'место', 'места', 'мест')}${fst.length ? ` (первый экран — ${fst.length})` : ''}`, `${parts.join(' | ')} — неразрывный пробел после короткого слова в исходном тексте`];
  });
  if (!hangItems.length && lineRules.length) L('OK', 'коротких слов в конце строк нет', `блоков от 2 строк: ${lineRules.length}`);
  emit('lead', lineRules.filter((b) => !b.nav && b.lead.length).map((b) => ({ status: 'WARN', sig: b.sig, block: b.id, text: b.text, first: isHero(b), note: `${S(b)} ${b.lead.map((x) => `«${x.word}» (стр. ${x.line})`).join(', ')}`, marks: b.lead.map((x) => x.at) })), (st, g) => [`строка начинается с частицы или тире: ${pl(g.length, 'блок', 'блока', 'блоков')}`, `${ex(g)} — неразрывный пробел перед же, ли, бы и перед тире`]);
  emit('num-unit', lineRules.filter((b) => !b.nav && b.numSplit.length).map((b) => ({ status: 'WARN', sig: b.sig, block: b.id, text: b.text, first: isHero(b), note: `${S(b)} ${b.numSplit.map((x) => `«${x.pair}»`).join(', ')}`, marks: b.numSplit.map((x) => x.at) })), (st, g) => [`число оторвано от единицы или разряда: ${pl(g.length, 'блок', 'блока', 'блоков')}`, `${ex(g)} — 1&#8239;000&nbsp;₽, 5&nbsp;см, №&nbsp;5`]);
  const hyb = [];
  for (const b of top.filter((x) => !x.changing && !x.nav)) for (const w of b.broken) { if (w.type !== 'hyphen') continue; const bef = w.before.replace(/[-‐]$/, '').replace(/^[«„"(]+/, ''); const aft = w.after.replace(/[.,;:!?»)]+$/, ''); if (bef.length <= 4 || aft.length <= 3) hyb.push({ status: 'WARN', sig: b.sig, block: b.id, text: b.text, first: isHero(b), note: `${S(b)} «${w.before}|${w.after}» (стр. ${w.line})`, marks: [w.at] }); }
  emit('hyphen-break', hyb, (st, g) => [`разрыв на коротком дефисе: ${pl(g.length, 'место', 'места', 'мест')}`, `${ex(g)} — неразрывный дефис U+2011 или <span style="white-space:nowrap">`]);

  /* ---- одно слово в последней строке ---- */
  const orph = [];
  for (const b of lineRules) {
    if (b.nav || !b.lastLine || b.lastLine.n !== 1) continue;
    const headLike = b.role === 'semantic' || b.role === 'display';
    if (!headLike && !(b.lastLine.chars <= 12 || b.lastLine.share < 0.2)) continue;
    const pretty = /pretty/.test(`${b.textWrapStyle} ${b.textWrap}`);
    orph.push({ status: 'WARN', sig: b.sig, block: b.id, text: b.text, first: isHero(b), head: headLike, note: `${S(b)} → «${b.lastLine.word}» (${b.lastLine.chars} зн.)${pretty ? ' [text-wrap: pretty есть, но не сработал]' : ''}`, marks: [b.lastLine.at] });
  }
  emit('orphan', orph, (st, g) => {
    const fst = g.filter((x) => x.first), hd = g.filter((x) => !x.first && x.head), pr = g.filter((x) => !x.first && !x.head);
    const parts = [];
    if (fst.length) parts.push(`ПЕРВЫЙ ЭКРАН: ${ex(fst, 3)}`);
    if (hd.length) parts.push(`заголовки: ${ex(hd, 3)}`);
    if (pr.length) parts.push(`абзацы: ${ex(pr, 4)}`);
    const rec = d.env.supports.pretty ? 'p, li, dd { text-wrap: pretty }; заголовки — text-wrap: balance; Firefox pretty не понимает — неразрывный пробел между двумя последними словами' : 'этот браузер не понимает text-wrap: pretty — неразрывный пробел между двумя последними словами в исходном тексте';
    return [`одно слово в последней строке: ${pl(g.length, 'блок', 'блока', 'блоков')}${fst.length ? ` (первый экран — ${fst.length})` : ''}`, `${parts.join(' | ')} — ${rec}`];
  });

  /* ---- заголовки: строки, баланс, близость ---- */
  const hl = [];
  const heroH1 = d.hero.h1 ? byId.get(d.hero.h1.id) : null;
  for (const b of top) {
    if (b.changing || b.role !== 'semantic' && b !== heroH1) continue;
    const isH1 = b.headTag === 'h1' || b === heroH1; const n = b.lines.length;
    let st = 'OK', lim = '';
    if (isH1) { const [ok, warn] = phone || tablet ? [4, 6] : [3, 5]; st = n <= ok ? 'OK' : n <= warn ? 'WARN' : 'FAIL'; lim = `до ${ok}`; }
    else if (b.headTag === 'h2') { const ok = phone || tablet ? 4 : 3; st = n > ok ? 'WARN' : 'OK'; lim = `до ${ok}`; }
    else continue;
    if (st !== 'OK') hl.push({ status: st, sig: b.sig, block: b.id, text: b.text, first: b === heroH1, note: `${isH1 ? 'h1' : 'h2'} ${S(b)} — ${pl(n, 'строка', 'строки', 'строк')} (норма ${lim})`, marks: [] });
  }
  emit('h-lines', hl, (st, g) => [`слишком много строк в заголовке: ${pl(g.length, 'заголовок', 'заголовка', 'заголовков')}`, `${ex(g, 4)} — сокращать текст, а не уменьшать кегль`]);
  const bal = lineRules.filter((b) => (b.role === 'semantic' || b.role === 'display') && !/balance/.test(`${b.textWrapStyle} ${b.textWrap}`)).filter((b) => { const w = b.lines.map((l) => l.chars); return w[w.length - 1] < 0.4 * Math.max(...w); });
  emit('balance', bal.map((b) => ({ status: 'INFO', sig: b.sig, block: b.id, text: b.text, note: `${S(b)} строки ${b.lines.map((l) => l.chars).join('/')}` })), (st, g) => [`неровные строки заголовка: ${pl(g.length, 'заголовок', 'заголовка', 'заголовков')}`, `${ex(g, 4)} — h1, h2, h3 { text-wrap: balance }${d.env.supports.balance ? '' : ' (этот браузер balance не понимает)'}`]);
  const prox = [];
  for (const b of top) {
    const g = b.gaps; if (!g || g.above == null || g.below == null || g.above <= 0 || g.below < 0 || !/static|relative/.test(g.position || b.position)) continue;
    if (g.below >= g.above) prox.push({ status: 'WARN', sig: b.sig, block: b.id, text: b.text, note: `${S(b)} сверху ${g.above}px${g.kicker ? ` (от подписи над ним ${g.kicker})` : ""}, снизу ${g.below}px` });
    else if (g.below > 0.75 * g.above) prox.push({ status: 'INFO', sig: b.sig, block: b.id, text: b.text, note: `${S(b)} сверху ${g.above}px${g.kicker ? ` (от подписи над ним ${g.kicker})` : ""}, снизу ${g.below}px` });
  }
  emit('proximity', prox, (st, g) => [st === 'WARN' ? `заголовок ближе к блоку сверху, чем к своему тексту: ${g.length}` : `заголовок почти посередине между блоками: ${g.length}`, `${ex(g, 4)} — сверху в 2–3 раза больше, чем снизу`]);

  /* ---- выключка и переносы ---- */
  emit('justify', top.filter((b) => b.role === 'prose' && b.align === 'justify' && b.lines.length >= 2).map((b) => ({ status: b.maxGap > 3 * b.space ? 'FAIL' : 'WARN', sig: b.sig, block: b.id, text: b.text, note: `${S(b)} пробел до ${b.maxGap}px при обычном ${b.space}px (×${Math.round(b.maxGap / Math.max(0.1, b.space) * 10) / 10})`, marks: [] })), (st, g) => [st === 'FAIL' ? 'выключка по ширине даёт «реки»' : 'выключка по ширине', `${ex(g, 4)} — text-align: start`]);
  const hyItems = [];
  const auto = top.filter((b) => /auto/.test(b.hyphens || ''));
  const autoHead = auto.filter((b) => b.role === 'semantic' || b.role === 'display');
  if (autoHead.length && !phone) hyItems.push({ status: 'WARN', sig: autoHead[0].sig, block: autoHead[0].id, note: `переносы в заголовках на desktop: ${autoHead.slice(0, 3).map(S).join(', ')} — h1, h2, h3 { hyphens: manual }` });
  const noLang = auto.filter((b) => !b.lang || (/[А-Яа-яЁё]/.test(b.text) && !LANG_OK.test(b.lang)));
  if (noLang.length) hyItems.push({ status: 'WARN', sig: noLang[0].sig, block: noLang[0].id, note: `hyphens: auto без lang или с чужим lang (${noLang[0].lang || 'нет'}): ${noLang.slice(0, 3).map(S).join(', ')} — переносов не будет или они чужие` });
  if (!d.env.hyphenation.page) hyItems.push({ status: 'INFO', note: `этот браузер не переносит (нет словарей) — ${auto.length ? `hyphens: auto у ${pl(auto.length, 'блока', 'блоков', 'блоков')}: строки на снимке без переносов, проверка — --browser firefox` : 'hyphens: auto на странице не найден'}` });
  else {
    const ladder = auto.filter((b) => b.hyRun > 2);
    for (const b of ladder) hyItems.push({ status: 'WARN', sig: b.sig, block: b.id, text: b.text, note: `${S(b)} ${b.hyRun} переноса подряд — «лесенка»`, marks: b.broken.map((w) => w.at) });
    const nHy = auto.reduce((a, b) => a + b.broken.filter((w) => w.type === 'auto' || w.type === 'shy').length, 0);
    if (auto.length) hyItems.push({ status: 'INFO', note: `браузер переносит: hyphens: auto у ${pl(auto.length, 'блока', 'блоков', 'блоков')}, перенесено ${pl(nHy, 'слово', 'слова', 'слов')}${d.env.supports.hyphenateLimit ? '' : '; hyphenate-limit-chars не понимает'}` });
  }
  emit('hyphens', hyItems, (st, g) => ['переносы', g.map((x) => x.note).join('; ')]);

  /* ---- стиль: интерлиньяж, разрядка, шкала, гарнитуры, начертания ---- */
  const lead = [];
  for (const b of lineRules) {
    /* h1 и дисплей от 80 px в 2+ строки — 0.8–1.05 (сайты: 0.8–0.92); выше верхней границы — не ошибка
       (длинная строка, тонкий текст на тёмном: quaker 21/1.6, g-part 15/1.73), ниже нижней — ошибка */
    const headish = b.role === 'semantic' || b.role === 'display';
    const big = b.fs >= 80 && headish;
    let [, , lo, hi] = big ? [0, 0, 0.8, 1.05] : leadingRange(b.fs);
    /* капс в заголовке: выносных вниз нет — от 1.0 норма (ниже — смотреть Й Ё на снимке) */
    if (headish && b.upper && !big) { lo = Math.min(lo, 1.0); hi = Math.max(hi, 1.2); }
    if (b.lh >= lo - 0.03 && b.lh <= hi + 0.03) continue;
    const st = b.lh < 1.0 && b.fs <= 24 ? 'FAIL' : big || b.lh > hi ? 'INFO' : 'WARN';
    lead.push({ status: st, sig: b.sig, block: b.id, text: b.text, fs: b.fs, lh: b.lh, lo, hi, note: `${Math.round(b.fs)}px/${b.lh}` });
  }
  const leadBase = (it) => baseTop.some((x) => x.lines.length >= 2 && Math.abs(x.fs - it.fs) <= 1 && Math.abs(x.lh - it.lh) <= 0.03);
  emit('leading', lead, (st, g) => {
    const grp = new Map(); for (const x of g) { const k = `${x.note} (норма ${x.lo}–${x.hi})`; if (!grp.has(k)) grp.set(k, []); grp.get(k).push(x); }
    return [st === 'FAIL' ? 'интерлиньяж меньше 1.0 у текста до 24 px' : st === 'WARN' ? `интерлиньяж ниже таблицы (typography.md п. 2): ${pl(g.length, 'блок', 'блока', 'блоков')}` : `интерлиньяж выше таблицы или крупный h1 вне 0.8–1.05: ${pl(g.length, 'блок', 'блока', 'блоков')}`, `${[...grp].slice(0, 5).map(([k, l]) => `${k} ×${l.length}: ${S(l[0])}`).join('; ')}${st === 'INFO' ? ' — не ошибка при длинной строке или тонком тексте на тёмном; у h1 ниже 0.9 смотреть Й Ё Ц Щ Д на снимке' : ''}`];
  }, { baseMatch: leadBase });
  const caps = [];
  for (const b of top) {
    if (!/[A-Za-zА-Яа-яЁё]/.test(b.text)) continue;
    if (b.upper && b.fs <= 14 && b.ls < 0.02) caps.push({ status: 'INFO', kind: 'caps-small', sig: b.sig, block: b.id, text: b.text, fs: b.fs, ls: b.ls, note: `мелкий капс без разрядки ${S(b)} ${b.fs}px ${b.ls}em (+0.1…+0.2em — если капс есть в языке сайта)` });
    else if (b.upper && b.fs >= 32 && b.ls > 0.1) caps.push({ status: 'INFO', kind: 'caps-big', sig: b.sig, block: b.id, text: b.text, fs: b.fs, ls: b.ls, note: `крупный капс с широкой разрядкой ${S(b)} ${b.fs}px ${b.ls}em (0…+0.03em)` });
    else if (!b.upper && b.fs >= 40 && b.ls > 0.01) caps.push({ status: 'WARN', kind: 'lower-plus', sig: b.sig, block: b.id, text: b.text, fs: b.fs, ls: b.ls, note: `крупный строчный текст с положительной разрядкой ${S(b)} ${b.fs}px ${b.ls}em (−0.01…−0.04em)` });
    else if (b.role === 'prose' && Math.abs(b.ls) > 0.03) caps.push({ status: 'WARN', kind: 'prose', sig: b.sig, block: b.id, text: b.text, fs: b.fs, ls: b.ls, note: `разрядка у основного текста ${S(b)} ${b.ls}em (0 ±0.01em)` });
  }
  const capsKind = (x) => (x.upper && x.fs <= 14 && x.ls < 0.02 ? 'caps-small' : x.upper && x.fs >= 32 && x.ls > 0.1 ? 'caps-big' : !x.upper && x.fs >= 40 && x.ls > 0.01 ? 'lower-plus' : x.role === 'prose' && Math.abs(x.ls) > 0.03 ? 'prose' : null);
  emit('caps-track', caps, (st, g) => ['разрядка', `${ex(g, 4)} — правило только для капса, который уже есть в языке сайта: подписи капсом не добавлять (cliche)`], { baseMatch: (it) => baseTop.some((x) => capsKind(x) === it.kind && Math.abs(x.ls - it.ls) <= 0.01) });
  /* шкала */
  const sizes = new Map(); for (const b of top) { if (b.changing) continue; const k = Math.round(b.fs); sizes.set(k, (sizes.get(k) || 0) + b.textLen); }
  const sig20 = [...sizes].filter(([, v]) => v >= 20).map(([k]) => k).sort((a, b) => b - a);
  const lvl = {}; for (const b of top) if (b.role === 'semantic' && /^h[1-4]$/.test(b.headTag)) (lvl[b.headTag] = lvl[b.headTag] || []).push(b);
  const levels = ['h1', 'h2', 'h3', 'h4'].filter((h) => lvl[h]).map((h) => { const fsz = median(lvl[h].map((b) => b.fs)); const wts = lvl[h].map((b) => String(b.weight)); const w = wts.sort((a, b) => wts.filter((x) => x === b).length - wts.filter((x) => x === a).length)[0]; return { h, fs: fsz, w }; });
  const scaleItems = [];
  if (sig20.length > 8) scaleItems.push({ status: 'WARN', kind: 'count', n: sig20.length, note: `кеглей с текстом от 20 знаков: ${sig20.length} (${sig20.join(', ')}) — не больше 8, лучше 3–4 заметно разных` });
  for (let i = 1; i < levels.length; i++) { const a = levels[i - 1], b = levels[i]; if (a.fs < b.fs) scaleItems.push({ status: 'WARN', kind: 'close', pair: [a.fs, b.fs], note: `${b.h} ${b.fs}px крупнее ${a.h} ${a.fs}px — уровни перевёрнуты` }); else if (a.fs / b.fs < 1.1 && a.w === b.w) scaleItems.push({ status: 'WARN', kind: 'close', pair: [a.fs, b.fs], note: `${a.h} ${a.fs}px и ${b.h} ${b.fs}px при весе ${a.w} ${a.fs === b.fs ? 'одного кегля' : `почти не различаются (${Math.round(a.fs / b.fs * 100) / 100})`} — различать весом или не делать отдельным уровнем` }); }
  const h1r = d.hero.ratio;
  if (h1r && h1r < (phone ? 1.6 : 2)) scaleItems.push({ status: 'INFO', kind: 'ratio', ratio: h1r, note: `h1 к основному тексту ${h1r} — плоская шкала (desktop 3–6×, телефон 2–3×); иерархию тогда держат вес, капс, цвет` });
  const bs = base && base.summary;
  emit('scale', scaleItems, (st, g) => ['шкала', g.map((x) => x.note).join('; ')], { baseMatch: (it) => bs && ((it.kind === 'count' && bs.sizes && bs.sizes.length >= it.n) || (it.kind === 'close' && (bs.closeLevels || []).some(([a, b]) => Math.abs(a - it.pair[0]) <= 1 && Math.abs(b - it.pair[1]) <= 1)) || (it.kind === 'ratio' && bs.h1Ratio && Math.abs(bs.h1Ratio - it.ratio) <= 0.25)) });
  if (!scaleItems.length) L('OK', `шкала: кеглей с текстом от 20 знаков ${sig20.length}`, `${sig20.join(', ')}${levels.length ? `; уровни ${levels.map((l) => `${l.h} ${l.fs}`).join(' > ')}` : ''}; основной ${d.bodyFs}px`);
  /* гарнитуры и начертания: свои веб-шрифты, нарисованные на экране (Chrome — по CDP) */
  const famChars = new Map(); let allChars = 0;
  for (const b of top) {
    allChars += b.textLen;
    if (!b.webFont || MONO_ICON.test(b.fam) || /code|pre/.test(b.tag)) continue;
    if (b.platform && !Object.values(b.platform).some((v) => v.custom)) continue;
    const k = b.fam; const e = famChars.get(k) || { n: 0, w: new Map() }; e.n += b.textLen; e.w.set(String(b.weight) + (/italic|oblique/.test(b.style) ? 'i' : ''), (e.w.get(String(b.weight) + (/italic|oblique/.test(b.style) ? 'i' : '')) || 0) + b.textLen); famChars.set(k, e);
  }
  const fams = [...famChars].filter(([, e]) => e.n >= allChars * 0.02).map(([k]) => k);
  emit('families', fams.length >= 3 ? [{ status: fams.length >= 4 ? 'FAIL' : 'WARN', n: fams.length, note: `своих гарнитур на экране: ${fams.length} (${fams.join(', ')}) — не больше двух, третья — моноширинная для кода` }] : [], (st, g) => ['гарнитуры', g[0].note], { baseMatch: (it) => bs && bs.families && bs.families.length >= it.n });
  const wItems = [];
  for (const [k, e] of famChars) { const ws = [...e.w].filter(([, n]) => n >= allChars * 0.01).map(([w]) => w); if (ws.length > 4) wItems.push({ status: 'WARN', fam: k, n: ws.length, note: `«${k}»: ${ws.length} начертаний (${ws.join(', ')}) — 2–4 на гарнитуру` }); }
  emit('weights', wItems, (st, g) => ['начертания', ex(g, 3)], { baseMatch: (it) => bs && bs.weights && (bs.weights[it.fam] || []).length >= it.n });
  if (fams.length && fams.length < 3 && !wItems.length) L('OK', `гарнитур на экране: ${fams.length}`, [...famChars].filter(([k]) => fams.includes(k)).map(([k, e]) => `${k} (${[...e.w.keys()].join(', ')})`).join('; '));

  /* ---- загрузка шрифтов ---- */
  const loaded = d.fonts.faces.filter((f) => f.status === 'loaded');
  const disp = new Map(); for (const f of loaded) { if (f.display && /^(auto|block)$/.test(f.display)) disp.set(f.family, f.display); }
  const fdItems = [...disp].map(([fam, v]) => ({ status: MONO_ICON.test(fam) ? 'INFO' : 'WARN', note: `${fam}: font-display ${v}` }));
  if (d.env.fontDisplayKnown === false && loaded.length) fdItems.push({ status: 'INFO', note: 'font-display этот браузер не показывает (FontFace.display нет)' });
  emit('font-display', fdItems, (st, g) => [st === 'WARN' ? 'font-display: auto или block — до 3 с невидимого текста' : 'font-display', `${ex(g, 5)}${st === 'WARN' ? ' — swap для текста, optional — если важнее без сдвига' : ''}`]);
  const plItems = [];
  for (const p of d.fonts.preload) if (!p.crossorigin) plItems.push({ status: 'WARN', note: `preload без crossorigin: ${p.href.split('/').pop()} — файл скачается дважды` });
  const unused = (d.consoleWarnings || []).filter((t) => /preloaded using link preload but not used/i.test(t));
  if (unused.length) plItems.push({ status: 'WARN', note: `preload не использован: ${unused.slice(0, 2).map((t) => short((/(https?:\/\/\S+)/.exec(t) || [])[1] || t, 60)).join('; ')}` });
  if (!d.fonts.preload.length && heroH1 && heroH1.webFont) plItems.push({ status: 'INFO', note: `preload 0: h1 первого экрана — ${heroH1.fam} ${heroH1.weight}${heroH1.outChars.length ? '' : ' (кириллица)'}; preload 1–2 файлов первого экрана с crossorigin` });
  emit('preload', plItems, (st, g) => ['preload шрифтов', ex(g, 3)]);
  const notWoff2 = [...new Set([...(d.fonts.files || []), ...(d.fontRequests || [])])].filter((u) => /\.(woff|ttf|otf|eot)(\?|#|$)/i.test(u) && !/\.woff2(\?|#|$)/i.test(u));
  emit('format', notWoff2.length ? [{ status: 'WARN', note: notWoff2.slice(0, 4).map((u) => u.split('/').pop().slice(0, 60)).join(', ') }] : [], (st, g) => ['шрифт не в woff2', `${g[0].note} — только woff2 и свои файлы`]);
  if (!errFaces.length && !fdItems.some((x) => x.status === 'WARN') && !plItems.some((x) => x.status === 'WARN') && !notWoff2.length && loaded.length) L('OK', `шрифты загружены: ${pl(loaded.length, 'грань', 'грани', 'граней')}`, `font-display: ${[...new Set(loaded.map((f) => f.display || '?'))].join(', ')}; preload ${d.fonts.preload.length}`);

  /* ---- язык, неразрывные пробелы, цифры ---- */
  const lang = d.env.lang;
  if (d.env.cyrShare > 0.5 && lang && !LANG_OK.test(lang)) emit('lang-mismatch', [{ status: 'WARN', note: `кириллицы ${Math.round(d.env.cyrShare * 100)}%, а lang="${lang}"` }], (st, g) => ['язык страницы не совпадает с lang', `${g[0].note} — переносы и кавычки будут по чужим правилам: <html lang="ru">`]);
  else if (d.env.cyrShare > 0.5 && !lang) emit('lang-mismatch', [{ status: 'INFO', note: 'lang не задан' }], () => ['lang не задан', 'это провал a11y.mjs; переносы (hyphens: auto) без lang не работают']);
  const shortTotal = top.filter((b) => !b.nav).reduce((a, b) => a + b.shortTotal, 0), shortNb = top.filter((b) => !b.nav).reduce((a, b) => a + b.shortNb, 0);
  if (shortTotal) emit('nbsp', [{ status: 'INFO', total: shortTotal, nb: shortNb, note: `привязано неразрывным пробелом ${shortNb} из ${shortTotal}` }], (st, g) => [`привязано неразрывным пробелом ${shortNb} из ${pl(shortTotal, 'короткого слова', 'коротких слов', 'коротких слов')}`, shortNb < shortTotal ? 'неразрывные пробелы ставятся в исходном тексте и данных, не скриптом на странице' : '']);
  const tn = (d.tnum || []).filter((t) => !t.tabular && t.differ);
  emit('tnum', tn.map((t) => ({ status: 'INFO', block: (t.ids || [])[0], sig: t.container, note: `${t.container}: ${t.count} чисел в колонку (${t.sample.map((x) => `«${short(x, 12)}»`).join(', ')}), «1111» и «8888» разной ширины (${t.diff}px)` })), (st, g) => ['цифры в колонку без tabular-nums', `${ex(g, 3)} — font-variant-numeric: tabular-nums`]);

  /* ---- первый экран ---- */
  const hero = d.hero; const heroItems = [];
  if (!hero.h1) heroItems.push({ status: 'INFO', note: 'на первом экране нет ни h1, ни крупного заголовка' });
  else {
    if (!hero.cta) heroItems.push({ status: 'INFO', note: `главной кнопки с заливкой у h1 нет (до следующего заголовка, без него — 3 экрана)${hero.farCta ? `; ближайшая — «${hero.farCta.text}» на ${hero.farCta.y}px` : ''}` });
    else if (!hero.cta.visible) {
      const mobS = vw <= 340;
      heroItems.push({ status: mobS && hero.stickyBar ? 'INFO' : 'WARN', sig: hero.cta.sig, note: `кнопка «${hero.cta.text}» ниже окна: верх ${hero.cta.rect.y}px при окне ${d.env.vh}px${mobS && hero.stickyBar ? ' — есть закреплённая панель действия' : ''}` });
    }
    if (hero.axis && (!hero.axis.ok || (hero.axis.lede != null && hero.axis.lede > (hero.axis.centered ? 6 : 4)))) heroItems.push({ status: 'INFO', note: hero.axis.centered ? `первый экран по центру, но центры расходятся: кнопки на ${hero.axis.dCenter}px${hero.axis.lede != null ? `, лид на ${hero.axis.lede}px` : ''}` : `h1 и кнопка не на одной оси: левые края расходятся на ${hero.axis.dLeft}px${hero.axis.lede != null && hero.axis.lede > 4 ? `, лид — на ${hero.axis.lede}px` : ''}` });
    /* сайты (wf2): desktop медиана 4.6, половина 3.2–6.3; телефон 2.5 (2.0–3.1); до 10× при h1 из 1–3 слов */
    const fewWords = hero.h1.text.split(/\s+/).filter(Boolean).length <= 3;
    if (hero.ratio && (phone ? hero.ratio < 2 || hero.ratio > 3 : hero.ratio < 3 || hero.ratio > (fewWords ? 10 : 6))) heroItems.push({ status: 'INFO', note: `h1 к основному тексту ${hero.ratio} (${phone ? 'телефон 2–3×' : `desktop 3–6×${fewWords ? ', до 10× при 1–3 словах' : ''}`})` });
    if (hero.lede && hero.lede.lines > 3) heroItems.push({ status: 'INFO', note: `лид в ${pl(hero.lede.lines, "строку", "строки", "строк")} (1–3)` });
  }
  emit('hero', heroItems, (st, g) => ['первый экран', g.map((x) => x.note).join('; ')]);
  const heroBad = heroItems.some((x) => x.status === 'WARN') || hl.some((x) => x.first) || hangItems.some((x) => x.first) || orph.some((x) => x.first);
  if (hero.h1) L(heroBad ? 'INFO' : 'OK', `первый экран: h1 ${pl(hero.h1.lines, 'строка', 'строки', 'строк')} (${hero.h1.fs}px, ${hero.h1.how})`, [`${hero.h1.sig} «${short(hero.h1.text, 40)}»`, hero.lede ? `лид ${hero.lede.sig} ${pl(hero.lede.lines, 'строка', 'строки', 'строк')}` : 'лида нет', hero.cta ? `кнопка «${hero.cta.text}» ${hero.cta.visible ? `видна (верх ${hero.cta.rect.y}px из ${d.env.vh})` : 'ниже окна'}` : 'кнопки нет', hero.ratio ? `h1/основной ${hero.ratio}` : ''].filter(Boolean).join('; '));

  /* ---- слово шире блока, почти одна ось ---- */
  emit('word-overflow', top.filter((b) => b.overflow && b.overflow.length).map((b) => ({ status: 'INFO', sig: b.sig, block: b.id, text: b.text, note: `${S(b)} «${b.overflow[0].word}» на ${b.overflow[0].over}px`, marks: b.overflow.map((x) => x.at) })), (st, g) => [`слово шире блока: ${pl(g.length, 'блок', 'блока', 'блоков')}`, `${ex(g, 4)} — вылезает ли за экран, проверяет runtime.mjs --scroll`]);
  const na = []; const bySec = new Map();
  for (const b of top) { if (!b.sec || b.x0 == null || /center|right|end/.test(b.align) || !(b.role === 'semantic' || b.role === 'prose' || isHero(b))) continue; if (!bySec.has(b.sec)) bySec.set(b.sec, []); bySec.get(b.sec).push(b); }
  for (const [, list] of bySec) { list.sort((a, b) => a.rect.y - b.rect.y); for (let i = 1; i < list.length; i++) { const a = list[i - 1], b = list[i]; const dx = Math.abs(a.x0 - b.x0); if (dx >= 2 && dx <= 8) na.push({ status: 'INFO', sig: b.sig, block: b.id, text: b.text, note: `${a.sig} и ${b.sig}: ${dx}px` }); } }
  emit('near-align', na, (st, g) => [`почти одна ось, но не одна: ${pl(g.length, 'пара', 'пары', 'пар')}`, `${ex(g, 4)} — левый край блоков секции — одна линия (±2 px); правило не откалибровано`]);

  /* ---- что не проверялось ---- */
  const chg = top.filter((b) => b.changing);
  if (chg.length) L('INFO', `текст меняется сам: ${pl(chg.length, 'блок', 'блока', 'блоков')} — строчные правила для них не выносились`, chg.slice(0, 4).map(S).join('; '));
  const prettyDep = top.filter((b) => /pretty/.test(`${b.textWrapStyle} ${b.textWrap}`));
  if (prettyDep.length && !ctx.gecko) L('INFO', `text-wrap: pretty у ${pl(prettyDep.length, 'блока', 'блоков', 'блоков')}`, 'Firefox 156 его не понимает (браузер пользователя) — проверьте --browser firefox; на первом экране — неразрывный пробел');
  if (ctx.gecko) L('INFO', 'не проверено в Firefox', `подмена шрифта по CDP (проверены только знаки вне unicode-range)${d.synth && d.synth.length ? '' : ', синтетика'} — основной прогон в Chrome`);
  for (const l of d.limits || []) L('INFO', 'Firefox', l);
  if (d.capped) L('INFO', 'блоков больше предела', `взяты первые ${B.length}`);

  const fails = lines.filter((l) => l.status === 'FAIL').length, warns = lines.filter((l) => l.status === 'WARN').length;
  return { rules, lines, verdict: fails ? 'FAIL' : warns ? 'WARN' : 'OK', fails, warns };
}

/* сводка для --baseline: что сравнивать с донором */
function summaryOf(d) {
  const top = d.blocks.filter((b) => !b.partOf);
  const sizes = new Map(); for (const b of top) { const k = Math.round(b.fs); sizes.set(k, (sizes.get(k) || 0) + b.textLen); }
  const lv = {}; for (const b of top) if (b.role === 'semantic' && /^h[1-4]$/.test(b.headTag)) (lv[b.headTag] = lv[b.headTag] || []).push(b.fs);
  const levels = ['h1', 'h2', 'h3', 'h4'].filter((h) => lv[h]).map((h) => median(lv[h]));
  const closeLevels = []; for (let i = 1; i < levels.length; i++) if (levels[i - 1] / levels[i] < 1.1) closeLevels.push([levels[i - 1], levels[i]]);
  const famW = {}; for (const b of top) if (b.webFont && !MONO_ICON.test(b.fam)) { famW[b.fam] = famW[b.fam] || new Set(); famW[b.fam].add(String(b.weight) + (/italic|oblique/.test(b.style) ? 'i' : '')); }
  const P = top.filter((b) => b.role === 'prose' && b.lines.length >= 2 && !b.changing);
  return {
    bodyFs: d.bodyFs, sizes: [...sizes].filter(([, v]) => v >= 20).map(([k]) => k).sort((a, b) => b - a), levels, closeLevels, h1Ratio: d.hero.ratio,
    families: Object.keys(famW), weights: Object.fromEntries(Object.entries(famW).map(([k, v]) => [k, [...v]])),
    measure: median(P.map((b) => median(b.lines.slice(0, -1).map((l) => l.chars)))), h1Lines: d.hero.h1 ? d.hero.h1.lines : null,
    nbsp: { total: top.filter((b) => !b.nav).reduce((a, b) => a + b.shortTotal, 0), nb: top.filter((b) => !b.nav).reduce((a, b) => a + b.shortNb, 0) },
    textWrapHeadings: [...new Set(top.filter((b) => b.role === 'semantic').map((b) => b.textWrapStyle || b.textWrap).filter(Boolean))],
  };
}

/* =====================================================================
   Вырезки
   ===================================================================== */
async function markAndShot(page, file, region, marks, block) {
  await page.evaluate((marks, block) => {
    const old = document.getElementById('__ts_marks'); if (old) old.remove();
    const host = document.createElement('div'); host.id = '__ts_marks'; host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647';
    if (block) { const d = document.createElement('div'); d.style.cssText = `position:absolute;left:${block.x - 3}px;top:${block.y - 3}px;width:${block.w + 6}px;height:${block.h + 6}px;outline:1px dashed #0a7;box-sizing:border-box`; host.appendChild(d); }
    for (const q of marks) { const d = document.createElement('div'); d.style.cssText = `position:absolute;left:${q.x - 2}px;top:${q.y - 1}px;width:${q.w + 4}px;height:${q.h + 2}px;outline:2px solid ${q.color || '#e11'};background:${q.fill || 'rgba(255,0,0,.12)'}`; host.appendChild(d); }
    document.documentElement.appendChild(host);
  }, marks, block);
  try { await page.screenshot({ path: file, clip: region, captureBeyondViewport: true }); return true; } catch { return false; }
  finally { await page.evaluate(() => { const x = document.getElementById('__ts_marks'); if (x) x.remove(); }).catch(() => {}); }
}
function cropRegion(block, marks, docW, maxH) {
  const all = [block, ...marks].filter(Boolean);
  let x0 = Math.min(...all.map((q) => q.x)) - 8, y0 = Math.min(...all.map((q) => q.y)) - 8, x1 = Math.max(...all.map((q) => q.x + q.w)) + 8, y1 = Math.max(...all.map((q) => q.y + q.h)) + 8;
  if (y1 - y0 > maxH && marks.length) { const my0 = Math.min(...marks.map((q) => q.y)), my1 = Math.max(...marks.map((q) => q.y + q.h)); const c = (my0 + my1) / 2; y0 = Math.max(y0, Math.round(c - maxH / 2)); y1 = y0 + maxH; }
  if (y1 - y0 > maxH) y1 = y0 + maxH;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(docW, x1);
  return { x: Math.round(x0), y: Math.round(y0), width: Math.max(8, Math.round(x1 - x0)), height: Math.max(8, Math.round(y1 - y0)) };
}

/* =====================================================================
   Один проход: экран × страница
   ===================================================================== */
async function runPass(browser, url, vpName, vp, o) {
  const t0 = Date.now(); const timing = {};
  const gecko = browserInfo(browser).engine === 'gecko';
  const page = await preparePage(browser, vp, { hookCanvas: false });
  try {
    await gotoRetry(page, url);
    const consent = await closeConsent(page).catch(() => ({ found: false }));
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    const overlay = await waitForOverlay(page, 5000);
    await forceInstantScroll(page).catch(() => {});
    const sc = await scrollThrough(page, { pause: 150, maxShots: 0 }).catch(() => null);
    await scrollToY(page, 0); await sleep(400);
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))])).catch(() => {});
    timing.loadMs = Date.now() - t0;
    /* content-visibility: auto — вне окна браузер не раскладывает текст, и такие блоки выпали бы из замера молча */
    const cv = await page.evaluate(() => [...document.querySelectorAll('body *')].some((e) => getComputedStyle(e).contentVisibility === 'auto')).catch(() => false);
    if (cv) { await addStyleSafe(page, '*{content-visibility:visible!important}', { key: 'ts-cv', warn: false }); await sleep(300); }
    /* 1 с наблюдения: что меняется само */
    await evaluateWith(page, observeInPage, 1000);
    const tm = Date.now();
    const d = await evaluateWith(page, measureInPage, { maxBlocks: 800 }, { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN, lines: LINES_FN });
    timing.measureMs = Date.now() - tm;
    d.limits = page.rwLimits || [];
    d.consoleWarnings = (page.log.console || []).filter((c) => c.type === 'warning').map((c) => c.text);
    d.failedFonts = (page.log.failed || []).filter((f) => /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(f.url));
    d.fontRequests = (page.log.requests || []).filter((r) => r.type === 'font').map((r) => r.url);
    const byId = new Map(d.blocks.map((b) => [b.id, b]));
    /* сочетания гарнитура / вес / стиль у текста с веб-шрифтом (замер собрал по элементам со своим текстом) */
    const combos = (d.styles || []).filter((s) => !s.allError).sort((a, b) => b.n - a.n);
    /* какой шрифт нарисовал текст — CDP (Chromium) */
    if (!gecko) {
      const tp = Date.now();
      const pf = await platformFonts(page).catch((e) => ({ byBlock: {}, calls: 0, errors: 1, error: String(e.message || e).slice(0, 120) }));
      for (const b of d.blocks) b.platform = pf.byBlock[b.id] || null;
      /* составной заголовок — сумма его частей */
      for (const b of d.blocks) if (b.composite && !b.platform) { const m = {}; for (const id of b.inner) for (const [k, v] of Object.entries((byId.get(id) || {}).platform || {})) { const e = (m[k] = m[k] || { glyphs: 0, custom: v.custom }); e.glyphs += v.glyphs; } b.platform = Object.keys(m).length ? m : null; }
      d.platformStats = { calls: pf.calls, errors: pf.errors, total: pf.total, capped: pf.capped, error: pf.error || null };
      const rendered = {}; for (const b of d.blocks) if (!b.partOf) for (const [k, v] of Object.entries(b.platform || {})) { rendered[k] = rendered[k] || { glyphs: 0, custom: v.custom }; rendered[k].glyphs += v.glyphs; }
      d.fonts.rendered = rendered;
      /* какие знаки системные — только у сочетаний, где системный шрифт есть */
      const need = combos.filter((c) => c.blocks.some((id) => { const p = (byId.get(id) || {}).platform; return p && Object.values(p).some((v) => !v.custom); }));
      const chars = need.map((c) => ({ key: c.key, stack: c.stack, weight: c.weight, style: c.style, chars: [...c.chars].filter((ch) => !/\s/.test(ch) || SPACE_CH.test(ch)).filter((ch) => ch.codePointAt(0) > 0x20).slice(0, 400) }));
      d.sysChars = await fallbackChars(page, chars).catch(() => ({}));
      timing.fontsMs = Date.now() - tp;
    }
    /* синтетика пикселями */
    const sharp = loadSharp();
    const ts = Date.now();
    const faceList = (fam) => d.fonts.faces.filter((f) => f.family.toLowerCase() === String(fam).toLowerCase() && f.status !== 'error');
    const synthCombos = combos.slice(0, 14).map((c) => {
      const fl = faceList(c.fam); const want = parseFloat(c.weight) || 400;
      const ranges = fl.map((f) => String(f.weight).split(/\s+/).map(Number));
      const inRange = ranges.some((r) => want >= r[0] && want <= (r[1] || r[0]));
      const nearest = inRange || !ranges.length ? null : pickWeight(want, ranges);
      return { key: c.key, stack: c.stack, fam: c.fam, weight: c.weight, style: c.style, blocks: c.blocks, n: c.n, example: c.example || (byId.get(c.blocks[0]) || {}).sig || '', nearest, faces: [...new Set(fl.map((f) => `${f.weight}${f.style !== 'normal' ? ' ' + f.style : ''}`))].join(', ') };
    });
    d.synth = sharp ? await synthProbe(page, synthCombos, sharp) : synthCombos.map((c) => ({ ...c, error: 'sharp не найден' }));
    timing.synthMs = Date.now() - ts;
    /* знаки системным: коробки знаков для вырезок (по тексту блока) */
    const sysSet = new Set(Object.values(d.sysChars || {}).flat().map((x) => x.ch));
    for (const b of d.blocks) if (b.outChars) for (const c of b.outChars) sysSet.add(c);
    if (sysSet.size) {
      const rects = await page.evaluate((chars) => {
        const out = {}; const set = new Set(chars);
        for (const el of document.querySelectorAll('[data-ts-t]')) {
          const id = el.getAttribute('data-ts-t'); if ((out[id] || []).length >= 6) continue;
          for (const n of el.childNodes) { if (n.nodeType !== 3) continue; const t = n.nodeValue; for (let i = 0; i < t.length; i++) { if (!set.has(t[i])) continue; const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1); const q = rg.getBoundingClientRect(); if (q.width > 0.5) (out[id] = out[id] || []).push({ x: Math.round(q.left + scrollX), y: Math.round(q.top + scrollY), w: Math.round(q.width), h: Math.round(q.height) }); } }
        }
        return out;
      }, [...sysSet]).catch(() => ({}));
      for (const b of d.blocks) b.charRects = rects[b.id] || [];
    }
    d.env.vw = d.env.vw || vp.width;
    const res = judge(d, { base: o.base, decisions: o.decisions, gecko });
    /* вырезки */
    const tc = Date.now(); const crops = [];
    if (o.cropsDir) {
      ensureDir(o.cropsDir);
      for (const f of fs.readdirSync(o.cropsDir)) if (/\.png$/i.test(f)) fs.rmSync(path.join(o.cropsDir, f), { force: true });
      const docW = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, innerWidth)).catch(() => vp.width);
      const maxH = Math.min(700, Math.round(vp.height * 0.95));
      /* первый экран 1:1 с h1, лидом и кнопкой */
      if (d.hero.h1) {
        const mk = []; const hb = byId.get(d.hero.h1.id);
        if (hb) mk.push({ ...hb.rect, color: '#1565c0', fill: 'rgba(21,101,192,.06)' });
        if (d.hero.lede) mk.push({ ...d.hero.lede.rect, color: '#6a1b9a', fill: 'rgba(106,27,154,.05)' });
        if (d.hero.cta) mk.push({ ...d.hero.cta.rect, color: '#2e7d32', fill: 'rgba(46,125,50,.08)' });
        for (const l of res.lines) if (['hang', 'orphan'].includes(l.rule)) for (const it of l.items) if (it.first) mk.push(...(it.marks || []));
        const file = path.join(o.cropsDir, '00-hero.png');
        if (await markAndShot(page, file, { x: 0, y: 0, width: vp.width, height: vp.height }, mk, null)) crops.push({ rule: 'hero', file });
      }
      const PRI = ['hang', 'orphan', 'justify', 'fallback', 'fallback-all', 'hyphen-break', 'lead', 'num-unit', 'measure', 'synthetic'];
      const cand = [];
      for (const l of res.lines) for (const it of l.items) if (it.block) cand.push({ rule: l.rule, status: l.status, it, pri: (l.status === 'FAIL' ? 0 : it.first ? 1 : 2) * 100 + (PRI.indexOf(l.rule) >= 0 ? PRI.indexOf(l.rule) : 50) });
      cand.sort((a, b) => a.pri - b.pri);
      const done = new Set(); let n = 0;
      for (const c of cand) {
        if (n >= o.crops) break;
        const b = byId.get(c.it.block); if (!b) continue;
        const k = `${c.rule}|${b.id}`; if (done.has(k)) continue; done.add(k);
        /* только отметки внутри этого блока: у сгруппированной строки (₽ в семи ценах) они со всей страницы */
        const near = (q) => q.x < b.rect.x + b.rect.w + 4 && q.x + q.w > b.rect.x - 4 && q.y < b.rect.y + b.rect.h + 4 && q.y + q.h > b.rect.y - 4;
        const marks = (c.it.marks || []).filter((q) => q && near(q));
        const name = `${String(++n).padStart(2, '0')}-${c.rule}-${b.id}.png`;
        const file = path.join(o.cropsDir, name);
        if (await markAndShot(page, file, cropRegion(b.rect, marks, docW, maxH), marks, b.rect)) { c.it.crop = name; crops.push({ rule: c.rule, file, block: b.id }); } else n--;
      }
      const rel = path.basename(o.cropsDir);
      for (const l of res.lines) { const names = l.items.map((x) => x.crop).filter(Boolean); if (names.length) l.details += ` | вырезки typeset/${rel}/${names.slice(0, 2).join(', ')}${names.length > 2 ? ' …' : ''}`; }
    }
    timing.cropsMs = Date.now() - tc; timing.totalMs = Date.now() - t0;
    d.env.contentVisibilityForced = cv;
    return { ok: true, d, res, crops, consent, overlay, scroll: sc ? { pageHeight: sc.pageHeight, reachedBottom: sc.reachedBottom, stuck: sc.stuck } : null, timing, retries: page.retries || 0 };
  } finally { await page.close().catch(() => {}); }
}

/* какой вес возьмёт браузер, если запрошенного нет (CSS Fonts 4, подбор font-weight): от 400 до 500 — сначала
   вверх до 500, потом вниз, потом выше 500; меньше 400 — вниз, потом вверх; больше 500 — вверх, потом вниз */
function pickWeight(want, ranges) {
  const pts = ranges.flatMap((r) => (r[1] && r[1] !== r[0] ? [r[0], r[1]] : [r[0]]));
  const up = pts.filter((w) => w >= want).sort((a, b) => a - b), down = pts.filter((w) => w < want).sort((a, b) => b - a);
  if (want >= 400 && want <= 500) { const mid = up.filter((w) => w <= 500); return mid[0] ?? down[0] ?? up[0]; }
  return want < 400 ? (down[0] ?? up[0]) : (up[0] ?? down[0]);
}

/* протокол прохода */
function protocol(url, vpName, vp, slug, bInfo, pass) {
  const { d, res } = pass;
  const blocks = d.blocks.map(({ charRects, comboKey, ...b }) => b);
  return {
    url, viewport: vpName, size: `${vp.width}×${vp.height}@${vp.deviceScaleFactor || 1}`, page: slug, browser: bInfo, takenAt: new Date().toISOString(),
    env: { ...d.env, limits: d.limits, consent: pass.consent && pass.consent.found ? { closed: pass.consent.closed, box: pass.consent.box } : null, scroll: pass.scroll, changes: d.changes },
    fonts: { ...d.fonts, platform: d.platformStats || null, sysChars: d.sysChars || null },
    blocks, synth: (d.synth || []).map(({ stack, ...s }) => s), hero: d.hero, tnum: d.tnum, summary: summaryOf(d),
    rules: Object.fromEntries(Object.entries(res.rules).map(([k, r]) => [k, { status: r.status, count: r.count, items: r.items.map(({ b, marks, ...it }) => it) }])),
    lines: res.lines.map(({ items, ...l }) => l), verdict: res.verdict, timing: pass.timing,
  };
}

/* =====================================================================
   Командная строка
   ===================================================================== */
const VALUES = ['viewport', 'viewports', 'pages', 'out', 'tag', 'baseline', 'decisions', 'browser', 'crops', 'json'];
const FLAGS = ['help', 'h', 'strict', 'selftest'];
const HELP = () => fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');

function lev(a, b) { const m = a.length, n = b.length; const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) dp[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return dp[m][n]; }

async function main(argv) {
  const die = (msg) => { console.error(msg); process.exit(1); };
  /* неизвестный флаг — ошибка до всего остального (опечатка в --viewports не должна молча дать экраны по умолчанию) */
  const known = new Set([...VALUES, ...FLAGS]);
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]); if (a === '--') break;
    if (a === '-h') continue;
    if (/^--[^-]/.test(a)) {
      const k = a.slice(2).split('=')[0];
      if (!known.has(k)) { const near = [...known].filter((x) => x.length > 1).map((x) => [x, lev(k, x)]).sort((p, q) => p[1] - q[1])[0]; die(`FAIL неизвестный флаг --${k}${near && near[1] <= Math.max(1, Math.floor(k.length / 3)) ? ` — может быть, --${near[0]}?` : '.'} Флаги: ${VALUES.map((x) => `--${x}`).join(' ')} ${FLAGS.filter((x) => x.length > 1).map((x) => `--${x}`).join(' ')} (подробно: --help)`); }
      if (VALUES.includes(k) && !a.includes('=')) i++;
    } else if (/^-[^-\d]/.test(a) && a !== '-') die(`FAIL неизвестный ключ ${a} — длинные флаги пишутся через «--» (подробно: --help)`);
  }
  const { pos, opt } = parseArgs(argv, { values: VALUES, flags: FLAGS, commands: ['selftest'] });
  if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h')) { console.log(HELP()); process.exit(0); }
  for (const k of VALUES) if (opt[k] === true || (opt[k] !== undefined && String(opt[k]).trim() === '')) die(`--${k}: нужно значение (подробно: --help)`);
  const selftest = !!opt.selftest || pos[0] === 'selftest';
  if (selftest && pos[0] === 'selftest') pos.shift();
  /* экраны */
  if (opt.viewport !== undefined && opt.viewports !== undefined && String(opt.viewport).trim() !== String(opt.viewports).trim()) die(`заданы и --viewport ${opt.viewport}, и --viewports ${opt.viewports} — это один флаг, оставьте один`);
  const vpRaw = String(opt.viewports ?? opt.viewport ?? 'desktop,mobile');
  const vpNames = [...new Set(vpRaw.split(',').map((s) => s.trim()).filter(Boolean))];
  const badVp = vpNames.filter((n) => !parseViewport(n));
  if (!vpNames.length || badVp.length) die(`Неизвестные экраны: ${badVp.join(', ') || vpRaw}. Есть: ${Object.keys(VIEWPORTS).join(', ')} или запись ШxВ@плотность, например 320x568@2`);
  const vps = vpNames.map((n) => resolveViewport(n));
  /* браузер */
  const browserKind = opt.browser === undefined ? 'chrome' : parseBrowser(opt.browser);
  if (!browserKind) die(`--browser ${opt.browser}: нужно chrome, firefox или edge`);
  if (browserKind !== 'chrome' && !findBrowser(browserKind)) die(`не найден ${browserKind === 'firefox' ? 'Firefox (FIREFOX_PATH)' : 'Edge (EDGE_PATH)'} — укажите путь в переменной окружения`);
  const crops = opt.crops === undefined ? 12 : Number(opt.crops);
  if (!Number.isInteger(crops) || crops < 0 || crops > 60) die(`--crops ${opt.crops}: целое от 0 до 60`);
  if (selftest) { if (pos.length) die(`--selftest не принимает адрес (${pos[0]}): стенд — fixtures/typeset`); process.exit(await runSelftest({ browserKind, vps, explicitVp: opt.viewports !== undefined || opt.viewport !== undefined })); }
  if (!pos[0]) die('Нужен адрес: node typeset.mjs <url> [--viewports desktop,mobile]  (подробно: --help)');
  if (pos.length > 1) die(`Лишние слова: ${pos.slice(1).join(' ')} — адрес один, страницы — --pages "/,/about"`);
  const url = pos[0];
  { let ok = false; try { ok = /^(https?|file):$/i.test(new URL(url).protocol); } catch { /* не адрес */ } if (!ok) die(`Неверный адрес «${url}»: нужен полный адрес — http://…, https://… или file:///…  (подробно: --help)`); }
  let pages = [url];
  if (opt.pages !== undefined) { try { pages = pagesFrom(opt.pages, url); } catch (e) { die(`--pages ${opt.pages}: ${e.message}`); } if (!pages.length) die('--pages: пустой список'); }
  const tag = String(opt.tag || (browserKind === 'chrome' ? 'typeset' : `typeset-${browserKind}`)).replace(/[^\w.-]+/g, '-');
  const run = runDir(opt, url);
  /* база донора и решения — до браузера */
  const baseFor = {};
  if (opt.baseline !== undefined) {
    const spec = String(opt.baseline);
    for (const [name] of vps) {
      let f = spec.includes('{vp}') ? spec.replace(/\{vp\}/g, name) : spec;
      if (!spec.includes('{vp}') && fs.existsSync(f)) { const j = readJson(f); if (j && j.viewport && j.viewport !== name) { const alt = f.replace(new RegExp(`-${j.viewport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=(-[^\\\\/]*)?\\.json$)`), `-${name}`); f = alt !== f && fs.existsSync(alt) ? alt : null; } }
      if (f && fs.existsSync(f)) { const j = readJson(f); if (!j || !Array.isArray(j.blocks)) die(`--baseline ${f}: это не протокол typeset (нет blocks)`); baseFor[name] = { file: f, data: j }; }
    }
    if (!Object.keys(baseFor).length) die(`--baseline ${spec}: файл не найден или снят на других экранах (${vpNames.join(', ')}) — нужен <папка>/typeset/<tag>-<экран>.json`);
  }
  let decisions = null, decFile = null;
  if (opt.decisions !== undefined) { decFile = path.resolve(String(opt.decisions)); if (!fs.existsSync(decFile)) die(`--decisions ${decFile}: файла нет`); }
  else if (fs.existsSync(path.join(run, 'typeset-decisions.json'))) decFile = path.join(run, 'typeset-decisions.json');
  if (decFile) { decisions = readJson(decFile); if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) die(`--decisions ${decFile}: нужен объект { "правило": { "<подпись>": "почему" } }`); }
  const jsonOut = opt.json === undefined ? null : String(opt.json);
  const log = jsonOut === '-' ? (...a) => console.error(...a) : (...a) => console.log(...a);
  if (decisions) { const bad = Object.keys(decisions).filter((k) => !RULE_IDS.includes(k)); const def = Object.keys(decisions).filter((k) => RULE_IDS.includes(k) && !DECIDABLE.has(k)); if (bad.length) log(`WARN решения: неизвестные правила ${bad.join(', ')} — есть ${RULE_IDS.join(', ')}`); if (def.length) log(`WARN решения для ${def.join(', ')} не действуют: это дефекты, а не стиль`); }

  const outDir = ensureDir(path.join(run, 'typeset'));
  collectWarnings();
  const defB = defaultBrowser(); const hint = defaultBrowserHint(browserKind, defB);
  /* Firefox: указатель телефона задаётся при запуске — экраны компьютера, потом телефона своими запусками */
  const jobs = [];
  if (browserKind === 'firefox') { for (const mob of [false, true]) for (const [n, vp] of vps) if (!!vp.isMobile === mob) for (const p of pages) jobs.push([p, n, vp]); }
  else for (const p of pages) for (const [n, vp] of vps) jobs.push([p, n, vp]);
  let browser = null, bMobile = null;
  const open = async (mobile) => { if (browser && (browserKind !== 'firefox' || bMobile === mobile)) return; if (browser) await browser.close().catch(() => {}); browser = await launch({ browser: browserKind, mobile }); bMobile = mobile; };
  try { await open(!!jobs[0][2].isMobile); } catch (e) { console.error(`FAIL браузер: ${e.message}`); process.exit(3); }
  const bInfo = browserInfo(browser);
  const all = []; let broken = false; const summary = [];
  try {
    for (const [pageUrl, vpName, vp] of jobs) {
      const slug = pageSlug(pageUrl);
      const stem = `${tag}-${vpName}${opt.pages !== undefined ? `-${slug}` : ''}`;
      let pass;
      try { await open(!!vp.isMobile); pass = await runPass(browser, pageUrl, vpName, vp, { base: baseFor[vpName] ? baseFor[vpName].data : null, decisions, crops, cropsDir: crops ? path.join(outDir, stem) : null }); }
      catch (e) { log(`FAIL ${pageUrl} ${vpName}: ${String(e.message || e).split('\n')[0]}`); broken = true; summary.push(`${vpName}${pages.length > 1 ? ` ${slug}` : ''} ошибка`); try { await browser.close(); } catch { /* уже закрыт */ } browser = null; continue; }
      const { d, res } = pass;
      const roles = { prose: 0, semantic: 0, display: 0 }; for (const b of d.blocks) if (!b.partOf && roles[b.role] !== undefined) roles[b.role]++;
      log(`\n${bInfo.label} · ${vpName} ${vp.width}×${vp.height} · ${pageUrl} · блоков ${d.blocks.filter((b) => !b.partOf).length} (prose ${roles.prose}, заголовков ${roles.semantic}, display ${roles.display})${hint && !all.length ? ` · ${hint}` : ''}`);
      if (pass.retries) log(`WARN  соединение — страница открылась с ${pass.retries + 1}-й попытки`);
      for (const w of takeWarnings()) log(`WARN  ${w}`);
      if (pass.consent && pass.consent.found && !pass.consent.closed) log(`WARN  окно cookie не закрылось (${pass.consent.box}) — замер с ним`);
      if (baseFor[vpName]) log(`INFO  база: ${baseFor[vpName].file}`);
      for (const l of res.lines) log(`${l.status.padEnd(5)} ${l.what}${l.details ? ` — ${l.details}` : ''}`);
      log(`\n${res.verdict}: ${pl(res.fails, 'провал', 'провала', 'провалов')}, ${pl(res.warns, 'предупреждение', 'предупреждения', 'предупреждений')} · ${(pass.timing.totalMs / 1000).toFixed(1)} с (замер ${pass.timing.measureMs} мс${pass.timing.fontsMs != null ? `, шрифты ${pass.timing.fontsMs} мс` : ''}, синтетика ${pass.timing.synthMs} мс)`);
      const file = path.join(outDir, `${stem}.json`);
      const proto = protocol(pageUrl, vpName, vp, slug, bInfo, pass);
      writeJson(file, proto);
      log(`Сохранено: ${file}`);
      all.push({ file, verdict: res.verdict, viewport: vpName, page: slug }); summary.push(`${vpName}${pages.length > 1 ? ` ${slug}` : ''} ${res.verdict}`);
      if (jsonOut) all[all.length - 1].protocol = { ...proto, generator: undefined };
    }
  } finally { if (browser) await browser.close().catch(() => {}); }
  const verdict = all.some((x) => x.verdict === 'FAIL') ? 'FAIL' : all.some((x) => x.verdict === 'WARN') ? 'WARN' : broken ? 'FAIL' : 'OK';
  if (jobs.length > 1) log(`\nИтог: ${verdict} — ${summary.join(', ')}`);
  if (jsonOut) { const data = all.map((x) => x.protocol); if (jsonOut === '-') process.stdout.write(JSON.stringify(data, null, 1) + '\n'); else { writeJson(path.resolve(jsonOut), { runs: data }); log(`JSON: ${path.resolve(jsonOut)}`); } }
  if (broken) process.exit(3);
  if (opt.strict && verdict === 'FAIL') { log('Код выхода 1: вердикт FAIL (--strict)'); process.exit(1); }
  process.exit(0);
}

/* =====================================================================
   Самопроверка: стенд fixtures/typeset
   ===================================================================== */
async function serveFixtures(root) {
  const MIME = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8' };
  const server = http.createServer((req, res) => {
    let p; try { p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch { res.statusCode = 400; return res.end(); }
    if (p.endsWith(path.sep)) p = path.join(p, 'index.html');
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end('нет'); }
    res.setHeader('content-type', MIME[path.extname(p)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-store'); fs.createReadStream(p).pipe(res);
  });
  for (let port = 4211; port <= 4219; port++) {
    const ok = await new Promise((r) => { server.once('error', () => r(false)); server.listen(port, '127.0.0.1', () => r(true)); });
    if (ok) return { server, base: `http://127.0.0.1:${port}/` };
  }
  throw new Error('порты 4211–4219 заняты — стенд негде поднять');
}

async function runSelftest({ browserKind, vps, explicitVp }) {
  const root = path.join(HERE, 'fixtures', 'typeset');
  const { server, base } = await serveFixtures(root);
  const outDir = ensureDir(path.join(process.env.TEMP || process.env.TMPDIR || os.tmpdir(), `typeset-selftest-${browserKind}`));
  const list = explicitVp ? vps : [resolveViewport('desktop'), resolveViewport('mobile')];
  const gecko = browserKind === 'firefox';
  let bad = 0, n = 0;
  const check = (where, what, ok, got) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${where} ${what}${got !== undefined ? `: ${got}` : ''}`); };
  const R = {};
  let browser = null, bMobile = null;
  const open = async (mobile) => { if (browser && (!gecko || bMobile === mobile)) return; if (browser) await browser.close().catch(() => {}); browser = await launch({ browser: browserKind, mobile }); bMobile = mobile; };
  const order = gecko ? [...list.filter(([, v]) => !v.isMobile), ...list.filter(([, v]) => v.isMobile)] : list;
  try {
    for (const [name, vp] of order) {
      await open(!!vp.isMobile);
      for (const pg of ['index.html', 'hero-low.html']) {
        const t = Date.now();
        const pass = await runPass(browser, base + pg, name, vp, { crops: 12, cropsDir: path.join(outDir, `${pg.replace('.html', '')}-${name}`) });
        R[`${pg}|${name}`] = pass;
        writeJson(path.join(outDir, `${pg.replace('.html', '')}-${name}.json`), protocol(base + pg, name, vp, pageSlug(base + pg), browserInfo(browser), pass));
        console.log(`· ${pg} ${name}: ${pass.res.verdict} (${pass.res.fails} FAIL, ${pass.res.warns} WARN), блоков ${pass.d.blocks.length}, ${((Date.now() - t) / 1000).toFixed(1)} с`);
      }
    }
  } finally { if (browser) await browser.close().catch(() => {}); server.close(); }
  const bInfo = { gecko };
  for (const [name, vp] of order) {
    const phone = vp.width < 600;
    for (const [pg, cases] of Object.entries(SELFTEST)) {
      const pass = R[`${pg}|${name}`]; if (!pass) continue;
      const api = selftestApi(pass, bInfo);
      for (const [what, fn, kind] of cases) {
        if (kind === 'layout' && !['desktop', 'mobile'].includes(name)) continue;
        let r; try { r = fn(api, { phone, gecko, name }); } catch (e) { r = [false, `ошибка проверки: ${e.message}`]; }
        if (r === null) continue;
        check(`${name} ${pg.replace('.html', '')}`, what, !!r[0], r[1]);
      }
    }
  }
  console.log(`\n${bad ? 'FAIL' : 'OK'}: проверок ${n}, расхождений ${bad} · ${browserKind} · протоколы и вырезки ${outDir}`);
  return bad ? 1 : 0;
}

/* помощники проверок: блок по id элемента стенда, пункты правил по блоку */
function selftestApi(pass, bInfo) {
  const { d, res } = pass;
  const byEl = (id) => d.blocks.find((b) => !b.partOf && new RegExp(`#${id}(\\.|$)`).test(b.sig));
  const items = (rule, id) => { const r = res.rules[rule]; if (!r) return []; const b = id ? byEl(id) : null; return r.items.filter((it) => !id || (b && (it.block === b.id || (it.blocks || []).includes(b.id)))); };
  const st = (rule, id) => { const it = items(rule, id); return it.length ? it.reduce((a, x) => worse(a, x.status), 'OK') : 'none'; };
  return { d, res, byEl, items, st, gecko: bInfo.gecko };
}

/* Ожидания стенда: [что, (api, { phone, gecko }) → [ok, что получили] | null — не для этого экрана, 'layout' — зависит от
   раскладки стенда: только desktop и mobile (на 320 и других ширинах строки ломаются иначе) */
const SELFTEST = {
  'index.html': [
    ['#h1: висячие «для» и «и» (Firefox набирает Commissioner уже: «для» и «на», одинокое «заказ»)', (a, e) => { if (e.phone) return null; const b = a.byEl('h1'); const w = b ? b.hang.map((h) => h.word) : []; const want = e.gecko ? ['для', 'на'] : ['для', 'и']; const orph = e.gecko ? a.st('orphan', 'h1') === 'WARN' : true; return [want.every((x) => w.includes(x)) && orph, `hang ${w.join(', ') || 'нет'}${e.gecko ? `, orphan ${a.st('orphan', 'h1')}` : ''}`]; }, 'layout'],
    ['#h1: 4 строки на desktop — h-lines WARN', (a, e) => { if (e.phone) return null; const b = a.byEl('h1'); return [b && b.lines.length === 4 && a.st('h-lines', 'h1') === 'WARN', `${b ? b.lines.length : '?'} строк, ${a.st('h-lines', 'h1')}`]; }, 'layout'],
    ['#h1 на первом экране: висячие помечены «первый экран»', (a) => { const it = a.items('hang', 'h1'); return [it.length > 0 && it.every((x) => x.first), it.length ? `first=${it.map((x) => x.first).join(',')}` : 'висячих у h1 нет']; }],
    ['#h2-lonely: висячее «от», balance INFO', (a, e) => { if (e.phone) return null; const b = a.byEl('h2-lonely'); const w = b ? b.hang.map((h) => h.word) : []; return [w.includes('от') && a.st('balance', 'h2-lonely') === 'INFO', `hang ${w.join(', ') || 'нет'}, balance ${a.st('balance', 'h2-lonely')}`]; }, 'layout'],
    ['#h2-bal: text-wrap: balance — нет висячих и balance', (a) => { const b = a.byEl('h2-bal'); return [b && !b.hang.length && a.st('balance', 'h2-bal') === 'none', b ? `строки ${b.lines.map((l) => l.chars).join('/')}, hang ${b.hang.length}` : 'нет блока']; }],
    ['#p-wide: measure FAIL', (a, e) => { if (e.phone) return null; const it = a.items('measure', 'p-wide'); return [it.length && it[0].status === 'FAIL', it.length ? `${it[0].status} медиана ${it[0].med}` : 'нет']; }, 'layout'],
    ['#p-ok: висячие «для», «вы»', (a, e) => { if (e.phone) return null; const b = a.byEl('p-ok'); const w = b ? b.hang.map((h) => h.word) : []; return [w.includes('для') && w.includes('вы'), `hang ${w.join(', ') || 'нет'}`]; }, 'layout'],
    ['#p-ok: телефон — одно слово в последней строке', (a, e) => { if (!e.phone) return null; return [a.st('orphan', 'p-ok') === 'WARN', a.st('orphan', 'p-ok')]; }, 'layout'],
    ['#p-pretty: телефон — text-wrap: pretty убрал одинокое слово (Firefox не понимает — остаётся)', (a, e) => { if (!e.phone) return null; const s = a.st('orphan', 'p-pretty'); return e.gecko ? [s === 'WARN' && !a.d.env.supports.pretty, `orphan ${s}, pretty ${a.d.env.supports.pretty}`] : [s === 'none' && a.d.env.supports.pretty, `orphan ${s}, pretty ${a.d.env.supports.pretty}`]; }, 'layout'],
    ['#p-nbsp: нет висячих, привязано 13 из 14 (её — не в списке typography.md п. 9)', (a) => { const b = a.byEl('p-nbsp'); return [b && !b.hang.length && b.shortNb === 13 && b.shortTotal === 14, b ? `hang ${b.hang.length}, ${b.shortNb} из ${b.shortTotal}` : 'нет']; }],
    ['#p-forced: «в» перед <br>, слова не склеены', (a) => { const b = a.byEl('p-forced'); return [b && b.hang.some((h) => h.word === 'в') && b.lines.length === 3 && !/вЯрославле|всейРоссии/.test(b.text), b ? `строк ${b.lines.length}, hang ${b.hang.map((h) => h.word).join(',')}, «${b.text}»` : 'нет']; }],
    ['#p-inline: ₽ (U+20BD) системным шрифтом', (a) => { const it = a.items('fallback', 'p-inline'); return [it.some((x) => x.chars.includes('₽')), it.map((x) => `${x.status} ${x.sys}: ${x.chars.join('')}`).join('; ') || 'нет']; }],
    ['#p-inline: «пополам» в двух узлах — не разорвано', (a) => { const b = a.byEl('p-inline'); return [b && !b.broken.some((w) => /пополам/.test(w.word)) && /пополам/.test(b.text), b ? `broken ${b.broken.map((w) => w.word).join(',') || 'нет'}` : 'нет']; }],
    ['#p-just: justify FAIL', (a) => { const it = a.items('justify', 'p-just'); return [it.length && it[0].status === 'FAIL', it.length ? it[0].note : 'нет']; }],
    ['#p-split: разбивка слов — один блок, 3 строки, «для» в конце строки 2', (a, e) => { const b = a.byEl('p-split'); const spans = a.d.blocks.filter((x) => /^span$/.test(x.sig) && /Каждое|анимации/.test(x.text)); return [b && b.lines.length === 3 && b.hang.some((h) => h.word === 'для' && h.line === 2) && !spans.length, b ? `строк ${b.lines.length}, hang ${b.hang.map((h) => `${h.word}/${h.line}`).join(',')}` : 'нет']; }],
    ['#p-tight: leading WARN (1.1)', (a) => { const it = a.items('leading', 'p-tight'); return [it.length && it[0].status === 'WARN' && it[0].lh === 1.1, it.length ? `${it[0].status} ${it[0].lh}` : 'нет']; }],
    ['#caps0: caps-track INFO, #caps1 — нет', (a) => [a.st('caps-track', 'caps0') === 'INFO' && a.st('caps-track', 'caps1') === 'none', `caps0 ${a.st('caps-track', 'caps0')}, caps1 ${a.st('caps-track', 'caps1')}`]],
    ['#p-lat: кириллица системным — fallback FAIL', (a) => { const it = a.items('fallback', 'p-lat'); return [it.some((x) => x.status === 'FAIL'), it.map((x) => `${x.status} ${x.sys}`).join('; ') || 'нет']; }],
    ['#p-syn: синтетический жирный — synthetic FAIL', (a) => { const s = (a.d.synth || []).find((x) => x.fam === 'Only500' && String(x.weight) === '800'); return [s && s.mismatch > 10 && a.items('synthetic').some((x) => /Only500/.test(x.note)), s ? `${s.mismatch}%${s.error ? ' ' + s.error : ''}` : 'нет пробы']; }],
    ['#p-syn-ok: настоящее начертание — 0%', (a) => { const s = (a.d.synth || []).find((x) => x.fam === 'Only500' && String(x.weight) === '500'); return [s && s.mismatch <= 10, s ? `${s.mismatch}%` : 'нет пробы']; }],
    ['#p-ital: курсив без файла — synthetic FAIL', (a) => { const s = (a.d.synth || []).find((x) => x.fam === 'Full' && /italic/.test(x.style)); return [s && s.mismatch > 10, s ? `${s.mismatch}%` : 'нет пробы']; }],
    ['#p-miss: font-error FAIL и fallback-all', (a) => [a.st('font-error') === 'FAIL' && a.st('fallback-all', 'p-miss') === 'FAIL', `font-error ${a.st('font-error')}, fallback-all ${a.st('fallback-all', 'p-miss')}`]],
    ['шрифт Lat: font-display auto — WARN', (a) => { const it = a.items('font-display'); return [it.some((x) => /Lat: font-display auto/.test(x.note) && x.status === 'WARN'), it.map((x) => x.note).join('; ') || (a.d.env.fontDisplayKnown === false ? 'браузер не показывает display' : 'нет')]; }],
    ['#t-prop: tnum INFO, #t-tab — нет', (a) => { const it = a.items('tnum'); return [it.length === 1 && /t-prop/.test(it[0].sig), it.map((x) => x.sig).join(', ') || 'нет']; }],
    ['переносы: Chrome без окна — INFO «не переносит»; Firefox — переносит', (a, e) => { const hy = a.d.env.hyphenation.page; const b = a.byEl('p-hyph'); const n = b ? b.broken.filter((w) => w.type === 'auto').length : 0; return e.gecko ? [hy && n > 0, `переносит ${hy}, перенесено в #p-hyph ${n}`] : [!hy && a.items('hyphens').some((x) => /не переносит/.test(x.note)), `переносит ${hy}`]; }],
    ['#p-narrow: короткая строка на desktop — measure WARN', (a, e) => { if (e.phone) return null; const it = a.items('measure', 'p-narrow'); return [it.length && it[0].status === 'WARN', it.length ? `${it[0].status} медиана ${it[0].med}` : 'нет']; }, 'layout'],
    ['#p-hybreak: разрыв «3D-|принтере.» — hyphen-break', (a) => { const it = a.items('hyphen-break', 'p-hybreak'); return [it.some((x) => /3D-\|принтере/.test(x.note)), it.map((x) => x.note).join('; ') || 'нет']; }],
    ['#p-lead: строка начинается с тире — lead', (a) => { const b = a.byEl('p-lead'); return [b && b.lead.some((x) => x.word === '—') && a.st('lead', 'p-lead') === 'WARN', b ? `lead ${b.lead.map((x) => x.word).join(',') || 'нет'}` : 'нет']; }],
    ['#p-num: «500 | ₽» — num-unit', (a) => { const b = a.byEl('p-num'); return [b && b.numSplit.some((x) => x.pair === '500 | ₽'), b ? `num ${b.numSplit.map((x) => x.pair).join(',') || 'нет'}` : 'нет']; }],
    ['#h2-far: заголовок дальше от своего текста — proximity WARN', (a) => [a.st('proximity', 'h2-far') === 'WARN', a.st('proximity', 'h2-far')]],
    ['первый экран: h1, лид и кнопка найдены, кнопка видна, ось совпала', (a) => { const h = a.d.hero; return [h.h1 && /#h1/.test(h.h1.sig) && h.lede && /#lede/.test(h.lede.sig) && h.cta && /#cta/.test(h.cta.sig) && h.cta.visible && h.axis && h.axis.ok, `h1 ${h.h1 && h.h1.sig}, лид ${h.lede && h.lede.sig}, кнопка ${h.cta && h.cta.sig} видна ${h.cta && h.cta.visible}, ось ${h.axis && h.axis.ok}`]; }, 'layout'],
    ['вырезки: первый экран и висячие', (a) => { const c = a.res.lines.filter((l) => l.rule === 'hang').flatMap((l) => l.items.map((x) => x.crop)).filter(Boolean); return [c.length > 0, `вырезок hang ${c.length}`]; }],
  ],
  'hero-low.html': [
    ['lang="en" при русском тексте — lang-mismatch WARN', (a) => [a.st('lang-mismatch') === 'WARN', a.st('lang-mismatch')]],
    ['кнопка ниже окна — hero WARN', (a) => { const h = a.d.hero; return [h.cta && !h.cta.visible && a.items('hero').some((x) => x.status === 'WARN' && /ниже окна/.test(x.note)), h.cta ? `верх ${h.cta.rect.y}, окно ${a.d.env.vh}` : 'кнопки нет']; }, 'layout'],
    ['кнопка не на оси h1 (6 px) — hero INFO', (a) => { const h = a.d.hero; return [h.axis && !h.axis.ok && a.items('hero').some((x) => x.status === 'INFO' && /не на одной оси/.test(x.note)), h.axis ? `dLeft ${h.axis.dLeft}` : 'нет оси']; }, 'layout'],
    ['текст печатается сам — «меняется само», висячих у него нет', (a) => { const b = a.byEl('p-typing'); return [b && b.changing && a.st('hang', 'p-typing') === 'none', b ? `changing ${b.changing}` : 'блок не найден (пустой в момент замера?)']; }],
    ['h1 с неразрывными пробелами — нет висячих и одиноких', (a) => [a.st('hang', 'h1') === 'none' && a.st('orphan', 'h1') === 'none', `hang ${a.st('hang', 'h1')}, orphan ${a.st('orphan', 'h1')}`]],
  ],
};

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) await main(process.argv.slice(2));
