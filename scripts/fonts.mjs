#!/usr/bin/env node
/**
 * Шрифты Google с кириллицей: подобрать по характеру и скачать к себе — файлы woff2 и fonts.css в папку сайта.
 * Google Fonts — источник по умолчанию: бесплатно, лицензии свободные (почти всё — SIL OFL 1.1, несколько
 * семейств — Apache 2.0 и Ubuntu Font Licence), кириллица есть у 293 семейств из 1934. На сайте — свои файлы,
 * а не CDN Google (reference/typography.md §16); надпись-логотип — подмножеством ровно под её знаки (--text).
 *
 *   node fonts.mjs pick [--category serif|sans-serif|display|handwriting|monospace] [--like "<характер по-русски>"]
 *                       [--need "₽№«»—"] [--weights 400,700] [--italic] [--variable] [--n 10]
 *   node fonts.mjs pairs [слова по-английски: luxury, editorial, tech…]
 *   node fonts.mjs get "<Семейство>" --out <папка сайта> [--weights 400,700 | --weights 300..800] [--italic]
 *                      [--subsets cyrillic,latin,latin-ext] [--text "Надпись"] [--need "₽№"]
 *   node fonts.mjs --selftest
 *   node fonts.mjs --help   (или -h)
 *
 * pick   кандидаты только с подмножеством cyrillic (данные ui-ux-pro-max, google-fonts.csv); шрифты-заглушки
 *        Symbols (Flow Circular и др.) не предлагаются. Таблица: семейство, категория, начертания, оси,
 *        подмножества, место по популярности, характер (с --like), пометки, ссылка specimen; под ней — команда
 *        get для первого. Порядок: сначала те, у кого есть подмножества под --need, потом больше совпавших слов
 *        характера и их вес, потом без пометок, потом популярнее. Пометки опускают шрифт ниже:
 *        «ИИ-набор» — Inter, Manrope, Onest, Montserrat… (cliche.mjs overused-font; брать, только если это язык
 *        донора — typography.md §5); «CJK» — японский, китайский или корейский шрифт, кириллица в нём довеском;
 *        «декоративный» (Rubik Glitch, Rubik Wet Paint…), «церковнославянский», «пиксельный» — если их не просили.
 * pairs  пары «заголовки → текст» из typography.csv (74 пары, признака языка в данных нет): годятся только
 *        те, где кириллица есть у обоих шрифтов; отброшенные — по шрифту без кириллицы. Слова после pairs
 *        отбирают пары по названию, настроению и назначению (данные по-английски). Под таблицей — команды get
 *        для первой пары.
 * get    CSS2 API Google Fonts с User-Agent современного Chrome (иначе приходит не woff2) → файлы в
 *        <папка>/fonts/ и <папка>/fonts/fonts.css: @font-face с unicode-range и font-display: swap, раздел на
 *        семейство между метками fonts.mjs. Повторный get того же семейства заменяет свой раздел и удаляет свои
 *        прежние файлы, которых больше нет; чужие разделы и свой CSS вне меток не трогает. Переменный шрифт
 *        (Google отдаёт один файл на все веса) — один @font-face с диапазоном веса из самого файла (ось wght).
 *        Затем проверка по таблице знаков (cmap) скачанных файлов — по объединению подмножеств, как их получит
 *        страница: кириллица (66 букв с Ёё), знаки ₽№«»„“—–… и --need; с --text — каждый знак надписи.
 *        Не прошло по правилу — ничего не записывается. Итог: файлы с размерами, строки подключения и команда
 *        проверки отрисовкой. Сеть — только здесь: fonts.googleapis.com и fonts.gstatic.com.
 *
 * Флаги:
 *   --category <кат>   pick: serif, sans-serif (или sans), display, handwriting, monospace (или mono); несколько —
 *                      через запятую.
 *   --like <слова>     pick: характер по-русски (или по-английски); «не …» и «без …» — исключить. Слова:
 *                      строгий, гротеск (без засечек), геометричный, гуманистический, тёплый, текстовый, рукописный
 *                      (от руки), каллиграфический, антиква (с засечками), книжный, классический, узкий, широкий,
 *                      винтажный (ретро), технический, моноширинный, мягкий (округлый), жирный, акцидентный
 *                      (плакатный, для заголовков), элегантный (дорогой, модный), контрастный, современный,
 *                      игривый (детский), брусковый, пиксельный, славянский (церковный), декоративный, тонкий.
 *                      Характер задан картой известных семейств и признаками данных: категория, классификация,
 *                      веса, имя (Condensed, Rounded). Узкий и широкий — только по имени и карте: ось wdth видна
 *                      в таблице, но get просит у Google только ось веса, и файл приходит обычной ширины.
 *                      Незнакомое слово — WARN.
 *   --need <знаки>     pick: какие знаки нужны; у каждого — подмножество Google: ₽ — latin-ext, № и Ё —
 *                      cyrillic, «»„“—–… — latin. Нет подмножества — пометка, шрифт ниже; есть ли сам знак в
 *                      шрифте, скажет только файл — get. get: знаки к проверке сверх ₽№«»„“—–…
 *   --weights <веса>   pick: нужные веса (все). get: веса через запятую (400,700) или диапазон переменного
 *                      шрифта (300..800); по умолчанию 400 и 700 — те, что есть (иначе ближайший к 400).
 *                      Веса сверяются с данными до сети и с ответом Google после: Google молча выбрасывает то,
 *                      чего у шрифта нет (900 у Manrope, 700 у Yeseva One), — это WARN «не отдал».
 *   --italic           pick: нужен курсив (с --weights — у каждого веса). get: курсив тех же весов.
 *   --variable         pick: только переменные шрифты (есть оси).
 *   --n <число>        pick: сколько строк, по умолчанию 10 (-n — то же).
 *   --subsets <имена>  get: подмножества, по умолчанию cyrillic,latin,latin-ext: браузер качает файл, только когда
 *                      на странице есть его знаки, а без latin-ext знак ₽ рисуется системным шрифтом. Нет cyrillic
 *                      в ответе Google — отказ (код 2), нет другого — WARN.
 *   --text <надпись>   get: подмножество ровно под знаки надписи (логотип, крупное слово; параметр text= API) —
 *                      один файл на вес, килобайт-два. Надпись сменилась — скачать заново; несколько надписей
 *                      одним шрифтом — одной строкой («Зёрна Кофе с собой»). У него свой раздел «<Семейство> ·
 *                      надпись» с unicode-range знаков надписи: полному разделу не мешает.
 *   --out <папка>      get: папка сайта; файлы — в <папка>/fonts/.
 *   --selftest         без сети: разбор CSV (кавычки, запятые и переводы строк в полях, BOM, CRLF), фильтры pick
 *                      и карта характера, pairs, адрес CSS2 (пробелы, веса, курсив, диапазон, text= с кириллицей),
 *                      разбор сохранённых ответов CSS2 (fixtures/fonts), fonts.css (переменный шрифт, слияние
 *                      разделов), таблица знаков WOFF2 (живой файл надписи и синтетические), get целиком на своём
 *                      сервере, опечатка во флаге, get без сети. Код 1 — не прошло.
 *   --help, -h         эта справка.
 *
 * Проверка отрисовкой — cyrillic-check.mjs навыка design-reference (Chrome): get печатает точную команду по
 * скачанному файлу cyrillic и вариант для поднятого сайта (serve.mjs) — ровно то, что сайт грузит.
 * У подмножества надписи этой пробы нет: букв пробы в нём нет, хватает таблицы знаков.
 *
 * Данные: FONTS_DATA_DIR или ~/.claude/skills/ui-ux-pro-max/data (google-fonts.csv, typography.csv,
 * google-font-licenses.json — лицензия в шапке раздела fonts.css). Без данных pick и pairs — FAIL, get идёт
 * без сверки весов. FONTS_API_BASE — другой адрес с тем же CSS2 API (самопроверка поднимает свой; файлы тогда
 * разрешены и с его адреса). Переменные — в окружении или в ~/.claude/site-rework/.env.
 *
 * Итог каждой команды — строка OK / WARN / FAIL.
 * Коды выхода: 0 — сделано (OK или WARN); 1 — ошибка: аргументы, нет данных, сеть, ответ API, файл;
 * 2 — не сделано по правилу: у шрифта нет кириллицы (в ответе или в файлах), в подмножестве надписи нет её знаков.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, ensureDir, closestFlag } from './lib.mjs';
import { loadEnv } from './media/net.mjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const HELP = fs.readFileSync(SELF, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
/* «-n 5», как у привычных утилит: parseArgs знает только «--», поэтому -n становится --n до разбора */
const ARGV = process.argv.slice(2).map((a) => (a === '-n' ? '--n' : a));
const VALUE_FLAGS = ['category', 'like', 'need', 'weights', 'n', 'subsets', 'text', 'out'];
const { pos, opt } = parseArgs(ARGV, { flags: ['help', 'h', 'italic', 'variable', 'selftest'], optional: VALUE_FLAGS, commands: ['pick', 'pairs', 'get', 'selftest'], strict: true });
/* «-h» parseArgs кладёт в позиционные */
if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
loadEnv();

/* ---------- постоянные ---------- */

const DATA_DIR = process.env.FONTS_DATA_DIR ? path.resolve(process.env.FONTS_DATA_DIR) : path.join(os.homedir(), '.claude', 'skills', 'ui-ux-pro-max', 'data');
const API_BASE = String(process.env.FONTS_API_BASE || 'https://fonts.googleapis.com').replace(/\/+$/, '');
/* файлы — только с fonts.gstatic.com (и с подменённого адреса API — самопроверка, зеркало) */
const FILE_ORIGINS = new Set(['https://fonts.gstatic.com', ...(process.env.FONTS_API_BASE ? [new URL(API_BASE).origin] : [])]);
/* без современного браузера в User-Agent CSS2 API отдаёт ttf вместо woff2 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const CYR_LETTERS = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const RU_SIGNS = '₽№«»„“—–…';
const DEFAULT_SUBSETS = ['cyrillic', 'latin', 'latin-ext'];
const CATEGORIES = { serif: 'Serif', 'sans-serif': 'Sans Serif', display: 'Display', handwriting: 'Handwriting', monospace: 'Monospace' };
const CAT_ALIAS = { sans: 'sans-serif', mono: 'monospace' };
const SKILL_CMD = 'node ~/.claude/skills/site-rework/scripts/fonts.mjs';
const CYR_CHECK = 'node ~/.claude/skills/design-reference/scripts/cyrillic-check.mjs';
/* подмножества Google Fonts — unicode-range из ответа CSS2 API (30.09.2026, Manrope) */
const SUBSET_RANGES = {
  'cyrillic-ext': 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F',
  cyrillic: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
  'greek-ext': 'U+1F00-1FFF',
  greek: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF',
  vietnamese: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
  'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
};
const LICENSES = { OFL: ['SIL Open Font License 1.1', 'https://openfontlicense.org'], APACHE2: ['Apache License 2.0', 'https://www.apache.org/licenses/LICENSE-2.0'], UFL: ['Ubuntu Font Licence 1.0', 'https://ubuntu.com/legal/font-licence'] };
/* «ИИ-набор» — правило overused-font в cliche.mjs; список берётся оттуда (одно место), это — запасная копия */
const OVERUSED_FALLBACK = /^(inter( var| variable| tight| display)?|geist( sans| mono)?|manrope|space grotesk|instrument serif|dm sans|plus jakarta sans|poppins|outfit|sora|satoshi|general sans|onest|montserrat|golos( text)?)$/i;
const OVERUSED = loadOverused();
const STACK_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const STACK_SERIF = "Georgia, 'Times New Roman', serif";
const STACK_MONO = "ui-monospace, 'Cascadia Mono', Consolas, 'Courier New', monospace";

class Fail extends Error { constructor(msg, code = 1) { super(msg); this.code = code; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (n) => `${(n / 1024).toFixed(1)} КБ`;
const uniq = (a) => [...new Set(a)];
const cp = (ch) => ch.codePointAt(0);

function loadOverused() {
  try {
    const src = fs.readFileSync(path.join(HERE, 'cliche.mjs'), 'utf8');
    const m = /const OVERUSED = \/(.+)\/([a-z]*);/.exec(src);
    if (m) return Object.assign(new RegExp(m[1], m[2]), { fromCliche: true });
  } catch { /* cliche.mjs рядом нет — запасная копия */ }
  return OVERUSED_FALLBACK;
}

/* ---------- CSV ---------- */

/** CSV → массив строк-массивов: кавычки, "" внутри, запятые и переводы строк в полях, BOM, CRLF и CR. */
export function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, '');
  const rows = []; let row = []; let f = ''; let q = false; let any = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') { q = true; any = true; }
    else if (c === ',') { row.push(f); f = ''; any = true; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      if (any || f) { row.push(f); rows.push(row); }
      row = []; f = ''; any = false;
    } else { f += c; any = true; }
  }
  if (any || f) { row.push(f); rows.push(row); }
  return rows;
}
/** CSV с заголовком → { header, rows: [{поле: значение}], bad: строк другой длины }. */
function csvObjects(text) {
  const [header = [], ...body] = parseCsv(text);
  const h = header.map((x) => x.trim());
  return { header: h, bad: body.filter((r) => r.length !== h.length).length, rows: body.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))) };
}

/* ---------- данные ui-ux-pro-max ---------- */

