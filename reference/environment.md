# Среда, запуск скриптов и сбои

Перенесено из SKILL.md 30.09.2026 дословно; в SKILL.md — короткая версия со ссылкой сюда.

## Запуск скриптов, флаги, папка прогона

Скриптам нужны `puppeteer-core`, `sharp`, для видео — `ffmpeg-static`. Они
стоят в `~/.claude/site-rework/node_modules`, поэтому скрипты запускаются
из любой папки (ещё ищутся в `SITE_REWORK_PROJECT` и в текущей папке).
Команды даны полным путём `node ~/.claude/skills/site-rework/scripts/…`: в
Git Bash `~` раскрывается сам, в PowerShell 5.1 — нет, там писать
`$HOME/.claude/skills/site-rework/scripts/…`. У каждого скрипта `--help`
печатает все флаги и ничего не запускает; `-h` — то же у всех, включая
`extract.mjs` и `verify.mjs` скилла design-reference. Экраны: у `discover`, `shots`,
`texture` и `cliche` `--viewport` и `--viewports` — синонимы, списком через
запятую (оба сразу с разными списками — ошибка); `runtime`, `a11y`, `perf` и
`taste` понимают оба, но экран за запуск один (список — ошибка). `--strict` —
код 1 при итоговом FAIL у `discover`, `shots`, `a11y`, `perf`, `texture`; у
`runtime` и `cliche` FAIL и так даёт код 1 (у `runtime` `--no-fail` даёт 0).
Неизвестный флаг (опечатка) у `discover`, `motion`, `cliche`, `tilda`, `a11y`, `perf`, `texture`, `media`,
`grain-tile`, `recraft`, `copy`, `typeset`, `runtime` — ошибка с кодом 1 и подсказкой «может быть, --…?»; у остальных — `WARN неизвестный флаг
--x` в stderr: адрес, команду скрипта (`compare`, `init`…) и слово на «-» он значением не забирает;
увидел такой WARN — поправить команду и перепрогнать, протокол мог сняться не с теми настройками.
Все флаги всех скриптов — `reference/flags.md` (собирается из кода `flags-doc.mjs`, руками не
править); поменял флаг или строку `-h` — `node scripts/flags-doc.mjs`, перед коммитом скилла —
`--check` (код 0).

**Папка прогона** без `--out` берётся из адреса проверяемой страницы, а не
из журнала: `~/.claude/site-rework/runs/<slug адреса>`; у `localhost` и
`127.0.0.1` порт входит в имя (`http://localhost:4177/` →
`runs/localhost-4177`), у доменов — только нестандартный. Поэтому каждому
скрипту передавать `--out <папка>` (у `cliche.mjs` — `--run <папка>`, у
`cliche.mjs baseline` — `--out <файл.json>`); у `texture.mjs` `--out` — сама
папка замера (`<папка>/texture`, для `compare` — `<папка>/texture-compare`).
Иначе в режимах донора и зеркала протоколы по адресу сайта лягут в чужую
папку, и `--evidence <папка>/runtime/<tag>.json` не найдётся.

**Среда.** Большие файлы писать инструментом `Write`: длинный heredoc через
Bash на Windows не проходит. Git Bash подменяет аргументы вида `/sites/…`
на путь внутри своей папки — передавать полные адреса и пути вида `C:/…`.
Обратные косые (регулярные выражения, экраны Юникода — обратная косая, буква u и код) `node -e`,
heredoc и `python -` в Git Bash теряют, а `Edit` и `Write` превращают экран неразрывного пробела или
разделителя строк в сам знак: такие правки — литералом через `Edit` или файлом `.cjs`/`.py` через `Write`.
Фоновый прогон гасить по номеру процесса или по полной командной строке, а не `pkill` по слову: слово
из пути прогона снимает и соседние (29.09). Остановленная задача оставляет дочерние процессы —
проверить и погасить их по командной строке до нового запуска.

## Стенд: сервер прогона

