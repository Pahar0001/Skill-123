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
 *                 По умолчанию desktop,tablet,mobile. --viewport — то же (как в a11y.mjs и perf.mjs);
 *                 оба сразу складываются в один список, повтор одного экрана снимается один раз.
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
 *   --help, -h    эта справка (код 0, ничего не создаёт и не запускает).
 * Код выхода: 0 — съёмка сделана (вердикт в выводе и в shots.json, поле verdict); 1 — нет адреса или он
 * не http(s):// и не file:///, неверное значение флага (экран, --full-mode, --return, --scheme не light
 * и не dark, --segments и --shot-pause не число от 0, флаг без значения), а с --strict — ещё и при любом
 * FAIL. Аргументы проверяются до того, как создаётся папка <out>/<tag>: при ошибке её нет.
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
 *   shots[] — по странице и экрану: файлы, прокрутка, stale / staleUp (вердикт и области),
 *     firstState — сколько элементов первого экрана запомнено и что у них двигалось само при загрузке.
 *
 * Проверка «состояние не сбрасывается»: first сравнивается с first-return и first-up попиксельно.
 * Проход до низа идёт шагами по 0,2 экрана с паузой 40 мс, чтобы наблюдатели пересечений (активный
 * пункт меню, появления) увидели каждый раздел, как при настоящем листании; иначе итог зависит от
 * того, на какие высоты попали шаги. Что меняется само (холст, видео, бегущая строка) — отсекается
 * вторым снимком при загрузке через 700 мс; холст, видео или iframe, в котором за эти 700 мс
 * изменился хоть один пиксель, по пикселям отсекается целиком по своему положению. Но под такой
 * маской (живой фон на весь экран, WebGL-герой) пиксели слепы, поэтому там сверяется состояние
 * элементов, а не пиксели: у каждого элемента первого экрана поверх живого места (кроме самих
 * холстов, видео и iframe и того, что ими закрыто) сравниваются цвет, фон, рамка, сдвиг (transform
 * и отдельные translate, rotate, scale — ими двигает Tailwind v4), подчёркивание, картинка,
 * прозрачность; изменилось и элемент не живой — FAIL, как и по пикселям. Элемент, который при загрузке
 * был поверх живого места, а после возврата ушёл за экран, пропал (display:none) или удалён, ищется
 * по коробке при загрузке (так же и в пиксельных областях). Если он только пропал, ушёл за экран или
 * стал невидим на месте (прозрачность 0, visibility:hidden) — WARN «пропал после прокрутки — проверить,
 * задумано ли», в shots.json вид области gone: подсказка «листайте ↓» прячется после первой
 * прокрутки нарочно, а остальные отличия пропавшего (класс, прозрачность) уже не видны; если в нём ссылки
 * или кнопки, это сказано. Удалённый узел, на месте которого живой компонент поставил новый (карусель,
 * которая рисует только текущий слайд; «бегущие слова» через replaceWith), — живое, не пропажа: бывший
 * родитель ещё на странице и он или предок до 5 уровней (кроме body и html) менялся при наблюдении.
 * Только проявилось (прозрачность 0 → 1, текст первого экрана виден лишь после прокрутки) — WARN
 * с вырезкой по коробкам; если проявление включил класс у предка (.hero.in), предок назван у потомка.
 * Без живого фона оценка та же: смена класса у контейнера без видимого следа, когда все видимые
 * отличия в области — проявившиеся его потомки, — не залипание, а WARN «проявилось после прокрутки».
 * Что двигалось само при загрузке (вступление на JS ещё шло при первом снимке: gsap.from со stagger
 * сразу после заставки), учитывается, как по пикселям учитывается второй снимок: в момент второго
 * снимка (+700 мс) состояние тех же элементов снимается ещё раз, и отличие только в свойствах,
 * которые за эти 700 мс менялись сами (прозрачность, сдвиг, класс…), — «двигалось само при загрузке»,
 * живое, не залипание. Отличие в других свойствах того же элемента (цвет, фон) — по-прежнему FAIL.
 * Пропажу при возврате движение при загрузке объясняет, только если элемент уже тогда уходил сам:
 * пропал за эти 700 мс, сдвиг уносил его за край окна или прозрачность шла к 0. Вступление (проявление,
 * сдвиг внутрь, сдвиг коробки), после которого элемент пропал при прокрутке, — не «двигалось само».
 * Сравнение числами, с допуском на невидимое: сдвиг — угол коробки ушёл на 1 CSS px и больше
 * (остаток плавного параллакса в сотые пикселя — не отличие), цвет — канал на 4 из 255 или альфа
 * на 0,04, прозрачность — на 0,1.
 * Карусели и прочее, что меняет DOM само, — наблюдением за изменениями на месте до 8 с (до второй
 * смены; только если расхождение нашлось); живым считается и элемент, у которого менялся предок
 * или сосед того же вида (слайд, который за наблюдение не сменился). Карусель, которая и за 8 с не
 * сменилась, узнаётся по «переключению между соседями»: у одного соседа класс снят, у другого тот
 * же поставлен, и это не меню (nav, header: там это и есть залипшая подсветка) — WARN, не FAIL.
 * Ссылки и кнопки в счёт, только если это точки той карусели: без текста или с номером, рядом со
 * слайдами, которые переключились; пара кнопок с текстом («Купить | Примерить») — залипание.
 * Остальное — области, в которых перечисляются элементы и что у них изменилось (класс, цвет, прозрачность):
 *   FAIL «состояние не сбрасывается» — у того, что осталось на экране, изменились класс, цвет, фон,
 *        рамка, сдвиг или появился новый элемент (подсвеченный пункт меню, раскрытая шапка, всплывшее
 *        сообщение);
 *   WARN — только пропало или ушло за экран («пропал после прокрутки — проверить, задумано ли»), только
 *        проявление (прозрачность 0 → 1), только холст и видео, только то, что меняется само (карусель),
 *        или причина по стилям не видна (смотреть вырезку).
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
/* -h — как --help: справка без побочных действий (ни папок, ни браузера) */
if (opt.help || pos.includes('-h')) { console.log(HELP); process.exit(0); }
const die = (msg) => { console.error(`${msg}  (подробно: --help)`); process.exit(1); };
/* сначала все проверки аргументов, потом папки: неверный флаг не оставляет пустую <run>/<tag> */
if (!pos[0]) die('Нужен адрес: node shots.mjs <url> [--tag before|after] [--pages /,/about] [--viewports ...] [--with-320]');
let base = null; try { base = new URL(pos[0]); } catch { /* ниже */ }
if (!base || !/^(https?|file):$/.test(base.protocol)) die(`Неверный адрес «${pos[0]}»: нужен полный адрес — http://…, https://… или file:///…`);
/* флаг со значением, но без значения (--out в конце строки, --tag --strict) */
for (const k of ['out', 'tag', 'pages', 'viewports', 'viewport', 'scheme', 'segments', 'shot-pause', 'full-mode', 'full', 'return']) if (opt[k] === true) die(`--${k}: нужно значение`);
const vpSpec = [opt.viewports, opt.viewport].filter((v) => v !== undefined && v !== '').join(',');
const vpSeen = new Set();
const viewports = pickViewports(vpSpec || undefined).filter(([n]) => !vpSeen.has(n) && vpSeen.add(n));
if (!viewports.length) die('--viewports: пустой список экранов');
if (opt['with-320'] && !viewports.some(([, vp]) => vp.width === 320)) viewports.push(...pickViewports('mobile-s'));
const numOpt = (k, def) => { if (opt[k] === undefined) return def; const n = Number(opt[k]); if (!Number.isFinite(n) || n < 0) die(`--${k}: нужно число от 0, а не «${opt[k]}»`); return n; };
const segments = Math.floor(numOpt('segments', 8));
const shotPause = numOpt('shot-pause', 1200);
if (opt.scheme !== undefined && !/^(light|dark)$/.test(String(opt.scheme))) die(`--scheme: light или dark, а не «${opt.scheme}»`);
const fullOpt = String(opt['full-mode'] || opt.full || 'segments');
if (!/^(segments|auto)$/.test(fullOpt)) die('--full-mode: segments или auto');
const fullMode = fullOpt;
const returnOpt = String(opt.return || 'both');
if (!/^(both|jump|up)$/.test(returnOpt)) die('--return: both, jump или up');
let pages = [base.href];
if (opt.pages) { try { pages = pagesFrom(opt.pages, base); } catch (e) { die(`--pages: ${e.message}`); } if (!pages.length) die('--pages: пустой список страниц'); }
const run = runDir(opt, pos[0]);
const tag = opt.tag || 'before';
const outDir = ensureDir(path.join(run, tag));
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
  const vw = innerWidth, vh = innerHeight; const m = new Map(); const diffOf = stateDiff();
  const out = (r) => !r.width || !r.height || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw;
  /* холсты, видео, iframe в первом экране: если за 700 мс они изменились сами — по пикселям маскируются
     целиком, а поверх них сверяется состояние элементов (maskedChangesInPage) */
  const media = [];
  for (const el of document.querySelectorAll('canvas, video, iframe')) {
    const r = el.getBoundingClientRect(); if (out(r)) continue;
    media.push({ x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(vw, r.right) - Math.max(0, r.left), h: Math.min(vh, r.bottom) - Math.max(0, r.top), sig: sig(el) });
  }
  const MEDIA = /^(CANVAS|VIDEO|IFRAME)$/;
  const onMedia = (r) => media.some((R) => !(r.right < R.x || r.left > R.x + R.w || r.bottom < R.y || r.top > R.y + R.h));
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    const r = el.getBoundingClientRect(); if (out(r)) continue;
    /* коробка — в snap: элемент, который потом ушёл за экран или пропал, ищется по месту при загрузке */
    const a = diffOf.snap(el, getComputedStyle(el), r);
    /* закрыт ли холстом или видео (ролик поверх): если такой элемент потом пропадёт, этого не видно */
    if (media.length && onMedia(r)) { const t = document.elementFromPoint(Math.min(vw - 1, Math.max(0, (r.left + r.right) / 2)), Math.min(vh - 1, Math.max(0, (r.top + r.bottom) / 2))); a.cov = !!t && MEDIA.test(t.tagName) && !el.contains(t); }
    m.set(el, a);
    if (m.size >= 5000) break;
  }
  window.__rwFirst = m;
  /* классы body и html — чтобы назвать причину, если проявление или подсветку включил класс на них */
  window.__rwFirstRoot = { body: document.body ? document.body.getAttribute('class') || '' : '', html: document.documentElement.getAttribute('class') || '' };
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
   Возвращает { d: [отличия], visual: есть ли видимое отличие (не только класс или атрибуты), o, removed, added,
   keys: какие свойства отличаются, gone: ушёл за экран или пропал, load: всё отличие — в том, что двигалось
   само при загрузке (loadMotionInPage) }.
   Сравнение числами, с допуском на то, чего глазом не видно: цвет — канал на 4 из 255 (с учётом альфы)
   или альфа на 0,04; сдвиг — угол коробки ушёл на 1 CSS px и больше (остаток плавного параллакса,
   translateY(0.049px), — не отличие); прозрачность — на 0,1.
   Ещё две функции на том же объекте: snap(el) — состояние для запоминания, raw(el, a) — какие свойства
   изменились хоть на сколько (для «двигалось при загрузке», без допусков) */
