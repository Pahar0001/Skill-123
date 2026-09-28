# Флаги скриптов site-rework и design-reference

> Собирается `node scripts/flags-doc.mjs` из кода (разбор аргументов каждого скрипта и его `-h`).
> Руками не править: поменяли флаг — перегенерировать; `--check` скажет, если забыли.

**Общее.** Флаг пишется `--ключ значение` или `--ключ=значение`; после `--` — только позиционные. Значение,
которое начинается с `--`, — только через `=`. Неизвестный флаг не забирает адрес, команду и слово на «-»;
у скрипта с пометкой «неизвестный флаг — ошибка» он останавливает запуск (код 1, «может быть, --…?»), у остальных
даёт WARN и запуск идёт дальше. Вид «значение необязательно» — берёт следующее слово, только если оно не похоже на флаг.

## a11y.mjs

```
node a11y.mjs <url> [--viewport desktop] [--out папка] [--tag имя] [--no-grain] [--strict]
node a11y.mjs --help   (или -h)
```

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--no-grain` | переключатель | не учитывать слой зерна поверх текста в контрасте (см. ниже). |
| `--strict` | переключатель | код выхода 1 при вердикте FAIL (для гейта); без флага — 0 при любом вердикте. |
| `--out` | со значением | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/a11y/<tag>.json. |
| `--tag` | со значением | имя файла итога (по умолчанию имя экрана). |
| `--viewport` | со значением | экран: пресет (desktop, laptop, tablet, mobile, mobile-s, android), запись ШxВ@плотность |
| `--viewports` | со значением | файлы). --viewports — то же самое (синоним). |

Коды выхода: 0 — проверка сделана (вердикт в выводе и в JSON); 1 — неверные аргументы или, с --strict, вердикт FAIL. Аргументы (адрес, экран, значения флагов) проверяются до создания папок и запуска браузера.

## cliche.mjs

```
node cliche.mjs <url> [--baseline <json>] [--taste [папка]] [--viewport desktop,mobile]
node cliche.mjs baseline <url донора> [--out <файл.json|папка>] [--viewport desktop,mobile]
node cliche.mjs rules [--json]
node cliche.mjs --help
```

Команды: `baseline`, `rules`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--shot` | переключатель | снимок с обводкой того, что пошло в счёт: <run>/cliche/cliche-<экран>.png |
| `--strict` | переключатель | как у других скриптов; FAIL и без него даёт код 1. |
| `--baseline` | со значением | база: файл «cliche.mjs baseline» донора (или результат прогона сайта «до»). |
| `--decisions` | со значением | --decisions <json> файл обоснований, если он не в папке прогона. |
| `--out` | со значением | в режиме baseline: файл .json или папка (там cliche-baseline.json). |
| `--run` | со значением | папка прогона (синоним --out): там authorship-decisions.json, туда |
| `--viewport` | со значением | экраны через запятую (desktop, laptop, tablet, mobile, mobile-s, android или |
| `--viewports` | со значением | (baseline — desktop,mobile). --viewports — то же самое; оба сразу |
| `--json` | значение необязательно | --json <файл>\|-    куда записать итог (по умолчанию <run>/cliche/cliche.json); «-» — JSON в stdout. |
| `--taste` | значение необязательно | запреты пользователя из журнала вкуса (taste.mjs); без папки — |

Коды выхода: 0 — OK/WARN, 1 — FAIL, 2 — неверные аргументы (нет адреса, флаг без значения, неизвестный экран) или файл, 3 — страница не открылась. Список правил с весами: node cliche.mjs rules

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
| `--md` | переключатель | pairs: markdown-список для «Тексты "было → стало"» отчёта |
| `--no-browser` | переключатель | selftest: без проверки режима адреса (браузер не запускается) |
| `--no-facts` | переключатель | не сверять факты (разведка чужого сайта): подсказки и WARN copy-unchecked |
| `--quiet` | переключатель | только строки страниц и итог |
| `--release` | переключатель | --release, запрет журнала вкуса. WARN — переписать или записать причину: штамп, пустая оценка, |
| `--selftest` | переключатель | node copy.mjs selftest [--no-browser]        (то же: --selftest) |
| `--taste` | переключатель | журнал вкуса (taste.mjs, activeBans): запрет пользователя по правилу copy-* |
| `--typograph` | переключатель | node copy.mjs fix --typograph <файл\|папка\|-> [--write \| --out <файл>] [--diff] [--limit N] |
| `--write` | переключатель | fix: записать на месте (без него — только показать) |
| `--allow` | значение необязательно | copy.allow.json: { brand, words, phrases, rules: { правило: [фразы] }, off, templates } |
| `--baseline` | значение необязательно | --baseline, основа для --donor, левая сторона для pairs. |
| `--donor` | значение необязательно | тексты донора (snapshot --tag donor, папка, адрес): 8 слов подряд — FAIL |
| `--facts` | значение необязательно | facts.json: [{ "fact": "20 000 ₽", "what": "…", "source": "бриф 28.09" }]; |
| `--json` | значение необязательно | --json <файл>\|-     протокол ещё и в файл; «-» — в stdout (вывод для человека тогда в stderr) |
| `--limit` | значение необязательно | fix: сколько пар «было / стало» показать на файл (25); pairs — на страницу (40) |
| `--nbsp` | значение необязательно | fix: &nbsp; (по умолчанию в файлах) или сам знак U+00A0 (по умолчанию для stdin) |
| `--out` | значение необязательно | папка прогона: протокол <прогон>/copy/<tag>.json; оттуда же по умолчанию |
| `--out-dir` | значение необязательно | fix: протокол <прогон>/copy/typo-<tag>.json |
| `--pages` | значение необязательно | --pages "/,/a"      адрес: пути от адреса; папка: /a → a.html, a/index.html или a |
| `--role` | значение необязательно | fix -: роль строки (h1, h2 — короче предел склейки неразрывных, title — без пробелов) |
| `--run` | значение необязательно | папка прогона для --taste и файлов по умолчанию, если нет --out |
| `--tag` | значение необязательно | имя протокола: lint — lint (after, base…), snapshot — before, fix — fix |
| `--taste-dir` | значение необязательно | --taste-dir <папка> журнал вкуса, если не ~/.claude/site-rework/taste (или SITE_REWORK_TASTE) |
| `--viewport` | значение необязательно | адрес: экран (mobile по умолчанию; desktop, laptop, tablet, mobile-s, 320x568@2) |

Коды выхода: 0 — OK или WARN; 1 — FAIL, неверные аргументы, страница не открылась, провал selftest.

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
| `--keep-consent` | переключатель | не закрывать окно согласия cookie. По умолчанию оно закрывается до первого |
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
| `--tag` | со значением | подпапка снимков, по умолчанию discover |
| `--viewport` | со значением | По умолчанию desktop,tablet,mobile. --viewport — то же самое, тоже списком; |
| `--viewports` | со значением | --viewports <list> экраны через запятую: desktop, laptop, tablet, mobile, mobile-s (320), |

Коды выхода: 0 — готово (без --strict — даже если в выводе есть FAIL); 1 — нет адреса или он не http(s):// и не file://, неизвестные экраны, флаг без значения, неверная --scheme,

Переменные окружения: `DESIGN_REF_PROJECT`.

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
node media.mjs <команда> --help (или -h, --h) — эта справка, код 0; команда при этом
```

Команды: `doctor`, `search`, `pick`, `import`, `credits`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--fresh` | переключатель | [--fresh (без кэша ответов API)] |
| `--not-editorial` | переключатель | --not-editorial; unsplash, kaboompics, adobe-stock-free — только файл, |
| `--ok-flags` | переключатель | [--ok-flags]                     кадр с пометками берётся только с этим флагом |
| `--author` | значение необязательно | [--author "…"] [--author-url …] [--title "…"] [--not-editorial] |
| `--author-url` | значение необязательно | [--author "…"] [--author-url …] [--title "…"] [--not-editorial] |
| `--avif` | значение необязательно | [--avif auto\|on\|off]             AVIF рядом с WebP (auto — если быстро) |
| `--caption` | значение необязательно | node media.mjs pick <папка поиска> <N> --seen "<что на кадре>" --caption "<подпись/роль>" |
| `--contrast` | значение необязательно | [--look none\|duotone:#RRGGBB,#RRGGBB\|mono] [--contrast 0..1] [--grain 0..0.06] |
| `--crop-mobile` | значение необязательно | [--crop-mobile 4:5]              отдельный кадр для телефона |
| `--dest` | значение необязательно | --dest --look --contrast --grain --crop-mobile --ratio --src-prefix --avif |
| `--dur` | значение необязательно | [--start <с>] [--dur <с>]        видео: откуда и сколько резать петлю (по умолчанию 8 с) |
| `--fade` | значение необязательно | [--fade <с>]                     видео: длина наплыва на стыке (по умолчанию 1 с) |
| `--file-url` | значение необязательно | --file-url, иначе не видно, не нейросеть ли это; Mixkit — поштучно, файл |
| `--frames` | значение необязательно | [--frames 8\|all]                 видео Commons: у скольких роликов собрать кадры из |
| `--grain` | значение необязательно | [--look none\|duotone:#RRGGBB,#RRGGBB\|mono] [--contrast 0..1] [--grain 0..0.06] |
| `--kind` | значение необязательно | node media.mjs search "<запрос по-английски>" --kind photo\|video |
| `--license` | значение необязательно | node media.mjs import <url страницы> [<url или путь файла>] --license <id> |
| `--look` | значение необязательно | [--look none\|duotone:#RRGGBB,#RRGGBB\|mono] [--contrast 0..1] [--grain 0..0.06] |
| `--md` | значение необязательно | node media.mjs credits <папка картинок сайта> [--md [<файл или папка>]] |
| `--min` | значение необязательно | [--orient landscape\|portrait\|square] [--min <px по длинной стороне>] |
| `--n` | значение необязательно | [--n 24]                         сколько кадров на лист (до 60) |
| `--name` | значение необязательно | [--role hero\|section\|card\|loop] [--name <имя файлов>] [--dest <папка картинок сайта>] |
| `--orient` | значение необязательно | [--orient landscape\|portrait\|square] [--min <px по длинной стороне>] |
| `--out` | значение необязательно | [--out <папка>] [--run <slug, url сайта или полный путь папки прогона>] |
| `--profile` | значение необязательно | [--profile photo\|art]            photo — заведения, магазины, школы (по умолчанию); |
| `--ratio` | значение необязательно | [--ratio 16:9]                   обрезать основной кадр |
| `--role` | значение необязательно | [--role hero\|section\|card\|loop]  под что кадр: от роли зависит нужный размер |
| `--run` | значение необязательно | [--out <папка>] [--run <slug, url сайта или полный путь папки прогона>] |
| `--seen` | значение необязательно | --seen … --caption … [и все флаги обработки pick: --ok-flags --role --name |
| `--sources` | значение необязательно | [--sources a,b,...]              свой список и порядок источников |
| `--src-prefix` | значение необязательно | [--src-prefix img/]              префикс путей в разметке (по умолчанию имя --dest) |
| `--start` | значение необязательно | --start --dur] [--run <slug, url сайта или папка прогона — как у search>] |
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
node motion.mjs selftest            проверка распознавания на стенде fixtures/motion/index.html
node motion.mjs --help
node motion.mjs https://donor.com --pages "home=/,product=/sets/x,collection=/c/y" --viewport desktop,mobile --tag donor
```

Команды: `compare`, `selftest`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--debug` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-clicks` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-crops` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-hover` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-mouse` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--no-scroll` | переключатель | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--clicks` | значение необязательно | [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug] |
| `--decisions` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--decisions <файл>] [--viewport …] |
| `--hover` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14] |
| `--out` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14] |
| `--pages` | значение необязательно | node motion.mjs <адрес> [<адрес>…] [--pages "тип=путь,…"] [--viewport desktop[,mobile]] |
| `--tag` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14] |
| `--time` | значение необязательно | --time — базовое окно «время» (мс); медленную петлю (период длиннее окна: покачивание Framer 7–13 с) окно |
| `--time-cap` | значение необязательно | [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14] |
| `--viewport` | значение необязательно | node motion.mjs <адрес> [<адрес>…] [--pages "тип=путь,…"] [--viewport desktop[,mobile]] |