**Отдельным процессом, не фоновой командой сессии.** Фоновая команда живёт, пока жива сессия: при её
перезапуске (на «Зелёном уголке» 01.10 — трижды за вечер) сервер гаснет, и следующая проверка падает на пустой
порт или, хуже, снимает страницу ошибки. В PowerShell:

```powershell
Start-Process node -ArgumentList '--watch','server.js' -WorkingDirectory D:\project -WindowStyle Hidden `
  -RedirectStandardOutput D:\runs\site\server.log -RedirectStandardError D:\runs\site\server.err.log
```

Статическая папка — так же `serve.mjs`. После сводки контекста или перезапуска сессии первым делом —
`curl -s -o /dev/null -w "%{http_code}" http://localhost:<порт>/`; не 200 — поднять заново, потом проверки.
Гасить — по номеру процесса (`Get-CimInstance Win32_Process -Filter "name='node.exe'"` → по командной строке),
чужие порты (стенды соседних проектов) не трогать.

**Сжатие.** Локальный сервер без gzip и на HTTP/1.1 завышает первую отрисовку в полтора-два раза (стили 64 КБ
вместо 16): вердикт `perf.mjs` для сайта, который на бою стоит за Caddy или nginx, получается ложным. Рядом
поднять прокси со сжатием — `node <прогон>/tools/gzip-proxy.mjs 3101 3100` — и мерить через него, базу и итог
одинаково. `serve.mjs` сжимает сам.

**Замер «до» — до первой правки.** После правок по исходникам старой версии уже нет. Если базу не сняли:
`git archive HEAD:<папка> | tar -x -C <прогон>/before-app`, другой порт, свой прокси. База SQLite при журнале WAL
копируется только `VACUUM INTO '<копия>'` — простая копия файла дала пустой каталог, и замер «до» пошёл по
пустой странице. Прежде чем сравнивать числа, убедиться, что обе версии отдают одно и то же содержимое (число
карточек, тот же товар). `node_modules`, подключённые к копии соединением (junction), перед удалением папки
снимать `cmd /c rmdir <копия>\node_modules`: `rm -rf` по соединению сотрёт модули самого проекта.

**Память.** Не больше 2–3 браузеров одновременно, считая фоновых исполнителей: при 2–3 ГБ свободной памяти
вкладка не отвечает, и скрипт пишет «Runtime.callFunctionOn timed out» или «вкладка упала» — это не находка о
сайте, а повод дождаться исполнителей и перепрогнать.

**Снимок области.** У puppeteer `clip` считается от начала документа, а не окна: для области в прокрученной
странице к координатам `getBoundingClientRect()` прибавлять `scrollX` и `scrollY` (свой замер контраста на
«Зелёном уголке» сначала мерил не то место).

## macOS и Linux

Скилл писался на Windows; на macOS и Linux работает так же, отличия — ниже (сверено на macOS 05.10.2026).

- **Браузер.** `lib.requireChrome()` / `lib.findBrowser()` ищут сами: `/Applications/…/Google Chrome`,
  `~/Applications/…` (установка без прав администратора), `/usr/bin/google-chrome(-stable)`, `/opt/google/chrome/chrome`,
  `chromium`, `/snap/bin/chromium`, запасным — Edge. Другой путь — `CHROME_PATH`. Firefox (`--browser firefox` у
  `typeset`) — только если стоит (`/Applications/Firefox.app`, `/usr/bin/firefox`, `/snap/bin/firefox` или `FIREFOX_PATH`);
  нет — так и писать в отчёт, а не заменять Chrome молча.
- **WebGL (ANGLE).** `--use-angle=d3d11` есть только на Windows: на macOS с ним холст нулевой ширины, и
  съёмка сцены Three.js падала «createImageData… width is zero». Теперь движок по системе: Windows — d3d11, macOS —
  metal, Linux — swiftshader (программный, работает без дисплея и драйвера GPU; на быстром GPU-сервере можно
  `SITE_REWORK_ANGLE=gl` или `vulkan`). Такая ошибка у своей сцены — сначала `SITE_REWORK_ANGLE=swiftshader`.
