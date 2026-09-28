#!/usr/bin/env node
/**
 * Статический сервер для зеркала или любой папки с HTML.
 *
 *   node serve.mjs <папка> [--port 4173] [--host 127.0.0.1] [--proxy https://original.site] [--no-compress]
 *   node serve.mjs --help
 *
 * <папка>   что отдавать; по умолчанию текущая папка.
 * --port    порт, по умолчанию 4173.
 * --host    на каком адресе слушать. По умолчанию только эта машина (127.0.0.1 и ::1):
 *           зеркало чужого сайта и черновики не видны в локальной сети. --host localhost —
 *           то же самое, оба адреса (одно имя Node слушал бы только по первому адресу из DNS,
 *           на Windows это ::1, и 127.0.0.1 оставался без сервера). --host 127.0.0.1, ::1
 *           или [::1] — только этот адрес (тоже только эта машина). --host 0.0.0.0 — открыть
 *           для телефона в той же сети (сервер предупредит).
 *           После запуска печатается, на каких адресах сервер слушает на самом деле: только
 *           127.x.x.x и ::1 — «Только эта машина», иначе WARN «папку видят другие устройства».
 *           Затем сервер сам подключается к своим адресам: не подключился ни к одному (на части
 *           машин к ::1 — EACCES, и --host ::1 делает сервер недоступным) — WARN с подсказкой.
 * --proxy   адрес оригинала (http или https) — лучше адрес самой страницы зеркала. Всё, чего
 *           нет в папке (API, формы, картинки по относительным адресам), и запросы кроме
 *           GET/HEAD уходят на оригинал от корня сайта — зеркало перестаёт сыпать 404 в консоль.
 *           Путь страницы (https://site.ru/sites/coffee/ → папка /sites/coffee/) — запасной:
 *           GET/HEAD, на который оригинал от корня ответил 404, спрашивается ещё раз от этой
 *           папки. Зеркало лежит в корне, и относительный адрес, который скрипт страницы собрал
 *           на ходу (img/photo.jpg), приходит от корня, а у оригинала живёт в папке страницы. Передаются метод, тело,
 *           Content-Type и Range; редирект на сам оригинал переписывается в локальный
 *           путь; ответа ждём до 60 с, иначе 502.
 * --no-compress  отдавать как есть, без сжатия (как до 24.09.2026) — например, чтобы увидеть
 *           вес сайта на хостинге, который не сжимает.
 * --help, -h  эта справка.
 *
 * Сжатие — как у хостинга (Caddy, nginx, Netlify): текстовые ответы — html, css, js/mjs, json,
 * map, webmanifest, xml, txt, csv, vtt, svg, wasm, gltf — от 512 байт сжимаются по заголовку
 * Accept-Encoding: br (качество 11, как у статических хостингов), иначе gzip (уровень 6);
 * q=0 и «identity» уважаются. Без сжатия на месте сайта с Three.js perf.mjs видел 691 КБ JS там,
 * где на бою 136 КБ br, и давал FAIL веса, которого у покупателя нет. Сжатый вариант файла
 * хранится в памяти (до 256 МБ, по пути, времени и размеру файла — правка файла сжимается заново);
 * первое обращение к крупному файлу дольше: brotli 11 — около секунды на 700 КБ. Ответ со сжатием —
 * Content-Encoding, Content-Length сжатого тела и Vary: Accept-Encoding (Vary — у всех сжимаемых
 * типов, и когда клиент сжатия не просил). Запрос с Range получает несжатый диапазон (206), как
 * у nginx. Картинки, шрифты, видео, glb не сжимаются — они уже сжаты. Ответы оригинала через
 * --proxy сжимаются так же (fetch их распаковал), сжатое запоминается по адресу и содержимому.
 * Больше 32 МБ — отдаётся как есть, потоком.
 *
 * Занятый порт. До запуска сервер пробует подключиться к 127.0.0.1:порт и [::1]:порт (и к
 * адресу из --host, если он не 0.0.0.0, не :: и не localhost). Ответил кто-то — «FAIL порт
 * занят», код 1. Так ловится и сервер, который слушает 0.0.0.0 или [::]: Windows позволяет
 * занять поверх него 127.0.0.1 и ::1, и без этой проверки новый сервер молча перехватил бы
 * localhost у старого. Если подключение не дали (на части машин к ::1 — EACCES) или ответа
 * нет, на Windows слушатели порта смотрятся в netstat; не удалось и там — WARN «не проверено».
 *
 * Браузеру — без кэша (Cache-Control: no-store), чтобы правки в rework.css были видны по F5;
 * сжатое сервер держит у себя и сжимает заново, когда файл изменился.
 * Отдаются только файлы внутри папки: «..», «%2e%2e», «%5c..», обратные слеши и ссылки
 * (symlink, junction), ведущие наружу, получают 403; скрытые файлы и папки (.git, .env —
 * всё, что начинается с точки, кроме .well-known) — тоже 403. Папка без «/» в конце
 * перенаправляется на «папка/» (иначе относительные адреса в её index.html уезжают на
 * уровень выше); «/about» отдаёт about.html, если такого файла без расширения нет.
 * Поддержаны HEAD и Range (206, Accept-Ranges, Content-Range, 416) — без Range видео
 * не перематывается и не прокручивается вслед за страницей. Типы: html, css, js, json,
 * svg, png, jpg, webp, avif, gif, woff/woff2/ttf/otf, mp4/webm/ogv/mov, mp3/ogg/wav,
 * glb/gltf, wasm и др.; неизвестное — application/octet-stream.
 *
 * Коды ответа: 200, 206, 301 (папка без «/»), 400 (плохой адрес), 403 (вне папки,
 * скрытый файл), 404, 405 (не GET/HEAD без --proxy), 416 (диапазон за концом файла),
 * 502 (оригинал не ответил). Код выхода: 0 после --help; 1 — нет папки, неверный
 * --port, --proxy или --host, порт занят (в том числе слушателем на 0.0.0.0 или [::]).
 * Файлов не пишет. Останавливать Ctrl+C.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { parseArgs } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2), { values: ['port', 'host', 'proxy'], flags: ['help', 'h', 'no-compress'] });
if (opt.help || opt.h || pos.includes('-h')) {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
  process.exit(0);
}
const die = (m) => { console.error(`FAIL ${m}`); process.exit(1); };
const root = path.resolve(pos[0] || '.');
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) die(`нет папки ${root}`);
const rootReal = fs.realpathSync.native(root);
const port = opt.port === undefined ? 4173 : Number(opt.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) die(`--port: целое число 1…65535, а не «${opt.port}»`);
let proxy = null, proxyDir = '/';
if (opt.proxy !== undefined) {
  let u; try { u = new URL(String(opt.proxy)); } catch { /* ниже */ }
  if (opt.proxy === true || !u || !/^https?:$/.test(u.protocol)) die(`--proxy: адрес оригинала вида https://site.ru, а не «${opt.proxy === true ? '' : opt.proxy}»`);
  /* страница просит ресурсы от корня сайта (/assets/…), поэтому оригинал — адрес сайта; путь страницы
     запоминается как её папка: зеркало лежит в корне, и относительный адрес, который скрипт страницы
     собирает на ходу (img/photo.jpg), приходит от корня — у оригинала он живёт в папке страницы */
  proxy = u.origin;
  proxyDir = u.pathname.replace(/[^/]*$/, '') || '/';
  if (u.search) console.log(`WARN --proxy: запрос «${u.search}» отброшен — он у каждого адреса свой`);
}
if (opt.host === true || (opt.host !== undefined && !String(opt.host).trim())) die('--host без адреса: --host 0.0.0.0 или --host 127.0.0.1');
/* адрес без скобок: [::1] → ::1. localhost — оба адреса этой машины, как без --host */
const host = opt.host !== undefined ? String(opt.host).trim().replace(/^\[(.*)\]$/, '$1') : null;
const hostIsLocalName = !!host && host.toLowerCase() === 'localhost';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
  '.png': 'image/png', '.apng': 'image/apng', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.jxl': 'image/jxl', '.ktx2': 'image/ktx2',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.usdz': 'model/vnd.usdz+zip', '.bin': 'application/octet-stream',
};

