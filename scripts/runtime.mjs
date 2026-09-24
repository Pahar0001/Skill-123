#!/usr/bin/env node
/**
 * Проверка в живом браузере того, что статикой не проверить: консоль, холсты
 * (рисуют ли и резкие ли), клики и их настоящий эффект, поля с маской, наведение,
 * меню, анимации, видео, выброшенный браузером CSS, переполнение по ширине.
 *
 *   node runtime.mjs <url> [--viewport mobile] [--out папка] [--tag имя]
 *        [--reduced-motion] [--scheme dark] [--cpu 4] [--no-fail] [--init "js"]
 *   node runtime.mjs [шаги и настройки] -- <url>      «--» — конец флагов, дальше только адрес
 *
 *   --viewport  desktop | laptop | tablet | mobile | mobile-s (320×568@2) | android (360×800@3)
 *               | ШxВ@плотность («320x568@2») | одна ширина («320»)
 *               --viewports — то же самое. Экран один за запуск: список «mobile,desktop» —
 *               ошибка (код 2), запускайте по разу на экран
 *
 *   значения: шаг или настройка берёт следующее слово, если это не шаг, не флаг этого
 *   скрипта и не «--»: «--hover --scroll» и «--hover --» — ошибка «--hover: нужно
 *   значение» (код 2). Значение, которое начинается с «--», пишется через «=»:
 *   --hover="--x". Флаги без значения тоже пишутся через «=»: =0, false, no, off, нет —
 *   выключено, любое другое значение — включено. Настройка (--no-fail, --reduced-motion):
 *   --no-fail=0 — провалы снова дают код 1. Шаг (--scroll, --css, --canvas…): --scroll=0
 *   и --css=нет — шаг не выполняется (строка об этом в stderr).
 *   Неизвестный флаг — и --foo, и с одним дефисом (-v; -h — справка) — предупреждение WARN
 *   в stderr, запуск продолжается. Известный флаг с одним дефисом («-viewport mobile») —
 *   ошибка (код 2) «флаг пишется с двумя дефисами»: иначе прогон молча шёл бы на desktop.
 *   Настройка дважды с разными значениями (--viewport, --out, --tag, --scheme, --cpu) —
 *   ошибка (код 2); --wait — не больше 600000 мс.
 *   Следующее слово он забирает значением, только
 *   если это не флаг, не «--» и не адрес (http, https, file, data, about):
 *   «--strict http://localhost:4177/ --css» — WARN про --strict, адрес на месте.
 *   Все ошибки аргументов — до папок и браузера.
 *
 *   «--» — конец флагов: следующее слово — адрес, даже если начинается с «-» («-- -h» —
 *   адрес «-h», не справка). Слова после адреса — ошибка (код 2), поэтому --out, --tag
 *   и шаги пишутся ДО «--»: node runtime.mjs --out папка --css -- http://localhost:4177/
 *
 *   шаги, выполняются в порядке записи:
 *        --wait 800            подождать столько миллисекунд (число ≥ 0, «0» — не ждать;
 *                              не число — код 2)
 *        --scroll              прокрутить до конца: появления, закреплённые, переполнение
 *                              по элементам (FAIL — торчит за край или можно уехать вбок;
 *                              WARN — страница шире окна, текст шире коробки, обрезан панелью)
 *        --hover "sel"         навести и записать, что изменилось в стилях (и почему нет)
 *        --hover-all           каждое правило :hover из CSS: меняет ли объявленное; мёртвое —
 *                              FAIL с причиной (держит анимация fill both/forwards, перебито)
 *        --click "sel"         кликнуть: эффект — изменения DOM (MutationObserver), адрес,
 *                              запросы, фокус на другом элементе, диалоги. Своя прокрутка и
 *                              фокус на нажатом — не эффект. Кнопка без эффекта — FAIL.
 *                              Якорь «#id»: дождаться остановки прокрутки и сверить верх цели
 *        --type "sel=текст"    ввести текст и проверить, что он в поле (tel: 8… = +7…);
 *                              делится по первому «=» вне [ ], ( ) и кавычек:
 *                              --type "input[name=phone]=89001234567"
 *        --edit "sel"          поле с маской: набор, Backspace до конца, правка в середине,
 *                              Delete, вставка «8 (900) …», Ctrl+A+Backspace
 *        --key Tab             нажать клавишу: где фокус, значение и курсор поля
 *        --select "sel=знач"   выбрать вариант списка (value или текст варианта); делится так же,
 *                              как --type: "select[name=work]=6", "#sel=a=b" → вариант «a=b»
 *        --resize 1152         сменить ширину окна (или ШxВ — 834x1112, 834X1112, 834×1112;
 *                              или rotate — повернуть); ширина и высота больше 0
 *        --canvas              холсты: рисует ли (снимок с холстом и без), меняется ли кадр,
 *                              резкость буфера: FAIL — буфер меньше 0.85 ширины в CSS px,
 *                              WARN — меньше 0.85 от ширины × DPR, 2D с искажёнными пропорциями
 *        --motion              анимации: идут, бесконечные, закончились и держат свойство;
 *                              «меньше движения» — в отдельной вкладке
 *        --video               видео: poster, muted/playsinline, играет ли, пауза вне экрана
 *                              и при «меньше движения»
 *        --nav                 меню: подсвеченный пункт ведёт на раздел, который на экране
 *                              (верх, каждый раздел, низ, снова верх)
 *        --css                 объявления CSS, которые браузер выбросил: файл:строка
 *        --eval "js"           выполнить выражение (можно Promise) и записать результат;
 *                              сразу за ним --expect "значение" — FAIL, если не совпало
 *        --assert "js"         FAIL, если результат ложный или Promise отклонён
 *        --shot имя            снимок экрана
 *        --fullpage            снимок всей страницы
 *   после --click, --select и --resize холсты и переполнение перепроверяются сами
 *   (после конца переходов).
 *   не шаги, а настройки:
 *        --init "js"           код до всех скриптов страницы (например, PerformanceObserver)
 *        --cpu 4               процессор в N раз медленнее
 *        --scheme light|dark   цветовая схема (по умолчанию light)
 *        --out папка, --tag имя  папка прогона и имя протокола
 *        --no-fail             код выхода 0 даже при провалах
 *        -h, --h, --help       эта справка (ничего не создаёт и не запускает); --help=… —
 *                              тоже справка. Ищется только до «--»: после него — адрес
 *
 * Выход: <папка>/runtime/<tag>.json, снимки рядом и протокол с вердиктами
 * OK / WARN / FAIL. Коды выхода:
 *   0 — провалов нет (WARN код не меняет) или задан --no-fail; справка;
 *   1 — ошибки консоли или проваленные шаги; нет адреса (если адрес ушёл значением флага,
 *       сообщение это называет); неверный адрес; неизвестный экран; страница не открылась;
 *   2 — ошибка в аргументах, до папок и браузера:
 *       · нет значения: шаг или настройка — последнее слово, следующим идёт шаг, флаг
 *         или «--», пустое значение («--tag ""», «--shot=»);
 *       · «--expect» не сразу за «--eval»;
 *       · --type / --select без «=» или с пустым селектором;
 *       · --resize — не ширина больше 0, не ШxВ и не rotate;
 *       · --wait — не число миллисекунд ≥ 0;
 *       · --scheme — не light, dark или no-preference;
 *       · --cpu — не число больше 0;
 *       · --viewport / --viewports: список экранов через запятую, пустое значение
 *         или разные экраны у --viewport и --viewports;
 *       · лишние слова после адреса — в том числе после «--».
 * 404 на /favicon.ico — WARN «нет favicon», не провал загрузки.
 *
 * Вердикт OK означает «в браузере произошло то, что ожидалось». Красиво ли
 * это — отвечает только снимок, открытый глазами.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launch, preparePage, gotoRetry, waitForOverlay, scrollThrough, fullPageShot, resolveViewport, runDir, writeJson, sleep, ensureDir, loadSharp,
  scrollToY, settleAnimations, findOverflow, canvasList, evaluateWith, SIG_FN, EFFECTIVE_OPACITY_FN,
} from './lib.mjs';

/* ---------- аргументы: шаги в порядке записи ---------- */
const argv = process.argv.slice(2);
const STEP = new Set(['wait', 'scroll', 'hover', 'hover-all', 'click', 'type', 'edit', 'key', 'select', 'resize', 'canvas', 'motion', 'video', 'nav', 'css', 'eval', 'expect', 'assert', 'shot', 'fullpage']);
/* без значения: шаги-флаги и настройки-флаги */
const FLAG = new Set(['scroll', 'hover-all', 'canvas', 'motion', 'video', 'nav', 'css', 'fullpage', 'reduced-motion', 'no-fail', 'help', 'h']);
/* настройки со значением */
const OPTS = new Set(['viewport', 'viewports', 'out', 'tag', 'scheme', 'cpu', 'init']);
const usage = (msg) => { console.error(msg); process.exit(2); };
const short = (s, n = 60) => String(s).replace(/\s+/g, ' ').slice(0, n);
/* имя флага из слова: «--scroll», «--scroll=1» → scroll; «-h» → h; не флаг → null */
const nameOf = (s) => { s = String(s); if (s === '-h') return 'h'; if (!s.startsWith('--') || s === '--') return null; const k = s.slice(2); const e = k.indexOf('='); return e > 0 ? k.slice(0, e) : k; };
const isKnown = (s) => { const n = nameOf(s); return n != null && (STEP.has(n) || FLAG.has(n) || OPTS.has(n)); };

/* справка — до всего остального: без адреса, папок и браузера. Смотрим только слова до «--»:
   после него идёт адрес, и «-- -h» — это адрес «-h», а не справка. --help=… — тоже справка */
const endOfFlags = argv.indexOf('--');
if ((endOfFlags < 0 ? argv : argv.slice(0, endOfFlags)).some((a) => a === '-h' || /^--(help|h)(=|$)/.test(String(a)))) {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
  process.exit(0);
}

/* «селектор=значение»: первый «=» вне [..], (..), кавычек и после «\» —
   input[name=phone]=8900… → input[name=phone] | 8900…; #sel=знач=ение → #sel | знач=ение */
function splitSelEq(s) {
  s = String(s); let br = 0, par = 0, q = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === '\\') { i++; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '[') br++;
    else if (ch === ']') br = Math.max(0, br - 1);
    else if (ch === '(') par++;
    else if (ch === ')') par = Math.max(0, par - 1);
    else if (ch === '=' && br === 0 && par === 0) return [s.slice(0, i), s.slice(i + 1)];
  }
  return null;
}

/* слово, которое разбирается как адрес этого скрипта: неизвестный флаг его значением не забирает */
const isUrlWord = (s) => { try { return /^(https?|file|data|about):$/.test(new URL(String(s)).protocol); } catch { return false; } };
const FALSE_RE = /^(0|false|no|off|нет)$/i;

