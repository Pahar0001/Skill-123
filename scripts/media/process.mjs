/**
 * Картинки для media.mjs: размер по заголовку файла, превью и лист-контакт,
 * обработка выбранного кадра (sharp) и готовая разметка.
 *
 * Правила обработки:
 *  - .rotate() по EXIF, метаданные (EXIF, GPS, ICC) на сайт не переносятся:
 *    sharp без keepMetadata отдаёт sRGB без метаданных;
 *  - лестница по ДЛИННОЙ стороне, никогда не растягиваем: чего исходник не
 *    даёт, того нет, и об этом говорится прямо;
 *  - одна обработка на весь сайт: --look, --contrast, --grain одинаковые у всех
 *    кадров; зерно в файл не больше 0.06 (сильное — общим слоем CSS).
 */
import fs from 'node:fs';
import path from 'node:path';

/* Роли: лестница по длинной стороне, минимум для пометки small, ширины кадра
   для телефона, sizes и загрузка в разметке. */
export const ROLES = {
  hero: { ladder: [3840, 2560, 1920, 1280], min: 2400, mobile: [1200, 800], sizes: '100vw', eager: true },
  section: { ladder: [2560, 1920, 1280], min: 1600, mobile: [1080, 720], sizes: '100vw', eager: false },
  card: { ladder: [1280, 640], min: 960, mobile: [800, 480], sizes: '(min-width: 900px) 33vw, 100vw', eager: false },
  loop: { ladder: [1920, 1280], min: 1920, mobile: [720], sizes: '100vw', eager: true },
};
export const MAX_GRAIN = 0.06;

export const slugify = (s, max = 48) => String(s || '').toLowerCase()
  .replace(/[а-яё]/g, (ch) => ({ а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }[ch] ?? ''))
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'img';
export const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
export const kb = (b) => `${Math.round((b || 0) / 1024)} КБ`;
export const mb = (b) => `${((b || 0) / 1048576).toFixed(1)}MB`;

/* ---------- размер по заголовку ---------- */

