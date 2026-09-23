#!/usr/bin/env node
/**
 * Журнал вкуса между прогонами: что пользователь отверг и что принял, с
 * картинкой, его словами и нашим пояснением. Читается в начале прогона
 * (brief); запреты пользователя подхватывает cliche.mjs --taste.
 *
 *   node taste.mjs add --block form --verdict rejected --by user --rule form-kit \
 *        --quote "<дословные слова пользователя>" --why "<что на картинке, своими словами>" \
 *        --img <кроп.png> [--run art] [--donor <url>] [--date 2026-09-22] [--source "<где сказано>"]
 *   node taste.mjs add --block form --verdict rejected --by self --rule form-kit --why "<почему отсеял>"
 *   node taste.mjs brief [--blocks form,faq,hero] [--last 10] [--baseline <json донора>]
 *   node taste.mjs bans [--baseline <json донора>] [--json]
 *   node taste.mjs check
 *   node taste.mjs --help
 *
 * Флаги:
 *   --dir <папка>      журнал; иначе SITE_REWORK_TASTE, иначе ~/.claude/site-rework/taste
 *   --block <имя>      блок страницы: form, faq, hero, footer, page…
 *   --verdict <v>      rejected (отвергнуто) | accepted (принято как есть) | preferred (выбрано из вариантов)
 *   --by <кто>         user — сказал пользователь; self — свой отсев. Без --by: user, если есть --quote, иначе self
 *   --quote "<текст>"  дословные слова пользователя, как он их написал; обязательно для --by user
 *   --why "<текст>"    что на картинке и в чём дело, своими словами; обязательно всегда
 *   --rule <id[,id]>   правила каталога cliche.mjs (node cliche.mjs rules), к которым относится запись
 *   --img <файл>       кроп; копируется в <журнал>/img/ (папка img/ создаётся только тогда)
 *   --run, --donor     прогон и адрес донора, при котором это сказано
 *   --date <ГГГГ-ММ-ДД> дата, когда сказано (по умолчанию сегодня)
 *   --source "<текст>" где сказано (сообщение, отзыв на снимок)
 *   --blocks a,b       brief: записи по этим блокам — открыть их картинки перед эскизом
 *   --last N           brief: сколько последних записей показать (10)
 *   --baseline <json>  brief/bans: база нового донора (cliche.mjs baseline) — какие запреты спорят с его чертами
 *   --viewport <имя>   brief/bans: экран базы (desktop по умолчанию); --viewports — то же самое.
 *                      Экран один: список «desktop,mobile» — ошибка (код 2)
 *   --json             bans: вывести запреты JSON-ом
 *   --help, -h, --h    справка (код 0, ничего не пишет)
 *
 * Коды выхода: 0 — готово; 1 — FAIL (запись отклонена, check нашёл битые строки, не создать
 * папку журнала); 2 — нет команды или неверный --viewport/--viewports.
 *
 * Правила журнала (исправление по аудиту A11):
 *   · by user — только с дословной цитатой пользователя в --quote. Свой вывод
 *     («у донора 1, у нас 63») — это --why и by self, а не слова пользователя.
 *   · Запретом становится только запись by user с verdict rejected и правилом.
 *     by self запретом не бывает: это подсказка на шаге авторства, не блок выхода.
 *   · Запрет снимается записью by user с verdict accepted/preferred по тому же
 *     правилу; с --donor — только для этого донора.
 *   · Запрет, который спорит с чертой нового донора (у донора этот приём есть),
 *     не блокирует молча: brief --baseline и cliche.mjs --taste выводят его
 *     вопросом пользователю.
 *
 * Файлы: journal.jsonl (одна запись — одна строка), img/ (только если был --img), README.md
 * (пишет add, если его нет: что за журнал, кто что пишет, как читать; свой README не
 * перезаписывается). brief, bans и check ничего не пишут. Все проверки аргументов add —
 * до создания папок и файлов. Отдельного bans.json нет:
 * запреты каждый раз считаются из журнала (последняя запись по правилу решает).
 * Модуль: activeBans(), readJournal(), tasteDir(), conflictsWith(), baselineResult(), isUserWord()
 * — их берёт cliche.mjs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';

export const VERDICTS = ['rejected', 'accepted', 'preferred'];

/** Папка журнала: явная, SITE_REWORK_TASTE или ~/.claude/site-rework/taste. */
export function tasteDir(dir) {
  if (dir && dir !== true) return path.resolve(String(dir));
  return process.env.SITE_REWORK_TASTE || path.join(os.homedir(), '.claude', 'site-rework', 'taste');
}

