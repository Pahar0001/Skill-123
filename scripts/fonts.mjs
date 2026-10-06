#!/usr/bin/env node
/**
 * Шрифты с кириллицей: подобрать по образцу (числа отрисовки + лист для глаз), записать решение и скачать к себе —
 * файлы woff2 и fonts.css в папку сайта. Порядок выбора по шагам — reference/fonts.md; источники шрифтов —
 * scripts/fonts/sources.json. Подключены Google Fonts (бесплатно, лицензии свободные — почти всё SIL OFL 1.1,
 * несколько семейств Apache 2.0 и Ubuntu Font Licence; кириллица у 294 семейств из 1950) и Fontshare (64 шрифта ITF
 * под ITF Free Font License 2.0: бесплатно и коммерчески, но кириллицы нет ни у одного, файлы нельзя урезать и
 * передавать — только латинские надписи, --latin). Adobe Fonts записан выключенным: свои файлы на сайте запрещены.
 * На сайте — свои файлы, а не CDN (reference/typography.md §16); надпись-логотип Google — подмножеством ровно под
 * её знаки (--text).
 *
 *   node fonts.mjs measure <адрес | файл шрифта | "Семейство"> [--selector h1] [--weight 700] [--run <папка прогона> | --out <файл.json>]
 *   node fonts.mjs match <образец.json> [--sources google,fontshare] [--n 8] [--category sans-serif] [--need "₽№«»"] [--latin] [--refresh]
 *   node fonts.mjs sheet <образец.json> "<Семейство>" ["google:Семейство:600" …] [--out <лист.png>]
 *   node fonts.mjs decide "<Семейство>" --run <папка прогона> --why "<почему>" [--source google] [--weight 700]
 *   node fonts.mjs pick [--category serif|sans-serif|display|handwriting|monospace] [--like "<характер по-русски>"]
 *                       [--need "₽№«»—"] [--weights 400,700] [--italic] [--variable] [--n 10]
 *   node fonts.mjs pairs [слова по-английски: luxury, editorial, tech…]
 *   node fonts.mjs get "<Семейство>" --out <папка сайта> [--weights 400,700 | --weights 300..800] [--italic]
 *                      [--subsets cyrillic,latin,latin-ext] [--text "Надпись"] [--need "₽№"] [--root <корень сайта>]
 *   node fonts.mjs get "fontshare:<Семейство>" --latin --out <папка сайта> [--weights 500,700] [--italic] [--root <корень>]
 *   node fonts.mjs selftest   (или --selftest)
 *   node fonts.mjs --help   (или -h)
 *
 * measure  числа шрифта образца по отрисовке в Chrome (холст 200 px, пиксели): x/cap — высота строчных к
 *          заглавным (x к H); ширина — средняя ширина знака по краскам к высоте H, строчных a–z и прописных A–Z
 *          (узкий 0.4/0.5, широкий 0.8/1.0), и шаг набора к кеглю (знак с полями); контраст —
 *          тонкий штрих к толстому (перекладина H к ножке, верх O к боку; 1 — моноширинный штрих, 0.3 — дидона);
 *          круглота — ширина O к высоте; штрих — толщина ножки H к высоте H (насколько тёмный вес); засечки —
 *          ширина низа и верха ножек H, I, n к самой ножке (1 — рубленый, от 1.35 — засечки); концы — ширина
 *          у края ножки I, l к ножке (прямой срез ~1, скругление меньше); раскрытие — просвет «c» к высоте x;
 *          cap/кегль;
 *          у кириллицы — высота Й/Ё над строкой и хвосты Д/Ц/Щ (зазор при line-height 0.9 и 1.0). Образец:
 *          адрес — элемент --selector (по умолчанию h1) на живой странице: его шрифт, вес, трекинг, кегль,
 *          интерлиньяж, регистр — как на образце, плюс есть ли у шрифта кириллица и полоса для листа (образец
 *          как есть, PNG); файл шрифта (woff2/woff/ttf/otf) — сам файл, вес --weight (по умолчанию 400);
 *          «Семейство» — из подключённых источников («google:Inter Tight», «Inter Tight:700»). Латинский
 *          образец годится: числа снимаются с латиницы. Протокол: --run → <папка>/fonts/sample.json, --out —
 *          свой путь, иначе ~/.claude/site-rework/cache/fonts/samples/<имя>/sample.json.
 * match    кандидаты из подключённых источников (--sources, по умолчанию все включённые в sources.json) —
 *          только с кириллицей и только с лицензией источника, где разрешены веб и свои файлы. Каждый
 *          качается подмножеством знаков пробы (латиница, 66 букв с Ёё, ₽№«»„“—–…, знаки листа) в кэш
 *          ~/.claude/site-rework/cache/fonts/<источник>/ и меряется тем же способом в весе образца (ближайшем
 *          у кандидата). С --latin — для латинской надписи (логотип, цифры, английский текст): кириллица не
 *          нужна, в файле проверяются A–Z, a–z, 0–9, знаки --need — только если заданы; так подбираются шрифты
 *          Fontshare (у них кириллицы нет). Отсев называется, а не молчит: нет кириллицы по данным источника — числом; нет букв
 *          в самом файле, нет знаков --need (по умолчанию ₽№«»), лицензия — списком с расстоянием. Расстояние —
 *          взвешенная разница чисел в долях обычного разброса (у образца капсом — ширина прописных весомее,
 *          x/cap легче), разные засечки — штраф +1. Таблица: место, расстояние, числа и разница с образцом,
 *          зазор Й/Ё при line-height 0.9, пометки («ИИ-набор», CJK, декоративный); под ней — команды sheet и
 *          decide. Протокол — match.json рядом с образцом. Первый прогон Google — до минуты-двух (291 файл по
 *          10–35 КБ), дальше секунды из кэша (числа — в cache/fonts/metrics.json). Второй проход: у первых 24 —
 *          соседние веса ±100 и ±200, берётся вес с меньшим расстоянием (в таблице «600*»). Трекинг в таблице —
 *          воздух между буквами как у образца; кегль × — во сколько раз крупнее для той же высоты прописных.
 * sheet    лист для глаз (PNG): образец как есть (у адреса — полоса со страницы донора, кириллица чужим
 *          шрифтом видна сразу) и кандидаты в весе образца, в том же кегле, с трекингом «воздух как у
 *          образца» — строка «САЙТЫ, СЕРВИСЫ · ЁЖ 20 000 ₽»,
 *          она же строчными, абзац и капс с Й/Ё в две строки при line-height 0.9 и 1.0 с зазором числом.
 *          Подписи — название, источник, лицензия, расстояние и главные разницы. Кандидаты — именами
 *          («Inter Tight», «google:Golos Text:600»); без имён — первые --n из match.json. --out по умолчанию —
 *          sheet.png рядом с образцом. Открыть глазами (Read) обязательно.
 * decide   записать выбор: <папка прогона>/fonts/decision.json — образец и его числа, кандидаты из match.json,
 *          выбор с числами и местом, источник, лицензия и её адрес (у Google сверяется по репозиторию
 *          google/fonts: папка ofl, apache или ufl), --why словами, команда get. Без --why — отказ.
 * pick     кандидаты только с подмножеством cyrillic (данные ui-ux-pro-max, google-fonts.csv); шрифты-заглушки
 *          Symbols (Flow Circular и др.) не предлагаются. Таблица: семейство, категория, начертания, оси,
 *          подмножества, место по популярности, характер (с --like), пометки, ссылка specimen; под ней — команда
 *          get для первого. Порядок: сначала те, у кого есть подмножества под --need, потом больше совпавших слов
 *          характера и их вес, потом без пометок, потом популярнее. Пометки опускают шрифт ниже:
 *          «ИИ-набор» — Inter, Manrope, Onest, Montserrat… (cliche.mjs overused-font; брать, только если это язык
 *          донора — typography.md §5); «CJK» — японский, китайский или корейский шрифт, кириллица в нём довеском;
 *          «декоративный» (Rubik Glitch, Rubik Wet Paint…), «церковнославянский», «пиксельный» — если их не просили.
 *          По образцу точнее — measure и match; pick — когда образца нет, только слова.
 * pairs    пары «заголовки → текст» из typography.csv (74 пары, признака языка в данных нет): годятся только
 *          те, где кириллица есть у обоих шрифтов; отброшенные — по шрифту без кириллицы. Слова после pairs
 *          отбирают пары по названию, настроению и назначению (данные по-английски). Под таблицей — команды get
 *          для первой пары. Контраст пары — по ролям (typography.md §5): гротеск и антиква, геометрический и
 *          гуманистический, высота строчных близкая (x/cap из measure); два похожих гротеска — не пара, тогда одна
 *          гарнитура с разными весами. Порядок выбора по образцу — reference/fonts.md §4.
 * get      CSS2 API Google Fonts с User-Agent современного Chrome (иначе приходит не woff2) → файлы в
 *          <папка>/fonts/ и <папка>/fonts/fonts.css: @font-face с unicode-range и font-display: swap, раздел на
 *          семейство между метками fonts.mjs. Повторный get того же семейства заменяет свой раздел и удаляет свои
 *          прежние файлы, которых больше нет; чужие разделы и свой CSS вне меток не трогает. Переменный шрифт
 *          (Google отдаёт один файл на все веса) — один @font-face с диапазоном веса из самого файла (ось wght).
 *          Затем проверка по таблице знаков (cmap) скачанных файлов — по объединению подмножеств, как их получит
 *          страница: кириллица (66 букв с Ёё), знаки ₽№«»„“—–… и --need; с --text — каждый знак надписи.
 *          Не прошло по правилу — ничего не записывается. Итог: файлы с размерами, строки подключения (пути
 *          от корня сайта: --root или найденный выше --out каталог с index.html, package.json или .git; не
 *          нашёлся — путь от --out с пометкой) и команда проверки отрисовкой. Сеть — только fonts.googleapis.com
 *          и fonts.gstatic.com.
 *          «источник:Семейство» (или --source) — из источника реестра с files.kind «css» (Fontshare): по файлу
 *          woff2 на начертание, как отдал источник, — без подмножеств и смены формата (license.noModify; у ITF
 *          FFL это запрещено §02, поэтому --text и --subsets — отказ, код 2); нет кириллицы — отказ (код 2), пока
 *          не дан --latin. Курсив у Fontshare — вес +1 (401). В шапку раздела fonts.css и в вывод — условия
 *          лицензии из sources.json (license.terms): кому можно передавать файлы, что делать для сайта клиента.
 *          Файлы — только с files.fileHosts источника (cdn.fontshare.com).
 *
 * Флаги:
 *   --category <кат>   pick, match: serif, sans-serif (или sans), display, handwriting, monospace (или mono); несколько —
 *                      через запятую. match без него — все категории (рукописные и декоративные уйдут вниз сами).
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
 *                      match: знаки, без которых кандидат уходит в отсев с пометкой (по умолчанию ₽№«»).
 *   --weights <веса>   pick: нужные веса (все). get: веса через запятую (400,700) или диапазон переменного
 *                      шрифта (300..800); по умолчанию 400 и 700 — те, что есть (иначе ближайший к 400).
 *                      Веса сверяются с данными до сети и с ответом Google после: Google молча выбрасывает то,
 *                      чего у шрифта нет (900 у Manrope, 700 у Yeseva One), — это WARN «не отдал».
 *   --italic           pick: нужен курсив (с --weights — у каждого веса). get: курсив тех же весов.
 *   --variable         pick: только переменные шрифты (есть оси).
 *   --n <число>        pick: сколько строк, по умолчанию 10 (-n — то же). match: сколько кандидатов, по умолчанию 8;
 *                      sheet без имён — столько первых из match.json.
 *   --subsets <имена>  get: подмножества, по умолчанию cyrillic,latin,latin-ext: браузер качает файл, только когда
 *                      на странице есть его знаки, а без latin-ext знак ₽ рисуется системным шрифтом. Нет cyrillic
 *                      в ответе Google — отказ (код 2), нет другого — WARN.
 *   --text <надпись>   get: подмножество ровно под знаки надписи (логотип, крупное слово; параметр text= API) —
 *                      один файл на вес, килобайт-два. Надпись сменилась — скачать заново; несколько надписей
 *                      одним шрифтом — одной строкой («Зёрна Кофе с собой»). У него свой раздел «<Семейство> ·
 *                      надпись» с unicode-range знаков надписи: полному разделу не мешает.
 *   --out <путь>       get: папка сайта; файлы — в <папка>/fonts/. measure: файл протокола (.json). sheet: файл листа (.png).
 *   --root <папка>     get: корень сайта — строки подключения печатаются путями от него («/assets/fonts/…»).
 *   --selector <css>   measure: какой элемент страницы-образца мерить, по умолчанию h1 (первый видимый).
 *   --weight <вес>     measure: вес файла или семейства (по умолчанию 400; у адреса — вес элемента). decide: вес
 *                      выбора, по умолчанию — как у кандидата в match.json.
 *   --run <папка>      measure: протокол в <папка прогона>/fonts/sample.json. decide: обязателен — туда decision.json.
 *   --sources <имена>  match: источники из sources.json через запятую (google, fontshare), по умолчанию все включённые.
 *                      Список не Google не скачался — источник пропускается с WARN, подбор идёт по остальным.
 *   --source <имя>     decide: источник выбора, если семейства нет в match.json; по умолчанию google. get: то же,
 *                      что «источник:Семейство».
 *   --latin            match: только латиница — кириллица не требуется (логотип, цифры, английский текст). get из
 *                      источника без кириллицы (Fontshare): подтверждение, что русский текст этим шрифтом не
 *                      набирается; у Google латинская надпись — --text или --subsets latin,latin-ext.
 *   --why <текст>      decide: почему выбран этот шрифт — словами, для владельца и следующего агента.
 *   --refresh          match: заново скачать список семейств источника (у Google — раз в 30 дней и так).
 *   --selftest         (или команда selftest) без сети: числа measure на сохранённых шрифтах OFL (засечки, контраст,
 *                      ширина, круглота; страница с @font-face — те же числа, что у файла), match на своём сервере
 *                      (Google-метаданные и CSS2 text= — имитация; отсев без кириллицы и без ₽; образец сам себе
 *                      первый), sheet (PNG, зазор Й/Ё), decide (decision.json), путь preload у get; разбор CSV (кавычки, запятые и переводы строк в полях, BOM, CRLF), фильтры pick
 *                      и карта характера, pairs, адрес CSS2 (пробелы, веса, курсив, диапазон, text= с кириллицей),
 *                      разбор сохранённых ответов CSS2 (fixtures/fonts), fonts.css (переменный шрифт, слияние
 *                      разделов), таблица знаков WOFF2 (живой файл надписи и синтетические), get целиком на своём
 *                      сервере, опечатка во флаге, get без сети; список Fontshare (категории, веса, курсив +1,
 *                      лицензии), match --latin и get из Fontshare на своём сервере (отказ без --latin, запрет
 *                      --text, условия лицензии в fonts.css), выключенный Adobe Fonts. Код 1 — не прошло.
 *   --help, -h         эта справка.
 *
 * Проверка отрисовкой — cyrillic-check.mjs навыка design-reference (Chrome): get печатает точную команду по
 * скачанному файлу cyrillic и вариант для поднятого сайта (serve.mjs) — ровно то, что сайт грузит.
 * У подмножества надписи этой пробы нет: букв пробы в нём нет, хватает таблицы знаков.
 *
 * Кэш: FONTS_CACHE_DIR или ~/.claude/site-rework/cache/fonts (файлы кандидатов, числа, список Google — из
 * FONTS_META_URL, по умолчанию https://fonts.google.com/metadata/fonts; без сети и кэша — google-fonts.csv
 * ui-ux-pro-max). Реестр источников: FONTS_SOURCES или scripts/fonts/sources.json. Браузер — один на команду.
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
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, ensureDir, closestFlag, launch, openPage } from './lib.mjs';
import { loadEnv } from './media/net.mjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const HELP = fs.readFileSync(SELF, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
/* «-n 5», как у привычных утилит: parseArgs знает только «--», поэтому -n становится --n до разбора */
const ARGV = process.argv.slice(2).map((a) => (a === '-n' ? '--n' : a));
const VALUE_FLAGS = ['category', 'like', 'need', 'weights', 'n', 'subsets', 'text', 'out', 'root', 'selector', 'weight', 'run', 'sources', 'source', 'why'];
const { pos, opt } = parseArgs(ARGV, { flags: ['help', 'h', 'italic', 'variable', 'selftest', 'refresh', 'latin'], optional: VALUE_FLAGS, commands: ['measure', 'match', 'sheet', 'decide', 'pick', 'pairs', 'get', 'selftest'], strict: true });
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