/* ---------- сжатие: br или gzip по Accept-Encoding, сжатое — в памяти ---------- */
const compress = !opt['no-compress'];
const MB = 1024 * 1024;
/* типы, которые сжимает хостинг (как encode у Caddy): текст, JS, JSON, XML, SVG, wasm, gltf */
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|manifest\+json|xml|wasm)|image\/svg\+xml|model\/gltf\+json)/i;
const MIN_COMPRESS = 512, MAX_COMPRESS = 32 * MB, CACHE_MAX = 256 * MB;
const gzipAsync = promisify(zlib.gzip), brotliAsync = promisify(zlib.brotliCompress);
const zippable = (type, size) => compress && COMPRESSIBLE.test(type) && size >= MIN_COMPRESS && size <= MAX_COMPRESS;
/* Accept-Encoding: «gzip, deflate, br, zstd», «br;q=0, gzip», «*;q=0.5», «identity». Равные веса — br */
function pickEncoding(header) {
  if (!header) return null;
  const q = {};
  for (const part of String(header).toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';'); if (!name) continue;
    let v = 1; for (const p of params) { const m = /^\s*q\s*=\s*([\d.]+)\s*$/.exec(p); if (m) v = Number(m[1]); }
    q[name.trim()] = Number.isFinite(v) ? v : 0;
  }
  const of = (e) => (e in q ? q[e] : '*' in q ? q['*'] : 0);
  const br = of('br'), gz = Math.max(of('gzip'), of('x-gzip'));
  if (br <= 0 && gz <= 0) return null;
  return br >= gz ? 'br' : 'gzip';
}
/* кэш сжатого: ключ → { promise, size }; порядок Map — порядок обращений, старое вытесняется сверх CACHE_MAX.
   Один и тот же файл, запрошенный дважды за время сжатия, сжимается один раз */
