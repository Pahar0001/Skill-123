#!/usr/bin/env node
/**
 * Фактура сайта: найти слои зерна и шума, снять их параметры, разобрать файл
 * текстуры и измерить силу зерна числом — у донора и у своей сборки одним и тем
 * же способом; напечатать рецепт и переменные для site.tokens.css; сравнить
 * донора со сборкой по каждому экрану.
 *
 *   node texture.mjs <url> [--viewport desktop,tablet,mobile] [--out папка] [--screens 4]
 *                    [--label имя] [--json файл] [--tokens файл] [--css файл] [--md файл] [--extras] [--strict]
 *   node texture.mjs <texture.json> [--viewport desktop,mobile] [--tokens файл] [--css файл] [--md файл]
 *                    [--json файл]      рецепт и файлы по прошлому замеру: страница заново не открывается
 *   node texture.mjs compare <донор: url|texture.json> <сайт: url|texture.json>
 *                    [--viewport desktop,mobile] [--out папка] [--screens 4] [--sd-tol 0.2] [--lag-tol 0.15]
 *   node texture.mjs --png снимок.png [--png2 через-250мс.png] [--png3 ещё.png]
 *                    [--without без-слоя.png] [--region x,y,w,h] [--json файл]
 *   node texture.mjs --tile файл.gif|png|webp|svg      разбор файла текстуры по всем кадрам
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
 *   --css       записать шаблон templates/grain.css с подставленными значениями рецепта.
 *   --md        записать раздел «Фактура (параметры для переноса)» для discovery.md.
 *   --extras    ещё вуали, псевдоэлементы, backdrop-filter, blend, градиенты, фоновые видео.
 *   --sd-tol    допуск σ в compare (0.2 = ±20 %), --lag-tol — допуск lag1 (0.15).
 *   --png/--png2/--png3/--without/--region  метрика по готовым снимкам (1:1, не уменьшенным).
 *   --tile      разбор файла текстуры: кадры, мс на кадр, σ, lag1, альфа, похож ли на шум.
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
 * Экспорт для других скриптов (discover.mjs, a11y.mjs): findTextureLayers, TEXTURE_LAYERS_FN,
 * hideTextureLayers, showTextureLayers, measureTexture, textureOnUrl, analyzeTile, measurePng,
 * grainTiles, summarize, lumaOf, blendAdvice, recipeFrom, tokensBlock, fillGrainCss,
 * textureMarkdown, compareTexture, compareSets, TILE_SD, setPageStyle, dropPageStyle (свой стиль и при
 * строгом CSP), CSP_NO_STYLE. Описание — в комментариях у функций.
 *
 * Коды выхода: 0 — готово (одиночный замер — при любых WARN); 1 — compare с FAIL, неверные аргументы
 * (экран, адрес, нет файла, флаг без значения) или ошибка замера (FAIL texture.mjs: …); 2 — у compare
 * не два аргумента.
 *
 * Чужой файл текстуры (noise.gif донора) сохраняется в --out ТОЛЬКО для замера: на сайт он не
 * переносится никогда, своя плитка — grain-tile.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launch, openPage, loadSharp, parseArgs, sleep, ensureDir, writeJson, readJson, runDir, slugFromUrl,
  scrollThrough, forceInstantScroll, scrollToY, screenSegment, segmentPositions, pickViewports, resolveViewport,
  SIG_FN, EFFECTIVE_OPACITY_FN,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, '..', 'templates', 'grain.css');

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

  /* правила внутри @media: для каждого слоя — при каких условиях он задан */
  const media = []; let unreadable = 0;
  const walk = (rules, conds) => {
    for (const r of rules) {
      if (media.length > 30000) return;
      if (r.type === 4) walk(r.cssRules, conds.concat(r.conditionText || (r.media && r.media.mediaText) || ''));
      else if (r.type === 1) { if (conds.length) media.push({ sel: r.selectorText, cond: conds.join(' and ') }); }
      else if (r.type !== 7 && r.cssRules) walk(r.cssRules, conds);
    }
  };
  for (const ss of document.styleSheets) { let rs = null; try { rs = ss.cssRules; } catch (e) { unreadable++; continue; } if (rs) walk(rs, []); }
  const mediaFor = (el, pseudo) => {
    const out = [];
    for (const m of media) {
      if (!m.sel) continue;
      for (const part of m.sel.split(',')) {
        let p = part.trim(); const pm = /::?(before|after)\s*$/i.exec(p);
        if (pseudo ? !(pm && '::' + pm[1].toLowerCase() === pseudo) : pm) continue;
        p = p.replace(/::?(before|after)\s*$/i, '').trim() || '*';
        let ok = false; try { ok = el.matches(p); } catch (e) { /* селектор не для matches */ }
        if (ok) { if (!out.includes(m.cond)) out.push(m.cond); break; }
      }
      if (out.length >= 6) break;
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
      if (!reason.length && !veilCand && !tileUrls.length) continue;

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
      if (!reason.length) continue;
      if (!pseudo) asLayer.add(el);
      const hideUrls = noiseUrls.length ? noiseUrls.slice() : maybe ? (tileUrls.length ? tileUrls.slice() : urls.slice()) : [];
      /* какой файл разбирать: шумный по имени, иначе плитка, иначе src картинки или первый фон вуали */
      const fileUrl = noiseUrls[0] || tileUrls[0] || src || urls[0] || null;

      const hasContent = !pseudo && (el === document.body || el === document.documentElement || el.children.length > 0 || (el.textContent || '').trim().length > 0);
      const kind = pseudo ? 'background' : MEDIA[tag] ? tag : urls.length ? 'background' : fT ? 'filter' : 'background';
      let hide = 'visibility';
      if (hasContent && kind === 'background' && hideUrls.length) hide = 'background';
      else if (hasContent && kind === 'filter') hide = 'filter';
      if (o.mark) el.setAttribute(pseudo ? 'data-rw-tex-' + pseudo.slice(2) : 'data-rw-tex', String(k));
      const anims = animsOf(s, 'сам');
      const kfs = {}; for (const a of anims.concat(chainAnims)) if (a.css) kfs[a.name] = a.css;
      layers.push({
        k: k++, el: sig(el), pseudo, tag, kind, reason, ...(maybe ? { maybe: true } : {}), hide,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        coversViewport: r.width >= vw * 0.95 && r.height >= vh * 0.95,
        position: s.position, fixedBy, zIndex: s.zIndex, pointerEvents: s.pointerEvents,
        opacity: own, effectiveOpacity: effO, mixBlendMode: s.mixBlendMode, blendChain,
        backgroundImage: bg.length > 240 ? bg.slice(0, 240) + '…' : bg, urls: allUrls.map(short), noiseUrls: noiseUrls.map(short),
        hideUrls, fileUrl,
        backgroundSize: s.backgroundSize, backgroundRepeat: s.backgroundRepeat, backgroundPosition: s.backgroundPosition, backgroundColor: s.backgroundColor,
        imageRendering: s.imageRendering, svg,
        animation: anims.length ? anims.map((a) => `${a.name} ${a.durationMs}ms ${a.timing} ${a.iterations}`).join(', ') : null,
        anims, animsChain: chainAnims, animChain: chainAnims.map((a) => `${a.on}: ${a.name} ${a.durationMs}ms ${a.timing} ${a.iterations}`), keyframes: kfs,
        mediaRules: mediaFor(el, pseudo), filter: s.filter, transform: s.transform,
      });
    }
  }
  const pseudoUsed = (p) => { const s = getComputedStyle(document.body, p); return !(s.content === 'none' || s.content === 'normal'); };
  const res = {
    vw, vh, dpr: devicePixelRatio, bodyBg: getComputedStyle(document.body).backgroundColor, scrollY: Math.round(scrollY),
    marked: !!o.mark, layers, svgNoise: [...turb.values()], small: [...small.values()], bodyAfterUsed: pseudoUsed('::after'), bodyBeforeUsed: pseudoUsed('::before'),
    unreadableSheets: unreadable,
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

/* Свой стиль на странице, в том числе при строгом CSP. Сначала <style data-rw="key">; если CSP страницы
   (style-src без 'unsafe-inline') его не применил — у такого элемента нет sheet, стиль молча не действует —
   элемент убирается и ставится сконструированная таблица в document.adoptedStyleSheets: CSP на неё не
   распространяется. Сама страница не меняется, CSP для вкладки не отключается. Повторный вызов с тем же
   ключом заменяет стиль, а не копит таблицы. → 'style' | 'adopted' | null (не вставился никак). */
function styleSetInPage({ key, css }) {
  const old = document.querySelector(`style[data-rw="${key}"]`); if (old) old.remove();
  const reg = window.__rwSheets || (window.__rwSheets = {});
  if (reg[key]) { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== reg[key]); delete reg[key]; }
  const st = document.createElement('style'); st.setAttribute('data-rw', key); st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
  if (st.sheet) return 'style';
  st.remove();
  try {
    const sh = new CSSStyleSheet(); sh.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
    reg[key] = sh;
    return 'adopted';
  } catch { return null; }
}
function styleDropInPage({ key }) {
  const old = document.querySelector(`style[data-rw="${key}"]`); if (old) old.remove();
  const reg = window.__rwSheets;
  if (reg && reg[key]) { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== reg[key]); delete reg[key]; }
}
/** Текст ошибки, когда стиль не вставился ни элементом, ни adoptedStyleSheets. */
export const CSP_NO_STYLE = 'CSP страницы запрещает вставку стиля';
/**
 * Вставить свой стиль под ключом (тот же ключ — замена) так, чтобы он действовал и при строгом CSP:
 * <style data-rw=key>, а если CSP его не применил — document.adoptedStyleSheets.
 * → 'style' | 'adopted' | null. Для perf.mjs (--overlay селектор) и hideTextureLayers.
 */
