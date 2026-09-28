#!/usr/bin/env node
/**
 * Есть ли у шрифта кириллица и нужные знаки — проверка отрисовкой, а не по описанию.
 *
 *   node cyrillic-check.mjs "Oswald" "Bebas Neue:400" ...
 *   node cyrillic-check.mjs --css https://site/fonts.css "Свой Шрифт"
 *   node cyrillic-check.mjs fonts/commissioner-cyrillic.woff2 --chars "₽«»"
 *   node cyrillic-check.mjs "Oswald" --lang en
 *   node cyrillic-check.mjs --selftest
 *   node cyrillic-check.mjs --help | -h
 *
 * Гарнитура[:вес] — вес по умолчанию 400; стили берутся с Google Fonts, свои — через
 * --css <адрес стилей> (один на все шрифты запуска; проба идёт на адресе этих стилей — шрифты сайта
 * без CORS иначе не грузятся). Существующий файл шрифта (.woff2, .woff,
 * .ttf, .otf) — проверяется сам файл: так видно, что лежит в одном подмножестве (файл
 * «cyrillic» с Google Fonts без «latin» и «latin-ext» — без кавычек, тире и ₽).
 *
 *   --chars "<знаки>"  какие знаки проверить, кроме кириллицы: каждый — той же пробой шириной.
 *                      По умолчанию для --lang ru: ₽№«»„“—–…Ёё и Ż (на VN3D Ż в подписи фото
 *                      рисовался системным шрифтом); --chars "" — только кириллица
 *   --lang <код>       язык сайта, по умолчанию ru; другой язык без --chars — только
 *                      кириллица, как раньше
 *
 * Знаки у Google Fonts разложены по подмножествам: ₽ и Ż — в latin-ext, «»„“—–… — в latin,
 * № и Ё — в cyrillic. Сайт, который грузит только cyrillic и latin (или свой файл одного
 * подмножества), рисует ₽ системным шрифтом. Подмножества сайта сверять с unicode-range его
 * @font-face (--css <его стили> проверяет ровно то, что грузит сайт).
 *
 * --selftest проверяет сам способ: Oswald должен дать «кириллица есть», Bebas Neue — «кириллицы
 * НЕТ» (нужна сеть); файлы fixtures/fonts без сети: Commissioner cyrillic — кириллица есть, нет
 * ₽«»„“—–…Ż; Commissioner latin — кириллицы нет, «»„“—–… есть, ₽ нет.
 *
 * Печатает по строке на шрифт: «кириллица есть» | «кириллицы НЕТ» | «не загрузился», для знаков —
 * «; нет знаков: ₽Ż» или «; знаки есть». Код выхода: 0 — у всех кириллица и знаки есть (для
 * --selftest — самопроверка пройдена) и после --help/-h; 2 — кириллица есть у всех, но каких-то
 * знаков нет; 1 — иначе (кириллицы нет, не загрузился), а также без шрифтов и при --css без адреса.
 * Файлов не пишет; сервер на 127.0.0.1 со случайным портом и Chrome поднимаются только для
 * проверки и закрываются. Нужен доступ к fonts.googleapis.com (или к адресу из --css), файлы — нет.
 *
 * Способ: на странице настоящего сервера (иначе браузер не заберёт
 * внешние стили) слово набирается шрифтом с запасным monospace и с
 * запасным serif. Слово — без пробелов: пробел рисует сам шрифт, и ширина
 * из-за него отличается даже тогда, когда все буквы взяты из запасного.
 * Если ширина совпала с чистым запасным в обоих случаях —
 * кириллицу отрисовал запасной, у шрифта её нет. Латиница проверяется
 * тем же способом: если и она «не загрузилась», виноват не шрифт, а сеть.
 * Каждый знак из --chars — так же, отдельно (прототип wf1/typography/glyph-probe.mjs).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, parseArgs, sleep } from './lib.mjs';

/** Знаки по умолчанию для русского сайта: рубль, номер, кавычки, тире, многоточие, Ё — и Ż (подписи авторов фото). */
export const RU_CHARS = '₽№«»„“—–…ЁёŻ';
const FONT_FILE = /\.(woff2?|ttf|otf)$/i;
const MIME = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h', 'selftest'], values: ['css', 'chars', 'lang'] });
/* справка — до сервера и браузера: раньше «-h» уходил в названия шрифтов и запускал Chrome */
if (opt.help || opt.h || pos.includes('-h')) {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).split(/\r?\n/).map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
  process.exit(0);
}
if (opt.css === true) { console.error('--css без адреса: --css https://site/fonts.css "Свой Шрифт"'); process.exit(1); }
if (opt.lang === true) { console.error('--lang без кода: --lang ru | en | …'); process.exit(1); }
if (opt.chars === true) { console.error('--chars без знаков: --chars "₽№«»" (--chars "" — только кириллица)'); process.exit(1); }
const lang = (typeof opt.lang === 'string' ? opt.lang : 'ru').trim().toLowerCase();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'fonts');
/* самопроверка: Google Fonts (сеть) и файлы подмножеств Commissioner (без сети) */
const SELF = [
  { spec: 'Oswald', cyr: 'кириллица есть' },
  { spec: 'Bebas Neue', cyr: 'кириллицы НЕТ' },
  { spec: path.join(FIX, 'commissioner-cyrillic.woff2'), cyr: 'кириллица есть', has: '№Ёё', miss: '₽«»„“—–…Ż' },
  { spec: path.join(FIX, 'commissioner-latin.woff2'), cyr: 'кириллицы НЕТ', has: '«»„“—–…', miss: '₽№ЁёŻ' },
];
const fonts = opt.selftest ? SELF.map((x) => x.spec) : pos;
if (!fonts.length) { console.error('Нужны названия гарнитур или файлы шрифтов, например: node cyrillic-check.mjs "Oswald" "Bebas Neue" (--help — справка)'); process.exit(1); }
const chars = [...new Set([...(opt.selftest ? RU_CHARS : typeof opt.chars === 'string' ? opt.chars : lang === 'ru' ? RU_CHARS : '')].filter((c) => /\S/.test(c)))].join('');

