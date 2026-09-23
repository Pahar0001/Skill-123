#!/usr/bin/env node
/**
 * Зеркало чужой страницы как верстак: когда исходников сайта нет, а
 * переработку показать надо. Стили скачиваются в css/ и подключаются
 * локально, поверх добавляются два пустых файла — rework.css и rework.js.
 * Все правки делаются в них и в HTML: так изменения остаются отделёнными от
 * оригинала и переносятся на настоящий сайт как понятный патч.
 *
 *   node mirror.mjs <url> [--out папка] [--pages /,/about] [--no-scripts] [--viewport desktop]
 *   node mirror.mjs --help
 *
 * Два способа снять HTML:
 *   по умолчанию   исходный HTML — ответ сервера на переход, до работы скриптов. Скрипты
 *                  оригинала остаются и в зеркале выполняются один раз, как на сайте.
 *                  Снимать отрисованный DOM и оставлять скрипты нельзя: они запускаются
 *                  второй раз поверх уже построенной страницы — списки удваиваются
 *                  («ХОЛСТ»: 25 вариантов в заявке вместо 13), в HTML вшиваются is-active.
 *   --no-scripts   отрисованный DOM после прокрутки (ленивые блоки подгружены), скрипты,
 *                  обработчики on*, modulepreload удалены. Страница как снимок: меню,
 *                  слайдеры и формы не работают, состояние на момент снимка (is-active,
 *                  открытые блоки, показанные анимации появления) вшито в HTML.
 *                  Для сайтов, чьи скрипты не заводятся на localhost.
 *
 * Флаги:
 *   --out <папка>      папка прогона; по умолчанию ~/.claude/site-rework/runs/<домен-путь>
 *                      (или $SITE_REWORK_RUNS/<домен-путь>). Зеркало — в <папка>/mirror.
 *   --pages /,/about   ещё страницы того же сайта через запятую; адрес из <url> снимается всегда.
 *   --no-scripts       отрисованный DOM без скриптов (см. выше).
 *   --viewport <экран> каким экраном открывать: desktop (по умолчанию), mobile, 390x844@3 …
 *                      Для исходного HTML важен только агент браузера (телефонный у mobile).
 *   --help             эта справка.
 *
 * Адреса в HTML: картинки, видео, стили, обычные скрипты и ссылки — абсолютные, грузятся
 * с оригинала. Модульные скрипты, modulepreload, всё с атрибутом crossorigin, <use> в SVG
 * и шрифты из скачанных стилей того же сайта — от корня (/assets/…): с чужого адреса
 * браузер их не пустит (CORS), а serve.mjs --proxy отдаёт их с оригинала как свои.
 * Кодировка приводится к UTF-8 (страницы в windows-1251 перекодируются), <base> и
 * Content-Security-Policy из <meta> убираются, у скачанных стилей снимается integrity.
 *
 * Пишет в <папка>/mirror: index.html (адрес из <url>), <slug>.html (остальные страницы),
 * css/NN-имя.css, rework.css и rework.js (только если их ещё нет — правки не затираются),
 * MIRROR.md (как снято, таблица страниц, ограничения; перезаписывается). HTML и css/,
 * которые правили после прошлого снятия, перед перезаписью сохраняются рядом как
 * <имя>.<время>.bak.html / .bak.css (WARN в консоли).
 * Смотреть: node serve.mjs <папка>/mirror --proxy <адрес оригинала>.
 * Код выхода: 0 — все страницы сняты; 1 — ошибка в аргументах или хотя бы одна страница
 * не снялась (остальные сохранены). Вердикты в консоли: OK / WARN / FAIL.
 *
 * Чего зеркало не умеет: серверные формы и API (отправка уйдёт на оригинал через --proxy
 * или упадёт), страницы за логином, скрипты, которые проверяют домен или ходят на
 * оригинал по полному адресу (CORS). Для боевого сайта зеркало — не замена исходникам,
 * а способ показать и проверить идею до правок в них.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, preparePage, gotoRetry, waitForOverlay, scrollThrough, resolveViewport, parseArgs, runDir, ensureDir, pageSlug, pagesFrom, sleep, withDeadline } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2), { values: ['out', 'pages', 'viewport'], flags: ['no-scripts', 'help', 'h'] });
if (opt.help || opt.h || pos.includes('-h')) {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
  process.exit(0);
}
const die = (m) => { console.error(`FAIL ${m}`); process.exit(1); };
if (!pos[0]) die('нужен адрес: node mirror.mjs <url> [--out папка] [--pages /,/about] [--no-scripts] (--help — справка)');
let base; try { base = new URL(pos[0]); } catch { die(`«${pos[0]}» — не адрес`); }
if (!/^https?:$/.test(base.protocol)) die(`«${pos[0]}» — нужен адрес http или https`);
for (const k of ['out', 'pages', 'viewport']) if (opt[k] === true) die(`--${k} без значения`);
const [vpName, vp] = resolveViewport(opt.viewport || 'desktop') || [];
if (!vp) die(`неизвестный экран «${opt.viewport}»: desktop, laptop, tablet, mobile, mobile-s, android или ШxВ@плотность`);
const noScripts = !!opt['no-scripts'];
const run = runDir(opt, pos[0]);
const outDir = ensureDir(path.join(run, 'mirror'));
const cssDir = path.join(outDir, 'css');
const pages = opt.pages ? pagesFrom(opt.pages, base) : [base.href];
if (!pages.includes(base.href)) pages.unshift(base.href);

const FONT_EXT = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;
/* url() и @import в CSS — абсолютные от адреса самого файла; шрифты того же сайта — от корня (CORS) */
const absCss = (css, from, origin) => {
  const fix = (u) => { try { const x = new URL(u.trim(), from); return x.origin === origin && FONT_EXT.test(x.pathname) ? x.pathname + x.search + x.hash : x.href; } catch { return u; } };
  return css
    .replace(/url\(\s*(['"]?)(?!data:|#)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${fix(u)}${q})`)
    .replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, u) => `@import ${q}${fix(u)}${q}`);
};

/* кодировка ответа: заголовок, иначе <meta> в первых 4 КБ, иначе UTF-8. Тело ответа из браузера
   (CDP getResponseBody) Chrome уже перевёл в UTF-8, а в <meta> осталась windows-1251: байты, которые
   читаются как UTF-8 без ошибок, второй раз не перекодируем (текст в 1251 почти никогда не валидный UTF-8). */
function decodeHtml(buf, contentType) {
  let cs = (/charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!cs) { const head = buf.subarray(0, 4096).toString('latin1'); cs = (/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head) || [])[1]; }
  cs = (cs || 'utf-8').toLowerCase();
  if (/^utf-?8$/.test(cs)) return { html: buf.toString('utf8'), charset: 'utf-8' };
  try { return { html: new TextDecoder('utf-8', { fatal: true }).decode(buf), charset: `${cs} (браузер отдал уже в UTF-8)` }; } catch { /* сырые байты */ }
  try { return { html: new TextDecoder(cs).decode(buf), charset: cs }; } catch { return { html: buf.toString('utf8'), charset: `utf-8 (не знаю ${cs})` }; }
}

/**
 * Выполняется в браузере. source: разобрать исходный HTML (DOMParser в пустой вкладке — скрипты
 * не запускаются, CSP и Trusted Types сайта не мешают); иначе — живой document после прокрутки.
 * <noscript> на время разбора заменяются метками: DOMParser разбирает их содержимое как разметку,
 * и <div><img> счётчика в <head> вытолкнул бы остаток head в body.
 */
function prepareDoc({ html, pageUrl, source, stripScripts }) {
  let doc = document; const ns = [];
  if (source) {
    /* комментарии и скрипты пропускаем как есть: «<noscript>» внутри них — не элемент */
    const marked = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, (m) => { if (!/^<noscript/i.test(m)) return m; ns.push(m); return `<!--rw-noscript-${ns.length - 1}-->`; });
    doc = new DOMParser().parseFromString(marked, 'text/html');
  }
  const baseEl = doc.querySelector('base[href]');
  let baseUrl = pageUrl; try { if (baseEl) baseUrl = new URL(baseEl.getAttribute('href'), pageUrl).href; } catch { /* как есть */ }
  const origin = new URL(pageUrl).origin;
  const SKIP = /^\s*(#|data:|blob:|mailto:|tel:|sms:|javascript:|about:|\{\{|$)/i;
  const abs = (u) => { if (u == null || SKIP.test(u)) return u; try { return new URL(u.trim(), baseUrl).href; } catch { return u; } };
  const fromRoot = (u) => { if (u == null || SKIP.test(u)) return u; try { const x = new URL(u.trim(), baseUrl); return x.origin === origin ? x.pathname + x.search + x.hash : x.href; } catch { return u; } };
  const absSet = (v) => {
    const s = String(v); const out = []; let i = 0;
    while (i < s.length) {
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      if (i >= s.length) break;
      let j = i; while (j < s.length && !/\s/.test(s[j])) j++;
      let url = s.slice(i, j); let desc = '';
      if (/,$/.test(url)) url = url.replace(/,+$/, '');
      else { let k = j, depth = 0; while (k < s.length && (s[k] !== ',' || depth)) { if (s[k] === '(') depth++; else if (s[k] === ')') depth--; k++; } desc = s.slice(j, k).trim(); j = k + 1; }
      out.push(desc ? `${abs(url)} ${desc}` : abs(url)); i = j;
    }
    return out.join(', ');
  };
  const cssUrls = (t) => t.replace(/url\(\s*(['"]?)(?!data:|#)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${abs(u)}${q})`).replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, u) => `@import ${q}${abs(u)}${q}`);
  /* <use> в SVG грузит только с того же адреса, что и страница */
  const isUse = (el) => el.localName === 'use' && el.namespaceURI === 'http://www.w3.org/2000/svg';
  const corsy = (el) => el.hasAttribute('crossorigin') || (el.localName === 'script' && (el.getAttribute('type') || '').trim().toLowerCase() === 'module') || (el.localName === 'link' && /(^|\s)modulepreload(\s|$)/i.test(el.getAttribute('rel') || ''));
  const JS_TYPES = /^(|text\/javascript|application\/javascript|module|text\/ecmascript|application\/ecmascript|text\/jscript)$/i;
  let removed = 0;
  if (stripScripts) {
    for (const s of doc.querySelectorAll('script')) if (JS_TYPES.test((s.getAttribute('type') || '').trim())) { s.remove(); removed++; }
    for (const l of doc.querySelectorAll('link[rel]')) if (/(^|\s)modulepreload(\s|$)/i.test(l.getAttribute('rel')) || (/(^|\s)preload(\s|$)/i.test(l.getAttribute('rel')) && /^script$/i.test(l.getAttribute('as') || ''))) l.remove();
    for (const el of doc.querySelectorAll('*')) for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    doc.querySelectorAll('style[data-rw]').forEach((s) => s.remove());
  }
  for (const el of doc.querySelectorAll('[src]')) el.setAttribute('src', corsy(el) ? fromRoot(el.getAttribute('src')) : abs(el.getAttribute('src')));
  for (const el of doc.querySelectorAll('[href]')) el.setAttribute('href', isUse(el) || corsy(el) ? fromRoot(el.getAttribute('href')) : abs(el.getAttribute('href')));
  for (const el of doc.querySelectorAll('[xlink\\:href]')) el.setAttribute('xlink:href', isUse(el) ? fromRoot(el.getAttribute('xlink:href')) : abs(el.getAttribute('xlink:href')));
  for (const a of ['srcset', 'imagesrcset', 'data-srcset']) for (const el of doc.querySelectorAll(`[${a}]`)) el.setAttribute(a, absSet(el.getAttribute(a)));
  for (const a of ['poster', 'data-src', 'data-original', 'data-lazy-src', 'data-bg', 'data-background', 'data-poster']) for (const el of doc.querySelectorAll(`[${a}]`)) el.setAttribute(a, abs(el.getAttribute(a)));
  for (const el of doc.querySelectorAll('[style*="url("]')) el.setAttribute('style', cssUrls(el.getAttribute('style')));
  for (const st of doc.querySelectorAll('style')) st.textContent = cssUrls(st.textContent);
  const sheets = [];
  for (const l of doc.querySelectorAll('link[rel][href]')) {
    const rel = l.getAttribute('rel').toLowerCase().split(/\s+/);
    if (!rel.includes('stylesheet') || rel.includes('alternate')) continue;
    l.setAttribute('data-rw-sheet', String(sheets.length)); sheets.push(l.getAttribute('href'));
  }
  doc.querySelectorAll('base').forEach((b) => b.remove());
  doc.querySelectorAll('meta[http-equiv]').forEach((m) => { if (/content-security-policy/i.test(m.getAttribute('http-equiv'))) m.remove(); });
  /* файл пишется в UTF-8 — объявление кодировки тоже */
  let hasCharset = false;
  doc.querySelectorAll('meta[charset]').forEach((m) => { m.setAttribute('charset', 'utf-8'); hasCharset = true; });
  doc.querySelectorAll('meta[http-equiv]').forEach((m) => { if (/content-type/i.test(m.getAttribute('http-equiv'))) { m.setAttribute('content', 'text/html; charset=utf-8'); hasCharset = true; } });
  const head = doc.head || doc.documentElement;
  if (!hasCharset) { const m = doc.createElement('meta'); m.setAttribute('charset', 'utf-8'); head.insertBefore(m, head.firstChild); }
  /* свои файлы — последними */
  const own = doc.createElement('link'); own.setAttribute('rel', 'stylesheet'); own.setAttribute('href', 'rework.css'); head.appendChild(own);
  const ownJs = doc.createElement('script'); ownJs.setAttribute('src', 'rework.js'); ownJs.setAttribute('defer', ''); (doc.body || doc.documentElement).appendChild(ownJs);
  const bodyText = ((doc.body && doc.body.textContent) || '').replace(/\s+/g, ' ').trim().length;
  const dt = doc.doctype ? new XMLSerializer().serializeToString(doc.doctype) + '\n' : '';
  let out = dt + doc.documentElement.outerHTML;
  let restored = 0;
  if (source) out = out.replace(/<!--rw-noscript-(\d+)-->/g, (m, i) => { if (ns[+i] == null) return m; restored++; return ns[+i]; });
  return { html: out, sheets, bodyText, noscript: ns.length, restored, removed, hadBase: !!baseEl, doctype: !!doc.doctype };
}

const lines = [];
const line = (st, what, det = '') => { lines.push({ st, what, det }); console.log(`${st.padEnd(4)} ${what}${det ? ' — ' + det : ''}`); };
const cssSaved = new Map();
const notes = [];
const report = [];
const mirrorMd = path.join(outDir, 'MIRROR.md');
const lastMirror = fs.existsSync(mirrorMd) ? fs.statSync(mirrorMd).mtimeMs : 0;
let fails = 0;
/* файл правили после прошлого снятия — перед перезаписью сохранить рядом, а не затирать молча */
function keepEdited(f, next) {
  if (!lastMirror || !fs.existsSync(f) || fs.statSync(f).mtimeMs <= lastMirror + 1000 || fs.readFileSync(f, 'utf8') === next) return;
  const ext = path.extname(f); const bak = `${f.slice(0, -ext.length)}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak${ext}`;
  fs.copyFileSync(f, bak); line('WARN', `${path.relative(outDir, f)} правили после прошлого снятия`, `старый сохранён: ${path.relative(outDir, bak)}`);
}
const browser = await launch();
try {
  const ua = (await browser.userAgent()).replace('HeadlessChrome', 'Chrome');
  for (const url of pages) {
    const slug = pageSlug(url);
    const file = path.join(outDir, url === base.href ? 'index.html' : `${slug}.html`);
    let page, blank;
    try {
      page = await preparePage(browser, vp, { hookCanvas: false, trackBytes: false });
      const res = await gotoRetry(page, url);
      let got;
      if (!noScripts) {
        /* исходный HTML: тело ответа на переход; не отдалось — тот же адрес ещё раз через fetch */
        let buf = null, ctype = '', status = res ? res.status() : 0, srcUrl = res ? res.url() : page.url(), how = 'ответ навигации';
        try { if (res) { buf = await res.buffer(); ctype = res.headers()['content-type'] || ''; } } catch { buf = null; }
        if (!buf || !buf.length) {
          const r = await fetch(srcUrl, { headers: { 'user-agent': ua, accept: 'text/html,*/*' } });
          buf = Buffer.from(await r.arrayBuffer()); ctype = r.headers.get('content-type') || ''; status = r.status; how = 'повторный запрос (тело ответа браузер не отдал)';
        }
        const { html, charset } = decodeHtml(buf, ctype);
        const rendered = await page.evaluate(() => ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').trim().length).catch(() => null);
        blank = await browser.newPage();
        got = await blank.evaluate(prepareDoc, { html, pageUrl: srcUrl, source: true, stripScripts: false });
        got.meta = { how, status, charset, rendered, url: srcUrl };
      } else {
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        await waitForOverlay(page, 5000); await sleep(500);
        await scrollThrough(page, { pause: 200 });
        got = await page.evaluate(prepareDoc, { html: null, pageUrl: page.url(), source: false, stripScripts: true });
        got.meta = { how: 'отрисованный DOM после прокрутки', status: res ? res.status() : 0, charset: 'utf-8', url: page.url() };
      }
      let out = got.html;
      /* стили: скачать и подключить локально */
      let local = 0;
      for (let i = 0; i < got.sheets.length; i++) {
        const href = got.sheets[i]; let rel = cssSaved.get(href);
        if (rel === undefined) {
          try {
            const r = await fetch(new URL(href, got.meta.url), { headers: { 'user-agent': ua, accept: 'text/css,*/*' } });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const abs = new URL(href, got.meta.url).href;
            const css = absCss(await r.text(), abs, new URL(got.meta.url).origin);
            rel = `css/${String(cssSaved.size + 1).padStart(2, '0')}-${(new URL(abs).pathname.split('/').pop() || 'style').replace(/[^a-z0-9._-]/gi, '_').slice(0, 40).replace(/\.css$/i, '')}.css`;
            const body = `/* ${abs} */\n` + css;
            ensureDir(cssDir); keepEdited(path.join(outDir, rel), body); fs.writeFileSync(path.join(outDir, rel), body);
          } catch (e) { notes.push(`Стиль не скачался, оставлен с оригинала: ${href} (${e.message})`); rel = null; }
          cssSaved.set(href, rel);
        }
        if (rel) { local++; out = out.replace(new RegExp(`<link\\b[^>]*\\sdata-rw-sheet="${i}"[^>]*>`), (tag) => tag.replace(/\shref="[^"]*"/, ` href="${rel}"`).replace(/\sintegrity="[^"]*"/, '').replace(/\scrossorigin(="[^"]*")?/, '')); }
      }
      out = out.replace(/ data-rw-sheet="\d+"/g, '');
      keepEdited(file, out);
      fs.writeFileSync(file, out);
      const m = got.meta;
      const warn = [];
      if (m.status >= 400) warn.push(`оригинал ответил ${m.status}`);
      if (got.noscript !== got.restored) warn.push(`<noscript> восстановлено ${got.restored} из ${got.noscript}`);
      /* страница строится скриптами: в исходном HTML почти нет текста, а в браузере есть */
      const spa = !noScripts && m.rendered != null && m.rendered > 400 && got.bodyText < m.rendered * 0.2;
      if (spa) warn.push(`в исходном HTML ${got.bodyText} знаков текста, в браузере ${m.rendered}: содержимое строят скрипты — зеркало покажет его, только если они заработают на localhost (serve.mjs --proxy); не заработали — --no-scripts`);
      report.push({ file: path.basename(file), url, ...m, sheets: got.sheets.length, local, bodyText: got.bodyText, removed: got.removed, spa, warn });
      line(warn.length ? 'WARN' : 'OK', `${slug} → ${path.basename(file)}`, `${m.how}, ${Math.round(out.length / 1024)} КБ, кодировка ${m.charset}, стилей ${got.sheets.length} (локально ${local})${noScripts ? `, скриптов удалено ${got.removed}` : ''}${warn.length ? '; ' + warn.join('; ') : ''}`);
    } catch (e) {
      fails++; report.push({ file: path.basename(file), url, error: e.message });
      line('FAIL', `${slug}`, `${String(e.message || e).slice(0, 200)}`);
    } finally {
      /* после неудачных переходов gotoRetry page.close() может не вернуться — не ждём дольше 5 с */
      if (blank) await withDeadline(blank.close(), 5000, 'закрытие вкладки').catch(() => {});
      if (page) await withDeadline(page.close(), 5000, 'закрытие вкладки').catch(() => {});
    }
  }
} finally { await withDeadline(browser.close(), 15000, 'закрытие браузера').catch(() => { try { const p = browser.process(); if (p) p.kill(); } catch { /* уже закрыт */ } }); }

for (const [name, header] of [['rework.css', '/* Правки поверх оригинала. Переменные оригинала — в css/, сюда только новое и переопределения. */\n'], ['rework.js', '/* Поведение поверх оригинала. Скрипты оригинала грузятся с его сервера, сюда — своё. */\n']]) {
  const f = path.join(outDir, name); if (!fs.existsSync(f)) fs.writeFileSync(f, header);
}
const ok = report.filter((r) => !r.error);
const how = noScripts
  ? `- HTML — **отрисованный DOM после прокрутки, скрипты удалены** (--no-scripts): обработчики on*, modulepreload и preload скриптов тоже. Это снимок, а не живая страница: меню, слайдеры, вкладки и формы не работают — нужное поведение писать в \`rework.js\`.
- **Вшитое состояние.** Классы и стили, которые скрипты поставили к моменту снимка (\`is-active\`, открытые меню и аккордеоны, показанные блоки появления, счётчики), остались в HTML как есть. Проверять и снимать «до» с этим в голове; лишнее убирать в HTML или в \`rework.css\`.`
  : `- HTML — **исходный ответ сервера** (до работы скриптов), адреса сделаны абсолютными. Скрипты оригинала остались и выполняются в зеркале один раз, как на сайте.
- **Повторная инициализация.** Нельзя сохранять отрисованный DOM и оставлять скрипты: они запустятся второй раз поверх уже построенной страницы — списки и карусели удвоятся (на «ХОЛСТе» было 25 вариантов в заявке вместо 13), состояние вроде \`is-active\` вшивается. Поэтому содержимое, которое строят скрипты (списки, меню, карточки из данных), в файле не видно — его нужно менять через \`rework.js\` (после их работы) или снимать зеркало с \`--no-scripts\` и дописывать поведение самим.
- Если скрипты оригинала на localhost не заводятся (проверяют домен, ходят на оригинал по полному адресу), страница будет пустой или сломанной — тогда \`--no-scripts\`.`;
fs.writeFileSync(mirrorMd, `# Зеркало ${base.href}

Снято ${new Date().toLocaleString('sv-SE')}, экран ${vpName}. Это верстак, а не копия сайта.

${how}
- Картинки, видео, стили, обычные скрипты и ссылки грузятся с оригинала по абсолютным адресам. Модульные скрипты, modulepreload, всё с атрибутом crossorigin, \`<use>\` в SVG и шрифты того же сайта из скачанных стилей записаны от корня (\`/assets/…\`): с чужого адреса браузер их не пустит (CORS), а \`serve.mjs --proxy\` отдаёт их с оригинала как свои. **Без --proxy они не загрузятся.**
- Стили скачаны в \`css/\` и подключены локально: их можно править, но лучше переопределять в \`rework.css\`.
- \`rework.css\` и \`rework.js\` подключены последними — все новые правки сюда и в HTML.
- Файл в UTF-8 (исходная кодировка указана ниже). \`<base>\` и Content-Security-Policy из \`<meta>\` убраны.
- Формы и API уходят на оригинал через --proxy или не работают. Страницы за логином не снимаются.

| файл | адрес | как снято | ответ | кодировка | стилей (локально) | заметки |
|---|---|---|---|---|---|---|
${report.map((r) => r.error ? `| ${r.file} | ${r.url} | FAIL | — | — | — | ${r.error.replace(/\|/g, '/').slice(0, 160)} |` : `| ${r.file} | ${r.url} | ${r.how} | ${r.status || '—'} | ${r.charset} | ${r.sheets} (${r.local}) | ${r.warn.join('; ').replace(/\|/g, '/') || '—'} |`).join('\n')}

Смотреть: \`node ~/.claude/skills/site-rework/scripts/serve.mjs "${outDir}" --proxy ${base.origin}\`.
Снимки «до» для сравнения снимать с этого же адреса до правок (shots.mjs --tag before), «после» — с него же.

Перенос на настоящий сайт: \`rework.css\` → в стили сайта, \`rework.js\` → в скрипты, правки HTML — по diff между этим файлом и свежим зеркалом.
${notes.length ? '\nЗамечания:\n' + notes.map((n) => `- ${n}`).join('\n') + '\n' : ''}`);
for (const n of notes) console.log(`WARN ${n}`);
console.log(`\n${fails ? 'FAIL' : lines.some((l) => l.st === 'WARN') || notes.length ? 'WARN' : 'OK'}: снято ${ok.length} из ${pages.length} · ${outDir}`);
console.log(`Смотреть: node serve.mjs "${outDir}" --proxy ${base.origin}`);
process.exit(fails ? 1 : 0);
