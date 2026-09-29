#!/usr/bin/env node
/**
 * Замер скорости в живом браузере, с бюджетами и вердиктом.
 *
 *   node perf.mjs <url> [--viewport mobile] [--out папка] [--tag имя]
 *                 [--cpu 4] [--net fast3g|slow4g|none] [--runs 3]
 *                 [--overlay [селектор]] [--rounds 5] [--overlay-only] [--strict]
 *   node perf.mjs --selftest [--out папка]
 *   node perf.mjs --help   (или --h, -h)
 *
 * Флаги:
 *   --viewport  экран: пресет (desktop, laptop, tablet, mobile, mobile-s, android), запись ШxВ@плотность
 *               («320x568@2») или одна ширина; по умолчанию mobile. Один экран за запуск: список
 *               через запятую — ошибка с кодом 1 (запускать по разу на экран, итоги ложатся в разные
 *               файлы). --viewports — то же самое (синоним).
 *   --cpu N     во сколько раз замедлить процессор (по умолчанию 4 на телефоне и планшете, 1 на десктопе).
 *   --net       сеть: fast3g, slow4g или none (по умолчанию fast3g на телефоне, none на десктопе).
 *   --runs N    прогонов (1…9), каждый в свежем браузере с холодным кэшем; в таблицу — медиана и разброс.
 *   --out       папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/perf/<tag>.json.
 *   --tag       имя файла итога (по умолчанию <экран>-<сеть>-cpu<N>).
 *   --overlay   ещё и цена полноэкранного слоя фактуры (зерно, вуаль): растровые задачи (RasterTask) и
 *               Paint за 2 с покоя по трассировке Chrome — со слоем и без, раунды чередуются
 *               (со слоем → без, затем без → со слоем …). Без значения слои ищет texture.mjs
 *               (findTextureLayers: закреплённые или во весь экран); со значением — CSS-селектор слоя,
 *               можно с псевдоэлементом: --overlay "body::after". Слой прячется через opacity:0 и
 *               visibility:hidden (visibility одна не прячет вывод SVG-фильтра feTurbulence).
 *               Строгий CSP (style-src без 'unsafe-inline'): политика проверяется до вставки, и стиль
 *               сразу ставится таблицей document.adoptedStyleSheets (CSP на неё не распространяется;
 *               <style> не пробуется — нарушения в консоли сайта от замера нет), в выводе об этом строка.
 *               Не вставился никак — WARN «цена слоя: не измерена — CSP страницы запрещает вставку стиля».
 *   --rounds N  раундов для --overlay, от 5 до 20 (по умолчанию 5): меньше 5 и больше 20 — примечание
 *               и ближайшая граница (больше 20 раундов замер идёт минутами).
 *   --overlay-only  только цена слоя, без замера загрузки (быстро: сеть не замедляется); итог —
 *               <out>/perf/<tag>-overlay.json (не затирает полный замер <tag>.json).
 *   --strict    код выхода 1 при итоговом вердикте FAIL (для гейта); без флага — 0 при любом вердикте.
 *   --selftest  стенды fixtures/perf на своём сервере 127.0.0.1 без сжатия (desktop, сеть none, процессор ×1):
 *               сдвиг вёрстки после load (источник, на сколько и когда), сдвиг у края окна (обрезка краем — не
 *               «смена высоты»; настоящая смена высоты остаётся), автослайдер со сменой LCP (пометка
 *               и медиана по первому элементу), «сервер не сжимает» на локальном адресе (INFO, вердикт веса
 *               по gzip); без браузера — подписи источника сдвига у всех краёв окна (низ, верх, блок от x 0,
 *               коробка во всю высоту окна) и у старого протокола без размера окна. Протоколы — во временной
 *               папке или в --out; код 1, если ожидание не сошлось.
 *   --help, --h, -h  эта справка.
 *
 * Что измеряется: TTFB, FCP, LCP (с элементом), CLS (с источниками сдвигов), долгие задачи (каждая — начало, длительность,
 * фаза), вес по типам ресурсов (как передано по сети) и сжат ли текст, самые тяжёлые файлы,
 * память JS, узлы DOM, кадры в секунду при прокрутке и в покое (важно для анимаций и WebGL),
 * картинки крупнее и мельче показанного, видео (вес и постер).
 *
 * По умолчанию мобильный экран, процессор в 4 раза медленнее, сеть fast3g —
 * так смотрит на сайт покупатель с телефона, а не разработчик с ноутбука.
 * Цифры одного прогона плавают на ±20%: для решения «стало хуже или нет»
 * брать --runs 3 — каждый прогон в свежем браузере, в таблицу идёт медиана,
 * рядом разброс.
 *
 * Холодный кэш. У каждого прогона свой браузер со своим временным профилем, внутри — отдельный
 * контекст (кэш только в памяти, без куки), и кэш очищается перед заходом. В строке прогона —
 * «из кэша: N» (диск, память, предзагрузка, service worker; в холодном прогоне 0). Повторная
 * выдача файла, который эта же страница уже скачала, в счёт не идёт — это не тёплый кэш.
 *
 * Окно замера. networkidle2 отпускает страницу, пока качаются ещё два файла, и модуль Three.js
 * на 700 КБ, начатый после load, то успевал к замеру, то нет: вес JS и долгие задачи прыгали
 * между прогонами (713 и 35 КБ, 517 и 60 мс). Теперь после загрузки perf ждёт полной тишины сети —
 * ни одного запроса в полёте 1 с подряд, не дольше 20 с; видео, аудио, потоки и маяки (sendBeacon)
 * не ждёт — они не кончаются вместе с загрузкой. Не затихло за 20 с — WARN «не дождались» с файлами,
 * в вес идёт скачанное к замеру. Вес — всё, что страница запросила до начала прокрутки замера
 * (загрузка и после load), каждый файл целиком; догруженное прокруткой замера и проходом за ленивым —
 * отдельными строками, в бюджет не входит: у человека, который не листал, этих файлов нет.
 *
 * Сжатие. Вердикт веса — по фактической передаче. Тела текстовых ответов (html, css, js, json,
 * svg, xml, wasm) perf сжимает сам — gzip уровня 6 и brotli качества 11, как статический хостинг.
 * Сервер сжимает — в строке «Сжатие текста» «без сжатия было бы N КБ». Не сжимает (serve.mjs
 * --no-compress, чужой сервер) — «сервер не сжимает», а у строк «JS по сети» и «Всего по сети» —
 * «со сжатием было бы ≈ N КБ gzip / M КБ br» и вердикт по gzip: FAIL веса на локальном сервере
 * без сжатия не означает FAIL на бою. Судятся ответы от 1 КБ; тела меньше 512 байт хостинги не
 * сжимают — в оценке они как есть. Локальный адрес (localhost, *.localhost, 127.x.x.x, [::1], 0.0.0.0,
 * file:) без сжатия — голый сервер разработки без прокси: строка «INFO Сжатие текста: … — локальный
 * сервер без прокси; на бою сжатие может делать Caddy/nginx», вердикт строк «JS по сети» и «Всего по
 * сети» — по оценке gzip (по передаче — в JSON, checks.*.byTransfer), само сжатие проверять на боевом
 * адресе. Раньше голый node на localhost давал «сервер не сжимает» как находку про бой.
 *
 * CLS. У каждого сдвига вёрстки — источники (LayoutShiftAttribution): элемент, ближайший предок с id,
 * начало текста, коробка до и после (в координатах окна) и время от начала загрузки; фаза — загрузка,
 * после load или прокрутка замера (как у долгих задач). В выводе — суммы по фазам у каждого прогона и три
 * крупнейших сдвига прогона с медианным CLS: «0.18 на 1850 мс (после load): section.promo в main#top —
 * вниз на 120 px (y 64 → 184)»; в таблице у CLS — крупнейший. Все сдвиги — в JSON (cls.perRun, до 300 на
 * прогон). Сдвиги сразу после ввода человека (hadRecentInput) в CLS не идут и здесь не считаются.
 * Коробки источника — видимая часть в окне: край блока за краем окна обрезан. Поэтому рядом с коробками в
 * JSON — размер окна (vw, vh; без полос прокрутки), и размер («высота 100 → 140», «ширина …») пишется, только
 * если ни в одной из коробок этот край не касается края окна; касается — «низ у края окна — видна часть
 * коробки, размер не сравнивался» («низ был у края окна» — касался до сдвига). Раньше блок, чей низ уехал за
 * низ окна, давал «вниз на 15 px (y 687 → 702), высота 206 → 198» (702 + 198 = 900 — низ окна), обратный
 * сдвиг — «высота 198 → 206». Верх за верхом окна — сдвиг по низу («вниз на 50 px (низ 100 → 150)»), левый
 * край за краем — по правому. Начало текста — с пробелами на месте <br> и границ блоков («Забронировать
 * стол», а не «Забронироватьстол»), на момент сдвига. В обработчике сдвигов (он работает внутри замеряемой
 * загрузки) — только обход узлов, пробел у <br> и тегов-блоков, без стиля и раскладки: getComputedStyle и
 * clientWidth там сами давали долгую задачу — 127 мс на /menu «Эпицентра» при процессоре ×4. После замера
 * текст узла, который ещё на странице и не менялся, уточняется по стилю (пробел и у flex-элемента a или span),
 * и дописывается размер окна.
 *
 * LCP сменился. Если среди кандидатов до прокрутки замера позже чем через 1.5 с после прежнего крупнейшим
 * стал другой элемент (или другой файл у того же) — картинка после картинки или текст после текста, на том
 * же месте (верх ±60 px, площадь не больше чем втрое) или с классом слайда (slide, swiper, carousel …), —
 * это кадр автослайдера или анимация, а не медленная загрузка: строка «LCP сменился: <элемент> на N-й
 * секунде … — вероятно автослайдер/анимация» и отдельно «LCP по первому элементу: медиана N мс» (у
 * прогона без смены — его LCP). Вердикт LCP — как раньше, по последнему кандидату до прокрутки; в JSON —
 * lcp.switched и lcp.firstElement. Разные элементы LCP в прогонах без смены — пометкой.
 *
 * LCP. Chrome останавливает LCP на первом касании или прокрутке человека, а прокрутку скриптом не
 * замечает: при прокрутке замера кандидатом становилась картинка ниже первого экрана (карточка,
 * проявившаяся при появлении), и LCP прыгал с 1 с на 7–11 с. Поэтому LCP для вердикта — последний
 * кандидат до начала прокрутки замера, как у человека. У каждого прогона в выводе и в JSON —
 * элемент (тег, id и классы, ближайший предок с id, текст или файл, размер, первый экран или ниже)
 * и время; кандидаты после начала прокрутки — отдельным списком «появились при прокрутке замера
 * (у человека не считаются)». Кандидатов до прокрутки нет — берётся первый после, с пометкой.
 * Позиция элемента («первый экран» или «ниже, y …») — на момент записи кандидата наблюдателем
 * (через десятки–сотни мс после отрисовки): LCP «ниже первого экрана» до прокрутки значит, что
 * элемент был в окне, а потом его сдвинуло содержимое, отрисованное позже.
 * Станет ли проявившийся блок кандидатом, зависит от скорости прокрутки: при мелком шаге (короткая
 * страница — шаг 1/150 высоты за кадр) или медленных кадрах он успевает отрисоваться целиком в окне;
 * поэтому прыжок и выходил не в каждом прогоне.
 *
 * Долгие задачи (от 50 мс) — списком: начало, длительность, фаза по началу задачи: загрузка (до
 * конца события load), после load (до начала прокрутки замера), прокрутка замера. Вердикт — по
 * сумме загрузки и после load: это цена открытия страницы. Задачи прокрутки замера зависят от
 * самого замера (150 шагов за ~2 с) — их сумма отдельной строкой, справочно. По прогонам — суммы
 * по фазам, в таблице — разброс.
 *
 * Прокрутка. Плавная прокрутка страницы (html{scroll-behavior:smooth}) превращала scrollTo в
 * анимацию: скрипт «прокручивал 12453 px», а страница сдвигалась на 149, и кадры/с считались на
 * месте. Теперь прокрутка мгновенная (forceInstantScroll и behavior:'instant'), шагами по 1/150
 * высоты на кадр (не дольше 10 с), и записывается, докуда страница дошла на самом деле (scrollY).
 * Дошла меньше чем на 90 % — FAIL замера: кадры/с при прокрутке недействительны. Если прокручивается
 * не документ, а блок во весь экран (body{overflow:auto} у «приложений»), прокручивается он.
 *
 * Картинки мельче показанного (размытые): плотность = пикселей картинки на CSS-пиксель показа,
 * с учётом object-fit и background-size: cover — масштаб max(ширина_коробки/ширина_картинки,
 * высота_коробки/высота_картинки), contain — min, fill — худшая ось, none — 1, auto у фона — 1.
 * Размер картинки — настоящий: для srcset и <picture> браузер делит naturalWidth на плотность
 * источника, поэтому файл перезагружается через new Image(). FAIL — плотность ниже 1 (меньше
 * пикселя картинки на CSS-пиксель, размыто на любом экране), WARN — ниже min(dpr, 2) (размыто на
 * этом экране; 3× на android не требуется). Допуск 3 % на округление. Проверяются <img>, постеры
 * <video> (с object-fit ролика) и фоновые картинки без повтора или с cover (узоры и плитки с
 * повтором — нет), от 64×48 CSS-пикселей, видимые (итоговая opacity > 0.05), не SVG. Проверка
 * здесь, а не в a11y.mjs: рядом «крупнее показанного» — тот же расчёт в другую сторону
 * (плотность > 1.5 × dpr — лишний вес, справочно).
 * Перед замером плотности страница проходится ещё раз — lib.scrollThrough с паузой 350 мс и
 * ожиданием картинок в кадре (до 1,5 с на шаг): быстрый проход замера кадров/с (~2 с) ленивые не
 * успевают догрузить, и на Tilda при fast3g фоны карточек оставались заглушками …/-/resizeb/20x/.
 * LCP, CLS, память и вес по сети снимаются до этого прохода (как раньше); догруженное им — отдельной
 * строкой. Что так и осталось заглушкой (≤ 64 px по стороне в коробке от 200 px и адрес заглушки,
 * data-original/data-src/… с ещё не подставленным адресом или класс lazy; без признаков — ≤ 32 px),
 * не мерится: WARN «заглушка ленивой загрузки не догрузилась — не измерено», а не FAIL «размыто».
 * В выводе у адреса — хост и хвост пути (thb.tildacdn.com/…/-/resizeb/20x/1.jpg), полный — в JSON (url).
 *
 * Видео: вес каждого ролика — полный размер файла (Content-Range или Content-Length ответа, иначе
 * запрос HEAD), не то, что успело скачаться. Бюджет роликов первого экрана: телефон и планшет
 * 1 МБ, десктоп 2.5 МБ (хорошо) / вдвое больше (терпимо), выше — FAIL. Ролик без poster — WARN:
 * до загрузки на его месте пусто (на телефоне — долго). blob: (потоковое видео) — размер не
 * определить, WARN.
 *
 * Цена слоя (--overlay): бюджет в числе растровых задач, а не в процентах процессора (разброс
 * процессора между раундами больше разницы между вариантами). Неподвижный слой в покое не
 * перерисовывается вовсе; прибавка больше 2 растровых задач или 2 Paint за 2 с покоя, если все
 * раунды со слоем выше всех раундов без слоя, — WARN «слой перерисовывается в покое» (кипение
 * GIF или background-position; сдвиг transform по steps() не перерисовывает — предпочитать его
 * именно за это, а не за «дешевле по процессору»). Под headless кадры/с упираются в потолок —
 * рывки там не видны, поэтому кадры/с слоя не мерятся.
 *
 * Бюджеты (хорошо / терпимо): LCP 2.5 с / 4 с · CLS 0.1 / 0.25 · JS 300 / 600 КБ ·
 * картинки 1000 / 2500 КБ · всего 2000 / 5000 КБ · долгие задачи загрузки и после load 300 / 800 мс ·
 * прокрутка 55 / 40 кадров/с · видео первого экрана 1 / 2 МБ (телефон), 2.5 / 5 МБ (десктоп).
 * КБ и МБ — по 1024.
 *
 * Код выхода: 0 — замер сделан (вердикт в выводе и в JSON), 1 — неверные аргументы, ни один
 * прогон не удался или, с --strict, итоговый вердикт FAIL (WARN — всё равно 0). Аргументы (адрес,
 * экран, значения флагов) проверяются до создания папок и запуска браузера.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import {
  launch, preparePage, openPage, gotoRetry, resolveViewport, VIEWPORTS, parseArgs, runDir, writeJson, sleep, ensureDir,
  forceInstantScroll, scrollThrough, scrollToY, settleAnimations, waitForMedia, evaluateWith, EFFECTIVE_OPACITY_FN, SIG_FN, PH_URL,
  collectWarnings, takeWarnings,
} from './lib.mjs';
import { findTextureLayers, hideTextureLayers, showTextureLayers, setPageStyle, dropPageStyle, CSP_NO_STYLE } from './texture.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h', 'overlay-only', 'strict', 'selftest'], values: ['viewport', 'viewports', 'cpu', 'net', 'runs', 'rounds', 'out', 'tag'], optional: ['overlay'], strict: true });
/* короткий -h — как --help: и на месте адреса, и на месте значения флага; до любых папок и браузера */
if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h')) { console.log(HELP); process.exit(0); }
const die = (msg) => { console.error(msg); process.exit(1); };
/* WARN lib (свой стиль не вставился) — в итог и json (warnings), а не посреди вывода прогона */
collectWarnings();
for (const k of ['viewport', 'viewports', 'cpu', 'net', 'runs', 'rounds', 'out', 'tag']) if (opt[k] === true) die(`--${k}: нужно значение (подробно: --help)`);
if (opt.selftest) process.exit(await selftest());
/* «--overlay http://…» без селектора: адрес ушёл в значение флага */
if (typeof opt.overlay === 'string' && /^(https?|file):/i.test(opt.overlay) && !pos[0]) { pos.unshift(opt.overlay); opt.overlay = true; }
if (opt['overlay-only'] && !opt.overlay) opt.overlay = true;
if (!pos[0]) die('Нужен адрес: node perf.mjs <url> [--viewport mobile] [--cpu 4] [--net fast3g|slow4g|none] [--runs 3] [--overlay]  (подробно: --help)');
const url = pos[0];
{
  let ok = false; try { ok = /^(https?|file|data|about):$/i.test(new URL(url).protocol); } catch { /* не адрес */ }
  if (!ok) die(`Неверный адрес «${url}»: нужен полный адрес — http://…, https://… или file:///…  (подробно: --help)`);
}
/* --viewport и --viewports — один флаг; экран один за запуск */
function oneViewport(dflt) {
  const a = opt.viewport, b = opt.viewports;
  if (a !== undefined && b !== undefined && String(a).trim() !== String(b).trim()) die(`Заданы и --viewport ${a}, и --viewports ${b} — это один флаг, оставьте один`);
  const raw = a ?? b; const list = String(raw ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!list.length) list.push(dflt);
  if (list.length > 1) die(`perf меряет один экран за запуск, а задано ${list.length}: ${list.join(', ')}. Запустите по разу на экран: ${list.map((v) => `--viewport ${v}`).join(', затем ')} — итоги лягут в разные файлы (<out>/perf/<экран>-<сеть>-cpu<N>.json)`);
  const r = resolveViewport(list[0]);
  if (!r) die(`Неизвестный экран «${list[0]}». Есть: ${Object.keys(VIEWPORTS).join(', ')} или запись ШxВ@плотность, например 320x568@2`);
  return r;
}
const [vpName, vp] = oneViewport('mobile');
if (opt.cpu !== undefined && !(Number(opt.cpu) >= 1)) die(`--cpu ${opt.cpu}: нужно число от 1 (во сколько раз замедлить процессор)`);
const cpu = opt.cpu === undefined ? (vp.isMobile ? 4 : 1) : Number(opt.cpu);
const netName = opt.net || (vp.isMobile ? 'fast3g' : 'none');
const NET = { none: null, fast3g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }, slow4g: { latency: 100, downloadThroughput: 4e6 / 8, uploadThroughput: 3e6 / 8 } };
if (!Object.prototype.hasOwnProperty.call(NET, netName)) die('Сеть: none, fast3g или slow4g');
const runs = Math.max(1, Math.min(9, Number(opt.runs) || 1));
const rounds = Math.max(5, Math.min(20, Number(opt.rounds) || 5));
if (opt.rounds !== undefined && Number(opt.rounds) < 5) console.log(`--rounds ${opt.rounds}: меньше 5 раундов разброс не виден — беру 5`);
if (Number(opt.rounds) > 20) console.log(`--rounds ${opt.rounds}: больше 20 раундов замер идёт минутами — беру 20`);
/* локальный сервер: сервер разработки без прокси — «не сжимает» здесь не находка про бой (INFO, а не WARN) */
const LOCAL = (() => { try { const u = new URL(url); if (u.protocol === 'file:') return true; const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase(); return h === 'localhost' || h.endsWith('.localhost') || /^127(\.\d{1,3}){3}$/.test(h) || h === '::1' || h === '0.0.0.0'; } catch { return false; } })();
const LOCAL_NOTE = 'локальный сервер без прокси; на бою сжатие может делать Caddy/nginx';
const run = runDir(opt, url); const outDir = ensureDir(path.join(run, 'perf'));
const tag = opt.tag || `${vpName}-${netName}-cpu${cpu}`;
const MB = 1024 * 1024;
const videoBudget = vp.isMobile ? 1 * MB : 2.5 * MB;

