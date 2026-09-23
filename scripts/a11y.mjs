#!/usr/bin/env node
/**
 * Доступность: то, что можно проверить в живом DOM без чтения экрана.
 *
 *   node a11y.mjs <url> [--viewport desktop] [--out папка] [--tag имя] [--no-grain] [--strict]
 *   node a11y.mjs --help   (или -h)
 *
 * Флаги:
 *   --viewport  экран: пресет (desktop, laptop, tablet, mobile, mobile-s, android), запись ШxВ@плотность
 *               («320x568@2») или одна ширина; по умолчанию desktop. Один экран за запуск: список
 *               через запятую — ошибка с кодом 1 (запускать по разу на экран, итоги ложатся в разные
 *               файлы). --viewports — то же самое (синоним).
 *   --out       папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/a11y/<tag>.json.
 *   --tag       имя файла итога (по умолчанию имя экрана).
 *   --no-grain  не учитывать слой зерна поверх текста в контрасте (см. ниже).
 *   --strict    код выхода 1 при вердикте FAIL (для гейта); без флага — 0 при любом вердикте.
 *   --help, -h  эта справка.
 * Код выхода: 0 — проверка сделана (вердикт в выводе и в JSON); 1 — неверные аргументы или, с --strict,
 * вердикт FAIL. Аргументы (адрес, экран, значения флагов) проверяются до создания папок и запуска
 * браузера.
 *
 * Проверяется: контраст текста к фактическому фону (WCAG AA: 4.5:1, крупный
 * текст 3:1) — по вычисленным цветам, а на картинках, градиентах и чужих подложках по снимку
 * фона за текстом (худшие 10% пикселей). Чужая подложка — блок с фоном, который лежит под центром
 * текста, но не его предок (фигура под текстом в Tilda Zero Block, плашка плавающего меню), или
 * предок с фоном, чья коробка под текстом не лежит (текст вынесен fixed/absolute). Закреплённый
 * текст (прозрачная шапка, нижняя панель) сравнивается с подложками в координатах окна на верху
 * страницы — шапка поверх фото первого экрана меряется по снимку, а не по фону body; ниже по
 * странице — отдельной проверкой (см. «Закреплённый текст на прокрутке»). Не проверяется
 * текст, которого на экране нет: центр за краем предка с overflow ≠ visible (слайд за краем,
 * заглушка Tilda за коробкой artboard). Текст, перекрытый чужим непрозрачным блоком в момент
 * снимка или ушедший за окно, не мерится, но и не считается OK: WARN со списком («смотреть глазами»).
 * Окно здесь — видимая область (visualViewport): снимок — это она; вырезка фона считается от её
 * смещения и ширины (у страницы без meta viewport на телефоне 1 CSS-пиксель на снимке — 0.8 точки,
 * а не 2, и вырезка по координатам окна раскладки уходила за снимок — «пропущено» вместо замера).
 * Проверка перекрытия идёт через elementsFromPoint, а он не видит pointer-events:none — на время
 * проверки тексту ставится pointer-events:auto (частый .hero__content{pointer-events:none}).
 * Контраст считается у всего видимого текста; при больше 5000 текстовых элементов — первые 5000 и
 * WARN «взято N из M (обрезано)».
 * Ещё: мелкий текст; картинки без alt, поля без подписи, кнопки и ссылки без имени,
 * порядок заголовков, число h1, lang, запрет масштабирования, положительный tabindex,
 * видимость фокуса при обходе клавишей Tab, размер целей нажатия на телефоне (24 px),
 * правило prefers-reduced-motion в стилях, автоплей видео.
 *
 * Прокрутка. Сначала страница проходится целиком (lib.scrollThrough, прокрутка мгновенная —
 * forceInstantScroll): иначе при html{scroll-behavior:smooth} страница не доезжала, блоки
 * появления оставались скрытыми (на стенде было 2 из 21) и в проверку попадала часть текста и
 * заголовков. В выводе — сколько блоков с текстом было скрыто до прокрутки и сколько показано после.
 * Низ страницы — её высота минус innerHeight (окно раскладки), а не высота экрана: у страницы без
 * meta viewport на телефоне окно раскладки выше экрана (2121 px при экране 390×844), и от высоты
 * экрана выходило ложное «до низа не доехали».
 *
 * Контраст с прозрачностью. Цвет текста с альфой (rgba) и opacity самого элемента и предков
 * смешиваются с фоном так, как их складывает браузер (группы прозрачности по цепочке предков),
 * а не отбрасываются: раньше такой текст молча пропускался или считался непрозрачным
 * (белый с opacity .25 на чёрном проходил как 21:1). Цвета любых записей (oklch, color-mix…)
 * переводятся в sRGB через HEX_FN из lib.mjs.
 *
 * Зерно поверх текста. Полноэкранный закреплённый слой фактуры (texture.mjs → findTextureLayers,
 * слой во весь экран с position:fixed, z-index не отрицательный) меняет и цвет текста, и фон.
 * Действие слоя меряется по снимкам: всё, кроме слоя, прячется, под слоем по очереди чёрный,
 * серый 128 и белый фон; средний цвет снимка даёт отображение канала c → c' (кусочно-линейное
 * по трём точкам: для normal это c' = c(1−α) + α·среднее плитки, для multiply и screen тоже
 * точно, для overlay и soft-light — приближение). Каждая пара «текст/фон» пересчитывается с
 * этим отображением; пары, которые без зерна проходят норму, а с зерном нет, — FAIL
 * «контраст с учётом зерна»; пары в пределах 10 % над нормой перечисляются. Для текста на
 * картинке снимок фона уже содержит слой: отображение применяется только к цвету текста.
 *
 * Закреплённый текст на прокрутке. Текст в блоке с position: fixed или sticky (шапка, плавающее
 * меню, нижняя панель) лежит над разными секциями: прозрачная шапка с белыми ссылками над тёмным
 * фото первого экрана проходит, а над белым каталогом ниже — нет, если сайт не меняет шапку. Верх
 * страницы мерится вместе со всем текстом (строки «контраст» выше); сверх того страница ставится ещё
 * на несколько высот, не больше 8: сначала по одной на каждый фон секций, которого закреплённый текст
 * наверху не касался (для каждой полосы такого текста — сверху, снизу), затем на остальные секции по
 * порядку. Секции — дети body и обёрток во всю высоту страницы (не fixed и не absolute); фон секции —
 * свой цвет или картинка, иначе крупная (от половины площади) картинка или блок с фоном внутри,
 * иначе «фон страницы». Секций с другим фоном нет — одна высота посередине страницы (сайт мог сменить
 * шапку после прокрутки). На каждой высоте — пауза и ожидание переходов (сайт перекрашивает шапку по
 * прокрутке), цвет текста читается заново, весь текст страницы прячется (и текст секции, проезжающий
 * под прозрачной шапкой: фон — это подложки и картинки, а не чужие буквы), и снимок окна даёт фон под
 * строками (коробки строк текста, а не всего элемента: значок рядом с подписью не в счёт; часть
 * строки за краем блока с overflow ≠ visible — многоточие — тоже). Снимок окна — это видимая область
 * (visualViewport), а не окно раскладки: у страницы без meta viewport на телефоне видимая область
 * 980 px шириной, а не 390, а у страницы с контентом шире экрана при initial-scale=1 окно раскладки
 * шире и выше видимой области (354×629 против 320×568). Коробки строк сдвигаются на смещение видимой
 * области, масштаб — от её ширины; текст, центр которого вне неё, — «вне окна» (нижняя панель у низа
 * окна раскладки на таком экране не видна), видимый текст, под которым на снимке нет ни одного
 * пикселя, — «вне снимка»; оба — в «не мерились». Замер текста на картинке подводит к нему
 * scrollIntoView, и на такой странице видимая область сдвигается внутри окна раскладки, а
 * window.scrollTo этот сдвиг не сбрасывает: шапка на всех высотах оставалась «вне окна», и FAIL
 * прозрачной шапки становился OK (мерилась нижняя панель, которую сдвиг показал). Поэтому перед
 * каждой высотой и перед замером закреплённого текста на верху страницы видимая область
 * возвращается на место (scrollIntoView корня; на обычной странице сдвига нет — ничего не
 * делается). Худшие 10 %
 * пикселей против нормы AA, зерно учитывается как выше. Шапка с mix-blend-mode (difference —
 * «белый текст, который над светлым становится чёрным») мерится смешанным цветом: multiply, screen,
 * overlay, hard-light, darken, lighten, difference, exclusion, color-dodge, color-burn считаются по
 * формулам смешения, остальные режимы не мерятся («смешение цвета»). Провал — FAIL с высотой и секцией:
 * «на 1840 px меню nav.menu над секцией section#catalog «Каталог» (фон под текстом светлый): a «Каталог» #FFFFFF 16px
 * — 1.07:1». К высотам подъезжают сверху (прокрутка вниз); если часть текста на высоте спрятана, за
 * окном или обрезана, — ещё раз снизу: шапка, которая прячется при прокрутке вниз, видна при прокрутке вверх
 * (в выводе «прокрутка вверх»). Текст, который и так спрятан, за окном (sticky уехал со своим
 * блоком), перекрыт другим блоком или обрезан предком (закрытое выпадающее меню: max-height 0 и
 * overflow hidden, clip-path — в точке текста браузер его не рисует), на этой высоте не мерится — в
 * выводе сколько таких; текст, центр которого уже при поиске за краем предка с overflow ≠ visible,
 * в список не берётся вовсе. Ни одного замера — WARN «смотреть глазами». Прокручивается не документ,
 * а блок во весь экран — секции ищутся в нём. Берётся до 40 элементов (больше — сначала мелкие
 * блоки: шапка и меню раньше закреплённых секций, и не больше трёх одинаковых). Закреплённый текст
 * ищется наверху и на высоте одного экрана: шапка, ставшая fixed только после прокрутки, тоже в счёт.
 *
 * Строгий CSP. Свои стили (текст прозрачным на время снимка фона, пробы зерна) вставляются элементом
 * <style>; если CSP страницы (style-src без 'unsafe-inline') его не применил — сконструированной
 * таблицей стилей (document.adoptedStyleSheets), на которую CSP не распространяется. Сама страница
 * при этом не меняется: CSP для вкладки не отключается. Не вышло и так — проверка, которой нужен
 * стиль, получает WARN «не измерен — CSP запрещает вставку стиля», прогон доходит до конца и пишет
 * протокол.
 *
 * Мелкий текст: видимый текст кеглем меньше 12 px — WARN, меньше 10 px — FAIL (подписи вроде
 * «не обязательно» 9 px читать трудно, особенно на телефоне). Скрытый для глаз текст
 * (sr-only: коробка 1–2 px или clip) не в счёт.
 *
 * Фокус. Обход клавишей Tab идёт на СВЕЖЕЙ странице — отдельная вкладка, без прокруток и кликов:
 * после проверок контраста фокус оставался в нижней панели, обход проходил 1 элемент и писал OK
 * (связка blur()+scrollTo+body.focus() старт не сбрасывает, сбрасывает только загрузка). Если
 * обошли меньше min(5, число фокусируемых) — WARN «обход не состоялся», а не OK. Фокус внутри iframe
 * (карта, видео): activeElement страницы — сам iframe, его стиль не меняется; видимость там не
 * проверяется, Tab жмётся, пока фокус не вернётся в страницу (до 40 раз), в выводе — «внутри iframe
 * не проверялся». Не вернулся — WARN, не ложный FAIL «не видно фокуса на iframe» и не «ловушка».
 *
 * Не заменяет Lighthouse и не проверяет чтение экраном — это дополнение,
 * которое работает на любом адресе и даёт список конкретных элементов.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  launch, openPage, resolveViewport, parseArgs, runDir, writeJson, sleep, ensureDir, loadSharp,
  forceInstantScroll, scrollThrough, scrollToY, settleAnimations, evaluateWith, VIEWPORTS,
  SIG_FN, EFFECTIVE_OPACITY_FN, VISIBLE_FN, HEX_FN,
} from './lib.mjs';
import { findTextureLayers } from './texture.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'no-grain', 'strict'], values: ['viewport', 'viewports', 'out', 'tag'] });
/* короткий -h — как --help: и на месте адреса, и на месте значения флага; до любых папок и браузера */
if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h')) { console.log(HELP); process.exit(0); }
const die = (msg) => { console.error(msg); process.exit(1); };
for (const k of ['viewport', 'viewports', 'out', 'tag']) if (opt[k] === true) die(`--${k}: нужно значение (подробно: --help)`);
if (!pos[0]) die('Нужен адрес: node a11y.mjs <url> [--viewport mobile]  (подробно: --help)');
const url = pos[0];
{
  let ok = false; try { ok = /^(https?|file|data|about):$/i.test(new URL(url).protocol); } catch { /* не адрес */ }
  if (!ok) die(`Неверный адрес «${url}»: нужен полный адрес — http://…, https://… или file:///…  (подробно: --help)`);
}
/* --viewport и --viewports — один флаг; экран один за запуск */
function oneViewport(dflt) {
  const a = opt.viewport, b = opt.viewports;
  if (a !== undefined && b !== undefined && String(a).trim() !== String(b).trim()) die(`Заданы и --viewport ${a}, и --viewports ${b} — это один флаг, оставьте один`);
  const raw = a ?? b; const list = String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) list.push(dflt);
  if (list.length > 1) die(`a11y меряет один экран за запуск, а задано ${list.length}: ${list.join(', ')}. Запустите по разу на экран: ${list.map((v) => `--viewport ${v}`).join(', затем ')} — итоги лягут в разные файлы (<out>/a11y/<экран>.json)`);
  const r = resolveViewport(list[0]);
  if (!r) die(`Неизвестный экран «${list[0]}». Есть: ${Object.keys(VIEWPORTS).join(', ')} или запись ШxВ@плотность, например 320x568@2`);
  return r;
}
const [vpName, vp] = oneViewport('desktop');
const run = runDir(opt, url); const outDir = ensureDir(path.join(run, 'a11y'));
const tag = opt.tag || vpName;
const sharp = loadSharp();
const DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN, vis: VISIBLE_FN, hexc: HEX_FN };

