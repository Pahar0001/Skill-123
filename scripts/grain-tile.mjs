#!/usr/bin/env node
/**
 * Своя шумовая плитка для зерна. Чужой файл (noise.gif донора и любой другой)
 * на сайт не переносится никогда: у донора снимаются только параметры
 * (texture.mjs), а плитка генерируется здесь, детерминированно — при одном
 * и том же --seed файлы совпадают побайтно, диф в git не шумит.
 *
 *   node grain-tile.mjs --out папка [--size 256] [--levels 16] [--mode gray|alpha]
 *                       [--px 1] [--frames 1] [--fps 10 | --frame-ms 100] [--seed 7]
 *                       [--name имя] [--formats png,sprite,gif,webp] [--json файл]
 *   node grain-tile.mjs --check файл.png|gif|webp [--sprite-frames N] [--json файл]
 *
 * Флаги:
 *   --out        папка для файлов (по умолчанию текущая).
 *   --size       сторона плитки в пикселях (256).
 *   --levels     число уровней яркости, 2…256 (16: sd ≈ 78, файл ≈ 32 КБ).
 *   --mode gray  непрозрачный серый шум, равномерный 0…255 (среднее 127, sd ≈ 78).
 *                Кладётся слоем mix-blend-mode:normal с opacity = нужная σ / σ плитки
 *                (σ 5 на снимке → .064). Одинаковая сила на любом фоне, включая #000;
 *                чёрный поднимается до ≈ opacity × 127, белый опускается на столько же.
 *   --mode alpha белые и чёрные зёрна с альфой |2n−1|: светлые видны на тёмном, тёмные
 *                на светлом. GIF полупрозрачность не держит — для alpha только PNG/WebP.
 *   --px N       зерно N×N пикселей (крупнее, «грубая плёнка»); lag1 плитки ≈ 1 − 1/N.
 *   --frames N   N независимых кадров: спрайт-столбик PNG (для steps()) и анимированные
 *                GIF и WebP. Для «кипения» сдвигом (templates/grain.css) хватает одного
 *                кадра; GIF/WebP — если нужен покадровый файл, как у донора.
 *   --fps / --frame-ms  частота кадров GIF/WebP (10 к/с = 100 мс, как у донора).
 *   --seed       зерно генератора (7). Другое число — другой, но тоже постоянный шум.
 *   --name       имя файлов (grain-<mode>-<size>[-pxN]).
 *   --formats    что писать, через запятую: png, sprite, gif, webp. По умолчанию png,
 *                а при --frames > 1 ещё sprite, webp и gif (gif — только для gray).
 *   --json       записать итог самопроверки в файл.
 *   --check      не генерировать, а проверить готовый файл: все кадры GIF/WebP, у
 *                спрайта — все полосы (--sprite-frames N).
 *
 * Самопроверка после записи читает КАЖДЫЙ кадр каждого файла (не только первый):
 * число кадров и задержки, среднее, σ, альфа, lag1, число уровней, связь соседних
 * кадров и побайтное совпадение с тем, что генерировалось (для форматов без потерь).
 * Вердикты: OK — файл как задумано; WARN — формат не держит задуманное (alpha в GIF);
 * FAIL — кадров не столько, кадр испорчен или повторяет соседний. Код выхода 1 при FAIL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSharp, parseArgs, writeJson } from './lib.mjs';

const sharp = loadSharp();
if (!sharp) { console.error('Нужен sharp: npm i sharp --prefix ~/.claude/site-rework (или запускать из папки проекта, где он есть).'); process.exit(1); }

const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);

/* ---------------- генерация ---------------- */