const splitBar = (s) => String(s || '').split('|').map((x) => x.trim()).filter(Boolean);
function fontFrom(r) {
  const normal = [], italic = [];
  for (const st of splitBar(r.Styles)) { const m = /^(\d+)(i?)$/.exec(st); if (m) (m[2] ? italic : normal).push(+m[1]); }
  const axes = {};
  for (const a of splitBar(r['Variable Axes'])) { const m = /^([A-Za-z0-9]{4})\s*:\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)$/.exec(a); if (m) axes[m[1]] = [+m[2], +m[3]]; }
  const cat = Object.keys(CATEGORIES).find((k) => CATEGORIES[k] === r.Category) || String(r.Category || '').toLowerCase();
  const family = String(r.Family).trim();
  return {
    family, cat, stroke: String(r.Stroke || '').toLowerCase(), cls: splitBar(r.Classifications).map((x) => x.toLowerCase()),
    normal: normal.sort((a, b) => a - b), italic: italic.sort((a, b) => a - b), axes, subsets: splitBar(r.Subsets),
    designers: r.Designers || '', popularity: Number(r['Popularity Rank']) || 9999, added: r['Date Added'] || '',
    url: r['Google Fonts URL'] || `https://fonts.google.com/specimen/${family.replace(/ /g, '+')}`,
  };
}
function loadFonts(dir = DATA_DIR) {
  const file = path.join(dir, 'google-fonts.csv');
  if (!fs.existsSync(file)) return null;
  const { rows, bad, header } = csvObjects(fs.readFileSync(file, 'utf8'));
  return { file, bad, header, list: rows.filter((r) => String(r.Family || '').trim()).map(fontFrom) };
}
function requireFonts() {
  const d = loadFonts();
  if (!d) throw new Fail(`нет данных ${path.join(DATA_DIR, 'google-fonts.csv')} — навык ui-ux-pro-max не установлен или FONTS_DATA_DIR указывает не туда (reference/craft.md → «UI UX Pro Max»)`);
  return d;
}
function loadPairs(dir = DATA_DIR) {
  const file = path.join(dir, 'typography.csv');
  if (!fs.existsSync(file)) return null;
  return csvObjects(fs.readFileSync(file, 'utf8')).rows.filter((r) => String(r['Heading Font'] || '').trim())
    .map((r) => ({ no: String(r.No || '').trim(), name: String(r['Font Pairing Name'] || '').trim(), cat: r.Category || '', head: r['Heading Font'].trim(), body: String(r['Body Font'] || '').trim(), mood: r['Mood/Style Keywords'] || '', best: r['Best For'] || '' }));
}
function loadLicenses(dir = DATA_DIR) {
  try { return new Map(JSON.parse(fs.readFileSync(path.join(dir, 'google-font-licenses.json'), 'utf8')).families.map((f) => [f.name.toLowerCase(), f.license])); } catch { return new Map(); }
}

const hasCyr = (f) => f.subsets.includes('cyrillic');
const isCJK = (f) => f.subsets.some((s) => /^(japanese|korean|chinese-)/.test(s));
const inAxis = (f, w) => !!f.axes.wght && w >= f.axes.wght[0] && w <= f.axes.wght[1];
const hasWeight = (f, w, italic = false) => (f.normal.includes(w) || inAxis(f, w)) && (!italic || f.italic.includes(w) || (f.italic.length > 0 && inAxis(f, w)));
const maxW = (f) => Math.max(0, ...f.normal, f.axes.wght ? f.axes.wght[1] : 0);
const minW = (f) => Math.min(1000, ...f.normal, f.axes.wght ? f.axes.wght[0] : 1000);

/* ---------- характер: карта известных семейств и признаки данных ---------- */

const L = (s) => new Set(s.split(/\s*,\s*/).filter(Boolean));
export const FAM = {
  strict: L('Inter, Roboto, Arimo, IBM Plex Sans, Golos Text, Onest, Geist, Noto Sans, PT Sans, Source Sans 3, Manrope, Inter Tight, Libre Franklin, Wix Madefor Text, Wix Madefor Display, Commissioner, Geologica, Sofia Sans, Akt, SN Pro, Nata Sans, Finlandica Text, Ubuntu Sans, Roboto Flex, Liter, Carlito, Gidole, Open Sans, Fira Sans, Roboto Condensed, PT Sans Narrow, PT Serif, Source Serif 4, IBM Plex Serif, Noto Serif, STIX Two Text, Tinos, Literata, Roboto Serif, IBM Plex Mono, Roboto Mono, PT Mono'),
  grotesk: L('Inter, Roboto, Arimo, IBM Plex Sans, Golos Text, Onest, Geist, Inter Tight, Libre Franklin, Wix Madefor Text, Wix Madefor Display, Commissioner, Geologica, Akt, SN Pro, Nata Sans, Roboto Flex, Science Gothic, News Cycle, Liter, Gidole, Pliant, TikTok Sans, Finlandica Text, Finlandica Headline, Moderustic, Manrope, Sofia Sans, Ubuntu Sans, Oswald, Roboto Condensed, Alumni Sans, Rubik'),
  geometric: L('Montserrat, Montserrat Alternates, Jost, Raleway, Unbounded, Comfortaa, Didact Gothic, Nunito, Nunito Sans, Mulish, Poiret One, Russo One, Days One, Exo 2, Jura, Manrope, Tenor Sans, Sansation, Prosto One, Rubik, Advent Pro, Tektur, Play, Moderustic, M PLUS Rounded 1c, Zen Maru Gothic, Seymour One, Stalinist One, Rubik Mono One'),
  humanist: L('Open Sans, PT Sans, PT Sans Narrow, PT Sans Caption, Fira Sans, Fira Sans Condensed, Fira Sans Extra Condensed, Source Sans 3, Ubuntu, Ubuntu Condensed, Alegreya Sans, Alegreya Sans SC, Arsenal, Ysabeau, Ysabeau Office, Ysabeau Infant, Carlito, Istok Web, Noto Sans, Scada, Lunasima, Andika, Philosopher, Marmelad, Cuprum, Libertinus Sans, Nobile'),
  warm: L('Open Sans, PT Sans, Fira Sans, Source Sans 3, Ubuntu, Alegreya, Alegreya Sans, Nunito, Arsenal, Ysabeau, Lora, Literata, Vollkorn, EB Garamond, Spectral, Cormorant, Cormorant Garamond, Alice, Kurale, Bitter, Merriweather, PT Serif, Brygada 1918, Gentium Book Plus, Charis SIL, Philosopher, Marmelad, Comfortaa, Caveat, Andika, Bellota Text, Lunasima, Piazzolla, Balsamiq Sans, Pangolin, Playpen Sans, Rubik, Mulish, M PLUS Rounded 1c, Neucha, Gabriela, Podkova'),
  handdrawn: L('Shantell Sans, Balsamiq Sans, Comic Relief, Lobster'),
  callig: L('Great Vibes, Marck Script, Bad Script, Comforter, Comforter Brush, Lobster, Pacifico'),
  textSerif: L('Literata, PT Serif, Source Serif 4, Lora, Merriweather, Noto Serif, EB Garamond, Cormorant Garamond, Spectral, Alegreya, Vollkorn, STIX Two Text, Charis SIL, Gentium Book Plus, Libertinus Serif, Piazzolla, Brygada 1918, Bona Nova, Roboto Serif, IBM Plex Serif, Tinos, Playfair Display, Playfair, Prata, Old Standard TT, Cormorant, Alice, Kurale, Oranienbaum, Bitter'),
  bookish: L('Literata, PT Serif, Source Serif 4, Merriweather, Lora, Noto Serif, Charis SIL, Gentium Book Plus, Alegreya, Spectral, EB Garamond, Vollkorn, STIX Two Text, Libertinus Serif, Bona Nova, Piazzolla, Brygada 1918, Roboto Serif, IBM Plex Serif, Cormorant Garamond, Bitter, Tinos'),
  classic: L('PT Serif, Lora, Merriweather, EB Garamond, Cormorant Garamond, Cormorant, Old Standard TT, Playfair Display, Noto Serif, Literata, Spectral, Vollkorn, Alegreya, Tinos, STIX Two Text, Alice, Prata, Forum, Oranienbaum, Libertinus Serif, Bona Nova'),
  classicSans: L('PT Sans, Roboto, Open Sans, Arimo, Libre Franklin, Noto Sans'),
  narrow: L('Oswald, Alumni Sans, Alumni Sans SC, Alumni Sans Pinstripe, Alumni Sans Collegiate One, Yanone Kaffeesatz, Cuprum, Amatic SC, Tektur, Handjet'),
  wide: L('Unbounded, Russo One, Days One, Dela Gothic One, Seymour One, Stalinist One, Rubik Mono One, Science Gothic, Advent Pro, Pliant, Prosto One'),
  wideSoft: L('Montserrat, Montserrat Alternates, Martian Mono'),
  vintage: L('Old Standard TT, Oranienbaum, Kurale, Ruslan Display, Yeseva One, Forum, Kelly Slab, Podkova, Alice, Vollkorn, EB Garamond, Cormorant, Cormorant Garamond, Cormorant SC, Cormorant Unicase, Brygada 1918, Ledger, Lobster, Pacifico, Stalinist One, Playfair Display, Prata, Viaoda Libre, Gabriela, Orelega One, Rubik 80s Fade, Underdog, Bona Nova, Libertinus Serif Display, Oi'),
  tech: L('Tektur, Jura, Play, Exo 2, Russo One, Advent Pro, Sansation, Handjet, Gidole, Science Gothic, Press Start 2P, Pixelify Sans, Tiny5, DotGothic16, Rubik Mono One, Martian Mono'),
  soft: L('Comfortaa, Nunito, M PLUS Rounded 1c, Zen Maru Gothic, Kosugi Maru, Balsamiq Sans, Bellota, Bellota Text, Playpen Sans, Marmelad, Chiron GoRound TC'),
  softish: L('Rubik, Nunito Sans, Pangolin, Shantell Sans, Comic Relief, Andika, Huninn, Mulish'),
  heavy: L('Dela Gothic One, Russo One, Stalinist One, Rubik Mono One, Seymour One, Days One, Ruslan Display, Yeseva One, Oi, Climate Crisis, Prosto One, Alumni Sans Collegiate One, Unbounded, Orelega One, Lobster'),
  elegant: L('Playfair Display, Playfair, Cormorant, Cormorant Garamond, Cormorant Infant, Cormorant SC, Prata, Forum, Tenor Sans, Poiret One, Raleway, Alice, Oranienbaum, Yeseva One, Viaoda Libre, Old Standard TT, Libertinus Serif Display, Noto Serif Display, Great Vibes, Marck Script, Comforter, Philosopher, Bona Nova, Spectral, EB Garamond, Alumni Sans Pinstripe, Bellota'),
  didone: L('Playfair Display, Playfair, Playfair Display SC, Prata, Oranienbaum, Yeseva One, Old Standard TT, Viaoda Libre, Noto Serif Display, Libertinus Serif Display'),
  modern: L('Inter, Manrope, Onest, Golos Text, Geist, Unbounded, Inter Tight, Wix Madefor Text, Wix Madefor Display, Geologica, Roboto Flex, Commissioner, Jost, Sofia Sans, Akt, SN Pro, TikTok Sans, Nata Sans, Moderustic, Pliant, Science Gothic, Finlandica Text, Ubuntu Sans, Martian Mono, Geist Mono, Tektur, Ysabeau'),
  playful: L('Comfortaa, Balsamiq Sans, Pangolin, Playpen Sans, Shantell Sans, Comic Relief, Neucha, Amatic SC, Hachi Maru Pop, Bellota, Lobster, Pacifico, Oi, Kablammo, Rampart One, Train One, Underdog, Marmelad, Yomogi, Rubik Bubbles, Rubik Doodle Shadow, Rubik Doodle Triangles, Rubik Moonrocks, Rubik Puddles, Rubik Scribble, Caveat, Gabriela'),
  slab: L('Roboto Slab, Bitter, Podkova, Kelly Slab'),
  pixel: L('Press Start 2P, Pixelify Sans, Tiny5, DotGothic16, Handjet, Rubik Pixels'),
  slavonic: L('Monomakh, Ponomar, Triodion, Pochaevsk, Shafarik'),
  slavonicNear: L('Ruslan Display, Kurale'),
  decor: L('Kablammo, Rampart One, Train One, Reggae One, Montserrat Underline, Climate Crisis'),
  thin: L('Poiret One, Alumni Sans Pinstripe, Advent Pro, Raleway, Jura, Bellota, Cormorant, Tenor Sans, Forum'),
};
/* декоративные Rubik (Glitch, Wet Paint, Dirt…) — все, кроме самого Rubik и Rubik Mono One */
const isDecor = (f) => FAM.decor.has(f.family) || (/^Rubik /.test(f.family) && f.family !== 'Rubik Mono One');
const isText = (f) => (f.cat === 'sans-serif' || f.cat === 'serif') && !f.cls.includes('display') && !f.cls.includes('handwriting');
const isMono = (f) => f.cat === 'monospace' || f.cls.includes('monospace');
const serifish = (f) => f.cat === 'serif' || f.stroke === 'serif';
const has = (set, f) => set.has(f.family);

