/**
 * Превью PNG на фоне сайта и лист-контакт нескольких SVG — чтобы человек и агент посмотрели глазами.
 * Рисует sharp (librsvg): var(--x,#hex) заменяется запасным цветом, currentColor — цветом --color.
 * Это не браузер: окончательная проверка — страница сайта в runtime.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { rasterize, inkShare, hexRgb, parseViewBox } from './svg.mjs';

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
/* подпись читается на любом фоне: тёмный текст на светлом, светлый на тёмном */
const inkFor = (bg) => { const [r, g, b] = hexRgb(bg) || [255, 255, 255]; return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#1b1b1b' : '#f2f2f2'; };

/** Размер рисунка в поле box×box с сохранением пропорций. */
function fitBox(text, box) {
  const vb = parseViewBox((/<svg\b[^>]*\bviewBox="([^"]+)"/.exec(text) || [])[1]);
  if (!vb) return { w: box, h: box, vb: null };
  const k = Math.min(box / vb[2], box / vb[3]);
  return { w: Math.max(1, Math.round(vb[2] * k)), h: Math.max(1, Math.round(vb[3] * k)), vb };
}

/**
 * Один рисунок на фоне. → { file, width, height, ink } (ink — доля пикселей, отличных от фона).
 */
export async function previewPng(sharp, text, outFile, { bg = '#ffffff', width = 480, pad = 24, color = null } = {}) {
  const w = Math.max(16, width - pad * 2);
  const img = await rasterize(sharp, text, { width: w, color: color || inkFor(bg) });
  if (!img) throw new Error('у SVG нет viewBox и размеров — превью не построить');
  const W = w + pad * 2, H = img.height + pad * 2;
  const flat = await sharp({ create: { width: W, height: H, channels: 3, background: bg } })
    .composite([{ input: await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer(), left: pad, top: pad }]).png().toBuffer();
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, flat);
  const raw = await sharp(flat).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { file: outFile, width: W, height: H, ink: inkShare({ data: raw.data, width: raw.info.width, height: raw.info.height }, bg) };
}

/**
 * Лист-контакт: entries [{ text, label }] → сетка ячеек cell×cell с подписями.
 * → { file, count, width, height }
 */
export async function sheetPng(sharp, entries, outFile, { bg = '#ffffff', cols = 4, cell = 220, gap = 14, color = null } = {}) {
  if (!entries.length) throw new Error('лист-контакт: нет ни одного SVG');
  const LABEL = 26; const c = Math.max(1, Math.min(cols, entries.length)); const rows = Math.ceil(entries.length / c);
  const W = c * cell + (c + 1) * gap, H = rows * (cell + LABEL) + (rows + 1) * gap;
  const ink = color || inkFor(bg); const parts = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]; const x = gap + (i % c) * (cell + gap), y = gap + Math.floor(i / c) * (cell + LABEL + gap);
    const fit = fitBox(e.text, cell);
    let img = null; try { img = await rasterize(sharp, e.text, { width: fit.w, color: ink }); } catch { /* битый файл — пустая ячейка с подписью */ }
    if (img) {
      const hh = Math.min(img.height, cell);
      const png = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).extract({ left: 0, top: 0, width: img.width, height: hh }).png().toBuffer();
      parts.push({ input: png, left: x + Math.round((cell - img.width) / 2), top: y + Math.round((cell - hh) / 2) });
    }
    const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${LABEL}"><text x="${cell / 2}" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="${ink}" fill-opacity="${img ? 0.75 : 1}">${esc(String(e.label || '').slice(0, 34))}${img ? '' : ' — не нарисовался'}</text></svg>`;
    parts.push({ input: Buffer.from(label), left: x, top: y + cell + 2 });
  }
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(parts).png().toFile(outFile);
  return { file: outFile, count: entries.length, width: W, height: H };
}
