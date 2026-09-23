/**
 * Источники фото для media.mjs: профиль photo (заведения, магазины, школы)
 * и профиль art (произведения из общественного достояния).
 *
 * Каждый источник возвращает кандидатов одного вида (см. MEDIA_API.md):
 *   { source, id, title, page_url, author, author_url, license, license_code,
 *     license_url, attribution_required, attribution_text, credit_line,
 *     orig: {width,height}|null, variants: [{url,width,height,bytes?,mime?,heavy?,how}],
 *     template?: {url:'…{w}…', max_w, how}, hdr?: 'aic', preview_url,
 *     hotlink_only?, download_location?, raw_url?, needs_manual?, text, art?, flags:[] }
 *
 * Что проверено вживую 2026-09-23 и зашито здесь:
 *  - Commons: уменьшенные копии берутся с thumb.wikimedia.org (так их отдаёт и
 *    сам API); ширины только стандартные (3840/1920/1280/960/500), нестандартная
 *    — 400; копию шире оригинала Commons РАСТЯГИВАЕТ (3840 из 3264 — проверено),
 *    поэтому ступени берутся строго меньше ширины оригинала, а если ни одна не
 *    дотягивает до роли — сам оригинал (upload.wikimedia.org). 429 у
 *    upload.wikimedia.org бывает от частоты запросов, а не всегда: оригинал
 *    отдаётся и без контакта; на 429 pick берёт следующую копию и пишет об этом.
 *    fileres: — корень из площади кадра.
 *  - Commons «Public domain» бывает «только в США» (PD-US*) — такие отбрасываются.
 *  - Openverse: реальный файл у Flickr 1024 px, хотя в выдаче размер оригинала;
 *    size=large не ставится (режет выдачу и ничего не гарантирует);
 *    StockSnap и Rawpixel исключены (условия запрещают автоматику).
 *  - Met: поиск только /v1.1/search (старый /v1/search отключают 01.10.2026),
 *    объект — /v1/objects/{id}; в адресах картинок бывают пробелы.
 *  - Cleveland: поле credit_line роняет API (500), правильное — creditline.
 *  - AIC: без заголовка AIC-User-Agent — 403; ширина не больше оригинала
 *    (thumbnail.width), иначе 403 «scales in excess of 100%».
 *  - Rijksmuseum: поиск отдаёт и охраняемые работы — брать только с
 *    publicdomain в subject_to; размер из info.json IIIF.
 *  - SMK: IIIF image_iiif_id/full/{w},/0/default.jpg отдаётся (200).
 */
import { getJson, getRange, key, userAgent, warnNoContact, redact, contact, describeError } from './net.mjs';
import { ROLES, headerDims } from './process.mjs';