/** Кадры шума: массив Buffer (1 канал для gray, 2 — серый+альфа для alpha). Детерминированно по seed. */
export function makeFrames({ size = 256, levels = 16, px = 1, frames = 1, mode = 'gray', seed = 7 } = {}) {
  let s = seed | 0;
  /* mulberry32 — одинаковый шум при каждом запуске */
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const q = (v) => Math.round(Math.floor(v * levels) * 255 / (levels - 1)); /* равные ступени 0…255 */
  const ch = mode === 'alpha' ? 2 : 1; const cells = Math.ceil(size / px);
  const one = () => {
    const buf = Buffer.alloc(size * size * ch);
    for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
      const n = Math.min(0.999999, rnd());
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
        const yy = cy * px + y, xx = cx * px + x; if (yy >= size || xx >= size) continue;
        const i = (yy * size + xx) * ch;
        if (mode === 'alpha') { buf[i] = n >= 0.5 ? 255 : 0; buf[i + 1] = q(Math.abs(2 * n - 1)); } else buf[i] = q(n);
      }
    }
    return buf;
  };
  return [...new Array(frames)].map(one);
}

/* Параметры PNG: серая плитка — палитра из levels цветов (32 КБ вместо 65); альфа-плитка —
   без палитры: в sharp colours сам включает палитру, и альфа квантуется (было «уровней 3»). */
function pngOpts(mode, levels) {
  return mode === 'alpha' ? { compressionLevel: 9, effort: 10 } : { compressionLevel: 9, palette: true, colours: Math.min(256, Math.max(2, levels)), effort: 10 };
}

/** σ яркости плитки с такими параметрами (по умолчанию — 256 px, 16 уровней, серая, seed 7: 78.35). */
export function tileSd({ size = 256, levels = 16, px = 1, mode = 'gray', seed = 7 } = {}) {
  const [b] = makeFrames({ size, levels, px, frames: 1, mode, seed });
  const ch = mode === 'alpha' ? 2 : 1; const n = size * size; let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const v = mode === 'alpha' ? (b[i * ch + 1] / 255) * b[i * ch] + (1 - b[i * ch + 1] / 255) * 128 : b[i * ch]; s += v; s2 += v * v; }
  const m = s / n; return r2(Math.sqrt(Math.max(0, s2 / n - m * m)));
}

/** Ожидаемые RGBA-пиксели кадра (для сверки декодированного файла с задуманным). */
function expectedRgba(buf, mode) {
  const ch = mode === 'alpha' ? 2 : 1; const n = buf.length / ch; const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = buf[i * ch]; out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = mode === 'alpha' ? buf[i * ch + 1] : 255;
  }
  return out;
}

/* ---------------- проверка файла: все кадры ---------------- */

function frameStats(data, off, W, H) {
  const n = W * H; const L = new Float32Array(n); let s = 0, s2 = 0, a = 0, a0 = 0; const lv = new Set();
  for (let i = 0; i < n; i++) {
    const o = off + i * 4; const v = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
    L[i] = v; s += v; s2 += v * v; a += data[o + 3]; if (data[o + 3] === 0) a0++; if (lv.size < 300) lv.add(data[o]);
  }
  const m = s / n, v = Math.max(0, s2 / n - m * m); let ch = 0, cv = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) ch += (L[y * W + x] - m) * (L[y * W + x + 1] - m);
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) cv += (L[y * W + x] - m) * (L[(y + 1) * W + x] - m);
  return { L, m, st: { mean: r2(m), sd: r2(Math.sqrt(v)), alpha: r2(a / n / 255), transparent: r2(a0 / n), lag1: v > 0 ? r3(ch / (H * (W - 1)) / v) : null, lag1v: v > 0 ? r3(cv / ((H - 1) * W) / v) : null, levels: lv.size >= 300 ? '300+' : lv.size } };
}
const corr = (A, B) => { let s = 0, sa = 0, sb = 0; for (let i = 0; i < A.L.length; i++) { const x = A.L[i] - A.m, y = B.L[i] - B.m; s += x * y; sa += x * x; sb += y * y; } return sa && sb ? r3(s / Math.sqrt(sa * sb)) : null; };

/**
 * Разобрать файл плитки по всем кадрам: GIF/WebP — каждый кадр анимации,
 * спрайт PNG — каждая полоса (spriteFrames). expect — задуманные кадры RGBA
 * (Buffer[]) для побайтной сверки. Возвращает { file, format, bytes, width,
 * height, pages, delay, loop, frames: [{ mean, sd, alpha, lag1, levels, maxDiff }], frameCorr }.
 */
