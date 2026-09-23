#!/usr/bin/env node
/**
 * Снимки для сравнения «до» и «после»: одинаковые экраны, одинаковые условия.
 *
 *   node shots.mjs <url> [--out папка] [--tag before|after] [--viewports desktop,tablet,mobile]
 *                  [--with-320] [--pages /,/about,/contacts] [--no-freeze] [--scheme dark]
 *                  [--segments 8] [--shot-pause 1200] [--full-mode segments|auto] [--sheet]
 *                  [--return both|jump|up] [--strict]
 *
 * Флаги:
 *   --tag         подпапка снимков (before | after | любое имя), по умолчанию before.
 *   --viewports   экраны через запятую: пресеты desktop, laptop, tablet, mobile, mobile-s (320×568@2),
 *                 android (360×800@3), запись ШxВ@плотность («320x568@2») или одна ширина («320»).
 *                 По умолчанию desktop,tablet,mobile. --viewport — то же (как в a11y.mjs и perf.mjs).
 *   --with-320   добавить к выбранным экранам mobile-s (320 px): на нём вылезают закреплённые панели
 *                 и длинные подписи.
 *   --pages       страницы через запятую относительно адреса.
 *   --no-freeze   не останавливать движение (если нужно поймать именно фазу анимации).
 *   --scheme      light | dark — prefers-color-scheme.
 *   --segments N  сколько снимков окна по всей высоте (равномерно, последний — низ страницы);
 *                 0 — не снимать. По умолчанию 8.
 *   --shot-pause  пауза перед каждым снимком окна, мс (по умолчанию 1200: ленивое и появления успевают).
 *   --full-mode   (или --full) как снимать всю страницу:
 *                 segments (по умолчанию) — склейка из снимков окна: закреплённые слои (зерно, шапка,
 *                   нижняя панель) видны в каждом экране, как их видит человек при прокрутке;
 *                 auto — как раньше: одним снимком (длинная страница — ×1), закреплённое только сверху.
 *   --sheet       ещё и лист миниатюр снимков окна (<страница>-<экран>-scroll-sheet.png).
 *   --return      как возвращаться наверх перед сравнением первого экрана:
 *                 jump — пролистать до низа и сразу наверх (клавиша Home, нажатие на логотип);
 *                 up   — пролистать до низа и обратно вверх по шагам (как листает человек);
 *                 both — оба пути (по умолчанию).
 *   --strict      код выхода 1, если есть FAIL (состояние не сбрасывается или сбой съёмки).
 *   --out         папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>); снимки — в <out>/<tag>/.
 *   --help        эта справка.
 * Код выхода: 0 — съёмка сделана (вердикт в выводе и в shots.json, поле verdict); 1 — нет адреса или
 * неверное значение флага, а с --strict — ещё и при любом FAIL.
 *
 * Что снимается на каждой странице и каждом экране (<папка>/<tag>/):
 *   <страница>-<экран>-first.png         первый экран СРАЗУ после загрузки, до всякой прокрутки;
 *   <страница>-<экран>-scroll-NN.png     снимки окна равномерно по всей высоте (закреплённые слои видны);
 *   <страница>-<экран>-first-return.png  первый экран после прохода до низа и прыжка наверх;
 *   <страница>-<экран>-first-up.png      первый экран после прохода до низа и листания обратно вверх;
 *   <страница>-<экран>-full.png          вся страница (способ — в shots.json, поле fullMode);
 *   <страница>-<экран>-stale*.png        (если есть расхождение) вырезка «при загрузке | после возврата».
 * Имена одинаковые для before и after, чтобы diff.mjs сложил их в пары. В shots.json:
 *   verdict (OK | WARN | FAIL, с учётом сравнения first и first-return/first-up), fails, warns;
 *   files[имя] = { scale, cssWidth, dpr, viewport, fullMode?, y?, kind? } для каждого файла, включая
 *     вырезки и лист: scale — пикселей снимка на CSS-пиксель (по нему diff.mjs приводит ×2 и ×1),
 *     cssWidth и viewport — какой экран (state.mjs не принимает снимок desktop доказательством для mobile);
 *   note — оговорка про закреплённые слои на снимке всей страницы (FULLPAGE_NOTE);
 *   shots[] — по странице и экрану: файлы, прокрутка, stale / staleUp (вердикт и области).
 *
 * Проверка «состояние не сбрасывается»: first сравнивается с first-return и first-up попиксельно.
 * Проход до низа идёт шагами по 0,2 экрана с паузой 40 мс, чтобы наблюдатели пересечений (активный
 * пункт меню, появления) увидели каждый раздел, как при настоящем листании; иначе итог зависит от
 * того, на какие высоты попали шаги. Что меняется само (холст, видео, бегущая строка) — отсекается
 * вторым снимком при загрузке через 700 мс; холст, видео или iframe, в котором за эти 700 мс
 * изменился хоть один пиксель, по пикселям отсекается целиком по своему положению. Но под такой
 * маской (живой фон на весь экран, WebGL-герой) пиксели слепы, поэтому там сверяется состояние
 * элементов, а не пиксели: у каждого элемента первого экрана поверх живого места (кроме самих
 * холстов, видео и iframe и того, что ими закрыто) сравниваются цвет, фон, рамка, сдвиг,
 * подчёркивание, картинка, прозрачность; изменилось и элемент не живой — FAIL, как и по пикселям;
 * только проявилось (прозрачность 0 → 1, текст первого экрана виден лишь после прокрутки) — WARN
 * с вырезкой по коробкам; если проявление включил класс у предка (.hero.in), предок назван у потомка.
 * Сравнение числами, с допуском на невидимое: сдвиг — угол коробки ушёл на 1 CSS px и больше
 * (остаток плавного параллакса в сотые пикселя — не отличие), цвет — канал на 4 из 255 или альфа
 * на 0,04, прозрачность — на 0,1.
 * Карусели и прочее, что меняет DOM само, — наблюдением за изменениями на месте до 8 с (до второй
 * смены; только если расхождение нашлось); живым считается и элемент, у которого менялся предок
 * или сосед того же вида (слайд, который за наблюдение не сменился). Карусель, которая и за 8 с не
 * сменилась, узнаётся по «переключению между соседями»: у одного соседа класс снят, у другого тот
 * же поставлен, и это не ссылки и не меню (там это и есть залипшая подсветка) — WARN, не FAIL.
 * Остальное — области, в которых перечисляются элементы и что у них изменилось (класс, цвет, прозрачность):
 *   FAIL «состояние не сбрасывается» — изменились класс, цвет, фон, рамка или появился новый элемент
 *        (подсвеченный пункт меню, раскрытая шапка, всплывшее сообщение);
 *   WARN — только проявление (прозрачность 0 → 1), только холст и видео, только то, что меняется
 *        само (карусель), или причина по стилям не видна (смотреть вырезку).
 *
 * Движение (без --no-freeze): перед снимком при загрузке конечные анимации доигрываются, бесконечные
 * ставятся в фазу 0; перед прокруткой — freezeMotion (переходы отключаются). Иначе два снимка одной
 * страницы различались бы фазой анимации. Прокрутка всегда мгновенная (forceInstantScroll): при
 * html{scroll-behavior:smooth} снимок иначе делался бы посреди пути.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  launch, openPage, scrollThrough, scrollToY, screenSegment, forceInstantScroll, freezeMotion, fullPageShot,
  waitForMedia, settleAnimations, pickViewports, parseArgs, runDir, writeJson, ensureDir, pageSlug, pagesFrom,
  sleep, loadSharp, evaluateWith, SIG_FN, EFFECTIVE_OPACITY_FN, FULLPAGE_NOTE,
} from './lib.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['with-320', 'no-freeze', 'sheet', 'strict', 'help'] });
if (opt.help) { console.log(HELP); process.exit(0); }
if (!pos[0]) { console.error('Нужен адрес: node shots.mjs <url> [--tag before|after] [--pages /,/about] [--viewports ...] [--with-320]  (подробно: --help)'); process.exit(1); }
const base = new URL(pos[0]);
const run = runDir(opt, pos[0]);
const tag = opt.tag || 'before';
const outDir = ensureDir(path.join(run, tag));
const pages = opt.pages ? pagesFrom(opt.pages, base) : [base.href];
const viewports = pickViewports(opt.viewports || opt.viewport);
if (opt['with-320'] && !viewports.some(([, vp]) => vp.width === 320)) viewports.push(...pickViewports('mobile-s'));
const segments = opt.segments === undefined ? 8 : Math.max(0, Math.floor(Number(opt.segments) || 0));
const shotPause = opt['shot-pause'] === undefined ? 1200 : Math.max(0, Number(opt['shot-pause']) || 0);
const fullOpt = String(opt['full-mode'] || opt.full || 'segments');
if (!/^(segments|auto)$/.test(fullOpt)) { console.error('--full-mode: segments или auto'); process.exit(1); }
const fullMode = fullOpt;
const returnOpt = String(opt.return || 'both');
if (!/^(both|jump|up)$/.test(returnOpt)) { console.error('--return: both, jump или up'); process.exit(1); }
const freeze = !opt['no-freeze'];
const sharp = loadSharp();
/* наблюдение за тем, что меняется само: до 8 с (карусель Bootstrap — 5 с), раньше — после второй смены */
const WATCH_MS = 8000;