const steps = []; const opt = {}; const pos = []; const unknown = []; const off = [];
const ONCE = new Set(['viewport', 'viewports', 'out', 'tag', 'scheme', 'cpu']);
const taken = []; /* значения, взятые следующим словом: [флаг, слово] — для подсказки «адрес ушёл значением» */
for (let i = 0; i < argv.length; i++) {
  const a = String(argv[i]);
  if (a === '--') { pos.push(...argv.slice(i + 1).map(String)); break; }
  if (!a.startsWith('-')) { pos.push(a); continue; }
  /* неизвестный флаг: «--foo», «--foo=1» и любое слово с одним дефисом («-v», «-o»; «-h» — справка, выше).
     Значение — следующее слово, только если это не флаг, не «--» и не адрес: «--strict U --css»
     не съедает адрес (раньше — «Нужен адрес»), «-v U» — не «лишние слова после адреса» */
  const single = !a.startsWith('--');
  let k = single ? a : a.slice(2); let v;
  const eqI = k.indexOf('=');
  if (!single && eqI > 0) { v = k.slice(eqI + 1); k = k.slice(0, eqI); }
  if (single || !(STEP.has(k) || FLAG.has(k) || OPTS.has(k))) {
    const shown = single ? (eqI > 0 ? a.slice(0, eqI) : a) : `--${k}`;
    if (v === undefined && !(single && eqI > 0)) {
      const next = argv[i + 1];
      if (next !== undefined && next !== '--' && !String(next).startsWith('-') && !isUrlWord(next)) { v = String(argv[++i]); taken.push([shown, v]); }
    }
    /* «-viewport mobile» — опечатка в дефисах у известного флага: подсказать, иначе запуск тихо идёт на desktop */
    unknown.push({ shown, word: v !== undefined && !(eqI > 0) ? v : null, guess: single && isKnown(`-${shown}`) ? `-${shown}` : null });
    continue;
  }
  if (v !== undefined) {
    if (FLAG.has(k)) {
      const on = !FALSE_RE.test(String(v).trim());
      /* шаг-флаг: --scroll=0, --css=нет — шаг выключен и не выполняется; --scroll=1 — выполняется */
      if (STEP.has(k)) { if (!on) { off.push(a); continue; } v = true; }
      else v = on; /* --no-fail=0 — выключено */
    }
  } else if (FLAG.has(k)) v = true;
  else {
    /* значение — следующее слово, если это не шаг, не флаг этого скрипта и не «--»:
       «--hover --scroll» и «--hover --» — ошибка, а не селектор «--scroll» или «--» */
    const next = argv[i + 1];
    if (next === undefined || next === '--' || isKnown(next)) {
      usage(`--${k}: нужно значение${next === undefined ? ' — это последнее слово в команде' : next === '--' ? ` — следующим идёт «--», а это конец флагов (после него только адрес); значение «--» пишите через «=»: --${k}="--"` : ` — следующим идёт «${next}», а это ${STEP.has(nameOf(next)) ? 'шаг' : 'флаг'}; значение, которое начинается с «--», пишите через «=»: --${k}="${next}"`}`);
    }
    v = String(argv[++i]); taken.push([`--${k}`, v]);
  }
  if (k === 'expect') {
    const prev = steps[steps.length - 1];
    if (!prev || prev.k !== 'eval') usage('--expect пишется сразу после --eval');
    prev.expect = v; continue;
  }
  if (STEP.has(k)) steps.push({ k, v });
  else {
    /* настройка дважды с разными значениями («--viewport mobile --viewport desktop») — раньше молча бралась последняя */
    if (ONCE.has(k) && opt[k] !== undefined && String(opt[k]).trim() !== String(v).trim()) usage(`--${k} задан дважды: «${opt[k]}» и «${v}» — оставьте один (runtime проверяет один экран за запуск)`);
    opt[k] = v;
  }
}
for (const u of unknown) console.error(`WARN неизвестный флаг ${u.shown} — не используется${u.word != null ? ` вместе со словом «${short(u.word, 60)}», которое он забрал значением` : ''}${u.guess ? ` — может быть, ${u.guess}?` : ''} (-h — список шагов и настроек)`);
/* известный флаг с одним дефисом («-viewport mobile») — не опечатка, которую можно пропустить: запуск молча
   шёл бы с настройками по умолчанию (desktop), и протокол врал бы об экране */
const typo = unknown.find((u) => u.guess);
if (typo) usage(`${typo.shown} — флаг пишется с двумя дефисами: ${typo.guess}`);
for (const a of off) console.error(`шаг ${a} выключен значением после «=» — не выполняется`);
const url = pos[0];
if (!url) {
  /* адрес ушёл значением флага: «--out http://… --css», «--foo localhost:4177» — назвать это прямо */
  const asUrl = taken.find(([, w]) => isUrlWord(w)); const byUnknown = taken.find(([f]) => !isKnown(f));
  const why = asUrl ? ` — «${short(asUrl[1], 80)}» стоит значением ${asUrl[0]}; у ${asUrl[0]} должно быть своё значение, адрес — отдельным словом`
    : byUnknown ? ` — слово «${short(byUnknown[1], 80)}» забрал значением неизвестный флаг ${byUnknown[0]}; если это адрес, пишите его полностью (http://…) или после «--»`
      : '';
  console.error(`Нужен адрес${why}: node runtime.mjs <url> [--viewport mobile] [--scroll] [--click sel] [--canvas] [--motion] ... (-h, --help — все шаги)`); process.exit(1);
}
if (pos.length > 1) usage(`лишние слова после адреса: ${pos.slice(1).map((p) => `«${p}»`).join(', ')} — шаги и настройки пишутся с «--» (--hover "sel"), значение с пробелами — в кавычках`);
let urlOk = null; try { urlOk = new URL(url); } catch { /* ниже */ }
if (!urlOk || !/^(https?|file|data|about):$/.test(urlOk.protocol)) {
  const hint = fs.existsSync(url) ? ` (файл на диске: file:///${path.resolve(url).replace(/\\/g, '/')})` : /^-/.test(url) ? ' (похоже на флаг: после «--» идёт только адрес — флаги и -h пишите до «--»)' : /^[\w.-]+(:\d+)?(\/|$)/.test(url) ? ` (например, http://${url})` : '';
  console.error(`Неверный адрес «${url}» — нужен полный: http://…, https://… или file:///…${hint}`); process.exit(1);
}
/* --resize: ширина «1152», ШxВ «834x1112» (x, X, ×, *) или rotate/поворот. Одно выражение
   и для проверки аргументов, и для шага: проверка не пропускает того, что шаг отвергнет;
   0 — ошибка (setViewport с нулём молча оставляет прежнее окно, и шаг врал бы «OK окно 0×0») */
const RESIZE_RE = /^(?:(rotate|поворот)|(\d+)(?:[x×*](\d+))?)$/i;
const parseResize = (v) => {
  const m = RESIZE_RE.exec(String(v).trim()); if (!m) return null;
  if (m[1]) return { rotate: true };
  const w = Number(m[2]), h = m[3] === undefined ? null : Number(m[3]);
  return w > 0 && (h === null || h > 0) ? { w, h } : null;
};
const RESIZE_HELP = 'нужна ширина больше 0 («1152»), ШxВ («834x1112», x или ×) или rotate';
/* «834х1112» с русской «х» выглядит верно, но не разбирается — назвать это в сообщении */
const cyrX = (v) => (/^\s*\d+\s*[хХ]\s*\d+/.test(String(v)) ? ' — между числами русская «х», нужна латинская x' : '');
/* --wait: миллисекунды, целое или дробное число ≥ 0 */
const WAIT_RE = /^\d+(?:\.\d+)?$/;

/* значения шагов — до папок и браузера */
const NEEDS_VALUE = new Set(['wait', 'hover', 'click', 'type', 'edit', 'key', 'select', 'resize', 'shot', 'eval', 'assert']);
for (const s of steps) {
  if (NEEDS_VALUE.has(s.k) && (s.v === true || s.v === undefined || String(s.v).trim() === '')) usage(`--${s.k}: нужно значение`);
  if (s.k === 'wait' && !WAIT_RE.test(String(s.v).trim())) usage(`--wait ${s.v}: нужно число миллисекунд ≥ 0 (--wait 800)`);
  /* больше 2^31 мс setTimeout срабатывает сразу, а протокол писал бы «ждали …» — предел 10 минут */
  if (s.k === 'wait' && Number(String(s.v).trim()) > 600000) usage(`--wait ${s.v}: не больше 600000 мс (10 минут)`);
  if (s.k === 'type' || s.k === 'select') {
    const p = splitSelEq(s.v);
    if (!p || !p[0].trim()) usage(`--${s.k} "${s.v}": нужно «селектор=${s.k === 'type' ? 'текст' : 'значение'}» (делится по первому «=» вне [ ] и кавычек: ${s.k === 'type' ? 'input[name=phone]=89001234567' : 'select[name=work]=6'})`);
  }
  if (s.k === 'resize' && !parseResize(s.v)) usage(`--resize ${s.v}: ${RESIZE_HELP}${cyrX(s.v)}`);
}
for (const k of ['out', 'tag', 'scheme', 'cpu', 'init']) if (opt[k] !== undefined && String(opt[k]).trim() === '') usage(`--${k}: нужно значение`);
if (opt.scheme !== undefined && !/^(light|dark|no-preference)$/.test(String(opt.scheme))) usage(`--scheme ${opt.scheme}: нужно light, dark или no-preference`);
if (opt.cpu !== undefined && !(Number(opt.cpu) > 0)) usage(`--cpu ${opt.cpu}: нужно число — во сколько раз замедлить процессор (4)`);
/* экран: --viewport и --viewports — одно и то же; runtime проверяет один экран за запуск */
const vpGiven = ['viewport', 'viewports'].filter((k) => opt[k] !== undefined).map((k) => [k, String(opt[k]).trim()]);
if (vpGiven.length === 2 && vpGiven[0][1] !== vpGiven[1][1]) usage(`заданы и --viewport ${vpGiven[0][1]}, и --viewports ${vpGiven[1][1]} — это один флаг; runtime проверяет один экран за запуск`);
const [vpFlag, vpRaw] = vpGiven[0] || ['viewport', 'desktop'];
const vpList = vpRaw.split(',').map((x) => x.trim()).filter(Boolean);
if (!vpList.length) usage(`--${vpFlag}: нужно значение`);
if (vpList.length > 1) usage(`--${vpFlag} ${vpRaw}: runtime проверяет один экран за запуск — запустите по разу на каждый (${vpList.map((x) => `--viewport ${x}`).join(', затем ')}); несколько экранов за один запуск снимает shots.mjs`);
const resolved = resolveViewport(vpList[0]);
if (!resolved) { console.error(`Неизвестный экран ${vpList[0]}${cyrX(vpList[0])}. Есть: desktop, laptop, tablet, mobile, mobile-s, android, ШxВ@плотность`); process.exit(1); }
const [vpName, vp] = resolved;
let cur = { ...vp };
const run = runDir(opt, url);
const outDir = ensureDir(path.join(run, 'runtime'));
const tag = opt.tag || `${vpName}${opt['reduced-motion'] ? '-reduced' : ''}`;
const DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN };
const effOf = new Function('el', `return (${EFFECTIVE_OPACITY_FN})(el);`);

