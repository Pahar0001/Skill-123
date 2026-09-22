#!/usr/bin/env node
/**
 * Сверка своей страницы со снятой спецификацией. Сравниваются числа
 * (шкала, сетка, роли цветов, форма, ритм, движение), а не картинки.
 *
 *   node verify.mjs <спецификация.json> <адрес своей страницы> [--strict]
 *
 * Код выхода 1, если есть расхождения. Отступления, принятые сознательно
 * (раздел «Что не переносим»), перечислить в <спецификация>.ignore —
 * по одному ключу на строку, например: scale.h1.fontFamily
 */
import fs from 'node:fs';
import { extract, roles, motionSummary, dist, seenColor } from './extract.mjs';
import { parseArgs } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
if (pos.length < 2) { console.error('Нужно: node verify.mjs <спецификация.json> <адрес страницы>'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
const ignoreFile = pos[0].replace(/\.json$/, '.ignore');
const ignore = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
const mine = await extract(pos[1], { light: true });

const rows = [];
const add = (key, want, got, ok) => { if (ignore.some((p) => key.startsWith(p))) return; rows.push({ key, want, got, ok }); };
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

const ra = roles(spec.desktop), rb = roles(mine.desktop);
for (const k of Object.keys(ra)) {
  if (!ra[k]) continue;
  add(`color.${k}`, ra[k], rb[k] || 'не выявлено', !!rb[k] && dist(seenColor(ra[k], ra.background), seenColor(rb[k], rb.background)) <= 10);
}
const setOf = (list, n) => list.slice(0, n).map((x) => x.value).sort().join(', ');
add('shape.radius', setOf(spec.desktop.shape.radius, 3) || 'нет', setOf(mine.desktop.shape.radius, 3) || 'нет', setOf(spec.desktop.shape.radius, 3) === setOf(mine.desktop.shape.radius, 3));
const ma = motionSummary(spec.desktop), mb = motionSummary(mine.desktop);
if (ma.durations.length) add('motion.duration', ma.durations[0] + 'ms', (mb.durations[0] ?? 'нет') + 'ms', mb.durations.length > 0 && near(ma.durations[0], mb.durations[0], 50));
if (ma.easings.length) add('motion.easing', ma.easings[0], mb.easings[0] || 'нет', ma.easings[0] === mb.easings[0]);
if (spec.desktop.motion.scrollReveal.length) add('motion.scrollReveal', 'есть', mine.desktop.motion.scrollReveal.length ? 'есть' : 'нет', mine.desktop.motion.scrollReveal.length > 0);
add('motion.reducedMotion', 'учтено', mine.desktop.motion.reducedMotion ? 'учтено' : 'нет', mine.desktop.motion.reducedMotion || !Object.keys(mine.desktop.motion.libs).length && !mine.desktop.motion.transitions.length);

const bad = rows.filter((r) => !r.ok);
const w = Math.max(...rows.map((r) => r.key.length), 10);
for (const r of rows) console.log(`${r.ok ? '  ok ' : ' !!  '} ${r.key.padEnd(w)}  ${String(r.want).padEnd(28)} ${r.ok ? '' : '→ у вас: ' + r.got}`);
console.log(`\nСверено ${rows.length}, расхождений ${bad.length}` + (ignore.length ? `, пропущено по списку: ${ignore.length}` : ''));
process.exit(bad.length ? 1 : 0);
