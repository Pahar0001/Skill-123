/**
 * Видео для media.mjs: поиск роликов, выбор файла под роль, проверка лицензии,
 * петля без шва, постер и разметка. Контракт — MEDIA_API.md:
 *   search(query, opts, ctx)  → { items: Candidate[], status: { источник: { state, message, found } } }
 *   resolve(candidate, opts, ctx) → файл под роль, HEAD, доказательство лицензии
 *   encode(resolved, o, ctx) → { files, poster, markup, changes, warnings, original, cut, budget, checks }
 *
 * Источники по порядку: pexels (ключ) → pixabay (ключ) → commons → mixkit.
 * Coverr, Dareful, Videezy, Vecteezy, Freepik/Magnific сюда не встраиваются:
 * условия запрещают автоматику или требуют подписи, бесплатно отдают 1080p.
 *
 * Что проверено вживую 2026-09-23 и зашито здесь:
 *  - Commons: API с prop=videoinfo отдаёт размер, длительность и производные
 *    (transcoded …1080p.vp9.webm); миниатюры кадров — thumb.wikimedia.org
 *    …/500px-seek%3D<с>-<файл>.jpg; имя файла врёт («3840x2160p» при 1920x1080),
 *    размер берём из API. Лицензия: CC0, PD (без PD-US*), CC BY и BY-SA
 *    (подпись обязательна); перезаливы с YouTube помечаются youtube? и идут последними.
 *  - Mixkit: API нет; одна страница выдачи mixkit.co/free-stock-video/<слово>/
 *    на запрос (как у человека), индексы по карте сайта запрещены условиями.
 *    Файлы на CDN: assets.mixkit.co/videos/<id>/<id>-1080.mp4; индекс (moov) в
 *    конце файла — длительность и размер читаются из хвоста (Range, 256 КБ).
 *    Лицензия проверяется в resolve на странице ролика: data-license="videoFree"
 *    у блока скачивания; Restricted и премиум Envato — отказ.
 *  - Pexels/Pixabay: только через API с ключом; файл выбирается по ширине, а не по
 *    полю quality. У Pixabay CDN повторный быстрый запрос ловит 403 — HEAD не
 *    делаем (размер есть в ответе API), файл качаем одним запросом.
 *  - ffmpeg ходит в сеть сам, мимо DoH: файлы до 150 МБ качаются через net.mjs
 *    целиком в кэш и режутся локально; больше — отрезок по ссылке (-ss/-t),
 *    а при сбое — снова через net.mjs.
 *
 * Сетевые сбои — временные («повторить позже»), никогда не «источник недоступен».
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import * as net from './net.mjs';

/* ---------- константы ---------- */

export const BUDGET = { desktop: 2.5 * 1048576, mobile: 1 * 1048576 };
const DESK = { w: 1920, h: 1080 };
const MOB = { w: 1280, h: 720 };
const VERT_H = 1280;
const WHOLE_MAX = 150 * 1048576;       /* до такого размера файл качается целиком (в кэш) */
const FILE_MAX = 600 * 1048576;        /* больше не качаем вообще */
const DUR_MIN = 5;
export const VIDEO_SOURCES = ['pexels', 'pixabay', 'commons', 'mixkit'];
const NOT_EMBEDDED = {
  coverr: 'Coverr: условия API запрещают коммерческое использование, без API поиск закрыт в robots.txt; только вручную, 1080p',
  dareful: 'Dareful: CC BY 4.0 (подпись обязательна), реально отдаёт 1080p',
  videezy: 'Videezy: обязательная ссылка «Stock Video by Videezy!», по открытой ссылке — облегчённый предпросмотр',
  vecteezy: 'Vecteezy: обязательная подпись, лицензия на одного человека',
  freepik: 'Freepik/Magnific (бывшие Videvo, Mazwai): подпись обязательна, роботы запрещены',
  magnific: 'Freepik/Magnific: подпись обязательна, роботы запрещены',
  videvo: 'Videvo теперь Freepik/Magnific: подпись обязательна, роботы запрещены',
};
const PEOPLE_RE = /\b(woman|women|man|men|girl|girls|boy|boys|couple|people|person|child|children|kid|kids|family|friends|model|portrait|face|faces|barista|chef|worker|waiter|waitress|customer|bride|groom|lady|guy|dancer|athlete)\b/i;

