/**
 * Поиск и загрузка библиотек стека «3D SVG» — без загрузки при поиске.
 *
 * lib.findModuleRoot() при поиске ЗАГРУЖАЕТ модуль (у svgo и potrace на холодном диске это 6–7 с, у three —
 * предупреждение о require). Здесь сначала дешёвый поиск по тем же корням и в том же порядке, что у lib.mjs
 * (SITE_REWORK_PROJECT → текущая папка и родители → ~/.claude/site-rework), и только если там пусто —
 * lib.findModuleRoot (глобальные пакеты npm, известные проекты).
 *
 *   moduleDir('zdog')            папка пакета или null — ничего не загружает
 *   requireFrom('roughjs')       CommonJS-модуль или null
 *   importFrom('svgo')           ES-модуль (или CJS через import) или null
 *   version('three')             версия из package.json или null
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { findModuleRoot } from '../lib.mjs';

export const OWN_ROOT = path.join(os.homedir(), '.claude', 'site-rework');
export const INSTALL_HINT = `npm i zdog three svgo roughjs @neplex/vectorizer --prefix "${OWN_ROOT}"`;

function roots() {
  const out = [];
  if (process.env.SITE_REWORK_PROJECT) out.push(process.env.SITE_REWORK_PROJECT);
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) { out.push(dir); const up = path.dirname(dir); if (up === dir) break; dir = up; }
  out.push(OWN_ROOT);
  return out;
}

const cache = new Map();
/** Папка пакета (…/node_modules/<имя>) или null. Модуль при этом не загружается. */
export function moduleDir(name) {
  if (cache.has(name)) return cache.get(name);
  let found = null;
  /* случайная установка прямо в домашней папке — в последнюю очередь (то же правило, что у lib.mjs) */
  const home = path.resolve(os.homedir()).toLowerCase(); let stray = null;
  for (const r of roots()) {
    const d = path.join(r, 'node_modules', ...name.split('/'));
    if (!fs.existsSync(path.join(d, 'package.json'))) continue;
    if (path.resolve(r).toLowerCase() === home && r !== process.env.SITE_REWORK_PROJECT) { stray = stray || d; continue; }
    found = d; break;
  }
  if (!found) {
    try { const r = findModuleRoot(name); if (r) { const d = path.join(r, 'node_modules', ...name.split('/')); if (fs.existsSync(d)) found = d; } } catch { /* нет нигде */ }
  }
  cache.set(name, found || stray || null);
  return cache.get(name);
}

export function version(name) {
  const d = moduleDir(name); if (!d) return null;
  try { return JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version || null; } catch { return null; }
}
export function license(name) {
  const d = moduleDir(name); if (!d) return null;
  try { return JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).license || null; } catch { return null; }
}

/** CommonJS-модуль по имени или null (ошибка загрузки — в .error у возвращённого null не хранится: см. loadError). */
const errors = new Map();
export const loadError = (name) => errors.get(name) || null;
export function requireFrom(name) {
  const d = moduleDir(name); if (!d) return null;
  try { return createRequire(path.join(d, 'package.json'))(d); } catch (e) { errors.set(name, String(e.message || e).split('\n')[0]); return null; }
}
/** ES-модуль: importFrom('svgo') или файл внутри пакета — importFrom('three', 'build/three.module.js'). */
export async function importFrom(name, sub = null) {
  const d = moduleDir(name); if (!d) return null;
  try {
    let file = sub ? path.join(d, sub) : null;
    if (!file) {
      const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
      const ex = pkg.exports && (pkg.exports['.'] || pkg.exports);
      const rel = (ex && (typeof ex === 'string' ? ex : ex.import || ex.default)) || pkg.module || pkg.main || 'index.js';
      file = path.join(d, typeof rel === 'string' ? rel : rel.default || 'index.js');
    }
    return await import(pathToFileURL(file).href);
  } catch (e) { errors.set(name, String(e.message || e).split('\n')[0]); return null; }
}
