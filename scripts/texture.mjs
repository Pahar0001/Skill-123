#!/usr/bin/env node
/**
 * Фактура сайта двух видов. Зерно — мелкий шум слоем поверх страницы: найти слои зерна и
 * шума, снять их параметры, разобрать файл текстуры и измерить силу зерна числом. Крупная
 * фактура — светлая картинка-плитка в фоне (мятая бумага, камень с прожилками, холст):
 * найти её, снять плитку, размер показа, наложение по тону секций и силу на снимке. Всё —
 * у донора и у своей сборки одним и тем же способом; напечатать рецепт и переменные для
 * site.tokens.css; сравнить донора со сборкой по каждому экрану.
 *
 *   node texture.mjs <url> [--viewport desktop,tablet,mobile] [--out папка] [--screens 4]
 *                    [--label имя] [--json файл] [--tokens файл] [--css файл] [--md файл] [--extras] [--strict]
 *   node texture.mjs <texture.json> [--viewport desktop,mobile] [--tokens файл] [--css файл] [--md файл]
 *                    [--json файл]      рецепт и файлы по прошлому замеру: страница заново не открывается
 *   node texture.mjs compare <донор: url|texture.json> <сайт: url|texture.json>
 *                    [--viewport desktop,mobile] [--out папка] [--screens 4] [--sd-tol 0.2] [--lag-tol 0.15]
 *                    [--surface-tol 0.3]
 *   node texture.mjs --png снимок.png [--png2 через-250мс.png] [--png3 ещё.png]
 *                    [--without без-слоя.png] [--region x,y,w,h] [--json файл]
 *   node texture.mjs --tile файл.gif|png|webp|svg      разбор файла текстуры по всем кадрам
 *   node texture.mjs selftest [--no-browser]           самопроверка (то же: --selftest)
 *   node texture.mjs --help | --h | -h
 *
 * Режим <texture.json>: вместо адреса — texture.json прошлого замера (файл должен существовать
 * и кончаться на .json; массив результатов, { results: [...] } или один результат). Печатает
 * замеры, рецепт и блок переменных, пишет --tokens/--css/--md; --viewport оставляет только эти
 * экраны (нет таких — ошибка, код 1); texture.json пишется, только если задан --json;
 * --out, --screens, --label и --extras здесь не действуют. Путь на .json, которого нет, —
 * «нет файла <путь>», код 1 (и в compare); не адрес (http, https, file, data, about) и не .json — «Неверный адрес».
 * Аргументы, экраны и texture.json проверяются до создания папок и запуска браузера.
 *
 * Флаги:
 *   --viewport  экраны через запятую (пресеты lib.mjs или ШxВ@плотность); по умолчанию
 *               desktop,tablet,mobile — фактуру снимаем по каждому экрану отдельно (у донора
 *               зерно бывает только на широких). --viewports и --vp (старое имя) — то же самое
 *               во всех режимах: замер, texture.json, compare; разные значения у них — ошибка, код 1.
 *               В compare по умолчанию desktop,mobile.
 *   --strict    код выхода 1 при FAIL. FAIL даёт только compare («фактура не как у донора») — там
 *               код 1 и без флага; одиночный замер, --png и --tile выдают только OK и WARN, с --strict
 *               код 0. Ошибка замера или аргументов — всегда код 1.
 *   --out       папка для снимков, файлов текстур и texture.json
 *               (по умолчанию <папка прогона>/texture, см. runDir в lib.mjs).
 *   --screens   сколько экранов по высоте страницы снимать (4, равномерно, снимки ОКНА).
 *   --label     имя в файлах (по умолчанию адрес-экран).
 *   --json      куда записать итог (по умолчанию <out>/texture.json).
 *   --tokens    записать блок переменных --grain-* в файл (site.tokens.css): блок между
 *               /* texture:start *\/ и /* texture:end *\/ заменяется дословно (знаки «$&», «$'» в адресе
 *               страницы остаются как есть, «*\/» в адресе пишется как «*%2F»), иначе дописывается.
 *               Есть крупная фактура — в том же блоке ещё переменные --surface-* (нет её — блок прежний).
 *   --css       записать шаблон templates/grain.css с подставленными значениями рецепта; есть крупная
 *               фактура — ещё и templates/surface.css (есть только она, без зерна, — только surface.css).
 *   --md        записать раздел «Фактура (параметры для переноса)» для discovery.md (с подразделом
 *               «Крупная фактура» или строкой, что её нет).
 *   --extras    ещё вуали, псевдоэлементы, backdrop-filter, blend, градиенты, фоновые видео.
 *   --sd-tol    допуск σ в compare (0.2 = ±20 %), --lag-tol — допуск lag1 (0.15).
 *   --surface-tol  допуск силы крупной фактуры в compare (0.3 = ±30 %): плитки у донора и у сайта разные
 *               по рисунку, и на тех же числах яркости σ на участке гуляет шире, чем у зерна.
 *   --png/--png2/--png3/--without/--region  метрика по готовым снимкам (1:1, не уменьшенным).
 *   --tile      разбор файла текстуры: кадры, мс на кадр, σ, lag1, альфа, похож ли на шум, крупная ли это
 *               фактура (и почему нет), шов при повторе.
 *   --selftest  (или команда selftest) самопроверка: разбор файлов, участки, рецепт, сверка, разбор
 *               аргументов — без браузера; стенды со своей плиткой, с зерном, без фактуры — в браузере.
 *   --no-browser  selftest без стендов в браузере.
 *
 * Где ищется слой: имя файла фона/src (noise, grain, film, paper, dust…); feTurbulence в
 * data-URI, во встроенном <svg> или в фильтре filter:url(#…); любой большой fixed/absolute
 * элемент с pointer-events:none — div с фоном, img, picture, svg, canvas, video, ::before/::after —
 * если он полупрозрачный (итоговая opacity < 0.6), с режимом наложения или с шумом внутри;
 * повторяющаяся мелкая плитка в фоне body/секции, если её файл по разбору — шум.
 *
 * Метрика «сила зерна» σ: снимок ОКНА (не full: закреплённый слой есть только в верхнем
 * экране полностраничного снимка) → яркость Y (Rec.709) → плитки 32×32 → из плитки вычитается
 * плоскость (а не размытие 7×7 — оно занижает крупное зерно) → стандартное отклонение остатка.
 * Берутся только РОВНЫЕ плитки: если слой найден, ровность решает снимок того же места БЕЗ слоя
 * (там зерна нет, порог абсолютный); если слоя нет — порог относительный (растёт с силой и
 * размером зерна) плюс форма распределения (текст и края отсекаются). Полосы фона: тёмная
 * (Y<60), средняя, светлая (Y>190) — режимы наложения ведут себя на них по-разному.
 *   σ       — сила зерна в уровнях 0..255 (5 видно глазом на чёрном; <1 — зерна нет);
 *   lag1    — связь соседних пикселей остатка: ~0 — зерно в 1 px, 0.5 — 2 px, 0.67 — 3 px;
 *   вклад   — σ разности «со слоем − без слоя» на тех же плитках, подъём — средняя разность;
 *   кипение — разность двух снимков одного места через 250 мс (и ещё через 120), /√2:
 *             ≈ σ — кадры независимы, 0 — зерно стоит. Снимки отвечают только «кипит / нет»;
 *             частота берётся из файла (кадры и задержки GIF/WebP) или из @keyframes.
 * Меньше 10 ровных плиток в полосе — «не измерено», а не «зерна нет».
 * Проход «без слоя»: слой прячется через visibility; если зерно лежит в фоне body или секции
 * с содержимым — из background-image убирается только картинка шума, содержимое остаётся.
 * Строгий CSP (style-src без 'unsafe-inline'): вставленный <style> страница молча не применяет, и
 * «без слоя» снимался бы со слоем (вклад 0, ложное «зерна нет») — поэтому стиль тогда ставится
 * сконструированной таблицей document.adoptedStyleSheets (CSP на неё не распространяется), в выводе
 * строка «слой спрятан таблицей adoptedStyleSheets». Не вышло и так — WARN «проход без слоя не сделан»,
 * σ по снимкам со слоем.
 * Сравнение донора и сборки — только при одинаковом экране и DPR.
 *
 * Правила режимов наложения (замер lab.mjs аудита, проверен независимо):
 *   normal, hard-light, luminosity — одинаковая сила на любом фоне; normal поднимает чёрный на
 *   ≈ opacity×127; multiply, overlay, soft-light гаснут на тёмных фонах (Y до ~50), overlay и
 *   soft-light — ещё и на светлых (годятся только для средних тонов); screen гаснет на светлом.
 *   opacity = нужная σ / σ плитки (своя плитка grain-tile.mjs: σ 78.3 → σ 5 при .064).
 *   feTurbulence не запрещён — его силу надо мерить (альфа фильтра часто около 0.3).
 *
 * Крупная фактура (01.10.2026; образец — zakroma.rest: «фон не просто белый, а с прожилками и мятостями»).
 * Раньше её плитка texture.webp находилась по имени, но шла как слой зерна, а итог был «зерна нет —
 * слой не нужен». Теперь это свой вид фактуры, наряду с зерном:
 *   где ищется — файл найденного слоя (по имени, вуаль, плитка), а ещё картинка в фоне любого большого
 *     блока и картинка-подложка (img с position absolute или fixed); имя и размер фона любые (auto, 880px,
 *     cover). Кандидаты из фонов в layers не идут (их читают discover, a11y и perf) — отдельный список;
 *   что решает — разбор файла (пороги SURFACE, замерены на образце и своих плитках): σ яркости 0.8…12,
 *     связь соседних пикселей lag1 ≥ 0.8 по обеим осям и на 3–6 px ≥ 0.5, непрозрачная, сторона от 64 px,
 *     детали по всей площади (14 из 16 частей), нет общего уклона (не градиент), цвет не гуляет. Шум,
 *     фотография, градиент, бледный рисунок и мелкий узор не проходят — причина пишется;
 *   как меряется — проход «без крупной фактуры»: картинка убирается из фона всех блоков, где стоит (и с
 *     карточек), зерно при этом остаётся; вклад «с плиткой − без» считается на ровных участках 128 px
 *     (где их мало — 64 px) по полосам фона: σ участка — мелкие детали и перепад между плитками 32 px
 *     вместе. «Есть» — σ от 0.6. Зерно на такой странице меряется по снимку без плитки, иначе прожилки
 *     сошли бы за зерно;
 *   что в итоге — вердикт «крупная фактура: есть / нет / не измерено», плитка (размер, яркость ± σ, шов),
 *     по каждому слою: фон блока или слой поверх, тон секции под ним, наложение, размер показа, сила, где
 *     выключен (@media); рецепт: период показа, наложение для светлых и для тёмных полей (граница —
 *     яркость поля 130, см. SURFACE_DARK_Y), цель для своей плитки surface-tile.mjs, переменные --surface-*;
 *   в texture.json — поле surface у каждого результата и recipe.surface; старые поля не тронуты. Слои
 *     крупной фактуры лежат в surface.layers, в layers — только зерно;
 *   compare — строки «крупная фактура» (есть / нет), «фактура σ» по полосам ±surface-tol, «наложение».
 *     FAIL — у одного есть, у другого нет, или σ мимо допуска; режим наложения сам FAIL не даёт. Нет её ни
 *     у кого — строк нет. Замер донора старой версии — WARN «перемерить».
 *
 * Экспорт для других скриптов (discover.mjs, a11y.mjs): findTextureLayers, TEXTURE_LAYERS_FN,
 * hideTextureLayers, showTextureLayers, measureTexture, textureOnUrl, analyzeTile, measurePng,
 * grainTiles, summarize, lumaOf, blendAdvice, recipeFrom, tokensBlock, fillGrainCss,
 * textureMarkdown, compareTexture, compareSets, TILE_SD, setPageStyle, dropPageStyle (свой стиль и при
 * строгом CSP), CSP_NO_STYLE; для крупной фактуры — SURFACE, SURFACE_MIN_SD, SURFACE_MIN_BLOCKS,
 * SURFACE_DARK_Y, SEAM_WARN, SEAM_FAIL, seamOf, surfaceBandOf, surfaceRecipe, fillSurfaceCss,
 * compareSurface. Описание — в комментариях у функций.
 *
 * Коды выхода: 0 — готово (одиночный замер — при любых WARN); 1 — compare с FAIL, неверные аргументы
 * (экран, адрес, нет файла, флаг без значения), ошибка замера (FAIL texture.mjs: …) или провал в selftest;
 * 2 — у compare не два аргумента.
 *
 * Чужой файл текстуры (noise.gif, texture.webp донора) сохраняется в --out ТОЛЬКО для замера: на сайт он
 * не переносится никогда, своя плитка — grain-tile.mjs (зерно) и surface-tile.mjs (крупная фактура).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launch, openPage, loadSharp, parseArgs, sleep, ensureDir, writeJson, readJson, runDir, slugFromUrl,
  scrollThrough, forceInstantScroll, scrollToY, screenSegment, segmentPositions, pickViewports, resolveViewport,
  SIG_FN, EFFECTIVE_OPACITY_FN, addStyleSafe, removeStyleSafe, collectWarnings, takeWarnings,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, '..', 'templates', 'grain.css');
const TEMPLATE_SURFACE = path.join(HERE, '..', 'templates', 'surface.css');

let sharpMod;
function needSharp() {
  if (sharpMod === undefined) sharpMod = loadSharp() || null;
  if (!sharpMod) throw new Error('нужен sharp: npm i sharp --prefix ~/.claude/site-rework (или запускать из папки проекта, где он есть)');
  return sharpMod;
}

const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const median = (a) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const quant = (a, p) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

/** σ своей плитки grain-tile.mjs (256 px, 16 уровней, серая, seed 7) — проверено запуском: 78.35. */
export const TILE_SD = 78.35;
/** Меньше стольких ровных плиток в полосе — «не измерено». */
export const MIN_TILES = 10;
/** Порог «зерно есть» по σ, уровней. */
export const GRAIN_MIN_SD = 1;

/* ======================================================================
   1. Поиск слоёв на странице
   ====================================================================== */

/* Функция страницы. Свободные переменные eff и sig подставляются из lib.mjs
   (EFFECTIVE_OPACITY_FN, SIG_FN) — см. TEXTURE_LAYERS_FN ниже. */
function textureLayersInPage(opts) {
  const o = opts || {};
  const minW = o.minW || 0.6, minH = o.minH || 0.4;
  const vw = innerWidth, vh = innerHeight;
  const TEX = /noise|grain|grit|texture|dust|film|paper|scratch|шум|зерн/i;
  const MEDIA = { img: 1, picture: 1, svg: 1, canvas: 1, video: 1 };
  const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const isData = (u) => /^data:/i.test(u);
  const turbIn = (u) => isData(u) && /feTurbulence/i.test(dec(u));
  const nameNoise = (u) => { if (!u || isData(u)) return false; let p = u; try { p = new URL(u, location.href).pathname; } catch (e) { /* как есть */ } return TEX.test(dec(p)); };
  /* верхнеуровневые запятые: «url("a,b"), linear-gradient(red, blue)» → 2 части */
  const splitTop = (str) => {
    const out = []; let depth = 0, q = null, cur = ''; const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { cur += ch; if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const urlOf = (item) => { const m = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*?))\s*\)/.exec(item || ''); return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] || '').replace(/\\(.)/g, '$1') : null; };
  const short = (u) => (isData(u) ? u.slice(0, 48) + '…(' + u.length + ' симв.)' : u.length > 160 ? u.slice(0, 160) + '…' : u);
  const msOf = (t) => { const n = parseFloat(t); return /ms$/.test(t) ? n : n * 1000; };

  /* SVG-фильтры с feTurbulence: id → параметры */
  const turb = new Map();
  for (const t of document.querySelectorAll('feTurbulence')) {
    const f = t.closest('filter'); const fa = f && f.querySelector('feFuncA');
    const key = (f && f.id) || ('#анон' + turb.size);
    turb.set(key, { baseFrequency: t.getAttribute('baseFrequency'), numOctaves: t.getAttribute('numOctaves'), type: t.getAttribute('type') || 'turbulence', filterId: (f && f.id) || null, alphaTable: fa ? (fa.getAttribute('tableValues') || fa.getAttribute('type') || '') : null, usedBy: [] });
  }
  const filterTurb = (css) => { const m = /url\(\s*["']?[^"')#]*#([^"')\s]+)["']?\s*\)/.exec(css || ''); return m ? turb.get(m[1]) || null : null; };

  /* правила внутри @media: для каждого слоя — при каких условиях он задан; off — правило слой выключает
     (display: none, картинка фона убрана…): так видно, где фактура снята, а не только где упомянута */
  const media = []; let unreadable = 0;
  const offOf = (st) => {
    if (!st) return null;
    if (st.display === 'none') return 'display: none';
    if (st.visibility === 'hidden') return 'visibility: hidden';
    if (st.opacity === '0') return 'opacity: 0';
    if (st.backgroundImage === 'none') return 'background-image: none';
    if (st.content === 'none') return 'content: none';
    return null;
  };
  const walk = (rules, conds) => {
    for (const r of rules) {
      if (media.length > 30000) return;
      if (r.type === 4) walk(r.cssRules, conds.concat(r.conditionText || (r.media && r.media.mediaText) || ''));
      else if (r.type === 1) { if (conds.length) media.push({ sel: r.selectorText, cond: conds.join(' and '), off: offOf(r.style) }); }
      else if (r.type !== 7 && r.cssRules) walk(r.cssRules, conds);
    }
  };
  for (const ss of document.styleSheets) { let rs = null; try { rs = ss.cssRules; } catch (e) { unreadable++; continue; } if (rs) walk(rs, []); }
  const mediaHit = (m, el, pseudo) => {
    for (const part of m.sel.split(',')) {
      let p = part.trim(); const pm = /::?(before|after)\s*$/i.exec(p);
      if (pseudo ? !(pm && '::' + pm[1].toLowerCase() === pseudo) : pm) continue;
      p = p.replace(/::?(before|after)\s*$/i, '').trim() || '*';
      let ok = false; try { ok = el.matches(p); } catch (e) { /* селектор не для matches */ }
      if (ok) return true;
    }
    return false;
  };
  const mediaFor = (el, pseudo) => {
    const out = [];
    for (const m of media) {
      if (!m.sel) continue;
      if (mediaHit(m, el, pseudo) && !out.includes(m.cond)) out.push(m.cond);
      if (out.length >= 6) break;
    }
    return out;
  };
  /* где слой выключен: условия @media, при которых правило для него прячет его или убирает картинку фона */
  const mediaOffFor = (el, pseudo) => {
    const out = [];
    for (const m of media) {
      if (!m.sel || !m.off) continue;
      if (mediaHit(m, el, pseudo) && !out.some((x) => x.cond === m.cond)) out.push({ cond: m.cond, how: m.off });
      if (out.length >= 4) break;
    }
    return out;
  };
  /* @keyframes: имя → { css, offsets } */
  const kfCache = {};
  const keyframes = (name) => {
    if (name in kfCache) return kfCache[name];
    let res = null;
    const visit = (rules) => { for (const r of rules) { if (res) return; if (r.type === 7 && r.name === name) { const offs = []; for (const k of r.cssRules) for (const t of String(k.keyText).split(',')) { const x = t.trim(); offs.push(x === 'from' ? 0 : x === 'to' ? 100 : parseFloat(x)); } res = { css: r.cssText.replace(/\s+/g, ' ').slice(0, 900), offsets: [...new Set(offs)].sort((a, b) => a - b) }; } else if (r.type !== 7 && r.cssRules) visit(r.cssRules); } };
    for (const ss of document.styleSheets) { if (res) break; try { visit(ss.cssRules); } catch (e) { /* чужой домен */ } }
    kfCache[name] = res; return res;
  };
  const animsOf = (s, who) => {
    if (!s.animationName || s.animationName === 'none') return [];
    const names = splitTop(s.animationName), durs = splitTop(s.animationDuration), tfs = splitTop(s.animationTimingFunction), its = splitTop(s.animationIterationCount), ps = splitTop(s.animationPlayState || 'running');
    return names.map((n, i) => { const kf = keyframes(n); return { on: who, name: n, durationMs: msOf(durs[i % durs.length] || '0s'), timing: tfs[i % tfs.length] || 'ease', iterations: its[i % its.length] || '1', playState: ps[i % ps.length] || 'running', offsets: kf ? kf.offsets : null, css: kf ? kf.css : null }; }).filter((a) => a.name !== 'none');
  };

  const layers = []; let k = 0; let tileCands = 0;
  const small = new Map(); /* мелкие элементы с шумом (иконки, кнопки, карточки) — не слои, только сводка */
  const asLayer = new Set();
  /* кандидаты в крупную фактуру — отдельным списком, не в layers: discover, a11y и perf читают layers как слои
     зерна и вуали, а фон секции с картинкой (или первый экран с фотографией) таким слоем не является */
  const surfCands = []; const surfSeen = new Set();
  const all = [document.documentElement, ...document.querySelectorAll('body, body *')];
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (el instanceof SVGElement && tag !== 'svg') continue;
    if (tag === 'svg' && el.parentElement && el.parentElement.closest('svg')) continue;
    /* <img> внутри <picture>, который уже слой, — тот же слой */
    if (tag === 'img' && el.parentElement && el.parentElement.tagName === 'PICTURE' && asLayer.has(el.parentElement)) continue;
    const base = getComputedStyle(el);
    if (base.display === 'none') continue;
    for (const pseudo of [null, '::before', '::after']) {
      if (pseudo && MEDIA[tag]) continue;
      const s = pseudo ? getComputedStyle(el, pseudo) : base;
      if (pseudo && (s.content === 'none' || s.content === 'normal' || s.display === 'none')) continue;
      const bg = s.backgroundImage || 'none';
      const items = bg === 'none' ? [] : splitTop(bg);
      const urls = items.map(urlOf).filter(Boolean);
      let src = null;
      if (!pseudo) {
        if (tag === 'img') src = el.currentSrc || el.src || null;
        else if (tag === 'picture') { const i = el.querySelector('img'); src = i ? i.currentSrc || i.src : null; }
        else if (tag === 'video') src = el.currentSrc || el.src || el.poster || null;
      }
      const allUrls = src ? urls.concat(src) : urls;
      const reason = [];
      const noiseUrls = allUrls.filter((u) => nameNoise(u) || turbIn(u));
      if (allUrls.some(nameNoise)) reason.push('имя');
      if (allUrls.some(turbIn)) reason.push('feTurbulence');
      let svg = null;
      if (!pseudo && tag === 'svg') {
        const t = el.querySelector('feTurbulence');
        const ref = [...el.querySelectorAll('[filter]')].map((n) => filterTurb(n.getAttribute('filter'))).find(Boolean) || [...el.querySelectorAll('*')].slice(0, 200).map((n) => filterTurb(getComputedStyle(n).filter)).find(Boolean);
        const inf = ref || (t ? turb.get((t.closest('filter') || {}).id) : null) || (t ? { baseFrequency: t.getAttribute('baseFrequency'), numOctaves: t.getAttribute('numOctaves'), type: t.getAttribute('type'), alphaTable: null, usedBy: [] } : null);
        if (inf) { svg = { baseFrequency: inf.baseFrequency, numOctaves: inf.numOctaves, type: inf.type, alphaTable: inf.alphaTable }; reason.push('feTurbulence'); if (inf.usedBy) inf.usedBy.push(sig(el)); }
      }
      const fT = filterTurb(s.filter);
      if (fT) { svg = svg || { baseFrequency: fT.baseFrequency, numOctaves: fT.numOctaves, type: fT.type, alphaTable: fT.alphaTable }; if (!reason.includes('feTurbulence')) reason.push('feTurbulence'); fT.usedBy.push(sig(el) + (pseudo || '')); }

      const er = el.getBoundingClientRect();
      let r = er;
      if (pseudo) {
        const px = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
        r = s.position === 'fixed' ? { x: px(s.left, 0), y: px(s.top, 0), width: px(s.width, vw), height: px(s.height, vh) }
          : { x: er.x + (s.position === 'absolute' ? px(s.left, 0) : 0), y: er.y + (s.position === 'absolute' ? px(s.top, 0) : 0), width: px(s.width, er.width), height: px(s.height, er.height) };
      }
      const big = r.width >= vw * minW && r.height >= vh * minH;
      /* слой — только заметный по площади: 0×0-svg с определением фильтра, иконка с feTurbulence или
         кнопка с «шумным» фоном идут в сводку small, а не в слои (их не прячут на проходе «без слоя») */
      const sizeOk = r.width * r.height >= 0.1 * vw * vh || (r.width >= vw * minW && r.height >= 100);
      if (reason.length && !sizeOk) {
        const key = sig(el).replace(/#[^.]+/, '') + (pseudo || '') + '|' + reason.join(',');
        const e = small.get(key);
        if (e) e.count++; else if (small.size < 12) small.set(key, { el: sig(el) + (pseudo || ''), reason: reason.slice(), w: Math.round(r.width), h: Math.round(r.height), count: 1 });
        continue;
      }
      const visualish = urls.length > 0 || (!pseudo && !!MEDIA[tag]) || !!svg;
      const veilCand = big && s.pointerEvents === 'none' && visualish;

      /* мелкая повторяющаяся плитка в фоне большого блока без «шумного» имени — решит разбор файла */
      const tileUrls = [];
      if (!reason.length && urls.length && r.width >= vw * minW && r.height >= 100 && tileCands < 8) {
        const reps = splitTop(s.backgroundRepeat), sizes = splitTop(s.backgroundSize);
        items.forEach((it, i) => {
          const u = urlOf(it); if (!u || (isData(u) && !/^data:image\/(png|gif|webp|jpeg|svg)/i.test(u))) return;
          const rep = reps[i % reps.length] || 'repeat'; if (/no-repeat/.test(rep) && !/repeat-[xy]/.test(rep)) return;
          const sz = sizes[i % sizes.length] || 'auto'; if (/cover|contain|%/.test(sz)) return;
          const nums = (sz.match(/[\d.]+px/g) || []).map(parseFloat); if (nums.some((n) => n > 512)) return;
          tileUrls.push(u);
        });
      }
      /* крупная фактура (мятая бумага, камень, холст) лежит картинкой в фоне большого блока или картинкой-
         подложкой; имя у файла любое, размер фона любой (auto, 880px, cover). Фактура это или фотография —
         решит разбор файла (measureTexture): здесь только кандидат. Не больше 6 разных файлов на страницу */
      let surfUrl = null;
      if (!reason.length && r.width >= vw * minW && r.height >= 100 && surfCands.length < 24) {
        if (!pseudo && tag === 'img') { if ((s.position === 'absolute' || s.position === 'fixed') && src && !isData(src)) surfUrl = src; }
        else for (const it of items) { const u = urlOf(it); if (u && (!isData(u) || /^data:image\/(png|gif|webp|jpeg)/i.test(u))) { surfUrl = u; break; } }
        if (surfUrl && !surfSeen.has(surfUrl) && surfSeen.size >= 6) surfUrl = null;
      }
      if (!reason.length && !veilCand && !tileUrls.length && !surfUrl) continue;

      /* дорогое — только у кандидатов: цепочка предков, итоговая прозрачность */
      let fixedBy = pseudo && s.position === 'fixed' ? sig(el) + pseudo : null;
      const blendChain = []; const chainAnims = [];
      for (let p = pseudo ? el : el.parentElement; p && p.nodeType === 1; p = p.parentElement) {
        const ps = p === el ? base : getComputedStyle(p);
        if (ps.mixBlendMode && ps.mixBlendMode !== 'normal') blendChain.push(sig(p) + ':' + ps.mixBlendMode);
        if (!fixedBy && ps.position === 'fixed') fixedBy = sig(p);
        if (chainAnims.length < 4) chainAnims.push(...animsOf(ps, sig(p)).filter((a) => a.iterations === 'infinite'));
      }
      const own = parseFloat(s.opacity);
      const effO = Math.round(eff(el) * (pseudo ? own : 1) * 1000) / 1000;
      const positioned = s.position === 'fixed' || s.position === 'absolute' || !!fixedBy;
      let maybe = false;
      if (veilCand && positioned) {
        if (effO < 0.6 || s.mixBlendMode !== 'normal' || blendChain.length > 0 || !!svg) { reason.push('вуаль'); if (s.mixBlendMode !== 'normal' || blendChain.length) reason.push('режим наложения'); }
        else if (!reason.length && (!pseudo && (tag === 'img' || tag === 'picture' || tag === 'canvas' || tag === 'video') || urls.length)) {
          /* непрозрачный слой поверх страницы: шум может быть в альфе самих пикселей (холст, PNG) —
             решит разбор файла или разность снимков «со слоем − без» (measureTexture) */
          reason.push('поверх страницы'); maybe = true;
        }
      }
      if (!reason.length && tileUrls.length) { reason.push('плитка'); maybe = true; tileCands++; }
      /* ни шум, ни вуаль, ни мелкая плитка — остаётся кандидат в крупную фактуру (или ничего) */
      const cand = !reason.length && !!surfUrl;
      if (!reason.length && !cand) continue;
      if (cand) { reason.push('фон'); maybe = true; surfSeen.add(surfUrl); }
      if (!pseudo && !cand) asLayer.add(el);
      const hideUrls = cand ? [surfUrl] : noiseUrls.length ? noiseUrls.slice() : maybe ? (tileUrls.length ? tileUrls.slice() : urls.slice()) : [];
      /* какой файл разбирать: шумный по имени, иначе плитка, иначе src картинки или первый фон вуали */
      const fileUrl = cand ? surfUrl : noiseUrls[0] || tileUrls[0] || src || urls[0] || null;

      const hasContent = !pseudo && (el === document.body || el === document.documentElement || el.children.length > 0 || (el.textContent || '').trim().length > 0);
      const kind = pseudo ? 'background' : MEDIA[tag] ? tag : urls.length ? 'background' : fT ? 'filter' : 'background';
      let hide = 'visibility';
      if (hasContent && kind === 'background' && hideUrls.length) hide = 'background';
      else if (hasContent && kind === 'filter') hide = 'filter';
      /* у кандидата своя метка: по data-rw-tex discover, a11y и perf узнают слой зерна или вуаль */
      const markAttr = cand ? 'data-rw-surf' : 'data-rw-tex';
      if (o.mark) el.setAttribute(pseudo ? markAttr + '-' + pseudo.slice(2) : markAttr, String(k));
      const anims = animsOf(s, 'сам');
      const kfs = {}; for (const a of anims.concat(chainAnims)) if (a.css) kfs[a.name] = a.css;
      (cand ? surfCands : layers).push({
        k: k++, el: sig(el), pseudo, tag, kind, reason, ...(maybe ? { maybe: true } : {}), ...(cand ? { mark: markAttr } : {}), hide,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        coversViewport: r.width >= vw * 0.95 && r.height >= vh * 0.95,
        position: s.position, fixedBy, zIndex: s.zIndex, pointerEvents: s.pointerEvents,
        opacity: own, effectiveOpacity: effO, mixBlendMode: s.mixBlendMode, blendChain,
        backgroundImage: bg.length > 240 ? bg.slice(0, 240) + '…' : bg, urls: allUrls.map(short), noiseUrls: noiseUrls.map(short),
        hideUrls, fileUrl,
        backgroundSize: s.backgroundSize, backgroundRepeat: s.backgroundRepeat, backgroundPosition: s.backgroundPosition, backgroundColor: s.backgroundColor,
        /* режим наложения картинки на цвет фона того же блока (у слоя поверх страницы его роль играет mixBlendMode) */
        backgroundBlendMode: s.backgroundBlendMode, backgroundAttachment: s.backgroundAttachment,
        imageRendering: s.imageRendering, svg,
        animation: anims.length ? anims.map((a) => `${a.name} ${a.durationMs}ms ${a.timing} ${a.iterations}`).join(', ') : null,
        anims, animsChain: chainAnims, animChain: chainAnims.map((a) => `${a.on}: ${a.name} ${a.durationMs}ms ${a.timing} ${a.iterations}`), keyframes: kfs,
        mediaRules: mediaFor(el, pseudo), mediaOff: mediaOffFor(el, pseudo), filter: s.filter, transform: s.transform,
      });
    }
  }
  const pseudoUsed = (p) => { const s = getComputedStyle(document.body, p); return !(s.content === 'none' || s.content === 'normal'); };
  const res = {
    vw, vh, dpr: devicePixelRatio, bodyBg: getComputedStyle(document.body).backgroundColor, scrollY: Math.round(scrollY),
    marked: !!o.mark, layers, svgNoise: [...turb.values()], small: [...small.values()], bodyAfterUsed: pseudoUsed('::after'), bodyBeforeUsed: pseudoUsed('::before'),
    unreadableSheets: unreadable, surfaceCands: surfCands,
  };

  if (o.extras) {
    /* прочая «фактура» (прототип texture-probe аудита): для раздела discovery.md */
    const gradKind = (b) => b.match(/(repeating-)?(linear|radial|conic)-gradient/g) || [];
    const ex = { overlays: [], pseudo: [], backdrop: [], blend: [], filters: [], masks: [], gradients: [], videos: [], textFx: [], bgImages: [] };
    for (const el of all) {
      if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') continue;
      const s = getComputedStyle(el); if (s.display === 'none') continue;
      const r = el.getBoundingClientRect(); const area = Math.min(r.width, vw) * Math.min(r.height, vh);
      const bgU = splitTop(s.backgroundImage === 'none' ? '' : s.backgroundImage).map(urlOf).filter(Boolean);
      const big = r.width >= vw * 0.8 && r.height >= vh * 0.8;
      if ((s.position === 'fixed' || s.position === 'absolute') && big && (bgU.length || gradKind(s.backgroundImage).length || s.mixBlendMode !== 'normal' || (s.backdropFilter && s.backdropFilter !== 'none') || !/rgba\(0, 0, 0, 0\)/.test(s.backgroundColor))) {
        ex.overlays.push({ el: sig(el), position: s.position, zIndex: s.zIndex, pointerEvents: s.pointerEvents, opacity: eff(el), blend: s.mixBlendMode, bg: bgU.map(short).concat(gradKind(s.backgroundImage)), bgColor: s.backgroundColor });
      }
      for (const pe of ['::before', '::after']) {
        const ps = getComputedStyle(el, pe); if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
        const pU = splitTop(ps.backgroundImage === 'none' ? '' : ps.backgroundImage).map(urlOf).filter(Boolean); const g = gradKind(ps.backgroundImage);
        const hasBg = pU.length || g.length || !/rgba\(0, 0, 0, 0\)|transparent/.test(ps.backgroundColor);
        if (!hasBg && ps.mixBlendMode === 'normal' && (!ps.backdropFilter || ps.backdropFilter === 'none')) continue;
        ex.pseudo.push({ el: sig(el) + pe, position: ps.position, zIndex: ps.zIndex, opacity: parseFloat(ps.opacity), blend: ps.mixBlendMode, bg: pU.map(short).concat(g), size: ps.backgroundSize, pointerEvents: ps.pointerEvents });
      }
      if (r.width === 0 || r.height === 0) continue;
      if (s.backdropFilter && s.backdropFilter !== 'none') ex.backdrop.push({ el: sig(el), filter: s.backdropFilter, bg: s.backgroundColor, radius: s.borderTopLeftRadius, w: Math.round(r.width), h: Math.round(r.height) });
      if (s.mixBlendMode !== 'normal') ex.blend.push({ el: sig(el), mode: s.mixBlendMode, position: s.position });
      if (s.filter !== 'none') ex.filters.push({ el: sig(el), filter: s.filter.slice(0, 80) });
      if ((s.maskImage && s.maskImage !== 'none') || s.clipPath !== 'none') ex.masks.push({ el: sig(el), mask: (s.maskImage || '').slice(0, 60), clip: s.clipPath.slice(0, 60) });
      const g = gradKind(s.backgroundImage); if (g.length && area > 4000) ex.gradients.push({ el: sig(el), kinds: g.join('+'), area: Math.round(area), css: s.backgroundImage.slice(0, 120) });
      if (bgU.length && area > 2000) ex.bgImages.push({ el: sig(el), src: bgU.map(short).join(', '), size: s.backgroundSize, repeat: s.backgroundRepeat, attachment: s.backgroundAttachment, area: Math.round(area) });
      if (el.tagName === 'VIDEO') ex.videos.push({ el: sig(el), autoplay: el.autoplay, muted: el.muted, loop: el.loop, controls: el.controls, w: Math.round(r.width), h: Math.round(r.height), background: el.autoplay && el.muted && !el.controls && r.width > vw * 0.5 });
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (ownText && ((s.textShadow !== 'none') || parseFloat(s.webkitTextStrokeWidth) > 0 || s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text')) ex.textFx.push({ el: sig(el), shadow: s.textShadow.slice(0, 60), stroke: s.webkitTextStrokeWidth, clip: s.backgroundClip });
    }
    const dedupe = (list, key, n) => { const m = new Map(); for (const x of list) { const kk = key(x); const e = m.get(kk); if (e) e.count++; else m.set(kk, { ...x, count: 1 }); } return [...m.values()].slice(0, n); };
    ex.pseudo = dedupe(ex.pseudo, (x) => x.el.replace(/#[^.:]+/, '') + x.bg.join(), 12);
    ex.gradients = dedupe(ex.gradients.sort((a, b) => b.area - a.area), (x) => x.css, 8);
    ex.bgImages = dedupe(ex.bgImages.sort((a, b) => b.area - a.area), (x) => x.size + x.repeat + x.src, 8);
    ex.textFx = dedupe(ex.textFx, (x) => x.shadow + x.stroke + x.clip, 6);
    ex.filters = dedupe(ex.filters, (x) => x.filter, 8);
    ex.blend = dedupe(ex.blend, (x) => x.mode + x.position, 8);
    ex.masks = ex.masks.slice(0, 8); ex.backdrop = ex.backdrop.slice(0, 8); ex.overlays = ex.overlays.slice(0, 10);
    res.extras = ex;
  }
  return res;
}

/**
 * Самодостаточный исходник функции страницы (opts) => Found — для page.evaluate:
 *   await page.evaluate(`(${TEXTURE_LAYERS_FN})(${JSON.stringify({ extras: true })})`)
 */
export const TEXTURE_LAYERS_FN = `((eff, sig) => ${textureLayersInPage.toString()})(${EFFECTIVE_OPACITY_FN}, ${SIG_FN})`;

/**
 * Слои фактуры на открытой странице. { mark = false, extras = false, minW = 0.6, minH = 0.4 }.
 * mark: true — ставит data-rw-tex(-before|-after)="k" (нужно hideTextureLayers); иначе DOM не меняется.
 * Звать после прокрутки страницы: ленивые фоны грузятся при прокрутке.
 * → { vw, vh, dpr, bodyBg, scrollY, marked, layers[], svgNoise[], bodyAfterUsed, bodyBeforeUsed, extras? }
 */
export async function findTextureLayers(page, { mark = false, extras = false, minW = 0.6, minH = 0.4 } = {}) {
  return page.evaluate(`(${TEXTURE_LAYERS_FN})(${JSON.stringify({ mark, extras, minW, minH })})`);
}

/* Функция страницы: все блоки, в фоне которых лежит картинка из списка (адреса полные), кроме уже помеченных
   слоёв, — карточки, плашки, кнопки с той же плиткой. Нужны, чтобы проход «без крупной фактуры» убрал её
   везде: иначе на карточках вклад вышел бы 0 и занизил итог. Ставит data-rw-surf(-before|-after) = k. */
function surfaceUsersInPage(arg) {
  const want = new Set(arg.urls || []); let k = arg.from || 0; const out = [];
  const splitTop = (str) => {
    const o = []; let depth = 0, q = null, cur = ''; const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { cur += ch; if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { o.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) o.push(cur.trim());
    return o;
  };
  const urlOf = (item) => { const m = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*?))\s*\)/.exec(item || ''); return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] || '').replace(/\\(.)/g, '$1') : null; };
  const absOf = (u) => { if (/^data:/i.test(u)) return u; try { return new URL(u, location.href).href; } catch (e) { return u; } };
  for (const el of document.querySelectorAll('html, body, body *')) {
    if (out.length >= 400) break;
    if (el instanceof SVGElement) continue;
    const base = getComputedStyle(el); if (base.display === 'none') continue;
    for (const pseudo of [null, '::before', '::after']) {
      const s = pseudo ? getComputedStyle(el, pseudo) : base;
      if (pseudo && (s.content === 'none' || s.content === 'normal' || s.display === 'none')) continue;
      const bg = s.backgroundImage; if (!bg || bg === 'none' || bg.indexOf('url(') < 0) continue;
      const items = splitTop(bg); const idx = items.findIndex((it) => { const u = urlOf(it); return !!u && want.has(absOf(u)); });
      if (idx < 0) continue;
      const sfx = pseudo ? '-' + pseudo.slice(2) : '';
      if (el.hasAttribute('data-rw-tex' + sfx) || el.hasAttribute('data-rw-surf' + sfx)) continue;
      const r = el.getBoundingClientRect(); if (!pseudo && (r.width < 8 || r.height < 8)) continue;
      el.setAttribute('data-rw-surf' + sfx, String(k));
      const pick = (v) => { const p = splitTop(v); return p[idx % p.length] || p[0] || ''; };
      out.push({
        k: k++, el: sig(el), pseudo, kind: 'background', hide: 'background', mark: 'data-rw-surf', small: true,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        position: s.position, hideUrls: [urlOf(items[idx])], fileUrl: urlOf(items[idx]), bgIndex: idx,
        opacity: parseFloat(s.opacity), effectiveOpacity: Math.round(eff(el) * (pseudo ? parseFloat(s.opacity) : 1) * 1000) / 1000,
        mixBlendMode: s.mixBlendMode, backgroundBlendMode: pick(s.backgroundBlendMode), backgroundColor: s.backgroundColor,
        backgroundSize: pick(s.backgroundSize), backgroundRepeat: pick(s.backgroundRepeat),
      });
    }
  }
  return { users: out, next: k, scrollY: Math.round(scrollY) };
}
const SURFACE_USERS_FN = `((eff, sig) => ${surfaceUsersInPage.toString()})(${EFFECTIVE_OPACITY_FN}, ${SIG_FN})`;