/* конечные анимации и переходы — в конец, бесконечные — в фазу 0 (как freezeMotion, но без
   отключения переходов: при загрузке страница ещё должна жить своей жизнью) */
const still = (page) => page.evaluate(() => {
  for (const a of document.getAnimations()) {
    try { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; if (t.iterations === Infinity) { a.pause(); a.currentTime = 0; } else if (a.playState !== 'finished') a.finish(); } catch { /* без конца или привязана к прокрутке */ }
  }
}).catch(() => {});

const heightOf = (page) => page.evaluate(() => { const sc = window.__rwScroller; return sc && sc.isConnected ? sc.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0); });

/* листание, как у человека: шаг 0,2 экрана, 40 мс между шагами — наблюдатели пересечений успевают
   сработать на каждом разделе (при шаге в экран полоса наблюдения перескакивает короткие разделы) */
async function sweep(page, from, to) {
  const vh = (page.viewport() || {}).height || 800; const step = Math.max(40, Math.round(vh * 0.2));
  const dir = to >= from ? 1 : -1; let n = 0;
  for (let y = from; dir > 0 ? y < to : y > to; y += dir * step) { await scrollToY(page, y); await sleep(40); if (++n > 600) break; }
  await scrollToY(page, to); await sleep(300);
}

/* состояние элементов первого экрана: по нему потом говорим, ЧТО изменилось в области */
function rememberFirstInPage() {
  const vw = innerWidth, vh = innerHeight; const m = new Map();
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    const s = getComputedStyle(el);
    m.set(el, { cls: el.getAttribute('class') || '', o: eff(el), color: s.color, bg: s.backgroundColor, bdc: [s.borderTopColor, s.borderBottomColor, s.outlineColor], os: s.outlineStyle, tr: s.transform, td: s.textDecorationLine, aria: ['aria-current', 'aria-expanded', 'aria-selected', 'aria-pressed', 'open'].map((a) => el.getAttribute(a) || '').join('|'), src: el.currentSrc || el.getAttribute('src') || '' });
    if (m.size >= 5000) break;
  }
  window.__rwFirst = m;
  /* классы body и html — чтобы назвать причину, если проявление или подсветку включил класс на них */
  window.__rwFirstRoot = { body: document.body ? document.body.getAttribute('class') || '' : '', html: document.documentElement.getAttribute('class') || '' };
  /* холсты, видео, iframe в первом экране: если за 700 мс они изменились сами — по пикселям маскируются
     целиком, а поверх них сверяется состояние элементов (maskedChangesInPage) */
  const media = [];
  for (const el of document.querySelectorAll('canvas, video, iframe')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    media.push({ x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(vw, r.right) - Math.max(0, r.left), h: Math.min(vh, r.bottom) - Math.max(0, r.top), sig: sig(el) });
  }
  return { count: m.size, media };
}

