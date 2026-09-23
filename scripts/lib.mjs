/**
 * Общее для скриптов скилла site-rework.
 *
 * puppeteer-core, sharp и ffmpeg-static берутся из ближайшего проекта: папка
 * из SITE_REWORK_PROJECT, текущая папка и её родители, своя папка скилла
 * (~/.claude/site-rework), затем известные проекты и глобальные пакеты npm.
 * Браузер ищется по известным путям, Chrome первым: Edge в безголовом режиме
 * на части машин завершается молча. Свой путь — в CHROME_PATH, свой ffmpeg —
 * в FFMPEG_PATH.
 *
 * Папка прогона: SITE_REWORK_RUNS или ~/.claude/site-rework/runs/<slug>.
 * Туда складываются снимки, замеры, состояние задач и отчёт, чтобы «до»
 * и «после» можно было сравнить и через неделю.
 *
 * Экраны в --viewport/--viewports любого скрипта: имя пресета (desktop,
 * laptop, tablet, mobile, mobile-s = 320×568@2, android = 360×800@3) или
 * запись ШxВ@плотность («320x568@2»), или одна ширина («320»).
 *
 * Что здесь есть (что принимает и что возвращает — в комментарии у каждой функции):
 *   запуск и страница  launch, preparePage, openPage, gotoRetry, waitForOverlay
 *   экраны             VIEWPORTS (+ запись «320x568@2»), parseViewport,
 *                      resolveViewport, pickViewports
 *   прокрутка          scrollThrough, scrollToY, forceInstantScroll,
 *                      screenSegment, waitForMedia, settleAnimations,
 *                      segmentPositions
 *   снимки             fullPageShot (способы full / dpr1 / segments),
 *                      contactSheet, freezeMotion, FULLPAGE_NOTE
 *   проверки           findOverflow, canvasList, hexColors, effectiveOpacity
 *   код для страницы   SIG_FN, HEX_FN, EFFECTIVE_OPACITY_FN, VISIBLE_FN,
 *                      evaluateWith
 *   прочее             parseArgs, getFfmpeg, findModuleRoot, summarizeRequests,
 *                      runDir, slugFromUrl, pageSlug, pagesFrom, unmangle,
 *                      ensureDir, writeJson, readJson, kb, sleep
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

/* Где искать puppeteer-core, sharp и ffmpeg-static, по порядку: SITE_REWORK_PROJECT,
   текущая папка и её родители, своя папка скилла (npm i puppeteer-core sharp
   ffmpeg-static --prefix ~/.claude/site-rework), известные проекты, глобальные пакеты npm. */
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
function npmGlobalRoot() {
  if (globalRoot === undefined) { try { globalRoot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).toString().trim() || null; } catch { globalRoot = null; } }
  return globalRoot;
}

/* Найти модуль: { mod, root } или null. root — папка, в чьей node_modules он
   на самом деле нашёлся (require ищет и в родителях корня). */
function resolveModule(name) {
  const load = (base) => {
    const req = createRequire(path.join(base, 'package.json')); const m = req(name);
    let root = base;
    try { const f = req.resolve(name); const i = f.lastIndexOf(`${path.sep}node_modules${path.sep}`); if (i > 0) root = f.slice(0, i); } catch { /* встроенный */ }
    return { mod: m && m.default !== undefined ? m.default : m, root };
  };
  for (const root of roots()) {
    try { return load(root); } catch { /* следующий корень */ }
  }
  /* последняя попытка — глобальные пакеты npm (npm i -g puppeteer-core) */
  try { const g = npmGlobalRoot(); if (g) return load(g); } catch { /* нет и там */ }
  return null;
}
function loadFrom(name) { const r = resolveModule(name); return r ? r.mod : null; }

/**
 * Папка, из которой берётся модуль (например, чтобы передать её в
 * DESIGN_REF_PROJECT скилла design-reference): findModuleRoot('puppeteer-core').
 * null — модуль не найден ни в одном корне.
 */
export function findModuleRoot(name) { const r = resolveModule(name); return r ? r.root : null; }

export function loadPuppeteer() {
  const m = loadFrom('puppeteer-core') || loadFrom('puppeteer');
  if (m) return m;
  console.error(`Не найден puppeteer-core. Варианты:\n  · запускать из папки проекта, где он установлен;\n  · указать такую папку в SITE_REWORK_PROJECT;\n  · поставить рядом со скиллом: npm i puppeteer-core sharp --prefix "${OWN_ROOT}";\n  · или глобально: npm i -g puppeteer-core sharp`);
  process.exit(1);
}

export function loadSharp() { return loadFrom('sharp'); }

/**
 * Путь к ffmpeg или null. Порядок: FFMPEG_PATH, пакет ffmpeg-static из тех же
 * корней, что puppeteer-core, затем PATH. Сам ничего не скачивает и не
 * устанавливает: если null — пишите в отчёт «ffmpeg нет» и ставьте
 * npm i ffmpeg-static --prefix ~/.claude/site-rework.
 */
let ffmpegCache;
export function getFfmpeg() {
  if (ffmpegCache !== undefined) return ffmpegCache;
  const ok = (p) => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };
  if (ok(process.env.FFMPEG_PATH)) return (ffmpegCache = process.env.FFMPEG_PATH);
  const st = loadFrom('ffmpeg-static');
  const p = typeof st === 'string' ? st : st && typeof st.path === 'string' ? st.path : null;
  if (ok(p)) return (ffmpegCache = p);
  /* PATH перебираем сами: вывод `where` на Windows приходит в кодировке консоли и портит кириллицу */
  const names = process.platform === 'win32' ? ['ffmpeg.exe', 'ffmpeg'] : ['ffmpeg'];
  for (const dir of String(process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean)) {
    for (const n of names) { const f = path.join(dir.replace(/^"|"$/g, ''), n); if (ok(f)) return (ffmpegCache = f); }
  }
  return (ffmpegCache = null);
}

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
   подняться, и проверка 3D покажет пустой холст там, где у людей всё работает.
   protocolTimeout — сколько ждать ответа страницы на одну команду: зависшая
   (нехватка памяти, бесконечный цикл) страница даёт ошибку через 90 с, а не
   держит скрипт двадцать минут. */
