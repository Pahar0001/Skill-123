#!/usr/bin/env node
/**
 * Доступность: то, что можно проверить в живом DOM без чтения экрана.
 *
 *   node a11y.mjs <url> [--viewport desktop] [--out папка] [--tag имя] [--ignore селектор] [--no-grain] [--strict]
 *   node a11y.mjs --selftest [--out папка]
 *   node a11y.mjs --help   (или -h)
 *
 * Флаги:
 *   --viewport  экран: пресет (desktop, laptop, tablet, mobile, mobile-s, android), запись ШxВ@плотность
 *               («320x568@2») или одна ширина; по умолчанию desktop. Один экран за запуск: список
 *               через запятую — ошибка с кодом 1 (запускать по разу на экран, итоги ложатся в разные
 *               файлы). --viewports — то же самое (синоним).
 *   --out       папка прогона (по умолчанию ~/.claude/site-rework/runs/<сайт>), итог — <out>/a11y/<tag>.json.
 *   --tag       имя файла итога (по умолчанию имя экрана).
 *   --ignore    CSS-селектор (список — через запятую) текста вне проверки контраста и кегля: логотип и
 *               знаки, которых WCAG 1.4.3 не касается (logotypes), — --ignore ".logo__sub, .brand-mark".
 *               Исключается совпавший элемент и всё внутри него. Без флага то же даёт атрибут
 *               data-a11y-logo на логотипе. Исключённое — строкой INFO со счётом и примерами; селектор,
 *               который ничего не нашёл, — WARN; неверный селектор — ошибка с кодом 1 (проверяется в
 *               браузере, после открытия страницы).
 *   --no-grain  не учитывать слой зерна поверх текста в контрасте (см. ниже).
 *   --strict    код выхода 1 при вердикте FAIL (для гейта); без флага — 0 при любом вердикте.
 *   --selftest  стенды fixtures/a11y с ожиданиями: фокус на полях даты и времени, скрытый (кегль 0),
 *               декоративный (aria-hidden) текст и логотип, подписи над фото и градиентами (и подписи в
 *               разных местах одного фона), закреплённая лента с пилюлями, светлый слой поверх подложки
 *               шапки и пилюль после прокрутки, плашка активной пилюли отдельным слоем (и лента, накрытая
 *               окном cookie). Каждый стенд — отдельный запуск a11y (по одному браузеру), протоколы — во
 *               временной папке или в --out; код 1, если хоть одно ожидание не сошлось.
 *   --help, -h  эта справка.
 * Код выхода: 0 — проверка сделана (вердикт в выводе и в JSON); 1 — неверные аргументы или, с --strict,
 * вердикт FAIL. Аргументы (адрес, экран, значения флагов) проверяются до создания папок и запуска
 * браузера.
 *
 * Проверяется: контраст текста к фактическому фону (WCAG AA: 4.5:1, крупный
 * текст 3:1) — по вычисленным цветам, а на картинках, градиентах и чужих подложках по снимку
 * фона за текстом (худшие 10% пикселей). Чужая подложка — блок с фоном, который лежит под центром
 * текста, но не его предок (фигура под текстом в Tilda Zero Block, плашка плавающего меню), или
 * предок с фоном, чья коробка под текстом не лежит (текст вынесен fixed/absolute). Закреплённый
 * текст (прозрачная шапка, нижняя панель) сравнивается с подложками в координатах окна на верху
 * страницы — шапка поверх фото первого экрана меряется по снимку, а не по фону body; ниже по
 * странице — отдельной проверкой (см. «Закреплённый текст на прокрутке»). Не проверяется
 * текст, которого на экране нет: центр за краем предка с overflow ≠ visible (слайд за краем,
 * заглушка Tilda за коробкой artboard). Текст, перекрытый чужим непрозрачным блоком в момент
 * снимка или ушедший за окно, не мерится, но и не считается OK: WARN со списком («смотреть глазами»).
 * Окно здесь — видимая область (visualViewport): снимок — это она; вырезка фона считается от её
 * смещения и ширины (у страницы без meta viewport на телефоне 1 CSS-пиксель на снимке — 0.8 точки,
 * а не 2, и вырезка по координатам окна раскладки уходила за снимок — «пропущено» вместо замера).
 * Проверка перекрытия идёт через elementsFromPoint, а он не видит pointer-events:none — на время
 * проверки тексту ставится pointer-events:auto (частый .hero__content{pointer-events:none}).
 * Контраст считается у всего видимого текста; при больше 5000 текстовых элементов — первые 5000 и
 * WARN «взято N из M (обрезано)».
 * Текст на картинке, градиенте или чужой подложке мерится по снимку у каждого элемента, до 150 за запуск.
 * Фон — пиксели под коробками строк своего текста (как у закреплённого текста на прокрутке), а не под всей
 * коробкой элемента: поля и скруглённые углы тёмной пилюли на белой ленте, значок рядом с подписью, фото
 * вдали от короткой подписи во всю ширину карточки давали худшие 10% «1:1». Строк нет — коробка элемента.
 * Одинаковые — только подписи того же класса и цвета над тем же фоном (тот же файл картинки с тем же
 * object-fit и object-position, та же запись градиента или картинки фоном с тем же background-position и
 * background-size, или цвет подложки) и на том же месте этого фона: центр текста в той же клетке коробки
 * фона (по высоте не меньше 8 полос и не выше 120 px, по ширине не меньше 4 и не шире 200 px). Таких мерится
 * не больше трёх, остальные — «повтор того же фона». Раньше ключом был класс картинки: на афише из 7 карточек
 * мерились 3, карточки 4–7 над другими фото — нет, а вердикт OK; а место не учитывалось: шесть белых подписей
 * над одним градиентом «сверху чёрный, снизу белый» мерились три верхние, белые над белым шли «повтором».
 * В строке — «измерено N из M»; упёрлись в предел 150 — WARN «не измерено K, смотреть глазами».
 *
 * Вне проверки контраста и кегля. Текст кеглем 0 (номер телефона рядом со значком — «для читалки») на
 * экране не нарисован: это скрытый текст, а не «мелкий текст 0px» — WARN с советом прятать обрезкой
 * (sr-only: clip или clip-path) или дать ссылке aria-label. Текст внутри aria-hidden="true" — оформление,
 * скрытое от читалок (бегущая лента, крупные буквы фоном): WCAG 1.4.3 чисто декоративного текста не
 * касается — строка INFO «декоративный, вне 1.4.3» со счётом и примерами; под aria-hidden 20 текстов и
 * больше, и это от четверти всего текста, — ещё WARN: так прячут от читалок и содержимое (обёртка страницы
 * с aria-hidden, забытая после закрытия окна), и его контраст тогда не мерился. Логотип (WCAG: logotypes) —
 * атрибут data-a11y-logo на нём или --ignore <селектор>, тоже INFO. Всё это не входит и в закреплённый
 * текст на прокрутке.
 * Ещё: мелкий текст; картинки без alt, поля без подписи, кнопки и ссылки без имени,
 * порядок заголовков, число h1, lang, запрет масштабирования, положительный tabindex,
 * видимость фокуса при обходе клавишей Tab, размер целей нажатия на телефоне (24 px),
 * кегль полей ввода на телефоне (16 px), правило prefers-reduced-motion в стилях, автоплей видео.
 *
 * Цели нажатия и поля на телефоне. Цель нажатия радиокнопки и флажка — вместе с подписью: нажатие
 * на label (обёртку или label[for]) тоже ставит отметку, поэтому мерится самая крупная из коробок —
 * своя или подписи (оформленная радиокнопка, обрезанная до 1×1 или прозрачная поверх подписи
 * 30+ px, — не «input 1×1»). Мелкая подпись — по-прежнему WARN, в строке её размер. «Поля ввода
 * текста мельче 16px» (iOS увеличит страницу при фокусе) — только текстовые поля: input text,
 * email, tel, number, search, url, password, date и время, textarea и select; радиокнопки, флажки,
 * ползунки, выбор файла и цвета iOS не увеличивает. Число в строке — всех найденных, список —
 * первые 10 и 6.
 *
 * Прокрутка. Сначала страница проходится целиком (lib.scrollThrough, прокрутка мгновенная —
 * forceInstantScroll): иначе при html{scroll-behavior:smooth} страница не доезжала, блоки
 * появления оставались скрытыми (на стенде было 2 из 21) и в проверку попадала часть текста и
 * заголовков. В выводе — сколько блоков с текстом было скрыто до прокрутки и сколько показано после.
 * Низ страницы — её высота минус innerHeight (окно раскладки), а не высота экрана: у страницы без
 * meta viewport на телефоне окно раскладки выше экрана (2121 px при экране 390×844), и от высоты
 * экрана выходило ложное «до низа не доехали».
 *
 * Контраст с прозрачностью. Цвет текста с альфой (rgba) и opacity самого элемента и предков
 * смешиваются с фоном так, как их складывает браузер (группы прозрачности по цепочке предков),
 * а не отбрасываются: раньше такой текст молча пропускался или считался непрозрачным
 * (белый с opacity .25 на чёрном проходил как 21:1). Цвета любых записей (oklch, color-mix…)
 * переводятся в sRGB через HEX_FN из lib.mjs.
 *
 * Зерно поверх текста. Полноэкранный закреплённый слой фактуры (texture.mjs → findTextureLayers,
 * слой во весь экран с position:fixed, z-index не отрицательный) меняет и цвет текста, и фон.
 * Действие слоя меряется по снимкам: всё, кроме слоя, прячется, под слоем по очереди чёрный,
 * серый 128 и белый фон; средний цвет снимка даёт отображение канала c → c' (кусочно-линейное
 * по трём точкам: для normal это c' = c(1−α) + α·среднее плитки, для multiply и screen тоже
 * точно, для overlay и soft-light — приближение). Каждая пара «текст/фон» пересчитывается с
 * этим отображением; пары, которые без зерна проходят норму, а с зерном нет, — FAIL
 * «контраст с учётом зерна»; пары в пределах 10 % над нормой перечисляются. Для текста на
 * картинке снимок фона уже содержит слой: отображение применяется только к цвету текста.
 *
 * Закреплённый текст на прокрутке. Текст в блоке с position: fixed или sticky (шапка, плавающее
 * меню, нижняя панель) лежит над разными секциями: прозрачная шапка с белыми ссылками над тёмным
 * фото первого экрана проходит, а над белым каталогом ниже — нет, если сайт не меняет шапку. Верх
 * страницы мерится вместе со всем текстом (строки «контраст» выше); сверх того страница ставится ещё
 * на несколько высот, не больше 8: сначала по одной на каждый фон секций, которого закреплённый текст
 * наверху не касался (для каждой полосы такого текста — сверху, снизу), затем на остальные секции по
 * порядку. Секции — дети body и обёрток во всю высоту страницы (не fixed и не absolute) шириной от
 * половины меньшей из ширин: видимой области (visualViewport) и clientWidth корня. Не от innerWidth:
 * у страницы шире экрана окно раскладки шире вдвое и больше (820 px при экране 320), а у уменьшенной
 * страницы без initial-scale шире и видимая область (1020 px при секциях 320) — секции во всю
 * ширину экрана не проходили, выходило «секций с другим фоном нет, одна высота посередине»; фон секции —
 * свой цвет или картинка, иначе крупная (от половины площади) картинка или блок с фоном внутри,
 * иначе «фон страницы». Секций с другим фоном нет — одна высота посередине страницы (сайт мог сменить
 * шапку после прокрутки). На каждой высоте — пауза и ожидание переходов (сайт перекрашивает шапку по
 * прокрутке), цвет текста читается заново, весь текст страницы прячется (и текст секции, проезжающий
 * под прозрачной шапкой: фон — это подложки и картинки, а не чужие буквы), и снимок окна даёт фон под
 * строками (коробки строк текста, а не всего элемента: значок рядом с подписью не в счёт; часть
 * строки за краем блока с overflow ≠ visible — многоточие — тоже). Снимок окна — это видимая область
 * (visualViewport), а не окно раскладки: у страницы без meta viewport на телефоне видимая область
 * 980 px шириной, а не 390, а у страницы с контентом шире экрана при initial-scale=1 окно раскладки
 * шире и выше видимой области (354×629 против 320×568). Коробки строк сдвигаются на смещение видимой
 * области, масштаб — от её ширины; текст, центр которого вне неё, — «вне окна» (нижняя панель у низа
 * окна раскладки на таком экране не видна), видимый текст, под которым на снимке нет ни одного
 * пикселя, — «вне снимка»; оба — в «не мерились». Замер текста на картинке подводит к нему
 * scrollIntoView, и на такой странице видимая область сдвигается внутри окна раскладки, а
 * window.scrollTo этот сдвиг не сбрасывает: шапка на всех высотах оставалась «вне окна», и FAIL
 * прозрачной шапки становился OK (мерилась нижняя панель, которую сдвиг показал). Поэтому перед
 * каждой высотой и перед замером закреплённого текста на верху страницы видимая область
 * возвращается в исходное положение (на месте — ничего не делается). Исходное положение — начало
 * страницы, а у страницы с письмом справа налево (dir=rtl) шире экрана на телефоне — scrollX −500 при
 * сдвиге видимой области 0,0: сброс к началу корня уносил там видимую область на 500 px, закреплённая
 * шапка уходила со снимка, и FAIL прозрачной шапки становился WARN «замеров 0». Запоминается сразу
 * после открытия страницы только отрицательный scrollX (он бывает лишь у dir=rtl); сдвиг видимой
 * области, который страница сделала сама при загрузке (фокус на кнопке баннера cookie, autofocus,
 * адрес с #якорем), исходным не считается и сбрасывается. Возврат — scrollTo по горизонтали,
 * сдвиг видимой области — scrollIntoView корня (исходное место — начало страницы) или временного
 * невидимого блока на исходном месте (dir=rtl). Не вернулась — в JSON viewReset.failed, в выводе
 * «видимая область N раз не вернулась на исходное место», и OK этой строки становится WARN. Возвраты
 * перед замером закреплённого текста на картинке считаются отдельно (viewReset.img — сколько их было до
 * прохода по высотам): их провал помечается в строке «по снимку фона» (OK → WARN), а строка высот
 * говорит только о своих. Худшие 10 %
 * пикселей против нормы AA, зерно учитывается как выше. Шапка с mix-blend-mode (difference —
 * «белый текст, который над светлым становится чёрным») мерится смешанным цветом: multiply, screen,
 * overlay, hard-light, darken, lighten, difference, exclusion, color-dodge, color-burn считаются по
 * формулам смешения, остальные режимы не мерятся («смешение цвета»). Провал — FAIL с высотой и секцией:
 * «на 1840 px меню nav.menu над секцией section#catalog «Каталог» (фон под текстом светлый): a «Каталог» #FFFFFF 16px
 * — 1.07:1». К высотам подъезжают сверху (прокрутка вниз); если часть текста на высоте спрятана, за
 * окном или обрезана, — ещё раз снизу: шапка, которая прячется при прокрутке вниз, видна при прокрутке вверх
 * (в выводе «прокрутка вверх»). Текст, который и так спрятан, за окном, перекрыт другим блоком или
 * обрезан предком (закрытое выпадающее меню: max-height 0 и overflow hidden, clip-path — в точке
 * текста браузер его не рисует), на этой высоте не мерится — в выводе сколько таких; текст, центр
 * которого уже при поиске за краем предка с overflow ≠ visible, в список не берётся вовсе. Ни одного
 * замера — WARN «смотреть глазами».
 * Sticky закреплён только в пределах своего контейнера (ближайший предок не inline): карточка товара
 * с position:sticky внутри сетки уезжает вместе с сеткой и на секции ниже не заходит. Поэтому у
 * sticky считается участок прокрутки, где он закреплён: от места в потоке (запоминается на верху
 * страницы, пока блок стоит на нём) до высоты, где контейнер кончается (низ контейнера − высота
 * блока − top; у bottom — зеркально). Высоты выбираются только внутри участка; участок короче 8 px
 * (карточка в последней строке сетки на телефоне), нет ни top, ни bottom или между блоком и прокруткой
 * блок с overflow ≠ visible (прилипает к нему, а не к окну) — блок нигде не закреплён, высот для него
 * нет, и если закреплённого текста больше нет — OK «sticky-блок ниже верха страницы нигде не
 * закреплён». Секций с другим фоном нет, а посередине страницы sticky не закреплён — одна высота
 * посередине его участка. На высоте, выбранной для другого блока (шапки), sticky вне участка —
 * «не закреплён»: он уехал вместе с контейнером или ещё стоит в потоке и там это обычный текст своей
 * секции (его контраст — в основном проходе), а не пропуск; «уехал» считается по коробке контейнера
 * и offsetHeight, а не по коробке блока — шапка, спрятанная transform при прокрутке вниз, остаётся
 * «вне окна» и мерится при прокрутке вверх. Ноль замеров только из-за «не закреплён» — OK с
 * пометкой «мерить нечего», а не WARN. Sticky внутри fixed-предка — как fixed. Прокручивается не документ,
 * а блок во весь экран — секции ищутся в нём. Берётся до 40 элементов (больше — сначала мелкие
 * блоки: шапка и меню раньше закреплённых секций, и не больше трёх одинаковых). Закреплённый текст
 * ищется наверху и на высоте одного экрана: шапка, ставшая fixed только после прокрутки, тоже в счёт.
 * Своя подложка. Текст закреплённого блока на своём фоне (пилюля ленты разделов, кнопка шапки с заливкой)
 * лежит над цветом этой подложки, а не над секцией под блоком. Видимый на высоте текст мерится по снимку, как
 * и весь закреплённый текст: на снимке есть и то, что лежит между подложкой и текстом (светлый ::before шапки
 * после прокрутки, дочерний слой, картинка). По цветам подложки, без снимка, мерится только текст, которого на
 * снимке этой высоты нет: лента, прокрученная к активному разделу, увела его за свой край («обрезан»), он вне
 * окна или его перекрыло окно. Подложка — фоны по цепочке от текста до закреплённого блока до первого
 * непрозрачного (без картинок и градиентов, без mix-blend-mode, сама подложка без прозрачности). Не
 * подложка, если между ней и текстом что-то нарисовано: ::before или ::after с фоном у звена цепочки, не меньше
 * половины текста по ширине и высоте (полоска подчёркивания активной пилюли и точка-значок — не в счёт), или
 * другой потомок подложки с фоном или картинкой под центром текста; такой текст на этой высоте — «обрезан»
 * (или «вне окна», «перекрыт») в «не мерились». Непрозрачная — замер точный; полупрозрачная (плашка
 * rgba(…, .96)) — худший случай между подложкой над чёрным и над белым: если и он не проходит норму — не
 * мерится. Пилюли, которые наверху уже за краем горизонтально прокручиваемой ленты (overflow-x auto/scroll),
 * в список берутся, если у них непрозрачная подложка. В строке — «по снимку N, по своей подложке M» (M — тот
 * самый текст за краем, вне окна или перекрытый); раньше лента, уехавшая к активному разделу, давала «обрезан
 * 6, замеров 0 — смотреть глазами». Одно время по подложке мерился и видимый текст — шапка #111 со светлым
 * ::before поверх после прокрутки давала OK 18.88:1 вместо FAIL 1.18:1.
 *
 * Строгий CSP. Свои стили (текст прозрачным на время снимка фона, пробы зерна) вставляются элементом
 * <style>; если CSP страницы (style-src без 'unsafe-inline') его не применил — сконструированной
 * таблицей стилей (document.adoptedStyleSheets), на которую CSP не распространяется. Сама страница
 * при этом не меняется: CSP для вкладки не отключается. Не вышло и так — проверка, которой нужен
 * стиль, получает WARN «не измерен — CSP запрещает вставку стиля», прогон доходит до конца и пишет
 * протокол.
 *
 * Мелкий текст: видимый текст кеглем меньше 12 px — WARN, меньше 10 px — FAIL (подписи вроде
 * «не обязательно» 9 px читать трудно, особенно на телефоне). Скрытый для глаз текст
 * (sr-only: коробка 1–2 px или clip) не в счёт; кегль меньше 1 px — скрытый текст, своей строкой WARN
 * (см. «Вне проверки контраста и кегля»), декоративный под aria-hidden и логотип — в строке INFO.
 *
 * Фокус. Обход клавишей Tab идёт на СВЕЖЕЙ странице — отдельная вкладка, без прокруток и кликов:
 * после проверок контраста фокус оставался в нижней панели, обход проходил 1 элемент и писал OK
 * (связка blur()+scrollTo+body.focus() старт не сбрасывает, сбрасывает только загрузка). Если
 * обошли меньше min(5, число остановок Tab) — WARN «обход не состоялся», а не OK; группа радиокнопок
 * с одним name — одна остановка (Tab заходит в неё один раз). Фокус виден, если при фокусе меняется
 * рамка, тень, фон, цвет или подчёркивание у самого элемента — или у того, кто рисует рамку за него:
 * подписи (label — обёртка или label[for]), соседа сразу за ним (input:focus-visible + span) или
 * обёртки до трёх уровней вверх без других фокусируемых внутри (.search:focus-within). Так
 * оформленная радиокнопка (прозрачна, обрезана 1×1 или appearance:none поверх подписи) с рамкой на
 * подписи — не FAIL; в строке OK — у кого и где нарисован фокус. Своя рамка невидимого элемента
 * (прозрачность до 0.05, clip или clip-path inset(50%) как у sr-only, коробка до 2×2 без крупных
 * детей) не в счёт: FAIL с пометкой «рамка только у самого элемента, а он невидим». Рамка с плавным
 * переходом (transition) меряется конечной: идущие переходы завершаются перед каждым снимком стиля
 * (раньше сразу после blur() стиль был тем же, что в фокусе, — ложный FAIL). Поле даты и времени (date,
 * time, datetime-local, month, week) в Chrome держит фокус с клавиатуры во внутреннем сегменте (теневой DOM
 * поля), и el.blur() его не снимает: activeElement и :focus остаются, стиль «после blur» совпадал со стилем в
 * фокусе — ложный FAIL «не видно фокуса на: input#bDate» при рамке 2px. Если после blur() элемент всё ещё в
 * фокусе, фокус уводится на временный невидимый элемент вне поля (tabindex=-1, за краем окна), стиль
 * снимается, элемент убирается, фокус возвращается полю (:focus-visible возвращается с ним). Фокус внутри iframe
 * (карта, видео): activeElement страницы — сам iframe, его стиль не меняется; видимость там не
 * проверяется, Tab жмётся, пока фокус не вернётся в страницу (до 40 раз), в выводе — «внутри iframe
 * не проверялся». Не вернулся — WARN, не ложный FAIL «не видно фокуса на iframe» и не «ловушка».
 *
 * Не заменяет Lighthouse и не проверяет чтение экраном — это дополнение,
 * которое работает на любом адресе и даёт список конкретных элементов.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  launch, openPage, resolveViewport, parseArgs, runDir, writeJson, sleep, ensureDir, loadSharp,
  forceInstantScroll, scrollThrough, scrollToY, settleAnimations, evaluateWith, VIEWPORTS,
  SIG_FN, EFFECTIVE_OPACITY_FN, VISIBLE_FN, HEX_FN, addStyleSafe, removeStyleSafe, collectWarnings, takeWarnings,
} from './lib.mjs';
import { findTextureLayers } from './texture.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['help', 'h', 'no-grain', 'strict', 'selftest'], values: ['viewport', 'viewports', 'out', 'tag', 'ignore'], strict: true });
/* короткий -h — как --help: и на месте адреса, и на месте значения флага; до любых папок и браузера */
if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h')) { console.log(HELP); process.exit(0); }
const die = (msg) => { console.error(msg); process.exit(1); };
/* WARN lib (свой стиль не вставился) — строкой вердикта и в json, а не посреди вывода */
collectWarnings();
for (const k of ['viewport', 'viewports', 'out', 'tag', 'ignore']) if (opt[k] === true) die(`--${k}: нужно значение (подробно: --help)`);
if (opt.selftest) process.exit(await selftest());
if (!pos[0]) die('Нужен адрес: node a11y.mjs <url> [--viewport mobile]  (подробно: --help)');
/* --ignore: CSS-селектор логотипа и знаков вне проверки контраста и кегля; правильность — в браузере */
const IGNORE = opt.ignore === undefined ? null : String(opt.ignore).trim();
if (IGNORE === '') die('--ignore: нужен CSS-селектор, например --ignore ".logo__sub, .brand-mark" (подробно: --help)');
const url = pos[0];
{
  let ok = false; try { ok = /^(https?|file|data|about):$/i.test(new URL(url).protocol); } catch { /* не адрес */ }
  if (!ok) die(`Неверный адрес «${url}»: нужен полный адрес — http://…, https://… или file:///…  (подробно: --help)`);
}
/* --viewport и --viewports — один флаг; экран один за запуск */
function oneViewport(dflt) {
  const a = opt.viewport, b = opt.viewports;
  if (a !== undefined && b !== undefined && String(a).trim() !== String(b).trim()) die(`Заданы и --viewport ${a}, и --viewports ${b} — это один флаг, оставьте один`);
  const raw = a ?? b; const list = String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) list.push(dflt);
  if (list.length > 1) die(`a11y меряет один экран за запуск, а задано ${list.length}: ${list.join(', ')}. Запустите по разу на экран: ${list.map((v) => `--viewport ${v}`).join(', затем ')} — итоги лягут в разные файлы (<out>/a11y/<экран>.json)`);
  const r = resolveViewport(list[0]);
  if (!r) die(`Неизвестный экран «${list[0]}». Есть: ${Object.keys(VIEWPORTS).join(', ')} или запись ШxВ@плотность, например 320x568@2`);
  return r;
}
const [vpName, vp] = oneViewport('desktop');
const run = runDir(opt, url); const outDir = ensureDir(path.join(run, 'a11y'));
const tag = opt.tag || vpName;
const sharp = loadSharp();
const DEPS = { sig: SIG_FN, eff: EFFECTIVE_OPACITY_FN, vis: VISIBLE_FN, hexc: HEX_FN, exc: excludedInPage.toString() };
/* закреплённый текст на прокрутке: ещё stk — положение sticky-блока (stickyInPage), plt — своя подложка (plateInPage) */
const FX_DEPS = { ...DEPS, stk: stickyInPage.toString(), plt: plateInPage.toString() };

