#!/usr/bin/env node
/**
 * Разведка сайта: снимки на нескольких экранах, техника, содержимое, визуал,
 * фактура, медиа-слоты, паспорт донора «есть / нет», ошибки в консоли и сети.
 * Всё снимается с живой страницы в браузере, не из HTML.
 *
 *   node discover.mjs <url> [--out <папка прогона>] [--viewports desktop,tablet,mobile]
 *                     [--no-design] [--light] [--scheme dark] [--tag discover]
 *                     [--no-320] [--no-hover] [--no-texture] [--keep-consent] [--no-clicks]
 *                     [--no-pages] [--pages-shots N] [--strict] [--help | -h]
 *
 * Флаги:
 *   --out <папка>      папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>)
 *   --viewports <list> экраны через запятую: desktop, laptop, tablet, mobile, mobile-s (320),
 *                      android (360), запись ШxВ@плотность («360x800@3») или одна ширина («320»).
 *                      По умолчанию desktop,tablet,mobile. --viewport — то же самое, тоже списком;
 *                      оба сразу с разными значениями — ошибка
 *   --no-320           без дополнительного прохода на 320 px (он только ищет переполнение,
 *                      без снимков; делается, если 320 нет в --viewports)
 *   --no-design        без дизайн-системы (скилл design-reference)
 *   --light            без серии снимков по прокрутке (быстрее); палитра сверяется по first/full
 *   --scheme <тема>    light | dark — prefers-color-scheme (по умолчанию light)
 *   --tag <имя>        подпапка снимков, по умолчанию discover
 *   --no-hover         не наводить мышь на карточки, разбирая блоки, невидимые после прокрутки
 *   --no-texture       не снимать фактуру по пикселям (слои всё равно перечисляются)
 *   --no-texture-module  не подключать texture.mjs, даже если он рядом: запасной путь discover
 *                      (для проверки и на случай, если texture.mjs сломан)
 *   --keep-consent     не закрывать окно согласия cookie. По умолчанию оно закрывается до первого
 *                      снимка, как заставка: кнопкой «Accept all» / «Accept» / «Принять» / «Согласен» /
 *                      «OK», если её нет — «Reject» / «Отклонить», затем крестиком. Окно — закреплённый
 *                      блок или диалог с текстом про cookie / consent / куки. Что закрыто — в
 *                      discovery.md («Техника»); кнопки окна не считаются кнопками сайта. Согласие
 *                      остаётся в браузере: на следующих экранах окно обычно уже не появляется
 *   --no-clicks        не нажимать на найденные аккордеоны и переключатели меню. По умолчанию в конце
 *                      прохода каждого экрана discover наводит мышь на вопрос (показался ответ — это
 *                      наведение, не аккордеон), нажимает на него (раскрылся ли ответ, закрывается ли
 *                      повторным кликом) и нажимает на переключатель меню (открылись ли ссылки) —
 *                      до 4 групп (свои, потом details), до 2 пунктов на группу и до 2 переключателей;
 *                      ссылки на другие адреса и точки за краем экрана не нажимаются
 *   --no-pages         без раздела «Страницы сайта по типам». По умолчанию он строится без захода на
 *                      страницы: ссылки этой страницы (все экраны) и /sitemap.xml (один запрос; у
 *                      индекса — до 3 вложенных карт), по шаблону адреса: первый сегмент пути и «*»
 *                      на месте остальных (/expansions/*); языковой префикс (/en/) — со вторым сегментом
 *   --pages-shots <N>  снять по одной странице каждого из N типов: сначала те, на которые ссылается
 *                      страница (шаблоны с большим числом адресов, потом отдельные страницы по числу
 *                      ссылок), затем найденные только в sitemap.xml. Снимок всей страницы после
 *                      прокрутки и видимые заголовки h1–h3 — на первом экране из --viewports, в
 *                      <папка>/pages/<тип>.png. По умолчанию 0: чужие страницы не открываются
 *   --strict           код выхода 1, если в итоговых вердиктах есть FAIL (переполнение по ширине,
 *                      экран или проход 320 px не снялся); без него FAIL только печатается, код 0
 *   --help, -h         эта справка (ничего не создаёт и не запускает браузер)
 *
 * Коды выхода: 0 — готово (без --strict — даже если в выводе есть FAIL); 1 — нет адреса или
 * он не http(s):// и не file://, неизвестные экраны, флаг без значения, неверная --scheme,
 * --pages-shots не целое от 0 до 50 или вместе с --no-pages, не снялся ни один экран, а с
 * --strict — ещё и любой FAIL в итоге. Аргументы проверяются до того, как создаётся папка
 * прогона: с ошибкой в них на диске ничего не появляется.
 *
 * В папке прогона появляются:
 *   discovery.json   сырые данные по каждому экрану
 *   discovery.md     сводка для чтения: что найдено и какие снимки открыть глазами
 *   discover/        снимки разведки: первый экран, серия по прокрутке (равномерно по всей
 *                    высоте) и её лист миниатюр, вся страница, фактура «со слоем / без»
 *   design/          дизайн-система через скилл design-reference (если он рядом):
 *                    site.json и site.tokens.css. В site.tokens.css discover дописывает блок
 *                    переменных --grain-* между маркерами-комментариями texture:start и texture:end
 *                    (рецепт texture.mjs: recipeFrom + tokensBlock; блок заменяется, если он есть) —
 *                    когда фактура снята texture.mjs и хотя бы на одном экране зерно «есть» или
 *                    «нет». Если зерно не измерено ни на одном экране, фактура снята запасным
 *                    путём или не снималась (--no-texture), блока нет, причина — в discovery.md
 *                    (раздел «Дизайн-система») и в discovery.json (textureTokens)
 *   pages/           с --pages-shots: по снимку на тип страницы (<тип>.png, например expansions.png)
 *
 * Кнопки и карточки-ссылки. Кнопка — компактный элемент действия с заливкой, контуром или
 * градиентом у самого элемента или у вложенного блока на всю его площадь (Framer: у <a> фона
 * нет, он у div внутри); стиль текста — от видимого текста внутри. Ссылка с картинкой (от 20%
 * площади) или коробка от 120 px в высоту — карточка-ссылка: отдельный список «Карточки-ссылки»
 * и своя роль в паспорте, не кнопка.
 *
 * Цвета. Доля пикселей на снимках — у каждого пикселя один, ближайший цвет палитры (±20 на канал):
 * почти белый фон больше не засчитывается светло-серой кнопке. Оттенки ближе ΔE 3 — одной строкой.
 * Доля заливки кнопок — в коробках самих кнопок (снимок коробки, до 3 кнопок на цвет). Акцент —
 * цвет действий: цветная заливка кнопок (в том числе у вложенного блока), сначала на первом
 * экране; нет таких — цвет ссылок при наведении; фоны секций, шапки и подвала — не акцент.
 *
 * Аккордеоны, FAQ и переключатель меню — общее правило scripts/clicks.mjs (то же у motion.mjs и extract
 * скилла design-reference). Аккордеон — details (группой по родителю), [aria-expanded] и «свои» пункты
 * (Framer, Tilda): видимый вопрос, значок (шеврон «›», «+», svg до 44 px, имя Icon/Chevron/Arrow) и
 * спрятанный внутри ответ от 30 знаков (обрезан overflow, прозрачен, нулевой высоты, display:none);
 * бегущая строка и карусель по кругу (бесконечная анимация) — не аккордеон; подтверждается кликом
 * (см. --no-clicks). FAQ — по заголовку «FAQ / Frequently asked questions / Вопросы / Частые
 * вопросы / Вопросы и ответы» или по группе пунктов, которые кончаются «?».
 *
 * Переключатель меню — [aria-expanded], имя burger / hamburger / menu-toggle, а без них небольшой
 * нажимаемый элемент в шапке с 2–4 полосками (в том числе ::before/::after), svg с именем menu или
 * знаком ☰ / «Меню» (до 6 штук). В discovery.md — селектор для runtime.mjs --click и итог клика.
 *
 * Картинки донора: хостинг (домены) и найденные ссылки на лицензию и условия (license, terms,
 * лицензия, условия, оферта, соглашение) — с напоминанием, что материалы донора без законного
 * получения не берутся.
 *
 * Снимки разведки — для взгляда. Набор «до» для сравнения с «после» снимает только
 * `shots.mjs --tag before`: у него свои имена, и diff.mjs складывает пары по именам.
 * Поэтому discover пишет в discover/, а не в before/ (раньше писал в before/;
 * `--tag before` вернёт прежнее поведение).
 *
 * discovery.json и discovery.md пишутся ДО шага дизайн-системы и дописываются после:
 * если design-reference упадёт, разведка уже на диске.
 *
 * В конце печатаются строки «FAIL|WARN <что>» и строка «Итог: FAIL N · WARN M» (или «Итог: OK»).
 * FAIL — переполнение по ширине и экран (или проход 320 px), который не снялся. Среди WARN —
 * окно cookie, которое не закрылось, заливка кнопок, которой не видно в их коробках (меньше 20%),
 * и страница типа, которая не снялась (--pages-shots).
 *
 * Фактура (зерно, вуали) — через scripts/texture.mjs, если он рядом; без него —
 * запасной путь внутри этого файла (поиск слоёв и замер «со слоем / без»).
 *
 * Разведка — это состояние ANALYZED. Она ничего не подтверждает про то, как
 * работают анимации, 3D и клики: для этого runtime.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  launch, openPage, scrollThrough, fullPageShot, pickViewports, parseArgs, runDir, writeJson, summarizeRequests, ensureDir, kb, sleep,
  forceInstantScroll, findOverflow, canvasList, evaluateWith, screenSegment, scrollToY, freezeMotion, loadSharp, findModuleRoot,
  waitForOverlay, withDeadline, SIG_FN, HEX_FN, EFFECTIVE_OPACITY_FN, FULLPAGE_NOTE, closeConsent, consentNote,
  EFFECTIVE_ZOOM_FN, CLIP_SHARE_FN, IS_TILDA_SERVICE_FN, TILDA_PH, tildaInfo, collectWarnings, takeWarnings, trackModule,
} from './lib.mjs';
import { findClickTargets, probeAccordions, probeToggles, accordionItems, accordionOk, accordionNote as accGroupNote, SCREEN_POINT_FN } from './clicks.mjs';
import { tildaSnapshot, tildaSummary, pageTypes as tildaPageTypes } from './tilda.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
/* Видимый текст внутри элемента: потомок с самым длинным собственным текстом (у <a> Framer
   вычисленный стиль — браузерный, #0000EE 12px, а текст набран в p внутри). Нужен eff. */
const TEXT_EL_FN = `(el) => {
  if (!el || el.tagName === 'INPUT') return el;
  const own = (e) => { let t = ''; for (const n of e.childNodes) if (n.nodeType === 3) t += ' ' + n.textContent; return t.replace(/\\s+/g, ' ').trim(); };
  let best = null, n = 0;
  const walk = (e, d) => { const t = own(e); if (t.length > n && eff(e) > 0.3 && parseFloat(getComputedStyle(e).fontSize) >= 6) { best = e; n = t.length; } if (d < 8) for (const k of e.children) walk(k, d + 1); };
  walk(el, 0); return best || el;
}`;
/* zoom — итоговый CSS zoom (Tilda Zero Block при upscale=window: кегль на экране = computed × zoom); clip — видимая
   доля после обрезки предками; svc — служебное Tilda; screenPt — точка окна раскладки → точка видимого окна (мышь) */
const DEPS = { sig: SIG_FN, hex: HEX_FN, eff: EFFECTIVE_OPACITY_FN, textEl: TEXT_EL_FN, zoom: EFFECTIVE_ZOOM_FN, clip: CLIP_SHARE_FN, svc: IS_TILDA_SERVICE_FN, screenPt: SCREEN_POINT_FN, ph: TILDA_PH };

/* =====================================================================
   Код, который выполняется внутри страницы (через evaluateWith: sig, hex, eff —
   зависимости из lib.mjs, других имён снаружи эти функции не видят)
   ===================================================================== */

/* До прокрутки: движение при загрузке и кандидаты на появление ниже первого экрана.
   Кандидаты запоминаются в window.__rwCands; во время прохода stepInPage отмечает,
   что с ними было, пока они в окне (D14: видимость фиксируется во время прохода). */
function earlyInPage() {
  const vh = innerHeight;
  const anims = document.getAnimations();
  const infinite = new Set();
  for (const a of anims) { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; if (t.iterations === Infinity && a.effect.target) infinite.add(a.effect.target); }
  const moving = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (infinite.has(e)) return true; return false; };
  const cands = []; let movingSkipped = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR)$/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 30) || r.top + scrollY < vh) continue;
    const s = getComputedStyle(el); if (s.display === 'none' || s.position === 'fixed') continue;
    const op = parseFloat(s.opacity); const tf = s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)';
    if (!(op < 0.95 || tf || s.visibility === 'hidden')) continue;
    if (moving(el)) { movingSkipped++; continue; }
    if (cands.length >= 2000) break;
    cands.push({ el, op, tf: tf ? s.transform : null, vis: s.visibility, seen: 0, maxEff: 0, changed: false, fromTf: tf ? s.transform : null });
  }
  window.__rwCands = cands;
  const kinds = anims.map((a) => { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; return { state: a.playState, infinite: t.iterations === Infinity, fill: t.fill }; });
  return {
    candidates: cands.length, movingSkipped,
    smoothScroll: getComputedStyle(document.documentElement).scrollBehavior === 'smooth' || getComputedStyle(document.body).scrollBehavior === 'smooth',
    motionAtLoad: { total: kinds.length, running: kinds.filter((k) => k.state === 'running').length, infinite: kinds.filter((k) => k.infinite).length, holding: kinds.filter((k) => k.state === 'finished' && /forwards|both/.test(k.fill)).length },
  };
}

/* На каждом шаге прокрутки: что из кандидатов в окне и видно ли его. */
function stepInPage() {
  const L = window.__rwCands || []; const vh = innerHeight;
  for (const c of L) {
    if (!c.el.isConnected) continue;
    const r = c.el.getBoundingClientRect(); if (!(r.width > 0 && r.bottom > 0 && r.top < vh)) continue;
    c.seen++; const e = eff(c.el); if (e > c.maxEff) c.maxEff = e;
    const s = getComputedStyle(c.el);
    if (parseFloat(s.opacity) - c.op > 0.3 || (c.tf && s.transform !== c.tf) || (c.vis === 'hidden' && s.visibility === 'visible')) c.changed = true;
  }
  return L.length;
}

/* После прохода: сколько блоков действительно появилось при прокрутке (MISSED:
   любой transform — не появление; бегущая строка — не в счёт). */
function revealInPage() {
  const L = window.__rwCands || [];
  const changed = L.filter((c) => c.changed);
  const outer = changed.filter((c) => !changed.some((p) => p !== c && p.el.contains(c.el)));
  const staticShift = L.filter((c) => !c.changed && c.tf && c.op >= 0.95);
  const neverSeen = L.filter((c) => !c.seen && c.op < 0.95);
  const tr = (tf) => { const m = /matrix\(([^)]+)\)/.exec(tf || ''); if (!m) return tf ? 'сдвиг 3D' : ''; const v = m[1].split(',').map(Number); const parts = []; if (Math.abs(v[4]) >= 1) parts.push(`X ${Math.round(v[4])}px`); if (Math.abs(v[5]) >= 1) parts.push(`Y ${Math.round(v[5])}px`); const sc = Math.hypot(v[0], v[1]); if (Math.abs(sc - 1) > 0.02) parts.push(`масштаб ${Math.round(sc * 100) / 100}`); const rot = Math.atan2(v[1], v[0]) * 180 / Math.PI; if (Math.abs(rot) > 0.5) parts.push(`поворот ${Math.round(rot)}°`); return parts.join(', '); };
  const how = {};
  for (const c of outer) { const k = `${c.op < 0.95 ? `из opacity ${Math.round(c.op * 100) / 100}` : 'без смены прозрачности'}${c.fromTf ? `, ${tr(c.fromTf)}` : ''}`; how[k] = (how[k] || 0) + 1; }
  return {
    candidates: L.length, changed: changed.length, revealed: outer.length,
    staticShift: staticShift.length, staticShiftSample: staticShift.slice(0, 4).map((c) => sig(c.el)),
    neverSeen: neverSeen.length,
    how: Object.entries(how).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ from: k, count: n })),
    sample: outer.slice(0, 5).map((c) => sig(c.el)),
  };
}

/* После прохода, наверху: что осталось невидимым ниже первого экрана — группами
   по подписи; до трёх образцов в группе помечаются data-rw-hid для проверки наведением. */
function hiddenInPage() {
  const vh = innerHeight; const g = {}; let n = 0;
  const cand = new Map((window.__rwCands || []).map((c) => [c.el, c]));
  const sigNoId = (el) => el.tagName.toLowerCase() + (el.classList && el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '');
  for (const el of document.body.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR)$/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 30) || r.top + scrollY < vh) continue;
    const s = getComputedStyle(el); if (s.display === 'none') continue;
    if (!(parseFloat(s.opacity) < 0.05 || s.visibility === 'hidden')) continue;
    if (el.parentElement && el.parentElement !== document.body && eff(el.parentElement) <= 0.05) continue; /* считаем самый внешний спрятанный */
    let fixed = false; for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') { fixed = true; break; }
    const key = sigNoId(el);
    const grp = g[key] || (g[key] = { sig: key, count: 0, text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), ids: [], tracked: 0, seenInView: 0, shownInView: 0, fixed: false });
    grp.count++; if (fixed) grp.fixed = true;
    const c = cand.get(el); if (c) { grp.tracked++; if (c.seen) grp.seenInView++; if (c.maxEff > 0.5) grp.shownInView++; }
    if (grp.ids.length < 3) { const id = 'h' + (n++); el.setAttribute('data-rw-hid', id); grp.ids.push(id); }
  }
  return Object.values(g).sort((a, b) => b.count - a.count);
}

/* Запасной поиск слоёв фактуры (если texture.mjs нет рядом). Критерии G1:
   имя файла (noise|grain|…), feTurbulence в data-URI или в <svg>, большой fixed/absolute
   элемент (или внутри fixed-предка) с pointer-events:none и итоговой opacity < .6
   или режимом наложения — в том числе img, svg, picture, canvas, video, псевдоэлементы.
   Слоям ставятся атрибуты data-rw-tex / data-rw-tex-before / data-rw-tex-after
   (как у texture.mjs mark:true), фон body/секции — data-rw-tex-bg. */
function textureFallbackInPage() {
  const vw = innerWidth, vh = innerHeight;
  const TEXRE = /noise|grain|grit|texture|dust|film|paper|scratch|шум|зерн/i;
  const dec = (u) => { try { return decodeURIComponent(u); } catch (e) { return u; } };
  const urlsOf = (bg) => [...String(bg || '').matchAll(/url\((?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^)]*))\)/g)].map((m) => m[1] || m[2] || m[3]).filter(Boolean);
  const short = (u) => (u.startsWith('data:') ? u.slice(0, 30) + '…(' + u.length + ' симв.)' : u.split('?')[0].split('/').pop().slice(0, 60));
  const turb = (text) => { const m = /<feTurbulence([^>]*)>/i.exec(text || ''); if (!m) return null; const a = (n) => { const x = new RegExp(n + "=['\"]([^'\"]*)['\"]", 'i').exec(m[1]); return x ? x[1] : null; }; return { baseFrequency: a('baseFrequency'), numOctaves: a('numOctaves'), type: a('type') }; };
  const layers = []; let k = 0;
  const els = [document.body, ...document.body.querySelectorAll('*')];
  for (const el of els) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR)$/.test(el.tagName)) continue;
    for (const pseudo of [null, '::before', '::after']) {
      const s = getComputedStyle(el, pseudo);
      if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
      if (s.display === 'none') continue;
      const tag = el.tagName.toLowerCase();
      const media = !pseudo && /^(img|picture|svg|canvas|video)$/.test(tag);
      const urls = urlsOf(s.backgroundImage);
      if (!pseudo && tag === 'img') urls.push(el.currentSrc || el.src || '');
      const svgT = !pseudo && tag === 'svg' ? turb(el.outerHTML.slice(0, 4000)) : null;
      if (!urls.length && !media) continue;
      const er = el.getBoundingClientRect();
      let r = er;
      if (pseudo) { const w = parseFloat(s.width), h = parseFloat(s.height); r = s.position === 'fixed' ? { x: parseFloat(s.left) || 0, y: parseFloat(s.top) || 0, width: w || vw, height: h || vh } : { x: er.x, y: er.y, width: w || er.width, height: h || er.height }; }
      if (!(r.width > 0 && r.height > 0)) continue;
      let fixedBy = null; const blendChain = []; const animChain = [];
      for (let p = el; p && p.nodeType === 1; p = p.parentElement) { const ps = getComputedStyle(p); if (!fixedBy && ps.position === 'fixed') fixedBy = sig(p); if (p !== el && ps.mixBlendMode !== 'normal') blendChain.push(sig(p) + ':' + ps.mixBlendMode); if (p !== el && ps.animationName !== 'none') animChain.push(sig(p) + ': ' + ps.animationName + ' ' + ps.animationDuration); }
      const own = parseFloat(s.opacity); const e = pseudo ? eff(el) * own : eff(el);
      if (e <= 0.001) continue;
      const big = r.width >= vw * 0.6 && r.height >= vh * 0.4;
      const svgNoise = urls.map((u) => (u.startsWith('data:') ? turb(dec(u)) : null)).find(Boolean) || svgT;
      const named = urls.some((u) => !u.startsWith('data:') && TEXRE.test(u)) || !!svgNoise;
      const tiled = /repeat/.test(s.backgroundRepeat) && !/no-repeat/.test(s.backgroundRepeat) && !/cover|contain/.test(s.backgroundSize) && urls.length > 0;
      const coversBlock = pseudo && s.position === 'absolute';
      const overlay = s.pointerEvents === 'none' && (s.position === 'fixed' || s.position === 'absolute' || !!fixedBy);
      const blend = s.mixBlendMode !== 'normal' || blendChain.length > 0;
      const veil = big && overlay && (e < 0.6 || blend || !!svgNoise);
      if (!((named && (big || tiled || coversBlock)) || veil)) continue;
      const hasText = !pseudo && !media && (el.innerText || '').trim().length > 20;
      const bgHide = !pseudo && (el === document.body || el === document.documentElement || hasText);
      if (hasText && !named) continue;
      const attr = pseudo ? 'data-rw-tex-' + pseudo.slice(2) : bgHide ? 'data-rw-tex-bg' : 'data-rw-tex';
      el.setAttribute(attr, String(k));
      const reason = []; if (named && !svgNoise) reason.push('имя'); if (svgNoise) reason.push('feTurbulence'); if (veil) reason.push('вуаль'); if (tiled) reason.push('плитка'); if (blend) reason.push('режим наложения');
      const scope = (s.position === 'fixed' || fixedBy) && r.width >= vw * 0.95 && r.height >= vh * 0.95 ? 'весь экран' : coversBlock ? 'весь блок ' + sig(el) : `${Math.round(r.width)}×${Math.round(r.height)}`;
      layers.push({
        k: k++, el: sig(el), pseudo, tag, kind: tag === 'img' ? 'img' : media ? tag : 'background', reason, hide: bgHide ? 'background' : 'visibility', scope,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, coversViewport: r.width >= vw * 0.95 && r.height >= vh * 0.95,
        position: s.position, fixedBy, zIndex: s.zIndex, pointerEvents: s.pointerEvents, opacity: own, effectiveOpacity: Math.round(e * 1000) / 1000,
        mixBlendMode: s.mixBlendMode, blendChain, backgroundImage: s.backgroundImage.length > 240 ? s.backgroundImage.slice(0, 240) + '…' : s.backgroundImage,
        urls: urls.filter((u) => !u.startsWith('data:')), files: urls.map(short), backgroundSize: s.backgroundSize, backgroundRepeat: s.backgroundRepeat, backgroundColor: s.backgroundColor,
        imageRendering: s.imageRendering, svg: svgNoise, animation: s.animationName !== 'none' ? `${s.animationName} ${s.animationDuration} ${s.animationTimingFunction} ${s.animationIterationCount}` : null, animChain, filter: s.filter,
      });
    }
  }
  const svgNoise = [...document.querySelectorAll('feTurbulence')].map((f) => ({ baseFrequency: f.getAttribute('baseFrequency'), numOctaves: f.getAttribute('numOctaves'), type: f.getAttribute('type'), filterId: f.closest('filter') && f.closest('filter').id }));
  return { layers, svgNoise, vw, vh, dpr: devicePixelRatio, bodyBg: getComputedStyle(document.body).backgroundColor, scrollY };
}

/* Главный сбор — после прохода прокрутки и возврата наверх (D12): появления уже
   сработали, ленивое подгрузилось. Видимость — с итоговой прозрачностью (eff) и
   положением (D10): спрятанная за экраном ссылка-пропуск и прозрачные кнопки
   «по наведению» не попадают ни в кнопки, ни в палитру, ни в паспорт. */
