# Движение: распознать у донора, перенести целиком, добавить своё

Движение — такая же часть языка донора, как палитра и шрифт. Пользователь замечает пропуск
сразу («вот тут ты не добавил анимацию»). Порядок работы:

1. **Снять** всё движение донора: `motion.mjs <донор>` (desktop; для важных блоков и mobile).
2. **Перенести по максимуму**: каждая строка таблицы донора → наш блок с теми же числами, или
   решение «почему нет» в `motion-decisions.json`. Числа — из протокола, не на глаз.
3. **Добавить своё**: 1–2 движения из самого товара (у VN3D — фигурка печатается слоями в такт
   печатающемуся слову) и 1–2 свежие идеи из банка (`ideas.mjs pick`), которых не было на
   последних сайтах. Своё — сверху донора, не вместо.
4. **Сверить**: `motion.mjs compare <донор.json> <наш адрес>` — FAIL, пока у донора есть
   движение без пары и без решения. Протокол сверки — доказательство для журнала (state.mjs).
5. **После сдачи**: удачное — в банк идей (`ideas.mjs add`), что пользователь отверг — туда же
   со статусом rejected и его словами.

## Команды

```
node scripts/motion.mjs <адрес> [--viewport desktop] [--out <прогон>] [--tag donor-home]   # инвентарь
node scripts/motion.mjs compare <прогон>/motion/donor-home.json <наш адрес> --out <прогон>  # сверка
node scripts/motion.mjs selftest                                                          # 19 видов на стенде
```

Выход: `<прогон>/motion/<tag>.md` — таблица «вид · где · запуск · что меняется · параметры · рецепт»
(её и копировать в analysis.md, раздел «Движение донора → блоки»), `.json` — протокол, вырезки
`<tag>/mNN.png`. `--debug` пишет ещё ряды значений по шагам — разбирать спорное.

Чего motion.mjs не видит: движение по клику (меню, аккордеон, модальное окно — это runtime.mjs),
переходы между страницами (Barba и View Transitions — только в списке библиотек), звук, движение
внутри холста (видно только «рисует/не рисует»), эффекты, которые включаются после долгого
бездействия. Прокрутка скриптом — не колесо: плавная прокрутка (Lenis) и пружины Framer
догоняются ожиданием до 0.9 с на шаг, отрезки прокрутки точны до ~5% высоты экрана.

## Общие правила для любого движения

- **Только transform и opacity** (плюс filter/clip-path для появлений). Не анимировать width,
  height, top, left, margin — это перекладка и рывки на телефоне. Полосу прогресса — `scaleX`.
- **«Меньше движения»** (`prefers-reduced-motion: reduce`): сразу конечное состояние, без петель,
  без печати, без параллакса. Не «нет анимации = всё скрыто»: скрытое до появления должно быть видно.
  Проверка: `runtime.mjs --reduced-motion` + assert конечного состояния.
- **Скрытое до появления — не главная картинка экрана.** Картинка, которая проявляется при
  прокрутке, становится «самым крупным элементом» в момент появления и уводит LCP на секунды
  (VN3D: появление у каталога дало LCP 11 с). Появление — у текстовых панелей и декора.
- **Без JS видно всё.** Прятать до появления классом, который ставит сам скрипт
  (`.js-reveal [data-reveal]:not(.is-in)`), а не стилем по умолчанию. Класс ставить **без перехода**
  (иначе блоки при загрузке заметно гаснут: `motion.mjs` VN3D поймал «вход при загрузке 1 → 0»).
- **Петли дольше 5 секунд** (бегущая строка, карусель, покачивание) — пауза: наведением **и**
  кнопкой (WCAG 2.2.2), вне экрана — стоят (IntersectionObserver), на скрытой вкладке — стоят.
- **Холсты и 3D**: рисовать только в экране; если кадр рисуется лишь при движении —
  `preserveDrawingBuffer: true` и перерисовка при `visibilitychange`/возврате в экран (иначе после
  скрытия — пустое место). Карта импортов (`importmap`) — раньше любого `modulepreload` и
  module-скрипта: Firefox иначе её отбрасывает, и 3D не запускается (у владельца VN3D — Firefox).
