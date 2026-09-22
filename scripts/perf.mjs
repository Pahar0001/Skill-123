#!/usr/bin/env node
/**
 * Замер скорости в живом браузере, с бюджетами и вердиктом.
 *
 *   node perf.mjs <url> [--viewport mobile] [--out папка] [--tag имя]
 *                 [--cpu 4] [--net fast3g|slow4g|none] [--runs 3]
 *
 * Что измеряется: TTFB, FCP, LCP, CLS, долгие задачи, вес по типам ресурсов
 * (сжатый, как передано по сети), самые тяжёлые файлы, память JS, узлы DOM,
 * кадры в секунду при прокрутке и в покое (важно для анимаций и WebGL),
 * картинки, загруженные крупнее показанного.
 *
 * По умолчанию мобильный экран, процессор в 4 раза медленнее, сеть fast3g —
 * так смотрит на сайт покупатель с телефона, а не разработчик с ноутбука.
 * Цифры одного прогона плавают на ±20%: для решения «стало хуже или нет»
 * брать --runs 3 — каждый прогон в свежем браузере, в таблицу идёт медиана,
 * рядом разброс.
 *
 * Бюджеты (хорошо / терпимо): LCP 2.5 с / 4 с · CLS 0.1 / 0.25 · JS 300 / 600 КБ ·
 * картинки 1000 / 2500 КБ · всего 2000 / 5000 КБ · долгие задачи 300 / 800 мс ·
 * прокрутка 55 / 40 кадров/с.
 */
import path from 'node:path';
import { launch, preparePage, gotoRetry, VIEWPORTS, parseArgs, runDir, writeJson, sleep, ensureDir } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
if (!pos[0]) { console.error('Нужен адрес: node perf.mjs <url> [--viewport mobile] [--cpu 4] [--net fast3g|slow4g|none] [--runs 3]'); process.exit(1); }
const url = pos[0];
const vpName = opt.viewport || 'mobile'; const vp = VIEWPORTS[vpName];
if (!vp) { console.error(`Неизвестный экран ${vpName}`); process.exit(1); }
const cpu = opt.cpu === undefined ? (vp.isMobile ? 4 : 1) : Number(opt.cpu);
const netName = opt.net || (vp.isMobile ? 'fast3g' : 'none');
const NET = { none: null, fast3g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }, slow4g: { latency: 100, downloadThroughput: 4e6 / 8, uploadThroughput: 3e6 / 8 } };
if (!(netName in NET)) { console.error('Сеть: none, fast3g или slow4g'); process.exit(1); }
const runs = Math.max(1, Math.min(9, Number(opt.runs) || 1));
const run = runDir(opt, url); const outDir = ensureDir(path.join(run, 'perf'));
const tag = opt.tag || `${vpName}-${netName}-cpu${cpu}`;

/* ---------- один прогон в свежем браузере ---------- */
async function measure() {
  const browser = await launch();
  try {
    const page = await preparePage(browser, vp);
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    if (NET[netName]) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NET[netName] });
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await cdp.send('Performance.enable');
    const req = new Map(); const res = [];
    cdp.on('Network.responseReceived', (e) => req.set(e.requestId, { url: e.response.url, type: e.type, mime: e.response.mimeType, fromCache: !!e.response.fromDiskCache }));
    cdp.on('Network.loadingFinished', (e) => { const r = req.get(e.requestId); if (r) res.push({ ...r, bytes: e.encodedDataLength }); });

    await page.evaluateOnNewDocument(() => {
      window.__rw = { lcp: 0, cls: 0, longTasks: 0, longTotal: 0 };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__rw.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* нет */ }
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__rw.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* нет */ }
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__rw.longTasks++; window.__rw.longTotal += e.duration; } }).observe({ type: 'longtask', buffered: true }); } catch { /* нет */ }
    });

    const t0 = Date.now();
    await gotoRetry(page, url, { timeout: 90000 });
    const loadMs = Date.now() - t0;
    await sleep(1500);
    const idleFps = await page.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
    /* прокрутка: считаем кадры во время реального скролла, попутно CLS и ленивые картинки */
    const scroll = await page.evaluate(() => new Promise((r) => { const total = Math.max(0, document.documentElement.scrollHeight - innerHeight); let y = 0, n = 0; const s = performance.now(); const step = Math.max(8, total / 150); const f = () => { y += step; scrollTo(0, Math.min(y, total)); n++; if (y < total && performance.now() - s < 4000) requestAnimationFrame(f); else r({ frames: n, ms: Math.round(performance.now() - s), distance: Math.round(Math.min(y, total)) }); }; requestAnimationFrame(f); }));
    await sleep(800);
    await page.evaluate(() => scrollTo(0, 0)); await sleep(500);
    const m = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0] || {}; const p = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]));
      const imgs = [...document.images].filter((i) => i.naturalWidth > 0);
      const oversized = imgs.filter((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && i.naturalWidth > r.width * devicePixelRatio * 1.5; }).map((i) => ({ src: (i.currentSrc || i.src).split('/').pop().split('?')[0].slice(0, 50), natural: `${i.naturalWidth}×${i.naturalHeight}`, shown: `${Math.round(i.getBoundingClientRect().width)}×${Math.round(i.getBoundingClientRect().height)}` })).slice(0, 8);
      return { ttfb: Math.round(n.responseStart || 0), domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0), fcp: p['first-contentful-paint'] || null, lcp: window.__rw.lcp || null, cls: Math.round(window.__rw.cls * 1000) / 1000, longTasks: window.__rw.longTasks, longTotal: Math.round(window.__rw.longTotal), nodes: document.getElementsByTagName('*').length, images: imgs.length, oversized, fonts: [...document.fonts].filter((f) => f.status === 'loaded').length, canvases: document.querySelectorAll('canvas').length, animations: document.getAnimations().length };
    });
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    return { loadMs, m, res, idleFps, scroll, fpsScroll: scroll.ms ? Math.round(scroll.frames / scroll.ms * 1000) : null, heapMb: Math.round((metrics.JSHeapUsedSize || 0) / 1048576), scriptMs: Math.round((metrics.ScriptDuration || 0) * 1000), layoutCount: metrics.LayoutCount, styleRecalcs: metrics.RecalcStyleCount };
  } finally { await browser.close(); }
}

