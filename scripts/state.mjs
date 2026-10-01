#!/usr/bin/env node
/**
 * Журнал состояния переработки: что решено сделать, что сделано, что
 * реально проверено. Одна запись — одна задача, у каждой пять статусов,
 * потому что «написал код», «открыл в браузере и работает», «посмотрел и
 * красиво», «на телефоне тоже» и «быстро» — разные вещи.
 *
 *   node state.mjs <папка прогона> init <url|-> "<запрос>" --site <папка сайта> --mode rework|mirror|donor|new [--donor <адрес донора>] [--force]
 *   node state.mjs <папка> meta [--site <папка сайта>] [--mode rework|mirror|donor|new] [--url <адрес>] [--donor <адрес>|none] [--site-ignore "data,*.json"]
 *   node state.mjs <папка> add "<задача>" [--priority P2] [--area hero|mobile|3d|content|motion|...]
 *   node state.mjs <папка> set <id> impl=DONE runtime=VERIFIED --evidence runtime/desktop.json#5
 *   node state.mjs <папка> set <id> visual=VERIFIED --evidence after/home-mobile-first.png mobile=NA --note "почему"
 *   node state.mjs <папка> set <id>[,<id>…] impl=DOING priority=P1
 *   node state.mjs <папка> stage <этап> done|active|todo|skipped
 *   node state.mjs <папка> show [--strict] [--json]
 *   node state.mjs <папка> probe <файл[#шаг]>… --check runtime|visual|mobile|perf [--task <id>] [--json]
 *   node state.mjs --help
 *   node state.mjs --selftest   журнал во временной папке: режим rework --donor (этапы, блок «Сверки», WARN
 *                               без сверок при начатом отчёте), отказы --donor в donor/new, подсказка
 *                               donor со своей папкой, причина NA к полю, strict. Код 1 — не прошло.
 *
 * Поля задачи (одна задача — пять статусов: реализация и четыре проверки):
 *   impl                        TODO → DOING → DONE; ещё BLOCKED и DROPPED (снята).
 *                               IN_PROGRESS из старых журналов читается и принимается как DOING.
 *   runtime, visual, mobile, perf   NOT_CHECKED (по умолчанию), VERIFIED, FAILED, NEEDS_WORK, NA
 *                               runtime — в браузере работает (клики, ввод, консоль),
 *                               visual — посмотрено глазами, mobile — на телефоне, perf — скорость.
 *   priority                    P0 сломано · P1 крупная проблема UX · P2 крупная визуальная ·
 *                               P3 тексты · P4 движение · P5 полировка (по умолчанию P2)
 * ANALYZED — не поле задачи, а этап (stage discovered/design/tech …).
 * Этапы: requirements discovered donor browser design direction tech tools tokens plan ui content
 *   assets three motion runtime visual mobile perf a11y polish compare report; отметки done ✓ · active → ·
 *   todo · · skipped –. requirements (реестр требований) и direction (направление выбрано) —
 *   этапы режима new: в rework, mirror и donor init ставит им skipped, и show их не печатает;
 *   реестр понадобился и там (источников требований больше одного) — stage requirements active,
 *   тогда этап виден. В старом журнале этих этапов нет: show печатает чек-лист как раньше,
 *   stage их принимает.
 *   donor (донор снят — эталон языка) и compare (сверки перед отчётом) — этапы режима «свой сайт в
 *   языке донора» (--donor); compare виден и в режиме donor (сверка с донором обязательна). В
 *   остальных режимах init ставит им skipped, и show их не печатает, пока их не начали.
 * Режим прогона (--mode) пишется в журнал и печатается в show — для отчёта.
 *
 * Свой сайт с исходниками в языке донора (переделка «Эпицентра» в языке mamuka.rest):
 *   init <адрес своего сайта> "<запрос>" --site <исходники> --mode rework --donor <адрес донора>
 *   (или mirror — своё зеркало). Журнал хранит оба адреса: «до» — свой сайт (снимки shots.mjs в <прогон>/before),
 *   эталон — донор (reference/donor-mode.md §1). show печатает блок «Сверки»: «до/после» своего
 *   сайта (before/, after/, diff/diff.json) и донор (donor/, donor/design, donor/texture, cliche
 *   baseline, motion/donor-*, decor/donor*) со сверкой с ним (verify --json, texture-compare/compare.json,
 *   cliche/cliche*.json, motion/compare*.json, decor/compare*.json) — что есть в папке прогона и чего
 *   нет; когда этап report начат, а сверки нет, — итог WARN. Протокол с ошибкой или «сверено 0» сверкой
 *   не считается (строка «не в счёт»); сверка движения и фона под своим --tag узнаётся по полям протокола.
 *   --mode donor с папкой сайта вне папки прогона — WARN: «новый сайт по донору» собирается в
 *   <прогон>/site, а свои исходники — это rework --donor.
 *
 * Флаги:
 *   --site <папка>     папка с файлами сайта: исходники (rework), зеркало <прогон>/mirror
 *                      (mirror), новый сайт (donor, new — <прогон>/site; в new init создаёт её
 *                      сам, если она внутри папки прогона). По времени её файлов проверяется,
 *                      что доказательство снято после последней правки. Без неё VERIFIED
 *                      не ставится. Не учитываются node_modules, .git, кэши сборщиков,
 *                      *.log, базы (*.db, *.sqlite, -wal, -shm) и папки прогонов.
 *   --mode <режим>     rework — переработка по исходникам, mirror — через зеркало
 *                      (исходников нет), donor — новый сайт по донору, new — сайт с нуля
 *                      по требованиям (без донора; с референсами или без). Идёт в отчёт.
 *   адрес «-» в init   сайта ещё нет — только с --mode new; когда сайт поднят (serve.mjs):
 *                      meta --url http://localhost:<порт>/
 *   --url <адрес>      (meta) адрес сайта: http://, https:// или file://
 *   --donor <адрес>    (init, meta) адрес донора, в языке которого переделывается свой сайт: только
 *                      с --mode rework или mirror (в режиме donor донор — сам адрес журнала);
 *                      meta --donor none — убрать донора.
 *   --site-ignore      что ещё не считать правкой сайта: имена папок и файлов или маски
 *                      через запятую («data,uploads,*.json»). Хранится в журнале.
 *   --force            init поверх существующего журнала; старый сохраняется рядом.
 *   --evidence <файл[#шаг]>   доказательство для всех VERIFIED этого вызова.
 *   --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf
 *                      своё доказательство для одной проверки (главнее --evidence).
 *   --note "…"         заметка к задаче; для NA — обязательная причина. Без текста — ошибка.
 *                      Заметку, которая начинается с «--», писать так: --note="--scroll прошёл".
 *                      В вызове с NA заметка — причина NA: пишется к этим полям (proof.<поле>.note),
 *                      основная заметка задачи не меняется (одинаково для всех полей); show и set
 *                      печатают её рядом: «… · perf NA: только кегли». Без NA — основная заметка.
 *   --strict           (show) код выхода 1, если итог не OK.
 *   --json             (show) журнал с состоянием каждой клетки одним JSON: url, режим, папка
 *                      сайта и её последняя правка, этапы, задачи (cells: статус, cat, label,
 *                      доказательство, problems, warns; reqs — привязанные требования).
 *                      (probe) результат проверки доказательства JSON-ом.
 *   --check, --task    (probe) какой проверкой мерить доказательство и для какой задачи
 *                      (с задачей учитывается и правило «требование изменено»).
 *   --priority, --area (add) приоритет P0…P5 и область задачи.
 *   --help             эта справка (журнал не читается и не пишется).
 * Значения можно писать и так: --note="…", --evidence=runtime/x.json#3. Если сразу за
 * --note, --evidence, --site и другими флагами со значением стоит другой флаг скрипта
 * («--note --evidence x.json»), это ошибка «без значения», а не заметка «--evidence».
 *
 * Правила статусов (отказ — код 1, в журнал ничего не пишется):
 *   VERIFIED — только с --evidence. Доказательство — протокол скрипта (.json) или снимок
 *     (.png, .jpg, .webp, .avif, .gif), путь от папки прогона, от текущей папки или полный.
 *     Файл есть и не пустой; протокол с вердиктом FAIL не годится — ни целиком, ни шагом
 *     (вердикт — verdict, иначе худший статус шагов); если указан #шаг (номер с 1 или часть
 *     названия шага, для perf — название метрики), этот шаг есть и он не FAIL; снято позже
 *     последней правки файлов сайта (время протокола — startedAt/takenAt, если оно раньше
 *     времени файла). runtime и perf — только протокол .json; visual и mobile — протокол
 *     или снимок; для mobile протокол должен быть снят на экране уже 1024 px (у снимка
 *     ширина берётся из shots.json рядом, если он есть). Доказательство не может лежать
 *     в папке сайта. Шаг-запись (eval без --expect, снимок) — WARN: он OK при любом
 *     результате; утверждение — --assert или --eval … --expect ….
 *   VERIFIED ставится одной задаче за вызов: у каждой задачи своё доказательство, пачкой
 *     задним числом не проставить. Протокол .json, который уже стоит у другой задачи для
 *     той же проверки, второй раз принимается только с #шагом; тот же файл#шаг или тот же
 *     снимок у другой задачи — WARN.
 *   NA — только с --note: причина, почему проверка к задаче не относится (пишется к полю, не
 *     вместо заметки задачи).
 *   FAILED и NEEDS_WORK — --evidence по желанию (файл должен существовать).
 *   У каждой проверки хранится своё время и доказательство (proof в state.json:
 *   status, at, evidence {file, step, kind, verdict, takenAt, siteEditAt, generator, …}, note).
 *
 * Версия скрипта. Протоколы скриптов скилла несут поле generator (lib.writeJson): имя
 * скрипта, его последний коммит в git скилла, были ли незакоммиченные правки, то же для
 * lib.mjs и подключаемых модулей (generator.deps: texture.mjs у a11y и perf, taste.mjs у
 * cliche, extract.mjs у discover). Протокол, снятый другой версией (коммит скрипта, lib.mjs
 * или модуля из deps не тот, что сейчас рядом со state.mjs, или в момент съёмки либо сейчас в файле незакоммиченные правки),
 * принимается, но с WARN «протокол снят другой версией скрипта (<коммит> против <текущий>)
 * — перепрогнать»: инструмент менялся между замером и отметкой. Протокол без generator
 * (снят раньше) принимается как прежде; в show у него пометка «версия скрипта неизвестна».
 *
 * Требования. Если рядом с журналом лежит реестр requirements.json (requirements.mjs), он
 * только читается: задача, привязанная к требованию, которое изменили (changedAt, новая
 * редакция) позже, чем снято доказательство, — «устарело (требование изменено)»: VERIFIED
 * с таким доказательством не ставится, show даёт FAIL, как после правки файлов сайта.
 * Снятые (dropped, superseded, out) требования не учитываются.
 *
 * probe — проверить доказательство без записи (им пользуется requirements.mjs): те же
 * правила, что у set … VERIFIED; несколько файлов за вызов — одна проверка --check на все,
 * с --json — массив. Код 1, если хоть одно не годится.
 *
 * Пишет: <папка>/state.json; init --force сохраняет старый журнал в state.<время>.json.
 * Код выхода: 0 — готово (и после --help); 1 — отказ (ошибка в аргументах, доказательство
 * не годится, нет журнала) или show --strict с итогом не OK.
 *
 * show печатает адрес, режим, папку сайта и её последнюю правку, чек-лист этапов, таблицу
 * задач (с номерами требований), список доказательств и итог по проверкам сделанных задач:
 * «проверено N, неприменимо M, без доказательства K, устарело S, …». Доказательство, снятое
 * раньше последней правки сайта или изменения связанного требования, помечается «устарело»:
 * проверку прогнать заново и поставить VERIFIED ещё раз. С реестром — строка «Требования:
 * активных, без задачи, пересмотреть после изменения, вопросов без ответа».
 * Итог FAIL — есть отметки без доказательства или устаревшие; WARN — задачи P0–P2 ещё не
 * проверены до конца, у активного must-требования нет задачи либо его надо пересмотреть или
 * в режиме new нет реестра требований; OK — всё сделанное проверено.
 */
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, writeJson, parseViewport, codeVersion } from './lib.mjs';