const YEAR = new Date().getFullYear();
const clean = (h) => String(h ?? '').replace(/<(div|span)[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const long = (w, h) => Math.max(w || 0, h || 0);

/* ---------- размер кадра под роль ---------- */

export const ORIENT = {
  landscape: (w, h) => w / h >= 1.15,
  portrait: (w, h) => h / w >= 1.15,
  square: (w, h) => w / h < 1.15 && h / w < 1.15,
};

/** Длинная сторона, которую роль хочет получить (верх лестницы). */
export const roleTarget = (role) => (ROLES[role] || ROLES.section).ladder[0];

/**
 * Какой файл реально скачается для роли: самый маленький вариант, чья длинная
 * сторона не меньше цели; если такого нет — самый большой (не «тяжёлый», если
 * лёгкий вариант даёт хотя бы 85% цели). Шаблонные источники (w-параметр) —
 * ширина не больше оригинала: никогда не просим копию крупнее исходника.
 */
export function chooseFile(c, role, skip = null) {
  const T = roleTarget(role);
  if (c.template) {
    const o = c.orig;
    let w;
    if (o && o.width && o.height) { const s = Math.min(1, T / long(o.width, o.height)); w = Math.max(1, Math.round(o.width * s)); }
    else w = T;
    if (c.template.max_w) w = Math.min(w, c.template.max_w);
    const h = o && o.width ? Math.round(o.height * w / o.width) : null;
    return { url: c.template.url.replace('{w}', String(w)), width: w, height: h, how: `${c.template.how || 'w'}-${w}`, heavy: false };
  }
  const vs = (c.variants || []).filter((v) => v.url && !(skip && skip.includes(v.url)));
  if (!vs.length) return null;
  const known = vs.filter((v) => v.width && v.height);
  if (!known.length) return { ...vs[0] };
  const byLong = [...known].sort((a, b) => long(a.width, a.height) - long(b.width, b.height));
  const enough = byLong.filter((v) => long(v.width, v.height) >= T);
  const light = byLong.filter((v) => !v.heavy);
  const lightEnough = enough.filter((v) => !v.heavy);
  if (lightEnough.length) return { ...lightEnough[0] };
  const bestLight = light[light.length - 1];
  if (bestLight && long(bestLight.width, bestLight.height) >= 0.85 * T) return { ...bestLight };
  if (enough.length) return { ...enough[0] };
  return { ...byLong[byLong.length - 1] };
}

/* ---------- пометки ---------- */

/* Эвристика по словам — только подсказка: на тесте она не поймала немецкие
   ценники и вывеску FRESH BREAD. Решает взгляд на лист. */
const FLAG_RULES = [
  ['people?', /\b(people|person|persons|man|men|woman|women|girl|girls|boy|boys|child|children|kid|kids|baby|portrait|face|faces|selfie|model|couple|family|crowd|chef|cook|barista|baker|waiter|waitress|customer|customers|student|students|teacher|worker|workers|bride|groom|lady|guy)\b/i],
  ['brand?', /\b(logo|logos|brand|branded|trademark|starbucks|mcdonald'?s|coca[- ]?cola|pepsi|nike|adidas|apple|iphone|ipad|macbook|samsung|ikea|costco|publix|walmart|pizza ?hut|kfc|burger ?king|nestle|heineken|lego|tesla|bmw|mercedes|audi|toyota|nespresso)\b/i],
  ['text-or-currency?', /(\$|€|£|¥|₽|\b(dollars?|usd|euros?|price|prices|price ?tag|menu|sign|signs|signage|neon|poster|posters|banner|newspaper|text|lettering|label|labels|chalkboard|blackboard|receipt|cash|banknotes?|coins?|shop ?window|storefront)\b)/i],
  ['art?', /\b(painting|paintings|artwork|artworks|mural|murals|graffiti|street ?art|sculpture|sculptures|statue|gallery|exhibition|museum|fresco|mosaic|installation|poster art)\b/i],
  ['ai?', /\b(ai[- ]?generated|generated|midjourney|stable ?diffusion|dall[- ]?e|render|rendering|rendered|cgi|3d|illustration|vector|clipart)\b/i],
];

/**
 * Пометки по тексту кадра. То, что прямо попросили в запросе, не помечается
 * (запрос «street art» не метит весь лист как art?). В профиле art пометка art?
 * не ставится: там произведение и есть предмет, а риск — срок охраны (term?).
 */
export function flagsFor(text, query = '', profile = 'photo', extra = []) {
  const out = [];
  for (const [flag, re] of FLAG_RULES) {
    if (profile === 'art' && (flag === 'art?' || flag === 'people?')) continue;
    if (re.test(text || '') && !re.test(query || '')) out.push(flag);
  }
  return [...new Set([...out, ...extra])];
}

/* ---------- срок охраны (профиль art) ---------- */

/**
 * В России срок — жизнь автора + 70 лет (до +74 для участников войны).
 * Надёжно: автор умер не позже YEAR-75. Без года смерти — по году работы:
 * не позже YEAR-170 (кто бы ни был автор, он давно умер); аноним — год работы
 * не позже YEAR-75. Иначе пометка term? — проверить вручную.
 */
export function termCheck({ deathYear = null, workYear = null, anonymous = false } = {}) {
  if (deathYear) return deathYear <= YEAR - 75 ? { ok: true, why: `автор умер в ${deathYear}` } : { ok: false, why: `автор умер в ${deathYear}: срок охраны в РФ (жизнь + 70, до +74) мог не истечь` };
  if (workYear && anonymous && workYear <= YEAR - 75) return { ok: true, why: `анонимная работа ${workYear} г.` };
  if (workYear && workYear <= YEAR - 170) return { ok: true, why: `работа ${workYear} г.` };
  if (workYear) return { ok: false, why: `год смерти автора неизвестен, работа ${workYear} г. — проверить срок охраны` };
  return { ok: false, why: 'год смерти автора и год работы неизвестны — проверить срок охраны' };
}
const maxYear = (s) => { const ys = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/g); return ys ? Math.max(...ys.map(Number)) : null; };

/* ---------- Commons ---------- */

function commonsParts(url) {
  const m = String(url || '').match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)/);
  return m ? { a: m[1], ab: m[2], name: m[3] } : null;
}
/** Уменьшенная копия стандартной ширины — с thumb.wikimedia.org. */
export function commonsThumb(url, w) {
  const p = commonsParts(url); if (!p) return null;
  const tif = /\.tiff?$/i.test(p.name);
  return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${p.a}/${p.ab}/${p.name}/${tif ? `lossy-page1-${w}px-${p.name}.jpg` : `${w}px-${p.name}`}`;
}
const COMMONS_STEPS = [3840, 1920, 1280, 960];

/** Лицензия Commons: CC0; PD — только если это не «PD только в США». */
function commonsLicense(md, mode) {
  const short = clean(md.LicenseShortName?.value);
  const lic = String(md.License?.value || '').toLowerCase();
  const cats = String(md.Categories?.value || '');
  if (/\bnc\b|non-?commercial|\bnd\b|no ?deriv/i.test(short)) return null;
  if (lic === 'cc0' || /^cc0/i.test(short)) return { code: 'cc0', name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
  if (lic === 'pd' || /public domain/i.test(short)) {
    if (/PD[- ]?US|PD-USGov|Public domain in the United States|not renewed/i.test(cats)) return null;
    if (mode === 'art' && !/PD-old|PD-Art|CC-PD-Mark|PD-anon-expired|PD-old-auto/i.test(cats)) return null;
    return { code: 'pdm', name: 'Public domain', url: 'https://creativecommons.org/publicdomain/mark/1.0/' };
  }
  return null; /* CC BY / BY-SA / GFDL — для сайтов клиентов в фото не берём */
}

async function commonsSearch(q, o, mode) {
  warnNoContact(o.log);
  const minLong = o.min || (ROLES[o.role] || ROLES.section).min;
  const parts = [q];
  if (mode === 'unsplash') parts.push('intitle:Unsplash', 'hastemplate:Cc-zero');
  else if (mode === 'quality') parts.push('hastemplate:Cc-zero', 'incategory:Quality_images');
  else if (mode === 'cc0') parts.push('hastemplate:Cc-zero');
  else if (mode === 'art') parts.push('hastemplate:PD-Art');
  parts.push('filetype:bitmap', `fileres:>${Math.round(0.75 * minLong)}`);
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2'
    + `&generator=search&gsrnamespace=6&gsrlimit=${Math.min(50, o.n * 2)}&gsrsearch=${encodeURIComponent(parts.join(' '))}`
    + '&prop=imageinfo&iiprop=url|size|mime|extmetadata'
    + '&iiextmetadatafilter=LicenseShortName|LicenseUrl|License|Artist|AttributionRequired|Restrictions|Categories|ImageDescription|ObjectName|DateTimeOriginal';
  const j = await getJson(url, { cacheTtl: 6 * 3600e3, fresh: o.fresh });
  const pages = (j.query?.pages || []).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const out = []; let dropped = 0;
  for (const p of pages) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const md = ii.extmetadata || {};
    const lic = commonsLicense(md, mode);
    if (!lic || !/jpeg|png|webp|tiff/.test(ii.mime || '')) { dropped++; continue; }
    const origUrl = String(ii.url).split('?')[0];
    const W = ii.width, H = ii.height;
    const variants = COMMONS_STEPS.filter((s) => s < W).map((s) => ({ url: commonsThumb(origUrl, s), width: s, height: Math.round(H * s / W), how: `thumb-${s}` }));
    variants.push({ url: origUrl, width: W, height: H, bytes: ii.size, mime: ii.mime, heavy: /tiff/.test(ii.mime) || ii.size > 40 * 1048576, how: 'original' });
    const title = String(p.title).replace(/^File:/, '');
    const artistHtml = String(md.Artist?.value || '');
    /* «Roman Kraft <a>romankraft</a>» — имя без ника-ссылки; если есть только ссылка — её текст */
    const author = clean(artistHtml.replace(/<a\b[^>]*>[^<]*<\/a>/gi, ' ')) || clean(artistHtml) || 'неизвестен';
    const restr = String(md.Restrictions?.value || '');
    const extra = [];
    if (/personality/i.test(restr)) extra.push('people?');
    if (/trademark/i.test(restr)) extra.push('brand?');
    const c = {
      source: mode === 'unsplash' ? 'commons-unsplash' : mode === 'art' ? 'commons-art' : 'commons',
      id: title, title: title.replace(/\.[a-z0-9]+$/i, ''), page_url: ii.descriptionurl,
      author, author_url: (artistHtml.match(/href="([^"]+)"/) || [])[1]?.replace(/^\/\//, 'https://') || ii.descriptionurl,
      license: lic.name, license_code: lic.code, license_url: lic.url, attribution_required: false,
      attribution_text: `«${title}» — ${author}, ${lic.name}, Wikimedia Commons (${ii.descriptionurl})`,
      orig: { width: W, height: H }, variants,
      preview_url: W > 500 ? commonsThumb(origUrl, 500) : origUrl,
      text: `${title} ${clean(md.ImageDescription?.value)}`, extraFlags: extra,
    };
    if (mode === 'art') {
      c.title = clean(md.ObjectName?.value) || c.title;
      /* автор произведения, год смерти и срок — в enrichArt (описание файла и Wikidata) */
      c._art = { cats: String(md.Categories?.value || ''), artistHtml, dto: String(md.DateTimeOriginal?.value || '') };
    }
    out.push(c);
  }
  const notes = dropped ? [`отброшено по лицензии или формату: ${dropped}`] : [];
  if (mode === 'art') {
    const r = await enrichArt(out, o);
    notes.push(...r.notes);
    return { items: r.items, note: notes.join('; ') };
  }
  return { items: out, note: notes.join('; ') };
}

/* ---------- Commons, профиль art: чьё произведение и когда умер автор ---------- */

/*
 * Категории Commons о сроке охраны:
 *  - PD-old-100 (и «PD-Art (PD-old-100…)») — автор умер больше 100 лет назад: хватает и без года смерти;
 *  - PD-anon-expired — анонимная работа, опубликована больше 70 лет назад;
 *  - PD-old-auto-expired, PD-old-70* и простой PD-old — только «жизнь + 70»: для РФ (до +74 участникам
 *    войны) этого мало, нужен год смерти (параметр deathyear= в описании файла или Wikidata) и termCheck.
 * Фото картины в раме («Photographs of paintings», шаблон Art Photo) и поле Artist со ссылкой на
 * страницу участника — это фотограф, а не автор произведения; его годы и дата съёмки — не про работу.
 */
const PD100_RE = /PD-old-100|PD-Art \(PD-old-100/i;
const ANON_RE = /PD-anon-expired/i;
const PHOTO_OF_ART_RE = /Photographs of (?:paintings|artworks|sculptures|drawings|prints|murals)|Photos of paintings/i;
const BY_LICENSE_RE = /\{\{\s*(?:self\s*\|[^}]*?)?cc-by(?:-sa)?-\d|\{\{\s*(?:self\s*\|[^}]*?)?GFDL/i;
const wdYear = (t) => { const m = String(t || '').match(/^[+]?(\d{3,4})-/); return m ? Number(m[1]) : null; };

/** Разбор описания файла Commons (викитекст): год смерти из шаблона, создатель, Wikidata работы, лицензия фото. */
export function parseArtWikitext(wt) {
  const s = String(wt || '');
  const field = (name) => { const m = s.match(new RegExp(`\\n\\s*\\|\\s*${name}\\s*=([^\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
  const artPhoto = /\{\{\s*Art[ _]Photo\b/i.test(s);
  /* автор работы — только из поля artist шаблона Artwork/Art Photo: {{Creator:…}} бывает и в source (фотограф) */
  const artistField = field('artist');
  const creator = ((artistField.match(/\{\{\s*Creator:\s*([^}|]+?)\s*[}|]/i) || [])[1] || '').trim();
  const artist = creator || (artistField && !/[{}[\]<>]/.test(artistField) ? artistField : '');
  const cats = [...s.matchAll(/\[\[\s*Category:([^\]|]+?)\s*(?:\|[^\]]*)?\]\]/gi)].map((m) => m[1]);
  /* «Paintings of odalisques by Henri Matisse», «André Derain (portrait by Henri Matisse)», «Paintings by X by title»;
     категории снимков («Photographs/Quality images/2019 images by …»), участников и спонсоров — мимо */
  const SHOT = /\b(images?|photographs?|photos?|pictures?|uploads?|files|media|scans?|supported)\b/i;
  const byCat = cats.filter((c) => !SHOT.test(c))
    .map((c) => (c.match(/ by ([^()]+?)\s*\)?\s*$/) || [])[1]).filter(Boolean)
    .map((x) => x.split(/\s+(?:by|in|at|from)\s+/)[0].trim()).filter((x) => x && !/^User:/i.test(x))[0] || '';
  /* кто снимал: «Photographs by X», «Images of paintings by X», поля source/photographer */
  const shotBy = [...cats.filter((c) => SHOT.test(c)).map((c) => (c.match(/ by ([^()]+?)\s*$/) || [])[1]).filter(Boolean),
    ...[field('source'), field('photographer')].map((v) => (v.match(/Creator:\s*([^}|]+)/i) || v.match(/\[\[[^\]|]*\|([^\]]+)\]\]/) || [])[1]).filter(Boolean)]
    .map((x) => x.replace(/^User:/i, '').trim().toLowerCase());
  const photoLicense = artPhoto ? field('photo license') : '';
  return {
    death: maxYear((s.match(/deathyear\s*=\s*(\d{3,4})/i) || [])[1]),
    artist, byCat, artPhoto, shotBy,
    wikidata: ((artPhoto || /\{\{\s*Artwork\b/i.test(s) ? field('wikidata') : '').match(/Q\d+/) || [])[0] || null,
    workYear: artPhoto ? maxYear(field('date')) : null,
    /* фото произведения под CC BY/BY-SA фотографа: в фото-профиле такое не берём */
    photoBy: BY_LICENSE_RE.test(photoLicense) || (BY_LICENSE_RE.test(s) && (artPhoto || /Photographs of/i.test(s))),
  };
}

/** Wikidata: создатель и год создания работ, имена и годы смерти людей. Ошибки сети — пусто (тогда term?). */
async function wikidataFacts(artQs, personQs, o) {
  const api = 'https://www.wikidata.org/w/api.php?format=json&formatversion=2';
  const art = new Map(); const people = new Map();
  const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const ids of chunks([...new Set(artQs)], 40)) {
    const j = await getJson(`${api}&action=wbgetentities&props=claims&ids=${ids.join('|')}`, { cacheTtl: 7 * 24 * 3600e3, fresh: o.fresh });
    for (const [q, e] of Object.entries(j.entities || {})) {
      const p170 = (e.claims?.P170 || []).map((x) => x.mainsnak || {});
      art.set(q, {
        creator: p170.find((s) => s.datavalue?.value?.id)?.datavalue.value.id || null,
        anonymous: p170.length > 0 && p170.every((s) => s.snaktype === 'somevalue' || s.datavalue?.value?.id === 'Q4233718'),
        inception: maxYear((e.claims?.P571 || []).map((x) => wdYear(x.mainsnak?.datavalue?.value?.time)).filter(Boolean).join(' ')),
      });
    }
  }
  const who = [...new Set([...personQs, ...[...art.values()].map((a) => a.creator).filter(Boolean)])].slice(0, 15);
  for (const ids of chunks(who, 40)) {
    const j = await getJson(`${api}&action=wbgetentities&props=labels&languages=ru|en&ids=${ids.join('|')}`, { cacheTtl: 7 * 24 * 3600e3, fresh: o.fresh });
    for (const [q, e] of Object.entries(j.entities || {})) people.set(q, { name: e.labels?.en?.value || e.labels?.ru?.value || '', death: null });
  }
  for (const q of who) {
    const j = await getJson(`${api}&action=wbgetclaims&entity=${q}&property=P570`, { cacheTtl: 7 * 24 * 3600e3, fresh: o.fresh });
    const d = maxYear((j.claims?.P570 || []).map((x) => wdYear(x.mainsnak?.datavalue?.value?.time)).filter(Boolean).join(' '));
    people.set(q, { ...(people.get(q) || { name: '' }), death: d });
  }
  return { art, people };
}

