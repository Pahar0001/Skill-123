#!/usr/bin/env node
/**
 * Журнал состояния переработки: что решено сделать, что сделано, что
 * реально проверено. Одна запись — одна задача, у каждой пять статусов,
 * потому что «написал код», «открыл в браузере и работает», «посмотрел и
 * красиво», «на телефоне тоже» и «быстро» — разные вещи.
 *
 *   node state.mjs <папка прогона> init <url> "<запрос>" --site <папка сайта> --mode rework|mirror|donor [--force]
 *   node state.mjs <папка> meta [--site <папка сайта>] [--mode rework|mirror|donor] [--site-ignore "data,*.json"]
 *   node state.mjs <папка> add "<задача>" [--priority P2] [--area hero|mobile|3d|content|motion|...]
 *   node state.mjs <папка> set <id> impl=DONE runtime=VERIFIED --evidence runtime/desktop.json#5
 *   node state.mjs <папка> set <id> visual=VERIFIED --evidence after/home-mobile-first.png mobile=NA --note "почему"
 *   node state.mjs <папка> set <id>[,<id>…] impl=DOING priority=P1
 *   node state.mjs <папка> stage <этап> done|active|todo|skipped
 *   node state.mjs <папка> show [--strict]
 *   node state.mjs --help
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
 * Этапы: discovered browser design tech tools tokens plan ui content assets three motion
 *   runtime visual mobile perf a11y polish report; отметки done ✓ · active → · todo · · skipped –.
 * Режим прогона (--mode) пишется в журнал и печатается в show — для отчёта.
 *
 * Флаги:
 *   --site <папка>     папка с файлами сайта: исходники (rework), зеркало <прогон>/mirror
 *                      (mirror) или новый сайт (donor). По времени её файлов проверяется,
 *                      что доказательство снято после последней правки. Без неё VERIFIED
 *                      не ставится. Не учитываются node_modules, .git, кэши сборщиков,
 *                      *.log, базы (*.db, *.sqlite, -wal, -shm) и папки прогонов.
 *   --mode <режим>     rework — переработка по исходникам, mirror — через зеркало
 *                      (исходников нет), donor — новый сайт по донору. Идёт в отчёт.
 *   --site-ignore      что ещё не считать правкой сайта: имена папок и файлов или маски
 *                      через запятую («data,uploads,*.json»). Хранится в журнале.
 *   --force            init поверх существующего журнала; старый сохраняется рядом.
 *   --evidence <файл[#шаг]>   доказательство для всех VERIFIED этого вызова.
 *   --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf
 *                      своё доказательство для одной проверки (главнее --evidence).
 *   --note "…"         заметка к задаче; для NA — обязательная причина. Без текста — ошибка.
 *                      Заметку, которая начинается с «--», писать так: --note="--scroll прошёл".
 *   --strict           (show) код выхода 1, если итог не OK.
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
 *   NA — только с --note: причина, почему проверка к задаче не относится.
 *   FAILED и NEEDS_WORK — --evidence по желанию (файл должен существовать).
 *   У каждой проверки хранится своё время и доказательство (proof в state.json:
 *   status, at, evidence {file, step, kind, verdict, takenAt, siteEditAt, …}, note).
 *
 * Пишет: <папка>/state.json; init --force сохраняет старый журнал в state.<время>.json.
 * Код выхода: 0 — готово (и после --help); 1 — отказ (ошибка в аргументах, доказательство
 * не годится, нет журнала) или show --strict с итогом не OK.
 *
 * show печатает режим, папку сайта и её последнюю правку, чек-лист этапов, таблицу задач,
 * список доказательств и итог по проверкам сделанных задач: «проверено N, неприменимо M,
 * без доказательства K, устарело S, …». Доказательство, снятое раньше последней правки
 * сайта, помечается «устарело»: проверку прогнать заново и поставить VERIFIED ещё раз.
 * Итог FAIL — есть отметки без доказательства или устаревшие; WARN — задачи P0–P2 ещё не
 * проверены до конца; OK — всё сделанное проверено.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, writeJson, parseViewport } from './lib.mjs';

const IMPL = ['TODO', 'DOING', 'DONE', 'BLOCKED', 'DROPPED'];
const IMPL_ALIAS = { IN_PROGRESS: 'DOING', 'IN-PROGRESS': 'DOING' };
const CHECK = ['NOT_CHECKED', 'VERIFIED', 'FAILED', 'NEEDS_WORK', 'NA'];
const CHECKS = ['runtime', 'visual', 'mobile', 'perf'];
const PRIO = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const MODES = { rework: 'переработка по исходникам', mirror: 'переработка через зеркало (исходников нет)', donor: 'новый сайт по донору' };
const STAGES = [
  ['discovered', 'Сайт разведан'], ['browser', 'Открыт в браузере, консоль и сеть сняты'], ['design', 'Дизайн разобран глазами'],
  ['tech', 'Техническая архитектура понята'], ['tools', 'Инструменты выбраны'], ['tokens', 'Дизайн-система снята'],
  ['plan', 'План с приоритетами составлен'], ['ui', 'Вёрстка и UI'], ['content', 'Тексты'], ['assets', 'Картинки и графика'],
  ['three', '3D'], ['motion', 'Движение'], ['runtime', 'Проверка в браузере'], ['visual', 'Визуальная проверка'],
  ['mobile', 'Мобильная проверка'], ['perf', 'Скорость'], ['a11y', 'Доступность'], ['polish', 'Полировка'], ['report', 'Итоговый отчёт'],
];
const MARK = { done: '✓', active: '→', todo: '·', skipped: '–' };
const IMG_EXT = /\.(png|jpe?g|webp|avif|gif)$/i;
/* что правкой сайта не считается */
const IGNORE_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '.cache', '.parcel-cache', '.turbo', '.vite', '.next', '.nuxt', '.svelte-kit', '.angular', '.idea', '.vscode', '__pycache__']);
const IGNORE_FILE = /(\.(log|db|sqlite3?|tmp|temp|swp|swo|pid|lock)$|-(wal|shm|journal)$|~$|^\.DS_Store$|^Thumbs\.db$|^desktop\.ini$)/i;