- **Проверять в браузере пользователя**, не только в Chrome (`runtime.mjs --browser firefox`).

## Рецепты

Имя рецепта — в последней колонке таблицы motion.mjs. «Из протокола» — какие поля брать.

### `entrance` — вход при загрузке
Из протокола: `props` (из → в), `timing.duration`, `easing`, `delay`, по очереди.
```css
.hero__title { animation: rise .8s .1s cubic-bezier(.2,.7,.2,1) both; }
@keyframes rise { from { opacity: 0; transform: translateY(24px); } }
@media (prefers-reduced-motion: reduce) { .hero__title { animation: none; } }
```
Не задерживать главный текст дольше 0.3 с — первый экран «пустой» — плохой LCP.

### `reveal` — появление при прокрутке (и `reveal-stagger` — по очереди)
Из протокола: из → в (прозрачность, сдвиг, масштаб, размытие, шторка), `scroll.at` (где
срабатывает: «верх блока на N% экрана» → `rootMargin: 0px 0px -(100-N)% 0px`), `duration`,
`easing`, `stagger`.
```js
// reveal.js
const els = document.querySelectorAll('[data-reveal]');
if (els.length && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js-reveal');           // без перехода: см. CSS
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });          // «на 88% экрана»
  els.forEach((el) => io.observe(el));
}
```
```css
.js-reveal [data-reveal]:not(.is-in) { opacity: 0; transform: translateY(20px); transition: none; }
[data-reveal].is-in { transition: opacity .6s ease, transform .6s ease; }
[data-reveal]:nth-child(2) { transition-delay: .1s; }            /* по очереди +100 мс */
```
Шторка: `clip-path: inset(0 100% 0 0)` → `inset(0)`; размытие: `filter: blur(12px)` → `none`.

**«Появление (при прокрутке вверх)»** — закреплённая кнопка или панель видна, когда листают вверх, и уходит при
прокрутке вниз (shapefest «Back to top»: внизу по центру, уход на 80 px с угасанием). `motion.mjs` отличает это от
«исчезает» по шагам вверх в конце прохода; замер прыжками `scrollTo` направление не ловит — спорное проверять колесом.
```js
let lastY = scrollY, up = false;
const upd = () => { const y = scrollY; if (Math.abs(y - lastY) > 4) { up = y < lastY; lastY = y; }
  btn.classList.toggle('is-on', up && y > innerHeight * 1.5); };      // в первых экранах «наверх» не нужна
addEventListener('scroll', upd, { passive: true });
```
```css
.to-top { position: fixed; left: 50%; bottom: 20px; opacity: 0; transform: translate(-50%, 80px); visibility: hidden;
  transition: opacity .3s, transform .3s, visibility 0s .3s; }                       /* скрытая — вне обхода Tab */
.to-top.is-on { opacity: 1; transform: translate(-50%, 0); visibility: visible; transition: opacity .3s, transform .3s; }
```
Своё поверх донора, если мешает: прятать, пока на экране подвал (IntersectionObserver), — на телефоне кнопка иначе
ложится на ссылки подвала. Проверка — `runtime.mjs` цепочкой `--eval scrollTo(вниз)` → `--assert !is-on` → `--eval
scrollTo(выше)` → `--assert is-on` (VN3D `tools/checks.sh`, шаг 17).

### `scroll-scrub` — свойство привязано к прокрутке
Из протокола: из → в по каждому свойству, `scroll.startPct` → `scroll.endPct` (верх блока в % высоты
экрана в начале и конце). Пример — фон плашки shapefest: масштаб 1.4 → 1.1, прозрачность
0.9 → 0.5, верх блока 100% → 46%.
```js
// motion.js — точные числа донора в любом браузере
const bg = document.querySelector('[data-scroll-bg]'); const box = bg.parentElement;
const START = 1.00, END = 0.46;                                      // из протокола, доли экрана
const lerp = (a, b, p) => a + (b - a) * p;
let raf = 0;
function update() {
  raf = 0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { bg.style.transform = bg.style.opacity = ''; return; }
  const vh = innerHeight, top = box.getBoundingClientRect().top;
  const p = Math.min(1, Math.max(0, (START * vh - top) / ((START - END) * vh)));
  bg.style.transform = `scale(${lerp(1.4, 1.1, p).toFixed(4)})`; bg.style.opacity = lerp(0.9, 0.5, p).toFixed(3);
}
addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
addEventListener('resize', update); update();
```
CSS (конечное состояние — оно же без JS и при «меньше движения»):
`.custom__bg { transform: scale(1.1); opacity: .5; will-change: transform, opacity; }`.
Можно `animation-timeline: view()` (Chrome, Edge, Safari 26) — но только под
`@supports (animation-timeline: view())` и с этим же JS для остальных. Если слушатель
прокрутки включается только около блока (IntersectionObserver), после прыжка через блок
значение устаревает — пересчитывать при входе в экран (так и сделано) или слушать всегда.