/** Слова характера → оценка шрифта 0…3 (0 — не про него). stems — начала слов (ё → е), длиннейшее совпадение побеждает. */
export const MOODS = [
  { key: 'строгий', stems: ['строг', 'нейтрал', 'делов', 'корпорат', 'сдержан', 'спокойн', 'офисн', 'strict', 'neutral', 'corporate'], score: (f) => (has(FAM.strict, f) ? 3 : isText(f) && f.normal.length >= 4 ? 1 : 0) },
  { key: 'гротеск', stems: ['гротеск', 'рублен', 'sans', 'grotesk', 'grotesque'], score: (f) => (has(FAM.grotesk, f) ? 3 : f.cat === 'sans-serif' && !isMono(f) && !f.cls.includes('handwriting') ? 2 : f.stroke === 'sans serif' && f.cat === 'display' ? 1 : 0) },
  { key: 'геометричный', stems: ['геометр', 'geometric'], score: (f) => (has(FAM.geometric, f) ? 3 : 0) },
  { key: 'гуманистический', stems: ['гуманист', 'humanist'], score: (f) => (has(FAM.humanist, f) ? 3 : 0) },
  { key: 'тёплый', stems: ['тепл', 'уютн', 'домашн', 'душевн', 'warm', 'cozy'], score: (f) => (has(FAM.warm, f) ? 3 : f.cat === 'handwriting' || (serifish(f) && isText(f)) ? 1 : 0) },
  { key: 'текстовый', stems: ['текстов', 'чтени', 'читаем', 'основн', 'body', 'reading'], score: (f) => (isText(f) && f.normal.length >= 4 ? 2 + (has(FAM.strict, f) || has(FAM.bookish, f) || has(FAM.humanist, f) ? 1 : 0) : 0) },
  { key: 'рукописный', stems: ['рукопис', 'почерк', 'ручн', 'скрипт', 'hand', 'script'], score: (f) => (f.cat === 'handwriting' || f.cls.includes('handwriting') ? 3 : has(FAM.handdrawn, f) ? 2 : 0) },
  { key: 'каллиграфический', stems: ['каллиграф', 'calligraph'], score: (f) => (has(FAM.callig, f) ? 3 : 0) },
  { key: 'антиква', stems: ['антикв', 'засеч', 'serif'], score: (f) => (f.stroke === 'slab serif' ? 1 : serifish(f) ? 2 + (has(FAM.textSerif, f) ? 1 : 0) : 0) },
  { key: 'книжный', stems: ['книжн', 'журнальн', 'book', 'editorial'], score: (f) => (has(FAM.bookish, f) ? 3 : serifish(f) && isText(f) ? (f.axes.opsz ? 2 : 1) : 0) },
  { key: 'классический', stems: ['классич', 'традицион', 'classic', 'traditional'], score: (f) => (has(FAM.classic, f) ? 3 : has(FAM.classicSans, f) ? 2 : serifish(f) && isText(f) ? 1 : 0) },
  /* узкий и широкий — по имени и карте, не по оси wdth: get просит у Google только вес, и файл приходит обычной ширины */
  { key: 'узкий', stems: ['узк', 'сжат', 'конденс', 'condensed', 'narrow'], score: (f) => (/condensed|narrow|compressed/i.test(f.family) || has(FAM.narrow, f) ? 3 : 0) },
  { key: 'широкий', stems: ['широк', 'растян', 'расширен', 'wide', 'extended', 'expanded'], score: (f) => (/expanded|extended|wide/i.test(f.family) || has(FAM.wide, f) ? 3 : has(FAM.wideSoft, f) ? 2 : 0) },
  { key: 'винтажный', stems: ['винтаж', 'ретро', 'старин', 'стары', 'стара', 'старо', 'историч', 'дореволюц', 'vintage', 'retro'], score: (f) => (has(FAM.vintage, f) ? 3 : 0) },
  { key: 'технический', stems: ['техн', 'инженер', 'цифров', 'айти', 'компьютер', 'хайтек', 'tech'], score: (f) => (isMono(f) || has(FAM.tech, f) ? 3 : 0) },
  { key: 'моноширинный', stems: ['моношир', 'моно', 'mono'], score: (f) => (isMono(f) ? 3 : 0) },
  { key: 'мягкий', stems: ['мягк', 'округл', 'скругл', 'кругл', 'дружелюб', 'добр', 'нежн', 'soft', 'round', 'friendly'], score: (f) => (has(FAM.soft, f) || /round|maru/i.test(f.family) ? 3 : f.axes.ROND || f.axes.SOFT || has(FAM.softish, f) ? 2 : 0) },
  { key: 'жирный', stems: ['жирн', 'тяжел', 'плотн', 'мощн', 'толст', 'черн', 'bold', 'heavy', 'black'], score: (f) => (has(FAM.heavy, f) ? 3 : maxW(f) >= 800 ? 2 : 0) },
  { key: 'акцидентный', stems: ['акциден', 'плакат', 'заголов', 'дисплей', 'броск', 'громк', 'афиш', 'логотип', 'надпис', 'крупн', 'display', 'poster', 'headline'], score: (f) => (has(FAM.heavy, f) ? 3 : f.cat === 'display' || f.cls.includes('display') ? 2 : 0) },
  { key: 'элегантный', stems: ['элегант', 'изящн', 'утонч', 'роскош', 'премиал', 'премиум', 'дорог', 'модн', 'люкс', 'женствен', 'elegant', 'luxury', 'premium', 'fashion'], score: (f) => (has(FAM.elegant, f) ? 3 : serifish(f) && f.axes.opsz ? 1 : 0) },
  { key: 'контрастный', stems: ['контраст', 'дидон', 'contrast', 'didone'], score: (f) => (has(FAM.didone, f) ? 3 : has(FAM.elegant, f) && serifish(f) ? 1 : 0) },
  { key: 'современный', stems: ['соврем', 'модерн', 'свеж', 'нов', 'modern', 'fresh'], score: (f) => (has(FAM.modern, f) ? 3 : f.added >= '2020' && f.cat === 'sans-serif' && isText(f) ? 1 : 0) },
  { key: 'игривый', stems: ['игрив', 'детск', 'весел', 'забав', 'шутлив', 'мульт', 'праздн', 'playful', 'kids'], score: (f) => (has(FAM.playful, f) ? 3 : isDecor(f) ? 2 : 0) },
  { key: 'брусковый', stems: ['брусков', 'слэб', 'египет', 'slab'], score: (f) => (f.stroke === 'slab serif' || has(FAM.slab, f) ? 3 : 0) },
  { key: 'пиксельный', stems: ['пиксел', '8-бит', '8бит', 'pixel'], score: (f) => (has(FAM.pixel, f) ? 3 : 0) },
  { key: 'славянский', stems: ['славян', 'старослав', 'древнерус', 'церков', 'устав', 'полуустав', 'slavonic', 'church'], score: (f) => (has(FAM.slavonic, f) ? 3 : has(FAM.slavonicNear, f) ? 2 : 0) },
  { key: 'декоративный', stems: ['декор', 'эффект', 'гранж', 'необычн', 'decorative', 'grunge'], score: (f) => (isDecor(f) ? 3 : 0) },
  { key: 'тонкий', stems: ['тонк', 'легк', 'воздушн', 'thin', 'light'], score: (f) => (has(FAM.thin, f) ? 3 : minW(f) <= 200 ? 2 : minW(f) <= 300 ? 1 : 0) },
];
const STOP = new Set(['и', 'или', 'а', 'но', 'с', 'со', 'для', 'в', 'во', 'на', 'по', 'к', 'как', 'очень', 'чуть', 'слегка', 'немного', 'довольно', 'шрифт', 'шрифты', 'шрифта', 'гарнитура', 'гарнитуры', 'стиль', 'стиле', 'характер', 'типа', 'the', 'a', 'and', 'font', 'style']);
/* фразы из нескольких слов — до разбора на слова (ё уже заменена на е) */
const PHRASES = [[' без засечек ', ' гротеск '], [' с засечками ', ' антиква '], [' от руки ', ' рукописный '], [' для текста ', ' текстовый ']];

function moodOf(w) {
  let best = null, len = 0;
  for (const m of MOODS) for (const st of m.stems) { const s = st.replace(/ё/g, 'е'); if (w.startsWith(s) && s.length > len) { best = m; len = s.length; } }
  return best;
}
/** «узкий строгий не жирный» → { want: [настроения], not: [настроения], unknown: [слова] }; «не …» и «без …» — исключить. */
export function parseLike(s) {
  let t = ` ${String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[.,;!?()«»"]+/g, ' ')} `.replace(/\s+/g, ' ');
  for (const [a, b] of PHRASES) t = t.split(a).join(b);
  const words = t.split(/[\s/+]+/).filter(Boolean);
  const want = [], not = [], unknown = [];
  for (let i = 0; i < words.length; i++) {
    let w = words[i]; let neg = false;
    if ((w === 'не' || w === 'без') && i + 1 < words.length) { neg = true; w = words[++i]; }
    if (STOP.has(w)) continue;
    const m = moodOf(w);
    if (!m) { unknown.push(w); continue; }
    (neg ? not : want).push(m);
  }
  return { want: uniq(want), not: uniq(not), unknown };
}

/* ---------- знаки и подмножества ---------- */

/** «U+0400-045F, U+2116» → [[0x400, 0x45f], [0x2116, 0x2116]] */
function parseRange(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i.exec(x); if (!m) return null;
    if (m[1].includes('?')) return [parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'f'), 16)];
    return [parseInt(m[1], 16), parseInt(m[2] || m[1], 16)];
  }).filter(Boolean);
}
const RANGES = Object.fromEntries(Object.entries(SUBSET_RANGES).map(([k, v]) => [k, parseRange(v)]));
const subsetsOf = (c) => Object.keys(RANGES).filter((k) => RANGES[k].some(([a, b]) => c >= a && c <= b));
/** знаки строки без пробелов, по одному, в порядке появления (Ё из «Е + ̈» — одна буква) */
const charsOf = (s) => uniq([...String(s || '').normalize('NFC')].filter((c) => /\S/.test(c)));
/** «₽№«»» → [{ ch: '₽', subs: ['latin-ext'] }, …] */
function needSubsets(s) { return charsOf(s).map((ch) => ({ ch, subs: subsetsOf(cp(ch)) })); }

/* ---------- pick ---------- */

function parseCategories(v) {
  if (v === undefined) return [];
  return String(v).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).map((x) => {
    const k = CAT_ALIAS[x] || x;
    if (!CATEGORIES[k]) throw new Fail(`--category: «${x}» — такой нет; есть ${Object.keys(CATEGORIES).join(', ')}`);
    return k;
  });
}
/** «400,700» → { list: [400, 700] }; «300..800» → { range: [300, 800] }; ошибка — Fail. */
export function parseWeights(v) {
  const s = String(v).replace(/\s+/g, '');
  const r = /^(\d{1,4})\.\.(\d{1,4})$/.exec(s);
  const ok = (w) => Number.isInteger(w) && w >= 1 && w <= 1000;
  if (r) {
    const a = +r[1], b = +r[2];
    if (!ok(a) || !ok(b) || a >= b) throw new Fail(`--weights ${v}: диапазон — от меньшего к большему, 1…1000 (300..800)`);
    return { range: [a, b] };
  }
  if (!/^\d{1,4}(,\d{1,4})*$/.test(s)) throw new Fail(`--weights ${v}: веса через запятую (400,700) или диапазон (300..800)`);
  const list = uniq(s.split(',').map(Number)).sort((a, b) => a - b);
  const bad = list.filter((w) => !ok(w));
  if (bad.length) throw new Fail(`--weights: вес ${bad.join(', ')} — вне 1…1000`);
  return { list };
}
function parseN(v) {
  if (v === undefined) return 10;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 300) throw new Fail(`--n ${v}: целое от 1 до 300`);
  return n;
}

/** Кандидаты pick. o: { cats, like: {want, not}, need, weights: [..], italic, variable, n } → { total, found, rows } */
export function pickFonts(fonts, o) {
  const like = o.like || { want: [], not: [] };
  const needs = needSubsets(o.need || '');
  const wantsKey = (k) => like.want.some((m) => m.key === k);
  let list = fonts.filter((f) => hasCyr(f) && !f.cls.includes('symbols'));
  const total = list.length;
  if (o.cats && o.cats.length) list = list.filter((f) => o.cats.includes(f.cat));
  if (o.weights && o.weights.length) list = list.filter((f) => o.weights.every((w) => hasWeight(f, w, !!o.italic)));
  else if (o.italic) list = list.filter((f) => f.italic.length > 0);
  if (o.variable) list = list.filter((f) => Object.keys(f.axes).length > 0);
  const rows = [];
  for (const f of list) {
    if (like.not.some((m) => m.score(f) >= 2)) continue;
    const sc = like.want.map((m) => [m.key, m.score(f)]).filter(([, s]) => s > 0);
    if (like.want.length && !sc.length) continue;
    const marks = []; let pen = 0;
    if (OVERUSED.test(f.family)) { marks.push('ИИ-набор'); pen += 1; }
    if (isCJK(f)) { marks.push('CJK'); pen += 2; }
    if (isDecor(f) && !wantsKey('декоративный') && !wantsKey('игривый')) { marks.push('декоративный'); pen += 2; }
    if (has(FAM.slavonic, f) && !wantsKey('славянский')) { marks.push('церковнославянский'); pen += 2; }
    if (has(FAM.pixel, f) && !wantsKey('пиксельный') && !wantsKey('технический')) { marks.push('пиксельный'); pen += 1; }
    const missing = needs.filter((n) => n.subs.length && !n.subs.some((s) => f.subsets.includes(s)));
    for (const n of missing) marks.push(`${n.ch}: нет ${n.subs.join(' / ')}`);
    rows.push({ f, matched: sc.map(([k]) => k), sum: sc.reduce((a, [, s]) => a + s, 0), pen, needOk: !missing.length, marks });
  }
  rows.sort((a, b) => (b.needOk - a.needOk) || (b.matched.length - a.matched.length) || (b.sum - a.sum) || (a.pen - b.pen) || (a.f.popularity - b.f.popularity) || a.f.family.localeCompare(b.f.family));
  return { total, found: rows.length, rows: rows.slice(0, o.n || 10), needs };
}

function fmtList(ws) {
  if (!ws.length) return '';
  if (ws.length < 3) return ws.join(', ');
  const step = ws.every((w, i) => i === 0 || w - ws[i - 1] === 100);
  return `${ws[0]}–${ws[ws.length - 1]}${step ? '' : ` (${ws.length})`}`;
}
function fmtStyles(f) {
  const n = fmtList(f.normal) || (f.axes.wght ? `${f.axes.wght[0]}–${f.axes.wght[1]}` : '—');
  if (!f.italic.length) return n;
  const same = f.italic.length === f.normal.length && f.italic.every((w, i) => w === f.normal[i]);
  return `${n} + курсив${same ? '' : ` ${fmtList(f.italic)}`}`;
}
function fmtAxes(f) {
  const order = ['wght', 'wdth', 'opsz', 'slnt', 'ital'];
  const ks = Object.keys(f.axes).sort((a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)) || a.localeCompare(b));
  if (!ks.length) return '—';
  const shown = ks.slice(0, 2).map((k) => `${k} ${f.axes[k][0]}–${f.axes[k][1]}`).join(', ');
  return ks.length > 2 ? `${shown} +${ks.length - 2}` : shown;
}
function fmtSubsets(f) {
  const key = ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext'].filter((s) => f.subsets.includes(s));
  const rest = f.subsets.length - key.length;
  return key.join(', ') + (rest > 0 ? ` +${rest}` : '');
}
/** Таблица: колонки выровнены по самой длинной ячейке, последняя — без выравнивания. */
function table(head, rows) {
  const all = [head, ...rows].map((r) => r.map((c) => String(c ?? '')));
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(w[i]))).join('  ').trimEnd());
}
/** Веса по умолчанию: 400 и 700, что есть; иначе ближайший к 400. Шрифта нет в данных — 400 и 700. */
function defaultWeights(f) {
  if (!f) return [400, 700];
  const base = [400, 700].filter((w) => hasWeight(f, w));
  if (base.length) return base;
  const all = f.normal.length ? f.normal : f.axes.wght ? [Math.min(Math.max(400, f.axes.wght[0]), f.axes.wght[1])] : [400];
  return [all.reduce((a, b) => (Math.abs(b - 400) < Math.abs(a - 400) ? b : a))];
}
const getCmd = (family, weights, italic = false) => `${SKILL_CMD} get "${family}" --weights ${weights.join(',')}${italic ? ' --italic' : ''} --out <папка сайта>`;

