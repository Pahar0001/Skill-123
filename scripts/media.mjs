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
 *       ключи (только имена), доступность источников (с запасным DoH), sharp, ffmpeg
 *
 *   node media.mjs search "<запрос по-английски>" --kind photo|video
 *       [--profile photo|art] [--role hero|section|card|loop]
 *       [--orient landscape|portrait|square] [--min <px>] [--sources a,b,...]
 *       [--n 24] [--out <папка>] [--run <slug>] [--fresh]
 *     → <папка>/cand/NN.jpg, sheet-1.jpg…, manifest.json (пути относительно папки).
 *       По умолчанию <папка> = ~/.claude/site-rework/runs/<slug>/media/<запрос>.
 *       На листе: номер, источник, РЕАЛЬНЫЙ размер файла, который скачается
 *       под роль, лицензия, пометки (people? brand? text-or-currency? art? ai?
 *       term? small). Лист ОБЯЗАТЕЛЬНО открыть глазами (Read): пометки по словам
 *       пропускают чужие ценники и вывески.
 *
 *   node media.mjs pick <папка поиска> <N> --seen "<что на кадре>" --caption "<подпись/роль>"
 *       [--ok-flags] [--role …] [--name <имя>] [--dest <папка картинок сайта>]
 *       [--look none|duotone:#RRGGBB,#RRGGBB|mono] [--contrast 0..1] [--grain 0..0.06]
 *       [--crop-mobile 4:5] [--ratio 16:9] [--src-prefix img/] [--avif auto|on|off]
 *     Ворота: без --seen/--caption, с --seen из точек или повторов, с пометками
 *     без --ok-flags — код 2. Никогда не растягивает; размер меряется по файлу.
 *     Unsplash: файл не пережимается, разметка — по их ссылкам (правило API).
 *
 *   node media.mjs import <url страницы> [<url или путь файла>] --license <id>
 *       [--author "…"] [--author-url …] [--title "…"] [--not-editorial] --seen … --caption …
 *     Кадр выбрал человек на сайте без API (Kaboompics, Burst, Picjumbo,
 *     Foodiesfeed, Mixkit, Adobe Stock Free). Лицензии: cc0 pdm unsplash pexels
 *     pixabay kaboompics burst picjumbo foodiesfeed mixkit-free adobe-stock-free.
 *
 *   node media.mjs credits <папка картинок сайта> [--md <файл>]
 *     таблица авторов и лицензий, строка для подвала, если подпись обязательна.
 *
 * Ключи: окружение или ~/.claude/site-rework/.env (образец — .env.example рядом):
 * PEXELS_API_KEY UNSPLASH_ACCESS_KEY PIXABAY_API_KEY SI_API_KEY MEDIA_CONTACT.
 * Без ключа источник пропускается. Сетевые сбои — временные: «повторить позже».
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSharp, getFfmpeg, parseArgs, ensureDir } from './lib.mjs';
import * as net from './media/net.mjs';
import { SOURCES, PROFILES, chooseFile, flagsFor, headersFor, ORIENT } from './media/photo.mjs';
import { ROLES, MAX_GRAIN, makePreview, hamming, buildSheets, processPhoto, unsplashMarkup, cssLook, slugify, kb, mb, esc, parseLook, parseRatio, orientedSize, headerDims } from './media/process.mjs';
import { readManifest, writeManifest, gate, resolveLicense, LICENSES, saveCredit, readCredits, renderCreditsMd, footerLine, creditNeed } from './media/manifest.mjs';

const VALUES = ['kind', 'profile', 'role', 'orient', 'min', 'sources', 'n', 'out', 'run', 'seen', 'caption', 'name', 'dest', 'look', 'contrast', 'grain', 'crop-mobile', 'ratio', 'src-prefix', 'avif', 'license', 'author', 'author-url', 'title', 'md'];
const FLAGS = ['ok-flags', 'fresh', 'not-editorial', 'help'];
const { pos, opt } = parseArgs(process.argv.slice(2), { values: VALUES, flags: FLAGS });
const cmd = pos[0];
const log = (...a) => console.log(...a);
const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };
const str = (v) => (typeof v === 'string' ? v : '');
const long = (w, h) => Math.max(w || 0, h || 0);
const today = () => new Date().toISOString().slice(0, 10);
const RUNS = process.env.SITE_REWORK_RUNS || path.join(os.homedir(), '.claude', 'site-rework', 'runs');

