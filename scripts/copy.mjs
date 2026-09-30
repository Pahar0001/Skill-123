#!/usr/bin/env node
/**
 * Тексты сайта: штампы, канцелярит, «ИИ-ритм», жаргон, забытые заполнители и придуманное (числа без
 * источника, текст под copy:stub — список для владельца); типограф; пары «было → стало» для отчёта. Голос у
 * каждого бизнеса свой: скрипт ловит штампы, канцелярит и заполнители во всех текстах, но тон не выравнивает —
 * кофейня теплее студии, «ты» у барбершопа и «я» у мастера находкой не считаются. Как писать —
 * reference/copy.md, правила и словари — scripts/copy-rules.mjs.
 *
 *   node copy.mjs lint <файл|папка|url> [--pages "/,/about"] [--viewport mobile] [--out <прогон>] [--tag after]
 *        [--facts <facts.json>] [--baseline <before.json|папка|url>] [--no-facts] [--donor <donor.json|папка|url>]
 *        [--allow <copy.allow.json>] [--taste] [--run <прогон>] [--invent] [--all] [--quiet] [--json <файл>|-]
 *   node copy.mjs snapshot <url|папка|файл> --out <прогон> [--pages "/,/about"] [--tag before|donor]
 *   node copy.mjs pairs <до> <после> [--md] [--all] [--limit N] [--json <файл>|-]
 *   node copy.mjs fix --typograph <файл|папка|-> [--write | --out <файл>] [--diff] [--limit N]
 *        [--nbsp entity|char] [--role h1] [--html] [--out-dir <прогон>] [--tag fix]
 *   node copy.mjs rules [--json]
 *   node copy.mjs selftest [--no-browser]        (то же: --selftest)
 *   node copy.mjs --help
 *
 * lint — находки по страницам. FAIL — выкладывать нельзя: незаполненное (copy-todo: [уточнить: …], [цена],
 *   TODO, XXX, Lorem ipsum, {{X}} кроме разрешённых), текст донора, запрет журнала вкуса. Придуманное —
 *   WARN «в список для владельца» (с --invent — подсказка), итог из-за него не FAIL: заявление без источника
 *   (copy-unverified), текст под пометкой copy:stub. WARN — переписать или записать причину: штамп, пустая
 *   оценка, «не просто X, а Y», подводка, риторический вопрос, оправдания, канцелярит, калька, жаргон, тройка,
 *   два тире, восклицание, кнопка без действия, заголовок-лозунг… NOTE — подсказка, в вердикт не идёт.
 *   Полный каталог — команда rules. Пустые кнопки и ссылки без имени — a11y.mjs.
 *   Файл и папка разбираются без браузера: роли — из разметки (h1–h6, lead, text, li, button, label,
 *   faq-q, faq-a, caption, nav, footer, title); атрибуты alt, placeholder, aria-label, meta description,
 *   og:title, og:description и value кнопок — отдельными прогонами attr:<имя> (типограф их не трогает).
 *   Адрес (http, https, file) — браузер: страница такой, какой её видит человек, со всем, что дорисовал
 *   JS (демо-сайты Vanta берут тексты из базы); блочность и скрытость — из вычисленных стилей. Окно, которое
 *   SITE_REWORK_DISMISS закрыл выбором, увело на другую страницу (mamuka.rest/menu → главная) — адрес открывается
 *   заново (строка INFO), иначе в снимок шли бы тексты чужой страницы.
 *   Факты: цена, процент, срок, счётчик, гарантия, ранг ищутся в facts.json (записи с source) и в
 *   текстах сайта «до» (--baseline). Не нашлось — придумано: WARN copy-unverified «в список для владельца»
 *   (с --invent — подсказка). Сверять не с чем (ни facts.json, ни снимка «до») — придуманным считается всякое
 *   заявление. С --out список придуманного (заявления и copy:stub) пишется в <прогон>/copy/invented.json:
 *   записи проверенных страниц с by "copy.mjs" заменяются, записи руками и других страниц остаются. Только для
 *   разведки чужого сайта (донор, этап 1 без снимка) — --no-facts: заявления подсказками, WARN copy-unchecked на
 *   страницу, список не пишется.
 *   «X, а не Y» — одно на странице допустимо (подсказка), со второго — WARN.
 *   Страницы нет в снимке «до» (он снят с других страниц; и когда с каждой стороны по одной странице с разными
 *   именами) — WARN copy-unchecked «нет снимка «до» для <путь> — в список придуманного могли попасть факты с
 *   сайта «до»» с командой снять снимок и с неё, в итоге — «без снимка «до»: <страницы>».
 *   Подпись автора фото — по строению, а не по одному слову: «Фото:», «Photo by», «©» в начале или элемент подписи
 *   (small, figcaption, *credit*) с лицензией или фотобанком, остальное — только имя автора («Фото: … · CC BY-SA 4.0 ·
 *   Wikimedia Commons», «Фото: …, бесплатная лицензия Pexels»). Не повтор, лицензия в ней не заявление; фотобанк в
 *   обычном абзаце («…, фото с Unsplash.») подписью его не делает — заявления сверяются. Одна подпись у нескольких
 *   фото — подсказка «проверить, не один ли кадр». Обязательные строки под карточками («алкоголь вредит здоровью», «может отличаться от фото») —
 *   не повтор. Заголовок судится целиком: скрытый span внутри h1 (в браузере блочный) — часть фразы.
 *   «лучший» в условии конкурса («приз за лучший номер») — не пустая оценка.
 * snapshot — все тексты сайта «до» или донора с ролями → <прогон>/copy/<tag>.json: база фактов для
 *   --baseline, основа для --donor, левая сторона для pairs.
 * pairs — «было → стало» по странице, роли и порядку; изменённое — по сходству слов (от 0.4). Новые
 *   числа и обещания помечаются: своё — источник в facts.json, придуманное — в список для владельца. <до> и
 *   <после> — протокол snapshot или lint (.json), файл, папка или адрес. --md — готовый список для отчёта.
 * fix --typograph — неразрывные пробелы после коротких слов, перед тире, в числах, телефонах, «ул.»,
 *   инициалах; «—» между словами, «–» в диапазонах, «−», «×», «ёлочки» и „лапки“, «…» — только
 *   в текстовых узлах. ПО УМОЛЧАНИЮ НИЧЕГО НЕ ПИШЕТ: печатает счёт по правилам и «было / стало»
 *   (неразрывный пробел — «~»). Записать — только явно: --write (на месте) или --out <файл>.
 *   Разметка сверяется байт в байт, повторный проход обязан дать 0 правок — иначе FAIL, и файл
 *   не пишется. «-» — строка из stdin (тексты из базы и админки): печатает результат для панели.
 *   После записи — снимки 320 px, знаки « » „ “ — – − × № ₽ … в шрифте, документ под печать —
 *   пересобрать и пересчитать листы.
 *
 * Флаги:
 *   --pages "/,/a"      адрес: пути от адреса; папка: /a → a.html, a/index.html или a
 *   --viewport <экран>  адрес: экран (mobile по умолчанию; desktop, laptop, tablet, mobile-s, 320x568@2)
 *   --out <прогон>      папка прогона: протокол <прогон>/copy/<tag>.json и список придуманного
 *                       copy/invented.json; оттуда же по умолчанию copy/facts.json, copy/before.json (сайт
 *                       «до»), copy/donor.json, copy.allow.json.
 *                       fix: файл, куда записать результат (исходник не трогается)
 *   --run <прогон>      папка прогона для --taste и файлов по умолчанию, если нет --out
 *   --tag <имя>         имя протокола: lint — lint (after, base…), snapshot — before, fix — fix
 *   --facts <файл>      facts.json — своё от владельца: [{ "fact": "20 000 ₽", "what": "…", "source": "бриф 28.09" }];
 *                       запись без source — WARN: фактом не считается (source или перенести в invented.json)
 *   --baseline <откуда> тексты сайта «до»: протокол snapshot или lint, папка, файл или адрес
 *   --no-facts          не сверять факты (разведка чужого сайта): подсказки и WARN copy-unchecked; список
 *                       придуманного не пишется
 *   --invent            анкета: контент «нет — сделай сам» — придуманное (заявления без источника, copy:stub)
 *                       подсказкой, а не WARN; список для владельца пишется так же
 *   --donor <откуда>    тексты донора (snapshot --tag donor, папка, адрес): 8 слов подряд — FAIL
 *   --allow <файл>      copy.allow.json: { brand, words, phrases, rules: { правило: [фразы] }, off, templates }
 *   --taste             журнал вкуса (taste.mjs, activeBans): запрет пользователя по правилу copy-*
 *                       поднимает WARN → FAIL, подсказку → WARN; принято пользователем — WARN →
 *                       подсказка; свой отсев (by self) — только пометка. Прогон — --run или --out
 *   --taste-dir <папка> журнал вкуса, если не ~/.claude/site-rework/taste (или SITE_REWORK_TASTE)
 *   --all               печатать и подсказки (NOTE); pairs — и неизменённые тексты
 *   --quiet             только строки страниц и итог
 *   --json <файл>|-     протокол ещё и в файл; «-» — в stdout (вывод для человека тогда в stderr)
 *   --md                pairs: markdown-список для «Тексты "было → стало"» отчёта
 *   --limit N           fix: сколько пар «было / стало» показать на файл (25); pairs — на страницу (40)
 *   --write             fix: записать на месте (без него — только показать)
 *   --dry-run           fix: только показать — так и по умолчанию; вместе с --write или --out — ошибка
 *   --diff              fix: построчный дифф исходника вместо пар по прогонам
 *   --nbsp entity|char  fix: &nbsp; (по умолчанию в файлах) или сам знак U+00A0 (по умолчанию для stdin)
 *   --role <роль>       fix -: роль строки (h1, h2 — короче предел склейки неразрывных, title — без пробелов)
 *   --html              fix -: строка из stdin — фрагмент HTML, а не простой текст
 *   --out-dir <прогон>  fix: протокол <прогон>/copy/typo-<tag>.json
 *   --no-browser        selftest: без проверки режима адреса (браузер не запускается)
 *   --help, -h          эта справка
 *
 * Разметка: data-copy-allow="copy-buzz copy-contrast" снимает правила внутри элемента (all — все);
 *   data-copy="stub" [data-copy-note="что придумано"] или <!-- copy:stub что придумано -->…<!-- /copy:stub -->
 *   — пометка придуманного без чисел (история, имя, отзыв), не блокировка: WARN «в список для владельца»
 *   (с --invent — подсказка), строка в copy/invented.json; комментарий со словами ЗАГЛУШКА, ПРИДУМАНО,
 *   ЛЕГЕНДА, уточнить помечает следующий за ним элемент так же;
 *   data-copy="legal" — юридический текст: только заполнители (сам он узнаётся и по словарю);
 *   data-typo="off", class="notypo", translate="no", contenteditable — типограф не трогает.
 *
 * Протокол lint (lib.writeJson, поле generator): { tool: "copy", mode, source, url|path, startedAt,
 *   viewport, verdict, options, totals: { pages, words, fail, warn, note, index, indexBase, facts,
 *   factsNoSource, stubs, invented, inventedList }, steps: [{ what, status, words, fail, warn, note, index,
 *   byRule }], findings: [{ page, rule, sev, w, line, role, path, quote, match, suggest, kind, invented, taste }],
 *   pages: [{ what, runs: [{ role, line, text }] }] }. Шаг на страницу — доказательство для
 *   state.mjs … --evidence <прогон>/copy/after.json#<часть имени страницы>; протокол с FAIL
 *   state.mjs не примет. Индекс = Σ весов WARN и FAIL × 1000 / слов (страница короче 30 слов — без
 *   индекса; придуманное веса не имеет — его считает totals.invented); ориентиры: одобренные тексты 0–1.5,
 *   до вычитки 2–6, до ревью 5–12, стенд с ошибками 16.
 * Список придуманного copy/invented.json: [{ page, what, text, quote, by: "copy.mjs", tag, note? }]; запись
 *   руками — { what, text, page?, note? } без by "copy.mjs" (имя мастера, отзыв, адрес, телефон, награда).
 *
 * Код выхода: 0 — OK или WARN; 1 — FAIL, неверные аргументы, страница не открылась, провал selftest.
 * Без команды («copy.mjs <url|файл> …») — код 1 и «нужна команда: lint|snapshot|…» с готовой строкой lint.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, writeJson, launch, openPage, gotoRetry, waitForOverlay, pagesFrom, resolveViewport, unmangle } from './lib.mjs';
import {
  RULES, TYPO_RULES, lintRuns, indexOf, claimsOf, factIndex, confirmed, donorShingles, typographRun, lockedOf,
  collapse, clip, words, buzzSource, isCredit, norm,
} from './copy-rules.mjs';
import { tasteDir, readJournal, activeBans, isUserWord, appliesTo, runName } from './taste.mjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const FIXTURES = path.join(HERE, 'fixtures', 'copy');
const HELP = fs.readFileSync(SELF, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');

/* =====================================================================
   Разбор HTML без зависимостей: токены, прогоны по блокам, сущности
   Правки типографа — посимвольные операции над раскодированным текстом; у каждого символа есть
   исходный отрезок байтов, всё вне текстовых узлов остаётся байт в байт.
   ===================================================================== */
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
/* содержимое — сырой текст до </name> */
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
/* текст внутри не читается и не правится */
const EXCLUDE = new Set(['script', 'style', 'pre', 'textarea', 'svg', 'math', 'template', 'noscript', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext', 'object', 'canvas', 'video', 'audio']);
/* строчный код: предложение не рвётся, типограф код не трогает, проверка видит на его месте «￼» */
const CODE = new Set(['code', 'kbd', 'samp', 'var', 'tt']);
/* граница прогона: блок, кнопка, подпись; в режиме адреса ещё data-copy-b (блочный по вычисленному стилю) */
const BLOCK = new Set(('address article aside blockquote body button caption dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html label legend li main nav ol optgroup option output p section select summary table tbody td tfoot th thead title tr ul img input').split(' '));
const NAMED = { nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', thinsp: '\u2009', ensp: ' ', emsp: ' ', shy: '­', copy: '©', reg: '®', trade: '™', times: '×', minus: '−', deg: '°', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bdquo: '„', sbquo: '‚', numero: '№', middot: '·', bull: '•', larr: '←', rarr: '→', uarr: '↑', darr: '↓', zwnj: '‌', zwj: '‍', NonBreakingSpace: '\u00a0', rub: '₽', euro: '€', sect: '§', plusmn: '±', frac12: '½' };
const OPAQUE = '￼';   /* неизвестная сущность и строчный код — «предмет», не буква и не пробел */
const ASTRAL = '';   /* символ вне BMP (эмодзи) в тексте типографа: один знак на исходный отрезок */
const PARA = '\u2029';     /* граница пункта в тексте проверки (см. runsOf) */

/** Токены: { type: text|tag|comment|decl|raw|rcdata, s, e, name?, close?, attrs? } — s/e по исходной строке. */
export function tokenize(html) {
  const out = []; let i = 0; const n = html.length; let textStart = 0;
  const pushText = (s, e) => { if (e > s) out.push({ type: 'text', s, e }); };
  while (i < n) {
    if (html[i] !== '<') { i++; continue; }
    const c1 = html[i + 1] || '';
    if (html.startsWith('<!--', i)) {
      pushText(textStart, i);
      const end = html.indexOf('-->', i + 4); const e = end < 0 ? n : end + 3;
      out.push({ type: 'comment', s: i, e }); i = e; textStart = i; continue;
    }
    if (c1 === '!' || c1 === '?') {
      pushText(textStart, i);
      const end = html.indexOf('>', i); const e = end < 0 ? n : end + 1;
      out.push({ type: 'decl', s: i, e }); i = e; textStart = i; continue;
    }
    const close = c1 === '/';
    const nameStart = close ? i + 2 : i + 1;
    if (!/[A-Za-z]/.test(html[nameStart] || '')) { i++; continue; }
    pushText(textStart, i);
    let j = nameStart; while (j < n && /[A-Za-z0-9:-]/.test(html[j])) j++;
    const name = html.slice(nameStart, j).toLowerCase();
    let q = null; let k = j;
    for (; k < n; k++) { const ch = html[k]; if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') break; }
    const e = Math.min(n, k + 1);
    const tok = { type: 'tag', s: i, e, name, close };
    if (!close) { const src = html.slice(j, k); tok.attrs = parseAttrs(src); tok.selfClosing = /\/\s*$/.test(src); }
    out.push(tok); i = e; textStart = i;
    if (!close && RAW.has(name) && !tok.selfClosing) {
      const re = new RegExp(`</${name}[\\s>/]`, 'ig'); re.lastIndex = i;
      const m = re.exec(html); const endRaw = m ? m.index : n;
      if (endRaw > i) out.push({ type: name === 'title' || name === 'textarea' ? 'rcdata' : 'raw', s: i, e: endRaw, parent: name });
      i = endRaw; textStart = i;
    }
  }
  pushText(textStart, n);
  return out;
}

export function parseAttrs(src) {
  const attrs = {}; const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let m;
  while ((m = re.exec(src))) { const k = m[1].toLowerCase(); if (!(k in attrs)) attrs[k] = m[2] ?? m[3] ?? m[4] ?? ''; }
  return attrs;
}

/** Раскодировать кусок: chars[] (по одному знаку UTF-16 на исходный отрезок), real[] (настоящий знак), spans[]. */
export function decode(html, s, e) {
  const chars = []; const real = []; const spans = [];
  for (let i = s; i < e;) {
    if (html[i] === '&') {
      const m = /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.exec(html.slice(i, i + 40));
      if (m) {
        const b = m[1]; let ch = null;
        if (b[0] === '#') { const cp = b[1] === 'x' || b[1] === 'X' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10); try { ch = String.fromCodePoint(cp); } catch { ch = null; } }
        else ch = NAMED[b] ?? null;
        chars.push(ch && ch.length === 1 ? ch : ch ? ASTRAL : OPAQUE); real.push(ch ?? OPAQUE); spans.push([i, i + m[0].length]); i += m[0].length; continue;
      }
    }
    const cp = html.codePointAt(i); const len = cp > 0xffff ? 2 : 1;
    chars.push(len === 2 ? ASTRAL : html[i]); real.push(html.slice(i, i + len)); spans.push([i, i + len]); i += len;
  }
  return { chars, real, spans };
}
const decodeStr = (s) => decode(String(s), 0, String(s).length).real.join('');

const findLast = (a, f) => { for (let i = a.length - 1; i >= 0; i--) if (f(a[i])) return i; return -1; };
export function isButtonLike(t) { return !!t && !t.close && (t.name === 'button' || t.name === 'summary' || (t.name === 'a' && /(^|[\s_-])(btn|button|cta)([\s_-]|$)/i.test((t.attrs && t.attrs.class) || '')) || (!!t.attrs && t.attrs.role === 'button')); }
const isBlockish = (t) => !!t && (BLOCK.has(t.name) || isButtonLike(t) || (!!t.attrs && 'data-copy-b' in t.attrs));

function roleOf(stack) {
  let inner = 'text';
  for (let i = stack.length - 1; i >= 0; i--) {
    const t = stack[i]; const cls = (t.attrs && t.attrs.class) || '';
    if (/^h[1-6]$/.test(t.name)) { inner = t.name; break; }
    if (isButtonLike(t) && t.name !== 'summary') return 'button';
    if (t.name === 'summary' || t.name === 'dt') { inner = 'faq-q'; break; }
    if (t.name === 'dd' || t.name === 'details') { inner = 'faq-a'; break; }
    if (t.name === 'label' || t.name === 'legend') { inner = 'label'; break; }
    if (t.name === 'figcaption' || t.name === 'caption') { inner = 'caption'; break; }
    if (t.name === 'nav' || t.name === 'footer') break;
    if (t.name === 'li') { inner = 'li'; break; }
    if (t.name === 'p' && /(^|\s)(lead|lede|sub|intro|hero)/i.test(cls)) { inner = 'lead'; break; }
    if (t.name === 'div' && /(^|\s)(lead|lede|subtitle|intro)(\s|$)/i.test(cls)) { inner = 'lead'; break; }
  }
  /* меню и подвал главнее всего, кроме заголовка и кнопки */
  if (!/^h[1-6]$/.test(inner)) { if (stack.some((t) => t.name === 'nav')) return 'nav'; if (stack.some((t) => t.name === 'footer')) return 'footer'; }
  return inner;
}
const pathOf = (stack) => stack.slice(-3).map((t) => t.name + (t.attrs && t.attrs.class ? '.' + String(t.attrs.class).trim().split(/\s+/)[0] : '')).join('>');
function lineIndex(html) {
  const nl = []; for (let i = 0; i < html.length; i++) if (html.charCodeAt(i) === 10) nl.push(i);
  return (pos) => { let lo = 0, hi = nl.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < pos) lo = mid + 1; else hi = mid; } return lo + 1; };
}

/* атрибуты, которые читает человек или экранный диктор: [роль, значение] */
function attrTexts(t) {
  const a = t.attrs || {}; const out = [];
  if (a['aria-label']) out.push(['attr:aria-label', a['aria-label']]);
  if (a.alt && /^(img|area|input)$/.test(t.name)) out.push(['attr:alt', a.alt]);
  if (a.placeholder && /^(input|textarea)$/.test(t.name)) out.push(['attr:placeholder', a.placeholder]);
  if (t.name === 'meta' && a.content) { const k = String(a.name || a.property || '').toLowerCase(); if (/^(description|og:title|og:description)$/.test(k)) out.push([`attr:${k}`, a.content]); }
  if (t.name === 'input' && /^(submit|button|reset)$/i.test(a.type || '') && a.value) out.push(['button', a.value]);
  return out;
}

/**
 * Прогоны текста страницы: соседние текстовые узлы одного блока (строчные теги прогон не рвут).
 * → [{ text, real, spans, locked: Set, lintText, role, line, path, hidden, visible, legal, allow: Set,
 *      stub, expect, expectNote, nextTags, attr? }]
 * text — по знаку на исходный отрезок (для типографа), lintText — настоящий текст для проверки: эмодзи как
 * есть, строчный код — «￼», склейка «прийтиЧасы» на стыке строчных тегов разделена пробелом.
 */
export function runsOf(html, toks = tokenize(html)) {
  const lineAt = lineIndex(html);
  const stack = []; const runs = []; const attrRuns = [];
  let cur = null; let tagSince = false; let stubRange = null; let pendingStub = null; let lastRun = null;
  const isBlank = (c) => !c || !collapse(c.lint.replace(/￼/g, ''));
  const flush = () => {
    if (cur && !isBlank(cur)) { runs.push(cur); lastRun = cur; cur.collectNext = true; }
    cur = null; tagSince = false;
  };
  const ctxOf = (list) => {
    const c = { excluded: false, code: false, notypo: false, hidden: false, visible: true, legal: false, stub: null, allow: new Set(), expect: undefined, expectNote: undefined };
    for (const t of list) {
      const a = t.attrs || {};
      if (EXCLUDE.has(t.name)) c.excluded = true;
      if (CODE.has(t.name)) c.code = true;
      if (a.translate === 'no' || 'contenteditable' in a || a['data-typo'] === 'off' || /(^|\s)(notypo|no-typo)(\s|$)/.test(a.class || '')) c.notypo = true;
      if ('aria-hidden' in a && a['aria-hidden'] !== 'false') c.hidden = true;
      if ('hidden' in a || 'data-copy-hidden' in a || /display\s*:\s*none/i.test(a.style || '')) c.visible = false;
      if (a['data-copy'] === 'legal') c.legal = true;
      if (a['data-copy'] === 'stub') c.stub = { id: `a${t.s}`, kind: 'data-copy="stub"', note: a['data-copy-note'] || '', line: lineAt(t.s) };
      if (t.stub) c.stub = t.stub;
      if (a['data-copy-allow']) for (const x of String(a['data-copy-allow']).split(/[\s,]+/)) if (x) c.allow.add(x);
      if ('data-expect' in a) c.expect = a['data-expect'];
      if ('data-expect-note' in a) c.expectNote = a['data-expect-note'];
    }
    if (!c.stub && stubRange) c.stub = stubRange;
    return c;
  };
  const keyOf = (c, role) => [role, c.hidden, c.visible, c.legal, c.stub ? c.stub.id : '', [...c.allow].sort().join(','), c.expect ?? '', c.expectNote ?? ''].join('|');
  /* заголовок, в котором лежит прогон (h1–h6 по стеку): в режиме адреса визуально скрытый span внутри h1 блочный
     (position:absolute) и идёт отдельным прогоном — copy-heading судит заголовок целиком (lintRuns, run.head) */
  const headOf = () => { const k = findLast(stack, (x) => /^h[1-6]$/.test(x.name)); return k >= 0 ? `h${stack[k].s}` : null; };
  const newRun = (c, role, key, pos) => ({ chars: [], real: [], spans: [], lockIdx: [], lint: '', inCode: false, lastWord: '', wsAfterWord: true, key, role, path: pathOf(stack), line: lineAt(pos), head: headOf(), hidden: c.hidden, visible: c.visible, legal: c.legal, allow: c.allow, stub: c.stub, expect: c.expect, expectNote: c.expectNote, nextTags: [] });

  for (const t of toks) {
    if (t.type === 'tag') {
      if ((t.name === 'br' || t.name === 'wbr') && !t.close) {
        /* перенос не рвёт предложение: виртуальный знак нулевой длины, типограф его не трогает */
        if (cur) { cur.chars.push(t.name === 'br' ? '\n' : '\u200b'); cur.real.push(t.name === 'br' ? '\n' : ''); cur.spans.push([t.s, t.s]); cur.lockIdx.push(cur.chars.length - 1); if (t.name === 'br') { cur.lint += ' '; cur.wsAfterWord = true; } }
        continue;
      }
      const openIdx = t.close ? findLast(stack, (x) => x.name === t.name) : -1;
      const breaks = t.close ? openIdx >= 0 && isBlockish(stack[openIdx]) : isBlockish(t);
      if (breaks) flush(); else if (cur) tagSince = true;
      if (!t.close) {
        if (lastRun && lastRun.collectNext && isBlank(cur) && lastRun.nextTags.length < 3) lastRun.nextTags.push(t.name);
        const c = ctxOf([...stack, t]);
        if (!c.excluded || t.name === 'svg') {
          for (const [role, v] of attrTexts(t)) {
            const text = collapse(decodeStr(v)); if (!text) continue;
            attrRuns.push({ text, real: [...text], lintText: text, spans: [], locked: new Set(), role, attr: true, line: lineAt(t.s), path: pathOf([...stack, t]), hidden: false, visible: c.visible, legal: c.legal, allow: c.allow, stub: c.stub, expect: c.expect, expectNote: c.expectNote, nextTags: [] });
          }
        }
        if (pendingStub && !VOID.has(t.name)) { t.stub = pendingStub; pendingStub = null; }
        if (!VOID.has(t.name) && !t.selfClosing) stack.push(t);
      } else if (openIdx >= 0) stack.length = openIdx;
      continue;
    }
    if (t.type === 'comment') {
      const body = html.slice(t.s + 4, Math.max(t.s + 4, t.e - 3)).trim();
      if (/^\/\s*copy:stub\b/i.test(body)) { flush(); stubRange = null; continue; }
      const m = /^copy:stub\b\s*([\s\S]*)$/i.exec(body);
      if (m) { flush(); stubRange = { id: `c${t.s}`, kind: 'copy:stub', note: clip(m[1], 160), line: lineAt(t.s) }; continue; }
      if (/заглушк|придуман|легенд|уточнить/iu.test(body)) pendingStub = { id: `c${t.s}`, kind: 'комментарий', note: clip(body, 160), line: lineAt(t.s) };
      continue;
    }
    if (t.type === 'raw') { flush(); continue; }
    if (t.type === 'rcdata') {
      if (t.parent !== 'title') continue;             /* textarea — не трогаем */
      const c = ctxOf(stack); if (c.excluded) continue; /* <title> внутри svg */
      flush();
      const { chars, real, spans } = decode(html, t.s, t.e);
      cur = newRun(c, 'title', 'title', t.s);
      for (let q = 0; q < chars.length; q++) { cur.chars.push(chars[q]); cur.real.push(real[q]); cur.spans.push(spans[q]); cur.lint += real[q]; }
      flush(); continue;
    }
    if (t.type !== 'text') continue;
    const c = ctxOf(stack); if (c.excluded) continue;
    const role = roleOf(stack); const key = keyOf(c, role);
    const { chars, real, spans } = decode(html, t.s, t.e);
    const gap = chars.every((ch) => /\s/.test(ch));
    if (cur && cur.key !== key && !gap) flush();
    if (!cur) cur = newRun(c, role, key, t.s);
    if (!gap && lastRun && lastRun !== cur) lastRun.collectNext = false;
    /* граница пункта без браузера: между текстами только теги (и, может быть, пробел-стык), до — буква,
       цифра или закрывающая скобка, после — заглавная или цифра. «<span>Часы работы</span> <b>08:00 —
       21:00</b> <small>Без выходных</small>» — три пункта (в CSS они блочные), а не одно предложение;
       «<b>Прийти</b><span>Часы</span>» — два. Проверка режет прогон по «¶» (lintView); типограф видит
       исходник. Склейка после точки («Шаг 1.</b>Выберите») — просто пробел. */
    if (tagSince && !gap && !c.code && cur.lastWord && !cur.wsAfterWord) {
      const first = (real.join('').match(/\S/u) || [''])[0]; const tight = !/^\s/u.test(real[0] || '');
      if (/[\p{L}\d)»"]/u.test(cur.lastWord) && /[\p{Lu}\d]/u.test(first)) cur.lint += PARA;
      /* «<b>15–45 дней</b><small>от заявки</small>» — пробел, иначе «днейот»; буквица «<b>В</b>се» — слитно */
      else if (tight && /[\p{L}\d]/u.test(cur.lastWord) && /\p{Ll}/u.test(first) && !(cur.nodeLen === 1 && /\p{Lu}/u.test(cur.lastWord))) cur.lint += ' ';
      else if (tight && /[.!?:;,]/.test(cur.lastWord) && /\p{Lu}/u.test(first)) cur.lint += ' ';
    }
    if (!gap && !c.code) cur.nodeLen = real.filter((ch) => !/\s/u.test(ch)).length;
    const base = cur.chars.length;
    for (let q = 0; q < chars.length; q++) {
      cur.chars.push(chars[q]); cur.real.push(real[q]); cur.spans.push(spans[q]);
      /* пробел-стык между тегами («</a> <a>») не склеивать; код и notypo — не трогать */
      if (gap || c.code || c.notypo) cur.lockIdx.push(base + q);
      if (c.code) { if (!cur.inCode) { cur.lint += OPAQUE; cur.inCode = true; cur.lastWord = OPAQUE; cur.wsAfterWord = false; } }
      else {
        cur.inCode = false; cur.lint += real[q];
        if (!gap) { if (/\s/u.test(real[q])) cur.wsAfterWord = true; else { cur.lastWord = real[q]; cur.wsAfterWord = false; } }
      }
    }
    tagSince = false;
  }
  flush();
  for (const r of runs) {
    r.text = r.chars.join(''); r.locked = lockedOf(r.text); for (const v of r.lockIdx) r.locked.add(v);
    r.lintText = r.lint; delete r.lint; delete r.lockIdx; delete r.inCode; delete r.lastWord; delete r.wsAfterWord; delete r.nodeLen; delete r.key; delete r.collectNext;
  }
  return [...runs, ...attrRuns];
}

/** Прогоны для проверки: прогон с границами пунктов «¶» — на части (у части parent — исходный прогон). */
export function lintView(runs) {
  const out = [];
  for (const r of runs) {
    const t = r.lintText ?? r.text;
    if (!t.includes(PARA)) { out.push(r); continue; }
    t.split(PARA).forEach((part, k) => { if (collapse(part.replace(/￼/g, ''))) out.push({ ...r, lintText: part, parent: r, sub: k, nextTags: k === t.split(PARA).length - 1 ? r.nextTags : [] }); });
  }
  return out;
}

/** Применить операции { run, i, to } к исходнику: to — сырая строка вместо символа i ('' — удалить). */
export function applyOps(html, runs, ops) {
  const edits = [];
  for (const o of ops) { const [s, e] = runs[o.run].spans[o.i]; edits.push({ s, e, to: o.to }); }
  edits.sort((a, b) => a.s - b.s);
  let out = ''; let pos = 0;
  for (const ed of edits) { if (ed.s < pos) continue; out += html.slice(pos, ed.s) + ed.to; pos = ed.e; }
  return out + html.slice(pos);
}

/** Инвариант: всё, кроме текстовых узлов, байт в байт. */
export function sameMarkup(a, b) {
  const ta = tokenize(a).filter((t) => t.type !== 'text' && t.type !== 'rcdata').map((t) => a.slice(t.s, t.e));
  const tb = tokenize(b).filter((t) => t.type !== 'text' && t.type !== 'rcdata').map((t) => b.slice(t.s, t.e));
  if (ta.length !== tb.length) return { ok: false, why: `элементов разметки ${ta.length} → ${tb.length}` };
  for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) return { ok: false, why: `разметка №${i + 1} изменилась: ${ta[i].slice(0, 60)} → ${tb[i].slice(0, 60)}` };
  return { ok: true };
}

/** Типограф документа: только текстовые прогоны (атрибуты — нет). */
export function typographHtml(html, { nbsp = '&nbsp;' } = {}) {
  const runs = runsOf(html).filter((r) => !r.attr);
  const ops = []; const notes = []; const perRun = [];
  runs.forEach((r, ri) => {
    const res = typographRun(r, { nbsp, raw: (i, j) => html.slice(r.spans[i][0], r.spans[j - 1][1]) });
    if (res.ops.length) perRun.push({ ri, ops: res.ops });
    for (const o of res.ops) ops.push({ run: ri, i: o.i, to: o.to, rule: o.rule });
    for (const w of res.why) notes.push({ line: r.line, ...w });
  });
  return { out: applyOps(html, runs, ops), ops, runs, perRun, notes };
}
/** Типограф простой строки (тексты из базы и панели). */
export function typographText(text, { nbsp = '\u00a0', role = 'text' } = {}) {
  const s = String(text); const res = typographRun({ text: s, locked: lockedOf(s), role }, { nbsp, raw: (a, b) => s.slice(a, b) });
  const m = new Map(res.ops.map((o) => [o.i, o.to]));
  let out = ''; for (let i = 0; i < s.length; i++) out += m.has(i) ? m.get(i) : s[i];
  return { out, ops: res.ops, notes: res.why };
}

/* =====================================================================
   Страницы: файл, папка, адрес
   ===================================================================== */
const isUrl = (s) => /^(https?|file):/i.test(String(s));
function htmlFilesOf(dir) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name === 'node_modules') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.html?$/i.test(e.name)) out.push(p); } };
  walk(dir); return out.sort();
}
function pageFile(root, p) {
  const rel = unmangle(p).replace(/^\/+/, '').replace(/[?#].*$/, '');
  const cands = rel ? [rel, `${rel}.html`, path.join(rel, 'index.html')] : ['index.html'];
  for (const c of cands) { const f = path.join(root, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; }
  throw new Error(`страница «${p}» не найдена в ${root} (искал ${cands.join(', ')})`);
}
function filePages(target, pages) {
  const abs = path.resolve(unmangle(target));
  if (!fs.existsSync(abs)) throw new Error(`нет файла или папки: ${target}`);
  const isFile = fs.statSync(abs).isFile();
  const root = isFile ? path.dirname(abs) : abs;
  const files = isFile ? [abs] : pages ? String(pages).split(',').map((p) => p.trim()).filter(Boolean).map((p) => pageFile(root, p)) : htmlFilesOf(abs);
  if (!files.length) throw new Error(`в папке ${target} нет .html`);
  return { source: 'files', base: abs, pages: files.map((f) => { const html = fs.readFileSync(f, 'utf8'); return { what: path.relative(root, f).replace(/\\/g, '/') || path.basename(f), file: f, html, ...viewOf(runsOf(html)) }; }) };
}

/* В странице: пометить блочные (по вычисленному display) и скрытые элементы, прокрутить до конца
   (ленивые блоки), отдать разметку такой, какой её собрал JS. */
async function pageHtmlInBrowser() {
  const H = document.documentElement.scrollHeight;
  for (let y = 0; y < H; y += Math.max(400, innerHeight)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); }
  scrollTo(0, 0);
  const BLOCKY = /^(block|flex|grid|list-item|table|table-row|table-cell|table-caption|table-row-group|table-header-group|table-footer-group|flow-root)$/;
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') el.setAttribute('data-copy-hidden', '');
    else if (BLOCKY.test(cs.display)) el.setAttribute('data-copy-b', '');
  }
  return (document.doctype ? '<!doctype html>\n' : '') + document.documentElement.outerHTML;
}
async function urlPages(target, opt, B) {
  const r = resolveViewport(opt.viewport || 'mobile');
  if (!r) throw new Error(`неизвестный экран «${opt.viewport}»: desktop, laptop, tablet, mobile, mobile-s, android или ШxВ@плотность`);
  const [vpName, vp] = r;
  const list = opt.pages ? pagesFrom(opt.pages, target) : [new URL(target).href];
  if (!B.browser) B.browser = await launch({ mobile: !!vp.isMobile });
  const pages = [];
  for (const url of list) {
    const page = await openPage(B.browser, url, vp, { settle: 3000 });
    try {
      /* SITE_REWORK_DISMISS увёл на другую страницу (mamuka.rest: «Ярославль» в окне выбора города на /menu открывает
         главную) — выбор запомнен, открыть нужный адрес ещё раз, иначе в снимок /menu идут тексты главной */
      if (((page.overlay && page.overlay.dismiss) || []).some((d) => d && d.nav)) {
        await gotoRetry(page, url, { timeout: 60000 });
        await waitForOverlay(page, 3000).catch(() => null);
        console.error(`INFO  ${url}: окно увело на другую страницу — адрес открыт заново (${page.url()})`);
      }
      const html = await page.evaluate(pageHtmlInBrowser);
      const u = new URL(url);
      const runs = runsOf(html); for (const x of runs) x.line = null;   /* строки разметки из браузера с исходником не совпадают */
      pages.push({ what: u.protocol === 'file:' ? decodeURIComponent(u.pathname.split('/').pop() || u.pathname) : (u.pathname + u.search) || '/', url, html, runs, lint: lintView(runs) });
    } finally { await page.close().catch(() => {}); }
  }
  return { source: 'url', base: target, viewport: vpName, pages };
}
async function collect(target, opt, B) { return isUrl(target) ? urlPages(target, opt, B) : filePages(target, opt.pages); }

/* Тексты из протокола snapshot/lint (.json) или со страниц: { texts, pages: [{ what, runs: [{ role, text }] }], index } */
async function textsFrom(src, opt, B, what) {
  if (!isUrl(src) && /\.json$/i.test(src)) {
    let j; try { j = JSON.parse(fs.readFileSync(path.resolve(unmangle(src)), 'utf8')); } catch (e) { throw new Error(`${what}: не прочитать ${src} — ${e.message}`); }
    if (!j || !Array.isArray(j.pages)) throw new Error(`${what}: в ${src} нет pages[] — нужен протокол copy.mjs snapshot или lint`);
    const pages = j.pages.map((p) => ({ what: p.what, runs: (p.runs || []).map((r) => ({ role: r.role, line: r.line ?? null, text: String(r.text ?? '') })) }));
    return { texts: pages.flatMap((p) => p.runs.map((r) => r.text)), pages, index: j.totals && j.totals.index != null ? j.totals.index : null, file: src };
  }
  const col = await collect(src, opt, B);
  const pages = col.pages.map((p) => ({ what: p.what, runs: textRunsOf(p.lint) }));
  const f = col.pages.flatMap((p) => lintRuns(p.lint, { noFacts: true })); const n = col.pages.reduce((a, p) => a + wordsOf(p.lint), 0);
  return { texts: pages.flatMap((p) => p.runs.map((r) => r.text)), pages, index: indexOf(f, n), file: src };
}
const viewOf = (runs) => ({ runs, lint: lintView(runs) });
const textRunsOf = (runs) => runs.map((r) => ({ role: r.role, line: r.line ?? null, text: collapse(r.lintText ?? r.text) })).filter((r) => r.text);
const wordsOf = (runs) => runs.filter((r) => !r.attr && !r.skip).reduce((a, r) => a + words(r.lintText ?? r.text).length, 0);

/* =====================================================================
   Журнал вкуса: запреты пользователя по copy-* (activeBans), принятое, свой отсев
   ===================================================================== */
export function tasteOf(dirOrEntries, run = null) {
  const all = Array.isArray(dirOrEntries) ? dirOrEntries : readJournal(dirOrEntries);
  const copyOnly = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k.startsWith('copy-')));
  const bans = copyOnly(activeBans(all, { run }));
  const ok = {}; const self = {};
  for (const e of all) {
    if (!appliesTo(e, run)) continue;
    for (const r of (e.rules || []).filter((x) => String(x).startsWith('copy-'))) {
      if (isUserWord(e)) { if (e.verdict === 'rejected') delete ok[r]; else if (!e.donor) ok[r] = e; }
      else if (e.by === 'self') self[r] = e;
    }
  }
  for (const r of Object.keys(bans)) delete ok[r];
  return { bans, ok, self };
}
/** Строгость находок по журналу: запрет — WARN → FAIL, NOTE → WARN; принято — WARN → NOTE; by self — пометка. */
export function applyTaste(found, T) {
  if (!T) return found;
  return found.map((f) => {
    const b = T.bans[f.rule]; const ok = T.ok[f.rule]; const self = T.self[f.rule];
    if (b) return { ...f, sev: f.sev === 'WARN' ? 'FAIL' : f.sev === 'NOTE' ? 'WARN' : f.sev, taste: { verdict: 'rejected', by: 'user', quote: b.quote, date: b.date, scope: b.scope } };
    if (ok && f.sev === 'WARN') return { ...f, sev: 'NOTE', taste: { verdict: ok.verdict, by: 'user', quote: ok.quote, date: ok.date || '' } };
    if (self) return { ...f, taste: { verdict: self.verdict, by: 'self', why: self.why || '' } };
    return f;
  });
}

