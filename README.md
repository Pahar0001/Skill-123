# site-rework — навык Claude Code

Переработка сайта по адресу и запросу, новый сайт в языке сайта-донора или сайт с нуля по ТЗ: разведка
в браузере, разбор донора, план, правки, проверка (консоль, вёрстка, контраст, набор, скорость, движение,
шаблонность, безопасность) и отчёт со статусами только по доказательствам. Порядок работы — `SKILL.md`,
справочники — `reference/`, скрипты — `scripts/` (у каждого `-h` и самопроверка).

## Схема, план и журнал

| файл | что в нём |
| --- | --- |
| `docs/skill-map.html` | схема навыка: шесть шагов работы, скрипты на каждом шаге, что подключено и в каком состоянии. Открыть в браузере |
| `ROADMAP.md` | что решено сделать и ещё не сделано — по порядку важности |
| `docs/SKILL-ISSUES.md` | журнал неточностей навыка: всё, что нашли прогоны и проверки, с пометкой «открыто» или чем закрыто. Новые находки записывать сюда же, сразу |

Перед правкой навыка — `git pull`, затем `ROADMAP.md` и последний раздел журнала: ловушки там уже записаны
(пример — `fs.cpSync` на пути с кириллицей под Windows).

## Ветки

| ветка | что | куда ставить |
| --- | --- | --- |
| `main` | навык site-rework | `~/.claude/skills/site-rework/` |
| `design-reference` | навык design-reference: снять дизайн с образца, сверить числами, проверить кириллицу шрифта; им пользуются скрипты site-rework | `~/.claude/skills/design-reference/` |

## Установка

Нужны Node.js 22+, Chrome, git; Firefox — по желанию (`--browser firefox`).

```bash
git clone -b main https://github.com/KIMota777/skill-sites.git ~/.claude/skills/site-rework
git clone -b design-reference https://github.com/KIMota777/skill-sites.git ~/.claude/skills/design-reference

mkdir -p ~/.claude/site-rework && cd ~/.claude/site-rework
cp ~/.claude/skills/site-rework/templates/deps/package.json ~/.claude/skills/site-rework/templates/deps/package-lock.json .
cp ~/.claude/skills/site-rework/templates/deps/.env.example .
npm ci
```

`~/.claude/site-rework/` — рабочая папка вне git: зависимости (puppeteer-core, sharp, ffmpeg-static), ключи
в `.env`, прогоны в `runs/`. Ключи в репозиторий не кладутся: шаблон — `.env.example`; без ключа источник
просто пропускается.

Проверить, что всё встало: `node ~/.claude/skills/site-rework/scripts/runtime.mjs --selftest`.

## Навыки и сервисы рядом

Необязательны, но на них опираются справочники:

- [impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0) — читаются только его `reference/*.md`;
  лаунчер `scripts/` скачивает и запускает бинарник — его не ставить;
- [навыки Эмиля Ковальски](https://github.com/emilkowalski/skills) (MIT): emil-design-eng, animate,
  review-animations, improve-animations, find-animation-opportunities, animation-vocabulary, apple-design,
  mobile-native, prototype, pick-ui-library;
- [motion](https://github.com/motiondivision/ai-kit) (MIT) и MCP `claude mcp add --transport http --scope user motion https://mcp.motion.dev`;
- ui-ux-pro-max (MIT) — база шрифтов Google с признаком кириллицы для `scripts/fonts.mjs`;
- MCP chrome-devtools — браузер для «глаз и кликов» агента:
  `claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@latest --headless --isolated`.

Видимость, чтобы они не перехватывали чужие задачи (`~/.claude/settings.json`):

```json
"skillOverrides": { "motion": "name-only", "ui-ux-pro-max": "user-invocable-only" }
```

## Запуск

В Claude Code: `/site-rework` и адрес сайта с запросом («сделай дороже», «переделай в стиле https://…»,
«вот ТЗ — сделай сайт с нуля»). Все флаги — `reference/flags.md`.