const argv = process.argv.slice(2);
const VALUE_KEYS = ['note', 'evidence', ...CHECKS.map((c) => `evidence-${c}`), 'site', 'mode', 'site-ignore', 'priority', 'area'];
const FLAG_KEYS = ['force', 'strict', 'help', 'h'];
const { pos, opt } = parseArgs(argv, { values: VALUE_KEYS, flags: FLAG_KEYS });
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
const [dir, cmd, ...rest] = pos;
if (!dir || !cmd) die('Нужно: node state.mjs <папка> init|meta|add|set|stage|show ... (--help — справка)');
const runRoot = path.resolve(dir);
const file = path.join(runRoot, 'state.json');
const fmt = (ms) => new Date(ms).toLocaleString('sv-SE');
/* настоящий путь: раскрывает короткие имена Windows (C225~1) и ссылки, иначе «внутри папки» не сравнить */
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const norm = (p) => { const r = real(p); return process.platform === 'win32' ? r.toLowerCase() : r; };
const inside = (child, parent) => { const rel = path.relative(norm(parent), norm(child)); return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel)); };
let st = readJson(file);

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

/**
 * Проверить доказательство. Возвращает { rec, problems: [{code, msg}], warns: [] }.
 * code: missing | type | noverdict | fail | step | vp | nosite | inside | stale.
 */
function checkEvidence(spec, check, { lenient = false } = {}) {
  const problems = []; const warns = [];
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
  return { problems, warns, rec };
}
const evSpec = (e) => `${e.file}${e.step ? '#' + e.step : ''}`;
const sameEvidence = (a, b) => !!(a && b) && a.file.toLowerCase() === b.file.toLowerCase() && String(a.step || '') === String(b.step || '');

/* ---------- состояние клетки таблицы ---------- */

const PROBLEM_LABEL = { missing: 'файла нет', fail: 'протокол FAIL', stale: 'устарело', nosite: 'нет папки сайта', type: 'не годится', noverdict: 'без вердикта', step: 'нет шага', vp: 'не телефон', inside: 'в папке сайта' };
function cellState(t, c) {
  const s = t[c]; const p = t.proof && t.proof[c];
  if (s === 'VERIFIED') {
    if (!p || !p.evidence) return { cat: 'noproof', label: 'VERIFIED (нет доказательства)' };
    const r = checkEvidence(evSpec(p.evidence), c);
    if (!r.problems.length) return { cat: 'ok', label: 'VERIFIED', r };
    const order = ['missing', 'fail', 'type', 'noverdict', 'step', 'vp', 'inside', 'nosite', 'stale'];
    const main = order.find((code) => r.problems.some((x) => x.code === code));
    const cat = main === 'stale' ? 'stale' : main === 'nosite' ? 'nosite' : 'noproof';
    return { cat, label: `VERIFIED (${PROBLEM_LABEL[main]})`, r };
  }
  if (s === 'NA') return p && p.note ? { cat: 'na', label: 'NA' } : { cat: 'noproof', label: 'NA (без причины)' };
  if (s === 'FAILED' || s === 'NEEDS_WORK') return { cat: 'failed', label: s };
  return { cat: 'unchecked', label: s || 'NOT_CHECKED' };
}