export async function checkTileFile(file, { spriteFrames = 1, expect = null } = {}) {
  const meta = await sharp(file, { animated: true }).metadata();
  let pages = meta.pages || 1; const W = meta.width; let H = meta.pageHeight || meta.height;
  const { data } = await sharp(file, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (pages === 1 && spriteFrames > 1 && H % spriteFrames === 0) { pages = spriteFrames; H = H / spriteFrames; }
  const frames = []; const lums = [];
  for (let p = 0; p < pages; p++) {
    const off = p * W * H * 4; const f = frameStats(data, off, W, H); lums.push(f);
    if (expect && expect[p]) { let mx = 0; const e = expect[p]; for (let i = 0; i < e.length; i++) { const d = Math.abs(e[i] - data[off + i]); if (d > mx) mx = d; } f.st.maxDiff = mx; }
    frames.push(f.st);
  }
  const frameCorr = []; for (let p = 1; p < pages; p++) frameCorr.push(corr(lums[p - 1], lums[p]));
  return { file: path.basename(file), format: meta.format, bytes: fs.statSync(file).size, width: W, height: H, pages, delay: meta.delay || null, loop: meta.loop ?? null, frames, frameCorr };
}

/* ---------------- вывод ---------------- */
let fails = 0, warns = 0;
const line = (status, what, details) => { if (status === 'FAIL') fails++; if (status === 'WARN') warns++; console.log(`${status.padEnd(4)} ${what}${details ? ' — ' + details : ''}`); };
const kb1 = (b) => `${Math.round(b / 1024 * 10) / 10} КБ`;

function judge(res, { wantPages, wantDelay, lossless, alphaLost }) {
  const f0 = res.frames[0];
  const probs = [];
  if (wantPages && res.pages !== wantPages) probs.push(`кадров ${res.pages} вместо ${wantPages}`);
  if (wantDelay && res.delay && res.delay.some((d) => Math.abs(d - wantDelay) > 10)) probs.push(`задержки ${res.delay.join('/')} мс вместо ${wantDelay}`);
  const bad = res.frames.map((f, i) => (lossless && f.maxDiff != null && f.maxDiff > 0 ? i : -1)).filter((i) => i >= 0);
  if (bad.length && !alphaLost) probs.push(`кадры ${bad.join(', ')} не совпадают с задуманными (до ${Math.max(...bad.map((i) => res.frames[i].maxDiff))} уровней)`);
  /* испорченный кадр: почти плоский (σ меньше половины медианы кадров) или пустой по альфе */
  const medSd = [...res.frames.map((f) => f.sd)].sort((a, b) => a - b)[Math.floor(res.frames.length / 2)] || 0;
  const flat = res.frames.map((f, i) => ((f.sd != null && f.sd < 0.5 * medSd) || f.sd < 1 || f.alpha === 0 ? i : -1)).filter((i) => i >= 0);
  if (flat.length) probs.push(`кадр ${flat.join(', ')} плоский или пустой (σ ${flat.map((i) => res.frames[i].sd).join('/')}, у остальных ≈ ${medSd})`);
  const same = res.frameCorr.map((c, i) => (c != null && c > 0.2 ? i + 1 : -1)).filter((i) => i >= 0);
  if (same.length) probs.push(`кадр ${same.join(', ')} похож на предыдущий (связь ${same.map((i) => res.frameCorr[i - 1]).join('/')}) — «кипения» не будет`);
  const sds = res.frames.map((f) => f.sd);
  const st = probs.length ? 'FAIL' : alphaLost ? 'WARN' : 'OK';
  const detail = `${res.format} ${res.width}×${res.height}${res.pages > 1 ? ` × ${res.pages} кадров` : ''}${res.delay ? ` по ${[...new Set(res.delay)].join('/')} мс` : ''}, ${kb1(res.bytes)}; σ ${sds.length > 1 ? `${Math.min(...sds)}…${Math.max(...sds)}` : f0.sd}, среднее ${f0.mean}, альфа ${f0.alpha}, lag1 ${f0.lag1}, уровней ${f0.levels}${res.frameCorr.length ? `; связь кадров ${res.frameCorr.join('/')}` : ''}${lossless && !alphaLost && !bad.length && f0.maxDiff != null ? '; все кадры совпали с задуманными' : ''}`;
  line(st, res.file, `${detail}${probs.length ? ' · ' + probs.join('; ') : ''}${alphaLost ? ' · GIF не держит полупрозрачность: для --mode alpha брать PNG или WebP' : ''}`);
  return st;
}

/* ---------------- CLI ---------------- */
const HELP = `grain-tile.mjs — своя шумовая плитка для зерна (детерминированно; чужой файл не переносится)

  node grain-tile.mjs --out папка [--size 256] [--levels 16] [--mode gray|alpha] [--px 1]
                      [--frames 1] [--fps 10 | --frame-ms 100] [--seed 7] [--name имя]
                      [--formats png,sprite,gif,webp] [--json файл]
  node grain-tile.mjs --check файл.png|gif|webp [--frames N | --sprite-frames N] [--frame-ms M] [--json файл]

  --out        папка для файлов (по умолчанию текущая)
  --size       сторона плитки, px (256)
  --levels     уровней яркости 2…256 (16: σ ≈ 78.35, ≈ 32 КБ)
  --mode       gray — непрозрачный серый шум (normal, opacity = σ/78.35); alpha — светлые и тёмные
               зёрна с альфой (GIF полупрозрачность не держит — только PNG/WebP)
  --px         зерно N×N px (lag1 плитки ≈ 1 − 1/N)
  --frames     N независимых кадров: спрайт PNG и анимированные WebP/GIF
  --fps        кадров в секунду GIF/WebP (10 = 100 мс); --frame-ms — то же в мс на кадр
  --seed       зерно генератора (7): тот же seed — побайтно тот же файл
  --name       имя файлов (grain-<mode>-<size>[-pxN])
  --formats    что писать: png, sprite, gif, webp (по умолчанию png; при --frames > 1 ещё sprite, webp, gif)
  --json       записать итог самопроверки
  --check      проверить готовый файл по ВСЕМ кадрам: число кадров (--frames или --sprite-frames для
               спрайта), задержки (--frame-ms/--fps), плоские и повторяющиеся кадры

Вердикты: OK; WARN — формат не держит задуманное (alpha в GIF); FAIL — кадров не столько, кадр
испорчен, плоский или повторяет соседний (код выхода 1).`;
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();

if (isMain) {
  const { opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h'], values: ['out', 'size', 'levels', 'mode', 'px', 'frames', 'fps', 'frame-ms', 'seed', 'name', 'formats', 'json', 'check', 'sprite-frames'] });
  const report = { files: [] };
  if (opt.help || opt.h) {
    console.log(HELP);
    process.exit(0);
  }
  if (opt.check) {
    const f = String(opt.check);
    if (!fs.existsSync(f)) { console.error(`Нет файла ${f}`); process.exit(1); }
    const res = await checkTileFile(f, { spriteFrames: Number(opt['sprite-frames']) || 1 });
    for (let i = 0; i < res.frames.length; i++) { const fr = res.frames[i]; console.log(`     кадр ${i}: среднее ${fr.mean}, σ ${fr.sd}, альфа ${fr.alpha}, lag1 ${fr.lag1}/${fr.lag1v}, уровней ${fr.levels}`); }
    const wantPages = Number(opt['sprite-frames']) || (opt.frames && opt.frames !== true ? Number(opt.frames) : null);
    const wantDelay = opt['frame-ms'] && opt['frame-ms'] !== true ? Number(opt['frame-ms']) : opt.fps && opt.fps !== true ? Math.round(1000 / Number(opt.fps)) : null;
    judge(res, { wantPages, wantDelay });
    report.files.push(res);
  } else {
    const out = path.resolve(String(opt.out || '.')); fs.mkdirSync(out, { recursive: true });
    const size = Math.max(8, Number(opt.size) || 256), levels = Math.max(2, Math.min(256, Number(opt.levels) || 16)), px = Math.max(1, Number(opt.px) || 1);
    const frames = Math.max(1, Number(opt.frames) || 1), mode = opt.mode === 'alpha' ? 'alpha' : 'gray';
    if (opt.mode && !['gray', 'alpha'].includes(String(opt.mode))) { console.error(`Неизвестный --mode ${opt.mode}: gray или alpha`); process.exit(1); }
    const frameMs = Number(opt['frame-ms']) || Math.round(1000 / (Number(opt.fps) || 10));
    const seed = opt.seed != null && opt.seed !== true ? Number(opt.seed) : 7;
    const name = opt.name && opt.name !== true ? String(opt.name) : `grain-${mode}-${size}${px > 1 ? `-px${px}` : ''}`;
    const def = frames > 1 ? (mode === 'alpha' ? 'png,sprite,webp' : 'png,sprite,webp,gif') : 'png';
    const formats = new Set(String(opt.formats && opt.formats !== true ? opt.formats : def).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    const bufs = makeFrames({ size, levels, px, frames, mode, seed });
    const ch = mode === 'alpha' ? 2 : 1;
    const expect = bufs.map((b) => expectedRgba(b, mode));
    const jobs = [];
    if (formats.has('png')) {
      const f = path.join(out, `${name}.png`);
      await sharp(bufs[0], { raw: { width: size, height: size, channels: ch } }).png(pngOpts(mode, levels)).toFile(f);
      jobs.push({ f, expect: [expect[0]], wantPages: 1, lossless: true });
    }
    if (frames > 1 && formats.has('sprite')) {
      const f = path.join(out, `${name}-sprite${frames}.png`);
      await sharp(Buffer.concat(bufs), { raw: { width: size, height: size * frames, channels: ch } }).png(pngOpts(mode, levels)).toFile(f);
      jobs.push({ f, expect, wantPages: frames, spriteFrames: frames, lossless: true });
    }
    if (frames > 1 && (formats.has('gif') || formats.has('webp'))) {
      const inputs = await Promise.all(bufs.map((b) => sharp(b, { raw: { width: size, height: size, channels: ch } }).png().toBuffer()));
      if (formats.has('gif')) {
        const f = path.join(out, `${name}-${frames}f.gif`);
        await sharp(inputs, { join: { animated: true } }).gif({ loop: 0, delay: new Array(frames).fill(frameMs), colours: Math.min(256, Math.max(2, levels)), effort: 10 }).toFile(f);
        jobs.push({ f, expect, wantPages: frames, wantDelay: frameMs, lossless: true, alphaLost: mode === 'alpha' });
      }
      if (formats.has('webp')) {
        const f = path.join(out, `${name}-${frames}f.webp`);
        await sharp(inputs, { join: { animated: true } }).webp({ loop: 0, delay: new Array(frames).fill(frameMs), lossless: true, effort: 6 }).toFile(f);
        jobs.push({ f, expect, wantPages: frames, wantDelay: frameMs, lossless: true });
      }
    }
    if (!jobs.length) { console.error(`Нечего писать: --formats ${[...formats].join(',')} (при одном кадре есть только png)`); process.exit(1); }
    console.log(`плитка ${name}: ${size}×${size}, ${levels} уровней, ${mode === 'alpha' ? 'альфа' : 'серая'}, зерно ${px} px, кадров ${frames}${frames > 1 ? ` по ${frameMs} мс` : ''}, seed ${seed} → ${out}`);
    for (const j of jobs) {
      const res = await checkTileFile(j.f, { spriteFrames: j.spriteFrames || 1, expect: j.expect });
      judge(res, j); report.files.push({ ...res, path: j.f });
    }
    const main = report.files[0]; const tileSd = main && main.frames[0].sd;
    if (tileSd && mode === 'gray') console.log(`\nσ плитки ${tileSd}: opacity слоя = нужная σ на снимке / ${tileSd} (σ 5 → ${r3(5 / tileSd)}), наложение normal — templates/grain.css, --grain-opacity`);
    report.params = { size, levels, px, frames, frameMs: frames > 1 ? frameMs : null, mode, seed, name, tileSd };
  }
  if (opt.json && opt.json !== true) writeJson(String(opt.json), report);
  console.log(`\n${fails ? 'FAIL' : warns ? 'WARN' : 'OK'}: ${fails} провалов, ${warns} предупреждений`);
  if (fails) process.exit(1);
}