export async function launch({ headless = true, protocolTimeout = 90000 } = {}) {
  const puppeteer = loadPuppeteer();
  return puppeteer.launch({
    executablePath: requireChrome(), headless, protocolTimeout,
    args: ['--no-sandbox', '--hide-scrollbars', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Сторож страницы: если вкладка упала (событие error — «Page crashed!», чаще
 * всего от нехватки памяти), это записывается в page.rwCrashed, и
 * assertAlive/withDeadline сразу бросают понятную ошибку вместо ожидания.
 */
export function guardPage(page) {
  if (!page || page.__rwGuard) return page;
  Object.defineProperty(page, '__rwGuard', { value: true });
  page.on('error', (e) => { page.rwCrashed = String((e && e.message) || e || 'вкладка упала').slice(0, 200); });
  return page;
}
const crashText = (page) => `вкладка браузера упала (${page.rwCrashed}) — обычно не хватает памяти: закройте лишнее и повторите`;
export function assertAlive(page) { if (page && page.rwCrashed) throw new Error(crashText(page)); }

/** Обещание с пределом времени: не уложилось в ms — ошибка с текстом what (и о падении вкладки, если было). */
export function withDeadline(promise, ms, what, page = null) {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(page && page.rwCrashed ? crashText(page) : `${what}: не уложилось в ${Math.round(ms / 1000)} с — страница зависла или ей не хватает памяти`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

export const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const TABLET_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/* Имя экрана и агент хранятся неперечисляемыми свойствами: объект экрана
   по-прежнему выглядит как {width, height, deviceScaleFactor, ...} и так же
   передаётся в page.setViewport. */
function named(name, vp, ua) {
  Object.defineProperty(vp, 'name', { value: name, enumerable: false });
  if (ua) Object.defineProperty(vp, 'ua', { value: ua, enumerable: false });
  return vp;
}

/* Реальные устройства, а не «десктоп, уменьшенный в три раза».
   mobile-s — самый узкий живой телефон (320: iPhone SE первого поколения,
   маленькие Android): на нём вылезают нижние панели и длинные подписи.
   android — самый массовый Android (360 при плотности 3). */
const PRESETS = {
  desktop:    named('desktop', { width: 1440, height: 900, deviceScaleFactor: 1 }),
  laptop:     named('laptop', { width: 1280, height: 800, deviceScaleFactor: 1 }),
  tablet:     named('tablet', { width: 834, height: 1112, deviceScaleFactor: 2, isMobile: true, hasTouch: true }),
  mobile:     named('mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }),
  'mobile-s': named('mobile-s', { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true }),
  android:    named('android', { width: 360, height: 800, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ANDROID_UA),
};

const parsedVp = new Map();
/**
 * Экран из записи: имя пресета («mobile-s»), «ШxВ@плотность» («320x568@2»,
 * «1024x768», «360×800@3») или одна ширина («320» — пресет с такой шириной,
 * иначе типичная высота). Уже W < 1024 — телефон или планшет: касание и
 * мобильный агент, плотность по умолчанию 2; шире — десктоп, плотность 1.
 * Возвращает объект экрана (с неперечисляемым .name) или null.
 */
export function parseViewport(spec) {
  if (spec && typeof spec === 'object' && spec.width) return spec;
  const s = String(spec == null ? '' : spec).trim().toLowerCase();
  if (!s) return null;
  if (Object.prototype.hasOwnProperty.call(PRESETS, s)) return PRESETS[s];
  if (parsedVp.has(s)) return parsedVp.get(s);
  let vp = null;
  const m = s.match(/^(\d{3,4})\s*[x×*]\s*(\d{3,5})(?:\s*@\s*(\d+(?:\.\d+)?))?$/);
  if (m) {
    const w = Number(m[1]), h = Number(m[2]); const mob = w < 1024;
    const dpr = m[3] ? Math.min(4, Math.max(0.5, Number(m[3]))) : mob ? 2 : 1;
    if (w >= 200 && w <= 4000 && h >= 200 && h <= 20000) vp = { width: w, height: h, deviceScaleFactor: dpr, ...(mob ? { isMobile: true, hasTouch: true } : {}) };
  } else if (/^\d{3,4}$/.test(s)) {
    const w = Number(s);
    const preset = Object.values(PRESETS).find((p) => p.width === w);
    if (preset) return preset;
    if (w >= 200 && w <= 4000) vp = w < 600 ? { width: w, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : w < 1024 ? { width: w, height: 1112, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: w, height: 900, deviceScaleFactor: 1 };
  }
  if (!vp) return null;
  named(`${vp.width}x${vp.height}@${vp.deviceScaleFactor}`, vp);
  parsedVp.set(s, vp);
  return vp;
}

/**
 * VIEWPORTS[имя] — как раньше, плюс любая запись, которую понимает
 * parseViewport: VIEWPORTS['320x568@2'], VIEWPORTS['320'] (= mobile-s).
 * Object.keys(VIEWPORTS) по-прежнему перечисляет только пресеты.
 */
export const VIEWPORTS = new Proxy(PRESETS, {
  get(t, k, r) { if (typeof k === 'string' && !(k in t)) { const vp = parseViewport(k); if (vp) return vp; } return Reflect.get(t, k, r); },
  has(t, k) { return (k in t) || (typeof k === 'string' && !!parseViewport(k)); },
});

/** [имя, экран] по записи или null: resolveViewport('320') → ['mobile-s', {...}]. */
export function resolveViewport(spec) { const vp = parseViewport(spec); return vp ? [vp.name || String(spec), vp] : null; }

export function pickViewports(list) {
  const names = (list ? String(list).split(',') : ['desktop', 'tablet', 'mobile']).map((s) => s.trim()).filter(Boolean);
  const bad = names.filter((n) => !parseViewport(n));
  if (bad.length) { console.error(`Неизвестные экраны: ${bad.join(', ')}. Есть: ${Object.keys(PRESETS).join(', ')} или запись ШxВ@плотность, например 320x568@2`); process.exit(1); }
  return names.map((n) => resolveViewport(n));
}

/* ---------- код, который выполняется внутри страницы ---------- */

/** Подпись элемента для протоколов: tag#id.class.class (исходник для eval внутри страницы). */
export const SIG_FN = `(el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '')`;

/**
 * Любой CSS-цвет → '#RRGGBB' или '#RRGGBBAA' (альфа сохраняется), прозрачный → null.
 * rgb()/rgba() разбираются точно; oklch(), lab(), color(srgb …), color-mix() и
 * прочее — через холст 1×1 (браузер сам переводит в sRGB; при малой альфе
 * каналы огрубляются до ±1–2 единиц). Исходник для eval внутри страницы:
 *   const hex = eval(HEX_FN); hex(getComputedStyle(el).color)
 */
export const HEX_FN = `(() => {
  let x = null;
  const exact = /^rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.]+%?))?\\s*\\)$/i;
  const h2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return (css) => {
    if (css == null) return null; css = String(css).trim();
    if (!css || /^(transparent|none|initial|inherit|unset)$/i.test(css)) return null;
    let r, g, b, a;
    const m = css.match(exact);
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; a = m[4] === undefined ? 255 : Math.round((m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) * 255); }
    else {
      if (!(window.CSS && CSS.supports('color', css))) return null;
      if (!x) { const c = document.createElement('canvas'); c.width = c.height = 1; x = c.getContext('2d', { willReadFrequently: true }); }
      x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = css; x.fillRect(0, 0, 1, 1);
      [r, g, b, a] = x.getImageData(0, 0, 1, 1).data;
    }
    if (!(a > 0)) return null;
    const hex = '#' + h2(r) + h2(g) + h2(b);
    return (a < 255 ? hex + h2(a) : hex).toUpperCase();
  };
})()`;

/**
 * Итоговая непрозрачность элемента 0…1: произведение opacity (и filter: opacity())
 * по всем предкам, включая хозяев теневого DOM. 0 — если элемент или предок
 * display:none, у самого элемента visibility не visible, или браузер считает
 * его невидимым (checkVisibility: content-visibility, закрытый details).
 * Прозрачность кнопок «по наведению» живёт у контейнера, поэтому смотреть
 * только на opacity самого элемента нельзя. Исходник для eval внутри страницы.
 */
export const EFFECTIVE_OPACITY_FN = `(el) => {
  if (!el || el.nodeType !== 1) return 0;
  try { if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) return 0; } catch (e) { /* старый браузер */ }
  let o = 1;
  for (let e = el, first = true; e && e.nodeType === 1; first = false) {
    const s = getComputedStyle(e);
    if (s.display === 'none') return 0;
    if (first && s.visibility !== 'visible') return 0;
    if (s.display !== 'contents') {
      o *= parseFloat(s.opacity);
      if (s.filter && s.filter !== 'none') { const f = s.filter.match(/opacity\\(([\\d.]+)(%?)\\)/); if (f) o *= f[2] ? parseFloat(f[1]) / 100 : parseFloat(f[1]); }
    }
    if (!(o > 0.001)) return 0;
    const root = e.getRootNode && e.getRootNode();
    e = e.parentElement || (root && root !== document && root.host) || null;
  }
  return Math.round(o * 1000) / 1000;
}`;

/** Видим ли элемент глазом: есть размер и итоговая непрозрачность выше порога (по умолчанию 0.05). */
export const VISIBLE_FN = `((eff) => (el, min = 0.05) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && eff(el) > min; })(${EFFECTIVE_OPACITY_FN})`;

/**
 * Выполнить функцию в странице с зависимостями, переданными исходниками, —
 * без `const sig = eval(SIG_FN)` в каждой функции (исходники подставляются
 * константами перед fn, всё уходит в страницу одной строкой).
 *   await evaluateWith(page, (arg) => [...document.images].filter((i) => vis(i)).map(sig), { x: 1 }, { sig: SIG_FN, vis: VISIBLE_FN })
 * fn видит зависимости как свободные переменные; arg проходит через JSON.
 */
export function evaluateWith(page, fn, arg = null, deps = {}) {
  const decl = Object.entries(deps).map(([k, src]) => `const ${k} = ${src};`).join('\n');
  return page.evaluate(`(async () => {\n${decl}\nreturn await (${fn.toString()})(${JSON.stringify(arg)});\n})()`);
}

/* Перехват getContext: запоминаем, какой контекст холсту дала сама страница.
   Проверкам больше не нужно звать getContext на пробу — такая проба на ещё не
   нарисованном холсте захватывает его (webgl2 вместо 2d), и сайт остаётся без картинки. */
function canvasHook() {
  try {
    const P = HTMLCanvasElement.prototype; const orig = P.getContext;
    if (!orig || orig.__rwHooked) return;
    const mark = (el, type, attrs) => {
      if (el.__rwCtx) return;
      try {
        Object.defineProperty(el, '__rwCtx', { value: type, configurable: true, writable: true, enumerable: false });
        if (attrs && typeof attrs === 'object') Object.defineProperty(el, '__rwCtxAttrs', { value: JSON.parse(JSON.stringify(attrs)), configurable: true, writable: true, enumerable: false });
      } catch (e) { /* заморожен */ }
    };
    const wrapped = function getContext(type, ...rest) {
      const ctx = orig.call(this, type, ...rest);
      if (ctx) { const t = String(type).toLowerCase(); mark(this, t === 'experimental-webgl' ? 'webgl' : t, rest[0]); }
      return ctx;
    };
    Object.defineProperty(wrapped, '__rwHooked', { value: true });
    try { Object.defineProperty(wrapped, 'toString', { value: () => orig.toString(), configurable: true }); } catch (e) { /* нет */ }
    P.getContext = wrapped;
    const tco = P.transferControlToOffscreen;
    if (tco) P.transferControlToOffscreen = function transferControlToOffscreen(...a) { const r = tco.apply(this, a); mark(this, 'offscreen'); return r; };
  } catch (e) { /* не страница с холстами */ }
}

/**
 * Подготовить страницу без перехода: экран, агент, тема, журнал.
 * Журнал (консоль, ошибки, упавшие запросы, все ответы) лежит в page.log,
 * чтобы любой скрипт мог отдать его в отчёт.
 *
 * Байты ответа — encodedDataLength из CDP (Network.loadingFinished): сколько
 * реально пришло по сети, со сжатием и при chunked. content-length остаётся
 * только запасным значением (ответ из кэша, поток, который не закончился).
 * У записи: bytes, bytesFrom ('cdp' | 'content-length' | 'none'), fromCache.
 * page.rwCdp — эта CDP-сессия (Network уже включён), её можно переиспользовать.
 *
 * Параметры: scheme ('light'|'dark'), reducedMotion, userAgent (свой агент),
 * hookCanvas (true — перехват getContext, тип контекста в canvas.__rwCtx),
 * trackBytes (true — байты через CDP).
 */
export async function preparePage(browser, vp, { scheme = 'light', reducedMotion = false, userAgent = null, hookCanvas = true, trackBytes = true } = {}) {
  const page = guardPage(await browser.newPage());
  await page.setViewport(vp);
  const ua = userAgent || vp.ua || (vp.isMobile ? (vp.width > 600 ? TABLET_UA : MOBILE_UA) : null);
  if (ua) await page.setUserAgent(ua);
  const feats = [{ name: 'prefers-color-scheme', value: scheme }];
  if (reducedMotion) feats.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  await page.emulateMediaFeatures(feats);
  if (hookCanvas) await page.evaluateOnNewDocument(canvasHook);
  const log = { console: [], errors: [], failed: [], requests: [] };
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') log.console.push({ type: t, text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => log.errors.push(String((e && e.message) || e).slice(0, 300)));
  page.on('requestfailed', (r) => log.failed.push({ url: r.url().slice(0, 200), reason: (r.failure() || {}).errorText || 'failed' }));
  /* ответы приходят двумя путями: событие puppeteer (статус, тип) и CDP (байты) —
     в любом порядке, поэтому сводим их по requestId */
  const byId = new Map(); const sizes = new Map();
  const applySize = (entry, s) => {
    if (s.fromCache) entry.fromCache = true;
    if (s.bytes > 0) { entry.bytes = s.bytes; entry.bytesFrom = 'cdp'; }
  };
  page.on('response', (r) => {
    const req = r.request(); const len = Number((r.headers() || {})['content-length'] || 0);
    const entry = { url: r.url(), status: r.status(), type: req.resourceType(), bytes: len, bytesFrom: len ? 'content-length' : 'none' };
    try { if (r.fromCache()) entry.fromCache = true; } catch { /* нет в этой версии */ }
    log.requests.push(entry);
    const id = req.id;
    if (id) { const s = sizes.get(id); if (s) { applySize(entry, s); sizes.delete(id); } else byId.set(id, entry); }
    if (r.status() >= 400) log.failed.push({ url: r.url().slice(0, 200), reason: 'HTTP ' + r.status() });
  });
  if (trackBytes) {
    try {
      const cdp = await page.createCDPSession();
      await cdp.send('Network.enable');
      const cached = new Set();
      cdp.on('Network.requestServedFromCache', (e) => cached.add(e.requestId));
      cdp.on('Network.loadingFinished', (e) => {
        const s = { bytes: e.encodedDataLength || 0, fromCache: cached.has(e.requestId) };
        cached.delete(e.requestId);
        const entry = byId.get(e.requestId);
        if (entry) { applySize(entry, s); byId.delete(e.requestId); } else sizes.set(e.requestId, s);
      });
      page.rwCdp = cdp;
    } catch { /* без CDP остаётся content-length */ }
  }
  page.log = log;
  page.vpName = vp.name || Object.keys(PRESETS).find((k) => PRESETS[k] === vp) || 'custom';
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
 * page.retries — сколько было повторов; page.gotoInfo = { attempt, waitUntil }
 * — с какой попытки и с каким ожиданием открылось (для отчёта: «со 2-й попытки,
 * только DOMContentLoaded»). Не зависит от preparePage: годится для любой
 * страницы puppeteer (например, в design-reference).
 */
export async function gotoRetry(page, url, { waitUntil = 'networkidle2', timeout = 60000, attempts = 3 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const wu = i === attempts && attempts > 1 ? 'domcontentloaded' : waitUntil;
    try {
      const res = await page.goto(url, { waitUntil: wu, timeout: i === attempts && attempts > 1 ? timeout * 1.5 : timeout });
      if (i > 1) page.retries = i - 1;
      page.gotoInfo = { attempt: i, waitUntil: wu };
      return res;
    } catch (e) {
      last = e;
      const msg = String(e && e.message || e);
      if (!/net::ERR_|Navigation timeout|Timeout/i.test(msg) || i === attempts) break;
      await sleep(1500 * i);
    }
  }
  /* после нескольких упавших переходов вкладка стоит на странице ошибки Chrome, и page.close()
     на ней может не вернуться вообще (проверено: 3 из 3 зависаний); about:blank это снимает */
  if (attempts > 1) await Promise.race([page.goto('about:blank', { timeout: 5000 }).catch(() => {}), sleep(6000)]);
  throw last;
}

/** Открыть страницу с журналом, дождаться шрифтов и ухода заставки (settle: 0 — не ждать).
    Остальные параметры (userAgent, hookCanvas, trackBytes) уходят в preparePage. */
export async function openPage(browser, url, vp, { scheme = 'light', reducedMotion = false, timeout = 60000, waitUntil = 'networkidle2', settle = 5000, ...prep } = {}) {
  const page = await preparePage(browser, vp, { scheme, reducedMotion, ...prep });
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

/* ---------- прокрутка ---------- */

/**
 * Отключить плавную прокрутку страницы: html{scroll-behavior:smooth} превращает
 * scrollTo(0, y) в анимацию, и замер идёт посреди пути (a11y открыл 2 блока из 21,
 * perf «прокрутил 12453 px», а страница сдвинулась на 149). Вставляет
 * <style data-rw="instant-scroll">. persist: true — вставлять и после
 * перезагрузок и переходов этой вкладки.
 */
const INSTANT_CSS = 'html,body,*{scroll-behavior:auto!important}';
export async function forceInstantScroll(page, { persist = false } = {}) {
  const add = (css) => {
    const put = () => { if (document.querySelector('style[data-rw="instant-scroll"]')) return; const s = document.createElement('style'); s.setAttribute('data-rw', 'instant-scroll'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
    if (document.documentElement) put(); else document.addEventListener('DOMContentLoaded', put, { once: true });
  };
  if (persist && !page.__rwInstantPersist) { await page.evaluateOnNewDocument(add, INSTANT_CSS); page.__rwInstantPersist = true; }
  await page.evaluate(add, INSTANT_CSS).catch(() => {});
}

/* Главный прокручиваемый элемент: документ или (у «приложений» с
   body{height:100%;overflow:auto}) самый высокий прокручиваемый блок на весь экран.
   Ссылка хранится в window.__rwScroller, DOM не меняется. */
function detectScrollerInPage() {
  const se = document.scrollingElement || document.documentElement;
  const docH = Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0);
  if (docH > innerHeight + 2) { window.__rwScroller = null; return { kind: 'document', height: docH }; }
  let best = null;
  const cands = document.body ? [document.body, ...document.body.querySelectorAll('*')] : [];
  for (const el of cands) {
    if (el.scrollHeight <= el.clientHeight + 50) continue;
    if (el.clientHeight < innerHeight * 0.5 || el.clientWidth < innerWidth * 0.5) continue;
    if (!/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
    if (!best || el.scrollHeight > best.scrollHeight) best = el;
  }
  window.__rwScroller = best;
  if (!best) return { kind: 'document', height: docH };
  return { kind: 'element', el: best.tagName.toLowerCase() + (best.id ? '#' + best.id : '') + (best.classList.length ? '.' + [...best.classList].slice(0, 2).join('.') : ''), height: best.scrollHeight };
}
const pageHeight = (page) => page.evaluate(() => { const sc = window.__rwScroller; return sc && sc.isConnected ? sc.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0); });
const currentScroll = (page) => page.evaluate(() => { const sc = window.__rwScroller; return Math.round(sc && sc.isConnected ? sc.scrollTop : scrollY); });

/**
 * Мгновенно прокрутить к y (behavior:'instant' — мимо scroll-behavior:smooth)
 * и вернуть, где страница оказалась на самом деле. Если scrollThrough нашёл,
 * что прокручивается не документ, а блок внутри, прокручивается он.
 */
export function scrollToY(page, y) {
  return page.evaluate((yy) => {
    const sc = window.__rwScroller;
    if (sc && sc.isConnected) { sc.scrollTo({ top: yy, behavior: 'instant' }); return Math.round(sc.scrollTop); }
    scrollTo({ top: yy, behavior: 'instant' }); return Math.round(scrollY);
  }, y);
}

/**
 * Дождаться картинок в кадре: <img> (загрузка и decode), фоновые картинки
 * элементов и их ::before/::after (url() загружается и декодируется через
 * new Image), видео (первый кадр, если оно вообще грузится) и постеры, шрифты.
 * margin — сколько пикселей ниже и выше окна тоже считать кадром.
 * Возвращает { images, backgrounds, videos, failed, pending, ms }:
 * pending — сколько так и не догрузилось за timeout.
 */
export async function waitForMedia(page, { timeout = 6000, margin = 0 } = {}) {
  return page.evaluate(async ({ timeout, margin }) => {
    const t0 = performance.now();
    const vw = innerWidth, vh = innerHeight;
    const inView = (r) => r.width > 0 && r.height > 0 && r.bottom > -margin && r.top < vh + margin && r.right > 0 && r.left < vw;
    const st = { images: 0, backgrounds: 0, videos: 0, failed: 0, pending: 0 };
    const tasks = [];
    const track = (p) => { st.pending++; tasks.push(p.then(() => { st.pending--; }, () => { st.pending--; st.failed++; })); };
    const loadImg = (img) => new Promise((res, rej) => {
      const done = () => (img.naturalWidth > 0 ? img.decode().catch(() => {}).then(res) : rej(new Error('битая')));
      if (img.complete) done(); else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', () => rej(new Error('ошибка')), { once: true }); }
    });
    for (const img of document.images) { if (!inView(img.getBoundingClientRect())) continue; st.images++; track(loadImg(img)); }
    const urls = new Set();
    const addUrls = (bg) => { if (!bg || bg === 'none') return; for (const m of bg.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) if (m[2] && !m[2].startsWith('data:')) urls.add(m[2]); };
    for (const el of document.body ? document.body.querySelectorAll('*') : []) {
      const s = getComputedStyle(el);
      const own = s.backgroundImage !== 'none' ? s.backgroundImage : null;
      let pseudo = null;
      for (const p of ['::before', '::after']) { const ps = getComputedStyle(el, p); if (ps.content !== 'none' && ps.backgroundImage !== 'none') pseudo = (pseudo ? pseudo + ',' : '') + ps.backgroundImage; }
      if (!own && !pseudo) continue;
      if (!inView(el.getBoundingClientRect())) continue;
      addUrls(own); addUrls(pseudo);
    }
    for (const u of urls) { st.backgrounds++; const im = new Image(); im.src = u; track(im.decode()); }
    for (const v of document.querySelectorAll('video')) {
      if (!inView(v.getBoundingClientRect())) continue;
      if (v.poster) { const im = new Image(); im.src = v.poster; track(im.decode()); }
      if (v.readyState >= 2 || (v.preload === 'none' && !v.autoplay)) continue;
      st.videos++;
      track(new Promise((res, rej) => { v.addEventListener('loadeddata', res, { once: true }); v.addEventListener('error', () => rej(new Error('видео')), { once: true }); }));
    }
    await Promise.race([Promise.all(tasks), new Promise((r) => setTimeout(r, timeout))]);
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1000))]);
    /* два кадра, чтобы декодированное успело нарисоваться; в фоновой вкладке rAF может не прийти */
    await Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 150))]);
    st.ms = Math.round(performance.now() - t0);
    return st;
  }, { timeout, margin }).catch((e) => ({ images: 0, backgrounds: 0, videos: 0, failed: 0, pending: 0, ms: 0, error: String(e.message || e).slice(0, 120) }));
}

/**
 * Подождать, пока доиграют конечные анимации и переходы (появления блоков,
 * смена картинки), но не дольше maxMs. Бесконечные не ждём. Возвращает,
 * сколько ждали, мс.
 */
export async function settleAnimations(page, maxMs = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const busy = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming && a.effect.getTiming().iterations !== Infinity).length).catch(() => 0);
    if (!busy) return Date.now() - t0;
    await sleep(80);
  }
  return maxMs;
}

/**
 * Снимок окна на высоте y («экран-сегмент»): мгновенная прокрутка, пауза,
 * ожидание картинок в кадре и конца переходов, затем снимок окна. Закреплённые
 * слои (зерно, шапка, нижняя панель) на таком снимке есть всегда — в отличие
 * от снимка всей страницы. file — куда сохранить (иначе вернётся buffer).
 * Возвращает { y, scrollY, offset, file?, buffer?, media }: offset — на сколько
 * страница не доехала до y (низ страницы).
 */
export async function screenSegment(page, y, { file = null, pause = 1200, waitMedia = true, mediaTimeout = 6000, settle = 1500, type = 'png', deadline = 60000 } = {}) {
  assertAlive(page);
  const run = async () => {
    await scrollToY(page, y);
    await sleep(pause);
    const media = waitMedia ? await waitForMedia(page, { timeout: mediaTimeout }) : null;
    if (settle) await settleAnimations(page, settle);
    const scrollY = await currentScroll(page); /* где страница стоит в момент снимка */
    const out = { y, scrollY, offset: Math.max(0, y - scrollY), media };
    if (file) { await page.screenshot({ path: file, type }); out.file = file; } else out.buffer = await page.screenshot({ type });
    return out;
  };
  /* предел на весь снимок: зависшая вкладка даёт ошибку, а не вечное ожидание */
  return withDeadline(run(), deadline + pause + (waitMedia ? mediaTimeout : 0) + (settle || 0), `снимок окна на y=${y}`, page);
}

/**
 * Высоты для снимков окна: равномерно по всей странице, а не первые N.
 * Шаги по step×vh; последний — низ страницы (total − vh); если шагов больше
 * maxShots — берутся равномерно, первый и последний всегда. skipTop — без y=0
 * (первый экран обычно снят отдельно). maxShots: Infinity — все шаги, 0 — ни одного.
 */
export function segmentPositions(total, vh, { step = 0.8, maxShots = 8, skipTop = false } = {}) {
  const px = Math.max(1, Math.round(vh * step)); const bottom = Math.max(0, total - vh);
  const ys = []; for (let y = 0; y < bottom; y += px) ys.push(y);
  if (!ys.length || ys[ys.length - 1] !== bottom) ys.push(bottom);
  let list = skipTop && ys.length > 1 ? ys.slice(1) : ys;
  if (!(maxShots > 0)) return [];
  const n = Number.isFinite(maxShots) ? Math.floor(maxShots) : list.length;
  if (list.length > n) {
    if (n === 1) list = [list[list.length - 1]];
    else { const pick = new Set(); for (let k = 0; k < n; k++) pick.add(Math.round(k * (list.length - 1) / (n - 1))); list = [...pick].sort((a, b) => a - b).map((i) => list[i]); }
  }
  return list;
}

/**
 * Прокрутить страницу до конца, чтобы подгрузилось ленивое и сработали появления.
 *
 * Проход 1 — по шагам step×vh с паузой pause (высота перечитывается на каждом
 * шаге: ленивые блоки удлиняют страницу; не больше maxSteps шагов). onStep({ y,
 * scrollY, index }) вызывается после паузы на каждом шаге — удобно записывать,
 * что видно, пока блок в окне.
 * Проход 2 (только если shotsDir) — снимки окна <tag>-NN.png равномерно по
 * всей итоговой высоте (segmentPositions), перед каждым пауза shotPause
 * (≥1200 мс) и ожидание картинок в кадре. sheet: true — ещё и лист
 * миниатюр <tag>-sheet.png, чтобы открыть всю страницу одним файлом.
 * В конце возврат наверх.
 *
 * Возвращает { pageHeight, screens, initialHeight, maxScrollY, reachedBottom,
 * stuck, capped, scroller, shots: [{ file, y, scrollY, media }], sheet }.
 * stuck — страница выше окна, но не прокрутилась (overflow:hidden на html/body,
 * заставка держит прокрутку) — тогда и снимки, и появления недостоверны.
 */
export async function scrollThrough(page, { step = 0.8, pause = 350, shotsDir = null, tag = 'scroll', maxShots = 8, shotPause = 1200, waitMedia = true, mediaTimeout = 6000, skipTop = false, maxSteps = 150, onStep = null, sheet = false } = {}) {
  const vh = (page.viewport() || {}).height || await page.evaluate(() => innerHeight); const px = Math.max(1, Math.round(vh * step));
  const scroller = await page.evaluate(detectScrollerInPage).catch(() => ({ kind: 'document' }));
  const initialHeight = await pageHeight(page);
  let total = initialHeight; let n = 0; let maxY = 0;
  for (let y = 0; y < total && n < maxSteps; y += px) {
    await scrollToY(page, y); await sleep(pause);
    /* где страница стоит после паузы: скрипт сайта мог вернуть её назад */
    const sy = await currentScroll(page);
    if (sy > maxY) maxY = sy;
    if (onStep) await onStep({ y, scrollY: sy, index: n });
    n++;
    total = await pageHeight(page);
  }
  /* низ страницы: шаги могли остановиться чуть выше */
  if (maxY < total - vh - 2) { await scrollToY(page, total); await sleep(pause); const sy = await currentScroll(page); if (sy > maxY) maxY = sy; total = await pageHeight(page); }
  const shots = [];
  if (shotsDir) {
    ensureDir(shotsDir);
    const ys = segmentPositions(total, vh, { step, maxShots, skipTop });
    for (let k = 0; k < ys.length; k++) {
      const file = path.join(shotsDir, `${tag}-${String(k).padStart(2, '0')}.png`);
      const s = await screenSegment(page, ys[k], { file, pause: shotPause, waitMedia, mediaTimeout });
      shots.push({ file: path.basename(file), y: ys[k], scrollY: s.scrollY, media: s.media });
    }
  }
  let sheetFile = null;
  if (sheet && shots.length) { const r = await contactSheet(shots.map((s) => path.join(shotsDir, s.file)), path.join(shotsDir, `${tag}-sheet.png`), { labels: shots.map((s) => `${s.file} · y ${s.scrollY}`) }); sheetFile = r ? path.basename(r.file) : null; }
  await scrollToY(page, 0); await sleep(300);
  return { pageHeight: total, screens: n, initialHeight, maxScrollY: maxY, reachedBottom: maxY >= total - vh - 2, stuck: total > vh + 50 && maxY < 5, capped: n >= maxSteps, scroller, shots, sheet: sheetFile };
}

/**
 * Остановить движение перед снимком для сравнения: конечные анимации
 * доигрываются до конца (блоки появления остаются показанными), бесконечные
 * ставятся на паузу в начальной фазе (currentTime = 0 — иначе бегущая строка
 * в двух прогонах стоит в разных местах и diff видит «изменения»), переходы
 * отключаются. Движение, которое рисует JS (холсты, GSAP), так не остановить.
 */
export async function freezeMotion(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}' });
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      try { if (t.iterations === Infinity) { a.pause(); a.currentTime = 0; } else a.finish(); } catch { /* уже закончена или без конца */ }
    }
  });
  await sleep(200);
}

