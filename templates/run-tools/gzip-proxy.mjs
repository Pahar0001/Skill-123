#!/usr/bin/env node
/* Прокси со сжатием — как Caddy или nginx на бою (encode gzip). Локальный сервер приложения ответы обычно не
   сжимает, и perf.mjs по нему завышает первую отрисовку: стили 64 КБ вместо 16 КБ на медленной сети — это
   полсекунды, которых у посетителя нет. Мерить скорость «до» и «после» — через этот прокси, обе стороны.

   node gzip-proxy.mjs <порт прокси> <порт приложения>          → http://localhost:<порт прокси>
   Замер «до» после правок по исходникам: git archive HEAD:<папка> | tar -x -C <прогон>/before-app, запустить
   на другом порту с КОПИЕЙ базы (SQLite с журналом WAL копировать через VACUUM INTO, простая копия файла
   может оказаться пустой) и убедиться, что страница отдаёт те же товары, — только потом сравнивать числа. */
import http from 'node:http';
import zlib from 'node:zlib';

const [listen, target] = process.argv.slice(2).map(Number);
if (!listen || !target) { console.error('node gzip-proxy.mjs <порт прокси> <порт приложения>'); process.exit(1); }
const TEXT = /^(text\/|application\/(javascript|json|xml|ld\+json)|image\/svg\+xml)/;
http.createServer((req, res) => {
  const up = http.request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${target}` } }, (r) => {
    const type = String(r.headers['content-type'] || '');
    const gz = TEXT.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) && !r.headers['content-encoding'] && r.statusCode !== 304 && r.statusCode !== 204;
    const headers = { ...r.headers };
    if (gz) { delete headers['content-length']; headers['content-encoding'] = 'gzip'; headers.vary = 'Accept-Encoding'; }
    res.writeHead(r.statusCode, headers);
    if (gz) r.pipe(zlib.createGzip({ level: 6 })).pipe(res); else r.pipe(res);
  });
  up.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(up);
}).listen(listen, '127.0.0.1', () => console.log(`прокси со сжатием: http://localhost:${listen} → :${target}`));