- **Клавиши.** Сочетания с Control на macOS — Cmd (`Meta` у puppeteer). В безголовом Chrome на macOS даже Cmd+A
  без команды `SelectAll` поле не выделяет; `runtime --edit` выделяет сам (сочетание с `commands: ['SelectAll']`, не
  вышло — `el.select()`). В своих сценариях выделять `el.select()` / `setSelectionRange(0, длина)`, а не сочетанием.
- **Пути и оболочка.** zsh и bash раскрывают `~` сами; оговорки про Git Bash и PowerShell выше не нужны. Временная
  папка `os.tmpdir()` — `/var/folders/…/T` на macOS (туда кладут протоколы selftest), `/tmp` там — ссылка на
  `/private/tmp`. Сервер стенда отдельным процессом — `nohup node serve.mjs … > server.log 2>&1 &` и `disown`;
  гасить по номеру (`pgrep -fl 'serve.mjs'` → `kill <pid>`), не `pkill` по слову.
- **Системный шрифт.** `system-ui` — San Francisco на macOS, обычно DejaVu или Noto на Linux, Segoe UI на Windows:
  ширина подписи и край глифа разные. Стенды, чьи ожидания зависят от метрик, набраны своим шрифтом файлом
  (`fixtures/runtime/fonts`, `fixtures/a11y/fonts`, Commissioner OFL); новый такой стенд — так же.
- **Linux в контейнере.** Chrome от root с песочницей не стартует — `lib.launch` и `render.mjs` запускают его с
  `--no-sandbox`. Кириллице нужен шрифт в системе (`fonts-dejavu` или `fonts-noto`), иначе на снимках квадраты.

**Проверить установку** (браузеры по одному, не параллельно):

```bash
node -e "import('$HOME/.claude/skills/site-rework/scripts/lib.mjs').then((l) => console.log(l.findBrowser(), l.loadSharp() ? 'sharp есть' : 'sharp нет'))"
node ~/.claude/skills/site-rework/scripts/blender.mjs doctor                                   # Blender, Cycles, видеокарта; нет Blender — что ставить
node ~/.claude/skills/site-rework/scripts/blender.mjs render ~/.claude/skills/site-rework/templates/blender/icons.py --variant seed --w 300 --h 300 --samples 8 --out "${TMPDIR:-/tmp}/bltest"   # OK, поле 8.0%
node ~/.claude/skills/site-rework/scripts/a11y.mjs --selftest                                  # ≈2 мин, «не сошлось 0»
RW_SELFTEST_ONLY='^(edit|scroll|vert)$' node ~/.claude/skills/site-rework/scripts/runtime.mjs --selftest   # быстро; полный — ≈9 мин
```

## Восстановление после сбоев

Не останавливаться на первом отказе; но в отчёте — что именно не проверено.

