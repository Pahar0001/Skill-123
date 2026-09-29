#!/usr/bin/env node
/**
 * Стенды lib.mjs (у lib нет своей строки запуска — проверка здесь):
 *   node scripts/fixtures/lib/selftest.mjs [--out папка] [--only имя,имя] [--no-shots]
 *
 * Один браузер за раз: сначала случаи lib в одной вкладке за другой, потом (без --no-shots) два запуска
 * shots.mjs по стенду sticky-seams.html и запуск discover.mjs по стенду ../discover/site — каждый своим
 * процессом, по очереди.
 * Случаи:
 *   segments   segmentPositions: 6 снимков на 6942 px — без cover дыры, с cover — без дыр
 *   overflow   findOverflow на overflow-cut.html (320): fieldCut select#selCut и input#inpCut, clipCut у метки
 *              в <dialog>, у пилюли во флекс-строке окна (метка вылезла из строки) и у кнопки; контроль —
 *              многоточие, sr-only, лента, карусель, лента пилюль, дорожка transform, бегущая строка молчат
 *   modal      checkOpenModal: окно выбора города через 1,5 с (крестик скрыт — предложен пункт списка), видимый
 *              крестик (?close=1) — предложен он, <dialog> с «Закрыть», страница без окон — тихо
 *   dismiss    SITE_REWORK_DISMISS: пункт списка — нажато, окна нет; скрытый крестик — «найдено, но скрыто»;
 *              нет такого — «не найдено за 5 с от начала загрузки»; второй вызов в том же документе ничего не жмёт
 *   seams      fullPageShot segments: шапка, липкая лента, нижняя панель и вкладка — по одному разу (pins),
 *              без pins — шапка на каждом шве; scale 1 на экране ×2 — файл 390 px; scrollThrough по умолчанию
 *              снимает окна без дыр (maxShots 2 — столько, сколько нужно), с cover:false — дыры в gaps
 *   shots      shots.mjs --light (первый экран и вся страница, без снимков окна и возвратов) и обычный
 *              (экраны по умолчанию desktop,mobile, снимки окна без дыр, *-full.png ×1 у обоих экранов);
 *              stale-noise.html: шум пересэмплирования в фото — OK с пометкой, сдвиг кадра (?shift=1) — WARN
 *   discover   discover.mjs --pages-shots 2: /dinners и /dinners/* — два файла (dinners.png, dinners-item.png);
 *              гарнитура заголовков на div и навигации в div-шапке — по замеру (не «null»); строка «окна при
 *              загрузке» есть и без SITE_REWORK_DISMISS
 * Код выхода: 0 — все случаи сошлись, 1 — нет.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  launch, openPage, preparePage, gotoRetry, resolveViewport, findOverflow, fullPageShot, segmentPositions, scrollThrough, checkOpenModal,
  applyDismiss, collectWarnings, takeWarnings, collectNotes, takeNotes, loadSharp, sleep, parseArgs, readJson,
} from '../../lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { opt } = parseArgs(process.argv.slice(2), { values: ['out', 'only'], flags: ['no-shots', 'help', 'h'], strict: true });
if (opt.help || opt.h) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '')); process.exit(0); }
const out = opt.out ? path.resolve(String(opt.out)) : fs.mkdtempSync(path.join(os.tmpdir(), 'rw-lib-selftest-'));
fs.mkdirSync(out, { recursive: true });
const only = opt.only ? new Set(String(opt.only).split(',').map((s) => s.trim())) : null;
const want = (k) => !only || only.has(k);
const fx = (f, q = '') => pathToFileURL(path.join(here, f)).href + q;
collectWarnings(); collectNotes();
let bad = 0, good = 0;
const check = (name, ok, got) => { if (ok) good++; else bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` — получено: ${String(got).slice(0, 400)}`}`); };

/* ---------- segments: чистая функция ---------- */
if (want('segments')) {
  const gapsOf = (ys, total, vh, skipTop) => { const g = []; let end = skipTop ? vh : 0; for (const y of ys) { if (y > end + 1) g.push([end, y]); end = Math.max(end, y + vh); } if (end < total - 1) g.push([end, total]); return g; };
  const old = segmentPositions(6942, 844, { maxShots: 6 });
  check('segments: без cover 6 снимков на 6942 px — с дырами (как runtime 29.09)', gapsOf(old, 6942, 844, false).length > 0, old);
  const cov = segmentPositions(6942, 844, { maxShots: 6, cover: true });
  check('segments: cover — без дыр', !gapsOf(cov, 6942, 844, false).length, cov);
  const covTop = segmentPositions(6942, 844, { maxShots: Infinity, skipTop: true, cover: true });
  check('segments: cover + skipTop — без дыр от первого экрана', !gapsOf(covTop, 6942, 844, true).length, covTop);
  const tex = segmentPositions(6942, 844, { step: 1, maxShots: 3 });
  check('segments: выборка без cover (texture) — прежние 3 точки', tex.length === 3 && tex[0] === 0 && tex[2] === 6098, tex);
}