function stateDiffInPage() {
  const ARIA = ['aria-current', 'aria-expanded', 'aria-selected', 'aria-pressed', 'open'];
  const short = (c) => String(c).replace(/rgba?\(([^)]+)\)/g, (m0, v) => { const p = v.split(/[,\s/]+/).filter(Boolean).map(Number); return '#' + p.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase() + (p.length > 3 && p[3] < 1 ? `/${p[3]}` : ''); });
  const rgba = (c) => { const m = /^rgba?\(([^)]+)\)$/.exec(String(c).trim()); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); if (p.length < 3 || p.some((x) => !Number.isFinite(x))) return null; return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  /* цвет, который не разобрать (oklch, color()), сравнивается строкой */
  const colorDiff = (x, y) => { if (x === y) return false; const A = rgba(x), B = rgba(y); if (!A || !B) return true; if (A[3] < 0.02 && B[3] < 0.02) return false; return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2])) * Math.max(A[3], B[3]) >= 4 || Math.abs(A[3] - B[3]) >= 0.04; };
  const mat = (t) => { if (!t || t === 'none') return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; const m = /^matrix(3d)?\(([^)]+)\)$/.exec(String(t).trim()); if (!m) return null; const v = m[2].split(',').map(Number); if (v.some((x) => !Number.isFinite(x))) return null; if (m[1]) return v.length === 16 ? v : null; if (v.length !== 6) return null; return [v[0], v[1], 0, 0, v[2], v[3], 0, 0, 0, 0, 1, 0, v[4], v[5], 0, 1]; };
  /* отдельные translate, rotate, scale (ими двигает Tailwind v4, а не transform) применяются до transform:
     итог = translate · rotate · scale · transform, всё вокруг transform-origin. Неразобранное — null */
  const TP = ['tr', 'tl', 'ro', 'sc']; const TPN = ['transform', 'translate', 'rotate', 'scale'];
  const none = (v) => v === undefined || v === null || v === '' || v === 'none';
  const num = (v, size) => { const m = /^(-?[\d.]+(?:e[+-]?\d+)?)(px|%)?$/i.exec(String(v).trim()); if (!m) return NaN; const x = parseFloat(m[1]); return m[2] === '%' ? x / 100 * size : x; };
  const ang = (v) => { const m = /^(-?[\d.]+(?:e[+-]?\d+)?)(deg|rad|turn|grad)$/i.exec(String(v).trim()); if (!m) return NaN; const x = parseFloat(m[1]); return { deg: x, rad: x * 180 / Math.PI, turn: x * 360, grad: x * 0.9 }[m[2].toLowerCase()]; };
  const full = (a, w, h) => {
    const T = mat(a.tr); if (!T) return null;
    if (none(a.tl) && none(a.ro) && none(a.sc)) return T;
    try {
      const M = new DOMMatrix();
      if (!none(a.tl)) { const p = String(a.tl).trim().split(/\s+/); const x = num(p[0], w), y = p.length > 1 ? num(p[1], h) : 0, z = p.length > 2 ? num(p[2], 0) : 0; if (![x, y, z].every(Number.isFinite)) return null; M.translateSelf(x, y, z); }
      if (!none(a.ro)) { const p = String(a.ro).trim().split(/\s+/); const g = ang(p[p.length - 1]); const ax = p.length === 1 ? [0, 0, 1] : p.length === 2 ? { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[p[0]] : p.length === 4 ? p.slice(0, 3).map(Number) : null; if (!ax || !Number.isFinite(g) || !ax.every(Number.isFinite)) return null; M.rotateAxisAngleSelf(ax[0], ax[1], ax[2], g); }
      if (!none(a.sc)) { const p = String(a.sc).trim().split(/\s+/).map((v) => num(v, 1)); if (!p.every(Number.isFinite)) return null; M.scaleSelf(p[0], p.length > 1 ? p[1] : p[0], p.length > 2 ? p[2] : 1); }
      M.multiplySelf(DOMMatrix.fromFloat64Array(new Float64Array(T)));
      return Array.from(M.toFloat64Array());
    } catch { return null; }
  };
  /* на сколько CSS px ушёл самый дальний угол коробки от смены матрицы (вокруг transform-origin);
     сдвиг по z тоже в счёт (под перспективой предка он виден); неразобранная матрица — Infinity */
  const shift = (el, s, a, b) => {
    if (TP.every((k) => a[k] === b[k])) return 0;
    const r = el.getBoundingClientRect(); const w = el.offsetWidth ?? r.width, h = el.offsetHeight ?? r.height;
    const A = full(a, w, h), B = full(b, w, h); if (!A || !B) return Infinity;
    const og = String(s.transformOrigin || '').split(' ').map(parseFloat); const ox = og[0] || 0, oy = og[1] || 0;
    const P = (m, x, y) => { const W = m[3] * x + m[7] * y + m[15] || 1e-6; return [(m[0] * x + m[4] * y + m[12]) / W, (m[1] * x + m[5] * y + m[13]) / W, m[2] * x + m[6] * y + m[14]]; };
    let max = 0;
    for (const x of [-ox, w - ox]) for (const y of [-oy, h - oy]) { const p = P(A, x, y), q = P(B, x, y); max = Math.max(max, Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2])); }
    return max;
  };
  /* p — родитель при загрузке: узел, который живой компонент заменил новым (карусель, рисующая только
     текущий слайд; «бегущие слова» через replaceWith), узнаётся по бывшему родителю (liveGone) */
  const snap = (el, s = getComputedStyle(el), r = el.getBoundingClientRect()) => ({ cls: el.getAttribute('class') || '', o: eff(el), color: s.color, bg: s.backgroundColor, bdc: [s.borderTopColor, s.borderBottomColor, s.outlineColor], os: s.outlineStyle, tr: s.transform, tl: s.translate, ro: s.rotate, sc: s.scale, td: s.textDecorationLine, aria: ARIA.map((x) => el.getAttribute(x) || '').join('|'), src: el.currentSrc || el.getAttribute('src') || '', box: { x: r.left, y: r.top, w: r.width, h: r.height }, p: el.parentElement });
  /* был в первом экране, а теперь нет: удалён, скрыт (display:none, нулевой размер) или целиком за краем окна */
  const goneOf = (el) => {
    if (!el.isConnected) return 'удалён со страницы';
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return 'пропал (display:none или нулевой размер)';
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return 'ушёл за экран';
    return '';
  };
  /* что изменилось хоть на сколько — без допусков: вступление в последней четверти пути двигается на доли пикселя */
  const raw = (el, a, known) => {
    let swapped = false;
    if (!el.isConnected) { const t = twin(el, a, known); if (!t) return ['gone']; el = t; swapped = true; }
    const b = snap(el); const k = swapped ? ['gone'] : [];
    if (b.cls !== a.cls) k.push('cls');
    if (Math.abs(b.o - a.o) > 0.001) k.push('o');
    if (b.color !== a.color) k.push('color');
    if (b.bg !== a.bg) k.push('bg');
    if (b.os !== a.os || b.bdc.join('|') !== a.bdc.join('|')) k.push('bd');
    if (TP.some((x) => b[x] !== a[x])) k.push('tr');
    if (b.td !== a.td) k.push('td');
    if (b.aria !== a.aria) k.push('aria');
    if (b.src !== a.src) k.push('src');
    if (a.box && ['x', 'y', 'w', 'h'].some((x) => Math.abs(b.box[x] - a.box[x]) > 0.5)) k.push('box');
    if (goneOf(el) && !k.includes('gone')) k.push('gone');
    /* уходило само: сдвиг уносил коробку за край окна (выступ за край вырос), прозрачность шла к 0 */
    const outBy = (x) => Math.max(0, -x.x) + Math.max(0, x.x + x.w - innerWidth) + Math.max(0, -x.y) + Math.max(0, x.y + x.h - innerHeight);
    if (k.includes('tr') && a.box && outBy(b.box) > outBy(a.box) + 0.5) k.push('trOut');
    if (k.includes('o') && b.o < a.o - 0.001) k.push('oOut');
    return k;
  };
  /* отличие объясняется движением при загрузке, если КАЖДОЕ его свойство менялось само за 700 мс
     после первого снимка. Ушедшее — только если оно уже при загрузке уходило само: пропало или удалено
     за эти 700 мс, сдвиг уносил его за край окна или прозрачность шла к 0. Сдвиг внутрь, проявление
     (прозрачность к 1) и сдвиг коробки при загрузке ухода не объясняют: вступление, после которого
     элемент пропал при прокрутке и не вернулся, — не «двигалось само» */
  const EXPL = { gone: ['gone', 'trOut', 'oOut'] };
  const NAME = { o: 'прозрачность', tr: 'сдвиг', color: 'цвет', bg: 'фон', bd: 'рамка', td: 'подчёркивание', src: 'картинка', gone: 'место' };
  const byLoad = (el, keys) => { const mv = el.__rwMoved; return !!mv && keys.length > 0 && keys.every((k) => (EXPL[k] || [k]).some((x) => mv.has(x))); };
  const diffOf = (el, a) => {
    let gone = goneOf(el);
    if (!el.isConnected) return { d: [gone], visual: true, o: 0, added: [], removed: [], keys: ['gone'], gone, load: byLoad(el, ['gone']), loadPart: [] };
    const s = getComputedStyle(el); const d = []; const keys = []; let visual = false;
    const cls = el.getAttribute('class') || ''; let added = [], removed = [];
    if (cls !== a.cls) { const A = new Set(a.cls.split(/\s+/).filter(Boolean)), B = new Set(cls.split(/\s+/).filter(Boolean)); added = [...B].filter((c) => !A.has(c)); removed = [...A].filter((c) => !B.has(c)); d.push(`класс ${added.map((c) => '+' + c).concat(removed.map((c) => '−' + c)).join(' ')}`); keys.push('cls'); }
    const o = eff(el);
    /* стал невидим на месте (прозрачность 0, visibility:hidden) — та же пропажа, что display:none:
       подсказку «листайте ↓» чаще гасят прозрачностью, чем убирают */
    if (!gone && a.o > 0.05 && o <= 0.05) gone = 'стал невидим (прозрачность 0 или visibility:hidden)';
    if (Math.abs(o - a.o) > 0.1) { d.push(`прозрачность ${a.o}→${o}`); keys.push('o'); visual = true; }
    if (colorDiff(a.color, s.color)) { d.push(`цвет ${short(a.color)}→${short(s.color)}`); keys.push('color'); visual = true; }
    if (colorDiff(a.bg, s.backgroundColor)) { d.push(`фон ${short(a.bg)}→${short(s.backgroundColor)}`); keys.push('bg'); visual = true; }
    /* цвет обводки при outline-style: none не виден */
    if (s.outlineStyle !== a.os || colorDiff(a.bdc[0], s.borderTopColor) || colorDiff(a.bdc[1], s.borderBottomColor) || (s.outlineStyle !== 'none' && colorDiff(a.bdc[2], s.outlineColor))) { d.push('рамка или обводка'); keys.push('bd'); visual = true; }
    const now = { tr: s.transform, tl: s.translate, ro: s.rotate, sc: s.scale };
    const sh = shift(el, s, a, now);
    if (sh >= 1) { const what = TPN.filter((n, i) => a[TP[i]] !== now[TP[i]]).join(', '); d.push(Number.isFinite(sh) ? `сдвиг (${what}) на ${Math.round(sh)} px` : `сдвиг (${what})`); keys.push('tr'); visual = true; }
    if (s.textDecorationLine !== a.td) { d.push('подчёркивание'); keys.push('td'); visual = true; }
    const aria = ARIA.map((x) => el.getAttribute(x) || '').join('|');
    if (aria !== a.aria) { d.push(`атрибуты ${a.aria}→${aria}`); keys.push('aria'); }
    if ((el.currentSrc || el.getAttribute('src') || '') !== a.src) { d.push('другая картинка'); keys.push('src'); visual = true; }
    if (gone) { d.push(gone); keys.push('gone'); visual = true; }
    /* у пропавшего прозрачность 0 — следствие пропажи (display:none, невидим), а не своё отличие */
    const vk = keys.filter((k) => k !== 'cls' && k !== 'aria' && !(gone && k === 'o' && o <= 0.05));
    const load = byLoad(el, vk.length ? vk : keys);
    /* часть отличия, которая двигалась сама при загрузке, — чтобы у залипшего не читать её как залипание */
    const loadPart = !load && el.__rwMoved ? vk.filter((k) => byLoad(el, [k])).map((k) => NAME[k] || k) : [];
    return { d, visual, o, added, removed, keys, gone, load, loadPart };
  };
  /* удалённый узел, на месте которого стоит такой же новый (фреймворк перерисовал блок): тот же тег и текст,
     коробка в пределах 1 px от коробки при загрузке. Тогда сверяется новый — иначе «удалён» был бы ложным */
  const text = (e) => (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  const twin = (el, a, known) => {
    if (el.isConnected || !a.box) return null;
    const cx = a.box.x + a.box.w / 2, cy = a.box.y + a.box.h / 2; if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return null;
    const t = text(el);
    for (const e of document.elementsFromPoint(cx, cy)) {
      if (e.tagName !== el.tagName || (known && known.has(e))) continue;
      const r = e.getBoundingClientRect();
      if (Math.abs(r.left - a.box.x) <= 1 && Math.abs(r.top - a.box.y) <= 1 && Math.abs(r.width - a.box.w) <= 1 && Math.abs(r.height - a.box.h) <= 1 && text(e) === t) return e;
    }
    return null;
  };
  /* узел для сверки: сам, а если удалён — его двойник на том же месте (с метками «двигалось при загрузке») */
  const pick = (el, a, known) => {
    const t = twin(el, a, known); if (!t) return el;
    if (el.__rwMoved && !t.__rwMoved) t.__rwMoved = el.__rwMoved;
    return t;
  };
  /* удалённый узел, который заменил живой компонент: бывший родитель (у вложенного в удалённое поддерево —
     родитель корня этого поддерева) ещё на странице, и он или предок до 5 уровней менялся, пока страница
     стояла на месте (метка __rwLive из watchLiveInPage: слайд или слово заменялись и при наблюдении).
     body и html не в счёт: туда вставляют счётчики и всплывающие окна, о самом узле это ничего не говорит */
  const liveGone = (el, a) => {
    if (el.isConnected) return false;
    let root = el; while (root.parentElement) root = root.parentElement;
    const first = window.__rwFirst; const b = root === el ? a : first && first.get(root);
    const p = b && b.p; if (!p || !p.isConnected) return false;
    for (let e = p, k = 0; e && k < 5; e = e.parentElement, k++) { if (e === document.body || e === document.documentElement) break; if (e.__rwLive) return true; }
    return false;
  };
  /* в пропавшем есть ссылки или кнопки — чтобы у «пропал после прокрутки» было видно, что пропало управление */
  const CTL = 'a[href], button, input, select, textarea, [role=button], [role=link]';
  const hasCtl = (el) => { try { return el.matches(CTL) || !!el.querySelector(CTL); } catch { return false; } };
  /* пропал не «только»: на его месте при загрузке теперь стоит видимый элемент, которого при загрузке не
     было (перерисовали с другим текстом, подменили блок), — это видимая подмена, не пропажа.
     Ищется в центре бывшей коробки: новый (не из known), не холст и не видео, видимый, перекрывает
     бывшую коробку хотя бы наполовину меньшей из двух площадей */
  const replacedBy = (el, a, known) => {
    if (!a.box || !a.box.w || !a.box.h) return null;
    const cx = a.box.x + a.box.w / 2, cy = a.box.y + a.box.h / 2; if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return null;
    for (const e of document.elementsFromPoint(cx, cy)) {
      if (e === document.body || e === document.documentElement) break;
      if (e === el || (known && known.has(e)) || /^(CANVAS|VIDEO|IFRAME)$/.test(e.tagName) || eff(e) <= 0.05) continue;
      const r = e.getBoundingClientRect();
      const ix = Math.max(0, Math.min(r.right, a.box.x + a.box.w) - Math.max(r.left, a.box.x)), iy = Math.max(0, Math.min(r.bottom, a.box.y + a.box.h) - Math.max(r.top, a.box.y));
      if (ix * iy >= 0.5 * Math.min(r.width * r.height, a.box.w * a.box.h)) return e;
    }
    return null;
  };
  /* чем объясняется отличие (общая часть explainInPage и maskedChangesInPage): подпись в конец списка
     отличий, живое ли оно и осталось ли «только пропало» (gone) — у пропавшего, на месте которого стоит
     новый видимый элемент, это уже подмена, а не пропажа */
  const fate = (el, a, res, isLive, known) => {
    const { gone, load, loadPart } = res;
    if (load) return { extra: ['двигалось само при загрузке'], live: true, gone: !!gone };
    const lg = liveGone(el, a);
    const nw = gone && !lg ? replacedBy(el, a, known) : null; const nwLive = !!nw && isLive(nw);
    const extra = loadPart.length ? [`(${loadPart.join(', ')} — двигалось само при загрузке)`] : [];
    if (lg || nwLive) extra.push('узел заменён новым — компонент меняется сам');
    else if (nw) extra.push(`на его месте новый: ${sig(nw)} «${text(nw).slice(0, 24)}»`);
    else if (gone && hasCtl(el)) extra.push('в нём ссылки или кнопки');
    return { extra, live: isLive(el) || lg || nwLive, gone: !!gone && !nw };
  };
  diffOf.snap = snap; diffOf.raw = raw; diffOf.pick = pick; diffOf.fate = fate;
  return diffOf;
}