function cmdPick() {
  const data = requireFonts();
  const warns = [];
  const like = opt.like !== undefined ? parseLike(opt.like) : { want: [], not: [], unknown: [] };
  if (like.unknown.length) warns.push(`слова характера не знаю: ${like.unknown.map((w) => `«${w}»`).join(', ')} — знаю: ${MOODS.map((m) => m.key).join(', ')}`);
  let weights = [];
  if (opt.weights !== undefined) { const w = parseWeights(opt.weights); if (w.range) throw new Fail('pick --weights — список весов через запятую (400,700)'); weights = w.list; }
  const o = { cats: parseCategories(opt.category), like, need: opt.need !== undefined ? String(opt.need) : '', weights, italic: !!opt.italic, variable: !!opt.variable, n: parseN(opt.n) };
  const res = pickFonts(data.list, o);
  const bits = [
    o.cats.length && `категория ${o.cats.join(', ')}`,
    like.want.length && `характер: ${like.want.map((m) => m.key).join(', ')}`,
    like.not.length && `без: ${like.not.map((m) => m.key).join(', ')}`,
    o.need && `знаки ${res.needs.map((n) => `${n.ch} → ${n.subs.join('/') || '?'}`).join(', ')}`,
    weights.length && `веса ${weights.join(', ')}${o.italic ? ' + курсив' : ''}`,
    !weights.length && o.italic && 'с курсивом',
    o.variable && 'переменные',
  ].filter(Boolean);
  console.log(`pick: с кириллицей ${res.total} из ${data.list.length} (данные ui-ux-pro-max)${bits.length ? ` · ${bits.join(' · ')}` : ''} → подходит ${res.found}, показаны ${res.rows.length}`);
  for (const w of warns) console.log(`WARN: ${w}`);
  if (!res.rows.length) {
    console.log(`WARN: под эти условия шрифтов с кириллицей нет — убрать --weights, --category или слово характера`);
    return 0;
  }
  const head = ['#', 'семейство', 'категория', 'начертания', 'оси', 'подмножества', 'поп.', ...(like.want.length ? ['характер'] : []), 'пометки', 'specimen'];
  const rows = res.rows.map((r, i) => [String(i + 1), r.f.family, r.f.cat, fmtStyles(r.f), fmtAxes(r.f), fmtSubsets(r.f), String(r.f.popularity), ...(like.want.length ? [r.matched.join(', ')] : []), r.marks.join('; ') || '—', r.f.url]);
  for (const line of table(head, rows)) console.log(line);
  const first = res.rows[0].f;
  const fw = weights.length ? weights : defaultWeights(first);
  console.log(`\nВзять первого: ${getCmd(first.family, fw, o.italic && first.italic.length > 0)}`);
  console.log('Глазами — specimen: Ж, Д, Л, Ф, Ы и Ё в капсе, крупно (typography.md §5). Кириллицу и знаки в самих файлах проверит get.');
  if (!OVERUSED.fromCliche) console.log('WARN: список «ИИ-набора» не прочитан из cliche.mjs — взята запасная копия');
  const warnCount = warns.length + (OVERUSED.fromCliche ? 0 : 1);
  console.log(`${warnCount ? 'WARN' : 'OK'}: ${res.rows.length} из ${res.found}${warnCount ? ` (предупреждений ${warnCount})` : ''}`);
  return 0;
}

/* ---------- pairs ---------- */

/** Пары typography.csv: годятся — у обоих шрифтов кириллица; отброшенные — с причиной. words — отбор по-английски. */
export function pairFonts(pairs, fonts, words = []) {
  const by = new Map(fonts.map((f) => [f.family.toLowerCase(), f]));
  const ok = [], rejected = [];
  for (const p of pairs) {
    const hay = `${p.name} ${p.cat} ${p.mood} ${p.best} ${p.head} ${p.body}`.toLowerCase();
    if (words.length && !words.every((w) => hay.includes(String(w).toLowerCase()))) continue;
    const fams = uniq([p.head, p.body]);
    const noData = fams.filter((x) => !by.has(x.toLowerCase()));
    const noCyr = fams.filter((x) => by.has(x.toLowerCase()) && !hasCyr(by.get(x.toLowerCase())));
    if (noData.length || noCyr.length) { rejected.push({ p, noData, noCyr }); continue; }
    const marks = []; let pen = 0;
    const over = fams.filter((x) => OVERUSED.test(x)); if (over.length) { marks.push(`ИИ-набор: ${over.join(', ')}`); pen += 1; }
    const cjk = fams.filter((x) => isCJK(by.get(x.toLowerCase()))); if (cjk.length) { marks.push(`CJK: ${cjk.join(', ')}`); pen += 2; }
    const noExt = fams.filter((x) => !by.get(x.toLowerCase()).subsets.includes('latin-ext')); if (noExt.length) { marks.push(`₽: нет latin-ext у ${noExt.join(', ')}`); pen += 1; }
    ok.push({ p, marks, pen, fonts: fams.map((x) => by.get(x.toLowerCase())) });
  }
  /* без пометок — первыми, дальше по номеру пары */
  ok.sort((a, b) => (a.pen - b.pen) || (Number(a.p.no) - Number(b.p.no)));
  return { ok, rejected };
}
const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

function cmdPairs() {
  const data = requireFonts();
  const pairs = loadPairs();
  if (!pairs) throw new Fail(`нет данных ${path.join(DATA_DIR, 'typography.csv')} — навык ui-ux-pro-max не установлен или FONTS_DATA_DIR указывает не туда`);
  const words = pos.slice();
  const res = pairFonts(pairs, data.list, words);
  const seen = res.ok.length + res.rejected.length;
  console.log(`pairs: пар в данных ${pairs.length}${words.length ? `, под «${words.join(' ')}» — ${seen}` : ''} · кириллица у обоих шрифтов — ${res.ok.length}, отброшено ${res.rejected.length}`);
  if (res.ok.length) {
    const rows = res.ok.map((x) => [x.p.no, x.p.name, `${x.p.head} → ${x.p.body}`, cut(x.p.mood, 44), cut(x.p.best, 44), x.marks.join('; ') || '—']);
    for (const line of table(['№', 'пара', 'заголовки → текст', 'настроение (из данных)', 'для чего', 'пометки'], rows)) console.log(line);
  }
  if (res.rejected.length) {
    /* по шрифту: «Space Grotesk — №3, 44, 63», строками до ~110 знаков */
    for (const [kind, key] of [['нет кириллицы', 'noCyr'], ['нет в google-fonts.csv', 'noData']]) {
      const byFont = new Map();
      for (const r of res.rejected) for (const fam of r[key]) { if (!byFont.has(fam)) byFont.set(fam, []); byFont.get(fam).push(r.p.no); }
      if (!byFont.size) continue;
      const items = [...byFont].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([fam, nos]) => `${fam} — №${nos.join(', ')}`);
      const out = []; let line = '';
      for (const it of items) { if (line && line.length + it.length + 2 > 110) { out.push(line); line = ''; } line += (line ? '; ' : '') + it; }
      if (line) out.push(line);
      console.log(`\nОтброшены — ${kind} у шрифта (номера пар):`);
      for (const l of out) console.log(`  ${l}`);
    }
  }
  if (!res.ok.length) { console.log(`WARN: пар с кириллицей у обоих шрифтов${words.length ? ` под «${words.join(' ')}»` : ''} нет — подобрать по одному: ${SKILL_CMD} pick --like "…"`); return 0; }
  const best = res.ok[0];
  console.log(`\nВзять пару №${best.p.no} (${best.p.name}):`);
  for (const f of uniq(best.fonts)) console.log(`  ${getCmd(f.family, defaultWeights(f))}`);
  console.log('Веса — по макету: 2–4 на гарнитуру (typography.md §6).');
  console.log(`OK: пар с кириллицей ${res.ok.length} из ${seen}`);
  return 0;
}

/* ---------- get: адрес, сеть, ответ ---------- */

/** знаки надписи для text=: NFC, без переводов строк, каждый один раз, в порядке появления */
const textParam = (s) => uniq([...String(s).normalize('NFC').replace(/[\r\n\t]+/g, ' ')]).join('');

/** Адрес CSS2 API: семейство с «+» вместо пробелов, оси ital,wght в порядке Google, text= — UTF-8 в %-кодах. */
export function buildCss2Url({ family, spec, italic = false, text = null, base = API_BASE }) {
  const fam = String(family).trim().split(/\s+/).map(encodeURIComponent).join('+');
  const vals = spec.range ? [`${spec.range[0]}..${spec.range[1]}`] : uniq(spec.list).sort((a, b) => a - b).map(String);
  const axes = italic ? `ital,wght@${[0, 1].flatMap((i) => vals.map((v) => `${i},${v}`)).join(';')}` : `wght@${vals.join(';')}`;
  let url = `${String(base).replace(/\/+$/, '')}/css2?family=${fam}:${axes}&display=swap`;
  if (text !== null && text !== undefined) url += `&text=${encodeURIComponent(textParam(text))}`;
  return url;
}

/** Ответ CSS2 → блоки @font-face: подмножество (комментарий перед блоком), семейство, начертание, вес, адрес, unicode-range. */
export function parseCss2(css) {
  const out = [];
  const re = /(?:\/\*\s*([^*]*?)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(String(css)))) {
    const body = m[2]; const decl = {};
    for (const part of body.split(';')) { const i = part.indexOf(':'); if (i > 0) decl[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim(); }
    /* адрес целиком, с «?» и «&» (…/l/font?kit=…&skey=…&v=…): до закрывающей скобки или кавычки, не до «&» */
    const u = /src\s*:[^;]*?url\(\s*(['"]?)([^'")\s]+)\1\s*\)/i.exec(body);
    const fmt = /format\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(body);
    out.push({
      subset: m[1] ? m[1].trim() : null, family: String(decl['font-family'] || '').replace(/^['"]|['"]$/g, ''),
      style: decl['font-style'] || 'normal', weight: String(decl['font-weight'] || '400').trim(), stretch: decl['font-stretch'] || null,
      url: u ? u[2] : null, format: fmt ? fmt[1] : null, range: decl['unicode-range'] || null,
    });
  }
  return out;
}

class NetFail extends Error { constructor(code, host) { super(code); this.netCode = code; this.host = host; } }
/** GET с повтором при временных сбоях (сброс соединения, тайм-аут, 5xx, 429): до 3 попыток. Постоянные (нет имени, отказ) — сразу. */
async function request(url, { binary = false } = {}) {
  const host = new URL(url).host;
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: binary ? 'font/woff2,*/*;q=0.8' : 'text/css,*/*;q=0.1', 'accept-language': 'ru,en;q=0.8' }, signal: AbortSignal.timeout(30000) });
      if (res.status >= 500 || res.status === 429) { last = new NetFail(`HTTP ${res.status}`, host); try { await res.arrayBuffer(); } catch { /* тело не нужно */ } }
      else return { status: res.status, type: res.headers.get('content-type') || '', finalUrl: res.url || url, body: binary ? Buffer.from(await res.arrayBuffer()) : await res.text() };
    } catch (e) {
      const code = (e && e.cause && (e.cause.code || e.cause.name)) || (e && (e.code || e.name)) || 'сбой';
      last = new NetFail(code, host);
      if (['ENOTFOUND', 'ECONNREFUSED', 'EACCES', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code)) break;
    }
    if (attempt < 3) await sleep(attempt * 1000);
  }
  throw last;
}
const netMessage = (e) => `нет связи с ${e.host} (${e.netCode}) — сети нет или Google Fonts отсюда недоступен; повторить позже. Без сети работают pick, pairs и --selftest`;

/* ---------- WOFF2: таблица знаков (cmap) и оси (fvar) ---------- */

/* известные таблицы WOFF2 по номеру в флагах записи (спецификация W3C WOFF2, 5.1) */
const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
/**
 * WOFF2 → { codes: Set кодов со знаком, wght: [min, max] | null, tables: [имена] }. Без сторонних модулей:
 * каталог таблиц, распаковка Brotli (zlib), cmap форматов 4, 6, 12 и 13 (платформы Unicode и Windows), fvar.
 * Таблицы в распакованном потоке идут подряд, без выравнивания (проверено на файлах Google, 30.09.2026).
 * Не WOFF2, обрезан, испорчен — исключение с объяснением.
 */