export async function enrichArt(items, o) {
  const notes = [];
  /* описания файлов — пачками по 20 (длина адреса), строго по одному запросу (очередь Wikimedia) */
  const wt = new Map(); let wtFailed = '';
  for (let i = 0; i < items.length; i += 20) {
    const titles = items.slice(i, i + 20).map((c) => `File:${c.id}`).join('|');
    try {
      const j = await getJson('https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=revisions&rvprop=content&rvslots=main'
        + `&titles=${encodeURIComponent(titles)}`, { cacheTtl: 6 * 3600e3, fresh: o.fresh });
      for (const p of j.query?.pages || []) wt.set(String(p.title).replace(/^File:/, ''), p.revisions?.[0]?.slots?.main?.content || '');
    } catch (e) { wtFailed = describeError(e); }
  }
  if (wtFailed) notes.push(`описания части файлов не получены (${wtFailed}) — без года смерти пометка term?`);

  const parsed = new Map(); let photoBy = 0;
  const keep = [];
  for (const c of items) {
    const w = parseArtWikitext(wt.get(c.id));
    if (w.photoBy) { photoBy++; continue; }
    const a = c._art;
    const photoOfArt = w.artPhoto || PHOTO_OF_ART_RE.test(a.cats);
    /* Artist со ссылкой на страницу участника (User:) или тот же человек, что в «Photographs by …»,
       source/photographer — загрузивший/фотограф, не автор работы */
    const shot = [...w.shotBy, ...a.cats.split('|').filter((x) => /\b(images?|photographs?|photos?|pictures?)\b/i.test(x))
      .map((x) => (x.match(/ by ([^()]+?)\s*$/) || [])[1]).filter(Boolean).map((x) => x.replace(/^User:/i, '').trim().toLowerCase())];
    const who = String(c.author || '').toLowerCase();
    const artistShot = who.length > 2 && shot.some((x) => x === who || x.includes(who) || who.includes(x));
    const byUploader = photoOfArt || /\/wiki\/User:/i.test(a.artistHtml) || artistShot;
    parsed.set(c, { w, photoOfArt, byUploader, artistQ: byUploader ? null : (a.artistHtml.match(/wikidata\.org\/wiki\/(Q\d+)/) || [])[1] || null });
    keep.push(c);
  }
  if (photoBy) notes.push(`отброшено фото произведений под CC BY/BY-SA фотографа: ${photoBy}`);

  /* год смерти нужен тем, у кого нет PD-old-100 и годов жизни в поле автора */
  const lifeOf = (html) => html.match(/title="[^"]*\((\d{3,4})\s*[-–]\s*(\d{3,4})\)/) || clean(html).match(/\((?:[^()]*?,\s*)?(\d{3,4})\s*[-–]\s*(\d{3,4})\)/);
  /* Wikidata — тем, у кого нет года смерти, имени автора работы (фото картины) или года работы */
  const need = keep.filter((c) => {
    const p = parsed.get(c);
    const noDeath = !p.w.death && !(p.byUploader ? null : lifeOf(c._art.artistHtml));
    const noName = !p.w.artist && (p.byUploader || !p.w.byCat);
    const noYear = p.photoOfArt && !p.w.workYear;
    return (noDeath || noName || noYear) && (p.w.wikidata || p.artistQ);
  });
  let wd = { art: new Map(), people: new Map() };
  if (need.length) {
    try { wd = await wikidataFacts(need.map((c) => parsed.get(c).w.wikidata).filter(Boolean), need.map((c) => parsed.get(c).artistQ).filter(Boolean), o); }
    catch (e) { notes.push(`Wikidata не ответила (${describeError(e)}) — без года смерти пометка term?`); }
  }

  for (const c of keep) {
    const { w, photoOfArt, byUploader, artistQ } = parsed.get(c); const a = c._art;
    const life = byUploader ? null : lifeOf(a.artistHtml);
    const wa = w.wikidata ? wd.art.get(w.wikidata) : null;
    const creatorQ = (wa && wa.creator) || artistQ;
    const person = creatorQ ? wd.people.get(creatorQ) : null;
    const death = maxYear((life || [])[2]) || w.death || person?.death || null;
    const name = w.artist || person?.name || w.byCat || (byUploader ? '' : c.author !== 'неизвестен' ? c.author : '');
    const dtoYear = maxYear((a.dto.match(/\+(\d{4})-/) || [])[1] || clean(a.dto));
    /* дата съёмки фото картины — не год работы */
    const work = wa?.inception || w.workYear || (photoOfArt ? null : dtoYear);
    let term;
    if (death) term = termCheck({ deathYear: death, workYear: work });
    else if (PD100_RE.test(a.cats)) term = { ok: true, why: 'Commons: автор умер больше 100 лет назад (PD-old-100)' };
    else if (ANON_RE.test(a.cats) && !(work && work > YEAR - 75)) term = { ok: true, why: 'Commons: анонимная работа, срок охраны истёк (PD-anon-expired)' };
    else if (wa?.anonymous && work) term = termCheck({ workYear: work, anonymous: true });
    else term = termCheck({ workYear: work });
    if (!name && !term.ok) term = { ok: false, why: `автор произведения не установлен; ${term.why}` };
    const photographer = byUploader ? c.author : null;
    c.author = name || 'автор не установлен';
    if (byUploader) c.author_url = creatorQ ? `https://www.wikidata.org/wiki/${creatorQ}` : c.page_url;
    c.art = { death_year: death, work_year: work, term, ...(photographer ? { photographer } : {}) };
    c.credit_line = `${c.author}. ${c.title}${work && !String(c.title).includes(String(work)) ? `, ${work}` : ''}. ${photographer ? `Фото: ${photographer}, ` : ''}Wikimedia Commons`;
    c.attribution_text = `«${c.title}» — ${c.author}${photographer ? ` (фото: ${photographer})` : ''}, ${c.license}, Wikimedia Commons (${c.page_url})`;
    delete c._art;
  }
  return { items: keep, notes };
}