const zcache = new Map(); let zcacheBytes = 0;
function encoded(key, getBuf, enc) {
  const k = `${enc}|${key}`;
  const hit = zcache.get(k);
  if (hit) { zcache.delete(k); zcache.set(k, hit); return hit.promise; }
  const entry = { size: 0 };
  entry.promise = Promise.resolve().then(getBuf).then((buf) => (enc === 'br'
    ? brotliAsync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
    : gzipAsync(buf, { level: 6 })));
  zcache.set(k, entry);
  entry.promise.then((z) => {
    if (zcache.get(k) !== entry) return;
    entry.size = z.length; zcacheBytes += z.length;
    for (const [ok, ov] of zcache) { if (zcacheBytes <= CACHE_MAX || ok === k) break; zcache.delete(ok); zcacheBytes -= ov.size; }
  }, () => { if (zcache.get(k) === entry) zcache.delete(k); });
  return entry.promise;
}

/* внутри папки — значит, путь от корня не «..», не начинается с «..\» и не уходит на другой диск */
const within = (base, f) => { const rel = path.relative(base, f); return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)); };
const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };
const plain = (res, code, text, extra = {}) => { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra }); res.end(text); };

async function proxyTo(req, res, target) {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length && !['GET', 'HEAD'].includes(req.method) ? Buffer.concat(chunks) : undefined;
    const headers = { 'user-agent': req.headers['user-agent'] || 'site-rework-mirror', accept: req.headers.accept || '*/*' };
    for (const k of ['content-type', 'range', 'accept-language']) if (req.headers[k]) headers[k] = req.headers[k];
    let r = await fetch(target, { method: req.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(60000) });
    /* 404 от корня — тот же путь от папки страницы (--proxy с путём): так у оригинала разрешается
       относительный адрес, который скрипт страницы собрал уже в зеркале. Opara 28.09: img/photo-about1.jpg
       из базы → /img/… 404, у оригинала — /sites/coffee/img/… 200 */
    if (r.status === 404 && proxyDir !== '/' && ['GET', 'HEAD'].includes(req.method)) {
      const u = new URL(target);
      if (!u.pathname.startsWith(proxyDir)) {
        const alt = proxy + proxyDir + u.pathname.replace(/^\/+/, '') + u.search;
        const r2 = await fetch(alt, { method: req.method, headers, redirect: 'manual', signal: AbortSignal.timeout(60000) }).catch(() => null);
        if (r2 && r2.status !== 404) { r = r2; target = alt; }
      }
    }
    const h = { 'cache-control': 'no-store', 'x-proxied-from': target };
    for (const k of ['content-type', 'content-range', 'accept-ranges']) { const v = r.headers.get(k); if (v) h[k] = v; }
    const loc = r.headers.get('location');
    if (loc) h.location = loc.startsWith(proxy) ? loc.slice(proxy.length) || '/' : loc;
    /* fetch уже распаковал gzip/br, поэтому content-encoding оригинала не передаём: текст сжимаем
       сами, как свои файлы (сжатое — по адресу и содержимому), длину считаем заново */
    const buf = req.method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || '';
    if (req.method !== 'HEAD' && zippable(type, buf.length) && !h['content-range']) {
      h.vary = 'Accept-Encoding';
      const enc = pickEncoding(req.headers['accept-encoding']);
      if (enc) {
        const z = await encoded(`proxy|${target}|${crypto.createHash('sha1').update(buf).digest('hex')}`, () => buf, enc).catch(() => null);
        if (z) { h['content-encoding'] = enc; h['content-length'] = z.length; res.writeHead(r.status, h); return res.end(z); }
      }
    }
    if (req.method !== 'HEAD') h['content-length'] = buf.length;
    res.writeHead(r.status, h); res.end(buf);
  } catch (e) { plain(res, 502, `502 proxy: ${e.name === 'TimeoutError' ? 'оригинал не ответил за 60 с' : e.message}`); }
}