/* ---------- свой стиль на странице, в том числе при строгом CSP ---------- */

/* <style> с ключом data-rw; если CSP страницы (style-src без 'unsafe-inline') его не применил — у
   такого элемента нет sheet, — сконструированная таблица в document.adoptedStyleSheets: CSP на неё не
   распространяется. Повторный вызов с тем же ключом заменяет стиль. Возвращает способ или null */
function cssAddInPage({ key, css }) {
  const drop = () => {
    const old = document.querySelector(`style[data-rw="${key}"]`); if (old) old.remove();
    const sh = window.__rwSheets && window.__rwSheets[key];
    if (sh) { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sh); delete window.__rwSheets[key]; }
  };
  drop();
  const st = document.createElement('style'); st.setAttribute('data-rw', key); st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
  if (st.sheet) return 'style';
  st.remove();
  try {
    const sh = new CSSStyleSheet(); sh.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
    (window.__rwSheets = window.__rwSheets || {})[key] = sh;
    return 'adopted';
  } catch { return null; }
}
function cssRemoveInPage({ key }) {
  const old = document.querySelector(`style[data-rw="${key}"]`); if (old) old.remove();
  const sh = window.__rwSheets && window.__rwSheets[key];
  if (sh) { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sh); delete window.__rwSheets[key]; }
}
const CSP_NO_STYLE = 'CSP запрещает вставку стиля';
/* не вставился ни так, ни так — ошибка с текстом CSP_NO_STYLE: проверка, которой нужен стиль, пишет
   WARN «не измерен — CSP запрещает вставку стиля» */
async function addCss(page, key, css) {
  const how = await page.evaluate(cssAddInPage, { key, css });
  if (!how) throw new Error(CSP_NO_STYLE);
  return how;
}
const removeCss = (page, key) => page.evaluate(cssRemoveInPage, { key });

/* ---------- функции страницы (свободные переменные sig, eff, vis, hexc — из lib.mjs) ---------- */

/* блоки с текстом, скрытые до прокрутки (своя opacity ≈ 0): метка data-rw-hid, только внешние */
function markHiddenInPage() {
  let n = 0;
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    const s = getComputedStyle(el); if (s.display === 'none' || parseFloat(s.opacity) > 0.05) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || !(el.textContent || '').trim()) continue;
    if (el.parentElement && el.parentElement.closest('[data-rw-hid]')) continue;
    el.setAttribute('data-rw-hid', ''); n++;
  }
  return n;
}
function revealInPage() {
  const els = [...document.querySelectorAll('[data-rw-hid]')];
  const shown = els.filter((el) => parseFloat(getComputedStyle(el).opacity) > 0.5);
  return { hidden: els.length, shown: shown.length, still: els.filter((el) => !shown.includes(el)).map((el) => sig(el)).slice(0, 8) };
}