/* ---------- свой стиль на странице, в том числе при строгом CSP ---------- */

const CSP_NO_STYLE = 'CSP запрещает вставку стиля';
/* свой стиль — lib.addStyleSafe: CSP страницы (заголовок из preparePage и meta) проверяется до вставки,
   при запрете сразу сконструированная таблица (document.adoptedStyleSheets) — без нарушения в консоли
   и отчёта на report-uri сайта (раньше <style> пробовался всегда). Повторный вызов с тем же ключом
   заменяет стиль. Не вставился никак — ошибка CSP_NO_STYLE: проверка, которой нужен стиль, пишет
   WARN «не измерен — CSP запрещает вставку стиля». (null бывает и при сбое самой вкладки — редкость.) */
async function addCss(page, key, css) { const how = await addStyleSafe(page, css, { key, warn: false }); if (!how) throw new Error(CSP_NO_STYLE); return how; }
const removeCss = (page, key) => removeStyleSafe(page, key);

/* ---------- функции страницы (свободные переменные sig, eff, vis, hexc — из lib.mjs) ---------- */

/* блоки с текстом, скрытые до прокрутки (своя opacity ≈ 0): метка data-rw-hid, только внешние */
function markHiddenInPage() {
  let n = 0;
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    const s = getComputedStyle(el); if (s.display === 'none' || parseFloat(s.opacity) > 0.05) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || !(el.textContent || '').trim()) continue;
    if (el.parentElement && el.parentElement.closest('[data-rw-hid]')) continue;
    el.setAttribute('data-rw-hid', ''); n++;
  }
  return n;
}
function revealInPage() {
  const els = [...document.querySelectorAll('[data-rw-hid]')];
  const shown = els.filter((el) => parseFloat(getComputedStyle(el).opacity) > 0.5);
  return { hidden: els.length, shown: shown.length, still: els.filter((el) => !shown.includes(el)).map((el) => sig(el)).slice(0, 8) };
}

/* текст вне проверки контраста и кегля: логотип (data-a11y-logo), --ignore <селектор>, декоративный
   под aria-hidden="true" (WCAG 1.4.3 не касается логотипов и чистого оформления). Причина или null */
function excludedInPage(el, ignore) {
  if (el.closest('[data-a11y-logo]')) return 'логотип';
  if (ignore) { try { if (el.closest(ignore)) return 'ignore'; } catch (e) { /* неверный селектор — проверен до замера */ } }
  if (el.closest('[aria-hidden="true"]')) return 'aria-hidden';
  return null;
}

