#!/usr/bin/env node
/**
 * Сверка выкладки: страница есть в проекте, но не попадает на бой.
 *
 *   node deploy-check.mjs <папка проекта> [--pages "/,/napravleniya/"] [--url https://сайт] [--out папка] [--tag имя]
 *                         [--no-fail] [--json <файл>|-]
 *   node deploy-check.mjs --selftest
 *   node deploy-check.mjs --help   (или -h)
 *
 * Случай, ради которого написано (KIMota777/sites, 10.2026): Dockerfile копирует папки страниц по списку
 * («COPY razrabotka ./razrabotka» строкой на папку), новую napravleniya/ в список не добавили — локально всё
 * зелёное (сервер разработки отдаёт папку проекта целиком), на бою было бы 404. Скрипт читает конфиг выкладки,
 * собирает страницы и всё, на что они ссылаются на своём сайте, и для каждого файла отвечает: попадёт ли он на бой.
 * Ничего не собирает и не запускает: Dockerfile, .dockerignore и конфиги только читаются.
 *
 * Флаги:
 *   --pages   страницы через запятую: пути («/,/napravleniya/») или адреса своего сайта. Проверяются эти страницы,
 *             их ассеты и файлы страниц, на которые они ссылаются. Без флага — обход ссылок от главной (index.html
 *             веб-корня) плюс каждая папка первого уровня с index.html (новая страница без ссылок на неё — тоже)
 *             и .html в корне; служебные папки (tests, fixtures, tools, scripts, node_modules, coverage, .*) не берутся.
 *             Git Bash превращает «/…» в «C:/Program Files/Git/…» — приставка снимается (lib.unmangle), путь читается
 *             как набран; чтобы оболочка не трогала аргумент вовсе — MSYS_NO_PATHCONV=1 или пути без первой «/».
 *   --url     боевой адрес: страницы из списка ещё и запрашиваются на бою — GET (страница) и HEAD (ассет, на который
 *             упала сверка), только чтение, не больше 50 запросов вместе с пробой заглушки. «Локально есть — на бою
 *             404» — FAIL; сервер отдаёт 200 на любой адрес (заглушка SPA) — страница сверяется с заглушкой по
 *             заголовку и размеру: совпала — FAIL; 5xx и сбой сети — WARN; заголовок страницы на бою другой — INFO.
 *   --out     папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт из --url> или local-<имя папки>);
 *             протокол — <out>/deploy-check/<tag>.json.
 *   --tag     имя протокола, по умолчанию deploy.
 *   --no-fail код выхода 0 даже при итоге FAIL (как у runtime). Без флага FAIL — код 1: цепочка команд перед
 *             выкладкой на нём останавливается. --strict принимается по-старому и ничего не меняет.
 *   --json <файл>|-  протокол ещё и сюда; «-» — JSON в stdout, текст — в stderr.
 *   --selftest  стенды fixtures/deploy-check (уменьшенная копия Dockerfile KIMota777/sites без napravleniya и
 *             варианты конфигов) и свой сервер «боя» на 127.0.0.1; итог «N из N».
 *   --help, -h  эта справка.
 * Неизвестный флаг — ошибка с кодом 1. Папка и адрес проверяются до чтения файлов и сети.
 *
 * Конфиг выкладки (берётся первый найденный; остальные — строкой INFO):
 *   Dockerfile     (и docker-compose.yml: build.context, build.dockerfile) — последняя стадия: WORKDIR, COPY/ADD с
 *                  ключи COPY from= (собирается в образе — WARN «не проверить»), parents=, exclude=, JSON-форма, маски
 *                  (* ? [..] **), ARG/ENV в путях; семантика Docker: папка-источник копирует содержимое, маска с
 *                  папкой — тоже содержимое, файл в «dest/» — по имени. .dockerignore — по правилам Docker (от корня
 *                  контекста, «!» — исключение, последнее правило решает). Веб-корень образа: nginx — root из
 *                  скопированного *.conf или /usr/share/nginx/html; caddy — root из скопированного Caddyfile или
 *                  /usr/share/caddy; httpd — /usr/local/apache2/htdocs; иначе WORKDIR, а у express — каталог
 *                  express.static(...) из файла запуска (CMD node x.js или scripts.start). Папка проекта, которая
 *                  ложится в веб-корень, — по COPY (голоса), по умолчанию корень контекста.
 *   vercel.json    outputDirectory (или builds[].src @vercel/static), cleanUrls; .vercelignore (как .gitignore).
 *   netlify.toml   [build] base и publish.
 *   GitHub Pages   .github/workflows/*.yml: actions/upload-pages-artifact path (по умолчанию _site),
 *                  peaceiris/actions-gh-pages publish_dir, JamesIves folder; без workflow, но с CNAME или .nojekyll —
 *                  выкладка ветки (корень или docs/): без .nojekyll Jekyll не публикует папки и файлы на «_» и «.».
 *   Caddyfile, nginx *.conf без Docker — root сервера; как файлы туда попадают — по rsync/scp из deploy/*.sh, *.sh,
 *                  Makefile, package.json scripts, workflows (источник, адрес, ключ exclude у rsync). Не нашлось — WARN.
 *   package.json   "files" — список того, что уходит в пакет; scripts.build со сборщиком (vite, astro, next export,
 *                  react-scripts, eleventy, hugo, parcel) — веб-корень = папка сборки; её нет — WARN «соберите и повторите».
 *   ничего нет     WARN «конфиг выкладки не найден» — проверено только, что ссылки ведут на файлы проекта.
 *
 * Ссылки: href, src, srcset, poster, data-src(set), imagesrcset, <meta og:image/twitter:image>, url() и @import в
 * <style>, style="", подключённых CSS (до 3 уровней), import из подключённых модулей JS (до 3 уровней). Свой сайт —
 * относительные, от корня и абсолютные на хост --url или canonical/og:url страницы; чужие хосты, mailto:, tel:, data:,
 * javascript:, якоря и шаблоны ({{ }}, ${}) не берутся. Путь → файл: «/x/» → x/index.html; «/x» → x, x.html, x/index.html.
 * Ссылка, которой нет и локально, — INFO (маршрут сервера или битая ссылка — это не про выкладку).
 *
 * Вердикты: FAIL — файл страницы или ассета не попадёт на бой (нет COPY, исключён .dockerignore/.vercelignore/rsync
 * ключом exclude, вне папки публикации, папка на «_» без .nojekyll, копируется не по тому пути), а с --url — локально есть,
 * на бою 404 или заглушка. WARN — проверить нечем (собирается при сборке, конфига нет, root сервера без rsync),
 * 5xx на бою. INFO — справка. Итог — худший. Строка FAIL группирует файлы по папке и предлагает строку COPY.
 *
 * Протокол (writeJson): project, config { kind, file, webRoot, localRoot, other[] }, pages[], files[{ path, kind
 * (page|asset|file), status, why, cause (missing|ignored|misplaced|built|run|outside|jekyll), target?, sugg?, by[] }],
 * unresolved[], live { base, requests, max, fallback, pages[], assets[] } | null, lines[], verdict.
 * Код выхода: 0 — итог OK или WARN (WARN код не меняет), задан --no-fail, справка, --selftest сошёлся;
 * 1 — итог FAIL, неверные аргументы или провал --selftest.
 */
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, runDir, writeJson, ensureDir, capSlug, unmangle } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HELP = () => fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const MAX_REQ = 50;
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '.next', '.nuxt', '.cache', '.vercel', '.netlify', '.idea', '.vscode', '.playwright-mcp', 'coverage', 'playwright-report', 'test-results']);
const DEV_DIRS = /^(tests?|__tests__|fixtures?|spec|e2e|tools|scripts|coverage|node_modules|playwright-report|test-results|\..*)$/i;
const ORDER = { FAIL: 3, WARN: 2, INFO: 1, OK: 0 };
const worse = (a, b) => (ORDER[b] > ORDER[a] ? b : a);
const pl = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return `${n} ${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`; };
const posix = (p) => p.split(path.sep).join('/');
const clean = (p) => { const parts = []; for (const s of String(p).split('/')) { if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); } return parts.join('/'); };
const joinP = (...a) => clean(a.filter((x) => x !== '' && x != null).join('/'));
const under = (rel, root) => !root || rel === root || rel.startsWith(root + '/');
const relTo = (rel, root) => (!root ? rel : rel === root ? '' : rel.slice(root.length + 1));

/* =====================================================================
   Файлы проекта
   ===================================================================== */
function listFiles(root, limit = 60000) {
  const out = new Set(); const dirs = new Set(['']);
  const walk = (dir) => {
    let ents; try { ents = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.size >= limit) return;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (SKIP_DIRS.has(e.name)) continue; dirs.add(rel); walk(rel); } else if (e.isFile() || e.isSymbolicLink()) out.add(rel);
    }
  };
  walk(''); return { files: out, dirs, capped: out.size >= limit };
}
const readText = (root, rel, max = 2_000_000) => { try { const b = fs.readFileSync(path.join(root, rel)); return b.length > max ? b.subarray(0, max).toString('utf8') : b.toString('utf8'); } catch { return null; } };

/* =====================================================================
   Маски: Docker (от корня контекста) и .gitignore (без «/» — на любой глубине)
   ===================================================================== */
const hasGlob = (s) => /[*?[]/.test(s);
function globRe(pat, anyDepth = false) {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '*') {
      if (pat[i + 1] === '*') { if (pat[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i++; } }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '[') { const j = pat.indexOf(']', i + 2); if (j > i) { let cls = pat.slice(i + 1, j); if (cls[0] === '!' || cls[0] === '^') cls = '^' + cls.slice(1); re += '[' + cls.replace(/\\/g, '\\\\') + ']'; i = j; } else re += '\\['; }
    else if (c === '\\' && i + 1 < pat.length) re += '\\' + pat[++i];
    else re += c.replace(/[.+^${}()|/]/g, '\\$&');
  }
  return new RegExp('^' + (anyDepth ? '(?:.*/)?' : '') + re + '$');
}
/* правила игнора → (rel) → { ignored, rule } | null; последнее совпавшее правило решает; папка — со всем содержимым */
function makeIgnore(text, mode, file) {
  const rules = [];
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    let s = raw.replace(/\s+$/, ''); if (!s || s.startsWith('#')) return;
    const neg = s.startsWith('!'); if (neg) s = s.slice(1);
    s = s.replace(/^\.\//, ''); let anchored = mode === 'docker';
    if (s.startsWith('/')) { s = s.slice(1); anchored = true; }
    const dirOnly = s.endsWith('/'); s = s.replace(/\/+$/, '');
    if (!s) return;
    if (mode === 'docker') s = clean(s) || s;
    const any = !anchored && !s.includes('/');
    rules.push({ neg, re: globRe(s, any), dirOnly, src: raw.trim(), line: i + 1, file });
  });
  const test = (rel) => {
    const segs = rel.split('/'); let hit = null;
    for (const r of rules) {
      let m = false;
      for (let k = 1; k <= segs.length && !m; k++) { if (r.dirOnly && k === segs.length) continue; if (r.re.test(segs.slice(0, k).join('/'))) m = true; }
      if (m) hit = r;
    }
    return hit && !hit.neg ? { ignored: true, rule: `${hit.file ? `${hit.file}:${hit.line} ` : ''}«${hit.src}»` } : null;
  };
  test.rules = rules; return test;
}

