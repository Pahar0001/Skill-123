#!/usr/bin/env node
/**
 * Recraft API: векторные иконки и иллюстрации (настоящий SVG), паттерны, фоны, макеты — по описанию
 * языка сайта и в его палитре; векторизация, удаление фона, увеличение. Место в цепочке кадров —
 * после законных бесплатных источников (media.mjs), рядом с Higgsfield: то, чего нет на стоках.
 * Каждый запрос стоит денег со счёта API пользователя — без --yes скрипт только считает цену.
 *
 *   node recraft.mjs doctor                                  ключ (есть/нет), баланс, модели и цены
 *   node recraft.mjs gen "<промпт>" --for icon|illustration|pattern|background|texture|decor|mockup|photo
 *        [--model recraftv4_1_vector] [--n 1] [--size 1:1] [--colors "#6A4EE1,#111111"] [--bg "#FFFFFF"]
 *        [--text] [--style "<стиль V3>"] [--style-id <uuid>] [--ref a.png,b.png] [--seed N] [--png]
 *        [--run <папка прогона>] [--out <папка черновиков>] [--demo] --yes
 *   node recraft.mjs vectorize <файл> [--run …] --yes         растр → SVG ($0.01)
 *   node recraft.mjs remove-bg <файл> [--run …] --yes         фон прозрачным ($0.01)
 *   node recraft.mjs upscale <файл> [--creative] [--run …] --yes   чётче ($0.004) / дорисовать детали ($0.25)
 *   node recraft.mjs take <черновик> --dest <сайт>/img --seen "<что на картинке>" --caption "<роль на сайте>" [--name имя]
 *        [--license-from <картинка сайта из credits.json> | --own]   (для фона, векторизации, увеличения чужого кадра)
 *   node recraft.mjs selftest                                поддельный сервер: запросы, файлы, отказы, credits.json
 *   node recraft.mjs --help
 *
 * Ключ: RECRAFT_API_TOKEN в окружении или в ~/.claude/site-rework/.env (профиль на recraft.ai → API →
 * Generate; кнопка есть, только когда на балансе API есть единицы: 1 $ = 1000 единиц).
 * RECRAFT_API_BASE — другой адрес API (selftest поднимает свой).
 *
 * Черновики: <run>/media/recraft/<дата-время>-<имя>/NN.svg|webp|png и NN.json (модель, промпт, цена,
 * image_id). По умолчанию <run> — текущая папка. Смотреть каждый глазами; на сайт — только через take:
 * ворота --seen/--caption (как media.mjs pick), запись в credits.json (источник recraft, сгенерировано,
 * модель, промпт) — CREDITS.md собирает `media.mjs credits`.
 *
 * Правила (reference/engines.md → «Картинки и видео»):
 * - --yes — только после согласия пользователя на трату (сумма печатается без --yes, код выхода 2);
 * - --for обязателен: иконки, иллюстрации, паттерны, фоны, фактура, декор — да; photo, mockup и background —
 *   не выдают себя за реальность: промпт о «наших работах, команде, зале, гостях, блюдах, клиентах»
 *   на сайте клиента — отказ (выдумывать нельзя); демо-сайт студии — --demo;
 * - текста на картинке нет (controls.no_text), текст — вёрсткой; --text — осознанно (кириллицу
 *   генераторы коверкают — смотреть глазами);
 * - палитра — из дизайн-системы сайта (--colors, --bg), промпт — по-английски, языком дизайна донора;
 * - права (Developer Terms 11.08.2026): картинки из API принадлежат владельцу ключа, коммерческое
 *   использование можно, подпись не нужна; учить на них нейросети нельзя; метаданные, водяные знаки и
 *   метки Recraft не удалять и не менять — файл берётся как есть, пережимать с сохранением метаданных;
 * - фон, векторизация, увеличение чужого кадра — права как у исходника (take --license-from).
 *
 * Код выхода: 0 — сделано; 1 — ошибка (сеть, API, аргументы); 2 — не сделано по правилу (нет --yes,
 * нет ключа, запрещённое назначение, не прошли ворота take).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseArgs, ensureDir } from './lib.mjs';
import { loadEnv } from './media/net.mjs';
import { gate, saveCredit, readCredits } from './media/manifest.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), {
  flags: ['help', 'h', 'yes', 'text', 'png', 'demo', 'creative', 'own'],
  optional: ['for', 'model', 'n', 'size', 'colors', 'bg', 'style', 'style-id', 'ref', 'seed', 'run', 'out', 'dest', 'seen', 'caption', 'name', 'license-from'],
  commands: ['doctor', 'gen', 'vectorize', 'remove-bg', 'upscale', 'take', 'selftest', 'price'],
  strict: true,
});
/* «-h» parseArgs кладёт в позиционные: без этой проверки было «Не знаю команду «-h»», код 1 */
if (opt.help || opt.h || pos.includes('-h') || !pos.length) { console.log(HELP); process.exit(pos.length || opt.help || opt.h ? 0 : 1); }

