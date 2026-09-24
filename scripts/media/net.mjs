/**
 * Сеть для media.mjs: запросы с повтором, запасное разрешение имён через DoH,
 * вежливые паузы по хостам, кэш ответов API, User-Agent без личных данных.
 *
 * Почему свой клиент, а не fetch: DNS VPN-клиента (happ-xray) иногда не
 * отдаёт A-записи (www.pexels.com, cdn.pixabay.com) или отвечает через 10+ с.
 * Здесь имя сначала ищется обычным dns.lookup, а если он не ответил за 2,5 с
 * или ответил ошибкой — через DoH Cloudflare (1.1.1.1), затем Google (8.8.8.8).
 * Адреса DoH заданы IP-адресами, чтобы им самим не нужен был DNS.
 *
 * Сетевые сбои — ВРЕМЕННЫЕ: сообщение всегда «повторить позже», никогда
 * «источник недоступен с этой машины». Разовый сбой DNS VPN — не факт о сети.
 *
 * Ключи и контакт читаются из окружения и из ~/.claude/site-rework/.env
 * (вне репозиториев). Контакт для User-Agent — ТОЛЬКО из MEDIA_CONTACT.
 * Без MEDIA_CONTACT к Wikimedia (Commons, копии, Wikidata) и AIC не уходит
 * ни один запрос: их правила требуют контакт в User-Agent. request() отказывает
 * сразу (NetError code ENOCONTACT, не временная), источники пропускаются.
 */
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const HOME_DIR = path.join(os.homedir(), '.claude', 'site-rework');
export const ENV_FILE = path.join(HOME_DIR, '.env');
export const CACHE_DIR = process.env.MEDIA_CACHE || path.join(HOME_DIR, 'cache');
export const KEY_NAMES = ['PEXELS_API_KEY', 'UNSPLASH_ACCESS_KEY', 'PIXABAY_API_KEY', 'SI_API_KEY', 'MEDIA_CONTACT'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- окружение ---------- */

let envLoaded = false;
/** Прочитать ~/.claude/site-rework/.env один раз. Уже заданные переменные окружения главнее файла. */
export function loadEnv() {
  if (envLoaded) return;
  envLoaded = true;
  let text = '';
  try { text = fs.readFileSync(ENV_FILE, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (process.env[m[1]] === undefined || process.env[m[1]] === '') process.env[m[1]] = v;
  }
}
export function envFileExists() { try { return fs.statSync(ENV_FILE).isFile(); } catch { return false; } }

/** Значение ключа или null. Сами ключи никуда не печатаются и не пишутся. */
export function key(name) { loadEnv(); const v = process.env[name]; return v && String(v).trim() ? String(v).trim() : null; }

/* ---------- User-Agent ---------- */

const VERSION = '1.0';
/** Контакт только из MEDIA_CONTACT; ни почты из git, ни имени пользователя. */
export function contact() {
  const c = key('MEDIA_CONTACT');
  if (!c) return null;
  /* в заголовок не должны попасть переводы строк и скобки, ломающие формат */
  return c.replace(/[\r\n()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
}
export function userAgent() {
  const c = contact();
  return c ? `site-rework-media/${VERSION} (${c}) node/${process.versions.node}` : `site-rework-media/${VERSION} (+local tool)`;
}
/* Хосты, чьи правила требуют контакт в User-Agent: вики Wikimedia (Commons, upload/thumb, Wikidata) и AIC. */
const CONTACT_HOSTS = [/(^|\.)(wikimedia|wikipedia|mediawiki|wikidata)\.org$/i, /(^|\.)artic\.edu$/i, /(^|\.)w\.wiki$/i]; /* w.wiki — сокращатель Wikimedia */
/** Нужен ли контакт для адреса (или имени хоста). */
export function needsContact(urlOrHost) {
  let h = String(urlOrHost || '');
  try { h = new URL(h).hostname; } catch { /* уже имя хоста */ }
  h = h.replace(/\.$/, '');
  return CONTACT_HOSTS.some((re) => re.test(h));
}
/** Запрос к адресу запрещён: хост требует контакт, а MEDIA_CONTACT нет. */
export function contactBlocked(url) { return needsContact(url) && !contact(); }
/** Причина пропуска источника (строка SKIP у search и doctor). */
export const NO_CONTACT_SKIP = 'нет MEDIA_CONTACT — правила Wikimedia и AIC требуют контакт в User-Agent; без него ни одного запроса';
/** Что сделать без контакта (без точки в конце). */
export function noContactHint() {
  return `нет MEDIA_CONTACT — спросить контакт у пользователя (адрес сайта студии или рабочую почту) и записать MEDIA_CONTACT=… в ${ENV_FILE}; почту из git или профиля самому не брать`;
}
/** Одна понятная строка: что пропущено и что сделать. */
export function noContactLine() { return `Commons и AIC пропущены: ${noContactHint()}`; }
/** Бросить отказ (не временный), если к адресу без контакта ходить нельзя. */
export function assertContact(url) {
  if (!contactBlocked(url)) return;
  let host = String(url); try { host = new URL(url).hostname; } catch { /* как есть */ }
  throw new NetError(`${host}: запрос не отправлен — правила Wikimedia и AIC требуют контакт в User-Agent, а ${noContactHint()}`, { temporary: false, code: 'ENOCONTACT', host });
}
let warnedContact = false;
/** Одна строка на процесс (для совместимости со сторонними модулями видео): без контакта Commons и AIC пропускаются. */
export function warnNoContact(log = console.log) {
  if (warnedContact || contact()) return;
  warnedContact = true;
  log(`  WARN ${noContactLine()}`);
}

/* ---------- ошибки ---------- */

export class NetError extends Error {
  constructor(message, { temporary = true, status = 0, code = '', host = '', retryAfter = 0 } = {}) {
    super(message);
    this.temporary = temporary; this.status = status; this.code = code; this.host = host; this.retryAfter = retryAfter;
  }
}
const NET_CODES = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EPIPE|ECONNABORTED|UND_ERR|ERR_SSL|EPROTO|CERT|socket hang up|timeout|DOH/i;
function temporaryMessage(host, reason) { return `временно: ${host} — ${reason}; повторить позже`; }
/** Текст ошибки для людей: сетевые — всегда «временно … повторить позже». */
export function describeError(e) {
  if (e instanceof NetError) return e.message;
  if (e?.fsWrite) return e.message;
  const code = e?.code || e?.cause?.code || '';
  if (NET_CODES.test(`${code} ${e?.message || ''}`)) return temporaryMessage(e?.host || 'сеть', `${code || e.message}`);
  return String(e?.message || e);
}

/* ---------- разрешение имён: DNS, затем DoH ---------- */

const DOH = [
  { name: 'cloudflare', url: (h) => `https://1.1.1.1/dns-query?name=${encodeURIComponent(h)}&type=A` },
  { name: 'google', url: (h) => `https://8.8.8.8/resolve?name=${encodeURIComponent(h)}&type=A` },
];
const dohCache = new Map(); /* host -> { ips, until } */
export const dnsStats = new Map(); /* host -> 'dns' | 'doh:cloudflare' | 'doh:google' */

function rawGet(url, headers, timeout) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('DoH timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
  });
}

export async function dohResolve(host) {
  const hit = dohCache.get(host);
  if (hit && hit.until > Date.now()) return hit;
  let last;
  for (const ep of DOH) {
    try {
      const r = await rawGet(ep.url(host), { accept: 'application/dns-json' }, 6000);
      if (r.status !== 200) throw new Error(`DoH ${ep.name} HTTP ${r.status}`);
      const j = JSON.parse(r.body.toString('utf8'));
      const ips = (j.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
      if (!ips.length) throw new Error(`DoH ${ep.name}: нет A-записей`);
      const ttl = Math.max(60, Math.min(3600, Number((j.Answer || []).find((a) => a.type === 1)?.TTL) || 300));
      const out = { ips, via: `doh:${ep.name}`, until: Date.now() + ttl * 1000 };
      dohCache.set(host, out);
      return out;
    } catch (e) { last = e; }
  }
  throw Object.assign(new Error(`DoH не ответил: ${last?.message || '?'}`), { code: 'EDOH' });
}

/*
 * Проверочный рычаг: MEDIA_TEST_DNS_FAIL="хост,dns:хост2,*" — имитация сбоя имён.
 * «хост» — не находят ни системный DNS, ни DoH (как полный сбой сети);
 * «dns:хост» — молчит только системный DNS (как DNS VPN), DoH должен выручить.
 */
function testDnsFail(hostname) {
  const list = String(process.env.MEDIA_TEST_DNS_FAIL || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return null;
  const h = hostname.toLowerCase();
  if (list.includes('*') || list.includes(h)) return 'all';
  if (list.includes(`dns:${h}`) || list.includes('dns:*')) return 'dns';
  return null;
}

/** lookup для https.request: dns.lookup, а при ошибке или молчании дольше 2,5 с — DoH. */
function smartLookup(hostname, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  const fake = testDnsFail(hostname);
  if (fake === 'all') return process.nextTick(() => cb(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname} (MEDIA_TEST_DNS_FAIL)`), { code: 'ENOTFOUND', hostname })));
  /* IP-адрес в адресе — разрешать нечего */
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return opts && opts.all ? cb(null, [{ address: hostname, family: 4 }]) : cb(null, hostname, 4);
  let settled = false; let failures = 0; let dohStarted = false; const errors = [];
  let timer = null;
  const win = (r) => {
    if (settled) return; settled = true; clearTimeout(timer);
    dnsStats.set(hostname, r.via);
    if (opts && opts.all) cb(null, r.ips.map((a) => ({ address: a, family: 4 })));
    else cb(null, r.ips[0], 4);
  };
  const lose = (e) => {
    errors.push(e); failures++;
    if (settled) return;
    if (!dohStarted) { startDoh(); return; }
    if (failures >= 2) {
      settled = true; clearTimeout(timer);
      const first = errors.find((x) => x.code !== 'EDOH') || {};
      const dnsWhy = first.code || first.message || 'нет ответа';
      const dohWhy = (errors.find((x) => x.code === 'EDOH') || {}).message || 'DoH не ответил';
      cb(Object.assign(new Error(`имя не найдено: системный DNS — ${dnsWhy}, запасной DoH (Cloudflare, Google) — ${dohWhy.replace(/^DoH не ответил:\s*/, '')}`), { code: 'ENOTFOUND' }));
    }
  };
  const startDoh = () => { if (dohStarted) return; dohStarted = true; dohResolve(hostname).then(win, lose); };
  timer = setTimeout(startDoh, 2500);
  if (fake === 'dns') { process.nextTick(() => lose(Object.assign(new Error(`системный DNS молчит (MEDIA_TEST_DNS_FAIL)`), { code: 'ENOTFOUND' }))); return; }
  dns.lookup(hostname, { family: 4, all: true }, (err, addrs) => {
    if (!err && addrs && addrs.length) win({ ips: addrs.map((a) => a.address), via: 'dns' });
    else lose(err || Object.assign(new Error('пустой ответ DNS'), { code: 'ENOTFOUND' }));
  });
}

/** То же разрешение имён для своих https.request (видео-модуль и др.). */
export const lookup = smartLookup;

/* ---------- вежливость: очереди по хостам ---------- */

/* Commons и остальные вики — строго по одному, пауза ≥300 мс (политика Wikimedia);
   AIC — не чаще 1 запроса в секунду (просьба музея); Openverse — 20 в минуту без ключа;
   Mixkit — как человек, пауза 1,5 с; Pixabay — пауза, повторные быстрые запросы к CDN ловят 403. */
const GATES = [
  { name: 'wikimedia', re: /(^|\.)(wikimedia|wikipedia|mediawiki|wikidata)\.org$/i, interval: 350 },
  { name: 'aic', re: /(^|\.)artic\.edu$/i, interval: 1050 },
  { name: 'openverse', re: /^api\.openverse\.org$/i, interval: 3100 },
  { name: 'met', re: /(^|\.)metmuseum\.(org|github\.io)$/i, interval: 60 },
  { name: 'rijks', re: /(^|\.)(rijksmuseum\.nl|micr\.io)$/i, interval: 150 },
  { name: 'smk', re: /(^|\.)smk\.dk$/i, interval: 200 },
  { name: 'cleveland', re: /(^|\.)clevelandart\.org$/i, interval: 120 },
  { name: 'smithsonian', re: /(^|\.)si\.edu$/i, interval: 400 },
  { name: 'pixabay', re: /(^|\.)pixabay\.com$/i, interval: 700 },
  /* CDN файлов Mixkit — не сайт: короткая пауза; сам сайт — как человек, 1,5 с */
  { name: 'mixkit-cdn', re: /^assets\.mixkit\.co$/i, interval: 300 },
  { name: 'mixkit', re: /(^|\.)mixkit\.co$/i, interval: 1500 },
  { name: 'unsplash-api', re: /^api\.unsplash\.com$/i, interval: 250 },
  { name: 'pexels-api', re: /^api\.pexels\.com$/i, interval: 250 },
  { name: 'wordpress', re: /(^|\.)(wordpress\.org|w\.org)$/i, interval: 200 },
];
const gateState = new Map();
/* Хосты без своей очереди тоже помнят retry-after: иначе после 429 следующий кадр
   того же сервера ушёл бы сразу. */
const hostBlock = new Map(); /* host -> до какого времени не слать */
function gateFor(host) { return GATES.find((g) => g.re.test(host)) || null; }
function blockedMessage(host, until) { return temporaryMessage(host, `сервер попросил подождать (retry-after), ещё ${Math.ceil((until - Date.now()) / 1000)} с`); }
async function throughGate(host, fn) {
  const g = gateFor(host);
  const hb = hostBlock.get(g ? g.name : host) || 0;
  /* долгий retry-after (больше 30 с) уважаем целиком: в этом запуске к серверу больше не идём */
  if (hb - Date.now() > 30000) throw new NetError(blockedMessage(host, hb), { host, status: 429, retryAfter: Math.ceil((hb - Date.now()) / 1000) });
  if (hb > Date.now()) await sleep(hb - Date.now());
  if (!g) return fn();
  let st = gateState.get(g.name);
  if (!st) { st = { chain: Promise.resolve(), last: 0, extra: 0 }; gateState.set(g.name, st); }
  const run = async () => {
    const b = hostBlock.get(g.name) || 0;
    if (b - Date.now() > 30000) throw new NetError(blockedMessage(host, b), { host, status: 429, retryAfter: Math.ceil((b - Date.now()) / 1000) });
    const wait = Math.max(st.last + g.interval + st.extra, b) - Date.now();
    if (wait > 0) await sleep(wait);
    st.extra = 0;
    try { return await fn(); } finally { st.last = Date.now(); }
  };
  const p = st.chain.then(run, run);
  st.chain = p.catch(() => {});
  return p;
}
/** Не слать запросы к хосту (или его очереди) ms миллисекунд — по retry-after. */
function penalize(host, ms) {
  const g = gateFor(host); const k = g ? g.name : host;
  hostBlock.set(k, Math.max(hostBlock.get(k) || 0, Date.now() + ms));
  if (g) { const st = gateState.get(g.name); if (st) st.extra = Math.max(st.extra, Math.min(ms, 30000)); }
}

/* ---------- один запрос ---------- */

function once(url, { method, headers, timeout, maxBytes, toFile, acceptEncoding }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'http:' ? http : https;
    /* accept как у curl: без него фронт Wikimedia на промахах кэша чаще отвечает 429 */
    const h = { 'user-agent': userAgent(), accept: '*/*', ...headers };
    if (acceptEncoding && !h['accept-encoding']) h['accept-encoding'] = 'gzip, deflate, br';
    const t0 = Date.now();
    const req = mod.request(u, { method, headers: h, lookup: smartLookup, timeout }, (res) => {
      const out = { status: res.statusCode, headers: res.headers, url, ms: 0, bytes: 0, via: dnsStats.get(u.hostname) || 'dns' };
      if (method === 'HEAD' || (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)) {
        res.resume(); out.ms = Date.now() - t0; return resolve(out);
      }
      const len = Number(res.headers['content-length'] || 0);
      if (maxBytes && len > maxBytes) { res.resume(); req.destroy(); return reject(new NetError(`файл ${Math.round(len / 1048576)} МБ больше предела ${Math.round(maxBytes / 1048576)} МБ`, { temporary: false, host: u.hostname })); }
      let stream = res;
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      const hash = crypto.createHash('sha256');
      let n = 0; const chunks = [];
      let ws = null; let wsFailed = false;
      if (toFile && res.statusCode >= 200 && res.statusCode < 300) {
        /* ошибка записи (нет папки, диск полон, файл занят антивирусом) — строка FAIL, а не падение процесса;
           и не «временная сетевая»: повтор запроса её не исправит */
        try { fs.mkdirSync(path.dirname(toFile), { recursive: true }); } catch { /* скажет сам поток */ }
        ws = fs.createWriteStream(toFile);
        ws.on('error', (e) => failWrite(e));
      }
      function failWrite(e) {
        if (wsFailed) return; wsFailed = true;
        req.destroy(); stream.destroy();
        reject(Object.assign(new Error(`не записать файл ${toFile}: ${String(e?.message || e).replace(/\s+/g, ' ')}`), { code: e?.code || 'EWRITE', fsWrite: true }));
      }
      stream.on('data', (c) => {
        if (wsFailed) return;
        n += c.length;
        if (maxBytes && n > maxBytes) { req.destroy(); stream.destroy(); if (ws) ws.destroy(); return reject(new NetError(`ответ больше предела ${Math.round(maxBytes / 1048576)} МБ`, { temporary: false, host: u.hostname })); }
        hash.update(c);
        if (ws) ws.write(c); else chunks.push(c);
      });
      stream.on('error', (e) => { if (ws) ws.destroy(); reject(e); });
      stream.on('end', () => {
        out.ms = Date.now() - t0; out.bytes = n; out.sha256 = hash.digest('hex');
        /* end(cb) зовёт cb и при ошибке записи, раньше события error: тогда это отказ, а не успех */
        if (ws) ws.end((err) => { if (err || wsFailed) return failWrite(err || new Error('запись прервана')); out.file = toFile; resolve(out); });
        else { out.body = Buffer.concat(chunks); resolve(out); }
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error(`нет ответа за ${Math.round(timeout / 1000)} с`), { code: 'ETIMEDOUT' })));
    req.on('error', (e) => { e.host = u.hostname; reject(e); });
    req.end();
  });
}

/**
 * Запрос с повтором и переходами.
 * opts: method, headers, timeout (мс на попытку), tries, maxBytes, toFile, redirects,
 *       acceptEncoding (true для JSON и HTML).
 * Возвращает { status, headers, body | file, url (итоговый), bytes, sha256, ms, via }.
 * 429 и 503: ждёт retry-after (до 30 с), дольше — бросает временную ошибку.
 */
export async function request(url, { method = 'GET', headers = {}, timeout = 30000, tries = 3, maxBytes = 120 * 1048576, toFile = null, redirects = 6, acceptEncoding = false } = {}) {
  let current = url; let hops = 0; let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const host = new URL(current).hostname;
    /* Wikimedia и AIC без MEDIA_CONTACT — ни одного запроса (и после перехода на их хост) */
    assertContact(current);
    try {
      const r = await throughGate(host, () => once(current, { method, headers, timeout, maxBytes, toFile, acceptEncoding }));
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        if (++hops > redirects) throw new NetError(`слишком много переходов (${current})`, { temporary: false, host });
        current = new URL(r.headers.location, current).href; attempt--; continue;
      }
      if (r.status === 429 || r.status === 503) {
        const ra = Number(r.headers['retry-after']);
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 4000 * attempt;
        penalize(host, wait);
        lastErr = new NetError(temporaryMessage(host, `HTTP ${r.status}${ra ? `, retry-after ${ra} с` : ''} (лимит запросов)`), { status: r.status, host, retryAfter: ra || 0 });
        if (wait > 30000 || attempt === tries) throw lastErr;
        await sleep(wait); continue;
      }
      r.url = current;
      return r;
    } catch (e) {
      if (e && e.fsWrite) throw e; /* диск, а не сеть */
      if (e instanceof NetError && !e.temporary) throw e;
      if (e instanceof NetError && e.status) { lastErr = e; if (attempt === tries || e.retryAfter > 30) throw e; continue; }
      const code = e.code || '';
      lastErr = new NetError(temporaryMessage(host, `${code ? code + ' ' : ''}${e.message}`.trim()), { code, host });
      if (attempt < tries) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastErr || new NetError(temporaryMessage(new URL(url).hostname, 'неизвестный сбой'));
}

/** Статус-код, при котором ошибка — «временно» (сервер, лимиты), а не отказ по существу. */
const isTemporaryStatus = (s) => s === 408 || s === 425 || s === 429 || s >= 500;

/* ---------- JSON с кэшем ---------- */

/** Убрать из адреса секреты перед записью куда-либо (кэш, манифест, лог). */
export function redact(url) {
  try {
    const u = new URL(url);
    for (const k of ['key', 'api_key', 'client_id', 'access_key', 'token']) if (u.searchParams.has(k)) u.searchParams.set(k, '***');
    return u.href;
  } catch { return String(url).replace(/([?&](?:key|api_key|client_id)=)[^&]+/gi, '$1***'); }
}

/**
 * GET JSON. cacheTtl (мс) — брать ответ из кэша на диске, если свежий
 * (Pixabay требует кэшировать ответы 24 ч; Openverse без ключа — 200 запросов в сутки).
 * Ключ кэша строится по адресу без секретов.
 */
export async function getJson(url, { headers = {}, timeout = 30000, tries = 3, cacheTtl = 0, fresh = false } = {}) {
  const cacheFile = cacheTtl ? path.join(CACHE_DIR, 'media-api', crypto.createHash('sha1').update(redact(url) + JSON.stringify(Object.keys(headers).sort())).digest('hex') + '.json') : null;
  if (cacheFile && !fresh) {
    try { const st = fs.statSync(cacheFile); if (Date.now() - st.mtimeMs < cacheTtl) return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* нет в кэше */ }
  }
  const r = await request(url, { headers: { accept: 'application/json', ...headers }, timeout, tries, acceptEncoding: true, maxBytes: 40 * 1048576 });
  const host = new URL(url).hostname;
  if (r.status < 200 || r.status >= 300) {
    const text = (r.body || Buffer.alloc(0)).toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new NetError(isTemporaryStatus(r.status) ? temporaryMessage(host, `HTTP ${r.status}`) : `${host}: HTTP ${r.status} ${text}`, { temporary: isTemporaryStatus(r.status), status: r.status, host });
  }
  let j;
  try { j = JSON.parse(r.body.toString('utf8')); } catch { throw new NetError(temporaryMessage(host, 'ответ не JSON (возможно, страница защиты от ботов)'), { host }); }
  if (cacheFile) { try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(j)); } catch { /* кэш не обязателен */ } }
  return j;
}

/** GET текста (HTML-страница, одна за раз). */
export async function getText(url, { headers = {}, timeout = 30000, tries = 3 } = {}) {
  const r = await request(url, { headers, timeout, tries, acceptEncoding: true, maxBytes: 20 * 1048576 });
  return { status: r.status, text: (r.body || Buffer.alloc(0)).toString('utf8'), headers: r.headers, url: r.url };
}

/** HEAD: код, размер и тип до скачивания. */
export async function head(url, { headers = {}, timeout = 20000 } = {}) {
  const r = await request(url, { method: 'HEAD', headers, timeout, tries: 2 });
  return { status: r.status, bytes: Number(r.headers['content-length'] || 0) || null, type: r.headers['content-type'] || '', url: r.url, acceptRanges: r.headers['accept-ranges'] || '' };
}

/** Первые байты файла (Range) — чтобы узнать размер кадра по заголовку, не качая файл. */
export async function getRange(url, { headers = {}, bytes = 131072, timeout = 20000 } = {}) {
  const r = await request(url, { headers: { ...headers, range: `bytes=0-${bytes - 1}` }, timeout, tries: 2, maxBytes: Math.max(bytes * 2, 8 * 1048576) });
  return r;
}

/**
 * Скачать файл целиком в буфер (или в файл при toFile) с проверкой кода ответа.
 * Бросает ошибку при любом коде кроме 200 (и 206, если allowPartial).
 */
export async function download(url, { headers = {}, timeout = 120000, maxBytes = 120 * 1048576, toFile = null, allowPartial = false } = {}) {
  const r = await request(url, { headers, timeout, tries: 3, maxBytes, toFile });
  const okStatus = r.status === 200 || (allowPartial && r.status === 206);
  if (!okStatus) {
    const host = new URL(url).hostname;
    if (toFile) { try { fs.unlinkSync(toFile); } catch { /* нет файла */ } }
    throw new NetError(isTemporaryStatus(r.status) ? temporaryMessage(host, `HTTP ${r.status}`) : `${host}: HTTP ${r.status} на ${redact(url).slice(0, 140)}`, { temporary: isTemporaryStatus(r.status), status: r.status, host });
  }
  return r;
}

/** Сигнатура файла по первым байтам. */
export function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  const b = buf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return 'tiff';
  if (b.toString('ascii', 4, 8) === 'ftyp') {
    const brand = b.toString('ascii', 8, 12);
    if (/avif|avis/.test(brand)) return 'avif';
    if (/heic|heix|mif1/.test(brand)) return 'heic';
    return 'mp4';
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (b.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  const head = b.toString('utf8', 0, 64).trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml') || head.startsWith('{')) return 'text';
  return null;
}

/** Проба доступности для doctor: код, время, как нашлось имя. Ошибка — временная. */
export async function probe(url, { headers = {}, method = 'GET', timeout = 15000 } = {}) {
  const t0 = Date.now();
  try {
    const r = await request(url, { method, headers: method === 'GET' ? { ...headers, range: 'bytes=0-2047' } : headers, timeout, tries: 2, maxBytes: 4 * 1048576, acceptEncoding: method === 'GET' });
    return { ok: true, status: r.status, ms: Date.now() - t0, via: dnsStats.get(new URL(r.url).hostname) || r.via };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: describeError(e) };
  }
}