/** Текст ошибки, когда стиль не вставился ни элементом, ни adoptedStyleSheets. */
export const CSP_NO_STYLE = 'CSP страницы запрещает вставку стиля';
/**
 * Свой стиль под ключом (тот же ключ — замена), в том числе при строгом CSP — через lib.addStyleSafe:
 * CSP страницы (заголовок из preparePage и meta) проверяется до вставки, и при запрете <style> не
 * пробуется, а сразу ставится сконструированная таблица (document.adoptedStyleSheets). Раньше <style>
 * пробовался всегда: нарушение CSP попадало в журнал консоли вкладки, perf и runtime считали его
 * ошибкой консоли сайта, а на report-uri сайта уходил отчёт. → 'style' | 'adopted' | null (не вставился
 * никак). WARN здесь не печатается — решает вызывающий (CSP_NO_STYLE). Для perf (--overlay) и hideTextureLayers.
 */
export function setPageStyle(page, key, css) { return addStyleSafe(page, css, { key, warn: false }); }
/** Убрать стиль, вставленный setPageStyle под этим ключом (любым из двух способов). */
export function dropPageStyle(page, key) { return removeStyleSafe(page, key); }

/**
 * Спрятать найденные слои (после findTextureLayers с mark: true): слой — visibility:hidden и opacity:0;
 * зерно в фоне блока с содержимым — только картинка шума в background-image заменяется на none;
 * шум фильтром у блока с содержимым — filter:none. Возвращает число правил.
 * Стиль ставится через setPageStyle (ключ texture-hide): при строгом CSP — adoptedStyleSheets; раньше
 * <style> там молча не применялся, и проход «без слоя» снимал страницу со слоем. info — необязательный
 * объект: в info.via пишется способ ('style' | 'adopted'). Не вставился никак — ошибка CSP_NO_STYLE.
 */
export async function hideTextureLayers(page, layers, info = null) {
  const spec = (layers || []).map((L) => ({ k: L.k, pseudo: L.pseudo, hide: L.hide, mark: L.mark || 'data-rw-tex', urls: (L.hideUrls || []).map((u) => String(u).slice(0, 300)), filterId: L.svg && L.svg.filterId ? L.svg.filterId : null }));
  const rules = await page.evaluate((spec) => {
    const splitTop = (str) => {
      const out = []; let depth = 0, q = null, cur = ''; const s = String(str || '');
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (q) { cur += ch; if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; continue; } if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
        if (ch === '(') depth++; else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    };
    const urlOf = (item) => { const m = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*?))\s*\)/.exec(item || ''); return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] || '').replace(/\\(.)/g, '$1') : null; };
    /* верхнеуровневые части значения filter: «url(#g) contrast(1.1)» → ['url(#g)', 'contrast(1.1)'] */
    const splitSpace = (str) => { const out = []; let depth = 0, cur = ''; for (const ch of String(str || '')) { if (ch === '(') depth++; else if (ch === ')') depth--; if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; } cur += ch; } if (cur) out.push(cur); return out; };
    const rules = [];
    for (const L of spec) {
      /* метка слоя: data-rw-tex у слоёв зерна и вуали, data-rw-surf у найденных как крупная фактура */
      const attr = L.pseudo ? L.mark + '-' + L.pseudo.slice(2) : L.mark;
      const sel = `[${attr}="${L.k}"]${L.pseudo || ''}`;
      const el = document.querySelector(`[${attr}="${L.k}"]`);
      /* opacity:0 обязательно: у SVG с фильтром (feTurbulence) Chrome рисует вывод фильтра и при visibility:hidden */
      if (L.hide === 'visibility') rules.push(`${sel}{visibility:hidden!important;opacity:0!important}`);
      else if (L.hide === 'filter') {
        /* убрать только ссылку на фильтр с шумом, остальные функции filter оставить */
        if (!el) continue;
        const parts = splitSpace(getComputedStyle(el, L.pseudo).filter).filter((p) => !(/^url\(/i.test(p) && (!L.filterId || p.includes('#' + L.filterId))));
        rules.push(`${sel}{filter:${parts.length ? parts.join(' ') : 'none'}!important}`);
      } else {
        if (!el) continue;
        const bg = getComputedStyle(el, L.pseudo).backgroundImage;
        const items = splitTop(bg).map((it) => { const u = urlOf(it); return u != null && L.urls.some((x) => x && u.slice(0, 300) === x) ? 'none' : it; });
        rules.push(`${sel}{background-image:${items.join(', ')}!important}`);
      }
    }
    return rules;
  }, spec);
  const via = await setPageStyle(page, 'texture-hide', rules.join('\n'));
  if (info) info.via = via;
  if (!via && rules.length) throw new Error(`${CSP_NO_STYLE} — слой не спрятать`);
  return rules.length;
}
/** Вернуть спрятанные слои. */
export async function showTextureLayers(page) {
  await dropPageStyle(page, 'texture-hide');
}

/* ======================================================================
   2. Пиксели: яркость, плитки, полосы
   ====================================================================== */

/** Яркость Y (Rec.709) снимка: файл или Buffer → { Y: Float32Array, w, h }. */
export async function lumaOf(input) {
  const sharp = needSharp();
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, ch = info.channels; const Y = new Float32Array(n);
  for (let i = 0; i < n; i++) Y[i] = ch >= 3 ? 0.2126 * data[i * ch] + 0.7152 * data[i * ch + 1] + 0.0722 * data[i * ch + 2] : data[i * ch];
  return { Y, w: info.width, h: info.height };
}