/* ---------- стоки с ключом ---------- */

async function unsplash(q, o) {
  const k = key('UNSPLASH_ACCESS_KEY');
  if (!k) return { skip: 'нет UNSPLASH_ACCESS_KEY (бесплатно: unsplash.com/oauth/applications)' };
  const app = (key('UNSPLASH_APP_NAME') || 'site_rework').replace(/[^\w-]/g, '_');
  const utm = `utm_source=${app}&utm_medium=referral`;
  const p = new URLSearchParams({ query: q, per_page: String(Math.min(30, o.n)), content_filter: 'high' });
  const orient = { landscape: 'landscape', portrait: 'portrait', square: 'squarish' }[o.orient];
  if (orient) p.set('orientation', orient);
  const j = await getJson(`https://api.unsplash.com/search/photos?${p}`, { headers: { authorization: `Client-ID ${k}`, 'accept-version': 'v1' }, cacheTtl: 3600e3, fresh: o.fresh });
  const all = j.results || [];
  /* Unsplash+ — платная лицензия; с 2025 фото-выдача включает иллюстрации — их тоже вон */
  const free = all.filter((r) => !r.premium && !r.plus && !/plus\.unsplash\.com/.test(r.urls?.raw || '') && (!r.asset_type || r.asset_type === 'photo'));
  return {
    items: free.map((r) => ({
      source: 'unsplash', id: r.id, title: r.alt_description || r.description || '', page_url: `${r.links?.html}?${utm}`,
      author: r.user?.name || '', author_url: `${r.user?.links?.html}?${utm}`,
      license: 'Unsplash License', license_code: 'unsplash', license_url: 'https://unsplash.com/license', attribution_required: false,
      attribution_text: `Photo by ${r.user?.name} on Unsplash (${r.links?.html})`,
      orig: { width: r.width, height: r.height },
      template: { url: `${r.urls.raw}&w={w}&q=80&fm=jpg&fit=max`, max_w: r.width, how: 'unsplash' },
      raw_url: r.urls.raw, hotlink_only: true, download_location: r.links?.download_location,
      preview_url: r.urls.small, text: `${r.alt_description || ''} ${r.description || ''} ${(r.tags || []).map((t) => t.title).join(' ')}`,
    })),
    note: `по правилам API кадры показываются по ссылкам images.unsplash.com; отсеяно Unsplash+ и иллюстраций: ${all.length - free.length}`,
  };
}