/* что меняет DOM само, пока страница стоит на месте (карусель, часы, бегущий текст): метка __rwLive.
   Наблюдение до ms, но заканчивается раньше — через 300 мс после второй смены (две пачки изменений
   с промежутком больше 0,5 с): у карусели с интервалом 5 с за 3 с смена часто не успевала */
function watchLiveInPage(ms) {
  return new Promise((resolve) => {
    let n = 0, bursts = 0, last = 0, timer = null;
    const t0 = performance.now();
    /* классы, которые переключались сами (active, on…): для сравнения соседей «того же вида» они не в счёт */
    const toggled = window.__rwToggled || (window.__rwToggled = new Set());
    const mark = (el) => { if (el && el.nodeType === 1 && !el.__rwLive) { el.__rwLive = true; n++; } };
    const finish = () => { mo.disconnect(); clearTimeout(timer); resolve({ marked: n, bursts, ms: Math.round(performance.now() - t0), toggled: [...toggled].slice(0, 12) }); };
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'attributes') {
          mark(m.target);
          if (m.attributeName === 'class') { const A = new Set(String(m.oldValue || '').split(/\s+/).filter(Boolean)), B = new Set(String(m.target.getAttribute('class') || '').split(/\s+/).filter(Boolean)); for (const c of A) if (!B.has(c)) toggled.add(c); for (const c of B) if (!A.has(c)) toggled.add(c); }
        } else if (m.type === 'characterData') mark(m.target.parentElement); else { mark(m.target); for (const x of m.addedNodes) mark(x); }
      }
      const now = performance.now(); if (now - last > 500) bursts++; last = now;
      if (bursts >= 2) { clearTimeout(timer); timer = setTimeout(finish, 300); }
    });
    mo.observe(document.documentElement, { attributes: true, attributeOldValue: true, childList: true, characterData: true, subtree: true });
    timer = setTimeout(finish, ms);
  });
}

/* что изменилось у элемента с момента первого снимка: общая часть explainInPage и maskedChangesInPage.
   Возвращает { d: [отличия], visual: есть ли видимое отличие (не только класс или атрибуты), o, removed, added }.
   Сравнение числами, с допуском на то, чего глазом не видно: цвет — канал на 4 из 255 (с учётом альфы)
   или альфа на 0,04; сдвиг — угол коробки ушёл на 1 CSS px и больше (остаток плавного параллакса,
   translateY(0.049px), — не отличие); прозрачность — на 0,1 */
function stateDiffInPage() {
  const short = (c) => String(c).replace(/rgba?\(([^)]+)\)/g, (m0, v) => { const p = v.split(/[,\s/]+/).filter(Boolean).map(Number); return '#' + p.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase() + (p.length > 3 && p[3] < 1 ? `/${p[3]}` : ''); });
  const rgba = (c) => { const m = /^rgba?\(([^)]+)\)$/.exec(String(c).trim()); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); if (p.length < 3 || p.some((x) => !Number.isFinite(x))) return null; return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  /* цвет, который не разобрать (oklch, color()), сравнивается строкой */
  const colorDiff = (x, y) => { if (x === y) return false; const A = rgba(x), B = rgba(y); if (!A || !B) return true; if (A[3] < 0.02 && B[3] < 0.02) return false; return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2])) * Math.max(A[3], B[3]) >= 4 || Math.abs(A[3] - B[3]) >= 0.04; };
  const mat = (t) => { if (!t || t === 'none') return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; const m = /^matrix(3d)?\(([^)]+)\)$/.exec(String(t).trim()); if (!m) return null; const v = m[2].split(',').map(Number); if (v.some((x) => !Number.isFinite(x))) return null; if (m[1]) return v.length === 16 ? v : null; if (v.length !== 6) return null; return [v[0], v[1], 0, 0, v[2], v[3], 0, 0, 0, 0, 1, 0, v[4], v[5], 0, 1]; };
  /* на сколько CSS px ушёл самый дальний угол коробки от смены матрицы (вокруг transform-origin);
     сдвиг по z тоже в счёт (под перспективой предка он виден); неразобранная матрица — Infinity */
  const shift = (el, s, t0, t1) => {
    if (t0 === t1) return 0; const A = mat(t0), B = mat(t1); if (!A || !B) return Infinity;
    const r = el.getBoundingClientRect(); const w = el.offsetWidth ?? r.width, h = el.offsetHeight ?? r.height;
    const og = String(s.transformOrigin || '').split(' ').map(parseFloat); const ox = og[0] || 0, oy = og[1] || 0;
    const P = (m, x, y) => { const W = m[3] * x + m[7] * y + m[15] || 1e-6; return [(m[0] * x + m[4] * y + m[12]) / W, (m[1] * x + m[5] * y + m[13]) / W, m[2] * x + m[6] * y + m[14]]; };
    let max = 0;
    for (const x of [-ox, w - ox]) for (const y of [-oy, h - oy]) { const p = P(A, x, y), q = P(B, x, y); max = Math.max(max, Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2])); }
    return max;
  };
  return (el, a) => {
    const s = getComputedStyle(el); const d = []; let visual = false;
    const cls = el.getAttribute('class') || ''; let added = [], removed = [];
    if (cls !== a.cls) { const A = new Set(a.cls.split(/\s+/).filter(Boolean)), B = new Set(cls.split(/\s+/).filter(Boolean)); added = [...B].filter((c) => !A.has(c)); removed = [...A].filter((c) => !B.has(c)); d.push(`класс ${added.map((c) => '+' + c).concat(removed.map((c) => '−' + c)).join(' ')}`); }
    const o = eff(el);
    if (Math.abs(o - a.o) > 0.1) { d.push(`прозрачность ${a.o}→${o}`); visual = true; }
    if (colorDiff(a.color, s.color)) { d.push(`цвет ${short(a.color)}→${short(s.color)}`); visual = true; }
    if (colorDiff(a.bg, s.backgroundColor)) { d.push(`фон ${short(a.bg)}→${short(s.backgroundColor)}`); visual = true; }
    /* цвет обводки при outline-style: none не виден */
    if (s.outlineStyle !== a.os || colorDiff(a.bdc[0], s.borderTopColor) || colorDiff(a.bdc[1], s.borderBottomColor) || (s.outlineStyle !== 'none' && colorDiff(a.bdc[2], s.outlineColor))) { d.push('рамка или обводка'); visual = true; }
    const sh = shift(el, s, a.tr, s.transform);
    if (sh >= 1) { d.push(Number.isFinite(sh) ? `сдвиг (transform) на ${Math.round(sh)} px` : 'сдвиг (transform)'); visual = true; }
    if (s.textDecorationLine !== a.td) { d.push('подчёркивание'); visual = true; }
    const aria = ['aria-current', 'aria-expanded', 'aria-selected', 'aria-pressed', 'open'].map((x) => el.getAttribute(x) || '').join('|');
    if (aria !== a.aria) d.push(`атрибуты ${a.aria}→${aria}`);
    if ((el.currentSrc || el.getAttribute('src') || '') !== a.src) { d.push('другая картинка'); visual = true; }
    return { d, visual, o, added, removed };
  };
}