function domInPage({ isMobile, map }) {
  const V = (el) => vis(el);
  const parseC = (css) => { const h = hexc(css); if (!h) return null; return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: h.length > 7 ? parseInt(h.slice(7, 9), 16) / 255 : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  /* действие слоя зерна: канал c → c' по трём точкам (0, 128, 255) */
  const f1 = (pts, c) => (c <= 128 ? pts[0] + (pts[1] - pts[0]) * c / 128 : pts[1] + (pts[2] - pts[1]) * (c - 128) / 127);
  const grain = (c) => (map ? { r: f1(map[0], c.r), g: f1(map[1], c.g), b: f1(map[2], c.b) } : c);
  /* сложение слоёв как в браузере: цвета с предумноженной альфой, opacity — группа */
  const P = (c) => (c ? { r: c.r * c.a, g: c.g * c.a, b: c.b * c.a, a: c.a } : { r: 0, g: 0, b: 0, a: 0 });
  const over = (t, b) => ({ r: t.r + b.r * (1 - t.a), g: t.g + b.g * (1 - t.a), b: t.b + b.b * (1 - t.a), a: t.a + b.a * (1 - t.a) });
  const mul = (c, o) => ({ r: c.r * o, g: c.g * o, b: c.b * o, a: c.a * o });
  const opOf = (s) => { if (s.display === 'contents') return 1; let o = parseFloat(s.opacity); const m = s.filter && s.filter !== 'none' ? s.filter.match(/opacity\(([\d.]+)(%?)\)/) : null; if (m) o *= m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]); return o; };
  const canvasBg = /dark/.test(getComputedStyle(document.documentElement).colorScheme || '') && !/light/.test(getComputedStyle(document.documentElement).colorScheme || '') ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  /* итоговые цвета текста и фона под ним; null — на пути картинка или градиент (тогда по снимку) */
  const colorsOf = (el) => {
    const chain = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    const st = chain.map((n) => getComputedStyle(n)); const ops = st.map(opOf);
    const rest = new Array(chain.length + 1).fill(1); for (let i = chain.length - 1; i >= 0; i--) rest[i] = rest[i + 1] * ops[i];
    const fill = st[0].webkitTextFillColor; const fg = parseC(fill && fill !== st[0].color ? fill : st[0].color);
    if (!fg) return { transparentText: true };
    let X = P(fg), Y = P(null); let bgNode = null;
    for (let i = 0; i < chain.length; i++) {
      if (i > 0 && X.a >= 0.999 && Y.a >= 0.999 && rest[i] >= 0.999) break;
      if (st[i].backgroundImage && st[i].backgroundImage !== 'none') return { imageBg: true, fg, alpha: fg.a * rest[0] };
      const bg = P(parseC(st[i].backgroundColor)); X = over(X, bg); Y = over(Y, bg);
      if (!bgNode && Y.a >= 0.999) bgNode = chain[i];
      if (ops[i] < 1) { X = mul(X, ops[i]); Y = mul(Y, ops[i]); }
    }
    /* фон дал предок, но под текстом его нет (текст вынесен fixed/absolute за его коробку) — по снимку */
    if (bgNode && bgNode !== document.documentElement && bgNode !== document.body) {
      const a = el.getBoundingClientRect(), b = bgNode.getBoundingClientRect(); const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
      if (cx < b.left - 1 || cx > b.right + 1 || cy < b.top - 1 || cy > b.bottom + 1) return { imageBg: true, displaced: true, fg, alpha: fg.a * rest[0] };
    }
    X = over(X, canvasBg); Y = over(Y, canvasBg);
    return { fg: { r: X.r, g: X.g, b: X.b }, bg: { r: Y.r, g: Y.g, b: Y.b }, raw: fg, alpha: fg.a, opacity: rest[0] };
  };
  const contrast = { checked: 0, translucent: 0, unknown: 0, transparentText: 0, total: 0, considered: 0, failures: {}, imgList: [], grain: map ? { checked: 0, failures: {}, near: {} } : null };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  /* центр текста за краем предка с overflow ≠ visible (слайд карусели за краем, заглушка Tilda за
     коробкой своего artboard) — на экране его нет: ни в контраст, ни в кегль */
  const clipped = (el) => {
    if (getComputedStyle(el).position === 'fixed') return false;
    const r = el.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const b = n.getBoundingClientRect(); if (cx < b.left - 1 || cx > b.right + 1 || cy < b.top - 1 || cy > b.bottom + 1) return true; }
      if (s.position === 'fixed') break;
    }
    return false;
  };
  let clippedCount = 0;
  const allText = [...document.body.querySelectorAll('*')].filter((el) => { if (el instanceof SVGElement || !ownText(el) || !V(el)) return false; if (clipped(el)) { clippedCount++; return false; } return true; });
  /* контраст — у всего текста (раньше молча у первых 600: бледная подпись в конце каталога не мерилась);
     предел TEXT_LIMIT только от зависания на гигантских страницах, и тогда вывод говорит «N из M (обрезано)» — WARN */
  const TEXT_LIMIT = 5000;
  const textEls = allText.slice(0, TEXT_LIMIT);
  /* картинки, лежащие не в предках текста, а рядом (карточка: фото и подпись поверх — соседи):
     если такой элемент накрывает центр текста, фон надо мерить по снимку, а не по цвету секции */
  /* Чужие подложки: картинки, видео, холсты и блоки с фоном (цвет или картинка), которые не предки и
     не потомки текста, но лежат под его центром — карточка «фото и подпись поверх» или фигура под
     текстом в Tilda Zero Block (соседи, а не предки). Тогда фон по цепочке предков неверен — по снимку.
     Слой зерна во весь экран (data-rw-grain) не в счёт: его действие учтено отображением map.
     Обычный текст сравнивается с обычными подложками в координатах документа (закреплённая плашка
     лежит под ним только на миг прокрутки). Закреплённый текст (шапка, нижняя панель) — со всеми
     подложками, и закреплёнными, и обычными, в координатах окна на текущей прокрутке (здесь — верх
     страницы): прозрачная шапка поверх фото первого экрана иначе мерилась по фону body. */
  const fixedOf = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; };
  const imgLike = [...document.body.querySelectorAll('*')].filter((e) => {
    if ((map && e.hasAttribute('data-rw-grain')) || e instanceof SVGElement || !V(e)) return false;
    if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(e.tagName)) return true;
    const s = getComputedStyle(e); const bi = s.backgroundImage;
    if (bi && bi !== 'none' && !/^linear-gradient\(rgba\(0, 0, 0, 0\)/.test(bi)) return true;
    const c = parseC(s.backgroundColor); return !!(c && c.a > 0.05);
  }).map((e) => { const r = e.getBoundingClientRect(); const fx = fixedOf(e); const oy = fx ? 0 : scrollY; return { e, fx, l: r.left, t: r.top + oy, r: r.right, b: r.bottom + oy, vt: r.top, vb: r.bottom }; });
  const coveredByImage = (el) => {
    const r = el.getBoundingClientRect(); const fx = fixedOf(el); const cx = (r.left + r.right) / 2;
    const mine = (i) => i.e !== el && !i.e.contains(el) && !el.contains(i.e) && cx >= i.l && cx <= i.r;
    const cyV = (r.top + r.bottom) / 2, cyD = cyV + scrollY;
    const hit = fx ? imgLike.filter((i) => mine(i) && cyV >= i.vt && cyV <= i.vb) : imgLike.filter((i) => !i.fx && mine(i) && cyD >= i.t && cyD <= i.b);
    return hit.length ? hit.map((i) => sig(i.e)).join('+') : null;
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  const add = (bucket, key, rec, example) => { const f = bucket[key] || (bucket[key] = { ...rec, count: 0, examples: [] }); f.count++; if (f.examples.length < 3) f.examples.push(example); };
  contrast.total = allText.length; contrast.considered = textEls.length;
  for (const el of textEls) {
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize); const large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700); const need = large ? 3 : 4.5;
    let c = colorsOf(el);
    if (c.transparentText) { contrast.transparentText++; continue; }
    const under = coveredByImage(el);
    if (!c.imageBg && under) c = { imageBg: true, fg: c.raw, alpha: c.alpha * c.opacity };
    const label = `${sig(el)} «${el.textContent.trim().slice(0, 30)}» ${Math.round(size)}px`;
    if (c.imageBg) {
      contrast.unknown++;
      /* по снимку — до 60 элементов, но не больше трёх одинаковых (по тегу и классам): сто карточек одного вида не нужны */
      /* ключ ограничения «не больше трёх одинаковых»: подпись без id (у карточек он у каждой свой) и то,
         что лежит под текстом (пункт меню на плашке и такой же на плашке поверх фото — разные случаи) */
      const key = sig(el).replace(/#[^.]*/, '') + '|' + hex(c.fg) + '|' + (under || (c.displaced ? 'вынесен' : '')); contrast.perSig = contrast.perSig || {}; contrast.perSig[key] = (contrast.perSig[key] || 0) + 1;
      if (contrast.imgList.length < 60 && contrast.perSig[key] <= 3) { const idx = contrast.imgList.length; el.setAttribute('data-rw-imgbg', idx); const fgG = grain(c.fg); contrast.imgList.push({ idx, sig: sig(el), text: el.textContent.trim().slice(0, 30), fg: hex(c.fg), fgRgb: { r: c.fg.r, g: c.fg.g, b: c.fg.b }, fgGrain: map ? { r: fgG.r, g: fgG.g, b: fgG.b } : null, alpha: r2(Math.min(1, c.alpha)), size: Math.round(size), need, fixed: fixedOf(el) }); }
      continue;
    }
    contrast.checked++;
    const tr = c.alpha < 0.999 || c.opacity < 0.999; if (tr) contrast.translucent++;
    const r = ratio(c.fg, c.bg);
    const ex = label + (tr ? `, прозрачность ${r2(c.alpha * c.opacity)}` : '');
    if (r < need) add(contrast.failures, `${hex(c.fg)} на ${hex(c.bg)}`, { ratio: r2(r), need, translucent: tr }, ex);
    else if (map) {
      contrast.grain.checked++;
      const rg = ratio(grain(c.fg), grain(c.bg));
      const key = `${hex(c.fg)} на ${hex(c.bg)}`;
      if (rg < need) add(contrast.grain.failures, key, { ratio: r2(r), ratioGrain: r2(rg), need, withGrain: `${hex(grain(c.fg))} на ${hex(grain(c.bg))}` }, ex);
      else if (rg < need * 1.1) add(contrast.grain.near, key, { ratio: r2(r), ratioGrain: r2(rg), need }, ex);
    }
  }
  /* мелкий текст: всё видимое, кроме sr-only */
  const smallText = { checked: 0, groups: {} };
  for (const el of allText) {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (r.width <= 2 || r.height <= 2 || /rect\(0(px)?,? 0(px)?/.test(s.clip) || /inset\(50%\)/.test(s.clipPath)) continue;
    smallText.checked++;
    const size = Math.round(parseFloat(s.fontSize) * 10) / 10; if (size >= 12) continue;
    add(smallText.groups, `${size}`, { size, status: size < 10 ? 'FAIL' : 'WARN' }, `${sig(el)} «${el.textContent.trim().slice(0, 24)}»`);
  }
  const imgsNoAlt = [...document.images].filter((i) => V(i) && !i.hasAttribute('alt')).map((i) => (i.currentSrc || i.src).split('/').pop().slice(0, 50)).slice(0, 10);
  const decorativeEmpty = [...document.images].filter((i) => i.getAttribute('alt') === '').length;
  const unlabeled = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')].filter((i) => V(i) && !((i.labels && i.labels.length) || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.getAttribute('title'))).map((i) => `${sig(i)}${i.placeholder ? ` (только placeholder «${i.placeholder}»)` : ''}`).slice(0, 10);
  const nameless = [...document.querySelectorAll('a, button, [role=button]')].filter((el) => V(el) && !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.querySelector('img[alt]:not([alt=""]), svg[aria-label], svg title'))).map((el) => sig(el)).slice(0, 10);
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(V).map((h) => +h.tagName[1]);
  const skips = []; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skips.push(`h${hs[i - 1]}→h${hs[i]}`);
  const vpMeta = (document.querySelector('meta[name=viewport]') || {}).content || '';
  const targets = isMobile ? [...document.querySelectorAll('a[href], button, [role=button], input[type=checkbox], input[type=radio], summary')].filter((el) => { if (!V(el)) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); const inline = s.display === 'inline' && el.parentElement && /^(p|li|td|span|dd)$/i.test(el.parentElement.tagName); return !inline && (r.width < 24 || r.height < 24); }).map((el) => { const r = el.getBoundingClientRect(); return `${sig(el)} ${Math.round(r.width)}×${Math.round(r.height)}`; }).slice(0, 10) : [];
  const smallInputs = isMobile ? [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((i) => V(i) && parseFloat(getComputedStyle(i).fontSize) < 16).map((el) => sig(el)).slice(0, 6) : [];
  let reduced = false; for (const sh of document.styleSheets) { try { const walk = (rs) => { for (const r of rs) { if (r.type === CSSRule.MEDIA_RULE) { if (/prefers-reduced-motion/.test(r.conditionText)) reduced = true; walk(r.cssRules); } } }; walk(sh.cssRules); } catch { /* кросс-домен */ } }
  return { contrast, smallText, clippedText: clippedCount, imgsNoAlt, imgsNoAltCount: [...document.images].filter((i) => V(i) && !i.hasAttribute('alt')).length, decorativeEmpty, unlabeled, nameless, headings: { count: hs.length, h1: hs.filter((h) => h === 1).length, skips }, lang: document.documentElement.lang || null, zoomBlocked: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?(\D|$)/i.test(vpMeta), positiveTabindex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length, targets, smallInputs, reducedMotionRule: reduced, autoplayVideo: [...document.querySelectorAll('video[autoplay]')].filter((v) => !v.muted).length, skipLink: !!document.querySelector('a[href^="#"][class*="skip"], a[href="#main"], a[href="#content"]'), landmarks: { main: document.querySelectorAll('main, [role=main]').length, nav: document.querySelectorAll('nav, [role=navigation]').length, header: document.querySelectorAll('header, [role=banner]').length, footer: document.querySelectorAll('footer, [role=contentinfo]').length }, iframesNoTitle: [...document.querySelectorAll('iframe')].filter((f) => !f.title).length };
}

/* ---------- закреплённый текст на прокрутке: функции страницы ---------- */

/* текст в блоках position: fixed или sticky, видимый в окне сейчас: метка data-rw-fx=<номер>.
   Повторный вызов добавляет только новые (шапка, ставшая fixed после прокрутки). band — где по
   высоте окна стоит центр текста, когда блок закреплён (у sticky — по его top или bottom). */
