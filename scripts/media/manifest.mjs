/**
 * Манифест поиска, ворота «посмотрел глазами», белый список лицензий для
 * import и учёт авторов (credits.json, CREDITS.md).
 *
 * Пути в manifest.json — ОТНОСИТЕЛЬНО папки поиска (cand/07.jpg, sheet-1.jpg):
 * папку можно переносить и копировать. В credits.json — только имена файлов:
 * он лежит рядом с картинками сайта и уезжает в репозиторий клиента, личных
 * путей в нём быть не должно.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeJson } from '../lib.mjs';

export const MANIFEST = 'manifest.json';
export const CREDITS = 'credits.json';

export function readManifest(dir) {
  const f = path.join(dir, MANIFEST);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
/* через lib.writeJson: в манифест пишется generator — какой версией media.mjs (и media/*.mjs) собран;
   прежний generator снимается, иначе writeJson сохранил бы его как есть */
export function writeManifest(dir, m) {
  const { generator, ...rest } = m || {};
  writeJson(path.join(dir, MANIFEST), rest);
}

/* ---------- ворота ---------- */

const VOWEL = /[aeiouyаеёиоуыэюя]/i;
/**
 * --seen: что на кадре своими словами. Не меньше трёх РАЗНЫХ слов из букв
 * (от двух букв, с гласной, не одна буква подряд): точки, повторы одного слова,
 * «asdf asdf asdf» и копия подписи не проходят. Это не заменяет взгляд, а
 * оставляет след, что кадр смотрели и с чем сверяли.
 */
export function checkSeen(seen, caption) {
  const s = typeof seen === 'string' ? seen.trim() : '';
  if (!s) return { ok: false, reason: 'нет --seen: откройте превью (Read) и опишите своими словами, что на кадре' };
  const words = (s.toLowerCase().match(/\p{L}+/gu) || []).filter((w) => w.length >= 2 && VOWEL.test(w) && !/^(.)\1+$/u.test(w));
  const distinct = new Set(words);
  if (distinct.size < 3) return { ok: false, reason: `--seen «${s.slice(0, 60)}» — нужно хотя бы три разных слова о том, что на кадре (люди, вывески, валюта, страна, предметы)` };
  if (typeof caption === 'string' && caption.trim() && s.toLowerCase() === caption.trim().toLowerCase()) return { ok: false, reason: '--seen совпадает с --caption: опишите, что ВИДНО на кадре, а не подпись' };
  return { ok: true, words: [...distinct] };
}

export function checkCaption(caption) {
  const c = typeof caption === 'string' ? caption.trim() : '';
  if (!c) return { ok: false, reason: 'нет --caption: подпись или роль кадра на сайте (из неё берётся alt)' };
  if (!(c.match(/\p{L}{2,}/gu) || []).length) return { ok: false, reason: `--caption «${c.slice(0, 40)}» — нужна подпись словами` };
  return { ok: true };
}

/** Итог ворот для pick/import: { ok, code, messages[] }. Код 2 — кадр не взят. */
export function gate({ seen, caption, flags = [], okFlags = false, preview = '' }) {
  const msgs = [];
  const s = checkSeen(seen, caption); if (!s.ok) msgs.push(s.reason);
  const c = checkCaption(caption); if (!c.ok) msgs.push(c.reason);
  if (flags.length && !okFlags) {
    msgs.push(`у кадра пометки: ${flags.join(', ')}. Проверьте именно это глазами${preview ? ` (${preview})` : ''} и повторите с --ok-flags.`
      + ' people? — узнаваемые лица (согласий моделей у стоков нет, ст. 152.1 ГК РФ); brand? — логотипы; text-or-currency? — надписи, цены, чужая валюта;'
      + ' art? — на снимке чужое произведение (CC0 фото картины ≠ CC0 картины); ai? — не фото; term? — срок охраны произведения; small — файл меньше нужного;'
      + ' youtube? — перезалив с YouTube на Commons: права загрузившего никто не проверял, брать в крайнем случае.');
  }
  return { ok: !msgs.length, code: msgs.length ? 2 : 0, messages: msgs };
}

/* ---------- белый список лицензий (import) ---------- */