/* живое — сам элемент или предок (до 5 уровней) менялся, пока страница стояла на месте (карусель за
   время наблюдения может вернуться к тому же слайду, и отличия по стилям уже не видно), или менялся
   сосед того же вида у элемента или его родителя (слайд 3, пока смена шла между 1 и 2). «Того же вида» —
   тот же тег и общий постоянный класс (slide у div.slide.s1 и div.slide.s3) или у обоих постоянных
   классов нет (точки i и i.on, когда on переключался сам): живые часы div.clock не делают живой
   соседнюю залипшую кнопку div.cta */
function liveTestInPage() {
  const toggled = window.__rwToggled || new Set();
  const fam = (e) => [...e.classList].filter((c) => !toggled.has(c));
  const same = (a, b) => { if (a.tagName !== b.tagName) return false; const fa = fam(a), fb = fam(b); return (!fa.length && !fb.length) || fa.some((c) => fb.includes(c)); };
  const sib = (e) => { const p = e.parentElement; if (!p) return false; for (const s of p.children) if (s !== e && s.__rwLive && same(s, e)) return true; return false; };
  return (el) => { for (let e = el, k = 0; e && k < 5; e = e.parentElement, k++) { if (e.__rwLive) return true; if (k < 2 && sib(e)) return true; } return false; };
}

/* «переключение между соседями»: у одного соседа класс снят, у другого тот же поставлен (карусель,
   которая за наблюдение не сменилась). Ссылки и меню не в счёт: там это и есть залипшая подсветка */
function markSwaps(list) {
  const menu = (el) => el.matches('a[href], button') || !!el.closest('nav, header, [role=navigation], [role=menubar], [role=menu], [role=tablist]');
  for (const x of list) for (const y of list) {
    if (x === y || !x.removed.length || !y.added.length || x.el.parentElement !== y.el.parentElement || x.el.tagName !== y.el.tagName) continue;
    if (!x.removed.some((c) => y.added.includes(c)) || menu(x.el) || menu(y.el)) continue;
    x.swap = y.swap = true;
  }
}

function explainInPage(regions) {
  const first = window.__rwFirst || new Map();
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const isLive = liveTest(); const diffOf = stateDiff();
  return regions.map((R) => {
    const hit = (r) => !(r.right < R.x || r.left > R.x + R.w || r.bottom < R.y || r.top > R.y + R.h);
    const raw = [];
    for (const [el, a] of first) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect(); if (!hit(r)) continue;
      const { d, o, added, removed } = diffOf(el, a);
      if (d.length) raw.push({ el, added, removed, sig: sig(el), text: txt(el), diffs: d, appeared: a.o <= 0.05 && o > 0.5, live: isLive(el) });
    }
    swaps(raw);
    const changed = raw.map(({ el, added, removed, ...c }) => ({ ...c, swap: !!c.swap }));
    /* что лежит сверху в области — для случаев, когда по стилям причину не видно */
    const top = new Set(); const media = []; const newEls = new Set(); let liveHits = 0;
    for (let y = R.y + 2; y < R.y + R.h; y += Math.max(4, R.h / 5)) for (let x = R.x + 2; x < R.x + R.w; x += Math.max(4, R.w / 8)) {
      const el = document.elementFromPoint(x, y); if (!el) continue;
      if (/^(CANVAS|VIDEO|IFRAME)$/.test(el.tagName)) media.push(sig(el));
      const label = `${sig(el)} «${txt(el)}»`;
      const lv = isLive(el); if (lv) liveHits++;
      if (!first.has(el)) { top.add(`${label} (новый)`); if (!lv) newEls.add(label); } else top.add(label);
    }
    /* внешние изменившиеся: потомка с теми же отличиями, что у предка, не повторяем */
    const uniq = []; const seen = new Set();
    for (const c of changed) { const key = c.diffs.join(';') + c.text; if (seen.has(key)) continue; seen.add(key); uniq.push(c); }
    return { changed: uniq.slice(0, 8), changedCount: uniq.length, top: [...top].slice(0, 6), media: [...new Set(media)], newEls: [...newEls], liveHits };
  });
}

