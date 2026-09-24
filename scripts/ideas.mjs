#!/usr/bin/env node
/**
 * Банк идей: удачные ходы прошлых сайтов и свои заготовки — чтобы новый сайт брал у донора всё, добавлял
 * своё и не повторял наши прошлые сайты. Каждая идея помнит, где уже стояла и как на неё отозвался
 * пользователь (понравилось / нейтрально / отверг — с его словами).
 *
 *   node ideas.mjs list [--kind motion] [--status liked] [--all]
 *   node ideas.mjs pick --run <прогон> [--kind motion|layout|typography|interaction|content|3d|media|color|graphics]
 *                       [--n 3] [--recent 3] [--for "<о чём сайт>"]
 *   node ideas.mjs show <id>
 *   node ideas.mjs add --id <id> --title "<идея>" --kind <вид> --what "<что это>" --fits "<каким сайтам>"
 *                      [--how "<где сделано, рецепт>"] [--status untested] [--run <прогон>] [--block <блок>] [--quote "<слова>"] [--tags a,b]
 *   node ideas.mjs use <id> --run <прогон> --block <блок>
 *   node ideas.mjs status <id> liked|neutral|rejected|untested --quote "<слова пользователя>" [--run <прогон>]
 *   node ideas.mjs md                 пересобрать IDEAS.md (делается и после каждой записи)
 *   node ideas.mjs check              проверить банк
 *   node ideas.mjs --help
 *
 * Где лежит: ~/.claude/site-rework/taste/ideas.json (или SITE_REWORK_TASTE/ideas.json) и рядом IDEAS.md.
 *
 * pick — что предложить на новый сайт: идеи, которых не было в последних --recent прогонах (по датам
 * использования), без отвергнутых, сначала «понравилось», потом «не проверено», потом «нейтрально»;
 * с --kind — только этого вида; с --for — выше те, у которых в «кому подходит» есть слова из описания.
 * Своя идея из товара всё равно придумывается заново — банк добавляет разнообразия, а не заменяет её.
 *
 * Статусы: liked — пользователь сам одобрил или попросил; neutral — сделано, отзыва не было или он смешанный;
 * rejected — отверг (его слова в quote; pick такую не предлагает); untested — заготовка, на сайте не стояла.
 * Прогон (--run) — имя папки прогона или путь к ней; в банк пишется имя папки.
 *
 * Код выхода: 0 — выполнено; 1 — неверные аргументы, нет идеи, банк не читается.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from './lib.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), {
  flags: ['help', 'h', 'all'],
  optional: ['kind', 'status', 'run', 'n', 'recent', 'for', 'id', 'title', 'what', 'fits', 'how', 'block', 'quote', 'tags'],
  commands: ['list', 'pick', 'show', 'add', 'use', 'status', 'md', 'check'],
});
if (opt.help || opt.h || pos.includes('-h') || !pos.length) { console.log(HELP); process.exit(pos.length || opt.help || opt.h ? 0 : 1); }
const die = (m) => { console.error(m); process.exit(1); };

const DIR = process.env.SITE_REWORK_TASTE || path.join(os.homedir(), '.claude', 'site-rework', 'taste');
const FILE = path.join(DIR, 'ideas.json');
const MD = path.join(DIR, 'IDEAS.md');
const KINDS = ['motion', 'layout', 'typography', 'interaction', 'content', '3d', 'media', 'color', 'graphics'];
const STATUS = ['liked', 'neutral', 'rejected', 'untested'];
const STATUS_RU = { liked: 'понравилось', neutral: 'нейтрально', rejected: 'отвергнуто', untested: 'не проверено' };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const runName = (r) => (r ? path.basename(String(r).replace(/[\\/]+$/, '')) : '');
const val = (k) => (opt[k] !== undefined && opt[k] !== true ? String(opt[k]).trim() : '');

function load() {
  if (!fs.existsSync(FILE)) return [];
  let j; try { j = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { die(`Банк идей не читается: ${FILE} — ${e.message}`); }
  if (!Array.isArray(j)) die(`Банк идей: ждал массив в ${FILE}`);
  return j;
}
function save(list) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 1) + '\n');
  fs.writeFileSync(MD, toMd(list));
}
const lastUse = (i) => (i.uses && i.uses.length ? i.uses.map((u) => u.date || '').sort().pop() : '');
function toMd(list) {
  const L = ['# Банк идей', '', 'Удачные ходы прошлых сайтов и заготовки. Пишется скриптом `ideas.mjs` (правка руками — в ideas.json, потом `ideas.mjs md`).',
    'На новый сайт: `ideas.mjs pick --run <прогон> --kind motion` — свежее, не отвергнутое, не с последних сайтов.', ''];
  for (const k of KINDS) {
    const xs = list.filter((i) => i.kind === k); if (!xs.length) continue;
    L.push(`## ${k}`, '', '| id | идея | кому подходит | статус | где стояла |', '|---|---|---|---|---|');
    for (const i of xs) L.push(`| \`${i.id}\` | **${i.title}** — ${i.what}${i.how ? ` _(${i.how})_` : ''} | ${i.fits || '—'} | ${STATUS_RU[i.status] || i.status}${i.quote ? `: «${i.quote}»` : ''} | ${(i.uses || []).map((u) => `${u.run}${u.block ? ` (${u.block})` : ''} ${u.date || ''}`).join('; ') || '—'} |`);
    L.push('');
  }
  return L.join('\n');
}
function find(list, id) { const i = list.find((x) => x.id === id); if (!i) die(`Нет идеи «${id}» — список: node ideas.mjs list --all`); return i; }

const cmd = pos[0];
const list = load();

if (cmd === 'list') {
  const k = val('kind'), st = val('status');
  if (k && !KINDS.includes(k)) die(`--kind: ${KINDS.join(', ')}`);
  if (st && !STATUS.includes(st)) die(`--status: ${STATUS.join(', ')}`);
  const xs = list.filter((i) => (!k || i.kind === k) && (!st || i.status === st) && (opt.all || st === 'rejected' || i.status !== 'rejected'));
  for (const i of xs) console.log(`${i.id.padEnd(24)} ${i.kind.padEnd(11)} ${(STATUS_RU[i.status] || i.status).padEnd(13)} ${String((i.uses || []).length).padStart(2)} раз · ${i.title}`);
  console.log(`\nидей: ${xs.length}${opt.all ? '' : ' (без отвергнутых; --all — все)'} · ${FILE}`);
  process.exit(0);
}

if (cmd === 'show') {
  const i = find(list, pos[1]);
  console.log(JSON.stringify(i, null, 1)); process.exit(0);
}

if (cmd === 'pick') {
  const run = runName(val('run')); if (!run) die('pick: нужен --run <прогон> (чтобы не предлагать уже взятое здесь)');
  const k = val('kind'); if (k && !KINDS.includes(k)) die(`--kind: ${KINDS.join(', ')}`);
  const n = val('n') ? Number(val('n')) : 3, recent = val('recent') ? Number(val('recent')) : 3;
  if (!(n >= 1 && n <= 20) || !(recent >= 0 && recent <= 20)) die('--n от 1 до 20, --recent от 0 до 20');
  /* последние прогоны — по датам использования любых идей */
  const runs = [...new Map(list.flatMap((i) => (i.uses || []).map((u) => [u.run, u.date || '']))).entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map((x) => x[0]);
  const recentRuns = new Set(runs.filter((r) => r !== run).slice(0, recent));
  /* основа слова — первые 5 букв: «кофейня» находит «кофейни», «выпечкой» — «выпечка» */
  const words = [...new Set(val('for').toLowerCase().split(/[^a-zа-яё0-9]+/i).filter((w) => w.length > 3).map((w) => w.slice(0, 5)))];
  const rank = { liked: 0, untested: 1, neutral: 2 };
  const xs = list.filter((i) => i.status !== 'rejected' && (!k || i.kind === k))
    .filter((i) => !(i.uses || []).some((u) => recentRuns.has(u.run) || u.run === run))
    .map((i) => ({ i, fit: words.filter((w) => `${i.fits} ${i.what} ${(i.tags || []).join(' ')}`.toLowerCase().includes(w)).length }))
    .sort((a, b) => b.fit - a.fit || rank[a.i.status] - rank[b.i.status] || (lastUse(a.i) < lastUse(b.i) ? -1 : 1))
    .slice(0, n);
  if (!xs.length) { console.log(`Свежих идей${k ? ` вида ${k}` : ''} нет: всё было на последних ${recent} сайтах или отвергнуто. Придумать своё из товара и записать: ideas.mjs add …`); process.exit(0); }
  console.log(`Идеи для прогона ${run}${k ? ` (${k})` : ''} — не было на: ${[...recentRuns].join(', ') || 'нет прошлых'}:\n`);
  for (const { i, fit } of xs) console.log(`• ${i.id} [${STATUS_RU[i.status]}${fit ? `, совпадений с описанием: ${fit}` : ''}] ${i.title}\n  что: ${i.what}\n  кому: ${i.fits || '—'}${i.how ? `\n  как: ${i.how}` : ''}${i.quote ? `\n  пользователь: «${i.quote}»` : ''}\n`);
  console.log(`Взять: node ideas.mjs use <id> --run ${run} --block <блок>. Своё из товара — обязательно, банк — сверху.`);
  process.exit(0);
}