export function woff2Info(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 48 || buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('не WOFF2 (нет подписи wOF2)');
  if (buf.readUInt32BE(4) === 0x74746366) throw new Error('коллекция шрифтов (ttcf) — не разбираю');
  const numTables = buf.readUInt16BE(12);
  const compLen = buf.readUInt32BE(20);
  let p = 48;
  const b128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      if (p >= buf.length) throw new Error('каталог таблиц обрезан');
      const b = buf[p++];
      if (i === 0 && b === 0x80) throw new Error('каталог таблиц испорчен');
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('каталог таблиц испорчен');
  };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    if (p >= buf.length) throw new Error('каталог таблиц обрезан');
    const flags = buf[p++]; const idx = flags & 0x3f; const ver = flags >> 6;
    let tag;
    if (idx === 63) { tag = buf.toString('latin1', p, p + 4); p += 4; } else tag = WOFF2_TAGS[idx] || `#${idx}`;
    const orig = b128();
    const transformed = tag === 'glyf' || tag === 'loca' ? ver === 0 : ver !== 0;
    dir.push({ tag, len: transformed ? b128() : orig });
  }
  if (p + compLen > buf.length) throw new Error('файл обрезан: сжатые данные короче заявленного');
  let data;
  try { data = zlib.brotliDecompressSync(buf.subarray(p, p + compLen), { maxOutputLength: 64 * 1024 * 1024 }); } catch (e) { throw new Error(`не распаковалось (Brotli): ${e.code || e.message}`); }
  const at = {}; let off = 0;
  for (const t of dir) { at[t.tag] = { off, len: t.len }; off += t.len; }
  if (off > data.length) throw new Error('таблицы длиннее распакованных данных');
  if (!at.cmap) throw new Error('нет таблицы cmap');
  let codes;
  try { codes = cmapCodes(data.subarray(at.cmap.off, at.cmap.off + at.cmap.len)); } catch { throw new Error('таблица cmap испорчена'); }
  let wght = null;
  if (at.fvar) {
    try {
      const d = data.subarray(at.fvar.off, at.fvar.off + at.fvar.len);
      const ao = d.readUInt16BE(4), n = d.readUInt16BE(8), size = d.readUInt16BE(10);
      for (let i = 0; i < n; i++) { const a = ao + i * size; if (d.toString('latin1', a, a + 4) === 'wght') wght = [d.readInt32BE(a + 4) / 65536, d.readInt32BE(a + 12) / 65536]; }
    } catch { wght = null; /* оси не прочитаны — вес возьмётся из ответа Google */ }
  }
  return { codes, wght, tables: dir.map((t) => t.tag) };
}
function cmapCodes(d) {
  const set = new Set();
  const n = d.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const pid = d.readUInt16BE(4 + i * 8), eid = d.readUInt16BE(6 + i * 8), so = d.readUInt32BE(8 + i * 8);
    if (!(pid === 0 || (pid === 3 && (eid === 1 || eid === 10)))) continue; /* только Unicode */
    const fmt = d.readUInt16BE(so);
    if (fmt === 4) {
      const segX2 = d.readUInt16BE(so + 6); const seg = segX2 / 2;
      const ends = so + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ros = deltas + segX2;
      for (let s = 0; s < seg; s++) {
        const end = d.readUInt16BE(ends + s * 2), start = d.readUInt16BE(starts + s * 2), delta = d.readInt16BE(deltas + s * 2), ro = d.readUInt16BE(ros + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g;
          if (ro === 0) g = (c + delta) & 0xffff;
          else { g = d.readUInt16BE(ros + s * 2 + ro + (c - start) * 2); if (g) g = (g + delta) & 0xffff; }
          if (g) set.add(c);
        }
      }
    } else if (fmt === 6) {
      const first = d.readUInt16BE(so + 6), cnt = d.readUInt16BE(so + 8);
      for (let k = 0; k < cnt; k++) if (d.readUInt16BE(so + 10 + k * 2)) set.add(first + k);
    } else if (fmt === 12 || fmt === 13) {
      const groups = d.readUInt32BE(so + 12);
      for (let g = 0; g < groups; g++) {
        const a = d.readUInt32BE(so + 16 + g * 12), b = d.readUInt32BE(so + 20 + g * 12), gid = d.readUInt32BE(so + 24 + g * 12);
        for (let c = a; c <= b && c <= 0x10ffff; c++) if (fmt === 13 ? gid : gid + (c - a)) set.add(c);
      }
    }
  }
  return set;
}

/* ---------- get: файлы, fonts.css ---------- */