/* ---------- видео: точка подключения ---------- */

/*
 * Видео-источники и ffmpeg живут в ./media/video.mjs (контракт — MEDIA_API.md):
 *   search(query, opts, ctx) → { items: Candidate[], status: {имя: {state, message}} }
 *   resolve(candidate, opts, ctx) → Resolved (файл под роль, HEAD, проверка лицензии)
 *   encode(resolved, opts, ctx) → { files, poster, markup, changes, warnings, original, cut, budget }
 */
async function loadVideo() {
  const f = new URL('./media/video.mjs', import.meta.url);
  if (!fs.existsSync(fileURLToPath(f))) return null;
  const m = await import(f.href);
  for (const fn of ['search', 'resolve', 'encode']) if (typeof m[fn] !== 'function') throw new Error(`media/video.mjs не экспортирует ${fn}() — см. MEDIA_API.md`);
  return m;
}
function makeCtx(sharp) {
  return {
    net, sharp, ffmpeg: getFfmpeg(), cacheDir: net.CACHE_DIR, log, ROLES,
    flagsFor, slugify, cssLook, parseLook, parseRatio, MAX_GRAIN,
    /** Обработать кадр (постер) той же обработкой, что фото: --look/--contrast/--grain. */
    processStill: (buf, o) => processPhoto(sharp, buf, o),
  };
}

/* ---------- вспомогательное ---------- */

