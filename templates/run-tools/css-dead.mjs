#!/usr/bin/env node
/* Классы из файла стилей, которых нет ни в шаблонах, ни в скриптах сайта: остатки эскиза и слоёв правок.
   Для сайта с серверным рендером строками и без сборщика — там неиспользуемое никто не вычищает.

   node css-dead.mjs <стили.css> <папка или файл исходников>… [--rules]
   Слово считается использованным, если встречается в исходниках отдельным токеном, в том числе склейкой
   `card__ph${…}` + `--pack`. Находка — подсказка, а не приговор: класс мог ставить чужой скрипт. */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith('--'));
const [cssFile, ...srcs] = files;
if (!cssFile || !srcs.length) { console.error('node css-dead.mjs <стили.css> <папка или файл исходников>… [--rules]'); process.exit(1); }
const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((f) => walk(path.join(p, f))) : /\.(js|mjs|cjs|ts|html|svg|vue|jsx|tsx|php|twig|njk|ejs)$/i.test(p) ? [p] : []);
const src = srcs.flatMap(walk).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const css = fs.readFileSync(cssFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const esc = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
const has = (cls) => {
  if (new RegExp(`(^|[^\\w-])${esc(cls)}($|[^\\w-])`).test(src)) return true;
  if (!cls.includes('--')) return false;
  const [base, mod] = cls.split('--');                       /* card__ph--pack: «card__ph${» и «--pack» по отдельности */
  return (new RegExp(`${esc(base)}\\$\\{`).test(src) || src.includes(`\${cls}`)) && src.includes(`--${mod}`);
};
const classes = [...new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]))].filter((c) => !/^(webp|svg|png|jpg|jpeg|gif|woff2?|css|js)$/.test(c));
const dead = classes.filter((c) => !has(c)).sort();
console.log(`классов в ${path.basename(cssFile)}: ${classes.length}, не найдено в исходниках: ${dead.length}`);
if (dead.length) console.log(dead.join(' '));
if (argv.includes('--rules')) {
  const set = new Set(dead); let n = 0, bytes = 0;
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (sels.length && sels.every((s) => [...s.matchAll(/\.([a-zA-Z_][\w-]*)/g)].some((x) => set.has(x[1])))) { n++; bytes += m[0].length; console.log(`  ${m[1].trim().slice(0, 110)}`); }
  }
  console.log(`правил, где мёртвы все селекторы: ${n}, ${bytes} байт`);
}
