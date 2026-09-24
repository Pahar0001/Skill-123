#!/usr/bin/env node
/**
 * cliche.mjs — шаблонность страницы числами и сравнение с донором.
 *
 * Ищет приёмы, которые модель ставит «по умолчанию» (форма-набор с подписями
 * капсом и пилюлей, надзаголовок, шаги 01/02/03, плюс в кружке, зебра секций,
 * огромное слово в подвале, акцент там, где у донора его нет, своя «похожая»
 * гарнитура вместо гарнитуры донора…), и для каждого печатает: правило, сколько
 * раз, долю страницы, селекторы и пометку относительно донора:
 *   есть у донора       — это язык донора, шаблоном не считается;
 *   НЕТ У ДОНОРА        — у донора этого приёма нет: нужна причина или переделка;
 *   размножено ×N       — приём донора, но чаще, чем у донора, больше чем вдвое;
 *   ЗАПРЕЩЁН            — пользователь отверг этот приём (журнал вкуса, --taste);
 *   ВОПРОС              — запрет пользователя спорит с явной чертой нового донора:
 *                         спросить пользователя, а не блокировать молча.
 *
 *   node cliche.mjs <url> [--baseline <json>] [--taste [папка]] [--viewport desktop,mobile]
 *                         [--run <папка прогона>] [--decisions <json>] [--shot] [--json <файл>|-]
 *   node cliche.mjs baseline <url донора> [--out <файл.json|папка>] [--viewport desktop,mobile]
 *   node cliche.mjs rules [--json]
 *   node cliche.mjs --help
 *
 * Флаги:
 *   --baseline <json>  база: файл `cliche.mjs baseline` донора (или результат прогона сайта «до»).
 *                      Без базы — только список черт страницы, вердикт по запретам и весу 3.
 *   --taste [папка]    запреты пользователя из журнала вкуса (taste.mjs); без папки —
 *                      SITE_REWORK_TASTE или ~/.claude/site-rework/taste.
 *   --viewport <list>  экраны через запятую (пресеты lib.mjs или ШxВ@плотность). По умолчанию —
 *                      экраны из базы, без базы — desktop (в режиме baseline — desktop,mobile).
 *                      Сравнивать можно только одинаковые экраны. --viewports — то же самое (как в
 *                      discover, a11y, perf): оба сразу с разными списками — ошибка; повтор экрана
 *                      в списке снимается один раз. Флаг без списка или неизвестный экран — код 2.
 *   --run <папка>      папка прогона (синоним --out): там ищется authorship-decisions.json, туда
 *                      пишутся cliche/cliche.json и снимки. По умолчанию — папка, найденная от файла
 *                      базы вверх (до 3 уровней), где лежит state.json или authorship-decisions.json;
 *                      иначе runDir (lib.mjs): ~/.claude/site-rework/runs/<адрес>.
 *   --decisions <json> файл обоснований, если он не в папке прогона.
 *   --shot             снимок страницы с обводкой того, что пошло в счёт: <run>/cliche/cliche-<экран>.png
 *   --json <файл>|-    куда записать итог (по умолчанию <run>/cliche/cliche.json); «-» — JSON в
 *                      stdout вместо текста.
 *   --out              в режиме baseline: файл .json или папка (там cliche-baseline.json).
 *   --strict           принимается для единообразия с другими скриптами: FAIL и так даёт код 1.
 *   --help, -h, --h    эта справка.
 *
 * Как сравнивается (исправление по аудиту A12):
 *   декоративные приёмы (режим length: надзаголовок, двоеточие в заголовках, бегущая строка,
 *     мелкий капс с разрядкой, мелкий текст, градиентный текст, курсив-акцент) — частота на
 *     10 000 px высоты страницы; «размножено», если здесь их больше, чем у донора, и частота
 *     выше донорской больше чем в 2 раза;
 *   функциональные (режим share: пилюли среди кнопок, одно скругление среди коробок) — доля
 *     внутри своего класса, а не частота: у витрины кнопок просто больше;
 *   остальные (режим role: форма-набор, 01/02/03, карточки по типу…) — есть приём у донора
 *     или нет; роль зашита в правило (фото-карточки ≠ карточки с иконками);
 *   base — только с базой: гарнитуры, которых у донора нет (font-swapped); акцент
 *     сравнивается по оттенку (accent-added).
 *
 * Вердикт экрана:
 *   FAIL — есть ЗАПРЕЩЁН; правило веса 3 «НЕТ У ДОНОРА» без записи в authorship-decisions.json;
 *          «размножено» больше ×2 у правила веса 2–3 (обоснование этого не снимает — снизить частоту);
 *   WARN — «НЕТ У ДОНОРА» веса 1–2 без записи; «размножено» у правила веса 1; ВОПРОС пользователю;
 *          нет базы (тогда правило веса 3 без записи — WARN, а не FAIL);
 *   OK   — остальное. Индекс = сумма весов правил в счёте (+ вес ещё раз за запрет) — для
 *          сравнения «до/после», сам по себе ничего не значит.
 *
 * authorship-decisions.json (в папке прогона) — правило → блок → почему:
 *   { "pill-everywhere": { "form": "кнопка донора — контурная пилюля 292×60, взята как есть" } }
 *   или список [{ "rule": "…", "block": "…", "why": "…" }]. Ключи с «_» — комментарии.
 *   Обоснование снимает только «НЕТ У ДОНОРА». Запрет снимает только пользователь
 *   (taste.mjs add --by user --verdict accepted …).
 *
 * Коды выхода: 0 — OK или WARN; 1 — FAIL; 2 — неверные аргументы (нет адреса, флаг без значения,
 * неизвестный экран) или файл; 3 — страница не открылась или упал браузер.
 *
 * Детектор врёт в обе стороны. Известные ложные срабатывания прототипа учтены: «небо» bureau.ru
 * (стопка из 10 градиентных слоёв одного размера — считается только видимый слой и только если
 * соседние слои не разноцветные), значок «Working…» linear.app (бегущая строка — от половины
 * ширины экрана), бледный градиент linear.app (ai-palette — только насыщенные точки). Смысла он
 * не видит: подпись капсом у донора и у нас выглядят одинаково, поэтому решает сравнение с донором.
 *
 * Экспорт: RULES, MODES, measureViewport, compareResult, loadDecisions, printResult.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launch, preparePage, gotoRetry, waitForOverlay, forceInstantScroll, scrollThrough, evaluateWith,
  EFFECTIVE_OPACITY_FN, HEX_FN, parseArgs, pickViewports, parseViewport, runDir, writeJson, readJson, ensureDir, sleep, slugFromUrl,
} from './lib.mjs';
import { tasteDir, activeBans, readJournal, baselineResult, conflictsWith } from './taste.mjs';

/* ---------- каталог: вес 3 — сильный признак, 2 — средний, 1 — слабый; id совпадают с reference/authorship.md ---------- */
export const RULES = {
  'form-kit': { w: 3, mode: 'role', t: 'форма-набор: подписи капсом над коробками полей, пилюля «Отправить», «не обязательно» мелко' },
  'eyebrow': { w: 3, mode: 'length', t: 'надзаголовок: подпись капсом с разрядкой прямо над крупным заголовком' },
  'numbered-steps': { w: 3, mode: 'role', t: 'шаги 01 / 02 / 03 над одинаковыми колонками' },
  'faq-plus': { w: 3, mode: 'role', t: 'аккордеон вопросов с плюсом или шевроном (в кружке)' },
  'icon-cards': { w: 3, mode: 'role', t: 'сетка одинаковых карточек «иконка + заголовок + текст»' },
  'stat-row': { w: 3, mode: 'role', t: 'полоса цифр-достижений «10+ лет, 500 клиентов»' },
  'trusted-logos': { w: 3, mode: 'role', t: 'полоса серых логотипов «нам доверяют»' },
  'glass': { w: 3, mode: 'role', t: 'стеклянные панели (backdrop-filter: blur)' },
  'gradient-blob': { w: 3, mode: 'role', t: 'размытые цветные пятна, свечение' },
  'gradient-text': { w: 3, mode: 'length', t: 'градиентный текст' },
  'ai-palette': { w: 3, mode: 'role', t: 'сине-фиолетовый градиент, неон на тёмном' },
  'italic-serif-accent': { w: 3, mode: 'length', t: 'одно слово курсивной антиквой в гротесковом заголовке' },
  'left-stripe': { w: 3, mode: 'role', t: 'цветная полоска слева у карточки' },
  'centered-hero': { w: 2, mode: 'role', t: 'первый экран по центру' },
  'hero-two-ctas': { w: 2, mode: 'role', t: 'две кнопки рядом на первом экране (залитая + контурная)' },
  'caps-microlabel': { w: 2, mode: 'length', t: 'мелкий капс с разрядкой на подписях, ценах, подвале' },
  'pill-everywhere': { w: 2, mode: 'share', t: 'все кнопки — пилюли' },
  'uniform-radius': { w: 2, mode: 'share', t: 'одно скругление 6–20 px на всех коробках' },
  'soft-shadow': { w: 2, mode: 'role', t: 'мягкая тень «0 20 40» под карточками' },
  'fade-up-reveal': { w: 2, mode: 'role', t: 'каждый блок выезжает снизу с проявлением' },
  'hover-lift': { w: 2, mode: 'role', t: 'подъём на 2–8 px при наведении' },
  'heading-colon': { w: 2, mode: 'length', t: 'двоеточие в конце заголовков секций' },
  'marquee': { w: 2, mode: 'length', t: 'бегущая строка со слоганами через «•»' },
  'giant-footer-word': { w: 2, mode: 'role', t: 'огромное слово-логотип в подвале' },
  'section-template': { w: 2, mode: 'role', t: 'все секции собраны одинаково: заголовок одного стиля → содержимое' },
  'alternating-bands': { w: 2, mode: 'role', t: 'фоны секций строго чередуются (зебра)' },
  'equal-cards': { w: 2, mode: 'role', t: 'сетка одинаковых текстовых карточек' },
  'no-photos': { w: 2, mode: 'role', t: 'на странице нет ни одной фотографии' },
  'accent-added': { w: 2, mode: 'role', t: 'насыщенный цвет-акцент на кнопках и метках (у донора акцента нет или он другого цвета)' },
  'font-swapped': { w: 2, mode: 'base', t: 'гарнитура, которой нет у донора: его шрифт заменён своим «похожим»' },
  'demo-badges': { w: 2, mode: 'role', t: 'метки «демо» и мелкие оговорки россыпью по секциям' },
  'photo-cards': { w: 1, mode: 'role', t: 'сетка одинаковых фото-карточек' },
  'footer-columns': { w: 1, mode: 'role', t: 'подвал колонками с капс-заголовками' },
  'overused-font': { w: 1, mode: 'role', t: 'гарнитура из «ИИ-набора» (Inter, Geist, Manrope, Space Grotesk…)' },
  'fine-print': { w: 1, mode: 'length', t: 'мелкий текст меньше 12 px по всей странице' },
  'transition-all': { w: 1, mode: 'role', t: 'transition: all' },
  'bounce-ease': { w: 1, mode: 'role', t: 'пружинящая кривая (cubic-bezier с перелётом)' },
  'copy-buzz': { w: 1, mode: 'role', t: 'слова-пустышки в текстах' },
  'copy-triad': { w: 1, mode: 'role', t: 'триады «Быстро. Надёжно. Удобно.»' },
};
export const MODES = {
  length: 'частота на 10 000 px высоты против донора (декоративные)',
  share: 'доля внутри своего класса против донора (функциональные)',
  role: 'есть у донора или нет',
  base: 'только с базой: сравнение с донором напрямую',
};
const W3 = '███', W2 = '██░', W1 = '█░░';
const WMARK = { 3: W3, 2: W2, 1: W1 };