| отказало | дальше |
|---|---|
| `scripts/*.mjs` (нет puppeteer-core, браузер не поднялся) | `npm i puppeteer-core sharp ffmpeg-static --prefix ~/.claude/site-rework`, `CHROME_PATH` → chrome-devtools MCP → пометить UNVERIFIED |
| Edge завершился молча | Chrome стоит первым; или `CHROME_PATH` на Chrome |
| вкладка упала или зависла (мало памяти) | скрипты дают ошибку «вкладка упала» или «… timed out», а не ждут вечно; закрыть лишнее и повторить по одному скрипту. Протокол с такой ошибкой — не сверка и не доказательство: `state.mjs show` пишет его строкой «не в счёт» |
| проверка упала сразу, страница «не открылась» | сначала порт: стенд, поднятый фоновой командой, гаснет с сессией — раздел «Стенд» выше |
| `sharp` не найден | `diff.mjs` и замер фактуры пропустить, сравнивать снимки глазами; картинки не пережимать |
| `ffmpeg` не найден | видео не обрабатывать (`media.mjs` пишет WARN и отказывается), постер-картинка |
| `design-reference` нет рядом | палитра и шрифты из `discovery.md`, токены выписать руками |
| `texture.mjs` не загрузился | `discover.mjs` мерит фактуру запасным путём; `--no-texture-module` — то же нарочно |
| сеть источников кадров (DNS, VPN) | `media.mjs` пишет «временная ошибка, повторить позже», пробует DoH; не записывать источник как недоступный |
| генерация картинок недоступна (нет кредитов Higgsfield, нет `RECRAFT_API_TOKEN` или баланса) | фото из свободных источников (`media.mjs`), SVG/CSS-графика, оставить существующие |
| нет модели для 3D | процедурная геометрия в Three.js, шейдер — не ждать модель; или без 3D |
| сервер отдаёт 429 | подождать минуту, не перезапускать |
| `net::ERR_TIMED_OUT`, `ERR_CONNECTION_RESET` (медленное TLS) | скрипты повторяют переход трижды и пишут «с N-й попытки»; не гонять несколько скриптов по такому сайту параллельно |
| внешний ресурс не загрузился (шрифт Google Fonts `ERR_CONNECTION_CLOSED`, CDN) — `runtime.mjs` ставит загрузке FAIL | перепрогнать один раз; протокол с FAIL доказательством не служит, чистый повтор — служит, оба пути — в отчёт. Повторилось — это зависимость сайта от чужого сервера: отдельная задача (свои файлы шрифта или запасная гарнитура), не примечание |
| страница за логином, зеркало не снимается | попросить доступ или исходники; работать по снимкам пользователя как ANALYZED |
| PDF требований не разбирается | `Read`, затем `requirements.mjs ingest --text … --kind doc --original <pdf>`, цитаты с номером страницы |
| голосовое с требованиями | `ingest` печатает команду whisper (`D:/tools/whisper`); запись от 10 минут — `run_batch.ps1`; цифры и имена переспросить |
| разметка документа требований поехала (таблица в соседнюю) | кандидаты — только подсказка, атомы — через `add … --quote` |
| вложение «не пришло» | `ls -lt ~/Downloads \| head` — опознать по содержимому |

**Правка самих скриптов во время прогона.** Инструмент, изменившийся между
замерами, делает «до» и «после» несравнимыми. Правка скрипта — отдельным
коммитом в git скилла (`git -C ~/.claude/skills/site-rework …`), потом
заново прогнать все проверки, которые этот скрипт уже делал. Протоколы помнят,
каким кодом сняты (поле `generator`: скрипт, `lib.mjs` и подключаемые модули в `deps` — `texture.mjs` у
`a11y` и `perf`, `taste.mjs` и `copy-rules.mjs` у `cliche`, `clicks.mjs` у `motion` и `discover`), и
`state.mjs` пишет WARN «снят другой версией скрипта» с именем модуля («taste.mjs 75b8568 против 936910e»).

## Файлы скилла — подробно