/* ---------- снимки ---------- */

/** Оговорка для сводок: чего не видно на снимке всей страницы. */
export const FULLPAGE_NOTE = 'Снимок всей страницы (способы full и dpr1) показывает закреплённые слои — зерно, шапку, нижнюю панель — только в верхнем экране: ниже их нет. Фактуру и закреплённое смотреть по снимкам окна (*-scroll-NN.png) или по снимку, склеенному из снимков окна (способ segments).';

/**
 * Снимок всей страницы. У Chrome есть предел высоты снимка около 16 тысяч
 * пикселей в устройстве: выше него полноэкранный снимок молча повторяет верх
 * страницы. Поэтому (mode 'auto'): высота × масштаб укладывается — обычный
 * снимок; не укладывается — масштаб ×1; не укладывается и так — сегменты по
 * высоте окна, склеенные sharp.
 * mode 'segments' — всегда склеивать из снимков окна (с ожиданием картинок
 * в каждом): закреплённые слои попадают в каждый сегмент, как их видит
 * человек при прокрутке. См. FULLPAGE_NOTE.
 * Возвращает способ съёмки: 'full' | 'dpr1' | 'segments' | 'dpr1-overflow'.
 */
export async function fullPageShot(page, file, { mode = 'auto' } = {}) {
  const LIMIT = 16000;
  const vp = page.viewport(); const dpr = vp.deviceScaleFactor || 1;
  const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(200);
  if (mode !== 'segments') {
    if (h * dpr <= LIMIT) { await page.screenshot({ path: file, fullPage: true }); return 'full'; }
    if (h <= LIMIT) {
      await page.setViewport({ ...vp, deviceScaleFactor: 1 }); await sleep(400);
      await page.screenshot({ path: file, fullPage: true });
      await page.setViewport(vp); await sleep(300);
      return 'dpr1';
    }
  }
  const sharp = loadSharp();
  if (!sharp) { await page.setViewport({ ...vp, deviceScaleFactor: 1 }); await page.screenshot({ path: file, fullPage: true }); await page.setViewport(vp); return 'dpr1-overflow'; }
  /* масштаб склейки: как у экрана, если итог не огромный; иначе ×1 */
  const scale = h * dpr <= LIMIT ? dpr : 1;
  if (scale !== dpr) { await page.setViewport({ ...vp, deviceScaleFactor: scale }); await sleep(400); }
  const vh = vp.height; const W = Math.round(vp.width * scale); const H = Math.round(h * scale); const parts = [];
  for (let y = 0; y < h; y += vh) {
    const seg = await screenSegment(page, y, { pause: 250, mediaTimeout: 3000, settle: 500 });
    const img = sharp(seg.buffer); const meta = await img.metadata();
    const top = Math.min(meta.height - 1, Math.floor(seg.offset * scale));
    const cut = Math.max(1, Math.min(meta.height - top, Math.round(Math.min(vh, h - y) * scale), H - Math.round(y * scale)));
    parts.push({ input: await img.extract({ left: 0, top, width: Math.min(W, meta.width), height: cut }).png().toBuffer(), top: Math.round(y * scale), left: 0 });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(parts).png().toFile(file);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  if (scale !== dpr) { await page.setViewport(vp); }
  await sleep(300);
  return 'segments';
}

/**
 * Лист миниатюр: несколько снимков одним файлом (сетка cols колонок, ширина
 * миниатюры width), чтобы открыть всю страницу разом. labels — подписи под
 * миниатюрами (по умолчанию имена файлов). Нужен sharp; без него — null.
 * Возвращает { file, count, width, height }.
 */
export async function contactSheet(files, outFile, { cols = 4, width = 360, gap = 8, labels = null, background = '#8a8a8a' } = {}) {
  const sharp = loadSharp(); if (!sharp) return null;
  const list = files.filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
  if (!list.length) return null;
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const LABEL = 22;
  const thumbs = [];
  for (let i = 0; i < list.length; i++) {
    const buf = await sharp(list[i]).resize({ width }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    thumbs.push({ buf, h: meta.height, label: labels && labels[i] != null ? labels[i] : path.basename(list[i]) });
  }
  const c = Math.max(1, Math.min(cols, thumbs.length)); const rows = Math.ceil(thumbs.length / c);
  const rowH = []; for (let r = 0; r < rows; r++) rowH.push(Math.max(...thumbs.slice(r * c, r * c + c).map((t) => t.h)) + LABEL);
  const W = c * width + (c + 1) * gap; const H = rowH.reduce((a, b) => a + b, 0) + (rows + 1) * gap;
  const parts = []; let y = gap;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < c; k++) {
      const t = thumbs[r * c + k]; if (!t) continue;
      const x = gap + k * (width + gap);
      parts.push({ input: t.buf, left: x, top: y });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL}"><rect width="100%" height="100%" fill="#111"/><text x="6" y="16" font-family="Arial, sans-serif" font-size="13" fill="#fff">${esc(t.label)}</text></svg>`;
      parts.push({ input: Buffer.from(svg), left: x, top: y + t.h });
    }
    y += rowH[r] + gap;
  }
  ensureDir(path.dirname(outFile));
  await sharp({ create: { width: W, height: H, channels: 3, background } }).composite(parts).png().toFile(outFile);
  return { file: outFile, count: thumbs.length, width: W, height: H };
}