function inPage(arg) {
  const vw = innerWidth, vh = innerHeight, sy = scrollY;
  /* номера слоёв-элементов, которые прячутся целиком (вуаль, зерно поверх страницы); метки у
     псевдоэлементов и у фона body/секции стоят на хозяине — его потомки не вуаль */
  const veilKeys = new Set(((arg && arg.veilKeys) || []).map(String));
  const csM = new Map(); const cs = (el, p) => { if (p) return getComputedStyle(el, p); let s = csM.get(el); if (!s) { s = getComputedStyle(el); csM.set(el, s); } return s; };
  const effM = new Map(); const E = (el) => { let v = effM.get(el); if (v === undefined) { v = eff(el); effM.set(el, v); } return v; };
  const rM = new Map(); const R = (el) => { let r = rM.get(el); if (!r) { r = el.getBoundingClientRect(); rM.set(el, r); } return r; };
  /* innerText, а не textContent: иначе в «текст» попадает содержимое <style> и <script>
     внутри блоков (Tilda кладёт стили прямо в разметку) */
  const txt = (el) => ((el && (typeof el.innerText === 'string' ? el.innerText : el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const ownText = (el) => { let t = ''; for (const n of el.childNodes) if (n.nodeType === 3) t += ' ' + n.textContent; return t.replace(/\s+/g, ' ').trim(); };
  const sigNoId = (el) => el.tagName.toLowerCase() + (el.classList && el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '');
  const fam1 = (f) => String(f || '').split(',')[0].replace(/["']/g, '').trim();
  const r2 = (v) => Math.round(v * 100) / 100;
  const px = (v) => Math.round(v);
  /* Tilda (arg.tilda — tildaInfo из Node): служебное конструктора (плашка Made on Tilda, t-mbfix, полоса T360) и
     обрезанное артбордом Zero Block (заглушка «Zero Block», элементы других брейкпоинтов за краем) — не язык донора:
     не видны ни секциям, ни палитре, ни типографике, ни кнопкам. Кегль — на экране: computed × zoom (Zero Block при
     upscale=window масштабируется CSS zoom, getComputedStyle его не учитывает) */
  const T = !!(arg && arg.tilda);
  const cutM = new Map();
  const tildaCut = (el) => { if (!T) return false; let v = cutM.get(el); if (v === undefined) { v = svc(el) ? 'service' : el.closest('.t396__artboard') && clip(el) < 0.05 ? 'clipped' : false; cutM.set(el, v); } return v; };
  const zM = new Map(); const Z = (el) => { let v = zM.get(el); if (v === undefined) { v = zoom(el) || 1; zM.set(el, v); } return v; };
  const fsz = (el, s) => (parseFloat((s || cs(el)).fontSize) || 0) * Z(el);
  const zpx = (el, v) => { const n = parseFloat(v); const z = Z(el); return z !== 1 && Number.isFinite(n) && /px$/.test(String(v)) ? `${Math.round(n * z * 100) / 100}px` : v; };
  const onScreen = (el, min = 0.05) => { const r = R(el); if (!(r.width > 0 && r.height > 0)) return false; if (r.bottom + sy <= 0 || r.right <= 0 || r.left >= vw) return false; return E(el) > min && !tildaCut(el); };
  const bump = (map, key, w = 1) => { if (key == null || key === '') return; map[key] = (map[key] || 0) + w; };
  const top = (map, n = 8) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, weight]) => ({ value, weight: Math.round(weight) }));
  /* цвета: оттенки ближе ΔE 3 (на глаз не различить: #F8F8FF и #F7F7FF) — одной строкой, вес
     суммируется у самого весомого, остальные — в alias */
  const lab = (h) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; const [cr, cg, cb] = [1, 3, 5].map((i) => f(parseInt(h.slice(i, i + 2), 16))); const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); const X = t((cr * 0.4124 + cg * 0.3576 + cb * 0.1805) / 0.95047), Y = t(cr * 0.2126 + cg * 0.7152 + cb * 0.0722), Z = t((cr * 0.0193 + cg * 0.1192 + cb * 0.9505) / 1.08883); return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const HEX6 = /^#[0-9A-F]{6}$/i;
  const topColors = (map, n = 8) => {
    const out = [];
    for (const [value, weight] of Object.entries(map).sort((a, b) => b[1] - a[1])) {
      const near = HEX6.test(value) && out.find((o) => HEX6.test(o.value) && dE(o.value, value) < 3);
      if (near) { near.weight += Math.round(weight); (near.alias = near.alias || []).push(value); } else out.push({ value, weight: Math.round(weight) });
    }
    return out.slice(0, n);
  };
  const alphaOf = (h) => (h && h.length === 9 ? parseInt(h.slice(7), 16) / 255 : 1);
  const base = (h) => (h ? h.slice(0, 7) : h);
  const clipW = (r) => Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  const has = (sel) => !!document.querySelector(sel);
  const g = window;
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR|WBR|HEAD|TITLE)$/;
  /* сбои новых разделов (аккордеоны, меню, ссылки) не роняют весь экран — идут в заметки */
  const inPageErrors = [];
  /* полноэкранная вуаль (зерно, затемнение): fixed/absolute ≥ 80% экрана с pointer-events:none
     или слой, помеченный поиском фактуры — это фактура, а не цвет палитры (C2) */
  const veilM = new Map();
  const isVeil = (el) => {
    if (veilM.has(el)) return veilM.get(el);
    const host = el.closest('[data-rw-tex]');
    let v = !!host && veilKeys.has(host.getAttribute('data-rw-tex'));
    if (!v) for (let e = el; e && e !== document.body && e.nodeType === 1; e = e.parentElement) {
      const s = cs(e);
      if ((s.position === 'fixed' || s.position === 'absolute') && s.pointerEvents === 'none') { const r = R(e); if (r.width >= vw * 0.8 && r.height >= vh * 0.8) { v = true; break; } }
      if (s.position === 'fixed') break;
    }
    veilM.set(el, v); return v;
  };
  const everything = [...document.body.querySelectorAll('*')].filter((el) => !SKIP.test(el.tagName));
  const all = everything.filter((el) => onScreen(el));

  /* --- техника --- */
  const frameworks = [];
  if (g.React || has('[data-reactroot]') || Object.keys(document.body).some((k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'))) frameworks.push('React');
  if (g.__NEXT_DATA__ || has('#__next')) frameworks.push('Next.js');
  if (g.__NUXT__ || has('#__nuxt')) frameworks.push('Nuxt');
  if (g.Vue || has('[data-v-app]') || [...document.querySelectorAll('body *')].slice(0, 400).some((e) => e.__vue__ || e.__vue_app__)) frameworks.push('Vue');
  if (has('[ng-version]')) frameworks.push('Angular');
  if (has('[class*="svelte-"]')) frameworks.push('Svelte');
  if (g.jQuery) frameworks.push('jQuery ' + ((g.jQuery.fn && g.jQuery.fn.jquery) || ''));
  if (g.Webflow || has('html[data-wf-page]')) frameworks.push('Webflow');
  if (has('.t-records, .t-body, [data-tilda-root]') || g.t_onReady) frameworks.push('Tilda');
  if (has('link[href*="wp-content"], script[src*="wp-content"], meta[name="generator"][content*="WordPress"]')) frameworks.push('WordPress');
  if (g.BX || has('script[src*="/bitrix/"]')) frameworks.push('Bitrix');
  if (g.wixBiSession || has('meta[name="generator"][content*="Wix"]')) frameworks.push('Wix');
  if (has('meta[name="generator"][content*="Astro"]')) frameworks.push('Astro');
  if (g.Alpine) frameworks.push('Alpine');
  if (g.htmx) frameworks.push('htmx');
  const generator = (document.querySelector('meta[name="generator"]') || {}).content || null;
  const libs = {};
  const probes = { gsap: 'gsap', ScrollTrigger: 'ScrollTrigger', Lenis: 'Lenis', Swiper: 'Swiper', AOS: 'AOS', anime: 'anime', THREE: 'THREE', PIXI: 'PIXI', BABYLON: 'BABYLON', barba: 'barba', LocomotiveScroll: 'LocomotiveScroll', Splitting: 'Splitting', lottie: 'lottie', Splide: 'Splide', Motion: 'Motion', rive: 'rive', ymaps: 'ymaps' };
  for (const [name, key] of Object.entries(probes)) { const v = g[key]; if (v) libs[name] = (v && (v.version || v.REVISION)) || true; }
  if (g.google && g.google.maps) libs.googleMaps = true;
  const scriptSrcs = [...document.scripts].map((s) => s.src).filter(Boolean);
  const scriptHints = [...new Set(scriptSrcs.filter((s) => /gsap|lenis|swiper|aos|anime|three|barba|locomotive|lottie|framer|motion|splide|scrollreveal|pixi|babylon|rive|spline|matter|p5/i.test(s)).map((s) => s.split('/').pop().split('?')[0]))];
  const thirdParty = [...new Set(scriptSrcs.map((s) => { try { return new URL(s).hostname; } catch (e) { return null; } }).filter((h) => h && h !== location.hostname))];
  const styles = { external: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href), inlineBlocks: document.querySelectorAll('style:not([data-rw])').length };
  const meta = {
    title: document.title, description: (document.querySelector('meta[name="description"]') || {}).content || null,
    viewport: (document.querySelector('meta[name="viewport"]') || {}).content || null, lang: document.documentElement.lang || null,
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null, ogImage: (document.querySelector('meta[property="og:image"]') || {}).content || null,
    favicon: has('link[rel*="icon"]'), h1Count: document.querySelectorAll('h1').length, robots: (document.querySelector('meta[name="robots"]') || {}).content || null,
  };
  const imgs = [...document.images];
  const ext = (u) => { const m = /\.(avif|webp|jpe?g|png|gif|svg)(\?|#|$)/i.exec(u || ''); return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : (/^data:image\/svg/.test(u || '') ? 'svg' : 'other'); };
  const formats = {}; imgs.forEach((i) => bump(formats, ext(i.currentSrc || i.src)));
  const bgUrlEls = everything.filter((e) => /url\(/.test(cs(e).backgroundImage) && onScreen(e) && !isVeil(e));
  const images = {
    count: imgs.length, lazy: imgs.filter((i) => i.loading === 'lazy').length, noAlt: imgs.filter((i) => !(i.alt || '').trim()).length,
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.src).length,
    oversized: imgs.filter((i) => { const r = R(i); return r.width > 0 && i.naturalWidth > r.width * devicePixelRatio * 2; }).map((i) => ({ src: (i.currentSrc || i.src).split('/').pop().slice(0, 60), natural: i.naturalWidth, shown: Math.round(R(i).width) })).slice(0, 8),
    formats, bgImages: bgUrlEls.length,
    /* Tilda грузит картинки не loading=lazy, а по data-original и фонами .t-bgimg; до прокрутки на месте — заглушки /-/resize/20x/ */
    ...(T ? { tildaLazy: { dataOriginal: document.querySelectorAll('[data-original]').length, bg: document.querySelectorAll('.t-bgimg').length, bgLoaded: document.querySelectorAll('.t-bgimg.loaded').length,
      placeholders: [...document.querySelectorAll('.t-bgimg, img, [data-original]')].filter((e) => ph.test(e.tagName === 'IMG' ? (e.currentSrc || e.src || '') : cs(e).backgroundImage || '')).length } } : {}),
  };
  const media = { video: document.querySelectorAll('video').length, autoplayVideo: document.querySelectorAll('video[autoplay]').length, iframes: [...document.querySelectorAll('iframe')].map((f) => (f.src || '').slice(0, 80)), svgInline: document.querySelectorAll('svg').length, lottie: document.querySelectorAll('lottie-player, dotlottie-player, [data-lottie], [data-animation-path]').length };
  const dom = { nodes: document.getElementsByTagName('*').length, pageHeight: document.documentElement.scrollHeight, screens: Math.round(document.documentElement.scrollHeight / vh * 10) / 10, horizontalOverflow: document.documentElement.scrollWidth > vw + 1, htmlBytes: document.documentElement.outerHTML.length };

  /* --- текст: основной кегль по весу собственного текста (D12), шрифты --- */
  const fam = {}, fg = {}, sizeW = {};
  for (const el of all) {
    const own = ownText(el); if (!own.length) continue;
    const s = cs(el); const o = E(el); const fs = fsz(el, s);
    if (fs < 6) continue; /* font-size:0 у обёрток Tilda */
    bump(fg, base(hex(s.color)), own.length * o * alphaOf(hex(s.color)));
    bump(fam, fam1(s.fontFamily), own.length);
    if (own.length >= 20) bump(sizeW, Math.round(fs * 100) / 100, own.length);
  }
  const bodySizes = Object.entries(sizeW).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => ({ size: v + 'px', chars: n }));
  const bodyPx = bodySizes.length ? parseFloat(bodySizes[0].size) : parseFloat(cs(document.body).fontSize) || 16;
  const fontOf = (el) => { const s = cs(el); return { family: fam1(s.fontFamily), size: zpx(el, s.fontSize), weight: s.fontWeight, lineHeight: zpx(el, s.lineHeight), transform: s.textTransform, letterSpacing: zpx(el, s.letterSpacing), style: s.fontStyle, text: txt(el).slice(0, 50) }; };
  const levels = {}; for (const lv of ['h1', 'h2', 'h3']) { const el = [...document.querySelectorAll(lv)].find((e) => onScreen(e)); if (el) levels[lv] = fontOf(el); }

  /* --- кнопки и призывы (D11): все, схлопнутые по стилю; образцы и иконки отдельно.
     Заливка, контур, градиент, радиус и тень — у самого элемента, у вложенного блока на 80%+
     его площади (Framer: у <a> фона нет, он у div внутри) или у ::before/::after на всю коробку.
     Стиль текста — от видимого текста внутри (textEl), а не от самого <a>. Ссылка с картинкой
     (от 20% площади) или коробка от 120 px в высоту — карточка-ссылка: не кнопка, свой список.
     Кнопки окна согласия cookie (data-rw-consent-box ставит closeConsent) — не кнопки сайта. --- */
  const radiusOf = (s, r) => { const v = s.borderTopLeftRadius; const n = parseFloat(v) || 0; const pill = /%/.test(v) ? n >= 50 : n >= Math.min(r.width, r.height) / 2 - 1; return { v, pill: n > 0 && pill }; };
  const inConsent = (el) => !!el.closest('[data-rw-consent-box]');
  const paintOf = (e, pe) => { const s = cs(e, pe); const bgc = hex(s.backgroundColor); const bw = parseFloat(s.borderTopWidth) || 0; const bst = s.borderTopStyle; return { s, bg: bgc && alphaOf(bgc) > 0.1 ? bgc : null, bc: bw > 0 && bst !== 'none' && bst !== 'hidden' ? hex(s.borderTopColor) : null, bw, grad: /gradient/.test(s.backgroundImage) }; };
  const painted = (p) => !!(p.bg || p.bc || p.grad);
  const surfaceOf = (el) => {
    const own = paintOf(el); if (painted(own)) return { el, ...own, nested: null };
    const area = R(el).width * R(el).height; let cur = el;
    for (let d = 0; d < 4 && area > 0; d++) {
      const cover = [...cur.children].filter((k) => { const kr = R(k); return kr.width * kr.height >= area * 0.8 && E(k) > 0.05; });
      if (!cover.length) break;
      for (const k of cover) { const p = paintOf(k); if (painted(p)) return { el: k, ...p, nested: sigNoId(k) }; }
      cur = cover[0];
    }
    for (const pe of ['::before', '::after']) {
      const ps = cs(el, pe); if (ps.content === 'none' || ps.content === 'normal' || !/absolute|fixed/.test(ps.position)) continue;
      if ((parseFloat(ps.width) || 0) * (parseFloat(ps.height) || 0) < area * 0.8) continue;
      const p = paintOf(el, pe); if (painted(p)) return { el, ...p, nested: pe, pseudo: pe };
    }
    return { el, ...own, nested: null };
  };
  /* площадь картинок внутри (img, video, canvas, iframe, svg от 48×48, фоновые картинки), в пределах коробки */
  const mediaIn = (el) => {
    const r = R(el); let a = 0;
    const cut = (m) => { const mr = R(m); if (mr.width < 48 || mr.height < 48 || E(m) <= 0.05) return 0; return Math.max(0, Math.min(mr.right, r.right) - Math.max(mr.left, r.left)) * Math.max(0, Math.min(mr.bottom, r.bottom) - Math.max(mr.top, r.top)); };
    for (const m of el.querySelectorAll('img,video,canvas,iframe,svg')) a += cut(m);
    for (const b of bgUrlEls) if (b !== el && el.contains(b)) a += cut(b);
    return Math.min(a, r.width * r.height);
  };
  const ctaEls = [];
  const ctaRaw = [...document.querySelectorAll('a,button,[role="button"],input[type="submit"],input[type="button"]')].filter((el) => onScreen(el)).map((el) => { try {
    const r = R(el); const sf = surfaceOf(el); const s = sf.s;
    const te = textEl(el); const ts = cs(te);
    const text = (txt(el) || el.value || '').slice(0, 50); const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 50);
    const fs = fsz(te, ts); const ls = ts.letterSpacing === 'normal' ? 0 : (parseFloat(ts.letterSpacing) || 0) * Z(te);
    const submit = (el.tagName === 'BUTTON' && el.type === 'submit' && !!el.form) || (el.tagName === 'INPUT' && el.type === 'submit');
    const rad = radiusOf(s, sf.pseudo ? r : R(sf.el));
    const area = r.width * r.height; const media = el.tagName === 'INPUT' ? 0 : mediaIn(el);
    return {
      el, sfEl: sf.pseudo ? el : sf.el, text: text || aria, ariaOnly: !text && !!aria, tag: el.tagName.toLowerCase(), href: el.getAttribute('href'),
      filled: !!sf.bg, bordered: !!sf.bc, gradient: sf.grad, bg: sf.bg, color: hex(ts.color), border: sf.bc ? `${Math.round(sf.bw * 10) / 10}px ${sf.bc}` : null, surface: sf.nested,
      radius: rad.v, pill: rad.pill, w: px(r.width), h: px(r.height), fs: Math.round(fs * 10) / 10, fw: ts.fontWeight, family: fam1(ts.fontFamily),
      upper: ts.textTransform === 'uppercase' || (!!text && text === text.toUpperCase() && /[A-ZА-ЯЁ]{2}/.test(text)), ls: fs ? r2(ls / fs) : 0,
      aboveFold: r.top < vh && r.bottom > 0, submit, inForm: !!el.closest('form'), shadow: s.boxShadow !== 'none',
      skip: /^#/.test(el.getAttribute('href') || '') && /^(к|перейти к|skip)\b.*(содерж|контент|main|каталог|основн)/i.test(text),
      media: area ? Math.round(media / area * 100) : 0, card: el.tagName !== 'INPUT' && (r.height >= 120 || (media > 0 && media >= area * 0.2)), consent: inConsent(el),
    };
  } catch (e) { if (inPageErrors.length < 3) inPageErrors.push(`кнопка ${sig(el)}: ${String(e.message || e).slice(0, 100)}`); return null; } }).filter(Boolean);
  /* <button> без заливки и контура — кнопка, если это не раскрывашка (aria-expanded: вопрос FAQ, меню) */
  const isCta = (c) => c.text && (c.filled || c.bordered || c.gradient || c.submit || (c.tag === 'button' && !c.el.hasAttribute('aria-expanded')));
  const consentCtas = ctaRaw.filter((c) => c.consent && isCta(c));
  const cardRaw = ctaRaw.filter((c) => !c.consent && c.card);
  const btnRaw = ctaRaw.filter((c) => !c.consent && !c.card && isCta(c));
  const icons = btnRaw.filter((c) => c.ariaOnly && c.w < 48 && c.h < 48);
  const buttons = btnRaw.filter((c) => !(c.ariaOnly && c.w < 48 && c.h < 48) && !c.skip);
  for (const c of buttons) { ctaEls.push(c.el); c.el.setAttribute('data-rw-cta', 'b'); }
  for (const c of cardRaw) c.el.setAttribute('data-rw-cta', 'c');
  const uniq = new Map();
  for (const c of buttons) { const k = [c.text, c.bg, c.radius, c.w, c.h].join('|'); const u = uniq.get(k); if (u) { u.count++; u.aboveFold = u.aboveFold || c.aboveFold; } else uniq.set(k, { ...c, el: undefined, sfEl: undefined, count: 1 }); }
  const ctas = [...uniq.values()].sort((a, b) => (b.submit - a.submit) || (b.aboveFold - a.aboveFold) || (b.filled - a.filled) || (b.count - a.count));
  const styleKey = (c) => [c.filled ? c.bg : c.gradient ? 'градиент' : '—', c.color, c.border || '—', c.radius, c.h, c.fs, c.fw, c.upper ? 'КАПС' : 'строчные', c.ls].join('|');
  const sg = new Map();
  for (const c of buttons) { const k = styleKey(c); const u = sg.get(k); if (u) { u.count++; if (u.examples.length < 3 && !u.examples.includes(c.text)) u.examples.push(c.text); } else sg.set(k, { bg: c.filled ? c.bg : null, gradient: c.gradient, color: c.color, border: c.border, radius: c.radius, pill: c.pill, h: c.h, fs: c.fs, fw: c.fw, family: c.family, upper: c.upper, ls: c.ls, shadow: c.shadow, surface: c.surface, count: 1, examples: [c.text], submit: c.submit }); }
  const buttonStyles = [...sg.values()].sort((a, b) => (b.submit - a.submit) || (b.count - a.count));
  /* карточки-ссылки: по виду коробки и подписи; размеры — разброс */
  const cardKey = (c) => [c.bg || (c.gradient ? 'градиент' : '—'), c.border || '—', c.radius, c.shadow ? 'тень' : '', c.color, c.fs, c.fw].join('|');
  const cgm = new Map();
  for (const c of cardRaw) {
    const k = cardKey(c); const u = cgm.get(k);
    if (u) { u.count++; u.wMin = Math.min(u.wMin, c.w); u.wMax = Math.max(u.wMax, c.w); u.hMin = Math.min(u.hMin, c.h); u.hMax = Math.max(u.hMax, c.h); u.aboveFold = u.aboveFold || c.aboveFold; u.mediaMax = Math.max(u.mediaMax, c.media); if (c.text && u.examples.length < 3 && !u.examples.includes(c.text)) u.examples.push(c.text); if (c.href && u.hrefs.length < 2 && !u.hrefs.includes(c.href)) u.hrefs.push(c.href); }
    else cgm.set(k, { bg: c.bg, gradient: c.gradient, border: c.border, radius: c.radius, shadow: c.shadow, surface: c.surface, color: c.color, fs: c.fs, fw: c.fw, family: c.family, upper: c.upper, count: 1, wMin: c.w, wMax: c.w, hMin: c.h, hMax: c.h, aboveFold: c.aboveFold, mediaMax: c.media, examples: c.text ? [c.text] : [], hrefs: c.href ? [c.href] : [] });
  }
  const cardLinks = { total: cardRaw.length, styles: [...cgm.values()].sort((a, b) => b.count - a.count).slice(0, 8) };
  /* коробки залитых кнопок — Node снимет каждую и посчитает долю заливки внутри (data-rw-btn) */
  const btnBoxes = [];
  for (const c of buttons) { if (!c.filled || !c.sfEl || btnBoxes.length >= 40) continue; c.sfEl.setAttribute('data-rw-btn', String(btnBoxes.length)); btnBoxes.push({ i: btnBoxes.length, bg: base(c.bg), aboveFold: c.aboveFold, w: c.w, h: c.h, text: c.text }); }
  /* акцент — цвет действий: цветная заливка кнопок (и у вложенного блока), сначала первый экран;
     нейтральные (серые, чёрные, белые) — отдельно; фоны секций, шапки и подвала сюда не входят */
  const hsl = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(...v), mn = Math.min(...v), l = (mx + mn) / 2, dd = mx - mn; return { s: dd === 0 ? 0 : dd / (1 - Math.abs(2 * l - 1)), l }; };
  const chromatic = (h) => { if (!/^#[0-9A-F]{6}/i.test(h || '')) return false; const q = hsl(h); return q.s >= 0.25 && q.l >= 0.12 && q.l <= 0.92; };
  const fillM = {};
  for (const c of buttons) {
    if (!c.filled) continue; const k = base(c.bg);
    const a = fillM[k] || (fillM[k] = { color: k, chromatic: chromatic(k), count: 0, firstScreen: 0, area: 0, nested: 0, examples: [] });
    a.count++; if (c.aboveFold) a.firstScreen++; a.area += c.w * c.h; if (c.surface) a.nested++; if (a.examples.length < 2 && !a.examples.includes(c.text)) a.examples.push(c.text);
  }
  const fills = Object.values(fillM).sort((a, b) => ((b.firstScreen > 0) - (a.firstScreen > 0)) || (b.area - a.area));
  const accentBtn = fills.find((a) => a.chromatic) || null;
  const accent = accentBtn ? { from: 'кнопки', ...accentBtn } : null;
  const neutralFills = fills.filter((a) => !a.chromatic).slice(0, 3);

  /* --- содержимое --- */
  const headings = [...document.querySelectorAll('h1,h2,h3')].filter((h) => onScreen(h) && !inConsent(h)).map((h) => ({ level: h.tagName.toLowerCase(), text: txt(h).slice(0, 120), aboveFold: R(h).top < vh && R(h).bottom > 0 })).slice(0, 60);
  const nav = [...document.querySelectorAll('nav a, header a')].filter((a) => onScreen(a)).map((a) => ({ text: txt(a).slice(0, 40), href: a.getAttribute('href') })).filter((a) => a.text).slice(0, 30);
  const forms = [...document.querySelectorAll('form')].map((f) => ({
    action: f.getAttribute('action'), method: f.method, visible: onScreen(f),
    fields: [...f.querySelectorAll('input,select,textarea')].filter((i) => i.type !== 'hidden').map((i) => ({ type: i.type || i.tagName.toLowerCase(), name: i.name, placeholder: i.placeholder, required: i.required, labelled: !!((i.labels && i.labels.length) || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby')) })),
    submit: txt(f.querySelector('button[type="submit"],input[type="submit"],button:not([type])')).slice(0, 40),
    consent: !!f.querySelector('input[type="checkbox"]'),
  }));
  const bodyText = txt(document.body);
  const words = bodyText.split(' ').filter(Boolean).length;
  /* контакты (D18): сначала ссылки tel: и mailto:, потом российский номер в тексте с границами цифр;
     числа после ИНН, ОГРН, КПП, БИК, р/с — не телефоны */
  const telLinks = [...new Set([...document.querySelectorAll('a[href^="tel:"]')].map((a) => { let h = a.getAttribute('href').slice(4); try { h = decodeURIComponent(h); } catch (e) { /* как есть */ } return h.replace(/[^\d+]/g, ''); }).filter((x) => x.replace(/\D/g, '').length >= 10))];
  const mailLinks = [...new Set([...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href').slice(7).split('?')[0]).filter(Boolean))];
  const PHONE = /(?<![\d+])(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g;
  const LEGAL = /(ИНН|ОГРНИП|ОГРН|КПП|БИК|ОКПО|ОКВЭД|р\/с|к\/с|сч[её]т|№)[\s:.№]*$/i;
  const phonesText = [];
  for (const m of bodyText.matchAll(PHONE)) { if (LEGAL.test(bodyText.slice(Math.max(0, m.index - 16), m.index))) continue; const t = m[0].trim(); if (!phonesText.includes(t)) phonesText.push(t); }
  const phones = [...telLinks, ...phonesText.filter((p) => !telLinks.includes(p.replace(/[^\d+]/g, '')))].slice(0, 5);
  const emails = [...new Set([...mailLinks, ...(bodyText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [])])].slice(0, 5);
  const prices = [...new Set(bodyText.match(/(?:от\s)?\d[\d\s]{1,9}(?:₽|руб\.?|\$|€)/g) || [])].slice(0, 12);
  /* текстовые блоки (D13): блочный элемент без блочных детей с текстом, от 40 знаков — у Tilda
     текст лежит в div.tn-atom и .t-descr, а не в p */
  const BLOCK = /^(block|flex|grid|list-item|table-cell|flow-root|inline-block|inline-flex|inline-grid)$/;
  const textBlocks = all.filter((el) => {
    if ((el.textContent || '').length < 40) return false;
    const s = cs(el); if (!BLOCK.test(s.display) || /^(A|BUTTON|LABEL|SUMMARY|SELECT|OPTION|TEXTAREA|svg)$/i.test(el.tagName)) return false;
    if ([...el.children].some((k) => BLOCK.test(cs(k).display) && (k.textContent || '').trim().length > 20 && txt(k).length > 20)) return false;
    return txt(el).length >= 40;
  }).map((el) => ({ text: txt(el), top: Math.round(R(el).top + sy), fs: fsz(el) }));
  const paragraphs = textBlocks.map((b) => b.text);
  const voice = {
    firstScreen: textBlocks.filter((b) => b.top < vh).slice(0, 3).map((b) => b.text.slice(0, 220)),
    longest: [...textBlocks].sort((a, b) => b.text.length - a.text.length).slice(0, 3).map((b) => b.text.slice(0, 220)),
  };
  const social = [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /t\.me|vk\.com|instagram|wa\.me|whatsapp|youtube|max\.ru|dzen|ok\.ru/i.test(h)))].slice(0, 8);
  const heroText = (() => {
    const cands = all.filter((e) => R(e).top < vh && R(e).bottom > 0 && ownText(e).length > 3);
    cands.sort((a, b) => fsz(b) - fsz(a));
    return cands.slice(0, 3).map((e) => ({ el: sig(e), size: zpx(e, cs(e).fontSize), text: txt(e).slice(0, 120) }));
  })();

  /* --- палитра (C2): вес цвета = видимая площадь × итоговая прозрачность; вуали —
     в фактуру; цвет под непрозрачной картинкой-фоном не считается --- */
  const bg = {}, radius = {}, shadows = {}; let textShadows = 0, italic = 0, bordersN = 0;
  for (const el of all) {
    const s = cs(el), r = R(el); const o = E(el);
    const area = clipW(r) * r.height;
    const bgc = hex(s.backgroundColor);
    const covered = /url\(/.test(s.backgroundImage) && (/cover/.test(s.backgroundSize) || /^repeat$/.test(s.backgroundRepeat.trim()));
    const veil = isVeil(el);
    if (bgc && !covered && !veil) bump(bg, base(bgc), area * o * alphaOf(bgc));
    const bw = parseFloat(s.borderTopWidth) || 0; const border = bw > 0 && !!hex(s.borderTopColor);
    if (border) bordersN++;
    const boxed = (bgc && alphaOf(bgc) > 0.05) || border || /^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(el.tagName) || /url\(|gradient/.test(s.backgroundImage);
    if (boxed && !veil && s.borderTopLeftRadius !== '0px') bump(radius, s.borderTopLeftRadius);
    if (s.boxShadow !== 'none' && !veil) bump(shadows, s.boxShadow.slice(0, 80));
    if (s.textShadow !== 'none' && ownText(el)) textShadows++;
    if (s.fontStyle === 'italic' && ownText(el).length > 2) italic++;
  }
  const hEl = document.querySelector('h1,h2');
  const headingFont = hEl ? fam1(cs(hEl).fontFamily) : null;
  /* шрифт текста — тот, которым набрано больше всего знаков, а не значение на body (у конструкторов там дефолт) */
  const famTop = top(fam, 1)[0];
  const bodyFont = famTop ? famTop.value : fam1(cs(document.body).fontFamily);
  const h1 = document.querySelector('h1'); const h1s = h1 ? cs(h1) : null;

  /* --- секции: потоковые дети body; обёртки раскрываются; абсолютные слои — не секции --- */
  const skipTag = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|SVG|CANVAS|DIALOG|IFRAME)$/;
  const inflow = (el) => { const s = cs(el); return !skipTag.test(el.tagName) && s.position !== 'absolute' && s.position !== 'fixed' && s.display !== 'none' && R(el).height > 40; };
  const unwrap = (els, depth) => els.flatMap((el) => {
    if (!inflow(el)) return [];
    const kids = [...el.children].filter(inflow);
    const tall = kids.filter((k) => R(k).height > 150);
    const stacked = tall.every((k, i) => i === 0 || R(k).top >= R(tall[i - 1]).bottom - 10);
    const wrapper = el.tagName === 'MAIN' || (depth < 4 && tall.length >= 2 && stacked && !el.querySelector(':scope > h1, :scope > h2'));
    return wrapper && kids.length ? unwrap(kids, depth + 1) : [el];
  });
  const header = document.querySelector('header'), footer = document.querySelector('footer');
  const secEls = [...new Set([header, ...unwrap([...document.body.children], 0), footer].filter(Boolean))].filter((el) => cs(el).display !== 'none' && R(el).height > 40 && !(T && svc(el)));
  /* Tilda: код блока — первый класс вида t123 внутри rec (data-record-type 121 — это и T123, и T1003, и T851) */
  const tCode = (el) => { if (!T) return null; const rec = el.matches('.t-rec') ? el : el.querySelector(':scope > .t-rec') || el.closest('.t-rec'); if (!rec) return null; for (const e of [rec, ...rec.querySelectorAll('[class]')].slice(0, 60)) { const c = [...e.classList].find((x) => /^t\d{2,4}$/.test(x)); if (c) return c.toUpperCase(); } return null; };
  const bigBg = bgUrlEls.filter((e) => R(e).width * R(e).height >= 10000);
  const mediaEls = [...document.querySelectorAll('img,picture,video,canvas')].filter((e) => onScreen(e) && R(e).width >= 40 && R(e).height >= 40);
  const sections = secEls.map((el) => {
    const s = cs(el), r = R(el); const h = el.querySelector('h1,h2,h3');
    return { el: sig(el), top: Math.round(r.top + sy), height: Math.round(r.height), paddingTop: Math.round(parseFloat(s.paddingTop)), background: hex(s.backgroundColor), hasBgImage: /url\(/.test(s.backgroundImage), heading: h ? txt(h).slice(0, 50) : null, ...(T ? { tilda: tCode(el) } : {}), images: mediaEls.filter((m) => el.contains(m)).length + bigBg.filter((m) => el === m || el.contains(m)).length, ctas: ctaEls.filter((c) => el.contains(c)).length, textChars: txt(el).length, position: s.position };
  });

  /* --- шапка и закреплённые панели (D16, D23, G1) --- */
  const panelInfo = (el) => { const s = cs(el), r = R(el); return { el: sig(el), height: px(r.height), width: px(r.width), position: s.position, place: r.top + r.height / 2 < vh / 2 ? 'сверху' : 'снизу', top: px(r.top), bg: hex(s.backgroundColor), backdrop: s.backdropFilter && s.backdropFilter !== 'none' ? s.backdropFilter : null, radius: s.borderTopLeftRadius !== '0px' ? s.borderTopLeftRadius : null, shareOfScreen: Math.round(r.height / vh * 100), links: el.querySelectorAll('a,button').length, zIndex: s.zIndex }; };
  const fixedAll = all.filter((el) => { const p = cs(el).position; return (p === 'fixed' || p === 'sticky') && !(el.parentElement && ['fixed', 'sticky'].includes(cs(el.parentElement).position) && el.parentElement !== document.body); });
  const panels = fixedAll.filter((el) => !isVeil(el) && R(el).width >= vw * 0.3 && R(el).height >= 20 && R(el).height < vh * 0.6).map(panelInfo);
  const headerEl = header || document.querySelector('[role="banner"]') || document.querySelector('[class*="header"]');
  let headerInfo = null;
  if (headerEl && R(headerEl).height >= 10) headerInfo = { ...panelInfo(headerEl), found: 'header' };
  else {
    const p = fixedAll.filter((el) => !isVeil(el) && R(el).width >= vw * 0.4 && R(el).height >= 24 && R(el).height < vh * 0.5 && el.querySelectorAll('a,button').length >= 2).sort((a, b) => b.querySelectorAll('a,button').length - a.querySelectorAll('a,button').length)[0];
    if (p) headerInfo = { ...panelInfo(p), found: headerEl ? `панель (у ${sig(headerEl)} высота ${px(R(headerEl).height)}px)` : 'панель' };
  }
  const heroBgMedia = bigBg.some((e) => { const r = R(e); if (!(r.top < vh && r.bottom > 0)) return false; const h = Math.min(r.bottom, vh) - Math.max(r.top, 0); return clipW(r) * h > vw * vh * 0.25; });
  const firstScreen = { h1AboveFold: !!(h1 && R(h1).top < vh && R(h1).bottom > 0 && onScreen(h1)), ctasAboveFold: buttons.filter((c) => c.aboveFold).length, hasHeroMedia: mediaEls.some((e) => R(e).top < vh && R(e).bottom > 0 && R(e).height > vh * 0.25) || heroBgMedia, heroBgMedia, header: headerInfo, text: heroText };

  /* --- поверхность (D1, группы 2–6): псевдоэлементы, стекло, наложение, фильтры, маски,
     градиенты по площади, фоновые видео, обработка текста --- */
  const surface = { pseudo: [], backdrop: [], blend: [], filters: [], masks: [], gradients: [], videos: [], textFx: [] };
  const dedupe = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); const e = m.get(k); if (e) e.count++; else m.set(k, { ...x, count: 1 }); } return [...m.values()]; };
  for (const el of all) {
    const s = cs(el), r = R(el); const area = clipW(r) * r.height;
    if (isVeil(el) && !el.matches('[data-rw-tex-bg]')) continue;
    for (const pe of ['::before', '::after']) {
      const ps = cs(el, pe); if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
      if (el.matches(`[data-rw-tex-${pe.slice(2)}]`)) continue;
      const gk = (ps.backgroundImage.match(/(repeating-)?(linear|radial|conic)-gradient/g) || []);
      const bgc = hex(ps.backgroundColor);
      const hasBg = /url\(/.test(ps.backgroundImage) || gk.length || (bgc && alphaOf(bgc) > 0.02);
      if (!hasBg && ps.mixBlendMode === 'normal' && (!ps.backdropFilter || ps.backdropFilter === 'none')) continue;
      const covers = ps.position === 'fixed' ? 'весь экран' : ps.position === 'absolute' && (parseFloat(ps.width) >= r.width * 0.9 && parseFloat(ps.height) >= r.height * 0.9) ? 'весь блок' : `${Math.round(parseFloat(ps.width) || 0)}×${Math.round(parseFloat(ps.height) || 0)}`;
      if (covers !== 'весь экран' && covers !== 'весь блок' && (parseFloat(ps.width) || 0) * (parseFloat(ps.height) || 0) < 400) continue; /* мелкие значки и стрелки — не поверхность */
      surface.pseudo.push({ el: sigNoId(el) + pe, covers, bg: gk.length ? ps.backgroundImage.replace(/\s+/g, ' ').slice(0, 100) : /url\(/.test(ps.backgroundImage) ? 'картинка' : bgc, opacity: parseFloat(ps.opacity), blend: ps.mixBlendMode });
    }
    if (!(r.width > 0 && r.height > 0)) continue;
    if (s.backdropFilter && s.backdropFilter !== 'none') surface.backdrop.push({ el: sigNoId(el), filter: s.backdropFilter, bg: hex(s.backgroundColor), radius: s.borderTopLeftRadius, position: s.position, w: px(r.width), h: px(r.height) });
    if (s.mixBlendMode !== 'normal') surface.blend.push({ el: sigNoId(el), mode: s.mixBlendMode, text: ownText(el).slice(0, 30) });
    if (s.filter !== 'none') surface.filters.push({ el: sigNoId(el), filter: s.filter.slice(0, 80) });
    if ((s.maskImage && s.maskImage !== 'none') || (s.webkitMaskImage && s.webkitMaskImage !== 'none') || s.clipPath !== 'none') surface.masks.push({ el: sigNoId(el), mask: String(s.maskImage || s.webkitMaskImage || 'none').slice(0, 80), clip: s.clipPath.slice(0, 80) });
    const gk = s.backgroundImage.match(/(repeating-)?(linear|radial|conic)-gradient/g) || [];
    if (gk.length && area > 4000) surface.gradients.push({ el: sigNoId(el), kinds: gk.join('+'), area: Math.round(area), css: s.backgroundImage.replace(/\s+/g, ' ').slice(0, 140) });
    if (el.tagName === 'VIDEO') surface.videos.push({ el: sigNoId(el), autoplay: el.autoplay, muted: el.muted, loop: el.loop, controls: el.controls, w: px(r.width), h: px(r.height), fit: s.objectFit, background: el.autoplay && el.muted && !el.controls && r.width > vw * 0.5 });
    const own = ownText(el);
    if (own && ((s.textShadow !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(s.textShadow)) || parseFloat(s.webkitTextStrokeWidth) > 0 || s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text')) surface.textFx.push({ el: sigNoId(el), shadow: s.textShadow === 'none' ? null : s.textShadow.slice(0, 60), stroke: parseFloat(s.webkitTextStrokeWidth) > 0 ? `${s.webkitTextStrokeWidth} ${hex(s.webkitTextStrokeColor)}` : null, clip: s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text' ? 'text' : null, text: own.slice(0, 30) });
  }
  surface.pseudo = dedupe(surface.pseudo, (x) => x.el + x.bg + x.covers).slice(0, 10);
  surface.backdrop = dedupe(surface.backdrop, (x) => x.el + x.filter).slice(0, 8);
  surface.blend = dedupe(surface.blend, (x) => x.el + x.mode).slice(0, 8);
  surface.filters = dedupe(surface.filters, (x) => x.filter).slice(0, 8);
  surface.masks = dedupe(surface.masks, (x) => x.mask + x.clip).slice(0, 8);
  surface.gradients = dedupe(surface.gradients, (x) => x.css).sort((a, b) => b.area * b.count - a.area * a.count).slice(0, 8);
  surface.textFx = dedupe(surface.textFx, (x) => [x.shadow, x.stroke, x.clip].join('|')).slice(0, 6);

  /* --- подписные приёмы: числа из вычисленных стилей, чтобы переносить приём, а не «наклон вообще» --- */
  const infiniteT = new Set(document.getAnimations().filter((a) => a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity && a.effect.target).map((a) => a.effect.target));
  const movingEl = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (infiniteT.has(e)) return true; return false; };
  const decompose = (tf) => {
    const m = /matrix(3d)?\(([^)]+)\)/.exec(tf || ''); if (!m) return null;
    const v = m[2].split(',').map(Number); let a, b, c, d, is3d = false;
    if (m[1]) { [a, b, c, d] = [v[0], v[1], v[4], v[5]]; is3d = [v[2], v[6], v[8], v[9], v[3], v[7], v[11]].some((x) => Math.abs(x) > 1e-4); } else [a, b, c, d] = v;
    const rot = Math.atan2(b, a) * 180 / Math.PI; const su = Math.hypot(a, b), sv = Math.hypot(c, d);
    const between = su && sv ? Math.acos(Math.max(-1, Math.min(1, (a * c + b * d) / (su * sv)))) * 180 / Math.PI : 90;
    return { rotate: Math.round(rot * 10) / 10, skew: Math.round((90 - between) * 10) / 10, scale: Math.round(su * 100) / 100, is3d };
  };
  const techniques = { transforms: [], backdrop: surface.backdrop, bigText: [], clips: [], blendText: surface.blend.filter((b) => b.text), stroke: surface.textFx.filter((t) => t.stroke || t.clip) };
  for (const el of all) {
    const s = cs(el), r = R(el);
    /* Tilda: текст и фигуры Zero Block, видимые меньше чем наполовину (обрезаны артбордом), — не подписной приём */
    if (T && el.closest('.t396__artboard') && clip(el) < 0.5) continue;
    if (s.transform !== 'none' || (s.rotate && s.rotate !== 'none')) {
      const d = decompose(s.transform) || { rotate: 0, skew: 0, scale: 1, is3d: false };
      const extra = /(-?[\d.]+)deg/.exec(s.rotate || ''); if (extra && !/\b[xy]\b/.test(s.rotate)) d.rotate = Math.round((d.rotate + parseFloat(extra[1])) * 10) / 10;
      if ((Math.abs(d.rotate) > 3 && Math.abs(Math.abs(d.rotate) - 180) > 3) || Math.abs(d.skew) > 3 || d.is3d) {
        if (r.width * r.height >= 400 || ownText(el)) techniques.transforms.push({ el: sigNoId(el), rotate: d.rotate, skew: d.skew, scale: d.scale, is3d: d.is3d, w: px(r.width), h: px(r.height), moving: movingEl(el), firstScreen: r.top < vh && r.bottom > 0, text: txt(el).slice(0, 30) });
      }
    }
    const own = ownText(el); const fs0 = parseFloat(s.fontSize); const fs = fs0 * Z(el);
    if (own.length >= 2 && fs >= Math.max(48, bodyPx * 2.5)) {
      const range = document.createRange(); range.selectNodeContents(el); const tr = range.getBoundingClientRect();
      const lh = s.lineHeight === 'normal' ? 'normal' : r2(parseFloat(s.lineHeight) / fs0);
      techniques.bigText.push({ el: sigNoId(el), fs: Math.round(fs), ...(Z(el) !== 1 ? { zoom: Z(el), fsCss: fs0 } : {}), vw: r2(fs / vw * 100), lh, ls: s.letterSpacing === 'normal' ? 0 : r2(parseFloat(s.letterSpacing) / fs0), fw: s.fontWeight, upper: s.textTransform === 'uppercase' || (own === own.toUpperCase() && /[A-ZА-ЯЁ]{2}/.test(own)), family: fam1(s.fontFamily), text: txt(el).slice(0, 40), widthShare: Math.round(tr.width / vw * 100), bleeds: tr.right > vw + 1 || tr.left < -1, firstScreen: r.top < vh && r.bottom > 0 });
    }
    if (s.clipPath && s.clipPath !== 'none') {
      const cp = s.clipPath; let kind = cp.split('(')[0]; const angles = [];
      if (/^polygon/.test(cp)) {
        const pts = cp.replace(/^polygon\((?:[a-z]+,)?/, '').replace(/\)$/, '').split(',').map((p) => p.trim().split(/\s+/).map((t, i) => (/%$/.test(t) ? parseFloat(t) / 100 * (i ? r.height : r.width) : /px$/.test(t) ? parseFloat(t) : NaN)));
        for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; if ([x1, y1, x2, y2].some(isNaN)) continue; const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1); if (dx > 2 && dy > 2) angles.push(Math.round(Math.atan2(dy, dx) * 180 / Math.PI * 10) / 10); }
        kind = angles.length ? 'полигон с наклонным краем' : 'полигон (прямые края)';
      }
      techniques.clips.push({ el: sigNoId(el), kind, angles: [...new Set(angles)].slice(0, 4), css: cp.slice(0, 90), w: px(r.width), h: px(r.height) });
    }
  }
  techniques.transforms = dedupe(techniques.transforms, (x) => x.el + x.rotate + x.skew).slice(0, 8);
  techniques.bigText = dedupe(techniques.bigText, (x) => [x.fs, x.family, x.fw, x.upper].join('|')).sort((a, b) => b.fs - a.fs).slice(0, 6);
  techniques.clips = dedupe(techniques.clips, (x) => x.css).slice(0, 6);

  /* --- медиа-слоты (D17): роль, показанный размер, пропорции, вписывание, плёнки, фильтры --- */
  const RATIOS = [[21 / 9, '21:9'], [2, '2:1'], [16 / 9, '16:9'], [3 / 2, '3:2'], [4 / 3, '4:3'], [5 / 4, '5:4'], [1, '1:1'], [4 / 5, '4:5'], [3 / 4, '3:4'], [2 / 3, '2:3'], [9 / 16, '9:16']];
  const ratioOf = (w, h) => { if (!(w > 0 && h > 0)) return '—'; const v = w / h; const hit = RATIOS.find(([x]) => Math.abs(v / x - 1) < 0.04); return hit ? hit[1] : String(r2(v)); };
  const kindOf = (u, tag) => { if (tag === 'video' || tag === 'iframe') return 'видео'; if (tag === 'canvas') return 'холст'; const e = ext(u); return e === 'jpg' || e === 'webp' || e === 'avif' ? 'фото' : e === 'svg' ? 'графика svg' : e === 'png' ? 'png (фото или графика)' : e === 'gif' ? 'gif' : 'картинка'; };
  const filmOf = (s) => { if (/gradient/.test(s.backgroundImage)) return s.backgroundImage.replace(/\s+/g, ' ').slice(0, 90); const c = hex(s.backgroundColor); return c && c.length === 9 && alphaOf(c) > 0.03 ? c : null; };
  const filmsFor = (el) => {
    const out = []; const Rr = R(el); const areaR = Rr.width * Rr.height; if (!areaR) return out;
    const cover = (r) => { const ix = Math.max(0, Math.min(Rr.right, r.right) - Math.max(Rr.left, r.left)); const iy = Math.max(0, Math.min(Rr.bottom, r.bottom) - Math.max(Rr.top, r.top)); return ix * iy / areaR; };
    const s0 = cs(el); if (/url\(/.test(s0.backgroundImage) && /gradient/.test(s0.backgroundImage)) out.push('в том же фоне: ' + (s0.backgroundImage.match(/(linear|radial)-gradient\([^)]*\)[^,]*\)?/) || [''])[0].slice(0, 80));
    for (const host of [el, el.parentElement]) {
      if (!host) continue;
      for (const pe of ['::before', '::after']) { const ps = cs(host, pe); if (ps.content === 'none' || ps.content === 'normal' || !/absolute|fixed/.test(ps.position)) continue; const f = filmOf(ps); if (f) out.push(`${sigNoId(host)}${pe}: ${f}`); }
    }
    for (const p of [el, el.parentElement, el.parentElement && el.parentElement.parentElement]) {
      if (!p) continue;
      for (const k of p.children) {
        if (k === el || k.contains(el)) continue; const ks = cs(k); if (!/absolute|fixed/.test(ks.position)) continue;
        const f = filmOf(ks); if (!f) continue; if (cover(R(k)) >= 0.6) out.push(`${sigNoId(k)}: ${f}${parseFloat(ks.opacity) < 1 ? ` ×${ks.opacity}` : ''}`);
      }
    }
    return [...new Set(out)].slice(0, 3);
  };
  const filterChain = (el) => { const f = []; for (let e = el, i = 0; e && e.nodeType === 1 && i < 4; e = e.parentElement, i++) { const s = cs(e); if (s.filter !== 'none' && !/^opacity/.test(s.filter)) f.push(s.filter.slice(0, 50)); } return f.join(' / ') || null; };
  const rawSlots = [];
  const addSlot = (el, tag, src, fit, extra = {}) => {
    const r = R(el); const w = r.width, h = r.height; if (!(w > 0 && h > 0)) return;
    if (w * h < 12000 && w < vw * 0.25) return;
    rawSlots.push({ el, key: sigNoId(el), tag, src: String(src || '').startsWith('data:') ? 'data:…' : String(src || '').split('?')[0].split('/').pop().slice(0, 60), kind: kindOf(src, tag), w: px(w), h: px(h), ratio: ratioOf(w, h), fit, docTop: Math.round(r.top + sy), area: clipW(r) * h, films: filmsFor(el), filter: filterChain(el), blend: cs(el).mixBlendMode !== 'normal' ? cs(el).mixBlendMode : null, ...extra });
  };
  for (const im of imgs) { if (!onScreen(im)) continue; addSlot(im, 'img', im.currentSrc || im.src, `${cs(im).objectFit}${cs(im).objectPosition !== '50% 50%' ? ' ' + cs(im).objectPosition : ''}`, { natural: im.naturalWidth ? `${im.naturalWidth}×${im.naturalHeight}` : 'не загружена' }); }
  for (const el of bgUrlEls) { const s = cs(el); const u = (/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/.exec(s.backgroundImage) || []); const src = u[1] || u[2] || u[3] || ''; if (/^data:image\/svg/.test(src) && R(el).width * R(el).height < 40000) continue; addSlot(el, 'фон', src, `${s.backgroundSize}${s.backgroundRepeat !== 'repeat' ? ', ' + s.backgroundRepeat : ''}${s.backgroundAttachment === 'fixed' ? ', attachment fixed' : ''}`); }
  for (const v of document.querySelectorAll('video')) { if (!onScreen(v)) continue; addSlot(v, 'video', v.currentSrc || v.src || (v.querySelector('source') || {}).src, cs(v).objectFit, { video: `${v.autoplay ? 'автоплей' : 'по клику'}${v.muted ? ', без звука' : ''}${v.loop ? ', по кругу' : ''}${v.controls ? ', с кнопками' : ''}${v.poster ? ', постер' : ''}` }); }
  for (const c of document.querySelectorAll('canvas')) { if (!onScreen(c)) continue; addSlot(c, 'canvas', '', '—'); }
  for (const f of document.querySelectorAll('iframe')) { if (!onScreen(f) || !/youtube|vimeo|rutube|vk\.com\/video|vkvideo|kinescope/i.test(f.src || '')) continue; addSlot(f, 'iframe', f.src, '—'); }
  const grp = new Map();
  for (const s of rawSlots) { const k = [s.key, s.tag, s.ratio, s.fit, s.films.join('|')].join('#'); const e = grp.get(k); if (e) { e.count++; e.areaSum += s.area; if (s.docTop < vh) e.firstScreen = true; } else grp.set(k, { ...s, el: undefined, count: 1, areaSum: s.area, firstScreen: s.docTop < vh && s.area >= vw * vh * 0.25 }); }
  const slots = [...grp.values()].map((s) => ({ ...s, role: s.firstScreen && s.area >= vw * vh * 0.25 ? 'первый экран' : s.count >= 3 ? 'карточки' : s.w >= vw * 0.9 ? 'фон секции / во всю ширину' : 'вставка' })).sort((a, b) => b.areaSum - a.areaSum).slice(0, 14);
  const docArea = vw * Math.max(document.documentElement.scrollHeight, vh);
  const photoLike = rawSlots.filter((s) => s.kind === 'фото' || s.kind === 'видео' || /png/.test(s.kind));
  const firstArea = (list) => list.reduce((a, s) => { const r = R(s.el); const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)); return a + clipW(r) * h; }, 0);
  const mediaShare = { photoPage: r2(photoLike.reduce((a, s) => a + s.area, 0) / docArea * 100), photoFirstScreen: r2(firstArea(photoLike) / (vw * vh) * 100), slots: rawSlots.length, byKind: rawSlots.reduce((m, s) => { m[s.kind] = (m[s.kind] || 0) + 1; return m; }, {}) };

  /* аккордеоны, FAQ и переключатели меню — не здесь: общее правило scripts/clicks.mjs (findClickTargets
     в Node сразу после inPage, как у motion и extract): details группой по родителю, бегущая строка —
     не аккордеон, селектор меню для runtime --click; поля content.accordions, content.faq,
     interactive.toggles и components['аккордеон'] заполняет inspect() */

  /* --- ссылки (для «Страниц сайта по типам») и картинки донора: хостинг, лицензия и условия --- */
  const linkMap = new Map(); let rights = { hosts: [], legal: [], copyright: null };
  try {
    const linkCtx = (a) => (a.closest('header, [role="banner"]') ? 'шапка' : a.closest('footer, [role="contentinfo"]') ? 'подвал' : a.closest('nav, [role="navigation"]') ? 'меню' : 'тело');
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.href; if (!/^(https?|file):/i.test(href) || linkMap.size >= 3000 && !linkMap.has(href)) continue;
      let e = linkMap.get(href); if (!e) linkMap.set(href, e = { href, n: 0, text: '', ctx: {} });
      e.n++; const t = (txt(a) || (a.textContent || '').replace(/\s+/g, ' ').trim() || a.getAttribute('aria-label') || '').slice(0, 50); if (!e.text && t) e.text = t; bump(e.ctx, linkCtx(a));
    }
    const LEGAL_RE = /licen[cs]|terms|conditions|legal|copyright|eula|usage[- ]rights|лиценз|услови|оферт|соглашени|правообладат|авторск/i;
    const legal = []; const seenL = new Set();
    const licLink = document.querySelector('link[rel="license"]'); if (licLink && licLink.href) { legal.push({ text: 'link rel=license', href: licLink.href }); seenL.add(licLink.href); }
    for (const a of document.querySelectorAll('a[href]')) {
      if (legal.length >= 8) break;
      const t = (txt(a) || (a.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 50);
      if (!/^(https?|file):/i.test(a.href) || seenL.has(a.href) || inConsent(a) || !LEGAL_RE.test(t + ' ' + (a.getAttribute('href') || ''))) continue;
      seenL.add(a.href); legal.push({ text: t, href: a.href });
    }
    const hostOf = (u) => { if (/^data:/i.test(u)) return 'встроены в страницу (data:)'; if (/^blob:/i.test(u)) return 'blob:'; try { const x = new URL(u, location.href); return x.protocol === 'file:' ? 'локальные файлы' : x.hostname; } catch (e) { return null; } };
    const imgHosts = {};
    for (const i of imgs) { const u = i.currentSrc || i.src; if (u) bump(imgHosts, hostOf(u)); }
    for (const el of bgUrlEls) { const m = /url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/.exec(cs(el).backgroundImage); const u = m && (m[1] || m[2] || m[3]); if (u) bump(imgHosts, hostOf(u)); }
    for (const v of document.querySelectorAll('video')) { const u = v.currentSrc || v.src || v.poster; if (u) bump(imgHosts, hostOf(u)); }
    const footEl = document.querySelector('footer, [role="contentinfo"]');
    const copyM = footEl && /©[^\n]{0,80}/.exec(footEl.innerText || '');
    rights = { hosts: top(imgHosts, 6), legal, copyright: (document.querySelector('meta[name="copyright"], meta[name="dcterms.rights"]') || {}).content || (copyM ? copyM[0].trim() : null) };
  } catch (e) { inPageErrors.push(`ссылки и лицензия: ${String(e.message || e).slice(0, 120)}`); }

  /* --- паспорт донора (D7, A5): что у него есть — и чего нет --- */
  const ctaSet = new Set(ctaEls); const cardSet = new Set(cardRaw.map((c) => c.el));
  const roleOf = (el) => {
    const b = el.closest('a,button,[role="button"]'); if (b && ctaSet.has(b)) return 'кнопки';
    if (b && cardSet.has(b)) return 'карточки-ссылки';
    if (el.closest('nav, header')) return 'навигация';
    const fs = fsz(el);
    if (el.closest('h1,h2,h3,h4,h5,h6') || fs >= bodyPx * 1.5) return 'заголовки';
    if (fs < Math.min(14, bodyPx * 0.9)) return 'подписи';
    return 'текст';
  };
  const typeRoles = {};
  for (const el of all) {
    const t = ownText(el); if (t.length < 2 || !/[A-Za-zА-Яа-яЁё0-9]/.test(t) || inConsent(el)) continue;
    const s = cs(el); const fs0 = parseFloat(s.fontSize); const fs = fs0 * Z(el); if (fs < 6) continue;
    const ls = s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing) || 0; const em = r2(ls / fs0);
    const caps = s.textTransform === 'uppercase' || (t === t.toUpperCase() && /[A-ZА-ЯЁ]{2}/.test(t));
    const rl = roleOf(el); const row = typeRoles[rl] || (typeRoles[rl] = { total: 0, caps: 0, ls: {}, sizes: {}, weights: {}, families: {}, wide: [] });
    row.total++; if (caps) row.caps++; bump(row.ls, String(em)); bump(row.sizes, Math.round(fs)); bump(row.weights, s.fontWeight); bump(row.families, fam1(s.fontFamily));
    if (em >= 0.05 && row.wide.length < 3) row.wide.push({ el: sigNoId(el), fs: Math.round(fs), em, caps, text: t.slice(0, 30) });
  }
  for (const k of Object.keys(typeRoles)) { const row = typeRoles[k]; row.wideN = Object.entries(row.ls).filter(([v]) => parseFloat(v) >= 0.05).reduce((a, [, n]) => a + n, 0); row.ls = top(row.ls, 5); row.sizes = top(row.sizes, 5); row.weights = top(row.weights, 3); row.families = top(row.families, 3); }
  const visCount = (sel) => [...document.querySelectorAll(sel)].filter((e) => onScreen(e)).length;
  const inputsAll = [...document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea')].filter((e) => onScreen(e));
  const fieldStyle = inputsAll.slice(0, 1).map((i) => { const s = cs(i); return { radius: s.borderTopLeftRadius, h: px(R(i).height), bg: hex(s.backgroundColor), border: parseFloat(s.borderTopWidth) > 0 ? `${s.borderTopWidth} ${hex(s.borderTopColor)}` : 'нет', fs: s.fontSize }; })[0] || null;
  const components = {
    'форма': [...document.querySelectorAll('form')].filter((f) => onScreen(f)).length,
    'поля ввода': inputsAll.length,
    'выпадающий список': visCount('select'),
    'флажки и переключатели': [...document.querySelectorAll('input[type="checkbox"], input[type="radio"]')].filter((i) => cs(i).display !== 'none' && (onScreen(i) || (i.labels && [...i.labels].some((l) => onScreen(l))))).length,
    /* пункты аккордеона — после кликов в Node: clicks.mjs accordionItems (details + свои, не отвергнутые кликом) */
    'аккордеон': 0,
    'вкладки': visCount('[role="tab"]'),
    'слайдер / карусель': visCount('.swiper, .splide, [class*="slider"], [class*="carousel"], .t-slds'),
    'всплывающее окно': document.querySelectorAll('dialog, [role="dialog"], [class*="modal"], [class*="popup"]').length,
    'видео': document.querySelectorAll('video').length + [...document.querySelectorAll('iframe')].filter((f) => /youtube|vimeo|rutube|vk\.com\/video|kinescope/i.test(f.src || '')).length,
    'холст / 3D': visCount('canvas'),
    'карта': [...document.querySelectorAll('iframe')].filter((f) => /maps|yandex\.ru\/map|2gis/i.test(f.src || '')).length + (g.ymaps ? 1 : 0),
    'таблица': visCount('table'),
    'тени': Object.values(shadows).reduce((a, b) => a + b, 0),
    'курсив': italic,
    'градиенты': surface.gradients.reduce((a, x) => a + x.count, 0),
  };
  const passport = { typeRoles, radius: top(radius, 8), components, fieldStyle, bordersN, textShadows, buttonsTotal: buttons.length, bodyPx };

  /* --- движение (D21): бегущие, закончившиеся с удержанием (fill), и наведение, которое
     они перебивают --- */
  const animInfo = document.getAnimations().map((a) => {
    const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; let props = [];
    try { props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !/^(offset|computedOffset|easing|composite)$/.test(k)))]; } catch (e) { /* без ключевых кадров */ }
    return { target: a.effect && a.effect.target, name: a.animationName || (a.transitionProperty ? 'переход ' + a.transitionProperty : 'анимация'), state: a.playState, infinite: t.iterations === Infinity, fill: t.fill || 'auto', props };
  });
  const camel = (p) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  let keyframes = 0, reducedMotion = false, unreadable = 0; const hoverRules = [];
  const walk = (list) => {
    for (const r of list) {
      if (r.type === CSSRule.KEYFRAMES_RULE) keyframes++;
      else if (r.type === CSSRule.MEDIA_RULE) { if (/prefers-reduced-motion/.test(r.conditionText)) reducedMotion = true; if (matchMedia(r.conditionText).matches) walk(r.cssRules); }
      else if (r.type === CSSRule.STYLE_RULE && /:hover|:focus/.test(r.selectorText)) {
        const bases = r.selectorText.split(',').filter((x) => /:hover|:focus/.test(x)).map((x) => x.replace(/:(hover|focus-visible|focus-within|focus)/g, '').trim()).filter(Boolean);
        const props = [...r.style].map((p) => ({ p: camel(p), important: r.style.getPropertyPriority(p) === 'important' }));
        if (bases.length && props.length) hoverRules.push({ sel: r.selectorText, bases, props });
      } else if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { unreadable++; continue; } walk(rules); }
  const holding = animInfo.filter((a) => a.state === 'finished' && /forwards|both/.test(a.fill) && a.target);
  const conflicts = [];
  for (const h of holding) {
    for (const rule of hoverRules) {
      if (!rule.bases.some((b) => { try { return h.target.matches(b); } catch (e) { return false; } })) continue;
      const hit = rule.props.filter((q) => !q.important && h.props.some((p) => p === q.p || (p === 'transform' && /^(rotate|scale|translate)$/.test(q.p))));
      if (hit.length) conflicts.push({ target: sig(h.target), anim: h.name, fill: h.fill, props: [...new Set(hit.map((q) => q.p))], rule: rule.sel.slice(0, 90) });
    }
  }
  const stickyAll = fixedAll.map((el) => ({ el: sig(el), position: cs(el).position, veil: isVeil(el) }));
  const motion = {
    running: animInfo.filter((a) => a.state === 'running').length, infinite: animInfo.filter((a) => a.infinite).length,
    holding: holding.length, holdingSample: holding.slice(0, 6).map((h) => ({ target: sig(h.target), name: h.name, fill: h.fill, props: h.props })), hoverConflicts: dedupe(conflicts, (c) => c.target + c.rule).slice(0, 8),
    total: animInfo.length, keyframes, unreadableSheets: unreadable, reducedMotionRule: reducedMotion,
    withTransitions: all.filter((el) => parseFloat(cs(el).transitionDuration) > 0).length,
    sticky: stickyAll.slice(0, 8), stickyTotal: stickyAll.length,
  };
  const interactive = {
    toggles: [], dialogs: components['всплывающее окно'], sliders: document.querySelectorAll('.swiper, .splide, [class*="slider"], [class*="carousel"]').length,
    tabs: document.querySelectorAll('[role="tab"]').length, accordions: components['аккордеон'],
    inputs: document.querySelectorAll('input:not([type="hidden"]), textarea, select').length, links: document.querySelectorAll('a[href]').length, buttons: document.querySelectorAll('button, [role="button"]').length,
    hashLinks: document.querySelectorAll('a[href^="#"]').length, telLinks: document.querySelectorAll('a[href^="tel:"]').length,
  };

  return {
    viewport: { width: vw, height: vh, dpr: devicePixelRatio },
    tech: { frameworks, generator, libs, scriptHints, scripts: scriptSrcs.length, inlineScripts: [...document.scripts].filter((s) => !s.src).length, thirdParty, styles, images, media, dom, meta },
    content: {
      headings, nav, ctas: ctas.slice(0, 60), ctasTotal: buttons.length, buttonStyles: buttonStyles.slice(0, 12), icons: { count: icons.length, sample: icons.slice(0, 4).map((c) => c.text) },
      cardLinks, consentButtons: [...new Set(consentCtas.map((c) => c.text))].slice(0, 6),
      forms, words, paragraphs: paragraphs.length, longestParagraphs: voice.longest, voice, phones, emails, telLinks, mailLinks, prices, faq: null, accordions: null, social,
      links: [...linkMap.values()], rights,
    },
    visual: {
      palette: { backgrounds: topColors(bg, 8), text: topColors(fg, 6), ctaBackgrounds: topColors(buttons.reduce((m, c) => { if (c.filled) bump(m, base(c.bg), c.w * c.h); return m; }, {}), 4) },
      accent, neutralFills, btnBoxes,
      fonts: { used: top(fam, 5), heading: headingFont, body: bodyFont, bodySize: bodySizes.length ? bodySizes[0].size : cs(document.body).fontSize, bodySizes, levels, h1: h1s ? { size: zpx(h1, h1s.fontSize), weight: h1s.fontWeight, lineHeight: zpx(h1, h1s.lineHeight), transform: h1s.textTransform, family: fam1(h1s.fontFamily) } : null, loaded: [...document.fonts].filter((f) => f.status === 'loaded').length, failed: [...document.fonts].filter((f) => f.status === 'error').length },
      radius: top(radius, 6), shadows: Object.keys(shadows).length, sections, firstScreen, panels,
    },
    surface, techniques, slots, mediaShare, passport, motion, interactive, inPageErrors,
  };
}

/* =====================================================================
   Фактура: texture.mjs, если он рядом; иначе запасной путь
   ===================================================================== */
let texMod; let texNote = '';
async function textureModule() {
  if (texMod !== undefined) return texMod;
  const f = path.join(here, 'texture.mjs');
  if (!fs.existsSync(f)) { texMod = null; texNote = 'texture.mjs нет рядом — слои найдены запасным путём discover'; return null; }
  try { trackModule(f); texMod = await import(pathToFileURL(f).href); } catch (e) { texMod = null; texNote = `texture.mjs не загрузился (${String(e.message || e).slice(0, 120)}) — запасной путь discover`; }
  return texMod;
}

/* Блок --grain-* (texture.mjs: recipeFrom + tokensBlock) в файл переменных — как texture.mjs --tokens:
   блок между texture:start и texture:end заменяется, иначе дописывается в конец через пустую строку.
   Пишется, только если фактура снята texture.mjs и хотя бы на одном экране зерно «есть» или «нет»:
   при «не измерено» везде рецепт выключил бы слой (opacity 0) без доказательства, что зерна нет.
   → { written, file, replaced?, grain?, opacity?, blend?, minWidth?, px?, frames?, frameMs?, why? } */
const TEX_BLOCK_RE = /\/\* texture:start \*\/[\s\S]*?\/\* texture:end \*\//;
function addTextureTokens(file, texResults, opt = {}) {
  const T = texMod;
  const base = { written: false, file: path.basename(file) };
  if (!texResults.length) {
    const why = opt['no-texture'] ? 'фактура не мерилась по пикселям (--no-texture)'
      : opt['no-texture-module'] ? 'фактура снята запасным путём discover (--no-texture-module), рецепта нет'
        : `фактура снята не texture.mjs${texNote ? ` (${texNote})` : ''} — рецепта нет`;
    return { ...base, why };
  }
  if (!texResults.some((r) => r.status === 'есть' || r.status === 'нет')) return { ...base, why: 'зерно не измерено ни на одном экране (мало ровных участков) — решать глазами по вырезам 1:1 в папке texture/ рядом со снимками разведки' };
  if (!T || typeof T.recipeFrom !== 'function' || typeof T.tokensBlock !== 'function') return { ...base, why: 'в texture.mjs нет recipeFrom или tokensBlock' };
  try {
    const rec = T.recipeFrom(texResults);
    const block = T.tokensBlock(rec, texResults);
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const replaced = TEX_BLOCK_RE.test(prev);
    /* функция-замена: в блоке может быть «$» (адрес), строковая замена поняла бы его как шаблон */
    const next = replaced ? prev.replace(TEX_BLOCK_RE, () => block) : (prev ? prev.replace(/\s*$/, '\n\n') : '') + block + '\n';
    ensureDir(path.dirname(file)); fs.writeFileSync(file, next);
    const grain = !rec.none ? 'есть' : texResults.some((r) => r.status === 'не измерено') ? 'нет, часть экранов не измерена' : 'нет';
    return { ...base, written: true, replaced, grain, opacity: rec.none ? 0 : rec.opacity, blend: rec.blend, minWidth: rec.minWidth || 0, px: rec.px, frames: rec.frames, frameMs: rec.frameMs, statuses: Object.fromEntries(texResults.map((r) => [r.viewport.name, r.status])) };
  } catch (e) { return { ...base, why: `не записан: ${String(e.message || e).slice(0, 160)}` }; }
}

const HIDE_CSS = '[data-rw-tex]{visibility:hidden!important;opacity:0!important}[data-rw-tex-before]::before{visibility:hidden!important;opacity:0!important}[data-rw-tex-after]::after{visibility:hidden!important;opacity:0!important}[data-rw-tex-bg]{background-image:none!important}';

/* Файл плитки: кадры и задержки GIF/WebP (запасной путь; с texture.mjs — его analyzeTile). */
async function tileInfo(u, dir, label) {
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { url: u, error: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    const name = u.split('?')[0].split('/').pop() || 'tile';
    const file = path.join(ensureDir(dir), `${label}-${name}`.replace(/[^\w.а-яё-]+/gi, '_'));
    fs.writeFileSync(file, buf);
    const T = await textureModule();
    if (T && T.analyzeTile) { try { return { url: u, file: path.basename(file), ...(await T.analyzeTile(file)) }; } catch { /* дальше — sharp */ } }
    const sharp = loadSharp(); if (!sharp) return { url: u, file: path.basename(file), bytes: buf.length };
    const m = await sharp(buf, { animated: true }).metadata();
    const delay = m.delay || [];
    return { url: u, file: path.basename(file), format: m.format, bytes: buf.length, width: m.width, height: m.pageHeight || m.height, pages: m.pages || 1, delayMs: delay, frameMs: delay.length ? Math.round(delay.reduce((a, b) => a + b, 0) / delay.length) : null, loop: m.loop };
  } catch (e) { return { url: u, error: String(e.message || e).slice(0, 100) }; }
}

/* Вклад слоя по пикселям (запасной путь): снимок окна как есть и со спрятанными слоями,
   разница по полосам фона — тёмный (Y<60), средний, светлый (Y>190). Режим multiply на
   чёрном даёт ровно 0: зерна на тёмном фоне нет, хотя слой есть. */
async function textureDeltaFallback(page, found, dir, name) {
  const sharp = loadSharp(); if (!sharp) return { status: 'не измерено', note: 'нет sharp' };
  if (!found.layers.length) return { status: 'нет', note: 'слоёв фактуры не найдено' };
  await freezeMotion(page).catch(() => {});
  const vh = page.viewport().height;
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  const ys = [...new Set([0, Math.max(0, Math.round(H / 2 - vh / 2))])];
  const acc = { dark: { n: 0, sum: 0, lift: 0, ch: 0 }, mid: { n: 0, sum: 0, lift: 0, ch: 0 }, light: { n: 0, sum: 0, lift: 0, ch: 0 } };
  const shots = [];
  for (let i = 0; i < ys.length; i++) {
    const a = await screenSegment(page, ys[i], { pause: 400, settle: 300, mediaTimeout: 3000 });
    const tagEl = await page.addStyleTag({ content: HIDE_CSS }).catch(() => null);
    if (!tagEl) return { status: 'не измерено', note: 'стиль не вставился (CSP?)' };
    await sleep(200);
    const b = await page.screenshot({ type: 'png' });
    await tagEl.evaluate((el) => el.remove()).catch(() => {});
    if (i === 0) { fs.writeFileSync(path.join(dir, `${name}-texture-with.png`), a.buffer); fs.writeFileSync(path.join(dir, `${name}-texture-without.png`), b); shots.push(`${name}-texture-with.png`, `${name}-texture-without.png`); }
    const A = await sharp(a.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const B = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (A.info.width !== B.info.width || A.info.height !== B.info.height) continue;
    const da = A.data, db = B.data;
    for (let p = 0; p < da.length; p += 3) {
      const y = 0.2126 * db[p] + 0.7152 * db[p + 1] + 0.0722 * db[p + 2];
      const band = y < 60 ? acc.dark : y > 190 ? acc.light : acc.mid;
      const d0 = da[p] - db[p], d1 = da[p + 1] - db[p + 1], d2 = da[p + 2] - db[p + 2];
      const m = (Math.abs(d0) + Math.abs(d1) + Math.abs(d2)) / 3;
      band.n++; band.sum += m; band.lift += (d0 + d1 + d2) / 3; if (m > 2) band.ch++;
    }
  }
  const total = acc.dark.n + acc.mid.n + acc.light.n;
  const out = {};
  for (const [k, v] of Object.entries(acc)) out[k] = v.n ? { share: Math.round(v.n / total * 1000) / 10, meanAbs: Math.round(v.sum / v.n * 100) / 100, lift: Math.round(v.lift / v.n * 100) / 100, changedPct: Math.round(v.ch / v.n * 1000) / 10 } : null;
  const sum = acc.dark.sum + acc.mid.sum + acc.light.sum;
  out.all = total ? { meanAbs: Math.round(sum / total * 100) / 100, changedPct: Math.round((acc.dark.ch + acc.mid.ch + acc.light.ch) / total * 1000) / 10 } : null;
  const visible = out.all && out.all.meanAbs >= 0.3;
  const diagnosis = [];
  if (out.dark && out.dark.share >= 2 && out.dark.meanAbs < 0.3) diagnosis.push(`на тёмном фоне слой не виден: Δ ${out.dark.meanAbs} на ${out.dark.share}% кадра${found.layers.some((l) => /multiply|overlay|soft-light|color-burn|darken/.test(l.mixBlendMode)) ? ' — режим наложения гасит зерно на чёрном' : ''}`);
  if (out.light && out.light.share >= 2 && out.light.meanAbs < 0.3) diagnosis.push(`на светлом фоне слой не виден: Δ ${out.light.meanAbs} на ${out.light.share}% кадра${found.layers.some((l) => /screen|lighten|color-dodge/.test(l.mixBlendMode)) ? ' — режим наложения гасит зерно на белом' : ''}`);
  return { status: visible ? 'есть' : 'нет', statusNote: visible ? '' : 'слой есть, но на экране его вклад меньше 0.3 уровня', positions: ys, bands: out, diagnosis, shots, method: 'discover: снимок окна со слоем и без' };
}

/* =====================================================================
   Окно согласия cookie, доля заливки кнопок, цвет ссылок при наведении
   (аккордеоны и меню — scripts/clicks.mjs: findClickTargets, probeAccordions, probeToggles)
   ===================================================================== */

/* Окно согласия cookie — lib.mjs: closeConsent, consentNote (им пользуются discover и motion). */

/* Доля заливки кнопок в их коробках (C2 для кнопок): снимок коробки каждой кнопки (data-rw-btn
   ставит inPage), до 3 кнопок на цвет, сначала с первого экрана; доля пикселей ±PIX_TOL от цвета
   заливки. Доля по всему снимку для кнопок не годится: почти белый фон страницы попадал в ±20
   светло-серой кнопки. → { '#RRGGBB': { share %, buttons, of, examples } } */
async function buttonBoxShares(page, boxes, colors) {
  const sharp = loadSharp(); if (!sharp || !boxes.length) return null;
  const out = {};
  for (const color of colors) {
    const list = boxes.filter((b) => b.bg === color); if (!list.length || !/^#[0-9A-F]{6}$/i.test(color)) continue;
    const pick = [...list].sort((a, b) => b.aboveFold - a.aboveFold).slice(0, 3);
    const t = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    let hit = 0, total = 0, shots = 0;
    for (const b of pick) {
      const h = await page.$(`[data-rw-btn="${b.i}"]`); if (!h) continue;
      try {
        const buf = await h.screenshot({ type: 'png' });
        const { data } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let p = 0; p < data.length; p += 3) { total++; if (Math.abs(data[p] - t[0]) <= PIX_TOL && Math.abs(data[p + 1] - t[1]) <= PIX_TOL && Math.abs(data[p + 2] - t[2]) <= PIX_TOL) hit++; }
        shots++;
      } catch { /* кнопка ушла из DOM или нулевого размера */ } finally { await h.dispose().catch(() => {}); }
    }
    out[color] = { share: total ? Math.round(hit / total * 1000) / 10 : null, buttons: shots, of: list.length, examples: pick.map((b) => b.text).filter(Boolean).slice(0, 2) };
  }
  return out;
}

/* Цвет ссылок при наведении — запасной источник акцента, если цветных кнопок нет: до 6 видимых
   текстовых ссылок (не кнопки и не карточки — data-rw-cta), цвет видимого текста до и после. */
function hoverPickInPage() {
  const list = [];
  for (const a of document.querySelectorAll('a[href]')) {
    if (list.length >= 6) break;
    if (a.closest('[data-rw-cta], [data-rw-consent-box]') || a.querySelector('[data-rw-cta]')) continue;
    const r = a.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || r.height > 60 || eff(a) <= 0.3) continue;
    const t = (a.innerText || '').replace(/\s+/g, ' ').trim(); if (t.length < 2 || t.length > 40) continue;
    a.setAttribute('data-rw-hl', String(list.length)); list.push({ i: list.length, text: t.slice(0, 30) });
  }
  return list;
}
function hoverStateInPage(i) {
  const a = document.querySelector(`[data-rw-hl="${i}"]`); if (!a) return null;
  a.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = a.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 40), y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  /* мышь нажимает в координатах видимого окна: на телефоне у страницы шире экрана оно сдвинуто от окна раскладки */
  const p = screenPt(x, y);
  return { color: (hex(getComputedStyle(textEl(a)).color) || '').slice(0, 7), x: p.x, y: p.y, ok: !!hit && (a === hit || a.contains(hit)) && !p.off };
}
/* Точка наведения на карточку невидимого элемента data-rw-hid: центр карточки-хозяина — в координатах видимого окна */
function hidPointInPage(id) {
  const el = document.querySelector(`[data-rw-hid="${id}"]`); if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  let host = el.closest('li, article, [class*="card"], [class*="item"], [class*="product"], [class*="col"]');
  if (!host || host === el) { host = el.parentElement; for (let i = 0; i < 5 && host && host.getBoundingClientRect().height < 80; i++) host = host.parentElement; }
  const r = (host || el).getBoundingClientRect();
  const p = screenPt(r.left + r.width / 2, Math.max(2, Math.min(innerHeight - 2, r.top + r.height / 2)));
  return { x: p.x, y: p.y, off: p.off };
}
async function probeLinkHover(page) {
  const list = await evaluateWith(page, hoverPickInPage, null, DEPS).catch(() => []);
  const out = [];
  for (const l of list) {
    await page.mouse.move(1, 1).catch(() => {}); await sleep(150);
    const s0 = await evaluateWith(page, hoverStateInPage, l.i, DEPS).catch(() => null); if (!s0 || !s0.ok) continue;
    await page.mouse.move(s0.x, s0.y, { steps: 2 }).catch(() => {}); await sleep(450);
    const s1 = await evaluateWith(page, hoverStateInPage, l.i, DEPS).catch(() => null); if (!s1) continue;
    out.push({ text: l.text, from: s0.color, to: s1.color, changed: !!s1.color && s0.color !== s1.color });
  }
  await page.mouse.move(1, 1).catch(() => {});
  return out;
}
const hslOf = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(...v), mn = Math.min(...v), l = (mx + mn) / 2, d = mx - mn; return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l }; };
const chromaticHex = (h) => { if (!/^#[0-9A-F]{6}/i.test(h || '')) return false; const q = hslOf(h); return q.s >= 0.25 && q.l >= 0.12 && q.l <= 0.92; };

/* FAQ по заголовку и группам аккордеонов (после клика): подтверждённые кликом группы у заголовка
   (до 4000 px ниже) и любые группы, где у половины пунктов вопрос кончается «?»; «наведение» и «клик
   не раскрыл» — не FAQ-пункты; не проверенные кликом (--no-clicks) — только с вопросами «…?». details
   считаются по месту (detailsNearFaq), их группы (native) сюда второй раз не идут. */
function faqSummary(d) {
  const f = d.content.faq || {}; const acc = d.content.accordions || { details: 0, groups: [], detailsNearFaq: 0 };
  const near = (g) => f.top != null && g.top >= f.top - 100 && g.top <= f.top + 4000;
  const fg = (acc.groups || []).filter((g) => !g.native && accordionOk(g) && ((near(g) && g.status === 'подтверждён') || g.qMarks >= g.count / 2));
  const items = fg.reduce((a, g) => a + g.count, 0) + (acc.detailsNearFaq || 0);
  return { found: !!f.heading || fg.length > 0, heading: f.heading || null, top: f.top, items, details: acc.detailsNearFaq || 0, groups: fg.map((g) => ({ sig: g.sig, kind: g.kind, count: g.count, chevron: g.chevron, how: g.how, status: g.status || 'не проверен', opened: g.opened, tried: g.tried, closed: g.closed, skip: g.skip })) };
}

/* =====================================================================
   Прогон одного экрана
   ===================================================================== */
async function inspect(browser, url, name, vp, shotsDir, opt) {
  const notes = [];
  const page = await openPage(browser, url, vp, { scheme: opt.scheme || 'light' });
  try {
    const t0 = Date.now();
    /* окно согласия cookie — до первого снимка, как заставка (--keep-consent: только найти) */
    let consent = await closeConsent(page, { click: !opt['keep-consent'] }).catch((e) => ({ found: false, error: String(e.message || e).slice(0, 120) }));
    if (consent.closed && page.overlay && page.overlay.hadOverlay && !page.overlay.gone) page.overlay = { ...(await waitForOverlay(page, 1500)), afterConsent: true };
    await page.screenshot({ path: path.join(shotsDir, `${name}-first.png`) });
    const early = await evaluateWith(page, earlyInPage, null, DEPS);
    await forceInstantScroll(page);
    const scroll = await scrollThrough(page, {
      shotsDir: opt.light ? null : shotsDir, tag: `${name}-scroll`, skipTop: true, sheet: !opt.light,
      onStep: () => evaluateWith(page, stepInPage, null, DEPS).catch(() => 0),
    });
    const reveal = await evaluateWith(page, revealInPage, null, DEPS).catch((e) => ({ error: e.message }));
    /* окно, которое появилось позже (по таймеру, при прокрутке), — закрыть до замеров */
    if (!consent.found) { const late = await closeConsent(page, { click: !opt['keep-consent'] }).catch(() => null); if (late && late.found) consent = { ...late, late: true }; }

    /* слои фактуры — после прокрутки (ленивые фоны Tilda грузятся при прокрутке); с пометкой,
       чтобы палитра не взяла их цвет, а замер мог их спрятать */
    const T = opt['no-texture-module'] ? null : await textureModule();
    let found = null;
    if (T && typeof T.findTextureLayers === 'function') {
      try { found = await T.findTextureLayers(page, { mark: true, extras: true }); found.source = 'texture.mjs'; } catch (e) { notes.push(`texture.mjs findTextureLayers: ${e.message}`); }
    }
    if (!found) { found = await evaluateWith(page, textureFallbackInPage, null, DEPS); found.source = 'discover (запасной путь)'; }

    const veilKeys = (found.layers || []).filter((L) => !L.pseudo && L.hide === 'visibility').map((L) => L.k);
    /* Tilda: признак до главного сбора (служебное и обрезанное артбордом — вне языка донора, кегль × zoom) */
    const tinfo = await tildaInfo(page);
    const data = await evaluateWith(page, inPage, { veilKeys, tilda: !!tinfo.tilda }, DEPS);
    for (const e of data.inPageErrors || []) notes.push(e);
    /* Tilda: карта из атрибутов (tilda.mjs) — страница уже пройдена прокруткой; в json — выжимка, полная карта — tilda.mjs */
    if (tinfo.tilda) {
      try {
        const snap = await tildaSnapshot(page, { scroll: false, viewport: name });
        if (snap.tilda) data.tilda = { info: tinfo, summary: tildaSummary(snap), counts: snap.counts, blocks: snap.blocks.map((b) => b.code || '?'), appearNow: snap.platform.appearNow, animationOff: snap.platform.animationOff,
          fonts: snap.platform.fonts, hooks: snap.hooks, lazy: snap.lazy, service: snap.service, artboards: snap.zero.artboards.map((a) => ({ recid: a.recid, screens: a.screens, res: a.res, upscale: a.upscale, zoom: a.zoomMeasured || a.zoomCalc, shown: a.shown })),
          motion: snap.motion.map((m) => ({ id: m.id, kind: m.kind, sub: m.sub, plays: m.plays, key: m.key, count: m.count, delays: m.timing && m.timing.delays, duration: m.timing && m.timing.duration })) };
      } catch (e) { notes.push(`разбор Tilda (tilda.mjs): ${String(e.message || e).slice(0, 120)}`); data.tilda = { info: tinfo, error: String(e.message || e).slice(0, 160) }; }
    }
    /* аккордеоны, FAQ и меню — общее правило clicks.mjs, в том же состоянии страницы, что inPage (после
       прохода, наверху). Метки data-rw-cacc / data-rw-ctog остаются до кликов в конце. */
    const ck = await findClickTargets(page, { want: ['accordions', 'toggles'], maxToggles: 6 }).catch((e) => { notes.push(`аккордеоны и меню (clicks.mjs): ${String(e.message || e).slice(0, 120)}`); return null; });
    for (const e of (ck && ck.errors) || []) notes.push(e);
    data.content.accordions = { details: 0, groups: [], byClass: 0, detailsNearFaq: 0, faq: null, ...((ck && ck.accordions) || {}) };
    const faq0 = data.content.accordions.faq;
    data.content.faq = { heading: faq0 ? faq0.heading : null, top: faq0 ? faq0.top : null };
    data.interactive.toggles = (ck && ck.toggles) || [];
    const canvases = await canvasList(page).catch(() => []);
    data.tech.canvases = canvases.map((c) => ({ el: c.sig, w: c.clientWidth, h: c.clientHeight, ctx: c.ctx || 'не инициализирован', buffer: `${c.width}×${c.height}`, ratioCss: c.ratioCss, ratioDevice: c.ratioDevice, visible: c.clientWidth > 0 && c.clientHeight > 0 && c.opacity > 0.05 }));
    const overflow = await findOverflow(page).catch((e) => ({ verdict: 'WARN', summary: `проверка не прошла: ${e.message}`, outer: [], wideCauses: [] }));

    const fullMode = await fullPageShot(page, path.join(shotsDir, `${name}-full.png`));

    /* доля заливки кнопок — в коробках самих кнопок (снимок коробки), не по всей странице */
    const fillColors = (data.visual.palette.ctaBackgrounds || []).flatMap((x) => [x.value, ...(x.alias || [])]);
    data.visual.btnShares = await buttonBoxShares(page, data.visual.btnBoxes || [], fillColors).catch((e) => { notes.push(`доля заливки кнопок: ${e.message}`); return null; });
    await scrollToY(page, 0);

    /* невидимые после прокрутки (D14, A14): появлялись ли в окне; если нет — навести на карточку */
    const hidden = await evaluateWith(page, hiddenInPage, null, DEPS).catch((e) => { notes.push(`разбор невидимых: ${e.message}`); return []; });
    const effOf = new Function('el', `return (${EFFECTIVE_OPACITY_FN})(el);`);
    let hoverTried = 0;
    for (const grp of hidden) {
      if (grp.fixed) { grp.kind = 'закреплённое: меню или окно, открывается действием — норма'; continue; }
      if (grp.shownInView) { grp.kind = 'появлялось, пока было в окне; при возврате наверх спряталось — норма'; continue; }
      if (!opt['no-hover'] && hoverTried < 8) {
        hoverTried++; let shown = 0, tried = 0;
        for (const id of grp.ids) {
          const h = await page.$(`[data-rw-hid="${id}"]`); if (!h) continue;
          try {
            await page.mouse.move(1, 1); await sleep(60);
            const pt = await evaluateWith(page, hidPointInPage, id, DEPS);
            if (!pt || pt.off) continue;   /* точка за краем экрана (страница шире экрана) — не наводим */
            await page.mouse.move(pt.x, pt.y, { steps: 3 }); await sleep(500);
            tried++; if ((await h.evaluate(effOf)) > 0.5) shown++;
          } catch { /* элемент ушёл из DOM */ }
        }
        grp.hover = { tried, shown };
        if (shown) { grp.kind = `появляется при наведении на карточку — норма (проверено на ${shown} из ${tried})`; continue; }
      }
      grp.kind = grp.tracked && !grp.seenInView ? 'ни разу не попало в окно (карусель, вкладка, за краем) — проверить runtime.mjs' : 'не появилось ни при прокрутке, ни при наведении — проверить';
    }
    await page.mouse.move(1, 1).catch(() => {});
    await scrollToY(page, 0);

    /* замер фактуры по снимкам окна — последним: прячет слои и останавливает движение */
    let texture = null;
    const texDir = ensureDir(path.join(shotsDir, 'texture'));
    if (!opt['no-texture']) {
      if (T && typeof T.measureTexture === 'function' && found.source === 'texture.mjs') {
        try { texture = await T.measureTexture(page, { found, dir: texDir, label: name, screens: 3 }); texture.source = 'texture.mjs'; } catch (e) { notes.push(`texture.mjs measureTexture: ${e.message}`); }
      }
      if (!texture) { try { texture = await textureDeltaFallback(page, found, shotsDir, name); texture.source = 'discover'; } catch (e) { notes.push(`замер фактуры: ${e.message}`); } }
    }
    /* файлы плиток (кадры GIF) — запасной путь; у texture.mjs они уже в layers[].file */
    const tiles = [];
    if (found.source !== 'texture.mjs' || !(texture && texture.layers)) {
      const seen = new Set();
      for (const L of found.layers) for (const u of (L.urls || []).slice(0, 1)) { if (seen.has(u) || !/^https?:/.test(u)) continue; seen.add(u); tiles.push({ k: L.k, ...(await tileInfo(u, texDir, name)) }); }
    }

    /* наведение и клики — последними, после всех снимков: раскрывают аккордеоны и меню.
       Цветных кнопок нет — акцент ищется в цвете ссылок при наведении (--no-hover — не ищется) */
    const touch = !!vp.hasTouch;
    if (!data.visual.accent && !opt['no-hover']) {
      const lh = await probeLinkHover(page).catch((e) => { notes.push(`наведение на ссылки: ${e.message}`); return []; });
      data.visual.linkHover = lh;
      const cnt = {}; for (const x of lh) if (x.changed && chromaticHex(x.to)) cnt[x.to] = (cnt[x.to] || 0) + 1;
      const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      if (best) data.visual.accent = { from: 'ссылки при наведении', color: best[0], count: best[1], tried: lh.length, examples: lh.filter((x) => x.to === best[0]).map((x) => x.text).slice(0, 2) };
    }
    const acc = data.content.accordions;
    if (!opt['no-clicks']) {
      if (acc.groups.length) { await probeAccordions(page, acc.groups, { touch }).catch((e) => notes.push(`проверка аккордеонов кликом: ${e.message}`)); await page.mouse.move(1, 1).catch(() => {}); }
      if (data.interactive.toggles.length) await probeToggles(page, data.interactive.toggles, { touch }).catch((e) => notes.push(`проверка переключателя меню кликом: ${e.message}`));
    }
    data.passport.components['аккордеон'] = accordionItems(acc) || acc.byClass; data.interactive.accordions = data.passport.components['аккордеон'];
    data.content.faq = faqSummary(data);

    const timing = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const p = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)])); return n ? { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: p['first-contentful-paint'] || null, transferKb: Math.round((n.transferSize || 0) / 1024) } : null; });
    const afterScroll = { stillHidden: hidden.reduce((a, g) => a + g.count, 0), pageHeight: scroll.pageHeight, animationsNow: data.motion.total, horizontalOverflow: overflow.verdict !== 'OK' };
    const fullShot = { file: `${name}-full.png`, mode: fullMode };
    return {
      ...data, early, reveal, hidden, overflow, found, texture, tiles, fullShot, notes, consent,
      nav: page.gotoInfo || { attempt: 1, waitUntil: 'networkidle2' }, overlay: page.overlay, afterScroll, timing,
      log: { consoleErrors: page.log.console.filter((c) => c.type === 'error'), consoleWarnings: page.log.console.filter((c) => c.type === 'warning').length, pageErrors: page.log.errors, failedRequests: page.log.failed.slice(0, 20) },
      resources: summarizeRequests(page.log.requests), took: Date.now() - t0,
      scroll: { ...scroll, scroller: scroll.scroller && { kind: scroll.scroller.kind, el: scroll.scroller.el, height: scroll.scroller.height } },
    };
  } finally { await page.close().catch(() => {}); }
}