/** Корень сайта для путей подключения: --root, иначе ближайшая папка от --out вверх (до 6 уровней) с index.html, package.json или .git. */
export function siteRoot(out, rootOpt = null) {
  if (rootOpt) return { root: path.resolve(rootOpt), how: null };
  let d = path.resolve(out);
  for (let i = 0; i <= 6; i++) {
    const mark = ['index.html', 'package.json', '.git'].find((n) => fs.existsSync(path.join(d, n)));
    if (mark) return { root: d, how: `найден по ${mark}` };
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  return null;
}

async function cmdGet() {
  const famArg = pos.join(' ').trim();
  if (!famArg) throw new Fail(`нужно семейство: ${SKILL_CMD} get "Manrope" --out <папка сайта> (-h — справка)`);
  if (opt.out === undefined) throw new Fail('--out <папка сайта> обязателен: файлы лягут в <папка>/fonts/');
  const spec0 = parseFamilySpec(famArg);
  if (opt.source !== undefined) spec0.source = String(opt.source).toLowerCase();
  if (spec0.source && spec0.source !== 'google') return cmdGetSource(spec0);
  if (opt.latin) throw new Fail('--latin у get — для источников без кириллицы (fontshare:…); у Google латинская надпись — --text "…" или --subsets latin,latin-ext');
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
  /* пути подключения — от корня сайта (--root или найденного выше --out), иначе от --out с пометкой */
  const root = siteRoot(out, opt.root !== undefined ? String(opt.root) : null);
  const inRoot = root && !path.relative(root.root, dir).startsWith('..') && !path.isAbsolute(path.relative(root.root, dir));
  if (root && !inRoot) warn(`--root ${root.root} не содержит папку шрифтов ${dir} — пути печатаю от --out`);
  const href = (p) => (inRoot ? `/${path.relative(root.root, p).replace(/\\/g, '/')}` : rel(p));
  console.log(inRoot ? `Подключить (пути от корня сайта ${root.root}${root.how ? `, ${root.how}` : ''}):` : `Подключить (пути от папки --out ${out}: корень сайта не найден — нет index.html, package.json или .git выше; страница не в этой папке — поправить путь или --root <корень сайта>):`);
  console.log(`  <link rel="preload" href="${href(path.join(dir, pre.name))}" as="font" type="font/woff2" crossorigin>`);
  console.log(`  <link rel="stylesheet" href="${href(cssFile)}">`);
  console.log(`  font-family: '${files[0].family}', ${fallbackStack(font)};`);
  if (text === null && files.some((f) => f.subset === 'cyrillic')) {
    const cyrFile = files.find((f) => f.subset === 'cyrillic' && f.style === 'normal') || files.find((f) => f.subset === 'cyrillic');
    const probe = spec.range ? [spec.range[0], spec.range[1]] : spec.list;
    console.log('Проверка отрисовкой (Chrome, навык design-reference):');
    console.log(`  ${CYR_CHECK} "${path.join(dir, cyrFile.name)}" --chars "№Ёё"`);
    console.log(`  на поднятом сайте (serve.mjs) — все подмножества, как их грузит страница: ${CYR_CHECK} --css http://localhost:<порт>${href(cssFile).startsWith('/') ? '' : '/'}${href(cssFile)} ${probe.map((x) => `"${files[0].family}:${x}"`).join(' ')}`);
  } else if (text !== null) console.log('Проверка отрисовкой cyrillic-check здесь не годится: в подмножестве надписи нет букв его пробы — хватает таблицы знаков выше; на странице — глазами.');
  console.log(`${warns.length ? 'WARN' : 'OK'}: ${family}${text !== null ? ' (надпись)' : ''} — ${files.length} ${files.length === 1 ? 'файл' : files.length < 5 ? 'файла' : 'файлов'}, ${kb(total)}; ${text !== null ? 'все знаки надписи на месте' : subsets.includes('cyrillic') ? 'кириллица на месте' : 'без кириллицы (--subsets)'}${warns.length ? `; предупреждений ${warns.length}` : ''}`);
  return 0;
}

/**
 * get из источника реестра с files.kind «css» (Fontshare): по файлу на начертание, как отдал источник, — без
 * подмножеств и смены формата (license.noModify: у ITF FFL это запрещено, §02). Нет кириллицы — только с --latin.
 */
async function cmdGetSource(spec) {
  const out = path.resolve(String(opt.out));
  const reg = loadSources();
  const src0 = reg.list.find((s) => s.id === spec.source);
  if (!src0) throw new Fail(`источника «${spec.source}» нет в ${reg.file}: есть ${reg.list.map((s) => s.id).join(', ')}`);
  if (src0.enabled === false) throw new Fail(`источник ${src0.name} выключен в sources.json: ${src0.why || 'без причины'}`, 2);
  const block = sourceBlock(src0);
  if (block) throw new Fail(`${src0.name}: ${block}`, 2);
  if (src0.files.kind !== 'css') throw new Fail(`get из ${src0.name}: files.kind «${src0.files.kind}» — get качает только из Google и источников «css»; файлы «direct» уже у вас — скопировать вместе с лицензией (reference/fonts.md)`);
  let found;
  try { found = await findFamily(spec, reg); } catch (e) { if (e instanceof NetFail) throw new Fail(netMessage(e)); throw e; }
  if (!found) throw new Fail(`«${spec.family}» нет в ${src0.name} (с разрешёнными лицензиями: ${(src0.list.licenses || ['все']).join(', ')})`);
  const { src, fam } = found;
  const noModify = src.license.noModify === true;
  if (noModify && (opt.text !== undefined || opt.subsets !== undefined)) throw new Fail(`${fam.license || src.license.default}: подмножества и переделка файлов запрещены (${src.license.url}) — --text и --subsets нельзя, файлы берутся как есть`, 2);
  if (fam.cyr !== true && !opt.latin) throw new Fail(`у «${fam.family}» нет кириллицы — русский текст наберётся запасным шрифтом. Только для латиницы (логотип, цифры, английский текст) — добавить --latin; для русского — ${SKILL_CMD} match / pick`, 2);
  const spec2 = opt.weights !== undefined ? parseWeights(opt.weights) : null;
  if (spec2 && spec2.range) throw new Fail(`--weights ${opt.weights}: у ${src.name} get берёт статичные начертания — веса через запятую (есть ${fam.weights.join(', ')})`);
  const italic = !!opt.italic;
  const want = spec2 ? spec2.list : (() => { const d = [400, 700].filter((w) => fam.weights.includes(w)); return d.length ? d : [nearestWeight(fam, 400)]; })();
  const miss = want.filter((w) => !fam.weights.includes(w));
  if (miss.length) throw new Fail(`у «${fam.family}» нет веса ${miss.join(', ')}: есть ${fam.weights.join(', ')}`);
  const missI = italic ? want.filter((w) => !(fam.italicWeights || []).includes(w)) : [];
  if (missI.length) throw new Fail(`у «${fam.family}» нет курсива ${missI.join(', ')}${(fam.italicWeights || []).length ? `: курсив есть у ${fam.italicWeights.join(', ')}` : ' вовсе'}`);
  const lic = fam.license || src.license.default;
  console.log(`get: ${fam.family} · ${src.name} · веса ${want.join(', ')}${italic ? ' + курсив' : ''} · файлы как есть${noModify ? ' (подмножества запрещены лицензией)' : ''}`);
  const warns = [];
  const warn = (m) => { warns.push(m); console.log(`WARN: ${m}`); };
  if (OVERUSED.test(fam.family)) warn(`«${fam.family}» — из «ИИ-набора» (cliche.mjs overused-font): брать, только если это язык донора (typography.md §5)`);

  /* начертания: у Fontshare курсив — вес +1 (401) */
  const styles = []; for (const w of want) { styles.push({ w, style: 'normal', code: w }); if (italic) styles.push({ w, style: 'italic', code: w + 1 }); }
  const hosts = Array.isArray(src.files.fileHosts) ? src.files.fileHosts : [];
  const files = [];
  for (const st of styles) {
    const cssUrl = String(src.files.url).replace(/\{family\}/g, encodeURIComponent(fam.family)).replace(/\{slug\}/g, encodeURIComponent(fam.slug || slugOf(fam.family))).replace(/\{weight\}/g, String(st.code));
    let r; try { r = await request(cssUrl); } catch (e) { if (e instanceof NetFail) throw new Fail(netMessage(e)); throw e; }
    if (r.status !== 200) throw new Fail(`CSS ${src.name}: HTTP ${r.status} — ${cssUrl}`);
    const b = parseCss2(r.body).find((x) => x.url && x.style === st.style);
    if (!b) throw new Fail(`${src.name} не отдал ${fam.family} ${st.w}${st.style === 'italic' ? ' курсив' : ''} (в CSS нет @font-face)`);
    const url = new URL(b.url, cssUrl).href;
    if (hosts.length && !hosts.includes(new URL(url).origin)) throw new Fail(`файл не с ${hosts.join(', ')}: ${url} — не качаю`);
    if (b.format && b.format !== 'woff2') throw new Fail(`${src.name} отдал первым не woff2 (${b.format}): ${url}`);
    let fr; try { fr = await request(url, { binary: true }); } catch (e) { if (e instanceof NetFail) throw new Fail(netMessage(e)); throw e; }
    if (fr.status !== 200) throw new Fail(`файл шрифта: HTTP ${fr.status} — ${url}`);
    if (!fr.body.length) throw new Fail(`файл шрифта пустой (0 байт): ${url}`);
    if (fr.body.toString('latin1', 0, 4) !== 'wOF2') throw new Fail(`файл шрифта не woff2: ${url}`);
    let codes = null; try { codes = fontCodes(fr.body); } catch (e) { warn(`таблица знаков не прочитана (${e.message}): ${url}`); }
    files.push({ ...st, url, buf: fr.body, codes, name: `${slugOf(fam.family)}-${st.w}${st.style === 'italic' ? '-italic' : ''}.woff2`, family: fam.family, weight: String(st.w), stretch: null, subset: null, range: null });
  }

  /* знаки: латиница и цифры обязательны; кириллица без --latin — все 66; знаки ₽№«» и --need — WARN */
  const lines = []; const fails = [];
  for (const f of files) {
    const label = `${f.w}${f.style === 'italic' ? ' курсив' : ''}`;
    if (!f.codes) { lines.push(`  ${label}: таблица знаков не прочитана — не проверено`); continue; }
    const lm = [...LATIN].filter((ch) => !f.codes.has(cp(ch)));
    if (lm.length) fails.push(`${label}: нет ${lm.join('')}`);
    const cyr = [...CYR_LETTERS].filter((ch) => f.codes.has(cp(ch))).length;
    const signs = charsOf(RU_SIGNS + (opt.need !== undefined ? String(opt.need) : ''));
    const sm = signs.filter((ch) => !f.codes.has(cp(ch)));
    lines.push(`  ${label}: латиница и цифры ${lm.length ? `— нет ${lm.join('')}` : 'есть'} · кириллица ${cyr} из 66 · ${sm.length ? `нет знаков ${sm.join('')}` : `знаки ${signs.join('')} — есть`}`);
    if (sm.length && !opt.latin) warn(`${fam.family} ${label}: нет знаков ${sm.join('')} — их нарисует запасной шрифт`);
    if (!opt.latin && cyr < 66) fails.push(`${label}: кириллица ${cyr} из 66`);
  }
  if (fails.length) { for (const l of lines) console.log(l); throw new Fail(`${fam.family}: ${fails.join('; ')}. Ничего не записано`, 2); }

  const dir = ensureDir(path.join(out, 'fonts'));
  const cssFile = path.join(dir, 'fonts.css');
  const today = new Date().toLocaleDateString('sv-SE');
  const page = src.files.page ? String(src.files.page).replace(/\{slug\}/g, fam.slug || slugOf(fam.family)) : src.url;
  const head = [
    `/* ${noEnd(fam.family)} — ${noEnd(lic)}${src.license.url ? ` (${src.license.url})` : ''}, ${page}`,
    `   fonts.mjs get ${today}: ${src.name}, веса ${want.join(', ')}${italic ? ' + курсив' : ''}; файлы как есть${noModify ? ' — подмножества и переделка запрещены лицензией' : ''}${opt.latin ? '; только латиница (--latin): русский текст этим шрифтом не набирать' : ''}`,
    ...(src.license.terms || []).map((t) => `   ${noEnd(t)}`),
  ].join('\n') + ' */';
  const prev = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, 'utf8') : '';
  const merged = mergeSection(prev, fam.family, `${head}\n${files.map(faceCss).join('\n')}`);
  for (const f of files) fs.writeFileSync(path.join(dir, f.name), f.buf);
  const removed = [];
  for (const n of sectionFiles(merged.old)) if (!files.some((f) => f.name === n) && fs.existsSync(path.join(dir, n))) { fs.rmSync(path.join(dir, n)); removed.push(n); }
  fs.writeFileSync(cssFile, merged.css);

  const total = files.reduce((a, f) => a + f.buf.length, 0);
  const rel = (p) => path.relative(out, p).replace(/\\/g, '/');
  console.log(`\n${fam.family} · ${lic}`);
  for (const f of files) console.log(`  ${rel(path.join(dir, f.name))}  ${kb(f.buf.length).padStart(9)}  вес ${f.w}${f.style === 'italic' ? ', курсив' : ''}${f.codes ? `, знаков ${f.codes.size}` : ''}`);
  console.log(`  ${rel(cssFile)}  раздел «${fam.family}» ${merged.replaced ? 'заменён' : 'добавлен'}, разделов в файле: ${sectionCount(merged.css)}${removed.length ? `; удалены прежние файлы раздела: ${removed.join(', ')}` : ''}`);
  console.log(`Всего: ${files.length} ${files.length === 1 ? 'файл' : files.length < 5 ? 'файла' : 'файлов'}, ${kb(total)}`);
  console.log('Знаки (таблица cmap файлов):');
  for (const l of lines) console.log(l);
  const root = siteRoot(out, opt.root !== undefined ? String(opt.root) : null);
  const inRoot = root && !path.relative(root.root, dir).startsWith('..') && !path.isAbsolute(path.relative(root.root, dir));
  const href = (p) => (inRoot ? `/${path.relative(root.root, p).replace(/\\/g, '/')}` : rel(p));
  const pre = files.find((f) => f.style === 'normal') || files[0];
  console.log(inRoot ? `Подключить (пути от корня сайта ${root.root}${root.how ? `, ${root.how}` : ''}):` : `Подключить (пути от папки --out ${out}: корень сайта не найден — поправить путь или --root <корень сайта>):`);
  console.log(`  <link rel="preload" href="${href(path.join(dir, pre.name))}" as="font" type="font/woff2" crossorigin>`);
  console.log(`  <link rel="stylesheet" href="${href(cssFile)}">`);
  console.log(`  font-family: '${fam.family}', ${fallbackStack({ cat: fam.category, stroke: fam.stroke, cls: fam.cls || [] })};`);
  for (const t of src.license.terms || []) console.log(`Условие лицензии: ${t}`);
  console.log(`${warns.length ? 'WARN' : 'OK'}: ${fam.family} — ${files.length} ${files.length === 1 ? 'файл' : files.length < 5 ? 'файла' : 'файлов'}, ${kb(total)}; ${opt.latin ? 'только латиница' : 'кириллица на месте'}${warns.length ? `; предупреждений ${warns.length}` : ''}`);
  return 0;
}

/* ---------- подбор по образцу: реестр источников, кэш, числа отрисовки ---------- */

const CACHE_DIR = process.env.FONTS_CACHE_DIR ? path.resolve(process.env.FONTS_CACHE_DIR) : path.join(os.homedir(), '.claude', 'site-rework', 'cache', 'fonts');
const SOURCES_FILE = process.env.FONTS_SOURCES ? path.resolve(process.env.FONTS_SOURCES) : path.join(HERE, 'fonts', 'sources.json');
const GOOGLE_META_URL = process.env.FONTS_META_URL || 'https://fonts.google.com/metadata/fonts';
/* версия способа замера: сменили формулы — числа в кэше пересчитываются */
const METRIC_V = 4;
const NBSP = ' ';
export const SHEET = {
  caps: `САЙТЫ, СЕРВИСЫ · ЁЖ 20${NBSP}000${NBSP}₽`,
  lower: `сайты, сервисы · ёж 20${NBSP}000${NBSP}₽`,
  para: `Делаем сайты и сервисы для бизнеса: от первого экрана до формы заявки. Съешь же ещё этих мягких французских булок да выпей чаю — 1${NBSP}024 заказа, 98${NBSP}% в срок, «под ключ» за 20${NBSP}000${NBSP}₽, договор №${NBSP}17.`,
  jo: ['ЗДЕСЬ ЦЕНЫ', 'ЙОГА И ЁЛКИ'],
};
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** знаки, которые качаются у кандидата (text= у Google): замер, проверка кириллицы и знаков, лист */
export const GLYPHS = uniq([...(LATIN + CYR_LETTERS + RU_SIGNS + ' ·,.:;!?-()%/' + NBSP + SHEET.caps + SHEET.lower + SHEET.para + SHEET.jo.join(''))]).join('');
const NEED_DEFAULT = '₽№«»';
const SOURCE_LABEL = (s) => (s && s.name) || '?';

/** Реестр источников (scripts/fonts/sources.json): [{ id, name, url, enabled, list, files, license, web, selfHost, cyrillic }] */
export function loadSources(file = SOURCES_FILE) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Fail(`реестр источников не прочитан: ${file} (${e.code || e.message})`); }
  const list = Array.isArray(j.sources) ? j.sources : [];
  const bad = list.filter((s) => !s || !s.id || !s.name || !s.list || !s.files || !s.license);
  if (bad.length) throw new Fail(`${file}: у источника нет id, name, list, files или license — формат в reference/fonts.md`);
  return { file, list, base: path.dirname(file) };
}
/** Разрешает ли источник сайт: веб и свои файлы. Иначе — причина. */
const sourceBlock = (s) => (s.web !== true ? 'лицензия источника не разрешает веб (web не true)' : s.selfHost !== true ? 'лицензия не разрешает свои файлы на сайте (selfHost не true)' : null);

/* ---------- файлы шрифтов: таблица знаков у woff2, woff, ttf, otf ---------- */

/** Буфер файла шрифта → Set кодов со знаком. WOFF2, WOFF (zlib), TTF и OTF; иначе — исключение. */
export function fontCodes(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) throw new Error('не шрифт: файл короче заголовка');
  const sig = buf.toString('latin1', 0, 4);
  if (sig === 'wOF2') return woff2Info(buf).codes;
  if (sig === 'wOFF') {
    const n = buf.readUInt16BE(12);
    for (let i = 0; i < n; i++) {
      const o = 44 + i * 20; if (o + 20 > buf.length) break;
      if (buf.toString('latin1', o, o + 4) !== 'cmap') continue;
      const off = buf.readUInt32BE(o + 4), comp = buf.readUInt32BE(o + 8), orig = buf.readUInt32BE(o + 12);
      const raw = buf.subarray(off, off + comp);
      return cmapCodes(comp < orig ? zlib.inflateSync(raw) : raw);
    }
    throw new Error('в WOFF нет таблицы cmap');
  }
  if (sig === '\0\x01\0\0' || sig === 'OTTO' || sig === 'true') {
    const n = buf.readUInt16BE(4);
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16; if (o + 16 > buf.length) break;
      if (buf.toString('latin1', o, o + 4) === 'cmap') return cmapCodes(buf.subarray(buf.readUInt32BE(o + 8), buf.readUInt32BE(o + 8) + buf.readUInt32BE(o + 12)));
    }
    throw new Error('в шрифте нет таблицы cmap');
  }
  throw new Error(`не шрифт (начало «${sig.replace(/[^\x20-\x7e]/g, '?')}»)`);
}
const fontMime = (buf) => ({ wOF2: 'font/woff2', wOFF: 'font/woff', OTTO: 'font/otf' }[buf.toString('latin1', 0, 4)] || 'font/ttf');
const FONT_EXT = /\.(woff2?|ttf|otf)$/i;
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
/** Что из нужного есть в файле: { cyrMissing: 'Ёё…', signsMissing: '₽…' } */
function glyphCheck(codes, need = NEED_DEFAULT) {
  return { cyrMissing: [...CYR_LETTERS].filter((c) => !codes.has(cp(c))).join(''), signsMissing: charsOf(need).filter((c) => !codes.has(cp(c))).join('') };
}