const needBrowser = ['overflow', 'modal', 'dismiss', 'seams'].some(want);
if (needBrowser) {
  const browser = await launch();
  const open = async (url, vpName, o = {}) => { const [, vp] = resolveViewport(vpName); return openPage(browser, url, vp, o); };
  try {
    /* ---------- overflow ---------- */
    if (want('overflow')) {
      delete process.env.SITE_REWORK_DISMISS;
      const page = await open(fx('overflow-cut.html', '?dialog=1'), 'mobile-s', { settle: 500, modalCheck: false });
      const r = await findOverflow(page);
      const fc = r.fieldCut.map((x) => x.sig); const cc = r.clipCut.map((x) => x.sig);
      check('overflow: select#selCut — текст не влез в поле', fc.includes('select#selCut'), JSON.stringify(r.fieldCut));
      check('overflow: input#inpCut — подсказка не влезла', fc.includes('input#inpCut'), JSON.stringify(r.fieldCut));
      check('overflow: select#selOk — молчит', !fc.includes('select#selOk'), JSON.stringify(r.fieldCut));
      check('overflow: метка nowrap в <dialog> — текст обрезан', cc.includes('div.tag'), JSON.stringify(r.clipCut));
      check('overflow: кнопка overflow:hidden режет подпись — текст обрезан', cc.some((s) => s.startsWith('a.btn')), JSON.stringify(r.clipCut));
      const pill = r.clipCut.find((x) => x.sig === 'span.pill' && /dlg/.test(x.clip) && /Пирамида/.test(x.text));
      check('overflow: пилюля nowrap во флекс-строке <dialog> вылезла из строки — текст обрезан (метка)', !!pill && pill.how === 'метка', JSON.stringify(r.clipCut));
      const pillCol = r.clipCut.find((x) => x.sig === 'span.pill' && /dlg/.test(x.clip) && /Октава/.test(x.text));
      check('overflow: строка пилюль шире флекс-колонки (align-items:flex-start) — текст обрезан (метка)', !!pillCol && pillCol.how === 'метка', JSON.stringify(r.clipCut));
      const extra = r.clipCut.filter((x) => !(x.sig === 'div.tag' || x.sig.startsWith('a.btn') || (x.sig === 'span.pill' && /dlg/.test(x.clip))));
      check('overflow: многоточие, sr-only, лента, карусель (и пилюля в карточке), лента пилюль overflow:hidden, дорожка transform, бегущая строка — молчат', !extra.length, JSON.stringify(extra));
      check('overflow: вердикт WARN (не FAIL), в сводке «текст обрезан» и «не влез в поле»', r.verdict === 'WARN' && /текст обрезан/.test(r.summary) && /не влез в поле/.test(r.summary), `${r.verdict} ${r.summary}`);
      await page.close();
      const p2 = await open(fx('overflow-cut.html'), 'mobile-s', { settle: 500, modalCheck: false });
      const r2 = await findOverflow(p2);
      check('overflow: окно закрыто — метки диалога в счёте нет', !r2.clipCut.some((x) => x.sig === 'div.tag' || /dlg/.test(x.clip)), JSON.stringify(r2.clipCut));
      await p2.close();
      takeWarnings(); takeNotes();
    }
    /* ---------- modal ---------- */
    if (want('modal')) {
      delete process.env.SITE_REWORK_DISMISS;
      let page = await open(fx('modal-city.html'), 'desktop');
      let m = page.overlay.modal; let w = takeWarnings();
      check('modal: окно выбора города найдено', !!m && m.how === 'fancybox', JSON.stringify(m));
      check('modal: крестик скрыт — предложен пункт списка', !!m && m.suggest === '.fancybox-container li.style-listing-items__item' && m.close && !m.close.visible && /display:none/.test(m.close.why), JSON.stringify(m));
      check('modal: WARN «на странице открыто окно … SITE_REWORK_DISMISS=…»', w.some((x) => /на странице открыто окно/.test(x) && x.includes('SITE_REWORK_DISMISS=".fancybox-container li.style-listing-items__item"')), w.join(' | '));
      await page.close();
      page = await open(fx('modal-city.html', '?close=1'), 'desktop'); m = page.overlay.modal; takeWarnings();
      check('modal: видимый крестик — предложен он', !!m && m.suggest === '.fancybox-container button.fancybox-close-small', JSON.stringify(m));
      await page.close();
      page = await open(fx('overflow-cut.html', '?dialog=1'), 'mobile-s'); m = page.overlay.modal; takeWarnings();
      check('modal: <dialog> с «Закрыть» — предложена кнопка', !!m && m.how === 'dialog' && m.suggest === '#dlg button', JSON.stringify(m));
      await page.close();
      page = await open(fx('no-modal.html'), 'desktop'); m = page.overlay.modal; w = takeWarnings();
      check('modal: шапка, зерно, фон, чат, закрытый dialog — окна нет', !m && !w.some((x) => /открыто окно/.test(x)), JSON.stringify(m) + ' ' + w.join(' | '));
      await page.close();
      takeNotes();
    }
    /* ---------- dismiss ---------- */
    if (want('dismiss')) {
      process.env.SITE_REWORK_DISMISS = '.fancybox-container .fancybox-close-small';
      let t0 = Date.now(); let page = await open(fx('modal-city.html'), 'desktop'); let d = page.overlay.dismiss || []; let w = takeWarnings();
      check('dismiss: скрытый крестик — «найдено, но скрыто (display:none)»', d[0] && d[0].status === 'скрыто' && /display:none/.test(d[0].why), JSON.stringify(d));
      check('dismiss: WARN про скрытое и окно осталось', w.some((x) => /найдено, но скрыто/.test(x)) && w.some((x) => /открыто окно/.test(x) && /не закрыл/.test(x)), w.join(' | '));
      check('dismiss: ждали появления до 5 с от начала загрузки', d[0] && d[0].sinceLoadMs >= 4900, `${d[0] && d[0].sinceLoadMs} мс от начала загрузки, ${d[0] && d[0].waitedMs} мс ожидания, всего ${Date.now() - t0}`);
      await page.close();
      process.env.SITE_REWORK_DISMISS = '.fancybox-container li.style-listing-items__item';
      page = await open(fx('modal-city.html'), 'desktop'); d = page.overlay.dismiss || []; w = takeWarnings(); let n = takeNotes();
      check('dismiss: пункт списка — нажато, исчезло', d[0] && d[0].status === 'нажато' && d[0].gone && !page.overlay.modal, JSON.stringify(d) + JSON.stringify(page.overlay.modal));
      check('dismiss: INFO «нажато», без WARN', n.some((x) => /нажато li\.style-listing-items__item/.test(x)) && !w.length, `${n.join(' | ')} / ${w.join(' | ')}`);
      const again = await applyDismiss(page);
      check('dismiss: второй вызов в том же документе — прежний итог, без нового поиска', again === page.rwDismiss.list && !takeNotes().length, JSON.stringify(again));
      await page.close();
      /* выбор запомнен (окна больше нет), страница грузилась долго: ждать до 5 с от начала загрузки, а не 5 с от вызова */
      {
        const [, vp] = resolveViewport('desktop'); const p3 = await preparePage(browser, vp);
        await gotoRetry(p3, fx('no-modal.html')); await sleep(3000);
        const d3 = await applyDismiss(p3); const w3 = takeWarnings(); const n3 = takeNotes();
        check('dismiss: выбор запомнен — INFO «не появилось», без WARN', d3[0] && d3[0].remembered && !w3.length && n3.some((x) => /не появилось за 5,\d с от начала загрузки/.test(x)), JSON.stringify(d3) + ' ' + w3.join(' | ') + ' / ' + n3.join(' | '));
        check('dismiss: ожидание — до 5 с от начала загрузки (после 3 с загрузки — меньше 3 с)', d3[0] && d3[0].waitedMs < 3000 && d3[0].sinceLoadMs >= 4900, JSON.stringify(d3));
        await p3.close();
      }
      process.env.SITE_REWORK_DISMISS = '.nope';
      t0 = Date.now(); page = await open(fx('no-modal.html'), 'desktop'); d = page.overlay.dismiss || []; w = takeWarnings();
      check('dismiss: нет такого — «не найдено за 5 с от начала загрузки» и WARN', d[0] && d[0].status === 'не найдено' && w.some((x) => /не найдено за 5,\d с от начала загрузки/.test(x)), JSON.stringify(d) + ' ' + w.join(' | '));
      await page.close();
      delete process.env.SITE_REWORK_DISMISS; takeNotes();
    }
    /* ---------- seams ---------- */
    if (want('seams')) {
      const sharp = loadSharp();
      if (!sharp) check('seams: нужен sharp', false, 'sharp не найден');
      else {
        const rows = async (file, x, rgb) => {
          const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          const xs = Math.round(x < 0 ? info.width + x : x); let n = 0;
          for (let y = 0; y < info.height; y++) { const i = (y * info.width + xs) * 3; if (Math.abs(data[i] - rgb[0]) <= 28 && Math.abs(data[i + 1] - rgb[1]) <= 28 && Math.abs(data[i + 2] - rgb[2]) <= 28) n++; }
          return { n, h: info.height, w: info.width };
        };
        const HDR = [255, 0, 170], RIB = [0, 200, 255], BAR = [51, 170, 51], TAB = [255, 170, 0];
        let page = await open(fx('sticky-seams.html'), 'desktop', { settle: 500 });
        const f1 = path.join(out, 'seams-pins.png'); await fullPageShot(page, f1, { mode: 'segments' });
        const f0 = path.join(out, 'seams-nopins.png'); await fullPageShot(page, f0, { mode: 'segments', pins: false });
        const h1 = await rows(f1, 4, HDR), r1 = await rows(f1, 4, RIB), b1 = await rows(f1, 4, BAR), t1 = await rows(f1, -10, TAB);
        const h0 = await rows(f0, 4, HDR);
        check(`seams: шапка один раз (${h1.n} строк из ${h1.h})`, h1.n >= 55 && h1.n <= 65, h1.n);
        check(`seams: липкая лента один раз (${r1.n})`, r1.n >= 36 && r1.n <= 44, r1.n);
        check(`seams: нижняя панель один раз (${b1.n})`, b1.n >= 45 && b1.n <= 55, b1.n);
        check(`seams: вкладка один раз (${t1.n})`, t1.n >= 110 && t1.n <= 130, t1.n);
        check(`seams: без pins шапка на каждом шве (${h0.n}) — стенд различает`, h0.n >= 180, h0.n);
        /* scrollThrough по умолчанию без дыр (runtime --scroll зовёт с maxShots 6): maxShots 2 — снимков столько, сколько нужно */
        const cov = await scrollThrough(page, { shotsDir: path.join(out, 'cover'), tag: 'cov', maxShots: 2, shotPause: 200, waitMedia: false, pause: 100 });
        check(`scrollThrough: по умолчанию без дыр — maxShots 2, снято ${cov.shots.length} на ${cov.pageHeight} px`, cov.shots.length > 2 && Array.isArray(cov.gaps) && !cov.gaps.length, JSON.stringify({ n: cov.shots.length, gaps: cov.gaps, ys: cov.shots.map((s) => s.scrollY) }));
        const cov0 = await scrollThrough(page, { shotsDir: path.join(out, 'cover'), tag: 'cov0', maxShots: 2, shotPause: 200, waitMedia: false, pause: 100, cover: false });
        check(`scrollThrough: cover false — не больше maxShots, дыры в gaps (${cov0.gaps.length})`, cov0.shots.length === 2 && cov0.gaps.length > 0, JSON.stringify({ n: cov0.shots.length, gaps: cov0.gaps }));
        await page.close();
        page = await open(fx('sticky-seams.html'), 'mobile', { settle: 500 });
        const f2 = path.join(out, 'seams-mobile-x1.png'); const how = await fullPageShot(page, f2, { mode: 'segments', scale: 1 });
        const m2 = await sharp(f2).metadata();
        check(`seams: scale 1 на экране ×2 — ширина 390 (${how}, ${m2.width}×${m2.height}, rwFullScale ${page.rwFullScale})`, m2.width === 390 && page.rwFullScale === 1, `${m2.width}`);
        const f3 = path.join(out, 'seams-mobile-auto.png'); await fullPageShot(page, f3, { scale: 1 });
        const m3 = await sharp(f3).metadata();
        check(`seams: scale 1 одним кадром — ширина 390 (${m3.width}×${m3.height})`, m3.width === 390, `${m3.width}`);
        await page.close();
      }
    }
  } finally { await browser.close().catch(() => {}); }
}

