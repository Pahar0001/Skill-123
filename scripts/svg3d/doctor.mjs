/**
 * Что из стека «3D SVG» установлено и работает на этой машине — и чем грозит отсутствие.
 * Каждая строка — проверка делом, а не «пакет лежит в папке»: библиотека загружается, Chrome запускается,
 * cadquery импортируется, Iconify отвечает.
 */
import fs from 'node:fs';
import path from 'node:path';
import { findBrowser, loadSharp, launch } from '../lib.mjs';
import { moduleDir, version, license, requireFrom, importFrom, loadError, INSTALL_HINT, OWN_ROOT } from './deps.mjs';
import { findPython } from './cad.mjs';
import { ICONIFY_BASE } from './tools.mjs';

/** Путь к Blender или null: BLENDER_PATH, PATH, обычные папки установки. Ничего не ставит. */
export function findBlender() {
  const ok = (p) => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };
  if (ok(process.env.BLENDER_PATH)) return process.env.BLENDER_PATH;
  const names = process.platform === 'win32' ? ['blender.exe'] : ['blender'];
  for (const dir of String(process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean)) for (const n of names) { const f = path.join(dir.replace(/^"|"$/g, ''), n); if (ok(f)) return f; }
  const bases = process.platform === 'win32' ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((p) => path.join(p, 'Blender Foundation')) : [];
  for (const b of bases) { try { for (const d of fs.readdirSync(b).sort().reverse()) { const f = path.join(b, d, 'blender.exe'); if (ok(f)) return f; } } catch { /* папки нет */ } }
  for (const f of ['/Applications/Blender.app/Contents/MacOS/Blender', '/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender']) if (ok(f)) return f;
  return null;
}

/**
 * → { items: [{ id, name, ok, state: 'ok' | 'нет' | 'ошибка', detail, impact, fix, core }], core — всё ли обязательное на месте }
 * net: false — сеть не трогать; python: false — не искать cadquery; browser: false — Chrome не запускать.
 */