const IMPL = ['TODO', 'DOING', 'DONE', 'BLOCKED', 'DROPPED'];
const IMPL_ALIAS = { IN_PROGRESS: 'DOING', 'IN-PROGRESS': 'DOING' };
const CHECK = ['NOT_CHECKED', 'VERIFIED', 'FAILED', 'NEEDS_WORK', 'NA'];
const CHECKS = ['runtime', 'visual', 'mobile', 'perf'];
const PRIO = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const MODES = { rework: 'переработка по исходникам', mirror: 'переработка через зеркало (исходников нет)', donor: 'новый сайт по донору', new: 'новый сайт с нуля по требованиям (без донора; с референсами или без)' };
/* этапы только режима new: в остальных режимах init ставит им skipped, в старых журналах их нет */
const NEW_ONLY = ['requirements', 'direction'];
/* этапы режима «свой сайт в языке донора» (--donor); compare — и режима donor */
const DONOR_ONLY = ['donor', 'compare'];
const stageShown = (s, k) => (k === 'donor' ? !!s.donor : k === 'compare' ? !!s.donor || s.mode === 'donor' : true);
const STAGES = [
  ['requirements', 'Требования собраны и разобраны'],
  ['discovered', 'Сайт разведан'], ['donor', 'Донор снят — эталон языка (discover, extract, texture, cliche baseline, motion, bgdecor)'],
  ['browser', 'Открыт в браузере, консоль и сеть сняты'], ['design', 'Дизайн разобран глазами'],
  ['direction', 'Направление выбрано (эскизы показаны)'],
  ['tech', 'Техническая архитектура понята'], ['tools', 'Инструменты выбраны'], ['tokens', 'Дизайн-система снята'],
  ['plan', 'План с приоритетами составлен'], ['ui', 'Вёрстка и UI'], ['content', 'Тексты'], ['assets', 'Картинки и графика'],
  ['three', '3D'], ['motion', 'Движение'], ['runtime', 'Проверка в браузере'], ['visual', 'Визуальная проверка'],
  ['mobile', 'Мобильная проверка'], ['perf', 'Скорость'], ['a11y', 'Доступность'], ['polish', 'Полировка'],
  ['compare', 'Сверки перед отчётом: с донором и «до/после» своего сайта'], ['report', 'Итоговый отчёт'],
];
const MARK = { done: '✓', active: '→', todo: '·', skipped: '–' };
const IMG_EXT = /\.(png|jpe?g|webp|avif|gif)$/i;
/* что правкой сайта не считается */
const IGNORE_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '.cache', '.parcel-cache', '.turbo', '.vite', '.next', '.nuxt', '.svelte-kit', '.angular', '.idea', '.vscode', '__pycache__']);
const IGNORE_FILE = /(\.(log|db|sqlite3?|tmp|temp|swp|swo|pid|lock)$|-(wal|shm|journal)$|~$|^\.DS_Store$|^Thumbs\.db$|^desktop\.ini$)/i;

const argv = process.argv.slice(2);
/* у остальных скриптов папка прогона — --out, у журнала — первый аргумент: путают («Зелёный уголок», 01.10) */
if (argv.some((a) => a === '--out' || a.startsWith('--out=') || a === '--run' || a.startsWith('--run='))) {
  console.error('state.mjs: папка прогона — первым аргументом (state.mjs <папка> show), а не --out или --run, как у остальных скриптов.');
  process.exit(1);
}
const VALUE_KEYS = ['note', 'evidence', ...CHECKS.map((c) => `evidence-${c}`), 'site', 'mode', 'site-ignore', 'priority', 'area', 'url', 'check', 'task', 'donor'];
const FLAG_KEYS = ['force', 'strict', 'help', 'h', 'json', 'selftest'];
/* strict: неизвестный флаг — отказ с подсказкой (раньше WARN, и init --donor молча терял донора) */
const { pos, opt } = parseArgs(argv, { values: VALUE_KEYS, flags: FLAG_KEYS, commands: ['init', 'meta', 'add', 'set', 'stage', 'show', 'probe'], strict: true });
if (opt.help || opt.h || pos.includes('-h')) {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
  process.exit(0);
}
const die = (m) => { console.error(m); process.exit(1); };
/* «--note --evidence x.json»: values забирает следующий флаг как значение — это забытое значение, а не заметка.
   Заметку, которая начинается с «--», можно передать как --note="--scroll прошёл" или --note "--scroll прошёл". */
const KNOWN = new Set([...VALUE_KEYS, ...FLAG_KEYS]);
for (let i = 0; i < argv.length - 1; i++) {
  const k = /^--([\w-]+)$/.exec(argv[i]); if (!k || !VALUE_KEYS.includes(k[1])) continue;
  const f = /^--([A-Za-z][\w-]*)(=.*)?$/.exec(String(argv[i + 1]));
  if (f && KNOWN.has(f[1])) die(`--${k[1]} без значения: следом стоит флаг --${f[1]}. ${k[1] === 'note' ? 'Напишите текст заметки; если она начинается с «--» — так: --note="--scroll прошёл"' : `Нужно: --${k[1]} <значение>`}`);
}
if (opt.selftest) process.exit(selftest());
const [dir, cmd, ...rest] = pos;
if (!dir || !cmd) die('Нужно: node state.mjs <папка> init|meta|add|set|stage|show|probe ... (--help — справка)');
const runRoot = path.resolve(dir);
const file = path.join(runRoot, 'state.json');
const fmt = (ms) => new Date(ms).toLocaleString('sv-SE');
/* настоящий путь: раскрывает короткие имена Windows (C225~1) и ссылки, иначе «внутри папки» не сравнить */
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const norm = (p) => { const r = real(p); return process.platform === 'win32' ? r.toLowerCase() : r; };
const inside = (child, parent) => { const rel = path.relative(norm(parent), norm(child)); return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel)); };
let st = readJson(file);
/* журнал — не протокол: без поля generator (версия скрипта пишется только в протоколы) */
const JOURNAL = { generator: false };

/* ---------- папка сайта: когда её правили в последний раз ---------- */

const globRe = (p) => new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
function isJournal(dirPath) {
  const j = readJson(path.join(dirPath, 'state.json'));
  return !!(j && typeof j === 'object' && j.stages && Array.isArray(j.tasks));
}
let latestCache;
function siteLatest() {
  if (latestCache !== undefined) return latestCache;
  if (!st.site || !fs.existsSync(st.site)) return (latestCache = null);
  const root = real(st.site);
  const pats = (st.siteIgnore || []).map(globRe);
  const res = { file: null, mtimeMs: 0, files: 0, capped: false };
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    if (d !== root && (inside(runRoot, d) ? norm(d) === norm(runRoot) : isJournal(d))) continue; // папки прогонов — не сайт
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (pats.some((re) => re.test(e.name) || re.test(rel))) continue;
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name)) stack.push(full); continue; }
      if (!e.isFile() || IGNORE_FILE.test(e.name)) continue;
      let s; try { s = fs.statSync(full); } catch { continue; }
      res.files++;
      if (s.mtimeMs > res.mtimeMs) { res.mtimeMs = s.mtimeMs; res.file = rel; }
      if (res.files >= 50000) { res.capped = true; stack.length = 0; break; }
    }
  }
  return (latestCache = res);
}

/* ---------- требования (requirements.json рядом с журналом): только чтение ---------- */

let reqCache;
function reqRegistry() {
  if (reqCache === undefined) { const j = readJson(path.join(runRoot, 'requirements.json')); reqCache = j && Array.isArray(j.items) ? j : null; }
  return reqCache;
}
const REQ_GONE = ['dropped', 'superseded', 'out'];
/* действующие требования, к которым привязана задача */
const reqsOfTask = (t) => { const r = reqRegistry(); return r && t ? r.items.filter((q) => Array.isArray(q.tasks) && q.tasks.map(Number).includes(Number(t.id)) && !REQ_GONE.includes(q.decision)) : []; };
const reqIds = (t) => reqsOfTask(t).map((q) => q.id);

/* ---------- доказательство ---------- */