/* ---------- проверки в странице ---------- */

/* Переполнение по ширине: что торчит за край экрана. Выполняется в странице
   через evaluateWith, sig и eff — зависимости. */
function overflowInPage({ tol, limit }) {
  const de = document.documentElement; const vw = de.clientWidth;
  const csMemo = new Map(); const cs = (e) => { let s = csMemo.get(e); if (!s) { s = getComputedStyle(e); csMemo.set(e, s); } return s; };
  const opMemo = new Map(); const op = (e) => { if (!opMemo.has(e)) opMemo.set(e, eff(e)); return opMemo.get(e); };
  const parentOf = (e) => { if (e.parentElement) return e.parentElement; const r = e.getRootNode && e.getRootNode(); return r && r !== document && r.host ? r.host : null; };
  /* кто становится содержащим блоком для fixed и absolute (и значит обрезает их своим overflow) */
  const fixedCB = (s) => s.transform !== 'none' || s.perspective !== 'none' || s.filter !== 'none' || (s.backdropFilter && s.backdropFilter !== 'none') || /paint|layout|strict|content/.test(s.contain) || /transform|perspective|filter/.test(s.willChange) || (s.containerType && s.containerType !== 'normal');
  const absCB = (s) => s.position !== 'static' || fixedCB(s);
  const clips = (s) => s.overflowX !== 'visible' || /paint|strict|content/.test(s.contain);
  /* ближайший предок, который действительно обрезает элемент по ширине. html и body
     не в счёт: overflow-x:clip на body прячет полосу прокрутки, а не само обрезание.
     Для fixed и absolute в счёт только предки, которые для них содержащий блок;
     закреплённый элемент без трансформированного предка выходит из цепочки целиком. */
  const clipOf = (el) => {
    let mode = cs(el).position;
    for (let p = parentOf(el); p && p !== document.body && p !== de; p = parentOf(p)) {
      const s = cs(p);
      const isCB = mode === 'fixed' ? fixedCB(s) : mode === 'absolute' ? absCB(s) : true;
      if (!isCB) continue;
      if (clips(s)) return p;
      mode = s.position === 'fixed' || s.position === 'absolute' ? s.position : 'flow';
    }
    return null;
  };
  const fixedChain = (el) => { for (let e = el; e && e !== de; e = parentOf(e)) { const p = cs(e).position; if (p === 'fixed' || p === 'sticky') return p; } return null; };
  const infinite = new Set(document.getAnimations().filter((a) => a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity && a.effect.target).map((a) => a.effect.target));
  const movingBetween = (el, stop) => { for (let e = el; e && e !== stop; e = parentOf(e)) if (infinite.has(e)) return true; return false; };
  const crosses = (r) => (r.right > vw + tol && r.left < vw - tol) || (r.left < -tol && r.right > tol);
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const SKIP = /^(script|style|template|noscript|br|wbr|head|link|meta|textarea|option)$/i;
  const out = []; const textWider = []; const panelCut = [];
  const range = document.createRange();
  const textRect = (n) => { range.selectNodeContents(n); return range.getBoundingClientRect(); };
  /* 1. элементы, частично вылезающие за край экрана (целиком за краем — спрятанное меню, не в счёт).
     Попутно — что раздвигает страницу вправо (в том числе невидимое и целиком за краем):
     это причины, если документ шире экрана. */
  const all = document.body.querySelectorAll('*');
  const wide = [];
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (SKIP.test(tag) || (el instanceof SVGElement && tag !== 'svg')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const partly = crosses(r); const beyond = r.right > vw + tol;
    if (!partly && !beyond) continue;
    if (clipOf(el)) continue;
    const o = op(el); const pos = fixedChain(el);
    if (partly && o > 0.05) out.push({ el, sig: sig(el), kind: 'элемент', left: Math.round(r.left), right: Math.round(r.right), fixed: pos === 'fixed', sticky: pos === 'sticky', text: clean(el.innerText || el.textContent) });
    if (beyond && pos !== 'fixed') wide.push({ el, sig: sig(el), left: Math.round(r.left), right: Math.round(r.right), opacity: o, text: clean(el.innerText || el.textContent) });
  }
  /* 2. текст: за краем экрана (FAIL) и шире своей блочной коробки (WARN) */
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const par = n.parentElement; if (!par || SKIP.test(par.tagName)) continue;
    const tr = textRect(n); if (tr.width < 1 || tr.height < 1) continue;
    if (crosses(tr)) {
      if (op(par) <= 0.05) continue;
      const clip = clips(cs(par)) ? par : clipOf(par);
      if (!clip) { const pos = fixedChain(par); out.push({ el: par, sig: sig(par), kind: 'текст', left: Math.round(tr.left), right: Math.round(tr.right), fixed: pos === 'fixed', sticky: pos === 'sticky', text: clean(n.textContent) }); }
      continue;
    }
    if (par instanceof SVGElement) continue;
    let box = par; while (box && box !== document.body && /^(inline|contents)$/.test(cs(box).display)) box = parentOf(box);
    if (!box || box === document.body) continue;
    const br = box.getBoundingClientRect();
    /* допуск — 5% кегля, не меньше 2 px: жирный крупный шрифт законно вылезает боковыми выносами */
    const tolText = Math.max(2, (parseFloat(cs(par).fontSize) || 16) * 0.05);
    if (!(br.width > 0 && (tr.right > br.right + tolText || tr.left < br.left - tolText))) continue;
    if (clips(cs(box)) || op(par) <= 0.05) continue; /* коробка сама обрезает (многоточие) или текста не видно */
    textWider.push({ sig: sig(box), text: clean(n.textContent), textLeft: Math.round(tr.left), textRight: Math.round(tr.right), boxLeft: Math.round(br.left), boxRight: Math.round(br.right) });
  }
  /* 3. закреплённые панели (fixed/sticky с overflow hidden/clip): текст, разрезанный их краем.
     Бегущая строка (бесконечная анимация между текстом и панелью) — не в счёт. */
  for (const p of all) {
    const s = cs(p); if (!((s.position === 'fixed' || s.position === 'sticky') && /hidden|clip/.test(s.overflowX))) continue;
    const pr = p.getBoundingClientRect(); if (pr.width < 1 || pr.height < 1 || op(p) <= 0.05) continue;
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue; const par = n.parentElement; if (!par || SKIP.test(par.tagName)) continue;
      const tr = textRect(n); if (tr.width < 1) continue;
      const cut = (tr.right > pr.right + tol && tr.left < pr.right - tol) || (tr.left < pr.left - tol && tr.right > pr.left + tol);
      if (!cut) continue;
      const clip = clips(cs(par)) ? par : clipOf(par);
      if (clip !== p || movingBetween(par, p) || op(par) <= 0.05) continue;
      panelCut.push({ sig: sig(par), panel: sig(p), text: clean(n.textContent), textLeft: Math.round(tr.left), textRight: Math.round(tr.right), panelLeft: Math.round(pr.left), panelRight: Math.round(pr.right) });
    }
  }
  /* только самые внешние нарушители: ребёнок торчащего блока торчит вместе с ним */
  const outer = out.filter((o) => !out.some((p) => p.el !== o.el && p.el.contains(o.el))).filter((o, i, a) => a.findIndex((x) => x.el === o.el) === i).map(({ el, ...rest }) => rest);
  const uniq = (list, key) => list.filter((x, i, a) => a.findIndex((y) => key(y) === key(x)) === i);
  const tw = uniq(textWider, (x) => x.sig + x.text);
  const pc = uniq(panelCut, (x) => x.sig + x.text);
  /* документ шире экрана: если overflow-x окна (от html, иначе от body) не hidden/clip —
     человек может уехать вбок (FAIL); если спрятано — полосы нет, но на телефоне раскладка
     всё равно раздвигается, и закреплённые панели растягиваются шире экрана (WARN) */
  const docWider = de.scrollWidth > vw + tol;
  const vpOverflow = cs(de).overflowX !== 'visible' ? cs(de).overflowX : cs(document.body).overflowX;
  const sideScroll = docWider && !/hidden|clip/.test(vpOverflow);
  const wideCauses = docWider ? wide.filter((o) => !wide.some((p) => p.el !== o.el && p.el.contains(o.el))).sort((a, b) => b.right - a.right).slice(0, limit).map(({ el, ...rest }) => rest) : [];
  return {
    vw, docScrollWidth: de.scrollWidth, bodyOverflowX: cs(document.body).overflowX, htmlOverflowX: cs(de).overflowX,
    docWider, sideScroll, wideCauses,
    count: outer.length, outer: outer.slice(0, limit), textWider: tw.slice(0, limit), textWiderCount: tw.length, panelCut: pc.slice(0, limit), panelCutCount: pc.length,
    verdict: outer.length || sideScroll ? 'FAIL' : docWider || tw.length || pc.length ? 'WARN' : 'OK',
  };
}

