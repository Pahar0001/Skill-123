#!/usr/bin/env node
/**
 * Сверка своей страницы со снятой спецификацией. Сравниваются числа
 * (шкала, сетка, роли цветов, акцент, форма, ритм, движение, паспорт образца,
 * фактура), а не картинки.
 *
 *   node verify.mjs <спецификация.json> <адрес своей страницы> [--strict]
 *                   [--ignore <файл> | --no-ignore] [--help]
 *
 *   адрес — http://, https://, file:// или путь к существующему файлу страницы
 *   (C:\w\site\index.html, site\index.html) — по тому же правилу, что у extract;
 *   адрес без схемы (localhost:4177/) — ошибка с подсказкой до запуска браузера
 *
 *   --strict  уровни шкалы, которых нет на странице, и предупреждения (??) —
 *             тоже расхождения
 *   --ignore <файл>  список отступлений из другого файла (вместо <спецификация>.ignore)
 *   --no-ignore      без списка отступлений — увидеть всё, что он прячет
 *
 * Строки: ok — совпало; !! — расхождение (код выхода 1); ?? — предупреждение:
 * чего у образца нет, а у вас есть (форма, поля, аккордеон) — не ошибка, если
 * компонент нужен задаче, но решение должно быть записано (authorship.md
 * site-rework); с --strict предупреждения тоже дают код 1.
 * Отступления, принятые сознательно (раздел «Что не переносим»), перечислить
 * в <спецификация>.ignore — по одному ключу на строку, например: scale.h1.fontFamily
 *
 * h1, nav, контейнер и акцент на обеих страницах берутся одним правилом (extract):
 * самый крупный h1 первого экрана (h1 там нет — крупнейший заголовок первого экрана; нет и его —
 * уровень h1 не сверяется), меню шапки, обёртка секций, цвет действий. Какой
 * элемент взят с каждой стороны — в блоке «Откуда взято» под строками сверки.
 * Спецификация, снятая extract до 2026-09-24.2 (нет scaleFrom и actions), — WARN:
 * h1, nav, контейнер и акцент в ней по старым правилам, переснять.
 *
 * Сила зерна здесь не сверяется: у своей плитки другая σ, чем у файла образца,
 * поэтому opacity не обязана совпадать. Силу мерить texture.mjs compare
 * (скилл site-rework). Здесь — есть ли слой и тот же ли режим наложения.
 */
import fs from 'node:fs';
import { extract, roles, motionSummary, dist, seenColor, accentInfo, levelSource, containerNote } from './extract.mjs';
import { parseArgs, pageAddress } from './lib.mjs';

const HELP = `Сверка своей страницы со спецификацией design-reference.

  node verify.mjs <спецификация.json> <адрес страницы> [--strict] [--ignore <файл> | --no-ignore]

  адрес — http://, https://, file:// или путь к файлу страницы (C:\\w\\site\\index.html)
  --strict          отсутствующие уровни шкалы и предупреждения ?? — тоже расхождения
  --ignore <файл>   отступления из этого файла (по умолчанию <спецификация>.ignore)
  --no-ignore       без списка отступлений — показать всё, что он прячет
  --help, -h        эта справка

Отступления — в <спецификация>.ignore, по ключу на строку (scale.h1.fontFamily).
Под строками — «Откуда взято»: какой h1, меню, обёртка и цвет действий взяты
у образца и у вас. Код выхода 1 — есть расхождения.`;