async function pexels(q, o) {
  const k = key('PEXELS_API_KEY');
  if (!k) return { skip: 'нет PEXELS_API_KEY (бесплатно: pexels.com/api)' };
  const p = new URLSearchParams({ query: q, per_page: String(Math.min(80, o.n)) });
  const orient = { landscape: 'landscape', portrait: 'portrait', square: 'square' }[o.orient];
  if (orient) p.set('orientation', orient);
  /* size=medium — от 12 Мп (≈4200x2800): на 3840 по длинной стороне хватает;
     large (24 Мп) без нужды режет выдачу. Для остальных ролей фильтра нет — пометка small. */
  if (o.role === 'hero') p.set('size', 'medium');
  const j = await getJson(`https://api.pexels.com/v1/search?${p}`, { headers: { authorization: k }, cacheTtl: 3600e3, fresh: o.fresh });
  return {
    items: (j.photos || []).map((r) => ({
      source: 'pexels', id: String(r.id), title: r.alt || '', page_url: r.url, author: r.photographer || '', author_url: r.photographer_url || '',
      license: 'Pexels License', license_code: 'pexels', license_url: 'https://www.pexels.com/license/', attribution_required: false,
      attribution_text: `Фото: ${r.photographer}, Pexels (${r.url})`,
      orig: { width: r.width, height: r.height },
      template: { url: `${r.src.original}?auto=compress&cs=tinysrgb&w={w}`, max_w: r.width, how: 'pexels' },
      preview_url: r.src.medium || r.src.large, text: `${r.alt || ''} ${r.url || ''}`,
    })),
    note: 'Pexels: 200 запросов в час',
  };
}

async function pixabay(q, o) {
  const k = key('PIXABAY_API_KEY');
  if (!k) return { skip: 'нет PIXABAY_API_KEY (бесплатно после регистрации: pixabay.com/api/docs)' };
  const p = new URLSearchParams({ key: k, q: q.slice(0, 100), image_type: 'photo', per_page: String(Math.max(3, Math.min(200, o.n))), safesearch: 'true', lang: 'en' });
  const orient = { landscape: 'horizontal', portrait: 'vertical' }[o.orient];
  if (orient) p.set('orientation', orient);
  /* правила API: кэшировать ответы 24 ч */
  const j = await getJson(`https://pixabay.com/api/?${p}`, { cacheTtl: 24 * 3600e3, fresh: o.fresh });
  return {
    items: (j.hits || []).map((h) => {
      const s = Math.min(1, 1280 / long(h.imageWidth, h.imageHeight));
      return {
        source: 'pixabay', id: String(h.id), title: h.tags || '', page_url: h.pageURL, author: h.user || '', author_url: `https://pixabay.com/users/${h.user}-${h.user_id}/`,
        license: 'Pixabay Content License', license_code: 'pixabay', license_url: 'https://pixabay.com/service/license-summary/', attribution_required: false,
        attribution_text: `Фото: ${h.user}, Pixabay (${h.pageURL})`,
        orig: { width: h.imageWidth, height: h.imageHeight },
        /* без «полного доступа» к API крупнее 1280 px не дают — годится для карточек */
        variants: [{ url: h.largeImageURL, width: Math.round(h.imageWidth * s), height: Math.round(h.imageHeight * s), how: 'large-1280' }],
        preview_url: h.webformatURL, text: h.tags || '',
      };
    }),
    note: 'Pixabay: фото не больше 1280 px (годится для карточек); ответы кэшируются 24 ч',
  };
}

/* ---------- без ключа: фото ---------- */

async function wpphotos(q, o) {
  const url = `https://wordpress.org/photos/wp-json/wp/v2/photos?per_page=${Math.min(50, o.n)}&search=${encodeURIComponent(q)}&_embed=wp:featuredmedia`;
  const a = await getJson(url, { cacheTtl: 6 * 3600e3, fresh: o.fresh });
  return {
    items: (Array.isArray(a) ? a : []).map((p) => {
      const m = p._embedded?.['wp:featuredmedia']?.[0] || {}; const md = m.media_details || {};
      const sizes = md.sizes || {};
      const variants = Object.entries(sizes).filter(([k]) => !/thumbnail|medium$/.test(k)).map(([k, v]) => ({ url: v.source_url, width: v.width, height: v.height, how: k }));
      if (m.source_url && !variants.some((v) => v.url === m.source_url)) variants.push({ url: m.source_url, width: md.width, height: md.height, how: 'full' });
      const text = clean(p.content?.rendered);
      return {
        source: 'wpphotos', id: String(p.id), title: text.slice(0, 120), page_url: p.link, author: '', author_url: p.link,
        license: 'CC0 1.0', license_code: 'cc0', license_url: 'https://wordpress.org/photos/license/', attribution_required: false,
        attribution_text: `WordPress Photo Directory, CC0 (${p.link})`,
        orig: md.width ? { width: md.width, height: md.height } : null, variants,
        preview_url: sizes.medium_large?.source_url || p['photo-thumbnail-url'] || m.source_url, text,
      };
    }).filter((c) => c.variants.length),
    note: 'модерация запрещает лица и заметные бренды; качество любительское',
  };
}