/* Проход только ради переполнения (320 px по умолчанию): без снимков (D20). */
async function overflowPass(browser, url, name, vp, opt) {
  const page = await openPage(browser, url, vp, { scheme: opt.scheme || 'light' });
  try {
    const t0 = Date.now();
    const consent = await closeConsent(page, { click: !opt['keep-consent'] }).catch(() => ({ found: false }));
    await forceInstantScroll(page);
    const scroll = await scrollThrough(page, { pause: 250 });
    const overflow = await findOverflow(page);
    const panels = await evaluateWith(page, () => [...document.body.querySelectorAll('*')].filter((el) => { const s = getComputedStyle(el); if (s.position !== 'fixed' && s.position !== 'sticky') return false; const r = el.getBoundingClientRect(); return r.width >= innerWidth * 0.3 && r.height >= 20 && r.height < innerHeight * 0.6 && eff(el) > 0.05; }).slice(0, 6).map((el) => { const r = el.getBoundingClientRect(); return { el: sig(el), place: r.top + r.height / 2 < innerHeight / 2 ? 'сверху' : 'снизу', height: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right) }; }), null, DEPS).catch(() => []);
    return { overflowOnly: true, viewport: { width: vp.width, height: vp.height, dpr: vp.deviceScaleFactor || 1 }, overflow, panels, consent, nav: page.gotoInfo, took: Date.now() - t0, scroll: { pageHeight: scroll.pageHeight, viewH: scroll.viewH, reachedBottom: scroll.reachedBottom, stuck: scroll.stuck, maxScrollY: scroll.maxScrollY, capped: scroll.capped } };
  } finally { await page.close().catch(() => {}); }
}

