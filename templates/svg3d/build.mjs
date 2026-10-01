#!/usr/bin/env node
/**
 * Пересобрать образцы templates/svg3d: все рисунки в out/ и вставки в demo.html.
 *
 *   node build.mjs            всё заново (Chrome, Python с cadquery и сеть до Iconify — что недоступно, то пропускается)
 *   node build.mjs --no-net   без иконок Iconify (out/icons остаётся как есть)
 *   node build.mjs --inline   только обновить вставки в demo.html из готовых файлов out/
 *
 * Это не часть инструмента, а запись команд, которыми образцы получены: каждую можно выполнить руками.
 * Вставки в demo.html — между метками <!--svg3d:out/файл.svg class="…"--> и <!--/svg3d-->.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, '..', '..', 'scripts', 'svg3d.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'svg3d-build-'));
const OUT = path.join(HERE, 'out');
const NET = !process.argv.includes('--no-net');
const INLINE = process.argv.includes('--inline');
const BG = '#E9EEDD', INK = '#16301F';
let failed = 0, skipped = 0;

function run(label, args) {
  if (INLINE) return false;
  const r = spawnSync(process.execPath, [TOOL, ...args], { cwd: HERE, encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const verdict = (out.trim().split(/\r?\n/).pop() || '').slice(0, 110);
  if (r.status === 2) { skipped++; console.log(`SKIP ${label} — ${out.trim().split(/\r?\n/).pop().slice(0, 160)}`); return false; }
  if (r.status !== 0) { failed++; console.log(`FAIL ${label}\n${out.trim().split(/\r?\n/).slice(-6).join('\n')}`); return false; }
  const size = (/вес .*? → ([\d.]+ КБ)/.exec(out) || [])[1]; const warn = out.split(/\r?\n/).filter((l) => /^WARN /.test(l));
  console.log(`${warn.length ? 'WARN' : 'OK  '} ${label}${size ? ` — ${size}` : ''}${warn.length ? ` · ${warn.map((w) => w.slice(5, 120)).join(' · ')}` : ''}${!size ? ` · ${verdict}` : ''}`);
  return true;
}

fs.mkdirSync(OUT, { recursive: true });

/* 1. Zdog: набор «игрушечных» иконок, цвета — CSS-переменными (сайт перекрашивает) */
for (const n of ['sprout', 'gift', 'cup', 'pin']) run(`zdog ${n}`, ['zdog', `scenes/zdog-${n}.mjs`, '--out', 'out', '--css-vars', '--for', 'icon']);

/* 2. Three.js: гранёные предметы */
run('three honeycomb', ['three', 'scenes/three-honeycomb.mjs', '--out', 'out']);
run('three crystal', ['three', 'scenes/three-crystal.mjs', '--out', 'out']);

/* 3. CadQuery: чертёжные проекции (цвет — currentColor) */
run('cad gears, вид iso', ['cad', 'scenes/cad-gears.py', '--out', 'out', '--view', 'iso', '--size', '640', '--for', 'background']);
run('cad gears, лист «сверху и спереди»', ['cad', 'scenes/cad-gears.py', '--out', 'out/cad-gears-sheet.svg', '--view', 'top,front', '--size', '720', '--hidden', 'faint', '--for', 'background']);
run('cad crate (встроенная фигура)', ['cad', 'crate', '--out', 'out/cad-crate.svg', '--size', '420', '--hidden', 'faint']);
run('cad nut (встроенная фигура)', ['cad', 'nut', '--out', 'out/cad-nut.svg', '--size', '200', '--hidden', 'none']);

