#!/usr/bin/env node
/**
 * Журнал состояния переработки: что решено сделать, что сделано, что
 * реально проверено. Одна запись — одна задача, у каждой пять статусов,
 * потому что «написал код», «открыл в браузере и работает», «посмотрел и
 * красиво», «на телефоне тоже» и «быстро» — разные вещи.
 *
 *   node state.mjs <папка прогона> init <url> "<запрос пользователя>"
 *   node state.mjs <папка> add "<задача>" [--priority P2] [--area hero|mobile|3d|content|motion|...]
 *   node state.mjs <папка> set <id> impl=DONE runtime=VERIFIED visual=NEEDS_WORK mobile=NA perf=NOT_CHECKED [--note "..."]
 *   node state.mjs <папка> stage <этап> done|active|todo|skipped
 *   node state.mjs <папка> show
 *
 * Статусы реализации: TODO, IN_PROGRESS, DONE, BLOCKED, DROPPED.
 * Статусы проверок: NOT_CHECKED, VERIFIED, FAILED, NEEDS_WORK, NA.
 * Приоритеты: P0 сломано · P1 крупная проблема UX · P2 крупная визуальная ·
 * P3 тексты · P4 движение · P5 полировка.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, writeJson } from './lib.mjs';

const IMPL = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'DROPPED'];
const CHECK = ['NOT_CHECKED', 'VERIFIED', 'FAILED', 'NEEDS_WORK', 'NA'];
const CHECKS = ['runtime', 'visual', 'mobile', 'perf'];
const PRIO = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const STAGES = [
  ['discovered', 'Сайт разведан'], ['browser', 'Открыт в браузере, консоль и сеть сняты'], ['design', 'Дизайн разобран глазами'],
  ['tech', 'Техническая архитектура понята'], ['tools', 'Инструменты выбраны'], ['tokens', 'Дизайн-система снята'],
  ['plan', 'План с приоритетами составлен'], ['ui', 'Вёрстка и UI'], ['content', 'Тексты'], ['assets', 'Картинки и графика'],
  ['three', '3D'], ['motion', 'Движение'], ['runtime', 'Проверка в браузере'], ['visual', 'Визуальная проверка'],
  ['mobile', 'Мобильная проверка'], ['perf', 'Скорость'], ['a11y', 'Доступность'], ['polish', 'Полировка'], ['report', 'Итоговый отчёт'],
];
const MARK = { done: '✓', active: '→', todo: '·', skipped: '–' };

const { pos, opt } = parseArgs(process.argv.slice(2));
const [dir, cmd, ...rest] = pos;
if (!dir || !cmd) { console.error('Нужно: node state.mjs <папка> init|add|set|stage|show ...'); process.exit(1); }
const file = path.join(path.resolve(dir), 'state.json');
const die = (m) => { console.error(m); process.exit(1); };
let st = readJson(file);

if (cmd === 'init') {
  if (!rest[0]) die('init <url> "<запрос>"');
  st = { url: rest[0], request: rest[1] || '', createdAt: new Date().toISOString(), stages: Object.fromEntries(STAGES.map(([k]) => [k, 'todo'])), tasks: [] };
  st.stages.discovered = 'active';
  writeJson(file, st); console.log(`Журнал создан: ${file}`); process.exit(0);
}
if (!st) die(`Нет журнала ${file} — сначала init.`);

if (cmd === 'add') {
  if (!rest[0]) die('add "<задача>" [--priority P2] [--area ...]');
  const p = opt.priority ? String(opt.priority).toUpperCase() : 'P2'; if (!PRIO.includes(p)) die(`Приоритет: ${PRIO.join(', ')}`);
  const id = st.tasks.length + 1;
  st.tasks.push({ id, task: rest[0], priority: p, area: opt.area || null, impl: 'TODO', runtime: 'NOT_CHECKED', visual: 'NOT_CHECKED', mobile: 'NOT_CHECKED', perf: 'NOT_CHECKED', note: '', updatedAt: new Date().toISOString() });
  writeJson(file, st); console.log(`#${id} ${p} ${rest[0]}`);
} else if (cmd === 'set') {
  const t = st.tasks.find((x) => x.id === Number(rest[0])); if (!t) die(`Нет задачи #${rest[0]}`);
  for (const kv of rest.slice(1)) {
    const [k, v0] = kv.split('='); const v = String(v0 || '').toUpperCase();
    if (k === 'impl') { if (!IMPL.includes(v)) die(`impl: ${IMPL.join(', ')}`); t.impl = v; }
    else if (CHECKS.includes(k)) { if (!CHECK.includes(v)) die(`${k}: ${CHECK.join(', ')}`); t[k] = v; }
    else if (k === 'priority') { if (!PRIO.includes(v)) die(`priority: ${PRIO.join(', ')}`); t.priority = v; }
    else die(`Неизвестное поле ${k}. Есть: impl, ${CHECKS.join(', ')}, priority`);
  }
  if (opt.note) t.note = String(opt.note);
  t.updatedAt = new Date().toISOString();
  writeJson(file, st); console.log(`#${t.id} ${t.task}: impl ${t.impl} · runtime ${t.runtime} · visual ${t.visual} · mobile ${t.mobile} · perf ${t.perf}${t.note ? ` · ${t.note}` : ''}`);
} else if (cmd === 'stage') {
  const [k, v] = rest; if (!(k in st.stages)) die(`Этапы: ${STAGES.map(([s]) => s).join(', ')}`); if (!(v in MARK)) die('done|active|todo|skipped');
  st.stages[k] = v; writeJson(file, st); console.log(`${MARK[v]} ${STAGES.find(([s]) => s === k)[1]}`);
} else if (cmd === 'show') {
  console.log(`# ${st.url}\n\nЗапрос: ${st.request}\n`);
  for (const [k, title] of STAGES) console.log(`${MARK[st.stages[k]]} ${title}`);
  console.log('\n| # | P | задача | реализация | runtime | визуал | телефон | скорость | заметка |\n|---|---|---|---|---|---|---|---|---|');
  for (const t of [...st.tasks].sort((a, b) => a.priority.localeCompare(b.priority) || a.id - b.id)) console.log(`| ${t.id} | ${t.priority} | ${t.task} | ${t.impl} | ${t.runtime} | ${t.visual} | ${t.mobile} | ${t.perf} | ${t.note || ''} |`);
  const done = st.tasks.filter((t) => t.impl === 'DONE').length; const verified = st.tasks.filter((t) => t.impl === 'DONE' && ['VERIFIED', 'NA'].includes(t.runtime) && ['VERIFIED', 'NA'].includes(t.visual)).length;
  const unchecked = st.tasks.filter((t) => t.impl === 'DONE' && CHECKS.some((c) => t[c] === 'NOT_CHECKED'));
  console.log(`\nСделано ${done} из ${st.tasks.length}, из них проверено в браузере и глазами ${verified}.${unchecked.length ? ` Сделано, но не проверено до конца: ${unchecked.map((t) => `#${t.id}`).join(', ')} — в отчёт это идёт как IMPLEMENTED, не VERIFIED.` : ''}`);
} else die(`Неизвестная команда ${cmd}`);