/*
 * Только то, что проверено в SOURCES.md. CC BY, BY-SA, NC и ND для фото на
 * сайтах клиентов не берём. manual — файл обязательно скачивает человек
 * (автоматика запрещена условиями или сайт закрыт от скриптов).
 */
export const LICENSES = {
  cc0: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false },
  pdm: { name: 'Public Domain Mark 1.0', url: 'https://creativecommons.org/publicdomain/mark/1.0/', attribution: false },
  unsplash: { name: 'Unsplash License', url: 'https://unsplash.com/license', attribution: false, manual: true, note: 'файл скачан человеком на unsplash.com (кадры из API показываются только по их ссылкам — это pick)' },
  pexels: { name: 'Pexels License', url: 'https://www.pexels.com/license/', attribution: false },
  pixabay: { name: 'Pixabay Content License', url: 'https://pixabay.com/service/license-summary/', attribution: false },
  kaboompics: { name: 'Kaboompics License', url: 'https://kaboompics.com/page/license-and-faq', attribution: false, manual: true, note: 'только Standard License: кадры «Editorial Use Only» в рекламу и сайт нельзя' },
  burst: { name: 'Burst (Shopify) License', url: 'https://www.shopify.com/stock-photos/licenses/shopify-some-rights-reserved', attribution: false },
  picjumbo: { name: 'Picjumbo License', url: 'https://picjumbo.com/faq-and-terms/', attribution: false, note: 'у части кадров нет model/property release; премиум вперемешку с бесплатным' },
  foodiesfeed: { name: 'Foodiesfeed License (CC0-эквивалент)', url: 'https://www.foodiesfeed.com/license/', attribution: false, note: 'кадры из /generated/ сделаны нейросетью — можно, но это придуманная еда: в список для владельца' },
  'mixkit-free': { name: 'Mixkit Stock Video Free License', url: 'https://mixkit.co/license/#videoFree', attribution: false, video: true, note: 'только data-license="videoFree"; Restricted — нельзя' },
  'adobe-stock-free': { name: 'Adobe Stock Standard License (бесплатная коллекция)', url: 'https://stock.adobe.com/license-terms', attribution: false, manual: true, note: 'только ручная загрузка после входа; лицензия на одного клиента; файл нельзя раздавать отдельно' },
};
export const LICENSE_ALIASES = { 'cc-zero': 'cc0', 'public-domain': 'pdm', pd: 'pdm', mixkit: 'mixkit-free', adobe: 'adobe-stock-free' };
export function resolveLicense(id) {
  const k = String(id || '').toLowerCase().trim();
  const key = LICENSES[k] ? k : LICENSE_ALIASES[k];
  return key ? { id: key, ...LICENSES[key] } : null;
}

/* ---------- учёт авторов ---------- */

/* Если в папке уже лежит credits.json проекта в своём виде (не массив записей media.mjs — у Эпицентра
   объект «путь → {text, page}», его читает сайт), он не трогается: наш учёт идёт рядом, в credits-media.json. */
export const CREDITS_SIDE = 'credits-media.json';
const readJsonSafe = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };
/** Чей credits.json в папке: { file — куда пишет media.mjs, foreign — credits.json проекта (не наш) или null }. */
export function creditsTarget(dest) {
  const own = path.join(dest, CREDITS);
  const j = fs.existsSync(own) ? readJsonSafe(own) : undefined;
  if (j === undefined || Array.isArray(j)) return { file: own, foreign: null };
  return { file: path.join(dest, CREDITS_SIDE), foreign: own };
}
/** Чужой credits.json проекта как есть (объект) или null. */
export function readForeignCredits(dest) {
  const t = creditsTarget(dest);
  return t.foreign ? readJsonSafe(t.foreign) : null;
}
export function readCredits(dest) {
  const j = readJsonSafe(creditsTarget(dest).file);
  return Array.isArray(j) ? j : [];
}
/** Запись заменяет прежнюю с тем же именем файла. → список; куда записано — creditsTarget(dest).file. */
export function saveCredit(dest, rec) {
  const list = readCredits(dest).filter((x) => x.name !== rec.name);
  list.push(rec);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(creditsTarget(dest).file, JSON.stringify(list, null, 1));
  return list;
}

/**
 * Где этот кадр уже стоит под другим именем: credits.json (наш — по источнику и id или по странице;
 * проекта — по странице) и отметки pick в манифесте поиска. → [{ name, where }].
 * Один кадр Pexels ушёл на «Русскую пирамиду, вечер» и на турнир — Эпицентр, 29.09.
 */