const HELP = `cliche.mjs — шаблонность страницы числами и сравнение с донором

  node cliche.mjs <url> [--baseline <json>] [--taste [папка]] [--viewport desktop,mobile]
                        [--run <папка прогона>] [--decisions <json>] [--shot] [--json <файл>|-]
  node cliche.mjs baseline <url донора> [--out <файл.json|папка>] [--viewport desktop,mobile]
  node cliche.mjs rules [--json]
  node cliche.mjs --help

Флаги:
  --baseline <json>  база: файл «cliche.mjs baseline» донора (или результат прогона сайта «до»).
                     Без базы — только список черт страницы; вердикт по запретам и весу 3.
  --taste [папка]    запреты пользователя из журнала вкуса (taste.mjs); без папки —
                     SITE_REWORK_TASTE или ~/.claude/site-rework/taste.
  --viewport <list>  экраны через запятую (desktop, laptop, tablet, mobile, mobile-s, android или
                     ШxВ@плотность). По умолчанию — экраны из базы, без базы — desktop
                     (baseline — desktop,mobile). --viewports — то же самое; оба сразу
                     с разными списками — ошибка (код 2).
  --run <папка>      папка прогона (синоним --out): там authorship-decisions.json, туда
                     cliche/cliche.json и снимки. По умолчанию — папка с state.json или
                     authorship-decisions.json от файла базы вверх (до 3 уровней), иначе
                     ~/.claude/site-rework/runs/<адрес>.
  --decisions <json> файл обоснований, если он не в папке прогона.
  --shot             снимок с обводкой того, что пошло в счёт: <run>/cliche/cliche-<экран>.png
  --json <файл>|-    куда записать итог (по умолчанию <run>/cliche/cliche.json); «-» — JSON в stdout.
  --out              в режиме baseline: файл .json или папка (там cliche-baseline.json).
  --strict           как у других скриптов; FAIL и без него даёт код 1.
  --help, -h, --h    эта справка.

Пометки: есть у донора · НЕТ У ДОНОРА · размножено ×N · ЗАПРЕЩЁН пользователем · ВОПРОС пользователю.
Сравнение: декоративные приёмы (length) — частота на 10 000 px страницы, «размножено» при > ×2;
функциональные (share) — доля внутри своего класса (пилюли среди кнопок); остальные (role) — есть
у донора или нет; font-swapped и accent-added сверяются с базой по гарнитурам и оттенку.

Вердикт: FAIL — ЗАПРЕЩЁН; вес 3 «НЕТ У ДОНОРА» без обоснования; «размножено» > ×2 (вес 2–3).
         WARN — «НЕТ У ДОНОРА» веса 1–2 без обоснования; «размножено» веса 1; ВОПРОС; нет базы.
         OK — остальное.
Обоснования: <run>/authorship-decisions.json — { "правило": { "блок": "почему" } }; снимают только
«НЕТ У ДОНОРА». Запрет снимает только пользователь (taste.mjs add --by user --verdict accepted).

Коды выхода: 0 — OK/WARN, 1 — FAIL, 2 — неверные аргументы (нет адреса, флаг без значения,
неизвестный экран) или файл, 3 — страница не открылась.
Список правил с весами: node cliche.mjs rules`;

/* ======================================================================
   В странице: всё, что считается по вычисленным стилям.
   Зависимости (evaluateWith): eff — итоговая непрозрачность, hex — любой CSS-цвет в #RRGGBB[AA].
   ====================================================================== */