const STATE_PROPS = ['color', 'backgroundColor', 'borderTopColor', 'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'outlineStyle', 'outlineColor', 'filter', 'letterSpacing', 'scale', 'translate', 'rotate'];

const report = { url, viewport: vpName, size: `${vp.width}×${vp.height}@${vp.deviceScaleFactor || 1}`, tag, reducedMotion: !!opt['reduced-motion'], startedAt: new Date().toISOString(), steps: [], console: null, verdict: null };
let fails = 0, warns = 0;
/* вид текущего шага — в протокол: state.mjs отличает запись (eval без --expect, снимок) от проверки */
let curKind = 'load';
const line = (status, what, details, data) => {
  if (status === 'FAIL') fails++; if (status === 'WARN') warns++;
  console.log(`${status.padEnd(4)} ${what}${details ? ' — ' + details : ''}`);
  report.steps.push({ status, kind: curKind, what, details, ...(data ? { data } : {}) });
};
let shotN = 0;
const shot = async (name) => { const file = path.join(outDir, `${tag}-${String(++shotN).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: file }); return path.basename(file); };
/* одинаковые строки — одной, со счётчиком: «Cannot read … ×20» */
const uniqCount = (list, max = 4) => { const m = new Map(); for (const t of list) m.set(t, (m.get(t) || 0) + 1); const arr = [...m.entries()]; return arr.slice(0, max).map(([t, n]) => `${t}${n > 1 ? ` ×${n}` : ''}`).join(' | ') + (arr.length > max ? ` и ещё ${arr.length - max} разных` : ''); };

/* ---------- страница ---------- */
const browser = await launch();
let page;
const reqLog = [];
try {
  page = await preparePage(browser, vp, { scheme: opt.scheme || 'light', reducedMotion: !!opt['reduced-motion'] });
  page.on('request', (r) => { if (reqLog.length < 5000) reqLog.push({ t: Date.now(), type: r.resourceType(), url: r.url().slice(0, 160) }); });
  if (Number(opt.cpu) > 1) { const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt.cpu) }); }
  if (opt.init) await page.evaluateOnNewDocument(String(opt.init));
  await gotoRetry(page, url);
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  page.overlay = await waitForOverlay(page, 5000);
  await sleep(500);
} catch (e) { console.error(`FAIL открыть ${url}: ${e.message}`); await browser.close(); process.exit(1); }
if (page.retries) line('WARN', 'соединение', `страница открылась с ${page.retries + 1}-й попытки${page.gotoInfo && page.gotoInfo.waitUntil === 'domcontentloaded' ? ', только DOMContentLoaded' : ''} — сервер или сеть отвечают нестабильно`);

/* 404 на /favicon.ico браузер пишет в консоль как «Failed to load resource» без адреса —
   столько же таких строк не считаем ошибками страницы (C22) */
const favFails = () => page.log.failed.filter((f) => /\/favicon\.ico(\?|#|$)/i.test(f.url)).length;
const realConsole = () => { let fav = favFails(); return page.log.console.filter((c) => c.type === 'error').filter((c) => { if (fav > 0 && /Failed to load resource/i.test(c.text)) { fav--; return false; } return true; }); };
const errCount = () => realConsole().length + page.log.errors.length;
const loadErrors = errCount();
line(loadErrors ? 'FAIL' : 'OK', `загрузка ${url} (${vpName} ${report.size}${opt['reduced-motion'] ? ', меньше движения' : ''})`, loadErrors ? `${loadErrors} ошибок в консоли: ${uniqCount([...realConsole().map((c) => c.text), ...page.log.errors].map((t) => short(t, 120)), 3)}` : `ошибок в консоли нет, ${page.log.requests.length} запросов`);
if (favFails()) line('WARN', 'нет favicon', '/favicon.ico отвечает 404 — вкладка без значка; в провал загрузки не считается');
const otherFailed = page.log.failed.filter((f) => !/\/favicon\.ico(\?|#|$)/i.test(f.url));
if (otherFailed.length) line('WARN', 'упавшие запросы', otherFailed.slice(0, 4).map((f) => `${f.reason} ${f.url.split('/').pop().slice(0, 50)}`).join('; '));
if (page.overlay.hadOverlay) line(page.overlay.gone ? 'OK' : 'WARN', `заставка ${page.overlay.overlay} при загрузке`, page.overlay.gone ? `ушла через ${page.overlay.waitedMs} мс` : `не ушла за ${page.overlay.waitedMs} мс — закрывает страницу`);

/* ---------- общие помощники ---------- */
const readState = (h) => h.evaluate((el, props) => { const s = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, s[p]])); }, STATE_PROPS);
const diffState = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${short(a[k], 28)} → ${short(b[k], 28)}`);
const snapshot = () => evaluateWith(page, () => ({
  url: location.href, title: document.title,
  dialogs: [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && eff(el) > 0.05; }).length,
  expanded: document.querySelectorAll('[aria-expanded="true"]').length,
  active: document.activeElement && document.activeElement !== document.body ? sig(document.activeElement) : null,
  scrollY: Math.round(scrollY),
}), null, DEPS);
/* первое видимое совпадение (итоговая прозрачность с предками): «.btn» часто первым даёт скрытую кнопку меню */
const find = async (sel) => {
  let list = []; try { list = await page.$$(sel); } catch { find.info = { total: 0, bad: true }; return null; }
  find.info = { total: list.length };
  const visible = (h) => h.evaluate((el, f) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && new Function('el', `return (${f})(el);`)(el) > 0.05; }, EFFECTIVE_OPACITY_FN).catch(() => false);
  for (const h of list) if (await visible(h)) return h;
  /* прозрачен, но с размером — возможно, блок появления ещё не показан: прокрутить к нему и дождаться перехода */
  for (const h of list.slice(0, 3)) {
    const sized = await h.evaluate((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).catch(() => false);
    if (!sized) continue;
    await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
    await sleep(300); await settleAnimations(page, 2500);
    if (await visible(h)) return h;
  }
  return null;
};
const notFound = () => (find.info && find.info.bad ? 'селектор не разобран' : find.info && find.info.total ? `найдено ${find.info.total}, но все невидимы` : 'элемент не найден');

/* наблюдение за DOM во время действия: атрибуты, узлы, текст — сигнатурами «вид|атрибут|элемент» */
const startWatch = () => evaluateWith(page, () => {
  if (window.__rwObs) window.__rwObs.disconnect();
  const list = []; window.__rwMut = list;
  window.__rwObs = new MutationObserver((ms) => {
    for (const m of ms) {
      if (list.length > 600) return;
      if (m.type === 'attributes' && /^data-rw/.test(m.attributeName || '')) continue;
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (!t) continue;
      if (t.closest && t.closest('style[data-rw]')) continue;
      list.push({ type: m.type, attr: m.attributeName || null, el: sig(t), added: m.addedNodes ? m.addedNodes.length : 0, removed: m.removedNodes ? m.removedNodes.length : 0 });
    }
  });
  window.__rwObs.observe(document.documentElement, { attributes: true, childList: true, subtree: true, characterData: true });
  return true;
}, null, DEPS);
const takeWatch = () => page.evaluate(() => { const l = window.__rwMut || []; if (window.__rwObs) window.__rwObs.disconnect(); window.__rwObs = null; return l; });
const mutKey = (m) => `${m.type}|${m.attr || ''}|${m.el}`;
const describeMuts = (ms) => {
  const attrs = {}; let added = 0, removed = 0, text = 0;
  for (const m of ms) { if (m.type === 'attributes') { const k = `${m.attr} у ${m.el}`; attrs[k] = (attrs[k] || 0) + 1; } else if (m.type === 'childList') { added += m.added; removed += m.removed; } else text++; }
  const parts = Object.keys(attrs).slice(0, 4).map((k) => `${k}${attrs[k] > 1 ? ` ×${attrs[k]}` : ''}`);
  if (Object.keys(attrs).length > 4) parts.push(`ещё ${Object.keys(attrs).length - 4} атрибутов`);
  if (added || removed) parts.push(`узлов +${added} −${removed}`);
  if (text) parts.push(`текст ×${text}`);
  return parts.join('; ');
};

/* после действия: холсты (резкость) и переполнение — по конечному состоянию */
let scrolled = false;
const sharpness = (c) => {
  const bad = []; let st = 'OK';
  if (c.ratioCss != null && c.ratioCss < 0.85) { st = 'FAIL'; bad.push(`буфер ${c.width}×${c.height} на ${c.clientWidth}×${c.clientHeight} CSS px → ×${c.ratioCss} — РАЗМЫТ на любом экране`); }
  else if (c.ratioDevice != null && c.ratioDevice < 0.85) { st = 'WARN'; bad.push(`буфер ×${c.ratioDevice} от ширины × DPR ${c.dpr} — мягче, чем мог бы (для WebGL бывает нарочно)`); }
  if (c.ctx === '2d' && c.aspectOff > 4) { if (st === 'OK') st = 'WARN'; bad.push(`пропорции буфера и показа расходятся на ${c.aspectOff}% — растянут`); }
  return { st, bad };
};
/* печатается только то, что изменилось с прошлой автопроверки: одна и та же размытость
   после каждого следующего клика — не новый провал */
const lastAuto = { canvas: null, overflow: null, canvasAt: '', overflowAt: '' };
async function autoCheck(after) {
  await sleep(150); const waited = await settleAnimations(page, 3000);
  const list = (await canvasList(page).catch(() => [])).filter((c) => c.clientWidth > 0 && c.clientHeight > 0 && c.opacity > 0.05 && c.ctx);
  if (list.length) {
    const judged = list.map((c) => ({ c, ...sharpness(c) }));
    const worst = judged.some((j) => j.st === 'FAIL') ? 'FAIL' : judged.some((j) => j.st === 'WARN') ? 'WARN' : 'OK';
    const bad = judged.filter((j) => j.st !== 'OK');
    const key = `${worst}|${bad.map((j) => `${j.c.sig}:${j.c.width}x${j.c.height}/${j.c.clientWidth}x${j.c.clientHeight}`).join(',')}`;
    if (key !== lastAuto.canvas) {
      line(worst, `холсты ${after} (переходы кончились через ${waited} мс)`, bad.length ? bad.slice(0, 5).map((j) => `${j.c.sig}: ${j.bad.join('; ')}`).join(' | ') + (bad.length > 5 ? ` и ещё ${bad.length - 5}` : '') : `${list.length} шт., минимум ×${Math.min(...list.map((c) => c.ratioCss ?? 9))} от CSS px${lastAuto.canvas && !lastAuto.canvas.startsWith('OK') ? ` — после «${lastAuto.canvasAt}» было хуже, теперь резко` : ''}`);
      lastAuto.canvas = key; lastAuto.canvasAt = after;
    }
  }
  const ov = await findOverflow(page).catch(() => null);
  if (ov) {
    const key = `${ov.verdict}|${ov.vw}|${(ov.outer || []).map((o) => o.sig).join(',')}`;
    if (key !== lastAuto.overflow && (ov.verdict !== 'OK' || (lastAuto.overflow && !lastAuto.overflow.startsWith('OK')))) line(ov.verdict, `переполнение ${after} на ${ov.vw}px`, ov.summary);
    lastAuto.overflow = key; lastAuto.overflowAt = after;
  }
}

/* ---------- шаги ---------- */
async function scrollStep() {
  await evaluateWith(page, () => {
    document.querySelectorAll('[data-rw-hidden]').forEach((e) => e.removeAttribute('data-rw-hidden'));
    const infinite = new Set(document.getAnimations().filter((a) => a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity && a.effect.target).map((a) => a.effect.target));
    const moving = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (infinite.has(e)) return true; return false; };
    const vh = innerHeight; let i = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (i >= 120) break;
      const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 30) || r.top + scrollY <= vh) continue;
      const s = getComputedStyle(el); if (s.display === 'none' || s.position === 'fixed' || /hover/i.test(String(el.className))) continue;
      if (!(parseFloat(s.opacity) < 0.95 || (s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)'))) continue;
      if (moving(el) || (el.parentElement && el.parentElement.closest('[data-rw-hidden]'))) continue;
      el.setAttribute('data-rw-hidden', String(i++));
    }
  }, null, DEPS);
  const res = await scrollThrough(page, { shotsDir: outDir, tag: `${tag}-scroll`, maxShots: 6 });
  scrolled = true;
  const after = await evaluateWith(page, () => {
    const marked = [...document.querySelectorAll('[data-rw-hidden]')];
    const still = marked.filter((el) => eff(el) < 0.05).map(sig);
    const sticky = [...document.body.querySelectorAll('*')].filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position) && el.getBoundingClientRect().height > 20 && eff(el) > 0.05).slice(0, 5).map(sig);
    return { marked: marked.length, still, sticky };
  }, null, DEPS);
  const ov = await findOverflow(page);
  const st = ov.verdict === 'FAIL' ? 'FAIL' : (after.still.length || ov.verdict === 'WARN' || res.stuck || !res.reachedBottom) ? 'WARN' : 'OK';
  line(st, `прокрутка ${res.pageHeight}px, ${res.screens} экранов`, `${after.marked} блоков ждали появления, не появились: ${after.still.length}${after.still.length ? ` (${after.still.slice(0, 4).join(', ')})` : ''}${res.stuck ? ' · СТРАНИЦА НЕ ПРОКРУЧИВАЕТСЯ' : !res.reachedBottom ? ` · не доехали до низа (${res.maxScrollY}px)` : ''}${after.sticky.length ? ` · закреплены: ${after.sticky.join(', ')}` : ''} · переполнение: ${ov.verdict} — ${ov.summary}`, { overflow: { verdict: ov.verdict, outer: ov.outer, wideCauses: ov.wideCauses, textWider: ov.textWider, panelCut: ov.panelCut } });
}