/* ---------- настройки журнала: папка сайта, режим ---------- */

function applyMeta(target) {
  if (opt.site !== undefined) {
    if (opt.site === true || !String(opt.site).trim()) die('--site без папки: --site <папка с файлами сайта>');
    const s = path.resolve(String(opt.site));
    if (!fs.existsSync(s) || !fs.statSync(s).isDirectory()) die(`Нет папки сайта ${s}`);
    if (norm(s) === norm(runRoot)) die('Папка сайта совпадает с папкой прогона: укажите папку, где лежат файлы сайта (для зеркала — <прогон>/mirror)');
    target.site = s;
  }
  if (opt.mode !== undefined) {
    const m = String(opt.mode).toLowerCase();
    if (!(m in MODES)) die(`--mode: ${Object.keys(MODES).join(' | ')} (${Object.entries(MODES).map(([k, v]) => `${k} — ${v}`).join('; ')})`);
    target.mode = m;
  }
  if (opt['site-ignore'] !== undefined) {
    if (opt['site-ignore'] === true) die('--site-ignore без списка: --site-ignore "data,*.json"');
    target.siteIgnore = String(opt['site-ignore']).split(',').map((x) => x.trim()).filter(Boolean);
  }
}
const metaLines = (s) => [
  `Режим: ${s.mode ? `${s.mode} — ${MODES[s.mode]}` : 'не указан (meta --mode rework|mirror|donor)'}`,
  `Сайт: ${s.site || 'папка не указана (meta --site <папка>) — VERIFIED не ставится, свежесть доказательств не проверить'}${s.siteIgnore && s.siteIgnore.length ? ` · не считать правкой: ${s.siteIgnore.join(', ')}` : ''}`,
];

/* ---------- команды ---------- */

if (cmd === 'init') {
  if (!rest[0]) die('init <url> "<запрос>" --site <папка сайта> --mode rework|mirror|donor');
  if (st && !opt.force) die(`Журнал уже есть: ${file} (задач ${(st.tasks || []).length}). Начать заново — с --force (старый сохранится рядом), поменять папку сайта или режим — meta.`);
  if (st && opt.force) { const bak = path.join(runRoot, `state.${new Date().toISOString().replace(/[:.]/g, '-')}.json`); fs.copyFileSync(file, bak); console.log(`Старый журнал сохранён: ${bak}`); }
  st = { url: rest[0], request: rest[1] || '', createdAt: new Date().toISOString(), mode: null, site: null, stages: Object.fromEntries(STAGES.map(([k]) => [k, 'todo'])), tasks: [] };
  applyMeta(st);
  st.stages.discovered = 'active';
  writeJson(file, st); console.log(`Журнал создан: ${file}`);
  const [modeLine, siteLine] = metaLines(st);
  console.log(`${st.mode ? 'OK  ' : 'WARN'} ${modeLine}`); console.log(`${st.site ? 'OK  ' : 'WARN'} ${siteLine}`);
  process.exit(0);
}
if (!st) die(`Нет журнала ${file} — сначала init.`);
for (const t of st.tasks || []) if (IMPL_ALIAS[t.impl]) t.impl = IMPL_ALIAS[t.impl];

