# svg3d — образцы «3D SVG»

Сцены, готовые рисунки и страница-образец для инструмента `scripts/svg3d.mjs`: рисунки с объёмом в
чистом SVG на бесплатных библиотеках (Zdog, Three.js SVGRenderer, CadQuery, Rough.js, vtracer, SVGO,
Iconify). Какой движок когда, правила качества и лицензии — `reference/svg-3d.md`.

Набор даёт **механику и приёмы**: как устроена сцена, как она становится SVG, как стоит на сайте.
**Вид** у каждого сайта свой: предметы — из мира дела, цвета — из его дизайн-системы. Мастерская
подарков «Улей» в `demo.html` вымышлена: это пример, а не заготовка. Сцены отсюда на сайт клиента
не переносить как есть — строить свои по их образцу.

| Файл | Что в нём |
|---|---|
| `scenes/zdog-sprout.mjs`, `zdog-gift.mjs`, `zdog-cup.mjs`, `zdog-pin.mjs` | набор круглых «игрушечных» иконок одного характера: росток, коробка с лентой, чашка, метка на карте |
| `scenes/three-honeycomb.mjs`, `three-crystal.mjs` | гранёные предметы: соты из шестигранных ячеек, друза кристаллов |
| `scenes/cad-gears.py` | чертёжная проекция: пара шестерён на плите (свой сценарий CadQuery с параметрами) |
| `out/` | готовые рисунки из этих сцен; фоны-россыпи `bg-scatter.svg`, `bg-scatter-m.svg` (телефон), `bg-blueprint.svg`; `out/icons/` — иконки Lucide с `credits.json` |
| `demo.html` | страница-образец: фон, ряд иконок, живой Zdog с запасным SVG, гранёные предметы, чертёж, вариант «от руки» |
| `zdog-live.js` | модуль «живой» сцены Zdog: поворот за прокруткой и мышью, статичный SVG — запасной вид |
| `vendor/zdog.dist.min.js` | Zdog 1.1.3 (MIT, шапка лицензии в файле) — на сайт копируется вместе с `zdog-live.js` |
| `build.mjs` | запись команд, которыми получены `out/` и вставки в `demo.html`; `node build.mjs` пересобирает всё |

Открыть образец: `node ~/.claude/skills/site-rework/scripts/serve.mjs ~/.claude/skills/site-rework/templates/svg3d --port 4186`
→ `http://127.0.0.1:4186/demo.html`. Двойным щелчком (`file://`) модули не грузятся — страница покажет
вид без JS: всё на месте, росток не поворачивается.

## Как получены рисунки

```sh
cd ~/.claude/skills/site-rework/templates/svg3d
node ../../scripts/svg3d.mjs doctor
node ../../scripts/svg3d.mjs zdog scenes/zdog-sprout.mjs --out out --css-vars --for icon          # иконка, цвета переменными
node ../../scripts/svg3d.mjs three scenes/three-honeycomb.mjs --out out                            # гранёный предмет
node ../../scripts/svg3d.mjs cad scenes/cad-gears.py --out out --view iso --size 640 --for background
node ../../scripts/svg3d.mjs cad crate --out out/cad-crate.svg --size 420 --hidden faint           # встроенная фигура
node ../../scripts/svg3d.mjs rough out/cad-crate.svg --out out/cad-crate-rough.svg --single-stroke --roughness 0.9
node ../../scripts/svg3d.mjs sheet out --out <временная папка>/sheet.png --bg "#E9EEDD" --color "#16301F"
```

Фон-россыпь — одна сцена в нескольких ракурсах плюс ещё две:

```sh
node ../../scripts/svg3d.mjs zdog scenes/zdog-sprout.mjs --out <tmp>/f --frames 5 --size 200
node ../../scripts/svg3d.mjs scatter <tmp>/f/zdog-sprout-01.svg <tmp>/f/zdog-sprout-02.svg out/zdog-gift.svg out/zdog-cup.svg --out out/bg-scatter.svg --size 1440x760 --count 16 --item 150 --area edges --seed 12
```

Полный список — в `build.mjs` (он же вставляет рисунки в `demo.html` между метками
`<!--svg3d:out/файл.svg-->` и `<!--/svg3d-->`; `node build.mjs --inline` — только вставки).

## Сцена Zdog

```js
export const view = { size: [160, 160], rotate: { x: -0.42, y: 0.6 } };       // поле и поворот (радианы)
export const palette = { ink: '#16301F', moss: '#5E7A33', clay: '#C8643C' };   // имена → переменные c-ink, c-moss…
export function build({ Zdog, illo, palette: c, TAU }) {                       // фигуры — addTo: illo
  new Zdog.Shape({ addTo: illo, stroke: 46, color: c.moss });
}
```

Приёмы, на которых держатся образцы:

- **Объём без света** — соседними оттенками палитры: у коробки верх светлее, бока темнее (`topFace`,
  `frontFace`), у цилиндра `backface` — тёмная сторона.