/* ---------- --selftest: стенды fixtures/perf на своём сервере без сжатия ---------- */
/* Сервер — в этом процессе (127.0.0.1, свободный порт, без сжатия и кэша), замер — дочерним запуском этого же
   скрипта (spawn, не spawnSync: иначе сервер не ответит). Ожидания — по JSON и выводу. Зовётся до констант
   прогона (функция поднимается), поэтому всё нужное — внутри */
async function selftest() {
  const here = path.dirname(fileURLToPath(import.meta.url)); const dir = path.join(here, 'fixtures', 'perf');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const f = path.resolve(dir, rel);
    if (!f.startsWith(dir + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('нет такого файла'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const out = opt.out ? path.resolve(String(opt.out)) : fs.mkdtempSync(path.join(os.tmpdir(), 'perf-selftest-'));
  const runSelf = (args) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const so = [], se = []; ch.stdout.on('data', (d) => so.push(d)); ch.stderr.on('data', (d) => se.push(d));
    const t = setTimeout(() => ch.kill(), 300000);
    ch.on('close', (code) => { clearTimeout(t); resolve({ code, out: Buffer.concat(so).toString('utf8'), err: Buffer.concat(se).toString('utf8') }); });
  });
  const CASES = [
    { page: 'slider.html', runs: 2, why: 'кадр 2 автослайдера через 2.5 с после загрузки', check: (j, so) => [
      j.lcp.switched.length === 2 ? '' : `LCP сменился в ${j.lcp.switched.length} из 2 прогонов, ждали в обоих`,
      j.lcp.switched.every((x) => /frame-2\.svg/.test(x.to) && /frame-1\.svg/.test(x.from)) ? '' : 'смена не frame-1.svg → frame-2.svg',
      j.lcp.firstElement && /frame-1\.svg/.test(j.lcp.firstElement.element) && j.lcp.firstElement.median < j.metrics.lcp ? '' : 'нет медианы по первому элементу (frame-1.svg) меньше итогового LCP',
      /LCP сменился в прогонах 1, 2: .*вероятно автослайдер\/анимация/.test(so) ? '' : 'в выводе нет строки «LCP сменился … вероятно автослайдер/анимация»',
      /LCP по первому элементу \(img\.hero__slide[^)]*frame-1\.svg\): медиана \d+ мс/.test(so) ? '' : 'в выводе нет «LCP по первому элементу … медиана»',
    ] },
    { page: 'cls.html', runs: 1, why: 'плашка 160 px над статьёй через 0.7 с после load; сервер без сжатия на 127.0.0.1', check: (j, so) => {
      const top = (j.cls.perRun[0].top || [])[0];
      return [
        top ? '' : 'сдвигов нет',
        top && top.phase === 'afterLoad' ? '' : `крупнейший сдвиг не «после load» (${top ? top.phase : '—'})`,
        top && top.sources.some((s) => /article\.news/.test(s.el) && s.prev && s.cur && s.cur.y - s.prev.y >= 150) ? '' : 'среди источников нет article.news со сдвигом вниз от 150 px',
        top && top.sources.some((s) => /article\.news/.test(s.el) && /^Новости Открыли запись/.test(s.text || '')) ? '' : `текст источника article.news не «Новости Открыли запись…» (${top ? (top.sources.find((s) => /article\.news/.test(s.el)) || {}).text : '—'}): отступы разметки съели предел знаков`,
        /крупнейшие — что сдвинулось.*\n\s+[\d.]+ на \d+ мс \(после load\): .*article\.news.* — вниз на 1[56]\d px/.test(so) ? '' : 'в выводе нет строки крупнейшего сдвига «… article.news … вниз на 160 px»',
        j.compression.local === true && /локальный сервер без прокси/.test((j.checks['JS по сети'] || {}).note || '') ? '' : 'сжатие: нет пометки «локальный сервер без прокси» в JSON или у строки «JS по сети»',
        /^INFO Сжатие текста: .*локальный сервер без прокси; на бою сжатие может делать Caddy\/nginx/m.test(so) ? '' : 'в выводе нет «INFO Сжатие текста … локальный сервер без прокси»',
      ];
    } },
    { page: 'edge.html', runs: 1, why: 'низ блока уходит за край окна — не «смена высоты»; настоящая смена высоты остаётся; текст через <br> — с пробелом', check: (j, so) => {
      const src = (j.cls.perRun[0].shifts || []).flatMap((x) => x.sources || []).filter((s) => /div\.edge/.test(s.el));
      const top = (so.split(/крупнейшие[^\n]*\n/)[1] || '').split(/\n(?! {4})/)[0];
      return [
        src.some((s) => s.prev && s.cur && s.vh && s.cur.y + s.cur.h >= s.vh - 1 && s.prev.y + s.prev.h < s.vh - 1) ? '' : 'в JSON нет источника div.edge, чей низ ушёл за край окна (с размером окна vh)',
        /div\.edge[^«;\n]*«Значок у низа окна» — вниз на 15 px \(y \d+ → \d+\), низ у края окна — видна часть коробки, размер не сравнивался/.test(top) ? '' : 'в «крупнейших» нет «div.edge «Значок у низа окна» — вниз на 15 px (…), низ у края окна — … размер не сравнивался»',
        /div\.edge[^;\n]*вверх на \d+ px \(y \d+ → \d+\), низ был у края окна/.test(top) ? '' : 'нет обратного случая «div.edge … вверх … низ был у края окна»',
        /div\.edge[^;\n]*высота/.test(top) ? 'у div.edge «высота» — обрезка краем окна выдана за смену размера' : '',
        /div\.grow[^;\n]*высота 100 → 140/.test(top) ? '' : 'нет контроля «div.grow … высота 100 → 140» (настоящая смена высоты)',
      ];
    } },
  ];
  let bad = 0, n = 0;
  /* без браузера: подписи источников сдвига у краёв окна (shiftText). Коробки источника — видимая часть в
     окне; стенд edge.html проверяет низ окна вживую, здесь — все края и старые протоколы без vw/vh */
  const SHIFT = [
    { why: 'низ ушёл за низ окна (mamuka.rest)', s: { el: 'span.i', prev: { x: 700, y: 687, w: 37, h: 206 }, cur: { x: 700, y: 702, w: 37, h: 198 }, vw: 1440, vh: 900 }, has: ['— вниз на 15 px (y 687 → 702), низ у края окна — видна часть коробки, размер не сравнивался'], not: ['высота'] },
    { why: 'обратно: низ был у края окна', s: { el: 'span.i', prev: { x: 700, y: 702, w: 37, h: 198 }, cur: { x: 700, y: 679, w: 37, h: 206 }, vw: 1440, vh: 900 }, has: ['— вверх на 23 px (y 702 → 679), низ был у края окна — видна часть коробки, размер не сравнивался'], not: ['высота'] },
    { why: 'верх за верхом окна — сдвиг по низу', s: { el: 'div.top', prev: { x: 100, y: 0, w: 300, h: 60 }, cur: { x: 100, y: 0, w: 300, h: 75 }, vw: 1440, vh: 900 }, has: ['— вниз на 15 px (низ 60 → 75), верх у края окна — видна часть коробки, размер не сравнивался'], not: ['высота'] },
    { why: 'настоящая смена высоты вдали от краёв', s: { el: 'div.grow', prev: { x: 100, y: 74, w: 600, h: 100 }, cur: { x: 100, y: 89, w: 600, h: 140 }, vw: 1440, vh: 900 }, has: ['— вниз на 15 px (y 74 → 89), высота 100 → 140'], not: ['у края окна'] },
    { why: 'блок во всю ширину от x 0 — без пометки о крае', s: { el: 'section.s', prev: { x: 0, y: 100, w: 1425, h: 200 }, cur: { x: 0, y: 115, w: 1425, h: 200 }, vw: 1425, vh: 900 }, has: ['— вниз на 15 px (y 100 → 115)'], not: ['край', 'ширина'] },
    { why: 'коробка во всю высоту окна', s: { el: 'main.m', prev: { x: 100, y: 0, w: 600, h: 900 }, cur: { x: 100, y: 0, w: 600, h: 900 }, vw: 1440, vh: 900 }, has: ['— коробка во всю высоту окна: по видимой части сдвиг не виден'], not: ['высота'] },
    { why: 'старый протокол без размера окна: низ совпал — размер не пишется', s: { el: 'span.i', prev: { x: 700, y: 687, w: 37, h: 213 }, cur: { x: 700, y: 702, w: 37, h: 198 } }, has: ['— вниз на 15 px (y 687 → 702)'], not: ['высота', 'у края окна'] },
  ];
  {
    const miss = [];
    for (const c of SHIFT) {
      let t; try { t = shiftText(c.s); } catch (e) { miss.push(`${c.why}: упала — ${e.message}`); continue; }
      const m = [...c.has.filter((x) => !t.includes(x)).map((x) => `нет «${x}»`), ...c.not.filter((x) => t.includes(x)).map((x) => `лишнее «${x}»`)];
      if (m.length) miss.push(`${c.why}: ${m.join('; ')} — вышло «${t}»`);
    }
    if (miss.length) { bad++; console.log(`FAIL подписи сдвига у краёв окна (без браузера): ${miss.join(' | ')}`); } else console.log(`OK   подписи сдвига у краёв окна (без браузера): ${SHIFT.length} случаев`);
  }
  try {
    for (const c of CASES) {
      const tag = c.page.replace(/\.html$/, ''); const jf = path.join(out, 'perf', `${tag}.json`);
      try { fs.rmSync(jf, { force: true }); } catch { /* нет */ }
      const t0 = Date.now();
      const r = await runSelf([`${base}/${c.page}`, '--viewport', 'desktop', '--net', 'none', '--cpu', '1', '--runs', String(c.runs), '--out', out, '--tag', tag]);
      let j = null; try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch { /* нет итога */ }
      n++;
      if (!j) { bad++; console.log(`FAIL ${c.page}: нет итога (код ${r.code}) — ${(r.err || r.out).trim().slice(-300)}`); continue; }
      let miss; try { miss = c.check(j, r.out).filter(Boolean); } catch (e) { miss = [`проверка упала: ${e.message}`]; }
      if (miss.length) { bad++; console.log(`FAIL ${c.page} (${c.why}): ${miss.join('; ')}`); } else console.log(`OK   ${c.page} (${c.why})`);
      console.log(`     ${c.page}: ${Math.round((Date.now() - t0) / 100) / 10} с, протокол ${jf}`);
    }
  } finally { server.close(); }
  console.log(`\n${bad ? 'FAIL' : 'OK'}: стендов ${n} и подписи сдвига без браузера (${SHIFT.length}), не сошлось ${bad}`);
  return bad ? 1 : 0;
}