export function setPageStyle(page, key, css) { return page.evaluate(styleSetInPage, { key, css }); }
/** Убрать стиль, вставленный setPageStyle под этим ключом (любым из двух способов). */
export function dropPageStyle(page, key) { return page.evaluate(styleDropInPage, { key }); }

/**
 * Спрятать найденные слои (после findTextureLayers с mark: true): слой — visibility:hidden и opacity:0;
 * зерно в фоне блока с содержимым — только картинка шума в background-image заменяется на none;
 * шум фильтром у блока с содержимым — filter:none. Возвращает число правил.
 * Стиль ставится через setPageStyle (ключ texture-hide): при строгом CSP — adoptedStyleSheets; раньше
 * <style> там молча не применялся, и проход «без слоя» снимал страницу со слоем. info — необязательный
 * объект: в info.via пишется способ ('style' | 'adopted'). Не вставился никак — ошибка CSP_NO_STYLE.
 */
export async function hideTextureLayers(page, layers, info = null) {
  const spec = (layers || []).map((L) => ({ k: L.k, pseudo: L.pseudo, hide: L.hide, urls: (L.hideUrls || []).map((u) => String(u).slice(0, 300)), filterId: L.svg && L.svg.filterId ? L.svg.filterId : null }));
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
      const attr = L.pseudo ? 'data-rw-tex-' + L.pseudo.slice(2) : 'data-rw-tex';
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
 */
export function grainTiles(Y, w, h, { T = 32, Y2 = null, Y3 = null, Yw = null, region = null, border = 12 } = {}) {
  const same = (A) => (A && A.length === Y.length ? A : null);
  Y2 = same(Y2); Y3 = same(Y3); Yw = same(Yw);
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
      if (Y2) t.flicker2 = diffStats(Y2, Y, w, tx, ty, T, R).sd / Math.SQRT2;
      if (Y3) t.flicker3 = diffStats(Y3, Y, w, tx, ty, T, R).sd / Math.SQRT2;
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
 * Разбор файла текстуры по ВСЕМ кадрам (GIF/WebP) — файл или Buffer (SVG тоже: sharp его рисует).
 * → { file, format, bytes, width, height, pages, delayMs[], frameMs, cycleMs, fps, loop,
 *     frames: [{ mean, sd, sdOver, lag1, lag1v, alphaMean, transparent, chroma, levels }],
 *     frameCorr[], noiseLike }. sdOver — σ яркости, положенной на средний серый (для альфа-зерна);
 * noiseLike — похоже на шум: σ заметная, связь соседей < 0.8, на расстоянии 3–6 px связи нет (не узор).
 */
export async function analyzeTile(input, { name = null } = {}) {
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
  const bytes = Buffer.isBuffer(input) ? input.length : fs.statSync(input).size;
  return {
    file: name || (Buffer.isBuffer(input) ? '(данные)' : path.basename(input)), format: meta.format, bytes, width: W, height: H, pages,
    delayMs: delay, frameMs: delay.length ? median(delay) : null, cycleMs: cycle || null, fps: cycle ? r2(1000 * delay.length / cycle) : null,
    loop: meta.loop ?? null, frames, frameCorr, noiseLike,
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
  if (files) {
    const cache = new Map();
    for (const L of found.layers) {
      const u = L.fileUrl;
      if (!u || L.kind === 'canvas') continue;
      try {
        let got = cache.get(u);
        if (got === undefined) { got = await fetchLayerFile(page, u); cache.set(u, got); }
        if (!got) { L.file = { error: 'файл не получен' }; continue; }
        const ext = /^data:image\/svg/i.test(u) || /<svg/i.test(got.buf.slice(0, 200).toString()) ? '.svg' : (() => { try { return path.extname(new URL(u, page.url()).pathname) || '.img'; } catch { return '.img'; } })();
        let fname = null;
        if (dir) { fname = path.join(dir, `${label}-layer${L.k}${ext}`); fs.writeFileSync(fname, got.buf); }
        L.file = await analyzeTile(got.buf, { name: /^data:/i.test(u) ? `data-URI ${ext.slice(1)}` : path.basename(new URL(u, page.url()).pathname) });
        L.file.via = got.via; if (fname) L.file.saved = fname;
      } catch (e) { L.file = { error: String(e.message || e).slice(0, 160) }; }
    }
    for (let i = found.layers.length - 1; i >= 0; i--) {
      const L = found.layers[i];
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
  }

  const vh = found.vh; const vpNow = page.viewport() || { width: found.vw, height: vh, deviceScaleFactor: found.dpr };
  const total = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
  const ys = segmentPositions(total, vh, { step: 1, maxShots: Math.max(1, Number(screens) || 4) });
  const layers = found.layers;
  const allTiles = []; const perScreen = [];
  let hasLayers = layers.length > 0 && withWithout;
  /* как прятался слой: 'style' или 'adopted' (строгий CSP); не спрятался — прохода «без слоя» нет */
  const hideInfo = { via: null }; let hideError = null;
  for (let i = 0; i < ys.length; i++) {
    const seg = await screenSegment(page, ys[i], { pause, settle: 800, mediaTimeout: 4000 });
    const a = seg.buffer;
    await sleep(boilMs); const b = await page.screenshot({ type: 'png' });
    await sleep(120); const c = await page.screenshot({ type: 'png' });
    let wbuf = null;
    if (hasLayers) {
      try { await hideTextureLayers(page, layers, hideInfo); } catch (e) { hideError = String(e && e.message ? e.message : e).slice(0, 160); }
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
    const shots = {};
    if (dir) {
      const put = (buf, tag) => { if (!buf) return null; const f = path.join(dir, `${label}-s${i}-${tag}.png`); fs.writeFileSync(f, buf); return f; };
      shots.a = put(a, 'a'); shots.b = put(b, 'b'); shots.c = put(c, 'c'); shots.without = put(wbuf, 'without');
    }
    const A = await lumaOf(a); const B = await lumaOf(b); const C = await lumaOf(c); const Wl = wbuf ? await lumaOf(wbuf) : null;
    const tiles = grainTiles(A.Y, A.w, A.h, { Y2: B.Y, Y3: C.Y, Yw: Wl ? Wl.Y : null });
    for (const t of tiles) t.s = i;
    allTiles.push(...tiles);
    const bb = bandsAll(tiles, !!Wl);
    perScreen.push({ y: ys[i], scrollY: seg.scrollY, with: bb.grain, without: bb.without, contribution: bb.contribution, lift: bb.lift, shots });
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

/** Блок переменных для site.tokens.css (с маркерами texture:start/end и сырыми замерами в комментарии). */
export function tokensBlock(rec, results = []) {
  const list = (Array.isArray(results) ? results : [results]).filter(Boolean);
  const raw = list.map((r) => {
    const b = (k) => { const x = grainBand(r, k); return x.status === 'не измерено' ? '—' : x.sd; };
    return `   ${r.viewport.name} ${r.viewport.width}×${r.viewport.height}@${r.viewport.dpr}: ${r.status}; σ${r.contribution ? ' (вклад слоя)' : ''} тёмный ${b('dark')} / средний ${b('mid')} / светлый ${b('light')}, lag1 ${grainBand(r, 'all').lag1 ?? '—'}, кипение ${r.boil && r.boil.boils === true ? 'да' : r.boil && r.boil.boils === false ? 'нет' : r.boil && r.boil.boils ? r.boil.boils : '—'}${r.boil && r.boil.frames ? ` (${r.boil.frames} × ${r.boil.frameMs} мс, ${r.boil.source})` : ''}${r.lift && r.lift.dark != null ? `, подъём чёрного ${r.lift.dark}` : ''}`;
  });
  /* адрес внутри комментария CSS: «*\/» в нём закрыл бы комментарий раньше времени */
  const src = list[0] && list[0].url ? String(list[0].url).replace(/\*\//g, '*%2F') : '';
  return [
    '/* texture:start */',
    `/* Фактура (texture.mjs${src ? `, ${src}` : ''}, ${new Date().toISOString().slice(0, 10)}):`,
    ...raw,
    `   ${!rec.none ? `рецепт: ${rec.blendNote}; ${rec.minWidthNote}` : list.some((r) => r.status === 'не измерено') ? 'зерно не измерено (мало ровных участков) — переменные ниже выключают слой; решать глазами по вырезам 1:1' : 'зерна нет — переменные ниже выключают слой (opacity 0)'}`,
    `   ${rec.tileCmd ? `плитка: ${rec.tileCmd}` : 'плитка не нужна, пока зерна нет'} */`,
    ':root{',
    `  --grain-opacity: ${rec.none ? 0 : rec.opacity};`,
    `  --grain-size: ${rec.size}px;`,
    `  --grain-px: ${rec.px};`,
    `  --grain-frames: ${rec.frames};`,
    `  --grain-frame-ms: ${rec.frameMs}ms;`,
    `  --grain-blend: ${rec.blend};`,
    `  --grain-min-width: ${rec.minWidth || 0}px;`,
    `  --grain-rendering: ${rec.rendering};`,
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

export function compareTexture(donor, site, { sdTol = 0.2, lagTol = 0.15 } = {}) {
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
  const verdict = rows.some((r) => r.ok === false) ? 'FAIL' : bandRows.every((r) => r.ok == null) ? 'WARN' : rows.some((r) => r.ok == null && r.what !== 'кипение' && !r.what.startsWith('σ')) ? 'WARN' : 'OK';
  return { viewport: vpn, dprOk, rows, verdict, hints };
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

const HELP = `texture.mjs — фактура: слои зерна, их параметры, сила зерна числом, рецепт и сверка с донором

  node texture.mjs <url> [--viewport desktop,tablet,mobile] [--out папка] [--screens 4] [--label имя]
                   [--json файл] [--tokens файл] [--css файл] [--md файл] [--extras] [--strict]
  node texture.mjs <texture.json> [--viewport desktop,mobile] [--tokens файл] [--css файл] [--md файл] [--json файл]
                   рецепт, --tokens/--css/--md по прошлому замеру — страница заново не открывается;
                   --viewport оставляет только эти экраны; texture.json пишется только с --json;
                   путь на .json, которого нет, — «нет файла <путь>», код 1
  node texture.mjs compare <донор: url|texture.json> <сайт: url|texture.json> [--viewport desktop,mobile]
                   [--out папка] [--screens 4] [--sd-tol 0.2] [--lag-tol 0.15]
  node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл]
  node texture.mjs --tile файл.gif|png|webp|svg
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
  --tokens    записать блок --grain-* в файл (заменяет блок texture:start…end или дописывает)
  --css       записать templates/grain.css с подставленным рецептом
  --md        записать раздел «Фактура (параметры для переноса)» для discovery.md
  --extras    ещё вуали, псевдоэлементы, backdrop-filter, blend, градиенты, фоновые видео
  --sd-tol    допуск σ по полосам в compare (0.2 = ±20 %); --lag-tol — допуск lag1 (0.15)
  --png …     метрика по готовым снимкам окна 1:1: --png2/--png3 — тот же экран позже (кипение),
              --without — тот же экран без слоя (ровность и вклад слоя), --region x,y,w,h
  --tile      разбор файла текстуры по всем кадрам (кадры, мс, σ, lag1, альфа, похож ли на шум)

Вердикты: OK — совпадает/есть; WARN — не измерено или гаснет; FAIL — не как у донора (compare, код 1).
Строгий CSP страницы: слой для прохода «без слоя» прячется таблицей adoptedStyleSheets (<style> там не действует).
Коды: 0 — готово; 1 — compare с FAIL, неверные аргументы или ошибка замера; 2 — у compare не два аргумента.`;

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
}
function printRecipe(rec) {
  console.log('\nрецепт (своя плитка + templates/grain.css):');
  if (rec.none) { for (const n of rec.notes) console.log(`  ${n}`); return; }
  console.log(`  где есть: ${Object.entries(rec.present).map(([k, v]) => `${k} ${vb(v)}`).join(', ')}; --grain-min-width: ${rec.minWidth}px (${rec.minWidthNote})`);
  console.log(`  --grain-opacity: ${rec.opacity}   (${rec.blendNote})`);
  console.log(`  --grain-blend: ${rec.blend}; --grain-px: ${rec.px}; --grain-rendering: ${rec.rendering} (как у донора)`);
  console.log(`  движение: ${rec.boil ? `--grain-frames: ${rec.frames}; --grain-frame-ms: ${rec.frameMs}ms (${rec.boilSource}) → animation grain-boil ${rec.frames * rec.frameMs}ms steps(1), ${rec.frames} сдвига` : 'не кипит — без анимации'}`);
  if (rec.lift != null) console.log(`  подъём чёрного у донора: ${rec.lift} ур.`);
  console.log(`  плитка: ${rec.tileCmd}`);
  for (const n of rec.notes) console.log(`  · ${n}`);
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

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const VALUES = ['viewport', 'viewports', 'vp', 'out', 'json', 'tokens', 'css', 'md', 'png', 'png2', 'png3', 'without', 'region', 'tile', 'label', 'screens'];
  const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['extras', 'help', 'h', 'strict'], values: VALUES, optional: ['sd-tol', 'lag-tol'], commands: ['compare'] });
  const die = (msg) => { console.error(msg); process.exit(1); };
  /* --viewport, --viewports и старое --vp — один флаг во всех режимах (замер, texture.json, compare) */
  const vpKeys = ['viewport', 'viewports', 'vp'].filter((k) => opt[k] !== undefined && opt[k] !== true);
  const vpSpec = vpKeys.length ? String(opt[vpKeys[0]]).trim() : null;
  try {
    /* короткий -h parseArgs отдаёт позиционным — без этой проверки он уходил в замер как адрес;
       -h на месте значения флага (--out -h) — тоже справка, до любых папок и браузера */
    if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h') || (!pos.length && !opt.png && !opt.tile)) {
      console.log(HELP);
      process.exit(0);
    }
    /* флаг со значением без значения: --tokens в конце писал файл «true», --sd-tol без числа давал допуск 100 % */
    for (const k of [...VALUES, 'sd-tol', 'lag-tol']) if (opt[k] === true) die(`--${k}: нужно значение (подробно: --help)`);
    if (new Set(vpKeys.map((k) => String(opt[k]).trim())).size > 1) die(`Заданы ${vpKeys.map((k) => `--${k} ${opt[k]}`).join(' и ')} — это один флаг (--viewport, --viewports, --vp), оставьте один`);
    for (const k of ['sd-tol', 'lag-tol']) if (opt[k] !== undefined && !(Number(opt[k]) >= 0)) die(`--${k} ${opt[k]}: нужно число от 0 (0.2 = ±20 %)`);
    if (opt.tile) {
      const t = await analyzeTile(String(opt.tile));
      console.log(`${t.file}: ${t.format} ${t.width}×${t.height}, ${Math.round(t.bytes / 1024)} КБ, кадров ${t.pages}${t.frameMs ? ` по ${t.frameMs} мс (цикл ${t.cycleMs} мс)` : ''}, повтор ${t.loop ?? '—'}; ${t.noiseLike ? 'похоже на шум' : 'НЕ похоже на шум'}`);
      t.frames.forEach((f, i) => console.log(`  кадр ${i}: яркость ${f.mean}±${f.sd} (на сером ±${f.sdOver}), lag1 ${f.lag1}/${f.lag1v}, связь на 3–6 px ${f.farCorr}, альфа ${f.alphaMean} (прозрачных ${f.transparent}), цветность ${f.chroma}, уровней ${f.levels}`));
      if (t.frameCorr.length) console.log(`  связь соседних кадров: ${t.frameCorr.join(' / ')} (≈0 — независимые, «кипит»)`);
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
      if (!pos[1] || !pos[2]) { console.error('compare <донор: url|json> <сайт: url|json>'); process.exit(2); }
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
      const cmp = compareSets(dl.length ? dl : donor, sl.length ? sl : site, { sdTol: opt['sd-tol'] != null ? Number(opt['sd-tol']) : 0.2, lagTol: opt['lag-tol'] != null ? Number(opt['lag-tol']) : 0.15 });
      console.log('\n== донор против сайта');
      console.log('   σ по полосам — вклад найденных слоёв (снимок со слоем − без); где прохода без слоя не было — σ на снимке');
      let fail = false, warn = false;
      for (const c of cmp) {
        console.log(`\n${c.viewport}:`);
        console.log(`  ${'что'.padEnd(18)}${'донор'.padEnd(20)}${'сайт'.padEnd(20)}${'допуск'.padEnd(10)}итог`);
        for (const r of c.rows) console.log(`  ${String(r.what).padEnd(18)}${String(r.donor ?? '—').padEnd(20)}${String(r.site ?? '—').padEnd(20)}${String(r.tol || '').padEnd(10)}${r.ok === true ? 'OK' : r.ok === false ? 'FAIL' : '—'}${r.note ? `  ${r.note}` : ''}`);
        for (const h of c.hints || []) console.log(`  → ${h}`);
        console.log(`${c.verdict.padEnd(4)} ${c.viewport}: ${c.verdict === 'OK' ? 'фактура как у донора' : c.verdict === 'WARN' ? 'сравнить нечем (нет ровных фонов или замера)' : 'фактура не как у донора'}`);
        if (c.verdict === 'FAIL') fail = true; if (c.verdict === 'WARN') warn = true;
      }
      writeJson(String(opt.json || path.join(out, 'compare.json')), { donor: dl, site: sl, compare: cmp });
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
      if (jf) writeJson(jf, { url, takenAt: fromJson && saved && saved.takenAt ? saved.takenAt : new Date().toISOString(), results: list, recipe: rec, tokens: block });
      if (opt.tokens) { writeTokens(String(opt.tokens), block); console.log(`блок переменных → ${opt.tokens}`); }
      if (opt.css) { ensureDir(path.dirname(path.resolve(String(opt.css)))); fs.writeFileSync(String(opt.css), fillGrainCss(rec)); console.log(`grain.css с рецептом → ${opt.css}`); }
      if (opt.md) { ensureDir(path.dirname(path.resolve(String(opt.md)))); fs.writeFileSync(String(opt.md), textureMarkdown(list, { recipe: rec })); console.log(`раздел для discovery.md → ${opt.md}`); }
      if (jf) console.log(`итог → ${jf}`);
      /* одиночный замер сравнивать не с чем: вердикты OK и WARN (не измерено, гаснет, не виден);
         «не как у донора» — FAIL только в compare. --strict: код 1 при FAIL, здесь его не бывает */
      const nWarn = list.filter((r) => r.status !== 'есть').length + list.reduce((s, r) => s + (r.diagnosis || []).length, 0);
      console.log(`\nИтог: ${nWarn ? `WARN ${nWarn}` : 'OK'} — одиночный замер даёт только OK и WARN; «фактура не как у донора» (FAIL, код 1) — texture.mjs compare${opt.strict ? ' (--strict: код выхода 0 — FAIL нет)' : ''}`);
    }
  } catch (e) {
    console.error(`FAIL texture.mjs: ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
}