/* ---------- список семейств источника ---------- */

/** Метаданные Google (fonts.google.com/metadata/fonts) → [{ family, category, stroke, cls, subsets, weights, italic, wght, popularity, open }] */
export function googleIndexFrom(meta) {
  const t = String(meta).replace(/^\)\]\}'?\s*/, '');
  const j = JSON.parse(t);
  const list = j.familyMetadataList || j.families || [];
  const cat = (c) => Object.keys(CATEGORIES).find((k) => CATEGORIES[k] === c) || String(c || '').toLowerCase();
  return list.map((f) => {
    const keys = Object.keys(f.fonts || {});
    const weights = keys.filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    const ax = (f.axes || []).find((a) => a.tag === 'wght');
    return { family: f.family, category: cat(f.category), stroke: String(f.stroke || '').toLowerCase(), cls: (f.classifications || []).map((x) => String(x).toLowerCase()), subsets: (f.subsets || []).filter((x) => x !== 'menu'), weights, italic: keys.some((k) => /i$/.test(k)), wght: ax ? [ax.min, ax.max] : null, popularity: f.popularity || 9999, open: f.isOpenSource !== false, added: f.dateAdded || '' };
  }).filter((f) => f.family);
}
/** Список Google: кэш до 30 дней → сеть → кэш любой давности → google-fonts.csv ui-ux-pro-max. { list, from } */
async function googleIndex({ refresh = false } = {}) {
  const file = path.join(CACHE_DIR, 'google', 'index.json');
  let cached = null; try { cached = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* нет кэша */ }
  const fresh = cached && cached.url === GOOGLE_META_URL && Date.now() - Date.parse(cached.fetched) < 30 * 86400e3;
  if (fresh && !refresh) return { list: cached.families, from: `кэш ${cached.fetched.slice(0, 10)}` };
  try {
    const r = await request(GOOGLE_META_URL);
    if (r.status !== 200) throw new NetFail(`HTTP ${r.status}`, new URL(GOOGLE_META_URL).host);
    const families = googleIndexFrom(r.body);
    if (families.length < 1) throw new NetFail('пустой список', new URL(GOOGLE_META_URL).host);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify({ url: GOOGLE_META_URL, fetched: new Date().toISOString(), families }));
    return { list: families, from: `метаданные ${new URL(GOOGLE_META_URL).host}` };
  } catch (e) {
    if (!(e instanceof NetFail) && !(e instanceof SyntaxError)) throw e;
    if (cached) return { list: cached.families, from: `кэш ${cached.fetched.slice(0, 10)} (сеть: ${e.netCode || e.message})`, warn: `список Google не обновлён (${e.netCode || e.message}) — взят кэш от ${cached.fetched.slice(0, 10)}` };
    const d = loadFonts();
    if (d) return { list: d.list.map((f) => ({ family: f.family, category: f.cat, stroke: f.stroke, cls: f.cls, subsets: f.subsets, weights: f.normal, italic: f.italic.length > 0, wght: f.axes.wght || null, popularity: f.popularity, open: true, added: f.added })), from: 'google-fonts.csv ui-ux-pro-max', warn: `метаданные Google недоступны (${e.netCode || e.message}) — взят снимок ui-ux-pro-max` };
    throw new Fail(e instanceof NetFail ? netMessage(e) : `метаданные Google не разобраны: ${e.message}`);
  }
}
/* категории Fontshare («Sans, Display», «Serif, Slab») → наши; первая — главная */
const FS_CAT = { sans: 'sans-serif', serif: 'serif', slab: 'serif', display: 'display', script: 'handwriting', handwritten: 'handwriting', mono: 'monospace', monospace: 'monospace' };
/**
 * Ответ api.fontshare.com/v2/fonts → [{ family, slug, category, weights, italic, wght, license, cyr, popularity }].
 * Курсив у Fontshare — вес +1 (401), переменный файл — 1 и 2: в списке весов только статичные прямые.
 * Кириллица — по полю languages (Russian); 06.10.2026 её нет ни у одного шрифта ITF (сверено таблицей знаков).
 */
export function fontshareIndexFrom(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const fonts = (j && j.fonts) || [];
  const byViews = fonts.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).map((f) => f.slug);
  return fonts.map((f) => {
    const cats = String(f.category || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const st = (f.styles || []).filter((s) => s.weight && Number.isFinite(s.weight.number) && !s.is_variable);
    const ax = (f.axes || []).find((a) => (a.property || a.name) === 'wght');
    return {
      family: f.name, slug: f.slug, category: FS_CAT[cats[0]] || cats[0] || '', stroke: cats.includes('slab') ? 'slab serif' : '',
      cls: cats.includes('display') ? ['display'] : [], subsets: [],
      weights: uniq(st.filter((s) => !s.is_italic).map((s) => s.weight.number)).sort((a, b) => a - b),
      italicWeights: uniq(st.filter((s) => s.is_italic).map((s) => s.weight.number - 1)).sort((a, b) => a - b),
      /* ось переменного файла — справкой: подбор и get берут статичные начертания, вес — только из weights */
      italic: st.some((s) => s.is_italic), wght: null, axis: ax ? [ax.range_left, ax.range_right] : null,
      license: f.license_type || null, cyr: /\b(Russian|Ukrainian|Belarusian|Bulgarian)\b/.test(String(f.languages || '')),
      popularity: byViews.indexOf(f.slug) + 1, open: true, added: String(f.inserted_at || '').slice(0, 10),
    };
  }).filter((f) => f.family && f.slug);
}
/** Список Fontshare: кэш до 30 дней → сеть → кэш любой давности. Только лицензии из src.list.licenses. { list, from, warn? } */
async function fontshareIndex(src, { refresh = false } = {}) {
  const url = src.list.url;
  const file = path.join(CACHE_DIR, slugOf(src.id), 'index.json');
  let cached = null; try { cached = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* нет кэша */ }
  const fresh = cached && cached.url === url && Date.now() - Date.parse(cached.fetched) < 30 * 86400e3;
  let all, from, warn;
  const day = (iso) => new Date(iso).toLocaleDateString('sv-SE');
  if (fresh && !refresh) { all = cached.families; from = `кэш ${day(cached.fetched)}`; }
  else {
    try {
      const r = await request(url);
      if (r.status !== 200) throw new NetFail(`HTTP ${r.status}`, new URL(url).host);
      all = fontshareIndexFrom(r.body);
      if (!all.length) throw new NetFail('пустой список', new URL(url).host);
      ensureDir(path.dirname(file));
      fs.writeFileSync(file, JSON.stringify({ url, fetched: new Date().toISOString(), families: all }));
      from = `список ${new URL(url).host}`;
    } catch (e) {
      if (!(e instanceof NetFail) && !(e instanceof SyntaxError)) throw e;
      if (!cached) throw new Fail(e instanceof NetFail ? netMessage(e) : `список ${src.name} не разобран: ${e.message}`);
      all = cached.families; from = `кэш ${day(cached.fetched)} (сеть: ${e.netCode || e.message})`;
      warn = `список ${src.name} не обновлён (${e.netCode || e.message}) — взят кэш от ${day(cached.fetched)}`;
    }
  }
  const allow = Array.isArray(src.list.licenses) ? src.list.licenses : null;
  const names = src.license.perType || {};
  const list = all.filter((f) => !allow || allow.includes(f.license)).map((f) => ({ ...f, license: names[f.license] || f.license }));
  return { list, from: `${from}; взято ${list.length} из ${all.length}${allow ? ` (лицензии ${allow.join(', ')})` : ''}`, warn };
}

/** Семейства источника: { list: [{ family, category, weights, wght, subsets?, cyr: true|false|null, open, entry }], from, warn } */
async function sourceFamilies(src, { refresh = false } = {}) {
  if (src.list.kind === 'google-metadata') {
    const g = await googleIndex({ refresh });
    return { ...g, list: g.list.map((f) => ({ ...f, cyr: f.subsets.includes('cyrillic'), entry: f })) };
  }
  if (src.list.kind === 'fontshare-api') {
    const g = await fontshareIndex(src, { refresh });
    return { ...g, list: g.list.map((f) => ({ ...f, entry: f })) };
  }
  if (src.list.kind === 'inline') {
    const fams = Array.isArray(src.families) ? src.families : [];
    return { from: `${fams.length} в sources.json`, list: fams.map((f) => { const ws = Object.keys(f.files || {}).map(Number).filter(Number.isFinite); return { family: f.family, category: f.category || '', stroke: '', cls: [], subsets: f.subsets || [], weights: (f.weights || ws).slice().sort((a, b) => a - b), wght: f.wght || null, popularity: 9999, open: f.open !== false, cyr: f.cyrillic === undefined ? null : !!f.cyrillic, entry: f }; }) };
  }
  throw new Fail(`источник ${src.id}: list.kind «${src.list.kind}» не знаю — есть google-metadata, fontshare-api и inline (reference/fonts.md)`);
}
/** Вес кандидата ближе всего к весу образца: у переменного — сам вес, если внутри оси. */
export function nearestWeight(f, w) {
  if (f.wght && w >= f.wght[0] && w <= f.wght[1]) return w;
  const all = f.weights && f.weights.length ? f.weights : f.wght ? [f.wght[0], f.wght[1]] : [400];
  return all.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) || (Math.abs(b - w) === Math.abs(a - w) && b > a) ? b : a));
}

/* ---------- файл кандидата: скачать в кэш ---------- */

/** Файл семейства в весе w: из кэша или источника. → { buf, file, url, weight } */
async function acquireFace(src, fam, w, { base = path.dirname(SOURCES_FILE) } = {}) {
  const dir = ensureDir(path.join(CACHE_DIR, slugOf(src.id)));
  const key = `${slugOf(fam.family)}-${w}`;
  const kind = src.files.kind;
  /* у Google имя файла — по набору знаков: сменили GLYPHS — качается заново */
  const tag = kind === 'google-css2' ? `-${sha(Buffer.from(GLYPHS)).slice(0, 6)}` : '';
  const hit = fs.readdirSync(dir).find((n) => n.startsWith(`${key}${tag}.`) && FONT_EXT.test(n));
  if (hit) return { buf: fs.readFileSync(path.join(dir, hit)), file: path.join(dir, hit), url: null, weight: w, cached: true };
  let url, buf;
  if (kind === 'google-css2') {
    const cssUrl = buildCss2Url({ family: fam.family, spec: { list: [w] }, text: GLYPHS });
    const r = await request(cssUrl);
    if (r.status !== 200) throw new Error(`CSS2 HTTP ${r.status}`);
    const b = parseCss2(r.body).find((x) => x.url);
    if (!b) throw new Error('в ответе CSS2 нет файла');
    url = b.url;
    if (!FILE_ORIGINS.has(new URL(url).origin)) throw new Error(`файл не с fonts.gstatic.com: ${url}`);
  } else if (kind === 'direct') {
    const f = fam.entry && fam.entry.files && (fam.entry.files[String(w)] || fam.entry.files[w]);
    if (!f) throw new Error(`в sources.json нет файла веса ${w}`);
    if (!/^https?:/i.test(f)) {
      const p = path.resolve(base, f);
      if (!fs.existsSync(p)) throw new Error(`нет файла ${p}`);
      buf = fs.readFileSync(p); url = p;
    } else url = f;
  } else if (kind === 'css') {
    const cssUrl = String(src.files.url).replace(/\{family\}/g, encodeURIComponent(fam.family)).replace(/\{slug\}/g, encodeURIComponent((fam.entry && fam.entry.slug) || slugOf(fam.family))).replace(/\{weight\}/g, String(w));
    const r = await request(cssUrl);
    if (r.status !== 200) throw new Error(`CSS HTTP ${r.status}`);
    const blocks = parseCss2(r.body).filter((x) => x.url && x.style === 'normal');
    const b = blocks.find((x) => { const [a, z = a] = x.weight.split(/\s+/).map(Number); return w >= a && w <= z; }) || blocks[0];
    if (!b) throw new Error('в CSS источника нет @font-face');
    url = new URL(b.url, cssUrl).href;
  } else throw new Error(`files.kind «${kind}» не знаю — есть google-css2, direct, css`);
  if (!buf) {
    const hosts = src.files.fileHosts;
    if (Array.isArray(hosts) && hosts.length && kind !== 'google-css2' && !hosts.includes(new URL(url).origin)) throw new Error(`файл не с ${hosts.join(', ')}: ${url}`);
    const r = await request(url, { binary: true });
    if (r.status !== 200) throw new Error(`файл HTTP ${r.status}`);
    buf = r.body;
  }
  if (!buf.length) throw new Error('файл пустой');
  const ext = { 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/otf': 'otf' }[fontMime(buf)] || 'ttf';
  const file = path.join(dir, `${key}${tag}.${ext}`);
  fs.writeFileSync(file, buf);
  return { buf, file, url, weight: w, cached: false };
}

/* ---------- замер в браузере ---------- */

/**
 * Числа шрифта по отрисовке на холсте (выполняется в странице, без замыканий). family — имя CSS (уже
 * подключённое на странице), weight, style. → { ok, metrics, cyr: { letters, own }, error }
 */
async function measureInPage(family, weight, style) {
  const S = 200;
  const fam = `"${String(family).replace(/"/g, '\\"')}"`;
  const font = (px, fb) => `${style} ${weight} ${px}px ${fam}${fb ? `, ${fb}` : ''}`;
  const PROBE = 'HOxnoIlaAbcdefghijklmnopqrstuvwxyzBCDEFGKLMNPQRSTUVWXYZ0123456789ЙЁДЦЩЖ';
  try { await document.fonts.load(font(S), PROBE); } catch { /* увидим по check */ }
  if (!document.fonts.check(font(S), 'H')) return { ok: false, error: 'шрифт не загрузился' };
  const cv = document.createElement('canvas'); cv.width = S * 3; cv.height = S * 2;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const W = cv.width, H = cv.height, base = Math.round(S * 1.35), x0 = Math.round(S * 0.6);
  /* знак в шрифте, а не запасной: ширина с запасным monospace и serif не равна чистому запасному */
  const own = (ch) => ['monospace', 'serif'].some((fb) => { ctx.font = font(40, fb); const a = ctx.measureText(ch).width; ctx.font = `${style} ${weight} 40px ${fb}`; return Math.abs(a - ctx.measureText(ch).width) > 0.01; });
  const glyph = (ch) => {
    ctx.clearRect(0, 0, W, H); ctx.font = font(S, 'monospace'); ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(ch, x0, base);
    const d = ctx.getImageData(0, 0, W, H).data; const on = new Uint8Array(W * H);
    let t = H, b = -1, l = W, r = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] >= 128) { on[y * W + x] = 1; if (y < t) t = y; if (y > b) b = y; if (x < l) l = x; if (x > r) r = x; }
    return { on, t, b, l, r, w: r - l + 1, h: b - t + 1, empty: b < 0 };
  };
  const rowRuns = (g, y) => { const o = []; let s = -1; for (let x = g.l - 1; x <= g.r + 1; x++) { const v = x >= 0 && x < W && y >= 0 && y < H && g.on[y * W + x]; if (v && s < 0) s = x; if (!v && s >= 0) { o.push([s, x - 1]); s = -1; } } return o; };
  const colRuns = (g, x) => { const o = []; let s = -1; for (let y = g.t - 1; y <= g.b + 1; y++) { const v = y >= 0 && y < H && x >= 0 && x < W && g.on[y * W + x]; if (v && s < 0) s = y; if (!v && s >= 0) { o.push([s, y - 1]); s = -1; } } return o; };
  const len = (r) => (r ? r[1] - r[0] + 1 : 0);
  /* ширина ножки на высоте frac и самая широкая полоса в зоне края (zone: 'bottom' | 'top') — засечки */
  const foot = (g, frac, which, zone) => {
    const ym = Math.round(g.t + g.h * frac);
    const rr = rowRuns(g, ym); if (!rr.length) return null;
    const stem = which === 'last' ? rr[rr.length - 1] : rr[0];
    const c = (stem[0] + stem[1]) / 2, sw = len(stem);
    const k = Math.max(2, Math.round(g.h * 0.07));
    let mx = 0;
    for (let i = 0; i <= k; i++) {
      const y = zone === 'bottom' ? g.b - i : g.t + i;
      const run = rowRuns(g, y).find(([a, z]) => c >= a - 1 && c <= z + 1);
      if (run) mx = Math.max(mx, len(run));
    }
    return sw > 0 ? mx / sw : null;
  };
  const gH = glyph('H'), gO = glyph('O'), gx = glyph('x'), gI = glyph('I'), gn = glyph('n');
  if (gH.empty || gO.empty || gx.empty) return { ok: false, error: 'знаки H, O, x не нарисовались' };
  const capPx = base - gH.t, xPx = base - gx.t;
  const stemRow = rowRuns(gH, Math.round(gH.t + gH.h * 0.25));
  const stemV = len(stemRow[0]);
  const colH = colRuns(gH, Math.round((gH.l + gH.r) / 2)).filter(([a, z]) => (a + z) / 2 > gH.t + gH.h * 0.25 && (a + z) / 2 < gH.t + gH.h * 0.85);
  const bar = colH.length ? Math.max(...colH.map(len)) : 0;
  const oRow = rowRuns(gO, Math.round((gO.t + gO.b) / 2)), oCol = colRuns(gO, Math.round((gO.l + gO.r) / 2));
  const oSide = oRow.length ? (len(oRow[0]) + len(oRow[oRow.length - 1])) / 2 : 0, oTop = oCol.length ? (len(oCol[0]) + len(oCol[oCol.length - 1])) / 2 : 0;
  const ratios = [stemV ? bar / stemV : null, oSide ? oTop / oSide : null].filter((v) => v !== null && Number.isFinite(v));
  const feet = [foot(gH, 0.8, 'first', 'bottom'), foot(gH, 0.2, 'first', 'top'), gI.empty ? null : foot(gI, 0.5, 'first', 'bottom'), gn.empty ? null : foot(gn, 0.6, 'first', 'bottom')].filter((v) => v !== null);
  feet.sort((a, b) => a - b);
  const med = feet.length ? (feet.length % 2 ? feet[(feet.length - 1) / 2] : (feet[feet.length / 2 - 1] + feet[feet.length / 2]) / 2) : 1;
  /* концы штрихов: ширина у самого края ножки I и l к ножке — прямой срез ~1, скруглённый ~0.6, засечки >1 */
  const edge = (g, zone) => {
    if (g.empty) return null;
    const rr = rowRuns(g, Math.round(g.t + g.h * 0.5)); if (!rr.length) return null;
    const stem = rr[0]; const c = (stem[0] + stem[1]) / 2, sw = len(stem);
    const k = Math.max(1, Math.round(g.h * 0.025));
    const run = rowRuns(g, zone === 'bottom' ? g.b - k : g.t + k).find(([a, z]) => c >= a - 1 && c <= z + 1);
    return run && sw ? Math.min(1.3, len(run) / sw) : null;
  };
  const gl = glyph('l');
  const ends = [edge(gI, 'bottom'), edge(gI, 'top'), edge(gl, 'bottom')].filter((v) => v !== null);
  /* раскрытие «c»: от правого края внутрь — первая колонка, где видны оба конца; просвет между ними к высоте x */
  const gc = glyph('c');
  let aperture = null;
  if (!gc.empty) {
    for (let x = gc.r; x > gc.l + gc.w * 0.5; x--) {
      const rr = colRuns(gc, x);
      if (rr.length >= 2) { aperture = (rr[rr.length - 1][0] - rr[0][1] - 1) / xPx; break; }
    }
    if (aperture === null) aperture = 1;
  }
  ctx.font = font(S, 'monospace');
  /* ширина знака — по краскам (форма), набор — по ширине шага (форма + поля, трекингом подгоняется) */
  const ink = (s) => [...s].reduce((a, ch) => { const t = ctx.measureText(ch); return a + (t.actualBoundingBoxLeft + t.actualBoundingBoxRight); }, 0) / [...s].length / S;
  const adv = (s) => [...s].reduce((a, ch) => a + ctx.measureText(ch).width, 0) / [...s].length / S;
  const fm = ctx.measureText('Hx');
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const LC = 'abcdefghijklmnopqrstuvwxyz', UC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const metrics = {
    xCap: r3(xPx / capPx), capEm: r3(capPx / S), widthLc: r3(ink(LC) / (capPx / S)), widthUc: r3(ink(UC) / (capPx / S)),
    advLc: r3(adv(LC)), advUc: r3(adv(UC)),
    contrast: r3(Math.min(1.5, ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1)), round: r3(gO.w / gO.h), stem: r3(stemV / capPx),
    serif: r3(med), serifs: med >= 1.35, ends: r3(ends.length ? ends.reduce((a, b) => a + b, 0) / ends.length : 1), aperture: aperture === null ? null : r3(aperture),
    ascEm: r3(fm.fontBoundingBoxAscent / S), descEm: r3(fm.fontBoundingBoxDescent / S),
  };
  const letters = [...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя'].filter(own).length;
  const cyr = { letters, of: 66 };
  if (own('Й') && own('Ё') && own('Д')) {
    const gJ = glyph('Й'), gE = glyph('Ё');
    const desc = ['Д', 'Ц', 'Щ'].filter(own).map((ch) => { const g = glyph(ch); return g.empty ? 0 : g.b + 1 - base; });
    metrics.joAsc = r3(Math.max(base - gJ.t, base - gE.t) / S);
    metrics.cyrDesc = r3(Math.max(0, ...desc) / S);
  }
  return { ok: true, metrics, cyr };
}