/**
 * Горизонтальное переполнение по элементам, а не по scrollWidth документа:
 * закреплённые (fixed) элементы в scrollWidth не входят вовсе, а overflow-x:clip
 * на body прячет полосу прокрутки, поэтому проверка «scrollWidth > innerWidth»
 * слепа к вылезающей нижней панели на 320 px.
 *
 * FAIL (outer) — видимый элемент или текст частично за краем экрана, и его не
 * обрезает предок с overflow ≠ visible (html и body не в счёт; для fixed и
 * absolute учитываются только предки, которые для них содержащий блок).
 * Бегущая строка и карусель внутри overflow:hidden — не ошибка.
 * WARN textWider — текст шире своей блочной коробки (подпись вылезает из кнопки).
 * WARN panelCut — текст обрезан краем закреплённой панели (fixed/sticky с
 * overflow hidden/clip), и это не бесконечная анимация.
 * Документ шире экрана (docWider) — причины в wideCauses, включая невидимые
 * (opacity 0) и целиком ушедшие вправо: FAIL, если вбок можно уехать
 * (sideScroll: overflow-x окна не hidden/clip), иначе WARN — полосы нет, но на
 * телефоне раскладка раздвигается и закреплённые панели растягиваются.
 * Прозрачное (итоговая opacity ≤ 0.05) в outer не считается; поэтому звать
 * после scrollThrough, когда блоки появления уже показаны.
 * Возвращает { verdict, vw, docScrollWidth, docWider, sideScroll, wideCauses[],
 * bodyOverflowX, htmlOverflowX, count, outer[], textWider[], panelCut[], summary }
 * — summary готовая строка для протокола.
 */
