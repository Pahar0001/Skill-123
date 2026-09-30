#!/usr/bin/env node
/**
 * Firecrawl: сбор данных для сайта — карта сайта донора или клиента, тексты страниц для разбора тона,
 * фирменный стиль (цвета, шрифты, логотип) кандидатов в доноры, факты о деле со ссылками для режима
 * «контента нет — сделай сам». Облако Firecrawl, запросы к REST API напрямую (не через CLI).
 * Когда брать и когда нет, цена команд — reference/firecrawl.md.
 * Не для замеров (discover, typeset, motion, perf снимают числа с живой страницы), не для localhost и
 * частных сетей (облако не видит эту машину), не для фото и видео (media.mjs), не для файлов клиента
 * (в облако их не отправляем).
 *
 *   node firecrawl.mjs map <url> [--run <папка>] [--limit 200] [--search слово]
 *   node firecrawl.mjs scrape <url> [--run <папка>] [--formats markdown,branding]
 *   node firecrawl.mjs search "<запрос>" --run <папка> [--lang ru] [--country RU] [--location "…"] [--limit 5]
 *   node firecrawl.mjs facts --run <папка> --about "<дело, город>" [--limit 5]
 *   node firecrawl.mjs status [--run <папка>]
 *   node firecrawl.mjs --selftest
 *   node firecrawl.mjs --help   (или -h)
 *
 * map    — адреса сайта (1 кредит за вызов при любом --limit), сгруппированные по типам страниц по
 *          шаблону адреса, как в discover.mjs: «/menu», «/product/*», «/blog/*», «/contacts», — чтобы
 *          разведка донора прошла ВСЕ типы страниц. → <папка>/firecrawl/map-<слаг>.json и .md; строка
 *          --pages «по странице каждого типа» для motion.mjs (тип=путь) и для copy.mjs и shots.mjs (пути).
 * scrape — текст страницы (markdown: основное содержимое, без шапки и подвала) и фирменный стиль
 *          (branding: тема, цвета, шрифты, логотип) — 1 кредит за страницу.
 *          → <папка>/firecrawl/scrape-<слаг>.md и .json. Стиль — подсказка для отбора доноров, а не
 *          замер: числа донора — extract.mjs (design-reference) и discover.mjs, кириллица шрифтов —
 *          cyrillic-check.mjs. PDF и документы не читает (у Firecrawl кредит за каждую страницу файла).
 * search — страницы из поиска с выдержками — 2 кредита за каждые 10 результатов.
 *          → <папка>/firecrawl/search-<слаг запроса>.json и .md.
 * facts  — поиск по --about (10 результатов, 2 кредита) и чтение --limit источников (по 1 кредиту) →
 *          КАНДИДАТЫ фактов: цены, сроки, проценты, числа, условия и гарантии — те же заявления, что
 *          сверяет copy.mjs. → <папка>/copy/facts-candidates.json в формате facts.json:
 *          [{ "fact": "250 ₽", "what": "цена: «…»", "source": "<адрес> (<дата>)", "kind", "title", "about" }]
 *          и список для глаз <папка>/firecrawl/facts-<слаг>.md. Кандидаты — не факты: в copy/facts.json
 *          их переносят только после проверки глазами. Не читаются: x.com и twitter.com (у Firecrawl
 *          отдельная цена), PDF и документы, видео и соцсети, второй адрес того же сайта, частные сети;
 *          источник, который не прочитался, заменяется следующим из выдачи. Записи прежнего запуска
 *          с тем же --about заменяются, с другим — остаются.
 * status — остаток кредитов на тарифе (запрос бесплатный) и, с --run, сколько потрачено в папке прогона.
 *
 * Флаги:
 *   --run <папка>       папка прогона: путь (C:/…, ./x), адрес сайта (папка как у остальных скриптов —
 *                       ~/.claude/site-rework/runs/<слаг> или SITE_REWORK_RUNS) или имя папки там же;
 *                       у map и scrape без --run — папка по адресу, у search и facts --run обязателен,
 *                       у status — по желанию (учёт этой папки)
 *   --out <папка>       то же, что --run (как у copy.mjs и security.mjs)
 *   --limit N           map: сколько адресов (200, до 5000; цена та же); search: сколько результатов
 *                       (5, до 20); facts: сколько источников прочитать (5, от 1 до 10)
 *   --search <слово>    map: только адреса по теме, самые близкие первыми («меню», «доставка»)
 *   --formats <список>  scrape: markdown, branding или оба через запятую (по умолчанию оба, цена та же)
 *   --lang <язык>       search, facts: язык выдачи (ru)
 *   --country <код>     search, facts: страна выдачи, код ISO (RU)
 *   --location <место>  search, facts: место для местной выдачи («Yaroslavl,Yaroslavl Oblast,Russia»)
 *   --about <дело, город>  facts: о чём искать факты («барбершоп, Ярославль»)
 *   --budget N          предел кредитов на папку прогона (50); учёт — <папка>/firecrawl/budget.json
 *   --fresh             не брать из кэша, спросить Firecrawl заново (ответ ляжет в кэш)
 *   --selftest          подставной сервер на этой машине с ответами из fixtures/firecrawl: map, scrape,
 *                       search, facts, status, кэш, бюджет, отказы, ошибки API — без сети и без кредитов
 *   --help, -h          эта справка
 *
 * Кэш: <папка>/firecrawl/cache/ — по команде, адресу и параметрам; повтор того же — из кэша, без
 * кредитов (и без ключа). --fresh — обойти.
 * Бюджет: перед каждым вызовом — оценка цены (map 1, scrape 1, search 2 за 10 результатов, facts —
 * поиск и все источники разом); не влезает в --budget — остановка до вызова. Списанное пишется по ответу
 * Firecrawl (creditsUsed), иначе по цене; ошибка без документа — 0; нет ответа за отведённое время — по
 * цене (работа могла быть сделана). Остаток на тарифе (бесплатно — 1000 в месяц) — команда status.
 * Ключ: FIRECRAWL_API_KEY в окружении или в ~/.claude/site-rework/.env; нет ключа — строка «INFO пропуск:
 * нет FIRECRAWL_API_KEY» и код 0. FIRECRAWL_API_URL — другой адрес API (самопроверка поднимает свой);
 * FIRECRAWL_TIMEOUT_MS — сколько ждать ответа (120000).
 * Итог каждой команды — строка OK, WARN, FAIL или INFO.
 *
 * Код выхода: 0 — сделано (OK, WARN) или пропуск без ключа (INFO); 1 — неверные аргументы, ошибка API
 * или сети (ключ не принят, нет кредитов, предел запросов, нет ответа); 2 — отказ по правилу: адрес
 * этой машины или частной сети, file://, x.com, PDF, бюджет прогона.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, runDir, slugFromUrl, capSlug, ensureDir, writeJson, readJson, unmangle, sleep } from './lib.mjs';
import { loadEnv, ENV_FILE } from './media/net.mjs';
import { claimsOf, sentencesAt, collapse, clip, words, KIND_RU } from './copy-rules.mjs';

const SELF = fileURLToPath(import.meta.url);
const FIXTURES = path.join(path.dirname(SELF), 'fixtures', 'firecrawl');
const HELP = fs.readFileSync(SELF, 'utf8').split('*/')[0].replace(/^#!.*\r?\n\/\*\*?\r?\n?/, '').replace(/^ ?\* ?/gm, '');

const COMMANDS = ['map', 'scrape', 'search', 'facts', 'status', 'selftest'];
const VALUE_OPTS = ['run', 'out', 'limit', 'search', 'formats', 'lang', 'country', 'location', 'about', 'budget'];
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h', 'fresh', 'selftest'], optional: VALUE_OPTS, commands: COMMANDS, strict: true });
if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h')) { console.log(HELP); process.exit(0); }

/* ---------- постоянные ---------- */
const DEFAULT_BUDGET = 50;
const FACTS_POOL = 10;          /* facts: сколько результатов поиска смотреть — 10 стоят столько же, сколько 5 */
const MAX_PER_SOURCE = 25;      /* facts: кандидатов с одного источника — список должен читаться глазами */
const FORMATS = ['markdown', 'branding'];
const USES = { map: ['limit', 'search'], scrape: ['formats'], search: ['limit', 'lang', 'country', 'location'], facts: ['about', 'limit', 'lang', 'country', 'location'], status: ['run', 'out', 'budget'] };
const COMMON = ['run', 'out', 'budget', 'fresh'];
let CMD = null;
let KEY = '';

class Stop extends Error {
  /* code — код выхода; status — HTTP; charged — работа могла быть сделана и оплачена; info — пропуск без ключа */
  constructor(message, code = 1, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100; const b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };
const cr = (n) => `${n} ${plural(n, 'кредит', 'кредита', 'кредитов')}`;
const dayOf = (iso) => { const d = iso ? new Date(iso) : new Date(); return (Number.isNaN(d.getTime()) ? new Date() : d).toLocaleDateString('sv-SE'); };
const timeOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('sv-SE').slice(0, 16); };
const textSlug = (s) => capSlug(String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/gi, '-').replace(/^-+|-+$/g, '') || 'zapros');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; } };
const readable = (s) => { try { return decodeURI(s); } catch { return String(s); } };
const shortUrl = (u) => { try { const x = new URL(u); return clip(x.hostname.replace(/^www\./i, '') + (x.pathname === '/' ? '' : decodeURI(x.pathname)), 60); } catch { return clip(String(u), 60); } };
const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { const t = Date.now() + ms; while (Date.now() < t) { /* ждём */ } } };

function intOpt(k, def, min, max) {
  if (opt[k] === undefined) return def;
  const n = Number(opt[k]);
  if (!Number.isInteger(n) || n < min || n > max) throw new Stop(`--${k} ${opt[k]}: нужно целое число от ${min} до ${max}`, 1);
  return n;
}

