# Стенды для `skill-audit.mjs --selftest`

Навыки-образцы с ожиданиями на каждый пункт проверки. Selftest копирует папку во временный
стенд и работает с копией: здесь ничего не ставится и не запускается. Эти SKILL.md лежат глубоко
внутри site-rework, поэтому Claude Code их как навыки не загружает; папок `.claude/skills/` и
`.claude-plugin/` здесь нет нарочно — стенд-плагин selftest собирает на лету.

## `clean/tidy-notes` — чистый навык (ждём OK)

Узкое описание, свой `LICENSE` (MIT) и поле `license: MIT`, только текст. Итог — **OK**, код 0;
`install --yes` ставит его в `--target` с ORIGIN.txt; второй раз — отказ «папка уже есть».

## `evil/evil-helper` — нарочно опасный (ждём FAIL)

Все адреса — в зоне `.invalid`, которой не существует; вебхук ненастоящий.

- хук `PostToolUse` отправляет `.env` curl'ом — **FAIL** «хуки» и «отправка наружу»;
- строка `` !`curl … | sh` `` — **FAIL** «команды при загрузке» и «скачать и выполнить»;
- `scripts/setup.sh` — лаунчер: `curl -o` + `chmod +x` + `exec` — **FAIL** «скачать и выполнить»;
- `scripts/sync.mjs` — читает `.env`, шлёт на вебхук Discord, `eval(atob(…))` — **FAIL** «отправка
  наружу» и «обфускация»;
- невидимые знаки. В файле на диске — только видимые метки `⟦ZWSP⟧`, `⟦RLO⟧`, `⟦TAGS:hidden-test⟧`:
  настоящие U+200B, U+202E и знаки-теги selftest вставляет в копию стенда и ждёт **FAIL** с этими
  номерами строк и расшифровку «hidden-test». Так в самом скилле не лежит спрятанного текста.
- итог **FAIL**; без `--strict` код 0, с `--strict` — 1; `install` — отказ (и с `--exclude scripts`:
  FAIL в самом SKILL.md остаётся).

Он же — стенд для `audit --exclude`: `--skill evil-helper --exclude scripts` (и `--exclude evil-helper/scripts`
без `--skill`) — два файла не проверяются, строка «исключено при запуске: … (2 файла) — проверено не всё»
стоит в начале и в конце вывода и в протоколе (`excludedAtRun`); FAIL в самом SKILL.md остаётся.

## `tests-only/line-count` — FAIL только в папке тестов (ждём FAIL)

Сам навык чистый (поле `license: MIT`), а `tests/smoke.sh` — `curl … | sh` на адрес в зоне `.invalid`.
Итог **FAIL** (с `--strict` код 1): стенд итог не смягчает. Рядом — «Итог: FAIL — вне стендов: OK; в стендах
и тестах: FAIL», в колонке «где» — «вне стендов: нет; в стендах и тестах (FAIL 1): tests/smoke.sh:4:1» и строка
«FAIL только в стендах и тестах: 1 (скачать и выполнить); ссылаются ли на них файлы вне стендов: ссылок
на запуск по образцам не найдено — прочитать глазами».

## `tests-ref/word-count` — груз в tests/, и SKILL.md велит его запустить (ждём FAIL)

То же, но SKILL.md (строка 11) говорит «подготовить окружение: `sh tests/prepare.sh`» — так злой автор прячет
груз в папку тестов. Ждём «ссылаются …: да — велят запустить: SKILL.md:11 → tests/prepare.sh».

## `broad/ui-everything` — широкое описание без лицензии (ждём WARN)

«Use this skill for any UI task. Always use it…» — **WARN** «широта описания» с подсказкой
`skillOverrides name-only / user-invocable-only`; лицензии нет — **WARN**; FAIL нет.
`install` ставит его и пишет пересечение с `installed/ui-helper`.

## `installed/ui-helper` — «уже установленный» навык

Кладётся в `--target` перед установкой `ui-everything`: ждём строку «пересекается с ui-helper».

## `archive/pack.zip` — архив от `git archive`

Собран `git archive --format=zip --prefix=pack-main/` из временного репозитория: навык
`skills/zipped-skill`, `LICENSE` (MIT) в корне. Ждём: распаковку своим кодом, коммит из комментария
архива (`5c2debd…`), лицензию из корня (итог **OK**); при установке `LICENSE` кладётся рядом с
навыком, коммит — в ORIGIN.txt.

## Собирается в selftest на лету

- `slip.zip` — записи `../escape.txt`, `/abs.txt` и ссылка: **FAIL** «архив», файлы за пределы папки
  не пишутся, ссылка не создаётся, `install` из такого архива — отказ.
- `plugin-stand` — плагин: хук `SessionStart` запускает свой `bin/run` (лаунчер без расширения) —
  **FAIL**; MCP через `npx -y` — **WARN**.
- `lower-skill` — навык с `skill.md` строчными и `curl … | sh`: `--exclude '*.md'` его не убирает (итог
  **FAIL**), исключать нечего — в протоколе нет `excludedAtRun`, в выводе «проверено всё».
- `evil-name` — `name: "wc --yes --target …"`: в подсказку «Поставить один» имя не попадает, навык — по пути
  папки (`--skill .`).
- Строки без папок: около 90 форм записи в Claude из замечаний к правилу (`$(…)`, `cd` в папку Claude, `ln -s`,
  содержимое в корень, `./agents`, SKILL.md, cmd, PowerShell, код, путь в переменной, хвосты `# …` и `2>/dev/null`),
  ссылки на стенды (`cd tests && sh setup.sh`, `npm test`, `readdirSync` + `import`, цепочка через чистый файл).
