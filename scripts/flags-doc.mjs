#!/usr/bin/env node
/**
 * flags-doc.mjs — справочник флагов из кода: reference/flags.md и проверка расхождений.
 *
 *   node flags-doc.mjs              собрать reference/flags.md (site-rework и design-reference рядом)
 *   node flags-doc.mjs --check      не писать; код 1, если справочник устарел или есть расхождения A, C, E
 *   node flags-doc.mjs --out файл   куда писать вместо reference/flags.md
 *   node flags-doc.mjs -h | --help  эта справка
 *
 * Откуда флаги. Каждый скрипт запускается без аргументов с RW_FLAGS_DUMP=1: lib.parseArgs (и parseArgs
 * design-reference) печатает свои списки строкой «@@RW-FLAGS {json}» и выходит с кодом 0 до любого
 * действия; runtime.mjs разбирает аргументы сам и зовёт lib.flagsDump после STEP/FLAG/OPTS, grain-tile —
 * до справки «без аргументов». Скрипт, который до parseArgs сам проверяет флаги или выходит, — тоже
 * lib.flagsDump(spec) раньше этого (иначе E). В справочнике — и strict: неизвестный флаг у скрипта
 * ошибка с подсказкой (parseArgs strict) или WARN.
 * Запуск — во временной папке, SITE_REWORK_RUNS тоже туда: случайный файл не ляжет в runs/.
 * Справка — `node <скрипт> -h` там же. Модули без своего разбора аргументов (lib, clicks, copy-rules)
 * не снимаются; texture и grain-tile — модули и скрипты сразу, снимаются как скрипты. Черновые файлы
 * с «_» в начале имени пропускаются.
 *
 * Расхождения:
 *   A  флаг есть в коде, справка (-h) его не называет                         → FAIL (--check: код 1)
 *   B  справка называет свой флаг, которого код не знает (кроме FOREIGN ниже)   → WARN
 *   C  документация (SKILL.md, reference/, templates/) зовёт скрипт с флагом,
 *      которого он не знает                                                    → FAIL
 *   E  `-h` не печатает справку (код не 0) или разбор аргументов не пойман      → FAIL
 *   D  reference/flags.md не совпадает с собранным сейчас (только --check)      → FAIL «перегенерировать»
 *
 * Когда запускать: поменяли флаг или строку справки у любого скрипта — собрать заново; --check — вручную
 * перед коммитом скилла (pre-commit нет).
 *
 * Коды выхода: 0 — собрано (или --check без FAIL); 1 — --check с FAIL; 2 — неверные аргументы.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SR = path.dirname(HERE);
const DR = path.join(path.dirname(SR), 'design-reference');
const HELP = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) { console.log(HELP); process.exit(0); }
const known = new Set(['--check', '--out']);
for (const a of argv) if (a.startsWith('-') && !known.has(a.split('=')[0])) { console.error(`неизвестный флаг ${a} (-h — справка)`); process.exit(2); }
const CHECK = argv.includes('--check');
const oi = argv.indexOf('--out'); const OUT = oi >= 0 ? argv[oi + 1] : null;
if (oi >= 0 && (!OUT || OUT.startsWith('-'))) { console.error('--out: нужен файл'); process.exit(2); }
const TARGET = path.resolve(OUT || path.join(SR, 'reference', 'flags.md'));

/* модули без своего разбора аргументов — не скрипты */
const MODULES = new Set(['lib.mjs', 'clicks.mjs', 'copy-rules.mjs', 'flags-doc.mjs']);
/* флаги, которые справка называет, но они чужие или пример опечатки — не расхождение B (с причиной) */
const FOREIGN = {
  'mirror.mjs': { proxy: 'флаг serve.mjs: чем смотреть зеркало' },
  'state.mjs': { eval: 'шаги runtime.mjs в примере доказательства', expect: 'то же', assert: 'то же', scroll: 'то же' },
  'runtime.mjs': { foo: 'пример неизвестного флага', strict: 'пример неизвестного флага', x: 'значение «--x» в примере' },
};

