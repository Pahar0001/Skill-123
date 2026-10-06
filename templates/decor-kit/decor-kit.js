/* =====================================================================
   decor-kit.js — детали для красоты: движение и разметка по атрибутам.

   ES-модуль без зависимостей и без сборщика:
     <link rel="stylesheet" href="/assets/decor-kit/decor-kit.css">
     <script type="module" src="/assets/decor-kit/decor-kit.js"></script>
   Запускается сам: модуль исполняется после разбора страницы, стили к
   этому времени уже на месте. Ручной запуск — <html data-dk-manual> и
   init({ sprite, locale }). Инструкция — README.md, образец — demo.html.

   Сам ничего не делает: оживляет только то, что размечено атрибутами
   data-dk-* и классами dk-*. Блоки, которые страница дорисует позже
   (карточки из API), подхватываются сами — MutationObserver.

   Атрибуты:
     data-dk-lines                  заголовок строками из-под маски
     data-dk-draw="in|scroll"       рисунок .dk-draw рисуется линией: при входе в экран
                                    или вместе с прокруткой (data-dk-draw-from / -to — % экрана)
     data-dk-words                  цитата загорается по словам (data-dk-words-lead="2")
     data-dk-curtain="from-left|from-right|from-bottom|from-top"   фото шторкой с отъездом
     data-dk-count="12500"          табло цифр; число пишется через toLocaleString('ru-RU')
     data-dk-parallax="0.1"         сдвиг при прокрутке (бледное слово, рисунок; экран ≥ 900 px)
     data-dk-stamp="текст"          печать с текстом по кругу (data-dk-stamp-turn — вращать прокруткой)
     data-dk-scatter="id id …"      россыпь рисунков спрайта в .dk-layer (data-dk-scatter-count,
                                    -seed, -draw="off", -specks="0", -area="full", data-dk-sprite)
     data-dk-motif[="имя"]          мотив раздела: .dk-set → .dk-play при входе в экран, заново —
                                    наведением мыши на .dk-motif-host; имя — registerMotif(имя, build)
     data-dk-autoplay="5000"        автосмена с заливкой: слайды [data-dk-slide], полоски .dk-dots
   Экспорт: init, scan, play, registerMotif, logo, draw, autoplay, finish, config;
   для обычных (не модульных) скриптов то же — window.decorKit.

   Правила: без скрипта всё видно сразу и в конечном виде; прячется до
   появления только то, чего нет на экране в момент разметки; движение —
   только transform, opacity, clip-path и штрих линии; петель нет — мотивы
   играют при входе в экран и по наведению; то, что вне экрана, стоит
   (IntersectionObserver).

   «Меньше движения» (prefers-reduced-motion: reduce — в Windows это
   выключенные «Эффекты анимации», так настроено у многих): движение не
   пропадает, а идёт тише (решение владельца 06.10.2026).
     появления (строки, шторка)   сдвиг 24 px и проявление за 0,6 с вместо выезда и шторки (CSS)
     рисунок линией               рисуется, не дольше 0,8 с
     цитата по словам             как есть: только прозрачность
     параллакс, вращение печати   привязка к прокрутке вполовину
     табло цифр                   сразу готовое число (лента — крупный быстрый ход)
     автосмена                    вдвое медленнее, кнопка «Пауза» есть всегда
     мотив раздела                играет при входе; повтор наведением выключен; вид — CSS сайта
   Настройку переключили при открытой странице — скорость автосмены и
   привязка к прокрутке пересчитываются сами.
   ===================================================================== */

const d = document;
const root = d.documentElement;
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const calm = () => !!(mq && mq.matches);
const hasIO = typeof IntersectionObserver === 'function';
const warn = (...a) => { try { console.warn('[decor-kit]', ...a); } catch { /* консоли нет */ } };

/** Настройки: sprite — адрес спрайта без #id ('' — спрайт вписан в саму страницу), locale — для чисел. */
export const config = {
  sprite: root.getAttribute('data-dk-sprite') || '',
  locale: 'ru-RU',
  wideMin: 900, /* параллакс — только на экране не уже этого */
};

/* прятать до появления можно, только когда стили набора на месте (иначе спрятать нечем — и не надо) */
let canHide = false;

/* ---------- мелочи ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
/* длительность из переменной CSS: «1.6s», «900ms» → секунды */
const secs = (v, def) => {
  const m = /^\s*([\d.]+)\s*(ms|s)?\s*$/.exec(String(v || ''));
  return m ? (m[2] === 'ms' ? Number(m[1]) / 1000 : Number(m[1])) : def;
};
const later = (fn, ms) => setTimeout(() => { try { fn(); } catch (err) { warn(err); } }, ms);

/* повторяемый случайный ряд: одна и та же россыпь при каждом заходе */
export const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
export const rng = (seed) => {
  let t = (seed >>> 0) || 1;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

/* на экране прямо сейчас (display: none даёт нулевой размер — «не на экране») */
const inView = (el) => {
  const r = el.getBoundingClientRect();
  return r.width + r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
};
/* можно ли прятать до появления: стили есть, элемента нет на экране. При «меньше движения» — тоже можно:
     появление идёт тише (сдвиг 24 px, 0,6 с — decor-kit.css), а не выключено */
const mayArm = (el) => canHide && hasIO && !inView(el);
/* привязка к прокрутке при «меньше движения» — вполовину */
const soft = () => (calm() ? 0.5 : 1);
/* что пересчитать, когда настройку переключили при открытой странице */
const recalc = new Set();

/* что довести до конечного вида по просьбе страницы (finish) */
const finishers = new Set();
const once = (fn) => { let done = false; const f = () => { if (done) return; done = true; finishers.delete(f); fn(); }; finishers.add(f); return f; };
/** Довести всё до конечного вида сразу: снять прятанье, остановить автосмену и мотивы. */
export function finish() {
  for (const f of [...finishers]) { try { f(); } catch (err) { warn(err); } }
}

/* ---------- вход в экран ---------- */

const onEnter = new Map();
const enterIO = hasIO ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    enterIO.unobserve(e.target);
    const fn = onEnter.get(e.target);
    onEnter.delete(e.target);
    if (fn) { try { fn(); } catch (err) { warn(err); } }
  }
}, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 }) : null;
const whenIn = (el, fn) => {
  if (!enterIO) { fn(); return; }
  onEnter.set(el, fn);
  enterIO.observe(el);
  bindScroll(); /* у низа страницы — досрабатывание (frame) */
};