### `parallax` — сдвиг на долю прокрутки
Из протокола: `coefficient` у каждого слоя (`coefs`: у стопки shapefest −0.05, −0.1, −0.2, −0.3, −0.5),
поворот/масштаб, если есть.
```js
const layers = [...document.querySelectorAll('[data-k]')];
function par() { const y = scrollY; for (const l of layers) l.style.transform = `translate3d(0, ${(y * +l.dataset.k).toFixed(1)}px, 0) rotate(${l.dataset.rot || 0}deg)`; }
```
Только у декора и слоёв без текста; на телефоне коэффициенты вдвое меньше или без параллакса.

### `pin` — закреплённый раздел / полоса; лента вбок
Из протокола: `sub` (полоса — меню категорий; раздел — сцена на N px прокрутки), для ленты —
`coefficient` сдвига X.
```css
.pin { height: 300vh; } .pin__sticky { position: sticky; top: 0; height: 100vh; overflow: hidden; }
```
```js
const k = Math.min(1, Math.max(0, -pin.getBoundingClientRect().top / (pin.offsetHeight - innerHeight)));
track.style.transform = `translate3d(${-k * (track.scrollWidth - innerWidth)}px, 0, 0)`;
```
Полоса категорий: `position: sticky; top: 0; background: непрозрачный` (иначе просвечивает).

### `header-scroll` — шапка при прокрутке
Из протокола: фон из → в, «прячется вниз / возвращается вверх».
```js
let last = 0; addEventListener('scroll', () => { const y = scrollY; head.classList.toggle('is-solid', y > 100); head.classList.toggle('is-hidden', y > last && y > 300); last = y; }, { passive: true });
```
`.is-hidden { transform: translateY(-100%) }` с переходом .3 с; якоря — `scroll-margin-top`.

### `scroll-progress` — полоса прогресса
`bar.style.transform = \`scaleX(${scrollY / (document.documentElement.scrollHeight - innerHeight)})\``,
`transform-origin: left`. Не width.

### `marquee` — бегущая строка
Из протокола: скорость px/с и направление. Длительность — по ширине списка:
`--dur: (ширина одной копии / скорость) с`.
```html
<div class="mq" data-marquee><div class="mq__track">
  <ul>…</ul><ul aria-hidden="true">…</ul>                       <!-- вторая копия — для стыка -->
</div><button data-marquee-toggle aria-label="Остановить ленту">Остановить</button></div>
```
```css
.mq { overflow: hidden; mask-image: linear-gradient(to right, transparent, #000 12.5%, #000 87.5%, transparent); }
.mq__track { display: flex; width: max-content; animation: mq var(--dur, 60s) linear infinite; }
.mq:hover .mq__track, .mq.is-paused .mq__track { animation-play-state: paused; }
.mq ul { display: flex; gap: 72px; padding: 0 36px; }             /* поля = половина зазора: стык не виден */
@keyframes mq { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .mq__track { animation: none; } .mq ul[aria-hidden] { display: none; } .mq ul { flex-wrap: wrap; } }
```
Чужие логотипы в ленте — только законно (клиенты, которые разрешили); иначе — своё содержание
(игры, жанры, материалы) и строка о правах.

