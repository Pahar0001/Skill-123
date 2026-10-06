#!/usr/bin/env node
/**
 * Реестр требований прогона site-rework: что просил пользователь (сообщения, ТЗ и PRD в .docx и
 * .pdf, голосовые через расшифровку, скриншоты, ссылки) — дословно и с источником; чем каждое
 * требование проверяется; какие задачи журнала state.mjs его делают; что задевает новое или
 * изменённое требование; где противоречия. Справка — node requirements.mjs --help (текст HELP ниже:
 * в комментарии его не держать — маркер критерия содержит конец комментария).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, readJson, writeJson, parseViewport } from './lib.mjs';

const HELP = `Реестр требований прогона: что просил пользователь — сообщения, ТЗ и PRD (.docx, .pdf),
голосовые (через расшифровку whisper), скриншоты, ссылки — дословно, с источником и местом;
чем каждое требование проверяется (критерий приёмки); какие задачи журнала state.mjs его делают;
что задевает новое или изменённое требование; где противоречия. В режиме new реестр обязателен,
в остальных — как только источников требований больше одного.

  node requirements.mjs <папка прогона> <команда> …

Источники и требования
  ingest --file <путь> | --text "<сообщение>" | --stdin | --url <ссылка>
         [--kind doc|chat|voice|image|link|brief] [--said "2026-09-28 14:05"] [--original <аудио|pdf>]
         [--note "<что это; у картинки и ссылки — слова пользователя о ней>"] [--supersedes S-001] [--force]
      Заводит источник S-00N: копия файла и извлечённый текст — <папка>/requirements/sources/,
      кандидаты c01… (цитата, место, вид, пометки шума, подсказки) — S-00N.candidates.json.
      Требований не пишет. .docx — абзацы и таблицы по заголовкам столбцов (свой разбор zip);
      .pdf — pdftotext -layout (есть в Git), иначе python pypdf, иначе отказ с обходом (Read);
      .txt .md — строки и пункты; расшифровка whisper (.md с **мм:сс**) — вид voice, место — время;
      аудио и видео — отказ с готовой командой whisper; картинка — источник без кандидатов.
      Тот же файл или текст второй раз — отказ (--force — записать). --supersedes — новая версия
      документа: кандидаты сверяются с прошлой по номеру (FR-01) и по тексту — добавлено, изменено, пропало.
  add --from S-00N --take 18-25,27 [--kind …] [--priority …] [--page /,/room] [--block chat] [--to R-001] [--force]
      Взять кандидатов: текст, вид, приоритет, номер и «критерий из документа» — из кандидата,
      цитата — строка источника. --to R-001 — приложить вторым источником к уже взятому требованию.
      Помеченных шумом (заглушка, пример шаблона?, метаданные) без --force не берёт; личные данные
      (ФИО) не берёт никогда — они снимаются сами при ingest.
  add --from S-00N --dismiss 1-5,17 --why "<почему не взято>"
  add "<атомарное требование>" --source S-00N --quote "<дословно>" --kind <вид> [--priority must]
      [--loc "<где в источнике>"] [--ext FR-03] [--page …] [--block …] [--accept "<вид>: <что считается выполненным>"]…
      Своя формулировка из прозы, голосового, скриншота. Цитата обязательна и ищется в тексте
      источника (у картинки и ссылки — в его --note): не нашлась — отказ. Без --source — ищется
      во всех источниках.
  change R-007 [--text …] [--priority …] [--kind …] [--page …] [--block …] --quote "<дословно>" [--source S-00N] [--why …]
      Смысл поменялся словами пользователя: редакция +1, changedAt, история «было → стало»,
      needsReview; печатает влияние. Своя правка без смены смысла (перефразирование, вид, раскладка,
      свой приоритет) — --self --why "…": редакция прежняя, доказательства не устаревают.
  status R-007 active|question|deferred|dropped|superseded|out [--by R-012] [--quote "<слова пользователя>"] [--source S-00N] [--why …] [--self]
      dropped, deferred, out — только словами пользователя (--quote); своё снятие (--self, только
      dropped, с --why) — только шум документа (пример шаблона, заглушка, дубль); superseded —
      только с --by R-… (у нового своя цитата).
  link R-007 <задача>[,<задача>]   unlink R-007 <задача>   review R-007 --note "<что решено по задачам>"
      link и review снимают needsReview; задача должна быть в state.json.
  plan R-007[,R-008] "<задача>" [--priority P1] [--area room]
      = state.mjs <папка> add "<задача>" … и связь новой задачи со всеми названными требованиями.
      Приоритет по умолчанию — из требований: must-функция, страница, факт P1; стиль, кадры P2;
      тексты P3; движение P4; should — на ступень ниже; could и wont — P5.
  accept R-007 --add "<вид>: <текст>" [--marker R-007.c] [--viewport mobile] [--how "<команда>"] [--metric "LCP<=2000"] [--reason "…"]
  accept R-007 --edit a [--how …] [--metric …] [--viewport …] [--marker …] [--reason …]
  accept R-007 --drop c
  accept R-007 --evidence a <файл[#шаг]> [--note "что видно"]     явное доказательство (снимок для eye, протокол…)
      Правка критериев редакцию требования не меняет.
  ask R-004,R-005 "<вопрос>" [--option "…"]…
  answer Q-001 --quote "<дословно>" [--source S-00N]      ответ пользователя (сообщение — сначала ingest)
  assume Q-001 "<допущение>"                             ответа нет (сессия автономная): допущение идёт в отчёт
  ack R-007 <тип> [--with R-012] --why "…"                известный конфликт с причиной — conflicts его не повторяет
  direction <a|b|c> (--quote "<слова пользователя>" [--source S-00N] | --self --why "…")   выбранное направление

Чтение
  list [--kind …] [--decision …] [--page …] [--open]     open — активные без задачи, без критерия или с needsReview
  show R-007                                             источники, история, критерии и их статус, задачи
  impact R-007[,R-008] | --text "<новое требование>"       задачи и их статусы, страницы, блоки, доказательства, язык сайта
  conflicts [R-007] [--strict] [--json]                    противоречия и подозрения (типы ниже)
  report [--md <файл>] [--plan]                            раздел «Требования» для отчёта; --plan — требование → страница и
                                                         блок → задача → критерий (таблица плана для analysis.md)
  checks [--only R-001,R-007] [--url <адрес>] [--sh <файл>] [--journal <файл>]
      Команды проверок из критериев (how: {url} и {run} подставляются) — по одной за раз, как
      checks.sh у VN3D; без --sh — в stdout. --journal — команды state.mjs set для задач по
      доказательствам: runtime и mobile — протокол#/*маркер*/, perf — замер; visual не
      подставляется: снимок смотрит модель.
  check                                                  целостность реестра, код 1 при FAIL
  md                                                     пересобрать requirements.md
  --selftest | selftest                                  разбор и весь цикл команд на fixtures/requirements
  --help, -h                                             эта справка, ничего не пишет

Виды (--kind): feature page content style motion media perf a11y compat seo security reliability
  legal integration tech fact constraint success reference; контекст (не задачи, без критерия):
  glossary audience risk assumption schedule about.
Приоритет: must should could wont — из документа как там (prioFrom doc), из чата по словам (user),
  своё (self).
Критерий (accept «вид: текст»): runtime, mobile, browser — утверждение с маркером в начале:
  runtime.mjs {url} --out {run} --tag r007 --assert "/*R-007.a*/ <выражение>" — протокол
  находится сам (самый новый в <папка>/runtime с этим шагом; mobile — экран уже 1024 px, browser —
  Firefox); eye — снимок, accept --evidence после взгляда; verify, a11y, motion, cliche, texture —
  протокол скрипта (--evidence; a11y и perf с --tag в how находятся сами); perf — замер, --metric
  "LCP<=2000" сверяется со значением протокола; manual — только с --reason, идёт в «Не проверено».
  У активного must (не контекст) — хотя бы один критерий.
Статус критерия: проверено · устарело (сайт правили — по времени файлов сайта; требование
  изменено — доказательство снято до changedAt) · провалено · нет доказательства · вручную.
  Доказательство проверяет state.mjs probe — те же правила, что у state.mjs set … VERIFIED.
Статус требования: решение, если оно не active; контекст; иначе нет задачи → в работе (не все
  задачи DONE) → нет критерия → провалено / устарело / без доказательства / выполнено.
Конфликты (тип — для ack): pair — между требованиями (одна страница, блок или общие слова, а
  полярность или числа одной единицы разные); fact — нужен факт, которого нет (отзывы, цены, сроки,
  гарантии, клиенты, команда, контакты, ключ сервиса); taste — запрет журнала вкуса (и приёмы из
  каталога шаблонов); borrow — граница заимствования; server — вне скилла (сервер, оплата,
  развёртывание); stack — стек из ТЗ; pd — форма без согласия на обработку данных; passport —
  стиль против «никогда» паспорта донора или направления; noise — взят шум документа; manual —
  проверка здесь невозможна (Edge, Safari, нагрузка, доставка писем, серверная надёжность).
  Вопрос с ответом или допущением (assume) по этим требованиям закрывает server и stack.

Файлы: <папка>/requirements.json — реестр (журнал, не протокол: без generator); requirements.md —
  читаемая сводка, пересобирается после каждой записи; requirements/sources/S-00N.* — копия
  исходника, извлечённый текст (.txt), кандидаты (.candidates.json). Исходники с чужими личными
  данными лежат только здесь; в реестр и отчёт ФИО не попадают. state.json только читается;
  задачи создаёт state.mjs (plan вызывает его) — запускать по одному: два писателя.
Коды выхода: 0 — готово; 1 — отказ (запись не прошла, check нашёл FAIL, conflicts --strict что-то
  нашёл, selftest не прошёл); 2 — ошибка аргументов.`;

const SELF = fileURLToPath(import.meta.url);
const SCRIPTS = path.dirname(SELF);
const STATE_MJS = path.join(SCRIPTS, 'state.mjs');
const DR_TOOLS = ['extract.mjs', 'verify.mjs', 'cyrillic-check.mjs'];

const KINDS = ['feature', 'page', 'content', 'style', 'motion', 'media', 'perf', 'a11y', 'compat', 'seo', 'security', 'reliability', 'legal', 'integration', 'tech', 'fact', 'constraint', 'success', 'reference', 'glossary', 'audience', 'risk', 'assumption', 'schedule', 'about'];
const CONTEXT = ['glossary', 'audience', 'risk', 'assumption', 'schedule', 'about'];
const KIND_RU = { feature: 'функция', page: 'страница', content: 'текст', style: 'стиль', motion: 'движение', media: 'кадры', perf: 'скорость', a11y: 'доступность', compat: 'браузеры', seo: 'поиск', security: 'безопасность', reliability: 'надёжность', legal: 'юр.', integration: 'интеграция', tech: 'стек', fact: 'факт', constraint: 'запрет', success: 'успех', reference: 'референс', glossary: 'глоссарий', audience: 'аудитория', risk: 'риск', assumption: 'допущение', schedule: 'график', about: 'о продукте' };
const PRIOS = ['must', 'should', 'could', 'wont'];
const DECISIONS = ['active', 'question', 'deferred', 'dropped', 'superseded', 'out'];
const DECISION_RU = { active: 'действует', question: 'вопрос', deferred: 'отложено', dropped: 'снято', superseded: 'заменено', out: 'вне работы' };
const ACCEPT_KINDS = ['runtime', 'mobile', 'eye', 'verify', 'a11y', 'motion', 'perf', 'cliche', 'texture', 'browser', 'manual'];
const MARKER_KINDS = ['runtime', 'mobile', 'browser'];
const SRC_KINDS = ['doc', 'chat', 'voice', 'image', 'link', 'brief'];
const SRC_RU = { doc: 'документ', chat: 'сообщение', voice: 'голосовое', image: 'скриншот', link: 'ссылка', brief: 'бриф' };
const USER_SRC = ['chat', 'voice', 'brief', 'image', 'link'];
const NOISE = ['заглушка', 'пример шаблона?', 'метаданные'];
const PERSONAL = 'личные данные';
const CONFLICT_TYPES = { pair: 'между требованиями', fact: 'нужен факт', taste: 'запрет вкуса', borrow: 'граница заимствования', server: 'вне скилла', stack: 'стек', pd: 'ПДн', passport: 'паспорт', noise: 'шум документа', manual: 'проверка здесь невозможна' };
const AUDIO = /\.(ogg|oga|opus|mp3|m4a|wav|flac|aac|wma|amr|mp4|m4v|mov|webm|mkv|avi)$/i;
const IMAGE = /\.(png|jpe?g|webp|gif|avif|bmp|heic)$/i;

/* ---------- аргументы ---------- */

const argv = process.argv.slice(2);
const VALUES = ['file', 'text', 'kind', 'said', 'original', 'url', 'note', 'supersedes', 'from', 'take', 'dismiss', 'why', 'priority', 'page', 'block', 'source', 'quote', 'loc', 'ext', 'accept', 'by', 'add', 'edit', 'drop', 'evidence', 'marker', 'viewport', 'how', 'metric', 'reason', 'option', 'only', 'sh', 'journal', 'md', 'to', 'with', 'decision', 'area'];
const FLAGS = ['help', 'h', 'stdin', 'force', 'self', 'open', 'plan', 'strict', 'json', 'selftest'];
const COMMANDS = ['ingest', 'add', 'change', 'status', 'link', 'unlink', 'review', 'plan', 'accept', 'ask', 'answer', 'assume', 'ack', 'direction', 'list', 'show', 'impact', 'conflicts', 'report', 'checks', 'check', 'md', 'selftest'];
const { pos, opt } = parseArgs(argv, { values: VALUES, flags: FLAGS, commands: COMMANDS });
if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
const die = (m, code = 1) => { console.error(`FAIL ${m}`); process.exit(code); };
const usage = (m) => die(m, 2);
/* «--why --force»: parseArgs заберёт следующий флаг значением — это забытое значение */
{
  const known = new Set([...VALUES, ...FLAGS]);
  for (let i = 0; i < argv.length - 1; i++) {
    const k = /^--([\w-]+)$/.exec(argv[i]); if (!k || !VALUES.includes(k[1])) continue;
    const f = /^--([A-Za-z][\w-]*)(=.*)?$/.exec(String(argv[i + 1]));
    if (f && known.has(f[1])) usage(`--${k[1]} без значения: следом стоит флаг --${f[1]}`);
  }
}
const val = (k) => (opt[k] === undefined || opt[k] === true ? '' : String(opt[k]).trim());
/* флаг, который можно повторить (--accept, --option): все значения по порядку */
const multi = (k) => { const out = []; for (let i = 0; i < argv.length; i++) { const a = String(argv[i]); if (a === `--${k}` && i + 1 < argv.length) out.push(String(argv[++i])); else if (a.startsWith(`--${k}=`)) out.push(a.slice(k.length + 3)); } return out.map((x) => x.trim()).filter(Boolean); };

/* ---------- мелочи ---------- */

const now = () => new Date().toISOString();
const fmt = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Date(t).toLocaleString('sv-SE').slice(0, 16) : '—'; };
const dm = (s) => { const t = Date.parse(s || ''); if (!Number.isFinite(t)) return s ? String(s) : '—'; const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };
const short = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const idsOf = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const numOf = (id, p) => { const m = new RegExp(`^${p}-?0*(\\d+)$`, 'i').exec(String(id || '').trim()); return m ? Number(m[1]) : null; };
const nextId = (list, p) => `${p}-${String(list.reduce((m, x) => Math.max(m, numOf(x.id, p) || 0), 0) + 1).padStart(3, '0')}`;
const cid = (n) => `c${String(n).padStart(2, '0')}`;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
/* Git Bash превращает «/room» в «C:/Program Files/Git/room» — вернуть как было */
const unGit = (s) => String(s || '').replace(/[a-z]:[\\/]program files[\\/]git(?=[\\/])/gi, '');
const pagesOf = (s) => idsOf(unGit(s)).map((p) => p.replace(/\\/g, '/')).map((p) => (p === '*' || p.startsWith('/') ? p : `/${p}`));
function ranges(spec) {
  const out = [];
  for (const p of idsOf(spec)) {
    const m = /^c?(\d+)(?:\s*-\s*c?(\d+))?$/i.exec(p); if (!m) usage(`номера кандидатов: «${p}» — нужно 18-25,27 (или c18-c25)`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (!out.includes(i)) out.push(i);
  }
  return out;
}

/* ---------- текст: сравнение цитат, основы слов ---------- */

const normQ = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[«»“”„"'`]/g, '"').replace(/[‐‑‒–—―−]/g, '-').replace(/[\u00a0\u2009\u202f]/g, ' ').replace(/\*\*/g, '').replace(/\s*\|\s*/g, ' | ').replace(/\s+/g, ' ').trim();
const ENDINGS = ['ями', 'ами', 'иях', 'ией', 'ого', 'ему', 'ыми', 'ими', 'ах', 'ях', 'ов', 'ев', 'ей', 'ой', 'ый', 'ий', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ом', 'ем', 'ам', 'ям', 'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о', 'ь'];
const stem = (w) => { for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 3) return w.slice(0, -e.length); return w; };
const STOP = new Set(['котор', 'чтобы', 'этот', 'такж', 'можн', 'нужн', 'пользовател', 'должен', 'должн', 'будет', 'есть', 'когда', 'если', 'только', 'для', 'как', 'это', 'все', 'что', 'так', 'или', 'при', 'его', 'она', 'они', 'там', 'тут', 'вот', 'нам', 'вам', 'наш', 'над', 'под', 'без', 'нет', 'нужно', 'надо', 'пока', 'ещё', 'еще', 'сайт', 'страниц', 'ваш']);
const words = (s, min = 4) => new Set(String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/i).filter((w) => w.length >= min).map(stem).filter((w) => !STOP.has(w)));
const jaccard = (a, b) => { const A = words(a), B = words(b); if (A.size < 2 || B.size < 2) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };
/* общие основы: совпадение или одна — начало другой (курсив / курсивные), от 3 букв */
const common = (a, b, min = 3) => { const B = [...words(b, min)]; return [...words(a, min)].filter((x) => B.some((y) => x === y || (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x))))); };
const NEG = /(?<![а-яё])(не|нет|без|нельзя|убер[иа][а-яё]*|убрать|никаких|запрет[а-яё]*)(?![а-яё])/i;
/* отрицание относится к общему слову: стоит перед ним не дальше трёх слов («без градиентов», «убрать чат»)
   или после него как «не надо / не нужно» («чат пока не надо»); «ошибки не приводят к потере комнаты» и
   «ключи API не видны» — не про комнату и не про API */
function negNear(text, stemsList) {
  const toks = String(text).toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/i).filter(Boolean);
  const neg = toks.map((t, i) => (/^(не|нет|без|нельзя|убер[иа]\S*|убрать|никаких|запрет\S*)$/.test(t) ? i : -1)).filter((i) => i >= 0);
  if (!neg.length) return false;
  const hit = toks.map((t, i) => (stemsList.some((s) => stem(t) === s || (t.length >= 5 && s.length >= 5 && (stem(t).startsWith(s) || s.startsWith(stem(t))))) ? i : -1)).filter((i) => i >= 0);
  const modal = (n) => toks[n] === 'нет' || toks[n] === 'нельзя' || /^(надо|нужн\S*|нужен|стоит|делай|делать|показыва\S*|ставь|ставить)$/.test(toks[n + 1] || '');
  return hit.some((h) => neg.some((n) => (n < h && h - n <= 3) || (h < n && n - h <= 3 && modal(n))));
}
const MODAL = /(?<![а-яё])(долж[а-яё]*|нужн[а-яё]*|надо|хочу|хотим|хочется|чтобы|обязательн[а-яё]*|нельзя|добав[а-яё]+|убер[а-яё]+|убра[а-яё]+|сдела[а-яё]+|помен[а-яё]+|замен[а-яё]+|пусть|может|могут|сможет|показыва[а-яё]+)(?![а-яё])/i;

/* ---------- извлечение текста: .docx без зависимостей, .pdf через pdftotext или pypdf ---------- */

function unzipEntry(buf, want) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('не zip (.docx — это zip-архив): файл битый или это старый .doc');
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('битый каталог zip');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    if (name === want) { const s = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28); const data = buf.subarray(s, s + csize); return method === 0 ? data : zlib.inflateRawSync(data); }
    p += 46 + nl + el + cl;
  }
  throw new Error(`в архиве нет ${want}`);
}
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
function paraText(x) {
  let t = '';
  for (const m of x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) t += m[1] !== undefined ? unesc(m[1]) : m[0] === '<w:tab/>' ? '\t' : '\n';
  return { text: t.replace(/[ \t\u00a0]+/g, ' ').trim(), style: (/<w:pStyle w:val="([^"]+)"/.exec(x) || [])[1] || '', list: /<w:numPr>/.test(x) };
}
/* заголовок: стиль Heading/Title (или номер стиля), либо «2.1. Какую проблему…» — коротко и без точки в конце */
const isHeading = (text, style) => ((/^(heading|title|заголов|subtitle)/i.test(style) || /^[1-9]$/.test(style)) && text.length < 90 && !/[.!?;:,]$/.test(text))
  || (/^\d+(\.\d+)*\.?\s+[А-ЯЁA-Z]/.test(text) && text.length < 70 && !/[.!?;:,]$/.test(text));