/* 4. Фон-россыпь: одна сцена в нескольких ракурсах (--frames) и ещё две — каждый рисунок описан один раз */
run('zdog sprout, 5 ракурсов', ['zdog', 'scenes/zdog-sprout.mjs', '--out', path.join(TMP, 'f'), '--frames', '5', '--size', '200']);
run('zdog gift, ракурс', ['zdog', 'scenes/zdog-gift.mjs', '--out', path.join(TMP, 'f', 'gift-b.svg'), '--rotate', '0,95,0']);
run('zdog cup, ракурс', ['zdog', 'scenes/zdog-cup.mjs', '--out', path.join(TMP, 'f', 'cup-b.svg'), '--rotate', '8,-70,0']);
const frames = ['zdog-sprout-01', 'zdog-sprout-02', 'zdog-sprout-04', 'gift-b', 'cup-b'].map((n) => path.join(TMP, 'f', `${n}.svg`)).filter((f) => fs.existsSync(f));
if (frames.length) run('scatter — фон первого экрана', ['scatter', ...frames, path.join(OUT, 'zdog-gift.svg'), path.join(OUT, 'zdog-cup.svg'), '--out', 'out/bg-scatter.svg', '--size', '1440x760', '--count', '16', '--item', '150', '--area', 'edges', '--seed', '12']);
/* телефону — своя полоса: у широкого фона предметы стоят по краям, на 320 px от них остаётся пустая середина */
if (frames.length) run('scatter — полоса для телефона', ['scatter', ...frames, '--out', 'out/bg-scatter-m.svg', '--size', '640x220', '--count', '7', '--item', '96', '--seed', '3', '--tilt', '18']);
if (fs.existsSync(path.join(OUT, 'cad-nut.svg'))) run('scatter — чертёжная россыпь', ['scatter', 'out/cad-nut.svg', 'out/cad-crate.svg', '--out', 'out/bg-blueprint.svg', '--size', '1440x520', '--count', '9', '--item', '150', '--seed', '4', '--tilt', '16', '--area', 'right', '--band', '0.36']);

/* 5. Вариант «от руки» (чертёж одной линией — лёгкий; штриховка гранёного предмета — 40–50 КБ, см. README) и перевод рендера в вектор */
if (fs.existsSync(path.join(OUT, 'cad-crate.svg'))) run('rough crate', ['rough', 'out/cad-crate.svg', '--out', 'out/cad-crate-rough.svg', '--single-stroke', '--roughness', '0.9']);
if (fs.existsSync(path.join(OUT, 'three-crystal.svg'))) {
  if (run('preview crystal (растр для trace)', ['preview', 'out/three-crystal.svg', '--out', path.join(TMP, 'crystal.png'), '--bg', '#FFFFFF', '--width', '640'])) {
    run('trace crystal', ['trace', path.join(TMP, 'crystal.png'), '--out', 'out/traced-crystal.svg', '--colors', '10', '--simplify', '3', '--drop-bg']);
  }
}

/* 6. Иконки Iconify: лицензия набора — в out/icons/credits.json */
if (NET) run('icon lucide (ISC)', ['icon', 'lucide:leaf', 'lucide:gift', 'lucide:coffee', 'lucide:map-pin', 'lucide:phone', '--out', 'out/icons', '--caption', 'иконка в подвале образца', '--stroke-width', '1.75']);

/* 7. Вставки в demo.html */
const demo = path.join(HERE, 'demo.html');
if (fs.existsSync(demo)) {
  let html = fs.readFileSync(demo, 'utf8'); let n = 0, missing = 0;
  html = html.replace(/<!--svg3d:(\S+?)((?:\s+[\w-]+="[^"]*")*)-->(?:(?!<!--svg3d:)[\s\S])*?<!--\/svg3d-->/g, (all, rel, extra) => {
    const f = path.join(HERE, rel); if (!fs.existsSync(f)) { missing++; return all; }
    n++; const svg = fs.readFileSync(f, 'utf8').replace(/^<svg\b/, `<svg${extra}`).replace(/\sxmlns="[^"]*"/, '');
    return `<!--svg3d:${rel}${extra}-->${svg}<!--/svg3d-->`;
  });
  fs.writeFileSync(demo, html);
  console.log(`${missing ? 'WARN' : 'OK  '} demo.html — вставок ${n}${missing ? `, нет файлов для ${missing}` : ''}`);
}

/* 8. Лист-контакт — посмотреть всё глазами */
run('sheet', ['sheet', 'out', '--out', path.join(TMP, 'sheet.png'), '--bg', BG, '--color', INK, '--cols', '4', '--cell', '300']);
if (!INLINE) console.log(`\nлист-контакт: ${path.join(TMP, 'sheet.png')}`);
console.log(`${failed ? 'FAIL' : 'OK'}: провалов ${failed}, пропущено ${skipped} (нет движка или сети)`);
process.exit(failed ? 1 : 0);