/* ---------- функции страницы ---------- */

/* прокрутка по кадрам: мгновенно, 1/150 высоты на кадр, настоящий scrollY; не дольше 10 с.
   Начало и конец — в __rw.scrollStart/scrollEnd (время страницы): по ним делятся кандидаты LCP и долгие
   задачи. Страница не выше окна — прокрутки нет, и начала тоже (всё, что было, — до прокрутки) */
function scrollInPage() {
  const rw = window.__rw || (window.__rw = {});
  return new Promise((res) => {
    const resolve = (v) => { if (rw.scrollStart != null) rw.scrollEnd = performance.now(); res(v); };
    const se = document.scrollingElement || document.documentElement;
    let sc = null; let total = Math.max(0, se.scrollHeight - innerHeight);
    if (total < 2 && document.body) {
      for (const el of document.body.querySelectorAll('*')) {
        if (el.scrollHeight <= el.clientHeight + 50 || el.clientHeight < innerHeight * 0.5 || el.clientWidth < innerWidth * 0.5) continue;
        if (!/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
        if (!sc || el.scrollHeight > sc.scrollHeight) sc = el;
      }
      if (sc) total = sc.scrollHeight - sc.clientHeight;
    }
    const go = (y) => (sc ? sc.scrollTo({ top: y, behavior: 'instant' }) : scrollTo({ top: y, behavior: 'instant' }));
    const cur = () => (sc ? sc.scrollTop : scrollY);
    let y = 0, n = 0, maxReal = 0; const s = performance.now(); const step = Math.max(8, total / 150);
    const done = () => { maxReal = Math.max(maxReal, cur()); resolve({ frames: n, ms: Math.round(performance.now() - s), planned: Math.round(total), reached: Math.round(maxReal), endY: Math.round(cur()), scroller: sc ? sc.tagName.toLowerCase() + (sc.id ? '#' + sc.id : '') : 'document', share: total > 0 ? Math.round(Math.min(1, maxReal / total) * 1000) / 1000 : null }); };
    if (total < 2) { resolve({ frames: 0, ms: 0, planned: 0, reached: 0, endY: 0, scroller: 'document', share: null }); return; }
    rw.scrollStart = performance.now();
    /* положение читается в начале следующего кадра: к этому времени обработчики прокрутки сайта
       (заставка, «держатель») уже вернули страницу, и в счёт идёт то, где она осталась */
    const f = () => { if (n) maxReal = Math.max(maxReal, cur()); y += step; go(Math.min(y, total)); n++; if (y < total && performance.now() - s < 10000) requestAnimationFrame(f); else setTimeout(done, 60); };
    requestAnimationFrame(f);
  });
}

/* картинки: плотность показа с учётом object-fit / background-size; видео первого экрана.
   Свободные переменные eff и sig — из lib.mjs (evaluateWith). */
async function mediaInPage() {
  const dpr = devicePixelRatio; const need = Math.min(dpr, 2); const TOL = 0.97;
  /* адрес для вывода: чужой хост и хвост пути — по «1.jpg» не видно, что это заглушка …/-/resizeb/20x/1.jpg */
  const short = (u) => { if (!u) return ''; if (/^data:/i.test(u)) return u.slice(0, 30) + '…'; try { const p = new URL(u, location.href); const segs = p.pathname.split('/').filter(Boolean); const tail = segs.slice(-4).join('/'); return ((p.host !== location.host ? p.host : '') + (segs.length > 4 ? '/…/' : '/') + tail).slice(-100); } catch (e) { return String(u).slice(0, 100); } };
  /* заглушка ленивой загрузки: крошечная картинка (≤ 64 px по стороне) в коробке от 200 px и признак
     ленивой загрузки — адрес заглушки (Tilda …/-/resize/20x/, …/-/empty/, lqip, placeholder, blank)
     или атрибут с настоящим адресом (data-original, data-src, data-bg…), который ещё не подставлен,
     или класс lazy без loaded; без признаков — если картинка не больше 32 px (растянута в 6+ раз).
     PH_URL — из lib.mjs (подставляется evaluateWith) */
  const LAZY_ATTRS = ['data-original', 'data-src', 'data-lazy', 'data-lazy-src', 'data-bg', 'data-background', 'data-background-image', 'data-srcset', 'data-lazy-srcset', 'data-bgset'];
  const abs = (u) => { try { return new URL(String(u).trim().split(/[\s,]+/)[0], location.href).href; } catch (e) { return String(u); } };
  const lazyEvidence = (el, cur) => {
    const curAbs = cur ? abs(cur) : '';
    for (const host of [el, el.parentElement && el.parentElement.tagName === 'PICTURE' ? el.parentElement : null]) {
      if (!host) continue;
      for (const a of LAZY_ATTRS) { const v = host.getAttribute(a); if (v && v.trim() && !/^data:/i.test(v.trim()) && abs(v) !== curAbs) return a; }
    }
    const cls = typeof el.className === 'string' ? el.className : '';
    if (/(^|[\s_-])lazy/i.test(cls) && !/lazy-?loaded/i.test(cls)) return `класс ${cls.split(/\s+/).find((c) => /lazy/i.test(c))}`;
    return null;
  };
  const placeholderOf = (el, src, nw, nh, bw, bh) => {
    const tiny = (nw <= 64 && bw >= 200) || (nh <= 64 && bh >= 200); if (!tiny) return null;
    if (PH_URL.test(src || '')) return 'адрес заглушки';
    const ev = lazyEvidence(el, src); if (ev) return `ленивая загрузка: ${ev}`;
    if ((nw <= 32 && bw >= 200) || (nh <= 32 && bh >= 200)) return 'крошечная картинка, растянутая в 6+ раз';
    return null;
  };
  const isSvg = (u) => /^data:image\/svg|\.svg(\?|#|$)/i.test(u || '');
  const px = (v) => parseFloat(v) || 0;
  const splitTop = (str) => { const out = []; let depth = 0, cur = ''; for (const ch of String(str || '')) { if (ch === '(') depth++; else if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; } cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const urlsOf = (layer) => [...String(layer).matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map((m) => m[2]).filter(Boolean);
  const cache = new Map();
  const realSize = (src) => { if (!cache.has(src)) cache.set(src, new Promise((res) => { const im = new Image(); const t = setTimeout(() => res(null), 6000); im.onload = () => { clearTimeout(t); res(im.naturalWidth ? { w: im.naturalWidth, h: im.naturalHeight } : null); }; im.onerror = () => { clearTimeout(t); res(null); }; im.src = src; })); return cache.get(src); };
  const densityOf = (fit, bw, bh, nw, nh) => {
    const sx = bw / nw, sy = bh / nh; let s;
    if (fit === 'contain') s = Math.min(sx, sy); else if (fit === 'none') s = 1; else if (fit === 'scale-down') s = Math.min(1, Math.min(sx, sy)); else s = Math.max(sx, sy); /* cover и fill (худшая ось) */
    return s > 0 ? 1 / s : null;
  };
  const items = []; let notLoaded = 0, checked = 0;
  const imgs = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.width >= 64 && r.height >= 48 && eff(i) > 0.05; });
  /* подождать то, что ещё грузится (сеть замедлена), но не дольше 5 с на всё */
  await Promise.race([Promise.all(imgs.filter((i) => !i.complete).map((i) => i.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 5000))]);
  for (const img of imgs) {
    const src = img.currentSrc || img.src; if (!src || isSvg(src)) continue;
    if (!img.naturalWidth) { notLoaded++; continue; }
    const r = img.getBoundingClientRect(); const s = getComputedStyle(img);
    const kx = img.offsetWidth ? r.width / img.offsetWidth : 1, ky = img.offsetHeight ? r.height / img.offsetHeight : 1;
    const bw = (img.clientWidth - px(s.paddingLeft) - px(s.paddingRight)) * kx, bh = (img.clientHeight - px(s.paddingTop) - px(s.paddingBottom)) * ky;
    if (bw < 8 || bh < 8) continue;
    let nw = img.naturalWidth, nh = img.naturalHeight, how = 'natural';
    if (img.srcset || img.getAttribute('sizes') || (img.parentElement && img.parentElement.tagName === 'PICTURE')) { const z = await realSize(src); if (z) { nw = z.w; nh = z.h; how = 'файл'; } }
    const d = densityOf(s.objectFit, bw, bh, nw, nh); if (d == null) continue;
    const ph = placeholderOf(img, src, nw, nh, bw, bh);
    if (!ph) checked++;
    items.push({ kind: 'img', el: sig(img), src: short(src), url: src.slice(0, 300), natural: `${nw}×${nh}`, box: `${Math.round(bw)}×${Math.round(bh)}`, fit: s.objectFit, density: Math.round(d * 100) / 100, sizeFrom: how, placeholder: ph });
  }
  for (const v of document.querySelectorAll('video[poster]')) {
    const r = v.getBoundingClientRect(); if (r.width < 64 || r.height < 48 || eff(v) <= 0.05) continue;
    const src = v.poster; if (!src || isSvg(src)) continue;
    const z = await realSize(src); if (!z) { notLoaded++; continue; }
    const s = getComputedStyle(v); const d = densityOf(s.objectFit === 'fill' ? 'contain' : s.objectFit, r.width, r.height, z.w, z.h); if (d == null) continue;
    checked++;
    items.push({ kind: 'poster', el: sig(v), src: short(src), url: src.slice(0, 300), natural: `${z.w}×${z.h}`, box: `${Math.round(r.width)}×${Math.round(r.height)}`, fit: s.objectFit, density: Math.round(d * 100) / 100, sizeFrom: 'файл', placeholder: null });
  }
  const bgEls = document.body ? [...document.body.querySelectorAll('*')] : [];
  for (const el of bgEls) {
    for (const pseudo of [null, '::before', '::after']) {
      const s = getComputedStyle(el, pseudo);
      if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
      const bi = s.backgroundImage; if (!bi || bi === 'none' || !/url\(/.test(bi)) continue;
      const r = el.getBoundingClientRect();
      let bw, bh;
      if (pseudo) { bw = px(s.width); bh = px(s.height); if (!bw || !bh) continue; } else { const kx = el.offsetWidth ? r.width / el.offsetWidth : 1, ky = el.offsetHeight ? r.height / el.offsetHeight : 1; bw = el.clientWidth * kx; bh = el.clientHeight * ky; }
      if (bw < 64 || bh < 48 || eff(el) <= 0.05 || (pseudo && parseFloat(s.opacity) <= 0.05)) continue;
      const layers = splitTop(bi), sizes = splitTop(s.backgroundSize), reps = splitTop(s.backgroundRepeat), atts = splitTop(s.backgroundAttachment);
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i]; const us = urlsOf(layer).filter((u) => !isSvg(u)); if (!us.length) continue;
        const size = (sizes[i % sizes.length] || 'auto').trim(); const rep = (reps[i % reps.length] || 'repeat').trim();
        const photo = /cover/.test(size) || /^no-repeat( no-repeat)?$/.test(rep); if (!photo) continue; /* узор с повтором — не фото */
        if (/image-set\(/.test(layer) && /^auto( auto)?$/.test(size)) continue; /* размер зависит от плотности источника — не определить */
        let z = null, zsrc = us[0]; for (const u of us) { const q = await realSize(u); if (q && (!z || q.w > z.w)) { z = q; zsrc = u; } }
        if (!z) { notLoaded++; continue; }
        let W = bw, H = bh; if ((atts[i % atts.length] || '').trim() === 'fixed') { W = innerWidth; H = innerHeight; }
        let d;
        if (size === 'cover') d = densityOf('cover', W, H, z.w, z.h);
        else if (size === 'contain') d = densityOf('contain', W, H, z.w, z.h);
        else {
          const [a, b = 'auto'] = size.split(/\s+/);
          const len = (v, base) => (v === 'auto' ? null : /%$/.test(v) ? base * parseFloat(v) / 100 : px(v));
          const pw = len(a, W), ph = len(b, H);
          if (pw && ph) d = Math.min(z.w / pw, z.h / ph); else if (pw) d = z.w / pw; else if (ph) d = z.h / ph; else d = 1;
        }
        if (!(d > 0)) continue;
        const ph = placeholderOf(el, zsrc, z.w, z.h, W, H);
        if (!ph) checked++;
        items.push({ kind: 'фон', el: sig(el) + (pseudo || ''), src: short(zsrc), url: String(zsrc).slice(0, 300), natural: `${z.w}×${z.h}`, box: `${Math.round(W)}×${Math.round(H)}`, fit: `background-size:${size}`, density: Math.round(d * 100) / 100, sizeFrom: 'файл', placeholder: ph });
      }
    }
  }
  /* LAZY — заглушка ленивой загрузки не догрузилась: плотность не мерится (иначе ложный FAIL «размыто») */
  for (const it of items) it.status = it.placeholder ? 'LAZY' : it.density < TOL ? 'FAIL' : it.density < need * TOL ? 'WARN' : it.density > Math.max(dpr, 1) * 1.5 ? 'BIG' : 'OK';
  const videos = [...document.querySelectorAll('video')].filter((v) => { const r = v.getBoundingClientRect(); return r.width >= 24 && r.height >= 24 && eff(v) > 0.05; }).map((v) => {
    const r = v.getBoundingClientRect(); const srcEl = v.querySelector('source[src]');
    return { el: sig(v), src: v.currentSrc || v.src || (srcEl ? srcEl.src : ''), poster: v.getAttribute('poster') || '', autoplay: v.autoplay, muted: v.muted, loop: v.loop, preload: v.preload, first: r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0, w: Math.round(r.width), h: Math.round(r.height), videoSize: v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : null };
  });
  return { dpr, need, checked, notLoaded, items, videos, scrollY: Math.round(scrollY) };
}

/* ---------- запросы, тишина сети, кэш ---------- */
/* текстовые ответы — их сжимает хостинг (те же типы, что сжимает serve.mjs) */
const TEXT_MIME = /^(text\/|application\/(javascript|x-javascript|ecmascript|json|ld\+json|manifest\+json|xml|xhtml\+xml|rss\+xml|atom\+xml|wasm)|image\/svg\+xml|model\/gltf\+json)/i;
/* потоки сами не затихают: видео и аудио докачиваются по ходу показа; маяки (sendBeacon) и отчёты CSP
   страница не ждёт — и тишину они не держат */
const isStream = (r) => ['Media', 'WebSocket', 'EventSource', 'Ping', 'CSPViolationReport'].includes(r.type) || /^(video|audio)\//i.test(r.mime || '') || r.status === 206 || /^(data|blob):/i.test(r.url || '');
const QUIET_MS = 1000, QUIET_MAX = 20000;
/* передано по сети: у завершённого — итог CDP (заголовки и тело), у недокачанного и оборванного — сколько пришло */
const sent = (r) => (r.done && !r.failed ? r.bytes : r.hdrBytes + r.encLen);
const fileOf = (u) => { const s = String(u || ''); if (/^data:/i.test(s)) return s.slice(0, 24) + '…'; return (s.split(/[?#]/)[0].split('/').filter(Boolean).pop() || s).slice(0, 60); };
const kind = (r) => { const t = (r.type || '').toLowerCase(); const mm = r.mime || ''; if (t === 'document') return 'html'; if (t === 'script' || /javascript/.test(mm)) return 'js'; if (t === 'stylesheet' || /css/.test(mm)) return 'css'; if (t === 'image' || /^image\//.test(mm)) return 'images'; if (t === 'font' || /font/.test(mm)) return 'fonts'; if (t === 'media' || /^(video|audio)\//.test(mm)) return 'media'; if (t === 'xhr' || t === 'fetch') return 'api'; return 'other'; };
/* вес прогона — запрошенное до прокрутки замера (загрузка и после load), каждый файл целиком */
function weightOf(s) {
  const list = s.reqs.filter((r) => r.phase === 'load'); const by = {};
  for (const r of list) { const k = kind(r); by[k] = by[k] || { count: 0, kb: 0 }; by[k].count++; by[k].kb += sent(r) / 1024; }
  for (const k in by) by[k].kb = Math.round(by[k].kb);
  return { by, totalKb: Math.round(list.reduce((a, r) => a + sent(r), 0) / 1024), count: list.length };
}

/* тишина сети: ни одного запроса в полёте (кроме потоков) QUIET_MS подряд, не дольше QUIET_MAX.
   networkidle2 отпускает страницу, пока качаются ещё два файла, — модуль на 700 КБ то успевал к замеру, то нет */
async function waitQuiet(reqs) {
  const t0 = Date.now(); const flying = () => [...reqs.values()].filter((r) => !r.done && !isStream(r));
  const atLoad = flying(); const known = new Set(reqs.keys());
  let since = null;
  for (;;) {
    if (flying().length) since = null; else if (since == null) since = Date.now();
    if (since != null && Date.now() - since >= QUIET_MS) break;
    if (Date.now() - t0 >= QUIET_MAX) break;
    await sleep(100);
  }
  const left = flying();
  return {
    at: left.length || since == null ? null : since - t0, waitedMs: Date.now() - t0,
    atLoad: atLoad.map((r) => ({ file: fileOf(r.url), kb: Math.round(sent(r) / 1024), done: r.done })),
    startedAfter: [...reqs.keys()].filter((id) => !known.has(id)).length,
    left: left.map((r) => ({ file: fileOf(r.url), url: r.url.slice(0, 200), kbSoFar: Math.round(sent(r) / 1024) })),
  };
}

/* из кэша: диск, память, предзагрузка, service worker. Файл, который эта же страница уже скачала по
   сети и взяла повторно из памяти, — не тёплый кэш: считается отдельно (reused); data: и blob: Chrome
   всегда отдаёт «из памяти» — это не кэш, не считаются */
function cacheOf(list) {
  const seen = new Set(); let hits = 0, reused = 0; const by = {}; const files = [];
  for (const r of [...list].sort((a, b) => a.t0 - b.t0)) {
    if (/^(data|blob):/i.test(r.url)) continue;
    if (!r.cache) { seen.add(r.url); continue; }
    if (seen.has(r.url)) { reused++; continue; }
    hits++; by[r.cache] = (by[r.cache] || 0) + 1; if (files.length < 8) files.push(`${fileOf(r.url)} (${r.cache})`);
  }
  return { hits, reused, by, files, responses: list.filter((r) => r.status).length };
}

/* тела текстовых ответов веса — для оценки «со сжатием / без сжатия»; не больше 64 МБ на прогон */
async function textBodies(cdp, reqs) {
  let total = 0;
  for (const r of reqs.values()) {
    if (r.phase !== 'load' || !r.done || r.failed || r.cache || !TEXT_MIME.test(r.mime || '') || r.status < 200 || r.status >= 300 || total > 64 * MB) continue;
    try { const b = await cdp.send('Network.getResponseBody', { requestId: r.id }); r.body = b.base64Encoded ? Buffer.from(b.body, 'base64') : Buffer.from(b.body, 'utf8'); total += r.body.length; } catch { /* тела нет — без оценки для этого ответа */ }
  }
}

/* ---------- LCP и долгие задачи по фазам ---------- */
/* LCP для вердикта — последний кандидат до начала прокрутки замера: человек своей прокруткой LCP
   останавливает, прокрутку скриптом Chrome не замечает. До прокрутки кандидатов нет — первый после */
function lcpOf(m) {
  const ss = m.scrollStart; const list = m.lcpCandidates || [];
  const before = list.filter((c) => ss == null || c.t < ss), after = list.filter((c) => ss != null && c.t >= ss);
  const el = before.length ? before[before.length - 1] : after[0] || null;
  return { lcp: el ? el.t : null, lcpEl: el, lcpFrom: before.length ? 'load' : after.length ? 'scroll' : null, lcpAfterScroll: after, lcpAll: list.length ? list[list.length - 1].t : null };
}
/* фаза задачи — по её началу: загрузка — до конца события load, после load — до начала прокрутки замера */
const PHASE = { load: 'загрузка', afterLoad: 'после load', scroll: 'прокрутка замера' };
function longOf(m) {
  const ss = m.scrollStart;
  const tasks = (m.longList || []).map((t) => ({ ...t, phase: ss != null && t.start >= ss ? 'scroll' : m.load && t.start >= m.load ? 'afterLoad' : 'load' }));
  const sum = (p) => { const a = tasks.filter((t) => t.phase === p); return { n: a.length, ms: a.reduce((x, t) => x + t.dur, 0) }; };
  const phases = { load: sum('load'), afterLoad: sum('afterLoad'), scroll: sum('scroll') };
  return { longList: tasks, longPhases: phases, longVerdict: phases.load.ms + phases.afterLoad.ms, longTotal: tasks.reduce((x, t) => x + t.dur, 0), longTasks: tasks.length };
}
/* сдвиги вёрстки по фазам (как долгие задачи — по времени сдвига) и три крупнейших; сдвиги сразу после
   ввода человека (hadRecentInput) в CLS не идут и здесь не считаются */
function clsOf(m) {
  const ss = m.scrollStart;
  const list = (m.shifts || []).map((s) => ({ ...s, phase: ss != null && s.t >= ss ? 'scroll' : m.load && s.t >= m.load ? 'afterLoad' : 'load' }));
  const real = list.filter((s) => !s.input);
  const sum = (p) => Math.round(real.filter((s) => s.phase === p).reduce((a, s) => a + s.v, 0) * 1000) / 1000;
  return { clsPhases: { load: sum('load'), afterLoad: sum('afterLoad'), scroll: sum('scroll') }, clsTop: [...real].sort((a, b) => b.v - a.v).slice(0, 3), clsShifts: list };
}
/* LCP сменился: среди кандидатов до прокрутки замера другой элемент (или другой файл у того же) стал
   крупнейшим позже, чем через LCP_GAP после прежнего, — картинка после картинки или текст после текста, на
   том же месте (верх ±60 px, площадь не больше чем втрое) или с классом слайда. Так бывает у автослайдера
   (второй кадр крупнее первого) и анимации появления, а не у медленной загрузки: тогда LCP по первому
   элементу — время прежнего кандидата */
const LCP_GAP = 1500;
const SLIDE_RE = /slide|swiper|carousel|slick|splide|glide|flick|owl|gallery|marquee|ticker/i;
function lcpSwitchOf(m) {
  const ss = m.scrollStart; const before = (m.lcpCandidates || []).filter((c) => ss == null || c.t < ss);
  const key = (c) => `${c.el}|${c.url || c.text || ''}`;
  for (let i = 1; i < before.length; i++) {
    const a = before[i - 1], b = before[i];
    if (key(a) === key(b) || b.t - a.t < LCP_GAP || !!a.url !== !!b.url) continue;
    const place = a.top != null && b.top != null && Math.abs(a.top - b.top) <= 60 && (!a.size || b.size / a.size <= 3);
    const slide = SLIDE_RE.test(`${b.el} ${b.where || ''}`);
    if (place || slide) return { at: b.t, to: b, from: a, why: [place ? 'на том же месте' : '', slide ? 'класс слайда' : ''].filter(Boolean).join(', ') };
  }
  return null;
}

/* ---------- один прогон: свежий браузер, холодный кэш ---------- */
async function measure() {
  const browser = await launch();
  try {
    /* холодный кэш: у прогона свой браузер со своим временным профилем, внутри — отдельный контекст
       (кэш только в памяти, без куки), и кэш очищается перед заходом */
    const ctx = await browser.createBrowserContext();
    const page = await preparePage(ctx, vp, { trackBytes: false });
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable', { maxTotalBufferSize: 200 * MB, maxResourceBufferSize: 32 * MB }); /* тела текста до 32 МБ — для оценки сжатия */
    await cdp.send('Network.clearBrowserCache').catch(() => {});
    if (NET[netName]) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NET[netName] });
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await cdp.send('Performance.enable');
    /* запросы по requestId; phase — когда начался: load (загрузка и после load, до прокрутки замера —
       это вес), scroll (прокрутка замера), lazy (проход за ленивым) */
    let phase = 'load';
    const reqs = new Map();
    const hdr = (h, name) => { for (const k of Object.keys(h || {})) if (k.toLowerCase() === name) return h[k]; return null; };
    const rec = (id) => { let r = reqs.get(id); if (!r) { r = { id, phase, url: '', type: '', mime: '', status: 0, enc: null, cache: null, bytes: 0, hdrBytes: 0, dataLen: 0, encLen: 0, done: false, failed: null, total: null, t0: Date.now() }; reqs.set(id, r); } return r; };
    cdp.on('Network.requestWillBeSent', (e) => { const r = rec(e.requestId); r.url = e.request.url; if (e.type) r.type = e.type; });
    cdp.on('Network.requestServedFromCache', (e) => { rec(e.requestId).cache = 'memory'; });
    cdp.on('Network.responseReceived', (e) => {
      const r = rec(e.requestId); const h = e.response.headers; const cr = hdr(h, 'content-range'); const cl = hdr(h, 'content-length');
      r.url = e.response.url || r.url; r.type = e.type || r.type; r.mime = e.response.mimeType || ''; r.status = e.response.status;
      r.hdrBytes = e.response.encodedDataLength || 0; r.enc = String(hdr(h, 'content-encoding') || '').trim().toLowerCase() || null;
      r.total = cr && /\/(\d+)\s*$/.test(cr) ? Number(/\/(\d+)\s*$/.exec(cr)[1]) : e.response.status === 200 && cl ? Number(cl) : null;
      if (e.response.fromDiskCache) r.cache = 'disk'; else if (e.response.fromPrefetchCache) r.cache = 'prefetch'; else if (e.response.fromServiceWorker) r.cache = 'service worker';
    });
    cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.dataLen += e.dataLength || 0; r.encLen += e.encodedDataLength || 0; } });
    cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.done = true; r.bytes = e.encodedDataLength || 0; } });
    cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.done = true; r.failed = e.canceled ? 'отменён' : e.errorText || 'сбой'; } });

    await page.evaluateOnNewDocument(() => {
      const rw = window.__rw = { lcp: [], cls: 0, long: [], scrollStart: null, scrollEnd: null };
      const sig = (el) => { const c = typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || ''; return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c.trim() ? '.' + c.trim().split(/\s+/).slice(0, 2).join('.') : ''); };
      /* элемент кандидата LCP описывается сразу: потом его могут убрать или перерисовать */
      const describe = (el) => {
        if (!el || !el.tagName) return { el: '(элемент уже убран со страницы)' };
        let where = null; for (let p = el.parentElement, i = 0; p && p !== document.body && i < 10; p = p.parentElement, i++) if (p.id) { where = sig(p); break; }
        const r = el.getBoundingClientRect(); const se = document.scrollingElement || document.documentElement;
        const text = /^(img|video|image|svg|canvas)$/i.test(el.tagName) ? '' : String(el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        return { el: sig(el), where, text, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + (se.scrollTop || 0)), vh: innerHeight };
      };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) rw.lcp.push({ t: Math.round(e.startTime), size: Math.round(e.size || 0), url: String(e.url || '').slice(0, 300), ...describe(e.element) }); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* нет */ }
      /* сдвиги вёрстки с источниками (LayoutShiftAttribution): что сдвинулось, откуда и куда (коробки в
         координатах окна), когда. Узел описывается сразу — потом его могут убрать; не больше 300 сдвигов */
      rw.shifts = [];
      const box = (q) => (q ? { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) } : null);
      /* начало текста: textContent склеивал строки через <br> и блоки («Забронировать<br>стол» →
         «Забронироватьстол»). Обход узлов до 40 знаков, script и style — мимо; пробел — у <br> и тегов-блоков
         (div, p, li, h1…), а со стилем (styled) — и у любого не строчного блока (flex-элемент a или span).
         В обработчике сдвигов — только без стиля: он работает внутри замеряемой загрузки, и getComputedStyle
         или clientWidth там заставляли страницу пересчитать стиль и раскладку — на /menu «Эпицентра» при
         процессоре ×4 это была своя долгая задача 127 мс в замере. Текст со стилем и размер окна — в refine() */
      const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|BUTTON|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LABEL|LI|MAIN|NAV|OL|OPTION|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;
      /* пробелы сжимаются сразу: отступы разметки — узлы из одних пробелов, и без сжатия пять таких узлов
         (55 знаков на глубине 3–7) съедали предел — от «Ресторан Мосты 2 этаже…» оставалось «Ресторан» */
      const textOf = (el, styled) => {
        let out = ''; let steps = 0;
        const w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeType === 1 && /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
        for (let n = w.nextNode(); n && out.length < 60 && steps < 400; n = w.nextNode(), steps++) {
          if (n.nodeType === 3) { const t = n.data.replace(/\s+/g, ' '); out += !out || out.endsWith(' ') ? t.replace(/^ /, '') : t; continue; }
          if (!out || out.endsWith(' ')) continue;
          if (BLOCK.test(n.tagName)) { out += ' '; continue; }
          if (styled) { const d = getComputedStyle(n).display; if (d && d !== 'contents' && !/^inline/.test(d)) out += ' '; }
        }
        return out.trim().slice(0, 40).trimEnd();
      };
      rw.shiftNodes = [];
      const lite = (el) => { let where = null; for (let p = el.parentElement, i = 0; p && p !== document.body && i < 10; p = p.parentElement, i++) if (p.id) { where = sig(p); break; } rw.shiftNodes.push(el); return { el: sig(el), where, text: textOf(el, false), ni: rw.shiftNodes.length - 1 }; };
      /* после замера (perf зовёт перед чтением сдвигов, вне окон вердикта): текст со стилем — у узлов, которые
         ещё на странице и чей текст с момента сдвига не менялся (исчезнувший блок, который скрипт потом
         переписал, остаётся с текстом на момент сдвига: «Ресторан Мосты 2 этаже…», а не «Ресторан»); у всех
         источников — размер окна без полос прокрутки (vw, vh): коробки источника — видимая часть в окне, и
         уход края за окно нельзя выдавать за смену высоты или ширины. Меньшее из innerWidth и clientWidth:
         полоса прокрутки могла появиться посреди загрузки */
      rw.refine = () => {
        const de = document.documentElement; const std = document.compatMode === 'CSS1Compat' && de;
        const V = { vw: Math.min(innerWidth, std && de.clientWidth ? de.clientWidth : innerWidth), vh: Math.min(innerHeight, std && de.clientHeight ? de.clientHeight : innerHeight) };
        for (const sh of rw.shifts) {
          for (const s of sh.sources) {
            if (s.ni != null) { const n = rw.shiftNodes[s.ni]; if (n && n.isConnected && textOf(n, false) === s.text) s.text = textOf(n, true); delete s.ni; }
            Object.assign(s, V);
          }
        }
      };
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            if (!e.hadRecentInput) rw.cls += e.value;
            if (rw.shifts.length >= 300) continue;
            rw.shifts.push({ t: Math.round(e.startTime), v: Math.round(e.value * 10000) / 10000, input: !!e.hadRecentInput, sources: (e.sources || []).slice(0, 5).map((s) => {
              const n = s.node; const el = n && n.nodeType === 1 ? n : n && n.parentElement ? n.parentElement : null;
              const d = el ? lite(el) : { el: '(узел уже убран со страницы)', where: null, text: '' };
              return { ...d, el: d.el + (n && n.nodeType === 3 ? ' (текст)' : ''), prev: box(s.previousRect), cur: box(s.currentRect) };
            }) });
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch { /* нет */ }
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) rw.long.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true }); } catch { /* нет */ }
    });

    const t0 = Date.now();
    await gotoRetry(page, url, { timeout: 90000 });
    const loadMs = Date.now() - t0;
    /* окно замера: дождаться всего, что страница начала качать до тишины (модули после load тоже) */
    const quiet = await waitQuiet(reqs);
    await forceInstantScroll(page);
    await sleep(1500);
    const idleFps = await page.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
    /* прокрутка: кадры во время настоящей прокрутки, попутно CLS и ленивые картинки */
    phase = 'scroll';
    const scroll = await page.evaluate(scrollInPage);
    await sleep(800);
    await page.evaluate(() => { const se = document.scrollingElement || document.documentElement; scrollTo({ top: 0, behavior: 'instant' }); se.scrollTop = 0; }); await sleep(500);
    /* показатели загрузки и памяти — сразу после замера прокрутки, до прохода за ленивым (он догружает
       картинки и сдвигал бы CLS относительно прежних замеров) */
    const m = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0] || {}; const p = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]));
      const rw = window.__rw || {}; const r0 = (v) => (v == null ? null : Math.round(v));
      /* текст источников сдвига со стилем и размер окна — сейчас, после замера, а не в обработчике */
      try { if (rw.refine) rw.refine(); } catch { /* страница переопределила что-то своё — текст без стиля */ }
      return { ttfb: Math.round(n.responseStart || 0), domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0), fcp: p['first-contentful-paint'] || null, lcpCandidates: rw.lcp || [], cls: Math.round((rw.cls || 0) * 1000) / 1000, shifts: rw.shifts || [], longList: rw.long || [], scrollStart: r0(rw.scrollStart), scrollEnd: r0(rw.scrollEnd), nodes: document.getElementsByTagName('*').length, images: [...document.images].filter((i) => i.naturalWidth > 0).length, fonts: [...document.fonts].filter((f) => f.status === 'loaded').length, canvases: document.querySelectorAll('canvas').length, animations: document.getAnimations().length };
    });
    Object.assign(m, lcpOf(m), longOf(m), clsOf(m)); m.lcpSwitch = lcpSwitchOf(m);
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    /* тела текстовых ответов — до прохода за ленивым: его картинки вытесняли бы их из буфера DevTools */
    await textBodies(cdp, reqs);
    /* плотность картинок: сначала проход с паузами и ожиданием картинок в кадре — быстрый проход замера
       кадров/с (~2 с) ленивые не успевают догрузить, и фоны оставались заглушками …/-/resizeb/20x/ */
    phase = 'lazy';
    const t1 = Date.now();
    const lazyPass = await scrollThrough(page, { pause: 350, onStep: () => waitForMedia(page, { timeout: 1500 }) }).catch((e) => ({ error: String(e.message || e).slice(0, 120) }));
    await scrollToY(page, 0).catch(() => {}); await waitForMedia(page, { timeout: 3000 });
    const lazyMs = Date.now() - t1;
    const media = await evaluateWith(page, mediaInPage, null, { eff: EFFECTIVE_OPACITY_FN, sig: SIG_FN, PH_URL }).catch((e) => ({ error: String(e.message || e).slice(0, 200), items: [], videos: [], checked: 0, notLoaded: 0 }));
    media.lazyPass = { ms: lazyMs, steps: lazyPass.screens ?? null, error: lazyPass.error || null };
    const list = [...reqs.values()];
    /* вес — запрошенное до прокрутки замера (phase load); прокрутка замера и проход за ленивым — отдельно */
    return { loadMs, quiet, m, reqs: list, cache: cacheOf(list), idleFps, scroll, media, fpsScroll: scroll.ms ? Math.round(scroll.frames / scroll.ms * 1000) : null, heapMb: Math.round((metrics.JSHeapUsedSize || 0) / 1048576), scriptMs: Math.round((metrics.ScriptDuration || 0) * 1000), layoutCount: metrics.LayoutCount, styleRecalcs: metrics.RecalcStyleCount };
  } finally { await browser.close(); }
}