/** Свой сервер для страницы замера и листа: «/» — пустая страница, /f/<ключ> — файл шрифта из карты. */
async function fontServer() {
  const files = new Map();
  const srv = http.createServer((req, res) => {
    const m = /^\/f\/([\w-]+)$/.exec(req.url || '');
    res.setHeader('access-control-allow-origin', '*');
    if (m && files.has(m[1])) { const b = files.get(m[1]); res.writeHead(200, { 'content-type': fontMime(b) }); res.end(b); return; }
    if (m) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><meta charset="utf-8"><title>fonts.mjs</title><body style="margin:0;background:#fff"></body>');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  return { origin, add: (buf) => { const k = sha(buf); files.set(k, buf); return `${origin}/f/${k}`; }, close: () => new Promise((r) => { srv.close(r); if (srv.closeAllConnections) srv.closeAllConnections(); /* иначе ждёт простоя keep-alive Chrome ~60 с */ }) };
}
/** Подключить файл в странице под именем name (вес — диапазон: и статичный, и переменный рисуются без синтетики). */
const loadFaceInPage = (page, name, url) => page.evaluate(async (name, url) => {
  try { const f = new FontFace(name, `url(${url})`, { weight: '1 1000' }); await f.load(); document.fonts.add(f); return true; } catch (e) { return String(e && e.message || e); }
}, name, url);

/** Числа из кэша по содержимому файла и весу. */
function metricsCache() {
  const file = path.join(CACHE_DIR, 'metrics.json');
  let data = {}; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* пусто */ }
  let dirty = false;
  return {
    get: (buf, w) => data[`${sha(buf)}|${w}|v${METRIC_V}`] || null,
    set: (buf, w, v) => { data[`${sha(buf)}|${w}|v${METRIC_V}`] = v; dirty = true; },
    save: () => { if (dirty) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data)); dirty = false; } },
  };
}

/* ---------- расстояние ---------- */

/** Числа сравнения: s — обычный разброс (единица расстояния), w — вес. */
export const METRICS = [
  { key: 'xCap', name: 'x/cap', s: 0.04, w: 1 },
  { key: 'widthLc', name: 'шир. строчных', s: 0.05, w: 1 },
  { key: 'widthUc', name: 'шир. прописных', s: 0.05, w: 0.7 },
  { key: 'contrast', name: 'контраст', s: 0.1, w: 1 },
  { key: 'round', name: 'круглота O', s: 0.05, w: 0.8 },
  { key: 'stem', name: 'штрих', s: 0.02, w: 0.8 },
  { key: 'serif', name: 'засечки', s: 0.15, w: 1.2 },
  { key: 'ends', name: 'концы', s: 0.1, w: 1 },
  { key: 'aperture', name: 'раскрытие c', s: 0.1, w: 0.8 },
  { key: 'capEm', name: 'cap/кегль', s: 0.04, w: 0.4 },
];
/** Веса чисел под роль образца: капс — важнее ширина прописных, x-высота почти не видна. */
export function metricWeights(sample) {
  const w = Object.fromEntries(METRICS.map((m) => [m.key, m.w]));
  if (sample && /uppercase/i.test(sample.textTransform || '')) Object.assign(w, { widthUc: 1.3, widthLc: 0.4, xCap: 0.3 });
  return w;
}
/** Расстояние кандидата до образца: корень средневзвешенного квадрата разниц в долях разброса; засечки разные — +1. */
export function fontDistance(a, b, weights = metricWeights()) {
  let sum = 0, ws = 0; const parts = {};
  for (const m of METRICS) {
    if (!Number.isFinite(a[m.key]) || !Number.isFinite(b[m.key])) continue;
    const d = b[m.key] - a[m.key]; parts[m.key] = Math.round(d * 1000) / 1000;
    sum += weights[m.key] * (d / m.s) ** 2; ws += weights[m.key];
  }
  let d = ws ? Math.sqrt(sum / ws) : Infinity;
  if (a.serifs !== b.serifs) d += 1;
  return { d: Math.round(d * 100) / 100, parts };
}
/** Зазор от верха Й/Ё второй строки до строки выше при интерлиньяже lh (доли кегля): до линии шрифта и до хвостов Д/Ц/Щ. */
export function joGap(m, lh) {
  if (!m || !Number.isFinite(m.joAsc)) return null;
  return { base: Math.round((lh - m.joAsc) * 1000) / 1000, tails: Math.round((lh - m.joAsc - (m.cyrDesc || 0)) * 1000) / 1000 };
}
/**
 * Трекинг кандидата (em), при котором воздух между буквами как у образца: поле знака (шаг минус краска, в долях
 * кегля) образца минус поле кандидата плюс трекинг образца; у капса — по прописным, иначе по строчным. Разницу
 * в размере знака трекинг не возмещает — для неё sizeFor.
 */
export function trackFor(sample, m) {
  if (!sample || !sample.metrics || !m) return 0;
  const ls = (sample.font && sample.font.letterSpacingEm) || 0;
  const up = /uppercase/i.test((sample.font && sample.font.textTransform) || '');
  const [a, w] = up ? ['advUc', 'widthUc'] : ['advLc', 'widthLc'];
  const sb = (x) => x[a] - x[w] * x.capEm;
  if (![a, w, 'capEm'].every((k) => Number.isFinite(sample.metrics[k]) && Number.isFinite(m[k]))) return ls;
  return Math.round((ls + sb(sample.metrics) - sb(m)) * 1000) / 1000;
}
/** Во сколько раз крупнее набрать кандидата, чтобы высота прописных была как у образца. */
export const sizeFor = (sample, m) => (sample && sample.metrics && m && m.capEm ? Math.round((sample.metrics.capEm / m.capEm) * 100) / 100 : 1);
const fmtGap = (g) => (g ? `${g.base >= 0 ? '+' : ''}${g.base.toFixed(2)}${g.tails < 0 ? '!' : ''}` : '—');
const sgn = (v, n = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(n)}`;
/** Две-три главные разницы: «шир. прописных −0.04, контраст +0.12» */
function mainDiffs(parts, weights, k = 3) {
  return METRICS.filter((m) => parts[m.key] !== undefined).map((m) => ({ m, z: Math.abs(parts[m.key] / m.s) * weights[m.key] })).sort((a, b) => b.z - a.z).slice(0, k).filter((x) => x.z >= 0.5).map((x) => `${x.m.name} ${sgn(parts[x.m.key])}`).join(', ');
}

/* ---------- образец ---------- */

/** «google:Inter Tight:700» → { source: 'google', family: 'Inter Tight', weight: 700 } */
export function parseFamilySpec(s) {
  let t = String(s).trim(); let source = null, weight = null;
  const m1 = /^([a-z0-9-]+):(.+)$/i.exec(t); if (m1 && !/^\d+$/.test(m1[2])) { source = m1[1].toLowerCase(); t = m1[2]; }
  const m2 = /^(.+):(\d{3})$/.exec(t); if (m2) { t = m2[1]; weight = Number(m2[2]); }
  return { source, family: t.trim(), weight };
}
const isUrl = (s) => /^https?:\/\//i.test(String(s));
function sampleDir(input) {
  const name = isUrl(input) ? capSlugLocal(new URL(input).host.replace(/^www\./, '') + new URL(input).pathname) : capSlugLocal(path.basename(String(input)).replace(FONT_EXT, ''));
  return path.join(CACHE_DIR, 'samples', name);
}
const capSlugLocal = (s) => slugOf(s).slice(0, 60) || 'sample';

/** Найти семейство в источниках: spec.source или по порядку включённых. → { src, fam } | null */
async function findFamily(spec, reg, { refresh = false } = {}) {
  const order = spec.source ? reg.list.filter((s) => s.id === spec.source) : reg.list.filter((s) => s.enabled !== false);
  if (spec.source && !order.length) throw new Fail(`источника «${spec.source}» нет в ${reg.file}: есть ${reg.list.map((s) => s.id).join(', ')}`);
  for (const src of order) {
    const fams = await sourceFamilies(src, { refresh });
    const fam = fams.list.find((f) => f.family.toLowerCase() === spec.family.toLowerCase());
    if (fam) return { src, fam, from: fams.from };
  }
  return null;
}

/** Блок листа (в странице, без замыканий): строка капсом, строчными, абзац, Й/Ё при 0.9 и 1.0. */
function buildBlockInPage(id, fontCss, weight, trackingEm, sheet) {
  const box = document.createElement('div');
  box.id = id;
  box.style.cssText = 'all:initial;display:block;box-sizing:border-box;width:1360px;padding:14px 24px 18px;background:#fff;color:#111;';
  const line = (text, px, lh, extra = '') => { const d = document.createElement('div'); d.textContent = text; d.style.cssText = `display:block;font-family:${fontCss};font-weight:${weight};font-style:normal;font-size:${px}px;line-height:${lh};letter-spacing:${trackingEm}em;white-space:nowrap;text-transform:none;${extra}`; return d; };
  box.append(line(sheet.caps, 50, 1.15), line(sheet.lower, 50, 1.15, 'margin-bottom:10px;'));
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:36px;align-items:flex-start;';
  const p = document.createElement('div'); p.textContent = sheet.para;
  p.style.cssText = `display:block;width:500px;flex:none;font-family:${fontCss};font-weight:${weight};font-size:18px;line-height:1.45;letter-spacing:0;`;
  row.append(p);
  for (const lh of [0.9, 1.0]) {
    const col = document.createElement('div'); col.style.cssText = 'display:block;';
    const cap = document.createElement('div'); cap.textContent = `line-height ${lh.toFixed(1)}`; cap.style.cssText = 'font:12px/1.4 system-ui,sans-serif;color:#777;margin-bottom:4px;';
    const t = document.createElement('div');
    t.style.cssText = `display:block;font-family:${fontCss};font-weight:${weight};font-size:50px;line-height:${lh};letter-spacing:${trackingEm}em;white-space:nowrap;background:repeating-linear-gradient(#fff 0 ${50 * lh - 1}px,#d0d0d0 ${50 * lh - 1}px ${50 * lh}px);`;
    t.append(document.createTextNode(sheet.jo[0]), document.createElement('br'), document.createTextNode(sheet.jo[1]));
    col.append(cap, t); row.append(col);
  }
  box.append(row);
  return box;
}

/** Вставить блок листа в страницу (функция блока — через CDP, без eval в странице: CSP донора не мешает). fixed — поверх страницы. */
async function makeBlock(page, id, fontCss, weight, trackingEm, { fixed = false } = {}) {
  const fn = await page.evaluateHandle(`(${buildBlockInPage.toString()})`);
  try {
    return await page.evaluateHandle((make, id, fontCss, w, tr, sheet, fixed) => {
      const b = make(id, fontCss, w, tr, sheet);
      if (!fixed) { b.style.border = '1px solid #ccc'; document.body.append(b); return b; }
      const host = document.createElement('div');
      host.style.cssText = 'all:initial;position:fixed;left:0;top:0;z-index:2147483647;display:block;background:#fff;';
      host.append(b); document.documentElement.append(host);
      return host;
    }, fn, id, fontCss, weight, trackingEm, SHEET, fixed);
  } finally { await fn.dispose().catch(() => {}); }
}

/**
 * Замер образца. input: адрес, файл шрифта или семейство. → протокол { kind, input, font, metrics, cyr, strip? }
 * browser — общий (один на команду).
 */