const rulesOf = (e) => [...new Set([].concat(e.rules || [], e.rule ? String(e.rule).split(',') : []).map((s) => String(s).trim()).filter(Boolean))];

/** Все записи журнала по порядку; битые строки — в .bad. */
export function readJournal(dir) {
  const J = path.join(tasteDir(dir), 'journal.jsonl');
  const out = []; out.bad = [];
  if (!fs.existsSync(J)) return out;
  fs.readFileSync(J, 'utf8').split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    try { const e = JSON.parse(l); e.rules = rulesOf(e); e.line = i + 1; out.push(e); } catch (err) { out.bad.push({ line: i + 1, error: err.message }); }
  });
  return out;
}

/** Засчитывается ли запись как слово пользователя: by user и непустая цитата. */
export const isUserWord = (e) => e.by === 'user' && typeof e.quote === 'string' && e.quote.trim().length > 0;

/**
 * Действующие запреты: { rule: { quote, why, date, run, donor, block, img, count, allowedFor: [донор…] } }.
 * Считаются только слова пользователя (isUserWord). Последняя по порядку запись
 * решает: rejected — запрет, accepted/preferred без донора — запрет снят,
 * с донором — снят только для этого донора (allowedFor).
 */
export function activeBans(dirOrEntries) {
  const list = Array.isArray(dirOrEntries) ? dirOrEntries : readJournal(dirOrEntries);
  const bans = {};
  for (const e of list) {
    if (!isUserWord(e)) continue;
    for (const r of rulesOf(e)) {
      if (e.verdict === 'rejected') {
        const b = bans[r] || { count: 0, allowedFor: [] };
        Object.assign(b, { quote: e.quote, why: e.why || '', date: e.date || '', run: e.run || '', donor: e.donor || '', block: e.block || '', img: e.img || '' });
        b.count++; bans[r] = b;
      } else if (bans[r]) {
        if (e.donor) { if (!bans[r].allowedFor.includes(e.donor)) bans[r].allowedFor.push(e.donor); } else delete bans[r];
      }
    }
  }
  return bans;
}

/**
 * Результат cliche.mjs для нужного экрана. Файл базы (cliche.mjs baseline) и итог прогона
 * (cliche.json) хранят несколько экранов в viewports; старый формат — один результат с rules.
 * Нет такого экрана — берётся экран того же класса (широкий ≥1024 px или узкий), иначе первый;
 * у результата остаётся свой .viewport, по нему видно, что экран другой.
 */
export function baselineResult(json, vpName = 'desktop', vp = null) {
  if (!json) return null;
  if (json.viewports && typeof json.viewports === 'object') {
    const list = Object.entries(json.viewports).filter(([, r]) => r && r.rules);
    if (!list.length) return null;
    const exact = list.find(([n]) => n === vpName); if (exact) return exact[1];
    const wide = vp && vp.width ? vp.width >= 1024 : ['desktop', 'laptop'].includes(vpName);
    const same = list.find(([, r]) => (((r.page && r.page.vw) || 0) >= 1024) === wide);
    return (same || list[0])[1];
  }
  return json.rules ? json : null;
}

/** Какие запреты спорят с чертами донора: [{ rule, ban, donorCount }]. */
export function conflictsWith(bans, donorResult) {
  if (!donorResult || !donorResult.rules) return [];
  const url = donorResult.url || '';
  return Object.entries(bans).filter(([r, b]) => donorResult.rules[r] && donorResult.rules[r].count > 0 && !b.allowedFor.includes(url)).map(([rule, ban]) => ({ rule, ban, donorCount: donorResult.rules[rule].count }));
}