/* ---------- цена слоя фактуры: трассировка покоя со слоем и без ---------- */
const TRACE_CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'disabled-by-default-devtools.timeline.frame'];
async function traceIdle(page, ms = 2000) {
  await page.tracing.start({ categories: TRACE_CATS });
  await sleep(ms);
  const buf = await page.tracing.stop();
  const ev = JSON.parse(Buffer.from(buf).toString('utf8')); const events = ev.traceEvents || ev;
  const of = (name) => events.filter((e) => e.name === name && (e.ph === 'X' || e.ph === 'B'));
  const raster = of('RasterTask'), paint = of('Paint');
  const dur = (list) => Math.round(list.reduce((a, e) => a + (e.dur || 0), 0) / 100) / 10;
  return { raster: raster.length, paint: paint.length, rasterMs: dur(raster), paintMs: dur(paint) };
}
async function overlayCost() {
  const browser = await launch();
  try {
    const page = await openPage(browser, url, vp, { settle: 3000 });
    const cdp = await page.createCDPSession();
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await forceInstantScroll(page);
    await scrollThrough(page, { pause: 200 });
    await scrollToY(page, 0); await settleAnimations(page, 3000); await sleep(500);
    let layers = []; let hide, show;
    const hideInfo = { via: null }; /* как прятался слой: 'style' или 'adopted' (строгий CSP) */
    if (typeof opt.overlay === 'string') {
      const sel = opt.overlay; const host = sel.replace(/::?(before|after)\s*$/i, '').trim() || '*';
      const found = await page.evaluate((h) => { try { return document.querySelectorAll(h).length; } catch (e) { return -1; } }, host);
      if (found < 0) return { error: `неверный селектор «${sel}»` };
      if (!found) return { found: false, note: `селектор «${sel}» ничего не нашёл` };
      layers = [{ el: sel, how: 'селектор' }];
      /* строгий CSP молча не применял <style>: «без слоя» мерился со слоем. setPageStyle тогда ставит
         таблицу adoptedStyleSheets; не вставилось никак — ошибка, цена слоя «не измерена» (WARN) */
      const css = `${sel}{visibility:hidden!important;opacity:0!important}`;
      hide = async () => { hideInfo.via = await setPageStyle(page, 'overlay-hide', css); if (!hideInfo.via) throw new Error(`${CSP_NO_STYLE} — слой не спрятать`); };
      show = () => dropPageStyle(page, 'overlay-hide');
    } else {
      const f = await findTextureLayers(page, { mark: true });
      const big = f.layers.filter((L) => L.coversViewport || ((L.position === 'fixed' || L.fixedBy) && L.rect.w >= f.vw * 0.6 && L.rect.h >= f.vh * 0.4));
      if (!big.length) return { found: false, note: `полноэкранных слоёв фактуры не найдено (всего слоёв ${f.layers.length})` };
      layers = big.map((L) => ({ el: L.el + (L.pseudo || ''), blend: L.mixBlendMode, opacity: L.effectiveOpacity, animation: L.animation || (L.animChain && L.animChain.length ? L.animChain.join('; ') : null), how: 'texture.mjs' }));
      hide = () => hideTextureLayers(page, big, hideInfo); show = () => showTextureLayers(page);
    }
    const out = { found: true, layers, rounds, order: [], with: [], without: [] };
    for (let r = 0; r < rounds; r++) {
      const order = r % 2 === 0 ? ['with', 'without'] : ['without', 'with'];
      for (const v of order) {
        if (v === 'with') await show(); else await hide();
        await sleep(1000); /* перерисовка от самого переключения — не в счёт */
        const t = await traceIdle(page, 2000);
        out[v].push(t); out.order.push(v);
        process.stdout.write(`  раунд ${r + 1} ${v === 'with' ? 'со слоем' : 'без слоя'}: RasterTask ${t.raster}, Paint ${t.paint}\n`);
      }
    }
    await show();
    out.hideVia = hideInfo.via;
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    const stat = (list, k) => { const a = list.map((x) => x[k]); return { median: med(a), min: Math.min(...a), max: Math.max(...a), all: a }; };
    out.stats = {};
    for (const v of ['with', 'without']) out.stats[v] = { raster: stat(out[v], 'raster'), paint: stat(out[v], 'paint'), rasterMs: stat(out[v], 'rasterMs') };
    const W = out.stats.with, N = out.stats.without;
    out.extraRaster = W.raster.median - N.raster.median; out.extraPaint = W.paint.median - N.paint.median;
    out.separated = { raster: W.raster.min > N.raster.max, paint: W.paint.min > N.paint.max };
    out.status = (out.extraRaster > 2 && out.separated.raster) || (out.extraPaint > 2 && out.separated.paint) ? 'WARN' : 'OK';
    return out;
  } finally { await browser.close(); }
}