function domInPage({ isMobile, map, ignore }) {
  const V = (el) => vis(el);
  const parseC = (css) => { const h = hexc(css); if (!h) return null; return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: h.length > 7 ? parseInt(h.slice(7, 9), 16) / 255 : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  /* действие слоя зерна: канал c → c' по трём точкам (0, 128, 255) */
  const f1 = (pts, c) => (c <= 128 ? pts[0] + (pts[1] - pts[0]) * c / 128 : pts[1] + (pts[2] - pts[1]) * (c - 128) / 127);
  const grain = (c) => (map ? { r: f1(map[0], c.r), g: f1(map[1], c.g), b: f1(map[2], c.b) } : c);
  /* сложение слоёв как в браузере: цвета с предумноженной альфой, opacity — группа */
  const P = (c) => (c ? { r: c.r * c.a, g: c.g * c.a, b: c.b * c.a, a: c.a } : { r: 0, g: 0, b: 0, a: 0 });
  const over = (t, b) => ({ r: t.r + b.r * (1 - t.a), g: t.g + b.g * (1 - t.a), b: t.b + b.b * (1 - t.a), a: t.a + b.a * (1 - t.a) });
  const mul = (c, o) => ({ r: c.r * o, g: c.g * o, b: c.b * o, a: c.a * o });
  const opOf = (s) => { if (s.display === 'contents') return 1; let o = parseFloat(s.opacity); const m = s.filter && s.filter !== 'none' ? s.filter.match(/opacity\(([\d.]+)(%?)\)/) : null; if (m) o *= m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]); return o; };
  const canvasBg = /dark/.test(getComputedStyle(document.documentElement).colorScheme || '') && !/light/.test(getComputedStyle(document.documentElement).colorScheme || '') ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  /* итоговые цвета текста и фона под ним; null — на пути картинка или градиент (тогда по снимку) */
  const colorsOf = (el) => {
    const chain = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    const st = chain.map((n) => getComputedStyle(n)); const ops = st.map(opOf);
    const rest = new Array(chain.length + 1).fill(1); for (let i = chain.length - 1; i >= 0; i--) rest[i] = rest[i + 1] * ops[i];
    const fill = st[0].webkitTextFillColor; const fg = parseC(fill && fill !== st[0].color ? fill : st[0].color);
    if (!fg) return { transparentText: true };
    let X = P(fg), Y = P(null); let bgNode = null;
    for (let i = 0; i < chain.length; i++) {
      if (i > 0 && X.a >= 0.999 && Y.a >= 0.999 && rest[i] >= 0.999) break;
      if (st[i].backgroundImage && st[i].backgroundImage !== 'none') return { imageBg: true, fg, alpha: fg.a * rest[0], bgId: `${st[i].backgroundImage}|${st[i].backgroundPosition}|${st[i].backgroundSize}`, bgEl: chain[i] };
      const bg = P(parseC(st[i].backgroundColor)); X = over(X, bg); Y = over(Y, bg);
      if (!bgNode && Y.a >= 0.999) bgNode = chain[i];
      if (ops[i] < 1) { X = mul(X, ops[i]); Y = mul(Y, ops[i]); }
    }
    /* фон дал предок, но под текстом его нет (текст вынесен fixed/absolute за его коробку) — по снимку */
    if (bgNode && bgNode !== document.documentElement && bgNode !== document.body) {
      const a = el.getBoundingClientRect(), b = bgNode.getBoundingClientRect(); const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
      if (cx < b.left - 1 || cx > b.right + 1 || cy < b.top - 1 || cy > b.bottom + 1) return { imageBg: true, displaced: true, fg, alpha: fg.a * rest[0], bgId: 'вынесен ' + sig(bgNode) };
    }
    X = over(X, canvasBg); Y = over(Y, canvasBg);
    return { fg: { r: X.r, g: X.g, b: X.b }, bg: { r: Y.r, g: Y.g, b: Y.b }, raw: fg, alpha: fg.a, opacity: rest[0] };
  };
  const contrast = { checked: 0, translucent: 0, unknown: 0, transparentText: 0, total: 0, considered: 0, failures: {}, imgList: [], grain: map ? { checked: 0, failures: {}, near: {} } : null };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  /* центр текста за краем предка с overflow ≠ visible (слайд карусели за краем, заглушка Tilda за
     коробкой своего artboard) — на экране его нет: ни в контраст, ни в кегль */
  const clipped = (el) => {
    if (getComputedStyle(el).position === 'fixed') return false;
    const r = el.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const b = n.getBoundingClientRect(); if (cx < b.left - 1 || cx > b.right + 1 || cy < b.top - 1 || cy > b.bottom + 1) return true; }
      if (s.position === 'fixed') break;
    }
    return false;
  };
  let clippedCount = 0;
  /* sr-only — текст для экранного диктора, на экране его нет: обрезан своим clip rect(0 0 0 0) или
     clip-path inset(50%), или коробка тоньше 3 px (у legend.sr-only к 1 px ширины добавляются поля
     браузера, и проверка «коробка до 2×2» его пропускала — «перекрыт span, смотреть глазами») */
  const srOnly = (el) => { const s = getComputedStyle(el); if (/rect\(0(px)?,? 0(px)?/.test(s.clip) || /inset\(50%\)/.test(s.clipPath)) return true; if (s.display === 'contents') return false; const r = el.getBoundingClientRect(); return r.width <= 2 || r.height <= 2; };
  /* вне проверки контраста и кегля (со счётом и примерами — строки WARN и INFO): кегль меньше 1 px —
     скрытый текст (номер у значка «для читалки»), на экране не нарисован; логотип, --ignore и
     декоративный под aria-hidden — excludedInPage */
  const zeroFont = { n: 0, ex: [] }; const excluded = { 'aria-hidden': { n: 0, ex: [] }, 'логотип': { n: 0, ex: [] }, ignore: { n: 0, ex: [] } };
  const note = (b, el) => { b.n++; if (b.ex.length < 4) b.ex.push(`${sig(el)} «${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)}»`); };
  const allText = [...document.body.querySelectorAll('*')].filter((el) => {
    if (el instanceof SVGElement || !ownText(el) || !V(el) || srOnly(el)) return false;
    if (clipped(el)) { clippedCount++; return false; }
    if (parseFloat(getComputedStyle(el).fontSize) < 1) { note(zeroFont, el); return false; }
    const why = exc(el, ignore); if (why) { note(excluded[why], el); return false; }
    return true;
  });
  /* контраст — у всего текста (раньше молча у первых 600: бледная подпись в конце каталога не мерилась);
     предел TEXT_LIMIT только от зависания на гигантских страницах, и тогда вывод говорит «N из M (обрезано)» — WARN */
  const TEXT_LIMIT = 5000;
  const textEls = allText.slice(0, TEXT_LIMIT);
  /* картинки, лежащие не в предках текста, а рядом (карточка: фото и подпись поверх — соседи):
     если такой элемент накрывает центр текста, фон надо мерить по снимку, а не по цвету секции */
  /* Чужие подложки: картинки, видео, холсты и блоки с фоном (цвет или картинка), которые не предки и
     не потомки текста, но лежат под его центром — карточка «фото и подпись поверх» или фигура под
     текстом в Tilda Zero Block (соседи, а не предки). Тогда фон по цепочке предков неверен — по снимку.
     Слой зерна во весь экран (data-rw-grain) не в счёт: его действие учтено отображением map.
     Обычный текст сравнивается с обычными подложками в координатах документа (закреплённая плашка
     лежит под ним только на миг прокрутки). Закреплённый текст (шапка, нижняя панель) — со всеми
     подложками, и закреплёнными, и обычными, в координатах окна на текущей прокрутке (здесь — верх
     страницы): прозрачная шапка поверх фото первого экрана иначе мерилась по фону body. */
  const fixedOf = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; };
  const imgLike = [...document.body.querySelectorAll('*')].filter((e) => {
    if ((map && e.hasAttribute('data-rw-grain')) || e instanceof SVGElement || !V(e)) return false;
    if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(e.tagName)) return true;
    const s = getComputedStyle(e); const bi = s.backgroundImage;
    if (bi && bi !== 'none' && !/^linear-gradient\(rgba\(0, 0, 0, 0\)/.test(bi)) return true;
    const c = parseC(s.backgroundColor); return !!(c && c.a > 0.05);
  }).map((e, k) => { const r = e.getBoundingClientRect(); const fx = fixedOf(e); const oy = fx ? 0 : scrollY; return { e, fx, l: r.left, t: r.top + oy, r: r.right, b: r.bottom + oy, vt: r.top, vb: r.bottom, id: bgIdOf(e, k) }; });
  /* что лежит под текстом — для ключа «тот же фон»: файл картинки или постера, запись фона (картинка,
     градиент, цвет); холст, iframe и picture — сам элемент */
  function bgIdOf(e, k) {
    const s = getComputedStyle(e);
    /* кадр спрайта или сдвинутая картинка — другой участок того же файла: место и размер — в отпечатке */
    if (e.tagName === 'IMG') return `${e.currentSrc || e.src || `${sig(e)}#${k}`}|${s.objectFit}|${s.objectPosition}`;
    if (e.tagName === 'VIDEO') return `${e.currentSrc || e.poster || e.src || `${sig(e)}#${k}`}|${s.objectFit}|${s.objectPosition}`;
    if (/^(CANVAS|IFRAME|PICTURE)$/.test(e.tagName)) return `${sig(e)}#${k}`;
    return s.backgroundImage && s.backgroundImage !== 'none' ? `${s.backgroundImage}|${s.backgroundPosition}|${s.backgroundSize}` : s.backgroundColor;
  }
  /* место текста на фоне — клетка его коробки, где центр текста: по высоте не меньше 8 полос и не выше
     120 px, по ширине не меньше 4 и не шире 200 px. Одна картинка или градиент во весь блок (сверху чёрный,
     снизу белый) под подписями в разных местах — разный фон; одна и та же карточка с подписью внизу — та же клетка */
  const cell = (dx, dy, W, H) => {
    const ny = Math.max(8, Math.ceil(H / 120)), nx = Math.max(4, Math.ceil(W / 200));
    const q = (v, S, n) => Math.min(n - 1, Math.max(0, Math.floor(v / Math.max(1, S) * n)));
    return `${q(dx, W, nx)}.${q(dy, H, ny)}/${nx}x${ny}`;
  };
  const coveredByImage = (el) => {
    const r = el.getBoundingClientRect(); const fx = fixedOf(el); const cx = (r.left + r.right) / 2;
    const mine = (i) => i.e !== el && !i.e.contains(el) && !el.contains(i.e) && cx >= i.l && cx <= i.r;
    const cyV = (r.top + r.bottom) / 2, cyD = cyV + scrollY;
    const hit = fx ? imgLike.filter((i) => mine(i) && cyV >= i.vt && cyV <= i.vb) : imgLike.filter((i) => !i.fx && mine(i) && cyD >= i.t && cyD <= i.b);
    return hit.length ? { sig: hit.map((i) => sig(i.e)).join('+'), id: hit.map((i) => i.id).join('+'), place: hit.map((i) => (fx ? cell(cx - i.l, cyV - i.vt, i.r - i.l, i.vb - i.vt) : cell(cx - i.l, cyD - i.t, i.r - i.l, i.b - i.t))).join('+') } : null;
  };
  /* место текста на фоне предка (градиент, картинка фоном); вынесенный за коробку предка — полоса документа */
  const placeOn = (el, c) => {
    const r = el.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    if (c.bgEl) { const b = c.bgEl.getBoundingClientRect(); return cell(cx - b.left, cy - b.top, b.width, b.height); }
    return c.displaced ? `y${Math.floor((cy + (fixedOf(el) ? 0 : scrollY)) / 120)}` : '';
  };
  /* короткий отпечаток строки (адрес картинки data: бывает в сотни КБ) */
  const idh = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + s.length; };
  /* по снимку — у каждого элемента, до IMG_LIMIT за запуск; «одинаковые» (не больше трёх) — та же подпись
     без id, тот же цвет и тот же фон под текстом (файл картинки, запись градиента), а не класс картинки:
     карточки 4–7 афиши над другими фото раньше не мерились вовсе */
  const IMG_LIMIT = 150, IMG_SAME = 3;
  contrast.imgRepeat = { n: 0, ex: [] }; contrast.imgOverLimit = 0; contrast.imgLimit = IMG_LIMIT;
  const r2 = (v) => Math.round(v * 100) / 100;
  const add = (bucket, key, rec, example) => { const f = bucket[key] || (bucket[key] = { ...rec, count: 0, examples: [] }); f.count++; if (f.examples.length < 3) f.examples.push(example); };
  contrast.total = allText.length; contrast.considered = textEls.length;
  for (const el of textEls) {
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize); const large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700); const need = large ? 3 : 4.5;
    let c = colorsOf(el);
    if (c.transparentText) { contrast.transparentText++; continue; }
    const under = coveredByImage(el);
    if (!c.imageBg && under) c = { imageBg: true, fg: c.raw, alpha: c.alpha * c.opacity };
    const label = `${sig(el)} «${el.textContent.trim().slice(0, 30)}» ${Math.round(size)}px`;
    if (c.imageBg) {
      contrast.unknown++;
      /* ключ «не больше трёх одинаковых»: подпись без id (у карточек он у каждой свой), цвет, отпечаток фона
         под текстом — что лежит сверху (пункт меню на плашке и такой же поверх фото — разные случаи) и фон
         предка (градиент, картинка), — и место текста на этом фоне (cell): раньше шесть подписей над одним
         градиентом «сверху чёрный, снизу белый» были «повтором того же фона», и белые над белым не мерились */
      const key = sig(el).replace(/#[^.]*/, '') + '|' + hex(c.fg) + '|' + (under ? under.sig : c.displaced ? 'вынесен' : '') + '|' + idh([under ? under.id : '', c.bgId || ''].join('|')) + '|' + (under ? under.place : '') + '|' + placeOn(el, c); contrast.perSig = contrast.perSig || {}; contrast.perSig[key] = (contrast.perSig[key] || 0) + 1;
      if (contrast.perSig[key] > IMG_SAME) { contrast.imgRepeat.n++; if (contrast.imgRepeat.ex.length < 4) contrast.imgRepeat.ex.push(`${sig(el)} «${el.textContent.trim().slice(0, 24)}»`); continue; }
      if (contrast.imgList.length >= IMG_LIMIT) { contrast.imgOverLimit++; continue; }
      { const idx = contrast.imgList.length; el.setAttribute('data-rw-imgbg', idx); const fgG = grain(c.fg); contrast.imgList.push({ idx, sig: sig(el), text: el.textContent.trim().slice(0, 30), fg: hex(c.fg), fgRgb: { r: c.fg.r, g: c.fg.g, b: c.fg.b }, fgGrain: map ? { r: fgG.r, g: fgG.g, b: fgG.b } : null, alpha: r2(Math.min(1, c.alpha)), size: Math.round(size), need, fixed: fixedOf(el) }); }
      continue;
    }
    contrast.checked++;
    const tr = c.alpha < 0.999 || c.opacity < 0.999; if (tr) contrast.translucent++;
    const r = ratio(c.fg, c.bg);
    const ex = label + (tr ? `, прозрачность ${r2(c.alpha * c.opacity)}` : '');
    if (r < need) add(contrast.failures, `${hex(c.fg)} на ${hex(c.bg)}`, { ratio: r2(r), need, translucent: tr }, ex);
    else if (map) {
      contrast.grain.checked++;
      const rg = ratio(grain(c.fg), grain(c.bg));
      const key = `${hex(c.fg)} на ${hex(c.bg)}`;
      if (rg < need) add(contrast.grain.failures, key, { ratio: r2(r), ratioGrain: r2(rg), need, withGrain: `${hex(grain(c.fg))} на ${hex(grain(c.bg))}` }, ex);
      else if (rg < need * 1.1) add(contrast.grain.near, key, { ratio: r2(r), ratioGrain: r2(rg), need }, ex);
    }
  }
  /* мелкий текст: всё видимое, кроме sr-only */
  const smallText = { checked: 0, groups: {} };
  for (const el of allText) {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (r.width <= 2 || r.height <= 2 || /rect\(0(px)?,? 0(px)?/.test(s.clip) || /inset\(50%\)/.test(s.clipPath)) continue;
    smallText.checked++;
    const size = Math.round(parseFloat(s.fontSize) * 10) / 10; if (size >= 12) continue;
    add(smallText.groups, `${size}`, { size, status: size < 10 ? 'FAIL' : 'WARN' }, `${sig(el)} «${el.textContent.trim().slice(0, 24)}»`);
  }
  const imgsNoAlt = [...document.images].filter((i) => V(i) && !i.hasAttribute('alt')).map((i) => (i.currentSrc || i.src).split('/').pop().slice(0, 50)).slice(0, 10);
  const decorativeEmpty = [...document.images].filter((i) => i.getAttribute('alt') === '').length;
  const unlabeled = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')].filter((i) => V(i) && !((i.labels && i.labels.length) || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.getAttribute('title'))).map((i) => `${sig(i)}${i.placeholder ? ` (только placeholder «${i.placeholder}»)` : ''}`).slice(0, 10);
  const nameless = [...document.querySelectorAll('a, button, [role=button]')].filter((el) => V(el) && !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.querySelector('img[alt]:not([alt=""]), svg[aria-label], svg title'))).map((el) => sig(el)).slice(0, 10);
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(V).map((h) => +h.tagName[1]);
  const skips = []; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skips.push(`h${hs[i - 1]}→h${hs[i]}`);
  const vpMeta = (document.querySelector('meta[name=viewport]') || {}).content || '';
  /* цель нажатия радиокнопки и флажка — вместе с подписью: нажатие на label (обёртку или label[for])
     тоже ставит отметку. Оформленная радиокнопка (обрезана 1×1, поверх подписи) мерится по самой крупной
     из коробок — своей и подписей (крупнее — у кого больше меньшая сторона); раньше «input 1×1» при
     подписи 30+ px */
  const tapBox = (el) => {
    const r = el.getBoundingClientRect(); let best = { w: r.width, h: r.height }, lab = null;
    if (el.type === 'checkbox' || el.type === 'radio') {
      for (const lb of el.labels || []) {
        if (!V(lb)) continue; const q = lb.getBoundingClientRect(); const b = { w: q.width, h: q.height, el: lb };
        if (!lab || Math.min(b.w, b.h) > Math.min(lab.w, lab.h)) lab = b;
        if (Math.min(b.w, b.h) > Math.min(best.w, best.h)) best = b;
      }
    }
    return { w: best.w, h: best.h, lab };
  };
  const targetsAll = isMobile ? [...document.querySelectorAll('a[href], button, [role=button], input[type=checkbox], input[type=radio], summary')].filter((el) => { if (!V(el)) return false; const s = getComputedStyle(el); const inline = s.display === 'inline' && el.parentElement && /^(p|li|td|span|dd)$/i.test(el.parentElement.tagName); if (inline) return false; const b = tapBox(el); return b.w < 24 || b.h < 24; }).map((el) => { const r = el.getBoundingClientRect(); const { lab } = tapBox(el); return `${sig(el)} ${Math.round(r.width)}×${Math.round(r.height)}${lab ? ` (подпись ${sig(lab.el)} ${Math.round(lab.w)}×${Math.round(lab.h)} — тоже мельче)` : ''}`; }) : [];
  const targets = targetsAll.slice(0, 10);
  /* iOS увеличивает страницу при фокусе только на полях ввода текста (и списке select): радиокнопки,
     флажки, ползунки, выбор файла и цвета не в счёт — раньше «поля мельче 16px» ловили радиокнопки */
  const TEXT_TYPES = /^(text|email|tel|number|search|url|password|date|datetime-local|month|week|time)$/;
  const smallInputsAll = isMobile ? [...document.querySelectorAll('input, select, textarea')].filter((i) => (i.tagName !== 'INPUT' || TEXT_TYPES.test(i.type)) && V(i) && parseFloat(getComputedStyle(i).fontSize) < 16).map((el) => `${sig(el)} ${Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10}px`) : [];
  const smallInputs = smallInputsAll.slice(0, 6);
  let reduced = false; for (const sh of document.styleSheets) { try { const walk = (rs) => { for (const r of rs) { if (r.type === CSSRule.MEDIA_RULE) { if (/prefers-reduced-motion/.test(r.conditionText)) reduced = true; walk(r.cssRules); } } }; walk(sh.cssRules); } catch { /* кросс-домен */ } }
  return { contrast, smallText, clippedText: clippedCount, zeroFont, excluded, ignoreFound: ignore ? (() => { try { return document.querySelectorAll(ignore).length; } catch (e) { return -1; } })() : null, imgsNoAlt, imgsNoAltCount: [...document.images].filter((i) => V(i) && !i.hasAttribute('alt')).length, decorativeEmpty, unlabeled, nameless, headings: { count: hs.length, h1: hs.filter((h) => h === 1).length, skips }, lang: document.documentElement.lang || null, zoomBlocked: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?(\D|$)/i.test(vpMeta), positiveTabindex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length, targets, targetsCount: targetsAll.length, smallInputs, smallInputsCount: smallInputsAll.length, reducedMotionRule: reduced, autoplayVideo: [...document.querySelectorAll('video[autoplay]')].filter((v) => !v.muted).length, skipLink: !!document.querySelector('a[href^="#"][class*="skip"], a[href="#main"], a[href="#content"]'), landmarks: { main: document.querySelectorAll('main, [role=main]').length, nav: document.querySelectorAll('nav, [role=navigation]').length, header: document.querySelectorAll('header, [role=banner]').length, footer: document.querySelectorAll('footer, [role=contentinfo]').length }, iframesNoTitle: [...document.querySelectorAll('iframe')].filter((f) => !f.title).length };
}

/* ---------- закреплённый текст на прокрутке: функции страницы ---------- */

/* sticky-блок на текущей прокрутке. Он закреплён только в пределах своего контейнера (containing block —
   ближайший предок не inline): карточка товара с position:sticky внутри сетки едет вместе с сеткой, когда
   та кончается, и на секции ниже не заходит. state: 'закреплён'; 'уехал' — контейнер кончился выше места
   закрепления (у bottom — начинается ниже), блок уехал вместе с ним; 'не доехал' — ещё стоит на своём месте
   в потоке; 'не закрепляется' — нет ни top, ни bottom, или между ним и прокруткой блок с overflow ≠ visible
   (прилипает к нему, а не к окну). lo…hi — высоты прокрутки (документа или __rwScroller), на которых он
   закреплён; hi null — до конца страницы. Место в потоке известно, только если блок стоит на нём сейчас
   (иначе lo 0 или hi null — с запасом). Свой transform (шапка, спрятанная сдвигом при прокрутке вниз)
   «уехал» не даёт: это считается по коробке контейнера и offsetHeight, а не по коробке блока. null — не
   sticky или внутри fixed-предка, или вне __rwScroller (такой документ не едет): закреплён всегда, как fixed */
function stickyInPage(host) {
  const hs = getComputedStyle(host); if (hs.position !== 'sticky') return null;
  const sc = window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller : null;
  if (sc && !sc.contains(host)) return null;
  for (let n = host.parentElement; n && n !== sc && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.position === 'fixed') return null;
    if (!/^(visible|clip)$/.test(s.overflowX) || !/^(visible|clip)$/.test(s.overflowY)) return { state: 'не закрепляется', why: `прилипает к ${sig(n)} (overflow ${s.overflowX} ${s.overflowY}), а не к окну`, lo: null, hi: null };
  }
  const rTop = sc ? sc.getBoundingClientRect().top + sc.clientTop : 0, rH = sc ? sc.clientHeight : innerHeight;
  const cur = sc ? sc.scrollTop : scrollY;
  const len = (v) => (v === 'auto' ? null : /%$/.test(v) ? parseFloat(v) / 100 * rH : parseFloat(v));
  const top = len(hs.top), bottom = len(hs.bottom);
  if (top == null && bottom == null) return { state: 'не закрепляется', why: 'нет ни top, ни bottom', lo: null, hi: null };
  let cb = host.parentElement; while (cb && cb !== document.documentElement && /^(inline|contents)$/.test(getComputedStyle(cb).display)) cb = cb.parentElement;
  if (!cb) return null;
  const cr = cb.getBoundingClientRect(), cs = getComputedStyle(cb);
  const cT = cr.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop), cB = cr.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
  const H = host.offsetHeight, mt = parseFloat(hs.marginTop) || 0, mb = parseFloat(hs.marginBottom) || 0;
  const hr = host.getBoundingClientRect(); const doc = (v) => v - rTop + cur;
  const plain = [hs.transform, hs.translate, hs.scale, hs.rotate].every((v) => !v || v === 'none');
  /* место в потоке запоминается на узле (__rwStickN), когда блок стоит на нём: на верху страницы
     fixedTextInPage спрашивает все sticky, и карточка, чей текст наверху был за окном, не теряет его */
  if (top != null) {
    const spot = rTop + top; const below = plain && hr.top > spot + 1.5;
    if (below) host.__rwStickN = doc(hr.top);
    return { state: cB - mb - H < spot - 1.5 ? 'уехал' : below ? 'не доехал' : 'закреплён', top, bottom: null, rTop, rH, lo: host.__rwStickN != null ? host.__rwStickN - top : 0, hi: doc(cB) - mb - H - top };
  }
  const spot = rTop + rH - bottom; const above = plain && hr.bottom < spot - 1.5;
  if (above) host.__rwStickNB = doc(hr.bottom);
  return { state: cT + mt + H > spot + 1.5 ? 'уехал' : above ? 'не доехал' : 'закреплён', top: null, bottom, rTop, rH, lo: doc(cT) + mt + H + bottom - rH, hi: host.__rwStickNB != null ? host.__rwStickNB + bottom - rH : null };
}

/* своя подложка текста закреплённого блока: фоны по цепочке от текста до хозяина (host, включительно) до
   первого непрозрачного. Над подложкой текст лежит всегда, на любой высоте прокрутки, — фон секции под
   блоком ему не важен. null — подложки нет (цепочка прозрачна), на пути картинка или градиент, где-то в
   предках mix-blend-mode, подложка полупрозрачна как группа (opacity), центр текста вне её коробки.
   Подложка не берётся (null), если между ней и текстом что-то нарисовано: ::before или ::after с фоном у
   звена цепочки от текста до подложки, накрывающий текст (не меньше половины его ширины и высоты: полоска
   подчёркивания и точка-значок — не в счёт), или другой потомок подложки с фоном или картинкой под центром
   текста (дочерний слой) — цвет подложки тогда не фон текста. exact — подложка непрозрачна: b0 — её цвет, f —
   цвет текста над ней (с альфой и opacity текста). Иначе подложка полупрозрачна: b0 и b1 — она над чёрным и
   над белым, f — цвет текста (только непрозрачный текст, иначе null); ratio — худший случай между ними (1,
   если яркость текста между ними). self — подложка у самого текста (пилюля): её подпись в выводе не нужна */
