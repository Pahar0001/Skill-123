#!/usr/bin/env node
/**
 * Есть ли у шрифта кириллица — проверка отрисовкой, а не по описанию.
 *
 *   node cyrillic-check.mjs "Oswald" "Bebas Neue:400" ...
 *   node cyrillic-check.mjs --css https://site/fonts.css "Свой Шрифт"
 *   node cyrillic-check.mjs --selftest
 *   node cyrillic-check.mjs --help | -h
 *
 * Гарнитура[:вес] — вес по умолчанию 400; стили берутся с Google Fonts, свои — через
 * --css <адрес стилей> (один на все шрифты запуска). --selftest проверяет сам способ:
 * Oswald должен дать «кириллица есть», Bebas Neue — «кириллицы НЕТ».
 *
 * Печатает по строке на шрифт: «кириллица есть» | «кириллицы НЕТ» | «не загрузился».
 * Код выхода: 0 — у всех кириллица есть (для --selftest — самопроверка пройдена) и после
 * --help/-h; 1 — иначе, а также без шрифтов и при --css без адреса. Файлов не пишет;
 * сервер на 127.0.0.1 со случайным портом и Chrome поднимаются только для проверки и
 * закрываются. Нужен доступ к fonts.googleapis.com (или к адресу из --css).
 *
 * Способ: на странице настоящего сервера (иначе браузер не заберёт
 * внешние стили) слово набирается шрифтом с запасным monospace и с
 * запасным serif. Слово — без пробелов: пробел рисует сам шрифт, и ширина
 * из-за него отличается даже тогда, когда все буквы взяты из запасного.
 * Если ширина совпала с чистым запасным в обоих случаях —
 * кириллицу отрисовал запасной, у шрифта её нет. Латиница проверяется
 * тем же способом: если и она «не загрузилась», виноват не шрифт, а сеть.
 */
import fs from 'node:fs';
import http from 'node:http';
import { launch, parseArgs, sleep } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h', 'selftest'], values: ['css'] });
/* справка — до сервера и браузера: раньше «-h» уходил в названия шрифтов и запускал Chrome */
if (opt.help || opt.h || pos.includes('-h')) {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).split(/\r?\n/).map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
  process.exit(0);
}
if (opt.css === true) { console.error('--css без адреса: --css https://site/fonts.css "Свой Шрифт"'); process.exit(1); }
const fonts = opt.selftest ? ['Oswald', 'Bebas Neue'] : pos;
if (!fonts.length) { console.error('Нужны названия гарнитур, например: node cyrillic-check.mjs "Oswald" "Bebas Neue" (--help — справка)'); process.exit(1); }

const server = http.createServer((_, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><body></body>'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const browser = await launch();
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(origin);
  for (const spec of fonts) {
    const [family, weight = '400'] = spec.split(':');
    const href = typeof opt.css === 'string' ? opt.css : `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight}&display=swap`;
    const r = await page.evaluate(async (family, weight, href) => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
      const loaded = new Promise((ok) => { link.onload = () => ok(true); link.onerror = () => ok(false); });
      document.head.appendChild(link);
      const sheetOk = await loaded;
      try { await document.fonts.load(`${weight} 40px "${family}"`, 'Жёлудь Щи Ёж'); await document.fonts.load(`${weight} 40px "${family}"`, 'Handglove'); } catch { /* нет такого шрифта — увидим по ширине */ }
      const width = (text, stack) => { const s = document.createElement('span'); s.style.cssText = `font:${weight} 40px ${stack};position:absolute;white-space:nowrap;visibility:hidden`; s.textContent = text; document.body.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return Math.round(w * 100) / 100; };
      const probe = (text) => ['monospace', 'serif'].map((fb) => width(text, `"${family}", ${fb}`) === width(text, fb));
      const cyr = probe('ЖёлудьЩиЁжФЫВА'), lat = probe('HandgloveRQWM');
      return { sheetOk, cyrFallback: cyr.every(Boolean), latFallback: lat.every(Boolean) };
    }, family, weight, href);
    await sleep(50);
    const verdict = !r.sheetOk || r.latFallback ? 'не загрузился' : r.cyrFallback ? 'кириллицы НЕТ' : 'кириллица есть';
    results.push({ family, weight, verdict });
    console.log(`${verdict.padEnd(16)} ${family} ${weight}`);
  }
} finally { await browser.close(); server.close(); }

if (opt.selftest) {
  const ok = results[0].verdict === 'кириллица есть' && results[1].verdict === 'кириллицы НЕТ';
  console.log(ok ? '\nСамопроверка пройдена: шрифт с кириллицей и без неё различаются.' : '\nСамопроверка НЕ пройдена — результатам этого запуска верить нельзя.');
  process.exit(ok ? 0 : 1);
}
console.log('\n«Ё» в капсе проверить глазами на живом наборе: подмена на «Е» недопустима.');
process.exit(results.some((r) => r.verdict !== 'кириллица есть') ? 1 : 0);