/* вне экрана — класс dk-off (мотивы: их анимации стоят) и пауза автосмены */
const offWatch = new Map();
const offIO = hasIO ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    const fn = offWatch.get(e.target);
    if (fn) { try { fn(!e.isIntersecting); } catch (err) { warn(err); } }
  }
}) : null;
const watchOff = (el, fn) => { if (!offIO) return; offWatch.set(el, fn); offIO.observe(el); };

/* ---------- прокрутка: один слушатель, считаются только блоки у экрана ---------- */

const scrubs = new Map();
const active = new Set();
let raf = 0;
/* Сколько ещё можно пролистать вниз: блок у самого низа страницы не поднимется до конечной
   точки — тогда прогресс считается до конца страницы и доходит до 1 ровно у её низа. */
const leftToScroll = (vh) => Math.max(0, root.scrollHeight - vh - scrollY);
/* прогресс: верх блока от from (px от верха экрана) до to; to — не дальше, чем блок доедет */
const progress = (top, from, to, rest) => {
  const end = Math.max(to, top - rest);
  return end >= from ? 1 : clamp01((from - top) / (from - end));
};
const frame = () => {
  raf = 0;
  const vh = innerHeight;
  const rest = leftToScroll(vh);
  for (const el of active) {
    const fn = scrubs.get(el);
    if (fn) { try { fn(el.getBoundingClientRect(), vh, rest); } catch (err) { warn(err); } }
  }
  /* низ страницы: что ждёт входа в экран, но выше нижних 10 % экрана уже не поднимется, — запустить */
  if (rest < 4 && onEnter.size) {
    for (const [el, fn] of [...onEnter]) {
      const r = el.getBoundingClientRect();
      if (r.width + r.height > 0 && r.bottom > 0 && r.top < vh) {
        enterIO.unobserve(el);
        onEnter.delete(el);
        try { fn(); } catch (err) { warn(err); }
      }
    }
  }
};
const tick = () => { if (!raf) raf = requestAnimationFrame(frame); };
let scrollBound = false;
function bindScroll() {
  if (scrollBound) return;
  scrollBound = true;
  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', tick);
}
const scrubIO = hasIO ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) active.add(e.target);
    else {
      active.delete(e.target);
      /* проскочили блок прыжком — досчитать до края (0 или 1) */
      const fn = scrubs.get(e.target);
      if (fn) { try { fn(e.boundingClientRect, innerHeight, leftToScroll(innerHeight)); } catch (err) { warn(err); } }
    }
  }
  tick();
}, { rootMargin: '15% 0px 15% 0px' }) : null;
function scrub(el, fn) {
  if (!scrubIO) return;
  scrubs.set(el, fn);
  scrubIO.observe(el);
  try { fn(el.getBoundingClientRect(), innerHeight, leftToScroll(innerHeight)); } catch (err) { warn(err); } /* сразу, без кадра «пусто» */
  bindScroll();
}
function unscrub(el) {
  scrubs.delete(el);
  active.delete(el);
  if (scrubIO) scrubIO.unobserve(el);
}

/* ---------- толщина линии рисунков ---------- */

/* Поле рисунка: data-dk-box, свой viewBox, viewBox символа спрайта в этой странице, иначе --dk-box (64). */
const boxCache = new WeakMap();
function boxOf(svg) {
  if (boxCache.has(svg)) return boxCache.get(svg);
  let box = null;
  const own = Number(svg.getAttribute('data-dk-box'));
  if (own > 0) box = [own, own];
  const vb = !box && svg.viewBox && svg.viewBox.baseVal;
  if (vb && vb.width) box = [vb.width, vb.height];
  if (!box) {
    const u = svg.querySelector('use');
    const href = u ? (u.getAttribute('href') || u.getAttribute('xlink:href') || '') : '';
    const sym = href.startsWith('#') ? d.getElementById(href.slice(1)) : null;
    const b = sym && sym.viewBox && sym.viewBox.baseVal;
    if (b && b.width) box = [b.width, b.height];
  }
  if (!box) { const v = parseFloat(cssVar(svg, '--dk-box')) || 64; box = [v, v]; }
  boxCache.set(svg, box);
  return box;
}
/* Штрих = --dk-line на экране: в поле рисунка это линия, делённая на масштаб. */
function setStroke(svg, w, h) {
  if (!w || !h) return;
  const [bw, bh] = boxOf(svg);
  const scale = Math.min(w / bw, h / bh);
  if (!(scale > 0)) return;
  const line = parseFloat(cssVar(svg, '--dk-line')) || 1.5;
  svg.style.strokeWidth = `${(line / scale).toFixed(3)}px`;
}
const ro = typeof ResizeObserver === 'function'
  ? new ResizeObserver((entries) => {
    for (const e of entries) {
      const b = e.contentBoxSize && e.contentBoxSize[0];
      setStroke(e.target, b ? b.inlineSize : e.contentRect.width, b ? b.blockSize : e.contentRect.height);
    }
  })
  : null;