/* =====================================================================
   lint
   ===================================================================== */
const SEVS = { FAIL: 0, WARN: 1, NOTE: 2 };
const worst = (list) => (list.includes('FAIL') ? 'FAIL' : list.includes('WARN') ? 'WARN' : 'OK');
const byRuleOf = (found, sev = null) => { const o = {}; for (const f of found) if (sev ? f.sev === sev : f.sev !== 'NOTE') o[f.rule] = (o[f.rule] || 0) + 1; return o; };
const ruleList = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');

/** Проверка страниц: → { steps, findings, pagesOut, totals }. ctx: { allow, facts, noFacts, donor, invent, taste } */
export function lintPages(pages, ctx = {}) {
  const steps = []; const findings = []; const pagesOut = []; let W = 0, S = 0;
  for (const pg of pages) {
    const found = applyTaste(lintRuns(pg.lint, { allow: ctx.allow, facts: ctx.facts, noFacts: ctx.noFacts, donor: ctx.donor, invent: ctx.invent }), ctx.taste);
    /* страницы нет в снимке «до» (before.json снят с других страниц): её тексты «до» в базу фактов не попали —
       WARN «нет снимка “до” для <путь>» и у придуманного — чем это закрыть (epicentr 29.09: 7 заявлений на
       /booking, /contacts, /venue/mosty были на сайте «до», а снимок снят только с /, /menu, /afisha) */
    const nb = ctx.noBase && ctx.noBase.pages.includes(pg.what) ? ctx.noBase : null;
    if (nb) {
      /* заявления сверены — с facts.json и текстами других страниц «до»; не хватает текстов «до» этой страницы, поэтому
         в список придуманного мог попасть факт со старой страницы. Снимок с одной страницы под другим именем (lint
         одной страницы) — может быть та же страница: так и сказано */
      const unv = found.filter((f) => f.rule === 'copy-unverified' && !f.unchecked);
      const all = [...new Set([...nb.had, ...nb.pages])];
      const redo = `снять снимок «до» и с неё: node copy.mjs snapshot <адрес или папка сайта «до»> --pages "${all.join(',')}" --out <прогон> — или факт в facts.json с source`;
      const from = nb.renamed ? `снимок «до» ${nb.file} снят с одной страницы — ${nb.had[0]}: если это она же под другим именем, список придуманного верный; иначе ${redo}` : `снимок «до» ${nb.file} снят со страниц ${nb.had.join(', ')}; ${redo}`;
      for (const f of unv) f.suggest = `${f.suggest}; страницы ${pg.what} нет в снимке «до» (${nb.file}) — может быть факт с сайта «до»`;
      found.push({ rule: 'copy-unchecked', sev: unv.length ? 'WARN' : 'NOTE', w: RULES['copy-unchecked'].w, line: null, role: 'page', path: '', quote: unv.length ? `нет снимка «до» для ${pg.what} — в список придуманного могли попасть факты с сайта «до»` : `нет снимка «до» для ${pg.what}`, match: unv.length ? `придумано ${unv.length}` : 'придуманного нет', suggest: from, kind: 'baseline', run: null });
    }
    found.sort((a, b) => SEVS[a.sev] - SEVS[b.sev] || (a.line ?? 0) - (b.line ?? 0));
    const n = wordsOf(pg.lint); W += n; S += found.filter((f) => f.sev !== 'NOTE').reduce((a, f) => a + (f.w || 0), 0);
    const cnt = (s) => found.filter((f) => f.sev === s).length;
    const step = { what: pg.what, status: cnt('FAIL') ? 'FAIL' : cnt('WARN') ? 'WARN' : 'OK', words: n, fail: cnt('FAIL'), warn: cnt('WARN'), note: cnt('NOTE'), index: indexOf(found, n), byRule: byRuleOf(found) };
    steps.push(step);
    for (const f of found) { const { run, ...rest } = f; findings.push({ page: pg.what, ...rest, taste: f.taste || null }); }
    pagesOut.push({ what: pg.what, ...(pg.url ? { url: pg.url } : { file: pg.file }), words: n, runs: textRunsOf(pg.lint), found });
  }
  const tot = (k) => steps.reduce((a, s) => a + s[k], 0);
  return { steps, findings, pagesOut, totals: { pages: steps.length, words: W, fail: tot('fail'), warn: tot('warn'), note: tot('note'), index: W >= 30 ? Math.round(S * 10000 / W) / 10 : null } };
}