/* =====================================================================
   Палитра по пикселям (C2): каждый цвет подтверждается долей пикселей на снимках.
   Каждый пиксель засчитывается одному цвету — ближайшему (наибольшая разница по каналу) в пределах
   ±PIX_TOL. Раньше пиксель шёл всем цветам в пределах ±20 сразу: почти белый фон страницы
   (#F8F8FF) давал светло-серой кнопке (#EEEEEE) 41%, а соседние оттенки — одинаковую долю.
   ===================================================================== */
const PIX_TOL = 20; /* ±20 уровней на канал: зерно 7% сдвигает цвет до ±18 */
async function pixelShares(files, colors) {
  const sharp = loadSharp(); if (!sharp || !colors.length) return null;
  const T = colors.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const hits = new Float64Array(colors.length); let total = 0; const used = [];
  const memo = new Map(); /* цвет пикселя → номер ближайшего цвета палитры (−1 — ни одного) */
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    try {
      const meta = await sharp(f, { limitInputPixels: false }).metadata();
      const { data, info } = await sharp(f, { limitInputPixels: false }).resize({ width: Math.min(meta.width, 720), kernel: 'nearest' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      total += info.width * info.height; used.push(path.basename(f));
      for (let i = 0; i < data.length; i += 3) {
        const r = data[i], g = data[i + 1], b = data[i + 2]; const key = (r << 16) | (g << 8) | b;
        let k = memo.get(key);
        if (k === undefined) {
          k = -1; let bestD = PIX_TOL + 1;
          for (let j = 0; j < T.length; j++) { const t = T[j]; const dd = Math.max(Math.abs(r - t[0]), Math.abs(g - t[1]), Math.abs(b - t[2])); if (dd < bestD) { bestD = dd; k = j; } }
          if (memo.size < 1e6) memo.set(key, k);
        }
        if (k >= 0) hits[k]++;
      }
    } catch { /* файл не читается — пропуск */ }
  }
  if (!total) return null;
  return { files: used, shares: Object.fromEntries(colors.map((c, k) => [c, Math.round(hits[k] / total * 10000) / 100])) };
}

/* =====================================================================
   Страницы сайта по типам: ссылки этой страницы (все экраны) и /sitemap.xml,
   сгруппированные по шаблону адреса; с --pages-shots — по снимку на тип
   ===================================================================== */
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const LANG_SEG = /^[a-z]{2}(-[a-z]{2})?$/i;
const FILE_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|7z|gz|mp4|webm|mov|mp3|wav|ogg|docx?|xlsx?|pptx?|txt|xml|json|csv|rss|atom)$/i;
/* подсказка по имени — догадка для чтения таблицы, не вывод */
const PAGE_HINTS = [
  [/^\/$/, 'главная'],
  [/log-?in|sign-?in|sign-?up|register|account|cabinet|profile|auth|password|вход|регистрац|кабинет|профиль/i, 'вход и кабинет'],
  [/licen[cs]|privacy|terms|polic|cookie|legal|gdpr|agreement|oferta|оферт|политик|соглашени|конфиденц|услови|правила/i, 'юридическая'],
  [/pric|plans?(\/|$)|tariff|all-access|subscri|membership|тариф|цены|прайс|стоимост|подписк/i, 'тарифы и цены'],
  [/cart|checkout|basket|корзин|оформлен/i, 'корзина и оформление'],
  [/contact|support|help|feedback|контакт|поддержк|помощ/i, 'контакты и помощь'],
  [/about|team|story|company|о-нас|о-компании|команда|история/i, 'о нас'],
  [/blog|news|articles?|journal|posts?|статьи|новост|блог|журнал/i, 'блог и новости'],
  [/catalog|shop|store|products?|collections?|categor|goods|каталог|товар|магазин|коллекци|категори/i, 'каталог и товары'],
  [/portfolio|works?(\/|$)|projects?|cases?|портфолио|работы|проекты|кейсы/i, 'работы и кейсы'],
  [/services?|услуг/i, 'услуги'],
];
const hintOf = (key) => (PAGE_HINTS.find(([re]) => re.test(key)) || [])[1] || null;
/* путь адреса внутри сайта или null (другой сайт); www и без www — один сайт; у file:// — от папки страницы */
function sitePath(u, base) {
  if (base.protocol === 'file:') { if (u.protocol !== 'file:') return null; const dir = base.pathname.replace(/[^/]*$/, ''); return u.pathname.startsWith(dir) ? '/' + u.pathname.slice(dir.length) : null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = (x) => x.hostname.replace(/^www\./, '').toLowerCase();
  return h(u) === h(base) && (u.port || '') === (base.port || '') ? u.pathname : null;
}
function normPath(p) { let x = String(p || '/').replace(/\/index\.html?$/i, '/'); if (x.length > 1) x = x.replace(/\/+$/, ''); return x || '/'; }
/* шаблон адреса: /expansions/clay-1 → /expansions/*; /en/blog/x → /en/blog/*; /about → /about */
function typeKey(p) {
  const segs = p.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  if (!segs.length) return '/';
  const lead = LANG_SEG.test(segs[0]) && segs.length > 1 ? 2 : 1;
  const head = segs.slice(0, lead).join('/');
  return segs.length > lead ? `/${head}/${segs.slice(lead).map(() => '*').join('/')}` : `/${head}`;
}
/* /sitemap.xml: один запрос (10 с, до 5 МБ); у индекса — до 3 вложенных карт того же сайта */
async function fetchSitemap(base) {
  if (!/^https?:$/.test(base.protocol)) return null;
  const root = new URL('/sitemap.xml', base.origin).href;
  const get = async (u) => {
    const res = await fetch(u, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': UA_DESKTOP, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' }, redirect: 'follow' });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    if (Number(res.headers.get('content-length') || 0) > 5e6) return { error: 'больше 5 МБ' };
    return { text: (await res.text()).slice(0, 5e6) };
  };
  const locs = (t) => [...t.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  const r = await get(root).catch((e) => ({ error: String(e.message || e).slice(0, 80) }));
  if (r.error) return { url: root, error: r.error, urls: [] };
  if (!/<(urlset|sitemapindex)\b/i.test(r.text)) return { url: root, error: 'это не карта сайта (нет <urlset>)', urls: [] };
  if (!/<sitemapindex\b/i.test(r.text)) return { url: root, urls: locs(r.text).slice(0, 50000) };
  const kids = locs(r.text); const urls = []; let read = 0;
  for (const k of kids.filter((x) => { try { return new URL(x).hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, ''); } catch { return false; } }).slice(0, 3)) {
    const c = await get(k).catch(() => null); if (c && c.text) { read++; urls.push(...locs(c.text)); }
  }
  return { url: root, urls: urls.slice(0, 50000), index: { maps: kids.length, read } };
}
/* Типы страниц. Порядок (он же порядок снимков --pages-shots): сначала типы, на которые ссылается
   страница, — шаблоны с большим числом адресов, потом отдельные страницы по числу ссылок; затем
   найденные только в sitemap.xml. Якоря этой же страницы и файлы — не типы. */