/* ближайший предок (включая body и html), у которого сменился класс с первого снимка: «.hero.in включил
   проявление h1». Общая часть explainInPage и maskedChangesInPage */
function causeInPage() {
  const first = window.__rwFirst || new Map(); const root = window.__rwFirstRoot || {};
  const delta = (was, now) => { const A = new Set(String(was).split(/\s+/).filter(Boolean)), B = new Set(String(now).split(/\s+/).filter(Boolean)); return [...B].filter((c) => !A.has(c)).map((c) => '+' + c).concat([...A].filter((c) => !B.has(c)).map((c) => '−' + c)).join(' '); };
  return (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const was = first.has(p) ? first.get(p).cls : p === document.body ? root.body : p === document.documentElement ? root.html : undefined;
      if (was === undefined) continue; const now = p.getAttribute('class') || '';
      if (now !== was) return `${sig(p)} (класс ${delta(was, now)})`;
    }
    return '';
  };
}

/* второй снимок при загрузке (+700 мс): что у элементов первого экрана изменилось само за это время
   (вступление на JS, которое при первом снимке ещё шло, — gsap.from со stagger сразу после заставки).
   Метка el.__rwMoved = свойства, которые двигались; при сверке после возврата отличие в них не в счёт,
   как по пикселям не в счёт то, что изменилось между первым и шумовым снимком */
