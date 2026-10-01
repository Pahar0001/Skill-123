#!/usr/bin/env node
/* Русские строки из исходников шаблонов — с номерами строк. У сайта с серверным рендером тексты размазаны по
   коду: прежде чем отдавать их агенту «Тексты» (templates/copy-prompt.md) или править самому, их надо увидеть
   списком. По списку же видно, где одно понятие названо двумя словами («заявка» и «заказ», «доставка» и
   «перевозка») — правило «одно понятие — одно слово» скрипты не ловят.

   node strings.mjs <папка или файл>… [--min 8] [--grep слово]
   Берёт текст между тегами, строки в кавычках и значения lead/title/placeholder/label/description.
   Комментарии и строки короче --min пропускает; повторы внутри файла — один раз. */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const srcs = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
if (!srcs.length) { console.error('node strings.mjs <папка или файл>… [--min 8] [--grep слово]'); process.exit(1); }
const MIN = +opt('min', 8), GREP = opt('grep', '');
const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).sort().flatMap((f) => walk(path.join(p, f))) : /\.(js|mjs|cjs|ts|html|vue|jsx|tsx|php|twig|njk|ejs)$/i.test(p) ? [p] : []);
let total = 0;
for (const file of srcs.flatMap(walk)) {
  const s = fs.readFileSync(file, 'utf8'); const out = []; const seen = new Set();
  const re = /(?:>|['"`]|lead: |title: |placeholder="|label="|description: )([^<>'"`\n${}]*[А-Яа-яЁё][^<>'"`\n${}]*)/g; let m;
  while ((m = re.exec(s))) {
    const t = m[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < MIN || seen.has(t) || /^(\/\*|\*|\/\/)/.test(t)) continue;
    if (GREP && !t.toLowerCase().includes(GREP.toLowerCase())) continue;
    /* строка комментария: слева от неё в той же строке кода стоит // или * */
    const lineStart = s.lastIndexOf('\n', m.index) + 1; if (/^\s*(\/\/|\/?\*)/.test(s.slice(lineStart, m.index + 1))) continue;
    seen.add(t); out.push(`${s.slice(0, m.index).split('\n').length}: ${t}`);
  }
  if (out.length) { console.log(`\n=== ${file} (${out.length})`); console.log(out.join('\n')); total += out.length; }
}
console.log(`\nстрок: ${total}`);