export async function findOverflow(page, { tolerance = 1, limit = 20 } = {}) {
  const r = await evaluateWith(page, overflowInPage, { tol: tolerance, limit }, { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN });
  const fmt = (o) => `${o.sig}${o.fixed ? ' [fixed]' : o.sticky ? ' [sticky]' : ''} ${o.left}…${o.right}px${o.text ? ` «${o.text}»` : ''}`;
  r.summary = r.outer.length
    ? `за краем экрана ${r.vw}px: ${r.outer.slice(0, 5).map(fmt).join(' | ')}${r.count > 5 ? ` и ещё ${r.count - 5}` : ''} (scrollWidth документа ${r.docScrollWidth})`
    : `за край экрана ${r.vw}px ничего не торчит (scrollWidth документа ${r.docScrollWidth})`;
  if (r.docWider) r.summary += ` · страница шире экрана на ${r.docScrollWidth - r.vw}px${r.sideScroll ? ', можно уехать вбок' : ' (полоса спрятана overflow-x)'}: ${r.wideCauses.slice(0, 3).map((o) => `${o.sig} до ${o.right}px${o.opacity <= 0.05 ? ' [невидимый]' : ''}`).join(' | ') || 'причина не найдена'}`;
  if (r.textWiderCount) r.summary += ` · текст шире коробки: ${r.textWider.slice(0, 3).map((t) => `${t.sig} «${t.text}» ${t.textRight}>${t.boxRight}px`).join(' | ')}`;
  if (r.panelCutCount) r.summary += ` · обрезано панелью: ${r.panelCut.slice(0, 3).map((t) => `${t.panel} «${t.text}» до ${t.textRight}px при краю ${t.panelRight}px`).join(' | ')}`;
  return r;
}