function pageTypes(url, per, order, sm) {
  const base = new URL(url); const self = normPath(sitePath(base, base) || '/');
  const types = new Map(); const ext = {}; const files = new Set(); let anchors = 0;
  const merged = new Map();
  for (const v of order) {
    for (const l of (per[v].content && per[v].content.links) || []) {
      const m = merged.get(l.href);
      if (!m) merged.set(l.href, { ...l, ctx: { ...l.ctx } });
      else { m.n = Math.max(m.n, l.n); for (const [k, n] of Object.entries(l.ctx)) m.ctx[k] = Math.max(m.ctx[k] || 0, n); if (!m.text && l.text) m.text = l.text; }
    }
  }
  const typeOf = (key) => { let t = types.get(key); if (!t) types.set(key, t = { key, pages: new Set(), links: 0, sitemap: new Set(), ctx: {}, example: null, fromBody: false, texts: [] }); return t; };
  for (const l of merged.values()) {
    let u; try { u = new URL(l.href); } catch { continue; }
    const p = sitePath(u, base);
    if (p == null) { if (/^https?:$/.test(u.protocol)) { const h = u.hostname.replace(/^www\./, ''); ext[h] = (ext[h] || 0) + l.n; } continue; }
    const np = normPath(p);
    if (np === self) { anchors += l.n; continue; }
    if (FILE_EXT.test(np)) { files.add(np); continue; }
    const t = typeOf(typeKey(np)); t.pages.add(np); t.links += l.n;
    for (const [k, n] of Object.entries(l.ctx)) t.ctx[k] = (t.ctx[k] || 0) + n;
    if (!t.example || (!t.fromBody && l.ctx['тело'])) { t.example = l.href.split('#')[0]; t.fromBody = !!l.ctx['тело']; }
    if (l.text && t.texts.length < 2 && !t.texts.includes(l.text)) t.texts.push(l.text);
  }
  for (const s of (sm && sm.urls) || []) {
    let u; try { u = new URL(s); } catch { continue; }
    const p = sitePath(u, base); if (p == null) continue;
    const np = normPath(p); if (np === self || FILE_EXT.test(np)) continue;
    const t = typeOf(typeKey(np)); t.sitemap.add(np); if (!t.example) t.example = s.split('#')[0];
  }
  const list = [...types.values()].map((t) => ({ key: t.key, pages: t.pages.size, links: t.links, sitemap: t.sitemap.size, ctx: t.ctx, example: t.example, texts: t.texts, hint: hintOf(t.key), template: t.key.includes('*') }));
  list.sort((a, b) => ((b.pages > 0) - (a.pages > 0)) || (b.template - a.template) || (Math.max(b.pages, b.sitemap) - Math.max(a.pages, a.sitemap)) || (b.links - a.links) || a.key.localeCompare(b.key));
  return {
    self, types: list, anchors, files: [...files].slice(0, 8), filesTotal: files.size,
    external: Object.entries(ext).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([host, n]) => ({ host, n })),
    sitemap: sm ? { url: sm.url, count: (sm.urls || []).length, error: sm.error || null, index: sm.index || null } : null,
  };
}
/* По одной странице каждого типа: открыть, закрыть окно согласия, прокрутить (ленивое и появления),
   снимок всей страницы и видимые h1–h3. */
