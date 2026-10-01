#!/usr/bin/env node
/**
 * bgdecor.mjs — что стоит в фоне страницы: рисунки, предметы на полях, буквы-призраки, узоры.
 *
 * Снимает с образца (донора) то, что лежит за содержимым и вокруг него, и кладёт в паспорт донора:
 * вид приёма, где он стоит, чем сделан, насколько он бледный — числом по снимку, — и чем такой же
 * приём сделать у себя. Тем же способом снимается своя сборка, и compare показывает, что из фона
 * донора у нас потерялось.
 *
 *   node bgdecor.mjs <url> [--pages "/,/menu"] [--viewport desktop,mobile] [--out <папка прогона>] [--tag имя]
 *                    [--no-crops] [--json файл|-] [--md файл]
 *   node bgdecor.mjs compare <донор.json> <url | наш.json> [--decisions файл] [--out <папка прогона>]
 *                    [--tag имя] [--viewport desktop,mobile] [--no-crops]
 *   node bgdecor.mjs selftest [--no-browser]
 *   node bgdecor.mjs --help | -h
 *
 * Выход: <папка>/decor/<tag>.json (протокол), <tag>.md (таблица для analysis.md и паспорта донора),
 * вырезки <папка>/decor/<tag>/b01.png … — слева место как на странице, справа само украшение отдельно
 * (бледное — с усиленным контрастом, иначе его не разглядеть); x01.png … — не засчитанное, чтобы
 * глазами проверить и отказ.
 *
 * Виды находок:
 *   drawing        рисунок в фоне: картинка, svg, фон-картинка без повтора или маска, которая служит украшением
 *                  (вне потока или под содержимым блока; pointer-events: none, aria-hidden, пустой alt —
 *                  подсказки, не условие), бледная и не мелкая (от 64 px по большей стороне);
 *   ghost-word     буквы-призраки: слово или буквы очень крупным кеглем (от 64 px и от 3,5 основного кегля)
 *                  с очень низким контрастом; или картинка-слово — бледный ряд из трёх и более знаков
 *                  (так сделаны грузинские буквы mamuka.rest: это svg в фоне, а не текст);
 *   margin-object  предмет или орнамент на полях: заметное (не бледное) украшение сбоку от содержимого — вне
 *                  колонки страницы у края окна или небольшой предмет (до 2% окна) в пустом месте сбоку от
 *                  содержимого своей полосы; от 40×24 px. Украшение внутри карточки — не поле;
 *   pattern        узор мелкой плиткой: фон с повтором и шагом до 240 px или повторяющийся градиент.
 *                  Крупная плитка, плитка с «шумным» именем (noise, grain, paper, texture…) и плитка,
 *                  похожая на зерно, — фактура: ею занимается texture.mjs, здесь только строка
 *                  «фактура — см. texture.mjs».
 * Не считаются: фото и картинки содержимого, логотип, иконки в кнопках и меню, аватары, карты, видео,
 * служебное Tilda, окно cookie, скрытое и обрезанное.
 *
 * Как меряется бледность (по снимку, а не по CSS: у mamuka.rest рисунки с opacity 1, бледность — в самих
 * пикселях). Три снимка одного места: как есть; без украшения; только украшение на прозрачном фоне.
 *   контраст — отношение яркостей «с украшением / без» по видимым пикселям украшения (как в WCAG), берётся
 *              90-й перцентиль: самые заметные места рисунка;
 *   Δ        — средняя разница цвета с фоном, уровней 0–255 (по самому отличающемуся каналу): золотой
 *              орнамент на белом по яркости близок к фону (контраст 2), а по цвету далёк (Δ 114);
 *   видно    — какая доля украшения не закрыта содержимым: рисунок под карточкой — «не видно», не находка.
 * Бледное: контраст до 1,6 и Δ до 45 — или итоговая непрозрачность (opacity по всем предкам) до 0,6.
 * Буквы-призраки текстом: контраст до 1,7 и Δ до 50. Крупное слово с высоким контрастом — не призрак,
 * а заголовок: оно уходит в «не засчитано» с числом контраста.
 *
 * Колонка содержимого — по текстовым блокам страницы (без шапки и закреплённого): левый и правый края,
 * взвешенные по числу знаков. Предмет на полях проверяется по своей полосе: что из содержимого (тексты,
 * картинки, карточки с заливкой) стоит на той же высоте; пусто — по колонке страницы. Сторона: за текстом
 * (под строками текста лежит хотя бы 2% рисунка), слева, справа, по центру — по окну. Раздел — ближайший
 * заголовок выше украшения (h1–h4 и крупные надписи: у mamuka.rest и zakroma.rest тегов h1–h6 почти нет).
 *
 * Флаги:
 *   --pages "/,/a"   страницы от адреса через запятую: каждая снимается на каждом экране, протокол один
 *   --viewport       экраны через запятую (пресеты lib.mjs или ШxВ@плотность); по умолчанию desktop.
 *                    --viewports — то же самое; в compare по умолчанию — экраны донора
 *   --out            папка прогона (по умолчанию runs/<адрес>, см. runDir в lib.mjs): туда decor/
 *   --tag            имя протокола и папки вырезок (буквы, цифры, «-», «_», «.»); по умолчанию — имя сайта
 *                    по адресу (mamuka-rest), в compare — compare
 *   --no-crops       не сохранять вырезки (замер по снимкам всё равно идёт)
 *   --json           куда записать протокол; «-» — JSON в stdout вместо текста
 *   --md             куда записать таблицу
 *   --decisions      compare: файл решений (по умолчанию <папка>/decor-decisions.json)
 *   --no-browser     selftest без стенда в браузере (сверка и флаги)
 *
 * compare: у донора вид есть, у нас нет — НЕТ; есть, но штук меньше и на 10 000 px страницы больше чем
 * вдвое реже — РЕЖЕ. И то и другое без записи в decor-decisions.json — WARN. Решения — json «ключ →
 * причина»: { "ghost-word": "слово раздела стоит в заголовке, второй слой не нужен",
 * "pattern:mobile": "на телефоне узор убран, как у донора" }; ключ — вид или вид:экран; ключи с «_» —
 * комментарии. Чего у донора нет, а у нас есть, печатается как «своё» — проверить, что это задумано.
 *
 * Окна (cookie, SITE_REWORK_DISMISS) перед замером закрываются, как у discover и cliche; окно, которое
 * осталось открытым, — WARN: снимки идут под ним, и контраст измерен неверно.
 *
 * Вердикт: OK — снято; WARN — окно при замере, страница не прокрутилась до низа, часть кандидатов не
 * измерена (предел 70 на экран, свой стиль не вставился), пропуски в compare; FAIL — только selftest.
 * Коды выхода: 0 — OK или WARN; 1 — FAIL selftest или неизвестный флаг; 2 — неверные аргументы или файл;
 * 3 — страница не открылась или браузер не запустился.
 *
 * Чего скрипт не видит: слово, набранное картинкой слитным письмом (один контур — считается рисунком);
 * украшения на холсте (canvas) и внутри теневого DOM; бледный рисунок, растянутый фоном на весь блок
 * (background-size: cover) — он неотличим от фото-подложки; узор, собранный из отдельных элементов.
 * Файлы донора не копируются: рисунки, слова и предметы у себя — свои.
 *
 * Экспорт: KINDS, RECIPES, measurePage, summarize, compareDecor, loadDecisions, decorMarkdown, pixelStats,
 * classify.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  launch, preparePage, gotoRetry, waitForOverlay, closeConsent, consentNote, checkOpenModal, modalNote, forceInstantScroll,
  scrollThrough, freezeMotion, evaluateWith, addStyleSafe, removeStyleSafe, loadSharp, parseArgs, pickViewports, parseViewport,
  runDir, writeJson, readJson, ensureDir, sleep, slugFromUrl, pageSlug, pagesFrom, collectWarnings, takeWarnings, collectNotes, takeNotes,
  SIG_FN, EFFECTIVE_OPACITY_FN, EFFECTIVE_ZOOM_FN, CLIP_SHARE_FN, IS_TILDA_SERVICE_FN,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

/* ---------- виды, пороги, рецепты ---------- */

export const KINDS = {
  drawing: { ru: 'рисунок в фоне', many: 'рисунки в фоне' },
  'ghost-word': { ru: 'буквы-призраки', many: 'буквы-призраки' },
  'margin-object': { ru: 'предмет на полях', many: 'предметы на полях' },
  pattern: { ru: 'узор', many: 'узоры' },
};
/** Чем такой же приём сделать у себя (reference/svg-3d.md, templates/decor-kit). Файлы донора не копируются. */
export const RECIPES = {
  drawing: 'свои рисунки из мира дела: «рваная линия» — svg3d.mjs rough, рисунок линией — .dk-draw (templates/decor-kit); бледность — та же непрозрачность или тот же контраст, что у образца',
  'ghost-word': 'своё слово раздела — .dk-bgword в слое .dk-layer блока .dk-host (templates/decor-kit): кегль и бледность — по замеру; у образца буквы картинкой — у себя текстом своим шрифтом',
  'margin-object': 'свои предметы за колонкой: вырезки своих предметов (media.mjs) или свои рисунки (svg3d.mjs); предмет за краем карточки — .dk-pop (templates/decor-kit)',
  pattern: 'свой узор: плитка из своих рисунков (svg3d.mjs scatter) или россыпь data-dk-scatter (templates/decor-kit); шаг плитки — по замеру',
};
const KIND_ORDER = Object.keys(KINDS);

const T = {
  maxCands: 70,          /* сколько кандидатов мерить по снимкам на одном экране страницы */
  maxTiles: 6,           /* сколько мелких плиток мерить */
  pad: 24,               /* поля вырезки вокруг коробки, px */
  alphaMin: 4,           /* пиксель украшения на снимке «только украшение»: альфа выше этого (слово с opacity .03 — альфа 8) */
  diffMin: 2,            /* пиксель украшения виден: разница «с — без» не меньше, уровней */
  paleContrast: 1.6,     /* бледное: контраст (p90) не выше … */
  paleDelta: 45,         /* … и средняя разница цвета не выше */
  paleOpacity: 0.6,      /* бледное: итоговая непрозрачность не выше */
  ghostContrast: 1.7,    /* слово-призрак: контраст (p90) не выше … */
  ghostDelta: 50,        /* … и средняя разница цвета не выше */
  solid: 0.92,           /* заполнение своей коробки выше этого — сплошная картинка (фото, плашка) */
  minVisShare: 0.02,     /* видна хотя бы такая доля украшения */
  minVisPx: 60,          /* … и хотя бы столько видимых пикселей (CSS px²) */
  drawMin: 64,           /* рисунок: большая сторона от, px */
  drawArea: 2400,        /* рисунок: площадь закрашенной коробки от, px² */
  marginMin: 40,         /* предмет на полях: большая сторона от, px */
  marginThin: 24,        /* … и меньшая сторона от, px: полоска 54×18 — разделитель под абзацем, не предмет */
  marginGap: 0.15,       /* предмет на полях: от края окна не дальше этой доли ширины */
  marginWide: 0.3,       /* предмет на полях: не шире этой доли окна (иначе это иллюстрация, а не предмет) */
  marginSmall: 0.02,     /* предмет в пределах колонки страницы, но сбоку от содержимого своей полосы: площадь не больше этой доли окна */
  underText: 0.02,       /* «за текстом»: под строками текста лежит не меньше этой доли украшения */
  tileMax: 240,          /* мелкая плитка: шаг не больше, px */
  rarer: 0.5,            /* compare: «реже» — частота меньше этой доли донорской */
};

const HELP = `bgdecor.mjs — что стоит в фоне страницы: рисунки, предметы на полях, буквы-призраки, узоры

  node bgdecor.mjs <url> [--pages "/,/menu"] [--viewport desktop,mobile] [--out <папка прогона>] [--tag имя]
                   [--no-crops] [--json файл|-] [--md файл]
  node bgdecor.mjs compare <донор.json> <url | наш.json> [--decisions файл] [--out <папка прогона>]
                   [--tag имя] [--viewport desktop,mobile] [--no-crops]
  node bgdecor.mjs selftest [--no-browser]
  node bgdecor.mjs --help | -h

Выход: <папка>/decor/<tag>.json, <tag>.md и вырезки <папка>/decor/<tag>/b01.png … (слева место как на
странице, справа украшение отдельно; x01.png … — не засчитанное).

Виды:
  drawing        рисунок в фоне: картинка, svg, фон без повтора или маска — украшение (вне потока или под
                 содержимым блока), бледное, от 64 px
  ghost-word     буквы-призраки: слово очень крупным кеглем с очень низким контрастом — текстом или
                 картинкой (бледный ряд из трёх и более знаков)
  margin-object  предмет или орнамент на полях: заметное украшение сбоку от содержимого — вне колонки
                 страницы у края окна или небольшой предмет в пустом месте сбоку от содержимого; от 40×24 px
  pattern        узор мелкой плиткой (шаг до 240 px) или повторяющийся градиент; крупная или «шумная»
                 плитка — фактура: строка «фактура — см. texture.mjs»
Не считаются: фото и картинки содержимого, логотип, иконки в кнопках и меню, аватары, карты, видео.

Флаги:
  --pages "/,/a"   страницы от адреса через запятую: каждая на каждом экране, протокол один
  --viewport       экраны через запятую (desktop, laptop, tablet, mobile, mobile-s, android или
                   ШxВ@плотность); по умолчанию desktop; --viewports — то же; в compare — экраны донора
  --out            папка прогона (по умолчанию ~/.claude/site-rework/runs/<адрес>)
  --tag            имя протокола и папки вырезок; по умолчанию — имя сайта по адресу, в compare — compare
  --no-crops       не сохранять вырезки
  --json           куда записать протокол; «-» — JSON в stdout вместо текста
  --md             куда записать таблицу
  --decisions      compare: файл решений (по умолчанию <папка>/decor-decisions.json)
  --no-browser     selftest без стенда в браузере

Бледность меряется по трём снимкам одного места (как есть, без украшения, только украшение): контраст —
отношение яркостей по видимым пикселям украшения (90-й перцентиль), Δ — средняя разница цвета с фоном
(уровней 0–255). Бледное: контраст до 1.6 и Δ до 45, или непрозрачность до 0.6. Слово-призрак: контраст
до 1.7 и Δ до 50; крупное слово с высоким контрастом — заголовок, не призрак.
Окна (cookie, SITE_REWORK_DISMISS) перед замером закрываются; открытое окно при замере — WARN.

compare: вид есть у донора и нет у нас — НЕТ; штук меньше и на 10 000 px больше чем вдвое реже — РЕЖЕ.
Без записи в decor-decisions.json — WARN. Решения: { "ghost-word": "почему нет или чем заменено",
"pattern:mobile": "…" } — ключ вид или вид:экран, ключи с «_» — комментарии.

Вердикт: OK — снято; WARN — окно при замере, страница не прокрутилась до низа, не всё измерено,
пропуски в compare; FAIL — только selftest.
Коды выхода: 0 — OK или WARN; 1 — FAIL selftest или неизвестный флаг; 2 — неверные аргументы или файл;
3 — страница не открылась или браузер не запустился.
Файлы донора не копируются: рисунки, слова и предметы у себя — свои.`;

let sharpMod;
function needSharp() {
  if (sharpMod === undefined) sharpMod = loadSharp() || null;
  if (!sharpMod) throw new Error('нужен sharp: npm i sharp --prefix ~/.claude/site-rework (или запускать из папки проекта, где он есть)');
  return sharpMod;
}
const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const cut = (s, n) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const per10k = (count, docH) => (docH > 0 ? r1(count / (docH / 10000)) : 0);

/* ======================================================================
   1. В странице: колонка содержимого, заголовки, кандидаты в украшения, плитки фона.
   Зависимости (evaluateWith): sig — подпись элемента, eff — итоговая непрозрачность, zoom — итоговый CSS zoom
   (кегль на экране у Tilda = computed × zoom), clipShare — доля коробки, не обрезанная предками, svc — служебное Tilda.
   Элементы остаются в window.__bgd: шаг замера (locateInPage) прокручивает к ним и считает всё заново — у параллакса
   (rellax на zakroma.rest) коробка, взятая до прокрутки, показывает пустое место.
   ====================================================================== */