/* ---------- цены и модели (recraft.ai/docs/api-reference/pricing, 28.09.2026; 1 $ = 1000 единиц) ---------- */
export const PRICES = {
  recraftv4_1: 35, recraftv4_1_raster: 35, recraftv4_1_vector: 80, recraftv4_1_pro: 210, recraftv4_1_pro_raster: 210, recraftv4_1_pro_vector: 300,
  recraftv4_1_utility: 35, recraftv4_1_utility_raster: 35, recraftv4_1_utility_vector: 80, recraftv4_1_utility_pro: 210, recraftv4_1_utility_pro_raster: 210, recraftv4_1_utility_pro_vector: 300,
  recraftv4_1_flash: 7, recraftv4_1_flash_raster: 7,
  recraftv4: 40, recraftv4_vector: 80, recraftv4_pro: 250, recraftv4_pro_vector: 300,
  recraftv4_styles: 35, recraftv4_styles_vector: 50, recraftv4_styles_pro: 100, recraftv4_styles_pro_vector: 120,
  recraftv3: 40, recraftv3_vector: 80, recraftv2: 22, recraftv2_vector: 44,
};
export const OPS = { vectorize: 10, 'remove-bg': 10, upscale: 4, 'upscale-creative': 250 };
const isVector = (m) => /_vector$/.test(m);
/* назначение → модель по умолчанию: вектор для знаков и декора, растр для фона, фактуры и макетов */
const FOR = {
  icon: { model: 'recraftv4_1_vector', size: '1:1', note: 'иконка в SVG' },
  illustration: { model: 'recraftv4_1_vector', size: '4:3', note: 'иллюстрация в SVG' },
  pattern: { model: 'recraftv4_1_vector', size: '1:1', note: 'паттерн, повторяемый' },
  decor: { model: 'recraftv4_1_vector', size: '1:1', note: 'декоративный элемент' },
  background: { model: 'recraftv4_1', size: '16:9', note: 'фон секции' },
  texture: { model: 'recraftv4_1', size: '1:1', note: 'фактура' },
  mockup: { model: 'recraftv4_1_utility', size: '4:3', note: 'макет товара, упаковки, вывески' },
  photo: { model: 'recraftv4_1', size: '3:2', note: 'атмосферный кадр' },
};
/* то, что на сайте клиента выдаёт себя за реальность: «наши работы», люди, блюда, место */
const REALITY = /\b(our|we|team|staff|client|customer|guest|portfolio|interior of (the|our)|dish|food|meal|plate of|chef|barber at work|real)\b|наш|(?<![а-яё])мы(?![а-яё])|команд|сотрудник|клиент|гост|портфолио|работ[аы]? мастер|(?<![а-яё])зал(?![а-яё])|интерьер|блюд|(?<![а-яё])еда(?![а-яё])|кухн|повар|отзыв/i;   /* \b в JS — только для латиницы */

const die = (m, code = 1) => { console.error(m); process.exit(code); };
const dollars = (units) => `$${(units / 1000).toFixed(units % 10 ? 3 : 2)}`;

loadEnv();
const BASE = String(process.env.RECRAFT_API_BASE || 'https://external.api.recraft.ai/v1').replace(/\/$/, '');
const TOKEN = process.env.RECRAFT_API_TOKEN && process.env.RECRAFT_API_TOKEN.trim();