function boxBlur(Y, w, h, r) {
  const W = w + 1, I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += Y[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/* Остаток плитки после вычитания плоскости a + b·x + c·y: σ, lag1 (среднее по
   горизонтали и вертикали), асимметрия и эксцесс, среднее. R — рабочий буфер T×T. */
function planeStats(A, w, tx, ty, T, R) {
  const c = (T - 1) / 2; const n = T * T; const Sxx = n * (T * T - 1) / 12;
  let s = 0, sx = 0, sy = 0;
  for (let y = 0; y < T; y++) { const row = (ty + y) * w + tx; const dy = y - c; for (let x = 0; x < T; x++) { const v = A[row + x]; s += v; sx += (x - c) * v; sy += dy * v; } }
  const mean = s / n, bx = sx / Sxx, by = sy / Sxx;
  let m2 = 0, m3 = 0, m4 = 0;
  for (let y = 0; y < T; y++) { const row = (ty + y) * w + tx; const dy = y - c; for (let x = 0; x < T; x++) { const r = A[row + x] - mean - bx * (x - c) - by * dy; R[y * T + x] = r; const r2v = r * r; m2 += r2v; m3 += r2v * r; m4 += r2v * r2v; } }
  m2 /= n; m3 /= n; m4 /= n;
  let ch = 0, cv = 0;
  for (let y = 0; y < T; y++) for (let x = 0; x < T - 1; x++) ch += R[y * T + x] * R[y * T + x + 1];
  for (let y = 0; y < T - 1; y++) for (let x = 0; x < T; x++) cv += R[y * T + x] * R[(y + 1) * T + x];
  const lag1 = m2 > 0.05 ? ((ch / (T * (T - 1))) + (cv / (T * (T - 1)))) / 2 / m2 : null;
  return { mean, sd: Math.sqrt(m2), lag1, skew: m2 > 0.05 ? m3 / Math.pow(m2, 1.5) : 0, kurt: m2 > 0.05 ? m4 / (m2 * m2) - 3 : 0 };
}
/* σ, среднее и lag1 разности A − B в плитке (без плоскости: содержимое то же). */
function diffStats(A, B, w, tx, ty, T, R) {
  let s = 0; const n = T * T;
  for (let y = 0; y < T; y++) { const row = (ty + y) * w + tx; for (let x = 0; x < T; x++) { const d = A[row + x] - B[row + x]; R[y * T + x] = d; s += d; } }
  const mean = s / n; let m2 = 0, ch = 0;
  for (let i = 0; i < n; i++) { const d = R[i] - mean; m2 += d * d; }
  m2 /= n;
  for (let y = 0; y < T; y++) for (let x = 0; x < T - 1; x++) ch += (R[y * T + x] - mean) * (R[y * T + x + 1] - mean);
  return { mean, sd: Math.sqrt(m2), lag1: m2 > 0.05 ? ch / (T * (T - 1)) / m2 : null };
}

/**
 * Ровные плитки T×T с силой зерна. Y — снимок со слоями; Y2, Y3 — тот же экран позже (кипение);
 * Yw — тот же экран без слоёв: если есть, ровность решает он (абсолютный порог, зерна в нём нет),
 * и у плитки есть вклад слоя (sdD, meanD, lagD). Без Yw — относительный порог ровности.
 * Возвращает массив ровных плиток (свойство .total — сколько плиток рассмотрено).
 * Плитка: { x, y, y_mean, sd, lag1, flicker2?, flicker3?, yw?, sdW?, sdD?, meanD?, lagD? }.
 * Yf — с каким снимком сравнивать Y2 и Y3 для кипения (по умолчанию Y): нужен, когда Y снят без крупной
 * фактуры, а Y2 и Y3 — со всеми слоями (тогда Yf — первый снимок со всеми слоями).
 */
export function grainTiles(Y, w, h, { T = 32, Y2 = null, Y3 = null, Yw = null, Yf = null, region = null, border = 12 } = {}) {
  const same = (A) => (A && A.length === Y.length ? A : null);
  Y2 = same(Y2); Y3 = same(Y3); Yw = same(Yw); Yf = same(Yf) || Y;
  const blur = boxBlur(Yw || Y, w, h, 10);
  const R = new Float32Array(T * T);
  const [rx, ry, rw, rh] = region || [0, 0, w, h];
  const tiles = []; let total = 0;
  for (let ty = Math.max(ry, border); ty + T <= Math.min(h - border, ry + rh); ty += T) {
    for (let tx = Math.max(rx, border); tx + T <= Math.min(w - border, rx + rw); tx += T) {
      total++;
      let mn = 1e9, mx = -1e9;
      for (let y = ty; y < ty + T; y++) for (let x = tx; x < tx + T; x++) { const f = blur[y * w + x]; if (f < mn) mn = f; if (f > mx) mx = f; }
      const range = mx - mn;
      const st = planeStats(Y, w, tx, ty, T, R);
      const t = { x: tx, y: ty, y_mean: st.mean, sd: st.sd, lag1: st.lag1 };
      if (Yw) {
        const sw = planeStats(Yw, w, tx, ty, T, R);
        if (!(range <= 8 && sw.sd <= 3)) continue;
        const d = diffStats(Y, Yw, w, tx, ty, T, R);
        Object.assign(t, { yw: sw.mean, sdW: sw.sd, sdD: d.sd, meanD: d.mean, lagD: d.lag1 });
      } else {
        /* относительный порог: размытие 21×21 от шума с σ и зерном p px гуляет на ~σ·p/21 */
        const p = Math.min(4, Math.max(1, 1 / (1 - Math.max(0, Math.min(0.9, st.lag1 || 0)))));
        const allow = 8 + 5 * Math.min(st.sd, 40) * p / 21;
        if (!(range <= allow && st.sd <= 60)) continue;
        if (st.sd >= 1.5 && !(Math.abs(st.skew) <= 1 && st.kurt <= 2.5)) continue; /* текст и края: хвосты */
      }
      if (Y2) t.flicker2 = diffStats(Y2, Yf, w, tx, ty, T, R).sd / Math.SQRT2;
      if (Y3) t.flicker3 = diffStats(Y3, Yf, w, tx, ty, T, R).sd / Math.SQRT2;
      tiles.push(t);
    }
  }
  tiles.total = total;
  return tiles;
}

/**
 * Полосы фона по плиткам: { dark (Y<60), mid, light (Y>190), all, coverage }.
 * key — какое число сводить ('sd' — что видно; 'sdD' — вклад слоя; 'sdW' — без слоя),
 * yKey — по какой яркости делить на полосы. У полосы: { tiles, sd, sd_p90, lag1, y, flicker, status }:
 * status 'есть' (σ ≥ 1), 'нет', 'не измерено' (ровных плиток меньше 10 — числа только справочно).
 */
export function summarize(tiles, { key = 'sd', yKey = 'y_mean', lagKey = 'lag1' } = {}) {
  const band = (f) => {
    const t = tiles.filter((x) => x[key] != null && f(x[yKey]));
    const sd = median(t.map((x) => x[key]));
    const f2 = median(t.map((x) => x.flicker2)), f3 = median(t.map((x) => x.flicker3));
    const flick = f2 == null && f3 == null ? null : Math.max(f2 || 0, f3 || 0);
    return {
      tiles: t.length, sd: r2(sd), sd_p90: r2(quant(t.map((x) => x[key]), 0.9)), lag1: r2(median(t.map((x) => x[lagKey]))),
      y: r2(median(t.map((x) => x[yKey]))), ...(key === 'sd' && flick != null ? { flicker: r2(flick) } : {}),
      status: t.length < MIN_TILES ? 'не измерено' : sd >= GRAIN_MIN_SD ? 'есть' : 'нет',
    };
  };
  return {
    dark: band((y) => y < 60), mid: band((y) => y >= 60 && y <= 190), light: band((y) => y > 190), all: band(() => true),
    coverage: tiles.length ? r2(tiles.filter((t) => t[key] >= 1.5).length / tiles.length) : null,
    considered: tiles.total ?? null,
  };
}
function liftOf(tiles) {
  const b = (f) => { const t = tiles.filter((x) => x.meanD != null && f(x.yw)); return t.length >= MIN_TILES ? r2(median(t.map((x) => x.meanD))) : null; };
  return { dark: b((y) => y < 60), mid: b((y) => y >= 60 && y <= 190), light: b((y) => y > 190) };
}
function bandsAll(tiles, hasW) {
  return {
    grain: summarize(tiles),
    without: hasW ? summarize(tiles, { key: 'sdW', yKey: 'yw' }) : null,
    contribution: hasW ? summarize(tiles, { key: 'sdD', yKey: 'yw', lagKey: 'lagD' }) : null,
    lift: hasW ? liftOf(tiles) : null,
  };
}

/**
 * Метрика по готовым снимкам (1:1, снимки ОКНА). measurePng(file, { file2, file3, without, region })
 * или по-старому measurePng(file, file2, region). → { size, dark, mid, light, all, coverage,
 * without, contribution, lift, _tiles }.
 */
export async function measurePng(file, opts = {}, region3 = null) {
  if (typeof opts === 'string' || opts == null) opts = { file2: opts || null, region: region3 };
  const a = await lumaOf(file);
  const load = async (f) => { if (!f) return null; const x = await lumaOf(f); return x.w === a.w && x.h === a.h ? x.Y : null; };
  const Y2 = await load(opts.file2), Y3 = await load(opts.file3), Yw = await load(opts.without);
  const tiles = grainTiles(a.Y, a.w, a.h, { Y2, Y3, Yw, region: opts.region || null });
  const b = bandsAll(tiles, !!Yw);
  return { size: [a.w, a.h], ...b.grain, without: b.without, contribution: b.contribution, lift: b.lift, _tiles: tiles };
}

/** Вырез ровной плитки ×6 с растянутым контрастом — чтобы зерно увидел человек. */
async function cropTile(file, t, out, gain = 6) {
  if (!t) return null;
  const sharp = needSharp();
  const { data, info } = await sharp(file).extract({ left: t.x, top: t.y, width: 32, height: 32 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const Y = new Float32Array(32 * 32); let m = 0;
  for (let i = 0; i < Y.length; i++) { Y[i] = 0.2126 * data[i * info.channels] + 0.7152 * data[i * info.channels + 1] + 0.0722 * data[i * info.channels + 2]; m += Y[i]; }
  m /= Y.length;
  const px = Buffer.alloc(32 * 32); for (let i = 0; i < px.length; i++) px[i] = Math.max(0, Math.min(255, Math.round(128 + (Y[i] - m) * gain)));
  await sharp(px, { raw: { width: 32, height: 32, channels: 1 } }).resize(192, 192, { kernel: 'nearest' }).png().toFile(out);
  return out;
}

/* ======================================================================
   3. Файл текстуры
   ====================================================================== */

/**
 * Пороги «крупной фактуры» по файлу — картинка-плитка с деталями крупнее пикселя (мятая бумага, камень
 * с прожилками, холст), а не шум и не фотография. Подобраны по живому замеру 01.10.2026:
 *   образец zakroma.rest (texture.webp 1416×1688): яркость 248.28 ± 2.51, lag1 0.96/0.97, связь на 3–6 px
 *   0.88, альфа 1, цветность 0.09; свои плитки surface-tile.mjs (бумага, камень, ткань при яркости 60…248):
 *   σ 2.5…6, lag1 0.89…0.99, связь 0.59…0.95, все 16 частей «живые», разброс средних по частям 0.24…0.41 σ.
 *   Мимо: шум (σ 77, lag1 0…0.76), слабый шум на белом (lag1 0), фотография (σ 40…54), плавный градиент
 *   (разброс средних 0.96 σ — вся перемена это общий уклон), бледный рисунок на белом (живых частей 11 из 16 —
 *   детали не по всей площади), мелкий узор (плитка 24…40 px).
 * sdMin…sdMax — разброс яркости, уровней: меньше — ровная заливка, больше — контрастная картинка;
 * lagMin — связь соседних пикселей по обеим осям (у шума она около 0); farMin — связь на 3–6 px;
 * alphaMin — непрозрачность; sideMin — меньшая сторона, px; liveMin — сколько из 16 частей картинки (4×4)
 * несут детали (σ части не меньше 0.35 медианы); spreadMax — разброс средних по частям в долях σ;
 * chromaMax — разброс цвета по картинке в долях σ яркости (и не меньше 4 уровней): больше — цветной рисунок.
 */
export const SURFACE = { sdMin: 0.8, sdMax: 12, lagMin: 0.8, farMin: 0.5, alphaMin: 0.98, sideMin: 64, liveMin: 14, spreadMax: 0.7, chromaMax: 2 };
/** Порог «крупная фактура видна на снимке»: σ вклада слоя на ровном участке, уровней. */
export const SURFACE_MIN_SD = 0.6;
/** Пороги шва плитки (seamOf): до SEAM_WARN — бесшовная, выше SEAM_FAIL — стык при повторе виден. */
export const SEAM_WARN = 1.6, SEAM_FAIL = 2.5;
/**
 * Граница «тёмное поле / светлое поле» для выбора наложения, яркость Y. Светлая плитка (яркость s ≈ 0.97)
 * на поле яркости b: умножение оставляет от её разброса долю b, color-burn — долю (1 − b) / s². Равны они
 * при b ≈ 0.51 (Y ≈ 130): темнее сильнее color-burn, светлее — умножение. На белом color-burn гаснет совсем,
 * на чёрном гаснет умножение.
 */
export const SURFACE_DARK_Y = 130;
/** Меньше стольких ровных участков в полосе фона — «не измерено». */
export const SURFACE_MIN_BLOCKS = 4;

/**
 * Шов плитки числом: виден ли стык при повторе. Y — яркость w×h. Для каждой пары соседних столбцов
 * считается средний модуль скачка; пара «последний — первый» (при повторе они соседи) сравнивается с почти
 * самым большим из обычных скачков внутри плитки (98-й процентиль: у ткани каждая шестнадцатая граница —
 * стык нитей, и край плитки может стоять на таком стыке). То же по строкам, и ещё раз по средним K пикселей
 * с каждой стороны — ступенька, спрятанная под мелкой рябью. Около 1 и меньше — край не отличить от
 * середины; замерено: свои плитки до сжатия 0.5…1.0, WebP q86 до 1.3; вырез из плитки (не бесшовный)
 * 5…9, плавный уклон 10…20, ступенька в 1 уровень 1.9…3.5; texture.webp образца — 4.18 (стык у донора есть).
 * → { x, y, max, detail: { x1, xK, y1, yK: { edge, inner, top, ratio } } }.
 */
export function seamOf(Y, w, h, K = 6) {
  /* m — поперёк шва, n — вдоль; at(c, t) — индекс пикселя. J[c] — средний модуль скачка между полосой
     [c−k, c) и полосой [c, c+k); c = 0 — граница плитки (конец против начала) */
  const one = (m, n, at, k) => {
    const J = new Float64Array(m), S = new Float32Array(m);
    for (let t = 0; t < n; t++) {
      let s = 0; for (let q = 0; q < k; q++) s += Y[at(q, t)];
      for (let c = 0; c < m; c++) { S[c] = s; s += Y[at((c + k) % m, t)] - Y[at(c, t)]; }
      for (let c = 0; c < m; c++) J[c] += Math.abs(S[c] - S[(c - k + m) % m]);
    }
    const edge = J[0] / (k * n);
    /* внутри плитки: все границы, обе полосы которых не задевают край */
    const inner = []; for (let c = k; c <= m - k; c++) inner.push(J[c] / (k * n));
    inner.sort((p, q) => p - q);
    const q = (p) => (inner.length ? inner[Math.min(inner.length - 1, Math.floor(inner.length * p))] : 0);
    const ref = q(0.98);
    return { edge: r2(edge), inner: r2(q(0.5)), top: r2(ref), ratio: ref > 1e-6 ? edge / ref : edge > 0.05 ? 99 : 1 };
  };
  if (w < 8 || h < 8) return { x: null, y: null, max: null, detail: null };
  const ax = (c, t) => t * w + c, ay = (c, t) => c * w + t;
  const x1 = one(w, h, ax, 1), xK = one(w, h, ax, Math.max(1, Math.min(K, w >> 2))), y1 = one(h, w, ay, 1), yK = one(h, w, ay, Math.max(1, Math.min(K, h >> 2)));
  const x = Math.max(x1.ratio, xK.ratio), y = Math.max(y1.ratio, yK.ratio);
  return { x: r2(x), y: r2(y), max: r2(Math.max(x, y)), detail: { x1, xK, y1, yK } };
}

/* Крупная ли это фактура — по числам первого кадра (пороги SURFACE). → { ok, why[] } — why: чем не подошла. */
function surfaceJudge(t) {
  const f = t.frames[0]; const S = SURFACE; const why = [];
  if (t.pages > 1) why.push(`кадров ${t.pages} — анимация`);
  if (f.alphaMean < S.alphaMin) why.push(`полупрозрачная (альфа ${f.alphaMean})`);
  if (f.sd < S.sdMin) why.push(`ровная заливка (σ ${f.sd})`);
  else if (f.sd > S.sdMax) why.push(`контрастная картинка (σ ${f.sd} при пороге ${S.sdMax})`);
  if (Math.min(f.lag1, f.lag1v) < S.lagMin) why.push(`соседние пиксели не связаны (lag1 ${f.lag1}/${f.lag1v}) — шум или мелкий узор`);
  else if (f.farCorr < S.farMin) why.push(`детали мельче 3 px (связь на 3–6 px ${f.farCorr})`);
  if (Math.min(t.width, t.height) < S.sideMin) why.push(`мелкая плитка ${t.width}×${t.height} — узор`);
  if (f.parts) {
    if (f.parts.live < S.liveMin) why.push(`детали не по всей площади (живых частей ${f.parts.live} из 16) — рисунок, не фактура`);
    if (f.parts.spread > S.spreadMax) why.push(`общий уклон яркости (разброс средних ${f.parts.spread} σ) — градиент или фотография`);
  }
  if (f.chromaSd != null && f.chromaSd > Math.max(4, S.chromaMax * f.sd)) why.push(`цвет меняется по картинке (разброс ${f.chromaSd}) — цветной рисунок`);
  return { ok: !why.length, why };
}

/**
 * Разбор файла текстуры по ВСЕМ кадрам (GIF/WebP) — файл или Buffer (SVG тоже: sharp его рисует).
 * → { file, format, bytes, width, height, pages, delayMs[], frameMs, cycleMs, fps, loop,
 *     frames: [{ mean, sd, sdOver, lag1, lag1v, alphaMean, transparent, chroma, levels }],
 *     frameCorr[], noiseLike, surfaceLike, surfaceWhy[], seam }. sdOver — σ яркости, положенной на средний
 * серый (для альфа-зерна);
 * noiseLike — похоже на шум: σ заметная, связь соседей < 0.8, на расстоянии 3–6 px связи нет (не узор);
 * surfaceLike — крупная фактура (пороги SURFACE), surfaceWhy — чем не подошла; у первого кадра ещё
 * parts { live — сколько из 16 частей картинки несут детали, spread — разброс средних по частям в долях σ },
 * chromaSd — разброс цвета по картинке, tint — средний цвет; seam — шов при повторе (seamOf; один кадр).
 */
export async function analyzeTile(input, { name = null, seam = null } = {}) {
  const sharp = needSharp();
  const meta = await sharp(input, { animated: true }).metadata();
  const pages = meta.pages || 1, W = meta.width, H = meta.pageHeight || meta.height;
  const { data } = await sharp(input, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frames = []; const lums = [];
  for (let p = 0; p < pages; p++) {
    const off = p * W * H * 4, n = W * H; const L = new Float32Array(n); const C = new Float32Array(n);
    let s = 0, s2 = 0, so = 0, so2 = 0, aSum = 0, a0 = 0, chroma = 0; const lv = new Set();
    for (let i = 0; i < n; i++) {
      const o = off + i * 4; const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; L[i] = l; s += l; s2 += l * l;
      const c = (a / 255) * l + (1 - a / 255) * 128; C[i] = c; so += c; so2 += c * c;
      aSum += a; if (a === 0) a0++; chroma += Math.max(r, g, b) - Math.min(r, g, b); if (lv.size < 300) lv.add(Math.round(l));
    }
    const m = s / n, v = Math.max(0, s2 / n - m * m), mo = so / n, vo = Math.max(0, so2 / n - mo * mo);
    const corrAt = (dx, dy) => { let c = 0, k = 0; for (let y = 0; y + dy < H; y++) for (let x = 0; x + dx < W; x++) { c += (C[y * W + x] - mo) * (C[(y + dy) * W + x + dx] - mo); k++; } return k && vo > 0 ? c / k / vo : 0; };
    const lagH = corrAt(1, 0), lagV = corrAt(0, 1);
    const far = [3, 4, 5, 6].flatMap((d) => [corrAt(d, 0), corrAt(0, d)]).map(Math.abs);
    lums.push({ L, m });
    frames.push({ mean: r2(m), sd: r2(Math.sqrt(v)), sdOver: r2(Math.sqrt(vo)), lag1: r2(lagH), lag1v: r2(lagV), farCorr: r2(Math.max(...far)), alphaMean: r2(aSum / n / 255), transparent: r2(a0 / n), chroma: r2(chroma / n), levels: lv.size >= 300 ? '300+' : lv.size });
  }
  const frameCorr = [];
  for (let p = 1; p < pages; p++) { const A = lums[p - 1], B = lums[p]; let s = 0, sa = 0, sb = 0; for (let i = 0; i < A.L.length; i++) { const x = A.L[i] - A.m, y = B.L[i] - B.m; s += x * y; sa += x * x; sb += y * y; } frameCorr.push(sa && sb ? r2(s / Math.sqrt(sa * sb)) : null); }
  const delay = Array.isArray(meta.delay) ? meta.delay.slice(0, pages) : [];
  const cycle = delay.reduce((a, b) => a + b, 0);
  const f0 = frames[0];
  const noiseLike = f0.sdOver >= 6 && Math.abs(f0.lag1) < 0.8 && Math.abs(f0.lag1v) < 0.8 && f0.farCorr < 0.3;
  /* первый кадр — для крупной фактуры: разброс цвета и средний цвет, ровность по площади (16 частей 4×4) */
  {
    const n = W * H, L = lums[0].L; let rg = 0, rg2 = 0, bg = 0, bg2 = 0, sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < n; i++) { const o = i * 4; const r = data[o], g = data[o + 1], b = data[o + 2]; const d1 = r - g, d2 = b - g; rg += d1; rg2 += d1 * d1; bg += d2; bg2 += d2 * d2; sr += r; sg += g; sb += b; }
    f0.chromaSd = r2(Math.sqrt(Math.max(0, rg2 / n - (rg / n) ** 2) + Math.max(0, bg2 / n - (bg / n) ** 2)));
    f0.tint = '#' + [sr, sg, sb].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
    if (W >= 16 && H >= 16) {
      const G = 4; const sds = [], means = [];
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const x0 = Math.floor(i * W / G), x1 = Math.floor((i + 1) * W / G), y0 = Math.floor(j * H / G), y1 = Math.floor((j + 1) * H / G);
        let s = 0, s2 = 0, k = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = L[y * W + x]; s += v; s2 += v * v; k++; }
        const m = s / k; means.push(m); sds.push(Math.sqrt(Math.max(0, s2 / k - m * m)));
      }
      const med = sds.slice().sort((a, b) => a - b)[8]; const mm = means.reduce((a, b) => a + b, 0) / means.length;
      const spread = Math.sqrt(means.reduce((a, b) => a + (b - mm) * (b - mm), 0) / means.length);
      f0.parts = { live: med > 0.05 ? sds.filter((v) => v >= 0.35 * med).length : 0, spread: f0.sd > 0 ? r2(spread / f0.sd) : 0 };
    }
  }
  const sj = surfaceJudge({ pages, width: W, height: H, frames });
  const bytes = Buffer.isBuffer(input) ? input.length : fs.statSync(input).size;
  /* шов считается у плитки крупной фактуры (и по просьбе: seam: true) — остальным он ни к чему */
  const seamRes = pages === 1 && (seam === true || (seam == null && sj.ok)) ? seamOf(lums[0].L, W, H) : null;
  return {
    file: name || (Buffer.isBuffer(input) ? '(данные)' : path.basename(input)), format: meta.format, bytes, width: W, height: H, pages,
    delayMs: delay, frameMs: delay.length ? median(delay) : null, cycleMs: cycle || null, fps: cycle ? r2(1000 * delay.length / cycle) : null,
    loop: meta.loop ?? null, frames, frameCorr, noiseLike, surfaceLike: sj.ok, surfaceWhy: sj.why, ...(seamRes ? { seam: seamRes } : {}),
  };
}

/* файл слоя: data-URI, fetch из страницы (кэш браузера) или обычный запрос без своих заголовков */
async function fetchLayerFile(page, u) {
  if (/^data:/i.test(u)) {
    const m = /^data:([^,;]*)((?:;[^,;]*)*),(.*)$/is.exec(u); if (!m) return null;
    const buf = /;base64/i.test(m[2] || '') ? Buffer.from(m[3], 'base64') : Buffer.from((() => { try { return decodeURIComponent(m[3]); } catch { return m[3]; } })(), 'utf8');
    return { buf, via: 'data-URI', type: m[1] || '' };
  }
  let abs; try { abs = new URL(u, page.url()).href; } catch { return null; }
  /* страница с диска (сборка до выкладки, стенд): fetch к file:// закрыт и в странице, и в Node — читаем файл сами */
  if (/^file:/i.test(abs)) {
    try { const buf = fs.readFileSync(fileURLToPath(abs.split('#')[0].split('?')[0])); return buf.length <= 8e6 ? { buf, via: 'диск', url: abs } : null; } catch { return null; }
  }
  const b64 = await page.evaluate(async (x) => {
    try { const r = await fetch(x); if (!r.ok) return null; const a = new Uint8Array(await r.arrayBuffer()); if (a.length > 8e6) return null; let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); } catch (e) { return null; }
  }, abs).catch(() => null);
  if (b64) return { buf: Buffer.from(b64, 'base64'), via: 'страница', url: abs };
  try { const r = await fetch(abs, { signal: AbortSignal.timeout(20000) }); if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); if (buf.length <= 8e6) return { buf, via: 'сеть', url: abs }; } } catch { /* нет */ }
  return null;
}

/* ======================================================================
   4. Кипение, правила режимов, диагноз
   ====================================================================== */

/* частота кипения из @keyframes: сегменты между кадрами ключей × steps(n) */
function boilFromAnim(a) {
  if (!a || a.iterations !== 'infinite' || !(a.durationMs > 0) || a.playState === 'paused') return null;
  const st = /steps\(\s*(\d+)/.exec(a.timing || ''); const stepEnd = /step-(start|end)/.test(a.timing || '');
  const offs = [...new Set([0, 100, ...((a.offsets || []).filter((x) => Number.isFinite(x)))])].sort((x, y) => x - y);
  const segments = Math.max(1, offs.length - 1);
  if (!st && !stepEnd) return { frames: null, frameMs: null, cycleMs: a.durationMs, smooth: true, name: a.name };
  const frames = segments * (st ? Number(st[1]) : 1);
  return { frames, frameMs: Math.round(a.durationMs / frames), cycleMs: a.durationMs, smooth: false, name: a.name };
}
function boilSource(layers) {
  for (const L of layers) if (L.file && L.file.pages > 1) return { source: 'файл', frames: L.file.pages, frameMs: L.file.frameMs, cycleMs: L.file.cycleMs, of: L.el + (L.pseudo || '') };
  for (const L of layers) for (const a of [...(L.anims || []), ...(L.animsChain || [])]) { const b = boilFromAnim(a); if (b) return { source: '@keyframes', ...b, of: L.el + (L.pseudo || '') }; }
  return null;
}

/**
 * Правила режимов наложения для зерна (G3): even — одинаковая сила на любом фоне;
 * deadOnDark — гаснет на тёмных фонах (Y до ~50); deadOnLight — на светлых.
 */
export function blendAdvice(mode) {
  const m = String(mode || 'normal').toLowerCase();
  const even = ['normal', 'hard-light', 'luminosity', 'difference', 'exclusion'].includes(m);
  const deadOnDark = ['multiply', 'overlay', 'soft-light', 'darken', 'color-burn'].includes(m);
  const deadOnLight = ['screen', 'overlay', 'soft-light', 'lighten', 'color-dodge'].includes(m);
  const text = even ? `${m}: одинаковая сила на любом фоне${m === 'normal' ? ', чёрный поднимается на ≈ opacity×127' : m === 'hard-light' ? ', чёрный поднимается меньше' : ''}`
    : deadOnDark && deadOnLight ? `${m}: гаснет на тёмных (Y до ~50) и на светлых фонах, работает только на средних тонах`
    : deadOnDark ? `${m}: гаснет на тёмных фонах (Y до ~50), на чёрном зерна нет`
    : deadOnLight ? `${m}: гаснет на светлых фонах, на белом зерна нет`
    : `${m}: поведение по фонам не проверено — мерить`;
  return { mode: m, even, deadOnDark, deadOnLight, text };
}
const layerBlend = (L) => (L.mixBlendMode && L.mixBlendMode !== 'normal' ? L.mixBlendMode : L.blendChain && L.blendChain.length ? L.blendChain[0].split(':').pop() : 'normal');

function diagnose(res) {
  const out = []; const g = res.grain; const c = res.contribution;
  const fmtB = (b) => (b && b.tiles ? `σ ${b.sd} на Y ${Math.round(b.y)}` : 'не измерено');
  for (const L of res.layers) {
    const mode = layerBlend(L); const adv = blendAdvice(mode);
    const name = `${L.el}${L.pseudo || ''}`;
    const dark = (c && c.dark.status !== 'не измерено' ? c.dark : null) || (g.dark.status !== 'не измерено' ? g.dark : null);
    const light = (c && c.light.status !== 'не измерено' ? c.light : null) || (g.light.status !== 'не измерено' ? g.light : null);
    if (adv.deadOnDark && dark && dark.sd < GRAIN_MIN_SD) out.push(`${mode} гасит на тёмном: ${fmtB(dark)} (слой ${name}, opacity ${L.effectiveOpacity}) → normal или hard-light, opacity = нужная σ / σ плитки (${TILE_SD})`);
    else if (adv.deadOnDark && !dark) out.push(`${mode} у слоя ${name}: на тёмных фонах погаснет (тёмных ровных участков на снимках нет — не измерено)`);
    if (adv.deadOnLight && light && light.sd < GRAIN_MIN_SD) out.push(`${mode} гасит на светлом: ${fmtB(light)} (слой ${name}) → normal или hard-light`);
    if (L.svg && (L.svg.alphaTable == null)) out.push(`feTurbulence у ${name} без feFuncA: альфа шума ≈ 0.3, сила зависит от неё — смотреть замер, а не opacity`);
    if (L.kind === 'svg' || (L.svg && L.kind === 'filter')) out.push(`шум рисуется фильтром SVG (${name}) на каждый кадр — цену мерить perf-замером`);
  }
  if (res.layers.length && c) {
    const vals = ['dark', 'mid', 'light'].map((k) => c[k]).filter((b) => b.status !== 'не измерено');
    if (vals.length && vals.every((b) => b.sd < 0.5)) out.push('слой есть, но не виден: вклад «со слоем − без» ≈ 0 на всех фонах (спрятан, нулевой размер, режим наложения или @media)');
  }
  if (!res.layers.length && res.status === 'есть') out.push('зерно на снимке есть, а слой не найден: оно в самих картинках или фонах — повторять не слоем');
  if (res.status === 'не измерено' && (res.patterns || []).some((p) => /узор/.test(p.why))) out.push(`узор в фоне (${res.patterns.filter((p) => /узор/.test(p.why)).map((p) => p.el).join(', ')}) — не зерно; он же делает участки неровными, поэтому зерно поверх него не измерить`);
  const d = g.dark, l = g.light;
  if (d.status !== 'не измерено' && l.status !== 'не измерено' && Math.max(d.sd, l.sd) >= GRAIN_MIN_SD) {
    const ratio = d.sd / Math.max(0.1, l.sd);
    if (ratio < 0.5 || ratio > 2) out.push(`зерно неравномерно: тёмный/светлый = ${r2(ratio)} (режим наложения не normal или альфа-плитка)`);
  }
  if (res.boil && res.boil.boils === false && res.boil.source === 'файл') out.push(`файл анимирован (${res.boil.frames} кадра), а на снимках через 250 мс зерно стоит — кадр мог не смениться в безголовом Chrome; частоту брать из файла`);
  if (res.hideError) out.push(`проход «без слоя» не сделан: ${res.hideError} — вклад слоя не измерен, σ — по снимкам со слоем (картинки и градиенты тоже дают σ)`);
  return out;
}

/* ======================================================================
   4а. Крупная фактура на снимках
   ====================================================================== */

/* яркость цвета CSS «rgb(…)» / «rgba(…)»; прозрачный и нечитаемый — null */
const yOfCss = (c) => {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(String(c || '')); if (!m) return null;
  const a = m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : Number(m[4]);
  return a < 0.5 ? null : 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3];
};
const toneOf = (y) => (y == null ? null : y < 60 ? 'dark' : y > 190 ? 'light' : 'mid');
const TONE = { dark: 'тёмный', mid: 'средний', light: 'светлый' };
const firstCss = (v, d) => String(v || d).split(',')[0].trim() || d;
/* режим наложения крупной фактуры: у картинки в фоне блока — background-blend-mode (на цвет того же блока),
   у отдельного слоя и картинки-подложки — mix-blend-mode (на то, что под слоем) */
const surfaceBlend = (L) => {
  if (L.via !== 'фон блока') return layerBlend(L);
  const modes = String(L.backgroundBlendMode || 'normal').split(',').map((x) => x.trim()).filter(Boolean);
  return modes.find((m) => m !== 'normal') || modes[0] || 'normal';
};
/* как показана плитка: размер фона, повтор, ширина одного повтора в CSS px */
function surfaceShown(L, file) {
  const size = firstCss(L.backgroundSize, 'auto'), repeat = firstCss(L.backgroundRepeat, 'repeat');
  const px = /^([\d.]+)px/.exec(size), pc = /^([\d.]+)%/.exec(size);
  const stretched = L.kind !== 'background' || /cover|contain|%/.test(size);
  const w = L.kind !== 'background' ? L.rect.w : px ? Number(px[1]) : pc ? L.rect.w * Number(pc[1]) / 100 : /cover|contain/.test(size) ? L.rect.w : file ? file.width : null;
  return { size: L.kind !== 'background' ? 'картинка на блок' : size, repeat, px: w ? Math.round(w) : null, stretched };
}

/**
 * Участки B×B ровных плиток (B = 4 — 128 px, B = 2 — 64 px) одной полосы фона на одном экране: σ участка —
 * разброс вклада фактуры по всему участку, то есть мелкие детали внутри плиток (sdD) и перепад между
 * плитками (meanD) вместе. Зерно меряют в плитке 32 px с вычтенной плоскостью; у крупной фактуры главное
 * как раз крупнее 32 px, и так она вышла бы втрое слабее, чем видна. need — сколько плиток участка должны
 * быть ровными. → [{ s, x, y, size, band, sd, fine, lift, yw, n }]
 */
function surfaceBlocks(tiles, B, need) {
  const groups = new Map(); const step = 32 * B;
  for (const t of tiles) {
    if (t.sdD == null) continue;
    const key = `${t.s || 0}|${Math.floor((t.x - 12) / step)}|${Math.floor((t.y - 12) / step)}|${toneOf(t.yw)}`;
    let g = groups.get(key); if (!g) groups.set(key, g = []); g.push(t);
  }
  const out = [];
  for (const [key, g] of groups) {
    if (g.length < need) continue;
    const [s, bx, by, band] = key.split('|'); const n = g.length; let w = 0, m = 0, yw = 0;
    for (const t of g) { w += t.sdD * t.sdD; m += t.meanD; yw += t.yw; }
    m /= n; let b = 0; for (const t of g) b += (t.meanD - m) * (t.meanD - m);
    out.push({ s: Number(s), x: 12 + Number(bx) * step, y: 12 + Number(by) * step, size: step, band, sd: Math.sqrt((w + b) / n), fine: Math.sqrt(w / n), lift: m, yw: yw / n, n });
  }
  return out;
}
/* полоса фона по участкам: { blocks, sd, sd_p90, fine, lift, y, status } — «есть» при σ ≥ SURFACE_MIN_SD */
function surfaceBand(blocks) {
  const sd = median(blocks.map((b) => b.sd));
  return {
    blocks: blocks.length, sd: r2(sd), sd_p90: r2(quant(blocks.map((b) => b.sd), 0.9)), fine: r2(median(blocks.map((b) => b.fine))),
    lift: r2(median(blocks.map((b) => b.lift))), y: r2(median(blocks.map((b) => b.yw))),
    status: blocks.length < SURFACE_MIN_BLOCKS ? 'не измерено' : sd >= SURFACE_MIN_SD ? 'есть' : 'нет',
  };
}
/** Полоса крупной фактуры для вердикта и сравнения: участки 128 px, а где их мало — 64 px. → Band & { size }. */
export function surfaceBandOf(surface, k) {
  if (!surface || !surface.bands) return { blocks: 0, sd: null, status: 'не измерено', size: 128 };
  const a = surface.bands[k], b = surface.bands64 && surface.bands64[k];
  return a && a.status !== 'не измерено' ? { ...a, size: 128 } : b && b.status !== 'не измерено' ? { ...b, size: 64 } : { ...(a || { blocks: 0, sd: null, status: 'не измерено' }), size: 128 };
}

/**
 * Итог по крупной фактуре на экране: слои (с режимом наложения, тоном секции и силой на ней), плитка,
 * сила на снимках по полосам фона, мелкие блоки с той же плиткой, диагнозы.
 * tiles — ровные плитки снимка «с фактурой» против снимка «без неё» (grainTiles с Yw).
 */