async function hoverStep(v) {
  const h = await find(v);
  if (!h) return line('FAIL', `наведение ${v}`, notFound());
  await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.mouse.move(cur.width - 2, 2); await sleep(150); await settleAnimations(page, 1500);
  const base = await readState(h); await h.hover(); await sleep(150); await settleAnimations(page, 2000); await sleep(100);
  const hov = await readState(h);
  const file = await shot('hover'); const d = diffState(base, hov);
  let why = '';
  if (!d.length) why = await h.evaluate((el) => { const hold = el.getAnimations().filter((a) => { const f = a.effect.getTiming().fill; return (f === 'both' || f === 'forwards') && a.playState === 'finished'; }); return hold.length ? ` — свойства держит анимация ${hold.map((a) => `${a.animationName || 'без имени'} (fill ${a.effect.getTiming().fill})`).join(', ')}` : ''; });
  await page.mouse.move(cur.width - 2, 2);
  line(d.length ? 'OK' : 'WARN', `наведение ${v}`, d.length ? `${d.join('; ')} · ${file}` : `у самого элемента ничего не изменилось${why} (потомков проверяет --hover-all) · ${file}`);
}

/* правила :hover из CSSOM (с учётом @media и @supports): триггер — до :hover, цель — весь селектор */
function hoverRulesInPage() {
  const out = [];
  const splitTop = (s, sep) => { const parts = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === sep && d === 0) { parts.push(cur); cur = ''; } else cur += ch; } parts.push(cur); return parts.map((x) => x.trim()).filter(Boolean); };
  const walk = (list) => {
    for (const r of list) {
      if (r.type === CSSRule.MEDIA_RULE) { if (matchMedia(r.conditionText).matches) walk(r.cssRules); }
      else if (r.type === CSSRule.SUPPORTS_RULE) { if (CSS.supports(r.conditionText)) walk(r.cssRules); }
      else if (r.type === CSSRule.STYLE_RULE && /:hover/.test(r.selectorText)) {
        const props = []; for (let i = 0; i < r.style.length; i++) if (!r.style[i].startsWith('--')) props.push(r.style[i]);
        if (!props.length) continue;
        for (const sel of splitTop(r.selectorText, ',')) {
          if (!/:hover/.test(sel) || /:(not|is|where|has)\([^)]*:hover/.test(sel)) continue;
          const pseudo = (/(::?(before|after))$/.exec(sel) || [])[1] || null;
          const clean = sel.replace(/::?(before|after)$/, '');
          const idx = clean.lastIndexOf(':hover'); const rest = clean.slice(idx + 6); const cut = rest.search(/[\s>+~]/);
          const trigger = (cut < 0 ? clean : clean.slice(0, idx + 6 + cut)).replace(/:hover/g, '');
          out.push({ sel, trigger: trigger.trim(), target: clean.replace(/:hover/g, '').trim(), pseudo, props, decl: Object.fromEntries(props.map((p) => [p, r.style.getPropertyValue(p)])) });
        }
      } else if (r.cssRules && r.type !== CSSRule.KEYFRAMES_RULE) walk(r.cssRules);
    }
  };
  let unreadable = 0;
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { unreadable++; } }
  return { rules: out, unreadable };
}
async function hoverAllStep() {
  if (cur.hasTouch) return line('WARN', 'наведение всех правил', 'экран с касанием — наведения нет; проверять на desktop');
  const { rules, unreadable } = await page.evaluate(hoverRulesInPage);
  const results = [];
  const tryOne = async (r, trig) => {
    await page.mouse.move(cur.width - 2, 2); await sleep(60);
    await trig.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(200); await settleAnimations(page, 1500);
    const read = (full) => page.evaluate((target, pseudo, props, full, trigEl) => {
      let cands = [];
      try { cands = full ? [...document.querySelectorAll(full)] : [...document.querySelectorAll(target)].filter((t) => t === trigEl || trigEl.contains(t) || (t.parentElement && t.parentElement.contains(trigEl))); } catch { return []; }
      return cands.slice(0, 3).map((el) => { el.__rwProbe = el.__rwProbe || Math.random().toString(36).slice(2); const s = getComputedStyle(el, pseudo); return { id: el.__rwProbe, v: Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)])) }; });
    }, r.target, r.pseudo, r.props, full, trig);
    const before = await read(null);
    const pt = await trig.evaluate((el) => { const b = el.getBoundingClientRect(); for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.75], [0.1, 0.5], [0.9, 0.5]]) { const x = b.left + b.width * fx, y = b.top + b.height * fy; const t = document.elementFromPoint(x, y); if (t && (t === el || el.contains(t))) return { x, y }; } return null; });
    if (!pt) return { status: 'covered', why: 'элемент перекрыт другим — наведение до него не доходит' };
    await page.mouse.move(pt.x, pt.y); await sleep(100); await settleAnimations(page, 1500); await sleep(60);
    const full = r.sel.replace(/::?(before|after)$/, '');
    const after = await read(full);
    const changed = []; for (const a of after) { const b = before.find((x) => x.id === a.id); if (!b) continue; for (const p of r.props) if (a.v[p] !== b.v[p]) changed.push(`${p}: ${short(b.v[p], 30)} → ${short(a.v[p], 30)}`); }
    let why = '';
    if (!after.length) why = 'селектор с :hover не совпал ни с чем после наведения';
    else if (!changed.length) why = await page.evaluate((full, props) => { let el = null; try { el = document.querySelector(full); } catch { return ''; } if (!el) return ''; const camel = (p) => p.replace(/-([a-z])/g, (m, c) => c.toUpperCase()); const hold = el.getAnimations().filter((a) => { const f = a.effect.getTiming().fill; return (f === 'both' || f === 'forwards') && a.effect.getKeyframes().some((k) => props.some((p) => k[camel(p)] !== undefined || (p === 'transform' && (k.translate !== undefined || k.rotate !== undefined || k.scale !== undefined)))); }); return hold.length ? `держит анимация ${hold.map((a) => `${a.animationName || 'без имени'} (fill: ${a.effect.getTiming().fill}, ${a.playState})`).join(', ')} — :hover не может перебить анимированное свойство` : 'значения равны: правило перебито более сильным или совпадает с исходным'; }, full, r.props);
    await page.mouse.move(cur.width - 2, 2); await sleep(50);
    /* объявленное правилом равно тому, что и так стоит без наведения (генераторы вроде Tilda пишут
       :hover с исходным цветом) — правило пустое, а не мёртвое: сравнить через пробный элемент рядом */
    if (!changed.length && after.length) {
      const noop = await page.evaluate((full, pseudo, decl, cur) => {
        let el = null; try { el = document.querySelector(full); } catch { return false; } if (!el || !el.parentElement) return false;
        const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0';
        (pseudo ? el : el.parentElement).appendChild(probe);
        try { return Object.entries(decl).every(([p, v]) => { if (!v || /var\(|inherit|currentcolor/i.test(v)) return false; probe.style.setProperty(p, v); return getComputedStyle(probe).getPropertyValue(p) === cur[p]; }); } finally { probe.remove(); }
      }, full, r.pseudo, r.decl || {}, after[0].v).catch(() => false);
      if (noop) return { status: 'noop', changed, why: 'объявлено то же значение, что и без наведения — пустое правило' };
    }
    /* держит законченная анимация — точно ошибка; перебито другим правилом — может быть задумкой (активный пункт) */
    return { status: changed.length ? 'ok' : /^держит анимация/.test(why) ? 'dead' : 'overridden', changed, why };
  };
  for (const r of rules.slice(0, 80)) {
    let list = []; try { list = await page.$$(r.trigger); } catch { results.push({ ...r, status: 'skip', why: 'селектор не разобран' }); continue; }
    const vis = []; for (const hh of list) { if (vis.length >= 3) break; if (await hh.evaluate(effOf).catch(() => 0) > 0.05 && await hh.evaluate((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; })) vis.push(hh); }
    if (!vis.length) { results.push({ ...r, status: 'skip', why: 'нет видимого элемента' }); continue; }
    let res = null; const tried = [];
    for (const trig of vis) { res = await tryOne(r, trig); tried.push(res.status); if (res.status === 'ok') break; }
    results.push({ ...r, ...res, tried });
  }
  const dead = results.filter((x) => x.status === 'dead'); const covered = results.filter((x) => x.status === 'covered'); const noop = results.filter((x) => x.status === 'noop');
  const over = results.filter((x) => x.status === 'overridden');
  line(dead.length ? 'FAIL' : 'OK', `наведение: правил :hover ${rules.length}${rules.length > 80 ? ' (проверены первые 80)' : ''}, проверено ${results.filter((x) => /^(ok|dead|noop|overridden)$/.test(x.status)).length}, мёртвых ${dead.length}, перебитых ${over.length}${noop.length ? `, пустых ${noop.length}` : ''}${unreadable ? `, таблиц не прочитано ${unreadable}` : ''}`, dead.slice(0, 6).map((d) => `${d.sel} { ${d.props.join(', ')} } — ${d.why}`).join(' | ') + (dead.length > 6 ? ` и ещё ${dead.length - 6}` : '') || (over.length ? 'мёртвых нет; перебитые — строкой ниже' : '') || `все меняют то, что объявлено${noop.length ? ` (пустые — то же значение, что без наведения: ${noop.slice(0, 3).map((x) => x.sel).join(', ')})` : ''}`, { results });
  if (over.length) line('WARN', `наведение перебито другим правилом: ${over.length}`, over.slice(0, 5).map((d) => `${d.sel} { ${d.props.join(', ')} }`).join(' | ') + (over.length > 5 ? ` и ещё ${over.length - 5}` : '') + ' — :hover срабатывает, но значение задаёт более сильное правило; проверить, задумано ли');
  if (covered.length) line('WARN', `наведение перекрыто: ${covered.length}`, covered.map((c) => c.sel).slice(0, 6).join(', '));
}