function fixedTextInPage({ limit }) {
  const vw = innerWidth, vh = innerHeight;
  const pinned = (n) => { const p = getComputedStyle(n).position; return p === 'fixed' || p === 'sticky'; };
  const hosts = document.body ? [...document.body.querySelectorAll('*')].filter(pinned) : [];
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  const hostOf = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (pinned(n)) return n; return null; };
  const kindOf = (el, host) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { if (n.tagName === 'NAV' || n.getAttribute('role') === 'navigation') return 'меню'; if (n === host) break; }
    const c = (typeof host.className === 'string' ? host.className : '') + ' ' + (host.id || ''); const role = host.getAttribute('role') || '';
    if (host.tagName === 'HEADER' || role === 'banner' || /head|top/i.test(c)) return 'шапка';
    if (/nav|menu|tab/i.test(c)) return 'меню';
    if (host.tagName === 'FOOTER' || /foot|bottom/i.test(c)) return 'нижняя панель';
    return 'закреплённый блок';
  };
  /* центр за краем предка с overflow ≠ visible (закрытое выпадающее меню: max-height 0 и overflow
     hidden) — на экране текста нет; как clipped в domInPage */
  const clipped = (el, cx, cy) => {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const b = n.getBoundingClientRect(); if (cx < b.left - 1 || cx > b.right + 1 || cy < b.top - 1 || cy > b.bottom + 1) return true; }
      if (s.position === 'fixed') break;
    }
    return false;
  };
  const seen = new Set(); const found = [];
  for (const h of hosts) {
    for (const el of [h, ...h.querySelectorAll('*')]) {
      if (seen.has(el)) continue; seen.add(el);
      if (el instanceof SVGElement || el.hasAttribute('data-rw-fx') || !ownText(el) || !vis(el)) continue;
      const r = el.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) continue; /* sr-only */
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue; /* закрытое меню за краем окна */
      if (clipped(el, cx, cy)) continue;
      const host = hostOf(el); const hs = getComputedStyle(host); const hr = host.getBoundingClientRect();
      let band = cy;
      if (hs.position === 'sticky') { if (hs.top !== 'auto') band = parseFloat(hs.top) + (cy - hr.top); else if (hs.bottom !== 'auto') band = vh - parseFloat(hs.bottom) - (hr.bottom - cy); }
      band = Math.max(1, Math.min(vh - 1, band));
      found.push({ el, host, pos: hs.position, band, area: hr.width * hr.height, key: sig(el).replace(/#[^.]*/, '') + '|' + (hexc(getComputedStyle(el).color) || '') + '|' + sig(host) });
    }
  }
  const total = found.length;
  /* больше предела: сначала мелкие блоки (шапка и меню раньше закреплённых секций), не больше трёх одинаковых */
  let take = found;
  if (found.length > limit) { const per = {}; take = [...found].sort((a, b) => a.area - b.area).filter((f) => (per[f.key] = (per[f.key] || 0) + 1) <= 3).slice(0, Math.max(0, limit)); }
  let n = window.__rwFxN || 0; const items = [];
  for (const f of take) {
    const idx = n++; f.el.setAttribute('data-rw-fx', idx);
    items.push({ idx, sig: sig(f.el), text: f.el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30), host: sig(f.host), kind: kindOf(f.el, f.host), pos: f.pos, band: Math.round(f.band) });
  }
  window.__rwFxN = n;
  return { items, total };
}

/* секции страницы (метка data-rw-sec) с фоном и положением в документе; высоты прокрутки */
function sectionsInPage() {
  const sc = window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller : null;
  const cur = sc ? sc.scrollTop : scrollY;
  const docH = sc ? sc.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const viewH = sc ? sc.clientHeight : innerHeight; const vw = innerWidth;
  const skip = /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|BR)$/;
  const kids = (n) => [...n.children].filter((c) => {
    if (skip.test(c.tagName) || c.hasAttribute('data-rw-grain')) return false;
    const s = getComputedStyle(c); if (s.display === 'none' || s.position === 'fixed' || s.position === 'absolute') return false;
    const r = c.getBoundingClientRect();
    if (s.position === 'sticky' && r.height < viewH * 0.5) return false; /* закреплённая шапка — не секция */
    return r.height >= 1 && r.width >= vw * 0.5;
  });
  /* обёртки во всю высоту (main, #allrecords …) раскрываются в их детей */
  const expand = (n, depth) => { const out = []; for (const c of kids(n)) { const h = c.getBoundingClientRect().height; if (depth < 6 && h >= docH * 0.6 && h > viewH * 1.5 && kids(c).length >= 1) out.push(...expand(c, depth + 1)); else out.push(c); } return out; };
  const probe = (n) => {
    const s = getComputedStyle(n); const bi = s.backgroundImage;
    if (bi && bi !== 'none' && !/^linear-gradient\(rgba\(0, 0, 0, 0\)/.test(bi)) return 'картинка';
    const c = hexc(s.backgroundColor); if (c && (c.length === 7 || parseInt(c.slice(7, 9), 16) > 12)) return c.slice(0, 7);
    return null;
  };
  const bgOf = (sec) => {
    const own = probe(sec); if (own) return own;
    const R = sec.getBoundingClientRect(); const area = R.width * R.height; let k = 0;
    for (const d of sec.querySelectorAll('*')) {
      if (++k > 400) break;
      const r = d.getBoundingClientRect(); if (r.width * r.height < area * 0.5) continue;
      if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(d.tagName)) return 'картинка';
      const p = probe(d); if (p) return p;
    }
    return 'фон страницы';
  };
  /* прокручивается блок во весь экран (body{overflow:hidden}, .app{overflow:auto}) — секции в нём,
     координаты — от начала его содержимого; scTop — где его верх в окне (полосы считаются от него) */
  const scTop = sc ? sc.getBoundingClientRect().top : 0;
  const list = sc ? expand(sc, 0) : document.body ? expand(document.body, 0) : [];
  const sections = list.map((el, i) => {
    el.setAttribute('data-rw-sec', i); const r = el.getBoundingClientRect();
    const hd = el.querySelector('h1,h2,h3'); const t = (hd ? hd.textContent : '').trim().replace(/\s+/g, ' '); const title = t.length > 30 ? t.slice(0, 29).trimEnd() + '…' : t;
    return { i, sig: sig(el), title, top: Math.round(r.top - scTop + cur), bottom: Math.round(r.bottom - scTop + cur), bg: bgOf(el) };
  });
  return { sections, docH: Math.round(docH), viewH, scTop: Math.round(scTop), maxScroll: Math.max(0, Math.round(docH - viewH)), scroller: sc ? sig(sc) : null };
}

/* состояние помеченного закреплённого текста на текущей высоте: виден ли, цвет сейчас, коробки строк */
function fixedStateInPage({ ids }) {
  const sc = window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller : null;
  const at = Math.round(sc ? sc.scrollTop : scrollY);
  const sg = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : '');
  const secs = [...document.querySelectorAll('[data-rw-sec]')];
  /* видимая область (visualViewport): снимок окна — это она, а не окно раскладки. Коробки строк — в
     координатах окна раскладки; у страницы без meta viewport (или с width=1000) на телефоне видимая
     область 980–1000 px шириной, а не 390, а у страницы с контентом шире экрана при initial-scale=1
     окно раскладки шире и выше видимой области (354×629 против 320×568) — нижняя панель у его низа
     на снимок не попадает */
  const vv = window.visualViewport;
  const VX = vv ? vv.offsetLeft : 0, VY = vv ? vv.offsetTop : 0, VW = vv ? vv.width : innerWidth, VH = vv ? vv.height : innerHeight;
  const inView = (x, y) => x >= VX && y >= VY && x <= VX + VW && y <= VY + VH;
  const out = ids.map((i) => {
    const el = document.querySelector(`[data-rw-fx="${i}"]`); if (!el) return { i, state: 'нет' };
    if (!vis(el)) return { i, state: 'скрыт' };
    /* коробки строк тянутся на всю длину текста, и за край блока с overflow ≠ visible (многоточие,
       max-width) — там букв нет, на снимке под ними страница за плашкой. Коробки обрезаются по самому
       элементу и предкам с overflow; на absolute/fixed цепочка кончается (предки выше его не режут) */
    const cb = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity };
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display !== 'inline' && s.display !== 'contents' && (s.overflowX !== 'visible' || s.overflowY !== 'visible')) {
        const q = n.getBoundingClientRect();
        if (s.overflowX !== 'visible') { cb.l = Math.max(cb.l, q.left); cb.r = Math.min(cb.r, q.right); }
        if (s.overflowY !== 'visible') { cb.t = Math.max(cb.t, q.top); cb.b = Math.min(cb.b, q.bottom); }
      }
      if (s.position === 'fixed' || s.position === 'absolute') break;
    }
    const rects = []; let raw = 0;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || n.textContent.trim().length < 2) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r0 of rg.getClientRects()) {
        if (r0.width <= 1 || r0.height <= 1) continue; raw++;
        const x0 = Math.max(r0.left, cb.l), y0 = Math.max(r0.top, cb.t), x1 = Math.min(r0.right, cb.r), y1 = Math.min(r0.bottom, cb.b);
        if (x1 - x0 > 1 && y1 - y0 > 1) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    if (!raw) return { i, state: 'скрыт' };
    if (!rects.length) return { i, state: 'обрезан' };
    const l = Math.min(...rects.map((r) => r.x)), t = Math.min(...rects.map((r) => r.y)), rr = Math.max(...rects.map((r) => r.x + r.w)), b = Math.max(...rects.map((r) => r.y + r.h));
    const cx = (l + rr) / 2, cy = (t + b) / 2;
    if (!inView(cx, cy)) return { i, state: 'вне окна' };
    /* точка проверки — середина первой строки в видимой области (середина блока из двух строк может
       прийтись на просвет между ними). pointer-events у текста на время проверки — auto инлайном с
       !important (перебивает и правило сайта с !important): elementsFromPoint не видит pointer-events: none */
    const hr = rects.find((r) => inView(r.x + r.w / 2, r.y + r.h / 2)) || rects[0];
    const hx = hr.x + hr.w / 2, hy = hr.y + hr.h / 2;
    const pe = [el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events')];
    el.style.setProperty('pointer-events', 'auto', 'important');
    let hit = false;
    try {
      for (const n of document.elementsFromPoint(hx, hy)) {
        if (n === el || el.contains(n)) { hit = true; break; }
        /* предок нашёлся раньше самого текста — в этой точке текст не нарисован: обрезан предком
           (overflow, clip-path), на снимке его нет */
        if (n.contains(el)) break;
        const s = getComputedStyle(n); const c = hexc(s.backgroundColor); const a = c ? (c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1) : 0;
        if (/^(IMG|VIDEO|CANVAS|IFRAME)$/.test(n.tagName) || s.backgroundImage !== 'none' || a >= 0.99) return { i, state: 'перекрыт', by: sg(n) };
      }
    } finally { if (pe[0]) el.style.setProperty('pointer-events', pe[0], pe[1]); else el.style.removeProperty('pointer-events'); }
    if (!hit) return { i, state: 'обрезан' };
    /* смешение с фоном (mix-blend-mode у самого текста или предка): текст рисуется смешанным цветом */
    let blend = 'normal';
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const m = getComputedStyle(n).mixBlendMode; if (m && m !== 'normal') { blend = m; break; } }
    const s = getComputedStyle(el); const fill = s.webkitTextFillColor; const c = hexc(fill && fill !== s.color ? fill : s.color);
    if (!c) return { i, state: 'прозрачный цвет' };
    const fa = c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1;
    let sec = null; for (const n of secs) { const r = n.getBoundingClientRect(); if (cy >= r.top && cy < r.bottom && cx >= r.left && cx <= r.right) sec = Number(n.getAttribute('data-rw-sec')); }
    const size = parseFloat(s.fontSize);
    return { i, state: 'виден', fg: { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) }, hex: c.slice(0, 7), alpha: Math.min(1, fa * eff(el)), size, need: size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700) ? 3 : 4.5, rects, sec, blend };
  });
  /* iw — ширина видимой области в CSS-пикселях (масштаб снимка считается от неё), ox, oy — её смещение
     в окне раскладки (на него сдвигаются коробки строк перед выборкой пикселей) */
  return { at, iw: VW, ox: VX, oy: VY, items: out };
}

