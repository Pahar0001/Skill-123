/**
 * Самопроверка svg3d.mjs на стендах scripts/fixtures/svg3d.
 *
 * Каждая проверка запускает сам инструмент отдельным процессом (те же аргументы, коды выхода и файлы, что
 * у человека) и смотрит результат: SVG разбирается, есть viewBox, нет <script>, внешних ссылок и растра,
 * два запуска побайтно совпадают, вес в бюджете, превью не пустое. Недоступный движок — SKIP с причиной,
 * а не OK: «зелёный» итог не означает, что работает то, чего на машине нет.
 * Iconify проверяется на поддельном сервере (SVG3D_ICONIFY_BASE): сеть самопроверке не нужна.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSharp } from '../lib.mjs';
import { getSvgo, inspectSvg, rasterize } from './svg.mjs';
import { depthOrder, unionPath, processFaces } from './faces.mjs';
import { fitPolyline } from './fit.mjs';
import { licenseVerdict } from './tools.mjs';
import { doctor } from './doctor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, '..', 'svg3d.mjs');
const FX = path.join(HERE, '..', 'fixtures', 'svg3d');

export async function selftest({ keep = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svg3d-selftest-'));
  const results = []; let skipped = 0;
  const check = (name, ok, extra = '') => { results.push(!!ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + String(extra).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
  const skip = (name, why) => { skipped++; console.log(`SKIP ${name} — ${why}`); };
  const run = (args, env = {}) => new Promise((resolve) => {
    const p = spawn(process.execPath, [TOOL, ...args], { env: { ...process.env, ...env }, cwd: tmp, windowsHide: true });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  const read = (f) => { try { return fs.readFileSync(path.join(tmp, f), 'utf8'); } catch { return null; } };
  const last = (r) => r.out.trim().split(/\r?\n/).pop();

  const svgo = await getSvgo(); const sharp = loadSharp();
  if (!svgo) { console.log('FAIL нет svgo — без него инструмент не работает: npm i svgo --prefix ~/.claude/site-rework'); return 1; }
  /* «корректный SVG»: разбирается, есть viewBox, внутри ничего исполняемого, внешнего и растрового */
  const sound = (text) => { if (!text) return 'файла нет'; const i = inspectSvg(svgo, text); if (!i.ok) return `не разбирается: ${i.error}`; if (!i.viewBox) return 'нет viewBox'; if (i.scripts || i.handlers) return 'есть скрипт или обработчик'; if (i.external.length) return `внешняя ссылка: ${i.external[0]}`; if (i.raster) return 'есть растр'; if (i.embedded) return 'есть встроенное содержимое'; if (i.elements < 2) return 'пустой'; return null; };
  const good = (text) => sound(text) === null;

  console.log(`svg3d selftest · стенды ${FX} · результаты ${tmp}\n`);
  const env = await doctor({ net: false, browser: true });
  const has = Object.fromEntries(env.items.map((i) => [i.id, i.ok]));
  const why = (id) => { const i = env.items.find((x) => x.id === id); return i ? `${i.name}: ${i.detail}` : id; };

  /* ---------- аргументы и справка ---------- */
  let r = await run(['-h']);
  check('справка: -h — код 0, все команды названы', r.code === 0 && ['doctor', 'zdog', 'three', 'cad', 'trace', 'rough', 'icon', 'scatter', 'optimize', 'preview', 'sheet', 'blender', 'selftest'].every((c) => new RegExp(`svg3d\\.mjs ${c}\\b`).test(r.out)));
  r = await run([]);
  check('без аргументов — справка и код 1', r.code === 1 && /svg3d\.mjs doctor/.test(r.out));
  r = await run(['optimize', path.join(FX, 'shapes.svg'), '--precison', '1']);
  check('опечатка во флаге — ошибка с подсказкой, ничего не записано', r.code === 1 && /неизвестный флаг --precison — может быть, --precision\?/.test(r.out) && !fs.existsSync(path.join(FX, 'shapes.min.svg')), last(r));
  r = await run(['zdoc', 'x']);
  check('неизвестная команда — код 1', r.code === 1 && /Не знаю команду «zdoc»/.test(r.out), last(r));
  r = await run(['zdog', path.join(FX, 'zdog-toy.mjs'), '--palette', 'moss=зелёный', '--out', 'bad']);
  check('цвет палитры с ошибкой — отказ до запуска браузера', r.code === 1 && /--palette: цвет «зелёный»/.test(r.out) && !fs.existsSync(path.join(tmp, 'bad')), last(r));

  /* ---------- чистка (SVGO + правила безопасности) ---------- */
  r = await run(['optimize', path.join(FX, 'unsafe.svg'), '--out', 'opt']);
  let t = read('opt/unsafe.svg'); let info = t ? inspectSvg(svgo, t) : null;
  check('optimize: враждебный SVG — в выходе нет скриптов, обработчиков, внешних ссылок, растра, foreignObject, SMIL', r.code === 0 && good(t) && !/script|onclick|onload|example\.com|foreignObject|<animate|<image|javascript:/i.test(t), sound(t) || last(r));
  check('optimize: убранное перечислено в выводе', /убрано при чистке:.*script.*обработчик.*внешняя/.test(r.out), (r.out.match(/убрано при чистке:.*/) || [''])[0]);
  check('optimize: viewBox добавлен из width и height, размеры убраны, id — с приставкой, декор помечен', !!t && /viewBox="0 0 120 80"/.test(t) && !/\swidth="120"/.test(t) && /id="unsafe-/.test(t) && /url\(#unsafe-/.test(t) && /aria-hidden="true"/.test(t) && /focusable="false"/.test(t), info && info.ids.join(','));
  r = await run(['optimize', path.join(FX, 'unsafe.svg'), '--out', 'opt/keep.svg', '--allow-raster', '--label', 'Знак', '--keep-size', '--id-prefix', 'k']);
  t = read('opt/keep.svg');
  check('optimize --allow-raster --label --keep-size --id-prefix: вложенная картинка осталась, внешняя — нет; role="img"', r.code === 0 && !!t && /<image[^>]+data:image\/png/.test(t) && !/example\.com/.test(t) && /role="img"/.test(t) && /aria-label="Знак"/.test(t) && !/aria-hidden/.test(t) && /width="120"/.test(t) && /id="k-/.test(t), last(r));
  r = await run(['optimize', path.join(FX, 'shapes.svg'), '--out', 'opt/vars.svg', '--palette', 'moss=#5E7A33,ink=#16301F', '--css-vars', '--json', 'opt/vars.json']);
  t = read('opt/vars.svg'); const rep = read('opt/vars.json');
  check('--css-vars: цвета палитры — переменными с запасным значением; --json записан', r.code === 0 && !!t && /fill="var\(--c-moss,#5e7a33\)"/.test(t) && /stroke="var\(--c-ink,#16301f\)"/.test(t) && /fill="#e8b647"/.test(t) && !!rep && JSON.parse(rep).files.length === 1, last(r));
  fs.writeFileSync(path.join(tmp, 'broken.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"></svg>');
  r = await run(['optimize', 'broken.svg', '--out', 'opt/broken.svg']);
  check('optimize: битый XML — FAIL и код 1, файл не записан', r.code === 1 && /FAIL/.test(r.out) && !fs.existsSync(path.join(tmp, 'opt/broken.svg')), last(r));

  /* ---------- Zdog ---------- */
  if (has.chrome && has.zdog) {
    r = await run(['zdog', path.join(FX, 'zdog-toy.mjs'), '--out', 'z/a.svg', '--for', 'icon', '--preview', '#E9EEDD']);
    const r2 = await run(['zdog', path.join(FX, 'zdog-toy.mjs'), '--out', 'z/b.svg', '--for', 'icon']);
    const a = read('z/a.svg'), b = read('z/b.svg');
    check('zdog: сцена → корректный SVG', r.code === 0 && good(a), sound(a) || last(r));
    check('zdog: два запуска побайтно совпадают', !!a && a === b && r2.code === 0, a && b ? `${a.length} и ${b.length} байт` : 'файла нет');
    check('zdog: вес и узлы в бюджете иконки (без WARN)', r.code === 0 && !/WARN/.test(r.out) && !!a && a.length < 4096, a ? `${a.length} байт` : '');
    const ink = Number((/рисунок занимает (\d+)% поля/.exec(r.out) || [])[1]);
    check('zdog: превью построено и не пустое', fs.existsSync(path.join(tmp, 'z/a.png')) && ink >= 5, `рисунок занимает ${ink}% поля`);
    r = await run(['zdog', path.join(FX, 'zdog-toy.mjs'), '--out', 'z/nocull.svg', '--no-cull']);
    const nc = read('z/nocull.svg');
    check('zdog: закрытые целиком фигуры убраны (с --no-cull узлов больше)', !!a && !!nc && inspectSvg(svgo, nc).elements > inspectSvg(svgo, a).elements, a && nc ? `${inspectSvg(svgo, a).elements} против ${inspectSvg(svgo, nc).elements}` : '');
    if (sharp && a && nc) { const x = await rasterize(sharp, a, { width: 240, bg: '#ffffff' }), y = await rasterize(sharp, nc, { width: 240, bg: '#ffffff' }); let diff = 0; for (let i = 0; i < x.data.length; i += 4) if (Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]) > 90) diff++; check('zdog: без закрытых фигур картинка та же', diff < x.width * x.height * 0.004, `заметно отличающихся пикселей ${diff} из ${x.width * x.height}`); }
    r = await run(['zdog', path.join(FX, 'zdog-toy.mjs'), '--out', 'z/vars.svg', '--css-vars', '--palette', 'moss=#225577', '--fit']);
    t = read('z/vars.svg');
    check('zdog --palette --css-vars --fit: цвет подменён, переменные на месте, поле обрезано по рисунку', r.code === 0 && !!t && /var\(--c-moss,#257\)|var\(--c-moss,#225577\)/.test(t) && /var\(--c-sun,/.test(t) && !/viewBox="-80 -80 160 160"/.test(t), (t || '').slice(0, 120));
    r = await run(['zdog', path.join(FX, 'zdog-toy.mjs'), '--out', 'z/f', '--frames', '4']);
    const fr = [1, 2, 3, 4].map((i) => read(`z/f/zdog-toy-0${i}.svg`));
    const vbs = new Set(fr.map((x) => (/viewBox="([^"]+)"/.exec(x || '') || [])[1]));
    check('zdog --frames 4: четыре разных кадра в одном поле', r.code === 0 && fr.every(good) && new Set(fr).size === 4 && vbs.size === 1, `полей ${vbs.size}, разных кадров ${new Set(fr).size}`);
    r = await run(['zdog', path.join(FX, 'zdog-toy.mjs'), '--out', 'z/s', '--frames', '4', '--sprite']);
    t = read('z/s/zdog-toy-sprite4.svg');
    check('zdog --sprite: одна лента из четырёх кадров', r.code === 0 && good(t) && (t.match(/<svg\b/g) || []).length === 5 && /viewBox="0 0 640 160"/.test(t), sound(t) || last(r));
    fs.writeFileSync(path.join(tmp, 'empty.mjs'), 'export function build() {}\n');
    r = await run(['zdog', 'empty.mjs', '--out', 'z/empty.svg']);
    check('zdog: пустая сцена — FAIL, файла нет', r.code === 1 && /ничего не нарисовала/.test(r.out) && !fs.existsSync(path.join(tmp, 'z/empty.svg')), last(r));
    fs.writeFileSync(path.join(tmp, 'throws.mjs'), 'export function build({ nope }) { nope.call(); }\n');
    r = await run(['zdog', 'throws.mjs', '--out', 'z/throws.svg']);
    check('zdog: ошибка в сцене — понятный FAIL и код 1', r.code === 1 && /FAIL zdog:/.test(r.out), last(r));
  } else skip('zdog (10 проверок)', !has.chrome ? why('chrome') : why('zdog'));

  /* ---------- Three.js SVGRenderer ---------- */
  if (has.chrome && has.three) {
    r = await run(['three', path.join(FX, 'three-blocks.mjs'), '--out', 't/a.svg', '--preview', '#E9EEDD']);
    const r2 = await run(['three', path.join(FX, 'three-blocks.mjs'), '--out', 't/b.svg']);
    const a = read('t/a.svg'), b = read('t/b.svg');
    check('three: сцена → корректный SVG', r.code === 0 && good(a), sound(a) || last(r));
    check('three: два запуска побайтно совпадают', !!a && a === b && r2.code === 0);
    const m = /граней (\d+) → контуров (\d+)/.exec(r.out) || []; const fixed = Number((/исправлен в (\d+) пар/.exec(r.out) || [])[1]);
    check('three: грани склеены в контуры, порядок исправлен, вес в бюджете', Number(m[1]) === 26 && Number(m[2]) <= 12 && fixed >= 1 && !/WARN/.test(r.out) && !!a && a.length < 6000, `${m[0] || ''}, исправлено пар ${fixed}, ${a ? a.length : 0} байт`);
    check('three: превью построено и не пустое', fs.existsSync(path.join(tmp, 't/a.png')) && Number((/рисунок занимает (\d+)% поля/.exec(r.out) || [])[1]) >= 10);
    r = await run(['three', path.join(FX, 'three-blocks.mjs'), '--out', 't/naive.svg', '--no-sort', '--no-merge', '--seam', '0']);
    t = read('t/naive.svg');
    check('three --no-sort --no-merge --seam 0: «сырой» вывод тяжелее и без обводки', r.code === 0 && good(t) && !!a && inspectSvg(svgo, t).elements > inspectSvg(svgo, a).elements && !/stroke=/.test(t), t && a ? `узлов ${inspectSvg(svgo, t).elements} против ${inspectSvg(svgo, a).elements}` : '');
    r = await run(['three', path.join(FX, 'three-cross.mjs'), '--out', 't/cross-raw.svg', '--no-sort']);
    check('three: пересекающиеся грани без исправления порядка — WARN «сортировка глубины»', r.code === 0 && /WARN сортировка глубины — грани пересекаются/.test(r.out) && /WARN сортировка глубины — порядок «по центру грани» неверен/.test(r.out), (r.out.match(/WARN.*/) || ['WARN нет'])[0]);
    r = await run(['three', path.join(FX, 'three-cross.mjs'), '--out', 't/cross.svg']);
    check('three: те же грани разрезаны по линии пересечения — предупреждения нет', r.code === 0 && /разрезаны по линии пересечения/.test(r.out) && !/WARN/.test(r.out) && good(read('t/cross.svg')), (r.out.match(/Three r.*/) || [''])[0]);
    r = await run(['three', path.join(FX, 'three-blocks.mjs'), '--out', 't/f', '--frames', '3', '--tones', '3', '--css-vars']);
    check('three --frames 3 --tones 3: три кадра; --css-vars честно отклонён с WARN', r.code === 0 && [1, 2, 3].every((i) => good(read(`t/f/three-blocks-0${i}.svg`))) && /--css-vars — у three не действует/.test(r.out), last(r));
  } else skip('three (8 проверок)', !has.chrome ? why('chrome') : why('three'));

  /* ---------- CadQuery ---------- */
  if (has.cadquery) {
    r = await run(['cad', 'nut', '--out', 'c/a.svg', '--size', '240']);
    const r2 = await run(['cad', 'nut', '--out', 'c/b.svg', '--size', '240']);
    const a = read('c/a.svg'), b = read('c/b.svg');
    check('cad: встроенная фигура → корректный SVG, скрытые линии пунктиром, цвет — currentColor', r.code === 0 && good(a) && /stroke-dasharray/.test(a) && /currentColor/.test(a), sound(a) || last(r));
    check('cad: два запуска побайтно совпадают', !!a && a === b && r2.code === 0);
    check('cad: дуги — кривыми, вес в бюджете', !!a && /[cCsS]/.test((/ d="([^"]+)"/.exec(a) || [])[1] || '') && a.length < 6000 && !/WARN/.test(r.out), a ? `${a.length} байт` : '');
    r = await run(['cad', path.join(FX, 'cad-plate.py'), '--out', 'c/plate.svg', '--view', 'iso,top', '--param', 'hole=14', '--color', '#16301F', '--preview', '#E9EEDD']);
    t = read('c/plate.svg');
    check('cad: свой сценарий, два вида, --param, --color', r.code === 0 && good(t) && /виды: iso, top/.test(r.out) && /#16301f/i.test(t) && fs.existsSync(path.join(tmp, 'c/plate.png')), sound(t) || last(r));
    r = await run(['cad', path.join(FX, 'cad-plate.py'), '--out', 'c/draw.svg', '--draw', '--hidden', 'none']);
    t = read('c/draw.svg');
    check('cad --draw --hidden none: каждому контуру pathLength="1", пунктира нет', r.code === 0 && good(t) && (t.match(/pathLength="1"/g) || []).length >= 4 && !/stroke-dasharray/.test(t), last(r));
    fs.writeFileSync(path.join(tmp, 'bad.py'), 'import cadquery as cq\nresult = cq.Workplane("XY").box(1, 1, 1)\nresult = result.nope()\n');
    r = await run(['cad', 'bad.py', '--out', 'c/bad.svg']);
    check('cad: ошибка в сценарии — FAIL с номером строки, файла нет', r.code === 1 && /строка 3/.test(r.out) && !fs.existsSync(path.join(tmp, 'c/bad.svg')), last(r));
  } else skip('cad (6 проверок)', why('cadquery'));

  /* ---------- растр → вектор ---------- */
  if (has.vtracer && sharp) {
    await sharp(Buffer.from(fs.readFileSync(path.join(FX, 'shapes.svg'))), { density: 192 }).flatten({ background: '#ffffff' }).png().toFile(path.join(tmp, 'shapes.png'));
    r = await run(['trace', 'shapes.png', '--out', 'tr/a.svg', '--colors', '6', '--drop-bg']);
    const r2 = await run(['trace', 'shapes.png', '--out', 'tr/b.svg', '--colors', '6', '--drop-bg']);
    const a = read('tr/a.svg'), b = read('tr/b.svg');
    const fills = new Set((a || '').match(/fill="#[0-9a-f]{3,6}"/g) || []);
    check('trace: растр → корректный SVG в несколько цветов, белый фон убран', r.code === 0 && good(a) && fills.size >= 3 && /фон #f[c-f]f[c-f]f[c-f] убран/.test(r.out) && ![...fills].some((f) => /#f[c-f]f[c-f]f[c-f]|#fff"/.test(f)), sound(a) || `цветов ${fills.size}; ${last(r)}`);
    check('trace: два запуска побайтно совпадают', !!a && a === b && r2.code === 0);
    r = await run(['trace', 'shapes.png', '--out', 'tr/mono.svg', '--mono', '--engine', 'vtracer', '--color', '#16301F']);
    t = read('tr/mono.svg');
    check('trace --mono --engine vtracer: один цвет', r.code === 0 && good(t) && new Set(t.match(/fill="#[0-9a-f]{3,6}"/g) || []).size === 1 && /#16301f/.test(t), last(r));
    if (has.potrace) {
      r = await run(['trace', 'shapes.png', '--out', 'tr/pot.svg', '--mono', '--engine', 'potrace', '--color', '#16301F']);
      t = read('tr/pot.svg');
      check('trace --engine potrace: одноцветный контур', r.code === 0 && good(t) && /движок potrace/.test(r.out), sound(t) || last(r));
    } else skip('trace --engine potrace', why('potrace'));
    r = await run(['trace', 'shapes.png', '--out', 'tr/x.svg', '--engine', 'potrace']);
    check('trace --engine potrace без --mono — отказ с объяснением', r.code !== 0 && /только в один цвет|нет пакета potrace/.test(r.out), last(r));
  } else skip('trace (5 проверок)', !sharp ? 'нет sharp' : why('vtracer'));

  /* ---------- «от руки» ---------- */
  if (has.roughjs) {
    r = await run(['rough', path.join(FX, 'shapes.svg'), '--out', 'r/a.svg', '--seed', '11']);
    const r2 = await run(['rough', path.join(FX, 'shapes.svg'), '--out', 'r/b.svg', '--seed', '11']);
    const r3 = await run(['rough', path.join(FX, 'shapes.svg'), '--out', 'r/c.svg', '--seed', '12', '--fill-style', 'solid', '--ink', '#16301F', '--paper', '#E9EEDD', '--single-stroke']);
    const a = read('r/a.svg'), b = read('r/b.svg'), c = read('r/c.svg');
    check('rough: корректный SVG, фигур 4', r.code === 0 && good(a) && /фигур 4/.test(r.out), sound(a) || last(r));
    check('rough: тот же --seed — побайтно тот же файл; другой --seed — другой', !!a && a === b && r2.code === 0 && r3.code === 0 && good(c) && a !== c);
  } else skip('rough (2 проверки)', why('roughjs'));

  /* ---------- иконки Iconify — на поддельном сервере ---------- */
  {
    const sets = {
      ok: { name: 'Test Set', total: 2, author: { name: 'Автор Тестов', url: 'https://example.org/a' }, license: { title: 'ISC', spdx: 'ISC', url: 'https://example.org/isc' } },
      by: { name: 'By Set', total: 1, author: { name: 'Автор Подписной' }, license: { title: 'CC BY 4.0', spdx: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' } },
      nc: { name: 'NC Set', total: 1, author: { name: 'N' }, license: { title: 'CC BY-NC 4.0', spdx: 'CC-BY-NC-4.0' } },
      odd: { name: 'Odd Set', total: 1, author: { name: 'O' }, license: { title: 'Своя лицензия' } },
    };
    const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16Zm0 0 8-8"/></svg>';
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="x()"><script>x()</script><path fill="currentColor" d="M2 2h20v20H2z"/><image href="https://example.com/t.png" width="1" height="1"/></svg>';
    const seen = [];
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x'); seen.push(u.pathname + u.search);
      const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
      if (u.pathname === '/collections') { const p = u.searchParams.get('prefix'); return send(200, sets[p] ? { [p]: sets[p] } : {}); }
      if (u.pathname === '/search') return send(200, { icons: ['ok:leaf', 'by:leaf'], total: 2, collections: { ok: sets.ok, by: sets.by } });
      const m = /^\/(\w+)\/([\w-]+)\.svg$/.exec(u.pathname);
      if (m && sets[m[1]]) { if (m[2] === 'leaf') return send(200, icon, 'image/svg+xml'); if (m[2] === 'evil') return send(200, evil, 'image/svg+xml'); }
      return send(404, 'not found', 'text/plain');
    });
    await new Promise((res) => srv.listen(0, '127.0.0.1', res));
    const E = { SVG3D_ICONIFY_BASE: `http://127.0.0.1:${srv.address().port}` };
    r = await run(['icon', 'ok:leaf', '--out', 'i', '--caption', 'иконка шага', '--stroke-width', '1.5'], E);
    t = read('i/ok-leaf.svg'); let cr = []; try { cr = JSON.parse(read('i/credits.json')); } catch { /* нет файла */ }
    check('icon: иконка с currentColor, толщина линии заменена, размеры 1em убраны', r.code === 0 && good(t) && /currentColor/.test(t) && /stroke-width="1.5"/.test(t) && !/1em/.test(t), sound(t) || last(r));
    check('icon: лицензия набора — в credits.json (формат media.mjs)', cr.length === 1 && cr[0].name === 'ok-leaf.svg' && cr[0].source === 'iconify' && cr[0].source_id === 'ok:leaf' && cr[0].license_code === 'ISC' && cr[0].author === 'Автор Тестов' && cr[0].attribution_required === false && cr[0].caption === 'иконка шага' && cr[0].credit_need === 'не нужна', JSON.stringify(cr[0] || {}).slice(0, 200));
    r = await run(['icon', 'by:leaf', '--out', 'i'], E);
    check('icon: набор CC BY без --allow-attribution — отказ, код 2, файла нет', r.code === 2 && /НЕ ВЗЯТО by:leaf/.test(r.out) && !fs.existsSync(path.join(tmp, 'i/by-leaf.svg')), last(r));
    r = await run(['icon', 'by:leaf', '--out', 'i', '--allow-attribution'], E);
    try { cr = JSON.parse(read('i/credits.json')); } catch { cr = []; }
    const by = cr.find((x) => x.name === 'by-leaf.svg');
    check('icon --allow-attribution: взята, подпись обязательна — в credits.json и WARN', r.code === 0 && /WARN/.test(r.out) && !!by && by.attribution_required === true && by.credit_need === 'обязательна' && /Автор Подписной/.test(by.attribution_text), by ? by.attribution_text : last(r));
    r = await run(['icon', 'nc:leaf', 'odd:leaf', '--out', 'i', '--allow-attribution'], E);
    check('icon: некоммерческая и неизвестная лицензии — отказ всегда', r.code === 2 && /НЕ ВЗЯТО nc:leaf/.test(r.out) && /НЕ ВЗЯТО odd:leaf/.test(r.out) && !fs.existsSync(path.join(tmp, 'i/nc-leaf.svg')), last(r));
    r = await run(['icon', 'ok:evil', '--out', 'i'], E);
    t = read('i/ok-evil.svg');
    check('icon: скрипт и внешняя картинка в ответе сервера до сайта не доходят', r.code === 0 && good(t) && !/script|onload|example\.com/i.test(t), sound(t) || last(r));
    r = await run(['icon', 'ok:nope', 'zz:leaf', 'плохо', '--out', 'i'], E);
    check('icon: нет иконки, нет набора, неверная запись — FAIL по каждой, код 1', r.code === 1 && (r.out.match(/^FAIL /gm) || []).length >= 3, last(r));
    r = await run(['icon', '--search', 'leaf', '--set', 'ok,by'], E);
    check('icon --search: наборы с лицензиями и пометкой «можно / нужна подпись»', r.code === 0 && /ok — Test Set, ISC \[можно\]/.test(r.out) && /by — By Set, CC-BY-4\.0 \[нужна подпись\]/.test(r.out) && seen.some((s) => /\/search\?query=leaf/.test(s) && /prefixes=ok%2Cby/.test(s)), last(r));
    srv.close();
    r = await run(['icon', 'ok:leaf', '--out', 'i2'], { SVG3D_ICONIFY_BASE: 'http://127.0.0.1:9' });
    check('icon: сети нет — «НЕ СДЕЛАНО», код 2', r.code === 2 && /НЕ СДЕЛАНО: Iconify недоступен/.test(r.out), last(r));
    check('лицензии: MIT и CC0 — можно; CC BY-SA — подпись и те же условия; GPL — отказ', licenseVerdict({ spdx: 'MIT' }).level === 'ok' && licenseVerdict({ spdx: 'CC0-1.0' }).level === 'ok' && licenseVerdict({ spdx: 'CC-BY-SA-4.0' }).level === 'share-alike' && licenseVerdict({ spdx: 'GPL-3.0-or-later' }).level === 'refuse' && licenseVerdict(null).level === 'refuse');
  }

  /* ---------- россыпь, превью, лист ---------- */
  r = await run(['scatter', path.join(FX, 'shapes.svg'), 'opt/vars.svg', '--out', 's/a.svg', '--count', '9', '--seed', '3', '--area', 'edges', '--id-prefix', 'sc']);
  const r2 = await run(['scatter', path.join(FX, 'shapes.svg'), 'opt/vars.svg', '--out', 's/b.svg', '--count', '9', '--seed', '3', '--area', 'edges', '--id-prefix', 'sc']);
  const r3 = await run(['scatter', path.join(FX, 'shapes.svg'), 'opt/vars.svg', '--out', 's/c.svg', '--count', '9', '--seed', '4', '--area', 'edges', '--id-prefix', 'sc']);
  { const a = read('s/a.svg'), b = read('s/b.svg'), c = read('s/c.svg');
    check('scatter: два рисунка описаны по разу, расставлены девять раз, середина поля свободна', r.code === 0 && good(a) && (a.match(/<symbol\b/g) || []).length === 2 && (a.match(/<use\b/g) || []).length === 9 && (a.match(/<use\b[^>]*>/g) || []).every((u) => { const cx = Number((/\sx="([\d.-]+)"/.exec(u) || [])[1]) + Number((/\swidth="([\d.]+)"/.exec(u) || [])[1]) / 2; return cx < 1440 * 0.3 || cx > 1440 * 0.7; }), sound(a) || last(r));
    check('scatter: тот же --seed — тот же файл, другой — другая раскладка', !!a && a === b && r2.code === 0 && r3.code === 0 && a !== c); }
  if (sharp) {
    r = await run(['preview', 'opt/vars.svg', '--out', 'p/vars.png', '--bg', '#E9EEDD', '--width', '300']);
    const meta = fs.existsSync(path.join(tmp, 'p/vars.png')) ? await sharp(path.join(tmp, 'p/vars.png')).metadata() : null;
    check('preview: PNG нужной ширины на фоне, рисунок виден', r.code === 0 && !!meta && meta.width === 300 && Number((/рисунок занимает (\d+)% поля/.exec(r.out) || [])[1]) > 10, last(r));
    fs.writeFileSync(path.join(tmp, 'ghost.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#e9eedd" d="M1 1h8v8H1z"/></svg>');
    r = await run(['preview', 'ghost.svg', '--out', 'p/ghost.png', '--bg', '#E9EEDD']);
    check('preview: рисунок цветом фона — FAIL «превью пустое», код 1', r.code === 1 && /превью пустое/.test(r.out), last(r));
    r = await run(['sheet', 'opt', 's/a.svg', '--out', 'p/sheet.png', '--bg', '#16301F', '--cols', '3', '--cell', '120']);
    const sm = fs.existsSync(path.join(tmp, 'p/sheet.png')) ? await sharp(path.join(tmp, 'p/sheet.png')).metadata() : null;
    check('sheet: лист-контакт из папки и файла', r.code === 0 && !!sm && sm.width === 3 * 120 + 4 * 14 && /— 4 рисунков/.test(r.out), last(r));
  } else skip('preview и sheet (3 проверки)', 'нет sharp');

  /* ---------- Blender — необязательная ветка ---------- */
  fs.writeFileSync(path.join(tmp, 'x.blend'), 'not a blend');
  if (!has.blender) {
    r = await run(['blender', 'x.blend', '--out', 'b']);
    check('blender: не установлен — честный отказ с подсказкой, код 2, ничего не поставлено', r.code === 2 && /НЕ СДЕЛАНО: Blender не установлен/.test(r.out) && /svg3d\.mjs cad/.test(r.out) && !fs.existsSync(path.join(tmp, 'b')), last(r));
    skip('blender: сама отрисовка Freestyle', 'Blender не установлен — ветка не проверена ни разу');
  } else skip('blender', 'Blender установлен, но автоматической проверки у ветки нет: запустить руками на своей сцене и открыть превью');

  /* ---------- doctor ---------- */
  r = await run(['doctor', '--json', 'doctor.json'], { SVG3D_ICONIFY_BASE: 'http://127.0.0.1:9' });
  let dj = null; try { dj = JSON.parse(read('doctor.json')); } catch { /* нет файла */ }
  check('doctor: каждая часть стека названа; недоступное — «нет» с последствием и что сделать', r.code === 0 && !!dj && ['svgo', 'sharp', 'chrome', 'zdog', 'three', 'roughjs', 'vtracer', 'potrace', 'cadquery', 'blender', 'iconify'].every((id) => dj.items.some((i) => i.id === id)) && dj.items.find((i) => i.id === 'iconify').ok === false && /чем грозит: нет команды icon/.test(r.out) && dj.items.find((i) => i.id === 'blender').ok === has.blender, last(r));

  /* ---------- внутренние части: порядок граней, склейка, кривые ---------- */
  { /* две грани: дальняя (z больше) стоит в списке второй — порядок должен перевернуться */
    const near = { p: [0, 0, 10, 0, 0, 10], z: [0.1, 0.1, 0.1], fill: '#111111', opacity: 1, box: [0, 0, 10, 10] };
    const far = { p: [0, 0, 10, 0, 10, 10], z: [0.6, 0.6, 0.6], fill: '#222222', opacity: 1, box: [0, 0, 10, 10] };
    const o = depthOrder([near, far]);
    check('порядок граней: дальняя — раньше, исправление посчитано', o.order.join() === '1,0' && o.fixed === 1 && o.cycles === 0);
    const d = unionPath([{ p: [0, 0, 10, 0, 10, 10] }, { p: [0, 0, 10, 10, 0, 10] }], 1);
    check('склейка: два треугольника → один четырёхугольник без внутреннего ребра', (d.match(/[ML]/g) || []).length === 4 && (d.match(/Z/g) || []).length === 1, d);
    const pf = processFaces([{ p: [0, 0, 10, 0, 10, 10], z: [0.5, 0.5, 0.5], fill: '#333333', opacity: 1 }, { p: [20, 0, 30, 0, 30, 10], z: [0.2, 0.2, 0.2], fill: '#444444', opacity: 1 }, { p: [0, 0, 10, 10, 0, 10], z: [0.5, 0.5, 0.5], fill: '#333333', opacity: 1 }], {});
    check('склейка через чужую грань: не перекрываются — грани одного цвета сходятся в один контур', pf.paths.length === 2 && pf.stats.faces === 3, `контуров ${pf.paths.length}`);
    const circle = Array.from({ length: 72 }, (_, i) => [50 + 40 * Math.cos(i * Math.PI / 36), 50 + 40 * Math.sin(i * Math.PI / 36)]);
    const fit = fitPolyline(circle, true, { tol: 0.1, precision: 2 });
    const curves = (fit.d.match(/C/g) || []).length;
    check('кривые: окружность из 72 точек → не больше 8 кривых Безье', curves >= 3 && curves <= 8 && /Z$/.test(fit.d), `кривых ${curves}`);
    const sq = fitPolyline([[0, 0], [10, 0], [10, 10], [0, 10]], true, {});
    check('кривые: квадрат остаётся из прямых', !/C/.test(sq.d) && (sq.d.match(/[ML]/g) || []).length === 4, sq.d);
  }

  const bad = results.filter((x) => !x).length;
  if (!keep) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* занято — останется во временной папке */ } }
  console.log(`\n${bad ? 'FAIL' : 'OK'}: проверок ${results.length}, не прошло ${bad}, пропущено ${skipped}${skipped ? ' (нет движка — см. строки SKIP)' : ''}${keep ? ` · ${tmp}` : ''}`);
  return bad ? 1 : 0;
}