/**
 * Холсты страницы без создания контекстов: тип контекста берётся из перехвата
 * (canvas.__rwCtx, ставится в preparePage), а не пробным getContext.
 * ctx: '2d' | 'webgl' | 'webgl2' | 'bitmaprenderer' | 'webgpu' | 'offscreen' |
 * null (страница контекст ещё не брала — рисовать нечем, это не «пустой холст»).
 * ratioCss = буфер / ширина в CSS-пикселях (< 0.85 — размыт на любом экране),
 * ratioDevice = буфер / (ширина × devicePixelRatio), aspectOff — расхождение
 * пропорций буфера и показа в процентах.
 */
export async function canvasList(page) {
  return evaluateWith(page, () => [...document.querySelectorAll('canvas')].map((c) => {
    const r = c.getBoundingClientRect(); const dpr = devicePixelRatio || 1; const cw = c.clientWidth, ch = c.clientHeight;
    const rx = cw ? c.width / cw : null, ry = ch ? c.height / ch : null;
    return {
      sig: sig(c), ctx: c.__rwCtx || null, attrs: c.__rwCtxAttrs || null, width: c.width, height: c.height, clientWidth: cw, clientHeight: ch, dpr,
      ratioCss: rx && ry ? Math.round(Math.min(rx, ry) * 100) / 100 : null, ratioDevice: rx && ry ? Math.round(Math.min(rx, ry) / dpr * 100) / 100 : null,
      aspectOff: rx && ry ? Math.round(Math.abs(rx / ry - 1) * 100) : null, opacity: eff(c),
      inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, top: Math.round(r.top + scrollY),
    };
  }), null, { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN });
}