/* видимая область на место. scrollIntoView (замер текста на картинке) на странице с контентом шире
   экрана сдвигает видимую область внутри окна раскладки (visualViewport.offsetLeft/offsetTop: 390,516 на
   телефоне), а window.scrollTo — и lib.scrollToY — этот сдвиг не сбрасывают: на всех следующих высотах
   шапка выходила «вне окна». Сбрасывает его scrollIntoView корня (заодно scrollX и scrollY — в 0).
   Сдвига нет и вбок не прокручено (обычная страница) — ничего не делает: прокрутка прежняя */
function resetViewInPage() {
  const vv = window.visualViewport;
  const need = (vv && (Math.abs(vv.offsetLeft) > 0.5 || Math.abs(vv.offsetTop) > 0.5)) || Math.abs(scrollX) > 0.5;
  if (need) document.documentElement.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' });
  return need;
}
const resetView = (page) => page.evaluate(resetViewInPage).catch(() => false);

/* ---------- закреплённый текст на прокрутке: высоты и замер ---------- */
const FX_MAX_POS = 8, FX_LIMIT = 40;

/* высоты прокрутки: полоса закреплённого текста (band) над секцией — её середина под полосой.
   Сначала каждый фон секций, которого полосы не касались наверху (там мерит основной проход), затем
   остальные секции (подряд идущие с одним фоном — одна); жадно, не больше max */
function pickPositions(bands, secs, maxScroll, max) {
  if (!secs.length || maxScroll < 1) return [];
  const at = (y, b) => { const d = y + b; let s = null; for (const x of secs) if (d >= x.top && d < x.bottom) s = x; return s; };
  const runOf = new Map(); let run = -1, prev = null;
  for (const s of secs) { if (!prev || prev.bg !== s.bg) run++; runOf.set(s.i, run); prev = s; }
  const keysAt = (y) => { const k1 = new Set(), k2 = new Set(); for (const b of bands) { const s = at(y, b); if (!s) continue; k1.add(`${b}|${s.bg}`); k2.add(`${b}|${runOf.get(s.i)}`); } return { k1, k2 }; };
  const cands = [];
  for (const b of bands) for (const s of secs) {
    const lo = Math.max(1, Math.ceil(s.top - b)), hi = Math.min(maxScroll, Math.floor(s.bottom - b - 1));
    if (lo > hi) continue;
    const y = Math.round(Math.min(hi, Math.max(lo, (s.top + s.bottom) / 2 - b)));
    if (!cands.some((c) => Math.abs(c.y - y) < 16)) cands.push({ y, ...keysAt(y) });
  }
  const top = keysAt(0); const got = { k1: new Set(top.k1), k2: new Set(top.k2) }; const chosen = [];
  for (const level of ['k1', 'k2']) {
    while (chosen.length < max) {
      let best = null, gain = 0;
      for (const c of cands) { if (chosen.includes(c)) continue; const g = [...c[level]].filter((k) => !got[level].has(k)).length; if (g > gain) { best = c; gain = g; } }
      if (!best) break;
      chosen.push(best); for (const k of best.k1) got.k1.add(k); for (const k of best.k2) got.k2.add(k);
    }
  }
  return chosen.map((c) => c.y).sort((a, b) => a - b);
}

/* пиксели снимка внутри коробок строк (CSS-пиксели окна × k), не больше ~4000 */
function sampleRects(data, info, rects, k, maxN = 4000) {
  const W = info.width, H = info.height, ch = info.channels; const boxes = []; let area = 0;
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x * k)), y0 = Math.max(0, Math.floor(r.y * k)), x1 = Math.min(W, Math.ceil((r.x + r.w) * k)), y1 = Math.min(H, Math.ceil((r.y + r.h) * k));
    if (x1 > x0 && y1 > y0) { boxes.push([x0, y0, x1, y1]); area += (x1 - x0) * (y1 - y0); }
  }
  const stride = Math.max(1, Math.floor(area / maxN)); const px = []; let n = 0;
  for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (n++ % stride) continue; const i = (y * W + x) * ch; px.push([data[i], data[i + 1], data[i + 2]]); }
  return px;
}

async function fixedOnScroll(page, map) {
  const lumRgb = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const f1 = (pts, c) => (c <= 128 ? pts[0] + (pts[1] - pts[0]) * c / 128 : pts[1] + (pts[2] - pts[1]) * (c - 128) / 127);
  const r2 = (v) => Math.round(v * 100) / 100;
  /* mix-blend-mode текста (каналы 0…1: b — фон под текстом, s — цвет текста); остальные режимы не мерятся */
  const BLEND = {
    multiply: (b, c) => b * c, screen: (b, c) => b + c - b * c,
    overlay: (b, c) => (b <= 0.5 ? 2 * b * c : 1 - 2 * (1 - b) * (1 - c)), 'hard-light': (b, c) => (c <= 0.5 ? 2 * b * c : 1 - 2 * (1 - b) * (1 - c)),
    darken: (b, c) => Math.min(b, c), lighten: (b, c) => Math.max(b, c), difference: (b, c) => Math.abs(b - c), exclusion: (b, c) => b + c - 2 * b * c,
    'color-dodge': (b, c) => (b <= 0 ? 0 : c >= 1 ? 1 : Math.min(1, b / (1 - c))), 'color-burn': (b, c) => (b >= 1 ? 1 : c <= 0 ? 0 : 1 - Math.min(1, (1 - b) / c)),
  };
  /* замер текста на картинке перед этим мог сдвинуть видимую область (scrollIntoView) — на место */
  await resetView(page);
  await scrollToY(page, 0); await sleep(400);
  const scan = await evaluateWith(page, sectionsInPage, null, DEPS);
  const a = await evaluateWith(page, fixedTextInPage, { limit: FX_LIMIT }, DEPS);
  let b = { items: [], total: 0 };
  if (scan.maxScroll > 0 && a.items.length < FX_LIMIT) {
    await scrollToY(page, Math.min(scan.viewH, scan.maxScroll)); await sleep(500); await settleAnimations(page, 1500);
    b = await evaluateWith(page, fixedTextInPage, { limit: FX_LIMIT - a.items.length }, DEPS);
  }
  const items = [...a.items, ...b.items];
  const out = { items, total: a.total + b.total, sections: scan.sections, docH: scan.docH, maxScroll: scan.maxScroll, positions: [], how: '', results: [], failures: [], skipped: { 'скрыт': 0, 'вне окна': 0, 'перекрыт': 0, 'обрезан': 0, 'прозрачный цвет': 0, 'смешение цвета': 0, 'вне снимка': 0, 'нет': 0 }, measured: 0, worst: null };
  if (!items.length) return { ...out, none: true };
  if (!sharp) return { ...out, error: 'нет sharp — снимки фона не разобрать' };
  const bands = [...new Set(items.map((it) => Math.round((it.band - (scan.scTop || 0)) / 8) * 8))];
  let positions = pickPositions(bands, scan.sections, scan.maxScroll, FX_MAX_POS); out.how = 'секции с другим фоном';
  if (!positions.length && scan.maxScroll >= 1) { positions = [Math.round(scan.maxScroll / 2)]; out.how = 'секций с другим фоном нет — одна высота посередине'; }
  out.positions = positions;
  /* на время снимка фона прячется весь текст страницы, а не только закреплённый: текст секции,
     проезжающий под прозрачной шапкой, — не фон (иначе худшие 10 % пикселей — чужие буквы) */
  await addCss(page, 'hide-fx', 'html.rw-hide-fx,html.rw-hide-fx *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;transition:none!important}');
  const byIdx = new Map(items.map((it) => [it.idx, it]));
  const ids = items.map((it) => it.idx);
  const shownN = (st) => st.items.filter((s) => s.state === 'виден').length;
  const goTo = async (y, from) => {
    /* сдвиг видимой области scrollToY не сбрасывает — иначе шапка «вне окна» на всех высотах */
    await resetView(page);
    if (from != null) { await scrollToY(page, from); await sleep(200); }
    await scrollToY(page, y); await sleep(450); await settleAnimations(page, 1500);
    return evaluateWith(page, fixedStateInPage, { ids }, DEPS);
  };
  await scrollToY(page, 0); await sleep(300);
  for (const y of positions) {
    /* высоты по возрастанию — к каждой подъезжаем сверху (прокрутка вниз). Шапка, которая прячется при
       прокрутке вниз, видна при прокрутке вверх — если часть текста спрятана, за окном или обрезана
       (шапка уезжает вверх под overflow:hidden или clip-path обёртки), подъехать снизу */
    let st = await goTo(y); let approach = 'сверху';
    if (st.items.some((s) => s.state === 'вне окна' || s.state === 'скрыт' || s.state === 'обрезан') && scan.maxScroll > 160) {
      /* низ страницы: ниже подъехать некуда — встать на 60 px выше, подъехав от низа (прокрутка вверх;
         160 px уводили полосу из нужной секции) */
      const y2 = y < scan.maxScroll ? y : Math.max(1, y - 60);
      const n1 = shownN(st); const st2 = await goTo(y2, Math.min(scan.maxScroll, y2 + 160));
      if (shownN(st2) > n1) { st = st2; approach = 'снизу'; } else if (shownN(st2) < n1 || y2 !== y) st = await goTo(y, Math.max(0, y - 160));
    }
    for (const s of st.items) if (s.state === 'виден' && s.blend && s.blend !== 'normal' && !BLEND[s.blend]) s.state = 'смешение цвета';
    const shown = st.items.filter((s) => s.state === 'виден');
    const res = { y, scrollY: st.at, approach, measured: 0, skipped: {} };
    for (const s of st.items) if (s.state !== 'виден') { out.skipped[s.state] = (out.skipped[s.state] || 0) + 1; res.skipped[s.state] = (res.skipped[s.state] || 0) + 1; }
    out.results.push(res);
    if (!shown.length) continue;
    await page.evaluate(() => document.documentElement.classList.add('rw-hide-fx'));
    let buf;
    try { await sleep(150); buf = await page.screenshot({ type: 'png' }); } finally { await page.evaluate(() => document.documentElement.classList.remove('rw-hide-fx')); }
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    /* снимок — видимая область: масштаб от её ширины, коробки строк (в координатах окна раскладки)
       сдвигаются на её смещение */
    const k = info.width / (st.iw || vp.width); const ox = st.ox || 0, oy = st.oy || 0;
    for (const s of shown) {
      const px = sampleRects(data, info, ox || oy ? s.rects.map((r) => ({ ...r, x: r.x - ox, y: r.y - oy })) : s.rects, k);
      /* видимый текст, под которым на снимке нет ни одного пикселя, — не молча мимо, а в «не мерились» */
      if (!px.length) { out.skipped['вне снимка']++; res.skipped['вне снимка'] = (res.skipped['вне снимка'] || 0) + 1; continue; }
      const it = byIdx.get(s.i); const F = map ? { r: f1(map[0], s.fg.r), g: f1(map[1], s.fg.g), b: f1(map[2], s.fg.b) } : s.fg; const al = s.alpha;
      const ratios = []; const bgL = [];
      /* цвет текста над пикселем фона: смешение (mix-blend-mode), затем альфа и opacity */
      const bf = s.blend && s.blend !== 'normal' ? BLEND[s.blend] : null; const mix = (b, c) => (bf ? 255 * bf(b / 255, c / 255) : c);
      for (const [R, G, B] of px) {
        const l = lumRgb(R, G, B); const fl = lumRgb(al * mix(R, F.r) + (1 - al) * R, al * mix(G, F.g) + (1 - al) * G, al * mix(B, F.b) + (1 - al) * B);
        ratios.push((Math.max(l, fl) + 0.05) / (Math.min(l, fl) + 0.05)); bgL.push(l);
      }
      ratios.sort((x, z) => x - z); bgL.sort((x, z) => x - z);
      const p10 = ratios[Math.floor(ratios.length * 0.1)], median = ratios[Math.floor(ratios.length / 2)];
      const lo = bgL[Math.floor(bgL.length * 0.1)], mid = bgL[Math.floor(bgL.length / 2)], hi = bgL[Math.floor(bgL.length * 0.9)];
      const tone = (hi + 0.05) / (lo + 0.05) > 3 ? 'пёстрый' : mid >= 0.45 ? 'светлый' : mid <= 0.12 ? 'тёмный' : 'средний по яркости';
      const sec = s.sec != null ? scan.sections[s.sec] : null;
      const rec = { y: st.at, approach, sig: it.sig, text: it.text, host: it.host, kind: it.kind, fg: s.hex, alpha: r2(al), blend: bf ? s.blend : null, size: Math.round(s.size), need: s.need, p10: r2(p10), median: r2(median), tone, section: sec ? `${sec.sig}${sec.title ? ` «${sec.title}»` : ''}` : null, sectionBg: sec ? sec.bg : null };
      res.measured++; out.measured++;
      if (!out.worst || p10 / s.need < out.worst.p10 / out.worst.need) out.worst = rec;
      if (p10 < s.need) out.failures.push(rec);
    }
  }
  return out;
}

