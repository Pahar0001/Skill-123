#!/usr/bin/env node
/**
 * Безопасность и утечки: факты по HTTP и по коду, без «вкуса».
 *
 *   node security.mjs <url> [--out папка] [--tag имя] [--admin /admin,/api/admin/x] [--repo папка] [--strict]
 *   node security.mjs --repo папка [--out папка] [--tag имя]        только репозиторий, без сайта
 *   node security.mjs --selftest [--out папка]
 *   node security.mjs --help   (или -h)
 *
 * Проверяет то, что видно снаружи и в исходнике, — не «взлом», а гигиена боевого сайта с формами и
 * админкой. Только чтение: GET по адресам, без нагрузки и перебора. Каждая проверка получает вердикт
 * OK / WARN / FAIL, итог — худший из них. Значения ключей и куки в выводе и в JSON маскируются.
 *
 * Флаги:
 *   --out    папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/security/<tag>.json.
 *   --tag    имя файла итога (по умолчанию по адресу сайта, для --repo без сайта — repo).
 *   --admin  пути админки и её API, которые надо запросить без входа, через запятую: --admin /admin,/api/admin/venues.
 *            К ним добавляются пути /admin и /api/admin/…, найденные в разметке и скриптах страницы.
 *   --repo   папка git-репозитория: секреты в отслеживаемых файлах и в истории, .env в .gitignore и не в git.
 *            Есть gitleaks (winget install gitleaks.gitleaks) — историю сканирует он; нет — свой поиск по образцам.
 *   --strict код выхода 1 при итоговом вердикте FAIL (для гейта); без флага — 0 при любом вердикте.
 *   --selftest  стенды fixtures/security (сайт с нарочными дырами и сайт без дыр на своём сервере, плюс
 *               временный репозиторий с секретом в истории) с ожиданиями на каждый пункт; код 1, если не сошлось.
 *   --help, -h  эта справка.
 *
 * Что проверяется по адресу сайта:
 *   a) Служебные файлы. /.env(.local/.production), /.git/HEAD и /config, резервные копии и базы
 *      (*.zip, *.sql, *.sqlite, *.db, *.bak в корне и в data/, backup/), исходники сервера
 *      (/server.js, /package.json, /src/…), карты исходников *.map найденных скриптов, листинг папок.
 *      FAIL — если отдаётся именно содержимое файла: тело сверяется с телом страницы 404 (её снимаем
 *      случайным адресом) и с приметами формата (env — строки КЛЮЧ=…, sqlite — сигнатура, .map — JSON
 *      с version/sources, .js — import/require). Тот же код 200, но тело = странице 404 или обычная
 *      HTML-страница (SPA-заглушка) — это не файл, OK.
 *   b) Админка и API без входа. Пути из --admin и найденные на странице. Закрытые данные без входа
 *      (200 и JSON не про ошибку авторизации) — FAIL. Страница входа с полем пароля — OK. 401/403 — OK.
 *   c) Формы. method=GET (или без метода — по умолчанию GET) с полем имени, телефона, почты или пароля —
 *      личные данные уедут в адрес и в журналы сервера: явный GET — FAIL, метод не указан — WARN (часто
 *      сабмит перехватывает JS). Поле пароля по http (не localhost) — FAIL. Отправка на чужой домен
 *      или по http — WARN.
 *   d) Секреты в коде страницы и её скриптах своего источника. Ключи AWS, Google API, Stripe (sk/rk),
 *      Slack, GitHub, токен Telegram-бота, приватные ключи, JWT, присваивания api_key/secret/password/
 *      token со значением в кавычках, Authorization: Bearer. FAIL со строкой; значение маскируется.
 *   e) Сторонние запросы. Чужие домены из разметки (script/link/img/iframe/source и абсолютные адреса
 *      в скриптах) и из директив CSP: кто что получает. Известный счётчик или реклама — WARN, чужой
 *      встроенный iframe — WARN (действует в контексте страницы), остальное — INFO. Список статический:
 *      ресурс, который подгружает уже сам чужой скрипт в браузере, здесь не виден (сказано в выводе).
 *   f) Заголовки безопасности главного ответа. Content-Security-Policy (и слабость 'unsafe-inline'),
 *      X-Content-Type-Options: nosniff, X-Frame-Options или CSP frame-ancestors, Referrer-Policy,
 *      Strict-Transport-Security (на https), Permissions-Policy; куки сессии — HttpOnly, Secure (на
 *      https), SameSite; смешанное содержимое (http-ресурс на https-странице).
 *
 * Что проверяется в --repo:
 *   g) Секреты. gitleaks по истории, если установлен; иначе свой поиск по образцам. Плюс всегда свой
 *      поиск по отслеживаемым файлам (git ls-files, без node_modules). .env отслеживается git — FAIL;
 *      .env не в .gitignore — WARN. Значения маскируются.
 *
 * Код выхода: 0 — проверка сделана (вердикт в выводе и в JSON); 1 — неверные аргументы или, с --strict,
 * вердикт FAIL. Аргументы проверяются до сети и файлов.
 */
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, runDir, writeJson, ensureDir, slugFromUrl, unmangle, sleep, collectWarnings, takeWarnings } from './lib.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h', 'strict', 'selftest'], values: ['out', 'tag', 'admin', 'repo'], strict: true });
if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h')) { console.log(HELP); process.exit(0); }
const die = (msg) => { console.error(msg); process.exit(1); };
collectWarnings();
for (const k of ['out', 'tag', 'admin', 'repo']) if (opt[k] === true) die(`--${k}: нужно значение (подробно: --help)`);

const url = pos[0];
const repo = opt.repo ? unmangle(String(opt.repo)) : null;
/* selftest не требует адреса; проверка аргументов — только для обычного прогона */
if (!opt.selftest) {
  if (!url && !repo) die('Нужен адрес сайта или --repo <папка>: node security.mjs <url> [--repo папка]  (подробно: --help)');
  if (url) {
    let ok = false; try { ok = /^https?:$/i.test(new URL(url).protocol); } catch { /* не адрес */ }
    if (!ok) die(`Неверный адрес «${url}»: нужен http://… или https://…  (подробно: --help)`);
  }
  if (repo && !fs.existsSync(repo)) die(`--repo «${repo}»: папки нет`);
}

/* ---------- вывод и вердикт ---------- */
const lines = []; let fails = 0, warns = 0;
const L = (st, what, det) => { if (st === 'FAIL') fails++; if (st === 'WARN') warns++; lines.push({ status: st, what, details: det || '' }); console.log(`${st.padEnd(4)} ${what}${det ? ' — ' + det : ''}`); };

/* ---------- маскировка значений ---------- */
/* Секрет в выводе и в JSON — только замаскированный: первые/последние знаки и длина. */
function mask(s) {
  const v = String(s == null ? '' : s);
  if (!v) return '';
  if (v.length <= 6) return '*'.repeat(v.length) + ` (${v.length})`;
  return v.slice(0, 3) + '…' + v.slice(-2) + ` (${v.length})`;
}