function inPage(RULE_IDS) {
  const vw = innerWidth, vh = innerHeight;
  const docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const found = Object.fromEntries(RULE_IDS.map((id) => [id, { items: [], info: {} }]));
  const cs = (el, p) => getComputedStyle(el, p);
  const px = (v) => parseFloat(v) || 0;
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
  /* какая доля элемента не обрезана предками с overflow hidden/clip: заглушка Tilda «Zero Block»
     лежит в артборде шириной 0 с overflow:hidden — в DOM она есть, на экране её нет */
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
  const visible = (el) => { if (!el || !el.getBoundingClientRect) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; return eff(el) > 0.05 && clipShare(el) > 0.1; };
  const sel = (el) => {
    const part = (e) => {
      if (e.id && !/^\d|rec\d/.test(e.id)) return '#' + CSS.escape(e.id);
      const cls = [...e.classList].filter((c) => !/^(is-|in$|t-rec|r$|loaded|t-animate)/.test(c)).slice(0, 2);
      return e.tagName.toLowerCase() + (cls.length ? '.' + cls.map((c) => CSS.escape(c)).join('.') : '');
    };
    const out = []; let e = el;
    for (let i = 0; e && e !== document.body && i < 3; i++) { const p = part(e); out.unshift(p); if (p.startsWith('#')) break; e = e.parentElement; }
    return out.join(' > ');
  };
  const add = (id, el, note, extra) => { if (!found[id]) return; const r = rectOf(el); found[id].items.push({ sel: sel(el), note: note || '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), ...(extra || {}) }); };
  /* цвет: {r,g,b,a} из любой CSS-записи (rgb, oklch, lab, color-mix…) через hex из lib.mjs */
  const col = (css) => { const h = hex(css); if (!h) return null; return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: h.length > 7 ? parseInt(h.slice(7, 9), 16) / 255 : 1 }; };
  const COLOR_RE = /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi;
  const colorsIn = (s) => [...String(s || '').matchAll(COLOR_RE)].map((m) => col(m[0])).filter(Boolean);
  const hexOf = (c) => (c ? '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase() : null);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const hue = (c) => { const r = c.r / 255, g = c.g / 255, b = c.b / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const d = mx - mn; if (d < 0.12) return null; let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; return (h * 60 + 360) % 360; };
  const hsl = (c) => { const r = c.r / 255, g = c.g / 255, b = c.b / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); return { s, l }; };
  const chroma = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = col(cs(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const isUpper = (el, t) => cs(el).textTransform === 'uppercase' || (/[A-ZА-ЯЁ]/.test(t) && t === t.toUpperCase());
  const lsEm = (el) => { const s = cs(el); const ls = s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing); return ls / (px(s.fontSize) || 16); };
  const radius = (el) => { const s = cs(el); const r = s.borderTopLeftRadius; if (r.endsWith('%')) return Math.min(el.offsetWidth, el.offsetHeight) * parseFloat(r) / 100; return px(r); };
  const hasBorderAll = (s) => ['Top', 'Right', 'Bottom', 'Left'].every((k) => px(s['border' + k + 'Width']) >= 0.9 && s['border' + k + 'Style'] !== 'none');
  const shadows = (s) => {
    if (!s.boxShadow || s.boxShadow === 'none') return [];
    return s.boxShadow.split(/,(?![^(]*\))/).map((p) => { const c = colorsIn(p)[0] || null; const nums = p.replace(COLOR_RE, '').trim().split(/\s+/).filter((x) => /px$/.test(x)).map(px); return { c, x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, inset: /inset/.test(p) }; });
  };
  const inDoc = (r) => r.y >= -2 && r.y + r.h <= docH + 2 && r.x + r.w > 0 && r.x < vw;
  const all = [...document.querySelectorAll('body *')].filter((e) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION'].includes(e.tagName) && !(e instanceof SVGElement));
  const vis = all.filter(visible);
  const buttonLike = vis.filter((e) => {
    if (!e.matches('a, button, [role=button], input[type=submit], input[type=button]')) return false;
    const s = cs(e); const r = e.getBoundingClientRect(); if (r.height < 24 || r.height > 90 || r.width < 40) return false;
    const bg = col(s.backgroundColor); return (bg && bg.a > 0.3) || hasBorderAll(s);
  });
  const isPill = (e) => { const r = e.getBoundingClientRect(); return radius(e) >= Math.min(r.height, r.width) / 2 - 1.5; };

  /* ===== типографика ===== */
  const headings = vis.filter((e) => /^H[1-3]$/.test(e.tagName) || (px(cs(e).fontSize) >= 40 && textOf(e).length > 1 && textOf(e).length < 120 && ownText(e).length > 1));
  const caps = []; let spacedAll = 0; const spacedEx = [];
  for (const e of vis) {
    const t = ownText(e); if (t.length < 2) continue;
    const s = cs(e); const fs = px(s.fontSize);
    if (lsEm(e) >= 0.05 && /[A-Za-zА-Яа-яЁё]/.test(t)) { spacedAll++; if (spacedEx.length < 5) spacedEx.push(`«${t.slice(0, 24)}» ${fs}px ${lsEm(e).toFixed(2)}em`); }
    if (t.length > 48 || fs > 14.5 || !isUpper(e, t) || lsEm(e) < 0.07) continue;
    if (e.closest('button, [role=button], nav') || buttonLike.includes(e.closest('a'))) continue;
    caps.push(e);
  }
  const eyebrowSet = new Set();
  for (const h of headings) {
    const hfs = px(cs(h).fontSize); if (hfs < 28) continue;
    let prev = h.previousElementSibling; while (prev && !visible(prev)) prev = prev.previousElementSibling;
    if (!prev || /^H[1-6]$/.test(prev.tagName)) continue;
    const t = textOf(prev); if (t.length < 2 || t.length > 60) continue;
    const pfs = px(cs(prev).fontSize);
    const cand = [prev, ...prev.querySelectorAll('*')].find((x) => ownText(x).length > 1) || prev;
    if (pfs <= 15 && hfs / pfs >= 2.2 && isUpper(cand, t) && lsEm(cand) >= 0.06) {
      eyebrowSet.add(prev);
      const first = prev.getBoundingClientRect().top + scrollY < vh;
      add('eyebrow', prev, `«${t.slice(0, 40)}» ${pfs}px, разрядка ${lsEm(cand).toFixed(2)}em над «${textOf(h).slice(0, 30)}» ${Math.round(hfs)}px` + (isPill(prev) ? ', чип-пилюля' : '') + (first ? ' · первый экран' : ' · секция'));
    }
  }
  const capsRest = caps.filter((e) => ![...eyebrowSet].some((x) => x === e || x.contains(e)));
  const ctx = (e) => (e.closest('form') ? 'форма' : e.closest('footer, .foot, [class*=footer]') ? 'подвал' : e.closest('header') ? 'шапка' : 'страница');
  found['caps-microlabel'].info = { spacedAll, spacedExamples: spacedEx, capsSmall: caps.length };
  if (capsRest.length >= 4) {
    const byCtx = {}; capsRest.forEach((e) => { byCtx[ctx(e)] = (byCtx[ctx(e)] || 0) + 1; });
    capsRest.forEach((e) => add('caps-microlabel', e, `«${ownText(e).slice(0, 30)}» ${px(cs(e).fontSize)}px ${lsEm(e).toFixed(2)}em · ${ctx(e)}`));
    found['caps-microlabel'].info.byContext = byCtx;
  }
  const hs3 = vis.filter((e) => /^H[1-3]$/.test(e.tagName));
  found['heading-colon'].info = { headings: hs3.length, midColon: hs3.filter((h) => /[:：]\s*\S/.test(textOf(h))).length };
  for (const h of hs3) { const t = textOf(h); if (/[:：]\s*$/.test(t)) add('heading-colon', h, `«${t.slice(0, 40)}» ${h.tagName.toLowerCase()}`); }
  for (const h of vis.filter((e) => /^H[12]$/.test(e.tagName) && px(cs(e).fontSize) >= 40)) {
    const hs = cs(h);
    for (const c of h.querySelectorAll('em, i, span')) { const s = cs(c); if (s.fontStyle === 'italic' && /serif|georgia|times|playfair|instrument|garamond|fraunces/i.test(s.fontFamily) && s.fontFamily !== hs.fontFamily) add('italic-serif-accent', c, `«${textOf(c).slice(0, 30)}»`); }
  }
  /* гарнитуры по ролям (знаки текста): для overused-font и сравнения с донором (font-swapped) */
  const fonts = { heading: {}, text: {}, button: {}, small: {} };
  for (const e of vis) {
    const t = ownText(e); if (t.length < 2 || !/[A-Za-zА-Яа-яЁё0-9]/.test(t)) continue;
    const s = cs(e); const fs = px(s.fontSize); if (fs < 6) continue;
    const fam = s.fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (!fam) continue;
    const b = e.closest('a, button, [role=button], input[type=submit]');
    const role = b && buttonLike.includes(b) ? 'button' : (e.closest('h1, h2, h3, h4, h5, h6') || fs >= 28) ? 'heading' : fs < 13 ? 'small' : 'text';
    fonts[role][fam] = (fonts[role][fam] || 0) + t.length;
  }
  const fams = {}; for (const r of Object.values(fonts)) for (const [f, n] of Object.entries(r)) fams[f] = (fams[f] || 0) + n;
  const famTotal = Object.values(fams).reduce((a, b) => a + b, 0) || 1;
  const OVERUSED = /^(inter( var| variable| tight| display)?|geist( sans| mono)?|manrope|space grotesk|instrument serif|dm sans|plus jakarta sans|poppins|outfit|sora|satoshi|general sans|onest|montserrat|golos( text)?)$/i;
  found['overused-font'].info.families = Object.fromEntries(Object.entries(fams).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [k, +(v / famTotal).toFixed(2)]));
  for (const [f, n] of Object.entries(fams)) if (OVERUSED.test(f) && n / famTotal > 0.2) found['overused-font'].items.push({ sel: 'font-family', note: `${f}: ${Math.round(n / famTotal * 100)}% текста` });

  /* ===== форма-набор ===== */
  const forms = vis.filter((e) => e.tagName === 'FORM');
  const loose = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')].filter((f) => visible(f) && !f.closest('form'));
  if (loose.length >= 2) { let c = loose[0].parentElement; while (c && !loose.every((f) => c.contains(f))) c = c.parentElement; if (c) forms.push(c); }
  for (const form of forms) {
    const fields = [...form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, select')].filter(visible);
    if (fields.length < 2) continue;
    const signs = [];
    const capsIn = caps.filter((c) => form.contains(c));
    if (capsIn.length >= Math.min(2, fields.length)) signs.push(`подписи капсом ${capsIn.length} (${px(cs(capsIn[0]).fontSize)}px, разрядка ${lsEm(capsIn[0]).toFixed(2)}em)`);
    const boxed = fields.filter((f) => { const r = radius(f); return r >= 4 && r <= 16 && hasBorderAll(cs(f)); });
    if (boxed.length >= fields.length * 0.75) {
      const r0 = Math.round(radius(boxed[0])); const fbg = col(cs(boxed[0]).backgroundColor); const pbg = bgOf(form.parentElement);
      const tone = fbg && fbg.a > 0.5 ? (lum(fbg) < 0.05 ? ', тёмная заливка' : '') + ` ${hexOf(fbg)} на ${hexOf(pbg)}` : '';
      signs.push(`коробки полей r${r0} с рамкой со всех сторон ${boxed.length}/${fields.length}${tone}`);
    }
    const widths = fields.map((f) => Math.round(f.getBoundingClientRect().width)); const xs = fields.map((f) => Math.round(f.getBoundingClientRect().left));
    if (new Set(widths).size === 1 && new Set(xs).size === 1 && fields.length >= 3) signs.push(`${fields.length} поля столбиком одной ширины ${widths[0]}px`);
    const submit = [...form.querySelectorAll('button, input[type=submit]')].filter(visible).pop();
    if (submit && isPill(submit)) { const sb = col(cs(submit).backgroundColor); signs.push(`отправка — пилюля ${Math.round(submit.getBoundingClientRect().height)}px «${textOf(submit).slice(0, 24)}»` + (sb && sb.a > 0.5 && chroma(sb) >= 90 ? `, акцент ${hexOf(sb)}` : '')); }
    const opt = [...form.querySelectorAll('*')].find((e) => /не\s*обязательн|необязательн|optional/i.test(ownText(e)) && px(cs(e).fontSize) <= 13);
    if (opt) signs.push(`«${ownText(opt)}» ${px(cs(opt).fontSize)}px`);
    if (signs.length >= 3) add('form-kit', form, `${signs.length} из 5: ` + signs.join('; '));
  }

  /* ===== кнопки, коробки, тени, стекло ===== */
  const pills = buttonLike.filter(isPill);
  found['pill-everywhere'].info = { pills: pills.length, buttons: buttonLike.length, share: buttonLike.length ? +(pills.length / buttonLike.length).toFixed(2) : 0 };
  if (buttonLike.length >= 4 && pills.length >= 5 && pills.length / buttonLike.length >= 0.6) pills.forEach((e) => add('pill-everywhere', e, `r${Math.round(radius(e))}, h${Math.round(e.getBoundingClientRect().height)}`));
  const boxes = vis.filter((e) => {
    const r = e.getBoundingClientRect(); if (r.width * r.height < 4000 || buttonLike.includes(e)) return false;
    const s = cs(e); const bg = col(s.backgroundColor);
    return ((bg && bg.a > 0.3) || hasBorderAll(s) || s.boxShadow !== 'none' || e.matches('input, textarea, select, canvas, img')) && radius(e) > 0 && !isPill(e);
  });
  const radHist = {}; boxes.forEach((e) => { const r = Math.round(radius(e)); radHist[r] = (radHist[r] || 0) + 1; });
  const radTop = Object.entries(radHist).sort((a, b) => b[1] - a[1]);
  const mid = radTop.filter(([r]) => r >= 6 && r <= 20).reduce((a, [, n]) => a + n, 0);
  found['uniform-radius'].info = { hist: Object.fromEntries(radTop.slice(0, 6)), boxes: boxes.length, mid, share: boxes.length ? +(mid / boxes.length).toFixed(2) : 0 };
  if (boxes.length >= 5 && mid / boxes.length >= 0.6) boxes.filter((e) => { const r = radius(e); return r >= 6 && r <= 20; }).forEach((e) => add('uniform-radius', e, `r${Math.round(radius(e))}`));
  const gradCands = [];
  for (const e of vis) {
    const s = cs(e); const r = e.getBoundingClientRect();
    const sh = shadows(s).filter((x) => !x.inset);
    if (sh.some((x) => x.blur >= 16 && Math.abs(x.y) >= 8 && x.c && chroma(x.c) < 40)) add('soft-shadow', e, s.boxShadow.slice(0, 60));
    if (sh.some((x) => x.blur >= 12 && x.c && x.c.a > 0.15 && chroma(x.c) >= 90)) add('gradient-blob', e, 'цветное свечение ' + s.boxShadow.slice(0, 50));
    if (/blur\(/.test(s.backdropFilter || s.webkitBackdropFilter || '')) { const bg = col(s.backgroundColor); if (!bg || bg.a < 0.95) add('glass', e, `backdrop-filter ${s.backdropFilter}, фон ${s.backgroundColor}`); }
    const fb = /blur\((\d+)/.exec(s.filter || '');
    if (fb && +fb[1] >= 30 && r.width >= 150) add('gradient-blob', e, `filter ${s.filter}`);
    if (/gradient/.test(s.backgroundImage) && /text/.test(s.webkitBackgroundClip || s.backgroundClip || '')) add('gradient-text', e, `«${textOf(e).slice(0, 30)}»`);
    else if (/gradient/.test(s.backgroundImage) && r.width * r.height > 20000) {
      /* только насыщенные точки: бледный «белый → лавандовый» linear.app — не «ИИ-палитра» */
      const cols = colorsIn(s.backgroundImage).filter((c) => c.a > 0.2);
      const vivid = cols.filter((c) => { const x = hsl(c); return x.s >= 0.45 && x.l >= 0.2 && x.l <= 0.78; });
      const hs = vivid.map(hue).filter((h) => h !== null);
      if (hs.length >= 2 && hs.every((h) => h >= 200 && h <= 300) && Math.max(...hs) - Math.min(...hs) >= 20) gradCands.push({ e, cols });
    }
    const bl = px(s.borderLeftWidth);
    if (bl >= 2 && bl <= 6 && px(s.borderTopWidth) === 0 && px(s.borderRightWidth) === 0 && r.height >= 40) { const c = col(s.borderLeftColor); if (c && hue(c) !== null) add('left-stripe', e, `border-left ${bl}px ${hexOf(c)}`); }
  }
  /* ai-palette: слой должен быть виден (не закрыт соседом того же размера), а соседние
     градиенты — не разноцветный набор: у bureau.ru это «небо» из 10 стопкой лежащих слоёв */
  const skipped = [];
  const sy0 = scrollY;
  for (const { e, cols } of gradCands) {
    const sibs = e.parentElement ? [...e.parentElement.children].filter((k) => k !== e && /gradient/.test(cs(k).backgroundImage)) : [];
    const other = sibs.filter((k) => colorsIn(cs(k).backgroundImage).some((c) => { const h = hue(c); const x = hsl(c); return h !== null && x.s >= 0.3 && (h < 200 || h > 300); }));
    if (other.length >= 2) { skipped.push(`${sel(e)}: рядом ещё ${sibs.length} градиентов разных оттенков — иллюстрация`); continue; }
    const r0 = rectOf(e);
    scrollTo({ top: Math.max(0, r0.y + r0.h / 2 - vh / 2), behavior: 'instant' });
    const r = e.getBoundingClientRect();
    const pts = [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]).filter(([x, y]) => x >= 0 && x < vw && y >= 0 && y < vh);
    const seen = pts.some(([x, y]) => { const hit = document.elementFromPoint(x, y); return !hit || hit === e || e.contains(hit) || hit.contains(e); });
    if (!seen && cs(e).pointerEvents !== 'none') { skipped.push(`${sel(e)}: закрыт другим слоем`); continue; }
    add('ai-palette', e, 'градиент ' + cols.map(hexOf).join('→'));
  }
  scrollTo({ top: sy0, behavior: 'instant' });
  found['ai-palette'].info = { candidates: gradCands.length, skipped: skipped.slice(0, 6) };

  /* ===== акцент: насыщенный цвет на кнопках и метках (у донора его может не быть вовсе) ===== */
  const accents = [];
  const satOk = (c, o) => c && c.a * o >= 0.5 && chroma(c) >= 90 && Math.max(c.r, c.g, c.b) >= 90;
  for (const b of buttonLike) {
    const r = rectOf(b); if (!inDoc(r)) continue;
    const s = cs(b); const o = eff(b);
    const pick = [[col(s.backgroundColor), 'фон'], [hasBorderAll(s) ? col(s.borderTopColor) : null, 'рамка'], [col(s.color), 'текст']].find(([c]) => satOk(c, o));
    if (pick) accents.push({ e: b, c: pick[0], how: `кнопка, ${pick[1]}` });
  }
  for (const e of vis) {
    if (buttonLike.includes(e) || e.closest('a, button')) continue;
    const t = ownText(e) || textOf(e); if (t.length < 1 || t.length > 30) continue;
    const r = rectOf(e); if (r.h > 64 || r.w > 420 || !inDoc(r)) continue;
    const c = col(cs(e).backgroundColor); if (satOk(c, eff(e))) accents.push({ e, c, how: 'метка' });
  }
  const hueGroups = {};
  for (const a of accents) { const h = hue(a.c); const k = h === null ? 'x' : Math.round(h / 30) % 12; const g = hueGroups[k] || (hueGroups[k] = { hexes: {}, hue: h, count: 0 }); g.count++; const hx = hexOf(a.c); g.hexes[hx] = (g.hexes[hx] || 0) + 1; }
  found['accent-added'].info = { accents: Object.values(hueGroups).map((g) => ({ hex: Object.entries(g.hexes).sort((a, b) => b[1] - a[1])[0][0], hue: g.hue === null ? null : Math.round(g.hue), count: g.count })).sort((a, b) => b.count - a.count) };
  accents.forEach((a) => add('accent-added', a.e, `${hexOf(a.c)} ${a.how}, «${textOf(a.e).slice(0, 24)}»`, { hue: hue(a.c) === null ? null : Math.round(hue(a.c)) }));

  /* ===== сетки и повторы ===== */
  const parents = new Set(vis.map((e) => e.parentElement).filter(Boolean));
  const cardGroups = [];
  for (const p of parents) {
    const kids = [...p.children].filter((k) => visible(k) && k.getBoundingClientRect().width >= 120 && k.getBoundingClientRect().height >= 90);
    if (kids.length < 3) continue;
    const key = (k) => { const r = k.getBoundingClientRect(); return Math.round(r.width / 4) + 'x' + Math.round(r.height / 4); };
    const groups = {}; kids.forEach((k) => { (groups[key(k)] = groups[key(k)] || []).push(k); });
    const best = Object.values(groups).sort((a, b) => b.length - a.length)[0];
    if (best.length < 3 || best.length / kids.length < 0.75) continue;
    const rows = new Set(best.map((k) => Math.round(k.getBoundingClientRect().top))).size;
    const cols = best.length / rows; if (cols < 2 && rows < 3) continue;
    if (best.some((k) => k.getBoundingClientRect().width > vw * 0.9)) continue;
    cardGroups.push({ p, cards: best });
  }
  const inside = (a, b) => b !== a && b.contains(a);
  const topGroups = cardGroups.filter((g) => !cardGroups.some((o) => o !== g && o.cards.some((c) => inside(g.p, c))));
  for (const g of topGroups) {
    const r0 = g.cards[0].getBoundingClientRect();
    const media = (k) => [...k.querySelectorAll('img, canvas, video, picture, [style*="background-image"], .t-bgimg')].concat([k]).some((m) => { const mr = m.getBoundingClientRect(); const bi = cs(m).backgroundImage; const isMedia = /IMG|CANVAS|VIDEO|PICTURE/.test(m.tagName) || /url\(/.test(bi); return isMedia && mr.width * mr.height >= 0.35 * k.getBoundingClientRect().width * k.getBoundingClientRect().height; });
    const icon = (k) => [...k.querySelectorAll('svg, img, i[class*=icon], span[class*=icon]')].some((m) => { const mr = m.getBoundingClientRect(); return mr.width >= 12 && mr.width <= 80 && mr.height <= 80 && mr.top - k.getBoundingClientRect().top < 120; });
    const deco = (k) => { const s = cs(k); const bg = col(s.backgroundColor); return (bg && bg.a > 0.3) || hasBorderAll(s) || s.boxShadow !== 'none' || radius(k) >= 6; };
    const texty = (k) => k.querySelector('h2, h3, h4, b, strong') && textOf(k).length > 30;
    const n = g.cards.length;
    if (g.cards.every(media)) g.cards.forEach((k) => add('photo-cards', k, `${n} шт ${Math.round(r0.width)}×${Math.round(r0.height)}`));
    else if (g.cards.filter(icon).length >= n * 0.75 && g.cards.every(texty)) g.cards.forEach((k) => add('icon-cards', k, `${n} шт ${Math.round(r0.width)}×${Math.round(r0.height)}`));
    else if (g.cards.every(deco) && g.cards.every(texty)) g.cards.forEach((k) => add('equal-cards', k, `${n} шт ${Math.round(r0.width)}×${Math.round(r0.height)}`));
  }
  const numEls = vis.filter((e) => /^(0?[1-9]|1[0-9])[.)]?$/.test(ownText(e)) && !e.closest('a, button, nav, [class*=pag]') && !e.matches('input, option'));
  const byGrand = new Map();
  numEls.forEach((e) => { const g = e.parentElement && e.parentElement.parentElement; if (!g) return; if (!byGrand.has(g)) byGrand.set(g, []); byGrand.get(g).push(e); });
  for (const [, list] of byGrand) { const ns = list.map((e) => parseInt(ownText(e), 10)); if (list.length >= 3 && ns.slice(1).every((n, i) => n === ns[i] + 1)) list.forEach((e) => add('numbered-steps', e.parentElement, `«${ownText(e)}» ${px(cs(e).fontSize)}px`)); }
  const statEls = vis.filter((e) => /^[+~≈>]?\d[\d\s.,]*\s?(\+|%|×|x|k|K|м|млн|тыс\.?|лет|год|₽|\$|ч|мин)?\+?$/.test(ownText(e)) && px(cs(e).fontSize) >= 28 && !e.closest('button, a'));
  const statGroups = new Map();
  statEls.forEach((e) => { const g = e.parentElement && e.parentElement.parentElement; if (!g) return; if (!statGroups.has(g)) statGroups.set(g, []); statGroups.get(g).push(e); });
  for (const [, list] of statGroups) if (list.length >= 3) list.forEach((e) => add('stat-row', e.parentElement, `«${ownText(e)}»`));
  const toggles = vis.filter((e) => e.tagName === 'SUMMARY' || (e.matches('button[aria-expanded], [role=button][aria-expanded]') && !e.closest('nav, header')));
  if (toggles.length >= 3) {
    for (const t of toggles) {
      const marks = ['::after', '::before'].map((p) => ({ p, s: cs(t, p) })).filter(({ s }) => s.content && s.content !== 'none' && s.content !== 'normal');
      const plus = marks.find(({ s }) => /["'][+＋›⌄∨▾▸⌃−-]["']/.test(s.content) || (s.content === '""' && (s.backgroundImage !== 'none' || s.borderRightWidth !== '0px')));
      const svg = t.querySelector('svg');
      if (plus || svg) add('faq-plus', t, (plus ? `${plus.p} ${plus.s.content}` : 'svg-значок') + (plus && px(plus.s.borderTopWidth) > 0 && /50%|\d{2}px/.test(plus.s.borderTopLeftRadius) ? ' в кружке' : ''));
    }
  }
  /* бегущая строка: бесконечный сдвиг по X у блока от половины ширины (значок «Working…» linear.app — не она) */
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target; if (!t || !a.effect.getComputedTiming) continue;
    if (a.effect.getComputedTiming().iterations !== Infinity) continue;
    const kf = (a.effect.getKeyframes ? a.effect.getKeyframes() : []).map((k) => k.transform || '').join(' ');
    if (/translate(X|3d)?\(\s*-?\d/.test(kf) && t.getBoundingClientRect().width >= vw * 0.5 && eff(t) > 0.05) { const box = t.closest('[class*=ticker], [class*=marquee], [class*=running]') || t.parentElement; add('marquee', box, `«${textOf(t).slice(0, 50)}»`); }
  }
  /* первый экран */
  const h1 = vis.find((e) => e.tagName === 'H1') || headings.slice().sort((a, b) => px(cs(b).fontSize) - px(cs(a).fontSize))[0];
  if (h1) { const r = h1.getBoundingClientRect(); if (r.top + scrollY < vh && cs(h1).textAlign === 'center' && Math.abs(r.left + r.width / 2 - vw / 2) < vw * 0.05) add('centered-hero', h1, `h1 по центру, ${px(cs(h1).fontSize)}px`); }
  const heroBtns = buttonLike.filter((b) => b.getBoundingClientRect().top + scrollY < vh && b.getBoundingClientRect().height >= 36 && !b.closest('nav, header, [class*=nav], [class*=menu], [class*=floating]'));
  const byParent = new Map(); heroBtns.forEach((b) => { const p = b.parentElement; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(b); });
  for (const [p, list] of byParent) if (list.length >= 2) { const fills = list.map((b) => { const bg = col(cs(b).backgroundColor); return bg && bg.a > 0.5 ? 'залитая' : 'контурная'; }); add('hero-two-ctas', p, list.map((b, i) => `«${textOf(b).slice(0, 22)}» ${fills[i]}`).join(' + ')); }
  /* секции */
  const full = vis.filter((e) => e.getBoundingClientRect().width >= vw * 0.9 && e.getBoundingClientRect().height >= 150);
  const pc = new Map(); full.forEach((e) => { const p = e.parentElement; if (!p) return; pc.set(p, (pc.get(p) || 0) + 1); });
  const secParent = [...pc.entries()].sort((a, b) => b[1] - a[1])[0];
  const sections = secParent ? [...secParent[0].children].filter((e) => full.includes(e)) : [];
  const secBg = (s) => {
    const own = col(cs(s).backgroundColor); if (own && own.a > 0.5) return hexOf(own);
    const sr = s.getBoundingClientRect();
    for (const d of s.querySelectorAll('*')) { const r = d.getBoundingClientRect(); if (r.width * r.height < 0.7 * sr.width * sr.height) continue; const c = col(cs(d).backgroundColor); if (c && c.a > 0.5) return hexOf(c); if (/gradient|url\(/.test(cs(d).backgroundImage)) return 'картинка'; }
    if (/gradient|url\(/.test(cs(s).backgroundImage)) return 'картинка';
    return hexOf(bgOf(s.parentElement));
  };
  const seq = sections.filter((s) => s.getBoundingClientRect().height >= 200).map((s) => ({ s, bg: secBg(s) }));
  found['alternating-bands'].info.sequence = seq.map((x) => x.bg);
  let run = 1, bestRun = 1, bestEnd = 0;
  for (let i = 2; i < seq.length; i++) { if (seq[i].bg === seq[i - 2].bg && seq[i].bg !== seq[i - 1].bg) { run = run < 2 ? 3 : run + 1; if (run > bestRun) { bestRun = run; bestEnd = i; } } else run = 1; }
  if (bestRun >= 5) for (let i = bestEnd - bestRun + 1; i <= bestEnd; i++) add('alternating-bands', seq[i].s, seq[i].bg);
  const headKey = (s) => { const sr = s.getBoundingClientRect(); const h = [...s.querySelectorAll('h1, h2, h3')].find((x) => visible(x) && x.getBoundingClientRect().top - sr.top < 320); if (!h) return null; const st = cs(h); return { h, k: [st.fontFamily.split(',')[0], Math.round(px(st.fontSize)), st.textTransform, st.fontWeight, st.textAlign].join('|') }; };
  const keys = seq.map((x) => ({ ...x, hk: headKey(x.s) })).filter((x) => x.hk);
  const kc = {}; keys.forEach((x) => { kc[x.hk.k] = (kc[x.hk.k] || 0) + 1; });
  const topK = Object.entries(kc).sort((a, b) => b[1] - a[1])[0];
  if (topK && topK[1] >= 4) keys.filter((x) => x.hk.k === topK[0]).forEach((x) => add('section-template', x.s, `«${textOf(x.hk.h).slice(0, 30)}» ${topK[0]}`));
  /* подвал */
  const footer = document.querySelector('footer') || sections[sections.length - 1];
  for (const e of vis) {
    const fs = px(cs(e).fontSize); const t = ownText(e); const r = e.getBoundingClientRect();
    if (fs >= Math.max(vw * 0.11, 72) && t && t.split(/\s+/).length <= 2 && r.width >= vw * 0.5 && r.top + scrollY > docH * 0.6) add('giant-footer-word', e, `«${t}» ${Math.round(fs)}px`);
  }
  if (footer) {
    for (const p of [footer, ...footer.querySelectorAll('*')]) {
      const kids = [...p.children].filter(visible); if (kids.length < 3) continue;
      const tops = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top))); if (tops.size !== 1) continue;
      const withCaps = kids.filter((k) => caps.some((c) => k.contains(c) && c.getBoundingClientRect().top - k.getBoundingClientRect().top < 30));
      if (withCaps.length >= 3) { add('footer-columns', p, `${kids.length} колонок, капс-заголовков ${withCaps.length}`); break; }
    }
  }
  for (const p of parents) {
    const logos = [...p.children].filter((k) => visible(k) && (k.matches('img, svg') || k.querySelector(':scope > img, :scope > svg')) && k.getBoundingClientRect().height <= 80);
    if (logos.length < 4) continue;
    const grey = logos.filter((k) => { const t = k.matches('img, svg') ? k : k.querySelector('img, svg'); const s = cs(t); return /grayscale/.test(s.filter) || +s.opacity <= 0.7; });
    if (grey.length >= 4) add('trusted-logos', p, `${grey.length} серых логотипов`);
  }
  const photos = vis.filter((e) => { const r = e.getBoundingClientRect(); if (r.width * r.height < 40000) return false; if (e.matches('img, video, picture')) return true; return /url\(["']?(?!data:image\/svg)/.test(cs(e).backgroundImage) && !/\.(svg|gif)/i.test(cs(e).backgroundImage); });
  found['no-photos'].info = { photos: photos.length, canvases: vis.filter((e) => e.tagName === 'CANVAS').length };
  if (photos.length === 0) found['no-photos'].items.push({ sel: 'img, video, background-image', note: `фото 0, холстов ${found['no-photos'].info.canvases}` });

  /* ===== оговорки и мелкий текст ===== */
  const DEMO_RE = /(^|[^а-яёa-z])(демо|демонстрац\S*|условн\S*|для примера|пример(ная|ные)?\s+цен\S*|не является офертой|demo|sample|placeholder)([^а-яёa-z]|$)/iu;
  const secOf = (e) => { const s = e.closest('section, footer, header, form, main > *, [class*=section], .t-rec'); return s ? sel(s) : 'страница'; };
  const demo = vis.filter((e) => {
    const t = ownText(e); if (t.length < 2 || t.length > 160 || !DEMO_RE.test(t)) return false;
    const s = cs(e); const fs = px(s.fontSize); const bg = col(s.backgroundColor);
    const badge = t.length <= 24 && ((bg && bg.a > 0.3) || hasBorderAll(s));
    return fs <= 13 || badge;
  });
  const demoSecs = new Set(demo.map(secOf));
  found['demo-badges'].info = { total: demo.length, sections: demoSecs.size };
  if (demo.length >= 3 && demoSecs.size >= 2) demo.forEach((e) => add('demo-badges', e, `«${ownText(e).slice(0, 40)}» ${px(cs(e).fontSize)}px · ${secOf(e)}`));
  const fine = vis.filter((e) => { const t = ownText(e); return t.length >= 2 && /[A-Za-zА-Яа-яЁё]/.test(t) && px(cs(e).fontSize) < 12; });
  found['fine-print'].info = { total: fine.length, chars: fine.reduce((a, e) => a + ownText(e).length, 0) };
  if (fine.length >= 5) fine.forEach((e) => add('fine-print', e, `«${ownText(e).slice(0, 30)}» ${px(cs(e).fontSize)}px`));

  /* ===== тексты ===== */
  const bodyText = textOf(document.body);
  const BUZZ = /(уникальн\S*|инновацион\S*|премиальн\S*|эксклюзивн\S*|погрузит\S*|откройте для себя|новый уровень|идеальн\S*|вдохновля\S*|supercharg\S*|elevate|unlock|seamless\S*|empower\S*|effortless\S*|next-level)/gi;
  (bodyText.match(BUZZ) || []).slice(0, 20).forEach((w) => found['copy-buzz'].items.push({ sel: 'текст', note: w }));
  vis.filter((e) => /^([^\s.!]+\.\s){2,}[^\s.!]+\.$/.test(ownText(e))).forEach((e) => add('copy-triad', e, `«${ownText(e)}»`));

  found.page = { vw, vh, docH, sections: seq.length, buttons: buttonLike.length, pills: pills.length, boxes: boxes.length, capsTotal: caps.length, spacedAll, headings: hs3.length, fonts, fine: fine.length };
  return found;
}

/* появления: до прокрутки — ниже сгиба, прозрачные и сдвинутые вниз */
function revealCandidates() {
  const vh = innerHeight; const out = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect(); if (r.top < vh || r.width < 40 || r.height < 20) continue;
    const s = getComputedStyle(e); if (+s.opacity > 0.05) continue;
    if (e.parentElement && +getComputedStyle(e.parentElement).opacity <= 0.05) continue;
    const m = /matrix\(([^)]+)\)/.exec(s.transform); const ty = m ? +m[1].split(',')[5] : 0;
    if (ty >= 6 && ty <= 90) out.push({ sel: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), ty: Math.round(ty), x: Math.round(r.left), y: Math.round(r.top + scrollY - ty), h: Math.round(r.height), w: Math.round(r.width) });
  }
  return out;
}

/* CSS-текст: наведение, переходы, кривые, появления */
function cssRules(cssText) {
  const hits = { 'hover-lift': [], 'transition-all': [], 'bounce-ease': [], 'fade-up-css': [] };
  const flat = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of flat.matchAll(/([^{}]*:hover[^{}]*)\{([^{}]*)\}/g)) { const t = /translateY\(\s*-(\d+(?:\.\d+)?)px/.exec(m[2]) || /translate\(\s*0(?:px)?\s*,\s*-(\d+(?:\.\d+)?)px/.exec(m[2]); if (t && +t[1] >= 2 && +t[1] <= 8) hits['hover-lift'].push(m[1].trim().slice(0, 60) + ` → −${t[1]}px`); }
  for (const m of flat.matchAll(/([^{}]*)\{[^{}]*transition(?:-property)?\s*:\s*all\b[^{}]*\}/g)) hits['transition-all'].push(m[1].trim().slice(0, 60));
  for (const m of flat.matchAll(/cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.-]+)\s*,\s*([\d.]+)\s*,\s*([\d.-]+)\s*\)/g)) if (+m[2] > 1.05 || +m[4] > 1.05 || +m[2] < -0.05) hits['bounce-ease'].push(m[0]);
  for (const m of flat.matchAll(/([^{}]*)\{([^{}]*)\}/g)) if (/opacity\s*:\s*0\s*[;}]?/.test(m[2] + ';') && /translate(?:Y|3d)?\(\s*(?:0(?:px)?\s*,\s*)?(\d{1,2})px/.test(m[2])) hits['fade-up-css'].push(m[1].trim().slice(0, 60));
  return hits;
}

/* ======================================================================
   Замер одного экрана: открыть, прокрутить, посчитать. Возвращает результат без сравнения.
   ====================================================================== */
export async function measureViewport(browser, url, vpName, vp, { keepPage = false } = {}) {
  const page = await preparePage(browser, vp, {});
  const cssTexts = [];
  page.on('response', async (r) => { try { if (r.request().resourceType() === 'stylesheet' && r.ok()) cssTexts.push(await r.text()); } catch { /* тело недоступно */ } });
  try {
    await gotoRetry(page, url, { timeout: 90000 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    const overlay = await waitForOverlay(page, 5000);
    await forceInstantScroll(page);
    await sleep(1200);
    const reveal = await page.evaluate(revealCandidates);
    const sc = await scrollThrough(page, { pause: 300 });
    await sleep(700);
    const inline = await page.evaluate(() => [...document.querySelectorAll('style:not([data-rw])')].map((s) => s.textContent).join('\n'));
    const found = await evaluateWith(page, inPage, Object.keys(RULES), { eff: EFFECTIVE_OPACITY_FN, hex: HEX_FN });
    const css = cssRules(cssTexts.join('\n') + '\n' + inline);
    const P = found.page; delete found.page;
    found['fade-up-reveal'] = { items: reveal.map((r) => ({ sel: r.sel, note: `сдвиг ${r.ty}px`, y: r.y, h: r.h, w: r.w, x: r.x })), info: { cssRules: css['fade-up-css'].length, blocks: reveal.length } };
    if (reveal.length < 6 && css['fade-up-css'].length < 3) found['fade-up-reveal'].items = [];
    for (const k of ['hover-lift', 'transition-all', 'bounce-ease']) found[k] = { items: css[k].slice(0, 30).map((s) => ({ sel: s, note: 'правило CSS' })), info: { rules: css[k].length } };
    const docArea = P.vw * P.docH;
    const result = { url, viewport: vpName, date: new Date().toISOString(), page: P, open: { attempt: (page.gotoInfo || {}).attempt || 1, waitUntil: (page.gotoInfo || {}).waitUntil || 'networkidle2', overlay: overlay.overlay || null, stuck: !!sc.stuck, reachedBottom: !!sc.reachedBottom }, rules: {} };
    for (const [id, meta] of Object.entries(RULES)) {
      const f = found[id] || { items: [], info: {} };
      const items = f.items || [];
      const rects = items.filter((i) => i.w && i.h).sort((a, b) => b.w * b.h - a.w * a.h);
      const kept = []; for (const r of rects) if (!kept.some((k) => r.x >= k.x - 1 && r.y >= k.y - 1 && r.x + r.w <= k.x + k.w + 1 && r.y + r.h <= k.y + k.h + 1)) kept.push(r);
      const area = kept.reduce((a, r) => a + r.w * r.h, 0);
      const entry = { weight: meta.w, mode: meta.mode, title: meta.t, count: items.length, share: +(area / docArea * 100).toFixed(1), per10kpx: +(items.length / (P.docH / 10000)).toFixed(2), items: items.slice(0, 40), info: f.info || {} };
      if (meta.mode === 'share') entry.classShare = (f.info && f.info.share) || 0;
      result.rules[id] = entry;
    }
    if (keepPage) result._page = page; else await page.close().catch(() => {});
    return result;
  } catch (e) { await page.close().catch(() => {}); throw e; }
}

/* ======================================================================
   Сравнение с базой, запреты, обоснования, вердикт.
   ====================================================================== */
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|-apple-system|blinkmacsystemfont|inherit|initial|emoji|math)$/i;
const famKey = (f) => String(f).toLowerCase().replace(/["'\s_-]+/g, '').replace(/(variable|var|vf|webfont|web)$/, '');
const sameFamily = (a, b) => { const x = famKey(a), y = famKey(b); if (!x || !y) return false; return x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))); };
const ROLE_RU = { heading: 'заголовки', text: 'текст', button: 'кнопки', small: 'мелкое' };
const fontTotals = (fonts) => { const tot = {}; let all = 0; for (const r of Object.values(fonts || {})) for (const [f, n] of Object.entries(r)) { tot[f] = (tot[f] || 0) + n; all += n; } return { tot, all: all || 1 }; };
const topFam = (roleMap) => { const e = Object.entries(roleMap || {}).sort((a, b) => b[1] - a[1]); const s = e.reduce((a, [, n]) => a + n, 0) || 1; return e.slice(0, 2).map(([f, n]) => `${f} ${Math.round(n / s * 100)}%`).join(', '); };
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** Файл обоснований: { правило: { блок: почему } } или [{ rule, block, why }]. → { file, exists, map, bad } */
export function loadDecisions(file) {
  const out = { file, exists: false, map: {}, bad: [] };
  if (!file || !fs.existsSync(file)) return out;
  out.exists = true;
  const j = readJson(file);
  if (!j) { out.bad.push('не читается как JSON'); return out; }
  const list = Array.isArray(j) ? j : Array.isArray(j.decisions) ? j.decisions
    : Object.entries(j).filter(([k]) => !k.startsWith('_')).flatMap(([rule, v]) => (typeof v === 'string' ? [{ rule, block: '*', why: v }] : v && typeof v === 'object' ? Object.entries(v).filter(([b]) => !b.startsWith('_')).map(([block, why]) => ({ rule, block, why: typeof why === 'string' ? why : why && why.why })) : []));
  for (const d of list) {
    if (!d || !d.rule) { out.bad.push('запись без rule'); continue; }
    if (!RULES[d.rule]) { out.bad.push(`неизвестное правило ${d.rule}`); continue; }
    const why = String(d.why || '').trim();
    if (why.length < 8) { out.bad.push(`${d.rule}/${d.block || '*'}: пустое «почему»`); continue; }
    (out.map[d.rule] = out.map[d.rule] || []).push({ block: d.block || '*', why });
  }
  return out;
}

/**
 * Сравнить результат экрана с базой донора, запретами и обоснованиями; дописывает в результат
 * пометки правил (mark, ratio, banned, question, decision), индекс и вердикт.
 * base — результат донора для этого экрана (или null), bans — activeBans(), decisions — loadDecisions().
 */
export function compareResult(result, base, { bans = null, decisions = null, baseExact = true } = {}) {
  const P = result.page; const fail = [], warn = [];
  /* гарнитуры: только с базой */
  const fsw = result.rules['font-swapped'];
  if (base && base.page && base.page.fonts) {
    const S = fontTotals(P.fonts), D = fontTotals(base.page.fonts);
    /* гарнитура донора — любая, которой у него набран видимый текст (Roboto на 28 знаков мелкого — тоже его) */
    const donorFams = Object.entries(D.tot).filter(([, n]) => n > 0).map(([f]) => f);
    const items = [];
    for (const [f, n] of Object.entries(S.tot)) {
      if (GENERIC.test(f)) continue;
      const roles = Object.entries(P.fonts).map(([r, m]) => [r, m[f] ? m[f] / (Object.values(m).reduce((a, b) => a + b, 0) || 1) : 0]).filter(([, s]) => s >= 0.15);
      if (n / S.all < 0.05 && !roles.length) continue;
      if (donorFams.some((d) => sameFamily(f, d))) continue;
      const where = roles.map(([r, s]) => `${ROLE_RU[r]} ${Math.round(s * 100)}%`).join(', ');
      const donorSame = roles.map(([r]) => `${ROLE_RU[r]}: ${topFam(base.page.fonts[r]) || '—'}`).join('; ');
      items.push({ sel: 'font-family', note: `${f} — ${Math.round(n / S.all * 100)}% текста${where ? ` (${where})` : ''}; у донора ${donorSame || 'такой гарнитуры нет'}` });
    }
    fsw.items = items; fsw.count = items.length; fsw.per10kpx = +(items.length / (P.docH / 10000)).toFixed(2);
    fsw.info = { donorFamilies: donorFams.slice(0, 8) };
  } else if (fsw) { fsw.items = []; fsw.count = 0; fsw.info = { note: 'нужна база донора' }; }

  let index = 0;
  const banConflicts = new Set(base && bans ? conflictsWith(bans, base).map((c) => c.rule) : []);
  for (const [id, e] of Object.entries(result.rules)) {
    delete e.mark; delete e.ratio; delete e.banned; delete e.question; delete e.decision; delete e.allowed; delete e.counts; delete e.donorNote;
    const d = base && base.rules ? base.rules[id] || { count: 0 } : null;
    if (!e.count) { if (d && d.count) e.donorNote = `у донора есть (${d.count}), здесь нет`; continue; }
    /* пометка относительно донора */
    if (!d) e.mark = 'без базы';
    else if (id === 'font-swapped') e.mark = 'НЕТ У ДОНОРА';
    else if (id === 'accent-added') {
      const dh = ((d.info && d.info.accents) || []).filter((a) => a.hue !== null).map((a) => a.hue);
      const mine = (e.info.accents || []);
      const alien = mine.filter((a) => a.hue === null || !dh.some((h) => hueDist(h, a.hue) <= 30));
      if (!alien.length) e.mark = 'есть у донора';
      else { e.mark = 'НЕТ У ДОНОРА'; e.donorNote = dh.length ? `у донора акцент другого цвета: ${(d.info.accents || []).map((a) => a.hex).join(', ')}` : 'у донора насыщенного цвета на кнопках и метках нет'; }
    } else if (!d.count) e.mark = 'НЕТ У ДОНОРА';
    else if (e.mode === 'length') {
      const ratio = d.per10kpx ? e.per10kpx / d.per10kpx : Infinity;
      e.ratio = +ratio.toFixed(2);
      e.donorNote = `у донора ${d.count} на ${base.page.docH} px (${d.per10kpx} на 10 000), здесь ${e.count} на ${P.docH} px (${e.per10kpx})`;
      e.mark = e.count > d.count && ratio > 2 ? 'размножено' : 'есть у донора';
    } else if (e.mode === 'share') {
      const di = d.info || {};
      const ds = d.classShare || di.share || (di.buttons ? di.pills / di.buttons : 0) || (di.boxes ? di.mid / di.boxes : 0); const ratio = ds ? (e.classShare || 0) / ds : Infinity;
      e.ratio = +ratio.toFixed(2);
      e.donorNote = id === 'pill-everywhere' ? `пилюль среди кнопок: у донора ${Math.round(ds * 100)}% (${(d.info || {}).pills}/${(d.info || {}).buttons}), здесь ${Math.round((e.classShare || 0) * 100)}% (${e.info.pills}/${e.info.buttons})` : `доля в классе: у донора ${Math.round(ds * 100)}%, здесь ${Math.round((e.classShare || 0) * 100)}%`;
      e.mark = ratio > 2 ? 'размножено' : 'есть у донора';
    } else e.mark = 'есть у донора';
    if (e.mark === 'есть у донора' && !e.donorNote && d) e.donorNote = `у донора ${d.count}`;
    /* запрет пользователя */
    const ban = bans && bans[id];
    if (ban) {
      const donorUrl = base && base.url;
      if (donorUrl && ban.allowedFor && ban.allowedFor.includes(donorUrl)) e.allowed = `запрет «${ban.quote}» снят пользователем для этого донора`;
      else if (banConflicts.has(id)) { e.question = `запрет пользователя (${ban.date}) «${ban.quote}» спорит с чертой донора (у донора ${d.count}) — спросить: держится ли запрет для этого донора`; warn.push(`${id}: ВОПРОС пользователю — запрет спорит с донором`); }
      else { e.banned = `ЗАПРЕЩЁН пользователем (${ban.date}${ban.block ? ', ' + ban.block : ''}): «${ban.quote}»`; fail.push(`${id}: ЗАПРЕЩЁН пользователем`); }
    }
    /* обоснование */
    const dec = decisions && decisions.map[id];
    if (dec && dec.length) e.decision = dec;
    const counted = e.mark !== 'есть у донора';
    e.counts = counted || !!e.banned;
    if (counted) index += e.weight;
    if (e.banned) index += e.weight;
    if (e.mark === 'НЕТ У ДОНОРА' && !e.decision) (e.weight >= 3 ? fail : warn).push(`${id}: вес ${e.weight}, НЕТ У ДОНОРА без обоснования`);
    if (e.mark === 'размножено') (e.weight >= 2 ? fail : warn).push(`${id}: размножено ×${e.ratio} (порог ×2)`);
    if (e.mark === 'без базы' && e.weight >= 3 && !e.decision) warn.push(`${id}: вес 3 (без базы — сравнить не с чем)`);
  }
  if (!base) warn.push('нет --baseline: вердикт только по запретам и весу 3');
  else if (!baseExact) warn.push(`база снята на другом экране (${base.viewport}) — частоты и доли неточны`);
  if (result.open && result.open.stuck) warn.push('страница не прокрутилась — появления и нижние блоки недостоверны');
  result.index = index;
  result.reasons = { fail, warn };
  result.verdict = fail.length ? 'FAIL' : warn.length ? 'WARN' : 'OK';
  return result;
}

/* ---------- печать ---------- */
const ORDER = (e) => (e.banned ? 0 : e.mark === 'НЕТ У ДОНОРА' && e.weight >= 3 ? 1 : e.mark === 'размножено' ? 2 : e.question ? 3 : e.mark === 'НЕТ У ДОНОРА' ? 4 : e.mark === 'без базы' ? 5 : 6);
export function printResult(r, { log = console.log } = {}) {
  const P = r.page;
  log(`\nШаблонность: ${r.url} · ${r.viewport} ${P.vw}×${P.vh} · страница ${P.docH} px · секций ${P.sections}` + (r.open && r.open.attempt > 1 ? ` · открылась с ${r.open.attempt}-й попытки (${r.open.waitUntil})` : ''));
  log(`база: ${r.baseline ? `${r.baseline.url} (${r.baseline.viewport}${r.baseline.exact ? '' : ', ДРУГОЙ ЭКРАН'})` : 'нет'} · журнал вкуса: ${r.taste ? `${r.taste.bans.length} запрет(ов)${r.taste.bans.length ? ' — ' + r.taste.bans.join(', ') : ''}` : 'не подключён'} · обоснования: ${r.decisions ? `${r.decisions.file}${r.decisions.exists ? ` (${r.decisions.rules} правил)` : ' (файла нет)'}` : '—'}`);
  const hit = Object.entries(r.rules).filter(([, e]) => e.count).sort((a, b) => ORDER(a[1]) - ORDER(b[1]) || b[1].weight - a[1].weight || b[1].share - a[1].share);
  log(`индекс ${r.index ?? '—'} · сработало правил ${hit.length}, в счёт ${hit.filter(([, e]) => e.counts).length}\n`);
  for (const [id, e] of hit) {
    const mark = e.mark === 'размножено' ? `размножено ×${e.ratio}` : e.mark || '';
    const tags = [mark, e.banned ? '✗ ' + e.banned : '', e.question ? '? ВОПРОС: ' + e.question : '', e.allowed || '', e.decision ? `обосновано: ${e.decision.map((x) => `${x.block} — ${x.why}`).join(' | ').slice(0, 140)}` : ''].filter(Boolean);
    log(`${e.counts ? WMARK[e.weight] : '···'} ${id.padEnd(20)} ${String(e.count).padStart(3)} шт ${String(e.share).padStart(5)}% стр.  ${tags.join(' · ')}`);
    log(`    ${e.title}` + (e.donorNote ? `  [${e.donorNote}]` : ''));
    const uniq = []; for (const i of e.items) { const s = `${i.sel}${i.note ? ' — ' + i.note : ''}`; if (!uniq.includes(s)) uniq.push(s); }
    uniq.slice(0, 4).forEach((s) => log(`    · ${s.slice(0, 180)}`));
    if (uniq.length > 4) log(`    · … ещё ${uniq.length - 4}`);
  }
  const gone = Object.entries(r.rules).filter(([, e]) => !e.count && e.donorNote).map(([id]) => id);
  if (gone.length) log(`\nу донора есть, здесь нет: ${gone.join(', ')}`);
  const info = (id) => (r.rules[id] || {}).info || {};
  const pe = info('pill-everywhere'); const ac = info('accent-added').accents || [];
  const fontsLine = Object.entries(P.fonts || {}).filter(([, m]) => Object.keys(m).length).map(([k, m]) => `${ROLE_RU[k]}: ${topFam(m)}`).join('; ');
  log(`\nсправка: кнопок ${pe.buttons}, пилюль ${pe.pills} (${Math.round((pe.share || 0) * 100)}%); скругления ${JSON.stringify(info('uniform-radius').hist)}; разрядка ≥0.05em у ${P.spacedAll} элементов; мелкий текст <12px: ${P.fine}; акцент: ${ac.length ? ac.map((a) => `${a.hex}×${a.count}`).join(', ') : 'нет'}`);
  const seq = info('alternating-bands').sequence || [];
  log(`         фоны секций ${seq.length > 12 ? `${seq.length}: ${JSON.stringify(seq.slice(0, 12))} …` : JSON.stringify(seq)}; гарнитуры — ${fontsLine}`);
  if ((info('ai-palette').skipped || []).length) log(`         ai-palette не засчитан: ${info('ai-palette').skipped.join('; ')}`);
  if (r.verdict) {
    log(`\n${r.verdict.padEnd(4)} ${r.viewport}: индекс ${r.index}` + (r.reasons.fail.length ? `\n  FAIL: ${r.reasons.fail.join('\n  FAIL: ')}` : '') + (r.reasons.warn.length ? `\n  WARN: ${r.reasons.warn.join('\n  WARN: ')}` : ''));
  }
}

/* ---------- снимок с обводкой ---------- */
async function shotMarks(page, r, file) {
  /* лёгкие правила рисуются первыми, тяжёлые и запрещённые — поверх, чтобы их подписи не закрывались */
  const marks = Object.entries(r.rules).filter(([, e]) => e.counts).flatMap(([id, e]) => e.items.filter((i) => i.w && i.h).map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h, id, wt: e.weight, ban: !!e.banned })))
    .sort((a, b) => (a.ban - b.ban) || (a.wt - b.wt) || (b.w * b.h - a.w * a.h));
  await page.evaluate((list) => {
    const layer = document.createElement('div'); layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;pointer-events:none;z-index:2147483647';
    const colr = { 3: '#FF2D2D', 2: '#FF9900', 1: '#00B3FF' };
    for (const m of list) { const d = document.createElement('div'); const c = m.ban ? '#FF00D4' : colr[m.wt]; d.style.cssText = `position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;outline:4px solid ${c};outline-offset:-2px`; const l = document.createElement('span'); l.textContent = m.id + (m.ban ? ' ✗' : ''); l.style.cssText = `position:absolute;left:0;top:0;background:${c};color:#000;font:700 14px/1.2 monospace;padding:1px 5px;white-space:nowrap`; d.appendChild(l); layer.appendChild(d); }
    document.body.appendChild(layer);
    document.querySelectorAll('body *').forEach((e) => { if (e !== layer && getComputedStyle(e).position === 'fixed') e.style.setProperty('position', 'absolute', 'important'); });
  }, marks);
  const dpr = (page.viewport() || {}).deviceScaleFactor || 1;
  const h = Math.min(r.page.docH, Math.floor(16000 / dpr));
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: r.page.vw, height: h }, captureBeyondViewport: true });
  return { file, marks: marks.length, height: h, cut: h < r.page.docH };
}

