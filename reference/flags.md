# Флаги скриптов site-rework и design-reference

> Собирается `node scripts/flags-doc.mjs` из кода (разбор аргументов каждого скрипта и его `-h`).
> Руками не править: поменяли флаг — перегенерировать; `--check` скажет, если забыли.

**Общее.** Флаг пишется `--ключ значение` или `--ключ=значение`; после `--` — только позиционные. Значение,
которое начинается с `--`, — только через `=`. Неизвестный флаг не забирает адрес, команду и слово на «-»;
у скрипта с пометкой «неизвестный флаг — ошибка» он останавливает запуск (код 1, «может быть, --…?»), у остальных
даёт WARN и запуск идёт дальше. Вид «значение необязательно» — берёт следующее слово, только если оно не похоже на флаг.

## a11y.mjs

```
node a11y.mjs <url> [--viewport desktop] [--out папка] [--tag имя] [--ignore селектор] [--no-grain] [--keep-consent] [--strict]
node a11y.mjs --selftest [--out папка]
node a11y.mjs --help   (или -h)
```

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--keep-consent` | переключатель | не закрывать окно согласия cookie и ворота-заставку («ENTER», «Мне есть 18») — чтобы проверить |
| `--no-grain` | переключатель | не учитывать слой зерна поверх текста в контрасте (см. ниже). |
| `--selftest` | переключатель | стенды fixtures/a11y с ожиданиями: фокус на полях даты и времени, скрытый (кегль 0), |
| `--strict` | переключатель | код выхода 1 при вердикте FAIL (для гейта); без флага — 0 при любом вердикте. |
| `--ignore` | со значением | CSS-селектор (список — через запятую) текста вне проверки контраста и кегля: логотип и |
| `--out` | со значением | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/a11y/<tag>.json. |
| `--tag` | со значением | имя файла итога (по умолчанию имя экрана). |
| `--viewport` | со значением | экран: пресет (desktop, laptop, tablet, mobile, mobile-s, android), запись ШxВ@плотность |
| `--viewports` | со значением | файлы). --viewports — то же самое (синоним). |

Коды выхода: 0 — проверка сделана (вердикт в выводе и в JSON); 1 — неверные аргументы или, с --strict, вердикт FAIL. Аргументы (адрес, экран, значения флагов) проверяются до создания папок и запуска браузера.

## bgdecor.mjs

```
node bgdecor.mjs <url> [--pages "/,/menu"] [--viewport desktop,mobile] [--out <папка прогона>] [--tag имя]
node bgdecor.mjs compare <донор.json> <url | наш.json> [--decisions файл] [--out <папка прогона>]
node bgdecor.mjs selftest [--no-browser]
node bgdecor.mjs --help | -h
```

Команды: `compare`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--no-browser` | переключатель | selftest без стенда в браузере |
| `--no-crops` | переключатель | не сохранять вырезки |
| `--decisions` | со значением | compare: файл решений (по умолчанию <папка>/decor-decisions.json) |
| `--md` | со значением | куда записать таблицу |
| `--out` | со значением | папка прогона (по умолчанию ~/.claude/site-rework/runs/<адрес>) |
| `--pages` | со значением | --pages "/,/a"   страницы через запятую: каждая на каждом экране, протокол один; путь с «/» — от корня ХОСТА, без него ("./", "a.html") — от папки адреса; у сай |
| `--tag` | со значением | имя протокола и папки вырезок; по умолчанию — имя сайта по адресу, в compare — compare |
| `--viewport` | со значением | экраны через запятую (desktop, laptop, tablet, mobile, mobile-s, android или |
| `--viewports` | со значением | ШxВ@плотность); по умолчанию desktop; --viewports — то же; в compare — экраны донора |
| `--json` | значение необязательно | куда записать протокол; «-» — JSON в stdout вместо текста |

Коды выхода: 0 — OK или WARN; 1 — FAIL selftest или неизвестный флаг; 2 — неверные аргументы или файл; 3 — страница не открылась, ответила кодом от 400 (страница ошибки — не страница сайта) или браузер не запустился.

Переменные окружения: `RW_BGD_RAW`.

## blender.mjs

```
node blender.mjs doctor [--json файл]                     где Blender, версия, Cycles и видеокарта, glTF и Draco
node blender.mjs render <сцена.py|сцена.json> [--out папка] [--w 1000] [--h 1000] [--samples 256] [--denoise]
node blender.mjs physics <сцена> [--out папка] [--frames 120] [--sim auto|rigid|cloth] [--video] [--webm]
node blender.mjs glb <сцена> --out файл.glb|папка [--draco] [--animation] [--for item|scene] [--max-kb N]
node blender.mjs glb-check <файл.glb> [--poster картинка] [--shot файл.png] [--site папка] [--for item|scene] [--max-kb N]
node blender.mjs vendor --out <папка сайта> [--draco]    three.js для страницы: vendor/three/… и glb-viewer.js
node blender.mjs selftest [--keep]                       аргументы, задания, Python, просмотрщик GLB; есть Blender —
node blender.mjs --help | -h
```