async function shootPages(browser, types, n, vpName, vp, dir, opt) {
  const out = [];
  for (const t of types.filter((x) => x.example).slice(0, n)) {
    const slug = t.key.replace(/\*/g, '').replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'home';
    const file = `${slug}.png`; const t0 = Date.now(); let page = null;
    process.stdout.write(`· страница типа ${t.key} (${vpName}) … `);
    try {
      page = await openPage(browser, t.example, vp, { scheme: opt.scheme || 'light' });
      const consent = await closeConsent(page, { click: !opt['keep-consent'] }).catch(() => ({ found: false }));
      await forceInstantScroll(page);
      await scrollThrough(page, { pause: 250 });
      const mode = await fullPageShot(page, path.join(dir, file));
      const info = await evaluateWith(page, () => ({
        title: document.title, url: location.href, height: document.documentElement.scrollHeight,
        heads: [...document.querySelectorAll('h1,h2,h3')].filter((h) => { const r = h.getBoundingClientRect(); return r.width > 0 && r.height > 0 && eff(h) > 0.05; }).map((h) => ({ level: h.tagName.toLowerCase(), text: (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90) })).filter((h) => h.text).slice(0, 40),
      }), null, DEPS);
      const doc = page.log.requests.find((r) => r.type === 'document');
      out.push({ key: t.key, example: t.example, file, mode, status: doc ? doc.status : null, ...info, consent: consent.found ? consentNote(consent) : null, took: Date.now() - t0 });
      console.log(`ок (${((Date.now() - t0) / 1000).toFixed(1)} с${doc && doc.status >= 400 ? `, HTTP ${doc.status}` : ''})`);
    } catch (e) {
      out.push({ key: t.key, example: t.example, error: String(e.message || e).replace(/\n/g, ' ').slice(0, 200) });
      console.log(`сбой: ${String(e.message || e).split('\n')[0].slice(0, 120)}`);
    } finally { if (page) await page.close().catch(() => {}); }
  }
  return out;
}

/* =====================================================================
   Сводка для чтения
   ===================================================================== */
const pctS = (v) => (v == null ? '?' : v < 0.01 && v > 0 ? '<0.01%' : `${v}%`);
function shortName(u) {
  try { const x = new URL(u); const seg = x.pathname.split('/').filter(Boolean).pop(); return (seg ? decodeURIComponent(seg) : `${x.host}${x.pathname} (документ)`).slice(0, 48); } catch { return String(u).slice(0, 48); }
}
/* цвет палитры: x — строка или { value, alias } (близкие оттенки одной строкой) */
function colorNote(x, shares, min) {
  const c = typeof x === 'string' ? x : x.value; const alias = (x && x.alias) || [];
  const name = alias.length ? `${c} ≈ ${alias.slice(0, 3).join(', ')}` : c;
  if (!shares || shares[c] == null) return name;
  const v = shares[c];
  return v < min ? `${name} (**в CSS есть, на экране нет** — ${pctS(v)} пикселей)` : `${name} (${pctS(v)})`;
}
/* заливка кнопок: доля — в коробках самих кнопок (buttonBoxShares), а не по всему снимку */
const FILL_MIN = 20;
function fillShare(x, box) { return box ? [x.value, ...(x.alias || [])].map((k) => box[k]).find((y) => y && y.share != null) || null : null; }
function fillNote(x, box) {
  const name = x.alias && x.alias.length ? `${x.value} ≈ ${x.alias.slice(0, 3).join(', ')}` : x.value;
  const b = fillShare(x, box);
  if (!b) return `${name} (в коробках кнопок не измерено)`;
  return b.share < FILL_MIN ? `${name} (**в CSS есть, в коробках кнопок почти не видна** — ${b.share}% пикселей, снято ${b.buttons} из ${b.of})` : `${name} (в коробках кнопок ${b.share}%, снято ${b.buttons} из ${b.of})`;
}
function accentLine(vis, box) {
  const a = vis.accent;
  const neutral = (vis.neutralFills || []).map((f) => `${f.color}${f.firstScreen ? ' (первый экран)' : ''}`).join(', ');
  if (a && a.from === 'кнопки') { const b = fillShare({ value: a.color }, box); return `- акцент (цвет действий): **${a.color}** — заливка кнопок ${a.examples.map((e) => `«${e}»`).join(', ')}${a.count > a.examples.length ? ` и ещё ${a.count - a.examples.length}` : ''}${a.firstScreen ? ', первый экран' : ''}${a.nested ? `, фон у вложенного блока (${a.nested} из ${a.count})` : ''}${b ? ` · в коробках ${b.share}%` : ''}${neutral ? ` · нейтральные заливки: ${neutral}` : ''}`; }
  if (a) return `- акцент (цвет действий): **${a.color}** — цветных кнопок нет${neutral ? ` (заливки нейтральные: ${neutral})` : ''}, цвет ссылок при наведении: ${a.count} из ${a.tried} (${a.examples.map((e) => `«${e}»`).join(', ')})`;
  const lh = vis.linkHover;
  return `- акцент (цвет действий): не найден — ${neutral ? `у кнопок нейтральная заливка ${neutral}` : 'залитых кнопок нет'}${lh ? `; ссылки при наведении ${lh.some((x) => x.changed) ? `меняют цвет только на нейтральный (${[...new Set(lh.filter((x) => x.changed).map((x) => x.to))].join(', ')})` : `цвет не меняют (проверено ${lh.length})`}` : ''}. Фоны секций, шапки и подвала — не акцент`;
}
function passportLines(d, m) {
  const P = d.passport; const L = [];
  const roles = ['кнопки', 'карточки-ссылки', 'навигация', 'подписи', 'заголовки', 'текст'];
  const lsLine = (row) => row.ls.map((x) => `${x.value === '0' ? '0' : `${x.value}em`} ×${x.weight}`).join(', ');
  L.push('Что у донора есть — только эти значения и брать. Чего нет — проектировать из его языка (его радиусы, шрифт, регистр, разрядка), а не по умолчанию.', '');
  L.push('**Есть**', '');
  const rad = P.radius.map((x) => `${x.value} ×${x.weight}`).join(', ');
  L.push(`- радиусы (видимые коробки): ${rad || 'нет — везде прямые углы'}`);
  for (const r of roles) {
    const row = P.typeRoles[r]; if (!row) continue;
    const wide = row.wide.length ? ` · разрядка ≥ .05em: ${row.wide.map((w) => `${w.el} ${w.fs}px ${w.em}em «${w.text}»`).join('; ')}` : '';
    L.push(`- ${r} (${row.total}): кегль ${row.sizes.map((x) => `${x.value}px ×${x.weight}`).join(', ')} · начертание ${row.weights.map((x) => x.value).join('/')} · капс ${row.caps} из ${row.total} · letter-spacing ${lsLine(row)}${wide}`);
  }
  const bs = d.content.buttonStyles.slice(0, 5);
  if (bs.length) L.push(`- кнопки по стилям: ${bs.map((b) => `${b.bg ? `заливка ${b.bg}` : b.gradient ? 'градиент' : b.border ? `контур ${b.border}` : 'без заливки'}${b.surface ? ` (у ${b.surface})` : ''}, ${b.fs}px/${b.fw}${b.upper ? ' КАПС' : ''}${b.ls ? ` ls ${b.ls}em` : ''}, высота ${b.h}, радиус ${b.radius}${b.pill ? ' (пилюля)' : ''} ×${b.count} («${b.examples[0]}»)`).join('; ')}`);
  const cl = d.content.cardLinks;
  if (cl && cl.total) L.push(`- карточки-ссылки (${cl.total}, не кнопки): ${cl.styles.slice(0, 3).map((x) => `${x.bg ? `фон ${x.bg}` : x.gradient ? 'градиент' : 'без фона'}${x.border ? `, контур ${x.border}` : ''}, радиус ${x.radius}${x.shadow ? ', тень' : ''}, ${x.wMin === x.wMax ? x.wMin : `${x.wMin}–${x.wMax}`}×${x.hMin === x.hMax ? x.hMin : `${x.hMin}–${x.hMax}`} ×${x.count}`).join('; ')}`);
  if (P.fieldStyle) L.push(`- поля ввода: радиус ${P.fieldStyle.radius}, высота ${P.fieldStyle.h}, фон ${P.fieldStyle.bg || 'прозрачный'}, рамка ${P.fieldStyle.border}, кегль ${P.fieldStyle.fs}`);
  const have = Object.entries(P.components).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`);
  if (have.length) L.push(`- компоненты: ${have.join(', ')}`);
  L.push('', '**Нет** (проектировать из языка донора, не по умолчанию)', '');
  const none = Object.entries(P.components).filter(([, n]) => !n).map(([k]) => k);
  L.push(`- ${none.join(', ') || 'всё основное есть'}`);
  if (m && m.passport) { const mn = Object.entries(m.passport.components).filter(([k, n]) => !n && P.components[k]).map(([k]) => k); if (mn.length) L.push(`- на телефоне нет: ${mn.join(', ')}`); }
  L.push('', '**Чего донор не делает никогда (числами)**', '');
  const never = [];
  for (const r of roles) {
    const row = P.typeRoles[r]; if (!row) continue;
    if (!row.wideN) never.push(`разрядка ≥ .05em у «${r}»: 0 из ${row.total}`);
  }
  const radiusVals = P.radius.map((x) => parseFloat(x.value));
  if (!radiusVals.some((v) => v >= 8 && v <= 12)) never.push('радиусы 8–12px: 0 элементов');
  if (!P.components['тени']) never.push('тени: 0');
  if (!P.components['градиенты']) never.push('градиенты: 0');
  if (!P.components['курсив']) never.push('курсив: 0');
  const caps = P.typeRoles['подписи']; if (caps && !caps.caps) never.push(`мелкие подписи капсом: 0 из ${caps.total}`);
  const btnCaps = P.typeRoles['кнопки']; if (btnCaps && !btnCaps.caps) never.push(`кнопки капсом: 0 из ${btnCaps.total}`);
  if (btnCaps && btnCaps.caps === btnCaps.total && btnCaps.total > 1) never.push(`кнопки строчными: 0 из ${btnCaps.total} (все капсом)`);
  if (!P.components['форма'] && !P.components['поля ввода']) never.push('форм и полей ввода: 0 — любую форму выводить из кнопок и подписей донора');
  L.push(...(never.length ? never.map((x) => `- ${x}`) : ['- запретов по числам не нашлось']));
  return L;
}

function textureLines(per, order, texResults) {
  const L = [];
  const T = texMod;
  /* с texture.mjs — его раздел целиком */
  if (T && typeof T.textureMarkdown === 'function' && texResults.length) {
    try { const md = T.textureMarkdown(texResults); if (md && md.trim()) { L.push(md.trim().replace(/^## .*\n?/, '').trim(), ''); } } catch (e) { L.push(`(textureMarkdown не сработал: ${e.message})`, ''); }
  }
  /* где есть слой — по экранам (у донора зерно бывает только на desktop) */
  const byKey = new Map();
  for (const v of order) {
    const p = per[v]; if (!p || !p.found) continue;
    for (const Lr of p.found.layers || []) {
      const key = ((Lr.urls && Lr.urls[0]) || (Lr.files && Lr.files[0]) || Lr.backgroundImage || Lr.el).slice(0, 120) + '|' + (Lr.pseudo || '');
      const e = byKey.get(key) || { layer: Lr, on: [] }; e.on.push(v); byKey.set(key, e);
    }
  }
  if (!byKey.size) { L.push(`- слоёв фактуры (зерно, шум, вуаль) не найдено ни на одном экране (${order.join(', ')})`); }
  if (!(T && T.textureMarkdown && texResults.length)) {
    for (const [, { layer: x, on }] of byKey) {
      const file = (x.urls && x.urls[0] && x.urls[0].split('?')[0].split('/').pop()) || (x.svg ? `SVG feTurbulence ${x.svg.type || ''} baseFrequency ${x.svg.baseFrequency} numOctaves ${x.svg.numOctaves}` : (x.files || []).join(', '));
      const tile = x.urls && x.urls[0] ? order.map((v) => per[v] && (per[v].tiles || []).find((t) => t.url === x.urls[0])).find(Boolean) : null;
      L.push(`- **${x.el}${x.pseudo || ''}** — ${x.scope || (x.coversViewport ? 'весь экран' : `${x.rect.w}×${x.rect.h}`)}, ${x.position}${x.fixedBy && x.position !== 'fixed' ? ` (закреплён через ${x.fixedBy})` : ''}, z ${x.zIndex}, pointer-events ${x.pointerEvents}`);
      L.push(`  - картинка: ${file}${tile && !tile.error ? ` — ${tile.format || ''} ${tile.width}×${tile.height}, ${tile.pages > 1 ? `${tile.pages} кадра по ${tile.frameMs || (tile.delayMs || [])[0]} мс` : '1 кадр'}, ${kb(tile.bytes)}` : tile && tile.error ? ` (не скачалась: ${tile.error})` : ''}; фон ${x.backgroundSize} ${x.backgroundRepeat}${x.imageRendering && x.imageRendering !== 'auto' ? `, image-rendering ${x.imageRendering}` : ''}`);
      L.push(`  - прозрачность ${x.opacity} (итоговая ${x.effectiveOpacity}), наложение ${x.mixBlendMode}${x.blendChain && x.blendChain.length ? ` / у предков ${x.blendChain.join(', ')}` : ''}${x.animation ? `, анимация ${x.animation}` : ''}${x.animChain && x.animChain.length ? ` [${x.animChain.join('; ')}]` : ''}`);
      L.push(`  - где есть: ${on.join(', ')}${on.length < order.length ? ` (на ${order.filter((v) => !on.includes(v)).join(', ')} нет — переносить с тем же условием по ширине)` : ''}`);
    }
    for (const v of order) {
      const t = per[v] && per[v].texture; if (!t || !t.bands) continue;
      const b = t.bands; const f = (x) => (x ? `Δ ${x.meanAbs} (подъём ${x.lift >= 0 ? '+' : ''}${x.lift}, ${x.share}% кадра)` : '—');
      L.push(`- ${v}, вклад слоя по снимку окна: тёмный фон ${f(b.dark)} · средний ${f(b.mid)} · светлый ${f(b.light)} · изменено ${b.all ? b.all.changedPct : '?'}% пикселей → **${t.status}**${t.statusNote ? ` (${t.statusNote})` : ''}`);
      for (const dg of t.diagnosis || []) L.push(`  - **WARN** ${dg}`);
    }
  }
  const any = order.map((v) => per[v]).find((p) => p && p.texture && p.texture.shots && p.texture.shots.length);
  if (any) L.push(`- открыть глазами: \`${any.texture.shots.join('`, `')}\` (как есть и без слоя, увеличить до 200–300%)`);
  if (texNote) L.push(`- источник: ${texNote}`);
  return L;
}

function consentLine(per, order) {
  const found = order.filter((v) => per[v].consent && per[v].consent.found);
  if (!found.length) return `- окно согласия cookie: не появлялось${order.some((v) => per[v].consent && per[v].consent.error) ? ` (проверка не прошла: ${order.map((v) => per[v].consent && per[v].consent.error).filter(Boolean)[0]})` : ''}`;
  const rest = order.filter((v) => !found.includes(v));
  const closed = found.some((v) => per[v].consent.closed);
  return `- окно согласия cookie: ${found.map((v) => `${v} — ${consentNote(per[v].consent)}`).join('; ')}${rest.length ? `; ${rest.join(', ')} — не появлялось${closed ? ' (согласие уже дано в этом браузере)' : ''}` : ''}${closed ? '. Кнопки окна в кнопки сайта не входят' : ''}`;
}
function faqLine(fq) {
  if (!fq || typeof fq !== 'object') return fq ? 'есть' : 'нет';
  if (!fq.found) return 'нет (ни заголовка «FAQ / Frequently asked questions / Вопросы / Частые вопросы», ни пунктов-аккордеонов с вопросами «…?»)';
  const parts = [];
  if (fq.details) parts.push(`details ×${fq.details}`);
  for (const g of fq.groups || []) parts.push(accGroupNote(g));
  return `есть — ${fq.heading ? `«${fq.heading}»` : 'без заголовка (по вопросам «…?»)'}${fq.items ? `, ${fq.items} вопросов (${parts.join('; ')})` : ' — пунктов-аккордеонов под заголовком не нашлось (ответы открыты текстом?)'}`;
}
function accordionsLine(acc) {
  if (!acc) return '';
  const parts = [];
  if (acc.details) parts.push(`details ${acc.details}`);
  for (const g of (acc.groups || []).filter((x) => !x.native)) parts.push(`\`${g.sig}\` ×${g.count} — ${g.chevron || 'без значка'} + ответ ${g.how}; ${g.status === 'подтверждён' ? `клик раскрывает ${g.opened} из ${g.tried}` : g.skip ? `клик не проверен: ${g.skip}` : g.status || 'кликом не проверялся'}`);
  return parts.length ? ` (${parts.join('; ')})` : '';
}
function toggleProbeNote(p) {
  if (!p) return 'кликом не проверялся';
  if (p.skip) return `клик не проверен: ${p.skip}`;
  if (p.navigated) return `клик увёл на ${p.navigated}`;
  return p.opens ? `клик открывает навигацию (+${p.added} ссылок: ${p.sample.map((x) => `«${x}»`).join(', ')}), ${p.closedBy ? `закрывается: ${p.closedBy}` : 'не закрылось ни повторным кликом, ни Escape'}` : 'клик ссылок не открыл';
}
function togglesLine(toggles, url, vpName) {
  if (!toggles || !toggles.length) return 'не найдены (ни [aria-expanded], ни имени burger/menu, ни 2–4 полосок, svg или «☰» в шапке)';
  return toggles.slice(0, 3).map((t) => { const q = t.selector.includes('"') ? `'${t.selector}'` : `"${t.selector}"`; return `\`${t.selector}\` (${t.how}, ${t.w}×${t.h}; ${toggleProbeNote(t.probe)}) → проверить: \`runtime.mjs ${url} --viewport ${vpName} --click ${q} --shot menu\``; }).join('; ');
}
function rightsLines(per, order) {
  const hosts = {}; const legal = new Map(); let copy = null;
  for (const v of order) {
    const r = per[v].content && per[v].content.rights; if (!r) continue;
    for (const h of r.hosts || []) hosts[h.value] = Math.max(hosts[h.value] || 0, h.weight);
    for (const l of r.legal || []) if (!legal.has(l.href)) legal.set(l.href, l);
    copy = copy || r.copyright;
  }
  const hs = Object.entries(hosts).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h} ×${n}`).join(', ');
  return [
    `- картинки донора: ${hs ? `хостинг ${hs}` : 'картинок нет'}${legal.size ? ` · у донора есть лицензия/условия: ${[...legal.values()].map((l) => `«${l.text}» ${l.href}`).join('; ')}` : ' · ссылок на лицензию или условия (license, terms, лицензия, условия, оферта) на странице нет — права на картинки неизвестны, считать чужими'}${copy ? ` · ${copy}` : ''}`,
    '- материалы донора (фото, иллюстрации, тексты, логотипы, файлы) не берём без законного получения — покупка лицензии или письменное разрешение правообладателя; свои кадры — законные бесплатные источники (media.mjs)',
  ];
}
/* Раздел «Tilda»: выжимка карты из атрибутов (tilda.mjs tildaSummary) и что это значит для остальных разделов */
function tildaLines(d, m) {
  const t = d.tilda; const L = ['## Tilda', ''];
  if (t.error) { L.push(`- сайт на Tilda, но карта из атрибутов не снялась: ${t.error} — снять отдельно: \`tilda.mjs <адрес> --viewport desktop,mobile\``); return L; }
  L.push('Конструктор Tilda: язык донора — в атрибутах и коде блоков, а не в замерах. Полная карта — `tilda.mjs <адрес> --viewport desktop,mobile` (`tilda/tilda-*.md`, движение с числами Tilda — `tilda-motion-*.json`), порядок — `reference/donor-tilda.md`. Tilda у нас только донор: сайты на Tilda не правим и не переносим.', '',
    '- в разделах ниже кегли — на экране (computed × zoom Zero Block); служебное Tilda (плашка Made on Tilda, t-mbfix, полоса T360) и обрезанное артбордом (заглушка «Zero Block», элементы других брейкпоинтов за краем) в секции, палитру, типографику, кнопки и приёмы не входят', ...t.summary);
  if (m && m.tilda && !m.tilda.error) L.push(`- телефон (${m.viewport.width}px): появления — ${m.tilda.appearNow}; движений в атрибутах ${m.tilda.counts.motion}, играет ${m.tilda.counts.motionPlays}. Tilda сама снимает появления на ширине < 1200, кроме Zero Block с data-animate-mobile=y: пустой инвентарь телефона — правда, а не сбой; у нас на телефоне этого движения тоже нет`);
  return L;
}
function pagesLines(pg, shots, n) {
  const L = ['## Страницы сайта по типам', ''];
  const sm = pg.sitemap;
  const tp = pg.tilda;
  if (tp && tp.types) {
    L.push(`Tilda: адреса плоские (/abuse, /choi…), по шаблону адреса вышло бы ${tp.byAddress} типов — поэтому типы по подписи блоков: коды T-блоков по порядку без T123 (HTML-вставки), одна подпись — один шаблон (доля общих кодов ≥ 0.8 и одинаковые первые три; \`tilda.mjs pages\`). Адресов найдено ${tp.found} (ссылки и sitemap.xml), запрошено ${tp.fetched}${tp.skipped ? `, сверх предела не запрошено ${tp.skipped}` : ''}${tp.products ? `, товаров /tproduct/ ${tp.products} (запрошен один)` : ''} — голый HTML без браузера, за ${tp.seconds} с.`, '',
      '| тип | страниц | пример | подпись блоков |', '|---|---|---|---|',
      ...tp.types.map((t) => `| \`${t.name}\`${t.self ? ' (эта страница)' : ''} | ${t.count} | ${t.example}${t.note ? ` (${t.note})` : ''} | ${t.signature.split(' ').slice(0, 16).join(' ')}${t.signature.split(' ').length > 16 ? ' …' : ''} |`), '',
      `- строка для motion.mjs и tilda.mjs: \`--pages "${tp.pagesArg}"\``);
    if (tp.errors && tp.errors.length) L.push(`- не открылись: ${tp.errors.join('; ')}`);
  } else if (tp && tp.error) L.push(`- Tilda: типы по подписи блоков не сняты (${tp.error}) — ниже по шаблону адреса, у Tilda он даёт тип почти на каждую страницу; снять: \`tilda.mjs pages <адрес>\``, '');
  if (tp && tp.types) {
    if (shots && shots.length) {
      L.push('', `### Снято по странице каждого типа (\`pages/\`, ${shots.length} из ${tp.types.filter((t) => !t.self).length})`, '');
      for (const s of shots) {
        if (s.error) { L.push(`- \`${s.key}\` — **не снялась**: ${s.error} (${s.example})`); continue; }
        const hs = s.heads.slice(0, 10).map((h) => `${h.level}: ${h.text}`).join(' · ');
        L.push(`- \`pages/${s.file}\` — \`${s.key}\` · ${s.url}${s.status && s.status >= 400 ? ` · **HTTP ${s.status}**` : ''} · «${s.title}» · высота ${s.height}px`, `  - заголовки: ${hs || 'нет видимых h1–h3'}`);
      }
    } else if (n === 0) L.push('', '- страницы не открывались (по умолчанию): снять по одной странице каждого типа — тот же запуск с `--pages-shots N`');
    return L;
  }
  L.push(`Ссылки этой страницы (все экраны)${sm ? ` и ${sm.error ? `/sitemap.xml — не прочитан: ${sm.error}` : `/sitemap.xml — ${sm.count} адресов${sm.index ? ` (индекс: прочитано ${sm.index.read} из ${sm.index.maps} карт)` : ''}`}` : ''}, сгруппированные по шаблону адреса: первый сегмент пути и «*» на месте остальных. Якоря этой страницы (${pg.anchors}) и файлы — не типы. «По имени» — догадка по адресу, не вывод.`, '');
  const others = pg.types.filter((t) => t.key !== pg.self);
  if (!others.length) { L.push('- других страниц нет: сайт одностраничный (только якоря этой страницы)'); return L; }
  const ctx = (c) => Object.entries(c || {}).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k} ${x}`).join(', ') || '—';
  L.push('| тип страницы | адресов по ссылкам (ссылок) | в sitemap.xml | где ссылки | по имени | пример |', '|---|---|---|---|---|---|',
    ...others.slice(0, 30).map((t) => `| \`${t.key}\` | ${t.pages ? `${t.pages} (${t.links})` : '—'} | ${sm && !sm.error ? t.sitemap || '—' : '?'} | ${ctx(t.ctx)} | ${t.hint || '—'} | ${t.example || '—'}${t.texts.length ? ` «${t.texts[0]}»` : ''} |`));
  if (others.length > 30) L.push(`| … | ещё ${others.length - 30} типов — в discovery.json (pages) | | | | |`);
  if (pg.external.length) L.push('', `- внешние ссылки: ${pg.external.map((e) => `${e.host} ×${e.n}`).join(', ')}`);
  if (pg.filesTotal) L.push(`- файлы: ${pg.filesTotal} (${pg.files.join(', ')})`);
  if (shots && shots.length) {
    L.push('', `### Снято по странице каждого типа (\`pages/\`, ${shots.length} из ${others.length})`, '');
    for (const s of shots) {
      if (s.error) { L.push(`- \`${s.key}\` — **не снялась**: ${s.error} (${s.example})`); continue; }
      const hs = s.heads.slice(0, 10).map((h) => `${h.level}: ${h.text}`).join(' · ');
      L.push(`- \`pages/${s.file}\` — \`${s.key}\` · ${s.url}${s.status && s.status >= 400 ? ` · **HTTP ${s.status}**` : ''} · «${s.title}» · высота ${s.height}px${s.consent ? ` · окно согласия: ${s.consent}` : ''}`, `  - заголовки: ${hs || 'нет видимых h1–h3'}${s.heads.length > 10 ? ` · ещё ${s.heads.length - 10}` : ''}`);
    }
  } else if (n === 0) L.push('', '- страницы не открывались (по умолчанию): снять по одной странице каждого типа — тот же запуск с `--pages-shots N`');
  return L;
}