/* Range: bytes=a-b, bytes=a-, bytes=-n. Несколько диапазонов и неверная запись — отдаём
   файл целиком (так можно по стандарту); 416 — только если начало за концом файла. */
function parseRange(h, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h).trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') { const n = Number(m[2]); if (!n || !size) return 'bad'; return { start: Math.max(0, size - n), end: size - 1 }; }
  const start = Number(m[1]);
  if (m[2] !== '' && Number(m[2]) < start) return null;
  if (start >= size) return 'bad';
  return { start, end: m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1) };
}

function sendFile(req, res, file, st) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const base = { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
  /* текст — сжатым, если клиент просит; с Range — несжатый диапазон ниже (как у nginx) */
  if (zippable(type, st.size)) {
    base.vary = 'Accept-Encoding';
    const enc = req.headers.range ? null : pickEncoding(req.headers['accept-encoding']);
    if (enc) {
      encoded(`${file}|${st.mtimeMs}|${st.size}`, () => fs.promises.readFile(file), enc).then((z) => {
        /* диапазонов сжатого тела нет — Accept-Ranges только у несжатого */
        const { 'accept-ranges': _ranges, ...head } = base;
        res.writeHead(200, { ...head, 'content-encoding': enc, 'content-length': z.length });
        res.end(req.method === 'HEAD' ? undefined : z);
      }, () => sendRaw(req, res, file, st, base));
      return;
    }
  }
  sendRaw(req, res, file, st, base);
}

function sendRaw(req, res, file, st, base) {
  const range = req.headers.range ? parseRange(req.headers.range, st.size) : null;
  if (range === 'bad') { res.writeHead(416, { ...base, 'content-range': `bytes */${st.size}`, 'content-length': 0 }); return res.end(); }
  const [code, start, end, extra] = range
    ? [206, range.start, range.end, { 'content-range': `bytes ${range.start}-${range.end}/${st.size}` }]
    : [200, 0, Math.max(0, st.size - 1), {}];
  const len = st.size ? end - start + 1 : 0;
  res.writeHead(code, { ...base, ...extra, 'content-length': len });
  if (req.method === 'HEAD' || !len) return res.end();
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function handle(req, res) {
  let url, p;
  try { url = new URL(req.url, 'http://x'); p = decodeURIComponent(url.pathname); } catch { return plain(res, 400, '400: плохой адрес'); }
  if (p.includes('\0')) return plain(res, 400, '400: плохой адрес');
  /* адрес для оригинала — только путь и запрос: запрос вида «GET http://чужой/» не уводит прокси на чужой хост */
  const upstream = () => proxy + url.pathname + url.search;
  let file = path.join(root, p);
  if (!within(root, file)) return plain(res, 403, '403: вне папки');
  if (path.relative(root, file).split(path.sep).some((s) => s.startsWith('.') && s !== '.well-known')) return plain(res, 403, '403: скрытый файл');
  let st = statOf(file);
  if (st && st.isDirectory()) {
    if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: '/' + url.pathname.replace(/^\/+/, '') + '/' + url.search, 'cache-control': 'no-store' }); return res.end(); }
    file = path.join(file, 'index.html'); st = statOf(file);
  }
  if (!(st && st.isFile())) { const h = statOf(file + '.html'); if (h && h.isFile()) { file += '.html'; st = h; } }
  if (!(st && st.isFile())) {
    if (proxy) return proxyTo(req, res, upstream());
    return plain(res, 404, `404: ${p}`);
  }
  /* ссылка внутри папки может вести наружу — сверяем настоящий путь */
  let real; try { real = fs.realpathSync.native(file); } catch { return plain(res, 404, `404: ${p}`); }
  if (!within(rootReal, real)) return plain(res, 403, '403: вне папки');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (proxy) return proxyTo(req, res, upstream());
    return plain(res, 405, '405: только GET и HEAD', { allow: 'GET, HEAD' });
  }
  sendFile(req, res, file, st);
}