function autoStroke(svg) {
  if (ro) ro.observe(svg);
  else { const r = svg.getBoundingClientRect(); setStroke(svg, r.width, r.height); }
}

/* Подсказка разработчику: прорисовке нужен pathLength="1" у каждого контура, а vector-effect
   вместе с ним рвёт штрих на куски (Chrome 154, Firefox 157 — проверено 30.09.2026).
   Проверяются встроенные рисунки и спрайт в этой же странице; чужой файл не прочесть. */
const checked = new WeakSet();
function checkPaths(svg) {
  let src = svg;
  let name = svg.id ? `#${svg.id}` : 'встроенный';
  const u = svg.querySelector('use');
  if (u) {
    const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
    if (!href.startsWith('#')) return;
    src = d.getElementById(href.slice(1));
    name = href;
    if (!src) { warn(`рисунок ${href}: такого id на странице нет — спрайт не вписан или опечатка`); return; }
  }
  if (checked.has(src)) return;
  checked.add(src);
  const shapes = [...src.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect')];
  const noLen = shapes.filter((p) => p.getAttribute('pathLength') !== '1').length;
  const nss = shapes.filter((p) => getComputedStyle(p).getPropertyValue('vector-effect').trim() === 'non-scaling-stroke').length;
  if (noLen) warn(`рисунок ${name}: у ${noLen} из ${shapes.length} контуров нет pathLength="1" — прорисовка даст пунктир`);
  if (nss) warn(`рисунок ${name}: vector-effect="non-scaling-stroke" у ${nss} контуров — вместе с pathLength рвёт прорисовку; убрать, толщину держит набор`);
}

/* ---------- слова: обёртки и снятие обёрток ---------- */

/* Слова — по обычным пробелам (неразрывный держит слова вместе, как в тексте); после дефиса —
   отдельный кусок: перенос «кофе-/бар» остаётся там же, где был. */
const SPACE = /([ \t\n\r\f]+)/;
function wrapWords(el, cls, inner) {
  const out = [];
  const walker = d.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest('.dk-sr, script, style, svg')
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const node of nodes) {
    const frag = d.createDocumentFragment();
    for (const part of node.nodeValue.split(SPACE)) {
      if (!part) continue;
      if (SPACE.test(part)) { frag.append(part); continue; }
      for (const piece of part.split(/(?<=[-‐])(?=[^\s‐-])/)) {
        const w = d.createElement('span');
        w.className = cls;
        if (inner) {
          const i = d.createElement('span');
          i.className = `${cls}__i`;
          i.textContent = piece;
          w.append(i);
          out.push(i);
        } else {
          w.textContent = piece;
          out.push(w);
        }
        frag.append(w);
      }
    }
    node.replaceWith(frag);
  }
  return out;
}
function unwrap(el, cls) {
  el.querySelectorAll(`.${cls}`).forEach((w) => {
    const src = w.firstElementChild && w.firstElementChild.classList.contains(`${cls}__i`) ? w.firstElementChild : w;
    w.replaceWith(...src.childNodes);
  });
  el.normalize();
}

/* ---------- приёмы ---------- */

/* Заголовок строками из-под маски (банк идей: mask-text-reveal). Слова обёрнуты сразу,
   строки считаются при входе в экран (шрифты уже на месте), обёртки снимаются, когда всё
   проехало: дальше заголовок — обычный текст. */
function lines(el) {
  if (!mayArm(el)) return;
  const words = wrapWords(el, 'dk-w', true);
  if (!words.length) return;
  el.classList.add('dk-armed');
  const done = once(() => { unwrap(el, 'dk-w'); el.classList.remove('dk-armed', 'dk-on'); });
  whenIn(el, () => {
    if (!el.querySelector('.dk-w')) { done(); return; } /* текст заменили — без анимации */
    let line = -1;
    let top = -Infinity;
    for (const i of words) {
      const w = i.parentNode;
      if (!w || !w.isConnected) continue;
      const t = w.getBoundingClientRect().top;
      if (t > top + 4) { line += 1; top = t; }
      w.style.setProperty('--l', String(line));
    }
    el.classList.add('dk-on');
    const cs = getComputedStyle(el);
    const ms = (secs(cs.getPropertyValue('--dk-lines-dur'), 0.8) + secs(cs.getPropertyValue('--dk-lines-step'), 0.07) * Math.max(0, line)) * 1000;
    later(done, ms + 150);
  });
}

/* Цитата загорается по словам (банк идей: scroll-word-light): первые слова яркие сразу,
   остальные — в такт прокрутке; зажжённое не гаснет, в конце обёртки снимаются. */
function wordsLight(el) {
  if (!mayArm(el)) return;
  const spans = wrapWords(el, 'dk-lw', false);
  if (!spans.length) return;
  const lead = Math.max(0, Number(el.dataset.dkWordsLead ?? 2) || 0);
  spans.forEach((s, i) => { if (i < lead) s.classList.add('dk-lit'); });
  el.classList.add('dk-armed');
  let lit = lead;
  const done = once(() => { unscrub(el); unwrap(el, 'dk-lw'); el.classList.remove('dk-armed'); });
  scrub(el, (r, vh, rest) => {
    /* начало — верх абзаца на 90 % экрана, конец — низ абзаца на 45 % (или низ страницы) */
    const p = progress(r.top, vh * 0.9, vh * 0.45 - r.height, rest);
    const n = Math.ceil(p * spans.length);
    for (; lit < n; lit++) spans[lit].classList.add('dk-lit');
    if (lit >= spans.length) { unscrub(el); later(done, 400); }
  });
  tick();
}