if (cmd === 'add') {
  const id = val('id'), title = val('title'), kind = val('kind'), what = val('what'), fits = val('fits');
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(id)) die('--id: латиница, цифры и дефис, 3–41 знак');
  if (list.some((x) => x.id === id)) die(`Идея «${id}» уже есть — ideas.mjs show ${id}`);
  if (!title || !what || !fits) die('Нужны --title, --what и --fits (каким сайтам подходит)');
  if (!KINDS.includes(kind)) die(`--kind: ${KINDS.join(', ')}`);
  const st = val('status') || 'untested'; if (!STATUS.includes(st)) die(`--status: ${STATUS.join(', ')}`);
  if (st === 'rejected' && !val('quote')) die('rejected — только со словами пользователя (--quote)');
  const run = runName(val('run'));
  const idea = { id, title, kind, what, fits, how: val('how'), status: st, quote: val('quote'), tags: val('tags') ? val('tags').split(',').map((x) => x.trim()).filter(Boolean) : [],
    source: { run, date: today(), block: val('block') }, uses: run ? [{ run, block: val('block'), date: today() }] : [] };
  list.push(idea); save(list);
  console.log(`OK записано: ${id} (${kind}, ${STATUS_RU[st]}) · ${FILE}`); process.exit(0);
}

if (cmd === 'use') {
  const i = find(list, pos[1]); const run = runName(val('run')); if (!run) die('use: нужен --run <прогон>');
  if (i.status === 'rejected') die(`«${i.id}» пользователь отверг: «${i.quote}» — не ставить`);
  i.uses = i.uses || []; if (!i.uses.some((u) => u.run === run && u.block === val('block'))) i.uses.push({ run, block: val('block'), date: today() });
  save(list); console.log(`OK ${i.id} → ${run}${val('block') ? ` (${val('block')})` : ''}`); process.exit(0);
}

