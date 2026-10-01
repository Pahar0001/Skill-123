/* Выполняется в странице безголового Chrome (svg3d.mjs three): сцена Three.js → грани SVGRenderer с глубиной.
   Сцена — ES-модуль:
     export function build({ THREE, scene, root, palette, color, lights, frame, frames }) — предметы класть в root
       (его вращают --rotate и --frames), свет — через lights({...}) или в scene; можно вернуть { camera } — тогда
       камера не подгоняется;
     export const view = { size: [320, 320], pad: 8, rotate: [0, 0, 0],            (градусы)
                           camera: { type: 'ortho' | 'persp', dir: [1, 0.8, 1], up: [0, 1, 0], fov: 30 } }
     export const palette = { … }.
   Материалы: MeshLambertMaterial (плоская грань со светом), MeshBasicMaterial (цвет как есть). Текстур, теней и
   бликов SVGRenderer не умеет. */
import * as THREE from 'three';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { Projector, RenderableFace } from 'three/addons/renderers/Projector.js';

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

function parseStyle(style) {
  const o = {}; for (const part of String(style || '').split(';')) { const i = part.indexOf(':'); if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return o;
}
function rgbHex(v) { const m = /rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(v || ''); return m ? `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}` : null; }

/* границы содержимого в координатах камеры: все вершины сеток, линий и точек */
function extents(root, camera, box) {
  const v = new THREE.Vector3(); const inv = camera.matrixWorldInverse;
  root.traverseVisible((o) => {
    const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position; if (!pos || !(o.isMesh || o.isLine || o.isPoints)) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      if (v.x < box[0]) box[0] = v.x; if (v.x > box[1]) box[1] = v.x; if (v.y < box[2]) box[2] = v.y; if (v.y > box[3]) box[3] = v.y; if (v.z < box[4]) box[4] = v.z; if (v.z > box[5]) box[5] = v.z;
    }
  });
  return box;
}