async function api(method, route, body = null, { timeout = 180000 } = {}) {
  if (!TOKEN) die('RECRAFT_API_TOKEN не задан: recraft.ai → профиль → API → Generate (нужен положительный баланс API), строка RECRAFT_API_TOKEN=… в ~/.claude/site-rework/.env', 2);
  let res;
  try {
    res = await fetch(BASE + route, { method, headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
  } catch (e) { die(`Recraft: сеть — ${String(e.cause ? e.cause.code || e.cause.message : e.message)} (${BASE}). Повторить позже; ключ и баланс — node recraft.mjs doctor`); }
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* не JSON */ }
  if (!res.ok) {
    const msg = json && (json.message || json.error || json.detail) ? JSON.stringify(json.message || json.error || json.detail) : text.slice(0, 300);
    const hint = res.status === 401 ? ' — ключ неверный или отозван' : res.status === 402 || /credit|balance|insufficient/i.test(msg) ? ' — не хватает единиц на балансе API' : res.status === 429 ? ' — предел запросов (5 в секунду, 100 картинок в минуту): подождать минуту' : '';
    die(`Recraft ${method} ${route}: HTTP ${res.status}${hint}: ${msg}`);
  }
  return json;
}

/* файл → data URL (image_url в JSON: так не нужен multipart и имя поля) */
function dataUrl(file) {
  if (!fs.existsSync(file)) die(`Нет файла: ${file}`);
  const ext = path.extname(file).toLowerCase(); const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[ext];
  if (!mime) die(`${file}: нужен PNG, JPG или WEBP (для удаления фона — ещё SVG)`);
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) die(`Цвет «${h}» — нужен #RRGGBB`); return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); };

/* SVG с сервера — только проверка, файл не меняется: условия Recraft (Developer Terms, п. 6.4) запрещают
   удалять и менять машиночитаемые метаданные, водяные знаки и метки в результатах. Скрипт, обработчик
   событий или javascript: в SVG — на сайт такой файл не идёт (take откажет), а не вырезается. */
export function svgCheck(text) {
  const s = String(text);
  if (!/<svg[\s>]/i.test(s)) return { ok: false, why: 'в ответе нет <svg>' };
  const unsafe = [/<script\b/i.test(s) && '<script>', /\son[a-z]+\s*=/i.test(s) && 'обработчики on…', /javascript:/i.test(s) && 'javascript:', /<foreignObject\b/i.test(s) && '<foreignObject>'].filter(Boolean);
  return { ok: true, unsafe, metadata: /<metadata\b/i.test(s), paths: (s.match(/<(path|rect|circle|ellipse|polygon|polyline|line)\b/gi) || []).length };
}

/* куда писать черновики: <run>/media/recraft/<время>-<имя>/ */
function draftDir(label) {
  const run = path.resolve(String(opt.run && opt.run !== true ? opt.run : '.'));
  const base = opt.out && opt.out !== true ? path.resolve(String(opt.out)) : path.join(run, 'media', 'recraft');
  const stamp = new Date().toLocaleString('sv-SE').replace(/[ :]/g, '-').replace(/-\d\d$/, '');
  return ensureDir(path.join(base, `${stamp}-${String(label).replace(/[^\p{L}\d-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'recraft'}`));
}

/* сохранить картинку ответа: b64_json или url (url живёт около суток) */
async function saveImage(img, fileBase, vector) {
  let buf;
  if (img.b64_json) buf = Buffer.from(img.b64_json, 'base64');
  else if (img.url) { const r = await fetch(img.url, { signal: AbortSignal.timeout(120000) }); if (!r.ok) die(`Не скачалась картинка ${img.url}: HTTP ${r.status}`); buf = Buffer.from(await r.arrayBuffer()); }
  else die('В ответе нет ни b64_json, ни url');
  const head = buf.subarray(0, 64).toString('utf8');
  let ext = vector || /<svg|<\?xml/i.test(head) ? '.svg' : buf[0] === 0x89 && buf[1] === 0x50 ? '.png' : buf.subarray(8, 12).toString() === 'WEBP' ? '.webp' : buf[0] === 0xff && buf[1] === 0xd8 ? '.jpg' : '.bin';
  let note = '';
  if (ext === '.svg') { const c = svgCheck(buf.toString('utf8')); if (!c.ok) { ext = '.bin'; note = c.why; } else note = `${c.paths} фигур${c.metadata ? ', есть <metadata> (не удалять)' : ''}${c.unsafe.length ? `, ОПАСНО: ${c.unsafe.join(', ')} — на сайт не пойдёт` : ''}`; }
  const file = fileBase + ext; fs.writeFileSync(file, buf);
  return { file, bytes: buf.length, ext, note };
}