const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'font';
const noEnd = (s) => String(s).replace(/\*\//g, '* /');
/**
 * Блоки ответа → файлы: один файл на адрес (у переменного шрифта Google отдаёт один адрес на все веса).
 * Вес в @font-face: у файла с осью wght — её диапазон (если покрывает все веса блоков), у нескольких блоков без
 * оси — от меньшего к большему, иначе — как у Google. infos: Map адрес → woff2Info | null.
 */
export function planFiles(blocks, { family, text = false, infos = new Map() }) {
  const byUrl = new Map();
  for (const b of blocks) { if (!byUrl.has(b.url)) byUrl.set(b.url, []); byUrl.get(b.url).push(b); }
  const names = new Set(); const files = [];
  for (const [url, bs] of byUrl) {
    const b0 = bs[0]; const info = infos.get(url) || null;
    const nums = bs.flatMap((b) => b.weight.split(/\s+/).map(Number)).filter(Number.isFinite);
    const lo = Math.min(...nums), hi = Math.max(...nums);
    let weight = b0.weight;
    if (info && info.wght && info.wght[0] <= lo && info.wght[1] >= hi) weight = info.wght[0] === info.wght[1] ? String(info.wght[0]) : `${info.wght[0]} ${info.wght[1]}`;
    else if (bs.length > 1) weight = lo === hi ? String(lo) : `${lo} ${hi}`;
    const base = `${slugOf(family)}-${weight.replace(/\s+/g, '-')}${b0.style === 'italic' ? '-italic' : ''}-${text ? 'text' : slugOf(b0.subset || 'all')}`;
    let name = `${base}.woff2`; for (let k = 2; names.has(name); k++) name = `${base}-${k}.woff2`;
    names.add(name);
    files.push({ url, name, family: b0.family || family, style: b0.style, weight, stretch: b0.stretch, subset: b0.subset, range: b0.range, weights: uniq(bs.map((b) => b.weight)), info });
  }
  return files;
}
function faceCss(f) {
  const q = String(f.family).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return [
    ...(f.subset ? [`/* ${noEnd(f.subset)} */`] : []),
    '@font-face {', `  font-family: '${q}';`, `  font-style: ${f.style};`, `  font-weight: ${f.weight};`,
    ...(f.stretch ? [`  font-stretch: ${f.stretch};`] : []),
    '  font-display: swap;', `  src: url('${f.name}') format('woff2');`,
    ...(f.range ? [`  unicode-range: ${f.range};`] : []), '}',
  ].join('\n');
}
const CSS_HEAD = '/* Шрифты сайта — свои файлы woff2 (reference/typography.md §16). Разделы между метками «fonts.mjs» пишет\n   и заменяет node fonts.mjs get; свой CSS — вне меток. */';
const markers = (key) => [`/* ==== fonts.mjs: ${noEnd(key)} ==== */`, `/* ==== /fonts.mjs: ${noEnd(key)} ==== */`];
/** Вписать раздел key в fonts.css: заменить свой (между метками) или дописать в конец; остальное не трогать. */
export function mergeSection(css, key, body) {
  const [start, end] = markers(key);
  const block = `${start}\n${body.trim()}\n${end}\n`;
  if (!css || !css.trim()) return { css: `${CSS_HEAD}\n\n${block}`, replaced: false, old: '' };
  const i = css.indexOf(start); const j = i >= 0 ? css.indexOf(end, i) : -1;
  if (i >= 0 && j > i) {
    const old = css.slice(i, j + end.length);
    return { css: css.slice(0, i) + block + css.slice(j + end.length).replace(/^\r?\n/, ''), replaced: true, old };
  }
  return { css: `${css.replace(/\s*$/, '')}\n\n${block}`, replaced: false, old: '' };
}
/** Имена файлов, на которые ссылается раздел (url('имя')) — чтобы удалить свои прежние. */
const sectionFiles = (text) => uniq([...String(text).matchAll(/url\(\s*['"]?([^'")/\\]+\.woff2)['"]?\s*\)/g)].map((m) => m[1]));
const sectionCount = (css) => (String(css).match(/\/\* ==== fonts\.mjs: /g) || []).length;
function fallbackStack(font) {
  if (!font) return STACK_SANS;
  if (isMono(font)) return STACK_MONO;
  return serifish(font) || font.stroke === 'slab serif' ? STACK_SERIF : STACK_SANS;
}
function checkWeights(f, spec, italic) {
  if (spec.range) {
    if (!f.axes.wght) return `у «${f.family}» нет оси wght (не переменный) — веса перечислить: --weights ${defaultWeights(f).join(',')} (есть ${fmtStyles(f)})`;
    if (spec.range[0] < f.axes.wght[0] || spec.range[1] > f.axes.wght[1]) return `у «${f.family}» ось wght ${f.axes.wght[0]}..${f.axes.wght[1]} — диапазон ${spec.range.join('..')} шире`;
    if (italic && !f.italic.length) return `у «${f.family}» нет курсива`;
    return null;
  }
  const miss = spec.list.filter((w) => !hasWeight(f, w));
  if (miss.length) return `у «${f.family}» нет веса ${miss.join(', ')}: есть ${fmtStyles(f)}`;
  if (italic) { const mi = spec.list.filter((w) => !hasWeight(f, w, true)); if (mi.length) return `у «${f.family}» нет курсива ${mi.join(', ')}${f.italic.length ? `: курсив есть у ${fmtList(f.italic)}` : ' вовсе'}`; }
  return null;
}
/** Что просили и чего Google не отдал: [{ style, w }]. У блока с диапазоном («300 800») вес внутри диапазона считается отданным. */
function droppedStyles(blocks, spec, italic) {
  if (spec.range) return [];
  const got = blocks.map((b) => { const [a, z = a] = b.weight.split(/\s+/).map(Number); return { style: b.style, a, z }; });
  const out = [];
  for (const style of italic ? ['normal', 'italic'] : ['normal']) for (const w of spec.list) if (!got.some((g) => g.style === style && w >= g.a && w <= g.z)) out.push({ style, w });
  return out;
}

async function cmdGet() {
  const famArg = pos.join(' ').trim();
  if (!famArg) throw new Fail(`нужно семейство: ${SKILL_CMD} get "Manrope" --out <папка сайта> (-h — справка)`);
  if (opt.out === undefined) throw new Fail('--out <папка сайта> обязателен: файлы лягут в <папка>/fonts/');
  const out = path.resolve(String(opt.out));
  const text = opt.text !== undefined ? String(opt.text) : null;
  if (text !== null && !charsOf(text).length) throw new Fail('--text без знаков');
  let spec = opt.weights !== undefined ? parseWeights(opt.weights) : null;
  const italic = !!opt.italic;
  const knownSubsets = new Set([...Object.keys(SUBSET_RANGES), 'math', 'symbols', 'symbols2', 'music', 'emoji', 'japanese', 'korean', 'chinese-simplified', 'chinese-traditional', 'chinese-hongkong', 'arabic', 'hebrew', 'armenian', 'georgian', 'devanagari', 'thai']);
  const subsets = opt.subsets !== undefined ? uniq(String(opt.subsets).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) : DEFAULT_SUBSETS;
  const warns = []; const early = [];
  const warn = (m) => { warns.push(m); console.log(`WARN: ${m}`); };
  const warnLater = (m) => early.push(m); /* до строки «get: …» — печатаются после неё */
  const data = loadFonts();
  if (data) for (const f of data.list) for (const s of f.subsets) knownSubsets.add(s);
  const badSub = subsets.filter((s) => !knownSubsets.has(s));
  if (badSub.length) throw new Fail(`--subsets: «${badSub.join(', ')}» — таких подмножеств у Google нет (${DEFAULT_SUBSETS.join(', ')}, cyrillic-ext, greek, vietnamese…)`);
  if (!subsets.length) throw new Fail('--subsets пустой');
  let family = famArg; let font = null; let suggest = null;
  if (data) {
    font = data.list.find((f) => f.family.toLowerCase() === famArg.toLowerCase()) || null;
    if (font) family = font.family;
    else {
      const g = closestFlag(famArg.toLowerCase(), data.list.map((f) => f.family.toLowerCase()));
      suggest = g ? data.list.find((f) => f.family.toLowerCase() === g).family : null;
      warnLater(`«${famArg}» нет в данных ui-ux-pro-max${suggest ? ` — может быть, «${suggest}»?` : ''}; спрашиваю Google как есть`);
    }
  } else warnLater(`данных ui-ux-pro-max нет (${DATA_DIR}) — веса не сверяю до запроса`);
  if (!spec) spec = { list: defaultWeights(font) };
  if (font) { const err = checkWeights(font, spec, italic); if (err) throw new Fail(err); }
  if (text !== null && opt.subsets !== undefined) warnLater('--subsets с --text не нужен: подмножество — ровно знаки надписи');
  if (path.basename(out).toLowerCase() === 'fonts') warnLater(`--out — папка сайта, а не шрифтов: файлы лягут в ${path.join(out, 'fonts')}`);
  if (font && OVERUSED.test(font.family)) warnLater(`«${font.family}» — из «ИИ-набора» (cliche.mjs overused-font): брать, только если это язык донора (typography.md §5)`);
  const url = buildCss2Url({ family, spec, italic, text });
  console.log(`get: ${family} · веса ${spec.range ? spec.range.join('..') : spec.list.join(', ')}${italic ? ' + курсив' : ''} · ${text !== null ? `надпись «${text}»` : `подмножества ${subsets.join(', ')}`}`);
  console.log(`  CSS2: ${url}`);
  for (const m of early) warn(m);

  let res;
  try { res = await request(url); } catch (e) { if (e instanceof NetFail) throw new Fail(netMessage(e)); throw e; }
  if (res.status !== 200 || !/text\/css/i.test(res.type)) {
    const hint = res.status === 400 ? ` — у Google нет семейства «${family}» или такого начертания${suggest ? `; может быть, «${suggest}»?` : ''} (проверить: ${SKILL_CMD} pick)` : '';
    throw new Fail(`CSS2 API ответил HTTP ${res.status} (${res.type || 'без типа'})${hint}`);
  }
  const blocks = parseCss2(res.body).filter((b) => b.url);
  if (!blocks.length) throw new Fail('в ответе CSS2 API нет @font-face с адресом файла');
  if (!blocks.some((b) => b.format === 'woff2')) throw new Fail(`CSS2 API отдал не woff2 (${uniq(blocks.map((b) => b.format)).join(', ')}) — User-Agent не принят за современный браузер`);

  /* подмножества: берём запрошенные; нет cyrillic — отказ по правилу, нет другого — WARN */
  let chosen = blocks; const skipped = new Set();
  if (text === null) {
    const got = new Set(blocks.map((b) => b.subset).filter(Boolean));
    if (got.size) {
      chosen = blocks.filter((b) => subsets.includes(b.subset));
      for (const s of got) if (!subsets.includes(s)) skipped.add(s);
      const missing = subsets.filter((s) => !got.has(s));
      if (missing.includes('cyrillic')) throw new Fail(`у «${family}» нет подмножества cyrillic (Google отдал: ${[...got].join(', ')}) — русский текст этим шрифтом наберётся системным. Латинская надпись-логотип — --text "…"; иначе другой шрифт: ${SKILL_CMD} pick`, 2);
      for (const s of missing) warn(`у «${family}» нет подмножества ${s}${s === 'latin-ext' ? ' — знак ₽ нарисует запасной шрифт' : ''}`);
      if (!chosen.length) throw new Fail(`из запрошенных подмножеств (${subsets.join(', ')}) Google не отдал ни одного`);
    } else warn('Google отдал шрифт без деления на подмножества — беру целиком');
  }
  const dropped = droppedStyles(chosen, spec, italic);
  if (dropped.length) warn(`Google не отдал: ${dropped.map((d) => `${d.w}${d.style === 'italic' ? ' курсив' : ''}`).join(', ')} — у шрифта нет этого начертания; CSS с ним даст синтетику (typography.md §6)`);

  /* скачать в память: адреса только с fonts.gstatic.com; пустой файл или не woff2 — ошибка (обрезанный адрес) */
  const urls = uniq(chosen.map((b) => b.url));
  const bufs = new Map();
  for (const u of urls) {
    let origin; try { origin = new URL(u).origin; } catch { throw new Fail(`адрес файла в ответе испорчен: ${u}`); }
    if (!FILE_ORIGINS.has(origin)) throw new Fail(`адрес файла не с fonts.gstatic.com: ${u} — не качаю`);
  }
  for (let i = 0; i < urls.length; i += 4) {
    await Promise.all(urls.slice(i, i + 4).map(async (u) => {
      let r; try { r = await request(u, { binary: true }); } catch (e) { if (e instanceof NetFail) throw new Fail(netMessage(e)); throw e; }
      if (r.status !== 200) throw new Fail(`файл шрифта: HTTP ${r.status} — ${u}`);
      if (!FILE_ORIGINS.has(new URL(r.finalUrl).origin)) throw new Fail(`файл шрифта увёл на чужой адрес: ${r.finalUrl}`);
      if (!r.body.length) throw new Fail(`файл шрифта пустой (0 байт) — адрес обрезан или сбой сети: ${u}`);
      if (r.body.toString('latin1', 0, 4) !== 'wOF2') throw new Fail(`файл шрифта не woff2 (начало «${r.body.toString('latin1', 0, 4).replace(/[^\x20-\x7e]/g, '?')}»): ${u}`);
      bufs.set(u, r.body);
    }));
  }
  const infos = new Map();
  for (const u of urls) { try { infos.set(u, woff2Info(bufs.get(u))); } catch (e) { infos.set(u, null); warn(`таблица знаков не прочитана (${e.message}): ${u} — проверить отрисовкой (cyrillic-check)`); } }
  const files = planFiles(chosen, { family, text: text !== null, infos });

  /* проверка знаков по объединению подмножеств каждого начертания — как их получит страница */
  const groups = new Map();
  for (const f of files) {
    const k = `${f.style}|${f.weight}`;
    if (!groups.has(k)) groups.set(k, { style: f.style, weight: f.weight, codes: new Set(), blind: false, files: [] });
    const g = groups.get(k); g.files.push(f);
    if (f.info) for (const c of f.info.codes) g.codes.add(c); else g.blind = true;
  }
  const extra = opt.need !== undefined ? String(opt.need) : '';
  const fails = []; const lines = [];
  const downloaded = new Set(files.map((f) => f.subset).filter(Boolean));
  const why = (ch) => { const subs = subsetsOf(cp(ch)); const none = subs.length && !subs.some((s) => downloaded.has(s)); return none ? `${ch} (не качали ${subs.join(' / ')})` : ch; };
  for (const g of groups.values()) {
    const label = `${g.weight.replace(' ', '–')}${g.style === 'italic' ? ' курсив' : ''}`;
    if (g.blind) { lines.push(`  ${label}: таблица знаков не прочитана — не проверено`); continue; }
    if (text !== null) {
      const need = charsOf(text + extra);
      const miss = need.filter((ch) => !g.codes.has(cp(ch)));
      if (miss.length) fails.push(`${label}: в подмножестве надписи нет знаков ${miss.join('')} — у шрифта их нет, надпись частью наберётся запасным`);
      lines.push(`  ${label}: знаки надписи ${need.length - miss.length} из ${need.length}${miss.length ? ` — нет ${miss.join('')}` : ''}`);
      continue;
    }
    const bits = [];
    if (subsets.includes('cyrillic')) {
      const cm = [...CYR_LETTERS].filter((ch) => !g.codes.has(cp(ch)));
      bits.push(`кириллица ${66 - cm.length} из 66${cm.length ? ` — нет ${cm.join('')}` : ''}`);
      if (cm.length) fails.push(`${label}: в файлах нет букв ${cm.join('')}`);
    }
    const signs = charsOf(RU_SIGNS + extra);
    const sm = signs.filter((ch) => !g.codes.has(cp(ch)));
    bits.push(sm.length ? `нет знаков: ${sm.map(why).join(', ')}` : `знаки ${signs.join('')} — есть`);
    if (sm.length) warn(`${family} ${label}: нет знаков ${sm.map(why).join(', ')} — их нарисует запасной шрифт`);
    lines.push(`  ${label}: ${bits.join(' · ')}`);
  }
  if (fails.length) {
    for (const l of lines) console.log(l);
    throw new Fail(`${family}: ${fails.join('; ')}. Ничего не записано`, 2);
  }

  /* запись: файлы, раздел fonts.css, свои прежние файлы раздела — удалить */
  const dir = ensureDir(path.join(out, 'fonts'));
  const cssFile = path.join(dir, 'fonts.css');
  const key = text !== null ? `${family} · надпись` : family;
  const lic = loadLicenses().get(family.toLowerCase());
  const [licName, licUrl] = LICENSES[lic] || [lic ? `лицензия ${lic}` : 'лицензия — на странице specimen', null];
  const spUrl = (font && font.url) || `https://fonts.google.com/specimen/${family.replace(/ /g, '+')}`;
  const today = new Date().toLocaleDateString('sv-SE');
  const varNote = uniq(files.filter((f) => f.info && f.info.wght).map((f) => `${f.info.wght[0]}–${f.info.wght[1]}`));
  const head = [
    `/* ${noEnd(family)} — ${licName}${licUrl ? ` (${licUrl})` : ''}, ${spUrl}`,
    `   fonts.mjs get ${today}: веса ${spec.range ? spec.range.join('..') : spec.list.join(', ')}${italic ? ' + курсив' : ''}${varNote.length ? `; переменный файл, wght ${varNote.join(', ')}` : ''}; ${text !== null ? `надпись «${noEnd(text.normalize('NFC').replace(/\s+/g, ' ').trim())}» — только её знаки: сменили надпись — скачать заново` :`подмножества ${uniq(files.map((f) => f.subset).filter(Boolean)).join(', ')}`} */`,
  ].join('\n');
  const prev = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, 'utf8') : '';
  const merged = mergeSection(prev, key, `${head}\n${files.map(faceCss).join('\n')}`);
  for (const f of files) fs.writeFileSync(path.join(dir, f.name), bufs.get(f.url));
  const removed = [];
  for (const n of sectionFiles(merged.old)) if (!files.some((f) => f.name === n) && fs.existsSync(path.join(dir, n))) { fs.rmSync(path.join(dir, n)); removed.push(n); }
  fs.writeFileSync(cssFile, merged.css);

  const total = files.reduce((a, f) => a + bufs.get(f.url).length, 0);
  console.log(`\n${family} · ${licName} · ${text !== null ? `надпись «${text}»` : `подмножества ${uniq(files.map((f) => f.subset).filter(Boolean)).join(', ')}${skipped.size ? ` (не взяты: ${[...skipped].join(', ')})` : ''}`}`);
  const rel = (p) => path.relative(out, p).replace(/\\/g, '/');
  const w = Math.max(...files.map((f) => rel(path.join(dir, f.name)).length));
  for (const f of files) {
    const info = f.info; const extraNote = info && info.wght ? `переменный, wght ${info.wght[0]}–${info.wght[1]}` : `вес ${f.weight}`;
    console.log(`  ${rel(path.join(dir, f.name)).padEnd(w)}  ${kb(bufs.get(f.url).length).padStart(9)}  ${extraNote}${f.style === 'italic' ? ', курсив' : ''}${info ? `, знаков ${info.codes.size}` : ''}`);
  }
  console.log(`  ${rel(cssFile).padEnd(w)}  раздел «${key}» ${merged.replaced ? 'заменён' : 'добавлен'}, разделов в файле: ${sectionCount(merged.css)}${removed.length ? `; удалены прежние файлы раздела: ${removed.join(', ')}` : ''}`);
  console.log(`Всего: ${files.length} ${files.length === 1 ? 'файл' : files.length < 5 ? 'файла' : 'файлов'}, ${kb(total)}${text === null ? ' — браузер качает подмножество, только когда на странице есть его знаки' : ''}`);
  console.log('Знаки (таблица cmap файлов):');
  for (const l of lines) console.log(l);
  const pre = files.find((f) => f.subset === 'cyrillic' && f.style === 'normal') || files.find((f) => f.style === 'normal') || files[0];
  console.log('Подключить:');
  console.log(`  <link rel="preload" href="${rel(path.join(dir, pre.name))}" as="font" type="font/woff2" crossorigin>`);
  console.log(`  <link rel="stylesheet" href="${rel(cssFile)}">`);
  console.log(`  font-family: '${files[0].family}', ${fallbackStack(font)};`);
  if (text === null && files.some((f) => f.subset === 'cyrillic')) {
    const cyrFile = files.find((f) => f.subset === 'cyrillic' && f.style === 'normal') || files.find((f) => f.subset === 'cyrillic');
    const probe = spec.range ? [spec.range[0], spec.range[1]] : spec.list;
    console.log('Проверка отрисовкой (Chrome, навык design-reference):');
    console.log(`  ${CYR_CHECK} "${path.join(dir, cyrFile.name)}" --chars "№Ёё"`);
    console.log(`  на поднятом сайте (serve.mjs) — все подмножества, как их грузит страница: ${CYR_CHECK} --css http://localhost:<порт>/${rel(cssFile)} ${probe.map((x) => `"${files[0].family}:${x}"`).join(' ')}`);
  } else if (text !== null) console.log('Проверка отрисовкой cyrillic-check здесь не годится: в подмножестве надписи нет букв его пробы — хватает таблицы знаков выше; на странице — глазами.');
  console.log(`${warns.length ? 'WARN' : 'OK'}: ${family}${text !== null ? ' (надпись)' : ''} — ${files.length} ${files.length === 1 ? 'файл' : files.length < 5 ? 'файла' : 'файлов'}, ${kb(total)}; ${text !== null ? 'все знаки надписи на месте' : subsets.includes('cyrillic') ? 'кириллица на месте' : 'без кириллицы (--subsets)'}${warns.length ? `; предупреждений ${warns.length}` : ''}`);
  return 0;
}

/* ---------- самопроверка ---------- */

/** Синтетический WOFF2 для самопроверки: cmap формата 4 с заданными кодами (BMP) и, по желанию, fvar с осью wght. */
function makeWoff2(codes, { wght = null } = {}) {
  const cps = uniq(codes).filter((c) => c > 0 && c < 0xffff).sort((a, b) => a - b);
  const segs = [];
  for (const c of cps) { const s = segs[segs.length - 1]; if (s && c === s[1] + 1) s[1] = c; else segs.push([c, c]); }
  segs.push([0xffff, 0xffff]);
  const n = segs.length; const sub = Buffer.alloc(16 + n * 8);
  sub.writeUInt16BE(4, 0); sub.writeUInt16BE(sub.length, 2); sub.writeUInt16BE(n * 2, 6);
  let p = 14; for (const [, e] of segs) { sub.writeUInt16BE(e, p); p += 2; }
  p += 2; for (const [s] of segs) { sub.writeUInt16BE(s, p); p += 2; }
  let gid = 1; for (const [s, e] of segs) { sub.writeUInt16BE(s === 0xffff ? 1 : (gid - s) & 0xffff, p); p += 2; if (s !== 0xffff) gid += e - s + 1; }
  const cmap = Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 12]), sub]);
  const tables = [[0, cmap]];
  if (wght) {
    const fv = Buffer.alloc(36);
    fv.writeUInt16BE(1, 0); fv.writeUInt16BE(16, 4); fv.writeUInt16BE(2, 6); fv.writeUInt16BE(1, 8); fv.writeUInt16BE(20, 10); fv.writeUInt16BE(8, 14);
    fv.write('wght', 16, 'latin1'); fv.writeInt32BE(wght[0] * 65536, 20); fv.writeInt32BE(wght[0] * 65536, 24); fv.writeInt32BE(wght[1] * 65536, 28); fv.writeUInt16BE(256, 34);
    tables.push([47, fv]);
  }
  const b128 = (v) => { const o = [v & 0x7f]; v = Math.floor(v / 128); while (v > 0) { o.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); } return Buffer.from(o); };
  const dir = Buffer.concat(tables.map(([idx, d]) => Buffer.concat([Buffer.from([idx]), b128(d.length)])));
  const comp = zlib.brotliCompressSync(Buffer.concat(tables.map(([, d]) => d)));
  const head = Buffer.alloc(48);
  head.write('wOF2', 0, 'latin1'); head.writeUInt32BE(0x00010000, 4); head.writeUInt32BE(48 + dir.length + comp.length, 8);
  head.writeUInt16BE(tables.length, 12); head.writeUInt32BE(12 + 16 * tables.length + tables.reduce((a, [, d]) => a + d.length, 0), 16);
  head.writeUInt32BE(comp.length, 20); head.writeUInt16BE(1, 24);
  return Buffer.concat([head, dir, comp]);
}