/** Ширина и высота по первым байтам JPEG/PNG/WebP/GIF, без sharp. null — не понял. */
export function headerDims(buf) {
  if (!buf || buf.length < 24) return null;
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const f = b.toString('ascii', 12, 16);
    if (f === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (f === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (f === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2; let orientation = 1;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (m === 0xe1 && b.toString('ascii', i + 4, i + 8) === 'Exif') {
        /* ориентация из EXIF: 5–8 — стороны меняются местами */
        const t = i + 10; const le = b.toString('ascii', t, t + 2) === 'II';
        const r16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o)); const r32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
        try { const ifd = t + r32(t + 4); const n = r16(ifd); for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (r16(e) === 0x0112) orientation = r16(e + 8); } } catch { /* EXIF битый */ }
      }
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
        const h = b.readUInt16BE(i + 5); const w = b.readUInt16BE(i + 7);
        return orientation >= 5 ? { width: h, height: w } : { width: w, height: h };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Размер после поворота по EXIF — по метаданным sharp. */
export async function orientedSize(sharp, input) {
  const m = await sharp(input, { failOn: 'none' }).metadata();
  if (m.autoOrient && m.autoOrient.width) return { width: m.autoOrient.width, height: m.autoOrient.height, format: m.format, meta: m };
  return (m.orientation || 1) >= 5 ? { width: m.height, height: m.width, format: m.format, meta: m } : { width: m.width, height: m.height, format: m.format, meta: m };
}

/* ---------- превью, дубли, лист ---------- */

export async function dhash(sharp, buf) {
  const px = await sharp(buf).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? '1' : '0';
  return bits;
}
export const hamming = (a, b) => { let d = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++; return d; };

/** Превью ≤800 px (JPEG) и отпечаток для поиска дублей. */
export async function makePreview(sharp, buf) {
  const jpeg = await sharp(buf, { failOn: 'none' }).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const st = await sharp(jpeg).stats();
  return { jpeg, hash: await dhash(sharp, jpeg), entropy: +st.entropy.toFixed(2) };
}

/**
 * Плитка 2×2 из кадров ролика (Pexels video_pictures): лица, надписи и чужие
 * телефоны часто появляются не на постере, а в середине ролика.
 */
export async function makeMosaic(sharp, bufs) {
  const list = bufs.slice(0, 4);
  const TW = 400, TH = 225;
  const cols = list.length > 1 ? 2 : 1; const rows = Math.ceil(list.length / cols);
  const layers = [];
  for (const [i, b] of list.entries()) {
    const img = await sharp(b, { failOn: 'none' }).rotate().resize(TW, TH, { fit: 'cover' }).toBuffer();
    layers.push({ input: img, left: (i % cols) * TW, top: Math.floor(i / cols) * TH });
  }
  return sharp({ create: { width: cols * TW, height: rows * TH, channels: 3, background: '#1b1b1b' } }).composite(layers).jpeg({ quality: 85 }).toBuffer();
}

const shortLicense = (s) => String(s || '').replace(/\s*\(.*\)\s*/g, ' ').replace(/Content License|License/gi, '').replace(/\s+/g, ' ').trim().slice(0, 22);

/**
 * Подписи плитки: номер и источник; размер файла, который реально скачается
 * (у видео — длительность и вес этого файла); лицензия; пометки красным.
 */
export function tileLabel(c, kind) {
  const f = c.file || {};
  const dims = f.width && f.height ? `${f.width}x${f.height}${f.unverified ? '?' : ''}` : 'size ?';
  /* оригинал крупнее достижимого файла — видно сразу («1920x1280 из 5184») */
  const oL = Math.max(c.orig?.width || 0, c.orig?.height || 0); const fL = Math.max(f.width || 0, f.height || 0);
  const of = oL && fL && oL > fL + 2 ? ` из ${oL}` : '';
  const l1 = `${String(c.n).padStart(2, '0')}  ${c.source}`;
  const l2 = kind === 'video'
    ? `${c.duration ? Math.round(c.duration) + 's' : '?s'}  ${dims}  ${f.bytes ? mb(f.bytes) : '?MB'}  ${shortLicense(c.license)}`
    : `${dims}${of}  ${shortLicense(c.license)}`;
  return [l1, l2, (c.flags || []).join(' ')];
}

/**
 * Лист-контакт: плитки 320×240, кадр вписан целиком (обрезка прячет
 * композицию), под ним три строки подписи. JPEG, по 20 кадров на лист.
 * cands[i].previewFile — абсолютный путь к превью. Возвращает пути листов.
 */
export async function buildSheets(sharp, cands, dir, { kind = 'photo', perPage = 20, cols = 5 } = {}) {
  const CW = 320, IH = 240, LH = 56, G = 6;
  const files = [];
  for (let p = 0; p * perPage < cands.length; p++) {
    const page = cands.slice(p * perPage, (p + 1) * perPage);
    const rows = Math.ceil(page.length / cols);
    const W = cols * (CW + G) + G, H = rows * (IH + LH + G) + G;
    const layers = [];
    for (const [i, c] of page.entries()) {
      const x = G + (i % cols) * (CW + G), y = G + Math.floor(i / cols) * (IH + LH + G);
      try {
        const img = await sharp(c.previewFile).resize(CW, IH, { fit: 'contain', background: '#1b1b1b' }).toBuffer();
        layers.push({ input: img, left: x, top: y });
      } catch { /* нет превью — пустая плитка с подписью */ }
      const [l1, l2, l3] = tileLabel(c, kind);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${LH}"><rect width="100%" height="100%" fill="#ffffff"/>`
        + `<text x="6" y="16" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#000">${esc(l1)}</text>`
        + `<text x="6" y="33" font-family="Arial, sans-serif" font-size="13" fill="#222">${esc(l2)}</text>`
        + `<text x="6" y="50" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#c00000">${esc(l3)}</text></svg>`;
      layers.push({ input: Buffer.from(svg), left: x, top: y + IH });
    }
    const file = path.join(dir, `sheet-${p + 1}.jpg`);
    await sharp({ create: { width: W, height: H, channels: 3, background: '#e9e9e9' } }).composite(layers).jpeg({ quality: 84, mozjpeg: true }).toFile(file);
    files.push(file);
  }
  return files;
}

/* ---------- тон, контраст, зерно ---------- */

const hexRgb = (h) => { const m = String(h).trim().replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); return m ? m.slice(1).map((x) => parseInt(x, 16)) : null; };