/* ---------- зерно поверх текста: действие слоя по трём снимкам ---------- */
async function grainMap(page) {
  if (!sharp) return { skipped: 'нет sharp' };
  const f = await findTextureLayers(page, { mark: true });
  const over = f.layers.filter((L) => L.coversViewport && (L.position === 'fixed' || L.fixedBy) && !(parseInt(L.zIndex, 10) < 0));
  if (!over.length) return { layers: [], found: f.layers.length };
  /* сами слои-элементы помечаются: в контрасте они не «картинка за текстом», их действие — в map */
  await page.evaluate((ks) => { for (const k of ks) { const el = document.querySelector(`[data-rw-tex="${k}"]`); if (el) el.setAttribute('data-rw-grain', ''); } }, over.filter((L) => !L.pseudo).map((L) => L.k));
  const css =['html,body{background:var(--rw-probe)!important;background-image:none!important}', 'body *{visibility:hidden!important}']
    .concat(over.map((L) => (L.pseudo ? `[data-rw-tex-${L.pseudo.slice(2)}="${L.k}"]${L.pseudo}{visibility:visible!important}` : `[data-rw-tex="${L.k}"],[data-rw-tex="${L.k}"] *{visibility:visible!important}`))).join('\n');
  /* при строгом CSP <style> молча не применялся, и «действие слоя» мерилось по снимкам самой страницы —
     отображение выходило мусорным; теперь стиль переживает CSP, а не вставился — ошибка, WARN */
  await addCss(page, 'grain-probe', css);
  const vpx = page.viewport(); const d = vpx.deviceScaleFactor || 1;
  const means = [];
  try {
    for (const lvl of [0, 128, 255]) {
      await page.evaluate((v) => document.documentElement.style.setProperty('--rw-probe', `rgb(${v},${v},${v})`), lvl);
      await sleep(250);
      const buf = await page.screenshot({ type: 'png' });
      const W = Math.round(vpx.width * d), H = Math.round(vpx.height * d);
      const { data, info } = await sharp(buf).extract({ left: Math.round(W * 0.1), top: Math.round(H * 0.1), width: Math.round(W * 0.8), height: Math.round(H * 0.8) }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const sum = [0, 0, 0]; const n = info.width * info.height;
      for (let i = 0; i < n; i++) { sum[0] += data[i * 3]; sum[1] += data[i * 3 + 1]; sum[2] += data[i * 3 + 2]; }
      means.push(sum.map((s) => Math.round(s / n * 100) / 100));
    }
  } finally {
    await removeCss(page, 'grain-probe');
    await page.evaluate(() => document.documentElement.style.removeProperty('--rw-probe'));
    await sleep(200);
  }
  const map = [0, 1, 2].map((ch) => [means[0][ch], means[1][ch], means[2][ch]]);
  const identity = map.every((p) => Math.abs(p[0]) < 0.6 && Math.abs(p[1] - 128) < 0.6 && Math.abs(p[2] - 255) < 0.6);
  return { layers: over.map((L) => ({ el: L.el + (L.pseudo || ''), blend: L.mixBlendMode, opacity: L.effectiveOpacity, zIndex: L.zIndex })), map, identity, points: { black: means[0], gray: means[1], white: means[2] } };
}

/* ---------- фокус: обход Tab на свежей странице ---------- */
const PROPS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'backgroundColor', 'borderTopColor', 'color', 'textDecorationLine'];
async function focusWalk(page) {
  const focusables = await page.evaluate(() => [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, iframe, [tabindex], [contenteditable=""], [contenteditable="true"]')].filter((el) => {
    if (el.disabled) return false; const ti = el.getAttribute('tabindex'); if (ti !== null && Number(ti) < 0) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === 'visible';
  }).length);
  const focus = { focusables, expected: Math.min(5, focusables), visited: 0, invisible: [], trapped: false, first: null, stuckAt: null, iframes: [], iframeStuck: null };
  let sameSteps = 0, skipPress = false;
  for (let i = 0; i < 30; i++) {
    if (!skipPress) { await page.keyboard.press('Tab'); await sleep(80); }
    skipPress = false;
    /* сравниваем сами элементы, а не подписи: пять ссылок подряд с одной подписью — не ловушка.
       iframe: фокус внутри него, activeElement страницы — сам iframe; blur() выбросил бы фокус наружу,
       поэтому видимость не проверяется, а элемент помечается __rwInside */
    const cur = await page.evaluate((props, sigSrc) => { const sig = eval(sigSrc); const el = document.activeElement; if (!el || el === document.body) return null; const type = (el.getAttribute('type') || '').toLowerCase(); if (el.__rwSeen) return { sig: sig(el), same: true, type, iframe: el.tagName === 'IFRAME' }; el.__rwSeen = true; if (el.tagName === 'IFRAME') { el.__rwInside = true; return { sig: sig(el), same: false, type, iframe: true }; } const s = getComputedStyle(el); const focused = Object.fromEntries(props.map((p) => [p, s[p]])); el.blur(); const s2 = getComputedStyle(el); const base = Object.fromEntries(props.map((p) => [p, s2[p]])); el.focus({ preventScroll: true }); return { sig: sig(el), changed: props.some((p) => focused[p] !== base[p]), same: false, type }; }, PROPS, SIG_FN);
    if (!cur) break;
    /* поле даты в Chrome — три внутренних сегмента: Tab ходит по ним, это не ловушка */
    if (cur.same) { if (/^(date|time|datetime-local|month|week)$/.test(cur.type) && (sameSteps = sameSteps + 1) <= 4) continue; focus.trapped = true; focus.stuckAt = cur.sig; break; }
    sameSteps = 0; focus.visited++; if (!focus.first) focus.first = cur.sig;
    if (cur.iframe) {
      /* Tab ходит по элементам внутри iframe (карта, видео): жмём, пока фокус не вернётся в страницу;
         следующий элемент страницы проверяется без лишнего нажатия */
      focus.iframes.push(cur.sig); let left = false;
      for (let k = 0; k < 40; k++) {
        await page.keyboard.press('Tab'); await sleep(60);
        const inside = await page.evaluate(() => !!(document.activeElement && document.activeElement.__rwInside));
        if (!inside) { left = true; break; }
      }
      if (!left) { focus.iframeStuck = cur.sig; break; }
      skipPress = true; continue;
    }
    if (!cur.changed) focus.invisible.push(cur.sig);
  }
  return focus;
}