Коды выхода: 0 — снято (и compare без FAIL); 1 — FAIL сверки, неверные аргументы, не открылась страница.

## perf.mjs

```
node perf.mjs <url> [--viewport mobile] [--out папка] [--tag имя]
node perf.mjs --help   (или --h, -h)
```

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--overlay-only` | переключатель | только цена слоя, без замера загрузки (быстро: сеть не замедляется); итог — |
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

Коды выхода: 0 — сделано; 1 — ошибка (сеть, API, аргументы); 2 — не сделано по правилу (нет --yes, нет ключа, запрещённое назначение, не прошли ворота take).

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

Неизвестный флаг — WARN; слово после него, если это не адрес, флаг забирает значением.

| флаг | вид | из справки |
|---|---|---|
| `--assert` | шаг | --assert "js"         FAIL, если результат ложный или Promise отклонён |
| `--canvas` | шаг | холсты: рисует ли (снимок с холстом и без), меняется ли кадр, |
| `--click` | шаг | --click "sel"         кликнуть: эффект — изменения DOM (MutationObserver), адрес, |
| `--css` | шаг | объявления CSS, которые браузер выбросил: файл:строка |
| `--edit` | шаг | --edit "sel"          поле с маской: набор, Backspace до конца, правка в середине, |
| `--eval` | шаг | --eval "js"           выполнить выражение (можно Promise) и записать результат; |
| `--expect` | шаг | сразу за ним --expect "значение" — FAIL, если не совпало |
| `--fullpage` | шаг | снимок всей страницы |
| `--hover` | шаг | --hover="--x". Флаги без значения тоже пишутся через «=»: =0, false, no, off, нет — |
| `--hover-all` | шаг | каждое правило :hover из CSS: меняет ли объявленное; мёртвое — |
| `--key` | шаг | нажать клавишу: где фокус, значение и курсор поля |
| `--motion` | шаг | анимации: идут, бесконечные, закончились и держат свойство; |
| `--nav` | шаг | меню: подсвеченный пункт ведёт на раздел, который на экране |
| `--resize` | шаг | --resize 1152         сменить ширину окна (или ШxВ — 834x1112, 834X1112, 834×1112; |
| `--scroll` | шаг | прокрутить до конца: появления, закреплённые, переполнение |
| `--select` | шаг | --select "sel=знач"   выбрать вариант списка (value или текст варианта); делится так же, |
| `--shot` | шаг | снимок экрана |
| `--type` | шаг | --type "sel=текст"    ввести текст и проверить, что он в поле (tel: 8… = +7…); |
| `--video` | шаг | видео: poster, muted/playsinline, играет ли, пауза вне экрана |
| `--wait` | шаг | --wait 800            подождать столько миллисекунд (число ≥ 0, «0» — не ждать; |
| `--no-fail` | переключатель | --no-fail=0 — провалы снова дают код 1. Шаг (--scroll, --css, --canvas…): --scroll=0 |
| `--reduced-motion` | переключатель | [--reduced-motion] [--scheme dark] [--cpu 4] [--no-fail] [--init "js"] |
| `--browser` | со значением | --browser) — ошибка (код 2); --wait — не больше 600000 мс. |
| `--cpu` | со значением | --cpu 4               процессор в N раз медленнее (только Chrome и Edge) |
| `--init` | со значением | --init "js"           код до всех скриптов страницы (например, PerformanceObserver) |
| `--out` | со значением | --out папка, --tag имя  папка прогона и имя протокола |
| `--scheme` | со значением | цветовая схема (по умолчанию light) |
| `--tag` | со значением | node runtime.mjs <url> [--viewport mobile] [--out папка] [--tag имя] [--browser firefox] |
| `--viewport` | со значением | desktop \| laptop \| tablet \| mobile \| mobile-s (320×568@2) \| android (360×800@3) |
| `--viewports` | со значением | --viewports — то же самое. Экран один за запуск: список «mobile,desktop» — |

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
node shots.mjs <url> [--out папка] [--tag before|after] [--viewports desktop,tablet,mobile]
```

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--no-freeze` | переключатель | не останавливать движение (если нужно поймать именно фазу анимации). |
| `--sheet` | переключатель | ещё и лист миниатюр снимков окна (<страница>-<экран>-scroll-sheet.png). |
| `--strict` | переключатель | код выхода 1, если есть FAIL (состояние не сбрасывается или сбой съёмки). |
| `--with-320` | переключатель | добавить к выбранным экранам mobile-s (320 px): на нём вылезают закреплённые панели |
| `--browser` | значение необязательно | в каком браузере снимать: chrome (по умолчанию), firefox, edge (ff, msedge — тоже). |
| `--full` | значение необязательно | --full-mode   (или --full) как снимать всю страницу: |
| `--full-mode` | значение необязательно | (или --full) как снимать всю страницу: |
| `--out` | значение необязательно | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>); снимки — в <out>/<tag>/. |
| `--pages` | значение необязательно | страницы через запятую относительно адреса. |
| `--return` | значение необязательно | как возвращаться наверх перед сравнением первого экрана: |
| `--scheme` | значение необязательно | light \| dark — prefers-color-scheme. |
| `--segments` | значение необязательно | сколько снимков окна по всей высоте (равномерно, последний — низ страницы); |
| `--shot-pause` | значение необязательно | пауза перед каждым снимком окна, мс (по умолчанию 1200: ленивое и появления успевают). |
| `--tag` | значение необязательно | подпапка снимков (before \| after \| любое имя), по умолчанию before (не в Chrome — |
| `--viewport` | значение необязательно | По умолчанию desktop,tablet,mobile. --viewport — то же (как в a11y.mjs и perf.mjs); |
| `--viewports` | значение необязательно | экраны через запятую: пресеты desktop, laptop, tablet, mobile, mobile-s (320×568@2), |

Коды выхода: 0 — съёмка сделана (вердикт в выводе и в shots.json, поле verdict); 1 — нет адреса или он не http(s):// и не file:///, неверное значение флага (экран, --full-mode, --return, --scheme не light и не dark, --browser не chrome, firefox или edge, --segments и --shot-pause не число от 0, флаг без значения), браузер не запустился, а с --strict — ещё и при любом FAIL. Аргументы проверяются до того,

## state.mjs

```
node state.mjs <папка прогона> init <url|-> "<запрос>" --site <папка сайта> --mode rework|mirror|donor|new [--force]
node state.mjs <папка> meta [--site <папка сайта>] [--mode rework|mirror|donor|new] [--url <адрес>] [--site-ignore "data,*.json"]
node state.mjs <папка> add "<задача>" [--priority P2] [--area hero|mobile|3d|content|motion|...]
node state.mjs <папка> set <id> impl=DONE runtime=VERIFIED --evidence runtime/desktop.json#5
node state.mjs <папка> set <id> visual=VERIFIED --evidence after/home-mobile-first.png mobile=NA --note "почему"
node state.mjs <папка> set <id>[,<id>…] impl=DOING priority=P1
node state.mjs <папка> stage <этап> done|active|todo|skipped
node state.mjs <папка> show [--strict] [--json]
```

Команды: `init`, `meta`, `add`, `set`, `stage`, `show`, `probe`.

Неизвестный флаг — WARN, запуск идёт дальше.

| флаг | вид | из справки |
|---|---|---|
| `--force` | переключатель | init поверх существующего журнала; старый сохраняется рядом. |
| `--json` | переключатель | (show) журнал с состоянием каждой клетки одним JSON: url, режим, папка |
| `--strict` | переключатель | (show) код выхода 1, если итог не OK. |
| `--area` | со значением | node state.mjs <папка> add "<задача>" [--priority P2] [--area hero\|mobile\|3d\|content\|motion\|...] |
| `--check` | со значением | --check, --task    (probe) какой проверкой мерить доказательство и для какой задачи |
| `--evidence` | со значением | доказательство для всех VERIFIED этого вызова. |
| `--evidence-mobile` | со значением | --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf |
| `--evidence-perf` | со значением | --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf |
| `--evidence-runtime` | со значением | --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf |
| `--evidence-visual` | со значением | --evidence-runtime, --evidence-visual, --evidence-mobile, --evidence-perf |
| `--mode` | со значением | rework — переработка по исходникам, mirror — через зеркало |
| `--note` | со значением | --note "…"         заметка к задаче; для NA — обязательная причина. Без текста — ошибка. |
| `--priority` | со значением | --priority, --area (add) приоритет P0…P5 и область задачи. |
| `--site` | со значением | папка с файлами сайта: исходники (rework), зеркало <прогон>/mirror |
| `--site-ignore` | со значением | что ещё не считать правкой сайта: имена папок и файлов или маски |
| `--task` | со значением | node state.mjs <папка> probe <файл[#шаг]>… --check runtime\|visual\|mobile\|perf [--task <id>] [--json] |
| `--url` | со значением | (meta) адрес сайта: http://, https:// или file:// |

Коды выхода: 0 — готово (и после --help); 1 — отказ (ошибка в аргументах, доказательство не годится, нет журнала) или show --strict с итогом не OK.

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
node texture.mjs --help | --h | -h
```