async function collectInPage(o) {
  const vw = innerWidth, vh = innerHeight;
  const de = document.documentElement, body = document.body;
  const docH = Math.max(de.scrollHeight, body ? body.scrollHeight : 0);
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|OPTION|SELECT|HEAD|TITLE|META|LINK)$/;
  const memo = (fn) => { const m = new Map(); return (el) => { let v = m.get(el); if (v === undefined) { v = fn(el); m.set(el, v); } return v; }; };
  const E = memo((el) => eff(el));
  const FS = memo((el) => (parseFloat(getComputedStyle(el).fontSize) || 0) * (zoom(el) || 1));
  const pinned = memo((el) => { for (let e = el; e && e !== body && e !== de; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; });
  const cls = (el) => (typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '');
  const ownText = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true; return false; };
  const shown = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility !== 'visible') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  /* верхнеуровневые запятые: «url("a,b"), linear-gradient(red, blue)» → 2 слоя */
  const splitTop = (str) => {
    const out = []; let depth = 0, q = null, cur = ''; const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { cur += ch; if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const urlOf = (item) => { const m = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*?))\s*\)/.exec(item || ''); return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] || '').replace(/\\(.)/g, '$1') : null; };
  const isData = (u) => /^data:/i.test(u || '');
  const fileOf = (u) => { if (!u) return ''; if (isData(u)) return (/^data:([^;,]*)/i.exec(u) || [])[1] + ' (вписана в стиль, ' + u.length + ' знаков)'; let p = u; try { p = new URL(u, location.href).pathname; } catch (e) { /* как есть */ } try { p = decodeURIComponent(p); } catch (e) { /* как есть */ } return p.split('/').filter(Boolean).pop() || u; };
  const absUrl = (u) => { if (!u || isData(u)) return u || null; try { return new URL(u, location.href).href; } catch (e) { return u; } };
  /* ключ «тот же рисунок»: адрес без версии в запросе; вписанная картинка — по длине и началу */
  const keyOf = (u) => (isData(u) ? 'data:' + u.length + ':' + u.slice(0, 80) : String(absUrl(u) || '').replace(/[?#].*$/, ''));
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

  /* ---- короткий селектор, по которому элемент находится один ---- */
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'));
  const STATE = /^(is-|has-|js-|aos-)|^(active|visible|shown|show|in|on|animated|loaded|lazyloaded|wow|in-view|inview)$/i;
  const part = (el) => {
    const tag = el.tagName.toLowerCase();
    if (el.id && !/\d{4,}|^[a-f0-9-]{16,}$/i.test(el.id)) return tag + '#' + esc(el.id);
    const c = [...el.classList].filter((x) => x.length < 40 && !STATE.test(x)).slice(0, 3);
    return tag + (c.length ? '.' + c.map(esc).join('.') : '');
  };
  const one = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
  /* короткий селектор, по которому элемент находится один: сам, с номером среди соседей, с предками (до трёх). Не
     вышло (одинаковые разделы-карточки zakroma.rest) — «родитель > элемент» и какой он по счёту на странице */
  const selectorOf = (el) => {
    const own = part(el); if (one(own)) return own;
    let sel = own; const p0 = el.parentElement;
    if (p0) { const same = [...p0.children].filter((c) => c.tagName === el.tagName); if (same.length > 1) sel = `${own}:nth-of-type(${same.indexOf(el) + 1})`; if (one(sel)) return sel; }
    let cur = el, pathSel = sel;
    for (let i = 0; i < 3 && cur.parentElement && cur.parentElement !== de && cur.parentElement !== body; i++) {
      const p = cur.parentElement; let ps = part(p);
      if (!one(ps) && p.parentElement) { const same = [...p.parentElement.children].filter((c) => c.tagName === p.tagName); if (same.length > 1) ps = `${ps}:nth-of-type(${same.indexOf(p) + 1})`; }
      pathSel = `${ps} > ${pathSel}`; if (one(pathSel)) return pathSel; cur = p;
    }
    const short = p0 && p0 !== body ? `${part(p0)} > ${own}` : own;
    let list = []; try { list = [...document.querySelectorAll(short)]; } catch (e) { /* селектор */ }
    const at = list.indexOf(el);
    return at >= 0 && list.length > 1 ? `${short} (${at + 1}-й из ${list.length})` : short;
  };

  /* ---- текст: владельцы текстовых узлов, основной кегль, порог «очень крупного» ---- */
  const owners = new Map();
  const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.nodeValue; if (!t || !t.trim()) continue;
    const p = n.parentElement; if (!p || SKIP.test(p.tagName) || p instanceof SVGElement) continue;
    const len = norm(t).length; const e = owners.get(p);
    if (e) { e.len += len; e.nodes.push(n); } else owners.set(p, { len, nodes: [n] });
  }
  const texts = [];
  for (const [el, t] of owners) {
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) continue;
    if (E(el) <= 0.01) continue;
    if (svc(el)) continue;
    texts.push({ el, len: t.len, nodes: t.nodes, fs: FS(el), fixed: pinned(el) });
  }
  /* текст в окне по ширине: слайды ленты, уехавшие за край (карусель mamuka.rest тянется до 6000 px), не в счёт */
  const inWidth = (el) => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= vw + 1; };
  const fsVotes = {};
  for (const t of texts) if (t.len >= 40 && !t.fixed && inWidth(t.el)) { const k = Math.round(t.fs); fsVotes[k] = (fsVotes[k] || 0) + t.len; }
  if (!Object.keys(fsVotes).length) for (const t of texts) if (t.len >= 10) { const k = Math.round(t.fs); fsVotes[k] = (fsVotes[k] || 0) + t.len; }
  const bodyFs = Number((Object.entries(fsVotes).sort((a, b) => b[1] - a[1])[0] || [16])[0]) || 16;
  const ghostMin = vw < 600 ? Math.max(48, bodyFs * 3) : Math.max(64, bodyFs * 3.5);

  /* шапка сайта, а не <header> карточки или раздела: с меню внутри, прямо в body или с role=banner */
  const inSiteHeader = (el) => { if (el.closest('nav, [role="navigation"], [role="banner"]')) return true; const h = el.closest('header'); return !!h && (h.parentElement === body || !!h.querySelector('nav, [role="navigation"]')); };

  /* ---- колонка содержимого: края текстовых блоков, взвешенные по числу знаков ---- */
  const colItems = [];
  for (const t of texts) {
    if (t.len < 20 || t.fixed || t.fs >= ghostMin) continue;
    if (E(t.el) < 0.3) continue;
    if (inSiteHeader(t.el)) continue;
    const r = t.el.getBoundingClientRect(); if (r.width < 40 || !inWidth(t.el)) continue;
    colItems.push({ l: Math.max(0, r.left), r: Math.min(vw, r.right), w: t.len });
  }
  const wq = (key, q) => { const s = colItems.slice().sort((a, b) => a[key] - b[key]); const tot = s.reduce((a, x) => a + x.w, 0); let acc = 0; for (const x of s) { acc += x.w; if (acc >= tot * q) return x[key]; } return s.length ? s[s.length - 1][key] : null; };
  const column = colItems.length ? { left: Math.round(wq('l', 0.03)), right: Math.round(wq('r', 0.97)), blocks: colItems.length } : { left: 0, right: vw, blocks: 0 };

  /* ---- заголовки: h1–h4, role=heading и крупные надписи (у mamuka.rest нет h1–h6) ---- */
  const heads = []; const headSet = new Set();
  const addHead = (el, text) => { if (headSet.has(el) || !text) return; headSet.add(el); heads.push({ el, text: text.slice(0, 80) }); };
  for (const el of body.querySelectorAll('h1, h2, h3, h4, [role="heading"]')) { if (!shown(el) || E(el) < 0.3 || pinned(el) || svc(el)) continue; addHead(el, norm(el.innerText || el.textContent)); }
  /* крупная надпись: от 20 px и от 1,4 основного кегля, до 90 знаков; очень крупная (от 1,8 основного) — до 220
     знаков, в заголовок идёт её начало (у zakroma.rest основной текст 13 px, заголовки карточек 23 px, а первый
     экран и раздел меню открывает абзац 29–33 px). Надпись, разбитая на span (цветные слова цитаты), — один
     заголовок: берётся ближайший не строчный предок */
  const headFs = Math.max(20, bodyFs * 1.4);
  for (const t of texts) {
    if (t.fs < headFs || t.fixed || E(t.el) < 0.3) continue;
    if (t.el.closest('a, button, h1, h2, h3, h4, [role="heading"]') || inSiteHeader(t.el)) continue;
    let h = t.el;
    while (h.parentElement && h.parentElement !== body && /^inline/.test(getComputedStyle(h).display)) h = h.parentElement;
    const text = norm(h.innerText || h.textContent);
    if (text.length < 3 || text.length > (t.fs >= bodyFs * 1.8 ? 220 : 90)) continue;
    addHead(h, text);
  }
  heads.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  /* ---- что не считается ---- */
  const LOGO = /logo|логотип/i;
  const CLICK = 'a, button, [role="button"], [role="tab"], [role="menuitem"], summary, label, input, select, [onclick]';
  const NAVS = 'nav, [role="navigation"], [role="menu"], [role="tablist"]';
  const MAPS = '.leaflet-container, .gm-style, .mapboxgl-map, ymaps, [class*="ymaps" i]';
  const MAPSRC = /staticmap|static-maps|maps\.googleapis|maps\.gstatic|tile\.openstreetmap|api-maps\.yandex|static-maps\.yandex|\/tiles?\//i;
  const PLAYER = '.video-js, .plyr, .vjs-poster, [class*="video-player" i], [class*="videoplayer" i]';
  const controlOf = (el) => { let c = null; try { c = el.closest(CLICK); } catch (e) { /* селектор */ } if (c) return c; for (let e = el.parentElement, i = 0; e && e !== body && i < 3; e = e.parentElement, i++) if (getComputedStyle(e).cursor === 'pointer') return e; return null; };
  const excluded = { logo: 0, icon: 0, map: 0, video: 0, photo: 0, hidden: 0, weak: 0, cover: 0, service: 0 };
  /* → причина, по которой элемент не украшение, или ''. pseudo — кандидат на псевдоэлементе; bgOwn — фон самого элемента */
  const notDecor = (el, src, r, pseudo = null, bgOwn = false) => {
    if (svc(el) || el.closest('[data-rw-consent-box]')) return 'service';
    try { if (el.closest(MAPS)) return 'map'; } catch (e) { /* селектор */ }
    if (MAPSRC.test(src || '')) return 'map';
    try { if (el.closest(PLAYER)) return 'video'; } catch (e) { /* селектор */ }
    const par = el.parentElement;
    if (par && [...par.children].some((c) => c !== el && /^(VIDEO|IFRAME)$/.test(c.tagName))) return 'video';
    if (LOGO.test(src || '') && !isData(src)) return 'logo';
    if (LOGO.test(el.getAttribute('alt') || '') || LOGO.test(el.getAttribute('aria-label') || '')) return 'logo';
    for (let e = el, i = 0; e && e !== body && i < 4; e = e.parentElement, i++) {
      if (LOGO.test(cls(e)) || LOGO.test(e.id || '')) return 'logo';
      if (e.tagName === 'A' && e.closest('header, nav, footer, [role="banner"]')) { const h = e.getAttribute('href') || ''; if (h === '/' || h === './' || e.href === location.origin + '/') return 'logo'; }
    }
    const small = Math.max(r.width, r.height) <= 72;
    const ctl = controlOf(el);
    if (ctl) {
      if (small) return 'icon';
      const cr = ctl.getBoundingClientRect();
      if (cr.height <= 120 && cr.width <= 360) return 'icon';       /* кнопка, а не карточка-ссылка */
    }
    /* мелкое в меню, шапке, подвале и закреплённых панелях — значки интерфейса (корзина в шапке mamuka.rest) */
    if (small) { try { if (el.closest(NAVS) || el.closest('header, footer, [role="banner"]') || pinned(el)) return 'icon'; } catch (e) { /* селектор */ } }
    /* мелкий значок при тексте: псевдоэлемент или фон у элемента со своим текстом, картинка в строке текста
       (значок «аура» у заголовка в подвале mamuka.rest, стрелки «>>>» перед подписью zakroma.rest) */
    if (small && (pseudo || bgOwn ? ownText(el) : !!el.parentElement && ownText(el.parentElement))) return 'icon';
    return '';
  };

  /* ---- вне потока: сам элемент или его обёртки без другого содержимого (zakroma: svg в двух div, absolute — у внешнего) ---- */
  const pureWrapper = (p, child) => !ownText(p) && [...p.children].every((c) => c === child || !shown(c));
  const flowOf = (el) => {
    let z = null, e = el;
    for (let i = 0; i < 4 && e && e !== body; i++) {
      const s = getComputedStyle(e);
      if (z === null && s.zIndex !== 'auto') z = parseInt(s.zIndex, 10);
      if (s.position === 'absolute' || s.position === 'fixed') return { out: true, pos: s.position, z, by: e === el ? null : sig(e) };
      const p = e.parentElement; if (!p || !pureWrapper(p, e)) break; e = p;
    }
    return { out: false, pos: getComputedStyle(el).position, z, by: null };
  };
  const hiddenAria = (el) => !!el.closest('[aria-hidden="true"]') || /^(presentation|none)$/i.test(el.getAttribute('role') || '');
  const DECOR_NAME = /decor|ornament|орнамент|sketch|doodle|scribble|illustr|backdrop|watermark|ghost/i;
  /* очень крупное слово вне потока, под aria-hidden или без мыши — само украшение: строкой текста и содержимым полосы
     не считается. Крупный заголовок в потоке — текст: за ним призрак и стоит */
  for (const t of texts) t.decor = t.fs >= ghostMin && (flowOf(t.el).out || hiddenAria(t.el) || getComputedStyle(t.el).pointerEvents === 'none');

  /* ---- положение фон-картинки в коробке носителя: размер и место слоя (нужен натуральный размер файла) ---- */
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const natural = new Map();
  const naturalOf = async (u) => {
    if (natural.has(u)) return natural.get(u);
    const im = new Image(); let res = null;
    try { im.src = u; await Promise.race([im.decode(), new Promise((_, rej) => setTimeout(() => rej(new Error('долго')), 3000))]); if (im.naturalWidth > 0) res = { w: im.naturalWidth, h: im.naturalHeight }; } catch (e) { /* не загрузилась */ }
    natural.set(u, res); return res;
  };
  const lenOf = (v, free) => { /* «50%», «40px», «calc(100% - 40px)» → px от свободного места */
    const s = String(v || '').trim(); let pct = 0, px = 0, ok = false;
    for (const m of s.matchAll(/([+-]?\s*[\d.]+)(%|px)/g)) { const n = parseFloat(m[1].replace(/\s+/g, '')); if (m[2] === '%') pct += n; else px += n; ok = true; }
    return ok ? free * pct / 100 + px : null;
  };
  const layerRect = (el, s, i, nat) => {
    if (!nat) return null;
    const r = el.getBoundingClientRect(); const x0 = r.left + el.clientLeft, y0 = r.top + el.clientTop; const bw = el.clientWidth || r.width, bh = el.clientHeight || r.height;
    const sizes = splitTop(s.backgroundSize), poss = splitTop(s.backgroundPosition);
    const sz = (sizes[i % sizes.length] || 'auto').trim(); const ps = (poss[i % poss.length] || '0% 0%').trim();
    let w, h;
    if (sz === 'cover' || sz === 'contain') { const k = sz === 'cover' ? Math.max(bw / nat.w, bh / nat.h) : Math.min(bw / nat.w, bh / nat.h); w = nat.w * k; h = nat.h * k; }
    else {
      const [a, b = 'auto'] = sz.split(/\s+/);
      const one1 = (v, box) => (v === 'auto' ? null : /%$/.test(v) ? box * parseFloat(v) / 100 : parseFloat(v));
      w = one1(a, bw); h = one1(b, bh);
      if (w == null && h == null) { w = nat.w; h = nat.h; } else if (w == null) w = h * nat.w / nat.h; else if (h == null) h = w * nat.h / nat.w;
    }
    if (!(w > 0 && h > 0)) return null;
    /* «X Y» — по верхнеуровневым пробелам (calc со скобками не резать) */
    const pp = []; let depth = 0, cur = '';
    for (const ch of ps) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ' ' && depth === 0) { if (cur) pp.push(cur); cur = ''; } else cur += ch; }
    if (cur) pp.push(cur);
    const px = lenOf(pp[0], bw - w), py = lenOf(pp[1] != null ? pp[1] : '50%', bh - h);
    if (px == null || py == null) return null;
    const L = Math.max(r.left, x0 + px), Tp = Math.max(r.top, y0 + py), R = Math.min(r.right, x0 + px + w), B = Math.min(r.bottom, y0 + py + h);
    return R - L > 2 && B - Tp > 2 ? box(L, Tp, R - L, B - Tp) : null;
  };
  /* коробка псевдоэлемента: размеры и сдвиги из вычисленного стиля (своего getBoundingClientRect у него нет) */
  const pseudoRect = (el, pseudo) => {
    const ps = getComputedStyle(el, pseudo); const er = el.getBoundingClientRect();
    const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    const w = px(ps.width), h = px(ps.height); if (!(w > 0 && h > 0)) return box(er.left, er.top, er.width, er.height);
    if (ps.position === 'absolute' || ps.position === 'fixed') {
      const base = ps.position === 'fixed' ? { left: 0, top: 0, right: vw, bottom: vh } : er;
      const l = px(ps.left), t = px(ps.top), r = px(ps.right), b = px(ps.bottom);
      return box(l !== null ? base.left + l : r !== null ? base.right - r - w : base.left, t !== null ? base.top + t : b !== null ? base.bottom - b - h : base.top, w, h);
    }
    return box(er.left, er.top, w, h);
  };
  /* коробка слова: элемент вместе со строками текста — гигантское слово часто шире и выше своей коробки (nowrap,
     интерлиньяж 0.8, max-width от соседнего правила) */
  const wordRect = (el) => {
    const a = el.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(el); const b = rg.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return a;
    const L = Math.min(a.left, b.left), Tp = Math.min(a.top, b.top);
    return box(L, Tp, Math.max(a.right, b.right) - L, Math.max(a.bottom, b.bottom) - Tp);
  };

  /* ---- кандидаты ---- */
  const cands = []; const tiles = new Map(); let hostN = 0;
  const hostId = (el) => { let id = el.getAttribute('data-rw-bgd'); if (!id) { id = 'h' + (hostN++); el.setAttribute('data-rw-bgd', id); } return id; };
  const visibleBox = (r) => r.width >= 8 && r.height >= 8 && r.right > 0 && r.left < vw && r.bottom + scrollY > 0;
  /* очки «похоже на украшение»: мерить по снимкам стоит только то, у чего есть хоть один сильный признак */
  const scoreOf = (el, f, extra) => {
    const s = getComputedStyle(el); const hints = []; let sc = 0, strong = false;
    if (f.out) { sc += 1; hints.push(f.by ? `вне потока (${f.pos} у ${f.by})` : `вне потока (${f.pos})`); }
    if (s.pointerEvents === 'none') { sc += 2; strong = true; hints.push('pointer-events: none'); }
    if (hiddenAria(el)) { sc += 2; strong = true; hints.push('aria-hidden'); }
    if (f.z !== null && f.z < 0) { sc += 2; strong = true; hints.push(`z-index ${f.z}`); }
    const op = E(el); if (op <= 0.6) { sc += 2; strong = true; hints.push(`непрозрачность ${op}`); }
    if (s.mixBlendMode && s.mixBlendMode !== 'normal') { sc += 1; hints.push(`наложение ${s.mixBlendMode}`); }
    if (DECOR_NAME.test(cls(el)) || DECOR_NAME.test(el.id || '') || DECOR_NAME.test(extra.name || '')) { sc += 1; hints.push('имя'); }
    for (const [p, why] of extra.plus || []) { sc += p; hints.push(why); }
    if (extra.strong) strong = true;
    return { score: sc, strong: strong || f.out, hints };
  };
  const techOf = (el, f, pseudo) => { const s = pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el); return { position: f.out ? f.pos : s.position, wrapper: f.by, z: f.z, pointerEvents: getComputedStyle(el).pointerEvents, ariaHidden: hiddenAria(el), blend: s.mixBlendMode || 'normal' }; };
  const push = (c) => { c.k = cands.length; cands.push(c); };

  const all = [...body.querySelectorAll('*')];
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (SKIP.test(el.tagName)) continue;
    if (el instanceof SVGElement && tag !== 'svg') continue;
    if (tag === 'svg' && el.parentElement && el.parentElement.closest('svg')) continue;
    if (/^(video|iframe|canvas|object|embed|audio|picture|source)$/.test(tag)) continue;
    const base = getComputedStyle(el);
    if (base.display === 'none') continue;
    const r = el.getBoundingClientRect();

    /* картинка и svg */
    if (tag === 'img' || tag === 'svg') {
      if (!visibleBox(r)) { continue; }
      if (E(el) <= 0.012 || clipShare(el) <= 0.02) { excluded.hidden++; continue; }
      const src = tag === 'img' ? (el.currentSrc || el.src || '') : '';
      const use = tag === 'svg' ? [...el.querySelectorAll('use')].map((u) => u.getAttribute('href') || u.getAttribute('xlink:href') || '').filter(Boolean) : [];
      const why = notDecor(el, src || use.join(' '), r); if (why) { excluded[why]++; continue; }
      const f = flowOf(el);
      const plus = [];
      if (tag === 'img') { const alt = el.getAttribute('alt'); if (alt === null || !alt.trim()) plus.push([1, alt === null ? 'нет alt' : 'пустой alt']); }
      else if (!el.getAttribute('aria-label') && !/^img$/i.test(el.getAttribute('role') || '') && !el.querySelector('title')) plus.push([1, 'svg без описания']);
      const sc = scoreOf(el, f, { name: src || use.join(' '), plus });
      if (!sc.strong || sc.score < 2) { excluded.weak++; continue; }
      /* JPEG без прозрачности — фото, если не приглушён и не наложен на фон (multiply) */
      if (tag === 'img' && /\.jpe?g($|[?#])/i.test(src) && base.mixBlendMode === 'normal' && E(el) > 0.6) { excluded.photo++; continue; }
      const shapes = tag === 'svg' ? el.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse, text').length : 0;
      const source = tag === 'img'
        ? { type: 'картинка', file: fileOf(src), url: absUrl(src), natural: el.naturalWidth ? `${el.naturalWidth}×${el.naturalHeight}` : null, alt: el.getAttribute('alt') }
        : use.length ? { type: 'svg, символ спрайта', symbol: use[0].replace(/^.*#/, '#'), file: fileOf(use[0].replace(/#.*$/, '')) || null }
          : { type: 'встроенный svg', shapes };
      const key = tag === 'img' ? keyOf(src) : use.length ? 'use:' + use[0] : 'svg:' + shapes + ':' + hash(el.innerHTML.replace(/\s+/g, ' ').slice(0, 4000));
      push({ el, host: hostId(el), pseudo: null, src: tag, hide: 'visibility', keepBg: false, key, source, hints: sc.hints, score: sc.score, tech: techOf(el, f, null), selector: selectorOf(el), sig: sig(el), fixed: f.pos === 'fixed' && f.out, rect: () => el.getBoundingClientRect(), box0: r });
      continue;
    }

    for (const pseudo of [null, '::before', '::after']) {
      const s = pseudo ? getComputedStyle(el, pseudo) : base;
      if (pseudo && (s.content === 'none' || s.content === 'normal' || s.display === 'none')) continue;
      const rr = pseudo ? pseudoRect(el, pseudo) : r;
      const bi = s.backgroundImage && s.backgroundImage !== 'none' ? s.backgroundImage : '';
      const mi = (s.maskImage && s.maskImage !== 'none' ? s.maskImage : '') || (s.webkitMaskImage && s.webkitMaskImage !== 'none' ? s.webkitMaskImage : '');
      const hasKids = !pseudo && (ownText(el) || [...el.children].some(shown));

      /* слово в псевдоэлементе: content: "СЛОВО" очень крупным кеглем */
      if (pseudo) {
        const m = /^"((?:[^"\\]|\\.)*)"$|^'((?:[^'\\]|\\.)*)'$/.exec(s.content || '');
        const word = m ? norm((m[1] != null ? m[1] : m[2]).replace(/\\(.)/g, '$1')) : '';
        const pfs = (parseFloat(s.fontSize) || 0) * (zoom(el) || 1);
        if (word && word.length <= 48 && pfs >= ghostMin && visibleBox(rr) && E(el) * (parseFloat(s.opacity) || 0) > 0.008 && !svc(el)) {
          const f = flowOf(el); const ff = { out: f.out || s.position === 'absolute' || s.position === 'fixed', pos: s.position, z: s.zIndex !== 'auto' ? parseInt(s.zIndex, 10) : f.z, by: f.by };
          push({ el, host: hostId(el), pseudo, src: 'text', hide: 'visibility', keepBg: s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text', key: 'text:' + word.toLowerCase(), text: word,
            source: { type: 'текст (псевдоэлемент)', text: word, fs: Math.round(pfs), font: norm(s.fontFamily.split(',')[0]).replace(/["']/g, ''), color: s.color }, hints: ['псевдоэлемент'], score: 9, tech: techOf(el, ff, pseudo),
            selector: selectorOf(el) + pseudo, sig: sig(el) + pseudo, fixed: s.position === 'fixed', rect: () => pseudoRect(el, pseudo), box0: rr, pseudoOpacity: parseFloat(s.opacity) || 1 });
        }
      }
      if (!bi && !mi) continue;
      if (!visibleBox(rr)) continue;
      if (E(el) * (pseudo ? parseFloat(s.opacity) || 0 : 1) <= 0.012) { excluded.hidden++; continue; }

      /* маска с заливкой: рисунок — форма маски, цвет — фон элемента */
      const mu = urlOf(mi);
      if (mu && !hasKids && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) {
        const why = notDecor(el, mu, rr, pseudo, true); if (why) excluded[why]++;
        else {
          const f = flowOf(el); const sc = scoreOf(el, f, { name: mu, plus: [[1, 'пустой носитель']].concat(pseudo ? [[1, 'псевдоэлемент']] : []), strong: !!pseudo });
          if (sc.strong && sc.score >= 2) push({ el, host: hostId(el), pseudo, src: 'mask', hide: 'visibility', keepBg: true, key: 'mask:' + keyOf(mu), source: { type: 'маска CSS', file: fileOf(mu), url: absUrl(mu) }, hints: sc.hints, score: sc.score, tech: techOf(el, f, pseudo), selector: selectorOf(el) + (pseudo || ''), sig: sig(el) + (pseudo || ''), fixed: f.pos === 'fixed' && f.out, rect: pseudo ? () => pseudoRect(el, pseudo) : () => el.getBoundingClientRect(), box0: rr, pseudoOpacity: pseudo ? parseFloat(s.opacity) || 1 : 1 });
          else excluded.weak++;
        }
      }
      if (!bi) continue;

      const layers = splitTop(bi); const reps = splitTop(s.backgroundRepeat), sizes = splitTop(s.backgroundSize);
      for (let i = 0; i < layers.length; i++) {
        const item = layers[i]; const u = urlOf(item); const grad = !u && /gradient\(/.test(item);
        if (!u && !grad) continue;
        const rep = (reps[i % reps.length] || 'repeat').trim().split(/\s+/);
        const [repX, repY] = rep.length === 1 ? (rep[0] === 'repeat-x' ? [true, false] : rep[0] === 'repeat-y' ? [false, true] : [rep[0] !== 'no-repeat', rep[0] !== 'no-repeat']) : [rep[0] !== 'no-repeat', rep[1] !== 'no-repeat'];
        const sz = (sizes[i % sizes.length] || 'auto').trim();
        const without = layers.map((x, j) => (j === i ? 'none' : x)).join(', '), only = layers.map((x, j) => (j === i ? x : 'none')).join(', ');

        /* плитка: фон с повтором или повторяющийся градиент */
        if ((u && (repX || repY)) || (grad && (/repeating-/.test(item) || ((repX || repY) && /px/.test(sz))))) {
          if (rr.width < vw * 0.3 || rr.height < 40) continue;
          const nat = u ? await naturalOf(u) : null;
          const szp = sz.split(/\s+/); const pxOf = (v) => (/px$/.test(v || '') ? parseFloat(v) : null);
          let pw = pxOf(szp[0]), ph = pxOf(szp[1]);
          if (u && nat) { if (sz === 'auto' || sz === 'auto auto') { pw = nat.w; ph = nat.h; } else if (pw != null && ph == null) ph = pw * nat.h / nat.w; else if (pw == null && ph != null) pw = ph * nat.w / nat.h; }
          const period = { x: repX ? (pw != null ? Math.round(pw) : null) : null, y: repY ? (ph != null ? Math.round(ph) : null) : null };
          const stretched = /cover|contain|%/.test(sz);
          const key = (u ? keyOf(u) : 'gradient:' + hash(item)) + '|' + sz;
          const t = tiles.get(key);
          if (t) { t.count++; continue; }
          tiles.set(key, { el, host: hostId(el), pseudo, layer: i, without, grad, src: u ? fileOf(u) : (/repeating-(linear|radial|conic)-gradient/.exec(item) || [])[0] || 'градиент с повтором', url: u ? absUrl(u) : null, size: sz, repeat: rep.join(' '), period, stretched, natural: nat, selector: selectorOf(el) + (pseudo || ''), sig: sig(el) + (pseudo || ''), count: 1, opacity: Math.round(E(el) * (pseudo ? parseFloat(s.opacity) || 1 : 1) * 1000) / 1000, box: { w: Math.round(rr.width), h: Math.round(rr.height) }, rect: pseudo ? () => pseudoRect(el, pseudo) : () => el.getBoundingClientRect() });
          continue;
        }
        if (!u) continue;

        /* фон-картинка без повтора */
        const why = notDecor(el, u, rr, pseudo, true); if (why) { excluded[why]++; continue; }
        const whole = sz === 'cover' || /^100%( 100%)?$/.test(sz);
        if (hasKids && whole) { excluded.cover++; continue; }                 /* фон блока целиком: фото-подложка */
        if (/\.jpe?g($|[?#])/i.test(u) && s.mixBlendMode === 'normal' && E(el) > 0.6) { excluded.photo++; continue; }
        const f = flowOf(el);
        const ff = pseudo ? { out: f.out || s.position === 'absolute' || s.position === 'fixed', pos: s.position, z: s.zIndex !== 'auto' ? parseInt(s.zIndex, 10) : f.z, by: f.by } : f;
        const plus = [];
        if (pseudo) plus.push([1, 'псевдоэлемент']);
        if (!hasKids) plus.push([1, 'пустой носитель фона']); else plus.push([2, 'фон под содержимым блока']);
        const sc = scoreOf(el, ff, { name: u, plus, strong: !!pseudo || hasKids });
        if (!sc.strong || sc.score < 2) { excluded.weak++; continue; }
        const byBg = hasKids || layers.length > 1;
        const nat = byBg && !pseudo ? await naturalOf(u) : null;
        const rectFn = pseudo ? () => pseudoRect(el, pseudo) : byBg ? () => layerRect(el, getComputedStyle(el), i, nat) || el.getBoundingClientRect() : () => el.getBoundingClientRect();
        push({ el, host: hostId(el), pseudo, src: 'bg', hide: byBg ? 'bg' : 'visibility', without, only, keepBg: false, key: 'bg:' + keyOf(u), source: { type: 'фон CSS', file: fileOf(u), url: absUrl(u), size: sz, carrier: hasKids ? 'блок с содержимым' : pseudo ? 'псевдоэлемент' : 'пустой элемент' }, hints: sc.hints, score: sc.score, tech: techOf(el, ff, pseudo),
          selector: selectorOf(el) + (pseudo || ''), sig: sig(el) + (pseudo || ''), fixed: ff.pos === 'fixed' && ff.out, rect: rectFn, box0: rectFn(), underOwn: hasKids, pseudoOpacity: pseudo ? parseFloat(s.opacity) || 1 : 1 });
      }
    }
  }

  /* ---- очень крупный текст: слово целиком (буквы, разбитые на span для анимации, — одно слово) ---- */
  const bigOnly = (root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let any = false; for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.nodeValue.trim()) continue; const p = n.parentElement; if (!p || FS(p) < ghostMin) return false; any = true; } return any; };
  const words = new Set();
  for (const t of texts) {
    if (t.fs < ghostMin) continue;
    let top = t.el;
    while (top.parentElement && top.parentElement !== body && norm(top.parentElement.innerText || top.parentElement.textContent).length <= 48 && bigOnly(top.parentElement)) top = top.parentElement;
    if (words.has(top)) continue; words.add(top);
    const word = norm(top.innerText || top.textContent); if (!word || word.length > 48) continue;
    const r = wordRect(top); if (!visibleBox(r) || svc(top)) continue;
    if (clipShare(top) <= 0.02) { excluded.hidden++; continue; }
    const s = getComputedStyle(top); const f = flowOf(top);
    push({ el: top, host: hostId(top), pseudo: null, src: 'text', hide: 'visibility', keepBg: s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text', key: 'text:' + word.toLowerCase(), text: word,
      source: { type: 'текст', text: word, fs: Math.round(t.fs), font: norm(getComputedStyle(t.el).fontFamily.split(',')[0]).replace(/["']/g, ''), color: getComputedStyle(t.el).color }, hints: [], score: 9, tech: techOf(top, f, null),
      selector: selectorOf(top), sig: sig(top), fixed: f.pos === 'fixed' && f.out, rect: () => wordRect(top), box0: r, inControl: !!controlOf(top) });
  }

  /* ---- содержимое для полос: тексты, крупные картинки, которые не украшения, и карточки — блоки с заливкой и
          крупные ссылки уже окна (бутылки в карточке «Барная карта» mamuka.rest стоят в карточке, а не на поле) ---- */
  const decorEls = new Set(cands.map((c) => c.el));
  const contents = texts.filter((t) => t.len >= 12 && !t.decor && E(t.el) >= 0.3).map((t) => ({ el: t.el, fixed: t.fixed }));
  /* картинка или видео на всю ширину окна — фон первого экрана, а не содержимое полосы: стрелки по бокам первого
     экрана zakroma.rest стоят на его фото и при этом на полях */
  for (const el of body.querySelectorAll('img, video, iframe, canvas')) {
    if (decorEls.has(el) || !shown(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 100 || r.height < 100 || r.width >= vw * 0.92 || E(el) < 0.3) continue;
    contents.push({ el, fixed: pinned(el) });
  }
  const alphaOf = (c) => { const m = /rgba?\(([^)]*)\)/i.exec(String(c || '')); if (!m) return /transparent/i.test(String(c)) ? 0 : 1; const p = m[1].split(/[\s,/]+/).filter(Boolean); return p.length >= 4 ? (/%$/.test(p[3]) ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1; };
  for (const el of all) {
    if (decorEls.has(el) || el instanceof SVGElement || SKIP.test(el.tagName)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 120 || r.height < 80 || r.width >= vw * 0.92) continue;
    const s = getComputedStyle(el); if (s.display === 'none' || s.visibility !== 'visible') continue;
    const card = alphaOf(s.backgroundColor) > 0.5 || (s.backgroundImage !== 'none' && /url\(|gradient\(/.test(s.backgroundImage)) || /^(A|BUTTON)$/.test(el.tagName);
    if (!card || E(el) < 0.3) continue;
    contents.push({ el, fixed: pinned(el) });
  }

  window.__bgd = { cands, tiles: [...tiles.values()], texts, contents, heads, ghostMin, docH };
  const boxOf = (r) => (r ? { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } : null);
  return {
    vw, vh, docH, dpr: devicePixelRatio || 1, bodyFs, ghostMin: Math.round(ghostMin), column, heads: heads.length, texts: texts.length, excluded,
    cands: cands.map((c) => ({ k: c.k, host: c.host, pseudo: c.pseudo, src: c.src, hide: c.hide, without: c.without || null, only: c.only || null, keepBg: !!c.keepBg, key: c.key, text: c.text || null, source: c.source, hints: c.hints, score: c.score, tech: c.tech, selector: c.selector, sig: c.sig, fixed: !!c.fixed, box0: boxOf(c.box0), underOwn: !!c.underOwn, inControl: !!c.inControl })),
    tiles: window.__bgd.tiles.map((t, k) => ({ k, host: t.host, pseudo: t.pseudo, layer: t.layer, without: t.without, grad: t.grad, src: t.src, url: t.url, size: t.size, repeat: t.repeat, period: t.period, stretched: t.stretched, natural: t.natural, selector: t.selector, sig: t.sig, count: t.count, opacity: t.opacity, box: t.box })),
  };
}

/* В странице: прокрутить к кандидату, дать странице успокоиться и вернуть то, что нужно для снимков и разбора:
   коробку, область снимка (с полями, внутри окна), строки текста поверх, содержимое на той же высоте, заголовок. */
async function locateInPage(o) {
  const st = window.__bgd; if (!st) return null;
  const c = o.tile ? st.tiles[o.k] : st.cands[o.k]; if (!c || !c.el.isConnected) return null;
  const vw = innerWidth, vh = innerHeight; const el = c.el; const de = document.documentElement, body = document.body;
  const frame = () => Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 160))]);
  /* конечные анимации — в конец, бесконечные — на паузу в начале: появление не должно попасть на снимок посередине */
  const calm = () => { for (const a of document.getAnimations()) { try { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; if (t.iterations === Infinity) { if (a.playState === 'running') { a.pause(); a.currentTime = 0; } } else if (a.playState !== 'finished') a.finish(); } catch (e) { /* без конца */ } } for (const v of document.querySelectorAll('video')) { try { if (!v.paused) v.pause(); } catch (e) { /* нет */ } } };
  let r = c.rect();
  if (!r) return null;
  if (!c.fixed) {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    r = c.rect() || r; const cy = r.top + r.height / 2;
    if (cy < vh * 0.25 || cy > vh * 0.75) { const sc = window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller : window; sc.scrollBy({ top: cy - vh / 2, behavior: 'instant' }); }
  }
  await frame(); calm(); await new Promise((res) => setTimeout(res, o.pause)); calm(); await frame();
  r = c.rect(); if (!r) return null;
  const R = { l: r.left, t: r.top, r: r.left + r.width, b: r.top + r.height };
  let L, Tp, Rr, B;
  if (o.tile) { /* плитка: кусок фона из середины видимой части носителя */
    const l0 = Math.max(0, R.l), t0 = Math.max(0, R.t), r0 = Math.min(vw, R.r), b0 = Math.min(vh, R.b);
    const w = Math.min(640, r0 - l0), h = Math.min(400, b0 - t0);
    L = Math.floor(l0 + (r0 - l0 - w) / 2); Tp = Math.floor(t0 + (b0 - t0 - h) / 2); Rr = L + Math.floor(w); B = Tp + Math.floor(h);
  } else {
    /* у псевдоэлемента коробка приблизительная; у крупного слова буквы выступают за строку */
    const pad = c.pseudo ? Math.max(o.pad, Math.round(Math.max(r.width, r.height) * 0.5)) : c.src === 'text' ? Math.max(o.pad, Math.round(r.height * 0.2)) : o.pad;
    L = Math.max(0, Math.floor(R.l - pad)); Tp = Math.max(0, Math.floor(R.t - pad)); Rr = Math.min(vw, Math.ceil(R.r + pad)); B = Math.min(vh, Math.ceil(R.b + pad));
  }
  if (Rr - L < 6 || B - Tp < 6) return { out: true };
  const inside = (e) => !c.pseudo && c.hide !== 'bg' && (e === el || el.contains(e));
  /* строки текста, которые лежат на коробке украшения (в координатах области снимка) */
  const lines = [];
  if (!o.tile) {
    const rg = document.createRange();
    for (const t of st.texts) {
      if (lines.length >= 160) break;
      /* закреплённый текст (вкладка «Карта калорий» у края) лежит на украшении только в этот миг прокрутки */
      if (inside(t.el) || t.fixed || t.decor) continue;
      const b = t.el.getBoundingClientRect(); if (!b.width || b.right <= R.l || b.left >= R.r || b.bottom <= R.t || b.top >= R.b) continue;
      for (const n of t.nodes) {
        if (!n.isConnected) continue; rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) { if (q.width < 2 || q.right <= R.l || q.left >= R.r || q.bottom <= R.t || q.top >= R.b) continue; lines.push([Math.round(q.left - L), Math.round(q.top - Tp), Math.round(q.width), Math.round(q.height)]); if (lines.length >= 160) break; }
      }
    }
  }
  /* содержимое на той же высоте: левый и правый края — «колонка» этой полосы */
  let bl = Infinity, br = -Infinity, bn = 0;
  if (!o.tile) for (const t of st.contents) {
    if (t.fixed || inside(t.el)) continue;
    const b = t.el.getBoundingClientRect(); if (b.width < 40 || b.height < 8 || b.bottom <= R.t + 2 || b.top >= R.b - 2 || b.right <= 0 || b.left >= vw) continue;
    bl = Math.min(bl, Math.max(0, b.left)); br = Math.max(br, Math.min(vw, b.right)); bn++;
  }
  /* заголовок: среди заголовков ближайшего раздела-предка (а нет такого — всей страницы) — ближайший выше середины
     украшения, иначе первый ниже. У mamuka.rest все рисунки лежат в одном контейнере страницы: «первый заголовок
     раздела» давал всем один и тот же */
  let section = null;
  if (c.fixed) section = { title: null, how: 'закреплено на экране' };
  else {
    const mine = (h) => h.el === el || el.contains(h.el);
    let pool = null, how = 'по странице';
    for (let e = el.parentElement; e && e !== body && e !== de && !pool; e = e.parentElement) {
      const top = e.parentElement === body || (e.parentElement && e.parentElement.tagName === 'MAIN');
      if (!(/^(SECTION|ARTICLE|HEADER|FOOTER|ASIDE)$/.test(e.tagName) || top || /(^|[-_\s])(section|sec|screen)([-_\s]|$)/i.test(typeof e.className === 'string' ? e.className : ''))) continue;
      if (e.getBoundingClientRect().height >= st.docH * 0.85) break;
      const inSec = st.heads.filter((x) => e.contains(x.el) && !mine(x)); if (inSec.length) { pool = inSec; how = 'раздел'; }
    }
    if (!pool) pool = st.heads.filter((x) => !mine(x));
    const cy = R.t + r.height / 2; let above = null, below = null;
    for (const h of pool) { const y = h.el.getBoundingClientRect().top; if (y <= cy + 4) { if (!above || y > above.y) above = { y, h }; } else if (!below || y < below.y) below = { y, h }; }
    section = above ? { title: above.h.text, how } : below ? { title: below.h.text, how: how === 'раздел' ? how : 'ниже по странице' } : { title: null, how: 'заголовков нет' };
  }
  const s = c.pseudo ? getComputedStyle(el, c.pseudo) : getComputedStyle(el);
  return {
    box: { x: Math.round(R.l), y: Math.round(R.t), w: Math.round(r.width), h: Math.round(r.height) },
    clip: { x: L, y: Tp, w: Rr - L, h: B - Tp }, sx: Math.round(scrollX), sy: Math.round(scrollY),
    pageY: Math.round(R.t + (window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller.scrollTop : scrollY)),
    opacity: Math.round(eff(el) * (c.pseudo ? (parseFloat(s.opacity) || 0) : 1) * 1000) / 1000,
    lines, band: bn ? { left: Math.round(bl), right: Math.round(br), n: bn } : null, section, vw, vh,
  };
}

/* ======================================================================
   2. Пиксели: три снимка одного места → видимость, контраст, цвет, форма
   ====================================================================== */
const LIN = (() => { const t = new Float64Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; t[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; } return t; })();
const lumOf = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const cv = (a) => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; if (!m) return 0; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m; };

/**
 * Разбор трёх снимков одной области (RGBA, одинаковый размер W×H, пиксели устройства):
 *   A — как есть, B — без украшения, S — только украшение на прозрачном фоне (null — маска берётся по разности A и B).
 * lines — строки текста поверх: [[x, y, w, h]] в CSS px от угла области; dpr — пикселей устройства на CSS px.
 * → { maskPx, maskFrom, bbox (CSS px от угла области), fill (заполнение своей коробки), alpha (средняя, 0…1),
 *     visPx, visShare, delta, contrast { p50, p90 }, underText, color, bg, noise, glyphs { n, cover, maxShare, medH,
 *     cvW, cvMass, ratio, h, row, same } }
 */
export function pixelStats(A, B, S, W, H, { dpr = 1, lines = [] } = {}) {
  const n = W * H; const mask = new Uint8Array(n);
  let nM = 0, aSum = 0, x0 = W, y0 = H, x1 = -1, y1 = -1; let maskFrom = 'украшение отдельно'; const ink = [0, 0, 0];
  const dOf = (o) => Math.max(Math.abs(A[o] - B[o]), Math.abs(A[o + 1] - B[o + 1]), Math.abs(A[o + 2] - B[o + 2]));
  const mark = (p, al) => { mask[p] = 1; nM++; aSum += al; const x = p % W, y = (p - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  if (S) for (let p = 0, o = 3; p < n; p++, o += 4) { const al = S[o]; if (al > T.alphaMin) { mark(p, al); ink[0] += S[o - 3] * al; ink[1] += S[o - 2] * al; ink[2] += S[o - 1] * al; } }
  const hasInk = nM > 0 && aSum > 0;
  if (!nM) { maskFrom = 'разность снимков'; for (let p = 0, o = 0; p < n; p++, o += 4) if (dOf(o) >= 6) mark(p, 255); }
  /* ink — свой цвет украшения (без фона под ним): им выбирается подложка вырезки */
  const out = { maskPx: Math.round(nM / (dpr * dpr)), maskFrom, bbox: null, fill: 0, alpha: nM ? r2(aSum / nM / 255) : 0, ink: hasInk ? '#' + ink.map((v) => hex2(v / aSum)).join('') : null, visPx: 0, visShare: 0, delta: 0, contrast: { p50: null, p90: null }, underText: 0, color: null, bg: null, noise: 0, glyphs: null };
  if (!nM) return out;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  out.bbox = { x: r1(x0 / dpr), y: r1(y0 / dpr), w: r1(bw / dpr), h: r1(bh / dpr) };
  out.fill = r2(nM / (bw * bh));
  /* видимые пиксели украшения, контраст, цвет */
  let nV = 0, dSum = 0, nOut = 0, nNoise = 0; const hist = new Uint32Array(1001); const ca = [0, 0, 0], cb = [0, 0, 0];
  for (let p = 0, o = 0; p < n; p++, o += 4) {
    const d = dOf(o);
    if (!mask[p]) { nOut++; if (d >= 8) nNoise++; continue; }
    if (d < T.diffMin) continue;
    nV++; dSum += d;
    const la = lumOf(A[o], A[o + 1], A[o + 2]), lb = lumOf(B[o], B[o + 1], B[o + 2]);
    const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    hist[Math.min(1000, Math.round((ratio - 1) * 50))]++;
    ca[0] += A[o]; ca[1] += A[o + 1]; ca[2] += A[o + 2]; cb[0] += B[o]; cb[1] += B[o + 1]; cb[2] += B[o + 2];
  }
  out.noise = nOut ? r2(nNoise / nOut) : 0;
  out.visPx = Math.round(nV / (dpr * dpr)); out.visShare = r2(nV / nM);
  if (nV) {
    out.delta = r1(dSum / nV);
    const pct = (q) => { let acc = 0; const need = nV * q; for (let i = 0; i <= 1000; i++) { acc += hist[i]; if (acc >= need) return r2(1 + i / 50); } return 21; };
    out.contrast = { p50: pct(0.5), p90: pct(0.9) };
    out.color = '#' + ca.map((v) => hex2(v / nV)).join(''); out.bg = '#' + cb.map((v) => hex2(v / nV)).join('');
  }
  /* под строками текста */
  let under = 0;
  for (const [lx, ly, lw, lh] of lines) {
    const ax = Math.max(0, Math.floor(lx * dpr)), ay = Math.max(0, Math.floor(ly * dpr)), ex = Math.min(W, Math.ceil((lx + lw) * dpr)), ey = Math.min(H, Math.ceil((ly + lh) * dpr));
    for (let y = ay; y < ey; y++) for (let x = ax, p = y * W + ax; x < ex; x++, p++) if (mask[p] === 1) { under++; mask[p] = 2; }
  }
  out.underText = r2(under / nM);
  /* форма: закрашенные столбцы и серии — «ряд знаков» у слова, одна-две серии у рисунка */
  const colN = new Uint32Array(W), colMin = new Int32Array(W).fill(H), colMax = new Int32Array(W).fill(-1);
  for (let y = y0; y <= y1; y++) for (let x = x0, p = y * W + x0; x <= x1; x++, p++) if (mask[p]) { colN[x]++; if (y < colMin[x]) colMin[x] = y; if (y > colMax[x]) colMax[x] = y; }
  const on = Math.max(1, Math.round(bh * 0.01)), gapMin = Math.max(2, Math.round(bw * 0.004)), runMin = Math.max(3, Math.round(bw * 0.012));
  const runs = []; let cur = null, gap = 0;
  for (let x = x0; x <= x1 + 1; x++) {
    const hit = x <= x1 && colN[x] >= on;
    if (hit) { if (!cur) cur = { a: x, b: x, top: H, bot: -1, mass: 0 }; cur.b = x; cur.mass += colN[x]; if (colMin[x] < cur.top) cur.top = colMin[x]; if (colMax[x] > cur.bot) cur.bot = colMax[x]; gap = 0; }
    else if (cur) { gap++; if (gap >= gapMin || x > x1) { runs.push(cur); cur = null; gap = 0; } }
  }
  if (cur) runs.push(cur);
  const big = runs.filter((q) => q.b - q.a + 1 >= runMin);
  const ws = big.map((q) => q.b - q.a + 1), hs = big.map((q) => q.bot - q.top + 1), ms = big.map((q) => q.mass);
  const g = { n: big.length, cover: r2(ws.reduce((a, b) => a + b, 0) / bw), maxShare: r2(Math.max(0, ...ws) / bw), medH: r2(median(hs) / bh), cvW: r2(cv(ws)), cvMass: r2(cv(ms)), ratio: r2(bw / bh), h: Math.round(bh / dpr) };
  g.row = g.n >= 3 && g.ratio >= 1.8 && g.cover >= 0.5 && g.maxShare <= 0.6 && g.medH >= 0.4 && g.h >= 48;
  g.same = g.n >= 3 && g.cvW < 0.05 && g.cvMass < 0.05;      /* ряд одинаковых значков — бордюр, не слово */
  out.glyphs = g;
  return out;
}

/* плитка фона: «с — без» по области → сила, доля сильных пикселей, связь соседних (узор — крупные формы, зерно — нет) */
function tileStats(A, B, W, H) {
  const n = W * H; const D = new Float32Array(n); let sum = 0, strong = 0, flat = 0;
  for (let p = 0, o = 0; p < n; p++, o += 4) { const d = Math.max(Math.abs(A[o] - B[o]), Math.abs(A[o + 1] - B[o + 1]), Math.abs(A[o + 2] - B[o + 2])); D[p] = d; sum += d; if (d >= 6) strong++; if (d <= 1) flat++; }
  const m = sum / n; let v = 0, c = 0, k = 0;
  for (let y = 0; y < H; y++) for (let x = 0, p = y * W; x < W; x++, p++) { const a = D[p] - m; v += a * a; if (x + 1 < W) { c += a * (D[p + 1] - m); k++; } }
  return { mean: r1(m), strong: r2(strong / n), flat: r2(flat / n), lag1: v > 0 && k ? r2((c / k) / (v / n)) : 0 };
}

const rawOf = async (png) => { const { data, info } = await needSharp()(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

/* ======================================================================
   3. Замер кандидата по снимкам и его вид
   ====================================================================== */
const SOLO_BASE = 'html,body{background:none!important;background-color:transparent!important}html,html *,html *::before,html *::after{visibility:hidden!important}';
const BARE = 'background-color:transparent!important;box-shadow:none!important;border-color:transparent!important;outline-color:transparent!important;';
function stylesFor(c) {
  const sel = `[data-rw-bgd="${c.host}"]${c.pseudo || ''}`;
  if (c.hide === 'bg') {
    return {
      hide: `${sel}{background-image:${c.without}!important}`,
      solo: `${SOLO_BASE}${sel}{visibility:visible!important;background-image:${c.only}!important;${BARE}color:transparent!important;-webkit-text-fill-color:transparent!important;-webkit-text-stroke-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}`,
    };
  }
  const bare = c.keepBg ? '' : c.src === 'text' ? `${sel}{background:none!important;box-shadow:none!important;border-color:transparent!important}` : `${sel}{${BARE}}`;
  return {
    hide: `${sel}{visibility:hidden!important}`,
    solo: `${SOLO_BASE}${sel}${c.pseudo ? '' : `,${sel} *`}{visibility:visible!important}${bare}`,
  };
}
const STYLE_KEY = 'bgdecor';
async function shoot(page, loc, extra = {}) { return page.screenshot({ clip: { x: loc.clip.x + loc.sx, y: loc.clip.y + loc.sy, width: loc.clip.w, height: loc.clip.h }, captureBeyondViewport: false, ...extra }); }
/* свой стиль поставлен или снят — дождаться кадра: снимок сразу после вставки стиля иногда выходил ещё без него
   (на экране телефона «без украшения» совпал с «как есть», и буквы стенда ушли в «не видно») */
const nextFrame = (page) => page.evaluate(() => Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 150))])).catch(() => {});
async function restyle(page, css) { const how = css ? await addStyleSafe(page, css, { key: STYLE_KEY, warn: false }) : (await removeStyleSafe(page, STYLE_KEY), 'removed'); await nextFrame(page); return how; }

/* → { loc, px, a (PNG), s (RGBA) } или { skip: причина } */
async function measureCandidate(page, c, deps) {
  const loc = await evaluateWith(page, locateInPage, { k: c.k, pad: T.pad, pause: 260 }, deps).catch((e) => ({ error: String((e && e.message) || e).slice(0, 120) }));
  if (!loc) return { skip: 'элемента уже нет на странице' };
  if (loc.error) return { skip: `не измерено: ${loc.error}`, failed: true };
  if (loc.out) return { skip: 'вне окна после прокрутки (закрытая панель, лента вбок)' };
  const st = stylesFor(c);
  const aPng = await shoot(page, loc);
  if (!(await restyle(page, st.hide))) return { skip: 'не измерено: свой стиль не вставился (CSP страницы)', failed: true, loc };
  let bPng, sPng;
  try {
    bPng = await shoot(page, loc);
    await restyle(page, st.solo);
    sPng = await shoot(page, loc, { omitBackground: true });
  } finally { await restyle(page, null); }
  const [a, b, s] = await Promise.all([rawOf(aPng), rawOf(bPng), rawOf(sPng)]);
  if (a.w !== b.w || a.h !== b.h || a.w !== s.w || a.h !== s.h) return { skip: 'не измерено: снимки одного места вышли разного размера', failed: true, loc };
  const dpr = a.w / loc.clip.w;
  const px = pixelStats(a.data, b.data, s.data, a.w, a.h, { dpr, lines: loc.lines });
  return { loc, px, a: aPng, s, dpr };
}

/**
 * Вид кандидата по замеру. page — { vw, column }. → { kind, side, onMargin, notes[] } или { skip: причина, code }.
 * Порядок: не видно → сплошное → слово-призрак (текстом, картинкой) → бледный рисунок → предмет на полях → не фон.
 */
export function classify(c, m, page) {
  const { loc, px } = m; const vw = loc.vw || page.vw;
  if (!px.maskPx) return { skip: 'на снимке «только украшение» пусто — рисовать нечем', code: 'empty' };
  if (px.visPx < T.minVisPx || px.visShare < T.minVisShare) return { skip: px.visPx ? `почти не видно: видна ${Math.round(px.visShare * 100)}% рисунка — закрыто содержимым` : 'не видно: закрыто содержимым или сливается с фоном', code: 'covered' };
  const bb = px.bbox; const bx = loc.clip.x + bb.x, by = loc.clip.y + bb.y;         /* закрашенная коробка в окне */
  const cx = bx + bb.w / 2; const big = Math.max(bb.w, bb.h);
  const overText = px.underText >= T.underText;
  const band = loc.band || { left: page.column.left, right: page.column.right, n: 0 };
  const gap = Math.round(cx < vw / 2 ? bx : vw - (bx + bb.w));
  const overlap = Math.max(0, Math.min(bx + bb.w, band.right) - Math.max(bx, band.left));
  const leftOf = cx < band.left, rightOf = cx > band.right;
  /* на поле: сбоку от содержимого своей полосы и почти не заходит на него. Вне колонки страницы — у края окна.
     В пределах колонки страницы — только небольшой предмет в пустом месте сбоку от содержимого своей полосы (левый
     орнамент zakroma.rest стоит в 476 px от края, перед колонкой текста); крупный предмет там же (соты 317×268 px у
     заголовка первого экрана) — украшение блока, а не предмет на полях */
  const outColumn = cx < page.column.left || cx > page.column.right;
  const smallObj = bb.w * bb.h <= vw * (loc.vh || 900) * T.marginSmall;
  const onMargin = !overText && (leftOf || rightOf) && overlap <= bb.w * 0.35 && bb.w <= Math.max(160, vw * T.marginWide)
    && (outColumn ? gap <= vw * T.marginGap : smallObj && !!loc.band);
  const side = overText ? 'за текстом' : onMargin ? (leftOf ? 'слева' : 'справа') : cx < vw * 0.4 ? 'слева' : cx > vw * 0.6 ? 'справа' : 'по центру';
  const where = { band: loc.band ? `${band.left}–${band.right}` : null, gap };
  const con = px.contrast.p90; const num = `контраст ${con}, Δ ${px.delta}`;
  const notes = [];
  if (px.maskFrom !== 'украшение отдельно') notes.push('форма — по разности снимков: украшение отдельно не снялось');
  if (px.noise > 0.2) notes.push('фон вокруг менялся между снимками (видео, анимация) — числа приблизительны');
  if (c.src === 'text') {
    if (con <= T.ghostContrast && px.delta <= T.ghostDelta) return { kind: 'ghost-word', side, onMargin: false, notes, where };
    return { skip: `крупное слово «${cut(c.text, 30)}» (${c.source.fs} px): ${num} — ${con >= 3 ? 'контраст высокий' : 'приглушено, но читается'}, не призрак`, code: 'loud-word', side, where };
  }
  if (px.fill > T.solid) return { skip: `сплошная картинка (заполнение ${Math.round(px.fill * 100)}%) — фото или плашка, не рисунок`, code: 'solid', side, where };
  const pale = (con <= T.paleContrast && px.delta <= T.paleDelta) || loc.opacity <= T.paleOpacity;
  const g = px.glyphs;
  if (pale && g && g.row && !g.same) { notes.push(`картинка-слово: ряд из ${g.n} знаков высотой ${g.h} px`); return { kind: 'ghost-word', side, onMargin: false, notes, where }; }
  if (pale) {
    if (big < T.drawMin || bb.w * bb.h < T.drawArea) return { skip: `бледное, но мелкое (${Math.round(bb.w)}×${Math.round(bb.h)} px): ${num}`, code: 'small', side, where };
    if (g && g.same) notes.push(`ряд из ${g.n} одинаковых знаков — бордюр`);
    if (onMargin) notes.push('стоит на поле, вне колонки содержимого');
    return { kind: 'drawing', side, onMargin, notes, where };
  }
  if (onMargin && big >= T.marginMin && Math.min(bb.w, bb.h) >= T.marginThin) return { kind: 'margin-object', side, onMargin: true, notes, where };
  if (onMargin) return { skip: `заметное, на поле, но мелкое (${Math.round(bb.w)}×${Math.round(bb.h)} px) — значок или разделитель, не предмет`, code: 'small', side, where };
  /* почему не на поле — числом: содержимое на той же высоте и расстояние до края окна */
  const whyNot = overText ? 'под текстом' : `в полосе содержимого ${loc.band ? `${band.left}–${band.right} px` : `(колонка страницы ${band.left}–${band.right} px)`}, до края окна ${gap} px`;
  return { skip: `заметная картинка ${whyNot} (${num}, непрозрачность ${loc.opacity}) — украшение блока, а не бледный фон и не предмет на полях`, code: overText ? 'bright-behind-text' : 'bright-in-column', side, where };
}

/* вырезка: слева место как на странице, справа украшение отдельно. Бледное — силуэтом: чёрным по белому, альфа
   растянута до полной (линии наброска с opacity .3 иначе не разглядеть; растяжение яркости sharp тут не годится —
   тонкие линии занимают меньше 1% пикселей). Заметное — как есть, на подложке, с которой оно не сливается */
async function writeCrop(file, aPng, s, { pale = false, color = null } = {}) {
  const sharp = needSharp();
  let data = s.data; let bg = '#FFFFFF';
  if (pale) {
    let aMax = 1; for (let o = 3; o < s.data.length; o += 4) if (s.data[o] > aMax) aMax = s.data[o];
    data = Buffer.alloc(s.data.length);
    for (let o = 3; o < s.data.length; o += 4) data[o] = Math.min(255, Math.round(s.data[o] * 255 / aMax));
  } else if (color && lumOf(parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)) > 0.35) bg = '#1E1E1E';
  const soloPng = await sharp(data, { raw: { width: s.w, height: s.h, channels: 4 } }).flatten({ background: bg }).png().toBuffer();
  const gapPx = 8; const stack = s.w > 760;
  const W = stack ? s.w : s.w * 2 + gapPx, H = stack ? s.h * 2 + gapPx : s.h;
  await sharp({ create: { width: W, height: H, channels: 3, background: '#7A7A7A' } })
    .composite([{ input: aPng, left: 0, top: 0 }, { input: soloPng, left: stack ? 0 : s.w + gapPx, top: stack ? s.h + gapPx : 0 }]).png().toFile(file);
}
const sourceText = (s) => (!s ? '' : s.type === 'текст' || s.type === 'текст (псевдоэлемент)' ? `${s.type} «${cut(s.text, 30)}», ${s.fs} px, ${s.font}` : s.type === 'встроенный svg' ? `встроенный svg (фигур ${s.shapes})` : s.type === 'svg, символ спрайта' ? `svg, символ спрайта ${s.symbol}` : `${s.type} ${cut(s.file, 60)}`);

/* ======================================================================
   4. Замер одной страницы на одном экране
   ====================================================================== */
const DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN, zoom: EFFECTIVE_ZOOM_FN, clipShare: CLIP_SHARE_FN, svc: IS_TILDA_SERVICE_FN };
const bareUrl = (u) => String(u).replace(/#.*$/, '').replace(/\/+$/, '');
const TEX_NAME = /noise|grain|grit|texture|dust|film|paper|scratch|шум|зерн|фактур|бумаг/i;

/**
 * Открыть страницу, закрыть окна, прокрутить, найти и измерить украшения фона.
 * { cropDir — куда писать вырезки (null — не писать), cropBase — от какой папки путь вырезки в протоколе }
 * → { url, viewport, size, docH, column, bodyFs, items[], skipped[], textures[], byKind, open, warnings[], counts }
 */
export async function measurePage(browser, url, vpName, vp, { cropDir = null, cropBase = null, log = () => {} } = {}) {
  const page = await preparePage(browser, vp, {});
  try {
    await gotoRetry(page, url, { timeout: 90000 });
    const landed = page.url();
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    /* окна согласия и выбора города — как у discover и cliche; выбор в окне увёл на другую страницу — открыть нужную заново */
    const overlay = await waitForOverlay(page, 5000, { modalCheck: false });
    let consent = await closeConsent(page).catch((e) => ({ found: false, error: String((e && e.message) || e).slice(0, 120) }));
    const libNav = ((overlay && overlay.dismiss) || []).find((d) => d && d.nav);
    if (!libNav && bareUrl(page.url()) !== bareUrl(landed)) {
      const moved = page.url();
      await gotoRetry(page, url, { timeout: 90000 });
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await waitForOverlay(page, 5000, { modalCheck: false });
      consent = { ...(await closeConsent(page).catch(() => ({ found: false }))), movedTo: moved };
    }
    const modal = await checkOpenModal(page).catch(() => null);
    await forceInstantScroll(page);
    await sleep(600);
    const sc = await scrollThrough(page, { pause: 300 });
    /* картинки, которые прокрутка запустила, — догрузить (до 4 с) */
    await page.evaluate((ms) => new Promise((res) => { const pend = [...document.images].filter((i) => !i.complete); if (!pend.length) return res(0); let left = pend.length; const done = () => { if (--left <= 0) res(pend.length); }; for (const i of pend) { i.addEventListener('load', done, { once: true }); i.addEventListener('error', done, { once: true }); } setTimeout(() => res(pend.length), ms); }), 4000).catch(() => null);
    await sleep(400);
    /* переходы — выключить: у блока с transition: all свойство visibility меняется только в конце перехода, и снимки
       «без украшения» и «только украшение» выходили с тем, что должно быть спрятано (затемнение слайда mamuka.rest) */
    await freezeMotion(page).catch(() => {});
    const found = await evaluateWith(page, collectInPage, null, DEPS);
    const P = { vw: found.vw, vh: found.vh, docH: Math.max(found.docH, sc.pageHeight || 0), dpr: found.dpr, column: found.column, bodyFs: found.bodyFs };
    const warnings = [];
    if (sc.stuck) warnings.push('страница не прокручивается (заставка или overflow: hidden) — ленивые картинки и появления могли не сработать');
    else if (!sc.reachedBottom) warnings.push('прокрутка не дошла до низа страницы — часть украшений могла не попасть в замер');

    /* кого мерить: по очкам, потом сверху вниз; сверх предела — в «не измерено» */
    const order = found.cands.slice().sort((a, b) => b.score - a.score || (a.box0 ? a.box0.y : 0) - (b.box0 ? b.box0.y : 0));
    const take = new Set(order.slice(0, T.maxCands).map((c) => c.k));
    const rest = found.cands.length - take.size;
    if (rest > 0) warnings.push(`кандидатов в украшения ${found.cands.length} — измерены ${take.size} самых вероятных, ещё ${rest} не измерены`);
    const hits = []; const skipped = []; let failed = 0; let n = 0;
    for (const c of found.cands.filter((x) => take.has(x.k)).sort((a, b) => (a.box0 ? a.box0.y : 0) - (b.box0 ? b.box0.y : 0))) {
      n++;
      let m;
      try { m = await measureCandidate(page, c, DEPS); } catch (e) { m = { skip: `не измерено: ${String((e && e.message) || e).slice(0, 120)}`, failed: true }; }
      if (m.failed) failed++;
      const verdict = m.skip ? { skip: m.skip, code: m.failed ? 'failed' : 'gone' } : classify(c, m, P);
      const base = { k: c.k, host: c.host, selector: c.selector, sig: c.sig, source: c.source, sourceText: sourceText(c.source), key: c.key, technique: c.tech, hints: c.hints };
      const where = m.loc && m.px && m.px.bbox ? { box: { x: Math.round(m.loc.clip.x + m.px.bbox.x), y: Math.round(m.loc.pageY - m.loc.box.y + m.loc.clip.y + m.px.bbox.y), w: Math.round(m.px.bbox.w), h: Math.round(m.px.bbox.h) }, share: r1(m.px.bbox.w * m.px.bbox.h / (P.vw * P.vh) * 100), section: m.loc.section ? m.loc.section.title : null, sectionHow: m.loc.section ? m.loc.section.how : null, opacity: m.loc.opacity, alpha: m.px.alpha, contrast: m.px.contrast.p90, contrastMid: m.px.contrast.p50, delta: m.px.delta, visible: m.px.visShare, fill: m.px.fill, color: m.px.color, bg: m.px.bg, underText: m.px.underText } : {};
      const entry = { ...base, ...where, ...(verdict.where ? { band: verdict.where.band, edgeGap: verdict.where.gap } : {}) };
      let cropTmp = null;
      if (cropDir && m.a && m.s) {
        cropTmp = path.join(cropDir, `_c${c.k}.png`);
        const pale = !verdict.skip && verdict.kind !== 'margin-object';
        try { await writeCrop(cropTmp, m.a, m.s, { pale: pale || verdict.code === 'small' || verdict.code === 'covered', color: m.px.ink || m.px.color }); } catch { cropTmp = null; }
      }
      if (verdict.skip) skipped.push({ ...entry, why: verdict.skip, code: verdict.code, side: verdict.side || null, _crop: cropTmp });
      else hits.push({ ...entry, kind: verdict.kind, side: verdict.side, onMargin: !!verdict.onMargin, notes: verdict.notes, glyphs: verdict.kind === 'ghost-word' && c.src !== 'text' ? m.px.glyphs.n : null, _crop: cropTmp });
      if (n % 10 === 0) log(`  … измерено ${n} из ${take.size}`);
    }
    if (failed) warnings.push(`не измерено по снимкам: ${failed} — причины в «не засчитано»`);

    /* плитки фона: мелкая плитка с рисунком — узор; крупная, «шумная» или слабая — фактура */
    const textures = []; let tilesMeasured = 0;
    for (const t of found.tiles) {
      const step = [t.period.x, t.period.y].filter((v) => v != null); const minStep = step.length ? Math.min(...step) : null;
      const label = `${t.src}${minStep != null ? `, шаг ${minStep} px` : ''}, ${t.repeat}`;
      const asTexture = (why) => textures.push({ selector: t.selector, src: t.src, url: t.url, size: t.size, repeat: t.repeat, period: t.period, count: t.count, why });
      if (t.stretched && !t.grad) { asTexture('растянута на блок — не плитка'); continue; }
      if (TEX_NAME.test(t.src) || TEX_NAME.test(t.url || '')) { asTexture('имя файла — шум, бумага или текстура'); continue; }
      if (minStep != null && minStep > T.tileMax) { asTexture(`крупная плитка (шаг ${minStep} px)`); continue; }
      if (!t.grad && minStep == null) { asTexture('шаг плитки не определился'); continue; }
      if (tilesMeasured >= T.maxTiles) { asTexture('не измерена: плиток больше предела'); continue; }
      tilesMeasured++;
      const loc = await evaluateWith(page, locateInPage, { k: t.k, tile: true, pad: 0, pause: 200 }, DEPS).catch(() => null);
      if (!loc || loc.out) { skipped.push({ selector: t.selector, sig: t.sig, sourceText: `фон с повтором ${label}`, why: 'плитка вне окна после прокрутки', code: 'gone' }); continue; }
      const aPng = await shoot(page, loc);
      if (!(await restyle(page, `[data-rw-bgd="${t.host}"]${t.pseudo || ''}{background-image:${t.without}!important}`))) { skipped.push({ selector: t.selector, sig: t.sig, sourceText: `фон с повтором ${label}`, why: 'не измерено: свой стиль не вставился (CSP страницы)', code: 'failed' }); continue; }
      let bPng; try { bPng = await shoot(page, loc); } finally { await restyle(page, null); }
      const [a, b] = await Promise.all([rawOf(aPng), rawOf(bPng)]);
      const ts = a.w === b.w && a.h === b.h ? tileStats(a.data, b.data, a.w, a.h) : null;
      if (!ts || ts.mean < 0.4) { skipped.push({ selector: t.selector, sig: t.sig, sourceText: `фон с повтором ${label}`, why: 'плитку не видно: закрыта содержимым или сливается с фоном', code: 'covered' }); continue; }
      if (ts.strong < 0.02 || ts.lag1 < 0.6) { asTexture(`мелкая плитка без рисунка (сильных пикселей ${Math.round(ts.strong * 100)}%, связь соседних ${ts.lag1}) — похоже на зерно`); continue; }
      let cropTmp = null;
      if (cropDir) { cropTmp = path.join(cropDir, `_t${t.k}.png`); try { const diff = Buffer.alloc(a.w * a.h * 4); for (let p = 0, o = 0; p < a.w * a.h; p++, o += 4) { const d = Math.min(255, Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2])) * 255 / Math.max(8, ts.mean * 6)); diff[o] = diff[o + 1] = diff[o + 2] = 255 - d; diff[o + 3] = 255; } await writeCrop(cropTmp, aPng, { data: diff, w: a.w, h: a.h }); } catch { cropTmp = null; } }
      hits.push({ k: `t${t.k}`, host: t.host, selector: t.selector, sig: t.sig, kind: 'pattern', side: 'фон блока', onMargin: false, key: `tile:${t.src}|${t.size}`, source: { type: t.grad ? 'градиент с повтором' : 'фон CSS с повтором', file: t.src, url: t.url, size: t.size, repeat: t.repeat, period: t.period }, sourceText: `${t.grad ? '' : 'фон с повтором '}${label}`,
        box: { x: loc.box.x, y: loc.pageY, w: loc.box.w, h: loc.box.h }, share: r1(Math.min(loc.box.w, P.vw) * Math.min(loc.box.h, P.vh) / (P.vw * P.vh) * 100), section: loc.section ? loc.section.title : null, sectionHow: loc.section ? loc.section.how : null,
        opacity: t.opacity, alpha: null, contrast: null, delta: ts.mean, visible: null, technique: { position: null, wrapper: null, z: null, pointerEvents: null, ariaHidden: false, blend: 'normal' }, hints: [], notes: [`носителей с этой плиткой: ${t.count}`, `сильных пикселей ${Math.round(ts.strong * 100)}%, связь соседних ${ts.lag1}`], carriers: t.count, _crop: cropTmp });
    }

    /* одинаковые — одной строкой ×N; номера сверху вниз; вырезка — у первого в группе */
    hits.sort((a, b) => (a.box ? a.box.y : 0) - (b.box ? b.box.y : 0));
    const groups = new Map();
    for (const h of hits) { const gk = `${h.kind}|${h.key}`; const g = groups.get(gk); if (g) g.push(h); else groups.set(gk, [h]); }
    const items = []; let id = 0;
    const rel = (f) => (f ? path.relative(cropBase || path.dirname(cropDir), f).replace(/\\/g, '/') : null);
    const finalize = (tmp, name) => { if (!tmp || !cropDir) return null; const f = path.join(cropDir, name); try { fs.renameSync(tmp, f); return rel(f); } catch { return null; } };
    for (const list of groups.values()) {
      const h = list[0]; id++; const iid = `b${String(id).padStart(2, '0')}`;
      const { _crop, k, host, key, ...rest2 } = h;
      items.push({ id: iid, ...rest2, kindRu: KINDS[h.kind].ru, count: list.length, members: list.map((x) => ({ selector: x.selector, host: x.host, y: x.box ? x.box.y : null, side: x.side, section: x.section, pseudo: /::(before|after)$/.exec(x.selector) ? RegExp.lastMatch : null })), crop: finalize(_crop, `${iid}.png`) });
      for (const x of list.slice(1)) if (x._crop) fs.rmSync(x._crop, { force: true });
    }
    let xn = 0;
    const skippedOut = skipped.map((s) => { const { _crop, k, host, key, ...rest2 } = s; const keep = _crop && xn < 24 && s.code !== 'gone' && s.code !== 'failed'; let crop = null; if (keep) { xn++; crop = finalize(_crop, `x${String(xn).padStart(2, '0')}.png`); } else if (_crop) fs.rmSync(_crop, { force: true }); return { ...rest2, host, crop }; });
    const byKind = {};
    for (const kind of KIND_ORDER) { const li = items.filter((i) => i.kind === kind); const count = li.reduce((a, i) => a + i.count, 0); byKind[kind] = { count, groups: li.length, per10k: per10k(count, P.docH) }; }
    const cons = consent && (consent.found || consent.error || consent.dismiss || consent.movedTo) ? consentNote(consent).replace(/\*\*/g, '') + (consent.movedTo ? ` · увело на ${consent.movedTo} — адрес открыт заново` : '') : null;
    if (modal) warnings.push(modalNote(modal, page));
    if (page.rwWrongPage) warnings.push(`замер не той страницы: открылась ${page.rwWrongPage.got || page.url()}`);
    return {
      url, page: (() => { try { return new URL(url).pathname || '/'; } catch { return url; } })(), viewport: vpName, size: `${vp.width}×${vp.height}@${vp.deviceScaleFactor || 1}`,
      docH: P.docH, column: P.column, bodyFs: P.bodyFs, ghostMin: found.ghostMin, items, skipped: skippedOut, textures, byKind,
      counts: { candidates: found.cands.length, measured: take.size, tiles: found.tiles.length, excluded: found.excluded },
      open: { attempt: (page.gotoInfo || {}).attempt || 1, consent: cons, modal: modal ? modal.sig : null, reachedBottom: !!sc.reachedBottom, stuck: !!sc.stuck },
      warnings,
    };
  } finally { await page.close().catch(() => {}); }
}

/* ======================================================================
   5. Сводка: частота на 10 000 px, приёмы фона образца, чем воспроизвести
   ====================================================================== */
const spread = (list) => { const v = list.filter((x) => x != null && Number.isFinite(x)); if (!v.length) return null; const a = Math.min(...v), b = Math.max(...v); return a === b ? String(a) : `${a}–${b}`; };
const tally = (list) => { const m = new Map(); for (const x of list) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
/* «семейство» селектора: последний шаг пути без номеров (span.body-icon-main.body-icon-main--4 → span.body-icon-main) */
const familyOf = (sel) => { const last = String(sel || '').replace(/::(before|after)$/, '').replace(/ \(\d+-й из \d+\)$/, '').split(' > ').pop().replace(/:nth-of-type\(\d+\)/g, ''); const [tag, ...cl] = last.split('.'); return [tag, ...new Set(cl.map((c) => c.replace(/(--|__|-|_)?\d+$/, '')).filter(Boolean))].join('.'); };

/** Сводка по экранам: { [экран]: { pages, docH, byKind: { вид: { count, groups, per10k } }, techniques[] } } */
export function summarize(results) {
  const out = {};
  for (const r of results) {
    const s = out[r.viewport] || (out[r.viewport] = { pages: 0, docH: 0, byKind: Object.fromEntries(KIND_ORDER.map((k) => [k, { count: 0, groups: 0, per10k: 0 }])), items: [], textures: 0 });
    s.pages++; s.docH += r.docH; s.textures += r.textures.length;
    for (const k of KIND_ORDER) { s.byKind[k].count += r.byKind[k].count; s.byKind[k].groups += r.byKind[k].groups; }
    s.items.push(...r.items);
  }
  for (const s of Object.values(out)) {
    for (const k of KIND_ORDER) s.byKind[k].per10k = per10k(s.byKind[k].count, s.docH);
    s.techniques = [];
    for (const k of KIND_ORDER) {
      const li = s.items.filter((i) => i.kind === k); if (!li.length) continue;
      const count = s.byKind[k].count;
      const sides = tally(li.flatMap((i) => i.members.map((m) => m.side))).map(([a, n]) => `${a} ${n}`).join(', ');
      const how = tally(li.map((i) => [i.source.type, i.technique && i.technique.position && i.technique.position !== 'static' ? i.technique.position : '', i.technique && i.technique.z != null ? `z-index ${i.technique.z}` : '', i.technique && i.technique.pointerEvents === 'none' ? 'pointer-events: none' : ''].filter(Boolean).join(', '))).slice(0, 2).map(([a, n]) => `${a}${li.length > 1 ? ` (${n})` : ''}`).join('; ');
      const fam = tally(li.flatMap((i) => i.members.map((m) => familyOf(m.selector)))).slice(0, 3).map(([a, n]) => `${a}${n > 1 ? ` ×${n}` : ''}`).join(', ');
      const pale = k === 'margin-object' ? '' : k === 'pattern' ? `шаг плитки ${spread(li.map((i) => (i.source.period ? Math.min(...[i.source.period.x, i.source.period.y].filter((v) => v != null)) : null))) || '—'} px` : `контраст ${spread(li.map((i) => i.contrast)) || '—'}, Δ ${spread(li.map((i) => i.delta)) || '—'}, непрозрачность ${spread(li.map((i) => i.opacity)) || '—'}`;
      const size = k === 'ghost-word' ? `высота ${spread(li.map((i) => (i.source.fs ? i.source.fs : i.box ? i.box.h : null)))} px` : k === 'pattern' ? '' : `размер ${spread(li.map((i) => (i.box ? Math.max(i.box.w, i.box.h) : null)))} px`;
      s.techniques.push({ kind: k, text: `${KINDS[k].many}: ${count} на ${s.docH} px (${s.byKind[k].per10k} на 10 000 px)${[pale, size, sides ? `где: ${sides}` : '', how ? `чем сделано: ${how}` : '', fam].filter(Boolean).map((x) => ` · ${x}`).join('')}` });
    }
    delete s.items;
  }
  return out;
}

/* ======================================================================
   6. Сверка с донором
   ====================================================================== */
/** Решения «почему нет или чем заменено»: { вид | вид:экран → причина }. → { file, exists, map, bad[] } */
export function loadDecisions(file) {
  const res = { file, exists: false, map: {}, bad: [] };
  if (!file || !fs.existsSync(file)) return res;
  res.exists = true;
  const j = readJson(file);
  if (!j || typeof j !== 'object' || Array.isArray(j)) { res.bad.push('файл не читается: нужен объект «ключ → причина»'); return res; }
  for (const [k, v] of Object.entries(j)) {
    if (k.startsWith('_')) continue;
    const kind = k.split(':')[0];
    if (!KINDS[kind]) { res.bad.push(`ключ «${k}»: вида «${kind}» нет (есть ${KIND_ORDER.join(', ')})`); continue; }
    if (typeof v !== 'string' || !v.trim()) { res.bad.push(`ключ «${k}»: нужна причина строкой`); continue; }
    res.map[k] = v.trim();
  }
  return res;
}
const summaryOf = (doc) => (doc && doc.summary) || summarize((doc && doc.results) || []);

/**
 * Сверка протоколов: что есть у донора и нет у нас — по видам и частоте.
 * → { viewports: [{ viewport, rows[], extra[] }], verdict, warn[] }; строка: { kind, donor, ours, status, level, note, decision, key }
 */
export function compareDecor(donor, ours, decisions = { map: {} }, { viewports = null } = {}) {
  const ds = summaryOf(donor), os = summaryOf(ours); const warn = []; const out = [];
  const names = viewports && viewports.length ? viewports : Object.keys(ds);
  for (const vp of names) {
    const d = ds[vp], o = os[vp];
    if (!d) { warn.push(`у донора нет замера на экране ${vp}`); continue; }
    if (!o) { warn.push(`у нас нет замера на экране ${vp} — сравнить не с чем`); out.push({ viewport: vp, rows: [], extra: [], missing: true }); continue; }
    const rows = []; const extra = [];
    for (const k of KIND_ORDER) {
      const a = d.byKind[k], b = o.byKind[k];
      if (!a.count && !b.count) continue;
      if (!a.count) { extra.push({ kind: k, count: b.count, per10k: b.per10k }); continue; }
      const key = [`${k}:${vp}`, k].find((x) => decisions.map && decisions.map[x]); const decision = key ? decisions.map[key] : '';
      const ratio = a.per10k > 0 ? b.per10k / a.per10k : 1;
      let status = 'ЕСТЬ', note = '';
      if (!b.count) status = 'НЕТ';
      else if (b.count < a.count && ratio < T.rarer) { status = 'РЕЖЕ'; note = `у нас в ${r1(1 / ratio)} раза реже`; }
      else if (ratio > 2 && b.count > a.count) note = `у нас чаще в ${r1(ratio)} раза — проверить, что не перебор`;
      const open = status !== 'ЕСТЬ' && !decision;
      rows.push({ kind: k, donor: { count: a.count, per10k: a.per10k }, ours: { count: b.count, per10k: b.per10k }, status, level: open ? 'WARN' : 'OK', note, decision, key: key || null });
      if (open) warn.push(`${vp}: ${KINDS[k].many} — ${status === 'НЕТ' ? 'у донора есть, у нас нет' : `у донора ${a.per10k} на 10 000 px, у нас ${b.per10k}`}, решения нет ("${k}" в decor-decisions.json)`);
    }
    out.push({ viewport: vp, rows, extra, pages: { donor: d.pages, ours: o.pages }, docH: { donor: d.docH, ours: o.docH } });
  }
  return { viewports: out, verdict: warn.length ? 'WARN' : 'OK', warn };
}

/* ======================================================================
   7. Печать и markdown
   ====================================================================== */
const md = (s) => String(s == null ? '—' : s).replace(/\|/g, '/').replace(/\n/g, ' ');
const itemLine = (i) => `${i.id} ${i.kindRu}${i.glyphs ? ' (картинкой)' : ''} — ${i.selector} · ${i.section ? `«${cut(i.section, 40)}»` : 'без заголовка'} · ${i.box ? `${i.box.w}×${i.box.h} px (${i.share}% окна)` : ''} · ${i.side}${i.onMargin && i.kind === 'drawing' ? ', на поле' : ''} · ${i.sourceText}${i.kind === 'pattern' ? '' : ` · непрозрачность ${i.opacity} · контраст ${i.contrast}, Δ ${i.delta}`}${i.count > 1 ? ` · ×${i.count}` : ''}${i.crop ? ` · ${i.crop}` : ''}`;

function printPage(r, log) {
  log(`\n== ${r.viewport} ${r.size} — ${r.url}`);
  log(`страница ${r.docH} px · колонка содержимого ${r.column.left}–${r.column.right} px · основной кегль ${r.bodyFs} px, «очень крупный» — от ${r.ghostMin} px${r.open.attempt > 1 ? ` · открылась с ${r.open.attempt}-й попытки` : ''}`);
  if (r.open.consent) log(`окно на странице: ${r.open.consent}`);
  const ex = r.counts.excluded; const exText = [['logo', 'логотип'], ['icon', 'иконки в кнопках и меню'], ['map', 'карты'], ['video', 'видео'], ['photo', 'фото'], ['cover', 'фон блока целиком'], ['hidden', 'скрытое'], ['weak', 'без признаков украшения']].filter(([k]) => ex[k]).map(([k, t]) => `${t} ${ex[k]}`).join(', ');
  log(`кандидатов ${r.counts.candidates}, измерено ${r.counts.measured}; находок ${r.items.reduce((a, i) => a + i.count, 0)} (строк ${r.items.length}), не засчитано ${r.skipped.length}${exText ? `; не считалось вовсе: ${exText}` : ''}`);
  for (const i of r.items) { log(`  ${itemLine(i)}`); for (const nt of i.notes || []) log(`       ${nt}`); }
  if (!r.items.length) log('  находок нет');
  log(`итог на 10 000 px: ${KIND_ORDER.map((k) => `${KINDS[k].many} ${r.byKind[k].count}${r.byKind[k].count ? ` (${r.byKind[k].per10k})` : ''}`).join(', ')}`);
  if (r.textures.length) log(`фактура — см. texture.mjs: ${r.textures.slice(0, 4).map((t) => `${t.src}${t.count > 1 ? ` ×${t.count}` : ''} (${t.why})`).join('; ')}${r.textures.length > 4 ? ` и ещё ${r.textures.length - 4}` : ''}`);
  if (r.skipped.length) {
    log('не засчитано:');
    const by = new Map(); for (const s of r.skipped) { const g = by.get(s.code) || []; g.push(s); by.set(s.code, g); }
    for (const list of by.values()) { for (const s of list.slice(0, 3)) log(`  · ${s.selector} — ${s.why}${s.crop ? ` · ${s.crop}` : ''}`); if (list.length > 3) log(`  · … ещё ${list.length - 3} с той же причиной`); }
  }
  for (const w of r.warnings) log(`WARN ${w}`);
}
function printSummary(summary, log) {
  for (const [vp, s] of Object.entries(summary)) {
    log(`\nприёмы фона образца (${vp}${s.pages > 1 ? `, страниц ${s.pages}` : ''}):`);
    if (!s.techniques.length) log('  в фоне ничего не найдено — фон ровный');
    for (const t of s.techniques) log(`  · ${t.text}`);
    if (s.textures) log(`  · фактура — см. texture.mjs (плиток и слоёв: ${s.textures})`);
    const kinds = s.techniques.map((t) => t.kind);
    if (kinds.length) { log('чем воспроизвести у себя (файлы донора не копировать):'); for (const k of kinds) log(`  · ${KINDS[k].many}: ${RECIPES[k]}`); }
  }
}

/** Таблица для analysis.md и паспорта донора. */
export function decorMarkdown(doc) {
  const L = [`# Фон: рисунки, предметы на полях, буквы-призраки — ${doc.url}`, '', `Снято ${String(doc.takenAt).slice(0, 10)} · экраны: ${doc.viewports.join(', ')} · страниц: ${doc.pages.length} · вердикт **${doc.verdict}**`, '',
    'Замер bgdecor.mjs: три снимка одного места — как есть, без украшения, только украшение. Контраст — отношение яркостей по видимым пикселям украшения (90-й перцентиль); Δ — средняя разница цвета с фоном, уровней 0–255. Вырезка: слева место как на странице, справа украшение отдельно (бледное — с усиленным контрастом).', ''];
  for (const r of doc.results) {
    L.push(`## ${r.viewport} ${r.size} — ${r.page}`, '', `Страница ${r.docH} px · колонка содержимого ${r.column.left}–${r.column.right} px · кандидатов ${r.counts.candidates}, измерено ${r.counts.measured}`, '');
    if (r.items.length) {
      L.push('| № | вид | раздел | селектор | коробка | сторона | источник | непрозр. | контраст | Δ | ×N | вырезка |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const i of r.items) L.push(`| ${i.id} | ${i.kindRu}${i.glyphs ? ' (картинкой)' : ''} | ${md(i.section)} | \`${md(i.selector)}\` | ${i.box ? `${i.box.w}×${i.box.h} px, ${i.share}% окна` : '—'} | ${i.side}${i.onMargin && i.kind === 'drawing' ? ', на поле' : ''} | ${md(i.sourceText)} | ${i.opacity ?? '—'} | ${i.contrast ?? '—'} | ${i.delta ?? '—'} | ${i.count} | ${i.crop ? `[${path.basename(i.crop)}](${i.crop})` : '—'} |`);
      L.push('');
    } else L.push('Находок нет.', '');
    L.push(`Итог на 10 000 px: ${KIND_ORDER.map((k) => `${KINDS[k].many} — ${r.byKind[k].count}${r.byKind[k].count ? ` (${r.byKind[k].per10k})` : ''}`).join('; ')}.`, '');
    if (r.textures.length) L.push(`Фактура — см. texture.mjs: ${r.textures.map((t) => `\`${md(t.src)}\`${t.count > 1 ? ` ×${t.count}` : ''} — ${t.why}`).join('; ')}.`, '');
    if (r.skipped.length) { L.push('Не засчитано:', ''); for (const s of r.skipped.slice(0, 24)) L.push(`- \`${md(s.selector)}\` — ${md(s.why)}${s.crop ? ` ([${path.basename(s.crop)}](${s.crop}))` : ''}`); if (r.skipped.length > 24) L.push(`- … ещё ${r.skipped.length - 24}`); L.push(''); }
    for (const w of r.warnings) L.push(`- WARN: ${md(w)}`);
    if (r.warnings.length) L.push('');
  }
  for (const [vp, s] of Object.entries(doc.summary)) {
    L.push(`## Приёмы фона образца — ${vp}`, '');
    if (!s.techniques.length) L.push('- в фоне ничего не найдено — фон ровный');
    for (const t of s.techniques) L.push(`- ${md(t.text)}`);
    if (s.textures) L.push('- фактура — см. texture.mjs');
    const kinds = s.techniques.map((t) => t.kind);
    if (kinds.length) { L.push('', 'Чем воспроизвести у себя (файлы донора не копировать — рисунки, слова и предметы свои):', ''); for (const k of kinds) L.push(`- ${KINDS[k].many}: ${RECIPES[k]}`); }
    L.push('');
  }
  return L.join('\n');
}
function compareMarkdown(c, donor, ours, decFile) {
  const L = ['# Сверка фона: донор → наш сайт', '', `Донор: ${donor.url} · наш: ${ours.url} · вердикт **${c.verdict}**`, ''];
  for (const v of c.viewports) {
    L.push(`## ${v.viewport}`, '');
    if (v.missing) { L.push('У нас нет замера на этом экране.', ''); continue; }
    L.push(`Страниц: донор ${v.pages.donor} (${v.docH.donor} px), наш ${v.pages.ours} (${v.docH.ours} px).`, '', '| вид | у донора | у нас | статус | решение |', '|---|---|---|---|---|');
    for (const r of v.rows) L.push(`| ${KINDS[r.kind].many} | ${r.donor.count} (${r.donor.per10k} на 10 000 px) | ${r.ours.count} (${r.ours.per10k}) | ${r.status}${r.note ? ` — ${r.note}` : ''} | ${r.decision ? `${md(r.decision)} (\`${r.key}\`)` : r.level === 'WARN' ? '**нет**' : '—'} |`);
    if (!v.rows.length) L.push('| — | в фоне донора ничего нет | — | — | — |');
    L.push('', `Своё (у донора нет): ${v.extra.length ? v.extra.map((e) => `${KINDS[e.kind].many} ${e.count}`).join(', ') + ' — проверить, что это задумано' : 'нет'}.`, '');
  }
  L.push(`Решения «почему нет или чем заменено» — \`${decFile}\`: { "ghost-word": "причина", "pattern:mobile": "причина" }; ключ — вид или вид:экран.`, 'Чем воспроизвести:', '', ...KIND_ORDER.map((k) => `- ${KINDS[k].many}: ${RECIPES[k]}`), '');
  return L.join('\n');
}

/* ======================================================================
   8. Прогон: страницы × экраны одним браузером
   ====================================================================== */
const pageName = (u) => { try { const x = new URL(u); if (x.protocol === 'file:') return decodeURIComponent(x.pathname.split('/').pop() || 'page').replace(/\.[a-z0-9]+$/i, '').replace(/[^\p{L}\d_-]+/gu, '-') || 'page'; } catch { /* не адрес */ } return pageSlug(u); };
async function runSet(urls, vps, { out, tag, crops, log }) {
  const cropDir = crops ? ensureDir(path.join(out, 'decor', tag)) : null;
  /* вырезки прошлого прогона с этим именем — убрать: иначе рядом с новыми b01… остались бы старые b09… */
  const sweep = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) sweep(p); else if (/^(b|x)\d+\.png$|^_[ct]\d+\.png$/.test(f.name)) fs.rmSync(p, { force: true }); } };
  if (cropDir) sweep(cropDir);
  const results = []; let fatal = null;
  let browser;
  try { browser = await launch(); } catch (e) { return { results, fatal: `браузер не запустился: ${e.message}` }; }
  try {
    for (const [vpName, vp] of vps) for (const u of urls) {
      log(`… ${vpName}: открываю ${u}`);
      let r;
      /* несколько страниц или экранов — вырезки по подпапкам <tag>/<экран>[-<страница>]/, иначе номера b01… совпали бы */
      const sub = urls.length > 1 || vps.length > 1 ? `${vpName}${urls.length > 1 ? `-${pageName(u)}` : ''}` : null;
      try { r = await measurePage(browser, u, vpName, vp, { cropDir: cropDir && sub ? ensureDir(path.join(cropDir, sub)) : cropDir, cropBase: out, log }); }
      catch (e) { fatal = `${vpName}: страница ${u} не открылась или упала — ${String((e && e.message) || e).slice(0, 200)}`; break; }
      const lw = takeWarnings(); const notes = takeNotes();
      for (const w of lw) if (!r.warnings.includes(w)) r.warnings.push(w);
      if (notes.length) r.open.notes = notes;
      printPage(r, log);
      results.push(r);
    }
  } finally { await browser.close().catch(() => {}); }
  return { results, fatal };
}
const docOf = (url, tag, pages, vps, results) => {
  const summary = summarize(results);
  const warn = results.flatMap((r) => r.warnings.map((w) => `${r.viewport}${pages.length > 1 ? ` ${r.page}` : ''}: ${w}`));
  return { kind: 'bgdecor', version: 1, url, tag, takenAt: new Date().toISOString(), pages, viewports: vps.map(([n]) => n), verdict: warn.length ? 'WARN' : 'OK', reasons: { warn }, summary, recipes: RECIPES, results };
};