- **Скруглённые углы** — обводка граней цветом грани (`stroke: 3`).
- **Группы против неверного порядка слоёв.** Бант над крышкой — отдельная `Zdog.Group`; жилка листа —
  в одной `Group` с листом (без `updateSort` дети рисуются по порядку).
- **Лента на коробке** — коробки на 1–2 единицы шире самой коробки: их грани снаружи.
- **Невидимое убирает инструмент**: задние грани и донышки в файл не попадают (у коробки с лентой —
  23 фигуры из 39).
- **Набор — один характер**: одно поле (160), близкий поворот, обводка 5–8 у линий, ничего мельче
  4 единиц. Смотреть набор листом: `svg3d.mjs sheet`.

## Сцена Three.js

```js
export const view = { size: [320, 300], pad: 10, camera: { type: 'ortho', dir: [0.9, 1.05, 1] } };
export const palette = { sun: '#E8B647', honey: '#D99A2B' };
export function build({ THREE, root, color, lights }) {                // предметы — в root, свет — lights()
  lights({ ambient: 0.34, key: { dir: [0.25, 1, 0.45], power: 0.74 }, fill: { dir: [1, 0.15, 0.2], power: 0.2 } });
  root.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.4, 6), new THREE.MeshLambertMaterial({ color: color('sun') })));
}
```

- Два-три направленных света разной силы — у каждой стороны свой ровный оттенок; один свет даёт две
  одинаково тёмные стороны.
- Предметы могут входить друг в друга (кристаллы в основание): грани режутся по линии пересечения.
- Малое число сегментов у круглых тел; одинаково повёрнутые грани одного материала склеиваются в
  один контур — соты из 19 ячеек занимают 47 узлов.

## Живой Zdog на сайте

Скопировать на сайт `zdog-live.js`, `vendor/zdog.dist.min.js` и файл сцены; статичный SVG той же
сцены вписать в блок:

```html
<div class="stage" data-zdog-live="/assets/svg3d/zdog-sprout.mjs" data-zdog-mode="scroll hover" data-zdog-turn="1.6">
  <svg viewBox="-80 -80 160 160" aria-hidden="true" focusable="false">…из out/zdog-sprout.svg…</svg>
</div>
<script type="module" src="/assets/svg3d/zdog-live.js"></script>
```

| атрибут | что задаёт | по умолчанию |
|---|---|---|
| `data-zdog-live` | адрес модуля сцены | — |
| `data-zdog-mode` | `scroll` — прокрутка, `hover` — мышь над блоком | оба |
| `data-zdog-turn` | поворот за проход блока по экрану, радианы | 1.2 |
| `data-zdog-lib` | адрес `zdog.dist.min.js` | `vendor/` рядом с `zdog-live.js` |
| `data-zdog-var-prefix` | приставка переменных цвета | `c-` |

Поведение: библиотека грузится, когда блок в 200 px от экрана; живой SVG встаёт на место статичного
(тот же `viewBox` и класс); кадр рисуется только пока предмет доворачивается — петли нет; вне экрана
прокрутка не слушается. Без JS, при ошибке и при «меньше движения» остаётся статичный вид (при
«меньше движения» Zdog не грузится вовсе; включили настройку при открытой странице — живой убирается).
Состояние — `data-zdog-state="live|static"`, причина отказа — одной строкой в консоли `[zdog-live]`.
Размер блока задаёт вёрстка (`aspect-ratio`): место занято до загрузки, вёрстка не прыгает.
Ручной запуск — `<html data-zdog-manual>` и `import { init } from '…/zdog-live.js'; init(корень)`.

## Что проверить после подключения

```sh
node ~/.claude/skills/site-rework/scripts/runtime.mjs <url> --out <папка> --tag svg3d --scroll --fullpage --assert "document.querySelector('[data-zdog-live]').dataset.zdogState === 'live'"
node ~/.claude/skills/site-rework/scripts/runtime.mjs <url> --out <папка> --tag svg3d-320 --viewport mobile-s --scroll --fullpage
node ~/.claude/skills/site-rework/scripts/runtime.mjs <url> --out <папка> --tag svg3d-calm --reduced-motion --scroll --assert "!window.Zdog && document.querySelectorAll('.zdog-live').length === 0"
node ~/.claude/skills/site-rework/scripts/runtime.mjs <url> --out <папка> --tag svg3d-ff --browser firefox --scroll
```

- без FAIL; «переполнение: OK» на 320 px; «текст перекрыт картинкой — нет»;
- снимки открыть глазами: россыпь не лежит на тексте, на телефоне рисунки на месте (широкий фон с
  предметами у краёв на 320 px пуст — нужна своя полоса, как `bg-scatter-m.svg`), ряд иконок — одного
  характера, у гранёных предметов нет щелей и перевёрнутых граней;
- браузер владельца — Firefox (`--browser firefox`): живой предмет и цвета-переменные там работают
  (проверено на образце, Firefox 157).

Образец проверен 01.10.2026: Chrome 154 и Firefox 157, 1440 и 320 px, «меньше движения» — без FAIL.
