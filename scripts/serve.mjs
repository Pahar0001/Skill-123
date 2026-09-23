#!/usr/bin/env node
/**
 * Статический сервер для зеркала или любой папки с HTML.
 *
 *   node serve.mjs <папка> [--port 4173] [--proxy https://original.site] [--host 127.0.0.1]
 *
 * --port    порт, по умолчанию 4173.
 * --proxy   всё, чего нет в папке (API, формы, картинки по относительным адресам),
 *           уходит на оригинал — зеркало перестаёт сыпать 404 в консоль. Заголовок
 *           Range передаётся, редирект на сам оригинал переписывается в локальный путь.
 * --host    на каком адресе слушать. По умолчанию только эта машина (127.0.0.1 и ::1):
 *           зеркало чужого сайта и черновики не видны в локальной сети. --host 0.0.0.0 —
 *           открыть для телефона в той же сети (сервер предупредит).
 *
 * Без кэша, чтобы правки в rework.css были видны по F5. Отдаются только файлы
 * внутри папки: «..», «%5c..» и ссылки наружу получают 403. Папка без «/» в
 * конце перенаправляется на «папка/» (иначе относительные адреса в её
 * index.html уезжают на уровень выше). Поддержаны HEAD и Range (206,
 * Accept-Ranges, Content-Range, 416) — без Range видео не перематывается и
 * не прокручивается вслед за страницей. Останавливать Ctrl+C.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseArgs } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
const root = path.resolve(pos[0] || '.');
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.error(`Нет папки ${root}`); process.exit(1); }
const rootReal = fs.realpathSync.native(root);
const port = Number(opt.port) || 4173;
const proxy = opt.proxy && opt.proxy !== true ? String(opt.proxy).replace(/\/$/, '') : null;
const host = opt.host && opt.host !== true ? String(opt.host) : null;

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

/* внутри папки — значит, путь от корня не начинается с «..» и не уходит на другой диск */
const within = (base, f) => { const rel = path.relative(base, f); return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)); };
const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };
const plain = (res, code, text, extra = {}) => { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra }); res.end(text); };

async function proxyTo(req, res, target) {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length && !['GET', 'HEAD'].includes(req.method) ? Buffer.concat(chunks) : undefined;
    const headers = { 'user-agent': req.headers['user-agent'] || 'site-rework-mirror', accept: req.headers.accept || '*/*' };
    for (const k of ['content-type', 'range']) if (req.headers[k]) headers[k] = req.headers[k];
    const r = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });
    const h = { 'cache-control': 'no-store', 'x-proxied-from': target };
    for (const k of ['content-type', 'content-range', 'accept-ranges']) { const v = r.headers.get(k); if (v) h[k] = v; }
    const loc = r.headers.get('location');
    if (loc) h.location = loc.startsWith(proxy) ? loc.slice(proxy.length) || '/' : loc;
    const buf = req.method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await r.arrayBuffer());
    if (req.method !== 'HEAD') h['content-length'] = buf.length;
    res.writeHead(r.status, h); res.end(buf);
  } catch (e) { plain(res, 502, `502 proxy: ${e.message}`); }
}

/* Range: bytes=a-b, bytes=a-, bytes=-n. Несколько диапазонов и мусор — отдаём файл целиком (так можно по стандарту). */
function parseRange(h, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h).trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') { const n = Number(m[2]); if (!n) return 'bad'; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return 'bad';
  return { start, end };
}

function sendFile(req, res, file, st) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const base = { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
  const range = req.headers.range ? parseRange(req.headers.range, st.size) : null;
  if (range === 'bad') { res.writeHead(416, { ...base, 'content-range': `bytes */${st.size}` }); return res.end(); }
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
  let file = path.join(root, p);
  if (!within(root, file)) return plain(res, 403, '403: вне папки');
  let st = statOf(file);
  if (st && st.isDirectory()) {
    if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: url.pathname + '/' + url.search, 'cache-control': 'no-store' }); return res.end(); }
    file = path.join(file, 'index.html'); st = statOf(file);
  }
  if (!(st && st.isFile())) { const h = statOf(file + '.html'); if (h && h.isFile()) { file += '.html'; st = h; } }
  if (!(st && st.isFile())) {
    if (proxy) return proxyTo(req, res, proxy + req.url);
    return plain(res, 404, `404: ${p}`);
  }
  /* ссылка внутри папки может вести наружу — сверяем настоящий путь */
  let real; try { real = fs.realpathSync.native(file); } catch { return plain(res, 404, `404: ${p}`); }
  if (!within(rootReal, real)) return plain(res, 403, '403: вне папки');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (proxy) return proxyTo(req, res, proxy + req.url);
    return plain(res, 405, '405: только GET и HEAD', { allow: 'GET, HEAD' });
  }
  sendFile(req, res, file, st);
}

/* по умолчанию — только эта машина: 127.0.0.1 и ::1 (браузер может открыть localhost по любому из них) */
const hosts = host ? [host] : ['127.0.0.1', '::1'];
const listening = [];
for (const [i, h] of hosts.entries()) {
  const srv = http.createServer(handle);
  srv.on('error', (e) => {
    if (i === 0 || host) { console.error(e.code === 'EADDRINUSE' ? `Порт ${port} на ${h} занят — укажите другой: --port ${port + 1}` : `Не удалось слушать ${h}:${port}: ${e.message}`); process.exit(1); }
    if (e.code === 'EADDRINUSE') console.log(`WARN [${h}]:${port} занят другим процессом — открывайте http://127.0.0.1:${port}/, а не localhost`);
    /* нет IPv6 — хватит 127.0.0.1 */
  });
  srv.listen(port, h, () => {
    listening.push(h);
    if (listening.length === 1) {
      const open = !['127.0.0.1', '::1', 'localhost'].includes(h);
      console.log(`http://localhost:${port}/  ←  ${root}${proxy ? `  (остальное → ${proxy})` : ''}`);
      console.log(open ? `WARN слушает ${h}: папку видят другие устройства в сети. Для работы на этой машине --host не нужен.` : 'Только эта машина (127.0.0.1 и ::1). Для телефона в той же сети: --host 0.0.0.0');
    }
  });
}