function loadMotionInPage() {
  const first = window.__rwFirst || new Map(); const diffOf = stateDiff(); let n = 0; const sample = [];
  for (const [el, a] of first) {
    const k = diffOf.raw(el, a, first); if (!k.length) continue;
    el.__rwMoved = new Set(k); n++;
    if (sample.length < 6) sample.push(`${sig(el)}: ${k.join(' ')}`);
  }
  return { moved: n, sample };
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
   которая за наблюдение не сменилась). Меню (nav, header) не в счёт: там это и есть залипшая подсветка.
   Ссылки и кнопки — тоже нет, кроме точек карусели: кнопка или ссылка без текста или с номером (≤ 3 знаков),
   не в nav и не в header, рядом со слайдами, которые переключились (общий предок в 4 уровнях, не body и не
   main), — часть того же переключения. Пара кнопок с текстом («Купить | Примерить») остаётся залипанием */
function markSwaps(list) {
  const nav = (el) => !!el.closest('nav, header, [role=navigation], [role=menubar], [role=menu]');
  const ctl = (el) => el.matches('a[href], button, [role=tab]') || !!el.closest('[role=tablist]');
  const pair = (x, y) => x !== y && x.removed.length > 0 && y.added.length > 0 && !!x.el.parentElement && x.el.parentElement === y.el.parentElement && x.el.tagName === y.el.tagName && x.removed.some((c) => y.added.includes(c));
  const boxes = [];
  for (const x of list) for (const y of list) {
    if (!pair(x, y) || nav(x.el) || nav(y.el) || ctl(x.el) || ctl(y.el)) continue;
    x.swap = y.swap = true; boxes.push(x.el.parentElement);
  }
  if (!boxes.length) return;
  const dot = (el) => (el.innerText || el.textContent || '').trim().length <= 3;
  const near = (el) => {
    for (let p = el.parentElement, k = 0; p && k < 4; p = p.parentElement, k++) {
      if (p === document.body || p === document.documentElement || p.tagName === 'MAIN') return false;
      if (boxes.some((b) => p.contains(b))) return true;
    }
    return false;
  };
  for (const x of list) for (const y of list) {
    if (!pair(x, y) || (x.swap && y.swap) || nav(x.el) || nav(y.el) || !dot(x.el) || !dot(y.el) || !near(x.el)) continue;
    x.swap = y.swap = true;
  }
}

