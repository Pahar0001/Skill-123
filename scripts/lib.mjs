/**
 * Общее для скриптов скилла site-rework.
 *
 * puppeteer-core и sharp берутся из ближайшего проекта: текущая папка, её
 * родители, папка из SITE_REWORK_PROJECT, затем известные проекты. Браузер
 * ищется по известным путям, Chrome первым: Edge в безголовом режиме на
 * части машин завершается молча. Свой путь — в CHROME_PATH.
 *
 * Папка прогона: SITE_REWORK_RUNS или ~/.claude/site-rework/runs/<slug>.
 * Туда складываются снимки, замеры, состояние задач и отчёт, чтобы «до»
 * и «после» можно было сравнить и через неделю.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

/* Где искать puppeteer-core и sharp, по порядку: SITE_REWORK_PROJECT, текущая
   папка и её родители, своя папка скилла (npm i puppeteer-core sharp --prefix
   ~/.claude/site-rework), известные проекты, глобальные пакеты npm. */
const OWN_ROOT = path.join(os.homedir(), '.claude', 'site-rework');
const KNOWN_PROJECTS = ['D:\\ssi\\sites'];

function roots() {
  const out = [];
  if (process.env.SITE_REWORK_PROJECT) out.push(process.env.SITE_REWORK_PROJECT);
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) { out.push(dir); const up = path.dirname(dir); if (up === dir) break; dir = up; }
  return [...out, OWN_ROOT, ...KNOWN_PROJECTS];
}

let globalRoot;
function loadFrom(name) {
  for (const root of roots()) {
    try { const req = createRequire(path.join(root, 'package.json')); const m = req(name); return m.default || m; } catch { /* следующий корень */ }
  }
  /* последняя попытка — глобальные пакеты npm (npm i -g puppeteer-core) */
  try {
    if (globalRoot === undefined) { try { globalRoot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).toString().trim() || null; } catch { globalRoot = null; } }
    if (globalRoot) { const req = createRequire(path.join(globalRoot, 'package.json')); const m = req(name); return m.default || m; }
  } catch { /* нет и там */ }
  return null;
}

export function loadPuppeteer() {
  const m = loadFrom('puppeteer-core') || loadFrom('puppeteer');
  if (m) return m;
  console.error(`Не найден puppeteer-core. Варианты:\n  · запускать из папки проекта, где он установлен;\n  · указать такую папку в SITE_REWORK_PROJECT;\n  · поставить рядом со скиллом: npm i puppeteer-core sharp --prefix "${OWN_ROOT}";\n  · или глобально: npm i -g puppeteer-core sharp`);
  process.exit(1);
}

export function loadSharp() { return loadFrom('sharp'); }

const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

export function requireChrome() {
  const found = CHROME.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (found) return found;
  console.error('Не найден Chrome, Chromium или Edge. Укажите путь в переменной CHROME_PATH.');
  process.exit(1);
}

/* GPU не отключаем намеренно: без него WebGL в безголовом Chrome может не
   подняться, и проверка 3D покажет пустой холст там, где у людей всё работает. */