/* ---------- прогоны ---------- */
const sec = (ms) => `${Math.round(ms / 100) / 10} с`;
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const answers = (n) => `${n} ${plural(n, 'ответ', 'ответа', 'ответов')}`;
const samples = [];
if (!opt['overlay-only']) {
  for (let i = 0; i < runs; i++) {
    process.stdout.write(`· прогон ${i + 1}/${runs} … `);
    try {
      const s = await measure(); samples.push(s); s.w = weightOf(s);
      const L = s.m.lcpEl, P = s.m.longPhases, c = s.cache;
      console.log(`LCP ${s.m.lcp ?? '—'} мс${L ? ` (${L.el}${s.m.lcpFrom === 'scroll' ? ', при прокрутке' : ''}${s.m.lcpSwitch ? `; сменился — до этого ${s.m.lcpSwitch.from.el} на ${s.m.lcpSwitch.from.t} мс` : ''})` : ''}${s.m.lcpAfterScroll.length ? `, при прокрутке замера ещё ${s.m.lcpAfterScroll.length}` : ''} · FCP ${s.m.fcp} мс · CLS ${s.m.cls} · долгие ${s.m.longVerdict} мс${P.scroll.ms ? ` (+ прокрутка замера ${P.scroll.ms})` : ''} · JS ${s.w.by.js ? s.w.by.js.kb : 0} КБ, всего ${s.w.totalKb} КБ · из кэша: ${c.hits}${c.reused ? ` (повторно с этой страницы ${c.reused})` : ''} · тишина сети ${s.quiet.at == null ? `не наступила за ${QUIET_MAX / 1000} с` : `+${sec(s.quiet.at)}`} · прокрутка до ${s.scroll.share == null ? '—' : Math.round(s.scroll.share * 100) + '%'}`);
    } catch (e) { console.log(`сбой: ${e.message}`); }
  }
  if (!samples.length) { console.error('FAIL: ни один прогон не удался'); process.exit(1); }
}
let overlay = null;
if (opt.overlay) {
  console.log(`Цена слоя фактуры: ${rounds} раундов по 2 с покоя со слоем и без${cpu > 1 ? `, процессор ×${cpu}` : ''} …`);
  try { overlay = await overlayCost(); } catch (e) { overlay = { error: e.message }; }
}

