/* glb-viewer — модель GLB на странице сайта (three.js, без внешних CDN).
 *
 *   <figure class="glb-viewer" data-src="models/stack.glb" data-alt="Стопка карточек" style="aspect-ratio: 4 / 3">
 *     <img class="glb-poster" src="models/stack.webp" alt="" width="1200" height="900">
 *   </figure>
 *   <script type="importmap">{ "imports": {
 *     "three": "./vendor/three/build/three.module.js",
 *     "three/addons/": "./vendor/three/examples/jsm/" } }</script>
 *   <script type="module">import { mountAll } from './glb-viewer.js'; mountAll();</script>
 *
 * Что делает:
 *   · ленивый запуск: three.js и модель не скачиваются, пока блок не подошёл к экрану (IntersectionObserver);
 *   · рисует только когда есть что рисовать: анимация идёт, модель крутят, размер поменялся; вне экрана и на
 *     скрытой вкладке — пауза (ни одного кадра);
 *   · prefers-reduced-motion: reduce — статичный кадр: анимация физики сразу в конечном положении, без вращения;
 *   · без WebGL или при ошибке загрузки — остаётся картинка-постер (WebP-пререндер из blender.mjs);
 *   · камера по рамке модели (для анимации — по конечному положению), мягкий студийный свет из «софтбоксов»
 *     (как у пререндера), тень на земле под стоящей моделью;
 *   · перетаскивание мышью или пальцем поворачивает модель (data-drag="false" — выключить).
 *
 * Атрибуты блока (все необязательные, кроме data-src):
 *   data-src        путь к .glb (тот же сайт)
 *   data-alt        описание для чтения с экрана (без него блок — украшение, aria-hidden)
 *   data-view       откуда смотрим, «x,y,z» в осях three (Y вверх; Blender −Y «спереди» = three +Z): 0.35,0.3,1
 *   data-fov        угол камеры по вертикали, градусы (30)
 *   data-margin     поле вокруг модели (1.15)
 *   data-loop       once — анимация один раз и стоп (по умолчанию: «упали и улеглись») | repeat
 *   data-rotate     автоповорот, градусов в секунду (0 — нет)
 *   data-shadow     false — без тени на земле
 *   data-exposure   выдержка (1)
 *   data-draco      папка декодера Draco (./vendor/three/examples/jsm/libs/draco/gltf/)
 *
 * Состояние — el.dataset.state: idle → loading → ready | fallback | error; событие «glb:state».
 * Управление — el.glbViewer: { state, frames, stats, reduced, replay(), snapshot(), destroy() }.
 * snapshot() — PNG текущего кадра (data URL): постер из живой сцены, проверка в glb-check.
 */

const DRACO_DEFAULT = './vendor/three/examples/jsm/libs/draco/gltf/';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

const num = (v, d) => (v != null && v !== '' && Number.isFinite(+v) ? +v : d);
const vec = (v, d) => {
  const a = String(v || '').split(',').map(Number);
  return a.length === 3 && a.every(Number.isFinite) ? a : d;
};

export function mountAll(selector = '.glb-viewer', options = {}) {
  return [...document.querySelectorAll(selector)].map((el) => mount(el, options));
}