/* ======================================================================
   Командная строка
   ====================================================================== */
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['shot', 'strict', 'help', 'h'], values: ['baseline', 'viewport', 'viewports', 'run', 'out', 'decisions'] });
  const isUrl = (s) => /^(https?|file):/i.test(String(s));
  /* «--taste http://…» — адрес, а не папка журнала */
  if (typeof opt.taste === 'string' && isUrl(opt.taste)) { pos.push(opt.taste); opt.taste = true; }
  const die = (msg, code = 2) => { console.error(`FAIL  ${msg}`); process.exit(code); };
  const cmd = pos[0];

  if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
  if (cmd === 'rules') {
    if (opt.json) { console.log(JSON.stringify({ rules: RULES, modes: MODES }, null, 1)); process.exit(0); }
    console.log('id                    вес  режим   приём');
    for (const [id, m] of Object.entries(RULES)) console.log(`${id.padEnd(22)}${String(m.w).padEnd(5)}${m.mode.padEnd(8)}${m.t}`);
    console.log(`\nрежимы: ${Object.entries(MODES).map(([k, v]) => `${k} — ${v}`).join('; ')}`);
    console.log(`всего ${Object.keys(RULES).length}`);
    process.exit(0);
  }
  if (!pos.length) { console.log(HELP); process.exit(2); }
  /* --viewports — синоним --viewport (как в discover, a11y, perf): раньше молча пропускался, и прогон шёл
     на экранах по умолчанию. Без списка, с неизвестным экраном или оба с разными списками — код 2
     (неверные аргументы), а не 1, как у pickViewports: 1 у cliche — это FAIL шаблонности */
  for (const k of ['viewport', 'viewports']) if (opt[k] === true || (typeof opt[k] === 'string' && (!opt[k].trim() || opt[k].startsWith('--')))) die(`--${k}: нужен список экранов через запятую, например desktop,mobile`);
  if (opt.viewport !== undefined && opt.viewports !== undefined && String(opt.viewport).trim() !== String(opt.viewports).trim()) die(`заданы и --viewport ${opt.viewport}, и --viewports ${opt.viewports} — это один флаг, оставьте один`);
  const vpSpec = opt.viewport ?? opt.viewports;
  if (vpSpec) { const bad = vpSpec.split(',').map((x) => x.trim()).filter((x) => x && !parseViewport(x)); if (bad.length) die(`неизвестные экраны: ${bad.join(', ')} — есть desktop, laptop, tablet, mobile, mobile-s, android или ШxВ@плотность (320x568@2)`); }

  const baselineMode = cmd === 'baseline';
  const url = baselineMode ? pos[1] : pos[0];
  if (!url || !isUrl(url)) die(`нужен адрес страницы (http://, https:// или file://), получено: ${url || 'ничего'}`);

  /* база */
  let baseJson = null; let baseFile = null;
  if (!baselineMode && opt.baseline) {
    if (opt.baseline === true) die('--baseline без файла');
    baseFile = path.resolve(String(opt.baseline));
    if (!fs.existsSync(baseFile)) die(`нет файла базы ${baseFile}`);
    baseJson = readJson(baseFile);
    if (!baseJson || !(baseJson.viewports || baseJson.rules)) die(`${baseFile}: это не результат cliche.mjs (нет viewports/rules)`);
  }
  const vpList = vpSpec || (baselineMode ? 'desktop,mobile' : baseJson && baseJson.viewports ? Object.keys(baseJson.viewports).join(',') : 'desktop');
  const vpSeen = new Set();
  const vps = pickViewports(vpList).filter(([n]) => !vpSeen.has(n) && vpSeen.add(n));
  if (!vps.length) die('пустой список экранов');

  /* журнал вкуса и обоснования */
  let bans = null; let tdir = null;
  if (!baselineMode && opt.taste) {
    tdir = tasteDir(opt.taste === true ? null : opt.taste);
    if (opt.taste !== true && !fs.existsSync(tdir)) die(`нет папки журнала ${tdir}`);
    const j = readJournal(tdir);
    if (j.bad.length) console.error(`WARN  журнал ${tdir}: битых строк ${j.bad.length} — пропущены`);
    bans = activeBans(j);
  }
  /* папка прогона без --run: от файла базы вверх (до 3 уровней) — где лежит state.json или
     authorship-decisions.json; SKILL.md кладёт базу в <папка>/ или <папка>/donor/ */
  const inferRun = () => {
    if (!baseFile) return null;
    let d = path.dirname(baseFile);
    for (let i = 0; i < 3; i++) {
      if (fs.existsSync(path.join(d, 'authorship-decisions.json')) || fs.existsSync(path.join(d, 'state.json'))) return d;
      const up = path.dirname(d); if (up === d) break; d = up;
    }
    return null;
  };
  const run = baselineMode ? null : path.resolve(String(opt.run && opt.run !== true ? opt.run : opt.out && opt.out !== true ? opt.out : inferRun() || runDir({}, url)));
  const decFile = baselineMode ? null : path.resolve(String(opt.decisions && opt.decisions !== true ? opt.decisions : path.join(run, 'authorship-decisions.json')));
  if (opt.decisions && opt.decisions !== true && !fs.existsSync(decFile)) die(`нет файла обоснований ${decFile}`);
  const decisions = baselineMode ? null : loadDecisions(decFile);
  if (decisions && decisions.bad.length) console.error(`WARN  ${decFile}: ${decisions.bad.join('; ')}`);

  const toStdout = opt.json === '-';
  const log = toStdout ? (...a) => console.error(...a) : (...a) => console.log(...a);
  let browser;
  try { browser = await launch(); } catch (e) { die(`браузер не запустился: ${e.message}`, 3); }
  const results = {};
  let code = 0; let fatal = null;
  try {
    for (const [vpName, vp] of vps) {
      log(`… ${vpName}: открываю ${url}`);
      let r;
      try { r = await measureViewport(browser, url, vpName, vp, { keepPage: !!opt.shot && !baselineMode }); }
      catch (e) { fatal = `${vpName}: страница не открылась или упала — ${String(e && e.message || e).slice(0, 200)}. Для медленного донора подождать и повторить`; break; }
      const page = r._page; delete r._page;
      if (!baselineMode) {
        const base = baseJson ? baselineResult(baseJson, vpName, vp) : null;
        const exact = !base || base.viewport === vpName;
        compareResult(r, base, { bans, decisions, baseExact: exact });
        r.baseline = base ? { file: baseFile, url: base.url, viewport: base.viewport, exact } : null;
        r.taste = bans ? { dir: tdir, bans: Object.keys(bans) } : null;
        r.decisions = { file: decFile, exists: decisions.exists, rules: Object.keys(decisions.map).length };
        if (opt.shot && page) {
          const sf = path.join(run, 'cliche', `cliche-${vpName}.png`); ensureDir(path.dirname(sf));
          try { r.shot = await shotMarks(page, r, sf); } catch (e) { r.shot = { error: String(e.message || e).slice(0, 160) }; }
          await page.close().catch(() => {});
        }
        printResult(r, { log });
        if (r.shot) log(r.shot.file ? `снимок: ${r.shot.file} (обводок ${r.shot.marks}${r.shot.cut ? `, обрезан на ${r.shot.height} px` : ''})` : `WARN снимок не сделан: ${r.shot.error}`);
      } else {
        const hit = Object.entries(r.rules).filter(([, e]) => e.count);
        const pe = r.rules['pill-everywhere'].info; const ac = r.rules['accent-added'].info.accents || [];
        log(`${vpName} ${r.page.vw}×${r.page.vh}, страница ${r.page.docH} px: черт донора ${hit.length} — ${hit.map(([id, e]) => `${id}×${e.count}`).join(', ') || 'нет'}`);
        log(`  кнопок ${pe.buttons}, пилюль ${pe.pills}; скругления ${JSON.stringify(r.rules['uniform-radius'].info.hist)}; разрядка у ${r.page.spacedAll}; мелкий текст <12px: ${r.page.fine}; акцент: ${ac.length ? ac.map((a) => `${a.hex}×${a.count}`).join(', ') : 'нет'}`);
        log(`  гарнитуры — ${Object.entries(r.page.fonts).filter(([, m]) => Object.keys(m).length).map(([k, m]) => `${ROLE_RU[k]}: ${topFam(m)}`).join('; ')}`);
      }
      results[vpName] = r;
    }
  } finally { await browser.close().catch(() => {}); }
  if (fatal) die(fatal, 3);

  if (baselineMode) {
    let out = opt.out && opt.out !== true ? path.resolve(String(opt.out)) : path.join(runDir({}, url), 'cliche', 'cliche-baseline.json');
    if (!/\.json$/i.test(out)) out = path.join(out, 'cliche-baseline.json');
    writeJson(out, { kind: 'cliche-baseline', version: 2, url, date: new Date().toISOString(), viewports: results });
    log(`\nOK   база донора → ${out}\n     дальше: node cliche.mjs <сайт> --baseline "${out}" --taste`);
  } else {
    const verdicts = Object.values(results).map((r) => r.verdict);
    const total = verdicts.includes('FAIL') ? 'FAIL' : verdicts.includes('WARN') ? 'WARN' : 'OK';
    const doc = { kind: 'cliche', version: 2, url, date: new Date().toISOString(), baseline: baseFile, verdict: total, viewports: results };
    if (toStdout) process.stdout.write(JSON.stringify(doc, null, 1) + '\n');
    else {
      const jf = opt.json && opt.json !== true ? path.resolve(String(opt.json)) : path.join(run, 'cliche', 'cliche.json');
      writeJson(jf, doc);
      const label = /^file:/i.test(url) ? decodeURIComponent(path.basename(new URL(url).pathname)) : slugFromUrl(url);
      log(`\n${total.padEnd(4)} шаблонность ${label}: ${Object.entries(results).map(([k, r]) => `${k} ${r.verdict} (индекс ${r.index})`).join(', ')}`);
      log(`json: ${jf}`);
      if (total === 'FAIL' && Object.values(results).some((r) => r.reasons.fail.some((x) => /без обоснования/.test(x)))) log(`обоснование: ${decFile} — { "правило": { "блок": "какое правило донора или задача блока" } }`);
    }
    code = total === 'FAIL' ? 1 : 0;
  }
  process.exit(code);
}