/* ---------- прогон ---------- */
const browser = await launch();
let dom, focus, reveal, sc, grain = null, fx = null; const imgContrast = { measured: 0, skipped: 0, covered: 0, coveredList: [], failures: [] };
try {
  const page = await openPage(browser, url, vp);
  await forceInstantScroll(page);
  await evaluateWith(page, markHiddenInPage, null, {}).catch(() => 0);
  sc = await scrollThrough(page, { pause: 250 });
  await scrollToY(page, 0); await settleAnimations(page, 3000); await sleep(300);
  reveal = await evaluateWith(page, revealInPage, null, DEPS).catch(() => null);
  if (!opt['no-grain']) grain = await grainMap(page).catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  const map = grain && grain.map && !grain.identity ? grain.map : null;
  dom = await evaluateWith(page, domInPage, { isMobile: !!vp.isMobile, map }, DEPS);

  /* контраст на картинках и градиентах: прячем текст, снимаем фон за ним, считаем по пикселям */
  if (sharp && dom.contrast.imgList.length) {
    const lumRgb = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    /* строгий CSP: page.addStyleTag падал «Could not load style» и ронял весь прогон (код 1, без JSON) —
       теперь стиль переживает CSP, а не вставился — WARN «не измерен», прогон идёт дальше */
    let cssOk = true;
    try { await addCss(page, 'img-hide', '.rw-hide-text,.rw-hide-text *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}\n.rw-pe,.rw-pe *{pointer-events:auto!important}'); } catch (e) { cssOk = false; imgContrast.error = String(e.message || e).slice(0, 200); }
    for (const it of cssOk ? dom.contrast.imgList : []) {
      const h = await page.$(`[data-rw-imgbg="${it.idx}"]`); if (!h) { imgContrast.skipped++; continue; }
      try {
        /* виден ли текст: сверху в его центре должен лежать он сам (или потомок), а не чужой непрозрачный
           блок — иначе на снимке будет перекрывший его блок, а не фон текста. elementsFromPoint не видит
           элементов с pointer-events:none (частый .hero__content{pointer-events:none}) — на время проверки
           им ставится pointer-events:auto (класс rw-pe). Закреплённый текст мерится на верху страницы:
           там его подложка и определялась (scrollIntoView его не двигает, а страницу оставил предыдущий).
           Верх — и видимая область на месте (предыдущий scrollIntoView на странице шире экрана сдвинул её,
           scrollTo сдвиг не сбрасывает — нижняя панель выходила «вне окна»), и прокручиваемый блок во весь
           экран в начале (scrollIntoView предыдущего прокрутил его, а scrollTo окна его не трогает). */
        if (it.fixed) await resetView(page);
        const state = await h.evaluate((el, fixed) => {
          if (fixed) {
            scrollTo({ top: 0, behavior: 'instant' });
            const sc = window.__rwScroller; if (sc && sc.isConnected) sc.scrollTo({ top: 0, behavior: 'instant' });
          } else el.scrollIntoView({ block: 'center', behavior: 'instant' });
          const sg = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : '');
          const r = el.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
          /* окно — видимая область (снимок — она), а не окно раскладки */
          const vv = window.visualViewport; const VX = vv ? vv.offsetLeft : 0, VY = vv ? vv.offsetTop : 0, VW = vv ? vv.width : innerWidth, VH = vv ? vv.height : innerHeight;
          if (cx < VX || cy < VY || cx > VX + VW || cy > VY + VH) return { state: 'вне окна' };
          el.classList.add('rw-pe');
          try {
            for (const n of document.elementsFromPoint(cx, cy)) {
              if (n === el || el.contains(n)) return { state: 'виден' };
              if (n.contains(el)) return { state: 'виден' };
              const s = getComputedStyle(n); const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor); const a = m ? (m[1].split(/[,\s/]+/).filter(Boolean)[3] ?? 1) : 0;
              if (/^(IMG|VIDEO|CANVAS|IFRAME)$/.test(n.tagName) || s.backgroundImage !== 'none' || Number(a) >= 0.99) return { state: 'перекрыт', by: sg(n) };
            }
            return { state: 'виден' };
          } finally { el.classList.remove('rw-pe'); }
        }, !!it.fixed);
        if (state.state !== 'виден') { imgContrast.covered = (imgContrast.covered || 0) + 1; imgContrast.coveredList.push({ sig: it.sig, text: it.text, state: state.state, by: state.by || null }); continue; }
        await h.evaluate((el) => el.classList.add('rw-hide-text'));
        await sleep(120);
        /* коробка и видимая область — из страницы: boundingBox отдаёт координаты окна раскладки, а снимок —
           видимая область (у страницы без meta viewport на телефоне 1 CSS-пиксель на снимке — 0.8 точки, а
           не 2: вырезка уходила за снимок, элемент молча шёл в «пропущено») */
        const g = await h.evaluate((el) => { const r = el.getBoundingClientRect(); const vv = window.visualViewport; return { x: r.left, y: r.top, w: r.width, h: r.height, VX: vv ? vv.offsetLeft : 0, VY: vv ? vv.offsetTop : 0, VW: vv ? vv.width : innerWidth, VH: vv ? vv.height : innerHeight }; });
        if (g.w < 4 || g.h < 4 || g.w * g.h > 1600 * 1200) { imgContrast.skipped++; await h.evaluate((el) => el.classList.remove('rw-hide-text')); continue; }
        /* снимок окна и вырезка по координатам окна: снимок элемента у закреплённых (position: fixed)
           и прокрученных элементов брал не ту область */
        const bx = g.x - g.VX, by = g.y - g.VY; const x0 = Math.max(0, bx), y0 = Math.max(0, by);
        const cw = Math.min(g.w - (x0 - bx), g.VW - x0), chh = Math.min(g.h - (y0 - by), g.VH - y0);
        const buf = await page.screenshot({ type: 'png' });
        await h.evaluate((el) => el.classList.remove('rw-hide-text'));
        const shot = sharp(buf); const meta = await shot.metadata(); const kS = meta.width / (g.VW || vp.width);
        const left = Math.round(x0 * kS), top = Math.round(y0 * kS);
        const ew = Math.min(meta.width - left, Math.round(cw * kS)), eh = Math.min(meta.height - top, Math.round(chh * kS));
        if (!(ew >= 1 && eh >= 1)) { imgContrast.covered++; imgContrast.coveredList.push({ sig: it.sig, text: it.text, state: 'вне снимка', by: null }); continue; }
        const { data, info } = await shot.extract({ left, top, width: ew, height: eh }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        /* цвет текста над пикселем фона: альфа и opacity смешивают его с этим пикселем; слой зерна
           уже есть на снимке фона — к цвету текста он применяется отдельно (fgGrain) */
        const F = it.fgGrain || it.fgRgb; const a = it.alpha;
        const n = info.width * info.height; const stride = Math.max(1, Math.floor(n / 4000)); const ratios = [];
        for (let p = 0; p < n; p += stride) {
          const i = p * 4; const R = data[i], G = data[i + 1], Bb = data[i + 2];
          const l = lumRgb(R, G, Bb); const fl = lumRgb(a * F.r + (1 - a) * R, a * F.g + (1 - a) * G, a * F.b + (1 - a) * Bb);
          ratios.push((Math.max(l, fl) + 0.05) / (Math.min(l, fl) + 0.05));
        }
        ratios.sort((x, y) => x - y);
        const p10 = ratios[Math.floor(ratios.length * 0.1)], median = ratios[Math.floor(ratios.length / 2)];
        imgContrast.measured++;
        if (p10 < it.need) imgContrast.failures.push({ sig: it.sig, text: it.text, fg: it.fg, alpha: it.alpha, size: it.size, p10: Math.round(p10 * 100) / 100, median: Math.round(median * 100) / 100, need: it.need });
      } catch { imgContrast.skipped++; try { await h.evaluate((el) => el.classList.remove('rw-hide-text')); } catch { /* ушёл */ } }
    }
  }
  /* закреплённый текст (шапка, меню, нижняя панель) над секциями ниже верха страницы */
  fx = await fixedOnScroll(page, map).catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  await page.close();

  /* фокус — на свежей странице (отдельная вкладка): старт обхода не должен зависеть от прокруток выше */
  const fp = await openPage(browser, url, vp);
  await forceInstantScroll(fp);
  await fp.bringToFront();
  focus = await focusWalk(fp);
  await fp.close();
} finally { await browser.close(); }