/** facts.json: список записей; запись без source — WARN-находка (своим не считается). */
function readFacts(file) {
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`facts.json: не прочитать ${file} — ${e.message}`); }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.facts) ? j.facts : null;
  if (!list) throw new Error(`facts.json: ${file} — ждал массив [{ "fact", "what", "source" }] или { "facts": [...] }`);
  return list;
}
export function factsFindings(noSource, file) {
  return noSource.map((fact) => ({ page: path.basename(file || 'facts.json'), rule: 'copy-unverified', sev: 'WARN', w: RULES['copy-unverified'].w, line: null, role: 'facts', path: '', quote: clip(fact), match: clip(fact, 80), suggest: 'запись без source своим не считается: добавить source (сайт «до», бриф, слова владельца с датой, договор); придумано — перенести в copy/invented.json', kind: 'facts', taste: null }));
}

/* =====================================================================
   Список придуманного для владельца: <прогон>/copy/invented.json
   Контента нет — придумываем сами, но всё придуманное — списком: владелец сверяет до показа своим клиентам
   (раздел отчёта «Придумано — проверить владельцу»). lint с --out дописывает сам заявления без источника и
   текст под copy:stub; записи руками (имя мастера, отзыв, адрес, телефон, награда) и записи других страниц
   не трогает.
   ===================================================================== */