/* Реальный потолок файла по адресу: Openverse пишет размер оригинала, а отдаёт копию. */
function realCap(url) {
  const u = String(url || ''); let m;
  if (/staticflickr\.com/.test(u)) { m = u.match(/_([a-z])\.(jpe?g|png)$/i); return { b: 1024, c: 800, z: 640, h: 1600, k: 2048, n: 320, m: 240 }[m?.[1]] ?? 500; }
  if ((m = u.match(/img-thumbs\/(\d+)w\//))) return Number(m[1]);
  if ((m = u.match(/rawpixel\.com\/editor_(\d+)\//))) return Number(m[1]);
  return null;
}

async function openverse(q, o) {
  const p = new URLSearchParams({ q, license: 'cc0,pdm', page_size: String(Math.min(20, o.n)), mature: 'false' });
  /* Commons ищем напрямую; StockSnap и Rawpixel запрещают автоматику */
  p.set('excluded_source', 'wikimedia,stocksnap,rawpixel');
  const orient = { landscape: 'wide', portrait: 'tall', square: 'square' }[o.orient];
  if (orient) p.set('aspect_ratio', orient);
  const j = await getJson(`https://api.openverse.org/v1/images/?${p}`, { cacheTtl: 12 * 3600e3, fresh: o.fresh });
  return {
    items: (j.results || []).map((r) => {
      const cap = realCap(r.url);
      const W = num(r.width), H = num(r.height);
      let fw = W, fh = H;
      if (cap && W && H && long(W, H) > cap) { const s = cap / long(W, H); fw = Math.round(W * s); fh = Math.round(H * s); }
      return {
        source: `openverse/${r.source}`, id: r.id, title: clean(r.title), page_url: r.foreign_landing_url,
        author: clean(r.creator) || 'неизвестен', author_url: r.creator_url || r.foreign_landing_url,
        license: `${String(r.license).toUpperCase()} ${r.license_version || ''}`.trim(), license_code: r.license === 'cc0' ? 'cc0' : 'pdm',
        license_url: r.license_url || '', attribution_required: false,
        attribution_text: r.attribution || `«${clean(r.title)}» — ${clean(r.creator)}, ${String(r.license).toUpperCase()}`,
        orig: W ? { width: W, height: H } : null,
        variants: [{ url: r.url, width: fw, height: fh, how: cap ? `copy-${cap}` : 'file', capped: !!cap, unverified: !cap }],
        preview_url: r.thumbnail || r.url, preview_fallback: r.url,
        text: `${r.title || ''} ${(r.tags || []).map((t) => t.name).join(' ')}`,
      };
    }),
    note: 'Openverse без ключа: 20 запросов в минуту и 200 в сутки; реальный файл у Flickr 1024 px — только карточки; сделано с помощью Openverse, Openverse не одобрял и не проверял',
  };
}

/* ---------- профиль art: музеи ---------- */

async function met(q, o) {
  const s = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&q=${encodeURIComponent(q)}`, { cacheTtl: 12 * 3600e3, fresh: o.fresh });
  const out = []; let seen = 0;
  for (const id of s.objectIDs || []) {
    if (out.length >= o.n || seen >= o.n * 3) break;
    seen++;
    let ob;
    try { ob = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, { cacheTtl: 24 * 3600e3, fresh: o.fresh }); } catch { continue; }
    if (!ob.isPublicDomain || !ob.primaryImage) continue;
    const img = encodeURI(decodeURI(ob.primaryImage));
    let dims = null;
    try { const r = await getRange(img, { bytes: 131072 }); dims = headerDims(r.body); } catch { /* размер узнаем при скачивании */ }
    const death = maxYear(ob.artistEndDate);
    const anonymous = !ob.artistDisplayName;
    const artist = ob.artistDisplayName || '';
    out.push({
      source: 'met', id: String(id), title: ob.title || '', page_url: ob.objectURL, author: artist || 'автор неизвестен', author_url: ob.artistWikidata_URL || ob.objectURL,
      license: 'CC0 1.0 (Met Open Access)', license_code: 'cc0', license_url: 'https://www.metmuseum.org/policies/frequently-asked-questions-image-and-data-resources', attribution_required: false,
      attribution_text: `${artist ? artist + '. ' : ''}${ob.title}${ob.objectDate ? ', ' + ob.objectDate : ''}. The Metropolitan Museum of Art, New York`,
      credit_line: `The Metropolitan Museum of Art, ${ob.creditLine || ''}`.trim(),
      orig: dims, variants: [{ url: img, width: dims?.width || null, height: dims?.height || null, how: 'original' }],
      preview_url: encodeURI(decodeURI(ob.primaryImageSmall || ob.primaryImage)),
      text: `${ob.title} ${ob.objectName || ''} ${ob.classification || ''}`,
      art: { death_year: death, work_year: num(ob.objectEndDate), term: termCheck({ deathYear: death, workYear: num(ob.objectEndDate), anonymous }) },
    });
  }
  return { items: out, note: `найдено всего ${s.total || 0}; просмотрено объектов ${seen}` };
}

async function cleveland(q, o) {
  const url = `https://openaccess-api.clevelandart.org/api/artworks/?cc0=1&has_image=1&limit=${Math.min(50, o.n)}&q=${encodeURIComponent(q)}`
    + '&fields=id,title,creators,creation_date,creation_date_latest,url,share_license_status,images,creditline,type';
  const j = await getJson(url, { cacheTtl: 12 * 3600e3, fresh: o.fresh });
  return {
    items: (j.data || []).filter((a) => a.share_license_status === 'CC0' && a.images?.print?.url).map((a) => {
      const pr = a.images.print; const fu = a.images.full;
      const variants = [{ url: pr.url, width: num(pr.width), height: num(pr.height), bytes: num(pr.filesize), how: 'print' }];
      if (fu?.url) variants.push({ url: fu.url, width: num(fu.width), height: num(fu.height), bytes: num(fu.filesize), mime: 'image/tiff', heavy: true, how: 'full-tiff' });
      const cr = (a.creators || [])[0];
      const death = maxYear((a.creators || []).map((x) => x.death_year).join(' '));
      const author = cr ? String(cr.description || '').replace(/\s*\(.*\)\s*$/, '') : 'автор неизвестен';
      return {
        source: 'cleveland', id: String(a.id), title: a.title || '', page_url: a.url, author, author_url: a.url,
        license: 'CC0 1.0', license_code: 'cc0', license_url: 'https://www.clevelandart.org/open-access', attribution_required: false,
        attribution_text: `${cr?.description || ''}. ${a.title}${a.creation_date ? ', ' + a.creation_date : ''}. The Cleveland Museum of Art`.replace(/^\. /, ''),
        credit_line: `The Cleveland Museum of Art, ${a.creditline || ''}`.trim(),
        orig: variants[variants.length - 1].width ? { width: variants[variants.length - 1].width, height: variants[variants.length - 1].height } : null,
        variants, preview_url: a.images.web?.url || pr.url, text: `${a.title} ${a.type || ''}`,
        art: { death_year: death, work_year: num(a.creation_date_latest), term: termCheck({ deathYear: death, workYear: num(a.creation_date_latest), anonymous: !cr }) },
      };
    }),
    note: '',
  };
}

async function aic(q, o) {
  warnNoContact(o.log);
  const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&query[term][is_public_domain]=true`
    + `&fields=id,title,artist_title,artist_display,date_display,date_end,image_id,thumbnail,credit_line,is_public_domain&limit=${Math.min(50, o.n)}`;
  const j = await getJson(url, { headers: { 'AIC-User-Agent': userAgent() }, cacheTtl: 12 * 3600e3, fresh: o.fresh });
  const iiif = j.config?.iiif_url || 'https://www.artic.edu/iiif/2';
  return {
    items: (j.data || []).filter((a) => a.image_id && a.is_public_domain).map((a) => {
      const W = num(a.thumbnail?.width), H = num(a.thumbnail?.height);
      const death = maxYear((String(a.artist_display || '').match(/\(([^)]*)\)/g) || []).join(' '));
      const pw = W ? Math.min(843, W) : 843;
      return {
        source: 'aic', id: String(a.id), title: a.title || '', page_url: `https://www.artic.edu/artworks/${a.id}`,
        author: a.artist_title || 'автор неизвестен', author_url: `https://www.artic.edu/artworks/${a.id}`,
        license: 'CC0 1.0', license_code: 'cc0', license_url: 'https://www.artic.edu/open-access/open-access-images', attribution_required: false,
        attribution_text: `${a.artist_title ? a.artist_title + '. ' : ''}${a.title}, ${a.date_display || ''}. The Art Institute of Chicago.`,
        credit_line: `${a.artist_title ? a.artist_title + '. ' : ''}${a.title}, ${a.date_display || ''}. The Art Institute of Chicago.`,
        orig: W ? { width: W, height: H } : null,
        template: { url: `${iiif}/${a.image_id}/full/{w},/0/default.jpg`, max_w: W || 1686, how: 'iiif' }, hdr: 'aic',
        preview_url: `${iiif}/${a.image_id}/full/${pw},/0/default.jpg`,
        text: `${a.title}`,
        art: { death_year: death, work_year: num(a.date_end), term: termCheck({ deathYear: death, workYear: num(a.date_end), anonymous: !a.artist_title }) },
      };
    }),
    note: 'AIC просит не больше 1 запроса в секунду; скачивание по одному',
  };
}

const RIJKS_NL = { 'still life': 'stilleven', flowers: 'bloemen', flower: 'bloem', landscape: 'landschap', portrait: 'portret', sea: 'zee', ship: 'schip', winter: 'winter', fruit: 'vruchten', city: 'stad', river: 'rivier', kitchen: 'keuken', bird: 'vogel', birds: 'vogels', tulip: 'tulp', tulips: 'tulpen', vase: 'vaas', map: 'kaart', garden: 'tuin', church: 'kerk', interior: 'interieur' };

async function rijks(q, o) {
  const LD = { accept: 'application/ld+json' };
  const nl = Object.entries(RIJKS_NL).reduce((s, [en, n]) => s.replace(new RegExp(`\\b${en}\\b`, 'gi'), n), q.toLowerCase());
  const tries = [`title=${encodeURIComponent(q)}`, `description=${encodeURIComponent(q)}`];
  if (nl !== q.toLowerCase()) tries.push(`title=${encodeURIComponent(nl)}`);
  const ids = [];
  for (const t of tries) {
    if (ids.length >= o.n * 2) break;
    const s = await getJson(`https://data.rijksmuseum.nl/search/collection?imageAvailable=true&${t}`, { headers: LD, cacheTtl: 12 * 3600e3, fresh: o.fresh });
    for (const it of s.orderedItems || []) if (!ids.includes(it.id)) ids.push(it.id);
  }
  const EN = /300388277/;
  const out = []; let protectedN = 0; let checked = 0;
  for (const id of ids) {
    if (out.length >= o.n || checked >= o.n * 2) break;
    checked++;
    try {
      const ob = await getJson(id, { headers: LD, cacheTtl: 24 * 3600e3, fresh: o.fresh });
      const vi = await getJson(ob.shows[0].id, { headers: LD, cacheTtl: 24 * 3600e3, fresh: o.fresh });
      const rights = (vi.subject_to || []).flatMap((x) => (x.classified_as || []).map((c) => c.id)).join(' ');
      if (!/publicdomain\/(mark|zero)/.test(rights)) { protectedN++; continue; } /* InC и прочее — охраняемые работы */
      const dob = await getJson(vi.digitally_shown_by[0].id, { headers: LD, cacheTtl: 24 * 3600e3, fresh: o.fresh });
      const base = String(dob.access_point[0].id).replace(/\/full\/.*$/, '');
      const info = await getJson(`${base}/info.json`, { cacheTtl: 24 * 3600e3, fresh: o.fresh });
      const names = (ob.identified_by || []).filter((x) => x.type === 'Name');
      const title = (names.find((x) => (x.language || []).some((l) => EN.test(l.id))) || names[0] || {}).content || '';
      const creators = (ob.produced_by?.referred_to_by || []);
      const creator = (creators.find((x) => (x.language || []).some((l) => EN.test(l.id))) || creators[0] || {}).content || '';
      const ts = ob.produced_by?.timespan || {};
      const dateText = ((ts.identified_by || []).find((x) => (x.language || []).some((l) => EN.test(l.id))) || {}).content || '';
      const work = maxYear(ts.end_of_the_end);
      const anonymous = !creator || /anonymous|anoniem|unknown/i.test(creator);
      const num_id = String(id).split('/').pop();
      const objNo = ((ob.identified_by || []).find((x) => x.type === 'Identifier') || {}).content || num_id;
      const page = `https://www.rijksmuseum.nl/en/collection/${encodeURIComponent(objNo)}`;
      out.push({
        source: 'rijks', id: num_id, title, page_url: page, author: creator || 'автор неизвестен', author_url: id,
        license: 'Public Domain Mark 1.0', license_code: 'pdm', license_url: 'https://data.rijksmuseum.nl/policy/information-and-data-policy', attribution_required: false,
        attribution_text: `${creator ? creator + '. ' : ''}${title}${dateText ? ', ' + dateText : ''}. Rijksmuseum, Amsterdam`,
        credit_line: 'Rijksmuseum, Amsterdam',
        orig: { width: info.width, height: info.height },
        template: { url: `${base}/full/{w},/0/default.jpg`, max_w: info.width, how: 'iiif' },
        preview_url: `${base}/full/${Math.min(400, info.width)},/0/default.jpg`, text: title,
        art: { death_year: null, work_year: work, term: termCheck({ workYear: work, anonymous }) },
      });
    } catch { /* объект без картинки или без прав — пропуск */ }
  }
  return { items: out, note: protectedN ? `отброшено охраняемых работ: ${protectedN}` : '' };
}

async function smk(q, o) {
  const run = (keys) => getJson(`https://api.smk.dk/api/v1/art/search/?keys=${encodeURIComponent(keys)}&filters=[public_domain:true],[has_image:true]&offset=0&rows=${Math.min(50, o.n)}`, { cacheTtl: 12 * 3600e3, fresh: o.fresh });
  let j = await run(q);
  let note = '';
  if ((j.found || 0) < Math.ceil(o.n / 2)) {
    const word = q.split(/\s+/).sort((a, b) => b.length - a.length)[0];
    if (word && word !== q) { const j2 = await run(word); if ((j2.found || 0) > (j.found || 0)) { j = j2; note = `по «${q}» мало, взят запрос «${word}»`; } }
  }
  return {
    items: (j.items || []).filter((i) => i.public_domain && i.image_iiif_id && /publicdomain/.test(i.rights || '')).map((i) => {
      const titles = i.titles || [];
      const title = (titles.find((t) => /engelsk/i.test(t.language || '')) || titles[0] || {}).title || '';
      const prod = i.production || [];
      const creator = prod.map((p) => p.creator).filter(Boolean).join(', ');
      const death = maxYear(prod.map((p) => p.creator_date_of_death).join(' '));
      const work = maxYear((i.production_date || []).map((d) => d.end).join(' '));
      return {
        source: 'smk', id: i.object_number, title, page_url: i.frontend_url, author: creator || 'автор неизвестен', author_url: i.frontend_url,
        license: 'Public Domain Mark 1.0', license_code: 'pdm', license_url: 'https://www.smk.dk/en/article/free-download-of-images/', attribution_required: false,
        attribution_text: `${creator ? creator + '. ' : ''}${title}. SMK – Statens Museum for Kunst`,
        credit_line: 'SMK – Statens Museum for Kunst',
        orig: { width: num(i.image_width), height: num(i.image_height) },
        template: { url: `${i.image_iiif_id}/full/{w},/0/default.jpg`, max_w: num(i.image_width), how: 'iiif' },
        preview_url: i.image_thumbnail, text: title,
        art: { death_year: death, work_year: work, term: termCheck({ deathYear: death, workYear: work, anonymous: !creator }) },
      };
    }),
    note,
  };
}

async function smithsonian(q, o) {
  const k = key('SI_API_KEY');
  if (!k) return { skip: 'нет SI_API_KEY (бесплатно: api.data.gov/signup)' };
  /* кавычки в запросе режет их WAF */
  const qq = q.replace(/["']/g, ' ');
  const j = await getJson(`https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(qq)}+AND+online_media_type:Images&rows=${Math.min(50, o.n * 2)}&api_key=${encodeURIComponent(k)}`, { cacheTtl: 12 * 3600e3, fresh: o.fresh });
  const out = [];
  for (const row of j.response?.rows || []) {
    const c = row.content || {}; const dnr = c.descriptiveNonRepeating || {};
    const media = (dnr.online_media?.media || []).find((m) => m.usage?.access === 'CC0' && m.type === 'Images');
    if (!media) continue;
    const idsId = String(media.idsId || media.content || '').replace(/^.*id=/, '');
    const res = (media.resources || []).find((r) => /High-resolution JPEG/i.test(r.label || '')) || {};
    const W = num(res.width), H = num(res.height);
    const author = ((c.freetext?.name || [])[0]?.content) || 'автор неизвестен';
    const work = maxYear(((c.freetext?.date || [])[0]?.content));
    out.push({
      source: 'smithsonian', id: row.id, title: row.title || '', page_url: dnr.record_link || dnr.guid || '', author, author_url: dnr.record_link || '',
      license: 'CC0 1.0', license_code: 'cc0', license_url: 'https://www.si.edu/termsofuse', attribution_required: false,
      attribution_text: `${row.title}. ${dnr.data_source || 'Smithsonian Institution'}`,
      credit_line: dnr.data_source || 'Smithsonian Institution',
      orig: W ? { width: W, height: H } : null,
      template: { url: `https://ids.si.edu/ids/deliveryService?id=${encodeURIComponent(idsId)}&max={w}`, max_w: W ? long(W, H) : 3840, how: 'ids' },
      preview_url: media.thumbnail || `https://ids.si.edu/ids/deliveryService?id=${encodeURIComponent(idsId)}&max=400`, text: row.title || '',
      art: { death_year: null, work_year: work, term: termCheck({ workYear: work }) },
    });
    if (out.length >= o.n) break;
  }
  return { items: out, note: '' };
}

/* ---------- реестр и профили ---------- */

export const SOURCES = {
  unsplash: { kind: 'photo', key: 'UNSPLASH_ACCESS_KEY', search: unsplash, host: 'https://api.unsplash.com/' },
  pexels: { kind: 'photo', key: 'PEXELS_API_KEY', search: pexels, host: 'https://api.pexels.com/v1/' },
  'commons-unsplash': { kind: 'photo', search: (q, o) => commonsSearch(q, o, 'unsplash'), host: 'https://commons.wikimedia.org/w/api.php' },
  commons: {
    kind: 'photo',
    /* сначала отобранные сообществом «Quality images», потом весь CC0 */
    async search(q, o) {
      const a = await commonsSearch(q, o, 'quality');
      if (a.items.length >= o.n) return a;
      const b = await commonsSearch(q, o, 'cc0');
      const seen = new Set(a.items.map((c) => c.id));
      return { items: [...a.items, ...b.items.filter((c) => !seen.has(c.id))], note: `Quality images: ${a.items.length}${a.note ? '; ' + a.note : ''}` };
    },
    host: 'https://commons.wikimedia.org/w/api.php',
  },
  pixabay: { kind: 'photo', key: 'PIXABAY_API_KEY', search: pixabay, host: 'https://pixabay.com/api/' },
  wpphotos: { kind: 'photo', search: wpphotos, host: 'https://wordpress.org/photos/wp-json/wp/v2/photos?per_page=1' },
  openverse: { kind: 'photo', search: openverse, host: 'https://api.openverse.org/v1/' },
  met: { kind: 'art', search: met, host: 'https://collectionapi.metmuseum.org/public/collection/v1/departments' },
  cleveland: { kind: 'art', search: cleveland, host: 'https://openaccess-api.clevelandart.org/api/artworks/?limit=1&fields=id' },
  rijks: { kind: 'art', search: rijks, host: 'https://data.rijksmuseum.nl/search/collection?title=tulp' },
  aic: { kind: 'art', search: aic, host: 'https://api.artic.edu/api/v1/artworks?limit=1&fields=id', hdr: 'aic' },
  smk: { kind: 'art', search: smk, host: 'https://api.smk.dk/api/v1/art/search/?keys=tulip&rows=1' },
  smithsonian: { kind: 'art', key: 'SI_API_KEY', search: smithsonian, host: 'https://api.si.edu/openaccess/api/v1.0/' },
  'commons-art': { kind: 'art', search: (q, o) => commonsSearch(q, o, 'art'), host: 'https://commons.wikimedia.org/w/api.php' },
};

/* Порядок из SOURCES.md с поправками проверки */
export const PROFILES = {
  photo: ['unsplash', 'pexels', 'commons-unsplash', 'commons', 'pixabay', 'wpphotos', 'openverse'],
  art: ['met', 'cleveland', 'rijks', 'aic', 'smk', 'smithsonian', 'commons-art'],
};

/** Заголовки для скачивания файла кандидата (без секретов в манифесте). */
export function headersFor(c) {
  if (c.hdr === 'aic' || /artic\.edu/.test(c.preview_url || '')) return { 'AIC-User-Agent': userAgent() };
  return {};
}

export { redact };
