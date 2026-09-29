#!/usr/bin/env node
/**
 * Фото и видео по свободным лицензиям для сайтов клиентов: найти в законных
 * источниках, посмотреть глазами на листе-контакте, подготовить выбранный кадр,
 * записать автора и лицензию.
 *
 * Pinterest — только доска настроения: снять глазами, описать словами (свет,
 * палитра, крупность плана, зерно, что в кадре и чего нет) и искать здесь по
 * этим словам. С Pinterest на сайт не попадает ни один файл.
 *
 *   node media.mjs doctor
 *       ключи (только имена), доступность источников (с запасным DoH), sharp, ffmpeg.
 *       Без MEDIA_CONTACT Commons, копии Commons и AIC не пробуются (SKIP).
 *       Итог: OK — все пробы ответили и все ключи заданы; WARN — часть проб не прошла
 *       (временно) и/или не заданы ключи (отдельный WARN перечисляет их и что без них
 *       недоступно; без MEDIA_CONTACT — спросить контакт у пользователя); FAIL — нет sharp.
 *       Код 1 только без sharp, иначе 0.
 *
 *   node media.mjs search "<запрос по-английски>" --kind photo|video
 *       [--profile photo|art]            photo — заведения, магазины, школы (по умолчанию);
 *                                        art — произведения из общественного достояния (музеи)
 *       [--role hero|section|card|loop]  под что кадр: от роли зависит нужный размер
 *                                        (hero 3840, section 2560, card 1280, loop 1920)
 *       [--orient landscape|portrait|square|any]  по умолчанию landscape для ролей hero и card и
 *                                        для видео (карточка 1000×700 из вертикального кадра —
 *                                        одна середина), без отбора — у section; any — не отбирать
 *       [--min <px по длинной стороне>]
 *       [--sources a,b,...]              свой список и порядок источников
 *       [--n 24]                         сколько кадров на лист (до 60)
 *       [--frames 8|all]                 видео Commons: у скольких роликов собрать кадры из
 *                                        середины (2–4 с на кадр, строго по одному; по умолчанию 8)
 *       [--out <папка>] [--run <slug, url сайта или полный путь папки прогона>]
 *       [--fresh (без кэша ответов API)]
 *     → <папка>/cand/NN.jpg, sheet-1.jpg…, manifest.json (пути относительно папки).
 *       По умолчанию <папка> = ~/.claude/site-rework/runs/<slug>/media/<запрос>
 *       (или SITE_REWORK_RUNS/<slug>/…); <slug> из адреса — как у остальных скриптов
 *       (lib.slugFromUrl: http://localhost:4177/ → localhost-4177, путь страницы входит).
 *       Папки создаются только после проверки всех аргументов.
 *       На листе: номер, источник, РЕАЛЬНЫЙ размер файла, который скачается
 *       под роль («из N» — если оригинал больше), лицензия, пометки (people?
 *       brand? text-or-currency? art? ai? term? small); у видео — длительность,
 *       размер и вес файла. Лист ОБЯЗАТЕЛЬНО открыть глазами (Read): пометки по
 *       словам пропускают чужие ценники и вывески. Марка в запросе («aperol spritz») —
 *       WARN: выдача — это бокалы с её логотипом; brand? у марок ставится и тогда.
 *
 *   node media.mjs pick <папка поиска> <N> --seen "<что на кадре>" --caption "<подпись/роль>"
 *       [--ok-flags]                     кадр с пометками берётся только с этим флагом
 *       [--role hero|section|card|loop] [--name <имя файлов>] [--dest <папка картинок сайта>]
 *       [--look none|duotone:#RRGGBB,#RRGGBB|mono] [--contrast 0..1] [--grain 0..0.06]
 *       [--crop-mobile 4:5]              отдельный кадр для телефона
 *       [--ratio 16:9]                   обрезать основной кадр
 *       [--src-prefix img/]              префикс путей в разметке (по умолчанию имя --dest)
 *       [--avif auto|on|off]             AVIF рядом с WebP (auto — если быстро)
 *       [--start <с>] [--dur <с>]        видео: откуда и сколько резать петлю (по умолчанию 8 с)
 *       [--fade <с>]                     видео: длина наплыва на стыке (по умолчанию 1 с)
 *       [--need <px>]                    ширина кадра, нужная сайту (с учётом плотности экрана):
 *                                        замечание «не хватает» — от неё, а не от верха роли
 *                                        (hero 3840); больше верха роли — лестница с неё
 *       [--focus attention|entropy|centre|north|south|east|west|…]  куда тянуть обрезку
 *                                        (--size, --thumb, --ratio, --crop-mobile); по умолчанию attention
 *     Под формат проекта (точный режим) — один файл под заданным именем вместо лестницы ширин:
 *       --size WxH                       обрезка cover ровно под WxH (1000x700), по --focus
 *       [--thumb WxH]                    превью (360x360) — из исходника, качество на 4 ниже
 *       [--thumb-dir thumb]              папка превью внутри --dest (по умолчанию thumb)
 *       [--name <файл>]                  точное имя файла (dish-bokal-vina.jpg; без расширения —
 *                                        расширение формата); прежний файл заменяется, печатается «было»
 *       [--format jpg|webp|avif]         по умолчанию — по расширению --name, иначе jpg
 *       [--quality N]                    1–100 (по умолчанию jpg 80, webp 76, avif 52)
 *       Не растягивает: исходник меньше WxH — меньший кадр той же пропорции и замечание. Файл
 *       скачивается под обрезку (у вертикального кадра под 1000x700 — 1000 в ширину). Разметка —
 *       один <img>; строка «для карты фото проекта» — JSON записи (file, title, author, license,
 *       page, source, author_url). Кадр Unsplash из API и видео — без --size (код 2).
 *     Ворота: без --seen/--caption, --seen меньше трёх разных слов (точки, повторы
 *     не проходят), кадр с пометками без --ok-flags — код 2. Никогда не
 *     растягивает; размер меряется по скачанному файлу. Пишет credits.json в
 *     папку назначения и печатает готовую разметку. В папке уже лежит credits.json проекта
 *     в своём виде (не массив записей media.mjs) — он не трогается, учёт идёт в credits-media.json.
 *     Тот же кадр (источник и id или страница) уже стоит под другим именем — в credits.json
 *     (своём или проекта) или в отметках pick этого поиска — WARN «кадр уже использован как <имя>».
 *     Unsplash: файл не пережимается, разметка — по их ссылкам (правило API).
 *
 *   node media.mjs import <url страницы> [<url или путь файла>] --license <id>
 *       [--author "…"] [--author-url …] [--title "…"] [--not-editorial]
 *       [--file-url <адрес файла у источника>]  для локального файла: откуда он (в credits.json)
 *       --seen … --caption … [и все флаги обработки pick: --ok-flags --role --name
 *       --dest --look --contrast --grain --crop-mobile --ratio --src-prefix --avif
 *       --start --dur --need --focus; точный режим --size --thumb --thumb-dir --format --quality]
 *       [--run <slug, url сайта или папка прогона — как у search>]
 *     Кадр выбрал человек на сайте без API (Kaboompics, Burst, Picjumbo,
 *     Foodiesfeed — только /legacy/ и /uploads/: у локального файла обязателен
 *     --file-url, иначе не видно, не нейросеть ли это; Mixkit — поштучно, файл
 *     должен быть того же ролика, что страница; Adobe Stock Free).
 *     Лицензии: cc0 pdm unsplash pexels pixabay kaboompics burst picjumbo
 *     foodiesfeed mixkit-free adobe-stock-free. Kaboompics — только с
 *     --not-editorial; unsplash, kaboompics, adobe-stock-free — только файл,
 *     скачанный человеком (путь). Mixkit: без файла ролик берётся со страницы,
 *     если на ней data-license="videoFree".
 *
 *   node media.mjs credits <папка картинок сайта> [--md [<файл или папка>]]
 *     таблица авторов и лицензий (--md — записать CREDITS.md: без значения — рядом
 *     с credits.json, папка — CREDITS.md в ней), строка для
 *     подвала: обязательная (CC BY/BY-SA, Unsplash из API) или вежливая (Pexels,
 *     Unsplash через import, музеи). Рядом с credits.json проекта — из credits-media.json.
 *
 *   node media.mjs audit <карта фото.json> (или --map <карта>) [--root <папка сайта>] [--sources pexels,unsplash]
 *       [--out <файл.json или папка>]
 *     Источники и лицензии по карте фото проекта (photo-map.json, credits.json media.mjs или
 *     проекта — любые записи с file/name и license/page/author/text), только чтение. Отмечает:
 *     Commons; CC BY и BY-SA — подпись обязательна (BY-SA: обрезанный кадр — на тех же условиях);
 *     NC и ND — FAIL (сайт коммерческий, обрезка — изменение); без лицензии — WARN; один кадр
 *     (source_id, страница) под разными файлами; одинаковые файлы (sha256); марки в названии и
 *     описании (Guinness, Aperol, Moët, Pizza Hut, Domino's, Nando's…); нет файла.
 *     --root — откуда считать пути вида /assets/img/…: по умолчанию ищется сам (папка карты,
 *     выше, их public/). --sources — какие источники разрешены («всё с Pexels»): кадр другого
 *     источника — FAIL. --out — протокол JSON (verdict, records, groups). Код 1 — FAIL.
 *
 *   Видео (--kind video): источники pexels → pixabay (ключи) → commons → mixkit (одна
 *     страница выдачи на запрос, лицензия videoFree проверяется в pick). По умолчанию
 *     горизонтальные ролики. pick режет петлю без шва (наплыв), убирает звук, делает
 *     1920x1080 H.264 + VP9, телефон 1280x720 и вертикальный 720x1280 (или меньше —
 *     не растягивает), постер из кадра стыка; бюджет 2.5 МБ десктоп / 1 МБ телефон
 *     (иначе CRF +2). Печатает шов петли числом и лист из 4 кадров для глаз
 *     (<папка поиска>/check/<имя>-frames.jpg). 4K на сайт не отдаётся. Нужен ffmpeg.
 *
 *   node media.mjs --selftest [--out <папка>]
 *     без сети: стенд fixtures/media/audit (повтор кадра, одинаковые файлы, марки, CC BY/BY-SA, NC, без
 *     лицензии, без файла), точный режим (--size, --thumb, замена, credits.json проекта), --need, ворота
 *     флагов, марки и ориентация по умолчанию. --out — оставить стенд в этой папке. Код 1 — не прошло.
 *
 *   node media.mjs <команда> --help (или -h, --h) — эта справка, код 0; команда при этом
 *     не выполняется: ни сети, ни файлов.
 *
 *   Флаг со значением, данный без значения (`--role` в конце или перед другим флагом), —
 *   FAIL до любой сети и файлов (search — код 1; pick и import — код 2, как прочие
 *   неверные значения). Исключения: --md у credits (без значения — CREDITS.md рядом),
 *   --seen и --caption (их проверяют ворота pick/import, код 2).
 *
 * Ключи: окружение или ~/.claude/site-rework/.env (образец — .env.example рядом):
 * PEXELS_API_KEY UNSPLASH_ACCESS_KEY PIXABAY_API_KEY SI_API_KEY MEDIA_CONTACT
 * (UNSPLASH_APP_NAME — имя приложения из кабинета Unsplash, идёт в utm ссылок подписи;
 * без него — site_rework, doctor предупреждает). Без ключа источник пропускается.
 * MEDIA_CONTACT — контакт для User-Agent (Wikimedia, AIC); личные данные не подставляются.
 * Без MEDIA_CONTACT к Wikimedia (Commons: фото, видео, копии; Wikidata) и AIC не уходит
 * ни одного запроса: search пропускает commons, commons-unsplash, commons-art, aic и видео
 * commons (SKIP и строка «Commons и AIC пропущены: нет MEDIA_CONTACT — спросить контакт
 * у пользователя и записать в …/.env»), doctor их не пробует, pick кадра Commons/AIC
 * и import файла с их адреса — FAIL, код 1. С контактом — как прежде.
 * Сетевые сбои — временные: «повторить позже». Кэш: MEDIA_CACHE или ~/.claude/site-rework/cache
 * (ответы API, исходники и петли роликов). Проверка сбоя имён: MEDIA_TEST_DNS_FAIL="хост,dns:хост2"
 * («хост» — не находится вовсе, «dns:хост» — молчит только системный DNS, выручает DoH).
 * Видео — модуль media/video.mjs (контракт MEDIA_API.md); MEDIA_VIDEO_MODULE — путь к другому модулю (тесты).
 * Итог каждой команды — строка OK / WARN / FAIL.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSharp, getFfmpeg, parseArgs, ensureDir, runDir, capSlug, trackModule } from './lib.mjs';
import * as net from './media/net.mjs';
import { SOURCES, PROFILES, chooseFile, flagsFor, brandsIn, headersFor, ORIENT, orientFor } from './media/photo.mjs';
import { ROLES, MAX_GRAIN, makePreview, makeMosaic, hamming, buildSheets, processPhoto, processExact, applyLook, unsplashMarkup, cssLook, slugify, kb, mb, parseLook, parseRatio, parseSize, FOCUS, EXACT_FORMATS, exactFormat, orientedSize, headerDims } from './media/process.mjs';
import { readManifest, writeManifest, gate, resolveLicense, LICENSES, saveCredit, readCredits, creditsTarget, usedElsewhere, renderCreditsMd, footerLine, politeLine, creditNeed, unsplashLink } from './media/manifest.mjs';
import { cmdAudit } from './media/audit.mjs';
import { selftest } from './media/selftest.mjs';

/* Значения флагов берутся «как у всех»: следующий аргумент, если он не похож на
   другой флаг. Поэтому `--seen --ok-flags` не съест --ok-flags как описание. */
