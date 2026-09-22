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

export const MANIFEST = 'manifest.json';
export const CREDITS = 'credits.json';

export function readManifest(dir) {
  const f = path.join(dir, MANIFEST);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
export function writeManifest(dir, m) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(m, null, 1));
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
      + ' art? — на снимке чужое произведение (CC0 фото картины ≠ CC0 картины); ai? — не фото; term? — срок охраны произведения; small — файл меньше нужного.');
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
  foodiesfeed: { name: 'Foodiesfeed License (CC0-эквивалент)', url: 'https://www.foodiesfeed.com/license/', attribution: false, note: 'только фото: кадры из /generated/ сделаны нейросетью' },
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

export function readCredits(dest) {
  try { return JSON.parse(fs.readFileSync(path.join(dest, CREDITS), 'utf8')); } catch { return []; }
}
/** Запись заменяет прежнюю с тем же именем файла. */
export function saveCredit(dest, rec) {
  const list = readCredits(dest).filter((x) => x.name !== rec.name);
  list.push(rec);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, CREDITS), JSON.stringify(list, null, 1));
  return list;
}

/** Нужна ли подпись на сайте: обязательно (CC BY/BY-SA), вежливо (стоки, музеи) или не нужна. */
export function creditNeed(rec) {
  if (rec.attribution_required) return 'обязательна';
  if (/^(unsplash|pexels)$/.test(rec.license_code || '') || /unsplash|pexels/.test(rec.source || '')) return 'по желанию (вежливо)';
  if (/^(met|aic|rijks|cleveland|smk|smithsonian)$/.test(rec.source || '')) return 'по желанию (музей просит)';
  return 'не нужна';
}

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function renderCreditsMd(list, { title = 'Фото и видео: авторы и лицензии' } = {}) {
  const lines = [`# ${title}`, '', `Собрано ${new Date().toISOString().slice(0, 10)} скриптом media.mjs (скилл site-rework).`, '',
    '| файл | что на кадре | подпись на сайте | автор | лицензия | источник | подпись на сайте нужна | изменено |',
    '|---|---|---|---|---|---|---|---|'];
  for (const r of list) {
    const lic = r.license_url ? `[${mdCell(r.license)}](${r.license_url})` : mdCell(r.license);
    const src = r.page_url ? `[${mdCell(r.source)}](${r.page_url})` : mdCell(r.source);
    const who = r.author_url && r.author ? `[${mdCell(r.author)}](${r.author_url})` : mdCell(r.author || '—');
    lines.push(`| ${mdCell(r.name)} | ${mdCell(r.seen)} | ${mdCell(r.caption)} | ${who} | ${lic} | ${src} | ${creditNeed(r)} | ${mdCell(r.changes || '—')} |`);
  }
  const must = list.filter((r) => r.attribution_required);
  const polite = list.filter((r) => !r.attribution_required && creditNeed(r) !== 'не нужна');
  lines.push('');
  if (must.length) {
    lines.push('## Обязательная подпись (до выкладки)', '');
    for (const r of must) lines.push(`- ${r.attribution_text}${r.changes ? ` ${r.changes}` : ''}${r.share_alike ? ' Изменённый кадр распространяется на тех же условиях (BY-SA).' : ''}`);
    lines.push('');
  }
  if (polite.length) {
    lines.push('## По желанию (вежливая строка)', '');
    for (const r of polite) lines.push(`- ${r.attribution_text}`);
    lines.push('');
  }
  if (list.some((r) => r.hotlink)) lines.push('Кадры Unsplash на сайте показываются по их ссылкам (images.unsplash.com) — так требуют правила API.', '');
  return lines.join('\n');
}

/** Строка для подвала: только если есть обязательная подпись; иначе null. */
export function footerLine(list) {
  const must = list.filter((r) => r.attribution_required);
  if (!must.length) return null;
  const items = must.map((r) => {
    const who = r.author_url ? `<a href="${esc(r.author_url)}">${esc(r.author)}</a>` : esc(r.author);
    const lic = r.license_url ? `<a href="${esc(r.license_url)}">${esc(r.license)}</a>` : esc(r.license);
    return `${r.title ? `«${esc(r.title)}» — ` : ''}${who}, ${lic}${r.changes ? ` (${esc(r.changes.replace(/^Изменено:\s*/i, 'изменено: ').replace(/\.$/, ''))})` : ''}`;
  });
  return `<p class="credits">Фото и видео: ${items.join('; ')}.</p>`;
}
