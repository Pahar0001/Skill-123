#!/usr/bin/env node
/**
 * Проверка в живом браузере того, что статикой не проверить: консоль, холсты
 * (рисуют ли и резкие ли), клики и их настоящий эффект, поля с маской, наведение,
 * меню, анимации, видео, выброшенный браузером CSS, переполнение по ширине.
 *
 *   node runtime.mjs <url> [--viewport mobile] [--out папка] [--tag имя] [--browser firefox]
 *        [--reduced-motion] [--scheme dark] [--cpu 4] [--no-fail] [--init "js"] [--keep-consent]
 *   node runtime.mjs [шаги и настройки] -- <url>      «--» — конец флагов, дальше только адрес
 *
 *   --viewport  desktop | laptop | tablet | mobile | mobile-s (320×568@2) | android (360×800@3)
 *               | ШxВ@плотность («320x568@2») | одна ширина («320»)
 *               --viewports — то же самое. Экран один за запуск: список «mobile,desktop» —
 *               ошибка (код 2), запускайте по разу на экран
 *
 *   значения: шаг или настройка берёт следующее слово, если это не шаг, не флаг этого
 *   скрипта и не «--»: «--hover --scroll» и «--hover --» — ошибка «--hover: нужно
 *   значение» (код 2). Значение, которое начинается с «--», пишется через «=»:
 *   --hover="--x". Флаги без значения тоже пишутся через «=»: =0, false, no, off, нет —
 *   выключено, любое другое значение — включено. Настройка (--no-fail, --reduced-motion):
 *   --no-fail=0 — провалы снова дают код 1. Шаг (--scroll, --css, --canvas…): --scroll=0
 *   и --css=нет — шаг не выполняется (строка об этом в stderr).
 *   Неизвестный флаг — и --foo, и с одним дефисом (-v; -h — справка) — ошибка (код 1) с подсказкой
 *   ближайшего («может быть, --scroll?»), до браузера. Известный флаг с одним дефисом («-viewport mobile») —
 *   ошибка (код 2) «флаг пишется с двумя дефисами»: иначе прогон молча шёл бы на desktop.
 *   Настройка дважды с разными значениями (--viewport, --out, --tag, --scheme, --cpu,
 *   --browser) — ошибка (код 2); --wait — не больше 600000 мс.
 *   Следующее слово он забирает значением, только
 *   если это не флаг, не «--» и не адрес (http, https, file, data, about):
 *   «--strict http://localhost:4177/ --css» — WARN про --strict, адрес на месте.
 *   Все ошибки аргументов — до папок и браузера.
 *
 *   «--» — конец флагов: следующее слово — адрес, даже если начинается с «-» («-- -h» —
 *   адрес «-h», не справка). Слова после адреса — ошибка (код 2), поэтому --out, --tag
 *   и шаги пишутся ДО «--»: node runtime.mjs --out папка --css -- http://localhost:4177/
 *
 *   шаги, выполняются в порядке записи:
 *        --wait 800            подождать столько миллисекунд (число ≥ 0, «0» — не ждать;
 *                              не число — код 2)
 *        --scroll              прокрутить до конца: появления, закреплённые, переполнение
 *                              по элементам (FAIL — торчит за край или можно уехать вбок;
 *                              WARN — страница шире окна, текст шире коробки, обрезан панелью).
 *                              Блок шире своей колонки — WARN «блок шире своей колонки: h2.title на 16.8 px (CSS px;
 *                              за правый край колонки div.col …)»: коробка блока с видимым текстом (или его предка)
 *                              вылезла за контентную коробку колонки — ближайшего предка-блока — от 1 CSS px, и вылезшее
 *                              видно (h2 с неразрывным пробелом в грид- или флекс-колонке: текст в h2 влезает, а h2 — нет).
 *                              Не в счёт: колонка обрезает или прокручивает (лента с прокруткой, обрезка с многоточием),
 *                              блок вне потока (absolute, fixed), сдвинут transform или relative, вынесен отрицательным
 *                              полем (на всю ширину по замыслу), декор (aria-hidden, role presentation/none у самого).
 *                              Страница шире окна на 1 px (scrollWidth 321 при окне 320; допуск lib — 1 px) — тоже WARN,
 *                              с именем элемента правее окна.
 *                              «Ждали появления» — прозрачное или сдвинутое ниже первого экрана;
 *                              «не появились» (WARN) — не стало видно ни на одном шаге прохода.
 *                              Поля формы (input, select, textarea, option) и прозрачное, у которого
 *                              прозрачность не менялась ни на одном шаге, без перехода, анимации и
 *                              признаков появления (классы и data-атрибуты reveal, fade, aos…), —
 *                              отдельно «невидимы по замыслу», без WARN (радиокнопка с opacity 0
 *                              поверх подписи — приём оформления, а не сломанное появление).
 *                              Блоки появления названы селектором и началом текста. Подсказки при
 *                              наведении — не появления при прокрутке: не появившееся за проход, что
 *                              совпало с целью правила «показать при наведении» (цель — другой элемент,
 *                              «.item:hover .tip», объявлено opacity от 0.9 или visibility: visible),
 *                              проверяется настоящим наведением на триггер; показалось — отдельно
 *                              «показываются при наведении», без WARN. Приглушение соседей
 *                              («.grid:hover .card { opacity: .6 }») и правило, проигравшее по
 *                              специфичности, — не показ: блок остаётся в «не появились» (WARN).
 *                              Содержимое закреплённого (position: fixed у предка: рельс, шапка, меню)
 *                              прокруткой не въезжает и не отмечается; обёртка на всю страницу, в
 *                              которой едет содержимое (GSAP ScrollSmoother, #smooth-wrapper: видима,
 *                              закрывает окно, содержимое выше полутора окон, от трети элементов
 *                              страницы), — это страница: её блоки появления проверяются как обычные.
 *                              Закрытое меню на весь экран обёрткой не считается.
 *                              Отдельной строкой — «текст перекрыт картинкой»: OK или WARN с числом мест
 *                              и селекторами (img, video, canvas, svg от 40px поверх чужого текста).
 *                              Вертикальное письмо (writing-mode: vertical-*, sideways-*): вдоль строки
 *                              (по высоте) — допуск 5% кегля, поперёк (по ширине) — ещё край глифа
 *                              (половина разницы между высотой шрифта и line-height): вкладка с
 *                              line-height: 1 не «текст шире коробки», а кегль 40px в коробке 12px —
 *                              находка. Перед прокруткой открыт слой на весь экран
 *                              (меню, диалог :modal — например, после --click "#burger") — WARN
 *                              «прокрутка идёт при открытом меню/диалоге»: пишите --scroll до --click
 *        --hover "sel"         навести и записать, что изменилось в стилях (и почему нет): цвет, фон
 *                              (в том числе background-size, -image, -position), рамка, тень,
 *                              transform, opacity, clip-path, фильтр
 *        --hover-all           каждое правило :hover из CSS: меняет ли объявленное; мёртвое —
 *                              FAIL с причиной (держит анимация fill both/forwards); перебитое
 *                              другим правилом — WARN; «мёртвый селектор» (цели правила нет в DOM:
 *                              «.item:hover .tip», а .tip нет) — WARN отдельной строкой: вернуть
 *                              элемент или удалить правило, каскадом это не чинится
 *        --click "sel"         кликнуть: эффект — изменения DOM (MutationObserver), адрес,
 *                              запросы, фокус на другом элементе, диалоги. Своя прокрутка и
 *                              фокус на нажатом — не эффект. Кнопка без эффекта — FAIL.
 *                              Элемент вне окна — перед кликом страница прокручивается к нему: в строке «перед кликом
 *                              прокручено к элементу на N px вниз (scrollY a → b)» (или «прокрутился контейнер»), в JSON —
 *                              data.preScroll { px, dir, fromY, toY, how }; снимок после клика — со сдвинутой страницей.
 *                              Якорь «#id»: дождаться остановки прокрутки и сверить верх цели с ожидаемым местом —
 *                              scroll-margin-top цели + scroll-padding-top страницы, ±8 px: совпал — OK; без
 *                              scroll-margin цель у верха окна или сразу под закреплённой шапкой — OK; низ страницы
 *                              (дальше не прокрутить) — OK. Цель видна и не перекрыта, но не там (страница прокручивает
 *                              своим обработчиком: отступ = лента + 12) — WARN «цель не у scroll-margin». FAIL — только
 *                              начало цели (первая строка текста) под закреплённым слоем (шапка, лента — по
 *                              elementFromPoint) или вне окна.
 *                              Клик открыл слой на весь экран (меню, диалог: fixed или :modal, видим, от 80% окна; до
 *                              клика его не было) — до 15 нажатий Tab: фокус ушёл на элемент вне слоя и под ним
 *                              (elementFromPoint в центре — слой; или вне окна) — WARN «фокус уходит из открытого слоя на
 *                              страницу под ним: <первый такой>»; остался в слое (или над ним: кнопка меню поверх) — OK;
 *                              слой закрылся, когда фокус ушёл, — OK с пометкой, что дальше он закрыт. После проверки
 *                              фокус и прокрутка — как были, слой не закрывается
 *        --type "sel=текст"    ввести текст и проверить, что он в поле (tel: 8… = +7…);
 *                              делится по первому «=» вне [ ], ( ) и кавычек:
 *                              --type "input[name=phone]=89001234567".
 *                              Поля date, time, datetime-local, month, week и значение в формате поля
 *                              (2026-10-10, 20:30, 2026-10-10T20:30, 2026-10, 2026-W41) — значение
 *                              ставится с событиями input и change, как выбор в календаре (набор
 *                              клавишами идёт по локали браузера: «2026-10-10» в дд.мм.гггг дал бы
 *                              «61010-02-20»); другое значение («10.10.2026») набирается клавишами.
 *                              Сверка — с тем, что поле приняло до событий: «2026-10-10T20:30:00»
 *                              браузер сам хранит как «2026-10-10T20:30» (OK с пометкой); поменялось
 *                              после input/change — FAIL «обработчик страницы переписал значение»
 *        --edit "sel"          поле с маской: набор, Backspace до конца, правка в середине,
 *                              Delete, вставка «8 (900) …», Ctrl+A+Backspace
 *        --key Tab             нажать клавишу: где фокус, значение и курсор поля
 *        --select "sel=знач"   выбрать вариант списка (value или текст варианта); делится так же,
 *                              как --type: "select[name=work]=6", "#sel=a=b" → вариант «a=b».
 *                              Значение не выбралось — FAIL; вариант или список disabled — FAIL
 *                              до выбора (человек его не выберет, а программно он ставится).
 *                              Список внутри формы, от которого страница не меняется, — OK со
 *                              значением (поле формы); вне формы — WARN «после выбора ничего
 *                              не изменилось»
 *        --resize 1152         сменить ширину окна (или ШxВ — 834x1112, 834X1112, 834×1112;
 *                              или rotate — повернуть); ширина и высота больше 0
 *        --canvas              холсты: рисует ли (снимок с холстом и без), меняется ли кадр,
 *                              резкость буфера: FAIL — буфер меньше 0.85 ширины в CSS px,
 *                              WARN — меньше 0.85 от ширины × DPR, 2D с искажёнными пропорциями.
 *                              ПУСТОЙ (FAIL) — с причиной по кадрам WebGL, которые считает перехват:
 *                              «ни разу не рисовала на этом холсте»; «рисует только по событию —
 *                              показанный кадр потерян» (без preserveDrawingBuffer браузер его не
 *                              восстанавливает: preserveDrawingBuffer или перерисовка по
 *                              visibilitychange / IntersectionObserver); «буфер сменил размер после
 *                              последнего кадра — кадр стёрт» (перерисовка после смены размера)
 *        --motion              анимации: идут, бесконечные, закончились и держат свойство;
 *                              «меньше движения» — в отдельной вкладке
 *        --video               видео: poster, muted/playsinline, играет ли, пауза вне экрана
 *                              и при «меньше движения»
 *        --nav                 меню: подсвеченный пункт ведёт на раздел, который на экране
 *                              (верх, каждый раздел, низ, снова верх). Меню с тремя и более якорями
 *                              на разделы нет (многостраничный сайт) — INFO «якорей нет», не WARN.
 *                              Якоря меню без цели (ни id, ни <a name> на странице) от трёх — WARN
 *                              «якоря меню ведут в никуда» со списком, один-два — поимённо в INFO
 *                              («#top», «#/…», «#!…» и «#…:…» не в счёт); якоря на <a name> (Tilda) —
 *                              INFO «не проверялось»
 *        --css                 объявления CSS, которые браузер выбросил: файл:строка
 *        --eval "js"           выполнить выражение (можно Promise) и записать результат;
 *                              сразу за ним --expect "значение" — FAIL, если не совпало.
 *                              Результат целиком — в JSON (steps[].details); в консоли — начало
 *                              результата (300 знаков) и сколько осталось, выражение — в конце строки
 *        --assert "js"         FAIL, если результат ложный или Promise отклонён
 *        --shot имя            снимок экрана
 *        --fullpage            снимок всей страницы <tag>-full.png (второй — <tag>-full-2.png): масштаб — --full-scale,
 *                              по умолчанию ×1 (пиксель снимка = CSS px; на телефоне ×2 выходило 780×14962 — не открыть
 *                              глазами). В строке — размер файла и масштаб. Страница выше трёх окон — ещё части по два
 *                              окна (<tag>-full-partN.png, не больше 12): их и открывать. iframe на странице (карта, видео,
 *                              виджет, от 60×60) — пометка «на снимке всей страницы бывают серыми или обрезанными» и снимок
 *                              окна с каждым (первые три, <tag>-NN-iframeN.png); в JSON — data.iframes, parts, scale
 *   после --click, --select и --resize холсты и переполнение перепроверяются сами
 *   (после конца переходов).
 *   не шаги, а настройки:
 *        --init "js"           код до всех скриптов страницы (например, PerformanceObserver)
 *        --cpu 4               процессор в N раз медленнее (только Chrome и Edge)
 *        --scheme light|dark   цветовая схема (по умолчанию light)
 *        --browser chrome|firefox|edge  в каком браузере проверять (по умолчанию chrome; ff и msedge —
 *                              тоже). Первая строка вывода — браузер прогона и браузер пользователя
 *                              по умолчанию (Windows, реестр): «у пользователя по умолчанию Firefox —
 *                              проверьте и в нём: --browser firefox». Без --tag протокол не Chrome —
 *                              <экран>-firefox.json, <экран>-edge.json (Chrome-протокол не затирается).
 *                              Firefox — через WebDriver BiDi; чего у него нет, то WARN «не поддерживается
 *                              в Firefox», а не падение: --cpu (замедление — протокол Chrome), --scheme
 *                              no-preference, на телефоне — meta viewport и события касания (размер,
 *                              плотность, агент, (hover: none) и (pointer: coarse) есть). Байты по сети —
 *                              только по content-length, тип запроса — по Sec-Fetch-Dest. Тема и «меньше
 *                              движения» у Firefox задаются при запуске, поэтому вкладка «меньше движения»
 *                              у --motion и --video — отдельный Firefox. Edge — движок Chrome, всё как в
 *                              Chrome (на машине, где Edge без окна не запускается, — понятная ошибка).
 *                              --browser есть у runtime.mjs и shots.mjs; остальные скрипты — только Chrome
 *        --expect-status 404   ждать такой ответ самого документа (страница ошибки открыта нарочно):
 *                              совпал — INFO «ответ документа 404, как ждали», и строка консоли
 *                              «Failed to load resource: … 404» этого документа — не ошибка страницы;
 *                              не совпал — FAIL. Без флага ответ документа 4xx/5xx в Chrome — FAIL
 *                              «ошибки в консоли», как раньше (с подсказкой про этот флаг)
 *        --keep-consent        не закрывать окно согласия cookie и ворота-заставку («ENTER», «Мне есть 18») —
 *                              чтобы проверить само окно; строка INFO «оставлено (--keep-consent)». По умолчанию
 *                              runtime закрывает их после загрузки, до шагов (как discover и cliche): кнопкой «Принять»
 *                              / «Accept» / «Согласен» / «OK», если её нет — «Отклонить», затем крестиком. Иначе окно
 *                              давало ложные тревоги: клик по кнопке под ним уходил в окно («КНОПКА БЕЗ ЭФФЕКТА»), замеры
 *                              шли под ним. Итог — строкой INFO «окно cookie» (или «ворота-заставка»): не появлялось /
 *                              закрыто кнопкой «…» (где, размер); не закрылось — WARN; в JSON — consent. Нажатие
 *                              перезагрузило страницу — дождаться; увело — нужная страница открывается заново.
 *                              SITE_REWORK_DISMISS нажимается и с --keep-consent (переменную задали явно), а окно
 *                              согласия его второй раз не жмёт
 *        --full-scale 1|2|3|4|dpr  масштаб снимка --fullpage (как у shots.mjs): 1 — по умолчанию, dpr — как у экрана;
 *                              длиннее 120 млн пикселей — ×1 с пометкой в строке
 *        --out папка, --tag имя  папка прогона и имя протокола
 *        --no-fail             код выхода 0 даже при провалах
 *        --selftest            прогнать стенды fixtures/runtime/*.html (форма, наведение, прокрутка,
 *                              подсказки против сломанного появления, страница в закреплённой обёртке
 *                              и закрытое меню на весь экран, вертикальное письмо, меню на весь экран,
 *                              со сломанными якорями и с якорями <a name>, первый экран на position:
 *                              fixed, якоря при своей прокрутке страницы под закреплённой лентой, блок шире
 *                              своей колонки на 320 и то, что им не считается, фокус в открытом слое — без
 *                              ловушки, с ловушкой и слой, который закрывается сам, окно cookie поверх кнопки —
 *                              закрыто и оставлено с --keep-consent, предупреждения консоли) и свои серверы
 *                              (страница 404 с --expect-status и без, сторонний iframe с упавшей картинкой, iframe с битой ссылкой — документ 404 — того
 *                              же и другого сайта), окна при загрузке (стенды fixtures/lib: окно — WARN;
 *                              SITE_REWORK_DISMISS увёл на шумную главную — нужная страница открыта
 *                              заново, в счёте только её консоль и запросы; то же в Firefox на file://,
 *                              если он есть; страница снова уводит — «замер не той страницы») и сверить
 *                              строки протокола с ожидаемыми; код 1 — что-то разошлось. Адрес не нужен,
 *                              браузер — один за раз, около трёх минут
 *        -h, --h, --help       эта справка (ничего не создаёт и не запускает); --help=… —
 *                              тоже справка. Ищется только до «--»: после него — адрес
 *
 * Упавшие запросы: свои (главная страница и её iframe того же сайта) — WARN «упавшие запросы»;
 * запросы сторонних iframe (реклама и счётчики внутри карты Яндекса, видео) — отдельной строкой INFO:
 * сайт их не чинит. Документ самого iframe (битая ссылка на виджет: ответ 404, отказ соединения) — запрос
 * страницы, которая его вставила: WARN «упавшие запросы», а его строка консоли — ошибка страницы.
 *
 * Предупреждения консоли (console.warn страницы) — в конце строкой INFO: сколько их и тексты первых десяти, по
 * 160 знаков; в JSON — console.warnings (число) и console.warningTexts (первые 10 целиком, до 300 знаков).
 *
 * Выход: <папка>/runtime/<tag>.json, снимки рядом и протокол с вердиктами
 * OK / WARN / FAIL (INFO — сведения, на вердикт не влияют). У шага вердикт — поле status, текст —
 * what и details; итог прогона — verdict верхнего уровня. Коды выхода:
 *   0 — провалов нет (WARN код не меняет) или задан --no-fail; справка; --selftest сошёлся;
 *   1 — ошибки консоли или проваленные шаги; --selftest разошёлся; нет адреса (если адрес ушёл
 *       значением флага, сообщение это называет); неверный адрес; неизвестный экран; страница не открылась;
 *   2 — ошибка в аргументах, до папок и браузера:
 *       · нет значения: шаг или настройка — последнее слово, следующим идёт шаг, флаг
 *         или «--», пустое значение («--tag ""», «--shot=»);
 *       · «--expect» не сразу за «--eval»;
 *       · --type / --select без «=» или с пустым селектором;
 *       · --resize — не ширина больше 0, не ШxВ и не rotate;
 *       · --wait — не число миллисекунд ≥ 0;
 *       · --scheme — не light, dark или no-preference;
 *       · --cpu — не число больше 0;
 *       · --browser — не chrome, firefox или edge;
 *       · --expect-status — не код ответа 100–599;
 *       · --full-scale — не 1–4 и не dpr;
 *       · --viewport / --viewports: список экранов через запятую, пустое значение
 *         или разные экраны у --viewport и --viewports;
 *       · лишние слова после адреса — в том числе после «--».
 * 404 на /favicon.ico — WARN «нет favicon», не провал загрузки.
 * Карта импортов при загрузке (разметка, в любом браузере): <script type="importmap"> должен стоять
 * раньше любого <link rel="modulepreload"> и <script type="module"> (встроенного тоже) и не после
 * заголовка Link: rel=modulepreload — иначе WARN «карта импортов после modulepreload/module-скрипта —
 * Firefox её отбросит» (Chrome прощает, в Firefox import('three') по имени падает); вторая карта —
 * WARN «Firefox примет только первую». Карта на месте — строка OK.
 *
 * Вердикт OK означает «в браузере произошло то, что ожидалось». Красиво ли
 * это — отвечает только снимок, открытый глазами.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  flagsDump, closestFlag, launch, preparePage, gotoRetry, waitForOverlay, scrollThrough, fullPageShot, resolveViewport, runDir, writeJson, sleep, ensureDir, loadSharp,
  scrollToY, settleAnimations, findOverflow, canvasList, evaluateWith, SIG_FN, EFFECTIVE_OPACITY_FN,
  parseBrowser, browserInfo, defaultBrowser, defaultBrowserHint, resourceTypeOf,
  collectWarnings, takeWarnings, collectNotes, takeNotes, warningLabel, onPageLogReset, findBrowser,
  closeConsent, consentNote, resetPageLog,
} from './lib.mjs';

/* ---------- аргументы: шаги в порядке записи ---------- */
const argv = process.argv.slice(2);
const STEP = new Set(['wait', 'scroll', 'hover', 'hover-all', 'click', 'type', 'edit', 'key', 'select', 'resize', 'canvas', 'motion', 'video', 'nav', 'css', 'eval', 'expect', 'assert', 'shot', 'fullpage']);
/* без значения: шаги-флаги и настройки-флаги */
const FLAG = new Set(['scroll', 'hover-all', 'canvas', 'motion', 'video', 'nav', 'css', 'fullpage', 'reduced-motion', 'no-fail', 'keep-consent', 'selftest', 'help', 'h']);
/* настройки со значением */
const OPTS = new Set(['viewport', 'viewports', 'out', 'tag', 'scheme', 'cpu', 'init', 'browser', 'expect-status', 'full-scale']);
/* справочник флагов (flags-doc.mjs, RW_FLAGS_DUMP=1): списки выше и выход с кодом 0 — до справки и разбора */
flagsDump({ steps: [...STEP], flags: [...FLAG].filter((f) => !STEP.has(f)), values: [...OPTS], optional: [], commands: [] });
const usage = (msg) => { console.error(msg); process.exit(2); };
const short = (s, n = 60) => String(s).replace(/\s+/g, ' ').slice(0, n);
/* имя флага из слова: «--scroll», «--scroll=1» → scroll; «-h» → h; не флаг → null */
const nameOf = (s) => { s = String(s); if (s === '-h') return 'h'; if (!s.startsWith('--') || s === '--') return null; const k = s.slice(2); const e = k.indexOf('='); return e > 0 ? k.slice(0, e) : k; };
const isKnown = (s) => { const n = nameOf(s); return n != null && (STEP.has(n) || FLAG.has(n) || OPTS.has(n)); };

/* справка — до всего остального: без адреса, папок и браузера. Смотрим только слова до «--»:
   после него идёт адрес, и «-- -h» — это адрес «-h», а не справка. --help=… — тоже справка */
const endOfFlags = argv.indexOf('--');
/* неизвестный флаг — ошибка, как у остальных скриптов: раньше был WARN в начале stderr, и проверка с опечаткой
   («--scrol») молча не выполнялась, а протокол выходил зелёным (SKILL-ISSUES 450). До справки — чтобы «--x -h» тоже отказал */
const HELP_RE = /^--(help|h)(=|$)/;
const badFlags = [];
{
  /* по словам, как основной разбор ниже: известный флаг со значением без «=» забирает следующее слово, даже если оно
     начинается с «-» (--eval "-1"), — такое слово не флаг. «-viewport» (один дефис у известного) — ниже, своя подсказка */
  const words = (endOfFlags < 0 ? argv : argv.slice(0, endOfFlags)).map(String);
  for (let i = 0; i < words.length; i++) {
    const a = words[i];
    if (!a.startsWith('-') || a === '-h' || HELP_RE.test(a)) continue;
    if (isKnown(a)) { const n = nameOf(a); if (!FLAG.has(n) && !a.includes('=') && words[i + 1] !== undefined && words[i + 1] !== '--' && !isKnown(words[i + 1])) i++; continue; }
    if (!a.startsWith('--') && isKnown(`-${a}`)) continue;
    badFlags.push(a);
  }
}
if (badFlags.length) {
  const all = [...STEP, ...FLAG, ...OPTS];
  for (const a of badFlags) { const k = nameOf(a) || a.replace(/^-+/, '').split('=')[0]; const g = closestFlag(k, all); console.error(`неизвестный флаг ${a.split('=')[0]}${g ? ` — может быть, --${g}?` : ''} (-h — список шагов и настроек)`); }
  process.exit(1);
}
if ((endOfFlags < 0 ? argv : argv.slice(0, endOfFlags)).some((a) => a === '-h' || HELP_RE.test(String(a)))) {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
  process.exit(0);
}

/* «селектор=значение»: первый «=» вне [..], (..), кавычек и после «\» —
   input[name=phone]=8900… → input[name=phone] | 8900…; #sel=знач=ение → #sel | знач=ение */
function splitSelEq(s) {
  s = String(s); let br = 0, par = 0, q = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === '\\') { i++; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '[') br++;
    else if (ch === ']') br = Math.max(0, br - 1);
    else if (ch === '(') par++;
    else if (ch === ')') par = Math.max(0, par - 1);
    else if (ch === '=' && br === 0 && par === 0) return [s.slice(0, i), s.slice(i + 1)];
  }
  return null;
}

/* слово, которое разбирается как адрес этого скрипта: неизвестный флаг его значением не забирает */
const isUrlWord = (s) => { try { return /^(https?|file|data|about):$/.test(new URL(String(s)).protocol); } catch { return false; } };
const FALSE_RE = /^(0|false|no|off|нет)$/i;