if (cmd === 'status') {
  const i = find(list, pos[1]); const st = pos[2];
  if (!STATUS.includes(st)) die(`статус: ${STATUS.join(', ')}`);
  if ((st === 'liked' || st === 'rejected') && !val('quote')) die(`${st} — только со словами пользователя (--quote)`);
  i.status = st; if (val('quote')) i.quote = val('quote');
  i.history = i.history || []; i.history.push({ date: today(), status: st, quote: val('quote'), run: runName(val('run')) });
  save(list); console.log(`OK ${i.id}: ${STATUS_RU[st]}`); process.exit(0);
}

if (cmd === 'md') { save(list); console.log(`OK ${MD}`); process.exit(0); }

if (cmd === 'check') {
  const bad = [];
  const ids = new Set();
  for (const i of list) {
    if (ids.has(i.id)) bad.push(`повтор id ${i.id}`); ids.add(i.id);
    if (!KINDS.includes(i.kind)) bad.push(`${i.id}: вид «${i.kind}»`);
    if (!STATUS.includes(i.status)) bad.push(`${i.id}: статус «${i.status}»`);
    if (i.status === 'rejected' && !i.quote) bad.push(`${i.id}: отвергнута без слов пользователя`);
    if (!i.title || !i.what || !i.fits) bad.push(`${i.id}: нет title/what/fits`);
  }
  for (const b of bad) console.log(`FAIL ${b}`);
  console.log(`${bad.length ? 'FAIL' : 'OK'}: идей ${list.length} · ${FILE}`); process.exit(bad.length ? 1 : 0);
}

die(`Неизвестная команда «${cmd}» — node ideas.mjs --help`);