function plateInPage(el, host) {
  const layers = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.backgroundImage && s.backgroundImage !== 'none') return null;
    const c = hexc(s.backgroundColor); const a = c ? (c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1) : 0;
    if (a > 0.004) { layers.push({ n, r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16), a }); if (a >= 0.99) break; }
    if (n === host) break;
  }
  if (!layers.length) return null;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const m = getComputedStyle(n).mixBlendMode; if (m && m !== 'normal') return null; }
  const pe = layers[layers.length - 1].n; if (eff(pe) < 0.99) return null;
  const r = el.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
  if (pe !== el) {
    const q = pe.getBoundingClientRect();
    if (cx < q.left - 1 || cx > q.right + 1 || cy < q.top - 1 || cy > q.bottom + 1) return null;
  }
  /* слои между подложкой и текстом: псевдоэлементы звеньев цепочки (размер — используемый, Chrome отдаёт его
     в px; «auto» — считается накрывающим) и чужие потомки подложки под центром текста */
  const paints = (s) => { const c = hexc(s.backgroundColor); const a = c ? (c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1) : 0; return a > 0.004 || (!!s.backgroundImage && s.backgroundImage !== 'none'); };
  const chain = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { chain.push(n); if (n === pe) break; }
  for (const n of chain) {
    for (const w of ['::before', '::after']) {
      const s = getComputedStyle(n, w);
      if (!s.content || s.content === 'none' || s.content === 'normal' || s.display === 'none' || s.visibility !== 'visible' || parseFloat(s.opacity) <= 0.05 || !paints(s)) continue;
      const pw = parseFloat(s.width), ph = parseFloat(s.height);
      if (!(pw < r.width * 0.5 || ph < r.height * 0.5)) return null;
    }
  }
  const inner = pe.querySelectorAll('*'); if (inner.length > 1500) return null;
  for (const d of inner) {
    if (chain.includes(d) || el.contains(d) || d.contains(el)) continue;
    const q = d.getBoundingClientRect(); if (q.width < 1 || q.height < 1 || cx < q.left || cx > q.right || cy < q.top || cy > q.bottom) continue;
    const s = getComputedStyle(d); if (s.visibility !== 'visible' || eff(d) <= 0.05) continue;
    if (/^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|SVG)$/i.test(d.tagName) || paints(s)) return null;
  }
  const s = getComputedStyle(el); const fill = s.webkitTextFillColor; const c = hexc(fill && fill !== s.color ? fill : s.color); if (!c) return null;
  const fg = { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
  const ta = Math.min(1, (c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1) * eff(el));
  const comp = (base) => layers.reduceRight((o, L) => ({ r: L.r * L.a + o.r * (1 - L.a), g: L.g * L.a + o.g * (1 - L.a), b: L.b * L.a + o.b * (1 - L.a) }), base);
  const b0 = comp({ r: 0, g: 0, b: 0 }), b1 = comp({ r: 255, g: 255, b: 255 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rt = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const hx = (o) => '#' + [o.r, o.g, o.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const size = parseFloat(s.fontSize); const need = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700) ? 3 : 4.5;
  const exact = layers[layers.length - 1].a >= 0.99;
  const base = { plate: sig(pe), self: pe === el, fgHex: hx(fg), size, need, alpha: ta };
  if (exact) { const f = { r: fg.r * ta + b0.r * (1 - ta), g: fg.g * ta + b0.g * (1 - ta), b: fg.b * ta + b0.b * (1 - ta) }; return { ...base, exact: true, f, b0, b1: b0, ratio: rt(lum(f), lum(b0)), bgHex: hx(b0) }; }
  if (ta < 0.99) return null;
  const Lf = lum(fg), L0 = lum(b0), L1 = lum(b1);
  return { ...base, exact: false, f: fg, b0, b1, ratio: Lf >= Math.min(L0, L1) && Lf <= Math.max(L0, L1) ? 1 : Math.min(rt(Lf, L0), rt(Lf, L1)), bgHex: `${hx(b0)}…${hx(b1)}` };
}

/* текст в блоках position: fixed или sticky, видимый в окне сейчас: метка data-rw-fx=<номер>.
   Повторный вызов добавляет только новые (шапка, ставшая fixed после прокрутки). band — где по
   высоте окна стоит центр текста, когда блок закреплён (у sticky — по его top или bottom). У sticky
   ещё lo…hi — высоты прокрутки, на которых он закреплён (stk), и never — не закрепляется нигде
   (участок короче 8 px): такие высоты мерить незачем, там это обычный текст своей секции */
function fixedTextInPage({ limit, ignore }) {
  /* «за краем» — по видимой области (visualViewport), а не по окну раскладки: у dir=rtl шире экрана на
     телефоне окно раскладки 820, а видно 320 — текст на 320…820 на снимок не попадал и потом числился
     «вне окна» (шум в WARN). band — по-прежнему в пределах innerHeight: это высота прокрутки окна */
  const vv = window.visualViewport;
  const VX = vv ? vv.offsetLeft : 0, VY = vv ? vv.offsetTop : 0;
  const vw = vv ? VX + vv.width : innerWidth, vh = innerHeight, vb = vv ? VY + vv.height : innerHeight;
  const pinned = (n) => { const p = getComputedStyle(n).position; return p === 'fixed' || p === 'sticky'; };
  const hosts = document.body ? [...document.body.querySelectorAll('*')].filter(pinned) : [];
  /* место в потоке — у всех sticky, и у тех, чей текст сейчас за окном (stk запоминает его на узле) */
  for (const h of hosts) if (getComputedStyle(h).position === 'sticky') stk(h);
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  const hostOf = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (pinned(n)) return n; return null; };
  const kindOf = (el, host) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { if (n.tagName === 'NAV' || n.getAttribute('role') === 'navigation') return 'меню'; if (n === host) break; }
    const c = (typeof host.className === 'string' ? host.className : '') + ' ' + (host.id || ''); const role = host.getAttribute('role') || '';
    if (host.tagName === 'HEADER' || role === 'banner' || /head|top/i.test(c)) return 'шапка';
    if (/nav|menu|tab/i.test(c)) return 'меню';
    if (host.tagName === 'FOOTER' || /foot|bottom/i.test(c)) return 'нижняя панель';
    return 'закреплённый блок';
  };
  /* центр за краем предка с overflow ≠ visible (закрытое выпадающее меню: max-height 0 и overflow
     hidden) — на экране текста нет; как clipped в domInPage */
  const clipped = (el, cx, cy) => {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const b = n.getBoundingClientRect(); if (cx < b.left - 1 || cx > b.right + 1 || cy < b.top - 1 || cy > b.bottom + 1) return true; }
      if (s.position === 'fixed') break;
    }
    return false;
  };
  /* между текстом и закреплённым блоком — лента, прокручиваемая по горизонтали (overflow-x auto/scroll) */
  const hScroll = (el, host) => { for (let n = el.parentElement; n && n.nodeType === 1; n = n.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true; if (n === host) break; } return false; };
  const seen = new Set(); const found = [];
  for (const h of hosts) {
    for (const el of [h, ...h.querySelectorAll('*')]) {
      if (seen.has(el)) continue; seen.add(el);
      if (el instanceof SVGElement || el.hasAttribute('data-rw-fx') || !ownText(el) || !vis(el)) continue;
      const r = el.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) continue; /* sr-only */
      /* скрытый текст кеглем 0, логотип, --ignore и декоративный под aria-hidden — вне проверки, как в основном проходе */
      if (parseFloat(getComputedStyle(el).fontSize) < 1 || exc(el, ignore)) continue;
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      const host = hostOf(el);
      /* за краем видимой области (закрытое меню) или обрезан предком — не берётся; кроме пилюли ленты,
         прокручиваемой по горизонтали, на своей непрозрачной подложке: её контраст от прокрутки не зависит
         и мерится по подложке (лента на нижних высотах уезжает к активному разделу) */
      const away = cx < VX || cy < VY || cx > vw || cy > vb || clipped(el, cx, cy);
      if (away && !(hScroll(el, host) && (plt(el, host) || {}).exact)) continue;
      const hs = getComputedStyle(host); const hr = host.getBoundingClientRect();
      let band = cy; const k = hs.position === 'sticky' ? stk(host) : null;
      /* место sticky в окне — от верха прокрутки (окна или блока __rwScroller) */
      if (k && k.top != null) band = k.rTop + k.top + (cy - hr.top); else if (k && k.bottom != null) band = k.rTop + k.rH - k.bottom - (hr.bottom - cy);
      band = Math.max(1, Math.min(vh - 1, band));
      const never = !!k && (k.state === 'не закрепляется' || (k.hi != null && k.hi - Math.max(0, k.lo) < 8));
      found.push({ el, host, pos: hs.position, band, stick: k, never, area: hr.width * hr.height, key: sig(el).replace(/#[^.]*/, '') + '|' + (hexc(getComputedStyle(el).color) || '') + '|' + sig(host) });
    }
  }
  const total = found.length;
  /* больше предела: сначала мелкие блоки (шапка и меню раньше закреплённых секций), не больше трёх одинаковых */
  let take = found;
  if (found.length > limit) { const per = {}; take = [...found].sort((a, b) => a.area - b.area).filter((f) => (per[f.key] = (per[f.key] || 0) + 1) <= 3).slice(0, Math.max(0, limit)); }
  let n = window.__rwFxN || 0; const items = [];
  for (const f of take) {
    const idx = n++; f.el.setAttribute('data-rw-fx', idx);
    /* хозяин sticky — ссылкой на узле (DOM не меняется): на каждой высоте fixedStateInPage спрашивает stk(хозяин);
       хозяин любого закреплённого — __rwFxPin: до него ищется своя подложка (plt) */
    if (f.stick) f.el.__rwFxHost = f.host;
    f.el.__rwFxPin = f.host;
    const st = f.stick ? { lo: Math.round(Math.max(0, f.stick.lo ?? 0)), hi: f.stick.hi == null ? null : Math.round(f.stick.hi), never: f.never, why: f.stick.why || null } : null;
    items.push({ idx, sig: sig(f.el), text: f.el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30), host: sig(f.host), kind: kindOf(f.el, f.host), pos: f.pos, band: Math.round(f.band), ...(st ? { sticky: st } : {}) });
  }
  window.__rwFxN = n;
  return { items, total };
}

/* секции страницы (метка data-rw-sec) с фоном и положением в документе; высоты прокрутки */
function sectionsInPage() {
  const sc = window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller : null;
  const cur = sc ? sc.scrollTop : scrollY;
  const docH = sc ? sc.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  /* ширина экрана для отбора секций — меньшая из ширины видимой области и clientWidth корня, а не
     innerWidth: у страницы шире экрана окно раскладки 820 px при экране и секциях 320 (половина — 410,
     секции не проходили), у уменьшенной без initial-scale видимая область 1020 px при секциях 320 */
  const viewH = sc ? sc.clientHeight : innerHeight;
  const vw = Math.min(...[innerWidth, window.visualViewport ? window.visualViewport.width : 0, document.documentElement.clientWidth].filter((w) => w > 0));
  const skip = /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|BR)$/;
  const kids = (n) => [...n.children].filter((c) => {
    if (skip.test(c.tagName) || c.hasAttribute('data-rw-grain')) return false;
    const s = getComputedStyle(c); if (s.display === 'none' || s.position === 'fixed' || s.position === 'absolute') return false;
    const r = c.getBoundingClientRect();
    if (s.position === 'sticky' && r.height < viewH * 0.5) return false; /* закреплённая шапка — не секция */
    return r.height >= 1 && r.width >= vw * 0.5;
  });
  /* обёртки во всю высоту (main, #allrecords …) раскрываются в их детей */
  const expand = (n, depth) => { const out = []; for (const c of kids(n)) { const h = c.getBoundingClientRect().height; if (depth < 6 && h >= docH * 0.6 && h > viewH * 1.5 && kids(c).length >= 1) out.push(...expand(c, depth + 1)); else out.push(c); } return out; };
  const probe = (n) => {
    const s = getComputedStyle(n); const bi = s.backgroundImage;
    if (bi && bi !== 'none' && !/^linear-gradient\(rgba\(0, 0, 0, 0\)/.test(bi)) return 'картинка';
    const c = hexc(s.backgroundColor); if (c && (c.length === 7 || parseInt(c.slice(7, 9), 16) > 12)) return c.slice(0, 7);
    return null;
  };
  const bgOf = (sec) => {
    const own = probe(sec); if (own) return own;
    const R = sec.getBoundingClientRect(); const area = R.width * R.height; let k = 0;
    for (const d of sec.querySelectorAll('*')) {
      if (++k > 400) break;
      const r = d.getBoundingClientRect(); if (r.width * r.height < area * 0.5) continue;
      if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(d.tagName)) return 'картинка';
      const p = probe(d); if (p) return p;
    }
    return 'фон страницы';
  };
  /* прокручивается блок во весь экран (body{overflow:hidden}, .app{overflow:auto}) — секции в нём,
     координаты — от начала его содержимого; scTop — где его верх в окне (полосы считаются от него) */
  const scTop = sc ? sc.getBoundingClientRect().top : 0;
  const list = sc ? expand(sc, 0) : document.body ? expand(document.body, 0) : [];
  const sections = list.map((el, i) => {
    el.setAttribute('data-rw-sec', i); const r = el.getBoundingClientRect();
    const hd = el.querySelector('h1,h2,h3'); const t = (hd ? hd.textContent : '').trim().replace(/\s+/g, ' '); const title = t.length > 30 ? t.slice(0, 29).trimEnd() + '…' : t;
    return { i, sig: sig(el), title, top: Math.round(r.top - scTop + cur), bottom: Math.round(r.bottom - scTop + cur), bg: bgOf(el) };
  });
  return { sections, docH: Math.round(docH), viewH, scTop: Math.round(scTop), maxScroll: Math.max(0, Math.round(docH - viewH)), scroller: sc ? sig(sc) : null };
}

/* состояние помеченного закреплённого текста на текущей высоте: виден ли, цвет сейчас, коробки строк */
function fixedStateInPage({ ids }) {
  const sc = window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller : null;
  const at = Math.round(sc ? sc.scrollTop : scrollY);
  const sg = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : '');
  const secs = [...document.querySelectorAll('[data-rw-sec]')];
  /* видимая область (visualViewport): снимок окна — это она, а не окно раскладки. Коробки строк — в
     координатах окна раскладки; у страницы без meta viewport (или с width=1000) на телефоне видимая
     область 980–1000 px шириной, а не 390, а у страницы с контентом шире экрана при initial-scale=1
     окно раскладки шире и выше видимой области (354×629 против 320×568) — нижняя панель у его низа
     на снимок не попадает */
  const vv = window.visualViewport;
  const VX = vv ? vv.offsetLeft : 0, VY = vv ? vv.offsetTop : 0, VW = vv ? vv.width : innerWidth, VH = vv ? vv.height : innerHeight;
  const inView = (x, y) => x >= VX && y >= VY && x <= VX + VW && y <= VY + VH;
  const out = ids.map((i) => {
    const el = document.querySelector(`[data-rw-fx="${i}"]`); if (!el) return { i, state: 'нет' };
    /* sticky не на месте закрепления — уехал вместе со своим контейнером или ещё стоит в потоке: на этой
       высоте он обычный текст своей секции (его контраст — в основном проходе), а не пропуск замера */
    const host = el.__rwFxHost;
    if (host && host.isConnected) { const k = stk(host); if (k && k.state !== 'закреплён') return { i, state: 'не закреплён', why: k.state }; }
    if (!vis(el)) return { i, state: 'скрыт' };
    /* своя подложка (plateInPage) — только для текста, которого на снимке этой высоты нет: за краем ленты
       («обрезан»), вне окна, под перекрывшим окном. Полупрозрачная — только если худший случай проходит норму.
       seen — что было без подложки (обрезан, вне окна, перекрыт). Видимый текст мерится по снимку (ниже) */
    const pin = el.__rwFxPin && el.__rwFxPin.isConnected ? el.__rwFxPin : null;
    let pl; const plate = () => (pl === undefined ? (pl = pin ? plt(el, pin) : null) : pl);
    /* now — подпись элемента на этой высоте: классы меняются при прокрутке (активная пилюля), а подпись в
       списке снята наверху — «a.chip.is-active «Закуски»» на высоте, где активна уже другая */
    const viaPlate = (seen) => { const p = plate(); return p && (p.exact || p.ratio >= p.need) ? { i, state: 'подложка', now: sig(el), seen, ratio: p.ratio, exact: p.exact, f: p.f, b0: p.b0, b1: p.b1, hex: p.fgHex, bg: p.bgHex, plate: p.plate, self: p.self, size: p.size, need: p.need, alpha: p.alpha } : null; };
    /* коробки строк тянутся на всю длину текста, и за край блока с overflow ≠ visible (многоточие,
       max-width) — там букв нет, на снимке под ними страница за плашкой. Коробки обрезаются по самому
       элементу и предкам с overflow; на absolute/fixed цепочка кончается (предки выше его не режут) */
    const cb = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity };
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display !== 'inline' && s.display !== 'contents' && (s.overflowX !== 'visible' || s.overflowY !== 'visible')) {
        const q = n.getBoundingClientRect();
        if (s.overflowX !== 'visible') { cb.l = Math.max(cb.l, q.left); cb.r = Math.min(cb.r, q.right); }
        if (s.overflowY !== 'visible') { cb.t = Math.max(cb.t, q.top); cb.b = Math.min(cb.b, q.bottom); }
      }
      if (s.position === 'fixed' || s.position === 'absolute') break;
    }
    const rects = []; let raw = 0;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || n.textContent.trim().length < 2) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r0 of rg.getClientRects()) {
        if (r0.width <= 1 || r0.height <= 1) continue; raw++;
        const x0 = Math.max(r0.left, cb.l), y0 = Math.max(r0.top, cb.t), x1 = Math.min(r0.right, cb.r), y1 = Math.min(r0.bottom, cb.b);
        if (x1 - x0 > 1 && y1 - y0 > 1) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    if (!raw) return { i, state: 'скрыт' };
    if (!rects.length) return viaPlate('обрезан') || { i, state: 'обрезан' };
    const l = Math.min(...rects.map((r) => r.x)), t = Math.min(...rects.map((r) => r.y)), rr = Math.max(...rects.map((r) => r.x + r.w)), b = Math.max(...rects.map((r) => r.y + r.h));
    const cx = (l + rr) / 2, cy = (t + b) / 2;
    if (!inView(cx, cy)) return viaPlate('вне окна') || { i, state: 'вне окна' };
    /* точка проверки — середина первой строки в видимой области (середина блока из двух строк может
       прийтись на просвет между ними). pointer-events у текста на время проверки — auto инлайном с
       !important (перебивает и правило сайта с !important): elementsFromPoint не видит pointer-events: none */
    const hr = rects.find((r) => inView(r.x + r.w / 2, r.y + r.h / 2)) || rects[0];
    const hx = hr.x + hr.w / 2, hy = hr.y + hr.h / 2;
    const pe = [el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events')];
    el.style.setProperty('pointer-events', 'auto', 'important');
    let hit = false;
    try {
      for (const n of document.elementsFromPoint(hx, hy)) {
        if (n === el || el.contains(n)) { hit = true; break; }
        /* предок нашёлся раньше самого текста — в этой точке текст не нарисован: обрезан предком
           (overflow, clip-path), на снимке его нет */
        if (n.contains(el)) break;
        const s = getComputedStyle(n); const c = hexc(s.backgroundColor); const a = c ? (c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1) : 0;
        if (/^(IMG|VIDEO|CANVAS|IFRAME)$/.test(n.tagName) || s.backgroundImage !== 'none' || a >= 0.99) return viaPlate('перекрыт') || { i, state: 'перекрыт', by: sg(n) };
      }
    } finally { if (pe[0]) el.style.setProperty('pointer-events', pe[0], pe[1]); else el.style.removeProperty('pointer-events'); }
    if (!hit) return viaPlate('обрезан') || { i, state: 'обрезан' };
    /* видимый текст — по снимку, как раньше, и при своей подложке: на снимке есть всё, что лежит между подложкой
       и текстом (светлый ::before шапки после прокрутки, дочерний слой, картинка); подложка — только вместо
       «обрезан», «вне окна» и «перекрыт», где снимка нет. Раньше и видимый мерился по подложке: шапка #111 со
       светлым ::before поверх давала OK 18.88:1 вместо FAIL 1.18:1 */
    /* смешение с фоном (mix-blend-mode у самого текста или предка): текст рисуется смешанным цветом */
    let blend = 'normal';
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const m = getComputedStyle(n).mixBlendMode; if (m && m !== 'normal') { blend = m; break; } }
    const s = getComputedStyle(el); const fill = s.webkitTextFillColor; const c = hexc(fill && fill !== s.color ? fill : s.color);
    if (!c) return { i, state: 'прозрачный цвет' };
    const fa = c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1;
    let sec = null; for (const n of secs) { const r = n.getBoundingClientRect(); if (cy >= r.top && cy < r.bottom && cx >= r.left && cx <= r.right) sec = Number(n.getAttribute('data-rw-sec')); }
    const size = parseFloat(s.fontSize);
    return { i, state: 'виден', now: sig(el), fg: { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) }, hex: c.slice(0, 7), alpha: Math.min(1, fa * eff(el)), size, need: size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700) ? 3 : 4.5, rects, sec, blend };
  });
  /* iw — ширина видимой области в CSS-пикселях (масштаб снимка считается от неё), ox, oy — её смещение
     в окне раскладки (на него сдвигаются коробки строк перед выборкой пикселей) */
  return { at, iw: VW, ox: VX, oy: VY, items: out };
}

