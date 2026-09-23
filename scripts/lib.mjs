/**
 * Общее для скриптов скилла: где взять puppeteer-core, sharp и браузер,
 * и помощники из соседнего скилла site-rework (если он рядом).
 *
 * Где ищется puppeteer-core (и sharp), по порядку:
 *   DESIGN_REF_PROJECT, SITE_REWORK_PROJECT, текущая папка (и её родители),
 *   ~/.claude/site-rework (npm i puppeteer-core sharp --prefix ~/.claude/site-rework),
 *   затем всё, где его находит lib.mjs скилла site-rework (известные проекты,
 *   глобальные пакеты npm).
 * Не нашли — бросается ошибка (а не process.exit): скрипт, который вызвал
 * extract() из своего кода (discover.mjs), ловит её и дописывает свои файлы.
 *
 * Браузер: CHROME_PATH, затем Chrome, затем Edge (Edge в безголовом режиме
 * на части машин завершается молча, поэтому он последний).
 *
 * Из site-rework берутся (если он есть): HEX_FN (любой CSS-цвет в #RRGGBB[AA],
 * включая oklch и color-mix), EFFECTIVE_OPACITY_FN (итоговая прозрачность через
 * предков и checkVisibility), gotoRetry (переход с повторами), screenSegment и
 * segmentPositions (снимки окна с ожиданием картинок). Без него работают
 * упрощённые запасные варианты — результат грубее, это пишется в json (tool.siteRework).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/* ---------- соседний скилл site-rework ---------- */
const SR_LIB = path.join(os.homedir(), '.claude', 'skills', 'site-rework', 'scripts', 'lib.mjs');
async function loadSiteRework() {
  try { if (!fs.existsSync(SR_LIB)) return null; return await import(pathToFileURL(SR_LIB).href); } catch { return null; }
}
/** Модуль lib.mjs скилла site-rework или null. */
export const SR = await loadSiteRework();

/* ---------- модули ---------- */
const OWN_ROOT = path.join(os.homedir(), '.claude', 'site-rework');
function roots() {
  return [process.env.DESIGN_REF_PROJECT, process.env.SITE_REWORK_PROJECT, process.cwd(), OWN_ROOT].filter(Boolean);
}

/** Загрузить модуль из корней выше; null — не найден. */
export function loadModule(name) {
  const tried = new Set();
  const list = [...roots()];
  if (SR && SR.findModuleRoot) { try { const r = SR.findModuleRoot(name); if (r) list.push(r); } catch { /* нет */ } }
  for (const root of list) {
    if (tried.has(root)) continue; tried.add(root);
    try {
      const req = createRequire(path.join(root, 'package.json'));
      const mod = req(name);
      return mod && mod.default !== undefined ? mod.default : mod;
    } catch { /* следующий корень */ }
  }
  return null;
}

export function loadPuppeteer() {
  const m = loadModule('puppeteer-core') || loadModule('puppeteer');
  if (m) return m;
  throw new Error(`Не найден puppeteer-core. Варианты: запускать из папки проекта, где он установлен; указать её в DESIGN_REF_PROJECT (или SITE_REWORK_PROJECT); поставить рядом со скиллом site-rework: npm i puppeteer-core sharp --prefix "${OWN_ROOT}".`);
}

/** sharp или null (нужен для проверки акцента по пикселям снимков). */
export function loadSharp() { return loadModule('sharp'); }

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

export function requireChrome() {
  const found = CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (found) return found;
  throw new Error('Не найден Chrome, Chromium или Edge. Укажите путь в переменной CHROME_PATH.');
}