export function usedElsewhere(dest, { source, id, page, name }, manifest = null) {
  const out = []; const seen = new Set();
  const add = (n, where) => { const k = `${n}|${where}`; if (n && n !== name && !seen.has(k)) { seen.add(k); out.push({ name: n, where }); } };
  const samePage = (p) => !!(p && page && normPage(p) === normPage(page));
  for (const r of readCredits(dest)) {
    if ((r.source === source && String(r.source_id) === String(id)) || samePage(r.page_url)) add(r.name, path.basename(creditsTarget(dest).file));
  }
  const foreign = readForeignCredits(dest);
  if (foreign && typeof foreign === 'object') {
    for (const [k, v] of Object.entries(foreign)) if (v && typeof v === 'object' && samePage(v.page || v.page_url)) add(path.basename(k), CREDITS);
  }
  for (const p of (manifest && manifest.picked) || []) {
    if (p.source === source && String(p.id) === String(id)) add(p.name, `pick в ${p.dest || '.'}`);
  }
  return out;
}
/** Адрес страницы кадра без протокола, www, хвостового / и параметров — для сравнения. */
export const normPage = (u) => {
  let s = String(u || '').trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  try { s = decodeURIComponent(s); } catch { /* как есть */ }
  return s.replace(/ /g, '_').toLowerCase();
};

/** Подпись обязательна: CC BY/BY-SA и кадры Unsplash из API (правило API; старые записи без attribution_required — тоже). */
export const mustCredit = (r) => !!r.attribution_required || !!(r.hotlink && /unsplash/.test(r.source || ''));