/* исходное положение видимой области — снимается сразу после открытия страницы, до всякой прокрутки.
   Запоминается только отрицательный scrollX окна раскладки (так бывает лишь у dir=rtl: у страницы с
   письмом справа налево шире экрана на телефоне scrollX −500, и это покой, а не сдвиг); сдвиг видимой
   области внутри окна раскладки не запоминается — в покое он 0, 0 и у dir=rtl. Иначе запоминался
   сдвиг, который страница сделала сама при загрузке (фокус на кнопке закреплённого баннера cookie,
   autofocus, адрес с #якорем, scrollIntoView: offsetTop 888 или 61, offsetLeft 500), resetView
   возвращал видимую область туда же, прозрачная шапка на всех высотах оставалась «вне окна», и её
   FAIL становился WARN «замеров 0» или ложным OK по баннеру. У обычной страницы — 0, 0, 0 */
function viewRestInPage() {
  return { sx: Math.min(0, scrollX), ol: 0, ot: 0 };
}

/* видимая область на исходное место (viewRestInPage). scrollIntoView (замер текста на картинке) на
   странице с контентом шире экрана сдвигает видимую область внутри окна раскладки
   (visualViewport.offsetLeft/offsetTop: 390,516 на телефоне), а window.scrollTo — и lib.scrollToY — этот
   сдвиг не сбрасывают: на всех следующих высотах шапка выходила «вне окна». Сбрасывать — к исходному
   положению, а не к началу корня: у dir=rtl шире экрана в покое scrollX −500, и scrollIntoView корня
   уносил видимую область на 500 px вбок — шапка уходила со снимка. Порядок: уже на месте — ничего;
   scrollTo по горизонтали (и наверх — высоту потом ставит scrollToY); сдвиг видимой области остался —
   scrollIntoView корня, если исходное место — начало страницы (как раньше, без правки DOM), иначе
   временного невидимого блока размером с видимую область на исходном месте (блок тут же убирается).
   Возвращает, чем сброшено: false — не понадобилось, иначе способ и совпало ли с исходным */
function resetViewInPage({ rest }) {
  const vv = window.visualViewport; const r = rest || { sx: 0, ol: 0, ot: 0 };
  const now = () => ({ sx: scrollX, ol: vv ? vv.offsetLeft : 0, ot: vv ? vv.offsetTop : 0 });
  const same = (a) => Math.abs(a.sx - r.sx) <= 0.5 && Math.abs(a.ol - r.ol) <= 0.5 && Math.abs(a.ot - r.ot) <= 0.5;
  if (same(now())) return false;
  scrollTo({ left: r.sx, top: 0, behavior: 'instant' });
  if (same(now()) || !vv) return { how: 'scrollTo', ok: same(now()) };
  /* исходное место видимой области в координатах документа: левый верх — (r.sx + r.ol, r.ot) */
  if (Math.abs(r.sx + r.ol) <= 0.5 && Math.abs(r.ot) <= 0.5) {
    document.documentElement.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' });
    if (same(now())) return { how: 'корень', ok: true };
  }
  const d = document.createElement('div'); const set = (k, v) => d.style.setProperty(k, v, 'important');
  for (const [k, v] of [['position', 'absolute'], ['display', 'block'], ['margin', '0'], ['padding', '0'], ['border', '0'], ['transform', 'none'], ['visibility', 'hidden'], ['pointer-events', 'none'], ['width', `${vv.width}px`], ['height', `${vv.height}px`], ['left', '0px'], ['top', '0px']]) set(k, v);
  /* в <html>, не в body: наблюдатели DOM сайта (MutationObserver) обычно смотрят body; на <html> — увидят один узел */
  document.documentElement.appendChild(d);
  try {
    /* содержащий блок может быть не корнем (body{position:relative}) — положение поправляется по замеру */
    const q = d.getBoundingClientRect();
    set('left', `${r.sx + r.ol - scrollX - q.left}px`); set('top', `${r.ot - scrollY - q.top}px`);
    d.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' });
  } finally { d.remove(); }
  return { how: 'блок', ok: same(now()) };
}
/* rest — исходное положение (заполняется сразу после открытия); resets, failed, how — для протокола */
const viewReset = { rest: null, resets: 0, failed: 0, how: {} };
const resetView = async (page) => {
  const r = await page.evaluate(resetViewInPage, { rest: viewReset.rest }).catch(() => null);
  if (r) { viewReset.resets++; viewReset.how[r.how] = (viewReset.how[r.how] || 0) + 1; if (!r.ok) viewReset.failed++; }
  return r;
};

/* ---------- закреплённый текст на прокрутке: высоты и замер ---------- */
const FX_MAX_POS = 8, FX_LIMIT = 40;

/* высоты прокрутки: полоса закреплённого текста над секцией — её середина под полосой. Полоса —
   { b: высота в окне, lo, hi: высоты прокрутки, на которых текст там стоит } (fixed — вся страница,
   sticky — пока не уехал со своим контейнером; с запасом 4 px от краёв участка). Сначала каждый фон
   секций, которого полосы не касались наверху (там мерит основной проход), затем остальные секции
   (подряд идущие с одним фоном — одна); жадно, не больше max */
const BAND_PAD = 4;
function pickPositions(bands, secs, maxScroll, max) {
  if (!secs.length || maxScroll < 1) return [];
  const at = (y, e) => { if (y < e.lo + BAND_PAD || y > e.hi - BAND_PAD) return null; const d = y + e.b; let s = null; for (const x of secs) if (d >= x.top && d < x.bottom) s = x; return s; };
  const runOf = new Map(); let run = -1, prev = null;
  for (const s of secs) { if (!prev || prev.bg !== s.bg) run++; runOf.set(s.i, run); prev = s; }
  const keysAt = (y) => { const k1 = new Set(), k2 = new Set(); for (const e of bands) { const s = at(y, e); if (!s) continue; k1.add(`${e.b}|${s.bg}`); k2.add(`${e.b}|${runOf.get(s.i)}`); } return { k1, k2 }; };
  const cands = [];
  for (const e of bands) for (const s of secs) {
    const lo = Math.max(1, Math.ceil(s.top - e.b), Math.ceil(e.lo + BAND_PAD)), hi = Math.min(maxScroll, Math.floor(s.bottom - e.b - 1), Math.floor(e.hi - BAND_PAD));
    if (lo > hi) continue;
    const y = Math.round(Math.min(hi, Math.max(lo, (s.top + s.bottom) / 2 - e.b)));
    if (!cands.some((c) => Math.abs(c.y - y) < 16)) cands.push({ y, ...keysAt(y) });
  }
  const top = keysAt(0); const got = { k1: new Set(top.k1), k2: new Set(top.k2) }; const chosen = [];
  for (const level of ['k1', 'k2']) {
    while (chosen.length < max) {
      let best = null, gain = 0;
      for (const c of cands) { if (chosen.includes(c)) continue; const g = [...c[level]].filter((k) => !got[level].has(k)).length; if (g > gain) { best = c; gain = g; } }
      if (!best) break;
      chosen.push(best); for (const k of best.k1) got.k1.add(k); for (const k of best.k2) got.k2.add(k);
    }
  }
  return chosen.map((c) => c.y).sort((a, b) => a - b);
}

/* пиксели снимка внутри коробок строк (CSS-пиксели окна × k), не больше ~4000 */
function sampleRects(data, info, rects, k, maxN = 4000) {
  const W = info.width, H = info.height, ch = info.channels; const boxes = []; let area = 0;
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x * k)), y0 = Math.max(0, Math.floor(r.y * k)), x1 = Math.min(W, Math.ceil((r.x + r.w) * k)), y1 = Math.min(H, Math.ceil((r.y + r.h) * k));
    if (x1 > x0 && y1 > y0) { boxes.push([x0, y0, x1, y1]); area += (x1 - x0) * (y1 - y0); }
  }
  const stride = Math.max(1, Math.floor(area / maxN)); const px = []; let n = 0;
  for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (n++ % stride) continue; const i = (y * W + x) * ch; px.push([data[i], data[i + 1], data[i + 2]]); }
  return px;
}

async function fixedOnScroll(page, map) {
  const lumRgb = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const f1 = (pts, c) => (c <= 128 ? pts[0] + (pts[1] - pts[0]) * c / 128 : pts[1] + (pts[2] - pts[1]) * (c - 128) / 127);
  const r2 = (v) => Math.round(v * 100) / 100;
  /* mix-blend-mode текста (каналы 0…1: b — фон под текстом, s — цвет текста); остальные режимы не мерятся */
  const BLEND = {
    multiply: (b, c) => b * c, screen: (b, c) => b + c - b * c,
    overlay: (b, c) => (b <= 0.5 ? 2 * b * c : 1 - 2 * (1 - b) * (1 - c)), 'hard-light': (b, c) => (c <= 0.5 ? 2 * b * c : 1 - 2 * (1 - b) * (1 - c)),
    darken: (b, c) => Math.min(b, c), lighten: (b, c) => Math.max(b, c), difference: (b, c) => Math.abs(b - c), exclusion: (b, c) => b + c - 2 * b * c,
    'color-dodge': (b, c) => (b <= 0 ? 0 : c >= 1 ? 1 : Math.min(1, b / (1 - c))), 'color-burn': (b, c) => (b >= 1 ? 1 : c <= 0 ? 0 : 1 - Math.min(1, (1 - b) / c)),
  };
  /* замер текста на картинке перед этим мог сдвинуть видимую область (scrollIntoView) — на место */
  await resetView(page);
  await scrollToY(page, 0); await sleep(400);
  const scan = await evaluateWith(page, sectionsInPage, null, DEPS);
  const a = await evaluateWith(page, fixedTextInPage, { limit: FX_LIMIT, ignore: IGNORE }, FX_DEPS);
  let b = { items: [], total: 0 };
  if (scan.maxScroll > 0 && a.items.length < FX_LIMIT) {
    await scrollToY(page, Math.min(scan.viewH, scan.maxScroll)); await sleep(500); await settleAnimations(page, 1500);
    b = await evaluateWith(page, fixedTextInPage, { limit: FX_LIMIT - a.items.length, ignore: IGNORE }, FX_DEPS);
  }
  const items = [...a.items, ...b.items];
  /* byPlate — замеров по своей подложке (без снимка), plateAway — из них текст на той высоте за краем ленты,
     вне окна или перекрыт (цвет свой — фон под блоком не важен) */
  const out = { items, total: a.total + b.total, sections: scan.sections, docH: scan.docH, maxScroll: scan.maxScroll, positions: [], how: '', results: [], failures: [], skipped: { 'скрыт': 0, 'вне окна': 0, 'перекрыт': 0, 'обрезан': 0, 'прозрачный цвет': 0, 'смешение цвета': 0, 'вне снимка': 0, 'нет': 0, 'не закреплён': 0, 'подложка с зерном': 0 }, measured: 0, byPlate: 0, plateAway: 0, worst: null };
  if (!items.length) return { ...out, none: true };
  if (!sharp) return { ...out, error: 'нет sharp — снимки фона не разобрать' };
  /* полосы: высота в окне и участок прокрутки, где текст там стоит. fixed и sticky, закреплённый с верха
     страницы, — вся страница; sticky внутри контейнера — только пока контейнер не кончился (lo…hi);
     sticky, который не закрепляется нигде (never), полос не даёт: на других высотах это обычный текст */
  const bandMap = new Map();
  for (const it of items) {
    if (it.sticky && it.sticky.never) continue;
    const b = Math.round((it.band - (scan.scTop || 0)) / 8) * 8;
    const lo = it.sticky && it.sticky.lo > 0 ? it.sticky.lo : -Infinity, hi = it.sticky && it.sticky.hi != null ? it.sticky.hi : Infinity;
    const k = `${b}|${lo}|${hi}`; if (!bandMap.has(k)) bandMap.set(k, { b, lo, hi });
  }
  const bands = [...bandMap.values()];
  let positions = pickPositions(bands, scan.sections, scan.maxScroll, FX_MAX_POS); out.how = 'секции с другим фоном';
  if (!positions.length && scan.maxScroll >= 1 && bands.length) {
    /* одна высота посередине страницы; если там закреплённого текста нет (только sticky внутри своего
       контейнера) — посередине самого длинного участка, где sticky закреплён */
    const mid = Math.round(scan.maxScroll / 2);
    const span = (e) => ({ lo: Math.max(1, Math.ceil(e.lo + BAND_PAD)), hi: Math.min(scan.maxScroll, Math.floor(e.hi - BAND_PAD)) });
    const fit = bands.map(span).filter((r) => r.lo <= r.hi);
    if (fit.some((r) => mid >= r.lo && mid <= r.hi)) { positions = [mid]; out.how = 'секций с другим фоном нет — одна высота посередине'; }
    else if (fit.length) { const r = fit.sort((a, z) => (z.hi - z.lo) - (a.hi - a.lo))[0]; positions = [Math.round((r.lo + r.hi) / 2)]; out.how = 'секций с другим фоном нет — одна высота посередине участка, где sticky-блок закреплён'; }
  }
  if (!bands.length) out.how = 'sticky-блок нигде не закрепляется';
  out.positions = positions;
  /* на время снимка фона прячется весь текст страницы, а не только закреплённый: текст секции,
     проезжающий под прозрачной шапкой, — не фон (иначе худшие 10 % пикселей — чужие буквы) */
  await addCss(page, 'hide-fx', 'html.rw-hide-fx,html.rw-hide-fx *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;transition:none!important}');
  const byIdx = new Map(items.map((it) => [it.idx, it]));
  const ids = items.map((it) => it.idx);
  const shownN = (st) => st.items.filter((s) => s.state === 'виден').length;
  const goTo = async (y, from) => {
    /* сдвиг видимой области scrollToY не сбрасывает — иначе шапка «вне окна» на всех высотах */
    await resetView(page);
    if (from != null) { await scrollToY(page, from); await sleep(200); }
    await scrollToY(page, y); await sleep(450); await settleAnimations(page, 1500);
    return evaluateWith(page, fixedStateInPage, { ids }, FX_DEPS);
  };
  await scrollToY(page, 0); await sleep(300);
  for (const y of positions) {
    /* высоты по возрастанию — к каждой подъезжаем сверху (прокрутка вниз). Шапка, которая прячется при
       прокрутке вниз, видна при прокрутке вверх — если часть текста спрятана, за окном или обрезана
       (шапка уезжает вверх под overflow:hidden или clip-path обёртки), подъехать снизу */
    let st = await goTo(y); let approach = 'сверху';
    if (st.items.some((s) => s.state === 'вне окна' || s.state === 'скрыт' || s.state === 'обрезан') && scan.maxScroll > 160) {
      /* низ страницы: ниже подъехать некуда — встать на 60 px выше, подъехав от низа (прокрутка вверх;
         160 px уводили полосу из нужной секции) */
      const y2 = y < scan.maxScroll ? y : Math.max(1, y - 60);
      const n1 = shownN(st); const st2 = await goTo(y2, Math.min(scan.maxScroll, y2 + 160));
      if (shownN(st2) > n1) { st = st2; approach = 'снизу'; } else if (shownN(st2) < n1 || y2 !== y) st = await goTo(y, Math.max(0, y - 160));
    }
    for (const s of st.items) if (s.state === 'виден' && s.blend && s.blend !== 'normal' && !BLEND[s.blend]) s.state = 'смешение цвета';
    /* своя подложка с зерном поверх: цвета пересчитываются через отображение зерна; полупрозрачная
       подложка, у которой с зерном худший случай ниже нормы, — не мерится (снимок на этой высоте не делался) */
    for (const s of st.items) {
      if (s.state !== 'подложка') continue;
      if (map) {
        const G = (c) => ({ r: f1(map[0], c.r), g: f1(map[1], c.g), b: f1(map[2], c.b) }); const Lf = lumRgb(...Object.values(G(s.f))), L0 = lumRgb(...Object.values(G(s.b0))), L1 = lumRgb(...Object.values(G(s.b1)));
        const rt = (x, z) => (Math.max(x, z) + 0.05) / (Math.min(x, z) + 0.05);
        s.ratio = s.exact ? rt(Lf, L0) : Lf >= Math.min(L0, L1) && Lf <= Math.max(L0, L1) ? 1 : Math.min(rt(Lf, L0), rt(Lf, L1));
        if (!s.exact && s.ratio < s.need) s.state = 'подложка с зерном';
      }
    }
    const shown = st.items.filter((s) => s.state === 'виден');
    const plated = st.items.filter((s) => s.state === 'подложка');
    const res = { y, scrollY: st.at, approach, measured: 0, byPlate: 0, skipped: {} };
    for (const s of st.items) if (s.state !== 'виден' && s.state !== 'подложка') { out.skipped[s.state] = (out.skipped[s.state] || 0) + 1; res.skipped[s.state] = (res.skipped[s.state] || 0) + 1; }
    out.results.push(res);
    for (const s of plated) {
      const it = byIdx.get(s.i);
      const rec = { y: st.at, approach, sig: s.now || it.sig, text: it.text, host: it.host, kind: it.kind, fg: s.hex, alpha: r2(s.alpha), blend: null, size: Math.round(s.size), need: s.need, p10: r2(s.ratio), median: r2(s.ratio), tone: 'своя подложка', section: null, sectionBg: null, plate: s.plate, plateSelf: !!s.self, plateBg: s.bg, exact: s.exact, seen: s.seen };
      res.measured++; res.byPlate++; out.measured++; out.byPlate++; if (s.seen !== 'виден') out.plateAway++;
      if (!out.worst || s.ratio / s.need < out.worst.p10 / out.worst.need) out.worst = rec;
      if (s.ratio < s.need) out.failures.push(rec);
    }
    if (!shown.length) continue;
    await page.evaluate(() => document.documentElement.classList.add('rw-hide-fx'));
    let buf;
    try { await sleep(150); buf = await page.screenshot({ type: 'png' }); } finally { await page.evaluate(() => document.documentElement.classList.remove('rw-hide-fx')); }
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    /* снимок — видимая область: масштаб от её ширины, коробки строк (в координатах окна раскладки)
       сдвигаются на её смещение */
    const k = info.width / (st.iw || vp.width); const ox = st.ox || 0, oy = st.oy || 0;
    for (const s of shown) {
      const px = sampleRects(data, info, ox || oy ? s.rects.map((r) => ({ ...r, x: r.x - ox, y: r.y - oy })) : s.rects, k);
      /* видимый текст, под которым на снимке нет ни одного пикселя, — не молча мимо, а в «не мерились» */
      if (!px.length) { out.skipped['вне снимка']++; res.skipped['вне снимка'] = (res.skipped['вне снимка'] || 0) + 1; continue; }
      const it = byIdx.get(s.i); const F = map ? { r: f1(map[0], s.fg.r), g: f1(map[1], s.fg.g), b: f1(map[2], s.fg.b) } : s.fg; const al = s.alpha;
      const ratios = []; const bgL = [];
      /* цвет текста над пикселем фона: смешение (mix-blend-mode), затем альфа и opacity */
      const bf = s.blend && s.blend !== 'normal' ? BLEND[s.blend] : null; const mix = (b, c) => (bf ? 255 * bf(b / 255, c / 255) : c);
      for (const [R, G, B] of px) {
        const l = lumRgb(R, G, B); const fl = lumRgb(al * mix(R, F.r) + (1 - al) * R, al * mix(G, F.g) + (1 - al) * G, al * mix(B, F.b) + (1 - al) * B);
        ratios.push((Math.max(l, fl) + 0.05) / (Math.min(l, fl) + 0.05)); bgL.push(l);
      }
      ratios.sort((x, z) => x - z); bgL.sort((x, z) => x - z);
      const p10 = ratios[Math.floor(ratios.length * 0.1)], median = ratios[Math.floor(ratios.length / 2)];
      const lo = bgL[Math.floor(bgL.length * 0.1)], mid = bgL[Math.floor(bgL.length / 2)], hi = bgL[Math.floor(bgL.length * 0.9)];
      const tone = (hi + 0.05) / (lo + 0.05) > 3 ? 'пёстрый' : mid >= 0.45 ? 'светлый' : mid <= 0.12 ? 'тёмный' : 'средний по яркости';
      const sec = s.sec != null ? scan.sections[s.sec] : null;
      const rec = { y: st.at, approach, sig: s.now || it.sig, text: it.text, host: it.host, kind: it.kind, fg: s.hex, alpha: r2(al), blend: bf ? s.blend : null, size: Math.round(s.size), need: s.need, p10: r2(p10), median: r2(median), tone, section: sec ? `${sec.sig}${sec.title ? ` «${sec.title}»` : ''}` : null, sectionBg: sec ? sec.bg : null };
      res.measured++; out.measured++;
      if (!out.worst || p10 / s.need < out.worst.p10 / out.worst.need) out.worst = rec;
      if (p10 < s.need) out.failures.push(rec);
    }
  }
  return out;
}