export async function launch() {
  const puppeteer = loadPuppeteer();
  return puppeteer.launch({ executablePath: requireChrome(), headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Для запуска из командной строки: сообщение об ошибке без трассировки и код 1. */
export function die(e) { console.error(String((e && e.message) || e)); process.exit(1); }

/**
 * Аргументы вида --out dir --name slug (и --out=dir); остальное — позиционные.
 * «--» — дальше только позиционные. flags — ключи, которые никогда не берут значение.
 */
export function parseArgs(argv, { flags = [] } = {}) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 2) { opt[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const k = a.slice(2);
      const next = argv[i + 1];
      opt[k] = !flags.includes(k) && next !== undefined && !next.startsWith('--') ? argv[++i] : true;
    } else pos.push(a);
  }
  return { pos, opt };
}

export function slugFromUrl(url) {
  const u = new URL(url);
  return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'reference';
}

/* ---------- код для страницы (исходники для eval) ---------- */

/* Запасные варианты на случай, когда site-rework рядом нет. */
const HEX_LOCAL = `(css) => {
  const m = /rgba?\\(([^)]+)\\)/.exec(css || ''); if (!m) return null;
  const p = m[1].split(/[,\\s/]+/).filter(Boolean).map((v) => v.endsWith('%') ? parseFloat(v) / 100 : Number(v));
  if (p.length > 3 && !(p[3] > 0)) return null;
  const h = '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  return p.length > 3 && p[3] < 1 ? h + Math.round(p[3] * 255).toString(16).padStart(2, '0').toUpperCase() : h;
}`;
const EFF_LOCAL = `(el) => {
  let o = 1;
  for (let e = el, first = true; e && e.nodeType === 1; e = e.parentElement, first = false) {
    const s = getComputedStyle(e);
    if (s.display === 'none' || (first && s.visibility !== 'visible')) return 0;
    if (s.display !== 'contents') o *= parseFloat(s.opacity);
    if (!(o > 0.001)) return 0;
  }
  return Math.round(o * 1000) / 1000;
}`;
const SIG_LOCAL = `(el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '')`;

/** Любой CSS-цвет → '#RRGGBB' / '#RRGGBBAA' или null. */
export const HEX_SRC = (SR && SR.HEX_FN) || HEX_LOCAL;
/** Итоговая непрозрачность элемента 0…1 (произведение по предкам). */
export const EFF_SRC = (SR && SR.EFFECTIVE_OPACITY_FN) || EFF_LOCAL;
export const SIG_SRC = (SR && SR.SIG_FN) || SIG_LOCAL;

/** Выполнить fn в странице, подставив исходники deps константами (как evaluateWith в site-rework). */
export function evaluateWith(page, fn, arg = null, deps = {}) {
  if (SR && SR.evaluateWith) return SR.evaluateWith(page, fn, arg, deps);
  const decl = Object.entries(deps).map(([k, src]) => `const ${k} = ${src};`).join('\n');
  return page.evaluate(`(async () => {\n${decl}\nreturn await (${fn.toString()})(${JSON.stringify(arg)});\n})()`);
}

/**
 * Переход с повторами: медленное TLS-рукопожатие даёт net::ERR_TIMED_OUT и
 * подобное. Три попытки, последняя — только до DOMContentLoaded.
 * page.gotoInfo = { attempt, waitUntil }.
 */
export async function gotoRetry(page, url, { waitUntil = 'networkidle2', timeout = 60000, attempts = 3 } = {}) {
  if (SR && SR.gotoRetry) return SR.gotoRetry(page, url, { waitUntil, timeout, attempts });
  let last;
  for (let i = 1; i <= attempts; i++) {
    const wu = i === attempts && attempts > 1 ? 'domcontentloaded' : waitUntil;
    try { const res = await page.goto(url, { waitUntil: wu, timeout }); page.gotoInfo = { attempt: i, waitUntil: wu }; return res; }
    catch (e) { last = e; if (!/net::ERR_|Navigation timeout|Timeout/i.test(String(e && e.message || e)) || i === attempts) break; await sleep(1500 * i); }
  }
  throw last;
}

/** Высоты снимков окна равномерно по всей странице (последний — низ). */
export function segmentPositions(total, vh, { step = 0.8, maxShots = 8, skipTop = false } = {}) {
  if (SR && SR.segmentPositions) return SR.segmentPositions(total, vh, { step, maxShots, skipTop });
  const px = Math.max(1, Math.round(vh * step)); const bottom = Math.max(0, total - vh);
  const ys = []; for (let y = 0; y < bottom; y += px) ys.push(y);
  if (!ys.length || ys[ys.length - 1] !== bottom) ys.push(bottom);
  const list = skipTop && ys.length > 1 ? ys.slice(1) : ys;
  if (list.length <= maxShots) return list;
  const pick = new Set(); for (let k = 0; k < maxShots; k++) pick.add(Math.round(k * (list.length - 1) / Math.max(1, maxShots - 1)));
  return [...pick].sort((a, b) => a - b).map((i) => list[i]);
}

/** Снимок окна на высоте y: { y, scrollY, buffer }. С site-rework — с ожиданием картинок и переходов. */
export async function screenAt(page, y, { pause = 700, mediaTimeout = 4000, settle = 1200 } = {}) {
  if (SR && SR.screenSegment) return SR.screenSegment(page, y, { pause, mediaTimeout, settle });
  await page.evaluate((yy) => scrollTo({ top: yy, behavior: 'instant' }), y); await sleep(pause);
  const scrollY = await page.evaluate(() => Math.round(scrollY));
  return { y, scrollY, offset: Math.max(0, y - scrollY), buffer: await page.screenshot({ type: 'png' }) };
}

/** Агент для узкого экрана (у сайтов, которые отдают мобильную вёрстку по агенту). */
export const MOBILE_UA = (SR && SR.MOBILE_UA) || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