function resolveEvidencePath(p) {
  if (path.isAbsolute(p)) return p;
  const a = path.resolve(runRoot, p); if (fs.existsSync(a)) return a;
  const b = path.resolve(process.cwd(), p); if (fs.existsSync(b)) return b;
  return a;
}
const storePath = (abs) => (inside(abs, runRoot) ? path.relative(real(runRoot), abs) : abs).split(path.sep).join('/');
const sniffImage = (abs) => {
  try {
    const fd = fs.openSync(abs, 'r'); const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd);
    return (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') || (b[0] === 0xff && b[1] === 0xd8) || (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP')
      || b.toString('latin1', 0, 3) === 'GIF' || b.toString('latin1', 4, 8) === 'ftyp';
  } catch { return false; }
};
const RANK = { FAIL: 3, WARN: 2, OK: 1 };
const statusOf = (x) => String((x && (x.status || x.verdict)) || '').toUpperCase();
/* пункты протокола, у которых есть статус: steps (runtime), lines (a11y), checks (perf) */
function protocolItems(j) {
  for (const k of ['steps', 'lines']) if (Array.isArray(j[k])) return j[k].map((x, i) => ({ n: i + 1, label: String(x.what || x.name || x.title || ''), status: statusOf(x), kind: x.kind || null }));
  if (Array.isArray(j.checks)) return j.checks.map((x, i) => ({ n: i + 1, label: String(x.what || x.name || x.title || ''), status: statusOf(x) }));
  if (j.checks && typeof j.checks === 'object') return Object.entries(j.checks).map(([k, x], i) => ({ n: i + 1, label: k, status: statusOf(x) }));
  return [];
}
function findStep(items, spec) {
  if (/^\d+$/.test(spec)) { const it = items[Number(spec) - 1]; return it ? { it } : { err: `шага ${spec} нет: шагов в протоколе: ${items.length}` }; }
  const q = spec.toLowerCase();
  const exact = items.filter((x) => x.label.toLowerCase() === q);
  const hits = exact.length ? exact : items.filter((x) => x.label.toLowerCase().includes(q));
  if (hits.length === 1) return { it: hits[0] };
  if (!hits.length) return { err: `шага «${spec}» нет` };
  return { err: `«${spec}» подходит к ${hits.length} шагам — укажите номер: ${hits.slice(0, 6).map((x) => `#${x.n} ${x.label.slice(0, 40)}`).join('; ')}` };
}

/* ---------- версия скрипта, снявшего протокол ---------- */

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
let currentVersions;
/* ключ зависимости с «/» (generator.deps) — путь от папки скиллов: site-rework/scripts/texture.mjs,
   design-reference/scripts/extract.mjs; полный путь (модуль вне папки скиллов) — как есть */
const SKILLS_ROOT = path.dirname(path.dirname(SCRIPTS_DIR));
const depVersions = new Map();
/* текущая версия файла скилла по имени (runtime.mjs, lib.mjs) или по ключу зависимости: git — один раз на процесс, на все скрипты сразу */
function currentVersion(name) {
  if (/[\\/]/.test(String(name))) {
    if (!depVersions.has(name)) { const abs = path.resolve(SKILLS_ROOT, String(name)); depVersions.set(name, fs.existsSync(abs) ? codeVersion([abs])[abs] || null : null); }
    return depVersions.get(name);
  }
  if (!currentVersions) {
    let files = []; try { files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.mjs')).map((f) => path.join(SCRIPTS_DIR, f)); } catch { /* нет папки */ }
    currentVersions = Object.fromEntries(Object.entries(codeVersion(files)).map(([f, v]) => [path.basename(f), v]));
  }
  return Object.prototype.hasOwnProperty.call(currentVersions, name) ? currentVersions[name] : null;
}
const verLabel = (v) => (v.commit ? `${String(v.commit).slice(0, 7)}${v.dirty ? '+правки' : ''}` : v.dirty ? 'не в git' : '?');
/* коммит пишется полным хешем; старые протоколы — сокращённым (%h): сверяются по началу, иначе рост
   сокращения в git (7 → 8 знаков) дал бы всем старым протоколам ложное «другой версией» */
const sameCommit = (a, b) => !!a && !!b && (String(a).startsWith(String(b)) || String(b).startsWith(String(a)));
/**
 * Сверить generator протокола с файлами рядом со state.mjs.
 * → { gen: краткая запись для журнала | null, warn: текст | null, note: текст для show | null }.
 * WARN — коммит скрипта или lib.mjs другой, либо незакоммиченные правки при съёмке или сейчас.
 * Без generator или без git версия неизвестна: не WARN, а пометка в show.
 */
function versionCheck(g) {
  if (!g || typeof g !== 'object' || !g.script) return { gen: null, warn: null, note: 'версия скрипта неизвестна (протокол без generator)' };
  const name = path.basename(String(g.script));
  /* deps (с 28.09.2026) — подключаемые модули: texture.mjs у a11y и perf, taste.mjs у cliche, extract.mjs у discover */
  const deps = g.deps && typeof g.deps === 'object' && !Array.isArray(g.deps) ? Object.fromEntries(Object.entries(g.deps).map(([k, x]) => [k, { commit: x?.commit ?? null, dirty: x?.dirty ?? null }])) : null;
  const gen = { script: name, commit: g.commit ?? null, dirty: g.dirty ?? null, ...(g.lib && typeof g.lib === 'object' ? { lib: { commit: g.lib.commit ?? null, dirty: g.lib.dirty ?? null } } : {}), ...(deps && Object.keys(deps).length ? { deps } : {}) };
  const parts = [[name, gen], ...(gen.lib ? [['lib.mjs', gen.lib]] : []), ...Object.entries(gen.deps || {})];
  const diffs = []; const unknown = []; let wasDirty = false; let nowDirty = false;
  for (const [n, was] of parts) {
    const now = currentVersion(n);
    const short = /[\\/]/.test(n) ? n.split(/[\\/]/).pop() : n; /* зависимость — коротким именем: texture.mjs */
    if (was.commit == null && was.dirty == null) { unknown.push(`${short}: при съёмке git не было`); continue; }
    if (!now) { unknown.push(`${short}: ${short === n ? 'такого файла рядом со state.mjs нет' : `файла ${n} нет в папке скиллов`}`); continue; }
    if (now.commit == null && now.dirty == null) { unknown.push(`${short}: git сейчас недоступен`); continue; }
    if (was.dirty) wasDirty = true;
    if (now.dirty) nowDirty = true;
    if (!sameCommit(was.commit, now.commit) || was.dirty || now.dirty) diffs.push(`${short} ${verLabel(was)} против ${verLabel(now)}`);
  }
  return {
    gen,
    warn: diffs.length ? `протокол снят другой версией скрипта (${diffs.join('; ')}) — ${nowDirty ? 'в скрипте сейчас незакоммиченные правки: перепрогон этот WARN не снимет — сначала закоммитить скрипт, потом перепрогнать' : 'перепрогнать'}${wasDirty ? ' (снят с незакоммиченными правками: каким кодом, уже не восстановить)' : ''}` : null,
    note: unknown.length ? `версия скрипта неизвестна (${unknown.join('; ')})` : null,
  };
}

/**
 * Проверить доказательство. Возвращает { rec, problems: [{code, msg}], warns: [], notes: [] }.
 * notes — пометки только для show (например, «версия скрипта неизвестна»).
 * code: missing | type | noverdict | fail | step | vp | nosite | inside | stale | reqchange.
 * task — задача, которую доказательство подтверждает: с ней ещё сверка со временем изменения
 * её действующих требований (reqchange).
 */
function checkEvidence(spec, check, { lenient = false, task = null } = {}) {
  const problems = []; const warns = []; const notes = [];
  const P = (code, msg) => problems.push({ code, msg });
  const m = /^(.*?\.(?:json|png|jpe?g|webp|avif|gif))(?:#(.*))?$/i.exec(String(spec).trim());
  if (!m) { P('type', `«${spec}» — не протокол .json и не снимок .png/.jpg/.webp/.avif/.gif`); return { problems, warns, rec: null }; }
  const abs = real(resolveEvidencePath(m[1])); const step = m[2] != null && m[2] !== '' ? m[2].trim() : null;
  const kind = IMG_EXT.test(abs) ? 'image' : 'json';
  const rec = { file: storePath(abs), step, kind };
  let s; try { s = fs.statSync(abs); } catch { /* нет */ }
  if (!s || !s.isFile() || !s.size) { P('missing', `файла нет или он пустой: ${abs}`); return { problems, warns, rec }; }
  rec.mtimeMs = s.mtimeMs;
  if (lenient) { rec.takenAt = new Date(s.mtimeMs).toISOString(); return { problems, warns, rec }; }
  if (kind === 'image' && (check === 'runtime' || check === 'perf')) P('type', `${check} подтверждается протоколом .json, а не снимком: снимок не показывает, что клик, ввод или замер дали результат`);
  let evTime = s.mtimeMs;
  if (kind === 'image') {
    if (step) P('type', 'у снимка не бывает #шага');
    if (!sniffImage(abs)) P('type', `${path.basename(abs)} — не картинка (подпись файла не PNG/JPEG/WebP/AVIF/GIF)`);
    /* ширина экрана снимка — из shots.json рядом (shots.mjs пишет cssWidth каждого файла) */
    const idx = readJson(path.join(path.dirname(abs), 'shots.json'));
    const meta = idx && idx.files && idx.files[path.basename(abs)];
    if (meta && meta.cssWidth) {
      rec.viewport = String(meta.viewport || `${meta.cssWidth}px`); rec.cssWidth = meta.cssWidth;
      if (check === 'mobile' && meta.cssWidth >= 1024) P('vp', `снимок снят на экране ${meta.viewport || ''} ${meta.cssWidth}px (shots.json) — для mobile нужен экран уже 1024 px`);
    }
  } else {
    let j; try { j = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { P('type', `протокол не читается как JSON: ${e.message.slice(0, 80)}`); return { problems, warns, rec }; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) { P('noverdict', 'в файле не протокол проверки (нужен объект с verdict или шагами)'); return { problems, warns, rec }; }
    const items = protocolItems(j);
    const explicit = typeof j.verdict === 'string' ? j.verdict.toUpperCase() : null;
    const derived = items.reduce((w, x) => (RANK[x.status] > (RANK[w] || 0) ? x.status : w), null);
    const verdict = explicit || derived;
    rec.verdict = verdict || null;
    if (j.url) rec.url = String(j.url);
    /* версия скрипта: другая — WARN (отметка ставится), неизвестна — пометка в show */
    const ver = versionCheck(j.generator);
    if (ver.gen) rec.generator = ver.gen;
    if (ver.warn) warns.push(ver.warn);
    if (ver.note) notes.push(ver.note);
    /* viewport бывает строкой (runtime, a11y, perf) и объектом {name, width} (texture) */
    const vpRaw = j.viewport && typeof j.viewport === 'object' ? j.viewport : null;
    if (j.viewport) rec.viewport = vpRaw ? String(vpRaw.name || (vpRaw.width ? `${vpRaw.width}px` : '')) : String(j.viewport);
    const t = Date.parse(j.startedAt || j.takenAt || j.createdAt || '');
    if (Number.isFinite(t)) evTime = Math.min(evTime, t);
    if (!verdict) P('noverdict', 'в файле нет вердикта (verdict или шагов со статусом) — это не протокол проверки; для взгляда приложите снимок .png');
    const fails = items.filter((x) => x.status === 'FAIL');
    if (verdict === 'FAIL') P('fail', `протокол с вердиктом FAIL${fails.length ? `: ${fails.slice(0, 3).map((x) => `#${x.n} ${x.label.slice(0, 50)}`).join('; ')}` : ''} — исправить и прогнать заново (протокол с FAIL не доказывает ни одну задачу, даже шагом)`);
    if (step) {
      const f = findStep(items, step);
      if (f.err) P('step', f.err);
      else {
        rec.stepLabel = f.it.label.slice(0, 80); rec.stepStatus = f.it.status || null;
        if (f.it.status === 'FAIL') P('fail', `шаг #${f.it.n} «${f.it.label.slice(0, 60)}» — FAIL`);
        else if (f.it.status === 'WARN') warns.push(`шаг #${f.it.n} «${f.it.label.slice(0, 60)}» — WARN: в заметке написать, почему это не мешает`);
        /* запись, а не проверка: eval без --expect и снимок — OK при любом результате */
        /* вид шага пишет runtime.mjs (kind); у старых протоколов — по тексту */
        if (f.it.kind ? /^(eval|shot|fullpage|wait)$/.test(f.it.kind) : /^(eval\s(?!.*\s=\s)|снимок)/i.test(f.it.label)) warns.push(`шаг #${f.it.n} «${f.it.label.slice(0, 60)}» — запись, а не проверка: он OK при любом результате. Утверждение: --assert "…" или --eval "…" --expect "…"`);
      }
    }
    if (verdict === 'WARN' && !step) warns.push('вердикт протокола WARN — в заметке написать, почему предупреждения не мешают');
    if (check === 'mobile') {
      const vp = vpRaw && vpRaw.width ? { width: Number(vpRaw.width) } : rec.viewport ? parseViewport(rec.viewport) : null;
      if (vp && vp.width >= 1024) P('vp', `протокол снят на экране ${rec.viewport} (${vp.width}px) — для mobile нужен экран уже 1024 px`);
    }
  }
  rec.takenAt = new Date(evTime).toISOString();
  /* свежесть: снято позже последней правки сайта */
  if (!st.site) P('nosite', 'в журнале нет папки сайта — не с чем сверить время: node state.mjs <папка> meta --site <папка сайта>');
  else if (!fs.existsSync(st.site)) P('nosite', `папки сайта нет: ${st.site}`);
  else {
    /* внутри папки сайта можно только папке прогона, если она сама лежит в папке сайта */
    if (inside(abs, st.site) && !(inside(runRoot, st.site) && inside(abs, runRoot))) P('inside','доказательство лежит в папке сайта — протоколы и снимки держать в папке прогона');
    const L = siteLatest();
    if (L && L.file && evTime <= L.mtimeMs) P('stale', `снято ${fmt(evTime)}, а сайт правили позже: ${L.file} ${fmt(L.mtimeMs)} — прогнать проверку заново`);
    if (L) { rec.siteEditAt = L.mtimeMs ? new Date(L.mtimeMs).toISOString() : null; rec.siteEditFile = L.file; }
  }
  /* смена требования: доказательство снято по старой формулировке */
  for (const q of reqsOfTask(task)) {
    const ch = Date.parse(q.changedAt || '');
    if (Number.isFinite(ch) && evTime <= ch) P('reqchange', `снято ${fmt(evTime)}, а требование ${q.id} изменено ${fmt(ch)} (ред. ${q.rev || 1}) — проверить по новой формулировке: requirements.mjs <папка> show ${q.id}`);
  }
  return { problems, warns, rec, notes };
}
const evSpec = (e) => `${e.file}${e.step ? '#' + e.step : ''}`;
const sameEvidence = (a, b) => !!(a && b) && a.file.toLowerCase() === b.file.toLowerCase() && String(a.step || '') === String(b.step || '');

/* ---------- состояние клетки таблицы ---------- */

/* причины NA по полям для show и set: «perf NA: только кегли»; одна причина у нескольких полей —
   одной строкой «mobile, perf NA: …»; совпадающая с заметкой задачи (старые журналы) не повторяется */
function naNotesOf(t) {
  const by = new Map();
  for (const c of CHECKS) {
    const n = t[c] === 'NA' && t.proof && t.proof[c] && t.proof[c].note;
    if (n && n !== t.note) by.set(n, [...(by.get(n) || []), c]);
  }
  return [...by].map(([n, cs]) => `${cs.join(', ')} NA: ${n}`);
}
const PROBLEM_LABEL = { missing: 'файла нет', fail: 'протокол FAIL', stale: 'устарело', nosite: 'нет папки сайта', type: 'не годится', noverdict: 'без вердикта', step: 'нет шага', vp: 'не телефон', inside: 'в папке сайта', reqchange: 'требование изменено' };
function cellState(t, c) {
  const s = t[c]; const p = t.proof && t.proof[c];
  if (s === 'VERIFIED') {
    if (!p || !p.evidence) return { cat: 'noproof', label: 'VERIFIED (нет доказательства)' };
    const r = checkEvidence(evSpec(p.evidence), c, { task: t });
    if (!r.problems.length) return { cat: 'ok', label: 'VERIFIED', r };
    const order = ['missing', 'fail', 'type', 'noverdict', 'step', 'vp', 'inside', 'nosite', 'reqchange', 'stale'];
    const main = order.find((code) => r.problems.some((x) => x.code === code));
    const cat = main === 'stale' || main === 'reqchange' ? 'stale' : main === 'nosite' ? 'nosite' : 'noproof';
    return { cat, label: `VERIFIED (${PROBLEM_LABEL[main]})`, r };
  }
  if (s === 'NA') return p && p.note ? { cat: 'na', label: 'NA' } : { cat: 'noproof', label: 'NA (без причины)' };
  if (s === 'FAILED' || s === 'NEEDS_WORK') return { cat: 'failed', label: s };
  return { cat: 'unchecked', label: s || 'NOT_CHECKED' };
}

/* ---------- настройки журнала: папка сайта, режим ---------- */

function applyMeta(target, { createSite = false } = {}) {
  if (opt.mode !== undefined) {
    const m = String(opt.mode).toLowerCase();
    if (!(m in MODES)) die(`--mode: ${Object.keys(MODES).join(' | ')} (${Object.entries(MODES).map(([k, v]) => `${k} — ${v}`).join('; ')})`);
    target.mode = m;
  }
  if (opt.site !== undefined) {
    if (opt.site === true || !String(opt.site).trim()) die('--site без папки: --site <папка с файлами сайта>');
    const s = path.resolve(String(opt.site));
    if (norm(s) === norm(runRoot)) die('Папка сайта совпадает с папкой прогона: укажите папку, где лежат файлы сайта (для зеркала — <прогон>/mirror, для нового сайта — <прогон>/site)');
    /* сайт с нуля: папки ещё нет — создать, если она внутри папки прогона (иначе опечатка в пути создала бы чужую папку) */
    if (!fs.existsSync(s) && createSite && target.mode === 'new' && inside(path.dirname(s), runRoot)) { fs.mkdirSync(s, { recursive: true }); console.log(`OK   папка сайта создана: ${s}`); }
    if (!fs.existsSync(s) || !fs.statSync(s).isDirectory()) die(`Нет папки сайта ${s}`);
    target.site = s;
  }
  if (opt.url !== undefined) {
    if (opt.url === true || !/^(https?|file):\/\/\S/i.test(String(opt.url).trim())) die('--url <адрес сайта: http://…, https://… или file:///…>');
    target.url = String(opt.url).trim();
  }
  if (opt['site-ignore'] !== undefined) {
    if (opt['site-ignore'] === true) die('--site-ignore без списка: --site-ignore "data,*.json"');
    target.siteIgnore = String(opt['site-ignore']).split(',').map((x) => x.trim()).filter(Boolean);
  }
  if (opt.donor !== undefined) {
    const d = opt.donor === true ? '' : String(opt.donor).trim();
    if (/^(none|-|нет)$/i.test(d)) delete target.donor;
    else if (!/^(https?|file):\/\/\S/i.test(d)) die('--donor <адрес донора: http://…, https://… или file:///…> (убрать — --donor none)');
    else target.donor = d;
  }
  /* донор — эталон языка для СВОЕГО сайта: в режиме donor донор и есть адрес журнала, в new — режим donor */
  if (target.donor && target.mode && !['rework', 'mirror'].includes(target.mode)) {
    if (opt.donor === undefined) die(`в журнале задан донор ${target.donor} (свой сайт в языке донора) — режим ${target.mode} с ним не сочетается: meta --mode ${target.mode} --donor none`);
    die(target.mode === 'donor'
      ? '--donor не нужен в режиме donor: там донор — адрес журнала (init <адрес донора>), а сайт собирается с нуля в <прогон>/site. Свой сайт с исходниками в языке донора — --mode rework --donor <адрес донора>, адрес журнала — свой сайт'
      : '--donor — только с --mode rework или mirror (свой сайт в языке донора); новый сайт по донору — --mode donor');
  }
}
/* режим donor с папкой сайта вне прогона — похоже на свой сайт с исходниками (Эпицентр, 29.09: «до» было, а init писал «новый сайт по донору») */
function donorModeHint(s) {
  if (s.mode !== 'donor' || !s.site || inside(s.site, runRoot)) return null;
  return `режим donor — «новый сайт по донору» (сайт собирается в <прогон>/site, снимков «до» нет), а папка сайта вне прогона: ${s.site}. Если это исходники своего сайта — meta --mode rework --donor ${s.url || '<адрес донора>'} --url <адрес своего сайта>: «до» — свой сайт, донор — эталон, в отчёте обе сверки`;
}
const metaLines = (s) => [
  `Режим: ${s.mode ? `${s.mode} — ${MODES[s.mode]}${s.donor ? ' в языке донора' : ''}` : 'не указан (meta --mode rework|mirror|donor|new)'}`,
  ...(s.donor ? [`Донор: ${s.donor} — эталон языка (reference/donor-mode.md §1, сверка — §5); «до» — свой сайт${s.url ? ` ${s.url}` : ''} (shots --tag before)`] : []),
  `Сайт: ${s.site || 'папка не указана (meta --site <папка>) — VERIFIED не ставится, свежесть доказательств не проверить'}${s.siteIgnore && s.siteIgnore.length ? ` · не считать правкой: ${s.siteIgnore.join(', ')}` : ''}`,
];
/* этапы donor и compare по режиму: нужны — todo (если были skipped или их нет), не нужны — skipped (если не начаты) */
function syncDonorStages(s) {
  for (const k of DONOR_ONLY) {
    const want = stageShown(s, k);
    if (want && (!s.stages[k] || s.stages[k] === 'skipped')) s.stages[k] = 'todo';
    else if (!want && s.mode && (!s.stages[k] || s.stages[k] === 'todo')) s.stages[k] = 'skipped';
  }
}

/* ---------- сверки режима с донором: что лежит в папке прогона ---------- */

/** Файлы папки прогона (относительные пути через «/»), до глубины 4, без журналов и node_modules. */
function runFiles() {
  const out = []; const stack = [[runRoot, 0]];
  while (stack.length) {
    const [d, depth] = stack.pop();
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4 && !IGNORE_DIRS.has(e.name)) stack.push([full, depth + 1]); continue; }
      if (e.isFile()) out.push(path.relative(runRoot, full).split(path.sep).join('/'));
      if (out.length > 20000) return out;
    }
  }
  return out;
}
/**
 * Что есть для обеих сверок: «до/после» своего сайта и донор (эталон и сверка с ним). Пути — те, что
 * пишут скрипты по SKILL.md и donor-mode.md; имена можно менять — ищется по образцу.
 */
function compareArtifacts(s) {
  const files = runFiles();
  const has = (re) => files.filter((f) => re.test(f));
  const img = /\.(png|jpe?g|webp)$/i;
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(runRoot, f), 'utf8')); } catch { return null; } };
  /* файл с нужным именем — ещё не сверка: протокол с ошибкой («страница не снялась») или «сверено 0» в счёт не идёт
     («Зелёный уголок», 01.10: verify упал по таймауту, verify.json появился — и show сказал «verify ✓») */
  const broken = [];
  const live = (what, list) => list.filter((f) => {
    const j = read(f); const bad = !!(j && (j.error || j.checked === 0));
    if (bad) broken.push(`${what}: ${f} — ${j.error ? String(j.error).replace(/\s+/g, ' ').slice(0, 110) : 'сверено 0'}`);
    return !bad;
  });
  /* сверка движения под своим --tag (motion/cmp.json) — та же сверка: узнаётся по полям протокола compare */
  const motionCompare = [...new Set([...has(/^motion\/compare[^/]*\.json$/),
    ...has(/^motion\/[^/]+\.json$/).filter((f) => !/^motion\/(donor|compare)[^/]*\.json$/.test(f)).filter((f) => { const j = read(f); return !!(j && j.donor && Array.isArray(j.steps) && !j.items); })])];
  /* фон (bgdecor.mjs): замер донора — decor/donor*.json, сверка — decor/compare*.json или любой протокол kind bgdecor-compare */
  const decorCompare = [...new Set([...has(/^decor\/compare[^/]*\.json$/),
    ...has(/^decor\/[^/]+\.json$/).filter((f) => !/^decor\/(donor|compare)[^/]*\.json$/.test(f)).filter((f) => { const j = read(f); return !!(j && j.kind === 'bgdecor-compare'); })])];
  const parts = [];
  if (s.donor) {
    parts.push({ group: 'до/после', items: [
      ['снимки «до»', has(/^before\/.+/).filter((f) => img.test(f)), 'shots.mjs <свой адрес> --out <папка> --tag before'],
      ['снимки «после»', has(/^after\/.+/).filter((f) => img.test(f)), 'shots.mjs <свой адрес> --out <папка> --tag after'],
      ['diff', has(/(^|\/)diff\/diff\.json$/), 'diff.mjs <папка>/before <папка>/after'],
    ] });
  }
  parts.push({ group: 'эталон донора', items: [
    ['discover', has(/^donor\/[^/]+\.(json|md|png)$/), 'discover.mjs <донор> --out <папка>/donor --no-design --pages-shots 8'],
    ['extract', has(/^donor\/design\/[^/]+\.json$/), 'extract.mjs <донор> --out <папка>/donor/design --name donor'],
    ['texture', has(/^donor\/texture\/[^/]+\.json$/), 'texture.mjs <донор> --out <папка>/donor/texture'],
    ['cliche baseline', has(/(^|\/)cliche[^/]*\/[^/]*(donor|baseline)[^/]*\.json$|^cliche-baseline[^/]*\.json$/), 'cliche.mjs baseline <донор> --out <папка>/cliche/donor.json'],
    ['motion', has(/^motion\/donor-[^/]+\.json$/), 'motion.mjs <донор> --tag donor --out <папка>'],
    ['bgdecor', has(/^decor\/donor[^/]*\.json$/), 'bgdecor.mjs <донор> --out <папка> --tag donor --viewport desktop,mobile'],
  ] });
  parts.push({ group: 'сверка с донором', items: [
    ['verify', live('verify', has(/(^|\/)[^/]*verify[^/]*\.json$/)), 'verify.mjs <папка>/donor/design/donor.json <адрес> --json <папка>/verify.json'],
    ['texture compare', has(/(^|\/)texture-compare\/[^/]+\.json$/), 'texture.mjs compare … --out <папка>/texture-compare'],
    ['cliche', has(/(^|\/)cliche\/cliche[^/]*\.json$/).filter((f) => !/baseline|donor/.test(f)), 'cliche.mjs <адрес> --baseline <папка>/cliche/donor.json'],
    ['motion compare', live('motion compare', motionCompare), 'motion.mjs compare <папка>/motion/donor-home.json <адрес> --out <папка>'],
    ['bgdecor compare', live('bgdecor compare', decorCompare), 'bgdecor.mjs compare <папка>/decor/donor.json <адрес> --out <папка>'],
  ], notes: broken });
  return parts;
}

