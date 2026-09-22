/**
 * Общее для скриптов скилла: где взять puppeteer-core и браузер.
 * Скрипты лежат вне проекта, поэтому puppeteer-core ищется от текущей
 * папки (в проекте он уже в зависимостях), а не от папки скрипта.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export function loadPuppeteer() {
  const roots = [process.cwd(), process.env.DESIGN_REF_PROJECT].filter(Boolean);
  for (const root of roots) {
    try {
      const req = createRequire(path.join(root, 'package.json'));
      const mod = req('puppeteer-core');
      return mod.default || mod;
    } catch { /* пробуем следующий корень */ }
  }
  console.error('Не найден puppeteer-core. Запускайте из папки проекта, где он установлен,\nили укажите её в переменной DESIGN_REF_PROJECT.');
  process.exit(1);
}

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

export function requireChrome() {
  const found = CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (found) return found;
  console.error('Не найден Chrome, Chromium или Edge. Укажите путь в переменной CHROME_PATH.');
  process.exit(1);
}

export async function launch() {
  const puppeteer = loadPuppeteer();
  return puppeteer.launch({ executablePath: requireChrome(), headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Аргументы вида --out dir --name slug; остальное — позиционные. */
export function parseArgs(argv) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; opt[k] = v; }
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

export function slugFromUrl(url) {
  const u = new URL(url);
  return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'reference';
}