const steps = []; const opt = {}; const pos = []; const unknown = []; const off = [];
/* posAt[k] — номер слова pos[k] в argv: «лишнее слово» сразу за неизвестным флагом называется вместе с ним */
const posAt = [];
const ONCE = new Set(['viewport', 'viewports', 'out', 'tag', 'scheme', 'cpu', 'browser', 'expect-status', 'full-scale']);
const taken = []; /* значения, взятые следующим словом: [флаг, слово] — для подсказки «адрес ушёл значением» */
for (let i = 0; i < argv.length; i++) {
  const a = String(argv[i]);
  if (a === '--') { for (let j = i + 1; j < argv.length; j++) { pos.push(String(argv[j])); posAt.push(j); } break; }
  if (!a.startsWith('-')) { pos.push(a); posAt.push(i); continue; }
  /* неизвестный флаг: «--foo», «--foo=1» и любое слово с одним дефисом («-v», «-o»; «-h» — справка, выше).
     Значение — следующее слово, только если это не флаг, не «--» и не адрес: «--strict U --css»
     не съедает адрес (раньше — «Нужен адрес»), «-v U» — не «лишние слова после адреса» */
  const single = !a.startsWith('--');
  let k = single ? a : a.slice(2); let v;
  const eqI = k.indexOf('=');
  if (!single && eqI > 0) { v = k.slice(eqI + 1); k = k.slice(0, eqI); }
  if (single || !(STEP.has(k) || FLAG.has(k) || OPTS.has(k))) {
    const shown = single ? (eqI > 0 ? a.slice(0, eqI) : a) : `--${k}`;
    const at = i; /* до ++i: где стоит сам флаг */
    if (v === undefined && !(single && eqI > 0)) {
      const next = argv[i + 1];
      if (next !== undefined && next !== '--' && !String(next).startsWith('-') && !isUrlWord(next)) { v = String(argv[++i]); taken.push([shown, v]); }
    }
    /* «-viewport mobile» — опечатка в дефисах у известного флага: подсказать, иначе запуск тихо идёт на desktop */
    unknown.push({ shown, at, word: v !== undefined && !(eqI > 0) ? v : null, guess: single && isKnown(`-${shown}`) ? `-${shown}` : null });
    continue;
  }
  if (v !== undefined) {
    if (FLAG.has(k)) {
      const on = !FALSE_RE.test(String(v).trim());
      /* шаг-флаг: --scroll=0, --css=нет — шаг выключен и не выполняется; --scroll=1 — выполняется */
      if (STEP.has(k)) { if (!on) { off.push(a); continue; } v = true; }
      else v = on; /* --no-fail=0 — выключено */
    }
  } else if (FLAG.has(k)) v = true;
  else {
    /* значение — следующее слово, если это не шаг, не флаг этого скрипта и не «--»:
       «--hover --scroll» и «--hover --» — ошибка, а не селектор «--scroll» или «--» */
    const next = argv[i + 1];
    if (next === undefined || next === '--' || isKnown(next)) {
      usage(`--${k}: нужно значение${next === undefined ? ' — это последнее слово в команде' : next === '--' ? ` — следующим идёт «--», а это конец флагов (после него только адрес); значение «--» пишите через «=»: --${k}="--"` : ` — следующим идёт «${next}», а это ${STEP.has(nameOf(next)) ? 'шаг' : 'флаг'}; значение, которое начинается с «--», пишите через «=»: --${k}="${next}"`}`);
    }
    v = String(argv[++i]); taken.push([`--${k}`, v]);
  }
  if (k === 'expect') {
    const prev = steps[steps.length - 1];
    if (!prev || prev.k !== 'eval') usage('--expect пишется сразу после --eval');
    prev.expect = v; continue;
  }
  if (STEP.has(k)) steps.push({ k, v });
  else {
    /* настройка дважды с разными значениями («--viewport mobile --viewport desktop») — раньше молча бралась последняя */
    if (ONCE.has(k) && opt[k] !== undefined && String(opt[k]).trim() !== String(v).trim()) usage(`--${k} задан дважды: «${opt[k]}» и «${v}» — оставьте один${k === 'browser' ? ' (runtime проверяет в одном браузере за запуск)' : k === 'expect-status' ? ' (у документа один ответ)' : ' (runtime проверяет один экран за запуск)'}`);
    opt[k] = v;
  }
}
for (const u of unknown) console.error(`WARN неизвестный флаг ${u.shown} — не используется${u.word != null ? ` вместе со словом «${short(u.word, 60)}», которое он забрал значением` : ''}${u.guess ? ` — может быть, ${u.guess}?` : ''} (-h — список шагов и настроек)`);
/* известный флаг с одним дефисом («-viewport mobile») — не опечатка, которую можно пропустить: запуск молча
   шёл бы с настройками по умолчанию (desktop), и протокол врал бы об экране */
const typo = unknown.find((u) => u.guess);
if (typo) usage(`${typo.shown} — флаг пишется с двумя дефисами: ${typo.guess}`);
for (const a of off) console.error(`шаг ${a} выключен значением после «=» — не выполняется`);
/* --selftest: стенды fixtures/runtime — адрес и шаги не нужны */
if (opt.selftest) {
  if (pos.length || steps.length) usage('--selftest идёт без адреса и шагов: node runtime.mjs --selftest');
  process.exit(await selftest());
}
const url = pos[0];
if (!url) {
  /* адрес ушёл значением флага: «--out http://… --css», «--foo localhost:4177» — назвать это прямо */
  const asUrl = taken.find(([, w]) => isUrlWord(w)); const byUnknown = taken.find(([f]) => !isKnown(f));
  const why = asUrl ? ` — «${short(asUrl[1], 80)}» стоит значением ${asUrl[0]}; у ${asUrl[0]} должно быть своё значение, адрес — отдельным словом`
    : byUnknown ? ` — слово «${short(byUnknown[1], 80)}» забрал значением неизвестный флаг ${byUnknown[0]}; если это адрес, пишите его полностью (http://…) или после «--»`
      : '';
  console.error(`Нужен адрес${why}: node runtime.mjs <url> [--viewport mobile] [--scroll] [--click sel] [--canvas] [--motion] ... (-h, --help — все шаги)`); process.exit(1);
}
if (pos.length > 1) {
  /* лишнее слово сразу за неизвестным флагом, который его не взял (адрес, «--foo=1 слово», «-v file:///…»):
     назвать флаг рядом — иначе WARN о флаге и «лишние слова» читались как две разные ошибки */
  const extra = pos.slice(1).map((p, k) => {
    const u = unknown.find((x) => x.at === posAt[k + 1] - 1 && x.word == null);
    return `«${p}»${u ? ` (сразу за неизвестным флагом ${u.shown}: у runtime его нет, и слово осталось без флага — -h, список шагов и настроек)` : ''}`;
  });
  usage(`лишние слова после адреса: ${extra.join(', ')} — шаги и настройки пишутся с «--» (--hover "sel"), значение с пробелами — в кавычках`);
}
let urlOk = null; try { urlOk = new URL(url); } catch { /* ниже */ }
if (!urlOk || !/^(https?|file|data|about):$/.test(urlOk.protocol)) {
  const hint = fs.existsSync(url) ? ` (файл на диске: file:///${path.resolve(url).replace(/\\/g, '/')})` : /^-/.test(url) ? ' (похоже на флаг: после «--» идёт только адрес — флаги и -h пишите до «--»)' : /^[\w.-]+(:\d+)?(\/|$)/.test(url) ? ` (например, http://${url})` : '';
  console.error(`Неверный адрес «${url}» — нужен полный: http://…, https://… или file:///…${hint}`); process.exit(1);
}
/* --resize: ширина «1152», ШxВ «834x1112» (x, X, ×, *) или rotate/поворот. Одно выражение
   и для проверки аргументов, и для шага: проверка не пропускает того, что шаг отвергнет;
   0 — ошибка (setViewport с нулём молча оставляет прежнее окно, и шаг врал бы «OK окно 0×0») */
const RESIZE_RE = /^(?:(rotate|поворот)|(\d+)(?:[x×*](\d+))?)$/i;
const parseResize = (v) => {
  const m = RESIZE_RE.exec(String(v).trim()); if (!m) return null;
  if (m[1]) return { rotate: true };
  const w = Number(m[2]), h = m[3] === undefined ? null : Number(m[3]);
  return w > 0 && (h === null || h > 0) ? { w, h } : null;
};
const RESIZE_HELP = 'нужна ширина больше 0 («1152»), ШxВ («834x1112», x или ×) или rotate';
/* «834х1112» с русской «х» выглядит верно, но не разбирается — назвать это в сообщении */
const cyrX = (v) => (/^\s*\d+\s*[хХ]\s*\d+/.test(String(v)) ? ' — между числами русская «х», нужна латинская x' : '');
/* --wait: миллисекунды, целое или дробное число ≥ 0 */
const WAIT_RE = /^\d+(?:\.\d+)?$/;

/* значения шагов — до папок и браузера */
const NEEDS_VALUE = new Set(['wait', 'hover', 'click', 'type', 'edit', 'key', 'select', 'resize', 'shot', 'eval', 'assert']);
for (const s of steps) {
  if (NEEDS_VALUE.has(s.k) && (s.v === true || s.v === undefined || String(s.v).trim() === '')) usage(`--${s.k}: нужно значение`);
  if (s.k === 'wait' && !WAIT_RE.test(String(s.v).trim())) usage(`--wait ${s.v}: нужно число миллисекунд ≥ 0 (--wait 800)`);
  /* больше 2^31 мс setTimeout срабатывает сразу, а протокол писал бы «ждали …» — предел 10 минут */
  if (s.k === 'wait' && Number(String(s.v).trim()) > 600000) usage(`--wait ${s.v}: не больше 600000 мс (10 минут)`);
  if (s.k === 'type' || s.k === 'select') {
    const p = splitSelEq(s.v);
    if (!p || !p[0].trim()) usage(`--${s.k} "${s.v}": нужно «селектор=${s.k === 'type' ? 'текст' : 'значение'}» (делится по первому «=» вне [ ] и кавычек: ${s.k === 'type' ? 'input[name=phone]=89001234567' : 'select[name=work]=6'})`);
  }
  if (s.k === 'resize' && !parseResize(s.v)) usage(`--resize ${s.v}: ${RESIZE_HELP}${cyrX(s.v)}`);
}
for (const k of ['out', 'tag', 'scheme', 'cpu', 'init', 'browser', 'expect-status', 'full-scale']) if (opt[k] !== undefined && String(opt[k]).trim() === '') usage(`--${k}: нужно значение`);
/* --expect-status: код ответа документа, который ждём (страница 404 открыта нарочно) */
const expectStatus = opt['expect-status'] === undefined ? null : Number(String(opt['expect-status']).trim());
if (expectStatus !== null && !(/^\d{3}$/.test(String(opt['expect-status']).trim()) && expectStatus >= 100 && expectStatus <= 599)) usage(`--expect-status ${opt['expect-status']}: нужен код ответа 100–599 (--expect-status 404)`);
if (opt.scheme !== undefined && !/^(light|dark|no-preference)$/.test(String(opt.scheme))) usage(`--scheme ${opt.scheme}: нужно light, dark или no-preference`);
/* --full-scale: масштаб снимка всей страницы — 1 (по умолчанию), 2–4 или dpr (как у экрана), как у shots.mjs */
const fullScaleOpt = String(opt['full-scale'] === undefined ? '1' : opt['full-scale']).trim().toLowerCase();
if (!(fullScaleOpt === 'dpr' || (/^\d+(\.\d+)?$/.test(fullScaleOpt) && Number(fullScaleOpt) >= 1 && Number(fullScaleOpt) <= 4))) usage(`--full-scale ${opt['full-scale']}: нужно 1, 2, 3, 4 или dpr (как у экрана)`);
const fullScaleOf = (v) => (fullScaleOpt === 'dpr' ? v.deviceScaleFactor || 1 : Number(fullScaleOpt));
if (opt.cpu !== undefined && !(Number(opt.cpu) > 0)) usage(`--cpu ${opt.cpu}: нужно число — во сколько раз замедлить процессор (4)`);
/* браузер прогона: chrome (по умолчанию), firefox, edge */
const browserKind = opt.browser === undefined ? 'chrome' : parseBrowser(opt.browser);
if (!browserKind) usage(`--browser ${opt.browser}: нужно chrome, firefox или edge`);
/* экран: --viewport и --viewports — одно и то же; runtime проверяет один экран за запуск */
const vpGiven = ['viewport', 'viewports'].filter((k) => opt[k] !== undefined).map((k) => [k, String(opt[k]).trim()]);
if (vpGiven.length === 2 && vpGiven[0][1] !== vpGiven[1][1]) usage(`заданы и --viewport ${vpGiven[0][1]}, и --viewports ${vpGiven[1][1]} — это один флаг; runtime проверяет один экран за запуск`);
const [vpFlag, vpRaw] = vpGiven[0] || ['viewport', 'desktop'];
const vpList = vpRaw.split(',').map((x) => x.trim()).filter(Boolean);
if (!vpList.length) usage(`--${vpFlag}: нужно значение`);
if (vpList.length > 1) usage(`--${vpFlag} ${vpRaw}: runtime проверяет один экран за запуск — запустите по разу на каждый (${vpList.map((x) => `--viewport ${x}`).join(', затем ')}); несколько экранов за один запуск снимает shots.mjs`);
const resolved = resolveViewport(vpList[0]);
if (!resolved) { console.error(`Неизвестный экран ${vpList[0]}${cyrX(vpList[0])}. Есть: desktop, laptop, tablet, mobile, mobile-s, android, ШxВ@плотность`); process.exit(1); }
const [vpName, vp] = resolved;
let cur = { ...vp };
const run = runDir(opt, url);
const outDir = ensureDir(path.join(run, 'runtime'));
/* не Chrome — свой протокол по умолчанию: desktop-firefox.json рядом с desktop.json, а не поверх него */
const tag = opt.tag || `${vpName}${opt['reduced-motion'] ? '-reduced' : ''}${browserKind !== 'chrome' ? `-${browserKind}` : ''}`;
const DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN };
const effOf = new Function('el', `return (${EFFECTIVE_OPACITY_FN})(el);`);

/* фон целиком (линия под пунктом рисуется background-size градиента) и clip-path — тоже состояние наведения */
const STATE_PROPS = ['color', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'borderTopColor', 'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'outlineStyle', 'outlineColor', 'filter', 'clipPath', 'letterSpacing', 'scale', 'translate', 'rotate'];

const report = { url, viewport: vpName, size: `${vp.width}×${vp.height}@${vp.deviceScaleFactor || 1}`, tag, reducedMotion: !!opt['reduced-motion'], expectStatus, browser: null, startedAt: new Date().toISOString(), steps: [], console: null, verdict: null };
let fails = 0, warns = 0;
/* вид текущего шага — в протокол: state.mjs отличает запись (eval без --expect, снимок) от проверки */
let curKind = 'load';
/* status: OK | WARN | FAIL | INFO (сведения — на вердикт не влияют).
   o.con — что напечатать в консоли вместо «what — details» (в протокол идут what и details целиком);
   o.count: false — строка-пояснение к уже посчитанной (её WARN уже учтён строкой выше) */
const line = (status, what, details, data, o = {}) => {
  if (o.count !== false) { if (status === 'FAIL') fails++; if (status === 'WARN') warns++; }
  console.log(`${status.padEnd(4)} ${o.con != null ? o.con : `${what}${details ? ' — ' + details : ''}`}`);
  report.steps.push({ status, kind: curKind, what, details, ...(data ? { data } : {}) });
};
/* WARN и INFO из lib (окно при загрузке, SITE_REWORK_DISMISS, свой стиль не вставился) — строками вердикта и в JSON,
   с подписью по виду (warningLabel), а не отдельной строкой «WARN …» мимо счёта */
collectWarnings(); collectNotes();
const drainLib = () => {
  for (const n of takeNotes()) line('INFO', 'SITE_REWORK_DISMISS', n.replace(/^SITE_REWORK_DISMISS /, ''));
  for (const w of takeWarnings()) line('WARN', warningLabel(w), w.replace(/^SITE_REWORK_DISMISS /, ''));
};
/* начало длинного результата — в консоль одной строкой; целиком он в протоколе */
const headOf = (s, n = 300) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}… (ещё ${t.length - n} знаков — целиком в JSON: steps[].details)` : t; };
let shotN = 0;
const shot = async (name) => { const file = path.join(outDir, `${tag}-${String(++shotN).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: file }); return path.basename(file); };
/* одинаковые строки — одной, со счётчиком: «Cannot read … ×20» */
const uniqCount = (list, max = 4) => { const m = new Map(); for (const t of list) m.set(t, (m.get(t) || 0) + 1); const arr = [...m.entries()]; return arr.slice(0, max).map(([t, n]) => `${t}${n > 1 ? ` ×${n}` : ''}`).join(' | ') + (arr.length > max ? ` и ещё ${arr.length - max} разных` : ''); };

/* ---------- браузер и страница ---------- */
/* браузер пользователя по умолчанию (Windows, реестр) — чтобы подсказать проверку и в нём */
const defBrowser = defaultBrowser();
let browser;
try { browser = await launch({ browser: browserKind, scheme: opt.scheme === 'dark' ? 'dark' : 'light', reducedMotion: !!opt['reduced-motion'], mobile: !!vp.isMobile }); }
catch (e) { console.error(`FAIL браузер: ${e.message}`); process.exit(1); }
const bInfo = browserInfo(browser);
const gecko = bInfo.engine === 'gecko';
const bHint = defaultBrowserHint(browserKind, defBrowser);
/* первая строка вывода: в каком браузере проверка и какой у пользователя по умолчанию */
console.log(`браузер ${bInfo.label}${bHint ? ` · ${bHint}` : ''}`);
report.browser = { ...bInfo, default: defBrowser, hint: bHint || null };
const NOT_IN = `не поддерживается в ${bInfo.name || 'Firefox'}`;
let page, navRes = null, cpuSkipped = false;
/* окно согласия cookie и ворота-заставка (closeConsent): закрываются после загрузки, --keep-consent — только найти */
const keepConsent = !!opt['keep-consent'];
let consent = { found: false };
/* найти и закрыть окно согласия (lib.closeConsent: сначала SITE_REWORK_DISMISS — он уже нажат в waitForOverlay и второй раз
   не жмётся, потом окно cookie и ворота). Нажатие перезагрузило документ (менеджеры согласия так делают) — дождаться
   готовности; увело на другой адрес — открыть нужный заново, журнал вкладки — только его (resetPageLog) */
async function consentStep() {
  const before = await page.evaluate(() => { window.__rwConsentDoc = 1; return location.href; }).catch(() => null);
  const c = await closeConsent(page, { click: !keepConsent }).catch((e) => ({ found: false, error: String((e && e.message) || e).slice(0, 120) }));
  if (!keepConsent && before && c.found && c.kind !== 'dismiss' && c.pick) {
    const same = await page.evaluate(() => window.__rwConsentDoc === 1).catch(() => false);
    if (!same) {
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 }).catch(() => {});
      const bare = (u) => String(u || '').replace(/#.*$/, '').replace(/\/+$/, '');
      if (bare(page.url()) === bare(before)) c.reloaded = true;
      else {
        c.movedTo = page.url();
        resetPageLog(page);
        navRes = await gotoRetry(page, url);
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        const again = await closeConsent(page).catch(() => null);
        if (again && again.found && again.kind !== 'dismiss') c.again = again.closed ? 'окно снова появилось — закрыто' : 'окно снова появилось и не закрылось';
        if (bare(page.url()) !== bare(navRes ? navRes.url() : url)) c.wrongPage = page.url();
      }
    }
  }
  return c;
}
const reqLog = [];
const conLoc = []; const reqFrame = new Map();
/* источник кадра: ближайший адрес http(s) от кадра к главному (about:blank и srcdoc наследуют источник родителя) */
const originOf = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : null; } catch { return null; } };
const frameInfo = (f) => {
  const main = f === page.mainFrame(); let origin = null, at = '';
  for (let x = f; x && !origin; x = typeof x.parentFrame === 'function' ? x.parentFrame() : null) { const u = x.url(); origin = originOf(u); if (origin) at = u; }
  return { main, origin, frame: main ? null : at.slice(0, 160) };
};
try {
  page = await preparePage(browser, vp, { scheme: opt.scheme || 'light', reducedMotion: !!opt['reduced-motion'] });
  /* resourceTypeOf: в Firefox resourceType() бросает прямо в обработчике */
  page.on('request', (r) => { if (reqLog.length < 5000) reqLog.push({ t: Date.now(), type: resourceTypeOf(r), url: r.url().slice(0, 160) }); });
  /* адрес источника у ошибок консоли: «Failed to load resource» самого документа (--expect-status) узнаётся по нему */
  page.on('console', (m) => { try { if (m.type() !== 'error' || conLoc.length > 2000) return; const loc = m.location ? m.location() : null; conLoc.push({ text: m.text().slice(0, 300), url: (loc && loc.url) || '' }); } catch { /* без адреса */ } });
  /* кадр упавшего запроса: главная страница или iframe (реклама внутри карты Яндекса — сторонний iframe).
     Запрос самого документа iframe (переход кадра) — запрос того, кто этот iframe вставил: у битой ссылки на
     виджет (документ iframe ответил 404 или не соединился) кадр в момент ответа уже носит адрес виджета, и
     по нему ошибка сайта уходила в «сторонние iframe» (INFO). Такой запрос приписывается родителю: у iframe
     страницы — это сама страница (WARN «упавшие запросы»), у рекламы внутри карты — карта (INFO) */
  const isNavReq = (r) => { try { return r.isNavigationRequest(); } catch { return resourceTypeOf(r) === 'document'; } };
  const noteFrame = (r) => {
    try {
      let f = r.frame(); if (!f) return;
      if (f !== page.mainFrame() && isNavReq(r)) { const p = typeof f.parentFrame === 'function' ? f.parentFrame() : null; if (p) f = p; }
      reqFrame.set(r.url().slice(0, 200), frameInfo(f));
    } catch { /* кадр ушёл */ }
  };
  page.on('requestfailed', noteFrame);
  page.on('response', (res) => { try { if (res.status() >= 400) noteFrame(res.request()); } catch { /* нет запроса */ } });
  /* нажатие SITE_REWORK_DISMISS увело, и lib открыл нужную страницу заново (resetPageLog): свои журналы — тоже только её.
     Иначе /menu/ mamuka.rest получала строки консоли и кадры запросов промежуточной главной (30.09) */
  onPageLogReset(page, () => { reqLog.length = 0; conLoc.length = 0; reqFrame.clear(); });
  /* замедление процессора — Chrome DevTools Protocol, у Firefox его нет: WARN ниже, прогон без замедления */
  if (Number(opt.cpu) > 1) { if (gecko) cpuSkipped = true; else { const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt.cpu) }); } }
  if (opt.init) await page.evaluateOnNewDocument(String(opt.init));
  navRes = await gotoRetry(page, url);
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  /* окна при загрузке, как у cliche и discover: заставка и SITE_REWORK_DISMISS — waitForOverlay (modalCheck: false),
     окно согласия cookie и ворота — closeConsent, открытое окно без слов про cookie — после них (ворота «ENTER», которые
     closeConsent закроет, — не WARN «окно»). Окно cookie поверх страницы давало ложные тревоги: клик по кнопке под ним
     уходил в окно («КНОПКА БЕЗ ЭФФЕКТА»), замеры шли под ним. --keep-consent — только найти */
  page.overlay = await waitForOverlay(page, 5000, { modalCheck: false });
  consent = await consentStep();
  /* заставка стояла, а окно согласия закрылось — может быть, заставкой было оно: проверить заново */
  if (consent.closed && consent.kind !== 'dismiss' && page.overlay.hadOverlay && !page.overlay.gone) page.overlay = { ...(await waitForOverlay(page, 1500, { dismiss: false, modalCheck: false })), afterConsent: true };
  /* открытое окно без слов про cookie (выбор города) — WARN «окно» (lib); окно, которое страница откроет сама (признаки
     при загрузке), ждётся до 2 с от начала документа — как раньше в waitForOverlay */
  await waitForOverlay(page, 0, { dismiss: false, modalCheck: true }).catch(() => null);
  await sleep(500);
  /* слой на весь экран, который есть уже при загрузке (закреплённый фон, заставка), — не «открытое меню» у --scroll */
  await evaluateWith(page, openLayerInPage, { base: true }, DEPS).catch(() => null);
} catch (e) { console.error(`FAIL открыть ${url}: ${e.message}`); await browser.close(); process.exit(1); }
if (page.retries) line('WARN', 'соединение', `страница открылась с ${page.retries + 1}-й попытки${page.gotoInfo && page.gotoInfo.waitUntil === 'domcontentloaded' ? ', только DOMContentLoaded' : ''} — сервер или сеть отвечают нестабильно`);

/* 404 на /favicon.ico браузер пишет в консоль как «Failed to load resource» без адреса —
   столько же таких строк не считаем ошибками страницы (C22) */