/* ---------- адрес: только открытый интернет ---------- */
const LOCAL_WHY = 'облако Firecrawl не видит эту машину и её сеть — свои страницы снимают свои скрипты (discover.mjs, runtime.mjs, copy.mjs snapshot)';
const INNER_TLD = /\.(localhost|local|lan|internal|intranet|home|corp|localdomain|home\.arpa)$/i;
const PRICEY = /(^|\.)(x\.com|twitter\.com)$/i;
const SOCIAL = /(^|\.)(youtube\.com|youtu\.be|rutube\.ru|vk\.com|vkvideo\.ru|ok\.ru|instagram\.com|facebook\.com|tiktok\.com|t\.me|telegram\.me|pinterest\.[a-z.]+|dzen\.ru)$/i;
const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|rtf)$/i;
const v4of = (h) => { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h); return m ? m.slice(1).map(Number) : null; };
function mappedV4(h) {
  let m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(h); if (m) return v4of(m[1]);
  m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(h);
  if (m) { const x = parseInt(m[1], 16); const y = parseInt(m[2], 16); return [x >> 8, x & 255, y >> 8, y & 255]; }
  return null;
}
function privateV4([a, b]) {
  if (a === 127 || a === 0) return 'адрес этой машины';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'частная сеть';
  if (a === 169 && b === 254) return 'адрес локальной сети (169.254)';
  if (a === 100 && b >= 64 && b <= 127) return 'внутренняя сеть провайдера (100.64/10)';
  if (a >= 224) return 'служебный адрес';
  return null;
}
/** Адрес для облака: { url } или { why, code } — 2 отказ по правилу, 1 не адрес. Проверка по записи адреса, без DNS. */
function checkUrl(raw) {
  let u; try { u = new URL(unmangle(String(raw))); } catch { return { why: `«${raw}» — не адрес: нужен https://…`, code: 1 }; }
  if (u.protocol === 'file:') return { why: 'file:// — файл на этой машине: облако Firecrawl его не видит, а файлы клиента в облако не отправляем (свои страницы — discover.mjs, copy.mjs snapshot)', code: 2 };
  if (!/^https?:$/.test(u.protocol)) return { why: `${u.protocol} — Firecrawl читает только http:// и https://`, code: 1 };
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '::' || h === '0.0.0.0') return { why: `${u.host} — адрес этой машины: ${LOCAL_WHY}`, code: 2 };
  const v4 = v4of(h) || mappedV4(h);
  if (v4) { const p = privateV4(v4); if (p) return { why: `${u.host} — ${p}: ${LOCAL_WHY}`, code: 2 }; }
  if (/^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return { why: `${u.host} — частная сеть (IPv6): ${LOCAL_WHY}`, code: 2 };
  if (!h.includes('.') && !h.includes(':')) return { why: `${u.host} — имя без домена, это внутренняя сеть: ${LOCAL_WHY}`, code: 2 };
  if (INNER_TLD.test(h)) return { why: `${u.host} — имя внутренней сети: ${LOCAL_WHY}`, code: 2 };
  return { url: u };
}
/** То же для команд, которые сами называют адрес (map, scrape): x.com и документы — отказ. */
function targetUrl(raw) {
  const c = checkUrl(raw);
  if (!c.url) throw new Stop(c.why, c.code, { target: String(raw) });
  if (PRICEY.test(c.url.hostname)) throw new Stop('x.com и twitter.com у Firecrawl идут по отдельной цене (через Grok API) — не для этого скрипта', 2, { target: c.url.href });
  if (CMD === 'scrape' && DOC_EXT.test(c.url.pathname)) throw new Stop('PDF и документы: у Firecrawl кредит за каждую страницу файла — скачать и читать на этой машине (pdftotext, Read)', 2, { target: c.url.href });
  return c.url;
}