Команды: `doctor`, `render`, `physics`, `glb`, `glb-check`, `vendor`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--animation` | переключатель | анимация физики в GLB (твёрдые тела → ключи); ткань — всегда застывший последний кадр |
| `--backdrop` | переключатель | [--palette "bone=#E7E3DD,accent=#C8553D"] [--variant имя[,имя…]] [--transparent \| --backdrop] [--bg EFEBE4] |
| `--denoise` | переключатель | денойз OpenImageDenoise (по умолчанию включён); --no-denoise — выключить |
| `--draco` | переключатель | сжатие геометрии Draco (на странице — декодер, vendor --draco) |
| `--dry-run` | переключатель | ничего не запускать: напечатать задание и команду (с --json — записать их в файл) |
| `--keep` | переключатель | node blender.mjs selftest [--keep]                       аргументы, задания, Python, просмотрщик GLB; есть Blender — |
| `--no-check` | переключатель | не открывать GLB в браузере после экспорта |
| `--no-denoise` | переключатель | --denoise       денойз OpenImageDenoise (по умолчанию включён); --no-denoise — выключить |
| `--save-blend` | переключатель | сохранить собранную сцену <имя>.blend — открыть в Blender и поправить руками |
| `--transparent` | переключатель | прозрачный фон и тень на земле в альфе (по умолчанию так); --backdrop — непрозрачная |
| `--trim` | переключатель | обрезать прозрачные поля кадра; у предмета с тенью на земле — по самому предмету с запасом |
| `--video` | переключатель | ещё и кадры 1…frames → mp4 (ffmpeg, на цвете --bg); --webm — с прозрачностью (VP9); |
| `--webm` | переключатель | node blender.mjs physics <сцена> [--out папка] [--frames 120] [--sim auto\|rigid\|cloth] [--video] [--webm] |
| `--webp-frames` | переключатель | --webp-frames — кадры в WebP; --fps (30), --step — каждый N-й кадр, --video-samples (64) |
| `--bake` | со значением | auto — процедурные материалы (шум бумаги, плетение ткани) запечь в картинки \| off |
| `--bg` | со значением | цвет поля сайта: превью <имя>-on-<bg>.jpg, лист вариантов, подложка видео mp4 |
| `--device` | со значением | auto (видеокарта, если есть) \| gpu \| cpu |
| `--engine` | со значением | cycles (по умолчанию) \| eevee — быстрый черновик (без трассировки, нужна видеокарта) |
| `--exposure` | со значением | выдержка, ступени (0): темно — +0.5…+1, пересвет — −0.5 |
| `--for` | со значением | бюджет: item — предмет ≤ 1.5 МБ, 150 тыс. вершин \| scene — сцена ≤ 4 МБ, 400 тыс.; больше — WARN |
| `--fps` | со значением | [--webp-frames] [--glb файл.glb] [--fps 30] [--step 1] [--video-samples 64] [--frame-on end\|all] (+ флаги render) |
| `--frame-on` | со значением | рамка камеры: end — по улёгшимся предметам (влёт сверху в кадр) \| all — весь полёт в кадре |
| `--frames` | со значением | длина симуляции, кадров (по умолчанию — FRAMES сцены или 120) |
| `--glb` | со значением | ещё и GLB с анимацией падения (ключи на каждом кадре) в этот файл |
| `--json` | со значением | протокол (или задания при --dry-run) — в этот файл |
| `--key-step` | со значением | [--bake auto\|off] [--tex 1024] [--key-step 1] [--frames 120] [--no-check] |
| `--look` | со значением | «look» тональной кривой (например "Medium High Contrast" у AgX) |
| `--max-kb` | со значением | свой бюджет веса, КБ |
| `--name` | со значением | имя файлов (по умолчанию — имя сцены; с вариантом — «имя-вариант») |
| `--out` | со значением | папка результата (blender-out в текущей); у glb — файл .glb или папка |
| `--palette` | со значением | цвета сайта по именам поверх палитры сцены: "bone=#E7E3DD,accent=#C8553D" |
| `--param` | со значением | параметры сцены (ctx.param): "count=12,fabric=silk" |
| `--poster` | со значением | картинка-постер для проверки запасного вида (без WebGL); --shot — снимок живого кадра в PNG |
| `--q` | со значением | качество WebP (88); --small — ширины малых копий для srcset, px, через запятую (640; 0 — без них) |
| `--samples` | со значением | сэмплов Cycles на пиксель (256; черновик — 32) |
| `--seed` | со значением | зерно случайности сцены и сэмплера (7) |
| `--shot` | со значением | node blender.mjs glb-check <файл.glb> [--poster картинка] [--shot файл.png] [--site папка] [--for item\|scene] [--max-kb N] |
| `--sim` | со значением | что сцена строит (ctx.sim): auto \| rigid — твёрдые тела \| cloth — ткань |
| `--site` | со значением | папка сайта после vendor: проверять его копию three.js и glb-viewer.js, а не скилла |
| `--small` | со значением | [--trim] [--name имя] [--q 88] [--small 640] [--tone neutral\|agx\|filmic\|standard] [--exposure 0] |
| `--step` | со значением | [--webp-frames] [--glb файл.glb] [--fps 30] [--step 1] [--video-samples 64] [--frame-on end\|all] (+ флаги render) |
| `--tex` | со значением | сторона запечённой картинки, px (1024); --key-step — ключ на каждом N-м кадре (1) |
| `--timeout` | со значением | предел работы Blender, минут (120) |
| `--tone` | со значением | тональная кривая: neutral — Khronos PBR Neutral, цвета палитры без сдвига (по умолчанию); |
| `--trim-bottom` | со значением | под тень (--trim-side 0.3, --trim-bottom 0.07 — доли ширины и высоты предмета); печатает, |
| `--trim-side` | со значением | под тень (--trim-side 0.3, --trim-bottom 0.07 — доли ширины и высоты предмета); печатает, |
| `--variant` | со значением | вариант сцены (ctx.variant); несколько через запятую — по кадру на каждый и лист превью |
| `--video-samples` | со значением | [--webp-frames] [--glb файл.glb] [--fps 30] [--step 1] [--video-samples 64] [--frame-on end\|all] (+ флаги render) |
| `--w` | со значением | --w, --h        размер кадра, px (1000 × 1000) |

Переменные окружения: `BLENDER_PATH`, `SITE_REWORK_PROJECT`, `SR_STUB_BLEED`, `SR_STUB_GROUND`, `SR_STUB_MODE`.

## cliche.mjs

```
node cliche.mjs <url> [--baseline <json>[,<json>…]] [--taste [папка]] [--viewport desktop,mobile]
node cliche.mjs baseline <url донора> [--pages "/,/menu"] [--out <файл.json|папка>] [--viewport desktop,mobile]
node cliche.mjs rules [--json]
node cliche.mjs selftest [--no-browser]        (то же: --selftest)
node cliche.mjs --help
```

Команды: `baseline`, `rules`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--no-browser` | переключатель | selftest без стендов в браузере. |
| `--selftest` | переключатель | (или команда selftest) проверки без браузера и стенды fixtures/cliche. |
| `--shot` | переключатель | снимок с обводкой того, что пошло в счёт: <run>/cliche/cliche[-<tag>]-<экран>.png |
| `--strict` | переключатель | как у других скриптов; FAIL и без него даёт код 1. |
| `--baseline` | со значением | база: файл «cliche.mjs baseline» донора (или результат прогона сайта «до»). |
| `--decisions` | со значением | --decisions <json> файл обоснований, если он не в папке прогона. |
| `--out` | со значением | в режиме baseline: файл .json или папка (там cliche-baseline.json). |
| `--pages` | со значением | --pages "/,/a"     baseline: страницы донора от адреса; база одна — приём есть хоть на одной |
| `--run` | со значением | папка прогона (синоним --out): там authorship-decisions.json, туда |
| `--tag` | со значением | имя прогона в файлах: cliche/cliche-<имя>.json и cliche-<имя>-<экран>.png |
| `--viewport` | со значением | экраны через запятую (desktop, laptop, tablet, mobile, mobile-s, android или |
| `--viewports` | со значением | (baseline — desktop,mobile). --viewports — то же самое; оба сразу |
| `--json` | значение необязательно | --json <файл>\|-    куда записать итог (по умолчанию <run>/cliche/cliche[-<tag>].json); «-» — JSON в stdout. |
| `--taste` | значение необязательно | запреты пользователя из журнала вкуса (taste.mjs); без папки — |

Коды выхода: 0 — OK/WARN, 1 — FAIL, 2 — неверные аргументы (нет адреса, флаг без значения, неизвестный экран) или файл, 3 — страница не открылась. Список правил с весами: node cliche.mjs rules

Переменные окружения: `SITE_REWORK_DISMISS`.

## copy.mjs

```
node copy.mjs lint <файл|папка|url> [--pages "/,/about"] [--viewport mobile] [--out <прогон>] [--tag after]
node copy.mjs snapshot <url|папка|файл> --out <прогон> [--pages "/,/about"] [--tag before|donor]
node copy.mjs pairs <до> <после> [--md] [--all] [--limit N] [--json <файл>|-]
node copy.mjs fix --typograph <файл|папка|-> [--write | --out <файл>] [--diff] [--limit N]
node copy.mjs rules [--json]
node copy.mjs selftest [--no-browser]        (то же: --selftest)
node copy.mjs --help
```

Команды: `lint`, `snapshot`, `pairs`, `fix`, `rules`, `selftest`.

Неизвестный флаг — ошибка, код 1 (свой разбор до parseArgs).

| флаг | вид | из справки |
|---|---|---|
| `--all` | переключатель | печатать и подсказки (NOTE); pairs — и неизменённые тексты |
| `--diff` | переключатель | fix: построчный дифф исходника вместо пар по прогонам |
| `--dry-run` | переключатель | fix: только показать — так и по умолчанию; вместе с --write или --out — ошибка |
| `--html` | переключатель | fix -: строка из stdin — фрагмент HTML, а не простой текст |
| `--invent` | переключатель | анкета: контент «нет — сделай сам» — придуманное (заявления без источника, copy:stub) |
| `--md` | переключатель | pairs: markdown-список для «Тексты "было → стало"» отчёта |
| `--no-browser` | переключатель | selftest: без проверки режима адреса (браузер не запускается) |
| `--no-facts` | переключатель | не сверять факты (разведка чужого сайта): подсказки и WARN copy-unchecked; список |
| `--quiet` | переключатель | только строки страниц и итог |
| `--selftest` | переключатель | node copy.mjs selftest [--no-browser]        (то же: --selftest) |
| `--taste` | переключатель | журнал вкуса (taste.mjs, activeBans): запрет пользователя по правилу copy-* |
| `--typograph` | переключатель | node copy.mjs fix --typograph <файл\|папка\|-> [--write \| --out <файл>] [--diff] [--limit N] |
| `--write` | переключатель | fix: записать на месте (без него — только показать) |
| `--allow` | значение необязательно | copy.allow.json: { brand, words, phrases, rules: { правило: [фразы] }, off, templates } |
| `--baseline` | значение необязательно | --baseline, основа для --donor, левая сторона для pairs. |
| `--donor` | значение необязательно | тексты донора (snapshot --tag donor, папка, адрес): 8 слов подряд — FAIL |
| `--facts` | значение необязательно | facts.json — своё от владельца: [{ "fact": "20 000 ₽", "what": "…", "source": "бриф 28.09" }]; |
| `--json` | значение необязательно | --json <файл>\|-     протокол ещё и в файл; «-» — в stdout (вывод для человека тогда в stderr) |
| `--limit` | значение необязательно | fix: сколько пар «было / стало» показать на файл (25); pairs — на страницу (40) |
| `--nbsp` | значение необязательно | fix: &nbsp; (по умолчанию в файлах) или сам знак U+00A0 (по умолчанию для stdin) |
| `--out` | значение необязательно | папка прогона: протокол <прогон>/copy/<tag>.json и список придуманного |
| `--out-dir` | значение необязательно | fix: протокол <прогон>/copy/typo-<tag>.json |
| `--pages` | значение необязательно | --pages "/,/a"      адрес: путь с ведущим «/» — от корня ХОСТА («/a» → http://хост/a), без него ("./", |
| `--role` | значение необязательно | fix -: роль строки (h1, h2 — короче предел склейки неразрывных, title — без пробелов) |
| `--run` | значение необязательно | папка прогона для --taste и файлов по умолчанию, если нет --out |
| `--tag` | значение необязательно | имя протокола: lint — lint (after, base…), snapshot — before, fix — fix |
| `--taste-dir` | значение необязательно | --taste-dir <папка> журнал вкуса, если не ~/.claude/site-rework/taste (или SITE_REWORK_TASTE) |
| `--viewport` | значение необязательно | адрес: экран (mobile по умолчанию; desktop, laptop, tablet, mobile-s, 320x568@2) |

Коды выхода: 0 — OK или WARN; 1 — FAIL, неверные аргументы, страница не открылась, провал selftest. Без команды («copy.mjs <url\|файл> …») — код 1 и «нужна команда: lint\|snapshot\|…» с готовой строкой lint.

## deploy-check.mjs

```
node deploy-check.mjs <папка проекта> [--pages "/,/napravleniya/"] [--url https://сайт] [--out папка] [--tag имя]
node deploy-check.mjs --selftest
node deploy-check.mjs --help   (или -h)
```

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--no-fail` | переключатель | --no-fail код выхода 0 даже при итоге FAIL (как у runtime). Без флага FAIL — код 1: цепочка команд перед |
| `--selftest` | переключатель | стенды fixtures/deploy-check (уменьшенная копия Dockerfile KIMota777/sites без napravleniya и |
| `--strict` | переключатель | выкладкой на нём останавливается. --strict принимается по-старому и ничего не меняет. |
| `--json` | со значением | --json <файл>\|-  протокол ещё и сюда; «-» — JSON в stdout, текст — в stderr. |
| `--out` | со значением | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт из --url> или local-<имя папки>); |
| `--pages` | со значением | страницы через запятую: пути («/,/napravleniya/») или адреса своего сайта. Проверяются эти страницы, |
| `--tag` | со значением | имя протокола, по умолчанию deploy. |
| `--url` | со значением | боевой адрес: страницы из списка ещё и запрашиваются на бою — GET (страница) и HEAD (ассет, на который |

Коды выхода: 0 — итог OK или WARN (WARN код не меняет), задан --no-fail, справка, --selftest сошёлся; 1 — итог FAIL, неверные аргументы или провал --selftest.

Переменные окружения: `SITE_REWORK_RUNS`.

## diff.mjs

```
node diff.mjs <папка-before> <папка-after> [--out папка] [--threshold 0.1] [--no-rescale] [--all]
node diff.mjs --pair a.png b.png [--out папка] [--threshold 0.1] [--no-rescale]
node diff.mjs --help
```

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--all` | переключатель | сравнивать и служебные файлы shots.mjs — вырезки *-stale*.png и листы *-sheet.png |
| `--no-rescale` | переключатель | не приводить масштаб: сравнивать пиксели как есть (раньше так было всегда). |
| `--out` | значение необязательно | куда положить картинки различий и diff.json (по умолчанию <папка-after>/../diff, |
| `--pair` | значение необязательно | сравнить два файла (без папок). |
| `--threshold` | значение необязательно | порог различия пикселя, доля от 255 по худшему каналу, от 0 до 1 (по умолчанию |

Коды выхода: 0 — сравнение сделано (сколько бы ни изменилось) и после --help/-h; 1 — нет sharp, нет пар, нет папки или файла, неверные аргументы.

## discover.mjs

```
node discover.mjs <url> [--out <папка прогона>] [--viewports desktop,tablet,mobile]
```

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--keep-consent` | переключатель | не закрывать окно согласия cookie и ворота-заставку («ENTER», «Мне есть 18»). По |
| `--light` | переключатель | без серии снимков по прокрутке (быстрее); палитра сверяется по first/full |
| `--no-320` | переключатель | без дополнительного прохода на 320 px (он только ищет переполнение, |
| `--no-clicks` | переключатель | не нажимать на найденные аккордеоны и переключатели меню. По умолчанию в конце |
| `--no-design` | переключатель | без дизайн-системы (скилл design-reference) |
| `--no-hover` | переключатель | не наводить мышь на карточки, разбирая блоки, невидимые после прокрутки |
| `--no-pages` | переключатель | без раздела «Страницы сайта по типам». По умолчанию он строится без захода на |
| `--no-texture` | переключатель | не снимать фактуру по пикселям (слои всё равно перечисляются) |
| `--no-texture-module` | переключатель | не подключать texture.mjs, даже если он рядом: запасной путь discover |
| `--strict` | переключатель | код выхода 1, если в итоговых вердиктах есть FAIL (переполнение по ширине, |
| `--out` | со значением | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>) |
| `--pages-shots` | со значением | снять по одной странице каждого из N типов: сначала те, на которые ссылается |
| `--scheme` | со значением | light \| dark — prefers-color-scheme (по умолчанию light) |
| `--tag` | со значением | метка запуска: подпапка снимков (по умолчанию discover) и имена итогов. Без --tag (и с |
| `--viewport` | со значением | По умолчанию desktop,tablet,mobile. --viewport — то же самое, тоже списком; |
| `--viewports` | со значением | --viewports <list> экраны через запятую: desktop, laptop, tablet, mobile, mobile-s (320), |

Коды выхода: 0 — готово (без --strict — даже если в выводе есть FAIL); 1 — нет адреса или он не http(s):// и не file://, неизвестные экраны, флаг без значения, неверная --scheme,

Переменные окружения: `DESIGN_REF_PROJECT`, `SITE_REWORK_DISMISS`.

## firecrawl.mjs

```
node firecrawl.mjs map <url> [--run <папка>] [--limit 200] [--search слово]
node firecrawl.mjs scrape <url> [--run <папка>] [--formats markdown,branding]
node firecrawl.mjs search "<запрос>" --run <папка> [--lang ru] [--country RU] [--location "…"] [--limit 5]
node firecrawl.mjs facts --run <папка> --about "<дело, город>" [--limit 5]
node firecrawl.mjs status [--run <папка>]
node firecrawl.mjs --selftest
node firecrawl.mjs --help   (или -h)
```

Команды: `map`, `scrape`, `search`, `facts`, `status`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--fresh` | переключатель | не брать из кэша, спросить Firecrawl заново (ответ ляжет в кэш) |
| `--selftest` | переключатель | подставной сервер на этой машине с ответами из fixtures/firecrawl: map, scrape, |
| `--about` | значение необязательно | facts: о чём искать факты («барбершоп, Ярославль») |
| `--budget` | значение необязательно | предел кредитов на папку прогона (50); учёт — <папка>/firecrawl/budget.json |
| `--country` | значение необязательно | search, facts: страна выдачи, код ISO (RU) |
| `--formats` | значение необязательно | scrape: markdown, branding или оба через запятую (по умолчанию оба, цена та же) |
| `--lang` | значение необязательно | search, facts: язык выдачи (ru) |
| `--limit` | значение необязательно | map: сколько адресов (200, до 5000; цена та же); search: сколько результатов |
| `--location` | значение необязательно | search, facts: место для местной выдачи («Yaroslavl,Yaroslavl Oblast,Russia») |
| `--out` | значение необязательно | то же, что --run (как у copy.mjs и security.mjs) |
| `--run` | значение необязательно | папка прогона: путь (C:/…, ./x), адрес сайта (папка как у остальных скриптов — |
| `--search` | значение необязательно | map: только адреса по теме, самые близкие первыми («меню», «доставка») |

Коды выхода: 0 — сделано (OK, WARN) или пропуск без ключа (INFO); 1 — неверные аргументы, ошибка API или сети (ключ не принят, нет кредитов, предел запросов, нет ответа); 2 — отказ по правилу: адрес этой машины или частной сети, file://, x.com, PDF, бюджет прогона.

Переменные окружения: `FIRECRAWL_API_KEY`, `FIRECRAWL_API_URL`, `FIRECRAWL_TIMEOUT_MS`, `SITE_REWORK_RUNS`.

## fonts.mjs

```
node fonts.mjs measure <адрес | файл шрифта | "Семейство"> [--selector h1] [--weight 700] [--run <папка прогона> | --out <файл.json>]
node fonts.mjs match <образец.json> [--sources google,fontshare] [--n 8] [--category sans-serif] [--need "₽№«»"] [--latin] [--refresh]
node fonts.mjs sheet <образец.json> "<Семейство>" ["google:Семейство:600" …] [--out <лист.png>]
node fonts.mjs decide "<Семейство>" --run <папка прогона> --why "<почему>" [--source google] [--weight 700]
node fonts.mjs pick [--category serif|sans-serif|display|handwriting|monospace] [--like "<характер по-русски>"]
node fonts.mjs pairs [слова по-английски: luxury, editorial, tech…]
node fonts.mjs get "<Семейство>" --out <папка сайта> [--weights 400,700 | --weights 300..800] [--italic]
node fonts.mjs get "fontshare:<Семейство>" --latin --out <папка сайта> [--weights 500,700] [--italic] [--root <корень>]
```

Команды: `measure`, `match`, `sheet`, `decide`, `pick`, `pairs`, `get`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--italic` | переключатель | pick: нужен курсив (с --weights — у каждого веса). get: курсив тех же весов. |
| `--latin` | переключатель | match: только латиница — кириллица не требуется (логотип, цифры, английский текст). get из |
| `--refresh` | переключатель | match: заново скачать список семейств источника (у Google — раз в 30 дней и так). |
| `--selftest` | переключатель | (или команда selftest) без сети: числа measure на сохранённых шрифтах OFL (засечки, контраст, |
| `--variable` | переключатель | pick: только переменные шрифты (есть оси). |
| `--category` | значение необязательно | pick, match: serif, sans-serif (или sans), display, handwriting, monospace (или mono); несколько — |
| `--like` | значение необязательно | pick: характер по-русски (или по-английски); «не …» и «без …» — исключить. Слова: |
| `--n` | значение необязательно | pick: сколько строк, по умолчанию 10 (-n — то же). match: сколько кандидатов, по умолчанию 8; |
| `--need` | значение необязательно | pick: какие знаки нужны; у каждого — подмножество Google: ₽ — latin-ext, № и Ё — |
| `--out` | значение необязательно | get: папка сайта; файлы — в <папка>/fonts/. measure: файл протокола (.json). sheet: файл листа (.png). |
| `--root` | значение необязательно | get: корень сайта — строки подключения печатаются путями от него («/assets/fonts/…»). |
| `--run` | значение необязательно | measure: протокол в <папка прогона>/fonts/sample.json. decide: обязателен — туда decision.json. |
| `--selector` | значение необязательно | measure: какой элемент страницы-образца мерить, по умолчанию h1 (первый видимый). |
| `--source` | значение необязательно | decide: источник выбора, если семейства нет в match.json; по умолчанию google. get: то же, |
| `--sources` | значение необязательно | match: источники из sources.json через запятую (google, fontshare), по умолчанию все включённые. |
| `--subsets` | значение необязательно | get: подмножества, по умолчанию cyrillic,latin,latin-ext: браузер качает файл, только когда |
| `--text` | значение необязательно | get: подмножество ровно под знаки надписи (логотип, крупное слово; параметр text= API) — |
| `--weight` | значение необязательно | measure: вес файла или семейства (по умолчанию 400; у адреса — вес элемента). decide: вес |
| `--weights` | значение необязательно | pick: нужные веса (все). get: веса через запятую (400,700) или диапазон переменного |
| `--why` | значение необязательно | decide: почему выбран этот шрифт — словами, для владельца и следующего агента. |

Коды выхода: 0 — сделано (OK или WARN); 1 — ошибка: аргументы, нет данных, сеть, ответ API, файл; 2 — не сделано по правилу: у шрифта нет кириллицы (в ответе или в файлах), в подмножестве надписи нет её знаков.

Переменные окружения: `FONTS_API_BASE`, `FONTS_CACHE_DIR`, `FONTS_DATA_DIR`, `FONTS_LICENSE_BASE`, `FONTS_META_URL`, `FONTS_SOURCES`.

## grain-tile.mjs

```
node grain-tile.mjs --out папка [--size 256] [--levels 16] [--mode gray|alpha] [--px 1]
node grain-tile.mjs --check файл.png|gif|webp [--frames N | --sprite-frames N] [--frame-ms M] [--json файл]
node grain-tile.mjs --help | -h
node grain-tile.mjs              без аргументов — эта справка и код 1, ничего не записано
```

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--check` | со значением | проверить готовый файл по ВСЕМ кадрам: число кадров (--frames или --sprite-frames для |
| `--formats` | со значением | что писать: png, sprite, gif, webp (по умолчанию png; при --frames > 1 ещё sprite, webp, gif) |
| `--fps` | со значением | кадров в секунду GIF/WebP (10 = 100 мс); --frame-ms — то же в мс на кадр |
| `--frame-ms` | со значением | [--frames 1] [--fps 10 \| --frame-ms 100] [--seed 7] [--name имя] |
| `--frames` | со значением | N независимых кадров: спрайт PNG и анимированные WebP/GIF |
| `--json` | со значением | записать итог самопроверки |
| `--levels` | со значением | уровней яркости 2…256 (16: σ ≈ 78.35, ≈ 32 КБ); PNG и GIF — палитра на 2, 4, 16 или 256 |
| `--mode` | со значением | gray — непрозрачный серый шум (normal, opacity = σ/78.35); alpha — светлые и тёмные |
| `--name` | со значением | имя файлов (grain-<mode>-<size>[-pxN]) |
| `--out` | со значением | папка для файлов (по умолчанию текущая — если задан хоть один другой флаг) |
| `--px` | со значением | зерно N×N px (lag1 плитки ≈ 1 − 1/N) |
| `--seed` | со значением | зерно генератора (7): тот же seed — побайтно тот же файл |
| `--size` | со значением | сторона плитки, px (256) |
| `--sprite-frames` | со значением | node grain-tile.mjs --check файл.png\|gif\|webp [--frames N \| --sprite-frames N] [--frame-ms M] [--json файл] |

## ideas.mjs

```
node ideas.mjs list [--kind motion] [--status liked] [--all]
node ideas.mjs pick --run <прогон> [--kind motion|layout|typography|interaction|content|3d|media|color|graphics]
node ideas.mjs show <id>
node ideas.mjs add --id <id> --title "<идея>" --kind <вид> --what "<что это>" --fits "<каким сайтам>"
node ideas.mjs use <id> --run <прогон> --block <блок>
node ideas.mjs status <id> liked|neutral|rejected|untested --quote "<слова пользователя>" [--run <прогон>]
node ideas.mjs md                 пересобрать IDEAS.md (делается и после каждой записи)
node ideas.mjs check              проверить банк
```

Команды: `list`, `pick`, `show`, `add`, `use`, `status`, `md`, `check`.

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--all` | переключатель | node ideas.mjs list [--kind motion] [--status liked] [--all] |
| `--block` | значение необязательно | [--how "<где сделано, рецепт>"] [--status untested] [--run <прогон>] [--block <блок>] [--quote "<слова>"] [--tags a,b] |
| `--fits` | значение необязательно | node ideas.mjs add --id <id> --title "<идея>" --kind <вид> --what "<что это>" --fits "<каким сайтам>" |
| `--for` | значение необязательно | [--n 3] [--recent 3] [--for "<о чём сайт>"] |
| `--how` | значение необязательно | [--how "<где сделано, рецепт>"] [--status untested] [--run <прогон>] [--block <блок>] [--quote "<слова>"] [--tags a,b] |
| `--id` | значение необязательно | node ideas.mjs add --id <id> --title "<идея>" --kind <вид> --what "<что это>" --fits "<каким сайтам>" |
| `--kind` | значение необязательно | node ideas.mjs list [--kind motion] [--status liked] [--all] |
| `--n` | значение необязательно | [--n 3] [--recent 3] [--for "<о чём сайт>"] |
| `--quote` | значение необязательно | [--how "<где сделано, рецепт>"] [--status untested] [--run <прогон>] [--block <блок>] [--quote "<слова>"] [--tags a,b] |
| `--recent` | значение необязательно | [--n 3] [--recent 3] [--for "<о чём сайт>"] |
| `--run` | значение необязательно | node ideas.mjs pick --run <прогон> [--kind motion\|layout\|typography\|interaction\|content\|3d\|media\|color\|graphics] |
| `--status` | значение необязательно | node ideas.mjs list [--kind motion] [--status liked] [--all] |
| `--tags` | значение необязательно | [--how "<где сделано, рецепт>"] [--status untested] [--run <прогон>] [--block <блок>] [--quote "<слова>"] [--tags a,b] |
| `--title` | значение необязательно | node ideas.mjs add --id <id> --title "<идея>" --kind <вид> --what "<что это>" --fits "<каким сайтам>" |
| `--what` | значение необязательно | node ideas.mjs add --id <id> --title "<идея>" --kind <вид> --what "<что это>" --fits "<каким сайтам>" |

Коды выхода: 0 — выполнено; 1 — неверные аргументы, нет идеи, банк не читается.

Переменные окружения: `SITE_REWORK_TASTE`.

## media.mjs

```
node media.mjs doctor
node media.mjs search "<запрос по-английски>" --kind photo|video
node media.mjs pick <папка поиска> <N> --seen "<что на кадре>" --caption "<подпись/роль>"
node media.mjs import <url страницы> [<url или путь файла>] --license <id>
node media.mjs credits <папка картинок сайта> [--md [<файл или папка>]]
node media.mjs audit <карта фото.json> (или --map <карта>) [--root <папка сайта>] [--sources pexels,unsplash]
node media.mjs --selftest [--out <папка>]
node media.mjs <команда> --help (или -h, --h) — эта справка, код 0; команда при этом
```

Команды: `doctor`, `search`, `pick`, `import`, `credits`, `audit`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--fresh` | переключатель | [--fresh (без кэша ответов API)] |
| `--not-editorial` | переключатель | --not-editorial; unsplash, kaboompics, adobe-stock-free — только файл, |
| `--ok-flags` | переключатель | [--ok-flags]                     кадр с пометками берётся только с этим флагом |
| `--selftest` | переключатель | node media.mjs --selftest [--out <папка>] |
| `--author` | значение необязательно | [--author "…"] [--author-url …] [--title "…"] [--not-editorial] |
| `--author-url` | значение необязательно | [--author "…"] [--author-url …] [--title "…"] [--not-editorial] |
| `--avif` | значение необязательно | [--avif auto\|on\|off]             AVIF рядом с WebP (auto — если быстро) |
| `--caption` | значение необязательно | node media.mjs pick <папка поиска> <N> --seen "<что на кадре>" --caption "<подпись/роль>" |
| `--contrast` | значение необязательно | [--look none\|duotone:#RRGGBB,#RRGGBB\|mono] [--contrast 0..1] [--grain 0..0.06] |
| `--crop-mobile` | значение необязательно | [--crop-mobile 4:5]              отдельный кадр для телефона |
| `--dest` | значение необязательно | --dest --look --contrast --grain --crop-mobile --ratio --src-prefix --avif |
| `--dur` | значение необязательно | [--start <с>] [--dur <с>]        видео: откуда и сколько резать петлю (по умолчанию 8 с) |
| `--fade` | значение необязательно | [--fade <с>]                     видео: длина наплыва на стыке (по умолчанию 1 с) |
| `--file-url` | значение необязательно | [--file-url <адрес файла у источника>]  для локального файла: откуда он (в credits.json) |
| `--focus` | значение необязательно | [--focus attention\|entropy\|centre\|north\|south\|east\|west\|…]  куда тянуть обрезку |
| `--format` | значение необязательно | [--format jpg\|webp\|avif]         по умолчанию — по расширению --name, иначе jpg |
| `--frames` | значение необязательно | [--frames 8\|all]                 видео Commons: у скольких роликов собрать кадры из |
| `--grain` | значение необязательно | [--look none\|duotone:#RRGGBB,#RRGGBB\|mono] [--contrast 0..1] [--grain 0..0.06] |
| `--kind` | значение необязательно | node media.mjs search "<запрос по-английски>" --kind photo\|video |
| `--license` | значение необязательно | node media.mjs import <url страницы> [<url или путь файла>] --license <id> |
| `--look` | значение необязательно | [--look none\|duotone:#RRGGBB,#RRGGBB\|mono] [--contrast 0..1] [--grain 0..0.06] |
| `--map` | значение необязательно | node media.mjs audit <карта фото.json> (или --map <карта>) [--root <папка сайта>] [--sources pexels,unsplash] |
| `--md` | значение необязательно | node media.mjs credits <папка картинок сайта> [--md [<файл или папка>]] |
| `--min` | значение необязательно | [--min <px по длинной стороне>] |
| `--n` | значение необязательно | [--n 24]                         сколько кадров на лист (до 60) |
| `--name` | значение необязательно | [--role hero\|section\|card\|loop] [--name <имя файлов>] [--dest <папка картинок сайта>] |
| `--need` | значение необязательно | [--need <px>]                    ширина кадра, нужная сайту (с учётом плотности экрана): |
| `--orient` | значение необязательно | [--orient landscape\|portrait\|square\|any]  по умолчанию landscape для ролей hero и card и |
| `--out` | значение необязательно | [--out <папка>] [--run <slug, url сайта или полный путь папки прогона>] |
| `--profile` | значение необязательно | [--profile photo\|art]            photo — заведения, магазины, школы (по умолчанию); |
| `--quality` | значение необязательно | [--quality N]                    1–100 (по умолчанию jpg 80, webp 76, avif 52) |
| `--ratio` | значение необязательно | [--ratio 16:9]                   обрезать основной кадр |
| `--role` | значение необязательно | [--role hero\|section\|card\|loop]  под что кадр: от роли зависит нужный размер |
| `--root` | значение необязательно | --root — откуда считать пути вида /assets/img/…: по умолчанию ищется сам (папка карты, |
| `--run` | значение необязательно | [--out <папка>] [--run <slug, url сайта или полный путь папки прогона>] |
| `--seen` | значение необязательно | --seen … --caption … [и все флаги обработки pick: --ok-flags --role --name |
| `--size` | значение необязательно | обрезка cover ровно под WxH (1000x700), по --focus |
| `--sources` | значение необязательно | [--sources a,b,...]              свой список и порядок источников |
| `--src-prefix` | значение необязательно | [--src-prefix img/]              префикс путей в разметке (по умолчанию имя --dest) |
| `--start` | значение необязательно | --start --dur --need --focus; точный режим --size --thumb --thumb-dir --format --quality] |
| `--thumb` | значение необязательно | (--size, --thumb, --ratio, --crop-mobile); по умолчанию attention |
| `--thumb-dir` | значение необязательно | [--thumb-dir thumb]              папка превью внутри --dest (по умолчанию thumb) |
| `--title` | значение необязательно | [--author "…"] [--author-url …] [--title "…"] [--not-editorial] |

Переменные окружения: `MEDIA_VIDEO_MODULE`, `SITE_REWORK_RUNS`, `UNSPLASH_ACCESS_KEY`, `UNSPLASH_APP_NAME`.

## mirror.mjs

```
node mirror.mjs <url> [--out папка] [--pages /,/about] [--no-scripts] [--viewport desktop]
node mirror.mjs --help
```

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--no-scripts` | переключатель | отрисованный DOM после прокрутки (ленивые блоки подгружены), скрипты, |
| `--out` | со значением | папка прогона; по умолчанию ~/.claude/site-rework/runs/<slug> |
| `--pages` | со значением | ещё страницы того же сайта через запятую; адрес из <url> снимается всегда. |
| `--viewport` | со значением | --viewport <экран> каким экраном открывать: desktop (по умолчанию), mobile, 390x844@3 … |

Коды выхода: 0 — все страницы сняты; 1 — ошибка в аргументах или хотя бы одна страница не снялась (остальные сохранены). Вердикты в консоли: OK / WARN / FAIL.

## motion.mjs

```
node motion.mjs <адрес> [<адрес>…] [--pages "тип=путь,…"] [--viewport desktop[,mobile]]
node motion.mjs compare <motion.json донора> <адрес нашего сайта | наш motion.json> [ещё пары…]
node motion.mjs selftest [--no-browser]   проверка распознавания на стенде fixtures/motion/index.html и сверки
node motion.mjs --help
node motion.mjs https://donor.com --pages "home=/,product=/sets/x,collection=/c/y" --viewport desktop,mobile --tag donor
```

Команды: `compare`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--debug` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-browser` | переключатель | node motion.mjs selftest [--no-browser]   проверка распознавания на стенде fixtures/motion/index.html и сверки |
| `--no-clicks` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-crops` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-hover` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-mouse` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-scroll` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--clicks` | значение необязательно | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--decisions` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--decisions <файл>] [--viewport desktop[,mobile]] |
| `--hover` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14] |
| `--out` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14] |
| `--pages` | значение необязательно | --pages (https://site.ru и "home=/") — одна страница, имя с типом: <--tag>-home; разные страницы с одним именем — |
| `--tag` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14] |
| `--time` | значение необязательно | --time — базовое окно «время» (мс); медленную петлю (период длиннее окна: покачивание Framer 7–13 с) окно |
| `--time-cap` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14] |
| `--viewport` | значение необязательно | node motion.mjs <адрес> [<адрес>…] [--pages "тип=путь,…"] [--viewport desktop[,mobile]] |

Коды выхода: 0 — снято (и compare без FAIL); 1 — FAIL сверки, неверные аргументы, не открылась страница.

Переменные окружения: `SITE_REWORK_DISMISS`.

## perf.mjs

```
node perf.mjs <url> [--viewport mobile] [--out папка] [--tag имя]
node perf.mjs --selftest [--out папка]
node perf.mjs --help   (или --h, -h)
```

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--overlay-only` | переключатель | только цена слоя, без замера загрузки (быстро: сеть не замедляется); итог — |
| `--selftest` | переключатель | стенды fixtures/perf на своём сервере 127.0.0.1 без сжатия (desktop, сеть none, процессор ×1): |
| `--strict` | переключатель | код выхода 1 при итоговом вердикте FAIL (для гейта); без флага — 0 при любом вердикте. |
| `--cpu` | со значением | во сколько раз замедлить процессор (по умолчанию 4 на телефоне и планшете, 1 на десктопе). |
| `--net` | со значением | сеть: fast3g, slow4g или none (по умолчанию fast3g на телефоне, none на десктопе). |
| `--out` | со значением | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/perf/<tag>.json. |
| `--rounds` | со значением | раундов для --overlay, от 5 до 20 (по умолчанию 5): меньше 5 и больше 20 — примечание |
| `--runs` | со значением | прогонов (1…9), каждый в свежем браузере с холодным кэшем; в таблицу — медиана и разброс. |
| `--tag` | со значением | имя файла итога (по умолчанию <экран>-<сеть>-cpu<N>). |
| `--viewport` | со значением | экран: пресет (desktop, laptop, tablet, mobile, mobile-s, android), запись ШxВ@плотность |
| `--viewports` | со значением | файлы). --viewports — то же самое (синоним). |
| `--overlay` | значение необязательно | ещё и цена полноэкранного слоя фактуры (зерно, вуаль): растровые задачи (RasterTask) и |

Коды выхода: 0 — замер сделан (вердикт в выводе и в JSON), 1 — неверные аргументы, ни один прогон не удался или, с --strict, итоговый вердикт FAIL (WARN — всё равно 0). Аргументы (адрес, экран, значения флагов) проверяются до создания папок и запуска браузера.

Переменные окружения: `SITE_REWORK_DISMISS`.

## recraft.mjs

```
node recraft.mjs doctor                                  ключ (есть/нет), баланс, модели и цены
node recraft.mjs gen "<промпт>" --for icon|illustration|pattern|background|texture|decor|mockup|photo
node recraft.mjs vectorize <файл> [--run …] --yes         растр → SVG ($0.01)
node recraft.mjs remove-bg <файл> [--run …] --yes         фон прозрачным ($0.01)
node recraft.mjs upscale <файл> [--creative] [--run …] --yes   чётче ($0.004) / дорисовать детали ($0.25)
node recraft.mjs take <черновик> --dest <сайт>/img --seen "<что на картинке>" --caption "<роль на сайте>" [--name имя]
node recraft.mjs selftest                                поддельный сервер: запросы, файлы, отказы, credits.json
node recraft.mjs --help
```

Команды: `doctor`, `gen`, `vectorize`, `remove-bg`, `upscale`, `take`, `selftest`, `price`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--creative` | переключатель | node recraft.mjs upscale <файл> [--creative] [--run …] --yes   чётче ($0.004) / дорисовать детали ($0.25) |
| `--demo` | переключатель | [--run <папка прогона>] [--out <папка черновиков>] [--demo] --yes |
| `--own` | переключатель | [--license-from <картинка сайта из credits.json> \| --own]   (для фона, векторизации, увеличения чужого кадра) |
| `--png` | переключатель | [--text] [--style "<стиль V3>"] [--style-id <uuid>] [--ref a.png,b.png] [--seed N] [--png] |
| `--text` | переключатель | [--text] [--style "<стиль V3>"] [--style-id <uuid>] [--ref a.png,b.png] [--seed N] [--png] |
| `--yes` | переключатель | Каждый запрос стоит денег со счёта API пользователя — без --yes скрипт только считает цену. |
| `--bg` | значение необязательно | [--model recraftv4_1_vector] [--n 1] [--size 1:1] [--colors "#6A4EE1,#111111"] [--bg "#FFFFFF"] |
| `--caption` | значение необязательно | node recraft.mjs take <черновик> --dest <сайт>/img --seen "<что на картинке>" --caption "<роль на сайте>" [--name имя] |
| `--colors` | значение необязательно | [--model recraftv4_1_vector] [--n 1] [--size 1:1] [--colors "#6A4EE1,#111111"] [--bg "#FFFFFF"] |
| `--dest` | значение необязательно | node recraft.mjs take <черновик> --dest <сайт>/img --seen "<что на картинке>" --caption "<роль на сайте>" [--name имя] |
| `--for` | значение необязательно | node recraft.mjs gen "<промпт>" --for icon\|illustration\|pattern\|background\|texture\|decor\|mockup\|photo |
| `--license-from` | значение необязательно | [--license-from <картинка сайта из credits.json> \| --own]   (для фона, векторизации, увеличения чужого кадра) |
| `--model` | значение необязательно | [--model recraftv4_1_vector] [--n 1] [--size 1:1] [--colors "#6A4EE1,#111111"] [--bg "#FFFFFF"] |
| `--n` | значение необязательно | [--model recraftv4_1_vector] [--n 1] [--size 1:1] [--colors "#6A4EE1,#111111"] [--bg "#FFFFFF"] |
| `--name` | значение необязательно | node recraft.mjs take <черновик> --dest <сайт>/img --seen "<что на картинке>" --caption "<роль на сайте>" [--name имя] |
| `--out` | значение необязательно | [--run <папка прогона>] [--out <папка черновиков>] [--demo] --yes |
| `--ref` | значение необязательно | [--text] [--style "<стиль V3>"] [--style-id <uuid>] [--ref a.png,b.png] [--seed N] [--png] |
| `--run` | значение необязательно | [--run <папка прогона>] [--out <папка черновиков>] [--demo] --yes |
| `--seed` | значение необязательно | [--text] [--style "<стиль V3>"] [--style-id <uuid>] [--ref a.png,b.png] [--seed N] [--png] |
| `--seen` | значение необязательно | node recraft.mjs take <черновик> --dest <сайт>/img --seen "<что на картинке>" --caption "<роль на сайте>" [--name имя] |
| `--size` | значение необязательно | [--model recraftv4_1_vector] [--n 1] [--size 1:1] [--colors "#6A4EE1,#111111"] [--bg "#FFFFFF"] |
| `--style` | значение необязательно | [--text] [--style "<стиль V3>"] [--style-id <uuid>] [--ref a.png,b.png] [--seed N] [--png] |
| `--style-id` | значение необязательно | [--text] [--style "<стиль V3>"] [--style-id <uuid>] [--ref a.png,b.png] [--seed N] [--png] |

Коды выхода: 0 — сделано; 1 — ошибка (сеть, API, аргументы); 2 — не сделано по правилу (нет --yes, нет ключа, нет или неизвестное назначение --for, не прошли ворота take).

Переменные окружения: `RECRAFT_API_BASE`, `RECRAFT_API_TOKEN`.

## requirements.mjs

```
node requirements.mjs <папка прогона> <команда> …
```

Команды: `ingest`, `add`, `change`, `status`, `link`, `unlink`, `review`, `plan`, `accept`, `ask`, `answer`, `assume`, `ack`, `direction`, `list`, `show`, `impact`, `conflicts`, `report`, `checks`, `check`, `md`, `selftest`.

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--force` | переключатель | [--note "<что это; у картинки и ссылки — слова пользователя о ней>"] [--supersedes S-001] [--force] |
| `--json` | переключатель | conflicts [R-007] [--strict] [--json]                    противоречия и подозрения (типы ниже) |
| `--open` | переключатель | list [--kind …] [--decision …] [--page …] [--open]     open — активные без задачи, без критерия или с needsReview |
| `--plan` | переключатель | report [--md <файл>] [--plan]                            раздел «Требования» для отчёта; --plan — требование → страница и |
| `--self` | переключатель | свой приоритет) — --self --why "…": редакция прежняя, доказательства не устаревают. |
| `--selftest` | переключатель | --selftest \| selftest                                  разбор и весь цикл команд на fixtures/requirements |
| `--stdin` | переключатель | ingest --file <путь> \| --text "<сообщение>" \| --stdin \| --url <ссылка> |
| `--strict` | переключатель | conflicts [R-007] [--strict] [--json]                    противоречия и подозрения (типы ниже) |
| `--accept` | со значением | [--loc "<где в источнике>"] [--ext FR-03] [--page …] [--block …] [--accept "<вид>: <что считается выполненным>"]… |
| `--add` | со значением | accept R-007 --add "<вид>: <текст>" [--marker R-007.c] [--viewport mobile] [--how "<команда>"] [--metric "LCP<=2000"] [--reason "…"] |
| `--area` | со значением | plan R-007[,R-008] "<задача>" [--priority P1] [--area room] |
| `--block` | со значением | add --from S-00N --take 18-25,27 [--kind …] [--priority …] [--page /,/room] [--block chat] [--to R-001] [--force] |
| `--by` | со значением | status R-007 active\|question\|deferred\|dropped\|superseded\|out [--by R-012] [--quote "<слова пользователя>"] [--source S-00N] [--why …] [--self] |
| `--decision` | со значением | list [--kind …] [--decision …] [--page …] [--open]     open — активные без задачи, без критерия или с needsReview |
| `--dismiss` | со значением | add --from S-00N --dismiss 1-5,17 --why "<почему не взято>" |
| `--drop` | со значением | accept R-007 --drop c |
| `--edit` | со значением | accept R-007 --edit a [--how …] [--metric …] [--viewport …] [--marker …] [--reason …] |
| `--evidence` | со значением | accept R-007 --evidence a <файл[#шаг]> [--note "что видно"]     явное доказательство (снимок для eye, протокол…) |
| `--ext` | со значением | [--loc "<где в источнике>"] [--ext FR-03] [--page …] [--block …] [--accept "<вид>: <что считается выполненным>"]… |
| `--file` | со значением | ingest --file <путь> \| --text "<сообщение>" \| --stdin \| --url <ссылка> |
| `--from` | со значением | add --from S-00N --take 18-25,27 [--kind …] [--priority …] [--page /,/room] [--block chat] [--to R-001] [--force] |
| `--how` | со значением | accept R-007 --add "<вид>: <текст>" [--marker R-007.c] [--viewport mobile] [--how "<команда>"] [--metric "LCP<=2000"] [--reason "…"] |
| `--journal` | со значением | checks [--only R-001,R-007] [--url <адрес>] [--sh <файл>] [--journal <файл>] |
| `--kind` | со значением | [--kind doc\|chat\|voice\|image\|link\|brief] [--said "2026-09-28 14:05"] [--original <аудио\|pdf>] |
| `--loc` | со значением | [--loc "<где в источнике>"] [--ext FR-03] [--page …] [--block …] [--accept "<вид>: <что считается выполненным>"]… |
| `--marker` | со значением | accept R-007 --add "<вид>: <текст>" [--marker R-007.c] [--viewport mobile] [--how "<команда>"] [--metric "LCP<=2000"] [--reason "…"] |
| `--md` | со значением | report [--md <файл>] [--plan]                            раздел «Требования» для отчёта; --plan — требование → страница и |
| `--metric` | со значением | accept R-007 --add "<вид>: <текст>" [--marker R-007.c] [--viewport mobile] [--how "<команда>"] [--metric "LCP<=2000"] [--reason "…"] |
| `--note` | со значением | [--note "<что это; у картинки и ссылки — слова пользователя о ней>"] [--supersedes S-001] [--force] |
| `--only` | со значением | checks [--only R-001,R-007] [--url <адрес>] [--sh <файл>] [--journal <файл>] |
| `--option` | со значением | ask R-004,R-005 "<вопрос>" [--option "…"]… |
| `--original` | со значением | [--kind doc\|chat\|voice\|image\|link\|brief] [--said "2026-09-28 14:05"] [--original <аудио\|pdf>] |
| `--page` | со значением | add --from S-00N --take 18-25,27 [--kind …] [--priority …] [--page /,/room] [--block chat] [--to R-001] [--force] |
| `--priority` | со значением | add --from S-00N --take 18-25,27 [--kind …] [--priority …] [--page /,/room] [--block chat] [--to R-001] [--force] |
| `--quote` | со значением | add "<атомарное требование>" --source S-00N --quote "<дословно>" --kind <вид> [--priority must] |
| `--reason` | со значением | accept R-007 --add "<вид>: <текст>" [--marker R-007.c] [--viewport mobile] [--how "<команда>"] [--metric "LCP<=2000"] [--reason "…"] |
| `--said` | со значением | [--kind doc\|chat\|voice\|image\|link\|brief] [--said "2026-09-28 14:05"] [--original <аудио\|pdf>] |
| `--sh` | со значением | checks [--only R-001,R-007] [--url <адрес>] [--sh <файл>] [--journal <файл>] |
| `--source` | со значением | add "<атомарное требование>" --source S-00N --quote "<дословно>" --kind <вид> [--priority must] |
| `--supersedes` | со значением | [--note "<что это; у картинки и ссылки — слова пользователя о ней>"] [--supersedes S-001] [--force] |
| `--take` | со значением | add --from S-00N --take 18-25,27 [--kind …] [--priority …] [--page /,/room] [--block chat] [--to R-001] [--force] |
| `--text` | со значением | ingest --file <путь> \| --text "<сообщение>" \| --stdin \| --url <ссылка> |
| `--to` | со значением | add --from S-00N --take 18-25,27 [--kind …] [--priority …] [--page /,/room] [--block chat] [--to R-001] [--force] |
| `--url` | со значением | ingest --file <путь> \| --text "<сообщение>" \| --stdin \| --url <ссылка> |
| `--viewport` | со значением | accept R-007 --add "<вид>: <текст>" [--marker R-007.c] [--viewport mobile] [--how "<команда>"] [--metric "LCP<=2000"] [--reason "…"] |
| `--why` | со значением | add --from S-00N --dismiss 1-5,17 --why "<почему не взято>" |
| `--with` | со значением | ack R-007 <тип> [--with R-012] --why "…"                известный конфликт с причиной — conflicts его не повторяет |

Коды выхода: 0 — готово; 1 — отказ (запись не прошла, check нашёл FAIL, conflicts --strict что-то нашёл, selftest не прошёл); 2 — ошибка аргументов.

## runtime.mjs

```
node runtime.mjs <url> [--viewport mobile] [--out папка] [--tag имя] [--browser firefox]
node runtime.mjs [шаги и настройки] -- <url>      «--» — конец флагов, дальше только адрес
```

Неизвестный флаг — ошибка, код 1 (свой разбор до parseArgs).

| флаг | вид | из справки |
|---|---|---|
| `--assert` | шаг | --assert "js"         FAIL, если результат ложный или Promise отклонён |
| `--canvas` | шаг | холсты: рисует ли (снимок с холстом и без), меняется ли кадр, |
| `--click` | шаг | --click "sel"         кликнуть: эффект — изменения DOM (MutationObserver), адрес, |
| `--css` | шаг | объявления CSS, которые браузер выбросил: файл:строка |
| `--edit` | шаг | --edit "sel"          поле с маской: набор, Backspace до конца, правка в середине, |
| `--emulate-motion` | шаг | переключить prefers-reduced-motion на открытой странице посреди шагов |
| `--eval` | шаг | --eval "js"           выполнить выражение (можно Promise) и записать результат; |
| `--expect` | шаг | сразу за ним --expect "значение" — FAIL, если не совпало. |
| `--fullpage` | шаг | снимок всей страницы <tag>-full.png (второй — <tag>-full-2.png): масштаб — --full-scale, |
| `--hover` | шаг | --hover="--x". Флаги без значения тоже пишутся через «=»: =0, false, no, off, нет — |
| `--hover-all` | шаг | каждое правило :hover из CSS: меняет ли объявленное; мёртвое — |
| `--key` | шаг | нажать клавишу: где фокус, значение и курсор поля |
| `--motion` | шаг | анимации: идут, бесконечные, закончились и держат свойство. |
| `--nav` | шаг | меню: подсвеченный пункт ведёт на раздел, который на экране |
| `--resize` | шаг | --resize 1152         сменить ширину окна (или ШxВ — 834x1112, 834X1112, 834×1112; |
| `--scroll` | шаг | прокрутить до конца: появления, закреплённые, переполнение |
| `--select` | шаг | --select и --resize эта проверка не повторяется. |
| `--shot` | шаг | снимок экрана |
| `--type` | шаг | --type "sel=текст"    ввести текст и проверить, что он в поле (tel: 8… = +7…); |
| `--video` | шаг | видео: poster, muted/playsinline, играет ли, пауза вне экрана; |
| `--wait` | шаг | --wait 800            подождать столько миллисекунд (число ≥ 0, «0» — не ждать; |
| `--keep-consent` | переключатель | не закрывать окно согласия cookie и ворота-заставку («ENTER», «Мне есть 18») — |
| `--no-fail` | переключатель | --no-fail=0 — провалы снова дают код 1. Шаг (--scroll, --css, --canvas…): --scroll=0 |
| `--no-js` | переключатель | страница без JavaScript (Chrome и Edge, выключается до перехода): проверка прогрессивного улучшения. |
| `--reduced-motion` | переключатель | [--reduced-motion] [--scheme dark] [--cpu 4] [--no-fail] [--init "js"] [--keep-consent] [--no-js] |
| `--selftest` | переключатель | прогнать стенды fixtures/runtime/*.html (форма, наведение, прокрутка, |
| `--browser` | со значением | --browser, --no-js и --no-js=0) — ошибка (код 2); --wait — не больше 600000 мс. |
| `--cpu` | со значением | --cpu 4               процессор в N раз медленнее (только Chrome и Edge) |
| `--expect-status` | со значением | --expect-status 404   ждать такой ответ самого документа (страница ошибки открыта нарочно): |
| `--full-scale` | со значением | --full-scale 1\|2\|3\|4\|dpr  масштаб снимка --fullpage (как у shots.mjs): 1 — по умолчанию, dpr — как у экрана; |
| `--init` | со значением | --init "js"           код до всех скриптов страницы (например, PerformanceObserver) |
| `--out` | со значением | --out папка, --tag имя  папка прогона и имя протокола |
| `--scheme` | со значением | цветовая схема (по умолчанию light) |
| `--tag` | со значением | node runtime.mjs <url> [--viewport mobile] [--out папка] [--tag имя] [--browser firefox] |
| `--viewport` | со значением | desktop \| laptop \| tablet \| mobile \| mobile-s (320×568@2) \| android (360×800@3) |
| `--viewports` | со значением | --viewports — то же самое. Экран один за запуск: список «mobile,desktop» — |

Переменные окружения: `RW_CSS_NO_BODY`, `RW_EDIT_PLATFORM`, `RW_SELFTEST_ONLY`.

## security.mjs

```
node security.mjs <url> [--out папка] [--tag имя] [--admin /admin,/api/admin/x] [--repo папка] [--strict]
node security.mjs --repo папка [--out папка] [--tag имя]        только репозиторий, без сайта
node security.mjs --selftest [--out папка]
node security.mjs --help   (или -h)
```

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--selftest` | переключатель | стенды fixtures/security (сайт с нарочными дырами и сайт без дыр на своём сервере, плюс |
| `--strict` | переключатель | --strict код выхода 1 при итоговом вердикте FAIL (для гейта); без флага — 0 при любом вердикте. |
| `--admin` | со значением | пути админки и её API, которые надо запросить без входа, через запятую: --admin /admin,/api/admin/venues. |
| `--out` | со значением | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/security/<tag>.json. |
| `--repo` | со значением | папка git-репозитория: секреты в отслеживаемых файлах и в истории, .env в .gitignore и не в git. |
| `--tag` | со значением | имя файла итога (по умолчанию по адресу сайта, для --repo без сайта — repo). |

Коды выхода: 0 — проверка сделана (вердикт в выводе и в JSON); 1 — неверные аргументы или, с --strict, вердикт FAIL. Аргументы проверяются до сети и файлов.

Переменные окружения: `KEY`, `RW_SEC_NO_GITLEAKS`, `SITE_REWORK_RUNS`.

## serve.mjs

```
node serve.mjs <папка> [--port 4173] [--host 127.0.0.1] [--proxy https://original.site] [--no-compress]
node serve.mjs --help
```

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--no-compress` | переключатель | отдавать как есть, без сжатия (как до 24.09.2026) — например, чтобы увидеть |
| `--host` | со значением | на каком адресе слушать. По умолчанию только эта машина (127.0.0.1 и ::1): |
| `--port` | со значением | порт, по умолчанию 4173. |
| `--proxy` | со значением | адрес оригинала (http или https) — лучше адрес самой страницы зеркала. Всё, чего |

## shots.mjs

```
node shots.mjs <url> [--out папка] [--tag before|after] [--viewports desktop,mobile]
```

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--light` | переключатель | лёгкий режим для взгляда по ходу работы: первый экран и одна вся страница на экран, без |
| `--no-freeze` | переключатель | не останавливать движение (если нужно поймать именно фазу анимации). |
| `--sheet` | переключатель | ещё и лист миниатюр снимков окна (<страница>-<экран>-scroll-sheet.png). |
| `--strict` | переключатель | код выхода 1, если есть FAIL (состояние не сбрасывается, ответ документа от 400 или сбой съёмки). |
| `--with-320` | переключатель | добавить к выбранным экранам mobile-s (320 px): на нём вылезают закреплённые панели |
| `--browser` | значение необязательно | в каком браузере снимать: chrome (по умолчанию), firefox, edge (ff, msedge — тоже). |
| `--expect-status` | значение необязательно | код ответа документа, который ждём (--expect-status 404 — страница ошибки открыта нарочно). |
| `--full` | значение необязательно | --full-mode   (или --full) как снимать всю страницу: |
| `--full-mode` | значение необязательно | (или --full) как снимать всю страницу: |
| `--full-scale` | значение необязательно | масштаб *-full.png — один на экран для всех страниц: 1 (по умолчанию) — пиксель снимка на |
| `--out` | значение необязательно | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>); снимки — в <out>/<tag>/. |
| `--pages` | значение необязательно | страницы через запятую. Путь с ведущим «/» — от корня ХОСТА, как в браузере («/about» → |
| `--return` | значение необязательно | как возвращаться наверх перед сравнением первого экрана: |
| `--scheme` | значение необязательно | light \| dark — prefers-color-scheme. |
| `--segments` | значение необязательно | снимки окна по всей высоте: auto (по умолчанию) — без дыр: соседние отстоят не больше чем на |
| `--shot-pause` | значение необязательно | пауза перед каждым снимком окна, мс (по умолчанию 1200: ленивое и появления успевают). |
| `--tag` | значение необязательно | подпапка снимков (before \| after \| любое имя), по умолчанию before (не в Chrome — |
| `--viewport` | значение необязательно | снимки tablet — до 15,6 МБ; нужен планшет — --viewports desktop,tablet,mobile). --viewport — |
| `--viewports` | значение необязательно | экраны через запятую: пресеты desktop, laptop, tablet, mobile, mobile-s (320×568@2), |

Коды выхода: 0 — съёмка сделана (вердикт в выводе и в shots.json, поле verdict); 1 — нет адреса или он не http(s):// и не file:///, неверное значение флага (экран, --full-mode, --return, --scheme не light и не dark, --browser не chrome, firefox или edge, --segments не auto и не число от 0, --shot-pause не число от 0, --full-scale не 1–4 и не dpr, флаг без значения, неизвестный флаг — с подсказкой ближайшего),

Переменные окружения: `SITE_REWORK_DISMISS`.

## skill-audit.mjs

```
node skill-audit.mjs audit <папка | файл.zip | адрес GitHub> [--ref ветка|тег|коммит] [--skill имя] [--exclude путь,путь] [--out файл.json|папка] [--max-mb 200] [--strict]
node skill-audit.mjs install <источник> --skill <имя|путь> [--yes] [--target папка] [--exclude путь,путь] [--ref …] [--out …] [--max-mb …]
node skill-audit.mjs --selftest [--out папка]
node skill-audit.mjs --help   (или -h)
```

Команды: `audit`, `install`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--selftest` | переключатель | --selftest стенды fixtures/skill-audit без сети: чистый навык, опасный, широкий без лицензии, |
| `--strict` | переключатель | код выхода 1 при вердикте FAIL (audit). |
| `--yes` | переключатель | install: на самом деле скопировать; без него — только план. |
| `--exclude` | значение необязательно | audit — не проверять, install — не брать эти пути (через запятую; папка — целиком, * — любые знаки). |
| `--max-mb` | значение необязательно | предел скачивания и распаковки, МБ (по умолчанию 200). |
| `--out` | значение необязательно | протокол JSON: файл .json или папка (skill-audit-<источник>.json); по умолчанию |
| `--ref` | значение необязательно | ветка, тег или коммит для адреса GitHub (по умолчанию из адреса, иначе HEAD). |
| `--skill` | значение необязательно | имя навыка (name из frontmatter или имя папки) или путь его папки внутри источника; |
| `--target` | значение необязательно | install: папка навыков (по умолчанию ~/.claude/skills; для проверок — временная). |

Переменные окружения: `CLAUDE_CONFIG_DIR`.

## state.mjs

```
node state.mjs <папка прогона> init <url|-> "<запрос>" --site <папка сайта> --mode rework|mirror|donor|new [--donor <адрес донора>] [--force]
node state.mjs <папка> meta [--site <папка сайта>] [--mode rework|mirror|donor|new] [--url <адрес>] [--donor <адрес>|none] [--site-ignore "data,*.json"]
node state.mjs <папка> add "<задача>" [--priority P2] [--area hero|mobile|3d|content|motion|...]
node state.mjs <папка> set <id> impl=DONE runtime=VERIFIED --evidence runtime/desktop.json#5
node state.mjs <папка> set <id> visual=VERIFIED --evidence after/home-mobile-first.png mobile=NA --note "почему"
node state.mjs <папка> set <id>[,<id>…] impl=DOING priority=P1
node state.mjs <папка> stage <этап> done|active|todo|skipped
node state.mjs <папка> show [--strict] [--json]
```

Команды: `init`, `meta`, `add`, `set`, `stage`, `show`, `probe`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--force` | переключатель | init поверх существующего журнала; старый сохраняется рядом. |
| `--json` | переключатель | (show) журнал с состоянием каждой клетки одним JSON: url, режим, папка |
| `--selftest` | переключатель | журнал во временной папке: режим rework --donor (этапы, блок «Сверки», WARN |
| `--strict` | переключатель | (show) код выхода 1, если итог не OK. |
| `--area` | со значением | node state.mjs <папка> add "<задача>" [--priority P2] [--area hero\|mobile\|3d\|content\|motion\|...] |
| `--check` | со значением | --check, --task    (probe) какой проверкой мерить доказательство и для какой задачи |
| `--donor` | со значением | (init, meta) адрес донора, в языке которого переделывается свой сайт: только |
| `--evidence` | со значением | доказательство для всех VERIFIED этого вызова. |
| `--evidence-mobile` | со значением | --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf |
| `--evidence-perf` | со значением | --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf |
| `--evidence-runtime` | со значением | --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf |
| `--evidence-visual` | со значением | --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf |
| `--mode` | со значением | --mode donor с папкой сайта вне папки прогона — WARN: «новый сайт по донору» собирается в |
| `--note` | со значением | --note "…"         заметка к задаче; для NA — обязательная причина. Без текста — ошибка. |
| `--priority` | со значением | --priority, --area (add) приоритет P0…P5 и область задачи. |
| `--site` | со значением | папка с файлами сайта: исходники (rework), зеркало <прогон>/mirror |
| `--site-ignore` | со значением | что ещё не считать правкой сайта: имена папок и файлов или маски |
| `--task` | со значением | node state.mjs <папка> probe <файл[#шаг]>… --check runtime\|visual\|mobile\|perf [--task <id>] [--json] |
| `--url` | со значением | (meta) адрес сайта: http://, https:// или file:// |

Коды выхода: 0 — готово (и после --help); 1 — отказ (ошибка в аргументах, доказательство не годится, нет журнала) или show --strict с итогом не OK.

## surface-tile.mjs

```
node surface-tile.mjs --out папка [--kind paper|pulp|stone|canvas] [--size 1024] [--seed 11] [--name имя]
node surface-tile.mjs --check файл.webp|png|jpg [--mean M] [--sd S] [--like texture.json] [--json файл]
node surface-tile.mjs selftest      самопроверка (то же: --selftest)
node surface-tile.mjs --help | -h
node surface-tile.mjs               без аргументов — эта справка и код 1, ничего не записано
```

Команды: `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--selftest` | переключатель | самопроверка: детерминизм, бесшовность, попадание в яркость и σ, все виды, шаг переплетения и |
| `--sheet` | переключатель | лист 2×2 с усиленным контрастом (<имя>-sheet.jpg) и крест стыков 1:1 (<имя>-seam.jpg) — для глаз |
| `--check` | со значением | проверить готовый файл: шов по краям числом, яркость ± σ, lag1, вес, узнаёт ли его texture.mjs, |
| `--dir` | со значением | направление волокон зернистой бумаги, градусов (pulp; 0 — вдоль ширины, 90 — вдоль высоты; |
| `--formats` | со значением | что писать: webp, png (по умолчанию webp; png без потерь и в разы тяжелее) |
| `--json` | со значением | записать итог в файл |
| `--kind` | со значением | по умолчанию — вид из замера --like, без него paper; |
| `--like` | со значением | texture.json замера texture.mjs: вид, яркость и σ плитки донора, период показа, шаг переплетения |
| `--mean` | со значением | средняя яркость плитки 0…255 (248); главнее --like |
| `--name` | со значением | имя файлов без расширения (surface-<kind>-<size>) |
| `--out` | со значением | папка для файлов (по умолчанию текущая — если задан хоть один другой флаг) |
| `--quality` | со значением | качество WebP 1…100 (86, само поднимается до 96, пока шов больше 1.4; заданное явно не меняется); |
| `--sd` | со значением | разброс яркости σ, уровней (2.5); меряется по записанному файлу; главнее --like |
| `--seed` | со значением | зерно генератора (11): тот же seed — побайтно тот же файл |
| `--size` | со значением | сторона плитки, px (не меньше 128); по умолчанию — период показа из замера --like, без него 1024 |
| `--thread` | со значением | шаг переплетения ткани, px (canvas; 3…128, по умолчанию 32 — нить ≈ 16 px): то число, которое |
| `--veins` | со значением | число прожилок-стволов: paper 22, stone 12 на 1024 px; у pulp — число ворсинок (240); 0 — без них; |

Коды выхода: 0 — готово (при любых WARN); 1 — FAIL, неверные аргументы или запуск без аргументов.

## svg3d.mjs

```
node svg3d.mjs doctor [--json файл]                       что установлено и работает, чем грозит отсутствие
node svg3d.mjs zdog <сцена.mjs> [--out файл.svg|папка] [--palette "ink=#16301F,moss=#5E7A33"] [--css-vars]
node svg3d.mjs three <сцена.mjs> [--out …] [--palette …] [--rotate x,y,z] [--size …] [--pad 8] [--frames N]
node svg3d.mjs cad <файл.py | gear | crate | nut> [--out …] [--view iso,front] [--param teeth=16,width=10]
node svg3d.mjs trace <картинка> [--out …] [--colors 6] [--simplify 4] [--mono] [--engine vtracer|potrace]
node svg3d.mjs rough <svg> [--out …] [--seed 7] [--roughness 1] [--bowing 1] [--fill-style hachure] [--ink "#16301F"] [--paper "#E9EEDD"] [--single-stroke]
node svg3d.mjs icon <набор:имя>… --out <папка сайта> [--caption "роль на сайте"] [--stroke-width 1.5] [--allow-attribution]
node svg3d.mjs icon --search <слово> [--set lucide,tabler] [--limit 24] [--preview]
```

Команды: `doctor`, `zdog`, `three`, `cad`, `trace`, `rough`, `icon`, `scatter`, `optimize`, `preview`, `sheet`, `blender`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--allow-attribution` | переключатель | взять иконку из набора CC BY / CC BY-SA: в credits.json — обязательная подпись, которую |
| `--allow-raster` | переключатель | --allow-raster не убирать вложенные картинки <image> data:image (внешние ссылки убираются всегда) |
| `--css-vars` | переключатель | цвета палитры — CSS-переменными с запасным значением (переменная «c-moss» с запасным #5e7a33): |
| `--draw` | переключатель | готово к прорисовке линией (templates/decor-kit, .dk-draw): каждому контуру pathLength="1", |
| `--drop-bg` | переключатель | убрать фон картинки (цвет её четырёх углов) — для готового рендера на ровном фоне |
| `--fit` | переключатель | Zdog: обрезать поле по содержимому (с обводкой) и отступить --pad |
| `--keep` | переключатель | не удалять временную папку с результатами (путь печатается) |
| `--keep-anim` | переключатель | не убирать SMIL-анимации (они не слушают «меньше движения» — по умолчанию убираются) |
| `--keep-size` | переключатель | оставить width и height у корня (по умолчанию убираются: размер задаёт вёрстка) |
| `--mono` | переключатель | одним цветом --color; порог яркости — --threshold |
| `--no-cull` | переключатель | zdog: не убирать фигуры, закрытые целиком (по умолчанию убираются: задние грани коробок, |
| `--no-merge` | переключатель | three: не склеивать грани одной заливки (для разбора «что не так») |
| `--no-sort` | переключатель | three: не исправлять порядок граней (оставить «по центру грани», как у SVGRenderer) |
| `--single-stroke` | переключатель | одна линия контура вместо двойной: файл вдвое легче, вид суше (для чертежей cad) |
| `--sprite` | переключатель | вместо отдельных кадров — одна лента кадров имя-spriteN.svg (для steps() и background-position) |
| `--area` | со значением | full — по всему полю \| edges — у левого и правого краёв, середина свободна под текст \| |
| `--axis` | со значением | ось оборота кадров: x \| y \| z (y) |
| `--band` | со значением | ширина полосы для --area, доля поля: у edges — 0.18 с каждой стороны, у left и right — 0.45 |
| `--bg` | со значением | цвет фона (#ffffff) |
| `--bowing` | со значением | изгиб прямых (1) |
| `--budget` | со значением | свой бюджет веса в КБ вместо табличного |
| `--caption` | со значением | роль иконок на сайте — в credits.json (по умолчанию «иконка») |
| `--cell` | со значением | сторона ячейки листа, px (220) |
| `--color` | со значением | цвет линий; по умолчанию currentColor — рисунок красится цветом текста блока. |
| `--colors` | со значением | число цветов (6): картинка сначала сводится к палитре — пятна ровные |
| `--cols` | со значением | колонок на листе (4) |
| `--count` | со значением | сколько предметов (14) |
| `--engine` | со значением | vtracer (по умолчанию) \| potrace (только с --mono; по умолчанию для --mono, если установлен) |
| `--fill-style` | со значением | заливка: hachure — штриховка \| solid \| zigzag \| cross-hatch \| dots \| none |
| `--for` | со значением | для чего рисунок — бюджет веса и узлов: icon (4 КБ, 40 узлов) \| decor (15 КБ, 200) \| |
| `--frames` | со значением | N кадров полного оборота вокруг --axis: файлы имя-01.svg … (общее поле — предмет не «прыгает») |
| `--hachure-gap` | со значением | шаг штриховки в единицах рисунка (по умолчанию — 1/60 его размера) |
| `--hidden` | со значением | скрытые линии: dashed — пунктир (по умолчанию) \| faint — бледные сплошные \| none — не рисовать |
| `--id-prefix` | со значением | приставка id и классов внутри SVG (по умолчанию — из имени файла): несколько рисунков, |
| `--ink` | со значением | цвет контура у всех фигур (иначе — своя обводка фигуры, а без неё — цвет заливки) |
| `--item` | со значением | средний размер предмета, px (120) |
| `--json` | со значением | записать итог (файлы, вес, узлы, предупреждения) в файл |
| `--label` | со значением | рисунок со смыслом: role="img" и aria-label="…"; без флага — декор: aria-hidden="true" и focusable="false" |
| `--limit` | со значением | сколько показать (24) |
| `--max-size` | со значением | наибольшая сторона картинки перед трассировкой, px (1024) |
| `--opacity` | со значением | прозрачность всей россыпи 0…1 (1) |
| `--out` | со значением | файл .svg (.png у preview и sheet) или папка; по умолчанию — текущая папка, имя — по сцене |
| `--pad` | со значением | отступ от края, единицы поля (zdog --fit: 4; three: 8 — камера подгоняется сама) |
| `--palette` | со значением | цвета по именам: "ink=#16301F,moss=#5E7A33" — подменяют палитру сцены (export const palette); |
| `--paper` | со значением | цвет фона страницы — подложкой под каждую фигуру: штриховка просвечивает, и у объёмного рисунка |
| `--param` | со значением | параметры модели: "teeth=16,width=10" — встроенным фигурам и словарём params в свой сценарий |
| `--precision` | со значением | знаков после запятой в координатах (zdog — 2; three, cad, trace и rough — 1) |
| `--rotate` | со значением | поворот сцены, градусы: x,y,z (прибавляется к повороту из сцены) |
| `--roughness` | со значением | дрожание линии (1; 0.5 — аккуратнее, 2 — небрежнее) |
| `--scale` | со значением | разброс размера: "0.6,1.15" |
| `--seam` | со значением | three: обводка цветом заливки, закрывает волосяные щели между гранями, px экрана (1 — по полпикселя |
| `--search` | со значением | слово по-английски → список «набор:имя» с лицензиями; с --preview — лист найденного глазами |
| `--seed` | со значением | зерно случайности (7): тот же seed — побайтно тот же файл; у scatter — раскладка |
| `--set` | со значением | искать только в этих наборах: lucide,tabler,ph |
| `--simplify` | со значением | 0…10 — насколько грубо: мелкие пятна выбрасываются, кривые короче (4) |
| `--size` | со значением | поле рисунка: 240 или 320x200 (по умолчанию — export const view = { size } сцены) |
| `--stroke` | со значением | толщина видимой линии, px при ширине --size (1.2); скрытые и плавные переходы — ×0.75 |
| `--stroke-width` | со значением | --stroke-width толщина линии; у icon — заменить толщину линии контурной иконки (единая линия на сайте) |
| `--threshold` | со значением | порог яркости 0…255 для --mono (128) |
| `--tilt` | со значением | наибольший наклон, градусы (24) |
| `--tones` | со значением | three: свести оттенки каждого материала к N ступеням (плакатный вид, меньше узлов); 0 — как есть |
| `--var-prefix` | со значением | приставка имён переменных (c-: цвет moss → переменная c-moss) |
| `--view` | со значением | вид или несколько через запятую — в ряд, в одном масштабе: iso, iso-left, front, back, right, left, |
| `--width` | со значением | ширина превью, px (480) |
| `--zoom` | со значением | увеличение Zdog (1): поле то же, предмет крупнее |
| `--preview` | значение необязательно | рядом PNG-превью на фоне: --preview "#E9EEDD" (без цвета — белый); у кадров — лист всех кадров |

Коды выхода: 0 — сделано (и при WARN); 1 — ошибка (аргументы, сцена, FAIL); 2 — не сделано по правилу или нет движка (нет Blender или CadQuery, лицензия иконки не подходит).

## taste.mjs

```
node taste.mjs add --block form --verdict rejected --by user --rule form-kit \
node taste.mjs add --block form --verdict rejected --by self --rule form-kit --run <прогон> --why "<почему отсеял>"
node taste.mjs brief [--run <прогон>] [--blocks form,faq,hero] [--last 10] [--baseline <json донора>]
node taste.mjs bans [--run <прогон>] [--baseline <json донора>] [--json]
node taste.mjs list [--run <прогон>]
node taste.mjs check
node taste.mjs --help
```

Команды: `add`, `brief`, `bans`, `list`, `check`.

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--json` | переключатель | bans: вывести запреты JSON-ом |
| `--baseline` | со значением | brief/bans: база нового донора (cliche.mjs baseline) — какие запреты спорят с его чертами |
| `--block` | со значением | блок страницы: form, faq, hero, footer, page… |
| `--blocks` | со значением | brief: записи по этим блокам — открыть их картинки перед эскизом |
| `--dir` | со значением | журнал; иначе SITE_REWORK_TASTE, иначе ~/.claude/site-rework/taste |
| `--donor` | со значением | адрес донора, при котором это сказано |
| `--img` | со значением | --img <кроп.png> --run <прогон> [--scope site\|general] [--donor <url>] [--date 2026-09-22] [--source "<где сказано>"] |
| `--quote` | со значением | --quote "<дословные слова пользователя>" --why "<что на картинке, своими словами>" \ |
| `--rule` | со значением | правила каталога cliche.mjs (node cliche.mjs rules), к которым относится запись |
| `--run` | со значением | add: прогон, при котором это сказано (имя папки прогона; путь сокращается до имени). |
| `--source` | со значением | --source "<текст>" где сказано (сообщение, отзыв на снимок) |
| `--why` | со значением | --why "<текст>"    что на картинке и в чём дело, своими словами; обязательно всегда |
| `--by` | значение необязательно | user — сказал пользователь; self — свой отсев. Без --by: user, если есть --quote, иначе self |
| `--date` | значение необязательно | --date <ГГГГ-ММ-ДД> дата, когда сказано (по умолчанию сегодня) |
| `--last` | значение необязательно | brief: сколько последних записей показать (10) |
| `--scope` | значение необязательно | add: site — только этот сайт, запись действует лишь в прогоне --run (по умолчанию, |
| `--verdict` | значение необязательно | rejected (отвергнуто) \| accepted (принято как есть) \| preferred (выбрано из вариантов) |
| `--viewport` | значение необязательно | brief/bans: экран базы (desktop по умолчанию); --viewports — то же самое. |
| `--viewports` | значение необязательно | --viewport <имя>   brief/bans: экран базы (desktop по умолчанию); --viewports — то же самое. |

Коды выхода: 0 — готово; 1 — FAIL (запись отклонена, check нашёл битые строки, не создать папку журнала); 2 — нет команды или неверный --viewport/--viewports.

Переменные окружения: `SITE_REWORK_TASTE`.

## texture.mjs

```
node texture.mjs <url> [--viewport desktop,tablet,mobile] [--out папка] [--screens 4] [--label имя]
node texture.mjs <texture.json> [--viewport desktop,mobile] [--tokens файл] [--css файл] [--md файл] [--json файл]
node texture.mjs compare <донор: url|texture.json> <сайт: url|texture.json> [--viewport desktop,mobile]
node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл]
node texture.mjs --tile файл.gif|png|webp|svg
node texture.mjs selftest [--no-browser]
node texture.mjs --help | --h | -h
```

Команды: `compare`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--extras` | переключатель | ещё вуали, псевдоэлементы, backdrop-filter, blend, градиенты, фоновые видео |
| `--no-browser` | переключатель | selftest без стендов в браузере |
| `--selftest` | переключатель | самопроверка (или команда selftest): разбор файлов, вид плитки, находки проверки 02.10.2026 (мягкое |
| `--strict` | переключатель | код 1 при FAIL. FAIL даёт только compare (там код 1 и без флага); одиночный замер, |
| `--css` | со значением | записать templates/grain.css с подставленным рецептом; есть крупная фактура — и |
| `--json` | со значением | файл итога (по умолчанию <out>/texture.json, с --label — texture-<метка>.json; в compare — |
| `--label` | со значением | метка замера: имя в файлах снимков и итог <out>/texture-<метка>.json (два замера в одну |
| `--md` | со значением | записать раздел «Фактура (параметры для переноса)» для discovery.md |
| `--out` | со значением | папка снимков и texture.json (по умолчанию <папка прогона>/texture) |
| `--png` | со значением | --png и --tile — только OK и WARN, код 0. Ошибка замера или аргументов — всегда 1. |
| `--png2` | со значением | node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл] |
| `--png3` | со значением | node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл] |
| `--region` | со значением | node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл] |
| `--screens` | со значением | экранов по высоте страницы (4), снимки окна |
| `--tile` | со значением | разбор файла текстуры по всем кадрам (кадры, мс, σ, lag1, альфа, похож ли на шум, |
| `--tokens` | со значением | записать блок --grain-* в файл (заменяет блок texture:start…end или дописывает); |
| `--viewport` | со значением | --viewport оставляет только эти экраны; texture.json пишется только с --json; |
| `--viewports` | со значением | по умолчанию desktop,tablet,mobile (compare: desktop,mobile). --viewports и --vp (старое |
| `--vp` | со значением | по умолчанию desktop,tablet,mobile (compare: desktop,mobile). --viewports и --vp (старое |
| `--without` | со значением | --without — тот же экран без слоя (ровность и вклад слоя), --region x,y,w,h |
| `--lag-tol` | значение необязательно | [--out папка] [--screens 4] [--sd-tol 0.2] [--lag-tol 0.15] [--surface-tol 0.3] |
| `--sd-tol` | значение необязательно | допуск σ по полосам в compare (0.2 = ±20 %); --lag-tol — допуск lag1 (0.15) |
| `--surface-tol` | значение необязательно | допуск силы крупной фактуры в compare (0.3 = ±30 %) |

## tilda.mjs

```
node tilda.mjs <адрес> [--out <папка>] [--viewport desktop,mobile] [--pages "тип=путь,…"] [--no-scroll]
node tilda.mjs pages <адрес> [--out <папка>] [--limit 100] [--pause 300]
node tilda.mjs static <файл.html | адрес> [--out <папка>]
node tilda.mjs selftest            (или --selftest) фикстуры fixtures/tilda — без сети
node tilda.mjs --help
```

Команды: `pages`, `static`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--no-scroll` | переключатель | не проходить страницу прокруткой перед снимком |
| `--selftest` | переключатель | node tilda.mjs selftest            (или --selftest) фикстуры fixtures/tilda — без сети |
| `--limit` | со значением | --limit N, --pause мс    pages: сколько страниц запросить (до 300, по умолчанию 100) и пауза между ними |
| `--out` | со значением | куда писать (по умолчанию папка прогона runs/<slug>); в ней — tilda/ |
| `--pages` | со значением | --pages "тип=путь,…"     страницы от первого адреса (строка из tilda.mjs pages) |
| `--pause` | со значением | node tilda.mjs pages <адрес> [--out <папка>] [--limit 100] [--pause 300] |
| `--viewport` | со значением | --viewport, --viewports  экраны через запятую (синонимы): desktop, mobile, tablet, mobile-s или ШxВ@плотность; |
| `--viewports` | со значением | экраны через запятую (синонимы): desktop, mobile, tablet, mobile-s или ШxВ@плотность; |

Коды выхода: 0 — снято (или «не Tilda» — сказано в выводе); 1 — неверные аргументы, страница не открылась, selftest с расхождениями.

## typeset.mjs

```
node typeset.mjs <url> [--viewports desktop,mobile] [--pages /,/about] [--out <папка прогона>] [--tag имя]
node typeset.mjs --selftest [--browser firefox] [--viewports desktop,mobile]
node typeset.mjs --help   (или -h)
```

Команды: `selftest`.

Неизвестный флаг — ошибка, код 1 (свой разбор до parseArgs).

| флаг | вид | из справки |
|---|---|---|
| `--selftest` | переключатель | стенд fixtures/typeset на своём сервере (порт 4211–4219): index.html, hero-low.html, frame.html |
| `--strict` | переключатель | код выхода 1, если хоть один экран FAIL. |
| `--baseline` | со значением | протокол донора или «до» того же экрана: правила стиля (leading, caps-track, scale, |
| `--browser` | со значением | chrome (по умолчанию), firefox, edge. Firefox — для переносов (Chrome без окна не |
| `--crops` | со значением | вырезок с подсветкой на экран, по умолчанию 12; 0 — без вырезок. |
| `--decisions` | со значением | решения { "правило": { "<подпись блока, id или *>": "почему" } }: снимают WARN стиля и |
| `--json` | со значением | --json <файл>\|-  все протоколы запуска одним файлом; «-» — JSON в stdout, текст — в stderr. |
| `--out` | со значением | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>). Протоколы — |
| `--pages` | со значением | страницы через запятую («/,/about»); каждая страница и экран — свой протокол; путь с «/» — от корня ХОСТА, без него ("./", "a.html") — от папки адреса; у сайта  |
| `--tag` | со значением | имя протокола: base, donor, after… По умолчанию typeset (не в Chrome — typeset-firefox, |
| `--viewport` | со значением | --viewport — то же самое; оба сразу с разными списками — ошибка. |
| `--viewports` | со значением | экраны через запятую: пресеты lib.mjs (desktop, laptop, tablet, mobile, mobile-s, android), |

Коды выхода: 0 — сделано (вердикт в выводе и протоколе); 1 — неверные аргументы, провал --selftest или FAIL с --strict; 3 — страница не открылась или упал браузер.

## design-reference/cyrillic-check.mjs

```
node cyrillic-check.mjs "Oswald" "Bebas Neue:400" ...
node cyrillic-check.mjs --css https://site/fonts.css "Свой Шрифт"
node cyrillic-check.mjs fonts/commissioner-cyrillic.woff2 --chars "₽«»"
node cyrillic-check.mjs "Oswald" --lang en
node cyrillic-check.mjs --selftest
node cyrillic-check.mjs --help | -h
```

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--selftest` | переключатель | --selftest проверяет сам способ: Oswald должен дать «кириллица есть», Bebas Neue — «кириллицы |
| `--chars` | со значением | --chars "<знаки>"  какие знаки проверить, кроме кириллицы: каждый — той же пробой шириной. |
| `--css` | со значением | --css <адрес стилей> (один на все шрифты запуска; проба идёт на адресе этих стилей — шрифты сайта |
| `--lang` | со значением | язык сайта, по умолчанию ru; другой язык без --chars — только |

## design-reference/extract.mjs

```
node extract.mjs <url> [--out docs/design] [--name slug] [--no-shots] [--light] [--no-pixels] [--force]
```

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--force` | переключатель | перезаписать существующую <имя>.md |
| `--light` | переключатель | без состояний наведения/фокуса и без тёмной темы |
| `--no-pixels` | переключатель | не подтверждать акцент пикселями коробок кнопок и ссылок |
| `--no-shots` | переключатель | без файлов снимков (акцент всё равно проверяется снимками коробок кнопок) |
| `--selftest` | переключатель | самопроверка на стендах fixtures/extract (h1, аккордеон Framer, масштаб Tilda, |
| `--name` | значение необязательно | имя файлов (по умолчанию из адреса, как у site-rework: хост без www, |
| `--out` | значение необязательно | куда писать (по умолчанию docs/design) |

## design-reference/verify.mjs

```
node verify.mjs <спецификация.json> <адрес страницы> [--strict] [--ignore <файл> | --no-ignore] [--json <файл>|-]
```

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--no-ignore` | переключатель | без списка отступлений — показать всё, что он прячет |
| `--strict` | переключатель | отсутствующие уровни шкалы и предупреждения ?? — тоже расхождения |
| `--ignore` | значение необязательно | отступления из этого файла (по умолчанию <спецификация>.ignore) |
| `--json` | значение необязательно | --json <файл>\|-   машинный итог: verdict OK\|WARN\|FAIL, steps [{ status, what, want, got }], sources, |