/* Известные id правил — из каталога cliche.mjs (читаем текст, чтобы не импортировать скрипт). */
function knownRules() {
  try {
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cliche.mjs'), 'utf8');
    const ids = new Set([...src.matchAll(/^\s*'?([a-z0-9-]+)'?\s*:\s*\{\s*w:\s*\d/gm)].map((m) => m[1]));
    return ids.size ? ids : null;
  } catch { return null; }
}

/* Цитата пользователя не должна быть нашим выводом: числа σ, «у донора N», «×N» — повод перепроверить. */
const looksLikeOwnConclusion = (q) => /σ|×\s*\d|\bx\d|у донора|у нас у|пиксел|\d+(\.\d+)?\s*%/i.test(q);

/* ---------- командная строка ---------- */
function readBaseline(file, vpName) {
  if (!file || file === true) return null;
  try { return baselineResult(JSON.parse(fs.readFileSync(String(file), 'utf8')), vpName || 'desktop'); } catch (e) { console.error(`WARN  не прочитать базу ${file}: ${e.message}`); return null; }
}

/* README.md журнала: пишет add, если файла нет. Текст — как у ~/.claude/site-rework/taste/README.md. */
const JOURNAL_README = [
  '# Журнал вкуса',
  '',
  'Память между прогонами скилла site-rework: что пользователь отверг и что принял,',
  'его словами и с картинкой. Пишет и читает `scripts/taste.mjs`, запреты',
  'подхватывает `scripts/cliche.mjs --taste`.',
  '',
  '## Файлы',
  '',
  '| файл | что в нём |',
  '|---|---|',
  '| `journal.jsonl` | одна запись — одна строка JSON: дата, прогон, донор, блок, вердикт, кто решил, правила, цитата, пояснение, картинка |',
  '| `img/` | кропы: что отвергли и что приняли (копирует `taste.mjs add --img`) |',
  '| `README.md` | этот файл |',
  '',
  'Отдельного `bans.json` нет: запреты каждый раз считаются из журнала, последняя',
  'запись по правилу решает.',
  '',
  '## Кто что пишет',
  '',
  '- `--by user` — **только дословная цитата пользователя** в `--quote`, как он её',
  '  написал, с опечатками. Свой вывод («у донора 1, у нас 63», σ, проценты) —',
  '  это `--why`, а запись тогда `--by self`.',
  '- `--by self` — свой отсев на шаге авторства. Запретом не бывает: это подсказка,',
  '  выход прогона она не блокирует.',
  '- Запрет = запись `by user` + `verdict rejected` + правило из каталога',
  '  (`node cliche.mjs rules`).',
  '- Снять запрет может только пользователь: запись `by user` с `accepted` или',
  '  `preferred` по тому же правилу; с `--donor` — только для этого донора.',
  '- Запрет, который спорит с явной чертой нового донора (у донора этот приём',
  '  есть), не блокирует молча: `cliche.mjs --taste` и `taste.mjs brief --baseline`',
  '  выводят его как ВОПРОС пользователю.',
  '',
  '## Команды',
  '',
  '```',
  'node scripts/taste.mjs brief --blocks form,hero,faq [--baseline <база донора>]   # этап 0 прогона',
  'node scripts/taste.mjs add --block form --verdict rejected --by user --rule form-kit \\',
  '     --quote "<дословно>" --why "<что на картинке>" --img <кроп.png> --run <прогон> --donor <url>',
  'node scripts/taste.mjs bans [--baseline <база донора>] [--json]',
  'node scripts/taste.mjs check',
  '```',
  '',
  '## Чего здесь быть не должно',
  '',
  'Личных данных пользователя (почта, имя, телефон) и чужих данных из переписки.',
  'Единственный текст пользователя в журнале — дословная цитата его оценки.',
  '',
].join('\n');

/* справка = шапка этого файла */
function help() {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const m = /\/\*\*([\s\S]*?)\*\//.exec(src);
  console.log(m ? m[1].split(/\r?\n/).map((l) => l.replace(/^ \* ?/, '')).join('\n').trim() : 'taste.mjs add|brief|bans|check');
}

function cli() {
  const { pos, opt } = parseArgs(process.argv.slice(2), { values: ['quote', 'why', 'source', 'rule', 'block', 'img', 'run', 'donor', 'dir', 'baseline', 'blocks'], flags: ['json', 'help', 'h'] });
  const cmd = pos[0];
  /* -h, --h, --help и «help» — справка у любой команды, код 0, ничего не пишется */
  if (opt.help || opt.h || pos.includes('-h') || cmd === 'help') { help(); return; }
  const dir = tasteDir(opt.dir);
  const J = path.join(dir, 'journal.jsonl'); const IMG = path.join(dir, 'img');
  const str = (k) => (opt[k] === undefined || opt[k] === true ? '' : String(opt[k]));

  if (cmd === 'add') {
    const quote = str('quote').trim();
    const by = str('by') || (quote ? 'user' : 'self');
    const e = { date: str('date') || new Date().toLocaleDateString('sv-SE'), run: str('run'), donor: str('donor'), block: str('block') || 'page', verdict: str('verdict') || 'rejected', by, rules: rulesOf({ rule: str('rule') }), quote, why: str('why').trim(), source: str('source'), img: '' };
    if (!VERDICTS.includes(e.verdict)) { console.error(`FAIL  --verdict: ${VERDICTS.join(' | ')}`); process.exit(1); }
    if (!['user', 'self'].includes(e.by)) { console.error('FAIL  --by: user | self'); process.exit(1); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) { console.error('FAIL  --date в виде ГГГГ-ММ-ДД'); process.exit(1); }
    if (!e.why) { console.error('FAIL  --why обязателен: запись без пояснения ничему не учит'); process.exit(1); }
    if (e.by === 'user' && !quote) { console.error('FAIL  --by user без --quote: слово пользователя записывается только дословной цитатой. Свой вывод — --by self'); process.exit(1); }
    if (e.by === 'self' && quote) { console.error('FAIL  --quote у записи --by self: цитата бывает только у слов пользователя'); process.exit(1); }
    const known = knownRules();
    const unknown = known ? e.rules.filter((r) => !known.has(r)) : [];
    if (unknown.length) { console.error(`FAIL  неизвестные правила: ${unknown.join(', ')} (список: node cliche.mjs rules)`); process.exit(1); }
    if (e.by === 'user' && looksLikeOwnConclusion(quote)) console.error('WARN  цитата похожа на вывод из замеров, а не на слова пользователя — проверьте, что это дословно его текст');
    const src = str('img');
    if (src && !fs.existsSync(src)) { console.error(`FAIL  нет файла ${src}`); process.exit(1); }
    if (src && !fs.statSync(src).isFile()) { console.error(`FAIL  --img ${src}: это не файл`); process.exit(1); }
    /* все проверки позади — теперь папки и файлы; img/ — только под картинку */
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (src) {
        fs.mkdirSync(IMG, { recursive: true });
        const n = readJournal(dir).length + 1;
        const name = `${e.date}-${e.block.replace(/[^\wа-яё-]+/gi, '-')}-${e.verdict}-${n}${path.extname(src) || '.png'}`;
        fs.copyFileSync(src, path.join(IMG, name)); e.img = 'img/' + name;
      }
      if (!e.source) delete e.source;
      fs.appendFileSync(J, JSON.stringify(e) + '\n');
    } catch (err) { console.error(`FAIL  не записать в журнал ${dir}: ${err.message}`); process.exit(1); }
    /* README журнала — если его нет (первая запись в новом журнале); свой не перезаписывается */
    const README = path.join(dir, 'README.md');
    if (!fs.existsSync(README)) {
      try { fs.writeFileSync(README, JOURNAL_README, { flag: 'wx' }); console.log(`OK    README.md журнала: ${README}`); }
      catch (err) { if (err.code !== 'EEXIST') console.error(`WARN  не записать ${README}: ${err.message}`); }
    }
    const ban = e.by === 'user' && e.verdict === 'rejected' && e.rules.length;
    console.log(`OK    записано: ${e.verdict} · ${e.block} · ${e.by} · ${e.rules.join(', ') || 'без правила'}${e.img ? ' · ' + e.img : ''}${ban ? ' — действует как запрет для cliche.mjs --taste' : e.by === 'self' ? ' — подсказка, не запрет' : ''}`);
    return;
  }

  if (cmd === 'brief' || cmd === 'bans') {
    /* экран базы: --viewport и --viewports — одно и то же, экран один */
    const vpGiven = ['viewport', 'viewports'].filter((k) => opt[k] !== undefined).map((k) => [k, str(k).trim()]);
    if (vpGiven.length === 2 && vpGiven[0][1] !== vpGiven[1][1]) { console.error(`FAIL  заданы и --viewport ${vpGiven[0][1] || '(пусто)'}, и --viewports ${vpGiven[1][1] || '(пусто)'} — это один флаг; экран базы один`); process.exit(2); }
    const [vpFlag, vpRaw] = vpGiven[0] || ['viewport', ''];
    const vpList = vpRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (vpGiven.length && !vpList.length) { console.error(`FAIL  --${vpFlag}: нужно имя экрана (desktop, mobile…)`); process.exit(2); }
    if (vpList.length > 1) { console.error(`FAIL  --${vpFlag} ${vpRaw}: экран базы один — запустите по разу на каждый (${vpList.map((x) => `--viewport ${x}`).join(', затем ')})`); process.exit(2); }
    const all = readJournal(dir); const bans = activeBans(all);
    const donor = readBaseline(opt.baseline, vpList[0] || 'desktop');
    const conflicts = conflictsWith(bans, donor);
    if (cmd === 'bans' && opt.json) { console.log(JSON.stringify({ dir, bans, conflicts: conflicts.map((c) => ({ rule: c.rule, donorCount: c.donorCount })) }, null, 1)); return; }
    console.log(`Журнал вкуса: ${dir} · записей ${all.length}${all.bad.length ? ` · битых строк ${all.bad.length}` : ''}`);
    console.log('\nЗапреты пользователя (cliche.mjs --taste: FAIL, если приёма нет у донора; вопрос, если есть):');
    if (!Object.keys(bans).length) console.log('  нет');
    for (const [rule, b] of Object.entries(bans)) console.log(`  ✗ ${rule} — ${b.date} ${b.block}${b.run ? ` (прогон ${b.run})` : ''}: «${b.quote}»${b.why ? `\n      о чём: ${b.why}` : ''}${b.img ? `\n      картинка: ${path.join(dir, b.img)}` : ''}${b.allowedFor.length ? `\n      разрешён для доноров: ${b.allowedFor.join(', ')}` : ''}`);
    const noQuote = all.filter((e) => e.by === 'user' && !isUserWord(e));
    if (noQuote.length) console.log(`\n  WARN  записей by user без цитаты: ${noQuote.length} (строки ${noQuote.map((e) => e.line).join(', ')}) — запретами не считаются`);
    if (donor) {
      console.log(`\nСпор с новым донором ${donor.url || opt.baseline}:`);
      if (!conflicts.length) console.log('  нет: ни один запрет не касается приёмов, которые у донора есть');
      for (const c of conflicts) console.log(`  ? ${c.rule}: у донора этот приём есть (${c.donorCount} шт). Спросить пользователя: держится ли запрет «${c.ban.quote}» для этого донора? Ответ записать: taste.mjs add --by user --verdict accepted|rejected --rule ${c.rule} --donor ${donor.url || '<url>'} --quote "…" --why "…"`);
    }
    if (cmd === 'bans') return;
    const show = (e) => `  ${e.verdict === 'rejected' ? '✗' : '✓'} ${e.date} ${e.block} [${e.by}] ${e.rules.length ? e.rules.join(',') + ': ' : ''}${isUserWord(e) ? `«${e.quote}» — ` : ''}${e.why}${e.img ? `\n      картинка: ${path.join(dir, e.img)}` : ''}`;
    const blocks = str('blocks').split(',').map((s) => s.trim()).filter(Boolean);
    if (blocks.length) {
      const pick = all.filter((e) => blocks.includes(e.block));
      console.log(`\nПо блокам этого прогона (${blocks.join(', ')}) — открыть картинки через Read перед эскизом:`);
      console.log(pick.length ? pick.map(show).join('\n') : '  нет записей');
    }
    const last = all.slice(-(Number(opt.last) || 10));
    console.log(`\nПоследние ${last.length}:`); console.log(last.map(show).join('\n') || '  нет');
    const pref = all.filter((e) => e.verdict !== 'rejected' && isUserWord(e));
    if (pref.length) { console.log('\nЧто пользователь принял (первый кандидат для такого же блока, если не спорит с паспортом донора):'); console.log(pref.slice(-8).map(show).join('\n')); }
    return;
  }

  if (cmd === 'check') {
    const all = readJournal(dir); const known = knownRules(); let fails = 0, warns = 0;
    const line = (st, t) => { if (st === 'FAIL') fails++; if (st === 'WARN') warns++; console.log(`${st.padEnd(5)} ${t}`); };
    if (!fs.existsSync(J)) line('OK', `журнала ещё нет: ${J}`);
    for (const b of all.bad) line('FAIL', `строка ${b.line}: не JSON (${b.error})`);
    for (const e of all) {
      const at = `строка ${e.line} (${e.date} ${e.block} ${e.verdict} ${e.by})`;
      if (!VERDICTS.includes(e.verdict)) line('FAIL', `${at}: verdict «${e.verdict}»`);
      if (e.by === 'user' && !isUserWord(e)) line('WARN', `${at}: by user без цитаты — запретом не считается; перепишите как by self или добавьте дословные слова`);
      if (isUserWord(e) && looksLikeOwnConclusion(e.quote)) line('WARN', `${at}: цитата похожа на вывод из замеров`);
      if (e.img && !fs.existsSync(path.join(dir, e.img))) line('WARN', `${at}: нет картинки ${e.img}`);
      const unknown = known ? e.rules.filter((r) => !known.has(r)) : [];
      if (unknown.length) line('WARN', `${at}: неизвестные правила ${unknown.join(', ')}`);
    }
    line(fails ? 'FAIL' : warns ? 'WARN' : 'OK', `записей ${all.length}, запретов ${Object.keys(activeBans(all)).length}`);
    if (fails) process.exit(1);
    return;
  }

  console.error(cmd ? `FAIL  неизвестная команда «${cmd}»: add | brief | bans | check | --help` : 'node taste.mjs add|brief|bans|check … (node taste.mjs --help)'); process.exit(2);
}

/* CLI — только когда файл запущен сам, а не импортирован cliche.mjs */
const self = path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === self) cli();