function surfaceResult({ layers, users, tiles, screens, rejected, error, measured }) {
  const none = (note) => ({ status: 'нет', statusNote: note, layers: [], users: [], usersCount: 0, tile: null, bands: null, bands64: null, byTone: null, diagnosis: [], rejected: rejected || [] });
  if (!layers.length) return none(measured === false ? 'файлы слоёв не разбирались' : 'картинок-плиток с крупной фактурой не найдено');
  const b128 = surfaceBlocks(tiles, 4, 12), b64 = surfaceBlocks(tiles, 2, 4);
  const bandsOf = (blocks, size) => { const o = { size }; for (const k of ['dark', 'mid', 'light']) o[k] = surfaceBand(blocks.filter((b) => b.band === k)); return o; };
  const bands = bandsOf(b128, 128), bands64 = bandsOf(b64, 64);

  /* плитка: файл, который стоит на большинстве слоёв */
  const byFile = new Map();
  for (const L of layers) { const f = L.file; if (!f || f.error) continue; const e = byFile.get(L.fileUrl) || { f, n: 0, L }; e.n++; byFile.set(L.fileUrl, e); }
  const top = [...byFile.values()].sort((a, b) => b.n - a.n)[0];
  const f0 = top.f.frames[0];
  const tile = {
    file: top.f.file, format: top.f.format, width: top.f.width, height: top.f.height, bytes: top.f.bytes,
    mean: f0.mean, sd: f0.sd, lag1: f0.lag1, lag1v: f0.lag1v, farCorr: f0.farCorr, chroma: f0.chroma, chromaSd: f0.chromaSd, tint: f0.tint, levels: f0.levels,
    seam: top.f.seam ? { x: top.f.seam.x, y: top.f.seam.y, max: top.f.seam.max } : null, saved: top.f.saved || null, layers: top.n, files: byFile.size,
  };

  /* какому слою принадлежит участок. Прямоугольники слоёв — те, что были на экране в момент снимка
     (screens[s].rects): секции бывают липкими и наезжают друг на друга, по координатам страницы их не найти.
     Из слоёв, в чей прямоугольник попал центр участка, берётся самый внутренний (меньший по площади), а из
     почти равных — более поздний в документе: он лежит сверху. Спрятанный слой участков не получает */
  const all = layers.concat(users);
  const hiddenOf = (L) => L.effectiveOpacity != null && L.effectiveOpacity < 0.02;
  const ownerOf = (b) => {
    const rects = (screens[b.s] && screens[b.s].rects) || {}; const cx = b.x + b.size / 2, cy = b.y + b.size / 2; let best = null, bestArea = Infinity;
    for (const L of all) {
      const q = rects[L.k]; if (!q || !q.shown || hiddenOf(L)) continue;
      if (!(cx >= q.x && cx < q.x + q.w && cy >= q.y && cy < q.y + q.h)) continue;
      const area = q.w * q.h;
      if (!best || area < bestArea * 0.75 || (area <= bestArea * 1.25 && L.k > best.k)) { best = L; bestArea = area; }
    }
    return best;
  };
  const own128 = new Map(), own64 = new Map();
  for (const [blocks, map] of [[b128, own128], [b64, own64]]) for (const b of blocks) { const L = ownerOf(b); if (!L) continue; let g = map.get(L.k); if (!g) map.set(L.k, g = []); g.push(b); }
  for (const L of all) {
    const g128 = own128.get(L.k) || [], g64 = own64.get(L.k) || []; const g = g128.length >= 2 ? g128 : g64;
    const yMeasured = g64.length ? median(g64.map((b) => b.yw)) : null;
    /* тон секции: по снимку без фактуры; не попало ни одного ровного участка — по цвету фона блока */
    const y = yMeasured != null ? yMeasured : L.via === 'фон блока' ? yOfCss(L.backgroundColor) : null;
    L.surf = {
      via: L.via, blend: surfaceBlend(L), tone: toneOf(y), side: y == null ? null : y < SURFACE_DARK_Y ? 'dark' : 'light', y: r2(y), toneBy: yMeasured != null ? 'снимок' : y != null ? 'цвет фона' : null,
      sd: g.length ? r2(median(g.map((b) => b.sd))) : null, lift: g.length ? r2(median(g.map((b) => b.lift))) : null, blocks: g.length, blockSize: g.length ? g[0].size : null,
      shown: surfaceShown(L, L.file && !L.file.error ? L.file : top.f), hidden: hiddenOf(L),
      opacity: L.effectiveOpacity != null ? L.effectiveOpacity : 1,
    };
  }
  /* режим наложения: что стоит чаще (слои и мелкие блоки вместе; спрятанные не в счёт). byTone — по полосам
     фона замера (тёмная, средняя, светлая), bySide — по сторонам границы SURFACE_DARK_Y: для рецепта */
  const tally = (pick, keys) => {
    const out = {};
    for (const k of keys) {
      const modes = {}; let n = 0;
      for (const L of all) { if (pick(L) !== k || L.surf.hidden) continue; modes[L.surf.blend] = (modes[L.surf.blend] || 0) + 1; n++; }
      const best = Object.entries(modes).sort((a, b) => b[1] - a[1])[0];
      out[k] = { mode: best ? best[0] : null, count: n, modes };
    }
    return out;
  };
  const byTone = tally((L) => L.surf.tone, ['dark', 'mid', 'light']);
  const bySide = tally((L) => L.surf.side, ['dark', 'light']);
  /* мелкие блоки — группами: тон и режим */
  const groups = new Map();
  for (const U of users) {
    const key = `${U.surf.tone || '?'}|${U.surf.blend}`; const e = groups.get(key);
    if (e) e.count++; else groups.set(key, { tone: U.surf.tone, blend: U.surf.blend, count: 1, el: U.el + (U.pseudo || ''), size: `${U.rect.w}×${U.rect.h}`, sd: U.surf.sd });
  }
  const st = ['dark', 'mid', 'light'].map((k) => surfaceBandOf({ bands, bands64 }, k));
  const status = st.some((b) => b.status === 'есть') ? 'есть' : st.some((b) => b.status === 'нет') ? 'нет' : 'не измерено';
  const statusNote = status === 'есть' ? ''
    : status === 'нет' ? `слои с плиткой найдены (${layers.length}), но на снимках её вклад меньше ${SURFACE_MIN_SD} — фактуры не видно: спрятана, гаснет в режиме наложения или выключена на этом экране`
    : error ? `проход «без фактуры» не сделан: ${error} — сила на странице не измерена, рецепт — по файлу и CSS`
    : 'ровных участков на снимках мало — силу на странице не измерить; рецепт — по файлу и CSS, смотреть вырезы глазами';
  const diagnosis = [];
  for (const k of ['dark', 'mid', 'light']) {
    const b = surfaceBandOf({ bands, bands64 }, k); const m = byTone[k].mode; if (b.status !== 'нет' || !m) continue;
    const adv = blendAdvice(m); const where = `на фоне «${TONE[k]}» (Y ${Math.round(b.y)})`;
    if (b.y < SURFACE_DARK_Y && m !== 'color-burn' && (adv.deadOnDark || m === 'normal')) diagnosis.push(`крупная фактура ${where} не видна: σ ${b.sd} при наложении ${m} — на тёмном оно гаснет → на тёмных полях класть color-burn (затемняет основу: прожилки проступают темнее фона)`);
    else if (b.y >= SURFACE_DARK_Y && (adv.deadOnLight || m === 'color-burn')) diagnosis.push(`крупная фактура ${where} не видна: σ ${b.sd} при наложении ${m} — на светлом оно гаснет → на светлых полях класть multiply`);
    else diagnosis.push(`крупная фактура ${where} не видна: σ ${b.sd} (наложение ${m})`);
  }
  if (tile.seam && tile.seam.max > SEAM_FAIL) diagnosis.push(`у плитки ${tile.file} виден стык: шов ${tile.seam.x} по ширине и ${tile.seam.y} по высоте (больше ${SEAM_FAIL} — края при повторе не сходятся); своя плитка surface-tile.mjs бесшовная`);
  return {
    status, statusNote, layers, users: [...groups.values()], usersCount: users.length, tile, bands, bands64, byTone, bySide, diagnosis, rejected: rejected || [],
    ...(error ? { hideError: error } : {}),
  };
}

/* где сейчас на экране помеченные слои: { k: { x, y, w, h, shown } } — для привязки участков снимка к слоям */
async function layerRectsNow(page, list) {
  const spec = list.map((L) => ({ k: L.k, attr: (L.mark || 'data-rw-tex') + (L.pseudo ? '-' + L.pseudo.slice(2) : '') }));
  const got = await page.evaluate((spec) => {
    const out = {};
    for (const L of spec) {
      const el = document.querySelector(`[${L.attr}="${L.k}"]`); if (!el) continue;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      out[L.k] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), shown: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 };
    }
    return out;
  }, spec).catch(() => null);
  return got || {};
}

/* ======================================================================
   5. Замер на странице
   ====================================================================== */

/**
 * Вклад одного слоя: снимок окна там, где слой виден, со слоем и без него (после mark: true).
 * σ разности на ровных плитках — зерно ли это (холст с шумом в альфе, видео с плёнкой) или гладкий
 * фон (3D-сцена, градиент). → { sd, lag1, tiles } по полосе с наибольшим вкладом или null.
 */
async function soloContribution(page, L, scrollY0 = 0) {
  if (L.position !== 'fixed' && !L.fixedBy) await scrollToY(page, Math.max(0, scrollY0 + L.rect.y - 40));
  await sleep(300);
  const a = await page.screenshot({ type: 'png' });
  await hideTextureLayers(page, [L]); /* CSP не дал вставить стиль — ошибка уходит вызывающему (в «почему»), а не «не зерно» */
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
  await sleep(120);
  const w = await page.screenshot({ type: 'png' });
  await showTextureLayers(page);
  const A = await lumaOf(a), W = await lumaOf(w);
  const c = summarize(grainTiles(A.Y, A.w, A.h, { Yw: W.Y }), { key: 'sdD', yKey: 'yw', lagKey: 'lagD' });
  const bands = ['dark', 'mid', 'light'].map((k) => c[k]).filter((b) => b.status !== 'не измерено');
  if (!bands.length) return null;
  const best = bands.sort((x, y) => y.sd - x.sd)[0];
  return { sd: best.sd, lag1: best.lag1, tiles: best.tiles };
}

/**
 * Замер фактуры на уже открытой (и прокрученной) странице. Опции:
 *   found — результат findTextureLayers с mark:true (иначе ищет сам), dir — куда класть снимки
 *   и файлы текстур, label, screens (4), boilMs (250), pause (900), files (true), withWithout (true), extras.
 * Снимки — окна (screenSegment), по screens экранам равномерно по высоте; на каждом: снимок,
 * ещё два через boilMs и +120 мс (кипение), затем снимок без найденных слоёв.
 * → Result (см. TEXTURE_API.md): grain / without / contribution / lift / boil / status / diagnosis.
 */
export async function measureTexture(page, opts = {}) {
  const { dir = null, label = 'page', screens = 4, boilMs = 250, pause = 900, files = true, withWithout = true, extras = false } = opts;
  needSharp();
  await forceInstantScroll(page);
  const found = opts.found && opts.found.marked ? opts.found : await findTextureLayers(page, { mark: true, extras: extras || !!(opts.found && opts.found.extras) });
  if (dir) ensureDir(dir);
  /* файлы текстур: разбор всех кадров; «плитка» без имени остаётся слоем, только если похожа на шум */
  const patterns = [];
  /* крупная фактура: слои-кандидаты, которых подтвердил разбор файла; rejected — кого не подтвердил (справочно) */
  const surfLayers = []; const surfRejected = [];
  if (files) {
    const cache = new Map(); const parsed = new Map();
    /* файл слоя: получить, разобрать (разбор одного адреса — один раз), сохранить в dir (save) */
    const readFile = async (L, save) => {
      const u = L.fileUrl;
      if (!u || L.kind === 'canvas') return;
      try {
        let got = cache.get(u);
        if (got === undefined) { got = await fetchLayerFile(page, u); cache.set(u, got); }
        if (!got) { L.file = { error: 'файл не получен' }; return; }
        const ext = /^data:image\/svg/i.test(u) || /<svg/i.test(got.buf.slice(0, 200).toString()) ? '.svg' : (() => { try { return path.extname(new URL(u, page.url()).pathname) || '.img'; } catch { return '.img'; } })();
        let fname = null;
        if (dir && save) { fname = path.join(dir, `${label}-layer${L.k}${ext}`); fs.writeFileSync(fname, got.buf); }
        let t = parsed.get(u);
        if (!t) { t = await analyzeTile(got.buf, { name: /^data:/i.test(u) ? `data-URI ${ext.slice(1)}` : path.basename(new URL(u, page.url()).pathname) }); parsed.set(u, t); }
        L.file = { ...t, via: got.via }; if (fname) L.file.saved = fname;
        return { buf: got.buf, ext };
      } catch (e) { L.file = { error: String(e.message || e).slice(0, 160) }; }
      return null;
    };
    const isSurface = (L) => !!(L.file && !L.file.error && L.file.surfaceLike && (L.kind === 'background' || L.kind === 'img' || L.kind === 'picture'));
    for (const L of found.layers) await readFile(L, true);
    for (let i = found.layers.length - 1; i >= 0; i--) {
      const L = found.layers[i];
      /* файл слоя — крупная фактура (мятая бумага, камень, холст): это не зерно, у него свой замер и свой рецепт.
         Раньше такой слой или считался зерном (по имени texture, paper), или отбрасывался как «не шум» */
      if (isSurface(L)) { L.surface = true; continue; }
      if (!L.maybe) continue;
      if (L.file && !L.file.error) {
        if (!L.file.noiseLike) { patterns.push({ el: L.el, urls: L.urls, why: 'по разбору не шум (узор или картинка)' }); found.layers.splice(i, 1); }
        continue;
      }
      /* файла нет (холст, видео) или он не получен — решает разность снимков со слоем и без него одного */
      let soloErr = null;
      const solo = await soloContribution(page, L, found.scrollY || 0).catch((e) => { soloErr = String(e && e.message ? e.message : e).slice(0, 160); return null; });
      L.solo = solo;
      if (!solo || solo.sd < GRAIN_MIN_SD) {
        patterns.push({ el: L.el, urls: L.urls, why: solo ? `по разности снимков со слоем и без — не зерно (σ вклада ${solo.sd} на ${solo.tiles} ровных плитках)` : `${L.file && L.file.error ? L.file.error + '; ' : ''}разность снимков не измерена (${soloErr || 'нет ровных участков'})` });
        found.layers.splice(i, 1);
      }
    }
    /* кандидаты в крупную фактуру (картинка в фоне большого блока): файл сохраняется, только если подтверждён —
       фотографии первого экрана в папке прогона не нужны */
    for (const C of found.surfaceCands || []) {
      const got = await readFile(C, false);
      if (isSurface(C)) {
        C.surface = true; surfLayers.push(C);
        if (dir && got) { const fname = path.join(dir, `${label}-layer${C.k}${got.ext}`); fs.writeFileSync(fname, got.buf); C.file.saved = fname; }
      } else if (surfRejected.length < 6) surfRejected.push({ el: C.el + (C.pseudo || ''), file: C.file && !C.file.error ? C.file.file : null, why: C.file && C.file.error ? C.file.error : C.file ? (C.file.surfaceWhy || []).slice(0, 2).join('; ') : 'файла нет' });
    }
  }
  /* слои зерна — как раньше; слои крупной фактуры — отдельным списком (found.layers не меняется: его читает discover) */
  const layers = found.layers.filter((L) => !L.surface);
  surfLayers.unshift(...found.layers.filter((L) => L.surface));
  for (const L of surfLayers) {
    L.via = L.kind !== 'background' ? 'картинка' : L.hide === 'background' ? 'фон блока' : 'слой';
    /* у крупной фактуры из фона убирается только картинка: цвет поля, тень и рамка блока остаются */
    if (L.kind === 'background' && (L.hideUrls || []).length) L.hide = 'background';
  }
  /* та же плитка на мелких блоках (карточки, плашки) — пометить, чтобы проход «без крупной фактуры» убрал её везде */
  let surfUsers = [];
  if (surfLayers.length) {
    const absOf = (u) => { if (/^data:/i.test(u)) return u; try { return new URL(u, page.url()).href; } catch { return u; } };
    const urls = [...new Set(surfLayers.map((L) => absOf(L.fileUrl)))];
    const from = 1 + Math.max(-1, ...found.layers.map((L) => L.k), ...(found.surfaceCands || []).map((L) => L.k));
    const got = await page.evaluate(`(${SURFACE_USERS_FN})(${JSON.stringify({ urls, from })})`).catch(() => null);
    surfUsers = got ? got.users : [];
    for (const U of surfUsers) { U.scrollY0 = got.scrollY; U.via = 'фон блока'; }
  }
  const surfHide = surfLayers.concat(surfUsers);

  const vh = found.vh; const vpNow = page.viewport() || { width: found.vw, height: vh, deviceScaleFactor: found.dpr };
  const total = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
  const ys = segmentPositions(total, vh, { step: 1, maxShots: Math.max(1, Number(screens) || 4) });
  const allTiles = []; const perScreen = []; const surfTiles = []; const surfRects = [];
  let hasLayers = layers.length > 0 && withWithout;
  let hasSurf = surfHide.length > 0;
  /* как прятался слой: 'style' или 'adopted' (строгий CSP); не спрятался — прохода «без слоя» нет */
  const hideInfo = { via: null }; let hideError = null, surfError = null;
  const settleFrame = async () => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {}); await sleep(120); };
  for (let i = 0; i < ys.length; i++) {
    const seg = await screenSegment(page, ys[i], { pause, settle: 800, mediaTimeout: 4000 });
    const a = seg.buffer;
    await sleep(boilMs); const b = await page.screenshot({ type: 'png' });
    await sleep(120); const c = await page.screenshot({ type: 'png' });
    /* без крупной фактуры (зерно, если есть, остаётся): на этом снимке меряется зерно — иначе прожилки и заломы
       плитки сошли бы за него — и от него считается вклад самой фактуры */
    let nosurf = null;
    surfRects.push(hasSurf ? await layerRectsNow(page, surfHide) : null);
    if (hasSurf) {
      try { await hideTextureLayers(page, surfHide, hideInfo); } catch (e) { surfError = String(e && e.message ? e.message : e).slice(0, 160); }
      if (surfError) { await showTextureLayers(page).catch(() => {}); hasSurf = false; }
      else { await settleFrame(); nosurf = await page.screenshot({ type: 'png' }); await showTextureLayers(page); }
    }
    let wbuf = null;
    if (hasLayers) {
      try { await hideTextureLayers(page, hasSurf ? layers.concat(surfHide) : layers, hideInfo); } catch (e) { hideError = String(e && e.message ? e.message : e).slice(0, 160); }
      if (hideError) {
        /* снимок «без слоя» был бы снимком со слоем: вклад вышел бы 0, а статус — ложное «нет» */
        await showTextureLayers(page).catch(() => {});
        hasLayers = false; /* итог — по снимкам со слоем, без вклада; причина — в diagnosis */
      } else {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
        await sleep(120);
        wbuf = await page.screenshot({ type: 'png' });
        await showTextureLayers(page);
      }
    }
    /* есть и зерно, и крупная фактура: её вклад — между снимками без зерна (с ней и без неё), чтобы кипящее
       зерно не попало в разность */
    let surfOnly = null;
    if (hasSurf && nosurf && wbuf) {
      try { await hideTextureLayers(page, layers, hideInfo); await settleFrame(); surfOnly = await page.screenshot({ type: 'png' }); } catch { surfOnly = null; }
      await showTextureLayers(page).catch(() => {});
    }
    const shots = {};
    if (dir) {
      const put = (buf, tag) => { if (!buf) return null; const f = path.join(dir, `${label}-s${i}-${tag}.png`); fs.writeFileSync(f, buf); return f; };
      shots.a = put(a, 'a'); shots.b = put(b, 'b'); shots.c = put(c, 'c'); shots.without = put(wbuf, 'without');
      if (nosurf) shots.nosurface = put(nosurf, 'nosurface');
    }
    const A = await lumaOf(a); const B = await lumaOf(b); const C = await lumaOf(c); const Wl = wbuf ? await lumaOf(wbuf) : null;
    const Ns = nosurf ? await lumaOf(nosurf) : null; const So = surfOnly ? await lumaOf(surfOnly) : null;
    /* зерно: на снимке без крупной фактуры. Ровность плиток решает снимок без слоёв зерна, а если их нет —
       тот же снимок без фактуры (порог абсолютный, как раньше у слоёв «по имени»): относительный порог,
       когда ровных фонов мало, принимает за ровные плитки фотографии (σ 20–34 вместо зерна) */
    const tiles = grainTiles(Ns ? Ns.Y : A.Y, A.w, A.h, { Y2: B.Y, Y3: C.Y, Yw: Wl ? Wl.Y : Ns ? Ns.Y : null, Yf: A.Y });
    for (const t of tiles) t.s = i;
    allTiles.push(...tiles);
    const bb = bandsAll(tiles, !!Wl);
    perScreen.push({ y: ys[i], scrollY: seg.scrollY, with: bb.grain, without: bb.without, contribution: bb.contribution, lift: bb.lift, shots });
    if (Ns) {
      const st = So && Wl ? grainTiles(So.Y, A.w, A.h, { Yw: Wl.Y }) : grainTiles(A.Y, A.w, A.h, { Yw: Ns.Y });
      for (const t of st) { t.s = i; surfTiles.push(t); }
    }
  }
  allTiles.total = perScreen.reduce((s, p) => s + (p.with.considered || 0), 0);
  const B = bandsAll(allTiles, hasLayers);
  const res = {
    url: page.url(), label, viewport: { name: page.vpName || vpNow.name || `${vpNow.width}x${vpNow.height}@${vpNow.deviceScaleFactor || 1}`, width: vpNow.width, height: vpNow.height, dpr: found.dpr },
    takenAt: new Date().toISOString(), page: { vw: found.vw, vh: found.vh, dpr: found.dpr, bodyBg: found.bodyBg },
    layers, patterns, svgNoise: found.svgNoise, bodyAfterUsed: found.bodyAfterUsed, bodyBeforeUsed: found.bodyBeforeUsed, unreadableSheets: found.unreadableSheets,
    ...(found.extras ? { extras: found.extras } : {}),
    screens: perScreen, grain: B.grain, without: B.without, contribution: B.contribution, lift: B.lift,
    /* как прятался слой для прохода «без слоя»: 'style' или 'adopted' (строгий CSP); hideError — не спрятался */
    ...(hideInfo.via ? { hideVia: hideInfo.via } : {}), ...(hideError ? { hideError } : {}),
  };
  /* крупная фактура: слои, плитка, сила на снимках по полосам фона, режимы наложения по тону секции */
  res.surface = surfaceResult({ layers: surfLayers, users: surfUsers, tiles: surfTiles, screens: surfRects.map((rects) => ({ rects })), rejected: surfRejected, error: surfError, measured: files });
  /* кипение: «да / нет» — по снимкам; частота — из файла или @keyframes */
  const src = boilSource(layers);
  const gAll = B.grain.all; const flick = gAll.flicker; const sdAll = gAll.sd;
  let boils = null, ratio = null;
  if (gAll.status !== 'не измерено' && sdAll >= GRAIN_MIN_SD && flick != null) { ratio = r2(flick / sdAll); boils = ratio >= 0.5 ? true : ratio < 0.25 ? false : 'слабо'; }
  else if (src && gAll.status === 'есть') boils = true;
  res.boil = { boils, flicker: flick, sd: sdAll, ratio, source: src ? src.source : boils != null ? 'снимки' : null, frames: src ? src.frames : null, frameMs: src ? src.frameMs : null, cycleMs: src ? src.cycleMs : null, smooth: src ? !!src.smooth : null, of: src ? src.of : null };
  const bands = ['dark', 'mid', 'light'].map((k) => B.grain[k]);
  res.status = bands.some((b) => b.status === 'есть') ? 'есть' : bands.some((b) => b.status === 'нет') ? 'нет' : 'не измерено';
  res.statusNote = res.status === 'не измерено' ? `ровных плиток мало (тёмных ${B.grain.dark.tiles}, средних ${B.grain.mid.tiles}, светлых ${B.grain.light.tiles}; нужно ≥ ${MIN_TILES} в полосе) — это «не измерено», а не «зерна нет»` : '';
  /* слой найден и снят проход «без слоя» — решает вклад слоя: σ на снимке могут давать
     картины, градиенты и сжатие картинок, а не зерно (на «ХОЛСТе» σ 1.63 в средних тонах при вкладе 0.32) */
  if (hasLayers && res.status === 'есть' && B.contribution) {
    const cb = ['dark', 'mid', 'light'].map((k) => B.contribution[k]).filter((b) => b.status !== 'не измерено');
    if (cb.length && cb.every((b) => b.sd < GRAIN_MIN_SD)) {
      const names = { dark: 'тёмный', mid: 'средний', light: 'светлый' };
      const from = ['dark', 'mid', 'light'].filter((k) => B.grain[k].status === 'есть').map((k) => `${names[k]} σ ${B.grain[k].sd}`).join(', ');
      res.status = 'нет';
      res.statusNote = `слой найден, но его вклад «со слоем − без» меньше ${GRAIN_MIN_SD} на всех фонах; σ на снимке (${from}) дают картинки и градиенты, а не зерно`;
    }
  }
  res.diagnosis = diagnose(res);
  if (dir) {
    const pick = (f) => allTiles.filter((t) => f(t.y_mean)).sort((x, y) => y.sd - x.sd)[Math.floor(allTiles.filter((t) => f(t.y_mean)).length / 2)];
    for (const [f, tag] of [[(y) => y < 60, 'dark'], [(y) => y > 190, 'light'], [(y) => y >= 60 && y <= 190, 'mid']]) {
      const t = pick(f); if (!t) continue;
      const shot = perScreen[t.s] && perScreen[t.s].shots.a; if (!shot) continue;
      try { res[`crop_${tag}`] = await cropTile(shot, t, path.join(dir, `${label}-crop-${tag}.png`)); } catch { /* нет выреза */ }
    }
  }
  return res;
}

/**
 * Открыть адрес на экране и снять фактуру. { viewport = 'desktop' (имя или объект), out, label,
 * screens = 4, browser = null (свой браузер закрывается в finally), settle = 3000, extras }.
 */
export async function textureOnUrl(url, { viewport = 'desktop', out = null, label = null, screens = 4, browser = null, settle = 3000, extras = false } = {}) {
  const rv = typeof viewport === 'object' ? [viewport.name || 'custom', viewport] : resolveViewport(viewport);
  if (!rv) throw new Error(`Неизвестный экран ${viewport}`);
  const [vpName, vp] = rv;
  const own = !browser; const br = browser || await launch();
  let page;
  try {
    page = await openPage(br, url, vp, { settle });
    page.vpName = vpName;
    await forceInstantScroll(page);
    await scrollThrough(page, { pause: 250 }); /* ленивые фоны (Tilda t-bgimg) грузятся только при прокрутке */
    await sleep(600);
    const lbl = label || `${slugFromUrl(url).slice(0, 40)}-${vpName}`;
    const res = await measureTexture(page, { dir: out, label: lbl, screens, extras });
    res.url = url;
    res.viewport.name = vpName;
    if (page.retries) res.retries = page.retries;
    return res;
  } finally {
    if (page) await page.close().catch(() => {});
    if (own) await br.close().catch(() => {});
  }
}

/* ======================================================================
   6. Рецепт, токены, шаблон, markdown
   ====================================================================== */

const mainLayer = (res) => (res.layers || []).slice().sort((a, b) => (b.coversViewport - a.coversViewport) || ((b.file && !b.file.error) - (a.file && !a.file.error)) || (b.rect.w * b.rect.h - a.rect.w * a.rect.h))[0] || null;
const minWidthOf = (conds) => { let best = null; for (const c of conds || []) for (const m of String(c).matchAll(/min-width:\s*([\d.]+)px/g)) best = Math.max(best || 0, Number(m[1])); return best; };

/**
 * Рецепт повторения фактуры своей плиткой по результатам экранов (один Result или массив).
 * → { present, none, minWidth, minWidthNote, sd, bandsSd, opacity, tileSd, px, size, rendering, blend,
 *     blendNote, frames, frameMs, boil, boilSource, lift, tileCmd, notes[], base }
 */