window.svg3dThree = async function svg3dThree(opts) {
  const mod = await import(opts.scene);
  if (typeof mod.build !== 'function') throw new Error('в сцене нет export function build(ctx)');
  const view = Object.assign({ size: [320, 320], pad: 8, rotate: [0, 0, 0], camera: {} }, mod.view || {});
  const cam = Object.assign({ type: 'ortho', dir: [1, 0.8, 1], up: [0, 1, 0], fov: 30 }, view.camera || {});
  const W = opts.width || view.size[0], H = opts.height || view.size[1];
  const pad = opts.pad != null ? opts.pad : view.pad;
  const palette = Object.assign({}, mod.palette || {}, opts.palette || {});
  const N = Math.max(1, opts.frames || 1); const axis = opts.axis || 'y';
  const deg = Math.PI / 180;
  const baseRot = [0, 1, 2].map((i) => ((view.rotate && view.rotate[i]) || 0) + (opts.rotate[i] || 0));

  const makeScene = async (f) => {
    const scene = new THREE.Scene(); const root = new THREE.Group(); scene.add(root);
    const lin = (k) => new THREE.Color().setRGB(k, k, k);   /* сила света — в линейном пространстве, как считает SVGRenderer */
    const lights = ({ ambient = 0.4, key = null, fill = null, rim = null } = {}) => {
      scene.add(new THREE.AmbientLight(lin(ambient)));   /* SVGRenderer берёт у окружающего света только цвет, intensity не учитывает */
      for (const l of [key, fill, rim]) { if (!l) continue; const d = new THREE.DirectionalLight(lin(1), l.power == null ? 0.6 : l.power); d.position.set(...(l.dir || [0.4, 1, 0.7])); scene.add(d); }
    };
    const color = (name) => { if (!(name in palette)) throw new Error(`в палитре нет цвета «${name}» (есть: ${Object.keys(palette).join(', ')})`); return new THREE.Color(palette[name]); };
    const res = (await mod.build({ THREE, scene, root, palette, color, lights, frame: f, frames: N })) || {};
    let hasLight = false; scene.traverse((o) => { if (o.isLight) hasLight = true; });
    if (!hasLight) lights({ ambient: 0.42, key: { dir: [0.45, 1, 0.7], power: 0.6 } });
    const r = baseRot.slice(); r['xyz'.indexOf(axis)] += f * 360 / N;
    root.rotation.set(r[0] * deg, r[1] * deg, r[2] * deg);
    scene.updateMatrixWorld(true);
    return { scene, root, camera: res.camera || null };
  };

  /* первый проход: общие границы по всем кадрам — предмет не «прыгает» между кадрами */
  const built = []; let camera = null; const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let f = 0; f < N; f++) built.push(await makeScene(f));
  const own = built.find((b) => b.camera);
  if (own) camera = own.camera;
  else {
    const wb = new THREE.Box3(); for (const b of built) wb.expandByObject(b.root);
    if (wb.isEmpty()) throw new Error('сцена пуста: в root ничего не добавлено');
    const c = wb.getCenter(new THREE.Vector3()); const R = wb.getBoundingSphere(new THREE.Sphere()).radius || 1;
    const dir = new THREE.Vector3(...cam.dir).normalize();
    if (cam.type === 'persp') {
      const fov = cam.fov || 30; const dist = R / Math.sin(fov * deg / 2) * (1 + 2 * pad / Math.min(W, H));
      camera = new THREE.PerspectiveCamera(fov, W / H, Math.max(0.01, dist - R * 1.5), dist + R * 1.5);
      camera.position.copy(c).addScaledVector(dir, dist); camera.up.set(...cam.up); camera.lookAt(c);
    } else {
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, R * 10);
      camera.position.copy(c).addScaledVector(dir, R * 4); camera.up.set(...cam.up); camera.lookAt(c);
      camera.updateMatrixWorld(true);
      for (const b of built) extents(b.root, camera, box);
      const w = box[1] - box[0], h = box[3] - box[2]; const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
      const cx = (box[0] + box[1]) / 2, cy = (box[2] + box[3]) / 2; const zr = (box[5] - box[4]) || 1;
      camera.left = cx - W / (2 * s); camera.right = cx + W / (2 * s); camera.top = cy + H / (2 * s); camera.bottom = cy - H / (2 * s);
      camera.near = -box[5] - zr * 0.02; camera.far = -box[4] + zr * 0.02;
    }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }

  const frames = [];
  for (let f = 0; f < N; f++) {
    const { scene } = built[f];
    const renderer = new SVGRenderer(); renderer.setSize(W, H); renderer.overdraw = 0; renderer.setQuality('high');
    renderer.render(scene, camera);
    const els = new Projector().projectScene(scene, camera, true, true).elements;
    const items = []; let ei = 0, matched = true;
    for (const node of renderer.domElement.children) {
      const st = parseStyle(node.getAttribute('style')); const d = node.getAttribute('d') || '';
      const fill = st.fill && st.fill !== 'none' ? rgbHex(st.fill) : null;
      for (const seg of d.split('M').filter(Boolean)) {
        const n = (seg.match(NUM) || []).map(Number);
        const isFace = fill && /z\s*$/i.test(seg) && !/[hv]/i.test(seg) && n.length === 6;
        if (!isFace) {
          const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
          const a = {}; for (const [k, v] of Object.entries(st)) a[k] = /^rgb\(/.test(v) ? rgbHex(v) : v;
          items.push({ raw: true, d: 'M' + seg, attrs: a, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
          continue;
        }
        let z = null, base = null;
        while (ei < els.length) {
          const e = els[ei++]; if (!(e instanceof RenderableFace)) continue;
          const p = [e.v1.positionScreen.x * W / 2, -e.v1.positionScreen.y * H / 2, e.v2.positionScreen.x * W / 2, -e.v2.positionScreen.y * H / 2, e.v3.positionScreen.x * W / 2, -e.v3.positionScreen.y * H / 2];
          if (p.every((v, i) => Math.abs(v - n[i]) < 1e-6 * Math.max(W, H) + 1e-9)) {
            z = [e.v1.positionScreen.z, e.v2.positionScreen.z, e.v3.positionScreen.z];
            if (e.material && e.material.color && !e.material.vertexColors) base = '#' + e.material.color.getHexString();
            break;
          }
        }
        if (!z) matched = false;
        items.push({ p: n, z, fill, opacity: st['fill-opacity'] == null ? 1 : Number(st['fill-opacity']), base });
      }
    }
    frames.push({ items, matched, info: { faces: renderer.info.render.faces } });
  }
  return { width: W, height: H, viewBox: [-W / 2, -H / 2, W, H], frames, palette, known: Object.keys(mod.palette || {}), three: THREE.REVISION, camera: camera.isOrthographicCamera ? 'ortho' : 'persp' };
};
window.svg3dThreeReady = true;
