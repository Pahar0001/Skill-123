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
 * Браузеры (launch({ browser })): chrome — по умолчанию (CHROME_PATH, Chrome, запасным
 * Edge); edge — Edge (EDGE_PATH), тот же движок и протокол, что у Chrome; firefox —
 * Firefox (FIREFOX_PATH) через WebDriver BiDi. У Firefox нет Chrome DevTools Protocol:
 * замедления процессора и сети, байтов по сети (только content-length), типа запроса
 * (берётся по заголовку Sec-Fetch-Dest и расширению — resourceTypeOf) и эмуляции
 * медиа на вкладке. Тема, «меньше движения» и «касание» в медиазапросах ((hover: none),
 * (pointer: coarse)) задаются Firefox при запуске настройками — launch({ scheme,
 * reducedMotion, mobile }); вкладка с другими значениями пишет в page.rwLimits, чего
 * не получила. meta viewport и события касания Firefox не эмулирует.
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
 *   окна при загрузке  applyDismiss (SITE_REWORK_DISMISS), checkOpenModal, modalNote, dismissNote, dismissLine,
 *                      closeConsent, consentNote — waitForOverlay (и openPage) зовёт первые два сам:
 *                      SITE_REWORK_DISMISS и WARN об открытом окне работают во всех скриптах; нажатие, которое
 *                      увело на другой адрес, — страница открывается заново (page.rwWrongPage — не вышло)
 *   браузеры           parseBrowser, findBrowser, browserInfo, defaultBrowser,
 *                      defaultBrowserHint, resourceTypeOf, BROWSER_NAMES
 *   экраны             VIEWPORTS (+ запись «320x568@2»), parseViewport,
 *                      resolveViewport, pickViewports
 *   прокрутка          scrollThrough, scrollToY, forceInstantScroll,
 *                      screenSegment, waitForMedia, settleAnimations,
 *                      segmentPositions
 *   снимки             fullPageShot (способы full / dpr1 / segments),
 *                      contactSheet, freezeMotion, FULLPAGE_NOTE
 *   проверки           findOverflow, canvasList, hexColors, effectiveOpacity
 *   код для страницы   SIG_FN, HEX_FN, EFFECTIVE_OPACITY_FN, VISIBLE_FN,
 *                      EFFECTIVE_ZOOM_FN, CLIP_SHARE_FN, evaluateWith
 *   Tilda              TILDA_FN, TILDA_SERVICE, IS_TILDA_SERVICE_FN, TILDA_PH, PH_URL,
 *                      tildaInfo — признак и выжимка, служебное конструктора, заглушки
 *                      ленивой загрузки (разбор донора целиком — scripts/tilda.mjs)
 *   свой стиль         addStyleSafe, removeStyleSafe — <style>, а при строгом CSP
 *                      сконструированная таблица (document.adoptedStyleSheets)
 *   версия кода        codeVersion, scriptGenerator, trackModule — поле generator в протоколах
 *   предупреждения     collectWarnings, takeWarnings — WARN из lib (свой стиль не
 *                      вставился, окно, SITE_REWORK_DISMISS) не посреди строки прогресса, а в вердикте скрипта;
 *                      warningKind, warningLabel — вид и подпись строки («окно», «SITE_REWORK_DISMISS»,
 *                      «свой стиль на странице»); collectNotes, takeNotes — то же для строк INFO (нажато)
 *   аргументы          parseArgs (strict — неизвестный флаг даёт ошибку с подсказкой),
 *                      closestFlag, flagsDump (справочник flags-doc.mjs)
 *   прочее             getFfmpeg, findModuleRoot, summarizeRequests,
 *                      runDir, slugFromUrl, pageSlug, capSlug, SLUG_MAX, pagesFrom, unmangle,
 *                      ensureDir, writeJson, readJson, kb, sleep
 *
 * Протоколы пишутся через writeJson: в объект добавляется поле generator —
 * какой скрипт и какой его версией снял протокол: { script, commit, dirty,
 * mtime, lib: { commit, dirty, mtime }, deps? } — deps: подключаемые модули скилла
 * (texture.mjs у a11y, taste.mjs у cliche; import() с вычисленным путём — trackModule). commit — последний коммит файла в git
 * скилла, dirty — есть ли в файле незакоммиченные правки. git вызывается один раз
 * на процесс; без git (или вне репозитория) commit и dirty — null, запись не падает.
 * state.mjs по этому полю предупреждает, что доказательство снято другой версией.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
    let root = base; try { root = whereFrom(req, base, name); } catch { /* встроенный */ }
    return { mod: m && m.default !== undefined ? m.default : m, root };
  };
  /* Установка прямо в домашней папке (npm i без проекта) — случайная, и require из любой папки под
     домашней находит её раньше OWN_ROOT: из папки скилла шёл puppeteer-core 23.11 вместо 25.5.
     Её берём, только если модуля нет больше нигде (или она указана в SITE_REWORK_PROJECT). */
  const same = (a, b) => { const n = (p) => path.resolve(p).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b); };
  const home = os.homedir(); let stray = null;
  for (const root of roots()) {
    let from; try { from = whereFrom(createRequire(path.join(root, 'package.json')), root, name); } catch { continue; }
    if (same(from, home) && !(process.env.SITE_REWORK_PROJECT && same(root, process.env.SITE_REWORK_PROJECT))) { stray = stray || root; continue; }
    try { return load(root); } catch { /* следующий корень */ }
  }
  /* последняя попытка — глобальные пакеты npm (npm i -g puppeteer-core) */
  try { const g = npmGlobalRoot(); if (g) return load(g); } catch { /* нет и там */ }
  if (stray) { try { return load(stray); } catch { /* и там не загрузился */ } }
  return null;
}
/* Папка, в чьей node_modules модуль на самом деле лежит (require ищет и в родителях корня). Модуля нет —
   исключение. */
function whereFrom(req, base, name) {
  const f = req.resolve(name); const i = f.lastIndexOf(`${path.sep}node_modules${path.sep}`);
  return i > 0 ? f.slice(0, i) : base;
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

/* Edge и Firefox для launch({ browser }). Свой путь — EDGE_PATH и FIREFOX_PATH; Firefox ставится и в
   папку пользователя (%LOCALAPPDATA%\Mozilla Firefox) */
const EDGE = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable',
].filter(Boolean);
const FIREFOX = [
  process.env.FIREFOX_PATH,
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Mozilla Firefox', 'firefox.exe') : null,
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  '/usr/bin/firefox', '/usr/lib/firefox/firefox', '/snap/bin/firefox',
].filter(Boolean);

/** Имена браузеров, которые умеет launch: ключ — значение --browser. */
export const BROWSER_NAMES = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox' };

/** Значение --browser → 'chrome' | 'edge' | 'firefox' или null (не знаем такого): ff, msedge, google-chrome — тоже. */
export function parseBrowser(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (/^(chrome|google-?chrome|chromium)$/.test(s)) return 'chrome';
  if (/^(edge|msedge|microsoft-?edge)$/.test(s)) return 'edge';
  if (/^(firefox|ff|mozilla|mozilla-?firefox)$/.test(s)) return 'firefox';
  return null;
}

/** Путь к браузеру или null: findBrowser('firefox'). 'chrome' — как requireChrome: CHROME_PATH, Chrome, запасным Edge. */
export function findBrowser(kind = 'chrome') {
  const list = kind === 'firefox' ? FIREFOX : kind === 'edge' ? EDGE : CHROME;
  return list.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

/* Настройки Firefox, которые у Chrome задаются эмуляцией на вкладке: у Firefox их можно дать только
   при запуске. Тема: 0 — тёмная, 1 — светлая; «меньше движения»: 1 — да, 0 — нет (иначе берётся из
   настроек Windows); указатель: 1 — грубый без наведения (телефон: (hover: none), (pointer: coarse)),
   6 — точный с наведением. file:// — как --allow-file-access-from-files у Chrome */
function firefoxPrefs({ scheme = 'light', reducedMotion = false, mobile = false } = {}) {
  return {
    'layout.css.prefers-color-scheme.content-override': scheme === 'dark' ? 0 : 1,
    'ui.prefersReducedMotion': reducedMotion ? 1 : 0,
    'ui.primaryPointerCapabilities': mobile ? 1 : 6,
    'ui.allPointerCapabilities': mobile ? 1 : 6,
    'security.fileuri.strict_origin_policy': false,
  };
}

/* свойства браузера, которые пишет launch: неперечисляемые, чтобы объект puppeteer выглядел как раньше */
const setHidden = (o, k, v) => { try { Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true }); } catch { /* заморожен */ } };

/* GPU не отключаем намеренно: без него WebGL в безголовом Chrome может не
   подняться, и проверка 3D покажет пустой холст там, где у людей всё работает.
   protocolTimeout — сколько ждать ответа страницы на одну команду: зависшая
   (нехватка памяти, бесконечный цикл) страница даёт ошибку через 90 с, а не
   держит скрипт двадцать минут. Тяжёлой странице — SITE_REWORK_PROTOCOL_TIMEOUT=<мс>
   (по умолчанию для всех скриптов сразу; явный параметр важнее).
   Не запустился — ещё одна попытка через 3 с; в ошибке свободная память и место на диске
   временной папки: 28.09 «Timed out after waiting 30000ms» было не от зависших chrome, а от
   нехватки — 5 Chrome, свободно 2.5 ГБ ОЗУ, на C 0 байт (съел файл подкачки).
   browser: 'chrome' (по умолчанию) | 'edge' | 'firefox' (см. parseBrowser). Firefox запускается через
   WebDriver BiDi; scheme, reducedMotion и mobile нужны только ему (см. firefoxPrefs) — у Chrome и Edge
   это задаёт preparePage на каждой вкладке. У возвращённого браузера неперечисляемые поля: rwKind
   ('chrome' | 'edge' | 'firefox' — по тому, что запустилось: Edge запасным вместо Chrome — 'edge'),
   rwEngine ('chromium' | 'gecko'), rwName, rwVersion ('153.0.8010.53'), rwExe, rwEmulation
   (у Firefox — с какими scheme, reducedMotion, mobile он запущен). Сводка — browserInfo(browser). */