function writeSummary(url, run, per, design, order, extra) {
  const { tag, extra320, shares, tokenCheck, designNote } = extra;
  const d = per.desktop || per[order[0]]; const m = per.mobile || per[order.find((v) => per[v].viewport.width < 600)];
  const L = [];
  const dir = (f) => `\`${tag}/${f}\``;
  L.push(`# Разведка: ${url}`, '', `Дата: ${new Date().toLocaleDateString('sv-SE')} · папка прогона: \`${run}\``, '', '> Состояние: ANALYZED. Снято с живой страницы, но ни одна анимация, клик или 3D ещё не проверены как работающие — это runtime.mjs.', '');
  L.push('## Что открыть глазами', '', ...order.map((v) => `- ${dir(`${v}-first.png`)}, ${dir(`${v}-full.png`)} — первый экран и вся страница (${v})${per[v].scroll.sheet ? `; ${dir(per[v].scroll.sheet)} — вся прокрутка листом` : ''}`),
    `- \`${tag}/*-scroll-NN.png\` — снимки окна равномерно по всей высоте, от первого экрана до низа: появления блоков, ленивая подгрузка, закреплённые слои`,
    `- > ${FULLPAGE_NOTE}`,
    `- Снимки разведки — для взгляда. Набор «до» для сравнения с «после» — только \`shots.mjs --tag before\`.`, '');
  const t = d.tech, im = t.images;
  const navNote = order.filter((v) => per[v].nav && (per[v].nav.attempt > 1 || per[v].nav.waitUntil === 'domcontentloaded')).map((v) => `${v} с ${per[v].nav.attempt}-й попытки${per[v].nav.waitUntil === 'domcontentloaded' ? ', только DOMContentLoaded — замеры могли сняться с недогруженной страницы' : ''}`);
  L.push('## Техника', '',
    `- платформа: ${t.frameworks.join(', ') || 'без фреймворка (обычный HTML/CSS/JS)'}${t.generator ? ` · generator: ${t.generator}` : ''}`,
    `- библиотеки: ${Object.entries(t.libs).map(([k, v]) => (v === true ? k : `${k} ${v}`)).join(', ') || 'не выявлено'}${t.scriptHints.length ? ` · по именам скриптов: ${t.scriptHints.join(', ')}` : ''}`,
    `- скрипты: ${t.scripts} внешних, ${t.inlineScripts} встроенных · стили: ${t.styles.external.length} файлов, ${t.styles.inlineBlocks} блоков · сторонние домены: ${t.thirdParty.join(', ') || 'нет'}`,
    `- DOM: ${t.dom.nodes} узлов · высота ${t.dom.pageHeight}px (${t.dom.screens} экранов) · HTML ${kb(t.dom.htmlBytes)}`,
    `- переход: ${navNote.length ? `**${navNote.join('; ')}**` : 'с первой попытки на всех экранах'}`,
    `- заставка при загрузке: ${d.overlay && d.overlay.hadOverlay ? `${d.overlay.overlay}, ${d.overlay.gone ? `ушла через ${d.overlay.waitedMs} мс${d.overlay.afterConsent ? ' (после закрытия окна согласия)' : ''}` : `НЕ ушла за ${d.overlay.waitedMs} мс — закрывает страницу`}` : 'нет'}`,
    consentLine(per, order),
    `- холсты: ${t.canvases.length ? t.canvases.slice(0, 6).map((c) => `${c.el} ${c.w}×${c.h} ${c.ctx}${c.ratioCss != null && c.ratioCss < 0.85 ? ` (буфер ${c.buffer} — размыт, ×${c.ratioCss})` : ''}`).join('; ') + (t.canvases.length > 6 ? `; ещё ${t.canvases.length - 6}` : '') : 'нет'} · видео: ${t.media.video} (автоплей ${t.media.autoplayVideo}) · iframe: ${t.media.iframes.length} · Lottie: ${t.media.lottie} · встроенных SVG: ${t.media.svgInline}`,
    `- картинки: ${im.count}, ленивых ${im.lazy}${im.tildaLazy ? ` (Tilda грузит по data-original: ${im.tildaLazy.dataOriginal}, фонов .t-bgimg загружено после прокрутки ${im.tildaLazy.bgLoaded} из ${im.tildaLazy.bg}, заглушек /-/resize/20x/ сейчас ${im.tildaLazy.placeholders})` : ''}, без alt ${im.noAlt}, битых ${im.broken}, фоновых ${im.bgImages} · форматы: ${Object.entries(im.formats).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}${im.oversized.length ? ` · грузятся крупнее, чем показаны: ${im.oversized.map((o) => `${o.src} ${o.natural}→${o.shown}`).join('; ')}` : ''}`,
    `- meta: title «${t.meta.title}» · description ${t.meta.description ? 'есть' : 'НЕТ'} · viewport ${t.meta.viewport || 'НЕТ'} · lang ${t.meta.lang || 'НЕТ'} · h1 на странице: ${t.meta.h1Count} · og:image ${t.meta.ogImage ? 'есть' : 'нет'} · favicon ${t.meta.favicon ? 'есть' : 'нет'}`,
    `- загрузка: ${d.timing ? `TTFB ${d.timing.ttfb} мс · FCP ${d.timing.fcp || '?'} мс · load ${d.timing.load} мс` : 'не измерена'} · передано ${d.resources.totalKb} КБ в ${d.resources.count} запросах: ${Object.entries(d.resources.byType).map(([k, v]) => `${k} ${v.count}/${Math.round(v.bytes / 1024)}КБ`).join(', ')}${d.resources.unknownSize ? ` · без размера ${d.resources.unknownSize}` : ''}`,
    `- самое тяжёлое: ${d.resources.largest.slice(0, 5).map((r) => `${shortName(r.url)} ${r.kb}КБ`).join('; ') || '—'}`, '');
  if (d.tilda) L.push(...tildaLines(d, m && m !== d ? m : null), '');

  L.push('## Ошибки и сбои', '');
  for (const v of order) {
    const p = per[v]; const errs = p.log.consoleErrors.length + p.log.pageErrors.length;
    L.push(`- ${v}: консоль ${p.log.consoleErrors.length} ошибок, исключений ${p.log.pageErrors.length}, предупреждений ${p.log.consoleWarnings}, упавших запросов ${p.log.failedRequests.length}`);
    /* у Tilda-донора: jQuery-селектор из полной ссылки-якоря (#rec…) и сбои блоков — ошибки скриптов донора, не наши */
    const donorErr = (e, exc) => (p.tilda && (exc || /#rec\d|t_onReady|tilda|unrecognized expression/i.test(e)) ? ' (ошибка скриптов донора Tilda — в итог не тянуть)' : '');
    if (errs) L.push(...[...p.log.consoleErrors.map((c) => [c.text, false]), ...p.log.pageErrors.map((x) => [x, true])].slice(0, 6).map(([e, exc]) => `    - ${e.replace(/\n/g, ' ').slice(0, 160)}${donorErr(e, exc)}`));
    if (p.log.failedRequests.length) L.push(...p.log.failedRequests.slice(0, 4).map((f) => `    - ${f.reason}: ${f.url}`));
    L.push(`    - переполнение по ширине: **${p.overflow.verdict}** — ${p.overflow.summary}`);
    if (p.scroll.stuck) L.push('    - **WARN** прокрутка: страница выше окна, но не прокрутилась (прокрутку держит сайт или заставка) — появления и снимки недостоверны');
    else if (!p.scroll.reachedBottom) L.push(`    - **WARN** прокрутка: не доехали до низа (дошли до ${p.scroll.maxScrollY} из ${p.scroll.pageHeight - (p.scroll.viewH ?? p.viewport.height)}px)${p.scroll.capped ? `, остановились на пределе ${p.scroll.screens} шагов` : ''} — нижние блоки могли не появиться`);
    for (const n of p.notes || []) L.push(`    - шаг не сработал: ${n}`);
  }
  for (const [v, err] of Object.entries(extra.failed || {})) L.push(`- ${v}: **FAIL экран не снялся** — ${String(err).replace(/\n/g, ' ').slice(0, 200)}; разведка по нему не делалась`);
  for (const [v, p] of Object.entries(extra320 || {})) {
    if (p.error) { L.push(`- ${v} (${p.width || 320}px, только переполнение): **FAIL** сбой — ${p.error}; переполнение на этой ширине не проверено`); continue; }
    L.push(`- ${v} (${p.viewport.width}px, отдельный проход только ради переполнения): **${p.overflow.verdict}** — ${p.overflow.summary}${p.scroll.stuck || !p.scroll.reachedBottom ? ' · **WARN** прокрутка не дошла до низа' : ''}`);
  }
  L.push('');

  const c = d.content; const cl = c.cardLinks || { total: 0, styles: [] };
  L.push('## Содержимое', '', `- слов на странице: ${c.words} · текстовых блоков: ${c.paragraphs} · цен: ${c.prices.length ? c.prices.slice(0, 6).join(', ') : 'не найдено'}`,
    `- FAQ: ${faqLine(c.faq)}`,
    `- контакты: ${[...c.phones, ...c.emails].join(', ') || 'не найдены'}${c.telLinks.length || c.mailLinks.length ? ` (ссылками tel:/mailto: ${c.telLinks.length + c.mailLinks.length})` : ''} · соцсети: ${c.social.map((s) => s.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]).join(', ') || 'нет'}`, '',
    '### Заголовки', '', ...c.headings.map((h) => `${h.level === 'h1' ? '' : h.level === 'h2' ? '  ' : '    '}- ${h.level}: ${h.text}${h.aboveFold ? ' (первый экран)' : ''}`), '',
    '### Навигация', '', c.nav.map((n) => `${n.text} → ${n.href}`).join(' · ') || '— нет', '',
    `### Кнопки и призывы (${c.ctasTotal} на странице, ${c.ctas.length} разных; сначала отправка формы и первый экран)`, '',
    'Кнопка — компактный элемент с заливкой, контуром или градиентом (у самого элемента или у вложенного блока на всю площадь); стиль текста — от видимого текста внутри. Ссылки с картинкой и коробки от 120 px — ниже, в «Карточках-ссылках».', '',
    ...c.ctas.slice(0, 14).map((b) => `- «${b.text}» ${b.tag}${b.href ? ` → ${b.href}` : ''}${b.count > 1 ? ` ×${b.count}` : ''} · ${b.filled ? `заливка ${b.bg}` : b.gradient ? 'градиент' : b.bordered ? `контур ${b.border}` : 'без заливки'}${b.surface ? ` (у ${b.surface})` : ''}, ${b.w}×${b.h}, радиус ${b.radius}${b.pill ? ' (пилюля)' : ''}, текст ${b.color} ${b.fs}px/${b.fw}${b.upper ? ' КАПС' : ''}${b.ls ? ` ls ${b.ls}em` : ''}${b.submit ? ' · **отправка формы**' : ''}${b.aboveFold ? ' · первый экран' : ''}`),
    ...(c.ctas.length > 14 ? [`- …и ещё ${c.ctas.length - 14} разных (все — в discovery.json)`] : []),
    ...(!c.ctas.length ? ['— нет'] : []),
    ...(c.icons.count ? [`- образцы и значки без подписи (меньше 48×48, только aria-label): ${c.icons.count} — ${c.icons.sample.join(' | ')}`] : []),
    ...(c.consentButtons && c.consentButtons.length ? [`- кнопки окна согласия cookie — не кнопки сайта, в списки выше не входят: ${c.consentButtons.map((x) => `«${x}»`).join(', ')}`] : []), '',
    '### Стили кнопок', '', ...(c.buttonStyles.length ? c.buttonStyles.slice(0, 8).map((b) => `- ${b.bg ? `заливка ${b.bg}` : b.gradient ? 'градиент' : b.border ? `контур ${b.border}` : 'без заливки'}${b.surface ? ` (у ${b.surface})` : ''} · текст ${b.color} ${b.fs}px/${b.fw} ${b.family}${b.upper ? ' КАПС' : ''}${b.ls ? ` ls ${b.ls}em` : ''} · высота ${b.h} · радиус ${b.radius}${b.pill ? ' (пилюля)' : ''}${b.shadow ? ' · тень' : ''} — ×${b.count}: ${b.examples.map((x) => `«${x}»`).join(', ')}`) : ['— нет']), '',
    `### Карточки-ссылки (${cl.total} на странице; не кнопки)`, '',
    ...(cl.total ? ['Ссылка с картинкой (от 20% площади) или коробка от 120 px в высоту. Подпись — самый длинный видимый текст внутри.', '', ...cl.styles.map((x) => `- ×${x.count} · ${x.bg ? `фон ${x.bg}` : x.gradient ? 'градиент' : 'без фона'}${x.surface ? ` (у ${x.surface})` : ''}${x.border ? `, контур ${x.border}` : ''}, радиус ${x.radius}${x.shadow ? ', тень' : ''} · ${x.wMin === x.wMax ? x.wMin : `${x.wMin}–${x.wMax}`}×${x.hMin === x.hMax ? x.hMin : `${x.hMin}–${x.hMax}`} · картинка до ${x.mediaMax}% площади${x.examples.length ? ` · подпись ${x.color} ${x.fs}px/${x.fw} ${x.family}${x.upper ? ' КАПС' : ''}` : ''}${x.aboveFold ? ' · первый экран' : ''} — ${x.examples.map((e) => `«${e}»`).join(', ') || 'без подписи (только картинка)'}${x.hrefs.length ? ` → ${x.hrefs.join(', ')}` : ''}`)] : ['— нет']), '',
    '### Формы', '', ...(c.forms.length ? c.forms.map((f) => `- ${f.fields.map((x) => `${x.type}${x.name ? `:${x.name}` : ''}${x.required ? '*' : ''}${x.labelled ? '' : ' (без подписи)'}`).join(', ')} → «${f.submit || '?'}» · action ${f.action || '—'} · согласие ${f.consent ? 'есть' : 'нет'}${f.visible ? '' : ' · скрыта'}`) : ['— нет']), '',
    '### Тон голоса', '', ...(c.voice.firstScreen.length ? ['Первый экран:', ...c.voice.firstScreen.map((p) => `> ${p}`), ''] : []), 'Самые длинные блоки:', ...(c.voice.longest.length ? c.voice.longest.map((p) => `> ${p}`) : ['— текстовых блоков от 40 знаков нет']), '');

  if (extra.pages) L.push(...pagesLines(extra.pages, extra.pageShots, extra.pagesShotsN), '');

  const vis = d.visual; const sh = shares && shares.shares;
  L.push('## Визуал (замеры, не мнение)', '',
    `Вес цвета = видимая площадь × итоговая прозрачность; полноэкранные вуали и зерно — в разделе «Фактура», не здесь. В скобках — доля пикселей этого цвета на снимках${shares ? ` (${shares.files.length}: first и full всех экранов)` : ''}: каждый пиксель засчитан одному, ближайшему цвету палитры (±${PIX_TOL} на канал); меньше 0.1% — цвет есть в CSS, но на экране его нет: в дизайн-систему не брать. «≈» — оттенки ближе ΔE 3, одной строкой. У заливок кнопок доля — в коробках самих кнопок.`, '',
    `- фоны по площади: ${vis.palette.backgrounds.map((x) => colorNote(x, sh, 0.1)).join(', ')}`,
    `- цвета текста: ${vis.palette.text.map((x) => colorNote(x, sh, 0.02)).join(', ')}`,
    `- заливки кнопок: ${vis.palette.ctaBackgrounds.map((x) => fillNote(x, vis.btnShares)).join(', ') || 'нет'}`,
    accentLine(vis, vis.btnShares),
    `- шрифты: заголовки «${vis.fonts.heading}», текст «${vis.fonts.body}» ${vis.fonts.bodySize}${vis.fonts.bodySizes.length > 1 ? ` (по объёму текста: ${vis.fonts.bodySizes.map((x) => `${x.size} ${x.chars} зн.`).join(', ')})` : ''} · загружено начертаний ${vis.fonts.loaded}, не загрузилось ${vis.fonts.failed}`,
    ...['h1', 'h2', 'h3'].filter((k) => vis.fonts.levels[k]).map((k) => { const f = vis.fonts.levels[k]; return `- ${k}: «${f.family}» ${f.size}/${f.weight}, строка ${f.lineHeight}, ${f.transform}${f.letterSpacing !== 'normal' ? `, ls ${f.letterSpacing}` : ''}${f.style !== 'normal' ? `, ${f.style}` : ''} — «${f.text}»`; }),
    `- радиусы: ${vis.radius.map((x) => `${x.value} ×${x.weight}`).join(', ') || 'нет'} · теней: ${vis.shadows}`,
    `- первый экран: h1 ${vis.firstScreen.h1AboveFold ? 'виден' : 'НЕ виден'} · кнопок ${vis.firstScreen.ctasAboveFold} · крупное медиа ${vis.firstScreen.hasHeroMedia ? (vis.firstScreen.heroBgMedia ? 'есть (картинка-фон)' : 'есть') : 'нет'} · шапка ${vis.firstScreen.header ? `${vis.firstScreen.header.found}: ${vis.firstScreen.header.el} ${vis.firstScreen.header.height}px (${vis.firstScreen.header.shareOfScreen}% экрана, ${vis.firstScreen.header.position}, ${vis.firstScreen.header.place}${vis.firstScreen.header.bg ? `, фон ${vis.firstScreen.header.bg}` : ''}${vis.firstScreen.header.backdrop ? `, ${vis.firstScreen.header.backdrop}` : ''}${vis.firstScreen.header.radius ? `, радиус ${vis.firstScreen.header.radius}` : ''})` : 'не найдена'}`,
    `- самый крупный текст первого экрана: ${vis.firstScreen.text.map((x) => `«${x.text}» ${x.size}`).join(' · ')}`, '',
    ...(vis.sections.some((s) => s.tilda !== undefined)
      ? ['### Секции сверху вниз', '', '| # | блок | блок Tilda | высота | фон | заголовок | медиа | кнопок | текста |', '|---|---|---|---|---|---|---|---|---|',
        ...vis.sections.map((s, i) => `| ${i + 1} | \`${s.el}\` | ${s.tilda || '—'} | ${s.height} | ${s.background || (s.hasBgImage ? 'картинка' : '—')} | ${s.heading || '—'} | ${s.images} | ${s.ctas} | ${s.textChars} |`), '']
      : ['### Секции сверху вниз', '', '| # | блок | высота | фон | заголовок | медиа | кнопок | текста |', '|---|---|---|---|---|---|---|---|',
        ...vis.sections.map((s, i) => `| ${i + 1} | \`${s.el}\` | ${s.height} | ${s.background || (s.hasBgImage ? 'картинка' : '—')} | ${s.heading || '—'} | ${s.images} | ${s.ctas} | ${s.textChars} |`), '']));
  if (m && m !== d) {
    const mf = m.visual.firstScreen;
    L.push('### Мобильный экран', '', `- высота ${m.tech.dom.pageHeight}px (${m.tech.dom.screens} экранов) · секций ${m.visual.sections.length} · шапка ${mf.header ? `${mf.header.el} ${mf.header.height}px, ${mf.header.shareOfScreen}%, ${mf.header.place}` : '—'} · h1 ${mf.h1AboveFold ? 'виден' : 'НЕ виден'} · кнопок на первом экране ${mf.ctasAboveFold}`,
      `- закреплённые панели: ${m.visual.panels.length ? m.visual.panels.map((p) => `${p.el} ${p.place}, высота ${p.height}px (${p.shareOfScreen}% экрана), ${p.position}${p.bg ? `, фон ${p.bg}` : ''}${p.backdrop ? `, ${p.backdrop}` : ''}${p.radius ? `, радиус ${p.radius}` : ''}, ссылок ${p.links}`).join('; ') : 'нет'}`,
      `- переключатели меню: ${togglesLine(m.interactive.toggles, url, order.find((v) => per[v] === m) || 'mobile')} · кнопка позвонить: ${m.interactive.telLinks ? 'есть' : 'нет'}`, '');
  }

  L.push('## Паспорт донора: есть / нет', '', ...passportLines(d, m && m !== d ? m : null), '');

  L.push('## Фактура (параметры для переноса)', '', ...textureLines(per, order, extra.texResults || []), '');

  const s = d.surface;
  L.push('### Поверхность: стекло, плёнки, градиенты, обработка', '',
    `- стекло (backdrop-filter): ${s.backdrop.length ? s.backdrop.map((b) => `${b.el} ${b.filter}, фон ${b.bg || 'прозрачный'}, радиус ${b.radius}, ${b.w}×${b.h} ${b.position}${b.count > 1 ? ` ×${b.count}` : ''}`).join('; ') : 'нет'}`,
    `- плёнки и градиенты по площади: ${s.gradients.length ? s.gradients.slice(0, 5).map((x) => `${x.el} ×${x.count}: ${x.css}`).join('; ') : 'нет'}`,
    `- псевдоэлементы с фоном: ${s.pseudo.length ? s.pseudo.slice(0, 5).map((x) => `${x.el} (${x.covers}) ${x.bg}${x.opacity < 1 ? ` ×${x.opacity}` : ''}${x.blend !== 'normal' ? `, ${x.blend}` : ''}${x.count > 1 ? ` ×${x.count}` : ''}`).join('; ') : 'нет'}`,
    `- режимы наложения: ${s.blend.length ? s.blend.map((x) => `${x.el} ${x.mode}`).join('; ') : 'нет'} · фильтры: ${s.filters.length ? s.filters.map((x) => `${x.filter} ×${x.count}`).join('; ') : 'нет'} · маски и обрезки: ${s.masks.length ? s.masks.map((x) => `${x.el} ${x.clip !== 'none' ? x.clip : x.mask}`).join('; ') : 'нет'}`,
    `- фоновые видео: ${s.videos.filter((x) => x.background).length || 'нет'} · обработка текста: ${s.textFx.length ? s.textFx.map((x) => [x.shadow && `тень ${x.shadow}`, x.stroke && `обводка ${x.stroke}`, x.clip && 'заливка через background-clip:text'].filter(Boolean).join(', ') + ` («${x.text}»)`).join('; ') : 'нет'}`, '');

  const tq = d.techniques;
  L.push('## Подписные приёмы', '', 'Числа из вычисленных стилей: переносить приём с этими значениями, а не «наклон вообще».', '',
    `- наклоны и скосы (> 3°): ${tq.transforms.length ? tq.transforms.map((x) => `${x.el} ${x.w}×${x.h}: ${Math.abs(x.rotate) > 3 ? `поворот ${x.rotate}°` : ''}${Math.abs(x.skew) > 3 ? ` скос ${x.skew}°` : ''}${x.is3d ? ' 3D' : ''}${x.scale !== 1 ? ` масштаб ${x.scale}` : ''}${x.moving ? ' (в движении)' : ''}${x.firstScreen ? ' · первый экран' : ''}${x.text ? ` «${x.text}»` : ''}`).join('; ') : 'нет — донор ничего не наклоняет'}`,
    `- стекло: ${tq.backdrop.length ? tq.backdrop.map((b) => `${b.filter} на ${b.bg || 'прозрачном'}, радиус ${b.radius}, ${b.w}×${b.h}`).join('; ') : 'нет'}`,
    `- крупный текст (от ${Math.max(48, Math.round(d.passport.bodyPx * 2.5))}px): ${tq.bigText.length ? tq.bigText.map((x) => `«${x.text}» ${x.fs}px (${x.vw}vw) ${x.family} ${x.fw}${x.upper ? ' КАПС' : ''}, строка ${x.lh}, ls ${x.ls}em, ширина ${x.widthShare}% экрана${x.bleeds ? ', вылезает за край' : ''}${x.firstScreen ? ' · первый экран' : ''}`).join('; ') : 'нет'}`,
    `- обрезки clip-path: ${tq.clips.length ? tq.clips.map((x) => `${x.el} ${x.w}×${x.h}: ${x.kind}${x.angles.length ? ` ${x.angles.join('°, ')}° к горизонтали` : ''} — ${x.css}`).join('; ') : 'нет'}`,
    ...(tq.blendText.length ? [`- текст с наложением: ${tq.blendText.map((x) => `${x.el} ${x.mode} «${x.text}»`).join('; ')}`] : []),
    ...(tq.stroke.length ? [`- контурный текст / заливка текста: ${tq.stroke.map((x) => `${x.el} ${x.stroke || 'background-clip:text'} «${x.text}»`).join('; ')}`] : []), '');

  L.push('## Медиа-слоты', '', `Фото и видео занимают ${pctS(d.mediaShare.photoPage)} площади страницы и ${pctS(d.mediaShare.photoFirstScreen)} первого экрана (desktop). Слотов ${d.mediaShare.slots}: ${Object.entries(d.mediaShare.byKind).map(([k, n]) => `${k} ${n}`).join(', ') || '—'}. Тип «фото / графика» — по формату файла.`, '',
    '| роль | элемент | сколько | размер | пропорции | вписывание | плёнки поверх | фильтр | тип | пример |', '|---|---|---|---|---|---|---|---|---|---|',
    ...(d.slots.length ? d.slots.map((x) => `| ${x.role} | \`${x.key}\` ${x.tag} | ${x.count} | ${x.w}×${x.h} | ${x.ratio} | ${x.fit} | ${x.films.join('; ') || '—'} | ${x.filter || '—'}${x.blend ? `, ${x.blend}` : ''} | ${x.kind}${x.video ? `, ${x.video}` : ''} | ${x.src || '—'}${x.natural ? ` (${x.natural})` : ''} |`) : ['| — | крупных картинок нет | | | | | | | | |']),
    '', 'Для подбора фото: пропорции и вписывание из таблицы, плёнки и фильтр повторить поверх, зерно — из «Фактуры».', '');
  if (m && m !== d && m.slots.length) L.push(`На телефоне: ${m.slots.slice(0, 5).map((x) => `${x.role} ${x.w}×${x.h} (${x.ratio}) ×${x.count}`).join('; ')} · фото ${pctS(m.mediaShare.photoPage)} страницы, ${pctS(m.mediaShare.photoFirstScreen)} первого экрана.`, '');
  L.push(...rightsLines(per, order), '');

  const mo = d.motion, it = d.interactive, ea = d.early || {}, rv = d.reveal || {};
  L.push('## Движение и интерактив (наличие, не качество)', '',
    `- анимаций при загрузке: ${ea.motionAtLoad ? `${ea.motionAtLoad.running} идут (бесконечных ${ea.motionAtLoad.infinite}), ${ea.motionAtLoad.holding} закончились и держат значение` : '?'} · после прокрутки: идут ${mo.running} (бесконечных ${mo.infinite}), держат значение (fill forwards/both) ${mo.holding} · ключевых кадров в CSS: ${mo.keyframes}${mo.unreadableSheets ? ` (+${mo.unreadableSheets} таблиц стилей не прочитаны, кросс-домен)` : ''}`,
    ...(mo.holdingSample.length ? [`- держат значение: ${mo.holdingSample.map((h) => `${h.target} ${h.name} (${h.fill}: ${h.props.join(', ')})`).join('; ')}`] : []),
    ...mo.hoverConflicts.map((x) => `- **WARN наведение перебито удерживающей анимацией**: ${x.target} — ${x.anim} (fill ${x.fill}) держит ${x.props.join(', ')}, правило «${x.rule}» не сработает`),
    `- появляются при прокрутке: ${rv.error ? `не посчитано (${rv.error})` : `${rv.revealed} блоков${rv.how && rv.how.length ? ` (${rv.how.map((h) => `${h.from} ×${h.count}`).join('; ')})` : ''}${rv.staticShift ? ` · ещё ${rv.staticShift} сдвинуты постоянно — не появления` : ''}${ea.movingSkipped ? ` · бесконечная анимация не в счёт (${ea.movingSkipped})` : ''}`}`,
    ...(d.hidden.length ? [`- невидимы после прокрутки: ${d.hidden.slice(0, 6).map((g) => `${g.count} × ${g.sig}${g.text ? ` «${g.text}»` : ''} — ${g.kind}`).join('; ')}${d.hidden.length > 6 ? `; ещё ${d.hidden.length - 6} групп` : ''}`] : ['- невидимых после прокрутки блоков нет']),
    `- элементов с переходами: ${mo.withTransitions} · закреплённые (${mo.stickyTotal}): ${mo.sticky.map((s) => `${s.el} (${s.position}${s.veil ? ', вуаль' : ''})`).join(', ') || 'нет'}${mo.stickyTotal > mo.sticky.length ? `, ещё ${mo.stickyTotal - mo.sticky.length}` : ''}`,
    `- уважает «меньше движения»: ${mo.reducedMotionRule ? 'правило есть' : 'НЕТ'} · плавная прокрутка: ${ea.smoothScroll ? 'да (html{scroll-behavior:smooth})' : 'нет'}`,
    `- меню/переключатели: ${it.toggles.length}${it.toggles.length ? ` (${it.toggles.map((x) => `\`${x.selector}\` ${x.how}`).join('; ')})` : ''} · диалоги: ${it.dialogs} · слайдеры: ${it.sliders} · вкладки: ${it.tabs} · аккордеоны: ${it.accordions}${accordionsLine(d.content.accordions)} · полей ввода: ${it.inputs} · ссылок ${it.links}, кнопок ${it.buttons}, якорей ${it.hashLinks}`, '');

  L.push('## Дизайн-система', '', design ? `Снята скиллом design-reference: \`${design}\` — переменные в \`.tokens.css\`, замеры в \`.json\`.` : designNote || 'Не снималась (нет скилла design-reference рядом или указан --no-design). Палитра и шрифты выше — только по замерам этой страницы.');
  if (tokenCheck && tokenCheck.length) {
    const bad = tokenCheck.filter((x) => x.share < 0.1);
    L.push('', `Цвета токенов по снимкам: ${tokenCheck.map((x) => `--${x.name} ${x.color} ${pctS(x.share)}`).join(', ')}.`);
    if (bad.length) L.push(`**WARN**: ${bad.map((x) => `--${x.name} ${x.color}`).join(', ')} — в CSS есть, на экране нет (меньше 0.1% пикселей): в вёрстку не брать, роль выбрать из видимых цветов.`);
  }
  const tt = extra.textureTokens;
  if (tt) L.push('', tt.written
    ? `Фактура: блок \`--grain-*\` (между texture:start и texture:end) ${tt.replaced ? 'заменён' : 'дописан'} в \`design/${tt.file}\` — ${tt.grain === 'есть' ? `зерно есть: opacity ${tt.opacity}, наложение ${tt.blend}, зерно ${tt.px} px, кадров ${tt.frames} × ${tt.frameMs} мс, с ширины ${tt.minWidth}px` : tt.grain === 'нет' ? 'зерна нет: --grain-opacity 0, слой выключен' : 'зерна нет там, где измерено, часть экранов не измерена: --grain-opacity 0, слой выключен — проверить глазами по вырезам 1:1'} (по экранам: ${Object.entries(tt.statuses || {}).map(([k, v]) => `${k} ${v}`).join(', ')}). Значения — рецепт из раздела «Фактура» выше; сборка берёт их отсюда.`
    : `Фактура: блок \`--grain-*\` в \`design/${tt.file}\` не дописан — ${tt.why}.`);
  else if (!design && extra.texResults && extra.texResults.length) L.push('', 'Фактура: блок `--grain-*` — в разделе «Фактура» выше (дизайн-системы нет, дописывать некуда).');
  L.push('');
  const pg = extra.pages; const moreTypes = pg ? (pg.tilda && pg.tilda.types ? pg.tilda.types.filter((x) => !x.self).length : pg.types.filter((x) => x.key !== '/').length) : 0;
  L.push('## Что дальше', '', '1. Открыть снимки и заполнить визуальный разбор по `reference/discovery.md` (язык дизайна, иерархия, приём, что сохранить). «Паспорт донора» и «Подписные приёмы» — рамка для своих решений.', '2. Прогнать `runtime.mjs` по всему, что зависит от JS: меню (селектор — в «Мобильном экране»), формы, слайдеры, холсты, появления.', '3. Составить матрицу «менять / не трогать» и план по приоритетам P0–P5 (`reference/analysis.md`).',
    ...(moreTypes ? [`4. Режим донора: у сайта ${moreTypes} других типов страниц (раздел «Страницы сайта по типам»)${extra.pageShots && extra.pageShots.length ? ' — открыть снимки из pages/' : ' — снять по одной странице каждого типа: тот же запуск с `--pages-shots N`'}, в analysis.md составить «тип страницы донора → что там → аналог у нас → совет» и спросить пользователя, какие страницы нужны, до плана.`] : []), '');
  return L.join('\n');
}

/* =====================================================================
   Запуск
   ===================================================================== */
const { pos, opt } = parseArgs(process.argv.slice(2), { values: ['out', 'viewports', 'viewport', 'scheme', 'tag', 'pages-shots'], flags: ['no-design', 'light', 'no-320', 'no-hover', 'no-texture', 'no-texture-module', 'keep-consent', 'no-clicks', 'no-pages', 'strict', 'help', 'h'], strict: true });
/* справка — первой, до любых проверок и побочных эффектов; короткий -h parseArgs отдаёт позиционным */
if (opt.help || opt.h || pos.includes('-h')) {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
  process.exit(0);
}
/* все проверки аргументов — до того, как на диске что-то появится */
const argFail = (msg) => { console.error(msg); process.exit(1); };
if (!pos[0]) argFail('Нужен адрес: node discover.mjs <url> [--out папка] [--viewports desktop,tablet,mobile] [--no-design] [--light] [--no-320] [--tag discover] [--strict] (--help — все флаги)');
const url = String(pos[0]);
let urlObj = null; try { urlObj = new URL(url); } catch { /* ниже — понятная ошибка */ }
if (!urlObj || !/^(https?|file):$/.test(urlObj.protocol)) argFail(`Неверный адрес «${url}»: нужен полный адрес с http://, https:// или file:// (например http://localhost:4177/)`);
for (const k of ['out', 'tag', 'scheme', 'viewports', 'viewport', 'pages-shots']) if (opt[k] === true) argFail(`У --${k} нет значения`);
const pagesShotsN = opt['pages-shots'] == null ? 0 : Number(opt['pages-shots']);
if (!Number.isInteger(pagesShotsN) || pagesShotsN < 0 || pagesShotsN > 50) argFail(`--pages-shots: «${opt['pages-shots']}» — нужно целое число типов страниц от 0 до 50`);
if (opt['no-pages'] && pagesShotsN > 0) argFail('--no-pages и --pages-shots вместе: снимки страниц строятся по таблице типов — оставьте один флаг');
if (opt.scheme != null && !/^(light|dark)$/.test(String(opt.scheme))) argFail(`--scheme: «${opt.scheme}» — можно light или dark`);
if (opt.viewports != null && opt.viewport != null && String(opt.viewports) !== String(opt.viewport)) argFail(`Указаны --viewports «${opt.viewports}» и --viewport «${opt.viewport}» — это один флаг, оставьте один`);
const vpSpec = opt.viewports != null ? opt.viewports : opt.viewport;
const viewports = pickViewports(vpSpec); /* неизвестный экран: pickViewports печатает список и выходит с кодом 1 */
if (!viewports.length) argFail(`Неизвестные экраны: ${vpSpec}`);
const has320 = viewports.some(([, vp]) => vp.width <= 320);
/* WARN из lib (свой стиль не вставился: строгий CSP) — собирать, а не печатать посреди «· desktop … ок»: в вердикт и discovery.json */
collectWarnings();
const run = ensureDir(runDir(opt, url));
const tag = String(opt.tag || 'discover');
const shotsDir = ensureDir(path.join(run, tag));

const browser = await launch();
const per = {}; const extra320 = {};
let pages = null; let pageShots = null;
/* что сделано на экране: окно cookie, аккордеоны и меню по клику — в строку прогресса */
const doneNote = (p) => {
  const x = [];
  if (p.consent && p.consent.found) x.push(p.consent.closed ? `cookie: закрыто «${p.consent.pick}»` : `cookie: НЕ закрыто${p.consent.why ? ` (${p.consent.why})` : ''}`);
  const gs = (p.content.accordions && p.content.accordions.groups) || [];
  if (gs.length) x.push(`аккордеонов: ${gs.map((g) => `${g.native ? 'details ' : ''}${g.count} (${g.skip ? `не проверен: ${g.skip}` : g.status || 'не проверен'})`).join(', ')}`);
  const tg = p.interactive.toggles || [];
  if (tg.length) x.push(`меню: ${tg[0].probe && tg[0].probe.opens ? 'открывается кликом' : tg[0].probe ? toggleProbeNote(tg[0].probe) : 'найдено'}`);
  return x.length ? `, ${x.join(', ')}` : '';
};
try {
  for (const [name, vp] of viewports) {
    process.stdout.write(`· ${name} ${vp.width}×${vp.height} … `);
    try { per[name] = await inspect(browser, url, name, vp, shotsDir, opt); console.log(`ок (${(per[name].took / 1000).toFixed(1)} с, ошибок в консоли ${per[name].log.consoleErrors.length}, исключений ${per[name].log.pageErrors.length}${doneNote(per[name])})`); }
    catch (e) { console.log(`сбой: ${e.message}`); per[name] = { error: e.message }; }
  }
  if (!opt['no-320'] && !has320) {
    const [[name, vp]] = pickViewports('mobile-s');
    process.stdout.write(`· ${name} ${vp.width}×${vp.height}, только переполнение … `);
    try { extra320[name] = await overflowPass(browser, url, name, vp, opt); console.log(`ок (${(extra320[name].took / 1000).toFixed(1)} с)`); }
    catch (e) { console.log(`сбой: ${e.message}`); extra320[name] = { error: e.message, width: vp.width }; }
  }
  /* страницы сайта по типам: ссылки всех экранов + /sitemap.xml; с --pages-shots — по снимку на тип */
  const goodNow = Object.fromEntries(Object.entries(per).filter(([, v]) => !v.error));
  if (!opt['no-pages'] && Object.keys(goodNow).length) {
    process.stdout.write('· страницы по типам (ссылки и sitemap.xml) … ');
    const sm = await fetchSitemap(urlObj).catch((e) => ({ url: null, error: String(e.message || e).slice(0, 80), urls: [] }));
    pages = pageTypes(url, goodNow, Object.keys(goodNow), sm);
    const byAddr = pages.types.filter((t) => t.key !== pages.self).length;
    console.log(`${byAddr} типов${sm ? (sm.error ? `, sitemap.xml: ${sm.error}` : `, sitemap.xml: ${sm.urls.length} адресов`) : ''}`);
    /* Tilda: адреса плоские (/abuse, /choi…) — шаблон адреса даёт тип на каждую страницу; типы — по подписи блоков
       (коды T-блоков по порядку, из голого HTML, без браузера: tilda.mjs pages) */
    const isTilda = Object.values(goodNow).some((p) => p.tilda && p.tilda.info && p.tilda.info.tilda);
    if (isTilda && /^https?:$/.test(urlObj.protocol)) {
      process.stdout.write('· типы страниц Tilda по подписи блоков (голый HTML, по одной) … ');
      const t0p = Date.now();
      try {
        const tp = await tildaPageTypes(url, { limit: 100, pause: 300 });
        const selfPath = (() => { const p = urlObj.pathname.replace(/\/+$/, ''); return p || '/'; })();
        pages.tilda = { found: tp.found, fetched: tp.fetched, skipped: tp.skipped, products: tp.products, errors: tp.errors.slice(0, 6), pagesArg: tp.pagesArg, byAddress: byAddr, seconds: Math.round((Date.now() - t0p) / 1000),
          types: tp.types.map((t) => ({ name: t.name, count: t.count, example: new URL(t.example, url).href, examples: t.examples, signature: t.signature, note: t.note || null, self: t.paths.includes(selfPath) })) };
        console.log(`${pages.tilda.types.length} типов по подписи блоков (по адресам было ${byAddr}; запрошено ${tp.fetched} из ${tp.found}, ${pages.tilda.seconds} с)`);
      } catch (e) { console.log(`сбой: ${String(e.message || e).slice(0, 120)}`); pages.tilda = { error: String(e.message || e).slice(0, 160), byAddress: byAddr }; }
    }
    if (pagesShotsN > 0) {
      const [vpName, vp] = viewports[0];
      const toShoot = pages.tilda && pages.tilda.types ? pages.tilda.types.filter((t) => !t.self).map((t) => ({ key: t.name, example: t.example })) : pages.types.filter((t) => t.key !== pages.self);
      pageShots = await shootPages(browser, toShoot, pagesShotsN, vpName, vp, ensureDir(path.join(run, 'pages')), opt);
    }
  }
} finally { await browser.close().catch(() => {}); }

const good = Object.fromEntries(Object.entries(per).filter(([, v]) => !v.error));
if (!Object.keys(good).length) { console.error('Ни один экран не снялся — адрес недоступен или браузер не поднялся.'); process.exit(1); }
const order = Object.keys(good);
/* экраны, которые не снялись: в сводку и в итог (FAIL) — иначе частичная разведка выглядит полной */
const failed = Object.fromEntries(Object.entries(per).filter(([, v]) => v.error).map(([k, v]) => [k, v.error]));

/* палитра по пикселям: first и full всех экранов (плюс серия прокрутки при --light нет) */
const shotFiles = order.flatMap((v) => [path.join(shotsDir, `${v}-first.png`), path.join(shotsDir, `${v}-full.png`)]);
const paletteColors = [...new Set(order.flatMap((v) => { const p = good[v].visual.palette; return [...p.backgrounds, ...p.text, ...p.ctaBackgrounds].map((x) => x.value); }).filter((c) => /^#[0-9A-F]{6}$/i.test(c)))];
const shares = await pixelShares(shotFiles, paletteColors).catch(() => null);
const texResults = order.map((v) => good[v].texture).filter((t) => t && t.source === 'texture.mjs');

const extra = { tag, extra320, failed, shares, texResults, tokenCheck: null, designNote: null, textureTokens: null, pages, pageShots, pagesShotsN, warnings: takeWarnings() };
const textureSource = opt['no-texture-module'] ? 'discover (запасной путь, --no-texture-module)' : texNote || 'texture.mjs';
const save = (design) => {
  writeJson(path.join(run, 'discovery.json'), { url, takenAt: new Date().toISOString(), shotsDir: tag, viewports: order, failedViewports: failed, per: good, extra320, pixelShares: shares, textureSource, design, tokenCheck: extra.tokenCheck, textureTokens: extra.textureTokens, pages: pages ? { ...pages, shots: pageShots } : null, warnings: extra.warnings });
  fs.writeFileSync(path.join(run, 'discovery.md'), writeSummary(url, run, good, design, order, extra));
};

/* D6: разведка на диске ДО дизайн-системы — если design-reference упадёт или завершит процесс, она уже есть */
extra.designNote = opt['no-design'] ? null : 'Снимается скиллом design-reference… Если этот текст остался — шаг дизайн-системы оборвался; палитра и шрифты выше — только по замерам этой страницы.';
save(null);

let design = null;
if (!opt['no-design']) {
  const extractPath = path.join(here, '..', '..', 'design-reference', 'scripts', 'extract.mjs');
  if (fs.existsSync(extractPath)) {
    process.stdout.write('· дизайн-система (design-reference) … ');
    const root = findModuleRoot('puppeteer-core');
    if (root && !process.env.DESIGN_REF_PROJECT) process.env.DESIGN_REF_PROJECT = root;
    try {
      trackModule(extractPath);
      const mod = await import(pathToFileURL(extractPath).href);
      const designDir = ensureDir(path.join(run, 'design'));
      const data = await mod.extract(url, { shotsDir: null, light: !!opt.light });
      /* протокол — через writeJson: поле generator (какой discover и какой extract сняли спецификацию); verify его не читает */
      writeJson(path.join(designDir, 'site.json'), data);
      const css = mod.tokensCss(data);
      fs.writeFileSync(path.join(designDir, 'site.tokens.css'), css);
      design = path.join(designDir, 'site');
      /* C2: цвета токенов подтверждаются пикселями на снимках */
      const toks = [...String(css).matchAll(/--(c-[\w-]+)\s*:\s*(#[0-9a-f]{6})\b/gi)].map((x) => ({ name: x[1], color: x[2].toUpperCase() }));
      const ts = toks.length ? await pixelShares(shotFiles, [...new Set(toks.map((x) => x.color))]).catch(() => null) : null;
      if (ts) extra.tokenCheck = toks.map((x) => ({ ...x, share: ts.shares[x.color] }));
      console.log('ок');
    } catch (e) { console.log(`пропущена: ${e.message}`); extra.designNote = `Шаг дизайн-системы не прошёл: ${String(e.message || e).slice(0, 200)}. Палитра и шрифты выше — только по замерам этой страницы.`; }
  } else extra.designNote = 'Скилла design-reference рядом нет — палитра и шрифты выше только по замерам этой страницы.';
}
/* G8: рецепт фактуры — в переменные дизайн-системы, чтобы сборка брала --grain-* отсюда, а не «на глаз» */
if (design) {
  extra.textureTokens = addTextureTokens(path.join(run, 'design', 'site.tokens.css'), texResults, opt);
  const tt = extra.textureTokens;
  console.log(tt.written ? `· фактура → design/site.tokens.css: блок --grain-* (${tt.grain === 'есть' ? `зерно есть, opacity ${tt.opacity}, ${tt.blend}` : `зерна ${tt.grain}, opacity 0`}${tt.replaced ? ', прежний блок заменён' : ''})` : `· фактура: блок --grain-* в design/site.tokens.css не дописан — ${tt.why}`);
}
extra.warnings = [...extra.warnings, ...takeWarnings()];
save(design);

/* вердикты в консоль */
const verdicts = [];
for (const w of extra.warnings) verdicts.push(['WARN', w]);
for (const [v, err] of Object.entries(failed)) verdicts.push(['FAIL', `экран ${v} не снялся: ${String(err).replace(/\n/g, ' ')}`]);
for (const v of order) {
  const p = good[v];
  if (p.overflow.verdict !== 'OK') verdicts.push([p.overflow.verdict, `переполнение ${v}: ${p.overflow.summary}`]);
  if (p.scroll.stuck) verdicts.push(['WARN', `прокрутка ${v}: страница не прокручивается — появления и снимки недостоверны`]);
  else if (!p.scroll.reachedBottom) verdicts.push(['WARN', `прокрутка ${v}: не доехали до низа (${p.scroll.maxScrollY} из ${p.scroll.pageHeight - (p.scroll.viewH ?? p.viewport.height)}px)`]);
  for (const x of p.motion.hoverConflicts) verdicts.push(['WARN', `${v}: наведение перебито удерживающей анимацией — ${x.target} ${x.anim} держит ${x.props.join(', ')}`]);
  for (const dg of (p.texture && p.texture.diagnosis) || []) verdicts.push(['WARN', `фактура ${v}: ${dg}`]);
}
for (const [v, p] of Object.entries(extra320)) {
  if (p.error) verdicts.push(['FAIL', `проход ${v} (${p.width || 320}px) не снялся: ${p.error} — переполнение на этой ширине не проверено`]);
  else if (p.overflow.verdict !== 'OK') verdicts.push([p.overflow.verdict, `переполнение ${v}: ${p.overflow.summary}`]);
}
/* фоны — по доле на снимках; заливки кнопок — по доле в коробках самих кнопок */
if (shares) { const ghost = paletteColors.filter((c) => shares.shares[c] < 0.1 && order.some((v) => good[v].visual.palette.backgrounds.some((x) => x.value === c))); if (ghost.length) verdicts.push(['WARN', `в CSS есть, на экране нет (<0.1% пикселей): ${ghost.join(', ')}`]); }
for (const v of order) {
  const vis = good[v].visual;
  const bad = vis.palette.ctaBackgrounds.map((x) => [x.value, fillShare(x, vis.btnShares)]).filter(([, b]) => b && b.share < FILL_MIN);
  if (bad.length) verdicts.push(['WARN', `${v}: заливка кнопок в CSS есть, в коробках кнопок почти не видна: ${bad.map(([c, b]) => `${c} ${b.share}%`).join(', ')}`]);
  const cn = good[v].consent;
  if (cn && cn.found && !cn.closed && !opt['keep-consent']) verdicts.push(['WARN', `${v}: окно согласия cookie не закрылось — ${cn.why || 'причина неизвестна'} (${cn.box}, ${cn.place}, ${cn.share}% экрана на снимках)`]);
}
for (const s of pageShots || []) {
  if (s.error) verdicts.push(['WARN', `страница типа ${s.key} не снялась: ${s.error}`]);
  else if (s.status >= 400) verdicts.push(['WARN', `страница типа ${s.key} ответила HTTP ${s.status}: ${s.example}`]);
}
if (extra.tokenCheck) { const bad = extra.tokenCheck.filter((x) => x.share < 0.1); if (bad.length) verdicts.push(['WARN', `токены цвета не видны на снимках: ${bad.map((x) => `--${x.name} ${x.color} ${pctS(x.share)}`).join(', ')}`]); }
if (verdicts.length) { console.log(''); for (const [vv, msg] of verdicts) console.log(`${vv.padEnd(5)} ${msg.slice(0, 300)}`); }
const nFail = verdicts.filter(([vv]) => vv === 'FAIL').length; const nWarn = verdicts.filter(([vv]) => vv === 'WARN').length;
console.log(`\nИтог: ${nFail || nWarn ? [nFail && `FAIL ${nFail}`, nWarn && `WARN ${nWarn}`].filter(Boolean).join(' · ') : 'OK'}${opt.strict ? ` (--strict: код выхода ${nFail ? 1 : 0})` : ''}`);
console.log(`Готово: ${run}\n  discovery.md — сводка, discovery.json — данные, ${tag}/ — снимки${design ? `, design/ — переменные${extra.textureTokens && extra.textureTokens.written ? ' (с блоком --grain-*)' : ''}` : ''}${pageShots && pageShots.length ? `, pages/ — по снимку на тип страницы (${pageShots.filter((s) => !s.error).length})` : ''}`);
if (opt.strict && nFail) process.exit(1);
