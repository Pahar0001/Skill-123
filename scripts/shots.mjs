#!/usr/bin/env node
/**
 * Снимки для сравнения «до» и «после»: одинаковые экраны, одинаковые условия.
 *
 *   node shots.mjs <url> [--out папка] [--tag before|after] [--viewports desktop,tablet,mobile]
 *                  [--pages /,/about,/contacts] [--no-freeze] [--scheme dark]
 *
 * Каждая страница на каждом экране: первый экран и вся страница —
 * <папка>/<tag>/<страница>-<экран>-first.png и -full.png. Имена одинаковые
 * для before и after, чтобы diff.mjs сложил их в пары.
 *
 * Перед снимком страница прокручивается до конца (ленивое подгружается,
 * появления срабатывают), затем движение останавливается: конечные анимации
 * доигрываются, бесконечные ставятся на паузу, переходы отключаются. Иначе
 * два снимка одной и той же страницы различались бы фазой анимации.
 * --no-freeze отключает это, если нужно поймать именно фазу.
 */
import path from 'node:path';
import { launch, openPage, scrollThrough, freezeMotion, fullPageShot, pickViewports, parseArgs, runDir, writeJson, ensureDir, pageSlug, pagesFrom, sleep } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
if (!pos[0]) { console.error('Нужен адрес: node shots.mjs <url> [--tag before|after] [--pages /,/about] [--viewports ...]'); process.exit(1); }
const base = new URL(pos[0]);
const run = runDir(opt, pos[0]);
const tag = opt.tag || 'before';
const outDir = ensureDir(path.join(run, tag));
const pages = opt.pages ? pagesFrom(opt.pages, base) : [base.href];
const viewports = pickViewports(opt.viewports);

const browser = await launch();
const index = [];
try {
  for (const url of pages) {
    const slug = pageSlug(url);
    for (const [name, vp] of viewports) {
      process.stdout.write(`· ${slug} ${name} … `);
      try {
        const page = await openPage(browser, url, vp, { scheme: opt.scheme || 'light' });
        const first = path.join(outDir, `${slug}-${name}-first.png`);
        await scrollThrough(page, { pause: 250 });
        if (!opt['no-freeze']) await freezeMotion(page);
        await sleep(200);
        await page.screenshot({ path: first });
        const full = path.join(outDir, `${slug}-${name}-full.png`);
        const how = await fullPageShot(page, full);
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        const errors = page.log.console.filter((c) => c.type === 'error').length + page.log.errors.length;
        index.push({ url, page: slug, viewport: name, first: path.basename(first), full: path.basename(full), fullMode: how, height: h, consoleErrors: errors });
        console.log(`ок, высота ${h}px${how !== 'full' ? ` (вся страница снята как ${how})` : ''}${errors ? `, ошибок в консоли ${errors}` : ''}`);
        await page.close();
      } catch (e) { console.log(`сбой: ${e.message}`); index.push({ url, page: slug, viewport: name, error: e.message }); }
    }
  }
} finally { await browser.close(); }
writeJson(path.join(outDir, 'shots.json'), { tag, takenAt: new Date().toISOString(), shots: index });
console.log(`Снимки: ${outDir}`);