const samples = [];
for (let i = 0; i < runs; i++) {
  if (runs > 1) process.stdout.write(`· прогон ${i + 1}/${runs} … `);
  try { const s = await measure(); samples.push(s); if (runs > 1) console.log(`LCP ${s.m.lcp} мс · FCP ${s.m.fcp} мс · CLS ${s.m.cls} · долгие ${s.m.longTotal} мс`); }
  catch (e) { console.log(`сбой: ${e.message}`); }
}
if (!samples.length) { console.error('FAIL: ни один прогон не удался'); process.exit(1); }

/* медиана по каждому числу; сеть и списки — из прогона с медианным LCP */
const med = (arr) => { const a = arr.filter((v) => v != null && !Number.isNaN(v)).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
const pick = (f) => med(samples.map(f));
const spread = (f, unit = '') => { const a = samples.map(f).filter((v) => v != null); return runs > 1 && a.length ? `${Math.min(...a)}–${Math.max(...a)}${unit}` : ''; };
const medLcp = pick((s) => s.m.lcp);
const ref = samples.find((s) => s.m.lcp === medLcp) || samples[0];
const m = { ...ref.m, ttfb: pick((s) => s.m.ttfb), fcp: pick((s) => s.m.fcp), lcp: medLcp, cls: pick((s) => s.m.cls), longTotal: pick((s) => s.m.longTotal), longTasks: pick((s) => s.m.longTasks), nodes: pick((s) => s.m.nodes) };
const idleFps = pick((s) => s.idleFps), fpsScroll = pick((s) => s.fpsScroll), heapMb = pick((s) => s.heapMb), loadMs = pick((s) => s.loadMs);
const res = ref.res;

/* вес по типам — сжатый, как передано по сети */
const by = {};
const kind = (r) => { const t = (r.type || '').toLowerCase(); const mm = r.mime || ''; if (t === 'document') return 'html'; if (t === 'script' || /javascript/.test(mm)) return 'js'; if (t === 'stylesheet' || /css/.test(mm)) return 'css'; if (t === 'image' || /^image\//.test(mm)) return 'images'; if (t === 'font' || /font/.test(mm)) return 'fonts'; if (t === 'media' || /^(video|audio)\//.test(mm)) return 'media'; if (t === 'xhr' || t === 'fetch') return 'api'; return 'other'; };
for (const r of res) { const k = kind(r); by[k] = by[k] || { count: 0, kb: 0 }; by[k].count++; by[k].kb += r.bytes / 1024; }
for (const k in by) by[k].kb = Math.round(by[k].kb);
const totalKb = Math.round(res.reduce((a, r) => a + r.bytes, 0) / 1024);
const largest = [...res].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((r) => ({ file: r.url.split('/').pop().split('?')[0].slice(0, 50) || r.url.slice(0, 50), kind: kind(r), kb: Math.round(r.bytes / 1024) }));
const thirdParty = Math.round(res.filter((r) => { try { return new URL(r.url).hostname !== new URL(url).hostname; } catch { return false; } }).reduce((a, r) => a + r.bytes, 0) / 1024);

/* бюджеты */
const B = (v, good, ok, unit, lowerBetter = true, sp = '') => { const s = v == null ? 'n/a' : lowerBetter ? (v <= good ? 'OK' : v <= ok ? 'WARN' : 'FAIL') : (v >= good ? 'OK' : v >= ok ? 'WARN' : 'FAIL'); return { value: v, unit, status: s, budget: `${good}${unit} / ${ok}${unit}`, spread: sp }; };
const checks = {
  'LCP (самый крупный элемент)': B(m.lcp, 2500, 4000, ' мс', true, spread((s) => s.m.lcp, ' мс')),
  'FCP (первая отрисовка)': B(m.fcp, 1800, 3000, ' мс', true, spread((s) => s.m.fcp, ' мс')),
  'TTFB (ответ сервера)': B(m.ttfb, 800, 1800, ' мс', true, spread((s) => s.m.ttfb, ' мс')),
  'CLS (сдвиги вёрстки)': B(m.cls, 0.1, 0.25, '', true, spread((s) => s.m.cls)),
  'Долгие задачи, всего': B(m.longTotal, 300, 800, ' мс', true, spread((s) => s.m.longTotal, ' мс')),
  'JS по сети': B(by.js ? by.js.kb : 0, 300, 600, ' КБ'),
  'Картинки по сети': B(by.images ? by.images.kb : 0, 1000, 2500, ' КБ'),
  'Шрифты по сети': B(by.fonts ? by.fonts.kb : 0, 150, 400, ' КБ'),
  'Всего по сети': B(totalKb, 2000, 5000, ' КБ'),
  'Кадров/с при прокрутке': B(fpsScroll, 55, 40, '', false, spread((s) => s.fpsScroll)),
  'Кадров/с в покое': B(idleFps, 55, 40, '', false, spread((s) => s.idleFps)),
  'Узлов DOM': B(m.nodes, 1500, 3000, ''),
  'Память JS': B(heapMb, 30, 80, ' МБ', true, spread((s) => s.heapMb, ' МБ')),
};
const worst = Object.values(checks).some((c) => c.status === 'FAIL') ? 'FAIL' : Object.values(checks).some((c) => c.status === 'WARN') ? 'WARN' : 'OK';

console.log(`Условия: ${vpName} ${vp.width}×${vp.height}, процессор ×${cpu} медленнее, сеть ${netName}${runs > 1 ? `, прогонов ${samples.length} (медиана)` : ''} · загрузка до тишины ${loadMs} мс`);
console.log(runs > 1 ? '| показатель | медиана | разброс | бюджет (хорошо / терпимо) | вердикт |\n|---|---|---|---|---|' : '| показатель | значение | бюджет (хорошо / терпимо) | вердикт |\n|---|---|---|---|');
for (const [k, c] of Object.entries(checks)) console.log(runs > 1 ? `| ${k} | ${c.value == null ? '—' : c.value}${c.unit} | ${c.spread || '—'} | ${c.budget} | ${c.status} |` : `| ${k} | ${c.value == null ? '—' : c.value}${c.unit} | ${c.budget} | ${c.status} |`);
console.log(`\nПо сети (${res.length} ответов): ${Object.entries(by).map(([k, v]) => `${k} ${v.count}/${v.kb} КБ`).join(' · ')} · сторонние домены ${thirdParty} КБ`);
console.log(`Самое тяжёлое: ${largest.map((l) => `${l.file} ${l.kb} КБ`).join('; ')}`);
if (m.oversized.length) console.log(`Картинки крупнее показанного: ${m.oversized.map((o) => `${o.src} ${o.natural}→${o.shown}`).join('; ')}`);
if (m.canvases) console.log(`Холстов: ${m.canvases}, анимаций в момент замера: ${m.animations} — кадры/с выше говорят, тянет ли их страница`);
console.log(`\n${worst}: ${Object.entries(checks).filter(([, c]) => c.status !== 'OK' && c.status !== 'n/a').map(([k, c]) => `${k} ${c.status}`).join(', ') || 'все бюджеты соблюдены'}`);
const file = path.join(outDir, `${tag}.json`);
writeJson(file, { url, viewport: vpName, cpu, net: netName, runs: samples.length, takenAt: new Date().toISOString(), loadMs, metrics: m, checks, byType: by, totalKb, thirdPartyKb: thirdParty, largest, scroll: { ...ref.scroll, fps: fpsScroll }, idleFps, cdp: { heapMb, scriptMs: ref.scriptMs, layoutCount: ref.layoutCount, styleRecalcs: ref.styleRecalcs }, samples: samples.map((s) => ({ lcp: s.m.lcp, fcp: s.m.fcp, ttfb: s.m.ttfb, cls: s.m.cls, longTotal: s.m.longTotal, fpsScroll: s.fpsScroll, idleFps: s.idleFps, heapMb: s.heapMb, loadMs: s.loadMs })), verdict: worst });
console.log(`Сохранено: ${file}`);
