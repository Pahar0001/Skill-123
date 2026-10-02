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
 *              в <dialog>, у пилюли во флекс-строке окна (метка вылезла из строки), у кнопки и у гигантского слова
 *              без aria-hidden; контроль — многоточие, sr-only, лента, карусель, лента пилюль, дорожка transform,
 *              бегущая строка молчат; декор (слово навылет и слово-фон с aria-hidden, role=presentation) и поля-ловушки
 *              для ботов — не находка (демо coffee .shout, 29.09); decor-edge.html — декор за краем экрана не FAIL,
 *              такой же блок без aria-hidden — FAIL; decor-real.html (и ?plain=1) — настоящий текст в разметке декора:
 *              заголовок, разбитый на слова (aria-label у заголовка, aria-hidden у слов — GSAP SplitText), за краем
 *              экрана (FAIL) и обрезан в карточке, надпись со слогами под aria-hidden и sr-only копией обрезана, меню
 *              WAI-ARIA (li role=none > a) обрезано; слова-фон рядом с заголовком того же смысла — молчат (скептик 30.09);
 *              findOverflow({ coveredBy: true }) на ../runtime/covered.html — «текст перекрыт соседним блоком»: восемь
 *              находок со сверкой снимком, слои по замыслу молчат, прежние поля и вердикт те же, страница возвращена как
 *              была; без coveredBy новых полей нет; предел по числу строк на странице из 8200 узлов текста;
 *              ../runtime/covered2.html — правило после независимой проверки 02.10: слово окна в классе кнопки, ссылки и
 *              блока в потоке, пустая плашка по размеру текста, плашка между точками строки — находки; колода карточек,
 *              «Показать полностью», окно по слову в классе, перевёртыш — молчат; ../runtime/covered-side.html —
 *              проверка не оставляет следов: атрибут style до и после строка в строку, записей MutationObserver и
 *              событий transition* нет, идущий переход цвета не оборван
 *   modal      checkOpenModal: окно выбора города через 1,5 с (крестик скрыт — предложен пункт списка; ждали из-за
 *              признаков окна), видимый крестик (?close=1) — предложен он, <dialog> с «Закрыть», страница без окон —
 *              тихо и без ожидания 2 с; не окно — закреплённый первый экран, половина экрана «пополам», страница в
 *              закреплённом контейнере прокрутки, непрозрачный слой без запертой прокрутки, закреплённый первый экран
 *              на странице, которую прокручивает сам body (body-scroller.html); окно — полупрозрачная подложка поверх
 *              страницы, слой при запертой прокрутке (и body-scroller.html?lock=1), блок с классом popup; WARN с видом «окно»
 *   dismiss    SITE_REWORK_DISMISS: пункт списка — нажато, окна нет; скрытый крестик — «найдено, но скрыто»;
 *              нет такого — «не найдено за 5 с от начала загрузки»; второй вызов в том же документе ничего не жмёт;
 *              нажатие увело на главную — нужная страница открыта заново (INFO), окно вернулось — WARN «сайт не
 *              запомнил выбор», страница снова уводит — WARN «замер не той страницы» и page.rwWrongPage; шумная главная
 *              (?noisy=1) — в журнале нужной страницы нет её консоли, исключения и упавшей картинки (dropped); окно
 *              ушло, а увело через 0,4 с (?late=1) — замечено; перезагрузка той же страницы (?reload=1) — открыта заново
 *   dismiss-ff то же в Firefox на file:// (?noisy=1): переход замечен по метке документа, мерится нужная страница, журнал
 *              без шума главной; нет Firefox — пропуск
 *   seams      fullPageShot segments: шапка, липкая лента, нижняя панель и вкладка — по одному разу (pins),
 *              без pins — шапка на каждом шве; рельс fixed и колонка sticky на всю высоту окна — на всей высоте
 *              склейки, вкладка и «наверх» — один раз, значок, появившийся после прокрутки, — один раз;
 *              scale 1 на экране ×2 — файл 390 px; scrollThrough по умолчанию снимает окна без дыр (maxShots 2 —
 *              столько, сколько нужно), с cover:false — дыры в gaps
 *   shots      shots.mjs --light (первый экран и вся страница, без снимков окна и возвратов) и обычный
 *              (экраны по умолчанию desktop,mobile, снимки окна без дыр, *-full.png ×1 у обоих экранов);
 *              stale-noise.html: шум пересэмплирования в фото — OK с пометкой, сдвиг кадра (?shift=1) — WARN;
 *              SITE_REWORK_DISMISS увёл на шумную главную (dismiss-nav.html?noisy=1) — ошибок консоли 0, dropped
 *   discover   discover.mjs --pages-shots 2: /dinners и /dinners/* — два файла (dinners.png, dinners-item.png);
 *              гарнитура заголовков на div и навигации в div-шапке — по замеру (не «null»); строка «окна при
 *              загрузке» есть и без SITE_REWORK_DISMISS; увело на шумную главную — в сводке консоли 0 ошибок
 * Код выхода: 0 — все случаи сошлись, 1 — нет.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  launch, openPage, preparePage, gotoRetry, resolveViewport, findOverflow, fullPageShot, segmentPositions, scrollThrough, checkOpenModal,
  applyDismiss, collectWarnings, takeWarnings, collectNotes, takeNotes, loadSharp, sleep, parseArgs, readJson, warningKind, warningLabel,
  findBrowser,
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
      check('overflow: гигантское слово навылет без aria-hidden — текст обрезан (контроль: проверка жива)', r.clipCut.some((x) => x.sig === 'b.loud' && /shout/.test(x.clip)), JSON.stringify(r.clipCut));
      const extra = r.clipCut.filter((x) => !(x.sig === 'div.tag' || x.sig.startsWith('a.btn') || (x.sig === 'span.pill' && /dlg/.test(x.clip)) || x.sig === 'b.loud'));
      check('overflow: многоточие, sr-only, лента, карусель (и пилюля в карточке), лента пилюль overflow:hidden, дорожка transform, бегущая строка, декор — молчат', !extra.length, JSON.stringify(extra));
      /* декор и ловушки: демо coffee .shout (aria-hidden, overflow:hidden, nowrap) давал ложный WARN «текст обрезан» */
      const decoTw = r.textWider.filter((x) => /deco-p|narrow/.test(x.sig) || /Неразрывнаядекоративная/.test(x.text));
      check('overflow: декор — слово навылет и слово-фон с aria-hidden, role=presentation шире коробки — не находка', !decoTw.length && !r.clipCut.some((x) => /Эпицентр/i.test(x.text) || (x.sig === 'b' && /Пекарня/i.test(x.text))), JSON.stringify({ textWider: decoTw, clipCut: r.clipCut.map((x) => `${x.sig} ${x.text}`) }));
      check('overflow: поля-ловушки для ботов (за краем экрана; tabindex=-1 в aria-hidden) — не «не влез в поле»', !fc.includes('input#hp1') && !fc.includes('input#hp2'), JSON.stringify(r.fieldCut));
      check('overflow: вердикт WARN (не FAIL), в сводке «текст обрезан» и «не влез в поле»', r.verdict === 'WARN' && /текст обрезан/.test(r.summary) && /не влез в поле/.test(r.summary), `${r.verdict} ${r.summary}`);
      await page.close();
      const p2 = await open(fx('overflow-cut.html'), 'mobile-s', { settle: 500, modalCheck: false });
      const r2 = await findOverflow(p2);
      check('overflow: окно закрыто — метки диалога в счёте нет', !r2.clipCut.some((x) => x.sig === 'div.tag' || /dlg/.test(x.clip)), JSON.stringify(r2.clipCut));
      await p2.close();
      /* декор за краем экрана без обрезающего контейнера — не FAIL; тот же блок без aria-hidden — FAIL */
      const p3 = await open(fx('decor-edge.html'), 'mobile-s', { settle: 500, modalCheck: false });
      const r3 = await findOverflow(p3);
      check('overflow: слово-фон с aria-hidden за краем экрана — не «за краем»; блок без aria-hidden — за краем (FAIL)', JSON.stringify(r3.outer.map((o) => o.sig)) === '["div.real"]' && r3.verdict === 'FAIL', `${r3.verdict} ${JSON.stringify(r3.outer)}`);
      await p3.close();
      /* настоящий текст в разметке декора (скептик 30.09): заголовок, разбитый на слова (aria-label у заголовка, aria-hidden
         у слов — GSAP SplitText 3.13+), надпись со слогами под aria-hidden и sr-only копией, меню WAI-ARIA (li role=none) —
         находки; слова-фон рядом с заголовком того же смысла и в разделе с подписью — молчат */
      for (const q of ['', '?plain=1']) {
        const p4 = await open(fx('decor-real.html', q), 'mobile-s', { settle: 500, modalCheck: false });
        const r4 = await findOverflow(p4); await p4.close();
        const tag = q ? 'без разбиения (контроль)' : 'разбит для анимации';
        const outerTxt = r4.outer.map((o) => `${o.sig} ${o.text}`); const cutTxt = r4.clipCut.map((x) => `${x.sig} ${x.text}`);
        check(`overflow: заголовок ${tag} шире экрана — «за краем экрана» (FAIL)`, r4.verdict === 'FAIL' && outerTxt.some((s) => /Достопримечательности/.test(s)), `${r4.verdict} ${JSON.stringify(outerTxt)}`);
        check(`overflow: заголовок ${tag} в карточке overflow:hidden — текст обрезан`, cutTxt.some((s) => /Бронирование|столов/.test(s)), JSON.stringify(cutTxt));
        check('overflow: надпись со слогами под aria-hidden и sr-only копией — текст обрезан', cutTxt.some((s) => /^span (Эпи|цен|тр)$/.test(s)), JSON.stringify(cutTxt));
        check('overflow: меню WAI-ARIA (li role=none > a role=menuitem) — «Корпоративные праздники» обрезан', cutTxt.some((s) => /^a Корпоративные праздники/.test(s)), JSON.stringify(cutTxt));
        check('overflow: слово-фон «меню» за «Основное меню» и «БАР» в разделе «Бар» — молчат', !cutTxt.some((s) => /(^| )(меню|БАР)$/.test(s)) && !r4.textWider.some((x) => /^(меню|БАР)$/.test(x.text)), JSON.stringify({ clipCut: cutTxt, textWider: r4.textWider }));
      }
      /* контроли: без sr-only копии слоги под aria-hidden — декор, молчат; слова-фон без aria-hidden — находка (проверка
         на них жива, их молчание выше — от правила о декоре) */
      {
        const p5 = await open(fx('decor-real.html', '?srlabel=0'), 'mobile-s', { settle: 500, modalCheck: false });
        const r5 = await findOverflow(p5); await p5.close();
        check('overflow: надпись со слогами под aria-hidden без копии для читалки — декор, молчит (контроль)', !r5.clipCut.some((x) => /^(Эпи|цен|тр)$/.test(x.text)), JSON.stringify(r5.clipCut.map((x) => `${x.sig} ${x.text}`)));
        const p6 = await open(fx('decor-real.html', '?nohide=1'), 'mobile-s', { settle: 500, modalCheck: false });
        const r6 = await findOverflow(p6); await p6.close();
        const t6 = [...r6.clipCut, ...r6.textWider].map((x) => x.text);
        check('overflow: слова-фон «меню» и «БАР» без aria-hidden — находка (контроль)', t6.includes('меню') && t6.includes('БАР'), JSON.stringify(t6));
      }
      /* текст перекрыт соседним блоком (02.10): по умолчанию выключено — ответ прежний поле в поле; coveredBy: true — восемь
         находок стенда ../runtime/covered.html со сверкой снимком, остальное на стенде молчит; прежние поля и вердикт те же,
         прокрутка и стили страницы возвращены */
      {
        const p7 = await open(pathToFileURL(path.join(here, '..', 'runtime', 'covered.html')).href, 'desktop', { settle: 500, modalCheck: false });
        await p7.evaluate(() => window.scrollTo(0, 300)); await sleep(200);
        const ra = await findOverflow(p7);
        check('overflow: без coveredBy полей coveredBy, coveredByCount, coveredByStat в ответе нет (discover и перепроверка после клика получают прежний ответ)', !('coveredBy' in ra) && !('coveredByCount' in ra) && !('coveredByStat' in ra), Object.keys(ra).join(','));
        const state = () => p7.evaluate(() => ({ y: scrollY, styled: document.querySelectorAll('[style]').length, styles: [...document.querySelectorAll('[style]')].map((e) => e.getAttribute('style')).join(' | '), sheets: document.adoptedStyleSheets.length, hidden: document.querySelectorAll('[style*="visibility"], [style*="transition"]').length, cov: typeof window.__rwCov }));
        const before = await state();
        const rb = await findOverflow(p7, { coveredBy: true });
        const after = await state();
        const got = (rb.coveredBy || []).map((x) => `${x.sig}|${x.by}`);
        const wantCov = ['figcaption.credit|div.card', 'p.note|div.banner', 'p.long|div.plate', 'p.g|div.grad', 'p.pseudo|a.cover', 'p.lt|div.late.in', 'p|div.pile__card', 'figcaption.vcredit|div.vcard'];
        check('overflow: coveredBy — восемь перекрытий стенда covered.html сверху вниз: подпись под карточкой, строка под фоном-картинкой, под плашкой, под градиентом, под псевдоэлементом, под въехавшим блоком, под соседней карточкой, вертикальная подпись (закрыта верхняя треть)', JSON.stringify(got) === JSON.stringify(wantCov) && rb.coveredByCount === 8, JSON.stringify(got));
        const st7 = rb.coveredByStat || {};
        check('overflow: coveredBy — у каждой находки сверка снимком; полупрозрачный PNG в фоне (узор и вуаль) снят сверкой', (rb.coveredBy || []).every((x) => x.proof === 'снимок') && st7.refuted === 2 && !st7.unsure && !st7.gone && JSON.stringify((st7.dropped || []).map((x) => `${x.sig}|${x.by}|${x.why}`)) === '["p.up|div.pattern|refuted","p.uv|div.veil|refuted"]', JSON.stringify(st7));
        const lg = (rb.coveredBy || []).find((x) => x.sig === 'p.long');
        check('overflow: coveredBy — перекрыта часть строк: p.long — 2 из 5', !!lg && lg.lines === 2 && lg.of === 5, JSON.stringify(lg));
        check('overflow: coveredBy — липкая шапка, нижняя панель, меню, диалог, окно, растянутая ссылка, слайды стопкой и веером, свой фон, значок, подложка, затухание, слова-фон, бесконечная анимация, прозрачная строка, картинка (она в covered) — молчат', !(rb.coveredBy || []).some((x) => !wantCov.includes(`${x.sig}|${x.by}`)) && rb.coveredCount === 1, JSON.stringify(got));
        check('overflow: coveredBy — проверены все строки, предел не сработал', st7.lines > 0 && st7.lines === st7.linesAll && !st7.capped && !st7.error, JSON.stringify(st7));
        const strip = (r) => { const { coveredBy, coveredByCount, coveredByStat, ...rest } = r; return JSON.stringify(rest); };
        check('overflow: coveredBy не меняет прежние поля, вердикт и сводку (covered, coveredCount, verdict, summary — как без него)', strip(ra) === strip(rb), `${strip(ra).slice(0, 180)} ≠ ${strip(rb).slice(0, 180)}`);
        check('overflow: после coveredBy прокрутка на месте, атрибуты style прежние строка в строку, своя таблица сверки снята, состояние проверки со страницы убрано', before.y === after.y && before.y === 300 && before.styled === after.styled && before.styles === after.styles && before.sheets === after.sheets && after.hidden === 0 && after.cov === 'undefined', JSON.stringify({ before, after }));
        await p7.close();
        /* правило после независимой проверки 02.10 (стенд ../runtime/covered2.html): кнопка, открывающая окно, карточки в
           потоке со словом окна, миниатюра-ссылка, пустая плашка по размеру кнопки, скелет, плашка между точками строки,
           .dialogue и .suggested-items — находки; колода карточек, «Показать полностью», настоящее окно по слову в классе и
           перевёртыш с картинкой на лицевой стороне — молчат */
        {
          const p9 = await open(pathToFileURL(path.join(here, '..', 'runtime', 'covered2.html')).href, 'desktop', { settle: 500, modalCheck: false });
          const r9 = await findOverflow(p9, { coveredBy: true }); await p9.close();
          const got9 = (r9.coveredBy || []).map((x) => `${x.sig}|${x.by}`); const st9 = r9.coveredByStat || {};
          const want9 = ['p.t-open|a.btn.js-popup-open', 'p.t-card|div.modal-card', 'p.t-cookie|div.cookie-card', 'p.t-thumb|a.image-popup', 'button.t-btn|span.lid', 'p.t-skel|div.skel', 'p.t-gap|span.gap', 'p.t-dlg|div.dialogue', 'p.t-sug|div.suggested-items'];
          check('overflow: coveredBy — слово окна в классе кнопки, ссылки и блока в потоке не делает их окном: a.js-popup-open, .modal-card, .cookie-card, a.image-popup на тексте — находки; .dialogue и .suggested-items — не слова «dialog» и «suggest»', want9.filter((w) => !/t-btn|t-skel|t-gap/.test(w)).every((w) => got9.includes(w)), JSON.stringify(got9));
          check('overflow: coveredBy — пустая плашка точно по размеру блока текста (inset: 0 на кнопке, скелет) — находка, а не «стопка слайдов»', got9.includes('button.t-btn|span.lid') && got9.includes('p.t-skel|div.skel'), JSON.stringify(got9));
          check('overflow: coveredBy — плашка между 20 и 45 % длинной строки видна точкам 32,5 и 67,5 %', got9.includes('p.t-gap|span.gap'), JSON.stringify(got9));
          check('overflow: coveredBy — колода карточек (со сдвигом и с z-index и transform), «Показать полностью», окно .city-popup, перевёртыш с картинкой — молчат; девять находок по порядку, у каждой сверка снимком', JSON.stringify(got9) === JSON.stringify(want9) && (r9.coveredBy || []).every((x) => x.proof === 'снимок') && !st9.refuted && !st9.unsure && !st9.gone && st9.lines === st9.linesAll, JSON.stringify({ got9, st9 }));
        }
        /* проверка не оставляет следов (стенд ../runtime/covered-side.html): сверка прячет текст правилом в своей
           сконструированной таблице — атрибут style с выброшенными объявлениями тот же до знака (раньше браузер пересобирал
           его, и --css после --scroll терял FAIL), страница не видит ни записей MutationObserver, ни событий transition*,
           идущий переход цвета не оборван, текст с transition: all спрятан сразу */
        {
          const p10 = await open(pathToFileURL(path.join(here, '..', 'runtime', 'covered-side.html')).href, 'desktop', { settle: 500, modalCheck: false });
          const snap = () => p10.evaluate(() => ({ styles: [...document.querySelectorAll('[style]')].map((e) => e.getAttribute('style')), t: window.__traces(), sheets: document.adoptedStyleSheets.length, red: parseInt((getComputedStyle(document.getElementById('pulse')).color.match(/\d+/) || ['-1'])[0], 10) }));
          const b10 = await snap(); const r10 = await findOverflow(p10, { coveredBy: true }); const a10 = await snap(); await p10.close();
          check('overflow: coveredBy — атрибут style до и после сверки — строка в строку, вместе с выброшенными объявлениями («color: #333; colr: red; width: 10 px»)', JSON.stringify(b10.styles) === JSON.stringify(a10.styles) && a10.styles.includes('color: #333; colr: red; width: 10 px'), JSON.stringify({ before: b10.styles, after: a10.styles }));
          check('overflow: coveredBy — страница не увидела ни одной записи MutationObserver (атрибуты, узлы) и ни одного события transition*; таблица сверки снята', b10.t.attr === 0 && a10.t.attr === 0 && a10.t.nodes === 0 && a10.t.tr.length === 0 && a10.sheets === b10.sheets, JSON.stringify({ before: b10.t, after: a10.t, sheets: [b10.sheets, a10.sheets] }));
          check('overflow: coveredBy — идущий переход цвета у перекрытого текста не оборван: та же анимация идёт, цвет между начальным и конечным', a10.t.run === true && a10.red > b10.red && a10.red < 255, JSON.stringify({ run: a10.t.run, red: [b10.red, a10.red] }));
          check('overflow: coveredBy — три находки стенда следов, у каждой сверка снимком (текст с transition: all спрятан сразу, а не через 0,4 с)', JSON.stringify((r10.coveredBy || []).map((x) => `${x.sig}|${x.proof}`)) === '["p.keep|снимок","p#pulse.go|снимок","p.all|снимок"]', JSON.stringify(r10.coveredBy));
        }
        /* предел: 8200 коротких узлов текста — проверено 6000 строк, предел назван числом, проход — не десятки секунд */
        const many = path.join(out, 'covered-many.html');
        fs.writeFileSync(many, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Много строк</title><style>body { margin: 0; font: 16px/24px Arial, sans-serif; }</style></head><body><main>${'<span>ая</span> '.repeat(8200)}</main></body></html>`);
        const p8 = await open(pathToFileURL(many).href, 'desktop', { settle: 300, modalCheck: false });
        const r8 = await findOverflow(p8, { coveredBy: true }); await p8.close();
        const st8 = r8.coveredByStat || {};
        check('overflow: coveredBy — предел: 6000 строк из 8000, остальные узлы не взяты, предел назван числом, проход короче 15 с', st8.lines === 6000 && st8.linesAll === 8000 && /строк больше 6000/.test(st8.capped || '') && /текстовых узлов больше 8000/.test(st8.capped || '') && st8.ms < 15000 && r8.coveredByCount === 0, JSON.stringify(st8));
      }
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
      check('modal: у WARN вид «окно» (подпись строки в a11y — «окно», а не «свой стиль на странице»)', w.some((x) => /открыто окно/.test(x) && warningKind(x) === 'окно' && warningLabel(x) === 'окно'), w.map((x) => `${warningKind(x)}: ${x.slice(0, 60)}`).join(' | '));
      check('modal: окно по таймеру 1,5 с — ждали, потому что при загрузке есть признаки окна', !!(page.overlay.modalWait && page.overlay.modalWait.signs.length), JSON.stringify(page.overlay.modalWait || null));
      await page.close();
      page = await open(fx('modal-city.html', '?close=1'), 'desktop'); m = page.overlay.modal; takeWarnings();
      check('modal: видимый крестик — предложен он', !!m && m.suggest === '.fancybox-container button.fancybox-close-small', JSON.stringify(m));
      await page.close();
      page = await open(fx('overflow-cut.html', '?dialog=1'), 'mobile-s'); m = page.overlay.modal; takeWarnings();
      check('modal: <dialog> с «Закрыть» — предложена кнопка', !!m && m.how === 'dialog' && m.suggest === '#dlg button', JSON.stringify(m));
      await page.close();
      let t0 = Date.now();
      page = await open(fx('no-modal.html'), 'desktop'); m = page.overlay.modal; w = takeWarnings();
      const openMs = Date.now() - t0;
      check('modal: шапка, зерно, фон, чат, закрытый dialog — окна нет', !m && !w.some((x) => /открыто окно/.test(x)), JSON.stringify(m) + ' ' + w.join(' | '));
      /* +1,1 с к открытию любой страницы (d5c4879): ждали 2 с от начала документа и без признаков окна */
      check(`modal: без признаков окна — не ждём (открытие ${openMs} мс, было ≥ 2500)`, !page.overlay.modalWait && openMs < 1900, JSON.stringify({ openMs, modalWait: page.overlay.modalWait || null }));
      await page.close();
      /* не окно: закреплённый первый экран, половина экрана, страница в закреплённом контейнере прокрутки, непрозрачный слой
         поверх страницы без запертой прокрутки (ложный WARN 29.09) */
      for (const [f, vp, why] of [['fixed-hero.html', 'desktop', 'закреплённый первый экран'], ['split.html', 'desktop', 'левая половина «пополам»'], ['../typeset/fixedwrap.html', 'desktop', 'страница в закреплённом контейнере прокрутки'], ['modal-layer.html?opaque=1', 'desktop', 'непрозрачный слой со ссылкой, прокрутка не заперта'], ['body-scroller.html', 'desktop', 'закреплённый первый экран, страницу прокручивает сам body (html overflow:hidden)']]) {
        const [file, q] = f.split('?');
        page = await open(fx(file, q ? `?${q}` : ''), vp, { settle: 1500 }); m = page.overlay.modal; w = takeWarnings();
        check(`modal: ${why} (${f}) — не окно`, !m && !w.some((x) => /открыто окно/.test(x)), JSON.stringify(m) + ' ' + w.join(' | '));
        await page.close();
      }
      /* окно без семантики: полупрозрачная подложка поверх страницы, слой при запертой прокрутке, блок с классом popup */
      for (const [q, re, why, file = 'modal-layer.html'] of [['?dim=1', /полупрозрачная подложка поверх страницы/, 'полупрозрачная подложка поверх страницы'], ['?lock=1', /прокрутка страницы заперта/, 'слой на весь экран при запертой прокрутке'], ['?cls=1', /окно по классу/, 'закреплённый блок .popup.is-open'], ['?lock=1', /прокрутка страницы заперта/, 'body-scroller: body тоже overflow:hidden — прокрутки нет нигде', 'body-scroller.html']]) {
        page = await open(fx(file, q), 'desktop', { settle: 1500 }); m = page.overlay.modal; w = takeWarnings();
        check(`modal: ${why} (${q}) — окно`, !!m && re.test(m.how) && w.some((x) => /открыто окно/.test(x)), JSON.stringify(m) + ' ' + w.join(' | '));
        await page.close();
      }
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
      /* нажатие увело на главную (mamuka.rest 29.09: «Ярославль» на /menu/ — и shots, runtime, a11y мерили главную с OK):
         нужная страница открыта заново, выбор запомнен */
      process.env.SITE_REWORK_DISMISS = '.city li.city__item'; takeWarnings(); takeNotes();
      page = await open(fx('dismiss-nav.html'), 'desktop', { settle: 1500 }); d = page.overlay.dismiss || []; w = takeWarnings(); n = takeNotes();
      const onPage = await page.evaluate(() => !!document.getElementById('mark') && !document.getElementById('home')).catch(() => false);
      check('dismiss: увело на главную — нужная страница открыта заново и мерится она', d[0] && /dismiss-home\.html$/.test(d[0].nav || '') && d[0].reopened && /dismiss-nav\.html$/.test(page.url()) && onPage && !page.rwWrongPage, JSON.stringify(d) + ` url ${page.url()} onPage ${onPage}`);
      check('dismiss: увело — INFO «увело на … — нужная страница открыта заново», без WARN', n.some((x) => /увело на .*dismiss-home\.html — нужная страница открыта заново/.test(x)) && !w.length, `${n.join(' | ')} / ${w.join(' | ')}`);
      check('dismiss: окно с целью SITE_REWORK_DISMISS внутри — не заставка (не ждали, не «заставка не ушла»)', !page.overlay.hadOverlay && page.overlay.waitedMs < 1000, JSON.stringify({ hadOverlay: page.overlay.hadOverlay, gone: page.overlay.gone, waitedMs: page.overlay.waitedMs }));
      await page.close();
      page = await open(fx('dismiss-nav.html', '?forget=1'), 'desktop', { settle: 1500 }); d = page.overlay.dismiss || []; w = takeWarnings(); takeNotes();
      check('dismiss: сайт не запомнил выбор — окно снова на экране: WARN', d[0] && d[0].again && w.some((x) => /сайт не запомнил выбор/.test(x) && warningKind(x) === 'SITE_REWORK_DISMISS'), JSON.stringify(d) + ' ' + w.join(' | '));
      await page.close();
      page = await open(fx('dismiss-nav.html', '?bounce=1'), 'desktop', { settle: 1500 }); d = page.overlay.dismiss || []; w = takeWarnings(); takeNotes();
      check('dismiss: страница снова уводит — WARN «замер не той страницы» и page.rwWrongPage', d[0] && d[0].wrongPage && page.rwWrongPage && /dismiss-home\.html$/.test(page.rwWrongPage.got) && w.some((x) => /замер не той страницы/.test(x)), JSON.stringify(d) + ' ' + JSON.stringify(page.rwWrongPage) + ' ' + w.join(' | '));
      await page.close();
      /* журнал — только нужной страницы: runtime засчитал /menu/ mamuka.rest запросы и консоль промежуточной главной
         (464 запроса вместо 184, «упавшее» видео главной — 30.09). Главная шумит: ошибка в консоли, исключение, упавшая
         картинка — после повторного открытия их в page.log нет, выброшенное — в dropped */
      page = await open(fx('dismiss-nav.html', '?noisy=1'), 'desktop', { settle: 1500 }); d = page.overlay.dismiss || []; takeWarnings(); n = takeNotes();
      await sleep(300);
      const lg = page.log; const noise = [...lg.console.map((c) => c.text), ...lg.errors, ...lg.failed.map((f) => `${f.reason} ${f.url}`)].filter((t) => /главная|missing-home/.test(t));
      check('dismiss: шумная главная — в журнале нужной страницы нет её консоли, исключения и упавшей картинки', d[0] && d[0].reopened && !noise.length && !lg.requests.some((r) => /dismiss-home|missing-home/.test(r.url)), JSON.stringify({ noise, requests: lg.requests.map((r) => r.url.split('/').pop()), d: d[0] }));
      check('dismiss: выброшенное из журнала — в dropped (шум главной там был)', !!(d[0] && d[0].dropped && (d[0].dropped.console + d[0].dropped.errors + d[0].dropped.failed) > 0) && n.some((x) => /запросы и консоль в счёте — только её/.test(x)), JSON.stringify(d[0] && d[0].dropped) + ' ' + n.join(' | '));
      await page.close();
      /* окно закрылось сразу, а на главную увело через 0,4 с (сайт сначала запоминает выбор) — переход замечен */
      page = await open(fx('dismiss-nav.html', '?late=1'), 'desktop', { settle: 1500 }); d = page.overlay.dismiss || []; takeWarnings(); takeNotes();
      const onLate = await page.evaluate(() => !!document.getElementById('mark') && !document.getElementById('home')).catch(() => false);
      check('dismiss: отложенный переход (окно ушло, увело через 0,4 с) — замечен, нужная страница открыта заново', d[0] && /dismiss-home\.html$/.test(d[0].nav || '') && d[0].reopened && onLate, JSON.stringify(d) + ` onPage ${onLate}`);
      await page.close();
      /* нажатие перезагрузило эту же страницу — открыта заново, журнал только её */
      page = await open(fx('dismiss-nav.html', '?reload=1'), 'desktop', { settle: 1500 }); d = page.overlay.dismiss || []; w = takeWarnings(); n = takeNotes();
      check('dismiss: перезагрузка той же страницы — reload, открыта заново, INFO «перезагрузило страницу»', d[0] && d[0].reload && d[0].reopened && !w.length && n.some((x) => /перезагрузило страницу — нужная страница открыта заново/.test(x)), JSON.stringify(d) + ' ' + w.join(' | ') + ' / ' + n.join(' | '));
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
          const xs = Math.round(x < 0 ? info.width + x : x); let n = 0, first = -1;
          for (let y = 0; y < info.height; y++) { const i = (y * info.width + xs) * 3; if (Math.abs(data[i] - rgb[0]) <= 28 && Math.abs(data[i + 1] - rgb[1]) <= 28 && Math.abs(data[i + 2] - rgb[2]) <= 28) { n++; if (first < 0) first = y; } }
          return { n, h: info.height, w: info.width, first };
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
        /* вкладка посередине края (mamuka «Карта калорий») — в первом окне, где её видно при открытии, а не внизу склейки */
        check(`seams: вкладка посередине края — в первом окне (с y ${t1.first})`, t1.first >= 0 && t1.first < 900, t1.first);
        check(`seams: без pins шапка на каждом шве (${h0.n}) — стенд различает`, h0.n >= 180, h0.n);
        /* scrollThrough по умолчанию без дыр (runtime --scroll зовёт с maxShots 6): maxShots 2 — снимков столько, сколько нужно */
        const cov = await scrollThrough(page, { shotsDir: path.join(out, 'cover'), tag: 'cov', maxShots: 2, shotPause: 200, waitMedia: false, pause: 100 });
        check(`scrollThrough: по умолчанию без дыр — maxShots 2, снято ${cov.shots.length} на ${cov.pageHeight} px`, cov.shots.length > 2 && Array.isArray(cov.gaps) && !cov.gaps.length, JSON.stringify({ n: cov.shots.length, gaps: cov.gaps, ys: cov.shots.map((s) => s.scrollY) }));
        const cov0 = await scrollThrough(page, { shotsDir: path.join(out, 'cover'), tag: 'cov0', maxShots: 2, shotPause: 200, waitMedia: false, pause: 100, cover: false });
        check(`scrollThrough: cover false — не больше maxShots, дыры в gaps (${cov0.gaps.length})`, cov0.shots.length === 2 && cov0.gaps.length > 0, JSON.stringify({ n: cov0.shots.length, gaps: cov0.gaps }));
        await page.close();
        /* колонки на всю высоту окна — на всей высоте склейки (d5c4879 их прятал везде, кроме последнего окна: рельс
           «Эпицентра» на /menu и /afisha, колонка mamuka), мелкое — один раз */
        page = await open(fx('rail-seams.html'), 'desktop', { settle: 500 });
        const f4 = path.join(out, 'rail-pins.png'); await fullPageShot(page, f4, { mode: 'segments' });
        const RAIL = [122, 0, 255], SIDE = [51, 102, 255], TAB2 = [255, 170, 0], UP = [0, 170, 136], LATE = [255, 51, 0];
        const rl = await rows(f4, 10, RAIL), sd = await rows(f4, 1300, SIDE), tb = await rows(f4, 60, TAB2), up = await rows(f4, 1400, UP), lt = await rows(f4, 150, LATE);
        check(`seams: рельс fixed на всю высоту окна — на всей высоте склейки (${rl.n} строк из ${rl.h})`, rl.h >= 3790 && rl.n >= rl.h - 10, `${rl.n} из ${rl.h}`);
        check(`seams: колонка sticky на всю высоту окна — на всей высоте сетки (${sd.n} из 3600)`, sd.n >= 3500 && sd.n <= 3610, sd.n);
        check(`seams: вкладка — один раз (${tb.n})`, tb.n >= 110 && tb.n <= 130, tb.n);
        check(`seams: «наверх» — один раз, внизу склейки (${up.n}, с y ${up.first})`, up.n >= 44 && up.n <= 52 && up.first > 3600, `${up.n} с y ${up.first}`);
        check(`seams: значок, появившийся после прокрутки, — один раз, а не нигде (${lt.n})`, lt.n >= 36 && lt.n <= 44, lt.n);
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

/* ---------- dismiss-ff: переход в Firefox на file:// (адрес вкладки отставал — переход не замечался, мерилась главная,
   30.09); отдельным браузером после Chrome ---------- */
if (want('dismiss-ff')) {
  if (!findBrowser('firefox')) console.log('     dismiss-ff пропущен: Firefox не найден (FIREFOX_PATH)');
  else {
    const ff = await launch({ browser: 'firefox' });
    try {
      process.env.SITE_REWORK_DISMISS = '.city li.city__item'; takeWarnings(); takeNotes();
      const [, vp] = resolveViewport('desktop');
      const page = await openPage(ff, fx('dismiss-nav.html', '?noisy=1'), vp, { settle: 1500 });
      const d = page.overlay.dismiss || []; const w = takeWarnings(); const n = takeNotes();
      const onPage = await page.evaluate(() => !!document.getElementById('mark') && !document.getElementById('home')).catch(() => false);
      check('dismiss-ff: Firefox, file:// — переход замечен, нужная страница открыта заново и мерится она', d[0] && /dismiss-home\.html/.test(d[0].nav || '') && d[0].reopened && onPage && !page.rwWrongPage && !w.length && n.some((x) => /увело на .*dismiss-home\.html.* — нужная страница открыта заново/.test(x)), JSON.stringify(d) + ` onPage ${onPage} ` + w.join(' | ') + ' / ' + n.join(' | '));
      const lg = page.log; const noise = [...lg.console.map((c) => c.text), ...lg.errors, ...lg.failed.map((f) => `${f.reason} ${f.url}`)].filter((t) => /главная|missing-home/.test(t));
      check('dismiss-ff: в журнале нужной страницы нет шума главной', !noise.length, JSON.stringify(noise));
      await page.close();
    } finally { delete process.env.SITE_REWORK_DISMISS; await ff.close().catch(() => {}); }
  }
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
  /* SITE_REWORK_DISMISS увёл на шумную главную: снимается нужная страница, ошибки консоли — только её (главная шумит
     ошибкой, исключением и упавшей картинкой) */
  r = spawnSync(process.execPath, [shots, fx('dismiss-nav.html', '?noisy=1'), '--out', out, '--tag', 'dismiss-noisy', '--viewports', 'desktop', '--segments', '0', '--return', 'none'], { encoding: 'utf8', timeout: 600000, env: { ...process.env, SITE_REWORK_DISMISS: '.city li.city__item' } });
  const jD = readJson(path.join(out, 'dismiss-noisy', 'shots.json'), {}); const sD = (jD.shots || [])[0] || {}; const dD = ((sD.windows || {}).dismiss || [])[0] || {};
  check('shots: нажатие увело на шумную главную — открыта заново, ошибок консоли 0 (шум главной не в счёте)', r.status === 0 && dD.reopened && sD.consoleErrors === 0 && dD.dropped && dD.dropped.errors > 0, JSON.stringify({ code: r.status, consoleErrors: sD.consoleErrors, dismiss: dD }).slice(0, 400));
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
  /* SITE_REWORK_DISMISS увёл на шумную главную: в сводке консоли — только нужная страница */
  const nOut = path.join(out, 'discover-noisy');
  const rn = spawnSync(process.execPath, [disc, fx('dismiss-nav.html', '?noisy=1'), '--out', nOut, '--viewports', 'desktop', '--pages-shots', '0', '--no-320', '--no-design', '--light', '--no-texture'], { encoding: 'utf8', timeout: 600000, env: { ...process.env, SITE_REWORK_DISMISS: '.city li.city__item' } });
  const mdN = fs.existsSync(path.join(nOut, 'discovery.md')) ? fs.readFileSync(path.join(nOut, 'discovery.md'), 'utf8') : '';
  check('discover: нажатие увело на шумную главную — открыта заново, консоль 0 ошибок, исключений 0, упавших 0', rn.status === 0 && /нужная страница открыта заново/.test(mdN) && /^- desktop: консоль 0 ошибок, исключений 0, предупреждений \d+, упавших запросов 0$/m.test(mdN), `${rn.status} ${(mdN.match(/^- (desktop: консоль|окна при загрузке).*$/gm) || ['нет строк']).join(' | ').slice(0, 400)}`);
}

console.log(`\n${bad ? 'FAIL' : 'OK'}: сошлось ${good}, не сошлось ${bad} · файлы ${out}`);
process.exit(bad ? 1 : 0);