/* под маской живого холста, видео или iframe пиксели слепы: сверяем состояние элементов первого экрана,
   которые лежат поверх маски, — кроме самих холстов, видео, iframe и того, что ими закрыто.
   Считается только видимое отличие (цвет, фон, рамка, сдвиг, подчёркивание, картинка, прозрачность):
   смена одного класса без видимого следа (lazyloaded) — не залипание. Но если класс сменился у предка,
   а видимое отличие появилось у потомка (.hero.in → h1 проявился), предок называется у потомка как
   причина. Потомки уже найденного не повторяются: залипшего — никакие, проявившегося — проявившиеся. */
function maskedChangesInPage(rects) {
  const first = window.__rwFirst || new Map(); const root = window.__rwFirstRoot || {};
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const isLive = liveTest(); const diffOf = stateDiff();
  const delta = (was, now) => { const A = new Set(String(was).split(/\s+/).filter(Boolean)), B = new Set(String(now).split(/\s+/).filter(Boolean)); return [...B].filter((c) => !A.has(c)).map((c) => '+' + c).concat([...A].filter((c) => !B.has(c)).map((c) => '−' + c)).join(' '); };
  /* ближайший предок (включая body и html), у которого сменился класс */
  const causeOf = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const was = first.has(p) ? first.get(p).cls : p === document.body ? root.body : p === document.documentElement ? root.html : undefined;
      if (was === undefined) continue; const now = p.getAttribute('class') || '';
      if (now !== was) return `${sig(p)} (класс ${delta(was, now)})`;
    }
    return '';
  };
  const MEDIA = /^(CANVAS|VIDEO|IFRAME)$/;
  const vw = innerWidth, vh = innerHeight;
  const hitAny = (r) => rects.some((R) => !(r.right < R.x || r.left > R.x + R.w || r.bottom < R.y || r.top > R.y + R.h));
  const raw = []; let checked = 0;
  for (const [el, a] of first) {
    if (!el.isConnected || MEDIA.test(el.tagName) || (el.parentElement && el.parentElement.closest('canvas, video, iframe'))) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || !hitAny(r)) continue;
    /* закрыт самим холстом или видео (ролик поверх) — его отличия не видны */
    const cx = Math.min(vw - 1, Math.max(0, (r.left + r.right) / 2)), cy = Math.min(vh - 1, Math.max(0, (r.top + r.bottom) / 2));
    const topEl = document.elementFromPoint(cx, cy); if (topEl && MEDIA.test(topEl.tagName) && !el.contains(topEl)) continue;
    checked++;
    const { d, visual, o, added, removed } = diffOf(el, a);
    if (!d.length || !visual) continue;
    if (a.o <= 0.05 && o <= 0.05) continue;
    const cause = causeOf(el);
    raw.push({ el, added, removed, sig: sig(el), text: txt(el), diffs: cause ? d.concat(`после смены класса у предка ${cause}`) : d, cause, appeared: a.o <= 0.05 && o > 0.5, live: isLive(el), rect: { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), w: Math.round(Math.min(vw, r.right) - Math.max(0, r.left)), h: Math.round(Math.min(vh, r.bottom) - Math.max(0, r.top)) } });
  }
  swaps(raw);
  /* внешние: потомок залипшего не повторяется; потомок проявившегося — если и сам только проявился */
  const out = [];
  for (const c of raw) { if (out.some((p) => p.el.contains(c.el) && (!p.appeared || c.appeared))) continue; out.push(c); }
  return { checked, changed: out.slice(0, 12).map(({ el, added, removed, ...c }) => ({ ...c, swap: !!c.swap })) };
}

