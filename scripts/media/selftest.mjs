/**
 * media.mjs --selftest [--out папка] — без сети: стенд fixtures/media/audit (карта фото с повтором кадра,
 * одинаковыми файлами, марками, CC BY/BY-SA, NC, без лицензии, без файла), точный режим (--size,
 * --thumb, --name, --quality, замена файла, credits.json проекта не трогается, «кадр уже использован»),
 * --need, ворота флагов и чистые функции (марки, ориентация по умолчанию, округление ширины шаблона).
 * Картинки стенда генерируются sharp (шум по зерну) — в репозитории их нет. Код 1 — хоть одна проверка не прошла.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSharp } from '../lib.mjs';
import { brandsIn, flagsFor, orientFor, chooseFile } from './photo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.dirname(HERE);
const MEDIA = path.join(SCRIPTS, 'media.mjs');
const FX = path.join(SCRIPTS, 'fixtures', 'media');

/* шум по зерну: разные зёрна — разные отпечатки dHash; shift — та же картинка светлее (похожий кадр) */
async function noise(sharp, w, h, seed, shift = 0) {
  let s = seed >>> 0 || 1; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  /* крупные клетки 8×8: после уменьшения до 9×8 отпечаток устойчив к сдвигу яркости */
  const cells = Array.from({ length: Math.ceil(w / 8) * Math.ceil(h / 8) }, () => [rnd() * 200, rnd() * 200, rnd() * 200]);
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[Math.floor(y / 8) * Math.ceil(w / 8) + Math.floor(x / 8)];
    for (let k = 0; k < 3; k++) buf[(y * w + x) * 3 + k] = Math.min(255, Math.round(c[k] + shift));
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

export async function selftest({ opt, log }) {
  const sharp = loadSharp();
  if (!sharp) { log('FAIL: нет sharp — selftest не запустить'); return 1; }
  const tmp = opt.out && opt.out !== true ? path.resolve(String(opt.out)) : fs.mkdtempSync(path.join(os.tmpdir(), 'media-selftest-'));
  fs.mkdirSync(tmp, { recursive: true });
  const env = { ...process.env, SITE_REWORK_RUNS: path.join(tmp, 'runs'), MEDIA_CACHE: path.join(tmp, 'cache') };
  const M = (...a) => { const p = spawnSync(process.execPath, [MEDIA, ...a], { encoding: 'utf8', env, windowsHide: true, maxBuffer: 32 << 20 }); return { code: p.status, out: `${p.stdout}${p.stderr}` }; };
  const results = [];
  const check = (group, name, ok, extra = '') => { results.push(!!ok); log(`${ok ? 'OK  ' : 'FAIL'} ${group.padEnd(8)} ${name}${!ok && extra ? ` — ${String(extra).replace(/\s+/g, ' ').slice(0, 300)}` : ''}`); };
  const dims = async (f) => { try { const m = await sharp(f).metadata(); return `${m.width}x${m.height}`; } catch { return 'нет файла'; } };

  /* ---------- чистые функции ---------- */
  check('марки', 'Aperol в названии кадра Pexels', brandsIn('Bright Aperol spritz with lemon slice').join() === 'Aperol');
  check('марки', 'Moët и Nando\'s (не латиница в конце, апостроф)', brandsIn("Moët & Chandon at Nando’s").length === 3, brandsIn("Moët & Chandon at Nando’s").join());
  check('марки', 'apple pie, martini glass, corona crown — не марки', !brandsIn('apple pie, martini glass, corona crown').length, brandsIn('apple pie, martini glass, corona crown').join());
  check('марки', 'brand? и при марке в запросе (aperol spritz)', flagsFor('Bright Aperol spritz', 'aperol spritz').includes('brand?'));
  check('марки', 'слово logo в запросе по-прежнему не метит', !flagsFor('logo design on paper', 'logo design').includes('brand?'));
  const o1 = orientFor('photo', 'card'), o2 = orientFor('photo', 'hero'), o3 = orientFor('photo', 'section'), o4 = orientFor('photo', 'card', 'any'), o5 = orientFor('video', 'loop'), o6 = orientFor('photo', 'card', 'wide');
  check('orient', 'card и hero — landscape по умолчанию, section — без отбора', o1.orient === 'landscape' && o1.byDefault && o2.orient === 'landscape' && o3.orient === null);
  check('orient', '--orient any — без отбора; видео — landscape; неверное — ошибка', o4.orient === null && !o4.byDefault && o5.orient === 'landscape' && o6.bad === 'wide');
  const cf = chooseFile({ orig: { width: 4936, height: 7403 }, template: { url: 'https://x/p.jpeg?w={w}', max_w: 4936 } }, 'card');
  check('файл', 'шаблон 4936x7403 под card — 854 в ширину (не 853 → 1279)', cf.width === 854 && cf.height >= 1280, `${cf.width}x${cf.height}`);
  const cf2 = chooseFile({ orig: { width: 4936, height: 7403 }, template: { url: 'https://x/p.jpeg?w={w}', max_w: 4936 } }, 'card', null, 1500);
  check('файл', 'своя цель 1500 (под --size 1000x700) — 1001 в ширину', cf2.width >= 1000 && cf2.width <= 1001, `${cf2.width}`);

  /* ---------- audit: стенд карты ---------- */
  const site = path.join(tmp, 'audit'); const photos = path.join(site, 'public', 'assets', 'img', 'photos');
  fs.mkdirSync(path.join(site, 'src'), { recursive: true }); fs.mkdirSync(photos, { recursive: true });
  fs.copyFileSync(path.join(FX, 'audit', 'photo-map.json'), path.join(site, 'src', 'photo-map.json'));
  const seeds = { 'dish-bokal-vina': 1, 'dish-turnir': 2, 'dish-kurica-piri': 3, 'dish-aperol': 4, 'dish-seviche': 5, 'dish-chay': 6, 'dish-hleb': 8, 'gal-1': 9 };
  for (const [n, sd] of Object.entries(seeds)) fs.writeFileSync(path.join(photos, `${n}.jpg`), await noise(sharp, 96, 64, sd));
  fs.copyFileSync(path.join(photos, 'dish-chay.jpg'), path.join(photos, 'dish-ulun.jpg')); /* тот же файл под другим именем */
  fs.writeFileSync(path.join(photos, 'dish-sup.jpg'), await noise(sharp, 96, 64, 1, 12)); /* светлее «Бокала вина» — похожий кадр */
  const auditJson = path.join(tmp, 'audit.json');
  let r = M('audit', path.join(site, 'src', 'photo-map.json'), '--out', auditJson);
  let A = null; try { A = JSON.parse(fs.readFileSync(auditJson, 'utf8')); } catch { /* нет протокола */ }
  const line = (re) => (A ? A.lines.find((l) => re.test(l.what)) : null);
  check('audit', 'папка сайта найдена сама (src/ → public/), 10 файлов из 11', /нашлось 10 из 11/.test(r.out), r.out.split('\n').slice(0, 3).join(' | '));
  check('audit', 'NC — FAIL, код 1', r.code === 1 && A && A.verdict === 'FAIL' && line(/^NC или ND/)?.items.length === 1, `код ${r.code}`);
  check('audit', 'CC BY и BY-SA — подпись обязательна: 2, автор не установлен у 1', !!line(/подпись обязательна.*: 2, из них автор не установлен у 1/));
  check('audit', "марки: Nando's (Commons) и Aperol", (() => { const l = line(/^марка/); return l && l.items.length === 2 && l.items.some((x) => /Nando/.test(x)) && l.items.some((x) => /Aperol/.test(x)); })());
  check('audit', 'один кадр Pexels под двумя файлами (адрес со / и без)', !!(A && A.groups.sameSource.length === 1 && A.groups.sameSource[0].key === 'pexels:14965205' && A.groups.sameSource[0].files.length === 2));
  check('audit', 'одинаковые файлы (sha256): чай и улун', !!(A && A.groups.sameFile.length === 1 && A.groups.sameFile[0].files.every((f) => /dish-(chay|ulun)/.test(f))));
  check('audit', 'без лицензии — суп; нет файла — салат', !!(line(/лицензия не указана/)?.items.some((x) => /Суп/.test(x)) && line(/^нет файла/)?.items.some((x) => /net-fayla/.test(x))));
  check('audit', 'похожий кадр (dHash): суп ≈ бокал вина', !!(A && A.groups.similar.some((x) => /dish-sup/.test(`${x.a}${x.b}`) && /bokal-vina/.test(`${x.a}${x.b}`))));
  check('audit', 'Commons отмечен: 3', !!line(/^Commons: 3/));
  r = M('audit', path.join(site, 'src', 'photo-map.json'), '--sources', 'pexels');
  check('audit', '--sources pexels: Commons и Flickr — FAIL (4)', r.code === 1 && /не из разрешённых источников \(--sources pexels\): 4/.test(r.out), r.out.slice(-400));
  r = M('audit', '--map', path.join(site, 'src', 'photo-map.json'), '--root', path.join(site, 'public'));
  check('audit', '--map и --root работают так же', /нашлось 10 из 11/.test(r.out) && !/найдена сама/.test(r.out), r.out.split('\n').slice(0, 3).join(' | '));

  /* ---------- точный режим: import локального файла (без сети) ---------- */
  const PAGE = 'https://www.pexels.com/photo/red-wine-in-glass-14965205/';
  const src = path.join(tmp, 'src-tall.jpg'); fs.writeFileSync(src, await noise(sharp, 1200, 1800, 21));
  const small = path.join(tmp, 'src-small.jpg'); fs.writeFileSync(small, await noise(sharp, 600, 400, 22));
  const wide = path.join(tmp, 'src-wide.jpg'); fs.writeFileSync(wide, await noise(sharp, 2400, 1600, 23));
  const gate = ['--license', 'pexels', '--seen', 'бокал красного вина на тёмном фоне', '--caption', 'Бокал вина'];
  const dest = path.join(tmp, 'site', 'photos');
  r = M('import', PAGE, src, ...gate, '--size', '1000x700', '--thumb', '360x360', '--name', 'dish-bokal-vina.jpg', '--quality', '80', '--dest', dest, '--src-prefix', '/assets/img/photos/');
  check('size', 'кадр 1000x700 и превью thumb/ 360x360 под точным именем', r.code === 0 && await dims(path.join(dest, 'dish-bokal-vina.jpg')) === '1000x700' && await dims(path.join(dest, 'thumb', 'dish-bokal-vina.jpg')) === '360x360', r.out.slice(-500));
  check('size', 'q80 у кадра, q76 у превью, «новый файл», один <img>', /1000x700\s+\d+ КБ q80\s+новый файл/.test(r.out) && /360x360\s+\d+ КБ q76/.test(r.out) && /<img src="\/assets\/img\/photos\/dish-bokal-vina\.jpg" width="1000" height="700"/.test(r.out), r.out.slice(0, 600));
  check('size', 'строка для карты фото проекта', /для карты фото проекта: \{"file":"\/assets\/img\/photos\/dish-bokal-vina\.jpg"/.test(r.out));
  r = M('import', PAGE, src, ...gate, '--size', '1000x700', '--thumb', '360x360', '--name', 'dish-bokal-vina.jpg', '--dest', dest, '--focus', 'north');
  const recOf = (d, name) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'credits.json'), 'utf8')).find((x) => x.name === name); } catch { return null; } };
  const rb = recOf(dest, 'dish-bokal-vina.jpg');
  check('size', 'повтор — «заменён (был 1000x700…)», в credits.json фокус north и «кадрировано до 1000x700»', r.code === 0 && /заменён \(был 1000x700/.test(r.out) && rb?.exact?.focus === 'north' && /кадрировано до 1000x700 \(фокус north\)/.test(rb?.changes || ''), `${r.out.slice(0, 300)} | ${JSON.stringify(rb?.exact)}`);
  r = M('import', PAGE, src, ...gate, '--size', '1000x700', '--name', 'dish-turnir', '--dest', dest);
  check('повтор', 'та же страница под другим именем — WARN «кадр уже использован как dish-bokal-vina.jpg»', /кадр уже использован как dish-bokal-vina\.jpg \(credits\.json\)/.test(r.out) && /^WARN/m.test(r.out) && fs.existsSync(path.join(dest, 'dish-turnir.jpg')), r.out.slice(-600));
  /* credits.json проекта в своём виде: не трогается, учёт — в credits-media.json; повтор ищется и в нём */
  const dest2 = path.join(tmp, 'site2', 'photos'); fs.mkdirSync(dest2, { recursive: true });
  const foreign = JSON.stringify({ '/assets/img/photos/dish-staryy.jpg': { text: 'Jyoti Rana · Pexels', page: PAGE } }, null, 2);
  fs.writeFileSync(path.join(dest2, 'credits.json'), foreign);
  r = M('import', PAGE, src, ...gate, '--size', '1000x700', '--name', 'dish-novyy.jpg', '--dest', dest2);
  const side = (() => { try { return JSON.parse(fs.readFileSync(path.join(dest2, 'credits-media.json'), 'utf8')); } catch { return null; } })();
  check('credits', 'credits.json проекта не тронут, запись — в credits-media.json', fs.readFileSync(path.join(dest2, 'credits.json'), 'utf8') === foreign && Array.isArray(side) && side[0]?.name === 'dish-novyy.jpg', r.out.slice(-500));
  check('credits', 'повтор найден и в credits.json проекта (по странице)', /кадр уже использован как dish-staryy\.jpg \(credits\.json\)/.test(r.out), r.out.slice(-500));
  r = M('credits', dest2);
  check('credits', 'credits читает credits-media.json рядом с учётом проекта', r.code === 0 && /dish-novyy\.jpg/.test(r.out), r.out.slice(0, 300));
  r = M('import', PAGE, small, ...gate, '--size', '1000x700', '--name', 'dish-malo.jpg', '--dest', dest);
  check('size', 'исходник 600x400 меньше 1000x700 — не растягиваем: 571x400 той же пропорции и замечание', /не растягиваем/.test(r.out) && await dims(path.join(dest, 'dish-malo.jpg')) === '571x400', r.out.slice(-500));

  /* ---------- --need ---------- */
  r = M('import', PAGE, wide, ...gate, '--role', 'hero', '--name', 'hero-need', '--need', '1800', '--avif', 'off', '--dest', path.join(tmp, 'site3'));
  check('need', 'hero 2400 px при --need 1800 — без «нужно 3840», OK', r.code === 0 && !/нужно 3840/.test(r.out) && /^OK: кадр готов/m.test(r.out), r.out.slice(-400));
  r = M('import', PAGE, wide, ...gate, '--role', 'hero', '--name', 'hero-noneed', '--avif', 'off', '--dest', path.join(tmp, 'site3'));
  check('need', 'без --need — прежнее замечание «для роли hero нужно 3840» с подсказкой --need', /для роли hero нужно 3840 — не растягиваем \(сайту нужно меньше — --need/.test(r.out), r.out.slice(-400));
  r = M('import', PAGE, wide, ...gate, '--role', 'card', '--name', 'card-need', '--need', '1800', '--avif', 'off', '--dest', path.join(tmp, 'site3'));
  check('need', 'card с --need 1800 больше верха роли (1280) — верхняя ступень 1800', /card-need-1800\.webp\s+1800x1200/.test(r.out), r.out.slice(0, 500));

  /* ---------- ворота флагов (код 2, ничего не пишется) ---------- */
  const bad = [
    [['--thumb', '360x360'], '--thumb без --size'],
    [['--size', '1000x700', '--ratio', '16:9'], '--size с --ratio'],
    [['--size', '1000x700', '--format', 'png'], '--format png'],
    [['--size', '1000x700', '--name', 'x.png'], '--name с расширением .png'],
    [['--size', '10x7'], '--size меньше 16 px'],
    [['--size', '1000x700', '--src-prefix', 'C:/Program Files/Git/assets/img/'], '--src-prefix — путь диска (Git Bash)'],
    [['--focus', 'middle'], '--focus middle'],
  ];
  for (const [args, what] of bad) { r = M('import', PAGE, src, ...gate, '--dest', path.join(tmp, 'bad'), ...args); check('флаги', `${what} — код 2`, r.code === 2, `код ${r.code}: ${r.out.slice(0, 200)}`); }
  check('флаги', 'после отказов папка не создана', !fs.existsSync(path.join(tmp, 'bad')));

  const failed = results.filter((x) => !x).length;
  log(`\n${failed ? 'FAIL' : 'OK'}: проверок ${results.length}, не прошло ${failed}${opt.out ? ` · стенд: ${tmp}` : ''}`);
  if (!opt.out) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* останется во временной папке */ } }
  return failed ? 1 : 0;
}