/* ---------- вердикты ---------- */
if (dom.clippedText) console.log(`Текст за краем обрезающего блока (слайд за краем, заглушка): ${dom.clippedText} — не проверялся`);
const lines = []; let fails = 0, warns = 0;
const L = (st, what, det) => { if (st === 'FAIL') fails++; if (st === 'WARN') warns++; lines.push({ status: st, what, details: det }); console.log(`${st.padEnd(4)} ${what}${det ? ' — ' + det : ''}`); };
{
  const bad = sc.stuck ? 'страница не прокручивается — появления и часть текста не проверены' : !sc.reachedBottom ? `до низа не доехали: ${sc.maxScrollY} из ${sc.pageHeight - (sc.viewH || vp.height)} px` : '';
  L(bad ? 'WARN' : 'OK', `прокрутка: страница пройдена целиком (${sc.pageHeight} px, ${sc.screens} шагов)`, bad || (reveal ? `блоков с текстом скрыто до прокрутки ${reveal.hidden}, показано после ${reveal.shown}${reveal.hidden - reveal.shown ? `; скрытыми остались ${reveal.hidden - reveal.shown} (меню, окна, наведение): ${reveal.still.slice(0, 4).join(', ')}` : ''}` : ''));
}
const C = dom.contrast;
const cf = Object.entries(C.failures).sort((a, b) => b[1].count - a[1].count);
const cut = C.total > C.considered;
L(cf.length ? 'FAIL' : cut ? 'WARN' : 'OK', `контраст: проверено ${C.checked} элементов${cut ? ` — взято ${C.considered} из ${C.total} текстовых (обрезано: остальные не проверялись)` : ` (текстовых на странице ${C.total})`}${C.translucent ? ` (из них ${C.translucent} полупрозрачных — смешаны с фоном)` : ''}${C.unknown ? `, ещё ${C.unknown} на картинке, градиенте или чужой подложке — см. ниже` : ''}${C.transparentText ? `, прозрачный цвет текста (градиент через background-clip) — ${C.transparentText}, не проверялись` : ''}`, cf.length ? cf.slice(0, 5).map(([k, v]) => `${k} = ${v.ratio}:1 (нужно ${v.need}:1), ${v.count} эл.: ${v.examples.join(', ')}`).join(' | ') : 'все пары проходят AA');
/* перекрытый или ушедший за окно текст не мерился — это не «OK», а «проверить глазами» (WARN) */
const covTxt = imgContrast.coveredList.length ? `не измерены — ${imgContrast.coveredList.slice(0, 5).map((c) => `${c.sig} «${c.text}» ${c.state === 'перекрыт' ? `перекрыт ${c.by}` : c.state}`).join(', ')}${imgContrast.coveredList.length > 5 ? ` и ещё ${imgContrast.coveredList.length - 5}` : ''} — смотреть глазами` : '';
if (C.unknown && imgContrast.error) L('WARN', `контраст по снимку фона за текстом (картинка, градиент, чужая подложка): не измерен — ${imgContrast.error}`, `${C.unknown} элементов на картинке, градиенте или чужой подложке не проверены — смотреть глазами`);
else if (C.unknown) L(imgContrast.failures.length ? 'FAIL' : imgContrast.covered ? 'WARN' : imgContrast.measured ? 'OK' : 'WARN', `контраст по снимку фона за текстом (картинка, градиент, чужая подложка): измерено ${imgContrast.measured}${imgContrast.skipped ? `, пропущено ${imgContrast.skipped}` : ''}${imgContrast.covered ? `, перекрыто другим блоком или вне окна ${imgContrast.covered} (не мерился)` : ''}${C.unknown > C.imgList.length ? `, не измерялось ${C.unknown - C.imgList.length}` : ''}`, [imgContrast.failures.length ? imgContrast.failures.slice(0, 6).map((f) => `${f.sig} «${f.text}» ${f.fg}${f.alpha < 1 ? ` (прозрачность ${f.alpha})` : ''} ${f.size}px: худшие 10% фона дают ${f.p10}:1 при медиане ${f.median}:1 (нужно ${f.need}:1)`).join(' | ') : imgContrast.measured ? 'измеренные — не ниже нормы' : sharp ? '' : 'нет sharp — не измерено', covTxt].filter(Boolean).join('; '));
if (fx && !fx.none) {
  const T = 'контраст закреплённого текста на прокрутке';
  const sk = Object.entries(fx.skipped || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ');
  if (fx.error) L('WARN', `${T}: не измерен`, fx.error);
  else if (!fx.positions.length) L('OK', `${T}: ${fx.items.length} элементов`, 'страница в один экран — других высот нет (верх страницы — в строках контраста выше)');
  else {
    const who = [...new Set(fx.items.map((it) => `${it.kind} ${it.host}`))].slice(0, 4).join(', ');
    const up = fx.results.filter((r) => r.approach === 'снизу').length;
    const head = `${T}: ${fx.positions.length} ${fx.positions.length === 1 ? 'высота' : fx.positions.length < 5 ? 'высоты' : 'высот'} (${fx.how}; ${fx.positions.join(', ')} px${up ? `; на ${up} — при прокрутке вверх: при прокрутке вниз текст прятался` : ''}), ${fx.items.length}${fx.total > fx.items.length ? ` из ${fx.total}` : ''} элементов (${who}), замеров ${fx.measured}${sk ? `; не мерились на части высот: ${sk}` : ''}`;
    if (fx.failures.length) {
      /* группы «высота + блок + секция»: «на 1840 px меню nav.menu над секцией … (фон под текстом светлый): a «Каталог» … 1.07:1» */
      const groups = new Map();
      for (const f of fx.failures) { const g = `на ${f.y} px${f.approach === 'снизу' ? ' (прокрутка вверх)' : ''} ${f.kind} ${f.host} над ${f.section ? `секцией ${f.section}` : 'местом вне секций'} (фон под текстом ${f.tone})`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(f); }
      const det = [...groups.entries()].slice(0, 4).map(([g, list]) => `${g}: ${list.slice(0, 3).map((f) => `${f.sig} «${f.text}» ${f.fg}${f.alpha < 1 ? ` (прозрачность ${f.alpha})` : ''}${f.blend ? ` (mix-blend-mode ${f.blend})` : ''} ${f.size}px — ${f.p10}:1 (медиана ${f.median}:1, нужно ${f.need}:1)`).join(', ')}${list.length > 3 ? ` и ещё ${list.length - 3}` : ''}`).join(' | ');
      L('FAIL', head, `${det}${groups.size > 4 ? ` | и ещё ${groups.size - 4} мест` : ''}`);
    } else if (!fx.measured) L('WARN', head, 'ни одного замера: закреплённый текст на этих высотах спрятан, за окном или снимком, перекрыт, обрезан предком или смешан режимом, который не мерится, — смотреть глазами');
    else { const w = fx.worst; L('OK', head, `везде не ниже нормы; худшее — ${w.p10}:1 (нужно ${w.need}:1): ${w.sig} «${w.text}» на ${w.y} px над ${w.section ? `секцией ${w.section}` : 'местом вне секций'} (фон под текстом ${w.tone})`); }
  }
}
if (grain && grain.error) L('WARN', 'зерно поверх текста: не измерено', grain.error);
else if (grain && grain.layers && grain.layers.length) {
  const G = C.grain; const hexs = (m) => '#' + m.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lay = `${grain.layers.map((l) => `${l.el}${l.blend && l.blend !== 'normal' ? ` ${l.blend}` : ''} α${l.opacity}`).join(', ')}: чёрный → ${hexs(grain.points.black)}, серый → ${hexs(grain.points.gray)}, белый → ${hexs(grain.points.white)}`;
  if (grain.identity || !G) L('OK', 'зерно поверх текста', `${lay} — цвета не меняет`);
  else {
    const gf = Object.entries(G.failures).sort((a, b) => b[1].count - a[1].count); const gn = Object.entries(G.near);
    L(gf.length ? 'FAIL' : 'OK', `контраст с учётом зерна: пересчитано ${G.checked} проходящих пар`, `${lay}${gf.length ? ` | ниже нормы из-за зерна: ${gf.slice(0, 5).map(([k, v]) => `${k} ${v.ratio}:1 → ${v.ratioGrain}:1 (нужно ${v.need}:1; с зерном ${v.withGrain}), ${v.count} эл.: ${v.examples.join(', ')}`).join(' | ')}` : ''}${gn.length ? ` | в пределах 10 % над нормой: ${gn.slice(0, 4).map(([k, v]) => `${k} ${v.ratio}→${v.ratioGrain}:1, ${v.count} эл.`).join('; ')}` : ''}`);
  }
}
{
  const g = Object.values(dom.smallText.groups).sort((a, b) => a.size - b.size);
  const st = g.some((x) => x.status === 'FAIL') ? 'FAIL' : g.length ? 'WARN' : 'OK';
  L(st, `мелкий текст: проверено ${dom.smallText.checked} элементов, мельче 12px — ${g.reduce((a, x) => a + x.count, 0)}`, g.length ? g.slice(0, 5).map((x) => `${x.size}px (${x.status === 'FAIL' ? 'меньше 10' : 'меньше 12'}) ×${x.count}: ${x.examples.join(', ')}`).join(' | ') : 'везде от 12px');
}
L(dom.imgsNoAltCount ? 'FAIL' : 'OK', `картинки без alt: ${dom.imgsNoAltCount}`, dom.imgsNoAlt.join(', ') || `у декоративных alt="" — ${dom.decorativeEmpty}`);
L(dom.unlabeled.length ? 'FAIL' : 'OK', `поля без подписи: ${dom.unlabeled.length}`, dom.unlabeled.join(', '));
L(dom.nameless.length ? 'FAIL' : 'OK', `кнопки и ссылки без имени: ${dom.nameless.length}`, dom.nameless.join(', '));
L(dom.headings.h1 === 1 && !dom.headings.skips.length ? 'OK' : 'WARN', `заголовки: ${dom.headings.count}, h1 — ${dom.headings.h1}`, dom.headings.skips.length ? `пропуски уровней: ${dom.headings.skips.join(', ')}` : dom.headings.h1 !== 1 ? 'h1 должен быть один' : 'порядок соблюдён');
L(dom.lang ? 'OK' : 'FAIL', `lang документа: ${dom.lang || 'нет'}`, dom.lang ? '' : 'читалка не поймёт язык, переносы и произношение будут чужими');
L(dom.zoomBlocked ? 'FAIL' : 'OK', 'масштабирование', dom.zoomBlocked ? 'запрещено в meta viewport — слабовидящие не смогут увеличить' : 'разрешено');
L(dom.positiveTabindex ? 'WARN' : 'OK', `положительный tabindex: ${dom.positiveTabindex}`, dom.positiveTabindex ? 'ломает естественный порядок обхода' : '');
{
  const f = focus; const short = f.visited < f.expected;
  const st = f.invisible.length ? 'FAIL' : f.trapped || f.iframeStuck ? 'WARN' : short ? 'WARN' : f.focusables ? 'OK' : 'OK';
  const inFrames = f.iframes.length ? `; внутри iframe (${f.iframes.slice(0, 3).join(', ')}) фокус не проверялся — чужой документ` : '';
  const det = (f.invisible.length ? `не видно фокуса на: ${f.invisible.slice(0, 8).join(', ')}${short ? `; к тому же обход не состоялся (${f.visited} из ${f.focusables})` : ''}`
    : f.iframeStuck ? `из iframe ${f.iframeStuck} за 40 нажатий Tab фокус не вернулся в страницу — проверить руками`
      : f.trapped ? `ловушка фокуса или перехват Tab на ${f.stuckAt} — проверить руками`
        : short ? `обход не состоялся: Tab прошёл ${f.visited} из ожидаемых ${f.expected} (фокусируемых на странице ${f.focusables}) — Tab перехвачен, фокус уходит из страницы или стартует не сначала`
          : f.focusables ? `фокус виден везде (первым — ${f.first})` : 'фокусируемых элементов нет') + inFrames;
  L(st, `фокус: обошли ${f.visited} элементов на свежей странице`, det);
}
if (vp.isMobile) { L(dom.targets.length ? 'WARN' : 'OK', `цели нажатия мельче 24px: ${dom.targets.length}`, dom.targets.join(', ')); L(dom.smallInputs.length ? 'WARN' : 'OK', `поля мельче 16px: ${dom.smallInputs.length}`, dom.smallInputs.length ? 'iOS увеличит страницу при фокусе: ' + dom.smallInputs.join(', ') : ''); }
L(dom.reducedMotionRule ? 'OK' : 'WARN', 'prefers-reduced-motion', dom.reducedMotionRule ? 'правило есть' : 'правила нет — анимации не отключаются для тех, кому от них плохо');
L(dom.autoplayVideo ? 'FAIL' : 'OK', `видео с автоплеем и звуком: ${dom.autoplayVideo}`);
L(dom.landmarks.main ? 'OK' : 'WARN', `ориентиры: main ${dom.landmarks.main}, nav ${dom.landmarks.nav}, header ${dom.landmarks.header}, footer ${dom.landmarks.footer}`, dom.landmarks.main ? '' : 'нет <main> — читалка не найдёт начало содержимого');
if (dom.iframesNoTitle) L('WARN', `iframe без title: ${dom.iframesNoTitle}`);
const verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
console.log(`\n${verdict}: ${fails} провалов, ${warns} предупреждений`);
const file = path.join(outDir, `${tag}.json`);
writeJson(file, { url, viewport: vpName, takenAt: new Date().toISOString(), scroll: { pageHeight: sc.pageHeight, screens: sc.screens, maxScrollY: sc.maxScrollY, reachedBottom: sc.reachedBottom, stuck: sc.stuck }, reveal, grain, dom: { ...dom, contrast: { ...dom.contrast, imgList: dom.contrast.imgList.map(({ fgRgb, fgGrain, ...rest }) => rest) } }, imgContrast, fixedScroll: fx, focus, lines, verdict });
console.log(`Сохранено: ${file}`);
if (opt.strict && verdict === 'FAIL') { console.log('Код выхода 1: вердикт FAIL (--strict)'); process.exitCode = 1; }
