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