/** Находки придуманного → записи списка: [{ page, what, text, quote, by: 'copy.mjs', tag, note? }], без повторов. */
export function inventedOf(findings, tag) {
  const out = []; const seen = new Set();
  for (const f of findings) {
    if (!f.invented) continue;
    const k = `${f.page}|${f.invented.what}|${norm(f.invented.text)}`; if (seen.has(k)) continue; seen.add(k);
    out.push({ page: f.page, what: f.invented.what, text: f.invented.text, quote: f.quote, by: 'copy.mjs', tag, ...(f.invented.note ? { note: f.invented.note } : {}) });
  }
  return out;
}
/** Слить со старым списком: записи copy.mjs по проверенным страницам заменяются, остальное (руками, другие страницы) остаётся. */
export function mergeInvented(prev, auto, pagesNow) {
  const now = new Set(pagesNow);
  const keep = (prev || []).filter((e) => !(e && typeof e === 'object' && e.by === 'copy.mjs' && now.has(e.page)));
  const seen = new Set(keep.map((e) => `${(e && e.page) ?? ''}|${norm((e && e.text) ?? '')}`));
  const add = auto.filter((e) => { const k = `${e.page}|${norm(e.text)}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { list: [...keep, ...add], kept: keep.length, added: add.length, hand: keep.filter((e) => !(e && e.by === 'copy.mjs')).length };
}
/** Записать список: старый файл не читается — не перезаписываем (там могли быть записи руками). */
function saveInvented(file, auto, pagesNow) {
  let prev = [];
  if (fs.existsSync(file)) {
    let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { file, error: `не прочитать (${e.message}) — не перезаписан, записи руками целы` }; }
    prev = Array.isArray(j) ? j : j && Array.isArray(j.items) ? j.items : null;
    if (!prev) return { file, error: 'ждал массив [{ what, text, page? }] — не перезаписан' };
  }
  const m = mergeInvented(prev, auto, pagesNow);
  writeJson(file, m.list);
  return { file, total: m.list.length, added: m.added, hand: m.hand };
}

function fileIf(p) { return p && fs.existsSync(p) && fs.statSync(p).isFile() ? p : null; }

async function cmdLint(target, opt, B) {
  const tag = opt.tag || 'lint';
  if (/^(before|donor)$/.test(tag)) throw new Error(`--tag ${tag} занят снимком (snapshot) — для lint возьмите base, after или своё имя`);
  if (opt['no-facts'] && (opt.facts || opt.baseline)) throw new Error('--no-facts вместе с --facts или --baseline: либо сверять факты, либо нет');
  const run = opt.run || opt.out || null;
  const runPath = run ? path.resolve(unmangle(run)) : null;
  const def = (rel) => (runPath ? fileIf(path.join(runPath, rel)) : null);
  const factsFile = opt.facts ? path.resolve(unmangle(opt.facts)) : opt['no-facts'] ? null : def('copy/facts.json');
  const baseSrc = opt.baseline || (opt['no-facts'] ? null : def('copy/before.json'));
  const donorSrc = opt.donor || def('copy/donor.json');
  const allowFile = opt.allow ? path.resolve(unmangle(opt.allow)) : def('copy.allow.json');
  if (opt.facts && !fileIf(factsFile)) throw new Error(`нет файла --facts ${opt.facts}`);
  if (opt.allow && !fileIf(allowFile)) throw new Error(`нет файла --allow ${opt.allow}`);
  const startedAt = new Date().toISOString();
  const col = await collect(target, opt, B);
  const factsList = factsFile ? readFacts(factsFile) : [];
  const base = baseSrc ? await textsFrom(baseSrc, opt, B, '--baseline') : null;
  const idx = opt['no-facts'] ? null : factIndex({ facts: factsList, texts: base ? base.texts : [] });
  const donor = donorSrc ? donorShingles((await textsFrom(donorSrc, opt, B, '--donor')).texts) : null;
  let allow = null; if (allowFile) { try { allow = JSON.parse(fs.readFileSync(allowFile, 'utf8')); } catch (e) { throw new Error(`copy.allow.json: не прочитать ${allowFile} — ${e.message}`); } }
  let taste = null; const tDir = tasteDir(opt['taste-dir']);
  if (opt.taste) taste = tasteOf(tDir, run ? runName(run) : null);
  /* страницы, которых нет в снимке «до»: сверка по имени (pageKey: «/», index.html, /menu — menu.html). По одной
     странице с каждой стороны и разные имена — тоже «нет снимка» (второй круг 29.09: снимок с главной и lint одной
     booking.html давали FAIL без объяснения — ровно жалоба); что это может быть та же страница под другим именем,
     сказано в находке (renamed) */
  let noBase = null;
  if (base && idx && base.pages && base.pages.length) {
    const keys = new Set(base.pages.map((p) => pageKey(p.what)));
    const miss = col.pages.map((p) => p.what).filter((w) => !keys.has(pageKey(w)));
    if (miss.length) noBase = { pages: miss, had: base.pages.map((p) => p.what), file: path.basename(String(base.file)), renamed: base.pages.length === 1 && col.pages.length === 1 };
  }
  const res = lintPages(col.pages, { allow, facts: idx, noFacts: !!opt['no-facts'], donor, invent: !!opt.invent, taste, noBase });
  const extra = idx ? factsFindings(idx.noSource, factsFile) : [];
  if (extra.length) res.steps.push({ what: path.basename(factsFile), status: 'WARN', words: 0, fail: 0, warn: extra.length, note: 0, index: null, byRule: { 'copy-unverified': extra.length } });
  const findings = [...extra, ...res.findings];
  const verdict = worst(res.steps.map((s) => s.status));
  const stubs = new Set(findings.filter((f) => f.rule === 'copy-stub').map((f) => `${f.page}|${f.line}|${f.quote}`)).size;
  /* придуманное — в список для владельца (файл пишет main при --out); разведка чужого сайта списка не даёт */
  const invented = opt['no-facts'] ? [] : inventedOf(res.findings, tag);
  const data = {
    tool: 'copy', mode: 'lint', source: col.source, ...(col.source === 'url' ? { url: target, viewport: col.viewport } : { path: col.base }), startedAt, tag, verdict,
    options: { facts: factsFile, baseline: base ? base.file : null, noFacts: !!opt['no-facts'], donor: donorSrc || null, allow: allowFile, taste: !!opt.taste, tasteDir: opt.taste ? tDir : null, run: run ? runName(run) : null, invent: !!opt.invent },
    totals: { ...res.totals, warn: res.totals.warn + extra.length, indexBase: base ? base.index : null, facts: idx ? idx.facts : null, baselineTexts: base ? base.texts.length : null, ...(noBase ? { pagesNoBase: noBase.pages, inventedNoBase: invented.filter((e) => noBase.pages.includes(e.page)).length } : {}), factsNoSource: extra.length, stubs, invented: invented.length },
    steps: res.steps, findings, pages: res.pagesOut.map(({ found, ...p }) => p),
  };
  return { data, res, extra, idx, base, taste, tDir, noBase, invented };
}

function printLint({ data, res, extra, idx, base, taste, noBase, inv }, opt, say) {
  const url = data.source === 'url';
  if (!opt['no-facts']) {
    const parts = []; if (data.options.facts) parts.push(`facts.json (${idx.facts} с источником${extra.length ? `, без источника ${extra.length} — своим не считается` : ''})`); if (base) parts.push(`сайт «до» (${path.basename(String(base.file))}, текстов ${base.texts.length}${noBase ? `; снимок со страниц ${noBase.had.join(', ')} — нет снимка «до» для ${noBase.pages.join(', ')}: в список придуманного там могли попасть факты с сайта «до»` : ''})`);
    say(parts.length ? `факты: ${parts.join(' + ')}` : 'факты: сверять не с чем (нет facts.json и снимка «до») — всякая цена, срок, гарантия считается придуманной (в список для владельца); своё от владельца — в copy/facts.json с source; разведка чужого сайта — --no-facts');
  } else say('факты: не сверялись (--no-facts) — список придуманного не пишется');
  if (taste) say(`журнал вкуса: запретов по copy-* ${Object.keys(taste.bans).length}${Object.keys(taste.bans).length ? ` (${Object.keys(taste.bans).join(', ')})` : ''}, принято пользователем ${Object.keys(taste.ok).length}, свой отсев ${Object.keys(taste.self).length}`);
  for (const f of extra) say(`WARN  ${f.page} · ${f.suggest}: «${f.quote}»`);
  res.pagesOut.forEach((pg, i) => {
    const st = res.steps[i];
    say(`${st.status.padEnd(5)} ${pg.what} · слов ${st.words} · FAIL ${st.fail} · WARN ${st.warn} · подсказок ${st.note}${st.index != null ? ` · индекс ${st.index}` : ''}`);
    if (opt.quiet) return;
    for (const f of pg.found) {
      if (f.sev === 'NOTE' && !opt.all) continue;
      const loc = url ? '' : f.line ? `стр.${f.line}` : '';
      say(`   ${f.sev.padEnd(4)} ${f.rule.padEnd(16)} ${loc.padEnd(7)} ${String(f.role).padEnd(7)} «${f.quote}»${f.match && f.match !== f.quote ? ` [${f.match}]` : ''}${url && f.path ? ` · ${f.path}` : ''}`);
      say(`        → ${f.suggest}`);
      if (f.taste) say(`        журнал вкуса: ${f.taste.by === 'user' ? `${f.taste.verdict === 'rejected' ? 'запрет' : 'принято'} пользователем «${clip(f.taste.quote, 100)}»${f.taste.date ? ` (${f.taste.date})` : ''}` : `свой отсев: ${clip(f.taste.why, 100)}`}`);
    }
  });
  const T = data.totals; const fails = byRuleOf(data.findings, 'FAIL'); const warns = byRuleOf(data.findings, 'WARN');
  /* придуманное на страницах без снимка «до» может оказаться фактом со старой страницы: итог объясняет себя сам */
  const nbInv = noBase ? T.inventedNoBase || 0 : 0;
  say(`Итог: ${data.verdict} — страниц ${res.steps.length}, FAIL ${T.fail}${T.fail ? ` (${ruleList(fails)})` : ''}, WARN ${T.warn}${T.warn ? ` (${ruleList(warns)})` : ''}, подсказок ${T.note}, индекс ${T.index ?? '—'}${T.indexBase != null ? ` (сайт «до» ${T.indexBase})` : ''}${T.invented ? ` · придумано ${T.invented}${T.stubs ? ` (под copy:stub ${T.stubs})` : ''}` : ''}${noBase ? ` · без снимка «до»: ${noBase.pages.join(', ')}${nbInv ? ` (придумано там ${nbInv} — может быть с сайта «до»)` : ''}` : ''}${data.file ? ` · протокол ${data.file}` : ''}`);
  /* список для владельца: пишет main при --out */
  if (opt['no-facts']) return;
  if (inv && inv.error) say(`WARN  список придуманного ${inv.file}: ${inv.error}`);
  else if (inv) say(`Придумано — проверить владельцу: ${inv.file} — записей ${inv.total} (из этой проверки ${inv.added}, руками ${inv.hand}, других страниц ${inv.total - inv.added - inv.hand}); в отчёт — раздел «Придумано — проверить владельцу»${T.invented && !opt.invent ? '; анкета: контент «нет — сделай сам» — --invent' : ''}`);
  else if (T.invented) say(`Придумано ${T.invented} — список для владельца пишется с --out <прогон> (copy/invented.json)`);
}

/* =====================================================================
   snapshot
   ===================================================================== */
async function cmdSnapshot(target, opt, B) {
  const tag = opt.tag || 'before';
  const startedAt = new Date().toISOString();
  const col = await collect(target, opt, B);
  let W = 0, S = 0, C = 0;
  const pages = col.pages.map((pg) => {
    const found = lintRuns(pg.lint, { noFacts: true }); const n = wordsOf(pg.lint); W += n; S += found.filter((f) => f.sev !== 'NOTE').reduce((a, f) => a + f.w, 0);
    const claims = pg.lint.filter((r) => !r.legal).flatMap((r) => claimsOf(collapse(r.lintText ?? r.text)).map((c) => ({ kind: c.kind, text: c.text }))); C += claims.length;
    return { what: pg.what, ...(pg.url ? { url: pg.url } : { file: pg.file }), words: n, index: indexOf(found, n), claims, runs: textRunsOf(pg.lint) };
  });
  return { tool: 'copy', mode: 'snapshot', tag, source: col.source, ...(col.source === 'url' ? { url: target, viewport: col.viewport } : { path: col.base }), startedAt, totals: { pages: pages.length, words: W, index: W >= 30 ? Math.round(S * 10000 / W) / 10 : null, claims: C }, pages };
}

/* =====================================================================
   pairs: «было → стало»
   ===================================================================== */
/* типографские отличия — не правка: кавычки, тире, неразрывные пробелы, «…», «×» */
const plain = (s) => collapse(String(s).replace(/[«»„“”"]/g, '"').replace(/[—–−]/g, '-').replace(/…/g, '...').replace(/×/g, 'x').replace(/ё/g, 'е')).toLowerCase();
const wordSet = (s) => new Set(words(plain(s)));
function similarity(a, b) { const A = wordSet(a), B = wordSet(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / (A.size + B.size - n); }
const pageKey = (w) => String(w || '').toLowerCase().replace(/^\/+/, '').replace(/(^|\/)index\.html?$/, '$1').replace(/\.html?$/, '').replace(/\/+$/, '');

/** Пары по странице: LCS по неизменённым текстам, между ними — по сходству слов (от 0.4, та же роль — в приоритете). */
export function pairRuns(before, after, beforeIdx = null) {
  const A = before.filter((r) => !String(r.role).startsWith('attr:')); const Bn = after.filter((r) => !String(r.role).startsWith('attr:'));
  const ka = A.map((r) => plain(r.text)); const kb = Bn.map((r) => plain(r.text));
  const L = Array.from({ length: A.length + 1 }, () => new Int32Array(Bn.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = Bn.length - 1; j >= 0; j--) L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const anchors = []; for (let i = 0, j = 0; i < A.length && j < Bn.length;) { if (ka[i] === kb[j]) { anchors.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const out = []; let pi = 0, pj = 0;
  const gapPairs = (i0, i1, j0, j1) => {
    const cand = [];
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) { const s = similarity(A[i].text, Bn[j].text) + (A[i].role === Bn[j].role ? 0.05 : 0); if (s >= 0.4) cand.push([s, i, j]); }
    cand.sort((x, y) => y[0] - x[0]); const ui = new Set(), uj = new Set(); const got = [];
    for (const [s, i, j] of cand) { if (ui.has(i) || uj.has(j)) continue; ui.add(i); uj.add(j); got.push({ kind: 'changed', before: A[i], after: Bn[j], sim: Math.round(Math.min(1, s) * 100) / 100, _o: j }); }
    for (let i = i0; i < i1; i++) if (!ui.has(i)) got.push({ kind: 'removed', before: A[i], after: null, _o: j0 - 1 + (i - i0) / 1000 });
    for (let j = j0; j < j1; j++) if (!uj.has(j)) got.push({ kind: 'added', before: null, after: Bn[j], _o: j });
    got.sort((x, y) => x._o - y._o); return got;
  };
  for (const [i, j] of [...anchors, [A.length, Bn.length]]) {
    out.push(...gapPairs(pi, i, pj, j));
    if (i < A.length && j < Bn.length) out.push({ kind: 'same', before: A[i], after: Bn[j] });
    pi = i + 1; pj = j + 1;
  }
  const idx = beforeIdx || factIndex({ texts: A.map((r) => r.text) });
  for (const p of out) {
    if (!p.after || p.kind === 'same') continue;
    p.newClaims = claimsOf(p.after.text).filter((c) => !confirmed(idx, c)).map((c) => ({ kind: c.kind, text: c.text }));
    delete p._o;
  }
  for (const p of out) delete p._o;
  return out;
}
export function pairPages(bp, ap) {
  const idx = factIndex({ texts: bp.flatMap((p) => p.runs.map((r) => r.text)) });
  /* по странице с каждой стороны (файл против файла) — сопоставляются без оглядки на имя */
  if (bp.length === 1 && ap.length === 1) return [{ what: ap[0].what, status: 'both', pairs: pairRuns(bp[0].runs, ap[0].runs, idx) }];
  const bMap = new Map(bp.map((p) => [pageKey(p.what), p])); const aMap = new Map(ap.map((p) => [pageKey(p.what), p]));
  const out = [];
  for (const [k, a] of aMap) { const b = bMap.get(k); out.push({ what: a.what, status: b ? 'both' : 'new', pairs: pairRuns(b ? b.runs : [], a.runs, idx) }); }
  for (const [k, b] of bMap) if (!aMap.has(k)) out.push({ what: b.what, status: 'gone', pairs: pairRuns(b.runs, [], idx) });
  return out;
}
function printPairs(pages, opt, say) {
  const lim = Number(opt.limit) > 0 ? Number(opt.limit) : 40;
  if (opt.md) {
    for (const pg of pages) {
      const ch = pg.pairs.filter((p) => p.kind !== 'same'); if (!ch.length) continue;
      say(`**${pg.what}**${pg.status === 'new' ? ' (новая страница)' : pg.status === 'gone' ? ' (страница убрана)' : ''}`);
      for (const p of ch.slice(0, lim)) {
        const nc = p.newClaims && p.newClaims.length ? ` — новое число или обещание: ${p.newClaims.map((c) => c.text).join(', ')} (своё — источник в facts.json; придумано — в список для владельца)` : '';
        if (p.kind === 'changed') say(`- «${clip(p.before.text, 220)}» → «${clip(p.after.text, 220)}»${nc}`);
        else if (p.kind === 'removed') say(`- убрано: «${clip(p.before.text, 220)}»`);
        else say(`- добавлено: «${clip(p.after.text, 220)}»${nc}`);
      }
      if (ch.length > lim) say(`- … ещё ${ch.length - lim}`);
      say('');
    }
    return;
  }
  let totalNew = 0;
  for (const pg of pages) {
    const c = (k) => pg.pairs.filter((p) => p.kind === k).length; const nc = pg.pairs.reduce((a, p) => a + ((p.newClaims || []).length), 0); totalNew += nc;
    say(`== ${pg.what}${pg.status === 'new' ? ' (новая страница)' : pg.status === 'gone' ? ' (страница убрана)' : ''} · изменено ${c('changed')}, убрано ${c('removed')}, добавлено ${c('added')}, без изменений ${c('same')}${nc ? ` · новых чисел и обещаний ${nc}` : ''}`);
    let k = 0;
    for (const p of pg.pairs) {
      if (p.kind === 'same' && !opt.all) continue;
      if (k++ >= lim) { say(`   … ещё ${pg.pairs.filter((x) => opt.all || x.kind !== 'same').length - lim}`); break; }
      const role = (p.after || p.before).role;
      if (p.kind !== 'added') say(`   ${String(role).padEnd(7)} было:  «${clip(p.before.text, 200)}»`);
      if (p.kind !== 'removed') say(`   ${p.kind === 'added' ? String(role).padEnd(7) : ' '.repeat(7)} ${p.kind === 'added' ? 'новое: ' : 'стало: '}«${clip(p.after.text, 200)}»`);
      if (p.newClaims && p.newClaims.length) say(`           новое число или обещание: ${p.newClaims.map((x) => `${x.text} (${x.kind})`).join(', ')} — своё: источник → facts.json; придумано → список для владельца (copy/invented.json)`);
    }
  }
  say(`Итог: страниц ${pages.length}, изменено ${pages.reduce((a, p) => a + p.pairs.filter((x) => x.kind === 'changed').length, 0)}, новых чисел и обещаний ${totalNew}${totalNew ? ' — у каждого источник (facts.json) или строка в списке придуманного (copy/invented.json)' : ''}`);
}

/* =====================================================================
   fix --typograph
   ===================================================================== */
const showNb = (s) => String(s).replace(/\u00a0|&nbsp;|&#160;|&#xa0;/gi, '~').replace(/\s+/g, ' ').trim();
function typoFile(file, opt, say) {
  const t0 = Date.now(); const html = fs.readFileSync(file, 'utf8');
  const nbsp = opt.nbsp === 'char' ? '\u00a0' : '&nbsp;';
  const r1 = typographHtml(html, { nbsp }); const inv = sameMarkup(html, r1.out); const r2 = typographHtml(r1.out, { nbsp });
  const byRule = {}; for (const o of r1.ops) byRule[o.rule] = (byRule[o.rule] || 0) + 1;
  const ok = inv.ok && r2.ops.length === 0;
  const step = { what: file, status: ok ? 'OK' : 'FAIL', ops: r1.ops.length, runs: r1.perRun.length, byRule, markup: inv.ok ? 'ok' : inv.why, again: r2.ops.length, notes: r1.notes.length, ms: Date.now() - t0, written: null };
  say(`${ok ? 'OK  ' : 'FAIL'} ${file}: правок ${r1.ops.length} в ${r1.perRun.length} прогонах${r1.ops.length ? ` · ${ruleList(byRule)}` : ''} · разметка ${inv.ok ? 'не тронута' : 'ИЗМЕНЕНА: ' + inv.why} · повторный проход: ${r2.ops.length} правок${r2.ops.length ? ' (не идемпотентен)' : ''} · ${step.ms} мс`);
  for (const n of r1.notes) say(`WARN  стр.${n.line}: ${n.note}`);
  if (!opt.quiet && r1.ops.length) {
    const lim = Number(opt.limit) > 0 ? Number(opt.limit) : 25;
    if (opt.diff) {
      const a = html.split('\n'); const b = r1.out.split('\n'); let k = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] === b[i]) continue; if (k++ >= lim) { say('  …'); break; } say(`  стр.${i + 1}\n  - ${a[i].trim()}\n  + ${b[i].trim()}`); }
    } else {
      let k = 0;
      for (const { ri, ops } of r1.perRun) {
        if (k++ >= lim) { say(`  … ещё ${r1.perRun.length - lim} прогонов (--limit N)`); break; }
        const r = r1.runs[ri]; const m = new Map(ops.map((o) => [o.i, o.to]));
        const before = r.real.join(''); const after = r.chars.map((ch, i) => (m.has(i) ? m.get(i) : r.real[i])).join('');
        say(`  стр.${r.line} ${r.role}\n    было:  ${clip(showNb(before), 200)}\n    стало: ${clip(showNb(after), 200)}`);
      }
    }
  }
  const dest = opt.write ? file : opt.out && opt.out !== true ? path.resolve(unmangle(opt.out)) : null;
  if (dest && ok && (r1.ops.length || dest !== file)) { fs.writeFileSync(dest, r1.out); step.written = dest; say(`записано: ${dest}`); }
  else if (dest && !ok) say(`FAIL  ${file} не записан: ${inv.ok ? 'повторный проход меняет текст' : 'изменилась бы разметка'}`);
  else if (!dest && r1.ops.length && !opt.quiet) say('  (ничего не записано: это показ; записать — --write или --out <файл>)');
  return step;
}
async function readStdin() { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString('utf8'); }

/* =====================================================================
   Командная строка
   ===================================================================== */
const VALUES = ['pages', 'viewport', 'out', 'run', 'tag', 'facts', 'baseline', 'donor', 'allow', 'taste-dir', 'json', 'limit', 'nbsp', 'role', 'out-dir'];
const FLAGS = ['help', 'h', 'selftest', 'typograph', 'write', 'dry-run', 'diff', 'md', 'all', 'quiet', 'taste', 'invent', 'no-facts', 'html', 'no-browser'];
/* снятые флаги: вместо «может быть, --…?» — что стало */
const REMOVED = { release: 'снят 30.09.2026: пометка copy:stub и придуманное больше не блокируют — список для владельца пишет lint --out в copy/invented.json' };
const COMMANDS = ['lint', 'snapshot', 'pairs', 'fix', 'rules', 'selftest'];
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
/** Неизвестный флаг — ошибка (а не WARN, как у parseArgs): опечатка в --facts не должна молча выключать сверку. */
export function badFlags(argv) {
  const known = new Set([...VALUES, ...FLAGS]); const bad = [];
  for (const a of argv) {
    if (a === '--') break;
    if (/^--[^-]/.test(a)) { const k = a.slice(2).split('=')[0]; if (REMOVED[k]) { bad.push(`--${k} (${REMOVED[k]})`); continue; } if (!known.has(k)) { const g = [...known].map((x) => [lev(k, x), x]).sort((p, q) => p[0] - q[0])[0]; bad.push(`--${k}${g && g[0] <= 3 ? ` (может быть, --${g[1]}?)` : ''}`); } }
    else if (/^-[^-]/.test(a) && a !== '-h') bad.push(`${a} (флаги пишутся через два дефиса; справка — -h)`);
  }
  return bad;
}

async function main(argv) {
  const bad = badFlags(argv);
  if (bad.length) { console.error(`FAIL  неизвестный флаг: ${bad.join(', ')} — список флагов: node copy.mjs --help`); return 1; }
  /* «-» (stdin) — позиционный аргумент, parseArgs его не трогает */
  const { pos, opt } = parseArgs(argv, { optional: VALUES, flags: FLAGS, commands: COMMANDS });
  if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); return 0; }
  const noValue = VALUES.filter((k) => opt[k] === true && !(k === 'json'));
  if (noValue.length) { console.error(`FAIL  флаг без значения: ${noValue.map((k) => `--${k}`).join(', ')} (подробно: --help)`); return 1; }
  const cmd = opt.selftest ? 'selftest' : pos[0];
  const args = opt.selftest ? pos : pos.slice(1);
  const jsonOut = opt.json === true ? '-' : opt.json || null;
  const say = jsonOut === '-' ? (...a) => console.error(...a) : (...a) => console.log(...a);
  const B = { browser: null };
  try {
    if (cmd === 'rules') {
      if (opt.json) { console.log(JSON.stringify({ rules: RULES, typograph: TYPO_RULES }, null, 1)); return 0; }
      for (const sev of ['FAIL', 'WARN', 'NOTE']) {
        console.log(`\n${sev === 'FAIL' ? 'FAIL — выкладывать нельзя' : sev === 'WARN' ? 'WARN — переписать или записать причину' : 'NOTE — подсказка, в вердикт не идёт'}`);
        for (const [id, r] of Object.entries(RULES).filter(([, x]) => x.sev === sev)) console.log(`  ${id.padEnd(17)} w${r.w}  ${r.t}\n  ${' '.repeat(21)}где: ${r.where}\n  ${' '.repeat(21)}как: ${r.fix}${r.ex && r.ex !== '—' ? `\n  ${' '.repeat(21)}пример: ${r.ex}` : ''}`);
      }
      console.log(`\nТипограф (fix --typograph): ${TYPO_RULES.join(', ')}`);
      console.log('Журнал вкуса: node taste.mjs add --block copy --rule copy-contrast --verdict rejected --by user --quote "…" --why "…" --run <прогон>');
      return 0;
    }
    if (cmd === 'lint') {
      if (args.length !== 1) { console.error('Нужно: node copy.mjs lint <файл|папка|url> [--out <прогон>] [--facts …] [--baseline …] (подробно: --help)'); return 1; }
      const r = await cmdLint(args[0], opt, B);
      if (opt.out) {
        const dir = path.join(path.resolve(unmangle(opt.out)), 'copy');
        /* список придуманного для владельца — до протокола, чтобы протокол знал, куда он лёг */
        if (!opt['no-facts']) { r.inv = saveInvented(path.join(dir, 'invented.json'), r.invented, r.data.pages.map((p) => p.what)); r.data.options.invented = r.inv.file; if (!r.inv.error) r.data.totals.inventedList = r.inv.total; }
        const f = path.join(dir, `${r.data.tag}.json`); writeJson(f, r.data); r.data.file = f;
      }
      if (jsonOut && jsonOut !== '-') { writeJson(path.resolve(unmangle(jsonOut)), r.data); if (!r.data.file) r.data.file = jsonOut; }
      printLint(r, opt, say);
      if (jsonOut === '-') console.log(JSON.stringify(r.data, null, 1));
      return r.data.verdict === 'FAIL' ? 1 : 0;
    }
    if (cmd === 'snapshot') {
      if (args.length !== 1) { console.error('Нужно: node copy.mjs snapshot <url|папка|файл> --out <прогон> [--tag before|donor] (подробно: --help)'); return 1; }
      if (!opt.out && !jsonOut) { console.error('FAIL  snapshot: нужен --out <папка прогона> (или --json <файл>)'); return 1; }
      const data = await cmdSnapshot(args[0], opt, B);
      let file = null;
      if (opt.out) { file = path.join(path.resolve(unmangle(opt.out)), 'copy', `${data.tag}.json`); writeJson(file, data); }
      if (jsonOut && jsonOut !== '-') { writeJson(path.resolve(unmangle(jsonOut)), data); file = file || jsonOut; }
      for (const p of data.pages) say(`OK    ${p.what} · слов ${p.words} · заявлений ${p.claims.length}${p.index != null ? ` · индекс ${p.index}` : ''}`);
      say(`Итог: снимок «${data.tag}» — страниц ${data.totals.pages}, слов ${data.totals.words}, заявлений (цены, сроки, гарантии) ${data.totals.claims}, индекс ${data.totals.index ?? '—'}${file ? ` · ${file}` : ''}`);
      if (jsonOut === '-') console.log(JSON.stringify(data, null, 1));
      return 0;
    }
    if (cmd === 'pairs') {
      if (args.length !== 2) { console.error('Нужно: node copy.mjs pairs <до> <после> [--md] (подробно: --help)'); return 1; }
      const b = await textsFrom(args[0], opt, B, 'до'); const a = await textsFrom(args[1], opt, B, 'после');
      const pages = pairPages(b.pages, a.pages);
      printPairs(pages, opt, say);
      if (jsonOut) { const data = { tool: 'copy', mode: 'pairs', before: args[0], after: args[1], startedAt: new Date().toISOString(), pages }; if (jsonOut === '-') console.log(JSON.stringify(data, null, 1)); else writeJson(path.resolve(unmangle(jsonOut)), data); }
      return 0;
    }
    if (cmd === 'fix') {
      if (!opt.typograph) { console.error('Нужно: node copy.mjs fix --typograph <файл|папка|-> [--write] (подробно: --help)'); return 1; }
      if (opt['dry-run'] && (opt.write || opt.out)) { console.error('FAIL  --dry-run вместе с --write или --out: выберите одно — показать или записать'); return 1; }
      const target = args[0];
      if (!target || args.length > 1) { console.error('Нужно: node copy.mjs fix --typograph <файл|папка|-> (одна цель; подробно: --help)'); return 1; }
      if (target === '-') {
        const src = await readStdin();
        if (opt.html) { const r = typographHtml(src, { nbsp: opt.nbsp === 'char' ? '\u00a0' : '&nbsp;' }); const inv = sameMarkup(src, r.out); if (!inv.ok) { console.error(`FAIL  разметка изменилась бы: ${inv.why}`); return 1; } process.stdout.write(r.out); return 0; }
        const r = typographText(src, { nbsp: opt.nbsp === 'entity' ? '&nbsp;' : '\u00a0', role: opt.role || 'text' });
        process.stdout.write(r.out); for (const n of r.notes) console.error(`WARN  ${n.note}`);
        return 0;
      }
      const abs = path.resolve(unmangle(target));
      if (!fs.existsSync(abs)) { console.error(`FAIL  нет файла или папки: ${target}`); return 1; }
      const files = fs.statSync(abs).isFile() ? [abs] : htmlFilesOf(abs);
      if (opt.out && files.length > 1) { console.error('FAIL  --out <файл> — только для одного файла; для папки — --write'); return 1; }
      const startedAt = new Date().toISOString();
      const steps = files.map((f) => typoFile(f, opt, say));
      const verdict = worst(steps.map((s) => s.status));
      const byRule = {}; for (const s of steps) for (const [k, v] of Object.entries(s.byRule)) byRule[k] = (byRule[k] || 0) + v;
      const written = steps.filter((s) => s.written).length;
      say(`Итог: ${verdict} — файлов ${steps.length}, правок ${steps.reduce((a, s) => a + s.ops, 0)}${Object.keys(byRule).length ? ` (${ruleList(byRule)})` : ''}, записано ${written}${!opt.write && !opt.out ? ' (показ: --write — записать)' : ''}`);
      if (opt['out-dir']) {
        const f = path.join(path.resolve(unmangle(opt['out-dir'])), 'copy', `typo-${opt.tag || 'fix'}.json`);
        writeJson(f, { tool: 'copy', mode: 'typograph', path: abs, startedAt, dryRun: !opt.write && !opt.out, verdict, totals: { files: steps.length, ops: steps.reduce((a, s) => a + s.ops, 0), written, byRule }, steps });
        say(`протокол: ${f}`);
      }
      return verdict === 'FAIL' ? 1 : 0;
    }
    if (cmd === 'selftest') return await selftest(opt);
    /* «copy.mjs <url>» без команды (так писали в задачах исполнителям): адрес, файл или папка на месте команды */
    const target = cmd && (isUrl(cmd) || /\.html?$/i.test(cmd) || fs.existsSync(path.resolve(unmangle(cmd))));
    if (target) { const q = (a) => (/[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a); console.error(`FAIL  нужна команда: ${COMMANDS.join('|')} — «${cmd}» похоже на адрес или файл; проверка текстов: node copy.mjs lint ${argv.map((a) => q(unmangle(a))).join(' ')} (подробно: --help)`); return 1; }
    console.error(cmd ? `FAIL  неизвестная команда «${cmd}» — есть ${COMMANDS.join(', ')} (подробно: --help)` : `Нужна команда: ${COMMANDS.join(', ')} (подробно: node copy.mjs --help)`);
    return 1;
  } catch (e) {
    console.error(`FAIL  ${e && e.message ? e.message : e}`);
    return 1;
  } finally {
    if (B.browser) await B.browser.close().catch(() => {});
  }
}

/* =====================================================================
   selftest
   ===================================================================== */
async function selftest(opt) {
  let bad = 0; let n = 0;
  const say = (ok, msg) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };
  const read = (f) => fs.readFileSync(path.join(FIXTURES, f), 'utf8');
  const facts = JSON.parse(read('facts.json'));
  const idx = factIndex({ facts });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-selftest-'));
  const node = (args, input) => spawnSync(process.execPath, [SELF, ...args], { encoding: 'utf8', input, timeout: 120000, windowsHide: true });

  /* 1. стенды с data-expect: ожидаемые правила найдены, лишних WARN/FAIL нет; data-expect-note — ожидаемые подсказки */
  /* runs — уже готовые прогоны (режим адреса: строк нет, группа — по пути элемента) */
  const groupsCheck = (name, o = {}, given = null) => {
    const runs = given || runsOf(read(name));
    const found = lintRuns(lintView(runs), { facts: idx, ...o });
    const groups = new Map();
    for (const r of runs.filter((x) => x.expect !== undefined || x.expectNote !== undefined)) {
      const k = `${r.line ?? r.path}|${r.expect ?? ''}|${r.expectNote ?? ''}`;
      if (!groups.has(k)) groups.set(k, { line: r.line ?? r.path, expect: r.expect ? r.expect.split(/\s+/).filter(Boolean) : [], note: r.expectNote ? r.expectNote.split(/\s+/).filter(Boolean) : [], runs: [] });
      groups.get(k).runs.push(r);
    }
    for (const g of groups.values()) {
      const got = found.filter((f) => f.run && g.runs.includes(f.run.parent || f.run));
      const miss = g.expect.filter((e) => !got.some((f) => f.rule === e && f.sev !== 'NOTE'));
      const missNote = g.note.filter((e) => !got.some((f) => f.rule === e && f.sev === 'NOTE'));
      const extra = got.filter((f) => f.sev !== 'NOTE' && !g.expect.includes(f.rule));
      say(!miss.length && !missNote.length && !extra.length, `${name}:${g.line} ждали [${g.expect.join(' ') || '—'}]${g.note.length ? ` подсказки [${g.note.join(' ')}]` : ''}${miss.length ? ` · не найдено: ${miss.join(' ')}` : ''}${missNote.length ? ` · нет подсказки: ${missNote.join(' ')}` : ''}${extra.length ? ` · лишнее: ${extra.map((f) => `${f.rule} «${f.match}»`).join('; ')}` : ''}`);
    }
    return { runs, found };
  };
  groupsCheck('bad.html');
  const good = groupsCheck('good.html');
  say(good.found.filter((f) => f.sev !== 'NOTE').length === 0, `good.html: одобренные и тёплые тексты («ты», «я», кофейня) — ни одного WARN/FAIL на странице (${good.found.filter((f) => f.sev !== 'NOTE').map((f) => `${f.rule} «${f.match}»`).join('; ') || 'ноль'})`);
  groupsCheck('contrast.html');
  /* «Эпицентр» 29.09: подписи авторов фото и обязательные строки — не повтор (одна подпись у двух фото — подсказка),
     «приз за лучший номер» — не пустая оценка; обычный повтор и «лучший кофе» — как раньше */
  {
    const ep = groupsCheck('epicentr.html');
    const lic = ep.found.filter((f) => f.rule === 'copy-unverified' && /лиценз/iu.test(f.quote));
    say(!lic.length, `epicentr.html: «бесплатная лицензия Pexels» в подписи фото — не заявление (copy-unverified ${lic.length})`);
    const cr = (t) => isCredit({ path: 'div>small.credit', role: 'text' }, t);
    const inP = (t) => isCredit({ path: 'main>p', role: 'text' }, t);
    say(cr('Фото: KQuhen · CC BY-SA 4.0 · Wikimedia Commons') && cr('Pexels') && inP('Фото: KQuhen · CC BY-SA 4.0 · Wikimedia Commons') && inP('Photo by John Doe on Unsplash') && isCredit({ path: 'figure>figcaption', role: 'caption' }, 'Фото: iram shehzad, бесплатная лицензия Pexels')
      && !inP('Фото: сделаем на память в конце вечера') && !cr('Фото: сделаем на память в конце вечера') && !cr('Фотозона у входа, свет и зеркало в полный рост для гостей вечера, живой саксофон и приз залу за лучший номер вечера, свободная сцена'),
      'isCredit: «Фото: … · CC BY-SA», «Photo by … on Unsplash», «бесплатная лицензия Pexels» в figcaption, «Pexels» в small — подпись; «Фото: сделаем…» и длинный текст — нет');
    /* второй круг 29.09 (регрессия первого): название фотобанка или лицензии в коротком блоке снимало сверку фактов */
    say(!inP('Бесплатная доставка за 30 минут, фото с Unsplash.') && !inP('Pexels') && !inP('Все фото — Pexels, бесплатно, скидка 20% на первый заказ') && !cr('Все фото — Pexels, бесплатно, скидка 20% на первый заказ') && !isCredit({ path: 'section.photo>p', role: 'text' }, 'Фото: сделаем бесплатно в конце вечера') && !isCredit({ path: 'figure>figcaption', role: 'caption' }, 'Фото: Иван Петров · Pexels. Скидка 20% на первый заказ.'),
      'isCredit не по одному слову: фотобанк в абзаце, «Все фото — Pexels, бесплатно, скидка 20%» (и в small), «Фото: сделаем бесплатно…», подпись со скидкой — не подпись');
    const reg = lintRuns(lintView(runsOf('<p>Бесплатная доставка за 30 минут, фото с Unsplash.</p><figure><figcaption>Фото: iram shehzad, бесплатная лицензия Pexels</figcaption></figure>')), { facts: idx }).filter((f) => f.rule === 'copy-unverified').map((f) => f.match);
    say(reg.join(' | ') === 'Бесплатная | за 30 минут', `фотобанк в конце абзаца — заявления сверяются (придумано: «Бесплатная», «за 30 минут»); «бесплатная лицензия» в подписи — не заявление (${reg.join(' | ') || 'ничего'})`);
  }
  {
    const c1 = lintRuns(runsOf('<p>Меню словами, а не картинкой.</p><p>Цены в панели.</p>'), { facts: idx });
    say(c1.filter((f) => f.rule === 'copy-contrast').length === 1 && c1.every((f) => f.sev === 'NOTE'), '«X, а не Y» одно на странице — только подсказка');
  }
  const st = groupsCheck('stub.html');
  {
    const sf = st.found.filter((f) => f.rule === 'copy-stub');
    say(sf.length === 3 && sf.every((f) => f.sev === 'WARN' && f.invented && f.invented.text), `stub.html: три вида пометки придуманного (copy:stub, data-copy="stub", комментарий «ЛЕГЕНДА») — по WARN «в список для владельца» с текстом для списка (${sf.map((f) => f.sev).join(',')})`);
    const inv = lintRuns(runsOf(read('stub.html')), { facts: idx, invent: true }).filter((f) => f.rule === 'copy-stub');
    say(inv.length === 3 && inv.every((f) => f.sev === 'NOTE'), `stub.html с --invent (контент «нет — сделай сам»): пометки — подсказки, не блокировка (${inv.map((f) => f.sev).join(',')})`);
    const note = sf.find((f) => f.match === 'data-copy="stub"');
    say(!!note && note.invented.note === 'имя мастера — ждём от владельца', `data-copy-note уходит в список для владельца как note («${note && note.invented.note}»)`);
  }

  /* 2. факты */
  {
    const cl = claimsOf('Фигурки от 1 000 до 20 000 ₽ по размеру.');
    say(cl.length === 1 && cl[0].kind === 'price', `диапазон «от 1 000 до 20 000 ₽» — одно заявление (${cl.map((c) => c.text).join(' | ')})`);
    say(confirmed(idx, claimsOf('Цена 1 000–20 000 ₽')[0]), 'facts.json: «1 000–20 000 ₽» подтверждается записью «от 1 000 до 20 000 ₽»');
    const i2 = factIndex({ texts: ['Кружка стоит 1500 ₽ и 12 недель ждёт'] });
    say(!confirmed(i2, claimsOf('Кружка 500 ₽')[0]) && !confirmed(i2, claimsOf('за 2 недели')[0]) && confirmed(i2, claimsOf('всего 1 500 ₽')[0]), '«500 ₽» не подтверждается «1500 ₽», «2 недели» — «12 недель»; «1 500 ₽» — подтверждается');
    const runs = runsOf('<p>Доставим за 2 дня, гарантия 3 года.</p>');
    const none = lintRuns(runs, {});
    say(none.filter((f) => f.rule === 'copy-unverified' && f.sev === 'WARN' && f.invented).map((f) => f.match).join(' | ') === 'за 2 дня | гарантия | 3 года' && !none.some((f) => f.sev === 'FAIL'), 'нет ни facts.json, ни снимка «до» — все три заявления придуманы: WARN «в список для владельца» («за 2 дня», «гарантия», «3 года»), FAIL нет');
    const inv = lintRuns(runsOf('<p>Доставим за 2 дня, гарантия 3 года.</p>'), { invent: true }).filter((f) => f.rule === 'copy-unverified');
    say(inv.length === 3 && inv.every((f) => f.sev === 'NOTE' && f.invented) && inv[0].invented.what === 'срок', `--invent (контент «нет — сделай сам»): придуманное — подсказки, в списке — «${inv.map((f) => f.invented.what).join(', ')}»`);
    const td = lintRuns(runsOf('<p>Капучино — [цена], открыты до XXX.</p><p>Lorem ipsum dolor.</p>'), { invent: true }).filter((f) => f.rule === 'copy-todo');
    say(td.length === 3 && td.every((f) => f.sev === 'FAIL'), `незаполненное — FAIL и с --invent: [цена], XXX, Lorem ipsum (${td.map((f) => f.match).join(' | ')})`);
    const nf = lintRuns(runsOf('<p>Доставим за 2 дня, гарантия 3 года.</p>'), { noFacts: true });
    say(nf.every((f) => f.sev !== 'FAIL') && nf.some((f) => f.rule === 'copy-unchecked' && f.sev === 'WARN') && nf.some((f) => f.rule === 'copy-unverified' && f.sev === 'NOTE'), '--no-facts (разведка) — подсказки и WARN copy-unchecked, без FAIL');
    const withBase = lintRuns(runsOf('<p>Доставим за 2 дня, гарантия 3 года.</p>'), { facts: factIndex({ texts: ['Доставка за 2 дня. Гарантия на всё — 3 года.'] }) });
    say(!withBase.some((f) => f.sev === 'FAIL'), 'снимок «до» подтверждает те же числа — FAIL нет');
    const noSrc = factIndex({ facts: [{ fact: '5000 гостей', what: 'посетители' }, { fact: '20 ₽', source: 'слова владельца' }] });
    const ff = factsFindings(noSrc.noSource, 'facts.json');
    say(ff.length === 1 && ff[0].sev === 'WARN' && noSrc.facts === 1 && !confirmed(noSrc, claimsOf('5000 гостей')[0]), 'facts.json: запись без source — WARN (своим не считается) и в базу не входит');
    /* список для владельца: записи руками и других страниц остаются, записи copy.mjs проверенной страницы заменяются */
    const m = mergeInvented([{ what: 'имя мастера', text: 'Иван', page: 'a.html', by: 'руками' }, { page: 'a.html', what: 'цена', text: '999 ₽', by: 'copy.mjs' }, { page: 'b.html', what: 'цена', text: '1 ₽', by: 'copy.mjs' }],
      inventedOf([{ page: 'a.html', quote: 'Капучино 250 ₽', invented: { what: 'цена', text: '250 ₽' } }, { page: 'a.html', quote: 'Капучино 250 ₽', invented: { what: 'цена', text: '250 ₽' } }, { page: 'a.html', quote: 'Иван', invented: { what: 'текст под пометкой', text: 'Иван' } }], 'after'), ['a.html']);
    say(m.list.map((e) => `${e.page}:${e.text}`).join(' | ') === 'a.html:Иван | b.html:1 ₽ | a.html:250 ₽' && m.hand === 1 && m.added === 1, `invented.json: руками и другие страницы остаются, старое copy.mjs этой страницы заменено, повтор и то, что уже записано руками, не дублируется (${m.list.map((e) => `${e.page}:${e.text}`).join(' | ')})`);
  }

  /* 3. донор, журнал вкуса, словарь BUZZ, склейка */
  {
    const donorSet = donorShingles(['Мы печём хлеб на закваске каждое утро в старой печи у вокзала']);
    const d1 = lintRuns(runsOf('<p>Мы печём хлеб на закваске каждое утро в старой печи.</p>'), { facts: idx, donor: donorSet });
    const d2 = lintRuns(runsOf('<p>Мы печём хлеб на закваске каждое утро, приходите.</p>'), { facts: idx, donor: donorSet });
    say(d1.some((f) => f.rule === 'copy-donor-text' && f.sev === 'FAIL') && !d2.some((f) => f.rule === 'copy-donor-text'), 'донор: 8 слов подряд — FAIL copy-donor-text; 7 — нет');
    const J = [
      { by: 'user', quote: 'не надо двух тире', verdict: 'rejected', rules: ['copy-dash'], scope: 'general' },
      { by: 'user', quote: 'противопоставление в заголовках мне нравится', verdict: 'accepted', rules: ['copy-contrast'], scope: 'site', run: 'demo' },
      { by: 'self', why: 'сам отсеял капс', verdict: 'rejected', rules: ['copy-caps'], scope: 'general' },
    ];
    const T = tasteOf(J, 'demo');
    const raw = lintRuns(runsOf('<p>Кофе — это ритуал — и мы — его хранители.</p><p>Меню словами, а не картинкой.</p><p>Цены числом, а не словами.</p><p>ТОЛЬКО СЕГОДНЯ ДВОЙНОЙ ЭСПРЕССО</p>'), { facts: idx });
    const adj = applyTaste(raw, T);
    const s = (rule) => adj.filter((f) => f.rule === rule).map((f) => f.sev);
    say(s('copy-dash').every((x) => x === 'FAIL') && s('copy-contrast').every((x) => x === 'NOTE') && s('copy-caps').every((x) => x === 'WARN') && adj.find((f) => f.rule === 'copy-caps').taste.by === 'self',
      `журнал вкуса: запрет → FAIL (${s('copy-dash')}), принято в своём прогоне → подсказка (${s('copy-contrast')}), свой отсев — только пометка (${s('copy-caps')})`);
    const T2 = tasteOf(J, 'other');
    say(!T2.ok['copy-contrast'] && !!T2.bans['copy-dash'], 'журнал вкуса: принятое с областью site в другом прогоне не действует, общий запрет — действует');
    const re = new RegExp(buzzSource(), 'giu');
    const hit = (s) => { re.lastIndex = 0; return re.test(s); };
    say(hit('уникальный вкус') && hit('Идеальный пирог') && !hit('лучше, чем вчера') && !hit('индивидуальный дизайн'), 'buzzSource(): общий словарь пустых оценок для cliche.mjs ловит «уникальный», «Идеальный», но не «лучше, чем» и «индивидуальный дизайн»');
    const gl = runsOf('<p><b>Прийти</b><span>Часы</span> работы</p>'); const glv = lintView(gl).map((r) => r.lintText);
    say(gl.length === 1 && gl[0].text === 'ПрийтиЧасы работы' && glv.join(' | ') === 'Прийти | Часы работы', `склейка строчных тегов: проверка видит «${glv.join(' | ')}», типограф — исходник одним прогоном`);
    const hv = lintView(runsOf('<div class="cont"><span>Часы работы</span>\n<b>08:00 — 21:00</b>\n<small>Без выходных</small>\n<small>Кухня закрывается в 12:00, выпечка — пока не разберут.</small></div><p>Мы <b>Вас</b> ждём, <a>Условия</a>, а также <b>Шаг 1.</b>Выберите</p>')).map((r) => r.lintText.trim());
    say(hv.length === 5 && hv[2] === 'Без выходных' && hv[4] === 'Мы Вас ждём, Условия, а также Шаг 1. Выберите', `пункты без браузера: «Часы работы» · «08:00 — 21:00» · «Без выходных» · … — отдельно; «Мы <b>Вас</b>», «, а также» — одно предложение (${hv.length})`);
    const lw = lintView(runsOf('<p><b>15–45 дней</b><small>от заявки до ключей</small></p><p><span class="drop">В</span>сё началось с игр.</p>')).map((r) => r.lintText);
    say(lw[0] === '15–45 дней от заявки до ключей' && lw[1] === 'Всё началось с игр.' && claimsOf(lw[0]).map((c) => c.text).join('|') === '15–45 дней', `стык тегов со строчной: «${lw[0]}» (срок не съедает соседнее слово), буквица — «${lw[1]}»`);
    const cn = ['Мы не чиним мебель — мы возвращаем ей жизнь.', 'Это не уборка, это ликвидация последствий.', 'Бритьё — не пять минут у зеркала, а полчаса тишины.', 'Вкус не за счёт добавления специй, а за счёт дрожжей.'];
    const cnf = lintRuns(runsOf(cn.map((s) => `<p>${s}</p>`).join('')), { facts: idx }).filter((f) => f.rule === 'copy-contrast').map((f) => f.sev);
    const one = lintRuns(runsOf('<p>Если не успеваете — мы перезвоним завтра.</p>'), { facts: idx }).filter((f) => f.rule === 'copy-contrast');
    say(cnf.join(',') === 'NOTE,WARN,WARN,WARN' && !one.length, `противопоставления из свода (не X — мы Y, это не X, это Y, не [4+ слова], а Y): ${cnf.join(',')}; «Если не успеваете — мы перезвоним» не ловится`);
    const more = lintRuns(runsOf('<p>Вкуснейшее пиво и свежайший хлеб.</p><p>Топ-5 агентств России.</p><p>Делаем лэндинги, считаем KPI, UGC и ROMI, работаем с инфлюенсерами.</p><p>Команда с богатым бэкграундом.</p><p>Оптимальный выбор для водителей, создано экспертами.</p><label>Комментарий (необязательно)</label>'), { facts: idx });
    const has = (rule, m) => more.some((f) => f.rule === rule && f.match.toLowerCase().includes(m));
    say(has('copy-buzz', 'вкуснейшее') && has('copy-buzz', 'свежайший') && has('copy-unverified', 'топ-5') && has('copy-jargon', 'лэндинги') && has('copy-jargon', 'kpi') && has('copy-jargon', 'ugc') && has('copy-jargon', 'romi') && has('copy-jargon', 'инфлюенс') && has('copy-calque', 'бэкграунд') && has('copy-cliche', 'оптимальный выбор') && has('copy-cliche', 'создано экспертами') && has('copy-filler', 'необязательно'),
      'свод: вкуснейший, свежайший, Топ-5, лэндинги, KPI/UGC/ROMI, инфлюенс, бэкграунд, оптимальный выбор, создано экспертами, (необязательно) — ловятся');
    const fp = lintRuns(runsOf('<p>Ближайшая остановка — «Рынок», дальнейшие шаги пришлём.</p><h3>Lexus UX</h3><p>Полоса — доля от лучшего дня недели.</p><p>Обновляем драйверы.</p><p>Часы работы 08:00 — 21:00, выпечка — до вечера.</p>'), { facts: idx, noFacts: true }).filter((f) => f.sev !== 'NOTE' && f.rule !== 'copy-unchecked');
    say(!fp.length, `ложные срабатывания демо-сайтов сняты: ближайший/дальнейший, «Lexus UX», «от лучшего дня», «драйверы», диапазон «08:00 — 21:00» (${fp.map((f) => `${f.rule} «${f.match}»`).join('; ') || 'ноль'})`);
    const em = runsOf('<p>Скидка 🔥 для студентов</p>')[0];
    say(em.lintText.includes('🔥') && em.text.length === em.spans.length, 'эмодзи: проверка видит сам знак, у типографа — один знак на исходный отрезок');
    const at = runsOf('<head><meta name="description" content="Откройте для себя мир кофе!"></head><body><img alt="Лучший кофе" src="x.jpg"><input type="submit" value="Отправить"></body>');
    say(at.some((r) => r.role === 'attr:description') && at.some((r) => r.role === 'attr:alt') && at.some((r) => r.role === 'button' && r.attr), 'атрибуты: meta description, alt и value кнопки — отдельные прогоны');
  }

  /* 4. типограф */
  {
    const tin = read('typo-in.html'); const texp = read('typo-expected.html');
    const t1 = typographHtml(tin); const t2 = typographHtml(t1.out);
    say(t1.out === texp, 'типограф: typo-in.html → typo-expected.html байт в байт');
    say(t2.ops.length === 0, `типограф: повторный проход ничего не меняет (${t2.ops.length})`);
    say(sameMarkup(tin, t1.out).ok, 'типограф: разметка, атрибуты, script/style/pre/code/textarea и комментарии не тронуты');
    say(t1.out.includes('{{V}}') && t1.out.includes('{{ price - 1 }}'), 'типограф: {{V}} и {{ price - 1 }} на месте');
    say(typographText('Кружка 1 500 ₽ - в "Глине"').out === 'Кружка 1\u00a0500\u00a0₽\u00a0— в\u00a0«Глине»', 'типограф строки (stdin): неразрывный пробел знаком, тире, ёлочки');
  }

  /* 5. командная строка: показ по умолчанию, запись только явно, справка, неизвестный флаг, протокол */
  {
    const f = path.join(tmp, 'page.html'); fs.writeFileSync(f, read('typo-in.html'));
    const r1 = node(['fix', '--typograph', f]);
    say(r1.status === 0 && fs.readFileSync(f, 'utf8') === read('typo-in.html') && /было:/.test(r1.stdout) && /стало:/.test(r1.stdout), 'fix --typograph без флагов — показ «было / стало», файл не тронут');
    const r2 = node(['fix', '--typograph', f, '--write']);
    say(r2.status === 0 && fs.readFileSync(f, 'utf8') === read('typo-expected.html'), 'fix --typograph --write — записан, совпадает с ожидаемым');
    const r3 = node(['fix', '--typograph', f, '--write', '--dry-run']);
    say(r3.status === 1 && /--dry-run/.test(r3.stderr), '--dry-run вместе с --write — ошибка');
    const r4 = node(['--help']);
    say(r4.status === 0 && /fix --typograph/.test(r4.stdout) && /Код выхода/.test(r4.stdout), '--help — справка из шапки, код 0');
    const r5 = node(['lint', f, '--fatcs', 'x.json']);
    say(r5.status === 1 && /неизвестный флаг/.test(r5.stderr) && /--facts/.test(r5.stderr), `неизвестный флаг — ошибка с подсказкой (${clip(r5.stderr.trim(), 90)})`);
    const r6 = node(['rules', '--json']);
    let rj = null; try { rj = JSON.parse(r6.stdout); } catch { /* нет */ }
    say(r6.status === 0 && rj && Object.keys(rj.rules).length === Object.keys(RULES).length, `rules --json — каталог (${rj ? Object.keys(rj.rules).length : 0} правил)`);
    const runDirT = path.join(tmp, 'run');
    const r7 = node(['lint', path.join(FIXTURES, 'bad.html'), '--out', runDirT, '--tag', 'after', '--facts', path.join(FIXTURES, 'facts.json'), '--quiet']);
    let pj = null; try { pj = JSON.parse(fs.readFileSync(path.join(runDirT, 'copy', 'after.json'), 'utf8')); } catch { /* нет */ }
    say(r7.status === 1 && pj && pj.verdict === 'FAIL' && pj.generator && pj.generator.script === 'copy.mjs' && pj.steps[0].what === 'bad.html' && pj.findings.length > 10 && pj.pages[0].runs.length > 10, `lint --out: протокол copy/after.json (verdict ${pj && pj.verdict}, generator ${pj && pj.generator && pj.generator.script}, шагов ${pj ? pj.steps.length : 0}), код 1 при FAIL`);
    /* FAIL у bad.html — от незаполненного ([уточнить: …], {{TITLE}}), а не от придуманного */
    const failRules = pj ? [...new Set(pj.findings.filter((f) => f.sev === 'FAIL').map((f) => f.rule))] : [];
    say(failRules.length === 1 && failRules[0] === 'copy-todo' && pj.findings.some((f) => f.rule === 'copy-unverified' && f.sev === 'WARN'), `bad.html: FAIL только незаполненное (${failRules.join(', ') || '—'}), придуманное — WARN`);
    let ij = null; try { ij = JSON.parse(fs.readFileSync(path.join(runDirT, 'copy', 'invented.json'), 'utf8')); } catch { /* нет */ }
    say(Array.isArray(ij) && ij.length > 0 && ij.length === pj.totals.invented && ij.every((e) => e.by === 'copy.mjs' && e.page === 'bad.html' && e.what && e.text && e.tag === 'after') && ij.some((e) => /5000/.test(e.text)) && pj.options.invented && /Придумано — проверить владельцу: .*invented\.json — записей \d+/.test(r7.stdout),
      `lint --out: список для владельца copy/invented.json (${Array.isArray(ij) ? ij.length : 'нет'} записей: ${Array.isArray(ij) ? ij.slice(0, 3).map((e) => `${e.what} «${e.text}»`).join(', ') : '—'}), строка «Придумано — проверить владельцу»`);
    fs.writeFileSync(path.join(runDirT, 'copy', 'invented.json'), JSON.stringify([...ij || [], { what: 'отзыв гостя', text: '«Раф как в Питере» — Анна', page: 'bad.html', by: 'руками' }], null, 1));
    const r7b = node(['lint', path.join(FIXTURES, 'bad.html'), '--out', runDirT, '--tag', 'after', '--facts', path.join(FIXTURES, 'facts.json'), '--quiet']);
    let ij2 = null; try { ij2 = JSON.parse(fs.readFileSync(path.join(runDirT, 'copy', 'invented.json'), 'utf8')); } catch { /* нет */ }
    say(r7b.status === 1 && Array.isArray(ij2) && ij2.length === ij.length + 1 && ij2.some((e) => e.by === 'руками' && /Анна/.test(e.text)), `повторный lint --out: запись руками в invented.json цела, записи copy.mjs не удвоились (${Array.isArray(ij2) ? ij2.length : 'нет'} = ${ij ? ij.length : 0} + 1)`);
    const r7c = node(['lint', path.join(FIXTURES, 'bad.html'), '--release']);
    say(r7c.status === 1 && /--release \(снят 30\.09\.2026/.test(r7c.stderr) && /copy\/invented\.json/.test(r7c.stderr), `снятый --release — ошибка с объяснением (${clip(r7c.stderr.trim(), 100)})`);
    const r8 = node(['snapshot', path.join(FIXTURES, 'pairs-before.html'), '--out', runDirT]);
    const r9 = node(['pairs', path.join(runDirT, 'copy', 'before.json'), path.join(FIXTURES, 'pairs-after.html'), '--md']);
    say(r8.status === 0 && r9.status === 0 && /→/.test(r9.stdout) && /новое число или обещание: 5 000 ₽/.test(r9.stdout) && /убрано:/.test(r9.stdout) && !/Контакты/.test(r9.stdout), `snapshot → pairs --md: пары, новое число помечено, неизменённое не печатается`);
    const r10 = node(['lint', path.join(FIXTURES, 'pairs-after.html'), '--run', runDirT, '--quiet']);
    say(r10.status === 0 && /Итог: WARN/.test(r10.stdout) && /copy-unverified/.test(r10.stdout) && /придумано 1/.test(r10.stdout) && /сайт «до»/.test(r10.stdout) && /список для владельца пишется с --out/.test(r10.stdout), `lint --run: снимок «до» и facts.json из папки прогона подхватываются сами; новая цена без источника — WARN «придумано», код 0 (${clip((r10.stdout.match(/Итог:.*/) || [''])[0], 110)})`);
    const r11 = node(['fix', '--typograph', '-'], 'Приходи в 10:00-19:00, скидка 20 %');
    say(r11.status === 0 && r11.stdout === 'Приходи в\u00a010:00–19:00, скидка 20\u00a0%', `fix --typograph - (stdin) → «${showNb(r11.stdout)}»`);
  }

  /* 5б. страницы нет в снимке «до» (epicentr 29.09: before.json с /, /menu, /afisha, lint по /booking — 7 FAIL без
     объяснения); команда пропущена («copy.mjs <url>») */
  {
    const nbRun = path.join(tmp, 'nobase');
    const r12 = node(['snapshot', path.join(FIXTURES, 'nobase', 'before'), '--out', nbRun]);
    const r13 = node(['lint', path.join(FIXTURES, 'nobase', 'after'), '--run', nbRun, '--json', path.join(tmp, 'nobase.json')]);
    let nj = null; try { nj = JSON.parse(fs.readFileSync(path.join(tmp, 'nobase.json'), 'utf8')); } catch { /* нет */ }
    const nbw = nj ? nj.findings.filter((x) => x.rule === 'copy-unchecked') : [];
    say(r12.status === 0 && r13.status === 0 && nbw.length === 1 && nbw[0].page === 'booking.html' && nbw[0].sev === 'WARN' && /нет снимка «до» для booking\.html — в список придуманного могли попасть факты с сайта «до»/.test(r13.stdout) && /--pages "index\.html,menu\.html,booking\.html"/.test(r13.stdout) && /Итог: WARN .*без снимка «до»: booking\.html \(придумано там 1 — может быть с сайта «до»\)/.test(r13.stdout) && JSON.stringify(nj.totals.pagesNoBase) === '["booking.html"]' && nj.totals.inventedNoBase === 1,
      `lint: страницы нет в снимке «до» — WARN copy-unchecked «нет снимка «до» для booking.html — в список придуманного могли попасть факты с сайта «до»», команда снять снимок и строка итога, код 0 (${nbw.map((x) => `${x.page} ${x.sev}`).join(', ') || 'нет'}; код ${r13.status}); index.html и menu.html — без него`);
    /* второй круг 29.09: по одной странице с каждой стороны (снимок с главной, lint одной booking.html) — было без
       объяснения; та же страница под тем же именем (index.html ↔ index.html) — без WARN */
    const one = path.join(tmp, 'nobase1');
    const r15 = node(['snapshot', path.join(FIXTURES, 'nobase', 'before', 'index.html'), '--out', one]);
    const r16 = node(['lint', path.join(FIXTURES, 'nobase', 'after', 'booking.html'), '--run', one, '--json', path.join(tmp, 'nobase1.json')]);
    const r17 = node(['lint', path.join(FIXTURES, 'nobase', 'after', 'index.html'), '--run', one, '--json', path.join(tmp, 'nobase1-same.json')]);
    let j16 = null, j17 = null; try { j16 = JSON.parse(fs.readFileSync(path.join(tmp, 'nobase1.json'), 'utf8')); j17 = JSON.parse(fs.readFileSync(path.join(tmp, 'nobase1-same.json'), 'utf8')); } catch { /* нет */ }
    const w16 = j16 ? j16.findings.filter((x) => x.rule === 'copy-unchecked') : [];
    say(r15.status === 0 && r16.status === 0 && w16.length === 1 && w16[0].sev === 'WARN' && /снят с одной страницы — index\.html: если это она же под другим именем, список придуманного верный/.test(w16[0].suggest) && r17.status === 0 && j17 && !j17.findings.some((x) => x.rule === 'copy-unchecked'),
      `lint одной страницы при снимке «до» с другой (index.html → booking.html): WARN copy-unchecked и «если это она же под другим именем…» (${w16.map((x) => x.sev).join(', ') || 'нет'}, код ${r16.status}); index.html ↔ index.html — без WARN (код ${r17.status})`);
    const r14 = node(['http://localhost:9/', '--pages', '/,/menu']);
    say(r14.status === 1 && /нужна команда: lint\|/.test(r14.stderr) && /node copy\.mjs lint http:\/\/localhost:9\/ --pages \/,\/menu/.test(r14.stderr), `без команды: ${clip(r14.stderr.trim(), 110)}`);
  }

  /* 6. связи: taste.mjs знает правила copy-*, cliche.mjs загружается с общим словарём */
  {
    const tdir = path.join(tmp, 'taste');
    const t1 = spawnSync(process.execPath, [path.join(HERE, 'taste.mjs'), 'add', '--dir', tdir, '--block', 'copy', '--rule', 'copy-contrast', '--verdict', 'rejected', '--by', 'self', '--why', 'стенд', '--run', 'selftest'], { encoding: 'utf8', windowsHide: true });
    const t2 = spawnSync(process.execPath, [path.join(HERE, 'taste.mjs'), 'add', '--dir', tdir, '--block', 'copy', '--rule', 'copy-nope', '--verdict', 'rejected', '--by', 'self', '--why', 'стенд', '--run', 'selftest'], { encoding: 'utf8', windowsHide: true });
    say(t1.status === 0 && t2.status === 1 && /неизвестные правила: copy-nope/.test(t2.stderr), 'taste.mjs add --rule copy-contrast принимается, copy-nope — «неизвестные правила»');
    const c1 = spawnSync(process.execPath, [path.join(HERE, 'cliche.mjs'), '--help'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    say(c1.status === 0 && c1.stdout.length > 200, 'cliche.mjs --help работает с импортом словаря из copy-rules.mjs');
  }

  /* 7. режим адреса: браузер видит тексты, которые дорисовал JS, и блочность по стилям */
  if (!opt['no-browser']) {
    const B = { browser: null };
    try {
      const col = await urlPages(pathToFileURL(path.join(FIXTURES, 'url.html')).href, { viewport: 'mobile' }, B);
      const runs = col.pages[0].lint; const found = lintRuns(runs, { facts: idx });
      const txt = runs.map((r) => r.lintText).join(' | ');
      say(found.some((f) => f.rule === 'copy-cliche') && /команда профессионалов/.test(txt), 'адрес: текст, который вставил JS, проверен (copy-cliche)');
      say(runs.some((r) => r.lintText === 'Часы работы') && runs.some((r) => r.visible === false && /Скрытое/.test(r.lintText)), 'адрес: блок по вычисленному display — отдельный прогон; display:none — visible:false');
      /* h1 со скрытым span: в браузере span блочный (position:absolute) — три прогона одного заголовка; двоеточие
         в середине заголовка — не «в конце» (epicentr 29.09: WARN copy-heading на span.mh-sr) */
      const ep = await urlPages(pathToFileURL(path.join(FIXTURES, 'epicentr.html')).href, { viewport: 'mobile' }, B);
      const h1runs = ep.pages[0].runs.filter((r) => r.role === 'h1');
      const eg = groupsCheck('epicentr.html (адрес)', {}, ep.pages[0].runs);
      say(h1runs.length === 3 && !eg.found.some((f) => f.rule === 'copy-heading'), `адрес: h1 из ${h1runs.length} прогонов (${h1runs.map((r) => `«${collapse(r.lintText)}»`).join(' + ')}) судится целиком — copy-heading нет`);
      const hc = lintRuns(lintView(runsOf('<h2><span style="display:block" data-copy-b>Что входит</span> <span data-copy-b>в стоимость:</span></h2><p>Замер и доставка.</p>')), { facts: idx }).filter((f) => f.rule === 'copy-heading');
      say(hc.length === 1 && hc[0].quote === 'Что входит в стоимость:', `заголовок из двух прогонов с двоеточием в конце всего заголовка — WARN, цитата целиком («${hc[0] ? hc[0].quote : '—'}»)`);
    } catch (e) { say(false, `адрес: ${e.message}`); } finally { if (B.browser) await B.browser.close().catch(() => {}); }
  } else console.log('--    режим адреса пропущен (--no-browser)');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${bad ? 'FAIL' : 'OK'}: проверок ${n}, провалов ${bad}`);
  return bad ? 1 : 0;
}

/* CLI — только когда файл запущен сам, а не импортирован */
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === SELF.toLowerCase()) process.exitCode = await main(process.argv.slice(2));