```
scripts/lib.mjs        браузер, экраны (mobile-s 320, android 360, ШxВ@DPR), прокрутка, снимки, переполнение, холсты, цвета
scripts/discover.mjs   разведка: техника, содержимое, визуал, фактура, паспорт донора, подписные приёмы, медиа-слоты; Tilda — раздел «Tilda» (tilda.mjs), кегли × zoom, служебное и обрезанное артбордом вне языка, типы страниц по подписи блоков
scripts/runtime.mjs    проверка в браузере: клики с эффектом, маски, выбор, смена окна, холсты и резкость, наведение, меню, CSS, видео
scripts/texture.mjs    фактура числом: слои зерна, σ по фонам, кипение, рецепт, compare донор против сайта; крупная фактура (мятая бумага, камень, ткань, доски) — плитка, её вид с уверенностью, шов, сила по секциям, рецепт --surface-*; selftest на fixtures/texture
scripts/grain-tile.mjs своя детерминированная шумовая плитка (PNG, спрайт, WebP, GIF) и её проверка
scripts/surface-tile.mjs  своя бесшовная плитка крупной фактуры: paper, pulp, stone, canvas; --like замер донора (вид, яркость, σ, размер, шаг ткани, направление волокон), --veins, --thread, --dir, --sheet лист стыков, --check готовый файл и его вид против донора; selftest
scripts/bgdecor.mjs    фон образца и свой: рисунки, буквы-призраки, предметы на полях, узоры, свечения — бледность и резкость края числом по трём снимкам, вырезки; строки «внутри карточек», «крупное за содержимым», «чего скрипт не меряет»; compare с решениями decor-decisions.json; selftest на fixtures/bgdecor (index, cal, cal2, cal3, tiles, overlay)
scripts/cliche.mjs     шаблонность: дефолты на живой странице против донора и журнала вкуса; Tilda — служебное вне индекса, кегли и радиусы × zoom; слова-пустышки — общий словарь copy-rules
scripts/taste.mjs      журнал вкуса между прогонами: отвергнутое и принятое с картинками, область site|general
scripts/media.mjs      фото и видео из законных бесплатных источников: doctor, search, pick, import, credits
scripts/media/         модули источников, обработки, видео и манифеста
scripts/recraft.mjs    Recraft API: SVG-иконки, иллюстрации, паттерны, фоны в палитре сайта; векторизация, фон, увеличение; трата только с --yes, на сайт — через take (ворота --seen/--caption, credits.json)
scripts/shots.mjs      снимки «до/после» на одинаковых экранах; возврат наверх сверяется с первым экраном
scripts/diff.mjs       где изменилась картинка: доля, полосы, картинка различий
scripts/perf.mjs       скорость с бюджетами: LCP с элементом, CLS, вес (холодный кэш, сжатие), долгие задачи по фазам, кадры/с, память, цена слоёв
scripts/a11y.mjs       контраст (с прозрачностью и зерном), кегль, alt, подписи, фокус (и на подписи), цели нажатия (с подписью), закреплённое на прокрутке
scripts/motion.mjs     движение числами: 20 видов и 5 по клику (меню, аккордеон свой и на details, вкладки, «Подробнее»), библиотеки; петли на JS — по разворотам: окно «время» 6 с, медленная петля (покачивание Framer 7–13 с) продлевает его до --time-cap 20 с; стопка одинаковых соседей — одна строка ×N, решение на неё `loop:<родитель> > *`; несколько страниц и экранов за запуск; compare донор → наш сайт (пары подряд); донор на Tilda — пункты из атрибутов (tilda.mjs) вместо замеров на тех же элементах, только то, что играет на этом экране; окна Tilda по хукам; selftest на fixtures/motion
scripts/clicks.mjs     что раскрывается по клику (аккордеоны Framer/Tilda и details, бургер, вкладки, aria-expanded, хуки Tilda #popup/#menuopen) и проверка кликом — одно правило для discover, motion и extract (design-reference); точка нажатия от видимого окна; обрезанное артбордом и служебное Tilda не нажимается; node clicks.mjs selftest
scripts/tilda.mjs      донор на Tilda: карта из атрибутов — блоки, Zero Block по брейкпоинтам (zoom), появления и SBS шагами, параллакс, хуки окон и меню, играет ли на экране; pages — типы страниц по подписи блоков; static — из голого HTML; selftest на fixtures/tilda
scripts/copy.mjs       тексты: штампы, канцелярит, «ИИ-ритм», жаргон, заполнители, придуманное (числа без источника, copy:stub) — список для владельца copy/invented.json; типограф (показ, запись по --write); пары «было → стало»; selftest на fixtures/copy
scripts/copy-rules.mjs каталог правил copy-* и словари (BUZZ — общий с cliche.mjs), типограф одного прогона
scripts/typeset.mjs    набор числами: знаков в строке, висячие предлоги, одинокие слова, выключка, переносы, шрифт каждого знака (CDP; Firefox — по unicode-range), синтетика пикселями, первый экран; --browser firefox; selftest на fixtures/typeset
scripts/requirements.mjs  реестр требований: источники, атомы с цитатой, критерии, связь с задачами, влияние, противоречия, проверки, отчёт; selftest на fixtures/requirements
scripts/ideas.mjs      банк идей: удачное с прошлых сайтов, где стояло, отзыв; pick — свежее под новый сайт
scripts/state.mjs      журнал задач и этапов: статусы только с доказательствами; режимы rework, mirror, donor, new; устаревание по правке сайта и по смене требования; show --json, probe
scripts/mirror.mjs     зеркало чужой страницы как верстак (rework.css / rework.js)
scripts/flags-doc.mjs  справочник флагов из кода → reference/flags.md; --check — сверка кода, -h и документации (вручную перед коммитом скилла)
scripts/serve.mjs      статический сервер (Range для видео, сжатие br/gzip как у хостинга, только эта машина); --proxy отдаёт остальное оригиналу
scripts/firecrawl.mjs  сбор данных облаком Firecrawl: map (адреса по типам страниц), scrape (текст, фирменный стиль), search, facts (кандидаты фактов со ссылками), status; кэш и бюджет кредитов на прогон; без ключа — пропуск; selftest на подставном сервере
scripts/fonts.mjs      выбор шрифта по образцу: measure (числа шрифта образца по отрисовке) → match (кандидаты с кириллицей из реестра источников) → sheet (лист для глаз) → decide (решение и лицензия — fonts/decision.json) → get — свои woff2 и fonts.css (unicode-range, swap; переменный — диапазон веса из файла), --text — подмножество под надпись; без образца — pick по характеру (--like по-русски), pairs из ui-ux-pro-max; латинская надпись — Fontshare (--latin; файлы не класть в публичный репозиторий); знаки по таблице cmap; порядок — reference/fonts.md; selftest на fixtures/fonts
scripts/fonts/sources.json  реестр источников шрифтов: Google Fonts, Fontshare (только латиница), Adobe Fonts (выключен) — лицензии и что можно; как добавить источник — reference/fonts.md
scripts/blender.mjs    предметы с объёмом в Blender (Cycles): doctor, render (прозрачный WebP), physics (твёрдые тела, ткань; видео), glb и glb-check (модель и просмотрщик на странице), vendor (three.js в сайт); selftest; справочник — reference/blender.md
scripts/blender/       Python для Blender: run.py (запуск по заданию JSON), studio.py (свет и материалы), physics.py, export.py
scripts/deploy-check.mjs  сверка выкладки: попадёт ли каждая страница и её файлы на бой (Dockerfile и .dockerignore, Vercel, Netlify, GitHub Pages, Caddy/nginx, package.json); --url — страницы на бою (до 50 запросов, только чтение); FAIL — код выхода 1, --no-fail — код 0; --selftest
scripts/security.mjs   безопасность и утечки: служебные файлы с сервера (/.env, /.git, резервные копии), админка и API без входа, формы, секреты в коде и репозитории (--repo), чужие скрипты и счётчики, заголовки; selftest на fixtures/security
scripts/skill-audit.mjs  чужой навык до установки: audit (папка, .zip, адрес GitHub — распаковка своим кодом, ничего не запускается; хуки, команды при загрузке, скачать-и-выполнить, отправка наружу, секреты, обфускация, невидимые знаки, широта описания, лицензия) и install одной папки с ORIGIN.txt и списком пересечений; selftest на fixtures/skill-audit
scripts/fixtures/motion/   стенд всех видов движения для motion.mjs selftest (и JS-петли: стопка ×3 с разными периодами, парение, пульс; пружина — data-expect-not)
scripts/fixtures/<скрипт>/ стенды selftest: lib (свой запуск: node scripts/fixtures/lib/selftest.mjs), runtime, a11y, perf, cliche, security, media, state, firecrawl (подставной сервер), fonts (выжимки ui-ux-pro-max, живые ответы CSS2, woff2 надписи), clicks, copy, typeset, requirements (.docx две версии, чат, расшифровка), tilda (выжимки сохранённых страниц), texture (зерно, вуаль, крупная фактура, ровный фон — плитки рисуются на лету), bgdecor (стенд-донор со всеми видами украшений и «наш сайт» для сверки); clicks/tilda.html и motion/tilda.html — Tilda-донор (скрипты Tilda заменены имитацией)
templates/grain.css    слой зерна: отдельный элемент, @media по ширине, кипение сдвигом
templates/surface.css  слой крупной фактуры: плитка в фоне блока, multiply на светлых и цветных полях, color-burn на тёмных (своя плитка для тёмных — --surface-tile-dark), выключена в печати
templates/blender/     сцены-образцы Blender (рендер предметов с объёмом — только он): icon.py, icons.py (значки набором), honeycomb.py, sprout.py, ribbon.py, stack.py и drape.py (физика), cards.json; viewer.html и viewer.js — GLB на странице; порядок, планка качества, цена кадра — reference/blender.md
templates/sketch2d/    наброски от руки в фон: sketch-kit.mjs (фигуры кодом) → svg3d.mjs rough; botanical.mjs — образец; README
templates/run-tools/   разовые инструменты прогона (не скрипты навыка, вердиктов не дают): look, tops, slices, scroll-shots, frames (frames.mjs — поведение во времени: загрузка, покой, шапка при прокрутке, наведение, клик — листы кадров и frames.json), states (+ states.example.json), contrast-at, gzip-proxy, img-variants, css-dead, strings, typo, run-env; README
templates/copy-prompt.md  задание агенту «Тексты»: факты, образец голоса, признаки машинного текста, проверка абзаца
templates/decor-kit/   детали для красоты: decor-kit.css и decor-kit.js (ES-модуль без зависимостей) — строки из-под маски, рисунок линией, цитата по словам, шторка фото, заливка автосмены, табло цифр, бледные слова, россыпь, печать с фактами, надписи-логотипы, мотивы разделов; README (подключение, правила своих рисунков, что проверить), demo.html — образец
reference/tool-registry.md   что есть, когда чем пользоваться, чем заменять
reference/flags.md           флаги всех скриптов обоих скиллов: вид, строка справки, коды выхода, env, strict (собирается flags-doc.mjs)
reference/discovery.md       визуальный разбор словами, паспорт, фактура, дизайн-система, референсы
reference/donor-mode.md      новый сайт на языке донора: снять, паспорт, граница, сверка
reference/authorship.md      каталог дефолтов, паспорт донора, решение по блоку, компоненты без донора, журнал вкуса
reference/analysis.md        разбор запроса, матрица менять/сохранять, воронка UX, тексты, приоритеты
reference/engines.md         картинки и видео, фактура, 3D, движение, телефон, правила реализации
reference/motion.md          движение: снять у донора, перенести числами (рецепты по видам), своё и банк идей, сверка
reference/craft.md           полировка и движение: impeccable и навыки Эмиля Ковальски — где лежат, на каком шаге что читать, правила, короткий список проверки, где главнее site-rework
reference/qa.md              проверки: runtime и автопроверки состояния, визуал, функции, телефон, скорость, доступность
reference/copy.md            тексты: голос бизнеса, факты, заголовки, кнопки, формы, приёмы с разобранных сайтов, типограф, доказательство
reference/typography.md      длина строки, интерлиньяж, шкала и clamp, ритм, гарнитуры и кириллица, знаки, неразрывные пробелы, переносы, первый экран, тёмная тема, загрузка шрифтов, ориентиры с живых сайтов
reference/new-site.md        сайт с нуля: реестр требований, вопросы, веб-сервис и демо, направления, план, изменения по ходу, сверка
reference/donor-tilda.md     донор на Tilda: чему верить, zoom, движение Tilda → наши рецепты, что не переносить
reference/security.md        безопасность и утечки: что проверяет security.mjs и типовые исправления
reference/firecrawl.md       когда брать Firecrawl и когда нет, стоимость команд, бюджет, остаток кредитов
reference/skills-search.md   чужие навыки: где искать (Skillry, anthropics/skills, списки, проверенные авторы), как выбрать, проверка skill-audit, установка, видимость и пересечения
templates/brief.md           форма запроса
templates/report.md          форма отчёта
ui/brief-form.html           форма в браузере, собирает текст брифа
```