/* ---------- команды ---------- */

if (cmd === 'init') {
  if (!rest[0]) die('init <url|-> "<запрос>" --site <папка сайта> --mode rework|mirror|donor|new («-» — адреса ещё нет, только --mode new)');
  if (rest[0] === '-' && String(opt.mode || '').toLowerCase() !== 'new') die('Адрес «-» (сайта ещё нет) — только в режиме new (--mode new); у переработки и донора адрес есть');
  if (st && !opt.force) die(`Журнал уже есть: ${file} (задач ${(st.tasks || []).length}). Начать заново — с --force (старый сохранится рядом), поменять папку сайта, режим или адрес — meta.`);
  if (st && opt.force) { const bak = path.join(runRoot, `state.${new Date().toISOString().replace(/[:.]/g, '-')}.json`); fs.copyFileSync(file, bak); console.log(`Старый журнал сохранён: ${bak}`); }
  st = { url: rest[0] === '-' ? null : rest[0], request: rest[1] || '', createdAt: new Date().toISOString(), mode: null, site: null, stages: Object.fromEntries(STAGES.map(([k]) => [k, 'todo'])), tasks: [] };
  applyMeta(st, { createSite: true });
  /* с нуля начинается с требований; в остальных режимах — с разведки, этапы режима new не нужны */
  if (st.mode === 'new') st.stages.requirements = 'active';
  else { st.stages.discovered = 'active'; if (st.mode) for (const k of NEW_ONLY) st.stages[k] = 'skipped'; }
  syncDonorStages(st);
  writeJson(file, st, JOURNAL); console.log(`Журнал создан: ${file}`);
  const lines = metaLines(st);
  console.log(`${st.mode ? 'OK  ' : 'WARN'} ${lines[0]}`);
  for (const l of lines.slice(1)) console.log(`${/^Сайт: папка не указана/.test(l) ? 'WARN' : 'OK  '} ${l}`);
  if (!st.url) console.log('WARN Адреса ещё нет — когда сайт поднимется: meta --url http://localhost:<порт>/');
  const hint = donorModeHint(st); if (hint) console.log(`WARN ${hint}`);
  if (st.mode === 'new') console.log('Дальше: требования в реестр — requirements.mjs <папка> ingest --text "<первое сообщение>" --kind brief (файлы ТЗ — --file)');
  if (st.donor) console.log('Дальше: снимки «до» своего сайта (shots.mjs <свой адрес> --tag before, copy.mjs snapshot --tag before) и эталон донора (reference/donor-mode.md §1: discover, extract, texture, cliche baseline, motion) — оба; перед отчётом — обе сверки: diff «до/после» и сверка с донором (§5), этап compare');
  process.exit(0);
}
if (!st) die(`Нет журнала ${file} — сначала init.`);
for (const t of st.tasks || []) if (IMPL_ALIAS[t.impl]) t.impl = IMPL_ALIAS[t.impl];

