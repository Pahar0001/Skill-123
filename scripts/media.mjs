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
 *       [--orient landscape|portrait|square] [--min <px по длинной стороне>]
 *       [--sources a,b,...]              свой список и порядок источников
 *       [--n 24]                         сколько кадров на лист (до 60)
 *       [--frames 8|all]                 видео Commons: у скольких роликов собрать кадры из
 *                                        середины (2–4 с на кадр, строго по одному; по умолчанию 8)
 *       [--out <папка>] [--run <slug или url сайта>] [--fresh (без кэша ответов API)]
 *     → <папка>/cand/NN.jpg, sheet-1.jpg…, manifest.json (пути относительно папки).
 *       По умолчанию <папка> = ~/.claude/site-rework/runs/<slug>/media/<запрос>.
 *       На листе: номер, источник, РЕАЛЬНЫЙ размер файла, который скачается
 *       под роль («из N» — если оригинал больше), лицензия, пометки (people?
 *       brand? text-or-currency? art? ai? term? small); у видео — длительность,
 *       размер и вес файла. Лист ОБЯЗАТЕЛЬНО открыть глазами (Read): пометки по
 *       словам пропускают чужие ценники и вывески.
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
 *     Ворота: без --seen/--caption, --seen меньше трёх разных слов (точки, повторы
 *     не проходят), кадр с пометками без --ok-flags — код 2. Никогда не
 *     растягивает; размер меряется по скачанному файлу. Пишет credits.json в
 *     папку назначения и печатает готовую разметку.
 *     Unsplash: файл не пережимается, разметка — по их ссылкам (правило API).
 *
 *   node media.mjs import <url страницы> [<url или путь файла>] --license <id>
 *       [--author "…"] [--author-url …] [--title "…"] [--not-editorial]
 *       [--file-url <адрес файла у источника>]  для локального файла: откуда он (в credits.json)
 *       --seen … --caption … [и все флаги обработки pick: --ok-flags --role --name
 *       --dest --look --contrast --grain --crop-mobile --ratio --src-prefix --avif
 *       --start --dur] [--run <slug>]
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
 *   node media.mjs credits <папка картинок сайта> [--md [<файл>]]
 *     таблица авторов и лицензий (--md — записать CREDITS.md), строка для
 *     подвала: обязательная (CC BY/BY-SA, Unsplash из API) или вежливая (Pexels,
 *     Unsplash через import, музеи).
 *
 *   Видео (--kind video): источники pexels → pixabay (ключи) → commons → mixkit (одна
 *     страница выдачи на запрос, лицензия videoFree проверяется в pick). По умолчанию
 *     горизонтальные ролики. pick режет петлю без шва (наплыв), убирает звук, делает
 *     1920x1080 H.264 + VP9, телефон 1280x720 и вертикальный 720x1280 (или меньше —
 *     не растягивает), постер из кадра стыка; бюджет 2.5 МБ десктоп / 1 МБ телефон
 *     (иначе CRF +2). Печатает шов петли числом и лист из 4 кадров для глаз
 *     (<папка поиска>/check/<имя>-frames.jpg). 4K на сайт не отдаётся. Нужен ffmpeg.
 *
 *   node media.mjs <команда> --help (или -h, --h) — эта справка, код 0; команда при этом
 *     не выполняется: ни сети, ни файлов.
 *
 * Ключи: окружение или ~/.claude/site-rework/.env (образец — .env.example рядом):
 * PEXELS_API_KEY UNSPLASH_ACCESS_KEY PIXABAY_API_KEY SI_API_KEY MEDIA_CONTACT
 * (UNSPLASH_APP_NAME — имя приложения из кабинета Unsplash, идёт в utm ссылок подписи;
 * без него — site_rework, doctor предупреждает). Без ключа источник пропускается.
 * MEDIA_CONTACT — контакт для User-Agent (Wikimedia, AIC); личные данные не подставляются.
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
import { loadSharp, getFfmpeg, parseArgs, ensureDir } from './lib.mjs';
import * as net from './media/net.mjs';
import { SOURCES, PROFILES, chooseFile, flagsFor, headersFor, ORIENT } from './media/photo.mjs';
import { ROLES, MAX_GRAIN, makePreview, makeMosaic, hamming, buildSheets, processPhoto, applyLook, unsplashMarkup, cssLook, slugify, kb, mb, parseLook, parseRatio, orientedSize, headerDims } from './media/process.mjs';
import { readManifest, writeManifest, gate, resolveLicense, LICENSES, saveCredit, readCredits, renderCreditsMd, footerLine, politeLine, creditNeed, unsplashLink } from './media/manifest.mjs';