/* Рисунок линией (банк идей: line-draw-scroll): «in» — один раз при входе в экран,
   «scroll» — вместе с прокруткой (верх рисунка на 95 % экрана → на 35 %; у низа страницы
   доходит до конца). Скрытое состояние — «1 1.01» и сдвиг 1.005: без точки от круглого конца. */
const HIDDEN = 1.005;
function drawLine(el) {
  if (!canHide || !hasIO) return;
  const mode = el.dataset.dkDraw === 'scroll' ? 'scroll' : 'in';
  checkPaths(el);
  if (mode === 'in') {
    if (inView(el)) return;
    el.classList.add('dk-armed');
    const done = once(() => el.classList.remove('dk-armed', 'dk-on'));
    whenIn(el, () => {
      el.classList.add('dk-on');
      const cs = getComputedStyle(el);
      later(done, (secs(cs.getPropertyValue('--dk-draw-dur'), 1.6) + secs(cs.getPropertyValue('--dk-delay'), 0)) * 1000 + 100);
    });
    return;
  }
  const from = (Number(el.dataset.dkDrawFrom) || 95) / 100;
  const to = (Number(el.dataset.dkDrawTo) || 35) / 100;
  el.classList.add('dk-armed');
  once(() => { unscrub(el); el.classList.remove('dk-armed'); el.style.strokeDashoffset = ''; });
  scrub(el, (r, vh, rest) => {
    el.style.strokeDashoffset = (HIDDEN * (1 - progress(r.top, vh * from, vh * to, rest))).toFixed(4);
  });
  tick();
}

/* Фото шторкой с отъездом (банк идей: photo-curtain-zoom) — только ниже первого экрана:
   главное фото экрана не ждёт анимации (LCP). */
function curtain(el) {
  if (!mayArm(el)) return;
  el.classList.add('dk-armed');
  const done = once(() => el.classList.remove('dk-armed', 'dk-on'));
  whenIn(el, () => {
    el.classList.add('dk-on');
    later(done, secs(cssVar(el, '--dk-curtain-dur'), 1.1) * 1500 + 150);
  });
}

/* Табло цифр (банк идей: scoreboard-counter). Число — data-dk-count (или текст элемента),
   пишется через toLocaleString (12500 → «12 500», 4.5 → «4,5»). У каждой цифры лента 0…9
   дважды: проезжает круг и встаёт; разряды — справа налево по очереди. Для чтения с экрана —
   число целиком; когда лента встала, снова обычный текст (выделяется и копируется). */
function counter(el) {
  const raw = (el.getAttribute('data-dk-count') || '').trim();
  /* сжимаются только обычные пробелы: неразрывный в «12 500» остаётся неразрывным */
  let text = el.textContent.replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, '');
  if (raw) {
    const num = Number(raw.replace(',', '.').replace(/\s/g, ''));
    if (Number.isFinite(num)) {
      const frac = Math.min(3, (raw.split(/[.,]/)[1] || '').length);
      text = num.toLocaleString(config.locale, { minimumFractionDigits: frac, maximumFractionDigits: frac });
    } else warn(`табло: «${raw}» — не число`);
  }
  const total = (text.match(/\d/g) || []).length;
  if (!total) return;
  if (el.textContent !== text) el.textContent = text;
  /* «меньше движения»: лента проезжает десяток цифр за секунду — крупный быстрый ход; число сразу готовое */
  if (calm() || !mayArm(el)) return;
  let k = 0;
  const strip = Array.from({ length: 20 }, (_, i) => `<span>${i % 10}</span>`).join('');
  const cols = [...text].map((ch) => {
    if (!/\d/.test(ch)) return `<span>${esc(ch)}</span>`;
    const pos = total - 1 - k;
    k += 1;
    return `<span class="dk-digit"><span class="dk-digit__strip" style="--to:${10 + Number(ch)};--k:${pos}">${strip}</span></span>`;
  }).join('');
  el.innerHTML = `<span class="dk-sr">${esc(text)}</span><span class="dk-count dk-armed" aria-hidden="true">${cols}</span>`;
  const box = el.querySelector('.dk-count');
  const done = once(() => { el.textContent = text; });
  whenIn(el, () => {
    box.classList.add('dk-on');
    const cs = getComputedStyle(el);
    later(done, (secs(cs.getPropertyValue('--dk-count-dur'), 1.4) + secs(cs.getPropertyValue('--dk-count-step'), 0.09) * total) * 1000 + 200);
  });
}

/* Сдвиг при прокрутке: доля расстояния до середины экрана. Только на широком экране; при
   «меньше движения» — вполовину (soft). Меряется родитель — свой сдвиг не мешает замеру.
   Свойство translate — поворот (--dk-rot) им не затирается. */
function parallax(el) {
  if (!hasIO || innerWidth < config.wideMin) return;
  const k = Number(el.dataset.dkParallax) || 0.1;
  const ref = el.parentElement || el;
  once(() => { unscrub(el); el.style.translate = ''; });
  scrub(el, (r, vh) => {
    const pr = ref.getBoundingClientRect();
    const c = pr.top + pr.height / 2 - vh / 2;
    el.style.translate = `0 ${(-c * k * soft()).toFixed(1)}px`;
  });
  recalc.add(tick);
  tick();
}