const FLAGS = ['ok-flags', 'fresh', 'not-editorial', 'help', 'h', 'selftest'];
/* флаги со значением — «optional»: значение берётся, если следующее слово не флаг (проверка «без значения» ниже) */
const OPTIONAL = ['kind', 'profile', 'role', 'orient', 'min', 'sources', 'n', 'frames', 'out', 'run', 'seen', 'caption', 'name', 'dest', 'look', 'contrast', 'grain', 'crop-mobile', 'ratio', 'src-prefix', 'avif', 'start', 'dur', 'fade', 'license', 'author', 'author-url', 'title', 'file-url', 'md',
  'need', 'focus', 'size', 'thumb', 'thumb-dir', 'format', 'quality', 'root', 'map'];
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: FLAGS, optional: OPTIONAL, commands: ['doctor', 'search', 'pick', 'import', 'credits', 'audit'], strict: true });
/* Флаги со значением: без значения (`--role` в конце или перед другим флагом) — ошибка до сети
   и файлов, а не молчаливое «по умолчанию» (`--out` без значения раньше создавал папку «true»).
   --md у credits значение может не иметь; --seen и --caption проверяют ворота (код 2). */
const VALUE_OPTS = ['kind', 'profile', 'role', 'orient', 'min', 'sources', 'n', 'frames', 'out', 'run', 'name', 'dest', 'look', 'contrast', 'grain',
  'crop-mobile', 'ratio', 'src-prefix', 'avif', 'start', 'dur', 'fade', 'license', 'author', 'author-url', 'title', 'file-url',
  'need', 'focus', 'size', 'thumb', 'thumb-dir', 'format', 'quality', 'root', 'map'];
const cmd = pos[0];
const log = (...a) => console.log(...a);
/* код 2 — кадр не взят по воротам или по правилам лицензии; 1 — прочие сбои */
const fail = (msg, code = 1) => { console.error(`FAIL: ${msg}`); process.exit(code); };
const str = (v) => (typeof v === 'string' ? v : '');
const long = (w, h) => Math.max(w || 0, h || 0);
const today = () => new Date().toLocaleDateString('sv-SE'); /* ГГГГ-ММ-ДД по местному времени, не UTC */
const RUNS = process.env.SITE_REWORK_RUNS || path.join(os.homedir(), '.claude', 'site-rework', 'runs');
const PHOTO_SIGS = ['jpeg', 'png', 'webp', 'tiff', 'gif', 'avif'];