/* Значения флагов берутся «как у всех»: следующий аргумент, если он не похож на
   другой флаг. Поэтому `--seen --ok-flags` не съест --ok-flags как описание. */
const FLAGS = ['ok-flags', 'fresh', 'not-editorial', 'help', 'h'];
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: FLAGS });
const cmd = pos[0];
const log = (...a) => console.log(...a);
/* код 2 — кадр не взят по воротам или по правилам лицензии; 1 — прочие сбои */
const fail = (msg, code = 1) => { console.error(`FAIL: ${msg}`); process.exit(code); };
const str = (v) => (typeof v === 'string' ? v : '');
const long = (w, h) => Math.max(w || 0, h || 0);
const today = () => new Date().toISOString().slice(0, 10);
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
function runSlug() {
  const run = str(opt.run) || '_media';
  return /^https?:\/\//.test(run) ? new URL(run).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-') : slugify(run, 60);
}
function searchDir(q, kind, profile) {
  if (opt.out) return path.resolve(String(opt.out));
  const suffix = kind === 'video' ? '-video' : profile === 'art' ? '-art' : '';
  return path.join(RUNS, runSlug(), 'media', `${slugify(q, 60)}${suffix}`);
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
  const uses = { PEXELS_API_KEY: 'pexels (фото, видео)', UNSPLASH_ACCESS_KEY: 'unsplash', PIXABAY_API_KEY: 'pixabay (фото ≤1280, видео)', SI_API_KEY: 'smithsonian (art)', MEDIA_CONTACT: 'контакт в User-Agent (Wikimedia, AIC)' };
  const missing = missingKeys();
  for (const k of net.KEY_NAMES) {
    const ok = !missing.includes(k);
    log(`  ${ok ? 'OK  ' : 'WARN'} ${k.padEnd(20)} ${ok ? 'задан' : net.key(k) ? 'задан, но пуст без скобок и переводов строк' : 'не задан'} — ${uses[k]}`);
  }
  log(`  User-Agent: ${net.contact() ? 'с контактом из MEDIA_CONTACT' : net.userAgent()}`);
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
    ...Object.entries(SOURCES).map(([name, s]) => ({ name, url: s.host, headers: s.hdr === 'aic' ? { 'AIC-User-Agent': net.userAgent() } : {}, key: s.key })),
    { name: 'thumb.wikimedia (копии Commons)', url: 'https://thumb.wikimedia.org/', method: 'HEAD' },
    { name: 'images.unsplash (файлы)', url: 'https://images.unsplash.com/', method: 'HEAD' },
    { name: 'images.pexels (файлы)', url: 'https://images.pexels.com/', method: 'HEAD' },
    { name: 'cdn.pixabay (файлы)', url: 'https://cdn.pixabay.com/', method: 'HEAD' },
    { name: 'videos.pexels (видео)', url: 'https://videos.pexels.com/', method: 'HEAD' },
    { name: 'mixkit (видео, поштучно)', url: 'https://mixkit.co/', method: 'HEAD' },
  ];
  /* Wikimedia — строго по одному: net.mjs ставит их в очередь сам */
  const res = await Promise.all(probes.map(async (p) => ({ p, r: await net.probe(p.url, { headers: p.headers || {}, method: p.method || 'GET' }) })));
  let warn = 0;
  for (const { p, r } of res) {
    const keyNote = p.key && !net.key(p.key) ? ` · без ${p.key} источник пропускается` : '';
    if (r.ok) log(`  OK   ${p.name.padEnd(32)} HTTP ${r.status} за ${(r.ms / 1000).toFixed(1)} с (${r.via === 'dns' ? 'DNS' : r.via})${keyNote}`);
    else { warn++; log(`  WARN ${p.name.padEnd(32)} ${r.error}${keyNote}`); }
  }
  const doh = [...net.dnsStats.entries()].filter(([, v]) => v !== 'dns');
  if (doh.length) log(`  имя найдено через DoH (системный DNS не ответил): ${doh.map(([h, v]) => `${h} → ${v}`).join(', ')}`);

  /* Незаданные ключи — отдельный WARN: пробы отвечают и без ключей, но источники без ключа
     search пропускает, а без MEDIA_CONTACT Commons и AIC получают безымянный User-Agent. */
  if (missing.length) {
    log(`\nWARN: не заданы ключи (${missing.length} из ${net.KEY_NAMES.length}): ${missing.join(', ')} — чем грозит:`);
    for (const k of missing) log(`  · ${k.padEnd(20)} ${KEY_RISK[k]}`);
    const has = (k) => !missing.includes(k);
    if (!has('PEXELS_API_KEY') && !has('UNSPLASH_ACCESS_KEY')) log('  → фото на первый экран — в основном Commons (CC0 из раннего Unsplash); Openverse — только карточки.');
    if (!has('PEXELS_API_KEY') && !has('PIXABAY_API_KEY')) log('  → видео-петли — только Commons (шумная выдача, чаще CC BY) и Mixkit поштучно; нужен PEXELS_API_KEY или PIXABAY_API_KEY.');
    if (!has('MEDIA_CONTACT')) log('  → до поиска на Commons и в AIC спросить у пользователя контакт (адрес сайта студии или рабочую почту) и записать MEDIA_CONTACT=… в ~/.claude/site-rework/.env; почту из git или профиля самому не брать.');
    /* Образец лежит рядом с .env (~/.claude/site-rework/.env.example), не в папке скилла; нет файла — путь не печатаем. */
    const sample = path.join(net.HOME_DIR, '.env.example');
    log(`  Ключи кладутся в ${net.ENV_FILE}${fs.existsSync(sample) ? ` (образец — ${sample})` : ''} или в окружение; без ключа источник пропускается, остальные работают.`);
  }

  const parts = [];
  if (warn) parts.push(`${warn} проб не прошли — это временно (DNS VPN, лимиты), повторить позже; источник из-за этого не вычёркивать`);
  if (missing.length) {
    const what = [missing.some((k) => k !== 'MEDIA_CONTACT') ? 'часть источников недоступна' : '', missing.includes('MEDIA_CONTACT') ? 'Commons и AIC идут без контакта в User-Agent (спросить контакт у пользователя)' : ''].filter(Boolean).join(', ');
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
  MEDIA_CONTACT: 'Commons (Wikimedia) и AIC получают User-Agent без контакта — вопреки их правилам: запросы могут блокировать, оригиналы Commons чаще отвечают 429, запросы идут строго по одному с паузой',
};
/** Незаданные ключи по порядку net.KEY_NAMES; MEDIA_CONTACT, который после очистки пуст, считается незаданным. */
function missingKeys() {
  return net.KEY_NAMES.filter((k) => !(k === 'MEDIA_CONTACT' ? net.contact() : net.key(k)));
}