/* ---------- зерно поверх текста: действие слоя по трём снимкам ---------- */
async function grainMap(page) {
  if (!sharp) return { skipped: 'нет sharp' };
  const f = await findTextureLayers(page, { mark: true });
  const over = f.layers.filter((L) => L.coversViewport && (L.position === 'fixed' || L.fixedBy) && !(parseInt(L.zIndex, 10) < 0));
  if (!over.length) return { layers: [], found: f.layers.length };
  /* сами слои-элементы помечаются: в контрасте они не «картинка за текстом», их действие — в map */
  await page.evaluate((ks) => { for (const k of ks) { const el = document.querySelector(`[data-rw-tex="${k}"]`); if (el) el.setAttribute('data-rw-grain', ''); } }, over.filter((L) => !L.pseudo).map((L) => L.k));
  const css =['html,body{background:var(--rw-probe)!important;background-image:none!important}', 'body *{visibility:hidden!important}']
    .concat(over.map((L) => (L.pseudo ? `[data-rw-tex-${L.pseudo.slice(2)}="${L.k}"]${L.pseudo}{visibility:visible!important}` : `[data-rw-tex="${L.k}"],[data-rw-tex="${L.k}"] *{visibility:visible!important}`))).join('\n');
  /* при строгом CSP <style> молча не применялся, и «действие слоя» мерилось по снимкам самой страницы —
     отображение выходило мусорным; теперь стиль переживает CSP, а не вставился — ошибка, WARN */
  await addCss(page, 'grain-probe', css);
  const vpx = page.viewport(); const d = vpx.deviceScaleFactor || 1;
  const means = [];
  try {
    for (const lvl of [0, 128, 255]) {
      await page.evaluate((v) => document.documentElement.style.setProperty('--rw-probe', `rgb(${v},${v},${v})`), lvl);
      await sleep(250);
      const buf = await page.screenshot({ type: 'png' });
      const W = Math.round(vpx.width * d), H = Math.round(vpx.height * d);
      const { data, info } = await sharp(buf).extract({ left: Math.round(W * 0.1), top: Math.round(H * 0.1), width: Math.round(W * 0.8), height: Math.round(H * 0.8) }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const sum = [0, 0, 0]; const n = info.width * info.height;
      for (let i = 0; i < n; i++) { sum[0] += data[i * 3]; sum[1] += data[i * 3 + 1]; sum[2] += data[i * 3 + 2]; }
      means.push(sum.map((s) => Math.round(s / n * 100) / 100));
    }
  } finally {
    await removeCss(page, 'grain-probe');
    await page.evaluate(() => document.documentElement.style.removeProperty('--rw-probe'));
    await sleep(200);
  }
  const map = [0, 1, 2].map((ch) => [means[0][ch], means[1][ch], means[2][ch]]);
  const identity = map.every((p) => Math.abs(p[0]) < 0.6 && Math.abs(p[1] - 128) < 0.6 && Math.abs(p[2] - 255) < 0.6);
  return { layers: over.map((L) => ({ el: L.el + (L.pseudo || ''), blend: L.mixBlendMode, opacity: L.effectiveOpacity, zIndex: L.zIndex })), map, identity, points: { black: means[0], gray: means[1], white: means[2] } };
}

/* ---------- фокус: обход Tab на свежей странице ---------- */
const PROPS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'backgroundColor', 'borderTopColor', 'color', 'textDecorationLine'];

/* шаг обхода: элемент в фокусе, виден ли фокус. Стиль (PROPS) снимается в фокусе и после blur() — у
   самого элемента и у тех, кто рисует рамку за него: подписи (label — обёртка или label[for]), соседа
   сразу за ним (input:focus-visible + span) и обёрток до трёх уровней вверх, в которых нет других
   фокусируемых (.search:focus-within). Оформленная радиокнопка (прозрачна, обрезана 1×1 или
   appearance:none поверх подписи) рамку рисует на подписи — раньше это был ложный FAIL «не видно фокуса
   на: input». Своя рамка невидимого элемента (прозрачность до 0.05, clip или clip-path inset(50%) как у
   sr-only, коробка до 2×2 без крупных детей) не в счёт — её не видно, как и у невидимого соседа.
   iframe: фокус внутри него, activeElement страницы —
   сам iframe; blur() выбросил бы фокус наружу, поэтому видимость не проверяется, а элемент помечается
   __rwInside. Элементы сравниваются сами (__rwSeen), а не подписи: пять ссылок с одной подписью — не ловушка */
function focusStepInPage({ props }) {
  const el = document.activeElement; if (!el || el === document.body) return null;
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (el.__rwSeen) return { sig: sig(el), same: true, type, iframe: el.tagName === 'IFRAME' };
  el.__rwSeen = true;
  if (el.tagName === 'IFRAME') { el.__rwInside = true; return { sig: sig(el), same: false, type, iframe: true }; }
  const FOC = 'a[href], button, input:not([type=hidden]), select, textarea, summary, iframe, [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable="true"]';
  /* невидим: прозрачен, обрезан как sr-only (clip, clip-path inset(50%)) или коробка до 2×2 без крупных
     детей (строчная ссылка вокруг блока бывает 0×0, а рамка рисуется вокруг детей — она видна) */
  const seen = (n) => {
    if (eff(n) <= 0.05) return false;
    const s = getComputedStyle(n); if (/rect\(0(px)?,? 0(px)?/.test(s.clip) || /inset\(50%\)/.test(s.clipPath)) return false;
    const r = n.getBoundingClientRect();
    return !(r.width <= 2 && r.height <= 2 && ![...n.children].some((c) => { const q = c.getBoundingClientRect(); return q.width > 2 && q.height > 2; }));
  };
  const cand = [['сам', el]];
  const push = (kind, n) => { if (n && n.nodeType === 1 && !cand.some(([, m]) => m === n)) cand.push([kind, n]); };
  for (const lb of el.labels || []) push('подпись', lb);
  push('сосед', el.nextElementSibling);
  for (let n = el.parentElement, k = 0; n && k < 3 && n !== document.body && n !== document.documentElement; n = n.parentElement, k++) {
    if ([...n.querySelectorAll(FOC)].some((m) => m !== el)) break;
    push('обёртка', n);
  }
  /* рамка с переходом (transition: box-shadow .25s): сразу после blur() стиль — текущее значение
     перехода, то же, что в фокусе, и видимая рамка выходила «не видно». Идущие переходы завершаются
     перед каждым снимком (анимации не трогаются: пульсирующая рамка — анимация) */
  const settle = () => { if (typeof CSSTransition === 'undefined' || !document.getAnimations) return; for (const a of document.getAnimations()) if (a instanceof CSSTransition) { try { a.finish(); } catch { /* уже кончился */ } } };
  const snap = () => { settle(); return cand.map(([, n]) => { const s = getComputedStyle(n); return props.map((p) => s[p]); }); };
  const focused = snap(); const shown = cand.map(([, n]) => seen(n));
  el.blur();
  /* поле даты и времени в Chrome: фокус с клавиатуры — во внутреннем сегменте (теневой DOM поля), и blur()
     его не снимает: activeElement и :focus остаются, стиль «после blur» — тот же, что в фокусе (ложный FAIL
     на input date/time с рамкой 2px). Тогда фокус уводится на временный невидимый элемент вне поля */
  let sink = null;
  if (document.activeElement === el || el.matches(':focus')) {
    sink = document.createElement('span'); sink.tabIndex = -1; sink.setAttribute('aria-hidden', 'true');
    for (const [k, v] of [['position', 'fixed'], ['left', '-9999px'], ['top', '0px'], ['width', '1px'], ['height', '1px'], ['overflow', 'hidden'], ['opacity', '0'], ['pointer-events', 'none']]) sink.style.setProperty(k, v, 'important');
    document.body.appendChild(sink); sink.focus({ preventScroll: true });
  }
  const stuck = !!sink && (document.activeElement === el || el.matches(':focus'));
  const base = snap(); if (sink) sink.remove(); el.focus({ preventScroll: true }); settle();
  const moved = cand.map((_, k) => props.some((p, j) => focused[k][j] !== base[k][j]));
  const how = sink ? { sink: true, stuck } : {};
  if (moved[0] && shown[0]) return { sig: sig(el), changed: true, same: false, type, ...how };
  const k = cand.findIndex(([kind], i) => i > 0 && moved[i] && shown[i]);
  if (k > 0) return { sig: sig(el), changed: true, via: `${cand[k][0]} ${sig(cand[k][1])}`, same: false, type, ...how };
  return { sig: sig(el), changed: false, hiddenOwn: moved[0], same: false, type, ...how };
}
async function focusWalk(page) {
  /* остановки Tab: группа радиокнопок с одним name — одна остановка (Tab заходит в группу один раз),
     иначе на странице с парой переключателей выходило ложное «обход не состоялся (4 из 5)» */
  const focusables = await page.evaluate(() => { const groups = new Set(); return [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, iframe, [tabindex], [contenteditable=""], [contenteditable="true"]')].filter((el) => {
    if (el.disabled) return false; const ti = el.getAttribute('tabindex'); if (ti !== null && Number(ti) < 0) return false;
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === 'visible')) return false;
    if (el.type === 'radio' && el.name) { const g = `${el.form ? [...document.forms].indexOf(el.form) : '-'}|${el.name}`; if (groups.has(g)) return false; groups.add(g); }
    return true;
  }).length; });
  const focus = { focusables, expected: Math.min(5, focusables), visited: 0, invisible: [], hiddenOwn: [], via: [], trapped: false, first: null, stuckAt: null, iframes: [], iframeStuck: null };
  let sameSteps = 0, skipPress = false;
  for (let i = 0; i < 30; i++) {
    if (!skipPress) { await page.keyboard.press('Tab'); await sleep(80); }
    skipPress = false;
    const cur = await evaluateWith(page, focusStepInPage, { props: PROPS }, DEPS);
    if (!cur) break;
    /* поле даты в Chrome — три внутренних сегмента: Tab ходит по ним, это не ловушка */
    if (cur.same) { if (/^(date|time|datetime-local|month|week)$/.test(cur.type) && (sameSteps = sameSteps + 1) <= 4) continue; focus.trapped = true; focus.stuckAt = cur.sig; break; }
    sameSteps = 0; focus.visited++; if (!focus.first) focus.first = cur.sig;
    if (cur.iframe) {
      /* Tab ходит по элементам внутри iframe (карта, видео): жмём, пока фокус не вернётся в страницу;
         следующий элемент страницы проверяется без лишнего нажатия */
      focus.iframes.push(cur.sig); let left = false;
      for (let k = 0; k < 40; k++) {
        await page.keyboard.press('Tab'); await sleep(60);
        const inside = await page.evaluate(() => !!(document.activeElement && document.activeElement.__rwInside));
        if (!inside) { left = true; break; }
      }
      if (!left) { focus.iframeStuck = cur.sig; break; }
      skipPress = true; continue;
    }
    /* blur() не снял фокус (поле даты и времени) — база снята уводом фокуса на временный элемент;
       не ушёл и так — сравнивать не с чем: не FAIL, а «не проверить» */
    if (cur.sink) (focus.sinkUsed = focus.sinkUsed || []).push(cur.sig);
    if (!cur.changed && cur.stuck) (focus.unmeasured = focus.unmeasured || []).push(cur.sig);
    else if (!cur.changed) { focus.invisible.push(cur.sig); if (cur.hiddenOwn) focus.hiddenOwn.push(cur.sig); }
    else if (cur.via) focus.via.push({ sig: cur.sig, via: cur.via });
  }
  return focus;
}

/* ---------- --selftest: стенды fixtures/a11y с ожиданиями ---------- */
/* Каждый стенд — отдельный запуск этого же скрипта (один браузер за раз), ожидания — по строкам вердикта
   в JSON: статус и подстроки, которые в строке есть (has) и которых нет (not). Зовётся до любых констант
   прогона (функция поднимается), поэтому всё нужное — внутри */