function help(code = 0) {
  log(fs.readFileSync(new URL(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, '').trim());
  process.exit(code);
}

/* ---------- видео: точка подключения (контракт — MEDIA_API.md) ---------- */

/*
 *   search(query, opts, ctx) → { items: Candidate[], status: {имя: {state, message}} }
 *   resolve(candidate, opts, ctx) → Resolved (файл под роль, HEAD, проверка лицензии)
 *   encode(resolved, opts, ctx) → { files, poster, markup, changes, warnings, original, cut, budget }
 */
function videoModulePath() {
  return process.env.MEDIA_VIDEO_MODULE ? path.resolve(process.env.MEDIA_VIDEO_MODULE) : fileURLToPath(new URL('./media/video.mjs', import.meta.url));
}
async function loadVideo() {
  const f = videoModulePath();
  if (!fs.existsSync(f)) return null;
  trackModule(f); /* путь вычисляется (MEDIA_VIDEO_MODULE) — версия модуля в generator.deps */
  const m = await import(pathToFileURL(f).href);
  for (const fn of ['search', 'resolve', 'encode']) if (typeof m[fn] !== 'function') throw new Error(`${path.basename(f)} не экспортирует ${fn}() — см. MEDIA_API.md`);
  return m;
}
async function requireVideo() {
  const v = await loadVideo();
  if (!v) fail('Видео-модуль media/video.mjs ещё не подключён (контракт — MEDIA_API.md). Фото работает без него.');
  return v;
}
function makeCtx(sharp) {
  return {
    net, sharp, ffmpeg: getFfmpeg(), cacheDir: net.CACHE_DIR, log, ROLES,
    flagsFor, slugify, cssLook, parseLook, parseRatio, MAX_GRAIN,
    /** Постер той же обработкой, что фото: → { data, info } (сырые пиксели). */
    applyLook: (input, o) => applyLook(sharp, input, o),
  };
}
/** resolve/encode видео: отказ по существу — код 2, сеть — временно, код 1. */
async function videoStep(fn, what) {
  try { return await fn(); } catch (e) {
    if (e && e.refuse) fail(`${what}: ${e.message}`, 2);
    fail(`${what}: ${net.describeError(e)}`);
  }
}

/* ---------- вспомогательное ---------- */

function requireFfmpeg() {
  if (!getFfmpeg()) fail('WARN: ffmpeg не найден — видео не пережать, ролик не берём. Поставить: npm i ffmpeg-static --prefix ~/.claude/site-rework');
}
/** Исходник, отрезок, бюджет, шов и кадры для глаз — после кодирования ролика. */
function printVideoFacts(enc) {
  const o = enc.original || {}; const cut = enc.cut || {};
  log(`  исходник: ${o.width}x${o.height}${o.fps ? `, ${o.fps} к/с` : ''}${o.duration ? `, ${Math.round(o.duration)} с` : ''}${o.codec ? `, ${o.codec}` : ''}${o.bytes ? `, ${mb(o.bytes)}` : ''}; петля ${cut.dur} с с ${cut.start} с, наплыв ${cut.fade} с`);
  const s = enc.checks?.seam;
  if (s) log(`  шов петли: ${s.ok ? 'OK' : 'WARN'} — последний кадр отличается от первого на ${s.last_vs_first} (соседние кадры — на ${s.next_vs_first}; шкала 0–255)`);
  if (enc.checks?.frames_sheet) {
    log(`  ОТКРЫТЬ ГЛАЗАМИ (Read) четыре кадра петли: ${enc.checks.frames_sheet}`);
    log('    лица, надписи, логотипы, чужие телефоны; кадр 4 — середина наплыва: две полупрозрачные копии предмета значат, что камера движется и петля секунду «двоит» — тогда --fade 0.4, другой --start/--dur или ролик со статичной камерой');
  }
}
function requireSharp() {
  const sharp = loadSharp();
  if (!sharp) fail('Нужен sharp: npm i sharp --prefix ~/.claude/site-rework (или запускать из проекта, где он установлен).');
  return sharp;
}
/** Убрать из манифеста служебное, абсолютные пути и возможные секреты в адресах. */
function sanitizeCand(c) {
  const { text, extraFlags, _buf, _err, previewFile, ...rest } = c;
  return JSON.parse(JSON.stringify(rest).replace(/([?&](?:key|api_key|client_id|access_key|token)=)[^&"\\]+/gi, '$1***'));
}
/**
 * Папка прогона для --run: адрес сайта — папка как у остальных скриптов (lib.runDir и slugFromUrl:
 * http://localhost:4177/ → localhost-4177, путь страницы входит в имя, не длиннее 60 знаков — длинное
 * имя получает хеш, иначе sharp и ffmpeg падали на пути длиннее 260; прежняя папка под полным
 * именем берётся с WARN); полный путь — сама папка; иначе — slug (готовый — тоже до 60 знаков с
 * хешем; без --run — «media», как раньше). Только вычисляет, ничего не создаёт.
 */
function runBase() {
  const run = str(opt.run).trim();
  if (!run) return path.join(RUNS, slugify('_media', 60));
  if (/^(https?|file):\/\//i.test(run)) {
    try { return runDir({}, run); } catch { fail(`--run ${run}: не разобрать адрес`); }
  }
  if (path.isAbsolute(run)) return path.resolve(run);
  /* готовый slug (как печатают discover и shots) — по тому же пределу, что у адреса (capSlug): имя
     до 60 знаков прежнее, длиннее — начало и хеш, как папка, которую для этого адреса создали скрипты */
  return path.join(RUNS, /^[a-z0-9-]+$/i.test(run) ? capSlug(slugify(run, 200)) : slugify(run, 60));
}
function searchDir(q, kind, profile) {
  if (opt.out) return path.resolve(String(opt.out));
  const suffix = kind === 'video' ? '-video' : profile === 'art' ? '-art' : '';
  return path.join(runBase(), 'media', `${slugify(q, 60)}${suffix}`);
}
/** Флаги со значением, данные без значения, — FAIL до сети и файлов. */
function checkValueOpts(code = 1) {
  const bad = VALUE_OPTS.filter((k) => opt[k] === true);
  if (bad.length) fail(`${bad.map((k) => `--${k}`).join(', ')} без значения — см. node media.mjs --help`, code);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const splitList = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

/* ---------- doctor ---------- */

async function cmdDoctor() {
  net.loadEnv();
  log(`media.mjs doctor · node ${process.version}`);
  log(`\nКлючи (окружение и ${net.ENV_FILE}: ${net.envFileExists() ? 'файл есть' : 'файла нет'}; значения не печатаются):`);
  const uses = { PEXELS_API_KEY: 'pexels (фото, видео)', UNSPLASH_ACCESS_KEY: 'unsplash', PIXABAY_API_KEY: 'pixabay (фото ≤1280, видео)', SI_API_KEY: 'smithsonian (art)', MEDIA_CONTACT: 'контакт в User-Agent (Wikimedia, AIC); без него Commons и AIC пропускаются' };
  const missing = missingKeys();
  for (const k of net.KEY_NAMES) {
    const ok = !missing.includes(k);
    log(`  ${ok ? 'OK  ' : 'WARN'} ${k.padEnd(20)} ${ok ? 'задан' : net.key(k) ? 'задан, но пуст без скобок и переводов строк' : 'не задан'} — ${uses[k]}`);
  }
  const noContact = !net.contact();
  log(`  User-Agent: ${noContact ? `${net.userAgent()} — без контакта: к Commons и AIC запросов нет` : 'с контактом из MEDIA_CONTACT'}`);
  /* utm_source по правилам API — имя приложения; без него подпись уходит с site_rework */
  const noApp = !!net.key('UNSPLASH_ACCESS_KEY') && !net.key('UNSPLASH_APP_NAME');
  if (noApp) log('  WARN UNSPLASH_APP_NAME    не задан — в ссылках подписи Unsplash utm_source=site_rework, а правила API ждут имя вашего приложения (кабинет Unsplash → Your apps)');

  const sharp = loadSharp();
  log(`\nsharp: ${sharp ? `OK ${sharp.versions?.sharp || ''} (libvips ${sharp.versions?.vips || '?'})` : 'FAIL не найден — npm i sharp --prefix ~/.claude/site-rework'}`);
  const ff = getFfmpeg();
  let ffv = '';
  if (ff) { try { ffv = execFileSync(ff, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 15000 }).split(/\r?\n/)[0]; } catch (e) { ffv = `не запустился: ${e.message}`; } }
  log(`ffmpeg: ${ff ? `OK ${ffv}` : 'WARN не найден — видео не пережать (npm i ffmpeg-static --prefix ~/.claude/site-rework)'}`);
  const vPath = videoModulePath();
  log(`видео-модуль ${path.basename(vPath)}: ${fs.existsSync(vPath) ? 'есть' : 'WARN пока нет (search/pick --kind video недоступны, фото работает)'}`);
  log(`кэш: ${net.CACHE_DIR}`);

  log('\nИсточники (проба с запасным DoH; любой HTTP-ответ = сервер отвечает):');
  const probes = [
    ...Object.entries(SOURCES).map(([name, s]) => ({ name, url: s.host, headers: s.hdr === 'aic' ? { 'AIC-User-Agent': net.userAgent() } : {}, key: s.key, contact: !!s.contact })),
    { name: 'thumb.wikimedia (копии Commons)', url: 'https://thumb.wikimedia.org/', method: 'HEAD' },
    { name: 'images.unsplash (файлы)', url: 'https://images.unsplash.com/', method: 'HEAD' },
    { name: 'images.pexels (файлы)', url: 'https://images.pexels.com/', method: 'HEAD' },
    { name: 'cdn.pixabay (файлы)', url: 'https://cdn.pixabay.com/', method: 'HEAD' },
    { name: 'videos.pexels (видео)', url: 'https://videos.pexels.com/', method: 'HEAD' },
    { name: 'mixkit (видео, поштучно)', url: 'https://mixkit.co/', method: 'HEAD' },
  ];
  /* без MEDIA_CONTACT Wikimedia и AIC не пробуются вовсе: их правила требуют контакт в User-Agent */
  const skipped = new Set(noContact ? probes.filter((p) => p.contact || net.needsContact(p.url)) : []);
  /* Wikimedia — строго по одному: net.mjs ставит их в очередь сам */
  const res = new Map(await Promise.all(probes.filter((p) => !skipped.has(p)).map(async (p) => [p, await net.probe(p.url, { headers: p.headers || {}, method: p.method || 'GET' })])));
  let warn = 0;
  for (const p of probes) {
    const keyNote = p.key && !net.key(p.key) ? ` · без ${p.key} источник пропускается` : '';
    if (skipped.has(p)) { log(`  SKIP ${p.name.padEnd(32)} не пробуем: нет MEDIA_CONTACT`); continue; }
    const r = res.get(p);
    if (r.ok) log(`  OK   ${p.name.padEnd(32)} HTTP ${r.status} за ${(r.ms / 1000).toFixed(1)} с (${r.via === 'dns' ? 'DNS' : r.via})${keyNote}`);
    else { warn++; log(`  WARN ${p.name.padEnd(32)} ${r.error}${keyNote}`); }
  }
  /* что сделать без контакта — строкой «→ Commons и AIC пропущены…» в блоке незаданных ключей ниже */
  const doh = [...net.dnsStats.entries()].filter(([, v]) => v !== 'dns');
  if (doh.length) log(`  имя найдено через DoH (системный DNS не ответил): ${doh.map(([h, v]) => `${h} → ${v}`).join(', ')}`);

  /* Незаданные ключи — отдельный WARN: пробы отвечают и без ключей, но источники без ключа
     search пропускает, а без MEDIA_CONTACT пропускает Commons (фото и видео) и AIC. */
  if (missing.length) {
    log(`\nWARN: не заданы ключи (${missing.length} из ${net.KEY_NAMES.length}): ${missing.join(', ')} — чем грозит:`);
    for (const k of missing) log(`  · ${k.padEnd(20)} ${KEY_RISK[k]}`);
    const has = (k) => !missing.includes(k);
    if (!has('PEXELS_API_KEY') && !has('UNSPLASH_ACCESS_KEY')) {
      log(has('MEDIA_CONTACT') ? '  → фото на первый экран — в основном Commons (CC0 из раннего Unsplash); Openverse — только карточки.'
        : '  → фото на первый экран: без Pexels, Unsplash и MEDIA_CONTACT остаются WordPress Photos (любительские) и Openverse (только карточки) — нужен ключ или контакт.');
    }
    if (!has('PEXELS_API_KEY') && !has('PIXABAY_API_KEY')) {
      log(has('MEDIA_CONTACT') ? '  → видео-петли — только Commons (шумная выдача, чаще CC BY) и Mixkit поштучно; нужен PEXELS_API_KEY или PIXABAY_API_KEY.'
        : '  → видео-петли — только Mixkit поштучно (Commons пропущен без MEDIA_CONTACT); нужен PEXELS_API_KEY или PIXABAY_API_KEY.');
    }
    if (!has('MEDIA_CONTACT')) log(`  → ${net.noContactLine()}.`);
    /* Образец лежит рядом с .env (~/.claude/site-rework/.env.example), не в папке скилла; нет файла — путь не печатаем. */
    const sample = path.join(net.HOME_DIR, '.env.example');
    log(`  Ключи кладутся в ${net.ENV_FILE}${fs.existsSync(sample) ? ` (образец — ${sample})` : ''} или в окружение; без ключа источник пропускается, остальные работают.`);
  }

  const parts = [];
  if (warn) parts.push(`${warn} проб не прошли — это временно (DNS VPN, лимиты), повторить позже; источник из-за этого не вычёркивать`);
  if (missing.length) {
    const what = [missing.some((k) => k !== 'MEDIA_CONTACT') ? 'часть источников недоступна' : '', missing.includes('MEDIA_CONTACT') ? 'Commons и AIC пропущены (спросить контакт у пользователя)' : ''].filter(Boolean).join(', ');
    parts.push(`${warn ? '' : 'пробы ответили, но '}не заданы ключи: ${missing.join(', ')} — ${what}`);
  }
  if (noApp) parts.push('UNSPLASH_APP_NAME не задан (utm_source=site_rework)');
  log(`\n${!sharp ? 'FAIL: нет sharp.' : parts.length ? `WARN: ${parts.join('; ')}.` : 'OK: все пробы ответили, все ключи заданы.'}`);
  if (!sharp) process.exit(1);
}

/* Что теряется без ключа (doctor). Источники — SOURCES в media/photo.mjs и видео в media/video.mjs. */
const KEY_RISK = {
  PEXELS_API_KEY: 'нет Pexels — ни фото, ни видео (главный источник видео-петель)',
  UNSPLASH_ACCESS_KEY: 'нет Unsplash — крупных фото для первого экрана меньше',
  PIXABAY_API_KEY: 'нет Pixabay — ни фото (до 1280 px), ни видео',
  SI_API_KEY: 'нет Smithsonian в профиле art (остальные музеи работают)',
  MEDIA_CONTACT: 'Commons (Wikimedia: фото, видео, копии) и AIC пропускаются — их правила требуют контакт в User-Agent, без него к ним ни одного запроса',
};
/** Незаданные ключи по порядку net.KEY_NAMES; MEDIA_CONTACT, который после очистки пуст, считается незаданным. */
function missingKeys() {
  return net.KEY_NAMES.filter((k) => !(k === 'MEDIA_CONTACT' ? net.contact() : net.key(k)));
}

/* ---------- search ---------- */


async function cmdSearch() {
  /* сначала все аргументы и источники — папки только потом */
  checkValueOpts(1);
  const q = str(pos[1]).trim();
  if (!q) fail('Нет запроса. Пример: node media.mjs search "bakery bread" --kind photo --role hero');
  const kind = str(opt.kind) || 'photo';
  if (!['photo', 'video'].includes(kind)) fail(`--kind ${opt.kind}: photo или video`);
  const profile = kind === 'video' ? 'video' : (str(opt.profile) || 'photo');
  if (kind === 'photo' && !PROFILES[profile]) fail(`--profile ${opt.profile}: photo или art`);
  const role = str(opt.role) || (kind === 'video' ? 'loop' : 'section');
  if (!ROLES[role]) fail(`--role ${opt.role}: hero | section | card | loop`);
  /* видео для фона первого экрана и фото для hero и card — горизонтальные, если не попросили другое:
     `search --sources pexels` для роли card без --orient дал вино, чай и кальян почти одними
     вертикальными кадрами, и обрезка 1000×700 оставляла середину (Эпицентр, 29.09). any — без отбора. */
  const { orient, byDefault: orientDefault, bad: orientBad } = orientFor(kind, role, opt.orient);
  if (orientBad) fail(`--orient ${orientBad}: landscape | portrait | square | any`);
  let n = 24;
  if (opt.n !== undefined) {
    const v = Number(opt.n);
    if (!(Number.isFinite(v) && v >= 1)) fail(`--n ${opt.n}: сколько кадров на лист — целое от 1 до 60`);
    n = Math.min(60, Math.floor(v));
  }
  if (opt.min !== undefined && !(Number(opt.min) > 0)) fail(`--min ${opt.min}: px по длинной стороне — число больше 0`);
  const min = Number(opt.min) || ROLES[role].min;
  if (kind === 'video' && opt.frames !== undefined && !/^(all|\d+)$/.test(String(opt.frames))) fail(`--frames ${opt.frames}: число от 0 или all`);
  let names = null;
  if (opt.sources !== undefined) {
    names = splitList(opt.sources);
    if (!names.length) fail('--sources: пустой список — имена через запятую, например unsplash,pexels');
  }
  let video = null;
  if (kind === 'video') {
    video = await requireVideo();
    const bad = names && typeof video.checkSources === 'function' ? video.checkSources(names) : null;
    if (bad) fail(`видео-поиск: ${bad}`);
  } else {
    names = names || PROFILES[profile];
    const bad = names.filter((s) => !SOURCES[s]);
    if (bad.length) fail(`Неизвестные источники: ${bad.join(', ')}. Есть: ${Object.keys(SOURCES).join(', ')}`);
  }
  const sharp = requireSharp();
  const dir = searchDir(q, kind, profile);
  const existed = fs.existsSync(dir);
  /* папки, которые создаст этот запуск (runs/<slug>, media, папка поиска): при пустой выдаче убираются и они */
  const created = []; for (let p = dir; !fs.existsSync(p) && path.dirname(p) !== p; p = path.dirname(p)) created.push(p);
  /* новый лист собирается во временной подпапке и заменяет прежний только при успехе:
     повтор поиска при сбое сети не должен стирать готовый лист и отметки pick */
  ensureDir(dir);
  const work = path.join(dir, `.search-tmp-${process.pid}`);
  fs.rmSync(work, { recursive: true, force: true });
  ensureDir(path.join(work, 'cand'));
  const dropWork = () => { try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* останется служебная папка */ } };
  process.on('exit', dropWork);
  const o = { n, role, orient, min, fresh: !!opt.fresh, log, query: q };

  log(`Запрос «${q}» · ${kind}${kind === 'photo' ? ` · профиль ${profile}` : ''} · роль ${role} (нужно ${ROLES[role].ladder[0]} px по длинной стороне, минимум ${min})${orient ? ` · ${orient}${orientDefault ? ` (по умолчанию для ${kind === 'video' ? 'видео' : `роли ${role}`}; --orient any — без отбора)` : ''}` : ''}`);
  if (kind === 'video' && opt.profile) log('  (--profile для видео не используется)');
  /* марка в запросе: выдача — её бокалы и этикетки (aperol spritz → логотип Aperol на кадрах 1, 4, 9, 14) */
  const qBrands = brandsIn(q);
  if (qBrands.length) log(`  WARN в запросе марка (${qBrands.join(', ')}): на кадрах почти наверняка её этикетка или логотип — искать без названия, словами о том, что видно (вместо «aperol spritz» — «orange spritz cocktail»); пометка brand? стоит на всех кадрах с ней`);
  const status = {};
  let lists = [];

  if (kind === 'video') {
    let r;
    try { r = await video.search(q, { ...o, sources: names, frames: opt.frames === undefined ? null : String(opt.frames) }, makeCtx(sharp)); }
    catch (e) { fail(`видео-поиск: ${net.describeError(e)}`); }
    Object.assign(status, r.status || {});
    for (const [name, st] of Object.entries(r.status || {})) log(`  ${st.state === 'ok' ? 'OK  ' : st.state === 'skip' ? 'SKIP' : 'WARN'} ${name.padEnd(17)} ${st.message || ''}`);
    const by = new Map();
    for (const c of r.items || []) { if (!by.has(c.source)) by.set(c.source, []); by.get(c.source).push(c); }
    lists = [...by.values()];
  } else {
    for (const name of names) {
      const src = SOURCES[name];
      const slow = ['met', 'rijks'].includes(name);
      try {
        const r = await src.search(q, { ...o, n: slow ? Math.min(n, 10) : n });
        if (r.skip) { status[name] = { state: 'skip', message: r.skip, ...(r.no_contact ? { no_contact: true } : {}) }; log(`  SKIP ${name.padEnd(17)} ${r.skip}`); continue; }
        lists.push(r.items.map((c) => ({ ...c, source: c.source || name })));
        status[name] = { state: 'ok', found: r.items.length, message: r.note || '' };
        log(`  OK   ${name.padEnd(17)} найдено ${r.items.length}${r.note ? ` · ${r.note}` : ''}`);
      } catch (e) {
        const msg = net.describeError(e);
        const temporary = !(e instanceof net.NetError) || e.temporary;
        status[name] = { state: temporary ? 'temporary' : 'error', message: msg };
        log(`  WARN ${name.padEnd(17)} ${msg}`);
      }
    }
  }
  /* без MEDIA_CONTACT Commons и AIC пропущены — одна понятная строка, что сделать */
  const noContactSkipped = Object.entries(status).filter(([, s]) => s.no_contact).map(([k]) => k);
  if (noContactSkipped.length) log(`  ${net.noContactLine()}.`);

  /* файл под роль, ориентация */
  const prepared = lists.map((list) => list.map((c) => {
    if (kind === 'photo') { c.file = chooseFile(c, role); if (!c.file) return null; }
    const d = c.file || {};
    const w = d.width || c.orig?.width, h = d.height || c.orig?.height;
    if (orient && w && h && !ORIENT[orient](w, h)) return null;
    return c;
  }).filter(Boolean));

  /* Серии: один автор снимает десяток почти одинаковых кадров (торговый центр,
     «SZ Shenzhen … 001…009») — не больше двух кадров с одинаковым началом названия. */
  const seriesKey = (c) => String(c.title || c.id).toLowerCase().replace(/\(unsplash[^)]*\)/g, '').replace(/[\d_\-–—.,:;()[\]#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
  const bySeries = new Map(); const seenPage = new Set();
  const cleanLists = prepared.map((l) => l.filter((c) => {
    const pk = String(c.page_url || c.id).toLowerCase();
    if (seenPage.has(pk)) return false; seenPage.add(pk);
    const sk = `${c.source}|${seriesKey(c)}`; const k = bySeries.get(sk) || 0;
    if (k >= 2) return false; bySeries.set(sk, k + 1); return true;
  }));
  /* Порядок профиля с долями: первый ответивший источник — до 40% листа, второй — 25%,
     остальные — по 15%; недобор заполняется по тому же порядку. */
  /* у видео запас меньше: превью из кадров дорогие */
  const want = n + (kind === 'video' ? 4 : 8);
  const nonEmpty = cleanLists.filter((l) => l.length);
  const weights = nonEmpty.map((_, i) => [0.4, 0.25][i] ?? 0.15);
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const picked = []; const rest = [];
  nonEmpty.forEach((l, i) => { const cap = Math.max(2, Math.round(n * weights[i] / wsum)); picked.push(...l.slice(0, cap)); rest.push(l.slice(cap)); });
  /* недобор до n — по порядку профиля; сверх n (до want) — запас на несскачавшиеся превью и дубли */
  const main = picked.slice(0, n); const spare = picked.slice(n);
  for (const l of rest) for (const c of l) { if (main.length < n) main.push(c); else if (spare.length < want - n) spare.push(c); }
  const pre = [...main, ...spare].slice(0, want);

  /* реальный размер там, где выдача его не знает (Openverse не с Flickr, Met без пробы) */
  let probes = 0;
  for (const c of pre) {
    if (kind !== 'photo' || c.hotlink_only || !c.file?.url) continue;
    if ((c.file.width && !c.file.unverified) || probes >= 30) continue;
    probes++;
    try {
      const r = await net.getRange(c.file.url, { headers: headersFor(c), bytes: 131072 });
      const d = headerDims(r.body);
      if (d) { c.file.width = d.width; c.file.height = d.height; c.file.unverified = false; }
    } catch { /* останется «?» */ }
  }

  /* превью (у видео с кадрами — плитка 2×2), дубли по отпечатку */
  const cands = []; const failures = []; let dup = 0;
  const loaded = await pool(pre, 3, async (c) => {
    if (kind === 'video' && Array.isArray(c.frames) && c.frames.length >= 2) {
      const bufs = [];
      for (const u of c.frames.slice(0, 4)) { try { bufs.push((await net.download(u, { headers: headersFor(c), timeout: 45000, maxBytes: 15 * 1048576 })).body); } catch (e) { c._err = net.describeError(e); } }
      if (bufs.length >= 2) { try { return { c, p: await makePreview(sharp, await makeMosaic(sharp, bufs)) }; } catch (e) { c._err = e.message; } }
    }
    for (const u of [c.preview_url, c.preview_fallback].filter(Boolean)) {
      try {
        const r = await net.download(u, { headers: headersFor(c), timeout: 45000, maxBytes: 25 * 1048576 });
        const p = await makePreview(sharp, r.body);
        return { c, p };
      } catch (e) { c._err = net.describeError(e); }
    }
    failures.push(`${c.source} ${c.id}: ${c._err || 'нет адреса превью'}`);
    return null;
  });
  for (const x of loaded) {
    if (!x) continue;
    if (cands.length >= n) break;
    if (cands.some((y) => hamming(y.hash, x.p.hash) <= 6)) { dup++; continue; }
    const c = x.c;
    c.n = cands.length + 1;
    c.hash = x.p.hash; c.entropy = x.p.entropy;
    const L = long(c.file?.width, c.file?.height);
    const extra = [...(c.extraFlags || [])];
    if (profile === 'art' && c.art && !c.art.term?.ok) extra.push('term?');
    if (L && L < min) extra.push('small');
    c.flags = [...new Set([...(c.flags || []), ...flagsFor(c.text || c.title || '', q, profile, extra)])];
    c.preview = `cand/${String(c.n).padStart(2, '0')}.jpg`;
    fs.writeFileSync(path.join(work, c.preview), x.p.jpeg);
    c.previewFile = path.join(work, c.preview);
    cands.push(c);
  }

  /* сетевой сбой — временный и тогда, когда ответы API пришли из кэша, а не скачались превью */
  const tempPreviews = failures.filter((f) => /временно/.test(f)).length;
  const tempSources = Object.values(status).some((s) => s.state === 'temporary');
  const temp = tempSources || tempPreviews > 0;
  const old = readManifest(dir);
  const hadSheet = !!(old && (old.candidates || []).length);
  if (!cands.length) {
    const keepNote = hadSheet ? ` Прежний лист (${old.candidates.length} кадров, ${old.created_at || 'дата неизвестна'}) и отметки pick не тронуты.` : '';
    if (temp) {
      const why = tempPreviews && !tempSources ? `превью не скачались (${tempPreviews}) из-за временной ошибки сети` : tempPreviews ? `часть источников и превью (${tempPreviews}) ответили временной ошибкой` : 'часть источников ответила временной ошибкой';
      log(`\nWARN: ни одного кандидата — ${why}; это временно, повторить позже тем же запросом.${keepNote}`);
    } else log(`\nFAIL: ни одного кандидата. Короче запрос (2–3 слова по-английски), другой синоним, --role card или ключ Pexels/Unsplash.${noContactSkipped.length ? ' Commons и AIC пропущены без MEDIA_CONTACT — что сделать, см. строку выше.' : ''}${keepNote}`);
    for (const f of failures.slice(0, 5)) log(`  ! ${f}`);
    /* папку, которую создал этот запуск, пустой не оставляем */
    dropWork();
    if (!existed) { for (const p of created) { try { fs.rmdirSync(p); } catch { break; /* не пуста — оставляем её и всё выше */ } } }
    process.exit(1);
  }

  const built = await buildSheets(sharp, cands, work, { kind });
  /* успех: прежний лист уходит, новый встаёт на его место */
  ensureDir(path.join(dir, 'cand'));
  for (const f of fs.readdirSync(dir)) if (/^sheet-\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(dir, f));
  for (const f of fs.readdirSync(path.join(dir, 'cand'))) fs.unlinkSync(path.join(dir, 'cand', f));
  for (const f of fs.readdirSync(path.join(work, 'cand'))) fs.renameSync(path.join(work, 'cand', f), path.join(dir, 'cand', f));
  const sheets = built.map((s) => { const to = path.join(dir, path.basename(s)); fs.renameSync(s, to); return to; });
  for (const c of cands) c.previewFile = path.join(dir, c.preview);
  dropWork();
  /* отметки pick: тот же запрос — переносятся (номер сверяется по источнику и id); другой запрос — прежний манифест в архив */
  let keptPicks = []; let archived = '';
  if (old && (old.picked || []).length) {
    const same = old.query === q && old.kind === kind && (old.profile || '') === (profile || '');
    if (same) {
      keptPicks = old.picked.map((p) => {
        const oc = (old.candidates || []).find((x) => x.n === p.n) || {};
        const src = p.source || oc.source; const id = p.id || oc.id;
        const nc = cands.find((x) => x.source === src && String(x.id) === String(id));
        return { ...p, source: src, id, n: nc ? nc.n : null, ...(nc && nc.n === p.n ? {} : { prev_n: p.n }) };
      });
    } else {
      archived = `manifest-${String(old.created_at || Date.now()).replace(/[^\dT]/g, '').slice(0, 15)}.json`;
      fs.writeFileSync(path.join(dir, archived), JSON.stringify(old, null, 1));
    }
  }
  const manifest = {
    version: 1, kind, profile, role, query: q, orient, min, n, created_at: new Date().toISOString(),
    status, sheets: sheets.map((s) => path.basename(s)), candidates: cands.map(sanitizeCand), picked: keptPicks,
  };
  writeManifest(dir, manifest);
  if (keptPicks.length) log(`  отметки pick перенесены из прежнего листа: ${keptPicks.length}${keptPicks.some((p) => p.n === null) ? ' (у части кадра больше нет в выдаче — n: null)' : ''}`);
  if (archived) log(`  прежний манифест с отметками pick (другой запрос «${old.query}») сохранён: ${archived}`);
  log(`\nКандидатов: ${cands.length}${dup ? ` · дублей убрано ${dup}` : ''}${failures.length ? ` · превью не скачалось ${failures.length}` : ''}`);
  for (const f of failures.slice(0, 4)) log(`  ! ${f}`);
  for (const c of cands) {
    const f = c.file || {};
    const size = f.width ? `${f.width}x${f.height}` : '?';
    const oL = long(c.orig?.width, c.orig?.height);
    const of = oL && oL > long(f.width, f.height) + 2 ? `(из ${oL})` : '';
    const extra = kind === 'video' ? ` ${c.duration ? Math.round(c.duration) + 's' : '?s'} ${f.bytes ? mb(f.bytes) : '?MB'}` : '';
    log(`  #${String(c.n).padStart(2, '0')} ${c.source.padEnd(18)} ${(size + of).padEnd(18)}${extra} ${String(c.license).slice(0, 26).padEnd(26)} ${c.flags.join(' ')}  ${String(c.title || '').slice(0, 50)}`);
  }
  log(`\nОТКРЫТЬ ГЛАЗАМИ (Read): ${sheets.join(' , ')}\n  вблизи — ${path.join(dir, 'cand', 'NN.jpg')}`);
  log('  Пометки — только подсказка: ценники, вывески, валюту и лица видно лишь глазами.');
  log(`\nДальше: node media.mjs pick "${dir}" <N> --seen "что на кадре" --caption "подпись на сайте" --dest <папка сайта>/img --role ${role}`);
  const tempWhat = [tempSources ? 'часть источников' : '', tempPreviews ? `превью (${tempPreviews})` : ''].filter(Boolean).join(' и ');
  const contactNote = noContactSkipped.length ? ' Commons и AIC пропущены: нет MEDIA_CONTACT.' : '';
  const brandNote = qBrands.length ? ` В запросе марка (${qBrands.join(', ')}) — искать без названия.` : '';
  log(`\n${temp ? `WARN: лист готов, ${cands.length} кадров; ${tempWhat} — временная ошибка, повторить позже.` : qBrands.length ? `WARN: лист готов, ${cands.length} кадров.` : `OK: лист готов, ${cands.length} кадров.`}${brandNote}${contactNote}`);
}

/* ---------- обработка и учёт (pick и import) ---------- */

function numOpt(name, lo, hi) {
  if (opt[name] === undefined) return null;
  const v = Number(opt[name]);
  if (!(v >= lo && v <= hi)) fail(`--${name} ${opt[name]}: число от ${lo} до ${hi}`, 2);
  return v;
}
function commonOpts(role, defaultDest) {
  const grain = opt.grain !== undefined ? Number(opt.grain) : 0;
  if (!(grain >= 0) || grain > MAX_GRAIN) fail(`--grain ${opt.grain}: от 0 до ${MAX_GRAIN}; сильное зерно — одним общим слоем CSS поверх страницы`, 2);
  const contrast = opt.contrast !== undefined ? Number(opt.contrast) : 0;
  if (!(contrast >= 0 && contrast <= 1)) fail(`--contrast ${opt.contrast}: от 0 до 1`, 2);
  try { parseLook(opt.look); parseRatio(opt['crop-mobile']); parseRatio(opt.ratio); } catch (e) { fail(e.message, 2); }
  const avif = str(opt.avif) || 'auto';
  if (!['auto', 'on', 'off'].includes(avif)) fail(`--avif ${opt.avif}: auto | on | off`, 2);
  const dest = path.resolve(str(opt.dest) || defaultDest);
  const prefix = str(opt['src-prefix']) || `${path.basename(dest)}/`;
  /* Git Bash превращает /assets/img/ в C:/Program Files/Git/assets/img/ — такой адрес в разметку и карту не пускаем */
  if (/^[A-Za-z]:[\\/]/.test(prefix)) fail(`--src-prefix ${prefix}: это путь диска, а нужен адрес на сайте. Git Bash переделал /assets/… в путь своей папки — запускать с MSYS_NO_PATHCONV=1 или писать //assets/…`, 2);
  const need = numOpt('need', 16, 20000);
  const focus = str(opt.focus).toLowerCase() || null;
  if (focus && !FOCUS.includes(focus)) fail(`--focus ${opt.focus}: ${FOCUS.join(' | ')}`, 2);
  /* точный режим: --size и всё, что без него не имеет смысла */
  let size = null; let thumb = null;
  try { size = parseSize(opt.size, '--size'); thumb = parseSize(opt.thumb, '--thumb'); } catch (e) { fail(e.message, 2); }
  const exactOnly = ['thumb', 'thumb-dir', 'format', 'quality'].filter((k) => opt[k] !== undefined);
  if (!size && exactOnly.length) fail(`${exactOnly.map((k) => `--${k}`).join(', ')} — только вместе с --size WxH (кадр под формат проекта); без --size pick делает лестницу ширин WebP/AVIF и запасной JPEG`, 2);
  if (size && (opt.ratio || opt['crop-mobile'] || opt.avif)) fail('--size (один файл под формат проекта) не сочетается с --ratio, --crop-mobile и --avif — пропорцию задаёт сам --size', 2);
  if (size && need) fail('--size и --need вместе не нужны: ширину задаёт --size', 2);
  const exact = size ? exactOpts(size, thumb) : null;
  return {
    role, look: str(opt.look) || 'none', contrast, grain, cropMobile: str(opt['crop-mobile']) || null, ratio: str(opt.ratio) || null,
    dest, srcPrefix: prefix, avif, start: numOpt('start', 0, 36000), dur: numOpt('dur', 2, 60), fade: numOpt('fade', 0.2, 3),
    need, focus, size, thumb, ...(exact || {}),
  };
}
/** Точный режим: имя файла с расширением, формат, качество, папка превью. Имя — как дали (не slugify). */
function exactOpts(size, thumb) {
  const rawName = str(opt.name).trim();
  const extFmt = rawName ? exactFormat(path.extname(rawName)) : null;
  if (rawName && path.extname(rawName) && !extFmt) fail(`--name ${rawName}: расширение ${path.extname(rawName)} — нужно .jpg, .webp или .avif (или без расширения и --format)`, 2);
  const fmtOpt = opt.format !== undefined ? exactFormat(opt.format) : null;
  if (opt.format !== undefined && !fmtOpt) fail(`--format ${opt.format}: jpg | webp | avif`, 2);
  if (fmtOpt && extFmt && fmtOpt !== extFmt) fail(`--name ${rawName} и --format ${opt.format} расходятся — уберите одно`, 2);
  const format = fmtOpt || extFmt || 'jpg';
  if (rawName && (/[\\/:*?"<>|]/.test(rawName) || /^\./.test(rawName))) fail(`--name ${rawName}: только имя файла, без папок и знаков \\ / : * ? " < > |`, 2);
  const quality = numOpt('quality', 1, 100);
  const thumbDir = str(opt['thumb-dir']).trim() || 'thumb';
  if (/(^|[\\/])\.\.([\\/]|$)/.test(thumbDir) || path.isAbsolute(thumbDir)) fail(`--thumb-dir ${thumbDir}: папка внутри --dest (например thumb)`, 2);
  if (opt['thumb-dir'] !== undefined && !thumb) fail('--thumb-dir — только вместе с --thumb WxH', 2);
  return { format, quality: quality || EXACT_FORMATS[format].q, thumbDir, rawName };
}
/** Имя файла точного режима: --name как есть (+ расширение формата), иначе из роли, источника и id. */
function exactFile(o, fallback) {
  const base = o.rawName || slugify(fallback, 48);
  return path.extname(base) ? base : `${base}${EXACT_FORMATS[o.format].ext}`;
}
/** Цель по длинной стороне для скачивания: под обрезку --size (cover) или под --need; иначе — роль. */
function downloadTarget(c, o) {
  const ow = c.orig?.width, oh = c.orig?.height;
  const R = ROLES[o.role] || ROLES.section;
  if (o.size) {
    const want = [o.size, o.thumb].filter(Boolean);
    if (!(ow && oh)) return Math.max(...want.map((s) => Math.max(s.w, s.h))) * 2;
    const s = Math.max(...want.map((z) => Math.max(z.w / ow, z.h / oh)));
    return Math.ceil(Math.max(ow, oh) * s);
  }
  if (o.need && ow && oh) return Math.max(R.ladder[0], Math.ceil(o.need * Math.max(ow, oh) / ow));
  return null;
}

function printFiles(files, source) {
  for (const f of files) {
    /* точный режим: файл заменил прежний — каким он был (другой размер — сайт ждал не этот формат?) */
    const was = f.before ? `  заменён (был ${f.before.width}x${f.before.height}, ${kb(f.before.bytes)})` : f.group === 'exact' || f.group === 'thumb' ? '  новый файл' : '';
    log(`  ${String(f.file).padEnd(40)} ${String(`${f.width}x${f.height}`).padEnd(10)} ${kb(f.bytes).padStart(8)}${f.quality ? ` q${f.quality}` : ''}${f.codec && f.group ? `  ${f.group}` : ''}${was}`);
  }
  if (source) log(`  исходник (по скачанному файлу): ${source.width}x${source.height}${source.bytes ? `, ${kb(source.bytes)}` : ''}${source.format ? `, ${source.format}` : ''}`);
}

/** Скачать фото кадра, проверить код, сигнатуру и размер по самому файлу. */
async function fetchPhoto(c, file) {
  const r = await net.download(file.url, { headers: headersFor(c), timeout: 240000, maxBytes: 150 * 1048576 });
  const kindSig = net.sniff(r.body);
  if (!PHOTO_SIGS.includes(kindSig)) throw new Error(`по адресу не картинка (сигнатура: ${kindSig || 'неизвестна'}, тип ${r.headers['content-type'] || '?'}) — ${net.redact(file.url).slice(0, 120)}`);
  return { buf: r.body, bytes: r.bytes, sha256: r.sha256, format: kindSig, contentType: r.headers['content-type'] || '' };
}

async function processAndCredit(sharp, c, buf, meta, o, extra = {}) {
  const real = await orientedSize(sharp, buf);
  const notes = [...(extra.pre || [])];
  const exp = meta.expected || {};
  if (exp.width && (Math.abs(exp.width - real.width) > 2 || (exp.height && Math.abs(exp.height - real.height) > 2))) notes.push(`по файлу ${real.width}x${real.height}, выдача обещала ${exp.width}x${exp.height || '?'} — дальше считаем по файлу`);
  /* «достижимая копия» — только когда скачанного меньше, чем нужно (под роль, --need или обрезку --size), а оригинал больше */
  const wantLong = extra.target || ROLES[o.role].ladder[0];
  if (c.orig?.width && long(real.width, real.height) < long(c.orig.width, c.orig.height) - 2 && long(real.width, real.height) < wantLong - 2) {
    notes.push(`оригинал ${c.orig.width}x${c.orig.height}, достижимая копия — ${real.width}x${real.height}`);
  }
  /* сервер мог растянуть копию больше оригинала (Commons так делает) — ложное разрешение не берём */
  if (c.orig?.width && long(real.width, real.height) > long(c.orig.width, c.orig.height) + 2) {
    fail(`Файл ${real.width}x${real.height} больше оригинала ${c.orig.width}x${c.orig.height}: сервер растянул копию. Такой кадр не берём — повторите pick с другой ролью или выберите другой кадр.`, 1);
  }
  const res = o.size
    ? await processExact(sharp, buf, { size: o.size, thumb: o.thumb, thumbDir: o.thumbDir, file: o.name, format: o.format, quality: o.quality, focus: o.focus, dest: o.dest, srcPrefix: o.srcPrefix, look: o.look, contrast: o.contrast, grain: o.grain, caption: o.caption, role: o.role, seedKey: `${c.source}:${c.id}` })
    : await processPhoto(sharp, buf, { ...o, name: o.name, caption: o.caption, seedKey: `${c.source}:${c.id}` });
  const changes = `Изменено: ${res.changes.join('; ')}.`;
  const rec = {
    name: o.name, kind: 'photo', role: o.role, source: c.source, source_id: c.id, title: c.title || '', page_url: c.page_url, file_url: net.redact(meta.url || ''),
    author: c.author || '', author_url: c.author_url || '', license: c.license, license_code: c.license_code, license_url: c.license_url,
    attribution_required: !!c.attribution_required, attribution_text: c.attribution_text || '', credit_need: '',
    changes, seen: o.seen, caption: o.caption, flags: c.flags || [], ok_flags: !!opt['ok-flags'],
    original: { width: real.width, height: real.height, bytes: meta.bytes || null, format: meta.format || real.format, sha256: meta.sha256 || null },
    files: res.files.map(({ file, width, height, bytes, format, group }) => ({ file, width, height, bytes, format, group })),
    look: { look: o.look, contrast: o.contrast, grain: o.grain }, hotlink: false, query: extra.query || '', date: today(),
    ...(o.size ? { exact: { src: `${o.srcPrefix}${o.name}`, size: o.size.spec, thumb: o.thumb ? o.thumb.spec : null, thumb_dir: o.thumb ? o.thumbDir : null, format: o.format, quality: o.quality, focus: o.focus || 'attention' } } : {}),
    ...(o.need ? { need: o.need } : {}),
    ...(c.credit_line ? { credit_line: c.credit_line } : {}),
    ...(c.art ? { art: { death_year: c.art.death_year, work_year: c.art.work_year, term: c.art.term?.why, ...(c.art.photographer ? { photographer: c.art.photographer } : {}) } } : {}),
    ...(extra.note ? { note: extra.note } : {}),
  };
  rec.credit_need = creditNeed(rec);
  saveCredit(o.dest, rec);
  log(`\nКадр ${extra.label || ''} (${c.source}, ${c.license}) → ${o.dest}`);
  printFiles(res.files, { ...real, bytes: meta.bytes });
  const warnings = [...notes, ...res.warnings];
  for (const w of warnings) log(`  ! ${w}`);
  return { res, rec, warnings };
}

/** Кадр уже стоит под другим именем (credits.json, свой или проекта; отметки pick) — строки замечаний. */
function dupNotes(dest, c, name, manifest = null) {
  const used = usedElsewhere(dest, { source: c.source, id: c.id, page: c.page_url, name }, manifest);
  return used.length ? [`кадр уже использован как ${used.map((u) => `${u.name} (${u.where})`).join(', ')} — один кадр в двух местах сайта; так задумано — ок, иначе выберите другой`] : [];
}

function printTail(rec, markup, extraNotes = [], dest = '', warnings = []) {
  log(`\nРазметка:\n${markup}`);
  for (const nte of extraNotes) log(nte);
  log(`\nПодпись на сайте: ${rec.credit_need}${rec.attribution_text ? `\n  ${rec.attribution_text}${rec.attribution_required && !rec.hotlink ? ` ${rec.changes}` : ''}` : ''}`);
  if (rec.hotlink) log('  Правило API Unsplash: подписать кадр — имя автора и «Unsplash», обе ссылки с utm, рядом с кадром (лучше) или в общем блоке подписей; готовая строка — `media.mjs credits`.');
  if (rec.art) log(`  Произведение из общественного достояния (${rec.art.term || 'срок проверен'}): подписывать настоящими автором и названием, как иллюстрацию — не как товар и не под вымышленным именем.`);
  const ct = creditsTarget(dest);
  if (ct.foreign) log(`  ${ct.foreign} — учёт проекта в своём виде, не тронут; запись media.mjs — в ${path.basename(ct.file)}. Подпись в учёт проекта — вручную (строка ниже).`);
  log(`  ${path.basename(ct.file)} обновлён: ${ct.file}`);
  if (rec.exact) {
    /* запись для карты фото проекта — в тех же полях, что у кадров Эпицентра (photo-map.json) */
    const main = (rec.files || []).find((f) => f.group === 'exact') || (rec.files || [])[0] || {};
    const srcName = /pexels/.test(rec.source) ? 'Pexels' : /unsplash/.test(rec.source) ? 'Unsplash' : /pixabay/.test(rec.source) ? 'Pixabay' : /^commons/.test(rec.source) ? 'Wikimedia Commons' : rec.source;
    log(`  для карты фото проекта: ${JSON.stringify({ file: rec.exact.src || main.file || rec.name, title: rec.title, author: rec.author, license: rec.license, page: rec.page_url, source: srcName, author_url: rec.author_url || undefined })}`);
  }
  log('После вставки: открыть снимок страницы глазами (кадр на месте, текст поверх читается, подпись не противоречит кадру) и сверить с `media.mjs credits`.');
  log(`\n${warnings.length ? `WARN: кадр готов, но ${warnings.length === 1 ? 'есть замечание' : `есть замечания (${warnings.length})`} — см. «!» выше` : 'OK: кадр готов'}.`);
}

/* ---------- pick ---------- */

/** Кадр или ролик с Wikimedia/AIC: без MEDIA_CONTACT его не скачать (ни одного запроса к ним). */
function needsContactCand(c) {
  return /^(commons|aic)(-|$)/.test(String(c.source || '')) || c.hdr === 'aic'
    || [c.file?.url, c.template?.url, c.download_location, ...(c.variants || []).map((v) => v.url)].some((u) => u && net.needsContact(u));
}

async function cmdPick() {
  checkValueOpts(2);
  const dir = pos[1] && path.resolve(pos[1]); const N = Number(pos[2]);
  if (!dir || !N) fail('Использование: node media.mjs pick <папка поиска> <N> --seen "…" --caption "…" [--dest <папка>]');
  const m = readManifest(dir);
  if (!m) fail(`Нет manifest.json в ${dir}`);
  const c = m.candidates.find((x) => x.n === N);
  if (!c) fail(`Нет кандидата №${N}; всего ${m.candidates.length}.`);
  const g = gate({ seen: opt.seen, caption: opt.caption, flags: c.flags || [], okFlags: !!opt['ok-flags'], preview: path.join(dir, c.preview || '') });
  if (!g.ok) { for (const s of g.messages) console.error(`FAIL: кадр №${N} не взят: ${s}`); process.exit(2); }
  const role = str(opt.role) || m.role || 'section';
  if (!ROLES[role]) fail(`--role ${opt.role}: hero | section | card | loop`);
  const o = { ...commonOpts(role, path.join(dir, 'picked')), seen: String(opt.seen).trim(), caption: String(opt.caption).trim() };
  o.name = o.size ? exactFile(o, `${role}-${c.source}-${c.id}`) : slugify(str(opt.name) || `${role}-${c.source}-${c.id}`, 48);
  if (o.size && m.kind === 'video') fail('--size — для фото: ролик режется петлёй 1920x1080 / 1280x720 / 720x1280 (см. «Видео» в справке)', 2);
  if (o.size && c.hotlink_only) fail(`Кадр №${N} — Unsplash из API: файл не пережимается и не кладётся под своим именем (правило API — их ссылки). Под формат проекта — файл, скачанный вручную на unsplash.com: import --license unsplash --size …, или кадр Pexels.`, 2);
  if (!net.contact() && needsContactCand(c)) fail(`${m.kind === 'video' ? 'ролик' : 'кадр'} №${N} (${c.source}) не скачать: правила Wikimedia и AIC требуют контакт в User-Agent, а ${net.noContactHint()}. Или выберите кадр другого источника.`);
  const sharp = requireSharp();
  /* тот же кадр уже под другим именем — WARN (печатается у кадра и идёт в итог) */
  const dups = dupNotes(o.dest, c, o.name, m);

  if (m.kind === 'video') {
    const video = await requireVideo();
    requireFfmpeg();
    const ctx = makeCtx(sharp);
    o.checkDir = path.join(dir, 'check');
    log(`Ролик №${N} (${c.source}): проверка лицензии и файла…`);
    const resolved = await videoStep(() => video.resolve(c, { role, dest: o.dest, import: false, start: o.start, dur: o.dur }, ctx), `ролик №${N} не взят`);
    log(`  файл ${resolved.width || '?'}x${resolved.height || '?'}${resolved.bytes ? `, ${mb(resolved.bytes)}` : ''}${resolved.license_evidence ? ` · лицензия: ${resolved.license_evidence}` : ''}\n  нарезка петли и кодирование (десятки секунд)…`);
    const enc = await videoStep(() => video.encode(resolved, o, ctx), `ролик №${N} не пережат`);
    const rec = videoRecord(c, resolved, enc, o, { query: m.query, file_url: net.redact(resolved.url || '') });
    saveCredit(o.dest, rec);
    log(`\nРолик №${N} (${c.source}, ${rec.license}) → ${o.dest}`); printFiles(enc.files || []);
    printVideoFacts(enc);
    const warnings = [...dups, ...(resolved.warnings || []), ...(enc.warnings || []), ...budgetLines(enc.budget)];
    for (const w of warnings) log(`  ! ${w}`);
    printTail(rec, enc.markup || '', [], o.dest, warnings);
  } else if (c.hotlink_only) {
    /* Unsplash: событие скачивания обязательно, файл не пережимаем — ссылки их */
    const k = net.key('UNSPLASH_ACCESS_KEY');
    if (!k) fail('Кадр Unsplash: нужен UNSPLASH_ACCESS_KEY, чтобы сообщить о скачивании (download_location) — правило API.');
    try { await net.getJson(c.download_location, { headers: { authorization: `Client-ID ${k}`, 'accept-version': 'v1' } }); }
    catch (e) { fail(`download_location не вызван: ${net.describeError(e)} — без него кадр не ставим; повторить позже.`); }
    const u = unsplashMarkup(c, { role, cropMobile: o.cropMobile, caption: o.caption, need: o.need || 0 });
    u.warnings.unshift(...dups);
    const rec = {
      name: o.name, kind: 'photo', role, source: c.source, source_id: c.id, title: c.title || '', page_url: c.page_url, file_url: c.raw_url,
      author: c.author, author_url: c.author_url, license: c.license, license_code: c.license_code, license_url: c.license_url,
      attribution_required: true, attribution_text: c.attribution_text, unsplash_url: unsplashLink(c, net.key('UNSPLASH_APP_NAME') || 'site_rework'),
      changes: 'Изменено: нет (показ по ссылкам images.unsplash.com с параметрами размера).',
      seen: o.seen, caption: o.caption, flags: c.flags || [], ok_flags: !!opt['ok-flags'], original: c.orig, files: [], urls: u.urls,
      look: { look: o.look, contrast: o.contrast, grain: o.grain }, hotlink: true, query: m.query, date: today(),
    };
    rec.credit_need = creditNeed(rec);
    saveCredit(o.dest, rec);
    log(`\nКадр №${N} (Unsplash, ${c.author}) — показ по ссылкам images.unsplash.com, download_location вызван.`);
    for (const w of u.warnings) log(`  ! ${w}`);
    const cssNotes = (o.look !== 'none' || o.contrast || o.grain) ? cssLook(o.look, o.contrast, o.grain).map((x) => `  ${x}`) : [];
    if (cssNotes.length) cssNotes.unshift('Обработка для Unsplash — только CSS (в их файл ничего не впечь):');
    cssNotes.push('Нужен свой файл (пережать, впечь тон) — только ручное скачивание человеком на unsplash.com, потом import --license unsplash.');
    printTail(rec, u.markup, cssNotes, o.dest, u.warnings);
  } else {
    if (c.needs_manual) fail(`Кадр №${N}: в выдаче только превью. Скачайте файл вручную со страницы ${c.page_url} и используйте import.`, 2);
    /* файл — под обрезку --size (вертикальный кадр под 1000x700 — 1000 в ширину, а не 1280 по высоте) или под --need */
    const target = downloadTarget(c, o);
    let file = chooseFile(c, role, null, target);
    if (!file) fail(`У кадра №${N} нет файла для скачивания.`);
    log(`Скачиваю ${file.how || 'файл'}${file.width ? ` ${file.width}x${file.height || '?'}` : ''} (${c.source})…`);
    let got; const fallbackNotes = [];
    try { got = await fetchPhoto(c, file); } catch (e) {
      /* сервер отказал в этом файле (429/403) — следующий по величине вариант того же кадра, с честной пометкой */
      const alt = (e.status === 429 || e.status === 403) ? chooseFile(c, role, [file.url], target) : null;
      if (!alt || alt.url === file.url) fail(`Не скачался: ${net.describeError(e)}`);
      const why = e.status === 429 ? ' (429 — лимит частоты запросов: это временно, оригинал можно взять повторным pick позже)' : '';
      fallbackNotes.push(`${file.how} ${file.width || '?'}x${file.height || '?'} не отдан: ${net.describeError(e)}${why}; взят ${alt.how} ${alt.width || '?'}x${alt.height || '?'}`);
      log(`  ! ${fallbackNotes[0]}`);
      file = alt;
      try { got = await fetchPhoto(c, file); } catch (e2) { fail(`Не скачался и запасной вариант: ${net.describeError(e2)}`); }
    }
    const { rec, res, warnings } = await processAndCredit(sharp, c, got.buf, { url: file.url, bytes: got.bytes, sha256: got.sha256, format: got.format, expected: { width: file.width, height: file.height } }, o, { query: m.query, label: `№${N}`, pre: dups, target: target || undefined });
    const notes = fallbackNotes.map((x) => `Внимание: ${x}.`);
    if (/^openverse/.test(c.source)) notes.push('Openverse: сделано с помощью Openverse; Openverse не проверяет лицензии — страница источника в credits.json.');
    printTail(rec, res.markup, notes, o.dest, [...fallbackNotes, ...warnings]);
  }
  m.picked = [...(m.picked || []).filter((p) => p.name !== o.name), { n: N, source: c.source, id: c.id, name: o.name, role, dest: (path.relative(dir, o.dest) || '.').split(path.sep).join('/'), seen: o.seen, caption: o.caption, at: new Date().toISOString() }];
  writeManifest(dir, m);
}

/** Запись credits.json для ролика (поля — MEDIA_API.md). */
function videoRecord(c, resolved, enc, o, extra) {
  const rec = {
    name: o.name, kind: 'video', role: o.role, source: c.source, source_id: resolved.id ?? c.id, title: c.title || '', page_url: c.page_url, file_url: extra.file_url || '',
    author: c.author || '', author_url: c.author_url || '', license: resolved.license || c.license, license_code: resolved.license_code || c.license_code,
    license_url: resolved.license_url || c.license_url, license_evidence: resolved.license_evidence || null,
    attribution_required: !!(resolved.attribution_required ?? c.attribution_required), attribution_text: resolved.attribution_text || c.attribution_text || '',
    ...((resolved.share_alike ?? c.share_alike) ? { share_alike: true } : {}),
    changes: `Изменено: ${(enc.changes || []).join('; ') || 'нет'}.`, seen: o.seen, caption: o.caption, flags: c.flags || [], ok_flags: !!opt['ok-flags'],
    original: enc.original || null, cut: enc.cut || null, files: (enc.files || []).map(({ file, width, height, bytes, format, codec, group }) => ({ file, width, height, bytes, format, codec, group })),
    poster: enc.poster || null, budget: enc.budget || null, checks: enc.checks?.seam ? { seam: enc.checks.seam } : null,
    look: { look: o.look, contrast: o.contrast, grain: o.grain }, hotlink: false, query: extra.query || '', date: today(),
    ...(extra.note ? { note: extra.note } : {}),
  };
  rec.credit_need = creditNeed(rec);
  return rec;
}
function budgetLines(b) {
  if (!b) return [];
  const out = [];
  if (b.desktop_ok === false) out.push(`бюджет десктопа превышен: ${mb(b.desktop_bytes)} при норме 2.5MB`);
  if (b.mobile_ok === false) out.push(`бюджет телефона превышен: ${mb(b.mobile_bytes)} при норме 1.0MB`);
  if (b.desktop_ok !== false && b.mobile_ok !== false && (b.desktop_bytes || b.mobile_bytes)) log(`  бюджет: OK десктоп ${mb(b.desktop_bytes)} (≤2.5MB), телефон ${mb(b.mobile_bytes)} (≤1.0MB)`);
  return [...out, ...(b.notes || [])];
}

/* ---------- import ---------- */

async function cmdImport() {
  checkValueOpts(2);
  const pageUrl = str(pos[1]); const fileArg = str(pos[2]);
  if (!/^https?:\/\//.test(pageUrl)) fail('Использование: node media.mjs import <url страницы> [<url или путь файла>] --license <id> --seen "…" --caption "…"');
  const lic = resolveLicense(opt.license);
  if (!lic) fail(`--license ${opt.license || '(нет)'}: только из белого списка — ${Object.keys(LICENSES).join(', ')}. CC BY, BY-SA, NC, ND для фото не берём.`, 2);
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  const isLocal = fileArg && !/^https?:\/\//.test(fileArg);
  const isVideo = lic.video || /\.(mp4|webm|mov)(\?|$)/i.test(fileArg);
  const text = `${decodeURIComponent(new URL(pageUrl).pathname).replace(/[-_/]+/g, ' ')} ${fileArg ? path.basename(fileArg).replace(/[-_.]+/g, ' ') : ''}`;
  const flags = flagsFor(text, '', 'photo');

  /* исходный адрес файла: у локального пути его даёт --file-url (пишется в credits.json) */
  const fileUrlOpt = str(opt['file-url']).trim();
  if (fileUrlOpt && !/^https?:\/\//.test(fileUrlOpt)) fail(`--file-url ${fileUrlOpt}: нужен адрес http(s) файла у источника`, 2);
  const originUrl = isLocal ? fileUrlOpt : fileArg;

  /* проверки по источнику */
  if (lic.id === 'foodiesfeed') {
    /* нейросеть видно только по пути файла у источника (/generated/); по локальному пути её не узнать */
    if (/\/generated\//i.test(`${pageUrl} ${originUrl}`)) fail('Foodiesfeed: файл из /generated/ сделан нейросетью — выдуманная еда на сайте клиента недопустима. Берите кадры из /legacy/ или /uploads/.', 2);
    if (!originUrl) fail('Foodiesfeed: у скачанного файла не видно, фото это или кадр нейросети. Передайте адрес файла вторым аргументом или добавьте --file-url <адрес файла на Foodiesfeed> (путь с /legacy/ или /uploads/).', 2);
    if (!/\/(legacy|uploads)\//i.test(new URL(originUrl).pathname)) fail(`Foodiesfeed: адрес файла ${originUrl} не из /legacy/ или /uploads/ — фото там; /generated/ и прочее не берём.`, 2);
  }
  if (lic.id === 'kaboompics' && !opt['not-editorial']) fail('Kaboompics: подтвердите, что на странице кадра НЕТ пометки «Editorial Use Only» (такие в рекламу и на сайт нельзя) — флаг --not-editorial.', 2);
  if (lic.id === 'mixkit-free' && !/(^|\.)mixkit\.co$/.test(host)) fail(`--license mixkit-free: страница должна быть на mixkit.co, а не ${host}.`, 2);
  if (lic.manual && fileArg && !isLocal) fail(`${lic.name}: файл скачивает человек в браузере (${lic.note || 'автоматика запрещена'}). Передайте путь к скачанному файлу вторым аргументом.`, 2);
  if (!fileArg && !(isVideo && lic.id === 'mixkit-free')) fail(`Нужен второй аргумент — адрес файла или путь к скачанному файлу. Страницу ${host} скрипт не разбирает.`, 2);
  if (isLocal && !fs.existsSync(fileArg)) fail(`Нет файла ${fileArg}`);
  /* файл по адресу Wikimedia/AIC скачивает скрипт — без контакта нельзя; скачанный человеком файл (путь) — можно */
  if (fileArg && !isLocal && net.contactBlocked(fileArg)) fail(`файл ${net.redact(fileArg).slice(0, 120)} не скачать: правила Wikimedia и AIC требуют контакт в User-Agent, а ${net.noContactHint()}. Или скачайте файл в браузере и передайте путь.`);

  const g = gate({ seen: opt.seen, caption: opt.caption, flags, okFlags: !!opt['ok-flags'] });
  if (!g.ok) { for (const s of g.messages) console.error(`FAIL: кадр не взят: ${s}`); process.exit(2); }
  const role = str(opt.role) || (isVideo ? 'loop' : 'section');
  if (!ROLES[role]) fail(`--role ${opt.role}: hero | section | card | loop`);
  /* по умолчанию — не в текущую папку (это может быть репозиторий), а в папку прогона */
  const o = { ...commonOpts(role, path.join(runBase(), 'media', 'import')), seen: String(opt.seen).trim(), caption: String(opt.caption).trim() };
  const baseName = str(opt.name) || `${role}-${host.split('.')[0]}-${path.basename(new URL(pageUrl).pathname) || 'img'}`;
  o.name = o.size ? exactFile(o, baseName) : slugify(baseName, 48);
  if (o.size && isVideo) fail('--size — для фото: ролик режется петлёй 1920x1080 / 1280x720 / 720x1280 (см. «Видео» в справке)', 2);
  const sharp = requireSharp();
  const c = {
    source: `import/${lic.id}`, id: new URL(pageUrl).pathname, title: str(opt.title), page_url: pageUrl,
    author: str(opt.author) || 'не указан', author_url: str(opt['author-url']),
    license: lic.name, license_code: lic.id, license_url: lic.url, attribution_required: lic.attribution,
    attribution_text: `${str(opt.title) ? `«${str(opt.title)}» — ` : ''}${str(opt.author) || host}, ${lic.name} (${pageUrl})`, flags,
  };
  /* та же страница уже под другим именем (credits.json, свой или проекта) — WARN */
  const dups = dupNotes(o.dest, c, o.name);

  if (isVideo) {
    const video = await requireVideo();
    requireFfmpeg();
    const ctx = makeCtx(sharp);
    o.checkDir = path.join(net.CACHE_DIR, 'video', 'check');
    const cand = { ...c, kind: 'video', source: lic.id === 'mixkit-free' ? 'mixkit' : c.source, file: !fileArg ? null : isLocal ? { path: path.resolve(fileArg) } : { url: fileArg }, needs_resolve: !fileArg };
    const resolved = await videoStep(() => video.resolve(cand, { role, dest: o.dest, import: true, start: o.start, dur: o.dur }, ctx), 'ролик не взят');
    const enc = await videoStep(() => video.encode(resolved, o, ctx), 'ролик не пережат');
    const rec = videoRecord(cand, resolved, enc, o, { file_url: isLocal ? (fileUrlOpt || path.basename(fileArg)) : net.redact(resolved.url || fileArg || ''), note: lic.note || '' });
    saveCredit(o.dest, rec);
    log(`\nРолик с ${host} → ${o.dest}`); printFiles(enc.files || []);
    printVideoFacts(enc);
    const warnings = [...dups, ...(resolved.warnings || []), ...(enc.warnings || []), ...budgetLines(enc.budget)];
    for (const w of warnings) log(`  ! ${w}`);
    printTail(rec, enc.markup || '', lic.note ? [`Лицензия: ${lic.note}`] : [], o.dest, warnings);
    return;
  }

  let got;
  if (isLocal) {
    const buf = fs.readFileSync(fileArg);
    const sig = net.sniff(buf);
    if (!PHOTO_SIGS.includes(sig)) fail(`${fileArg}: не картинка (сигнатура ${sig || 'неизвестна'})`);
    got = { buf, bytes: buf.length, sha256: null, format: sig };
  } else {
    try { got = await fetchPhoto(c, { url: fileArg }); }
    catch (e) { fail(`Не скачался: ${net.describeError(e)}${/403/.test(String(e.message)) ? ' — сайт закрыт для скриптов: скачайте файл в браузере и передайте путь.' : ''}`); }
  }
  const { rec, res, warnings } = await processAndCredit(sharp, c, got.buf, { url: isLocal ? (fileUrlOpt || path.basename(fileArg)) : fileArg, bytes: got.bytes, sha256: got.sha256, format: got.format }, o, { note: lic.note || '', label: `с ${host}`, pre: dups });
  printTail(rec, res.markup, lic.note ? [`Лицензия: ${lic.note}`] : [], o.dest, warnings);
}

/* ---------- credits ---------- */

function cmdCredits() {
  const dest = pos[1] && path.resolve(pos[1]);
  if (!dest) fail('Использование: node media.mjs credits <папка картинок сайта> [--md [<файл или папка>]]');
  const list = readCredits(dest);
  if (!list.length) fail(`В ${dest} нет ${path.basename(creditsTarget(dest).file)} или он пуст.${creditsTarget(dest).foreign ? ' (credits.json там — учёт проекта в своём виде; media.mjs пишет рядом credits-media.json)' : ''}`);
  const md = renderCreditsMd(list);
  log(md);
  const foot = footerLine(list); const polite = politeLine(list);
  if (foot) log(`Строка для подвала (подпись ОБЯЗАТЕЛЬНА, поставить до выкладки):\n${foot}${polite ? `\nВежливая строка — по желанию, можно в тот же блок:\n${polite}` : ''}`);
  else log(`Обязательной подписи нет.${polite ? ` Вежливая строка — по желанию:\n${polite}` : ''}`);
  if (opt.md) {
    let f = opt.md === true ? path.join(dest, 'CREDITS.md') : path.resolve(String(opt.md));
    /* --md <папка> — CREDITS.md в ней (раньше — отказ EISDIR) */
    try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'CREDITS.md'); } catch { /* файла ещё нет */ }
    ensureDir(path.dirname(f));
    const tail = foot ? `\n## Строка для подвала (обязательно)\n\n\`\`\`html\n${foot}\n\`\`\`\n${polite ? `\n## Вежливая строка (по желанию)\n\n\`\`\`html\n${polite}\n\`\`\`\n` : ''}` : polite ? `\n## Строка для подвала (по желанию)\n\n\`\`\`html\n${polite}\n\`\`\`\n` : '';
    fs.writeFileSync(f, md + tail);
    log(`\nЗаписано: ${f}`);
  }
  const noSeen = list.filter((r) => !r.seen || !r.caption).length;
  log(`\n${noSeen ? `WARN: у ${noSeen} записей нет --seen/--caption` : `OK: ${list.length} записей, у всех есть «что на кадре» и подпись`}${foot ? '; обязательная подпись нужна' : ''}.`);
}

/* ---------- запуск ---------- */

try {
  /* -h и --h — как --help у любой команды: справка, код 0, без сети и файлов */
  if (opt.help || opt.h || pos.includes('-h') || cmd === 'help') help(0);
  else if (opt.selftest) process.exit(await selftest({ opt, log }));
  else if (!cmd) help(0);
  else if (cmd === 'doctor') await cmdDoctor();
  else if (cmd === 'search') await cmdSearch();
  else if (cmd === 'pick') await cmdPick();
  else if (cmd === 'import') await cmdImport();
  else if (cmd === 'credits') cmdCredits();
  else if (cmd === 'audit') { checkValueOpts(1); await cmdAudit({ pos, opt, log, fail }); }
  else { console.error(`FAIL: неизвестная команда «${cmd}»\n`); help(1); }
} catch (e) {
  console.error(`FAIL: ${net.describeError(e)}`);
  process.exit(1);
}