async function clickStep(v) {
  const h = await find(v);
  if (!h) return line('FAIL', `клик ${v}`, notFound());
  const errBefore = errCount();
  await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await sleep(350); await settleAnimations(page, 2500);
  const info = await h.evaluate((el) => ({ tag: el.tagName.toLowerCase(), href: el.getAttribute('href'), type: (el.getAttribute('type') || '').toLowerCase(), role: el.getAttribute('role'), expanded: el.getAttribute('aria-expanded') }));
  const selfSig = await evaluateWith(page, (s) => { const el = document.querySelector(s); return el ? sig(el) : null; }, v, DEPS).catch(() => null);
  /* фон: что меняется само по себе (бегущая строка, таймеры) — это не эффект клика */
  await startWatch(); await sleep(500); const noise = new Set((await takeWatch()).map(mutKey));
  const before = await snapshot();
  await startWatch();
  const reqFrom = reqLog.length;
  const nav = page.waitForNavigation({ timeout: 4000 }).catch(() => null);
  try { await h.click(); } catch { await h.evaluate((el) => el.click()); }
  await Promise.race([nav, sleep(900)]); await sleep(300);
  let muts = [], after = null, navigated = false;
  try { muts = await takeWatch(); after = await snapshot(); } catch { navigated = true; await sleep(1500); after = await snapshot().catch(() => null); }
  const effect = muts.filter((m) => !noise.has(mutKey(m)) && !(m.type === 'attributes' && m.el === selfSig && /^(style|tabindex)$/.test(m.attr || '')));
  const reqs = reqLog.slice(reqFrom).filter((r) => /xhr|fetch|document|websocket|eventsource/.test(r.type));
  const changes = [];
  if (navigated || (after && after.url !== before.url)) changes.push(`адрес → ${after ? after.url : '(переход)'}`);
  if (effect.length) changes.push(`DOM: ${describeMuts(effect)}`);
  if (reqs.length) changes.push(`запросов ${reqs.length} (${[...new Set(reqs.map((r) => r.type))].join(', ')})`);
  if (after && after.dialogs !== before.dialogs) changes.push(`диалогов ${before.dialogs} → ${after.dialogs}`);
  if (after && after.expanded !== before.expanded) changes.push(`раскрытых ${before.expanded} → ${after.expanded}`);
  if (after && after.active !== before.active && after.active !== selfSig && after.active) changes.push(`фокус → ${after.active}`);
  /* якорь: дождаться, пока прокрутка встанет (3 кадра подряд, до 3 с), и сверить верх цели (C13) */
  let anchor = null;
  if (!navigated && info.href && /^#[^#]/.test(info.href)) {
    anchor = await page.evaluate(async (id) => {
      const t = document.getElementById(decodeURIComponent(id)); if (!t) return { missing: true };
      const frame = () => new Promise((r) => requestAnimationFrame(r)); let last = -1, same = 0; const t0 = performance.now();
      while (performance.now() - t0 < 3000 && same < 3) { await frame(); const y = Math.round(scrollY); if (y === last) same++; else { same = 0; last = y; } }
      const top = t.getBoundingClientRect().top; const margin = parseFloat(getComputedStyle(t).scrollMarginTop) || 0;
      const maxY = document.documentElement.scrollHeight - innerHeight; const atBottom = scrollY >= maxY - 2;
      let header = 0; for (const el of document.body.querySelectorAll('*')) { const s = getComputedStyle(el); if (s.position !== 'fixed' && s.position !== 'sticky') continue; const r = el.getBoundingClientRect(); if (r.top <= 1 && r.bottom > 0 && r.height < innerHeight * 0.4 && r.width > innerWidth * 0.5) header = Math.max(header, r.bottom); }
      return { top: Math.round(top), margin, header: Math.round(header), atBottom, waited: Math.round(performance.now() - t0), scrollY: Math.round(scrollY) };
    }, info.href.slice(1)).catch(() => null);
  }
  const file = await shot('click'); const newErr = errCount() - errBefore;
  let st, det;
  if (anchor && !anchor.missing) {
    const okTop = Math.abs(anchor.top - anchor.margin) <= 8 || (anchor.top >= -8 && anchor.top <= anchor.header + 8) || (anchor.atBottom && anchor.top >= -8 && anchor.top < cur.height);
    st = newErr ? 'FAIL' : okTop ? 'OK' : 'FAIL';
    det = `якорь ${info.href}: прокрутка встала через ${anchor.waited} мс, верх цели ${anchor.top}px от верха окна (scroll-margin ${anchor.margin}${anchor.header ? `, закреплённая шапка до ${anchor.header}px` : ''}${anchor.atBottom ? ', низ страницы' : ''})${okTop ? '' : ' — ЦЕЛЬ НЕ У ВЕРХА ОКНА'}`;
  } else {
    const buttonish = info.tag === 'button' || info.role === 'button' || info.type === 'submit' || info.type === 'button' || (info.tag === 'a' && (!info.href || info.href === '#'));
    st = newErr ? 'FAIL' : changes.length ? 'OK' : buttonish ? 'FAIL' : 'WARN';
    det = changes.join('; ') || (anchor && anchor.missing ? `якорь ${info.href}: цели с таким id нет` : `ничего не изменилось${buttonish ? ' — КНОПКА БЕЗ ЭФФЕКТА' : ''}`);
  }
  line(st, `клик ${v}`, `${det}${newErr ? ` · НОВЫХ ОШИБОК ${newErr}: ${[...realConsole().map((c) => c.text), ...page.log.errors].slice(-newErr).map((t) => short(t, 100)).join(' | ')}` : ''} · ${file}`, { mutations: effect.slice(0, 40), requests: reqs.slice(0, 10), anchor });
  if (!navigated) await autoCheck(`после клика ${v}`);
  return 'checked-errors';
}

async function typeStep(v) {
  const parts = splitSelEq(v); if (!parts) return line('FAIL', `ввод ${v}`, 'нужно «селектор=текст»');
  const [sel, text] = parts;
  const h = await find(sel);
  if (!h) return line('FAIL', `ввод в ${sel}`, notFound());
  await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await h.focus(); await h.evaluate((el) => { try { el.select(); } catch { el.value = ''; } });
  await h.type(text, { delay: 20 });
  const { val, kind } = await h.evaluate((el) => ({ val: el.value, kind: (el.getAttribute('type') || '').toLowerCase() }));
  const dig = (s) => s.replace(/\D/g, '');
  let want = dig(text); if (kind === 'tel' && want.length === 11 && want[0] === '8') want = '7' + want.slice(1); /* 8 (900)… и +7 (900)… — один номер */
  const got = dig(val);
  const digits = /\d/.test(text) && (got.endsWith(want) || (kind === 'tel' && got.endsWith(want.slice(1)) && got.length === want.length));
  const sortDigits = (s) => dig(s).split('').sort().join('');
  const dateLike = /^(date|time|datetime-local|month|week)$/.test(kind) && val !== '' && sortDigits(val) === sortDigits(text);
  const ok = val === text || digits || dateLike;
  line(ok ? 'OK' : 'FAIL', `ввод в ${sel}`, ok ? `в поле «${val}»` : `ожидали «${text}», в поле «${val}» (маска или обработчик переписывает)`);
}