/* попиксельное сравнение двух снимков окна: области (в CSS-пикселях), где отличие не объясняется «живыми» местами */
async function staleRegions(bufA, bufB, bufNoise, dpr, mediaRects = []) {
  const a = await sharp(bufA).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bufB).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = bufNoise ? await sharp(bufNoise).removeAlpha().raw().toBuffer({ resolveWithObject: true }) : null;
  const { width: w, height: h } = a.info;
  if (b.info.width !== w || b.info.height !== h) return { error: `размеры снимков разные: ${w}×${h} и ${b.info.width}×${b.info.height}` };
  const d3 = (X, Y, i) => Math.abs(X[i] - Y[i]) + Math.abs(X[i + 1] - Y[i + 1]) + Math.abs(X[i + 2] - Y[i + 2]);
  /* «живое» — то, что меняется само за 700 мс при загрузке; расширяем на клетку в каждую сторону */
  const cell = Math.max(4, Math.round(8 * dpr)); const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
  const live = new Uint8Array(cw * ch); let liveCount = 0; const liveMedia = [], liveMediaRects = [];
  if (n && n.info.width === w && n.info.height === h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; if (d3(a.data, n.data, i) > 60) { liveCount++; live[((y / cell) | 0) * cw + ((x / cell) | 0)] = 1; } }
    /* холст, видео, iframe, в котором за 700 мс хоть что-то изменилось, — живой целиком
       (мячик на холсте за второй снимок пробегает не всю свою дорожку) */
    for (const m of mediaRects) {
      const cx0 = Math.max(0, Math.floor(m.x * dpr / cell)), cy0 = Math.max(0, Math.floor(m.y * dpr / cell));
      const cx1 = Math.min(cw - 1, Math.floor((m.x + m.w) * dpr / cell)), cy1 = Math.min(ch - 1, Math.floor((m.y + m.h) * dpr / cell));
      let any = false; for (let cy = cy0; cy <= cy1 && !any; cy++) for (let cx = cx0; cx <= cx1; cx++) if (live[cy * cw + cx]) { any = true; break; }
      if (!any) continue;
      liveMedia.push(m.sig); liveMediaRects.push({ x: m.x, y: m.y, w: m.w, h: m.h, sig: m.sig });
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) live[cy * cw + cx] = 1;
    }
    const grown = new Uint8Array(live); for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) if (live[cy * cw + cx]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = cy + dy, xx = cx + dx; if (yy >= 0 && yy < ch && xx >= 0 && xx < cw) grown[yy * cw + xx] = 1; }
    live.set(grown);
  }
  const cnt = new Uint32Array(cw * ch); let changed = 0, liveSkipped = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3; if (d3(a.data, b.data, i) <= 60) continue;
    const c = ((y / cell) | 0) * cw + ((x / cell) | 0);
    if (live[c]) { liveSkipped++; continue; }
    changed++; cnt[c]++;
  }
  /* клетки с заметным числом отличий → связные области */
  const on = new Uint8Array(cw * ch); for (let i = 0; i < on.length; i++) on[i] = cnt[i] >= 3 ? 1 : 0;
  const seen = new Uint8Array(cw * ch); const regions = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen[i]) continue;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1, px = 0; const st = [i]; seen[i] = 1;
    while (st.length) {
      const k = st.pop(); const cx = k % cw, cy = (k / cw) | 0; px += cnt[k];
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = cy + dy, xx = cx + dx; if (yy < 0 || yy >= ch || xx < 0 || xx >= cw) continue; const j = yy * cw + xx; if (on[j] && !seen[j]) { seen[j] = 1; st.push(j); } }
    }
    if (px < 20) continue;
    regions.push({ x: Math.round(x0 * cell / dpr), y: Math.round(y0 * cell / dpr), w: Math.round((x1 - x0 + 1) * cell / dpr), h: Math.round((y1 - y0 + 1) * cell / dpr), pixels: px });
  }
  regions.sort((p, q) => q.pixels - p.pixels);
  return { changed, liveSkipped, livePixels: liveCount, liveMedia, liveMediaRects, regions: regions.slice(0, 6), share: Math.round(changed / (w * h) * 10000) / 100 };
}

/* вырезка «при загрузке | после возврата» по общей рамке областей */
async function staleCrop(bufA, bufB, regions, dpr, file) {
  const meta = await sharp(bufA).metadata();
  const x0 = Math.min(...regions.map((r) => r.x)) - 12, y0 = Math.min(...regions.map((r) => r.y)) - 12;
  const x1 = Math.max(...regions.map((r) => r.x + r.w)) + 12, y1 = Math.max(...regions.map((r) => r.y + r.h)) + 12;
  const left = Math.max(0, Math.round(x0 * dpr)), top = Math.max(0, Math.round(y0 * dpr));
  const width = Math.max(1, Math.min(meta.width - left, Math.round((x1 - x0) * dpr))), height = Math.max(1, Math.min(meta.height - top, Math.round((y1 - y0) * dpr)));
  const A = await sharp(bufA).extract({ left, top, width, height }).png().toBuffer();
  const B = await sharp(bufB).extract({ left, top, width, height }).png().toBuffer();
  const gap = 10;
  await sharp({ create: { width: width * 2 + gap, height, channels: 4, background: { r: 230, g: 30, b: 30, alpha: 1 } } }).composite([{ input: A, left: 0, top: 0 }, { input: B, left: width + gap, top: 0 }]).png().toFile(file);
}