/* порядок в списке изменившегося: залипшее, пропавшее, проявившееся, живое и переключение карусели
   (в странице — как rank, в checkReturn — для вывода) */
function rankChange(c) { return (c.live || c.swap ? 4 : 0) + (c.appeared ? 2 : c.gone ? 1 : 0); }

function explainInPage(regions) {
  const first = window.__rwFirst || new Map();
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const isLive = liveTest(); const diffOf = stateDiff(); const causeOf = cause();
  const vw = innerWidth, vh = innerHeight;
  return regions.map((R) => {
    const hit = (r) => !(r.right < R.x || r.left > R.x + R.w || r.bottom < R.y || r.top > R.y + R.h);
    const raw = [];
    for (const [orig, a] of first) {
      const was = a.box ? { left: a.box.x, top: a.box.y, right: a.box.x + a.box.w, bottom: a.box.y + a.box.h } : null;
      if (!orig.isConnected && !(was && hit(was))) continue;
      const el = diffOf.pick(orig, a, first);
      const r = el.isConnected ? el.getBoundingClientRect() : null;
      const on = !!r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      /* ушедший за экран или пропавший — по коробке при загрузке */
      if (on ? !hit(r) : !(was && hit(was))) continue;
      const res = diffOf(el, a); const { d, visual, o, added, removed, gone, load } = res;
      if (!d.length || (gone && a.o <= 0.05)) continue;
      /* удалён, а на месте — новый узел живого компонента: живое; новый, но не живой — подмена, не пропажа */
      const f = diffOf.fate(el, a, res, isLive, first);
      raw.push({ el, added, removed, visual, sig: sig(el), text: txt(el), diffs: d.concat(f.extra), appeared: !gone && a.o <= 0.05 && o > 0.5, gone: f.gone, left: !!gone, load, live: f.live });
    }
    swaps(raw);
    /* проявление, включённое классом у контейнера (.hero.in → h1 проявился): смена класса без видимого
       отличия — не залипание, если все видимые отличия в области (кроме живого) — проявившиеся потомки
       этого элемента. Так же судит maskedChangesInPage поверх живого фона: оба пути — WARN «проявилось» */
    const vis = raw.filter((c) => c.visual && !c.live && !c.swap);
    for (const c of raw) if (!c.visual && !c.live && !c.swap && vis.length && vis.every((v) => v.appeared && v.el !== c.el && c.el.contains(v.el))) c.cause = true;
    for (const v of vis) if (v.appeared) { const why = causeOf(v.el); if (why) v.diffs = v.diffs.concat(`после смены класса у предка ${why}`); }
    /* ушедший вместе с ушедшим предком (ссылки спрятанной шапки) не повторяется */
    const changed = raw.filter((c) => !c.cause && !(c.left && raw.some((p) => p !== c && p.left && p.el.contains(c.el)))).map(({ el, added, removed, visual, left, ...c }) => ({ ...c, swap: !!c.swap }));
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
    /* по первым 8 судят о виде области: залипшее не должно остаться за обрезкой из-за слайдов и точек;
       порядок — залипшее, пропавшее, проявившееся, живое */
    uniq.sort((p, q) => rank(p) - rank(q));
    return { changed: uniq.slice(0, 8), changedCount: uniq.length, top: [...top].slice(0, 6), media: [...new Set(media)], newEls: [...newEls], liveHits };
  });
}

