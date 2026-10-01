/* Общее для разовых инструментов прогона: где папка прогона, какой адрес у стенда, библиотека навыка.
   RUN_DIR — папка прогона (по умолчанию текущая), LOOK_BASE — адрес стенда (по умолчанию http://localhost:3000). */
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUN = path.resolve(process.env.RUN_DIR || process.cwd());
export const BASE = String(process.env.LOOK_BASE || 'http://localhost:3000').replace(/\/+$/, '');
export const lib = await import(pathToFileURL(path.join(os.homedir(), '.claude', 'skills', 'site-rework', 'scripts', 'lib.mjs')).href);

/** Аргументы: позиционные и --ключ значение. */
export function args(argv = process.argv.slice(2)) {
  const opt = (k, d = '') => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const has = (k) => argv.includes('--' + k);
  const pos = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
  return { opt, has, pos };
}

/** Путь страницы: Git Bash подменяет «/catalog» на «C:/Program Files/Git/catalog», поэтому пути дают без
 *  ведущей косой («catalog/x»); «home» — главная. */
export const pagePath = (raw) => (raw === 'home' ? '/' : `/${String(raw).replace(/^[/]+/, '')}`);
export const pageName = (p) => p.replace(/^[/]/, '').replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || 'home';

/** Куки строкой «a=b;c=d» → для puppeteer. */
export const cookieList = (s, domain = 'localhost') => (s ? s.split(';').map((c) => { const [n, ...v] = c.trim().split('='); return { name: n, value: v.join('='), domain, path: '/' }; }) : []);