/* первый экран после возврата: снимок, сравнение с «при загрузке», объяснение областей */
async function checkReturn(page, ctx, { file, cropFile }) {
  await sleep(Math.min(800, shotPause)); if (freeze) await still(page);
  const seg = await screenSegment(page, 0, { file, pause: 400, settle: 1500 });
  if (seg.scrollY > 2) return { verdict: 'WARN', note: `страница не вернулась наверх (scrollY ${seg.scrollY}) — сравнение недостоверно`, regions: [] };
  if (!sharp) return { verdict: 'WARN', note: 'нет sharp — первый экран не сравнивался', regions: [] };
  const bufRet = fs.readFileSync(file);
  const r = await staleRegions(ctx.bufFirst, bufRet, ctx.bufNoise, ctx.dpr, ctx.media);
  if (r.error) return { verdict: 'WARN', note: r.error, regions: [] };
  const watch = async () => { if (!ctx.watched) { ctx.watched = true; const w = await page.evaluate(watchLiveInPage, WATCH_MS).catch(() => null); ctx.liveCount = w ? w.marked : 0; ctx.watch = w; } };
  /* под маской живого холста или видео — сверка состояния элементов (по пикселям там не видно ничего) */
  let masked = null;
  if (r.liveMediaRects.length) {
    const rects = r.liveMediaRects.map(({ x, y, w, h }) => ({ x, y, w, h }));
    const ask = () => evaluateWith(page, maskedChangesInPage, rects, DEPS).catch(() => ({ checked: 0, changed: [] }));
    let mc = await ask();
    /* и проявившееся — тоже после наблюдения: слайд карусели, который проявился сам, — не ошибка */
    if (mc.changed.some((c) => !c.live)) { await watch(); mc = await ask(); }
    masked = { media: r.liveMedia, checked: mc.checked, changed: mc.changed };
  }
  const maskedStuck = masked ? masked.changed.filter((c) => !c.appeared && !c.live && !c.swap) : [];
  /* проявилось поверх живого места только после прокрутки (при загрузке пусто) — WARN, как по пикселям */
  const maskedAppeared = masked ? masked.changed.filter((c) => c.appeared && !c.live && !c.swap) : [];
  const maskedLive = masked ? masked.changed.filter((c) => c.live || c.swap) : [];
  if (!r.regions.length && !maskedStuck.length && !maskedAppeared.length) return { verdict: 'OK', share: r.share, liveSkipped: r.liveSkipped, liveMedia: r.liveMedia, masked, regions: [] };
  /* расхождение есть: сначала посмотреть на месте (до 8 с, до второй смены), что меняется само, — потом объяснять */
  if (r.regions.length) await watch();
  const empty = { changed: [], top: [], media: [], newEls: [] };
  const why = r.regions.length ? await evaluateWith(page, explainInPage, r.regions.map(({ x, y, w, h }) => ({ x, y, w, h })), DEPS).catch(() => r.regions.map(() => empty)) : [];
  const regions = r.regions.map((g, i) => {
    const e = why[i] || empty;
    const real = e.changed.filter((c) => !c.appeared);
    const stuck = real.filter((c) => !c.live && !c.swap);
    const kind = stuck.length || e.newEls.length ? 'stuck' : real.some((c) => c.live) || e.liveHits ? 'live' : real.length ? 'carousel' : e.changed.length ? 'appeared' : e.media.length ? 'media' : 'unknown';
    return { ...g, kind, changed: e.changed, top: e.top, media: e.media };
  });
  /* залипшее поверх живого места — отдельными областями по коробке элемента */
  for (const c of maskedStuck.slice(0, 6)) regions.push({ ...c.rect, pixels: null, kind: 'stuck', masked: true, changed: [c], top: [], media: masked.media });
  /* проявившееся поверх живого места — одной областью по общей рамке их коробок */
  if (maskedAppeared.length) {
    const A = maskedAppeared.slice(0, 6); const x0 = Math.min(...A.map((c) => c.rect.x)), y0 = Math.min(...A.map((c) => c.rect.y));
    const x1 = Math.max(...A.map((c) => c.rect.x + c.rect.w)), y1 = Math.max(...A.map((c) => c.rect.y + c.rect.h));
    regions.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, pixels: null, kind: 'appeared', masked: true, changed: A, top: [], media: masked.media });
  }
  const out = { verdict: regions.some((g) => g.kind === 'stuck') ? 'FAIL' : 'WARN', share: r.share, liveSkipped: r.liveSkipped, masked, maskedLive: maskedLive.length, regions };
  await staleCrop(ctx.bufFirst, bufRet, regions, ctx.dpr, cropFile).then(() => { out.crop = path.basename(cropFile); }).catch(() => {});
  return out;
}

function printReturn(label, st) {
  if (!st) return;
  const M = st.masked;
  const maskNote = M ? ` (живое место ${M.media.join(', ')} по пикселям не в счёт; поверх него сверено состояние ${M.checked} элементов${st.maskedLive ? `, меняется само ${st.maskedLive}` : ''})` : '';
  if (st.verdict === 'OK') { console.log(`  OK   первый экран после ${label} тот же${M ? maskNote : st.liveSkipped ? ' (живые места — холст, видео — не в счёт)' : ''}`); return; }
  if (st.note) { console.log(`  WARN первый экран после ${label}: ${st.note}`); return; }
  console.log(`  ${st.verdict.padEnd(4)} ${st.verdict === 'FAIL' ? `состояние не сбрасывается (после ${label})` : `первый экран после ${label} отличается`}: ${st.share}% пикселей${st.crop ? `, вырезка ${st.crop}` : ''}${maskNote}`);
  for (const g of st.regions) {
    const what = g.kind === 'stuck' ? (g.masked ? `залипло поверх живого места (${g.media.join(', ')}): по пикселям не видно, по стилям — да` : 'залипло') : g.kind === 'live' ? 'меняется само (карусель, часы) — не залипание' : g.kind === 'carousel' ? 'переключение между соседями (карусель, за наблюдение не сменилась) — не залипание, проверить вырезку' : g.kind === 'appeared' ? `проявилось только после прокрутки (при загрузке пусто)${g.masked ? `, поверх живого места (${g.media.join(', ')}) — по стилям` : ''}` : g.kind === 'media' ? `холст или видео (${g.media.join(', ')})` : 'причина по стилям не видна — смотреть вырезку';
    const list = g.changed.length ? g.changed.slice(0, 4).map((c) => `${c.sig}${c.text ? ` «${c.text}»` : ''}: ${c.diffs.join(', ')}`).join(' | ') : g.top.slice(0, 3).join(' | ');
    console.log(`       x${g.x} y${g.y} ${g.w}×${g.h}: ${what} — ${list}`);
  }
}

/* функции страницы видят их как свободные переменные (evaluateWith) */
const DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN, liveTest: liveTestInPage.toString(), stateDiff: stateDiffInPage.toString(), swaps: markSwaps.toString() };

