#!/usr/bin/env node
/**
 * Статический сервер для зеркала или любой папки с HTML.
 *
 *   node serve.mjs <папка> [--port 4173] [--proxy https://original.site]
 *
 * Без кэша, чтобы правки в rework.css были видны по F5. С --proxy всё, чего
 * нет в папке (API, формы, картинки по относительным адресам), уходит на
 * оригинал — зеркало перестаёт сыпать 404 в консоль. Останавливать Ctrl+C.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseArgs } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
const root = path.resolve(pos[0] || '.');
if (!fs.existsSync(root)) { console.error(`Нет папки ${root}`); process.exit(1); }
const port = Number(opt.port) || 4173;
const proxy = opt.proxy && opt.proxy !== true ? String(opt.proxy).replace(/\/$/, '') : null;

async function proxyTo(req, res, target) {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = { 'user-agent': req.headers['user-agent'] || 'site-rework-mirror', accept: req.headers.accept || '*/*' };
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    const r = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });
    const h = { 'cache-control': 'no-store', 'x-proxied-from': target };
    for (const k of ['content-type', 'location']) { const v = r.headers.get(k); if (v) h[k] = v; }
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }); res.end(`502 proxy: ${e.message}`); }
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.map': 'application/json' };

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file)) {
    if (proxy) return proxyTo(req, res, proxy + req.url);
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(`404: ${p}`);
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/  ←  ${root}${proxy ? `  (остальное → ${proxy})` : ''}`));