/* ======================================================================
   9. selftest: сверка и флаги без браузера; стенд fixtures/bgdecor — в браузере
   ====================================================================== */
async function selftest(opt = {}) {
  const os = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const FIX = path.join(HERE, 'fixtures', 'bgdecor');
  let n = 0, bad = 0;
  const say = (ok, msg) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bgdecor-selftest-'));
  const node = (args, env = {}) => spawnSync(process.execPath, [SELF, ...args], { encoding: 'utf8', timeout: 300000, windowsHide: true, env: { ...process.env, ...env } });
  const fake = (url, counts, docH = 10000, vp = 'desktop') => ({ kind: 'bgdecor', url, results: [{ url, viewport: vp, docH, items: [], textures: [], byKind: Object.fromEntries(KIND_ORDER.map((k) => [k, { count: counts[k] || 0, groups: counts[k] ? 1 : 0, per10k: per10k(counts[k] || 0, docH) }])) }] });

  /* 1. пиксели: рисунок на ровном фоне, слово из знаков, закрытое содержимым */
  {
    const W = 200, H = 80; const mk = (fill) => { const b = Buffer.alloc(W * H * 4); for (let p = 0; p < W * H; p++) { b[p * 4] = fill[0]; b[p * 4 + 1] = fill[1]; b[p * 4 + 2] = fill[2]; b[p * 4 + 3] = fill[3] ?? 255; } return b; };
    const B = mk([48, 48, 48]); const A = Buffer.from(B); const S = mk([0, 0, 0, 0]);
    const rect = (x, y, w, h, col) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const o = (yy * W + xx) * 4; A[o] = col[0]; A[o + 1] = col[1]; A[o + 2] = col[2]; S[o] = col[0]; S[o + 1] = col[1]; S[o + 2] = col[2]; S[o + 3] = 255; } };
    [[8, 20], [36, 26], [70, 18], [96, 30], [134, 22], [164, 26]].forEach(([x, w], i) => rect(x, 10 + (i % 2) * 6, w, 56 - (i % 3) * 4, [40, 40, 40]));
    const px = pixelStats(A, B, S, W, H, { lines: [[0, 30, 200, 12]] });
    say(px.glyphs.row && !px.glyphs.same && px.glyphs.n === 6 && px.contrast.p90 <= 1.2 && px.delta === 8 && px.visShare === 1 && px.underText > 0.1, `pixelStats: шесть разных знаков в ряд — «ряд знаков» (${px.glyphs.n}), контраст ${px.contrast.p90}, Δ ${px.delta}, под текстом ${px.underText}`);
    const px2 = pixelStats(B, B, S, W, H);
    say(px2.visPx === 0 && px2.maskPx > 0, `pixelStats: украшение есть, а снимки «с» и «без» одинаковы — видно ${px2.visPx} px (закрыто содержимым)`);
    const S3 = mk([0, 0, 0, 0]); const A3 = Buffer.from(B);
    for (let i = 0; i < 5; i++) for (let yy = 20; yy < 60; yy++) for (let xx = 10 + i * 38; xx < 30 + i * 38; xx++) { const o = (yy * W + xx) * 4; A3[o] = A3[o + 1] = A3[o + 2] = 40; S3[o + 3] = 255; }
    const px3 = pixelStats(A3, B, S3, W, H);
    say(px3.glyphs.same && px3.glyphs.n === 5, `pixelStats: пять одинаковых значков в ряд — бордюр, не слово (одинаковые: ${px3.glyphs.same})`);
  }
  /* 2. вид по замеру: пороги бледности, поле, слово */
  {
    const page = { vw: 1440, column: { left: 130, right: 1310 } };
    const m = (over) => ({ loc: { vw: 1440, clip: { x: over.x ?? 600, y: 100 }, band: over.band === undefined ? { left: 130, right: 1310, n: 3 } : over.band, opacity: over.opacity ?? 1 }, px: { maskPx: 5000, visPx: 4000, visShare: 0.8, bbox: { x: 0, y: 0, w: over.w ?? 200, h: over.h ?? 200 }, fill: over.fill ?? 0.3, contrast: { p50: 1.1, p90: over.con ?? 1.2 }, delta: over.delta ?? 14, underText: over.under ?? 0, glyphs: over.glyphs || { n: 1, row: false, same: false, h: 200 }, maskFrom: 'украшение отдельно', noise: 0 } });
    const img = { src: 'img', source: {} }; const word = { src: 'text', text: 'СЕМЕНА', source: { fs: 250 } };
    const a = classify(img, m({}), page), b = classify(img, m({ con: 1.9, delta: 53, opacity: 0.42 }), page), c = classify(img, m({ con: 1.96, delta: 114, x: 1288, w: 88, h: 150 }), page);
    const d = classify(img, m({ con: 1.9, delta: 180 }), page), e = classify(word, m({ con: 7.6, delta: 183, w: 1440 }), page), f = classify(word, m({ con: 1.25, delta: 20, w: 1200, under: 0.2 }), page);
    const g = classify(img, m({ con: 1.07, delta: 5, w: 1003, h: 206, glyphs: { n: 9, row: true, same: false, h: 190 } }), page), h = classify(img, m({ fill: 0.99, con: 5, delta: 120 }), page);
    say(a.kind === 'drawing' && b.kind === 'drawing' && c.kind === 'margin-object' && c.side === 'справа' && d.code === 'bright-in-column' && e.code === 'loud-word' && f.kind === 'ghost-word' && f.side === 'за текстом' && g.kind === 'ghost-word' && h.code === 'solid',
      `classify: бледный по контрасту и по непрозрачности — рисунок; золотой орнамент у края (контраст 1.96, Δ 114) — предмет на полях ${c.side}; яркое в колонке — не фон; «СЕМЕНА» с контрастом 7.6 — не призрак; бледное слово — призрак ${f.side}; бледный ряд знаков — призрак; сплошное — фото`);
    const local = classify(img, m({ con: 3, delta: 150, x: 1288, w: 88, h: 150, band: { left: 64, right: 966, n: 2 } }), { vw: 1440, column: { left: 64, right: 1380 } });
    say(local.kind === 'margin-object', `classify: поле — по содержимому на той же высоте (текст до 966 px, орнамент на 1288 px), а не по колонке всей страницы — ${local.kind || local.code}`);
  }
  /* 3. сверка с донором и решения */
  {
    const donor = fake('https://donor/', { drawing: 5, 'ghost-word': 2, 'margin-object': 4 }, 3000);
    const ours = fake('http://s/', { drawing: 3, 'margin-object': 1, pattern: 2 }, 11000);
    const c1 = compareDecor(donor, ours);
    const row = (c, k) => c.viewports[0].rows.find((r) => r.kind === k);
    say(c1.verdict === 'WARN' && row(c1, 'ghost-word').status === 'НЕТ' && row(c1, 'margin-object').status === 'РЕЖЕ' && row(c1, 'drawing').status === 'РЕЖЕ' && c1.viewports[0].extra[0].kind === 'pattern' && c1.warn.length === 3,
      `compare: призраков у нас нет — НЕТ; рисунков и предметов меньше и реже — РЕЖЕ; узор — своё; без решений WARN ×${c1.warn.length}`);
    const df = path.join(tmp, 'decor-decisions.json');
    fs.writeFileSync(df, JSON.stringify({ _зачем: 'комментарий', 'ghost-word': 'слово раздела стоит в заголовке', drawing: 'страница втрое длиннее, наброски только у заголовков разделов', 'margin-object:desktop': 'предметы — у первого экрана', 'oops': 'нет такого вида', pattern: '' }));
    const dec = loadDecisions(df);
    const c2 = compareDecor(donor, ours, dec);
    say(dec.exists && Object.keys(dec.map).length === 3 && dec.bad.length === 2 && c2.verdict === 'OK' && row(c2, 'margin-object').key === 'margin-object:desktop' && row(c2, 'ghost-word').level === 'OK',
      `решения: ключ вид и вид:экран закрывают НЕТ и РЕЖЕ — вердикт ${c2.verdict}; комментарий «_» пропущен, неверных ключей ${dec.bad.length} (названы)`);
    const same = compareDecor(fake('https://donor/', { 'ghost-word': 1 }, 3000), fake('http://s/', { 'ghost-word': 1 }, 11000));
    const noVp = compareDecor({ results: [...donor.results, ...fake('https://donor/', { drawing: 1 }, 3000, 'mobile').results] }, ours);
    say(same.verdict === 'OK' && same.viewports[0].rows[0].status === 'ЕСТЬ' && noVp.verdict === 'WARN' && noVp.warn.some((w) => /нет замера на экране mobile/.test(w)),
      `compare: штук не меньше, страница длиннее — ЕСТЬ (не «реже»); у нас нет экрана донора — WARN «${(noVp.warn.find((w) => /mobile/.test(w)) || '').slice(0, 50)}»`);
  }
  /* 4. флаги */
  {
    const h = node(['--help']);
    say(h.status === 0 && ['--pages', '--viewport', '--out', '--tag', '--no-crops', '--json', '--md', '--decisions', '--no-browser', 'compare', 'selftest'].every((f) => h.stdout.includes(f)), '--help: код 0, названы все флаги и команды');
    const a = node(['http://localhost:9/', '--viewpor', 'mobile']), b = node(['http://localhost:9/', '--tag', 'до/после']), c = node(['compare', path.join(tmp, 'нет.json'), 'http://localhost:9/']), d = node(['не-адрес']), e = node(['http://localhost:9/', '--viewport', 'экран']);
    say(a.status === 1 && /может быть, --viewport/.test(a.stderr) && b.status === 2 && /--tag/.test(b.stderr) && c.status === 2 && /протокол донора/.test(c.stderr) && d.status === 2 && e.status === 2,
      `флаги: опечатка — код 1 с подсказкой; --tag с «/», compare без файла донора, не адрес, неизвестный экран — код 2 (${c.stderr.trim().slice(0, 60)}…)`);
  }

  /* 5. стенд в браузере */
  if (!opt['no-browser']) {
    const url = (f) => pathToFileURL(path.join(FIX, f)).href;
    const run = path.join(tmp, 'run');
    /* что ждёт стенд: data-expect у носителя, data-expect-not — здесь находок быть не должно */
    const expectInPage = () => [...document.querySelectorAll('[data-expect], [data-expect-not]')].map((el) => ({ host: el.getAttribute('data-rw-bgd') || (el.querySelector('[data-rw-bgd]') || { getAttribute: () => null }).getAttribute('data-rw-bgd'), hosts: [el, ...el.querySelectorAll('[data-rw-bgd]')].map((x) => x.getAttribute('data-rw-bgd')).filter(Boolean), name: el.getAttribute('data-name') || el.id || el.className, kind: el.getAttribute('data-expect'), not: el.hasAttribute('data-expect-not'), pseudo: el.getAttribute('data-expect-pseudo'), side: el.getAttribute('data-expect-side'), count: Number(el.getAttribute('data-expect-count')) || null, section: el.getAttribute('data-expect-section'), why: el.getAttribute('data-expect-why') }));
    let browser = null;
    try {
      browser = await launch();
      for (const vpName of ['desktop', 'mobile']) {
        const [[, vp]] = pickViewports(vpName);
        const page = await preparePage(browser, vp, {});
        await gotoRetry(page, url('index.html'), { timeout: 60000 }); await forceInstantScroll(page); await scrollThrough(page, { pause: 150 }); await sleep(300);
        await evaluateWith(page, collectInPage, null, DEPS);
        const exp = await page.evaluate(expectInPage); await page.close();
        const cropDir = vpName === 'desktop' ? ensureDir(path.join(run, 'decor', 'stand')) : null;
        const r = await measurePage(browser, url('index.html'), vpName, vp, { cropDir, cropBase: run });
        const members = r.items.flatMap((i) => i.members.map((m) => ({ ...m, item: i })));
        const want = exp.filter((e) => e.kind && (vpName === 'desktop' || e.kind !== 'margin-object'));
        for (const e of want) {
          const hit = members.find((m) => e.hosts.includes(m.host) && m.item.kind === e.kind && (!e.pseudo || m.pseudo === e.pseudo));
          const i = hit && hit.item;
          const okSide = !e.side || vpName !== 'desktop' || (hit && hit.side === e.side); const okCount = !e.count || (i && i.count === e.count); const okSec = !e.section || (i && i.section === e.section);
          const other = hit ? null : members.find((m) => e.hosts.includes(m.host)); const lost = hit || other ? null : r.skipped.find((s) => e.hosts.includes(s.host));
          say(!!hit && okSide && okCount && okSec, `стенд ${vpName}: ${e.name} — ${e.kind}${hit ? ` (${i.id}, ${hit.side}${i.count > 1 ? `, ×${i.count}` : ''}, «${i.section}», контраст ${i.contrast}, Δ ${i.delta})` : ` — НЕ НАЙДЕНО${other ? `: записано как ${other.item.kind}` : lost ? `: в «не засчитано» — ${lost.why}` : ': не стало кандидатом'}`}${hit && !okSide ? ` — сторона «${hit.side}», ждали «${e.side}»` : ''}${hit && !okCount ? ` — ×${i.count}, ждали ×${e.count}` : ''}${hit && !okSec ? ` — раздел «${i.section}», ждали «${e.section}»` : ''}`);
        }
        const nots = exp.filter((e) => e.not);
        const wrong = nots.filter((e) => members.some((m) => e.hosts.includes(m.host)));
        say(!wrong.length, `стенд ${vpName}: «нельзя» (${nots.map((e) => e.name).join(', ')}) — в находках ${wrong.length ? wrong.map((e) => e.name).join(', ') : 'ничего'}`);
        if (vpName === 'desktop') {
          const known = new Set(want.flatMap((e) => e.hosts));
          const stray = members.filter((m) => !known.has(m.host));
          say(!stray.length, `стенд desktop: лишних находок нет (${stray.length ? stray.map((m) => `${m.item.kind} ${m.selector}`).join('; ') : `находок ${members.length}, все ожидаемые`})`);
          const whys = nots.filter((e) => e.why);
          const whyBad = whys.filter((e) => !r.skipped.some((s) => e.hosts.includes(s.host) && s.code === e.why));
          say(!whyBad.length, `стенд desktop: причина отказа названа — ${whys.map((e) => `${e.name}: ${(r.skipped.find((s) => e.hosts.includes(s.host)) || {}).code || '—'}`).join(', ')}`);
          say(r.textures.length >= 2 && r.textures.some((t) => /крупная плитка/.test(t.why)) && r.textures.some((t) => /имя файла/.test(t.why)), `стенд desktop: фактура не узор — ${r.textures.map((t) => `${t.src}: ${t.why}`).join('; ').slice(0, 150)}`);
          const crops = r.items.filter((i) => i.crop && fs.existsSync(path.join(run, i.crop)));
          say(crops.length === r.items.length && r.items.every((i) => /^decor\/stand\/b\d\d\.png$/.test(i.crop)), `стенд desktop: вырезка у каждой строки (${crops.length} из ${r.items.length}), путь от папки прогона (${(r.items[0] || {}).crop})`);
          say(r.column.left >= 180 && r.column.left <= 260 && r.column.right >= 1180 && r.column.right <= 1260 && r.byKind['margin-object'].per10k > 0, `стенд desktop: колонка содержимого ${r.column.left}–${r.column.right} px (вёрстка 220–1220), предметов на полях ${r.byKind['margin-object'].per10k} на 10 000 px`);
        }
      }
    } catch (e) { say(false, `стенд в браузере: ${String((e && e.message) || e).slice(0, 300)}`); }
    finally { if (browser) await browser.close().catch(() => {}); }

    /* командная строка — после своего браузера (один браузер за раз) */
    const a = node([url('index.html'), '--out', run, '--tag', 'donor', '--pages', 'index.html,ours.html']);
    const dj = readJson(path.join(run, 'decor', 'donor.json')) || {};
    const has = (f) => fs.existsSync(path.join(run, 'decor', f));
    say(a.status === 0 && has('donor.json') && has('donor.md') && (dj.results || []).length === 2 && dj.kind === 'bgdecor' && !!dj.generator && dj.summary.desktop.pages === 2 && /приёмы фона образца/.test(a.stdout) && /фактура — см\. texture\.mjs/.test(a.stdout) && /svg3d\.mjs rough/.test(a.stdout),
      `--pages: две страницы — один протокол (results ${(dj.results || []).length}, generator ${dj.generator ? 'есть' : 'нет'}), donor.md, строки «приёмы фона образца», «фактура — см. texture.mjs» и рецепт (${a.status === 0 ? 'код 0' : a.stderr.trim().slice(0, 120)})`);
    const b = node([url('index.html'), '--out', run, '--tag', 'nc', '--no-crops', '--json', '-']);
    let bj = null; try { bj = JSON.parse(b.stdout); } catch { /* не JSON */ }
    say(b.status === 0 && bj && bj.results[0].items.length > 0 && bj.results[0].items.every((i) => i.crop === null) && !has('nc') && !has('nc.json'), `--no-crops и --json -: JSON в stdout (строк ${bj ? bj.results[0].items.length : '—'}), вырезок и файла протокола нет`);
    const one = node([url('index.html'), '--out', run, '--tag', 'd1']);
    const c = node(['compare', path.join(run, 'decor', 'd1.json'), url('ours.html'), '--out', run]);
    const cj = readJson(path.join(run, 'decor', 'compare.json')) || {};
    const lost = ((cj.viewports || [])[0] || { rows: [] }).rows.filter((r) => r.level === 'WARN').map((r) => r.kind);
    say(one.status === 0 && c.status === 0 && cj.verdict === 'WARN' && lost.includes('ghost-word') && lost.includes('pattern') && has('compare.md') && /^WARN: сверка фона/m.test(c.stdout), `compare: стенд-донор против страницы без призраков и узора — WARN, потеряно: ${lost.join(', ')}`);
    fs.writeFileSync(path.join(run, 'decor-decisions.json'), JSON.stringify(Object.fromEntries(lost.map((k) => [k, 'проверка selftest: приём сознательно не взят']))));
    const d = node(['compare', path.join(run, 'decor', 'd1.json'), path.join(run, 'decor', 'file-bgdecor-ours-html.json'), '--out', run, '--tag', 'compare-2']);
    const cj2 = readJson(path.join(run, 'decor', 'compare-2.json')) || {};
    say(d.status === 0 && cj2.verdict === 'OK' && /^OK: сверка фона/m.test(d.stdout), `compare по двум протоколам с decor-decisions.json — ${cj2.verdict} (${d.status === 0 ? 'код 0' : d.stderr.trim().slice(0, 120)})`);
  } else console.log('--    стенд в браузере пропущен (--no-browser)');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${bad ? 'FAIL' : 'OK'}: проверок ${n}, провалов ${bad}`);
  return bad ? 1 : 0;
}

/* ======================================================================
   10. Командная строка
   ====================================================================== */
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(SELF); } catch { return false; } })();
if (isMain) {
  const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['no-crops', 'no-browser', 'help', 'h'], values: ['pages', 'viewport', 'viewports', 'out', 'tag', 'md', 'decisions'], optional: ['json'], commands: ['compare', 'selftest'], strict: true });
  collectWarnings(); collectNotes();
  const die = (msg, code = 2) => { console.error(`FAIL  ${msg}`); process.exit(code); };
  if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
  const cmd = pos[0];
  if (cmd === 'selftest') process.exit(await selftest(opt));
  if (!pos.length) { console.log(HELP); process.exit(2); }
  for (const k of ['pages', 'viewport', 'viewports', 'out', 'tag', 'md', 'decisions']) if (opt[k] === true || (typeof opt[k] === 'string' && (!opt[k].trim() || /^--[a-z]/.test(opt[k])))) die(`--${k}: нужно значение (подробно: --help)`);
  if (opt.viewport !== undefined && opt.viewports !== undefined && String(opt.viewport).trim() !== String(opt.viewports).trim()) die(`заданы и --viewport ${opt.viewport}, и --viewports ${opt.viewports} — это один флаг, оставьте один`);
  const vpSpec = opt.viewport ?? opt.viewports ?? null;
  if (vpSpec) { const wrong = String(vpSpec).split(',').map((x) => x.trim()).filter((x) => x && !parseViewport(x)); if (wrong.length) die(`неизвестные экраны: ${wrong.join(', ')} — есть desktop, laptop, tablet, mobile, mobile-s, android или ШxВ@плотность (320x568@2)`); }
  if (opt.tag !== undefined && !/^[\p{L}\d_.-]{1,60}$/u.test(String(opt.tag))) die('--tag: имя из букв, цифр, «-», «_», «.» (до 60 знаков), например donor или site-r2');
  const isUrl = (s) => /^(https?|file):/i.test(String(s));
  const toStdout = opt.json === '-';
  const log = toStdout ? (...a) => console.error(...a) : (...a) => console.log(...a);
  const uniqVps = (spec) => { const seen = new Set(); return pickViewports(spec).filter(([n2]) => !seen.has(n2) && seen.add(n2)); };
  const save = (out, tag, doc) => {
    const jf = opt.json && opt.json !== true && !toStdout ? path.resolve(String(opt.json)) : path.join(out, 'decor', `${tag}.json`);
    const mf = opt.md ? path.resolve(String(opt.md)) : path.join(out, 'decor', `${tag}.md`);
    if (toStdout) { process.stdout.write(JSON.stringify(doc, null, 1) + '\n'); return { jf: null, mf: null }; }
    writeJson(jf, doc); ensureDir(path.dirname(mf)); fs.writeFileSync(mf, decorMarkdown(doc));
    return { jf, mf };
  };

  if (cmd === 'compare') {
    if (pos.length !== 3) die('нужно: node bgdecor.mjs compare <донор.json> <url | наш.json> [--decisions файл] [--out папка] (подробно: --help)');
    const donorFile = path.resolve(String(pos[1]));
    const donor = fs.existsSync(donorFile) ? readJson(donorFile) : null;
    if (!donor || donor.kind !== 'bgdecor' || !Array.isArray(donor.results)) die(`не читается протокол донора ${donorFile}: нужен json от «node bgdecor.mjs <адрес донора>»`);
    const ourArg = String(pos[2]); let ours; let out;
    const names = vpSpec ? uniqVps(vpSpec).map(([n2]) => n2) : [...new Set(donor.results.map((r) => r.viewport))];
    if (isUrl(ourArg)) {
      out = runDir(opt, ourArg);
      const tag = slugFromUrl(ourArg).slice(0, 40);
      const set = await runSet([ourArg], uniqVps(names.join(',')), { out, tag, crops: !opt['no-crops'], log });
      if (set.fatal) die(set.fatal, 3);
      ours = docOf(ourArg, tag, [ourArg], uniqVps(names.join(',')), set.results);
      writeJson(path.join(out, 'decor', `${tag}.json`), ours); fs.writeFileSync(path.join(out, 'decor', `${tag}.md`), decorMarkdown(ours));
      log(`наш протокол: ${path.join(out, 'decor', `${tag}.json`)}`);
    } else {
      const f = path.resolve(ourArg);
      ours = fs.existsSync(f) ? readJson(f) : null;
      if (!ours || ours.kind !== 'bgdecor' || !Array.isArray(ours.results)) die(`не читается наш протокол ${f}: нужен адрес страницы (http://, https://, file://) или json от bgdecor.mjs`);
      out = opt.out ? path.resolve(String(opt.out)) : path.dirname(path.dirname(f));
    }
    const decFile = path.resolve(String(opt.decisions || path.join(out, 'decor-decisions.json')));
    if (opt.decisions && !fs.existsSync(decFile)) die(`нет файла решений ${decFile}`);
    const dec = loadDecisions(decFile);
    for (const x of dec.bad) console.error(`WARN  ${decFile}: ${x}`);
    const c = compareDecor(donor, ours, dec, { viewports: names });
    /* наш снимок снят с предупреждениями (окно при замере, не всё измерено) — сверка не лучше WARN */
    const ourWarn = ((ours.reasons && ours.reasons.warn) || []).filter((w) => names.some((v) => w.startsWith(v)));
    if (ourWarn.length) { c.verdict = 'WARN'; c.warn.push(`наш замер — с предупреждениями (${ourWarn.length}): ${cut(ourWarn[0], 160)}`); }
    const tag = opt.tag ? String(opt.tag) : 'compare';
    log('\n== сверка фона: донор → наш сайт');
    for (const v of c.viewports) {
      if (v.missing) { log(`WARN ${v.viewport}: у нас нет замера на этом экране`); continue; }
      for (const r of v.rows) log(`${r.level.padEnd(4)} ${v.viewport} ${KINDS[r.kind].many}: у донора ${r.donor.count} (${r.donor.per10k} на 10 000 px) → у нас ${r.ours.count} (${r.ours.per10k}) — ${r.status}${r.note ? `, ${r.note}` : ''}${r.decision ? ` — решение (${r.key}): ${r.decision}` : r.level === 'WARN' ? ` — решения нет: "${r.kind}" в decor-decisions.json; чем сделать — ${RECIPES[r.kind]}` : ''}`);
      if (!v.rows.length) log(`OK   ${v.viewport}: в фоне донора ничего нет — терять нечего`);
      log(`своё (у донора нет) ${v.viewport}: ${v.extra.length ? v.extra.map((e) => `${KINDS[e.kind].many} ${e.count}`).join(', ') + ' — проверить, что это задумано' : 'нет'}`);
    }
    for (const w of c.warn.filter((x) => /замер/.test(x))) log(`WARN ${w}`);
    const proto = { kind: 'bgdecor-compare', version: 1, url: ours.url, donor: donor.url, takenAt: new Date().toISOString(), verdict: c.verdict, reasons: { warn: c.warn }, decisionsFile: dec.exists ? decFile : null, viewports: c.viewports,
      steps: c.viewports.flatMap((v) => v.rows.map((r) => ({ status: r.level, what: `${v.viewport} ${r.kind}`, ...(r.key ? { decisionKey: r.key } : {}), details: `у донора ${r.donor.count} (${r.donor.per10k} на 10 000 px), у нас ${r.ours.count} (${r.ours.per10k}) — ${r.status}${r.decision ? `; ${r.decision}` : ''}` }))) };
    const jf = path.join(out, 'decor', `${tag}.json`), mf = path.join(out, 'decor', `${tag}.md`);
    if (toStdout) process.stdout.write(JSON.stringify(proto, null, 1) + '\n');
    else { writeJson(jf, proto); fs.writeFileSync(mf, compareMarkdown(c, donor, ours, decFile)); }
    log(`\n${c.verdict}: сверка фона — ${c.warn.length ? `без решения или с оговорками: ${c.warn.length}` : 'потерь нет'}${toStdout ? '' : ` · ${mf}`}`);
    process.exit(0);
  }

  const url = String(pos[0]);
  if (pos.length > 1) die(`лишние слова: ${pos.slice(1).join(' ')} — страницы от адреса задаются --pages "/,/menu"`);
  if (!isUrl(url)) die(`нужен адрес страницы (http://, https:// или file://), получено: ${url}`);
  let urls;
  try { urls = opt.pages ? [...new Set(pagesFrom(opt.pages, url))] : [url]; } catch (e) { die(`--pages: ${String((e && e.message) || e).slice(0, 120)}`); }
  const vps = uniqVps(vpSpec || 'desktop');
  if (!vps.length) die('пустой список экранов');
  const out = runDir(opt, url);
  const tag = opt.tag ? String(opt.tag) : slugFromUrl(url).slice(0, 40);
  const set = await runSet(urls, vps, { out, tag, crops: !opt['no-crops'], log });
  if (set.fatal) die(set.fatal, 3);
  const doc = docOf(url, tag, urls, vps, set.results);
  printSummary(doc.summary, log);
  const { jf, mf } = save(out, tag, doc);
  const total = (k) => Object.values(doc.summary).reduce((a, s) => Math.max(a, s.byKind[k].count), 0);
  log(`\n${doc.verdict.padEnd(4)} фон ${tag}: ${Object.entries(doc.summary).map(([vp, s]) => `${vp} — ${KIND_ORDER.filter((k) => s.byKind[k].count).map((k) => `${KINDS[k].many} ${s.byKind[k].count}`).join(', ') || 'находок нет'}`).join('; ')}${doc.reasons.warn.length ? ` · предупреждений ${doc.reasons.warn.length}` : ''}${mf ? ` · ${mf}` : ''}`);
  if (jf) log(`json: ${jf}`);
  if (!KIND_ORDER.some((k) => total(k)) && !toStdout) log('в фоне ничего не найдено: если глазами украшения есть — смотреть «не засчитано» и вырезки x01.png …');
  process.exit(0);
}