/* ---------- shots.mjs: --light и обычный запуск ---------- */
if (want('shots') && !opt['no-shots']) {
  const shots = path.join(here, '..', '..', 'shots.mjs');
  const run = (args) => spawnSync(process.execPath, [shots, fx('sticky-seams.html'), '--out', out, ...args], { encoding: 'utf8', timeout: 600000, env: { ...process.env, SITE_REWORK_DISMISS: '' } });
  let r = run(['--tag', 'light', '--light']);
  const dirL = path.join(out, 'light'); const listL = fs.existsSync(dirL) ? fs.readdirSync(dirL) : [];
  const jL = readJson(path.join(dirL, 'shots.json'), {});
  check('shots --light: код 0', r.status === 0, `${r.status} ${(r.stderr || '').slice(-300)} ${(r.stdout || '').slice(-300)}`);
  check('shots --light: только first и full на экран, без scroll-NN и first-return', listL.filter((f) => /\.png$/.test(f)).every((f) => /-(first|full)\.png$/.test(f)) && listL.some((f) => /-full\.png$/.test(f)), listL.join(', '));
  check('shots --light: экраны по умолчанию desktop и mobile, без tablet', JSON.stringify([...new Set((jL.shots || []).map((s) => s.viewport))]) === '["desktop","mobile"]', JSON.stringify((jL.shots || []).map((s) => s.viewport)));
  r = run(['--tag', 'full', '--return', 'none', '--viewports', 'desktop,mobile']);
  const jF = readJson(path.join(out, 'full', 'shots.json'), {});
  const sc = (jF.shots || []).map((s) => ({ vp: s.viewport, gaps: s.scroll && s.scroll.gaps, n: (s.segments || []).length }));
  check('shots: код 0', r.status === 0, `${r.status} ${(r.stdout || '').slice(-400)}`);
  check('shots: снимки окна без дыр (gaps пусто)', sc.length === 2 && sc.every((s) => Array.isArray(s.gaps) && !s.gaps.length && s.n > 0), JSON.stringify(sc));
  const fullScales = Object.entries(jF.files || {}).filter(([f]) => /-full\.png$/.test(f)).map(([f, v]) => `${f}:${v.scale}`);
  check('shots: *-full.png ×1 на обоих экранах', fullScales.length === 2 && fullScales.every((x) => x.endsWith(':1')), fullScales.join(', '));
  check('shots: в строке страницы масштаб «×1»', /вся страница — segments ×1/.test(r.stdout || ''), (r.stdout || '').slice(0, 600));
  check('shots: итог «Окна при загрузке» — и без SITE_REWORK_DISMISS', /^Окна при загрузке: SITE_REWORK_DISMISS не задана · открытое окно: нет$/m.test(r.stdout || '') && jF.windows && jF.windows.dismiss === null, (r.stdout || '').slice(-400));
  /* шум пересэмплирования в фото — не WARN; плотное отличие в фото без причины по стилям — WARN */
  const runN = (q, tag) => spawnSync(process.execPath, [shots, fx('stale-noise.html', q), '--out', out, '--tag', tag, '--viewports', 'desktop', '--segments', '0', '--return', 'jump'], { encoding: 'utf8', timeout: 600000, env: { ...process.env, SITE_REWORK_DISMISS: '' } });
  r = runN('', 'noise');
  check('shots: шум пересэмплирования в фото — OK с пометкой, без WARN', r.status === 0 && /OK\s+первый экран после прокрутки до низа и прыжка наверх тот же \(шум пересэмплирования в фото img\.ph/.test(r.stdout || '') && /^OK: 0 провалов, 0 предупреждений/m.test(r.stdout || ''), (r.stdout || '').slice(-600));
  r = runN('?shift=1', 'noise-shift');
  check('shots: сдвиг кадра в фото (плотное отличие) — WARN «отличается», не шум', /WARN первый экран после прокрутки до низа и прыжка наверх отличается/.test(r.stdout || '') && !/шум пересэмплирования/.test(r.stdout || ''), (r.stdout || '').slice(-600));
}

/* ---------- discover.mjs: снимки типов страниц и гарнитуры по замеру ---------- */
if (want('discover') && !opt['no-shots']) {
  const disc = path.join(here, '..', '..', 'discover.mjs');
  const site = pathToFileURL(path.join(here, '..', 'discover', 'site', 'index.html')).href;
  const dOut = path.join(out, 'discover');
  const r = spawnSync(process.execPath, [disc, site, '--out', dOut, '--viewports', 'desktop', '--pages-shots', '2', '--no-320', '--no-design', '--light', '--no-texture'], { encoding: 'utf8', timeout: 600000, env: { ...process.env, SITE_REWORK_DISMISS: '' } });
  check('discover: код 0', r.status === 0, `${r.status} ${(r.stderr || '').slice(-300)} ${(r.stdout || '').slice(-300)}`);
  const pages = fs.existsSync(path.join(dOut, 'pages')) ? fs.readdirSync(path.join(dOut, 'pages')).sort() : [];
  check('discover: /dinners и /dinners/* — два файла, dinners.png и dinners-item.png', JSON.stringify(pages) === '["dinners-item.png","dinners.png"]', pages.join(', '));
  const md = fs.existsSync(path.join(dOut, 'discovery.md')) ? fs.readFileSync(path.join(dOut, 'discovery.md'), 'utf8') : '';
  const fonts = (md.match(/^- шрифты: .*$/m) || [''])[0];
  check('discover: гарнитура заголовков — по замеру «Georgia», не «null»', /заголовки «Georgia»/.test(fonts) && !/«null»/.test(fonts), fonts.slice(0, 300));
  check('discover: гарнитура навигации (div-шапка) — «Courier New»', /навигация «Courier New»/.test(fonts), fonts.slice(0, 300));
  check('discover: строка «окна при загрузке» — и без SITE_REWORK_DISMISS', /^- окна при загрузке: SITE_REWORK_DISMISS не задана · открытое окно: нет$/m.test(md), (md.match(/^- окна при загрузке.*$/m) || ['нет строки'])[0]);
}

console.log(`\n${bad ? 'FAIL' : 'OK'}: сошлось ${good}, не сошлось ${bad} · файлы ${out}`);
process.exit(bad ? 1 : 0);