/* Занят ли порт. Windows без SO_EXCLUSIVEADDRUSE разрешает слушать 127.0.0.1:port и ::1:port,
   когда другой процесс уже слушает 0.0.0.0:port или [::]:port, и тогда новый сервер молча
   перехватывает localhost. Поэтому до listen пробуем подключиться: к 127.0.0.1 и ::1 (их слышит
   и слушатель на 0.0.0.0 или [::]) и к самому --host, если это отдельный адрес. Подключились —
   порт занят. Отказ (ECONNREFUSED) или нет такой сети (нет IPv6) — свободен. Иной ответ
   (EACCES: на части машин подключение к ::1 запрещено даже к своему серверу) или тишина 1 с —
   на Windows смотрим слушателей в netstat; не вышло и там — WARN «не проверено». */
const WILDCARD = new Set(['0.0.0.0', '::', '[::]', '0:0:0:0:0:0:0:0']);
const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
const FREE = new Set(['ECONNREFUSED', 'EADDRNOTAVAIL', 'ENETUNREACH', 'EHOSTUNREACH', 'EAFNOSUPPORT']);
const shown = (a) => (a.includes(':') ? `[${a}]` : a);
function probe(addr) {
  return new Promise((resolve) => {
    const s = net.connect({ host: addr, port });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(1000, () => done('нет ответа за 1 с'));
    s.once('connect', () => done('busy'));
    s.once('error', (e) => done(FREE.has(e.code) ? 'free' : e.code || e.message));
  });
}
/* слушатели порта по netstat (Windows): у слушающего сокета удалённый адрес 0.0.0.0:0 или [::]:0 —
   так не зависим от языка столбца состояния. null — netstat не сработал. */
