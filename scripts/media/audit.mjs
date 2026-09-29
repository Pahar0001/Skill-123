/**
 * media.mjs audit — источники и лицензии по карте фото проекта. Только чтение: карта и файлы
 * не меняются, протокол — только с --out.
 *
 * Зачем: задача говорила «всё с Pexels», а в карте Эпицентра (src/photo-map.json) было 25 кадров
 * блюд с Commons под CC BY/BY-SA и кадр Commons с вывеской сети (Nando's); один кадр Pexels стоял
 * и на «Русской пирамиде, вечер», и на турнире. Всё это нашлось только на проверке (29.09).
 *
 * Карта — любой JSON, где запись кадра — объект с путём (file, src, path, image, img; у
 * credits.json media.mjs — name и files[]; у credits.json проекта путь бывает ключом) и хоть одним
 * полем учёта (license, page, page_url, author, source, text…). Вложенность любая: разделы
 * (dishes, venues, gallery), массивы, объект «путь → запись».
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadSharp, writeJson } from '../lib.mjs';
import { brandsIn } from './photo.mjs';
import { normPage } from './manifest.mjs';
import { dhash, hamming } from './process.mjs';

const FILE_KEYS = ['file', 'src', 'path', 'image', 'img'];
const INFO_KEYS = ['license', 'licence', 'license_code', 'page', 'page_url', 'author', 'source', 'text', 'credit', 'attribution_text'];
const IMG = /\.(jpe?g|png|webp|avif|gif)$/i;
const s = (v) => (typeof v === 'string' ? v.trim() : '');
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

/* Источник по адресу страницы кадра, иначе по полю source записи */
const HOSTS = [
  [/(^|\.)(commons\.wikimedia\.org|upload\.wikimedia\.org|wikipedia\.org|wikimedia\.org)$/, 'Commons'],
  [/(^|\.)pexels\.com$/, 'Pexels'], [/(^|\.)unsplash\.com$/, 'Unsplash'], [/(^|\.)pixabay\.com$/, 'Pixabay'],
  [/(^|\.)flickr\.com$/, 'Flickr'], [/(^|\.)openverse\.(org|engineering)$/, 'Openverse'], [/(^|\.)wordpress\.org$/, 'WordPress Photos'],
  [/(^|\.)mixkit\.co$/, 'Mixkit'], [/(^|\.)kaboompics\.com$/, 'Kaboompics'], [/(^|\.)foodiesfeed\.com$/, 'Foodiesfeed'],
  [/(^|\.)metmuseum\.org$/, 'Met'], [/(^|\.)artic\.edu$/, 'AIC'], [/(^|\.)rijksmuseum\.nl$/, 'Rijksmuseum'], [/(^|\.)clevelandart\.org$/, 'Cleveland'],
];
function sourceOf(page, src) {
  let host = ''; try { host = new URL(page).hostname.replace(/^www\./, ''); } catch { /* не адрес */ }
  for (const [re, name] of HOSTS) if (host && re.test(host)) return name;
  const v = s(src).toLowerCase().replace(/^import\//, '');
  if (!v) return host || 'не указан';
  if (/^commons|wikimedia/.test(v)) return 'Commons';
  const known = { pexels: 'Pexels', unsplash: 'Unsplash', pixabay: 'Pixabay', openverse: 'Openverse', wpphotos: 'WordPress Photos', met: 'Met', aic: 'AIC', rijks: 'Rijksmuseum', cleveland: 'Cleveland', smk: 'SMK', smithsonian: 'Smithsonian', mixkit: 'Mixkit', 'mixkit-free': 'Mixkit' };
  return known[v] || s(src);
}
/** Ключ кадра у источника: pexels:14965205, commons:ceviche_del_perú.jpg, иначе — страница без протокола. */
function sourceIdOf(rec, source, page) {
  if (s(rec.source_id) || typeof rec.source_id === 'number') return `${source.toLowerCase()}:${String(rec.source_id).toLowerCase()}`;
  if (!page) return null;
  let p = page; try { p = decodeURIComponent(page); } catch { /* как есть */ }
  let m;
  if (source === 'Pexels' && (m = p.match(/\/photo\/(?:[^/]*?-)?(\d+)\/?(?:[?#]|$)/))) return `pexels:${m[1]}`;
  if (source === 'Unsplash' && (m = p.match(/\/photos\/(?:[^/]*-)?([A-Za-z0-9_-]{11})\/?(?:[?#]|$)/))) return `unsplash:${m[1]}`;
  if (source === 'Pixabay' && (m = p.match(/-(\d{4,})\/?(?:[?#]|$)/))) return `pixabay:${m[1]}`;
  if (source === 'Commons' && (m = p.match(/\/(?:wiki\/)?(?:File|Файл):([^?#]+)/i))) return `commons:${m[1].replace(/ /g, '_').toLowerCase()}`;
  return normPage(page);
}

/** Лицензия из поля или из строки подписи («Cory Doctorow · CC BY-SA 2.0 · Wikimedia Commons»). */
function licenseOf(rec) {
  const direct = s(rec.license) || s(rec.licence) || s(rec.license_code);
  if (direct) return direct;
  const t = [rec.text, rec.credit, rec.attribution_text].map(s).join(' · ');
  const m = t.match(/(CC[- ]?BY(?:[- ](?:NC|ND|SA))*(?:[- ]\d(?:\.\d)?)?|CC0(?:\s*1\.0)?|Public Domain(?: Mark)?|PDM|GFDL|Pexels(?: License)?|Unsplash(?: License)?|Pixabay(?: Content License)?)/i);
  return m ? m[1] : '';
}
/**
 * Класс лицензии: free (CC0, общественное достояние), stock (Pexels, Unsplash…), by, by-sa, gfdl,
 * nc, nd (для сайта клиента нельзя), none (не указана), other (не распознана).
 */
function licenseClass(l) {
  const v = s(l).toLowerCase();
  if (!v) return 'none';
  if (/(^|[^a-z])nc([^a-z]|$)|non-?commercial/.test(v)) return 'nc';
  if (/(^|[^a-z])nd([^a-z]|$)|no-?deriv/.test(v)) return 'nd';
  if (/cc0|cc-zero|public ?domain|^pdm$|^pd$|pd-/.test(v)) return 'free';
  if (/by-?sa|share-?alike/.test(v)) return 'by-sa';
  if (/cc[- ]?by|^by([- ]\d|$)|attribution/.test(v)) return 'by';
  if (/gfdl|gnu free/.test(v)) return 'gfdl';
  if (/pexels|unsplash|pixabay|mixkit|kaboompics|burst|picjumbo|foodiesfeed|adobe/.test(v)) return 'stock';
  return 'other';
}
const LIC_LABEL = { free: 'свободно', stock: 'сток', by: 'CC BY — подпись обязательна', 'by-sa': 'CC BY-SA — подпись обязательна, обрезанный кадр — на тех же условиях', gfdl: 'GFDL — к кадру нужен текст лицензии', nc: 'NC — только некоммерческое: сайт клиента нельзя', nd: 'ND — без изменений: обрезка и пережатие — уже изменение', none: 'лицензия не указана', other: 'лицензия не распознана' };

/** Обойти карту: записи кадров с меткой-путём в JSON. */
function collect(node, trail, out, parentKey = null) {
  if (Array.isArray(node)) { node.forEach((x, i) => collect(x, [...trail, `[${i}]`], out)); return; }
  if (!node || typeof node !== 'object') return;
  const hasInfo = INFO_KEYS.some((k) => s(node[k]) || typeof node[k] === 'number');
  const fileKey = FILE_KEYS.find((k) => s(node[k]));
  const files = Array.isArray(node.files) ? node.files.filter((f) => f && s(f.file)) : [];
  const keyIsPath = !!(parentKey && IMG.test(parentKey));
  if (hasInfo && (fileKey || files.length || keyIsPath || s(node.name))) {
    /* главный файл записи media.mjs: точный режим — exact, иначе запасной JPEG, иначе первый */
    const main = files.find((f) => f.group === 'exact') || files.find((f) => f.group === 'fallback' || /\.jpe?g$/i.test(f.file)) || files[0];
    const file = fileKey ? s(node[fileKey]) : main ? s(main.file) : keyIsPath ? parentKey : s(node.name);
    out.push({ node, trail, file });
    return;
  }
  for (const [k, v] of Object.entries(node)) collect(v, [...trail, k], out, k);
}
function labelOf(trail, node) {
  const t = trail.reduce((a, x) => (x.startsWith('[') ? `${a}${x}` : a ? `${a} › ${x}` : x), '');
  /* у элемента массива — его key или name (credits.json media.mjs: [3] (dish-bokal-vina)) */
  const key = s(node.key) || (/\]$/.test(t) ? s(node.name) : '');
  return key && !t.includes(key) ? `${t} (${key})` : t || '(корень)';
}

/** Папка, от которой считаются пути карты: --root, иначе лучшая из папки карты, выше и их public/. */
function findRoot(mapFile, recs, rootOpt) {
  const mapDir = path.dirname(mapFile);
  if (rootOpt) return { root: path.resolve(rootOpt), guessed: false };
  /* папка карты и до 6 уровней вверх (credits.json лежит в public/assets/img/photos, а пути — от public), у каждой — и её public/ */
  const ups = []; for (let d = mapDir, i = 0; i < 7; i++) { ups.push(d, path.join(d, 'public')); const p = path.dirname(d); if (p === d) break; d = p; }
  const cands = [...new Set([...ups, process.cwd(), path.join(process.cwd(), 'public')])];
  const sample = recs.filter((r) => r.file && !/^https?:/i.test(r.file)).slice(0, 25);
  let best = null;
  for (const c of cands) {
    const hits = sample.filter((r) => fs.existsSync(path.join(c, r.file.replace(/^[\\/]+/, '')))).length;
    if (hits && (!best || hits > best.hits)) best = { root: c, hits };
  }
  return best ? { root: best.root, guessed: true } : { root: null, guessed: true };
}

export async function cmdAudit({ pos, opt, log, fail }) {
  const mapArg = s(pos[1]) || (typeof opt.map === 'string' ? opt.map : '');
  if (!mapArg) fail('Использование: node media.mjs audit <карта фото.json> [--root <папка сайта>] [--sources pexels,unsplash] [--out <файл.json или папка>]');
  const mapFile = path.resolve(mapArg);
  if (!fs.existsSync(mapFile)) fail(`Нет файла ${mapFile}`);
  let map; try { map = JSON.parse(fs.readFileSync(mapFile, 'utf8')); } catch (e) { fail(`${mapFile} не читается как JSON: ${e.message.slice(0, 100)}`); }
  const allowed = opt.sources !== undefined ? String(opt.sources).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : null;
  if (allowed && !allowed.length) fail('--sources: пустой список — например pexels,unsplash');
  if (opt.root !== undefined && !fs.existsSync(path.resolve(String(opt.root)))) fail(`--root ${opt.root}: папки нет`);

  const raw = []; collect(map, [], raw);
  if (!raw.length) fail(`В ${mapFile} не нашлось записей кадров (объект с file/src/path или name и полем license, page, author, source или text).`);
  const recs = raw.map(({ node, trail, file }) => {
    const page = s(node.page) || s(node.page_url) || s(node.source_url) || (s(node.url) && !IMG.test(s(node.url)) ? s(node.url) : '');
    const source = sourceOf(page, node.source);
    const license = licenseOf(node);
    const text = [node.title, node.caption, node.description, node.alt, node.seen, node.text].map(s).filter(Boolean).join(' · ');
    let pagePath = ''; try { pagePath = decodeURIComponent(new URL(page).pathname).replace(/[-_/]+/g, ' '); } catch { /* нет */ }
    const author = s(node.author) || (s(node.text).split(/\s+·\s+/)[0] || '');
    return {
      label: labelOf(trail, node), file, source, source_id: sourceIdOf(node, source, page), license, cls: licenseClass(license),
      author, title: s(node.title), page, brands: brandsIn(`${text} ${pagePath} ${path.basename(file || '')}`),
    };
  });

  /* файлы: наличие, sha256, отпечаток для похожих */
  const { root, guessed } = findRoot(mapFile, recs, opt.root);
  const sharp = loadSharp();
  let found = 0; let local = 0;
  for (const r of recs) {
    if (!r.file || /^https?:/i.test(r.file)) continue;
    local++;
    const rel = r.file.replace(/^[\\/]+/, '');
    const abs = [root && path.join(root, rel), path.join(path.dirname(mapFile), rel)].filter(Boolean).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
    r.exists = !!abs;
    if (!abs) continue;
    found++;
    const buf = fs.readFileSync(abs);
    r.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    r.bytes = buf.length;
    if (sharp) { try { r.dhash = await dhash(sharp, buf); } catch { /* не картинка */ } }
  }

  /* группы: один кадр источника под разными файлами; одинаковые файлы; похожие кадры */
  const groupBy = (key) => {
    const m = new Map();
    for (const r of recs) { const k = key(r); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return [...m.entries()].filter(([, v]) => new Set(v.map((x) => x.file || x.label)).size > 1).map(([k, v]) => ({ key: k, items: v }));
  };
  const sameSource = groupBy((r) => r.source_id);
  const sameFile = groupBy((r) => r.sha256);
  const similar = [];
  const hashed = recs.filter((r) => r.dhash);
  for (let i = 0; i < hashed.length; i++) for (let j = i + 1; j < hashed.length; j++) {
    const a = hashed[i], b = hashed[j];
    if (a.sha256 === b.sha256 || (a.source_id && a.source_id === b.source_id)) continue;
    const d = hamming(a.dhash, b.dhash);
    if (d <= 4) similar.push({ a, b, d });
  }

  /* строки протокола */
  const lines = [];
  const L = (status, what, items = []) => lines.push({ status, what, items });
  const item = (r) => `${r.label} · ${r.file ? path.basename(r.file) : '—'} · ${r.license || 'без лицензии'}${r.author ? ` · ${r.author.slice(0, 60)}` : ''} · ${r.source}`;
  const nc = recs.filter((r) => r.cls === 'nc' || r.cls === 'nd');
  if (nc.length) L('FAIL', `NC или ND — для сайта клиента нельзя: ${nc.length}`, nc.map((r) => `${item(r)} — ${LIC_LABEL[r.cls]}`));
  if (allowed) {
    const out = recs.filter((r) => !allowed.includes(r.source.toLowerCase()));
    if (out.length) L('FAIL', `не из разрешённых источников (--sources ${allowed.join(',')}): ${out.length}`, out.map(item));
  }
  const by = recs.filter((r) => r.cls === 'by' || r.cls === 'by-sa');
  if (by.length) {
    const noAuthor = by.filter((r) => !r.author || /no machine-readable|unknown|неизвест|не указан/i.test(r.author));
    L('WARN', `CC BY и BY-SA — подпись обязательна (автор, название, лицензия, ссылка; у BY-SA обрезанный кадр — на тех же условиях): ${by.length}${noAuthor.length ? `, из них автор не установлен у ${noAuthor.length} — смотреть страницу файла` : ''}`, by.map(item));
  }
  const brand = recs.filter((r) => r.brands.length);
  if (brand.length) L('WARN', `марка в названии, описании или адресе: ${brand.length} — открыть кадр глазами: этикетка, логотип или вывеска сети — чужой знак`, brand.map((r) => `${item(r)} — ${r.brands.join(', ')}${r.title ? ` — «${r.title.slice(0, 80)}»` : ''}`));
  if (sameSource.length) L('WARN', `один кадр источника под разными файлами: ${sameSource.length} ${plural(sameSource.length, 'группа', 'группы', 'групп')} — один снимок в двух местах сайта`, sameSource.map((g) => `${g.key} → ${g.items.map((r) => `${path.basename(r.file || '')} (${r.label})`).join(', ')}`));
  if (sameFile.length) L('WARN', `одинаковые файлы (sha256): ${sameFile.length} ${plural(sameFile.length, 'группа', 'группы', 'групп')}`, sameFile.map((g) => `${g.key.slice(0, 12)} → ${g.items.map((r) => `${path.basename(r.file || '')} (${r.label})`).join(', ')}`));
  const noLic = recs.filter((r) => r.cls === 'none' || r.cls === 'other');
  if (noLic.length) L('WARN', `лицензия не указана или не распознана: ${noLic.length}`, noLic.map(item));
  const gfdl = recs.filter((r) => r.cls === 'gfdl');
  if (gfdl.length) L('WARN', `GFDL без CC — к кадру нужен полный текст лицензии: ${gfdl.length}`, gfdl.map(item));
  const missing = recs.filter((r) => r.exists === false);
  if (missing.length) L('WARN', `нет файла: ${missing.length}${root ? ` (искал от ${root})` : ''}`, missing.map(item));
  if (similar.length) L('INFO', `похожие кадры (отпечаток dHash, расстояние ≤ 4 из 64) — возможно, один снимок в разной обрезке или серия: ${similar.length}`, similar.slice(0, 40).map((x) => `${path.basename(x.a.file)} (${x.a.label}) ≈ ${path.basename(x.b.file)} (${x.b.label}) · ${x.d}`));
  const commons = recs.filter((r) => r.source === 'Commons');
  if (commons.length) {
    const byLic = {}; for (const r of commons) byLic[r.license || '?'] = (byLic[r.license || '?'] || 0) + 1;
    L('INFO', `Commons: ${commons.length} (${Object.entries(byLic).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}) — у каждого файла свои автор и лицензия: страница файла, раздел Licensing`, commons.map(item));
  }

  /* печать */
  const count = (key) => { const m = {}; for (const r of recs) m[key(r) || '?'] = (m[key(r) || '?'] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  log(`Карта фото: ${mapFile} · записей ${recs.length}`);
  log(root ? `Файлы — от ${root}${guessed ? ' (найдена сама; другая — --root)' : ''}: нашлось ${found} из ${local}` : `Файлы: папку сайта не нашёл (пути вида ${recs.find((r) => r.file)?.file || '?'}) — --root <папка>; наличие и одинаковые файлы не проверены`);
  log(`Источники: ${count((r) => r.source).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  log(`Лицензии: ${count((r) => r.license).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  for (const l of lines) {
    log(`\n${l.status} ${l.what}`);
    for (const x of l.items.slice(0, 60)) log(`  ${x}`);
    if (l.items.length > 60) log(`  … ещё ${l.items.length - 60} (все — в протоколе --out)`);
  }
  const verdict = lines.some((l) => l.status === 'FAIL') ? 'FAIL' : lines.some((l) => l.status === 'WARN') ? 'WARN' : 'OK';
  const summary = [
    commons.length ? `Commons ${commons.length}` : '', by.length ? `подпись обязательна ${by.length}` : '', nc.length ? `NC/ND ${nc.length}` : '',
    brand.length ? `марка ${brand.length}` : '', sameSource.length ? `повтор кадра ${sameSource.length}` : '', sameFile.length ? `одинаковых файлов ${sameFile.length}` : '',
    noLic.length ? `без лицензии ${noLic.length}` : '', missing.length ? `нет файла ${missing.length}` : '',
  ].filter(Boolean).join(', ');

  if (opt.out !== undefined) {
    let f = path.resolve(String(opt.out));
    if (!/\.json$/i.test(f)) f = path.join(f, 'audit.json');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    writeJson(f, {
      verdict, takenAt: new Date().toISOString(), map: mapFile, root, allowed,
      bySource: Object.fromEntries(count((r) => r.source)), byLicense: Object.fromEntries(count((r) => r.license)),
      lines: lines.map((l) => ({ status: l.status, what: l.what, items: l.items })),
      groups: { sameSource: sameSource.map((g) => ({ key: g.key, files: g.items.map((r) => r.file) })), sameFile: sameFile.map((g) => ({ sha256: g.key, files: g.items.map((r) => r.file) })), similar: similar.map((x) => ({ a: x.a.file, b: x.b.file, distance: x.d })) },
      records: recs.map(({ dhash: _d, ...r }) => r),
    });
    log(`\nПротокол: ${f}`);
  }
  log(`\n${verdict}: ${recs.length} ${plural(recs.length, 'запись', 'записи', 'записей')}${summary ? ` — ${summary}` : ' — источники и лицензии без замечаний'}.`);
  if (verdict === 'FAIL') process.exit(1);
}