async function selftest() {
  const CASES = [
    { page: 'focus-date.html', viewport: 'mobile-s', expect: [
      { line: /^фокус:/, status: 'FAIL', has: ['не видно фокуса на: input#bad, input#dNone;', 'blur() не снимал фокус'], why: 'рамка 2px по :focus-visible у полей даты и времени видна; контроль — поля без рамки' },
    ] },
    { page: 'hidden-text.html', viewport: 'desktop', args: ['--ignore', '.brand-mark'], expect: [
      { line: /^мелкий текст/, status: 'OK', why: 'кегль 0 — не «мелкий 0px»; логотип и --ignore вне кегля' },
      { line: /^скрытый текст кеглем 0/, status: 'WARN', has: ['a.phone', 'aria-label'] },
      { line: /^контраст: проверено/, status: 'FAIL', has: ['p.control'], not: ['logo__sub', 'ТОРТЫ', 'brand-mark', 'a.phone'] },
      { line: /^вне проверки контраста и кегля/, status: 'INFO', has: ['aria-hidden="true" — 1', 'логотип (data-a11y-logo) — 2', '--ignore «.brand-mark» — 1'] },
    ] },
    { page: 'cards.html', viewport: 'desktop', expect: [
      { line: /^контраст по снимку фона/, status: 'FAIL', has: ['измерено 25 из 27', 'повтор того же фона 2', '16 ниже нормы'], not: ['не измерялось'] },
    ] },
    { page: 'ribbon.html', viewport: 'mobile-s', expect: [
      { line: /^контраст закреплённого текста/, status: 'FAIL', has: ['по своей подложке', 'Скидки', '#BBBBBB на #FFFFFF'], not: ['замеров 0', 'смотреть глазами'] },
    ] },
    { page: 'bigbg.html', viewport: 'desktop', expect: [
      { line: /^контраст по снимку фона/, status: 'FAIL', has: ['измерено 12 из 12', '6 ниже нормы', 'Подпись четвёртая над белым', 'Цифра шестая над белым'], not: ['повтор того же фона', 'над тёмным'], why: 'одна картинка и один градиент, подписи в разных местах — не «повтор того же фона»' },
    ] },
    { page: 'plate-overlay.html', viewport: 'mobile-s', expect: [
      { line: /^контраст по снимку фона/, status: 'OK', has: ['измерено 6 из 6'], why: 'наверху слоя нет; фон — под строками текста, углы пилюли на белой ленте не в счёт' },
      { line: /^контраст закреплённого текста/, status: 'FAIL', has: ['a «Раздел один» #FFFFFF', '1.18:1', 'обрезан'], not: ['по своей подложке'], why: 'видимый — по снимку (светлый ::before поверх #111); пилюли за краем под ::after — не по подложке' },
    ] },
    { page: 'plate-layer.html', viewport: 'mobile-s', expect: [
      { line: /^контраст закреплённого текста/, status: 'OK', has: ['по своей подложке', 'перекрыт'], not: ['#FFFFFF на #FFFFFF'], why: 'видимая активная пилюля — по снимку; под накрытой окном активной лежит плашка-span — не «белое на белом» по цвету ленты; подчёркивание ::after 2px подложку не отменяет' },
    ] },
  ];
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = opt.out ? path.resolve(String(opt.out)) : fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-selftest-'));
  let bad = 0, n = 0;
  for (const c of CASES) {
    const tag = c.page.replace(/\.html$/, ''); const jf = path.join(out, 'a11y', `${tag}.json`);
    try { fs.rmSync(jf, { force: true }); } catch { /* нет */ }
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), pathToFileURL(path.join(here, 'fixtures', 'a11y', c.page)).href, '--viewport', c.viewport, '--out', out, '--tag', tag, ...(c.args || [])], { encoding: 'utf8', timeout: 300000 });
    let j = null; try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch { /* нет итога */ }
    if (!j) { bad++; n++; console.log(`FAIL ${c.page}: нет итога (код ${r.status}) — ${String(r.stderr || r.stdout || '').trim().slice(-300)}`); continue; }
    for (const e of c.expect) {
      n++;
      const ln = j.lines.find((l) => e.line.test(l.what)); const txt = ln ? `${ln.what} — ${ln.details || ''}` : '';
      const miss = !ln ? ['строки нет'] : [...(ln.status !== e.status ? [`статус ${ln.status}, ждали ${e.status}`] : []), ...(e.has || []).filter((s) => !txt.includes(s)).map((s) => `нет «${s}»`), ...(e.not || []).filter((s) => txt.includes(s)).map((s) => `лишнее «${s}»`)];
      if (miss.length) { bad++; console.log(`FAIL ${c.page} ${c.viewport} ${e.line.source}: ${miss.join('; ')}${e.why ? ` (${e.why})` : ''}\n     ${txt.slice(0, 400)}`); }
      else console.log(`OK   ${c.page} ${c.viewport} ${e.line.source} — ${ln.status}`);
    }
    console.log(`     ${c.page}: ${Math.round((Date.now() - t0) / 100) / 10} с, протокол ${jf}`);
  }
  console.log(`\n${bad ? 'FAIL' : 'OK'}: ожиданий ${n}, не сошлось ${bad}`);
  return bad ? 1 : 0;
}

/* ---------- прогон ---------- */
const browser = await launch();
let dom, focus, reveal, sc, grain = null, fx = null, badIgnore = null; const imgContrast = { measured: 0, skipped: 0, covered: 0, coveredList: [], failures: [] };
try {
  const page = await openPage(browser, url, vp);
  /* --ignore: неверный CSS-селектор — ошибка до замера (код 1), а не молча «ничего не исключено» */
  if (IGNORE) { const bad = await page.evaluate((s) => { try { document.querySelector(s); return null; } catch (e) { return String(e.message || e); } }, IGNORE); if (bad) { badIgnore = bad; throw new Error('--ignore'); } }
  await forceInstantScroll(page);
  /* исходное положение видимой области — до всякой прокрутки: к нему, а не к началу страницы, её
     возвращает resetView (у dir=rtl шире экрана это scrollX −500; сдвиг видимой области при
     загрузке — фокус, autofocus, #якорь — исходным не считается) */
  viewReset.rest = await page.evaluate(viewRestInPage).catch(() => null);
  await evaluateWith(page, markHiddenInPage, null, {}).catch(() => 0);
  sc = await scrollThrough(page, { pause: 250 });
  await scrollToY(page, 0); await settleAnimations(page, 3000); await sleep(300);
  reveal = await evaluateWith(page, revealInPage, null, DEPS).catch(() => null);
  if (!opt['no-grain']) grain = await grainMap(page).catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  const map = grain && grain.map && !grain.identity ? grain.map : null;
  dom = await evaluateWith(page, domInPage, { isMobile: !!vp.isMobile, map, ignore: IGNORE }, DEPS);

  /* контраст на картинках и градиентах: прячем текст, снимаем фон за ним, считаем по пикселям */
  if (sharp && dom.contrast.imgList.length) {
    const lumRgb = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    /* строгий CSP: page.addStyleTag падал «Could not load style» и ронял весь прогон (код 1, без JSON) —
       теперь стиль переживает CSP, а не вставился — WARN «не измерен», прогон идёт дальше */
    let cssOk = true;
    try { await addCss(page, 'img-hide', '.rw-hide-text,.rw-hide-text *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}\n.rw-pe,.rw-pe *{pointer-events:auto!important}'); } catch (e) { cssOk = false; imgContrast.error = String(e.message || e).slice(0, 200); }
    for (const it of cssOk ? dom.contrast.imgList : []) {
      const h = await page.$(`[data-rw-imgbg="${it.idx}"]`); if (!h) { imgContrast.skipped++; continue; }
      try {
        /* виден ли текст: сверху в его центре должен лежать он сам (или потомок), а не чужой непрозрачный
           блок — иначе на снимке будет перекрывший его блок, а не фон текста. elementsFromPoint не видит
           элементов с pointer-events:none (частый .hero__content{pointer-events:none}) — на время проверки
           им ставится pointer-events:auto (класс rw-pe). Закреплённый текст мерится на верху страницы:
           там его подложка и определялась (scrollIntoView его не двигает, а страницу оставил предыдущий).
           Верх — и видимая область на месте (предыдущий scrollIntoView на странице шире экрана сдвинул её,
           scrollTo сдвиг не сбрасывает — нижняя панель выходила «вне окна»), и прокручиваемый блок во весь
           экран в начале (scrollIntoView предыдущего прокрутил его, а scrollTo окна его не трогает). */
        if (it.fixed) await resetView(page);
        const state = await h.evaluate((el, fixed) => {
          if (fixed) {
            scrollTo({ top: 0, behavior: 'instant' });
            const sc = window.__rwScroller; if (sc && sc.isConnected) sc.scrollTo({ top: 0, behavior: 'instant' });
          } else el.scrollIntoView({ block: 'center', behavior: 'instant' });
          const sg = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : '');
          const r = el.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
          /* окно — видимая область (снимок — она), а не окно раскладки */
          const vv = window.visualViewport; const VX = vv ? vv.offsetLeft : 0, VY = vv ? vv.offsetTop : 0, VW = vv ? vv.width : innerWidth, VH = vv ? vv.height : innerHeight;
          if (cx < VX || cy < VY || cx > VX + VW || cy > VY + VH) return { state: 'вне окна' };
          el.classList.add('rw-pe');
          try {
            for (const n of document.elementsFromPoint(cx, cy)) {
              if (n === el || el.contains(n)) return { state: 'виден' };
              if (n.contains(el)) return { state: 'виден' };
              const s = getComputedStyle(n); const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor); const a = m ? (m[1].split(/[,\s/]+/).filter(Boolean)[3] ?? 1) : 0;
              if (/^(IMG|VIDEO|CANVAS|IFRAME)$/.test(n.tagName) || s.backgroundImage !== 'none' || Number(a) >= 0.99) return { state: 'перекрыт', by: sg(n) };
            }
            return { state: 'виден' };
          } finally { el.classList.remove('rw-pe'); }
        }, !!it.fixed);
        if (state.state !== 'виден') { imgContrast.covered = (imgContrast.covered || 0) + 1; imgContrast.coveredList.push({ sig: it.sig, text: it.text, state: state.state, by: state.by || null }); continue; }
        await h.evaluate((el) => el.classList.add('rw-hide-text'));
        await sleep(120);
        /* коробка и видимая область — из страницы: boundingBox отдаёт координаты окна раскладки, а снимок —
           видимая область (у страницы без meta viewport на телефоне 1 CSS-пиксель на снимке — 0.8 точки, а
           не 2: вырезка уходила за снимок, элемент молча шёл в «пропущено»). Фон берётся под коробками строк
           своего текста, как у закреплённого текста на прокрутке, а не под всей коробкой элемента: поля и
           скруглённые углы пилюли (белая лента за тёмной пилюлей), значок рядом с подписью и фото вдали от
           короткой подписи во всю ширину карточки давали худшие 10% «1:1». Строк нет — коробка элемента */
        const g = await h.evaluate((el) => {
          const r = el.getBoundingClientRect(); const vv = window.visualViewport; const rects = [];
          for (const n of el.childNodes) {
            if (n.nodeType !== 3 || !n.textContent.trim()) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            for (const q of rg.getClientRects()) if (q.width >= 1 && q.height >= 1) rects.push({ x: q.left, y: q.top, w: q.width, h: q.height });
          }
          return { x: r.left, y: r.top, w: r.width, h: r.height, rects: rects.length ? rects : [{ x: r.left, y: r.top, w: r.width, h: r.height }], lines: rects.length, VX: vv ? vv.offsetLeft : 0, VY: vv ? vv.offsetTop : 0, VW: vv ? vv.width : innerWidth, VH: vv ? vv.height : innerHeight };
        });
        if (g.w < 4 || g.h < 4 || g.w * g.h > 1600 * 1200) { imgContrast.skipped++; await h.evaluate((el) => el.classList.remove('rw-hide-text')); continue; }
        /* снимок окна и выборка по координатам окна: снимок элемента у закреплённых (position: fixed)
           и прокрученных элементов брал не ту область */
        const buf = await page.screenshot({ type: 'png' });
        await h.evaluate((el) => el.classList.remove('rw-hide-text'));
        const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const kS = info.width / (g.VW || vp.width);
        const px = sampleRects(data, info, g.rects.map((q) => ({ ...q, x: q.x - g.VX, y: q.y - g.VY })), kS);
        if (!px.length) { imgContrast.covered++; imgContrast.coveredList.push({ sig: it.sig, text: it.text, state: 'вне снимка', by: null }); continue; }
        if (g.lines) imgContrast.byLines = (imgContrast.byLines || 0) + 1;
        /* цвет текста над пикселем фона: альфа и opacity смешивают его с этим пикселем; слой зерна
           уже есть на снимке фона — к цвету текста он применяется отдельно (fgGrain) */
        const F = it.fgGrain || it.fgRgb; const a = it.alpha; const ratios = [];
        for (const [R, G, Bb] of px) {
          const l = lumRgb(R, G, Bb); const fl = lumRgb(a * F.r + (1 - a) * R, a * F.g + (1 - a) * G, a * F.b + (1 - a) * Bb);
          ratios.push((Math.max(l, fl) + 0.05) / (Math.min(l, fl) + 0.05));
        }
        ratios.sort((x, y) => x - y);
        const p10 = ratios[Math.floor(ratios.length * 0.1)], median = ratios[Math.floor(ratios.length / 2)];
        imgContrast.measured++;
        if (p10 < it.need) imgContrast.failures.push({ sig: it.sig, text: it.text, fg: it.fg, alpha: it.alpha, size: it.size, p10: Math.round(p10 * 100) / 100, median: Math.round(median * 100) / 100, need: it.need });
      } catch { imgContrast.skipped++; try { await h.evaluate((el) => el.classList.remove('rw-hide-text')); } catch { /* ушёл */ } }
    }
  }
  /* возвраты видимой области при замере текста на картинке — отдельно: примечание о несработавшем
     возврате идёт в свою строку («по снимку фона»), а не только в строку высот */
  viewReset.img = { resets: viewReset.resets, failed: viewReset.failed };
  /* закреплённый текст (шапка, меню, нижняя панель) над секциями ниже верха страницы */
  fx = await fixedOnScroll(page, map).catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  await page.close();

  /* фокус — на свежей странице (отдельная вкладка): старт обхода не должен зависеть от прокруток выше */
  const fp = await openPage(browser, url, vp);
  await forceInstantScroll(fp);
  await fp.bringToFront();
  focus = await focusWalk(fp);
  await fp.close();
} catch (e) {
  if (!badIgnore) throw e;
} finally { await browser.close(); }
if (badIgnore) die(`--ignore «${IGNORE}»: неверный CSS-селектор (${badIgnore.slice(0, 160)})`);

/* ---------- вердикты ---------- */
if (dom.clippedText) console.log(`Текст за краем обрезающего блока (слайд за краем, заглушка): ${dom.clippedText} — не проверялся`);
const lines = []; let fails = 0, warns = 0;
const L = (st, what, det) => { if (st === 'FAIL') fails++; if (st === 'WARN') warns++; lines.push({ status: st, what, details: det }); console.log(`${st.padEnd(4)} ${what}${det ? ' — ' + det : ''}`); };
{
  const bad = sc.stuck ? 'страница не прокручивается — появления и часть текста не проверены' : !sc.reachedBottom ? `до низа не доехали: ${sc.maxScrollY} из ${sc.pageHeight - (sc.viewH || vp.height)} px` : '';
  L(bad ? 'WARN' : 'OK', `прокрутка: страница пройдена целиком (${sc.pageHeight} px, ${sc.screens} шагов)`, bad || (reveal ? `блоков с текстом скрыто до прокрутки ${reveal.hidden}, показано после ${reveal.shown}${reveal.hidden - reveal.shown ? `; скрытыми остались ${reveal.hidden - reveal.shown} (меню, окна, наведение): ${reveal.still.slice(0, 4).join(', ')}` : ''}` : ''));
}
const C = dom.contrast;
const cf = Object.entries(C.failures).sort((a, b) => b[1].count - a[1].count);
const cut = C.total > C.considered;
L(cf.length ? 'FAIL' : cut ? 'WARN' : 'OK', `контраст: проверено ${C.checked} элементов${cut ? ` — взято ${C.considered} из ${C.total} текстовых (обрезано: остальные не проверялись)` : ` (текстовых на странице ${C.total})`}${C.translucent ? ` (из них ${C.translucent} полупрозрачных — смешаны с фоном)` : ''}${C.unknown ? `, ещё ${C.unknown} на картинке, градиенте или чужой подложке — см. ниже` : ''}${C.transparentText ? `, прозрачный цвет текста (градиент через background-clip) — ${C.transparentText}, не проверялись` : ''}`, cf.length ? cf.slice(0, 5).map(([k, v]) => `${k} = ${v.ratio}:1 (нужно ${v.need}:1), ${v.count} эл.: ${v.examples.join(', ')}`).join(' | ') : 'все пары проходят AA');
/* перекрытый или ушедший за окно текст не мерился — это не «OK», а «проверить глазами» (WARN) */
const covTxt = imgContrast.coveredList.length ? `не измерены — ${imgContrast.coveredList.slice(0, 5).map((c) => `${c.sig} «${c.text}» ${c.state === 'перекрыт' ? `перекрыт ${c.by}` : c.state}`).join(', ')}${imgContrast.coveredList.length > 5 ? ` и ещё ${imgContrast.coveredList.length - 5}` : ''} — смотреть глазами` : '';
/* возврат видимой области перед замером закреплённого текста на картинке не удался — снимок мог лечь не под текстом */
const vrI = viewReset.img || { resets: viewReset.resets, failed: viewReset.failed };
const vrImg = vrI.failed ? `видимая область ${vrI.failed} раз из ${vrI.resets} не вернулась на исходное место перед замером закреплённого текста — снимок мог лечь не под текстом, смотреть глазами` : '';
/* сколько из текста на картинке не мерилось и почему: повтор того же фона у той же подписи (не больше трёх
   одинаковых — фон и цвет те же, что у измеренных) и предел за запуск (WARN — смотреть глазами) */