export async function doctor({ net = true, python = true, browser = true } = {}) {
  const items = [];
  const add = (id, name, ok, detail, impact, fix, core = false) => items.push({ id, name, ok: !!ok, state: ok ? 'ok' : 'нет', detail, impact: ok ? '' : impact, fix: ok ? '' : fix, core });
  const pkg = (name) => (moduleDir(name) ? `${version(name)}, ${license(name)}` : null);

  /* обязательное: без него инструмент не пишет ни одного файла */
  const svgo = await importFrom('svgo');
  add('svgo', 'SVGO', svgo && typeof svgo.optimize === 'function', svgo ? pkg('svgo') : loadError('svgo') || 'пакета нет', 'без SVGO не работает ни одна команда: им разбирается и чистится каждый SVG', INSTALL_HINT, true);
  const sharp = loadSharp();
  add('sharp', 'sharp', !!sharp, sharp ? pkg('sharp') || 'загружается' : 'пакета нет', 'нет превью, листов-контактов, сверки «до/после чистки» и trace', `npm i sharp --prefix "${OWN_ROOT}"`, true);

  const chrome = findBrowser('chrome'); const pup = moduleDir('puppeteer-core') || moduleDir('puppeteer');
  const edge = !!chrome && /msedge/i.test(chrome);
  /* не «файл есть», а «запускается»: Edge на части машин в безголовом режиме сразу выходит */
  let chromeOk = false, chromeNote = !chrome ? 'браузер не найден' : !pup ? 'нет puppeteer-core' : '';
  if (chrome && pup && browser) {
    try { const b = await launch(); chromeNote = `${b.rwName} ${b.rwVersion || ''} запускается (${chrome}) · puppeteer-core ${version('puppeteer-core') || ''}`; chromeOk = true; await b.close(); } catch (e) { chromeNote = String(e.message || e).split('\n')[0].slice(0, 200); }
  } else if (chrome && pup) { chromeOk = !edge; chromeNote = `${chrome} (запуск не проверялся)`; }
  add('chrome', 'Chrome без окна', chromeOk, chromeNote, 'не работают zdog и three: обе библиотеки рисуют через DOM браузера', !pup ? `npm i puppeteer-core --prefix "${OWN_ROOT}"` : 'поставить Chrome или задать CHROME_PATH (Edge без окна на части машин не запускается)');

  const zdog = moduleDir('zdog');
  add('zdog', 'Zdog', !!zdog && fs.existsSync(path.join(zdog, 'dist', 'zdog.dist.min.js')), zdog ? pkg('zdog') : 'пакета нет', 'нет команды zdog (круглые «игрушечные» предметы и иконки)', INSTALL_HINT);
  const three = moduleDir('three');
  const svgR = three && fs.existsSync(path.join(three, 'examples', 'jsm', 'renderers', 'SVGRenderer.js'));
  add('three', 'Three.js SVGRenderer', !!svgR, three ? (svgR ? pkg('three') : 'пакет есть, SVGRenderer.js в нём нет') : 'пакета нет', 'нет команды three (гранёные предметы)', INSTALL_HINT);
  const rough = requireFrom('roughjs');
  add('roughjs', 'Rough.js', !!rough && typeof (rough.default || rough).generator === 'function', rough ? pkg('roughjs') : loadError('roughjs') || 'пакета нет', 'нет команды rough (вариант «от руки»)', INSTALL_HINT);
  const vt = requireFrom('@neplex/vectorizer');
  add('vtracer', 'vtracer (@neplex/vectorizer)', !!vt && typeof vt.vectorize === 'function', vt ? pkg('@neplex/vectorizer') : loadError('@neplex/vectorizer') || 'пакета нет', 'нет команды trace в цвете (с potrace остаётся только --mono)', INSTALL_HINT);
  const pot = moduleDir('potrace');
  add('potrace', 'potrace (необязательно)', !!pot, pot ? `${pkg('potrace')} — только как локальный инструмент; на готовый SVG лицензия не переходит` : 'не установлен', 'trace --mono идёт через vtracer (линия чуть грубее) — работе не мешает', `npm i potrace --prefix "${OWN_ROOT}"   (GPL-2.0, тянет старый jimp)`);

  if (python) {
    const py = findPython({ fresh: true });
    add('cadquery', 'Python + CadQuery', !!py.cmd, py.cmd ? `${py.cmd.join(' ')} · Python ${py.version}, cadquery ${py.cadquery}` : (py.tried || []).join('; ') || 'Python не найден', 'нет команды cad (чертёжные проекции со скрытыми линиями)', 'pip install cadquery в Python 3.9–3.12, или путь к интерпретатору в SVG3D_PYTHON');
  }
  const bl = findBlender();
  add('blender', 'Blender + Freestyle SVG (необязательно)', !!bl, bl ? `${bl} — ветка не проверялась при разработке` : 'не установлен', 'команда blender откажет с подсказкой; линии сложных моделей — через cad или three', 'поставить Blender с blender.org или задать BLENDER_PATH (скрипт сам ничего не ставит)');

  if (net) {
    let detail = '', ok = false;
    try { const t = Date.now(); const r = await fetch(`${ICONIFY_BASE()}/collections?prefix=lucide`, { signal: AbortSignal.timeout(10000) }); const j = await r.json(); ok = r.ok && !!j.lucide; detail = ok ? `${ICONIFY_BASE()} отвечает за ${Date.now() - t} мс (набор lucide: ${j.lucide.total} иконок, ${j.lucide.license && j.lucide.license.spdx})` : `HTTP ${r.status}`; } catch (e) { detail = `нет ответа: ${String(e.cause ? e.cause.code || e.cause.message : e.message)}`; }
    add('iconify', 'Сеть до Iconify', ok, detail, 'нет команды icon (иконки и их лицензии берутся из сети)', 'проверить сеть и прокси; другой адрес API — SVG3D_ICONIFY_BASE');
  }
  return { items, core: items.filter((i) => i.core).every((i) => i.ok) };
}