export function recipeFrom(results, { tileSd = TILE_SD } = {}) {
  const list = (Array.isArray(results) ? results : [results]).filter(Boolean);
  const present = {}; for (const r of list) present[r.viewport.name] = r.status === 'есть' ? true : r.status === 'нет' ? false : null;
  const withGrain = list.filter((r) => r.status === 'есть');
  const base = withGrain.filter((r) => r.viewport.dpr === 1).sort((a, b) => b.viewport.width - a.viewport.width)[0] || withGrain.sort((a, b) => a.viewport.dpr - b.viewport.dpr)[0] || null;
  const notes = [];
  const rec = { present, none: !base, tileSd, size: 256, px: 1, rendering: 'auto', blend: 'normal', blendNote: '', opacity: null, sd: null, bandsSd: null, frames: 1, frameMs: 100, boil: false, boilSource: null, lift: null, minWidth: 0, minWidthNote: '', notes, base: base ? base.viewport.name : null };
  /* крупная фактура — свой рецепт (null, если замер старый и её не снимал); зерну он не мешает */
  const surf = surfaceRecipe(list); if (surf) rec.surface = surf;
  if (!base) { notes.push(list.some((r) => r.status === 'не измерено') ? 'зерно не измерено (мало ровных участков) — повторять нечего доказать; смотреть вырезы 1:1 глазами' : 'у донора зерна нет ни на одном экране — слой не нужен'); return rec; }
  const L = mainLayer(base);
  const bandsSd = {}; for (const k of ['dark', 'mid', 'light']) { const b = grainBand(base, k); bandsSd[k] = b.status === 'не измерено' ? null : b.sd; }
  rec.bandsSd = bandsSd;
  const measured = Object.values(bandsSd).filter((v) => v != null && v >= GRAIN_MIN_SD);
  rec.sd = r2(median(measured.length ? measured : Object.values(bandsSd).filter((v) => v != null)));
  const mode = L ? layerBlend(L) : 'normal'; const adv = blendAdvice(mode);
  if (!L) { notes.push('слой не найден, зерно — в самих картинках/фонах: своим слоем его не повторить один в один'); }
  if (adv.even) { rec.blend = mode === 'hard-light' ? 'hard-light' : 'normal'; rec.opacity = r3(rec.sd / tileSd); rec.blendNote = `${mode} у донора → ${rec.blend}; opacity = σ ${rec.sd} / σ плитки ${tileSd}`; }
  else {
    rec.blend = mode;
    const byFile = L && L.file && !L.file.error ? r3(L.effectiveOpacity * (L.file.frames[0].sdOver || L.file.frames[0].sd) / tileSd) : null;
    rec.opacity = byFile || r3((bandsSd.light || rec.sd) / tileSd);
    rec.blendNote = `у донора ${adv.text}; повторять тем же режимом, стартовая opacity ${rec.opacity} — подогнать по compare`;
  }
  /* зерно: размер в CSS px — из файла (ячейка × масштаб фона), иначе из lag1 снимка */
  const f = L && L.file && !L.file.error ? L.file : null;
  if (f) {
    const cellFile = Math.max(1, Math.round(1 / (1 - Math.max(0, Math.min(0.9, f.frames[0].lag1 || 0)))));
    const bs = /^([\d.]+)px/.exec(L.backgroundSize || ''); const scale = bs ? Number(bs[1]) / f.width : 1;
    rec.px = Math.max(1, Math.round(cellFile * scale));
  } else {
    const lag = grainBand(base, 'all').lag1 || 0; const pDev = 1 / (1 - Math.max(0, Math.min(0.9, lag)));
    rec.px = Math.max(1, Math.round(pDev / (base.viewport.dpr || 1)));
  }
  rec.rendering = L && L.imageRendering && L.imageRendering !== 'auto' ? L.imageRendering : 'auto';
  const bo = base.boil || {};
  rec.boil = bo.boils === true || bo.boils === 'слабо';
  rec.boilSource = bo.source;
  if (rec.boil && bo.frames) { rec.frames = bo.frames; rec.frameMs = bo.frameMs || 100; }
  else if (rec.boil) { rec.frames = 4; rec.frameMs = 100; notes.push('кипит, но частоту не из чего взять (нет файла и @keyframes с steps) — 4 × 100 мс по умолчанию, проверить глазами'); }
  else { rec.frames = 1; rec.frameMs = 100; }
  rec.lift = base.lift ? base.lift.dark : null;
  /* с какой ширины: @media у слоя, иначе по экранам с зерном и без */
  const mw = L ? minWidthOf(L.mediaRules) : null;
  const sorted = list.slice().sort((a, b) => a.viewport.width - b.viewport.width);
  const lowestWith = sorted.find((r) => present[r.viewport.name] === true);
  const widestWithout = sorted.filter((r) => present[r.viewport.name] === false && r.viewport.width < (lowestWith ? lowestWith.viewport.width : Infinity)).pop();
  if (mw) { rec.minWidth = mw; rec.minWidthNote = `из @media у слоя (${L.mediaRules.find((c) => /min-width/.test(c))})`; }
  else if (widestWithout && lowestWith) { rec.minWidth = lowestWith.viewport.width; rec.minWidthNote = `по экранам: на ${widestWithout.viewport.width} px зерна нет, на ${lowestWith.viewport.width} px есть — точная граница между ними`; }
  else rec.minWidthNote = 'зерно на всех снятых экранах';
  if (list.some((r) => r.viewport.dpr !== base.viewport.dpr && r.status === 'есть')) notes.push(`на экранах с DPR ≠ ${base.viewport.dpr} сила другая (сглаживание плитки): сравнивать донора и сборку только при одинаковом DPR`);
  rec.tileCmd = `node grain-tile.mjs --out <папка сайта>${rec.px > 1 ? ` --px ${rec.px}` : ''}   (σ плитки ${tileSd}; чужой файл не переносить)`;
  if (L && L.svg) notes.push('у донора шум из feTurbulence: своя плитка повторяет его силу числом, форма зерна другая — сверять compare');
  return rec;
}

/**
 * Рецепт крупной фактуры по результатам экранов: чем повторить её своей плиткой (surface-tile.mjs) и как
 * положить (templates/surface.css). null — у замеров нет поля surface (texture.json до 01.10.2026).
 * → { present, none, base, measured, tile { file, width, height, bytes, mean, sd, lag1, chroma, tint, seam },
 *     shown { size, repeat, px, stretched }, via, size — период показа своей плитки, px,
 *     blend { dark, mid, light } — наложение у донора по тону секции, use { light, dark } — что класть у себя,
 *     opacity, tileMean, tileSd — цель для своей плитки, sd { dark, mid, light } — σ на снимках, lift,
 *     sections[], small[], smallCount, off[], minWidth, minWidthNote, reducedMotion, tileCmd, tileName, notes[] }
 */