/** --look none | mono | duotone:#тёмный,#светлый. Ошибка — исключение с понятным текстом. */
export function parseLook(s) {
  const v = String(s || 'none').trim();
  if (v === 'none' || v === 'true') return { type: 'none' };
  if (v === 'mono') return { type: 'mono' };
  const m = v.match(/^duotone:(#?[0-9a-f]{6}),(#?[0-9a-f]{6})$/i);
  if (m) return { type: 'duotone', dark: hexRgb(m[1]), light: hexRgb(m[2]), spec: `duotone:${m[1].startsWith('#') ? m[1] : '#' + m[1]},${m[2].startsWith('#') ? m[2] : '#' + m[2]}` };
  throw new Error(`не понял --look «${v}»: none | mono | duotone:#RRGGBB,#RRGGBB`);
}

/** Детерминированный шум: один и тот же файл — одно и то же зерно. */
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function seedOf(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Тон и контраст над сырыми пикселями RGB (на месте). contrast 0..1 → наклон 1..1.5 вокруг середины. */
function toneRaw(data, ch, look, contrast) {
  const a = 1 + 0.5 * Math.max(0, Math.min(1, contrast || 0));
  const needC = a !== 1;
  for (let i = 0; i < data.length; i += ch) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (look.type !== 'none') {
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (look.type === 'mono') { r = g = b = l * 255; }
      else { r = look.dark[0] + (look.light[0] - look.dark[0]) * l; g = look.dark[1] + (look.light[1] - look.dark[1]) * l; b = look.dark[2] + (look.light[2] - look.dark[2]) * l; }
    }
    if (needC) { r = (r - 128) * a + 128; g = (g - 128) * a + 128; b = (b - 128) * a + 128; }
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r; data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
}

/** Зерно: сильнее в полутонах, как у плёнки; amount — доля от 255, не больше MAX_GRAIN. */
function grainRaw(data, width, height, ch, amount, seed) {
  if (!(amount > 0)) return;
  const r = rng(seed); const amp = Math.min(amount, MAX_GRAIN) * 255;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * ch;
    const l = (data[i] + data[i + 1] + data[i + 2]) / 765;
    const w = 0.35 + 0.65 * (1 - (2 * l - 1) ** 2);
    const n = ((r() + r() + r() - 1.5) / 1.5) * amp * w;
    for (let k = 0; k < 3; k++) { const v = data[i + k] + n; data[i + k] = v < 0 ? 0 : v > 255 ? 255 : v; }
  }
}

/**
 * Та же обработка, что у фото (--look, --contrast, --grain), для постера видео
 * или любого кадра. Возвращает сырые пиксели: sharp(data, { raw: info }).
 */
export async function applyLook(sharp, input, { look = 'none', contrast = 0, grain = 0, seedKey = '' } = {}) {
  const lk = parseLook(look); const c = Math.max(0, Math.min(1, Number(contrast) || 0)); const g = Number(grain) || 0;
  if (g > MAX_GRAIN) throw new Error(`--grain ${g}: в файл не больше ${MAX_GRAIN}`);
  const { data, info } = await sharp(input, { failOn: 'none' }).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  if (lk.type !== 'none' || c > 0) toneRaw(data, info.channels, lk, c);
  grainRaw(data, info.width, info.height, info.channels, g, seedOf(seedKey || 'poster'));
  return { data, info: { width: info.width, height: info.height, channels: info.channels } };
}

/* ---------- обработка кадра ---------- */

export function parseRatio(s) {
  if (!s || s === true) return null;
  const m = String(s).match(/^(\d+(?:\.\d+)?)[:/x](\d+(?:\.\d+)?)$/);
  if (!m) throw new Error(`не понял пропорцию «${s}», нужно вида 4:5`);
  return { r: Number(m[1]) / Number(m[2]), spec: `${m[1]}:${m[2]}` };
}

/** --size 1000x700, --thumb 360x360 → { w, h, spec }; ошибка — исключение с понятным текстом. */
export function parseSize(s, flag = '--size') {
  if (!s || s === true) return null;
  const m = String(s).trim().match(/^(\d{1,5})\s*[x×*]\s*(\d{1,5})$/i);
  if (!m || !(Number(m[1]) >= 16 && Number(m[2]) >= 16 && Number(m[1]) <= 10000 && Number(m[2]) <= 10000)) throw new Error(`не понял ${flag} «${s}»: ширина x высота в px, например 1000x700 (от 16 до 10000)`);
  return { w: Number(m[1]), h: Number(m[2]), spec: `${m[1]}x${m[2]}` };
}

/* --focus: куда тянуть обрезку. attention и entropy — стратегии sharp, остальное — сторона кадра */
export const FOCUS = ['attention', 'entropy', 'centre', 'center', 'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'top', 'bottom', 'left', 'right'];
export function focusPosition(sharp, f) {
  const v = String(f || 'attention').toLowerCase();
  if (v === 'attention') return sharp.strategy.attention;
  if (v === 'entropy') return sharp.strategy.entropy;
  if (v === 'center') return 'centre';
  return { top: 'north', bottom: 'south', left: 'west', right: 'east' }[v] || v;
}

/* Форматы точного режима (--size): расширение, качество по умолчанию, кодировщик sharp */
export const EXACT_FORMATS = {
  jpg: { ext: '.jpg', q: 80, enc: (p, q) => p.jpeg({ quality: q, mozjpeg: true, progressive: true }) },
  webp: { ext: '.webp', q: 76, enc: (p, q) => p.webp({ quality: q, effort: 5, smartSubsample: true }) },
  avif: { ext: '.avif', q: 52, enc: (p, q) => p.avif({ quality: q, effort: 3, chromaSubsampling: '4:2:0' }) },
};
export const exactFormat = (s) => ({ jpeg: 'jpg', jpg: 'jpg', webp: 'webp', avif: 'avif' })[String(s || '').toLowerCase().replace(/^\./, '')] || null;

/**
 * Точный режим (pick/import --size): один файл ровно под формат проекта и, по желанию, превью —
 * под заданным именем, без лестницы ширин и без <picture>. Так кладут кадр на место прежнего,
 * на который уже ссылаются база и разметка (Эпицентр: dish-*.jpg 1000×700 q80 и thumb/ 360×360 q76).
 * opts: size {w,h}, thumb {w,h}|null, thumbDir ('thumb'), file (имя с расширением), format (jpg|webp|avif),
 *       quality, focus, dest, srcPrefix, look, contrast, grain, caption, role, seedKey.
 * Обрезка — cover по --focus; не растягивает: исходник меньше формата — наибольший кусок той же
 * пропорции, меньше заданного, и об этом замечание. Превью режется из исходника, не из готового кадра.
 * Превью — качество на 4 ниже основного (jpg 80 → 76).
 */
export async function processExact(sharp, input, opts) {
  const look = parseLook(opts.look);
  const contrast = Math.max(0, Math.min(1, Number(opts.contrast) || 0));
  const grain = Number(opts.grain) || 0;
  if (grain > MAX_GRAIN) throw new Error(`--grain ${grain}: в файл не больше ${MAX_GRAIN}; сильное зерно — одним общим слоем CSS поверх страницы`);
  const F = EXACT_FORMATS[opts.format] || EXACT_FORMATS.jpg;
  const q = Number(opts.quality) || F.q;
  const warnings = []; const changes = []; const files = [];
  const src = await orientedSize(sharp, input);
  const position = focusPosition(sharp, opts.focus);
  const seed = seedOf(opts.seedKey || opts.file);
  fs.mkdirSync(opts.dest, { recursive: true });
  /* кусок w×h (или наибольший той же пропорции, если исходник меньше), тон, зерно, запись */
  const cut = async (want, file, quality, group) => {
    const s = Math.min(1, src.width / want.w, src.height / want.h);
    const w = Math.max(1, Math.floor(want.w * s + 1e-9)), h = Math.max(1, Math.floor(want.h * s + 1e-9));
    if (s < 1) warnings.push(`${group === 'thumb' ? 'превью' : 'кадр'}: исходник ${src.width}x${src.height} меньше ${want.w}x${want.h} — не растягиваем, записано ${w}x${h} той же пропорции (браузер растянет сам: взять кадр крупнее или смириться)`);
    const { data, info } = await sharp(input, { failOn: 'none' }).rotate()
      .resize({ width: w, height: h, fit: 'cover', position, kernel: 'lanczos3' })
      .removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (look.type !== 'none' || contrast > 0) toneRaw(data, info.channels, look, contrast);
    grainRaw(data, info.width, info.height, info.channels, grain, seed + w * 7);
    const f = path.join(opts.dest, file);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    let before = null; try { const st = fs.statSync(f); const m = await sharp(f).metadata(); before = { width: m.width, height: m.height, bytes: st.size }; } catch { /* файла не было */ }
    const r = await F.enc(sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }), quality).toFile(f);
    files.push({ file: file.split(path.sep).join('/'), format: opts.format || 'jpg', width: r.width, height: r.height, bytes: r.size, group, quality, before });
  };
  const focusName = String(opts.focus || 'attention').toLowerCase();
  await cut(opts.size, opts.file, q, 'exact');
  changes.push(`кадрировано до ${opts.size.w}x${opts.size.h} (фокус ${focusName})`);
  if (opts.thumb) {
    const tq = Math.max(1, q - 4);
    await cut(opts.thumb, path.join(opts.thumbDir || 'thumb', opts.file), tq, 'thumb');
    changes.push(`превью ${opts.thumb.w}x${opts.thumb.h}`);
  }
  if (look.type === 'mono') changes.push('переведено в ч/б');
  if (look.type === 'duotone') changes.push(`тонировано (${look.spec})`);
  if (contrast > 0) changes.push(`контраст +${Math.round(contrast * 50)}%`);
  if (grain > 0) changes.push(`добавлено зерно ${grain}`);
  changes.push(`пережато в ${(opts.format || 'jpg').toUpperCase()} q${q}`);
  const main = files[0]; const R = ROLES[opts.role] || ROLES.card;
  const load = R.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  const markup = `<img src="${opts.srcPrefix || ''}${main.file}" width="${main.width}" height="${main.height}" alt="${esc(opts.caption)}" ${load} decoding="async">`;
  return { files, source: { width: src.width, height: src.height, format: src.format }, warnings, changes, markup, avif: opts.format === 'avif' };
}

/**
 * Готовит выбранный кадр для сайта.
 * opts: role, name, dest, srcPrefix, look (строка), contrast 0..1, grain 0..0.06,
 *       cropMobile ('4:5'), ratio ('16:9' — обрезать основной кадр), caption, avif ('auto'|'on'|'off'),
 *       seedKey (для зерна), need (px ширины, нужные сайту: замечание о нехватке — от неё),
 *       focus (куда тянуть обрезку --ratio и --crop-mobile; по умолчанию attention).
 * Возвращает { files, source, warnings, changes, markup, avif, jpegFallback }.
 */
export async function processPhoto(sharp, input, opts) {
  const R = ROLES[opts.role] || ROLES.section;
  const look = parseLook(opts.look);
  const contrast = Math.max(0, Math.min(1, Number(opts.contrast) || 0));
  const grain = Number(opts.grain) || 0;
  if (grain > MAX_GRAIN) throw new Error(`--grain ${grain}: в файл не больше ${MAX_GRAIN}; сильное зерно — одним общим слоем CSS поверх страницы`);
  const warnings = []; const changes = [];
  const src = await orientedSize(sharp, input);
  let W = src.width, H = src.height;
  const main = parseRatio(opts.ratio);
  if (main) {
    const cw = Math.min(W, Math.round(H * main.r)); const chh = Math.round(cw / main.r);
    W = cw; H = Math.min(H, chh);
    changes.push(`кадрировано до ${main.spec}`);
  }
  const L = Math.max(W, H);
  /* --need: ширина, которая нужна сайту (px). Замечание о нехватке — от неё, а не от верха
     лестницы роли (hero 3840 при нужных 1800 давал WARN-шум); больше верха роли — лестница
     начинается с неё. Допуск 2 px — округление копий у источника. */
  const need = Number(opts.need) > 0 ? Number(opts.need) : 0;
  const needLong = need ? Math.ceil(need * L / W) : 0;
  const wantLong = Math.max(R.ladder[0], needLong);
  let steps = R.ladder.filter((s) => s <= L);
  if (need) {
    if (W < need - 2) warnings.push(`исходник даёт только ${W} px в ширину; сайту нужно ${need} (--need) — не растягиваем`);
  } else if (L < R.ladder[0] - 2) warnings.push(`исходник даёт только ${L} px по длинной стороне; для роли ${opts.role} нужно ${R.ladder[0]} — не растягиваем (сайту нужно меньше — --need <px ширины>)`);
  if (L < wantLong || needLong > R.ladder[0]) {
    const t = Math.min(L, wantLong);
    if (!steps.length || t > steps[0] * 1.1) steps.unshift(t);
    else if (t > steps[0]) steps[0] = t;
  }
  if (!steps.length) steps = [L];
  const top = steps[0];
  const bw = Math.round(W * top / L), bh = Math.round(H * top / L);

  /* основа: повёрнута по EXIF, обрезана (если просили), уменьшена до верхней ступени, тон и контраст */
  let base = sharp(input, { failOn: 'none' }).rotate();
  if (main) base = base.resize({ width: bw, height: bh, fit: 'cover', position: focusPosition(sharp, opts.focus), kernel: 'lanczos3' });
  else if (top < L) base = base.resize({ width: bw, height: bh, fit: 'fill', kernel: 'lanczos3' });
  const { data, info } = await base.removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  if (look.type !== 'none' || contrast > 0) toneRaw(data, info.channels, look, contrast);
  const rawIn = { raw: { width: info.width, height: info.height, channels: info.channels } };
  if (top < L) changes.push('уменьшено');
  if (look.type === 'mono') changes.push('переведено в ч/б');
  if (look.type === 'duotone') changes.push(`тонировано (${look.spec})`);
  if (contrast > 0) changes.push(`контраст +${Math.round(contrast * 50)}%`);
  if (grain > 0) changes.push(`добавлено зерно ${grain}`);

  fs.mkdirSync(opts.dest, { recursive: true });
  const name = opts.name;
  const files = [];
  const seed = seedOf(opts.seedKey || name);

  /* пиксели ступени: из основы, с зерном после уменьшения (иначе уменьшение его съест) */
  const stepRaw = async (w, h, crop = null) => {
    let p = sharp(data, rawIn);
    if (crop) p = p.resize({ width: w, height: h, fit: 'cover', position: focusPosition(sharp, opts.focus), kernel: 'lanczos3' });
    else if (w !== info.width || h !== info.height) p = p.resize({ width: w, height: h, fit: 'fill', kernel: 'lanczos3' });
    const out = await p.raw().toBuffer({ resolveWithObject: true });
    grainRaw(out.data, out.info.width, out.info.height, out.info.channels, grain, seed + w * 7 + (crop ? 13 : 0));
    return { buf: out.data, raw: { raw: { width: out.info.width, height: out.info.height, channels: out.info.channels } }, w: out.info.width, h: out.info.height };
  };
  const q = { webp: opts.role === 'hero' ? 74 : 76, avif: 52, jpeg: 80 };
  const write = async (px, fmt, file, group) => {
    const f = path.join(opts.dest, file);
    let p = sharp(px.buf, px.raw);
    if (fmt === 'webp') p = p.webp({ quality: q.webp, effort: 5, smartSubsample: true });
    else if (fmt === 'avif') p = p.avif({ quality: q.avif, effort: 3, chromaSubsampling: '4:2:0' });
    else p = p.jpeg({ quality: q.jpeg, mozjpeg: true, progressive: true });
    const t0 = Date.now();
    const r = await p.toFile(f);
    files.push({ file, format: fmt, width: r.width, height: r.height, bytes: r.size, group, ms: Date.now() - t0 });
  };

  const desk = steps.map((s) => ({ w: Math.round(bw * s / top), h: Math.round(bh * s / top) }));
  const pxCache = new Map();
  for (const d of desk) { const px = await stepRaw(d.w, d.h); pxCache.set(`d${d.w}`, px); await write(px, 'webp', `${name}-${d.w}.webp`, 'desktop'); }

  /* AVIF — только если быстро: по времени самой маленькой ступени прикидываем все */
  let avifOn = opts.avif === 'on';
  if (opts.avif !== 'off' && opts.avif !== 'on') {
    const small = desk[desk.length - 1];
    const t0 = Date.now();
    await write(pxCache.get(`d${small.w}`), 'avif', `${name}-${small.w}.avif`, 'desktop');
    const per = (Date.now() - t0) / (small.w * small.h);
    const predicted = desk.slice(0, -1).reduce((s, d) => s + per * d.w * d.h, 0);
    if (predicted <= 15000) avifOn = 'auto-yes';
    else {
      const f = files.pop(); try { fs.unlinkSync(path.join(opts.dest, f.file)); } catch { /* нет */ }
      warnings.push(`AVIF пропущен: кодирование заняло бы ~${Math.round(predicted / 1000)} с; хватит WebP`);
    }
  }
  if (avifOn) for (const d of desk) if (!files.some((f) => f.file === `${name}-${d.w}.avif`)) await write(pxCache.get(`d${d.w}`), 'avif', `${name}-${d.w}.avif`, 'desktop');

  /* JPEG запасной: одна ступень не больше 1920 по длинной стороне */
  const jd = desk.find((d) => Math.max(d.w, d.h) <= 1920) || desk[desk.length - 1];
  await write(pxCache.get(`d${jd.w}`), 'jpeg', `${name}-${jd.w}.jpg`, 'fallback');

  /* кадр для телефона: отдельная обрезка по пропорции, фокус — «внимание» sharp */
  const mob = parseRatio(opts.cropMobile);
  if (mob) {
    const maxW = Math.floor(Math.min(info.width, info.height * mob.r));
    const widths = [...new Set(R.mobile.map((w) => Math.min(w, maxW)))];
    if (maxW < R.mobile[0]) warnings.push(`кадр для телефона: исходник даёт только ${maxW} px в ширину при ${mob.spec} — не растягиваем`);
    for (const w of widths) {
      const h = Math.round(w / mob.r);
      const px = await stepRaw(w, h, true);
      await write(px, 'webp', `${name}-m-${w}.webp`, 'mobile');
      if (avifOn) await write(px, 'avif', `${name}-m-${w}.avif`, 'mobile');
    }
    changes.push(`кадр для телефона обрезан до ${mob.spec}`);
  }
  changes.push(`пережато в ${[...new Set(files.map((f) => f.format.toUpperCase()))].join('/')}`);

  const markup = pictureMarkup(files, { role: opts.role, prefix: opts.srcPrefix, caption: opts.caption, mobileRatio: mob?.spec });
  return { files, source: { width: src.width, height: src.height, format: src.format }, warnings, changes, markup, avif: !!avifOn };
}

/* ---------- разметка ---------- */

const srcsetOf = (list, prefix) => list.map((f) => `${prefix}${f.file} ${f.width}w`).join(', ');

export function pictureMarkup(files, { role, prefix = 'img/', caption = '', mobileRatio = null }) {
  const R = ROLES[role] || ROLES.section;
  const pick = (group, fmt) => files.filter((f) => f.group === group && f.format === fmt).sort((a, b) => a.width - b.width);
  const lines = ['<picture>'];
  const mobW = pick('mobile', 'webp');
  if (mobW.length) {
    const top = mobW[mobW.length - 1];
    const mA = pick('mobile', 'avif');
    if (mA.length) lines.push(`  <source media="(max-width: 640px)" type="image/avif" srcset="${srcsetOf(mA, prefix)}" sizes="100vw" width="${top.width}" height="${top.height}">`);
    lines.push(`  <source media="(max-width: 640px)" type="image/webp" srcset="${srcsetOf(mobW, prefix)}" sizes="100vw" width="${top.width}" height="${top.height}">`);
  }
  const dA = pick('desktop', 'avif'); const dW = pick('desktop', 'webp');
  if (dA.length) lines.push(`  <source type="image/avif" srcset="${srcsetOf(dA, prefix)}" sizes="${R.sizes}">`);
  lines.push(`  <source type="image/webp" srcset="${srcsetOf(dW, prefix)}" sizes="${R.sizes}">`);
  const fb = files.find((f) => f.group === 'fallback') || dW[dW.length - 1];
  const big = dW[dW.length - 1];
  const load = R.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  lines.push(`  <img src="${prefix}${fb.file}" width="${big.width}" height="${big.height}" alt="${esc(caption)}" ${load} decoding="async">`);
  lines.push('</picture>');
  if (mobileRatio) lines.push(`<!-- телефон (≤640px): кадр ${mobileRatio}; на десктопе — исходная пропорция. Фон первого экрана: object-fit: cover на img. -->`);
  return lines.join('\n');
}

/** CSS вместо впекания (Unsplash отдаётся по их ссылкам, в файл ничего не впечь). */
export function cssLook(lookSpec, contrast, grain, id = 'media-duotone') {
  const look = parseLook(lookSpec); const c = Math.max(0, Math.min(1, Number(contrast) || 0));
  const filters = []; let svg = '';
  if (look.type === 'mono') filters.push('grayscale(1)');
  if (look.type === 'duotone') {
    const t = (k) => `${(look.dark[k] / 255).toFixed(3)} ${(look.light[k] / 255).toFixed(3)}`;
    svg = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${t(0)}"/><feFuncG type="table" tableValues="${t(1)}"/><feFuncB type="table" tableValues="${t(2)}"/></feComponentTransfer></filter></svg>`;
    filters.push(`url(#${id})`);
  }
  if (c > 0) filters.push(`contrast(${(1 + 0.5 * c).toFixed(2)})`);
  const notes = [];
  if (filters.length) notes.push(`CSS: img { filter: ${filters.join(' ')}; }`);
  if (svg) notes.push(`SVG-фильтр один раз на страницу: ${svg}`);
  if (Number(grain) > 0) notes.push('зерно — общим слоем поверх страницы (CSS), не в файле');
  return notes;
}

/**
 * Unsplash: разметка по ссылкам images.unsplash.com (правило API: «must use the
 * hotlinked image URLs»). w, q, fm, fit, crop — параметры из их документации.
 */
export function unsplashMarkup(c, { role, cropMobile, caption, need = 0 }) {
  const R = ROLES[role] || ROLES.section;
  const W = c.orig?.width || 3840, H = c.orig?.height || 2560; const L = Math.max(W, H);
  let steps = R.ladder.filter((s) => s <= L);
  const warnings = [];
  /* --need: замечание — от ширины, нужной сайту, как у processPhoto */
  if (need > 0 ? W < need - 2 : L < R.ladder[0] - 2) warnings.push(need > 0 ? `у оригинала только ${W} px в ширину; сайту нужно ${need} (--need) — не растягиваем` : `у оригинала только ${L} px по длинной стороне — не растягиваем`);
  if (L < R.ladder[0]) { if (!steps.length || L > steps[0] * 1.1) steps.unshift(L); }
  const u = (params) => { const x = new URL(c.raw_url); for (const [k, v] of Object.entries(params)) x.searchParams.set(k, String(v)); return x.href; };
  const desk = steps.map((s) => ({ w: Math.round(W * s / L), h: Math.round(H * s / L) })).sort((a, b) => a.w - b.w);
  const set = (fm) => desk.map((d) => `${esc(u({ w: d.w, q: 75, fm, fit: 'max' }))} ${d.w}w`).join(', ');
  const lines = ['<picture>'];
  const mob = parseRatio(cropMobile);
  if (mob) {
    const maxW = Math.floor(Math.min(W, H * mob.r));
    const ws = [...new Set(R.mobile.map((w) => Math.min(w, maxW)))].sort((a, b) => a - b);
    const mset = (fm) => ws.map((w) => `${esc(u({ w, h: Math.round(w / mob.r), q: 75, fm, fit: 'crop', crop: 'entropy' }))} ${w}w`).join(', ');
    const top = ws[ws.length - 1];
    lines.push(`  <source media="(max-width: 640px)" type="image/webp" srcset="${mset('webp')}" sizes="100vw" width="${top}" height="${Math.round(top / mob.r)}">`);
  }
  lines.push(`  <source type="image/webp" srcset="${set('webp')}" sizes="${R.sizes}">`);
  const mid = desk.find((d) => Math.max(d.w, d.h) >= 1920) || desk[desk.length - 1];
  const big = desk[desk.length - 1];
  const load = R.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  lines.push(`  <img src="${esc(u({ w: mid.w, q: 75, fm: 'jpg', fit: 'max' }))}" srcset="${set('jpg')}" sizes="${R.sizes}" width="${big.w}" height="${big.h}" alt="${esc(caption)}" ${load} decoding="async">`);
  lines.push('</picture>');
  return { markup: lines.join('\n'), warnings, urls: desk.map((d) => u({ w: d.w, q: 75, fm: 'webp', fit: 'max' })) };
}