/* поле с маской: всё, что делает человек, исправляя номер (C3) */
async function editStep(v) {
  const h = await find(v);
  if (!h) return line('FAIL', `правка поля ${v}`, notFound());
  await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(150);
  const kind = await h.evaluate((el) => ({ type: (el.getAttribute('type') || '').toLowerCase(), mode: (el.getAttribute('inputmode') || '').toLowerCase() }));
  const numeric = kind.type === 'tel' || /numeric|tel|decimal/.test(kind.mode);
  const sample = numeric ? '9001234567' : 'проверка';
  const chars = (s) => (numeric ? s.replace(/\D/g, '') : s.replace(/[^\p{L}\p{N}]/gu, ''));
  const val = () => h.evaluate((el) => ({ v: el.value, s: el.selectionStart }));
  const clear = async () => { await h.click({ clickCount: 3 }).catch(() => h.focus()); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await sleep(50); };
  const steps = [];
  /* а) набрать и стереть Backspace до конца: застревание — FAIL, пока осталось больше одного знака */
  await clear(); await h.type(sample, { delay: 15 }); const full = await val(); steps.push({ step: `набор ${sample}`, value: full.v });
  await page.keyboard.press('End');
  let stuck = null; const trail = [];
  for (let i = 0; i < full.v.length + 4; i++) { const b = await val(); await page.keyboard.press('Backspace'); const a = await val(); trail.push(a.v); if (a.v === b.v && chars(a.v).length > 1) { stuck = a.v; break; } if (!a.v.length) break; }
  const endBs = await val(); steps.push({ step: 'Backspace до конца', stuckAt: stuck, final: endBs.v, trail: trail.slice(0, 24) });
  const bsOk = !stuck && chars(endBs.v).length <= 1;
  line(bsOk ? 'OK' : 'FAIL', `правка ${v}: стирание Backspace`, bsOk ? `«${full.v}» стёрлось до «${endBs.v}»` : `застревает на «${stuck || endBs.v}» — Backspace удаляет разделитель, маска его возвращает`);
  /* б) правка в середине: курсор после третьей значащей позиции, Backspace, затем ввод */
  await clear(); await h.type(sample, { delay: 15 });
  const posMid = await h.evaluate((el, numeric) => { const v = el.value; let n = 0, i = 0; for (; i < v.length; i++) { if (numeric ? /\d/.test(v[i]) : /[\p{L}\p{N}]/u.test(v[i])) n++; if (n === (numeric ? 6 : 4)) { i++; break; } } el.setSelectionRange(i, i); return i; }, numeric);
  await page.keyboard.press('Backspace'); const midBs = await val();
  await page.keyboard.type(numeric ? '9' : 'ж'); const midType = await val();
  steps.push({ step: `курсор на ${posMid}, Backspace`, value: midBs.v, caret: midBs.s }, { step: 'затем ввод', value: midType.v, caret: midType.s });
  const jump = midBs.s == null ? false : Math.abs(midBs.s - (posMid - 1)) > 1 || Math.abs(midType.s - posMid) > 1 && midType.s >= midType.v.length - 1;
  line(jump ? 'FAIL' : 'OK', `правка ${v}: в середине`, `Backspace на позиции ${posMid}: «${midBs.v}», курсор ${midBs.s}; ввод: «${midType.v}», курсор ${midType.s}${jump ? ` — курсор уезжает (ждали ≈${posMid - 1} и ≈${posMid})` : ''}`);
  /* в) Delete в середине */
  await clear(); await h.type(sample, { delay: 15 });
  const posDel = await h.evaluate((el) => { const i = Math.max(1, Math.floor(el.value.length / 2)); el.setSelectionRange(i, i); return i; });
  const beforeDel = await val(); await page.keyboard.press('Delete'); const del = await val();
  steps.push({ step: `курсор на ${posDel}, Delete`, value: del.v, caret: del.s });
  const delOk = del.v !== beforeDel.v || chars(del.v) !== chars(beforeDel.v);
  line(delOk ? 'OK' : 'WARN', `правка ${v}: Delete`, `«${beforeDel.v}» → «${del.v}», курсор ${del.s}${delOk ? '' : ' — Delete ничего не удаляет'}`);
  /* г) вставка номера в другом формате (событие paste, а если поле его не обработало — ввод текста) */
  const pasteText = numeric ? '8 (900) 123-45-67' : 'Вставленный текст';
  await clear();
  await h.evaluate((el, t) => { el.focus(); const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, pasteText);
  await sleep(80); let paste = await val();
  if (!chars(paste.v).length) { await page.keyboard.sendCharacter(pasteText); await sleep(80); paste = await val(); }
  steps.push({ step: `вставка «${pasteText}»`, value: paste.v });
  const pasteOk = numeric ? chars(paste.v).length === 11 || chars(paste.v).length === 10 : chars(paste.v).length >= chars(pasteText).length - 1;
  line(pasteOk ? 'OK' : 'WARN', `правка ${v}: вставка`, `«${pasteText}» → «${paste.v}»${pasteOk ? '' : ' — номер искажён'}`);
  /* д) выделить всё и стереть */
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await sleep(50);
  const wiped = await val(); steps.push({ step: 'Ctrl+A, Backspace', value: wiped.v });
  line(chars(wiped.v).length <= 1 ? 'OK' : 'FAIL', `правка ${v}: выделить всё и стереть`, `осталось «${wiped.v}»`);
  report.edit = report.edit || []; report.edit.push({ sel: v, steps });
}

async function keyStep(v) {
  await page.keyboard.press(String(v)); await sleep(250);
  const s = await snapshot();
  const f = await page.evaluate(() => { const a = document.activeElement; if (!a || !('value' in a) || a.tagName === 'BUTTON') return null; let s = null; try { s = a.selectionStart; } catch { /* не текстовое поле */ } return { value: String(a.value).slice(0, 60), caret: s }; });
  line('OK', `клавиша ${v}`, `фокус на ${s.active || 'body'}${f ? `, в поле «${f.value}», курсор ${f.caret}` : ''}${s.dialogs ? `, диалогов ${s.dialogs}` : ''}`);
}

async function selectStep(v) {
  const parts = splitSelEq(v); if (!parts) return line('FAIL', `выбор ${v}`, 'нужно «селектор=значение»');
  const [sel, want] = parts;
  const h = await find(sel);
  if (!h) return line('FAIL', `выбор ${sel}`, notFound());
  const opts = await h.evaluate((el) => (el.options ? [...el.options].map((o) => ({ v: o.value, t: o.textContent.trim() })) : null));
  if (!opts) return line('FAIL', `выбор ${sel}`, 'это не <select>');
  const hit = opts.find((o) => o.v === want) || opts.find((o) => o.t === want) || opts.find((o) => o.t.toLowerCase().includes(want.toLowerCase()));
  if (!hit) return line('FAIL', `выбор ${sel}=${want}`, `нет такого варианта; есть: ${opts.slice(0, 8).map((o) => o.v || o.t).join(', ')}`);
  await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(300); await settleAnimations(page, 2000);
  await startWatch(); await sleep(400); const noise = new Set((await takeWatch()).map(mutKey));
  await startWatch();
  await h.select(hit.v); await sleep(500);
  const effect = (await takeWatch()).filter((m) => !noise.has(mutKey(m)));
  line(effect.length ? 'OK' : 'WARN', `выбор ${sel} = «${hit.t || hit.v}»`, effect.length ? `DOM: ${describeMuts(effect)}` : 'после выбора на странице ничего не изменилось', { mutations: effect.slice(0, 40) });
  await autoCheck(`после выбора ${sel}=${hit.v}`);
}

async function resizeStep(v) {
  let w = cur.width, hh = cur.height;
  const r = parseResize(v); if (!r) return line('FAIL', `окно ${v}`, RESIZE_HELP);
  /* «было» — окно перед этим шагом, а не начальное: после двух --resize подряд второе «было» — первое новое */
  const was = `${cur.width}×${cur.height}`;
  if (r.rotate) [w, hh] = [cur.height, cur.width];
  else { w = r.w; if (r.h !== null) hh = r.h; }
  cur = { ...cur, width: w, height: hh };
  await page.setViewport(cur); await sleep(300);
  line('OK', `окно ${w}×${hh}`, `было ${was}`);
  await autoCheck(`после смены окна на ${w}×${hh}`);
}

/* холсты: без создания контекстов (тип — из перехвата getContext в preparePage) */
async function canvasStep() {
  if (!scrolled) { await scrollThrough(page, { pause: 250 }); scrolled = true; await scrollToY(page, 0); }
  await settleAnimations(page, 3000);
  const list = await canvasList(page);
  if (!list.length) return line('WARN', 'холсты', 'на странице нет <canvas>');
  const buf = await page.evaluate(async () => {
    const out = [];
    for (const c of document.querySelectorAll('canvas')) {
      const rec = { ctx: c.__rwCtx || null, regions: null, regionsTotal: 5, filled: null, error: null };
      if (!rec.ctx || !/^(2d|webgl|webgl2)$/.test(rec.ctx) || !c.width || !c.height) { out.push(rec); continue; }
      let gl = null, c2d = null;
      try { if (rec.ctx === '2d') c2d = c.getContext('2d'); else gl = c.getContext(rec.ctx); } catch (e) { rec.error = String(e.message || e).slice(0, 80); }
      if (!gl && !c2d) { out.push(rec); continue; }
      const rw = Math.max(8, Math.min(128, Math.floor(c.width / 3))), rh = Math.max(8, Math.min(128, Math.floor(c.height / 3)));
      const regions = [[(c.width - rw) / 2, (c.height - rh) / 2], [c.width * 0.08, c.height * 0.08], [c.width * 0.92 - rw, c.height * 0.08], [c.width * 0.08, c.height * 0.92 - rh], [c.width * 0.92 - rw, c.height * 0.92 - rh]].map(([x, y]) => [Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y))]);
      const readOnce = () => new Promise((res) => requestAnimationFrame(() => { try { res(regions.map(([x, y]) => { if (gl) { const b = new Uint8Array(rw * rh * 4); gl.readPixels(x, y, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; } return c2d.getImageData(x, y, rw, rh).data; })); } catch (e) { rec.error = String(e.message || e).slice(0, 80); res(null); } }));
      const nonEmpty = (b) => { let n = 0; for (let i = 0; i < b.length; i += 4) if (b[i + 3] > 8 && (b[i] > 8 || b[i + 1] > 8 || b[i + 2] > 8)) n++; return n; };
      let best = null; for (let k = 0; k < 3; k++) { const bs = await readOnce(); if (bs && (!best || bs.reduce((s, b) => s + nonEmpty(b), 0) > best.reduce((s, b) => s + nonEmpty(b), 0))) best = bs; if (best && best.some((b) => nonEmpty(b))) break; }
      if (best) { const per = best.map((b) => nonEmpty(b) / (rw * rh)); rec.filled = Math.round(per.reduce((s, x) => s + x, 0) / per.length * 1000) / 10; rec.regions = per.filter((x) => x > 0.005).length; }
      out.push(rec);
    }
    const fps = await new Promise((r2) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r2(n); }; requestAnimationFrame(f); });
    return { list: out, fps };
  });
  /* рисует ли — по снимкам: участок окна с холстом и с холстом, спрятанным opacity:0 */
  const sharp = loadSharp(); const handles = await page.$$('canvas');
  const dprS = cur.deviceScaleFactor || 1;
  const raw = async (b, box) => (await sharp(b).extract({ left: Math.round(box.x * dprS), top: Math.round(box.y * dprS), width: Math.max(1, Math.round(box.width * dprS)), height: Math.max(1, Math.round(box.height * dprS)) }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  const diffShare = (a, b) => { const A = a.data, B = b.data; const n = Math.min(A.length, B.length); let d = 0, t = 0; for (let i = 0; i < n; i += 16) { t++; if (Math.abs(A[i] - B[i]) > 24 || Math.abs(A[i + 1] - B[i + 1]) > 24 || Math.abs(A[i + 2] - B[i + 2]) > 24) d++; } return t ? d / t * 100 : 0; };
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i]; const b = buf.list[i] || {}; const visible = c.clientWidth > 0 && c.clientHeight > 0 && c.opacity > 0.05;
    let paints = null, moves = null, waited = 0, p = null, m = null;
    if (sharp && handles[i] && visible && c.ctx) {
      try {
        await handles[i].evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(200); await settleAnimations(page, 2000);
        const box = await handles[i].boundingBox();
        if (box && box.width >= 4 && box.height >= 4) {
          const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
          const clip = { x: x0, y: y0, width: Math.max(1, Math.min(box.width - (x0 - box.x), cur.width - x0)), height: Math.max(1, Math.min(box.height - (y0 - box.y), cur.height - y0)) };
          const t0 = Date.now();
          for (let attempt = 0; attempt < 5; attempt++) {
            const A = await raw(await page.screenshot(), clip);
            await handles[i].evaluate((el) => { el.__rwOp = el.style.opacity; el.style.opacity = '0'; }); await sleep(120);
            const H = await raw(await page.screenshot(), clip); const H2 = await raw(await page.screenshot(), clip);
            await handles[i].evaluate((el) => { el.style.opacity = el.__rwOp || ''; }); await sleep(350);
            const C = await raw(await page.screenshot(), clip);
            p = diffShare(A, H); m = diffShare(A, C); const noise = diffShare(H, H2);
            paints = p > 0.3 && p > noise * 3; moves = m > 0.3 && m > noise * 3;
            if (paints) break;
            await sleep(700); waited = Date.now() - t0;
          }
        }
      } catch { /* холст ушёл со страницы */ }
    }
    const sh = c.ctx ? sharpness(c) : { st: 'OK', bad: [] };
    let st = sh.st; const why = [];
    if (!visible) { st = 'WARN'; why.push('невидим'); }
    else if (!c.ctx) { st = 'WARN'; why.push('контекст не создан страницей — рисовать нечем (ленивая сцена или ошибка); проверить снимком после действия'); }
    else if (paints === false && !b.regions) { st = 'FAIL'; why.push(`ПУСТОЙ: за ${(waited / 1000).toFixed(1)} с со спрятанным холстом картинка та же`); }
    else if (paints === true) why.push(`РИСУЕТ${waited ? ` (ожил через ${(waited / 1000).toFixed(1)} с)` : ''}: меняет ${Math.round(p * 10) / 10}% своей площади, ${moves ? `кадр меняется (${Math.round(m * 10) / 10}%)` : 'кадр статичен'}`);
    else if (paints === false) why.push('по снимку не отличается от фона, но в буфере рисунок есть');
    if (b.regions != null) why.push(`буфер: рисунок в ${b.regions} из 5 зон, ${b.filled}% пикселей`);
    why.push(...sh.bad);
    if (sh.bad.length === 0 && visible && c.ctx) why.push(`резкость ×${c.ratioCss} от CSS px, ×${c.ratioDevice} от DPR`);
    rows.push({ ...c, paints, moves, buffer: b });
    line(st, `холст ${c.sig} ${c.clientWidth}×${c.clientHeight} (${c.ctx || 'нет контекста'})`, `${why.join(' · ')} · ${buf.fps} кадров/с на странице`);
  }
  report.canvas = { list: rows, fps: buf.fps };
}