const clean = (h) => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const stripUtm = (u) => String(u || '').replace(/[?&]utm_[^#]*$/, '');
const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
const evenUp = (n) => Math.max(2, Math.ceil(n / 2) * 2);
const mbs = (b) => `${((b || 0) / 1048576).toFixed(2)} МБ`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const today = () => new Date().toISOString().slice(0, 10);
const refuse = (msg) => { throw Object.assign(new Error(msg), { refuse: true }); };

/* ---------- выбор файла ---------- */

/**
 * Какой файл ролика качать под первый экран: самый лёгкий, который закрывает
 * 1920x1080 обрезкой без растяжения и даёт 1280 по высоте для вертикального
 * кадра телефона; если такого нет — самый лёгкий, закрывающий 1920x1080; если и
 * такого нет — самый крупный (с честной пометкой «исходник даёт только…»).
 * Частота до 30 кадров/с предпочтительнее. 4K ради 1080 не берём.
 */
export function chooseVideoFile(files, { w = DESK.w, h = DESK.h, vh = VERT_H } = {}) {
  const ok = (files || []).filter((f) => f && f.url && f.width && f.height);
  if (!ok.length) return (files || []).find((f) => f && f.url) || null;
  const px = (f) => f.width * f.height;
  const sorted = [...ok].sort((a, b) => px(a) - px(b) || (a.rank || 0) - (b.rank || 0) || (a.bytes || 0) - (b.bytes || 0));
  const desk = (f) => f.width >= w && f.height >= h;
  const vert = (f) => Math.min(f.height, Math.floor(f.width * 16 / 9)) >= vh;
  const fpsOk = (f) => !f.fps || f.fps <= 30.5;
  return { ...(sorted.find((f) => desk(f) && vert(f) && fpsOk(f)) || sorted.find((f) => desk(f) && fpsOk(f)) || sorted.find(desk) || sorted[sorted.length - 1]) };
}

/* ---------- MP4: длительность и размер по заголовку ---------- */

/** Длительность и размер кадра из атомов mvhd/tkhd (буфер с атомом moov). */
export function mp4Meta(buf) {
  if (!buf || buf.length < 64) return null;
  const at = buf.indexOf(Buffer.from('moov', 'ascii'));
  if (at < 0) return null;
  const find = (t, from) => buf.indexOf(Buffer.from(t, 'ascii'), from);
  let duration = null; let width = null; let height = null;
  const mv = find('mvhd', at);
  if (mv > 0) {
    const v = buf[mv + 4]; const b = mv + 8;
    try {
      if (v === 1) { const ts = buf.readUInt32BE(b + 16); const d = Number(buf.readBigUInt64BE(b + 20)); if (ts) duration = d / ts; }
      else { const ts = buf.readUInt32BE(b + 8); const d = buf.readUInt32BE(b + 12); if (ts) duration = d / ts; }
    } catch { /* обрезано */ }
  }
  let p = at;
  while ((p = find('tkhd', p + 1)) > 0) {
    try {
      const v = buf[p + 4]; const b = p + 8;
      const m = v === 1 ? b + 48 : b + 36; /* матрица */
      const wOff = m + 36;
      const w = buf.readUInt32BE(wOff) >>> 16; const h = buf.readUInt32BE(wOff + 4) >>> 16;
      if (w > 0 && h > 0) {
        const a = buf.readInt32BE(m); const bb = buf.readInt32BE(m + 4);
        const rotated = a === 0 && Math.abs(bb) === 0x10000;
        width = rotated ? h : w; height = rotated ? w : h; break;
      }
    } catch { break; }
  }
  return duration || width ? { duration: duration ? +duration.toFixed(2) : null, width, height } : null;
}

/** Хвост файла (moov у Mixkit в конце): размер файла из Content-Range, длительность и кадр из moov. */
async function tailMeta(url) {
  const r = await net.request(url, { headers: { range: 'bytes=-262144' }, timeout: 25000, tries: 2, maxBytes: 1048576 });
  if (r.status !== 206 && r.status !== 200) return { status: r.status };
  const total = Number(String(r.headers['content-range'] || '').split('/')[1]) || (r.status === 200 ? r.bytes : null);
  let meta = mp4Meta(r.body);
  if (!meta) {
    const h = await net.request(url, { headers: { range: 'bytes=0-262143' }, timeout: 25000, tries: 2, maxBytes: 1048576 });
    meta = mp4Meta(h.body);
  }
  return { status: r.status, bytes: total, ...(meta || {}) };
}

/* ---------- источники ---------- */

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

async function pexels(q, o) {
  const k = net.key('PEXELS_API_KEY');
  if (!k) return { skip: 'нет PEXELS_API_KEY (бесплатно: pexels.com/api) — главный источник петель' };
  const p = new URLSearchParams({ query: q, per_page: String(Math.min(80, Math.max(15, o.n * 2))), size: 'medium' });
  const orient = { landscape: 'landscape', portrait: 'portrait', square: 'square' }[o.orient];
  if (orient) p.set('orientation', orient);
  const j = await net.getJson(`https://api.pexels.com/v1/videos/search?${p}`, { headers: { authorization: k }, cacheTtl: 3600e3, fresh: o.fresh });
  const items = []; let skipped = 0;
  for (const v of j.videos || []) {
    if (!(v.duration >= DUR_MIN && v.duration <= 60)) { skipped++; continue; }
    const files = (v.video_files || []).filter((f) => f.link && /mp4/i.test(f.file_type || 'mp4'))
      .map((f) => ({ url: f.link, width: f.width, height: f.height, fps: f.fps ? Math.round(f.fps * 100) / 100 : null, bytes: f.size || null, mime: 'video/mp4', how: `pexels-${f.quality || 'file'}-${f.width}x${f.height}` }));
    const file = chooseVideoFile(files);
    if (!file) { skipped++; continue; }
    const big = files.reduce((a, f) => ((f.width || 0) * (f.height || 0) > (a ? a.width * a.height : 0) ? f : a), null);
    const pics = (v.video_pictures || []).map((x) => x.picture).filter(Boolean);
    const frames = pics.length > 4 ? [0.12, 0.38, 0.62, 0.88].map((t) => pics[Math.min(pics.length - 1, Math.floor(t * pics.length))]) : pics;
    const slug = decodeURIComponent(String(v.url || '').replace(/^.*\/video\//, '').replace(/-?\d+\/?$/, '')).replace(/-/g, ' ');
    items.push({
      source: 'pexels', id: String(v.id), title: slug, page_url: v.url, author: v.user?.name || '', author_url: v.user?.url || '',
      license: 'Pexels License', license_code: 'pexels', license_url: 'https://www.pexels.com/license/', attribution_required: false,
      attribution_text: `Видео: ${v.user?.name || 'автор'}, Pexels (${v.url})`,
      duration: v.duration, file, orig: big ? { width: big.width, height: big.height } : { width: v.width, height: v.height },
      preview_url: v.image, frames, text: `${slug} ${(v.tags || []).join(' ')}`,
    });
  }
  /* вес реально скачиваемого файла — по HEAD */
  await pool(items.filter((c) => !c.file.bytes), 3, async (c) => { try { const h = await net.head(c.file.url); if (h.status < 400) c.file.bytes = h.bytes; } catch { /* останется «?» */ } });
  return { items, note: `Pexels: 200 запросов в час${skipped ? `; отброшено по длительности (${DUR_MIN}–60 с) или без mp4: ${skipped}` : ''}` };
}

async function pixabay(q, o) {
  const k = net.key('PIXABAY_API_KEY');
  if (!k) return { skip: 'нет PIXABAY_API_KEY (бесплатно после регистрации: pixabay.com/api/docs)' };
  const p = new URLSearchParams({ key: k, q: q.slice(0, 100), video_type: 'film', per_page: String(Math.max(3, Math.min(200, o.n * 2))), safesearch: 'true', lang: 'en', min_width: '1280' });
  /* правила API: ответы кэшировать 24 ч */
  const j = await net.getJson(`https://pixabay.com/api/videos/?${p}`, { cacheTtl: 24 * 3600e3, fresh: o.fresh });
  const items = [];
  for (const h of j.hits || []) {
    if (!(h.duration >= DUR_MIN)) continue;
    const vs = h.videos || {};
    const files = ['large', 'medium', 'small'].map((kq) => ({ kq, v: vs[kq] })).filter(({ v }) => v && v.url && v.size > 0)
      .map(({ kq, v }) => ({ url: v.url, width: v.width, height: v.height, bytes: v.size, mime: 'video/mp4', how: `pixabay-${kq}-${v.width}x${v.height}` }));
    const file = chooseVideoFile(files);
    if (!file) continue;
    const big = files.reduce((a, f) => (f.width * f.height > (a ? a.width * a.height : 0) ? f : a), null);
    items.push({
      source: 'pixabay', id: String(h.id), title: h.tags || '', page_url: h.pageURL, author: h.user || '', author_url: `https://pixabay.com/users/${h.user}-${h.user_id}/`,
      license: 'Pixabay Content License', license_code: 'pixabay', license_url: 'https://pixabay.com/service/license-summary/', attribution_required: false,
      attribution_text: `Видео: ${h.user}, Pixabay (${h.pageURL})`,
      duration: h.duration, file, orig: big ? { width: big.width, height: big.height } : null,
      preview_url: vs.medium?.thumbnail || vs.large?.thumbnail || vs.small?.thumbnail || (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : null),
      text: h.tags || '',
    });
  }
  return { items, note: 'Pixabay: ответы кэшируются 24 ч; ролики с логотипами для товаров и услуг брать нельзя' };
}

/** Лицензия ролика Commons: CC0, PD (не PD-US*), CC BY / BY-SA; NC, ND и прочее — null. */
export function commonsVideoLicense(md) {
  const short = clean(md.LicenseShortName?.value); const lic = String(md.License?.value || '').toLowerCase();
  const cats = String(md.Categories?.value || ''); const url = stripUtm(md.LicenseUrl?.value || '');
  if (/\bnc\b|non-?commercial|\bnd\b|no ?deriv/i.test(`${short} ${lic}`)) return null;
  if (lic === 'cc0' || /^cc0/i.test(short)) return { code: 'cc0', name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', by: false };
  if (lic === 'pd' || /public domain/i.test(short)) {
    if (/PD[- ]?US|Public domain in the United States|not renewed/i.test(cats)) return null;
    return { code: 'pdm', name: 'Public domain', url: url || 'https://creativecommons.org/publicdomain/mark/1.0/', by: false };
  }
  let m = lic.match(/^cc-by-sa-(\d(?:\.\d)?)/);
  if (m) return { code: 'cc-by-sa', name: `CC BY-SA ${m[1]}`, url: url || `https://creativecommons.org/licenses/by-sa/${m[1]}/`, by: true, sa: true };
  m = lic.match(/^cc-by-(\d(?:\.\d)?)/);
  if (m) return { code: 'cc-by', name: `CC BY ${m[1]}`, url: url || `https://creativecommons.org/licenses/by/${m[1]}/`, by: true };
  return null;
}

async function commons(q, o) {
  net.warnNoContact(o.log);
  const minW = o.role === 'card' ? 1200 : 1900;
  const search = `${q} filetype:video filew:>${minW}`;
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2'
    + `&generator=search&gsrnamespace=6&gsrlimit=${Math.min(50, Math.max(10, o.n * 2))}&gsrsearch=${encodeURIComponent(search)}`
    + '&prop=videoinfo&viprop=url|size|mime|extmetadata|derivatives&viurlwidth=500'
    + '&viextmetadatafilter=LicenseShortName|License|LicenseUrl|Artist|Categories|Credit|ImageDescription|ObjectName|Restrictions';
  const j = await net.getJson(url, { cacheTtl: 6 * 3600e3, fresh: o.fresh });
  const pages = (j.query?.pages || []).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const items = []; let dropped = 0; let short = 0;
  /* кадры из середины Commons делает на лету (2–4 с на кадр, строго по одному): по умолчанию у первых 8 роликов */
  const framesFor = o.frames === 'all' ? Infinity : Number.isFinite(Number(o.frames)) && o.frames !== null && o.frames !== true ? Math.max(0, Number(o.frames)) : 8;
  for (const p of pages) {
    const vi = p.videoinfo?.[0]; if (!vi) continue;
    const md = vi.extmetadata || {};
    const lic = commonsVideoLicense(md);
    if (!lic) { dropped++; continue; }
    if (!(vi.duration >= DUR_MIN)) { short++; continue; }
    const credit = clean(md.Credit?.value); const cats = String(md.Categories?.value || '');
    const youtube = /youtube/i.test(`${credit} ${cats}`);
    const own = /own work/i.test(credit) || /Self-published work/i.test(cats);
    const origUrl = stripUtm(vi.url);
    const files = [{ url: origUrl, width: vi.width, height: vi.height, bytes: vi.size || null, mime: vi.mime, how: 'original', rank: (vi.size || 0) > 60 * 1048576 ? 2 : 0 }];
    for (const d of vi.derivatives || []) {
      if (!d.transcodekey || !/webm/.test(d.type || '') || !/vp9/.test(d.type || '')) continue;
      files.push({ url: stripUtm(d.src), width: d.width, height: d.height, bytes: null, mime: 'video/webm', how: `transcode-${d.transcodekey}`, rank: 1 });
    }
    const file = chooseVideoFile(files);
    const artistHtml = String(md.Artist?.value || '');
    const author = clean(artistHtml.replace(/<a\b[^>]*>([^<]*)<\/a>/gi, '$1')) || 'неизвестен';
    const authorUrl = ((artistHtml.match(/href="([^"]+)"/) || [])[1] || vi.descriptionurl).replace(/^\/\//, 'https://');
    const thumb = stripUtm(vi.thumburl || '');
    const frames = [];
    if (thumb && /\/500px--/.test(thumb) && vi.duration >= 4) for (const t of [0.15, 0.4, 0.65, 0.9]) frames.push(thumb.replace('/500px--', `/500px-seek%3D${Math.floor(vi.duration * t)}-`));
    const title = String(p.title).replace(/^File:/, '');
    const extra = [];
    if (youtube) extra.push('youtube?');
    const restr = String(md.Restrictions?.value || '');
    if (/personality/i.test(restr)) extra.push('people?');
    if (/trademark/i.test(restr)) extra.push('brand?');
    const name = clean(md.ObjectName?.value) || title.replace(/\.[a-z0-9]+$/i, '');
    items.push({
      source: 'commons', id: title, title: name, page_url: vi.descriptionurl, author, author_url: authorUrl,
      license: lic.name, license_code: lic.code, license_url: lic.url, attribution_required: lic.by, ...(lic.sa ? { share_alike: true } : {}),
      attribution_text: lic.by
        ? `«${name}» — ${author}, ${lic.name} (${lic.url}), Wikimedia Commons (${vi.descriptionurl})`
        : `«${name}» — ${author}, ${lic.name}, Wikimedia Commons (${vi.descriptionurl})`,
      duration: +Number(vi.duration).toFixed(2), file, orig: { width: vi.width, height: vi.height },
      preview_url: thumb, frames, text: `${title} ${clean(md.ImageDescription?.value)}`, extraFlags: extra,
      own_work: own, youtube,
      _rank: youtube ? 9 : (lic.by ? 2 : 0) + (own ? 0 : 1),
    });
  }
  items.sort((a, b) => a._rank - b._rank);
  items.forEach((c, i) => { delete c._rank; if (i >= framesFor) c.frames = []; });
  /* вес файла, который скачается: у производных его в API нет — HEAD (строго по одному, очередь net.mjs) */
  for (const c of items.slice(0, o.n)) {
    if (c.file.bytes) continue;
    try { const h = await net.head(c.file.url); if (h.status < 400) c.file.bytes = h.bytes; } catch { /* «?» */ }
  }
  const yt = items.filter((c) => c.youtube).length;
  const notes = [];
  if (dropped) notes.push(`отброшено по лицензии (NC/ND, PD-US, GFDL…): ${dropped}`);
  if (short) notes.push(`короче ${DUR_MIN} с: ${short}`);
  if (yt) notes.push(`перезаливов с YouTube: ${yt} (в конце, пометка youtube?)`);
  if (Number.isFinite(framesFor) && items.length > framesFor) notes.push(`кадры из середины — у первых ${framesFor} (--frames all — у всех, медленно)`);
  notes.push('CC BY/BY-SA — подпись на сайте обязательна');
  return { items, note: notes.join('; ') };
}

/** Одна страница выдачи Mixkit на запрос; файлы — с CDN, лицензия — в resolve. */
async function mixkit(q, o) {
  const slug = q.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) return { items: [], note: 'Mixkit ищет только по-английски' };
  const url = `https://mixkit.co/free-stock-video/${slug}/`;
  const r = await net.getText(url, { headers: { accept: 'text/html' } });
  if (r.status === 404) return { items: [], note: `у Mixkit нет страницы «${slug}» — другое слово (одно-два по-английски)` };
  if (r.status !== 200) throw new net.NetError(r.status === 429 || r.status >= 500 ? `временно: mixkit.co — HTTP ${r.status}; повторить позже` : `mixkit.co: HTTP ${r.status} на странице выдачи`, { status: r.status, host: 'mixkit.co', temporary: r.status === 429 || r.status >= 500 });
  const cards = r.text.split('class="item-grid-card"').slice(1);
  const items = [];
  for (const c of cards) {
    const id = (c.match(/data-item-grid--video-player-item-id-value="(\d+)"/) || [])[1];
    const href = (c.match(/href="(\/free-stock-video\/[^"]+-\d+\/)"/) || [])[1];
    if (!id || !href) continue; /* премиум Envato и прочие карточки без своей страницы */
    const vertical = /item-grid-video-player--vertical/.test(c);
    const title = clean((c.match(/overlay-video-title">([\s\S]*?)<\/span>/) || [])[1]);
    const desc = clean((c.match(/overlay-video-description">([\s\S]*?)<\/span>/) || [])[1]);
    const thumb = (c.match(/<img src="(https:\/\/assets\.mixkit\.co\/[^"]+\.jpg)"/) || [])[1];
    const extra = PEOPLE_RE.test(`${title} ${desc}`) ? ['people?'] : [];
    items.push({
      source: 'mixkit', id, title, page_url: `https://mixkit.co${href}`, author: 'Mixkit', author_url: 'https://mixkit.co/',
      license: 'Mixkit Stock Video Free License (проверка в pick)', license_code: 'mixkit-free', license_url: 'https://mixkit.co/license/#videoFree', attribution_required: false,
      attribution_text: `Видео: Mixkit (https://mixkit.co${href})`,
      duration: null, file: { url: `https://assets.mixkit.co/videos/${id}/${id}-1080.mp4`, width: vertical ? 1080 : 1920, height: vertical ? 1920 : 1080, bytes: null, mime: 'video/mp4', how: 'mixkit-1080', unverified: true },
      orig: null, preview_url: thumb || `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`,
      text: `${title} ${desc}`, extraFlags: extra, needs_resolve: true, vertical,
    });
  }
  /* длительность, размер и вес файла 1080 — из хвоста файла на CDN (одна Range-выборка на ролик) */
  const want = o.orient ? items.filter((c) => (o.orient === 'portrait') === c.vertical) : items;
  await pool(want.slice(0, o.n), 2, async (c) => {
    try {
      const m = await tailMeta(c.file.url);
      if (m.status >= 400) { c.file = { ...c.file, missing: true }; return; }
      if (m.bytes) c.file.bytes = m.bytes;
      if (m.width) { c.file.width = m.width; c.file.height = m.height; c.file.unverified = false; }
      if (m.duration) c.duration = m.duration;
    } catch { /* останется «?» */ }
  });
  const kept = items.filter((c) => !c.file.missing && !(c.duration && c.duration < DUR_MIN));
  return { items: kept, note: `одна страница выдачи (${cards.length} карточек); лицензия каждого ролика проверяется в pick — Restricted отбрасывается` };
}

const SEARCHERS = { pexels, pixabay, commons, mixkit };

export async function search(query, opts, ctx) {
  const log = opts.log || ctx.log || console.log;
  const names = opts.sources && opts.sources.length ? opts.sources : VIDEO_SOURCES;
  for (const s of names) {
    if (NOT_EMBEDDED[s]) throw new Error(`«${s}» не встраивается: ${NOT_EMBEDDED[s]}. Для видео есть: ${VIDEO_SOURCES.join(', ')}`);
    if (!SEARCHERS[s]) throw new Error(`неизвестный источник видео «${s}». Есть: ${VIDEO_SOURCES.join(', ')}`);
  }
  const o = { ...opts, log };
  const items = []; const status = {};
  for (const name of names) {
    try {
      const r = await SEARCHERS[name](query, o);
      if (r.skip) { status[name] = { state: 'skip', message: r.skip }; continue; }
      items.push(...r.items);
      status[name] = { state: 'ok', found: r.items.length, message: `найдено ${r.items.length}${r.note ? ` · ${r.note}` : ''}` };
    } catch (e) {
      const temporary = !(e instanceof net.NetError) || e.temporary;
      status[name] = { state: temporary ? 'temporary' : 'error', message: net.describeError(e) };
    }
  }
  return { items, status };
}

/* ---------- resolve ---------- */

const VIDEO_LICENSES = new Set(['pexels', 'pixabay', 'cc0', 'pdm', 'cc-by', 'cc-by-sa', 'mixkit-free', 'adobe-stock-free']);

async function resolveMixkit(c, opts) {
  const page = c.page_url;
  if (!/^https:\/\/(www\.)?mixkit\.co\/free-stock-video\//.test(page || '')) refuse(`страница Mixkit должна быть вида https://mixkit.co/free-stock-video/<ролик>-<id>/, а не ${page}`);
  const r = await net.getText(page, { headers: { accept: 'text/html' } });
  if (r.status === 404) refuse(`страница ролика не найдена (404): ${page}`);
  if (r.status !== 200) throw new net.NetError(`временно: mixkit.co — HTTP ${r.status}; повторить позже`, { status: r.status, host: 'mixkit.co', temporary: true });
  const html = r.text;
  const at = html.indexOf('data-controller="download--video-options"');
  if (at < 0) refuse('на странице нет бесплатного скачивания (Restricted или премиум Envato) — для коммерческого сайта нельзя');
  const lics = html.slice(Math.max(0, at - 2500), at).match(/data-license="([^"]+)"/g) || [];
  const lic = lics.length ? lics[lics.length - 1].replace(/^data-license="|"$/g, '') : '';
  if (lic !== 'videoFree') refuse(`лицензия ролика «${lic || 'не найдена'}», а не videoFree — Restricted запрещает коммерческие проекты и рекламу`);
  const block = html.slice(at, at + 8000);
  const options = block.split('<label').slice(1).map((l) => ({
    type: (l.match(/type=(\w+)"/) || [])[1], value: ((l.match(/value="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&'),
    mb: Number((l.match(/data-size="([\d.]+)"/) || [])[1]) || null,
    res: (l.match(/download-resolution">\s*(\d+)x(\d+)/) || []).slice(1).map(Number),
  })).filter((x) => x.type && x.value);
  const opt = ['1080p', '2160p', '720p'].map((t) => options.find((x) => x.type === t)).find(Boolean);
  if (!opt) refuse('на странице нет вариантов скачивания 720p/1080p/2160p');
  const warnings = [];
  if (opt.type === '720p') warnings.push('у ролика только 720p — на первый экран мало, исходник даёт только 720 px по высоте');
  const dur = (html.match(/item-attribute-duration-value">\s*(\d+):(\d{2})/) || []).slice(1).map(Number);
  const fps = Number((html.match(/item-attribute-frame_rate-value">\s*([\d.]+)\s*fps/) || [])[1]) || null;
  const id = (opt.value.match(/download\/(\d+)\//) || [])[1] || c.id;
  let url = c.file?.url && /^https:\/\/assets\.mixkit\.co\/.+\.mp4$/.test(c.file.url) && opts.import ? c.file.url : null;
  if (!url && !c.file?.path) {
    /* страница скачивания — как у человека, одна; прямая ссылка из неё */
    try {
      const d = await net.getText(`https://mixkit.co${opt.value}`, { headers: { accept: 'text/html' } });
      url = (d.text.match(/https:\/\/assets\.mixkit\.co\/[^"'\s<>]+\.mp4/) || [])[0] || null;
    } catch { /* ниже — ссылка по образцу CDN */ }
    if (!url) url = `https://assets.mixkit.co/videos/${id}/${id}-${opt.type.replace('p', '')}.mp4`;
  }
  let bytes = null;
  if (url) {
    const h = await net.head(url);
    if (h.status >= 400) refuse(`файл ролика не отдаётся (HTTP ${h.status}): ${url}`);
    bytes = h.bytes;
  }
  return {
    source: 'mixkit', id, url, path: c.file?.path || null, headers: {},
    width: opt.res[0] || null, height: opt.res[1] || null, fps, duration: dur.length ? dur[0] * 60 + dur[1] : c.duration || null,
    bytes: bytes || (opt.mb ? Math.round(opt.mb * 1048576) : null), mime: 'video/mp4', codec: null,
    license: 'Mixkit Stock Video Free License', license_code: 'mixkit-free', license_url: 'https://mixkit.co/license/#videoFree',
    license_evidence: `data-license="videoFree" в блоке скачивания на ${page} (проверено ${today()})`,
    attribution_required: false, attribution_text: `Видео: Mixkit (${page})`, share_alike: false, warnings,
  };
}

export async function resolve(c, opts, ctx) {
  if (c.source === 'mixkit' || /(^|\.)mixkit\.co\//.test(String(c.page_url || '').replace(/^https?:\/\//, ''))) return resolveMixkit(c, opts, ctx);
  if (!VIDEO_LICENSES.has(c.license_code)) refuse(`лицензия «${c.license || c.license_code}» не из белого списка для видео (${[...VIDEO_LICENSES].join(', ')})`);
  const warnings = [];
  const base = {
    source: c.source, id: c.id, headers: {}, license: c.license, license_code: c.license_code, license_url: c.license_url,
    license_evidence: c.source === 'commons' ? `LicenseShortName «${c.license}» на ${c.page_url} (проверено ${today()})` : `${c.license} (${c.license_url}), страница ${c.page_url}`,
    attribution_required: !!c.attribution_required, attribution_text: c.attribution_text || '', share_alike: !!c.share_alike,
    duration: c.duration || null, warnings,
  };
  if (c.youtube) warnings.push('перезалив с YouTube: права загрузившего никто не проверял — брать только если нет другого');
  if (c.file?.path) {
    if (!fs.existsSync(c.file.path)) refuse(`нет файла ${c.file.path}`);
    return { ...base, path: c.file.path, url: null, bytes: fs.statSync(c.file.path).size, width: null, height: null, fps: null, mime: null, codec: null };
  }
  const f = c.file || {};
  if (!f.url) refuse('у ролика нет адреса файла');
  let bytes = f.bytes || null; let type = f.mime || '';
  /* Pixabay CDN: повторный запрос сразу после первого ловит 403 — размер уже есть из API, HEAD не делаем */
  if (c.source !== 'pixabay') {
    const h = await net.head(f.url);
    if (h.status === 404 || h.status === 410) refuse(`файл ролика удалён у источника (HTTP ${h.status}): ${net.redact(f.url)}`);
    if (h.status === 429 || h.status >= 500) throw new net.NetError(`временно: ${new URL(f.url).hostname} — HTTP ${h.status}; повторить позже`, { status: h.status, host: new URL(f.url).hostname });
    if (h.status >= 400) warnings.push(`HEAD ответил ${h.status} — размер узнаем по скачанному файлу`);
    else { bytes = h.bytes || bytes; type = h.type || type; }
    if (type && /^(text|image)\//i.test(type)) refuse(`по адресу не видео (тип ${type})`);
  }
  return { ...base, url: f.url, path: null, bytes, width: f.width || null, height: f.height || null, fps: f.fps || null, mime: type || null, codec: null };
}

/* ---------- ffmpeg ---------- */

function ffmpeg(bin, args, { timeout = 20 * 60e3 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-nostdin', ...args], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 400000) err = err.slice(-200000); });
    p.stdout.resume();
    const t = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, stderr: err }); });
  });
}
const NET_FAIL = /Failed to resolve|getaddrinfo|Name or service not known|No such host|Connection refused|Connection reset|Connection timed out|timed out|Server returned 5\d\d|Server returned 429|Error number -\d+ occurred|I\/O error|End of file/i;
function ffError(r, what, url = '') {
  const lines = r.stderr.split(/\r?\n/).filter((l) => l.trim() && !/^\s*(Input|Output|Stream|Duration|Metadata|  )/.test(l)).slice(-4).join(' | ').slice(0, 400);
  if (url && NET_FAIL.test(r.stderr)) {
    const host = (() => { try { return new URL(url).hostname; } catch { return 'сеть'; } })();
    return new net.NetError(`временно: ${host} — ffmpeg не прочитал ссылку (${lines || 'сеть'}); повторить позже`, { host });
  }
  return new Error(`ffmpeg: ${what} не вышло (код ${r.code}): ${lines}`);
}

/** Длительность, размер кадра, частота, кодек и звук — по выводу ffmpeg -i. */
export function parseProbe(stderr) {
  const d = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const vline = (stderr.split(/\r?\n/).find((l) => /Stream #\d+:\d+.*: Video:/.test(l)) || '');
  const vm = vline.match(/Video: ([\w-]+).*?, (\d{2,5})x(\d{2,5})/);
  const fps = Number((vline.match(/, ([\d.]+) fps/) || vline.match(/, ([\d.]+) tbr/) || [])[1]) || null;
  const rot = Number((stderr.match(/rotation of (-?[\d.]+) degrees/) || stderr.match(/rotate\s*:\s*(-?\d+)/) || [])[1]) || 0;
  let width = vm ? Number(vm[2]) : null; let height = vm ? Number(vm[3]) : null;
  if (Math.abs(Math.round(rot)) % 180 === 90) [width, height] = [height, width];
  return {
    duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null,
    width, height, fps, codec: vm ? vm[1] : null, audio: /Stream #\d+:\d+.*: Audio:/.test(stderr),
  };
}
async function probe(bin, input, isUrl) {
  const args = isUrl ? ['-user_agent', net.userAgent(), '-rw_timeout', '30000000', '-i', input] : ['-i', input];
  const r = await ffmpeg(bin, args, { timeout: 120000 });
  const m = parseProbe(r.stderr);
  if (!m.width) throw ffError(r, 'чтение ролика', isUrl ? input : '');
  return m;
}

function cacheName(dir, resolved, url, suffix = '') {
  const h = crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 10);
  const ext = (String(url).split('?')[0].match(/\.(mp4|webm|ogv|ogg|mov|mkv|m4v)$/i) || [])[1] || 'bin';
  const id = String(resolved.id || 'video').replace(/[^\w.-]+/g, '_').slice(0, 40);
  return path.join(dir, `${resolved.source || 'src'}-${id}-${h}${suffix}.${suffix ? 'mkv' : ext.toLowerCase()}`);
}

/** Скачать файл целиком через net.mjs (DoH, повторы, retry-after) в кэш; проверить сигнатуру. */
async function fetchWhole(url, file, maxBytes) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return { file, cached: true, sha256: null, bytes: fs.statSync(file).size };
  const part = `${file}.part`;
  try {
    const r = await net.download(url, { toFile: part, maxBytes, timeout: 120000 });
    const fd = fs.openSync(part, 'r'); const head = Buffer.alloc(64); fs.readSync(fd, head, 0, 64, 0); fs.closeSync(fd);
    const sig = net.sniff(head);
    if (!['mp4', 'webm', 'ogg'].includes(sig)) throw Object.assign(new Error(`по адресу не видео (сигнатура ${sig || 'неизвестна'})`), { refuse: true });
    fs.renameSync(part, file);
    return { file, cached: false, sha256: r.sha256, bytes: r.bytes };
  } catch (e) { try { fs.unlinkSync(part); } catch { /* нет */ } throw e; }
}

/**
 * Исходник для нарезки: локальный файл (import), файл целиком в кэше (до 150 МБ)
 * или отрезок, вырезанный ffmpeg по ссылке (-ss до -i: качается только нужный кусок).
 * → { input, offset (с какого места в input резать), whole: bool, sha256, bytes, notes }
 */
async function obtainSource(ctx, resolved, start, len) {
  const notes = [];
  if (resolved.path) return { input: resolved.path, offset: start, whole: true, sha256: null, bytes: fs.statSync(resolved.path).size, notes };
  const dir = path.join(ctx.cacheDir, 'video'); fs.mkdirSync(dir, { recursive: true });
  const url = resolved.url;
  const whole = cacheName(dir, resolved, url);
  if (fs.existsSync(whole) && fs.statSync(whole).size > 0) { notes.push('исходник из кэша'); return { input: whole, offset: start, whole: true, sha256: null, bytes: fs.statSync(whole).size, notes }; }
  const small = resolved.bytes && resolved.bytes <= WHOLE_MAX;
  if (small || ['commons', 'pixabay'].includes(resolved.source)) {
    if (resolved.bytes && resolved.bytes > FILE_MAX) refuse(`файл ${mbs(resolved.bytes)} — слишком большой; возьмите другой ролик`);
    const r = await fetchWhole(url, whole, FILE_MAX);
    notes.push(`скачан файл целиком ${mbs(r.bytes)} (кэш)`);
    return { input: whole, offset: start, whole: true, sha256: r.sha256, bytes: r.bytes, notes };
  }
  /* большой файл (4K Mixkit ~150 МБ): отрезок по ссылке, поток без перекодирования */
  const seg = cacheName(dir, resolved, `${url}#${start}+${len}`, `-seg`);
  if (fs.existsSync(seg) && fs.statSync(seg).size > 0) { notes.push('отрезок из кэша'); return { input: seg, offset: 0, whole: false, sha256: null, bytes: resolved.bytes, notes }; }
  const r = await ffmpeg(ctx.ffmpeg, ['-y', '-user_agent', net.userAgent(), '-rw_timeout', '30000000', '-ss', String(start), '-t', String(len), '-i', url, '-map', '0:v:0', '-an', '-c', 'copy', '-avoid_negative_ts', 'make_zero', seg], { timeout: 15 * 60e3 });
  if (r.code === 0 && fs.existsSync(seg) && fs.statSync(seg).size > 0) { notes.push(`вырезан отрезок по ссылке ${mbs(fs.statSync(seg).size)} (весь файл ${mbs(resolved.bytes)} не качался)`); return { input: seg, offset: 0, whole: false, sha256: null, bytes: resolved.bytes, notes }; }
  try { fs.unlinkSync(seg); } catch { /* нет */ }
  /* ffmpeg ходит в сеть мимо DoH: при сбое — тот же файл через net.mjs */
  const e = ffError(r, 'вырезать отрезок', url);
  if (!(e instanceof net.NetError)) throw e;
  if (resolved.bytes && resolved.bytes > FILE_MAX) throw e;
  const w = await fetchWhole(url, whole, FILE_MAX);
  notes.push(`ffmpeg не прочитал ссылку — файл скачан целиком через запасной путь ${mbs(w.bytes)}`);
  return { input: whole, offset: start, whole: true, sha256: w.sha256, bytes: w.bytes, notes };
}

/* ---------- кадры и проверки ---------- */

async function grabFrame(bin, input, t, out) {
  const r = await ffmpeg(bin, ['-y', '-ss', String(Math.max(0, t)), '-i', input, '-frames:v', '1', out], { timeout: 120000 });
  if (r.code !== 0 || !fs.existsSync(out)) throw ffError(r, 'снять кадр');
  return out;
}
async function lastFrame(bin, input, out) {
  const r = await ffmpeg(bin, ['-y', '-sseof', '-0.5', '-i', input, '-update', '1', out], { timeout: 120000 });
  if (r.code !== 0 || !fs.existsSync(out)) throw ffError(r, 'снять последний кадр');
  return out;
}
async function meanDiff(sharp, a, b) {
  const [x, y] = await Promise.all([a, b].map((f) => sharp(f).resize(320, 180, { fit: 'fill' }).removeAlpha().raw().toBuffer()));
  let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return +(s / x.length).toFixed(2);
}

/* ---------- разметка ---------- */

/** CSS для тона видео слоем (в ролик тон не впекаем; постер в <video> тонируется тем же CSS). */
function videoLookCss(ctx, look, contrast, grain, cls) {
  const lk = ctx.parseLook(look); const c = Math.max(0, Math.min(1, Number(contrast) || 0));
  const lines = []; const filters = [];
  if (lk.type !== 'none') filters.push('grayscale(1)');
  if (c > 0) filters.push(`contrast(${(1 + 0.5 * c).toFixed(2)})`);
  if (filters.length) lines.push(`.${cls} { filter: ${filters.join(' ')}; }`);
  if (lk.type === 'duotone') {
    const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    lines.push(`/* дуотон слоями поверх видео (быстрее SVG-фильтра на видео): */`);
    lines.push(`.${cls}-wrap { position: relative; isolation: isolate; }`);
    lines.push(`.${cls}-wrap::before { content: ""; position: absolute; inset: 0; z-index: 1; background: ${hex(lk.light)}; mix-blend-mode: multiply; pointer-events: none; }`);
    lines.push(`.${cls}-wrap::after { content: ""; position: absolute; inset: 0; z-index: 1; background: ${hex(lk.dark)}; mix-blend-mode: lighten; pointer-events: none; }`);
  }
  if (Number(grain) > 0) lines.push('/* зерно — общим слоем поверх страницы, не в ролике */');
  return lines;
}

function videoMarkup({ prefix, desk, webm, mob, vert, poster, cssLines, eager }) {
  const p = (f) => `${prefix}${f}`;
  const data = [mob ? ` data-mobile="${p(mob.file)}"` : '', vert ? ` data-portrait="${p(vert.file)}"` : ''].join('');
  const lines = [
    `<video class="hero-video" autoplay muted loop playsinline preload="${eager ? 'metadata' : 'none'}" poster="${p(poster.webp)}" width="${desk.width}" height="${desk.height}" aria-hidden="true"${data}>`,
    ...(webm ? [`  <source src="${p(webm.file)}" type="video/webm; codecs=vp9">`] : []),
    `  <source src="${p(desk.file)}" type="video/mp4">`,
    '</video>',
    '<script>',
    '/* телефон — лёгкий файл (вертикальный при портретной ориентации); «меньше движения» и экономия трафика — только постер; вне экрана — пауза */',
    '(() => {',
    '  const v = document.currentScript.previousElementSibling;',
    "  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.connection && navigator.connection.saveData);",
    "  if (still) { v.removeAttribute('autoplay'); v.autoplay = false; v.preload = 'none'; v.pause(); return; }",
    "  if (matchMedia('(max-width: 640px)').matches) {",
    "    const src = matchMedia('(orientation: portrait)').matches ? (v.dataset.portrait || v.dataset.mobile) : v.dataset.mobile;",
    "    if (src) { v.querySelectorAll('source').forEach((s) => s.remove()); v.src = src; v.load(); }",
    '  }',
    "  if ('IntersectionObserver' in window) new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()))).observe(v);",
    '})();',
    '</script>',
    '<!-- CSS: .hero-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; } Поверх видео — тёмный градиент для читаемости текста. -->',
  ];
  if (cssLines.length) lines.push(`<!-- тон видео — CSS, не в файле:\n${cssLines.map((l) => `  ${l}`).join('\n')}\n-->`);
  return lines.join('\n');
}

/* ---------- encode ---------- */

const x264 = (crf, fps) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-g', String(Math.round(fps * 2)), '-keyint_min', String(Math.round(fps)), '-movflags', '+faststart', '-tag:v', 'avc1', '-an'];
const vp9 = (crf, fps) => ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-g', String(Math.round(fps * 2)), '-pix_fmt', 'yuv420p', '-an'];

/** Кодировать с бюджетом: если файл тяжелее — CRF +2, не выше crfMax. */
async function encodeBudget(ctx, input, vf, codecArgs, crf0, crfMax, budget, out, fps, what) {
  let crf = crf0; const tries = [];
  for (;;) {
    const r = await ffmpeg(ctx.ffmpeg, ['-y', '-i', input, '-vf', vf, ...codecArgs(crf, fps), out]);
    if (r.code !== 0) throw ffError(r, what);
    const bytes = fs.statSync(out).size; tries.push({ crf, bytes });
    if (!budget || bytes <= budget || crf + 2 > crfMax) return { crf, bytes, tries, ok: !budget || bytes <= budget };
    crf += 2;
  }
}

export async function encode(resolved, o, ctx) {
  if (!ctx.ffmpeg) throw new Error('ffmpeg не найден — видео не пережать (npm i ffmpeg-static --prefix ~/.claude/site-rework)');
  const warnings = [...(resolved.warnings || []).filter(() => false)]; const changes = [];
  const role = o.role || 'loop';
  const eager = role === 'hero' || role === 'loop';
  let dur = o.dur || 8;
  const fade = o.fade ? Math.min(o.fade, dur / 3) : dur >= 4 ? 1 : 0.5;
  let start = o.start ?? null;

  /* что за файл — до скачивания (по ссылке ffmpeg читает только заголовок) */
  const srcMeta0 = resolved.path ? await probe(ctx.ffmpeg, resolved.path, false) : null;
  const D0 = srcMeta0?.duration || resolved.duration || null;
  if (start === null) start = D0 && D0 > dur + fade + 2 ? 1 : 0;
  if (D0 && start + dur + fade > D0) {
    const s2 = Math.max(0, D0 - dur - fade - 0.05);
    if (s2 !== start) { warnings.push(`начало сдвинуто с ${start} до ${s2.toFixed(1)} с: ролик короче`); start = +s2.toFixed(2); }
    if (start + dur + fade > D0) { dur = Math.max(3, +(D0 - fade - 0.1).toFixed(2)); warnings.push(`ролик короткий: петля ${dur} с`); }
  }
  const src = await obtainSource(ctx, resolved, start, dur + fade + 2);
  const meta = await probe(ctx.ffmpeg, src.input, false);
  const off = src.offset;
  if (meta.duration && off + dur + fade > meta.duration + 0.05) {
    dur = Math.max(2, +(meta.duration - off - fade - 0.1).toFixed(2));
    warnings.push(`в отрезке меньше времени, чем нужно: петля ${dur} с`);
  }
  const fps = !meta.fps ? 30 : meta.fps > 30.5 ? (meta.fps > 45 ? meta.fps / 2 : 30) : meta.fps;
  const W = meta.width, H = meta.height;

  /* геометрия: десктоп 16:9 (или --ratio), телефон 1280x720, вертикальный 9:16 (или --crop-mobile); не растягивать */
  const R = o.ratio ? ctx.parseRatio(o.ratio).r : 16 / 9;
  const VR = o.cropMobile ? ctx.parseRatio(o.cropMobile).r : 9 / 16;
  const cropW = Math.min(W, Math.floor(H * R)); const cropH = Math.min(H, Math.floor(cropW / R));
  const outW = even(Math.min(DESK.w, cropW)); const outH = even(outW / R);
  if (outW < DESK.w) warnings.push(`исходник даёт только ${outW}x${outH} для десктопа (нужно ${DESK.w}) — не растягиваем`);
  const vCropH = Math.min(H, Math.floor(W / VR)); const vCropW = Math.min(W, Math.floor(vCropH * VR));
  const vOutH = even(Math.min(VERT_H, vCropH)); const vOutW = even(vOutH * VR);
  if (vOutH < VERT_H) warnings.push(`вертикальный кадр телефона: исходник даёт только ${vOutW}x${vOutH} (нужно ${even(VERT_H * VR)}x${VERT_H}) — не растягиваем`);
  const mW = even(Math.min(MOB.w, outW)); const mH = even(mW / R);
  const needMobile = mW < outW;

  /* мастер-петля в кэше: кадр целиком, уменьшенный только до того, что нужно самым крупным выходам */
  const f = Math.min(1, Math.max(outW / cropW, vOutH / vCropH));
  const MW = Math.min(W, evenUp(W * f)); const MH = Math.min(H, evenUp(H * f));
  const loopDir = path.join(ctx.cacheDir, 'video'); fs.mkdirSync(loopDir, { recursive: true });
  const key = crypto.createHash('sha1').update(`${src.input}|${off}|${dur}|${fade}|${fps}|${MW}x${MH}|v2`).digest('hex').slice(0, 12);
  const master = path.join(loopDir, `loop-${key}.mp4`);
  if (!fs.existsSync(master)) {
    const base = `fps=${fps},scale=${MW}:${MH}:flags=lanczos,setsar=1`;
    const fc = `[0:v]trim=0:${dur + fade},setpts=PTS-STARTPTS,${base},split[a][b];[a]trim=${fade}:${dur + fade},setpts=PTS-STARTPTS[m];[b]trim=0:${fade},setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=${fade}:offset=${dur - fade},format=yuv420p[v]`;
    const r = await ffmpeg(ctx.ffmpeg, ['-y', '-ss', String(off), '-t', String(dur + fade + 0.5), '-i', src.input, '-filter_complex', fc, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', master]);
    if (r.code !== 0) { try { fs.unlinkSync(master); } catch { /* нет */ } throw ffError(r, 'петля (xfade)'); }
  }
  changes.push(`вырезано ${dur} с с ${mmss(start)}`, `петля без шва, наплыв ${fade} с`);
  if (meta.audio) changes.push('звук убран');

  fs.mkdirSync(o.dest, { recursive: true });
  const name = o.name;
  const crop = (cw, ch) => `crop=${Math.min(MW, Math.round(cw * f))}:${Math.min(MH, Math.round(ch * f))}`;
  const deskVf = `${crop(cropW, cropH)},scale=${outW}:${outH}:flags=lanczos,setsar=1`;
  const vertVf = `${crop(vCropW, vCropH)},scale=${vOutW}:${vOutH}:flags=lanczos,setsar=1`;
  const mobVf = `${crop(cropW, cropH)},scale=${mW}:${mH}:flags=lanczos,setsar=1`;
  const deskName = outW === 1920 && outH === 1080 ? `${name}-1080` : `${name}-${outW}x${outH}`;
  const files = []; const budgetNotes = [];
  const add = (file, width, height, format, codec, group, bytes) => files.push({ file, width, height, bytes, format, codec, group });

  const dMp4 = await encodeBudget(ctx, master, deskVf, x264, 26, 32, BUDGET.desktop, path.join(o.dest, `${deskName}.mp4`), fps, 'десктоп H.264');
  add(`${deskName}.mp4`, outW, outH, 'mp4', 'h264', 'desktop', dMp4.bytes);
  const dWebm = await encodeBudget(ctx, master, deskVf, vp9, 36, 42, BUDGET.desktop, path.join(o.dest, `${deskName}.webm`), fps, 'десктоп VP9');
  add(`${deskName}.webm`, outW, outH, 'webm', 'vp9', 'desktop', dWebm.bytes);
  let mob = null;
  if (needMobile) {
    const mName = mW === 1280 && mH === 720 ? `${name}-720` : `${name}-${mW}x${mH}`;
    const mm = await encodeBudget(ctx, master, mobVf, x264, 28, 34, BUDGET.mobile, path.join(o.dest, `${mName}.mp4`), fps, 'телефон H.264');
    add(`${mName}.mp4`, mW, mH, 'mp4', 'h264', 'mobile', mm.bytes); mob = { file: `${mName}.mp4`, r: mm };
  } else warnings.push(`отдельный файл 1280x720 не нужен: десктопный уже ${outW}x${outH}`);
  const vName = `${name}-${vOutW}x${vOutH}`;
  const vv = await encodeBudget(ctx, master, vertVf, x264, 28, 34, BUDGET.mobile, path.join(o.dest, `${vName}.mp4`), fps, 'вертикальный H.264');
  add(`${vName}.mp4`, vOutW, vOutH, 'mp4', 'h264', 'mobile-portrait', vv.bytes);
  const vert = { file: `${vName}.mp4`, r: vv };
  changes.push(`${outW}x${outH} H.264 и VP9`, `телефон ${needMobile ? `${mW}x${mH} и ` : ''}${vOutW}x${vOutH}`);

  for (const [what, r] of [['десктоп mp4', dMp4], ['десктоп webm', dWebm], ...(mob ? [['телефон', mob.r]] : []), ['вертикальный', vert.r]]) {
    if (r.tries.length > 1) budgetNotes.push(`${what}: CRF поднят до ${r.crf} (${r.tries.map((t) => `${t.crf}→${mbs(t.bytes)}`).join(', ')})`);
    if (!r.ok) warnings.push(`${what}: ${mbs(r.bytes)} больше бюджета и при CRF ${r.crf} — укоротите петлю (--dur 6) или возьмите более спокойный ролик`);
  }
  const deskMax = Math.max(dMp4.bytes, dWebm.bytes); const mobMax = Math.max(mob ? mob.r.bytes : 0, vv.bytes);

  /* постер: кадр стыка (первый кадр петли — им же петля и кончается), без тона — тон даёт CSS на <video> */
  const tmp = path.join(loopDir, `poster-${key}.png`);
  await grabFrame(ctx.ffmpeg, path.join(o.dest, `${deskName}.mp4`), 0, tmp);
  const sharp = ctx.sharp;
  const poster = { webp: `${name}-poster.webp`, jpg: `${name}-poster.jpg` };
  const pw = await sharp(tmp).webp({ quality: 78, effort: 5 }).toFile(path.join(o.dest, poster.webp));
  const pj = await sharp(tmp).jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(path.join(o.dest, poster.jpg));
  add(poster.webp, pw.width, pw.height, 'webp', 'webp', 'poster', pw.size);
  add(poster.jpg, pj.width, pj.height, 'jpg', 'jpeg', 'poster', pj.size);
  const looked = (o.look && o.look !== 'none') || Number(o.contrast) > 0 || Number(o.grain) > 0;
  if (looked) {
    const { data, info } = await ctx.applyLook(tmp, { look: o.look, contrast: o.contrast, grain: o.grain, seedKey: `${resolved.source}:${resolved.id}` });
    const lw = await sharp(data, { raw: info }).webp({ quality: 78, effort: 5 }).toFile(path.join(o.dest, `${name}-poster-look.webp`));
    const lj = await sharp(data, { raw: info }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(o.dest, `${name}-poster-look.jpg`));
    add(`${name}-poster-look.webp`, lw.width, lw.height, 'webp', 'webp', 'poster-look', lw.size);
    add(`${name}-poster-look.jpg`, lj.width, lj.height, 'jpg', 'jpeg', 'poster-look', lj.size);
    poster.look = { webp: `${name}-poster-look.webp`, jpg: `${name}-poster-look.jpg` };
    changes.push(`постер ${name}-poster-look тонирован (${[o.look !== 'none' ? o.look : '', Number(o.contrast) > 0 ? `контраст ${o.contrast}` : '', Number(o.grain) > 0 ? `зерно ${o.grain}` : ''].filter(Boolean).join(', ')}) — для статичных мест; в <video> тон даёт CSS`);
  }

  /* проверки: шов петли (первый кадр против последнего и против соседнего) и кадры для глаз */
  const checks = {};
  try {
    const a = path.join(loopDir, `chk-${key}-first.png`); const b = path.join(loopDir, `chk-${key}-last.png`); const n1 = path.join(loopDir, `chk-${key}-next.png`);
    await grabFrame(ctx.ffmpeg, path.join(o.dest, `${deskName}.mp4`), 0, a);
    await lastFrame(ctx.ffmpeg, path.join(o.dest, `${deskName}.mp4`), b);
    await grabFrame(ctx.ffmpeg, path.join(o.dest, `${deskName}.mp4`), 1 / fps, n1);
    const seam = await meanDiff(sharp, a, b); const step = await meanDiff(sharp, a, n1);
    checks.seam = { last_vs_first: seam, next_vs_first: step, ok: seam <= Math.max(3, step * 2.5) };
    if (!checks.seam.ok) warnings.push(`шов петли заметен: разница последнего и первого кадра ${seam} при обычной ${step} между соседними`);
  } catch (e) { warnings.push(`шов не проверен: ${e.message}`); }
  if (o.checkDir) {
    /* четыре кадра петли; четвёртый — середина наплыва: две полупрозрачные копии предмета = камера движется, петля «двоит» */
    try {
      fs.mkdirSync(o.checkDir, { recursive: true });
      const marks = [[0, 'начало петли'], [dur * 0.5, 'середина'], [Math.max(0, dur - fade - 0.2), 'перед наплывом'], [dur - fade / 2, `середина наплыва ${fade} с: двоится?`]];
      const shots = [];
      for (const [i, [t]] of marks.entries()) shots.push(await grabFrame(ctx.ffmpeg, master, t, path.join(loopDir, `chk-${key}-${i}.png`)));
      const TW = 480, TH = Math.round(480 * MH / MW), LH = 24;
      const esc = (x) => String(x).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
      const layers = [];
      for (const [i, s] of shots.entries()) {
        const left = (i % 2) * (TW + 6); const top = Math.floor(i / 2) * (TH + LH + 6);
        layers.push({ input: await sharp(s).resize(TW, TH, { fit: 'fill' }).toBuffer(), left, top });
        const label = `${i + 1}. ${marks[i][1]} (${marks[i][0].toFixed(1)} с)`;
        layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${LH}"><rect width="100%" height="100%" fill="#fff"/><text x="6" y="17" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${i === 3 ? '#c00000' : '#000'}">${esc(label)}</text></svg>`), left, top: top + TH });
      }
      const out = path.join(o.checkDir, `${name}-frames.jpg`);
      await sharp({ create: { width: TW * 2 + 6, height: (TH + LH) * 2 + 6, channels: 3, background: '#e9e9e9' } }).composite(layers).jpeg({ quality: 82 }).toFile(out);
      checks.frames_sheet = out;
      /* справочно: насколько различаются кадры, которые смешивает наплыв (облака — много, и это нормально; решает взгляд) */
      checks.dissolve_ends_diff = await meanDiff(sharp, shots[0], shots[2]);
    } catch (e) { warnings.push(`кадры для проверки не собраны: ${e.message}`); }
  }

  const cssLines = videoLookCss(ctx, o.look || 'none', o.contrast, o.grain, 'hero-video');
  const markup = videoMarkup({ prefix: o.srcPrefix || '', desk: files[0], webm: files[1], mob: mob ? files.find((x) => x.group === 'mobile') : null, vert: files.find((x) => x.group === 'mobile-portrait'), poster, cssLines, eager });
  return {
    files, poster, markup, changes, warnings: [...src.notes.filter((n) => /запасной|не прочитал/.test(n)), ...warnings],
    original: { width: meta.width, height: meta.height, fps: meta.fps, duration: resolved.duration || meta.duration, bytes: src.bytes || resolved.bytes || null, codec: meta.codec, sha256: src.sha256 || null, audio: meta.audio },
    cut: { start, dur, fade, loop: `xfade-${fade}s`, fps: +Number(fps).toFixed(3) },
    budget: { desktop_bytes: deskMax, mobile_bytes: mobMax, desktop_ok: deskMax <= BUDGET.desktop, mobile_ok: mobMax <= BUDGET.mobile, notes: budgetNotes },
    checks, source_notes: src.notes,
  };
}