function docxBlocks(buf) {
  const xml = unzipEntry(buf, 'word/document.xml').toString('utf8');
  const body = xml.slice(xml.indexOf('<w:body'), xml.lastIndexOf('</w:body>'));
  const out = []; let i = 0;
  while (i < body.length) {
    const tbl = body.indexOf('<w:tbl>', i); const par = body.slice(i).search(/<w:p[ >]/); const pAt = par < 0 ? -1 : i + par;
    if (tbl >= 0 && (pAt < 0 || tbl < pAt)) {
      let depth = 0, j = body.length;
      for (const m of body.slice(tbl).matchAll(/<w:tbl>|<\/w:tbl>/g)) { depth += m[0] === '<w:tbl>' ? 1 : -1; if (!depth) { j = tbl + m.index + m[0].length; break; } }
      const rows = [...body.slice(tbl, j).matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((c) => [...c[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((pp) => paraText(pp[0]).text).filter(Boolean).join(' / ')));
      out.push({ type: 'table', rows }); i = j;
    } else if (pAt >= 0) {
      const end = body.indexOf('</w:p>', pAt); const stop = end < 0 ? body.length : end + 6;
      const pp = paraText(body.slice(pAt, stop));
      if (pp.text) out.push(isHeading(pp.text, pp.style) ? { type: 'h', text: pp.text } : { type: 'p', text: pp.text, list: pp.list });
      i = stop;
    } else break;
  }
  return out;
}
function pdfText(file) {
  for (const exe of ['pdftotext', 'C:/Program Files/Git/mingw64/bin/pdftotext.exe']) {
    const r = spawnSync(exe, ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true });
    if (r.status === 0 && r.stdout && r.stdout.trim()) return { text: r.stdout, via: 'pdftotext' };
  }
  for (const py of ['python', 'py']) {
    const r = spawnSync(py, ['-c', 'import sys,pypdf;sys.stdout.reconfigure(encoding="utf-8");r=pypdf.PdfReader(sys.argv[1]);print("\\f".join((p.extract_text() or "") for p in r.pages))', file], { encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true });
    if (r.status === 0 && r.stdout && r.stdout.trim()) return { text: r.stdout, via: 'pypdf' };
  }
  return { text: '', via: null };
}
/* блоки обычного текста: страницы (\f у pdf), заголовки (#, «ЗАДАЧА:» брифа, «2.1. …» документа),
   строки таблиц «|», пункты, расшифровка whisper («**01:23** …»), абзацы документа */
function textBlocks(txt, kind) {
  const out = []; const doc = kind === 'doc';
  const pages = String(txt).replace(/\r/g, '').split('\f');
  pages.forEach((pg, pi) => {
    if (pages.length > 1) out.push({ type: 'page', n: pi + 1 });
    let table = null, para = null; const lines = pg.split('\n');
    const flush = () => { if (table) out.push(table); if (para) out.push(para); table = null; para = null; };
    let fm = pi === 0 && /^---\s*$/.test(lines[0] || '');
    lines.forEach((raw, li) => {
      const l = raw.trim();
      if (fm) { if (li > 0 && /^---\s*$/.test(l)) fm = false; return; }
      if (!l) { flush(); return; }
      if (/^\|.*\|$/.test(l)) { if (para) { out.push(para); para = null; } if (!/^\|[\s:|-]+\|$/.test(l)) (table ||= { type: 'table', rows: [] }).rows.push(l.slice(1, -1).split('|').map((x) => x.trim())); return; }
      if (table) { out.push(table); table = null; }
      if (/^>|^---+$/.test(l)) { flush(); return; }
      const h = /^#{1,6}\s+(.*)$/.exec(l);
      if (h) { flush(); out.push({ type: 'h', text: h[1].trim() }); return; }
      if (/^[А-ЯЁA-Z][А-ЯЁA-Z0-9 ()«»/,.\-]{2,70}:\s*$/.test(l) && l === l.toUpperCase()) { flush(); out.push({ type: 'h', text: l.replace(/\s*\(.*\)\s*/, ' ').replace(/:\s*$/, '').trim() }); return; }
      if (doc && isHeading(l, '') && !/^\d+[.)]\s+[а-яё]/.test(l)) { flush(); out.push({ type: 'h', text: l }); return; }
      if (/^([-*•]|\d+[.)])\s+/.test(l) || /^\*\*\d+:\d{2}/.test(l)) { flush(); out.push({ type: 'p', text: l, list: true }); return; }
      if (doc) { if (para) para.text += ' ' + l; else para = { type: 'p', text: l }; return; }
      flush(); out.push({ type: 'p', text: l });
    });
    flush();
  });
  return out;
}
const blocksText = (blocks) => blocks.map((b) => (b.type === 'h' ? `## ${b.text}` : b.type === 'table' ? b.rows.map((r) => `| ${r.join(' | ')} |`).join('\n') : b.type === 'page' ? `\n— стр. ${b.n} —` : b.text)).join('\n');

/* ---------- кандидаты: разбиение на атомы, пометки шума, подсказки ---------- */