const favFails = () => page.log.failed.filter((f) => /\/favicon\.ico(\?|#|$)/i.test(f.url)).length;
/* ответ самого документа: 404 страницы ошибки, открытой нарочно (--expect-status 404), — не ошибка страницы.
   Chrome пишет его в консоль «Failed to load resource: … 404» без адреса в тексте; адрес — в location */
const docStatus = navRes ? navRes.status() : null;
const noHash = (u) => String(u || '').split('#')[0];
const docUrls = new Set([noHash(url), ...(navRes ? [noHash(navRes.url())] : [])]);
const docExpected = expectStatus !== null && docStatus === expectStatus && docStatus >= 400;
const docErrLines = () => conLoc.filter((c) => docUrls.has(noHash(c.url)) && /Failed to load resource/i.test(c.text)).length;
/* упавший запрос стороннего iframe (реклама в карте Яндекса): его строка «Failed to load resource» — не ошибка
   страницы (у iframe другого сайта Chrome обычно и не отдаёт её в консоль вкладки, у того же сайта с другим
   портом — отдаёт) */
const pageOrigin = originOf(navRes ? navRes.url() : url) || (() => { try { return new URL(url).origin; } catch { return null; } })();
const foreignFrame = (f) => { const fr = reqFrame.get(String(f.url).slice(0, 200)); return fr && !fr.main && fr.origin && fr.origin !== pageOrigin ? fr : null; };
const foreignErrLines = () => conLoc.filter((c) => /Failed to load resource/i.test(c.text) && c.url && foreignFrame({ url: c.url })).length;
const realConsole = () => {
  let fav = favFails(); let doc = docExpected ? docErrLines() : 0; let foreign = foreignErrLines();
  return page.log.console.filter((c) => c.type === 'error').filter((c) => {
    if (!/Failed to load resource/i.test(c.text)) return true;
    if (doc > 0) { doc--; return false; }
    if (foreign > 0) { foreign--; return false; }
    if (fav > 0) { fav--; return false; }
    return true;
  });
};
const errCount = () => realConsole().length + page.log.errors.length;
const loadErrors = errCount();
/* без --expect-status документ 4xx/5xx — провал, как раньше, но с подсказкой, если так и задумано */
const docHint = !docExpected && docStatus >= 400 && docErrLines() ? ` · из них ответ самого документа ${docStatus} — если страница ошибки открыта нарочно: --expect-status ${docStatus}` : '';
line(loadErrors ? 'FAIL' : 'OK', `загрузка ${url} (${vpName} ${report.size}${opt['reduced-motion'] ? ', меньше движения' : ''})`, loadErrors ? `${loadErrors} ошибок в консоли: ${uniqCount([...realConsole().map((c) => c.text), ...page.log.errors].map((t) => short(t, 120)), 3)}${docHint}` : `ошибок в консоли нет, ${page.log.requests.length} запросов`);
if (expectStatus !== null) {
  if (docStatus === expectStatus) line('INFO', `ответ документа ${docStatus}, как ждали`, `--expect-status ${expectStatus}${docExpected && docErrLines() ? `; строка консоли «Failed to load resource: … ${docStatus}» — ответ самого документа, в ошибки страницы не считается` : ''}`);
  else line('FAIL', `ответ документа ${docStatus === null ? 'неизвестен' : docStatus}`, `ждали ${expectStatus} (--expect-status)${docStatus === null ? ' — браузер не отдал ответ перехода (адрес с #, about: или data:)' : ''}`);
}
if (favFails()) line('WARN', 'нет favicon', '/favicon.ico отвечает 404 — вкладка без значка; в провал загрузки не считается');
/* упавшие запросы: свои (главная страница, iframe того же сайта, кадр неизвестен) — WARN; сторонних iframe — INFO */
const isDocFail = (f) => docExpected && docUrls.has(noHash(f.url)) && /^HTTP /.test(f.reason);
const failedNow = page.log.failed.filter((f) => !/\/favicon\.ico(\?|#|$)/i.test(f.url) && !isDocFail(f));
const otherFailed = failedNow.filter((f) => !foreignFrame(f));
const frameFailed = failedNow.filter((f) => foreignFrame(f));
const hostOf = (u) => { try { return new URL(u).host; } catch { return String(u).slice(0, 40); } };
if (otherFailed.length) line('WARN', 'упавшие запросы', otherFailed.slice(0, 4).map((f) => `${f.reason} ${f.url.split('/').pop().slice(0, 50)}`).join('; ') + (otherFailed.length > 4 ? ` и ещё ${otherFailed.length - 4}` : ''));
if (frameFailed.length) {
  const byFrame = new Map(); for (const f of frameFailed) { const h = hostOf(foreignFrame(f).frame); byFrame.set(h, [...(byFrame.get(h) || []), f]); }
  const fl = foreignErrLines();
  line('INFO', `запросы сторонних iframe: не загрузилось ${frameFailed.length}`, `${[...byFrame.entries()].slice(0, 3).map(([h, l]) => `в iframe ${h}: ${l.length} (${uniqCount(l.map((f) => `${f.reason} ${hostOf(f.url)}`), 3)})`).join(' | ')} — реклама и счётчики внутри чужого виджета (карта, видео); сайт их не чинит, в «упавшие запросы» не входят${fl ? `; их строки в консоли (${fl}) — не ошибки страницы` : ''}`, { failed: frameFailed.map((f) => ({ ...f, frame: foreignFrame(f).frame })) });
}
if (page.overlay.hadOverlay) line(page.overlay.gone ? 'OK' : 'WARN', `заставка ${page.overlay.overlay} при загрузке`, page.overlay.gone ? (page.overlay.closedByDismiss ? `сама не ушла за ${page.overlay.waitedMs} мс — закрыта нажатием SITE_REWORK_DISMISS` : page.overlay.afterConsent ? 'ушла, когда закрыли окно согласия' : `ушла через ${page.overlay.waitedMs} мс`) : `не ушла за ${page.overlay.waitedMs} мс — закрывает страницу`);
/* окно согласия cookie и ворота: что найдено и что нажато — INFO; не закрылось — WARN (клики и замеры идут под ним).
   Нажатое по SITE_REWORK_DISMISS — строками SITE_REWORK_DISMISS ниже (drainLib), здесь не повторяется */
{
  const own = consent.found && consent.kind !== 'dismiss';
  const what = own && consent.kind === 'ворота' ? 'ворота-заставка' : 'окно cookie';
  const where = own ? `${consent.box}, ${consent.place}, ${consent.w}×${consent.h}${consent.frame ? `, во фрейме ${consent.frame}` : ''}` : '';
  const note = own ? consentNote({ ...consent, dismiss: null }).replace(/\*\*/g, '') : consent.error ? `проверка не прошла: ${consent.error}` : 'не появлялось';
  const after = consent.reloaded ? ' — нажатие перезагрузило страницу, дождались'
    : consent.movedTo ? ` — нажатие увело на ${consent.movedTo}, нужная страница открыта заново${consent.again ? ` (${consent.again})` : ''}${consent.wrongPage ? `, но открылась ${consent.wrongPage} — ЗАМЕР НЕ ТОЙ СТРАНИЦЫ` : ''}` : '';
  if (keepConsent) line('INFO', what, own ? `оставлено (--keep-consent): ${where}${consent.buttons && consent.buttons.length ? `; кнопки: ${consent.buttons.map((b) => `«${b}»`).join(', ')}` : ''} — клики и замеры идут с ним` : `${note} (--keep-consent)`, { consent: { ...consent, dismiss: undefined } });
  else if (!own) line('INFO', what, note);
  else if (consent.wrongPage) line('WARN', `${what}: нажатие увело со страницы`, `${note}${after}`, { consent: { ...consent, dismiss: undefined } });
  else if (consent.closed) line('INFO', what, `${note}${after} — клики и замеры без него (--keep-consent — оставить окно)`, { consent: { ...consent, dismiss: undefined } });
  else line('WARN', `${what} не закрылось`, `${note}${after} — клики и замеры идут под ним`, { consent: { ...consent, dismiss: undefined } });
  report.consent = { keep: keepConsent, ...consent, dismiss: undefined, note: `${note}${after}` };
}
/* окна при загрузке (lib, waitForOverlay): итог SITE_REWORK_DISMISS — INFO (нажато; увело — нужная страница открыта
   заново) или WARN (не найдено, скрыто, осталось, окно вернулось, замер не той страницы), открытое окно — WARN «окно».
   Раньше WARN lib печатался мимо вердикта и JSON, а уводящее нажатие мерило чужую страницу с OK (mamuka.rest, 29.09) */
drainLib();
report.windows = { dismiss: page.rwDismiss ? page.rwDismiss.list : null, modal: page.rwModal || null, wrongPage: page.rwWrongPage || null };
/* чего нет в этом браузере (Firefox): честный WARN, а не падение */
for (const l of page.rwLimits || []) line('WARN', NOT_IN, l);
if (cpuSkipped) line('WARN', NOT_IN, `замедление процессора (--cpu ${opt.cpu}) — это протокол Chrome (DevTools); прогон идёт без замедления, замер под нагрузкой — в Chrome или Edge`);

/* карта импортов — по разметке, в любом браузере: Firefox принимает <script type="importmap">, только пока
   не начал грузить модули (modulepreload, module-скрипт — внешний или встроенный), и только первую карту;
   Chrome прощает и то и другое, поэтому проверки в Chrome зелёные, а у владельца в Firefox 3D не запускается */
const imap = await page.evaluate(() => {
  const els = [...document.querySelectorAll('script, link')];
  const type = (e) => (e.getAttribute('type') || '').trim().toLowerCase();
  const isMap = (e) => e.tagName === 'SCRIPT' && type(e) === 'importmap';
  const isMod = (e) => e.tagName === 'SCRIPT' && type(e) === 'module';
  const isPre = (e) => e.tagName === 'LINK' && /(^|\s)modulepreload(\s|$)/i.test(e.getAttribute('rel') || '');
  const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  const desc = (e) => (isPre(e) ? `<link rel="modulepreload" href="${cut(e.getAttribute('href'), 60)}">` : e.getAttribute('src') ? `<script type="module" src="${cut(e.getAttribute('src'), 60)}">` : `встроенный <script type="module"> «${cut(e.textContent, 40)}»`);
  const maps = els.filter(isMap);
  if (!maps.length) return null;
  const before = [];
  for (const e of els) { if (e === maps[0]) break; if (isMod(e) || isPre(e)) before.push(desc(e)); }
  return { maps: maps.length, before };
}).catch(() => null);
/* modulepreload в заголовке ответа (Link) начинает загрузку модуля раньше всей разметки — Firefox так же отбрасывает карту */
if (imap) {
  let link = ''; try { link = String(((navRes && navRes.headers()) || {}).link || ''); } catch { /* без заголовков */ }
  const hdr = link.split(/,(?=\s*<)/).filter((x) => /;\s*rel\s*=\s*"?[^";]*\bmodulepreload\b/i.test(x)).map((x) => `заголовок ответа Link: <${((/<([^>]*)>/.exec(x) || [])[1] || '').slice(0, 60)}>; rel=modulepreload`);
  imap.before.unshift(...hdr);
}
if (imap) {
  if (imap.before.length) line('WARN', 'карта импортов после modulepreload/module-скрипта — Firefox её отбросит', `раньше <script type="importmap"> стоит ${imap.before.slice(0, 3).join(', ')}${imap.before.length > 3 ? ` и ещё ${imap.before.length - 3}` : ''} — Firefox принимает карту импортов, только пока не начал грузить модули, и import('…') по имени из неё падает (Chrome прощает); поставьте карту выше всех modulepreload и module-скриптов`, { importMap: imap });
  if (imap.maps > 1) line('WARN', `карт импортов ${imap.maps} — Firefox примет только первую`, 'имена из второй и следующих карт в Firefox не найдутся (Chrome карты объединяет) — сведите их в одну', { importMap: imap });
  if (!imap.before.length && imap.maps === 1) line('OK', 'карта импортов стоит раньше модулей', 'Firefox её примет');
}

/* ---------- общие помощники ---------- */
const readState = (h) => h.evaluate((el, props) => { const s = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, s[p]])); }, STATE_PROPS);
const diffState = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${short(a[k], 28)} → ${short(b[k], 28)}`);
const snapshot = () => evaluateWith(page, () => ({
  url: location.href, title: document.title,
  dialogs: [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && eff(el) > 0.05; }).length,
  expanded: document.querySelectorAll('[aria-expanded="true"]').length,
  active: document.activeElement && document.activeElement !== document.body ? sig(document.activeElement) : null,
  scrollY: Math.round(scrollY),
}), null, DEPS);
/* первое видимое совпадение (итоговая прозрачность с предками): «.btn» часто первым даёт скрытую кнопку меню */
const find = async (sel) => {
  let list = []; try { list = await page.$$(sel); } catch { find.info = { total: 0, bad: true }; return null; }
  find.info = { total: list.length };
  const visible = (h) => h.evaluate((el, f) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && new Function('el', `return (${f})(el);`)(el) > 0.05; }, EFFECTIVE_OPACITY_FN).catch(() => false);
  for (const h of list) if (await visible(h)) return h;
  /* прозрачен, но с размером — возможно, блок появления ещё не показан: прокрутить к нему и дождаться перехода */
  for (const h of list.slice(0, 3)) {
    const sized = await h.evaluate((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).catch(() => false);
    if (!sized) continue;
    await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
    await sleep(300); await settleAnimations(page, 2500);
    if (await visible(h)) return h;
  }
  return null;
};
const notFound = () => (find.info && find.info.bad ? 'селектор не разобран' : find.info && find.info.total ? `найдено ${find.info.total}, но все невидимы` : 'элемент не найден');

/* наблюдение за DOM во время действия: атрибуты, узлы, текст — сигнатурами «вид|атрибут|элемент» */
const startWatch = () => evaluateWith(page, () => {
  if (window.__rwObs) window.__rwObs.disconnect();
  const list = []; window.__rwMut = list;
  window.__rwObs = new MutationObserver((ms) => {
    for (const m of ms) {
      if (list.length > 600) return;
      if (m.type === 'attributes' && /^data-rw/.test(m.attributeName || '')) continue;
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (!t) continue;
      if (t.closest && t.closest('style[data-rw]')) continue;
      list.push({ type: m.type, attr: m.attributeName || null, el: sig(t), added: m.addedNodes ? m.addedNodes.length : 0, removed: m.removedNodes ? m.removedNodes.length : 0 });
    }
  });
  window.__rwObs.observe(document.documentElement, { attributes: true, childList: true, subtree: true, characterData: true });
  return true;
}, null, DEPS);
const takeWatch = () => page.evaluate(() => { const l = window.__rwMut || []; if (window.__rwObs) window.__rwObs.disconnect(); window.__rwObs = null; return l; });
const mutKey = (m) => `${m.type}|${m.attr || ''}|${m.el}`;
const describeMuts = (ms) => {
  const attrs = {}; let added = 0, removed = 0, text = 0;
  for (const m of ms) { if (m.type === 'attributes') { const k = `${m.attr} у ${m.el}`; attrs[k] = (attrs[k] || 0) + 1; } else if (m.type === 'childList') { added += m.added; removed += m.removed; } else text++; }
  const parts = Object.keys(attrs).slice(0, 4).map((k) => `${k}${attrs[k] > 1 ? ` ×${attrs[k]}` : ''}`);
  if (Object.keys(attrs).length > 4) parts.push(`ещё ${Object.keys(attrs).length - 4} атрибутов`);
  if (added || removed) parts.push(`узлов +${added} −${removed}`);
  if (text) parts.push(`текст ×${text}`);
  return parts.join('; ');
};

/* после действия: холсты (резкость) и переполнение — по конечному состоянию */
let scrolled = false;
const sharpness = (c) => {
  const bad = []; let st = 'OK';
  if (c.ratioCss != null && c.ratioCss < 0.85) { st = 'FAIL'; bad.push(`буфер ${c.width}×${c.height} на ${c.clientWidth}×${c.clientHeight} CSS px → ×${c.ratioCss} — РАЗМЫТ на любом экране`); }
  else if (c.ratioDevice != null && c.ratioDevice < 0.85) { st = 'WARN'; bad.push(`буфер ×${c.ratioDevice} от ширины × DPR ${c.dpr} — мягче, чем мог бы (для WebGL бывает нарочно)`); }
  if (c.ctx === '2d' && c.aspectOff > 4) { if (st === 'OK') st = 'WARN'; bad.push(`пропорции буфера и показа расходятся на ${c.aspectOff}% — растянут`); }
  return { st, bad };
};
/* печатается только то, что изменилось с прошлой автопроверки: одна и та же размытость
   после каждого следующего клика — не новый провал */
const lastAuto = { canvas: null, overflow: null, canvasAt: '', overflowAt: '' };

/* вертикальное письмо (writing-mode: vertical-*, sideways-*): строка идёт сверху вниз, и поперёк неё —
   по горизонтали — глифы законно выходят за строку при line-height меньше высоты шрифта (вкладка
   «Забронировать» у края, line-height: 1: 1431>1428px, а на снимке всё влезает). Вдоль строки (по высоте)
   допуск — как у findOverflow, 5% кегля (не меньше 2 px). Поперёк (по ширине) к нему прибавляется край глифа:
   половина разницы между толщиной строки текста (высота шрифта, ширина прямоугольника строки у Range) и
   line-height — то, на что шрифт законно шире строки. Вылез сбоку больше этого (кегль 40px в коробке 12px:
   «Бронь» 407>372px) — находка, как у горизонтального текста. Ключ — как у findOverflow: коробка
   (ближайший предок не inline/contents) и начало текста */
function verticalTextInPage(arg) {
  const tol = arg.tol; const out = {};
  const cs = (e) => getComputedStyle(e);
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const range = document.createRange();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim()) continue;
    const par = n.parentElement; if (!par || !/^(vertical|sideways)/.test(cs(par).writingMode)) continue;
    let box = par; while (box && box !== document.body && /^(inline|contents)$/.test(cs(box).display)) box = box.parentElement;
    if (!box || box === document.body) continue;
    range.selectNodeContents(n); const tr = range.getBoundingClientRect(); const br = box.getBoundingClientRect();
    const fs = parseFloat(cs(par).fontSize) || 16;
    const t = Math.max(tol, fs * 0.05);
    const lines = [...range.getClientRects()].filter((q) => q.width >= 1 && q.height >= 1);
    const thick = lines.length ? Math.max(...lines.map((q) => q.width)) : tr.width;
    const lh = parseFloat(cs(par).lineHeight); /* «normal» — NaN: строка не тоньше шрифта, края глифа нет */
    const glyph = Number.isFinite(lh) ? Math.max(0, (thick - lh) / 2) : 0;
    const side = Math.max(tr.right - br.right, br.left - tr.left);
    out[`${sig(box)}|${clean(n.textContent)}`] = {
      long: tr.bottom > br.bottom + t || tr.top < br.top - t, wide: side > t + glyph, side: Math.round(side), sideTol: Math.round((t + glyph) * 10) / 10, fontSize: fs,
      textTop: Math.round(tr.top), textBottom: Math.round(tr.bottom), boxTop: Math.round(br.top), boxBottom: Math.round(br.bottom),
    };
  }
  return out;
}
/* findOverflow, затем две поправки runtime: блок шире своей колонки и страница шире окна на 1 px (blockFix — ниже) и
   вертикальное письмо (verticalFix): из «текст шире коробки» уходит вертикальный текст, который
   в коробке и по высоте, и сбоку (с краем глифа). Вердикт пересчитывается от вердикта lib: FAIL остаётся FAIL,
   WARN остаётся, пока есть любая другая находка — docWider или любое поле …Count, кроме textWiderCount
   (panelCut, covered, clipCut, fieldCut и то, что lib добавит потом). Из summary вырезается только кусок
   «текст шире коробки: …» — остальные куски («текст обрезан», «текст не влез в поле», …) остаются */
async function overflowOf() {
  const ov = await findOverflow(page);
  if (!ov) return ov;
  if (ov.textWiderCount) await verticalFix(ov);
  await blockFix(ov);
  return ov;
}
/* блок шире своей колонки — дополняет lib.findOverflow (lib не трогаем: его зовут shots, a11y, perf, typeset): коробка блока
   с видимым текстом или его предка вылезла за контентную коробку своей колонки — ближайшего предка-блока (не inline и не
   contents; рамка и поля колонки — не место для содержимого) — хотя бы на 1 CSS px, и вылезшее видно. h2 с неразрывным
   пробелом в грид- или флекс-колонке растягивается по самой длинной неразрывной цепочке: текст в своём h2 влезает
   (textWider молчит), а h2 торчит из колонки на 16,8 px, документ шире окна на 1 px — в допуске lib (tol=1), и было «OK»
   (/venue/mosty на 320, 30.09). Не в счёт: колонка обрезает или прокручивает (overflow ≠ visible: лента с прокруткой,
   обрезка с многоточием — разрезанный текст ловит clipCut в lib), блок вне потока (absolute, fixed) и закреплённое за краем,
   сдвиг transform / translate / scale / rotate и position: relative со смещением, отрицательное поле с той стороны, куда
   вылезло (margin: 0 -16px — «на всю ширину» по замыслу, .row у Bootstrap), декор — как в lib: текст внутри
   aria-hidden="true" (если рядом нет подписи того же текста для читалки) или role presentation/none у самого, прозрачное,
   целиком за краем окна. Вылезшее считается до края ближайшего обрезающего предка (html и body не в счёт — как clipOf в lib).
   arg.doc — ещё и документ шире окна на 1 px (lib молчит до 2 px): docPx и причины — самые внешние не закреплённые
   элементы правее окна, не обрезанные предком. → { list, count, docPx, causes, vw } */
function blockWiderInPage(arg) {
  const de = document.documentElement; const vw = de.clientWidth;
  const csMemo = new Map(); const cs = (e) => { let s = csMemo.get(e); if (!s) { s = getComputedStyle(e); csMemo.set(e, s); } return s; };
  const parentOf = (e) => { if (e.parentElement) return e.parentElement; const r = e.getRootNode && e.getRootNode(); return r && r !== document && r.host ? r.host : null; };
  /* ближайшая коробка-блок: сам элемент или предок не inline и не contents */
  const upBox = (e) => { let p = e; while (p && p !== de && /^(inline|contents)$/.test(cs(p).display)) p = parentOf(p); return p && p !== de ? p : null; };
  const fixedCB = (s) => s.transform !== 'none' || s.perspective !== 'none' || s.filter !== 'none' || (s.backdropFilter && s.backdropFilter !== 'none') || /paint|layout|strict|content/.test(s.contain) || /transform|perspective|filter/.test(s.willChange) || (s.containerType && s.containerType !== 'normal');
  const absCB = (s) => s.position !== 'static' || fixedCB(s);
  const clips = (s) => s.overflowX !== 'visible' || /paint|strict|content/.test(s.contain);
  const clipOf = (el) => {
    let mode = cs(el).position;
    for (let p = parentOf(el); p && p !== document.body && p !== de; p = parentOf(p)) {
      const s = cs(p);
      const isCB = mode === 'fixed' ? fixedCB(s) : mode === 'absolute' ? absCB(s) : true;
      if (!isCB) continue;
      if (clips(s)) return p;
      mode = s.position === 'fixed' || s.position === 'absolute' ? s.position : 'flow';
    }
    return null;
  };
  /* декор — как в lib (overflowInPage): внешний aria-hidden="true" без подписи того же текста рядом, role у самого */
  const flat = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  const flatText = (e) => flat(e.textContent);
  const tinyBox = (e) => { const r = e.getBoundingClientRect(); const s = cs(e); return r.width <= 2 || r.height <= 2 || (s.clip && s.clip !== 'auto') || /inset\(\s*50%|circle\(\s*0/.test(s.clipPath || ''); };
  const hiddenTop = (e) => { let h = null; for (let x = e; x && x !== de; x = parentOf(x)) if (x.nodeType === 1 && x.getAttribute('aria-hidden') === 'true') h = x; return h; };
  const spokenNearby = (h) => {
    const t = flatText(h); if (!t) return false;
    for (let a = parentOf(h), k = 0; a && a !== document.body && a !== de && k < 3; a = parentOf(a), k++) {
      const lab = a.getAttribute('aria-label'); if (lab == null) continue;
      if (flat(lab) === flatText(a)) return true;
      break;
    }
    const p = parentOf(h);
    return !!p && [...p.children].some((x) => x !== h && x.getAttribute('aria-hidden') !== 'true' && flatText(x) === t && tinyBox(x));
  };
  const decorMemo = new Map();
  const decor = (e) => {
    if (!e || e.nodeType !== 1) return false;
    if (decorMemo.has(e)) return decorMemo.get(e);
    let v = false;
    try { if (/^(presentation|none)$/i.test(e.getAttribute('role') || '')) v = true; else { const h = hiddenTop(e); v = !!h && !spokenNearby(h); } } catch (x) { v = false; }
    decorMemo.set(e, v); return v;
  };
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const r1 = (x) => Math.round(x * 10) / 10;
  const moved = (s) => (s.transform && s.transform !== 'none') || (s.translate && s.translate !== 'none') || (s.scale && s.scale !== 'none') || (s.rotate && s.rotate !== 'none')
    || (s.position === 'relative' && (Math.abs(parseFloat(s.left) || 0) >= 0.5 || Math.abs(parseFloat(s.right) || 0) >= 0.5));
  const SKIP = /^(script|style|template|noscript|br|wbr|head|link|meta|textarea|option|optgroup|select)$/i;
  /* e вылез из колонки col? → находка или null */
  const check = (e, col) => {
    if (e instanceof SVGElement) return null;
    const s = cs(e);
    if (s.position === 'absolute' || s.position === 'fixed' || moved(s)) return null;
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.right <= 0 || r.left >= vw) return null;
    const c = cs(col); if (clips(c)) return null;
    if (s.visibility === 'hidden' || eff(e) <= 0.05 || decor(e)) return null;
    const cr = col.getBoundingClientRect(); const k = col.offsetWidth ? cr.width / col.offsetWidth : 1;
    const inL = cr.left + ((parseFloat(c.borderLeftWidth) || 0) + (parseFloat(c.paddingLeft) || 0)) * k;
    const inR = cr.right - ((parseFloat(c.borderRightWidth) || 0) + (parseFloat(c.paddingRight) || 0)) * k;
    if (!(inR > inL)) return null;
    let L = r.left, R = r.right;
    const clip = clipOf(e); if (clip) { const q = clip.getBoundingClientRect(); L = Math.max(L, q.left); R = Math.min(R, q.right); }
    const overR = (parseFloat(s.marginRight) || 0) < -0.5 ? 0 : R - inR;
    const overL = (parseFloat(s.marginLeft) || 0) < -0.5 ? 0 : inL - L;
    const over = Math.max(overR, overL);
    if (!(over >= 0.995)) return null;
    return { sig: sig(e), column: sig(col), px: r1(over), side: overR >= overL ? 'справа' : 'слева', width: r1(r.width), columnWidth: r1(inR - inL), text: clean(e.innerText || e.textContent) };
  };
  /* от блоков с видимым не декоративным текстом — вверх по колонкам до body: вылезти может и сам блок (h2), и его предок
     (карточка в гриде, растянутая неразрывной строкой заголовка) */
  const starts = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim()) continue;
    const par = n.parentElement; if (!par || SKIP.test(par.tagName) || par instanceof SVGElement || decor(par)) continue;
    const b = upBox(par); if (b && b !== document.body) starts.add(b);
  }
  const seen = new Set(); const list = [];
  for (const s0 of starts) {
    for (let e = s0; e && e !== document.body && e !== de && !seen.has(e);) {
      seen.add(e);
      const col = upBox(parentOf(e)); if (!col) break;
      const f = check(e, col); if (f) list.push(f);
      e = col;
    }
  }
  let docPx = 0; let causes = [];
  if (arg && arg.doc) {
    docPx = de.scrollWidth - vw;
    if (docPx >= 1) {
      const fixedIn = (el) => { for (let x = el; x && x !== de; x = parentOf(x)) if (cs(x).position === 'fixed') return true; return false; };
      const wide = [];
      for (const el of document.body.querySelectorAll('*')) {
        if (SKIP.test(el.tagName) || (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg')) continue;
        const r = el.getBoundingClientRect(); if ((r.width < 1 && r.height < 1) || r.right <= vw + 0.01) continue;
        if (clipOf(el) || fixedIn(el)) continue;
        wide.push({ el, sig: sig(el), right: r1(r.right), opacity: eff(el), text: clean(el.innerText || el.textContent) });
      }
      causes = wide.filter((o) => !wide.some((p) => p.el !== o.el && p.el.contains(o.el))).sort((a, b) => b.right - a.right).slice(0, 5).map(({ el, ...rest }) => rest);
    }
  }
  return { list: list.sort((a, b) => b.px - a.px).slice(0, (arg && arg.limit) || 20), count: list.length, docPx, causes, vw };
}
/* находки blockWiderInPage — в вердикт и summary переполнения (OK → WARN) и в поля blockWider, blockWiderCount, docWiderSmall */
async function blockFix(ov) {
  const b = await evaluateWith(page, blockWiderInPage, { doc: !ov.docWider, limit: 20 }, DEPS).catch(() => null);
  if (!b) return;
  ov.blockWider = b.list; ov.blockWiderCount = b.count;
  ov.docWiderSmall = !ov.docWider && b.docPx >= 1 ? { px: b.docPx, causes: b.causes } : null;
  if (ov.verdict === 'OK' && (b.count || ov.docWiderSmall)) ov.verdict = 'WARN';
  if (b.count) ov.summary += ` · блок шире своей колонки: ${b.list.slice(0, 3).map((t) => `${t.sig} на ${t.px} px (CSS px; за ${t.side === 'справа' ? 'правый' : 'левый'} край колонки ${t.column}: колонка ${t.columnWidth}, блок ${t.width}${t.text ? `; «${t.text}»` : ''})`).join(' | ')}${b.count > 3 ? ` и ещё ${b.count - 3}` : ''}`;
  if (ov.docWiderSmall) ov.summary += ` · страница шире окна на ${b.docPx} px (CSS px; scrollWidth документа ${ov.docScrollWidth} при окне ${ov.vw}): ${b.causes.slice(0, 3).map((o) => `${o.sig} до ${o.right} px${o.opacity <= 0.05 ? ' [невидимый]' : ''}${o.text ? ` «${o.text}»` : ''}`).join(' | ') || 'причина не найдена'}`;
}
/* поправка на вертикальное письмо (verticalTextInPage) — в ov на месте */
async function verticalFix(ov) {
  const vert = await evaluateWith(page, verticalTextInPage, { tol: 2 }, DEPS).catch(() => ({}));
  const skipped = []; const kept = [];
  for (const t of ov.textWider) {
    const v = vert[`${t.sig}|${t.text}`];
    if (!v) { kept.push(t); continue; }
    if (v.long || v.wide) kept.push({ ...t, vertical: v });
    else skipped.push({ ...t, vertical: v });
  }
  if (!skipped.length && !kept.some((t) => t.vertical)) return ov;
  const oldList = ov.textWider;
  ov.textWider = kept; ov.textWiderCount = Math.max(kept.length, ov.textWiderCount - skipped.length); ov.verticalSkipped = skipped;
  const otherWarn = !!ov.docWider || Object.entries(ov).some(([k, n]) => /Count$/.test(k) && k !== 'textWiderCount' && Number(n) > 0);
  if (ov.verdict !== 'FAIL') ov.verdict = ov.textWiderCount || otherWarn ? 'WARN' : 'OK';
  /* кусок summary «текст шире коробки: …» — тот, что написал lib.findOverflow (по первым трём), заменить
     на новый по оставшимся; не нашёлся дословно (lib сменил запись) — до следующего куска « · слово…: » */
  const HEAD = ' · текст шире коробки: ';
  /* пара — правые края по x (CSS px), а не ширины (SKILL-ISSUES 503); запись — как у lib.findOverflow */
  const TAIL = ' (края по x от левого края окна, CSS px)';
  const edge = (t) => `${t.sig} «${t.text}» — правый край текста ${t.textRight} px при крае коробки ${t.boxRight} px`;
  const fmt = (t) => {
    if (!t.vertical) return edge(t);
    const v = t.vertical;
    return v.wide ? `${edge(t)} (вертикальное письмо: сбоку вылезло на ${v.side} px, край глифа при кегле ${v.fontSize}px — до ${v.sideTol} px)`
      : `${t.sig} «${t.text}» по высоте ${v.textTop}…${v.textBottom} при коробке ${v.boxTop}…${v.boxBottom}px (вертикальное письмо)`;
  };
  const oldSeg = `${HEAD}${oldList.slice(0, 3).map(edge).join(' | ')}${TAIL}`;
  const seg = kept.length ? `${HEAD}${kept.slice(0, 3).map(fmt).join(' | ')}${ov.textWiderCount > 3 ? ` и ещё ${ov.textWiderCount - 3}` : ''}${TAIL}` : '';
  let at = ov.summary.indexOf(oldSeg); let end = at >= 0 ? at + oldSeg.length : -1;
  if (at < 0) {
    at = ov.summary.indexOf(HEAD);
    if (at >= 0) { const m = / · [a-zа-яё][^«»|:]*: /.exec(ov.summary.slice(at + HEAD.length)); end = m ? at + HEAD.length + m.index : ov.summary.length; }
  }
  if (at >= 0) ov.summary = ov.summary.slice(0, at) + seg + ov.summary.slice(end);
  if (skipped.length) ov.summary += ` · вертикальное письмо сверено по высоте и сбоку (с краем глифа), в коробке: ${skipped.slice(0, 3).map((t) => `${t.sig} «${t.text}»`).join(', ')}`;
  return ov;
}
async function autoCheck(after) {
  await sleep(150); const waited = await settleAnimations(page, 3000);
  const list = (await canvasList(page).catch(() => [])).filter((c) => c.clientWidth > 0 && c.clientHeight > 0 && c.opacity > 0.05 && c.ctx);
  if (list.length) {
    const judged = list.map((c) => ({ c, ...sharpness(c) }));
    const worst = judged.some((j) => j.st === 'FAIL') ? 'FAIL' : judged.some((j) => j.st === 'WARN') ? 'WARN' : 'OK';
    const bad = judged.filter((j) => j.st !== 'OK');
    const key = `${worst}|${bad.map((j) => `${j.c.sig}:${j.c.width}x${j.c.height}/${j.c.clientWidth}x${j.c.clientHeight}`).join(',')}`;
    if (key !== lastAuto.canvas) {
      line(worst, `холсты ${after} (переходы кончились через ${waited} мс)`, bad.length ? bad.slice(0, 5).map((j) => `${j.c.sig}: ${j.bad.join('; ')}`).join(' | ') + (bad.length > 5 ? ` и ещё ${bad.length - 5}` : '') : `${list.length} шт., минимум ×${Math.min(...list.map((c) => c.ratioCss ?? 9))} от CSS px${lastAuto.canvas && !lastAuto.canvas.startsWith('OK') ? ` — после «${lastAuto.canvasAt}» было хуже, теперь резко` : ''}`);
      lastAuto.canvas = key; lastAuto.canvasAt = after;
    }
  }
  const ov = await overflowOf().catch(() => null);
  if (ov) {
    const key = `${ov.verdict}|${ov.vw}|${(ov.outer || []).map((o) => o.sig).join(',')}|${(ov.blockWider || []).map((o) => `${o.sig}:${o.px}`).join(',')}|${ov.docWiderSmall ? ov.docWiderSmall.px : ''}`;
    if (key !== lastAuto.overflow && (ov.verdict !== 'OK' || (lastAuto.overflow && !lastAuto.overflow.startsWith('OK')))) line(ov.verdict, `переполнение ${after} на ${ov.vw}px`, ov.summary);
    lastAuto.overflow = key; lastAuto.overflowAt = after;
  }
}

/* ---------- шаги ---------- */
/* слой на весь экран поверх страницы (открытое меню, диалог): открытый модальный <dialog> (:modal) или самый
   внешний position: fixed у верхнего элемента в 3 из 5 точек окна, видимый, от 60% окна. Такой слой, который
   был уже при загрузке (закреплённый фон или первый экран на position: fixed, заставка), отмечается
   data-rw-base-layer (arg.base) и потом не в счёт: под открытым меню «Эпицентра» elementsFromPoint не отдаёт
   ничего, кроме body и html (страница под замком), поэтому «есть ли что-то под слоем» — не признак */
function openLayerInPage(arg) {
  const vw = innerWidth, vh = innerHeight; const de = document.documentElement;
  const outerFixed = (el) => { let f = null; for (let e = el; e && e !== de; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') f = e; return f; };
  let found = null;
  try { const m = [...document.querySelectorAll('dialog')].find((d) => d.matches(':modal')); if (m) found = { el: m, share: 100, kind: 'диалог' }; } catch { /* нет :modal */ }
  if (!found) {
    const tally = new Map();
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.75], [0.75, 0.75]]) {
      const list = document.elementsFromPoint(vw * fx, vh * fy); if (!list.length) continue;
      const layer = outerFixed(list[0]); if (!layer || eff(layer) <= 0.05 || getComputedStyle(layer).visibility === 'hidden') continue;
      const r = layer.getBoundingClientRect();
      const share = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / (vw * vh);
      if (share < 0.6) continue;
      const t = tally.get(layer) || { n: 0, share }; t.n++; tally.set(layer, t);
    }
    const best = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    if (best && best[1].n >= 3) found = { el: best[0], share: Math.round(best[1].share * 100), kind: /dialog/i.test(best[0].getAttribute('role') || '') || best[0].getAttribute('aria-modal') === 'true' ? 'диалог' : 'меню или слой' };
  }
  if (!found) return null;
  if (arg && arg.base) { found.el.setAttribute('data-rw-base-layer', ''); return { sig: sig(found.el), share: found.share }; }
  if (found.el.hasAttribute('data-rw-base-layer')) return null;
  /* arg.mark — пометить слой для проверки фокуса (focusTrapCheck снимает метку сам) */
  if (arg && arg.mark) found.el.setAttribute('data-rw-open-layer', '');
  return { sig: sig(found.el), share: found.share, kind: found.kind };
}
/* в странице, после нажатия Tab: где фокус относительно помеченного слоя (data-rw-open-layer). → { closed } — слой больше
   не открыт (скрыт, прозрачен, убран, закрывает меньше половины окна); { where: 'body' } — фокус ни на чём; 'in' — в слое;
   'under' — вне слоя, а в центре элемента сверху слой (страница под ним); 'off' — вне слоя и вне окна (страница под замком
   не доезжает до него — тоже не видно); 'above' — вне слоя, но сверху он сам (кнопка меню поверх слоя) */
function focusProbeInPage() {
  const L = document.querySelector('[data-rw-open-layer]');
  const a = document.activeElement;
  const name = (e) => { const t = String(e.innerText || e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim(); return `${sig(e)}${t ? ` «${t.slice(0, 30)}»` : ''}`; };
  const open = (() => {
    if (!L || !L.isConnected) return false;
    const s = getComputedStyle(L); if (s.display === 'none' || s.visibility === 'hidden' || eff(L) <= 0.05) return false;
    const q = L.getBoundingClientRect();
    const share = Math.max(0, Math.min(q.right, innerWidth) - Math.max(q.left, 0)) * Math.max(0, Math.min(q.bottom, innerHeight) - Math.max(q.top, 0)) / (innerWidth * innerHeight);
    return share >= 0.5;
  })();
  if (!open) return { closed: true, active: a && a !== document.body ? name(a) : 'body' };
  if (!a || a === document.body || a === document.documentElement) return { where: 'body', active: 'body' };
  if (a === L || L.contains(a)) return { where: 'in', active: name(a) };
  const r = a.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return { where: 'off', active: name(a) };
  const hit = document.elementFromPoint(cx, cy);
  return { where: hit && (hit === L || L.contains(hit)) ? 'under' : 'above', active: name(a) };
}
/* фокус в открытом слое (строка 531 SKILL-ISSUES, 30.09): после --click, открывшего слой на весь экран (openLayerInPage:
   fixed или :modal, видим, от 80% окна; до клика его не было), — до 15 нажатий Tab. Фокус ушёл на элемент вне слоя и под
   ним (или вне окна) — WARN «фокус уходит из открытого слоя на страницу под ним» с первым таким элементом: человек с
   клавиатурой листает невидимую страницу под меню (утечку «Эпицентра» — логотип и телефон под меню, потом содержимое —
   нашёл только свой обход). Остался в слое или над ним — OK; слой закрылся, когда фокус ушёл, — OK (ловушка не нужна) с
   пометкой, что дальше шаги идут с закрытым слоем. После проверки фокус и прокрутка возвращаются как были (метка снимается),
   слой не закрывается */
async function focusTrapCheck(v, before) {
  const layer = await evaluateWith(page, openLayerInPage, { mark: true }, DEPS).catch(() => null);
  const unmark = () => page.evaluate(() => { for (const e of document.querySelectorAll('[data-rw-open-layer]')) e.removeAttribute('data-rw-open-layer'); }).catch(() => {});
  if (!layer || layer.share < 80 || (before && before.sig === layer.sig)) { await unmark(); return; }
  const saved = await page.evaluate(() => { window.__rwFocusBack = document.activeElement; const L = document.querySelector('[data-rw-open-layer]'); return { x: scrollX, y: scrollY, ly: L ? L.scrollTop : 0 }; }).catch(() => null);
  const path = []; let leak = null, closed = null, above = 0, inside = 0, n = 0;
  try {
    for (n = 1; n <= 15; n++) {
      await page.keyboard.press('Tab'); await sleep(120);
      let r = await evaluateWith(page, focusProbeInPage, null, DEPS).catch(() => null);
      if (!r) break;
      /* похоже на утечку — дождаться переходов (слой мог уезжать, закрываясь) и посмотреть ещё раз */
      if (r.where === 'under' || r.where === 'off') { await settleAnimations(page, 1500); r = await evaluateWith(page, focusProbeInPage, null, DEPS).catch(() => r); }
      path.push(r.closed ? `(слой закрылся) ${r.active}` : `${r.active} [${{ in: 'в слое', under: 'под слоем', off: 'вне окна', above: 'над слоем', body: 'ни на чём' }[r.where]}]`);
      if (r.closed) { closed = { at: n, active: r.active }; break; }
      if (r.where === 'under' || r.where === 'off') { leak = { at: n, active: r.active, where: r.where }; break; }
      if (r.where === 'above') above++;
      if (r.where === 'in') inside++;
    }
  } finally {
    await page.evaluate((s) => {
      const b = window.__rwFocusBack; window.__rwFocusBack = null;
      if (b && b !== document.body && b.isConnected && typeof b.focus === 'function') b.focus({ preventScroll: true });
      else if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
      if (s) { window.scrollTo({ left: s.x, top: s.y, behavior: 'instant' }); const L = document.querySelector('[data-rw-open-layer]'); if (L) L.scrollTop = s.ly; }
    }, saved).catch(() => {});
    await unmark();
  }
  const title = `фокус в открытом слое ${layer.sig} после --click ${v}`;
  const data = { layer, tabs: Math.min(n, 15), path, leak, closed };
  if (leak) line('WARN', `фокус уходит из открытого слоя на страницу под ним: ${leak.active}`, `на ${leak.at}-м нажатии Tab фокус ушёл из слоя ${layer.sig} (${layer.kind}, ${layer.share}% окна) на ${leak.active} — ${leak.where === 'off' ? 'он вне слоя и за краем окна' : 'он под слоем (в его центре сверху слой)'}: человек с клавиатурой листает невидимую страницу. Удерживайте фокус в открытом меню (inert у страницы, <dialog> через showModal() или перехват Tab) · путь: ${path.join(' → ')}`, data);
  else if (closed) line('OK', title, `слой закрылся на ${closed.at}-м нажатии Tab, когда фокус ушёл из него (${closed.active}) — ловушка не нужна; дальше шаги идут с закрытым слоем · путь: ${path.join(' → ')}`, data);
  else line('OK', title, `${Math.min(n, 15)} нажатий Tab: фокус не уходит на страницу под слоем (в слое ${inside}${above ? `, над слоем ${above}` : ''}) · путь: ${path.slice(0, 6).join(' → ')}${path.length > 6 ? ' → …' : ''}`, data);
}
let lastClick = null; /* селектор последнего --click: после него слой на весь экран часто остаётся открытым */

async function scrollStep() {
  /* прокрутка при открытом меню меряет меню, а не страницу (закреплены: div#drawer.is-open) — сказать прямо */
  const layer = await evaluateWith(page, openLayerInPage, null, DEPS).catch(() => null);
  if (layer) line('WARN', 'прокрутка идёт при открытом меню/диалоге', `${layer.kind} ${layer.sig} закрывает ${layer.share}% окна${lastClick ? ` — открыт после --click ${lastClick}` : ''}; появления, закреплённые и переполнение ниже мерятся по нему, а не по странице — пишите --scroll до --click или закройте слой шагом (--click по крестику, --key Escape)`, { layer, lastClick });
  /* правила :hover, которые ПОКАЗЫВАЮТ другой элемент: цель — не сам триггер («.item:hover .tip»), объявлено
     opacity от 0.9 (или через var()) или visibility: visible. Приглушение соседей («.grid:hover .card
     { opacity: .6 }») и наведение на сам элемент («a:hover { opacity: .8 }») — не показ: такой элемент
     прозрачен из-за появления. Совпадение с целью правила — только кандидат: после прохода он проверяется
     настоящим наведением на триггер (правило могло проиграть по специфичности, «.grid .card.reveal:not(.in)») */
  const hoverRules = await evaluateWith(page, () => {
    const { rules } = hov();
    const shows = (r) => {
      const d = r.decl || {}; const o = String(d.opacity || '').trim(); const v = String(d.visibility || '').trim();
      if (/^visible/i.test(v)) return true;
      if (!o) return false; if (/var\(/i.test(o)) return true;
      const x = parseFloat(o); return Number.isFinite(x) && (/%/.test(o) ? x / 100 : x) >= 0.9;
    };
    const seen = new Set(); const out = [];
    for (const r of rules) {
      if (r.pseudo || !r.target || !r.trigger || r.target === r.trigger || !shows(r)) continue;
      const k = `${r.trigger}|${r.target}`; if (seen.has(k)) continue; seen.add(k);
      try { document.querySelector(r.target); document.querySelector(r.trigger); } catch { continue; }
      out.push({ trigger: r.trigger, target: r.target });
    }
    return out;
  }, null, { ...DEPS, hov: hoverRulesInPage.toString() }).catch(() => []);
  await evaluateWith(page, (rules) => {
    document.querySelectorAll('[data-rw-hidden], [data-rw-hover-shown], [data-rw-hvtrig]').forEach((e) => { e.removeAttribute('data-rw-hidden'); e.removeAttribute('data-rw-hover-shown'); e.removeAttribute('data-rw-hvtrig'); });
    const infinite = new Set(document.getAnimations().filter((a) => a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity && a.effect.target).map((a) => a.effect.target));
    const moving = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (infinite.has(e)) return true; return false; };
    /* правила наведения, чья цель — этот элемент или его предок: кандидат в подсказки (проверка — после прохода) */
    const hoverRulesOf = (el) => rules.filter((r) => { try { return !!el.closest(r.target); } catch { return false; } });
    /* внутри закреплённого (position: fixed у предка) — прокруткой не въезжает: рельс слева, шапка, меню. Его место
       в окне не зависит от прокрутки, и после --eval с прокруткой вниз «top + scrollY» выносил его «ниже первого
       экрана». Исключение — обёртка на всю страницу, внутри которой содержимое едет transform (GSAP ScrollSmoother:
       #smooth-wrapper fixed на всё окно, содержимое выше полутора окон): это и есть страница. Обёртка видима и
       закрывает окно от 90% — закрытое меню на весь экран спрятано (visibility, opacity) или уехало за край
       (transform), — и держит от трети элементов страницы (выезжающий каталог — малая их часть): иначе пункты
       закрытого длинного меню с opacity 0 шли бы в «не появились» */
    const wrapMemo = new Map(); const allEls = document.body.getElementsByTagName('*').length;
    const pageWrap = (f) => {
      if (wrapMemo.has(f)) return wrapMemo.get(f);
      const r = f.getBoundingClientRect();
      const onScreen = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / (innerWidth * innerHeight);
      const tall = Math.max(f.scrollHeight, ...[...f.children].map((c) => c.getBoundingClientRect().height));
      const yes = onScreen >= 0.9 && tall > innerHeight * 1.5 && eff(f) > 0.05 && getComputedStyle(f).visibility !== 'hidden'
        && f.getElementsByTagName('*').length >= allEls / 3;
      wrapMemo.set(f, yes); return yes;
    };
    const inFixed = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return !pageWrap(e); return false; };
    /* поле формы — не блок появления: радиокнопка или флажок с opacity 0 поверх подписи — приём оформления;
       невидимые поля идут отдельно, в «невидимы по замыслу» */
    const FIELD = /^(INPUT|SELECT|TEXTAREA|OPTION|OPTGROUP|DATALIST)$/;
    const fields = [];
    const vh = innerHeight; let i = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (i >= 120) break;
      const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 30) || r.top + scrollY <= vh) continue;
      const s = getComputedStyle(el); if (s.display === 'none' || s.position === 'fixed' || /hover/i.test(String(el.className))) continue;
      if (!(parseFloat(s.opacity) < 0.95 || (s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)'))) continue;
      if (moving(el) || (el.parentElement && el.parentElement.closest('[data-rw-hidden]'))) continue;
      if (FIELD.test(el.tagName)) { if (fields.length < 40) fields.push(el); continue; }
      if (inFixed(el)) continue;
      el.setAttribute('data-rw-hidden', String(i++));
      const hr = hoverRulesOf(el); el.__rwHov = hr.length ? hr : null;
      /* прозрачность при отметке и самая большая за проход: появление «туда и обратно» (AOS с once: false
         прячет блок снова, когда он ушёл из окна) — тоже появление */
      el.__rwOp0 = eff(el); el.__rwOpMax = el.__rwOp0; el.__rwOpMoved = false;
      el.__rwTf0 = s.transform; el.__rwTfMoved = false;
    }
    window.__rwFields = fields;
  }, hoverRules, DEPS);
  /* на каждом шаге прохода — что с отмеченными: стало ли видно, менялась ли прозрачность или сдвиг */
  const onStep = () => evaluateWith(page, () => {
    for (const el of document.querySelectorAll('[data-rw-hidden]')) {
      const o = eff(el);
      if (o > (el.__rwOpMax || 0)) el.__rwOpMax = o;
      if (Math.abs(o - (el.__rwOp0 || 0)) > 0.01) el.__rwOpMoved = true;
      if (!el.__rwTfMoved && getComputedStyle(el).transform !== el.__rwTf0) el.__rwTfMoved = true;
    }
  }, null, DEPS).catch(() => {});
  const res = await scrollThrough(page, { shotsDir: outDir, tag: `${tag}-scroll`, maxShots: 6, onStep });
  scrolled = true;
  /* подсказки при наведении: отмеченное, что не появилось за проход и совпало с целью правила «показать при
     наведении», проверяется настоящим наведением на триггер (предок по селектору до :hover или сосед при «+»/«~»).
     Показалось (итоговая прозрачность от 0.3) — «показываются при наведении», без WARN; не показалось, триггер
     не найден или перекрыт — остаётся в «не появились». Один триггер — одно наведение на всех его кандидатов */
  const hvGroups = await evaluateWith(page, () => {
    const groups = new Map(); let n = 0;
    for (const el of document.querySelectorAll('[data-rw-hidden]')) {
      if (!el.__rwHov || eff(el) >= 0.05 || (el.__rwOpMax || 0) >= 0.05) continue;
      let trig = null;
      for (const r of el.__rwHov) {
        try { trig = el.closest(r.trigger); } catch { trig = null; }
        if (trig === el) trig = null;
        if (!trig && el.parentElement) { try { trig = [...el.parentElement.children].find((x) => x !== el && x.matches(r.trigger)) || null; } catch { trig = null; } }
        if (trig) break;
      }
      if (!trig) continue;
      if (!trig.hasAttribute('data-rw-hvtrig')) trig.setAttribute('data-rw-hvtrig', String(n++));
      const k = trig.getAttribute('data-rw-hvtrig'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(el.getAttribute('data-rw-hidden'));
    }
    return [...groups.entries()].map(([trig, ids]) => ({ trig, ids }));
  }, null, DEPS).catch(() => []);
  const HV_MAX = 20; let hvTried = 0, hvReached = 0;
  for (const g of hvGroups.slice(0, HV_MAX)) {
    hvTried++;
    /* scrollIntoView прокручивает и предков с overflow hidden (обёртку ScrollSmoother, #smooth-wrapper) — их
       прокрутка запоминается и после наведения возвращается, иначе страница осталась бы сдвинутой внутри обёртки */
    await page.evaluate((n) => {
      const t = document.querySelector(`[data-rw-hvtrig="${n}"]`); if (!t) return;
      const keep = []; for (let e = t.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) if (e.scrollTop || e.scrollLeft || e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth) keep.push([e, e.scrollTop, e.scrollLeft]);
      window.__rwHvKeep = keep;
      t.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, g.trig).catch(() => {});
    await sleep(150); await settleAnimations(page, 1500);
    const pt = await page.evaluate((n) => {
      const t = document.querySelector(`[data-rw-hvtrig="${n}"]`); if (!t) return null;
      const b = t.getBoundingClientRect();
      for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.75], [0.1, 0.5], [0.9, 0.5]]) {
        const x = b.left + b.width * fx, y = b.top + b.height * fy;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        const e = document.elementFromPoint(x, y); if (e && (e === t || t.contains(e))) return { x, y };
      }
      return null;
    }, g.trig).catch(() => null);
    if (pt) {
      hvReached++;
      await page.mouse.move(pt.x, pt.y); await sleep(150); await settleAnimations(page, 1500); await sleep(60);
      await evaluateWith(page, (a) => { for (const id of a.ids) { const el = document.querySelector(`[data-rw-hidden="${id}"]`); if (el && eff(el) >= 0.3) el.setAttribute('data-rw-hover-shown', ''); } }, { ids: g.ids }, DEPS).catch(() => {});
      await page.mouse.move(cur.width - 2, 2); await sleep(60);
    }
    await page.evaluate(() => { for (const [e, t, l] of window.__rwHvKeep || []) { e.scrollTop = t; e.scrollLeft = l; } window.__rwHvKeep = null; }).catch(() => {});
  }
  if (hvTried) { await scrollToY(page, 0); await sleep(250); }
  const after = await evaluateWith(page, () => {
    const marked = [...document.querySelectorAll('[data-rw-hidden]')].filter((el) => !el.hasAttribute('data-rw-hover-shown'));
    const hoverShown = [...document.querySelectorAll('[data-rw-hidden][data-rw-hover-shown]')];
    /* кто прячет: сам элемент или ближайший предок с прозрачностью 0 или visibility:hidden */
    const hider = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (parseFloat(s.opacity) < 0.05 || s.visibility === 'hidden') return e; } return el; };
    /* может проявиться: переход прозрачности, видимости, сдвига или фильтра, анимация, признаки библиотек появления */
    const TR = /^(all|opacity|visibility|transform|translate|scale|rotate|filter|clip-path)$/;
    const canMove = (e) => {
      const s = getComputedStyle(e);
      const props = s.transitionProperty.split(',').map((x) => x.trim()); const durs = s.transitionDuration.split(',').map((x) => parseFloat(x) || 0);
      if (props.some((p, k) => TR.test(p) && (durs[k % durs.length] || 0) > 0)) return true;
      if (s.animationName && s.animationName !== 'none') return true;
      try { if (e.getAnimations().length) return true; } catch { /* нет getAnimations */ }
      return false;
    };
    const HINT_CLASS = /(^|[\s_-])(reveal|fade|appear|animat|aos|wow|inview|in-view|on-scroll|scroll-?(reveal|anim)|sal-|js-anim)/i;
    const HINT_ATTR = /^data-(aos|sal|sr|scroll|animate|anim|reveal|inview|wow|motion|w-id|framer-appear)/i;
    const hinted = (el) => {
      for (let e = el, k = 0; e && e.nodeType === 1 && k < 3; e = e.parentElement, k++) {
        const cls = typeof e.className === 'string' ? e.className : (e.getAttribute('class') || '');
        if (HINT_CLASS.test(cls)) return true;
        for (const a of e.attributes) if (HINT_ATTR.test(a.name)) return true;
      }
      return false;
    };
    /* блок называется селектором и началом текста: «section.reveal «Ближайшие события»» */
    const named = (el) => { const t = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(); return `${sig(el)}${t ? ` «${t.length > 30 ? t.slice(0, 30) + '…' : t}»` : ''}`; };
    const still = [], meant = [], stillNamed = [];
    for (const el of marked) {
      if (eff(el) >= 0.05 || (el.__rwOpMax || 0) >= 0.05) continue; /* видно сейчас или было видно на каком-то шаге */
      const h = hider(el);
      /* прозрачность ни разу не менялась, проявиться нечем и не похоже на появление — невидимо по замыслу */
      if (!el.__rwOpMoved && !canMove(h) && !(h !== el && canMove(el)) && !hinted(h) && !hinted(el)) meant.push(sig(el));
      else { still.push(sig(el)); stillNamed.push(named(el)); }
    }
    const fields = (window.__rwFields || []).filter((el) => el.isConnected && eff(el) < 0.05).map(sig);
    const hoverOnly = hoverShown.map(named);
    const sticky = [...document.body.querySelectorAll('*')].filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position) && el.getBoundingClientRect().height > 20 && eff(el) > 0.05).slice(0, 5).map(sig);
    /* в списке «ждали появления» — то, что было спрятано или двигалось за проход; полупрозрачное без движения
       (подпись к фото с opacity .6, силуэт .32) видно и так — оно в счёт marked, но в список не идёт */
    const waited = marked.filter((el) => (el.__rwOp0 || 0) < 0.05 || el.__rwOpMoved || el.__rwTfMoved);
    return { marked: marked.length, waitedCount: waited.length, waited: waited.slice(0, 40).map(named), still, stillNamed, meant: [...fields, ...meant], fields: fields.length, hoverOnly, sticky };
  }, null, DEPS);
  const ov = await overflowOf();
  const st = ov.verdict === 'FAIL' ? 'FAIL' : (after.still.length || ov.verdict === 'WARN' || res.stuck || !res.reachedBottom) ? 'WARN' : 'OK';
  const list4 = (l) => `${l.slice(0, 4).join(', ')}${l.length > 4 ? ` и ещё ${l.length - 4}` : ''}`;
  const meantNote = after.meant.length ? ` · невидимы по замыслу (поля формы и прозрачное без перехода и анимации, прозрачность не менялась): ${after.meant.length} (${after.meant.slice(0, 4).join(', ')}${after.meant.length > 4 ? '…' : ''})` : '';
  const hoverNote = (after.hoverOnly.length ? ` · показываются при наведении (проверено наведением на триггер правила :hover — не появление при прокрутке): ${after.hoverOnly.length} (${list4(after.hoverOnly)})` : '')
    + (hvGroups.length > HV_MAX ? ` · наведением проверены первые ${HV_MAX} триггеров из ${hvGroups.length}, остальные кандидаты — в «не появились»` : '');
  const revealTxt = `ждали появления: ${after.waitedCount}${after.waitedCount ? ` (${list4(after.waited)}${after.waitedCount > after.waited.length ? `, всего ${after.waitedCount}` : ''})` : ''} — не появились: ${after.still.length}${after.still.length ? ` (${list4(after.stillNamed)})` : ''}`;
  line(st, `прокрутка ${res.pageHeight}px, ${res.screens} экранов`, `${revealTxt}${meantNote}${hoverNote}${res.stuck ? ' · СТРАНИЦА НЕ ПРОКРУЧИВАЕТСЯ' : !res.reachedBottom ? ` · не доехали до низа (${res.maxScrollY}px)` : ''}${after.sticky.length ? ` · закреплены: ${after.sticky.join(', ')}` : ''} · переполнение: ${ov.verdict} — ${ov.summary}`, { reveal: { marked: after.marked, waitedCount: after.waitedCount, waited: after.waited, still: after.still, stillNamed: after.stillNamed, meant: after.meant, hoverOnly: after.hoverOnly, hoverTriggers: { candidates: hvGroups.length, tried: hvTried, reached: hvReached } }, overflow: { verdict: ov.verdict, outer: ov.outer, wideCauses: ov.wideCauses, textWider: ov.textWider, textWiderCount: ov.textWiderCount, verticalSkipped: ov.verticalSkipped || [], panelCut: ov.panelCut, covered: ov.covered, coveredCount: ov.coveredCount, clipCut: ov.clipCut, clipCutCount: ov.clipCutCount, fieldCut: ov.fieldCut, fieldCutCount: ov.fieldCutCount, blockWider: ov.blockWider || [], blockWiderCount: ov.blockWiderCount || 0, docWiderSmall: ov.docWiderSmall || null, docScrollWidth: ov.docScrollWidth, vw: ov.vw } });
  /* «текст перекрыт» — всегда своей строкой: по строке прокрутки не видно, шла ли проверка. Её WARN уже
     посчитан строкой прокрутки (переполнение WARN), поэтому здесь не считается второй раз */
  if (ov.coveredCount === undefined) line('INFO', 'текст перекрыт картинкой', 'не проверялось: lib.findOverflow без поля covered', null, { count: false });
  else {
    const cov = ov.coveredCount;
    line(cov ? 'WARN' : 'OK', 'текст перекрыт картинкой', cov ? `${cov} мест: ${ov.covered.slice(0, 5).map((t) => `${t.sig} «${t.text}» под ${t.by} (y ${t.y})`).join(' | ')}${cov > 5 ? ` и ещё ${cov - 5}` : ''} — картинка лежит поверх чужого текста (фон под текстом не в счёт)` : 'нет: img, video, canvas и svg от 40px не лежат поверх чужого текста', { covered: ov.covered, coveredCount: cov }, { count: false });
  }
}

async function hoverStep(v) {
  const h = await find(v);
  if (!h) return line('FAIL', `наведение ${v}`, notFound());
  await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.mouse.move(cur.width - 2, 2); await sleep(150); await settleAnimations(page, 1500);
  const base = await readState(h); await h.hover(); await sleep(150); await settleAnimations(page, 2000); await sleep(100);
  const hov = await readState(h);
  const file = await shot('hover'); const d = diffState(base, hov);
  let why = '';
  if (!d.length) why = await h.evaluate((el) => { const hold = el.getAnimations().filter((a) => { const f = a.effect.getTiming().fill; return (f === 'both' || f === 'forwards') && a.playState === 'finished'; }); return hold.length ? ` — свойства держит анимация ${hold.map((a) => `${a.animationName || 'без имени'} (fill ${a.effect.getTiming().fill})`).join(', ')}` : ''; });
  /* первым видимым часто оказывается активный пункт меню — у него «наведённый» вид уже стоит */
  if (!d.length && !why) {
    const act = await h.evaluate((el) => { const c = [...el.classList].find((x) => /(^|[-_])(active|current|selected)$/i.test(x)); const ac = el.getAttribute('aria-current'); return c ? `.${c}` : ac && ac !== 'false' ? `[aria-current=${ac}]` : null; }).catch(() => null);
    if (act) why = ` — это активный пункт (${act}): вид при наведении у него уже стоит; наведите на другой: --hover "${v}:not(${act})"`;
  }
  await page.mouse.move(cur.width - 2, 2);
  line(d.length ? 'OK' : 'WARN', `наведение ${v}`, d.length ? `${d.join('; ')} · ${file}` : `у самого элемента ничего не изменилось${why} (потомков проверяет --hover-all) · ${file}`);
}

/* правила :hover из CSSOM (с учётом @media и @supports): триггер — до :hover, цель — весь селектор */
function hoverRulesInPage() {
  const out = [];
  const splitTop = (s, sep) => { const parts = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === sep && d === 0) { parts.push(cur); cur = ''; } else cur += ch; } parts.push(cur); return parts.map((x) => x.trim()).filter(Boolean); };
  const walk = (list) => {
    for (const r of list) {
      if (r.type === CSSRule.MEDIA_RULE) { if (matchMedia(r.conditionText).matches) walk(r.cssRules); }
      else if (r.type === CSSRule.SUPPORTS_RULE) { if (CSS.supports(r.conditionText)) walk(r.cssRules); }
      else if (r.type === CSSRule.STYLE_RULE && /:hover/.test(r.selectorText)) {
        const props = []; for (let i = 0; i < r.style.length; i++) if (!r.style[i].startsWith('--')) props.push(r.style[i]);
        if (!props.length) continue;
        for (const sel of splitTop(r.selectorText, ',')) {
          if (!/:hover/.test(sel) || /:(not|is|where|has)\([^)]*:hover/.test(sel)) continue;
          const pseudo = (/(::?(before|after))$/.exec(sel) || [])[1] || null;
          const clean = sel.replace(/::?(before|after)$/, '');
          const idx = clean.lastIndexOf(':hover'); const rest = clean.slice(idx + 6); const cut = rest.search(/[\s>+~]/);
          const trigger = (cut < 0 ? clean : clean.slice(0, idx + 6 + cut)).replace(/:hover/g, '');
          out.push({ sel, trigger: trigger.trim(), target: clean.replace(/:hover/g, '').trim(), pseudo, props, decl: Object.fromEntries(props.map((p) => [p, r.style.getPropertyValue(p)])) });
        }
      } else if (r.cssRules && r.type !== CSSRule.KEYFRAMES_RULE) walk(r.cssRules);
    }
  };
  let unreadable = 0;
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { unreadable++; } }
  return { rules: out, unreadable };
}
async function hoverAllStep() {
  if (cur.hasTouch) return line('WARN', 'наведение всех правил', 'экран с касанием — наведения нет; проверять на desktop');
  const { rules, unreadable } = await page.evaluate(hoverRulesInPage);
  const results = [];
  const tryOne = async (r, trig) => {
    await page.mouse.move(cur.width - 2, 2); await sleep(60);
    await trig.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(200); await settleAnimations(page, 1500);
    const read = (full) => page.evaluate((target, pseudo, props, full, trigEl) => {
      let cands = [];
      try { cands = full ? [...document.querySelectorAll(full)] : [...document.querySelectorAll(target)].filter((t) => t === trigEl || trigEl.contains(t) || (t.parentElement && t.parentElement.contains(trigEl))); } catch { return []; }
      return cands.slice(0, 3).map((el) => { el.__rwProbe = el.__rwProbe || Math.random().toString(36).slice(2); const s = getComputedStyle(el, pseudo); return { id: el.__rwProbe, v: Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)])) }; });
    }, r.target, r.pseudo, r.props, full, trig);
    const before = await read(null);
    const pt = await trig.evaluate((el) => { const b = el.getBoundingClientRect(); for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.75], [0.1, 0.5], [0.9, 0.5]]) { const x = b.left + b.width * fx, y = b.top + b.height * fy; const t = document.elementFromPoint(x, y); if (t && (t === el || el.contains(t))) return { x, y }; } return null; });
    if (!pt) return { status: 'covered', why: 'элемент перекрыт другим — наведение до него не доходит' };
    await page.mouse.move(pt.x, pt.y); await sleep(100); await settleAnimations(page, 1500); await sleep(60);
    const full = r.sel.replace(/::?(before|after)$/, '');
    const after = await read(full);
    const changed = []; for (const a of after) { const b = before.find((x) => x.id === a.id); if (!b) continue; for (const p of r.props) if (a.v[p] !== b.v[p]) changed.push(`${p}: ${short(b.v[p], 30)} → ${short(a.v[p], 30)}`); }
    let why = '';
    if (!after.length) {
      await page.mouse.move(cur.width - 2, 2); await sleep(50);
      /* цели правила нет ни у этого элемента, ни до наведения: «.rail__item:hover .rail__tip», а .rail__tip нет в DOM —
         мёртвый селектор, а не «перебито»: чинится возвратом элемента или удалением правила, не каскадом */
      if (!before.length) {
        const inDom = await page.evaluate((t) => { try { return document.querySelectorAll(t).length; } catch { return -1; } }, r.target).catch(() => -1);
        if (inDom === 0) return { status: 'nosel', changed, why: `элемента ${r.target} нет в DOM — правилу не к чему применяться`, none: true };
        if (inDom > 0) return { status: 'nosel', changed, why: `у этого ${r.trigger} нет ${r.target.slice(r.trigger.length).trim() || r.target} (в DOM таких ${inDom} — у других)` };
      }
      return { status: 'covered', changed, why: 'селектор с :hover не совпал ни с чем после наведения — наведение не дошло до элемента' };
    }
    if (!changed.length) why = await page.evaluate((full, props) => { let el = null; try { el = document.querySelector(full); } catch { return ''; } if (!el) return ''; const camel = (p) => p.replace(/-([a-z])/g, (m, c) => c.toUpperCase()); const hold = el.getAnimations().filter((a) => { const f = a.effect.getTiming().fill; return (f === 'both' || f === 'forwards') && a.effect.getKeyframes().some((k) => props.some((p) => k[camel(p)] !== undefined || (p === 'transform' && (k.translate !== undefined || k.rotate !== undefined || k.scale !== undefined)))); }); return hold.length ? `держит анимация ${hold.map((a) => `${a.animationName || 'без имени'} (fill: ${a.effect.getTiming().fill}, ${a.playState})`).join(', ')} — :hover не может перебить анимированное свойство` : 'значения равны: правило перебито более сильным или совпадает с исходным'; }, full, r.props);
    await page.mouse.move(cur.width - 2, 2); await sleep(50);
    /* объявленное правилом равно тому, что и так стоит без наведения (генераторы вроде Tilda пишут
       :hover с исходным цветом) — правило пустое, а не мёртвое: сравнить через пробный элемент рядом */
    if (!changed.length && after.length) {
      const noop = await page.evaluate((full, pseudo, decl, cur) => {
        let el = null; try { el = document.querySelector(full); } catch { return false; } if (!el || !el.parentElement) return false;
        const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0';
        (pseudo ? el : el.parentElement).appendChild(probe);
        try { return Object.entries(decl).every(([p, v]) => { if (!v || /var\(|inherit|currentcolor/i.test(v)) return false; probe.style.setProperty(p, v); return getComputedStyle(probe).getPropertyValue(p) === cur[p]; }); } finally { probe.remove(); }
      }, full, r.pseudo, r.decl || {}, after[0].v).catch(() => false);
      if (noop) return { status: 'noop', changed, why: 'объявлено то же значение, что и без наведения — пустое правило' };
    }
    /* держит законченная анимация — точно ошибка; перебито другим правилом — может быть задумкой (активный пункт) */
    return { status: changed.length ? 'ok' : /^держит анимация/.test(why) ? 'dead' : 'overridden', changed, why };
  };
  for (const r of rules.slice(0, 80)) {
    let list = []; try { list = await page.$$(r.trigger); } catch { results.push({ ...r, status: 'skip', why: 'селектор не разобран' }); continue; }
    const vis = []; for (const hh of list) { if (vis.length >= 3) break; if (await hh.evaluate(effOf).catch(() => 0) > 0.05 && await hh.evaluate((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; })) vis.push(hh); }
    if (!vis.length) { results.push({ ...r, status: 'skip', why: 'нет видимого элемента' }); continue; }
    let res = null; const tried = [];
    /* цели нет во всём DOM — другие элементы пробовать незачем */
    for (const trig of vis) { res = await tryOne(r, trig); tried.push(res.status); if (res.status === 'ok' || res.none) break; }
    results.push({ ...r, ...res, tried });
  }
  const dead = results.filter((x) => x.status === 'dead'); const covered = results.filter((x) => x.status === 'covered'); const noop = results.filter((x) => x.status === 'noop');
  const over = results.filter((x) => x.status === 'overridden');
  /* цели нет во всём DOM — мёртвый селектор; цель есть, но не у первых видимых триггеров — другое: правило живо,
     наведение просто пробовалось не на тех элементах (раньше обе — под заголовком «элемента нет в DOM») */
  const nodom = results.filter((x) => x.status === 'nosel' && x.none); const elsewhere = results.filter((x) => x.status === 'nosel' && !x.none);
  const below = [over.length ? 'перебитые' : '', nodom.length ? 'мёртвые селекторы' : '', elsewhere.length ? 'цель только у других элементов' : ''].filter(Boolean).join(', ');
  line(dead.length ? 'FAIL' : 'OK', `наведение: правил :hover ${rules.length}${rules.length > 80 ? ' (проверены первые 80)' : ''}, проверено ${results.filter((x) => /^(ok|dead|noop|overridden|nosel)$/.test(x.status)).length}, мёртвых ${dead.length}, перебитых ${over.length}${nodom.length ? `, мёртвых селекторов ${nodom.length}` : ''}${elsewhere.length ? `, цель только у других ${elsewhere.length}` : ''}${noop.length ? `, пустых ${noop.length}` : ''}${unreadable ? `, таблиц не прочитано ${unreadable}` : ''}`, dead.slice(0, 6).map((d) => `${d.sel} { ${d.props.join(', ')} } — ${d.why}`).join(' | ') + (dead.length > 6 ? ` и ещё ${dead.length - 6}` : '') || (below ? `мёртвых нет; ${below} — строкой ниже` : '') || `все меняют то, что объявлено${noop.length ? ` (пустые — то же значение, что без наведения: ${noop.slice(0, 3).map((x) => x.sel).join(', ')})` : ''}`, { results });
  if (over.length) line('WARN', `наведение перебито другим правилом: ${over.length}`, over.slice(0, 5).map((d) => `${d.sel} { ${d.props.join(', ')} }`).join(' | ') + (over.length > 5 ? ` и ещё ${over.length - 5}` : '') + ' — :hover срабатывает, но значение задаёт более сильное правило; проверить, задумано ли');
  if (nodom.length) line('WARN', `наведение: мёртвый селектор, элемента нет в DOM: ${nodom.length}`, nodom.slice(0, 5).map((d) => `${d.sel} — ${d.why}`).join(' | ') + (nodom.length > 5 ? ` и ещё ${nodom.length - 5}` : '') + ' — это не каскад: вернуть элемент в разметку или удалить правило');
  if (elsewhere.length) line('WARN', `наведение: цели правила нет у наведённых элементов: ${elsewhere.length}`, elsewhere.slice(0, 5).map((d) => `${d.sel} — ${d.why}`).join(' | ') + (elsewhere.length > 5 ? ` и ещё ${elsewhere.length - 5}` : '') + ' — наведение пробовалось на первых видимых; проверьте наведением на элемент с целью (--hover) или уберите правило, если цель там не нужна');
  if (covered.length) line('WARN', `наведение перекрыто: ${covered.length}`, covered.slice(0, 6).map((c) => `${c.sel}${c.why && !/перекрыт другим/.test(c.why) ? ` (${c.why})` : ''}`).join(', '));
}

async function clickStep(v) {
  lastClick = v;
  /* прокрутка к элементу перед кликом (SKILL-ISSUES 445): страница сдвигается молча, и снимок после клика читался как
     «заголовок ушёл наверх». Окно — scrollY до find (find сам прокручивает к прозрачному) и после scrollIntoView;
     прокрутился только контейнер (своя прокрутка страницы в обёртке) — по сдвигу самого элемента */
  const y00 = await page.evaluate(() => Math.round(scrollY)).catch(() => null);
  const h = await find(v);
  if (!h) return line('FAIL', `клик ${v}`, notFound());
  const errBefore = errCount();
  const sc = await h.evaluate((el) => {
    const t0 = el.getBoundingClientRect().top;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    return { y1: Math.round(scrollY), dTop: Math.round(t0 - el.getBoundingClientRect().top) };
  }).catch(() => null);
  const winPx = sc && y00 != null ? sc.y1 - y00 : 0;
  const preScroll = !sc ? null : Math.abs(winPx) >= 1 ? { px: Math.abs(winPx), dir: winPx > 0 ? 'вниз' : 'вверх', fromY: y00, toY: sc.y1, how: 'окно' }
    : Math.abs(sc.dTop) >= 1 ? { px: Math.abs(sc.dTop), dir: sc.dTop > 0 ? 'вниз' : 'вверх', fromY: null, toY: null, how: 'контейнер' } : null;
  const preTxt = preScroll ? ` · перед кликом прокручено к элементу на ${preScroll.px} px ${preScroll.dir}${preScroll.how === 'окно' ? ` (scrollY ${preScroll.fromY} → ${preScroll.toY})` : ' (прокрутился контейнер, окно на месте)'} — снимок после клика показывает сдвинутую страницу` : '';
  await sleep(350); await settleAnimations(page, 2500);
  const info = await h.evaluate((el) => ({ tag: el.tagName.toLowerCase(), href: el.getAttribute('href'), type: (el.getAttribute('type') || '').toLowerCase(), role: el.getAttribute('role'), expanded: el.getAttribute('aria-expanded') }));
  const selfSig = await evaluateWith(page, (s) => { const el = document.querySelector(s); return el ? sig(el) : null; }, v, DEPS).catch(() => null);
  /* фон: что меняется само по себе (бегущая строка, таймеры) — это не эффект клика */
  await startWatch(); await sleep(500); const noise = new Set((await takeWatch()).map(mutKey));
  const before = await snapshot();
  /* слой на весь экран до клика: проверка фокуса — только у слоя, который открыл этот клик */
  const layerBefore = await evaluateWith(page, openLayerInPage, null, DEPS).catch(() => null);
  await startWatch();
  const reqFrom = reqLog.length;
  const nav = page.waitForNavigation({ timeout: 4000 }).catch(() => null);
  try { await h.click(); } catch { await h.evaluate((el) => el.click()); }
  await Promise.race([nav, sleep(900)]); await sleep(300);
  let muts = [], after = null, navigated = false;
  try { muts = await takeWatch(); after = await snapshot(); } catch { navigated = true; await sleep(1500); after = await snapshot().catch(() => null); }
  const effect = muts.filter((m) => !noise.has(mutKey(m)) && !(m.type === 'attributes' && m.el === selfSig && /^(style|tabindex)$/.test(m.attr || '')));
  const reqs = reqLog.slice(reqFrom).filter((r) => /xhr|fetch|document|websocket|eventsource/.test(r.type));
  const changes = [];
  if (navigated || (after && after.url !== before.url)) changes.push(`адрес → ${after ? after.url : '(переход)'}`);
  if (effect.length) changes.push(`DOM: ${describeMuts(effect)}`);
  if (reqs.length) changes.push(`запросов ${reqs.length} (${[...new Set(reqs.map((r) => r.type))].join(', ')})`);
  if (after && after.dialogs !== before.dialogs) changes.push(`диалогов ${before.dialogs} → ${after.dialogs}`);
  if (after && after.expanded !== before.expanded) changes.push(`раскрытых ${before.expanded} → ${after.expanded}`);
  if (after && after.active !== before.active && after.active !== selfSig && after.active) changes.push(`фокус → ${after.active}`);
  /* якорь: дождаться, пока прокрутка встанет (3 кадра подряд, до 3 с), и сверить верх цели (C13). Ждём верх цели там, куда
     её ставит браузер: scroll-margin-top цели + scroll-padding-top страницы. Перекрыта ли — по началу её содержимого (первая
     строка текста; пустой якорь — его место): elementFromPoint на 8 px ниже него даёт закреплённый слой (fixed или sticky, не
     предок цели) — это шапка или лента поверх. Поля секции под шапкой — не перекрытие: заголовок ниже виден */
  let anchor = null;
  if (!navigated && info.href && /^#[^#]/.test(info.href)) {
    anchor = await evaluateWith(page, async (id) => {
      let t = null; try { t = document.getElementById(decodeURIComponent(id)); } catch { t = document.getElementById(id); }
      if (!t) return { missing: true };
      const frame = () => new Promise((r) => requestAnimationFrame(r)); let last = -1, same = 0; const t0 = performance.now();
      while (performance.now() - t0 < 3000 && same < 3) { await frame(); const y = Math.round(scrollY); if (y === last) same++; else { same = 0; last = y; } }
      const box = t.getBoundingClientRect(); const top = box.top; const margin = parseFloat(getComputedStyle(t).scrollMarginTop) || 0;
      const se = document.scrollingElement || document.documentElement;
      const padding = parseFloat(getComputedStyle(se).scrollPaddingTop) || 0;
      const maxY = document.documentElement.scrollHeight - innerHeight; const atBottom = scrollY >= maxY - 2;
      let header = 0; for (const el of document.body.querySelectorAll('*')) { const s = getComputedStyle(el); if (s.position !== 'fixed' && s.position !== 'sticky') continue; const r = el.getBoundingClientRect(); if (r.top <= 1 && r.bottom > 0 && r.height < innerHeight * 0.4 && r.width > innerWidth * 0.5) header = Math.max(header, r.bottom); }
      /* начало содержимого цели: первая видимая строка текста внутри, иначе верх самой цели */
      let first = null; const range = document.createRange();
      const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        range.selectNodeContents(n); const q = [...range.getClientRects()].find((x) => x.width >= 1 && x.height >= 1);
        if (q) { first = q; break; }
      }
      const vw = document.documentElement.clientWidth, vh = innerHeight;
      const cTop = first ? first.top : top;
      const y = cTop + Math.min(8, first ? first.height / 2 : 8);
      let cover = null;
      if (y >= 0 && y < vh) {
        const src = first || box;
        for (const f of [0.5, 0.15, 0.85]) {
          const x = Math.min(vw - 1, Math.max(1, src.left + src.width * f));
          const hit = document.elementFromPoint(x, y); if (!hit || hit === t || t.contains(hit) || hit.contains(t)) continue;
          let layer = null; for (let e = hit; e && e !== document.documentElement; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') layer = e; }
          if (layer && !layer.contains(t)) { cover = sig(layer); break; }
        }
      }
      return { top: Math.round(top), bottom: Math.round(box.bottom), contentTop: Math.round(cTop), margin, padding, want: Math.round(margin + padding), header: Math.round(header), atBottom, vh, cover, waited: Math.round(performance.now() - t0), scrollY: Math.round(scrollY) };
    }, info.href.slice(1), DEPS).catch(() => null);
  }
  const file = await shot('click'); const newErr = errCount() - errBefore;
  let st, det;
  if (anchor && !anchor.missing) {
    /* FAIL — только когда цель не видна: начало содержимого выше окна или ниже его, или под закреплённым слоем. Видна и не
       перекрыта: у ожидаемого места (±8 px) — OK; без scroll-margin и scroll-padding — у верха окна или сразу под шапкой —
       OK; низ страницы (дальше не прокрутить) — OK; иначе WARN «цель не у scroll-margin» (страница прокручивает своим
       обработчиком: отступ = лента + 12 при scroll-margin 88 — цель на 76 px, видна; раньше FAIL «ЦЕЛЬ НЕ У ВЕРХА ОКНА») */
    const vh = anchor.vh || cur.height;
    const out = anchor.contentTop < -8 || anchor.contentTop >= vh || anchor.bottom <= 0;
    const covered = !out && !!anchor.cover;
    const atWant = Math.abs(anchor.top - anchor.want) <= 8;
    const plain = anchor.want <= 8 && anchor.top >= -8 && anchor.top <= anchor.header + 8;
    const where = out || covered ? 'FAIL' : atWant || plain || anchor.atBottom ? 'OK' : 'WARN';
    st = newErr ? 'FAIL' : where;
    const wantTxt = `scroll-margin ${anchor.margin}${anchor.padding ? ` + scroll-padding страницы ${anchor.padding}` : ''}`;
    const tail = out ? ` — ЦЕЛЬ ВНЕ ОКНА: начало её содержимого ${anchor.contentTop < -8 ? `выше окна (${anchor.contentTop}px)` : `на ${anchor.contentTop}px при окне ${vh}px`}`
      : covered ? ` — ЦЕЛЬ ПОД ЗАКРЕПЛЁННЫМ СЛОЕМ ${anchor.cover}: начало её содержимого на ${anchor.contentTop}px закрыто${anchor.header ? ` (слой до ${anchor.header}px)` : ''} — отступ прокрутки меньше высоты слоя`
        : where === 'WARN' ? ` — цель не у scroll-margin: верх ${anchor.top}px, ждали ${anchor.want}px (${wantTxt}), разница ${anchor.top - anchor.want} px; цель видна и не перекрыта — страница прокручивает сама? сведите её отступ и scroll-margin-top в одно число` : '';
    det = `якорь ${info.href}: прокрутка встала через ${anchor.waited} мс, верх цели ${anchor.top}px от верха окна (${wantTxt}${anchor.header ? `, закреплённая шапка до ${anchor.header}px` : ''}${anchor.atBottom ? ', низ страницы' : ''})${tail}`;
  } else {
    const buttonish = info.tag === 'button' || info.role === 'button' || info.type === 'submit' || info.type === 'button' || (info.tag === 'a' && (!info.href || info.href === '#'));
    st = newErr ? 'FAIL' : changes.length ? 'OK' : buttonish ? 'FAIL' : 'WARN';
    det = changes.join('; ') || (anchor && anchor.missing ? `якорь ${info.href}: цели с таким id нет` : `ничего не изменилось${buttonish ? ' — КНОПКА БЕЗ ЭФФЕКТА' : ''}`);
  }
  line(st, `клик ${v}`, `${det}${newErr ? ` · НОВЫХ ОШИБОК ${newErr}: ${[...realConsole().map((c) => c.text), ...page.log.errors].slice(-newErr).map((t) => short(t, 100)).join(' | ')}` : ''}${preTxt} · ${file}`, { mutations: effect.slice(0, 40), requests: reqs.slice(0, 10), anchor, preScroll });
  if (!navigated) {
    await autoCheck(`после клика ${v}`);
    await focusTrapCheck(v, layerBefore).catch((e) => line('INFO', `фокус в открытом слое после --click ${v}`, `не проверялось: ${short(e.message || e, 120)}`));
  }
  return 'checked-errors';
}

/* форматы value у полей даты и времени (HTML): такое значение --type ставит, а не набирает */
const DATE_FORMATS = {
  date: { re: /^\d{4}-\d{2}-\d{2}$/, hint: 'ГГГГ-ММ-ДД (2026-10-10)' },
  time: { re: /^\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/, hint: 'ЧЧ:ММ (20:30)' },
  'datetime-local': { re: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/, hint: 'ГГГГ-ММ-ДДTЧЧ:ММ (2026-10-10T20:30)' },
  month: { re: /^\d{4}-\d{2}$/, hint: 'ГГГГ-ММ (2026-10)' },
  week: { re: /^\d{4}-W\d{2}$/, hint: 'ГГГГ-Wнн (2026-W41)' },
};
async function typeStep(v) {
  const parts = splitSelEq(v); if (!parts) return line('FAIL', `ввод ${v}`, 'нужно «селектор=текст»');
  const [sel, text] = parts;
  const h = await find(sel);
  if (!h) return line('FAIL', `ввод в ${sel}`, notFound());
  await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  /* дата и время: значение в формате поля ставится, как выбор в календаре (value + input и change). Набор
     клавишами идёт по сегментам локали браузера (дд.мм.гггг): «2026-10-10» превращался в «61010-02-20» */
  const kind0 = await h.evaluate((el) => (el.tagName === 'INPUT' ? (el.getAttribute('type') || '').toLowerCase() : ''));
  const fmt = DATE_FORMATS[kind0];
  if (fmt && fmt.re.test(text)) {
    const set = await h.evaluate((el, t) => {
      el.focus();
      /* сеттер прототипа: обёртки фреймворков (React) следят за value через свой сеттер — иначе они не увидят ввод */
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, t);
      const taken = el.value;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return taken;
    }, text);
    await sleep(150);
    const now = await h.evaluate((el) => el.value);
    /* сверка — с тем, что браузер записал сразу после установки, до событий (set), а не с набранным текстом:
       datetime-local и time хранят значение в своей записи — «2026-10-10T20:30:00» браузер сам сокращает
       до «2026-10-10T20:30», и это не вина обработчика страницы */
    const ok = set !== '' && now === set;
    const norm = ok && set !== text ? `; браузер записал «${text}» как «${set}» — так value этого поля хранит значение` : '';
    return line(ok ? 'OK' : 'FAIL', `ввод в ${sel}`, ok ? `в поле «${now}» (type=${kind0}: значение поставлено с событиями input и change, как выбор в календаре${norm})`
      : set === '' ? `поле type=${kind0} не приняло «${text}» — такого значения нет (${fmt.hint})`
        : `поставили «${text}»${set !== text ? ` (браузер записал как «${set}»)` : ''}, после событий input/change в поле «${now}» — обработчик страницы переписал значение`, { set: text, accepted: set, value: now, how: 'value' });
  }
  await h.focus(); await h.evaluate((el) => { try { el.select(); } catch { el.value = ''; } });
  await h.type(text, { delay: 20 });
  const { val, kind } = await h.evaluate((el) => ({ val: el.value, kind: (el.getAttribute('type') || '').toLowerCase() }));
  if (DATE_FORMATS[kind] && !(val === text || (val !== '' && val.replace(/\D/g, '').split('').sort().join('') === text.replace(/\D/g, '').split('').sort().join('')))) {
    return line('FAIL', `ввод в ${sel}`, `ожидали «${text}», в поле «${val}» — у поля type=${kind} значение пишется как ${DATE_FORMATS[kind].hint}; другое runtime набирает клавишами по сегментам локали браузера`);
  }
  const dig = (s) => s.replace(/\D/g, '');
  let want = dig(text); if (kind === 'tel' && want.length === 11 && want[0] === '8') want = '7' + want.slice(1); /* 8 (900)… и +7 (900)… — один номер */
  const got = dig(val);
  const digits = /\d/.test(text) && (got.endsWith(want) || (kind === 'tel' && got.endsWith(want.slice(1)) && got.length === want.length));
  const sortDigits = (s) => dig(s).split('').sort().join('');
  const dateLike = /^(date|time|datetime-local|month|week)$/.test(kind) && val !== '' && sortDigits(val) === sortDigits(text);
  const ok = val === text || digits || dateLike;
  line(ok ? 'OK' : 'FAIL', `ввод в ${sel}`, ok ? `в поле «${val}»` : `ожидали «${text}», в поле «${val}» (маска или обработчик переписывает)`);
}

/* поле с маской: всё, что делает человек, исправляя номер (C3) */
async function editStep(v) {
  const h = await find(v);
  if (!h) return line('FAIL', `правка поля ${v}`, notFound());
  await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(150);
  const kind = await h.evaluate((el) => ({ type: (el.getAttribute('type') || '').toLowerCase(), mode: (el.getAttribute('inputmode') || '').toLowerCase() }));
  const numeric = kind.type === 'tel' || /numeric|tel|decimal/.test(kind.mode);
  const sample = numeric ? '9001234567' : 'проверка';
  const chars = (s) => (numeric ? s.replace(/\D/g, '') : s.replace(/[^\p{L}\p{N}]/gu, ''));
  const val = () => h.evaluate((el) => ({ v: el.value, s: el.selectionStart }));
  const clear = async () => { await h.click({ clickCount: 3 }).catch(() => h.focus()); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await sleep(50); };
  const steps = [];
  /* а) набрать и стереть Backspace до конца: застревание — FAIL, пока осталось больше одного знака */
  await clear(); await h.type(sample, { delay: 15 }); const full = await val(); steps.push({ step: `набор ${sample}`, value: full.v });
  await page.keyboard.press('End');
  let stuck = null; const trail = [];
  for (let i = 0; i < full.v.length + 4; i++) { const b = await val(); await page.keyboard.press('Backspace'); const a = await val(); trail.push(a.v); if (a.v === b.v && chars(a.v).length > 1) { stuck = a.v; break; } if (!a.v.length) break; }
  const endBs = await val(); steps.push({ step: 'Backspace до конца', stuckAt: stuck, final: endBs.v, trail: trail.slice(0, 24) });
  const bsOk = !stuck && chars(endBs.v).length <= 1;
  line(bsOk ? 'OK' : 'FAIL', `правка ${v}: стирание Backspace`, bsOk ? `«${full.v}» стёрлось до «${endBs.v}»` : `застревает на «${stuck || endBs.v}» — Backspace удаляет разделитель, маска его возвращает`);
  /* б) правка в середине: курсор после третьей значащей позиции, Backspace, затем ввод */
  await clear(); await h.type(sample, { delay: 15 });
  const posMid = await h.evaluate((el, numeric) => { const v = el.value; let n = 0, i = 0; for (; i < v.length; i++) { if (numeric ? /\d/.test(v[i]) : /[\p{L}\p{N}]/u.test(v[i])) n++; if (n === (numeric ? 6 : 4)) { i++; break; } } el.setSelectionRange(i, i); return i; }, numeric);
  await page.keyboard.press('Backspace'); const midBs = await val();
  await page.keyboard.type(numeric ? '9' : 'ж'); const midType = await val();
  steps.push({ step: `курсор на ${posMid}, Backspace`, value: midBs.v, caret: midBs.s }, { step: 'затем ввод', value: midType.v, caret: midType.s });
  const jump = midBs.s == null ? false : Math.abs(midBs.s - (posMid - 1)) > 1 || Math.abs(midType.s - posMid) > 1 && midType.s >= midType.v.length - 1;
  line(jump ? 'FAIL' : 'OK', `правка ${v}: в середине`, `Backspace на позиции ${posMid}: «${midBs.v}», курсор ${midBs.s}; ввод: «${midType.v}», курсор ${midType.s}${jump ? ` — курсор уезжает (ждали ≈${posMid - 1} и ≈${posMid})` : ''}`);
  /* в) Delete в середине */
  await clear(); await h.type(sample, { delay: 15 });
  const posDel = await h.evaluate((el) => { const i = Math.max(1, Math.floor(el.value.length / 2)); el.setSelectionRange(i, i); return i; });
  const beforeDel = await val(); await page.keyboard.press('Delete'); const del = await val();
  steps.push({ step: `курсор на ${posDel}, Delete`, value: del.v, caret: del.s });
  const delOk = del.v !== beforeDel.v || chars(del.v) !== chars(beforeDel.v);
  line(delOk ? 'OK' : 'WARN', `правка ${v}: Delete`, `«${beforeDel.v}» → «${del.v}», курсор ${del.s}${delOk ? '' : ' — Delete ничего не удаляет'}`);
  /* г) вставка номера в другом формате (событие paste, а если поле его не обработало — ввод текста) */
  const pasteText = numeric ? '8 (900) 123-45-67' : 'Вставленный текст';
  await clear();
  await h.evaluate((el, t) => { el.focus(); const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, pasteText);
  await sleep(80); let paste = await val();
  /* ввод строки одним событием (Input.insertText у Chrome); в Firefox sendCharacter берёт только один знак — execCommand */
  if (!chars(paste.v).length) { try { await page.keyboard.sendCharacter(pasteText); } catch { await page.evaluate((t) => document.execCommand('insertText', false, t), pasteText).catch(() => {}); } await sleep(80); paste = await val(); }
  steps.push({ step: `вставка «${pasteText}»`, value: paste.v });
  const pasteOk = numeric ? chars(paste.v).length === 11 || chars(paste.v).length === 10 : chars(paste.v).length >= chars(pasteText).length - 1;
  line(pasteOk ? 'OK' : 'WARN', `правка ${v}: вставка`, `«${pasteText}» → «${paste.v}»${pasteOk ? '' : ' — номер искажён'}`);
  /* д) выделить всё и стереть */
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await sleep(50);
  const wiped = await val(); steps.push({ step: 'Ctrl+A, Backspace', value: wiped.v });
  line(chars(wiped.v).length <= 1 ? 'OK' : 'FAIL', `правка ${v}: выделить всё и стереть`, `осталось «${wiped.v}»`);
  report.edit = report.edit || []; report.edit.push({ sel: v, steps });
}

async function keyStep(v) {
  await page.keyboard.press(String(v)); await sleep(250);
  const s = await snapshot();
  const f = await page.evaluate(() => { const a = document.activeElement; if (!a || !('value' in a) || a.tagName === 'BUTTON') return null; let s = null; try { s = a.selectionStart; } catch { /* не текстовое поле */ } return { value: String(a.value).slice(0, 60), caret: s }; });
  line('OK', `клавиша ${v}`, `фокус на ${s.active || 'body'}${f ? `, в поле «${f.value}», курсор ${f.caret}` : ''}${s.dialogs ? `, диалогов ${s.dialogs}` : ''}`);
}

async function selectStep(v) {
  const parts = splitSelEq(v); if (!parts) return line('FAIL', `выбор ${v}`, 'нужно «селектор=значение»');
  const [sel, want] = parts;
  const h = await find(sel);
  if (!h) return line('FAIL', `выбор ${sel}`, notFound());
  /* недоступное (disabled у варианта, его optgroup, списка или fieldset вокруг) человек не выберет, а h.select()
     ставит его программно — было бы OK там, где выбора нет */
  const meta = await h.evaluate((el) => (el.options ? { off: el.matches(':disabled'), opts: [...el.options].map((o) => ({ v: o.value, t: o.textContent.trim(), d: o.matches(':disabled') })) } : null));
  if (!meta) return line('FAIL', `выбор ${sel}`, 'это не <select>');
  const opts = meta.opts;
  const hit = opts.find((o) => o.v === want) || opts.find((o) => o.t === want) || opts.find((o) => o.t.toLowerCase().includes(want.toLowerCase()));
  if (!hit) return line('FAIL', `выбор ${sel}=${want}`, `нет такого варианта; есть: ${opts.slice(0, 8).map((o) => o.v || o.t).join(', ')}`);
  if (meta.off) return line('FAIL', `выбор ${sel} = «${hit.t || hit.v}»`, 'список недоступен (disabled) — человек в нём ничего не выберет');
  if (hit.d) return line('FAIL', `выбор ${sel} = «${hit.t || hit.v}»`, `вариант недоступен (disabled) — человек его не выберет; доступные: ${opts.filter((o) => !o.d).slice(0, 8).map((o) => o.v || o.t).join(', ') || 'нет'}`);
  await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(300); await settleAnimations(page, 2000);
  await startWatch(); await sleep(400); const noise = new Set((await takeWatch()).map(mutKey));
  await startWatch();
  await h.select(hit.v); await sleep(500);
  const effect = (await takeWatch()).filter((m) => !noise.has(mutKey(m)));
  /* выбралось ли значение; список внутри формы — поле, от выбора в нём страница и не должна меняться */
  const got = await h.evaluate((el) => ({ value: el.value, inForm: !!(el.form || el.closest('form')) })).catch(() => ({ value: null, inForm: false }));
  const title = `выбор ${sel} = «${hit.t || hit.v}»`;
  if (got.value !== null && got.value !== hit.v) line('FAIL', title, `значение не выбралось: в поле «${got.value}», ждали «${hit.v}» — обработчик страницы вернул прежнее`, { mutations: effect.slice(0, 40), value: got.value });
  else if (effect.length) line('OK', title, `DOM: ${describeMuts(effect)}`, { mutations: effect.slice(0, 40), value: got.value });
  else if (got.inForm) line('OK', title, `в поле «${got.value}» — список формы: от выбора страница не меняется, значение уйдёт с отправкой`, { mutations: [], value: got.value, inForm: true });
  else line('WARN', title, 'после выбора на странице ничего не изменилось', { mutations: [], value: got.value });
  await autoCheck(`после выбора ${sel}=${hit.v}`);
}

async function resizeStep(v) {
  let w = cur.width, hh = cur.height;
  const r = parseResize(v); if (!r) return line('FAIL', `окно ${v}`, RESIZE_HELP);
  /* «было» — окно перед этим шагом, а не начальное: после двух --resize подряд второе «было» — первое новое */
  const was = `${cur.width}×${cur.height}`;
  if (r.rotate) [w, hh] = [cur.height, cur.width];
  else { w = r.w; if (r.h !== null) hh = r.h; }
  cur = { ...cur, width: w, height: hh };
  await page.setViewport(cur); await sleep(300);
  line('OK', `окно ${w}×${hh}`, `было ${was}`);
  await autoCheck(`после смены окна на ${w}×${hh}`);
}

/* холсты: без создания контекстов (тип — из перехвата getContext в preparePage) */
async function canvasStep() {
  if (!scrolled) { await scrollThrough(page, { pause: 250 }); scrolled = true; await scrollToY(page, 0); }
  await settleAnimations(page, 3000);
  const list = await canvasList(page);
  if (!list.length) return line('WARN', 'холсты', 'на странице нет <canvas>');
  const buf = await page.evaluate(async () => {
    const out = [];
    for (const c of document.querySelectorAll('canvas')) {
      const rec = { ctx: c.__rwCtx || null, regions: null, regionsTotal: 5, filled: null, error: null };
      if (!rec.ctx || !/^(2d|webgl|webgl2)$/.test(rec.ctx) || !c.width || !c.height) { out.push(rec); continue; }
      let gl = null, c2d = null;
      try { if (rec.ctx === '2d') c2d = c.getContext('2d'); else gl = c.getContext(rec.ctx); } catch (e) { rec.error = String(e.message || e).slice(0, 80); }
      if (!gl && !c2d) { out.push(rec); continue; }
      const rw = Math.max(8, Math.min(128, Math.floor(c.width / 3))), rh = Math.max(8, Math.min(128, Math.floor(c.height / 3)));
      const regions = [[(c.width - rw) / 2, (c.height - rh) / 2], [c.width * 0.08, c.height * 0.08], [c.width * 0.92 - rw, c.height * 0.08], [c.width * 0.08, c.height * 0.92 - rh], [c.width * 0.92 - rw, c.height * 0.92 - rh]].map(([x, y]) => [Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y))]);
      const readOnce = () => new Promise((res) => requestAnimationFrame(() => { try { res(regions.map(([x, y]) => { if (gl) { const b = new Uint8Array(rw * rh * 4); gl.readPixels(x, y, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; } return c2d.getImageData(x, y, rw, rh).data; })); } catch (e) { rec.error = String(e.message || e).slice(0, 80); res(null); } }));
      const nonEmpty = (b) => { let n = 0; for (let i = 0; i < b.length; i += 4) if (b[i + 3] > 8 && (b[i] > 8 || b[i + 1] > 8 || b[i + 2] > 8)) n++; return n; };
      let best = null; for (let k = 0; k < 3; k++) { const bs = await readOnce(); if (bs && (!best || bs.reduce((s, b) => s + nonEmpty(b), 0) > best.reduce((s, b) => s + nonEmpty(b), 0))) best = bs; if (best && best.some((b) => nonEmpty(b))) break; }
      if (best) { const per = best.map((b) => nonEmpty(b) / (rw * rh)); rec.filled = Math.round(per.reduce((s, x) => s + x, 0) / per.length * 1000) / 10; rec.regions = per.filter((x) => x > 0.005).length; }
      out.push(rec);
    }
    const fps = await new Promise((r2) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r2(n); }; requestAnimationFrame(f); });
    return { list: out, fps };
  });
  /* рисует ли — по снимкам: участок окна с холстом и с холстом, спрятанным opacity:0 */
  const sharp = loadSharp(); const handles = await page.$$('canvas');
  const dprS = cur.deviceScaleFactor || 1;
  const raw = async (b, box) => (await sharp(b).extract({ left: Math.round(box.x * dprS), top: Math.round(box.y * dprS), width: Math.max(1, Math.round(box.width * dprS)), height: Math.max(1, Math.round(box.height * dprS)) }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  const diffShare = (a, b) => { const A = a.data, B = b.data; const n = Math.min(A.length, B.length); let d = 0, t = 0; for (let i = 0; i < n; i += 16) { t++; if (Math.abs(A[i] - B[i]) > 24 || Math.abs(A[i + 1] - B[i + 1]) > 24 || Math.abs(A[i + 2] - B[i + 2]) > 24) d++; } return t ? d / t * 100 : 0; };
  const rows = [];
  /* кадры WebGL из перехвата в preparePage: сколько раз и когда страница рисовала, при каком размере буфера */
  const drawsOf = (h) => h.evaluate((el) => {
    /* тот же контекст, что у страницы (getContext того же типа возвращает существующий) — потерян ли он */
    let lost = null; try { const x = /^webgl/.test(el.__rwCtx || '') ? el.getContext(el.__rwCtx) : null; lost = x && x.isContextLost ? x.isContextLost() : null; } catch { /* холст отдан OffscreenCanvas */ }
    return { draws: el.__rwDraws || 0, frames: el.__rwFrames || 0, ago: el.__rwDrawAt ? Math.round(performance.now() - el.__rwDrawAt) : null, drawSize: el.__rwDrawSize || null, size: `${el.width}×${el.height}`, lost };
  }).catch(() => null);
  for (let i = 0; i < list.length; i++) {
    const c = list[i]; const b = buf.list[i] || {}; const visible = c.clientWidth > 0 && c.clientHeight > 0 && c.opacity > 0.05;
    let paints = null, moves = null, waited = 0, p = null, m = null, d0 = null, d1 = null;
    if (sharp && handles[i] && visible && c.ctx) {
      try {
        await handles[i].evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(200); await settleAnimations(page, 2000);
        d0 = await drawsOf(handles[i]);
        const box = await handles[i].boundingBox();
        if (box && box.width >= 4 && box.height >= 4) {
          const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
          const clip = { x: x0, y: y0, width: Math.max(1, Math.min(box.width - (x0 - box.x), cur.width - x0)), height: Math.max(1, Math.min(box.height - (y0 - box.y), cur.height - y0)) };
          const t0 = Date.now();
          for (let attempt = 0; attempt < 5; attempt++) {
            const A = await raw(await page.screenshot(), clip);
            /* спрятать и показать сразу, без перехода: у холста часто transition: opacity (3D проявляется, когда
               готово), и через 120 мс он ещё виден наполовину — «спрятанный» снимок почти не отличался, шум между
               двумя такими снимками был большим, и рисующий холст выходил «не отличается от фона» */
            await handles[i].evaluate((el) => { el.__rwOp = el.style.opacity; el.__rwTr = el.style.transition; el.style.transition = 'none'; el.style.opacity = '0'; void getComputedStyle(el).opacity; }); await sleep(120);
            const H = await raw(await page.screenshot(), clip); const H2 = await raw(await page.screenshot(), clip);
            await handles[i].evaluate((el) => { el.style.opacity = el.__rwOp || ''; void getComputedStyle(el).opacity; el.style.transition = el.__rwTr || ''; }); await sleep(350);
            const C = await raw(await page.screenshot(), clip);
            p = diffShare(A, H); m = diffShare(A, C); const noise = diffShare(H, H2);
            paints = p > 0.3 && p > noise * 3; moves = m > 0.3 && m > noise * 3;
            if (paints) break;
            await sleep(700); waited = Date.now() - t0;
          }
        }
        d1 = await drawsOf(handles[i]);
      } catch { /* холст ушёл со страницы */ }
    }
    const sh = c.ctx ? sharpness(c) : { st: 'OK', bad: [] };
    let st = sh.st; const why = [];
    if (!visible) { st = 'WARN'; why.push('невидим'); }
    else if (!c.ctx) { st = 'WARN'; why.push('контекст не создан страницей — рисовать нечем (ленивая сцена или ошибка); проверить снимком после действия'); }
    else if (paints === false && !b.regions) {
      st = 'FAIL'; why.push(`ПУСТОЙ: за ${(waited / 1000).toFixed(1)} с со спрятанным холстом картинка та же`);
      /* почему пусто — по кадрам WebGL (FAIL остаётся: у человека место тоже пустое — после скрытия, свёрнутой вкладки, смены размера) */
      if (/^webgl/.test(c.ctx) && d1) {
        const keep = !!(c.attrs && c.attrs.preserveDrawingBuffer);
        if (d1.lost) why.push('контекст WebGL потерян (webglcontextlost) и не восстановлен — страница не обрабатывает потерю контекста: слушать webglcontextlost / webglcontextrestored и собирать сцену заново');
        else if (!d1.draws) why.push('страница ни разу не рисовала на этом холсте (контекст есть) — сцена не запустилась или ждёт действия');
        else if (d1.drawSize && d1.drawSize !== d1.size) why.push(`буфер сменил размер после последнего кадра (${d1.drawSize} → ${d1.size}) — кадр стёрт и не перерисован: перерисовывать после смены размера (ResizeObserver)`);
        else if (d0 && d1.draws === d0.draws) why.push(`рисует только по событию: последний кадр ${d1.ago != null ? `${(d1.ago / 1000).toFixed(1)} с назад` : 'давно'} (кадров всего ${d1.frames}), за проверку не рисовал — после скрытия кадр потерян${keep ? '' : ': без preserveDrawingBuffer браузер его не восстанавливает'} — нужен preserveDrawingBuffer: true или перерисовка по visibilitychange / IntersectionObserver`);
        else if (d0) why.push(`рисует (за проверку кадров ${d1.frames - d0.frames}), но картинки не видно — рисует прозрачным или цветом фона, или холст закрыт другим слоем`);
      }
    }
    else if (paints === true) why.push(`РИСУЕТ${waited ? ` (ожил через ${(waited / 1000).toFixed(1)} с)` : ''}: меняет ${Math.round(p * 10) / 10}% своей площади, ${moves ? `кадр меняется (${Math.round(m * 10) / 10}%)` : 'кадр статичен'}`);
    else if (paints === false) why.push('по снимку не отличается от фона, но в буфере рисунок есть');
    if (b.regions != null) why.push(`буфер: рисунок в ${b.regions} из 5 зон, ${b.filled}% пикселей`);
    why.push(...sh.bad);
    if (sh.bad.length === 0 && visible && c.ctx) why.push(`резкость ×${c.ratioCss} от CSS px, ×${c.ratioDevice} от DPR`);
    rows.push({ ...c, paints, moves, buffer: b, draws: d1 });
    line(st, `холст ${c.sig} ${c.clientWidth}×${c.clientHeight} (${c.ctx || 'нет контекста'})`, `${why.join(' · ')} · ${buf.fps} кадров/с на странице`);
  }
  report.canvas = { list: rows, fps: buf.fps };
}

/* анимации: по ключевым кадрам — какие свойства держат законченные с fill */
const animList = (pg) => evaluateWith(pg, () => document.getAnimations().map((a) => {
  const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; let props = [];
  try { props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !/^(offset|computedOffset|easing|composite)$/.test(k)))]; } catch { /* переход без кадров */ }
  return { name: a.animationName || (a.transitionProperty ? `переход ${a.transitionProperty}` : a.constructor.name), target: a.effect && a.effect.target ? sig(a.effect.target) : null, iterations: t.iterations === Infinity ? 'infinite' : t.iterations, fill: t.fill, state: a.playState, props };
}), null, DEPS);
async function motionStep() {
  const now = await animList(page);
  const running = now.filter((a) => a.state === 'running' && a.iterations !== 'infinite');
  const inf = now.filter((a) => a.iterations === 'infinite' && a.state === 'running');
  const holding = now.filter((a) => a.state === 'finished' && /forwards|both/.test(a.fill || ''));
  line('OK', `анимации: идут ${running.length}, бесконечных ${inf.length}, закончились и держат свойство ${holding.length}`, `${[...new Set(inf.map((a) => a.name))].slice(0, 6).join(', ') || 'бесконечных нет'}${holding.length ? ` · держат: ${holding.slice(0, 5).map((a) => `${a.target} ${a.name} (${a.fill}: ${a.props.join(', ')})`).join('; ')} — :hover и классы не поменяют эти свойства` : ''}`);
  /* «меньше движения» — в отдельной вкладке: переключение на лету оставляет страницу в переходах */
  const rt = await reducedTab(); const p2 = rt.page;
  try {
    await gotoRetry(p2, url); await p2.evaluate(() => document.fonts.ready).catch(() => {}); await sleep(1500);
    const red = await animList(p2);
    const infR = red.filter((a) => a.iterations === 'infinite' && a.state === 'running');
    const smooth = await p2.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    const st = infR.length ? 'WARN' : 'OK';
    line(st, `анимации при «меньше движения» (${rt.where})`, `бесконечных идёт ${infR.length}${infR.length ? `: ${[...new Set(infR.map((a) => `${a.target} ${a.name}`))].slice(0, 5).join(', ')} — не останавливаются` : ''} · всего анимаций ${red.length} против ${now.length}${smooth === 'smooth' ? ' · плавная прокрутка остаётся (scroll-behavior:smooth)' : ''}`);
    report.motion = { now, reduced: red };
  } finally { await rt.close(); }
}

/* вкладка «меньше движения» для --motion и --video: у Chrome и Edge — эмуляция на новой вкладке; у Firefox
   это настройка запуска, поэтому — отдельный Firefox на время замера (закрывается в close) */
async function reducedTab() {
  const prep = { scheme: opt.scheme || 'light', reducedMotion: true };
  if (!gecko) { const p2 = await preparePage(browser, cur, prep); return { page: p2, where: 'отдельная вкладка', close: () => p2.close().catch(() => {}) }; }
  const b2 = await launch({ browser: 'firefox', scheme: opt.scheme === 'dark' ? 'dark' : 'light', reducedMotion: true, mobile: !!cur.isMobile });
  try { const p2 = await preparePage(b2, cur, prep); return { page: p2, where: 'отдельный Firefox', close: () => b2.close().catch(() => {}) }; }
  catch (e) { await b2.close().catch(() => {}); throw e; }
}

/* видео: атрибуты, играет ли, пауза вне экрана и при «меньше движения» */
async function videoStep() {
  const vids = await evaluateWith(page, () => [...document.querySelectorAll('video')].map((v, i) => { v.setAttribute('data-rw-video', String(i)); const r = v.getBoundingClientRect(); return { i, el: sig(v), src: (v.currentSrc || v.src || (v.querySelector('source') || {}).src || '').split('?')[0].split('/').pop().slice(0, 60), autoplay: v.autoplay, muted: v.muted, playsinline: v.playsInline || v.hasAttribute('playsinline'), loop: v.loop, controls: v.controls, poster: !!v.poster, preload: v.preload, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), shown: r.width > 0 && r.height > 0 && eff(v) > 0.05 }; }), null, DEPS);
  if (!vids.length) return line('OK', 'видео', 'на странице нет <video>');
  const playing = (i, ms = 1200) => page.evaluate(async (i, ms) => { const v = document.querySelector(`[data-rw-video="${i}"]`); if (!v) return null; const a = v.currentTime; await new Promise((r) => setTimeout(r, ms)); return { advanced: v.currentTime - a > 0.2, paused: v.paused, ready: v.readyState }; }, i, ms);
  const mediaBytes = page.log.requests.filter((r) => r.type === 'media').reduce((s, r) => s + (r.bytes || 0), 0);
  for (const v of vids) {
    const probs = []; let st = 'OK';
    if (v.autoplay && !v.muted) { st = 'FAIL'; probs.push('автоплей без muted — браузер его не запустит'); }
    if (v.autoplay && !v.playsinline) { if (st === 'OK') st = 'WARN'; probs.push('нет playsinline — на iPhone уйдёт во весь экран'); }
    if (!v.poster) { if (st === 'OK') st = 'WARN'; probs.push('нет poster — до загрузки пустой прямоугольник'); }
    let state = '';
    if (v.shown && v.autoplay) {
      await scrollToY(page, Math.max(0, v.top - 100)); await sleep(400);
      const on = await playing(v.i);
      const plays = on && on.advanced;
      if (on && !plays) { st = 'FAIL'; probs.push(`не играет (readyState ${on.ready}${on.paused ? ', на паузе' : ''})`); }
      else if (on) state = 'играет';
      const far = plays ? await page.evaluate(() => document.documentElement.scrollHeight) : null;
      if (far != null) {
      await scrollToY(page, v.top > far / 2 ? 0 : far); await sleep(800);
      const off = await playing(v.i, 800);
      if (off && off.advanced) { if (st === 'OK') st = 'WARN'; probs.push('играет и вне экрана — тратит батарею, остановить через IntersectionObserver'); }
      else if (off) state += ', вне экрана на паузе';
      }
      await scrollToY(page, 0);
    }
    line(st, `видео ${v.el} ${v.w}×${v.h} «${v.src}»`, `${[v.autoplay ? 'автоплей' : 'по клику', v.muted ? 'без звука' : 'со звуком', v.loop ? 'по кругу' : '', v.playsinline ? 'playsinline' : '', v.poster ? 'постер' : '', `preload ${v.preload}`].filter(Boolean).join(', ')}${state ? ` · ${state}` : ''}${probs.length ? ` · ${probs.join('; ')}` : ''}`);
  }
  if (vids.some((v) => v.autoplay)) {
    const rt = await reducedTab(); const p2 = rt.page;
    try {
      await gotoRetry(p2, url); await sleep(1500);
      const r = await p2.evaluate(async () => { const out = []; for (const v of document.querySelectorAll('video[autoplay]')) { const a = v.currentTime; await new Promise((res) => setTimeout(res, 1000)); out.push(v.currentTime - a > 0.2); } return out; });
      const still = r.filter(Boolean).length;
      line(still ? 'WARN' : 'OK', `видео при «меньше движения» (${rt.where})`, still ? `${still} из ${r.length} автоплей-видео продолжают играть — показать постер или остановить` : 'автоплей остановлен');
    } finally { await rt.close(); }
  }
  line('OK', 'вес видео', `загружено ${Math.round(mediaBytes / 1024)} КБ медиа за время проверки (${cur.width}px)${page.rwBytesFrom === 'content-length' ? ', по content-length (без CDP — потоковое без длины не в счёт)' : ''}; бюджет первого экрана — ≤2.5 МБ на desktop, ≤1 МБ на телефоне`);
  report.video = vids;
}

/* меню: подсвеченный пункт против раздела на экране (верх, каждый раздел, низ, снова верх) */
async function navStep() {
  const groups = await page.evaluate(() => [...document.querySelectorAll('nav, [role=navigation]')].map((n, i) => { const links = [...n.querySelectorAll('a[href^="#"]')].filter((a) => a.getAttribute('href').length > 1 && document.getElementById(a.getAttribute('href').slice(1))); const s = getComputedStyle(n); n.setAttribute('data-rw-nav', i); return { i, label: n.getAttribute('aria-label') || String(n.className).slice(0, 40) || n.tagName.toLowerCase(), links: links.length, shown: s.display !== 'none' && s.visibility !== 'hidden' && n.getBoundingClientRect().height > 0 }; }).filter((g) => g.links >= 3 && g.shown));
  if (!groups.length) {
    /* многостраничный сайт: меню ведёт на страницы, а не на разделы — подсветку при прокрутке проверять не на чем (INFO, не WARN).
       Якоря меню без цели («#about», а раздела с таким id нет — переименовали) — не многостраничность, а сломанные
       ссылки: от трёх — WARN с их списком (раньше в INFO «якорей на разделы 4 (нужно от 3)»); один-два — в INFO
       поимённо (так бывают сделаны и кнопки на JS: «#search»). Цель — id или <a name> (так ставит якоря Tilda:
       браузер по ним ведёт, это не битая ссылка). Не в счёт: «#top» (браузер сам ведёт наверх), адреса роутера
       «#/…», «#!…» и «#…:…» (всплывающие окна конструкторов) */
    const nav = await page.evaluate(() => {
      const ns = [...document.querySelectorAll('nav, [role=navigation]')];
      const hrefs = ns.flatMap((n) => [...n.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href'))).filter((h) => h.length > 1 && !/^#(top$|\/|!)|:/i.test(h));
      const idOf = (h) => { try { return decodeURIComponent(h.slice(1)); } catch { return h.slice(1); } };
      const byId = (h) => !!document.getElementById(idOf(h));
      const byName = (h) => [...document.getElementsByName(idOf(h))].some((e) => e.tagName === 'A');
      const uniq = [...new Set(hrefs)];
      const all = ns.flatMap((n) => [...n.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
      return { menus: ns.length, links: all.length, pages: all.filter((h) => !h.startsWith('#')).length, live: uniq.filter(byId).length, named: uniq.filter((h) => !byId(h) && byName(h)), broken: uniq.filter((h) => !byId(h) && !byName(h)) };
    }).catch(() => ({ menus: 0, links: 0, pages: 0, live: 0, named: [], broken: [] }));
    const list6 = (l) => `${l.slice(0, 6).join(', ')}${l.length > 6 ? ` и ещё ${l.length - 6}` : ''}`;
    if (nav.broken.length >= 3) return line('WARN', `активный пункт меню: якоря меню ведут в никуда — ${nav.broken.length}`, `${list6(nav.broken)} — на странице нет элементов с такими id (раздел переименовали, а меню нет?); якорей с целью ${nav.live + nav.named.length}. Клик по такому пункту никуда не ведёт — поправить href или id разделов`, { nav });
    const byName = nav.named.length >= 3;
    const tail = byName ? `меню ведёт на якоря <a name> (${list6(nav.named)}; так ставит их Tilda) — подсветку раздела по таким якорям runtime не проверяет`
      : `меню ведёт на другие страницы (ссылок на страницы: ${nav.pages}) — подсветку раздела при прокрутке проверять не на чем`;
    return line('INFO', `активный пункт меню: ${byName ? 'якоря на <a name> — не проверялось' : 'якорей нет'}`, nav.menus ? `меню ${nav.menus}, ссылок ${nav.links}, из них якорей с id на этой странице ${nav.live} (для проверки нужно от 3 в одном меню)${nav.named.length && !byName ? `, на <a name> ${nav.named.length}` : ''}${nav.broken.length ? `, без цели ${nav.broken.length}: ${nav.broken.join(', ')} — кнопка на JS или битая ссылка, проверить кликом` : ''} — ${tail}` : 'на странице нет меню (nav, role=navigation) — проверять нечего', { nav });
  }
  const positions = await page.evaluate(() => { const ids = [...new Set([...document.querySelectorAll('nav a[href^="#"], [role=navigation] a[href^="#"]')].map((a) => a.getAttribute('href').slice(1)).filter((id) => id && document.getElementById(id)))]; const tops = ids.map((id) => ({ at: id, y: Math.round(document.getElementById(id).getBoundingClientRect().top + scrollY) })); return [{ at: 'верх', y: 0 }, ...tops, { at: 'низ', y: document.documentElement.scrollHeight }, { at: 'снова верх', y: 0 }]; });
  const bad = [];
  for (const p of positions) {
    await scrollToY(page, p.y); await sleep(450);
    const st = await page.evaluate((gs) => gs.map((g) => { const n = document.querySelector(`[data-rw-nav="${g.i}"]`); if (!n) return null; const links = [...n.querySelectorAll('a[href^="#"]')].filter((a) => a.getAttribute('href').length > 1 && document.getElementById(a.getAttribute('href').slice(1))); const isOn = (a) => (a.getAttribute('aria-current') && a.getAttribute('aria-current') !== 'false') || [...a.classList].some((c) => /(^|[-_])(active|current|selected|is-on)$/i.test(c)); const act = links.filter(isOn).map((a) => a.getAttribute('href').slice(1)); const vh = innerHeight; const band = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { onScreen: r.bottom > 0 && r.top < vh, center: r.top <= vh * 0.45 && r.bottom >= vh * 0.45 }; }; const atCenter = links.map((a) => a.getAttribute('href').slice(1)).filter((id) => band(id).center); return { nav: g.label, active: act, offScreen: act.filter((id) => !band(id).onScreen), atCenter: [...new Set(atCenter)] }; }).filter(Boolean), groups);
    for (const s of st) {
      if (s.offScreen.length) bad.push({ at: p.at, nav: s.nav, level: 'FAIL', msg: `подсвечен «${s.offScreen.join(', ')}», а этого раздела нет на экране` });
      else if (s.atCenter.length && s.active.length && !s.active.some((a) => s.atCenter.includes(a))) bad.push({ at: p.at, nav: s.nav, level: 'WARN', msg: `на экране «${s.atCenter.join(', ')}», подсвечено «${s.active.join(', ')}»` });
    }
  }
  await scrollToY(page, 0);
  const f = bad.filter((b) => b.level === 'FAIL');
  line(f.length ? 'FAIL' : bad.length ? 'WARN' : 'OK', `активный пункт меню: ${groups.length} меню, ${positions.length} положений`, bad.slice(0, 6).map((b) => `[${b.at}] ${b.nav}: ${b.msg}`).join(' | ') || 'подсветка совпадает с разделом на экране', { groups, positions, bad });
}

/* выброшенные браузером объявления CSS: текст таблиц, <style>, style="" — с номерами строк (C5) */
function cssCheckInPage(arg) {
  const DESCRIPTOR_AT = /^@(font-face|property|counter-style|page|font-feature-values|font-palette-values|view-transition)/i;
  const bad = []; let total = 0, skippedVar = 0, skippedPrefix = 0;
  for (const src of arg.sources) {
    if (!src.text) continue;
    const t = src.text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const lineOf = (i) => t.slice(0, i).split('\n').length + (src.lineOffset || 0);
    const stack = [{ kind: 'rules' }]; let seg = '', segStart = 0, depth = 0, q = null;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { seg += ch; if (ch === '\\') { seg += t[++i] || ''; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; if (!seg.trim()) segStart = i; seg += ch; continue; }
      if (ch === '(') depth++; if (ch === ')') depth--;
      if (depth > 0 || (ch !== '{' && ch !== '}' && ch !== ';')) { if (!seg.trim()) segStart = i; seg += ch; continue; }
      const top = stack[stack.length - 1]; const s = seg.trim();
      if (ch === '{') {
        let kind = 'decls';
        if (/^@(media|supports|layer|container|document|scope|starting-style|-moz-document)/i.test(s)) kind = 'rules';
        else if (/^@(-webkit-)?keyframes/i.test(s)) kind = 'keyframes';
        else if (DESCRIPTOR_AT.test(s) || top.kind === 'skip') kind = 'skip';
        else if (top.kind === 'keyframes') kind = 'decls';
        stack.push({ kind, sel: s });
      } else {
        if (s && top.kind === 'decls') {
          const c = s.indexOf(':');
          if (c > 0) {
            const prop = s.slice(0, c).trim().toLowerCase(); const val = s.slice(c + 1).trim().replace(/!\s*important\s*$/i, '').trim();
            if (!prop.startsWith('--') && /^[a-z-]+$/.test(prop)) {
              if (/^-(ms|moz|o|webkit)-/.test(prop) || /(^|[\s(,])-(ms|moz|o|webkit)-/.test(val) || /^(\*|_)/.test(prop)) skippedPrefix++;
              else if (/var\(|env\(|attr\(|expression\(/i.test(val)) skippedVar++;
              else { total++; if (!CSS.supports(prop, val)) bad.push({ file: src.name, line: lineOf(segStart), rule: top.sel.slice(0, 80), prop, value: val.slice(0, 80), known: CSS.supports(prop, 'inherit') }); }
            }
          }
        }
        if (ch === '}') stack.pop();
      }
      seg = '';
    }
  }
  return { total, skippedVar, skippedPrefix, bad };
}
async function cssStep() {
  const got = await evaluateWith(page, async () => {
    const sources = [];
    for (const sh of document.styleSheets) {
      const node = sh.ownerNode;
      if (node && node.getAttribute && node.getAttribute('data-rw')) continue; /* свои стили проверок */
      if (sh.href) { try { const r = await fetch(sh.href); sources.push({ name: sh.href.split('?')[0].split('/').pop() || sh.href, href: sh.href, text: r.ok ? await r.text() : null }); } catch (e) { sources.push({ name: sh.href.split('?')[0].split('/').pop() || sh.href, href: sh.href, text: null }); } }
      else if (node) {
        const html = document.documentElement.outerHTML; const at = html.indexOf(node.textContent.slice(0, 80));
        sources.push({ name: '<style>', text: node.textContent, lineOffset: at > 0 ? html.slice(0, at).split('\n').length - 1 : 0 });
      }
    }
    for (const el of document.querySelectorAll('[style]')) { if (el.closest('[data-rw-hidden]') && /opacity/.test(el.getAttribute('style'))) continue; sources.push({ name: `style="" у ${sig(el)}`, text: `x{${el.getAttribute('style')}}` }); }
    return sources;
  }, null, DEPS);
  /* таблицы с чужого домена без CORS страница не прочитает — берём их запросом отсюда */
  for (const s of got) if (s.href && s.text == null) { try { const r = await fetch(s.href, { signal: AbortSignal.timeout(20000) }); if (r.ok) s.text = await r.text(); else s.error = `HTTP ${r.status}`; } catch (e) { s.error = String(e.message || e).slice(0, 60); } }
  const res = await evaluateWith(page, cssCheckInPage, { sources: got.filter((s) => s.text).map((s) => ({ name: s.name, text: s.text, lineOffset: s.lineOffset || 0 })) }, {});
  const unread = got.filter((s) => s.href && s.text == null);
  /* одинаковые объявления (генератор повторяет одно и то же в каждом блоке) — одной строкой со счётчиком */
  const group = (list) => { const m = new Map(); for (const b of list) { const k = `${b.file}|${b.rule}|${b.prop}|${b.value}`; const e = m.get(k); if (e) e.count++; else m.set(k, { ...b, count: 1 }); } return [...m.values()]; };
  const real = group(res.bad.filter((b) => b.known)); const unknown = group(res.bad.filter((b) => !b.known));
  const kinds = { sheets: got.filter((s) => s.href && s.text != null).length, styles: got.filter((s) => s.name === '<style>').length, attrs: got.filter((s) => /^style=""/.test(s.name)).length };
  line(real.length ? 'FAIL' : 'OK', `CSS: проверено ${res.total} объявлений — таблиц ${kinds.sheets}, блоков <style> ${kinds.styles}, атрибутов style="" ${kinds.attrs} (с var() не проверялось ${res.skippedVar}, с префиксами ${res.skippedPrefix})`,
    real.length ? real.slice(0, 8).map((b) => `${b.file}:${b.line} ${b.rule} { ${b.prop}: ${b.value} }${b.count > 1 ? ` ×${b.count}` : ''} — браузер выбросил`).join(' | ') + (real.length > 8 ? ` и ещё ${real.length - 8} разных` : '') : 'выброшенных браузером нет', { bad: res.bad });
  if (unknown.length) line('WARN', `CSS: свойства, которых браузер не знает: ${unknown.length}`, unknown.slice(0, 6).map((b) => `${b.file}:${b.line} ${b.prop}`).join(', '));
  if (unread.length) line('WARN', `CSS: не прочитано таблиц ${unread.length}`, unread.slice(0, 4).map((s) => `${s.name} (${s.error || 'нет доступа'})`).join(', '));
}

/* снимок всей страницы (SKILL-ISSUES 460, 456). Масштаб — --full-scale, по умолчанию ×1: на телефоне ×2 выходило 780×14962,
   и Read ужимал его до нечитаемого. Страница выше трёх окон — ещё части по два окна (не больше 12). iframe (карта, видео,
   виджет) на снимке всей страницы бывает серым или обрезанным (виджет меряет себя, когда окно растягивают под снимок) —
   пометка в строке и снимок окна с каждым (первые три), прокрутка потом — как была. Второй --fullpage — <tag>-full-2.png */
let fullN = 0;
async function fullpageStep() {
  const base = `${tag}-full${++fullN > 1 ? `-${fullN}` : ''}`;
  const file = path.join(outDir, `${base}.png`);
  const want = fullScaleOf(cur);
  const how = await fullPageShot(page, file, { scale: want });
  const scale = page.rwFullScale || want;
  const sharp = loadSharp();
  let W = null, H = null;
  if (sharp) { try { const m = await sharp(file).metadata(); W = m.width; H = m.height; } catch { /* без размера */ } }
  const vh = cur.height; const cssH = H ? Math.round(H / scale) : null;
  const parts = []; let partCss = null;
  if (sharp && H && cssH > vh * 3) {
    partCss = vh * 2; if (Math.ceil(cssH / partCss) > 12) partCss = Math.ceil(cssH / 12);
    const ph = Math.max(1, Math.round(partCss * scale));
    for (let top = 0, k = 1; top < H; top += ph, k++) {
      const f = path.join(outDir, `${base}-part${k}.png`);
      try { await sharp(file).extract({ left: 0, top, width: W, height: Math.min(ph, H - top) }).toFile(f); parts.push(path.basename(f)); } catch { break; }
    }
  }
  const frames = await evaluateWith(page, () => {
    const out = [];
    for (const f of document.querySelectorAll('iframe')) {
      const r = f.getBoundingClientRect(); const s = getComputedStyle(f);
      if (r.width < 60 || r.height < 60 || s.display === 'none' || s.visibility === 'hidden' || eff(f) <= 0.05) continue;
      const src = f.getAttribute('src') || ''; let host = '', pn = '';
      try { const u = new URL(src, location.href); host = /^https?:$/.test(u.protocol) ? u.host : ''; pn = u.pathname; } catch { /* без адреса */ }
      const all = `${host}${pn}`.toLowerCase();
      const kind = /(^|\.)(api-)?maps?\.|map-widget|\/maps?(\/|$)|2gis|openstreetmap/.test(all) ? 'карта'
        : /youtube|youtu\.be|vimeo|rutube|vk\.com\/video|vkvideo|dzen\.ru\/embed|player\./.test(all) ? 'видео' : 'виджет';
      f.setAttribute('data-rw-iframe', String(out.length));
      out.push({ i: out.length, sig: sig(f), kind, where: f.hasAttribute('srcdoc') ? 'встроенный (srcdoc)' : host || (src ? src.slice(0, 40) : 'без адреса'), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), src: src.slice(0, 160) });
    }
    return out;
  }, null, DEPS).catch(() => []);
  if (frames.length) {
    const y0 = await page.evaluate(() => Math.round(scrollY)).catch(() => 0);
    for (const fr of frames.slice(0, 3)) {
      await page.evaluate((i) => { const f = document.querySelector(`[data-rw-iframe="${i}"]`); if (f) f.scrollIntoView({ block: 'center', behavior: 'instant' }); }, fr.i).catch(() => {});
      await sleep(1200); await settleAnimations(page, 1500);
      fr.shot = await shot(`iframe${fr.i + 1}`).catch(() => null);
    }
    await page.evaluate(() => { for (const f of document.querySelectorAll('[data-rw-iframe]')) f.removeAttribute('data-rw-iframe'); }).catch(() => {});
    await scrollToY(page, y0); await sleep(200);
  }
  const dpr = cur.deviceScaleFactor || 1;
  const scaleTxt = `×${scale}${scale === 1 ? ': пиксель снимка = CSS px' : `: ${scale} пикселя снимка на CSS px`}`;
  const scaleHint = scale !== want ? ` — снято ×${scale}, а не ×${want}: страница выше предела склейки (120 млн пикселей)`
    : dpr > 1 && scale < dpr ? ` (экран ×${dpr}; как у экрана — --full-scale dpr)` : '';
  const howTxt = how === 'segments' || how === 'dpr1-overflow' ? ` · снято как ${how}: страница выше предела снимка браузера (16000 px)` : '';
  const nP = parts.length; const partWord = nP % 10 === 1 && nP % 100 !== 11 ? 'часть' : [2, 3, 4].includes(nP % 10) && ![12, 13, 14].includes(nP % 100) ? 'части' : 'частей';
  const partsTxt = parts.length ? ` · страница ${cssH} CSS px — ещё ${nP} ${partWord} по ${partCss} CSS px (${Math.round(partCss / vh * 10) / 10} окна): ${parts[0]} … ${parts[parts.length - 1]} — глазами открывать их` : '';
  const frameTxt = frames.length ? ` · на странице ${frames.length} iframe (${frames.slice(0, 4).map((f) => `${f.kind} ${f.where} ${f.w}×${f.h}`).join(', ')}${frames.length > 4 ? ` и ещё ${frames.length - 4}` : ''}): на снимке всей страницы они бывают серыми или обрезанными — смотреть их на снимках окна: ${frames.slice(0, 3).map((f) => f.shot).filter(Boolean).join(', ')}` : '';
  line('OK', 'снимок всей страницы', `${path.basename(file)}${W ? ` ${W}×${H} px` : ''}, ${scaleTxt}${scaleHint}${howTxt}${partsTxt}${frameTxt}`, { file: path.basename(file), width: W, height: H, scale, scaleWanted: want, how, parts, partCss, iframes: frames });
}

/* результат eval/assert строкой; в протокол целиком — до 200 000 знаков (защита от мегабайтного JSON) */
const SHOW_MAX = 200000;
const show = (r) => { const s = r === undefined ? 'undefined' : typeof r === 'string' ? r : String(JSON.stringify(r) ?? r); return s.length > SHOW_MAX ? `${s.slice(0, SHOW_MAX)}… (обрезано на ${SHOW_MAX} знаков из ${s.length})` : s; };

for (const { k, v, expect } of steps) {
  const errBefore = errCount(); let handled = null;
  curKind = k === 'eval' && expect != null ? 'expect' : k;
  try {
    if (k === 'wait') { const ms = Number(String(v).trim()); await sleep(ms); line('OK', `ждали ${ms} мс`); }
    else if (k === 'scroll') await scrollStep();
    else if (k === 'hover') await hoverStep(v);
    else if (k === 'hover-all') await hoverAllStep();
    else if (k === 'click') handled = await clickStep(v);
    else if (k === 'type') await typeStep(v);
    else if (k === 'edit') await editStep(v);
    else if (k === 'key') await keyStep(v);
    else if (k === 'select') await selectStep(v);
    else if (k === 'resize') await resizeStep(v);
    else if (k === 'canvas') await canvasStep();
    else if (k === 'motion') await motionStep();
    else if (k === 'video') await videoStep();
    else if (k === 'nav') await navStep();
    else if (k === 'css') await cssStep();
    else if (k === 'eval') {
      /* результат целиком — в протокол (details); в консоль — его начало, выражение коротко в конце строки */
      const r = await page.evaluate(String(v)); const got = show(r); const expr = ` · выражение «${short(v, 50)}${String(v).length > 50 ? '…' : ''}»`;
      if (expect == null) line('OK', `eval ${short(v, 200)}`, got, { expr: String(v), length: got.length }, { con: `eval → ${headOf(got)}${expr}` });
      else {
        const ok = got === String(expect) || String(r) === String(expect);
        line(ok ? 'OK' : 'FAIL', `eval ${short(v, 200)} = ${short(expect, 80)}`, ok ? `совпало: ${got}` : `ожидали «${String(expect)}», получили «${got}»`, { expr: String(v), expect: String(expect), length: got.length },
          { con: ok ? `eval = ${short(expect, 80)} — совпало: ${headOf(got, 200)}${expr}` : `eval = ${short(expect, 80)} — ожидали «${headOf(expect, 120)}», получили «${headOf(got, 200)}»${expr}` });
      }
    }
    else if (k === 'assert') {
      const r = await page.evaluate(String(v)); const got = show(r);
      line(r ? 'OK' : 'FAIL', `assert ${short(v, 200)}`, r ? got : `ложно: ${got}`, null, { con: `assert ${short(v, 200)} — ${r ? headOf(got, 200) : `ложно: ${headOf(got, 200)}`}` });
    }
    else if (k === 'shot') { const f = await shot(String(v)); line('OK', `снимок ${v}`, f); }
    else if (k === 'fullpage') await fullpageStep();
  } catch (e) {
    line('FAIL', `${k} ${v === true || v === undefined ? '' : v}`, short(e.message || e, 200));
  }
  const newErr = errCount() - errBefore;
  if (newErr && handled !== 'checked-errors') line('FAIL', `новые ошибки после шага ${k}: ${newErr}`, uniqCount([...realConsole(), ...page.log.errors.map((t) => ({ text: t }))].slice(-newErr).map((c) => short(c.text, 120))));
}

/* предупреждения консоли (console.warn): число — как раньше, тексты первых 10 — в JSON (warningTexts) и строкой INFO, по
   160 знаков. Раньше сохранялось только число, и подсказки страницы («[decor-kit] …») в протоколе не были видны (30.09) */
const conWarn = page.log.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
curKind = 'console';
if (conWarn.length) {
  const first = conWarn.slice(0, 10);
  const byText = new Map(); for (const t of first) byText.set(t, (byText.get(t) || 0) + 1);
  const rows = [...byText.entries()].map(([t, k]) => `«${short(t, 160)}${String(t).replace(/\s+/g, ' ').length > 160 ? '…' : ''}»${k > 1 ? ` ×${k}` : ''}`);
  line('INFO', `предупреждения консоли: ${conWarn.length}`, `${rows.join(' | ')}${conWarn.length > 10 ? ` · показаны первые 10 из ${conWarn.length}` : ''}`, { warnings: first },
    { con: `предупреждения консоли: ${conWarn.length}${conWarn.length > 10 ? ` (первые 10; целиком — console.warningTexts в JSON)` : ''}${rows.map((r) => `\n       ${r}`).join('')}` });
}
/* failedRequests — все, как раньше; failedThirdParty — из них запросы сторонних iframe (INFO, не WARN) */
report.console = { errors: realConsole().map((c) => c.text), pageErrors: page.log.errors, warnings: conWarn.length, warningTexts: conWarn.slice(0, 10), failedRequests: page.log.failed, failedThirdParty: page.log.failed.filter((f) => foreignFrame(f)).map((f) => ({ ...f, frame: foreignFrame(f).frame })), document: { status: docStatus, expected: expectStatus } };
drainLib(); /* WARN lib, пришедшие по ходу шагов (свой стиль не вставился) */
report.verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
await browser.close();
writeJson(path.join(outDir, `${tag}.json`), report);
console.log(`\n${report.verdict}: ${fails} провалов, ${warns} предупреждений · ${path.join(outDir, `${tag}.json`)}`);
if (fails && !opt['no-fail']) process.exit(1);

/* ---------- --selftest: стенды fixtures/runtime и два своих сервера (404, сторонний iframe) ---------- */
async function selftest() {
  const { spawn } = await import('node:child_process');
  const http = await import('node:http');
  const os = await import('node:os');
  const self = fileURLToPath(import.meta.url);
  const dir = path.join(path.dirname(self), 'fixtures', 'runtime');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-runtime-selftest-'));
  const U = (f) => pathToFileURL(path.join(dir, f)).href;
  const LIBU = (f) => pathToFileURL(path.join(path.dirname(self), 'fixtures', 'lib', f)).href;
  /* два источника: A — страница (и её 404), B — «чужой» iframe с упавшей картинкой (другой порт — другой источник) */
  const serve = (handler) => new Promise((res) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
  const B = await serve((req, res) => {
    if (req.url === '/frame') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><p>Чужой виджет</p><img src="/pixel-missing.gif" alt="">'); return; }
    res.statusCode = 404; res.end('нет');
  });
  const bUrl = `http://127.0.0.1:${B.address().port}`;
  /* C — тот же «чужой» виджет на имени localhost: для страницы на 127.0.0.1 это другой сайт, Chrome выносит iframe
     в свой процесс (как карту Яндекса), и его строки консоли во вкладку не приходят. localhost браузер может
     открыть и по 127.0.0.1, и по ::1 — сервер слушает оба адреса на одном порту (только петлю, не сеть);
     ::1 не открылся — случай пропускается */
  const frameC = (req, rs) => { if (req.url === '/frame') { rs.setHeader('content-type', 'text/html; charset=utf-8'); rs.end('<!doctype html><meta charset="utf-8"><p>Чужой виджет</p><img src="/pixel-missing.gif" alt="">'); return; } rs.statusCode = 404; rs.end('нет'); };
  const C4 = await serve(frameC);
  const C = await new Promise((res) => { const s = http.createServer(frameC); s.once('error', () => res(null)); s.listen(C4.address().port, '::1', () => res(s)); });
  const cUrl = C ? `http://localhost:${C4.address().port}` : null;
  const A = await serve((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (req.url === '/') { res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="icon" href="data:,"><title>Карта</title><h1>Контакты</h1><iframe src="${bUrl}/frame" width="400" height="200"></iframe>`); return; }
    if (req.url === '/xsite' && cUrl) { res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="icon" href="data:,"><title>Карта</title><h1>Контакты</h1><iframe src="${cUrl}/frame" width="400" height="200"></iframe>`); return; }
    /* битая ссылка на чужой виджет: документ iframe отвечает 404 — это ошибка самой страницы, не «сторонних iframe» */
    if (req.url === '/gone') { res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="icon" href="data:,"><title>Карта</title><h1>Контакты</h1><iframe src="${bUrl}/map-widget" width="400" height="200"></iframe>`); return; }
    if (req.url === '/gone-xsite' && cUrl) { res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="icon" href="data:,"><title>Карта</title><h1>Контакты</h1><iframe src="${cUrl}/map-widget" width="400" height="200"></iframe><iframe src="${cUrl}/frame" width="400" height="200"></iframe>`); return; }
    res.statusCode = 404; res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="icon" href="data:,"><title>Нет страницы</title><h1>Такой страницы нет</h1>');
  });
  const aUrl = `http://127.0.0.1:${A.address().port}`;
  /* SITE_REWORK_DISMISS — пустая у всех случаев, кроме тех, где задана своя (env): переменная из окружения не должна
     менять ожидания */
  const run = (tag, args, target, env = {}) => new Promise((res) => {
    const p = spawn(process.execPath, [self, '--out', out, '--tag', tag, ...args, '--', target], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SITE_REWORK_DISMISS: '', ...env } });
    let text = ''; p.stdout.on('data', (d) => { text += d; }); p.stderr.on('data', (d) => { text += d; });
    const timer = setTimeout(() => p.kill(), 240000);
    p.on('close', (code) => { clearTimeout(timer); let j = null; try { j = JSON.parse(fs.readFileSync(path.join(out, 'runtime', `${tag}.json`), 'utf8')); } catch { /* нет протокола */ } res({ code, text, j }); });
  });
  /* ожидание: [статус, what, details] — what и details регулярками; статус null — любой */
  const has = (j, [st, w, d]) => ((j && j.steps) || []).some((s) => (st == null || s.status === st) && w.test(String(s.what)) && (!d || d.test(String(s.details || ''))));
  const CASES = [
    { name: 'form', file: 'form.html', code: 1, args: ['--type', '#name=Иван', '--type', '#d=2026-10-10', '--type', '#dbad=10.10.2026', '--type', '#dnone=завтра', '--type', '#t=20:30', '--type', '#dt=2026-10-10T20:30', '--type', '#dts=2026-10-10T20:30:00', '--type', '#drw=2026-10-10', '--type', '#m=2026-10', '--select', '#venue=oktava', '--select', '#loose=2', '--select', '#filter=bar', '--select', '#hall=banquet', '--select', '#hall=terrace', '--eval', 'document.body.dataset.date', '--expect', '2026-10-10'],
      want: [['OK', /^ввод в #name$/, /Иван/], ['OK', /^ввод в #d$/, /«2026-10-10».*input и change/], ['OK', /^ввод в #dbad$/, /2026-10-10/], ['FAIL', /^ввод в #dnone$/, /ГГГГ-ММ-ДД/], ['OK', /^ввод в #t$/, /20:30/], ['OK', /^ввод в #dt$/, /2026-10-10T20:30/], ['OK', /^ввод в #m$/, /2026-10/],
        ['OK', /^ввод в #dts$/, /«2026-10-10T20:30».*браузер записал «2026-10-10T20:30:00» как «2026-10-10T20:30»/], ['FAIL', /^ввод в #drw$/, /в поле «2026-01-01» — обработчик страницы переписал значение/],
        ['OK', /^выбор #venue/, /список формы/], ['WARN', /^выбор #loose/, /ничего не изменилось/], ['OK', /^выбор #filter/, /^DOM/], ['OK', /^eval .* = 2026-10-10$/, /совпало/],
        ['FAIL', /^выбор #hall = «Банкетный зал»$/, /^вариант недоступен \(disabled\) — человек его не выберет; доступные: main, terrace$/], ['OK', /^выбор #hall = «Веранда»$/, /в поле «terrace» — список формы/]],
      not: [[null, /^ввод в/, /маска/], ['FAIL', /^ввод в #dts$/], ['OK', /^выбор #hall = «Банкетный зал»$/]] },
    { name: 'hover', file: 'hover.html', code: 0, args: ['--hover', '.nav__link', '--hover', '.clip', '--hover', '.ok', '--hover-all'],
      want: [['OK', /^наведение \.nav__link$/, /backgroundSize: 0% 2px → 100% 2px/], ['OK', /^наведение \.clip$/, /clipPath/], ['OK', /^наведение \.ok$/, /color/], ['WARN', /^наведение: мёртвый селектор, элемента нет в DOM: 1$/, /\.card:hover \.card__tip — элемента \.card \.card__tip нет в DOM/], ['WARN', /^наведение перебито другим правилом: 1$/, /\.btn:hover/],
        ['WARN', /^наведение: цели правила нет у наведённых элементов: 1$/, /\.box:hover \.box__tip — у этого \.box нет \.box__tip \(в DOM таких 1 — у других\)/]],
      not: [['WARN', /перебито/, /card__tip|box__tip/], ['WARN', /мёртвый селектор/, /box__tip/]] },
    { name: 'scroll', file: 'scroll.html', code: 0, verdict: 'OK', args: ['--eval', "document.getElementById('end').scrollIntoView()", '--scroll'],
      want: [['OK', /^прокрутка/, /ждали появления: 1 \(section\.reveal(\.in)? «Появляется при прокрутке»\) — не появились: 0/], ['OK', /^прокрутка/, /показываются при наведении \(проверено наведением.*\): 1 \(span\.card__tip/], ['OK', /^прокрутка/, /вертикальное письмо сверено по высоте и сбоку \(с краем глифа\), в коробке: span «Забронировать»/], ['OK', /^текст перекрыт картинкой$/, /^нет/]],
      not: [[null, /^прокрутка/, /rail__tip|текст шире коробки/]] },
    /* подсказка — только то, что наведение действительно показывает: приглушение соседей и проигравшее правило — WARN */
    { name: 'reveal-hover', file: 'reveal-hover.html', code: 0, verdict: 'WARN', args: ['--scroll'],
      want: [['WARN', /^прокрутка/, /не появились: 3 \(div\.card\.reveal «Первая карточка», div\.card\.reveal «Вторая карточка», span\.lose__tip\.reveal «Проигравшая подсказка»\)/], ['WARN', /^прокрутка/, /показываются при наведении \(проверено наведением.*\): 2 \(span\.card__tip «Подсказка при наведении», span\.sib__tip «Подсказка соседа»\)/]] },
    /* вся страница в закреплённой обёртке (ScrollSmoother) — её блоки появления проверяются; закрытое меню на весь
       экран выше полутора окон — не обёртка, его пункты с opacity 0 не в «не появились» */
    { name: 'smooth', file: 'smooth.html', code: 0, verdict: 'WARN', args: ['--scroll'],
      want: [['WARN', /^прокрутка/, /не появились: 2 \(div\.reveal «Блок появления — скрипт сломан», div\.reveal «Второй блок появления»\)/], ['WARN', /^прокрутка/, /показываются при наведении .*: 1 \(span\.card__tip/]],
      not: [['WARN', /открытом меню/], [null, /^прокрутка/, /drawer__link|Пункт меню/]] },
    /* вертикальное письмо: в коробке — отсеяно, шире коробки сбоку — находка; «текст обрезан» и «не влез в поле» не теряются */
    { name: 'vert', file: 'vert.html', code: 0, verdict: 'WARN', args: ['--scroll', '--click', '#f'],
      want: [['WARN', /^прокрутка/, /текст шире коробки: div\.side «Бронь» — правый край текста \d+ px при крае коробки \d+ px \(вертикальное письмо: сбоку вылезло на \d+ px/], ['WARN', /^прокрутка/, /текст обрезан: span\.btn/], ['WARN', /^прокрутка/, /текст не влез в поле: input#f/], ['WARN', /^прокрутка/, /сверено по высоте и сбоку \(с краем глифа\), в коробке: span «Забронировать»/],
        ['WARN', /^переполнение после клика #f/, /текст обрезан: span\.btn.*текст не влез в поле: input#f/]] },
    { name: 'nav-broken', file: 'nav-broken.html', code: 0, verdict: 'WARN', args: ['--nav'],
      want: [['WARN', /^активный пункт меню: якоря меню ведут в никуда — 4$/, /^#about, #menu, #events, #contacts — /]], not: [[null, /якорей нет/]] },
    /* якоря на <a name> (Tilda) — не битые: INFO «не проверялось», не WARN */
    { name: 'nav-named', file: 'nav-named.html', code: 0, verdict: 'OK', args: ['--nav'],
      want: [['INFO', /^активный пункт меню: якоря на <a name> — не проверялось$/, /якоря <a name> \(#about, #menu, #events, #contacts; так ставит их Tilda\)/]], not: [['WARN', /якоря меню ведут в никуда/]] },
    { name: 'warns', file: 'warns.html', code: 0, verdict: 'WARN', warns: 1, args: ['--scroll'],
      want: [['WARN', /^прокрутка/, /не появились: 1 \(div\.never\.reveal «Так и не появился»\)/], ['WARN', /^прокрутка/, /текст шире коробки: div\.narrow «Неразрывнаядлиннаястрока» — правый край текста \d+ px при крае коробки \d+ px \(края по x от левого края окна, CSS px\)/], ['WARN', /^текст перекрыт картинкой$/, /^1 мест: p\.under .* под svg\.cover/]] },
    { name: 'menu-burger', file: 'menu.html', code: 0, args: ['--viewport', 'mobile', '--click', '#burger', '--scroll'],
      want: [['OK', /^клик #burger$/], ['WARN', /^прокрутка идёт при открытом меню\/диалоге$/, /div#drawer.*после --click #burger/]] },
    { name: 'menu-closed', file: 'menu.html', code: 0, args: ['--viewport', 'mobile', '--click', '#burger', '--click', '#close', '--scroll'],
      want: [['OK', /^клик #close$/], ['OK', /^прокрутка/]], not: [['WARN', /открытом меню/]] },
    { name: 'fixed-hero', file: 'fixed-hero.html', code: 0, args: ['--scroll'],
      want: [['OK', /^прокрутка/]], not: [['WARN', /открытом меню/]] },
    { name: 'menu-more', file: 'menu.html', code: 0, args: ['--click', '#more', '--scroll', '--nav', '--eval', 'document.body.dataset.long'],
      want: [['OK', /^клик #more$/], ['INFO', /^активный пункт меню: якорей нет$/, /меню ведёт на другие страницы/], ['OK', /^eval document\.body\.dataset\.long$/, /строка 60 \| КОНЕЦ$/]],
      not: [['WARN', /открытом меню/], ['WARN', /активный пункт/]] },
    { name: 'status-404', url: `${aUrl}/nope`, code: 0, args: ['--expect-status', '404'],
      want: [['OK', /^загрузка/, /ошибок в консоли нет/], ['INFO', /^ответ документа 404, как ждали$/]], not: [['WARN', /упавшие запросы/]] },
    { name: 'status-plain', url: `${aUrl}/nope`, code: 1, args: [],
      want: [['FAIL', /^загрузка/, /Failed to load resource.*--expect-status 404/]] },
    { name: 'status-mismatch', url: `${aUrl}/`, code: 1, args: ['--expect-status', '404'],
      want: [['FAIL', /^ответ документа 200$/, /ждали 404/]] },
    { name: 'iframe', url: `${aUrl}/`, code: 0, args: [],
      want: [['OK', /^загрузка/, /ошибок в консоли нет/], ['INFO', /^запросы сторонних iframe: не загрузилось 1$/, /в iframe 127\.0\.0\.1:\d+: 1 \(HTTP 404 127\.0\.0\.1/]], not: [['WARN', /упавшие запросы/]] },
    ...(C ? [{ name: 'iframe-xsite', url: `${aUrl}/xsite`, code: 0, args: [],
      want: [['OK', /^загрузка/, /ошибок в консоли нет/], ['INFO', /^запросы сторонних iframe: не загрузилось 1$/, /в iframe localhost:\d+: 1 \(HTTP 404 localhost/]], not: [['WARN', /упавшие запросы/]] }] : []),
    /* документ самого iframe ответил 404 — битая ссылка сайта: WARN «упавшие запросы» и строка консоли в ошибках */
    { name: 'iframe-doc', url: `${aUrl}/gone`, code: 1, args: [],
      want: [['FAIL', /^загрузка/, /404/], ['WARN', /^упавшие запросы$/, /HTTP 404 map-widget/]], not: [['INFO', /^запросы сторонних iframe/]] },
    /* то же у виджета другого сайта (свой процесс, как карта Яндекса): документ 404 — WARN; картинка внутри живого
       виджета того же сайта — INFO. Строка консоли iframe другого сайта во вкладку не приходит — загрузка OK */
    ...(C ? [{ name: 'iframe-doc-xsite', url: `${aUrl}/gone-xsite`, code: 0, args: [],
      want: [['WARN', /^упавшие запросы$/, /^HTTP 404 map-widget$/], ['INFO', /^запросы сторонних iframe: не загрузилось 1$/, /в iframe localhost:\d+: 1 \(HTTP 404 localhost/]], not: [['WARN', /упавшие запросы/, /pixel-missing/]] }] : []),
    /* окна при загрузке (lib, стенды fixtures/lib): открытое окно — WARN «окно» в вердикте и JSON (раньше печаталось мимо
       счёта); SITE_REWORK_DISMISS увёл на главную — нужная страница открыта заново (INFO) и мерится она (mamuka.rest /menu/,
       29.09: мерилась главная с OK); страница снова уводит — WARN «замер не той страницы» */
    { name: 'window', url: LIBU('modal-city.html'), code: 0, verdict: 'WARN', args: [],
      want: [['WARN', /^окно$/, /на странице открыто окно .*SITE_REWORK_DISMISS="\.fancybox-container li\.style-listing-items__item"/]], not: [[null, /^свой стиль/]] },
    /* главная шумит (ошибка в консоли, исключение, упавшая картинка): после повторного открытия они не в счёте — mamuka.rest
       /menu/ получала запросы и консоль промежуточной главной (464 запроса вместо 184, «упавшее» видео главной, 30.09) */
    { name: 'dismiss-nav', url: `${LIBU('dismiss-nav.html')}?noisy=1`, env: { SITE_REWORK_DISMISS: '.city li.city__item' }, code: 0, verdict: 'OK', args: ['--eval', "document.getElementById('mark') ? 'нужная' : 'чужая'", '--expect', 'нужная'],
      want: [['INFO', /^SITE_REWORK_DISMISS$/, /увело на .*dismiss-home\.html\?noisy=1 — нужная страница открыта заново.*запросы и консоль в счёте — только её/], ['OK', /^eval /, /совпало/], ['OK', /^загрузка /, /ошибок в консоли нет/]], not: [['WARN', /^окно$/], ['WARN', /^упавшие запросы$/]] },
    /* то же в Firefox на file://: адрес вкладки после перехода скриптом отставал — переход не замечался, мерилась главная (30.09) */
    ...(findBrowser('firefox') ? [{ name: 'dismiss-nav-ff', url: `${LIBU('dismiss-nav.html')}?noisy=1`, env: { SITE_REWORK_DISMISS: '.city li.city__item' }, code: 0, verdict: 'OK', args: ['--browser', 'firefox', '--eval', "document.getElementById('mark') ? 'нужная' : 'чужая'", '--expect', 'нужная'],
      want: [['INFO', /^SITE_REWORK_DISMISS$/, /увело на .*dismiss-home\.html\?noisy=1 — нужная страница открыта заново/], ['OK', /^eval /, /совпало/], ['OK', /^загрузка /, /ошибок в консоли нет/]], not: [['WARN', /^упавшие запросы$/]] }] : []),
    { name: 'dismiss-wrong', url: `${LIBU('dismiss-nav.html')}?bounce=1`, env: { SITE_REWORK_DISMISS: '.city li.city__item' }, code: 0, verdict: 'WARN', args: [],
      want: [['WARN', /^SITE_REWORK_DISMISS$/, /замер не той страницы/]] },
    /* якорь при своей прокрутке страницы (строка 448): цель видна ниже ленты, но не у scroll-margin — WARN, не FAIL; FAIL —
       только цель под лентой или вне окна; поле секции под лентой — не перекрытие */
    { name: 'anchor', file: 'anchor.html', code: 1, verdict: 'FAIL', args: ['--click', '#own', '--click', '#native', '--click', '#covered', '--click', '#padded', '--click', '#far'],
      want: [['WARN', /^клик #own$/, /верх цели 76px .*— цель не у scroll-margin: верх 76px, ждали 88px \(scroll-margin 88\), разница -12 px/], ['OK', /^клик #native$/, /верх цели 88px/],
        ['FAIL', /^клик #covered$/, /ЦЕЛЬ ПОД ЗАКРЕПЛЁННЫМ СЛОЕМ nav\.ribbon/], ['OK', /^клик #padded$/, /верх цели 0px/], ['FAIL', /^клик #far$/, /ЦЕЛЬ ВНЕ ОКНА/]],
      not: [[null, /^клик/, /ЦЕЛЬ НЕ У ВЕРХА ОКНА/], ['FAIL', /^клик #(own|native|padded)$/]] },
    /* блок шире своей колонки (строка 507): h2 на 16,8 px и карточка в гриде — WARN с именем и CSS px; документ шире окна на
       1 px — WARN с именем элемента; отрицательные поля, лента с прокруткой, обрезка, декор, absolute, transform, 0,5 px — нет */
    { name: 'wide', file: 'wide.html', code: 0, verdict: 'WARN', args: ['--viewport', 'mobile-s', '--scroll'],
      want: [['WARN', /^прокрутка/, /блок шире своей колонки: h2\.wide на 16\.8 px \(CSS px; за правый край колонки main\.col\.flex: колонка 288, блок 304\.8; «Мосты над рекой»\)/],
        ['WARN', /^прокрутка/, /div\.card2 на 8 px \(CSS px; за правый край колонки div\.grid2/], ['WARN', /^прокрутка/, /страница шире окна на 1 px \(CSS px; scrollWidth документа 321 при окне 320\): h2\.wide до 320\.8 px/]],
      not: [[null, /^прокрутка/, /блок шире своей колонки:[^·]*(x-(bleed|ribbon|pill|cut|deco|pres|badge|shift|tiny|fixed)|card2__title на)/], [null, /^прокрутка/, /страница шире окна[^·]*x-/]],
      checks: [(j) => { const s = ((j && j.steps) || []).find((x) => /^прокрутка/.test(x.what)); const o = s && s.data && s.data.overflow; return o && o.blockWiderCount === 2 && o.docWiderSmall && o.docWiderSmall.px === 1 ? null : `в JSON overflow.blockWiderCount ${o && o.blockWiderCount}, docWiderSmall ${JSON.stringify(o && o.docWiderSmall)} — ждали 2 и { px: 1 }`; }] },
    /* фокус в открытом слое (строка 531): без ловушки — WARN с первым элементом под слоем; с ловушкой — OK; слой, который
       закрывается сам, — OK с пометкой. Клики закрытия идут дальше как обычно — слой проверка не закрывает */
    { name: 'focus', file: 'focus.html', code: 0, verdict: 'WARN', args: ['--click', '#open-leaky', '--click', '#leaky-close', '--click', '#open-trap', '--click', '#trap-close', '--click', '#open-closing', '--eval', "document.activeElement && document.activeElement.id", '--expect', 'open-closing'],
      want: [['WARN', /^фокус уходит из открытого слоя на страницу под ним: button#open-trap «Меню с ловушкой»$/, /на 1-м нажатии Tab фокус ушёл из слоя div#leaky\.layer\.is-open \(диалог, 100% окна\)/], ['OK', /^клик #leaky-close$/],
        ['OK', /^фокус в открытом слое div#trap\.layer\.is-open после --click #open-trap$/, /^15 нажатий Tab: фокус не уходит на страницу под слоем \(в слое 15\)/],
        ['OK', /^фокус в открытом слое div#closing\.layer\.is-open после --click #open-closing$/, /слой закрылся на 3-м нажатии Tab/], ['OK', /^eval .* = open-closing$/]],
      not: [['WARN', /^фокус уходит/, /div#(trap|closing)/]] },
    /* окно cookie (строка 422): по умолчанию закрыто до шагов — клик по кнопке под ним и «текст перекрыт» без ложных тревог;
       предупреждения консоли — тексты первых 10 в JSON и строкой INFO */
    { name: 'consent', file: 'consent.html', code: 0, verdict: 'OK', args: ['--click', '#act', '--eval', "document.body.dataset.consent || 'нет'", '--expect', 'yes', '--scroll'],
      want: [['INFO', /^окно cookie$/, /^закрыто кнопкой «Принять» \(div#cookie\.cookie, снизу во всю ширину, \d+×200\) — клики и замеры без него/], ['OK', /^клик #act$/, /DOM/], ['OK', /^eval .* = yes$/],
        ['OK', /^текст перекрыт картинкой$/, /^нет/], ['INFO', /^предупреждения консоли: 12$/, /^«\[decor-kit\] подсказка 1: зерно поверх фото.{60,}…» \| .* · показаны первые 10 из 12$/]],
      not: [['FAIL', /./], ['WARN', /./]],
      checks: [(j) => (j && j.consent && j.consent.found && j.consent.closed && !j.consent.keep && j.console && j.console.warnings === 12 && Array.isArray(j.console.warningTexts) && j.console.warningTexts.length === 10 && j.console.warningTexts[9].startsWith('[decor-kit] подсказка 10:') ? null : `в JSON consent ${JSON.stringify(j && j.consent && { found: j.consent.found, closed: j.consent.closed, keep: j.consent.keep })}, console.warnings ${j && j.console && j.console.warnings}, warningTexts ${j && j.console && (j.console.warningTexts || []).length} — ждали закрыто, 12 и 10`)] },
    /* --keep-consent: окно на месте — и те самые ложные тревоги (клик уходит в окно, значок окна поверх текста) */
    { name: 'consent-keep', file: 'consent.html', code: 1, args: ['--keep-consent', '--eval', "getComputedStyle(document.getElementById('cookie')).display", '--expect', 'flex', '--click', '#act', '--scroll'],
      want: [['INFO', /^окно cookie$/, /^оставлено \(--keep-consent\): div#cookie\.cookie, снизу во всю ширину, \d+×200; кнопки: «Отклонить», «Принять» — клики и замеры идут с ним$/], ['OK', /^eval .* = flex$/],
        ['FAIL', /^клик #act$/, /КНОПКА БЕЗ ЭФФЕКТА/], ['WARN', /^текст перекрыт картинкой$/, /p\.under .* под svg/]],
      not: [[null, /^окно cookie$/, /закрыто кнопкой/]],
      checks: [(j) => (j && j.consent && j.consent.keep && j.consent.found && !j.consent.closed ? null : `в JSON consent ${JSON.stringify(j && j.consent && { keep: j.consent.keep, found: j.consent.found, closed: j.consent.closed })} — ждали keep, found, не закрыто`)] },
    /* прокрутка перед кликом (445) и снимок всей страницы (460, 456): ×1 по умолчанию на телефоне ×2, размер и масштаб
       в строке, части длинной страницы, пометка про iframe и снимок окна с ним; ближняя кнопка — без «прокручено» */
    { name: 'fullpage', file: 'tall.html', code: 0, verdict: 'OK', args: ['--viewport', 'mobile', '--click', '#near', '--click', '#far', '--fullpage'],
      want: [['OK', /^клик #far$/, /перед кликом прокручено к элементу на \d+ px вниз \(scrollY 0 → \d+\)/],
        ['OK', /^снимок всей страницы$/, /^fullpage-full\.png 390×\d+ px, ×1: пиксель снимка = CSS px \(экран ×\d+; как у экрана — --full-scale dpr\)/],
        ['OK', /^снимок всей страницы$/, /ещё \d+ част(ь|и|ей) по \d+ CSS px \(2 окна\): fullpage-full-part1\.png … fullpage-full-part\d+\.png/],
        ['OK', /^снимок всей страницы$/, /на странице 1 iframe \(виджет встроенный \(srcdoc\) 300×200\): на снимке всей страницы они бывают серыми или обрезанными — смотреть их на снимках окна: fullpage-\d+-iframe1\.png/]],
      not: [[null, /^клик #near$/, /прокручено/]],
      checks: [(j) => {
        const st = (j && j.steps) || []; const fp = st.find((x) => x.what === 'снимок всей страницы'); const far = st.find((x) => x.what === 'клик #far'); const near = st.find((x) => x.what === 'клик #near');
        const d = fp && fp.data; const ok = d && d.scale === 1 && d.width === 390 && d.parts.length >= 2 && d.iframes.length === 1 && far && far.data.preScroll && far.data.preScroll.px > 0 && near && near.data.preScroll === null;
        return ok ? null : `в JSON снимок ${JSON.stringify(d && { scale: d.scale, width: d.width, parts: d.parts && d.parts.length, iframes: d.iframes && d.iframes.length })}, preScroll #far ${JSON.stringify(far && far.data.preScroll)}, #near ${JSON.stringify(near && near.data.preScroll)} — ждали ×1, 390, частей от 2, iframe 1, прокрутка у #far и null у #near`;
      }] },
    { name: 'fullpage-x2', file: 'tall.html', code: 0, verdict: 'OK', args: ['--viewport', 'mobile', '--full-scale', '2', '--fullpage'],
      want: [['OK', /^снимок всей страницы$/, /^fullpage-x2-full\.png 780×\d+ px, ×2: 2 пикселя снимка на CSS px/]] },
  ];
  /* проверки 30.09 — и в Firefox (браузер пользователя): якорь, блок шире колонки, фокус в слое, окно cookie */
  if (findBrowser('firefox')) for (const n of ['anchor', 'wide', 'focus', 'consent', 'consent-keep']) { const c = CASES.find((x) => x.name === n); if (c) CASES.push({ ...c, name: `${n}-ff`, args: ['--browser', 'firefox', ...c.args] }); }
  if (!C) console.log('     iframe-xsite пропущен: сервер на ::1 не открылся (нет IPv6)');
  let bad = 0;
  console.log(`runtime.mjs --selftest: ${CASES.length} прогонов, по одному браузеру · протоколы ${out}`);
  try {
    for (const c of CASES) {
      const r = await run(c.name, c.args, c.url || U(c.file), c.env);
      const miss = [];
      if (!r.j) miss.push(`нет протокола: ${short(r.text.split('\n').filter(Boolean).slice(-2).join(' | '), 200)}`);
      if (r.code !== c.code) miss.push(`код выхода ${r.code}, ждали ${c.code}`);
      if (c.verdict && r.j && r.j.verdict !== c.verdict) miss.push(`вердикт ${r.j.verdict}, ждали ${c.verdict}`);
      if (c.warns != null && !new RegExp(` ${c.warns} предупреждени`).test(r.text)) miss.push(`предупреждений не ${c.warns}: ${short((r.text.match(/\d+ провалов, \d+ предупреждений/) || [''])[0], 60)}`);
      for (const w of c.want || []) if (!has(r.j, w)) miss.push(`нет строки ${w[0] || '*'} ${w[1]}${w[2] ? ` — ${w[2]}` : ''}`);
      for (const w of c.not || []) if (has(r.j, w)) miss.push(`лишняя строка ${w[0] || '*'} ${w[1]}${w[2] ? ` — ${w[2]}` : ''}`);
      /* проверки полей протокола (не строк): функция → null или текст расхождения */
      for (const f of c.checks || []) { let m = null; try { m = f(r.j); } catch (e) { m = `проверка протокола упала: ${short(e.message || e, 100)}`; } if (m) miss.push(m); }
      if (miss.length) bad++;
      console.log(`${miss.length ? 'FAIL' : 'OK  '} ${c.name}${miss.length ? ` — ${miss.join('; ')}` : ''}`);
      if (miss.length) console.log(r.text.split('\n').filter((l) => /^(OK|WARN|FAIL|INFO) /.test(l)).map((l) => `       ${short(l, 220)}`).join('\n'));
    }
  } finally { A.close(); B.close(); C4.close(); if (C) C.close(); }
  /* сошлось — временные протоколы и снимки не нужны; разошлось — остаются для разбора */
  if (!bad) { try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* занято — останется во временной папке */ } }
  console.log(bad ? `\nFAIL: разошлось ${bad} из ${CASES.length} — протоколы в ${out}` : `\nOK: все ${CASES.length} прогонов сошлись`);
  return bad ? 1 : 0;
}