/* анимации: по ключевым кадрам — какие свойства держат законченные с fill */
const animList = (pg) => evaluateWith(pg, () => document.getAnimations().map((a) => {
  const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; let props = [];
  try { props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !/^(offset|computedOffset|easing|composite)$/.test(k)))]; } catch { /* переход без кадров */ }
  return { name: a.animationName || (a.transitionProperty ? `переход ${a.transitionProperty}` : a.constructor.name), target: a.effect && a.effect.target ? sig(a.effect.target) : null, iterations: t.iterations === Infinity ? 'infinite' : t.iterations, fill: t.fill, state: a.playState, props };
}), null, DEPS);
async function motionStep() {
  const now = await animList(page);
  const running = now.filter((a) => a.state === 'running' && a.iterations !== 'infinite');
  const inf = now.filter((a) => a.iterations === 'infinite' && a.state === 'running');
  const holding = now.filter((a) => a.state === 'finished' && /forwards|both/.test(a.fill || ''));
  line('OK', `анимации: идут ${running.length}, бесконечных ${inf.length}, закончились и держат свойство ${holding.length}`, `${[...new Set(inf.map((a) => a.name))].slice(0, 6).join(', ') || 'бесконечных нет'}${holding.length ? ` · держат: ${holding.slice(0, 5).map((a) => `${a.target} ${a.name} (${a.fill}: ${a.props.join(', ')})`).join('; ')} — :hover и классы не поменяют эти свойства` : ''}`);
  /* «меньше движения» — в отдельной вкладке: переключение на лету оставляет страницу в переходах */
  const p2 = await preparePage(browser, cur, { scheme: opt.scheme || 'light', reducedMotion: true });
  try {
    await gotoRetry(p2, url); await p2.evaluate(() => document.fonts.ready).catch(() => {}); await sleep(1500);
    const red = await animList(p2);
    const infR = red.filter((a) => a.iterations === 'infinite' && a.state === 'running');
    const smooth = await p2.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    const st = infR.length ? 'WARN' : 'OK';
    line(st, 'анимации при «меньше движения» (отдельная вкладка)', `бесконечных идёт ${infR.length}${infR.length ? `: ${[...new Set(infR.map((a) => `${a.target} ${a.name}`))].slice(0, 5).join(', ')} — не останавливаются` : ''} · всего анимаций ${red.length} против ${now.length}${smooth === 'smooth' ? ' · плавная прокрутка остаётся (scroll-behavior:smooth)' : ''}`);
    report.motion = { now, reduced: red };
  } finally { await p2.close().catch(() => {}); }
}

/* видео: атрибуты, играет ли, пауза вне экрана и при «меньше движения» */
async function videoStep() {
  const vids = await evaluateWith(page, () => [...document.querySelectorAll('video')].map((v, i) => { v.setAttribute('data-rw-video', String(i)); const r = v.getBoundingClientRect(); return { i, el: sig(v), src: (v.currentSrc || v.src || (v.querySelector('source') || {}).src || '').split('?')[0].split('/').pop().slice(0, 60), autoplay: v.autoplay, muted: v.muted, playsinline: v.playsInline || v.hasAttribute('playsinline'), loop: v.loop, controls: v.controls, poster: !!v.poster, preload: v.preload, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), shown: r.width > 0 && r.height > 0 && eff(v) > 0.05 }; }), null, DEPS);
  if (!vids.length) return line('OK', 'видео', 'на странице нет <video>');
  const playing = (i, ms = 1200) => page.evaluate(async (i, ms) => { const v = document.querySelector(`[data-rw-video="${i}"]`); if (!v) return null; const a = v.currentTime; await new Promise((r) => setTimeout(r, ms)); return { advanced: v.currentTime - a > 0.2, paused: v.paused, ready: v.readyState }; }, i, ms);
  const mediaBytes = page.log.requests.filter((r) => r.type === 'media').reduce((s, r) => s + (r.bytes || 0), 0);
  for (const v of vids) {
    const probs = []; let st = 'OK';
    if (v.autoplay && !v.muted) { st = 'FAIL'; probs.push('автоплей без muted — браузер его не запустит'); }
    if (v.autoplay && !v.playsinline) { if (st === 'OK') st = 'WARN'; probs.push('нет playsinline — на iPhone уйдёт во весь экран'); }
    if (!v.poster) { if (st === 'OK') st = 'WARN'; probs.push('нет poster — до загрузки пустой прямоугольник'); }
    let state = '';
    if (v.shown && v.autoplay) {
      await scrollToY(page, Math.max(0, v.top - 100)); await sleep(400);
      const on = await playing(v.i);
      const plays = on && on.advanced;
      if (on && !plays) { st = 'FAIL'; probs.push(`не играет (readyState ${on.ready}${on.paused ? ', на паузе' : ''})`); }
      else if (on) state = 'играет';
      const far = plays ? await page.evaluate(() => document.documentElement.scrollHeight) : null;
      if (far != null) {
      await scrollToY(page, v.top > far / 2 ? 0 : far); await sleep(800);
      const off = await playing(v.i, 800);
      if (off && off.advanced) { if (st === 'OK') st = 'WARN'; probs.push('играет и вне экрана — тратит батарею, остановить через IntersectionObserver'); }
      else if (off) state += ', вне экрана на паузе';
      }
      await scrollToY(page, 0);
    }
    line(st, `видео ${v.el} ${v.w}×${v.h} «${v.src}»`, `${[v.autoplay ? 'автоплей' : 'по клику', v.muted ? 'без звука' : 'со звуком', v.loop ? 'по кругу' : '', v.playsinline ? 'playsinline' : '', v.poster ? 'постер' : '', `preload ${v.preload}`].filter(Boolean).join(', ')}${state ? ` · ${state}` : ''}${probs.length ? ` · ${probs.join('; ')}` : ''}`);
  }
  if (vids.some((v) => v.autoplay)) {
    const p2 = await preparePage(browser, cur, { scheme: opt.scheme || 'light', reducedMotion: true });
    try {
      await gotoRetry(p2, url); await sleep(1500);
      const r = await p2.evaluate(async () => { const out = []; for (const v of document.querySelectorAll('video[autoplay]')) { const a = v.currentTime; await new Promise((res) => setTimeout(res, 1000)); out.push(v.currentTime - a > 0.2); } return out; });
      const still = r.filter(Boolean).length;
      line(still ? 'WARN' : 'OK', 'видео при «меньше движения» (отдельная вкладка)', still ? `${still} из ${r.length} автоплей-видео продолжают играть — показать постер или остановить` : 'автоплей остановлен');
    } finally { await p2.close().catch(() => {}); }
  }
  line('OK', 'вес видео', `загружено ${Math.round(mediaBytes / 1024)} КБ медиа за время проверки (${cur.width}px); бюджет первого экрана — ≤2.5 МБ на desktop, ≤1 МБ на телефоне`);
  report.video = vids;
}

/* меню: подсвеченный пункт против раздела на экране (верх, каждый раздел, низ, снова верх) */
async function navStep() {
  const groups = await page.evaluate(() => [...document.querySelectorAll('nav, [role=navigation]')].map((n, i) => { const links = [...n.querySelectorAll('a[href^="#"]')].filter((a) => a.getAttribute('href').length > 1 && document.getElementById(a.getAttribute('href').slice(1))); const s = getComputedStyle(n); n.setAttribute('data-rw-nav', i); return { i, label: n.getAttribute('aria-label') || String(n.className).slice(0, 40) || n.tagName.toLowerCase(), links: links.length, shown: s.display !== 'none' && s.visibility !== 'hidden' && n.getBoundingClientRect().height > 0 }; }).filter((g) => g.links >= 3 && g.shown));
  if (!groups.length) return line('WARN', 'активный пункт меню', 'нет меню с тремя и более якорями на разделы — проверять нечего');
  const positions = await page.evaluate(() => { const ids = [...new Set([...document.querySelectorAll('nav a[href^="#"], [role=navigation] a[href^="#"]')].map((a) => a.getAttribute('href').slice(1)).filter((id) => id && document.getElementById(id)))]; const tops = ids.map((id) => ({ at: id, y: Math.round(document.getElementById(id).getBoundingClientRect().top + scrollY) })); return [{ at: 'верх', y: 0 }, ...tops, { at: 'низ', y: document.documentElement.scrollHeight }, { at: 'снова верх', y: 0 }]; });
  const bad = [];
  for (const p of positions) {
    await scrollToY(page, p.y); await sleep(450);
    const st = await page.evaluate((gs) => gs.map((g) => { const n = document.querySelector(`[data-rw-nav="${g.i}"]`); if (!n) return null; const links = [...n.querySelectorAll('a[href^="#"]')].filter((a) => a.getAttribute('href').length > 1 && document.getElementById(a.getAttribute('href').slice(1))); const isOn = (a) => (a.getAttribute('aria-current') && a.getAttribute('aria-current') !== 'false') || [...a.classList].some((c) => /(^|[-_])(active|current|selected|is-on)$/i.test(c)); const act = links.filter(isOn).map((a) => a.getAttribute('href').slice(1)); const vh = innerHeight; const band = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { onScreen: r.bottom > 0 && r.top < vh, center: r.top <= vh * 0.45 && r.bottom >= vh * 0.45 }; }; const atCenter = links.map((a) => a.getAttribute('href').slice(1)).filter((id) => band(id).center); return { nav: g.label, active: act, offScreen: act.filter((id) => !band(id).onScreen), atCenter: [...new Set(atCenter)] }; }).filter(Boolean), groups);
    for (const s of st) {
      if (s.offScreen.length) bad.push({ at: p.at, nav: s.nav, level: 'FAIL', msg: `подсвечен «${s.offScreen.join(', ')}», а этого раздела нет на экране` });
      else if (s.atCenter.length && s.active.length && !s.active.some((a) => s.atCenter.includes(a))) bad.push({ at: p.at, nav: s.nav, level: 'WARN', msg: `на экране «${s.atCenter.join(', ')}», подсвечено «${s.active.join(', ')}»` });
    }
  }
  await scrollToY(page, 0);
  const f = bad.filter((b) => b.level === 'FAIL');
  line(f.length ? 'FAIL' : bad.length ? 'WARN' : 'OK', `активный пункт меню: ${groups.length} меню, ${positions.length} положений`, bad.slice(0, 6).map((b) => `[${b.at}] ${b.nav}: ${b.msg}`).join(' | ') || 'подсветка совпадает с разделом на экране', { groups, positions, bad });
}