/* ---------- папка прогона ---------- */
const runsBase = () => process.env.SITE_REWORK_RUNS || path.join(os.homedir(), '.claude', 'site-rework', 'runs');
function runFolder(url) {
  const a = str(opt.run); const b = str(opt.out);
  if (a && b && a !== b) throw new Stop('--run и --out — одно и то же (папка прогона): задать одно', 1);
  const v = a || b;
  if (!v) {
    if (url) return runDir({}, url.href);
    throw new Stop('нужен --run <папка прогона> — туда лягут ответы, кэш и учёт кредитов (подробно: --help)', 1);
  }
  if (/^https?:\/\//i.test(v)) { try { return runDir({}, v); } catch { throw new Stop(`--run ${v}: не разобрать адрес`, 1); } }
  const p = unmangle(v);
  if (path.isAbsolute(p) || /[\\/]/.test(p) || p.startsWith('.')) return path.resolve(p);
  return path.join(runsBase(), capSlug(p));
}

/* ---------- кэш: по команде и телу запроса ---------- */
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const cacheFile = (fc, endpoint, body) => path.join(fc, 'cache', `${endpoint}-${crypto.createHash('sha1').update(`${endpoint}\n${JSON.stringify(canon(body))}`).digest('hex').slice(0, 20)}.json`);
function cacheRead(fc, endpoint, body) {
  if (opt.fresh) return null;
  const j = readJson(cacheFile(fc, endpoint, body), null);
  return j && j.response && typeof j.response === 'object' ? j : null;
}
function cacheWrite(fc, endpoint, body, response) {
  const f = cacheFile(fc, endpoint, body);
  ensureDir(path.dirname(f));
  fs.writeFileSync(f, JSON.stringify({ endpoint, request: body, at: new Date().toISOString(), response }, null, 1));
}

/* ---------- учёт кредитов папки прогона: budget.json под замком (параллельные запуски) ---------- */
const ledgerFile = (fc) => path.join(fc, 'budget.json');
function readLedger(fc) { const j = readJson(ledgerFile(fc), null); return { calls: j && Array.isArray(j.calls) ? j.calls : [] }; }
const spentOf = (calls) => calls.reduce((a, c) => a + (c.state === 'идёт' ? Number(c.estimate) || 0 : Number(c.credits) || 0), 0);
function writeLedger(fc, led, limit) {
  writeJson(ledgerFile(fc), { limit, spent: spentOf(led.calls), about: 'учёт кредитов Firecrawl этой папки прогона: запись на каждый вызов API (ответ из кэша — без записи); «идёт» — по оценке, пока нет ответа', calls: led.calls }, { generator: false });
}
function withLock(fc, fn) {
  ensureDir(fc);
  const lock = path.join(fc, 'budget.lock'); const t0 = Date.now();
  for (;;) {
    try { fs.closeSync(fs.openSync(lock, 'wx')); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = 0; try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { continue; }
      if (age > 30000) { try { fs.unlinkSync(lock); } catch { /* убрал другой запуск */ } continue; }
      if (Date.now() - t0 > 15000) throw new Stop(`учёт кредитов занят другим запуском дольше 15 с (${lock}); если других запусков нет — удалить этот файл`, 1);
      sleepSync(40);
    }
  }
  try { return fn(); } finally { try { fs.unlinkSync(lock); } catch { /* уже нет */ } }
}
function budgetStop(fc, spent, limit, est, what) {
  return new Stop(`бюджет прогона: потрачено ${spent} из ${limit} кредитов (${ledgerFile(fc)}), а ${what} — ещё до ${cr(est)}; не запускаю. Повтор того же — из кэша, бесплатно; меньше работы — меньше --limit; больше — осознанно: --budget ${spent + est} (тариф — 1000 в месяц, остаток — firecrawl.mjs status)`, 2);
}
/** Проверка без записи: хватит ли бюджета на est (facts — на поиск и все источники разом). */
function checkBudget(ctx, est, what) {
  const spent = spentOf(readLedger(ctx.fc).calls);
  if (spent + est > ctx.budget) throw budgetStop(ctx.fc, spent, ctx.budget, est, what);
}
function settle(ctx, id, credits, state, note) {
  withLock(ctx.fc, () => {
    const led = readLedger(ctx.fc); const c = led.calls.find((x) => x.id === id);
    if (c) Object.assign(c, { credits, state, note, done: new Date().toISOString() });
    writeLedger(ctx.fc, led, ctx.budget);
  });
}
const spentNow = (ctx) => spentOf(readLedger(ctx.fc).calls);

/* ---------- API ---------- */
const apiBase = () => String(process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev').trim().replace(/\/+$/, '').replace(/\/v[12]$/i, '');
const apiTimeout = () => { const n = Number(process.env.FIRECRAWL_TIMEOUT_MS); return Number.isFinite(n) && n >= 100 ? n : 120000; };
const hide = (s) => (KEY && KEY.length >= 6 ? String(s).split(KEY).join('***') : String(s));
function apiText(status, json, text) {
  const raw = hide(clip(String((json && (json.error || json.message)) || text || '').replace(/<[^>]+>/g, ' '), 200));
  const tail = raw ? ` (ответ: ${raw})` : '';
  if (status === 401) return `ключ FIRECRAWL_API_KEY не принят — неверный или отозван: новый ключ — firecrawl.dev/app → API Keys, строка FIRECRAWL_API_KEY=… в ${ENV_FILE}`;
  if (status === 402) return `на тарифе Firecrawl не хватает кредитов (бесплатно — 1000 в месяц): остаток — firecrawl.mjs status; ждать нового месяца или собрать данные без Firecrawl (браузер, WebFetch)${tail}`;
  if (status === 429) return `предел запросов Firecrawl (бесплатный тариф: 10 в минуту на map, scrape и search, 2 задачи одновременно) — подождать минуту и повторить; уже полученное лежит в кэше${tail}`;
  if (status === 408) return `Firecrawl не дождался страницы (408): сайт отвечает медленно — повторить позже${tail}`;
  if (status === 403) return `Firecrawl отказал (403): сайт он не читает или доступ закрыт${tail}`;
  if (status === 400 || status === 422) return `Firecrawl не принял запрос (${status})${tail}`;
  if (status >= 500) return `сбой на стороне Firecrawl (HTTP ${status}) — повторить позже${tail}`;
  if (status >= 200 && status < 300) return `Firecrawl ответил без результата${tail}`;
  return `Firecrawl: HTTP ${status}${tail}`;
}
function retryAfterSec(res, json) {
  const h = res.headers.get('retry-after');
  if (h !== null && h !== '') { const n = Number(h); if (Number.isFinite(n)) return Math.max(0, n); const d = Date.parse(h); if (!Number.isNaN(d)) return Math.max(0, Math.ceil((d - Date.now()) / 1000)); }
  const m = /retry after (\d+)\s*s/i.exec(String((json && json.error) || ''));
  return m ? Number(m[1]) : 15;
}
const seconds = (ms) => (ms < 10000 ? String(Math.round(ms / 100) / 10).replace('.', ',') : String(Math.round(ms / 1000)));
const timeoutStop = () => new Stop(`Firecrawl не ответил за ${seconds(apiTimeout())} с — повторить позже; если работа всё же сделана, кредит мог списаться (остаток — firecrawl.mjs status)`, 1, { charged: true });
async function api(endpoint, body, method = 'POST') {
  const url = `${apiBase()}/v2/${endpoint}`;
  for (let attempt = 1; ; attempt++) {
    let res; let text = '';
    try {
      res = await fetch(url, method === 'GET'
        ? { method, headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' }, signal: AbortSignal.timeout(apiTimeout()) }
        : { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(apiTimeout()) });
      text = await res.text();
    } catch (e) {
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw timeoutStop();
      const why = (e && e.cause && (e.cause.code || e.cause.message)) || (e && (e.code || e.message)) || 'сбой';
      throw new Stop(`нет связи с Firecrawl (${hide(clip(String(why), 80))}) — сеть или VPN; повторить позже`, 1);
    }
    let json = null; try { json = JSON.parse(text); } catch { /* не JSON */ }
    if (res.status === 429 && attempt === 1) {
      const wait = retryAfterSec(res, json);
      if (wait <= 30) { await sleep(wait * 1000); continue; }
    }
    if (!res.ok || !json || json.success === false) throw new Stop(apiText(res.status, json, text), 1, { status: res.status });
    return json;
  }
}
/**
 * Вызов с кэшем и бюджетом: кэш → ключ → оценка и запись «идёт» в budget.json → запрос → списанное.
 * body — ключ кэша; send — что отправить (у --fresh scrape — ещё maxAge: 0).
 * → { json, cached, at, credits }
 */
async function call(ctx, endpoint, body, { est, what, send = body }) {
  const hit = cacheRead(ctx.fc, endpoint, body);
  if (hit) return { json: hit.response, cached: true, at: hit.at, credits: 0 };
  if (!KEY) throw new Stop('INFO пропуск: нет FIRECRAWL_API_KEY', 0, { info: true });
  const id = withLock(ctx.fc, () => {
    const led = readLedger(ctx.fc); const spent = spentOf(led.calls);
    if (spent + est > ctx.budget) throw budgetStop(ctx.fc, spent, ctx.budget, est, what);
    const nid = crypto.randomBytes(4).toString('hex');
    led.calls.push({ id: nid, at: new Date().toISOString(), command: CMD, endpoint, what, estimate: est, credits: null, state: 'идёт' });
    writeLedger(ctx.fc, led, ctx.budget);
    return nid;
  });
  let json;
  try { json = await api(endpoint, send); } catch (e) {
    const charged = !!(e && e.charged);
    settle(ctx, id, charged ? est : 0, 'ошибка', charged ? 'ответа нет — по цене: работа могла быть сделана' : 'документа нет — 0');
    throw e;
  }
  const meta = json.data && !Array.isArray(json.data) ? json.data.metadata : null;
  const used = Number(json.creditsUsed ?? (meta ? meta.creditsUsed : undefined));
  const known = Number.isFinite(used) && used >= 0;
  settle(ctx, id, known ? used : est, 'готово', known ? 'по ответу Firecrawl' : 'по цене из документации');
  cacheWrite(ctx.fc, endpoint, body, json);
  return { json, cached: false, at: new Date().toISOString(), credits: known ? used : est };
}
const spendNote = (r) => (r.cached ? `из кэша (${timeOf(r.at)}), 0 кредитов` : cr(r.credits));

/* ---------- ответы: v2 и прежний вид ---------- */
function linksOf(json) {
  const raw = Array.isArray(json.links) ? json.links : Array.isArray(json.data) ? json.data : json.data && Array.isArray(json.data.links) ? json.data.links : [];
  return raw.map((l) => (typeof l === 'string' ? { url: l, title: null } : l && typeof l === 'object' ? { url: String(l.url || ''), title: l.title ? collapse(l.title) : null } : null)).filter((l) => l && l.url);
}
function resultsOf(json) {
  const d = json.data;
  const raw = Array.isArray(d) ? d : d && Array.isArray(d.web) ? d.web : [];
  return raw.map((r) => ({
    url: String(r.url || (r.metadata && (r.metadata.url || r.metadata.sourceURL)) || ''),
    title: collapse(r.title || (r.metadata && r.metadata.title) || ''),
    excerpt: collapse(String(r.description || r.snippet || '').replace(/```[\s\S]*?```/g, ' ').replace(/^#{1,6}\s*/gm, '')),
  })).filter((r) => r.url);
}

/* ---------- типы страниц по шаблону адреса — те же правила, что в discover.mjs ---------- */
const LANG_SEG = /^[a-z]{2}(-[a-z]{2})?$/i;
const FILE_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|7z|gz|mp4|webm|mov|mp3|wav|ogg|docx?|xlsx?|pptx?|txt|xml|json|csv|rss|atom)$/i;
/* догадка по имени — для чтения таблицы, не вывод; порядок важен: первое совпадение */
const PAGE_HINTS = [
  [/^\/$/, 'главная'],
  [/log-?in|sign-?in|sign-?up|register|account|cabinet|profile|auth|password|(^|\/)lk(\/|$)|вход|регистрац|кабинет|профиль/i, 'вход и кабинет'],
  [/licen[cs]|privacy|terms|polic|cookie|legal|gdpr|agreement|oferta|consent|оферт|политик|соглашени|конфиденц|согласи|правила/i, 'юридическая'],
  [/cart|checkout|basket|korzin|корзин|оформлен/i, 'корзина и оформление'],
  [/menu|меню|bar-?card|wine-?(list|card)|напитк|блюд/i, 'меню'],
  [/pric|plans?(\/|$)|tariff|subscri|membership|ceny|tseny|prajs|тариф|цены|прайс|стоимост|подписк/i, 'тарифы и цены'],
  [/deliver|shipping|payment|dostavk|oplat|доставк|оплат/i, 'доставка и оплата'],
  [/booking|reserv|appointment|zapis|bron|запис|брон/i, 'запись и бронь'],
  [/contact|support|help|feedback|kontakt|контакт|поддержк|помощ/i, 'контакты и помощь'],
  [/review|testimonial|otzyv|отзыв/i, 'отзывы'],
  [/faq|questions|vopros|вопрос/i, 'вопросы'],
  [/about|team|story|company|o-nas|o-kompanii|masters?(\/|$)|о-нас|о-компании|команда|история|мастера/i, 'о нас'],
  [/blog|news|articles?|journal|posts?|stati|novost|статьи|новост|блог|журнал/i, 'блог и новости'],
  [/events?(\/|$)|afisha|concert|meropriyat|афиша|событи|мероприят/i, 'афиша и события'],
  [/promo|sale|akci|skidk|акци|скидк/i, 'акции'],
  [/vacanc|jobs?(\/|$)|career|vakans|ваканс|карьер/i, 'вакансии'],
  [/gallery|photos?(\/|$)|foto|галере|фото/i, 'галерея'],
  [/catalog|shop|store|products?|collections?|categor|goods|tovar|katalog|каталог|товар|магазин|коллекци|категори/i, 'каталог и товары'],
  [/portfolio|works?(\/|$)|projects?|cases?|raboty|портфолио|работы|проекты|кейсы/i, 'работы и кейсы'],
  [/services?|uslug|услуг/i, 'услуги'],
];
const hintOf = (key) => (PAGE_HINTS.find(([re]) => re.test(key)) || [])[1] || null;
function normPath(p) { let x = String(p || '/').replace(/\/index\.html?$/i, '/'); if (x.length > 1) x = x.replace(/\/+$/, ''); return x || '/'; }
/* шаблон адреса: /product/efiopiya → /product/*; /en/blog/x → /en/blog/*; /about → /about */
function typeKey(p) {
  const segs = p.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  if (!segs.length) return '/';
  const lead = LANG_SEG.test(segs[0]) && segs.length > 1 ? 2 : 1;
  const head = segs.slice(0, lead).join('/');
  return segs.length > lead ? `/${head}/${segs.slice(lead).map(() => '*').join('/')}` : `/${head}`;
}
/* имя типа для motion.mjs --pages «тип=путь»: /product/* → product-item, / → home */
function typeName(key, used) {
  const base = String(key).split('/').filter(Boolean).map((s) => (s === '*' ? 'item' : s)).join('-')
    .replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'home';
  let n = base; for (let k = 2; used.has(n); k++) n = `${base}-${k}`;
  used.add(n); return n;
}
function groupPages(links, base) {
  const baseHost = base.hostname.replace(/^www\./i, '').toLowerCase();
  const types = new Map(); const files = []; const other = new Map(); const subs = new Map(); const seenPath = new Set();
  for (const l of links) {
    let u; try { u = new URL(l.url); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const sub = host !== baseHost && host.endsWith(`.${baseHost}`);
    if (host !== baseHost && !sub) { other.set(host, (other.get(host) || 0) + 1); continue; }
    const p = normPath(u.pathname);
    if (FILE_EXT.test(p)) { if (!files.includes(u.href)) files.push(u.href); continue; }
    if (seenPath.has(host + p + u.search)) continue; seenPath.add(host + p + u.search);
    const tk = typeKey(p); const key = (sub ? host : '') + tk;
    if (sub) subs.set(host, (subs.get(host) || 0) + 1);
    let t = types.get(key);
    if (!t) types.set(key, t = { key, hint: hintOf(tk), subdomain: sub ? host : null, urls: [] });
    t.urls.push({ url: u.href, shown: readable(u.href), path: readable(u.pathname) + u.search, title: l.title || null });
  }
  const list = [...types.values()].map((t) => ({ ...t, count: t.urls.length, template: t.key.includes('*'), example: t.urls[0].url, exampleShown: t.urls[0].shown, examplePath: t.urls[0].path }));
  list.sort((a, b) => (a.key === '/' ? -1 : b.key === '/' ? 1 : 0) || (!!a.subdomain - !!b.subdomain) || (b.count - a.count) || (b.template - a.template) || a.key.localeCompare(b.key));
  const used = new Set(); const own = list.filter((t) => !t.subdomain && !/[,=]/.test(t.examplePath));
  const motion = own.map((t) => `${typeName(t.key, used)}=${t.examplePath}`);
  return {
    types: list, pageCount: list.reduce((a, t) => a + t.count, 0), files, other: [...other].map(([host, n]) => ({ host, n })), subdomains: [...subs].map(([host, n]) => ({ host, n })),
    pages: { motion: motion.join(','), paths: own.map((t) => t.examplePath).join(','), count: own.length },
  };
}

/* ---------- стиль из branding ---------- */
function brandSummary(b) {
  if (!b || typeof b !== 'object') return null;
  const names = { primary: 'основной', secondary: 'второй', accent: 'акцент', background: 'фон', textPrimary: 'текст', link: 'ссылки' };
  const c = b.colors || {};
  const colors = Object.entries(names).filter(([k]) => typeof c[k] === 'string' && c[k]).map(([k, n]) => `${n} ${c[k]}`);
  const fam = (f) => (typeof f === 'string' ? f : f && f.family);
  const fonts = [...new Set([...(Array.isArray(b.fonts) ? b.fonts.map(fam) : []), ...Object.values((b.typography && b.typography.fontFamilies) || {})].filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))];
  const logo = b.logo || (b.images && b.images.logo) || null;
  const theme = b.colorScheme === 'dark' ? 'тёмная тема' : b.colorScheme === 'light' ? 'светлая тема' : null;
  return { theme, colors, fonts, logo, line: [theme, colors.length ? `цвета: ${colors.join(', ')}` : null, fonts.length ? `шрифты: ${fonts.join(', ')}` : null, logo ? `логотип: ${logo}` : null].filter(Boolean).join(' · ') };
}

/* ---------- факты из текста страницы ---------- */
/* markdown → строки простого текста: без картинок, адресов ссылок, разметки; строки таблиц — ячейки через « · » */
function mdLines(md) {
  const t = String(md || '').slice(0, 300000)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ');
  const out = [];
  for (let line of t.split(/\r?\n/)) {
    if (/^\s*\|?\s*:?-{2,}/.test(line)) continue;
    if (line.includes('|')) line = line.split('|').map((x) => x.trim()).filter(Boolean).join(' · ');
    line = collapse(line.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/, '').replace(/(\*\*|__|\*|_|`)/g, ''));
    if (line) out.push(line);
  }
  return out;
}
/** Заявления на странице (claimsOf из copy-rules — то, что сверяет copy.mjs): [{ kind, fact, context }] */
function factsOf(md) {
  const out = []; const seen = new Set(); let prev = '';
  for (const line of mdLines(md)) {
    const parts = line.length > 240 ? sentencesAt(line).map((x) => x.s) : [line];
    for (const s of parts) {
      for (const c of claimsOf(s)) {
        /* строка из одного числа («1 500 ₽» под названием в карточке) — с предыдущей строкой */
        const rest = s.replace(c.text, ' ');
        const ctx = (rest.match(/\p{L}{3,}/gu) || []).length ? s : prev ? `${prev} · ${s}` : s;
        const k = `${c.norm}|${ctx.toLowerCase().slice(0, 80)}`;
        if (seen.has(k)) continue; seen.add(k);
        out.push({ kind: c.kind, fact: c.text, context: clip(ctx, 200) });
        if (out.length >= MAX_PER_SOURCE) return out;
      }
    }
    prev = clip(line, 120);
  }
  return out;
}
/* текст слипся: больше трети латинских и русских букв — в «словах» от 25 букв (пробелов нет; так 30.09 вышло
   у example.com — страница перестраивает текст скриптом). Иероглифы без пробелов в счёт не идут */
function glued(md) {
  let all = 0; let long = 0;
  for (const t of String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/!?\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g, ' ').split(/\s+/)) {
    const n = (t.match(/[A-Za-zА-Яа-яЁё]/g) || []).length; all += n; if (n >= 25) long += n;
  }
  return all >= 200 && long / all > 0.3;
}
const GLUED = 'текст слипся — пробелов между словами нет (страница перестраивает текст скриптом, Firecrawl это не разобрал)';
/** Почему результат поиска не читать (facts) или null. */
function skipWhy(url, planned) {
  const c = checkUrl(url);
  if (!c.url) return c.code === 2 ? 'адрес частной сети или этой машины' : 'не адрес';
  const h = c.url.hostname.toLowerCase();
  if (PRICEY.test(h)) return 'у Firecrawl отдельная цена (через Grok API)';
  if (SOCIAL.test(h)) return 'видео или соцсеть — текста мало, Firecrawl их часто не читает';
  if (DOC_EXT.test(c.url.pathname)) return 'документ — у Firecrawl кредит за каждую страницу PDF';
  if (planned.has(hostOf(url))) return 'второй адрес того же сайта';
  return null;
}

/* ---------- общее для команд ---------- */
function searchBody(query, limit) {
  const lang = str(opt.lang) || 'ru'; const country = str(opt.country) || 'RU'; const location = str(opt.location);
  if (!/^[a-z]{2}(-[a-z]{2})?$/i.test(lang)) throw new Stop(`--lang ${lang}: нужен код языка (ru, en)`, 1);
  if (!/^[a-z]{2}$/i.test(country)) throw new Stop(`--country ${country}: нужен код страны ISO из двух букв (RU)`, 1);
  return { query, limit, sources: ['web'], lang: lang.toLowerCase(), country: country.toUpperCase(), ...(location ? { location } : {}) };
}
const budgetLine = (ctx) => `прогон: ${spentNow(ctx)} из ${ctx.budget}`;
function ctxFor(run) { return { run, fc: path.join(run, 'firecrawl'), budget: intOpt('budget', DEFAULT_BUDGET, 1, 1000) }; }

/* ---------- map ---------- */
async function cmdMap() {
  if (pos.length !== 1) throw new Stop('нужен один адрес — node firecrawl.mjs map <url> [--run <папка>] [--limit 200]', 1);
  const u = targetUrl(pos[0]);
  const ctx = ctxFor(runFolder(u));
  const limit = intOpt('limit', 200, 1, 5000);
  const search = str(opt.search);
  const body = { url: u.href, limit, ...(search ? { search } : {}) };
  const r = await call(ctx, 'map', body, { est: 1, what: `map ${u.href}` });
  const links = linksOf(r.json);
  const g = groupPages(links, u);
  const name = `map-${slugFromUrl(u.href)}${search ? `-${textSlug(search)}` : ''}`;
  const jsonFile = path.join(ctx.fc, `${name}.json`); const mdFile = path.join(ctx.fc, `${name}.md`);
  const limitHit = links.length >= limit;
  const counts = `${links.length} ${plural(links.length, 'адрес', 'адреса', 'адресов')}: ${g.pageCount} ${plural(g.pageCount, 'страница', 'страницы', 'страниц')} в ${g.types.length} ${plural(g.types.length, 'типе', 'типах', 'типах')}${g.files.length ? `, ${g.files.length} ${plural(g.files.length, 'файл', 'файла', 'файлов')}` : ''}`;
  const data = { tool: 'firecrawl.mjs', command: 'map', url: u.href, search: search || null, limit, date: r.at, fromCache: r.cached, credits: r.credits, total: links.length, pages: g.pageCount, limitHit,
    types: g.types.map((t) => ({ key: t.key, hint: t.hint, count: t.count, subdomain: t.subdomain, example: t.example, urls: t.urls.map((x) => ({ url: x.url, title: x.title })) })),
    files: g.files, subdomains: g.subdomains, otherSites: g.other, pagesArg: g.pages, md: mdFile };
  writeJson(jsonFile, data);
  const L = [`# Карта сайта: ${u.href}`, '',
    `Firecrawl map · ${timeOf(r.at)}${search ? ` · по слову «${search}»` : ''} · ${counts}${limitHit ? ` — упёрлись в --limit ${limit}, карта неполная` : ` (предел --limit ${limit})`} · ${spendNote(r)}`, '',
    'Откуда адреса: карта сайта (sitemap.xml), выдача поиска и страницы, которые Firecrawl уже видел, — без захода на страницы. Тип — по шаблону адреса, как в discover.mjs («/product/*» — много однотипных страниц), догадка — по имени адреса. Что на странице, видно только в браузере.', '',
    '## Типы страниц', '', '| тип (шаблон адреса) | догадка | адресов | образец |', '|---|---|---|---|',
    ...g.types.map((t) => `| \`${t.key}\` | ${t.hint || '—'} | ${t.count} | ${mdCell(t.exampleShown)} |`), ''];
  if (g.pages.count) L.push('Пройти каждый тип хотя бы одной страницей (разведка донора — все типы):', '', `- motion.mjs: \`--pages "${g.pages.motion}"\``, `- copy.mjs и shots.mjs: \`--pages "${g.pages.paths}"\``, '');
  if (g.subdomains.length) L.push(`Поддомены: ${g.subdomains.map((x) => `${x.host} (${x.n})`).join(', ')} — их страницы в таблице с именем хоста.`, '');
  if (g.files.length) L.push(`Файлы, не страницы (${g.files.length}): ${g.files.slice(0, 10).join(', ')}${g.files.length > 10 ? ' …' : ''}`, '');
  if (g.other.length) L.push(`Чужие сайты в ответе: ${g.other.map((x) => `${x.host} (${x.n})`).join(', ')}`, '');
  L.push('## Все адреса по типам', '');
  for (const t of g.types) {
    L.push(`### \`${t.key}\`${t.hint ? ` — ${t.hint}` : ''} (${t.count})`, '');
    for (const x of t.urls) L.push(`- ${x.shown}${x.title ? ` — ${x.title}` : ''}`);
    L.push('');
  }
  fs.writeFileSync(mdFile, L.join('\n'));
  const verdict = limitHit || !links.length ? 'WARN' : 'OK';
  console.log(`${verdict} map ${u.href}: ${counts} · ${spendNote(r)} (${budgetLine(ctx)})`);
  if (!links.length) console.log('   адресов нет: сайт закрыт для Firecrawl или адрес не тот — открыть в браузере; карта по ссылкам страницы — discover.mjs');
  if (limitHit) console.log(`   адресов ровно --limit ${limit} — карта неполная: --limit ${Math.min(5000, limit * 5)} стоит так же (1 кредит)`);
  if (g.types.length) console.log(`   ${g.types.slice(0, 10).map((t) => `${t.key}${t.hint ? ` ${t.hint}` : ''} ${t.count}`).join(' · ')}${g.types.length > 10 ? ` · ещё ${g.types.length - 10} — в .md` : ''}`);
  if (g.pages.count) console.log(`   по странице каждого типа для motion.mjs: --pages "${g.pages.count > 12 ? `${g.pages.motion.split(',').slice(0, 12).join(',')}" (первые 12 из ${g.pages.count}, все — в .md)` : `${g.pages.motion}"`}`);
  console.log(`   → ${mdFile} (и .json)`);
}

/* ---------- scrape ---------- */
async function cmdScrape() {
  if (pos.length !== 1) throw new Stop('нужен один адрес — node firecrawl.mjs scrape <url> [--run <папка>] [--formats markdown,branding]', 1);
  const u = targetUrl(pos[0]);
  const formats = opt.formats === undefined ? [...FORMATS] : [...new Set(String(opt.formats).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const bad = formats.filter((f) => !FORMATS.includes(f));
  if (bad.length || !formats.length) throw new Stop(`--formats ${opt.formats}: беру markdown (текст страницы) и branding (цвета, шрифты, логотип); json и вопросы к странице у Firecrawl — +4 кредита за страницу, снимки — shots.mjs, разметка — mirror.mjs`, 1);
  const ctx = ctxFor(runFolder(u));
  /* parsers: [] — PDF без расширения в адресе не разбирается постранично (кредит за каждую страницу файла) */
  const body = { url: u.href, formats, onlyMainContent: true, parsers: [] };
  const r = await call(ctx, 'scrape', body, { est: 1, what: `scrape ${u.href}`, send: opt.fresh ? { ...body, maxAge: 0 } : body });
  const d = (r.json && r.json.data) || {}; const meta = d.metadata || {};
  const title = collapse(Array.isArray(meta.title) ? meta.title[0] : meta.title || '');
  const lang = Array.isArray(meta.language) ? meta.language[0] : meta.language || null;
  const md = typeof d.markdown === 'string' ? d.markdown : null;
  const nWords = md ? words(md).length : 0;
  const brand = formats.includes('branding') ? brandSummary(d.branding) : null;
  const name = `scrape-${slugFromUrl(u.href)}`;
  const jsonFile = path.join(ctx.fc, `${name}.json`); const mdFile = path.join(ctx.fc, `${name}.md`);
  if (formats.includes('markdown') && md !== null) {
    ensureDir(ctx.fc);
    fs.writeFileSync(mdFile, [`> Firecrawl scrape · ${u.href} · прочитано ${dayOf(r.at)}${title ? ` · «${title}»` : ''}${lang ? ` · язык ${lang}` : ''}`,
      '> Основное содержимое страницы, без шапки и подвала, — для разбора тона и фактуры текста. Не замер: шрифты, отступы и движение — свои скрипты.', '', md].join('\n'));
  }
  writeJson(jsonFile, { tool: 'firecrawl.mjs', command: 'scrape', url: u.href, finalUrl: meta.url || null, formats, date: r.at, fromCache: r.cached, credits: r.credits,
    title: title || null, description: meta.description || null, language: lang, statusCode: meta.statusCode ?? null, words: nWords, branding: d.branding || null, brandingSummary: brand, md: md !== null && formats.includes('markdown') ? mdFile : null });
  const warns = [];
  if (Number(meta.statusCode) >= 400) warns.push(`страница ответила ${meta.statusCode} — кредит Firecrawl всё равно списал (документ вернулся); адрес проверить в браузере`);
  if (formats.includes('markdown') && md && glued(md)) warns.push(`${GLUED}: для разбора тона не годится — точный текст снимает copy.mjs snapshot`);
  else if (formats.includes('markdown') && nWords < 20) warns.push('текста почти нет: страница рисуется скриптом или закрыта — смотреть в браузере (discover.mjs, copy.mjs snapshot)');
  if (formats.includes('branding') && !(brand && brand.line)) warns.push('стиль не определился — смотреть сайт глазами (discover.mjs, design-reference)');
  console.log(`${warns.length ? 'WARN' : 'OK'} scrape ${u.href}: ${title ? `«${title}»` : 'без заголовка'}${formats.includes('markdown') ? ` · ${nWords} ${plural(nWords, 'слово', 'слова', 'слов')}` : ''}${lang ? ` · язык ${lang}` : ''} · ${spendNote(r)} (${budgetLine(ctx)})`);
  for (const w of warns) console.log(`   ${w}`);
  if (brand && brand.line) {
    console.log(`   стиль: ${brand.line}`);
    console.log('   стиль — подсказка для отбора доноров, не замер: числа донора — extract.mjs (design-reference), кириллица шрифтов — cyrillic-check.mjs');
  }
  console.log(`   → ${formats.includes('markdown') && md !== null ? `${mdFile}, ` : ''}${jsonFile}`);
}

/* ---------- search ---------- */
async function cmdSearch() {
  const query = collapse(pos.join(' '));
  if (!query) throw new Stop('нужен запрос — node firecrawl.mjs search "<запрос>" --run <папка>', 1);
  if (query.length > 500) throw new Stop('запрос длиннее 500 знаков — Firecrawl такой не примет', 1);
  const ctx = ctxFor(runFolder(null));
  const limit = intOpt('limit', 5, 1, 20);
  const body = searchBody(query, limit);
  const r = await call(ctx, 'search', body, { est: 2 * Math.ceil(limit / 10), what: `search «${query}»` });
  const res = resultsOf(r.json);
  const name = `search-${textSlug(query)}`;
  const jsonFile = path.join(ctx.fc, `${name}.json`); const mdFile = path.join(ctx.fc, `${name}.md`);
  writeJson(jsonFile, { tool: 'firecrawl.mjs', command: 'search', query, lang: body.lang, country: body.country, location: body.location || null, limit, date: r.at, fromCache: r.cached, credits: r.credits, results: res, md: mdFile });
  const L = [`# Поиск Firecrawl: «${query}»`, '', `${timeOf(r.at)} · язык ${body.lang}, страна ${body.country}${body.location ? `, место ${body.location}` : ''} · найдено ${res.length} · ${spendNote(r)}`, '',
    'Выдержки — то, что поиск счёл близким к запросу; целиком страницу читает scrape, факты с источниками собирает facts.', ''];
  res.forEach((x, i) => { L.push(`${i + 1}. **${x.title || x.url}** — ${x.url}`); if (x.excerpt) L.push(`   > ${clip(x.excerpt, 400)}`); L.push(''); });
  fs.writeFileSync(mdFile, L.join('\n'));
  console.log(`${res.length ? 'OK' : 'WARN'} search «${query}»: ${res.length} ${plural(res.length, 'страница', 'страницы', 'страниц')} · ${spendNote(r)} (${budgetLine(ctx)})`);
  if (!res.length) console.log('   ничего не нашлось — переформулировать: дело и город словами, без кавычек и знаков');
  res.forEach((x, i) => { console.log(`   ${i + 1}. ${x.title || '(без заголовка)'} — ${x.url}`); if (x.excerpt) console.log(`      ${clip(x.excerpt, 160)}`); });
  console.log(`   → ${mdFile} (и .json)`);
}

/* ---------- facts ---------- */
async function cmdFacts() {
  if (pos.length) throw new Stop(`лишнее «${pos.join(' ')}» — о чём искать, задаётся --about "<дело, город>"`, 1);
  const about = collapse(str(opt.about));
  if (!about) throw new Stop('нужен --about "<дело, город>" — например --about "барбершоп, Ярославль"', 1);
  if (about.length > 500) throw new Stop('--about длиннее 500 знаков', 1);
  const ctx = ctxFor(runFolder(null));
  const want = intOpt('limit', 5, 1, 10);
  const sBody = { ...searchBody(about, FACTS_POOL), ignoreInvalidURLs: true };
  const sEst = 2 * Math.ceil(FACTS_POOL / 10);
  const sHit = cacheRead(ctx.fc, 'search', sBody);
  if (!KEY && !sHit) throw new Stop('INFO пропуск: нет FIRECRAWL_API_KEY', 0, { info: true });
  /* весь вызов разом: поиск и все источники (прочитанные раньше — из кэша, бесплатно) */
  checkBudget(ctx, (sHit ? 0 : sEst) + want, `facts «${about}» (поиск ${sHit ? 'из кэша' : `${sEst}`} + чтение до ${want} ${plural(want, 'источника', 'источников', 'источников')} по 1)`);
  const s = await call(ctx, 'search', sBody, { est: sEst, what: `search «${about}»` });
  const found = resultsOf(s.json);
  const planned = new Set(); const plan = []; const sources = [];
  for (const x of found) {
    const why = skipWhy(x.url, planned);
    if (why) sources.push({ url: x.url, title: x.title, state: 'пропущен', why });
    else { planned.add(hostOf(x.url)); plan.push(x); }
  }
  const read = []; let credits = s.credits; let stopped = null; let next = 0;
  const readOne = async (x) => {
    const body = { url: x.url, formats: ['markdown'], onlyMainContent: true, parsers: [] };
    try {
      const r = await call(ctx, 'scrape', body, { est: 1, what: `scrape ${x.url}`, send: opt.fresh ? { ...body, maxAge: 0 } : body });
      credits += r.credits;
      const d = (r.json && r.json.data) || {}; const meta = d.metadata || {};
      const title = collapse(Array.isArray(meta.title) ? meta.title[0] : meta.title || x.title || '');
      if (Number(meta.statusCode) >= 400) return { ...x, title, state: 'не прочитан', why: `страница ответила ${meta.statusCode}`, credits: r.credits, fromCache: r.cached };
      const md = typeof d.markdown === 'string' ? d.markdown : '';
      /* слипшийся текст: числа рядом с буквами правила не видят — источник не в счёт, берётся следующий */
      if (glued(md)) return { ...x, title, state: 'не прочитан', why: GLUED, credits: r.credits, fromCache: r.cached };
      if (words(md).length < 20) return { ...x, title, state: 'не прочитан', why: 'текста почти нет', credits: r.credits, fromCache: r.cached };
      return { ...x, title, state: 'прочитан', date: dayOf(r.at), found: factsOf(md), credits: r.credits, fromCache: r.cached };
    } catch (e) {
      if (!(e instanceof Stop) || e.info || e.status === 401 || e.status === 402) throw e;
      if (e.code === 2 || e.status === 429) { stopped = stopped || e.message; return { ...x, state: 'не прочитан', why: e.code === 2 ? 'бюджет прогона кончился' : 'предел запросов' }; }
      if (e.charged) credits += 1;
      return { ...x, state: 'не прочитан', why: e.message };
    }
  };
  /* по два разом (бесплатный тариф — 2 задачи одновременно); не прочитался — следующий из выдачи */
  while (!stopped && next < plan.length) {
    const ok = read.filter((x) => x.state === 'прочитан').length;
    if (ok >= want) break;
    const batch = plan.slice(next, next + Math.min(2, want - ok)); next += batch.length;
    read.push(...await Promise.all(batch.map(readOne)));
  }
  for (const x of plan.slice(next)) sources.push({ url: x.url, title: x.title, state: 'не нужен', why: 'хватило прочитанных' });
  const done = read.filter((x) => x.state === 'прочитан');
  const records = [];
  for (const x of done) for (const f of x.found) records.push({ fact: f.fact, what: `${KIND_RU[f.kind] || f.kind}: «${f.context}»`, source: `${x.url} (${x.date})`, kind: f.kind, title: x.title || null, about });
  /* кандидаты: записи прежнего запуска с тем же --about заменяются, с другим — остаются */
  const candFile = path.join(ctx.run, 'copy', 'facts-candidates.json');
  let replaced = 0; let total = 0; let fileNote = null;
  if (records.length) {
    let prev = [];
    if (fs.existsSync(candFile)) {
      const j = readJson(candFile, null);
      if (Array.isArray(j)) prev = j;
      else { const bak = `${candFile}.bak`; fs.copyFileSync(candFile, bak); fileNote = `прежний файл не читался как список — сохранён в ${bak}`; }
    }
    const same = (x) => x && String(x.about || '').trim().toLowerCase() === about.toLowerCase();
    const kept = prev.filter((x) => !same(x)); replaced = prev.length - kept.length;
    ensureDir(path.dirname(candFile));
    fs.writeFileSync(candFile, JSON.stringify([...kept, ...records], null, 1));
    total = kept.length + records.length;
  }
  const byKind = {}; for (const r of records) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  const kinds = Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${KIND_RU[k] || k} ${n}`).join(', ');
  const name = `facts-${textSlug(about)}`;
  const mdFile = path.join(ctx.fc, `${name}.md`); const jsonFile = path.join(ctx.fc, `${name}.json`);
  const all = [...read.map((x) => ({ url: x.url, title: x.title || null, state: x.state, why: x.why || null, date: x.date || null, candidates: x.found ? x.found.length : 0, credits: x.credits ?? 0, fromCache: !!x.fromCache })), ...sources];
  writeJson(jsonFile, { tool: 'firecrawl.mjs', command: 'facts', about, query: sBody.query, lang: sBody.lang, country: sBody.country, location: sBody.location || null, limit: want, date: new Date().toISOString(),
    credits, search: { fromCache: s.cached, credits: s.credits, found: found.length }, sources: all, candidates: { total: records.length, byKind, file: records.length ? candFile : null, replaced, inFile: total }, stopped, md: mdFile });
  const L = [`# Кандидаты фактов: «${about}»`, '', `Firecrawl · ${timeOf(new Date().toISOString())} · прочитано ${done.length} из ${found.length} найденных · кандидатов ${records.length}${kinds ? ` (${kinds})` : ''} · ${cr(credits)} за этот запуск`, '',
    '**Это кандидаты, не факты.** В `copy/facts.json` — только после проверки глазами: открыть источник, убедиться, что факт про это дело и этот город и ещё верен. Цена или часы конкретного заведения — ориентир для правдоподобного примера, а не цена клиента: пример на сайте с такой ценой — в список для владельца (`copy/invented.json`).', ''];
  done.forEach((x, i) => {
    L.push(`## ${i + 1}. ${x.title || x.url}`, '', `${x.url} · прочитано ${x.date}${x.fromCache ? ' (из кэша)' : ''}`, '');
    if (!x.found.length) { L.push('Цен, сроков и условий не нашлось.', ''); return; }
    L.push('| факт | вид | где сказано |', '|---|---|---|', ...x.found.map((f) => `| ${mdCell(f.fact)} | ${KIND_RU[f.kind] || f.kind} | ${mdCell(f.context)} |`), '');
  });
  const notRead = all.filter((x) => x.state !== 'прочитан');
  if (notRead.length) L.push('## Не прочитано', '', ...notRead.map((x) => `- ${x.url} — ${x.state}: ${x.why}`), '');
  ensureDir(ctx.fc); fs.writeFileSync(mdFile, L.join('\n'));
  const warns = [];
  if (!found.length) warns.push('поиск ничего не нашёл — переформулировать --about: дело и город словами');
  else if (!done.length) warns.push('ни один источник не прочитан — причины ниже; кандидатов нет, файл не тронут');
  else if (done.length < want) warns.push(`прочитано ${done.length} из ${want}: ${stopped ? `остановлено — ${stopped}` : 'подходящих источников в выдаче больше нет'}`);
  if (done.length && !records.length) warns.push('в прочитанном нет цен, сроков и условий — искать точнее (--about "<дело> <город> цены") или придумать и записать в copy/invented.json');
  console.log(`${warns.length ? 'WARN' : 'OK'} facts «${about}»: прочитано ${done.length} ${plural(done.length, 'источник', 'источника', 'источников')} из ${found.length} найденных, кандидатов ${records.length}${kinds ? ` (${kinds})` : ''} · ${cr(credits)} (${budgetLine(ctx)})`);
  for (const w of warns) console.log(`   ${w}`);
  done.forEach((x, i) => console.log(`   ${i + 1}. ${x.url}${x.title ? ` — «${clip(x.title, 60)}»` : ''}: ${x.found.length}${x.fromCache ? ' (из кэша)' : ''}`));
  const miss = read.filter((x) => x.state !== 'прочитан');
  if (miss.length) console.log(`   не прочитано: ${miss.map((x) => `${shortUrl(x.url)} — ${clip(x.why, 90)}`).join('; ')}`);
  const skipped = sources.filter((x) => x.state === 'пропущен');
  if (skipped.length) console.log(`   пропущено: ${skipped.map((x) => `${shortUrl(x.url)} — ${x.why}`).join('; ')}`);
  if (fileNote) console.log(`   ${fileNote}`);
  if (records.length) console.log(`   → ${candFile} (кандидаты: ${records.length}${replaced ? `, прежние по этому --about заменены (${replaced})` : ''}, всего в файле ${total}) · ${mdFile} (для проверки глазами)`);
  else console.log(`   → ${mdFile}`);
  if (records.length) console.log('INFO это КАНДИДАТЫ, не факты: в copy/facts.json переносить только после проверки глазами — открыть источник, убедиться, что факт про это дело и этот город и ещё верен; цена или часы конкретного заведения — ориентир, а не цена клиента (пример на сайте с ней — в copy/invented.json)');
}

/* ---------- status: остаток на тарифе (0 кредитов) и учёт папки прогона ---------- */
async function cmdStatus() {
  if (pos.length) throw new Stop(`лишнее «${pos.join(' ')}» — node firecrawl.mjs status [--run <папка>]`, 1);
  const ctx = str(opt.run) || str(opt.out) ? ctxFor(runFolder(null)) : null;
  let local = null;
  if (ctx) {
    const led = readLedger(ctx.fc);
    local = `прогон ${ctx.run}: потрачено ${spentOf(led.calls)} из ${ctx.budget} (${led.calls.length} ${plural(led.calls.length, 'вызов', 'вызова', 'вызовов')} API, ${ledgerFile(ctx.fc)})`;
  }
  if (!KEY) { if (local) console.log(`   ${local}`); throw new Stop('INFO пропуск: нет FIRECRAWL_API_KEY', 0, { info: true }); }
  const d = ((await api('team/credit-usage', null, 'GET')) || {}).data || {};
  const left = Number(d.remainingCredits); const plan = Number(d.planCredits);
  const until = d.billingPeriodEnd ? dayOf(d.billingPeriodEnd) : null;
  const low = Number.isFinite(left) && left < DEFAULT_BUDGET;
  console.log(`${low ? 'WARN' : 'OK'} status: остаток на тарифе ${Number.isFinite(left) ? left : '?'}${Number.isFinite(plan) && plan > 0 ? ` из ${plan}` : ''} ${plural(Number.isFinite(left) ? left : 0, 'кредит', 'кредита', 'кредитов')}${until ? ` (период до ${until})` : ''}`);
  if (low) console.log(`   меньше ${DEFAULT_BUDGET} — одного сайта может не хватить: map и facts только по делу, повтор — из кэша`);
  if (local) console.log(`   ${local}`);
}

/* ---------- самопроверка: подставной сервер Firecrawl ---------- */
async function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'firecrawl-selftest-'));
  const home = ensureDir(path.join(tmp, 'home')); /* своя «домашняя папка»: настоящий .env с ключом дочерние процессы не читают */
  const fx = (n) => JSON.parse(fs.readFileSync(path.join(FIXTURES, n), 'utf8'));
  let MAP; let MAP1; let SCRAPE; let SEARCH;
  try { MAP = fx('map.json'); MAP1 = fx('map-v1.json'); SCRAPE = fx('scrape.json'); SEARCH = fx('search.json'); } catch (e) { console.log(`FAIL фикстуры ${FIXTURES}: ${e.message}`); return 1; }
  const seen = [];
  const srv = http.createServer((req, res) => {
    req.on('error', () => {}); res.on('error', () => {});
    let raw = ''; req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { /* не JSON */ }
      seen.push({ path: req.url, auth: String(req.headers.authorization || ''), body });
      const send = (code, o, headers = {}) => { if (res.writableEnded || res.destroyed) return; res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer test-key') return send(401, { success: false, error: 'Unauthorized: Invalid token' });
      if (req.method === 'GET' && req.url === '/v2/team/credit-usage') return send(200, { success: true, data: { remainingCredits: 988, planCredits: 1000, billingPeriodStart: '2026-09-01T12:00:00Z', billingPeriodEnd: '2026-10-01T12:00:00Z' } });
      if (req.method !== 'POST') return send(405, { success: false, error: 'POST only' });
      const target = String((body && body.url) || '');
      if (/no-credits/.test(target)) return send(402, { success: false, error: 'Insufficient credits to perform this request.' });
      if (/rate-limit/.test(target)) return send(429, { success: false, error: 'Rate limit exceeded. Please retry after 1s.' }, { 'Retry-After': '0' });
      if (/server-error/.test(target)) return send(500, { success: false, error: 'Unexpected error occurred' });
      if (/slow\./.test(target)) { await sleep(1500); return send(200, { success: true, data: { markdown: 'поздно' } }); }
      if (req.url === '/v2/map') { const src = /old\.example/.test(target) ? MAP1 : MAP; return send(200, { ...src, links: src.links.slice(0, body.limit || 100) }); }
      if (req.url === '/v2/scrape') {
        const f = SCRAPE[target];
        if (f && f.__status) { const { __status: st, ...rest } = f; return send(st, rest); }
        const out = JSON.parse(JSON.stringify(f || { success: true, data: { markdown: '# Страница\n\nТекст страницы.', metadata: { title: 'Страница', statusCode: 200, sourceURL: target, url: target } } }));
        const fm = (body.formats || []).map((x) => (typeof x === 'string' ? x : x && x.type));
        if (!fm.includes('branding')) delete out.data.branding;
        if (!fm.includes('markdown')) delete out.data.markdown;
        return send(200, out);
      }
      if (req.url === '/v2/search') { const web = SEARCH.data.web.slice(0, body.limit || 10); return send(200, { success: true, data: { web }, creditsUsed: 2 * Math.ceil(web.length / 10) }); }
      return send(404, { success: false, error: 'not found' });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const API = `http://127.0.0.1:${srv.address().port}`;
  const run = (args, env = {}) => new Promise((resolve) => {
    const p = spawn(process.execPath, [SELF, ...args], { cwd: tmp, windowsHide: true, env: { ...process.env, FIRECRAWL_API_URL: API, FIRECRAWL_API_KEY: 'test-key', FIRECRAWL_TIMEOUT_MS: '', SITE_REWORK_RUNS: path.join(tmp, 'runs'), USERPROFILE: home, HOME: home, RW_FLAGS_DUMP: '', ...env } });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  const n = (p, re) => seen.filter((x) => x.path === p && (!re || re.test(JSON.stringify(x.body || {})))).length;
  const spent = (dir) => { const j = readJson(path.join(dir, 'firecrawl', 'budget.json'), null); return j ? j.spent : null; };
  const checks = [];
  const outs = [];
  const check = (name, ok, extra = '') => { checks.push(!!ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); };
  const first = (r) => r.out.split(/\r?\n/).find((l) => l.trim()) || '';
  const R = path.join(tmp, 'run'); const R0 = path.join(tmp, 'run-nokey'); const R2 = path.join(tmp, 'run-budget'); const R3 = path.join(tmp, 'run-errors');
  try {
    let r = await run(['-h']);
    check('справка -h', r.code === 0 && /node firecrawl\.mjs map/.test(r.out));
    r = await run(['map', 'https://kofe.example/', '--run', R, '--limt', '10']); outs.push(r);
    check('опечатка во флаге — ошибка с подсказкой, без запроса', r.code === 1 && /неизвестный флаг --limt — может быть, --limit\?/.test(r.out) && !seen.length, first(r));
    r = await run(['map', 'https://kofe.example/', '--run', R0], { FIRECRAWL_API_KEY: '' }); outs.push(r);
    check('без ключа — INFO пропуск, код 0, ни запроса, ни файлов', r.code === 0 && /^INFO пропуск: нет FIRECRAWL_API_KEY$/m.test(r.out) && !seen.length && !fs.existsSync(R0), first(r));
    const local = ['http://localhost:4000/', 'http://127.0.0.1:8080/x', 'http://[::1]:3000/', 'http://192.168.1.5/', 'http://10.0.0.7/', 'http://172.20.1.1/', 'http://[fd12:3456::1]/', 'http://[::ffff:127.0.0.1]/', 'http://intranet/', 'http://printer.local/', 'file:///C:/site/index.html'];
    const bad = [];
    for (const u of local) { r = await run(['scrape', u, '--run', R]); outs.push(r); if (!(r.code === 2 && /облако Firecrawl/.test(r.out))) bad.push(`${u} → ${r.code} ${first(r).slice(0, 80)}`); }
    check(`отказ: localhost, 127.0.0.1, ::1, частные сети, file:// (${local.length})`, !bad.length && !seen.length, bad.join(' | '));
    r = await run(['scrape', 'https://x.com/kofe/status/1', '--run', R]); outs.push(r);
    const r2 = await run(['scrape', 'https://kofe.example/menu.pdf', '--run', R]); outs.push(r2);
    check('отказ: x.com (отдельная цена) и PDF (кредит за страницу)', r.code === 2 && /отдельной цене/.test(r.out) && r2.code === 2 && /PDF/.test(r2.out) && !seen.length, `${first(r).slice(0, 70)} | ${first(r2).slice(0, 70)}`);

    r = await run(['map', 'https://kofe.example/', '--run', R, '--limit', '50']); outs.push(r);
    const mj = readJson(path.join(R, 'firecrawl', 'map-kofe-example.json'), {}) || {};
    const keys = (mj.types || []).map((t) => t.key);
    const need = ['/', '/menu', '/menu/*', '/product/*', '/blog/*', '/contacts', '/o-nas', '/privacy-policy', '/en/blog/*', '/dostavka', '/афиша/*', 'shop.kofe.example/product/*'];
    const mb = seen.filter((x) => x.path === '/v2/map').pop();
    check('map: запрос, типы страниц, файлы .json и .md, 1 кредит', r.code === 0 && mb && mb.body.url === 'https://kofe.example/' && mb.body.limit === 50 && mb.auth === 'Bearer test-key'
      && need.every((k) => keys.includes(k)) && (mj.files || []).length === 1 && fs.existsSync(path.join(R, 'firecrawl', 'map-kofe-example.md')) && spent(R) === 1,
      `типы: ${keys.join(', ')}; spent ${spent(R)}`);
    const hints = Object.fromEntries((mj.types || []).map((t) => [t.key, t.hint]));
    const mdMap = fs.existsSync(path.join(R, 'firecrawl', 'map-kofe-example.md')) ? fs.readFileSync(path.join(R, 'firecrawl', 'map-kofe-example.md'), 'utf8') : '';
    check('map: догадки по имени и строка --pages для motion.mjs', hints['/menu'] === 'меню' && hints['/product/*'] === 'каталог и товары' && hints['/contacts'] === 'контакты и помощь' && hints['/афиша/*'] === 'афиша и события' && hints['/dostavka'] === 'доставка и оплата'
      && /--pages "home=\/,/.test(mdMap) && /product-item=\/product\//.test(mdMap) && (mj.types || []).find((t) => t.key === '/contacts').count === 1,
      JSON.stringify(hints).slice(0, 200));
    const before = n('/v2/map');
    r = await run(['map', 'https://kofe.example/', '--run', R, '--limit', '50']); outs.push(r);
    check('map повтором — из кэша: без запроса и без кредитов', r.code === 0 && /из кэша/.test(r.out) && n('/v2/map') === before && spent(R) === 1, first(r));
    r = await run(['map', 'https://kofe.example/', '--run', R, '--limit', '50', '--fresh']); outs.push(r);
    check('map --fresh — новый запрос', r.code === 0 && n('/v2/map') === before + 1 && spent(R) === 2, `spent ${spent(R)}`);
    r = await run(['map', 'https://old.example/', '--run', R]); outs.push(r);
    const oj = readJson(path.join(R, 'firecrawl', 'map-old-example.json'), {}) || {};
    check('map: ответ прежнего вида (адреса строками)', r.code === 0 && (oj.types || []).map((t) => t.key).join() === '/,/blog/*,/menu' && spent(R) === 3, (oj.types || []).map((t) => t.key).join());

    r = await run(['scrape', 'https://kofe.example/menu', '--run', R]); outs.push(r);
    const sb = seen.filter((x) => x.path === '/v2/scrape').pop();
    const sj = readJson(path.join(R, 'firecrawl', 'scrape-kofe-example-menu.json'), {}) || {};
    const smd = fs.existsSync(path.join(R, 'firecrawl', 'scrape-kofe-example-menu.md')) ? fs.readFileSync(path.join(R, 'firecrawl', 'scrape-kofe-example-menu.md'), 'utf8') : '';
    check('scrape: markdown и branding — запрос, файлы, стиль в выводе', r.code === 0 && sb && sb.body.formats.join() === 'markdown,branding' && Array.isArray(sb.body.parsers) && !sb.body.parsers.length && sb.body.onlyMainContent === true
      && /Эспрессо/.test(smd) && sj.branding && sj.branding.colors.primary === '#6B3E26' && /основной #6B3E26/.test(r.out) && /Playfair Display/.test(r.out) && /логотип: https:\/\/kofe\.example\/logo\.svg/.test(r.out) && spent(R) === 4,
      first(r));
    r = await run(['scrape', 'https://kofe.example/menu', '--run', R, '--formats', 'markdown']); outs.push(r);
    const sb2 = seen.filter((x) => x.path === '/v2/scrape').pop();
    check('scrape --formats markdown — только текст', r.code === 0 && sb2.body.formats.join() === 'markdown' && !/стиль:/.test(r.out) && spent(R) === 5, first(r));
    const cnt = n('/v2/scrape');
    r = await run(['scrape', 'https://kofe.example/menu', '--run', R, '--formats', 'markdown,screenshot']); outs.push(r);
    check('scrape --formats с чужим форматом — ошибка до запроса', r.code === 1 && /беру markdown/.test(r.out) && n('/v2/scrape') === cnt, first(r));

    r = await run(['search', 'кофейня Ярославль', '--run', R, '--limit', '5']); outs.push(r);
    const qb = seen.filter((x) => x.path === '/v2/search').pop();
    const qmd = path.join(R, 'firecrawl', 'search-кофейня-ярославль.md');
    check('search: язык, страна, 5 результатов с выдержками, 2 кредита', r.code === 0 && qb && qb.body.query === 'кофейня Ярославль' && qb.body.limit === 5 && qb.body.lang === 'ru' && qb.body.country === 'RU' && qb.body.sources.join() === 'web'
      && fs.existsSync(qmd) && (fs.readFileSync(qmd, 'utf8').match(/^\d+\. \*\*/gm) || []).length === 5 && /Капучино 250 ₽/.test(fs.readFileSync(qmd, 'utf8')) && spent(R) === 7, first(r));
    r = await run(['search', 'кофейня Ярославль']); outs.push(r);
    check('search без --run — ошибка', r.code === 1 && /нужен --run/.test(r.out), first(r));

    const sc = n('/v2/search'); const sr = n('/v2/scrape');
    r = await run(['facts', '--run', R, '--about', 'кофейня, Ярославль', '--limit', '3']); outs.push(r);
    const fb = seen.filter((x) => x.path === '/v2/search').pop();
    const cand = readJson(path.join(R, 'copy', 'facts-candidates.json'), null);
    const readUrls = seen.slice(-6).filter((x) => x.path === '/v2/scrape').map((x) => x.body.url).sort(); /* по два разом — порядок прихода любой */
    const okShape = Array.isArray(cand) && cand.length > 0 && cand.every((c) => typeof c.fact === 'string' && c.fact && typeof c.what === 'string' && /^https:\/\/\S+ \(\d{4}-\d\d-\d\d\)$/.test(c.source));
    check('facts: поиск 10, чтение по порядку выдачи, упавший источник заменён следующим', r.code === 0 && fb && fb.body.query === 'кофейня, Ярославль' && fb.body.limit === 10 && fb.body.ignoreInvalidURLs === true
      && n('/v2/search') === sc + 1 && n('/v2/scrape') === sr + 4 && readUrls.join() === 'https://kofe-a.example/menu,https://kofe-b.example/,https://kofe-c.example/uslugi,https://kofe-d.example/', readUrls.join(', '));
    check('facts: кандидаты в copy/facts-candidates.json в формате facts.json', okShape && cand.some((c) => c.fact === '250 ₽' && /kofe-a\.example\/menu/.test(c.source)) && cand.some((c) => c.fact === 'от 15 000 ₽') && cand.some((c) => c.kind === 'percent' && c.fact === '10%') && cand.some((c) => c.kind === 'term' && /2 часов/.test(c.fact)),
      Array.isArray(cand) ? `${cand.length}: ${cand.slice(0, 4).map((c) => c.fact).join(', ')}` : 'файла нет');
    check('facts: пропущены x.com, видео, PDF, частная сеть, второй адрес сайта', /x\.com\S* — у Firecrawl отдельная цена/.test(r.out) && /youtube\.com\S* — видео/.test(r.out) && /prices\.pdf — документ/.test(r.out) && /192\.168\.0\.10 — адрес частной сети/.test(r.out) && /kofe-a\.example\/about — второй адрес того же сайта/.test(r.out), r.out.split('\n').find((l) => /пропущено/.test(l)) || '');
    check('facts: вывод говорит «кандидаты, не факты», 5 кредитов (упавший — 0)', /INFO это КАНДИДАТЫ, не факты/.test(r.out) && spent(R) === 12, `spent ${spent(R)}`);
    const nc = Array.isArray(cand) ? cand.length : -1; const sc2 = n('/v2/search'); const okScr = n('/v2/scrape', /kofe-[abd]\.example/);
    r = await run(['facts', '--run', R, '--about', 'кофейня, Ярославль', '--limit', '3']); outs.push(r);
    const cand2 = readJson(path.join(R, 'copy', 'facts-candidates.json'), null);
    check('facts повтором — из кэша, записи того же --about заменены, не удвоены', r.code === 0 && n('/v2/search') === sc2 && n('/v2/scrape', /kofe-[abd]\.example/) === okScr && spent(R) === 12 && Array.isArray(cand2) && cand2.length === nc, `записей ${Array.isArray(cand2) ? cand2.length : '?'} (было ${nc})`);
    const R4 = path.join(tmp, 'run-glued');
    r = await run(['scrape', 'https://glued.example/', '--run', R4, '--formats', 'markdown']); outs.push(r);
    const normal = 'Мы варим кофе с утра до ночи и пробуем новые сорта каждую неделю. '.repeat(8);
    check('текст без пробелов — WARN «слипся» (так Firecrawl отдал example.com 30.09); обычный текст и иероглифы — нет',
      r.code === 0 && /^WARN scrape/m.test(r.out) && /текст слипся/.test(r.out) && !/текста почти нет/.test(r.out) && glued(SCRAPE['https://glued.example/'].data.markdown) && !glued(normal) && !glued('该域名仅用于文档示例，无需获得许可。这并非一项服务。'.repeat(20)), first(r).slice(0, 120));
    r = await run(['status', '--run', R]); outs.push(r);
    check('status: остаток на тарифе (GET, 0 кредитов) и учёт папки прогона', r.code === 0 && /^OK status: остаток на тарифе 988 из 1000 кредитов \(период до 2026-10-01\)/m.test(r.out) && /потрачено 12 из 50/.test(r.out) && seen.some((x) => x.path === '/v2/team/credit-usage') && spent(R) === 12, first(r));

    const before2 = seen.length;
    r = await run(['facts', '--run', R2, '--about', 'барбершоп, Ярославль', '--budget', '4']); outs.push(r);
    check('бюджет: facts дороже предела — остановка до запроса (код 2)', r.code === 2 && /бюджет прогона/.test(r.out) && seen.length === before2, first(r).slice(0, 160));
    r = await run(['map', 'https://kofe.example/', '--run', R2, '--budget', '1']); outs.push(r);
    const r3 = await run(['scrape', 'https://kofe.example/menu', '--run', R2, '--budget', '1']); outs.push(r3);
    check('бюджет: учёт в budget.json, вызов сверх предела не уходит', r.code === 0 && spent(R2) === 1 && r3.code === 2 && /потрачено 1 из 1/.test(r3.out) && n('/v2/scrape', /kofe\.example\/menu/) === 2, first(r3).slice(0, 160));

    r = await run(['map', 'https://kofe.example/', '--run', R3], { FIRECRAWL_API_KEY: 'wrong-key-12345' }); outs.push(r);
    check('401 — «ключ не принят», сам ключ не напечатан', r.code === 1 && /ключ FIRECRAWL_API_KEY не принят/.test(r.out) && !/wrong-key-12345/.test(r.out), first(r).slice(0, 140));
    r = await run(['scrape', 'https://no-credits.example/', '--run', R3]); outs.push(r);
    check('402 — «не хватает кредитов»', r.code === 1 && /не хватает кредитов/.test(r.out), first(r).slice(0, 140));
    const rl = n('/v2/scrape', /rate-limit/);
    r = await run(['scrape', 'https://rate-limit.example/', '--run', R3]); outs.push(r);
    check('429 — один повтор, потом «предел запросов»', r.code === 1 && /предел запросов/.test(r.out) && n('/v2/scrape', /rate-limit/) === rl + 2, first(r).slice(0, 140));
    r = await run(['scrape', 'https://slow.example/', '--run', R3], { FIRECRAWL_TIMEOUT_MS: '300' }); outs.push(r);
    check('нет ответа — «не ответил за …», кредит по цене', r.code === 1 && /не ответил за/.test(r.out) && spent(R3) === 1, first(r).slice(0, 140));
    r = await run(['scrape', 'https://server-error.example/', '--run', R3]); outs.push(r);
    check('500 — «сбой на стороне Firecrawl», без кредита', r.code === 1 && /сбой на стороне Firecrawl/.test(r.out) && spent(R3) === 1, first(r).slice(0, 140));
    const stack = outs.filter((x) => /\n\s+at .+:\d+:\d+/.test(x.out));
    check('ни одного стека в выводе', !stack.length, stack.length ? first(stack[0]) : '');
    check('ни один запрос не ушёл с чужим ключом', seen.every((x) => x.auth === 'Bearer test-key' || x.auth === 'Bearer wrong-key-12345'));
  } finally {
    srv.close(); if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
  }
  const bad = checks.filter((x) => !x).length;
  console.log(`${bad ? 'FAIL' : 'OK'}: проверок ${checks.length}, не прошло ${bad}, запросов к подставному серверу ${seen.length} · ${tmp}`);
  return bad ? 1 : 0;
}

/* ---------- запуск ---------- */
if (opt.selftest || pos[0] === 'selftest') process.exit(await selftest());
if (!pos.length) { console.log(HELP); process.exit(1); }
CMD = pos.shift();
try {
  if (!USES[CMD]) throw new Stop(/^(https?|file):/i.test(CMD) ? `нужна команда: map, scrape, search или facts — например node firecrawl.mjs map ${CMD} --run <папка>` : `не знаю команду «${CMD}»: map, scrape, search, facts, status (подробно: --help)`, 1);
  for (const k of VALUE_OPTS) if (opt[k] === true) throw new Stop(`--${k}: нужно значение (подробно: --help)`, 1);
  const own = CMD === 'status' ? USES.status : [...USES[CMD], ...COMMON];
  const allowed = new Set([...own, 'help', 'h', 'selftest']);
  const extra = Object.keys(opt).filter((k) => !allowed.has(k));
  if (extra.length) throw new Stop(`${extra.map((k) => `--${k}`).join(', ')} — не для команды ${CMD} (её флаги: ${own.map((k) => `--${k}`).join(', ')})`, 1);
  loadEnv();
  KEY = String(process.env.FIRECRAWL_API_KEY || '').trim();
  await ({ map: cmdMap, scrape: cmdScrape, search: cmdSearch, facts: cmdFacts, status: cmdStatus })[CMD]();
} catch (e) {
  if (e instanceof Stop && e.info) {
    console.log(e.message);
    console.log(`     ключ — firecrawl.dev/app → API Keys, строка FIRECRAWL_API_KEY=… в ${ENV_FILE}; без ключа сбор данных через Firecrawl пропускается`);
    process.exit(0);
  }
  if (e instanceof Stop) { console.error(`FAIL ${CMD}${e.target ? ` ${e.target}` : ''}: ${e.message}`); process.exit(e.code); }
  console.error(`FAIL ${CMD}: внутренняя ошибка — ${hide(String((e && e.message) || e).split('\n')[0])}`);
  process.exit(1);
}
