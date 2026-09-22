#!/usr/bin/env node
/**
 * Зеркало чужой страницы как верстак: когда исходников сайта нет, а
 * переработку показать надо. Сохраняется отрисованный DOM с абсолютными
 * адресами картинок, шрифтов и скриптов (они грузятся с оригинала), стили
 * скачиваются в css/ и подключаются локально, а поверх добавляются два
 * пустых файла — rework.css и rework.js. Все правки делаются в них и в
 * HTML: так изменения остаются отделёнными от оригинала и переносятся на
 * настоящий сайт как понятный патч.
 *
 *   node mirror.mjs <url> [--out папка] [--pages /,/about] [--no-scripts] [--viewport desktop]
 *
 * Результат: <папка>/mirror/index.html (и <slug>.html для других страниц),
 * css/, rework.css, rework.js, MIRROR.md с ограничениями.
 * Смотреть: node serve.mjs <папка>/mirror
 *
 * Чего зеркало не умеет: серверные формы и API (отправка уйдёт на оригинал
 * или упадёт), страницы за логином, всё, что оригинальные скрипты строят из
 * сети по относительным адресам. Для боевого сайта зеркало — не замена
 * исходникам, а способ показать и проверить идею до правок в них.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, scrollThrough, VIEWPORTS, parseArgs, runDir, ensureDir, pageSlug, pagesFrom } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
if (!pos[0]) { console.error('Нужен адрес: node mirror.mjs <url> [--out папка] [--pages /,/about] [--no-scripts]'); process.exit(1); }
const base = new URL(pos[0]);
const run = runDir(opt, pos[0]);
const outDir = ensureDir(path.join(run, 'mirror'));
const cssDir = ensureDir(path.join(outDir, 'css'));
const pages = opt.pages ? pagesFrom(opt.pages, base) : [base.href];
if (!pages.includes(base.href)) pages.unshift(base.href);
const vp = VIEWPORTS[opt.viewport || 'desktop'];

/* относительные url() внутри CSS делаем абсолютными от адреса самого файла */
const absCss = (css, from) => css.replace(/url\(\s*(['"]?)(?!data:|https?:|\/\/|#)([^'")]+)\1\s*\)/g, (m, q, u) => { try { return `url(${q}${new URL(u.trim(), from).href}${q})`; } catch { return m; } }).replace(/@import\s+(['"])(?!https?:|\/\/)([^'"]+)\1/g, (m, q, u) => { try { return `@import ${q}${new URL(u, from).href}${q}`; } catch { return m; } });

const browser = await launch();
const cssSaved = new Map();
const notes = [];
try {
  for (const url of pages) {
    const slug = pageSlug(url);
    process.stdout.write(`· ${slug} … `);
    const page = await openPage(browser, url, vp);
    await scrollThrough(page, { pause: 200 });
    /* в самой странице: абсолютные адреса, сбор ссылок на стили */
    const { html, sheets } = await page.evaluate((stripScripts) => {
      const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
      for (const el of document.querySelectorAll('[src]')) if (!/^(data:|blob:)/.test(el.getAttribute('src') || '')) el.setAttribute('src', abs(el.getAttribute('src')));
      for (const el of document.querySelectorAll('[href]')) { const h = el.getAttribute('href') || ''; if (!/^(#|mailto:|tel:|javascript:|data:)/.test(h)) el.setAttribute('href', abs(h)); }
      for (const el of document.querySelectorAll('[srcset]')) el.setAttribute('srcset', el.getAttribute('srcset').split(',').map((c) => { const [u, d] = c.trim().split(/\s+/); return [abs(u), d].filter(Boolean).join(' '); }).join(', '));
      for (const el of document.querySelectorAll('[poster]')) el.setAttribute('poster', abs(el.getAttribute('poster')));
      for (const el of document.querySelectorAll('[data-src]')) el.setAttribute('data-src', abs(el.getAttribute('data-src')));
      for (const el of document.querySelectorAll('[style*="url("]')) el.setAttribute('style', el.getAttribute('style').replace(/url\(\s*(['"]?)(?!data:|https?:|\/\/)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${abs(u)}${q})`));
      for (const st of document.querySelectorAll('style')) st.textContent = st.textContent.replace(/url\(\s*(['"]?)(?!data:|https?:|\/\/)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${abs(u)}${q})`);
      const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l, i) => { const href = l.href; l.setAttribute('data-rw-sheet', i); return href; });
      document.querySelectorAll('base').forEach((b) => b.remove());
      if (stripScripts) document.querySelectorAll('script').forEach((s) => s.remove());
      document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach((m) => m.remove());
      return { html: '<!DOCTYPE html>\n' + document.documentElement.outerHTML, sheets };
    }, !!opt['no-scripts']);
    await page.close();
    let out = html;
    /* стили: скачать и подключить локально */
    for (let i = 0; i < sheets.length; i++) {
      const href = sheets[i]; let local = cssSaved.get(href);
      if (!local) {
        try { const r = await fetch(href, { headers: { 'user-agent': 'Mozilla/5.0' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const css = absCss(await r.text(), href); local = `css/${String(cssSaved.size + 1).padStart(2, '0')}-${(new URL(href).pathname.split('/').pop() || 'style').replace(/[^a-z0-9._-]/gi, '_').slice(0, 40).replace(/\.css$/i, '')}.css`; fs.writeFileSync(path.join(outDir, local), `/* ${href} */\n` + css); cssSaved.set(href, local); }
        catch (e) { notes.push(`Стиль не скачался, оставлен с оригинала: ${href} (${e.message})`); local = null; }
      }
      if (local) out = out.replace(new RegExp(`<link[^>]*data-rw-sheet="${i}"[^>]*>`), (tag) => tag.replace(/href="[^"]*"/, `href="${local}"`));
    }
    out = out.replace(/ data-rw-sheet="\d+"/g, '');
    out = out.replace(/<\/head>/i, '  <link rel="stylesheet" href="rework.css">\n</head>').replace(/<\/body>/i, '  <script src="rework.js" defer></script>\n</body>');
    /* адрес из брифа — всегда index.html, остальные страницы — по своему пути */
    const file = path.join(outDir, url === base.href ? 'index.html' : `${slug}.html`);
    fs.writeFileSync(file, out);
    console.log(`ок → ${path.basename(file)} (${Math.round(out.length / 1024)} КБ, стилей ${sheets.length})`);
  }
} finally { await browser.close(); }

for (const [name, header] of [['rework.css', '/* Правки поверх оригинала. Переменные оригинала — в css/, сюда только новое и переопределения. */\n'], ['rework.js', '/* Поведение поверх оригинала. Скрипты оригинала грузятся с его сервера, сюда — своё. */\n']]) {
  const f = path.join(outDir, name); if (!fs.existsSync(f)) fs.writeFileSync(f, header);
}
fs.writeFileSync(path.join(outDir, 'MIRROR.md'), `# Зеркало ${base.href}

Снято ${new Date().toLocaleDateString('sv-SE')}. Это верстак, а не копия сайта.

- HTML — отрисованный DOM после прокрутки; адреса картинок, шрифтов и скриптов абсолютные, грузятся с оригинала.
- Стили скачаны в \`css/\` и подключены локально: их можно править, но лучше переопределять в \`rework.css\`.
- \`rework.css\` и \`rework.js\` подключены последними — все новые правки сюда и в HTML.
- Скрипты оригинала ${opt['no-scripts'] ? 'удалены (--no-scripts)' : 'остались и выполняются'}; если они ломают зеркало — пересобрать с \`--no-scripts\` и написать нужное поведение в \`rework.js\`.
- Формы и API уходят на оригинал или не работают. Страницы за логином не снимаются.

Смотреть: \`node <скилл>/scripts/serve.mjs "${outDir}" --proxy ${base.origin}\` — с --proxy запросы к API и формам уходят на оригинал.
Снимки «до» для сравнения снимать с этого же адреса до правок (shots.mjs --tag before), «после» — с него же.

Перенос на настоящий сайт: \`rework.css\` → в стили сайта, \`rework.js\` → в скрипты, правки HTML — по diff между этим файлом и свежим зеркалом.
${notes.length ? '\nЗамечания:\n' + notes.map((n) => `- ${n}`).join('\n') + '\n' : ''}`);
console.log(`Зеркало: ${outDir}${notes.length ? `\n${notes.join('\n')}` : ''}`);