export async function launch({ headless = true } = {}) {
  const puppeteer = loadPuppeteer();
  return puppeteer.launch({
    executablePath: requireChrome(), headless,
    args: ['--no-sandbox', '--hide-scrollbars', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const TABLET_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* Четыре экрана — не «десктоп, уменьшенный в три раза», а реальные устройства. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  laptop:  { width: 1280, height: 800, deviceScaleFactor: 1 },
  tablet:  { width: 834,  height: 1112, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  mobile:  { width: 390,  height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

export function pickViewports(list) {
  const names = (list ? String(list).split(',') : ['desktop', 'tablet', 'mobile']).map((s) => s.trim()).filter(Boolean);
  const bad = names.filter((n) => !VIEWPORTS[n]);
  if (bad.length) { console.error(`Неизвестные экраны: ${bad.join(', ')}. Есть: ${Object.keys(VIEWPORTS).join(', ')}`); process.exit(1); }
  return names.map((n) => [n, VIEWPORTS[n]]);
}

/**
 * Подготовить страницу без перехода: экран, агент, тема, журнал.
 * Журнал (консоль, ошибки, упавшие запросы, все ответы) лежит в page.log,
 * чтобы любой скрипт мог отдать его в отчёт.
 */
export async function preparePage(browser, vp, { scheme = 'light', reducedMotion = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  if (vp.isMobile) await page.setUserAgent(vp.width > 600 ? TABLET_UA : MOBILE_UA);
  const feats = [{ name: 'prefers-color-scheme', value: scheme }];
  if (reducedMotion) feats.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  await page.emulateMediaFeatures(feats);
  const log = { console: [], errors: [], failed: [], requests: [] };
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') log.console.push({ type: t, text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => log.errors.push(String((e && e.message) || e).slice(0, 300)));
  page.on('requestfailed', (r) => log.failed.push({ url: r.url().slice(0, 200), reason: (r.failure() || {}).errorText || 'failed' }));
  page.on('response', (r) => {
    const req = r.request(); const len = Number((r.headers() || {})['content-length'] || 0);
    log.requests.push({ url: r.url(), status: r.status(), type: req.resourceType(), bytes: len });
    if (r.status() >= 400) log.failed.push({ url: r.url().slice(0, 200), reason: 'HTTP ' + r.status() });
  });
  page.log = log;
  page.vpName = Object.keys(VIEWPORTS).find((k) => VIEWPORTS[k] === vp) || 'custom';
  return page;
}

/**
 * Дождаться, пока уйдёт заставка или прелоадер: закреплённый элемент с фоном,
 * закрывающий почти весь экран поверх остального. Иначе на «первом экране»
 * окажется логотип заставки, а не сайт. Результат — в page.overlay.
 */
export async function waitForOverlay(page, maxMs = 5000) {
  /* закрывает — значит, в трёх точках экрана сверху лежит именно он (elementFromPoint
     сам учитывает видимость, pointer-events и сдвиг за экран) */
  const covering = () => page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const sig = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
    const tops = [[vw / 2, vh / 2], [vw * 0.15, vh * 0.15], [vw * 0.85, vh * 0.85]].map(([x, y]) => document.elementFromPoint(x, y)).filter(Boolean);
    if (tops.length < 3) return null;
    for (const el of document.body.querySelectorAll('*')) {
      const s = getComputedStyle(el); if (s.position !== 'fixed' && s.position !== 'absolute') continue;
      if (!((parseInt(s.zIndex) || 0) >= 1) || parseFloat(s.opacity) < 0.5) continue;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
      if (!tops.every((t) => el === t || el.contains(t))) continue;
      const hasBg = !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor) || s.backgroundImage !== 'none';
      if (hasBg) return sig(el);
    }
    return null;
  }).catch(() => null);
  const t0 = Date.now(); const first = await covering(); let last = first;
  while (last && Date.now() - t0 < maxMs) { await sleep(300); last = await covering(); }
  return { hadOverlay: !!first, overlay: first, gone: !last, waitedMs: Date.now() - t0 };
}

/**
 * Переход с повторами. Медленное TLS-рукопожатие или упавшее соединение
 * дают net::ERR_TIMED_OUT, ERR_CONNECTION_RESET и подобное — Chrome сдаётся
 * раньше, чем сервер отвечает. Три попытки с паузой, последняя — с
 * ожиданием только DOMContentLoaded, чтобы вечные запросы не мешали.
 */
export async function gotoRetry(page, url, { waitUntil = 'networkidle2', timeout = 60000, attempts = 3 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await page.goto(url, { waitUntil: i === attempts ? 'domcontentloaded' : waitUntil, timeout: i === attempts ? timeout * 1.5 : timeout });
      if (i > 1) page.retries = i - 1;
      return res;
    } catch (e) {
      last = e;
      const msg = String(e && e.message || e);
      if (!/net::ERR_|Navigation timeout|Timeout/i.test(msg) || i === attempts) break;
      await sleep(1500 * i);
    }
  }
  throw last;
}

/** Открыть страницу с журналом, дождаться шрифтов и ухода заставки (settle: 0 — не ждать). */
export async function openPage(browser, url, vp, { scheme = 'light', reducedMotion = false, timeout = 60000, waitUntil = 'networkidle2', settle = 5000 } = {}) {
  const page = await preparePage(browser, vp, { scheme, reducedMotion });
  await gotoRetry(page, url, { waitUntil, timeout });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  page.overlay = settle ? await waitForOverlay(page, settle) : { hadOverlay: false, overlay: null, gone: true, waitedMs: 0 };
  await sleep(500);
  return page;
}

/* Git Bash подменяет аргументы вида «/sites/…» на путь внутри своей папки:
   «C:/Program Files/Git/sites/…». Возвращаем как было. Полные адреса не трогаем. */
export function unmangle(p) { return String(p).replace(/^[a-z]:[\\/]program files[\\/]git(?=[\\/])/i, ''); }
export function pagesFrom(list, base) {
  return String(list).split(',').map((p) => unmangle(p.trim())).filter(Boolean).map((p) => new URL(p, base).href);
}

/** Прокрутить страницу до конца, чтобы подгрузилось ленивое и сработали появления. */
export async function scrollThrough(page, { step = 0.8, pause = 350, shotsDir = null, tag = 'scroll', maxShots = 8 } = {}) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewport().height; let n = 0;
  for (let y = 0; y < total; y += Math.round(vh * step)) {
    await page.evaluate((yy) => scrollTo({ top: yy, behavior: 'instant' }), y); await sleep(pause);
    if (shotsDir && n < maxShots) await page.screenshot({ path: path.join(shotsDir, `${tag}-${String(n).padStart(2, '0')}.png`) });
    n++;
  }
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(300);
  return { pageHeight: total, screens: n };
}

/**
 * Остановить движение перед снимком для сравнения: конечные анимации
 * доигрываются до конца (блоки появления остаются показанными), бесконечные
 * ставятся на паузу, переходы отключаются.
 */
export async function freezeMotion(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}' });
  await page.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; try { if (t.iterations === Infinity) a.pause(); else a.finish(); } catch { /* уже закончена */ } } });
  await sleep(200);
}