/** Перевести список CSS-цветов в hex в этой странице (см. HEX_FN): ['oklch(…)'] → ['#E24A3C']. */
export async function hexColors(page, colors) { return evaluateWith(page, (list) => list.map((c) => hex(c)), [...colors], { hex: HEX_FN }); }

/**
 * Итоговая непрозрачность: effectiveOpacity(elementHandle) или
 * effectiveOpacity(page, 'селектор') — первого совпадения. Число 0…1, null — не найден.
 */
export async function effectiveOpacity(pageOrHandle, selector = null) {
  if (selector) return evaluateWith(pageOrHandle, (sel) => { const el = document.querySelector(sel); return el ? eff(el) : null; }, selector, { eff: EFFECTIVE_OPACITY_FN });
  /* функция собирается здесь из исходника: у ElementHandle.evaluate нет подстановки зависимостей */
  return pageOrHandle.evaluate(new Function('el', `return (${EFFECTIVE_OPACITY_FN})(el);`));
}

/* ---------- прочее ---------- */

/** Байты и количество запросов по типам ресурсов. */
export function summarizeRequests(requests) {
  const by = {};
  for (const r of requests) { const t = r.type || 'other'; by[t] = by[t] || { count: 0, bytes: 0 }; by[t].count++; by[t].bytes += r.bytes || 0; }
  const largest = [...requests].filter((r) => r.bytes).sort((a, b) => b.bytes - a.bytes).slice(0, 10).map((r) => ({ url: r.url.slice(0, 120), type: r.type, kb: Math.round(r.bytes / 1024) }));
  const total = requests.reduce((a, r) => a + (r.bytes || 0), 0);
  return { byType: by, totalKb: Math.round(total / 1024), largest, count: requests.length, fromCache: requests.filter((r) => r.fromCache).length, unknownSize: requests.filter((r) => !r.bytes && !r.fromCache && r.status !== 204 && !(r.status >= 300 && r.status < 400)).length };
}

/**
 * Аргументы: --out dir --name slug; флаг без значения даёт true; остальное — позиционные.
 * Ещё: запись --key=value; «--» — дальше только позиционные; значение,
 * начинающееся с «--», берётся, если не похоже на имя флага («--note "--scroll
 * прошёл"» → заметка) или если ключ перечислен в spec.values.
 * spec: { values: [...ключи, которые всегда берут следующий аргумент], flags: [...ключи без значения] }.
 */
export function parseArgs(argv, { values = [], flags = [] } = {}) {
  const V = new Set(values), F = new Set(flags);
  const looksLikeKey = (s) => s === '--' || /^--[A-Za-z][\w.-]*(=|$)/.test(s);
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 2) { opt[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const k = a.slice(2); const next = argv[i + 1];
      if (F.has(k) || next === undefined) opt[k] = true;
      else if (V.has(k) || !looksLikeKey(String(next))) opt[k] = argv[++i];
      else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

export function slugFromUrl(url) {
  const u = new URL(url);
  /* локальный файл: полный путь в имени папки бессмыслен — два последних сегмента, раскодированные */
  if (u.protocol === 'file:') {
    let p = u.pathname; try { p = decodeURIComponent(p); } catch { /* как есть */ }
    return ('file-' + p.split('/').filter(Boolean).slice(-2).join('-')).replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'file';
  }
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