if (cmd === 'meta') {
  const before = JSON.stringify([st.site, st.mode, st.siteIgnore]);
  applyMeta(st);
  if (JSON.stringify([st.site, st.mode, st.siteIgnore]) !== before) { writeJson(file, st); console.log('Записано.'); }
  for (const l of metaLines(st)) console.log(l);
  const L = siteLatest();
  if (L) console.log(`Последняя правка сайта: ${L.file ? `${L.file} ${fmt(L.mtimeMs)}` : 'файлов нет'} (файлов ${L.files}${L.capped ? ', обход остановлен на 50 000' : ''})`);
} else if (cmd === 'add') {
  if (!rest[0]) die('add "<задача>" [--priority P2] [--area ...]');
  const p = opt.priority && opt.priority !== true ? String(opt.priority).toUpperCase() : 'P2'; if (!PRIO.includes(p)) die(`Приоритет: ${PRIO.join(', ')}`);
  const id = st.tasks.reduce((mx, t) => Math.max(mx, Number(t.id) || 0), 0) + 1;
  const now = new Date().toISOString();
  st.tasks.push({ id, task: rest[0], priority: p, area: opt.area && opt.area !== true ? String(opt.area) : null, impl: 'TODO', runtime: 'NOT_CHECKED', visual: 'NOT_CHECKED', mobile: 'NOT_CHECKED', perf: 'NOT_CHECKED', note: '', proof: {}, createdAt: now, updatedAt: now });
  writeJson(file, st); console.log(`#${id} ${p} ${rest[0]}`);
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
    const r = checkEvidence(spec, c);
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
  for (const t of tasks) {
    t.proof = t.proof || {};
    if (changes.impl) { t.impl = changes.impl; t.implAt = now; }
    if (changes.priority) t.priority = changes.priority;
    for (const c of CHECKS) {
      if (!changes[c]) continue;
      t[c] = changes[c];
      if (changes[c] === 'NOT_CHECKED') { delete t.proof[c]; continue; }
      t.proof[c] = { status: changes[c], at: now, ...(recs[c] ? { evidence: recs[c] } : {}), ...(note ? { note } : {}) };
    }
    if (note) t.note = note;
    t.updatedAt = now;
  }
  writeJson(file, st);
  for (const w of warns) console.log(`WARN ${w}`);
  for (const t of tasks) {
    const parts = CHECKS.map((c) => `${c} ${t[c]}${changes[c] && recs[c] && changes[c] !== 'NOT_CHECKED' ? ` ← ${evSpec(recs[c])}${recs[c].verdict ? ` (${recs[c].stepStatus || recs[c].verdict})` : ''}` : ''}`);
    console.log(`OK   #${t.id} ${t.task}: impl ${t.impl} · ${parts.join(' · ')}${t.note ? ` · ${t.note}` : ''}`);
  }
} else if (cmd === 'stage') {
  const [k, v] = rest; if (!(k in st.stages)) die(`Этапы: ${STAGES.map(([s]) => s).join(', ')}`); if (!(v in MARK)) die('done|active|todo|skipped');
  st.stages[k] = v; writeJson(file, st); console.log(`${MARK[v]} ${STAGES.find(([s]) => s === k)[1]}`);
} else if (cmd === 'show') {
  const L = siteLatest();
  console.log(`# ${st.url}\n\nЗапрос: ${st.request}`);
  for (const l of metaLines(st)) console.log(l);
  if (st.site) console.log(`Последняя правка сайта: ${L && L.file ? `${L.file} ${fmt(L.mtimeMs)}` : fs.existsSync(st.site) ? 'файлов нет' : 'папки нет'}`);
  console.log('');
  for (const [k, title] of STAGES) console.log(`${MARK[st.stages[k]] || '·'} ${title}`);

  const sorted = [...st.tasks].sort((a, b) => a.priority.localeCompare(b.priority) || a.id - b.id);
  const cells = new Map(sorted.map((t) => [t.id, Object.fromEntries(CHECKS.map((c) => [c, cellState(t, c)]))]));
  console.log('\n| # | P | задача | реализация | runtime | визуал | телефон | скорость | заметка |\n|---|---|---|---|---|---|---|---|---|');
  for (const t of sorted) {
    const cs = cells.get(t.id);
    const naNotes = CHECKS.filter((c) => t[c] === 'NA' && t.proof && t.proof[c] && t.proof[c].note && t.proof[c].note !== t.note).map((c) => `${c} NA: ${t.proof[c].note}`);
    console.log(`| ${t.id} | ${t.priority} | ${t.task} | ${t.impl} | ${CHECKS.map((c) => cs[c].label).join(' | ')} | ${[t.note, ...naNotes].filter(Boolean).join(' · ').replace(/\|/g, '/')} |`);
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
      const wr = r && r.warns && r.warns.length && t[c] === 'VERIFIED' ? ` · WARN ${r.warns.join('; ')}` : '';
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
  const openHigh = st.tasks.filter((t) => ['P0', 'P1', 'P2'].includes(t.priority) && t.impl !== 'DROPPED' && !ready(t));
  const bad = cnt.noproof + cnt.nosite + cnt.stale;
  const verdict = bad ? 'FAIL' : openHigh.length ? 'WARN' : 'OK';
  const msg = bad
    ? `${cnt.noproof + cnt.nosite ? `без доказательства: ${cnt.noproof + cnt.nosite}` : ''}${cnt.noproof + cnt.nosite && cnt.stale ? ', ' : ''}${cnt.stale ? `устарело: ${cnt.stale} (сайт правили после проверки)` : ''} — прогнать проверки заново и поставить VERIFIED с --evidence`
    : openHigh.length ? `P0–P2 не проверены до конца: ${openHigh.map((t) => `#${t.id}`).join(', ')}` : 'всё сделанное проверено';
  console.log(`\n${verdict}: ${msg}`);
  if (opt.strict && verdict !== 'OK') process.exit(1);
} else die(`Неизвестная команда ${cmd}`);