const scripts = [];
for (const [skill, dir] of [['site-rework', path.join(SR, 'scripts')], ['design-reference', path.join(DR, 'scripts')]]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mjs') && !MODULES.has(x) && !x.startsWith('_')).sort() /* «_» — черновые */) scripts.push({ skill, name: f, file: path.join(dir, f) });
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-flags-'));
const run = (file, args, env = {}) => spawnSync(process.execPath, [file, ...args], { cwd: sandbox, env: { ...process.env, SITE_REWORK_RUNS: path.join(sandbox, 'runs'), ...env }, encoding: 'utf8', timeout: 30000, windowsHide: true });
const esc = (s) => String(s).replace(/[-]/g, '\\-');
const flagRe = (f) => new RegExp(`(?<![\\w-])--${esc(f)}(?![\\w-])`);

/* флаги строки справки, которые относятся к самому скрипту: после имени другого скрипта в абзаце — его флаги;
   CSS-переменные «--grain-*»; значение в кавычках после «=» («--hover="--x"») — не флаги */
function ownFlags(text, self) {
  const out = new Set(); let foreign = false;
  for (const ln of String(text).split(/\r?\n/)) {
    if (!ln.trim()) { foreign = false; continue; }
    const marks = [...ln.matchAll(/\b([a-z0-9-]+)\.mjs\b/g)].map((m) => ({ i: m.index, own: `${m[1]}.mjs` === self }));
    for (const m of ln.matchAll(/(?<![\w-])--([a-z][a-z0-9-]*)(-\*|\*)?/g)) {
      if (m[2] || /=["«]$/.test(ln.slice(0, m.index))) continue;
      const last = marks.filter((k) => k.i < m.index).pop();
      if (last ? !last.own : foreign) continue;
      out.add(m[1]);
    }
    if (marks.length) foreign = !marks[marks.length - 1].own;
  }
  return out;
}
/* строка-определение («  --levels  уровней…») важнее строки использования */
function helpLine(help, f) {
  const lines = help.split(/\r?\n/).filter((x) => flagRe(f).test(x));
  const def = lines.find((x) => new RegExp(`^\\s*(-h,\\s*)?--${esc(f)}(?![\\w-])`).test(x));
  return (def || lines[0] || '').trim();
}
/* описание из строки-определения: текст после флага и его значения («--levels     уровней яркости 2…256») */
const describe = (line, f) => { const m = new RegExp(`--${esc(f)}(?:[ =](?:<[^>]*>|\\[[^\\]]*\\]|[A-Za-zА-Яа-яё./|,*…-]+))?\\s{2,}(.*)$`).exec(line); return (m ? m[1] : line).replace(/\|/g, '\\|').slice(0, 160); };
const envOf = (src) => [...new Set([...src.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|\bkey\(\s*'([A-Z][A-Z0-9_]+)'/g)].map((m) => m[1] || m[2]))].filter((v) => !/^(PATH|TEMP|TMPDIR|LOCALAPPDATA|P|RW_FLAGS_DUMP)$/.test(v)).sort();

const gaps = []; const md = [];
md.push('# Флаги скриптов site-rework и design-reference', '',
  '> Собирается `node scripts/flags-doc.mjs` из кода (разбор аргументов каждого скрипта и его `-h`).',
  '> Руками не править: поменяли флаг — перегенерировать; `--check` скажет, если забыли.', '',
  '**Общее.** Флаг пишется `--ключ значение` или `--ключ=значение`; после `--` — только позиционные. Значение,',
  'которое начинается с `--`, — только через `=`. Неизвестный флаг не забирает адрес, команду и слово на «-»;',
  'у скрипта с пометкой «неизвестный флаг — ошибка» он останавливает запуск (код 1, «может быть, --…?»), у остальных',
  'даёт WARN и запуск идёт дальше. Вид «значение необязательно» — берёт следующее слово, только если оно не похоже на флаг.', '');
for (const s of scripts) {
  const d = run(s.file, [], { RW_FLAGS_DUMP: '1' });
  const line = (d.stdout || '').split(/\r?\n/).find((l) => l.startsWith('@@RW-FLAGS '));
  const spec = line ? JSON.parse(line.slice(11)) : null;
  const h = run(s.file, ['-h']); const help = `${h.stdout || ''}${h.stderr || ''}`;
  const src = fs.readFileSync(s.file, 'utf8');
  md.push(`## ${s.skill === 'site-rework' ? '' : 'design-reference/'}${s.name}`, '');
  const usage = help.split(/\r?\n/).filter((l) => /^\s*node\s+\S*\.mjs/.test(l)).map((l) => l.trim()).slice(0, 8);
  if (usage.length) md.push('```', ...usage, '```', '');
  if (h.status !== 0) gaps.push(['E', s.name, `\`-h\` дал код ${h.status}: ${help.split('\n')[0].slice(0, 100)}`]);
  if (!spec) { gaps.push(['E', s.name, `разбор аргументов не пойман (код ${d.status}): ${(d.stderr || d.stdout || '').split('\n')[0].slice(0, 100)}`]); md.push('_разбор аргументов не пойман_', ''); continue; }
  if (spec.commands && spec.commands.length) md.push(`Команды: ${spec.commands.map((c) => `\`${c}\``).join(', ')}.`, '');
  /* свой разбор до parseArgs (copy, typeset) тоже может отвергать неизвестный флаг: проба «--rw-no-such-flag -h» —
     справка останавливает любой скрипт до действия, а отказ виден по коду и строке «неизвестный флаг» */
  const pr = spec.strict ? null : run(s.file, ['--rw-no-such-flag', '-h']);
  const own = !!pr && pr.status !== 0 && /неизвестн\S* (флаг|ключ)/i.test(`${pr.stdout || ''}${pr.stderr || ''}`);
  md.push(`Неизвестный флаг — ${spec.strict ? 'ошибка, код 1 (parseArgs strict)' : own ? `ошибка, код ${pr.status} (свой разбор до parseArgs)` : spec.steps ? 'WARN; слово после него, если это не адрес, флаг забирает значением' : 'WARN, запуск идёт дальше'}.`, '');
  s.strict = spec.strict ? 'parseArgs' : own ? 'свой' : null;
  const kinds = [['шаг', spec.steps || []], ['переключатель', spec.flags || []], ['со значением', spec.values || []], ['значение необязательно', spec.optional || []]];
  const code = new Set(kinds.flatMap(([, l]) => l));
  md.push('| флаг | вид | из справки |', '|---|---|---|');
  for (const [kind, list] of kinds) for (const f of [...list].sort()) {
    if (f === 'h' || f === 'help') continue;
    const hl = helpLine(help, f);
    md.push(`| \`--${f}\` | ${kind} | ${hl ? describe(hl, f) : '**нет в справке**'} |`);
    if (!hl) gaps.push(['A', s.name, `--${f} (${kind}) есть в коде, справка его не называет`]);
  }
  md.push('');
  /* строка «Коды выхода: …» (или «Код выхода: …») с продолжением до пустой строки; строки-определения флагов — мимо */
  const hl = help.split(/\r?\n/); const ci = hl.findIndex((l) => /^\s*Коды? выхода(?![а-яё])/i.test(l));
  if (ci >= 0) {
    const cl = [hl[ci]]; for (let k = ci + 1; k < hl.length && cl.length < 4 && hl[k].trim() && !/^\s*(--|-h\b|[А-ЯA-Z][^:]{0,30}:\s*$)/.test(hl[k]); k++) cl.push(hl[k]);
    md.push(`Коды выхода: ${cl.map((l) => l.trim()).join(' ').replace(/^Коды? выхода[:.]?\s*/i, '').replace(/\|/g, '\\|')}`, '');
  }
  const env = envOf(src); if (env.length) md.push(`Переменные окружения: ${env.map((v) => `\`${v}\``).join(', ')}.`, '');
  const allow = FOREIGN[s.name] || {};
  for (const f of ownFlags(help, s.name)) if (!code.has(f) && f !== 'h' && !(f in allow)) gaps.push(['B', s.name, `справка называет --${f}, код его не знает`]);
  s.code = code;
}

/* C: документация зовёт скрипт с флагом, которого он не знает (флаги после имени скрипта до конца кода в строке) */
const docs = [path.join(SR, 'SKILL.md'), ...['reference', 'templates'].flatMap((d) => (fs.existsSync(path.join(SR, d)) ? fs.readdirSync(path.join(SR, d)).filter((f) => f.endsWith('.md') && f !== 'flags.md').map((f) => path.join(SR, d, f)) : [])), path.join(DR, 'SKILL.md')].filter((f) => fs.existsSync(f));
const byName = new Map(scripts.filter((s) => s.code).map((s) => [s.name, s]));
for (const f of docs) {
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((ln, i) => {
    const hits = [...ln.matchAll(/\b([a-z0-9-]+\.mjs)\b/g)].filter((m) => byName.has(m[1]));
    hits.forEach((m, k) => {
      let seg = ln.slice(m.index, k + 1 < hits.length ? hits[k + 1].index : ln.length);
      const tick = seg.indexOf('`'); if (tick >= 0) seg = seg.slice(0, tick);
      seg = seg.split(/\s#\s/)[0];
      for (const x of seg.matchAll(/(?<![\w-])--([a-z][a-z0-9-]*)(-\*|\*)?/g)) {
        if (x[2] || /=["«]$/.test(seg.slice(0, x.index))) continue;
        const s = byName.get(m[1]);
        if (!s.code.has(x[1]) && x[1] !== 'h') gaps.push(['C', m[1], `${path.relative(path.dirname(SR), f).replace(/\\/g, '/')}:${i + 1} зовёт --${x[1]}, код его не знает`]);
      }
    });
  });
}
fs.rmSync(sandbox, { recursive: true, force: true });