function netstatListeners(addr) {
  if (process.platform !== 'win32') return null;
  const v6 = addr.includes(':');
  let out; try { out = execFileSync('netstat', ['-ano', '-p', v6 ? 'TCPv6' : 'TCP'], { encoding: 'latin1', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
  const want = new Set(v6 ? ['[::]', `[${addr.toLowerCase()}]`] : ['0.0.0.0', addr]);
  const found = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s*TCP\s+(\S+):(\d+)\s+(0\.0\.0\.0:0|\[::\]:0)\s+.*?(\d+)\s*$/i.exec(line);
    if (m && Number(m[2]) === port && want.has(m[1].toLowerCase())) found.push(`${m[1]}:${m[2]} (PID ${m[4]})`);
  }
  return found;
}
const probeAddrs = ['127.0.0.1', '::1'];
if (host && !WILDCARD.has(host) && !LOOPBACK.has(host)) probeAddrs.push(host.replace(/^\[|\]$/g, ''));
for (const a of probeAddrs) {
  const r = await probe(a);
  if (r === 'busy') die(`порт ${port} занят: на ${shown(a)}:${port} уже отвечает другой сервер (он может слушать 0.0.0.0 или [::] — тогда localhost достался бы ему или нам вперемешку) — укажите другой: --port ${port + 1}`);
  if (r === 'free') continue;
  const ls = netstatListeners(a);
  if (ls && ls.length) die(`порт ${port} занят: подключиться к ${shown(a)}:${port} не дали (${r}), но netstat показывает слушателя ${ls.join(', ')} — укажите другой: --port ${port + 1}`);
  if (!ls) console.log(`WARN ${shown(a)}:${port}: ${r} — занят ли порт на этом адресе, не проверено`);
}

/* По умолчанию и при --host localhost — только эта машина: 127.0.0.1 и ::1 (браузер может открыть
   localhost по любому из них; ::1 не поднялся — нет IPv6 — хватит 127.0.0.1). Иначе — ровно
   указанный адрес, и ошибка на нём — FAIL. */
const both = !host || hostIsLocalName;
const hosts = both ? ['127.0.0.1', '::1'] : [host];
const started = await Promise.all(hosts.map((h, i) => new Promise((resolve) => {
  const srv = http.createServer(handle);
  const onErr = (e) => resolve({ h, i, err: e });
  srv.once('error', onErr);
  srv.listen(port, h, () => {
    srv.off('error', onErr);
    srv.on('error', (e) => console.log(`WARN сервер на ${shown(h)}:${port}: ${e.message}`));
    resolve({ h, i, srv, addr: srv.address() });
  });
})));
for (const r of started) {
  if (!r.err) continue;
  if (r.i === 0 || !both) die(r.err.code === 'EADDRINUSE' ? `порт ${port} на ${shown(r.h)} занят — укажите другой: --port ${port + 1}` : `не удалось слушать ${shown(r.h)}:${port}: ${r.err.message}`);
  if (r.err.code === 'EADDRINUSE') console.log(`WARN [${r.h}]:${port} занят другим процессом — открывайте http://127.0.0.1:${port}/, а не localhost`);
  /* нет IPv6 — хватит 127.0.0.1 */
}

/* Подсказки — по адресам, которые сервер слушает на самом деле (srv.address()), а не по --host:
   127.x.x.x и ::1 — эта машина; 0.0.0.0, :: и адрес в сети — видят другие устройства. */
const isLoop = (a) => /^127\./.test(a) || a === '::1' || /^::ffff:127\./i.test(a);
const isAny = (a) => a === '0.0.0.0' || a === '::';
const addrs = started.filter((r) => r.addr).map((r) => (typeof r.addr === 'object' ? r.addr.address : String(r.addr)));
const list = addrs.map(shown).join(' и ');
/* localhost в адресе для браузера — если слушаем 127.0.0.1 или все адреса; иначе сам адрес ([::1], адрес в сети) */
const viaLocalhost = addrs.some((a) => a === '127.0.0.1' || isAny(a));
console.log(`${viaLocalhost ? `http://localhost:${port}/` : `http://${shown(addrs[0])}:${port}/`}  ←  ${root}${proxy ? `  (остальное → ${proxy})` : ''}`);
console.log(addrs.every(isLoop) ? `Только эта машина (слушает ${list}). Для телефона в той же сети: --host 0.0.0.0` : `WARN слушает ${list}: папку видят другие устройства в сети. Для работы на этой машине --host не нужен.`);
console.log(compress ? 'Сжатие как на хостинге: html, css, js, json, svg, xml, txt, wasm от 512 байт — br или gzip по Accept-Encoding. Без сжатия: --no-compress' : 'Без сжатия (--no-compress): текст уходит как есть — perf.mjs покажет «сервер не сжимает» и оценку со сжатием');

/* Доступен ли сервер с этой машины: подключаемся к своим адресам (к 0.0.0.0 — через 127.0.0.1, к :: —
   через 127.0.0.1 и ::1). Ни к одному не вышло — например, --host ::1 там, где к ::1 подключаться
   нельзя (EACCES), — браузер страницу не откроет. */
const targets = [...new Set(addrs.flatMap((a) => (a === '0.0.0.0' ? ['127.0.0.1'] : a === '::' ? ['127.0.0.1', '::1'] : [a])))];
const reach = [];
for (const t of targets) reach.push([t, await probe(t)]);
if (reach.length && !reach.some(([, v]) => v === 'busy')) {
  const why = reach.map(([t, v]) => `${shown(t)}:${port} — ${v === 'free' ? 'отказ' : v}`).join(', ');
  console.log(`WARN сервер слушает, но подключиться к нему с этой машины не удалось (${why}) — браузер страницу не откроет${addrs.includes('::1') ? '; на части машин к ::1 подключаться нельзя' : ''}. Запустите без --host (127.0.0.1 и ::1) или с --host 127.0.0.1`);
}