/** Ссылка на Unsplash для подписи: из записи, иначе с тем же utm, что у ссылки на автора (правило API — utm на обеих). */
export function unsplashLink(r, app = 'site_rework') {
  if (r.unsplash_url) return r.unsplash_url;
  const utm = (String(r.author_url || '').match(/\?utm_[^#]*/) || [''])[0];
  return `https://unsplash.com/${utm || `?utm_source=${String(app).replace(/[^\w-]/g, '_')}&utm_medium=referral`}`;
}

/** Нужна ли подпись на сайте: обязательно (CC BY/BY-SA, Unsplash из API), вежливо (стоки, музеи) или не нужна. */
export function creditNeed(rec) {
  if (mustCredit(rec)) return 'обязательна';
  if (/^(unsplash|pexels|mixkit-free)$/.test(rec.license_code || '') || /unsplash|pexels|mixkit/.test(rec.source || '')) return 'по желанию (вежливо)';
  if (/^(met|aic|rijks|cleveland|smk|smithsonian)$/.test(rec.source || '')) return 'по желанию (музей просит)';
  return 'не нужна';
}

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function renderCreditsMd(list, { title = 'Фото и видео: авторы и лицензии' } = {}) {
  const lines = [`# ${title}`, '', `Собрано ${new Date().toLocaleDateString('sv-SE')} скриптом media.mjs (скилл site-rework).`, '',
    '| файл | что на кадре | подпись на сайте | автор | лицензия | источник | подпись на сайте нужна | изменено |',
    '|---|---|---|---|---|---|---|---|'];
  for (const r of list) {
    const lic = r.license_url ? `[${mdCell(r.license)}](${r.license_url})` : mdCell(r.license);
    const src = r.page_url ? `[${mdCell(r.source)}](${r.page_url})` : mdCell(r.source);
    const who = r.author_url && r.author ? `[${mdCell(r.author)}](${r.author_url})` : mdCell(r.author || '—');
    lines.push(`| ${mdCell(r.name)} | ${mdCell(r.seen)} | ${mdCell(r.caption)} | ${who} | ${lic} | ${src} | ${creditNeed(r)} | ${mdCell(r.changes || '—')} |`);
  }
  const must = list.filter(mustCredit);
  const polite = list.filter((r) => !mustCredit(r) && creditNeed(r) !== 'не нужна');
  lines.push('');
  if (must.length) {
    lines.push('## Обязательная подпись (до выкладки)', '');
    for (const r of must) lines.push(`- ${r.attribution_text}${r.changes && !r.hotlink ? ` ${r.changes}` : ''}${r.share_alike ? ` ${r.kind === 'video' ? 'Изменённый ролик' : 'Изменённый кадр'} распространяется на тех же условиях (BY-SA).` : ''}`);
    lines.push('');
  }
  if (polite.length) {
    lines.push('## По желанию (вежливая строка)', '');
    for (const r of polite) lines.push(`- ${r.attribution_text}`);
    lines.push('');
  }
  if (list.some((r) => r.hotlink)) lines.push('Кадры Unsplash на сайте показываются по их ссылкам (images.unsplash.com) и подписываются: имя автора и «Unsplash» со ссылками (utm) — рядом с кадром (лучше) или в общем блоке подписей; так требуют правила API.', '');
  return lines.join('\n');
}

/** Вежливая строка для подвала (Pexels, Unsplash, музеи) — по желанию; null, если некого благодарить. */
export function politeLine(list) {
  const polite = list.filter((r) => !mustCredit(r) && creditNeed(r) !== 'не нужна');
  if (!polite.length) return null;
  const by = new Map();
  for (const r of polite) {
    const where = /unsplash/.test(r.source) ? 'Unsplash' : /pexels/.test(r.source) ? 'Pexels' : /mixkit/.test(r.source) ? 'Mixkit'
      : ({ met: 'The Metropolitan Museum of Art', aic: 'The Art Institute of Chicago', rijks: 'Rijksmuseum', cleveland: 'The Cleveland Museum of Art', smk: 'SMK', smithsonian: 'Smithsonian' })[r.source] || r.source;
    if (!by.has(where)) by.set(where, new Set());
    if (r.author && !/неизвест|не указан|^mixkit$/i.test(r.author)) by.get(where).add(r.author);
  }
  const parts = [...by].map(([where, who]) => (who.size ? `${[...who].map(esc).join(', ')} / ${esc(where)}` : esc(where)));
  const what = list.some((r) => r.kind === 'video') ? (list.some((r) => r.kind !== 'video') ? 'Фото и видео' : 'Видео') : 'Фото';
  return `<p class="credits">${what}: ${parts.join('; ')}.</p>`;
}

/** Строка для подвала: только если есть обязательная подпись; иначе null. */
export function footerLine(list) {
  const must = list.filter(mustCredit);
  if (!must.length) return null;
  /* CC BY: название, автор, источник (ссылка на страницу), лицензия, что изменено; BY-SA — ещё условие для изменённого */
  const items = must.map((r) => {
    /* Unsplash по API: автор и Unsplash со ссылками (utm) — правило API; лицензию и «изменено» не пишем */
    if (r.hotlink) return `${r.author_url ? `<a href="${esc(r.author_url)}">${esc(r.author)}</a>` : esc(r.author)} / <a href="${esc(unsplashLink(r))}">Unsplash</a>`;
    const who = r.author_url ? `<a href="${esc(r.author_url)}">${esc(r.author)}</a>` : esc(r.author);
    const lic = r.license_url ? `<a href="${esc(r.license_url)}">${esc(r.license)}</a>` : esc(r.license);
    const title = r.title ? (r.page_url ? `«<a href="${esc(r.page_url)}">${esc(r.title)}</a>» — ` : `«${esc(r.title)}» — `) : '';
    const src = !r.title && r.page_url ? `, <a href="${esc(r.page_url)}">источник</a>` : '';
    /* у ролика в подвал — коротко; подробный список изменений остаётся в CREDITS.md */
    const ch = r.kind === 'video' ? 'изменено: вырезан фрагмент, перекодировано' : r.changes ? r.changes.replace(/^Изменено:\s*/i, 'изменено: ').replace(/\.$/, '') : '';
    const sa = r.share_alike ? `изменённ${r.kind === 'video' ? 'ый ролик' : 'ый кадр'} — на тех же условиях, ${lic}` : '';
    const tail = [ch ? esc(ch) : '', sa].filter(Boolean).join('; ');
    return `${title}${who}${src}, ${lic}${tail ? ` (${tail})` : ''}`;
  });
  const what = must.some((r) => r.kind === 'video') ? (must.some((r) => r.kind !== 'video') ? 'Фото и видео' : 'Видео') : 'Фото';
  return `<p class="credits">${what}: ${items.join('; ')}.</p>`;
}