export function mount(el, options = {}) {
  if (el.glbViewer) return el.glbViewer;
  const d = el.dataset;
  const opt = {
    src: options.src || d.src,
    view: vec(d.view, options.view || [0.35, 0.3, 1]),
    fov: num(d.fov, options.fov || 30),
    margin: num(d.margin, options.margin || 1.15),
    loop: (d.loop || options.loop || 'once') === 'repeat' ? 'repeat' : 'once',
    rotate: num(d.rotate, options.rotate || 0),
    shadow: (d.shadow || String(options.shadow ?? 'true')) !== 'false',
    exposure: num(d.exposure, options.exposure || 1),
    draco: d.draco || options.draco || DRACO_DEFAULT,
    drag: (d.drag || String(options.drag ?? 'true')) !== 'false',
  };
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const ctl = {
    state: 'idle', frames: 0, stats: null, reduced: !!(mq && mq.matches),
    replay: () => {}, snapshot: () => null, destroy: () => {},
  };
  el.glbViewer = ctl;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  if (d.alt) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', d.alt); } else el.setAttribute('aria-hidden', 'true');
  const poster = el.querySelector('.glb-poster');

  const setState = (s, detail) => {
    ctl.state = s;
    el.dataset.state = s;
    el.dispatchEvent(new CustomEvent('glb:state', { detail: { state: s, ...detail } }));
  };
  setState('idle');
  if (!opt.src) { setState('error', { reason: 'нет data-src' }); return ctl; }
  if (!webglAvailable()) { setState('fallback', { reason: 'нет WebGL' }); return ctl; }

  let visible = false, raf = 0, last = 0, dirty = true, dragging = false;
  let T, renderer, scene, camera, pivot, mixer, duration = 0, ro;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) visible = e.isIntersecting;
    if (visible && ctl.state === 'idle') start();
    kick();
  }, { rootMargin: '200px 0px' });
  io.observe(el);
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);
  const onMq = () => { ctl.reduced = mq.matches; if (mixer && ctl.reduced) mixer.setTime(duration); dirty = true; kick(); };
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq);

  const animating = () => !!mixer && !ctl.reduced && (opt.loop === 'repeat' || mixer.time < duration);
  const spinning = () => opt.rotate > 0 && !ctl.reduced;
  const shouldRun = () => ctl.state === 'ready' && visible && !document.hidden && (dirty || dragging || animating() || spinning());

  function kick() {
    if (!raf && shouldRun()) { last = 0; raf = requestAnimationFrame(tick); }
  }
  function tick(t) {
    raf = 0;
    const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 0; // после паузы — без скачка
    last = t;
    if (mixer && !ctl.reduced) mixer.update(dt);
    if (spinning() && !dragging) pivot.rotation.y += (opt.rotate * Math.PI / 180) * dt;
    draw();
    if (shouldRun()) raf = requestAnimationFrame(tick);
  }
  function draw() {
    renderer.render(scene, camera);
    ctl.frames++;
    dirty = false;
    if (ctl.stats && mixer) ctl.stats.time = +mixer.time.toFixed(3);
  }

  async function start() {
    setState('loading');
    try {
      const [three, { GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('three'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js'),
      ]);
      T = three;
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.NeutralToneMapping;
      renderer.toneMappingExposure = opt.exposure;
      renderer.shadowMap.enabled = opt.shadow;
      renderer.shadowMap.type = T.PCFShadowMap;
      const cv = renderer.domElement;
      Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: opt.drag ? 'pan-y' : 'auto' });
      cv.setAttribute('aria-hidden', 'true');
      cv.className = 'glb-canvas';

      scene = new T.Scene();
      camera = new T.PerspectiveCamera(opt.fov, 1, 0.01, 100);
      pivot = new T.Group();
      scene.add(pivot);

      const draco = new DRACOLoader().setDecoderPath(opt.draco);
      const loader = new GLTFLoader().setDRACOLoader(draco);
      const gltf = await loader.loadAsync(opt.src);
      draco.dispose();
      const model = gltf.scene;
      pivot.add(model);

      if (gltf.animations.length) {
        mixer = new T.AnimationMixer(model);
        for (const clip of gltf.animations) {
          const a = mixer.clipAction(clip);
          if (opt.loop === 'once') { a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = true; }
          a.play();
          duration = Math.max(duration, clip.duration);
        }
        mixer.setTime(duration); // рамка камеры и тень — по конечному положению («улеглось»)
      }
      model.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(model);
      const sph = box.getBoundingSphere(new T.Sphere());
      const R = Math.max(sph.radius, 1e-3), C = sph.center.clone();
      model.position.x -= C.x; model.position.z -= C.z; // центр модели — на оси поворота (мышь, автоповорот)
      const target = new T.Vector3(0, C.y, 0);
      const corners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new T.Vector3(x - C.x, y, z - C.z));
      /* ракурсы, в которых модель должна помещаться: поворачивают — весь круг, иначе — только исходный */
      const yaws = opt.drag || opt.rotate > 0 ? [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k * Math.PI) / 4) : [0];

      /* студия: тёмный купол и светящиеся плоскости — длинные блики на лаке, как у пререндера */
      const studio = new T.Scene();
      const lamp = (w, h, color, power, pos) => {
        const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(power), side: T.DoubleSide }));
        m.position.set(...pos); m.lookAt(0, 0, 0); studio.add(m);
      };
      studio.add(new T.Mesh(new T.SphereGeometry(40, 32, 16), new T.MeshBasicMaterial({ color: new T.Color('#5d6658').multiplyScalar(0.16), side: T.BackSide })));
      lamp(9, 7, '#fff4e0', 11, [-6, 14, 6]);
      lamp(2.2, 18, '#ffffff', 9, [-15, 3, 4]);
      lamp(1.6, 14, '#f4f8ff', 5, [15, 2, 6]);
      lamp(14, 3, '#ffffff', 7, [3, 9, -14]);
      lamp(8, 5, '#ffffff', 0.7, [0, 1, 16]);
      const pm = new T.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(studio, 0.03).texture;
      scene.environmentIntensity = 0.85;
      pm.dispose();

      const key = new T.DirectionalLight(0xfff2dc, 2.2);
      key.position.set(-0.6 * R * 4, R * 6, 0.5 * R * 4);
      key.target.position.copy(target);
      scene.add(key, key.target);
      scene.add(new T.HemisphereLight(0xffffff, 0xe8e2d8, 0.35));
      if (opt.shadow) {
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        const sc = key.shadow.camera;
        sc.left = sc.bottom = -R * 1.6; sc.right = sc.top = R * 1.6; sc.near = 0.01; sc.far = R * 14;
        key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01 * R;
        model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const ground = new T.Mesh(new T.PlaneGeometry(R * 10, R * 10), new T.ShadowMaterial({ color: 0x1e2420, opacity: 0.22 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, box.min.y - R * 0.001, 0);
        ground.receiveShadow = true;
        scene.add(ground);
      }

      const dir = new T.Vector3(...opt.view).normalize();
      const place = (dist) => {
        camera.position.copy(target).addScaledVector(dir, dist);
        camera.near = Math.max(0.001, dist - R * 3); camera.far = dist + R * 6;
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
      };
      /* камера по рамке: сначала по описанной сфере, потом по проекции углов рамки (плоская модель не тонет в поле) */
      const fit = () => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const vf = T.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
        let dist = (R * opt.margin) / Math.sin(Math.min(vf, hf) / 2);
        const p = new T.Vector3();
        for (let it = 0; it < 4; it++) {
          place(dist);
          let ext = 0;
          for (const a of yaws) {
            const c = Math.cos(a), s = Math.sin(a);
            for (const v of corners) { p.set(v.x * c + v.z * s, v.y, -v.x * s + v.z * c).project(camera); ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y)); }
          }
          if (!(ext > 0) || Math.abs(ext * opt.margin - 1) < 0.01) break;
          dist = Math.max(dist * ext * opt.margin, R * 0.6);
        }
        place(dist);
        dirty = true;
        kick();
      };
      el.prepend(cv);
      ro = new ResizeObserver(fit);
      ro.observe(el);
      fit();

      /* после setTime(duration) действие LoopOnce стоит на паузе в конце — для показа его надо сбросить;
         «меньше движения» — так и остаётся конечный кадр */
      const rewind = () => { for (const c of gltf.animations) mixer.clipAction(c).reset().play(); mixer.setTime(0); };
      if (mixer && !ctl.reduced) rewind();
      let verts = 0, tris = 0, meshes = 0;
      model.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const g = o.geometry, n = g.attributes.position ? g.attributes.position.count : 0;
        verts += n; tris += g.index ? g.index.count / 3 : n / 3;
      });
      ctl.stats = { meshes, vertices: verts, triangles: Math.round(tris), animations: gltf.animations.length, duration: +duration.toFixed(3), radius: +R.toFixed(4), time: 0 };
      ctl.replay = () => { if (mixer && !ctl.reduced) { rewind(); dirty = true; kick(); } };
      ctl.snapshot = () => { draw(); return renderer.domElement.toDataURL('image/png'); };

      if (opt.drag) {
        let x0 = 0, y0 = 0, ry = 0, rx = 0;
        cv.addEventListener('pointerdown', (e) => { dragging = true; x0 = e.clientX; y0 = e.clientY; ry = pivot.rotation.y; rx = pivot.rotation.x; cv.setPointerCapture(e.pointerId); kick(); });
        cv.addEventListener('pointermove', (e) => {
          if (!dragging) return;
          pivot.rotation.y = ry + (e.clientX - x0) * 0.01;
          pivot.rotation.x = Math.max(-0.35, Math.min(0.35, rx + (e.clientY - y0) * 0.004));
          dirty = true;
        });
        const up = () => { dragging = false; };
        cv.addEventListener('pointerup', up);
        cv.addEventListener('pointercancel', up);
      }

      draw();
      if (poster) {
        poster.style.transition = ctl.reduced ? 'none' : 'opacity .4s ease';
        poster.style.opacity = '0';
      }
      ctl.destroy = () => {
        cancelAnimationFrame(raf); io.disconnect(); if (ro) ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq);
        renderer.dispose(); cv.remove(); if (poster) poster.style.opacity = '';
      };
      setState('ready', { stats: ctl.stats });
      kick();
    } catch (e) {
      console.warn('glb-viewer: модель не загрузилась —', opt.src, e);
      if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
      setState('error', { reason: String((e && e.message) || e) });
    }
  }
  return ctl;
}