/* под маской живого холста, видео или iframe пиксели слепы: сверяем состояние элементов первого экрана,
   которые лежат поверх маски, — кроме самих холстов, видео, iframe и того, что ими закрыто.
   Считается только видимое отличие (цвет, фон, рамка, сдвиг, подчёркивание, картинка, прозрачность):
   смена одного класса без видимого следа (lazyloaded) — не залипание. Но если класс сменился у предка,
   а видимое отличие появилось у потомка (.hero.in → h1 проявился), предок называется у потомка как
   причина. Потомки уже найденного не повторяются: залипшего — никакие, проявившегося — проявившиеся.
   Элемент, который был поверх маски при загрузке, а теперь ушёл за экран, пропал (display:none) или удалён,
   ищется по коробке при загрузке — «ушёл за экран или пропал» (текущей коробки у него в маске нет).
   Отличие только в том, что двигалось само при загрузке (loadMotionInPage), — живое, не залипание */
function maskedChangesInPage(rects) {
  const first = window.__rwFirst || new Map();
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const isLive = liveTest(); const diffOf = stateDiff(); const causeOf = cause();
  const MEDIA = /^(CANVAS|VIDEO|IFRAME)$/;
  const vw = innerWidth, vh = innerHeight;
  const hitAny = (r) => rects.some((R) => !(r.right < R.x || r.left > R.x + R.w || r.bottom < R.y || r.top > R.y + R.h));
  const clip = (r) => ({ x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), w: Math.max(1, Math.round(Math.min(vw, r.right) - Math.max(0, r.left))), h: Math.max(1, Math.round(Math.min(vh, r.bottom) - Math.max(0, r.top))) });
  const raw = []; let checked = 0;
  for (const [orig, a] of first) {
    const was = a.box ? { left: a.box.x, top: a.box.y, right: a.box.x + a.box.w, bottom: a.box.y + a.box.h } : null;
    if (!orig.isConnected && !(was && hitAny(was))) continue;
    const el = diffOf.pick(orig, a, first);
    if (MEDIA.test(el.tagName) || (el.parentElement && el.parentElement.closest('canvas, video, iframe'))) continue;
    const r = el.isConnected ? el.getBoundingClientRect() : null;
    const on = !!r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    if (on ? !hitAny(r) : !(was && hitAny(was))) continue;
    /* закрыт самим холстом или видео (ролик поверх) — его отличия не видны; у ушедшего — как было при загрузке */
    if (on) {
      const cx = Math.min(vw - 1, Math.max(0, (r.left + r.right) / 2)), cy = Math.min(vh - 1, Math.max(0, (r.top + r.bottom) / 2));
      const topEl = document.elementFromPoint(cx, cy); if (topEl && MEDIA.test(topEl.tagName) && !el.contains(topEl)) continue;
    } else if (a.cov) continue;
    checked++;
    const res = diffOf(el, a); const { d, visual, o, added, removed, gone, load } = res;
    if (!d.length || !visual) continue;
    if (a.o <= 0.05 && (gone || o <= 0.05)) continue;
    const why = gone ? '' : causeOf(el);
    /* удалён, а на месте — новый узел живого компонента: живое; новый, но не живой — подмена, не пропажа
       (поверх живого места новый элемент иначе не виден: сверяются только элементы первого снимка) */
    const f = diffOf.fate(el, a, res, isLive, first);
    raw.push({ el, added, removed, sig: sig(el), text: txt(el), diffs: d.concat(why ? [`после смены класса у предка ${why}`] : [], f.extra), cause: why, appeared: !gone && a.o <= 0.05 && o > 0.5, gone: f.gone, load, live: f.live, rect: clip(on ? r : was) });
  }
  swaps(raw);
  /* внешние: потомок залипшего не повторяется; потомок проявившегося — если и сам только проявился */
  const out = [];
  for (const c of raw) { if (out.some((p) => p.el.contains(c.el) && (!p.appeared || c.appeared))) continue; out.push(c); }
  /* сначала то, что не живое: в первые 12 не должно попасть одно вступление, вытеснив залипшее */
  const lv = (c) => (c.live || c.swap ? 1 : 0);
  const sorted = out.slice().sort((p, q) => lv(p) - lv(q));
  return { checked, liveCount: out.filter((c) => lv(c)).length, loadCount: out.filter((c) => c.load).length, changed: sorted.slice(0, 12).map(({ el, added, removed, ...c }) => ({ ...c, swap: !!c.swap })) };
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
    masked = { media: r.liveMedia, checked: mc.checked, changed: mc.changed, live: mc.liveCount ?? mc.changed.filter((c) => c.live || c.swap).length, load: mc.loadCount || 0 };
  }
  const maskedStuck = masked ? masked.changed.filter((c) => !c.appeared && !c.gone && !c.live && !c.swap) : [];
  /* проявилось поверх живого места только после прокрутки (при загрузке пусто) — WARN, как по пикселям */
  const maskedAppeared = masked ? masked.changed.filter((c) => c.appeared && !c.live && !c.swap) : [];
  /* только пропало или ушло за экран (подсказка «листайте ↓») — WARN «проверить, задумано ли», как по пикселям */
  const maskedGone = masked ? masked.changed.filter((c) => c.gone && !c.live && !c.swap) : [];
  const maskedLive = masked ? masked.live : 0, maskedLoad = masked ? masked.load : 0;
  if (!r.regions.length && !maskedStuck.length && !maskedAppeared.length && !maskedGone.length) return { verdict: 'OK', share: r.share, liveSkipped: r.liveSkipped, liveMedia: r.liveMedia, masked, maskedLive, maskedLoad, regions: [] };
  /* расхождение есть: сначала посмотреть на месте (до 8 с, до второй смены), что меняется само, — потом объяснять */
  if (r.regions.length) await watch();
  const empty = { changed: [], top: [], media: [], newEls: [] };
  const why = r.regions.length ? await evaluateWith(page, explainInPage, r.regions.map(({ x, y, w, h }) => ({ x, y, w, h })), DEPS).catch(() => r.regions.map(() => empty)) : [];
  const regions = r.regions.map((g, i) => {
    const e = why[i] || empty;
    const real = e.changed.filter((c) => !c.appeared);
    /* залипло — видимое отличие стилей у того, что осталось на экране (класс, цвет, фон, рамка, сдвиг) или
       новый элемент. Только пропало или ушло за экран (display:none, удалён — остальные отличия у него уже
       не видны) — отдельный вид «пропало», WARN: подсказка «листайте ↓» прячется после первой прокрутки нарочно */
    const stuck = real.filter((c) => !c.live && !c.swap && !c.gone);
    const gone = real.filter((c) => c.gone && !c.live && !c.swap);
    const kind = stuck.length || e.newEls.length ? 'stuck' : gone.length ? 'gone' : real.some((c) => c.live) || e.liveHits ? 'live' : real.length ? 'carousel' : e.changed.length ? 'appeared' : e.media.length ? 'media' : 'unknown';
    /* в выводе (первые 4) — сначала залипшее, потом пропавшее, проявившееся, живое и переключение карусели */
    return { ...g, kind, changed: e.changed.slice().sort((p, q) => rankChange(p) - rankChange(q)), top: e.top, media: e.media };
  });
  /* залипшее поверх живого места — отдельными областями по коробке элемента */
  for (const c of maskedStuck.slice(0, 6)) regions.push({ ...c.rect, pixels: null, kind: 'stuck', masked: true, changed: [c], top: [], media: masked.media });
  /* проявившееся и пропавшее поверх живого места — каждое одной областью по общей рамке их коробок */
  for (const [kind, list] of [['appeared', maskedAppeared], ['gone', maskedGone]]) {
    if (!list.length) continue;
    const A = list.slice(0, 6); const x0 = Math.min(...A.map((c) => c.rect.x)), y0 = Math.min(...A.map((c) => c.rect.y));
    const x1 = Math.max(...A.map((c) => c.rect.x + c.rect.w)), y1 = Math.max(...A.map((c) => c.rect.y + c.rect.h));
    regions.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, pixels: null, kind, masked: true, changed: A, top: [], media: masked.media });
  }
  const out = { verdict: regions.some((g) => g.kind === 'stuck') ? 'FAIL' : 'WARN', share: r.share, liveSkipped: r.liveSkipped, masked, maskedLive, maskedLoad, regions };
  await staleCrop(ctx.bufFirst, bufRet, regions, ctx.dpr, cropFile).then(() => { out.crop = path.basename(cropFile); }).catch(() => {});
  return out;
}

