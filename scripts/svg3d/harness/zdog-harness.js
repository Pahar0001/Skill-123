/* Выполняется в странице безголового Chrome (svg3d.mjs zdog). Zdog уже загружен обычным скриптом.
   Сцена — ES-модуль: export function build({ Zdog, illo, palette, TAU, frame, frames }) и по желанию
   export const view = { size: [240, 240], zoom: 1, rotate: { x, y, z } }  (радианы, как в Zdog)
   export const palette = { ink: '#16301F', … }  — цвета по умолчанию, --palette подменяет по именам. */
window.svg3dZdog = async function svg3dZdog(opts) {
  const NS = 'http://www.w3.org/2000/svg';
  const Zdog = window.Zdog; const TAU = Zdog.TAU;
  const mod = await import(opts.scene);
  if (typeof mod.build !== 'function') throw new Error('в сцене нет export function build(ctx)');
  const view = Object.assign({ size: [240, 240], zoom: 1, rotate: {} }, mod.view || {});
  const W = opts.width || view.size[0], H = opts.height || view.size[1];
  const zoom = (opts.zoom || 1) * (view.zoom || 1);
  const palette = Object.assign({}, mod.palette || {}, opts.palette || {});
  const known = Object.keys(mod.palette || {});
  const rad = (deg) => (deg || 0) * TAU / 360;
  const base = { x: (view.rotate.x || 0) + rad(opts.rotate[0]), y: (view.rotate.y || 0) + rad(opts.rotate[1]), z: (view.rotate.z || 0) + rad(opts.rotate[2]) };
  const N = Math.max(1, opts.frames || 1); const axis = opts.axis || 'y';
  const frames = [];
  for (let f = 0; f < N; f++) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible';
    document.body.appendChild(svg);
    const rotate = Object.assign({}, base); rotate[axis] += f * TAU / N;
    const illo = new Zdog.Illustration({ element: svg, zoom, rotate });
    await mod.build({ Zdog, illo, palette, TAU, frame: f, frames: N });
    illo.updateRenderGraph();
    /* рамка содержимого в единицах viewBox (с обводкой): экранная рамка ÷ zoom, начало — центр */
    const r0 = svg.getBoundingClientRect(); let box = null;
    const paths = [];
    for (const el of svg.children) {
      const a = {}; for (const at of el.attributes) a[at.name] = at.value;
      paths.push({ tag: el.tagName, attrs: a });
      /* getBoundingClientRect у фигур SVG — рамка заливки, без обводки: половину толщины добавляем сами.
         Шар у Zdog — контур нулевой длины с толстой обводкой: рамка нулевая, но стоит в нужной точке. */
      const r = el.getBoundingClientRect();
      const sw = a.stroke && a.stroke !== 'none' ? (parseFloat(a['stroke-width']) || 0) / 2 : 0;
      const b = [(r.left - r0.left) / zoom - W / zoom / 2 - sw, (r.top - r0.top) / zoom - H / zoom / 2 - sw, (r.right - r0.left) / zoom - W / zoom / 2 + sw, (r.bottom - r0.top) / zoom - H / zoom / 2 + sw];
      box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
    }
    frames.push({ paths, box });
    svg.remove();
  }
  return { width: W, height: H, zoom, viewBox: [-W / zoom / 2, -H / zoom / 2, W / zoom, H / zoom], frames, palette, known, zdog: Zdog.version || null };
};