Команды: `compare`.

Неизвестный флаг — ошибка, код 1 (parseArgs strict).

| флаг | вид | из справки |
|---|---|---|
| `--extras` | переключатель | ещё вуали, псевдоэлементы, backdrop-filter, blend, градиенты, фоновые видео |
| `--strict` | переключатель | код 1 при FAIL. FAIL даёт только compare (там код 1 и без флага); одиночный замер, |
| `--css` | со значением | записать templates/grain.css с подставленным рецептом |
| `--json` | со значением | файл итога (по умолчанию <out>/texture.json; в compare — <out>/compare.json) |
| `--label` | со значением | имя в файлах |
| `--md` | со значением | записать раздел «Фактура (параметры для переноса)» для discovery.md |
| `--out` | со значением | папка снимков и texture.json (по умолчанию <папка прогона>/texture) |
| `--png` | со значением | --png и --tile — только OK и WARN, код 0. Ошибка замера или аргументов — всегда 1. |
| `--png2` | со значением | node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл] |
| `--png3` | со значением | node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл] |
| `--region` | со значением | node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл] |
| `--screens` | со значением | экранов по высоте страницы (4), снимки окна |
| `--tile` | со значением | разбор файла текстуры по всем кадрам (кадры, мс, σ, lag1, альфа, похож ли на шум) |
| `--tokens` | со значением | записать блок --grain-* в файл (заменяет блок texture:start…end или дописывает) |
| `--viewport` | со значением | --viewport оставляет только эти экраны; texture.json пишется только с --json; |
| `--viewports` | со значением | по умолчанию desktop,tablet,mobile (compare: desktop,mobile). --viewports и --vp (старое |
| `--vp` | со значением | по умолчанию desktop,tablet,mobile (compare: desktop,mobile). --viewports и --vp (старое |
| `--without` | со значением | --without — тот же экран без слоя (ровность и вклад слоя), --region x,y,w,h |
| `--lag-tol` | значение необязательно | [--out папка] [--screens 4] [--sd-tol 0.2] [--lag-tol 0.15] |
| `--sd-tol` | значение необязательно | допуск σ по полосам в compare (0.2 = ±20 %); --lag-tol — допуск lag1 (0.15) |

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
| `--selftest` | переключатель | стенд fixtures/typeset на своём сервере (порт 4211–4219): каждый случай сверяется с ожидаемым. |
| `--strict` | переключатель | код выхода 1, если хоть один экран FAIL. |
| `--baseline` | со значением | протокол донора или «до» того же экрана: правила стиля (leading, caps-track, scale, |
| `--browser` | со значением | chrome (по умолчанию), firefox, edge. Firefox — для переносов (Chrome без окна не |
| `--crops` | со значением | вырезок с подсветкой на экран, по умолчанию 12; 0 — без вырезок. |
| `--decisions` | со значением | решения { "правило": { "<подпись блока, id или *>": "почему" } }: снимают WARN стиля и |
| `--json` | со значением | --json <файл>\|-  все протоколы запуска одним файлом; «-» — JSON в stdout, текст — в stderr. |
| `--out` | со значением | папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>). Протоколы — |
| `--pages` | со значением | страницы от адреса через запятую («/,/about»); каждая страница и экран — свой протокол. |
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