async function measureSample(browser, input, o = {}) {
  const now = new Date().toISOString();
  if (isUrl(input)) {
    const selector = o.selector || 'h1';
    const page = await openPage(browser, input, { width: 1440, height: 900 }, { settle: 3000 });
    try {
      const info = await page.evaluate((sel) => {
        const els = [...document.querySelectorAll(sel)];
        const el = els.find((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (e.innerText || '').trim(); });
        if (!el) return { error: `на странице нет видимого «${sel}» с текстом (всего найдено ${els.length})` };
        el.setAttribute('data-fonts-mjs', '1');
        const cs = getComputedStyle(el);
        const fams = cs.fontFamily.split(',').map((x) => x.trim().replace(/^["']|["']$/g, ''));
        const faces = [...document.fonts];
        const used = fams.find((f) => faces.some((x) => x.family.replace(/^["']|["']$/g, '') === f && x.status !== 'error')) || fams[0];
        const files = performance.getEntriesByType('resource').map((x) => x.name).filter((n) => /\.(woff2?|ttf|otf)(\?|#|$)/i.test(n));
        const px = parseFloat(cs.fontSize);
        const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing);
        const lh = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight);
        return { family: used, stack: cs.fontFamily, weight: Number(cs.fontWeight) || 400, style: cs.fontStyle, fontSize: px, letterSpacingPx: ls, letterSpacingEm: Math.round((ls / px) * 1000) / 1000, lineHeight: lh ? Math.round((lh / px) * 1000) / 1000 : null, textTransform: cs.textTransform, text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120), files: [...new Set(files)].slice(0, 12), faces: [...new Set(faces.filter((x) => x.family.replace(/^["']|["']$/g, '') === used).map((x) => `${x.weight} ${x.style} ${x.status}`))] };
      }, selector);
      if (info.error) throw new Fail(`measure ${input}: ${info.error}`);
      /* какой шрифт на деле нарисовал элемент — CDP (имя внутри файла), если доступно */
      let rendered = [];
      try {
        const cdp = await page.target().createCDPSession();
        await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
        const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-fonts-mjs="1"]' });
        if (nodeId) rendered = ((await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts || []).map((f) => ({ name: f.familyName, postScript: f.postScriptName || null, custom: !!f.isCustomFont, glyphs: f.glyphCount }));
        await cdp.detach();
      } catch { /* без CDP — только имя из CSS */ }
      const r = await page.evaluate(measureInPage, info.family, info.weight, info.style || 'normal');
      if (!r.ok) throw new Fail(`measure ${input}: ${r.error} («${info.family}» ${info.weight})`);
      /* полоса для листа: тот же блок, шрифт — стек образца как есть (без кириллицы — видно запасной) */
      let strip = null;
      if (o.stripFile) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const handle = await makeBlock(page, 'fonts-mjs-strip', info.stack, info.weight, info.letterSpacingEm, { fixed: true }).catch(() => null);
        if (handle) {
          await page.evaluate(() => document.fonts.ready).catch(() => {});
          await new Promise((res) => setTimeout(res, 400));
          try { ensureDir(path.dirname(o.stripFile)); await handle.screenshot({ path: o.stripFile }); strip = o.stripFile; } catch { strip = null; }
        }
      }
      return { kind: 'fonts-sample', version: 1, created: now, input: { type: 'url', value: input, selector }, font: { family: info.family, stack: info.stack, rendered, weight: info.weight, style: info.style, fontSize: info.fontSize, letterSpacingEm: info.letterSpacingEm, lineHeight: info.lineHeight, textTransform: info.textTransform, text: info.text, files: info.files, faces: info.faces }, metrics: r.metrics, cyr: r.cyr, strip: strip ? path.basename(strip) : null };
    } finally { await page.close().catch(() => {}); }
  }
  /* файл или семейство: рисуем на своей странице */
  let buf, label, src = null, fam = null, weight = Number(o.weight) || 400, file = null;
  if (FONT_EXT.test(input) && fs.existsSync(input)) { file = path.resolve(input); buf = fs.readFileSync(file); label = path.basename(file); }
  else if (FONT_EXT.test(input)) throw new Fail(`нет файла шрифта: ${input}`);
  else {
    const spec = parseFamilySpec(input);
    if (spec.weight && !o.weight) weight = spec.weight;
    const reg = o.reg || loadSources();
    const found = await findFamily(spec, reg, o);
    if (!found) throw new Fail(`«${spec.family}» нет в подключённых источниках (${reg.list.filter((s) => s.enabled !== false).map((s) => s.id).join(', ')}) — адрес образца, файл шрифта или имя как в источнике`);
    ({ src, fam } = found);
    weight = nearestWeight(fam, weight);
    const face = await acquireFace(src, fam, weight, { base: reg.base });
    buf = face.buf; file = face.file; label = fam.family;
  }
  const srv = o.server || await fontServer();
  const page = await browser.newPage();
  try {
    await page.goto(srv.origin + '/');
    const ok = await loadFaceInPage(page, 'Sample Face', srv.add(buf));
    if (ok !== true) throw new Fail(`measure: файл не подключился в Chrome (${ok}) — ${file}`);
    const r = await page.evaluate(measureInPage, 'Sample Face', weight, 'normal');
    if (!r.ok) throw new Fail(`measure ${label}: ${r.error}`);
    let codes = null; try { codes = fontCodes(buf); } catch { /* таблица не прочитана — по отрисовке */ }
    const gc = codes ? glyphCheck(codes) : null;
    return { kind: 'fonts-sample', version: 1, created: now, input: { type: src ? 'family' : 'file', value: input, source: src ? src.id : null }, font: { family: label, stack: null, weight, style: 'normal', fontSize: null, letterSpacingEm: 0, lineHeight: null, textTransform: 'none', text: null, file, source: src ? { id: src.id, name: src.name } : null }, metrics: r.metrics, cyr: gc ? { letters: 66 - gc.cyrMissing.length, of: 66, signsMissing: gc.signsMissing } : r.cyr, strip: null };
  } finally { await page.close().catch(() => {}); if (!o.server) await srv.close(); }
}

function printSample(s) {
  const m = s.metrics; const f = s.font;
  console.log(`образец: ${f.family} ${f.weight}${f.rendered && f.rendered.length ? ` (нарисовал: ${f.rendered.map((x) => `${x.name}${x.custom ? '' : ', системный'}`).join('; ')})` : ''}${s.input.selector ? ` · ${s.input.selector}` : ''}`);
  if (f.fontSize) console.log(`  на странице: кегль ${Math.round(f.fontSize)} px, интерлиньяж ${f.lineHeight ?? 'normal'}, трекинг ${f.letterSpacingEm} em, регистр ${f.textTransform}${f.text ? ` · «${cut(f.text, 60)}»` : ''}`);
  console.log(`  x/cap ${m.xCap} · ширина по краскам к высоте прописной: строчных ${m.widthLc}, прописных ${m.widthUc} · шаг набора к кеглю ${m.advLc}/${m.advUc} · контраст ${m.contrast} · круглота O ${m.round} · штрих ${m.stem} · засечки ${m.serif} (${m.serifs ? 'есть' : 'нет'}) · концы ${m.ends} · раскрытие c ${m.aperture} · cap/кегль ${m.capEm}`);
  const cyrNote = s.cyr ? (s.cyr.letters === 66 ? 'кириллица есть (66 из 66)' : s.cyr.letters === 0 ? 'кириллицы нет' : `кириллица неполная: ${s.cyr.letters} из 66`) : 'кириллица не проверена';
  const g9 = joGap(m, 0.9);
  console.log(`  ${cyrNote}${g9 ? ` · Й/Ё при line-height 0.9: зазор ${sgn(g9.base)} кегля${g9.base < 0 ? ' — заходит на строку выше' : ''}${g9.tails < 0 ? `; ниже хвостов Д/Ц/Щ на ${sgn(g9.tails)}` : ''}` : ''}`);
}

async function cmdMeasure() {
  const input = pos.join(' ').trim();
  if (!input) throw new Fail(`нужен образец: ${SKILL_CMD} measure https://site --selector h1 | файл.woff2 | "Семейство" (-h — справка)`);
  if (opt.out !== undefined && opt.run !== undefined) throw new Fail('measure: --out или --run, не оба');
  const outFile = opt.run !== undefined ? path.join(path.resolve(String(opt.run)), 'fonts', 'sample.json') : opt.out !== undefined ? path.resolve(String(opt.out)) : path.join(sampleDir(input), 'sample.json');
  if (!/\.json$/i.test(outFile)) throw new Fail(`measure --out — файл .json: ${outFile}`);
  if (opt.weight !== undefined && !(Number(opt.weight) >= 1 && Number(opt.weight) <= 1000)) throw new Fail(`--weight ${opt.weight}: число 1…1000`);
  const browser = await launch();
  let s;
  try { s = await measureSample(browser, input, { selector: opt.selector ? String(opt.selector) : null, weight: opt.weight, stripFile: isUrl(input) ? outFile.replace(/\.json$/i, '-strip.png') : null, refresh: !!opt.refresh }); } finally { await browser.close(); }
  ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, JSON.stringify(s, null, 1));
  printSample(s);
  const warns = [];
  if (s.cyr && s.cyr.letters === 66) warns.push('у шрифта образца кириллица есть — по typography.md §0 и §5 брать его самого (если лицензия позволяет), подбор не нужен');
  if (isUrl(input) && !s.strip) warns.push('полоса образца для листа не снята — лист покажет образец только подписью');
  if (s.font.rendered && s.font.rendered.length && !s.font.rendered.some((x) => x.custom)) warns.push('элемент нарисован системным шрифтом, веб-шрифта нет — числа системного');
  for (const w of warns) console.log(`WARN: ${w}`);
  console.log(`Протокол: ${outFile}${s.strip ? ` · полоса образца: ${path.join(path.dirname(outFile), s.strip)}` : ''}`);
  console.log(`Дальше: ${SKILL_CMD} match "${outFile}" --sources google --n 8`);
  console.log(`${warns.length ? 'WARN' : 'OK'}: образец снят — ${s.font.family} ${s.font.weight}`);
  return 0;
}

/* ---------- match ---------- */

const markFor = (f) => {
  const m = [];
  if (OVERUSED.test(f.family)) m.push('ИИ-набор');
  if ((f.subsets || []).some((s) => /^(japanese|korean|chinese-)/.test(s))) m.push('CJK');
  if (FAM.decor.has(f.family) || (/^Rubik /.test(f.family) && f.family !== 'Rubik Mono One')) m.push('декоративный');
  if (FAM.slavonic.has(f.family)) m.push('церковнославянский');
  if (FAM.pixel.has(f.family)) m.push('пиксельный');
  if (f.category === 'handwriting') m.push('рукописный');
  return m;
};
/** Пул из 8 одновременных задач. */
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

/**
 * Подбор: образец + источники → { ranked, rejected, stats }. browser — общий.
 * o: { sources: [id], category: [кат], need, n, refresh, reg, server, log, latin }
 * latin — надпись только латиницей (логотип, цифры, английский текст): кириллица не нужна, в файле проверяются A–Z, a–z, 0–9.
 */
export async function matchFonts(browser, sample, o = {}) {
  const reg = o.reg || loadSources();
  const log = o.log || (() => {});
  const ids = o.sources && o.sources.length ? o.sources : reg.list.filter((s) => s.enabled !== false).map((s) => s.id);
  const rejected = []; const stats = { sources: [], noCyrMeta: 0, considered: 0 }; const warns = [];
  const pool0 = [];
  for (const id of ids) {
    const src = reg.list.find((s) => s.id === id);
    if (!src) throw new Fail(`--sources: «${id}» нет в ${reg.file}; есть ${reg.list.map((s) => s.id).join(', ')}`);
    if (src.enabled === false) { warns.push(`источник ${id} выключен в sources.json: ${src.why || 'без причины'}`); continue; }
    const block = sourceBlock(src);
    if (block) { rejected.push({ family: `весь источник ${src.name}`, source: id, why: block }); continue; }
    /* список не Google недоступен — источник пропускается с WARN, подбор идёт по остальным */
    let fams;
    try { fams = await sourceFamilies(src, o); } catch (e) { if (!(e instanceof Fail) || src.id === 'google' || ids.length === 1) throw e; warns.push(`источник ${src.name} пропущен: ${e.message}`); continue; }
    if (fams.warn) warns.push(fams.warn);
    let list = fams.list.filter((f) => !f.cls.includes('symbols'));
    if (o.category && o.category.length) list = list.filter((f) => o.category.includes(f.category));
    const noCyrAll = list.filter((f) => f.cyr === false);
    const noCyr = o.latin ? [] : noCyrAll;
    stats.noCyrMeta += noCyr.length;
    for (const f of list.filter((x) => o.latin || x.cyr !== false)) {
      if (!f.open) { rejected.push({ family: f.family, source: id, why: 'не открытая лицензия (isOpenSource: false)' }); continue; }
      pool0.push({ src, fam: f });
    }
    stats.sources.push({ id, name: src.name, from: fams.from, total: fams.list.length, cyr: list.length - noCyrAll.length });
  }
  stats.considered = pool0.length;
  const sw = sample.font.weight || 400;
  let done = 0;
  const faces = await pool(pool0, 8, async (c) => {
    const w = nearestWeight(c.fam, sw);
    try { const face = await acquireFace(c.src, c.fam, w, { base: reg.base }); if (++done % 50 === 0) log(`  файлы: ${done} из ${pool0.length}`); return { ...c, w, face }; } catch (e) { done++; return { ...c, w, error: e instanceof NetFail ? `сеть: ${e.netCode}` : e.message }; }
  });
  const netErr = faces.filter((x) => x.error && /^сеть/.test(x.error));
  if (netErr.length && netErr.length === faces.length) throw new Fail(`ни один файл не скачан (${netErr[0].error}) — сети нет? Кэш: ${CACHE_DIR}`);
  const cache = metricsCache();
  const srv = o.server || await fontServer();
  const page = await browser.newPage();
  const ranked = [];
  const weights = metricWeights(sample.font);
  const need = o.need !== undefined ? String(o.need) : o.latin ? '' : NEED_DEFAULT;
  /* чего не хватает в файле: кириллицы (обычно) или латиницы и цифр (--latin) */
  const lettersMissing = (gc, codes) => (o.latin ? [...LATIN].filter((ch) => !codes.has(cp(ch))).join('') : gc.cyrMissing);
  const LIC = loadLicenses();
  let k = 0;
  /* числа файла: из кэша или замер на странице; ошибка — строка */
  const measureBuf = async (buf, w) => {
    const hit = cache.get(buf, w); if (hit) return hit;
    const name = `C${k++}`;
    const ok = await loadFaceInPage(page, name, srv.add(buf));
    if (ok !== true) return `не подключился в Chrome: ${ok}`;
    const r = await page.evaluate(measureInPage, name, w, 'normal');
    await page.evaluate((n) => { for (const f of [...document.fonts]) if (f.family === n || f.family === `"${n}"`) document.fonts.delete(f); }, name);
    if (!r.ok) return r.error;
    cache.set(buf, w, r.metrics); return r.metrics;
  };
  const entry = (c, w, m, gc, file) => {
    const dist = fontDistance(sample.metrics, m, weights);
    const lic = c.src.id === 'google' ? (LIC.get(c.fam.family.toLowerCase()) || null) : (c.fam.entry && c.fam.entry.license) || null;
    return { family: c.fam.family, source: c.src.id, sourceName: c.src.name, weight: w, category: c.fam.category, d: dist.d, parts: dist.parts, metrics: m, track: trackFor(sample, m), signsMissing: gc.signsMissing, marks: markFor(c.fam), license: lic ? (LICENSES[lic] ? LICENSES[lic][0] : lic) : c.src.license.default, licenseUrl: lic && LICENSES[lic] ? LICENSES[lic][1] : c.src.license.url || null, file, popularity: c.fam.popularity, c };
  };
  try {
    await page.goto(srv.origin + '/');
    for (const c of faces) {
      if (c.error) { rejected.push({ family: c.fam.family, source: c.src.id, why: `файл не получен: ${c.error}` }); continue; }
      let codes; try { codes = fontCodes(c.face.buf); } catch (e) { rejected.push({ family: c.fam.family, source: c.src.id, why: `таблица знаков не прочитана: ${e.message}` }); continue; }
      const gc = glyphCheck(codes, need);
      const lm = lettersMissing(gc, codes);
      if (lm.length) { rejected.push({ family: c.fam.family, source: c.src.id, why: !o.latin && lm.length === 66 ? 'кириллицы нет в файле' : `нет букв ${lm}` }); continue; }
      const m = await measureBuf(c.face.buf, c.w);
      if (typeof m === 'string') { rejected.push({ family: c.fam.family, source: c.src.id, why: m }); continue; }
      ranked.push(entry(c, c.w, m, gc, c.face.file));
    }
    /* второй проход — вес по толщине штриха: у первых 24 соседние веса (±100, ±200), если есть; лучший по расстоянию */
    ranked.sort((a, b) => a.d - b.d);
    const second = ranked.slice(0, o.weightPass === undefined ? 24 : o.weightPass);
    const alts = [];
    for (const r of second) {
      const ws = uniq([sw - 200, sw - 100, sw + 100, sw + 200].filter((w) => w >= 100 && w <= 900).map((w) => nearestWeight(r.c.fam, w))).filter((w) => w !== r.weight && Math.abs(w - sw) <= 200);
      for (const w of ws) alts.push({ r, w });
    }
    const got = await pool(alts, 8, async (x) => { try { return { ...x, face: await acquireFace(x.r.c.src, x.r.c.fam, x.w, { base: reg.base }) }; } catch { return null; } });
    for (const x of got.filter(Boolean)) {
      const m = await measureBuf(x.face.buf, x.w);
      if (typeof m === 'string') continue;
      let gc, codes; try { codes = fontCodes(x.face.buf); gc = glyphCheck(codes, need); } catch { continue; }
      if (lettersMissing(gc, codes).length) continue;
      const e = entry(x.r.c, x.w, m, gc, x.face.file);
      const i = ranked.findIndex((y) => y.family === e.family && y.source === e.source);
      if (i >= 0 && e.d < ranked[i].d) ranked[i] = { ...e, cssWeight: ranked[i].weight };
    }
  } finally { cache.save(); await page.close().catch(() => {}); if (!o.server) await srv.close(); }
  for (const r of ranked) delete r.c;
  /* пометки «не тот жанр» опускают при сортировке (+0.3 каждая), расстояние в таблице — без них */
  const pen = (r) => 0.3 * r.marks.filter((x) => x !== 'ИИ-набор').length;
  ranked.sort((a, b) => (a.d + pen(a)) - (b.d + pen(b)) || a.popularity - b.popularity || a.family.localeCompare(b.family));
  const ok = ranked.filter((r) => !r.signsMissing);
  const noSigns = ranked.filter((r) => r.signsMissing);
  for (const r of noSigns) rejected.push({ family: r.family, source: r.source, why: `нет знаков ${r.signsMissing}`, d: r.d });
  return { ranked: ok, noSigns, rejected, stats, warns, weights };
}

async function cmdMatch() {
  const file = pos.join(' ').trim();
  if (!file) throw new Fail(`нужен протокол образца: ${SKILL_CMD} match <папка>/fonts/sample.json (его пишет measure)`);
  let sample; try { sample = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (e) { throw new Fail(`протокол образца не прочитан: ${file} (${e.code || e.message}) — сначала ${SKILL_CMD} measure`); }
  if (sample.kind !== 'fonts-sample' || !sample.metrics) throw new Fail(`${file} — не протокол measure (kind: ${sample.kind || 'нет'})`);
  const n = opt.n !== undefined ? parseN(opt.n) : 8;
  const sources = opt.sources !== undefined ? String(opt.sources).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const category = parseCategories(opt.category);
  const t0 = Date.now();
  printSample(sample);
  const browser = await launch();
  let res;
  const latin = !!opt.latin;
  try { res = await matchFonts(browser, sample, { sources, category, need: opt.need, refresh: !!opt.refresh, latin, log: (s) => console.log(s) }); } finally { await browser.close(); }
  const top = res.ranked.slice(0, n);
  for (const s of res.stats.sources) console.log(`источник ${s.name} (${s.from}): семейств ${s.total}, с кириллицей по данным ${s.cyr}`);
  if (latin) console.log('--latin: только латиница — кириллица не проверяется; русский текст этими шрифтами не набирать (логотип, цифры, английский текст)');
  console.log(`match: рассмотрено ${res.stats.considered}${latin ? '' : `, без кириллицы по данным источника — ${res.stats.noCyrMeta} (не качались)`}; измерено и годится ${res.ranked.length}, в отсеве ${res.rejected.length} · ${Math.round((Date.now() - t0) / 1000)} с`);
  for (const w of res.warns) console.log(`WARN: ${w}`);
  const sm = sample.metrics;
  const head = ['#', 'семейство', 'вес', 'd', 'x/cap', 'шир. стр/проп', 'контраст', 'O', 'штрих', 'засечки', 'концы', 'c', 'трекинг', 'кегль', 'Й/Ё .9', 'источник · лицензия', 'пометки'];
  const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
  const cells = (m) => [f2(m.xCap), `${f2(m.widthLc)}/${f2(m.widthUc)}`, f2(m.contrast), f2(m.round), Number.isFinite(m.stem) ? m.stem.toFixed(3) : '—', `${m.serifs ? 'да' : 'нет'} ${f2(m.serif)}`, f2(m.ends), f2(m.aperture)];
  const rowOf = (r, i) => [String(i + 1), r.family, `${r.weight}${r.cssWeight ? '*' : ''}`, r.d.toFixed(2), ...cells(r.metrics), `${r.track >= 0 ? '+' : ''}${r.track.toFixed(3)}`, `×${sizeFor(sample, r.metrics).toFixed(2)}`, fmtGap(joGap(r.metrics, 0.9)), `${r.sourceName} · ${r.license}`, r.marks.join('; ') || '—'];
  const sampleRow = ['·', `образец: ${sample.font.family}`, String(sample.font.weight), '0', ...cells(sm), `${(sample.font.letterSpacingEm || 0) >= 0 ? '+' : ''}${(sample.font.letterSpacingEm || 0).toFixed(3)}`, '×1', fmtGap(joGap(sm, 0.9)), '—', '—'];
  for (const line of table(head, [sampleRow, ...top.map(rowOf)])) console.log(line);
  console.log('d — расстояние (0 — то же, до 1 — близко, от 2 — другой характер); вес* — взят другой вес, чем у образца: по толщине штриха ближе; ширина — по краскам к высоте прописной; трекинг — воздух между буквами как у образца (em; разницу размера знака он не возмещает); кегль × — во сколько раз крупнее набрать для той же высоты прописных; Й/Ё .9 — зазор над Й/Ё до строки выше при line-height 0.9 в долях кегля (минус — заходит на строку выше), «!» — верх Й/Ё выше низа хвостов Д/Ц/Щ: столкнутся, если хвост прямо над ними.');
  for (const [i, r] of top.entries()) { const md = mainDiffs(r.parts, res.weights); if (md) console.log(`  ${i + 1}. ${r.family}: ${md}`); }
  if (res.rejected.length) {
    const byWhy = new Map();
    for (const r of res.rejected) { const k = r.why.replace(/^нет букв .*/, 'нет части букв').replace(/^нет знаков .*/, 'нет знаков'); if (!byWhy.has(k)) byWhy.set(k, []); byWhy.get(k).push(r); }
    console.log('\nОтсев (по причинам):');
    for (const [why, list] of byWhy) {
      const items = list.slice().sort((a, b) => (a.d ?? 99) - (b.d ?? 99)).slice(0, 10).map((r) => `${r.family}${r.d !== undefined ? ` d ${r.d.toFixed(2)}` : ''}${/^нет (букв|знаков)/.test(r.why) ? ` (${r.why.replace(/^нет (букв|знаков) /, '')})` : ''}`);
      console.log(`  ${why} — ${list.length}: ${items.join('; ')}${list.length > 10 ? '; …' : ''}`);
    }
  }
  const outFile = path.join(path.dirname(path.resolve(file)), 'match.json');
  const strip = (r) => ({ family: r.family, source: r.source, weight: r.weight, cssWeight: r.cssWeight || null, track: r.track, d: r.d, parts: r.parts, metrics: r.metrics, marks: r.marks, signsMissing: r.signsMissing || '', license: r.license, licenseUrl: r.licenseUrl, file: r.file });
  fs.writeFileSync(outFile, JSON.stringify({ kind: 'fonts-match', version: 1, created: new Date().toISOString(), sample: path.resolve(file), sampleFont: { family: sample.font.family, weight: sample.font.weight }, sources: res.stats.sources, latin, need: opt.need !== undefined ? String(opt.need) : latin ? '' : NEED_DEFAULT, weights: res.weights, top: top.map(strip), ranked: res.ranked.slice(0, 60).map(strip), noSigns: res.noSigns.slice(0, 30).map(strip), rejected: res.rejected }, null, 1));
  console.log(`\nПротокол: ${outFile}`);
  if (!top.length) { console.log(`WARN: кандидатов${latin ? '' : ' с кириллицей'} нет — другой источник (reference/fonts.md) или без --category`); return 0; }
  console.log(`Лист для глаз: ${SKILL_CMD} sheet "${path.resolve(file)}" ${top.map((r) => `"${r.source}:${r.family}:${r.weight}"`).join(' ')}`);
  console.log(`Решение: ${SKILL_CMD} decide "${top[0].source === 'google' ? '' : `${top[0].source}:`}${top[0].family}" --run <папка прогона> --why "<почему этот: числа и лист>"`);
  if (top.some((r) => r.marks.includes('ИИ-набор'))) console.log('Пометка «ИИ-набор» — не запрет: по образцу это честный ближайший; брать, если это язык донора (typography.md §5).');
  console.log(`${res.warns.length ? 'WARN' : 'OK'}: ${top.length} кандидатов, ближайший — ${top[0].family} ${top[0].weight} (d ${top[0].d.toFixed(2)})`);
  return 0;
}

/* ---------- sheet ---------- */

async function cmdSheet() {
  const [sampleArg, ...candArgs] = pos;
  if (!sampleArg) throw new Fail(`нужен образец: ${SKILL_CMD} sheet <образец.json> "Семейство" … --out лист.png`);
  const reg = loadSources();
  const browser = await launch();
  const srv = await fontServer();
  const warns = [];
  try {
    let sample, sampleBase;
    if (/\.json$/i.test(sampleArg)) {
      try { sample = JSON.parse(fs.readFileSync(path.resolve(sampleArg), 'utf8')); } catch (e) { throw new Fail(`образец не прочитан: ${sampleArg} (${e.code || e.message})`); }
      if (sample.kind !== 'fonts-sample') throw new Fail(`${sampleArg} — не протокол measure`);
      sampleBase = path.dirname(path.resolve(sampleArg));
    } else { sample = await measureSample(browser, sampleArg, { reg, server: srv }); sampleBase = sampleDir(sampleArg); }
    const weights = metricWeights(sample.font);
    const matchFile = path.join(sampleBase, 'match.json');
    let match = null; try { match = JSON.parse(fs.readFileSync(matchFile, 'utf8')); } catch { /* без match */ }
    let specs = candArgs.map(parseFamilySpec);
    if (!specs.length) {
      if (!match) throw new Fail(`кандидатов нет: имена после образца или сначала ${SKILL_CMD} match`);
      specs = match.top.slice(0, opt.n !== undefined ? parseN(opt.n) : 8).map((r) => ({ source: r.source, family: r.family, weight: r.weight }));
    }
    const sw = sample.font.weight || 400;
    const cands = [];
    for (const sp of specs) {
      const found = await findFamily(sp, reg);
      if (!found) { warns.push(`«${sp.family}» нет в источниках — пропущен`); continue; }
      const w = sp.weight || nearestWeight(found.fam, sw);
      let face; try { face = await acquireFace(found.src, found.fam, w, { base: reg.base }); } catch (e) { warns.push(`${sp.family}: файл не получен (${e.netCode || e.message})`); continue; }
      const prev = match && [...(match.ranked || []), ...(match.noSigns || [])].find((r) => r.family === found.fam.family && r.weight === w);
      cands.push({ spec: sp, src: found.src, fam: found.fam, w, face, prev });
    }
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(srv.origin + '/');
    /* образец: полоса со страницы (как есть) или файл */
    let stripUrl = null;
    if (sample.strip && fs.existsSync(path.join(sampleBase, sample.strip))) stripUrl = `data:image/png;base64,${fs.readFileSync(path.join(sampleBase, sample.strip)).toString('base64')}`;
    let sampleFace = null;
    if (!stripUrl && sample.font.file && fs.existsSync(sample.font.file)) { sampleFace = 'Sample Face'; await loadFaceInPage(page, sampleFace, srv.add(fs.readFileSync(sample.font.file))); }
    const rows = [];
    const sm = sample.metrics;
    const g = (m, lh) => { const x = m && joGap(m, lh); return x ? `${sgn(x.base)}${x.base < 0 ? ' — заходит на строку выше' : ' — чисто'}${x.tails < 0 ? ` (с хвостом Д/Ц/Щ прямо над ними ${sgn(x.tails)})` : ''}` : 'нет кириллицы'; };
    rows.push({ label: `ОБРАЗЕЦ · ${sample.font.family} ${sample.font.weight}${sample.input.type === 'url' ? ` · ${sample.input.value} ${sample.input.selector}` : ''} · трекинг ${sample.font.letterSpacingEm} em · x/cap ${sm.xCap} · шир. ${sm.widthLc}/${sm.widthUc} · контраст ${sm.contrast} · засечки ${sm.serifs ? 'есть' : 'нет'} · кириллица ${sample.cyr ? `${sample.cyr.letters} из 66` : '?'}${sample.cyr && sample.cyr.letters < 66 ? ' — буквы ниже нарисованы запасным шрифтом' : ''}`, strip: stripUrl, face: sampleFace, w: sample.font.weight, tr: sample.font.letterSpacingEm || 0, sub: sample.font.text ? `на странице: «${cut(sample.font.text, 90)}»` : '' });
    for (const [i, c] of cands.entries()) {
      const name = `K${i}`;
      const ok = await loadFaceInPage(page, name, srv.add(c.face.buf));
      if (ok !== true) { warns.push(`${c.fam.family}: не подключился (${ok})`); continue; }
      const m = c.prev ? c.prev.metrics : (await page.evaluate(measureInPage, name, c.w, 'normal')).metrics;
      const dist = m ? fontDistance(sm, m, weights) : null;
      const lic = c.prev ? c.prev.license : (c.src.id === 'google' ? (LICENSES[loadLicenses().get(c.fam.family.toLowerCase())] || [c.src.license.default])[0] : (c.fam.entry && c.fam.entry.license) || c.src.license.default);
      const signs = (() => { try { return glyphCheck(fontCodes(c.face.buf)).signsMissing; } catch { return ''; } })();
      const tr = m ? trackFor(sample, m) : (sample.font.letterSpacingEm || 0);
      rows.push({ tr, label: `${i + 1}. ${c.fam.family} ${c.w} · ${c.src.name} · ${lic} · d ${dist ? dist.d.toFixed(2) : '?'} · трекинг ${tr >= 0 ? '+' : ''}${tr.toFixed(3)} em (воздух как у образца) · кегль ×${sizeFor(sample, m).toFixed(2)} для той же высоты прописных${dist && mainDiffs(dist.parts, weights) ? ` (${mainDiffs(dist.parts, weights)})` : ''}${signs ? ` · нет ${signs}` : ''}${markFor(c.fam).length ? ` · ${markFor(c.fam).join(', ')}` : ''}`, face: name, w: c.w, sub: `Й/Ё до строки выше, доли кегля: line-height 0.9 → ${g(m, 0.9)}; 1.0 → ${g(m, 1.0)}`, gap9: m ? joGap(m, 0.9) : null });
    }
    rows[0].sub = [rows[0].sub, `Й/Ё: line-height 0.9 → ${g(sm, 0.9)}; 1.0 → ${g(sm, 1.0)}`].filter(Boolean).join(' · ');
    await page.evaluate(() => {
      document.body.style.cssText = 'margin:0;background:#f2f2f2;padding:16px 20px;font:13px/1.4 system-ui,sans-serif;color:#222;width:1360px;';
      const h = document.createElement('div'); h.textContent = 'fonts.mjs sheet — образец как есть и кандидаты в весе образца и в том же кегле, трекинг — воздух между буквами как у образца; серые линии в блоках Й/Ё — границы строк'; h.style.cssText = 'font:600 15px system-ui;margin:0 0 10px;';
      document.body.append(h);
    });
    for (const r of rows) {
      await page.evaluate((r) => {
        const lab = document.createElement('div'); lab.textContent = r.label; lab.style.cssText = 'font:600 13px/1.35 system-ui,sans-serif;margin:12px 0 2px;color:#111;';
        const sub = document.createElement('div'); sub.textContent = r.sub || ''; sub.style.cssText = `font:12px/1.35 system-ui,sans-serif;margin:0 0 4px;color:${/заходит/.test(r.sub || '') ? '#b00020' : '#555'};`;
        document.body.append(lab, sub);
        if (r.strip) { const im = document.createElement('img'); im.src = r.strip; im.style.cssText = 'display:block;width:1360px;border:2px solid #111;'; document.body.append(im); }
        else if (!r.face) { const no = document.createElement('div'); no.textContent = '(образец без полосы и файла — только числа)'; no.style.cssText = 'padding:8px;background:#fff'; document.body.append(no); }
      }, r);
      if (!r.strip && r.face) await makeBlock(page, `b-${r.face}`, `"${r.face}", monospace`, r.w, r.tr);
    }
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 300));
    const outPng = opt.out !== undefined ? path.resolve(String(opt.out)) : path.join(sampleBase, 'sheet.png');
    if (!/\.png$/i.test(outPng)) throw new Fail(`sheet --out — файл .png: ${outPng}`);
    ensureDir(path.dirname(outPng));
    await page.screenshot({ path: outPng, fullPage: true });
    const dims = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    await page.close();
    for (const w of warns) console.log(`WARN: ${w}`);
    console.log(`sheet: образец ${sample.font.family} ${sample.font.weight} и кандидатов ${rows.length - 1} · ${dims[0]}×${dims[1]} px`);
    const tight = rows.slice(1).filter((r) => r.gap9 && r.gap9.base < 0);
    if (tight.length) console.log(`Й/Ё при line-height 0.9 заходят на строку выше у ${tight.length} из ${rows.length - 1}: ${tight.map((r) => `${r.label.split(' · ')[0].replace(/^\d+\. /, '')} ${sgn(r.gap9.base)}`).join(', ')} — капс в две строки с Й/Ё набирать с line-height от 1.0 (или проверить глазами на листе)`);
    console.log(`Лист: ${outPng} — открыть глазами (Read): Ж, Д, Л, Ф, Ы, Й и Ё в капсе, абзац, ₽ и №`);
    console.log(`${warns.length ? 'WARN' : 'OK'}: лист ${path.basename(outPng)}`);
    return 0;
  } finally { await srv.close(); await browser.close(); }
}

/* ---------- decide ---------- */

/** Лицензия семейства Google по репозиторию google/fonts: ofl/<имя>/OFL.txt, apache/<имя>/LICENSE.txt, ufl/<имя>/UFL.txt. */
async function googleLicense(family) {
  const local = loadLicenses().get(family.toLowerCase());
  if (local && LICENSES[local]) return { name: LICENSES[local][0], url: LICENSES[local][1], checked: 'google-font-licenses.json (ui-ux-pro-max)' };
  const dirName = family.toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = process.env.FONTS_LICENSE_BASE || 'https://raw.githubusercontent.com/google/fonts/main';
  for (const [dir, file, key] of [['ofl', 'OFL.txt', 'OFL'], ['apache', 'LICENSE.txt', 'APACHE2'], ['ufl', 'UFL.txt', 'UFL']]) {
    const url = `${base}/${dir}/${dirName}/${file}`;
    try { const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) }); if (r.status === 200) return { name: LICENSES[key][0], url: LICENSES[key][1], text: url.replace(/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/main/, 'https://github.com/google/fonts/blob/main'), checked: `репозиторий google/fonts, ${new Date().toLocaleDateString('sv-SE')}` }; } catch { return null; }
  }
  return null;
}

async function cmdDecide() {
  const famArg = pos.join(' ').trim();
  if (!famArg) throw new Fail(`нужно семейство: ${SKILL_CMD} decide "Inter Tight" --run <папка прогона> --why "…"`);
  if (opt.run === undefined) throw new Fail('decide: --run <папка прогона> обязателен — туда <папка>/fonts/decision.json');
  if (opt.why === undefined || !String(opt.why).trim()) throw new Fail('decide: --why "<почему>" обязателен — решение без причины следующему агенту ничего не скажет');
  const run = path.resolve(String(opt.run));
  const dir = path.join(run, 'fonts');
  const spec = parseFamilySpec(famArg);
  if (opt.source !== undefined) spec.source = String(opt.source).toLowerCase();
  const read = (n) => { try { return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch { return null; } };
  const sample = read('sample.json'); const match = read('match.json');
  const warns = [];
  if (!sample) warns.push(`нет ${path.join(dir, 'sample.json')} — образец не записан (measure --run ${run})`);
  if (!match) warns.push(`нет ${path.join(dir, 'match.json')} — кандидаты не записаны (match ${path.join(dir, 'sample.json')})`);
  const all = match ? [...(match.ranked || []), ...(match.noSigns || [])] : [];
  const hits = all.filter((r) => r.family.toLowerCase() === spec.family.toLowerCase() && (!spec.source || r.source === spec.source));
  const weight = opt.weight !== undefined ? Number(opt.weight) : spec.weight || (hits[0] && hits[0].weight) || (sample && sample.font.weight) || 400;
  const hit = hits.find((r) => r.weight === weight) || hits[0] || null;
  const rank = hit && match ? (match.ranked || []).findIndex((r) => r === hit) + 1 : 0;
  if (match && !hit) warns.push(`«${spec.family}» нет среди кандидатов match.json — числа и расстояние не записаны`);
  if (hit && hit.signsMissing) warns.push(`у «${hit.family}» нет знаков ${hit.signsMissing} — их нарисует запасной шрифт`);
  const reg = loadSources();
  const srcId = (hit && hit.source) || spec.source || 'google';
  const src = reg.list.find((s) => s.id === srcId);
  if (!src) throw new Fail(`источника «${srcId}» нет в ${reg.file}`);
  let license = null;
  if (src.id === 'google') { license = await googleLicense(hit ? hit.family : spec.family); if (!license) warns.push('лицензия семейства по репозиторию google/fonts не сверена (нет сети или имя папки другое) — записана лицензия источника по умолчанию'); }
  if (!license) license = { name: (hit && hit.license) || src.license.default, url: (hit && hit.licenseUrl) || src.license.url || null, checked: null };
  const family = hit ? hit.family : spec.family;
  const decision = {
    kind: 'fonts-decision', version: 1, created: new Date().toISOString(),
    choice: { family, weight, source: { id: src.id, name: src.name, url: src.url }, license, rank: rank || null, d: hit ? hit.d : null, metrics: hit ? hit.metrics : null, parts: hit ? hit.parts : null, joGap: hit ? { '0.9': joGap(hit.metrics, 0.9), '1.0': joGap(hit.metrics, 1.0) } : null, signsMissing: hit ? hit.signsMissing : null, marks: hit ? hit.marks : [] },
    why: String(opt.why).trim(),
    sample: sample ? { input: sample.input, family: sample.font.family, weight: sample.font.weight, letterSpacingEm: sample.font.letterSpacingEm, lineHeight: sample.font.lineHeight, textTransform: sample.font.textTransform, cyr: sample.cyr, metrics: sample.metrics } : null,
    candidates: match ? (match.top || []).map((r, i) => ({ rank: i + 1, family: r.family, source: r.source, weight: r.weight, d: r.d, license: r.license, marks: r.marks })) : [],
    sheet: fs.existsSync(path.join(dir, 'sheet.png')) ? path.join(dir, 'sheet.png') : null,
    terms: src.license.terms || null,
    next: src.id === 'google' ? `${SKILL_CMD} get "${family}" --weights ${uniq([400, weight]).sort((a, b) => a - b).join(',')} --out <папка сайта>`
      : src.files.kind === 'css' ? `${SKILL_CMD} get "${src.id}:${family}" --weights ${uniq([400, weight]).sort((a, b) => a - b).join(',')}${match && match.latin ? ' --latin' : ''} --out <папка сайта>`
      : `файлы — по reference/fonts.md (источник ${src.name}), лицензию положить рядом с файлами`,
  };
  ensureDir(dir);
  const out = path.join(dir, 'decision.json');
  fs.writeFileSync(out, JSON.stringify(decision, null, 1));
  for (const w of warns) console.log(`WARN: ${w}`);
  console.log(`decide: ${family} ${weight} · ${src.name} · ${license.name}${license.url ? ` (${license.url})` : ''}${rank ? ` · место ${rank} в match, d ${hit.d.toFixed(2)}` : ''}`);
  console.log(`  почему: ${decision.why}`);
  console.log(`Записано: ${out}`);
  if (decision.terms) for (const t of decision.terms) console.log(`  условие лицензии: ${t}`);
  console.log(`Дальше: ${decision.next}`);
  console.log(`${warns.length ? 'WARN' : 'OK'}: решение записано — ${family} ${weight}`);
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
  /* 10а. get: пути подключения от корня сайта */
  const site2 = path.join(tmp, 'сайт2'); fs.mkdirSync(site2, { recursive: true }); fs.writeFileSync(path.join(site2, 'index.html'), '<!doctype html>');
  c = await run(['get', 'Manrope', '--weights', '400,700', '--out', path.join(site2, 'assets', 'fonts', 'manrope')], mock);
  check('get: preload — путь от корня сайта (найден по index.html), а не от --out', c.code === 0 && /от корня сайта .*найден по index\.html/.test(c.out) && /rel="preload" href="\/assets\/fonts\/manrope\/fonts\/manrope-200-800-cyrillic\.woff2"/.test(c.out) && /href="\/assets\/fonts\/manrope\/fonts\/fonts\.css"/.test(c.out) && /--css http:\/\/localhost:<порт>\/assets\/fonts\/manrope\/fonts\/fonts\.css/.test(c.out), (c.out.match(/rel="preload"[^\n]*/) || [''])[0]);
  c = await run(['get', 'Manrope', '--weights', '400,700', '--out', path.join(site2, 'assets', 'f2'), '--root', path.join(site2, 'assets')], mock);
  check('get --root: путь от заданного корня', c.code === 0 && /rel="preload" href="\/f2\/fonts\/manrope-200-800-cyrillic\.woff2"/.test(c.out), (c.out.match(/rel="preload"[^\n]*/) || [''])[0]);
  check('get без корня сайта: путь от --out с пометкой', /корень сайта не найден/.test((await run(['get', 'Manrope', '--weights', '400', '--out', path.join(tmp, 'безкорня')], mock)).out));
  srv.close();

  /* 11. подбор по образцу: чистые функции */
  const FX = (n) => path.join(FIX, `m-${n}.woff2`);
  const itBuf = fs.readFileSync(FX('inter-tight-600'));
  const itCodes = fontCodes(itBuf);
  check('fontCodes WOFF2: у подмножества Inter Tight 66 букв и ₽№«»', glyphCheck(itCodes).cyrMissing === '' && glyphCheck(itCodes).signsMissing === '');
  check('fontCodes: у Prata нет №, у Playfair Display нет ₽, у Bebas Neue нет кириллицы', glyphCheck(fontCodes(fs.readFileSync(FX('prata-400')))).signsMissing === '№' && glyphCheck(fontCodes(fs.readFileSync(FX('playfair-display-400')))).signsMissing === '₽' && glyphCheck(fontCodes(fs.readFileSync(FX('bebas-neue-400')))).cyrMissing.length === 66);
  /* TTF и WOFF — синтетические: таблица cmap из makeWoff2 */
  const synthW2 = makeWoff2([0x41, 0x416, 0x20bd]);
  const cmapRaw = zlib.brotliDecompressSync(synthW2.subarray(synthW2.length - synthW2.readUInt32BE(20)));
  const ttf = Buffer.alloc(12 + 16); ttf.writeUInt32BE(0x00010000, 0); ttf.writeUInt16BE(1, 4); ttf.write('cmap', 12, 'latin1'); ttf.writeUInt32BE(28, 20); ttf.writeUInt32BE(cmapRaw.length, 24);
  const ttfBuf = Buffer.concat([ttf, cmapRaw]);
  const z = zlib.deflateSync(cmapRaw); const wf = Buffer.alloc(44 + 20); wf.write('wOFF', 0, 'latin1'); wf.writeUInt16BE(1, 12); wf.write('cmap', 44, 'latin1'); wf.writeUInt32BE(64, 48); wf.writeUInt32BE(z.length, 52); wf.writeUInt32BE(cmapRaw.length, 56);
  const woffBuf = Buffer.concat([wf, z]);
  let e3 = ''; try { fontCodes(Buffer.from('<html>не шрифт</html>')); } catch (e) { e3 = e.message; }
  check('fontCodes: TTF и WOFF (zlib) читаются, не шрифт — понятная ошибка', [ttfBuf, woffBuf].every((b) => { const s = fontCodes(b); return s.has(0x416) && s.has(0x20bd) && s.has(0x41) && s.size === 3; }) && /не шрифт/.test(e3), e3);
  const gi = googleIndexFrom(`)]}'\n${fx('google-metadata.json').toString('utf8')}`);
  const giT = gi.find((f) => f.family === 'Inter Tight');
  check('метаданные Google: разбор, подмножества без menu, веса, isOpenSource', gi.length === 10 && giT && giT.weights.join() === '600' && !giT.subsets.includes('menu') && gi.find((f) => f.family === 'Closedfont').open === false && gi.find((f) => f.family === 'Unbounded').category === 'display');
  check('nearestWeight: переменный — сам вес, статичный — ближайший', nearestWeight({ wght: [100, 900], weights: [400, 700] }, 650) === 650 && nearestWeight({ wght: null, weights: [400, 700] }, 600) === 700 && nearestWeight({ wght: null, weights: [300, 500] }, 400) === 500);
  const fs1 = parseFamilySpec('google:Inter Tight:700'), fs2 = parseFamilySpec('Oswald:500'), fs3 = parseFamilySpec('PT Serif');
  check('parseFamilySpec: источник, семейство, вес', fs1.source === 'google' && fs1.family === 'Inter Tight' && fs1.weight === 700 && fs2.source === null && fs2.family === 'Oswald' && fs2.weight === 500 && fs3.family === 'PT Serif' && !fs3.weight);
  const mA = { xCap: 0.7, widthLc: 0.6, widthUc: 0.8, contrast: 0.8, round: 0.9, stem: 0.17, serif: 1, serifs: false, ends: 1, aperture: 0.3, capEm: 0.72, joAsc: 0.95, cyrDesc: 0.15, advLc: 0.52, advUc: 0.65 };
  const dSame = fontDistance(mA, { ...mA }), dSerif = fontDistance(mA, { ...mA, serifs: true }), dW = fontDistance(mA, { ...mA, widthUc: 0.85 });
  const wUp = metricWeights({ textTransform: 'uppercase' });
  check('fontDistance: то же — 0, другие засечки — +1, разница в разброс — около 0.3; капс — ширина прописных весомее', dSame.d === 0 && dSerif.d === 1 && dW.d > 0.2 && dW.d < 0.5 && fontDistance(mA, { ...mA, widthUc: 0.85 }, wUp).d > dW.d, `${dSame.d} ${dSerif.d} ${dW.d}`);
  const jg = joGap(mA, 0.9), jg1 = joGap(mA, 1.0);
  check('joGap: Й/Ё выше 0.9 кегля — заходит при 0.9, чисто при 1.0', jg.base === -0.05 && jg1.base === 0.05 && jg.tails === -0.2 && joGap({}, 0.9) === null);
  check('trackFor: трекинг — воздух как у образца (капс — по прописным); sizeFor — по высоте прописных', sizeFor({ metrics: mA }, { ...mA, capEm: 0.8 }) === 0.9 && trackFor({ font: { textTransform: 'uppercase', letterSpacingEm: 0 }, metrics: mA }, { ...mA, widthUc: 0.9, advUc: 0.722 }) === 0 && trackFor({ font: { textTransform: 'uppercase', letterSpacingEm: -0.01 }, metrics: mA }, { ...mA, advUc: 0.6 }) === 0.04 && trackFor({ font: { textTransform: 'none', letterSpacingEm: 0 }, metrics: mA }, { ...mA, advLc: 0.55 }) === -0.03);
  const srt = siteRoot(path.join(site2, 'assets', 'x'));
  check('siteRoot: ближайшая папка с index.html вверх', srt && srt.root === site2 && /index\.html/.test(srt.how));
  const gl = charsOf(GLYPHS);
  check('набор знаков кандидата: латиница, 66 букв, ₽№«», все знаки листа', [...CYR_LETTERS, ...'₽№«»AZaz09'].every((ch) => gl.includes(ch)) && charsOf(SHEET.caps + SHEET.lower + SHEET.para + SHEET.jo.join('')).every((ch) => gl.includes(ch)));

  /* 12. числа отрисовки на сохранённых шрифтах (Chrome, один на всё) */
  let browser = null;
  try { browser = await launch(); } catch (e) { console.log(`SKIP числа отрисовки — Chrome не запустился: ${e.message}`); }
  const M = {};
  if (browser) {
    try {
      for (const [n, w] of [['inter-tight-600', 600], ['pt-serif-400', 400], ['playfair-display-400', 400], ['oswald-400', 400], ['unbounded-400', 400], ['comfortaa-400', 400], ['prata-400', 400], ['bebas-neue-400', 400]]) {
        try { M[n] = await measureSample(browser, FX(n), { weight: w }); } catch (e) { M[n] = { error: e.message }; }
      }
    } finally { await browser.close(); }
    const m = (n) => (M[n] && M[n].metrics) || {};
    check('measure: все 8 файлов измерены', Object.values(M).every((x) => x.metrics), Object.entries(M).filter(([, x]) => !x.metrics).map(([k, x]) => `${k}: ${x.error}`).join('; '));
    const serifs = Object.keys(M).filter((n) => m(n).serifs).sort().join();
    check('measure: засечки — ровно у PT Serif, Playfair Display, Prata', serifs === 'playfair-display-400,prata-400,pt-serif-400', serifs);
    check('measure: контраст — дидоны (Playfair, Prata) < 0.35 < PT Serif < 0.7 < гротески', m('playfair-display-400').contrast < 0.35 && m('prata-400').contrast < 0.35 && m('pt-serif-400').contrast > 0.35 && m('pt-serif-400').contrast < 0.7 && ['inter-tight-600', 'oswald-400', 'unbounded-400', 'comfortaa-400'].every((n) => m(n).contrast > 0.7), ['playfair-display-400', 'pt-serif-400', 'inter-tight-600'].map((n) => `${n} ${m(n).contrast}`).join(', '));
    check('measure: ширина прописных Oswald < Inter Tight < Unbounded; круглота O так же', m('oswald-400').widthUc < m('inter-tight-600').widthUc && m('inter-tight-600').widthUc < m('unbounded-400').widthUc && m('oswald-400').round < m('inter-tight-600').round && m('inter-tight-600').round < m('unbounded-400').round, ['oswald-400', 'inter-tight-600', 'unbounded-400'].map((n) => `${m(n).widthUc}/${m(n).round}`).join(' < '));
    check('measure: концы — у Comfortaa скруглённые (< 0.95), у Inter Tight прямые (0.97–1.05)', m('comfortaa-400').ends < 0.95 && m('inter-tight-600').ends >= 0.97 && m('inter-tight-600').ends <= 1.05, `${m('comfortaa-400').ends} / ${m('inter-tight-600').ends}`);
    check('measure: x/cap Inter Tight 0.72–0.78, у Prata ниже 0.68; штрих 600 толще 400', m('inter-tight-600').xCap > 0.72 && m('inter-tight-600').xCap < 0.78 && m('prata-400').xCap < 0.68 && m('inter-tight-600').stem > m('oswald-400').stem);
    check('measure: кириллица файла — 66 у Inter Tight, 0 у Bebas Neue; Й/Ё замерены только с кириллицей', M['inter-tight-600'].cyr.letters === 66 && M['bebas-neue-400'].cyr.letters === 0 && Number.isFinite(m('inter-tight-600').joAsc) && m('bebas-neue-400').joAsc === undefined);
  }

  /* 13. команды measure (адрес), match, sheet, decide — на своём сервере: страница образца, метаданные и CSS2 Google */
  const META = fx('google-metadata.json');
  const famFile = { 'Inter Tight': 'inter-tight-600', 'PT Serif': 'pt-serif-400', 'Playfair Display': 'playfair-display-400', Oswald: 'oswald-400', Unbounded: 'unbounded-400', Comfortaa: 'comfortaa-400', Prata: 'prata-400', 'Bebas Neue': 'bebas-neue-400', Fakecyr: 'bebas-neue-400', Closedfont: 'oswald-400' };
  const hits = { fx: 0, meta: 0, css: 0, lic: 0, fsList: 0, fsCss: [] };
  const fsStyle = (w, it = false) => ({ weight: { number: w + (it ? 1 : 0), name: String(w) }, is_italic: it, is_variable: false, file: '//x' });
  const FS_MOCK = { count: 3, fonts: [
    { name: 'Probe Latin', slug: 'probe-latin', category: 'Sans, Display', license_type: 'itf_ffl', languages: 'English, French, Serbian (Latin)', views: 10, axes: [{ name: 'wght', property: 'wght', range_left: 1, range_right: 1000 }], styles: [fsStyle(400), fsStyle(400, true), fsStyle(700), { weight: { number: 1 }, is_italic: false, is_variable: true }] },
    { name: 'Probe Slab', slug: 'probe-slab', category: 'Slab', license_type: 'itf_ffl', languages: 'English', views: 50, styles: [fsStyle(500)] },
    { name: 'Montserrat', slug: 'montserrat', category: 'Sans', license_type: 'sil_ofl', languages: 'English', views: 99, styles: [fsStyle(400)] },
  ] };
  const page = (file, css) => `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:"Probe Sans";src:url(/fx/${file}.woff2) format("woff2");font-weight:100 900}h1{font-family:"Probe Sans",sans-serif;font-weight:600;font-size:80px;line-height:.9;letter-spacing:-0.02em;text-transform:uppercase;margin:40px}${css || ''}</style><h1>Hello world</h1>`;
  const srv2 = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
    const base = `http://127.0.0.1:${srv2.address().port}`;
    if (u.pathname === '/meta') { hits.meta++; return send(200, 'application/json', `)]}'\n${META}`); }
    if (u.pathname === '/css2') {
      hits.css++;
      const [fam, axes = ''] = String(u.searchParams.get('family') || '').split(':');
      const f = famFile[fam]; if (!f) return send(400, 'text/html', 'no');
      return send(200, 'text/css; charset=utf-8', `@font-face {\n  font-family: '${fam}';\n  font-style: normal;\n  font-weight: ${(/@(\d+)/.exec(axes) || [0, 400])[1]};\n  src: url(${base}/fx/${f}.woff2) format('woff2');\n}\n`);
    }
    const m2 = /^\/fx\/([\w-]+)\.woff2$/.exec(u.pathname);
    if (m2 && fs.existsSync(FX(m2[1]))) { hits.fx++; return send(200, 'font/woff2', fs.readFileSync(FX(m2[1]))); }
    if (u.pathname === '/page') return send(200, 'text/html; charset=utf-8', page('inter-tight-600'));
    if (u.pathname === '/page-bebas') return send(200, 'text/html; charset=utf-8', page('bebas-neue-400'));
    if (u.pathname === '/lic/ofl/intertight/OFL.txt') { hits.lic++; return send(200, 'text/plain', 'SIL OPEN FONT LICENSE'); }
    /* имитация Fontshare: список, CSS по «slug@вес» (курсив — вес +1), адрес файла без схемы, как у cdn.fontshare.com */
    if (u.pathname === '/fs/fonts') { hits.fsList++; return send(200, 'application/json', JSON.stringify(FS_MOCK)); }
    if (u.pathname === '/fs/css') {
      const [slug, code] = String(u.searchParams.get('f[]') || '').split('@'); hits.fsCss.push(`${slug}@${code}`);
      const fam = FS_MOCK.fonts.find((f) => f.slug === slug); const n = Number(code);
      if (!fam || !fam.styles.some((st) => st.weight.number === n && st.is_italic === (n % 100 === 1))) return send(200, 'text/css', '');
      return send(200, 'text/css; charset=utf-8', `/* ${fam.name} */\n@font-face {\n  font-family: '${fam.name}';\n  src: url('//127.0.0.1:${srv2.address().port}/fx/bebas-neue-400.woff2') format('woff2'),\n       url('//127.0.0.1:${srv2.address().port}/fx/bebas-neue-400.woff') format('woff');\n  font-weight: ${n % 100 === 1 ? n - 1 : n};\n  font-display: swap;\n  font-style: ${n % 100 === 1 ? 'italic' : 'normal'};\n}\n`);
    }
    return send(404, 'text/plain', 'not found');
  });
  await new Promise((r) => srv2.listen(0, '127.0.0.1', r));
  const B = `http://127.0.0.1:${srv2.address().port}`;
  /* реестр — настоящий sources.json, у Fontshare адреса подменены на свой сервер */
  const regReal = JSON.parse(fs.readFileSync(path.join(HERE, 'fonts', 'sources.json'), 'utf8'));
  const fsReal = regReal.sources.find((x) => x.id === 'fontshare');
  if (fsReal) { fsReal.list.url = `${B}/fs/fonts`; fsReal.files.url = `${B}/fs/css?f[]={slug}@{weight}&display=swap`; fsReal.files.fileHosts = [B]; }
  const regTest = path.join(tmp, 'sources-real.json');
  fs.writeFileSync(regTest, JSON.stringify(regReal));
  const env2 = { FONTS_API_BASE: B, FONTS_META_URL: `${B}/meta`, FONTS_LICENSE_BASE: `${B}/lic`, FONTS_CACHE_DIR: path.join(tmp, 'кэш'), FONTS_SOURCES: regTest };
  const runDir2 = path.join(tmp, 'прогон');
  try {
    c = await run(['measure', `${B}/page`, '--selector', 'h1', '--run', runDir2], env2);
    const smp = (() => { try { return JSON.parse(fs.readFileSync(path.join(runDir2, 'fonts', 'sample.json'), 'utf8')); } catch { return null; } })();
    const fileM = browser && M['inter-tight-600'] ? M['inter-tight-600'].metrics : null;
    const same = smp && fileM && ['xCap', 'widthUc', 'contrast', 'round', 'stem'].every((k) => Math.abs(smp.metrics[k] - fileM[k]) <= 0.01);
    check('measure <адрес>: шрифт элемента, вес, трекинг, регистр, интерлиньяж; числа = числа файла', c.code === 0 && !!smp && smp.font.family === 'Probe Sans' && smp.font.weight === 600 && smp.font.letterSpacingEm === -0.02 && smp.font.textTransform === 'uppercase' && smp.font.lineHeight === 0.9 && smp.cyr.letters === 66 && (same || !fileM), smp ? `${smp.font.family} ${smp.font.weight} ${smp.font.letterSpacingEm} ${smp.font.textTransform}; ${['xCap', 'widthUc', 'contrast'].map((k) => `${k} ${smp.metrics[k]}${fileM ? `/${fileM[k]}` : ''}`).join(', ')}` : c.out.trim().split('\n').pop());
    check('measure <адрес>: полоса образца для листа (PNG)', !!smp && !!smp.strip && fs.existsSync(path.join(runDir2, 'fonts', smp.strip)) && fs.readFileSync(path.join(runDir2, 'fonts', smp.strip)).toString('latin1', 1, 4) === 'PNG');
    c = await run(['measure', `${B}/page-bebas`, '--out', path.join(tmp, 'bebas.json')], env2);
    check('measure <адрес>: латинский шрифт без кириллицы — «кириллицы нет», протокол записан', c.code === 0 && /кириллицы нет/.test(c.out) && fs.existsSync(path.join(tmp, 'bebas.json')), c.out.trim().split('\n').pop());
    c = await run(['measure', path.join(tmp, 'нет.woff2')], env2);
    check('measure: нет файла — код 1', c.code === 1 && /нет файла шрифта/.test(c.out));

    c = await run(['match', path.join(runDir2, 'fonts', 'sample.json'), '--n', '5'], env2);
    const mj = (() => { try { return JSON.parse(fs.readFileSync(path.join(runDir2, 'fonts', 'match.json'), 'utf8')); } catch { return null; } })();
    const order = mj ? mj.ranked.map((r) => r.family) : [];
    check('match: образец сам себе первый (d 0), таблица и команды sheet/decide', c.code === 0 && !!mj && mj.top[0].family === 'Inter Tight' && mj.top[0].d === 0 && /^1\s+Inter Tight\s+600\s+0\.00/m.test(c.out) && /fonts\.mjs sheet /.test(c.out) && /fonts\.mjs decide "Inter Tight"/.test(c.out), order.join(', '));
    check('match: гротески выше антикв (засечки — штраф): PT Serif последний', order.length === 5 && order.indexOf('PT Serif') === 4, order.join(', '));
    const rj = mj ? mj.rejected : [];
    check('match: отсев назван — нет кириллицы в файле (Fakecyr), нет № (Prata) и ₽ (Playfair), лицензия (Closedfont); Bebas и 2 шрифта Fontshare — без кириллицы по данным', rj.some((r) => r.family === 'Fakecyr' && /кириллицы нет в файле/.test(r.why)) && rj.some((r) => r.family === 'Prata' && /нет знаков №/.test(r.why)) && rj.some((r) => r.family === 'Playfair Display' && /нет знаков ₽/.test(r.why)) && rj.some((r) => r.family === 'Closedfont' && /лицензия/.test(r.why)) && /без кириллицы по данным источника — 3 /.test(c.out) && /Отсев/.test(c.out) && !order.includes('Prata'), rj.map((r) => `${r.family}: ${r.why}`).join('; '));
    const fx1 = hits.fx;
    c = await run(['match', path.join(runDir2, 'fonts', 'sample.json'), '--n', '5'], env2);
    check('match повторно: файлы и числа из кэша (ни одного скачивания)', c.code === 0 && hits.fx === fx1, `скачиваний во втором прогоне: ${hits.fx - fx1}`);
    c = await run(['match', path.join(runDir2, 'fonts', 'sample.json'), '--sources', 'adobe'], env2);
    check('match --sources adobe: выключенный источник (Adobe Fonts) — WARN с причиной', /WARN: источник adobe выключен/.test(c.out) && /свои файлы на сервере запрещены/.test(c.out), c.out.trim().split('\n').pop());
    check('match: Fontshare в подборе по умолчанию — список взят, шрифты ITF без кириллицы не качаются', /источник Fontshare .*взято 2 из 3 .*с кириллицей по данным 0/.test(c.out = (await run(['match', path.join(runDir2, 'fonts', 'sample.json'), '--n', '5'], env2)).out) && !hits.fsCss.length, (c.out.match(/источник Fontshare[^\n]*/) || ['нет строки'])[0]);

    /* Fontshare: список, подбор --latin, get как есть (отдельный прогон — match.json Google не трогать) */
    const fsIdx = fontshareIndexFrom(FS_MOCK);
    const pl = fsIdx.find((f) => f.family === 'Probe Latin'), ps = fsIdx.find((f) => f.family === 'Probe Slab');
    check('fontshare: список — категория, веса без переменного, курсив +1, ось справкой, кириллица по languages («Serbian (Latin)» — не она)', !!pl && pl.category === 'sans-serif' && pl.cls.includes('display') && pl.weights.join() === '400,700' && pl.italicWeights.join() === '400' && pl.wght === null && pl.axis.join() === '1,1000' && pl.cyr === false && ps.category === 'serif' && ps.stroke === 'slab serif' && pl.popularity === 3, JSON.stringify(pl));
    const runFs = path.join(tmp, 'прогон-fs'); ensureDir(path.join(runFs, 'fonts'));
    fs.copyFileSync(path.join(runDir2, 'fonts', 'sample.json'), path.join(runFs, 'fonts', 'sample.json'));
    c = await run(['match', path.join(runFs, 'fonts', 'sample.json'), '--sources', 'fontshare'], env2);
    check('match --sources fontshare без --latin: кандидатов нет (кириллицы нет), WARN', c.code === 0 && /WARN: кандидатов с кириллицей нет/.test(c.out), c.out.trim().split('\n').pop());
    c = await run(['match', path.join(runFs, 'fonts', 'sample.json'), '--sources', 'fontshare', '--latin'], env2);
    const mfs = (() => { try { return JSON.parse(fs.readFileSync(path.join(runFs, 'fonts', 'match.json'), 'utf8')); } catch { return null; } })();
    check('match --latin: шрифты ITF меряются, лицензия ITF FFL 2.0, OFL-дубль Google (Montserrat) не взят, decide с «fontshare:»', c.code === 0 && !!mfs && mfs.latin === true && mfs.ranked.length === 2 && mfs.ranked.every((r) => r.source === 'fontshare' && r.license === 'ITF Free Font License 2.0') && !mfs.ranked.some((r) => r.family === 'Montserrat') && /decide "fontshare:Probe/.test(c.out), mfs ? mfs.ranked.map((r) => `${r.family} ${r.weight}`).join(', ') : c.out.trim().split('\n').pop());
    c = await run(['decide', 'fontshare:Probe Latin', '--run', runFs, '--why', 'латинский логотип'], env2);
    const dfs = (() => { try { return JSON.parse(fs.readFileSync(path.join(runFs, 'fonts', 'decision.json'), 'utf8')); } catch { return null; } })();
    check('decide fontshare: условия лицензии и команда get с --latin', c.code === 0 && !!dfs && dfs.choice.source.id === 'fontshare' && dfs.terms && dfs.terms.length === 4 && /get "fontshare:Probe Latin" --weights 400(,700)? --latin/.test(dfs.next) && /условие лицензии: ITF FFL §02/.test(c.out), dfs ? dfs.next : c.out.trim().split('\n').pop());
    const siteFs = path.join(tmp, 'сайт-fs'); ensureDir(siteFs); fs.writeFileSync(path.join(siteFs, 'index.html'), '');
    c = await run(['get', 'fontshare:Probe Latin', '--out', siteFs], env2);
    check('get fontshare без --latin: нет кириллицы — код 2, ничего не записано', c.code === 2 && /нет кириллицы/.test(c.out) && /--latin/.test(c.out) && !fs.existsSync(path.join(siteFs, 'fonts')), c.out.trim().split('\n').pop());
    c = await run(['get', 'fontshare:Probe Latin', '--latin', '--text', 'VANTA', '--out', siteFs], env2);
    check('get fontshare --text: подмножества запрещены ITF FFL — код 2', c.code === 2 && /подмножества и переделка файлов запрещены/.test(c.out) && !fs.existsSync(path.join(siteFs, 'fonts')), c.out.trim().split('\n').pop());
    c = await run(['get', 'fontshare:Probe Latin', '--latin', '--weights', '400', '--italic', '--out', siteFs], env2);
    const cssFs = (() => { try { return fs.readFileSync(path.join(siteFs, 'fonts', 'fonts.css'), 'utf8'); } catch { return ''; } })();
    const fsFiles = fs.existsSync(path.join(siteFs, 'fonts')) ? fs.readdirSync(path.join(siteFs, 'fonts')).filter((n) => n.endsWith('.woff2')).sort() : [];
    check('get fontshare --latin --italic: файлы как есть (курсив — вес 401), условия лицензии в fonts.css и выводе, путь от корня', c.code === 0 && fsFiles.join() === 'probe-latin-400-italic.woff2,probe-latin-400.woff2' && fs.readFileSync(path.join(siteFs, 'fonts', 'probe-latin-400.woff2')).equals(fs.readFileSync(FX('bebas-neue-400'))) && hits.fsCss.includes('probe-latin@401') && /ITF Free Font License 2\.0 \(https:\/\/www\.fontshare\.com\/licenses\/itf-ffl\)/.test(cssFs) && /ITF FFL §02: передавать файлы другим нельзя/.test(cssFs) && /только латиница/.test(cssFs) && !/unicode-range/.test(cssFs) && /rel="preload" href="\/fonts\/probe-latin-400\.woff2"/.test(c.out) && /^Условие лицензии: ITF FFL §02/m.test(c.out), `${fsFiles.join(', ')}; ${c.out.trim().split('\n').pop()}`);
    c = await run(['get', 'fontshare:Probe Latin', '--latin', '--weights', '500', '--out', siteFs], env2);
    check('get fontshare: нет веса — код 1 с весами источника', c.code === 1 && /нет веса 500: есть 400, 700/.test(c.out), c.out.trim().split('\n').pop());
    c = await run(['get', 'adobe:Acumin Pro', '--out', siteFs], env2);
    check('get adobe: источник выключен — код 2 с причиной', c.code === 2 && /Adobe Fonts выключен/.test(c.out) && /use\.typekit\.net/.test(c.out), c.out.trim().split('\n').pop());
    c = await run(['match', path.join(tmp, 'нет.json')], env2);
    check('match без протокола — код 1', c.code === 1 && /не прочитан/.test(c.out));

    /* свой источник: файлы из реестра (direct), источник без веба — отсев целиком */
    const reg2 = path.join(tmp, 'sources.json');
    fs.writeFileSync(reg2, JSON.stringify({ sources: [
      { id: 'local', name: 'Локальные файлы', enabled: true, list: { kind: 'inline' }, files: { kind: 'direct' }, license: { default: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org' }, web: true, selfHost: true, families: [{ family: 'Oswald', files: { 400: FX('oswald-400') } }, { family: 'Unbounded', files: { 400: FX('unbounded-400') } }, { family: 'Comfortaa', files: { 400: FX('comfortaa-400') } }] },
      { id: 'closed', name: 'Закрытый', enabled: true, list: { kind: 'inline' }, files: { kind: 'direct' }, license: { default: 'проприетарная' }, web: false, selfHost: false, families: [{ family: 'Prata', files: { 400: FX('prata-400') } }] },
    ] }));
    c = await run(['match', path.join(runDir2, 'fonts', 'sample.json'), '--sources', 'local,closed', '--n', '3'], { ...env2, FONTS_SOURCES: reg2 });
    check('match: свой источник (файлы из реестра) меряется; источник без веба — в отсеве целиком', c.code === 0 && /Локальные файлы/.test(c.out) && /^1\s+(Comfortaa|Oswald|Unbounded)/m.test(c.out) && /весь источник Закрытый/.test(c.out), c.out.trim().split('\n').pop());
    c = await run(['measure', 'local:Unbounded', '--out', path.join(tmp, 'unb.json')], { ...env2, FONTS_SOURCES: reg2 });
    check('measure «источник:Семейство» — из своего источника', c.code === 0 && /образец: Unbounded 400/.test(c.out), c.out.trim().split('\n')[0]);
    /* match.json мог перезаписаться своим источником — вернуть Google */
    await run(['match', path.join(runDir2, 'fonts', 'sample.json'), '--n', '5'], env2);

    c = await run(['sheet', path.join(runDir2, 'fonts', 'sample.json')], env2);
    const png = path.join(runDir2, 'fonts', 'sheet.png');
    const pb = fs.existsSync(png) ? fs.readFileSync(png) : null;
    const pw = pb ? pb.readUInt32BE(16) : 0, ph = pb ? pb.readUInt32BE(20) : 0;
    check('sheet: лист PNG — образец и 5 кандидатов из match.json, зазор Й/Ё строкой', c.code === 0 && pw === 1400 && ph > 1500 && /кандидатов 5/.test(c.out) && /Й\/Ё при line-height 0\.9 заходят на строку выше/.test(c.out), `${pw}×${ph}; ${c.out.trim().split('\n').pop()}`);
    c = await run(['sheet', path.join(runDir2, 'fonts', 'sample.json'), 'Oswald', 'google:PT Serif:400', 'Нетакого', '--out', path.join(tmp, 'лист.png')], env2);
    check('sheet: кандидаты именами, неизвестное — WARN, --out', c.code === 0 && fs.existsSync(path.join(tmp, 'лист.png')) && /кандидатов 2/.test(c.out) && /WARN: «Нетакого» нет в источниках/.test(c.out), c.out.trim().split('\n').pop());

    c = await run(['decide', 'Inter Tight', '--run', runDir2], env2);
    check('decide без --why — код 1', c.code === 1 && /--why/.test(c.out));
    c = await run(['decide', 'Inter Tight', '--run', runDir2, '--why', 'ближе всех по числам, на листе Ж и Й ровные'], env2);
    const dj = (() => { try { return JSON.parse(fs.readFileSync(path.join(runDir2, 'fonts', 'decision.json'), 'utf8')); } catch { return null; } })();
    check('decide: decision.json — выбор, место, расстояние, источник, лицензия по google/fonts, образец, кандидаты, почему, get', c.code === 0 && !!dj && dj.choice.family === 'Inter Tight' && dj.choice.weight === 600 && dj.choice.rank === 1 && dj.choice.d === 0 && dj.choice.source.id === 'google' && dj.choice.license.name === 'SIL Open Font License 1.1' && /google\/fonts/.test(dj.choice.license.checked || '') && hits.lic === 1 && dj.sample.family === 'Probe Sans' && dj.candidates.length === 5 && /ближе всех/.test(dj.why) && /get "Inter Tight" --weights 400,600/.test(dj.next) && !!dj.sheet, dj ? `${dj.choice.family} ${dj.choice.weight}, место ${dj.choice.rank}, ${dj.choice.license.name}` : c.out.trim().split('\n').pop());
  } finally { srv2.close(); }

  const bad = checks.filter((x) => !x).length;
  console.log(`${bad ? 'FAIL' : 'OK'}: прошло ${checks.length - bad} из ${checks.length}${bad ? ` · не прошло ${bad} · стенд оставлен: ${tmp}` : ''}`);
  if (!bad) fs.rmSync(tmp, { recursive: true, force: true });
  return bad ? 1 : 0;
}

/* ---------- запуск ---------- */

const ALLOWED = { measure: ['selector', 'weight', 'run', 'out', 'refresh'], match: ['sources', 'n', 'category', 'need', 'refresh', 'latin'], sheet: ['out', 'n'], decide: ['run', 'why', 'source', 'weight'], pick: ['category', 'like', 'need', 'weights', 'italic', 'variable', 'n'], pairs: [], get: ['weights', 'italic', 'subsets', 'text', 'need', 'out', 'root', 'latin', 'source'], selftest: [] };
const cmd = opt.selftest ? 'selftest' : pos.shift();
try {
  for (const k of VALUE_FLAGS) if (opt[k] === true) throw new Fail(`--${k} без значения (-h — справка)`);
  if (cmd && ALLOWED[cmd]) for (const k of Object.keys(opt)) if (!ALLOWED[cmd].includes(k) && k !== 'selftest') console.log(`WARN: --${k} к команде ${cmd} не относится — не используется`);
  if (cmd === 'selftest') process.exit(await selftest());
  if (cmd === 'measure') process.exit(await cmdMeasure());
  if (cmd === 'match') process.exit(await cmdMatch());
  if (cmd === 'sheet') process.exit(await cmdSheet());
  if (cmd === 'decide') process.exit(await cmdDecide());
  if (cmd === 'pick') process.exit(cmdPick());
  if (cmd === 'pairs') process.exit(cmdPairs());
  if (cmd === 'get') process.exit(await cmdGet());
  if (!cmd) { console.log(HELP); process.exit(1); }
  throw new Fail(`не знаю команду «${cmd}» — measure, match, sheet, decide, pick, pairs, get или selftest (-h — справка)`);
} catch (e) {
  if (e instanceof Fail) { console.error(`FAIL: ${e.message}`); process.exit(e.code); }
  throw e;
}