/* ---------- search ---------- */

async function cmdSearch() {
  const q = str(pos[1]).trim();
  if (!q) fail('Нет запроса. Пример: node media.mjs search "bakery bread" --kind photo --role hero');
  const kind = str(opt.kind) || 'photo';
  if (!['photo', 'video'].includes(kind)) fail(`--kind ${opt.kind}: photo или video`);
  const profile = kind === 'video' ? 'video' : (str(opt.profile) || 'photo');
  if (kind === 'photo' && !PROFILES[profile]) fail(`--profile ${opt.profile}: photo или art`);
  const role = str(opt.role) || (kind === 'video' ? 'loop' : 'section');
  if (!ROLES[role]) fail(`--role ${opt.role}: hero | section | card | loop`);
  /* видео для фона первого экрана — горизонтальное, если не попросили другое */
  const orient = str(opt.orient) || (kind === 'video' ? 'landscape' : null);
  if (orient && !ORIENT[orient]) fail(`--orient ${orient}: landscape | portrait | square`);
  const n = Math.max(1, Math.min(60, Number(opt.n) || 24));
  const min = Number(opt.min) || ROLES[role].min;
  const sharp = requireSharp();
  const dir = searchDir(q, kind, profile);
  /* новый лист собирается во временной подпапке и заменяет прежний только при успехе:
     повтор поиска при сбое сети не должен стирать готовый лист и отметки pick */
  ensureDir(dir);
  const work = path.join(dir, `.search-tmp-${process.pid}`);
  fs.rmSync(work, { recursive: true, force: true });
  ensureDir(path.join(work, 'cand'));
  const dropWork = () => { try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* останется служебная папка */ } };
  process.on('exit', dropWork);
  const o = { n, role, orient, min, fresh: !!opt.fresh, log, query: q };

  log(`Запрос «${q}» · ${kind}${kind === 'photo' ? ` · профиль ${profile}` : ''} · роль ${role} (нужно ${ROLES[role].ladder[0]} px по длинной стороне, минимум ${min})${orient ? ` · ${orient}` : ''}`);
  if (kind === 'video' && opt.profile) log('  (--profile для видео не используется)');
  const status = {};
  let lists = [];

  if (kind === 'video') {
    const video = await requireVideo();
    let r;
    try { r = await video.search(q, { ...o, sources: opt.sources ? splitList(opt.sources) : null, frames: opt.frames === undefined ? null : String(opt.frames) }, makeCtx(sharp)); }
    catch (e) { fail(`видео-поиск: ${net.describeError(e)}`); }
    Object.assign(status, r.status || {});
    for (const [name, st] of Object.entries(r.status || {})) log(`  ${st.state === 'ok' ? 'OK  ' : st.state === 'skip' ? 'SKIP' : 'WARN'} ${name.padEnd(17)} ${st.message || ''}`);
    const by = new Map();
    for (const c of r.items || []) { if (!by.has(c.source)) by.set(c.source, []); by.get(c.source).push(c); }
    lists = [...by.values()];
  } else {
    const names = opt.sources ? splitList(opt.sources) : PROFILES[profile];
    const bad = names.filter((s) => !SOURCES[s]);
    if (bad.length) fail(`Неизвестные источники: ${bad.join(', ')}. Есть: ${Object.keys(SOURCES).join(', ')}`);
    for (const name of names) {
      const src = SOURCES[name];
      const slow = ['met', 'rijks'].includes(name);
      try {
        const r = await src.search(q, { ...o, n: slow ? Math.min(n, 10) : n });
        if (r.skip) { status[name] = { state: 'skip', message: r.skip }; log(`  SKIP ${name.padEnd(17)} ${r.skip}`); continue; }
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
    } else log(`\nFAIL: ни одного кандидата. Короче запрос (2–3 слова по-английски), другой синоним, --role card или ключ Pexels/Unsplash.${keepNote}`);
    for (const f of failures.slice(0, 5)) log(`  ! ${f}`);
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
  log(`\n${temp ? `WARN: лист готов, ${cands.length} кадров; ${tempWhat} — временная ошибка, повторить позже.` : `OK: лист готов, ${cands.length} кадров.`}`);
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
  return {
    role, look: str(opt.look) || 'none', contrast, grain, cropMobile: str(opt['crop-mobile']) || null, ratio: str(opt.ratio) || null,
    dest, srcPrefix: prefix, avif, start: numOpt('start', 0, 36000), dur: numOpt('dur', 2, 60), fade: numOpt('fade', 0.2, 3),
  };
}

function printFiles(files, source) {
  for (const f of files) log(`  ${String(f.file).padEnd(40)} ${String(`${f.width}x${f.height}`).padEnd(10)} ${kb(f.bytes).padStart(8)}${f.codec && f.group ? `  ${f.group}` : ''}`);
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
  const notes = [];
  const exp = meta.expected || {};
  if (exp.width && (Math.abs(exp.width - real.width) > 2 || (exp.height && Math.abs(exp.height - real.height) > 2))) notes.push(`по файлу ${real.width}x${real.height}, выдача обещала ${exp.width}x${exp.height || '?'} — дальше считаем по файлу`);
  if (c.orig?.width && long(real.width, real.height) < long(c.orig.width, c.orig.height) - 2 && long(real.width, real.height) < ROLES[o.role].ladder[0]) {
    notes.push(`оригинал ${c.orig.width}x${c.orig.height}, достижимая копия — ${real.width}x${real.height}`);
  }
  /* сервер мог растянуть копию больше оригинала (Commons так делает) — ложное разрешение не берём */
  if (c.orig?.width && long(real.width, real.height) > long(c.orig.width, c.orig.height) + 2) {
    fail(`Файл ${real.width}x${real.height} больше оригинала ${c.orig.width}x${c.orig.height}: сервер растянул копию. Такой кадр не берём — повторите pick с другой ролью или выберите другой кадр.`, 1);
  }
  const res = await processPhoto(sharp, buf, { ...o, name: o.name, caption: o.caption, seedKey: `${c.source}:${c.id}` });
  const changes = `Изменено: ${res.changes.join('; ')}.`;
  const rec = {
    name: o.name, kind: 'photo', role: o.role, source: c.source, source_id: c.id, title: c.title || '', page_url: c.page_url, file_url: net.redact(meta.url || ''),
    author: c.author || '', author_url: c.author_url || '', license: c.license, license_code: c.license_code, license_url: c.license_url,
    attribution_required: !!c.attribution_required, attribution_text: c.attribution_text || '', credit_need: '',
    changes, seen: o.seen, caption: o.caption, flags: c.flags || [], ok_flags: !!opt['ok-flags'],
    original: { width: real.width, height: real.height, bytes: meta.bytes || null, format: meta.format || real.format, sha256: meta.sha256 || null },
    files: res.files.map(({ file, width, height, bytes, format }) => ({ file, width, height, bytes, format })),
    look: { look: o.look, contrast: o.contrast, grain: o.grain }, hotlink: false, query: extra.query || '', date: today(),
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

function printTail(rec, markup, extraNotes = [], dest = '', warnings = []) {
  log(`\nРазметка:\n${markup}`);
  for (const nte of extraNotes) log(nte);
  log(`\nПодпись на сайте: ${rec.credit_need}${rec.attribution_text ? `\n  ${rec.attribution_text}${rec.attribution_required && !rec.hotlink ? ` ${rec.changes}` : ''}` : ''}`);
  if (rec.hotlink) log('  Правило API Unsplash: подписать кадр — имя автора и «Unsplash», обе ссылки с utm, рядом с кадром (лучше) или в общем блоке подписей; готовая строка — `media.mjs credits`.');
  if (rec.art) log(`  Произведение из общественного достояния (${rec.art.term || 'срок проверен'}): подписывать настоящими автором и названием, как иллюстрацию — не как товар и не под вымышленным именем.`);
  log(`  credits.json обновлён: ${path.join(dest, 'credits.json')}`);
  log('После вставки: открыть снимок страницы глазами (кадр на месте, текст поверх читается, подпись не противоречит кадру) и сверить с `media.mjs credits`.');
  log(`\n${warnings.length ? `WARN: кадр готов, но ${warnings.length === 1 ? 'есть замечание' : `есть замечания (${warnings.length})`} — см. «!» выше` : 'OK: кадр готов'}.`);
}

/* ---------- pick ---------- */

async function cmdPick() {
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
  o.name = slugify(str(opt.name) || `${role}-${c.source}-${c.id}`, 48);
  const sharp = requireSharp();

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
    const warnings = [...(resolved.warnings || []), ...(enc.warnings || []), ...budgetLines(enc.budget)];
    for (const w of warnings) log(`  ! ${w}`);
    printTail(rec, enc.markup || '', [], o.dest, warnings);
  } else if (c.hotlink_only) {
    /* Unsplash: событие скачивания обязательно, файл не пережимаем — ссылки их */
    const k = net.key('UNSPLASH_ACCESS_KEY');
    if (!k) fail('Кадр Unsplash: нужен UNSPLASH_ACCESS_KEY, чтобы сообщить о скачивании (download_location) — правило API.');
    try { await net.getJson(c.download_location, { headers: { authorization: `Client-ID ${k}`, 'accept-version': 'v1' } }); }
    catch (e) { fail(`download_location не вызван: ${net.describeError(e)} — без него кадр не ставим; повторить позже.`); }
    const u = unsplashMarkup(c, { role, cropMobile: o.cropMobile, caption: o.caption });
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
    let file = chooseFile(c, role);
    if (!file) fail(`У кадра №${N} нет файла для скачивания.`);
    log(`Скачиваю ${file.how || 'файл'}${file.width ? ` ${file.width}x${file.height || '?'}` : ''} (${c.source})…`);
    let got; const fallbackNotes = [];
    try { got = await fetchPhoto(c, file); } catch (e) {
      /* сервер отказал в этом файле (429/403) — следующий по величине вариант того же кадра, с честной пометкой */
      const alt = (e.status === 429 || e.status === 403) ? chooseFile(c, role, [file.url]) : null;
      if (!alt || alt.url === file.url) fail(`Не скачался: ${net.describeError(e)}`);
      const why = e.status === 429 ? ' (429 — лимит частоты запросов: это временно, оригинал можно взять повторным pick позже)' : '';
      fallbackNotes.push(`${file.how} ${file.width || '?'}x${file.height || '?'} не отдан: ${net.describeError(e)}${why}; взят ${alt.how} ${alt.width || '?'}x${alt.height || '?'}`);
      log(`  ! ${fallbackNotes[0]}`);
      file = alt;
      try { got = await fetchPhoto(c, file); } catch (e2) { fail(`Не скачался и запасной вариант: ${net.describeError(e2)}`); }
    }
    const { rec, res, warnings } = await processAndCredit(sharp, c, got.buf, { url: file.url, bytes: got.bytes, sha256: got.sha256, format: got.format, expected: { width: file.width, height: file.height } }, o, { query: m.query, label: `№${N}` });
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

  const g = gate({ seen: opt.seen, caption: opt.caption, flags, okFlags: !!opt['ok-flags'] });
  if (!g.ok) { for (const s of g.messages) console.error(`FAIL: кадр не взят: ${s}`); process.exit(2); }
  const role = str(opt.role) || (isVideo ? 'loop' : 'section');
  if (!ROLES[role]) fail(`--role ${opt.role}: hero | section | card | loop`);
  /* по умолчанию — не в текущую папку (это может быть репозиторий), а в папку прогона */
  const o = { ...commonOpts(role, path.join(RUNS, runSlug(), 'media', 'import')), seen: String(opt.seen).trim(), caption: String(opt.caption).trim() };
  const baseName = str(opt.name) || `${role}-${host.split('.')[0]}-${path.basename(new URL(pageUrl).pathname) || 'img'}`;
  o.name = slugify(baseName, 48);
  const sharp = requireSharp();
  const c = {
    source: `import/${lic.id}`, id: new URL(pageUrl).pathname, title: str(opt.title), page_url: pageUrl,
    author: str(opt.author) || 'не указан', author_url: str(opt['author-url']),
    license: lic.name, license_code: lic.id, license_url: lic.url, attribution_required: lic.attribution,
    attribution_text: `${str(opt.title) ? `«${str(opt.title)}» — ` : ''}${str(opt.author) || host}, ${lic.name} (${pageUrl})`, flags,
  };

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
    const warnings = [...(resolved.warnings || []), ...(enc.warnings || []), ...budgetLines(enc.budget)];
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
  const { rec, res, warnings } = await processAndCredit(sharp, c, got.buf, { url: isLocal ? (fileUrlOpt || path.basename(fileArg)) : fileArg, bytes: got.bytes, sha256: got.sha256, format: got.format }, o, { note: lic.note || '', label: `с ${host}` });
  printTail(rec, res.markup, lic.note ? [`Лицензия: ${lic.note}`] : [], o.dest, warnings);
}

/* ---------- credits ---------- */

function cmdCredits() {
  const dest = pos[1] && path.resolve(pos[1]);
  if (!dest) fail('Использование: node media.mjs credits <папка картинок сайта> [--md [<файл>]]');
  const list = readCredits(dest);
  if (!list.length) fail(`В ${dest} нет credits.json или он пуст.`);
  const md = renderCreditsMd(list);
  log(md);
  const foot = footerLine(list); const polite = politeLine(list);
  if (foot) log(`Строка для подвала (подпись ОБЯЗАТЕЛЬНА, поставить до выкладки):\n${foot}${polite ? `\nВежливая строка — по желанию, можно в тот же блок:\n${polite}` : ''}`);
  else log(`Обязательной подписи нет.${polite ? ` Вежливая строка — по желанию:\n${polite}` : ''}`);
  if (opt.md) {
    const f = opt.md === true ? path.join(dest, 'CREDITS.md') : path.resolve(String(opt.md));
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
  if (opt.help || opt.h || pos.includes('-h') || cmd === 'help' || !cmd) help(0);
  else if (cmd === 'doctor') await cmdDoctor();
  else if (cmd === 'search') await cmdSearch();
  else if (cmd === 'pick') await cmdPick();
  else if (cmd === 'import') await cmdImport();
  else if (cmd === 'credits') cmdCredits();
  else { console.error(`FAIL: неизвестная команда «${cmd}»\n`); help(1); }
} catch (e) {
  console.error(`FAIL: ${net.describeError(e)}`);
  process.exit(1);
}
