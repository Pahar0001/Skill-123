#!/usr/bin/env node
/**
 * Стенд для blender.mjs selftest: маленький GLB, собранный three.js GLTFExporter в безголовом Chrome, —
 * три карточки со скруглёнными краями падают на место (анимация положения и поворота, 1.6 с), материалы
 * PBR (глянец, бумага, металл). Blender для него не нужен: так selftest проверяет glb-check и страницу
 * viewer.html на машине без Blender.
 *
 *   node make-glb.mjs [--out stack.glb]      пересобрать stack.glb рядом (файл уже лежит в стенде)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { loadPuppeteer, requireChrome } from '../../lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '')); process.exit(0); }
const oi = argv.indexOf('--out');
const OUT = path.resolve(oi >= 0 ? argv[oi + 1] : path.join(HERE, 'stack.glb'));
const THREE_DIR = [process.env.SITE_REWORK_PROJECT, path.join(os.homedir(), '.claude', 'site-rework')].filter(Boolean)
  .map((r) => path.join(r, 'node_modules', 'three')).find((d) => fs.existsSync(path.join(d, 'build', 'three.module.js')));
if (!THREE_DIR) { console.error('нет three: npm i three --prefix ~/.claude/site-rework'); process.exit(2); }

const PAGE = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
try {
  const scene = new THREE.Scene();
  const mats = [
    new THREE.MeshPhysicalMaterial({ color: '#C8553D', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: '#E7E3DD', roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: '#2F6B5A', roughness: 0.4 }),
  ];
  const tracks = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.05, 1.0, 1, 0.02), mats[i]);
    m.name = 'card' + i;
    m.position.set(0.05 * i, 0.025 + 0.055 * i, -0.04 * i);
    m.rotation.y = 0.2 * i - 0.2;
    scene.add(m);
    const y0 = 1.2 + i * 0.5, y1 = m.position.y;
    tracks.push(new THREE.VectorKeyframeTrack(m.name + '.position', [0, 0.6 + i * 0.25, 1.6], [m.position.x, y0, m.position.z, m.position.x, y1, m.position.z, m.position.x, y1, m.position.z]));
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, m.rotation.y + 0.8, 0.3));
    const q1 = m.quaternion.clone();
    tracks.push(new THREE.QuaternionKeyframeTrack(m.name + '.quaternion', [0, 0.6 + i * 0.25, 1.6], [...q0.toArray(), ...q1.toArray(), ...q1.toArray()]));
  }
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 32), new THREE.MeshStandardMaterial({ color: '#D9B66A', metalness: 1, roughness: 0.25 }));
  coin.name = 'coin'; coin.position.set(0.45, 0.18, 0.15); scene.add(coin);
  const clip = new THREE.AnimationClip('drop', 1.6, tracks);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: [clip] });
  const bytes = new Uint8Array(glb); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  window.__glb = btoa(s);
} catch (e) { window.__err = String(e && e.stack || e); }
window.__done = true;
</script>`;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/' || u === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
  const p = path.normalize(path.join(THREE_DIR, u.replace(/^\/three\//, '')));
  if (!u.startsWith('/three/') || !p.startsWith(THREE_DIR)) { res.writeHead(404); return res.end(); }
  fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(buf); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await loadPuppeteer().launch({ executablePath: requireChrome(), headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  await page.waitForFunction('window.__done === true', { timeout: 60000 });
  const err = await page.evaluate('window.__err || null');
  if (err) throw new Error(err);
  const buf = Buffer.from(await page.evaluate('window.__glb'), 'base64');
  fs.writeFileSync(OUT, buf);
  console.log(`OK ${OUT}: ${buf.length} байт`);
} finally { await browser.close(); server.close(); }