/* =====================================================================
   Dockerfile
   ===================================================================== */
function splitArgs(s) { const out = []; const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(s))) out.push(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]); return out; }
function parseDockerfile(text) {
  const raw = String(text).split(/\r?\n/); const ins = []; let buf = '', start = 0;
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i]; const t = l.trim();
    if (!buf && (!t || t.startsWith('#'))) continue;
    if (buf && t.startsWith('#')) continue;
    if (!buf) start = i + 1;
    if (/\\\s*$/.test(l)) { buf += l.replace(/\\\s*$/, ' '); continue; }
    buf += l; ins.push({ line: start, text: buf.trim() }); buf = '';
  }
  if (buf) ins.push({ line: start, text: buf.trim() });
  const stages = []; const globalArgs = {}; let st = null;
  const sub = (s, vars) => String(s).replace(/\$\{([A-Za-z_]\w*)(?::?-([^}]*))?\}|\$([A-Za-z_]\w*)/g, (m0, a, def, b) => { const k = a || b; return vars[k] != null ? vars[k] : def != null ? def : m0; });
  for (const { line, text: t } of ins) {
    const m = /^(\w+)\s*(.*)$/s.exec(t); if (!m) continue;
    const cmd = m[1].toUpperCase(); const rest = m[2];
    if (cmd === 'ARG' && !st) { for (const kv of splitArgs(rest)) { const [k, ...v] = kv.split('='); globalArgs[k] = v.length ? v.join('=') : globalArgs[k]; } continue; }
    if (cmd === 'FROM') {
      const a = splitArgs(rest).filter((x) => !x.startsWith('--')); const image = sub(a[0] || '', globalArgs);
      const name = a[1] && a[1].toUpperCase() === 'AS' ? a[2] : null;
      const parent = stages.find((s) => s.name && s.name === image);
      st = { image, name, line, workdir: parent ? parent.workdir : '/', vars: { ...globalArgs, ...(parent ? parent.vars : {}) }, copies: parent ? [...parent.copies] : [], runs: [], cmd: null, parent: parent ? parent.name : null };
      stages.push(st); continue;
    }
    if (!st) continue;
    if (cmd === 'ARG' || cmd === 'ENV') { const parts = /=/.test(rest) ? splitArgs(rest) : [rest.replace(/\s+/, '=')]; for (const kv of parts) { const [k, ...v] = kv.split('='); if (k) st.vars[k] = v.length ? sub(v.join('='), st.vars) : st.vars[k] ?? globalArgs[k]; } continue; }
    if (cmd === 'WORKDIR') { const w = sub(rest.trim().replace(/^["']|["']$/g, ''), st.vars); st.workdir = w.startsWith('/') ? '/' + clean(w) : '/' + joinP(st.workdir, w); continue; }
    if (cmd === 'RUN') { st.runs.push({ line, text: rest }); continue; }
    if (cmd === 'CMD' || cmd === 'ENTRYPOINT') { st.cmd = rest; continue; }
    if (cmd === 'COPY' || cmd === 'ADD') {
      if (/<<\s*[-~]?["']?\w+/.test(rest)) continue; /* heredoc — файл пишется на месте, из проекта ничего */
      let r = rest.trim(); const flags = {}; const excludes = [];
      while (/^--/.test(r)) { const fm = /^--([\w-]+)(?:=(\S+))?\s*/.exec(r); if (!fm) break; if (fm[1] === 'exclude') excludes.push(fm[2]); else flags[fm[1]] = fm[2] == null ? true : fm[2]; r = r.slice(fm[0].length); }
      let parts;
      if (r.startsWith('[')) { try { parts = JSON.parse(r); } catch { parts = splitArgs(r.replace(/[[\],]/g, ' ')); } } else parts = splitArgs(r);
      parts = parts.map((x) => sub(x, st.vars));
      if (parts.length < 2) continue;
      const dest0 = parts[parts.length - 1]; const srcs = parts.slice(0, -1);
      const destAbs = dest0.startsWith('/') ? '/' + clean(dest0) : '/' + joinP(st.workdir, dest0);
      const destDir = srcs.length > 1 || /\/$/.test(dest0) || dest0 === '.' || dest0 === './' || dest0 === '..' || destAbs === st.workdir || srcs.some(hasGlob);
      st.copies.push({ cmd, line, text: `${cmd} ${rest}`.trim(), srcs, dest: dest0, destAbs, destDir, from: flags.from || null, parents: !!flags.parents, excludes: excludes.map((x) => globRe(clean(x))), url: srcs.some((s) => /^https?:\/\//i.test(s) || /^git@/.test(s)), workdir: st.workdir });
    }
  }
  return { stages, final: stages[stages.length - 1] || null };
}
/* куда в образе ляжет файл проекта rel (от корня контекста): [{ target, copy }] */
function imageTargets(rel, stage) {
  const out = [];
  for (const cp of stage.copies) {
    if (cp.from || cp.url) continue;
    for (const s0 of cp.srcs) {
      const s = clean(s0.replace(/^\.\//, ''));
      let base = null;
      if (hasGlob(s)) { const re = globRe(s); const segs = rel.split('/'); for (let k = 1; k <= segs.length; k++) { const pre = segs.slice(0, k).join('/'); if (re.test(pre)) { base = pre; break; } } if (base == null) continue; }
      else if (s === '' || rel === s || rel.startsWith(s + '/')) base = s;
      else continue;
      if (cp.excludes.some((re) => re.test(rel) || rel.split('/').some((_, k, a) => re.test(a.slice(0, k + 1).join('/'))))) { out.push({ target: null, excluded: true, copy: cp }); continue; }
      const isDir = base === '' || base !== rel;
      let target;
      if (cp.parents) target = '/' + joinP(cp.destAbs, rel);
      else if (isDir) target = '/' + joinP(cp.destAbs, relTo(rel, base));
      else target = cp.destDir ? '/' + joinP(cp.destAbs, path.posix.basename(rel)) : cp.destAbs;
      out.push({ target, copy: cp });
    }
  }
  return out;
}
/* веб-корень образа: по образу, конфигу сервера и файлу запуска */
function dockerWebRoot(final, ctxRoot, files) {
  const img = final.image.toLowerCase().replace(/^docker\.io\/(library\/)?/, '');
  const fromCopied = (destRe, rx) => {
    for (const cp of final.copies) {
      if (cp.from || cp.url || !destRe.test(cp.destAbs)) continue;
      for (const s of cp.srcs) { const t = readText(ctxRoot, clean(s)); if (!t) continue; const m = rx.exec(t); if (m) return { root: '/' + clean(m[1]), how: `${m[0].trim()} в ${clean(s)}` }; }
    }
    return null;
  };
  if (/^nginx|\/nginx/.test(img)) return fromCopied(/^\/etc\/nginx/, /^\s*root\s+([^;\s]+)\s*;/m) || { root: '/usr/share/nginx/html', how: 'образ nginx по умолчанию' };
  if (/^caddy|\/caddy/.test(img)) return fromCopied(/^\/etc\/caddy/, /^\s*root\s+(?:\*\s+)?(\/\S+)/m) || { root: '/usr/share/caddy', how: 'образ caddy по умолчанию' };
  if (/^httpd|\/httpd/.test(img)) return { root: '/usr/local/apache2/htdocs', how: 'образ httpd' };
  /* приложение: файл запуска и express.static */
  let entry = null;
  const cmd = final.cmd || '';
  const cm = /\bnode\b[^"']*?["',\s]+(?:--[\w-]+(?:=\S+)?["',\s]+)*([\w./-]+\.(?:m?js|cjs))/.exec(cmd);
  if (cm) entry = cm[1];
  else { try { const pj = JSON.parse(readText(ctxRoot, 'package.json') || '{}'); const sm = /\bnode\s+(?:--[\w-]+(?:=\S+)?\s+)*([\w./-]+\.(?:m?js|cjs))/.exec((pj.scripts && pj.scripts.start) || ''); if (sm) entry = sm[1]; else if (pj.main) entry = pj.main; } catch { /* нет package.json */ } }
  if (entry) {
    const relE = clean(entry.startsWith('/') ? path.posix.relative(final.workdir, entry) : entry);
    const t = readText(ctxRoot, relE);
    if (t) {
      const roots = []; const re = /express\.static\(\s*(?:path\.(?:join|resolve)\(\s*__dirname\s*(?:,\s*['"]([^'"]+)['"])?\s*\)|['"]([^'"]+)['"]|(__dirname))/g; let m;
      while ((m = re.exec(t))) { const sub = m[1] != null ? m[1] : m[2] != null ? m[2] : ''; roots.push('/' + joinP(final.workdir, clean(sub))); }
      if (roots.length) return { root: roots[0], roots, how: `express.static в ${relE}` };
    }
  }
  return { root: final.workdir, how: `WORKDIR ${final.workdir}${entry ? ` (файл запуска ${entry}; express.static не найден)` : ''}` };
}
/* папка контекста, которая ложится в веб-корень: по COPY (голоса), иначе корень контекста. Источник S ложится в
   образ на T (папка — содержимым в dest, файл — в dest/имя или в dest); T в веб-корне с хвостом X, а S кончается на X —
   голос за S без X; веб-корень внутри T — голос за S + остаток */
function dockerLocalRoot(final, webRoot, isDir) {
  const votes = new Map(); const vote = (k) => votes.set(k, (votes.get(k) || 0) + 1);
  for (const cp of final.copies) {
    if (cp.from || cp.url || cp.parents) continue;
    for (const s0 of cp.srcs) {
      const s = clean(s0.replace(/^\.\//, '')); if (hasGlob(s)) continue;
      const dir = s === '' || isDir(s);
      const T = dir ? cp.destAbs : cp.destDir ? '/' + joinP(cp.destAbs, path.posix.basename(s)) : cp.destAbs;
      if (T === webRoot || webRoot === '/' || T.startsWith(webRoot + '/')) {
        const tail = webRoot === '/' ? T.slice(1) : T.slice(webRoot.length + 1);
        if (!tail) vote(s); else if (s === tail) vote(''); else if (s.endsWith('/' + tail)) vote(s.slice(0, s.length - tail.length - 1));
      } else if (dir && webRoot.startsWith(T + '/')) vote(joinP(s, webRoot.slice(T.length + 1)));
    }
  }
  const best = [...votes].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
  return best ? best[0] : '';
}

/* =====================================================================
   Остальные конфиги выкладки
   ===================================================================== */
const BUILD_OUT = [[/\bvite\b/, 'dist'], [/\bastro\b/, 'dist'], [/\bnext\b.*\bexport\b|\bnext export\b/, 'out'], [/react-scripts\s+build/, 'build'], [/\beleventy\b|@11ty/, '_site'], [/\bhugo\b/, 'public'], [/\bparcel\b/, 'dist'], [/\bjekyll\b/, '_site'], [/\bgatsby\b/, 'public'], [/\bsvelte-kit\b|\bvite build\b/, 'build']];
function yamlVal(text, key) { const m = new RegExp(`^\\s*${key}\\s*:\\s*(?:["']([^"'\\n]+)["']|([^#\\n]+))`, 'm').exec(text); return m ? (m[1] || m[2] || '').trim() : null; }
function tomlVal(text, section, key) {
  const lines = String(text).split(/\r?\n/); let sec = '';
  for (const l of lines) { const s = /^\s*\[([^\]]+)\]\s*$/.exec(l); if (s) { sec = s[1].trim(); continue; } const m = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']`).exec(l); if (m && sec === section) return m[1]; }
  return null;
}
/* rsync/scp из скриптов выкладки: источник, адрес, исключения */
function findTransfers(root, files) {
  const cands = [...files].filter((f) => /^(deploy|scripts|bin|ops)\/[^/]+\.(sh|bash|zsh|mjs|js|ps1)$/i.test(f) || /^[^/]+\.(sh|bash)$/i.test(f) || /^Makefile$/i.test(f) || /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f) || f === 'package.json');
  const out = [];
  for (const f of cands) {
    const t = readText(root, f); if (!t) continue;
    const joined = t.replace(/\\\r?\n/g, ' ');
    for (const line of joined.split(/\r?\n|&&|;/)) {
      const m = /\b(rsync|scp)\b(.*)$/.exec(line); if (!m) continue;
      const args = splitArgs(m[2]); const excl = []; const pos = [];
      for (let i = 0; i < args.length; i++) { const a = args[i]; const uq = (v) => String(v || '').replace(/^['"]|['"]$/g, ''); if (a.startsWith('--exclude=')) excl.push(uq(a.slice(10))); else if (a === '--exclude') excl.push(uq(args[++i])); else if (a.startsWith('--exclude-from=')) { const x = readText(root, clean(uq(a.slice(15)))); if (x) excl.push(...x.split(/\r?\n/).filter(Boolean)); } else if (a === '-e' || a === '--rsh' || a === '-i') i++; else if (!a.startsWith('-')) pos.push(a.replace(/["',]+$/, '')); }
      if (pos.length < 2) continue;
      const dst = pos[pos.length - 1]; const dm = /^(?:[\w.-]+@)?[\w.-]+:(.+)$/.exec(dst); if (!dm) continue;
      for (const src of pos.slice(0, -1)) { if (/:/.test(src)) continue; out.push({ tool: m[1], file: f, src: clean(src.replace(/^\.\//, '')), contents: /\/$/.test(src) || src === '.' || src === './', remote: '/' + clean(dm[1]), excludes: excl }); }
    }
  }
  return out;
}
function detectConfig(root, files) {
  const found = [];
  const has = (f) => files.has(f);
  /* Docker и compose */
  let compose = null;
  for (const f of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) if (has(f)) { compose = f; break; }
  let dockerfile = has('Dockerfile') ? 'Dockerfile' : [...files].find((f) => /^Dockerfile[.\w-]*$/.test(f) && !/\.dockerignore$/.test(f)) || null; let context = '';
  if (compose) {
    const t = readText(root, compose) || '';
    const ctx = /^\s*context\s*:\s*["']?([^"'\s#]+)/m.exec(t); const df = /^\s*dockerfile\s*:\s*["']?([^"'\s#]+)/m.exec(t); const b = /^\s*build\s*:\s*["']?([^"'\s#{]+)["']?\s*$/m.exec(t);
    if (ctx) context = clean(ctx[1]); else if (b) context = clean(b[1]);
    if (df) { const p = joinP(context, df[1]); if (has(p)) dockerfile = p; }
    else if (context && has(joinP(context, 'Dockerfile'))) dockerfile = joinP(context, 'Dockerfile');
  }
  if (dockerfile) found.push({ kind: 'docker', file: dockerfile, context, compose });
  if (has('vercel.json')) found.push({ kind: 'vercel', file: 'vercel.json' });
  if (has('netlify.toml')) found.push({ kind: 'netlify', file: 'netlify.toml' });
  const wf = [...files].filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
  for (const f of wf) { const t = readText(root, f) || ''; if (/upload-pages-artifact|actions-gh-pages|github-pages-deploy-action|deploy-pages/.test(t)) { found.push({ kind: 'ghpages', file: f, text: t }); break; } }
  if (!found.some((x) => x.kind === 'ghpages') && (has('CNAME') || has('.nojekyll') || has('docs/CNAME'))) found.push({ kind: 'ghpages-branch', file: has('CNAME') ? 'CNAME' : has('docs/CNAME') ? 'docs/CNAME' : '.nojekyll' });
  const srv = [...files].filter((f) => /(^|\/)Caddyfile$/.test(f) || (/\.conf$/.test(f) && /(^|\/)(nginx|deploy|conf|config|etc)(\/|$)|nginx/i.test(f)));
  for (const f of srv) { const t = readText(root, f) || ''; const m = /Caddyfile$/.test(f) ? /^\s*root\s+(?:\*\s+)?(\S+)/m.exec(t) : /^\s*root\s+([^;\s]+)\s*;/m.exec(t); if (m) { found.push({ kind: /Caddyfile$/.test(f) ? 'caddy' : 'nginx', file: f, serverRoot: m[1] }); break; } }
  let pj = null; try { pj = JSON.parse(readText(root, 'package.json') || 'null'); } catch { pj = null; }
  if (pj && Array.isArray(pj.files)) found.push({ kind: 'pkg-files', file: 'package.json', list: pj.files });
  if (pj && pj.scripts && pj.scripts.build) { const hit = BUILD_OUT.find(([re]) => re.test(pj.scripts.build)); if (hit) found.push({ kind: 'build-output', file: 'package.json', dir: hit[1], script: pj.scripts.build }); }
  return found;
}

/* =====================================================================
   Ссылки страниц и стилей
   ===================================================================== */
function htmlRefs(html) {
  const refs = []; const styles = [];
  let h = html.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (m0, css) => { styles.push(css); return ''; });
  h = h.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
  h = h.replace(/(<template\b[^>]*>)[\s\S]*?<\/template>/gi, '$1');
  const tagRe = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g; let t;
  let base = null, canonical = null;
  while ((t = tagRe.exec(h))) {
    const tag = t[1].toLowerCase(); const attrs = {};
    const ar = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g; let a;
    while ((a = ar.exec(t[2]))) attrs[a[1].toLowerCase()] = (a[2] ?? a[3] ?? a[4] ?? '').replace(/&amp;/g, '&');
    if (tag === 'base' && attrs.href) { base = attrs.href; continue; }
    const rel = (attrs.rel || '').toLowerCase();
    if (tag === 'link' && /canonical/.test(rel) && attrs.href) canonical = attrs.href;
    if (tag === 'meta') { const k = (attrs.property || attrs.name || '').toLowerCase(); if (k === 'og:url' && attrs.content) canonical = canonical || attrs.content; if (/^(og:image|og:image:url|twitter:image|og:video|og:audio)$/.test(k) && attrs.content) refs.push({ url: attrs.content, kind: 'asset', tag }); continue; }
    if (attrs.style) styles.push(attrs.style);
    const page = tag === 'a' || tag === 'area' || (tag === 'link' && /alternate|next|prev/.test(rel));
    if (tag === 'link' && /canonical|preconnect|dns-prefetch/.test(rel)) continue;
    if (tag === 'form') continue;
    for (const k of ['href', 'src', 'poster', 'data-src', 'data-href', 'data-bg', 'data-background', 'xlink:href']) if (attrs[k]) refs.push({ url: attrs[k], kind: page && k === 'href' ? 'page' : 'asset', tag, css: tag === 'link' && /stylesheet/.test(rel) || /\.css(\?|#|$)/i.test(attrs[k]) && tag === 'link', js: tag === 'script' && /module/i.test(attrs.type || '') ? 'module' : tag === 'script' ? 'script' : tag === 'link' && /modulepreload/.test(rel) ? 'module' : null });
    for (const k of ['srcset', 'data-srcset', 'imagesrcset']) if (attrs[k]) for (const part of attrs[k].split(/,\s+(?=\S)/)) { const u = part.trim().split(/\s+/)[0]; if (u) refs.push({ url: u, kind: 'asset', tag }); }
  }
  for (const css of styles) for (const u of cssRefs(css)) refs.push({ url: u.url, kind: 'asset', tag: 'style', css: u.css });
  return { refs, base, canonical };
}
function cssRefs(css) {
  const out = []; const c = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const ur = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi; let m;
  while ((m = ur.exec(c))) { const u = (m[1] ?? m[2] ?? m[3] ?? '').trim(); if (u) out.push({ url: u, css: false }); }
  const ir = /@import\s+(?:url\(\s*)?["']([^"']+)["']/gi;
  while ((m = ir.exec(c))) out.push({ url: m[1], css: true });
  return out;
}
function jsImports(js) {
  const out = []; const re = /\bimport\s*(?:[\w*{}\s,]*?\bfrom\s*)?["']((?:\.{1,2}\/|\/)[^"']+)["']|\bimport\(\s*["']((?:\.{1,2}\/|\/)[^"']+)["']\s*\)/g; let m;
  while ((m = re.exec(js))) out.push(m[1] || m[2]);
  return out;
}

/* =====================================================================
   Разбор проекта
   ===================================================================== */
async function analyze(projectDir, o = {}) {
  const root = path.resolve(projectDir);
  const { files, dirs, capped } = listFiles(root);
  const lines = []; const L = (status, what, details = '') => lines.push({ status, what, details });
  const configs = detectConfig(root, files);
  const cfg = configs[0] || { kind: 'none' };
  const config = { kind: cfg.kind, file: cfg.file || null, other: configs.slice(1).map((c) => `${c.kind} (${c.file})`) };
  /* веб-корень и правило «попадёт ли файл» */
  let localRoot = ''; let cover = null; let blind = null; const notes = [];
  if (cfg.kind === 'docker') {
    const df = parseDockerfile(readText(root, cfg.file) || '');
    const final = df.final;
    if (!final) { blind = `в ${cfg.file} нет FROM`; }
    else {
      const ctx = cfg.context || '';
      const ign = files.has(joinP(ctx, '.dockerignore')) ? makeIgnore(readText(root, joinP(ctx, '.dockerignore')), 'docker', '.dockerignore') : null;
      const wr = dockerWebRoot(final, path.join(root, ctx), files);
      const webRoots = wr.roots || [wr.root];
      const lr = joinP(ctx, dockerLocalRoot(final, wr.root, (x) => dirs.has(joinP(ctx, x))));
      localRoot = lr;
      Object.assign(config, { context: ctx || '.', stage: `${final.image}${final.name ? ` AS ${final.name}` : ''} (строка ${final.line})`, workdir: final.workdir, webRoot: wr.root, webRoots, webRootHow: wr.how, copies: final.copies.length, dockerignore: ign ? ign.rules.length : null });
      const built = final.copies.filter((c) => c.from);
      if (built.length) notes.push(`собирается в образе: ${built.map((c) => `${c.text} (строка ${c.line})`).slice(0, 3).join('; ')}`);
      const copyDirs = final.copies.filter((c) => !c.from && !c.url && c.srcs.length === 1 && !hasGlob(c.srcs[0]));
      const perDir = copyDirs.filter((c) => { const s = clean(c.srcs[0]); return s && !s.includes('/') && (c.dest === `./${s}` || c.dest === `./${s}/` || c.destAbs === '/' + joinP(final.workdir, s)); }).length;
      cover = (rel) => {
        if (!under(rel, ctx)) return { status: 'FAIL', why: `вне контекста сборки (${ctx || '.'}) — COPY его не видит` };
        const relC = relTo(rel, ctx);
        const ig = ign && ign(relC); if (ig) return { status: 'FAIL', why: `исключён .dockerignore ${ig.rule}`, cause: 'ignored' };
        const expected = webRoots.map((w) => '/' + joinP(w, relTo(rel, lr)));
        const t = imageTargets(relC, final);
        if (t.some((x) => x.excluded) && !t.some((x) => x.target && expected.includes(x.target))) { const c = t.find((x) => x.excluded).copy; return { status: 'FAIL', why: `исключён COPY --exclude (строка ${c.line})`, cause: 'ignored' }; }
        const hit = t.find((x) => x.target && expected.includes(x.target));
        if (hit) return { status: 'OK', target: hit.target, line: hit.copy.line };
        if (t.some((x) => x.target)) return { status: 'FAIL', why: `копируется не туда: ${t.filter((x) => x.target).map((x) => `${x.target} (строка ${x.copy.line})`).slice(0, 2).join(', ')}, а сервер отдаёт ${expected[0]}`, cause: 'misplaced' };
        const b = built.find((c) => expected.some((e) => e === c.destAbs || e.startsWith(c.destAbs + '/')));
        if (b) return { status: 'WARN', why: `собирается в образе (${b.text}, строка ${b.line}) — статически не проверить`, cause: 'built' };
        const top = relTo(rel, lr).split('/')[0];
        const run = final.runs.find((r) => new RegExp(`(^|[\\s/"'])${top.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s/"']|$)`).test(r.text));
        const sugg = suggestCopy(relTo(rel, lr), lr, final, wr.root, perDir);
        if (run) return { status: 'WARN', why: `нет COPY; в RUN (строка ${run.line}) упоминается ${top} — проверить, что он создаёт файл`, cause: 'run', sugg };
        return { status: 'FAIL', why: `нет COPY в ${cfg.file}`, cause: 'missing', sugg };
      };
    }
  } else if (cfg.kind === 'vercel') {
    let vj = {}; try { vj = JSON.parse(readText(root, 'vercel.json') || '{}'); } catch { notes.push('vercel.json не читается как JSON'); }
    const st = Array.isArray(vj.builds) ? vj.builds.find((b) => /@vercel\/static/.test(b.use || '')) : null;
    localRoot = clean(vj.outputDirectory || (st && st.src ? String(st.src).replace(/\/?\*\*.*$/, '').replace(/\/\*.*$/, '') : '') || '');
    const ign = files.has('.vercelignore') ? makeIgnore(readText(root, '.vercelignore'), 'git', '.vercelignore') : null;
    Object.assign(config, { webRoot: localRoot || '.', cleanUrls: !!vj.cleanUrls, ignore: ign ? ign.rules.length : null });
    cover = (rel) => { const ig = ign && ign(rel); if (ig) return { status: 'FAIL', why: `исключён .vercelignore ${ig.rule}`, cause: 'ignored' }; return { status: 'OK' }; };
  } else if (cfg.kind === 'netlify') {
    const t = readText(root, 'netlify.toml') || '';
    const base = clean(tomlVal(t, 'build', 'base') || ''); const pub = tomlVal(t, 'build', 'publish');
    localRoot = joinP(base, pub || '');
    Object.assign(config, { webRoot: localRoot || '.', base: base || '.' });
    cover = () => ({ status: 'OK' });
  } else if (cfg.kind === 'ghpages') {
    const t = cfg.text;
    const p = /upload-pages-artifact/.test(t) ? (yamlVal(t.slice(t.indexOf('upload-pages-artifact')), 'path') || '_site') : /actions-gh-pages/.test(t) ? (yamlVal(t, 'publish_dir') || 'public') : (yamlVal(t, 'folder') || '.');
    localRoot = clean(p);
    const jek = /jekyll-build-pages/.test(t);
    Object.assign(config, { webRoot: localRoot || '.', jekyll: jek });
    cover = (rel) => (jek && /(^|\/)[_.]/.test(relTo(rel, localRoot)) && !files.has('.nojekyll') ? { status: 'FAIL', why: 'Jekyll не публикует папки и файлы на «_» и «.» — пустой .nojekyll в корне', cause: 'jekyll' } : { status: 'OK' });
  } else if (cfg.kind === 'ghpages-branch') {
    localRoot = cfg.file.startsWith('docs/') || (!files.has('index.html') && files.has('docs/index.html')) ? 'docs' : '';
    const noj = files.has(joinP(localRoot, '.nojekyll'));
    Object.assign(config, { webRoot: localRoot || '.', jekyll: !noj });
    cover = (rel) => (!noj && /(^|\/)[_.]/.test(relTo(rel, localRoot)) ? { status: 'FAIL', why: `выкладка ветки GitHub Pages идёт через Jekyll: папки и файлы на «_» и «.» не публикуются — пустой ${joinP(localRoot, '.nojekyll')}`, cause: 'jekyll' } : { status: 'OK' });
  } else if (cfg.kind === 'caddy' || cfg.kind === 'nginx') {
    const sr = cfg.serverRoot;
    if (!sr.startsWith('/')) { localRoot = clean(sr); Object.assign(config, { webRoot: localRoot || '.', serverRoot: sr }); cover = () => ({ status: 'OK' }); }
    else {
      const tr = findTransfers(root, files).filter((x) => x.remote === '/' + clean(sr) || ('/' + clean(sr)).startsWith(x.remote + '/') || x.remote.startsWith('/' + clean(sr) + '/'));
      Object.assign(config, { serverRoot: sr });
      if (!tr.length) { blind = `сервер отдаёт ${sr} (${cfg.file}), а как файлы туда попадают — не видно: rsync/scp в deploy/*.sh, Makefile, package.json, workflows не найден`; localRoot = ''; }
      else {
        const x = tr[0]; const R = '/' + clean(sr);
        /* rsync src/ host:/remote — содержимое src в remote; без «/» — сама папка src внутри remote */
        const remoteOfSrc = x.contents || !x.src ? x.remote : '/' + joinP(x.remote, path.posix.basename(x.src));
        localRoot = R === remoteOfSrc ? x.src : R.startsWith(remoteOfSrc + '/') ? joinP(x.src, R.slice(remoteOfSrc.length + 1)) : x.src;
        const ign = x.excludes.length ? makeIgnore(x.excludes.join('\n'), 'git', `${x.tool} --exclude`) : null;
        Object.assign(config, { webRoot: localRoot || '.', transfer: `${x.tool} ${x.src || '.'}${x.contents ? '/' : ''} → ${x.remote} (${x.file})`, excludes: x.excludes });
        cover = (rel) => { const ig = ign && ign(relTo(rel, x.src)); return ig ? { status: 'FAIL', why: `исключён ${x.tool} --exclude «${ig.rule.replace(/^.*«|»$/g, '')}» (${x.file})`, cause: 'ignored' } : { status: 'OK' }; };
      }
    }
  } else if (cfg.kind === 'pkg-files') {
    const allow = cfg.list.map((p) => ({ re: globRe(clean(String(p).replace(/^\.\//, '').replace(/^!/, ''))), neg: String(p).startsWith('!') }));
    Object.assign(config, { webRoot: '.', files: cfg.list });
    cover = (rel) => { const segs = rel.split('/'); let ok = /^(package\.json|readme[^/]*|license[^/]*)$/i.test(rel); for (const a of allow) { let m = false; for (let k = 1; k <= segs.length && !m; k++) if (a.re.test(segs.slice(0, k).join('/'))) m = true; if (m) ok = !a.neg; } return ok ? { status: 'OK' } : { status: 'FAIL', why: 'нет в "files" package.json — в пакет не попадёт', cause: 'ignored' }; };
  } else if (cfg.kind === 'build-output') {
    localRoot = cfg.dir; Object.assign(config, { webRoot: cfg.dir, build: cfg.script });
    if (!dirs.has(cfg.dir)) blind = `выкладка собирается («${cfg.script}» → ${cfg.dir}/), а папки ${cfg.dir}/ нет — соберите проект и повторите`;
    cover = () => ({ status: 'OK' });
  } else {
    blind = 'конфиг выкладки не найден (Dockerfile, vercel.json, netlify.toml, workflow Pages, Caddyfile/nginx с rsync, package.json) — проверено только, что ссылки ведут на файлы проекта';
    cover = () => ({ status: 'OK' });
  }
  if (localRoot && !dirs.has(localRoot) && !blind) blind = `папки ${localRoot}/ (веб-корень по ${config.file}) в проекте нет — она собирается при выкладке; соберите и повторите`;
  config.localRoot = localRoot || '.';

  /* ---- страницы ---- */
  const lookup = (p) => {
    let rel = p.replace(/^\/+/, ''); try { rel = decodeURIComponent(rel); } catch { /* как есть */ }
    rel = clean(rel); const dirLike = p.endsWith('/') || rel === '';
    const tries = dirLike ? [joinP(rel, 'index.html')] : [rel, `${rel}.html`, joinP(rel, 'index.html')];
    for (const t of tries) { const f = joinP(localRoot, t); if (files.has(f)) return { file: f }; }
    if (localRoot) for (const t of tries) if (files.has(t)) return { outside: t };
    return null;
  };
  const urlPathOf = (f) => { const r = relTo(f, localRoot); return '/' + (r === 'index.html' ? '' : r.endsWith('/index.html') ? r.slice(0, -10) : r); };
  let siteHost = null; try { if (o.url) siteHost = new URL(o.url).host.replace(/^www\./, ''); } catch { /* проверено раньше */ }
  const own = (u, from) => {
    if (!u || /^(#|mailto:|tel:|sms:|data:|javascript:|blob:|about:|whatsapp:|viber:|tg:|skype:)/i.test(u) || /\{\{|\$\{|\{%|<%/.test(u)) return null;
    let x; try { x = new URL(u, `http://deploy-check.invalid${from}`); } catch { return null; }
    const h = x.host.replace(/^www\./, '');
    if (x.host !== 'deploy-check.invalid' && h !== siteHost && h !== o.canonicalHost) return null;
    if (!/^https?:$/.test(x.protocol)) return null;
    return x.pathname;
  };
  const pageQ = []; const pageSeen = new Set(); const pages = [];
  const addPage = (p, why) => { const k = p.replace(/\/index\.html$/, '/'); if (pageSeen.has(k)) return; pageSeen.add(k); pageQ.push({ path: p, why }); };
  if (o.pages && o.pages.length) for (const p of o.pages) addPage(p, '--pages');
  else {
    addPage('/', 'главная');
    for (const d of dirs) { const r = relTo(d, localRoot); if (!under(d, localRoot) || !r || r.includes('/') || DEV_DIRS.test(r) || r.startsWith('_') && cfg.kind !== 'ghpages-branch' && cfg.kind !== 'ghpages') continue; if (files.has(joinP(d, 'index.html'))) addPage(`/${r}/`, 'папка с index.html'); }
    for (const f of files) { const r = relTo(f, localRoot); if (under(f, localRoot) && !r.includes('/') && /\.html?$/i.test(r) && r !== 'index.html' && !/^(404|50\d|_)/.test(r)) addPage(`/${r}`, '.html в корне'); }
  }
  const need = new Map(); const unresolved = new Map(); const outside = new Map();
  const needFile = (f, by, kind) => { if (!need.has(f)) need.set(f, { path: f, by: new Set(), kind }); need.get(f).by.add(by); };
  const follow = !(o.pages && o.pages.length);
  const parsedCss = new Set(); const parsedJs = new Set();
  const walkCss = (f, depth) => {
    if (parsedCss.has(f) || depth > 3) return; parsedCss.add(f);
    const t = readText(root, f); if (!t) return; const from = urlPathOf(f);
    for (const r of cssRefs(t)) { const p = own(r.url, from); if (p == null) continue; const hit = lookup(p); if (hit && hit.file) { needFile(hit.file, from, 'asset'); if (r.css || /\.css$/i.test(hit.file)) walkCss(hit.file, depth + 1); } else if (hit && hit.outside) outside.set(hit.outside, from); else unresolved.set(p, from); }
  };
  const walkJs = (f, depth) => {
    if (parsedJs.has(f) || depth > 3) return; parsedJs.add(f);
    const t = readText(root, f, 600000); if (!t) return; const from = urlPathOf(f);
    for (const u of jsImports(t)) { const p = own(u, from); if (p == null) continue; const hit = lookup(p); if (hit && hit.file) { needFile(hit.file, from, 'asset'); walkJs(hit.file, depth + 1); } else if (hit && hit.outside) outside.set(hit.outside, from); else unresolved.set(p, from); }
  };
  while (pageQ.length && pages.length < 500) {
    const { path: p, why } = pageQ.shift();
    const hit = lookup(p);
    if (!hit || !hit.file) { pages.push({ path: p, why, file: null, outside: hit && hit.outside || null }); if (hit && hit.outside) outside.set(hit.outside, p); continue; }
    const f = hit.file; const up = urlPathOf(f);
    pages.push({ path: p, why, file: f });
    needFile(f, p, 'page');
    if (!/\.html?$/i.test(f)) continue;
    const { refs, base, canonical } = htmlRefs(readText(root, f) || '');
    if (canonical && !o.canonicalHost) { try { const ch = new URL(canonical).host.replace(/^www\./, ''); if (ch && ch !== 'deploy-check.invalid') o.canonicalHost = ch; } catch { /* относительный */ } }
    let from = up;
    if (base) { const bp = own(base, from); if (bp != null) from = bp; }
    for (const r of refs) {
      const rp = own(r.url, from); if (rp == null) continue;
      const h2 = lookup(rp);
      if (!h2 || !h2.file) { if (h2 && h2.outside) outside.set(h2.outside, up); else if (!unresolved.has(rp)) unresolved.set(rp, up); continue; }
      if (r.kind === 'page' && /\.html?$/i.test(h2.file)) { needFile(h2.file, up, 'page'); if (follow) addPage(urlPathOf(h2.file), `ссылка с ${up}`); continue; }
      needFile(h2.file, up, r.kind === 'page' ? 'file' : 'asset');
      if (r.css || /\.css$/i.test(h2.file)) walkCss(h2.file, 1);
      if (r.js === 'module' || /\.mjs$/i.test(h2.file)) walkJs(h2.file, 1);
    }
  }

  /* ---- сверка ---- */
  const results = [];
  if (!blind) for (const n of need.values()) { const c = cover(n.path); results.push({ path: n.path, kind: n.kind, by: [...n.by].slice(0, 3), ...c }); }
  /* ссылка ведёт на файл проекта вне веб-корня: локально (сервер разработки от корня проекта) открывается, на бою — нет */
  const outsideRes = [...outside].map(([f, by]) => ({ path: f, kind: 'file', by: [by], status: 'FAIL', why: `есть в проекте, но вне веб-корня ${localRoot}/ — на бой не попадёт`, cause: 'outside' }));
  if (!blind) results.push(...outsideRes);
  const fails = results.filter((r) => r.status === 'FAIL'), warns = results.filter((r) => r.status === 'WARN');
  const groupKey = (r) => { const rr = r.cause === 'outside' ? r.path : relTo(r.path, localRoot); const segs = rr.split('/'); return segs.length > 1 ? `${segs[0]}/` : segs[0]; };
  const groups = (list) => { const g = new Map(); for (const r of list) { const k = `${groupKey(r)}|${r.why}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r); } return [...g.values()]; };
  L('INFO', `конфиг выкладки: ${config.kind}${config.file ? ` (${config.file})` : ''}`, [config.stage ? `стадия ${config.stage}` : '', config.webRoot ? `веб-корень ${config.webRoot}${config.webRootHow ? ` — ${config.webRootHow}` : ''}` : '', `папка проекта на бою — ${config.localRoot}`, config.transfer || '', config.other.length ? `ещё найдено: ${config.other.join(', ')} — не проверялось` : ''].filter(Boolean).join('; '));
  for (const n of notes) L('INFO', 'заметка', n);
  if (capped) L('WARN', 'файлов в проекте больше 60 000', 'взяты первые — часть ссылок могла не найтись');
  if (blind) L('WARN', 'выкладку не проверить', blind);
  for (const g of groups(fails).slice(0, 15)) {
    const r0 = g[0]; const k = groupKey(r0);
    const ex = g.slice(0, 3).map((x) => relTo(x.path, localRoot) || x.path).join(', ') + (g.length > 3 ? ` и ещё ${g.length - 3}` : '');
    const pagesIn = g.filter((x) => x.kind === 'page').length;
    L('FAIL', `${k} — ${pl(g.length, 'файл', 'файла', 'файлов')}${pagesIn ? ` (страниц ${pagesIn})` : ''} ${g.length === 1 ? 'не попадёт' : 'не попадут'} на бой: ${r0.why}`, `${ex}${r0.sugg ? ` — добавить «${r0.sugg}»` : ''}; ссылается ${r0.by.join(', ')}`);
  }
  if (groups(fails).length > 15) L('FAIL', `и ещё ${groups(fails).length - 15} групп`, 'полный список — files[] в протоколе');
  for (const g of groups(warns).slice(0, 6)) L('WARN', `${groupKey(g[0])} — ${pl(g.length, 'файл', 'файла', 'файлов')}: ${g[0].why}`, g.slice(0, 3).map((x) => relTo(x.path, localRoot)).join(', '));
  const okN = results.filter((r) => r.status === 'OK').length;
  if (!blind && results.length) L(fails.length ? 'INFO' : 'OK', `попадают на бой ${okN} из ${pl(results.length, 'файла', 'файлов', 'файлов')} страниц и ассетов`, `страниц ${pages.filter((p) => p.file).length}${follow ? ' (обход ссылок от главной и папки с index.html)' : ' (--pages)'}, ассетов ${results.filter((r) => r.kind === 'asset').length}`);
  const notLocal = pages.filter((p) => !p.file && !p.outside);
  if (notLocal.length) L(follow ? 'INFO' : 'WARN', `страницы нет в проекте: ${notLocal.map((p) => p.path).slice(0, 5).join(', ')}`, 'маршрут сервера или опечатка в --pages — проверяется только на бою (--url)');
  if (unresolved.size) L('INFO', `ссылок, которых нет и локально: ${unresolved.size}`, `${[...unresolved].slice(0, 5).map(([p, by]) => `${p} (с ${by})`).join('; ')} — маршрут сервера, загрузки или битая ссылка; к выкладке не относится`);
  const out = { project: root, config, pages, files: results.map(({ by, ...r }) => ({ ...r, by })), unresolved: [...unresolved].map(([p, by]) => ({ path: p, by })), live: null, lines };
  out.lookup = lookup; out.localRoot = localRoot;
  return out;
}
function suggestCopy(relFromRoot, lr, final, webRoot, perDir) {
  const segs = relFromRoot.split('/'); const top = segs[0]; const isDir = segs.length > 1;
  const src = joinP(lr, top);
  if (webRoot === final.workdir && perDir) return isDir ? `COPY ${src} ./${top}` : `COPY ${src} ./`;
  const dest = webRoot === final.workdir ? `./${isDir ? top : ''}` : `${webRoot}/${isDir ? top : ''}`;
  return `COPY ${src}${isDir ? '' : ''} ${dest}`;
}

/* =====================================================================
   Бой: GET страниц, HEAD упавших ассетов, проба заглушки
   ===================================================================== */
async function live(res, base, { max = MAX_REQ, timeout = 10000 } = {}) {
  let n = 0; const UA = 'site-rework deploy-check (read-only)';
  const req = async (u, method) => {
    let url = u; let hops = 0;
    for (;;) {
      if (n >= max) return { url: u, skipped: true };
      n++;
      try {
        const r = await fetch(url, { method, redirect: 'manual', headers: { 'user-agent': UA, accept: method === 'GET' ? 'text/html,*/*' : '*/*' }, signal: AbortSignal.timeout(timeout) });
        if (r.status >= 300 && r.status < 400 && r.headers.get('location') && hops < 3) { url = new URL(r.headers.get('location'), url).href; hops++; try { await r.body?.cancel(); } catch { /* пусто */ } continue; }
        let text = null;
        if (method === 'GET') { const b = await r.arrayBuffer(); text = Buffer.from(b.slice(0, 400000)).toString('utf8'); }
        return { url: u, final: url, status: r.status, redirected: hops > 0, text, size: text != null ? text.length : Number(r.headers.get('content-length')) || null };
      } catch (e) { return { url: u, error: String((e && e.cause && e.cause.code) || (e && e.name === 'TimeoutError' ? 'таймаут' : e && e.message) || e).slice(0, 80) }; }
    }
  };
  const titleOf = (t) => { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(t || ''); return m ? m[1].replace(/\s+/g, ' ').trim() : null; };
  const lines = []; const L = (status, what, details = '') => lines.push({ status, what, details });
  const probe = await req(new URL(`/__deploy-check-${Math.random().toString(36).slice(2, 10)}/`, base).href, 'GET');
  const fallback = probe.status === 200 ? { status: 200, title: titleOf(probe.text), size: probe.size } : probe.status ? { status: probe.status } : { error: probe.error };
  const list = [...res.pages.filter((p) => p.file || p.outside)];
  const failed = new Set(res.files.filter((f) => f.status === 'FAIL').map((f) => f.path));
  list.sort((a, b) => (failed.has(b.file) - failed.has(a.file)));
  const pagesOut = [];
  for (const p of list) {
    const r = await req(new URL(p.path, base).href, 'GET'); if (r.skipped) break;
    const localTitle = p.file ? titleOf(readText(res.project, p.file)) : null;
    const t = titleOf(r.text);
    let status = 'OK', why = '';
    if (r.error) { status = 'WARN'; why = `сеть: ${r.error}`; }
    else if (r.status === 404 || r.status === 410) { status = 'FAIL'; why = `локально есть — на бою ${r.status}`; }
    else if (r.status >= 500) { status = 'WARN'; why = `на бою ${r.status}`; }
    else if (r.status === 401 || r.status === 403) { status = 'INFO'; why = `на бою ${r.status} — закрыто`; }
    else if (r.status === 200 && fallback.status === 200 && t === fallback.title && localTitle !== fallback.title && Math.abs((r.size || 0) - (fallback.size || 0)) <= Math.max(64, (fallback.size || 0) * 0.02)) { status = 'FAIL'; why = `на бою заглушка (то же, что на несуществующий адрес: «${t || 'без заголовка'}»)`; }
    else if (r.status === 200 && localTitle && t && localTitle !== t) { status = 'INFO'; why = `на бою заголовок «${t.slice(0, 60)}», локально «${localTitle.slice(0, 60)}» — старая версия или шаблон сервера`; }
    else if (r.status !== 200) { status = 'INFO'; why = `на бою ${r.status}`; }
    pagesOut.push({ path: p.path, file: p.file, status: r.status ?? null, error: r.error || null, final: r.redirected ? r.final : null, title: t, verdict: status, why });
  }
  /* упавшие сверку ассеты — HEAD, пока есть запросы */
  const assets = [];
  for (const f of res.files.filter((x) => x.status === 'FAIL' && x.kind !== 'page')) {
    if (n >= max) break;
    const up = '/' + relTo(f.path, res.localRoot);
    const r = await req(new URL(up, base).href, 'HEAD'); if (r.skipped) break;
    assets.push({ path: up, status: r.status ?? null, error: r.error || null });
  }
  const pf = pagesOut.filter((x) => x.verdict === 'FAIL');
  for (const x of pf) L('FAIL', `${x.path} — ${x.why}`, x.file ? `файл ${x.file}` : '');
  for (const x of pagesOut.filter((y) => y.verdict === 'WARN')) L('WARN', `${x.path} — ${x.why}`);
  const infos = pagesOut.filter((y) => y.verdict === 'INFO'); if (infos.length) L('INFO', `на бою отличается: ${pl(infos.length, 'страница', 'страницы', 'страниц')}`, infos.slice(0, 4).map((x) => `${x.path} — ${x.why}`).join('; '));
  const okp = pagesOut.filter((y) => y.verdict === 'OK').length;
  if (pagesOut.length) L(pf.length ? 'INFO' : 'OK', `на бою отвечают ${okp} из ${pl(pagesOut.length, 'страницы', 'страниц', 'страниц')}`, `запросов ${n} из ${max}${fallback.status === 200 ? '; сервер отдаёт 200 на любой адрес (заглушка SPA) — страницы сверены с ней' : ''}${list.length > pagesOut.length ? `; не запрошено ${list.length - pagesOut.length} (предел запросов)` : ''}`);
  const live404 = assets.filter((a) => a.status === 404 || a.status === 410);
  if (assets.length) L(live404.length ? 'FAIL' : 'INFO', `ассеты, упавшие сверку, на бою: 404 у ${live404.length} из ${assets.length}`, assets.slice(0, 5).map((a) => `${a.path} ${a.status ?? a.error}`).join('; ') + (live404.length < assets.length ? ' — 200 на бою при FAIL сверки: на бою старый образ или маршрут сервера; следующая выкладка их потеряет' : ''));
  return { base, requests: n, max, fallback, pages: pagesOut, assets, lines };
}

/* =====================================================================
   Командная строка
   ===================================================================== */
const VALUES = ['pages', 'url', 'out', 'tag', 'json'];
const FLAGS = ['help', 'h', 'strict', 'no-fail', 'selftest'];
/* Значение --pages → пути от корня сайта. Git Bash подменяет аргумент, начинающийся с «/», на
   «C:/Program Files/Git/…» (вся строка «/,/contacts/» становится «C:/Program Files/Git/,/contacts/»): приставка
   снимается у каждого куска. Без этого «/» искалась как страница «/C:/Program Files/Git/», её не было в проекте,
   и сверка главной молча не делалась — WARN вместо FAIL. null — кусок не разобран. */
function pagesArg(v) {
  return String(v).split(',').map((s) => unmangle(s.trim())).filter(Boolean).map((s) => { if (/^https?:/i.test(s)) { try { return new URL(s).pathname; } catch { return null; } } return s.startsWith('/') ? s : `/${s}`; });
}
function report(res, log) {
  for (const l of res.lines) log(`${l.status.padEnd(5)} ${l.what}${l.details ? ` — ${l.details}` : ''}`);
  const fails = res.lines.filter((l) => l.status === 'FAIL').length, warns = res.lines.filter((l) => l.status === 'WARN').length;
  log(`\n${res.verdict}: ${pl(fails, 'провал', 'провала', 'провалов')}, ${pl(warns, 'предупреждение', 'предупреждения', 'предупреждений')}`);
}
function finish(res) {
  res.verdict = res.lines.reduce((a, l) => (l.status === 'INFO' ? a : worse(a, l.status)), 'OK');
  delete res.lookup; return res;
}
async function main(argv) {
  const die = (m) => { console.error(m); process.exit(1); };
  const { pos, opt } = parseArgs(argv, { values: VALUES, flags: FLAGS, strict: true });
  if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP()); process.exit(0); }
  for (const k of VALUES) if (opt[k] === true || (opt[k] !== undefined && String(opt[k]).trim() === '')) die(`--${k}: нужно значение (подробно: --help)`);
  if (opt.selftest) { if (pos.length) die('--selftest не принимает папку: стенды — fixtures/deploy-check'); process.exit(await selftest()); }
  if (!pos[0]) die('Нужна папка проекта: node deploy-check.mjs <папка> [--pages "/,/x/"] [--url https://сайт]  (подробно: --help)');
  if (pos.length > 1) die(`Лишние слова: ${pos.slice(1).join(' ')} — папка одна, страницы — --pages "/,/x/"`);
  const dir = path.resolve(pos[0]);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) die(`Папки нет: ${dir}`);
  let url = null;
  if (opt.url !== undefined) { try { const u = new URL(String(opt.url)); if (!/^https?:$/.test(u.protocol)) throw new Error(); url = u.origin + '/'; } catch { die(`--url ${opt.url}: нужен адрес http(s)://…`); } }
  let pages = null;
  if (opt.pages !== undefined) {
    pages = pagesArg(opt.pages);
    if (pages.some((p) => p == null) || !pages.length) die(`--pages ${opt.pages}: пути через запятую («/,/napravleniya/») или адреса`);
  }
  const jsonOut = opt.json === undefined ? null : String(opt.json);
  const log = jsonOut === '-' ? (...a) => console.error(...a) : (...a) => console.log(...a);
  const res = await analyze(dir, { pages, url });
  if (url) { res.live = await live(res, url); res.lines.push(...res.live.lines); delete res.live.lines; }
  finish(res);
  const outDir = opt.out ? path.resolve(String(opt.out)) : url ? runDir(opt, url) : path.join(process.env.SITE_REWORK_RUNS || path.join(os.homedir(), '.claude', 'site-rework', 'runs'), `local-${capSlug(path.basename(dir).replace(/[^\w.-]+/g, '-').toLowerCase() || 'project')}`);
  const tag = String(opt.tag || 'deploy').replace(/[^\w.-]+/g, '-');
  const file = path.join(ensureDir(path.join(outDir, 'deploy-check')), `${tag}.json`);
  log(`deploy-check · ${dir}${url ? ` · бой ${url}` : ''}`);
  report(res, log);
  writeJson(file, res); log(`Сохранено: ${file}`);
  if (jsonOut === '-') process.stdout.write(JSON.stringify(res, null, 1) + '\n'); else if (jsonOut) { writeJson(path.resolve(jsonOut), res); log(`JSON: ${path.resolve(jsonOut)}`); }
  if (res.verdict === 'FAIL' && !opt['no-fail']) { log('Код выхода 1: итог FAIL (--no-fail — код 0)'); process.exit(1); }
  process.exit(0);
}

/* =====================================================================
   Самопроверка: fixtures/deploy-check
   ===================================================================== */
/* Копия папки файлами. Не fs.cpSync: в Node 22.21 на Windows он на кириллических путях (C:/Users/фвьшт/…) роняет
   процесс с кодом 127 без исключения и без строки итога — та же ловушка записана в skill-audit.mjs. */
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(a, b); else if (e.isFile()) fs.copyFileSync(a, b);
  }
  return dst;
}
/* Папки прежних оборванных самопроверок (процесс убит или упал до уборки): старше двух часов — удалить.
   Свежие не трогаем — рядом может идти чужой прогон. */
function sweepStale(dir = os.tmpdir(), now = Date.now()) {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.startsWith('deploy-check-selftest-')) continue;
      const p = path.join(dir, e.name);
      try { if (now - fs.statSync(p).mtimeMs > 2 * 3600e3) { fs.rmSync(p, { recursive: true, force: true }); n++; } } catch { /* занята — оставить */ }
    }
  } catch { /* временной папки не прочитать — не беда */ }
  return n;
}
function serve(root, { missing = [], spa = false } = {}) {
  const server = http.createServer((req, res) => {
    let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.statusCode = 400; return res.end(); }
    const rel = clean(p); const sendFallback = () => { if (spa) { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(fs.readFileSync(path.join(root, 'index.html'))); } res.statusCode = 404; res.end('<title>404</title>нет'); };
    if (missing.some((m) => rel === m.replace(/\/$/, '') || rel.startsWith(m))) return sendFallback();
    let f = path.join(root, rel); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) { if (!p.endsWith('/')) { res.statusCode = 301; res.setHeader('location', p + '/'); return res.end(); } f = path.join(f, 'index.html'); }
    if (!fs.existsSync(f)) return sendFallback();
    res.setHeader('content-type', /\.html$/.test(f) ? 'text/html; charset=utf-8' : 'application/octet-stream');
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, base: `http://127.0.0.1:${server.address().port}/` })));
}
async function selftest() {
  const FX = path.join(HERE, 'fixtures', 'deploy-check');
  sweepStale();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-check-selftest-'));
  let n = 0, bad = 0;
  try {
  const check = (where, what, ok, got) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${where}: ${what}${got !== undefined ? ` — ${got}` : ''}`); };
  const run = async (dir, o = {}) => { const r = await analyze(dir, o); if (o.base) { r.live = await live(r, o.base); r.lines.push(...r.live.lines); } return finish(r); };
  const fileSt = (r, p) => { const f = r.files.find((x) => x.path === p); return f ? f.status : 'нет'; };
  const has = (r, st, re) => r.lines.some((l) => l.status === st && re.test(`${l.what} — ${l.details}`));
  const brief = (r) => r.lines.filter((l) => l.status !== 'OK' && l.status !== 'INFO').map((l) => `${l.status} ${l.what.slice(0, 90)}`).join(' | ') || `${r.verdict}`;

  /* 1. KIMota777/sites: Dockerfile копирует папки страниц по списку, napravleniya/ забыта */
  {
    const d = path.join(FX, 'sites'); const r = await run(d);
    check('sites', 'конфиг docker, веб-корень /app (express.static(__dirname)), папка проекта — корень', r.config.kind === 'docker' && r.config.webRoot === '/app' && r.config.localRoot === '.', `${r.config.kind} ${r.config.webRoot} ${r.config.localRoot}`);
    check('sites', 'napravleniya/index.html и hero.svg — FAIL «нет COPY», совет «COPY napravleniya ./napravleniya»', fileSt(r, 'napravleniya/index.html') === 'FAIL' && fileSt(r, 'napravleniya/hero.svg') === 'FAIL' && has(r, 'FAIL', /napravleniya\/ — 2 файла .*нет COPY.*COPY napravleniya \.\/napravleniya/), brief(r));
    check('sites', 'razrabotka, contacts, assets (и шрифт из url() в CSS), index.html — OK', ['razrabotka/index.html', 'contacts/index.html', 'assets/site.css', 'assets/logo.svg', 'assets/fonts/body.woff2', 'index.html'].every((p) => fileSt(r, p) === 'OK'), ['razrabotka/index.html', 'assets/fonts/body.woff2', 'index.html'].map((p) => `${p} ${fileSt(r, p)}`).join(', '));
    check('sites', 'чужие хосты, mailto:, tel:, якоря и tools/ (служебная папка) не проверяются', !r.files.some((f) => /^tools\//.test(f.path)) && !r.unresolved.some((u) => /fonts\.googleapis|mailto|tel:/.test(u.path)), `файлов ${r.files.length}, нет локально: ${r.unresolved.map((u) => u.path).join(', ') || 'нет'}`);
    check('sites', 'ссылка на маршрут сервера /api/sites — INFO «нет и локально», не FAIL', r.unresolved.some((u) => u.path === '/api/sites') && !r.files.some((f) => /api/.test(f.path)), r.unresolved.map((u) => u.path).join(', '));
    check('sites', 'итог FAIL', r.verdict === 'FAIL', r.verdict);
    /* то же с --pages: только главная и /contacts/ — napravleniya в списке нет, но главная на неё ссылается */
    const r2 = await run(d, { pages: ['/contacts/'] });
    check('sites --pages /contacts/', 'страница без ссылки на napravleniya — OK, её ассеты проверены', r2.verdict === 'OK' && r2.pages.length === 1 && fileSt(r2, 'assets/site.css') === 'OK', brief(r2));
    const r3 = await run(d, { pages: ['/napravleniya/'] });
    check('sites --pages /napravleniya/', 'новая страница — FAIL', r3.verdict === 'FAIL' && fileSt(r3, 'napravleniya/index.html') === 'FAIL', brief(r3));
    /* исправленный Dockerfile */
    const fixed = copyDir(d, path.join(tmp, 'sites-fixed'));
    fs.writeFileSync(path.join(fixed, 'Dockerfile'), fs.readFileSync(path.join(fixed, 'Dockerfile'), 'utf8').replace('COPY contacts ./contacts', 'COPY contacts ./contacts\nCOPY napravleniya ./napravleniya'));
    const r4 = await run(fixed);
    check('sites + COPY napravleniya', 'всё попадает в образ — OK', r4.verdict === 'OK' && fileSt(r4, 'napravleniya/hero.svg') === 'OK', brief(r4));
    /* бой: сервер отдаёт всё, кроме napravleniya/ */
    const { server, base } = await serve(d, { missing: ['napravleniya/'] });
    try {
      const r5 = await run(d, { base, url: base });
      check('sites --url', '«локально есть — на бою 404» для /napravleniya/ — FAIL; остальные страницы — 200', has(r5, 'FAIL', /\/napravleniya\/ — локально есть — на бою 404/) && r5.live.pages.filter((p) => p.verdict === 'OK').length >= 3, `${r5.live.pages.map((p) => `${p.path} ${p.status}`).join(', ')}`);
      check('sites --url', 'запросов не больше 50, упавший ассет hero.svg запрошен HEAD — 404', r5.live.requests <= 50 && r5.live.assets.some((a) => /hero\.svg/.test(a.path) && a.status === 404), `запросов ${r5.live.requests}, ассеты ${r5.live.assets.map((a) => `${a.path} ${a.status}`).join(', ')}`);
    } finally { server.close(); }
    /* бой с заглушкой SPA: на любой адрес — 200 и главная */
    const s2 = await serve(d, { missing: ['napravleniya/'], spa: true });
    try {
      const r6 = await run(d, { base: s2.base, url: s2.base });
      check('sites --url (SPA)', 'на любой адрес 200 — /napravleniya/ сверена с заглушкой: FAIL «на бою заглушка»', has(r6, 'FAIL', /\/napravleniya\/ — на бою заглушка/) && r6.live.fallback.status === 200, `заглушка ${JSON.stringify(r6.live.fallback)}; ${r6.live.pages.map((p) => `${p.path} ${p.verdict}`).join(', ')}`);
    } finally { s2.server.close(); }
  }
  /* 2. COPY . . и .dockerignore с исключением */
  {
    const r = await run(path.join(FX, 'ignore'));
    check('ignore', 'media/hero.jpg — FAIL «исключён .dockerignore «media/»», media/logo.svg (!media/logo.svg) — OK, docs/price.pdf — OK', fileSt(r, 'media/hero.jpg') === 'FAIL' && /\.dockerignore.*media\//.test((r.files.find((f) => f.path === 'media/hero.jpg') || {}).why || '') && fileSt(r, 'media/logo.svg') === 'OK' && fileSt(r, 'docs/price.pdf') === 'OK', brief(r));
    check('ignore', '«**/*.psd» исключает макет в любой папке', fileSt(r, 'img/deep/cover.psd') === 'FAIL', fileSt(r, 'img/deep/cover.psd'));
  }
  /* 3. nginx: файлы по одному в /usr/share/nginx/html, img/ забыта */
  {
    const r = await run(path.join(FX, 'nginx'));
    check('nginx', 'веб-корень из nginx.conf (root /usr/share/nginx/html), img/ — FAIL с советом COPY img …', r.config.webRoot === '/usr/share/nginx/html' && fileSt(r, 'img/a.svg') === 'FAIL' && fileSt(r, 'css/main.css') === 'OK' && has(r, 'FAIL', /COPY img \/usr\/share\/nginx\/html\/img/), `${r.config.webRoot}; ${brief(r)}`);
  }
  /* 4. многостадийная сборка: dist собирается в образе */
  {
    const r = await run(path.join(FX, 'multistage'));
    check('multistage', 'COPY --from=build — WARN «не проверить», не FAIL', r.verdict === 'WARN' && has(r, 'WARN', /собирается|не проверить/), brief(r));
  }
  /* 5. Netlify: publish = site, шрифт лежит в корне проекта */
  {
    const r = await run(path.join(FX, 'netlify'));
    check('netlify', 'fonts/a.woff2 вне site/ — FAIL «вне веб-корня», site/img/b.svg — OK', fileSt(r, 'fonts/a.woff2') === 'FAIL' && fileSt(r, 'site/img/b.svg') === 'OK', brief(r));
  }
  /* 6. Vercel: cleanUrls и .vercelignore */
  {
    const r = await run(path.join(FX, 'vercel'));
    check('vercel', '/about → about.html — OK; drafts/new.html исключён .vercelignore — FAIL', fileSt(r, 'about.html') === 'OK' && fileSt(r, 'drafts/new.html') === 'FAIL', brief(r));
  }
  /* 7. GitHub Pages из ветки: Jekyll и папка на «_»; с .nojekyll — OK */
  {
    const d = path.join(FX, 'ghpages'); const r = await run(d);
    check('ghpages', '_assets/app.css без .nojekyll — FAIL с советом .nojekyll', fileSt(r, '_assets/app.css') === 'FAIL' && has(r, 'FAIL', /nojekyll/), brief(r));
    const d2 = copyDir(d, path.join(tmp, 'ghpages-nojekyll')); fs.writeFileSync(path.join(d2, '.nojekyll'), '');
    const r2 = await run(d2);
    check('ghpages + .nojekyll', 'OK', r2.verdict === 'OK', brief(r2));
  }
  /* 8. GitHub Pages через workflow: path: public, данные в корне */
  {
    const r = await run(path.join(FX, 'ghpages-action'));
    check('ghpages-action', 'веб-корень public (upload-pages-artifact), data/list.json вне его — FAIL', r.config.webRoot === 'public' && fileSt(r, 'data/list.json') === 'FAIL', `${r.config.webRoot}; ${brief(r)}`);
  }
  /* 9. Caddyfile + rsync с --exclude */
  {
    const r = await run(path.join(FX, 'caddy-rsync'));
    check('caddy-rsync', 'root /var/www/site ← rsync ./ ; drafts/ исключена --exclude — FAIL; js/app.js — OK', r.config.kind === 'caddy' && fileSt(r, 'drafts/x.html') === 'FAIL' && fileSt(r, 'js/app.js') === 'OK', `${r.config.transfer}; ${brief(r)}`);
    const d2 = copyDir(path.join(FX, 'caddy-rsync'), path.join(tmp, 'caddy-norsync')); fs.rmSync(path.join(d2, 'deploy'), { recursive: true });
    const r2 = await run(d2);
    check('caddy без rsync', 'WARN «как файлы туда попадают — не видно»', r2.verdict === 'WARN' && has(r2, 'WARN', /не видно/), brief(r2));
  }
  /* 10. package.json "files" и сборка без папки */
  {
    const r = await run(path.join(FX, 'pkgfiles'));
    check('pkgfiles', 'img/ нет в "files" — FAIL, css/ — OK', fileSt(r, 'img/p.svg') === 'FAIL' && fileSt(r, 'css/s.css') === 'OK', brief(r));
    const r2 = await run(path.join(FX, 'build-output'));
    check('build-output', 'vite build, папки dist/ нет — WARN «соберите и повторите»', r2.verdict === 'WARN' && has(r2, 'WARN', /соберите/), brief(r2));
  }
  /* 11. конфига нет */
  {
    const d = fs.mkdtempSync(path.join(tmp, 'none-')); fs.writeFileSync(path.join(d, 'index.html'), '<title>x</title><a href="/a/">a</a>'); fs.mkdirSync(path.join(d, 'a')); fs.writeFileSync(path.join(d, 'a', 'index.html'), '<title>a</title>');
    const r = await run(d);
    check('без конфига', 'WARN «конфиг выкладки не найден»', r.verdict === 'WARN' && has(r, 'WARN', /конфиг выкладки не найден/), brief(r));
  }
  /* 12. маски и Dockerfile по кусочкам */
  {
    const ig = makeIgnore('node_modules\n**/*.map\nmedia/\n!media/logo.svg\n/tmp', 'docker');
    const gi = makeIgnore('drafts\n*.map\n/build', 'git');
    const ok = !!ig('node_modules/x/y.js') && !!ig('a/b/c.js.map') && !!ig('media/x.jpg') && !ig('media/logo.svg') && !!ig('tmp/x') && !ig('src/tmp/x') && !!gi('a/drafts/x.html') && !!gi('x.js.map') && !!gi('build/i.html') && !gi('src/build/i.html');
    check('маски', '.dockerignore (от корня, **, !исключение) и .gitignore (без «/» — на любой глубине)', ok);
    const df = parseDockerfile('ARG ROOT=/srv\nFROM node:24 AS build\nWORKDIR /b\nRUN npm run build\nFROM nginx:alpine\nWORKDIR ${ROOT}\nCOPY --chown=1:1 ["a b.html", "./"]\nCOPY site/ \\\n  ./\nCOPY *.txt docs/\nCOPY --from=build /b/dist ./dist');
    const f = df.final;
    const t1 = imageTargets('a b.html', f)[0], t2 = imageTargets('site/x/y.css', f)[0], t3 = imageTargets('robots.txt', f)[0];
    check('Dockerfile', 'ARG в WORKDIR, JSON-форма с пробелом, перенос строки «\\», папка — содержимым, маска — в папку, --from не копирует из проекта', f.workdir === '/srv' && t1 && t1.target === '/srv/a b.html' && t2 && t2.target === '/srv/x/y.css' && t3 && t3.target === '/srv/docs/robots.txt' && f.copies.find((c) => c.from === 'build'), `${f.workdir}; ${[t1, t2, t3].map((x) => x && x.target).join(', ')}`);
  }
  /* 13. аргументы */
  {
    const { spawnSync } = await import('node:child_process');
    const me = fileURLToPath(import.meta.url);
    const a = spawnSync(process.execPath, [me, path.join(tmp, 'нет-такой')], { encoding: 'utf8' });
    const b = spawnSync(process.execPath, [me, FX, '--url', 'ftp://x'], { encoding: 'utf8' });
    const c = spawnSync(process.execPath, [me, FX, '--pagez', '/'], { encoding: 'utf8' });
    const h = spawnSync(process.execPath, [me, '-h'], { encoding: 'utf8' });
    check('аргументы', 'нет папки, --url не http, неизвестный флаг — код 1; -h — справка с кодом 0', a.status === 1 && b.status === 1 && c.status === 1 && h.status === 0 && /Сверка выкладки/.test(h.stdout), `${a.status} ${b.status} ${c.status} ${h.status}`);
    /* код выхода: FAIL — 1 без флагов (цепочка «deploy-check && выкладка» обязана остановиться), --no-fail — 0, OK — 0 */
    const sites = path.join(FX, 'sites'); const out = path.join(tmp, 'out');
    const cli = (...args) => spawnSync(process.execPath, [me, ...args, '--out', out], { encoding: 'utf8' });
    const f1 = cli(sites), f2 = cli(sites, '--no-fail'), f3 = cli(sites, '--strict'), f4 = cli(path.join(tmp, 'sites-fixed'));
    check('код выхода', 'итог FAIL — код 1 без флагов и с прежним --strict; --no-fail — 0; итог OK — 0', f1.status === 1 && /FAIL: \d+ провал/.test(f1.stdout) && f2.status === 0 && /FAIL: \d+ провал/.test(f2.stdout) && f3.status === 1 && f4.status === 0, `${f1.status} ${f2.status} ${f3.status} ${f4.status}`);
    /* --pages из Git Bash: «/,/napravleniya/» приходит как «C:/Program Files/Git/,/napravleniya/» */
    const m1 = pagesArg('C:/Program Files/Git/,/napravleniya/'), m2 = pagesArg('c:/program files/git/contacts/'), m3 = pagesArg('/, contacts/ ,https://x.ru/a/?q=1');
    check('--pages из Git Bash', 'приставка «C:/Program Files/Git» снята у каждого куска; обычные пути и адреса — как были', m1.join(' ') === '/ /napravleniya/' && m2.join(' ') === '/contacts/' && m3.join(' ') === '/ /contacts/ /a/', `${m1.join(' ')} | ${m2.join(' ')} | ${m3.join(' ')}`);
    const g = cli(sites, '--pages', 'C:/Program Files/Git/,/contacts/');
    check('--pages из Git Bash', 'искажённый «/,/contacts/» — главная проверена: её ссылка на napravleniya/ — FAIL, код 1, строки «страницы нет в проекте» нет', g.status === 1 && /^FAIL\s+napravleniya\//m.test(g.stdout) && !/страницы нет в проекте/.test(g.stdout), `код ${g.status}; ${(g.stdout.match(/^(FAIL|WARN).*$/gm) || []).map((l) => l.slice(0, 70)).join(' | ')}`);
  }
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* занята — уберёт следующий запуск */ } }
  console.log(`\n${bad ? 'FAIL' : 'OK'}: selftest ${n - bad} из ${n}${bad ? ` — расхождений ${bad}` : ''}`);
  return bad ? 1 : 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) await main(process.argv.slice(2));

export { analyze, parseDockerfile, imageTargets, makeIgnore };
