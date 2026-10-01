/**
 * zdog-live.js — «живая» сцена Zdog на месте статичного SVG: поворачивается вслед за прокруткой и мышью.
 *
 *   <div data-zdog-live="scenes/zdog-sprout.mjs">
 *     <svg …>…</svg>            ← статичный вид из svg3d.mjs zdog (та же сцена): он же запасной
 *   </div>
 *   <script type="module" src="zdog-live.js"></script>
 *
 * Что происходит: блок подходит к экрану → грузятся Zdog (30 КБ, 7 КБ после сжатия; свой файл vendor/zdog.dist.min.js) и
 * модуль сцены → рядом со статичным SVG появляется живой, статичный прячется. Не вышло (нет JS, файл не
 * загрузился, ошибка в сцене) — остаётся статичный: страница от скрипта не зависит.
 *
 * Правила навыка:
 * - «меньше движения» — библиотека не грузится вовсе, остаётся статичный вид; включили настройку при
 *   открытой странице — живой убирается;
 * - петель нет: кадр рисуется только пока предмет доворачивается к новому положению, потом всё стоит;
 * - вне экрана ничего не слушается и не рисуется;
 * - декор: aria-hidden="true", focusable="false", мышь не ловит (наведение слушает сам блок).
 *
 * Настройка — атрибутами блока:
 *   data-zdog-live="адрес сцены"   ES-модуль с export function build({ Zdog, illo, palette, TAU })
 *   data-zdog-mode="scroll hover"  что поворачивает: scroll — прокрутка, hover — мышь над блоком (по умолчанию оба)
 *   data-zdog-turn="1.2"           на сколько радиан предмет поворачивается за проход блока по экрану
 *   data-zdog-lib="адрес"          где лежит zdog.dist.min.js (по умолчанию vendor/ рядом с этим файлом)
 *   data-zdog-var-prefix="c-"      цвета палитры берутся из CSS-переменных: цвет moss → var(--c-moss, запасной)
 * Состояние — в data-zdog-state: live | static (почему — в консоли, одной строкой).
 */
const NS = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const live = new Map();   /* блок → { stop } */
let zdogLoading = null;

function loadZdog(src) {
  if (window.Zdog) return Promise.resolve(window.Zdog);
  if (!zdogLoading) {
    zdogLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = () => (window.Zdog ? resolve(window.Zdog) : reject(new Error('в файле нет Zdog')));
      s.onerror = () => reject(new Error(`не загрузился ${src}`));
      document.head.append(s);
    });
  }
  return zdogLoading;
}

async function start(host) {
  if (live.has(host) || reduced.matches) return;
  live.set(host, { stop() {} });   /* место занято: повторный вход в экран не запустит второй раз */
  const still = host.querySelector('svg, img');
  try {
    const lib = host.dataset.zdogLib || new URL('./vendor/zdog.dist.min.js', import.meta.url).href;
    const [Zdog, mod] = await Promise.all([loadZdog(lib), import(new URL(host.dataset.zdogLive, document.baseURI).href)]);
    if (reduced.matches) { live.delete(host); return; }
    const view = { size: [240, 240], zoom: 1, rotate: {}, ...(mod.view || {}) };
    const prefix = host.dataset.zdogVarPrefix ?? 'c-';
    const palette = Object.fromEntries(Object.entries(mod.palette || {}).map(([k, v]) => [k, `var(--${prefix}${k}, ${v})`]));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', view.size[0]); svg.setAttribute('height', view.size[1]);   /* Zdog читает размер из атрибутов */
    const base = { x: 0, y: 0, z: 0, ...view.rotate };
    const illo = new Zdog.Illustration({ element: svg, zoom: view.zoom, rotate: { ...base } });
    await mod.build({ Zdog, illo, palette, TAU: Zdog.TAU, frame: 0, frames: 1 });
    /* поле — как у статичного вида: живой встаёт точно на его место */
    const box = still && still.getAttribute && still.getAttribute('viewBox');
    if (box) svg.setAttribute('viewBox', box);
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', `${(still && still.getAttribute('class')) || ''} zdog-live`.trim());
    svg.style.pointerEvents = 'none';
    illo.updateRenderGraph();
    host.append(svg);
    if (still) still.style.display = 'none';
    host.dataset.zdogState = 'live';

    const modes = (host.dataset.zdogMode || 'scroll hover').split(/\s+/);
    const turn = Number(host.dataset.zdogTurn) || 1.2;
    const scroll = { y: 0 }, hover = { x: 0, y: 0 }, cur = { x: base.x, y: base.y };
    let raf = 0, visible = true;
    const target = () => ({ x: base.x + hover.x, y: base.y + scroll.y + hover.y });
    const frame = () => {
      raf = 0; const t = target();
      cur.x += (t.x - cur.x) * 0.14; cur.y += (t.y - cur.y) * 0.14;
      const done = Math.abs(t.x - cur.x) < 0.002 && Math.abs(t.y - cur.y) < 0.002;
      if (done) { cur.x = t.x; cur.y = t.y; }
      illo.rotate.x = cur.x; illo.rotate.y = cur.y; illo.updateRenderGraph();
      if (!done && visible) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };
    const onScroll = () => {
      const r = host.getBoundingClientRect(); const vh = innerHeight || 1;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));   /* 0 — блок входит снизу, 1 — ушёл вверх */
      scroll.y = (p - 0.5) * turn; kick();
    };
    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      hover.y = ((e.clientX - r.left) / r.width - 0.5) * 0.9; hover.x = ((e.clientY - r.top) / r.height - 0.5) * -0.5; kick();
    };
    const onLeave = () => { hover.x = 0; hover.y = 0; kick(); };
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (modes.includes('scroll')) { if (visible) { addEventListener('scroll', onScroll, { passive: true }); onScroll(); } else removeEventListener('scroll', onScroll); }
    });
    io.observe(host);
    if (modes.includes('hover') && fine.matches) { host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave); }
    live.set(host, { stop() {
      io.disconnect(); removeEventListener('scroll', onScroll); host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf); svg.remove(); if (still) still.style.display = ''; host.dataset.zdogState = 'static';
    } });
  } catch (e) {
    live.delete(host); host.dataset.zdogState = 'static';
    console.warn(`[zdog-live] ${host.dataset.zdogLive}: ${e.message} — остаётся статичный вид`);
  }
}

/** Найти блоки [data-zdog-live] и оживить те, что подходят к экрану. Повторный вызов безопасен. */
export function init(root = document) {
  if (reduced.matches) return;
  const io = new IntersectionObserver((entries) => { for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); start(en.target); } }, { rootMargin: '200px' });
  for (const host of root.querySelectorAll('[data-zdog-live]')) if (!live.has(host)) io.observe(host);
}

/* включили «меньше движения» при открытой странице — вернуть статичный вид; выключили — оживить снова */
reduced.addEventListener('change', () => {
  if (reduced.matches) { for (const [host, l] of live) { l.stop(); live.delete(host); } } else init();
});

if (!document.documentElement.hasAttribute('data-zdog-manual')) init();