/* выброшенные браузером объявления CSS: текст таблиц, <style>, style="" — с номерами строк (C5) */
function cssCheckInPage(arg) {
  const DESCRIPTOR_AT = /^@(font-face|property|counter-style|page|font-feature-values|font-palette-values|view-transition)/i;
  const bad = []; let total = 0, skippedVar = 0, skippedPrefix = 0;
  for (const src of arg.sources) {
    if (!src.text) continue;
    const t = src.text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const lineOf = (i) => t.slice(0, i).split('\n').length + (src.lineOffset || 0);
    const stack = [{ kind: 'rules' }]; let seg = '', segStart = 0, depth = 0, q = null;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { seg += ch; if (ch === '\\') { seg += t[++i] || ''; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; if (!seg.trim()) segStart = i; seg += ch; continue; }
      if (ch === '(') depth++; if (ch === ')') depth--;
      if (depth > 0 || (ch !== '{' && ch !== '}' && ch !== ';')) { if (!seg.trim()) segStart = i; seg += ch; continue; }
      const top = stack[stack.length - 1]; const s = seg.trim();
      if (ch === '{') {
        let kind = 'decls';
        if (/^@(media|supports|layer|container|document|scope|starting-style|-moz-document)/i.test(s)) kind = 'rules';
        else if (/^@(-webkit-)?keyframes/i.test(s)) kind = 'keyframes';
        else if (DESCRIPTOR_AT.test(s) || top.kind === 'skip') kind = 'skip';
        else if (top.kind === 'keyframes') kind = 'decls';
        stack.push({ kind, sel: s });
      } else {
        if (s && top.kind === 'decls') {
          const c = s.indexOf(':');
          if (c > 0) {
            const prop = s.slice(0, c).trim().toLowerCase(); const val = s.slice(c + 1).trim().replace(/!\s*important\s*$/i, '').trim();
            if (!prop.startsWith('--') && /^[a-z-]+$/.test(prop)) {
              if (/^-(ms|moz|o|webkit)-/.test(prop) || /(^|[\s(,])-(ms|moz|o|webkit)-/.test(val) || /^(\*|_)/.test(prop)) skippedPrefix++;
              else if (/var\(|env\(|attr\(|expression\(/i.test(val)) skippedVar++;
              else { total++; if (!CSS.supports(prop, val)) bad.push({ file: src.name, line: lineOf(segStart), rule: top.sel.slice(0, 80), prop, value: val.slice(0, 80), known: CSS.supports(prop, 'inherit') }); }
            }
          }
        }
        if (ch === '}') stack.pop();
      }
      seg = '';
    }
  }
  return { total, skippedVar, skippedPrefix, bad };
}
async function cssStep() {
  const got = await evaluateWith(page, async () => {
    const sources = [];
    for (const sh of document.styleSheets) {
      const node = sh.ownerNode;
      if (node && node.getAttribute && node.getAttribute('data-rw')) continue; /* свои стили проверок */
      if (sh.href) { try { const r = await fetch(sh.href); sources.push({ name: sh.href.split('?')[0].split('/').pop() || sh.href, href: sh.href, text: r.ok ? await r.text() : null }); } catch (e) { sources.push({ name: sh.href.split('?')[0].split('/').pop() || sh.href, href: sh.href, text: null }); } }
      else if (node) {
        const html = document.documentElement.outerHTML; const at = html.indexOf(node.textContent.slice(0, 80));
        sources.push({ name: '<style>', text: node.textContent, lineOffset: at > 0 ? html.slice(0, at).split('\n').length - 1 : 0 });
      }
    }
    for (const el of document.querySelectorAll('[style]')) { if (el.closest('[data-rw-hidden]') && /opacity/.test(el.getAttribute('style'))) continue; sources.push({ name: `style="" у ${sig(el)}`, text: `x{${el.getAttribute('style')}}` }); }
    return sources;
  }, null, DEPS);
  /* таблицы с чужого домена без CORS страница не прочитает — берём их запросом отсюда */
  for (const s of got) if (s.href && s.text == null) { try { const r = await fetch(s.href, { signal: AbortSignal.timeout(20000) }); if (r.ok) s.text = await r.text(); else s.error = `HTTP ${r.status}`; } catch (e) { s.error = String(e.message || e).slice(0, 60); } }
  const res = await evaluateWith(page, cssCheckInPage, { sources: got.filter((s) => s.text).map((s) => ({ name: s.name, text: s.text, lineOffset: s.lineOffset || 0 })) }, {});
  const unread = got.filter((s) => s.href && s.text == null);
  /* одинаковые объявления (генератор повторяет одно и то же в каждом блоке) — одной строкой со счётчиком */
  const group = (list) => { const m = new Map(); for (const b of list) { const k = `${b.file}|${b.rule}|${b.prop}|${b.value}`; const e = m.get(k); if (e) e.count++; else m.set(k, { ...b, count: 1 }); } return [...m.values()]; };
  const real = group(res.bad.filter((b) => b.known)); const unknown = group(res.bad.filter((b) => !b.known));
  const kinds = { sheets: got.filter((s) => s.href && s.text != null).length, styles: got.filter((s) => s.name === '<style>').length, attrs: got.filter((s) => /^style=""/.test(s.name)).length };
  line(real.length ? 'FAIL' : 'OK', `CSS: проверено ${res.total} объявлений — таблиц ${kinds.sheets}, блоков <style> ${kinds.styles}, атрибутов style="" ${kinds.attrs} (с var() не проверялось ${res.skippedVar}, с префиксами ${res.skippedPrefix})`,
    real.length ? real.slice(0, 8).map((b) => `${b.file}:${b.line} ${b.rule} { ${b.prop}: ${b.value} }${b.count > 1 ? ` ×${b.count}` : ''} — браузер выбросил`).join(' | ') + (real.length > 8 ? ` и ещё ${real.length - 8} разных` : '') : 'выброшенных браузером нет', { bad: res.bad });
  if (unknown.length) line('WARN', `CSS: свойства, которых браузер не знает: ${unknown.length}`, unknown.slice(0, 6).map((b) => `${b.file}:${b.line} ${b.prop}`).join(', '));
  if (unread.length) line('WARN', `CSS: не прочитано таблиц ${unread.length}`, unread.slice(0, 4).map((s) => `${s.name} (${s.error || 'нет доступа'})`).join(', '));
}

const show = (r) => (r === undefined ? 'undefined' : typeof r === 'string' ? r : String(JSON.stringify(r) ?? r));

for (const { k, v, expect } of steps) {
  const errBefore = errCount(); let handled = null;
  curKind = k === 'eval' && expect != null ? 'expect' : k;
  try {
    if (k === 'wait') { const ms = Number(String(v).trim()); await sleep(ms); line('OK', `ждали ${ms} мс`); }
    else if (k === 'scroll') await scrollStep();
    else if (k === 'hover') await hoverStep(v);
    else if (k === 'hover-all') await hoverAllStep();
    else if (k === 'click') handled = await clickStep(v);
    else if (k === 'type') await typeStep(v);
    else if (k === 'edit') await editStep(v);
    else if (k === 'key') await keyStep(v);
    else if (k === 'select') await selectStep(v);
    else if (k === 'resize') await resizeStep(v);
    else if (k === 'canvas') await canvasStep();
    else if (k === 'motion') await motionStep();
    else if (k === 'video') await videoStep();
    else if (k === 'nav') await navStep();
    else if (k === 'css') await cssStep();
    else if (k === 'eval') {
      const r = await page.evaluate(String(v));
      if (expect == null) line('OK', `eval ${short(v, 200)}`, show(r).slice(0, 300));
      else { const got = show(r); const ok = got === String(expect) || String(r) === String(expect); line(ok ? 'OK' : 'FAIL', `eval ${short(v, 200)} = ${short(expect, 80)}`, ok ? `совпало: ${got.slice(0, 200)}` : `ожидали «${String(expect).slice(0, 80)}», получили «${got.slice(0, 200)}»`); }
    }
    else if (k === 'assert') {
      const r = await page.evaluate(String(v));
      line(r ? 'OK' : 'FAIL', `assert ${short(v, 200)}`, r ? show(r).slice(0, 200) : `ложно: ${show(r).slice(0, 200)}`);
    }
    else if (k === 'shot') { const f = await shot(String(v)); line('OK', `снимок ${v}`, f); }
    else if (k === 'fullpage') { const file = path.join(outDir, `${tag}-full.png`); const how = await fullPageShot(page, file); line('OK', 'снимок всей страницы', `${path.basename(file)}${how !== 'full' ? ` (снято как ${how}: страница выше предела Chrome)` : ''}`); }
  } catch (e) {
    line('FAIL', `${k} ${v === true || v === undefined ? '' : v}`, short(e.message || e, 200));
  }
  const newErr = errCount() - errBefore;
  if (newErr && handled !== 'checked-errors') line('FAIL', `новые ошибки после шага ${k}: ${newErr}`, uniqCount([...realConsole(), ...page.log.errors.map((t) => ({ text: t }))].slice(-newErr).map((c) => short(c.text, 120))));
}

report.console = { errors: realConsole().map((c) => c.text), pageErrors: page.log.errors, warnings: page.log.console.filter((c) => c.type === 'warning').length, failedRequests: page.log.failed };
report.verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
await browser.close();
writeJson(path.join(outDir, `${tag}.json`), report);
console.log(`\n${report.verdict}: ${fails} провалов, ${warns} предупреждений · ${path.join(outDir, `${tag}.json`)}`);
if (fails && !opt['no-fail']) process.exit(1);