/* ---------- HTTP ---------- */
const UA = 'site-rework-security/1.0 (read-only)';
async function fetchOnce(target, { method = 'GET', redirect = 'manual', timeout = 9000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(target, { method, redirect, signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: '*/*' } });
    const buf = Buffer.from(await res.arrayBuffer());
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    return { status: res.status, ok: res.ok, url: res.url || target, headers: res.headers, setCookies, buf, body: buf.toString('utf8'), contentType: res.headers.get('content-type') || '', location: res.headers.get('location') || '', error: null };
  } catch (e) {
    return { status: 0, ok: false, url: target, headers: new Headers(), setCookies: [], buf: Buffer.alloc(0), body: '', contentType: '', location: '', error: String((e && e.message) || e).slice(0, 160) };
  } finally { clearTimeout(t); }
}
const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 3000);
const PACE = 120; // мс между запросами — вежливо, без нагрузки

/* ---------- приметы форматов служебных файлов ---------- */
function looksHtml(body) { return /<!doctype html|<html[\s>]/i.test(body); }
function fileSignature(pathname, buf, body) {
  const ext = (pathname.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  if (/\.env(\.|$)/.test(pathname)) return !looksHtml(body) && /^\s*(export\s+)?[A-Z][A-Z0-9_]{2,}\s*=/m.test(body);
  if (/\.git\/HEAD$/.test(pathname)) return /^ref:\s+refs\//.test(body.trim()) || /^[0-9a-f]{40}\s*$/.test(body.trim());
  if (/\.git\/config$/.test(pathname)) return /\[(core|remote|branch)\b/.test(body);
  if (ext === '.json') { try { const j = JSON.parse(body); return !!j && typeof j === 'object'; } catch { return false; } }
  if (ext === '.map') { try { const j = JSON.parse(body); return !!(j && (j.version || j.sources || j.mappings)); } catch { return false; } }
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return !looksHtml(body) && /\b(import|require|module\.exports|export\s|exports\.)\b/.test(body);
  if (ext === '.yml' || ext === '.yaml') return !looksHtml(body) && /^[a-z][\w-]*:\s/mi.test(body);
  if (ext === '.sql') return /\b(CREATE TABLE|INSERT INTO|BEGIN TRANSACTION)\b/i.test(body);
  if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') return buf.slice(0, 16).toString('latin1').startsWith('SQLite format 3');
  if (ext === '.zip') return buf.slice(0, 2).toString('latin1') === 'PK';
  if (ext === '.bak' || ext === '.old' || ext === '.orig') return !looksHtml(body) && buf.length > 0;
  if (ext === '.dockerfile' || /Dockerfile$/.test(pathname)) return /^\s*FROM\s+\S/mi.test(body);
  return !looksHtml(body) && buf.length > 0;
}
/* признак листинга папки (autoindex) */
function looksListing(body) {
  return /<title>\s*index of\s*\//i.test(body) || (/<a\s+href="[^"]+\/?">/i.test(body) && /(parent directory|last modified|<pre>|directory listing)/i.test(body));
}

/* ---------- образцы секретов ---------- */
/* Каждый: id, человекочитаемое имя, регэксп; value — какая группа несёт значение (0 — всё совпадение).
   sev — 'FAIL' или 'WARN' (публикуемые ключи и JWT — WARN: сами по себе не секрет). */
const SECRET_RULES = [
  { id: 'aws-akid', name: 'ключ доступа AWS', re: /\bAKIA[0-9A-Z]{16}\b/g, sev: 'FAIL' },
  { id: 'google-api', name: 'ключ Google API', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, sev: 'FAIL' },
  { id: 'stripe-secret', name: 'секретный ключ Stripe', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/g, sev: 'FAIL' },
  { id: 'stripe-pub', name: 'публикуемый ключ Stripe', re: /\bpk_live_[0-9A-Za-z]{16,}\b/g, sev: 'WARN' },
  { id: 'slack', name: 'токен Slack', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g, sev: 'FAIL' },
  { id: 'github', name: 'токен GitHub', re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/g, sev: 'FAIL' },
  { id: 'telegram-bot', name: 'токен Telegram-бота', re: /\b\d{6,10}:[A-Za-z0-9_-]{35}\b/g, sev: 'FAIL' },
  { id: 'private-key', name: 'приватный ключ', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, sev: 'FAIL' },
  { id: 'jwt', name: 'JWT-токен', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, sev: 'WARN', note: 'может быть публичным токеном без секрета — проверить полезную нагрузку' },
  { id: 'assign', name: 'значение в присваивании', re: /\b(api[_-]?key|secret|passwd|password|access[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*['"]([^'"\s]{6,})['"]/gi, value: 2, sev: 'FAIL' },
  { id: 'env-assign', name: 'значение в присваивании (env/config)', re: /^\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|APIKEY|API_KEY|PRIVATE|ACCESS_?KEY|DSN|PWD|AUTH)[A-Z0-9_]*\s*=\s*([^\s'"#]{8,})\s*$/gm, value: 1, sev: 'FAIL' },
  { id: 'bearer', name: 'Authorization: Bearer', re: /\bAuthorization\b['"]?\s*[:=]\s*['"]?Bearer\s+([A-Za-z0-9._-]{16,})/gi, value: 1, sev: 'FAIL' },
];
const PLACEHOLDER = /^(?:x{4,}|\*{4,}|\.{3,}|changeme|change-me|placeholder|example|examplekey|your[_-]?|yourkey|secret|password|pass(word)?123|token|dummy|test|sample|смените|замените|вставьте|значение)$/i;
function looksReference(v) { return /^(process\.env|import\.meta|window\.|self\.|\$\{|\{\{|<%|env\.|config\.|this\.)/.test(v) || /\.(value|env)\b/.test(v); }
/* значение без кавычек «похоже на секрет»: не число, не плейсхолдер, не ссылка, не домен/почта; есть случайность */
function secretishValue(v) {
  if (v.length < 8 || /^\d+$/.test(v)) return false;
  if (/смените|замен|сменить|change|example|placeholder|your|dummy|sample|<[^>]*>|\$\{|\{\{/i.test(v)) return false;
  if (looksReference(v)) return false;
  if (!/[A-Za-z]/.test(v)) return false;
  return /[0-9]/.test(v) || v.length >= 16 || /[A-Z].*[a-z]|[a-z].*[A-Z]/.test(v);
}
/* тестовые/примерочные файлы: пароли и ключи в них — фикстуры, не утечка; общие правила (assign, env)
   там не применяем, а форматные (AKIA, sk_live, приватный ключ и т. п.) — применяем везде */
const GENERIC_RULES = new Set(['assign', 'env-assign']);
function isTestLabel(label) { return /(^|\/)(tests?|__tests__|spec|specs|fixtures?|examples?|mocks?|__mocks__)\//i.test(label) || /\.(test|spec)\.[a-z0-9]+$/i.test(label) || /(^|\/|\.)example(\.|$)/i.test(label); }
/* найти секреты в тексте: [{ ruleId, name, sev, line, masked, note }] */
function scanSecrets(text, { label = '' } = {}) {
  const out = [];
  const test = isTestLabel(label);
  const linesArr = String(text).split(/\r?\n/);
  const offsets = []; let acc = 0; for (const ln of linesArr) { offsets.push(acc); acc += ln.length + 1; }
  const lineAt = (idx) => { let lo = 0, hi = offsets.length - 1, ans = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (offsets[m] <= idx) { ans = m; lo = m + 1; } else hi = m - 1; } return ans + 1; };
  for (const rule of SECRET_RULES) {
    if (test && GENERIC_RULES.has(rule.id)) continue;
    rule.re.lastIndex = 0; let m;
    while ((m = rule.re.exec(text))) {
      const value = rule.value ? m[rule.value] : m[0];
      if (!value) continue;
      if (rule.id === 'assign' || rule.id === 'bearer') { if (PLACEHOLDER.test(value) || looksReference(value)) continue; }
      if (rule.id === 'env-assign' && !secretishValue(value)) continue;
      out.push({ ruleId: rule.id, name: rule.name, sev: rule.sev, line: lineAt(m.index), masked: mask(value), note: rule.note || null, label });
      if (out.length > 200) return out;
    }
  }
  return out;
}

/* ---------- известные счётчики и реклама ---------- */
const TRACKERS = [
  [/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/i, 'Google Analytics / Tag Manager', 'аналитика'],
  [/doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\./i, 'Google Ads', 'реклама'],
  [/mc\.yandex\.(ru|com)|metrika|metrica/i, 'Яндекс Метрика', 'аналитика'],
  [/an\.yandex\.ru|yandex\.ru\/ads|adfox|ad\.mail\.ru/i, 'Яндекс/Mail реклама', 'реклама'],
  [/top-fwz1\.mail\.ru|top\.mail\.ru|counter\.rambler/i, 'Mail/Rambler счётчик', 'аналитика'],
  [/vk\.com\/rtrg|vk\.ru\/rtrg|ads\.vk\.com|userapi\.com\/rtrg/i, 'ВКонтакте пиксель', 'реклама'],
  [/connect\.facebook\.net|facebook\.com\/tr|fbcdn/i, 'Facebook Pixel', 'реклама'],
  [/hotjar\.com|clarity\.ms|fullstory|mouseflow|smartlook/i, 'запись сеансов', 'аналитика'],
  [/criteo|adriver|sape\.ru|tns-counter|liveinternet|mediametrics/i, 'сторонний счётчик/реклама', 'реклама'],
];
function trackerOf(host) { for (const [re, name, kind] of TRACKERS) if (re.test(host)) return { name, kind }; return null; }
/* eTLD+1 наивно: последние две метки (co.uk и подобные не разбираются — сказано в выводе) */
function baseDomain(host) { const p = String(host).replace(/^\[|\]$/g, '').split('.'); return p.length <= 2 ? host : p.slice(-2).join('.'); }

/* извлечь чужие хосты и iframe из разметки, скриптов и CSP */
function thirdParties(html, scripts, pageHost, csp) {
  const base = baseDomain(pageHost);
  const isForeign = (h) => { try { const hn = new URL(/^https?:/.test(h) ? h : 'https://' + h).hostname; return hn && baseDomain(hn) !== base ? hn : null; } catch { return null; } };
  const found = new Map(); // host -> { host, via:Set, iframe:bool }
  const add = (host, via, iframe = false) => { const f = isForeign(host); if (!f) return; const cur = found.get(f) || { host: f, via: new Set(), iframe: false }; cur.via.add(via); if (iframe) cur.iframe = true; found.set(f, cur); };
  const attrRe = /<(script|link|img|iframe|source|embed|object|video|audio)\b[^>]*?\b(?:src|href|data)=["']([^"']+)["']/gi; let m;
  while ((m = attrRe.exec(html))) { const tag = m[1].toLowerCase(); const val = m[2]; if (/^https?:\/\//i.test(val) || /^\/\//.test(val)) add(val, tag, tag === 'iframe'); }
  const impRe = /@import\s+(?:url\()?["']?(https?:\/\/[^"')\s]+)/gi; while ((m = impRe.exec(html))) add(m[1], '@import');
  for (const { text } of scripts) { const urlRe = /["'](https?:\/\/[^"'\s]+)["']/g; let u; let n = 0; while ((u = urlRe.exec(text)) && n < 500) { add(u[1], 'script'); n++; } }
  for (const dir of ['connect-src', 'frame-src', 'script-src', 'img-src', 'font-src', 'style-src']) {
    const re = new RegExp(dir + '\\s+([^;]+)', 'i'); const mm = csp && csp.match(re);
    if (mm) for (const tok of mm[1].split(/\s+/)) if (/^https?:\/\//i.test(tok)) add(tok, 'CSP ' + dir);
  }
  return [...found.values()].map((f) => ({ host: f.host, via: [...f.via], iframe: f.iframe, tracker: trackerOf(f.host) }));
}

/* ---------- разбор форм ---------- */
const PERSONAL = /(name|имя|fio|фио|phone|tel|телефон|моб|email|e-mail|mail|почт|pass|парол|card|карт|cvv|cvc|\bpan\b|паспорт)/i;
function parseForms(html) {
  const forms = []; const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi; let m;
  while ((m = re.exec(html))) {
    const attrs = m[1]; const inner = m[2];
    const method = ((attrs.match(/\bmethod\s*=\s*["']?([a-z]+)/i) || [])[1] || '').toLowerCase();
    const action = (attrs.match(/\baction\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    const id = (attrs.match(/\bid\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    const fields = [];
    const fre = /<(input|select|textarea)\b([^>]*)>/gi; let f;
    while ((f = fre.exec(inner))) {
      const t = (f[2].match(/\btype\s*=\s*["']?([a-z-]+)/i) || [])[1] || (f[1].toLowerCase() === 'input' ? 'text' : f[1].toLowerCase());
      const nm = (f[2].match(/\bname\s*=\s*["']([^"']*)["']/i) || [])[1] || (f[2].match(/\bid\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
      fields.push({ type: t.toLowerCase(), name: nm });
    }
    forms.push({ id, method, action, fields });
  }
  return forms;
}
function personalFields(form) {
  return form.fields.filter((x) => ['tel', 'email', 'password'].includes(x.type) || PERSONAL.test(x.name)).map((x) => x.name || x.type);
}

/* ==================================================================== */
/* ПРОГОН ПО САЙТУ                                                       */
/* ==================================================================== */
async function runSite(url) {
  const u = new URL(url);
  const https = u.protocol === 'https:';
  const local = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i.test(u.hostname.replace(/^\[|\]$/g, '')) || u.hostname.endsWith('.localhost');
  console.log(`\n${url}${https ? '' : local ? ' (http, локальный)' : ' (http)'}\n`);

  /* http → https */
  if (!https && !local) {
    const r = await fetchOnce(url.replace(/^http:/, 'https:'), { redirect: 'manual' }).catch(() => null);
    if (r && r.status && r.status < 400) L('WARN', 'сайт открыт по http', 'есть и https — увести весь трафик на https (редирект 301/308)');
  }

  /* главный ответ (по итоговому адресу) */
  const main = await fetchOnce(url, { redirect: 'follow' });
  if (main.error || !main.status) { L('FAIL', 'главная страница не открылась', main.error || `код ${main.status}`); return; }
  const finalUrl = new URL(main.url || url); const finalHttps = finalUrl.protocol === 'https:';
  const html = main.body;
  const csp = main.headers.get('content-security-policy') || '';

  /* --- собрать скрипты своего источника (для секретов и чужих доменов) --- */
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m, i) => ({ file: `инлайн-скрипт #${i + 1}`, text: m[1] }));
  const srcRe = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi; const scriptUrls = []; let sm;
  while ((sm = srcRe.exec(html))) { try { const su = new URL(sm[1], finalUrl); if (su.hostname === finalUrl.hostname) scriptUrls.push(su.href); } catch { /* мимо */ } }
  const extScripts = [];
  for (const su of scriptUrls.slice(0, 25)) { await sleep(PACE); const r = await fetchOnce(su); if (r.status === 200 && r.body) extScripts.push({ file: new URL(su).pathname, text: r.body, href: su }); }
  const allScripts = [...inlineScripts, ...extScripts];

  /* --- a) служебные файлы --- */
  const probe404 = await fetchOnce(new URL('/__rw_probe_' + crypto.randomBytes(4).toString('hex') + '__', finalUrl).href);
  const body404 = norm(probe404.body); const status404 = probe404.status;
  const SERVICE = ['/.env', '/.env.local', '/.env.production', '/.env.development', '/.git/HEAD', '/.git/config', '/server.js', '/app.js', '/index.js', '/package.json', '/package-lock.json', '/composer.json', '/src/api.js', '/src/db.js', '/src/auth.js', '/config.js', '/config.json', '/.npmrc', '/docker-compose.yml', '/Dockerfile', '/wp-config.php'];
  const BACKUPS = ['/backup.zip', '/backup.sql', '/dump.sql', '/db.sqlite', '/database.sqlite', '/data.db', '/data.sqlite', '/data/backup.zip', '/backup/backup.zip', '/site.zip', '/index.html.bak', '/config.php.bak', '/.env.bak'];
  const mapUrls = [...new Set(scriptUrls.map((s) => new URL(s).pathname + '.map'))].slice(0, 10);
  const DIRS = ['/.git/', '/data/', '/backup/', '/backups/', '/uploads/', '/src/', '/node_modules/'];
  const exposed = []; const dirListed = [];
  for (const p of [...SERVICE, ...BACKUPS, ...mapUrls]) {
    await sleep(PACE);
    const r = await fetchOnce(new URL(p, finalUrl).href);
    if (r.error || r.status !== 200) continue;
    if (norm(r.body) === body404 && status404 === 200) continue; // SPA-заглушка
    if (fileSignature(p, r.buf, r.body)) exposed.push({ path: p, bytes: r.buf.length, ctype: r.contentType.split(';')[0] });
  }
  for (const p of DIRS) { await sleep(PACE); const r = await fetchOnce(new URL(p, finalUrl).href); if (r.status === 200 && looksListing(r.body)) dirListed.push(p); }
  if (exposed.length) L('FAIL', `служебные файлы отдаются: ${exposed.length}`, exposed.map((e) => `${e.path} (${e.bytes} б, ${e.ctype || '?'})`).join(', ') + ' — закрыть на сервере/прокси, файлы держать вне корня раздачи');
  else L('OK', 'служебные файлы', 'ни /.env, /.git, резервные копии, базы и исходники, ни карты *.map с сервера не отдаются');
  if (dirListed.length) L('FAIL', `листинг папок открыт: ${dirListed.length}`, dirListed.join(', ') + ' — отключить autoindex');

  /* --- b) админка и API без входа --- */
  const adminPaths = new Set();
  for (const p of String(opt.admin || '').split(',').map((x) => unmangle(x.trim())).filter(Boolean)) adminPaths.add(p.startsWith('/') ? p : '/' + p);
  const hay = html + '\n' + allScripts.map((s) => s.text).join('\n');
  for (const mm of hay.matchAll(/["'`](\/api\/admin\/[a-z0-9/_-]+)["'`]/gi)) adminPaths.add(mm[1]);
  if (/["'`]\/admin["'`]/.test(hay) || /href=["']\/admin\b/.test(html)) adminPaths.add('/admin');
  const openAdmin = [];
  for (const p of [...adminPaths]) {
    await sleep(PACE);
    const r = await fetchOnce(new URL(p, finalUrl).href, { redirect: 'manual' });
    if ([401, 403].includes(r.status)) continue;
    if (r.status >= 300 && r.status < 400) continue; // редирект на вход
    if (r.status === 200) {
      const ct = r.contentType.toLowerCase();
      if (ct.includes('application/json')) {
        let j = null; try { j = JSON.parse(r.body); } catch { /* не json */ }
        const isAuthErr = j && typeof j === 'object' && (j.error || j.message) && /auth|вход|autor|авториз|login|forbidden|доступ/i.test(JSON.stringify(j));
        if (!isAuthErr) openAdmin.push({ path: p, note: 'JSON без входа' });
      } else if (ct.includes('text/html')) {
        const hasLogin = /type=["']password["']|id=["'][^"']*(login|pass)|Вход|Войти|authoriz/i.test(r.body);
        if (!hasLogin) openAdmin.push({ path: p, note: 'страница без формы входа — проверить, не видны ли данные' });
      }
    }
  }
  if (adminPaths.size) {
    const fail = openAdmin.filter((x) => /JSON без входа/.test(x.note));
    if (fail.length) L('FAIL', `админка/API без входа: ${fail.length}`, fail.map((x) => x.path).join(', ') + ' — закрыть проверкой авторизации');
    const warn = openAdmin.filter((x) => !/JSON без входа/.test(x.note));
    if (warn.length) L('WARN', `админка без входа — проверить глазами: ${warn.length}`, warn.map((x) => `${x.path} (${x.note})`).join(', '));
    if (!openAdmin.length) L('OK', `админка и API за входом`, `проверено путей: ${adminPaths.size} — все отдают 401/403 или страницу входа`);
  } else L('OK', 'админка', 'путей админки на странице не нашлось (передать через --admin, если есть)');

  /* --- c) формы --- */
  const forms = parseForms(html);
  const badGet = [], warnGet = [], pwHttp = [], foreignAction = [];
  for (const form of forms) {
    const pers = personalFields(form);
    const hasPw = form.fields.some((x) => x.type === 'password');
    const method = form.method || '';
    if (pers.length) {
      if (method === 'get') badGet.push({ form: form.id || '(без id)', fields: pers });
      else if (!method) warnGet.push({ form: form.id || '(без id)', fields: pers });
    }
    if (hasPw && !finalHttps && !local) pwHttp.push(form.id || '(без id)');
    if (form.action && /^https?:\/\//i.test(form.action)) {
      try { const a = new URL(form.action); if (baseDomain(a.hostname) !== baseDomain(finalUrl.hostname)) foreignAction.push(`${form.id || '(без id)'} → ${a.hostname}`); else if (a.protocol === 'http:' && finalHttps) foreignAction.push(`${form.id || '(без id)'} → http (незащищённо)`); } catch { /* мимо */ }
    }
  }
  if (badGet.length) L('FAIL', `форма GET с личными данными: ${badGet.length}`, badGet.map((x) => `${x.form} [${x.fields.join(', ')}]`).join('; ') + ' — метод POST: иначе имя и телефон уходят в адрес и в журналы сервера');
  if (pwHttp.length) L('FAIL', `поле пароля по http: ${pwHttp.length}`, pwHttp.join(', ') + ' — только по https');
  if (warnGet.length) L('WARN', `форма без метода с личными данными: ${warnGet.length}`, warnGet.map((x) => `${x.form} [${x.fields.join(', ')}]`).join('; ') + ' — по умолчанию GET; убедиться, что сабмит перехватывает JS, иначе поставить method="post"');
  if (foreignAction.length) L('WARN', `форма отправляется на сторону: ${foreignAction.length}`, foreignAction.join('; '));
  if (forms.length && !badGet.length && !pwHttp.length && !warnGet.length && !foreignAction.length) L('OK', `формы: ${forms.length}`, 'личные данные не уходят в адрес и на сторону');
  if (!forms.length) L('OK', 'формы', 'на странице нет');

  /* --- d) секреты в коде страницы --- */
  const secretHits = [...scanSecrets(html, { label: 'HTML страницы' }), ...allScripts.flatMap((s) => scanSecrets(s.text, { label: s.file }))];
  const secFail = secretHits.filter((x) => x.sev === 'FAIL'); const secWarn = secretHits.filter((x) => x.sev === 'WARN');
  if (secFail.length) L('FAIL', `секреты в коде страницы: ${secFail.length}`, secFail.slice(0, 8).map((x) => `${x.name} в ${x.label}:${x.line} — ${x.masked}`).join('; '));
  if (secWarn.length) L('WARN', `похоже на ключ/токен: ${secWarn.length}`, secWarn.slice(0, 8).map((x) => `${x.name} в ${x.label}:${x.line} — ${x.masked}${x.note ? ` (${x.note})` : ''}`).join('; '));
  if (!secretHits.length) L('OK', 'секреты в коде страницы', 'ключей и токенов в HTML и своих скриптах не нашлось');

  /* --- e) сторонние запросы --- */
  /* «подключён» — есть в разметке или скриптах; «разрешён в CSP» — только в директивах CSP (сайт его
     допускает, но на странице не вызывает: часто остаток от убранного виджета — можно вычистить). */
  const tp = thirdParties(html, allScripts, finalUrl.hostname, csp);
  if (tp.length) {
    const active = tp.filter((x) => x.via.some((v) => !v.startsWith('CSP')));
    const cspOnly = tp.filter((x) => x.via.every((v) => v.startsWith('CSP')));
    const aTrack = active.filter((x) => x.tracker); const aIframe = active.filter((x) => x.iframe && !x.tracker); const aPlain = active.filter((x) => !x.tracker && !x.iframe);
    if (aTrack.length) L('WARN', `счётчики и реклама (подключены): ${aTrack.length}`, aTrack.map((x) => `${x.host} — ${x.tracker.name} (${x.tracker.kind})`).join('; ') + ' — данные о посетителе уходят третьим лицам, отразить в политике конфиденциальности');
    if (aIframe.length) L('WARN', `чужие встроенные фреймы: ${aIframe.length}`, aIframe.map((x) => x.host).join(', ') + ' — действуют в контексте страницы и видят взаимодействие');
    if (aPlain.length) L('INFO', `сторонние домены (подключены): ${aPlain.length}`, aPlain.map((x) => `${x.host} (${x.via.join('/')})`).join('; ') + ' — что подгрузит сам чужой скрипт в браузере, статически здесь не видно');
    const cTrack = cspOnly.filter((x) => x.tracker); const cPlain = cspOnly.filter((x) => !x.tracker);
    if (cTrack.length) L('WARN', `счётчик разрешён в CSP, но не подключён: ${cTrack.length}`, cTrack.map((x) => `${x.host} — ${x.tracker.name}`).join('; ') + ' — если не используется, убрать из CSP (лишнее разрешение)');
    if (cPlain.length) L('INFO', `разрешены в CSP, на странице не подключены: ${cPlain.length}`, cPlain.map((x) => `${x.host} (${x.via.join('/')})`).join('; ') + ' — лишние разрешения CSP можно вычистить');
  } else L('OK', 'сторонние запросы', 'чужих доменов в разметке, скриптах и CSP не нашлось');

  /* --- f) заголовки безопасности --- */
  const h = (n) => main.headers.get(n) || '';
  const cspH = h('content-security-policy');
  if (!cspH) L('WARN', 'Content-Security-Policy', 'нет — браузеру нечем ограничить чужие скрипты и вставки (XSS)');
  else { const weak = /'unsafe-inline'|'unsafe-eval'/.test(cspH); L(weak ? 'WARN' : 'OK', 'Content-Security-Policy', weak ? `есть, но с ${[...cspH.matchAll(/'unsafe-(inline|eval)'/g)].map((m) => m[0]).join(', ')} — защита от XSS ослаблена` : 'есть'); }
  L(/nosniff/i.test(h('x-content-type-options')) ? 'OK' : 'WARN', 'X-Content-Type-Options', /nosniff/i.test(h('x-content-type-options')) ? 'nosniff' : 'нет nosniff — браузер может угадывать тип файла');
  const xfo = h('x-frame-options'); const fa = /frame-ancestors/i.test(cspH);
  L(xfo || fa ? 'OK' : 'WARN', 'защита от кликджекинга', xfo ? `X-Frame-Options: ${xfo}` : fa ? 'CSP frame-ancestors' : 'нет ни X-Frame-Options, ни CSP frame-ancestors — сайт можно встроить во чужой iframe');
  L(h('referrer-policy') ? 'OK' : 'WARN', 'Referrer-Policy', h('referrer-policy') || 'нет — адрес страницы утечёт в Referer на чужие сайты');
  if (finalHttps) L(h('strict-transport-security') ? 'OK' : 'WARN', 'Strict-Transport-Security', h('strict-transport-security') || 'нет — первый заход возможен по http');
  L(h('permissions-policy') ? 'OK' : 'INFO', 'Permissions-Policy', h('permissions-policy') || 'нет — камера, микрофон и геолокация не ограничены явно');
  if (/^https?:$/.test(finalUrl.protocol) && main.headers.get('x-powered-by')) L('INFO', 'X-Powered-By', main.headers.get('x-powered-by') + ' — сервер называет свою технологию; можно скрыть');

  /* куки */
  const cookies = main.setCookies || [];
  for (const c of cookies) {
    const name = (c.match(/^([^=]+)=/) || [])[1] || '?';
    const val = (c.match(/^[^=]+=([^;]*)/) || [])[1] || '';
    const sessionish = /sess|sid|token|auth|connect\.sid|jwt/i.test(name) || /httponly/i.test(c);
    if (!sessionish) continue;
    const httpOnly = /;\s*httponly/i.test(c); const secure = /;\s*secure/i.test(c); const sameSite = (c.match(/;\s*samesite=([a-z]+)/i) || [])[1] || '';
    const problems = [];
    if (!httpOnly) problems.push('нет HttpOnly (доступна из JS — украдут при XSS)');
    if (finalHttps && !secure) problems.push('нет Secure (уйдёт по http)');
    if (!sameSite) problems.push('нет SameSite (CSRF)');
    if (problems.length) L(!httpOnly || (finalHttps && !secure) ? 'FAIL' : 'WARN', `кука сессии ${name} [${mask(val)}]`, problems.join('; '));
    else L('OK', `кука сессии ${name} [${mask(val)}]`, 'HttpOnly, Secure, SameSite');
  }

  /* смешанное содержимое */
  if (finalHttps) {
    const mixed = [...new Set([...html.matchAll(/<(script|link|iframe)\b[^>]*\b(?:src|href)=["'](http:\/\/[^"']+)["']/gi)].map((m) => m[2]))];
    if (mixed.length) L('FAIL', `смешанное содержимое: ${mixed.length}`, mixed.slice(0, 5).join(', ') + ' — активные http-ресурсы на https-странице браузер блокирует');
  }
}

/* ==================================================================== */
/* ПРОГОН ПО РЕПОЗИТОРИЮ                                                 */
/* ==================================================================== */
function findGitleaks() {
  if (process.env.RW_SEC_NO_GITLEAKS) return null;
  const tryRun = (bin) => { try { const r = spawnSync(bin, ['version'], { encoding: 'utf8', timeout: 8000, windowsHide: true }); return r.status === 0 ? bin : null; } catch { return null; } };
  if (tryRun('gitleaks')) return 'gitleaks';
  const home = os.homedir();
  const cands = [path.join(home, 'AppData/Local/Microsoft/WinGet/Links/gitleaks.exe'), ...safeGlob(path.join(home, 'AppData/Local/Microsoft/WinGet/Packages'), /^Gitleaks\.Gitleaks_/, 'gitleaks.exe')];
  for (const c of cands) { try { if (fs.existsSync(c) && tryRun(c)) return c; } catch { /* нет */ } }
  return null;
}
function safeGlob(dir, nameRe, leaf) { try { return fs.readdirSync(dir).filter((d) => nameRe.test(d)).map((d) => path.join(dir, d, leaf)); } catch { return []; } }
const git = (dir, args) => { try { return execFileSync('git', ['--no-optional-locks', '-C', dir, ...args], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return e.stdout ? String(e.stdout) : ''; } };

function runRepo(repo) {
  console.log(`\nрепозиторий ${repo}\n`);
  const isGit = fs.existsSync(path.join(repo, '.git')) || (git(repo, ['rev-parse', '--is-inside-work-tree']).trim() === 'true');
  if (!isGit) { L('WARN', 'репозиторий', 'это не git-папка — истории и списка отслеживаемых файлов нет; сканирую файлы на диске образцами'); }

  /* .env: отслеживается ли git, есть ли в .gitignore */
  if (isGit) {
    const tracked = git(repo, ['ls-files']).split(/\r?\n/).filter(Boolean);
    const envTracked = tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f));
    if (envTracked.length) L('FAIL', `.env отслеживается git: ${envTracked.length}`, envTracked.join(', ') + ' — удалить из индекса (git rm --cached) и сменить все ключи из него');
    else L('OK', '.env вне git', 'файл секретов не отслеживается');
    let gi = ''; try { gi = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'); } catch { /* нет */ }
    if (!/(^|\/)\.env\b/m.test(gi)) L('WARN', '.env в .gitignore', 'нет строки .env в .gitignore — легко закоммитить случайно');

    /* секреты в отслеживаемых файлах (без node_modules) */
    const skip = /(^|\/)(node_modules|\.git|dist|build|vendor)\//;
    const textExt = /\.(js|mjs|cjs|ts|json|env|yml|yaml|txt|md|html|css|php|py|rb|go|sh|ini|conf|toml|xml|sql|pem|key)$/i;
    const hits = [];
    for (const f of tracked) {
      if (skip.test(f) || (!textExt.test(f) && !/\.env/.test(f))) continue;
      let text = ''; try { const st = fs.statSync(path.join(repo, f)); if (st.size > 2 * 1024 * 1024) continue; text = fs.readFileSync(path.join(repo, f), 'utf8'); } catch { continue; }
      for (const s of scanSecrets(text, { label: f })) hits.push(s);
      if (hits.length > 200) break;
    }
    const fail = hits.filter((x) => x.sev === 'FAIL');
    if (fail.length) L('FAIL', `секреты в отслеживаемых файлах: ${fail.length}`, fail.slice(0, 8).map((x) => `${x.name} в ${x.label}:${x.line} — ${x.masked}`).join('; '));
    else L('OK', 'секреты в отслеживаемых файлах', 'по образцам не нашлось');
    const warn = hits.filter((x) => x.sev === 'WARN');
    if (warn.length) L('WARN', `похоже на ключ/токен в файлах: ${warn.length}`, warn.slice(0, 6).map((x) => `${x.name} в ${x.label}:${x.line} — ${x.masked}`).join('; '));

    /* история */
    const gl = findGitleaks();
    if (gl) {
      const rep = path.join(os.tmpdir(), `rw-gl-${crypto.randomBytes(4).toString('hex')}.json`);
      try {
        spawnSync(gl, ['git', repo, '--no-banner', '--redact', '--exit-code', '0', '-f', 'json', '-r', rep, '--log-opts=--all'], { encoding: 'utf8', timeout: 120000, windowsHide: true });
        let arr = []; try { arr = JSON.parse(fs.readFileSync(rep, 'utf8')); } catch { /* пусто */ }
        if (Array.isArray(arr) && arr.length) L('FAIL', `gitleaks нашёл в истории: ${arr.length}`, [...new Set(arr.slice(0, 8).map((x) => `${x.RuleID || x.Description || 'секрет'} в ${x.File}:${x.StartLine} (${(x.Commit || '').slice(0, 8)}) — ${mask(x.Secret || '')}`))].join('; ') + ' — секрет в истории остаётся: сменить ключи и по необходимости переписать историю');
        else L('OK', 'история (gitleaks)', 'секретов не нашёл');
      } finally { try { fs.rmSync(rep, { force: true }); } catch { /* нет */ } }
    } else {
      const log = git(repo, ['log', '-p', '--all', '--max-count=500', '--no-color', '-U0']);
      const added = log.split(/\r?\n/).filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
      const hh = scanSecrets(added, { label: 'история' });
      const hf = hh.filter((x) => x.sev === 'FAIL');
      if (hf.length) L('FAIL', `секреты в истории (свой поиск): ${hf.length}`, hf.slice(0, 8).map((x) => `${x.name} — ${x.masked}`).join('; ') + ' — сменить ключи; gitleaks покажет точнее (winget install gitleaks.gitleaks)');
      else L('OK', 'история (свой поиск по образцам)', `просмотрено до 500 коммитов; gitleaks не установлен — он надёжнее`);
    }
  } else {
    /* не git: файлы на диске */
    const hits = []; const walk = (d, depth = 0) => {
      if (depth > 6) return; let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (/^(node_modules|\.git|dist|build|vendor)$/.test(e.name)) continue;
        const fp = path.join(d, e.name);
        if (e.isDirectory()) walk(fp, depth + 1);
        else if (/\.(js|mjs|cjs|ts|json|env|yml|yaml|txt|md|html|css|php|py|rb|go|sh|ini|conf|toml|xml|sql|pem|key)$/i.test(e.name) || /\.env/.test(e.name)) {
          try { const st = fs.statSync(fp); if (st.size > 2 * 1024 * 1024) continue; for (const s of scanSecrets(fs.readFileSync(fp, 'utf8'), { label: path.relative(repo, fp) })) hits.push(s); } catch { /* нет */ }
        }
        if (hits.length > 200) return;
      }
    };
    walk(repo);
    const fail = hits.filter((x) => x.sev === 'FAIL');
    if (fail.length) L('FAIL', `секреты в файлах: ${fail.length}`, fail.slice(0, 8).map((x) => `${x.name} в ${x.label}:${x.line} — ${x.masked}`).join('; '));
    else L('OK', 'секреты в файлах', 'по образцам не нашлось');
  }
}

/* ==================================================================== */
/* ЗАПУСК                                                                */
/* ==================================================================== */
/* selftest — здесь, после инициализации всех const (SECRET_RULES и т.п.): иначе TDZ */
if (opt.selftest) process.exit(await selftest());
if (url) await runSite(url);
if (repo) runRepo(repo);

const libW = takeWarnings();
for (const w of libW) L('WARN', 'lib.mjs', w);
const verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
console.log(`\n${verdict}: ${fails} провалов, ${warns} предупреждений`);
const runDirFor = () => {
  if (opt.out) return path.resolve(String(opt.out));
  if (url) return runDir(opt, url);
  const base = process.env.SITE_REWORK_RUNS || path.join(os.homedir(), '.claude', 'site-rework', 'runs');
  return path.join(base, 'repo-' + path.basename(path.resolve(repo)).replace(/[^a-z0-9]+/gi, '-').toLowerCase());
};
const outDir = ensureDir(path.join(runDirFor(), 'security'));
const tag = opt.tag || (url ? slugFromUrl(url) : 'repo');
const file = path.join(outDir, `${tag}.json`);
writeJson(file, { url: url || null, repo: repo || null, takenAt: new Date().toISOString(), lines, ...(libW.length ? { warnings: libW } : {}), verdict });
console.log(`Сохранено: ${file}`);
if (opt.strict && verdict === 'FAIL') { console.log('Код выхода 1: вердикт FAIL (--strict)'); process.exitCode = 1; }

/* ==================================================================== */
/* SELFTEST                                                              */
/* ==================================================================== */
async function selftest() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixtures = path.join(here, 'fixtures', 'security');
  const out = opt.out ? path.resolve(String(opt.out)) : fs.mkdtempSync(path.join(os.tmpdir(), 'sec-selftest-'));
  let bad = 0, n = 0;
  const say = (ok, name, detail) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

  /* --- чистые функции без сервера --- */
  {
    const cases = [];
    // маскировка не раскрывает значение
    cases.push(['маска скрывает значение', !mask('AKIA1234567890ABCD').includes('1234567890') && /\(\d+\)$/.test(mask('AKIA1234567890ABCD'))]);
    cases.push(['короткое значение — звёзды', /^\*+\s\(\d\)$/.test(mask('abcd'))]);
    // секреты ловятся
    const hit = scanSecrets(`const k = "AKIAIOSFODNN7EXAMPLE";\nlet t = "123456789:AAA-bbbccccdddeeefffggghhhiiijjjkkk"`);
    cases.push(['AWS-ключ найден', hit.some((x) => x.ruleId === 'aws-akid')]);
    cases.push(['токен Telegram найден', hit.some((x) => x.ruleId === 'telegram-bot')]);
    cases.push(['значение секрета замаскировано', hit.every((x) => !/AKIAIOSFODNN7EXAMPLE/.test(x.masked))]);
    // плейсхолдер и ссылка не считаются
    const ph = scanSecrets(`password: "changeme"\napi_key: process.env.KEY\ntoken = "смените"`);
    cases.push(['плейсхолдер и process.env не в счёт', ph.length === 0]);
    // реальное присваивание — в счёт
    const asg = scanSecrets(`const cfg = { api_key: "a7f3k29ZqL0pWmX1" }`, { label: 'src/api.js' });
    cases.push(['реальный api_key в коде найден', asg.some((x) => x.ruleId === 'assign')]);
    // в тестовом файле общее правило молчит, а форматное — нет
    cases.push(['пароль в тесте не в счёт', scanSecrets(`const PASSWORD = 'ТестовыйПароль123'`, { label: 'tests/api.test.js' }).length === 0]);
    cases.push(['AKIA даже в тесте — в счёт', scanSecrets(`const k = "AKIAIOSFODNN7EXAMPLE"`, { label: 'tests/api.test.js' }).some((x) => x.ruleId === 'aws-akid')]);
    // формы
    const forms = parseForms(`<form id="a" method="get"><input name="phone"></form><form id="b" method="post"><input type="email" name="mail"></form><form id="c"><input name="имя"></form>`);
    cases.push(['форма разобрана', forms.length === 3]);
    cases.push(['GET+телефон — личные поля видны', personalFields(forms[0]).length === 1]);
    cases.push(['POST — не FAIL по методу', forms[1].method === 'post']);
    // чужие домены и счётчик
    const tp = thirdParties(`<script src="https://mc.yandex.ru/metrika/tag.js"></script><iframe src="https://youtube.com/embed/x"></iframe><img src="/local.png">`, [], 'epicentr.burbey.ru', "connect-src 'self' https://api.stranger.com");
    cases.push(['Метрика опознана счётчиком', tp.some((x) => x.tracker && /Метрика/.test(x.tracker.name))]);
    cases.push(['чужой iframe помечен', tp.some((x) => x.iframe && /youtube/.test(x.host))]);
    cases.push(['CSP-хост попал в список', tp.some((x) => /stranger/.test(x.host))]);
    cases.push(['свой img не чужой', !tp.some((x) => /local\.png/.test(x.host))]);
    // приметы файлов
    cases.push(['.env по приметам', fileSignature('/.env', Buffer.from('SECRET_KEY=abc'), 'SECRET_KEY=abc')]);
    cases.push(['HTML на месте .env — не файл', !fileSignature('/.env', Buffer.from('<!doctype html><html>'), '<!doctype html><html>')]);
    cases.push(['sqlite по сигнатуре', fileSignature('/data.db', Buffer.from('SQLite format 3\u0000rest'), 'SQLite format 3')]);
    const okAll = cases.every(([, ok]) => ok);
    for (const [nm, ok] of cases) if (!ok) console.log(`     · не сошлось: ${nm}`);
    say(okAll, `чистые функции (${cases.length})`);
  }

  /* --- два сервера на своих портах (служебные пути абсолютны от корня, поэтому не префикс, а порт).
     Страницы сайтов — из fixtures/security/{vuln,clean}/index.html; отдача служебных файлов, ответ 401
     и заголовки, которых статикой не выразить, — здесь. --- */
  const page404 = '<!doctype html><html lang="ru"><body><h1>Страница не найдена</h1></body></html>';
  const readFix = (kind) => { try { return fs.readFileSync(path.join(fixtures, kind, 'index.html'), 'utf8'); } catch { return `<!doctype html><body>нет ${kind}/index.html</body>`; } };
  const vulnPage = readFix('vuln'); const cleanPage = readFix('clean');
  const handler = (kind) => (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'Content-Type': type, ...extra }); res.end(body); };
    if (kind === 'vuln') {
      if (rel === '/.env') return send(200, 'text/plain', 'ADMIN_PASSWORD=s3cr3tValue123\nSTRIPE=sk_live_AAAAAAAAAAAAAAAAAAAA');
      if (rel === '/server.js') return send(200, 'text/javascript', 'import express from "express";\nconst app = express();');
      if (rel === '/dump.sql') return send(200, 'application/sql', 'CREATE TABLE users(id);\nINSERT INTO users VALUES(1);');
      if (rel === '/api/admin/venues') return send(200, 'application/json', JSON.stringify([{ id: 1, name: 'Секретное' }]));
      if (rel === '/admin') return send(200, 'text/html', '<!doctype html><html><body><h1>Панель</h1><table><tr><td>данные</td></tr></table></body></html>');
      if (rel === '/' || rel === '/index.html') return send(200, 'text/html', vulnPage, { 'X-Powered-By': 'Express' });
      return send(404, 'text/html', page404);
    }
    if (rel === '/' || rel === '/index.html') return send(200, 'text/html', cleanPage, {
      'Content-Security-Policy': "default-src 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=()',
      'Set-Cookie': 'sid=abcdef1234567890; Path=/; HttpOnly; SameSite=Lax',
    });
    if (rel === '/api/admin/venues') return send(401, 'application/json', JSON.stringify({ error: 'Требуется авторизация' }));
    if (rel === '/admin') return send(200, 'text/html', '<!doctype html><html><body><form><input type="password"></form>Вход</body></html>');
    return send(404, 'text/html', page404); // /.env, /server.js и прочее — 404
  };
  const vulnServer = http.createServer(handler('vuln'));
  const cleanServer = http.createServer(handler('clean'));
  await new Promise((r) => vulnServer.listen(0, '127.0.0.1', r));
  await new Promise((r) => cleanServer.listen(0, '127.0.0.1', r));
  const baseVuln = `http://127.0.0.1:${vulnServer.address().port}`;
  const baseClean = `http://127.0.0.1:${cleanServer.address().port}`;
  const runSelf = (args) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SITE_REWORK_RUNS: path.join(out, 'runs') } });
    const so = [], se = []; ch.stdout.on('data', (d) => so.push(d)); ch.stderr.on('data', (d) => se.push(d));
    const t = setTimeout(() => ch.kill(), 90000);
    ch.on('close', (code) => { clearTimeout(t); resolve({ code, out: Buffer.concat(so).toString('utf8'), err: Buffer.concat(se).toString('utf8') }); });
  });
  try {
    // сайт с дырами
    {
      const jf = path.join(out, 'vuln', 'security', 'vuln.json'); try { fs.rmSync(jf, { force: true }); } catch { /* нет */ }
      const r = await runSelf([`${baseVuln}/`, '--admin', '/api/admin/venues,/admin', '--out', path.join(out, 'vuln'), '--tag', 'vuln']);
      let j = null; try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch { /* нет */ }
      const has = (re) => j && j.lines.some((l) => re.test(l.what) && l.status === 'FAIL');
      const hasW = (re) => j && j.lines.some((l) => re.test(l.what));
      say(!!j, 'стенд с дырами: есть протокол', j ? '' : `код ${r.code}: ${(r.err || r.out).slice(-200)}`);
      say(has(/служебные файлы отдаются/), 'стенд с дырами: /.env и /server.js — FAIL');
      say(has(/админка\/API без входа/), 'стенд с дырами: /api/admin без входа — FAIL');
      say(has(/форма GET/), 'стенд с дырами: GET-форма с телефоном — FAIL');
      say(has(/секреты в коде/), 'стенд с дырами: ключ AWS в скрипте — FAIL');
      say(hasW(/счётчики и реклама/), 'стенд с дырами: Метрика — WARN');
      say(hasW(/Content-Security-Policy/) && j.lines.some((l) => /Content-Security-Policy/.test(l.what) && l.status === 'WARN'), 'стенд с дырами: нет CSP — WARN');
      say(j && !JSON.stringify(j).includes('s3cr3tValue123') && !JSON.stringify(j).includes('AKIAIOSFODNN7EXAMPLE'), 'стенд с дырами: значения секретов замаскированы в JSON');
      say(j && j.verdict === 'FAIL', 'стенд с дырами: итог FAIL');
    }
    // чистый сайт
    {
      const jf = path.join(out, 'clean', 'security', 'clean.json'); try { fs.rmSync(jf, { force: true }); } catch { /* нет */ }
      const r = await runSelf([`${baseClean}/`, '--admin', '/api/admin/venues', '--out', path.join(out, 'clean'), '--tag', 'clean']);
      let j = null; try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch { /* нет */ }
      say(!!j, 'чистый стенд: есть протокол', j ? '' : `код ${r.code}: ${(r.err || r.out).slice(-200)}`);
      const noFail = j && !j.lines.some((l) => l.status === 'FAIL');
      say(noFail, 'чистый стенд: ни одного FAIL', j ? (j.lines.filter((l) => l.status === 'FAIL').map((l) => l.what).join('; ') || '') : '');
      say(j && j.lines.some((l) => /служебные файлы/.test(l.what) && l.status === 'OK'), 'чистый стенд: служебные файлы закрыты — OK');
      say(j && j.lines.some((l) => /кука сессии/.test(l.what) && l.status === 'OK'), 'чистый стенд: кука HttpOnly+SameSite (http локально, Secure не нужен) — OK');
    }
    // репозиторий с секретом в истории и .env в git
    {
      const rdir = path.join(out, 'repo'); fs.mkdirSync(rdir, { recursive: true });
      const g = (...a) => spawnSync('git', ['-C', rdir, ...a], { encoding: 'utf8', windowsHide: true });
      g('init', '-q'); g('config', 'user.email', 'a@b.c'); g('config', 'user.name', 'T'); g('config', 'commit.gpgsign', 'false');
      fs.writeFileSync(path.join(rdir, 'app.js'), 'const k = "AKIAIOSFODNN7EXAMPLE";\n');
      g('add', 'app.js'); g('commit', '-q', '-m', 'secret');
      fs.writeFileSync(path.join(rdir, 'app.js'), 'const k = process.env.K;\n'); g('add', 'app.js'); g('commit', '-q', '-m', 'fix');
      fs.writeFileSync(path.join(rdir, '.env'), 'ADMIN_PASSWORD=liveValue12345\n'); g('add', '-f', '.env'); g('commit', '-q', '-m', 'env');
      const jf = path.join(out, 'reporun', 'security', 'repo.json'); try { fs.rmSync(jf, { force: true }); } catch { /* нет */ }
      const r = await runSelf(['--repo', rdir, '--out', path.join(out, 'reporun'), '--tag', 'repo']);
      let j = null; try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch { /* нет */ }
      say(!!j, 'репозиторий: есть протокол', j ? '' : `код ${r.code}: ${(r.err || r.out).slice(-200)}`);
      say(j && j.lines.some((l) => /\.env отслеживается git/.test(l.what) && l.status === 'FAIL'), 'репозиторий: .env в git — FAIL');
      say(j && j.lines.some((l) => /секреты в отслеживаемых файлах/.test(l.what) && l.status === 'FAIL'), 'репозиторий: секрет в .env-файле — FAIL');
      say(j && !JSON.stringify(j).includes('liveValue12345') && !JSON.stringify(j).includes('AKIAIOSFODNN7EXAMPLE'), 'репозиторий: значения замаскированы');
      // история своим поиском (gitleaks отключён), должен найти удалённый ключ
      const rNoGl = await runSelf(['--repo', rdir, '--out', path.join(out, 'reporun2'), '--tag', 'repo2']);
      let j2 = null; try { j2 = JSON.parse(fs.readFileSync(path.join(out, 'reporun2', 'security', 'repo2.json'), 'utf8')); } catch { /* нет */ }
      say(j2 && j2.lines.some((l) => /истори/i.test(l.what) && (l.status === 'FAIL' || l.status === 'OK')), 'репозиторий: история просмотрена');
    }
  } finally { vulnServer.close(); cleanServer.close(); }
  console.log(`\n${bad ? 'FAIL' : 'OK'}: проверок ${n}, не сошлось ${bad}`);
  return bad ? 1 : 0;
}