function sidecar(file, meta) { fs.writeFileSync(file.replace(/\.[^.]+$/, '.json'), JSON.stringify(meta, null, 1)); }

/* ---------- команды ---------- */
const cmd = pos.shift();

if (cmd === 'selftest') process.exit(await selftest());

if (cmd === 'doctor') {
  console.log(`Адрес API: ${BASE}`);
  console.log(`Ключ RECRAFT_API_TOKEN: ${TOKEN ? 'задан' : 'НЕ задан — recraft.ai → профиль → API → Generate, строка в ~/.claude/site-rework/.env'}`);
  if (TOKEN) { const me = await api('GET', '/users/me', null, { timeout: 30000 }); console.log(`Баланс: ${me.credits} единиц (${dollars(me.credits)})${me.name ? ` · ${me.name}` : ''}`); }
  console.log('\nНазначение → модель по умолчанию (цена за картинку):');
  for (const [k, v] of Object.entries(FOR)) console.log(`  ${k.padEnd(12)} ${v.model.padEnd(22)} ${dollars(PRICES[v.model]).padStart(6)} · ${v.note}`);
  console.log(`\nДешёвый черновик — recraftv4_1_flash ${dollars(PRICES.recraftv4_1_flash)} (растр); Pro — ${dollars(PRICES.recraftv4_1_pro)} растр / ${dollars(PRICES.recraftv4_1_pro_vector)} вектор.`);
  console.log(`Операции: векторизация ${dollars(OPS.vectorize)}, удаление фона ${dollars(OPS['remove-bg'])}, увеличение ${dollars(OPS.upscale)} (с дорисовкой ${dollars(OPS['upscale-creative'])}).`);
  process.exit(0);
}