const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['strict', 'no-ignore', 'help', 'h'], optional: ['ignore'] });
if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
if (pos.length < 2) { console.error('Нужно: node verify.mjs <спецификация.json> <адрес страницы> [--strict] (--help — справка)'); process.exit(1); }
if ('ignore' in opt && (typeof opt.ignore !== 'string' || !opt.ignore.trim())) { console.error('--ignore без значения: нужно --ignore <файл>'); process.exit(1); }
if (opt.ignore && opt['no-ignore']) { console.error('--ignore и --no-ignore вместе — выберите одно'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
const ignoreFile = opt['no-ignore'] ? null : opt.ignore || pos[0].replace(/\.json$/, '.ignore');
if (opt.ignore && !fs.existsSync(opt.ignore)) { console.error(`Нет файла отступлений: ${opt.ignore}`); process.exit(1); }
const ignore = ignoreFile && fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
/* адрес — тем же правилом, что у extract: путь к файлу → file:///…, без схемы — сказать до браузера */
let page;
try { page = pageAddress(pos[1]); } catch (e) { console.error(e.message); process.exit(1); }
/* акцент образца взят с наведения — у своей страницы тоже нужно наведение, иначе сравнивать нечего */
const aa = accentInfo(spec.desktop);
const mine = await extract(page.url, { light: true, states: aa.source === 'hover', source: page.source });
const oldSpec = !spec.desktop.scaleFrom || !spec.desktop.actions;

const rows = [];
/* level: 'ok' | 'bad' | 'warn' */
const put = (key, want, got, level) => { if (ignore.some((p) => key.startsWith(p))) return; rows.push({ key, want, got, level }); };
const add = (key, want, got, ok) => put(key, want, got, ok ? 'ok' : 'bad');
const num = (v) => parseFloat(v);
const near = (a, b, tol) => Math.abs(num(a) - num(b)) <= tol;

for (const vpName of ['desktop', 'mobile']) {
  const a = spec[vpName], b = mine[vpName], p = vpName === 'desktop' ? '' : 'mobile.';
  for (const [lvl, s] of Object.entries(a.scale)) {
    const t = b.scale[lvl];
    if (!t) { if (opt.strict) add(`${p}scale.${lvl}`, 'есть', 'нет на странице', false); continue; }
    add(`${p}scale.${lvl}.fontSize`, s.fontSize, t.fontSize, near(s.fontSize, t.fontSize, 1));
    add(`${p}scale.${lvl}.fontWeight`, s.fontWeight, t.fontWeight, s.fontWeight === t.fontWeight);
    add(`${p}scale.${lvl}.lineHeight`, s.lineHeight, t.lineHeight, s.lineHeight === t.lineHeight || near(s.lineHeight, t.lineHeight, 0.05));
    add(`${p}scale.${lvl}.letterSpacing`, s.letterSpacing, t.letterSpacing, near(s.letterSpacing, t.letterSpacing, 0.005));
    add(`${p}scale.${lvl}.textTransform`, s.textTransform, t.textTransform, s.textTransform === t.textTransform);
    if (vpName === 'desktop') add(`scale.${lvl}.fontFamily`, s.fontFamily, t.fontFamily, s.fontFamily === t.fontFamily);
  }
  const ca = a.containers[0], cb = b.containers[0];
  if (ca) add(`${p}container`, ca.value + 'px', cb ? cb.value + 'px' : 'не выявлено', !!cb && near(ca.value, cb.value, vpName === 'desktop' ? 8 : 4));
  const med = (d) => { const v = d.sections.map((s) => s.paddingTop).filter((x) => x >= 16).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const pa = med(a), pb = med(b);
  if (pa != null) add(`${p}sectionPad`, pa + 'px', pb == null ? 'не выявлено' : pb + 'px', pb != null && near(pa, pb, Math.max(4, pa * 0.1)));
}

/* роли цветов; акцент — отдельно: «у образца акцента нет» тоже правило */
const ra = roles(spec.desktop), rb = roles(mine.desktop);
for (const k of Object.keys(ra)) {
  if (k === 'accent' || !ra[k]) continue;
  add(`color.${k}`, ra[k], rb[k] || 'не выявлено', !!rb[k] && dist(seenColor(ra[k], ra.background), seenColor(rb[k], rb.background)) <= 10);
}
const ab = accentInfo(mine.desktop);
/* старая спецификация: её акцент — самый заметный насыщенный цвет (бывает фон шапки), а не цвет действий */
if (aa.value) add('color.accent', aa.value + (aa.old ? ' (старое правило — переснять)' : ''), ab.value || 'нет', !!ab.value && dist(seenColor(aa.value, ra.background), seenColor(ab.value, rb.background)) <= 10);
else if (aa.status === 'нет') {
  /* у образца насыщенного цвета на экране нет — свой «акцент по умолчанию» (жёлтая кнопка) не добавлять */
  add('color.accent', 'нет (у образца акцента нет)', ab.value ? `${ab.value} — ${ab.status}${ab.note ? ', ' + ab.note : ''}` : 'нет', !(ab.value && ab.status === 'подтверждён'));
}

const setOf = (list, n) => list.slice(0, n).map((x) => x.value).sort().join(', ');
add('shape.radius', setOf(spec.desktop.shape.radius, 3) || 'нет', setOf(mine.desktop.shape.radius, 3) || 'нет', setOf(spec.desktop.shape.radius, 3) === setOf(mine.desktop.shape.radius, 3));
const ma = motionSummary(spec.desktop), mb = motionSummary(mine.desktop);
if (ma.durations.length) add('motion.duration', ma.durations[0] + 'ms', (mb.durations[0] ?? 'нет') + 'ms', mb.durations.length > 0 && near(ma.durations[0], mb.durations[0], 50));
if (ma.easings.length) add('motion.easing', ma.easings[0], mb.easings[0] || 'нет', ma.easings[0] === mb.easings[0]);
if (spec.desktop.motion.scrollReveal.length) add('motion.scrollReveal', 'есть', mine.desktop.motion.scrollReveal.length ? 'есть' : 'нет', mine.desktop.motion.scrollReveal.length > 0);
add('motion.reducedMotion', 'учтено', mine.desktop.motion.reducedMotion ? 'учтено' : 'нет', mine.desktop.motion.reducedMotion || !Object.keys(mine.desktop.motion.libs).length && !mine.desktop.motion.transitions.length);

/* паспорт образца: чего у образца нет — то у вас не должно появиться «само» */
const pa = spec.desktop.passport, pb = mine.desktop.passport;
if (pa && pb) {
  const trA = Object.keys(pa.tracking || {}), trB = Object.entries(pb.tracking || {}).sort((x, y) => y[1] - x[1]);
  if (!trA.length) add('passport.tracking', 'нет разрядки ни у одного текста', trB.length ? trB.slice(0, 4).map(([v, n]) => `${v} ×${n}`).join(', ') : 'нет', !trB.length);
  const capsLimit = Math.max(2, (pa.smallCapsTracked || 0) * 2);
  add('passport.smallCapsTracked', `${pa.smallCapsTracked} (не больше ${capsLimit})`, String(pb.smallCapsTracked), pb.smallCapsTracked <= capsLimit);
  const smallLimit = Math.max(3, (pa.smallText || 0) * 2);
  add('passport.smallText', `< 12px: ${pa.smallText} (не больше ${smallLimit})`, String(pb.smallText), pb.smallText <= smallLimit);
  const newRadius = (pb.radius || []).filter((r) => !(pa.radius || []).includes(r));
  if (newRadius.length) put('passport.radius', `только ${(pa.radius || []).join(', ') || 'без скруглений'}`, `новые: ${newRadius.slice(0, 6).join(', ')}`, 'warn');
  for (const [k, n] of Object.entries(pb.components || {})) {
    if (n > 0 && !((pa.components || {})[k] > 0)) put(`passport.components.${k}`, 'у образца нет', `у вас ×${n} — проектировать из языка образца, решение записать`, 'warn');
  }
}

/* фактура: есть ли слой и тем ли режимом наложен; силу — texture.mjs compare */
const ta = (spec.desktop.texture || [])[0], tb = (mine.desktop.texture || [])[0];
if (ta) {
  add('texture.layer', `${ta.el}: прозрачность ${ta.opacity}, ${ta.blend}`, tb ? `${tb.el}: прозрачность ${tb.opacity}, ${tb.blend}` : 'слоя нет', !!tb);
  if (tb) add('texture.blend', ta.blend, tb.blend, ta.blend === tb.blend);
  const mA = (spec.mobile.texture || []).length, mB = (mine.mobile.texture || []).length;
  add('mobile.texture.layer', mA ? 'есть' : 'нет (у образца зерно только на широком экране)', mB ? 'есть' : 'нет', !!mA === !!mB);
} else if (tb) put('texture.layer', 'у образца нет', `${tb.el}: прозрачность ${tb.opacity}, ${tb.blend}`, 'warn');

const isBad = (r) => r.level === 'bad' || (opt.strict && r.level === 'warn');
const bad = rows.filter(isBad);
const warns = rows.filter((r) => r.level === 'warn');
const w = Math.max(...rows.map((r) => r.key.length), 10);
for (const r of rows) {
  const mark = r.level === 'ok' ? '  ok ' : r.level === 'warn' ? ' ??  ' : ' !!  ';
  console.log(`${mark} ${r.key.padEnd(w)}  ${String(r.want).padEnd(28)} ${r.level === 'ok' ? '' : '→ у вас: ' + r.got}`);
}

/* откуда взято: одна и та же роль с обеих сторон — видно, что сравнивались одинаковые элементы */
const src = (d, lvl) => levelSource(d, lvl) || (d.scaleFrom ? 'не найден' : 'не записано (старый json)');
const acc = (a) => (a.value ? `${a.value} — ${a.note}` : a.note);
console.log('\nОткуда взято:');
for (const [label, a, b] of [
  ['h1', src(spec.desktop, 'h1'), src(mine.desktop, 'h1')],
  ['nav', src(spec.desktop, 'nav'), src(mine.desktop, 'nav')],
  ['mobile.h1', src(spec.mobile, 'h1'), src(mine.mobile, 'h1')],
  ['mobile.nav', src(spec.mobile, 'nav'), src(mine.mobile, 'nav')],
  ['container', containerNote(spec.desktop), containerNote(mine.desktop)],
  ['mobile.container', containerNote(spec.mobile), containerNote(mine.mobile)],
  ['accent', acc(aa), acc(ab)],
]) console.log(`  ${label.padEnd(16)} образец: ${a}\n  ${''.padEnd(16)} у вас:   ${b}`);
if (oldSpec) console.log(`\nWARN спецификация снята extract до 2026-09-24.2 (${(spec.tool && spec.tool.version) || 'версия не записана'}): h1, nav, контейнер и акцент в ней по старым правилам (самый частый h1, все ссылки nav и header, самая частая ширина, доля всего снимка) — переснимите extract, иначе расхождения по ним ложные`);
if (ta) console.log('\nСилу зерна сверять числом: node ~/.claude/skills/site-rework/scripts/texture.mjs compare <образец> <ваша страница>');
console.log(`\nСверено ${rows.length}, расхождений ${rows.filter((r) => r.level === 'bad').length}, предупреждений ${warns.length}` + (ignore.length ? `, пропущено по списку: ${ignore.length} (${ignoreFile})` : '') + (opt['no-ignore'] ? ' (--no-ignore: список отступлений не применялся)' : '') + (opt.strict && warns.length ? ' (--strict: предупреждения считаются расхождениями)' : ''));
process.exit(bad.length ? 1 : 0);