const browser = await launch();
const index = []; const files = {}; let fails = 0, warns = 0; const fullHow = new Set();
const scaleOf = async (file, cssWidth) => { if (!sharp) return null; try { const m = await sharp(file).metadata(); return Math.round(m.width / cssWidth * 1000) / 1000; } catch { return null; } };
try {
  for (const url of pages) {
    const slug = pageSlug(url);
    for (const [name, vp] of viewports) {
      process.stdout.write(`· ${slug} ${name} … `);
      const dpr = vp.deviceScaleFactor || 1; const stem = `${slug}-${name}`;
      let page = null;
      try {
        page = await openPage(browser, url, vp, { scheme: opt.scheme || 'light' });
        await forceInstantScroll(page);
        await waitForMedia(page, { timeout: 6000 });
        /* 1. первый экран как его видит человек при загрузке — до прокрутки */
        if (freeze) { await settleAnimations(page, 2500); await still(page); await sleep(150); }
        const first = path.join(outDir, `${stem}-first.png`);
        const bufFirst = await page.screenshot({ path: first });
        const firstInfo = await evaluateWith(page, rememberFirstInPage, null, DEPS).catch(() => ({ count: 0, media: [] }));
        /* второй снимок при загрузке: что меняется само (холст, видео, бегущая строка) — не «залипание» */
        await sleep(700); if (freeze) await still(page);
        const bufNoise = await page.screenshot();
        /* 2. проход до низа: ленивое, появления; затем снимки окна по всей высоте */
        if (freeze) await freezeMotion(page);
        const sc = await scrollThrough(page, { pause: 250, shotsDir: segments ? outDir : null, tag: `${stem}-scroll`, maxShots: segments, shotPause, skipTop: true, sheet: !!opt.sheet });
        /* 3. первый экран после возврата: листание до низа, затем прыжок наверх и/или листание вверх */
        const ctx = { bufFirst, bufNoise, dpr, watched: false, media: (firstInfo && firstInfo.media) || [] };
        let stale = null, staleUp = null;
        const firstReturn = path.join(outDir, `${stem}-first-return.png`), firstUp = path.join(outDir, `${stem}-first-up.png`);
        if (returnOpt !== 'up') {
          await scrollToY(page, 0); await sweep(page, 0, await heightOf(page)); await scrollToY(page, 0);
          stale = await checkReturn(page, ctx, { file: firstReturn, cropFile: path.join(outDir, `${stem}-stale.png`) });
        }
        if (returnOpt !== 'jump') {
          /* низ уже пройден листанием (или проходом scrollThrough) — прыжок вниз и листание вверх */
          if (returnOpt === 'up') { await scrollToY(page, 0); await sweep(page, 0, await heightOf(page)); }
          const H = await heightOf(page); await scrollToY(page, H); await sleep(300); await sweep(page, H, 0);
          staleUp = await checkReturn(page, ctx, { file: firstUp, cropFile: path.join(outDir, `${stem}-stale-up.png`) });
        }
        for (const st of [stale, staleUp]) { if (!st) continue; if (st.verdict === 'FAIL') fails++; else if (st.verdict === 'WARN') warns++; }
        if (freeze) await still(page);
        /* 4. вся страница */
        const full = path.join(outDir, `${stem}-full.png`);
        const how = await fullPageShot(page, full, { mode: fullMode }); fullHow.add(how);
        const h = await heightOf(page);
        const errors = page.log.console.filter((c) => c.type === 'error').length + page.log.errors.length;
        const scrollNote = sc.stuck ? 'страница не прокручивается — снимки окна и появления недостоверны' : !sc.reachedBottom ? `до низа не доехали: ${sc.maxScrollY} из ${sc.pageHeight - (vp.height || 0)} px` : '';
        if (scrollNote) warns++;
        /* масштаб каждого файла — для diff.mjs */
        const segFiles = (sc.shots || []).map((s) => s.file);
        const made = [first, full, ...(stale ? [firstReturn] : []), ...(staleUp ? [firstUp] : [])].map((f) => path.basename(f)).concat(segFiles);
        for (const f of made) files[f] = { scale: await scaleOf(path.join(outDir, f), vp.width), cssWidth: vp.width, dpr, viewport: name, ...(f === path.basename(full) ? { fullMode: how } : {}) };
        for (const s of sc.shots || []) files[s.file].y = s.scrollY;
        /* производные — тоже с экраном: state.mjs по cssWidth/viewport не принимает снимок не того экрана */
        for (const st of [stale, staleUp]) if (st && st.crop) files[st.crop] = { kind: 'вырезка', scale: dpr, cssWidth: vp.width, dpr, viewport: name };
        if (sc.sheet) files[sc.sheet] = { kind: 'лист', scale: null, cssWidth: vp.width, dpr, viewport: name };
        index.push({ url, page: slug, viewport: name, width: vp.width, height: h, dpr, first: path.basename(first), firstReturn: stale ? path.basename(firstReturn) : null, firstUp: staleUp ? path.basename(firstUp) : null, full: path.basename(full), fullMode: how, segments: (sc.shots || []).map((s) => ({ file: s.file, y: s.scrollY, pendingMedia: s.media ? s.media.pending : null })), sheet: sc.sheet, scroll: { pageHeight: sc.pageHeight, maxScrollY: sc.maxScrollY, reachedBottom: sc.reachedBottom, stuck: sc.stuck }, stale, staleUp, liveElements: ctx.liveCount ?? null, liveWatch: ctx.watch || null, consoleErrors: errors });
        console.log(`ок, высота ${h}px, снимков окна ${segFiles.length}, вся страница — ${how}${errors ? `, ошибок в консоли ${errors}` : ''}`);
        if (scrollNote) console.log(`  WARN прокрутка — ${scrollNote}`);
        printReturn('прокрутки до низа и прыжка наверх', stale);
        printReturn('листания до низа и обратно вверх', staleUp);
      } catch (e) { console.log(`сбой: ${e.message}`); index.push({ url, page: slug, viewport: name, error: e.message }); fails++; }
      finally { if (page) await page.close().catch(() => {}); }
    }
  }
} finally { await browser.close(); }
const partialFull = [...fullHow].some((h) => h !== 'segments');
const verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
writeJson(path.join(outDir, 'shots.json'), { tag, takenAt: new Date().toISOString(), verdict, fails, warns, note: FULLPAGE_NOTE, fullModeRequested: fullMode, files, shots: index });
console.log(`\n${verdict}: ${fails} провалов, ${warns} предупреждений`);
console.log(`Снимки: ${outDir}`);
if (partialFull) console.log(`Оговорка: ${FULLPAGE_NOTE}`);
if (opt.strict && fails) process.exit(1);