function printReturn(label, st) {
  if (!st) return;
  const M = st.masked;
  const maskNote = M ? ` (живое место ${M.media.join(', ')} по пикселям не в счёт; поверх него сверено состояние ${M.checked} элементов${st.maskedLive ? `, меняется само ${st.maskedLive}${st.maskedLoad ? `, из них двигалось само при загрузке (вступление) ${st.maskedLoad}` : ''}` : ''})` : '';
  if (st.verdict === 'OK') { console.log(`  OK   первый экран после ${label} тот же${M ? maskNote : st.liveSkipped ? ' (живые места — холст, видео — не в счёт)' : ''}`); return; }
  if (st.note) { console.log(`  WARN первый экран после ${label}: ${st.note}`); return; }
  console.log(`  ${st.verdict.padEnd(4)} ${st.verdict === 'FAIL' ? `состояние не сбрасывается (после ${label})` : `первый экран после ${label} отличается`}: ${st.share}% пикселей${st.crop ? `, вырезка ${st.crop}` : ''}${maskNote}`);
  for (const g of st.regions) {
    const what = g.kind === 'stuck' ? (g.masked ? `залипло поверх живого места (${g.media.join(', ')}): по пикселям не видно, по стилям — да` : 'залипло') : g.kind === 'gone' ? `пропал после прокрутки — проверить, задумано ли${g.masked ? ` (поверх живого места ${g.media.join(', ')} — по стилям)` : ''}` : g.kind === 'live' ? 'меняется само (карусель, часы, вступление при загрузке) — не залипание' : g.kind === 'carousel' ? 'переключение между соседями (карусель, за наблюдение не сменилась) — не залипание, проверить вырезку' : g.kind === 'appeared' ? `проявилось только после прокрутки (при загрузке пусто)${g.masked ? `, поверх живого места (${g.media.join(', ')}) — по стилям` : ''}` : g.kind === 'media' ? `холст или видео (${g.media.join(', ')})` : 'причина по стилям не видна — смотреть вырезку';
    const list = g.changed.length ? g.changed.slice(0, 4).map((c) => `${c.sig}${c.text ? ` «${c.text}»` : ''}: ${c.diffs.join(', ')}`).join(' | ') : g.top.slice(0, 3).join(' | ');
    console.log(`       x${g.x} y${g.y} ${g.w}×${g.h}: ${what} — ${list}`);
  }
}