export function surfaceRecipe(results) {
  const list = (Array.isArray(results) ? results : [results]).filter((r) => r && r.surface);
  if (!list.length) return null;
  const present = {}; for (const r of list) present[r.viewport.name] = r.surface.status === 'есть' ? true : r.surface.status === 'нет' ? false : null;
  const cand = list.filter((r) => (r.surface.layers || []).length && r.surface.status !== 'нет');
  const seen = cand.filter((r) => r.surface.status === 'есть');
  const base = seen.filter((r) => r.viewport.dpr === 1).sort((a, b) => b.viewport.width - a.viewport.width)[0] || seen.sort((a, b) => a.viewport.dpr - b.viewport.dpr)[0] || cand[0] || null;
  const notes = [];
  const rec = { present, none: !base, base: base ? base.viewport.name : null, notes };
  if (!base) { notes.push(list.some((r) => (r.surface.layers || []).length) ? 'слои с плиткой есть, но на снимках её не видно — повторять нечего' : 'крупной фактуры нет — фон ровный (или с зерном, см. выше)'); return rec; }
  const S = base.surface, T = S.tile;
  rec.measured = S.status === 'есть';
  rec.tile = { file: T.file, width: T.width, height: T.height, bytes: T.bytes, mean: T.mean, sd: T.sd, lag1: T.lag1, chroma: T.chroma, tint: T.tint, seam: T.seam ? T.seam.max : null };
  const vis = S.layers.filter((L) => !L.surf.hidden);
  const main = (vis.length ? vis : S.layers).slice().sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0];
  rec.shown = main.surf.shown; rec.via = main.surf.via;
  /* период показа своей плитки: как у донора; картинка, растянутая на блок, плиткой не была — берём 1024 */
  rec.size = rec.shown.px && !rec.shown.stretched ? Math.max(256, Math.min(2048, rec.shown.px)) : 1024;
  /* наложение у донора: на светлых полях (Y от SURFACE_DARK_Y) и на тёмных */
  const side = S.bySide || { light: { mode: S.byTone.light.mode }, dark: { mode: S.byTone.dark.mode } };
  rec.blend = { light: side.light.mode, dark: side.dark.mode };
  /* что класть у себя: на светлых и цветных полях — умножение на цвет поля (обычный слой донора с непрозрачной
     светлой плиткой на белом выглядит так же, а на цветном поле умножение цвет сохраняет); на тёмных — как у
     донора, а если у донора там фактуры нет — color-burn: умножение на тёмном гаснет */
  const soft = (m) => !m || ['normal', 'multiply', 'darken'].includes(m);
  rec.use = { light: soft(rec.blend.light) ? 'multiply' : rec.blend.light, dark: rec.blend.dark && rec.blend.dark !== 'normal' ? rec.blend.dark : 'color-burn' };
  /* прозрачность слоя донора уходит в силу своей плитки: в фоне блока картинку не сделать прозрачнее, чем блок */
  const ops = vis.filter((L) => L.surf.via !== 'фон блока').map((L) => L.surf.opacity).filter((v) => v != null);
  rec.opacity = ops.length ? r2(median(ops)) : 1;
  rec.tileMean = r2(255 - (255 - T.mean) * rec.opacity); rec.tileSd = r2(T.sd * rec.opacity);
  rec.sd = {}; rec.lift = {};
  for (const k of ['dark', 'mid', 'light']) { const b = surfaceBandOf(S, k); rec.sd[k] = b.status === 'не измерено' ? null : b.sd; rec.lift[k] = b.status === 'не измерено' ? null : b.lift; }
  rec.sections = S.layers.map((L) => ({ el: L.el + (L.pseudo || ''), via: L.surf.via, tone: L.surf.tone, y: L.surf.y, blend: L.surf.blend, opacity: L.surf.opacity, size: L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`, sd: L.surf.sd, lift: L.surf.lift, hidden: L.surf.hidden }));
  rec.small = S.users || []; rec.smallCount = S.usersCount || 0;
  /* где выключена: правила @media у слоёв, которые её прячут или убирают картинку */
  const off = new Map();
  for (const L of S.layers) for (const m of L.mediaOff || []) { const key = `${m.cond}|${m.how}`; const e = off.get(key) || { cond: m.cond, how: m.how, els: [] }; e.els.push(L.el + (L.pseudo || '')); off.set(key, e); }
  rec.off = [...off.values()].map((e) => ({ cond: e.cond, how: e.how, layers: e.els.length, of: S.layers.length, el: e.els.length === 1 && S.layers.length > 1 ? e.els[0] : null }));
  const printed = new Set(); for (const L of S.layers) if ((L.mediaOff || []).some((m) => /print/.test(m.cond))) printed.add(L.k);
  rec.print = !printed.size ? 'остаётся' : printed.size === S.layers.length ? 'выключена' : `выключена у ${printed.size} из ${S.layers.length} секций`;
  rec.reducedMotion = rec.off.some((e) => /prefers-reduced-motion/.test(e.cond)) ? 'выключена' : 'остаётся (она неподвижна)';
  /* с какой ширины: правило max-width у всех слоёв, иначе по экранам с фактурой и без */
  const maxW = rec.off.filter((e) => e.layers === e.of).map((e) => /max-width:\s*([\d.]+)px/.exec(e.cond)).filter(Boolean).map((m) => Number(m[1]));
  const sorted = list.slice().sort((a, b) => a.viewport.width - b.viewport.width);
  const lowestWith = sorted.find((r) => present[r.viewport.name] === true);
  const widestWithout = sorted.filter((r) => present[r.viewport.name] === false && r.viewport.width < (lowestWith ? lowestWith.viewport.width : Infinity)).pop();
  rec.minWidth = 0;
  if (maxW.length) { rec.minWidth = Math.max(...maxW) + 1; rec.minWidthNote = `из @media у слоёв: до ${Math.max(...maxW)} px выключена`; }
  else if (widestWithout && lowestWith) { rec.minWidth = lowestWith.viewport.width; rec.minWidthNote = `по экранам: на ${widestWithout.viewport.width} px фактуры нет, на ${lowestWith.viewport.width} px есть — точная граница между ними`; }
  else rec.minWidthNote = list.length > 1 ? 'на всех снятых экранах' : `снят один экран (${base.viewport.name}) — телефон проверить отдельно`;
  rec.tileName = `surface-paper-${rec.size}.webp`;
  rec.tileCmd = `node surface-tile.mjs --out <папка сайта> --kind paper --size ${rec.size} --mean ${rec.tileMean} --sd ${rec.tileSd}   (вид — paper, stone или canvas — выбрать глазами; чужой файл не переносить)`;
  if (!rec.measured) notes.push(S.statusNote);
  if (rec.blend.light === 'normal' && rec.via !== 'фон блока') notes.push('у донора на светлых секциях плитка лежит обычным слоем и сама служит фоном; у себя — умножением на цвет поля: на белом вид тот же, на цветном поле цвет сохраняется');
  if (!rec.blend.light) notes.push('на светлых полях у донора фактуры нет (или её там не измерить) — multiply для них взят по правилу, а не с донора');
  if (!rec.blend.dark) notes.push('на тёмных полях у донора фактуры нет (или её там не измерить) — color-burn для них взят по правилу, а не с донора');
  else if (rec.blend.dark === 'normal') notes.push('на тёмных полях у донора плитка лежит обычным слоем — светлая плитка закрывает тёмный цвет; у себя — color-burn, цвет поля остаётся');
  else if (rec.blend.dark !== 'color-burn') notes.push(`на тёмных полях у донора ${blendAdvice(rec.blend.dark).text}`);
  if (rec.opacity < 0.98) notes.push(`слой донора полупрозрачный (${rec.opacity}): сила переведена в плитку — яркость ${rec.tileMean} ± ${rec.tileSd} вместо ${T.mean} ± ${T.sd}`);
  if (rec.shown.stretched) notes.push(`у донора картинка растянута на блок (${rec.shown.size}), а не повторяется — у себя класть плиткой ${rec.size} px с повтором`);
  if (rec.shown.px && !rec.shown.stretched && rec.shown.px !== rec.size) notes.push(`период показа у донора ${rec.shown.px} px — взят ${rec.size} px (плитка surface-tile.mjs — от 256 до 2048 px)`);
  if (T.chroma > 12) notes.push(`плитка донора цветная (средний цвет ${T.tint}, цветность ${T.chroma}): своя плитка серая, цвет даёт поле под ней`);
  if (T.seam && T.seam.max > SEAM_FAIL) notes.push(`у плитки донора виден стык (шов ${T.seam.max}) — своя бесшовная`);
  if (S.tile.files > 1) notes.push(`у донора ${S.tile.files} разных плитки — рецепт по самой частой (${T.file})`);
  return rec;
}

/* строки про крупную фактуру для комментария блока переменных */
function surfaceTokenLines(S, list) {
  const per = list.filter((r) => r.surface).map((r) => {
    const b = (k) => { const x = surfaceBandOf(r.surface, k); return x.status === 'не измерено' ? '—' : x.sd; };
    return `${r.viewport.name} ${r.surface.status}${(r.surface.layers || []).length ? ` (σ на снимке тёмный ${b('dark')} / средний ${b('mid')} / светлый ${b('light')})` : ''}`;
  });
  const bl = (k) => S.blend[k] || '—';
  return [
    `   крупная фактура (картинка-плитка): ${per.join('; ')}`,
    `   плитка донора ${S.tile.width}×${S.tile.height}, яркость ${S.tile.mean} ± ${S.tile.sd}, показ ${S.shown.size} ${S.shown.repeat}; наложение у донора: светлые поля ${bl('light')}, тёмные ${bl('dark')}`,
    `   своя плитка: ${S.tileCmd}; класть — templates/surface.css`,
  ];
}

/** Блок переменных для site.tokens.css (с маркерами texture:start/end и сырыми замерами в комментарии). */
export function tokensBlock(rec, results = []) {
  const list = (Array.isArray(results) ? results : [results]).filter(Boolean);
  const raw = list.map((r) => {
    const b = (k) => { const x = grainBand(r, k); return x.status === 'не измерено' ? '—' : x.sd; };
    return `   ${r.viewport.name} ${r.viewport.width}×${r.viewport.height}@${r.viewport.dpr}: ${r.status}; σ${r.contribution ? ' (вклад слоя)' : ''} тёмный ${b('dark')} / средний ${b('mid')} / светлый ${b('light')}, lag1 ${grainBand(r, 'all').lag1 ?? '—'}, кипение ${r.boil && r.boil.boils === true ? 'да' : r.boil && r.boil.boils === false ? 'нет' : r.boil && r.boil.boils ? r.boil.boils : '—'}${r.boil && r.boil.frames ? ` (${r.boil.frames} × ${r.boil.frameMs} мс, ${r.boil.source})` : ''}${r.lift && r.lift.dark != null ? `, подъём чёрного ${r.lift.dark}` : ''}`;
  });
  /* адрес внутри комментария CSS: «*\/» в нём закрыл бы комментарий раньше времени */
  const src = list[0] && list[0].url ? String(list[0].url).replace(/\*\//g, '*%2F') : '';
  /* крупная фактура: строки в комментарий и переменные --surface-*; нет её — блок прежний, знак в знак */
  const S = rec.surface && !rec.surface.none ? rec.surface : null;
  return [
    '/* texture:start */',
    `/* Фактура (texture.mjs${src ? `, ${src}` : ''}, ${new Date().toISOString().slice(0, 10)}):`,
    ...raw,
    `   ${!rec.none ? `рецепт: ${rec.blendNote}; ${rec.minWidthNote}` : list.some((r) => r.status === 'не измерено') ? 'зерно не измерено (мало ровных участков) — переменные ниже выключают слой; решать глазами по вырезам 1:1' : 'зерна нет — переменные ниже выключают слой (opacity 0)'}`,
    `   ${rec.tileCmd ? `плитка: ${rec.tileCmd}` : 'плитка не нужна, пока зерна нет'}${S ? '' : ' */'}`,
    ...(S ? surfaceTokenLines(S, list).map((l, i, a) => l.replace(/\*\//g, '*%2F') + (i === a.length - 1 ? ' */' : '')) : []),
    ':root{',
    `  --grain-opacity: ${rec.none ? 0 : rec.opacity};`,
    `  --grain-size: ${rec.size}px;`,
    `  --grain-px: ${rec.px};`,
    `  --grain-frames: ${rec.frames};`,
    `  --grain-frame-ms: ${rec.frameMs}ms;`,
    `  --grain-blend: ${rec.blend};`,
    `  --grain-min-width: ${rec.minWidth || 0}px;`,
    `  --grain-rendering: ${rec.rendering};`,
    ...(S ? [
      `  --surface-size: ${S.size}px;`,
      `  --surface-blend: ${S.use.light};`,
      `  --surface-blend-dark: ${S.use.dark};`,
      `  --surface-min-width: ${S.minWidth || 0}px;`,
      `  --surface-mean: ${S.tileMean};`,
      `  --surface-sd: ${S.tileSd};`,
    ] : []),
    '}',
    '/* texture:end */',
  ].join('\n');
}

/* сдвиги «кадров» внутри плитки: не кратные ей, далеко друг от друга, в пределах [0, size) */
function boilShifts(n, size) {
  if (n === 4 && size === 256) return [[0, 0], [97, 173], [211, 41], [59, 229]];
  const out = [[0, 0]]; let a = 97, b = 173;
  for (let i = 1; i < n; i++) { out.push([a % (size - 16), b % (size - 16)]); a += 113; b += 71; }
  return out;
}

/** templates/grain.css с подставленными значениями рецепта (@media по minWidth, N кадров @keyframes). */
export function fillGrainCss(rec, { tile = null, template = TEMPLATE } = {}) {
  let css = fs.readFileSync(template, 'utf8');
  const set = (name, val) => { css = css.replace(new RegExp(`(${name}:\\s*)[^;]+;`), `$1${val};`); };
  const tileFile = tile || `grain-gray-256${rec.px > 1 ? `-px${rec.px}` : ''}.png`;
  set('--grain-tile', `url(${tileFile})`);
  set('--grain-size', `${rec.size}px`);
  set('--grain-opacity', rec.none ? '0' : String(rec.opacity));
  set('--grain-blend', rec.blend);
  set('--grain-rendering', rec.rendering);
  set('--grain-frames', String(rec.frames));
  set('--grain-frame-ms', `${rec.frameMs}ms`);
  set('--grain-px', String(rec.px));
  set('--grain-min-width', `${rec.minWidth || 0}px`);
  css = css.replace(/@media \(min-width:\s*[\d.]+px\)\s*\{\s*\/\* grain-min-width \*\//, `@media (min-width: ${rec.minWidth || 0}px) { /* grain-min-width */`);
  const sh = boilShifts(Math.max(1, rec.boil ? rec.frames : 1), rec.size);
  const kf = `@keyframes grain-boil{\n${sh.map(([x, y], i) => `  ${`${r2(i * 100 / sh.length)}%`.padEnd(6)}{transform:translate(${x}px,${y}px)}`).join('\n')}\n}`;
  css = css.replace(/\/\* grain-keyframes:start \*\/[\s\S]*?\/\* grain-keyframes:end \*\//, `/* grain-keyframes:start */\n${kf}\n/* grain-keyframes:end */`);
  if (!rec.boil) css = css.replace(/animation:grain-boil[^;]*;/, 'animation:none;');
  return css;
}

/**
 * templates/surface.css с подставленным рецептом крупной фактуры (S — recipe.surface): период показа,
 * режимы наложения для светлых и тёмных полей, @media по ширине; tile — имя файла своей плитки.
 */
export function fillSurfaceCss(S, { tile = null, template = TEMPLATE_SURFACE } = {}) {
  let css = fs.readFileSync(template, 'utf8');
  const set = (name, val) => { css = css.replace(new RegExp(`(${name}:\\s*)[^;]+;`), (m, head) => `${head}${val};`); };
  set('--surface-tile', `url(${tile || S.tileName})`);
  set('--surface-size', `${S.size}px`);
  set('--surface-blend', S.use.light);
  set('--surface-blend-dark', S.use.dark);
  set('--surface-min-width', `${S.minWidth || 0}px`);
  css = css.replace(/@media \(min-width:\s*[\d.]+px\)\s*\{\s*\/\* surface-min-width \*\//, `@media (min-width: ${S.minWidth || 0}px) { /* surface-min-width */`);
  return css;
}

/* подраздел «Крупная фактура» для discovery.md: таблица по экранам, плитка, слои, рецепт. Замер старый
   (поля surface нет) — пусто; фактуры нет — одна строка */
function surfaceMarkdown(list, S) {
  const withField = list.filter((r) => r.surface);
  if (!withField.length || !S) return [];
  if (S.none && !withField.some((r) => (r.surface.layers || []).length)) return ['', 'Крупная фактура (картинка-плитка в фоне: мятая бумага, камень, ткань): нет — таких картинок на странице не найдено.'];
  const b = (r, k) => { const x = surfaceBandOf(r.surface, k); return x.status === 'не измерено' ? (x.blocks ? `не измерено (${x.blocks} уч.)` : '—') : `${x.sd}${x.status === 'есть' ? '' : ' (нет)'}`; };
  const lines = ['', '### Крупная фактура (картинка-плитка)', '',
    'Не зерно: светлая картинка-плитка с деталями крупнее пикселя — прожилки, заломы, нити. σ — разброс её вклада (снимок с плиткой − без) на ровных участках 128 px (где их мало — 64 px), подъём — насколько она темнит или светлит фон.', '',
    '| экран | фактура | σ тёмный | σ средний | σ светлый | слоёв | мелких блоков |', '|---|---|---|---|---|---|---|'];
  for (const r of withField) lines.push(`| ${r.viewport.name} ${r.viewport.width}×${r.viewport.height}@${r.viewport.dpr} | ${r.surface.status} | ${b(r, 'dark')} | ${b(r, 'mid')} | ${b(r, 'light')} | ${(r.surface.layers || []).length} | ${r.surface.usersCount || 0} |`);
  lines.push('');
  const seenTile = new Set(), seenLayer = new Set();
  for (const r of withField) {
    const T = r.surface.tile;
    if (T && !seenTile.has(T.file)) { seenTile.add(T.file); lines.push(`- **плитка ${T.file}**: ${T.format} ${T.width}×${T.height}, ${Math.round(T.bytes / 1024)} КБ; яркость ${T.mean} ± ${T.sd}, lag1 ${T.lag1}, цветность ${T.chroma}${T.seam ? `, шов ${T.seam.max}${T.seam.max > SEAM_FAIL ? ' (стык виден)' : ''}` : ''} — только для замера, на сайт не переносить`); }
    for (const L of r.surface.layers || []) {
      const key = L.el + (L.pseudo || ''); if (seenLayer.has(key)) continue; seenLayer.add(key);
      const s = L.surf;
      lines.push(`- **${key}** (${r.viewport.name}): ${s.via}, ${L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`}, фон под ней ${s.tone ? `${TONE[s.tone]} (Y ${Math.round(s.y)})` : 'не определён'}, наложение ${s.blend}${s.opacity < 0.98 ? `, прозрачность ${s.opacity}` : ''}, показ ${s.shown.size} ${s.shown.repeat}${s.sd != null ? `; σ ${s.sd}, подъём ${s.lift}` : ''}${s.hidden ? '; спрятан' : ''}${(L.mediaOff || []).length ? `; выключена: ${L.mediaOff.map((m) => `@media ${m.cond} (${m.how})`).join(', ')}` : ''}`);
    }
    for (const U of (r.surface.users || []).slice(0, 6)) lines.push(`- мелкие блоки (${r.viewport.name}): ${U.count} × ${U.el} — фон ${U.tone ? TONE[U.tone] : 'не определён'}, наложение ${U.blend}`);
    for (const d of r.surface.diagnosis || []) lines.push(`- ${r.viewport.name}: ${d}`);
  }
  if (!S.none) {
    lines.push('', `Рецепт крупной фактуры: светлые и цветные поля — \`${S.use.light}\`, тёмные — \`${S.use.dark}\` (у донора: светлые ${S.blend.light || '—'}, тёмные ${S.blend.dark || '—'}; граница — яркость поля ${SURFACE_DARK_Y}); период показа ${S.size} px; ${S.minWidthNote}; в печати ${S.print}, при «меньше движения» ${S.reducedMotion}.`);
    lines.push(`Плитка: \`${S.tileCmd}\`; как класть — templates/surface.css.`);
    for (const n of S.notes) lines.push(`- ${n}`);
  } else for (const n of S.notes) lines.push('', `Крупная фактура: ${n}.`);
  return lines;
}

/** Раздел «Фактура (параметры для переноса)» для discovery.md по результатам экранов. */
export function textureMarkdown(results, { recipe = null } = {}) {
  const list = (Array.isArray(results) ? results : [results]).filter(Boolean);
  const rec = recipe || recipeFrom(list);
  const b = (r, k) => {
    const x = grainBand(r, k); if (!x || !x.tiles && x.status === 'не измерено') return '—';
    if (x.status === 'не измерено') return `не измерено (${x.tiles} плиток)`;
    return `${x.sd}${x.status === 'есть' ? '' : ' (нет)'}${notGrainNote(x) ? ` — на снимке ${x.raw.sd}, не зерно` : ''}`;
  };
  const lines = ['## Фактура (параметры для переноса)', '', 'Замер texture.mjs: снимки окна 1:1, σ на ровных плитках по полосам фона — вклад найденных слоёв (снимок со слоем − без), где слоя нет — σ на снимке. Полностраничный снимок и уменьшенные картинки фактуру не показывают — доказательство только числом и вырезами 1:1.', '',
    '| экран | зерно | σ тёмный | σ средний | σ светлый | lag1 | кипение | слоёв |', '|---|---|---|---|---|---|---|---|'];
  for (const r of list) lines.push(`| ${r.viewport.name} ${r.viewport.width}×${r.viewport.height}@${r.viewport.dpr} | ${r.status} | ${b(r, 'dark')} | ${b(r, 'mid')} | ${b(r, 'light')} | ${grainBand(r, 'all').lag1 ?? '—'} | ${r.boil && r.boil.boils != null ? (r.boil.boils === true ? 'да' : r.boil.boils === false ? 'нет' : r.boil.boils) : '—'}${r.boil && r.boil.frames ? ` ${r.boil.frames}×${r.boil.frameMs} мс (${r.boil.source})` : ''} | ${r.layers.length} |`);
  lines.push('');
  const seen = new Set();
  for (const r of list) for (const L of r.layers) {
    const key = L.el + (L.pseudo || '') + L.backgroundImage; if (seen.has(key)) continue; seen.add(key);
    const f = L.file && !L.file.error ? L.file : null;
    lines.push(`- **${L.el}${L.pseudo || ''}** (${r.viewport.name}): ${L.kind}, ${L.position}${L.fixedBy && L.position !== 'fixed' ? ` через ${L.fixedBy}` : ''}, z ${L.zIndex}, ${L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`}, opacity ${L.opacity} (итоговая ${L.effectiveOpacity}), наложение ${L.mixBlendMode}${L.blendChain.length ? ` / ${L.blendChain.join(', ')}` : ''}, фон ${L.backgroundSize} ${L.backgroundRepeat}, image-rendering ${L.imageRendering}, pointer-events ${L.pointerEvents}; причина: ${L.reason.join(', ')}${L.animation ? `; анимация ${L.animation}` : ''}${L.mediaRules && L.mediaRules.length ? `; @media ${L.mediaRules.join(' | ')}` : ''}`);
    if (f) lines.push(`  - файл ${f.file}: ${f.format} ${f.width}×${f.height}, ${Math.round(f.bytes / 1024)} КБ, кадров ${f.pages}${f.frameMs ? ` по ${f.frameMs} мс` : ''}; σ ${f.frames[0].sd}, lag1 ${f.frames[0].lag1}, альфа ${f.frames[0].alphaMean}, цветность ${f.frames[0].chroma}${f.frameCorr.length ? `, связь кадров ${f.frameCorr.join('/')}` : ''} — только для замера, на сайт не переносить`);
    if (L.svg) lines.push(`  - feTurbulence ${L.svg.type} baseFrequency ${L.svg.baseFrequency} octaves ${L.svg.numOctaves}${L.svg.alphaTable != null ? `, feFuncA ${L.svg.alphaTable}` : ', альфа не выставлена'}`);
  }
  for (const r of list) for (const d of r.diagnosis || []) lines.push(`- ${r.viewport.name}: ${d}`);
  lines.push('', `Рецепт: ${rec.none ? rec.notes.join('; ') : `${rec.blendNote}; зерно ${rec.px} px, image-rendering ${rec.rendering}; кипение ${rec.boil ? `${rec.frames} × ${rec.frameMs} мс (${rec.boilSource})` : 'нет'}; ${rec.minWidthNote}`}.`);
  if (!rec.none) lines.push(`Плитка: \`${rec.tileCmd}\`; слой — templates/grain.css. Решение «повторять ли отсутствие зерна на телефоне» записать явно.`);
  for (const n of rec.notes || []) if (!rec.none) lines.push(`- ${n}`);
  lines.push(...surfaceMarkdown(list, rec.surface || null));
  lines.push('', '```css', tokensBlock(rec, list), '```', '');
  return lines.join('\n');
}

/* ======================================================================
   7. Сравнение донора со сборкой
   ====================================================================== */

/**
 * Донор против сайта на одном экране: σ по полосам ±sdTol (доля), lag1 ±lagTol, кипение да/нет.
 * Разный DPR — FAIL «сравнение недостоверно». → { viewport, dprOk, rows[], verdict, hints[] }.
 */
/**
 * Зерно в полосе фона для рецепта и сравнения: вклад найденных слоёв (снимок со слоем − без),
 * если проход «без слоя» был и полоса в нём измерена, — σ на снимке дают ещё картины, градиенты
 * и сжатие картинок; иначе σ на снимке. → Band & { via: 'вклад'|'снимок', raw }.
 */
export function grainBand(res, k) {
  const c = res.contribution && res.contribution[k]; const g = res.grain[k];
  if (c && c.status !== 'не измерено') return { ...c, via: 'вклад', raw: g };
  return { ...g, via: 'снимок', raw: g };
}
const notGrainNote = (b) => (b.via === 'вклад' && b.raw && b.raw.status === 'есть' && b.sd < GRAIN_MIN_SD ? `σ ${b.raw.sd} на снимке — не зерно (вклад слоя ${b.sd})` : '');

export function compareTexture(donor, site, { sdTol = 0.2, lagTol = 0.15, surfaceTol = 0.3 } = {}) {
  const rows = []; const hints = [];
  const vpn = donor.viewport.name;
  const dprOk = donor.viewport.dpr === site.viewport.dpr && donor.viewport.width === site.viewport.width;
  rows.push({ what: 'экран', donor: `${donor.viewport.width}×${donor.viewport.height}@${donor.viewport.dpr}`, site: `${site.viewport.width}×${site.viewport.height}@${site.viewport.dpr}`, ok: dprOk, note: dprOk ? '' : 'разный экран или DPR — сравнение недостоверно' });
  if (!dprOk) return { viewport: vpn, dprOk, rows, verdict: 'FAIL', hints };
  const nameOf = { dark: 'σ тёмный', mid: 'σ средний', light: 'σ светлый' };
  let lagBand = null;
  const lagOf = {};
  for (const k of ['dark', 'mid', 'light']) {
    const d = grainBand(donor, k), s = grainBand(site, k);
    const dm = d.status !== 'не измерено', sm = s.status !== 'не измерено';
    let ok = null, note = '';
    if (!dm || !sm) note = !dm && !sm ? 'нет таких фонов ни там, ни там' : !dm ? 'у донора не измерено' : 'у сайта не измерено';
    else if (d.sd < GRAIN_MIN_SD && s.sd < GRAIN_MIN_SD) { ok = true; note = 'зерна нет у обоих'; }
    else if (d.sd < GRAIN_MIN_SD) { ok = false; note = 'у донора зерна нет, у сайта есть'; }
    else { const rel = (s.sd - d.sd) / d.sd; ok = Math.abs(rel) <= sdTol; note = `${rel >= 0 ? '+' : ''}${Math.round(rel * 100)} %`; if (!lagBand || d.tiles > lagOf[lagBand].d.tiles) lagBand = k; }
    lagOf[k] = { d, s };
    const extra = [notGrainNote(d) && `у донора ${notGrainNote(d)}`, notGrainNote(s) && `у сайта ${notGrainNote(s)}`].filter(Boolean).join('; ');
    if (extra) note = note ? `${note}; ${extra}` : extra;
    rows.push({ what: nameOf[k], donor: dm ? `${d.sd} (${d.tiles})` : `— (${d.tiles})`, site: sm ? `${s.sd} (${s.tiles})` : `— (${s.tiles})`, tol: `±${Math.round(sdTol * 100)} %`, ok, note, via: { donor: d.via, site: s.via } });
    if (ok === false && dm && sm && d.sd >= GRAIN_MIN_SD) {
      const L = mainLayer(site);
      const adv = L ? blendAdvice(layerBlend(L)) : null;
      const dead = adv && ((k === 'dark' && adv.deadOnDark) || (k === 'light' && adv.deadOnLight));
      if (s.sd < GRAIN_MIN_SD && L && dead) hints.push(`${nameOf[k]}: у сайта зерна нет при слое ${L.el}${L.pseudo || ''} (${layerBlend(L)}) — ${adv.text}`);
      else if (s.sd < GRAIN_MIN_SD && L) hints.push(`${nameOf[k]}: слой ${L.el}${L.pseudo || ''} слишком слабый (σ ${s.sd} при нужной ${d.sd}) — своя плитка и opacity по рецепту: texture.mjs <донор> --css grain.css`);
      else if (L && s.sd > 0) hints.push(`${nameOf[k]}: opacity слоя ${L.el}${L.pseudo || ''} ${L.opacity} × ${r2(d.sd / s.sd)} → ${r3(L.opacity * d.sd / s.sd)}`);
    }
  }
  if (lagBand) {
    const dl = lagOf[lagBand].d.lag1, sl = lagOf[lagBand].s.lag1;
    const ok = dl != null && sl != null ? Math.abs(dl - sl) <= lagTol : null;
    rows.push({ what: `lag1 (${lagBand === 'dark' ? 'тёмный' : lagBand === 'mid' ? 'средний' : 'светлый'})`, donor: dl, site: sl, tol: `±${lagTol}`, ok, note: ok === false ? (sl > dl ? 'у сайта зерно крупнее/мыльнее: image-rendering или --px' : 'у сайта зерно мельче') : '' });
  }
  const bv = (b) => (!b || b.boils == null ? null : b.boils === true || b.boils === 'слабо');
  const db = bv(donor.boil), sb = bv(site.boil);
  const donorHasGrain = donor.status === 'есть';
  rows.push({ what: 'кипение', donor: db == null ? '—' : db ? `да${donor.boil.frames ? ` (${donor.boil.frames}×${donor.boil.frameMs} мс)` : ''}` : 'нет', site: sb == null ? '—' : sb ? `да${site.boil.frames ? ` (${site.boil.frames}×${site.boil.frameMs} мс)` : ''}` : 'нет', tol: 'да/нет', ok: !donorHasGrain ? null : db == null || sb == null ? null : db === sb, note: donorHasGrain ? '' : 'у донора зерна нет — не сравнивается' });
  const bandRows = rows.filter((r) => r.what.startsWith('σ'));
  let verdict = rows.some((r) => r.ok === false) ? 'FAIL' : bandRows.every((r) => r.ok == null) ? 'WARN' : rows.some((r) => r.ok == null && r.what !== 'кипение' && !r.what.startsWith('σ')) ? 'WARN' : 'OK';
  /* крупная фактура — своими строками и своим итогом; общий итог — худший из двух. Нет её ни там, ни там —
     строк нет, и сверка зерна выглядит как раньше */
  const cs = compareSurface(donor, site, { tol: surfaceTol });
  if (cs.rows.length) {
    rows.push(...cs.rows); hints.push(...cs.hints);
    const rank = { OK: 0, WARN: 1, FAIL: 2 };
    if (rank[cs.verdict] > rank[verdict]) verdict = cs.verdict;
  }
  return { viewport: vpn, dprOk, rows, verdict, hints, ...(cs.rows.length ? { surface: cs.verdict } : {}) };
}

/**
 * Крупная фактура донора против сайта на одном экране: есть / нет, σ на ровных участках по полосам фона
 * ±tol (участки одного размера: 128 px, а если у кого-то их мало — 64 px у обоих), режим наложения по тону.
 * Логика та же, что у зерна: FAIL — у одного есть, у другого нет, или σ мимо допуска; WARN — сравнить нечем
 * (не измерено, замер донора старый); режим наложения сам FAIL не даёт — решает сила на снимке.
 * → { rows[], hints[], verdict } (rows пуст, если фактуры нет ни у кого).
 */
export function compareSurface(donor, site, { tol = 0.3 } = {}) {
  const rows = [], hints = []; const D = donor.surface, S = site.surface;
  const has = (x) => !!(x && ((x.layers || []).length || x.status === 'есть'));
  if (!has(D) && !has(S)) return { rows, hints, verdict: 'OK' };
  const stOf = (x) => (x ? x.status : 'не снималась');
  let ok = null, note = '';
  if (!D || !S) note = `${!D ? 'у донора' : 'у сайта'} крупная фактура не снималась (texture.json старой версии) — перемерить`;
  else if (D.status === 'есть' && S.status === 'есть') ok = true;
  else if (D.status === 'нет' && S.status === 'нет') { ok = true; note = 'слои с плиткой есть, но не видны у обоих'; }
  else if (D.status === 'есть' && S.status === 'нет') { ok = false; note = has(S) ? 'у сайта плитка есть, но на снимках её не видно' : 'у сайта крупной фактуры нет'; }
  else if (D.status === 'нет' && S.status === 'есть') { ok = false; note = has(D) ? 'у донора плитка не видна, у сайта видна' : 'у донора крупной фактуры нет, у сайта есть'; }
  else note = `${D.status === 'не измерено' ? 'у донора' : 'у сайта'} не измерено — ровных участков мало`;
  rows.push({ what: 'крупная фактура', donor: stOf(D), site: stOf(S), tol: 'да/нет', ok, note, group: 'surface' });
  if (ok === false && D && D.status === 'есть' && !has(S)) hints.push('крупная фактура: у сайта её нет — своя плитка surface-tile.mjs --like <texture.json донора> и templates/surface.css (texture.mjs <донор> --css surface.css)');
  if (!D || !S) {
    hints.push(`крупная фактура: замер ${!D ? 'донора' : 'сайта'} сделан версией до 01.10.2026 — плитка с именем texture или paper в нём засчитана как слой зерна, и строки «σ» выше сравнивают её с зерном; перемерить ${!D ? 'донора' : 'сайт'}`);
    return { rows, hints, verdict: 'WARN' };
  }
  const tileS = S.tile, sdRows = [];
  for (const k of ['dark', 'mid', 'light']) {
    let d = surfaceBandOf(D, k), s = surfaceBandOf(S, k);
    /* участки разного размера не сравнить: σ растёт с размером участка — тогда 64 px у обоих */
    if (d.status !== 'не измерено' && s.status !== 'не измерено' && d.size !== s.size) {
      const d6 = D.bands64 && D.bands64[k], s6 = S.bands64 && S.bands64[k];
      d = d6 ? { ...d6, size: 64 } : { status: 'не измерено', blocks: 0 }; s = s6 ? { ...s6, size: 64 } : { status: 'не измерено', blocks: 0 };
    }
    const dm = d.status !== 'не измерено', sm = s.status !== 'не измерено';
    if (!dm && !sm) continue;
    let rok = null, rnote = '';
    if (!dm || !sm) rnote = !dm ? 'у донора таких фонов с фактурой нет или не измерено' : 'у сайта таких фонов с фактурой нет или не измерено';
    else if (d.sd < SURFACE_MIN_SD && s.sd < SURFACE_MIN_SD) { rok = true; rnote = 'не видна у обоих'; }
    else if (d.sd < SURFACE_MIN_SD) { rok = false; rnote = 'у донора на этом фоне фактура не видна, у сайта видна'; }
    else { const rel = (s.sd - d.sd) / d.sd; rok = Math.abs(rel) <= tol; rnote = `${rel >= 0 ? '+' : ''}${Math.round(rel * 100)} %${d.size === 64 ? '; участки 64 px' : ''}`; }
    const row = { what: `фактура σ ${TONE[k]}`, donor: dm ? `${d.sd} (${d.blocks})` : `— (${d.blocks || 0})`, site: sm ? `${s.sd} (${s.blocks})` : `— (${s.blocks || 0})`, tol: `±${Math.round(tol * 100)} %`, ok: rok, note: rnote, group: 'surface' };
    rows.push(row); sdRows.push(row);
    const dMode = D.byTone && D.byTone[k].mode, sMode = S.byTone && S.byTone[k].mode;
    if (rok === false && dm && sm && d.sd >= SURFACE_MIN_SD) {
      const adv = sMode ? blendAdvice(sMode) : null;
      if (s.sd < SURFACE_MIN_SD && k === 'dark' && sMode && sMode !== 'color-burn') hints.push(`фактура σ ${TONE[k]}: у сайта не видна при наложении ${sMode}${adv && adv.deadOnDark ? ' (гаснет на тёмном)' : ''} → на тёмных полях color-burn${dMode ? ` (у донора ${dMode})` : ''}`);
      else if (tileS && s.sd > 0) hints.push(`фактура σ ${TONE[k]}: у сайта ${s.sd} при ${d.sd} у донора → своя плитка с --sd ${r2(tileS.sd * d.sd / s.sd)} (сейчас σ плитки ${tileS.sd}); surface-tile.mjs --sd`);
    }
    /* режим наложения: совпал или равносилен (на светлом обычный слой, умножение и darken дают одно и то же) —
       OK; разный при силе в допуске — тоже OK с пометкой; разный при силе мимо допуска — причина в подсказке */
    if (dMode && sMode) {
      const soft = (m) => ['normal', 'multiply', 'darken'].includes(m);
      const same = dMode === sMode || (k !== 'dark' && soft(dMode) && soft(sMode));
      rows.push({ what: `наложение ${TONE[k]}`, donor: dMode, site: sMode, tol: '', ok: same || rok === true ? true : null, note: dMode === sMode ? '' : same ? 'на этом фоне равносильны' : rok === true ? 'режим другой, сила та же' : 'режим другой', group: 'surface' });
    }
  }
  const verdict = rows.some((r) => r.ok === false) ? 'FAIL' : rows[0].ok == null || (D.status === 'есть' && S.status === 'есть' && sdRows.every((r) => r.ok == null)) ? 'WARN' : 'OK';
  return { rows, hints, verdict };
}
/** compareTexture по каждому экрану (сопоставление по viewport.name). */
export function compareSets(donorList, siteList, opts = {}) {
  const out = [];
  for (const d of donorList) {
    const s = siteList.find((x) => x.viewport.name === d.viewport.name);
    if (!s) { out.push({ viewport: d.viewport.name, rows: [], verdict: 'WARN', hints: [`у сайта нет замера на экране ${d.viewport.name}`] }); continue; }
    out.push(compareTexture(d, s, opts));
  }
  return out;
}

/* ======================================================================
   8. CLI
   ====================================================================== */

const HELP = `texture.mjs — фактура: слои зерна, их параметры, сила зерна числом, рецепт и сверка с донором;
крупная фактура (картинка-плитка в фоне: мятая бумага, камень, холст) — есть ли, плитка, наложение, рецепт

  node texture.mjs <url> [--viewport desktop,tablet,mobile] [--out папка] [--screens 4] [--label имя]
                   [--json файл] [--tokens файл] [--css файл] [--md файл] [--extras] [--strict]
  node texture.mjs <texture.json> [--viewport desktop,mobile] [--tokens файл] [--css файл] [--md файл] [--json файл]
                   рецепт, --tokens/--css/--md по прошлому замеру — страница заново не открывается;
                   --viewport оставляет только эти экраны; texture.json пишется только с --json;
                   путь на .json, которого нет, — «нет файла <путь>», код 1
  node texture.mjs compare <донор: url|texture.json> <сайт: url|texture.json> [--viewport desktop,mobile]
                   [--out папка] [--screens 4] [--sd-tol 0.2] [--lag-tol 0.15] [--surface-tol 0.3]
  node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл]
  node texture.mjs --tile файл.gif|png|webp|svg
  node texture.mjs selftest [--no-browser]
  node texture.mjs --help | --h | -h

  --viewport  экраны через запятую (desktop, laptop, tablet, mobile, mobile-s, android, ШxВ@DPR);
              по умолчанию desktop,tablet,mobile (compare: desktop,mobile). --viewports и --vp (старое
              имя) — то же во всех режимах; разные значения у них — ошибка, код 1.
  --strict    код 1 при FAIL. FAIL даёт только compare (там код 1 и без флага); одиночный замер,
              --png и --tile — только OK и WARN, код 0. Ошибка замера или аргументов — всегда 1.
  --out       папка снимков и texture.json (по умолчанию <папка прогона>/texture)
  --screens   экранов по высоте страницы (4), снимки окна
  --label     имя в файлах
  --json      файл итога (по умолчанию <out>/texture.json; в compare — <out>/compare.json)
  --tokens    записать блок --grain-* в файл (заменяет блок texture:start…end или дописывает);
              есть крупная фактура — в том же блоке ещё --surface-*
  --css       записать templates/grain.css с подставленным рецептом; есть крупная фактура — и
              templates/surface.css (только она, без зерна, — один surface.css)
  --md        записать раздел «Фактура (параметры для переноса)» для discovery.md
  --extras    ещё вуали, псевдоэлементы, backdrop-filter, blend, градиенты, фоновые видео
  --sd-tol    допуск σ по полосам в compare (0.2 = ±20 %); --lag-tol — допуск lag1 (0.15)
  --surface-tol  допуск силы крупной фактуры в compare (0.3 = ±30 %)
  --png …     метрика по готовым снимкам окна 1:1: --png2/--png3 — тот же экран позже (кипение),
              --without — тот же экран без слоя (ровность и вклад слоя), --region x,y,w,h
  --tile      разбор файла текстуры по всем кадрам (кадры, мс, σ, lag1, альфа, похож ли на шум,
              крупная ли это фактура и почему нет, шов при повторе)
  --selftest  самопроверка (или команда selftest): разбор файлов, участки, рецепт, сверка, аргументы —
              без браузера; стенды со своей плиткой, с зерном и без фактуры — в браузере
  --no-browser  selftest без стендов в браузере

Крупная фактура: светлая картинка-плитка с деталями крупнее пикселя — в фоне блока или слоем поверх.
Узнаётся по файлу (σ яркости 0.8…12, соседние пиксели связаны, детали по всей площади), сила — вклад
«с плиткой − без» на ровных участках 128 px. В выводе — вердикт «крупная фактура: есть / нет», плитка,
наложение по тону секций и рецепт; своя плитка — surface-tile.mjs, как класть — templates/surface.css.

Вердикты: OK — совпадает/есть; WARN — не измерено или гаснет; FAIL — не как у донора (compare, код 1).
Строгий CSP страницы: слой для прохода «без слоя» прячется таблицей adoptedStyleSheets (<style> там не действует).
Коды: 0 — готово; 1 — compare с FAIL, неверные аргументы, ошибка замера или провал в selftest; 2 — у compare не два аргумента.`;

const vb = (b) => (b === true ? 'да' : b === false ? 'нет' : b == null ? '—' : String(b));
function fmtBand(x) {
  if (!x) return '—';
  if (x.status === 'не измерено') return `не измерено (ровных плиток ${x.tiles}${x.tiles ? `, справочно σ ${x.sd}` : ''})`;
  return `σ ${x.sd} (p90 ${x.sd_p90}), lag1 ${x.lag1 ?? '—'}${x.flicker != null ? `, кипение ${x.flicker}` : ''}, Y ${Math.round(x.y)}, плиток ${x.tiles} — ${x.status}`;
}
function printBands(g, title) {
  console.log(`${title}:`);
  console.log(`  тёмный:  ${fmtBand(g.dark)}`);
  console.log(`  средний: ${fmtBand(g.mid)}`);
  console.log(`  светлый: ${fmtBand(g.light)}`);
}
function printLayer(L) {
  console.log(`  #${L.k} ${L.el}${L.pseudo || ''} [${L.kind}; ${L.reason.join(', ')}]: ${L.position}${L.fixedBy && L.position !== 'fixed' ? ` (закреплён через ${L.fixedBy})` : ''}, z ${L.zIndex}, ${L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`}, opacity ${L.opacity} (итоговая ${L.effectiveOpacity}), наложение ${L.mixBlendMode}${L.blendChain.length ? ' / ' + L.blendChain.join(', ') : ''}, фон ${L.backgroundSize} ${L.backgroundRepeat}, image-rendering ${L.imageRendering}, pointer-events ${L.pointerEvents}${L.animation ? `, анимация ${L.animation}` : ''}${L.animChain.length ? ` [${L.animChain.join('; ')}]` : ''}${L.mediaRules && L.mediaRules.length ? `, @media ${L.mediaRules.join(' | ')}` : ''}; без слоя — ${L.hide === 'background' ? 'убрать картинку шума из фона' : L.hide === 'filter' ? 'filter:none' : 'спрятать'}`);
  const f = L.file;
  if (f && f.error) console.log(`     файл: ${f.error}`);
  else if (f) console.log(`     файл ${f.file}: ${f.format} ${f.width}×${f.height}, ${Math.round(f.bytes / 1024)} КБ, кадров ${f.pages}${f.frameMs ? ` по ${f.frameMs} мс` : ''}; яркость ${f.frames[0].mean}±${f.frames[0].sd}, lag1 ${f.frames[0].lag1}, альфа ${f.frames[0].alphaMean}, цветность ${f.frames[0].chroma}, уровней ${f.frames[0].levels}${f.frameCorr.length ? `, связь кадров ${f.frameCorr.join('/')}` : ''}${f.noiseLike ? ', шум' : ', не похоже на шум'}${f.saved ? ` → ${path.basename(f.saved)} (только для замера)` : ''}`);
  if (L.svg) console.log(`     feTurbulence ${L.svg.type} baseFrequency ${L.svg.baseFrequency} octaves ${L.svg.numOctaves}${L.svg.alphaTable != null ? `, feFuncA ${L.svg.alphaTable}` : ', альфа фильтра не выставлена'}`);
}
function printResult(r) {
  console.log(`\n== ${r.viewport.name} ${r.viewport.width}×${r.viewport.height}@${r.viewport.dpr} — ${r.url}`);
  console.log(`слоёв фактуры ${r.layers.length}, feTurbulence в документе ${r.svgNoise.length}${r.patterns && r.patterns.length ? `, отброшено кандидатов ${r.patterns.length}` : ''}; body::after ${r.bodyAfterUsed ? 'занят' : 'свободен'}`);
  if (r.hideVia === 'adopted') console.log('  проход «без слоя»: CSP страницы не применяет вставленный <style> — слой спрятан таблицей adoptedStyleSheets');
  for (const L of r.layers) printLayer(L);
  for (const p of (r.patterns || []).slice(0, 4)) console.log(`  – ${p.el}: не слой — ${p.why}`);
  printBands(r.grain, `зерно на снимках окна (${r.screens.length} экр.)`);
  if (r.contribution) {
    const c = r.contribution; const li = r.lift || {};
    const one = (x, l) => (x.status === 'не измерено' ? 'не измерено' : `σ ${x.sd}${l != null ? `, подъём ${l}` : ''}`);
    console.log(`вклад слоёв (со слоем − без): тёмный ${one(c.dark, li.dark)}; средний ${one(c.mid, li.mid)}; светлый ${one(c.light, li.light)}`);
  }
  const bo = r.boil;
  console.log(`кипение: ${vb(bo.boils)}${bo.ratio != null ? ` (снимки через 250 мс: ${bo.flicker} при σ ${bo.sd}, доля ${bo.ratio})` : ''}${bo.frames ? `; частота — ${bo.frames} × ${bo.frameMs} мс (${bo.source}${bo.of ? `, ${bo.of}` : ''})` : bo.smooth ? `; плавная анимация ${bo.cycleMs} мс (${bo.source})` : ''}`);
  const st = r.status === 'есть' ? 'OK' : 'WARN';
  console.log(`${st.padEnd(4)} зерно ${r.viewport.name}: ${r.status}${r.statusNote ? ` — ${r.statusNote}` : ''}`);
  for (const d of r.diagnosis) console.log(`WARN ${d}`);
  if (r.crop_dark || r.crop_light) console.log(`     вырезы ×6: ${[r.crop_dark, r.crop_mid, r.crop_light].filter(Boolean).map((f) => path.basename(f)).join(', ')}`);
  printSurface(r);
}
/* блок «крупная фактура» одного экрана; у замера старой версии (поля surface нет) — ничего */
function printSurface(r) {
  const S = r.surface; if (!S) return;
  const vp = r.viewport.name;
  if (!(S.layers || []).length) { console.log(`     крупная фактура ${vp}: нет — ${S.statusNote}`); return; }
  const T = S.tile;
  console.log(`крупная фактура (картинка-плитка): слоёв ${S.layers.length}, мелких блоков с той же плиткой ${S.usersCount || 0}`);
  console.log(`  плитка ${T.file}: ${T.format} ${T.width}×${T.height}, ${Math.round(T.bytes / 1024)} КБ; яркость ${T.mean} ± ${T.sd}, lag1 ${T.lag1}/${T.lag1v}, цветность ${T.chroma}${T.seam ? `, шов ${T.seam.x} по ширине и ${T.seam.y} по высоте (${T.seam.max > SEAM_FAIL ? 'стык виден' : T.seam.max > SEAM_WARN ? 'стык возможен' : 'бесшовная'})` : ''}${T.saved ? ` → ${path.basename(T.saved)} (только для замера)` : ''}`);
  for (const L of S.layers) {
    const s = L.surf;
    console.log(`  #${L.k} ${L.el}${L.pseudo || ''} [${s.via}; ${L.reason.join(', ')}]: ${L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`}, фон под ней ${s.tone ? `${TONE[s.tone]} (Y ${Math.round(s.y)}${s.toneBy === 'цвет фона' ? ', по цвету блока' : ''})` : 'не определён'}, наложение ${s.blend}${s.opacity < 0.98 ? `, прозрачность ${s.opacity}` : ''}, показ ${s.shown.size} ${s.shown.repeat}${s.shown.px ? ` (${s.shown.px} px)` : ''}${s.sd != null ? `; σ ${s.sd}, подъём ${s.lift} (участков ${s.blocks} по ${s.blockSize} px)` : '; на снимках не измерена'}${s.hidden ? '; спрятан (итоговая прозрачность 0)' : ''}${(L.mediaOff || []).length ? `; выключена: ${L.mediaOff.map((m) => `@media ${m.cond} (${m.how})`).join(', ')}` : ''}`);
  }
  if ((S.users || []).length) console.log(`  мелкие блоки: ${S.users.slice(0, 8).map((U) => `${U.count} × ${U.el} (фон ${U.tone ? TONE[U.tone] : '?'}, ${U.blend})`).join('; ')}${S.users.length > 8 ? ` и ещё ${S.users.length - 8} групп` : ''}`);
  const one = (k) => { const b = surfaceBandOf(S, k); return b.status === 'не измерено' ? `не измерено (участков ${b.blocks || 0})` : `σ ${b.sd} (p90 ${b.sd_p90}), подъём ${b.lift}, Y ${Math.round(b.y)}, участков ${b.blocks}${b.size === 64 ? ' по 64 px' : ''} — ${b.status}`; };
  console.log('  на снимках (вклад «с плиткой − без», ровные участки 128 px):');
  console.log(`    тёмный:  ${one('dark')}`);
  console.log(`    средний: ${one('mid')}`);
  console.log(`    светлый: ${one('light')}`);
  console.log(`${(S.status === 'есть' ? 'OK' : 'WARN').padEnd(4)} крупная фактура ${vp}: ${S.status}${S.statusNote ? ` — ${S.statusNote}` : ''}`);
  for (const d of S.diagnosis || []) console.log(`WARN ${d}`);
}
function printRecipe(rec) {
  console.log('\nрецепт (своя плитка + templates/grain.css):');
  if (rec.none) { for (const n of rec.notes) console.log(`  ${n}`); printSurfaceRecipe(rec.surface); return; }
  console.log(`  где есть: ${Object.entries(rec.present).map(([k, v]) => `${k} ${vb(v)}`).join(', ')}; --grain-min-width: ${rec.minWidth}px (${rec.minWidthNote})`);
  console.log(`  --grain-opacity: ${rec.opacity}   (${rec.blendNote})`);
  console.log(`  --grain-blend: ${rec.blend}; --grain-px: ${rec.px}; --grain-rendering: ${rec.rendering} (как у донора)`);
  console.log(`  движение: ${rec.boil ? `--grain-frames: ${rec.frames}; --grain-frame-ms: ${rec.frameMs}ms (${rec.boilSource}) → animation grain-boil ${rec.frames * rec.frameMs}ms steps(1), ${rec.frames} сдвига` : 'не кипит — без анимации'}`);
  if (rec.lift != null) console.log(`  подъём чёрного у донора: ${rec.lift} ур.`);
  console.log(`  плитка: ${rec.tileCmd}`);
  for (const n of rec.notes) console.log(`  · ${n}`);
  printSurfaceRecipe(rec.surface);
}
/* рецепт крупной фактуры; нет её (или замер старый) — ни строки: вывод рецепта зерна остаётся прежним */
function printSurfaceRecipe(S) {
  if (!S || S.none) return;
  const sd = (k) => (S.sd[k] == null ? '—' : `${S.sd[k]} (подъём ${S.lift[k]})`);
  const hidden = S.sections.filter((x) => x.hidden).length;
  console.log('\nрецепт крупной фактуры (своя плитка surface-tile.mjs + templates/surface.css):');
  console.log(`  где есть: ${Object.entries(S.present).map(([k, v]) => `${k} ${vb(v)}`).join(', ')}; --surface-min-width: ${S.minWidth}px (${S.minWidthNote})`);
  console.log(`  плитка донора: ${S.tile.width}×${S.tile.height}, яркость ${S.tile.mean} ± ${S.tile.sd}, показ ${S.shown.size} ${S.shown.repeat}${S.shown.px ? ` (${S.shown.px} px)` : ''}, ${S.via} → своя: --surface-size: ${S.size}px, яркость ${S.tileMean} ± ${S.tileSd}`);
  console.log(`  наложение по тону секции у донора: светлые поля ${S.blend.light || '—'}, тёмные ${S.blend.dark || '—'} (граница — яркость поля ${SURFACE_DARK_Y}) → --surface-blend: ${S.use.light} (светлые и цветные поля); --surface-blend-dark: ${S.use.dark} (тёмные)`);
  console.log(`  сила на снимке, σ: тёмный ${sd('dark')}, средний ${sd('mid')}, светлый ${sd('light')}`);
  console.log(`  секций с фактурой: ${S.sections.length}${hidden ? ` (спрятанных ${hidden})` : ''}${S.smallCount ? `; мелких блоков с той же плиткой ${S.smallCount}` : ''}; прозрачность слоя ${S.opacity}`);
  console.log(`  где выключена: ${S.off.length ? S.off.map((e) => `@media ${e.cond} — ${e.how} (${e.el ? `только ${e.el}` : e.layers === e.of ? 'все секции' : `${e.layers} из ${e.of} секций`})`).join('; ') : 'правил @media, которые её выключают, нет'}; в печати ${S.print}; при «меньше движения» ${S.reducedMotion}`);
  console.log(`  плитка: ${S.tileCmd}`);
  for (const n of S.notes) console.log(`  · ${n}`);
}
function writeTokens(file, block) {
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const re = /\/\* texture:start \*\/[\s\S]*?\/\* texture:end \*\//;
  /* замена функцией: строкой-заменой «$&», «$'», «$`» из адреса в блоке подставляли старый блок и хвост файла */
  const next = re.test(prev) ? prev.replace(re, () => block) : (prev ? prev.replace(/\s*$/, '\n\n') : '') + block + '\n';
  ensureDir(path.dirname(path.resolve(file))); fs.writeFileSync(file, next);
}
async function runSet(url, vps, out, screens, extras, tag = null) {
  const list = [];
  const browser = await launch();
  try {
    for (const [vpName, vp] of vps) {
      console.log(`… ${tag ? tag + ': ' : ''}${url} на ${vpName}`);
      const r = await textureOnUrl(url, { viewport: vp, browser, out, label: `${tag ? tag + '-' : ''}${slugFromUrl(url).slice(0, 40)}-${vpName}`, screens, extras });
      r.viewport.name = vpName;
      list.push(r);
    }
  } finally { await browser.close().catch(() => {}); }
  return list;
}
const loadSet = (file) => {
  const j = readJson(String(file)); if (!j) throw new Error(`не читается ${file}`);
  const list = Array.isArray(j) ? j : j.results || [j];
  if (!list.length || list.some((r) => !r || !r.viewport || !r.grain)) throw new Error(`${file} — не texture.json замера (нет results[] с viewport и grain)`);
  return list;
};
/* адрес страницы или texture.json прошлого замера — до папок и браузера. Путь на .json (не http, https, file, data, about)
   без файла — «нет файла», а не «Invalid URL» или переход браузера на C:/… с ERR_FILE_NOT_FOUND */
const PAGE_URL = /^(https?|file|data|about):$/i;
function inputKind(s, die) {
  const str = String(s);
  let url = false; try { url = PAGE_URL.test(new URL(str).protocol); } catch { /* не адрес */ }
  if (url) return 'url';
  if (/\.json$/i.test(str)) return fs.existsSync(str) ? 'json' : die(`нет файла ${str}`);
  return die(`Неверный адрес «${str}»: нужен полный адрес — http://…, https://… или file:///… — или texture.json прошлого замера  (подробно: --help)`);
}

/* ======================================================================
   9. selftest: разбор файлов, участки, рецепт, сверка и аргументы — без браузера; стенды
      fixtures/texture (своя плитка в фоне и слоем, зерно, страница без фактуры) — в браузере
   ====================================================================== */
async function selftest({ browser = true } = {}) {
  const os = await import('node:os'); const { spawnSync } = await import('node:child_process'); const { pathToFileURL } = await import('node:url');
  const ST = await import('./surface-tile.mjs'); const GT = await import('./grain-tile.mjs');
  const sharp = needSharp();
  let n = 0, bad = 0;
  const say = (ok, msg) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };
  const SELF = fileURLToPath(import.meta.url); const FIX = path.join(HERE, 'fixtures', 'texture');
  /* в имени папки нет слов texture, paper, grain: по ним в пути файла слой считается «шумным по имени» */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-tx-selftest-'));
  const run = (args) => spawnSync(process.execPath, [SELF, ...args], { cwd: tmp, encoding: 'utf8', timeout: 300000, windowsHide: true });
  const text = (r) => `${r.stdout || ''}${r.stderr || ''}`;
  const png = (buf, w, h, ch = 1) => sharp(Buffer.from(buf), { raw: { width: w, height: h, channels: ch } }).png().toBuffer();
  const whyOf = (t) => (t.surfaceWhy || []).join('; ');
  try {
    /* ---- 1. файл: крупная фактура или нет, и почему ---- */
    const N = 384; const tiles = {};
    for (const kind of Object.keys(ST.KINDS)) {
      tiles[kind] = (await ST.renderTile(ST.makeField({ kind, size: N, seed: 11 }), N, {})).data;
      const t = await analyzeTile(tiles[kind], { name: kind });
      say(t.surfaceLike && !t.noiseLike && !!t.seam && t.seam.max <= SEAM_WARN, `своя плитка ${kind}: крупная фактура (σ ${t.frames[0].sd}, lag1 ${t.frames[0].lag1}/${t.frames[0].lag1v}), не шум, шов ${t.seam ? t.seam.max : '—'}${t.surfaceLike ? '' : ` — ${whyOf(t)}`}`);
    }
    const tileY = (await lumaOf(tiles.stone)).Y;   /* яркость плитки камня N×N — материал для синтетики ниже */
    let seed = 5; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    {
      const [g1] = GT.makeFrames({ size: 256, levels: 16, px: 1, frames: 1, mode: 'gray', seed: 7 });
      const t1 = await analyzeTile(await png(g1, 256, 256), { name: 'шум' });
      say(t1.noiseLike && !t1.surfaceLike, `плитка зерна grain-tile.mjs: шум, не крупная фактура (${whyOf(t1)})`);
      const [g8] = GT.makeFrames({ size: 256, levels: 16, px: 8, frames: 1, mode: 'gray', seed: 7 });
      const t8 = await analyzeTile(await png(g8, 256, 256), { name: 'шум 8 px' });
      say(!t8.surfaceLike && /контрастная/.test(whyOf(t8)), `зерно 8 px (lag1 ${t8.frames[0].lag1}): не крупная фактура — ${whyOf(t8)}`);
      const weak = Buffer.alloc(256 * 256); for (let i = 0; i < weak.length; i++) weak[i] = Math.round(250 + (rnd() - 0.5) * 10);
      const tw = await analyzeTile(await png(weak, 256, 256), { name: 'слабый шум' });
      say(!tw.surfaceLike && !tw.noiseLike && /не связаны/.test(whyOf(tw)), `слабый шум на белом (250 ± ${tw.frames[0].sd}): ни зерно-плитка, ни крупная фактура — ${whyOf(tw)}`);
      const M = 600; const ramp = Buffer.alloc(M * M), pale = Buffer.alloc(M * M, 250), photo = Buffer.alloc(M * M), flat = Buffer.alloc(M * M, 247);
      for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
        ramp[y * M + x] = Math.round(235 + 16 * (x + y) / (2 * M));
        photo[y * M + x] = Math.max(0, Math.min(255, Math.round(128 + 55 * Math.sin(x / 90) * Math.cos(y / 70) + 30 * Math.sin((x + y) / 40))));
      }
      /* бледные мягкие пятна только в одной четверти — рисунок, а не фактура по всему полю */
      for (let k = 0; k < 14; k++) { const cx = 30 + rnd() * 240, cy = 30 + rnd() * 240, r = 14 + rnd() * 16; for (let y = Math.max(0, Math.floor(cy - 3 * r)); y < Math.min(M, cy + 3 * r); y++) for (let x = Math.max(0, Math.floor(cx - 3 * r)); x < Math.min(M, cx + 3 * r); x++) { const d = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r); pale[y * M + x] = Math.round(pale[y * M + x] - 9 * Math.exp(-d)); } }
      const tr = await analyzeTile(await png(ramp, M, M), { name: 'градиент' });
      say(!tr.surfaceLike && /уклон/.test(whyOf(tr)), `плавный градиент (σ ${tr.frames[0].sd}, lag1 ${tr.frames[0].lag1}): не фактура — ${whyOf(tr)}`);
      const tp = await analyzeTile(await png(pale, M, M), { name: 'бледный рисунок' });
      say(!tp.surfaceLike && /не по всей площади/.test(whyOf(tp)), `бледный рисунок в углу (σ ${tp.frames[0].sd}): не фактура — ${whyOf(tp)}`);
      const tf = await analyzeTile(await png(photo, M, M), { name: 'фото' });
      say(!tf.surfaceLike && /контрастная/.test(whyOf(tf)), `контрастная картинка (σ ${tf.frames[0].sd}): не фактура — ${(tf.surfaceWhy || [])[0]}`);
      const tfl = await analyzeTile(await png(flat, M, M), { name: 'заливка' });
      say(!tfl.surfaceLike && /ровная заливка/.test(whyOf(tfl)), `ровная заливка: не фактура — ${(tfl.surfaceWhy || [])[0]}`);
      const dots = Buffer.alloc(24 * 24, 250); for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (Math.hypot(x - 12, y - 12) < 4) dots[y * 24 + x] = 232;
      const td = await analyzeTile(await png(dots, 24, 24), { name: 'узор' });
      say(!td.surfaceLike && /мелкая плитка/.test(whyOf(td)), `узор 24 px: не фактура — ${whyOf(td)}`);
      const rgba = Buffer.alloc(N * N * 4), kraft = Buffer.alloc(N * N * 3), blobs = Buffer.alloc(N * N * 3);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x, v = tileY[i], c = 3 * Math.sin(x / 37) * Math.cos(y / 29);
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = Math.round(v); rgba[i * 4 + 3] = 128;
        kraft[i * 3] = Math.round(v * 0.96); kraft[i * 3 + 1] = Math.round(v * 0.9); kraft[i * 3 + 2] = Math.round(v * 0.78);
        /* цвет гуляет, яркость почти нет: ΔR и ΔB подобраны так, что 0.2126·ΔR + 0.0722·ΔB = 0 */
        blobs[i * 3] = Math.round(v - 12 + 6 * c); blobs[i * 3 + 1] = Math.round(v - 12); blobs[i * 3 + 2] = Math.round(v - 12 - 17.7 * c);
      }
      const ta = await analyzeTile(await png(rgba, N, N, 4), { name: 'полупрозрачная' });
      say(!ta.surfaceLike && /полупрозрачная/.test(whyOf(ta)), `полупрозрачная плитка (альфа ${ta.frames[0].alphaMean}): не разбирается как фактура — ${(ta.surfaceWhy || [])[0]}`);
      const tk = await analyzeTile(await png(kraft, N, N, 3), { name: 'крафт' });
      say(tk.surfaceLike && tk.frames[0].chroma > 12, `тонированная плитка (крафт, цветность ${tk.frames[0].chroma}, средний цвет ${tk.frames[0].tint}): крупная фактура — тон не мешает${tk.surfaceLike ? '' : ` — ${whyOf(tk)}`}`);
      const tb = await analyzeTile(await png(blobs, N, N, 3), { name: 'цветные пятна' });
      say(!tb.surfaceLike && tb.surfaceWhy.length === 1 && /цвет меняется/.test(whyOf(tb)), `цветные пятна при той же яркости (σ яркости ${tb.frames[0].sd}, разброс цвета ${tb.frames[0].chromaSd}): не фактура — ${whyOf(tb)}`);
    }

    /* ---- 2. участки: сила крупной фактуры на снимке ---- */
    {
      const W = 24 + 32 * 20, H = 24 + 32 * 12; const base = new Float32Array(W * H).fill(200), withT = new Float32Array(W * H), weakT = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = tileY[(y % N) * N + (x % N)] - 248; withT[y * W + x] = 200 + d; weakT[y * W + x] = 200 + d * 0.06; }
      const t = grainTiles(withT, W, H, { Yw: base }); for (const x of t) x.s = 0;
      const b = surfaceBand(surfaceBlocks(t, 4, 12).filter((q) => q.band === 'light')), b6 = surfaceBand(surfaceBlocks(t, 2, 4).filter((q) => q.band === 'light'));
      const fine = summarize(t, { key: 'sdD', yKey: 'yw', lagKey: 'lagD' }).light.sd;
      say(b.status === 'есть' && b.sd > 1.2 && b.sd < 3.2 && Math.abs(b.lift) < 0.8, `плитка σ 2.5 на ровном поле: участки 128 px — σ ${b.sd}, подъём ${b.lift}, участков ${b.blocks} — «${b.status}»`);
      say(fine < b6.sd && b6.sd < b.sd, `чем крупнее участок, тем полнее сила: плитка 32 px ${fine} < участок 64 px ${b6.sd} < участок 128 px ${b.sd}`);
      const tw = grainTiles(weakT, W, H, { Yw: base }); for (const x of tw) x.s = 0;
      const bw = surfaceBand(surfaceBlocks(tw, 4, 12).filter((q) => q.band === 'light'));
      say(bw.status === 'нет' && bw.sd < SURFACE_MIN_SD, `та же плитка в 16 раз слабее: σ ${bw.sd} — «нет» (порог ${SURFACE_MIN_SD})`);
      const w3 = 24 + 32 * 8, h3 = 152; const sw = new Float32Array(w3 * h3), sb3 = new Float32Array(w3 * h3).fill(200);
      for (let y = 0; y < h3; y++) for (let x = 0; x < w3; x++) sw[y * w3 + x] = withT[y * W + x];
      const small = grainTiles(sw, w3, h3, { Yw: sb3 }); for (const x of small) x.s = 0;
      const bs = surfaceBand(surfaceBlocks(small, 4, 12));
      say(bs.status === 'не измерено' && bs.blocks > 0 && bs.blocks < SURFACE_MIN_BLOCKS, `ровный клочок ${w3}×${h3} px: участков 128 px ${bs.blocks} (σ ${bs.sd}) — «не измерено», а не «есть» и не «нет»`);
      const two = new Float32Array(W * H), twoW = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const bg = x < 12 + 32 * 8 ? 40 : 230; twoW[y * W + x] = bg; two[y * W + x] = bg + (tileY[(y % N) * N + (x % N)] - 248) * (bg < 100 ? 0.5 : 1); }
      const t2 = grainTiles(two, W, H, { Yw: twoW }); for (const x of t2) x.s = 0;
      const blocks2 = surfaceBlocks(t2, 4, 12); const bd = surfaceBand(blocks2.filter((q) => q.band === 'dark')), bl = surfaceBand(blocks2.filter((q) => q.band === 'light'));
      say(bd.blocks >= 4 && bl.blocks >= 4 && bd.sd < bl.sd && Math.round(bd.y) === 40 && Math.round(bl.y) === 230, `тёмная и светлая половины считаются отдельно: тёмный σ ${bd.sd} (Y ${bd.y}), светлый σ ${bl.sd} (Y ${bl.y})`);
    }

    /* ---- 3. сверка: синтетические замеры ---- */
    const vp = { name: 'desktop', width: 1440, height: 900, dpr: 1 };
    {
      const band = (sd, blocks = 20, y = 240) => (sd == null ? { blocks: 0, sd: null, status: 'не измерено' } : { blocks, sd, sd_p90: r2(sd * 1.3), fine: r2(sd * 0.5), lift: -5, y, status: blocks < SURFACE_MIN_BLOCKS ? 'не измерено' : sd >= SURFACE_MIN_SD ? 'есть' : 'нет' });
      const mkS = ({ light = 2, dark = 1.2, n128 = 20, modes = { light: 'multiply', dark: 'color-burn' }, tileSd = 2.5 } = {}) => {
        const bands = { size: 128, dark: band(dark, n128, 40), mid: band(null), light: band(light, n128) };
        const bands64 = { size: 64, dark: band(dark == null ? null : r2(dark * 0.8), 60, 40), mid: band(null), light: band(light == null ? null : r2(light * 0.8), 60) };
        const st = ['dark', 'mid', 'light'].map((k) => surfaceBandOf({ bands, bands64 }, k));
        return { status: st.some((b) => b.status === 'есть') ? 'есть' : st.some((b) => b.status === 'нет') ? 'нет' : 'не измерено', statusNote: '', layers: [{}], users: [], usersCount: 0, tile: { file: 't.webp', mean: 248, sd: tileSd }, bands, bands64, byTone: { dark: { mode: modes.dark }, mid: { mode: null }, light: { mode: modes.light } }, diagnosis: [], rejected: [] };
      };
      const none = { status: 'нет', statusNote: 'картинок-плиток с крупной фактурой не найдено', layers: [], users: [], usersCount: 0, tile: null, bands: null, bands64: null, byTone: null, diagnosis: [], rejected: [] };
      const R = (surface) => ({ viewport: vp, ...(surface ? { surface } : {}) });
      const cmp = (a, b, o) => compareSurface(R(a), R(b), o);
      const rowOf = (c, re) => c.rows.find((r) => re.test(r.what));
      let c = cmp(mkS(), mkS());
      say(c.verdict === 'OK' && c.rows.length >= 3 && c.rows.every((r) => r.ok === true), `сверка, одинаковая фактура: ${c.verdict}, строк ${c.rows.length}`);
      c = cmp(mkS(), mkS({ light: 3 }));
      say(c.verdict === 'FAIL' && rowOf(c, /σ светлый/).ok === false && c.hints.some((h) => /--sd 1\.67/.test(h)), `сверка, у сайта светлый σ 3 при 2 у донора: ${c.verdict} (${rowOf(c, /σ светлый/).note}), подсказка: ${(c.hints[0] || '').slice(0, 90)}`);
      c = cmp(mkS(), mkS({ light: 2.5 }));
      const c2 = cmp(mkS(), mkS({ light: 2.5 }), { tol: 0.2 });
      say(c.verdict === 'OK' && c2.verdict === 'FAIL', `сверка, +25 %: при допуске 30 % — ${c.verdict}, при 20 % — ${c2.verdict}`);
      c = cmp(mkS(), none);
      say(c.verdict === 'FAIL' && /у сайта крупной фактуры нет/.test(c.rows[0].note) && c.hints.some((h) => /surface-tile\.mjs/.test(h)), `сверка, у сайта фактуры нет: ${c.verdict} — ${c.rows[0].note}`);
      c = cmp(none, mkS());
      say(c.verdict === 'FAIL' && /у донора крупной фактуры нет, у сайта есть/.test(c.rows[0].note), `сверка, у донора нет, у сайта есть: ${c.verdict} — ${c.rows[0].note}`);
      c = cmp(none, none);
      say(c.rows.length === 0 && c.verdict === 'OK', `сверка, фактуры нет ни у кого: строк ${c.rows.length} — сверка зерна выглядит как раньше`);
      c = cmp(null, mkS());
      say(c.verdict === 'WARN' && /перемерить/.test(c.rows[0].note) && c.hints.some((h) => /до 01\.10\.2026/.test(h)), `сверка, замер донора старой версии: ${c.verdict} — ${c.rows[0].note}`);
      c = cmp(mkS(), mkS({ n128: 2 }));
      say(c.verdict === 'OK' && /участки 64 px/.test(rowOf(c, /σ светлый/).note), `сверка, у сайта мало участков 128 px: сравнение по 64 px у обоих — ${rowOf(c, /σ светлый/).donor} и ${rowOf(c, /σ светлый/).site}, ${c.verdict}`);
      c = cmp(mkS(), mkS({ dark: 0.2, modes: { light: 'multiply', dark: 'multiply' } }));
      say(c.verdict === 'FAIL' && rowOf(c, /σ тёмный/).ok === false && c.hints.some((h) => /color-burn/.test(h)), `сверка, на тёмном у сайта multiply и σ 0.2: ${c.verdict}, подсказка: ${(c.hints.find((h) => /color-burn/.test(h)) || '').slice(0, 100)}`);
      c = cmp(mkS({ modes: { light: 'normal', dark: 'color-burn' } }), mkS());
      say(c.verdict === 'OK' && rowOf(c, /наложение светлый/).ok === true && /равносильны/.test(rowOf(c, /наложение светлый/).note), `сверка, на светлом normal у донора и multiply у сайта: ${c.verdict} — ${rowOf(c, /наложение светлый/).note}`);

      /* замеры без крупной фактуры: сверка, рецепт, переменные и раздел — как до неё */
      const gb = (sd, t = 100, y = 128) => ({ tiles: t, sd, sd_p90: sd, lag1: 0.1, y, status: t < MIN_TILES ? 'не измерено' : sd >= GRAIN_MIN_SD ? 'есть' : 'нет' });
      const old = (d, l) => ({ url: 'https://old.example/', viewport: vp, layers: [], patterns: [], svgNoise: [], screens: [], grain: { dark: gb(d, 100, 20), mid: gb(0, 0), light: gb(l, 100, 240), all: gb(d) }, without: null, contribution: null, lift: null, boil: { boils: false }, status: Math.max(d, l) >= GRAIN_MIN_SD ? 'есть' : 'нет', statusNote: '', diagnosis: [] });
      const ct = compareTexture(old(5, 5), old(5.2, 4.9)), ctf = compareTexture(old(5, 5), old(2, 2));
      say(ct.verdict === 'OK' && ctf.verdict === 'FAIL' && ct.rows.every((r) => r.group !== 'surface') && !('surface' in ct), `сверка зерна по замерам старой версии: ${ct.verdict} и ${ctf.verdict}, строк о крупной фактуре нет`);
      const rec = recipeFrom([old(5, 5)]), blk = tokensBlock(rec, [old(5, 5)]), md = textureMarkdown([old(5, 5)]);
      say(!('surface' in rec) && !/--surface/.test(blk) && (blk.match(/--grain-/g) || []).length === 8 && !/Крупная фактура/.test(md), 'замер старой версии: рецепт, блок переменных (8 × --grain-*) и раздел — без крупной фактуры, как раньше');
      const withNone = { ...old(5, 5), surface: none };
      const rec2 = recipeFrom([withNone]), blk2 = tokensBlock(rec2, [withNone]), md2 = textureMarkdown([withNone]);
      say(rec2.surface && rec2.surface.none === true && blk2 === tokensBlock(rec, [old(5, 5)]) && /Крупная фактура[^\n]*: нет/.test(md2), 'замер без крупной фактуры: блок переменных знак в знак прежний, в разделе — одна строка «нет»');
      const ctn = compareTexture(withNone, withNone);
      say(ctn.verdict === 'OK' && ctn.rows.every((r) => r.group !== 'surface'), 'сверка двух замеров без крупной фактуры: строк о ней нет');
    }

    /* ---- 4. командная строка без браузера ---- */
    {
      const f = path.join(tmp, 'stone.webp'); fs.writeFileSync(f, tiles.stone);
      const t = run(['--tile', f]);
      say(t.status === 0 && /крупная фактура[^\n]*: да/.test(text(t)) && /бесшовная/.test(text(t)) && /НЕ похоже на шум/.test(text(t)), `--tile своей плитки: код ${t.status}, «крупная фактура: да», «бесшовная»`);
      const [g1] = GT.makeFrames({ size: 256, levels: 16, px: 1, frames: 1, mode: 'gray', seed: 7 });
      const gf = path.join(tmp, 'grain.png'); fs.writeFileSync(gf, await png(g1, 256, 256));
      const tg = run(['--tile', gf]);
      say(tg.status === 0 && /; похоже на шум/.test(text(tg)) && /крупная фактура[^\n]*: нет/.test(text(tg)), `--tile плитки зерна: код ${tg.status}, «похоже на шум», «крупная фактура: нет»`);
      const h = run(['-h']);
      const flags = ['viewport', 'out', 'json', 'tokens', 'css', 'md', 'png', 'png2', 'png3', 'without', 'region', 'tile', 'label', 'screens', 'extras', 'strict', 'sd-tol', 'lag-tol', 'surface-tol', 'selftest', 'no-browser'];
      const missing = flags.filter((k) => !new RegExp(`--${k}(?![\\w-])`).test(h.stdout || ''));
      say(h.status === 0 && !missing.length, `-h: код ${h.status}, флаги названы${missing.length ? ` (нет: ${missing.join(', ')})` : ''}`);
      const e1 = run(['compare', 'a.json', 'b.json', '--surface-tol', 'abc']);
      say(e1.status === 1 && /--surface-tol abc/.test(text(e1)), `--surface-tol не число: код ${e1.status}`);
      const e2 = run(['compare', 'a.json', 'b.json', '--surfase-tol', '0.3']);
      say(e2.status === 1 && /--surface-tol\?/.test(text(e2)), `опечатка --surfase-tol: код ${e2.status}, подсказка «--surface-tol?»`);
    }

    /* ---- 5. стенды в браузере ---- */
    if (!browser) console.log('SKIP стенды в браузере (--no-browser)');
    else {
      const site = ensureDir(path.join(tmp, 'site')), shots = ensureDir(path.join(tmp, 'shots'));
      const F = ST.makeField({ kind: 'paper', size: 512, seed: 11 });
      fs.writeFileSync(path.join(site, 'tile.webp'), (await ST.renderTile(F, 512, { mean: 248, sd: 2.5 })).data);
      fs.writeFileSync(path.join(site, 'tile-strong.webp'), (await ST.renderTile(F, 512, { mean: 244, sd: 5.5 })).data);
      const [g] = GT.makeFrames({ size: 256, levels: 16, px: 1, frames: 1, mode: 'gray', seed: 7 });
      fs.writeFileSync(path.join(site, 'grain-gray-256.png'), await png(g, 256, 256));
      const PW = 1200, PH = 640; const photo = Buffer.alloc(PW * PH), ramp = Buffer.alloc(PW * PH);
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) { photo[y * PW + x] = Math.max(0, Math.min(255, Math.round(120 + 60 * Math.sin(x / 130) * Math.cos(y / 90) + 35 * Math.sin((x + 2 * y) / 55)))); ramp[y * PW + x] = Math.round(228 + 20 * x / PW); }
      await sharp(photo, { raw: { width: PW, height: PH, channels: 1 } }).jpeg({ quality: 80 }).toFile(path.join(site, 'photo.jpg'));
      fs.writeFileSync(path.join(site, 'ramp.png'), await png(ramp, PW, PH));
      const sRec = (tile) => ({ tileName: tile, size: 512, use: { light: 'multiply', dark: 'color-burn' }, minWidth: 0 });
      fs.writeFileSync(path.join(site, 'surface.css'), fillSurfaceCss(sRec('tile.webp')));
      fs.writeFileSync(path.join(site, 'surface-strong.css'), fillSurfaceCss(sRec('tile-strong.webp')));
      fs.writeFileSync(path.join(site, 'grain.css'), fillGrainCss({ none: false, size: 256, px: 1, opacity: 0.064, blend: 'normal', rendering: 'auto', frames: 1, frameMs: 100, boil: false, minWidth: 0 }));
      const tpl = fs.readFileSync(path.join(FIX, 'surface.html'), 'utf8');
      const page = (name, { dark = 'surface--dark', head = '', extra = '', css = 'surface.css' } = {}) => fs.writeFileSync(path.join(site, name), tpl.split('{{DARK}}').join(dark).split('{{HEAD}}').join(head).split('{{EXTRA}}').join(extra).replace('href="surface.css"', `href="${css}"`));
      page('surface.html'); page('surface-strong.html', { css: 'surface-strong.css' }); page('surface-dead.html', { dark: 'surface' });
      page('both.html', { head: '<link rel="stylesheet" href="grain.css">', extra: '<div class="grain-overlay" aria-hidden="true"></div>' });
      for (const f of ['veil.html', 'grain.html', 'plain.html']) fs.copyFileSync(path.join(FIX, f), path.join(site, f));
      const VP = '1200x800@1';
      let br = await launch();
      const shoot = async (f) => {
        const go = () => textureOnUrl(pathToFileURL(path.join(site, f)).href, { viewport: VP, out: shots, label: f.replace('.html', ''), screens: 3, browser: br, settle: 600 });
        try { return await go(); } catch (e) {
          /* мало памяти — браузер роняет снимок: одна повторная попытка в новом браузере */
          console.log(`     ${f}: ${String(e && e.message ? e.message : e).slice(0, 100)} — повтор в новом браузере`);
          await br.close().catch(() => {}); await sleep(15000); br = await launch();
          try { return await go(); } catch (e2) { return { error: String(e2 && e2.message ? e2.message : e2).slice(0, 160) }; }
        }
      };
      const R = {};
      try { for (const f of ['surface', 'surface-strong', 'surface-dead', 'veil', 'grain', 'plain', 'both']) { R[f] = await shoot(`${f}.html`); if (R[f].error) say(false, `стенд ${f}.html не снят: ${R[f].error}`); } }
      finally { await br.close().catch(() => {}); }
      const ok = (k) => R[k] && !R[k].error;
      const sb = (r, k) => surfaceBandOf(r.surface, k);
      if (ok('surface')) {
        const r = R.surface, S = r.surface, rec = recipeFrom([r]), by = (re) => S.layers.find((L) => re.test(L.el));
        const deep = by(/section\.deep/), mint = by(/section\.mint/), body = by(/^body/);
        say(S.status === 'есть' && S.layers.length >= 4 && sb(r, 'light').status === 'есть' && sb(r, 'dark').status === 'есть', `стенд «фактура в фоне»: крупная фактура ${S.status}, слоёв ${S.layers.length}; светлый σ ${sb(r, 'light').sd}, тёмный σ ${sb(r, 'dark').sd}`);
        say(!!deep && deep.surf.blend === 'color-burn' && deep.surf.side === 'dark' && !!mint && mint.surf.blend === 'multiply' && mint.surf.side === 'light' && !!body && body.surf.via === 'фон блока', `стенд: тёмная секция — ${deep ? `${deep.surf.blend}, Y ${deep.surf.y}` : 'не найдена'}; мятная — ${mint ? `${mint.surf.blend}, Y ${mint.surf.y}` : 'не найдена'}; body — ${body ? body.surf.via : 'не найден'}`);
        say(r.status !== 'есть' && r.layers.length === 0, `стенд: зерно «${r.status}», слоёв зерна ${r.layers.length} — плитка не принята за зерно`);
        say(S.usersCount >= 3 && S.users.some((u) => u.blend === 'color-burn') && S.users.some((u) => u.blend === 'multiply'), `стенд: мелких блоков с плиткой ${S.usersCount} (${S.users.map((u) => `${u.count} × ${u.blend}`).join(', ')})`);
        say(Math.abs(S.tile.mean - 248) <= 1 && Math.abs(S.tile.sd - 2.5) <= 0.4 && S.tile.seam.max <= SEAM_WARN && S.tile.width === 512, `стенд: плитка ${S.tile.file} ${S.tile.width}×${S.tile.height}, яркость ${S.tile.mean} ± ${S.tile.sd}, шов ${S.tile.seam.max}`);
        const RS = rec.surface;
        say(!!RS && !RS.none && RS.use.light === 'multiply' && RS.use.dark === 'color-burn' && RS.size === 512 && RS.print === 'выключена' && RS.blend.light === 'multiply' && RS.blend.dark === 'color-burn', `стенд, рецепт: светлые ${RS && RS.use ? RS.use.light : '—'}, тёмные ${RS && RS.use ? RS.use.dark : '—'}, период ${RS ? RS.size : '—'} px, в печати ${RS ? RS.print : '—'}`);
        say(!!RS && RS.off.some((e) => /max-width: 700px/.test(e.cond) && e.el && /mint/.test(e.el)), `стенд, рецепт: выключение на узком экране найдено у одной секции (${RS ? RS.off.map((e) => `${e.cond}: ${e.how}`).join('; ') : '—'})`);
        const blk = tokensBlock(rec, [r]), css = RS && !RS.none ? fillSurfaceCss(RS) : '', md = textureMarkdown([r]);
        say(/--surface-size: 512px;/.test(blk) && /--surface-blend: multiply;/.test(blk) && /--surface-blend-dark: color-burn;/.test(blk) && /--grain-opacity: 0;/.test(blk) && blk.split('*/').length === 4, 'стенд: блок переменных — --grain-* и --surface-* в одном блоке, комментарий закрыт один раз');
        say(/--surface-tile: url\(surface-paper-512\.webp\);/.test(css) && /--surface-size: 512px;/.test(css) && /@media \(min-width: 0px\) \{ \/\* surface-min-width \*\//.test(css) && /### Крупная фактура/.test(md), 'стенд: surface.css с рецептом и подраздел «Крупная фактура» в разделе для discovery.md');
      }
      if (ok('veil')) {
        const r = R.veil, S = r.surface, rec = recipeFrom([r]).surface;
        say(S.status === 'есть' && S.layers.length === 3 && S.layers.every((L) => L.surf.via === 'слой' && L.reason.includes('фон')), `стенд «фактура слоем»: ${S.status}, слоёв ${S.layers.length} — найдены как картинка в фоне большого блока и подтверждены разбором файла, без подсказки в имени (причина: ${S.layers[0] ? S.layers[0].reason.join(', ') : '—'})`);
        say(r.layers.length === 0, `стенд «фактура слоем»: в слоях зерна её нет (слоёв зерна ${r.layers.length})`);
        say(S.byTone.light.mode === 'normal' && S.bySide.dark.mode === 'color-burn' && !!rec && rec.use.light === 'multiply' && rec.use.dark === 'color-burn' && rec.notes.some((x) => /обычным слоем/.test(x)), `стенд «фактура слоем»: у донора светлые ${S.byTone.light.mode}, тёмные ${S.bySide.dark.mode} → у себя ${rec ? `${rec.use.light} и ${rec.use.dark}` : '—'}`);
        say(!!rec && rec.off.some((e) => /max-width: 700px/.test(e.cond) && /display: none/.test(e.how)) && r.status !== 'есть', `стенд «фактура слоем»: выключение на узком экране — ${rec ? rec.off.map((e) => `${e.cond} (${e.how}, ${e.layers} из ${e.of})`).join('; ') : '—'}; зерно «${r.status}»`);
      }
      if (ok('grain')) {
        const r = R.grain, rec = recipeFrom([r]); const c = r.contribution || {};
        say(r.status === 'есть' && r.layers.length === 1 && c.dark && c.light && c.dark.sd > 3.5 && c.dark.sd < 6.5 && c.light.sd > 3.5 && c.light.sd < 6.5, `стенд «зерно»: зерно ${r.status}, вклад слоя тёмный ${c.dark ? c.dark.sd : '—'} / светлый ${c.light ? c.light.sd : '—'} (ждём около 5)`);
        say(r.surface.status === 'нет' && r.surface.layers.length === 0 && rec.surface.none && !/--surface/.test(tokensBlock(rec, [r])) && !rec.none && rec.blend === 'normal', `стенд «зерно»: крупная фактура «${r.surface.status}», в блоке переменных только --grain-* (opacity ${rec.opacity})`);
      }
      if (ok('plain')) {
        const r = R.plain, S = r.surface;
        say(S.status === 'нет' && S.layers.length === 0 && r.status !== 'есть', `стенд «без фактуры»: крупная фактура «${S.status}», зерно «${r.status}»`);
        say(S.rejected.some((x) => /photo/.test(x.file || '') && /контрастная/.test(x.why)) && S.rejected.some((x) => /ramp/.test(x.file || '') && /уклон/.test(x.why)), `стенд «без фактуры»: фотография и градиент в фоне отвергнуты (${S.rejected.map((x) => `${x.file}: ${x.why.split(';')[0]}`).join(' | ')})`);
      }
      if (ok('both') && ok('surface')) {
        const r = R.both, c = r.contribution || {}; const cs = compareSurface(R.surface, r);
        say(r.status === 'есть' && r.layers.length === 1 && c.light && c.light.sd > 3.5 && c.light.sd < 6.5 && r.surface.status === 'есть', `стенд «зерно и фактура»: зерно ${r.status} (вклад на светлом ${c.light ? c.light.sd : '—'}), крупная фактура ${r.surface.status}`);
        say(cs.verdict === 'OK', `стенд «зерно и фактура»: сила фактуры та же, что без зерна — светлый ${sb(R.surface, 'light').sd} и ${sb(r, 'light').sd} (${cs.verdict}): зерно в её замер не попало`);
      }
      if (ok('surface') && ok('surface-strong') && ok('surface-dead') && ok('plain') && ok('veil') && ok('grain')) {
        const c1 = compareSets([R.surface], [R.surface])[0], c2 = compareSets([R.surface], [R['surface-strong']])[0], c3 = compareSets([R.surface], [R['surface-dead']])[0], c4 = compareSets([R.surface], [R.plain])[0], c5 = compareSets([R.veil], [R.surface])[0], c6 = compareSets([R.grain], [R.grain])[0];
        say(c1.verdict === 'OK' && c1.surface === 'OK', `сверка стендов, сайт сам с собой: ${c1.verdict}`);
        say(c2.verdict === 'FAIL' && c2.hints.some((h) => /--sd/.test(h)), `сверка стендов, плитка вдвое сильнее: ${c2.verdict} (${(c2.rows.find((x) => x.ok === false) || {}).note}); подсказка: ${(c2.hints.find((h) => /--sd/.test(h)) || '').slice(0, 110)}`);
        say(c3.verdict === 'FAIL' && c3.rows.some((x) => /σ тёмный/.test(x.what) && x.ok === false) && c3.hints.some((h) => /color-burn/.test(h)), `сверка стендов, на тёмном multiply вместо color-burn: ${c3.verdict} (тёмный ${sb(R.surface, 'dark').sd} против ${sb(R['surface-dead'], 'dark').sd})`);
        say(c4.verdict === 'FAIL' && c4.rows.some((x) => x.what === 'крупная фактура' && x.ok === false), `сверка стендов, у сайта фактуры нет: ${c4.verdict}`);
        say(c5.rows.some((x) => /наложение светлый/.test(x.what) && x.ok === true) && c5.rows.some((x) => x.what === 'крупная фактура' && x.ok === true), `сверка стендов, слой у донора против фона блока у сайта: ${c5.verdict}; наложение на светлом — ${(c5.rows.find((x) => /наложение светлый/.test(x.what)) || {}).note || 'совпало'}`);
        say(c6.verdict === 'OK' && c6.rows.every((x) => x.group !== 'surface'), `сверка стендов, зерно само с собой: ${c6.verdict}, строк о крупной фактуре нет`);
        /* командная строка по сохранённым замерам */
        const save = (k) => { const f = path.join(tmp, `${k}.json`), rec = recipeFrom([R[k]]); writeJson(f, { url: R[k].url, takenAt: R[k].takenAt, results: [R[k]], recipe: rec, tokens: tokensBlock(rec, [R[k]]) }); return f; };
        const jS = save('surface'), jD = save('surface-dead'), jG = save('grain');
        const o = run([jS, '--css', path.join(tmp, 'o.css'), '--tokens', path.join(tmp, 'o.tokens.css'), '--md', path.join(tmp, 'o.md')]);
        const oc = fs.existsSync(path.join(tmp, 'o.css')) ? fs.readFileSync(path.join(tmp, 'o.css'), 'utf8') : '';
        say(o.status === 0 && /OK   крупная фактура/.test(text(o)) && /рецепт крупной фактуры/.test(text(o)) && /surface\.css с рецептом/.test(text(o)) && /\.surface--dark/.test(oc) && !/grain-overlay/.test(oc), `texture.mjs <texture.json> --css: код ${o.status}, вердикт и рецепт напечатаны, в файле — только surface.css (зерна нет)`);
        const og = run([jG, '--css', path.join(tmp, 'g.css')]);
        const gc = fs.existsSync(path.join(tmp, 'g.css')) ? fs.readFileSync(path.join(tmp, 'g.css'), 'utf8') : '';
        say(og.status === 0 && /grain\.css с рецептом/.test(text(og)) && /grain-overlay/.test(gc) && !/\.surface/.test(gc) && /крупная фактура[^\n]*: нет/.test(text(og)) && !/рецепт крупной фактуры/.test(text(og)), `texture.mjs <texture.json> у сайта с зерном: код ${og.status}, grain.css как раньше, строка «крупная фактура: нет»`);
        const lk = spawnSync(process.execPath, [path.join(HERE, 'surface-tile.mjs'), '--out', path.join(tmp, 'mine'), '--size', '256', '--like', jS, '--json', path.join(tmp, 'mine.json')], { cwd: tmp, encoding: 'utf8', timeout: 240000, windowsHide: true });
        const mj = readJson(path.join(tmp, 'mine.json'));
        say(lk.status === 0 && !!mj && Math.abs(mj.files[0].mean - R.surface.surface.tile.mean) <= 1 && Math.abs(mj.files[0].sd - R.surface.surface.tile.sd) <= 0.4, `surface-tile.mjs --like <этот texture.json>: своя плитка ${mj ? `${mj.files[0].mean} ± ${mj.files[0].sd}` : '—'} при ${R.surface.surface.tile.mean} ± ${R.surface.surface.tile.sd} у донора`);
        const cc = run(['compare', jS, jD, '--viewport', VP, '--out', path.join(tmp, 'cmp1')]), co = run(['compare', jS, jS, '--viewport', VP, '--out', path.join(tmp, 'cmp2')]);
        say(cc.status === 1 && /FAIL/.test(text(cc)) && /фактура σ тёмный/.test(text(cc)) && co.status === 0 && /OK: сверка фактуры/.test(text(co)), `texture.mjs compare по замерам: расхождение — код ${cc.status}, совпадение — код ${co.status}`);
      }
    }
  } catch (e) {
    say(false, `selftest оборвался: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* временная папка занята — останется */ } }
  console.log(`\n${bad ? 'FAIL' : 'OK'}: проверок ${n}, провалов ${bad}`);
  return bad ? 1 : 0;
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const VALUES = ['viewport', 'viewports', 'vp', 'out', 'json', 'tokens', 'css', 'md', 'png', 'png2', 'png3', 'without', 'region', 'tile', 'label', 'screens'];
  const TOLS = ['sd-tol', 'lag-tol', 'surface-tol'];
  const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['extras', 'help', 'h', 'strict', 'selftest', 'no-browser'], values: VALUES, optional: TOLS, commands: ['compare', 'selftest'], strict: true });
  const die = (msg) => { console.error(msg); process.exit(1); };
  /* WARN lib (свой стиль не вставился) — не посреди вывода, а в итоге и в json (warnings). Только как скрипт:
     texture — ещё и модуль discover, perf и a11y, у них свой сбор */
  collectWarnings();
  const libWarnings = () => { const w = takeWarnings(); for (const x of w) console.log(`WARN ${x}`); return w; };
  /* --viewport, --viewports и старое --vp — один флаг во всех режимах (замер, texture.json, compare) */
  const vpKeys = ['viewport', 'viewports', 'vp'].filter((k) => opt[k] !== undefined && opt[k] !== true);
  const vpSpec = vpKeys.length ? String(opt[vpKeys[0]]).trim() : null;
  try {
    /* короткий -h parseArgs отдаёт позиционным — без этой проверки он уходил в замер как адрес;
       -h на месте значения флага (--out -h) — тоже справка, до любых папок и браузера */
    if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h') || (!pos.length && !opt.png && !opt.tile && !opt.selftest)) {
      console.log(HELP);
      process.exit(0);
    }
    /* флаг со значением без значения: --tokens в конце писал файл «true», --sd-tol без числа давал допуск 100 % */
    for (const k of [...VALUES, ...TOLS]) if (opt[k] === true) die(`--${k}: нужно значение (подробно: --help)`);
    if (new Set(vpKeys.map((k) => String(opt[k]).trim())).size > 1) die(`Заданы ${vpKeys.map((k) => `--${k} ${opt[k]}`).join(' и ')} — это один флаг (--viewport, --viewports, --vp), оставьте один`);
    for (const k of TOLS) if (opt[k] !== undefined && !(Number(opt[k]) >= 0)) die(`--${k} ${opt[k]}: нужно число от 0 (0.2 = ±20 %)`);
    if (pos[0] === 'selftest' || opt.selftest) {
      /* без await: selftest подгружает surface-tile.mjs, а тот импортирует этот файл — пока здесь ждёт
         await верхнего уровня, загрузка не закончится и оба встанут */
      selftest({ browser: !opt['no-browser'] }).then((code) => process.exit(code), (e) => { console.error(`FAIL texture.mjs selftest: ${e && e.message ? e.message : e}`); process.exit(1); });
    } else if (opt.tile) {
      const t = await analyzeTile(String(opt.tile), { seam: true });
      console.log(`${t.file}: ${t.format} ${t.width}×${t.height}, ${Math.round(t.bytes / 1024)} КБ, кадров ${t.pages}${t.frameMs ? ` по ${t.frameMs} мс (цикл ${t.cycleMs} мс)` : ''}, повтор ${t.loop ?? '—'}; ${t.noiseLike ? 'похоже на шум' : 'НЕ похоже на шум'}`);
      t.frames.forEach((f, i) => console.log(`  кадр ${i}: яркость ${f.mean}±${f.sd} (на сером ±${f.sdOver}), lag1 ${f.lag1}/${f.lag1v}, связь на 3–6 px ${f.farCorr}, альфа ${f.alphaMean} (прозрачных ${f.transparent}), цветность ${f.chroma}, уровней ${f.levels}`));
      if (t.frameCorr.length) console.log(`  связь соседних кадров: ${t.frameCorr.join(' / ')} (≈0 — независимые, «кипит»)`);
      /* крупная фактура — отдельной строкой: первая строка про шум остаётся как была */
      const f0 = t.frames[0];
      console.log(`  крупная фактура (мятая бумага, камень, ткань): ${t.surfaceLike ? `да — σ ${f0.sd} в пределах ${SURFACE.sdMin}…${SURFACE.sdMax}, детали крупнее пикселя (lag1 ${f0.lag1}/${f0.lag1v}) и по всей площади (частей с деталями ${f0.parts ? f0.parts.live : '—'} из 16)` : `нет — ${t.surfaceWhy.join('; ')}`}`);
      if (t.seam && t.seam.max != null) console.log(`  шов при повторе: ${t.seam.x} по ширине, ${t.seam.y} по высоте — ${t.seam.max > SEAM_FAIL ? 'стык виден' : t.seam.max > SEAM_WARN ? 'стык возможен, смотреть глазами' : 'бесшовная'} (1 — край не отличить от середины; больше ${SEAM_FAIL} — стык виден)`);
      if (opt.json) writeJson(String(opt.json), t);
    } else if (opt.png) {
      const region = opt.region ? String(opt.region).split(',').map(Number) : null;
      const m = await measurePng(String(opt.png), { file2: opt.png2 ? String(opt.png2) : null, file3: opt.png3 ? String(opt.png3) : null, without: opt.without ? String(opt.without) : null, region });
      console.log(`${path.basename(String(opt.png))}: ${m.size[0]}×${m.size[1]}, ровных плиток ${m._tiles.length} из ${m._tiles.total}${opt.without ? ' (ровность — по снимку без слоя)' : ' (относительный порог ровности)'}`);
      printBands(m, 'зерно');
      if (m.contribution) printBands(m.contribution, 'вклад слоя (со слоем − без)');
      const st = [m.dark, m.mid, m.light].some((b) => b.status === 'есть') ? 'есть' : [m.dark, m.mid, m.light].some((b) => b.status === 'нет') ? 'нет' : 'не измерено';
      console.log(`${st === 'есть' ? 'OK  ' : 'WARN'} зерно: ${st}${st === 'не измерено' ? ' — ровных участков мало, это не «зерна нет»' : ''}`);
      if (m.size[0] > 2600 || m.size[1] > 4000) console.log('WARN снимок очень большой — если это полностраничный снимок, закреплённое зерно на нём есть только в верхнем экране; мерить снимки окна');
      if (opt.json) writeJson(String(opt.json), { ...m, _tiles: undefined });
    } else if (pos[0] === 'compare') {
      /* код 1, как у остальных ошибок аргументов и как обещает справка (до 28.09.2026 здесь был 2) */
      if (!pos[1] || !pos[2]) die('compare <донор: url|json> <сайт: url|json>');
      const kDonor = inputKind(pos[1], die), kSite = inputKind(pos[2], die);
      const vps = pickViewports(vpSpec || 'desktop,mobile');
      /* texture.json читаются до папок и браузера: битый файл — ошибка сразу, а не после замера второй стороны */
      const donorSet = kDonor === 'json' ? loadSet(pos[1]) : null, siteSet = kSite === 'json' ? loadSet(pos[2]) : null;
      const out = path.resolve(String(opt.out || path.join(runDir({}, kSite === 'json' ? 'http://site.local/' : String(pos[2])), 'texture-compare')));
      ensureDir(out);
      const screens = Number(opt.screens) || 4;
      const donor = donorSet || await runSet(String(pos[1]), vps, out, screens, false, 'donor');
      const site = siteSet || await runSet(String(pos[2]), vps, out, screens, false, 'site');
      const want = new Set(vps.map(([n]) => n));
      const dl = donor.filter((r) => want.has(r.viewport.name)); const sl = site.filter((r) => want.has(r.viewport.name));
      for (const r of dl) printResult(r);
      for (const r of sl) printResult(r);
      const cmp = compareSets(dl.length ? dl : donor, sl.length ? sl : site, { sdTol: opt['sd-tol'] != null ? Number(opt['sd-tol']) : 0.2, lagTol: opt['lag-tol'] != null ? Number(opt['lag-tol']) : 0.15, surfaceTol: opt['surface-tol'] != null ? Number(opt['surface-tol']) : 0.3 });
      console.log('\n== донор против сайта');
      console.log('   σ по полосам — вклад найденных слоёв (снимок со слоем − без); где прохода без слоя не было — σ на снимке');
      if (cmp.some((c) => c.surface)) console.log('   фактура σ — крупная фактура: разброс её вклада (снимок с плиткой − без) на ровных участках 128 px, в скобках — сколько участков');
      let fail = false, warn = false;
      for (const c of cmp) {
        console.log(`\n${c.viewport}:`);
        console.log(`  ${'что'.padEnd(18)}${'донор'.padEnd(20)}${'сайт'.padEnd(20)}${'допуск'.padEnd(10)}итог`);
        for (const r of c.rows) console.log(`  ${String(r.what).padEnd(18)}${String(r.donor ?? '—').padEnd(20)}${String(r.site ?? '—').padEnd(20)}${String(r.tol || '').padEnd(10)}${r.ok === true ? 'OK' : r.ok === false ? 'FAIL' : '—'}${r.note ? `  ${r.note}` : ''}`);
        for (const h of c.hints || []) console.log(`  → ${h}`);
        console.log(`${c.verdict.padEnd(4)} ${c.viewport}: ${c.verdict === 'OK' ? 'фактура как у донора' : c.verdict === 'WARN' ? 'сравнить нечем (нет ровных фонов или замера)' : 'фактура не как у донора'}`);
        if (c.verdict === 'FAIL') fail = true; if (c.verdict === 'WARN') warn = true;
      }
      const lw = libWarnings(); if (lw.length) warn = true;
      writeJson(String(opt.json || path.join(out, 'compare.json')), { donor: dl, site: sl, compare: cmp, ...(lw.length ? { warnings: lw } : {}) });
      console.log(`\n${fail ? 'FAIL' : warn ? 'WARN' : 'OK'}: сверка фактуры — ${path.join(out, 'compare.json')}`);
      if (fail) process.exit(1); /* compare даёт 1 при FAIL и без --strict — как раньше */
    } else {
      /* texture.json прошлого замера вместо адреса: рецепт, --tokens, --css, --md без нового замера */
      const fromJson = inputKind(pos[0], die) === 'json';
      const saved = fromJson ? readJson(String(pos[0])) : null;
      const url = fromJson ? String((saved && saved.url) || pos[0]) : String(pos[0]);
      let list;
      if (fromJson) {
        list = loadSet(pos[0]);
        if (vpSpec) { const want = new Set(pickViewports(vpSpec).map(([n]) => n)); list = list.filter((r) => want.has(r.viewport.name)); }
        if (!list.length) throw new Error(`в ${pos[0]} нет замеров${vpSpec ? ' для этих экранов' : ''}`);
        console.log(`замер из ${pos[0]} (${url}, ${saved && saved.takenAt ? saved.takenAt.slice(0, 10) : 'дата неизвестна'}) — страница заново не открывается`);
      } else {
        const vps = pickViewports(vpSpec || 'desktop,tablet,mobile');
        const out = path.resolve(String(opt.out || path.join(runDir({}, url), 'texture')));
        ensureDir(out);
        list = await runSet(url, vps, out, Number(opt.screens) || 4, !!opt.extras, opt.label ? String(opt.label) : null);
      }
      for (const r of list) printResult(r);
      const rec = recipeFrom(list);
      printRecipe(rec);
      const block = tokensBlock(rec, list);
      console.log(`\nпеременные для site.tokens.css:\n${block}`);
      const jf = fromJson ? (opt.json ? String(opt.json) : null) : String(opt.json || path.join(path.resolve(String(opt.out || path.join(runDir({}, url), 'texture'))), 'texture.json'));
      const lw = libWarnings();
      if (jf) writeJson(jf, { url, takenAt: fromJson && saved && saved.takenAt ? saved.takenAt : new Date().toISOString(), results: list, recipe: rec, tokens: block, ...(lw.length ? { warnings: lw } : {}) });
      if (opt.tokens) { writeTokens(String(opt.tokens), block); console.log(`блок переменных → ${opt.tokens}`); }
      if (opt.css) {
        /* зерно — templates/grain.css, крупная фактура — templates/surface.css. Есть только крупная фактура —
           в файл идёт она одна: выключенный слой зерна (opacity 0) рядом с ней ни к чему */
        const S = rec.surface && !rec.surface.none ? rec.surface : null;
        const parts = []; if (!S || !rec.none) parts.push(fillGrainCss(rec)); if (S) parts.push(fillSurfaceCss(S));
        ensureDir(path.dirname(path.resolve(String(opt.css)))); fs.writeFileSync(String(opt.css), parts.join('\n'));
        console.log(`${!S ? 'grain.css' : rec.none ? 'surface.css' : 'grain.css и surface.css'} с рецептом → ${opt.css}`);
      }
      if (opt.md) { ensureDir(path.dirname(path.resolve(String(opt.md)))); fs.writeFileSync(String(opt.md), textureMarkdown(list, { recipe: rec })); console.log(`раздел для discovery.md → ${opt.md}`); }
      if (jf) console.log(`итог → ${jf}`);
      /* одиночный замер сравнивать не с чем: вердикты OK и WARN (не измерено, гаснет, не виден);
         «не как у донора» — FAIL только в compare. --strict: код 1 при FAIL, здесь его не бывает */
      const surfWarn = list.reduce((s, r) => s + (r.surface && (r.surface.layers || []).length ? (r.surface.status !== 'есть' ? 1 : 0) + (r.surface.diagnosis || []).length : 0), 0);
      const nWarn = list.filter((r) => r.status !== 'есть').length + list.reduce((s, r) => s + (r.diagnosis || []).length, 0) + lw.length + surfWarn;
      console.log(`\nИтог: ${nWarn ? `WARN ${nWarn}` : 'OK'} — одиночный замер даёт только OK и WARN; «фактура не как у донора» (FAIL, код 1) — texture.mjs compare${opt.strict ? ' (--strict: код выхода 0 — FAIL нет)' : ''}`);
    }
  } catch (e) {
    console.error(`FAIL texture.mjs: ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
}