if (cmd === 'meta') {
  const before = JSON.stringify([st.site, st.mode, st.siteIgnore, st.url, st.donor, st.stages]);
  applyMeta(st);
  if (opt.mode !== undefined || opt.donor !== undefined) syncDonorStages(st);
  if (JSON.stringify([st.site, st.mode, st.siteIgnore, st.url, st.donor, st.stages]) !== before) { writeJson(file, st, JOURNAL); console.log('Записано.'); }
  console.log(`Адрес: ${st.url || 'ещё нет (meta --url http://localhost:<порт>/)'}`);
  for (const l of metaLines(st)) console.log(l);
  const hint = donorModeHint(st); if (hint) console.log(`WARN ${hint}`);
  if (st.mode === 'new') { const sk = NEW_ONLY.filter((k) => st.stages[k] === 'skipped'); if (sk.length) console.log(`WARN в режиме new этапы ${sk.join(', ')} нужны, а отмечены «пропущено»: stage ${sk[0]} active`); }
  const L = siteLatest();
  if (L) console.log(`Последняя правка сайта: ${L.file ? `${L.file} ${fmt(L.mtimeMs)}` : 'файлов нет'} (файлов ${L.files}${L.capped ? ', обход остановлен на 50 000' : ''})`);
} else if (cmd === 'add') {
  if (!rest[0]) die('add "<задача>" [--priority P2] [--area ...]');
  const p = opt.priority && opt.priority !== true ? String(opt.priority).toUpperCase() : 'P2'; if (!PRIO.includes(p)) die(`Приоритет: ${PRIO.join(', ')}`);
  const id = st.tasks.reduce((mx, t) => Math.max(mx, Number(t.id) || 0), 0) + 1;
  const now = new Date().toISOString();
  st.tasks.push({ id, task: rest[0], priority: p, area: opt.area && opt.area !== true ? String(opt.area) : null, impl: 'TODO', runtime: 'NOT_CHECKED', visual: 'NOT_CHECKED', mobile: 'NOT_CHECKED', perf: 'NOT_CHECKED', note: '', proof: {}, createdAt: now, updatedAt: now });
  writeJson(file, st, JOURNAL); console.log(`#${id} ${p} ${rest[0]}`);
} else if (cmd === 'set') {
  const ids = String(rest[0] || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!ids.length) die('set <id>[,<id>…] поле=значение … [--evidence файл[#шаг]] [--note "…"]');
  const tasks = ids.map((x) => { const t = st.tasks.find((y) => y.id === Number(x)); if (!t) die(`Нет задачи #${x}`); return t; });
  const changes = {};
  for (const kv of rest.slice(1)) {
    const i = kv.indexOf('=');
    if (i < 1) die(`Ожидалось поле=значение, а не «${kv}». Несколько задач — через запятую без пробелов: set 3,4 impl=DONE`);
    const k = kv.slice(0, i).trim().toLowerCase(); let v = kv.slice(i + 1).trim().toUpperCase();
    if (k === 'impl') { v = IMPL_ALIAS[v] || v; if (!IMPL.includes(v)) die(`impl: ${IMPL.join(', ')}`); }
    else if (CHECKS.includes(k)) { if (!CHECK.includes(v)) die(`${k}: ${CHECK.join(', ')}`); }
    else if (k === 'priority') { if (!PRIO.includes(v)) die(`priority: ${PRIO.join(', ')}`); }
    else die(`Неизвестное поле ${k}. Есть: impl, ${CHECKS.join(', ')}, priority`);
    changes[k] = v;
  }
  if (opt.note !== undefined && (opt.note === true || !String(opt.note).trim())) die('--note без текста. Напишите, что проверено или почему NA; заметку, которая начинается с «--», — так: --note="--scroll прошёл"');
  const note = opt.note !== undefined ? String(opt.note).trim() : null;
  if (!Object.keys(changes).length && note === null) die('Нечего менять: set <id> поле=значение … или --note "…"');
  const evKeys = ['evidence', ...CHECKS.map((c) => `evidence-${c}`)];
  for (const k of evKeys) if (opt[k] !== undefined && (opt[k] === true || !String(opt[k]).trim())) die(`--${k} без файла: --${k} <протокол.json[#шаг]|снимок.png>`);
  const WITH_EV = ['VERIFIED', 'FAILED', 'NEEDS_WORK'];
  for (const c of CHECKS) if (opt[`evidence-${c}`] && !WITH_EV.includes(changes[c])) die(`--evidence-${c} есть, а ${c}=VERIFIED|FAILED|NEEDS_WORK в этом вызове нет`);
  if (opt.evidence && !CHECKS.some((c) => WITH_EV.includes(changes[c]) && !opt[`evidence-${c}`])) die('--evidence не к чему приложить: в вызове нет проверки со статусом VERIFIED, FAILED или NEEDS_WORK');
  const verified = CHECKS.filter((c) => changes[c] === 'VERIFIED');
  if (verified.length && tasks.length > 1) die(`VERIFIED ставится одной задаче за вызов: у каждой задачи своё доказательство. Разбейте: ${ids.map((x) => `set ${x} ${verified.map((c) => `${c}=VERIFIED`).join(' ')} --evidence …`).join('; ')}`);
  const na = CHECKS.filter((c) => changes[c] === 'NA');
  if (na.length && !note) die(`NA — только с причиной: --note "почему ${na.join(', ')} не относится к задаче"`);
  const evFor = (c) => (opt[`evidence-${c}`] || opt.evidence ? String(opt[`evidence-${c}`] || opt.evidence) : null);

  const errors = []; const warns = []; const recs = {};
  for (const c of verified) {
    const spec = evFor(c);
    if (!spec) { errors.push(`${c}=VERIFIED без доказательства: --evidence <протокол.json[#шаг]|снимок.png> (или --evidence-${c})`); continue; }
    const r = checkEvidence(spec, c, { task: tasks[0] });
    errors.push(...r.problems.map((x) => `${c}: ${x.msg}`)); warns.push(...r.warns.map((x) => `${c}: ${x}`)); recs[c] = r.rec;
    /* один протокол целиком на несколько задач — это «пачка»: второй раз только со своим шагом */
    if (r.rec && r.rec.kind === 'json' && !r.rec.step) {
      const other = st.tasks.filter((x) => x !== tasks[0] && x[c] === 'VERIFIED' && x.proof && x.proof[c] && x.proof[c].evidence && x.proof[c].evidence.file.toLowerCase() === r.rec.file.toLowerCase());
      if (other.length) errors.push(`${c}: протокол ${r.rec.file} уже подтверждает ${other.map((x) => `#${x.id}`).join(', ')} — у каждой задачи своё доказательство: укажите шаг, который проверяет эту задачу (${r.rec.file}#<номер или часть названия>), или снимите отдельный протокол`);
    }
  }
  for (const c of CHECKS.filter((x) => changes[x] === 'FAILED' || changes[x] === 'NEEDS_WORK')) {
    const spec = evFor(c); if (!spec) continue;
    const r = checkEvidence(spec, c, { lenient: true });
    errors.push(...r.problems.map((x) => `${c}: ${x.msg}`)); recs[c] = r.rec;
  }
  if (errors.length) { console.error(`FAIL #${ids.join(', #')}: ничего не записано\n${errors.map((e) => `  - ${e}`).join('\n')}`); process.exit(1); }
  for (const c of verified) {
    const same = st.tasks.filter((x) => x !== tasks[0] && x[c] === 'VERIFIED' && x.proof && x.proof[c] && sameEvidence(x.proof[c].evidence, recs[c]));
    if (same.length) warns.push(`${c}: то же доказательство уже стоит у ${same.map((x) => `#${x.id}`).join(', ')} — убедитесь, что оно проверяет и эту задачу (лучше свой шаг: файл.json#шаг)`);
    const impl = changes.impl || tasks[0].impl;
    if (impl !== 'DONE') warns.push(`${c}=VERIFIED у задачи со статусом impl ${impl}`);
  }

  const now = new Date().toISOString();
  /* NA: заметка вызова — причина NA, пишется к полям NA и не затирает заметку задачи (раньше
     `set 5 perf=NA --note "только кегли"` заменял длинную заметку задачи — Opara, 29.09). Без NA —
     основная заметка задачи, как раньше, и она же у проверок этого вызова. */
  const naReason = na.length ? note : null;
  for (const t of tasks) {
    t.proof = t.proof || {};
    if (changes.impl) { t.impl = changes.impl; t.implAt = now; }
    if (changes.priority) t.priority = changes.priority;
    for (const c of CHECKS) {
      if (!changes[c]) continue;
      t[c] = changes[c];
      if (changes[c] === 'NOT_CHECKED') { delete t.proof[c]; continue; }
      const n = naReason ? (changes[c] === 'NA' ? naReason : null) : note;
      t.proof[c] = { status: changes[c], at: now, ...(recs[c] ? { evidence: recs[c] } : {}), ...(n ? { note: n } : {}) };
    }
    if (note && !naReason) t.note = note;
    t.updatedAt = now;
  }
  writeJson(file, st, JOURNAL);
  for (const w of warns) console.log(`WARN ${w}`);
  for (const t of tasks) {
    const parts = CHECKS.map((c) => `${c} ${t[c]}${changes[c] && recs[c] && changes[c] !== 'NOT_CHECKED' ? ` ← ${evSpec(recs[c])}${recs[c].verdict ? ` (${recs[c].stepStatus || recs[c].verdict})` : ''}` : ''}`);
    console.log(`OK   #${t.id} ${t.task}: impl ${t.impl} · ${parts.join(' · ')}${[t.note, ...naNotesOf(t)].filter(Boolean).map((x) => ` · ${x}`).join('')}`);
  }
} else if (cmd === 'stage') {
  /* по списку STAGES, а не по ключам журнала: в старом журнале новых этапов (requirements, direction) нет */
  const [k, v] = rest; if (!STAGES.some(([s]) => s === k)) die(`Этапы: ${STAGES.map(([s]) => s).join(', ')}`); if (!(v in MARK)) die('done|active|todo|skipped');
  st.stages[k] = v; writeJson(file, st, JOURNAL); console.log(`${MARK[v]} ${STAGES.find(([s]) => s === k)[1]}`);
} else if (cmd === 'probe') {
  const specs = rest.filter(Boolean);
  if (!specs.length) die('probe <файл[#шаг]>… --check runtime|visual|mobile|perf [--task <id>] [--json]');
  const c = opt.check === undefined ? 'runtime' : String(opt.check); if (!CHECKS.includes(c)) die(`--check: ${CHECKS.join(', ')}`);
  const t = opt.task !== undefined ? st.tasks.find((x) => x.id === Number(opt.task)) : null; if (opt.task !== undefined && !t) die(`Нет задачи #${opt.task}`);
  const res = specs.map((spec) => { const r = checkEvidence(spec, c, { task: t }); return { spec, ok: !r.problems.length, problems: r.problems, warns: r.warns, notes: r.notes || [], rec: r.rec }; });
  if (opt.json) console.log(JSON.stringify(res.length === 1 ? res[0] : res, null, 1));
  else for (const r of res) {
    for (const x of r.problems) console.log(`FAIL ${r.spec}: ${x.msg}`);
    for (const w of r.warns) console.log(`WARN ${r.spec}: ${w}`);
    if (r.ok) console.log(`OK   ${evSpec(r.rec)}${r.rec && r.rec.stepLabel ? ` «${r.rec.stepLabel.slice(0, 60)}»` : ''} · снято ${r.rec && r.rec.takenAt ? fmt(Date.parse(r.rec.takenAt)) : '—'}`);
  }
  process.exit(res.some((r) => !r.ok) ? 1 : 0);
} else if (cmd === 'show') {
  const L = siteLatest();
  if (opt.json) {
    const cellJ = (t, c) => { const s = cellState(t, c); const p = t.proof && t.proof[c]; return { status: t[c], cat: s.cat, label: s.label, evidence: (p && p.evidence) || null, problems: s.r ? s.r.problems : [], warns: s.r ? s.r.warns : [] }; };
    console.log(JSON.stringify({
      url: st.url || null, request: st.request, mode: st.mode || null, donor: st.donor || null, site: st.site || null,
      siteEdit: L && L.file ? { file: L.file, at: new Date(L.mtimeMs).toISOString() } : null,
      stages: Object.fromEntries(STAGES.map(([k]) => [k, st.stages[k] || null])),
      ...(st.donor || st.mode === 'donor' ? { compare: compareArtifacts(st).map((p) => ({ group: p.group, items: p.items.map(([what, found]) => ({ what, files: found.length, sample: found.slice(0, 3) })), ...(p.notes && p.notes.length ? { broken: p.notes } : {}) })) } : {}),
      tasks: st.tasks.map((t) => ({ id: t.id, task: t.task, priority: t.priority, area: t.area || null, impl: t.impl, note: t.note || '', naNotes: naNotesOf(t), reqs: reqIds(t), cells: Object.fromEntries(CHECKS.map((c) => [c, cellJ(t, c)])) })),
    }, null, 1));
    process.exit(0);
  }
  console.log(`# ${st.url || '(адреса ещё нет — meta --url)'}\n\nЗапрос: ${st.request}`);
  for (const l of metaLines(st)) console.log(l);
  if (st.site) console.log(`Последняя правка сайта: ${L && L.file ? `${L.file} ${fmt(L.mtimeMs)}` : fs.existsSync(st.site) ? 'файлов нет' : 'папки нет'}`);
  { const hint = donorModeHint(st); if (hint) console.log(`WARN ${hint}`); }
  console.log('');
  /* этапы режима new в других режимах — только если их начали (реестр понадобился и там): у старых журналов
     и у переработки без реестра чек-лист прежний; этапа нет в журнале (журнал старше этапа) — «не начато» */
  for (const [k, title] of STAGES) {
    const v = st.stages[k];
    if (NEW_ONLY.includes(k) && st.mode !== 'new' && (!v || v === 'skipped') && !(k === 'requirements' && reqRegistry())) continue;
    /* donor и compare — только в режимах с донором или если их начали */
    if (DONOR_ONLY.includes(k) && !stageShown(st, k) && (!v || v === 'skipped' || v === 'todo')) continue;
    console.log(`${MARK[v] || '·'} ${k === 'compare' && !st.donor ? 'Сверка с донором перед отчётом (reference/donor-mode.md §5)' : title}`);
  }
  /* сверки режима с донором: что уже лежит в папке прогона и чего нет */
  let compareMissing = [];
  if (st.donor || st.mode === 'donor') {
    const parts = compareArtifacts(st);
    console.log(`\nСверки (${st.donor ? `свой сайт в языке донора ${st.donor}` : 'режим donor'}; по файлам в папке прогона):`);
    /* команды недостающего — когда до них дошло: эталон — с этапа donor (в режиме donor — discovered), сверки — с compare или report */
    const started = (k) => ['active', 'done'].includes(st.stages[k]);
    const hintsFor = (g) => (g === 'эталон донора' ? started(st.donor ? 'donor' : 'discovered') : started('compare') || started('report'));
    let hidden = 0;
    for (const p of parts) {
      const miss = p.items.filter(([, f]) => !f.length);
      console.log(`  ${p.group}: ${p.items.map(([what, f]) => `${what} ${f.length ? `✓${f.length > 1 ? ` ${f.length}` : ''}` : '—'}`).join(' · ')}`);
      for (const n of p.notes || []) console.log(`    не в счёт: ${n}`);
      if (hintsFor(p.group)) for (const [what, , how] of miss) console.log(`    нет «${what}»: ${how}`);
      else hidden += miss.length;
      if (p.group !== 'эталон донора') compareMissing.push(...miss.map(([what]) => `${p.group}: ${what}`));
    }
    if (hidden) console.log('  (команды недостающего — reference/donor-mode.md §1 и §5; show напомнит, когда начнутся этапы donor, compare или report)');
  }
  const reportStarted = ['active', 'done'].includes(st.stages.report) || st.stages.compare === 'done';

  const sorted = [...st.tasks].sort((a, b) => a.priority.localeCompare(b.priority) || a.id - b.id);
  const cells = new Map(sorted.map((t) => [t.id, Object.fromEntries(CHECKS.map((c) => [c, cellState(t, c)]))]));
  console.log('\n| # | P | задача | реализация | runtime | визуал | телефон | скорость | заметка |\n|---|---|---|---|---|---|---|---|---|');
  for (const t of sorted) {
    const cs = cells.get(t.id);
    const rq = reqIds(t);
    console.log(`| ${t.id} | ${t.priority} | ${t.task}${rq.length ? ` [${rq.join(', ')}]` : ''} | ${t.impl} | ${CHECKS.map((c) => cs[c].label).join(' | ')} | ${[t.note, ...naNotesOf(t)].filter(Boolean).join(' · ').replace(/\|/g, '/')} |`);
  }

  const evLines = []; const bare = [];
  for (const t of sorted) {
    const noEv = CHECKS.filter((c) => t[c] === 'VERIFIED' && !(t.proof && t.proof[c] && t.proof[c].evidence));
    if (noEv.length) bare.push(`#${t.id} ${noEv.join(', ')}`);
  }
  if (bare.length) evLines.push(`- VERIFIED без доказательства (старая отметка или без --evidence): ${bare.join('; ')}`);
  for (const t of sorted) for (const c of CHECKS) {
    const p = t.proof && t.proof[c]; const cs = cells.get(t.id)[c];
    if (t[c] === 'VERIFIED' || ((t[c] === 'FAILED' || t[c] === 'NEEDS_WORK') && p && p.evidence)) {
      if (!p || !p.evidence) continue;
      const e = p.evidence; const r = cs.r;
      const cur = r && r.rec ? r.rec : e;
      const rewritten = r && r.rec && e.mtimeMs && r.rec.mtimeMs && Math.abs(r.rec.mtimeMs - e.mtimeMs) > 1 ? ' · файл перезаписан после отметки' : '';
      const probs = r && r.problems.length ? ` · ${r.problems.map((x) => (x.code === 'stale' && r.rec && r.rec.siteEditFile ? `УСТАРЕЛО: ${r.rec.siteEditFile} правили ${fmt(Date.parse(r.rec.siteEditAt))} — прогнать заново` : x.msg)).join('; ')}` : '';
      const wr = (r && r.warns && r.warns.length && t[c] === 'VERIFIED' ? ` · WARN ${r.warns.join('; ')}` : '') + (r && r.notes && r.notes.length ? ` · ${r.notes.join('; ')}` : '');
      evLines.push(`- #${t.id} ${c} ${t[c]} ← ${evSpec(e)}${e.stepLabel ? ` «${e.stepLabel.slice(0, 50)}»` : ''}${cur.verdict ? ` ${cur.stepStatus || cur.verdict}` : ''} · снято ${cur.takenAt ? fmt(Date.parse(cur.takenAt)) : '—'} · отмечено ${p.at ? fmt(Date.parse(p.at)) : '—'}${rewritten}${probs}${wr}`);
    }
  }
  if (evLines.length) console.log(`\nДоказательства:\n${evLines.join('\n')}`);

  const doneT = st.tasks.filter((t) => t.impl === 'DONE');
  const cnt = { ok: 0, na: 0, noproof: 0, stale: 0, nosite: 0, failed: 0, unchecked: 0 };
  let naNoReason = 0;
  for (const t of doneT) for (const c of CHECKS) { const cs = cells.get(t.id)[c]; cnt[cs.cat]++; if (cs.label === 'NA (без причины)') naNoReason++; }
  const MAIN = ['runtime', 'visual', 'mobile'];
  const ready = (t) => {
    const cs = cells.get(t.id);
    return t.impl === 'DONE' && MAIN.every((c) => ['ok', 'na'].includes(cs[c].cat)) && MAIN.some((c) => cs[c].cat === 'ok') && ['ok', 'na', 'unchecked'].includes(cs.perf.cat);
  };
  const readyT = doneT.filter(ready);
  const why = (t) => {
    const groups = new Map();
    for (const c of CHECKS) {
      const s = cells.get(t.id)[c];
      if (s.cat === 'ok' || s.cat === 'na' || (c === 'perf' && s.cat === 'unchecked')) continue;
      groups.set(s.label, [...(groups.get(s.label) || []), c]);
    }
    return [...groups].map(([label, cs]) => `${cs.join(', ')} — ${label}`).join('; ') || 'все проверки неприменимы';
  };
  const byImpl = (v) => st.tasks.filter((t) => t.impl === v).length;
  console.log(`\nСделано ${doneT.length} из ${st.tasks.length}${byImpl('DOING') ? `, в работе ${byImpl('DOING')}` : ''}${byImpl('BLOCKED') ? `, заблокировано ${byImpl('BLOCKED')}` : ''}${byImpl('DROPPED') ? `, снято ${byImpl('DROPPED')}` : ''}.`);
  console.log(`Проверки сделанных задач: проверено ${cnt.ok}, неприменимо ${cnt.na}, без доказательства ${cnt.noproof + cnt.nosite}${naNoReason ? ` (из них NA без причины ${naNoReason})` : ''}, устарело ${cnt.stale}, провалено или на доработке ${cnt.failed}, не проверено ${cnt.unchecked}.`);
  console.log(`VERIFIED (runtime, visual и mobile проверены с доказательством или неприменимы с причиной): ${readyT.length ? readyT.map((t) => `#${t.id}`).join(', ') : 'нет'}.`);
  const notReady = doneT.filter((t) => !ready(t));
  if (notReady.length) console.log(`В отчёт как IMPLEMENTED, не VERIFIED:\n${notReady.map((t) => `  - #${t.id}: ${why(t)}`).join('\n')}`);
  /* требования: активные must без задачи или после изменения не пересмотрены — план не сходится с реестром */
  const R = reqRegistry();
  let reqOpen = [];
  if (R) {
    const act = R.items.filter((q) => (q.decision || 'active') === 'active');
    const noTask = act.filter((q) => !(q.tasks || []).length && !['glossary', 'audience', 'risk', 'assumption', 'schedule', 'about'].includes(q.kind));
    const review = act.filter((q) => q.needsReview);
    const openQ = (R.questions || []).filter((x) => !x.answer && !x.assumption);
    console.log(`Требования (requirements.json): активных ${act.length}, без задачи ${noTask.length}${noTask.length ? ` (${noTask.slice(0, 8).map((q) => q.id).join(', ')}${noTask.length > 8 ? ', …' : ''})` : ''}, пересмотреть после изменения ${review.length}${review.length ? ` (${review.slice(0, 8).map((q) => q.id).join(', ')})` : ''}, вопросов без ответа ${openQ.length} — подробно: requirements.mjs <папка> report`);
    reqOpen = [...new Set([...noTask, ...review])].filter((q) => q.priority === 'must');
  } else if (st.mode === 'new') console.log('Требования: реестра нет (requirements.json) — в режиме new он обязателен: requirements.mjs <папка> ingest --text "<первое сообщение>" --kind brief');
  const noRegistry = !R && st.mode === 'new';
  const openHigh = st.tasks.filter((t) => ['P0', 'P1', 'P2'].includes(t.priority) && t.impl !== 'DROPPED' && !ready(t));
  /* отчёт начат, а сверки с донором или «до/после» в папке прогона нет — в отчёт она не попадёт */
  const noCompare = reportStarted ? compareMissing : [];
  const bad = cnt.noproof + cnt.nosite + cnt.stale;
  const verdict = bad ? 'FAIL' : openHigh.length || reqOpen.length || noRegistry || noCompare.length ? 'WARN' : 'OK';
  const msg = bad
    ? `${cnt.noproof + cnt.nosite ? `без доказательства: ${cnt.noproof + cnt.nosite}` : ''}${cnt.noproof + cnt.nosite && cnt.stale ? ', ' : ''}${cnt.stale ? `устарело: ${cnt.stale} (${R ? 'сайт правили или требование изменили' : 'сайт правили'} после проверки)` : ''} — прогнать проверки заново и поставить VERIFIED с --evidence`
    : openHigh.length || reqOpen.length || noRegistry || noCompare.length ? [openHigh.length ? `P0–P2 не проверены до конца: ${openHigh.map((t) => `#${t.id}`).join(', ')}` : '', reqOpen.length ? `must-требования без задачи или не пересмотрены после изменения: ${reqOpen.map((q) => q.id).join(', ')}` : '', noRegistry ? 'режим new без реестра требований' : '', noCompare.length ? `отчёт начат, а сверок нет (${noCompare.join(', ')})` : ''].filter(Boolean).join('; ') : 'всё сделанное проверено';
  console.log(`\n${verdict}: ${msg}`);
  if (opt.strict && verdict !== 'OK') process.exit(1);
} else die(`Неизвестная команда ${cmd}`);

/* ---------- --selftest: журнал во временной папке ---------- */

function selftest() {
  const SELF = fileURLToPath(import.meta.url);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'state-selftest-'));
  const results = [];
  const check = (group, name, ok, extra = '') => { results.push(!!ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${group.padEnd(7)} ${name}${!ok && extra ? ` — ${String(extra).replace(/\s+/g, ' ').slice(0, 300)}` : ''}`); };
  const S = (run, ...a) => { const p = spawnSync(process.execPath, [SELF, run, ...a], { encoding: 'utf8', windowsHide: true }); return { code: p.status, out: `${p.stdout}${p.stderr}` }; };
  const J = (run) => JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8'));
  const touch = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '{}'); };
  try {
    const site = path.join(tmp, 'epicentr'); fs.mkdirSync(site, { recursive: true }); fs.writeFileSync(path.join(site, 'index.html'), '<h1>Эпицентр</h1>');
    /* свой сайт в языке донора */
    const run = path.join(tmp, 'run');
    let r = S(run, 'init', 'http://localhost:3000/', 'Эпицентр в языке mamuka.rest', '--site', site, '--mode', 'rework', '--donor', 'https://mamuka.rest/');
    let j = J(run);
    check('donor', 'init --mode rework --donor: донор в журнале, этапы donor и compare — todo', r.code === 0 && j.donor === 'https://mamuka.rest/' && j.url === 'http://localhost:3000/' && j.stages.donor === 'todo' && j.stages.compare === 'todo', r.out);
    check('donor', 'init печатает режим «в языке донора», донора и «Дальше» про обе сверки', /в языке донора/.test(r.out) && /Донор: https:\/\/mamuka\.rest\//.test(r.out) && /обе сверки/.test(r.out), r.out);
    r = S(run, 'show');
    check('donor', 'show: этап «Донор снят», блок «Сверки» с «до/после» и донором', /Донор снят/.test(r.out) && /Сверки \(свой сайт в языке донора/.test(r.out) && /до\/после: снимки «до» —/.test(r.out) && /сверка с донором: verify —/.test(r.out), r.out);
    for (const f of ['before/home-desktop-first.png', 'after/home-desktop-first.png', 'donor/discovery.json', 'donor/design/donor.json', 'cliche/donor.json', 'motion/donor-home.json', 'motion/compare-home.json']) touch(path.join(run, f));
    S(run, 'stage', 'report', 'active');
    r = S(run, 'show');
    check('donor', 'по файлам прогона: «до» и «после» есть, diff, verify, texture compare — нет', /снимки «до» ✓ · снимки «после» ✓ · diff —/.test(r.out) && /motion compare ✓/.test(r.out) && /нет «verify»/.test(r.out), (r.out.split('Сверки')[1] || '').slice(0, 600));
    check('donor', 'отчёт начат, а сверок нет — итог WARN с их списком', /^WARN: .*отчёт начат, а сверок нет \(до\/после: diff, сверка с донором: verify, сверка с донором: texture compare, сверка с донором: cliche, сверка с донором: bgdecor compare\)/m.test(r.out), r.out.split('\n').slice(-2).join(' '));
    /* имя файла — ещё не сверка: протокол с ошибкой не в счёт; сверка движения под своим --tag узнаётся по полям */
    fs.writeFileSync(path.join(run, 'verify.json'), JSON.stringify({ tool: 'verify.mjs', verdict: 'FAIL', error: 'Страница не снялась: http://localhost:3000/ — timed out', checked: 0, steps: [] }));
    r = S(run, 'show');
    check('donor', 'verify.json с ошибкой (страница не снялась, сверено 0) сверкой не считается', /verify —/.test(r.out) && /нет «verify»/.test(r.out) && /не в счёт: verify: verify\.json — Страница не снялась/.test(r.out), (r.out.split('Сверки')[1] || '').slice(0, 600));
    fs.writeFileSync(path.join(run, 'verify.json'), JSON.stringify({ tool: 'verify.mjs', verdict: 'FAIL', checked: 57, fails: 30, steps: [] }));
    fs.rmSync(path.join(run, 'motion', 'compare-home.json'));
    r = S(run, 'show');
    check('donor', 'verify с расхождениями — сверка есть; без протокола сверки движения — «нет»', /verify ✓/.test(r.out) && /motion compare —/.test(r.out) && !/не в счёт/.test(r.out), (r.out.split('Сверки')[1] || '').slice(0, 600));
    fs.writeFileSync(path.join(run, 'motion', 'cmp.json'), JSON.stringify({ url: 'http://localhost:3000/', donor: 'motion/donor-home.json', verdict: 'OK', steps: [] }));
    fs.writeFileSync(path.join(run, 'motion', 'after-home.json'), JSON.stringify({ url: 'http://localhost:3000/', verdict: 'OK', items: [] }));
    r = S(run, 'show');
    check('donor', 'сверка движения под своим --tag (motion/cmp.json) узнаётся по полям, замер движения — нет', /motion compare ✓(?! 2)/.test(r.out), (r.out.split('Сверки')[1] || '').slice(0, 600));
    /* фон: замер донора и сверка bgdecor.mjs — в том же блоке; сверка под своим --tag узнаётся по kind */
    check('donor', 'фон: без замера и сверки bgdecor — «bgdecor —» у эталона и «bgdecor compare —» у сверки', /эталон донора: .*bgdecor —/.test(r.out) && /bgdecor compare —/.test(r.out) && /нет «bgdecor compare»: bgdecor\.mjs compare/.test(r.out), (r.out.split('Сверки')[1] || '').slice(0, 700));
    fs.mkdirSync(path.join(run, 'decor'), { recursive: true });
    fs.writeFileSync(path.join(run, 'decor', 'donor.json'), JSON.stringify({ kind: 'bgdecor', verdict: 'OK', results: [] }));
    fs.writeFileSync(path.join(run, 'decor', 'ours.json'), JSON.stringify({ kind: 'bgdecor', verdict: 'OK', results: [] }));
    fs.writeFileSync(path.join(run, 'decor', 'sverka.json'), JSON.stringify({ kind: 'bgdecor-compare', verdict: 'WARN', steps: [] }));
    r = S(run, 'show');
    check('donor', 'фон: decor/donor.json — замер донора, сверка под своим --tag (decor/sverka.json) узнаётся по kind, замер своего сайта — нет', /эталон донора: .*bgdecor ✓/.test(r.out) && /bgdecor compare ✓(?! 2)/.test(r.out), (r.out.split('Сверки')[1] || '').slice(0, 700));
    fs.rmSync(path.join(run, 'decor'), { recursive: true, force: true });
    fs.rmSync(path.join(run, 'verify.json')); fs.rmSync(path.join(run, 'motion', 'cmp.json')); fs.rmSync(path.join(run, 'motion', 'after-home.json')); touch(path.join(run, 'motion', 'compare-home.json'));
    r = S(run, 'show', '--json');
    let sj = null; try { sj = JSON.parse(r.out); } catch { /* не JSON */ }
    check('donor', 'show --json: donor и compare', !!(sj && sj.donor === 'https://mamuka.rest/' && Array.isArray(sj.compare) && sj.compare.length === 3), r.out.slice(0, 200));
    r = S(run, 'meta', '--mode', 'donor');
    check('donor', 'meta --mode donor при доноре в журнале — отказ с подсказкой --donor none', r.code === 1 && /--donor none/.test(r.out), r.out);
    r = S(run, 'meta', '--donor', 'none');
    j = J(run);
    check('donor', 'meta --donor none: донора нет, этап donor — skipped', r.code === 0 && !j.donor && j.stages.donor === 'skipped', r.out);
    /* режим donor */
    const run2 = path.join(tmp, 'run2');
    r = S(run2, 'init', 'https://mamuka.rest/', 'Эпицентр', '--site', site, '--mode', 'donor', '--donor', 'https://x.ru/');
    check('donor', 'init --mode donor --donor — отказ: донор — адрес журнала', r.code === 1 && !fs.existsSync(path.join(run2, 'state.json')) && /--mode rework --donor/.test(r.out), r.out);
    r = S(run2, 'init', 'https://mamuka.rest/', 'Эпицентр', '--site', site, '--mode', 'donor');
    check('donor', 'donor со своей папкой вне прогона — WARN «это rework --donor»', r.code === 0 && /^WARN режим donor — «новый сайт по донору»/m.test(r.out) && /meta --mode rework --donor https:\/\/mamuka\.rest\//.test(r.out), r.out);
    r = S(run2, 'show');
    check('donor', 'режим donor: этапа donor нет, compare — «Сверка с донором», блок без «до/после»', !/Донор снят/.test(r.out) && /Сверка с донором перед отчётом/.test(r.out) && /Сверки \(режим donor/.test(r.out) && !/до\/после:/.test(r.out), r.out);
    r = S(path.join(tmp, 'run3'), 'init', '-', 'С нуля', '--mode', 'new', '--site', path.join(tmp, 'run3', 'site'), '--donor', 'https://x.ru/');
    check('donor', 'init --mode new --donor — отказ', r.code === 1, r.out);
    /* причина NA — к полю, заметка задачи не затирается */
    S(run, 'add', 'Кегли h1');
    S(run, 'set', '1', 'impl=DONE', 'runtime=NEEDS_WORK', '--note', 'длинная заметка задачи');
    r = S(run, 'set', '1', 'perf=NA', '--note', 'только кегли');
    j = J(run); let t = j.tasks[0];
    check('NA', 'set perf=NA --note: заметка задачи не затёрта, причина — у perf', t.note === 'длинная заметка задачи' && t.proof.perf.note === 'только кегли' && t.proof.runtime.note === 'длинная заметка задачи', JSON.stringify({ note: t.note, perf: t.proof.perf }));
    check('NA', 'set печатает причину рядом: «perf NA: только кегли»', /длинная заметка задачи · perf NA: только кегли/.test(r.out), r.out);
    S(run, 'set', '1', 'mobile=NA', '--note', 'только кегли');
    r = S(run, 'show');
    check('NA', 'show: одна причина у двух полей — «mobile, perf NA: …»', /\| длинная заметка задачи · mobile, perf NA: только кегли \|/.test(r.out), r.out.split('\n').find((l) => /^\| 1 /.test(l)));
    S(run, 'add', 'Меню');
    S(run, 'set', '2', 'impl=DONE', 'runtime=FAILED', 'visual=NA', '--note', 'меню без картинок');
    j = J(run); t = j.tasks[1];
    check('NA', 'смешанный вызов: причина только у NA, заметка задачи пуста', t.note === '' && t.proof.visual.note === 'меню без картинок' && !t.proof.runtime.note, JSON.stringify({ note: t.note, runtime: t.proof.runtime, visual: t.proof.visual }));
    r = S(run, 'set', '2', 'perf=NA');
    check('NA', 'NA без --note — отказ', r.code === 1 && /NA — только с причиной/.test(r.out), r.out);
    /* strict */
    r = S(run, 'show', '--dnor', 'x');
    check('флаги', 'неизвестный флаг — отказ с подсказкой (strict)', r.code === 1 && /--dnor — может быть, --donor\?/.test(r.out), r.out);
    r = S(run, 'show', '--out', run);
    check('флаги', '--out вместо первого аргумента — отказ с подсказкой «папка прогона — первым аргументом»', r.code === 1 && /папка прогона — первым аргументом/.test(r.out), r.out);
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* останется во временной папке */ } }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${failed ? 'FAIL' : 'OK'}: проверок ${results.length}, не прошло ${failed}`);
  return failed ? 1 : 0;
}