const rep = C.imgRepeat || { n: 0, ex: [] }, over = C.imgOverLimit || 0;
imgContrast.total = C.unknown; imgContrast.repeat = rep.n; imgContrast.overLimit = over;
const repTxt = rep.n ? `повтор того же фона у той же подписи ${rep.n} — не мерились (тот же фон, то же место текста на нём и тот же цвет, что у трёх измеренных): ${rep.ex.join(', ')}${rep.n > rep.ex.length ? ' …' : ''}` : '';
const overTxt = over ? `упёрлись в предел ${C.imgLimit || 150} за запуск: не измерено ${over} — смотреть глазами` : '';
if (C.unknown && imgContrast.error) L('WARN', `контраст по снимку фона за текстом (картинка, градиент, чужая подложка): не измерен — ${imgContrast.error}`, `${C.unknown} элементов на картинке, градиенте или чужой подложке не проверены — смотреть глазами`);
else if (C.unknown) L(imgContrast.failures.length ? 'FAIL' : imgContrast.covered || vrImg || over ? 'WARN' : imgContrast.measured ? 'OK' : 'WARN', `контраст по снимку фона за текстом (картинка, градиент, чужая подложка): измерено ${imgContrast.measured} из ${C.unknown}${imgContrast.skipped ? `, пропущено ${imgContrast.skipped}` : ''}${imgContrast.covered ? `, перекрыто другим блоком или вне окна ${imgContrast.covered} (не мерился)` : ''}${rep.n ? `, повтор того же фона ${rep.n}` : ''}${over ? `, сверх предела ${over}` : ''}`, [imgContrast.failures.length ? `${imgContrast.failures.length} ниже нормы: ${imgContrast.failures.slice(0, 6).map((f) => `${f.sig} «${f.text}» ${f.fg}${f.alpha < 1 ? ` (прозрачность ${f.alpha})` : ''} ${f.size}px: худшие 10% фона дают ${f.p10}:1 при медиане ${f.median}:1 (нужно ${f.need}:1)`).join(' | ')}${imgContrast.failures.length > 6 ? ` | и ещё ${imgContrast.failures.length - 6}` : ''}` : imgContrast.measured ? 'измеренные — не ниже нормы (по худшим 10% фона)' : sharp ? '' : 'нет sharp — не измерено', covTxt, overTxt, repTxt, vrImg].filter(Boolean).join('; '));
if (fx && !fx.none) {
  const T = 'контраст закреплённого текста на прокрутке';
  const sk = Object.entries(fx.skipped || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ');
  /* только возвраты этого прохода (перед высотами); возвраты при замере текста на картинке — в строке выше */
  const vrF = viewReset.failed - vrI.failed, vrR = viewReset.resets - vrI.resets;
  const blk = (viewReset.how || {})['блок'] || 0;
  const vrTxt = (vrF ? `; видимая область ${vrF} раз из ${vrR} не вернулась на исходное место (сдвинута замером текста на картинке) — снимки могли лечь не под текстом, смотреть глазами` : '')
    + (blk ? `; видимая область возвращалась временным невидимым блоком ${blk} раз — наблюдатель DOM страницы на <html> это видит` : '');
  /* dir=rtl шире экрана: в покое scrollX < 0, видимая область — над пустой полосой переполнения (так эмуляция
     и, вероятно, телефон показывают страницу при открытии); «над местом вне секций» тогда — правда о том, что
     видно, а причина — переполнение по ширине (его отдельно дают discover и runtime). Статус не меняется */
  const rtlWide = !!(viewReset.rest && viewReset.rest.sx < 0);
  const rtlTxt = '; dir=rtl, страница шире экрана: в покое видимая область стоит над пустой полосой переполнения — так её видит телефон при открытии; сначала убрать переполнение по ширине, потом перемерить';
  /* sticky вне места закрепления — не пропуск: на этой высоте он обычный текст своей секции */
  const unp = (fx.skipped || {})['не закреплён'] || 0;
  const unpTxt = unp ? '; «не закреплён» — sticky-блок на этой высоте уехал вместе со своим контейнером или ещё стоит на своём месте в потоке: там он обычный текст своей секции (контраст — в строках выше), не пропуск' : '';
  if (fx.error) L('WARN', `${T}: не измерен`, fx.error);
  else if (!fx.positions.length) {
    /* высот нет: страница в один экран или весь закреплённый текст — sticky, который ниже верха не закрепляется */
    const why = [...new Set(fx.items.filter((it) => it.sticky).map((it) => `${it.host}: ${it.sticky.why || 'контейнер кончается сразу под ним'}`))].slice(0, 3).join('; ');
    L('OK', `${T}: ${fx.items.length} элементов`, fx.maxScroll >= 1
      ? `sticky-блок ниже верха страницы нигде не закреплён (${why}) — на других высотах это обычный текст своей секции, его контраст — в строках выше`
      : 'страница в один экран — других высот нет (верх страницы — в строках контраста выше)');
  } else {
    const who = [...new Set(fx.items.map((it) => `${it.kind} ${it.host}`))].slice(0, 4).join(', ');
    const up = fx.results.filter((r) => r.approach === 'снизу').length;
    const head = `${T}: ${fx.positions.length} ${fx.positions.length === 1 ? 'высота' : fx.positions.length < 5 ? 'высоты' : 'высот'} (${fx.how}; ${fx.positions.join(', ')} px${up ? `; на ${up} — при прокрутке вверх: при прокрутке вниз текст прятался` : ''}), ${fx.items.length}${fx.total > fx.items.length ? ` из ${fx.total}` : ''} элементов (${who}), замеров ${fx.measured}${fx.byPlate ? ` (по снимку ${fx.measured - fx.byPlate}, по своей подложке ${fx.byPlate} — текст на той высоте за краем ленты, вне окна или перекрыт, снимка под ним нет: цвет подложки свой, фон под блоком не важен)` : ''}${sk ? `; не мерились на части высот: ${sk}` : ''}`;
    if (fx.failures.length) {
      /* группы «высота + блок + секция»: «на 1840 px меню nav.menu над секцией … (фон под текстом светлый): a «Каталог» … 1.07:1»;
         текст на своей подложке — своей группой: секция под блоком ему не важна */
      const groups = new Map();
      for (const f of fx.failures) { const g = `на ${f.y} px${f.approach === 'снизу' ? ' (прокрутка вверх)' : ''} ${f.kind} ${f.host} ${f.plate ? '— текст на своей подложке (фон под блоком не важен)' : `над ${f.section ? `секцией ${f.section}` : 'местом вне секций'} (фон под текстом ${f.tone})`}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(f); }
      const one = (f) => (f.plate
        ? `${f.sig} «${f.text}» ${f.fg} на ${f.plateBg}${!f.plateSelf && f.plate !== f.sig ? ` (подложка ${f.plate})` : ''} ${f.size}px — ${f.p10}:1 (нужно ${f.need}:1)${f.seen && f.seen !== 'виден' ? ` [на этой высоте ${f.seen}]` : ''}`
        : `${f.sig} «${f.text}» ${f.fg}${f.alpha < 1 ? ` (прозрачность ${f.alpha})` : ''}${f.blend ? ` (mix-blend-mode ${f.blend})` : ''} ${f.size}px — ${f.p10}:1 (медиана ${f.median}:1, нужно ${f.need}:1)`);
      const det = [...groups.entries()].slice(0, 4).map(([g, list]) => `${g}: ${list.slice(0, 3).map(one).join(', ')}${list.length > 3 ? ` и ещё ${list.length - 3}` : ''}`).join(' | ');
      L('FAIL', head, `${det}${groups.size > 4 ? ` | и ещё ${groups.size - 4} мест` : ''}${rtlWide && fx.failures.some((f) => !f.section) ? rtlTxt : ''}${unpTxt}${vrTxt}`);
    } else if (!fx.measured) {
      /* ни одного замера только потому, что sticky на этих высотах не закреплён, — мерить нечего: OK с пометкой */
      const other = Object.entries(fx.skipped || {}).filter(([k, v]) => v && k !== 'не закреплён');
      if (unp && !other.length) L(vrF ? 'WARN' : 'OK', head, `замеров 0 — и мерить нечего: sticky-блок закреплён только в пределах своего контейнера, а на этих высотах он там не закреплён${unpTxt}${vrTxt}`);
      else L('WARN', head, `ни одного замера: закреплённый текст на этих высотах спрятан, за окном или снимком, перекрыт, обрезан предком или смешан режимом, который не мерится, — смотреть глазами${unpTxt}${vrTxt}`);
    }
    /* видимая область не вернулась на исходное место — снимки могли быть не там, где шапка: не OK, а WARN */
    else { const w = fx.worst; L(vrF ? 'WARN' : 'OK', head, `везде не ниже нормы; худшее — ${w.p10}:1 (нужно ${w.need}:1): ${w.sig} «${w.text}» на ${w.y} px ${w.plate ? `на своей подложке ${w.plateBg}${!w.plateSelf && w.plate !== w.sig ? ` (подложка ${w.plate})` : ''}` : `над ${w.section ? `секцией ${w.section}` : 'местом вне секций'} (фон под текстом ${w.tone})`}${unpTxt}${vrTxt}`); }
  }
}
if (grain && grain.error) L('WARN', 'зерно поверх текста: не измерено', grain.error);
else if (grain && grain.layers && grain.layers.length) {
  const G = C.grain; const hexs = (m) => '#' + m.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lay = `${grain.layers.map((l) => `${l.el}${l.blend && l.blend !== 'normal' ? ` ${l.blend}` : ''} α${l.opacity}`).join(', ')}: чёрный → ${hexs(grain.points.black)}, серый → ${hexs(grain.points.gray)}, белый → ${hexs(grain.points.white)}`;
  if (grain.identity || !G) L('OK', 'зерно поверх текста', `${lay} — цвета не меняет`);
  else {
    const gf = Object.entries(G.failures).sort((a, b) => b[1].count - a[1].count); const gn = Object.entries(G.near);
    L(gf.length ? 'FAIL' : 'OK', `контраст с учётом зерна: пересчитано ${G.checked} проходящих пар`, `${lay}${gf.length ? ` | ниже нормы из-за зерна: ${gf.slice(0, 5).map(([k, v]) => `${k} ${v.ratio}:1 → ${v.ratioGrain}:1 (нужно ${v.need}:1; с зерном ${v.withGrain}), ${v.count} эл.: ${v.examples.join(', ')}`).join(' | ')}` : ''}${gn.length ? ` | в пределах 10 % над нормой: ${gn.slice(0, 4).map(([k, v]) => `${k} ${v.ratio}→${v.ratioGrain}:1, ${v.count} эл.`).join('; ')}` : ''}`);
  }
}
{
  const g = Object.values(dom.smallText.groups).sort((a, b) => a.size - b.size);
  const st = g.some((x) => x.status === 'FAIL') ? 'FAIL' : g.length ? 'WARN' : 'OK';
  L(st, `мелкий текст: проверено ${dom.smallText.checked} элементов, мельче 12px — ${g.reduce((a, x) => a + x.count, 0)}`, g.length ? g.slice(0, 5).map((x) => `${x.size}px (${x.status === 'FAIL' ? 'меньше 10' : 'меньше 12'}) ×${x.count}: ${x.examples.join(', ')}`).join(' | ') : 'везде от 12px');
}
/* кегль 0 — скрытый текст, а не «мелкий 0px»: приём рабочий, но хрупкий — совет, как прятать надёжнее */
if (dom.zeroFont && dom.zeroFont.n) L('WARN', `скрытый текст кеглем 0: ${dom.zeroFont.n}`, `${dom.zeroFont.ex.join(', ')}${dom.zeroFont.n > dom.zeroFont.ex.length ? ' …' : ''} — на экране не нарисован, в контраст и кегль не входит; прятать текст для читалки надёжнее обрезкой (класс sr-only: clip: rect(0 0 0 0) или clip-path: inset(50%), коробка 1×1) или дать ссылке aria-label, а кегль 0 оставить только пробелам между блоками`);
/* вне 1.4.3: декоративный под aria-hidden, логотип, --ignore — INFO со счётом и примерами; --ignore, который ничего не нашёл, — WARN */
{
  const E = dom.excluded || {}; const parts = [];
  if (E['aria-hidden'] && E['aria-hidden'].n) parts.push(`декоративный под aria-hidden="true" — ${E['aria-hidden'].n}: ${E['aria-hidden'].ex.join(', ')}${E['aria-hidden'].n > E['aria-hidden'].ex.length ? ' …' : ''} (скрыт от читалок; WCAG 1.4.3 чистого оформления не касается)`);
  if (E['логотип'] && E['логотип'].n) parts.push(`логотип (data-a11y-logo) — ${E['логотип'].n}: ${E['логотип'].ex.join(', ')}${E['логотип'].n > E['логотип'].ex.length ? ' …' : ''}`);
  if (E.ignore && E.ignore.n) parts.push(`--ignore «${IGNORE}» — ${E.ignore.n}: ${E.ignore.ex.join(', ')}${E.ignore.n > E.ignore.ex.length ? ' …' : ''}`);
  if (parts.length) L('INFO', 'вне проверки контраста и кегля (декоративный, вне 1.4.3; логотип)', parts.join(' | '));
  /* aria-hidden на большой части текста — уже не оформление: скрытым от читалок бывает и содержимое (обёртка
     с aria-hidden, забытая после закрытия окна) — тогда это ошибка доступности, а его контраст не мерился */
  const ah = (E['aria-hidden'] || { n: 0 }).n, shareAh = ah / Math.max(1, ah + C.total);
  if (ah >= 20 && shareAh >= 0.25) L('WARN', `aria-hidden="true" скрывает ${ah} текстов из ${ah + C.total} (${Math.round(shareAh * 100)}%)`, 'для оформления это много: проверить, не спрятано ли от читалок содержимое (обёртка страницы с aria-hidden, забытая после закрытия окна) — тогда это ошибка доступности, а контраст этого текста не мерился');
  if (IGNORE && !(E.ignore && E.ignore.n)) L('WARN', `--ignore «${IGNORE}»: ничего не исключено`, dom.ignoreFound ? `селектор нашёл ${dom.ignoreFound} элементов, но видимого текста в них нет` : 'селектор ничего не нашёл на странице — опечатка или другая разметка');
}
L(dom.imgsNoAltCount ? 'FAIL' : 'OK', `картинки без alt: ${dom.imgsNoAltCount}`, dom.imgsNoAlt.join(', ') || `у декоративных alt="" — ${dom.decorativeEmpty}`);
L(dom.unlabeled.length ? 'FAIL' : 'OK', `поля без подписи: ${dom.unlabeled.length}`, dom.unlabeled.join(', '));
L(dom.nameless.length ? 'FAIL' : 'OK', `кнопки и ссылки без имени: ${dom.nameless.length}`, dom.nameless.join(', '));
L(dom.headings.h1 === 1 && !dom.headings.skips.length ? 'OK' : 'WARN', `заголовки: ${dom.headings.count}, h1 — ${dom.headings.h1}`, dom.headings.skips.length ? `пропуски уровней: ${dom.headings.skips.join(', ')}` : dom.headings.h1 !== 1 ? 'h1 должен быть один' : 'порядок соблюдён');
L(dom.lang ? 'OK' : 'FAIL', `lang документа: ${dom.lang || 'нет'}`, dom.lang ? '' : 'читалка не поймёт язык, переносы и произношение будут чужими');
L(dom.zoomBlocked ? 'FAIL' : 'OK', 'масштабирование', dom.zoomBlocked ? 'запрещено в meta viewport — слабовидящие не смогут увеличить' : 'разрешено');
L(dom.positiveTabindex ? 'WARN' : 'OK', `положительный tabindex: ${dom.positiveTabindex}`, dom.positiveTabindex ? 'ломает естественный порядок обхода' : '');
{
  const f = focus; const short = f.visited < f.expected;
  const unm = f.unmeasured || [], sinks = f.sinkUsed || [];
  const st = f.invisible.length ? 'FAIL' : f.trapped || f.iframeStuck || unm.length ? 'WARN' : short ? 'WARN' : f.focusables ? 'OK' : 'OK';
  /* поле даты и времени: blur() не снимает фокус с внутреннего сегмента — база снята уводом фокуса */
  const inFrames = (f.iframes.length ? `; внутри iframe (${f.iframes.slice(0, 3).join(', ')}) фокус не проверялся — чужой документ` : '')
    + (sinks.length ? `; у ${sinks.length} (${sinks.slice(0, 4).join(', ')}) blur() не снимал фокус (поле даты и времени — фокус во внутреннем сегменте), стиль без фокуса снят уводом фокуса на временный элемент` : '')
    + (unm.length ? `; не проверить — фокус не уходил и с временного элемента: ${unm.slice(0, 4).join(', ')} — смотреть глазами` : '');
  /* фокус на подписи, соседе или обёртке — не провал, но пусть будет видно, где он нарисован */
  const hid = f.hiddenOwn || [], via = f.via || [];
  const viaTxt = via.length ? `; у ${via.length} — на подписи, соседе или обёртке: ${via.slice(0, 4).map((v) => `${v.sig} → ${v.via}`).join(', ')}${via.length > 4 ? ` и ещё ${via.length - 4}` : ''}` : '';
  const det = (f.invisible.length ? `не видно фокуса на: ${f.invisible.slice(0, 8).map((s) => (hid.includes(s) ? `${s} (рамка только у самого элемента, а он невидим — прозрачен или обрезан)` : s)).join(', ')}${short ? `; к тому же обход не состоялся (${f.visited} из ${f.focusables})` : ''}${viaTxt}`
    : f.iframeStuck ? `из iframe ${f.iframeStuck} за 40 нажатий Tab фокус не вернулся в страницу — проверить руками`
      : f.trapped ? `ловушка фокуса или перехват Tab на ${f.stuckAt} — проверить руками`
        : short ? `обход не состоялся: Tab прошёл ${f.visited} из ожидаемых ${f.expected} (фокусируемых на странице ${f.focusables}) — Tab перехвачен, фокус уходит из страницы или стартует не сначала`
          : f.focusables ? `фокус виден везде (первым — ${f.first})${viaTxt}` : 'фокусируемых элементов нет') + inFrames;
  L(st, `фокус: обошли ${f.visited} элементов на свежей странице`, det);
}
if (vp.isMobile) {
  /* число — всех найденных, список — первые 10 и 6 (раньше число было длиной обрезанного списка) */
  const nT = dom.targetsCount ?? dom.targets.length, nS = dom.smallInputsCount ?? dom.smallInputs.length;
  const more = (n, list) => (n > list.length ? ` и ещё ${n - list.length}` : '');
  L(nT ? 'WARN' : 'OK', `цели нажатия мельче 24px: ${nT}`, nT ? dom.targets.join(', ') + more(nT, dom.targets) : 'радиокнопки и флажки — вместе с подписью');
  L(nS ? 'WARN' : 'OK', `поля ввода текста мельче 16px: ${nS}`, nS ? 'iOS увеличит страницу при фокусе: ' + dom.smallInputs.join(', ') + more(nS, dom.smallInputs) : 'радиокнопки, флажки и ползунки iOS не увеличивает — не в счёт');
}
L(dom.reducedMotionRule ? 'OK' : 'WARN', 'prefers-reduced-motion', dom.reducedMotionRule ? 'правило есть' : 'правила нет — анимации не отключаются для тех, кому от них плохо');
L(dom.autoplayVideo ? 'FAIL' : 'OK', `видео с автоплеем и звуком: ${dom.autoplayVideo}`);
L(dom.landmarks.main ? 'OK' : 'WARN', `ориентиры: main ${dom.landmarks.main}, nav ${dom.landmarks.nav}, header ${dom.landmarks.header}, footer ${dom.landmarks.footer}`, dom.landmarks.main ? '' : 'нет <main> — читалка не найдёт начало содержимого');
if (dom.iframesNoTitle) L('WARN', `iframe без title: ${dom.iframesNoTitle}`);
/* WARN lib (свой стиль не вставился: CSP запретил и <style>, и таблицы) — отдельной строкой вердикта */
const libW = takeWarnings();
for (const w of libW) L('WARN', 'свой стиль на странице', w);
const verdict = fails ? 'FAIL' : warns ? 'WARN' : 'OK';
console.log(`\n${verdict}: ${fails} провалов, ${warns} предупреждений`);
const file = path.join(outDir, `${tag}.json`);
writeJson(file, { url, viewport: vpName, takenAt: new Date().toISOString(), scroll: { pageHeight: sc.pageHeight, screens: sc.screens, maxScrollY: sc.maxScrollY, reachedBottom: sc.reachedBottom, stuck: sc.stuck }, reveal, grain, dom: { ...dom, contrast: { ...dom.contrast, imgList: dom.contrast.imgList.map(({ fgRgb, fgGrain, ...rest }) => rest) } }, imgContrast, fixedScroll: fx, viewReset, focus, lines, ...(libW.length ? { warnings: libW } : {}), verdict });
console.log(`Сохранено: ${file}`);
if (opt.strict && verdict === 'FAIL') { console.log('Код выхода 1: вердикт FAIL (--strict)'); process.exitCode = 1; }