/* файлы шрифтов отдаёт тот же сервер: страница http:// не читает file:// */
const files = fonts.map((s) => (FONT_FILE.test(s) && fs.existsSync(s) ? path.resolve(s) : null));
for (let i = 0; i < fonts.length; i++) if (!files[i] && FONT_FILE.test(fonts[i])) { console.error(`Нет файла шрифта: ${fonts[i]}`); process.exit(1); }
const server = http.createServer((req, res) => {
  const m = /^\/f\/(\d+)$/.exec(req.url || '');
  res.setHeader('access-control-allow-origin', '*');
  if (m && files[+m[1]]) { const f = files[+m[1]]; res.setHeader('content-type', MIME[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream'); fs.createReadStream(f).pipe(res); return; }
  res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><body></body>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const browser = await launch();
const results = [];
try {
  const page = await browser.newPage();
  /* --css с адресом сайта: проба — на его же адресе, иначе его шрифты без CORS не загрузятся (свой сервер
     serve.mjs, многие хостинги); не открылся — своя пустая страница */
  const cssOrigin = typeof opt.css === 'string' && /^https?:/i.test(opt.css) ? new URL(opt.css).origin + '/' : null;
  let where = origin;
  if (cssOrigin) { try { const resp = await page.goto(cssOrigin, { waitUntil: 'domcontentloaded', timeout: 30000 }); if (resp) where = cssOrigin; } catch { /* своя страница */ } }
  if (where === origin) await page.goto(origin);
  for (let i = 0; i < fonts.length; i++) {
    const spec = fonts[i], file = files[i];
    const [family, weight = '400'] = file ? [`Probe File ${i}`, '400'] : spec.split(':');
    const href = file ? null : typeof opt.css === 'string' ? opt.css : `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight}&display=swap`;
    const r = await page.evaluate(async (family, weight, href, fileUrl, chars) => {
      let sheetOk = true;
      if (fileUrl) {
        try { const ff = new FontFace(family, `url(${fileUrl})`); await ff.load(); document.fonts.add(ff); } catch { sheetOk = false; }
      } else {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
        const loaded = new Promise((ok) => { link.onload = () => ok(true); link.onerror = () => ok(false); });
        document.head.appendChild(link);
        sheetOk = await loaded;
      }
      /* подмножества (unicode-range) грузятся по тексту — просим и кириллицу, и латиницу, и знаки */
      try { await document.fonts.load(`${weight} 40px "${family}"`, 'Жёлудь Щи Ёж'); await document.fonts.load(`${weight} 40px "${family}"`, 'Handglove'); if (chars) await document.fonts.load(`${weight} 40px "${family}"`, chars); } catch { /* нет такого шрифта — увидим по ширине */ }
      const width = (text, stack) => { const s = document.createElement('span'); s.style.cssText = `font:${weight} 40px ${stack};position:absolute;white-space:pre;visibility:hidden`; s.textContent = text; document.body.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return Math.round(w * 100) / 100; };
      const probe = (text) => ['monospace', 'serif'].map((fb) => width(text, `"${family}", ${fb}`) === width(text, fb));
      const cyr = probe('ЖёлудьЩиЁжФЫВА'), lat = probe('HandgloveRQWM');
      const missing = [...chars].filter((c) => probe(c).every(Boolean)).join('');
      return { sheetOk, cyrFallback: cyr.every(Boolean), latFallback: lat.every(Boolean), missing };
    }, family, weight, href, file ? `${origin}f/${i}` : null, chars);
    await sleep(50);
    /* файл загрузился — это знает FontFace.load(); латиницы в нём может не быть (подмножество cyrillic) */
    const verdict = !r.sheetOk || (r.latFallback && !file) ? 'не загрузился' : r.cyrFallback ? 'кириллицы НЕТ' : 'кириллица есть';
    const note = !chars || verdict === 'не загрузился' ? '' : r.missing ? `; нет знаков: ${r.missing}` : '; знаки есть';
    const name = file ? `${path.basename(file)} (файл)` : `${family} ${weight}`;
    results.push({ spec, family, weight, verdict, missing: verdict === 'не загрузился' ? null : r.missing });
    console.log(`${(verdict + note).padEnd(16)} ${name}`);
  }
} finally { await browser.close(); server.close(); }

if (opt.selftest) {
  let ok = true;
  results.forEach((r, i) => {
    const e = SELF[i]; let good = r.verdict === e.cyr;
    if (good && e.miss) good = [...e.miss].every((c) => r.missing.includes(c)) && ![...e.has].some((c) => r.missing.includes(c));
    if (!good) { ok = false; console.log(`  НЕ ТАК: ${path.basename(e.spec)} — ждали «${e.cyr}»${e.miss ? `, нет ${e.miss}, есть ${e.has}` : ''}`); }
  });
  console.log(ok ? `\nСамопроверка пройдена (${results.length} из ${SELF.length}): шрифт с кириллицей и без неё различаются, знаки подмножеств — тоже.` : '\nСамопроверка НЕ пройдена — результатам этого запуска верить нельзя.');
  process.exit(ok ? 0 : 1);
}
if (chars && results.some((r) => r.missing)) console.log(`\nЗнаки Google Fonts: ₽ и Ż — в latin-ext, «»„“—–… — в latin, № и Ё — в cyrillic; подмножества сайта сверять с unicode-range его @font-face (--css <его стили>).`);
console.log('\n«Ё» в капсе проверить глазами на живом наборе: подмена на «Е» недопустима.');
const noCyr = results.some((r) => r.verdict !== 'кириллица есть');
process.exit(noCyr ? 1 : chars && results.some((r) => r.missing) ? 2 : 0);