/* ---------- видео: полный размер файла ---------- */
async function headSize(u) {
  try {
    const r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    const cl = Number(r.headers.get('content-length') || 0); if (r.ok && cl) return cl;
  } catch { /* нет HEAD */ }
  try {
    const r = await fetch(u, { headers: { Range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    const cr = r.headers.get('content-range'); await r.body?.cancel().catch(() => {});
    if (cr && /\/(\d+)\s*$/.test(cr)) return Number(/\/(\d+)\s*$/.exec(cr)[1]);
  } catch { /* нет */ }
  return null;
}

/* ---------- сжатие текста: оценка по телам ответов ---------- */
const gzipAsync = promisify(zlib.gzip), brotliAsync = promisify(zlib.brotliCompress);
const packCache = new Map();
/* gzip уровня 6 и brotli качества 11 — как статический хостинг; одно тело в разных прогонах — один расчёт */
function packed(buf) {
  const key = crypto.createHash('sha1').update(buf).digest('hex');
  if (!packCache.has(key)) packCache.set(key, Promise.all([gzipAsync(buf, { level: 6 }), brotliAsync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })]).then(([g, b]) => ({ gzip: g.length, br: b.length })));
  return packCache.get(key);
}
const ZIP_MIN = 512, ZIP_JUDGE = 1024;
const zipped = (r) => !!r.enc && r.enc !== 'identity';
/* по типам: передано, без сжатия, со сжатием gzip и br. Сжатое сервером в «со сжатием» — как передано,
   в «без сжатия» — заголовки и распакованное тело; несжатое — наоборот. Судятся ответы от 1 КБ */
async function compressionOf(list) {
  await Promise.all(list.filter((r) => r.body && r.body.length).map(async (r) => {
    const raw = r.dataLen || r.body.length;
    const z = raw >= ZIP_MIN ? await packed(r.body) : { gzip: raw, br: raw };
    r.est = { raw, gzip: Math.min(z.gzip, raw), br: Math.min(z.br, raw) };
  }));
  const sums = {}; const total = { actual: 0, identity: 0, gzip: 0, br: 0 }; const judged = {};
  for (const r of list) {
    const k = kind(r), a = sent(r); const s = sums[k] || (sums[k] = { actual: 0, identity: 0, gzip: 0, br: 0 });
    const v = !r.est ? { actual: a, identity: a, gzip: a, br: a } : zipped(r) ? { actual: a, identity: r.hdrBytes + r.est.raw, gzip: a, br: a } : { actual: a, identity: a, gzip: r.hdrBytes + r.est.gzip, br: r.hdrBytes + r.est.br };
    for (const x in v) { s[x] += v[x]; total[x] += v[x]; }
    if (r.est && r.est.raw >= ZIP_JUDGE) { const j = judged[k] || (judged[k] = { n: 0, zipped: 0 }); j.n++; if (zipped(r)) j.zipped++; }
  }
  const kbOf = (s) => Object.fromEntries(Object.entries(s).map(([x, v]) => [x, Math.round(v / 1024)]));
  const all = Object.values(judged).reduce((a, j) => ({ n: a.n + j.n, zipped: a.zipped + j.zipped }), { n: 0, zipped: 0 });
  const status = (j) => (!j || !j.n ? 'n/a' : j.zipped === j.n ? 'all' : !j.zipped ? 'none' : 'partial');
  const plain = list.filter((r) => r.est && r.est.raw >= ZIP_JUDGE && !zipped(r)).sort((a, b) => b.est.raw - a.est.raw);
  return {
    levels: 'gzip 6, brotli 11', status: status(all), judged: all.n, compressed: all.zipped,
    encodings: [...new Set(list.filter((r) => r.est && zipped(r)).map((r) => r.enc))],
    statusByKind: Object.fromEntries(Object.entries(judged).map(([k, j]) => [k, { ...j, status: status(j) }])),
    uncompressed: plain.slice(0, 12).map((r) => ({ file: fileOf(r.url), kind: kind(r), kb: Math.round(r.est.raw / 1024), gzipKb: Math.round(r.est.gzip / 1024), brKb: Math.round(r.est.br / 1024) })),
    noBody: list.filter((r) => TEXT_MIME.test(r.mime || '') && !r.est && !r.cache && sent(r) >= ZIP_JUDGE).length,
    byKind: Object.fromEntries(Object.entries(sums).map(([k, s]) => [k, kbOf(s)])), total: kbOf(total),
  };
}

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const mbs = (b) => (b == null ? '?' : `${r2(b / MB)} МБ`);
/* источник сдвига словами: элемент, где он, куда и на сколько (коробки — в координатах окна). Объявление
   функции, а не const: selftest (он идёт раньше этой строки) проверяет её без браузера */
function shiftText(s) {
  if (!s) return '';
  const p = s.prev, c = s.cur; const empty = (q) => !q || (!q.w && !q.h);
  const who = `${s.el}${s.where ? ` в ${s.where}` : ''}${s.text ? ` «${s.text.length > 24 ? s.text.slice(0, 24) + '…' : s.text}»` : ''}`;
  if (empty(p) && !empty(c)) return `${who} — появился (y ${c.y}, ${c.w}×${c.h})`;
  if (!empty(p) && empty(c)) return `${who} — исчез (был y ${p.y}, ${p.w}×${p.h})`;
  if (empty(p) || empty(c)) return `${who} — коробки нет`;
  /* коробки — видимая часть в окне: край блока за краем окна обрезан. Блок, чей низ уехал за низ окна,
     «укорачивается» (mamuka.rest: y 687 → 702, «высота 206 → 198», а 702 + 198 = 900 — низ окна) — это не
     смена размера. Размер — только если ни в одной из коробок этот край не касается края окна (размер окна —
     в источнике, vw и vh; в старых протоколах его нет — тогда как раньше, по совпавшему краю). Сдвиг — по
     краю, который не обрезан: верх за верхом окна — по низу */
  const H = s.vh || 0, W = s.vw || 0;
  const cutT = (q) => q.y <= 0, cutL = (q) => q.x <= 0;
  const cutB = (q) => (H ? q.y + q.h >= H - 1 : false), cutR = (q) => (W ? q.x + q.w >= W - 1 : false);
  const T = cutT(p) || cutT(c), B = cutB(p) || cutB(c), Lf = cutL(p) || cutL(c), Rt = cutR(p) || cutR(c);
  const byBottom = T && !B, byRight = Lf && !Rt;
  const dy = byBottom ? (c.y + c.h) - (p.y + p.h) : c.y - p.y, dx = byRight ? (c.x + c.w) - (p.x + p.w) : c.x - p.x;
  /* пометка о крае — только там, где она объясняет строку: размер не сравнивался или сдвиг взят по низу
     (правому краю). «У края», а не «за краем»: коробка ровно у края окна тоже y 0 */
  const parts = [], edge = [];
  const was = (f, name) => (f(c) ? `${name} у края окна` : `${name} был у края окна`);
  const vNote = c.h !== p.h || (byBottom && dy), hNote = c.w !== p.w || (byRight && dx);
  if (B && vNote) edge.push(was(cutB, 'низ')); if (T && vNote) edge.push(was(cutT, 'верх'));
  if (Rt && hNote) edge.push(was(cutR, 'правый край')); if (Lf && hNote) edge.push(was(cutL, 'левый край'));
  if (dy) parts.push(`${dy > 0 ? 'вниз' : 'вверх'} на ${Math.abs(dy)} px (${byBottom ? `низ ${p.y + p.h} → ${c.y + c.h}` : `y ${p.y} → ${c.y}`})`);
  if (dx) parts.push(`${dx > 0 ? 'вправо' : 'влево'} на ${Math.abs(dx)} px (${byRight ? `правый край ${p.x + p.w} → ${c.x + c.w}` : `x ${p.x} → ${c.x}`})`);
  const oldH = !H && Math.abs((c.y + c.h) - (p.y + p.h)) <= 1, oldW = !W && Math.abs((c.x + c.w) - (p.x + p.w)) <= 1;
  if (c.h !== p.h && !T && !B && !oldH) parts.push(`высота ${p.h} → ${c.h}`);
  if (c.w !== p.w && !Lf && !Rt && !oldW) parts.push(`ширина ${p.w} → ${c.w}`);
  if (!parts.length && T && B) parts.push('коробка во всю высоту окна: по видимой части сдвиг не виден');
  const sizeSkipped = (c.h !== p.h && (T || B)) || (c.w !== p.w && (Lf || Rt));
  return `${who} — ${parts.join(', ') || 'сдвиг меньше 1 px'}${edge.length ? `, ${edge.join(', ')}${sizeSkipped ? ' — видна часть коробки, размер не сравнивался' : ''}` : ''}`;
}
const lines = [];
const table = {};
let worst = 'OK';
const bump = (st) => { if (st === 'FAIL') worst = 'FAIL'; else if (st === 'WARN' && worst !== 'FAIL') worst = 'WARN'; };
let report = { url, viewport: vpName, cpu, net: netName, takenAt: new Date().toISOString() };

if (samples.length) {
  /* медиана по каждому числу; сеть и списки — из прогона с медианным LCP */
  const med = (arr) => { const a = arr.filter((v) => v != null && !Number.isNaN(v)).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
  const pick = (f) => med(samples.map(f));
  const spread = (f, unit = '') => { const a = samples.map(f).filter((v) => v != null); return runs > 1 && a.length ? `${Math.min(...a)}–${Math.max(...a)}${unit}` : ''; };
  const medLcp = pick((s) => s.m.lcp);
  const ref = samples.find((s) => s.m.lcp === medLcp) || samples[0];
  const refNo = samples.indexOf(ref) + 1;
  /* кандидаты LCP и список задач — в разделах lcp и longTasks JSON, в metrics не дублируются */
  const { lcpCandidates, longList, shifts, clsShifts, clsTop, lcpSwitch, ...refM } = ref.m;
  const m = { ...refM, ttfb: pick((s) => s.m.ttfb), fcp: pick((s) => s.m.fcp), lcp: medLcp, cls: pick((s) => s.m.cls), longVerdict: pick((s) => s.m.longVerdict), longTotal: pick((s) => s.m.longTotal), longTasks: pick((s) => s.m.longTasks), nodes: pick((s) => s.m.nodes) };
  const idleFps = pick((s) => s.idleFps), fpsScroll = pick((s) => s.fpsScroll), heapMb = pick((s) => s.heapMb), loadMs = pick((s) => s.loadMs);
  const quietAt = pick((s) => s.quiet.at);

  /* вес — всё, что запрошено до прокрутки замера (загрузка и после load), по прогону с медианным LCP;
     как передано по сети, каждый файл целиком (ждали тишины) */
  const res = ref.reqs.filter((r) => r.phase === 'load');
  const { by, totalKb } = ref.w;
  const largest = res.filter((r) => sent(r) > 0).sort((a, b) => sent(b) - sent(a)).slice(0, 8).map((r) => ({ file: fileOf(r.url) || r.url.slice(0, 50), kind: kind(r), kb: Math.round(sent(r) / 1024) }));
  const thirdParty = Math.round(res.filter((r) => { try { return new URL(r.url).hostname !== new URL(url).hostname; } catch { return false; } }).reduce((a, r) => a + sent(r), 0) / 1024);
  const resScroll = ref.reqs.filter((r) => r.phase === 'scroll');
  const kbSum = (list) => Math.round(list.reduce((a, r) => a + sent(r), 0) / 1024);
  const zip = await compressionOf(res);

  /* прокрутка: дошли ли на самом деле */
  const shares = samples.map((s) => s.scroll.share).filter((v) => v != null);
  const minShare = shares.length ? Math.min(...shares) : null;
  const scrollValid = minShare == null || minShare >= 0.9;

  /* картинки и видео — из прогона с медианным LCP */
  const media = ref.media || { items: [], videos: [], checked: 0, notLoaded: 0 };
  const small = media.items.filter((i) => i.status === 'FAIL' || i.status === 'WARN').sort((a, b) => a.density - b.density);
  const big = media.items.filter((i) => i.status === 'BIG').sort((a, b) => b.density - a.density);
  const lazy = media.items.filter((i) => i.status === 'LAZY');
  const smallStatus = small.some((i) => i.status === 'FAIL') ? 'FAIL' : small.length ? 'WARN' : 'OK';
  const resLazy = ref.reqs.filter((r) => r.phase === 'lazy');
  for (const v of media.videos) {
    if (!v.src) { v.bytes = null; v.sizeFrom = 'нет источника'; continue; }
    if (/^blob:/i.test(v.src)) { v.bytes = null; v.sizeFrom = 'поток (blob:)'; continue; }
    const hit = samples.flatMap((s) => s.reqs).find((r) => r.url === v.src && r.total);
    if (hit) { v.bytes = hit.total; v.sizeFrom = 'ответ сервера'; } else { v.bytes = await headSize(v.src); v.sizeFrom = v.bytes ? 'HEAD' : 'не определён'; }
  }
  const firstVideos = media.videos.filter((v) => v.first);
  const firstBytes = firstVideos.reduce((a, v) => a + (v.bytes || 0), 0);
  const firstUnknown = firstVideos.filter((v) => v.bytes == null);
  const noPoster = media.videos.filter((v) => !v.poster);

  /* бюджеты */
  const B = (v, good, ok, unit, lowerBetter = true, sp = '') => { const s = v == null ? 'n/a' : lowerBetter ? (v <= good ? 'OK' : v <= ok ? 'WARN' : 'FAIL') : (v >= good ? 'OK' : v >= ok ? 'WARN' : 'FAIL'); return { value: v, unit, status: s, budget: `${good}${unit} / ${ok}${unit}`, spread: sp }; };
  const scrollRow = B(fpsScroll, 55, 40, '', false, spread((s) => s.fpsScroll));
  if (!scrollValid) { scrollRow.status = 'FAIL'; scrollRow.note = `замер недействителен: страница дошла до ${Math.round(minShare * 100)}% высоты`; }
  /* вес: вердикт по передаче. Сервер не сжимает — рядом оценка со сжатием и её вердикт по gzip; сжимает — без сжатия.
     Локальный сервер (localhost, 127.x, [::1], file:) без сжатия — голый сервер разработки без прокси: на бою
     сжимать может Caddy или nginx перед ним, и вердикт строки — по оценке gzip (FAIL веса здесь не значит FAIL
     на бою); вердикт по передаче — в byTransfer */
  const zipRow = (row, k, good, ok) => {
    const z = k ? zip.byKind[k] : zip.total; const j = k ? zip.statusByKind[k] : { status: zip.status, n: zip.judged, zipped: zip.compressed };
    if (!z || !j || j.status === 'n/a') return row;
    if (j.status === 'all') { row.note = `сжато ${zip.encodings.join('/')}: без сжатия было бы ${z.identity} КБ`; return row; }
    const st = z.gzip <= good ? 'OK' : z.gzip <= ok ? 'WARN' : 'FAIL';
    row.ifCompressed = { gzipKb: z.gzip, brKb: z.br, status: st };
    if (LOCAL) {
      row.byTransfer = { kb: row.value, status: row.status }; row.status = st;
      row.note = `${LOCAL_NOTE}: по сети ${z.actual} КБ без сжатия${j.status === 'partial' ? ` (не сжаты ${j.n - j.zipped} из ${j.n} ответов)` : ''}, со сжатием было бы ≈ ${z.gzip} КБ gzip / ${z.br} КБ br — вердикт по gzip`;
      return row;
    }
    row.note = `сервер не сжимает${j.status === 'partial' ? ` ${j.n - j.zipped} из ${j.n} ответов` : ''}: со сжатием было бы ≈ ${z.gzip} КБ gzip / ${z.br} КБ br — ${st}`;
    return row;
  };
  const lcpShort = (c) => (c ? `${c.el}${c.url ? ` ${fileOf(c.url)}` : c.text ? ` «${c.text.length > 30 ? c.text.slice(0, 30) + '…' : c.text}»` : ''}` : '');
  const lcpRow = B(m.lcp, 2500, 4000, ' мс', true, spread((s) => s.m.lcp, ' мс'));
  if (ref.m.lcpEl) lcpRow.note = `${lcpShort(ref.m.lcpEl)}${ref.m.lcpFrom === 'scroll' ? '; до прокрутки кандидатов не было — взят первый при прокрутке' : ''}`;
  /* LCP сменился (кадр автослайдера, анимация — lcpSwitchOf): отдельно медиана по первому элементу; вердикт — как
     раньше, по последнему кандидату до прокрутки. Разные элементы LCP в прогонах без смены — тоже пометкой */
  const switched = samples.map((s, i) => ({ i: i + 1, sw: s.m.lcpSwitch })).filter((x) => x.sw);
  const firstT = (s) => (s.m.lcpSwitch ? s.m.lcpSwitch.from.t : s.m.lcp);
  const lcpFirst = switched.length ? { median: pick(firstT), perRun: samples.map(firstT), element: lcpShort(switched[0].sw.from) } : null;
  const lcpKeys = [...new Set(samples.map((s) => (s.m.lcpEl ? lcpShort(s.m.lcpEl) : '—')))];
  if (lcpFirst) lcpRow.note = `${lcpRow.note ? `${lcpRow.note}; ` : ''}LCP сменился в ${switched.length} из ${samples.length} ${plural(samples.length, 'прогона', 'прогонов', 'прогонов')} — вероятно автослайдер/анимация; по первому элементу медиана ${lcpFirst.median} мс`;
  else if (lcpKeys.length > 1) lcpRow.note = `${lcpRow.note ? `${lcpRow.note}; ` : ''}в прогонах разные элементы LCP`;
  /* CLS: прогон с медианным CLS — его три крупнейших сдвига (что сдвинулось, на сколько, когда) */
  const clsRef = samples.find((s) => s.m.cls === m.cls) || ref; const clsNo = samples.indexOf(clsRef) + 1;
  const clsRow = B(m.cls, 0.1, 0.25, '', true, spread((s) => s.m.cls));
  { const t0 = clsRef.m.clsTop[0]; if (m.cls > 0 && t0) clsRow.note = `крупнейший сдвиг ${t0.v} на ${t0.t} мс (${PHASE[t0.phase]}): ${t0.sources.length ? shiftText(t0.sources[0]) : 'источник браузер не указал'}`; }
  const longRow = B(m.longVerdict, 300, 800, ' мс', true, spread((s) => s.m.longVerdict, ' мс'));
  const longScroll = pick((s) => s.m.longPhases.scroll.ms);
  if (longScroll) longRow.note = `прокрутка замера ещё ${longScroll} мс — справочно`;
  const totalRow = zipRow(B(totalKb, 2000, 5000, ' КБ', true, spread((s) => s.w.totalKb, ' КБ')), null, 2000, 5000);
  if (ref.quiet.left.length) totalRow.note = `${totalRow.note ? totalRow.note + '; ' : ''}не дождались ${ref.quiet.left.length} ${plural(ref.quiet.left.length, 'ответа', 'ответов', 'ответов')} — вес занижен`;
  const checks = {
    'LCP (самый крупный элемент)': lcpRow,
    'FCP (первая отрисовка)': B(m.fcp, 1800, 3000, ' мс', true, spread((s) => s.m.fcp, ' мс')),
    'TTFB (ответ сервера)': B(m.ttfb, 800, 1800, ' мс', true, spread((s) => s.m.ttfb, ' мс')),
    'CLS (сдвиги вёрстки)': clsRow,
    'Долгие задачи (загрузка и после load)': longRow,
    'JS по сети': zipRow(B(by.js ? by.js.kb : 0, 300, 600, ' КБ', true, spread((s) => (s.w.by.js ? s.w.by.js.kb : 0), ' КБ')), 'js', 300, 600),
    'Картинки по сети': B(by.images ? by.images.kb : 0, 1000, 2500, ' КБ', true, spread((s) => (s.w.by.images ? s.w.by.images.kb : 0), ' КБ')),
    'Шрифты по сети': B(by.fonts ? by.fonts.kb : 0, 150, 400, ' КБ', true, spread((s) => (s.w.by.fonts ? s.w.by.fonts.kb : 0), ' КБ')),
    'Всего по сети': totalRow,
    'Кадров/с при прокрутке': scrollRow,
    'Кадров/с в покое': B(idleFps, 55, 40, '', false, spread((s) => s.idleFps)),
    'Узлов DOM': B(m.nodes, 1500, 3000, ''),
    'Память JS': B(heapMb, 30, 80, ' МБ', true, spread((s) => s.heapMb, ' МБ')),
    'Картинки мельче показанного': { value: small.length, unit: '', status: smallStatus, budget: `плотность ≥ ${media.need || 2} / ≥ 1`, spread: '' },
  };
  if (lazy.length) checks['Заглушки ленивой загрузки (не измерены)'] = { value: lazy.length, unit: '', status: 'WARN', budget: '0', spread: '', note: 'полная картинка не догрузилась к замеру — плотность не мерилась' };
  if (media.videos.length) {
    const st = firstUnknown.length ? 'WARN' : firstBytes <= videoBudget ? 'OK' : firstBytes <= videoBudget * 2 ? 'WARN' : 'FAIL';
    checks['Видео первого экрана'] = { value: r2(firstBytes / MB), unit: ' МБ', status: firstVideos.length ? st : 'OK', budget: `${r1(videoBudget / MB)} МБ / ${r1(videoBudget * 2 / MB)} МБ`, spread: '', note: firstUnknown.length ? `размер не определён: ${firstUnknown.map((v) => v.el).join(', ')}` : '' };
    checks['Видео без постера'] = { value: noPoster.length, unit: '', status: noPoster.length ? 'WARN' : 'OK', budget: '0', spread: '' };
  }
  if (overlay && overlay.found) checks['Цена слоя фактуры (растровых задач за 2 с покоя)'] = { value: overlay.extraRaster, unit: '', status: overlay.status, budget: '≤ 2 прибавки', spread: `со слоем ${overlay.stats.with.raster.min}–${overlay.stats.with.raster.max}, без ${overlay.stats.without.raster.min}–${overlay.stats.without.raster.max}` };
  for (const c of Object.values(checks)) bump(c.status);

  console.log(`Условия: ${vpName} ${vp.width}×${vp.height}@${vp.deviceScaleFactor || 1}, процессор ×${cpu} медленнее, сеть ${netName}${runs > 1 ? `, прогонов ${samples.length} (медиана)` : ''} · загрузка ${loadMs} мс, полная тишина сети ${quietAt == null ? `не наступила за ${QUIET_MAX / 1000} с` : `ещё через ${quietAt} мс`}`);
  console.log(runs > 1 ? '| показатель | медиана | разброс | бюджет (хорошо / терпимо) | вердикт |\n|---|---|---|---|---|' : '| показатель | значение | бюджет (хорошо / терпимо) | вердикт |\n|---|---|---|---|');
  for (const [k, c] of Object.entries(checks)) {
    const note = c.note ? ` (${c.note})` : '';
    console.log(runs > 1 ? `| ${k} | ${c.value == null ? '—' : c.value}${c.unit} | ${c.spread || '—'} | ${c.budget} | ${c.status}${note} |` : `| ${k} | ${c.value == null ? '—' : c.value}${c.unit} | ${c.budget} | ${c.status}${note} |`);
  }
  const sc = ref.scroll;
  console.log(`\nПрокрутка: ${sc.planned ? `дошли до ${sc.reached} из ${sc.planned} px (${Math.round((sc.share || 0) * 100)}%) за ${sc.frames} кадров, ${sc.ms} мс, прокручивается ${sc.scroller}` : 'страница не выше окна — прокручивать нечего'}${!scrollValid ? ' — FAIL замера: кадры/с при прокрутке не в счёт (прокрутка не доехала: заставка держит, скрипт возвращает или прокручивается не тот блок)' : ''}`);
  console.log(`По сети (${answers(res.length)} — всё, что запрошено до прокрутки замера${runs > 1 ? `, прогон ${refNo}` : ''}): ${Object.entries(by).map(([k, v]) => `${k} ${v.count}/${v.kb} КБ`).join(' · ')} · сторонние домены ${thirdParty} КБ`);
  /* сжатие текста: как передано и как было бы */
  const zt = zip.total, zj = zip.byKind.js;
  /* локальный сервер без прокси: «не сжимает» — INFO с пометкой, вердикт веса по оценке gzip; иначе как было */
  if ((zip.status === 'none' || zip.status === 'partial') && LOCAL) { zip.local = true; zip.note = LOCAL_NOTE; }
  if (zip.status === 'none' || zip.status === 'partial') console.log(`${LOCAL ? 'INFO ' : ''}Сжатие текста: ${zip.status === 'none' ? `сервер не сжимает (0 из ${zip.judged} текстовых ответов от 1 КБ)` : `частично — не сжаты ${zip.judged - zip.compressed} из ${zip.judged} текстовых ответов от 1 КБ: ${zip.uncompressed.slice(0, 5).map((u) => `${u.file} ${u.kb} КБ`).join(', ')}`}${LOCAL ? ` — ${LOCAL_NOTE}` : ''}. Со сжатием было бы (gzip 6 / brotli 11): ${zj ? `JS ≈ ${zj.gzip} / ${zj.br} КБ (по сети ${zj.actual}), ` : ''}всего ≈ ${zt.gzip} / ${zt.br} КБ (по сети ${zt.actual}). ${LOCAL ? 'Вердикт веса — по оценке gzip; само сжатие проверить на боевом адресе' : 'Вердикт веса — по передаче'}`);
  else if (zip.status === 'all') console.log(`Сжатие текста: сервер сжимает (${zip.encodings.join(', ')} у ${zip.compressed} из ${zip.judged} текстовых ответов от 1 КБ). Без сжатия было бы: ${zj ? `JS ${zj.identity} КБ (по сети ${zj.actual}), ` : ''}всего ${zt.identity} КБ (по сети ${zt.actual})`);
  if (zip.noBody) console.log(`  тела не получены у ${zip.noBody} текстовых ответов — в оценке они как переданы`);
  /* холодный кэш и окно замера */
  const hits = samples.map((s) => s.cache.hits);
  console.log(`Кэш холодный (у прогона свой браузер, отдельный контекст, кэш очищен перед заходом) — из кэша: ${hits.join(', ')}${samples.some((s) => s.cache.reused) ? `; повторно с этой же страницы (не тёплый кэш): ${samples.map((s) => s.cache.reused).join(', ')}` : ''}`);
  for (const [i, s] of samples.entries()) if (s.cache.hits) console.log(`WARN прогон ${i + 1}: из кэша ${s.cache.hits} — ${s.cache.files.join(', ')}: прогон не холодный`);
  const q = ref.quiet;
  /* «дождались» — только если у этого прогона тишина наступила; нет — ниже WARN «не дождались» */
  const waited = (q.atLoad.length || q.startedAfter) && q.at != null;
  console.log(`Тишина сети (1 с без запросов, кроме видео и потоков): ${quietAt == null ? `не наступила за ${QUIET_MAX / 1000} с` : `через ${quietAt} мс после загрузки`}${runs > 1 ? ` (по прогонам: ${samples.map((s) => (s.quiet.at == null ? '—' : s.quiet.at)).join(', ')} мс)` : ''}${q.atLoad.length ? `; к концу загрузки ещё качались${runs > 1 ? ` (прогон ${refNo})` : ''}: ${q.atLoad.slice(0, 6).map((x) => `${x.file} ${x.kb} КБ`).join(', ')}${q.atLoad.length > 6 ? ` и ещё ${q.atLoad.length - 6}` : ''}` : ''}${q.startedAfter ? `; после загрузки запрошено ещё ${q.startedAfter}` : ''}${waited ? ' — дождались, всё это в весе' : ''}`);
  for (const [i, s] of samples.entries()) if (s.quiet.left.length) console.log(`WARN прогон ${i + 1}: не дождались за ${QUIET_MAX / 1000} с — ${s.quiet.left.slice(0, 5).map((x) => `${x.file} (получено ${x.kbSoFar} КБ)`).join(', ')}; в вес вошло полученное`);
  if (resScroll.length) console.log(`При прокрутке замера догружено (в вес не входит): ${answers(resScroll.length)}, ${kbSum(resScroll)} КБ`);
  console.log(`Самое тяжёлое: ${largest.map((l) => `${l.file} ${l.kb} КБ`).join('; ')}`);
  const fmtImg = (i) => `${i.kind} ${i.src} ${i.natural} в ${i.box} (${i.fit}) — ${i.density} пикс./CSS-пикс.`;
  if (resLazy.length) console.log(`Догружено проходом за ленивым (${media.lazyPass ? `${Math.round(media.lazyPass.ms / 100) / 10} с` : ''}; в вес выше не входит): ${answers(resLazy.length)}, ${kbSum(resLazy)} КБ`);
  /* LCP по прогонам: элемент и время; кандидаты при прокрутке замера — отдельно */
  const grp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const lcpText = (c) => {
    if (!c) return 'кандидатов нет';
    const pos = c.top == null ? '' : c.top < (c.vh || vp.height) ? ', первый экран' : `, ниже первого экрана (y ${c.top})`;
    return `${c.t} мс — ${lcpShort(c)}${c.where ? ` в ${c.where}` : ''}${c.w != null ? `, ${c.w}×${c.h}` : ''}${c.size ? `, площадь ${grp(c.size)} px²` : ''}${pos}`;
  };
  console.log('LCP — последний кандидат до начала прокрутки замера (прокрутка или касание человека останавливает LCP, прокрутка скриптом — нет):');
  for (const [i, s] of samples.entries()) console.log(`  прогон ${i + 1}: ${lcpText(s.m.lcpEl)}${s.m.lcpFrom === 'scroll' ? ' — до прокрутки кандидатов не было, взят первый при прокрутке' : ''}`);
  const late = samples.flatMap((s, i) => s.m.lcpAfterScroll.map((c) => `прогон ${i + 1}: ${lcpText(c)}`));
  if (late.length) {
    console.log('  появились при прокрутке замера (у человека не считаются):');
    for (const x of late.slice(0, 6)) console.log(`    ${x}`);
    if (late.length > 6) console.log(`    … ещё ${late.length - 6} (в JSON, lcp.perRun)`);
  }
  /* LCP сменился: какой элемент, когда, что было до него; медиана по первому элементу — отдельно */
  const nth = (t) => `${Math.max(1, Math.floor(t / 1000))}-й секунде`;
  if (switched.length) {
    const s0 = switched[0].sw;
    console.log(`  LCP сменился в ${switched.length === 1 ? `прогоне ${switched[0].i}` : `прогонах ${switched.map((x) => x.i).join(', ')}`}: ${lcpShort(s0.to)} на ${nth(s0.at)} (${switched.map((x) => x.sw.at).join(', ')} мс; до этого ${lcpShort(s0.from)} на ${switched.map((x) => x.sw.from.t).join(', ')} мс, ${s0.why}) — вероятно автослайдер/анимация, а не медленная загрузка`);
    console.log(`  LCP по первому элементу (${lcpFirst.element}): медиана ${lcpFirst.median} мс (по прогонам ${lcpFirst.perRun.join(', ')}); в таблице — последний кандидат до прокрутки, ${m.lcp} мс`);
  } else if (lcpKeys.length > 1) console.log(`  в прогонах разные элементы LCP: ${lcpKeys.join(' / ')} — кандидаты по прогонам в JSON (lcp.perRun)`);
  /* CLS: суммы по фазам в каждом прогоне и три крупнейших сдвига прогона с медианным CLS */
  console.log('CLS — сдвиги вёрстки по фазам (сдвиг сразу после ввода человека не в счёт; фаза — по времени сдвига):');
  for (const [i, s] of samples.entries()) { const P = s.m.clsPhases; console.log(`  прогон ${i + 1}: загрузка ${P.load} · после load ${P.afterLoad} · прокрутка замера ${P.scroll} → CLS ${s.m.cls} (сдвигов ${s.m.clsShifts.filter((x) => !x.input).length})`); }
  if (clsRef.m.clsTop.length) {
    console.log(`  крупнейшие${samples.length > 1 ? ` (прогон ${clsNo}, медианный CLS)` : ''} — что сдвинулось, на сколько и когда:`);
    for (const x of clsRef.m.clsTop) console.log(`    ${x.v} на ${x.t} мс (${PHASE[x.phase]}): ${x.sources.length ? x.sources.slice(0, 3).map(shiftText).join('; ') : 'источник браузер не указал'}`);
  }
  /* долгие задачи: суммы по фазам в каждом прогоне и список задач прогона с медианным LCP */
  console.log('Долгие задачи (от 50 мс, фаза — по началу): в вердикте загрузка и после load, прокрутка замера — справочно');
  for (const [i, s] of samples.entries()) { const P = s.m.longPhases; console.log(`  прогон ${i + 1}: загрузка ${P.load.n} шт. ${P.load.ms} мс · после load ${P.afterLoad.n} шт. ${P.afterLoad.ms} мс · прокрутка замера ${P.scroll.n} шт. ${P.scroll.ms} мс → в вердикт ${s.m.longVerdict} мс`); }
  const tl = ref.m.longList;
  if (tl.length) {
    console.log(`  задачи прогона ${refNo}${samples.length > 1 ? ' (медианный LCP)' : ''} — начало, длительность, фаза (load кончился на ${ref.m.load || '—'} мс${ref.m.scrollStart != null ? `, прокрутка замера ${ref.m.scrollStart}–${ref.m.scrollEnd ?? '?'} мс` : ''}):`);
    for (const t of tl.slice(0, 15)) console.log(`    ${String(t.start).padStart(6)} мс  ${String(t.dur).padStart(4)} мс  ${PHASE[t.phase]}`);
    if (tl.length > 15) console.log(`    … ещё ${tl.length - 15} (все — в JSON, longTasks.perRun)`);
  }
  console.log(`Плотность картинок (dpr ${media.dpr}, нужно ≥ ${media.need}): проверено ${media.checked}${lazy.length ? `, заглушек ленивой загрузки ${lazy.length} (не измерены)` : ''}${media.notLoaded ? `, не загрузились к замеру ${media.notLoaded}` : ''}${media.error ? `, ошибка: ${media.error}` : ''}`);
  if (small.length) for (const i of small.slice(0, 10)) console.log(`  ${i.status.padEnd(4)} ${fmtImg(i)}${i.status === 'FAIL' ? ' — меньше пикселя картинки на CSS-пиксель: размыто на любом экране' : ` — ниже ${media.need}: размыто на этом экране`}`);
  if (lazy.length) for (const i of lazy.slice(0, 6)) console.log(`  WARN ${i.kind} ${i.src} ${i.natural} в ${i.box} — заглушка ленивой загрузки не догрузилась (${i.placeholder}) — не измерено`);
  if (lazy.length > 6) console.log(`       … и ещё ${lazy.length - 6} заглушек (полный список — в JSON, images.lazy)`);
  if (big.length) console.log(`Картинки крупнее показанного (лишний вес, справочно): ${big.slice(0, 8).map((o) => `${o.src} ${o.natural}→${o.box} (×${o.density})`).join('; ')}`);
  if (media.videos.length) {
    console.log(`Видео (${media.videos.length}): бюджет первого экрана ${r1(videoBudget / MB)} МБ (${vp.isMobile ? 'телефон' : 'десктоп'}) — роликов в первом экране ${firstVideos.length}, вес ${mbs(firstBytes)}`);
    for (const v of media.videos) console.log(`  ${v.first ? 'первый экран' : 'ниже'}: ${v.el} ${v.src.split('/').pop().split('?')[0].slice(0, 50) || v.src.slice(0, 50)} — ${mbs(v.bytes)} (${v.sizeFrom})${v.videoSize ? `, кадр ${v.videoSize}` : ''}, показ ${v.w}×${v.h}${v.autoplay ? ', autoplay' : ''}${v.muted ? ' muted' : ''}${v.loop ? ' loop' : ''}, preload ${v.preload || '—'}, ${v.poster ? 'постер есть' : 'БЕЗ постера'}`);
  }
  if (m.canvases) console.log(`Холстов: ${m.canvases}, анимаций в момент замера: ${m.animations} — кадры/с выше говорят, тянет ли их страница`);
  report = {
    ...report, runs: samples.length, refRun: refNo, loadMs, quietMs: quietAt, metrics: m, checks, byType: by, totalKb, thirdPartyKb: thirdParty, largest,
    compression: zip,
    cache: { cold: 'свой браузер, отдельный контекст, кэш очищен перед заходом', perRun: samples.map((s) => s.cache) },
    quiet: { quietMs: QUIET_MS, maxMs: QUIET_MAX, perRun: samples.map((s) => s.quiet) },
    lcp: { rule: 'последний кандидат до начала прокрутки замера', switched: switched.map((x) => ({ run: x.i, at: x.sw.at, to: lcpShort(x.sw.to), from: lcpShort(x.sw.from), fromT: x.sw.from.t, why: x.sw.why })), firstElement: lcpFirst, differentElements: lcpKeys.length > 1 ? lcpKeys : null, perRun: samples.map((s) => ({ lcp: s.m.lcp, from: s.m.lcpFrom, element: s.m.lcpEl, switched: s.m.lcpSwitch, afterScroll: s.m.lcpAfterScroll, lastAny: s.m.lcpAll, scrollStart: s.m.scrollStart, candidates: s.m.lcpCandidates })) },
    cls: { rule: 'сумма сдвигов без недавнего ввода; фаза — по времени сдвига', refRun: clsNo, perRun: samples.map((s) => ({ cls: s.m.cls, phases: s.m.clsPhases, top: s.m.clsTop, shifts: s.m.clsShifts })) },
    longTasks: { verdict: 'загрузка + после load', perRun: samples.map((s) => ({ load: s.m.load, scrollStart: s.m.scrollStart, scrollEnd: s.m.scrollEnd, phases: s.m.longPhases, verdictMs: s.m.longVerdict, allMs: s.m.longTotal, tasks: s.m.longList })) },
    scrollLoaded: { count: resScroll.length, kb: kbSum(resScroll) },
    scroll: { ...ref.scroll, fps: fpsScroll, valid: scrollValid, minShare }, idleFps, images: { dpr: media.dpr, need: media.need, checked: media.checked, notLoaded: media.notLoaded, lazyPass: media.lazyPass || null, small, big, lazy, all: media.items }, lazyLoadedKb: kbSum(resLazy), videos: { budgetBytes: videoBudget, firstBytes, list: media.videos }, cdp: { heapMb, scriptMs: ref.scriptMs, layoutCount: ref.layoutCount, styleRecalcs: ref.styleRecalcs },
    requests: ref.reqs.slice(0, 400).map((r) => ({ url: r.url.slice(0, 200), type: r.type, phase: r.phase, status: r.status, kb: r1(sent(r) / 1024), enc: r.enc, cache: r.cache, done: r.done, failed: r.failed })),
    samples: samples.map((s) => ({ lcp: s.m.lcp, lcpElement: s.m.lcpEl ? lcpShort(s.m.lcpEl) : null, lcpFrom: s.m.lcpFrom, lcpAfterScroll: s.m.lcpAfterScroll.length, lcpSwitchAt: s.m.lcpSwitch ? s.m.lcpSwitch.at : null, lcpFirst: firstT(s), fcp: s.m.fcp, ttfb: s.m.ttfb, cls: s.m.cls, clsPhases: s.m.clsPhases, longVerdict: s.m.longVerdict, longScroll: s.m.longPhases.scroll.ms, longTotal: s.m.longTotal, jsKb: s.w.by.js ? s.w.by.js.kb : 0, totalKb: s.w.totalKb, fromCache: s.cache.hits, quietMs: s.quiet.at, fpsScroll: s.fpsScroll, idleFps: s.idleFps, heapMb: s.heapMb, loadMs: s.loadMs, scrollShare: s.scroll.share, scrollReached: s.scroll.reached, scrollPlanned: s.scroll.planned })),
  };
  lines.push(...Object.entries(checks).filter(([, c]) => c.status !== 'OK' && c.status !== 'n/a').map(([k, c]) => `${k} ${c.status}${c.ifCompressed ? ` (со сжатием ≈ ${c.ifCompressed.gzipKb} КБ gzip — ${c.ifCompressed.status})` : ''}`));
}

if (opt.overlay) {
  if (!overlay || overlay.error) { console.log(`\nWARN цена слоя: не измерена${overlay && overlay.error ? ` — ${overlay.error}` : ''}`); bump('WARN'); lines.push('цена слоя не измерена WARN'); }
  else if (!overlay.found) console.log(`\nOK   цена слоя: ${overlay.note} — мерить нечего`);
  else {
    const W = overlay.stats.with, N = overlay.stats.without;
    console.log(`\nЦена слоя фактуры: ${overlay.layers.map((l) => `${l.el}${l.blend && l.blend !== 'normal' ? ` ${l.blend}` : ''}${l.opacity != null ? ` α${l.opacity}` : ''}${l.animation ? ` [${l.animation}]` : ''}`).join(', ')}; ${overlay.rounds} раундов по 2 с покоя, чередуются`);
    if (overlay.hideVia === 'adopted') console.log('  «без слоя»: CSP страницы запрещает <style> — слой спрятан таблицей adoptedStyleSheets');
    console.log('| вариант | RasterTask: медиана (мин–макс) | Paint: медиана (мин–макс) | растр, мс: медиана |\n|---|---|---|---|');
    for (const [label, S] of [['со слоем', W], ['без слоя', N]]) console.log(`| ${label} | ${S.raster.median} (${S.raster.min}–${S.raster.max}) | ${S.paint.median} (${S.paint.min}–${S.paint.max}) | ${S.rasterMs.median} |`);
    const why = overlay.status === 'WARN' ? `слой перерисовывается в покое: +${overlay.extraRaster} растровых задач и +${overlay.extraPaint} Paint за 2 с (все раунды со слоем выше всех без) — кипение GIF или background-position; сдвиг transform по steps() обходится без перерисовки` : overlay.separated.raster || overlay.separated.paint ? `прибавка в пределах бюджета: +${overlay.extraRaster} растровых задач, +${overlay.extraPaint} Paint за 2 с` : `разницы нет или она в пределах разброса раундов (+${overlay.extraRaster} растровых задач, +${overlay.extraPaint} Paint)`;
    console.log(`${overlay.status.padEnd(4)} цена слоя — ${why}`);
    if (!samples.length) { bump(overlay.status); if (overlay.status !== 'OK') lines.push(`цена слоя ${overlay.status}`); }
  }
  report.overlay = overlay;
}

const libW = takeWarnings();
if (libW.length) { console.log(''); for (const w of libW) console.log(`WARN ${w}`); bump('WARN'); lines.push('свой стиль не вставился WARN'); report.warnings = libW; }
console.log(`\n${worst}: ${lines.join(', ') || 'все бюджеты соблюдены'}`);
report.verdict = worst;
const file = path.join(outDir, `${tag}${opt['overlay-only'] ? '-overlay' : ''}.json`);
writeJson(file, report);
console.log(`Сохранено: ${file}`);
if (opt.strict && worst === 'FAIL') { console.log('Код выхода 1: вердикт FAIL (--strict)'); process.exitCode = 1; }