/* Печать с текстом по кругу. Кольцо — SVG с textPath: пишет скрипт из data-dk-stamp или оно уже
   в разметке (.dk-stamp__ring — тогда видно и без JS). Кегль на экране не меньше 12 px,
   разрядка растягивает текст ровно по кругу (letter-spacing — textLength на textPath Firefox
   не понимает). data-dk-stamp-turn — вращение прокруткой, без петли; при «меньше движения» — вполовину. */
let uid = 0;
function stamp(el) {
  el.classList.add('dk-stamp');
  let svg = el.querySelector(':scope > .dk-stamp__ring');
  if (!svg) {
    const text = String(el.dataset.dkStamp || '').trim();
    if (!text) return;
    const id = `dk-ring-${(uid += 1)}`;
    el.insertAdjacentHTML('afterbegin', `<svg class="dk-stamp__ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path id="${id}" d="M50 12a38 38 0 1 1 0 76a38 38 0 1 1 0-76"/><text font-size="8"><textPath href="#${id}">${esc(text)}</textPath></text></svg>`);
    svg = el.firstElementChild;
  }
  const path = svg.querySelector('path');
  const tx = svg.querySelector('text');
  const tp = svg.querySelector('textPath');
  if (!path || !tx || !tp) return;
  const chars = [...tp.textContent].length;
  let warned = false;
  const fit = () => {
    const size = el.offsetWidth;
    if (!size) return false; /* печать ещё скрыта — подгоним, когда покажется */
    const minPx = Number(cssVar(el, '--dk-stamp-min')) || 12;
    const fs = Math.max(8, (minPx * 100) / size);
    const r = 50 - fs * 0.74 - 1.5;
    path.setAttribute('d', `M50 ${(50 - r).toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 0 ${(2 * r).toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 0 ${(-2 * r).toFixed(2)}`);
    tx.setAttribute('font-size', fs.toFixed(2));
    tx.setAttribute('letter-spacing', '0');
    const natural = tx.getComputedTextLength();
    if (!natural) return false;
    const spare = 2 * Math.PI * r - natural;
    if (spare < 0 && !warned) { warned = true; warn(`печать «${tp.textContent}» не помещается в круг ${size}px при кегле ${minPx}px — короче текст или крупнее печать (--dk-stamp-size)`); }
    tx.setAttribute('letter-spacing', (Math.max(0, spare) / chars).toFixed(3));
    return true;
  };
  if (!fit()) whenIn(el, fit);
  if (d.fonts && d.fonts.status !== 'loaded') d.fonts.ready.then(fit);
  if (typeof ResizeObserver === 'function') { let w = el.offsetWidth; new ResizeObserver(() => { if (el.offsetWidth !== w) { w = el.offsetWidth; fit(); } }).observe(el); }
  if (!el.hasAttribute('data-dk-stamp-turn') || !hasIO) return;
  once(() => { unscrub(el); svg.style.transform = ''; });
  scrub(el, (r) => { svg.style.transform = `rotate(${(-r.top * 0.12 * soft()).toFixed(1)}deg)`; });
  recalc.add(tick);
  tick();
}

/* Россыпь рисунков (data-dk-scatter на .dk-layer): у левого и правого краёв (-area="full" —
   по всему полю), бледные, повёрнутые, с крапинками; на телефоне вдвое меньше и мельче.
   Ниже первого экрана рисуются линией при входе (data-dk-scatter-draw="off" — нет). */