/* функции страницы видят их как свободные переменные (evaluateWith) */
const DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN, liveTest: liveTestInPage.toString(), stateDiff: stateDiffInPage.toString(), cause: causeInPage.toString(), swaps: markSwaps.toString(), rank: rankChange.toString() };

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
        /* то же для состояния элементов: что у них изменилось само за эти 700 мс (вступление на JS ещё шло
           при первом снимке), при сверке под маской живого места не в счёт */
        const loadMotion = await evaluateWith(page, loadMotionInPage, null, DEPS).catch((e) => ({ moved: null, error: String(e && e.message || e).slice(0, 200) }));
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
        index.push({ url, page: slug, viewport: name, width: vp.width, height: h, dpr, first: path.basename(first), firstReturn: stale ? path.basename(firstReturn) : null, firstUp: staleUp ? path.basename(firstUp) : null, full: path.basename(full), fullMode: how, segments: (sc.shots || []).map((s) => ({ file: s.file, y: s.scrollY, pendingMedia: s.media ? s.media.pending : null })), sheet: sc.sheet, scroll: { pageHeight: sc.pageHeight, maxScrollY: sc.maxScrollY, reachedBottom: sc.reachedBottom, stuck: sc.stuck }, stale, staleUp, liveElements: ctx.liveCount ?? null, liveWatch: ctx.watch || null, firstState: { elements: firstInfo ? firstInfo.count : 0, loadMotion }, consoleErrors: errors });
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