const SECTIONS = [
  ['people', /участник[а-яё]* проекта|состав команд|команда проекта/i],
  ['meta', /истори[а-яё]* изменени|ссылки на артефакт|^url$|^режим( работы)?$|^исходники$|^требования$/i],
  ['schedule', /ключевые даты|сроки проекта|график работ|календарн/i],
  ['glossary', /глоссари/i],
  ['risk', /риск/i],
  ['questions', /открытые вопросы/i],
  ['stack', /стек|технолог|ресурсы/i],
  ['assumption', /предположени|допущени/i],
  ['success', /критерии успеш|метрик/i],
  ['nfr', /нефункцион/i],
  ['fr', /функциональн/i],
  ['wont', /не входит|out of scope/i],
  ['limits', /^ограничения$/i],
  ['scope', /что входит|границы проекта|объ[её]м работ|^задача$/i],
  ['audience', /аудитори/i],
  ['about', /суть|проблем|как (?:продукт|сервис|сайт) работает|о продукте|о компании|о ч[её]м сайт/i],
  ['style', /пожелания по стилю/i],
  ['page', /страницы в работе/i],
  ['reference', /референс/i],
  ['media', /кадры и видео/i],
];
const sectionOf = (h) => (SECTIONS.find(([, re]) => re.test(String(h).replace(/^[\d.]+\s*/, '').trim())) || ['other'])[0];
const SECTION_KIND = { about: 'about', audience: 'audience', glossary: 'glossary', risk: 'risk', assumption: 'assumption', schedule: 'schedule', stack: 'tech', success: 'success', wont: 'constraint', limits: 'constraint', style: 'style', page: 'page', reference: 'reference', media: 'media' };
const TABLES = [
  { kind: 'feature', need: [/^(id|№|номер|код)$/i, /приоритет/i], map: { ext: /^(id|№|номер|код)$/i, role: /роль/i, text: /что .*(делать|может)|требовани|функци|описани/i, priority: /приоритет/i, accept: /критери|как провер/i } },
  { kind: 'nfr', need: [/категори/i, /требовани/i], map: { category: /категори/i, text: /требовани/i, accept: /как провер|способ/i } },
  { kind: 'success', need: [/критерий|метрик/i, /способ|целев/i], map: { text: /критерий|метрик/i, how: /способ/i, target: /целев/i } },
  { kind: 'tech', need: [/категори/i, /что использ|технолог|инструмент/i], map: { category: /категори/i, text: /что использ|технолог|инструмент/i } },
  { kind: 'integration', need: [/что нужно/i, /от кого/i], map: { text: /что нужно/i, who: /от кого/i, state: /статус/i } },
  { kind: 'risk', need: [/^риск/i], map: { text: /^риск/i } },
  { kind: 'glossary', need: [/термин/i], map: { term: /термин/i, text: /означает|определени|значени/i } },
  { kind: 'audience', need: [/сегмент|аудитори/i], map: { seg: /сегмент/i, text: /кто это/i, want: /что хочет/i } },
  { kind: 'schedule', need: [/этап/i, /дата|срок/i], map: { text: /этап/i, date: /дата|срок/i } },
  { kind: 'people', need: [/^(фио|ф\.и\.о\.|участник|имя)$/i], map: {} },
  { kind: 'meta', need: [/^(поле|артефакт|версия)$/i], map: {} },
];
const PRIO_WORD = [[/^(must|m|обязательно|должно|высокий|критично)$/i, 'must'], [/^(should|s|желательно|средний)$/i, 'should'], [/^(could|c|можно|низкий)$/i, 'could'], [/^(won'?t|w|не будет)$/i, 'wont']];
const NFR_KIND = [[/производит|скорост/i, 'perf'], [/надёжн|надежн/i, 'reliability'], [/безопасн/i, 'security'], [/совместим/i, 'compat'], [/доступн/i, 'a11y'], [/seo|поиск/i, 'seo'], [/юрид|правов/i, 'legal']];
const PLACEHOLDER = /^(заполнить.*|tbd|todo|—|-|–|\?|n\/a|нет данных)$/i;
const TEMPLATE = /^(веб-сервис|мобильное приложение|десктопн[а-яё]* (?:игра|приложение)|игра|бот|пример)\s*:/i;
function flagsOf(t, doc = true) {
  const f = []; const s = String(t || '').trim();
  if (!s || PLACEHOLDER.test(s) || /(?<![а-яё])заполнить(?![а-яё])/i.test(s)) f.push('заглушка');
  if (doc && TEMPLATE.test(s)) f.push('пример шаблона?');
  return f;
}
const OUT = [
  [/(?<![а-яё])чат[а-яё]*(?![а-яё])|сообщени[а-яё]* (?:отображ|у участник|видны)|websocket|в реальном времени/i, 'server', 'нужен сервер (сообщения в реальном времени)'],
  [/комнат|присоедин[а-яё]* к|участник[а-яё]* появля|у других участник/i, 'server', 'нужен сервер (общее состояние у нескольких людей)'],
  [/регистрац|авторизац|вход по (?:логин|парол)|личн[а-яё]* кабинет|учётн[а-яё]* запис/i, 'server', 'нужен сервер (вход и учётные записи)'],
  [/оплат|платёж|платеж|эквайр|(?<![а-яё])касс[аеуы](?![а-яё])/i, 'pay', 'оплата'],
  [/нагрузочн|одновременн[а-яё]* пользовател|(?<![a-z])rps(?![a-z])/i, 'load', 'нагрузочный тест — вне браузерных проверок'],
  [/postgres|mysql|mongo|база данн|баз[аеуы] данн|хранени[а-яё]* данн/i, 'db', 'база данных'],
  [/docker|развёртыв|развертыв|деплой|kubernetes/i, 'deploy', 'развёртывание'],
];
const outHints = (t) => OUT.filter(([re]) => re.test(t)).map(([, k, why]) => ({ k, why }));
const FACT_CATS = [
  ['отзывы', /отзыв/i],
  ['цены', /(?<![а-яё])(?:цен[аыуеой]?|стоимост[а-яё]*|прайс[а-яё]*)(?![а-яё])|₽|руб\./i],
  ['сроки', /(?<![а-яё])срок[а-яё]*(?![а-яё])/i],
  ['гарантии', /гаранти/i],
  ['клиенты и опыт', /(?<![а-яё])клиент[а-яё]*(?![а-яё])|лет на рынке|опыт[а-яё]* работ/i],
  ['команда', /(?<![а-яё])(?:команд[аеуыой]|сотрудник[а-яё]*)(?![а-яё])/i],
  ['сертификаты', /сертификат|лиценз|награ[дж]/i],
  ['контакты', /(?<![а-яё])адрес(?![а-яё])|телефон|(?<![а-яё])почт[аеуы](?![а-яё])|e-?mail|контакт/i],
];
const factCats = (t) => FACT_CATS.filter(([, re]) => re.test(t)).map(([c]) => c);
const MEASURE = /\d+(?:[.,]\d+)?\s*(?:мс|ms|сек[а-яё]*|с(?![а-яё])|px|пикс[а-яё]*|%|₽|руб[а-яё]*|мб|кб|мин[а-яё]*)(?![a-zа-яё])/i;
const PHONE = /(?:\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PRICE = /\d[\d\s]*\s?(?:₽|руб)/i;
function guessKind(t) {
  const s = String(t).toLowerCase();
  if (/^(без|не |нет |никаких|убер|убра)/.test(s)) return 'constraint';
  if (PHONE.test(s) || EMAIL.test(s) || PRICE.test(s)) return 'fact';
  if (/секунд|(?<![а-яё])мс(?![а-яё])|быстр|загруж|(?<![a-z])lcp(?![a-z])|скорост|производительн/.test(s)) return 'perf';
  if (/chrome|firefox|(?<![a-z])edge(?![a-z])|safari|браузер|совместим/.test(s)) return 'compat';
  if (/контраст|читалк|клавиатур|доступност[а-яё]* для|слабовид/.test(s)) return 'a11y';
  if (/(?<![а-яё])ключ[а-яё]*(?![а-яё])|парол|безопасн|утечк/.test(s)) return 'security';
  if (/согласи[а-яё]* на обработ|политик[а-яё]* конфиденц|персональн[а-яё]* данн|оферт/.test(s)) return 'legal';
  if (/(?<![a-z])api(?![a-z])|crm|телеграм|интеграц|внешн[а-яё]* (?:сервис|api|каталог)/.test(s)) return 'integration';
  if (/анимац|движен|появлен|плавн|параллакс/.test(s)) return 'motion';
  if (/фото|видео|картин|иллюстрац|кадр/.test(s)) return 'media';
  if (/цвет|шрифт|стил|т[её]мн|светл|(?<![а-яё])тем[аеуы](?![а-яё])|минимал|градиент|воздух/.test(s)) return 'style';
  if (/(?<![а-яё])страниц/.test(s)) return 'page';
  if (/текст|заголов|описани|отзыв|слоган/.test(s)) return 'content';
  if (/(?<![a-z])seo(?![a-z])|поисковик|мета-?опис/.test(s)) return 'seo';
  if (NEG.test(s)) return 'constraint';
  return 'feature';
}
function prioWords(t) {
  const s = String(t).toLowerCase();
  if (/было бы неплохо|если получится|по возможности|можно и без|не обязательно|не главное/.test(s)) return 'could';
  if (/желательн|хорошо бы|неплохо бы|хотелось бы/.test(s)) return 'should';
  if (/обязательн|важно|главное|критичн|(?<![а-яё])(?:долж[а-яё]*|нужн[а-яё]*|нужен|надо)(?![а-яё])/.test(s)) return 'must';
  return null;
}
function candidatesOf(blocks, srcKind) {
  const out = []; const doc = srcKind === 'doc'; const user = ['chat', 'voice', 'brief'].includes(srcKind);
  let section = '', sec = 'other', page = null;
  const push = (c) => { c.n = out.length + 1; c.id = cid(c.n); c.flags ||= []; c.hints ||= []; c.facts ||= []; c.decision = null; out.push(c); };
  for (const b of blocks) {
    if (b.type === 'page') { page = b.n; continue; }
    if (b.type === 'h') { section = b.text; sec = sectionOf(b.text); continue; }
    const where = [page ? `стр. ${page}` : '', section].filter(Boolean).join(' · ') || 'начало';
    if (b.type === 'table') {
      const [head, ...rows] = b.rows; if (!head) continue;
      const tloc = `${where} · таблица «${short(head.join(' | '), 60)}»`;
      const spec = TABLES.find((s) => s.need.every((re) => head.some((h) => re.test(h.trim()))));
      const filled = rows.filter((r) => r.some((x) => x && x.trim()));
      if (!filled.length) { push({ kind: 'text', text: `в документе не заполнено: таблица «${short(head.join(' | '), 70)}»`, quote: head.join(' | '), loc: tloc, flags: ['заглушка'] }); continue; }
      if ((spec && spec.kind === 'people') || sec === 'people') { push({ kind: 'people', text: `${filled.length} строк с ФИО — не импортируются (чужие личные данные)`, quote: '', loc: tloc, flags: [PERSONAL] }); continue; }
      if (spec && spec.kind === 'meta' || sec === 'meta') { push({ kind: 'meta', text: `метаданные документа: ${short(filled.map((r) => r.filter(Boolean).join(': ')).join('; '), 150)}`, quote: '', loc: tloc, flags: ['метаданные'] }); continue; }
      if (!spec) { for (const r of filled) { const all = r.join(' | '); push({ kind: SECTION_KIND[sec] || 'text', text: r.filter(Boolean).join(' | '), quote: all, loc: tloc, flags: flagsOf(all, doc) }); } continue; }
      const col = Object.fromEntries(Object.entries(spec.map).map(([k, re]) => [k, head.findIndex((h) => re.test(h.trim()))]));
      for (const r of filled) {
        const v = (k) => (col[k] >= 0 ? String(r[col[k]] || '').trim() : '');
        const all = r.join(' | ');
        let kind = spec.kind;
        if (kind === 'nfr') kind = (NFR_KIND.find(([re]) => re.test(v('category'))) || [0, guessKind(v('text'))])[1];
        const pr = v('priority'); const priority = pr ? (PRIO_WORD.find(([re]) => re.test(pr)) || [0, null])[1] : null;
        const text = kind === 'glossary' ? `${v('term')} — ${v('text')}` : kind === 'audience' ? [v('seg'), v('text'), v('want')].filter(Boolean).join(' · ') : kind === 'schedule' ? [v('text'), v('date')].filter(Boolean).join(' · ') : v('text') || r.filter(Boolean).join(' | ');
        const accept = kind === 'success' ? [v('how'), v('target')].filter(Boolean).join(' → ') : v('accept');
        const flags = flagsOf(all, doc); if (!v('text') && !flags.includes('заглушка') && !['glossary', 'audience', 'schedule'].includes(kind)) flags.push('заглушка');
        push({ kind, ext: v('ext') || null, priority, prioFrom: priority ? 'doc' : null, role: v('role') || null, category: v('category') || null, text, accept: accept || null, quote: all, loc: `${tloc}${v('ext') ? ` · ${v('ext')}` : ''}`, flags });
      }
      continue;
    }
    /* абзац: пункты «•», списки, предложения; в словах пользователя — ещё «, и ещё», «а также», «плюс», «;» */
    let t = b.text; let loc = where;
    const tc = /^\*\*(\d+:\d{2}(?::\d{2})?)\*\*\s*/.exec(t); if (tc) { loc = `⏱ ${tc[1]}`; t = t.slice(tc[0].length); }
    if (sec === 'people') { push({ kind: 'people', text: 'абзац раздела участников — не импортируется (чужие личные данные)', quote: '', loc, flags: [PERSONAL] }); continue; }
    let items = (t.match(/•/g) || []).length >= 1 ? t.split('•') : /^([-*]|\d+[.)])\s+/.test(t) ? [t.replace(/^([-*]|\d+[.)])\s+/, '')] : t.split(/(?<=[.!?…])\s+(?=[А-ЯЁA-Z«"(0-9])/);
    items = items.map((x) => x.trim()).filter(Boolean);
    if (user) items = items.flatMap((x) => x.split(/\s*(?:,\s*(?:и\s+)?ещё\s+|;\s+|,?\s+а\s+также\s+|,?\s+плюс\s+)/i)).map((x) => x.trim()).filter(Boolean);
    for (const it of items) {
      if (it.replace(/[^\p{L}\p{N}]/gu, '').length < 3) continue;
      const flags = flagsOf(it, doc);
      if (sec === 'meta') flags.push('метаданные');
      let kind = SECTION_KIND[sec];
      if (!kind) kind = ['fr', 'nfr', 'scope'].includes(sec) || user || MODAL.test(it) ? guessKind(it) : sec === 'other' && !section ? 'about' : 'text';
      const priority = sec === 'wont' ? 'wont' : user ? prioWords(it) : null;
      push({ kind, text: it.replace(/[.;]\s*$/, ''), quote: it, loc, priority, prioFrom: priority ? (user ? 'user' : 'doc') : null, flags });
    }
  }
  /* подсказки: вне скилла, нужные факты, измеримость, тот же смысл в другом месте документа */
  const live = (c) => !c.flags.length && !['meta', 'people'].includes(c.kind) && !CONTEXT.includes(c.kind);
  for (const c of out) {
    if (!live(c)) continue;
    c.hints = [...new Set(outHints(`${c.text} ${c.accept || ''}`).map((h) => h.why))];
    c.facts = c.kind === 'fact' ? [] : factCats(c.text);
    if (MEASURE.test(`${c.text} ${c.accept || ''}`)) c.measurable = true;
  }
  for (const c of out) {
    if (!live(c)) continue;
    const twin = out.find((d) => d !== c && live(d) && jaccard(c.text, d.text) >= 0.6);
    if (twin) c.similar = twin.id;
  }
  return out;
}
/* сравнение версий документа: по номеру (FR-01), иначе тот же вид и тот же или похожий текст */
function diffCands(prev, next) {
  const live = (xs) => xs.filter((c) => !c.flags.length && !['meta', 'people', 'text'].includes(c.kind));
  const P = live(prev), N = live(next);
  const nt = (t) => normQ(String(t).split(' · ')[0]).replace(/[^a-zа-я0-9]+/gi, ' ').trim();
  /* пара один к одному: номер, потом тот же текст, потом самый похожий (Жаккар ≥ 0.6) из ещё не взятых */
  const used = new Set(); const pairOf = new Map();
  const pick = (c, pred) => { const p = P.find((x) => !used.has(x) && x.kind === c.kind && pred(x)); if (p) { used.add(p); pairOf.set(c, p); } return p; };
  for (const c of N) if (c.ext) pick(c, (x) => x.ext === c.ext);
  for (const c of N) if (!pairOf.has(c) && !c.ext) pick(c, (x) => !x.ext && nt(x.text) === nt(c.text));
  for (const c of N) {
    if (pairOf.has(c) || c.ext) continue;
    const best = P.filter((x) => !used.has(x) && !x.ext && x.kind === c.kind).map((x) => [x, jaccard(x.text, c.text)]).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 0.6) { used.add(best[0]); pairOf.set(c, best[0]); }
  }
  const d = { added: [], changed: [], removed: [] };
  for (const c of N) { const p = pairOf.get(c); if (!p) d.added.push(c.id); else if (normQ(p.text) !== normQ(c.text) || normQ(p.accept) !== normQ(c.accept) || (p.priority || '') !== (c.priority || '')) d.changed.push({ was: p.id, now: c.id }); }
  for (const p of P) if (!used.has(p)) d.removed.push(p.id);
  d.templatePrev = prev.filter((c) => c.flags.includes('пример шаблона?')).length;
  return d;
}

/* ---------- реестр ---------- */

let RUN, FILE, MDFILE, SRC_DIR;
const rel = (abs) => path.relative(RUN, abs).split(path.sep).join('/');
const fresh = () => ({ version: 1, run: path.basename(RUN), createdAt: now(), updatedAt: now(), sources: [], items: [], questions: [], log: [] });
function load() { const j = readJson(FILE); if (!j || !Array.isArray(j.items)) return null; j.sources ||= []; j.questions ||= []; j.log ||= []; return j; }
function need() { const R = load(); if (!R) die(`реестра нет: ${FILE} — сначала ingest (--text "<первое сообщение>" --kind brief или --file <ТЗ>)`); return R; }
function save(R, entry) { R.updatedAt = now(); if (entry) R.log.push({ at: now(), ...entry }); writeJson(FILE, R, { generator: false }); fs.writeFileSync(MDFILE, toMd(R)); }
const readState = () => { const j = readJson(path.join(RUN, 'state.json')); return j && Array.isArray(j.tasks) ? j : null; };
const srcById = (R, id) => R.sources.find((s) => numOf(s.id, 'S') === numOf(id, 'S') && numOf(id, 'S') != null);
const item = (R, id) => { const q = R.items.find((x) => numOf(x.id, 'R') === numOf(id, 'R') && numOf(id, 'R') != null); if (!q) die(`нет требования ${id} — list`); return q; };
const candFile = (s) => (s.candidates ? path.join(RUN, s.candidates) : null);
const readCands = (s) => { const f = candFile(s); const j = f ? readJson(f) : null; return j && Array.isArray(j.candidates) ? j : null; };
const isContext = (q) => CONTEXT.includes(q.kind);
const active = (q) => (q.decision || 'active') === 'active';
function srcHay(s) { let t = ''; if (s.text) { try { t = fs.readFileSync(path.join(RUN, s.text), 'utf8'); } catch { /* нет файла */ } } return normQ(`${t}\n${s.note || ''}`); }
const quoteIn = (s, quote) => { const q = normQ(quote); if (!q) return false; const h = srcHay(s); return h.includes(q) || h.includes(q.replace(/[.;,!?…:]+$/, '')); };
/* источник цитаты: названный (цитата обязана в нём быть) или единственный, где она есть */
function quoteSource(R, quote, sid) {
  if (!quote) usage('нужна дословная цитата пользователя: --quote "<как он написал>"');
  if (sid) { const s = srcById(R, sid); if (!s) die(`нет источника ${sid}`); if (!s.text && !s.note) die(`у ${s.id} нет текста и --note — цитировать нечего: слова пользователя — ingest --text "…"`); if (!quoteIn(s, quote)) die(`цитаты нет в ${s.id}: «${short(quote, 70)}» — дословно, как в источнике (${s.text || 'note'})`); return s; }
  const hits = R.sources.filter((s) => quoteIn(s, quote));
  if (!hits.length) die(`цитаты «${short(quote, 70)}» нет ни в одном источнике — сначала ingest --text "<сообщение пользователя>", потом --source S-…`);
  return hits[hits.length - 1];
}
const quoteFrom = (s) => (s.kind === 'voice' ? 'voice' : s.via === 'pdftotext' || s.via === 'pypdf' ? 'pdf' : null);
const hist = (q, e) => { (q.history ||= []).push({ rev: q.rev || 1, at: now(), ...e }); };
function newItem(R, s, f) {
  const q = {
    id: nextId(R.items, 'R'), text: f.text, kind: f.kind, priority: f.priority || null, prioFrom: f.prioFrom || null, ext: f.ext || null, role: f.role || null,
    sources: [{ id: s.id, cand: f.cand || null, loc: f.loc || '', quote: f.quote, said: s.said || null, ...(quoteFrom(s) ? { quoteFrom: quoteFrom(s) } : {}) }],
    pages: f.pages || [], blocks: f.blocks || [], decision: 'active', decisionBy: null, decisionQuote: '', decisionWhy: '', decisionSource: null, decisionAt: null,
    supersedes: null, supersededBy: null, docAccept: f.docAccept || null, accept: [], tasks: [], rev: 1, createdAt: now(), changedAt: null, needsReview: false,
    hints: f.hints || [], facts: f.facts || [], flags: f.flags || [], history: [], acks: [],
  };
  hist(q, { source: s.id, what: 'добавлено', quote: short(f.quote, 200) });
  R.items.push(q); return q;
}
const DEFAULT_CRIT = {
  feature: 'runtime + mobile: сценарий кликом и вводом, утверждение результата, desktop и 390',
  page: 'runtime (открывается без ошибок; h1 и главное действие выше сгиба на 390) + eye (снимки desktop / 390 / 320)',
  content: 'runtime (--assert: текст на месте) + eye',
  fact: 'runtime: --assert "/*R-x.a*/ document.body.innerText.includes(\'<значение как у пользователя>\')"',
  style: 'eye (пара снимков направление / страница), verify, cliche',
  constraint: 'cliche (правила нет) или runtime --assert отсутствия',
  motion: 'motion (compare у донора; у направления — протокол своей страницы), runtime --reduced-motion',
  media: 'eye + строка в credits.json',
  perf: 'perf --metric "LCP<=2000" (порог из требования), телефон, медиана трёх',
  a11y: 'a11y mobile и desktop без FAIL',
  compat: 'browser (runtime --browser firefox); Edge — manual: Edge 153 без окна молча падает на этой машине',
  seo: 'runtime --assert title, description, h1, lang',
  security: 'runtime: ключа нет в HTML, JS и адресах запросов',
  legal: 'runtime --assert согласия и ссылки на политику + eye; текста нет — факт в «Ждём от вас»',
  integration: 'runtime: запрос уходит, интерфейс показывает итог; «доходит ли» — manual',
  success: 'runtime с N утверждениями /*R-x.a#k*/ или manual',
  reliability: 'manual с причиной (серверное) или status out по словам пользователя',
  tech: 'вопрос о стеке (conflicts) → решение; manual или out',
  reference: 'eye: принцип референса виден на странице (пара снимков)',
};
const nextLetter = (q) => { const used = new Set((q.accept || []).map((a) => a.id)); for (const ch of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(ch)) return ch; die(`у ${q.id} слишком много критериев`); return null; };
function makeCrit(q, spec, o = {}) {
  const m = /^\s*([a-z0-9]+)\s*:\s*([\s\S]+)$/i.exec(String(spec || ''));
  if (!m) usage(`критерий «${short(spec, 60)}» — нужно «<вид>: <что считается выполненным>», вид: ${ACCEPT_KINDS.join(' ')}`);
  const kind = m[1].toLowerCase(); if (!ACCEPT_KINDS.includes(kind)) usage(`вид критерия «${kind}»: ${ACCEPT_KINDS.join(' | ')}`);
  const id = nextLetter(q);
  const a = { id, kind, text: m[2].trim(), evidence: null };
  if (MARKER_KINDS.includes(kind)) a.marker = o.marker || `${q.id}.${id}`;
  a.viewport = o.viewport || (kind === 'mobile' || kind === 'perf' ? 'mobile' : kind === 'manual' ? null : 'desktop');
  if (o.how) a.how = o.how;
  if (o.metric) a.metric = o.metric;
  if (o.reason) a.reason = o.reason;
  return a;
}
function critWarns(q, a) {
  const w = [];
  if (a.kind === 'manual' && !a.reason) die(`manual — только с --reason: почему это здесь не проверить (${q.id})`);
  if (a.metric && !/^\s*[A-Za-zА-Яа-я]+\s*(<=|<|>=|>)\s*\d+([.,]\d+)?\s*$/.test(a.metric)) usage(`--metric «${a.metric}» — нужно «LCP<=2000», «CLS<0.1»`);
  if (MARKER_KINDS.includes(a.kind) && a.how && !a.how.includes(`/*${a.marker}*/`)) w.push(`в команде нет маркера /*${a.marker}*/ в начале --assert: протокол не найдётся сам — --assert "/*${a.marker}*/ <выражение>"`);
  if (!a.how && !['eye', 'manual'].includes(a.kind)) w.push(`команда проверки не записана (--how): checks её не соберёт — accept ${q.id} --edit ${a.id} --how "<команда с {url} и {run}>"`);
  if (a.kind === 'mobile' && a.viewport && parseViewport(a.viewport) && parseViewport(a.viewport).width >= 1024) w.push(`mobile на экране ${a.viewport} — нужен экран уже 1024 px`);
  return w;
}

/* ---------- доказательства критериев: маркер в протоколах runtime, явные файлы, state.mjs probe ---------- */

function runtimeProtocols() {
  const dir = path.join(RUN, 'runtime'); let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    const abs = path.join(dir, f); const j = readJson(abs); if (!j || !Array.isArray(j.steps)) continue;
    let t = Date.parse(j.startedAt || ''); if (!Number.isFinite(t)) { try { t = fs.statSync(abs).mtimeMs; } catch { t = 0; } }
    const vp = typeof j.viewport === 'string' ? parseViewport(j.viewport) : j.viewport && j.viewport.width ? j.viewport : null;
    const b = j.browser; const gecko = typeof b === 'string' ? /firefox|gecko/i.test(b) : !!(b && (b.engine === 'gecko' || /firefox/i.test(String(b.name || b.product || b.kind || ''))));
    out.push({ rel: `runtime/${f}`, t, width: vp ? vp.width : null, gecko, labels: j.steps.map((s) => String(s.what || s.name || '').toLowerCase()) });
  }
  return out.sort((a, b) => b.t - a.t);
}
const tagOf = (how) => { const m = /--tag[=\s]+("?)([\w.-]+)\1/.exec(String(how || '')); return m ? m[2] : null; };
function resolveCrit(q, a, protos) {
  if (a.kind === 'manual') return {};
  const checkFor = (file) => (IMAGE.test(file) ? (a.viewport && parseViewport(a.viewport) && parseViewport(a.viewport).width < 1024 ? 'mobile' : 'visual') : a.kind === 'mobile' ? 'mobile' : a.kind === 'perf' ? 'perf' : 'runtime');
  if (a.evidence && a.evidence.file) return { spec: `${a.evidence.file}${a.evidence.step ? '#' + a.evidence.step : ''}`, check: checkFor(a.evidence.file), explicit: true };
  if (MARKER_KINDS.includes(a.kind) && a.marker) {
    const m = `/*${a.marker}*/`.toLowerCase();
    const hit = protos.find((p) => p.labels.some((l) => l.includes(m)) && (a.kind !== 'mobile' || (p.width && p.width < 1024)) && (a.kind !== 'browser' || p.gecko));
    if (hit) return { spec: `${hit.rel}#/*${a.marker}*/`, check: a.kind === 'mobile' ? 'mobile' : 'runtime' };
    return { none: `нет протокола с шагом /*${a.marker}*/${a.kind === 'mobile' ? ' на экране уже 1024 px' : a.kind === 'browser' ? ' в Firefox' : ''}${a.how ? ' — прогнать: checks --only ' + q.id : ' — accept ' + q.id + ' --edit ' + a.id + ' --how "…"'}` };
  }
  if (['perf', 'a11y'].includes(a.kind) && tagOf(a.how)) {
    const f = `${a.kind}/${tagOf(a.how)}.json`;
    if (fs.existsSync(path.join(RUN, f))) return { spec: a.kind === 'perf' && a.metric ? `${f}#${/^\s*([A-Za-zА-Яа-я]+)/.exec(a.metric)[1]}` : f, check: a.kind === 'perf' ? 'perf' : 'runtime' };
    return { none: `замера ${f} нет — прогнать: checks --only ${q.id}` };
  }
  return { none: a.kind === 'eye' ? `снимок не приложен — после взгляда: accept ${q.id} --evidence ${a.id} <снимок.png>` : `нет доказательства — accept ${q.id} --evidence ${a.id} <протокол.json[#шаг]>` };
}
function metricOf(file, a) {
  const j = readJson(path.resolve(RUN, file)); const m = /^\s*([A-Za-zА-Яа-я]+)\s*(<=|<|>=|>)\s*(\d+(?:[.,]\d+)?)/.exec(a.metric || '');
  if (!j || !m || !j.checks || typeof j.checks !== 'object') return null;
  const key = Object.keys(j.checks).find((k) => k.toLowerCase().startsWith(m[1].toLowerCase())); if (!key) return { ok: false, value: null, label: `в замере нет «${m[1]}»` };
  const v = Number(j.checks[key].value); const lim = Number(m[3].replace(',', '.'));
  const ok = m[2] === '<=' ? v <= lim : m[2] === '<' ? v < lim : m[2] === '>=' ? v >= lim : v > lim;
  const vp = typeof j.viewport === 'string' ? parseViewport(j.viewport) : null;
  const wrongVp = a.viewport && parseViewport(a.viewport) && vp && (parseViewport(a.viewport).width < 1024) !== (vp.width < 1024);
  return { ok: ok && !wrongVp, value: v, wrongVp, label: `${m[1]} ${v}${String(j.checks[key].unit || '').trim() ? ' ' + String(j.checks[key].unit).trim() : ''} ${ok ? '≤≥'.includes(m[2][0]) ? m[2].replace('<=', '≤').replace('>=', '≥') : m[2] : 'не ' + m[2].replace('<=', '≤').replace('>=', '≥')} ${lim}${wrongVp ? ` (замер на экране ${j.viewport}, а нужен ${a.viewport})` : ''}` };
}
function critStatus(q, c, st) {
  const a = c.a;
  if (a.kind === 'manual') return { code: 'manual', label: `вручную: ${a.reason || 'причина не записана'}` };
  if (!c.spec) return { code: 'none', label: c.none || 'нет доказательства' };
  if (!st) return { code: 'none', label: `${c.spec} — нет state.json (state.mjs init): свежесть не проверить` };
  const p = c.probe; if (!p) return { code: 'none', label: 'не проверено' };
  const codes = (p.problems || []).map((x) => x.code); const msg = (p.problems || []).map((x) => x.msg).join('; ');
  const taken = p.rec && p.rec.takenAt ? Date.parse(p.rec.takenAt) : null; const ch = Date.parse(q.changedAt || '');
  const metric = a.kind === 'perf' && a.metric && p.rec && p.rec.file ? metricOf(p.rec.file, a) : null;
  if (codes.includes('fail')) return { code: 'fail', label: `провалено: ${short(msg, 160)}` };
  if (metric && !metric.ok) return { code: metric.value == null || metric.wrongVp ? 'none' : 'fail', label: `${metric.value == null || metric.wrongVp ? 'нет доказательства' : 'провалено'}: ${metric.label}` };
  if (codes.some((x) => x !== 'stale' && x !== 'reqchange')) return { code: 'none', label: `нет доказательства: ${short(msg, 160)}` };
  if (Number.isFinite(ch) && taken && taken <= ch) return { code: 'stale-req', label: `устарело (требование изменено ${fmt(q.changedAt)}, ред. ${q.rev}; снято ${fmt(p.rec.takenAt)})` };
  if (codes.includes('stale')) return { code: 'stale-site', label: `устарело (сайт правили после проверки): ${short(msg, 140)}` };
  return { code: 'ok', label: `проверено: ${c.spec}${metric ? ` · ${metric.label}` : ''} · снято ${fmt(p.rec && p.rec.takenAt)}`, warns: p.warns || [] };
}
function itemStatus(q, st, crits) {
  if (!active(q)) return { code: q.decision, label: decisionLabel(q) };
  if (isContext(q)) return { code: 'context', label: `контекст (${KIND_RU[q.kind]})` };
  if (!(q.tasks || []).length) return { code: 'notask', label: 'нет задачи' };
  const tasks = (q.tasks || []).map((id) => (st ? st.tasks.find((t) => Number(t.id) === Number(id)) : null)).filter(Boolean);
  if (!st) return { code: 'doing', label: 'в работе (state.json нет)' };
  const live = tasks.filter((t) => t.impl !== 'DROPPED');
  if (!live.length) return { code: 'notask', label: `нет задачи (${tasks.length ? 'все сняты' : 'задач нет в state.json'})` };
  const open = live.filter((t) => t.impl !== 'DONE');
  if (open.length) return { code: 'doing', label: `в работе (${open.map((t) => `#${t.id} ${t.impl}`).join(', ')})` };
  if (!crits.length) return { code: 'nocrit', label: 'нет критерия' };
  const codes = crits.map((c) => c.code);
  if (codes.includes('fail')) return { code: 'fail', label: 'провалено' };
  if (codes.includes('stale-req')) return { code: 'stale', label: 'устарело (требование изменено)' };
  if (codes.includes('stale-site')) return { code: 'stale', label: 'устарело (сайт правили)' };
  if (codes.includes('none')) return { code: 'noproof', label: 'без доказательства' };
  const man = crits.filter((c) => c.code === 'manual');
  return man.length ? { code: 'done', label: `выполнено, кроме ручных (${man.map((c) => c.a.id).join(', ')})`, manual: true } : { code: 'done', label: 'выполнено' };
}
function decisionLabel(q) {
  const who = q.decisionQuote ? ` «${short(q.decisionQuote, 60)}»${q.decisionSource ? ` (${q.decisionSource})` : ''}` : q.decisionWhy ? ` — ${short(q.decisionWhy, 60)}` : '';
  if (q.decision === 'superseded') return `заменено ${q.supersededBy || '?'}${q.decisionAt ? ` ${dm(q.decisionAt)}` : ''}`;
  if (q.decision === 'dropped') return `снято${q.decisionAt ? ` ${dm(q.decisionAt)}` : ''}${q.decisionBy === 'self' ? ' (шум документа)' : ''}:${who}`;
  return `${DECISION_RU[q.decision] || q.decision}${who ? ':' + who : ''}`;
}
/* статусы всех требований разом: probe — одним вызовом state.mjs на каждый вид проверки */
function evaluate(R, items = R.items) {
  const st = readState(); const protos = runtimeProtocols(); const crit = new Map(); const jobs = [];
  for (const q of items) { const cr = (q.accept || []).map((a) => ({ a, ...resolveCrit(q, a, protos) })); crit.set(q.id, cr); for (const c of cr) if (c.spec) jobs.push(c); }
  if (jobs.length && st) {
    const groups = new Map(); for (const c of jobs) { if (!groups.has(c.check)) groups.set(c.check, []); groups.get(c.check).push(c); }
    for (const [check, list] of groups) {
      const specs = [...new Set(list.map((c) => c.spec))];
      const p = spawnSync(process.execPath, [STATE_MJS, RUN, 'probe', ...specs, '--check', check, '--json'], { encoding: 'utf8', maxBuffer: 32 << 20, windowsHide: true });
      let arr = []; try { const j = JSON.parse(p.stdout); arr = Array.isArray(j) ? j : [j]; } catch { /* не ответил */ }
      const bySpec = new Map(arr.map((x) => [x.spec, x]));
      for (const c of list) c.probe = bySpec.get(c.spec) || { ok: false, problems: [{ code: 'probe', msg: short(p.stderr || p.stdout || 'state.mjs probe не ответил', 160) }], warns: [], rec: null };
    }
  }
  const status = new Map();
  for (const q of items) { const cr = crit.get(q.id); for (const c of cr) Object.assign(c, critStatus(q, c, st)); status.set(q.id, itemStatus(q, st, cr)); }
  return { st, crit, status };
}
const MARK = { ok: '✓', fail: '✗', 'stale-req': 'устарело', 'stale-site': 'устарело', none: 'нет', manual: 'вручную' };
const critShort = (c) => `${c.a.id} ${c.a.kind}${c.a.kind === 'perf' && c.a.metric ? ` ${c.a.metric}` : ''} ${MARK[c.code] || '?'}`;

/* ---------- противоречия ---------- */

const TASTE_WORDS = [
  ['numbered-steps', /шаг[а-яё]*\s*(?:1-2-3|01|с номерами|по номерам)|1-2-3|01\s*[/-]\s*02/i],
  ['faq-plus', /(?<![a-z])faq(?![a-z])|частые вопросы|вопрос[а-яё]*[- ]ответ|аккордеон/i],
  ['stat-row', /цифр[а-яё]* достижени|\d+\+?\s*(?:лет|клиент[а-яё]*|проект[а-яё]*)\s+(?:на рынке|довольн)|счётчик[а-яё]* (?:клиент|лет|проект)/i],
  ['trusted-logos', /логотип[а-яё]* (?:клиент|партн[её]р)|нам доверяют/i],
  ['glass', /(?<![а-яё])стекл[оя][а-яё]*|glassmorph|размыти[а-яё]* фона/i],
  ['gradient-text', /градиент[а-яё]* (?:в |на )?(?:заголов|текст)|(?:заголов|текст)[а-яё]* (?:с )?градиент/i],
  ['marquee', /бегущ[а-яё]* строк/i],
  ['hero-two-ctas', /две кнопки/i],
  ['eyebrow', /надзаголов/i],
  ['ai-palette', /неон|фиолетов[а-яё]* градиент/i],
  ['fade-up-reveal', /(?:выезжа|появля)[а-яё]* (?:снизу|при прокрутке)/i],
  ['italic-serif-accent', /курсив/i],
  ['icon-cards', /карточк[а-яё]* с иконк|иконк[а-яё]* (?:в|на) карточк/i],
  ['demo-badges', /(?<![а-яё])демо(?![а-яё])/i],
];
const BORROW = /скопир|копи(?:ю|я|руй)[а-яё]* (?:текст|фото|сайт|дизайн)|как у них[^.]*(?:текст|фото|картин)|фото с (?:их |сайта|сайт)|картинк[а-яё]* с (?:их |сайта)|логотип с |pinterest|пинтерест/i;
const STACK = /react|next\.?js|(?<![a-z])vue|angular|svelte|nuxt|tilda|тильд|wordpress|вордпресс|bitrix|битрикс|typescript|postgres|mysql|mongo|docker|php|django|laravel|node\.?js/i;
const PD = /форм[аеуыой]? (?:заявк|записи|обратн|заказ|брон|регистрац)|(?<![а-яё])заявк[аеиуой]?(?![а-яё])|запис[ьи] (?:на|к)(?![а-яё])|регистрац|бронир|подписк[аеу] на|обратн[а-яё]* связ|оставить (?:телефон|контакт)/i;
const MANUAL_RE = /(?<![a-z])edge(?![a-z])|safari|(?<![a-z])ios(?![a-z])|iphone|айфон|нагрузк|одновременн[а-яё]* пользовател|доставк[а-яё]* (?:письм|почт|сообщ)|письм[оа] (?:приход|доход)|(?<![а-яё])смс(?![а-яё])|(?<![a-z])sms(?![a-z])/i;
const unitNums = (t) => [...String(t).matchAll(/(\d+(?:[.,]\d+)?)\s*(мс|ms|сек[а-яё]*|с(?![а-яё])|s(?![a-z])|px|пикс[а-яё]*|%|₽|руб[а-яё]*|мб|кб|мин[а-яё]*)/gi)].map((m) => {
  const v = parseFloat(m[1].replace(',', '.')); const u = m[2].toLowerCase();
  return /^(мс|ms)$/.test(u) ? { v, u: 'ms' } : /^(с|s|сек)/.test(u) ? { v: v * 1000, u: 'ms' } : /^(px|пикс)/.test(u) ? { v, u: 'px' } : /^(₽|руб)/.test(u) ? { v, u: 'rub' } : /^мин/.test(u) ? { v, u: 'min' } : { v, u };
});
function passportNever(R) {
  const files = [];
  /* сводки разведки: discovery.md и с меткой — discovery-<метка>.md (discover --tag; до 06.10 метка имён не меняла) */
  for (const d of ['donor', '.']) { const dir = path.join(RUN, d); if (!fs.existsSync(dir)) continue; for (const n of fs.readdirSync(dir).sort()) if (/^discovery(-[^/\\]+)?\.md$/.test(n)) files.push(path.join(dir, n)); }
  if (R.direction && R.direction.id) { const f = path.join(RUN, 'direction', R.direction.id, 'passport.md'); if (fs.existsSync(f)) files.push(f); }
  const never = [];
  for (const f of files) {
    let on = false;
    for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (/никогда/i.test(l) && !/^\s*[-*]\s/.test(l)) { on = true; continue; }
      if (!on) continue;
      const m = /^\s*[-*]\s+(.*)$/.exec(l); if (m) never.push({ text: m[1].trim(), file: rel(f) }); else if (l.trim()) on = false;
    }
  }
  return never;
}
async function loadTaste() { try { return await import(pathToFileURL(path.join(SCRIPTS, 'taste.mjs')).href); } catch { return null; } }
function findConflicts(R, taste) {
  const act = R.items.filter((q) => active(q) && !isContext(q)); const out = [];
  const acked = (ids, type, other) => ids.some((id) => { const q = R.items.find((x) => x.id === id); return q && (q.acks || []).some((a) => a.type === type && (!a.with || !other || a.with === other)); });
  const qFor = (ids) => (R.questions || []).find((x) => ids.every((id) => (x.reqs || []).includes(id)));
  const add = (type, mark, reqs, text, todo, extra = {}) => { const other = type === 'pair' ? reqs[1] : null; out.push({ type, label: CONFLICT_TYPES[type], mark, reqs, text, todo, acked: acked(reqs, type, other) || (type === 'pair' && acked([reqs[1]], type, reqs[0])), ...extra }); };
  const src0 = (q) => (q.sources || [])[0] || {};
  const srcKind = (q) => { const s = srcById(R, src0(q).id); return s ? s.kind : null; };
  const said = (q) => { const s = srcById(R, src0(q).id); return Date.parse((s && (s.said || s.addedAt)) || q.createdAt) || 0; };
  const lbl = (q) => `${q.id} «${short(q.text, 50)}»`;
  /* 1. между требованиями */
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    const a = act[i], b = act[j];
    if (a.kind === 'tech' || b.kind === 'tech') continue;
    const sharePage = (a.pages || []).some((p) => (b.pages || []).includes(p) || p === '*') || (b.pages || []).includes('*');
    const shareBlock = (a.blocks || []).some((x) => (b.blocks || []).includes(x));
    const related = ((a.pages || []).length && (b.pages || []).length && sharePage) || shareBlock || jaccard(a.text, b.text) >= 0.5;
    if (!related) continue;
    const com = common(a.text, b.text);
    const polar = com.length >= 1 && negNear(a.text, com) !== negNear(b.text, com);
    const na = unitNums(a.text), nb = unitNums(b.text);
    const nums = na.some((x) => nb.some((y) => x.u === y.u && x.v !== y.v)) && (a.kind === b.kind || com.length >= 1);
    if (!polar && !nums) continue;
    const [older, newer] = said(a) <= said(b) ? [a, b] : [b, a];
    const sameSrc = src0(a).id === src0(b).id;
    const todo = sameSrc ? `вопрос: оба — слова из ${src0(a).id} (ask ${a.id},${b.id} "…")` : USER_SRC.includes(srcKind(newer)) && said(newer) > said(older) ? `новое от пользователя позже старого: status ${older.id} superseded --by ${newer.id}` : `вопрос или ack ${a.id} pair --with ${b.id} --why "…"`;
    add('pair', '?', [a.id, b.id], `${lbl(a)} (${src0(a).id} · ${dm(src0(a).said)}) и ${lbl(b)} (${src0(b).id} · ${dm(src0(b).said)}): ${polar ? `одно с отрицанием (${com.slice(0, 3).join(', ')})` : `разные числа (${na.map((x) => x.v + x.u).join('/')} против ${nb.map((x) => x.v + x.u).join('/')})`}`, todo);
  }
  /* 2. нужен факт */
  const facts = R.items.filter((q) => active(q) && q.kind === 'fact');
  for (const q of act.filter((x) => x.kind !== 'fact')) {
    const cats = factCats(q.text).filter((c) => !facts.some((f) => factCats(f.text).includes(c)));
    if (q.kind === 'integration' && !facts.some((f) => /ключ|токен|аккаунт|(?<![a-z])api(?![a-z])|сервис/i.test(f.text)) && !(qFor([q.id]) || {}).answer) cats.push('какой сервис и чей ключ');
    if (cats.length) add('fact', '·', [q.id], `${lbl(q)} просит: ${cats.join(', ')} — фактов нет`, 'нет своего — придумать правдоподобно для дела и города и записать в copy/invented.json (раздел отчёта «Придумано — проверить владельцу»); строка в «Ждём от вас» — владелец пришлёт своё', { facts: cats });
  }
  /* 3. запрет вкуса и приёмы из каталога шаблонов */
  let bans = {};
  if (taste) { try { bans = taste.activeBans(taste.tasteDir(), { run: path.basename(RUN) }); } catch { bans = {}; } }
  for (const q of act) {
    if (NEG.test(q.text)) continue;
    for (const [rule, re] of TASTE_WORDS) {
      if (!re.test(q.text)) continue;
      const b = bans[rule];
      if (b) add('taste', '?', [q.id], `${lbl(q)} просит приём ${rule}, а в журнале вкуса он запрещён: «${short(b.quote, 80)}» (${b.date || '—'}, ${taste.scopeLabel ? taste.scopeLabel(b) : b.scope})`, `вопрос «держится ли запрет»; ответ — taste.mjs add --by user --verdict accepted|rejected --rule ${rule} --quote "…" --run ${path.basename(RUN)}`);
      else add('taste', '·', [q.id], `${lbl(q)} просит приём из каталога шаблонов (${rule})`, 'делать из языка сайта (паспорт направления или донора), cliche.mjs его отметит — решение в authorship-decisions.json');
    }
  }
  /* 4. граница заимствования */
  for (const q of act) if (BORROW.test(q.text)) add('borrow', '!', [q.id], `${lbl(q)}: материалы чужого сайта (тексты, фото, логотип) не копируются`, 'предложить принцип вместо копии; кадры — media.mjs из законных источников');
  /* 5. вне скилла: сервер, оплата, развёртывание — одним вопросом */
  const groups = { server: [], pay: [], deploy: [] };
  for (const q of act) {
    if (q.kind === 'tech') continue;
    const ks = new Set([...outHints(`${q.text} ${q.docAccept || ''}`).map((h) => h.k), ...(q.hints || []).map((h) => (/оплат/.test(h) ? 'pay' : /развёрт/.test(h) ? 'deploy' : /сервер/.test(h) ? 'server' : null)).filter(Boolean)]);
    if (ks.has('server') || ks.has('db')) groups.server.push(q); if (ks.has('pay')) groups.pay.push(q); if (ks.has('deploy')) groups.deploy.push(q);
  }
  const OUTQ = {
    server: ['нужен сервер: общее состояние у нескольких людей, сообщения, вход', 'Эти функции требуют сервера. Как делаем?', ['демо в браузере: данные живут в этом браузере и между его вкладками, с пометкой «демо» рядом с действием и в подвале', 'подключить готовый сервис (нужен ваш аккаунт и ключ)', 'сервер — отдельная работа, здесь только интерфейс']],
    pay: ['оплата: касса, договор, ключи', 'Оплата: как делаем?', ['кнопка ведёт на вашу существующую кассу или ссылку оплаты', 'без оплаты: заявка', 'отдельная работа']],
    deploy: ['развёртывание: сервер и домен вне скилла', 'Где будет жить сайт?', ['статическая папка — вы выкладываете сами', 'отдельная работа']],
  };
  for (const [k, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const ids = list.map((q) => q.id); const Q = qFor(ids); const [what, ask, opts] = OUTQ[k];
    const resolved = Q && (Q.answer || Q.assumption);
    add('server', resolved ? '·' : '?', ids, `${list.map((q) => `${q.id} ${short(q.text, 32)}`).join(' · ')} (${[...new Set(list.map((q) => q.ext).filter(Boolean))].join(', ') || 'без номеров'}${list.some((q) => q.priority === 'must') ? ', must' : ''})\n                 ${what}`,
      resolved ? `решено: ${Q.id} — ${Q.answer ? `ответ «${short(Q.answer.quote, 60)}»` : `допущение: ${short(Q.assumption.text, 70)}`}` : Q ? `вопрос ${Q.id} задан, ответа нет; нет связи с пользователем — assume ${Q.id} "${opts[0]}"` : `ask ${ids.join(',')} "${ask}" ${opts.map((o) => `--option "${o}"`).join(' ')}; нет связи с пользователем — assume Q-… "${opts[0]}"`, { resolved: !!resolved });
  }
  /* 6. стек из ТЗ */
  const tech = act.filter((q) => q.kind === 'tech' && STACK.test(q.text));
  if (tech.length) {
    const ids = tech.map((q) => q.id); const Q = qFor(ids); const resolved = Q && (Q.answer || Q.assumption);
    add('stack', resolved ? '·' : '?', ids, `${tech.map((q) => `«${short(q.text, 30)}»`).join(', ')} (${[...new Set(tech.map((q) => src0(q).id))].join(', ')})\n                 сайт по умолчанию — статика без сборщика; с React/Next.js меняются сборка, сервер разработки, --site; база и Docker — вне скилла`,
      resolved ? `решено: ${Q.id} — ${Q.answer ? `ответ «${short(Q.answer.quote, 60)}»` : `допущение: ${short(Q.assumption.text, 70)}`}` : `вопрос, если ответ меняет работу: ask ${ids.join(',')} "Стек из документа обязателен для этого сайта?" --option "да, собрать на нём" --option "нет, статический сайт; стек — для будущей версии"; нет связи — assume`, { resolved: !!resolved });
  }
  /* 7. ПДн: форма без согласия и политики */
  const legal = R.items.some((q) => active(q) && q.kind === 'legal');
  if (!legal) for (const q of act) if (PD.test(q.text) && !NEG.test(q.text)) add('pd', '·', [q.id], `${lbl(q)}: форма собирает данные — нужен текст согласия на обработку и политика`, '«Ждём от вас»; форма не публикуется без него', { facts: ['текст согласия и политики'] });
  /* 8. паспорт: стиль против «никогда» */
  const never = passportNever(R);
  if (never.length) for (const q of act.filter((x) => ['style', 'motion', 'media', 'content'].includes(x.kind) && !NEG.test(x.text))) {
    const hit = never.find((n) => common(n.text, q.text, 5).length);
    if (hit) add('passport', '?', [q.id], `${lbl(q)} против «никогда»: «${short(hit.text, 60)}» (${hit.file})`, 'вопрос: правило паспорта или слова пользователя; ответ — ack или change');
  }
  /* 9. шум документа, взятый в требования */
  for (const q of act) { const f = (q.flags || []).filter((x) => NOISE.includes(x)); if (f.length) add('noise', '·', [q.id], `${lbl(q)} взят с пометкой «${f.join(', ')}» (${src0(q).id} ${src0(q).cand || ''})`, `снять: status ${q.id} dropped --self --why "пример шаблона" — или спросить, если без него меняется план`); }
  /* 10. проверка здесь невозможна */
  for (const q of act) {
    if ((q.accept || []).some((a) => a.kind === 'manual')) continue;
    const m = MANUAL_RE.exec(q.text);
    if (m || q.kind === 'reliability') add('manual', '!', [q.id], `${lbl(q)}: ${m ? (/edge/i.test(m[0]) ? 'Edge 153 без окна падает молча на этой машине' : /safari|ios|iphone|айфон/i.test(m[0]) ? 'Safari и iOS здесь не запустить' : /нагруз|одновремен/i.test(m[0]) ? 'нагрузку браузером не измерить' : 'доставку письма или СМС отсюда не увидеть') : 'серверная надёжность — не браузерная проверка'}`, `критерий manual с причиной: accept ${q.id} --add "manual: …" --reason "…" — в «Не проверено»`);
  }
  return out;
}

/* ---------- печать: requirements.md, report ---------- */

const pagesTxt = (q) => [(q.pages || []).join(', '), (q.blocks || []).join(', ')].filter(Boolean).join(' · ');
function toMd(R) {
  const L = ['# Требования', '', `Пишет \`requirements.mjs\`, руками не править: источник правды — \`requirements.json\`. Статусы проверок — \`requirements.mjs <папка> report\`.`, ''];
  const act = R.items.filter(active);
  L.push(`Обновлено ${fmt(R.updatedAt)} · источников ${R.sources.length} · требований ${R.items.length} (действуют ${act.length}, из них контекст ${act.filter(isContext).length}) · вопросов без ответа ${(R.questions || []).filter((x) => !x.answer && !x.assumption).length}${R.direction ? ` · направление ${R.direction.id}` : ''}`, '');
  L.push('## Источники', '', '| id | вид | что | когда | файл | кандидаты |', '|---|---|---|---|---|---|');
  for (const s of R.sources) { const c = readCands(s); const n = c ? c.candidates.length : 0; const open = c ? c.candidates.filter((x) => !x.decision).length : 0; L.push(`| ${s.id} | ${SRC_RU[s.kind] || s.kind} | ${short(s.title || s.url || '', 60).replace(/\|/g, '/')}${s.supersedes ? ` (новая версия ${s.supersedes})` : ''}${s.note ? ` — ${short(s.note, 40).replace(/\|/g, '/')}` : ''} | ${s.said || '—'} | ${s.file || s.text || s.url || ''} | ${n ? `${n}, не просмотрено ${open}` : '—'} |`); }
  L.push('', '## Действующие', '', '| id | П | вид | где | требование | источник | критерии | задачи |', '|---|---|---|---|---|---|---|---|');
  for (const q of act.filter((x) => !isContext(x))) L.push(`| ${q.id}${q.ext ? ` (${q.ext})` : ''}${q.needsReview ? ' ⚑' : ''} | ${q.priority || '—'} | ${KIND_RU[q.kind] || q.kind} | ${pagesTxt(q) || '—'} | ${short(q.text, 90).replace(/\|/g, '/')} | ${(q.sources || []).map((x) => `${x.id}${x.cand ? ' ' + x.cand : ''}`).join(', ')} | ${(q.accept || []).map((a) => `${a.id} ${a.kind}`).join(', ') || '—'} | ${(q.tasks || []).map((t) => `#${t}`).join(', ') || '—'} |`);
  const ctx = act.filter(isContext);
  if (ctx.length) { L.push('', '## Контекст (не задачи)', ''); for (const q of ctx) L.push(`- ${q.id} ${KIND_RU[q.kind]}: ${short(q.text, 120)} (${(q.sources || []).map((x) => x.id).join(', ')})`); }
  const closed = R.items.filter((q) => !active(q));
  if (closed.length) { L.push('', '## Не действуют', ''); for (const q of closed) L.push(`- ${q.id} ${short(q.text, 80)} — ${decisionLabel(q)}`); }
  if ((R.questions || []).length) { L.push('', '## Вопросы', ''); for (const x of R.questions) L.push(`- ${x.id} (${(x.reqs || []).join(', ')}) ${x.text}${x.options && x.options.length ? ` — варианты: ${x.options.join(' / ')}` : ''} → ${x.answer ? `ответ «${short(x.answer.quote, 80)}» (${x.answer.source})` : x.assumption ? `допущение: ${x.assumption.text}` : '**без ответа**'}`); }
  const ev = R.items.flatMap((q) => (q.history || []).filter((h) => h.what !== 'добавлено').map((h) => ({ q, h }))).sort((a, b) => (a.h.at < b.h.at ? -1 : 1));
  if (ev.length) { L.push('', '## Изменения по ходу', ''); for (const { q, h } of ev) L.push(`- ${fmt(h.at)} ${q.id} ред. ${h.rev}: ${h.what}${h.source ? ` (${h.source})` : ''}${h.quote ? ` «${short(h.quote, 80)}»` : ''}${h.why ? ` — ${short(h.why, 80)}` : ''}`); }
  return L.join('\n') + '\n';
}
function dismissedSummary(R) {
  const by = new Map(); let n = 0;
  for (const s of R.sources) { const c = readCands(s); if (!c) continue; for (const x of c.candidates) if (x.decision && x.decision.dismiss) { n++; const k = x.decision.dismiss; by.set(k, (by.get(k) || 0) + 1); } }
  return { n, by };
}
function reportText(R, E, conf, { plan = false } = {}) {
  const L = ['## Требования', ''];
  const kinds = SRC_KINDS.map((k) => [k, R.sources.filter((s) => s.kind === k).length]).filter(([, n]) => n).map(([k, n]) => `${SRC_RU[k]} ${n}`).join(', ');
  const cnt = (codes) => R.items.filter((q) => codes.includes(E.status.get(q.id).code)).length;
  const dropped = R.items.filter((q) => q.decision === 'dropped');
  L.push(`Источников ${R.sources.length} (${kinds || '—'}) · требований ${R.items.length}: выполнено ${cnt(['done'])}, устарело ${cnt(['stale'])}, провалено ${cnt(['fail'])}, без доказательства ${cnt(['noproof'])}, нет критерия ${cnt(['nocrit'])}, в работе ${cnt(['doing'])}, нет задачи ${cnt(['notask'])}, вопросов ${cnt(['question'])}, отложено ${cnt(['deferred'])}, снято ${dropped.length} (по словам пользователя ${dropped.filter((q) => q.decisionBy !== 'self').length}, шум документа ${dropped.filter((q) => q.decisionBy === 'self').length}), заменено ${cnt(['superseded'])}, вне работы ${cnt(['out'])}, контекст ${cnt(['context'])}${R.direction ? ` · направление ${R.direction.id}${R.direction.quote ? ` («${short(R.direction.quote, 50)}»)` : R.direction.why ? ` (своё: ${short(R.direction.why, 50)})` : ''}` : ''}`, '');
  L.push('| id | требование | источник | приоритет | задачи | критерии | статус |', '|---|---|---|---|---|---|---|');
  for (const q of R.items.filter((x) => !isContext(x))) {
    const s0 = (q.sources || [])[0] || {};
    L.push(`| ${q.id} | ${short(q.text, 70).replace(/\|/g, '/')}${q.ext ? ` (${q.ext})` : ''} | ${s0.id || '—'} · ${dm(s0.said)}${(q.sources || []).length > 1 ? ` +${q.sources.length - 1}` : ''} | ${q.priority || '—'} | ${(q.tasks || []).map((t) => `#${t}`).join(', ') || '—'} | ${E.crit.get(q.id).map(critShort).join(' · ') || '—'} | ${E.status.get(q.id).label.replace(/\|/g, '/')} |`);
  }
  if (plan) {
    L.push('', '### План из реестра', '', '| требование | страницы и блоки | задача | критерии |', '|---|---|---|---|');
    for (const q of R.items.filter((x) => active(x) && !isContext(x))) {
      const ts = (q.tasks || []).map((id) => { const t = E.st && E.st.tasks.find((x) => Number(x.id) === Number(id)); return t ? `#${t.id} ${short(t.task, 40)} (${t.priority}, ${t.impl})` : `#${id} (нет в state.json)`; });
      L.push(`| ${q.id} ${short(q.text, 50).replace(/\|/g, '/')}${q.ext ? ` (${q.ext}` : ''}${q.ext ? `, ${q.priority || '—'})` : ` (${q.priority || '—'})`} | ${pagesTxt(q) || '—'} | ${ts.join('; ').replace(/\|/g, '/') || '**нет задачи** — plan'} | ${(q.accept || []).map((a) => `${a.id} ${a.kind}${a.marker ? ` ${a.marker}` : ''}${a.metric ? ` ${a.metric}` : ''}`).join(' · ') || '**нет критерия**'} |`);
    }
  }
  const ctx = R.items.filter((q) => active(q) && isContext(q));
  if (ctx.length) L.push('', `Контекст (не задачи): ${ctx.map((q) => `${q.id} ${KIND_RU[q.kind]} «${short(q.text, 40)}»`).join('; ')}.`);
  const ds = dismissedSummary(R);
  if (ds.n) L.push('', `Не взято из документов: ${ds.n} (${[...ds.by].map(([k, n]) => `${short(k, 60)} — ${n}`).join('; ')}). ФИО участников не импортируются.`);
  const qs = R.questions || [];
  if (qs.length) { L.push('', '### Вопросы', ''); for (const x of qs) L.push(`- ${x.id} (${(x.reqs || []).join(', ')}) ${x.text} → ${x.answer ? `ответ: «${short(x.answer.quote, 90)}» (${x.answer.source})` : x.assumption ? `**допущение** (ответа не было): ${x.assumption.text}` : '**без ответа**'}`); }
  const wait = new Map();
  for (const c of conf.filter((x) => !x.acked && x.facts)) for (const f of c.facts) wait.set(f, [...new Set([...(wait.get(f) || []), ...c.reqs])]);
  if (wait.size) L.push('', `Ждём от вас: ${[...wait].map(([f, ids]) => `${f} (${ids.join(', ')})`).join('; ')}.`);
  const man = R.items.filter((q) => active(q)).flatMap((q) => (q.accept || []).filter((a) => a.kind === 'manual').map((a) => `${q.id}.${a.id} ${short(a.text, 50)} — ${a.reason || 'причина не записана'}`));
  if (man.length) L.push('', `Не проверено здесь (вручную): ${man.join('; ')}.`);
  const open = conf.filter((x) => !x.acked && !x.resolved && x.mark !== '·');
  if (open.length) L.push('', `Противоречия без решения: ${open.map((x) => `${x.label} (${x.reqs.join(', ')})`).join('; ')} — requirements.mjs conflicts.`);
  const firstPlan = R.items.flatMap((q) => (q.history || []).filter((h) => /^задача/.test(h.what)).map((h) => h.at)).sort()[0];
  /* по ходу: смена смысла и решений, новое после первого плана; связи, вторые источники и ответы (они в «Вопросах») — нет */
  const ev = R.items.flatMap((q) => (q.history || []).filter((h) => !/^(задача|связь|пересмотрено|второй источник|ответ по|допущение по)/.test(h.what) && (h.what !== 'добавлено' || (firstPlan && h.at > firstPlan))).map((h) => ({ q, h }))).sort((a, b) => (a.h.at < b.h.at ? -1 : 1));
  if (ev.length) { L.push('', '### История изменений', ''); for (const { q, h } of ev) L.push(`- ${fmt(h.at)} ${h.source ? `${h.source} ` : ''}${h.quote ? `«${short(h.quote, 60)}» ` : ''}→ ${q.id} ${h.what}${h.why ? ` (${short(h.why, 60)})` : ''}`); }
  return L.join('\n') + '\n';
}

/* ---------- команды ---------- */

async function main() {
  const [dirArg, cmd, ...rest] = pos;
  if (!dirArg || !cmd) usage('Нужно: node requirements.mjs <папка прогона> <команда> … (--help — справка)');
  if (!COMMANDS.includes(cmd)) usage(`Неизвестная команда ${cmd} — есть: ${COMMANDS.join(', ')} (--help)`);
  RUN = path.resolve(dirArg); FILE = path.join(RUN, 'requirements.json'); MDFILE = path.join(RUN, 'requirements.md'); SRC_DIR = path.join(RUN, 'requirements', 'sources');

  if (cmd === 'ingest') {
    const file = val('file'); const text0 = opt.stdin ? fs.readFileSync(0, 'utf8') : val('text'); const url = val('url');
    let kind = val('kind'); if (kind && !SRC_KINDS.includes(kind)) usage(`--kind: ${SRC_KINDS.join(' | ')}`);
    if (!file && !text0 && !url) usage('ingest --file <путь> | --text "<сообщение>" | --stdin | --url <ссылка>');
    if (url && !/^(https?|file):\/\//i.test(url)) usage('--url <http://… или https://…>');
    const R = load() || fresh();
    const prev = val('supersedes') ? srcById(R, val('supersedes')) : null; if (val('supersedes') && !prev) die(`нет источника ${val('supersedes')}`);
    let abs = null, buf = null, ext = '', text = null, blocks = null, via = null, title = '', said = val('said');
    if (file) {
      abs = path.resolve(unGit(file)); if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) die(`нет файла ${abs} (вложение «не пришло» — посмотреть ~/Downloads: ls -lt ~/Downloads | head)`);
      ext = path.extname(abs).toLowerCase(); title = path.basename(abs); buf = fs.readFileSync(abs);
      if (AUDIO.test(ext)) die(`${title} — аудио или видео: сначала расшифровка, потом ingest расшифровки:\n  PYTHONIOENCODING=utf-8 "D:/tools/whisper/venv/Scripts/python.exe" "D:/tools/whisper/transcribe.py" "${abs.split(path.sep).join('/')}" --out "${SRC_DIR.split(path.sep).join('/')}"\n  node requirements.mjs "${RUN.split(path.sep).join('/')}" ingest --file "<расшифровка>.md" --kind voice --original "${abs.split(path.sep).join('/')}" --said "<когда>"\n  (запись от 10 минут — D:/tools/whisper/run_batch.ps1 отдельным процессом: таймаут Bash её оборвёт)`);
      if (IMAGE.test(ext)) kind ||= 'image';
      else if (ext === '.docx') { try { blocks = docxBlocks(buf); } catch (e) { die(`${title}: ${e.message}`); } text = blocksText(blocks); via = 'docx'; kind ||= 'doc'; }
      else if (ext === '.pdf') { const p = pdfText(abs); if (!p.via) die(`${title}: текст из PDF не достаётся (нет pdftotext и pypdf, или это скан) — открыть Read (pages), текст передать ingest --text "…" --kind doc --original "${abs.split(path.sep).join('/')}"; цитаты — с номером страницы`); text = p.text; via = p.via; kind ||= 'doc'; blocks = textBlocks(text, 'doc'); }
      else if (['.doc', '.rtf', '.odt', '.pages', '.xlsx', '.pptx'].includes(ext)) die(`${title}: этот формат не разбирается — сохранить как .docx или .pdf либо передать текст --text`);
      else { text = buf.toString('utf8').replace(/^\uFEFF/, ''); if (!kind && /^\*\*\d+:\d{2}(?::\d{2})?\*\*/m.test(text)) kind = 'voice'; kind ||= 'doc'; blocks = textBlocks(text, kind); }
      said ||= new Date(fs.statSync(abs).mtimeMs).toLocaleDateString('sv-SE');
    } else if (text0) { text = text0.replace(/^\uFEFF/, ''); kind ||= 'chat'; blocks = textBlocks(text, kind); title = short(text, 60); said ||= new Date().toLocaleString('sv-SE').slice(0, 16); }
    else { kind ||= 'link'; title = url; said ||= new Date().toLocaleString('sv-SE').slice(0, 16); }
    const hash = sha(buf || text || url);
    const dup = R.sources.find((s) => s.sha256 === hash);
    if (dup && !opt.force) die(`уже есть ${dup.id} «${short(dup.title, 50)}» (${dup.said}) — тот же ${file ? 'файл' : 'текст'}; ничего не записано (--force — записать ещё раз)`);
    fs.mkdirSync(SRC_DIR, { recursive: true });
    const id = nextId(R.sources, 'S');
    const s = { id, kind, title, said, addedAt: now(), supersedes: prev ? prev.id : null, note: val('note'), sha256: hash };
    if (url) s.url = url;
    if (val('original')) {
      const o = path.resolve(unGit(val('original'))); if (!fs.existsSync(o)) die(`нет файла --original ${o}`);
      const dst = path.join(SRC_DIR, `${id}${path.extname(o).toLowerCase()}`); fs.copyFileSync(o, dst); s.file = rel(dst); s.original = o.split(path.sep).join('/');
      if (abs) { const t2 = path.join(SRC_DIR, `${id}.source${ext}`); fs.copyFileSync(abs, t2); s.transcript = rel(t2); }
      if (kind === 'voice') s.transcriber = 'whisper (D:/tools/whisper)';
    } else if (abs) { const dst = path.join(SRC_DIR, `${id}${ext}`); fs.copyFileSync(abs, dst); s.file = rel(dst); s.original = abs.split(path.sep).join('/'); }
    if (text != null) { const tf = path.join(SRC_DIR, `${id}.txt`); fs.writeFileSync(tf, text); s.text = rel(tf); }
    if (via) s.via = via;
    let cands = [];
    if (blocks) {
      cands = candidatesOf(blocks, kind);
      for (const c of cands) if (c.flags.includes(PERSONAL)) c.decision = { dismiss: 'чужие личные данные (ФИО) — не импортируются', by: 'ingest', at: now() };
      const cf = path.join(SRC_DIR, `${id}.candidates.json`);
      const doc = { source: id, createdAt: now(), blocks: blocks.filter((b) => b.type !== 'page').length, note: 'Кандидаты — не требования: решение add --from … --take / --dismiss. Правка руками не нужна.', candidates: cands };
      if (prev) { const pc = readCands(prev); if (pc) doc.diff = diffCands(pc.candidates, cands); }
      writeJson(cf, doc, { generator: false }); s.candidates = rel(cf); s.blocks = doc.blocks;
    }
    R.sources.push(s); save(R, { cmd: 'ingest', source: id });
    const flagged = cands.filter((c) => c.flags.length); const ctx = cands.filter((c) => !c.flags.length && (CONTEXT.includes(c.kind) || c.kind === 'text'));
    console.log(`Источник ${id}: ${short(title, 70)} · ${SRC_RU[kind]}${via ? ` (${via})` : ''} · ${s.said}${blocks ? ` · блоков ${s.blocks} · кандидатов ${cands.length}: без пометок ${cands.length - flagged.length} (из них контекст и текст ${ctx.length}), помечено ${flagged.length}` : ''}`);
    for (const c of cands) {
      const mark = c.flags.length || c.decision ? '·' : '+';
      const sub = [
        c.accept ? `критерий из документа: ${short(c.accept, 110)}` : '',
        c.flags.length ? `пометка: ${c.flags.join(', ')}${c.decision ? ' — снят сам' : ''}` : '',
        c.hints.length ? `вне скилла?: ${c.hints.join('; ')}` : '',
        c.facts.length ? `нужны факты: ${c.facts.join(', ')}` : '',
        c.measurable ? 'измеримо: порог в критерий (perf --metric или runtime с числом)' : '',
        c.similar ? `похоже на ${c.similar} — тот же смысл из другого места (add --take … --to R-…)` : '',
        `где: ${short(c.loc, 100)}`,
      ].filter(Boolean);
      console.log(`${mark} ${c.id} [${[c.kind, c.priority, c.ext].filter(Boolean).join(' ')}] ${short(c.text, 110)}\n        ${sub.join('\n        ')}`);
    }
    if (prev) {
      const pc = readCands(prev); const d = pc ? diffCands(pc.candidates, cands) : null;
      if (d) {
        const P = new Map(pc.candidates.map((c) => [c.id, c])); const N = new Map(cands.map((c) => [c.id, c]));
        console.log(`\nСравнение с ${prev.id} (прошлая версия): добавлено ${d.added.length}, изменено ${d.changed.length}, пропало ${d.removed.length}`);
        for (const x of d.added) { const c = N.get(x); console.log(`  + ${c.id} [${[c.kind, c.ext].filter(Boolean).join(' ')}] ${short(c.text, 90)}`); }
        for (const x of d.changed) { const a = P.get(x.was), b = N.get(x.now); console.log(`  ~ ${b.id} [${[b.kind, b.ext].filter(Boolean).join(' ')}] «${short(a.text, 50)}»${a.priority !== b.priority ? ` ${a.priority || '—'}` : ''} → «${short(b.text, 50)}»${a.priority !== b.priority ? ` ${b.priority || '—'}` : ''}${normQ(a.accept) !== normQ(b.accept) ? ` · критерий «${short(a.accept, 30)}» → «${short(b.accept, 30)}»` : ''}`); }
        for (const x of d.removed) { const c = P.get(x); console.log(`  − ${c.id} прошлой версии [${[c.kind, c.ext].filter(Boolean).join(' ')}] ${short(c.text, 90)}`); }
        if (d.templatePrev) console.log(`  … примеры шаблона прошлой версии (${d.templatePrev}) в сравнение не входят: помечены`);
        const gone = R.items.filter((q) => active(q) && (q.sources || []).some((x) => x.id === prev.id && d.removed.includes(x.cand)));
        const chg = R.items.filter((q) => active(q) && (q.sources || []).some((x) => x.id === prev.id && d.changed.some((y) => y.was === x.cand)));
        if (gone.length) console.log(`Требования из прошлой версии, которых нет в новой: ${gone.map((q) => q.id).join(', ')} — status dropped только со словами пользователя; спросить`);
        if (chg.length) console.log(`Изменились в новой версии: ${chg.map((q) => q.id).join(', ')} — change <R> --quote "<строка новой версии>" --source ${id}`);
      } else console.log(`\nСравнение с ${prev.id}: у прошлой версии нет кандидатов — сравнивать не с чем`);
    }
    if (kind === 'image') console.log(`${s.note ? '' : 'WARN без --note цитировать нечего: слова пользователя о картинке — ingest --text "…" или заново с --note\n'}Дальше: открыть ${s.file} (Read), требования сформулировать самому: add "<требование>" --source ${id} --quote "<слова пользователя из --note>" --kind …`);
    else if (kind === 'link') console.log(`Дальше: референс или донор (reference/new-site.md §3); что нравится — add "<принцип>" --source ${id} --quote "<слова из --note>" --kind reference`);
    else if (cands.length) console.log(`Дальше: add --from ${id} --take <номера> [--page … --block …] · add --from ${id} --dismiss <номера> --why "…"`);
    else console.log('Кандидатов нет: текст пуст или не распознан — открыть оригинал и записать add "<требование>" --source … --quote …');
    return;
  }

  const R = need();
  const st = () => readState();

  if (cmd === 'add') {
    if (val('from')) {
      const s = srcById(R, val('from')); if (!s) die(`нет источника ${val('from')}`);
      const cf = readCands(s); if (!cf) die(`у ${s.id} нет кандидатов (${SRC_RU[s.kind]}) — своё требование: add "<текст>" --source ${s.id} --quote …`);
      const byN = (n) => cf.candidates.find((c) => c.n === n);
      if (val('dismiss')) {
        if (!val('why')) usage('--dismiss — только с причиной: --why "метаданные, примеры шаблона"');
        const done = []; const skip = [];
        for (const n of ranges(val('dismiss'))) { const c = byN(n); if (!c) { skip.push(`${cid(n)} нет`); continue; } if (c.decision && c.decision.take) { skip.push(`${c.id} уже взят в ${c.decision.take}`); continue; } if (c.decision && c.decision.dismiss) { skip.push(`${c.id} уже отклонён («${short(c.decision.dismiss, 40)}»)`); continue; } c.decision = { dismiss: val('why'), by: 'model', at: now() }; done.push(c.id); }
        writeJson(candFile(s), cf, { generator: false }); save(R, { cmd: 'dismiss', source: s.id, cands: done, why: val('why') });
        console.log(`OK   не взято из ${s.id}: ${done.join(', ') || 'ничего'} — «${val('why')}»${skip.length ? `\nWARN пропущено: ${skip.join('; ')}` : ''}`);
      } else if (val('take')) {
        if (val('kind') && !KINDS.includes(val('kind'))) usage(`--kind: ${KINDS.join(' ')}`);
        if (val('priority') && !PRIOS.includes(val('priority'))) usage(`--priority: ${PRIOS.join(' | ')}`);
        const to = val('to') ? item(R, val('to')) : null;
        const errs = []; const list = [];
        for (const n of ranges(val('take'))) {
          const c = byN(n); if (!c) { errs.push(`${cid(n)}: такого кандидата нет (всего ${cf.candidates.length})`); continue; }
          if (c.flags.includes(PERSONAL)) { errs.push(`${c.id}: чужие личные данные — не импортируются никогда`); continue; }
          if (c.decision && c.decision.take) { errs.push(`${c.id}: уже взят в ${c.decision.take}`); continue; }
          if (c.decision && c.decision.dismiss && !opt.force) { errs.push(`${c.id}: уже отклонён («${c.decision.dismiss}») — взять всё же: --force`); continue; }
          const noise = c.flags.filter((f) => NOISE.includes(f)); if (noise.length && !opt.force) { errs.push(`${c.id}: пометка «${noise.join(', ')}» — это шум документа; взять всё же: --force (conflicts напомнит)`); continue; }
          if (['meta', 'people'].includes(c.kind)) { errs.push(`${c.id}: ${c.kind === 'meta' ? 'метаданные документа' : 'участники'} — не требование; нужное из них — add "<текст>" --source ${s.id} --quote …`); continue; }
          if (!c.quote) { errs.push(`${c.id}: у кандидата нет цитаты`); continue; }
          list.push(c);
        }
        if (errs.length) die(`ничего не записано:\n  - ${errs.join('\n  - ')}`);
        const made = [];
        for (const c of list) {
          if (to) { to.sources.push({ id: s.id, cand: c.id, loc: c.loc, quote: c.quote, said: s.said || null, ...(quoteFrom(s) ? { quoteFrom: quoteFrom(s) } : {}) }); hist(to, { source: s.id, what: `второй источник ${s.id} ${c.id}`, quote: short(c.quote, 200) }); c.decision = { take: to.id, at: now() }; made.push(to); continue; }
          const kind = val('kind') || (KINDS.includes(c.kind) ? c.kind : guessKind(c.text));
          const priority = val('priority') || c.priority || (CONTEXT.includes(kind) ? null : 'should');
          const q = newItem(R, s, { text: c.text, kind, priority, prioFrom: val('priority') ? 'self' : c.priority ? c.prioFrom || 'doc' : CONTEXT.includes(kind) ? null : 'self', ext: c.ext, role: c.role, cand: c.id, loc: c.loc, quote: c.quote, pages: val('page') ? pagesOf(val('page')) : [], blocks: val('block') ? idsOf(val('block')) : [], docAccept: c.accept, hints: c.hints, facts: c.facts, flags: c.flags.filter((f) => NOISE.includes(f)) });
          c.decision = { take: q.id, at: now() }; made.push(q);
        }
        writeJson(candFile(s), cf, { generator: false }); save(R, { cmd: 'take', source: s.id, ids: [...new Set(made.map((q) => q.id))] });
        for (const [i, q] of made.entries()) console.log(to ? `OK   ${list[i].id} → второй источник ${q.id}` : `+ ${q.id} [${[q.kind, q.priority, q.ext].filter(Boolean).join(' ')}] ${short(q.text, 90)} ← ${s.id} ${list[i].id}${q.prioFrom === 'self' && !val('priority') ? ' · приоритет свой (should)' : ''}${!isContext(q) && DEFAULT_CRIT[q.kind] ? `\n        критерий по умолчанию: ${DEFAULT_CRIT[q.kind]}${q.docAccept ? ` · из документа: «${short(q.docAccept, 60)}»` : ''}` : ''}`);
        const left = cf.candidates.filter((c) => !c.decision);
        console.log(`Кандидатов ${s.id} не просмотрено: ${left.length}${left.length ? ` (${left.map((c) => c.id).join(', ')}) — --take или --dismiss --why` : ''}`);
      } else usage('add --from S-… --take <номера> | --dismiss <номера> --why "…"');
      return;
    }
    const text = rest[0]; if (!text) usage('add "<требование>" --source S-… --quote "<дословно>" --kind <вид>  |  add --from S-… --take/--dismiss …');
    const kind = val('kind'); if (!kind) usage(`--kind обязателен: ${KINDS.join(' ')}`); if (!KINDS.includes(kind)) usage(`--kind: ${KINDS.join(' ')}`);
    if (val('priority') && !PRIOS.includes(val('priority'))) usage(`--priority: ${PRIOS.join(' | ')}`);
    const s = quoteSource(R, val('quote'), val('source'));
    const pw = prioWords(val('quote'));
    const priority = val('priority') || pw || (CONTEXT.includes(kind) ? null : 'should');
    const prioFrom = val('priority') ? (pw === val('priority') ? 'user' : s.kind === 'doc' ? 'doc' : 'self') : pw ? 'user' : CONTEXT.includes(kind) ? null : 'self';
    if (val('ext') && R.items.some((q) => active(q) && q.ext === val('ext'))) die(`${val('ext')} уже у ${R.items.find((q) => active(q) && q.ext === val('ext')).id} — тот же пункт документа: add --from … --take … --to R-… или change`);
    const q = newItem(R, s, { text, kind, priority, prioFrom, ext: val('ext'), loc: val('loc'), quote: val('quote'), pages: val('page') ? pagesOf(val('page')) : [], blocks: val('block') ? idsOf(val('block')) : [], hints: [...new Set(outHints(text).map((h) => h.why))], facts: kind === 'fact' ? [] : factCats(text) });
    const warns = [];
    for (const spec of multi('accept')) { const a = makeCrit(q, spec); q.accept.push(a); warns.push(...critWarns(q, a)); }
    save(R, { cmd: 'add', ids: [q.id], source: s.id });
    console.log(`+ ${q.id} [${[q.kind, q.priority].filter(Boolean).join(' ')}] ${short(q.text, 90)} ← ${s.id}${s.kind === 'voice' ? ' (цитата из расшифровки: цифры и имена — переспросить)' : ''}${q.accept.length ? ` · критерии ${q.accept.map((a) => `${a.id} ${a.kind}`).join(', ')}` : !isContext(q) && DEFAULT_CRIT[q.kind] ? `\n        критерий по умолчанию: ${DEFAULT_CRIT[q.kind]}` : ''}`);
    for (const w of warns) console.log(`WARN ${w}`);
    const dup = R.items.filter((x) => x !== q && active(x) && jaccard(x.text, q.text) >= 0.6);
    if (dup.length) console.log(`WARN похоже на ${dup.map((x) => `${x.id} «${short(x.text, 40)}»`).join(', ')} — одно требование? тогда status ${q.id} dropped --self --why "дубль ${dup[0].id}" или change`);
    return;
  }

  if (cmd === 'change') {
    const q = item(R, rest[0]);
    const f = { text: val('text'), priority: val('priority'), kind: val('kind'), page: val('page'), block: val('block') };
    if (!Object.values(f).some(Boolean)) usage('change R-… --text|--priority|--kind|--page|--block … --quote "<дословно>" (своё без смены смысла — --self --why)');
    if (f.priority && !PRIOS.includes(f.priority)) usage(`--priority: ${PRIOS.join(' | ')}`);
    if (f.kind && !KINDS.includes(f.kind)) usage(`--kind: ${KINDS.join(' ')}`);
    const self = opt.self || val('by') === 'self';
    if (self && !val('why')) usage('своя правка — только с --why: почему, и что смысл не меняется');
    if (self && f.priority && q.prioFrom && q.prioFrom !== 'self') die(`приоритет ${q.id} — ${q.prioFrom === 'doc' ? 'из документа' : 'слова пользователя'}: менять только его словами (--quote)`);
    const s = self ? null : quoteSource(R, val('quote'), val('source'));
    const before = { text: q.text, priority: q.priority, kind: q.kind, pages: q.pages, blocks: q.blocks };
    if (f.text) q.text = f.text; if (f.priority) { q.priority = f.priority; q.prioFrom = self ? 'self' : 'user'; } if (f.kind) q.kind = f.kind;
    if (f.page) q.pages = pagesOf(f.page); if (f.block) q.blocks = idsOf(f.block);
    const after = { text: q.text, priority: q.priority, kind: q.kind, pages: q.pages, blocks: q.blocks };
    const diff = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (!diff.length) die('ничего не поменялось');
    if (!self) {
      q.rev = (q.rev || 1) + 1; q.changedAt = now(); q.needsReview = true;
      q.sources.push({ id: s.id, cand: null, loc: val('loc') || '', quote: val('quote'), said: s.said || null, ...(quoteFrom(s) ? { quoteFrom: quoteFrom(s) } : {}) });
    }
    hist(q, { source: s ? s.id : null, what: `${self ? 'своя правка' : 'изменено'}: ${diff.map((k) => `${k} «${short(Array.isArray(before[k]) ? before[k].join(', ') : before[k], 50)}» → «${short(Array.isArray(after[k]) ? after[k].join(', ') : after[k], 50)}»`).join('; ')}`, quote: s ? short(val('quote'), 200) : null, why: val('why') || null, from: before, to: after });
    save(R, { cmd: 'change', ids: [q.id], source: s ? s.id : null });
    console.log(`OK   ${q.id} ${self ? 'своя правка, редакция прежняя' : `ред. ${q.rev}`}: ${diff.join(', ')}${self ? '' : ' — доказательства связанных задач устарели (state.mjs show: «требование изменено»)'}`);
    if (!self) impactOf(R, [q]);
    return;
  }

  if (cmd === 'status') {
    const ids = idsOf(rest[0]); const to = rest[1];
    if (!ids.length || !DECISIONS.includes(to)) usage(`status R-…[,R-…] ${DECISIONS.join('|')} [--by R-…] [--quote "<слова пользователя>"] [--why …] [--self]`);
    const self = opt.self || val('by') === 'self';
    const by = !self && val('by') ? item(R, val('by')) : null;
    let s = null;
    if (['dropped', 'deferred', 'out'].includes(to)) {
      if (self) { if (to !== 'dropped') die(`своё решение (--self) — только dropped и только для шума документа; ${to} — словами пользователя (--quote)`); if (!val('why')) usage('--self — только с --why: какой это шум (пример шаблона, заглушка, дубль R-…)'); }
      else s = quoteSource(R, val('quote'), val('source'));
    }
    if (to === 'superseded' && !by) usage('superseded — только с --by R-… (чем заменено; у нового своя цитата)');
    if (val('quote') && !s && !self) s = quoteSource(R, val('quote'), val('source'));
    const out = [];
    for (const id of ids) {
      const q = item(R, id); const was = q.decision || 'active';
      if (by && by.id === q.id) die(`${q.id} не может заменить сам себя`);
      if (self && !(q.flags || []).some((f) => NOISE.includes(f)) && !/дубл/i.test(val('why'))) console.log(`WARN ${q.id} без пометки шума: своё снятие — только для шума документа (пример шаблона, заглушка, дубль); требование пользователя — только его словами`);
      q.decision = to; q.decisionAt = now(); q.decisionBy = self ? 'self' : s ? 'user' : null; q.decisionQuote = s ? val('quote') : ''; q.decisionSource = s ? s.id : null; q.decisionWhy = val('why');
      if (to === 'superseded') { q.supersededBy = by.id; by.supersedes = q.id; hist(by, { what: `заменяет ${q.id}` }); }
      if (to === 'active') { q.supersededBy = null; }
      hist(q, { source: s ? s.id : null, what: `${DECISION_RU[was] || was} → ${DECISION_RU[to]}${by ? ` (${by.id})` : ''}`, quote: s ? short(val('quote'), 200) : null, why: val('why') || null });
      out.push(q);
    }
    save(R, { cmd: 'status', ids, to, source: s ? s.id : null });
    for (const q of out) console.log(`OK   ${q.id}: ${decisionLabel(q)}`);
    if (['dropped', 'superseded', 'out', 'deferred'].includes(to)) impactOf(R, out);
    return;
  }

  if (cmd === 'link' || cmd === 'unlink') {
    const qs = idsOf(rest[0]).map((id) => item(R, id)); const ts = idsOf(rest[1]).map(Number);
    if (!qs.length || !ts.length || ts.some((x) => !Number.isInteger(x))) usage(`${cmd} R-…[,R-…] <задача>[,<задача>]`);
    const S = st(); if (!S) die('нет state.json — сначала state.mjs init');
    for (const t of ts) if (!S.tasks.some((x) => Number(x.id) === t)) die(`нет задачи #${t} в state.json`);
    for (const q of qs) {
      q.tasks = cmd === 'link' ? [...new Set([...(q.tasks || []), ...ts])] : (q.tasks || []).filter((t) => !ts.includes(Number(t)));
      if (cmd === 'link') q.needsReview = false;
      hist(q, { what: `${cmd === 'link' ? 'связь' : 'связь снята'}: ${ts.map((t) => `#${t}`).join(', ')}` });
      console.log(`OK   ${q.id} → ${(q.tasks || []).map((t) => `#${t}`).join(', ') || 'без задач'}`);
    }
    save(R, { cmd, ids: qs.map((q) => q.id), tasks: ts });
    return;
  }

  if (cmd === 'review') {
    const q = item(R, rest[0]); if (!val('note')) usage('review R-… --note "<что решено по задачам>"');
    q.needsReview = false; hist(q, { what: 'пересмотрено', why: val('note') }); save(R, { cmd: 'review', ids: [q.id] });
    console.log(`OK   ${q.id}: пересмотрено — ${val('note')}`);
    return;
  }

  if (cmd === 'plan') {
    const qs = idsOf(rest[0]).map((id) => item(R, id)); const title = rest[1];
    if (!qs.length || !title) usage('plan R-…[,R-…] "<задача>" [--priority P1] [--area …]');
    const S = st(); if (!S) die('нет state.json — сначала state.mjs <папка> init');
    for (const q of qs) { if (!active(q)) die(`${q.id} не действует (${decisionLabel(q)}) — задача ему не нужна`); if (isContext(q)) console.log(`WARN ${q.id} — контекст (${KIND_RU[q.kind]}), задачи ему не нужны`); }
    const BASE = { feature: 1, page: 1, integration: 1, security: 1, legal: 1, perf: 1, a11y: 1, compat: 1, fact: 1, reliability: 1, success: 1, style: 2, media: 2, constraint: 2, reference: 2, tech: 2, content: 3, seo: 3, motion: 4 };
    const pr = (q) => (q.priority === 'could' || q.priority === 'wont' ? 5 : Math.min(5, (BASE[q.kind] || 2) + (q.priority === 'should' ? 1 : 0)));
    const prio = val('priority') ? val('priority').toUpperCase() : `P${Math.min(...qs.map(pr))}`;
    if (!/^P[0-5]$/.test(prio)) usage('--priority P0…P5');
    const args = [STATE_MJS, RUN, 'add', title, '--priority', prio, ...(val('area') ? ['--area', val('area')] : [])];
    const p = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });
    const m = /^#(\d+)\s/m.exec(p.stdout || ''); if (p.status !== 0 || !m) die(`state.mjs add не сработал: ${short(p.stderr || p.stdout, 200)}`);
    const tid = Number(m[1]);
    for (const q of qs) { q.tasks = [...new Set([...(q.tasks || []), tid])]; q.needsReview = false; hist(q, { what: `задача #${tid} ${short(title, 60)}` }); }
    save(R, { cmd: 'plan', ids: qs.map((q) => q.id), tasks: [tid] });
    console.log(`#${tid} ${prio} ${title} ← ${qs.map((q) => q.id).join(', ')}`);
    const noCrit = qs.filter((q) => !isContext(q) && !(q.accept || []).length);
    if (noCrit.length) console.log(`WARN без критерия: ${noCrit.map((q) => `${q.id} (${DEFAULT_CRIT[q.kind] || '—'})`).join('; ')} — accept <R> --add "<вид>: <текст>" --how "…"`);
    return;
  }

  if (cmd === 'accept') {
    const q = item(R, rest[0]);
    if (val('add')) {
      const a = makeCrit(q, val('add'), { marker: val('marker'), viewport: val('viewport'), how: val('how'), metric: val('metric'), reason: val('reason') });
      const w = critWarns(q, a); q.accept.push(a); save(R, { cmd: 'accept', ids: [q.id], add: a.id });
      console.log(`OK   ${q.id}.${a.id} ${a.kind}${a.marker ? ` маркер /*${a.marker}*/` : ''}${a.viewport ? ` · ${a.viewport}` : ''}${a.metric ? ` · ${a.metric}` : ''}: ${short(a.text, 90)}`); for (const x of w) console.log(`WARN ${x}`);
    } else if (val('edit')) {
      const a = (q.accept || []).find((x) => x.id === val('edit')); if (!a) die(`у ${q.id} нет критерия ${val('edit')}`);
      for (const k of ['how', 'metric', 'viewport', 'marker', 'reason']) if (val(k)) a[k] = val(k);
      const w = critWarns(q, a); save(R, { cmd: 'accept', ids: [q.id], edit: a.id });
      console.log(`OK   ${q.id}.${a.id} изменён`); for (const x of w) console.log(`WARN ${x}`);
    } else if (val('drop')) {
      const n = (q.accept || []).length; q.accept = (q.accept || []).filter((x) => x.id !== val('drop')); if (q.accept.length === n) die(`у ${q.id} нет критерия ${val('drop')}`);
      save(R, { cmd: 'accept', ids: [q.id], drop: val('drop') }); console.log(`OK   ${q.id}: критерий ${val('drop')} убран`);
    } else if (val('evidence')) {
      const a = (q.accept || []).find((x) => x.id === val('evidence')); if (!a) die(`у ${q.id} нет критерия ${val('evidence')}`);
      const spec = rest[1]; if (!spec) usage(`accept ${q.id} --evidence ${a.id} <файл[#шаг]>`);
      const m = /^(.*?\.(?:json|png|jpe?g|webp|avif|gif))(?:#(.*))?$/i.exec(unGit(spec)); if (!m) die(`«${spec}» — не протокол .json и не снимок`);
      let abs = path.isAbsolute(m[1]) ? m[1] : path.resolve(RUN, m[1]); if (!fs.existsSync(abs)) abs = path.resolve(m[1]); if (!fs.existsSync(abs)) die(`нет файла ${m[1]}`);
      const inRun = !path.relative(RUN, abs).startsWith('..') && !path.isAbsolute(path.relative(RUN, abs));
      a.evidence = { file: inRun ? rel(abs) : abs.split(path.sep).join('/'), step: m[2] || null, note: val('note') || null, at: now() };
      save(R, { cmd: 'accept', ids: [q.id], evidence: a.id });
      const E = evaluate(R, [q]); const c = E.crit.get(q.id).find((x) => x.a.id === a.id);
      console.log(`OK   ${q.id}.${a.id} ← ${a.evidence.file}${a.evidence.step ? '#' + a.evidence.step : ''} · ${c.label}`);
    } else usage(`accept ${q.id} --add "<вид>: <текст>" | --edit <a> … | --drop <a> | --evidence <a> <файл>`);
    return;
  }

  if (cmd === 'ask') {
    const qs = idsOf(rest[0]).map((id) => item(R, id)); const text = rest[1]; if (!qs.length || !text) usage('ask R-…[,R-…] "<вопрос>" [--option "…"]…');
    const x = { id: nextId(R.questions, 'Q'), reqs: qs.map((q) => q.id), text, options: multi('option'), askedAt: now(), answer: null, assumption: null };
    R.questions.push(x); save(R, { cmd: 'ask', ids: x.reqs, q: x.id });
    console.log(`OK   ${x.id} (${x.reqs.join(', ')}): ${text}${x.options.length ? `\n     ${x.options.map((o, i) => `${i + 1}) ${o}`).join('\n     ')}` : ''}\nСессия не интерактивная — ответа не ждать: assume ${x.id} "<вариант, который меньше всего придётся переделывать>" и продолжать`);
    return;
  }
  if (cmd === 'answer' || cmd === 'assume') {
    const x = (R.questions || []).find((y) => numOf(y.id, 'Q') === numOf(rest[0], 'Q')); if (!x) die(`нет вопроса ${rest[0]}`);
    if (cmd === 'answer') { const s = quoteSource(R, val('quote'), val('source')); x.answer = { source: s.id, quote: val('quote'), at: now() }; }
    else { if (x.answer) die(`${x.id} уже отвечен — допущение не нужно`); if (!rest[1]) usage(`assume ${x.id} "<допущение>"`); x.assumption = { text: rest[1], at: now() }; }
    for (const id of x.reqs || []) { const q = R.items.find((y) => y.id === id); if (q) hist(q, { source: x.answer ? x.answer.source : null, what: `${cmd === 'answer' ? 'ответ' : 'допущение'} по ${x.id}`, quote: x.answer ? short(x.answer.quote, 200) : null, why: x.assumption ? x.assumption.text : null }); }
    save(R, { cmd, q: x.id }); console.log(`OK   ${x.id}: ${x.answer ? `ответ «${short(x.answer.quote, 80)}» (${x.answer.source})` : `допущение «${short(x.assumption.text, 80)}» — в отчёт первыми строками`} — дальше: change/status/accept по ${(x.reqs || []).join(', ')}`);
    return;
  }
  if (cmd === 'ack') {
    const q = item(R, rest[0]); const type = rest[1]; if (!CONFLICT_TYPES[type]) usage(`ack R-… <тип> --why "…" — типы: ${Object.keys(CONFLICT_TYPES).join(' ')}`);
    if (!val('why')) usage('ack — только с --why: почему конфликт не мешает');
    const w = val('with') ? item(R, val('with')).id : null;
    (q.acks ||= []).push({ type, with: w, why: val('why'), at: now() }); hist(q, { what: `конфликт ${type}${w ? ` с ${w}` : ''} принят`, why: val('why') });
    save(R, { cmd: 'ack', ids: [q.id], type }); console.log(`OK   ${q.id}: ${CONFLICT_TYPES[type]}${w ? ` с ${w}` : ''} — «${val('why')}»`);
    return;
  }
  if (cmd === 'direction') {
    const id = rest[0]; if (!id || !/^[a-z0-9-]+$/i.test(id)) usage('direction <a|b|c> (--quote "<слова пользователя>" | --self --why "…")');
    const self = opt.self || val('by') === 'self';
    if (!self && !val('quote')) usage('выбор пользователя — его словами (--quote); автономно — --self --why "<почему по требованиям>"');
    if (self && !val('why')) usage('--self — только с --why');
    const s = self ? null : quoteSource(R, val('quote'), val('source'));
    if (!fs.existsSync(path.join(RUN, 'direction', id))) console.log(`WARN папки ${path.join(RUN, 'direction', id)} нет — эскиз направления лежит там (reference/new-site.md §3)`);
    R.direction = { id, by: self ? 'self' : 'user', quote: s ? val('quote') : '', source: s ? s.id : null, why: val('why') || '', at: now() };
    save(R, { cmd: 'direction', id }); console.log(`OK   направление ${id} (${self ? `своё: ${val('why')}` : `«${short(val('quote'), 60)}» ${s.id}`}) — дальше: extract.mjs и cliche.mjs baseline по эскизу, state.mjs stage direction done`);
    return;
  }

  if (cmd === 'list') {
    const E = evaluate(R);
    let n = 0;
    for (const q of R.items) {
      if (val('kind') && q.kind !== val('kind')) continue;
      if (val('decision') && (q.decision || 'active') !== val('decision')) continue;
      if (val('page') && !(q.pages || []).some((p) => pagesOf(val('page')).includes(p))) continue;
      if (opt.open && !(active(q) && !isContext(q) && (!(q.tasks || []).length || !(q.accept || []).length || q.needsReview))) continue;
      n++;
      const why = opt.open ? [!(q.tasks || []).length ? 'нет задачи' : '', !(q.accept || []).length ? 'нет критерия' : '', q.needsReview ? 'пересмотреть после изменения' : ''].filter(Boolean).join(', ') : E.status.get(q.id).label;
      console.log(`${q.id} ${(q.priority || '—').padEnd(6)} ${(KIND_RU[q.kind] || q.kind).padEnd(12)} ${short(pagesTxt(q), 16).padEnd(16)} ${short(q.text + (q.ext ? ` (${q.ext})` : ''), 60).padEnd(60)} ${short(why, 44).padEnd(44)} ${(q.sources || []).map((x) => `${x.id}${x.cand ? ' ' + x.cand : ''}`).join(', ')}`);
    }
    console.log(opt.open ? (n ? `Открыто ${n}: у каждого активного требования — задача (plan/link) и критерий (accept)` : 'Открытых нет: у каждого активного требования есть задача и критерий') : `Требований ${n} из ${R.items.length}`);
    return;
  }

  if (cmd === 'show') {
    const q = item(R, rest[0]); const E = evaluate(R, [q]); const S = E.st;
    console.log(`${q.id}${q.ext ? ` (${q.ext})` : ''} · ${q.priority || 'без приоритета'}${q.prioFrom ? ` (${q.prioFrom})` : ''} · ${KIND_RU[q.kind] || q.kind} · ${decisionLabel(q)} · ред. ${q.rev || 1}${q.changedAt ? ` от ${fmt(q.changedAt)}` : ''}${q.needsReview ? ' · ПЕРЕСМОТРЕТЬ задачи после изменения' : ''}\n  ${q.text}${q.role ? `\n  роль: ${q.role}` : ''}`);
    for (const x of q.sources || []) console.log(`  источник ${x.id}${x.cand ? ' ' + x.cand : ''}${x.said ? ` · ${x.said}` : ''}${x.loc ? ` · ${short(x.loc, 70)}` : ''}${x.quoteFrom ? ` (цитата из ${x.quoteFrom === 'voice' ? 'расшифровки' : 'PDF'})` : ''}\n     «${short(x.quote, 220)}»`);
    if (q.docAccept) console.log(`  критерий из документа: ${q.docAccept}`);
    console.log(`  страницы: ${(q.pages || []).join(', ') || '—'} · блоки: ${(q.blocks || []).join(', ') || '—'}`);
    for (const c of E.crit.get(q.id)) console.log(`  критерий ${c.a.id} ${c.a.kind}${c.a.marker ? ` /*${c.a.marker}*/` : ''}${c.a.viewport ? ` · ${c.a.viewport}` : ''}${c.a.metric ? ` · ${c.a.metric}` : ''}: ${c.a.text}\n     → ${c.label}${c.a.how ? `\n     как: ${c.a.how}` : ''}${(c.warns || []).length ? `\n     WARN ${c.warns.join('; ')}` : ''}`);
    if (!(q.accept || []).length && !isContext(q)) console.log(`  критериев нет — по умолчанию: ${DEFAULT_CRIT[q.kind] || '—'}`);
    for (const id of q.tasks || []) { const t = S && S.tasks.find((x) => Number(x.id) === Number(id)); console.log(t ? `  задача #${t.id} ${t.priority} «${short(t.task, 60)}» impl ${t.impl} · runtime ${t.runtime} · visual ${t.visual} · mobile ${t.mobile} · perf ${t.perf}` : `  задача #${id} — нет в state.json`); }
    if (!(q.tasks || []).length && active(q) && !isContext(q)) console.log('  задач нет — plan или link');
    for (const x of (R.questions || []).filter((y) => (y.reqs || []).includes(q.id))) console.log(`  вопрос ${x.id}: ${x.text} → ${x.answer ? `«${short(x.answer.quote, 60)}»` : x.assumption ? `допущение: ${x.assumption.text}` : 'без ответа'}`);
    if ((q.hints || []).length || (q.facts || []).length) console.log(`  подсказки: ${[...(q.hints || []).map((h) => `вне скилла? ${h}`), ...(q.facts || []).length ? [`нужны факты: ${q.facts.join(', ')}`] : []].join('; ')}`);
    for (const a of q.acks || []) console.log(`  принят конфликт ${a.type}${a.with ? ` с ${a.with}` : ''}: ${a.why}`);
    console.log(`  статус: ${E.status.get(q.id).label}`);
    for (const h of q.history || []) console.log(`  ${fmt(h.at)} ред.${h.rev} ${h.what}${h.source ? ` ← ${h.source}` : ''}${h.quote && h.what !== 'добавлено' ? ` «${short(h.quote, 60)}»` : ''}${h.why ? ` — ${short(h.why, 70)}` : ''}`);
    return;
  }

  if (cmd === 'impact') {
    if (val('text')) { impactText(R, val('text')); return; }
    const qs = idsOf(rest[0]).map((id) => item(R, id)); if (!qs.length) usage('impact R-…[,R-…] | --text "<новое требование>"');
    impactOf(R, qs); return;
  }

  if (cmd === 'conflicts') {
    const taste = await loadTaste(); let list = findConflicts(R, taste);
    if (rest[0]) { const q = item(R, rest[0]); list = list.filter((x) => x.reqs.includes(q.id)); }
    if (opt.json) { console.log(JSON.stringify(list, null, 1)); process.exit(opt.strict && list.some((x) => !x.acked && !x.resolved) ? 1 : 0); }
    const shown = list.filter((x) => !x.acked);
    console.log(`Противоречия и подозрения · прогон ${path.basename(RUN)} · активных ${R.items.filter((q) => active(q) && !isContext(q)).length}\n`);
    const order = ['server', 'stack', 'pair', 'taste', 'passport', 'borrow', 'manual', 'pd', 'fact', 'noise'];
    for (const x of shown.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))) console.log(`${x.mark} ${x.label.padEnd(15)} ${x.text}\n${' '.repeat(18)}→ ${x.todo}`);
    const open = shown.filter((x) => !x.resolved);
    console.log(`${shown.length ? '\n' : ''}Итого: вопросов ${open.filter((x) => x.mark === '?').length}, ручных проверок и границ ${open.filter((x) => x.mark === '!').length}, ждём фактов ${open.filter((x) => x.facts).length}, подсказок ${open.filter((x) => x.mark === '·' && !x.facts).length} · решено (ответы, допущения) ${shown.filter((x) => x.resolved).length}, принято (ack) ${list.length - shown.length}`);
    if (opt.strict && open.length) process.exit(1);
    return;
  }

  if (cmd === 'report') {
    const E = evaluate(R); const conf = findConflicts(R, await loadTaste());
    const text = reportText(R, E, conf, { plan: !!opt.plan });
    if (val('md')) { const f = path.resolve(unGit(val('md'))); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); console.log(`OK   ${f}`); } else process.stdout.write(text);
    return;
  }

  if (cmd === 'checks') {
    const S = st(); const url = val('url') || (S && S.url) || '';
    if (!url) die('нет адреса сайта: --url http://localhost:<порт>/ или state.mjs <папка> meta --url …');
    const only = val('only') ? idsOf(val('only')).map((id) => item(R, id).id) : null;
    const qs = R.items.filter((q) => active(q) && !isContext(q) && (!only || only.includes(q.id)));
    const L = ['#!/usr/bin/env bash', `# Проверки по требованиям — requirements.mjs ${fmt(now())}${only ? ` (только ${only.join(', ')})` : ''}. Сайт должен быть поднят; по одной за раз: скорость не мерить параллельно.`,
      `S="${SCRIPTS.split(path.sep).join('/')}"`, `D="${path.resolve(SCRIPTS, '..', '..', 'design-reference', 'scripts').split(path.sep).join('/')}"`, `R="${RUN.split(path.sep).join('/')}"`, `U="${url}"`, ''];
    let n = 0; const manual = [];
    for (const q of qs) for (const a of q.accept || []) {
      const head = `${q.id}.${a.id} ${a.kind}: ${short(a.text, 70)}`.replace(/'/g, '’');
      if (a.kind === 'manual') { manual.push(`# ${head} — вручную: ${a.reason || ''}`); continue; }
      if (!a.how) { L.push(`# ${head} — ${a.kind === 'eye' ? 'снимок смотреть глазами, потом accept --evidence' : 'команды нет (accept --edit … --how)'}`, ''); continue; }
      const c = a.how.replace(/\{url\}([^\s"']*)/g, '"${U}$1"').replace(/\{run\}([^\s"']*)/g, '"${R}$1"').replace(/^\s*(?:node\s+)?(?:(?:~|\$HOME)\/\.claude\/skills\/(?:site-rework|design-reference)\/scripts\/)?([\w-]+\.mjs)(?=\s|$)/, (m0, name) => `node "${DR_TOOLS.includes(name) ? '$D' : '$S'}/${name}"`);
      L.push(`echo '### ${head}'`, c, ''); n++;
    }
    if (manual.length) L.push('# Не проверяется здесь:', ...manual, '');
    const text = L.join('\n');
    if (val('sh')) { const f = path.resolve(unGit(val('sh'))); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text + '\n'); console.log(`OK   ${f}: команд ${n}, ручных ${manual.length} — bash "${f.split(path.sep).join('/')}"`); }
    else if (!val('journal')) console.log(text);
    if (val('journal')) {
      const E = evaluate(R, qs); const J = ['#!/usr/bin/env bash', `# Отметки в журнал задач по доказательствам требований — requirements.mjs ${fmt(now())}. После checks.sh. visual — не здесь: снимок смотрит модель.`, `S="${SCRIPTS.split(path.sep).join('/')}"`, `R="${RUN.split(path.sep).join('/')}"`, ''];
      const seen = new Map(); let m = 0;
      for (const q of qs) {
        const tasks = (q.tasks || []).filter((id) => { const t = E.st && E.st.tasks.find((x) => Number(x.id) === Number(id)); return t && t.impl !== 'DROPPED'; });
        for (const c of E.crit.get(q.id)) {
          const col = c.a.kind === 'mobile' ? 'mobile' : c.a.kind === 'runtime' ? 'runtime' : c.a.kind === 'perf' ? 'perf' : null;
          if (!col) { if (c.a.kind === 'eye') J.push(`# ${q.id}.${c.a.id} eye — после взгляда: node "$S/state.mjs" "$R" set <задача> visual=VERIFIED --evidence <снимок.png>`); continue; }
          let spec = c.spec && c.code !== 'none' ? c.spec : null;
          if (!spec && tagOf(c.a.how) && /--out\s+"?\{run\}"?/.test(c.a.how || '')) spec = col === 'perf' ? `perf/${tagOf(c.a.how)}.json${c.a.metric ? '#' + /^\s*([A-Za-zА-Яа-я]+)/.exec(c.a.metric)[1] : ''}` : `runtime/${tagOf(c.a.how)}.json#/*${c.a.marker}*/`;
          if (!spec) { J.push(`# ${q.id}.${c.a.id} ${c.a.kind}: доказательства нет и путь из команды не вывести (--tag и --out {run})`); continue; }
          for (const t of tasks) {
            const key = `${t}:${col}`;
            if (seen.has(key)) { J.push(`# ${q.id}.${c.a.id} тоже подтверждает #${t} ${col} (${spec}) — у задачи одна отметка на проверку, статус требования считает requirements.mjs`); continue; }
            seen.set(key, spec); J.push(`node "$S/state.mjs" "$R" set ${t} ${col}=VERIFIED --evidence '${spec.replace(/'/g, "'\\''")}'   # ${q.id}.${c.a.id}`); m++;
          }
          if (!tasks.length) J.push(`# ${q.id}.${c.a.id}: у требования нет задачи — plan или link`);
        }
      }
      const f = path.resolve(unGit(val('journal'))); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, J.join('\n') + '\n'); console.log(`OK   ${f}: отметок ${m}`);
    }
    return;
  }

  if (cmd === 'check') {
    const S = st(); const out = [];
    const F = (m) => out.push(`FAIL ${m}`); const W = (m) => out.push(`WARN ${m}`);
    const extSeen = new Map();
    for (const q of R.items) {
      if (!(q.sources || []).length || q.sources.some((x) => !x.quote)) F(`${q.id}: без источника или без цитаты — требования без цитаты не существует`);
      for (const x of q.sources || []) { const s = srcById(R, x.id); if (!s) F(`${q.id}: нет источника ${x.id}`); else if (x.quote && !quoteIn(s, x.quote)) F(`${q.id}: цитаты нет в ${x.id} «${short(x.quote, 60)}»`); }
      for (const t of q.tasks || []) if (!S) F(`${q.id}: связан с #${t}, а state.json нет`); else if (!S.tasks.some((y) => Number(y.id) === Number(t))) F(`${q.id}: задачи #${t} нет в state.json`);
      for (const a of q.accept || []) {
        if (a.evidence && a.evidence.file && !fs.existsSync(path.resolve(RUN, a.evidence.file))) F(`${q.id}.${a.id}: файла доказательства нет — ${a.evidence.file}`);
        if (a.kind === 'manual' && !a.reason) F(`${q.id}.${a.id}: manual без причины`);
        if (MARKER_KINDS.includes(a.kind) && !a.marker) W(`${q.id}.${a.id}: ${a.kind} без маркера — доказательство само не найдётся`);
        if (MARKER_KINDS.includes(a.kind) && a.how && a.marker && !a.how.includes(`/*${a.marker}*/`)) W(`${q.id}.${a.id}: в команде нет /*${a.marker}*/`);
      }
      if (active(q) && q.priority === 'must' && !isContext(q) && !(q.accept || []).length) F(`${q.id}: активное must без критерия приёмки (accept ${q.id} --add …)`);
      if (['dropped', 'deferred', 'out'].includes(q.decision) && q.decisionBy !== 'self' && !q.decisionQuote) F(`${q.id}: ${q.decision} без слов пользователя`);
      if (q.decision === 'dropped' && q.decisionBy === 'self' && !q.decisionWhy) F(`${q.id}: своё снятие без причины`);
      if (q.decision === 'superseded' && (!q.supersededBy || !R.items.some((y) => y.id === q.supersededBy))) F(`${q.id}: superseded без --by или заменившего нет`);
      if ((q.flags || []).includes(PERSONAL)) F(`${q.id}: чужие личные данные в реестре`);
      if (active(q) && q.ext) { if (extSeen.has(q.ext)) F(`${q.id} и ${extSeen.get(q.ext)}: оба действуют с одним номером ${q.ext}`); else extSeen.set(q.ext, q.id); }
      if (active(q) && q.needsReview) W(`${q.id}: изменено (ред. ${q.rev}) — задачи не пересмотрены: impact ${q.id}, потом link/plan/review`);
      if (active(q) && !isContext(q) && !(q.tasks || []).length && S && S.stages && S.stages.plan === 'done') W(`${q.id}: нет задачи, а этап plan отмечен done`);
    }
    for (const s of R.sources) {
      if (s.file && !fs.existsSync(path.join(RUN, s.file))) F(`${s.id}: нет копии исходника ${s.file}`);
      if (s.text && !fs.existsSync(path.join(RUN, s.text))) F(`${s.id}: нет текста ${s.text}`);
      const c = readCands(s); if (c) { const left = c.candidates.filter((x) => !x.decision); if (left.length) W(`${s.id}: кандидатов не просмотрено ${left.length} (${short(left.map((x) => x.id).join(', '), 80)}) — --take или --dismiss --why`); }
    }
    for (const x of R.questions || []) if (!x.answer && !x.assumption) W(`${x.id}: вопрос без ответа и без допущения (assume ${x.id} "…")`);
    if (S && S.mode === 'new' && !R.items.some((q) => active(q) && q.kind === 'about')) W('режим new: нет требования «о чём сайт» (вид about) — без него не начинать: спросить или add … --kind about');
    for (const l of out) console.log(l);
    const f = out.filter((l) => l.startsWith('FAIL')).length;
    console.log(`${f ? 'FAIL' : out.length ? 'WARN' : 'OK'}: ошибок ${f}, предупреждений ${out.length - f} · требований ${R.items.length}, источников ${R.sources.length}, вопросов ${(R.questions || []).length}`);
    if (f) process.exit(1);
    return;
  }

  if (cmd === 'md') { save(R); console.log(`OK   ${MDFILE}`); return; }
}

/* ---------- влияние ---------- */

const WIDE = ['style', 'motion', 'reference', 'media'];
function impactOf(R, qs) {
  const S = readState(); const E = evaluate(R, R.items.filter((q) => active(q) || qs.includes(q)));
  for (const q of qs) {
    const gone = !active(q);
    console.log(`\n${q.id} «${short(q.text, 70)}» (${[q.priority, q.ext].filter(Boolean).join(', ')}) · ред. ${q.rev || 1} · ${decisionLabel(q)}`);
    const last = [...(q.history || [])].reverse().find((h) => h.from);
    if (last && !gone) console.log(`  было: «${short(last.from.text, 70)}»${last.from.priority !== q.priority ? ` (${last.from.priority})` : ''} → стало «${short(q.text, 70)}»`);
    console.log('Задевает:');
    const tasks = (q.tasks || []).map((id) => (S ? S.tasks.find((t) => Number(t.id) === Number(id)) : null) || { id, task: '(нет в state.json)', impl: '?' });
    if (!tasks.length) console.log(`  задачи   нет${gone ? '' : ` — plan ${q.id} "<задача>"`}`);
    for (const t of tasks) {
      const ver = ['runtime', 'visual', 'mobile', 'perf'].filter((c) => t[c] === 'VERIFIED');
      const others = R.items.filter((x) => x !== q && active(x) && (x.tasks || []).map(Number).includes(Number(t.id)));
      const todo = gone ? (others.length ? `пересмотреть: задача держит ещё ${others.map((x) => x.id).join(', ')}` : `снять: state.mjs <папка> set ${t.id} impl=DROPPED --note "${q.id} ${DECISION_RU[q.decision]}${q.decisionSource ? ': ' + q.decisionSource : ''}"`) : `переоткрыть: state.mjs <папка> set ${t.id} impl=DOING --note "${q.id} ред. ${q.rev}: ${short(q.text, 40)}"`;
      console.log(`  задача   #${t.id} «${short(t.task, 50)}» — impl ${t.impl}${ver.length ? ` · VERIFIED ${ver.join(', ')}${gone ? '' : ' — устареет (требование изменено)'}` : ''} → ${todo}`);
      if (others.length && !gone) console.log(`           на той же задаче ${others.map((x) => x.id).join(', ')} — их критерии прогнать заново (регресс)`);
    }
    if ((q.pages || []).length || (q.blocks || []).length) {
      console.log(`  страницы ${(q.pages || []).join(', ') || '—'}${(q.blocks || []).length ? ` · блоки ${q.blocks.join(', ')}` : ''}`);
      const near = R.items.filter((x) => x !== q && active(x) && !isContext(x) && (((x.pages || []).some((p) => (q.pages || []).includes(p)) && (q.pages || []).length) || (x.blocks || []).some((b) => (q.blocks || []).includes(b))));
      if (near.length) console.log(`           там же: ${near.slice(0, 10).map((x) => `${x.id} «${short(x.text, 30)}»`).join('; ')}${near.length > 10 ? ' …' : ''}`);
    }
    for (const c of E.crit.get(q.id) || []) console.log(`  критерий ${c.a.id} ${c.a.kind}: ${c.label}${gone ? ' — больше не нужен' : last && c.a.how ? ' — команда писалась под прежнюю формулировку: проверить' : ''}`);
    console.log(`  язык сайта ${WIDE.includes(q.kind) ? 'ЗАДЕТ: широкая правка — пересобрать спецификацию направления (extract.mjs), базу cliche, проверить все страницы; сказать пользователю до того, как делать' : `не задет (вид ${KIND_RU[q.kind] || q.kind})`}`);
    if (!gone) console.log(`Быстрый круг: requirements.mjs <папка> checks --only ${q.id}${tasks.length ? '' : ` (сначала plan ${q.id} "…")`}; перед сдачей — весь checks.sh`);
    else if (q.supersededBy) console.log(`Вместо него: ${q.supersededBy} — plan ${q.supersededBy} "…", accept ${q.supersededBy} --add …, checks --only ${q.supersededBy}`);
  }
}
function impactText(R, text) {
  const kind = guessKind(text);
  const sims = R.items.filter((q) => active(q) && !isContext(q)).map((q) => ({ q, j: jaccard(q.text, text), c: common(q.text, text) })).filter((x) => x.j >= 0.2 || x.c.length >= 2).sort((a, b) => b.j - a.j || b.c.length - a.c.length).slice(0, 6);
  console.log(`Новое: «${short(text, 90)}» · вид по словам: ${KIND_RU[kind]}${NEG.test(text) ? ' · с отрицанием' : ''}`);
  if (!sims.length) console.log('Похожих действующих требований нет — отдельное: ingest --text "…", add "…" --source S-… --quote … --kind …, plan');
  for (const { q, j, c } of sims) console.log(`  похоже на ${q.id} «${short(q.text, 60)}» (${Math.round(j * 100)}%, общее: ${c.slice(0, 4).join(', ')}) · задачи ${(q.tasks || []).map((t) => `#${t}`).join(', ') || 'нет'}${NEG.test(text) !== NEG.test(q.text) ? ' · полярность другая — отмена или замена?' : ''}`);
  if (sims.length) console.log(`Если это уточнение — change ${sims[0].q.id} --text "…" --quote "…"; замена — add … и status ${sims[0].q.id} superseded --by <новое>; отмена — status ${sims[0].q.id} dropped --quote "…"`);
  console.log(`Язык сайта ${WIDE.includes(kind) ? 'будет задет — широкая правка (все страницы)' : 'не задет'} · противоречия — conflicts после add`);
}

/* ---------- самопроверка: fixtures/requirements, временная папка, все команды по кругу ---------- */

function selftest() {
  const FX = path.join(SCRIPTS, 'fixtures', 'requirements');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'requirements-selftest-'));
  const run = path.join(tmp, 'run'); const taste = path.join(tmp, 'taste');
  fs.mkdirSync(taste, { recursive: true });
  fs.writeFileSync(path.join(taste, 'journal.jsonl'), JSON.stringify({ date: '2026-09-20', scope: 'general', block: 'page', verdict: 'rejected', by: 'user', rules: ['marquee'], quote: 'бегущие строки не надо никогда', why: 'бегущая строка слоганов' }) + '\n');
  const env = { ...process.env, SITE_REWORK_TASTE: taste };
  const R = (...a) => { const p = spawnSync(process.execPath, [SELF, run, ...a], { encoding: 'utf8', env, windowsHide: true }); return { code: p.status, out: `${p.stdout}${p.stderr}` }; };
  const ST = (...a) => { const p = spawnSync(process.execPath, [STATE_MJS, run, ...a], { encoding: 'utf8', env, windowsHide: true }); return { code: p.status, out: `${p.stdout}${p.stderr}` }; };
  const reg = () => JSON.parse(fs.readFileSync(path.join(run, 'requirements.json'), 'utf8'));
  const cands = (sid) => JSON.parse(fs.readFileSync(path.join(run, 'requirements', 'sources', `${sid}.candidates.json`), 'utf8')).candidates;
  const results = []; const check = (group, name, ok, extra = '') => { results.push(!!ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${group.padEnd(9)} ${name}${extra ? ` — ${extra}` : ''}`); };
  const byExt = (cs, ext) => cs.find((c) => c.ext === ext);
  const q = (id) => reg().items.find((x) => x.id === id);
  try {
    let r = ST('init', '-', 'Полка — клуб выбора книг', '--mode', 'new', '--site', path.join(run, 'site'));
    check('state', 'init - --mode new: журнал, папка сайта создана', r.code === 0 && fs.existsSync(path.join(run, 'site')), r.out.split('\n')[0]);
    const siteFile = path.join(run, 'site', 'index.html'); fs.writeFileSync(siteFile, '<!doctype html><title>Полка</title><h1>Полка</h1>');
    const old = new Date(Date.now() - 3600e3); fs.utimesSync(siteFile, old, old);

    /* ingest .docx */
    r = R('ingest', '--file', path.join(FX, 'prd-mini.docx'), '--said', '2026-09-24');
    const c1 = fs.existsSync(path.join(run, 'requirements', 'sources', 'S-001.candidates.json')) ? cands('S-001') : [];
    const fr = c1.filter((c) => c.kind === 'feature' && c.ext);
    check('ingest', 'docx: источник S-001, копия, текст, кандидаты', r.code === 0 && fs.existsSync(path.join(run, 'requirements', 'sources', 'S-001.docx')) && fs.existsSync(path.join(run, 'requirements', 'sources', 'S-001.txt')) && c1.length === 21, `кандидатов ${c1.length}`);
    check('ingest', 'FR-таблица: 3 функции, приоритет и критерий документа', fr.length === 3 && byExt(c1, 'FR-01').priority === 'must' && byExt(c1, 'FR-03').priority === 'should' && byExt(c1, 'FR-01').accept === 'Книги отображаются', fr.map((c) => `${c.ext} ${c.priority}`).join(', '));
    const kinds = c1.map((c) => c.kind);
    check('ingest', 'NFR по категориям: perf, compat, reliability', ['perf', 'compat', 'reliability'].every((k) => kinds.includes(k)));
    check('ingest', 'стек, глоссарий, «что входит»', kinds.filter((k) => k === 'tech').length === 2 && kinds.filter((k) => k === 'glossary').length === 2 && c1.filter((c) => /Что входит/.test(c.loc) && !c.flags.length).length === 3);
    const tpl = c1.filter((c) => c.flags.includes('пример шаблона?')); const ph = c1.filter((c) => c.flags.includes('заглушка')); const meta = c1.filter((c) => c.flags.includes('метаданные')); const ppl = c1.filter((c) => c.flags.includes('личные данные'));
    check('ingest', 'шум: пример шаблона 3, заглушка 1, метаданные 1, ФИО 1', tpl.length === 3 && ph.length === 1 && meta.length === 1 && ppl.length === 1, `шаблон ${tpl.length}, заглушка ${ph.length}, метаданные ${meta.length}, ФИО ${ppl.length}`);
    const txt1 = JSON.stringify(c1);
    check('ingest', 'ФИО не попали в кандидатов и сняты сами', !/Тестовый|Примерова/.test(txt1) && ppl[0] && ppl[0].decision && ppl[0].decision.dismiss);
    check('ingest', 'подсказки: вне скилла (комната FR-03), база (PostgreSQL), похоже на (карточка)', c1.some((c) => c.ext === 'FR-03' && c.hints.some((h) => /сервер/.test(h))) && c1.some((c) => c.kind === 'tech' && c.hints.some((h) => /база/.test(h))) && c1.some((c) => /Карточка/.test(c.text) && c.similar));
    check('ingest', 'измеримо: «до 2 секунд»', c1.some((c) => c.kind === 'perf' && c.measurable));
    r = R('ingest', '--file', path.join(FX, 'prd-mini.docx'));
    check('ingest', 'тот же файл второй раз — отказ (код 1)', r.code === 1 && /уже есть S-001/.test(r.out));

    /* версии документа */
    r = R('ingest', '--file', path.join(FX, 'prd-mini-v2.docx'), '--supersedes', 'S-001', '--said', '2026-09-26');
    const m = /добавлено (\d+), изменено (\d+), пропало (\d+)/.exec(r.out);
    check('ingest', '--supersedes: добавлено 1 (FR-04 чат), изменено 1 (FR-02), пропало 1 (термин)', r.code === 0 && m && m[1] === '1' && m[2] === '1' && m[3] === '1' && /\+ c\d+ \[feature FR-04\]/.test(r.out), m ? m[0] : r.out.slice(0, 160));

    /* чат и голосовое */
    r = R('ingest', '--file', path.join(FX, 'chat.txt'), '--kind', 'chat', '--said', '2026-09-27 10:00');
    const c3 = cands('S-003');
    check('ingest', 'чат: 6 атомов, «без градиентов» — запрет, телефон — факт', r.code === 0 && c3.length === 6 && c3.some((c) => c.kind === 'constraint' && /градиент/.test(c.text)) && c3.some((c) => c.kind === 'fact' && /Телефон/.test(c.text)), c3.map((c) => `${c.kind}:${short(c.text, 20)}`).join(' | '));
    r = R('ingest', '--file', path.join(FX, 'voice.md'), '--said', '2026-09-27 12:00');
    const c4 = cands('S-004');
    check('ingest', 'расшифровка whisper: вид voice, место — время', r.code === 0 && reg().sources[3].kind === 'voice' && c4.length === 2 && c4[1].loc === '⏱ 00:21', c4.map((c) => c.loc).join(', '));
    r = R('ingest', '--file', path.join(tmp, 'нет.ogg'));
    fs.writeFileSync(path.join(tmp, 'голос.ogg'), 'x'); r = R('ingest', '--file', path.join(tmp, 'голос.ogg'));
    check('ingest', 'аудио — отказ с командой whisper', r.code === 1 && /transcribe\.py/.test(r.out));

    /* add: взять, отклонить, своё */
    const n = (cs, pred) => cs.find(pred).n;
    const take = [...fr.map((c) => c.n), n(c1, (c) => c.kind === 'perf' && !c.flags.length), n(c1, (c) => c.kind === 'compat'), n(c1, (c) => c.kind === 'reliability'), ...c1.filter((c) => c.kind === 'tech').map((c) => c.n), ...c1.filter((c) => c.kind === 'glossary').map((c) => c.n)];
    r = R('add', '--from', 'S-001', '--take', take.join(','), '--page', '/');
    check('add', `--take ${take.length}: требования R-001…R-${String(take.length).padStart(3, '0')} с цитатой строки источника`, r.code === 0 && reg().items.length === take.length && q('R-001').ext === 'FR-01' && q('R-001').sources[0].quote.startsWith('FR-01 | Пользователь') && q('R-001').docAccept === 'Книги отображаются' && q('R-001').pages[0] === '/', `${reg().items.length} требований`);
    r = R('add', '--from', 'S-001', '--take', String(tpl[0].n));
    check('add', 'шум без --force не берётся (код 1)', r.code === 1 && /шум документа/.test(r.out));
    r = R('add', '--from', 'S-001', '--take', String(ppl[0].n), '--force');
    check('add', 'ФИО не берутся даже с --force', r.code === 1 && /личные данные/.test(r.out));
    const rest1 = c1.filter((c) => !c.decision && !take.includes(c.n)).map((c) => c.n);
    r = R('add', '--from', 'S-001', '--dismiss', rest1.join(','), '--why', 'метаданные, примеры шаблона, заглушки, контекст документа');
    check('add', `--dismiss ${rest1.length} с причиной; у S-001 не просмотренных нет`, r.code === 0 && /не просмотрено: 0|не взято из S-001/.test(r.out) && cands('S-001').every((c) => c.decision));
    const sim = c1.find((c) => /Что входит/.test(c.loc) && /Карточка/.test(c.text));
    r = R('add', '--from', 'S-001', '--take', String(sim.n), '--to', 'R-002', '--force');
    check('add', '--to: «Карточка книги» — второй источник FR-02', r.code === 0 && q('R-002').sources.length === 2 && q('R-002').ext === 'FR-02', `источников у R-002: ${q('R-002').sources.length}`);
    r = R('add', 'Тёмная тема, как в читальном зале', '--source', 'S-003', '--quote', 'тёмную тему', '--kind', 'style', '--page', '/');
    const idStyle = (/\+ (R-\d+)/.exec(r.out) || [])[1];
    check('add', 'своё: цитата найдена в источнике', r.code === 0 && idStyle && q(idStyle).sources[0].id === 'S-003');
    r = R('add', 'Скидка 20% всем', '--source', 'S-003', '--quote', 'скидка двадцать процентов', '--kind', 'fact');
    check('add', 'цитаты нет в источнике — отказ (код 1)', r.code === 1 && /цитаты нет/.test(r.out));
    r = R('add', 'Бегущая строка с жанрами', '--quote', 'бегущую строку с жанрами', '--kind', 'motion', '--page', '/');
    const idMarq = (/\+ (R-\d+)/.exec(r.out) || [])[1];
    r = R('add', 'Без градиентов', '--source', 'S-003', '--quote', 'Без градиентов', '--kind', 'constraint', '--page', '/');
    r = R('add', 'Телефон клуба в подвале', '--source', 'S-003', '--quote', 'Телефон клуба +7 000 000-00-00', '--kind', 'fact', '--page', '/', '--accept', "runtime: номер в подвале как у пользователя");
    const idPhone = (/\+ (R-\d+)/.exec(r.out) || [])[1];
    r = R('add', 'Отзывы участников — штуки три', '--source', 'S-004', '--quote', 'Отзывы участников — штуки три', '--kind', 'content', '--page', '/');
    const idRev = (/\+ (R-\d+)/.exec(r.out) || [])[1];
    check('add', 'голосовое: цитата с пометкой voice', idRev && q(idRev).sources[0].quoteFrom === 'voice');
    r = R('add', 'Форма заявки в клуб', '--source', 'S-003', '--quote', 'форма заявки в клуб', '--kind', 'feature', '--page', '/join', '--priority', 'must');
    const idForm = (/\+ (R-\d+)/.exec(r.out) || [])[1];

    /* критерии */
    r = R('accept', 'R-001', '--add', 'runtime: поиск «Дюна» показывает карточки', '--how', 'runtime.mjs {url} --out {run} --tag r001 --type "#q=Дюна" --assert "/*R-001.a*/ document.querySelectorAll(\'.book\').length>0"');
    r = R('accept', 'R-001', '--add', 'mobile: то же на 390 без переполнения', '--how', 'runtime.mjs {url} --out {run} --tag r001m --viewport mobile --assert "/*R-001.b*/ document.documentElement.scrollWidth<=innerWidth"');
    const perfId = reg().items.find((x) => x.kind === 'perf').id; const compatId = reg().items.find((x) => x.kind === 'compat').id; const relId = reg().items.find((x) => x.kind === 'reliability').id;
    r = R('accept', perfId, '--add', 'perf: LCP до 2 с на телефоне, медиана трёх', '--metric', 'LCP<=2000', '--how', 'perf.mjs {url} --out {run} --tag r-perf --runs 3');
    check('accept', 'критерии: маркер R-001.a, --metric, --how', r.code === 0 && q('R-001').accept.length === 2 && q('R-001').accept[0].marker === 'R-001.a' && q(perfId).accept[0].metric === 'LCP<=2000');
    r = R('accept', compatId, '--add', 'manual: Edge', '--reason', '');
    check('accept', 'manual без --reason — отказ', r.code !== 0);

    /* conflicts */
    r = R('conflicts');
    check('conflicts', 'вне скилла: комната (FR-03) и надёжность одним вопросом', /\? вне скилла\s+R-003 /.test(r.out) && /FR-03/.test(r.out) && /Эти функции требуют сервера/.test(r.out), short((r.out.match(/\? вне скилла.*/) || [''])[0], 90));
    check('conflicts', 'стек: React и PostgreSQL', /\? стек/.test(r.out) && /React/.test(r.out));
    check('conflicts', 'запрет вкуса: бегущая строка (журнал вкуса)', new RegExp(`\\? запрет вкуса\\s+${idMarq}`).test(r.out) && /бегущие строки не надо/.test(r.out));
    check('conflicts', 'проверка невозможна: Edge и надёжность', new RegExp(`! проверка здесь невозможна ${compatId}`).test(r.out) && new RegExp(`! проверка здесь невозможна ${relId}`).test(r.out));
    check('conflicts', 'нужен факт: отзывы; ПДн: форма без согласия', new RegExp(`нужен факт\\s+${idRev}`).test(r.out) && new RegExp(`ПДн\\s+${idForm}`).test(r.out));
    check('conflicts', 'между требованиями: тема и «без градиентов» не спорят', !/между требованиями/.test(r.out));
    r = R('ask', reg().items.filter((x) => x.hints.some((h) => /сервер/.test(h))).map((x) => x.id).join(','), 'Клуб требует сервера. Как делаем?', '--option', 'демо в браузере с пометкой «демо»', '--option', 'отдельная работа');
    r = R('assume', 'Q-001', 'демо в браузере с пометкой «демо» рядом с действием и в подвале');
    r = R('ack', compatId, 'manual', '--why', 'Edge проверит пользователь');
    r = R('conflicts', '--strict');
    check('conflicts', 'допущение закрывает «вне скилла», ack скрывает, --strict — код 1', /· вне скилла/.test(r.out) && /решено: Q-001/.test(r.out) && !new RegExp(`проверка здесь невозможна ${compatId}`).test(r.out) && r.code === 1);

    /* plan и связь с журналом */
    r = R('plan', 'R-001', 'Поиск книг на главной', '--area', 'search');
    const s1 = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8'));
    check('plan', 'задача в state.json и связь с R-001, приоритет P1 из must-функции', r.code === 0 && s1.tasks.length === 1 && s1.tasks[0].priority === 'P1' && q('R-001').tasks[0] === 1, r.out.split('\n')[0]);
    r = R('link', idPhone, '1');
    r = R('link', 'R-001', '99');
    check('plan', 'link на несуществующую задачу — отказ', r.code === 1 && /нет задачи #99/.test(r.out));
    r = R('list', '--open');
    check('plan', 'list --open: без задачи и без критерия', r.code === 0 && /нет задачи/.test(r.out) && !/^R-001 /m.test(r.out));

    /* доказательства: протоколы с маркером, probe, устаревание по смене требования */
    fs.mkdirSync(path.join(run, 'runtime'), { recursive: true });
    const proto = (tag, vp, marker, status = 'OK') => fs.writeFileSync(path.join(run, 'runtime', `${tag}.json`), JSON.stringify({ url: 'http://localhost:4221/', viewport: vp, startedAt: new Date().toISOString(), steps: [{ status: 'OK', kind: 'load', what: 'загрузка' }, { status, kind: 'assert', what: `assert /*${marker}*/ document.title.length>0` }], verdict: status }));
    proto('r001', 'desktop', 'R-001.a'); proto('r001m', 'mobile', 'R-001.b'); proto(`${idPhone.toLowerCase()}`, 'desktop', `${idPhone}.a`);
    ST('set', '1', 'impl=DONE');
    r = R('report');
    check('report', 'R-001: оба критерия проверены по маркеру — выполнено', new RegExp(`\\| R-001 \\|[^\\n]*a runtime ✓ · b mobile ✓ \\| выполнено \\|`).test(r.out), short((r.out.match(/\| R-001 \|.*/) || [''])[0], 140));
    r = ST('set', '1', 'runtime=VERIFIED', '--evidence', 'runtime/r001.json#/*R-001.a*/');
    check('state', 'set VERIFIED по шагу с маркером', r.code === 0, short(r.out, 100));
    r = ST('show');
    check('state', 'show: требования у задачи и строка «Требования»', /\| 1 \| P1 \| Поиск книг на главной \[R-001, R-\d+\]/.test(r.out) && /Требования \(requirements\.json\): активных/.test(r.out));
    r = R('change', 'R-001', '--text', 'Ищет книгу по названию и автору', '--source', 'S-003', '--quote', 'и по автору тоже');
    check('change', 'смысл изменён словами пользователя: ред. 2, needsReview, влияние', r.code === 0 && q('R-001').rev === 2 && q('R-001').needsReview && /Задевает:/.test(r.out) && /переоткрыть: state\.mjs/.test(r.out));
    r = R('report');
    check('change', 'доказательство до смены — «устарело (требование изменено)»', /\| R-001 \|[^\n]*устарело \(требование изменено\)/.test(r.out));
    r = ST('show');
    check('state', 'state.mjs show: FAIL «требование изменено» и пересмотреть R-001', /требование изменено/.test(r.out) && /пересмотреть после изменения 1 \(R-001\)/.test(r.out) && /^FAIL/m.test(r.out));
    r = ST('set', '1', 'runtime=VERIFIED', '--evidence', 'runtime/r001.json#/*R-001.a*/');
    check('state', 'set VERIFIED со старым доказательством после смены — отказ', r.code === 1 && /требование R-001 изменено/.test(r.out));
    r = R('change', 'R-001', '--page', '/,/search', '--self', '--why', 'раскладка: поиск и на своей странице');
    check('change', '--self: редакция прежняя', r.code === 0 && q('R-001').rev === 2);
    proto('r001', 'desktop', 'R-001.a'); proto('r001m', 'mobile', 'R-001.b');
    r = R('review', 'R-001', '--note', 'задача #1 та же, критерии годятся');
    r = R('impact', 'R-001');
    check('impact', 'задачи, страницы, критерии, язык сайта', r.code === 0 && /задача\s+#1/.test(r.out) && /страницы \/, \/search/.test(r.out) && /язык сайта не задет/.test(r.out));
    r = R('impact', '--text', 'Бегущую строку не надо');
    check('impact', '--text: похожее требование и другая полярность', new RegExp(`похоже на ${idMarq}`).test(r.out) && /полярность другая/.test(r.out));

    /* новое сообщение спорит со старым; status */
    r = R('ingest', '--text', 'Бегущую строку всё-таки не надо, лучше спокойно. И базу данных пока не нужно.', '--said', '2026-09-28 09:00');
    r = R('add', 'Без бегущей строки', '--source', 'S-005', '--quote', 'Бегущую строку всё-таки не надо', '--kind', 'constraint', '--page', '/');
    const idNo = (/\+ (R-\d+)/.exec(r.out) || [])[1];
    r = R('conflicts');
    check('conflicts', 'между требованиями: новое «не надо» против старого — предложено superseded', new RegExp(`\\? между требованиями ${idMarq}[^\\n]*${idNo}`).test(r.out) && new RegExp(`status ${idMarq} superseded --by ${idNo}`).test(r.out), short((r.out.match(/\? между требованиями.*/) || [''])[0], 110));
    r = R('status', 'R-008', 'dropped');
    check('status', 'dropped без слов пользователя — отказ', r.code !== 0);
    r = R('status', 'R-008', 'dropped', '--quote', 'базу данных пока не нужно');
    check('status', 'dropped словами пользователя — с источником и датой', r.code === 0 && q('R-008').decision === 'dropped' && q('R-008').decisionSource === 'S-005');
    r = R('status', idMarq, 'superseded');
    check('status', 'superseded без --by — отказ', r.code === 2);
    r = R('status', idMarq, 'superseded', '--by', idNo);
    check('status', 'superseded --by: связь в обе стороны', r.code === 0 && q(idMarq).supersededBy === idNo && q(idNo).supersedes === idMarq);

    /* checks */
    r = R('checks', '--url', 'http://localhost:4221/', '--sh', path.join(run, 'checks.sh'), '--journal', path.join(run, 'journal.sh'));
    const sh = fs.existsSync(path.join(run, 'checks.sh')) ? fs.readFileSync(path.join(run, 'checks.sh'), 'utf8') : ''; const js = fs.existsSync(path.join(run, 'journal.sh')) ? fs.readFileSync(path.join(run, 'journal.sh'), 'utf8') : '';
    check('checks', 'checks.sh: команды из критериев, {url} и {run} подставлены', /node "\$S\/runtime\.mjs" "\$\{U\}" --out "\$\{R\}" --tag r001 /.test(sh) && /node "\$S\/perf\.mjs"/.test(sh), `${(sh.match(/^node /gm) || []).length} команд`);
    check('checks', 'journal.sh: set по маркеру для задачи #1', /set 1 runtime=VERIFIED --evidence 'runtime\/r001\.json#\/\*R-001\.a\*\/'/.test(js) && /set 1 mobile=VERIFIED --evidence 'runtime\/r001m\.json#\/\*R-001\.b\*\/'/.test(js));

    /* check и отчёт */
    r = R('check');
    check('check', 'FAIL: must без критерия; WARN: вопросы и кандидаты', r.code === 1 && /активное must без критерия/.test(r.out) && /кандидатов не просмотрено/.test(r.out));
    r = R('report', '--plan');
    check('report', 'шапка с числами, план, не взятое, вопросы, ждём от вас, история', /^Источников 5 \(документ 2, сообщение 2, голосовое 1\) · требований 17: выполнено 2,/m.test(r.out) && /### План из реестра/.test(r.out) && /Не взято из документов: \d+/.test(r.out) && /\*\*допущение\*\*/.test(r.out) && /Ждём от вас: .*отзывы/.test(r.out) && /### История изменений/.test(r.out) && /снято/.test(r.out), short((r.out.match(/^Источников.*/m) || [''])[0], 150));
    check('report', 'ФИО нет ни в реестре, ни в отчёте', !/Тестовый|Примерова/.test(r.out + fs.readFileSync(path.join(run, 'requirements.json'), 'utf8') + fs.readFileSync(path.join(run, 'requirements.md'), 'utf8')));
    r = R('md');
    check('report', 'requirements.md пересобран', r.code === 0 && /# Требования/.test(fs.readFileSync(path.join(run, 'requirements.md'), 'utf8')));
    /* 06.10 — паспорт донора из сводки разведки с меткой: discover --tag donor пишет discovery-donor.md */
    { const pq = reg().items.find((x) => active(x) && !isContext(x) && ['style', 'motion', 'media', 'content'].includes(x.kind) && !NEG.test(x.text));
      const pf = path.join(run, 'discovery-donor.md'); const before = R('conflicts').out;
      fs.writeFileSync(pf, `# Разведка\n\n**Чего донор не делает никогда (числами)**\n\n- ${pq ? pq.text : 'нет требования'}: 0 из 12 секций\n\n## Дальше\n`);
      r = R('conflicts'); fs.rmSync(pf, { force: true });
      check('conflicts', 'паспорт: «никогда» из сводки разведки с меткой (discovery-donor.md) читается', !!pq && !/discovery-donor\.md/.test(before) && new RegExp(`\\? паспорт\\s+${pq && pq.id} `).test(r.out) && /против «никогда»/.test(r.out) && /\(discovery-donor\.md\)/.test(r.out), short((r.out.match(/\? паспорт.*/) || [''])[0], 110)); }
    r = R('bogus');
    check('args', 'неизвестная команда — код 2', r.code === 2);
  } catch (e) { check('selftest', 'упал', false, e.stack); }
  const bad = results.filter((x) => !x).length;
  let kept = true; if (!bad) { try { fs.rmSync(tmp, { recursive: true, force: true }); kept = false; } catch { /* пусть лежит */ } }
  console.log(`${bad ? 'FAIL' : 'OK'}: проверок ${results.length}, не прошло ${bad}${kept ? ` · прогон оставлен: ${tmp}` : ''}`);
  return bad ? 1 : 0;
}

if (opt.selftest || pos[0] === 'selftest' || pos[1] === 'selftest') process.exit(selftest());
await main();
