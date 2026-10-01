#!/usr/bin/env node
/**
 * Пререндер объёмных предметов в прозрачные PNG и WebP — сцена Three.js в безголовом Chrome.
 *
 *   node render.mjs <сцена>[,<сцена>…] [--w 1200] [--h 900] [--dpr 2] [--n 96] [--trim] [--variant имя]
 *                   [--bg E2F8CD] [--name имя] [--q 88] [--out папка] [--palette "moss=#58A423,kraft=#D6B585"]
 *                   [--soft 1] [--dome 1] [--exp 1.06] [--env 0.85] [--tone neutral|aces] [--seed 7]
 *   node render.mjs --help
 *
 * Сцена — модуль scenes/<имя>.js рядом с этим файлом (образцы: ribbon, icons, sprout, honeycomb).
 * Папку render3d копируют в папку прогона (<прогон>/3d) и пишут свои сцены по образцу; Three.js берётся
 * из зависимостей скилла (~/.claude/site-rework/node_modules/three), ставить его рядом не нужно.
 *
 *   --w, --h     размер кадра в CSS px; --dpr — плотность (итог = w×dpr на h×dpr)
 *   --n          кадров накопления (96): дрожание камеры в пределах пикселя, ключевой свет по диску,
 *                «купол» с тенью — мягкие тени и чистые края; 1 — один проход без теней (черновик)
 *   --trim       обрезать прозрачные поля
 *   --variant    вариант внутри сцены (icons: pack, form, box…; ribbon: wave, arc, curl)
 *   --bg         ещё и превью на этом фоне: <имя>-on-<bg>.jpg — смотреть глазами на цвете сайта
 *   --name       имя файлов (по умолчанию имя сцены); --q — качество WebP
 *   --out        папка результата (по умолчанию out/ рядом)
 *   --palette    свои цвета поверх палитры сцены: имя=цвет через запятую (имена — в stage.html, PAL)
 *   --soft       размер диска ключевого света (1; 0 — жёсткая тень); --dome — сила купола (1; 0 — без него)
 *   --exp, --env, --tone  выдержка, сила окружения, тональная кривая
 *
 * Вывод: строка на кадр — размер, доля непрозрачных пикселей (пустой кадр — FAIL и код 1), вес PNG и WebP.
 * Планка качества и приёмы — README.md в этой папке и reference/engines.md → «3D».
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEPS = path.join(os.homedir(), '.claude', 'site-rework', 'node_modules');
const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).replace(/^ \* ?/gm, '').trim());
  process.exit(argv.length ? 0 : 1);
}
const lib = await import(pathToFileURL(path.join(os.homedir(), '.claude', 'skills', 'site-rework', 'scripts', 'lib.mjs')).href);
const puppeteer = lib.loadPuppeteer();
const sharp = lib.loadSharp();

const names = (argv[0] || '').split(',').filter((s) => s && !s.startsWith('--'));
const flag = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes('--' + k);
if (!names.length) { console.error('Сцена не названа: node render.mjs sprout (список — папка scenes/)'); process.exit(2); }
for (const n of names) if (!fs.existsSync(path.join(HERE, 'scenes', `${n}.js`))) { console.error(`Нет сцены scenes/${n}.js`); process.exit(2); }
if (!fs.existsSync(path.join(DEPS, 'three', 'build', 'three.module.js'))) { console.error(`Нет Three.js в ${DEPS} — npm i three --prefix ~/.claude/site-rework`); process.exit(2); }
const W = +flag('w', 1200), H = +flag('h', 900), DPR = +flag('dpr', 2), Q = +flag('q', 88);
const OUT = path.resolve(flag('out', path.join(HERE, 'out')));
const extra = ['t', 'exp', 'env', 'variant', 'seed', 'ribs', 'nu', 'ridge', 'tone', 'n', 'soft', 'dome', 'palette'].filter((k) => flag(k) != null).map((k) => `&${k}=${encodeURIComponent(flag(k))}`).join('');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.hdr': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/favicon')) { res.writeHead(204); return res.end(); }
  const rel = decodeURIComponent(req.url.split('?')[0]);
  /* /node_modules/… — из зависимостей скилла, всё остальное — из этой папки */
  const root = rel.startsWith('/node_modules/') ? DEPS : HERE;
  const p = path.normalize(path.join(root, rel.startsWith('/node_modules/') ? rel.slice('/node_modules'.length) : rel));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('нет файла'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: lib.requireChrome(), headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--hide-scrollbars', `--window-size=${W},${H}`],
});
let code = 0;
try {
  for (const name of names) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/stage.html?scene=${name}&w=${W}&h=${H}&dpr=${DPR}${extra}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__done === true', { timeout: 600000 });
    const err = await page.evaluate('window.__error || null');
    if (err || errors.length) { console.error(`FAIL ${name}: ${err || errors.join(' | ')}`); code = 1; await page.close(); continue; }
    const info = await page.evaluate('window.__info');
    const data = await page.evaluate('window.__png()');
    const png = Buffer.from(data.split(',')[1], 'base64');
    fs.mkdirSync(OUT, { recursive: true });
    const base = flag('name', name) + (names.length > 1 && flag('name') ? '-' + name : '');
    let img = sharp(png);
    if (has('trim')) img = sharp(await img.trim({ threshold: 2 }).toBuffer());
    const buf = await img.png().toBuffer();
    const meta = await sharp(buf).metadata();
    fs.writeFileSync(path.join(OUT, base + '.png'), buf);
    await sharp(buf).webp({ quality: Q, alphaQuality: 90, effort: 5 }).toFile(path.join(OUT, base + '.webp'));
    const bg = flag('bg');
    if (bg) await sharp(buf).flatten({ background: '#' + bg.replace('#', '') }).jpeg({ quality: 88 }).toFile(path.join(OUT, `${base}-on-${bg.replace('#', '')}.jpg`));
    /* доля непрозрачных пикселей: пустой кадр — провал */
    const { data: raw, info: ri } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let opaque = 0; for (let i = 3; i < raw.length; i += 4) if (raw[i] > 8) opaque++;
    const share = opaque / (ri.width * ri.height);
    const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
    console.log(`${share < 0.01 ? 'FAIL пустой кадр' : 'OK  '} ${base}: ${meta.width}×${meta.height}, заполнено ${(share * 100).toFixed(1)}%, кадров накопления ${info.n}, треугольников ${info.tris}, png ${kb(base + '.png')} КБ, webp ${kb(base + '.webp')} КБ, ${Date.now() - t0} мс → ${OUT}`);
    if (share < 0.01) code = 1;
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(code);