async function selftest() {
  const FIX = path.join(HERE, 'fixtures', 'fonts');
  const checks = [];
  const check = (name, ok, extra = '') => { checks.push(!!ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fonts-selftest-'));
  const fx = (n) => fs.readFileSync(path.join(FIX, n));

  /* 1. CSV: кавычки, "" внутри, запятые и перевод строки в поле, BOM, CRLF */
  const fixFonts = loadFonts(FIX);
  const tricky = fixFonts && fixFonts.list.find((f) => f.family === 'PT Serif');
  check('CSV: BOM и CRLF, строки одной длины', !!fixFonts && fixFonts.header[0] === 'Family' && fixFonts.bad === 0 && fixFonts.list.length === 17, fixFonts ? `${fixFonts.list.length} семейств, первое поле «${fixFonts.header[0]}», кривых строк ${fixFonts.bad}` : 'нет фикстуры');
  check('CSV: запятая и кавычки "" внутри поля', !!tricky && tricky.designers === 'ParaType, Inc. "PT" team', tricky ? tricky.designers : 'нет PT Serif');
  const nl = parseCsv('a,b\r\n"x\ny",2\r\n');
  check('CSV: перевод строки внутри кавычек', nl.length === 2 && nl[1][0] === 'x\ny' && nl[1][1] === '2', JSON.stringify(nl));
  const pairsFix = loadPairs(FIX);
  check('CSV: typography — запятые внутри полей в кавычках', !!pairsFix && pairsFix.length === 5 && pairsFix[0].mood.startsWith('elegant, luxury'), pairsFix ? pairsFix[0].mood : 'нет фикстуры');

  /* 2. настоящие данные ui-ux-pro-max — если стоят */
  const real = loadFonts(path.join(os.homedir(), '.claude', 'skills', 'ui-ux-pro-max', 'data'));
  if (real) {
    const cyr = real.list.filter(hasCyr).length;
    check('данные ui-ux-pro-max: разбор без кривых строк, кириллица есть', real.list.length > 1000 && real.bad === 0 && cyr > 200, `${real.list.length} семейств, с кириллицей ${cyr}`);
    const byName = new Map(real.list.map((f) => [f.family, f]));
    const lost = [];
    for (const [k, set] of Object.entries(FAM)) for (const n of set) { const f = byName.get(n); if (!f || !hasCyr(f)) lost.push(`${k}: ${n}${f ? ' (без кириллицы)' : ''}`); }
    check('карта характера: все семейства есть в данных и с кириллицей', !lost.length, lost.length ? lost.slice(0, 6).join('; ') : `${Object.values(FAM).reduce((a, s) => a + s.size, 0)} имён`);
  } else console.log('SKIP данные ui-ux-pro-max — не установлены');
  check('«ИИ-набор» прочитан из cliche.mjs', !!OVERUSED.fromCliche && OVERUSED.test('Manrope') && !OVERUSED.test('PT Sans'));

  /* 3. pick на фикстуре */
  const F = fixFonts ? fixFonts.list : [];
  const P = (o) => pickFonts(F, { cats: [], like: { want: [], not: [] }, need: '', weights: [], italic: false, variable: false, n: 50, ...o });
  const names = (r) => r.rows.map((x) => x.f.family);
  let r = P({});
  check('pick: только с кириллицей, без заглушек Symbols', r.rows.length > 0 && r.rows.every((x) => hasCyr(x.f)) && !names(r).some((n) => ['Bebas Neue', 'Space Grotesk', 'Flow Rounded'].includes(n)), names(r).join(', '));
  r = P({ cats: ['serif'] });
  check('pick --category serif', r.rows.length >= 2 && r.rows.every((x) => x.f.cat === 'serif'), names(r).join(', '));
  r = P({ like: parseLike('узкий') });
  check('pick --like узкий: первыми узкие', ['Roboto Condensed', 'Oswald'].includes(names(r)[0]) && ['Roboto Condensed', 'Oswald'].includes(names(r)[1]), names(r).slice(0, 4).join(', '));
  r = P({ like: parseLike('мягкий округлый') });
  check('pick --like мягкий: Comfortaa первым', names(r)[0] === 'Comfortaa', names(r).slice(0, 3).join(', '));
  r = P({ like: parseLike('строгий') });
  const iMan = names(r).indexOf('Manrope'), iRc = names(r).indexOf('Roboto Condensed');
  check('pick: «ИИ-набор» помечен и ниже равных по характеру', iRc >= 0 && iMan > iRc && r.rows[iMan].marks.includes('ИИ-набор'), names(r).join(', '));
  r = P({ like: parseLike('акцидентный не жирный') });
  check('pick: «не жирный» исключает тяжёлые', !names(r).includes('Russo One') && names(r).includes('Comfortaa'), names(r).join(', '));
  const ph = ['без засечек', 'с засечками', 'от руки', 'рукописный, без декора'].map((s) => { const x = parseLike(s); return `${x.want.map((m) => m.key).join('+')}/${x.not.map((m) => m.key).join('+')}`; });
  r = P({ like: parseLike('от руки') });
  check('pick: фразы «без засечек», «с засечками», «от руки», «без …» — исключить', ph.join('|') === 'гротеск/|антиква/|рукописный/|рукописный/декоративный' && names(r)[0] === 'Caveat', `${ph.join(' | ')}; ${names(r).slice(0, 2).join(', ')}`);
  const lk = parseLike('строгий фиолетовый');
  const traps = ['для стартапа', 'functional', 'старославянский', 'для текста'].map((s) => parseLike(s).want.map((m) => m.key).join('+') || '—');
  check('pick: незнакомое слово — в список WARN; «стартап» не винтаж, «functional» не игривый', lk.unknown.join() === 'фиолетовый' && lk.want.length === 1 && traps.join('|') === '—|—|славянский|текстовый', traps.join(' | '));
  r = P({ weights: [900] });
  check('pick --weights 900', r.rows.length > 0 && r.rows.every((x) => hasWeight(x.f, 900)), names(r).join(', '));
  r = P({ variable: true });
  check('pick --variable', r.rows.length > 0 && r.rows.every((x) => Object.keys(x.f.axes).length), names(r).join(', '));
  r = P({ need: '₽№' });
  const last = r.rows[r.rows.length - 1];
  check('pick --need ₽: Prata (нет latin-ext) помечен и последний', last.f.family === 'Prata' && last.marks.some((m) => /₽: нет latin-ext/.test(m)), last ? `${last.f.family}: ${last.marks.join('; ')}` : '');
  r = P({ n: 2 });
  check('pick --n 2', r.rows.length === 2);
  r = P({});
  const jp = r.rows.find((x) => x.f.family === 'Noto Sans JP'); const glitch = r.rows.find((x) => x.f.family === 'Rubik Glitch');
  check('pick: пометки CJK и «декоративный»', !!jp && jp.marks.includes('CJK') && !!glitch && glitch.marks.includes('декоративный'));

  /* 4. pairs */
  const pr = pairFonts(pairsFix || [], F);
  check('pairs: годятся только пары с кириллицей у обоих', pr.ok.map((x) => x.p.no).join() === '1,11', pr.ok.map((x) => `${x.p.no} ${x.p.name}`).join('; '));
  const rej = pr.rejected.map((x) => `${x.p.no}:${x.noCyr.join('+')}|${x.noData.join('+')}`).join(' ');
  check('pairs: отброшенные — с причиной', /3:Space Grotesk\|/.test(rej) && /5:Bebas Neue\|/.test(rej) && /9:\|Poppins\+Open Sans/.test(rej), rej);
  check('pairs: пометка «ИИ-набор» у пары', pr.ok[0] && pr.ok[0].marks.some((m) => /ИИ-набор: Inter/.test(m)));
  check('pairs luxury — отбор по словам', pairFonts(pairsFix || [], F, ['luxury']).ok.length === 1);

  /* 5. адрес CSS2 и веса */
  const G = 'https://fonts.googleapis.com';
  const u1 = buildCss2Url({ family: 'Playfair Display', spec: { list: [700, 400, 400] }, italic: true, base: G });
  check('адрес: пробел → «+», веса по порядку, курсив ital,wght', u1 === `${G}/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap`, u1);
  const u2 = buildCss2Url({ family: 'Manrope', spec: { range: [300, 800] }, base: G });
  check('адрес: диапазон переменного', u2 === `${G}/css2?family=Manrope:wght@300..800&display=swap`, u2);
  const u3 = buildCss2Url({ family: 'Manrope', spec: { list: [700] }, text: 'Зёрна ₽ Зёрна', base: G });
  check('адрес: text= с кириллицей в %-кодах UTF-8, знаки по разу', u3 === `${G}/css2?family=Manrope:wght@700&display=swap&text=%D0%97%D1%91%D1%80%D0%BD%D0%B0%20%E2%82%BD`, u3);
  const u4 = buildCss2Url({ family: 'Manrope', spec: { list: [700] }, text: 'Зёрна ₽', base: G });
  check('адрес: «е» с точками (два знака) = «ё»', u4 === u3);
  let pw = parseWeights('700, 400'); const pw2 = parseWeights('300..800');
  let bads = 0; for (const b of ['950,1200', '800..300', 'abc', '400;700']) { try { parseWeights(b); } catch (e) { if (e instanceof Fail) bads++; } }
  check('веса: список, диапазон, отказы', pw.list.join() === '400,700' && pw2.range.join() === '300,800' && bads === 4);

  /* 6. разбор сохранённых ответов CSS2 */
  const bm = parseCss2(fx('css2-manrope.css').toString('utf8'));
  const cyrB = bm.find((b) => b.subset === 'cyrillic');
  check('CSS2 Manrope 400;700: 12 блоков, 6 подмножеств, 6 файлов (переменный)', bm.length === 12 && uniq(bm.map((b) => b.subset)).length === 6 && uniq(bm.map((b) => b.url)).length === 6, `${bm.length} блоков, ${uniq(bm.map((b) => b.url)).length} адресов`);
  check('CSS2: unicode-range и адрес cyrillic целиком', !!cyrB && cyrB.range === 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' && /^https:\/\/fonts\.gstatic\.com\/s\/manrope\/v\d+\/\w+\.woff2$/.test(cyrB.url) && cyrB.format === 'woff2', cyrB ? cyrB.url : '');
  const bt = parseCss2(fx('css2-text.css').toString('utf8'));
  check('CSS2 text=: адрес …/l/font?kit=…&skey=…&v=… не обрезан', bt.length === 1 && bt[0].subset === null && /\/l\/font\?kit=[\w-]+&skey=\w+&v=v\d+$/.test(bt[0].url) && /U\+20bd/i.test(bt[0].range || ''), bt[0] ? bt[0].url : '');
  const bi = parseCss2(fx('css2-playfair-ital.css').toString('utf8'));
  check('CSS2 Playfair курсив: 16 блоков, курсив, адреса с «&» целиком', bi.length === 16 && bi.filter((b) => b.style === 'italic').length === 8 && bi.every((b) => /&skey=\w+&v=v\d+$/.test(b.url)), `${bi.length} блоков`);

  /* 7. файлы и fonts.css */
  const chosenM = bm.filter((b) => DEFAULT_SUBSETS.includes(b.subset));
  const infos = new Map(uniq(chosenM.map((b) => b.url)).map((u) => [u, { codes: new Set(), wght: [200, 800], tables: [] }]));
  const plan = planFiles(chosenM, { family: 'Manrope', infos });
  check('переменный: один файл на подмножество, вес из оси файла', plan.length === 3 && plan.every((f) => f.weight === '200 800') && plan.map((f) => f.name).join() === 'manrope-200-800-cyrillic.woff2,manrope-200-800-latin-ext.woff2,manrope-200-800-latin.woff2', plan.map((f) => `${f.name} ${f.weight}`).join('; '));
  const planStatic = planFiles(chosenM.filter((b) => b.weight === '400'), { family: 'Manrope', infos: new Map() });
  check('без оси: вес как у Google', planStatic.length === 3 && planStatic.every((f) => f.weight === '400' && /-400-/.test(f.name)));
  const face = faceCss(plan[0]);
  check('@font-face: swap, свой файл, unicode-range', /font-display: swap;/.test(face) && /src: url\('manrope-200-800-cyrillic\.woff2'\) format\('woff2'\);/.test(face) && /unicode-range: U\+0301/.test(face) && /font-weight: 200 800;/.test(face));
  let css = '.logo { color: red; }\n';
  css = mergeSection(css, 'Manrope', '@font-face { src: url(\'manrope-a.woff2\'); }').css;
  css = mergeSection(css, 'Oswald', '@font-face { src: url(\'oswald-a.woff2\'); }').css;
  const again = mergeSection(css, 'Manrope', '@font-face { src: url(\'manrope-b.woff2\'); }');
  check('fonts.css: разделы сливаются, свой CSS цел, повтор заменяет свой', sectionCount(again.css) === 2 && again.replaced && /\.logo \{ color: red; \}/.test(again.css) && /manrope-b/.test(again.css) && !/manrope-a/.test(again.css) && /oswald-a/.test(again.css) && sectionFiles(again.old).join() === 'manrope-a.woff2', sectionFiles(again.old).join());
  check('fonts.css: «*/» в надписи не рвёт комментарий', !/\*\/x/.test(noEnd('a*/x')));

  /* 8. WOFF2: живой файл надписи и синтетические */
  let wi = null; try { wi = woff2Info(fx('manrope-text.woff2')); } catch (e) { wi = { err: e.message }; }
  check('WOFF2 живой (Manrope 700, text=«Зёрна ₽»): знаки надписи в cmap', !!(wi && wi.codes) && charsOf('Зёрна ₽').every((ch) => wi.codes.has(cp(ch))) && !wi.codes.has(cp('Ж')) && wi.tables.includes('glyf'), wi && wi.codes ? `${wi.codes.size} кодов, таблиц ${wi.tables.length}` : JSON.stringify(wi));
  const synth = woff2Info(makeWoff2([...CYR_LETTERS].map(cp).concat(0x2116), { wght: [200, 800] }));
  check('WOFF2 синтетический: 66 букв, №, ось wght 200–800', [...CYR_LETTERS].every((ch) => synth.codes.has(cp(ch))) && synth.codes.has(0x2116) && !synth.codes.has(0x20bd) && synth.wght && synth.wght.join() === '200,800');
  let e1 = '', e2 = '';
  try { woff2Info(Buffer.from('not a font at all, just some text that is long enough to pass the length check')); } catch (e) { e1 = e.message; }
  try { const t = fx('manrope-text.woff2'); woff2Info(t.subarray(0, 200)); } catch (e) { e2 = e.message; }
  check('WOFF2: не шрифт и обрезанный — понятная ошибка, не падение', /не WOFF2/.test(e1) && /обрезан/.test(e2), `${e1} | ${e2}`);

  /* 9. командная строка */
  const port0 = await new Promise((res) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const run = (args, env = {}) => new Promise((resolve) => {
    const p = spawn(process.execPath, [SELF, ...args], { env: { ...process.env, FONTS_DATA_DIR: FIX, FONTS_API_BASE: `http://127.0.0.1:${port0}`, ...env }, cwd: tmp });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  let c = await run(['get', 'Manrope', '--weigths', '400', '--out', tmp]);
  check('опечатка во флаге — код 1 и подсказка', c.code === 1 && /--weigths.*может быть, --weights/.test(c.out), c.out.trim().split('\n')[0]);
  c = await run(['get', '--out', tmp]);
  check('get без семейства — код 1', c.code === 1 && /нужно семейство/.test(c.out));
  c = await run(['get', 'Manrope']);
  check('get без --out — код 1', c.code === 1 && /--out/.test(c.out));
  c = await run(['pick', '--category', 'fantasy']);
  check('pick --category fantasy — код 1', c.code === 1 && /такой нет/.test(c.out));
  c = await run(['pick', '--like', 'узкий строгий', '-n', '3']);
  check('pick из командной строки: таблица, команда get, итог', c.code === 0 && /specimen/.test(c.out) && /get "Roboto Condensed"/.test(c.out) && /^OK: 3 из \d+/m.test(c.out), c.out.trim().split('\n').pop());
  c = await run(['pairs']);
  check('pairs из командной строки: таблица, отброшенные по шрифту, команды get', c.code === 0 && /Classic Elegant/.test(c.out) && /нет кириллицы у шрифта/.test(c.out) && /Space Grotesk — №3/.test(c.out) && /Poppins — №9/.test(c.out) && /get "Playfair Display"/.test(c.out) && /^OK: /m.test(c.out), c.out.trim().split('\n').pop());
  c = await run(['pick'], { FONTS_DATA_DIR: path.join(tmp, 'нет-данных') });
  check('pick без данных — FAIL, код 1', c.code === 1 && /нет данных/.test(c.out));
  c = await run(['get', 'Manrope', '--weights', '400,700', '--out', path.join(tmp, 'offline')]);
  check('get без сети — код 1, понятная ошибка, ничего не записано', c.code === 1 && /нет связи с 127\.0\.0\.1/.test(c.out) && !fs.existsSync(path.join(tmp, 'offline')), c.out.trim().split('\n').pop());
  c = await run(['get', 'Yeseva One', '--weights', '400,700', '--out', path.join(tmp, 'yeseva')]);
  check('get: веса сверяются с данными до сети', c.code === 1 && /нет веса 700: есть 400/.test(c.out) && !/нет связи/.test(c.out), c.out.trim().split('\n').pop());

  /* 10. get целиком на своём сервере (CSS2 и файлы — имитация Google) */
  const cssManrope = fx('css2-manrope.css').toString('utf8'); const cssText = fx('css2-text.css').toString('utf8'); const textWoff = fx('manrope-text.woff2');
  const ascii = []; for (let k = 0x20; k < 0x7f; k++) ascii.push(k);
  const CODES = { cyrillic: [...CYR_LETTERS].map(cp).concat(0x2116, 0x301), latin: ascii.concat([...'«»„“—–…'].map(cp)), 'latin-ext': [0x20bd, 0x100, 0x101], 'cyrillic-ext': [0x462], greek: [0x3b1], vietnamese: [0x1ea0] };
  const varFiles = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [k, makeWoff2(v, { wght: [200, 800] })]));
  const staticFiles = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [k, makeWoff2(v)]));
  const pathSubset = new Map(bm.map((b) => [new URL(b.url).pathname, b.subset]));
  const seen = [];
  const mockCss = (base, fam, list, file = null) => list.map(([s, w]) => `/* ${s} */\n@font-face {\n  font-family: '${fam}';\n  font-style: normal;\n  font-weight: ${w};\n  font-display: swap;\n  src: url(${base}${file || `/mock/${fam}/${s}-${w}.woff2`}) format('woff2');\n  unicode-range: ${SUBSET_RANGES[s]};\n}\n`).join('');
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); seen.push({ url: req.url, ua: String(req.headers['user-agent'] || '') });
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
    const base = `http://127.0.0.1:${srv.address().port}`;
    if (u.pathname === '/css2') {
      const fam = String(u.searchParams.get('family') || '').split(':')[0];
      if (fam === 'Manrope') return send(200, 'text/css; charset=utf-8', (u.searchParams.has('text') ? cssText : cssManrope).split('https://fonts.gstatic.com').join(base));
      if (fam === 'Oswald') return send(200, 'text/css; charset=utf-8', mockCss(base, fam, [['cyrillic', 400], ['latin-ext', 400], ['latin', 400], ['cyrillic', 700], ['latin-ext', 700], ['latin', 700]]));
      if (fam === 'Latinfont') return send(200, 'text/css; charset=utf-8', mockCss(base, fam, [['latin-ext', 400], ['latin', 400]]));
      if (fam === 'Mockfont') return send(200, 'text/css; charset=utf-8', mockCss(base, fam, [['cyrillic', 400], ['latin-ext', 400], ['latin', 400]]));
      if (fam === 'Emptyfont') return send(200, 'text/css; charset=utf-8', mockCss(base, fam, [['cyrillic', 400]], '/empty'));
      if (fam === 'Farfont') return send(200, 'text/css; charset=utf-8', mockCss('https://evil.example', fam, [['cyrillic', 400]]));
      return send(400, 'text/html; charset=utf-8', '<!DOCTYPE html><html lang=en><title>Error 400 (Bad Request)!!1</title></html>');
    }
    if (u.pathname === '/empty') return send(200, 'font/woff2', Buffer.alloc(0));
    if (u.pathname === '/l/font') return send(200, 'font/woff2', textWoff);
    const m = /^\/mock\/[^/]+\/([a-z-]+)-\d+\.woff2$/.exec(u.pathname);
    if (m) return send(200, 'font/woff2', staticFiles[m[1]]);
    const sub = pathSubset.get(u.pathname);
    if (sub) return send(200, 'font/woff2', varFiles[sub]);
    return send(404, 'text/plain', 'not found');
  });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const mock = { FONTS_API_BASE: `http://127.0.0.1:${srv.address().port}` };
  const site = path.join(tmp, 'сайт'); const fontsDir = path.join(site, 'fonts'); const cssPath = path.join(fontsDir, 'fonts.css');
  const woffs = () => (fs.existsSync(fontsDir) ? fs.readdirSync(fontsDir).filter((n) => n.endsWith('.woff2')).sort() : []);
  c = await run(['get', 'Manrope', '--weights', '400,700', '--out', site], mock);
  const q = seen.find((x) => x.url.startsWith('/css2'));
  const css1 = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  check('get: запрос с User-Agent Chrome, веса и display=swap', !!q && /Chrome\/\d+/.test(q.ua) && q.url.includes('family=Manrope:wght@400;700&display=swap'), q ? q.url : 'запроса нет');
  check('get: 3 файла (cyrillic, latin, latin-ext), fonts.css — 3 @font-face с весом из оси', c.code === 0 && woffs().join() === 'manrope-200-800-cyrillic.woff2,manrope-200-800-latin-ext.woff2,manrope-200-800-latin.woff2' && (css1.match(/@font-face/g) || []).length === 3 && /font-weight: 200 800;/.test(css1), `код ${c.code}; ${woffs().join(', ')}; ${c.out.trim().split('\n').pop()}`);
  check('get: кириллица 66 из 66, строки подключения, команда cyrillic-check; Manrope — WARN «ИИ-набор»', /^WARN: Manrope/m.test(c.out) && /ИИ-набора/.test(c.out) && /кириллица 66 из 66/.test(c.out) && /rel="preload" href="fonts\/manrope-200-800-cyrillic\.woff2"/.test(c.out) && /cyrillic-check\.mjs ".*manrope-200-800-cyrillic\.woff2" --chars "№Ёё"/.test(c.out) && /--css http:\/\/localhost:<порт>\/fonts\/fonts\.css "Manrope:400" "Manrope:700"/.test(c.out), c.out.trim().split('\n').pop());
  check('get: лицензия и дата в шапке раздела', /SIL Open Font License 1\.1/.test(css1) && /fonts\.mjs get \d{4}-\d\d-\d\d/.test(css1));
  c = await run(['get', 'Manrope', '--weights', '700', '--text', 'Зёрна ₽', '--out', site], mock);
  const css2 = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  check('get --text: файл надписи, свой раздел рядом с полным', c.code === 0 && fs.existsSync(path.join(fontsDir, 'manrope-700-text.woff2')) && fs.statSync(path.join(fontsDir, 'manrope-700-text.woff2')).size === textWoff.length && sectionCount(css2) === 2 && /fonts\.mjs: Manrope · надпись/.test(css2) && /надпись «Зёрна ₽» — только её знаки/.test(css2) && /unicode-range: U\+20, U\+308, U\+417/.test(css2), c.out.trim().split('\n').pop());
  c = await run(['get', 'Manrope', '--weights', '700', '--text', 'Зёрна Ж', '--out', site], mock);
  check('get --text: нет знака надписи (Ж) — код 2, fonts.css не тронут', c.code === 2 && /нет знаков Ж/.test(c.out) && fs.readFileSync(cssPath, 'utf8') === css2, c.out.trim().split('\n').pop());
  c = await run(['get', 'Manrope', '--weights', '400,700', '--subsets', 'cyrillic,latin', '--out', site], mock);
  check('get без latin-ext: WARN про ₽, прежний файл latin-ext удалён', c.code === 0 && /^WARN: Manrope/m.test(c.out) && /₽ \(не качали latin-ext\)/.test(c.out) && !woffs().includes('manrope-200-800-latin-ext.woff2') && woffs().includes('manrope-700-text.woff2'), woffs().join(', '));
  c = await run(['get', 'Oswald', '--out', path.join(tmp, 's7')], mock);
  const s7 = path.join(tmp, 's7', 'fonts');
  const s7w = fs.existsSync(s7) ? fs.readdirSync(s7).filter((n) => n.endsWith('.woff2')).sort() : [];
  check('get Oswald (статичный, по умолчанию 400 и 700): 6 файлов, итог OK', c.code === 0 && /^OK: Oswald/m.test(c.out) && s7w.length === 6 && s7w.includes('oswald-700-cyrillic.woff2') && /family=Oswald:wght@400;700&display=swap/.test(seen.map((x) => x.url).join(' ')), `${s7w.join(', ')}; ${c.out.trim().split('\n').pop()}`);
  c = await run(['get', 'Latinfont', '--out', path.join(tmp, 's2')], mock);
  check('get: нет подмножества cyrillic — код 2, ничего не записано', c.code === 2 && /нет подмножества cyrillic/.test(c.out) && !fs.existsSync(path.join(tmp, 's2')), c.out.trim().split('\n').pop());
  c = await run(['get', 'Mockfont', '--weights', '400,700', '--out', path.join(tmp, 's3')], mock);
  check('get: Google не отдал вес 700 — WARN, статичные файлы по весу', c.code === 0 && /Google не отдал: 700/.test(c.out) && fs.existsSync(path.join(tmp, 's3', 'fonts', 'mockfont-400-cyrillic.woff2')), c.out.trim().split('\n').pop());
  c = await run(['get', 'Emptyfont', '--out', path.join(tmp, 's4')], mock);
  check('get: пустой файл (обрезанный адрес) — код 1', c.code === 1 && /пустой \(0 байт\)/.test(c.out), c.out.trim().split('\n').pop());
  c = await run(['get', 'Farfont', '--out', path.join(tmp, 's5')], mock);
  check('get: файл не с fonts.gstatic.com — не качает', c.code === 1 && /не с fonts\.gstatic\.com/.test(c.out), c.out.trim().split('\n').pop());
  c = await run(['get', 'Manropee', '--out', path.join(tmp, 's6')], mock);
  check('get: неизвестное семейство — HTTP 400 и подсказка по данным', c.code === 1 && /HTTP 400/.test(c.out) && /может быть, «Manrope»/.test(c.out), c.out.trim().split('\n').pop());
  srv.close();

  const bad = checks.filter((x) => !x).length;
  console.log(`${bad ? 'FAIL' : 'OK'}: проверок ${checks.length}, не прошло ${bad}${bad ? ` · стенд оставлен: ${tmp}` : ''}`);
  if (!bad) fs.rmSync(tmp, { recursive: true, force: true });
  return bad ? 1 : 0;
}

/* ---------- запуск ---------- */

const ALLOWED = { pick: ['category', 'like', 'need', 'weights', 'italic', 'variable', 'n'], pairs: [], get: ['weights', 'italic', 'subsets', 'text', 'need', 'out'], selftest: [] };
const cmd = opt.selftest ? 'selftest' : pos.shift();
try {
  for (const k of VALUE_FLAGS) if (opt[k] === true) throw new Fail(`--${k} без значения (-h — справка)`);
  if (cmd && ALLOWED[cmd]) for (const k of Object.keys(opt)) if (!ALLOWED[cmd].includes(k) && k !== 'selftest') console.log(`WARN: --${k} к команде ${cmd} не относится — не используется`);
  if (cmd === 'selftest') process.exit(await selftest());
  if (cmd === 'pick') process.exit(cmdPick());
  if (cmd === 'pairs') process.exit(cmdPairs());
  if (cmd === 'get') process.exit(await cmdGet());
  if (!cmd) { console.log(HELP); process.exit(1); }
  throw new Fail(`не знаю команду «${cmd}» — pick, pairs, get или --selftest (-h — справка)`);
} catch (e) {
  if (e instanceof Fail) { console.error(`FAIL: ${e.message}`); process.exit(e.code); }
  throw e;
}