### `typewriter` — печатающийся текст (и `rotating-words`)
Из протокола: слова, скорость набора и стирания (знаков/с), мигание курсора (`loop мигание`, период).
```js
const words = ['настольных игр.', 'вашей полки.']; const el = document.querySelector('.type');
const TYPE = 1000 / 16, ERASE = 1000 / 29, HOLD = 2600;          // из протокола
(async () => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; ; i = (i + 1) % words.length) { const w = words[i];
    for (let n = 1; n <= w.length; n++) { el.textContent = w.slice(0, n); await new Promise((r) => setTimeout(r, TYPE)); }
    await new Promise((r) => setTimeout(r, HOLD));
    for (let n = w.length; n >= 0; n--) { el.textContent = w.slice(0, n); await new Promise((r) => setTimeout(r, ERASE)); } } })();
```
В разметке — первое слово целиком (без JS, для поиска и LCP), для чтения с экрана — всё
одной фразой в `.sr-only`, печатающийся узел `aria-hidden`. Курсор — `::after` с `steps(1)`.

### `counter` — числа считают
Запуск — при входе в экран, 1–1.5 с, `toLocaleString('ru-RU')`; при «меньше движения» — сразу итог.
Числа — только подтверждённые владельцем (не выдумывать «500 клиентов»).

### `carousel-auto` — слайды листаются сами
Из протокола: шаг, интервал. Пауза при наведении и фокусе, кнопки «назад/вперёд» и «пауза»,
при «меньше движения» — не листать. Чаще лучше без автолистания.

### `loop` — петли (парение, вращение, пульс, мигание, покачивание)
Из протокола: подвид, период, ключевые кадры. CSS `@keyframes` с `alternate` для парения,
`linear infinite` для вращения. Вне экрана — `animation-play-state: paused` (IntersectionObserver).
Покачивание (Framer loop: ±2–6° за несколько секунд) — `rotate` в `@keyframes` с `ease-in-out alternate`.

### `hover` — наведение
Из протокола: `component` (card, button, link, nav) и что меняется: картинка в карточке крупнее
(`scale(1.05)`, `.35s ease`, у обёртки `overflow: hidden`), карточка целиком крупнее и с тенью
(`scale(1.04)` + тень), кнопка светлее (`filter: brightness(1.12)`), линия под ссылкой (`::after`
`scaleX(0 → 1)`, `transform-origin: left`). Та же длительность и кривая. Не только `:hover` —
и `:focus-visible` (клавиатура). На телефоне наведения нет — важное не прятать за ним.

### `mouse-tilt` — реакция на мышь; `custom-cursor`
Наклон ±8°: `rotateX/rotateY` от положения мыши, `perspective(600px)`, возврат при уходе мыши.
Только на устройствах с мышью (`@media (hover: hover) and (pointer: fine)`), при «меньше
движения» — без наклона. Свой курсор — редко к месту; системный курсор не прятать.

### `canvas` — холст рисует
3D или 2D. Запуск после загрузки (`requestIdleCallback`), без блокировки (`compileAsync`, если
есть расширение параллельной сборки — иначе молча первым кадром), пауза вне экрана,
запасная картинка без WebGL, проверка в Firefox. Подробно — engines.md, «3D».

### `video-bg` — видео-фон
`autoplay muted loop playsinline`, постер (он же LCP), `preload="metadata"`, пауза вне экрана,
при «меньше движения» — постер вместо видео, вес ≤ 2–3 МБ (media.mjs режет петлю).

## Своё и банк идей

Донор задаёт язык, но сайт не должен быть его копией — и не должен повторять наши прошлые сайты.

- **Своё из товара** — движение, которое рассказывает о продукте: печать слоями у фигурок,
  пар над чашкой у кофейни, лезвие по линии у барбершопа. Одна главная деталь, не десять.
- **Банк идей** (`scripts/ideas.mjs`): что уже было удачно и где. `ideas.mjs pick --run <прогон>
  --kind motion` предлагает идеи, которых не было на последних трёх сайтах и которые
  пользователь не отверг. Взятую — `ideas.mjs use <id> --run <прогон> --block <блок>`.
- **Разнообразие**: одна и та же «подписная» идея не ставится на два сайта подряд; приём, который
  пользователь отверг, не предлагается (у него статус rejected и его слова).
- Всё своё — в сверке `compare` видно как «своё (у донора нет)»: проверить, что это задумано.