const envProtocolTimeout = () => { const ms = Number(process.env.SITE_REWORK_PROTOCOL_TIMEOUT); return ms > 0 ? ms : 90000; };
/* «свободно ОЗУ 2.5 из 16 ГБ, на диске временной папки 0 МБ» — для ошибки запуска (statfsSync — Node ≥ 18.15) */
function freeResources() {
  const gb = (b) => (b / 2 ** 30).toFixed(1);
  let disk = '';
  try { const s = fs.statfsSync(os.tmpdir()); const free = s.bavail * s.bsize; disk = `, на диске временной папки ${free < 2 ** 30 ? `${Math.round(free / 2 ** 20)} МБ` : `${gb(free)} ГБ`} (${os.tmpdir()})`; } catch { /* старый Node */ }
  return `свободно ОЗУ ${gb(os.freemem())} из ${gb(os.totalmem())} ГБ${disk}`;
}
export async function launch({ headless = true, protocolTimeout = envProtocolTimeout(), browser = 'chrome', scheme = 'light', reducedMotion = false, mobile = false } = {}) {
  const kind = parseBrowser(browser || 'chrome');
  if (!kind) throw new Error(`неизвестный браузер «${browser}» — есть chrome, firefox и edge`);
  const puppeteer = loadPuppeteer();
  let exe;
  if (kind === 'chrome') exe = requireChrome();
  else {
    exe = findBrowser(kind);
    if (!exe) throw new Error(`не найден ${BROWSER_NAMES[kind]} — укажите путь к нему в переменной ${kind === 'firefox' ? 'FIREFOX_PATH' : 'EDGE_PATH'}`);
  }
  const gecko = kind === 'firefox';
  let b;
  for (let attempt = 1; !b; attempt++) {
    try {
      b = await puppeteer.launch(gecko
        ? { browser: 'firefox', executablePath: exe, headless, protocolTimeout, extraPrefsFirefox: firefoxPrefs({ scheme, reducedMotion, mobile }) }
        : { executablePath: exe, headless, protocolTimeout, args: ['--no-sandbox', '--hide-scrollbars', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
    } catch (e) {
      /* «Timed out after 30000 ms while waiting for the WS endpoint…» со стеком puppeteer — назвать, что делать */
      const why = String((e && e.message) || e).split('\n')[0].slice(0, 200);
      const edge = /msedge/i.test(exe);
      /* Edge 153 на части машин в безголовом режиме выходит сразу с кодом 0 и пустым выводом */
      if (edge && /code:?\s*0\b/i.test(String((e && e.message) || e))) throw new Error(`Edge закрылся сразу после запуска без окна (код 0, ${exe}) — у Edge на части машин безголовый режим не работает; проверяйте в Chrome (по умолчанию) или задайте CHROME_PATH`);
      if (attempt < 2) { await sleep(3000); continue; }
      throw new Error(`браузер не запустился (${exe}) с ${attempt} попыток: ${why} — ${freeResources()}; мало памяти или места — закройте лишние браузеры и проверки, освободите диск; иначе закройте зависшие процессы ${gecko ? 'firefox (запущенные проверками, не свой Firefox)' : edge ? 'msedge' : 'chrome'} или задайте ${gecko ? 'FIREFOX_PATH' : edge ? 'EDGE_PATH' : 'CHROME_PATH'} на другой ${gecko ? 'Firefox' : edge ? 'Edge' : 'Chrome'} и повторите`);
    }
  }
  let version = null; try { version = await b.version(); } catch { /* браузер без версии */ }
  const name = gecko ? 'Firefox' : /msedge/i.test(exe) ? 'Edge' : /chromium/i.test(exe) ? 'Chromium' : 'Chrome';
  setHidden(b, 'rwKind', gecko ? 'firefox' : name === 'Edge' ? 'edge' : 'chrome');
  setHidden(b, 'rwEngine', gecko ? 'gecko' : 'chromium');
  setHidden(b, 'rwName', name);
  setHidden(b, 'rwVersion', version ? ((/(\d+(?:\.\d+)+)/.exec(version) || [])[1] || version) : null);
  setHidden(b, 'rwExe', exe);
  setHidden(b, 'rwEmulation', gecko ? { scheme: scheme === 'dark' ? 'dark' : 'light', reducedMotion: !!reducedMotion, mobile: !!mobile } : null);
  return b;
}

/* движок браузера, вкладки или контекста: 'gecko' у Firefox, иначе 'chromium' */
function engineOf(x) {
  try {
    const b = x && typeof x.browser === 'function' ? x.browser() : x;
    if (b && b.rwEngine) return b.rwEngine;
    if (b && b.protocol === 'webDriverBiDi') return 'gecko';
  } catch { /* не браузер */ }
  return 'chromium';
}

/**
 * Сводка о браузере для вывода и протокола: { kind, name, engine, version, exe, label }.
 * label — «Chrome 153.0.8010.53», «Firefox 156.0.1». Принимает браузер из launch (или вкладку);
 * браузер, запущенный не через launch, — { kind: null, name: null, … } с тем, что удалось узнать.
 */
export function browserInfo(x) {
  let b = x; try { if (x && typeof x.browser === 'function') b = x.browser(); } catch { /* сам браузер */ }
  const engine = engineOf(b);
  const name = (b && b.rwName) || null; const version = (b && b.rwVersion) || null;
  return { kind: (b && b.rwKind) || null, name, engine, version, exe: (b && b.rwExe) || null, label: name ? `${name}${version ? ` ${version}` : ''}` : engine === 'gecko' ? 'Firefox' : 'Chromium' };
}

/* Браузер по умолчанию по ProgId из реестра: известные — с именем, движком и значением --browser
   (run: null — отдельным браузером проверки не запускаются) */
const PROGIDS = [
  [/^Firefox(URL|HTML|PDF)/i, 'firefox', 'Firefox', 'gecko', 'firefox'],
  [/^(LibreWolf|Waterfox|Floorp|Zen|TorBrowser|PaleMoon)/i, 'gecko-other', null, 'gecko', 'firefox'],
  [/^(ChromeHTML|ChromeBHTML|ChromeDHTML|ChromeSSHTM|GoogleChrome)/i, 'chrome', 'Chrome', 'chromium', 'chrome'],
  [/^(MSEdge|AppXq0fevzme2pys62n3e0fbqa7peapykr8v)/i, 'edge', 'Edge', 'chromium', 'edge'],
  [/^Yandex/i, 'yandex', 'Яндекс Браузер', 'chromium', null],
  [/^Opera/i, 'opera', 'Opera', 'chromium', null],
  [/^Brave/i, 'brave', 'Brave', 'chromium', null],
  [/^Vivaldi/i, 'vivaldi', 'Vivaldi', 'chromium', null],
  [/^(Chromium|Arc|Thorium)/i, 'chromium-other', null, 'chromium', null],
  [/^(IE\.HTTPS?|htmlfile)$/i, 'ie', 'Internet Explorer', 'trident', null],
];
let defaultBrowserCache;
/**
 * Браузер пользователя по умолчанию — чтобы проверить и в нём: { id, name, engine, run, progId, exe }
 * или null (не Windows, реестр не прочитан). Windows: ProgId из реестра через reg query —
 * HKCU\…\Shell\Associations\UrlAssociations\https (затем http), UserChoiceLatest\ProgId (Windows 11
 * новых сборок), затем UserChoice. id: firefox | chrome | edge | yandex | opera | brave | vivaldi |
 * gecko-other | chromium-other | ie | other; engine: gecko | chromium | trident | null; run — значение
 * --browser, которым его проверить (chrome, edge, firefox), или null; exe — путь из команды открытия
 * (HKCR\<ProgId>\shell\open\command), если он читается и файл есть. Считается один раз за процесс.
 */
export function defaultBrowser() {
  if (defaultBrowserCache !== undefined) return defaultBrowserCache;
  defaultBrowserCache = null;
  if (process.platform !== 'win32') return null;
  /* вывод reg — в кодировке консоли; ProgId и путь к Program Files — латиница, остальное не нужно */
  const q = (key, value) => {
    try {
      const out = execFileSync('reg', ['query', key, ...(value ? ['/v', value] : ['/ve'])], { encoding: 'latin1', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const m = new RegExp(`^\\s*${value ? value : '\\S.*?'}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.+?)\\s*$`, 'mi').exec(out);
      return m ? m[1] : null;
    } catch { return null; }
  };
  const base = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations';
  let progId = null;
  for (const proto of ['https', 'http']) {
    for (const sub of ['UserChoiceLatest\\ProgId', 'UserChoice']) { progId = q(`${base}\\${proto}\\${sub}`, 'ProgId'); if (progId) break; }
    if (progId) break;
  }
  if (!progId) return null;
  const hit = PROGIDS.find(([re]) => re.test(progId));
  const [, id, name, engine, run] = hit || [null, 'other', null, null, null];
  let exe = null;
  const cmd = q(`HKCR\\${progId}\\shell\\open\\command`, null);
  const m = cmd && /^\s*"([^"]+\.exe)"|^\s*(\S+\.exe)/i.exec(cmd);
  if (m) { const p = m[1] || m[2]; try { if (/^[\x20-\x7e]+$/.test(p) && fs.existsSync(p)) exe = p; } catch { /* путь не читается */ } }
  const label = name || (exe ? path.basename(exe, '.exe') : progId.replace(/[-.].*$/, ''));
  defaultBrowserCache = { id, name: label, engine, run, progId, exe };
  return defaultBrowserCache;
}

/**
 * Подсказка о браузере пользователя для первой строки вывода: строка или '' (подсказывать нечего).
 * current — значение --browser прогона ('chrome' | 'edge' | 'firefox'); def — defaultBrowser().
 *   у пользователя по умолчанию Firefox — проверьте и в нём: --browser firefox
 */
export function defaultBrowserHint(current, def = defaultBrowser()) {
  if (!def) return '';
  if (def.run && def.run === current) return def.id === 'gecko-other' ? `у пользователя по умолчанию ${def.name} — движок Firefox, проверка идёт в Firefox` : `у пользователя по умолчанию ${def.name} — проверка идёт в нём`;
  if (def.run) return `у пользователя по умолчанию ${def.name}${def.id === 'gecko-other' ? ' (движок Firefox)' : ''} — проверьте и в нём: --browser ${def.run}`;
  if (def.engine === 'chromium') return current === 'firefox' ? `у пользователя по умолчанию ${def.name} — движок Chromium, как у Chrome: основная проверка — в Chrome (без --browser)` : `у пользователя по умолчанию ${def.name} — движок Chromium, как у Chrome: отдельным браузером он не проверяется`;
  return `у пользователя по умолчанию ${def.name} — скрипты его не запускают, проверьте в нём вручную`;
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
 * Итоговый CSS zoom элемента (1 — без масштаба): во сколько раз он на экране крупнее своих вычисленных
 * размеров. getComputedStyle отдаёт кегль, отступы, радиусы и рамки БЕЗ zoom предков, а
 * getBoundingClientRect (Chrome 128+) — уже с ним. Tilda при upscale=window масштабирует элементы
 * Zero Block именно так: madeon.studio при 1440 — zoom 1.2, computed font-size 40px, на экране 48px.
 * Все px из getComputedStyle, которые сравниваются с экраном, умножать на это число.
 * Порядок: el.currentCSSZoom (Chrome 128+, Firefox 126+) → произведение computed zoom предков
 * (старый Chrome) → у Tilda без zoom (масштаб transform-обёрткой .t396__scale-wrapper в старом
 * Firefox) — tn['ab'+recid].scaleFactor, иначе window.tn_scale_factor. Округление до 4 знаков
 * (1.2000000476837158 → 1.2). Исходник для eval внутри страницы:
 *   evaluateWith(page, () => parseFloat(getComputedStyle(el).fontSize) * zoom(el), null, { zoom: EFFECTIVE_ZOOM_FN })
 */
export const EFFECTIVE_ZOOM_FN = `(el) => {
  if (!el || el.nodeType !== 1) return 1;
  let z = null;
  try { if (typeof el.currentCSSZoom === 'number' && el.currentCSSZoom > 0) z = el.currentCSSZoom; } catch (e) { /* старый браузер */ }
  if (z === null) { z = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const v = parseFloat(getComputedStyle(e).zoom); if (v > 0 && v !== 1) z *= v; } }
  if (Math.abs(z - 1) < 0.002 && el.closest) {
    const ab = el.closest('.t396__artboard_scale');
    if (ab && el.closest('.t396__scale-wrapper')) {
      const id = ab.getAttribute('data-artboard-recid'); const tn = window.tn || {};
      const f = (tn['ab' + id] && tn['ab' + id].scaleFactor) || window.tn_scale_factor;
      if (f > 0) z = f;
    }
  }
  return Math.round(z * 10000) / 10000;
}`;

/**
 * Доля коробки элемента, видимая после обрезки предками с overflow hidden/clip/scroll/auto
 * (и clip-path у предка), 0…1. Закреплённый (fixed) элемент выходит из цепочки на первом fixed.
 * 0 — обрезан целиком: заглушка «Zero Block» за краем артборда Tilda высотой 0, свёрнутое меню,
 * элементы другого брейкпоинта за краем артборда. Коробки без размера — 0. Исходник для eval.
 */
export const CLIP_SHARE_FN = `(el) => {
  if (!el || el.nodeType !== 1) return 0;
  const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return 0;
  let L = r.left, T = r.top, R = r.right, B = r.bottom;
  if (getComputedStyle(el).position !== 'fixed') {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p); const cp = !!s.clipPath && s.clipPath !== 'none';
      const cx = s.overflowX !== 'visible' || cp, cy = s.overflowY !== 'visible' || cp;
      if (cx || cy) {
        const q = p.getBoundingClientRect();
        if (cx) { L = Math.max(L, q.left); R = Math.min(R, q.right); }
        if (cy) { T = Math.max(T, q.top); B = Math.min(B, q.bottom); }
        if (R <= L || B <= T) return 0;
      }
      if (s.position === 'fixed') break;
    }
  }
  return Math.round(Math.max(0, R - L) * Math.max(0, B - T) / (r.width * r.height) * 1000) / 1000;
}`;

/* ---------- Tilda: признак, выжимка, служебное ---------- */

/**
 * Служебное конструктора Tilda — не язык донора: плашка «Made on Tilda» (#tildacopy, .t-tildalabel),
 * служебная обёртка телефона .t-mbfix, полоса загрузки T360 (.t360__progress — её вставляет скрипт
 * блока T360 в body), ссылка-пропуск, окно cookie конструктора. Не входит в палитру, шкалу, кнопки,
 * секции, типографику и движение. Заглушки «Zero Block» за краем артборда — не селектор, а обрезка
 * (CLIP_SHARE_FN = 0 внутри .t396__artboard).
 */
export const TILDA_SERVICE = '#tildacopy, .t-tildalabel, .t-mbfix, .t360__progress, .t-skiplink, #t-cookie';

/** Служебное ли Tilda: (el) => true | false. Исходник для eval внутри страницы. */
export const IS_TILDA_SERVICE_FN = `(el) => { try { return !!(el && el.nodeType === 1 && el.closest(${JSON.stringify(TILDA_SERVICE)})); } catch (e) { return false; } }`;

/**
 * Заглушка ленивой загрузки Tilda в адресе картинки: …/-/resize/20x/…, …/-/resizeb/20x/…, …/-/empty/…
 * (thb.tildacdn.com, optim.tildacdn.com). До прокрутки у Tilda на месте фото и фонов — они.
 */
export const TILDA_PH = /\/-\/(resizeb?\/\d{1,2}x\d{0,2}|empty)\//i;
/**
 * Заглушка ленивой загрузки вообще: адрес Tilda (TILDA_PH) и обычные lqip, placeholder, blank, spacer,
 * lazyload-картинки. Раньше жило в perf.mjs (mediaInPage); в evaluateWith передаётся как есть:
 * { PH_URL } — RegExp подставляется литералом.
 */
export const PH_URL = /\/-\/(resizeb?\/\d{1,2}x\d{0,2}|empty)\/|(lqip|placeholder|blank|spacer|lazy[-_]?load)[^/]*\.(gif|png|jpe?g|webp)(\?|#|$)/i;

/**
 * Признак Tilda и выжимка — одна для discover, extract, cliche, motion и clicks. () => объект:
 *   { tilda: false } — не Tilda; иначе
 *   { tilda: true, pageId, projectId, alias, lazy (data-tilda-lazy=yes), animationOff (data-blocks-animationoff
 *     =yes — Tilda не запускает появления нигде), vw, narrow (ширина < 1200: Tilda сама снимает все появления,
 *     кроме элементов Zero Block с data-animate-mobile="y"; пошаговые SBS, параллакс и фиксация Zero Block без
 *     этого атрибута тоже выключены при брейкпоинте артборда < 1200), appearNow ('все' | 'только Zero с
 *     data-animate-mobile=y' | 'нет (data-blocks-animationoff)'), mobileY (элементов с data-animate-mobile=y),
 *     artboards, upscaleWindow (артбордов с upscale=window), curResolution (брейкпоинт первого артборда
 *     сейчас), scaleFactor (наибольший коэффициент масштаба Zero Block сейчас: tn['ab'+recid].scaleFactor,
 *     tn_scale_factor; 1 — нет масштаба), madeOnTilda (есть плашка), service (узлов TILDA_SERVICE) }
 * Признак: #allrecords.t-records с data-tilda-page-id, блоки .t-rec[data-record-type] или t_onReady.
 * Исходник для eval внутри страницы: evaluateWith(page, () => tilda(), null, { tilda: TILDA_FN }).
 */
export const TILDA_FN = `() => {
  const root = document.getElementById('allrecords') || document.querySelector('.t-records');
  const tilda = !!(root && root.hasAttribute('data-tilda-page-id')) || !!document.querySelector('.t-rec[data-record-type]') || typeof window.t_onReady === 'function';
  if (!tilda) return { tilda: false };
  const ra = (n) => (root ? root.getAttribute(n) : null);
  const vw = window.innerWidth;
  const animationOff = ra('data-blocks-animationoff') === 'yes';
  const mobileY = document.querySelectorAll('[data-animate-mobile="y"]').length;
  const abs = [...document.querySelectorAll('.t396__artboard')];
  const tn = window.tn || null; let scale = 1; let curRes = null; let win = 0;
  for (const ab of abs) {
    const id = ab.getAttribute('data-artboard-recid');
    const screens = String(ab.getAttribute('data-artboard-screens') || '').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
    let res = null; for (const s of screens) if (vw >= s) res = s; if (res === null && screens.length) res = screens[0];
    if (curRes === null) curRes = (tn && tn['ab' + id] && tn['ab' + id].curResolution) || res;
    if (ab.getAttribute('data-artboard-upscale') === 'window') win++;
    const f = tn && tn['ab' + id] && tn['ab' + id].scaleFactor; if (f > scale) scale = f;
  }
  if (window.tn_scale_factor > scale) scale = window.tn_scale_factor;
  let service = 0; try { service = document.querySelectorAll(${JSON.stringify(TILDA_SERVICE)}).length; } catch (e) { /* селектор */ }
  return {
    tilda: true, pageId: ra('data-tilda-page-id'), projectId: ra('data-tilda-project-id'), alias: ra('data-tilda-page-alias'),
    lazy: ra('data-tilda-lazy') === 'yes', animationOff, vw, narrow: vw < 1200,
    appearNow: animationOff ? 'нет (data-blocks-animationoff)' : vw < 1200 ? 'только Zero с data-animate-mobile=y' : 'все', mobileY,
    artboards: abs.length, upscaleWindow: win, curResolution: curRes, scaleFactor: Math.round(scale * 1000) / 1000,
    madeOnTilda: !!document.querySelector('#tildacopy, .t-tildalabel'), service,
  };
}`;

/** Выжимка Tilda для вкладки (TILDA_FN): { tilda: false } — не Tilda; ошибка страницы — тоже { tilda: false, error }. */
export async function tildaInfo(page) {
  try { return await evaluateWith(page, () => tilda(), null, { tilda: TILDA_FN }); } catch (e) { return { tilda: false, error: String((e && e.message) || e).slice(0, 120) }; }
}

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
    /* кадры WebGL: когда страница рисовала в последний раз и при каком размере буфера. По ним проверка
       холста отличает «ни разу не рисовала» от «рисует только по событию, и показанный кадр потерян»
       (без preserveDrawingBuffer браузер его не восстанавливает, смена размера буфера его стирает):
       canvas.__rwDraws — вызовов рисования, __rwFrames — кадров (вызовы дальше 8 мс друг от друга),
       __rwDrawAt — performance.now() последнего, __rwDrawSize — «ширина×высота» буфера при нём */
    const DRAW = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear'];
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      const CP = C && C.prototype; if (!CP) continue;
      for (const m of DRAW) {
        const f = CP[m]; if (typeof f !== 'function' || f.__rwHooked) continue;
        const w = function (...a) {
          const cv = this && this.canvas;
          if (cv) { try { const now = performance.now(); if (!(now - (cv.__rwDrawAt || -1e9) < 8)) cv.__rwFrames = (cv.__rwFrames || 0) + 1; cv.__rwDraws = (cv.__rwDraws || 0) + 1; cv.__rwDrawAt = now; cv.__rwDrawSize = cv.width + '×' + cv.height; } catch (e) { /* холст заморожен */ } }
          return f.apply(this, a);
        };
        Object.defineProperty(w, '__rwHooked', { value: true });
        try { Object.defineProperty(w, 'toString', { value: () => f.toString(), configurable: true }); } catch (e) { /* нет */ }
        try { CP[m] = w; } catch (e) { /* свойство только для чтения */ }
      }
    }
  } catch (e) { /* не страница с холстами */ }
}

/**
 * Тип запроса, как resourceType() у Chrome ('document', 'script', 'stylesheet', 'image', 'font',
 * 'media', 'fetch', 'xhr', 'other'…). В Firefox (WebDriver BiDi) resourceType() бросает — там тип
 * берётся по заголовку Sec-Fetch-Dest (его шлют на https и localhost; 'empty' — fetch или XHR,
 * отдаётся как 'fetch'), затем по навигации и расширению файла. Никогда не бросает.
 */
const DEST_TYPES = { document: 'document', iframe: 'document', frame: 'document', script: 'script', worker: 'script', sharedworker: 'script', serviceworker: 'script', style: 'stylesheet', image: 'image', font: 'font', audio: 'media', video: 'media', track: 'texttrack', manifest: 'manifest', empty: 'fetch' };
export function resourceTypeOf(req) {
  try { return req.resourceType(); } catch { /* Firefox: нет в BiDi */ }
  let dest = ''; try { dest = String((req.headers() || {})['sec-fetch-dest'] || '').toLowerCase(); } catch { /* без заголовков */ }
  if (DEST_TYPES[dest]) return DEST_TYPES[dest];
  try { if (req.isNavigationRequest()) return 'document'; } catch { /* нет */ }
  let p = ''; try { p = new URL(req.url()).pathname.toLowerCase(); } catch { /* data: и прочее */ }
  if (/\.(m?js|cjs)$/.test(p)) return 'script';
  if (/\.css$/.test(p)) return 'stylesheet';
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/.test(p)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)$/.test(p)) return 'font';
  if (/\.(mp4|webm|ogg|ogv|mp3|m4a|wav|mov|m3u8|mpd)$/.test(p)) return 'media';
  return 'other';
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
 * hookCanvas (true — перехват getContext, тип контекста в canvas.__rwCtx; у WebGL ещё и
 * кадры: __rwDraws, __rwFrames, __rwDrawAt, __rwDrawSize), trackBytes (true — байты через CDP).
 *
 * Firefox (браузер из launch({ browser: 'firefox' })): медиа на вкладке не эмулируются — тема,
 * «меньше движения» и указатель телефона взяты из запуска; если вкладка просит другое, и что
 * вообще не эмулируется (meta viewport, события касания), — строками в page.rwLimits
 * («не поддерживается в Firefox: …»); байты — только по content-length (page.rwBytesFrom).
 */
export async function preparePage(browser, vp, { scheme = 'light', reducedMotion = false, userAgent = null, hookCanvas = true, trackBytes = true } = {}) {
  const gecko = engineOf(browser) === 'gecko';
  const page = guardPage(await browser.newPage());
  const limits = [];
  await page.setViewport(vp);
  const ua = userAgent || vp.ua || (vp.isMobile ? (vp.width > 600 ? TABLET_UA : MOBILE_UA) : null);
  if (ua) { try { await page.setUserAgent(ua); } catch (e) { if (!gecko) throw e; limits.push(`свой агент (User-Agent) не поставился: ${String((e && e.message) || e).split('\n')[0].slice(0, 80)}`); } }
  if (gecko) {
    /* у Firefox нет эмуляции медиа на вкладке: всё это задано при запуске (launch → firefoxPrefs) */
    let b = browser; try { if (typeof browser.browser === 'function') b = browser.browser(); } catch { /* сам браузер */ }
    const em = b && b.rwEmulation;
    const want = scheme === 'dark' ? 'dark' : 'light';
    if (!em) limits.push('тема и «меньше движения» не заданы: Firefox запущен не через lib.launch — страница видит настройки системы');
    else {
      if (scheme !== 'light' && scheme !== 'dark') limits.push(`тема «${scheme}» не задаётся — страница видит «${em.scheme}»`);
      else if (want !== em.scheme) limits.push(`тема «${want}» на этой вкладке не включается — Firefox запущен с «${em.scheme}» (тема задаётся при запуске)`);
      if (!!reducedMotion !== em.reducedMotion) limits.push(`«меньше движения» ${reducedMotion ? 'не включается' : 'не выключается'} на этой вкладке — Firefox запущен ${em.reducedMotion ? 'с ним' : 'без него'} (задаётся при запуске)`);
      if (!!vp.isMobile !== em.mobile) limits.push(`указатель ${vp.isMobile ? 'телефона ((hover: none), (pointer: coarse))' : 'компьютера'} не включается на этой вкладке — Firefox запущен для ${em.mobile ? 'телефона' : 'компьютера'}`);
    }
    if (vp.isMobile) limits.push('телефон — частично: размер, плотность, агент и указатель ((hover: none), (pointer: coarse)) есть, а meta viewport и события касания Firefox не эмулирует — вёрстку телефона смотреть в Chrome');
  } else {
    const feats = [{ name: 'prefers-color-scheme', value: scheme }];
    if (reducedMotion) feats.push({ name: 'prefers-reduced-motion', value: 'reduce' });
    await page.emulateMediaFeatures(feats);
  }
  page.rwLimits = limits;
  page.rwBytesFrom = gecko ? 'content-length' : 'cdp';
  if (hookCanvas) await page.evaluateOnNewDocument(canvasHook);
  const log = { console: [], errors: [], failed: [], requests: [] };
  /* поколение журнала: resetPageLog (нажатие SITE_REWORK_DISMISS увело — нужная страница открыта заново) начинает новое;
     ответы и сбои запросов, отправленных раньше (промежуточная страница), в журнал уже не идут */
  page.rwLogGen = 0; const sentGen = new WeakMap();
  const stale = (req) => { const g = sentGen.get(req); return g !== undefined && g < page.rwLogGen; };
  page.on('request', (r) => sentGen.set(r, page.rwLogGen));
  /* нарушение CSP от нашего же стиля (addStyleSafe пробует <style>) — не ошибка сайта: такие
     сообщения узнаются по sha256 нашего CSS и в журнал не идут */
  /* предупреждение у Firefox (BiDi) — 'warn', у Chrome — 'warning': в журнал одним именем */
  page.on('console', (m) => { let t = m.type(); if (t === 'warn') t = 'warning'; if (t !== 'error' && t !== 'warning') return; const text = m.text(); if (ownCspNoise(page, text)) return; log.console.push({ type: t, text: text.slice(0, 300) }); });
  page.on('pageerror', (e) => log.errors.push(String((e && e.message) || e).slice(0, 300)));
  page.on('requestfailed', (r) => { if (stale(r)) return; log.failed.push({ url: r.url().slice(0, 200), reason: (r.failure() || {}).errorText || 'failed' }); });
  /* ответы приходят двумя путями: событие puppeteer (статус, тип) и CDP (байты) —
     в любом порядке, поэтому сводим их по requestId */
  const byId = new Map(); const sizes = new Map();
  const applySize = (entry, s) => {
    if (s.fromCache) entry.fromCache = true;
    if (s.bytes > 0) { entry.bytes = s.bytes; entry.bytesFrom = 'cdp'; }
  };
  page.on('response', (r) => {
    const req = r.request(); if (stale(req)) return;
    const len = Number((r.headers() || {})['content-length'] || 0);
    /* resourceTypeOf, а не req.resourceType(): в Firefox тот бросает прямо в обработчике события */
    const entry = { url: r.url(), status: r.status(), type: resourceTypeOf(req), bytes: len, bytesFrom: len ? 'content-length' : 'none' };
    try { if (r.fromCache()) entry.fromCache = true; } catch { /* нет в этой версии */ }
    /* CSP документа вкладки (заголовок): addStyleSafe по нему сразу берёт сконструированную таблицу,
       не нарушая политику (иначе — сообщение в консоли и отчёт на report-uri сайта) */
    try { if (req.isNavigationRequest() && r.frame() === page.mainFrame()) page.rwCsp = String((r.headers() || {})['content-security-policy'] || ''); } catch { /* нет кадра */ }
    log.requests.push(entry);
    const id = req.id;
    if (id) { const s = sizes.get(id); if (s) { applySize(entry, s); sizes.delete(id); } else byId.set(id, entry); }
    if (r.status() >= 400) log.failed.push({ url: r.url().slice(0, 200), reason: 'HTTP ' + r.status() });
  });
  /* у Firefox нет CDP: байты остаются по content-length */
  if (trackBytes && !gecko) {
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
 * Начать журнал вкладки заново: page.log (console, errors, failed, requests — те же массивы, очищенные на месте), ответы и
 * сбои запросов, отправленных раньше, в него уже не попадут. Зовёт lib, когда нажатие SITE_REWORK_DISMISS увело на другой
 * адрес и нужная страница открыта заново (после ухода с промежуточной на about:blank): иначе runtime засчитывал /menu/
 * mamuka.rest запросы и консоль промежуточной главной — 464 запроса вместо 184 и «упавшее» видео главной (30.09).
 * Скрипт со своими обработчиками событий вкладки (свой журнал запросов, строк консоли) подписывается
 * onPageLogReset(page, fn): fn(dropped) зовётся здесь же. → { requests, failed, console, errors } — сколько выброшено.
 */
export function resetPageLog(page) {
  const log = page && page.log; if (!log) return null;
  const dropped = { requests: log.requests.length, failed: log.failed.length, console: log.console.length, errors: log.errors.length };
  for (const k of ['requests', 'failed', 'console', 'errors']) log[k].length = 0;
  page.rwLogGen = (page.rwLogGen || 0) + 1;
  for (const fn of page.rwLogResetHooks || []) { try { fn(dropped); } catch { /* обработчик скрипта */ } }
  return dropped;
}
/** Подписаться на resetPageLog этой вкладки: свой журнал скрипта (запросы, строки консоли) очищается вместе с page.log. */
export function onPageLogReset(page, fn) { if (!page.rwLogResetHooks) page.rwLogResetHooks = []; page.rwLogResetHooks.push(fn); }

/* Окно (модалка), а не заставка: по такому ждать нечего — его закрывает SITE_REWORK_DISMISS, а без
   переменной о нём пишет WARN checkOpenModal. Явные признаки: dialog[open], aria-modal, fancybox,
   Magnific Popup, Tilda t-popup, Bootstrap .modal.show, SweetAlert, UIkit, tingle. */
const MODAL_STRONG = 'dialog[open], [aria-modal="true"], .fancybox-container, .fancybox-is-open, .mfp-wrap, .t-popup_show, .modal.show, .modal.in, .swal2-container, .uk-modal.uk-open, .tingle-modal--visible';

/**
 * Дождаться, пока уйдёт заставка или прелоадер: закреплённый элемент с фоном,
 * закрывающий почти весь экран поверх остального. Иначе на «первом экране»
 * окажется логотип заставки, а не сайт. Результат — в page.overlay.
 *
 * Здесь же — окна при загрузке (общий путь всех скриптов: waitForOverlay зовут openPage, runtime, cliche,
 * typeset, motion, mirror):
 *   dismiss (по умолчанию true) — SITE_REWORK_DISMISS: ждать появления до 5 с от начала загрузки (не меньше
 *     1 с от вызова) и нажать (applyDismiss);
 *     итог «нажато / не найдено / скрыто» — строкой INFO или WARN из lib (collectNotes / collectWarnings)
 *     и в ответе, поле dismiss. В одном документе нажимается один раз: closeConsent после него не жмёт снова.
 *   modalCheck (по умолчанию true) — открытое окно без слов про cookie (checkOpenModal): WARN «на странице
 *     открыто окно …, задайте SITE_REWORK_DISMISS=…» с предложенным селектором, поле modal в ответе.
 *     Проверка — сразу; ждать окно (до 2 с от начала документа) — только если при загрузке есть его признаки
 *     (библиотека окон, вызов окна в скрипте страницы, окно Tilda): поле modalWait { signs, ms }. Без признаков — не ждём.
 *     Скрипт, который сам закрывает окна согласия (closeConsent), передаёт false и зовёт checkOpenModal после:
 *     иначе ворота «ENTER», которые closeConsent закроет, дали бы лишний WARN.
 * Окно с явными признаками модалки (dialog[open], aria-modal, fancybox…) или с целью SITE_REWORK_DISMISS внутри
 * заставкой не считается: его не ждут maxMs, hadOverlay — false, о нём — modal. Заставка не ушла сама, а нажатие
 * SITE_REWORK_DISMISS её убрало — gone: true, closedByDismiss: true. Нажатие, которое увело на другой адрес, —
 * страница открывается заново (applyDismiss); не вышло — page.rwWrongPage и WARN «замер не той страницы».
 * Ответ: { hadOverlay, overlay, gone, closedByDismiss?, waitedMs, dismiss?, modal?, modalWait? }.
 */
export async function waitForOverlay(page, maxMs = 5000, { dismiss = true, modalCheck = true } = {}) {
  /* закрывает — значит, в трёх точках экрана сверху лежит именно он (elementFromPoint
     сам учитывает видимость, pointer-events и сдвиг за экран) */
  /* цель SITE_REWORK_DISMISS внутри закрывающего слоя — это окно, которое велено нажать, а не заставка: его не ждём
     maxMs (окно выбора без семантики стояло 5 с и попадало в «заставка не ушла», хотя переменная его закрывала) */
  const targets = dismiss ? dismissSpecs().map((s) => (s.sel ? { sel: s.sel } : { text: s.text.replace(/\s+/g, ' ').trim().toLowerCase() })) : [];
  const covering = () => page.evaluate(({ MODAL, targets }) => {
    const vw = innerWidth, vh = innerHeight;
    const sig = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
    const tops = [[vw / 2, vh / 2], [vw * 0.15, vh * 0.15], [vw * 0.85, vh * 0.85]].map(([x, y]) => document.elementFromPoint(x, y)).filter(Boolean);
    if (tops.length < 3) return null;
    const hasTarget = (el) => targets.some((t) => { try { return t.sel ? el.matches(t.sel) || !!el.querySelector(t.sel) : String(el.innerText || '').replace(/\s+/g, ' ').toLowerCase().includes(t.text); } catch (e) { return false; } });
    for (const el of document.body.querySelectorAll('*')) {
      const s = getComputedStyle(el); if (s.position !== 'fixed' && s.position !== 'absolute') continue;
      if (!((parseInt(s.zIndex) || 0) >= 1) || parseFloat(s.opacity) < 0.5) continue;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
      if (!tops.every((t) => el === t || el.contains(t))) continue;
      const hasBg = !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor) || s.backgroundImage !== 'none';
      if (hasBg) { let modal = false; try { modal = el.matches(MODAL) || !!el.closest(MODAL) || !!el.querySelector(MODAL) || hasTarget(el); } catch (e) { /* селектор */ } return { sig: sig(el), modal }; }
    }
    return null;
  }, { MODAL: MODAL_STRONG, targets }).catch(() => null);
  const t0 = Date.now(); const first = await covering(); let last = first;
  while (last && !last.modal && Date.now() - t0 < maxMs) { await sleep(300); last = await covering(); }
  const win = !!(first && first.modal);
  const res = { hadOverlay: !!first && !win, overlay: first && !win ? first.sig : null, gone: !last || !!last.modal, waitedMs: Date.now() - t0 };
  if (dismiss) {
    const d = await applyDismiss(page).catch((e) => [{ spec: process.env.SITE_REWORK_DISMISS, found: false, status: 'ошибка', why: String((e && e.message) || e).slice(0, 100) }]);
    if (d.length) res.dismiss = d;
    /* «заставка не ушла», а SITE_REWORK_DISMISS нажат — это было окно: проверить заново (в новом документе, если увело) */
    if (res.hadOverlay && !res.gone && d.some((x) => x.found && x.gone) && !(await covering())) { res.gone = true; res.closedByDismiss = true; }
  }
  if (modalCheck) {
    const w = await watchOpenModal(page).catch(() => ({ modal: null, signs: null, waitedMs: 0 }));
    if (w.modal) res.modal = w.modal;
    if (w.signs) res.modalWait = { signs: w.signs, ms: w.waitedMs };
  }
  return res;
}

/* Окно при загрузке (checkOpenModal) — сразу; ждать его, но не дольше 2 с от начала документа, — только если при загрузке
   есть признаки окна, которое откроется само (modalSignsInPage): окно выбора города mamuka.rest (fancybox) открывается
   через ~2 с, а быстрая локальная страница готова раньше. Раньше ждали 2 с от начала документа на КАЖДОЙ странице —
   +1,1 с к открытию любой быстрой страницы без окон (V/timing-open.log, 29.09). → { modal, signs (null — без признаков,
   не ждали), waitedMs }; WARN об окне — строкой lib вида 'окно' */
const MODAL_GRACE_MS = 2000;
async function watchOpenModal(page) {
  const t0 = Date.now();
  let m = await checkOpenModal(page, { warn: false }).catch(() => null);
  let signs = null;
  if (!m) {
    let s = await page.evaluate(() => performance.now()).catch(() => MODAL_GRACE_MS);
    if (s < MODAL_GRACE_MS) {
      const list = await page.evaluate(modalSignsInPage).catch(() => []);
      if (list && list.length) {
        signs = list;
        while (!m && s < MODAL_GRACE_MS) {
          await sleep(Math.max(50, Math.min(250, MODAL_GRACE_MS - s)));
          m = await checkOpenModal(page, { warn: false }).catch(() => null);
          s = await page.evaluate(() => performance.now()).catch(() => MODAL_GRACE_MS);
        }
      }
    }
  }
  if (m) libWarn(modalNote(m, page), 'окно');
  return { modal: m, signs, waitedMs: Date.now() - t0 };
}
/* В странице: признаки окна, которое страница откроет сама вскоре после загрузки → ['fancybox', 'скрипт popup.js', …].
   Библиотеки окон (глобальные имена и адреса скриптов), вызов окна во встроенном скрипте страницы, окна Tilda. Скрытый
   <dialog> или форма в окне по кнопке — не признак: такие открывает человек, а не таймер */
function modalSignsInPage() {
  const out = []; const w = window; const jq = w.jQuery || null;
  const has = (f) => { try { return !!f(); } catch (e) { return false; } };
  const LIBS = [
    ['fancybox', () => w.Fancybox || (jq && (jq.fancybox || (jq.fn && jq.fn.fancybox)))],
    ['Magnific Popup', () => jq && (jq.magnificPopup || (jq.fn && jq.fn.magnificPopup))],
    ['colorbox', () => jq && (jq.colorbox || (jq.fn && jq.fn.colorbox))],
    ['SweetAlert', () => w.Swal || w.sweetAlert || (typeof w.swal === 'function')],
    ['MicroModal', () => w.MicroModal], ['tingle', () => w.tingle], ['lity', () => w.lity], ['basicLightbox', () => w.basicLightbox],
  ];
  for (const [name, f] of LIBS) if (has(f)) out.push(name);
  const SRC = /fancybox|magnific|colorbox|sweetalert|swal|micromodal|tingle|lity|featherlight|venobox|remodal|jquery\.modal|popup|modal/i;
  for (const s of document.scripts) { const src = (s.getAttribute('src') || '').split(/[?#]/)[0]; if (src && SRC.test(src.split('/').pop())) { out.push(`скрипт ${src.split('/').pop().slice(0, 40)}`); break; } }
  const CALL = /\.showModal\s*\(|fancybox|magnificPopup|Swal\.fire|sweetAlert|MicroModal\.show|tingle\.modal|UIkit\.modal|showPopup|openPopup|popup_?open|open_?popup|\.modal\(\s*['"]show/i;
  let budget = 400000;
  for (const s of document.scripts) {
    if (s.src || budget <= 0) continue;
    const t = String(s.textContent || '').slice(0, 100000); budget -= t.length;
    const m = t.match(CALL); if (m) { out.push(`вызов окна в скрипте страницы «${m[0].slice(0, 30)}»`); break; }
  }
  if (document.querySelector('.t-popup')) out.push('окно Tilda (.t-popup)');
  return out;
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
      /* NS_ERROR_… — те же сетевые ошибки у Firefox */
      if (!/net::ERR_|NS_ERROR_|Navigation timeout|Timeout/i.test(msg) || i === attempts) break;
      await sleep(1500 * i);
    }
  }
  /* после нескольких упавших переходов вкладка стоит на странице ошибки Chrome, и page.close()
     на ней может не вернуться вообще (проверено: 3 из 3 зависаний); about:blank это снимает */
  if (attempts > 1) await Promise.race([page.goto('about:blank', { timeout: 5000 }).catch(() => {}), sleep(6000)]);
  throw last;
}

/** Открыть страницу с журналом, дождаться шрифтов и ухода заставки (settle: 0 — не ждать: ни заставки,
    ни SITE_REWORK_DISMISS, ни проверки окна). dismiss и modalCheck — как у waitForOverlay (скрипт, который
    сам закрывает окна согласия, передаёт modalCheck: false и зовёт checkOpenModal после closeConsent).
    Остальные параметры (userAgent, hookCanvas, trackBytes) уходят в preparePage. */
export async function openPage(browser, url, vp, { scheme = 'light', reducedMotion = false, timeout = 60000, waitUntil = 'networkidle2', settle = 5000, dismiss = true, modalCheck = true, ...prep } = {}) {
  const page = await preparePage(browser, vp, { scheme, reducedMotion, ...prep });
  await gotoRetry(page, url, { waitUntil, timeout });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  page.overlay = settle ? await waitForOverlay(page, settle, { dismiss, modalCheck }) : { hadOverlay: false, overlay: null, gone: true, waitedMs: 0 };
  await sleep(500);
  return page;
}

/* Git Bash подменяет аргументы вида «/sites/…» на путь внутри своей папки:
   «C:/Program Files/Git/sites/…». Возвращаем как было. Полные адреса не трогаем. */
export function unmangle(p) { return String(p).replace(/^[a-z]:[\\/]program files[\\/]git(?=[\\/])/i, ''); }
export function pagesFrom(list, base) {
  return String(list).split(',').map((p) => unmangle(p.trim())).filter(Boolean).map((p) => new URL(p, base).href);
}

/* ---------- свой стиль на странице, в том числе при строгом CSP ---------- */

/* Выполняется в странице. Ставит (или с remove — снимает) стиль с ключом key: сначала
   <style data-rw="key">; если CSP страницы вставку запрещает — сконструированной таблицей в
   document.adoptedStyleSheets (на неё CSP не распространяется, сама политика не отключается).
   Запрещает ли CSP, видно по политикам: заголовок (policies — его собирает preparePage) и
   meta http-equiv; style-src-elem, иначе style-src, иначе default-src без 'unsafe-inline' или
   с nonce/hash (при них 'unsafe-inline' не действует) — запрещено, <style> даже не пробуем:
   попытка — это сообщение в консоли и отчёт на report-uri сайта. Политика не распознана, а
   <style> не применился (у элемента нет sheet) — тоже переход на таблицу, и дальше на этой
   странице сразу таблица (window.__rwCspStyle). Повторный вызов с тем же key заменяет стиль.
   Возвращает 'style' | 'adopted' | 'removed' | null (нельзя ни так, ни так). */
function styleInPage({ key, css, policies, remove }) {
  const sheets = (window.__rwSheets = window.__rwSheets || {});
  const old = document.querySelector('style[data-rw="' + key + '"]'); if (old) old.remove();
  const had = sheets[key];
  if (had) { try { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== had); } catch (e) { /* таблицы запрещены */ } delete sheets[key]; }
  if (remove) return 'removed';
  const allows = (list) => {
    for (const pol of list) for (const one of String(pol || '').split(/[\n,]/)) {
      const dirs = Object.create(null);
      for (const d of one.split(';')) { const t = d.trim().toLowerCase().split(/\s+/); if (t[0] && !(t[0] in dirs)) dirs[t[0]] = t.slice(1); }
      const src = dirs['style-src-elem'] || dirs['style-src'] || dirs['default-src'];
      if (src && !(src.includes("'unsafe-inline'") && !src.some((s) => /^'(nonce-|sha(256|384|512)-)/.test(s)))) return false;
    }
    return true;
  };
  const metas = [...document.querySelectorAll('meta[http-equiv]')].filter((m) => /^content-security-policy$/i.test(m.httpEquiv)).map((m) => m.content);
  if (!window.__rwCspStyle && allows([...(policies || []), ...metas])) {
    const st = document.createElement('style'); st.setAttribute('data-rw', key); st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
    if (st.sheet) return 'style';
    st.remove();
  }
  window.__rwCspStyle = true;
  try {
    const sh = new CSSStyleSheet(); sh.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
    sheets[key] = sh;
    return 'adopted';
  } catch (e) { return null; }
}

/* sha256 нашего CSS: так Chrome подписывает нарушение CSP («a hash ('sha256-…')») */
const cssHash = (css) => crypto.createHash('sha256').update(String(css), 'utf8').digest('base64');
function markOwnCss(page, css) { if (!page.__rwOwnCss) page.__rwOwnCss = new Set(); page.__rwOwnCss.add(cssHash(css)); }
function ownCspNoise(page, text) {
  const own = page.__rwOwnCss;
  if (!own || !own.size || !/Content Security Policy/i.test(text)) return false;
  for (const h of own) if (text.includes(h)) return true;
  return false;
}
const styleKey = (key, css) => String(key || `rw-${cssHash(css).replace(/[^a-z0-9]/gi, '').slice(0, 10)}`).replace(/[^\w-]/g, '-');

/**
 * Вставить свой CSS в страницу и при строгом CSP (style-src без 'unsafe-inline'):
 * page.addStyleTag на таких страницах падает «Could not load style», а вставленный
 * вручную <style> молча не применяется. Порядок: <style data-rw="key">, если CSP его
 * разрешает (заголовок из preparePage и meta), иначе сконструированная таблица
 * (document.adoptedStyleSheets). Нельзя и так (страница запретила и таблицы) — WARN
 * в вывод (warn: false — без него) и null, без исключения. Ошибка самой вкладки
 * (переход посреди вставки) — тоже null, без WARN. Нарушение CSP от нашей пробы в
 * page.log.console не попадает (preparePage узнаёт его по sha256 CSS).
 * Повторный вызов с тем же key заменяет стиль. Возвращает 'style' | 'adopted' | null.
 * WARN идёт через общий канал предупреждений lib: скрипт, включивший collectWarnings(),
 * получает его из takeWarnings() и сам печатает и считает в вердикте.
 *   await addStyleSafe(page, '.x{color:transparent!important}', { key: 'hide-text' })
 *   await removeStyleSafe(page, 'hide-text')
 */
const warnedStyle = new Set();
export async function addStyleSafe(page, css, { key = null, warn = true } = {}) {
  const k = styleKey(key, css);
  markOwnCss(page, css);
  let how;
  try { how = await page.evaluate(styleInPage, { key: k, css: String(css), policies: page.rwCsp ? [page.rwCsp] : [] }); } catch { return null; }
  /* одна строка на ключ за запуск: при нескольких вкладках и перезагрузках она повторялась */
  if (!how && warn && !warnedStyle.has(k) && warnedStyle.add(k)) libWarn(`свой стиль «${k}» не вставился: CSP страницы запрещает <style>, а сконструированные таблицы стилей недоступны — то, что от него зависит, работает без него`, 'стиль');
  return how || null;
}

/* ---------- предупреждения lib ---------- */

/* WARN из lib по умолчанию печатается сразу строкой «WARN …» — у скрипта с прогрессом («· home desktop … ок»)
   это посреди строки, и в вердикт и json он не попадал */
/* kind — о чём предупреждение: 'окно' (открыто при загрузке), 'SITE_REWORK_DISMISS' (итог нажатия), 'стиль' (свой стиль
   не вставился), 'папка' (папка прогона). По нему скрипт подписывает строку вердикта (warningLabel): a11y писал окно
   под подписью «свой стиль на странице» */
const libWarnings = { collect: false, list: [], kinds: new Map() };
function libWarn(text, kind = null) { if (kind) libWarnings.kinds.set(text, kind); if (libWarnings.collect) libWarnings.list.push(text); else console.log(`WARN ${text}`); }
/**
 * Собирать предупреждения lib, а не печатать: collectWarnings() (или collectWarnings(false) — снова
 * печатать сразу). Накопленное забирает takeWarnings() → [текст без «WARN »]: скрипт печатает на
 * своём месте и считает в вердикте и протоколе. Одинаковые строки (окно на двух вкладках одной страницы) —
 * одной: takeWarnings({ unique: false }) — все как есть.
 */
export function collectWarnings(on = true) { libWarnings.collect = !!on; }
export function takeWarnings({ unique = true } = {}) { const l = libWarnings.list; libWarnings.list = []; return unique ? [...new Set(l)] : l; }
/** Вид предупреждения lib по его тексту: 'окно' | 'SITE_REWORK_DISMISS' | 'стиль' | 'папка' | null. */
export function warningKind(text) { return libWarnings.kinds.get(text) || null; }
/** Подпись строки вердикта для предупреждения lib: «окно», «SITE_REWORK_DISMISS», «свой стиль на странице», «папка прогона». */
export function warningLabel(text) { return { 'окно': 'окно', SITE_REWORK_DISMISS: 'SITE_REWORK_DISMISS', 'стиль': 'свой стиль на странице', 'папка': 'папка прогона' }[warningKind(text)] || 'lib'; }
/* INFO из lib (SITE_REWORK_DISMISS: нажато): по умолчанию строкой «INFO …» в stderr — один раз на процесс для
   одного ключа (одно и то же окно на каждой странице не повторяется); скрипт с collectNotes() забирает их
   takeNotes() для каждой страницы и печатает на своём месте */
const libNotes = { collect: false, list: [], seen: new Set() };
function libInfo(text, key = text) {
  if (libNotes.collect) { libNotes.list.push(text); return; }
  if (libNotes.seen.has(key)) return; libNotes.seen.add(key);
  console.error(`INFO ${text}`);
}
/** Собирать строки INFO lib, а не печатать в stderr: collectNotes() (false — снова печатать). */
export function collectNotes(on = true) { libNotes.collect = !!on; }
/** Накопленные строки INFO lib (без «INFO ») — и очистить список. */
export function takeNotes() { const l = libNotes.list; libNotes.list = []; return l; }
/** Снять стиль, поставленный addStyleSafe с этим key (и <style>, и таблицу). */
export async function removeStyleSafe(page, key) {
  await page.evaluate(styleInPage, { key: styleKey(key, ''), remove: true }).catch(() => {});
}

/* ---------- прокрутка ---------- */

/**
 * Отключить плавную прокрутку страницы: html{scroll-behavior:smooth} превращает
 * scrollTo(0, y) в анимацию, и замер идёт посреди пути (a11y открыл 2 блока из 21,
 * perf «прокрутил 12453 px», а страница сдвинулась на 149). Вставляет стиль
 * через addStyleSafe (ключ instant-scroll: <style data-rw="instant-scroll">, а при
 * строгом CSP — сконструированная таблица). Действует до перезагрузки или перехода:
 * после них — вызвать снова. (Опция persist — вставка в каждый новый документ —
 * убрана 28.09.2026: её никто не звал, а в новом документе заголовок CSP не виден,
 * и проба <style> на CSP-сайте давала нарушение в консоли и отчёт на report-uri.)
 * Возвращает 'style' | 'adopted' | null.
 */
const INSTANT_CSS = 'html,body,*{scroll-behavior:auto!important}';
export async function forceInstantScroll(page) {
  return addStyleSafe(page, INSTANT_CSS, { key: 'instant-scroll' });
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
/* высота страницы и окно раскладки одним вызовом (scrollThrough перечитывает их на каждом шаге) */
const pageMetrics = (page) => page.evaluate(() => { const sc = window.__rwScroller; return { h: sc && sc.isConnected ? sc.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0), ih: innerHeight }; });
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
export async function screenSegment(page, y, { file = null, pause = 1200, waitMedia = true, mediaTimeout = 6000, settle = 1500, type = 'png', deadline = 60000, beforeShot = null } = {}) {
  assertAlive(page);
  const run = async () => {
    await scrollToY(page, y);
    await sleep(pause);
    const media = waitMedia ? await waitForMedia(page, { timeout: mediaTimeout }) : null;
    if (settle) await settleAnimations(page, settle);
    /* beforeShot — последний шаг перед снимком (fullPageShot прячет здесь закреплённые полосы: шапка, ставшая
       fixed по событию прокрутки, уже в своём состоянии) */
    if (beforeShot) await beforeShot();
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
 * cover: true — без дыр: если шагов больше maxShots, снимков столько, сколько нужно, чтобы соседние
 * отстояли не больше чем на высоту окна (ceil(низ / vh) + 1 с y=0), но не меньше maxShots, — поровну от 0
 * до низа. Без cover прореживание шло через шаг: 6 снимков на 6942 px (runtime, 29.09) оставляли между
 * scroll-00 и scroll-01 целый блок, которого не было ни на одном снимке.
 */
export function segmentPositions(total, vh, { step = 0.8, maxShots = 8, skipTop = false, cover = false } = {}) {
  const px = Math.max(1, Math.round(vh * step)); const bottom = Math.max(0, total - vh);
  const ys = []; for (let y = 0; y < bottom; y += px) ys.push(y);
  if (!ys.length || ys[ys.length - 1] !== bottom) ys.push(bottom);
  let list = skipTop && ys.length > 1 ? ys.slice(1) : ys;
  if (!(maxShots > 0)) return [];
  const n = Number.isFinite(maxShots) ? Math.floor(maxShots) : list.length;
  if (list.length > n && cover) {
    const m = Math.max(Math.ceil(bottom / Math.max(1, vh)) + 1, n + (skipTop ? 1 : 0));
    if (m >= ys.length) return list;
    const even = []; for (let k = 0; k < m; k++) even.push(Math.round(k * bottom / (m - 1)));
    return skipTop ? even.slice(1) : even;
  }
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
 * cover (по умолчанию true) — снимки окна без дыр (segmentPositions cover: соседние не дальше высоты окна,
 * снимков столько, сколько нужно, но не меньше maxShots): runtime --scroll (maxShots 6) на 6942 px оставлял
 * между scroll-00 и scroll-01 целый блок (29.09). false — не больше maxShots, как раньше (shots --segments N).
 * В конце возврат наверх.
 *
 * Возвращает { pageHeight, screens, initialHeight, maxScrollY, reachedBottom,
 * stuck, capped, scroller, viewH, shotH, shots: [{ file, y, scrollY, media }], gaps, sheet }.
 * gaps — [{ from, to }] участки страницы (px), не попавшие ни на один снимок окна (при skipTop первый
 * экран считается снятым); пусто — снимки покрывают страницу. shotH — высота видимой области снимка.
 * stuck — страница выше окна, но не прокрутилась (overflow:hidden на html/body,
 * заставка держит прокрутку) — тогда и снимки, и появления недостоверны.
 * viewH — высота окна, от которой считались шаги и низ: innerHeight страницы (окно
 * раскладки), а не высота экрана. У страницы без meta viewport (или с контентом
 * шире экрана) на телефоне окно раскладки выше экрана — 2121 px при экране 390×844,
 * — прокрутка кончается на pageHeight − innerHeight, и от высоты экрана выходило
 * ложное «до низа не доехали» (и «не прокручивается» у страницы ниже окна раскладки).
 * Низ для подписей — pageHeight − viewH. Шаг прокрутки и позиции снимков считаются
 * от видимой области (visualViewport — то, что попадает на снимок): при контенте шире
 * экрана окно раскладки выше неё, и шаг от innerHeight оставлял бы пропуски между кадрами.
 * Окно раскладки перечитывается на каждом шаге вместе с высотой страницы: у страницы без
 * meta viewport оно растёт по ходу прохода (ленивое шире экрана), и «низ» от начального
 * innerHeight выходил ниже настоящего; viewH в ответе — последнее значение.
 */
export async function scrollThrough(page, { step = 0.8, pause = 350, shotsDir = null, tag = 'scroll', maxShots = 8, shotPause = 1200, waitMedia = true, mediaTimeout = 6000, skipTop = false, maxSteps = 150, onStep = null, sheet = false, cover = true } = {}) {
  const dims = await page.evaluate(() => ({ ih: innerHeight, vv: window.visualViewport ? visualViewport.height : 0 })).catch(() => ({}));
  const dev = (page.viewport() || {}).height || 0;
  let vh = dims.ih || dev || 800; /* окно раскладки — для «низа»; перечитывается на каждом шаге */
  const sh = Math.min(vh, dims.vv || dev || vh); /* видимая область — шаг и снимки */
  const px = Math.max(1, Math.round(sh * step));
  const scroller = await page.evaluate(detectScrollerInPage).catch(() => ({ kind: 'document' }));
  const initialHeight = await pageHeight(page);
  let total = initialHeight; let n = 0; let maxY = 0;
  const remeasure = async () => { const m = await pageMetrics(page).catch(() => null); if (m) { total = m.h; if (m.ih > 0) vh = m.ih; } else total = await pageHeight(page); };
  for (let y = 0; y < total && n < maxSteps; y += px) {
    await scrollToY(page, y); await sleep(pause);
    /* где страница стоит после паузы: скрипт сайта мог вернуть её назад */
    const sy = await currentScroll(page);
    if (sy > maxY) maxY = sy;
    if (onStep) await onStep({ y, scrollY: sy, index: n });
    n++;
    await remeasure();
  }
  /* низ страницы: шаги могли остановиться чуть выше */
  if (maxY < total - vh - 2) { await scrollToY(page, total); await sleep(pause); const sy = await currentScroll(page); if (sy > maxY) maxY = sy; await remeasure(); }
  const shots = [];
  const gaps = [];
  if (shotsDir) {
    ensureDir(shotsDir);
    const ys = segmentPositions(total, sh, { step, maxShots, skipTop, cover });
    for (let k = 0; k < ys.length; k++) {
      const file = path.join(shotsDir, `${tag}-${String(k).padStart(2, '0')}.png`);
      const s = await screenSegment(page, ys[k], { file, pause: shotPause, waitMedia, mediaTimeout });
      shots.push({ file: path.basename(file), y: ys[k], scrollY: s.scrollY, media: s.media });
    }
    /* дыры между снимками — по тому, где страница стояла на самом деле (при skipTop первый экран снят отдельно) */
    let end = skipTop ? sh : 0;
    for (const s of [...shots].sort((a, b) => a.scrollY - b.scrollY)) { if (s.scrollY > end + 1) gaps.push({ from: Math.round(end), to: s.scrollY }); end = Math.max(end, s.scrollY + sh); }
    if (shots.length && end < total - 1) gaps.push({ from: Math.round(end), to: total });
  }
  let sheetFile = null;
  if (sheet && shots.length) { const r = await contactSheet(shots.map((s) => path.join(shotsDir, s.file)), path.join(shotsDir, `${tag}-sheet.png`), { labels: shots.map((s) => `${s.file} · y ${s.scrollY}`) }); sheetFile = r ? path.basename(r.file) : null; }
  await scrollToY(page, 0); await sleep(300);
  return { pageHeight: total, screens: n, initialHeight, maxScrollY: maxY, reachedBottom: maxY >= total - vh - 2, stuck: total > vh + 50 && maxY < 5, capped: n >= maxSteps, scroller, viewH: vh, shotH: sh, shots, gaps, sheet: sheetFile };
}

/**
 * Остановить движение перед снимком для сравнения: конечные анимации
 * доигрываются до конца (блоки появления остаются показанными), бесконечные
 * ставятся на паузу в начальной фазе (currentTime = 0 — иначе бегущая строка
 * в двух прогонах стоит в разных местах и diff видит «изменения»), переходы
 * отключаются. Движение, которое рисует JS (холсты, GSAP), так не остановить.
 * Стиль ставится через addStyleSafe (ключ freeze-motion): при строгом CSP раньше
 * page.addStyleTag падал «Could not load style», и shots не снимал страницу вовсе.
 */
const FREEZE_CSS = '*,*::before,*::after{transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}';
export async function freezeMotion(page) {
  await addStyleSafe(page, FREEZE_CSS, { key: 'freeze-motion' });
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
export const FULLPAGE_NOTE = 'Снимок всей страницы одним кадром (способы full и dpr1) показывает закреплённые слои — зерно, шапку, нижнюю панель, боковую колонку — только в верхнем экране: ниже их нет. Склейка из снимков окна (способ segments): закреплённое на всю высоту окна (боковая колонка, половина экрана, зерно, вуаль) — в каждом окне, то есть на всей высоте склейки (пункты колонки повторяются через высоту окна); закреплённые полосы и мелкое (шапка, вкладка, «наверх») — по одному разу (прижатые к низу окна — в последнем окне, остальные — в первом окне, где видны); липкие (sticky) ниже высоты окна — на своём месте в потоке, а не на каждом шве. Как закреплённое видно при прокрутке — по снимкам окна (*-scroll-NN.png). iframe (карта, видео, виджет) на снимке всей страницы бывает серым или обрезанным: виджет меряет себя, когда окно растягивают под снимок, — смотреть его на снимке окна (runtime --fullpage снимает окно с каждым iframe сам).';

/* склейка, перед снимком каждого окна (fixed и sticky):
     на всю высоту окна (от 90%: боковая колонка — рельс «Эпицентра», колонка mamuka; половина «пополам»; слой на весь
       экран; липкая сцена на весь экран) — в каждом окне: на склейке сплошная колонка на всю высоту, как при прокрутке
       (её пункты повторяются через высоту окна). До 30.09 колонка считалась «нижней полосой» и была только в последнем
       окне — рельс и колонка mamuka пропадали со всей склейки, кроме низа;
     липкие ниже высоты окна (лента категорий) — на своё место в потоке, а не на каждом шве;
     закреплённое от половины экрана по площади — в каждом окне;
     закреплённые полосы и мелкое (шапка, вкладка, «наверх», чат) — один раз: нижние (прижатые к низу, центр ниже 65%
       высоты окна) — в последнем окне, остальные — в первом окне, где они видны (кнопка, которая появляется после
       прокрутки, — там, где появилась, а не нигде). → { hidden, sticky, columns } */
const PIN_CSS = '[data-rw-pin="sticky"]{position:relative!important;top:auto!important;bottom:auto!important;left:auto!important;right:auto!important}[data-rw-pin="hide"]{visibility:hidden!important}';
function pinsInPage({ first, last }) {
  const vw = innerWidth, vh = innerHeight; const out = { hidden: 0, sticky: 0, columns: 0 };
  for (const e of document.querySelectorAll('[data-rw-pin="hide"]')) e.removeAttribute('data-rw-pin');
  if (first) for (const e of document.querySelectorAll('[data-rw-pin-seen]')) e.removeAttribute('data-rw-pin-seen');
  const seenNow = (el, r) => { if (!(r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw)) return false; try { return !el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch (e) { return true; } };
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    if (el.getAttribute('data-rw-pin') === 'sticky') { out.sticky++; continue; }
    const pos = getComputedStyle(el).position;
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) continue;
    if (r.height >= vh * 0.9) { out.columns++; continue; }
    if (pos === 'sticky') { el.setAttribute('data-rw-pin', 'sticky'); out.sticky++; continue; }
    if (r.width * r.height >= vw * vh * 0.5) continue;
    /* нижние — прижатые к низу окна (центр ниже 65% высоты: нижняя панель, «наверх», чат); вкладка посередине края
       (mamuka «Карта калорий») — верхняя: её видно при открытии страницы, в первом окне */
    const upper = r.top + r.height / 2 <= vh * 0.65;
    if (!upper) { if (!last) { el.setAttribute('data-rw-pin', 'hide'); out.hidden++; } continue; }
    if (el.hasAttribute('data-rw-pin-seen')) { el.setAttribute('data-rw-pin', 'hide'); out.hidden++; continue; }
    if (seenNow(el, r)) el.setAttribute('data-rw-pin-seen', '1');
  }
  return out;
}

/**
 * Снимок всей страницы. У Chrome есть предел высоты снимка около 16 тысяч
 * пикселей в устройстве: выше него полноэкранный снимок молча повторяет верх
 * страницы. Поэтому (mode 'auto'): высота × масштаб укладывается — обычный
 * снимок; не укладывается — масштаб ×1; не укладывается и так — сегменты по
 * высоте окна, склеенные sharp.
 * mode 'segments' — всегда склеивать из снимков окна (с ожиданием картинок
 * в каждом), шаг — ровно высота окна (без дыр). Закреплённое на швах не повторяется (pins, по умолчанию
 * true): на всю высоту окна (боковая колонка, слой на весь экран) — в каждом окне, то есть на всей высоте
 * склейки; липкие (sticky) ниже высоты окна — на своём месте в потоке; закреплённые полосы и мелкое — один раз
 * (прижатые к низу окна — в последнем, остальные — в первом окне, где видны). См. FULLPAGE_NOTE. pins: false — как
 * раньше: всё закреплённое в каждом окне (так видит человек при прокрутке; меню «повторяется» на каждом шве).
 * scale — масштаб итогового файла (пикселей на CSS-пиксель): без него — как у экрана, а у длинной страницы
 * ×1, и у страниц одного экрана масштаб разный (390 и 780 px на mobile в одном прогоне, 29.09). С числом —
 * один масштаб всегда: одним снимком, если высота × scale в пределе Chrome, иначе склейкой в том же масштабе.
 * Предел склейки — 120 млн пикселей: больше — ×1. Фактический масштаб — в page.rwFullScale.
 * Возвращает способ съёмки: 'full' | 'dpr1' | 'segments' | 'dpr1-overflow'.
 */
export async function fullPageShot(page, file, { mode = 'auto', scale = null, pins = true } = {}) {
  const LIMIT = 16000;
  const vp = page.viewport(); const dpr = vp.deviceScaleFactor || 1;
  const want = Number(scale) > 0 ? Number(scale) : null;
  const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(200);
  if (mode !== 'segments') {
    const s = want || dpr;
    if (h * s <= LIMIT) {
      page.rwFullScale = s;
      if (s === dpr) { await page.screenshot({ path: file, fullPage: true }); return 'full'; }
      await page.setViewport({ ...vp, deviceScaleFactor: s }); await sleep(400);
      await page.screenshot({ path: file, fullPage: true });
      await page.setViewport(vp); await sleep(300);
      return s === 1 ? 'dpr1' : 'full';
    }
    if (!want && h <= LIMIT) {
      page.rwFullScale = 1;
      await page.setViewport({ ...vp, deviceScaleFactor: 1 }); await sleep(400);
      await page.screenshot({ path: file, fullPage: true });
      await page.setViewport(vp); await sleep(300);
      return 'dpr1';
    }
  }
  const sharp = loadSharp();
  if (!sharp) { page.rwFullScale = 1; await page.setViewport({ ...vp, deviceScaleFactor: 1 }); await page.screenshot({ path: file, fullPage: true }); await page.setViewport(vp); return 'dpr1-overflow'; }
  /* масштаб склейки: заданный; без него — как у экрана, если итог не огромный, иначе ×1 */
  let sc = want || (h * dpr <= LIMIT ? dpr : 1);
  if (sc > 1 && Math.round(vp.width * sc) * Math.round(h * sc) > 120e6) sc = 1;
  page.rwFullScale = sc;
  if (sc !== dpr) { await page.setViewport({ ...vp, deviceScaleFactor: sc }); await sleep(400); }
  const vh = vp.height; const W = Math.round(vp.width * sc); const H = Math.round(h * sc); const parts = [];
  if (pins) await addStyleSafe(page, PIN_CSS, { key: 'full-pins', warn: false });
  try {
    for (let y = 0; y < h; y += vh) {
      const beforeShot = pins ? () => page.evaluate(pinsInPage, { first: y === 0, last: y + vh >= h }).catch(() => null) : null;
      const seg = await screenSegment(page, y, { pause: 250, mediaTimeout: 3000, settle: 500, beforeShot });
      const img = sharp(seg.buffer); const meta = await img.metadata();
      /* окно кладётся туда, где страница стояла на самом деле, целиком: последнее (низ страницы не даёт доехать
         до y) перекрывает хвост предыдущего — нижняя панель и вкладка, которые есть только в нём, целые */
      const at = Math.max(0, Math.min(seg.scrollY, h - 1));
      const cut = Math.max(1, Math.min(meta.height, Math.round(Math.min(vh, h - at) * sc), H - Math.round(at * sc)));
      parts.push({ input: await img.extract({ left: 0, top: 0, width: Math.min(W, meta.width), height: cut }).png().toBuffer(), top: Math.round(at * sc), left: 0 });
    }
  } finally {
    if (pins) {
      await removeStyleSafe(page, 'full-pins');
      await page.evaluate(() => { for (const e of document.querySelectorAll('[data-rw-pin], [data-rw-pin-seen]')) { e.removeAttribute('data-rw-pin'); e.removeAttribute('data-rw-pin-seen'); } }).catch(() => {});
    }
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(parts).png().toFile(file);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  if (sc !== dpr) { await page.setViewport(vp); }
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
  /* декор — не находка: внутри aria-hidden="true" (сам или предок, и через хозяина теневого DOM) или role=presentation/none
     у самого элемента (у текста — у его родителя). Гигантское слово навылет за края (coffee .shout: aria-hidden,
     overflow:hidden, nowrap — «текст обрезан» был ложным WARN, 29.09), огромные бледные слова-фон — так задумано. Страница
     шире экрана из-за декора (wideCauses, docWider) — по-прежнему находка: вбок едет вся страница.
     Роль у предка — не декор: меню по образцу WAI-ARIA (li role=none > a role=menuitem) — текст ссылки настоящий.
     Не декор и текст, который глазами виден, а читалке отдан тем же текстом рядом (30.09):
       разбит для анимации — у предка (до 3 уровней над внешним aria-hidden) aria-label, равный всему его тексту (GSAP
         SplitText 3.13+ по умолчанию: подпись у заголовка, aria-hidden у строк, слов и букв);
       рядом копия для читалки — у соседа внешнего aria-hidden (sr-only: коробка до 2 px, clip, clip-path) тот же текст
         (надпись-логотип «Эпи|цен|тр» столбиком и «Эпицентр» для читалки).
     Слово-фон рядом с заголовком того же смысла («меню» за «Основное меню») — по-прежнему декор: подписи с тем же текстом
     у предка нет, а заголовок — не копия для читалки */
  const flat = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  const flatMemo = new Map(); const flatText = (e) => { if (!flatMemo.has(e)) flatMemo.set(e, flat(e.textContent)); return flatMemo.get(e); };
  const tinyBox = (e) => { const r = e.getBoundingClientRect(); const s = cs(e); return r.width <= 2 || r.height <= 2 || (s.clip && s.clip !== 'auto') || /inset\(\s*50%|circle\(\s*0/.test(s.clipPath || ''); };
  /* внешний aria-hidden="true" над элементом (сам элемент, предки, через хозяина теневого DOM) или null */
  const hiddenTop = (e) => { let h = null; for (let x = e; x && x !== de; x = parentOf(x)) if (x.nodeType === 1 && x.getAttribute('aria-hidden') === 'true') h = x; return h; };
  const spokenNearby = (h) => {
    const t = flatText(h); if (!t) return false;
    for (let a = parentOf(h), k = 0; a && a !== document.body && a !== de && k < 3; a = parentOf(a), k++) {
      const lab = a.getAttribute('aria-label'); if (lab == null) continue;
      if (flat(lab) === flatText(a)) return true;
      break; /* ближайшая подпись — о другом (раздел «Бар» со словом-фоном «БАР») */
    }
    const p = parentOf(h);
    return !!p && [...p.children].some((s) => s !== h && s.getAttribute('aria-hidden') !== 'true' && flatText(s) === t && tinyBox(s));
  };
  const decorMemo = new Map();
  const decor = (e) => {
    if (!e || e.nodeType !== 1) return false;
    if (decorMemo.has(e)) return decorMemo.get(e);
    let v = false;
    try { if (/^(presentation|none)$/i.test(e.getAttribute('role') || '')) v = true; else { const h = hiddenTop(e); v = !!h && !spokenNearby(h); } } catch (x) { v = false; }
    decorMemo.set(e, v); return v;
  };
  const out = []; const textWider = []; const panelCut = []; const clipCut = [];
  const range = document.createRange();
  const textRect = (n) => { range.selectNodeContents(n); return range.getBoundingClientRect(); };
  /* блочная коробка текста: ближайший предок не inline и не contents */
  const blockOf = (par) => { let b = par; while (b && b !== document.body && /^(inline|contents)$/.test(cs(b).display)) b = parentOf(b); return b && b !== document.body ? b : null; };
  /* закреплённая панель с overflow hidden/clip — её разрезы ловит проверка 3 (panelCut), здесь не повторяем */
  const isPanel = (e) => { const s = cs(e); return (s.position === 'fixed' || s.position === 'sticky') && /hidden|clip/.test(s.overflowX); };
  /* «спрятан намеренно»: коробка-ноль (sr-only 1×1, clip, clip-path inset) — текст в ней обрезан нарочно */
  const srOnly = (e) => { const r = e.getBoundingClientRect(); const s = cs(e); return r.width <= 2 || r.height <= 2 || (s.clip && s.clip !== 'auto') || /inset\(\s*50%|circle\(\s*0/.test(s.clipPath || ''); };
  /* текст виден в коробке c лишь частично: край c режет его (не целиком внутри и не целиком снаружи) */
  const cutBy = (tr, c, tolX) => (tr.right > c.right + tolX && tr.left < c.right - tolX) || (tr.left < c.left - tolX && tr.right > c.left + tolX);
  /* WARN clipCut: текст разрезан краем контейнера, который обрезает (overflow ≠ visible), без многоточия */
  const addClipCut = (n, par, box, clip, tr, how) => {
    const c = clip.getBoundingClientRect(); const s = cs(par);
    clipCut.push({ sig: sig(par), clip: sig(clip), text: clean(n.textContent), nowrap: /nowrap|pre/.test(s.whiteSpace), how, textLeft: Math.round(tr.left), textRight: Math.round(tr.right), clipLeft: Math.round(c.left), clipRight: Math.round(c.right) });
  };
  /* 2г. метка в одну строку (white-space: nowrap) целиком в своей коробке, но коробка (или её предок) вылезла из
     родителя, и край обрезающего контейнера режет её текст: «ПИРАМИДА · БИЛЬЯРДНЫЙ КЛУБ» (span.m-pill в строке
     .ma-dialog__tags, а строка во флекс-колонке с align-items:flex-start шире колонки) в <dialog> на 320, runtime
     --click 29.09. 2а и 2б такую метку не видят: текст не шире своей коробки. Не в счёт: вылезло прямо из самого
     обрезающего контейнера (лента пилюль, дорожка карусели «с подглядыванием» — так задумано), по пути сдвиг
     transform (дорожка карусели) или бесконечная анимация, текст в несколько строк, многоточие, sr-only,
     закреплённая панель (это panelCut) */
  const labelCut = (n, par, box, tr, tolText) => {
    if (!/nowrap|pre/.test(cs(par).whiteSpace) && !/nowrap|pre/.test(cs(box).whiteSpace)) return false;
    const fs = parseFloat(cs(par).fontSize) || 16; const lh = parseFloat(cs(par).lineHeight) || fs * 1.4;
    if (tr.height > Math.max(lh, fs) * 1.6) return false;
    if (clips(cs(box))) return false; /* коробка обрезает сама — это 2б */
    const clip = clipOf(box); if (!clip || isPanel(clip)) return false;
    const c = clip.getBoundingClientRect(); if (!cutBy(tr, c, tol)) return false;
    const right = tr.right > c.right + tol; /* с какой стороны режет */
    let out = false;
    for (let e = box, k = 0; e && k < 12; k++) {
      const p = blockOf(parentOf(e)); if (!p || p === clip || p.contains(clip)) break;
      if (cs(p).transform !== 'none') return false;
      const er = e.getBoundingClientRect(), pr = p.getBoundingClientRect();
      if (right ? er.right > pr.right + tolText : er.left < pr.left - tolText) { out = true; break; }
      e = p;
    }
    if (!out || movingBetween(par, clip) || cs(box).textOverflow === 'ellipsis' || srOnly(box) || op(par) <= 0.05) return false;
    addClipCut(n, par, box, clip, tr, 'метка');
    return true;
  };
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
    if (partly && o > 0.05 && !decor(el)) out.push({ el, sig: sig(el), kind: 'элемент', left: Math.round(r.left), right: Math.round(r.right), fixed: pos === 'fixed', sticky: pos === 'sticky', text: clean(el.innerText || el.textContent) });
    if (beyond && pos !== 'fixed') wide.push({ el, sig: sig(el), left: Math.round(r.left), right: Math.round(r.right), opacity: o, text: clean(el.innerText || el.textContent) });
  }
  /* 2. текст: за краем экрана (FAIL) и шире своей блочной коробки (WARN) */
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const par = n.parentElement; if (!par || SKIP.test(par.tagName)) continue;
    const tr = textRect(n); if (tr.width < 1 || tr.height < 1) continue;
    if (decor(par)) continue; /* декор: слово-фон, гигантское слово навылет (роль у блочной коробки — не декор) */
    /* допуск — 5% кегля, не меньше 2 px: жирный крупный шрифт законно вылезает боковыми выносами */
    const tolText = Math.max(2, (parseFloat(cs(par).fontSize) || 16) * 0.05);
    if (crosses(tr)) {
      if (op(par) <= 0.05) continue;
      const clip = clips(cs(par)) ? par : clipOf(par);
      if (!clip) { const pos = fixedChain(par); out.push({ el: par, sig: sig(par), kind: 'текст', left: Math.round(tr.left), right: Math.round(tr.right), fixed: pos === 'fixed', sticky: pos === 'sticky', text: clean(n.textContent) }); continue; }
      /* 2а. за краем экрана, но внутри обрезающего контейнера — раньше молча «карусель». Разрез — если текст вылез
         из СВОЕЙ блочной коробки (слайд карусели «с подглядыванием» режется целиком, его текст в своей карточке) и
         край контейнера режет строку: метка white-space:nowrap в <dialog> на 320 (runtime --click, 29.09) */
      const box = !(par instanceof SVGElement) && blockOf(par);
      const br = box && box.getBoundingClientRect();
      const wider = box && br.width > 0 && (tr.right > br.right + tolText || tr.left < br.left - tolText);
      if (wider && !isPanel(clip) && !movingBetween(par, clip) && cs(box).textOverflow !== 'ellipsis' && !srOnly(box)) {
        if (box === clip) { if (/hidden|clip/.test(cs(box).overflowX) && cutBy(tr, br, tolText)) addClipCut(n, par, box, box, tr, 'коробка'); }
        else if (cutBy(tr, clip.getBoundingClientRect(), tol)) addClipCut(n, par, box, clip, tr, 'контейнер');
      } else if (box && br.width > 0 && !wider) labelCut(n, par, box, tr, tolText); /* 2г: метка вылезла из родителя */
      continue;
    }
    if (par instanceof SVGElement) continue;
    const box = blockOf(par);
    if (!box) continue;
    const br = box.getBoundingClientRect();
    if (!(br.width > 0 && (tr.right > br.right + tolText || tr.left < br.left - tolText))) { if (br.width > 0) labelCut(n, par, box, tr, tolText); continue; } /* 2г */
    if (op(par) <= 0.05) continue; /* текста не видно */
    if (clips(cs(box))) {
      /* 2б. коробка сама обрезает (overflow hidden/clip) и режет строку без многоточия: подпись кнопки, метка карточки.
         Многоточие, sr-only, бегущая строка, прокрутка (overflow auto/scroll — её листают) — не в счёт */
      if (/hidden|clip/.test(cs(box).overflowX) && cs(box).textOverflow !== 'ellipsis' && !srOnly(box) && !isPanel(box) && !movingBetween(par, box) && cutBy(tr, br, tolText)) addClipCut(n, par, box, box, tr, 'коробка');
      continue;
    }
    textWider.push({ sig: sig(box), text: clean(n.textContent), textLeft: Math.round(tr.left), textRight: Math.round(tr.right), boxLeft: Math.round(br.left), boxRight: Math.round(br.right) });
  }
  /* 2в. текст не влез в поле формы: выбранный пункт select, значение или подсказка input шире внутренней ширины
     поля (без полей padding; у select со стрелкой браузера — ещё 20 px на стрелку). «Не важно / весь квартал»
     в select брони на 320: текст 197 px при внутренней ширине 188 — срезан, а переполнение давало OK */
  const fieldCut = [];
  {
    const cv = document.createElement('canvas').getContext('2d');
    /* поле-ловушка для ботов — не находка: за краем экрана (левее 0, правее ширины окна, выше начала страницы),
       tabindex=-1, внутри aria-hidden, спрятано предком (коробка до 2 px с overflow ≠ visible или clip — sr-only) */
    const clippedAway = (f) => { for (let p = parentOf(f); p && p !== document.body && p !== de; p = parentOf(p)) { const s = cs(p); const q = p.getBoundingClientRect(); if ((clips(s) && (q.width < 2 || q.height < 2)) || (s.clip && s.clip !== 'auto')) return true; } return false; };
    const trap = (f, r) => r.right <= 0 || r.left >= vw || r.bottom + scrollY <= 0 || f.getAttribute('tabindex') === '-1' || decor(f) || clippedAway(f);
    for (const f of document.querySelectorAll('select, input')) {
      const tag = f.tagName.toLowerCase(); const type = (f.getAttribute('type') || 'text').toLowerCase();
      if (tag === 'input' && !/^(text|search|email|tel|url)$/.test(type)) continue;
      if (tag === 'select' && (f.multiple || f.size > 1)) continue;
      const r = f.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || op(f) <= 0.05) continue;
      if (trap(f, r)) continue;
      const val = tag === 'select' ? ((f.options[f.selectedIndex] || {}).text || '') : (f.value || f.getAttribute('placeholder') || '');
      const shown = String(val).replace(/\s+/g, ' ').trim(); if (!shown) continue;
      const s = cs(f);
      cv.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const tt = s.textTransform === 'uppercase' ? shown.toUpperCase() : s.textTransform === 'lowercase' ? shown.toLowerCase() : shown;
      const ls = parseFloat(s.letterSpacing) || 0;
      const w = cv.measureText(tt).width + ls * tt.length;
      const arrow = tag === 'select' && !/^none$/.test(s.appearance || s.webkitAppearance || '') ? 20 : 0;
      const inner = f.clientWidth - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0) - arrow;
      if (!(inner > 0) || w <= inner + 1) continue;
      fieldCut.push({ sig: sig(f), text: clean(shown), what: tag === 'select' ? 'выбранный пункт' : f.value ? 'значение' : 'подсказка', textW: Math.round(w), innerW: Math.round(inner) });
    }
  }
  /* 3. закреплённые панели (fixed/sticky с overflow hidden/clip): текст, разрезанный их краем.
     Бегущая строка (бесконечная анимация между текстом и панелью) — не в счёт. */
  for (const p of all) {
    const s = cs(p); if (!((s.position === 'fixed' || s.position === 'sticky') && /hidden|clip/.test(s.overflowX))) continue;
    const pr = p.getBoundingClientRect(); if (pr.width < 1 || pr.height < 1 || op(p) <= 0.05) continue;
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue; const par = n.parentElement; if (!par || SKIP.test(par.tagName) || decor(par)) continue;
      const tr = textRect(n); if (tr.width < 1) continue;
      const cut = (tr.right > pr.right + tol && tr.left < pr.right - tol) || (tr.left < pr.left - tol && tr.right > pr.left + tol);
      if (!cut) continue;
      const clip = clips(cs(par)) ? par : clipOf(par);
      if (clip !== p || movingBetween(par, p) || op(par) <= 0.05) continue;
      panelCut.push({ sig: sig(par), panel: sig(p), text: clean(n.textContent), textLeft: Math.round(tr.left), textRight: Math.round(tr.right), panelLeft: Math.round(pr.left), panelRight: Math.round(pr.right) });
    }
  }
  /* 4. текст перекрыт картинкой (WARN covered). Opara, 320 px: круг-фото героя перечёркивал метку
     «Кофейня-пекарня · Рыбинск», а за край ничего не торчало — scrollWidth 320, проверка молчала.
     Картинка, видео, холст, svg от 40 px против строк текста чужих элементов (не предков и не потомков
     картинки); пересеклись — в центре пересечения elementsFromPoint: картинка в списке раньше текста —
     она сверху, находка; ниже — фон под текстом, так задумано. Закреплённое (fixed/sticky) не в счёт:
     наезжает при прокрутке по замыслу. Точка вне окна — окно на миг прокручивается к ней и сразу
     обратно в одном синхронном вызове (события прокрутки увидят прежнее место); свой скроллер вместо
     документа — такие точки пропускаются. Не видит: элементы с pointer-events:none (elementsFromPoint
     их не отдаёт — ни картинку, ни текст), прозрачные поля PNG (попадание по коробке, не по пикселям). */
  const covered = []; let coveredCount = 0;
  {
    const sx0 = scrollX, sy0 = scrollY; const vh = innerHeight;
    const media = [];
    for (const m of document.body.querySelectorAll('img, video, canvas, picture, svg')) {
      const tag = m.tagName.toLowerCase();
      if ((tag === 'svg' && m.ownerSVGElement) || (tag === 'picture' && m.querySelector('img'))) continue; /* вложенный svg; у picture считается его img */
      const r = m.getBoundingClientRect(); if (r.width < 40 || r.height < 40) continue;
      if (fixedChain(m) || op(m) <= 0.05) continue;
      media.push({ el: m, l: r.left + sx0, t: r.top + sy0, r: r.right + sx0, b: r.bottom + sy0 });
    }
    const hits = []; const seen = new Set();
    if (media.length) {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let nodes = 0;
      for (let n = w.nextNode(); n && nodes < 6000 && hits.length < 400; n = w.nextNode()) {
        if (!n.textContent.trim()) continue; const par = n.parentElement; if (!par || SKIP.test(par.tagName) || decor(par)) continue;
        nodes++;
        range.selectNodeContents(n); const lines = [...range.getClientRects()].filter((q) => q.width >= 1 && q.height >= 1);
        if (!lines.length) continue;
        let checked = null; /* видимость и закреплённость — только если строка вообще легла на картинку */
        for (const q of lines) {
          const L = q.left + sx0, T = q.top + sy0, R = q.right + sx0, B = q.bottom + sy0;
          for (const m of media) {
            const iw = Math.min(R, m.r) - Math.max(L, m.l), ih = Math.min(B, m.b) - Math.max(T, m.t);
            if (iw < 4 || ih < Math.min(8, (B - T) / 2)) continue;
            if (m.el === par || m.el.contains(par) || par.contains(m.el)) continue;
            if (checked === null) checked = op(par) > 0.05 && !fixedChain(par);
            if (!checked) break;
            const key = `${media.indexOf(m)}|${sig(par)}|${n.textContent.slice(0, 40)}`; /* одна точка на пару картинка — текст, не на каждую строку */
            if (seen.has(key)) continue; seen.add(key);
            hits.push({ m, par, n, x: Math.max(L, m.l) + iw / 2, y: Math.max(T, m.t) + ih / 2 });
          }
          if (checked === false) break;
        }
      }
    }
    try {
      for (const h of hits) {
        let vy = h.y - scrollY;
        if (vy < 0 || vy >= vh) { window.scrollTo({ left: sx0, top: Math.max(0, h.y - vh / 2), behavior: 'instant' }); vy = h.y - scrollY; }
        const vx = h.x - scrollX;
        if (vy < 0 || vy >= vh || vx < 0 || vx >= de.clientWidth) continue; /* не доехать: свой скроллер или точка вбок */
        const list = document.elementsFromPoint(vx, vy);
        const im = list.findIndex((e) => e === h.m.el || h.m.el.contains(e));
        let it = list.indexOf(h.par); if (it < 0) it = list.findIndex((e) => h.par.contains(e));
        if (im < 0 || it < 0 || im > it) continue; /* не видно одного из двух (pointer-events:none) или картинка под текстом */
        coveredCount++;
        if (covered.length < limit) covered.push({ sig: sig(h.par), text: clean(h.n.textContent), by: sig(h.m.el), x: Math.round(h.x), y: Math.round(h.y) });
      }
    } finally { if (scrollX !== sx0 || scrollY !== sy0) window.scrollTo({ left: sx0, top: sy0, behavior: 'instant' }); }
  }
  /* только самые внешние нарушители: ребёнок торчащего блока торчит вместе с ним */
  const outer = out.filter((o) => !out.some((p) => p.el !== o.el && p.el.contains(o.el))).filter((o, i, a) => a.findIndex((x) => x.el === o.el) === i).map(({ el, ...rest }) => rest);
  const uniq = (list, key) => list.filter((x, i, a) => a.findIndex((y) => key(y) === key(x)) === i);
  const tw = uniq(textWider, (x) => x.sig + x.text);
  const pc = uniq(panelCut, (x) => x.sig + x.text);
  const cc = uniq(clipCut, (x) => x.sig + x.text);
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
    covered, coveredCount, clipCut: cc.slice(0, limit), clipCutCount: cc.length, fieldCut: fieldCut.slice(0, limit), fieldCutCount: fieldCut.length,
    verdict: outer.length || sideScroll ? 'FAIL' : docWider || tw.length || pc.length || coveredCount || cc.length || fieldCut.length ? 'WARN' : 'OK',
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
 * WARN covered — текст перекрыт картинкой (img, video, canvas, svg от 40 px поверх строки
 * чужого текста по elementsFromPoint; фон под текстом — не в счёт): [{ sig, text, by, x, y }],
 * by — картинка, x/y — точка на странице; coveredCount — сколько всего пар.
 * Документ шире экрана (docWider) — причины в wideCauses, включая невидимые
 * (opacity 0) и целиком ушедшие вправо: FAIL, если вбок можно уехать
 * (sideScroll: overflow-x окна не hidden/clip), иначе WARN — полосы нет, но на
 * телефоне раскладка раздвигается и закреплённые панели растягиваются.
 * WARN clipCut — текст разрезан краем обрезающего контейнера без многоточия: строка вылезла из своей
 * блочной коробки, а контейнер (overflow ≠ visible: диалог, его прокручиваемое тело) режет её — в том числе
 * за краем экрана, где раньше считалось «карусель внутри overflow:hidden» (метка white-space:nowrap в
 * <dialog> на 320); или коробка сама overflow hidden/clip и режет свою строку (подпись кнопки); или метка в
 * одну строку (white-space: nowrap) целиком в своей коробке, но коробка или её предок вылезли из родителя, и
 * край контейнера режет текст (пилюля «ПИРАМИДА · БИЛЬЯРДНЫЙ КЛУБ» в строке меток окна афиши на 320). Не в
 * счёт: text-overflow: ellipsis, sr-only (коробка до 2 px, clip, clip-path inset(50%)), бегущая строка,
 * закреплённые панели (это panelCut), слайд карусели, обрезанный целиком (его текст в своей карточке), лента
 * пилюль и дорожка карусели, вылезшие прямо из обрезающего контейнера или сдвинутые transform, прокрутка
 * overflow auto/scroll у самой коробки. [{ sig, clip, text, nowrap, how: 'контейнер' | 'коробка' | 'метка',
 * textLeft, textRight, clipLeft, clipRight }], clipCutCount.
 * WARN fieldCut — текст не влез в поле формы: выбранный пункт select, значение или подсказка input (text,
 * search, email, tel, url) шире внутренней ширины поля (clientWidth − padding, у select со стрелкой браузера
 * ещё −20 px); ширина текста — measureText шрифтом поля. [{ sig, text, what, textW, innerW }], fieldCutCount.
 * Декор — не находка ни в одной проверке текста (outer, textWider, clipCut, panelCut, covered): внутри aria-hidden="true"
 * или role=presentation/none у самого элемента (у текста — у родителя) — гигантское слово навылет (coffee .shout), слова-фон.
 * Не декор: роль у предка (меню WAI-ARIA li role=none > a); текст, разбитый для анимации, — у предка aria-label, равный
 * всему его тексту (GSAP SplitText 3.13+), или рядом sr-only копия того же текста для читалки. Страница шире экрана из-за
 * декора — по-прежнему docWider. Поле-ловушка для ботов (за краем экрана, tabindex=-1, внутри aria-hidden, спрятано
 * предком) — не fieldCut.
 * Прозрачное (итоговая opacity ≤ 0.05) в outer не считается; поэтому звать
 * после scrollThrough, когда блоки появления уже показаны.
 * Возвращает { verdict, vw, docScrollWidth, docWider, sideScroll, wideCauses[],
 * bodyOverflowX, htmlOverflowX, count, outer[], textWider[], panelCut[], covered[], clipCut[], fieldCut[],
 * summary } — summary готовая строка для протокола.
 */
export async function findOverflow(page, { tolerance = 1, limit = 20 } = {}) {
  const r = await evaluateWith(page, overflowInPage, { tol: tolerance, limit }, { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN });
  const fmt = (o) => `${o.sig}${o.fixed ? ' [fixed]' : o.sticky ? ' [sticky]' : ''} ${o.left}…${o.right}px${o.text ? ` «${o.text}»` : ''}`;
  r.summary = r.outer.length
    ? `за краем экрана ${r.vw}px: ${r.outer.slice(0, 5).map(fmt).join(' | ')}${r.count > 5 ? ` и ещё ${r.count - 5}` : ''} (scrollWidth документа ${r.docScrollWidth})`
    : `за край экрана ${r.vw}px ничего не торчит (scrollWidth документа ${r.docScrollWidth})`;
  if (r.docWider) r.summary += ` · страница шире экрана на ${r.docScrollWidth - r.vw}px${r.sideScroll ? ', можно уехать вбок' : ' (полоса спрятана overflow-x)'}: ${r.wideCauses.slice(0, 3).map((o) => `${o.sig} до ${o.right}px${o.opacity <= 0.05 ? ' [невидимый]' : ''}`).join(' | ') || 'причина не найдена'}`;
  /* пары чисел — правые края по x от левого края окна (CSS px), а не ширины: «312>294px» читали как ширины (SKILL-ISSUES 503) */
  if (r.textWiderCount) r.summary += ` · текст шире коробки: ${r.textWider.slice(0, 3).map((t) => `${t.sig} «${t.text}» — правый край текста ${t.textRight} px при крае коробки ${t.boxRight} px`).join(' | ')} (края по x от левого края окна, CSS px)`;
  if (r.panelCutCount) r.summary += ` · обрезано панелью: ${r.panelCut.slice(0, 3).map((t) => `${t.panel} «${t.text}» — правый край текста ${t.textRight} px при крае панели ${t.panelRight} px`).join(' | ')} (края по x, CSS px)`;
  if (r.coveredCount) r.summary += ` · текст перекрыт: ${r.covered.slice(0, 3).map((t) => `${t.sig} «${t.text}» под ${t.by} (y ${t.y})`).join(' | ')}${r.coveredCount > 3 ? ` и ещё ${r.coveredCount - 3}` : ''}`;
  if (r.clipCutCount) r.summary += ` · текст обрезан: ${r.clipCut.slice(0, 3).map((t) => `${t.sig} «${t.text}»${t.nowrap ? ' (nowrap)' : ''} — правый край текста ${t.textRight} px при крае ${t.how === 'коробка' ? 'своей коробки' : t.clip} ${t.clipRight} px`).join(' | ')}${r.clipCutCount > 3 ? ` и ещё ${r.clipCutCount - 3}` : ''} (края по x, CSS px)`;
  if (r.fieldCutCount) r.summary += ` · текст не влез в поле: ${r.fieldCut.slice(0, 3).map((t) => `${t.sig} ${t.what} «${t.text}» — ширина текста ${t.textW} px при ширине поля ${t.innerW} px`).join(' | ')}${r.fieldCutCount > 3 ? ` и ещё ${r.fieldCutCount - 3}` : ''} (CSS px)`;
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
 * Справочник флагов (scripts/flags-doc.mjs): при RW_FLAGS_DUMP=1 разбор аргументов печатает, какие флаги
 * знает скрипт, строкой «@@RW-FLAGS {json}» и завершает процесс с кодом 0 — до любого действия скрипта.
 * runtime.mjs разбирает аргументы сам и зовёт flagsDump после своих списков. Без переменной — ничего.
 */
export function flagsDump(spec) {
  if (!process.env.RW_FLAGS_DUMP) return;
  process.stdout.write('@@RW-FLAGS ' + JSON.stringify(spec) + '\n');
  process.exit(0);
}
/* расстояние правки (вставка, удаление, замена, перестановка соседних) — для подсказки «может быть, --…?» */
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
/** Ближайший к k ключ из списка или null: расстояние правки до трети длины (не меньше 2), либо начало имени. */
export function closestFlag(k, keys) {
  let best = null, bd = Infinity;
  for (const c of new Set(keys)) {
    if (c === 'h' || c === 'help') continue;
    const dist = editDistance(k, c);
    const pre = k.length >= 3 && (c.startsWith(k) || k.startsWith(c));
    const lim = Math.max(2, Math.floor(c.length / 3));
    const score = dist <= lim ? dist : pre ? lim + 0.5 : Infinity;
    if (score < bd) { bd = score; best = c; }
  }
  return best;
}
/**
 * Аргументы: --out dir --name slug; флаг без значения даёт true; остальное — позиционные.
 * Ещё: запись --key=value; «--» — дальше только позиционные; значение,
 * начинающееся с «--», берётся, если не похоже на имя флага («--note "--scroll
 * прошёл"» → заметка) или если ключ перечислен в spec.values.
 * spec: { values: [...ключи, которые всегда берут следующий аргумент], flags: [...ключи без значения],
 *         optional: [...ключи со значением, которое берётся, если следующее слово не похоже на флаг],
 *         commands: [...команды скрипта: compare, init…] }.
 * Неизвестный ключ (нет ни в одном списке, если списки заданы) не забирает следующим словом адрес
 * (http, https, file, data, about), команду скрипта и слово на «-» («--strict http://…», «--verbose
 * compare a b» — адрес и команда остаются на месте) и даёт WARN в stderr: опечатка во флаге больше
 * не проходит молча. Ключи из списков разбираются как раньше.
 * strict: true — неизвестный ключ не WARN, а ошибка: строка «неизвестный флаг --x — может быть,
 * --y?» (ближайший объявленный) в stderr и код 1 до любого действия скрипта. WARN опечатку не
 * останавливал: «--viewpor mobile» молча мерил desktop. Включать, когда flags-doc.mjs --check
 * подтверждает, что все флаги скрипта объявлены (иначе strict отвергнет рабочий флаг).
 */
export function parseArgs(argv, { values = [], flags = [], optional = [], commands = [], strict = false } = {}) {
  flagsDump({ values, flags, optional, commands, strict: !!strict });
  const V = new Set(values), F = new Set(flags), O = new Set(optional), C = new Set(commands);
  const declared = V.size + F.size + O.size > 0;
  const looksLikeKey = (s) => s === '--' || /^--[A-Za-z][\w.-]*(=|$)/.test(s);
  const keepInPlace = (s) => /^(https?|file|data|about):/i.test(s) || C.has(s) || s.startsWith('-');
  const pos = []; const opt = {}; const unknown = [];
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = eq > 2 ? a.slice(2, eq) : a.slice(2);
      const known = V.has(k) || F.has(k) || O.has(k);
      if (eq > 2) { opt[k] = a.slice(eq + 1); if (declared && !known) unknown.push([k, null]); continue; }
      const next = argv[i + 1]; const n = next === undefined ? '' : String(next);
      if (F.has(k) || next === undefined) opt[k] = true;
      else if (V.has(k)) opt[k] = argv[++i];
      else if (looksLikeKey(n) || (!known && keepInPlace(n))) opt[k] = true;
      else opt[k] = argv[++i];
      if (declared && !known) unknown.push([k, opt[k] === true ? null : opt[k]]);
    } else pos.push(a);
  }
  if (strict && unknown.length) {
    for (const [k] of unknown) { const g = closestFlag(k, [...V, ...F, ...O]); console.error(`неизвестный флаг --${k}${g ? ` — может быть, --${g}?` : ''} (-h — список флагов)`); }
    process.exit(1);
  }
  for (const [k, took] of unknown) console.error(`WARN неизвестный флаг --${k} — не используется${took !== null ? ` (вместе со словом «${String(took).slice(0, 40)}», которое он забрал значением)` : ''}; -h — список флагов`);
  return { pos, opt };
}

/**
 * Имя без предела длины → до max знаков: длинное — начало и 8 знаков sha1 полного имени через «-».
 * Путь runs/<slug>/media/<запрос>/<файл> остаётся короче 260 знаков: sharp (libvips) и ffmpeg предел
 * Windows не обходят даже при LongPathsEnabled — на длинном пути падали превью, мозаики и кадры видео.
 * Разные длинные адреса не сливаются (хеш полного имени); имена до max знаков — прежние. То же правило
 * повторяет запасной путь design-reference (lib.mjs там) — держать общим.
 *   capSlug('site-ru-news-x') → 'site-ru-news-x';  capSlug('a'.repeat(300)) → 'aaa…a-1b2c3d4e' (60 знаков)
 */
export const SLUG_MAX = 60;
export function capSlug(s, max = SLUG_MAX) {
  s = String(s);
  if (s.length <= max) return s;
  return s.slice(0, max - 9).replace(/-+$/, '') + '-' + crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
}

/**
 * Имя папки прогона по адресу: хост без www, порт, путь — через «-», не длиннее SLUG_MAX (capSlug).
 * https://www.site.ru/news/x → site-ru-news-x; http://localhost:4177/ → localhost-4177;
 * http://127.0.0.1:8080/a → 127-0-0-1-8080-a; http://[::1]:4177/ → ip6-localhost-4177;
 * http://site.ru:8080/ → site-ru-8080; file:///C:/w/site/index.html → file-site-index-html.
 * { max: Infinity } — имя без предела (так звались папки до 28.09.2026: runDir находит старую).
 */
export function slugFromUrl(url, { max = SLUG_MAX } = {}) {
  const u = new URL(url);
  /* локальный файл: полный путь в имени папки бессмыслен — два последних сегмента, раскодированные */
  if (u.protocol === 'file:') {
    let p = u.pathname; try { p = decodeURIComponent(p); } catch { /* как есть */ }
    return capSlug(('file-' + p.split('/').filter(Boolean).slice(-2).join('-')).replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'file', max);
  }
  /* порт: у этой машины (localhost, *.localhost, 127.x.x.x, [::1], 0.0.0.0) — всегда, иначе все
     локальные сайты делят одну папку runs/localhost; у остальных — только явный нестандартный
     (URL сам убирает :80 у http и :443 у https), так старые папки доменов находятся как раньше.
     IPv6 без скобок и двоеточий: [::1] → ip6-localhost, [2001:db8::1] → ip6-2001-db8-1. */
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const local = h === 'localhost' || h.endsWith('.localhost') || /^127(\.\d{1,3}){3}$/.test(h) || h === '::1' || h === '0.0.0.0';
  const port = u.port || (local ? (u.protocol === 'https:' ? '443' : '80') : '');
  const name = h === '::1' ? 'ip6-localhost' : h.includes(':') ? `ip6-${h}` : h.replace(/^www\./, '');
  return capSlug((name + (port ? `-${port}` : '') + u.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'site', max);
}

/** Имя страницы по пути адреса (/news/x → news-x, / → home), не длиннее SLUG_MAX (capSlug). */
export function pageSlug(url) {
  const p = new URL(url).pathname.replace(/\/$/, '');
  return p ? capSlug(p.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()) : 'home';
}

/**
 * Папка прогона: --out, иначе SITE_REWORK_RUNS (или ~/.claude/site-rework/runs) / slugFromUrl(адрес).
 * Прогон длинного адреса, начатый до предела имени (28.09.2026), лежит под полным именем: такая
 * папка есть, а под коротким нет — берётся она, с WARN (один раз на процесс).
 */
const warnedRun = new Set();
export function runDir(opt, url) {
  if (opt.out) return path.resolve(String(opt.out));
  const base = process.env.SITE_REWORK_RUNS || path.join(os.homedir(), '.claude', 'site-rework', 'runs');
  const dir = path.join(base, slugFromUrl(url));
  let full = null; try { full = slugFromUrl(url, { max: Infinity }); } catch { /* не адрес — ниже упадёт сам */ }
  if (full && full !== path.basename(dir) && !fs.existsSync(dir) && fs.existsSync(path.join(base, full))) {
    if (!warnedRun.has(full) && warnedRun.add(full)) libWarn(`папка прогона — прежняя, под полным именем адреса (${full.length} знаков): ${path.join(base, full)}; новые прогоны этого адреса пишутся в ${path.basename(dir)} — перенесите папку, чтобы sharp и ffmpeg не упирались в предел пути Windows (260)`, 'папка');
    return path.join(base, full);
  }
  return dir;
}

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); return p; }

/* ---------- версия кода: поле generator в протоколах ---------- */

const LIB_FILE = realFile(fileURLToPath(import.meta.url));
const versionCache = new Map();
const isoMtime = (f) => { try { return fs.statSync(f).mtime.toISOString(); } catch { return null; } };
/* git только на чтение и без необязательных блокировок: status не обновляет индекс (index.lock),
   пока в том же репозитории кто-то коммитит */
const gitRead = (dir, args) => execFileSync('git', ['--no-optional-locks', '-C', dir, ...args], { encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 16 * 1024 * 1024 });

/**
 * Версии файлов кода по git: { [полный путь]: { commit, dirty, mtime } }.
 * commit — полный хеш последнего коммита (до 24.09.2026 — короткий; state.mjs сверяет по началу), где менялся файл (null — файл не в git, git нет,
 * папка не репозиторий); dirty — есть незакоммиченные правки или файл не отслеживается
 * (null — узнать нельзя); mtime — время файла (ISO). Два вызова git (log и status) на папку
 * и набор файлов, результат запоминается до конца процесса. Никогда не бросает.
 */
export function codeVersion(files) {
  const list = [...new Set((files || []).filter(Boolean).map((f) => path.resolve(String(f))))];
  const out = {};
  /* по настоящему пути: короткие имена Windows (C225~1) и ссылки не делят одну папку на две */
  const byDir = new Map();
  for (const f of list) { const r = realFile(f); const d = path.dirname(r); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push({ f, name: path.basename(r) }); }
  for (const [dir, fl] of byDir) {
    const names = [...new Set(fl.map((x) => x.name))].sort();
    const key = dir + '|' + names.join('|');
    if (!versionCache.has(key)) {
      const res = Object.fromEntries(names.map((n) => [n, { commit: null, dirty: null }]));
      try {
        /* log: коммиты, где менялись эти файлы, новые первыми; --relative — имена от папки dir */
        const log = gitRead(dir, ['log', '--relative', '--max-count=5000', '--format=%x01%H', '--name-only', '--', ...names]);
        let cur = null; const left = new Set(names);
        for (const line of log.split(/\r?\n/)) {
          if (line.startsWith('\x01')) { cur = line.slice(1).trim(); continue; }
          const n = line.trim(); if (!n || !cur || !left.has(n)) continue;
          res[n].commit = cur; left.delete(n); if (!left.size) break;
        }
        /* status: изменённые и неотслеживаемые (пути от корня репозитория — сверяем по имени) */
        const st = gitRead(dir, ['status', '--porcelain', '--untracked-files=all', '--', ...names]);
        const dirtyNames = new Set(st.split(/\r?\n/).filter(Boolean).map((l) => path.basename(l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop())));
        for (const n of names) res[n].dirty = dirtyNames.has(n);
      } catch { /* git нет или папка не репозиторий — версия неизвестна */ }
      versionCache.set(key, res);
    }
    const res = versionCache.get(key);
    for (const { f, name } of fl) out[f] = { ...res[name], mtime: isoMtime(f) };
  }
  return out;
}
function realFile(f) { try { return fs.realpathSync.native(f); } catch { return f; } }

let generatorCache;
/* Подключаемые модули скилла, от которых зависит протокол: статические импорты «./x.mjs» скрипта
   и их импорты (texture.mjs у a11y и perf, taste.mjs у cliche, clicks.mjs у motion, media/*.mjs),
   плюс модули, загруженные import() с вычисленным путём, — их скрипт называет trackModule(файл)
   (discover: texture.mjs и extract.mjs design-reference; media: media/video.mjs). */
const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s[^'"`;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
function localDeps(entry) {
  const seen = new Set([entry]); const out = [];
  const walk = (f) => {
    let src; try { src = fs.readFileSync(f, 'utf8'); } catch { return; }
    for (const m of src.matchAll(IMPORT_RE)) { const d = realFile(path.resolve(path.dirname(f), m[1] || m[2])); if (seen.has(d)) continue; seen.add(d); out.push(d); walk(d); }
  };
  walk(entry);
  return out;
}
const trackedModules = new Set();
/**
 * Модуль, загруженный import() с вычисленным путём (регулярка статических импортов его не видит):
 * его версия попадёт в generator.deps протоколов этого процесса. Звать рядом с import():
 *   trackModule(f); const mod = await import(pathToFileURL(f).href);
 */
export function trackModule(file) { const f = realFile(path.resolve(String(file))); if (!trackedModules.has(f)) { trackedModules.add(f); generatorCache = undefined; } }
/* имя зависимости в протоколе: путь от папки скиллов («site-rework/scripts/texture.mjs»), иначе полный */
const SKILLS_ROOT = path.dirname(path.dirname(path.dirname(LIB_FILE)));
const depKey = (f) => { const r = path.relative(SKILLS_ROOT, f); return (r && !r.startsWith('..') && !path.isAbsolute(r) ? r : f).replace(/\\/g, '/'); };
/**
 * Кто пишет протокол: { script, commit, dirty, mtime, lib: { commit, dirty, mtime },
 * deps?: { 'site-rework/scripts/texture.mjs': { commit, dirty, mtime }, … } } — запущенный файл
 * (process.argv[1]), lib.mjs, от которого зависят все скрипты, и подключаемые модули (статические
 * импорты и trackModule): после правки texture.mjs протокол a11y, снятый до неё, state.mjs помечает
 * «снят другой версией (texture.mjs …)». Поля deps нет — зависимостей нет (или протокол до 28.09.2026).
 * Считается один раз на процесс (новый trackModule сбрасывает). Без git — commit и dirty null.
 */
export function scriptGenerator() {
  if (generatorCache) return generatorCache;
  const script = process.argv[1] ? realFile(path.resolve(process.argv[1])) : null;
  const deps = [...new Set([...(script ? localDeps(script) : []), ...trackedModules])].filter((f) => f !== script && f !== LIB_FILE);
  const v = codeVersion([script, LIB_FILE, ...deps]);
  const s = script && v[script] ? v[script] : { commit: null, dirty: null, mtime: null };
  const l = v[LIB_FILE] || { commit: null, dirty: null, mtime: null };
  const ver = (f) => { const x = v[f] || {}; return { commit: x.commit ?? null, dirty: x.dirty ?? null, mtime: x.mtime ?? null }; };
  generatorCache = { script: script ? path.basename(script) : null, commit: s.commit, dirty: s.dirty, mtime: s.mtime, lib: script === LIB_FILE ? null : { commit: l.commit, dirty: l.dirty, mtime: l.mtime },
    ...(deps.length ? { deps: Object.fromEntries(deps.map((f) => [depKey(f), ver(f)])) } : {}) };
  return generatorCache;
}

/**
 * Записать JSON (с отступом 1). Протокол — объект — получает поле generator (scriptGenerator):
 * какой скрипт и какой версией его снял. Массив, объект с toJSON и объект, где generator уже
 * есть, пишутся как есть; { generator: false } — без поля (журнал state.json — не протокол).
 */
export function writeJson(file, data, { generator = true } = {}) {
  ensureDir(path.dirname(file));
  const plain = data && typeof data === 'object' && !Array.isArray(data) && typeof data.toJSON !== 'function';
  const out = generator && plain && !Object.prototype.hasOwnProperty.call(data, 'generator') ? { ...data, generator: scriptGenerator() } : data;
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
}
export function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
export const kb = (b) => `${Math.round((b || 0) / 1024)} КБ`;

/* =====================================================================
   Окно согласия cookie, ворота-заставки и SITE_REWORK_DISMISS: найти и закрыть до снимков (discover,
   motion, typeset — все, кто зовёт closeConsent). Раньше жило в discover.mjs.
   ===================================================================== */
const CONSENT_DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN };
/* В странице (или во фрейме согласия). Окно согласия — закреплённый блок, диалог или блок с именем
   cookie/consent/…, видимый, с текстом про cookie / consent / куки / персональные данные до 3000
   знаков, не шапка и не меню (ссылок не больше 8). Кнопка: принять → отклонить → закрыть; ссылка
   на другой адрес — никогда. Окно помечается data-rw-consent-box (его кнопки inPage не считает
   кнопками сайта), ссылки на окно и кнопку — window.__rwConsentBox / __rwConsentBtn.
   Слова кнопок — и на испанском, немецком, французском, итальянском: iubenda на virugroup.com
   («Aceptar» / «Rechazar») находилась, но не закрывалась. Кнопка — ещё и div/span с cursor:pointer
   или onclick и короткой надписью (конструкторы: «Хорошо» не <button>).
   Ворота и заставки (kind 'ворота'): окно без слов про cookie, но с кнопкой «ENTER» / «I'm in» /
   «Мне есть 18» — только закреплённое (fixed) или модальное; «Да», «Yes», «Войти» — только если оно
   ещё и модальное или закрывает ≥ 30% экрана (иначе «Войти» в закреплённой шапке-div нажалось бы).
   Кнопки остальной страницы не ищутся — только внутри найденного окна. Где не закрылось на разборе
   28.09: forgeautomotive.co.uk «ENTER», arunnm.com «I'm in», brewwave «Вам исполнилось 18 лет?» — «Да».
   Ворота целым экраном в потоке (не fixed) сюда не попадут — для них SITE_REWORK_DISMISS (closeConsent). */
function consentInPage() {
  const TEXT = /cookie|consent|gdpr|куки|персональн\S* данн/i;
  const NAME = /cookie|consent|gdpr|onetrust|cookiebot|didomi|usercentrics|cky-|cc-window|cc-banner|termly|iubenda|klaro|osano/i;
  const ACCEPT = /^(accept( all)?( cookies)?|accept (and|&) close|allow( all)?( cookies)?|i accept|agree( and (close|continue))?|i agree|got it!?|ok(ay)?!?|understood|continue|принять( все| всё)?( cookie| куки)?|принимаю|согласен|согласна|согласиться|соглашаюсь|я согласен|хорошо|понятно|ок|окей|разрешить( все)?|aceptar( todo| todas)?( las cookies)?|acepto|akzeptieren|alle akzeptieren|alle cookies akzeptieren|accepter( tout| et fermer)?|tout accepter|j['’]accepte|accetta( tutto| tutti)?|accetto)[.!]?$/i;
  const REJECT = /^(reject( all)?( cookies)?|decline( all)?|deny( all)?|refuse|(use )?(only )?(necessary|essential)( cookies)?( only)?|отклонить( все)?|отказаться|запретить|только необходимые|rechazar( todo| todas)?|ablehnen|alle ablehnen|refuser|tout refuser|continuer sans accepter|rifiuta( tutto| tutti)?)[.!]?$/i;
  const CLOSE = /^(close|dismiss|×|✕|✖|x|закрыть|cerrar|schlie(ß|ss)en|fermer|chiudi)$/i;
  /* ворота: STRONG — в любом закреплённом окне, WEAK — только в модальном или крупном */
  const GATE_STRONG = /^(enter( (the )?(site|website))?|i['’]?m in|i am in|(yes,? )?i['’]?m (over |at least )?18( or older)?|(yes,? )?i am (over |at least )?18( or older)?|мне (уже )?(есть|исполнилось) 18( лет)?|(да,? )?мне есть 18|мне больше 18|я старше 18( лет)?|18\+|войти на сайт)[.!]?$/i;
  const GATE_WEAK = /^(yes|да|войти|продолжить)[.!]?$/i;
  const MODAL = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
  const cls = (el) => `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`;
  const text = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && eff(el) > 0.05; };
  const shareOf = (r) => Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / (innerWidth * innerHeight);
  const els = []; const walk = (root, d) => { for (const el of root.querySelectorAll('*')) { els.push(el); if (el.shadowRoot && d < 4) walk(el.shadowRoot, d + 1); } }; walk(document, 0);
  /* boxes — окна согласия (как раньше), gates — закреплённые/модальные окна без слов про cookie до 600 знаков */
  const boxes = []; const gates = [];
  for (const el of els) {
    if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|HEADER|NAV)$/.test(el.tagName)) continue;
    const s = getComputedStyle(el);
    const modal = el.matches(MODAL);
    const fixedish = s.position === 'fixed' || s.position === 'sticky' || modal;
    if ((!fixedish && !NAME.test(cls(el))) || !vis(el)) continue;
    const t = text(el); if (!t.length || t.length > 3000) continue;
    if (TEXT.test(t)) boxes.push(el);
    else if (t.length <= 600 && (s.position === 'fixed' || modal)) gates.push(el);
  }
  const outerOf = (list) => list.filter((b) => !list.some((o) => o !== b && o.contains(b)));
  const outer = [...outerOf(boxes).map((box) => ({ box, kind: 'cookie' })), ...outerOf(gates).filter((g) => !boxes.some((b) => b.contains(g))).map((box) => ({ box, kind: 'ворота' }))];
  const label = (b) => String((b.tagName === 'INPUT' ? b.value : text(b)) || b.getAttribute('aria-label') || b.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
  for (const { box, kind } of outer) {
    if (box.querySelectorAll('a[href]').length > 8 || box.querySelector('nav')) continue;
    const btns = []; const collect = (root, d) => { for (const b of root.querySelectorAll('button, input[type="button"], input[type="submit"], a, [role="button"]')) btns.push(b); if (d < 3) for (const e of root.querySelectorAll('*')) if (e.shadowRoot) collect(e.shadowRoot, d + 1); };
    collect(box, 0); if (box.shadowRoot) collect(box.shadowRoot, 1);
    /* кнопка-div: cursor:pointer или onclick, надпись до 40 знаков, внутри нет настоящей кнопки; самая глубокая */
    const divs = [...box.querySelectorAll('div, span, label, li, p')].filter((e) => { const t = text(e); return t && t.length <= 40 && !btns.some((b) => b === e || b.contains(e) || e.contains(b)) && (e.hasAttribute('onclick') || getComputedStyle(e).cursor === 'pointer'); });
    const ok = [...btns, ...divs.filter((e) => !divs.some((o) => o !== e && e.contains(o)))].filter((b) => vis(b) && !b.disabled && !(b.tagName === 'A' && b.getAttribute('href') && !/^(#|javascript:)/i.test(b.getAttribute('href'))));
    const r = box.getBoundingClientRect();
    const modal = box.matches(MODAL); const fixed = modal || getComputedStyle(box).position === 'fixed';
    const big = modal || shareOf(r) >= 0.3; /* «Да», «Войти» и общие «OK»/«Continue» вне cookie — только в таком */
    const isGate = (b) => (fixed && GATE_STRONG.test(label(b))) || (big && GATE_WEAK.test(label(b)));
    const pick = kind === 'cookie'
      ? ok.find((b) => ACCEPT.test(label(b))) || ok.find(isGate) || ok.find((b) => REJECT.test(label(b))) || ok.find((b) => CLOSE.test(label(b)) || /close|dismiss|закрыть/i.test(b.getAttribute('aria-label') || ''))
      : ok.find((b) => big && ACCEPT.test(label(b))) || ok.find(isGate);
    if (kind !== 'cookie' && !pick) continue; /* закреплённое без кнопки входа — не ворота (шапка, чат, заставка загрузки) */
    const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
    const place = `${cy < innerHeight / 3 ? 'сверху' : cy > innerHeight * 2 / 3 ? 'снизу' : 'по центру'}${r.width >= innerWidth * 0.9 ? ' во всю ширину' : cx < innerWidth / 3 ? ' слева' : cx > innerWidth * 2 / 3 ? ' справа' : ''}`;
    box.setAttribute('data-rw-consent-box', '1'); window.__rwConsentBox = box; window.__rwConsentBtn = pick || null;
    return {
      kind, box: sig(box), text: text(box).slice(0, 90), w: Math.round(r.width), h: Math.round(r.height), place, share: Math.round(shareOf(r) * 100),
      buttons: ok.map(label).filter(Boolean).slice(0, 6), pick: pick ? label(pick) : null,
      pickKind: pick ? (ACCEPT.test(label(pick)) ? 'принять' : isGate(pick) ? 'войти' : REJECT.test(label(pick)) ? 'отклонить' : 'закрыть') : null,
    };
  }
  return null;
}
async function consentGone(fr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const shown = await evaluateWith(fr, () => { const b = window.__rwConsentBox; if (!b || !b.isConnected) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && eff(b) > 0.05; }, null, CONSENT_DEPS).catch(() => false);
    if (!shown) return true;
    await sleep(150);
  }
  return false;
}
/* SITE_REWORK_DISMISS — что нажать после загрузки, если скрипты сами не закрыли: заставка-ворота
   целым экраном в потоке (не fixed), своя кнопка без знакомых слов. Список через «||»: CSS-селектор
   или «text:Надпись» (без учёта регистра и пробелов; сначала точное совпадение надписи, потом
   «содержит», не длиннее надписи на 20 знаков; из совпавших — кнопка или ссылка, иначе самый глубокий).
   Пример: SITE_REWORK_DISMISS="text:ENTER||#age-gate .yes" (forgeautomotive.co.uk, 28.09). Только
   основной документ, не фреймы. */
function dismissSpecs() {
  return String(process.env.SITE_REWORK_DISMISS || '').split('||').map((s) => s.trim()).filter(Boolean)
    .map((s) => (/^text:/i.test(s) ? { raw: s, text: s.slice(5).trim() } : { raw: s, sel: s })).filter((s) => s.sel || s.text);
}
/* в странице: найти и запомнить в window.__rwDismissEl → { sig, label } | { hidden: [{ sig, why }], count }
   (совпало, но не видно: display:none, 0×0, прозрачно) | { error } | null (не совпало ничего) */
function dismissInPage(spec) {
  const text = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && eff(el) > 0.05; };
  /* почему не видно: крестик fancybox у темы mamuka.rest — display:none (0×0), и нажимать было нечего */
  const whyHidden = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { if (getComputedStyle(e).display === 'none') return e === el ? 'display:none' : `display:none у предка ${sig(e)}`; }
    const s = getComputedStyle(el); if (s.visibility !== 'visible') return `visibility:${s.visibility}`;
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return `размер ${Math.round(r.width)}×${Math.round(r.height)}`;
    return eff(el) <= 0.05 ? 'прозрачный (opacity 0)' : 'не виден';
  };
  let list = [];
  if (spec.sel) {
    try { list = [...document.querySelectorAll(spec.sel)]; } catch (e) { return { error: `неверный селектор (${String(e.message || e).slice(0, 80)})` }; }
  } else {
    const want = spec.text.replace(/\s+/g, ' ').trim().toLowerCase();
    const all = []; const walk = (root, d) => { for (const e of root.querySelectorAll('*')) { all.push(e); if (e.shadowRoot && d < 4) walk(e.shadowRoot, d + 1); } }; walk(document, 0);
    const lab = (e) => String((e.tagName === 'INPUT' ? e.value : text(e)) || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const cand = all.filter((e) => !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|HEAD|HTML|BODY)$/.test(e.tagName));
    /* сначала видимые (как раньше), потом — те же правила без видимости: чтобы сказать «найдено, но скрыто» */
    const pick = (keep) => {
      let same = cand.filter((e) => lab(e) === want && keep(e));
      if (!same.length) same = cand.filter((e) => { const l = lab(e); return l.includes(want) && l.length <= want.length + 20 && keep(e); });
      const deep = same.filter((e) => !same.some((o) => o !== e && e.contains(o)));
      const first = same.find((e) => e.matches('button, a, [role="button"], input')) || deep[0];
      return first ? [first, ...deep.filter((e) => e !== first)] : [];
    };
    list = pick(vis); if (!list.length) list = pick(() => true);
  }
  const el = list.find(vis) || null;
  if (!el) return list.length ? { hidden: list.slice(0, 3).map((e) => ({ sig: sig(e), why: whyHidden(e) })), count: list.length } : null;
  window.__rwDismissEl = el;
  return { sig: sig(el), label: text(el).slice(0, 40) || el.getAttribute('aria-label') || '' };
}
/* адрес документа из самой страницы: page.url() у Firefox на file:// после перехода скриптом отставал, и переход не
   замечался (мерилась главная, 30.09) */
const locOf = async (page) => { const u = await page.evaluate(() => location.href).catch(() => null); return u || page.url(); };
/* метка документа: пропала — документ сменился (переход или перезагрузка), даже если адрес вкладки ещё прежний */
const markDoc = (page) => page.evaluate(() => { if (!window.__rwDocMark) window.__rwDocMark = `${Date.now()}-${Math.random().toString(36).slice(2)}`; return window.__rwDocMark; }).catch(() => null);
/* после нажатия: 'nav' — документ сменился, 'gone' — цель исчезла, 'shown' — на экране, null — страница не ответила */
const afterClick = (page, mark) => evaluateWith(page, (m) => {
  if (m && window.__rwDocMark !== m) return 'nav';
  const e = window.__rwDismissEl; if (!e || !e.isConnected) return 'gone';
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && eff(e) > 0.05 ? 'shown' : 'gone';
}, mark, CONSENT_DEPS).catch(() => null);
/* ждать, пока цель не исчезнет или документ не сменится → 'gone' | 'nav' | 'shown' (осталась) | null (не отвечала) */
async function dismissGone(page, ms, mark) {
  const t0 = Date.now(); let st = null;
  while (Date.now() - t0 < ms) {
    st = await afterClick(page, mark);
    if (st === 'gone' || st === 'nav') return st;
    await sleep(150);
  }
  return st;
}
/* цель исчезла, а перехода нет: сайт мог запомнить выбор запросом и увести позже (fetch → location.href). Ещё
   NAV_GRACE_MS смотреть, не сменится ли документ; пока идут запросы, начатые нажатием (fetch, xhr, документ), — до
   NAV_GRACE_MAX_MS → 'nav' | 'gone' */
const NAV_GRACE_MS = 600;
const NAV_GRACE_MAX_MS = 5000;
async function navGrace(page, mark, busy, navReq) {
  const t0 = Date.now(); let miss = 0;
  for (;;) {
    if (navReq()) return 'nav';
    const st = await afterClick(page, mark);
    if (st === 'nav') return 'nav';
    miss = st === null ? miss + 1 : 0;
    const t = Date.now() - t0;
    if ((t >= NAV_GRACE_MS && !busy()) || t >= NAV_GRACE_MAX_MS) return miss ? 'nav' : 'gone';
    await sleep(100);
  }
}
/* новый документ загрузился (readyState complete) → true | false (не дождались за ms) */
async function waitDocReady(page, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await page.evaluate(() => document.readyState).catch(() => null)) === 'complete') return true; await sleep(150); }
  return false;
}
/* нажать всё из SITE_REWORK_DISMISS → [{ spec, found, status, sig, label, gone, nav, why, hidden?, remembered?,
   waitedMs, sinceLoadMs }] (пусто — переменной нет). Селектор ждётся до DISMISS_WAIT_MS от начала загрузки документа
   (performance.now), но не меньше DISMISS_MIN_MS от вызова — одно ожидание на все записи списка, по порядку: окно выбора
   города mamuka.rest появляется через ~2 с после начала загрузки. Раньше ждали 5 с от вызова, и страница, где выбор уже
   запомнен (окна больше нет), каждый раз теряла 5 с — на mamuka.rest +5 с на каждую страницу и экран после первого.
   status: 'нажато' | 'осталось' (нажали, а оно на экране) | 'скрыто' (совпало, но не видно) | 'не найдено' | 'ошибка' */
const DISMISS_WAIT_MS = 5000;
const DISMISS_MIN_MS = 1000;
const REOPEN_WATCH_MS = 2500;
const dismissOk = new Set(); /* записи, нажатые в этом процессе: окно, которое браузер больше не показывает (выбор запомнен), — не WARN */
/* тот же документ: адрес без # и без / в конце пути (https://mamuka.rest/menu/ = …/menu) */
const sameDoc = (a, b) => { const n = (u) => { try { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/+$/, '')}${x.search}`; } catch (e) { return String(u).split('#')[0].replace(/\/+$/, ''); } }; return n(a) === n(b); };
/* нажатие увело на другой адрес (mamuka.rest: «Ярославль» в окне выбора города на /menu/ открывает главную) или
   перезагрузило страницу — открыть нужную страницу заново: выбор сайт уже запомнил (куки, хранилище). Журнал вкладки —
   только её: сначала уйти с промежуточной на about:blank (её запросы обрываются и отписываются), потом resetPageLog, потом
   открыть нужную (runtime засчитывал /menu/ запросы и консоль главной, 30.09). Потом до REOPEN_WATCH_MS смотреть, не
   вернулось ли окно (сайт выбор не запомнил) и не увёл ли скрипт страницы снова. → { want, via, got, ok, again, error,
   dropped } — dropped: сколько записей журнала промежуточной страницы (и первой загрузки) выброшено */
async function reopenAfterDismiss(page, want, spec) {
  const r = { want, via: await locOf(page) };
  await Promise.race([page.goto('about:blank', { timeout: 5000 }).catch(() => {}), sleep(6000)]);
  await sleep(200);
  r.dropped = resetPageLog(page);
  try { await gotoRetry(page, want, { waitUntil: 'networkidle2', timeout: 60000, attempts: 2 }); await page.evaluate(() => document.fonts.ready).catch(() => {}); }
  catch (e) { r.error = String((e && e.message) || e).split('\n')[0].slice(0, 120); }
  let f = null;
  if (!r.error) {
    const until = Date.now() + REOPEN_WATCH_MS;
    for (;;) { f = await evaluateWith(page, dismissInPage, spec, CONSENT_DEPS).catch(() => null); if ((f && f.sig) || Date.now() >= until || !sameDoc(await locOf(page), want)) break; await sleep(250); }
  }
  r.got = await locOf(page); r.ok = !r.error && sameDoc(r.got, want); r.again = !!(r.ok && f && f.sig);
  return r;
}
async function runDismiss(page, specs = dismissSpecs()) {
  const out = []; let t0 = Date.now();
  let since0 = await page.evaluate(() => performance.now()).catch(() => 0);
  let until = t0 + Math.max(DISMISS_MIN_MS, DISMISS_WAIT_MS - since0);
  const sinceLoad = () => Math.round(since0 + Date.now() - t0);
  for (const spec of specs) {
    let f = null;
    for (;;) {
      f = await withDeadline(evaluateWith(page, dismissInPage, spec, CONSENT_DEPS), 10000, 'поиск SITE_REWORK_DISMISS').catch((e) => ({ error: String(e.message || e).slice(0, 100) }));
      if (f && (f.sig || f.error)) break;
      if (Date.now() >= until) break;
      await sleep(250);
    }
    if (!f || !f.sig) {
      const hidden = f && f.hidden ? f.hidden : null; const err = f && f.error;
      const remembered = !hidden && !err && dismissOk.has(spec.raw);
      const waited = `${(sinceLoad() / 1000).toFixed(1).replace('.', ',')} с от начала загрузки`;
      out.push({ spec: spec.raw, found: false, status: err ? 'ошибка' : hidden ? 'скрыто' : 'не найдено', ...(hidden ? { hidden, count: f.count } : {}), ...(remembered ? { remembered } : {}), waitedMs: Date.now() - t0, sinceLoadMs: sinceLoad(),
        why: err || (hidden ? `найдено, но скрыто (${hidden[0].why}): ${hidden[0].sig}${f.count > 1 ? ` и ещё ${f.count - 1}` : ''} — нажать нечего` : remembered ? `не появилось за ${waited}: раньше в этом прогоне уже нажато, браузер запомнил выбор` : `не найдено за ${waited}`) });
      continue;
    }
    const waitedMs = Date.now() - t0, sinceLoadMs = sinceLoad(); /* до нажатия: после повторного открытия отсчёт заново */
    const full0 = await locOf(page); const url0 = full0.split('#')[0]; /* href="#…" — не переход */
    /* смена документа — по метке в нём (Firefox на file:// не менял page.url(), и переход не замечался, 30.09) и по запросу
       документа главного кадра: у медленного сайта адрес меняется, только когда новый документ пришёл, а запрос виден
       раньше (второй клик мышью по уходящей странице не нужен). busy — запросы, начатые нажатием (fetch, xhr, документ):
       сайт запоминает выбор запросом и уводит потом */
    const mark = await markDoc(page);
    let navReq = null; const busy = new Set(); let tClick = 0;
    const onReq = (r) => {
      try { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navReq = r.url(); } catch (e) { /* Firefox: без признака */ }
      /* начатые самим нажатием — в первые 0,4 с после него (фоновый опрос чата позже — не в счёт) */
      const t = resourceTypeOf(r); if ((t === 'fetch' || t === 'xhr' || t === 'document') && tClick && Date.now() - tClick < 400) busy.add(r);
    };
    const onDone = (r) => { busy.delete(r); };
    page.on('request', onReq); page.on('requestfinished', onDone); page.on('requestfailed', onDone);
    const navDone = page.waitForNavigation({ timeout: 15000, waitUntil: 'domcontentloaded' }).then(() => true, () => false);
    let st = null;
    try {
      tClick = Date.now();
      await page.evaluate(() => { const e = window.__rwDismissEl; if (e && e.isConnected) e.click(); }).catch(() => {});
      st = await dismissGone(page, 2500, mark);
      if (st === 'shown' && !navReq) { /* настоящий клик мышью: click() из скрипта слушают не все */
        const pt = await page.evaluate(() => { const e = window.__rwDismissEl; if (!e || !e.isConnected) return null; e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }).catch(() => null);
        if (pt) { tClick = Date.now(); await page.mouse.click(pt.x, pt.y).catch(() => {}); st = await dismissGone(page, 2500, mark); }
      }
      /* цель ушла, а перехода не видно — подождать отложенный (запрос выбора, потом location.href) */
      if (st !== 'nav' && st !== 'shown' && !navReq) st = await navGrace(page, mark, () => busy.size > 0, () => !!navReq);
      if (navReq) { st = 'nav'; await navDone; } /* документ главного кадра запрошен — дождаться, пока он придёт */
    } finally { page.off('request', onReq); page.off('requestfinished', onDone); page.off('requestfailed', onDone); }
    /* увело или перезагрузило: дать новому документу догрузиться (выбор сайт мог записать уже в нём), потом адрес */
    if (st === 'nav') { await waitDocReady(page, 8000); await page.waitForNetworkIdle({ idleTime: 500, timeout: 6000 }).catch(() => {}); }
    const loc = await locOf(page);
    const sameMark = st === 'nav' ? await page.evaluate((m) => window.__rwDocMark === m, mark).catch(() => false) : true;
    /* сменился документ (метка пропала) или адрес без # (history.pushState — маршрут одностраничного сайта) */
    const moved = !sameMark || loc.split('#')[0] !== url0;
    let nav = null, reload = false, re = null;
    if (moved) {
      nav = loc; reload = sameDoc(loc, full0);
      /* открыть нужную страницу заново (журнал — только её); дальше (следующие записи списка) — от начала нового документа */
      re = await reopenAfterDismiss(page, full0, spec);
      if (!re.ok) page.rwWrongPage = { want: re.want, got: re.got, why: re.error || `открылась ${re.got}` };
      t0 = Date.now(); since0 = await page.evaluate(() => performance.now()).catch(() => 0); until = t0 + Math.max(DISMISS_MIN_MS, DISMISS_WAIT_MS - since0);
    }
    /* запрос документа был, а документ тот же (скачивание, ответ 204) — где цель, смотреть заново */
    if (st === 'nav' && !moved) st = (await afterClick(page, mark)) || 'gone';
    const gone = moved || st === 'gone';
    if (gone) dismissOk.add(spec.raw);
    out.push({ spec: spec.raw, found: true, status: gone ? 'нажато' : 'осталось', sig: f.sig, label: f.label, gone, nav, ...(reload ? { reload } : {}),
      ...(re ? { want: re.want, back: re.got, reopened: re.ok && !re.again, ...(re.again ? { again: true } : {}), ...(re.ok ? {} : { wrongPage: true }), ...(re.error ? { reopenError: re.error } : {}), ...(re.dropped ? { dropped: re.dropped } : {}) } : {}),
      waitedMs, sinceLoadMs, ...(gone ? {} : { why: `нажато ${f.sig}${f.label ? ` «${f.label}»` : ''}, но осталось на экране` }) });
  }
  if (out.some((d) => d.found)) { await page.mouse.move(1, 1).catch(() => {}); await sleep(300); }
  return out;
}

/** Итог записи SITE_REWORK_DISMISS одной строкой (с ** вокруг плохого — для отчётов в markdown):
    «.x» — нажато li.a «Ярославль», исчезло; …, увело на https://site/ — нужная страница открыта заново (выбор сайт
    запомнил); …, перезагрузило страницу — нужная страница открыта заново …; …, увело на X; открыть Y заново не вышло
    (…) — **замер не той страницы**. */
export function dismissLine(d) {
  if (!d.found) return `«${d.spec}» — ${d.why}`;
  const who = `нажато ${d.sig}${d.label ? ` «${d.label}»` : ''}`;
  if (d.nav) {
    const back = d.wrongPage ? `; открыть ${d.want || 'нужную страницу'} заново не вышло (${d.reopenError || `открылась ${d.back}`}) — **замер не той страницы**`
      : d.again ? '; нужная страница открыта заново, но окно снова на экране — сайт не запомнил выбор, **замеры под окном**'
        : d.reopened ? ` — нужная страница открыта заново (выбор сайт запомнил)${d.dropped ? '; запросы и консоль в счёте — только её' : ''}` : '';
    return `«${d.spec}» — ${who}, ${d.reload ? 'перезагрузило страницу' : `увело на ${d.nav}`}${back}`;
  }
  return `«${d.spec}» — ${who}${d.gone ? ', исчезло' : ', **осталось на экране**'}`;
}
/* INFO — нажато и исчезло (увело — и нужная страница открыта заново без окна) или окно больше не показывается (выбор
   запомнен); остальное — WARN: не найдено, скрыто, осталось, не та страница, окно вернулось */
const dismissOkLine = (d) => (d.found && d.gone && !d.wrongPage && !d.again) || !!d.remembered;
function reportDismiss(list) {
  for (const d of list) {
    const line = `SITE_REWORK_DISMISS ${dismissLine(d).replace(/\*\*/g, '')}`;
    if (dismissOkLine(d)) libInfo(line, `dismiss|${d.spec}|${d.status}|${d.sig || ''}|${d.nav ? 'nav' : ''}`);
    else libWarn(line, 'SITE_REWORK_DISMISS');
  }
}

/**
 * SITE_REWORK_DISMISS на этой странице: ждать появления каждой записи до 5 с от начала загрузки документа (не
 * меньше 1 с от вызова) и нажать (как closeConsent) — один раз на документ: повторный вызов в том же документе
 * (closeConsent после openPage, повторная проверка discover) отдаёт прежний итог и ничего не нажимает; после
 * перехода — снова. Итог каждой записи — строкой INFO (нажато и исчезло; не появилось, потому что раньше в этом
 * прогоне уже нажато) или WARN (не найдено за 5 с от начала загрузки, найдено, но скрыто — display:none, 0×0,
 * прозрачно; нажато, но осталось; неверный селектор).
 * Нажатие увело на другой адрес (mamuka.rest: «Ярославль» на /menu/ открывает главную, и shots, runtime и a11y молча
 * мерили главную с OK — 29.09) или перезагрузило страницу — нужная страница открывается заново (выбор сайт уже запомнил)
 * и 2,5 с смотрится, не вернулось ли окно: вышло — INFO «увело на X — нужная страница открыта заново»; окно вернулось —
 * WARN «сайт не запомнил выбор, замеры под окном»; открылась не она — WARN «замер не той страницы» и page.rwWrongPage
 * { want, got, why }. Смена документа видна по метке в нём (и в Firefox на file://, где адрес вкладки отставал), по
 * запросу документа и по адресу; цель исчезла без перехода — ещё 0,6 с (пока идут запросы, начатые нажатием, — до 5 с)
 * смотрится, не уведёт ли сайт позже. Журнал вкладки (page.log и журналы скриптов через onPageLogReset) после повторного
 * открытия — только нужной страницы: запросы и консоль промежуточной и первой загрузки выброшены (dropped).
 * → [{ spec, found, status, sig, label, gone, nav, reload?, want?, back?, reopened?, again?, wrongPage?, reopenError?,
 * dropped?, why, hidden?, remembered?, waitedMs, sinceLoadMs }], пусто — переменной нет. Итог — ещё и в page.rwDismiss.list
 * (dismissNote(page) — строкой для сводки, dismissLine — одна запись).
 */
export async function applyDismiss(page) {
  const specs = dismissSpecs(); if (!specs.length) return [];
  const had = page.rwDismiss;
  if (had) {
    const here = await page.evaluate(() => !!window.__rwDismissDone).catch(() => false);
    if (here || (had.navTo && page.url() === had.navTo)) return had.list;
  }
  page.rwWrongPage = null;
  const list = await runDismiss(page, specs);
  await page.evaluate(() => { window.__rwDismissDone = true; }).catch(() => {});
  page.rwDismiss = { list, navTo: list.some((d) => d.nav) ? page.url() : null };
  reportDismiss(list);
  return list;
}
/** Итог SITE_REWORK_DISMISS строкой для сводки: «не задана» | «.x» — нажато …; «.y» — не найдено за 5,1 с от начала загрузки. page — вкладка или список из applyDismiss. */
export function dismissNote(pageOrList) {
  const list = Array.isArray(pageOrList) ? pageOrList : pageOrList && pageOrList.rwDismiss ? pageOrList.rwDismiss.list : null;
  if (!dismissSpecs().length && !(list && list.length)) return 'не задана';
  if (!list || !list.length) return 'задана, но на этой странице не применялась';
  return list.map(dismissLine).join('; ');
}

/* В странице: открытое окно без слов про cookie. Окно — это семантика окна или подложка, а не просто крупный
   закреплённый блок со ссылками (29.09: закреплённый первый экран, половина экрана «пополам» и страница в закреплённом
   контейнере прокрутки давали ложный WARN):
     семантика — явная модалка (MODAL_STRONG: dialog[open], aria-modal, fancybox, Magnific, Tilda, Bootstrap, SweetAlert,
       UIkit, tingle; :modal) любого размера; role=dialog / alertdialog от 5% экрана; закреплённый блок с классом окна
       (modal, popup, pop-up, lightbox) от 5% экрана;
     подложка — закреплённый слой от 90% экрана без такой семантики: только если прокрутка страницы заперта (overflow
       hidden у html/body или body fixed, а содержимое выше окна; страницу не листает сам body со своей прокруткой) или
       слой полупрозрачный (фон с альфой 0,05…0,95,
       без картинки и без непрозрачного слоя на весь экран внутри) и под ним — содержимое страницы в потоке (не
       закреплённое: фон, видео под первым экраном — не содержимое).
   Слой и блок с классом окна, в которых почти весь текст страницы, — оболочка сайта, не окно. Всё — сверху (в центре
   окна elementFromPoint — оно), с видимой кнопкой, ссылкой или пунктом списка внутри, текста до 2000 знаков.
   Окно согласия (слова cookie, куки, персональные данные) и помеченное closeConsent — не здесь.
   Предложение для SITE_REWORK_DISMISS: видимый крестик (класс *close*, data-dismiss, data-fancybox-close,
   aria-label/title «закрыть»/«close», надпись × ✕ x), иначе первый вариант выбора — кнопка, пункт списка вокруг
   ссылки (клик по пункту не уводит по ссылке: окно выбора города mamuka.rest закрывается так), ссылка-якорь,
   ссылка на эту же страницу; ссылка на другой адрес — последней, с пометкой. Селектор — «окно пункт»
   (.fancybox-container li.style-listing-items__item), проверенный querySelectorAll; не собрался — «text:Надпись».
   → { sig, how, share, text, close: { sel, sig, visible, why }?, option: { sel, sig, label, href?, leaves }?, suggest } | null */
function openModalInPage({ strong }) {
  const vw = innerWidth, vh = innerHeight;
  const COOKIE = /cookie|consent|gdpr|куки|персональн\S* данн/i;
  const CLOSE_RE = /^(close|dismiss|×|✕|✖|x|закрыть|cerrar|schlie(ß|ss)en|fermer|chiudi)$/i;
  const text = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const label = (el) => String((el.tagName === 'INPUT' ? el.value : text(el)) || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && eff(el) > 0.05; };
  const shareOf = (r) => Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / (vw * vh);
  const POPUP = /(^|[-_])(modal|popup|pop-up|lightbox)($|[-_])/i;
  /* вид кандидата: 'strong' (явная модалка), 'role' (role=dialog/alertdialog), 'class' (закреплённый блок с классом окна),
     'layer' (закреплённый слой без семантики) или null */
  const kindOf = (el, pos) => {
    try { if (el.matches(strong)) return 'strong'; } catch (e) { /* селектор */ }
    try { if (el.matches(':modal')) return 'strong'; } catch (e) { /* нет :modal */ }
    if (el.matches('[role="dialog"], [role="alertdialog"]')) return 'role';
    if (pos === 'fixed' && [...el.classList].some((c) => POPUP.test(c))) return 'class';
    return pos === 'fixed' ? 'layer' : null;
  };
  const whyHidden = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { if (getComputedStyle(e).display === 'none') return e === el ? 'display:none' : `display:none у предка ${sig(e)}`; }
    const s = getComputedStyle(el); if (s.visibility !== 'visible') return `visibility:${s.visibility}`;
    const r = el.getBoundingClientRect(); if (!(r.width > 1 && r.height > 1)) return `размер ${Math.round(r.width)}×${Math.round(r.height)}`;
    return eff(el) <= 0.05 ? 'прозрачный' : 'за краем экрана';
  };
  /* текст страницы — только если понадобился (innerText всей страницы на длинной /menu — лишние сотни мс) */
  let pageTextLen = null; const pageText = () => (pageTextLen === null ? (pageTextLen = text(document.body).length) : pageTextLen);
  /* прокрутка страницы заперта: overflow hidden/clip у html или body (или body fixed), а содержимое выше окна. Не заперта:
       страница в закреплённом контейнере (html, body {overflow:hidden}, всё в .page {position:fixed; overflow:auto}) — у
         документа нечего прокручивать;
       страницу прокручивает сам body (html {overflow:hidden}, body {height:100%; overflow-y:auto} — приём против «резинки»
         и для scroll-snap): overflow у html не visible (overflow body не переходит окну), и body со своей прокруткой
         листается (30.09: ложный WARN на закреплённом первом экране и вредный совет нажать «Забронировать стол») */
  let lockMemo; const locked = () => {
    if (lockMemo !== undefined) return lockMemo;
    const de = document.documentElement, b = document.body; const hs = getComputedStyle(de), bs = getComputedStyle(b);
    const hid = (s) => /hidden|clip/.test(s.overflowY);
    lockMemo = (hid(hs) || hid(bs) || bs.position === 'fixed') && Math.max(de.scrollHeight, b.scrollHeight) > vh + 50;
    if (lockMemo && bs.position !== 'fixed' && hs.overflowY !== 'visible' && /auto|scroll/.test(bs.overflowY) && b.scrollHeight > b.clientHeight + 1) lockMemo = false;
    return lockMemo;
  };
  const alphaOf = (c) => { const m = String(c || '').match(/rgba?\(([^)]*)\)/i); if (!m) return /transparent/i.test(String(c)) ? 0 : 1; const p = m[1].split(/[\s,/]+/).filter(Boolean); return p.length >= 4 ? (/%$/.test(p[3]) ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1; };
  /* полупрозрачная подложка: сам слой или потомок (до двух уровней) на весь экран с фоном альфой 0,05…0,95 (или
     backdrop-filter); картинка или непрозрачный фон на весь экран — это закреплённый первый экран, не подложка */
  const dimmer = (box) => {
    const full = [box, ...box.children, ...[...box.children].flatMap((c) => [...c.children])].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= vw * 0.9 && r.height >= vh * 0.9; }).slice(0, 16);
    let dim = false;
    for (const e of full) {
      const s = getComputedStyle(e); if (s.backgroundImage && s.backgroundImage !== 'none') return false;
      const a = alphaOf(s.backgroundColor) * (parseFloat(s.opacity) || 0);
      if (a >= 0.95) return false;
      if (a > 0.05 || (s.backdropFilter && s.backdropFilter !== 'none')) dim = true;
    }
    return dim;
  };
  /* под слоем — содержимое страницы в потоке: в пяти точках слоя elementsFromPoint ниже него есть элемент не из слоя, не
     html/body, не предок слоя и не закреплённый (фон и видео под закреплённым первым экраном — не содержимое) */
  const inFixed = (e) => { for (let x = e; x && x !== document.body && x !== document.documentElement; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const overPage = (box) => {
    const r = box.getBoundingClientRect(); const L = Math.max(r.left, 0), T = Math.max(r.top, 0), W = Math.min(r.right, vw) - L, H = Math.min(r.bottom, vh) - T;
    for (const [fx, fy] of [[0.5, 0.5], [0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
      const list = document.elementsFromPoint(L + W * fx, T + H * fy);
      const i = list.findIndex((e) => e === box || box.contains(e)); if (i < 0) continue;
      if (list.slice(i + 1).some((e) => e !== document.body && e !== document.documentElement && !box.contains(e) && !e.contains(box) && !inFixed(e))) return true;
    }
    return false;
  };
  /* оболочка сайта: в слое почти весь текст страницы, снаружи — меньше 200 знаков */
  const shell = (box) => { const t = text(box).length; const all = pageText(); return t > 0 && t >= all * 0.8 && all - t < 200; };
  const cands = [];
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|HEADER|NAV|MAIN|FOOTER|svg)$/i.test(el.tagName)) continue;
    const pos = getComputedStyle(el).position;
    const kind = kindOf(el, pos); if (!kind) continue;
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect(); const share = shareOf(r);
    if ((kind === 'role' || kind === 'class') && share < 0.05) continue;
    if (kind === 'layer' && share < 0.9) continue;
    cands.push({ el, kind, st: kind !== 'layer', share });
  }
  /* сначала отбор, потом самые внешние из прошедших: оболочка сайта не прячет окно внутри себя */
  const pass = [];
  for (const c of cands) {
    const { el: box, kind } = c;
    if (box.closest('[data-rw-consent-box]') || box.querySelector('[data-rw-consent-box]')) continue;
    const t = text(box);
    if (COOKIE.test(t) || t.length > 2000) continue;
    if ((kind === 'layer' || kind === 'class') && shell(box)) continue;
    /* сверху: в центре его видимой части — он сам (или его потомок) */
    const r = box.getBoundingClientRect();
    const pts = [[(Math.max(r.left, 0) + Math.min(r.right, vw)) / 2, (Math.max(r.top, 0) + Math.min(r.bottom, vh)) / 2]];
    if (!pts.some(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e === box || box.contains(e)); })) continue;
    /* нажать внутри есть что: кнопка, ссылка, пункт списка, крестик */
    if (![...box.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a[href], li, label, [onclick], [class*="close" i]')].some((e) => shown(e) && !e.disabled)) continue;
    if (kind === 'layer') { const lk = locked(); const dim = !lk && dimmer(box) && overPage(box); if (!lk && !dim) continue; c.layerWhy = lk ? 'прокрутка страницы заперта' : 'полупрозрачная подложка поверх страницы'; }
    c.t = t; pass.push(c);
  }
  const outer = pass.filter((c) => !pass.some((o) => o !== c && o.el.contains(c.el)));
  for (const { el: box, st, share, kind, layerWhy, t } of outer) {
    /* варианты: видимые нажимаемые внутри */
    const CLICK = 'button, [role="button"], input[type="button"], input[type="submit"], a[href], li, label, [onclick]';
    const clicks = [...box.querySelectorAll(CLICK)].filter((e) => shown(e) && !e.disabled);
    const closeAll = [...new Set([...box.querySelectorAll('[class*="close" i], [data-dismiss], [data-bs-dismiss], [data-fancybox-close], [data-close], [aria-label*="закры" i], [aria-label*="close" i], [title*="закры" i], [title*="close" i]'),
      ...[...box.querySelectorAll('button, [role="button"], a')].filter((b) => CLOSE_RE.test(label(b)))].map((e) => e.closest('button, [role="button"], a, [data-fancybox-close], [data-dismiss], [data-close]') || e).filter((e) => box.contains(e) && e !== box))];
    if (!clicks.length && !closeAll.some(shown)) continue;
    /* селектор: «окно пункт», части — id (не похожий на сгенерированный), иначе первый постоянный класс (у крестика — с close) */
    const STATE = /^(is-|has-|js-)|active|opened|open$|show|shown|visible|current|selected|hidden|fancybox-is-|fancybox-can-/i;
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    const part = (e, bare, prefer) => {
      /* id со счётчиком (fancybox-container-1) или хешем — сгенерирован, класс надёжнее */
      if (e.id && !/\d{4,}|[-_]\d+$|^[a-f0-9-]{16,}$/i.test(e.id)) return '#' + esc(e.id);
      const cls = [...e.classList].filter((c) => !STATE.test(c) && c.length < 48);
      const c = (prefer && cls.find((x) => prefer.test(x))) || cls[0];
      const tag = e.tagName.toLowerCase();
      if (c) return (bare ? '' : tag) + '.' + esc(c);
      for (const a of ['data-fancybox-close', 'data-dismiss', 'data-bs-dismiss', 'data-close']) if (e.hasAttribute(a)) return `${tag}[${a}]`;
      if (e.getAttribute('role')) return `${tag}[role="${e.getAttribute('role')}"]`;
      if (tag === 'dialog') return 'dialog[open]';
      if (e.getAttribute('aria-modal') === 'true') return '[aria-modal="true"]';
      return tag;
    };
    const selFor = (e, prefer) => {
      const s = `${part(box, true)} ${part(e, false, prefer)}`;
      try { if ([...document.querySelectorAll(s)].includes(e)) return s; } catch (x) { /* селектор не собрался */ }
      const l = label(e); return l && l.length <= 40 ? `text:${l}` : null;
    };
    const closeVis = closeAll.find(shown); const closeHid = closeVis ? null : closeAll[0];
    const close = closeVis ? { sel: selFor(closeVis, /close/i), sig: sig(closeVis), visible: true } : closeHid ? { sel: selFor(closeHid, /close/i), sig: sig(closeHid), visible: false, why: whyHidden(closeHid) } : null;
    const here = location.href.split('#')[0];
    const rank = (e) => {
      if (e.matches('button, [role="button"], input')) return 1;
      if (e.tagName === 'LI' || e.tagName === 'LABEL') return e.querySelector('a[href], button, input') ? 2 : 5;
      if (e.tagName === 'A') { const h = e.getAttribute('href') || ''; if (/^(#|javascript:)/i.test(h)) return 3; return e.href.split('#')[0] === here ? 4 : 9; }
      return 6;
    };
    const opts = clicks.filter((e) => !closeAll.includes(e) && !closeAll.some((c) => c.contains(e)) && label(e) && label(e).length <= 60)
      .map((e, i) => ({ e, i, k: rank(e) })).sort((a, b) => a.k - b.k || a.i - b.i);
    const o = opts[0];
    const option = o ? { sel: selFor(o.e), sig: sig(o.e), label: label(o.e).slice(0, 40), ...(o.e.tagName === 'A' ? { href: o.e.href } : {}), leaves: o.k === 9 } : null;
    const how = box.matches('.fancybox-container, .fancybox-is-open') ? 'fancybox' : box.matches('dialog') ? 'dialog' : box.getAttribute('aria-modal') === 'true' ? 'aria-modal' : box.matches('[role="dialog"], [role="alertdialog"]') ? 'role=dialog' : kind === 'class' ? 'окно по классу' : st ? 'модальное окно' : `подложка на весь экран — ${layerWhy}`;
    return { sig: sig(box), how, share: Math.round(share * 100), text: t.slice(0, 80), close, option, suggest: (close && close.visible && close.sel) || (option && option.sel) || null };
  }
  return null;
}
/** Открытое окно на странице (см. openModalInPage) и WARN о нём: «на странице открыто окно …, задайте
    SITE_REWORK_DISMISS="…"». warn: false — только найти. → объект окна (и page.rwModal) или null. */
export async function checkOpenModal(page, { warn = true } = {}) {
  const m = await withDeadline(evaluateWith(page, openModalInPage, { strong: MODAL_STRONG }, CONSENT_DEPS), 10000, 'поиск открытого окна').catch(() => null);
  page.rwModal = m || null;
  if (m && warn) libWarn(modalNote(m, page), 'окно');
  return m;
}
/** Открытое окно строкой: для WARN и сводок. page — чтобы сказать, что SITE_REWORK_DISMISS его не закрыл. */
export function modalNote(m, page = null) {
  if (!m) return 'нет';
  const tried = page && page.rwDismiss && page.rwDismiss.list && page.rwDismiss.list.length ? ` SITE_REWORK_DISMISS его не закрыл (${page.rwDismiss.list.map((d) => `«${d.spec}» — ${d.found ? (d.gone ? 'нажато' : 'нажато, осталось') : d.status}`).join('; ')});` : '';
  const alt = m.close && !m.close.visible ? ` (крестик ${m.close.sel || m.close.sig} скрыт: ${m.close.why}${m.option ? ' — нажимать вариант выбора' : ''})` : m.option && m.suggest !== m.option.sel ? ` (или вариант выбора "${m.option.sel}" «${m.option.label}»)` : '';
  const opt = m.option && m.suggest === m.option.sel ? ` — вариант «${m.option.label}»${m.option.leaves ? `, ссылка на ${m.option.href}: уведёт со страницы` : ''}` : '';
  return `на странице открыто окно ${m.sig}${m.text ? ` «${m.text.slice(0, 50)}»` : ''} (${m.how}, ${m.share}% экрана) — снимки и замеры идут под ним;${tried} задайте ${m.suggest ? `SITE_REWORK_DISMISS="${m.suggest}"${opt}${alt}` : 'SITE_REWORK_DISMISS — селектор кнопки, которая его закрывает (своей не нашлось)'}`;
}

/* Найти и закрыть окно согласия: основной документ, потом фреймы CMP. click: false — только найти и
   пометить (--keep-consent). → { found, closed, kind ('cookie' | 'ворота' | 'dismiss'), box, place, w, h,
   share, buttons, pick, pickKind, frame, why, waitedMs, dismiss? } или { found: false, dismiss? }.
   Сначала SITE_REWORK_DISMISS (и при --keep-consent: переменную задали явно; applyDismiss — если его уже
   нажал openPage/waitForOverlay в этом документе, не жмёт снова), потом окно согласия — оно могло появиться
   только после ворот. dismiss — что нажато по переменной; окна согласия не было, а по переменной нажато —
   found: true, kind 'dismiss' (попадает в отчёт там же, где окно согласия). */
const CONSENT_FRAME = /consent|cookie|cmp|privacy|sourcepoint|quantcast|onetrust|didomi|trustarc|usercentrics|cookiebot|iubenda/i;
export async function closeConsent(page, { click = true } = {}) {
  const dismiss = await applyDismiss(page).catch((e) => [{ spec: process.env.SITE_REWORK_DISMISS, found: false, status: 'ошибка', why: String(e.message || e).slice(0, 100) }]);
  const res = await closeConsentAuto(page, { click });
  if (!dismiss.length) return res;
  if (res.found) return { ...res, dismiss };
  const hit = dismiss.find((d) => d.found);
  if (!hit) return { ...res, dismiss };
  return { found: true, closed: hit.gone, kind: 'dismiss', box: hit.sig, pick: hit.label || hit.spec, pickKind: 'SITE_REWORK_DISMISS', dismiss, why: hit.gone ? null : `нажали «${hit.label || hit.spec}», осталось на экране` };
}
async function closeConsentAuto(page, { click = true } = {}) {
  const main = page.mainFrame();
  const frames = [main, ...page.frames().filter((f) => f !== main && CONSENT_FRAME.test(f.url()))];
  for (const fr of frames) {
    const f = await withDeadline(evaluateWith(fr, consentInPage, null, CONSENT_DEPS), 10000, 'поиск окна согласия').catch(() => null);
    if (!f) continue;
    let frame = null; if (fr !== main) { try { frame = new URL(fr.url()).hostname; } catch { frame = 'фрейм'; } }
    const res = { found: true, closed: false, ...f, frame };
    if (!click) return { ...res, why: 'не закрывалось (--keep-consent)' };
    if (!f.pick) return { ...res, why: 'в окне нет кнопки «принять», «отклонить» или «закрыть»' };
    const t0 = Date.now();
    await fr.evaluate(() => { const b = window.__rwConsentBtn; if (b && b.isConnected) b.click(); }).catch(() => {});
    let gone = await consentGone(fr, 2500);
    if (!gone && fr === main) { /* настоящий клик мышью: часть окон не слушает click() из скрипта */
      const pt = await fr.evaluate(() => { const b = window.__rwConsentBtn; if (!b || !b.isConnected) return null; const r = b.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }).catch(() => null);
      if (pt) { await page.mouse.click(pt.x, pt.y).catch(() => {}); gone = await consentGone(fr, 2500); }
    }
    await page.mouse.move(1, 1).catch(() => {}); await sleep(300);
    return { ...res, closed: gone, waitedMs: Date.now() - t0, why: gone ? null : `нажали «${f.pick}», окно осталось на экране` };
  }
  return { found: false };
}
export function consentNote(c) {
  const dn = c && c.dismiss && c.dismiss.length ? `SITE_REWORK_DISMISS: ${c.dismiss.map(dismissLine).join('; ')}` : '';
  const tail = dn ? ` · ${dn}` : '';
  if (!c || !c.found) return (c && c.error ? `проверка не прошла: ${c.error}` : 'не появлялось') + tail;
  if (c.kind === 'dismiss') return `${dn}${c.late ? ' — после прокрутки' : ''}`;
  const where = `${c.kind === 'ворота' ? 'ворота-заставка, ' : ''}${c.box}, ${c.place}, ${c.w}×${c.h}${c.frame ? `, во фрейме ${c.frame}` : ''}`;
  if (c.closed) return `закрыто кнопкой «${c.pick}» (${where})${c.late ? ' — появилось позже, после прокрутки: на снимках прокрутки оно есть, замеры сняты без него' : ''}${tail}`;
  return `**не закрыто** — ${c.why || 'причина неизвестна'} (${where}${c.buttons && c.buttons.length ? `; кнопки в окне: ${c.buttons.map((b) => `«${b}»`).join(', ')}` : ''}) — закрывает ${c.share}% экрана на снимках${tail}`;
}