function scatter(el) {
  const ids = String(el.dataset.dkScatter || '').split(/[\s,]+/).filter(Boolean);
  if (!ids.length) return;
  const narrow = innerWidth < 720;
  const count = Math.max(1, Math.round((Number(el.dataset.dkScatterCount) || 7) * (narrow ? 0.5 : 1)));
  const R = rng(Number(el.dataset.dkScatterSeed) || hash(ids.join(',') + count));
  const pool = ids.map((n) => [R(), n]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const size = narrow ? 0.7 : 1;
  const full = el.dataset.dkScatterArea === 'full';
  const sprite = el.getAttribute('data-dk-sprite') ?? config.sprite;
  let html = '';
  for (let i = 0; i < count; i++) {
    const left = (i + (R() < 0.5 ? 0 : 1)) % 2 === 0;
    const x = full ? 6 + R() * 88 : left ? 4 + R() * 15 : 81 + R() * 15;
    const y = ((i + 0.5) / count) * 88 + 6 + (R() - 0.5) * (40 / count);
    const s = Math.round(size * (54 + R() * 60));
    const rot = Math.round((R() - 0.5) * 44);
    const o = (0.75 + R() * 0.45).toFixed(2);
    html += `<svg class="dk-draw dk-scatter__i" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--dk-s:${s};--r:${rot}deg;--o:${o};--dk-delay:${(i * 0.12).toFixed(2)}s" aria-hidden="true" focusable="false"><use href="${esc(sprite)}#${esc(pool[i % pool.length])}"/></svg>`;
  }
  if (el.dataset.dkScatterSpecks !== '0') {
    const specks = Math.round(count * 0.9);
    for (let i = 0; i < specks; i++) {
      const left = R() < 0.5;
      const x = full ? 3 + R() * 94 : left ? 2 + R() * 22 : 76 + R() * 22;
      html += `<i class="dk-speck" style="--x:${x.toFixed(1)}%;--y:${(4 + R() * 92).toFixed(1)}%;--s:${(3 + R() * 4).toFixed(1)}px;--o:${(0.7 + R() * 0.5).toFixed(2)}"></i>`;
    }
  }
  el.setAttribute('aria-hidden', 'true');
  el.insertAdjacentHTML('beforeend', html);
  avoidText(el, R, full);
  const items = [...el.querySelectorAll(':scope > .dk-scatter__i')];
  items.forEach((svg) => { DONE.stroke.add(svg); DONE.draw.add(svg); autoStroke(svg); });
  if (el.dataset.dkScatterDraw === 'off' || !mayArm(el)) return;
  const seen = new Set();
  items.forEach((svg) => { const id = svg.firstElementChild.getAttribute('href'); if (!seen.has(id)) { seen.add(id); checkPaths(svg); } });
  items.forEach((svg) => svg.classList.add('dk-armed'));
  const done = once(() => items.forEach((svg) => svg.classList.remove('dk-armed', 'dk-on')));
  whenIn(el, () => {
    items.forEach((svg) => svg.classList.add('dk-on'));
    later(done, (secs(cssVar(el, '--dk-draw-dur'), 1.6) + items.length * 0.12) * 1000 + 200);
  });
}

/* Россыпь не лежит на тексте (README): рисунок или крапинка на строке текста раздела — ещё до 6 мест в своей полосе,
   не нашлось — скрыть. После загрузки шрифтов и при смене ширины — заново: легло на текст — скрыть, освободилось —
   показать (без переезда, чтобы россыпь не прыгала). Декоративный текст (слои .dk-layer, aria-hidden) — не текст. */
function textRects(host) {
  const out = [];
  const tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const p = n.parentElement;
    if (!p || p.closest('.dk-layer, script, style, svg, .dk-sr, [aria-hidden="true"]')) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) out.push(r);
  }
  return out;
}
function avoidText(el, R, full) {
  const host = el.closest('.dk-host') || el.parentElement;
  if (!host) return;
  /* видимая часть узла — внутри слоя (у слоя overflow: hidden) */
  const onText = (node, lines, box) => {
    const r = node.getBoundingClientRect();
    const a = { l: Math.max(r.left, box.left), t: Math.max(r.top, box.top), r: Math.min(r.right, box.right), b: Math.min(r.bottom, box.bottom) };
    if (a.r <= a.l || a.b <= a.t) return false;
    return lines.some((L) => L.left < a.r && L.right > a.l && L.top < a.b && L.bottom > a.t);
  };
  const place = (move) => {
    const lines = textRects(host); const box = el.getBoundingClientRect();
    for (const node of el.querySelectorAll(':scope > .dk-scatter__i, :scope > .dk-speck')) {
      node.style.visibility = '';
      if (!onText(node, lines, box)) continue;
      let ok = false;
      const speck = node.classList.contains('dk-speck');
      for (let k = 0; move && k < 6 && !ok; k++) {
        const left = R() < 0.5;
        const x = full ? 4 + R() * 90 : speck ? (left ? 2 + R() * 22 : 76 + R() * 22) : (left ? 4 + R() * 15 : 81 + R() * 15);
        node.style.setProperty('--x', `${x.toFixed(1)}%`);
        node.style.setProperty('--y', `${(4 + R() * 90).toFixed(1)}%`);
        ok = !onText(node, lines, box);
      }
      if (!ok) node.style.visibility = 'hidden';
    }
  };
  place(true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place(false));
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => place(false), 200); }, { passive: true });
}

/* ---------- мотив раздела ---------- */

/* У каждого раздела своё движение из мира дела: вид — CSS сайта на классах .dk-set (начало,
   без перехода) и .dk-play (к обычному виду, с переходом); обычный вид — он же конечный и
   он же без JS. Содержимое пишется разметкой или строится функцией registerMotif(имя, build).
   Играет один раз при входе в экран; заново — наведением мыши на .dk-motif-host (не чаще
   раза в 1.5 с). Мотив, который уже на экране при загрузке, не прячется и сам не играет.
   «Меньше движения»: при входе в экран играет (тише его делает CSS сайта — сдвиги до 24 px,
   до 0,6 с, без петель: README, «Мотив раздела»); повтор наведением выключен. */
const MOTIFS = new Map();
const waiting = new Map();
const lastPlay = new WeakMap();
/** Зарегистрировать мотив: build(el, { rng, hash }) вписывает содержимое в el (конечный вид). */
export function registerMotif(name, build) {
  const key = String(name);
  MOTIFS.set(key, build);
  const list = waiting.get(key);
  waiting.delete(key);
  if (list) list.forEach((el) => { try { motif(el); } catch (err) { warn(err); } });
}
/** Сыграть мотив (из своего кода). */
export function play(el) {
  if (!el) return;
  el.classList.remove('dk-play');
  el.classList.add('dk-set');
  void el.getBoundingClientRect(); /* начало и движение — в разных кадрах стиля: переход пойдёт заново */
  el.classList.remove('dk-set');
  el.classList.add('dk-play');
  lastPlay.set(el, performance.now());
}
function motif(el) {
  const name = el.getAttribute('data-dk-motif') || '';
  if (name && !MOTIFS.has(name)) {
    if (!waiting.has(name)) waiting.set(name, []);
    waiting.get(name).push(el);
    return;
  }
  el.classList.add('dk-motif');
  el.setAttribute('aria-hidden', 'true');
  if (name) { try { MOTIFS.get(name)(el, { rng, hash }); } catch (err) { warn(`мотив «${name}»:`, err); } }
  el.querySelectorAll('svg.dk-draw').forEach((svg) => { if (!DONE.stroke.has(svg)) { DONE.stroke.add(svg); autoStroke(svg); } });
  watchOff(el, (off) => el.classList.toggle('dk-off', off));
  if (!canHide || !hasIO) return;
  once(() => el.classList.remove('dk-set', 'dk-play'));
  if (!inView(el)) {
    el.classList.add('dk-set');
    whenIn(el, () => requestAnimationFrame(() => play(el)));
  }
  const host = el.closest('.dk-motif-host') || el;
  host.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch' || calm()) return;
    if (performance.now() - (lastPlay.get(el) || -1e9) > 1500) play(el);
  });
}