/**
 * Снимок всей страницы. У Chrome есть предел высоты снимка около 16 тысяч
 * пикселей в устройстве: выше него полноэкранный снимок молча повторяет верх
 * страницы. Поэтому: высота × масштаб укладывается — обычный снимок; не
 * укладывается — масштаб ×1; не укладывается и так — сегменты по высоте
 * окна, склеенные sharp (закреплённые элементы попадут в каждый сегмент).
 * Возвращает способ съёмки: 'full' | 'dpr1' | 'segments'.
 */
export async function fullPageShot(page, file) {
  const LIMIT = 16000;
  const vp = page.viewport(); const dpr = vp.deviceScaleFactor || 1;
  const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(200);
  if (h * dpr <= LIMIT) { await page.screenshot({ path: file, fullPage: true }); return 'full'; }
  if (h <= LIMIT) {
    await page.setViewport({ ...vp, deviceScaleFactor: 1 }); await sleep(400);
    await page.screenshot({ path: file, fullPage: true });
    await page.setViewport(vp); await sleep(300);
    return 'dpr1';
  }
  const sharp = loadSharp();
  if (!sharp) { await page.setViewport({ ...vp, deviceScaleFactor: 1 }); await page.screenshot({ path: file, fullPage: true }); await page.setViewport(vp); return 'dpr1-overflow'; }
  await page.setViewport({ ...vp, deviceScaleFactor: 1 }); await sleep(400);
  const vh = vp.height; const parts = [];
  for (let y = 0; y < h; y += vh) {
    await page.evaluate((yy) => scrollTo({ top: yy, behavior: 'instant' }), y); await sleep(250);
    const sy = await page.evaluate(() => scrollY);
    const buf = await page.screenshot({ type: 'png' });
    const top = y; const cut = Math.min(vh, h - y); const offset = Math.max(0, y - sy);
    parts.push({ input: await sharp(buf).extract({ left: 0, top: offset, width: vp.width, height: Math.max(1, cut) }).png().toBuffer(), top, left: 0 });
  }
  await sharp({ create: { width: vp.width, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(parts).png().toFile(file);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.setViewport(vp); await sleep(300);
  return 'segments';
}

/** Байты и количество запросов по типам ресурсов. */
export function summarizeRequests(requests) {
  const by = {};
  for (const r of requests) { const t = r.type || 'other'; by[t] = by[t] || { count: 0, bytes: 0 }; by[t].count++; by[t].bytes += r.bytes || 0; }
  const largest = [...requests].filter((r) => r.bytes).sort((a, b) => b.bytes - a.bytes).slice(0, 10).map((r) => ({ url: r.url.slice(0, 120), type: r.type, kb: Math.round(r.bytes / 1024) }));
  const total = requests.reduce((a, r) => a + (r.bytes || 0), 0);
  return { byType: by, totalKb: Math.round(total / 1024), largest, count: requests.length };
}

/** Аргументы вида --out dir --name slug; флаг без значения даёт true; остальное — позиционные. */
export function parseArgs(argv) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true; opt[k] = v; }
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

export function slugFromUrl(url) {
  const u = new URL(url);
  return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'site';
}

export function pageSlug(url) {
  const p = new URL(url).pathname.replace(/\/$/, '');
  return p ? p.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() : 'home';
}

export function runDir(opt, url) {
  if (opt.out) return path.resolve(String(opt.out));
  const base = process.env.SITE_REWORK_RUNS || path.join(os.homedir(), '.claude', 'site-rework', 'runs');
  return path.join(base, slugFromUrl(url));
}

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); return p; }
export function writeJson(file, data) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 1)); }
export function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
export const kb = (b) => `${Math.round((b || 0) / 1024)} КБ`;

/** Подпись элемента для протоколов: tag#id.class.class (исходник для eval внутри страницы). */
export const SIG_FN = `(el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '')`;