const text = md.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
const sev = { A: 'FAIL', C: 'FAIL', E: 'FAIL', B: 'WARN' };
for (const [k, n, msg] of gaps) console.log(`${sev[k].padEnd(4)} ${k} ${n}: ${msg}`);
const st = scripts.filter((x) => x.code); console.log(`неизвестный флаг — ошибка: parseArgs strict — ${st.filter((x) => x.strict === 'parseArgs').map((x) => x.name).join(', ') || '—'}; свой разбор — ${st.filter((x) => x.strict === 'свой').map((x) => x.name).join(', ') || '—'}; WARN — ${st.filter((x) => !x.strict).map((x) => x.name).join(', ') || '—'}`);
let fail = gaps.filter(([k]) => sev[k] === 'FAIL').length;
if (CHECK) {
  const cur = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null;
  if (cur !== text) { console.log(`FAIL D ${path.basename(TARGET)}: ${cur == null ? 'нет файла' : 'не совпадает с кодом'} — node scripts/flags-doc.mjs`); fail++; }
  console.log(`\n${fail ? 'FAIL' : gaps.length ? 'WARN' : 'OK'}: скриптов ${scripts.length}, расхождений ${gaps.length}${fail ? `, провалов ${fail}` : ''}`);
  process.exit(fail ? 1 : 0);
}
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, text);
console.log(`\n${fail ? 'FAIL' : gaps.length ? 'WARN' : 'OK'}: ${TARGET} — скриптов ${scripts.length}, расхождений ${gaps.length}`);