/* ---------- автосмена с заливкой ---------- */

/* Банк идей: autoplay-progress-dot. Полоска активного слайда заливается за срок показа, и
   конец заливки (animationend) переключает слайд: пауза заливки — пауза смены, они не
   расходятся. Пауза — наведение мыши, фокус внутри, блок вне экрана, скрытая вкладка, кнопка
   «Пауза»; выбор слайда человеком — автосмена стоит (кнопка «Дальше» запускает её снова).
   «Меньше движения»: автосмена идёт вдвое медленнее, а кнопка «Пауза» есть всегда — и при
   data-dk-autoplay-toggle="off" (движение дольше 5 с обязано останавливаться: WCAG 2.2.2).
   Слайды [data-dk-slide] переключает сам набор (без JS видны все);
   свой слайдер сайта слушает событие dk:autoplay (detail: index, prev, cause). */
const players = new WeakMap();
export const autoplay = {
  /** показать слайд i (автосмена остаётся как была) */
  go(box, i) { const p = players.get(box); if (p) p.show(i, 'api'); },
  /** пауза (true) или продолжение (false) по просьбе страницы */
  pause(box, on = true) { const p = players.get(box); if (p) p.user(on); },
  /** остановить автосмену совсем */
  stop(box) { const p = players.get(box); if (p) p.stop(); },
};
function autoplayInit(box) {
  const dur = Math.max(1500, Number(box.dataset.dkAutoplay) || 5000);
  const slides = [...box.querySelectorAll('[data-dk-slide]')];
  let dots = box.querySelector('.dk-dots');
  let items = dots ? [...dots.querySelectorAll('.dk-dots__i')] : [];
  const n = slides.length || items.length;
  if (n < 2) return;
  if (!dots) { dots = d.createElement('div'); dots.className = 'dk-dots'; box.append(dots); }
  if (!items.length) {
    const name = (i) => (slides[i] && slides[i].getAttribute('data-dk-slide')) || `${i + 1} из ${n}`;
    dots.insertAdjacentHTML('afterbegin', Array.from({ length: n }, (_, i) => `<button type="button" class="dk-dots__i" aria-label="Показать: ${esc(name(i))}"></button>`).join(''));
    items = [...dots.querySelectorAll('.dk-dots__i')];
  }
  let toggle = dots.querySelector('.dk-dots__toggle');
  /* кнопка паузы: по умолчанию есть; выключена атрибутом — всё равно появляется при «меньше движения» */
  const ensureToggle = () => {
    if (toggle || (box.dataset.dkAutoplayToggle === 'off' && !calm())) return false;
    toggle = d.createElement('button');
    toggle.type = 'button';
    toggle.className = 'dk-dots__toggle';
    dots.append(toggle);
    return true;
  };
  ensureToggle();
  /* срок показа: при «меньше движения» — вдвое дольше */
  const fitDur = () => dots.style.setProperty('--dk-dur', `${Math.round(dur / soft())}ms`);
  fitDur();
  const live = slides[0] && slides[0].parentElement;
  let k = Math.max(0, slides.findIndex((s) => s.classList.contains('is-active')), items.findIndex((b) => b.classList.contains('is-active')));
  const why = new Set(); /* причины паузы: hover, focus, off, hidden, user */
  let stopped = false;
  const sync = () => {
    dots.classList.toggle('is-paused', why.size > 0);
    dots.classList.toggle('is-stopped', stopped);
    const still = stopped || why.has('user');
    if (toggle) {
      toggle.textContent = still ? 'Дальше' : 'Пауза';
      toggle.setAttribute('aria-label', still ? 'Запустить автосмену' : 'Остановить автосмену');
    }
    if (live) live.setAttribute('aria-live', still ? 'polite' : 'off');
  };
  const restart = (b) => { b.classList.remove('is-active'); void b.offsetWidth; b.classList.add('is-active'); };
  const show = (i, cause) => {
    const prev = k;
    k = ((i % n) + n) % n;
    slides.forEach((s, j) => s.classList.toggle('is-active', j === k));
    items.forEach((b, j) => {
      b.classList.toggle('is-active', j === k);
      if (j === k) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    restart(items[k]);
    box.dispatchEvent(new CustomEvent('dk:autoplay', { bubbles: true, detail: { index: k, prev, cause } }));
  };
  const stop = () => { stopped = true; sync(); };
  const user = (on) => {
    if (on) why.add('user'); else why.delete('user');
    if (!on && stopped) { stopped = false; restart(items[k]); }
    sync();
  };
  players.set(box, { show, stop, user });
  dots.addEventListener('animationend', (e) => {
    if (e.animationName !== 'dk-fill' || !e.target.classList.contains('is-active') || stopped) return;
    show(k + 1, 'auto');
  });
  items.forEach((b, j) => b.addEventListener('click', () => { stop(); show(j, 'click'); }));
  const bindToggle = () => {
    if (!toggle || toggle.dkBound) return;
    toggle.dkBound = true;
    toggle.addEventListener('click', () => {
      const start = stopped || why.has('user');
      /* явный запуск главнее мыши над блоком и фокуса на самой кнопке — иначе «Дальше» ничего не делает */
      if (start) { why.delete('hover'); why.delete('focus'); }
      user(!start);
    });
  };
  bindToggle();
  /* настройку переключили при открытой странице: срок показа и кнопка паузы — по новому режиму */
  recalc.add(() => { fitDur(); if (ensureToggle()) { bindToggle(); sync(); } });
  const pause = (reason, on) => { if (on) why.add(reason); else why.delete(reason); sync(); };
  box.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') pause('hover', true); });
  box.addEventListener('pointerleave', () => pause('hover', false));
  box.addEventListener('focusin', () => pause('focus', true));
  box.addEventListener('focusout', (e) => { if (!box.contains(e.relatedTarget)) pause('focus', false); });
  d.addEventListener('visibilitychange', () => pause('hidden', d.hidden));
  watchOff(box, (off) => pause('off', off));
  once(stop);
  show(k, 'init');
  box.classList.add('dk-ready');
  sync();
}

/* ---------- разметка для страниц ---------- */

const href = (id, sprite = config.sprite) => `${esc(sprite)}#${esc(id)}`;

/** Рисунок линией: draw('loaf', { size: 96, mode: 'in' }) → строка <svg class="dk-draw">. */
export function draw(id, { size = 0, mode = '', cls = '', sprite } = {}) {
  const style = size ? ` style="--dk-s:${Number(size)}"` : '';
  const dm = mode ? ` data-dk-draw="${esc(mode)}"` : '';
  return `<svg class="dk-draw${cls ? ` ${esc(cls)}` : ''}"${style}${dm} aria-hidden="true" focusable="false"><use href="${href(id, sprite)}"/></svg>`;
}

/** Надпись-логотип: logo('Выпечка', { sign: 'sign-pastry', row: true, cls: 't-pastry' }). */
export function logo(name, { sign = '', row = false, cls = '', sprite } = {}) {
  const mark = sign ? `<svg class="dk-logo__sign" aria-hidden="true" focusable="false"><use href="${href(sign, sprite)}"/></svg>` : '';
  return `<span class="dk-logo${row ? ' dk-logo--row' : ''}${cls ? ` ${esc(cls)}` : ''}">${mark}<span class="dk-logo__name">${esc(name)}</span></span>`;
}

/* ---------- разметка → приёмы ---------- */

const DONE = {
  stroke: new WeakSet(), lines: new WeakSet(), words: new WeakSet(), draw: new WeakSet(),
  curtain: new WeakSet(), count: new WeakSet(), parallax: new WeakSet(), stamp: new WeakSet(),
  scatter: new WeakSet(), motif: new WeakSet(), autoplay: new WeakSet(),
};
const PARTS = [
  ['svg.dk-draw', 'stroke', autoStroke],
  ['[data-dk-lines]', 'lines', lines],
  ['[data-dk-words]', 'words', wordsLight],
  ['[data-dk-draw]', 'draw', drawLine],
  ['[data-dk-curtain]', 'curtain', curtain],
  ['[data-dk-count]', 'count', counter],
  ['[data-dk-parallax]', 'parallax', parallax],
  ['[data-dk-stamp], .dk-stamp', 'stamp', stamp],
  ['[data-dk-scatter]', 'scatter', scatter],
  ['[data-dk-motif]', 'motif', motif],
  ['[data-dk-autoplay]', 'autoplay', autoplayInit],
];

/** Разобрать разметку внутри root (по умолчанию — вся страница); повторный вызов безопасен. */
export function scan(el = d) {
  if (!el || !el.querySelectorAll) return;
  for (const [sel, key, fn] of PARTS) {
    const list = [...el.querySelectorAll(sel)];
    if (el.nodeType === 1 && el.matches(sel)) list.unshift(el);
    for (const x of list) {
      if (DONE[key].has(x)) continue;
      DONE[key].add(x);
      try { fn(x); } catch (err) { warn(err); }
    }
  }
}

/* стили набора на месте: метка --dk-kit на :root (ссылка в <head> к запуску модуля уже
   загружена; подгружаемую ждём до 3 с, потом работаем без прятанья) */
const cssReady = () => cssVar(root, '--dk-kit') !== '';
function waitCss(timeout = 3000) {
  if (cssReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const check = () => {
      if (cssReady()) resolve(true);
      else if (performance.now() - t0 > timeout) resolve(false);
      else setTimeout(check, 50);
    };
    check();
  });
}

let started = false;
/** Запуск: init({ sprite: '/img/decor.svg', locale: 'ru-RU' }). Второй вызов ничего не делает. */
export async function init(opts = {}) {
  if (started) return;
  started = true;
  Object.assign(config, opts);
  root.classList.add('dk-js');
  canHide = await waitCss();
  if (!canHide) warn('нет стилей decor-kit.css (метки --dk-kit на :root): до появления ничего не прячется');
  scan(d);
  if (typeof MutationObserver === 'function' && d.body) {
    new MutationObserver((list) => {
      for (const m of list) for (const node of m.addedNodes) if (node.nodeType === 1 && node.isConnected) scan(node);
    }).observe(d.body, { childList: true, subtree: true });
  }
  if (mq) {
    /* «меньше движения» включили или выключили при открытой странице: спрятанное остаётся ждать своего
       появления (оно пойдёт уже по правилам нового режима — их держит CSS), пересчитываются привязка к
       прокрутке и срок автосмены. До 06.10.2026 здесь всё доводилось до конца (finish) — сайт замирал. */
    const on = () => { for (const f of [...recalc]) { try { f(); } catch (err) { warn(err); } } };
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
  }
}

if (typeof window !== 'undefined') {
  window.decorKit = { init, scan, play, registerMotif, logo, draw, autoplay, finish, config, rng, hash };
}
if (!root.hasAttribute('data-dk-manual')) init();