if (cmd === 'take') {
  const src = pos[0]; if (!src || !fs.existsSync(src)) die('Нужно: node recraft.mjs take <черновик.svg|webp|png> --dest <сайт>/img --seen "…" --caption "…"');
  if (!opt.dest || opt.dest === true) die('--dest <папка картинок сайта> обязателен');
  const metaFile = src.replace(/\.[^.]+$/, '.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : null;
  if (!meta) die(`Рядом нет ${path.basename(metaFile)} — это не черновик recraft.mjs (свои файлы — media.mjs import)`, 2);
  const g = gate({ seen: opt.seen, caption: opt.caption });
  if (!g.ok) { for (const m of g.messages) console.error(`НЕ ВЗЯТО: ${m}`); process.exit(2); }
  if (/\.svg$/i.test(src)) { const c = svgCheck(fs.readFileSync(src, 'utf8')); if (!c.ok || c.unsafe.length) die(`НЕ ВЗЯТО: в SVG ${c.ok ? c.unsafe.join(', ') : c.why} — на сайт такой файл нельзя, а вырезать части результата условия Recraft (п. 6.4) не дают: сгенерировать заново`, 2); }
  /* операция над своим или чужим кадром (фон, векторизация, увеличение): права — как у исходника */
  let base = null;
  if (meta.op !== 'generate') {
    if (opt['license-from'] && opt['license-from'] !== true) {
      const from = path.resolve(String(opt['license-from'])); const rec = readCredits(path.dirname(from)).find((x) => x.name === path.basename(from));
      if (!rec) die(`НЕ ВЗЯТО: в ${path.join(path.dirname(from), 'credits.json')} нет записи о ${path.basename(from)} — сначала исходник через media.mjs pick/import`, 2);
      base = rec;
    } else if (!opt.own) die(`НЕ ВЗЯТО: это ${meta.op} над файлом ${meta.source_file || '?'} — права как у исходника: --license-from <картинка сайта с записью в credits.json> или --own (материал владельца сайта)`, 2);
  }
  const dest = ensureDir(path.resolve(String(opt.dest)));
  const ext = path.extname(src);
  const name = (opt.name && opt.name !== true ? String(opt.name).replace(/\.[a-z0-9]+$/i, '') : `recraft-${meta.for}-${path.basename(src, ext)}`).replace(/[^\p{L}\d._-]+/gu, '-') + ext;
  fs.copyFileSync(src, path.join(dest, name));
  const TERMS = { license: 'Recraft Developer Terms: права у владельца ключа API, коммерческое использование можно; метаданные и метки Recraft не удалять', license_url: 'https://www.recraft.ai/legal/developer-terms' };
  const rec = meta.op === 'generate'
    ? { name, seen: String(opt.seen).trim(), caption: String(opt.caption).trim(), source: 'recraft', generated: true, author: 'сгенерировано Recraft (API)', ...TERMS, page_url: null, attribution_required: false,
      changes: `сгенерировано: ${meta.model}, ${meta.date}; промпт: «${String(meta.prompt || '').slice(0, 120)}»`, model: meta.model, prompt: meta.prompt || null, image_id: meta.image_id || null, cost_units: meta.cost_units }
    : base ? { ...base, name, seen: String(opt.seen).trim(), caption: String(opt.caption).trim(), changes: [base.changes, `Recraft: ${meta.op}, ${meta.date}`].filter(Boolean).join('; '), processed_by: 'recraft', cost_units: meta.cost_units }
      : { name, seen: String(opt.seen).trim(), caption: String(opt.caption).trim(), source: 'владелец сайта', author: 'материал владельца', license: 'материал владельца сайта', license_url: null, page_url: null, attribution_required: false, changes: `Recraft: ${meta.op}, ${meta.date}`, processed_by: 'recraft', cost_units: meta.cost_units };
  saveCredit(dest, rec);
  console.log(`OK: ${path.join(dest, name)} · credits.json: ${readCredits(dest).length} записей · CREDITS.md — node media.mjs credits ${dest} --md <сайт>/CREDITS.md`);
  if (!/\.svg$/i.test(src)) console.log('Пережимать и нарезать — с сохранением метаданных (sharp: .keepMetadata()): метки Recraft удалять нельзя (Developer Terms, п. 6.4).');
  process.exit(0);
}

if (cmd === 'gen' || cmd === 'price') {
  const prompt = pos.join(' ').trim(); if (!prompt) die('Нужен промпт: node recraft.mjs gen "<описание по-английски>" --for icon … (подробно: --help)');
  const role = opt.for && opt.for !== true ? String(opt.for) : null;
  if (!role || !FOR[role]) die(`--for обязателен: ${Object.keys(FOR).join(' | ')} — для чего картинка на сайте`, 2);
  if ((role === 'photo' || role === 'mockup' || role === 'background') && REALITY.test(`${prompt} ${opt.caption || ''}`) && !opt.demo) die(`ОТКАЗ: «${prompt.slice(0, 80)}» — сгенерированная картинка выдаёт себя за реальность (наши работы, люди, блюда, место). На сайте клиента так нельзя: «ничего не выдумывать». Своё фото владельца, законный сток (media.mjs) или иллюстрация; демо-сайт студии — --demo.`, 2);
  const model = opt.model && opt.model !== true ? String(opt.model) : FOR[role].model;
  if (!(model in PRICES)) die(`Модель «${model}» не знаю: ${Object.keys(PRICES).join(', ')}`);
  const n = opt.n && opt.n !== true ? Number(opt.n) : 1; if (!(n >= 1 && n <= 6)) die('--n: от 1 до 6');
  const cost = PRICES[model] * n;
  const body = { prompt, model, n, response_format: 'b64_json' };
  const size = opt.size && opt.size !== true ? String(opt.size) : FOR[role].size; if (size) body.size = size;
  if (!isVector(model) && opt.png) body.image_format = 'png';
  const controls = {};
  if (opt.colors && opt.colors !== true) controls.colors = String(opt.colors).split(',').map((c) => ({ rgb: hexRgb(c) }));
  if (opt.bg && opt.bg !== true) controls.background_color = { rgb: hexRgb(opt.bg) };
  if (!opt.text) controls.no_text = true;
  if (Object.keys(controls).length) body.controls = controls;
  if (opt.style && opt.style !== true) { if (!/^recraftv[23]/.test(model)) die('--style (готовые стили по имени) — только у моделей V2/V3; у V4 — --style-id или --ref'); body.style = String(opt.style); }
  if (opt['style-id'] && opt['style-id'] !== true) body.style_id = String(opt['style-id']);
  if (opt.ref && opt.ref !== true) body.style_reference_urls = String(opt.ref).split(',').map((f) => dataUrl(f.trim()));
  if (opt.seed && opt.seed !== true) body.random_seed = Number(opt.seed);
  console.log(`${model} × ${n} (${FOR[role].note}${isVector(model) ? ', SVG' : ''}) — ${cost} единиц = ${dollars(cost)}`);
  if (cmd === 'price' || !opt.yes) {
    if (TOKEN && cmd !== 'price') { try { const me = await api('GET', '/users/me', null, { timeout: 30000 }); console.log(`Баланс: ${me.credits} единиц (${dollars(me.credits)})`); } catch { /* баланс не узнали */ } }
    if (cmd === 'price') process.exit(0);
    die('НЕ СДЕЛАНО: трата со счёта пользователя — спросить согласие (сумма выше) и повторить с --yes', 2);
  }
  const dir = draftDir(role + '-' + prompt.split(/\s+/).slice(0, 4).join('-'));
  const t0 = Date.now();
  const res = await api('POST', '/images/generations', body);
  const date = new Date().toLocaleDateString('sv-SE');
  const files = [];
  for (let i = 0; i < (res.data || []).length; i++) {
    const img = res.data[i]; const s = await saveImage(img, path.join(dir, String(i + 1).padStart(2, '0')), isVector(model));
    sidecar(s.file, { tool: 'recraft.mjs', op: 'generate', for: role, model, prompt, size: body.size || null, controls: body.controls || null, style: body.style || null, style_id: body.style_id || res.style_id || null, seed: body.random_seed ?? null, image_id: img.image_id || null, revised_prompt: img.revised_prompt || null, cost_units: Math.round((res.credits ?? cost) / Math.max(1, res.data.length)), date });
    files.push(s);
  }
  console.log(`OK: ${files.length} за ${((Date.now() - t0) / 1000).toFixed(1)} с · списано ${res.credits ?? '?'} единиц${res.credits != null ? ` (${dollars(res.credits)})` : ''}`);
  for (const f of files) console.log(`  ${f.file} · ${Math.round(f.bytes / 1024)} КБ${f.note ? ` · ${f.note}` : ''}`);
  console.log('Открыть каждую глазами (кириллица, лишние детали, «почти буквы»); годную — node recraft.mjs take <файл> --dest <сайт>/img --seen "…" --caption "…"');
  process.exit(0);
}

if (cmd === 'vectorize' || cmd === 'remove-bg' || cmd === 'upscale') {
  const src = pos[0]; if (!src) die(`Нужно: node recraft.mjs ${cmd} <файл> --yes`);
  const key = cmd === 'upscale' && opt.creative ? 'upscale-creative' : cmd;
  const cost = OPS[key];
  console.log(`${key} ${path.basename(src)} — ${cost} единиц = ${dollars(cost)}`);
  if (!opt.yes) die('НЕ СДЕЛАНО: трата со счёта пользователя — спросить согласие и повторить с --yes', 2);
  const route = { vectorize: '/images/vectorize', 'remove-bg': '/images/removeBackground', upscale: '/images/crispUpscale', 'upscale-creative': '/images/creativeUpscale' }[key];
  const body = { image_url: dataUrl(src), response_format: 'b64_json' }; if (key !== 'vectorize' && opt.png) body.image_format = 'png';
  const dir = draftDir(`${key}-${path.basename(src, path.extname(src))}`);
  const res = await api('POST', route, body);
  const s = await saveImage(res.image || {}, path.join(dir, '01'), key === 'vectorize');
  sidecar(s.file, { tool: 'recraft.mjs', op: key, for: key === 'vectorize' ? 'decor' : 'photo', model: key, source_file: path.resolve(src), image_id: (res.image || {}).image_id || null, cost_units: res.credits ?? cost, date: new Date().toLocaleDateString('sv-SE') });
  console.log(`OK: ${s.file} · ${Math.round(s.bytes / 1024)} КБ${s.note ? ` · ${s.note}` : ''} · списано ${res.credits ?? '?'} единиц`);
  process.exit(0);
}

die(`Не знаю команду «${cmd}» (--help)`);

/* ---------- самопроверка: поддельный сервер Recraft ---------- */
async function selftest() {
  const { spawn } = await import('node:child_process');
  const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><metadata>recraft</metadata><path d="M0 0h10v10z" fill="#6A4EE1"/></svg>';
  const svgBad = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><path d="M0 0h10v10z" onclick="x()"/></svg>';
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const j = body ? JSON.parse(body) : null; seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: j });
      const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer test-token') return send(401, { message: 'bad token' });
      if (req.url === '/v1/users/me') return send(200, { id: '00000000-0000-0000-0000-000000000000', credits: 1234, name: 'test' });
      if (req.url === '/v1/images/generations') {
        const vec = /_vector$/.test(j.model);
        return send(200, { created: 1, credits: (vec ? 80 : 35) * j.n, data: Array.from({ length: j.n }, (_, i) => ({ image_id: `id-${i}`, b64_json: (vec ? Buffer.from(svg) : tiny).toString('base64') })) });
      }
      if (req.url === '/v1/images/vectorize') return send(200, { created: 1, credits: 10, image: { image_id: 'v1', b64_json: Buffer.from(svgBad).toString('base64') } });
      if (req.url === '/v1/images/removeBackground') return send(200, { created: 1, credits: 10, image: { image_id: 'r1', b64_json: tiny.toString('base64') } });
      return send(404, { message: 'not found' });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/v1`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recraft-selftest-'));
  const self = fileURLToPath(import.meta.url);
  const run = (args, env = {}) => new Promise((resolve) => {
    const p = spawn(process.execPath, [self, ...args], { env: { ...process.env, RECRAFT_API_BASE: base, RECRAFT_API_TOKEN: 'test-token', ...env }, cwd: tmp });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  const checks = [];
  const check = (name, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
  let r = await run(['gen', 'flat icon of a printer nozzle', '--for', 'icon', '--run', tmp]);
  check('без --yes не тратит (код 2, сумма напечатана)', r.code === 2 && /\$0\.08/.test(r.out) && !seen.some((x) => x.url === '/v1/images/generations'), r.out.split('\n')[0]);
  r = await run(['gen', 'photo of our team in the workshop', '--for', 'photo', '--yes', '--run', tmp]);
  check('фото «нашей команды» — отказ (код 2)', r.code === 2 && /ОТКАЗ/.test(r.out));
  r = await run(['gen', 'icon', '--yes', '--run', tmp]);
  check('без --for — отказ (код 2)', r.code === 2);
  r = await run(['gen', 'flat icon of a printer nozzle', '--for', 'icon', '--colors', '#6A4EE1,#111111', '--bg', '#FFFFFF', '--yes', '--run', tmp]);
  const g = seen.find((x) => x.url === '/v1/images/generations');
  check('генерация: модель, палитра, без текста, b64', r.code === 0 && g && g.body.model === 'recraftv4_1_vector' && g.body.controls.colors[0].rgb.join() === '106,78,225' && g.body.controls.background_color.rgb.join() === '255,255,255' && g.body.controls.no_text === true && g.body.response_format === 'b64_json', g ? JSON.stringify(g.body).slice(0, 160) : 'запроса нет');
  const svgFile = (r.out.match(/(\S+\.svg)/) || [])[1];
  const svgText = svgFile && fs.existsSync(svgFile) ? fs.readFileSync(svgFile, 'utf8') : '';
  check('SVG сохранён как есть (метаданные Recraft на месте)', !!svgText && svgText === svg, svgFile || 'файла нет');
  const meta = svgFile ? JSON.parse(fs.readFileSync(svgFile.replace(/\.svg$/, '.json'), 'utf8')) : {};
  check('рядом описание черновика (модель, промпт, цена)', meta.model === 'recraftv4_1_vector' && meta.cost_units === 80 && /nozzle/.test(meta.prompt));
  r = await run(['take', svgFile || 'x', '--dest', path.join(tmp, 'site', 'img'), '--seen', 'ok', '--caption', 'Значок печати']);
  check('take без внятного --seen — отказ (код 2)', r.code === 2);
  r = await run(['take', svgFile || 'x', '--dest', path.join(tmp, 'site', 'img'), '--seen', 'фиолетовое сопло принтера плоской линией', '--caption', 'Значок печати']);
  const cr = readCredits(path.join(tmp, 'site', 'img'));
  check('take: файл на сайте и запись в credits.json', r.code === 0 && cr.length === 1 && cr[0].source === 'recraft' && cr[0].generated === true && /recraftv4_1_vector/.test(cr[0].changes), cr[0] ? cr[0].name : r.out.slice(0, 120));
  fs.writeFileSync(path.join(tmp, 'in.png'), tiny);
  r = await run(['vectorize', path.join(tmp, 'in.png'), '--yes', '--run', tmp]);
  const v = seen.find((x) => x.url === '/v1/images/vectorize');
  check('векторизация: data URL в image_url, SVG на выходе, опасное помечено', r.code === 0 && v && /^data:image\/png;base64,/.test(v.body.image_url) && /\.svg/.test(r.out) && /ОПАСНО/.test(r.out));
  const vecFile = (r.out.match(/(\S+\.svg)/) || [])[1];
  r = await run(['take', vecFile || 'x', '--dest', path.join(tmp, 'site', 'img'), '--seen', 'векторный контур печатной головки принтера', '--caption', 'Контур', '--own']);
  check('take: SVG со скриптом — отказ (не вырезаем, п. 6.4)', r.code === 2 && /НЕ ВЗЯТО: в SVG <script>/.test(r.out));
  r = await run(['remove-bg', path.join(tmp, 'in.png'), '--yes', '--run', tmp]);
  const bgFile = (r.out.match(/OK: (\S+\.(?:png|webp))/) || [])[1];
  r = await run(['take', bgFile || 'x', '--dest', path.join(tmp, 'site', 'img'), '--seen', 'маленький квадрат без фона для проверки', '--caption', 'Проверка']);
  check('take: результат операции без --license-from/--own — отказ', r.code === 2 && /права как у исходника/.test(r.out));
  r = await run(['take', bgFile || 'x', '--dest', path.join(tmp, 'site', 'img'), '--seen', 'маленький квадрат без фона для проверки', '--caption', 'Проверка', '--license-from', path.join(tmp, 'site', 'img', 'recraft-icon-01.svg')]);
  const cr2 = readCredits(path.join(tmp, 'site', 'img')).find((x) => x.processed_by === 'recraft');
  check('take --license-from: запись исходника + «Recraft: remove-bg»', r.code === 0 && !!cr2 && /Recraft: remove-bg/.test(cr2.changes));
  r = await run(['doctor']);
  check('doctor: баланс и цены', r.code === 0 && /1234 единиц/.test(r.out) && /recraftv4_1_vector/.test(r.out));
  r = await run(['doctor'], { RECRAFT_API_TOKEN: 'wrong' });
  check('неверный ключ — понятная ошибка', r.code === 1 && /401/.test(r.out) && /ключ неверный/.test(r.out));
  srv.close();
  const bad = checks.filter((x) => !x).length;
  console.log(`${bad ? 'FAIL' : 'OK'}: проверок ${checks.length}, не прошло ${bad} · ${tmp}`);
  return bad ? 1 : 0;
}