function requireSharp() {
  const sharp = loadSharp();
  if (!sharp) fail('Нужен sharp: npm i sharp --prefix ~/.claude/site-rework (или запускать из проекта, где он установлен).');
  return sharp;
}
/** Убрать из манифеста служебное и возможные секреты в адресах. */
function sanitizeCand(c) {
  const { text, extraFlags, _buf, previewFile, ...rest } = c;
  return JSON.parse(JSON.stringify(rest).replace(/([?&](?:key|api_key|client_id)=)[^&"\\]+/gi, '$1***'));
}
function searchDir(q, kind, profile) {
  if (opt.out) return path.resolve(String(opt.out));
  const run = str(opt.run) || '_media';
  const slug = /^https?:\/\//.test(run) ? new URL(run).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-') : slugify(run, 60);
  const suffix = kind === 'video' ? '-video' : profile === 'art' ? '-art' : '';
  return path.join(RUNS, slug, 'media', `${slugify(q, 60)}${suffix}`);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

/* ---------- doctor ---------- */

async function cmdDoctor() {
  net.loadEnv();
  log(`media.mjs doctor · node ${process.version}`);
  log(`\nКлючи (окружение и ${net.ENV_FILE}: ${net.envFileExists() ? 'файл есть' : 'файла нет'}):`);
  const uses = { PEXELS_API_KEY: 'pexels (фото, видео)', UNSPLASH_ACCESS_KEY: 'unsplash', PIXABAY_API_KEY: 'pixabay (фото ≤1280, видео)', SI_API_KEY: 'smithsonian (art)', MEDIA_CONTACT: 'контакт в User-Agent (Wikimedia, AIC)' };
  for (const k of net.KEY_NAMES) log(`  ${net.key(k) ? 'OK  ' : 'WARN'} ${k.padEnd(20)} ${net.key(k) ? 'задан' : 'не задан'} — ${uses[k]}`);
  log(`  User-Agent: ${net.contact() ? 'с контактом из MEDIA_CONTACT' : net.userAgent()}`);

  const sharp = loadSharp();
  log(`\nsharp: ${sharp ? `OK ${sharp.versions?.sharp || ''} (libvips ${sharp.versions?.vips || '?'})` : 'FAIL не найден — npm i sharp --prefix ~/.claude/site-rework'}`);
  const ff = getFfmpeg();
  let ffv = '';
  if (ff) { try { ffv = execFileSync(ff, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 15000 }).split(/\r?\n/)[0]; } catch (e) { ffv = `не запустился: ${e.message}`; } }
  log(`ffmpeg: ${ff ? `OK ${ffv}` : 'WARN не найден — видео не пережать (npm i ffmpeg-static --prefix ~/.claude/site-rework)'}`);
  const vPath = fileURLToPath(new URL('./media/video.mjs', import.meta.url));
  log(`видео-модуль media/video.mjs: ${fs.existsSync(vPath) ? 'есть' : 'пока нет (search/pick --kind video недоступны)'}`);
  log(`кэш: ${net.CACHE_DIR}`);

  log('\nИсточники (проба с запасным DoH; любой HTTP-ответ = сервер отвечает):');
  const probes = [
    ...Object.entries(SOURCES).map(([name, s]) => ({ name, url: s.host, headers: s.hdr === 'aic' ? { 'AIC-User-Agent': net.userAgent() } : {}, key: s.key })),
    { name: 'thumb.wikimedia (копии Commons)', url: 'https://thumb.wikimedia.org/', method: 'HEAD' },
    { name: 'images.unsplash (файлы)', url: 'https://images.unsplash.com/', method: 'HEAD' },
    { name: 'images.pexels (файлы)', url: 'https://images.pexels.com/', method: 'HEAD' },
    { name: 'cdn.pixabay (файлы)', url: 'https://cdn.pixabay.com/', method: 'HEAD' },
    { name: 'videos.pexels (видео)', url: 'https://videos.pexels.com/', method: 'HEAD' },
    { name: 'mixkit (видео, вручную)', url: 'https://mixkit.co/', method: 'HEAD' },
  ];
  const res = await Promise.all(probes.map(async (p) => ({ p, r: await net.probe(p.url, { headers: p.headers || {}, method: p.method || 'GET' }) })));
  let warn = 0;
  for (const { p, r } of res) {
    const keyNote = p.key && !net.key(p.key) ? ` · без ${p.key} источник пропускается` : '';
    if (r.ok) log(`  OK   ${p.name.padEnd(32)} HTTP ${r.status} за ${(r.ms / 1000).toFixed(1)} с (${r.via === 'dns' ? 'DNS' : r.via})${keyNote}`);
    else { warn++; log(`  WARN ${p.name.padEnd(32)} ${r.error}${keyNote}`); }
  }
  log(`\n${warn ? `WARN: ${warn} проб не прошли — это временно (DNS VPN, лимиты), повторить позже; источник из-за этого не вычёркивать.` : 'OK: все пробы ответили.'}`);
  if (!net.contact()) log('WARN: нет MEDIA_CONTACT — к Wikimedia и AIC запросы идут строго по одному с паузой; контакт задаётся только этой переменной.');
  if (!net.key('PEXELS_API_KEY') && !net.key('UNSPLASH_ACCESS_KEY')) log('Без ключей Pexels/Unsplash фото на первый экран — только Commons (CC0 из раннего Unsplash); видео-петли — нужен PEXELS_API_KEY или PIXABAY_API_KEY.');
}

/* ---------- search ---------- */

async function cmdSearch() {
  const q = str(pos[1]).trim();
  if (!q) fail('Нет запроса. Пример: node media.mjs search "bakery bread" --kind photo --role hero');
  const kind = str(opt.kind) || 'photo';
  if (!['photo', 'video'].includes(kind)) fail(`--kind ${kind}: photo или video`);
  const profile = kind === 'video' ? 'video' : (str(opt.profile) || 'photo');
  if (kind === 'photo' && !PROFILES[profile]) fail(`--profile ${profile}: photo или art`);
  const role = str(opt.role) || (kind === 'video' ? 'loop' : 'section');
  if (!ROLES[role]) fail(`--role ${role}: hero | section | card | loop`);
  const orient = str(opt.orient) || null;
  if (orient && !ORIENT[orient]) fail(`--orient ${orient}: landscape | portrait | square`);
  const n = Math.max(1, Math.min(60, Number(opt.n) || 24));
  const min = Number(opt.min) || ROLES[role].min;
  const sharp = requireSharp();
  const dir = searchDir(q, kind, profile);
  ensureDir(path.join(dir, 'cand'));
  for (const f of fs.readdirSync(dir)) if (/^sheet-\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(dir, f));
  for (const f of fs.readdirSync(path.join(dir, 'cand'))) fs.unlinkSync(path.join(dir, 'cand', f));
  const o = { n, role, orient, min, fresh: !!opt.fresh, log, query: q };

  log(`Запрос «${q}» · ${kind}${kind === 'photo' ? ` · профиль ${profile}` : ''} · роль ${role} (нужно ${ROLES[role].ladder[0]} px, минимум ${min})${orient ? ` · ${orient}` : ''}`);
  const status = {};
  let lists = [];

  if (kind === 'video') {
    const video = await loadVideo();
    if (!video) fail('Видео-модуль media/video.mjs ещё не подключён (контракт — MEDIA_API.md).');
    const r = await video.search(q, { ...o, sources: opt.sources ? String(opt.sources).split(',').map((s) => s.trim()) : null }, makeCtx(sharp));
    Object.assign(status, r.status || {});
    for (const [name, st] of Object.entries(r.status || {})) log(`  ${st.state === 'ok' ? 'OK  ' : st.state === 'skip' ? 'SKIP' : 'WARN'} ${name.padEnd(17)} ${st.message || ''}`);
    const by = new Map();
    for (const c of r.items || []) { if (!by.has(c.source)) by.set(c.source, []); by.get(c.source).push(c); }
    lists = [...by.values()];
  } else {
    const names = opt.sources ? String(opt.sources).split(',').map((s) => s.trim()).filter(Boolean) : PROFILES[profile];
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

  /* файл под роль, ориентация, пометки */
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
  /* Порядок профиля с долями: первый источник — до 40% листа, второй — 25%,
     остальные — по 15%; недобор заполняется по тому же порядку. */
  const want = n + 8;
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

  /* превью, дубли по отпечатку */
  const cands = []; const failures = []; let dup = 0;
  const loaded = await pool(pre, 3, async (c) => {
    for (const u of [c.preview_url, c.preview_fallback].filter(Boolean)) {
      try {
        const r = await net.download(u, { headers: headersFor(c), timeout: 45000, maxBytes: 25 * 1048576 });
        const p = await makePreview(sharp, r.body);
        return { c, p };
      } catch (e) { c._err = net.describeError(e); }
    }
    failures.push(`${c.source} ${c.id}: ${c._err}`);
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
    fs.writeFileSync(path.join(dir, c.preview), x.p.jpeg);
    c.previewFile = path.join(dir, c.preview);
    cands.push(c);
  }

  const sheets = cands.length ? await buildSheets(sharp, cands, dir, { kind }) : [];
  const manifest = {
    version: 1, kind, profile, role, query: q, orient, min, n, created_at: new Date().toISOString(),
    status, sheets: sheets.map((s) => path.basename(s)), candidates: cands.map(sanitizeCand), picked: [],
  };
  writeManifest(dir, manifest);

  if (!cands.length) {
    const temp = Object.values(status).some((s) => s.state === 'temporary');
    log(`\nНи одного кандидата.${temp ? ' Часть источников ответила временной ошибкой — повторить позже.' : ''} Короче запрос (2–3 слова по-английски), другой синоним, --role card или ключ Pexels/Unsplash.`);
    for (const f of failures.slice(0, 5)) log(`  ! ${f}`);
    process.exit(temp ? 1 : 0);
  }
  log(`\nКандидатов: ${cands.length}${dup ? ` · дублей убрано ${dup}` : ''}${failures.length ? ` · превью не скачалось ${failures.length}` : ''}`);
  for (const f of failures.slice(0, 4)) log(`  ! ${f}`);
  for (const c of cands) {
    const f = c.file || {};
    const size = f.width ? `${f.width}x${f.height}` : '?';
    const extra = kind === 'video' ? ` ${c.duration ? Math.round(c.duration) + 's' : '?s'} ${f.bytes ? mb(f.bytes) : '?MB'}` : '';
    log(`  #${String(c.n).padStart(2, '0')} ${c.source.padEnd(18)} ${size.padEnd(10)}${extra} ${String(c.license).slice(0, 26).padEnd(26)} ${c.flags.join(' ')}  ${String(c.title || '').slice(0, 50)}`);
  }
  log(`\nОТКРЫТЬ ГЛАЗАМИ (Read): ${sheets.join(' , ')}\n  вблизи — ${path.join(dir, 'cand', 'NN.jpg')}`);
  log('  Пометки — только подсказка: ценники, вывески, валюту и лица видно лишь глазами.');
  log(`\nДальше: node media.mjs pick "${dir}" <N> --seen "что на кадре" --caption "подпись на сайте" --dest <папка сайта>/img --role ${role}`);
}

/* ---------- обработка и учёт (pick и import) ---------- */

function commonOpts(role, defaultDest) {
  const grain = opt.grain !== undefined ? Number(opt.grain) : 0;
  if (!(grain >= 0) || grain > MAX_GRAIN) fail(`--grain ${opt.grain}: от 0 до ${MAX_GRAIN}; сильное зерно — одним общим слоем CSS поверх страницы`, 2);
  const contrast = opt.contrast !== undefined ? Number(opt.contrast) : 0;
  if (!(contrast >= 0 && contrast <= 1)) fail(`--contrast ${opt.contrast}: от 0 до 1`, 2);
  try { parseLook(opt.look); parseRatio(opt['crop-mobile']); parseRatio(opt.ratio); } catch (e) { fail(e.message, 2); }
  const dest = path.resolve(str(opt.dest) || defaultDest);
  const prefix = str(opt['src-prefix']) || `${path.basename(dest)}/`;
  return { role, look: str(opt.look) || 'none', contrast, grain, cropMobile: str(opt['crop-mobile']) || null, ratio: str(opt.ratio) || null, dest, srcPrefix: prefix, avif: str(opt.avif) || 'auto' };
}

function printFiles(files, source) {
  for (const f of files) log(`  ${String(f.file).padEnd(34)} ${String(`${f.width}x${f.height}`).padEnd(10)} ${kb(f.bytes).padStart(8)}`);
  if (source) log(`  исходник (по скачанному файлу): ${source.width}x${source.height}${source.bytes ? `, ${kb(source.bytes)}` : ''}${source.format ? `, ${source.format}` : ''}`);
}

/** Скачать фото кадра, проверить код, сигнатуру и размер по самому файлу. */
async function fetchPhoto(c, file) {
  const r = await net.download(file.url, { headers: headersFor(c), timeout: 240000, maxBytes: 150 * 1048576 });
  const kindSig = net.sniff(r.body);
  if (!['jpeg', 'png', 'webp', 'tiff', 'gif', 'avif'].includes(kindSig)) throw new Error(`по адресу не картинка (сигнатура: ${kindSig || 'неизвестна'}, тип ${r.headers['content-type'] || '?'}) — ${net.redact(file.url).slice(0, 120)}`);
  return { buf: r.body, bytes: r.bytes, sha256: r.sha256, format: kindSig, contentType: r.headers['content-type'] || '' };
}

async function processAndCredit(sharp, c, buf, meta, o, extra = {}) {
  const real = await orientedSize(sharp, buf);
  const notes = [];
  const exp = meta.expected || {};
  if (exp.width && (Math.abs(exp.width - real.width) > 2 || (exp.height && Math.abs(exp.height - real.height) > 2))) notes.push(`по файлу ${real.width}x${real.height}, выдача обещала ${exp.width}x${exp.height || '?'} — дальше считаем по файлу`);
  if (c.orig?.width && long(real.width, real.height) < long(c.orig.width, c.orig.height) - 2 && long(real.width, real.height) < ROLES[o.role].ladder[0]) {
    const why = /wikimedia/.test(meta.url || '') && !net.contact() ? ' — Commons отдаёт оригинал целиком только клиентам с контактом в User-Agent (MEDIA_CONTACT)' : '';
    notes.push(`оригинал ${c.orig.width}x${c.orig.height}, достижимая копия — ${real.width}x${real.height}${why}`);
  }
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
    ...(c.art ? { art: { death_year: c.art.death_year, work_year: c.art.work_year, term: c.art.term?.why } } : {}),
    ...(extra.note ? { note: extra.note } : {}),
  };
  rec.credit_need = creditNeed(rec);
  saveCredit(o.dest, rec);
  log(`\nКадр ${extra.label || ''} (${c.source}, ${c.license}) → ${o.dest}`);
  printFiles(res.files, { ...real, bytes: meta.bytes });
  for (const w of [...notes, ...res.warnings]) log(`  ! ${w}`);
  return { res, rec };
}

function printTail(rec, markup, extraNotes = [], dest = '') {
  log(`\nРазметка:\n${markup}`);
  for (const nte of extraNotes) log(nte);
  log(`\nПодпись на сайте: ${rec.credit_need}${rec.attribution_text ? `\n  ${rec.attribution_text}${rec.attribution_required ? ` ${rec.changes}` : ''}` : ''}`);
  if (rec.art) log(`  Произведение из общественного достояния (${rec.art.term || 'срок проверен'}): подписывать настоящими автором и названием, как иллюстрацию — не как товар и не под вымышленным именем.`);
  log(`  credits.json обновлён: ${path.join(dest, 'credits.json')}`);
  log('После вставки: открыть снимок страницы глазами (кадр на месте, текст поверх читается, подпись не противоречит кадру) и сверить с `media.mjs credits`.');
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
  if (!g.ok) { for (const s of g.messages) console.error(`Кадр №${N} не взят: ${s}`); process.exit(2); }
  const role = str(opt.role) || m.role || 'section';
  if (!ROLES[role]) fail(`--role ${role}: hero | section | card | loop`);
  const o = { ...commonOpts(role, path.join(dir, 'picked')), seen: String(opt.seen).trim(), caption: String(opt.caption).trim() };
  o.name = slugify(str(opt.name) || `${role}-${c.source}-${c.id}`, 48);
  const sharp = requireSharp();

  if (m.kind === 'video') {
    const video = await loadVideo();
    if (!video) fail('Видео-модуль media/video.mjs ещё не подключён (контракт — MEDIA_API.md).');
    const ctx = makeCtx(sharp);
    const resolved = await video.resolve(c, { role, dest: o.dest }, ctx);
    const enc = await video.encode(resolved, o, ctx);
    const rec = {
      name: o.name, kind: 'video', role, source: c.source, source_id: c.id, title: c.title || '', page_url: c.page_url, file_url: net.redact(resolved.url || ''),
      author: c.author || '', author_url: c.author_url || '', license: resolved.license || c.license, license_code: c.license_code, license_url: resolved.license_url || c.license_url,
      license_evidence: resolved.license_evidence || null, attribution_required: !!(resolved.attribution_required ?? c.attribution_required), attribution_text: c.attribution_text || '',
      changes: `Изменено: ${(enc.changes || []).join('; ')}.`, seen: o.seen, caption: o.caption, flags: c.flags || [], ok_flags: !!opt['ok-flags'],
      original: enc.original || null, cut: enc.cut || null, files: enc.files || [], poster: enc.poster || null, budget: enc.budget || null,
      look: { look: o.look, contrast: o.contrast, grain: o.grain }, hotlink: false, query: m.query, date: today(),
    };
    rec.credit_need = creditNeed(rec);
    saveCredit(o.dest, rec);
    log(`\nРолик №${N} (${c.source}) → ${o.dest}`); printFiles(enc.files || []);
    for (const w of enc.warnings || []) log(`  ! ${w}`);
    printTail(rec, enc.markup || '', [], o.dest);
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
      attribution_required: false, attribution_text: c.attribution_text, changes: 'Изменено: нет (показ по ссылкам images.unsplash.com с параметрами размера).',
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
    printTail(rec, u.markup, cssNotes, o.dest);
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
      const why = /wikimedia/.test(file.url) && !net.contact() ? ' (Commons отдаёт оригиналы только клиентам с контактом в User-Agent — задайте MEDIA_CONTACT и повторите позже)' : '';
      fallbackNotes.push(`${file.how} ${file.width || '?'}x${file.height || '?'} не отдан: ${net.describeError(e)}${why}; взят ${alt.how} ${alt.width || '?'}x${alt.height || '?'}`);
      log(`  ! ${fallbackNotes[0]}`);
      file = alt;
      try { got = await fetchPhoto(c, file); } catch (e2) { fail(`Не скачался и запасной вариант: ${net.describeError(e2)}`); }
    }
    const { rec, res } = await processAndCredit(sharp, c, got.buf, { url: file.url, bytes: got.bytes, sha256: got.sha256, format: got.format, expected: { width: file.width, height: file.height } }, o, { query: m.query, label: `№${N}` });
    const notes = fallbackNotes.map((x) => `Внимание: ${x}.`);
    if (/^openverse/.test(c.source)) notes.push('Openverse: сделано с помощью Openverse; Openverse не проверяет лицензии — страница источника в credits.json.');
    printTail(rec, res.markup, notes, o.dest);
  }
  m.picked = [...(m.picked || []).filter((p) => p.name !== o.name), { n: N, name: o.name, role, dest: path.relative(dir, o.dest) || '.', seen: o.seen, caption: o.caption, at: new Date().toISOString() }];
  writeManifest(dir, m);
}

/* ---------- import ---------- */

async function cmdImport() {
  const pageUrl = str(pos[1]); const fileArg = str(pos[2]);
  if (!/^https?:\/\//.test(pageUrl)) fail('Использование: node media.mjs import <url страницы> [<url или путь файла>] --license <id> --seen "…" --caption "…"');
  const lic = resolveLicense(opt.license);
  if (!lic) fail(`--license ${opt.license || '(нет)'}: только из белого списка — ${Object.keys(LICENSES).join(', ')}. CC BY, BY-SA, NC, ND для фото не берём.`, 2);
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  const isLocal = fileArg && !/^https?:\/\//.test(fileArg);
  const text = `${decodeURIComponent(new URL(pageUrl).pathname).replace(/[-_/]+/g, ' ')} ${fileArg ? path.basename(fileArg).replace(/[-_.]+/g, ' ') : ''}`;
  const flags = flagsFor(text, '', 'photo');

  /* проверки по источнику */
  if (lic.id === 'foodiesfeed' && /\/generated\//i.test(`${pageUrl} ${fileArg}`)) fail('Foodiesfeed: файл из /generated/ сделан нейросетью — выдуманная еда на сайте клиента недопустима. Берите кадры из /legacy/ или /uploads/.', 2);
  if (lic.id === 'kaboompics' && !opt['not-editorial']) fail('Kaboompics: подтвердите, что на странице кадра НЕТ пометки «Editorial Use Only» (такие в рекламу и на сайт нельзя) — флаг --not-editorial.', 2);
  if (lic.manual && fileArg && !isLocal) fail(`${lic.name}: файл скачивает человек в браузере (${lic.note || 'автоматика запрещена'}). Передайте путь к скачанному файлу вторым аргументом.`, 2);
  if (!fileArg) fail(`Нужен второй аргумент — адрес файла или путь к скачанному файлу. Страницу ${host} скрипт не разбирает.`, 2);
  if (isLocal && !fs.existsSync(fileArg)) fail(`Нет файла ${fileArg}`);

  const g = gate({ seen: opt.seen, caption: opt.caption, flags, okFlags: !!opt['ok-flags'] });
  if (!g.ok) { for (const s of g.messages) console.error(`Кадр не взят: ${s}`); process.exit(2); }
  const role = str(opt.role) || 'section';
  if (!ROLES[role]) fail(`--role ${role}: hero | section | card | loop`);
  const o = { ...commonOpts(role, path.join(process.cwd(), 'media-import')), seen: String(opt.seen).trim(), caption: String(opt.caption).trim() };
  const baseName = str(opt.name) || `${role}-${host.split('.')[0]}-${path.basename(new URL(pageUrl).pathname) || 'img'}`;
  o.name = slugify(baseName, 48);
  const sharp = requireSharp();
  const c = {
    source: `import/${lic.id}`, id: new URL(pageUrl).pathname, title: str(opt.title), page_url: pageUrl,
    author: str(opt.author) || 'не указан', author_url: str(opt['author-url']),
    license: lic.name, license_code: lic.id, license_url: lic.url, attribution_required: lic.attribution,
    attribution_text: `${str(opt.title) ? `«${str(opt.title)}» — ` : ''}${str(opt.author) || host}, ${lic.name} (${pageUrl})`, flags,
  };

  if (lic.video || /\.(mp4|webm|mov)(\?|$)/i.test(fileArg)) {
    const video = await loadVideo();
    if (!video) fail('Видео-модуль media/video.mjs ещё не подключён (контракт — MEDIA_API.md).');
    const ctx = makeCtx(sharp);
    const cand = { ...c, kind: 'video', source: lic.id === 'mixkit-free' ? 'mixkit' : c.source, file: isLocal ? { path: path.resolve(fileArg) } : { url: fileArg } };
    const resolved = await video.resolve(cand, { role, dest: o.dest, import: true }, ctx);
    const enc = await video.encode(resolved, o, ctx);
    const rec = { ...c, name: o.name, kind: 'video', role, file_url: isLocal ? path.basename(fileArg) : net.redact(fileArg), license_evidence: resolved.license_evidence || null,
      changes: `Изменено: ${(enc.changes || []).join('; ')}.`, seen: o.seen, caption: o.caption, ok_flags: !!opt['ok-flags'], original: enc.original || null, cut: enc.cut || null,
      files: enc.files || [], poster: enc.poster || null, budget: enc.budget || null, hotlink: false, date: today(), note: lic.note || '' };
    rec.credit_need = creditNeed(rec);
    saveCredit(o.dest, rec);
    printFiles(enc.files || []); for (const w of enc.warnings || []) log(`  ! ${w}`);
    printTail(rec, enc.markup || '', [], o.dest);
    return;
  }

  let got;
  if (isLocal) {
    const buf = fs.readFileSync(fileArg);
    const sig = net.sniff(buf);
    if (!['jpeg', 'png', 'webp', 'tiff', 'gif', 'avif'].includes(sig)) fail(`${fileArg}: не картинка (сигнатура ${sig || 'неизвестна'})`);
    got = { buf, bytes: buf.length, sha256: null, format: sig };
  } else {
    try { got = await fetchPhoto(c, { url: fileArg }); }
    catch (e) { fail(`Не скачался: ${net.describeError(e)}${/403/.test(String(e.message)) ? ' — сайт закрыт для скриптов: скачайте файл в браузере и передайте путь.' : ''}`); }
  }
  const { rec, res } = await processAndCredit(sharp, c, got.buf, { url: isLocal ? path.basename(fileArg) : fileArg, bytes: got.bytes, sha256: got.sha256, format: got.format }, o, { note: lic.note || '', label: `с ${host}` });
  printTail(rec, res.markup, lic.note ? [`Лицензия: ${lic.note}`] : [], o.dest);
}

/* ---------- credits ---------- */

function cmdCredits() {
  const dest = pos[1] && path.resolve(pos[1]);
  if (!dest) fail('Использование: node media.mjs credits <папка картинок сайта> [--md <файл>]');
  const list = readCredits(dest);
  if (!list.length) fail(`В ${dest} нет credits.json или он пуст.`);
  const md = renderCreditsMd(list);
  log(md);
  const foot = footerLine(list);
  log(foot ? `Строка для подвала (подпись ОБЯЗАТЕЛЬНА, поставить до выкладки):\n${foot}` : 'Обязательной подписи нет. Вежливая строка — по желанию (см. раздел «По желанию»).');
  if (opt.md) {
    const f = opt.md === true ? path.join(dest, 'CREDITS.md') : path.resolve(String(opt.md));
    ensureDir(path.dirname(f));
    fs.writeFileSync(f, md + (foot ? `\n## Строка для подвала\n\n\`\`\`html\n${foot}\n\`\`\`\n` : ''));
    log(`\nЗаписано: ${f}`);
  }
}

/* ---------- запуск ---------- */

try {
  if (cmd === 'doctor') await cmdDoctor();
  else if (cmd === 'search') await cmdSearch();
  else if (cmd === 'pick') await cmdPick();
  else if (cmd === 'import') await cmdImport();
  else if (cmd === 'credits') cmdCredits();
  else {
    log(fs.readFileSync(new URL(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, ''));
    process.exit(cmd && cmd !== 'help' ? 1 : 0);
  }
} catch (e) {
  console.error(`Ошибка: ${net.describeError(e)}`);
  process.exit(1);
}
