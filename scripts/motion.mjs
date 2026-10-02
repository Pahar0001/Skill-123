#!/usr/bin/env node
/**
 * Движение страницы: что двигается, от чего, как и с какими числами — инвентарь, чтобы повторить
 * движение донора целиком, и сверка «донор → наш сайт», чтобы ни одно не потерялось.
 *
 *   node motion.mjs <адрес> [<адрес>…] [--pages "тип=путь,…"] [--viewport desktop[,mobile]]
 *                   [--out <папка прогона>] [--tag <имя>] [--time 6000] [--time-cap 20000] [--hover 14]
 *                   [--clicks 6] [--no-hover] [--no-mouse] [--no-scroll] [--no-clicks] [--no-crops] [--debug]
 *   node motion.mjs compare <motion.json донора> <адрес нашего сайта | наш motion.json> [ещё пары…]
 *                   [--out <папка прогона>] [--tag <имя>] [--decisions <файл>] [--viewport desktop[,mobile]]
 *   node motion.mjs selftest [--no-browser]   проверка распознавания на стенде fixtures/motion/index.html и сверки
 *                   на готовых протоколах; --no-browser — только сверка (без браузера, секунды)
 *   node motion.mjs --help
 *
 * Несколько страниц и экранов за один запуск (один браузер): адреса подряд или --pages от первого
 * адреса — «тип=путь» (тип — имя протокола) или просто пути через запятую; --viewport списком.
 *   node motion.mjs https://donor.com --pages "home=/,product=/sets/x,collection=/c/y" --viewport desktop,mobile --tag donor
 *   → motion/donor-home.json, donor-home-mobile.json, donor-product.json, … и сводка по всем.
 * Одна страница и один экран — имя --tag как есть (или <страница>-<экран>), как раньше. Адрес и та же страница в
 * --pages (https://site.ru и "home=/") — одна страница, имя с типом: <--tag>-home; разные страницы с одним именем —
 * отказ с обоими адресами (дать им типы в --pages).
 * --time — базовое окно «время» (мс); медленную петлю (период длиннее окна: покачивание Framer 7–13 с) окно
 * продлевает кусками по 2 с, пока не увидит два разворота, но не дольше --time-cap (1000–60000, по умолчанию
 * 20000). Не уложилась — строка «окно N с короче периода», а не пропуск. Без медленных петель — ровно --time.
 *
 * Что распознаётся (вид → рецепт в reference/motion.md):
 *   entrance        вход при загрузке (CSS-анимация, переход, element.animate) — из чего, сколько, задержки
 *   reveal          появление при прокрутке: прозрачность, сдвиг, масштаб, размытие, шторка (clip-path);
 *                   у закреплённого — «при прокрутке вверх» (кнопка «Наверх»: видна, когда листают вверх);
 *                   где срабатывает (верх блока на N% экрана), длительность, по очереди (+N мс), чем
 *                   запускается (класс «in» от IntersectionObserver, Framer, AOS…); WOW.js и animate.css
 *                   (visibility: hidden → visible и animation-name при входе в экран) — числа из @keyframes:
 *                   прозрачность, сдвиг (в % — от своего размера), длительность и задержка (data-wow-*);
 *                   блоки .wow без строки — заметкой с причиной (0×0 на этом экране, без класса анимации)
 *   scroll-linked   свойство привязано к прокрутке: из → в на отрезке «верх блока на A% → B% экрана»
 *                   (масштаб, прозрачность, поворот, размытие; CSS animation-timeline тоже); «лента вбок» —
 *                   сдвиг X transform (Swiper) или прокрутка своего контейнера (scrollLeft, overflow-x)
 *   parallax        сдвиг на долю прокрутки (коэффициент у каждого слоя)
 *   pinned          закреплённый раздел (sticky / pin) и лента внутри него, которая едет вбок
 *   header          шапка при прокрутке: плотнеет, прячется вниз, возвращается вверх
 *   progress        полоса прогресса прокрутки
 *   marquee         бегущая строка (скорость, направление)
 *   typewriter      печатающийся текст (слова, скорость набора и стирания); rotating-words — смена слов
 *   counter         числа, которые считают
 *   carousel        слайды листаются сами (интервал, шаг)
 *   loop            бесконечные петли: парение, вращение, пульс, мигание (CSS — по ключевым кадрам; на JS —
 *                   по разворотам: период, размах); одинаковые соседи (стопка картинок Framer, у каждой свой
 *                   период — вразнобой) — одна строка ×N с parent и members
 *   hover           наведение: картинка в карточке крупнее, кнопка светлее/выше/с тенью, линия под ссылкой
 *   mouse           реакция на мышь: наклон, параллакс; cursor — свой курсор
 *   canvas, video   холст, который рисует (2D/WebGL), и видео-фон
 *   click           по клику (clicks.mjs находит, что раскрывается): меню-бургер, аккордеон (details,
 *                   aria-expanded и «свои» Framer/Tilda), вкладки (role=tab и ряд кнопок с одной активной),
 *                   раскрывающаяся кнопка [aria-expanded]. Что открылось (панель) и как: сдвиг, масштаб,
 *                   прозрачность, высота, шторка — и вход из @keyframes/element.animate, если панель показали
 *                   из display:none; значок (поворот шеврона, бургер в крестик); кнопка (фон, цвет); старая
 *                   панель вкладок; длительность и кривая (события, element.animate, последняя смена style,
 *                   снимки через 80/200/400/700 мс; пружина Framer — linear() целиком в json); блокируется ли
 *                   прокрутка; закрывается ли — повторным кликом, прежней вкладкой или Escape. Клик, который
 *                   уводит со страницы (location.href, форма, перезагрузка, новая вкладка), — переход
 *                   останавливается, клик пропущен с пометкой «клик увёл со страницы», клики идут дальше;
 *                   смена адреса без перехода (history.replaceState у фильтра) — та же страница, клик в счёт.
 * Плюс библиотеки движения (GSAP/ScrollTrigger, Lenis, Framer, AOS, Swiper, Lottie, Webflow, Tilda…),
 * CSS scroll-driven, плавная прокрутка и правило «меньше движения».
 *
 * Как снимается: страница открывается с перехватом событий (animationstart/end, transitionrun/end,
 * element.animate, смена классов и style) → --time без прокрутки (петли, печать, карусели; медленная петля
 * продлевает окно до --time-cap) → проход
 * прокруткой шагами по четверти экрана, на каждом шаге ждём, пока движение уляжется, и снимаем
 * прозрачность, transform, фильтр, шторку и положение у каждого заметного элемента → вверх на полтора
 * экрана (шапка) → движение мыши по первому экрану → наведение на образцы кнопок, карточек, ссылок →
 * клики (до --clicks штук, до 60 с; навести, снимок всех элементов, клик, снимки, разбор, вырезка
 * открытого cNN.png, закрыть) → вырезки элементов. Отличие: прокрутка скриптом ≠ колесо — сглаживание
 * Lenis/пружины Framer догоняют; скрипт ждёт до 0.9 с на шаг. Окно из SITE_REWORK_DISMISS, которое увело на
 * другую страницу (выбор города → главная), — снимаемая страница открывается заново, заметка «увело на …».
 * Окна при загрузке — в протоколе (windows: dismiss, modal, wrongPage, notes, warnings): открытое окно, неудачное
 * нажатие (не найдено, скрыто, не та страница) и свой стиль, который не вставился, — WARN в вердикте инвентаря и
 * сверки (снимок снят под окном).
 *
 * Выход: <out>/motion/<tag>.json (протокол: items[], libs, clicks, phases — что снималось, verdict) и <tag>.md (таблица для
 * analysis.md), вырезки <out>/motion/<tag>/mNN.png и cNN.png (открытое кликом). По умолчанию <out> —
 * папка прогона по первому адресу (runs/<slug>). --debug — ещё <tag>.series.json: все шаги и ряды
 * значений менявшихся элементов, а в json — разбор каждого клика (clicks.tried[].diff).
 * У строки — place: где элемент на странице (y — верх в документе при прокрутке 0, h, screen — номер экрана, of — из
 * скольких, first — виден ли в первом экране; fixed — закреплён на экране: места на странице у него нет). По нему compare
 * сверяет место движения. Протоколы, снятые до 02.10, place не имеют.
 *
 * compare: для каждого движения донора ищется такое же у нас (тот же вид, похожие числа):
 *   OK — есть и совпадает; ОТЛИЧАЕТСЯ — вид тот же, числа другие (какие); НЕТ — не найдено.
 *   ЕСТЬ, ДРУГИМ ВИДОМ — тот же приём, записанный у нас другим видом; числа донора и наши — в строке (в json — cross):
 *     · от прокрутки: «привязано к прокрутке» ↔ «параллакс» ↔ «появление» (строки одного нашего элемента — параллакс со
 *       сдвигом и «появление» с поворотом — считаются одним движением: m03+m04; один элемент — тот же i, та же подпись
 *       и то же место). Условия: у нас есть каждое свойство донора; у нас нет своего проявления (прозрачность, шторка,
 *       размытие), которого нет у донора; место то же; у каждого свойства конец ±25% и размах 60–167% донорского, в ту
 *       же сторону; отрезок прокрутки расходится не больше чем вдвое. Закреплённый на экране элемент (fixed, sticky —
 *       кнопка «наверх») в такие пары не идёт: его проявление при прокрутке — не проявление раздела;
 *     · по времени: «бегущая строка» ↔ «петля» со сдвигом по кругу (один сдвиг по оси в одну сторону, путь ≥ 200 px —
 *       так бегущую строку писала Tilda до 02.10; парение туда-обратно, пульс, вращение и петли на JS — не строка): та
 *       же ось и сторона, скорость ±25%;
 *     · наведение по роли: элемент записан у донора другим видом, а по смыслу тот же — кнопка Zero Block a.tn-atom
 *       записана «ссылкой», у нас a.btn — «кнопка». Кнопка — вид «кнопка» или ссылка с залитым до наведения фоном;
 *       пункт меню, плашка-метка без вида, карточка и логотип кнопкой не становятся. У нас есть каждое свойство донора,
 *       цвет идёт тем же ходом (яркость меняется в ту же сторону на столько же, ±25% хода; прозрачный остаётся
 *       прозрачным), длительность ±25%; сами цвета не сверяются — палитра у нас своя. Из нескольких наших кнопок —
 *       ближайшая по цвету. Закреплённая кнопка (в шапке) — пара только закреплённой.
 *     ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ — то же, но числа врозь или у нас меняется ещё что-то, чего нет у донора (поворот,
 *     разворот, сдвиг по другой оси): приём тот же, движение другое. У прокрутки — только при сверенном месте; и числа
 *     врозь, и лишние свойства сразу — уже НЕТ с подсказкой «похожее у нас …: почему не засчитано».
 *   Место на странице — то же, если верх элемента у донора и у нас не дальше одного экрана друг от друга, считая от
 *     начала страницы; ниже первого экрана — ещё и если совпала доля высоты страницы (±15%) или расстояние от конца
 *     страницы (до одного экрана): страницы донора и наша разной длины. Место другое — не пара (НЕТ, в строке «место
 *     другое: у донора экран 2 из 11, у нас экран 13 из 13»): и у пар другим видом, и у пары одного вида, когда
 *     движение стоит в одном месте (привязка к прокрутке, параллакс, бегущая строка, петля; у нашей строки ×N место не
 *     сверяется — она стоит в нескольких). Появления, наведение одного вида, вход и мышь места не сверяют.
 *   Место не сверено (в протоколе нет place: снят до 02.10) — пара другим видом засчитывается по одним числам, и то
 *     лишь когда они — примета этого движения: все числа рядом, набор свойств тот же и совпало хотя бы два свойства, не
 *     считая проявления «из ничего» (прозрачность 0 → 1 совпадает у чего угодно). Строка остаётся «ЕСТЬ, ДРУГИМ ВИДОМ»
 *     с пометкой «место на странице не сверено» (в json — placeChecked: false), а вердикт без решения на эту строку —
 *     не лучше WARN: переснять донора или сверить пару глазами и подтвердить решением. Бегущая строка без сверенного
 *     места: скорость врозь до трёх раз — «ОТЛИЧАЕТСЯ», другая сторона или больше чем втрое — НЕТ.
 *   Одно наше движение закрывает одно движение донора: делят одно наше только полные совпадения того же вида (одна
 *   анимация карточек на все одинаковые появления донора) и строки одного элемента донора. У движения, которое стоит в
 *   одном месте (привязка к прокрутке, параллакс, бегущая строка, петля), и полных совпадений на одном нашем — не
 *   больше, чем у нас элементов (×N нашей строки): три ленты донора на трёх разделах и одна наша — одна OK, две НЕТ.
 *   Пара с разницей или другим видом занимает наше движение целиком; остальным — следующее похожее или НЕТ («похожее у
 *   нас mNN, но оно уже пара для mMM донора»).
 *   По клику пара — тот же подвид (меню, аккордеон, вкладки, раскрытие); высота панели не сравнивается
 *   (она от содержимого), свойства донора, которых у нас нет, — разница. Вход при загрузке и движение от прокрутки
 *   без единого общего свойства с нашим — не пара вовсе (НЕТ, а не «отличается»). Наведение на элемент другого вида
 *   (у донора логотип, у нас ссылка) с тем же переходом буквально — каждое свойство с теми же «от → до» и длительность
 *   ±25% — пара OK. Бегущая строка со строкой — сторона и скорость ±25%. Петля со сдвигом по кругу обычной петле не
 *   пара. Лента вбок: путь ленты не сравнивается (он от числа разделов), только куда едет. Закреплённый элемент и
 *   элемент в потоке страницы — не пара и при одном виде (появление, привязка, параллакс).
 *   НЕ ПРОВЕРЯЛОСЬ — у нас этот вид не снимался (--no-clicks, --no-hover, --no-mouse, --no-scroll; протокол
 *   без phases и без clicks): строка INFO, в вердикт не входит.
 *   Решение «почему нет / чем заменено» — в <out>/motion-decisions.json:
 *     { "reveal:div.card": "…", "m04": "у нас другой первый экран (вариант B), стопки картинок нет" }
 *   Решение — текст; значение не строкой (false, 0) решением не считается. Ключ — «вид:подпись» (надёжнее: от номеров
 *   не зависит; в md у строки без решения он готов для вставки), номер строки, «вид:<родитель> > *» или вид.
 *   Ключ с экраном — "reveal:div.card:desktop", "m04:mobile", "loop:mobile" (экран — строчными, как в протоколе
 *   донора): номера mNN у desktop и mobile свои, один файл на оба экрана пишется ключами с экраном. Сначала ищется ключ
 *   с экраном, потом без — ключ без экрана действует на любой экран, как раньше.
 *   Решение по номеру и пересъёмка донора. Номер mNN — порядок строк протокола, он плавает от съёмки к съёмке (донор,
 *   снятый дважды за сутки без правок сайта, поменял местами m04 и m05). При первом применении решения по номеру
 *   сверка запоминает отпечаток строки донора — вид, подпись, число элементов, набор свойств — в файле-спутнике
 *   <out>/motion-decisions.prints.json (раздел на страницу донора и экран). Дальше под номером должно стоять то же
 *   движение: подпись та же, вид тот же или из той же группы (привязка, параллакс и появление; строка и петля), у того
 *   же вида — есть общее свойство. Движение другое — решение НЕ применяется, WARN: «решение «m04» не применено: оно
 *   записано для «…», а сейчас под этим номером «…». То движение теперь m05. Перенесите на ключ по виду и подписи —
 *   "entrance:span.t-submit__text:desktop" — или на новый номер». Переписанный текст решения — новое решение: оно
 *   привязывается заново (заметкой «было — стало»). У прогона, начатого до отпечатков, первый отпечаток берётся из
 *   прежнего протокола сверки этого прогона (<out>/motion/*.json той же страницы донора и экрана: к чему номер
 *   относился, когда решение писали) — если текст решения с тех пор не менялся; так сдвиг номеров виден уже в первой
 *   сверке после пересъёмки донора. Нет ни отпечатка, ни прежнего протокола (файл решений перенесён в другую папку
 *   прогона) — решение привязывается к нынешней строке с заметкой, к чему: сверить глазами.
 *   Замечания о решениях (INFO, в md — раздел «Решения — замечания», в json — decisionNotes): записано и с экраном, и
 *   без, с разным текстом; решения по номеру без экрана; значения не строкой; пустые; экран в ключе другим регистром
 *   («m01:Desktop»); ключ вида, который перестал закрывать (движение теперь записано другим видом: «loop» → «marquee»);
 *   ключи, которые ничего не закрыли; решения, которые не понадобились (пара нашлась сама); к чему привязаны решения
 *   по номеру. Об одном ключе — одно сообщение.
 *   Ключи, начинающиеся с «_» ("_about"), — служебные. WARN (вердикт не лучше WARN): решение по номеру не применено —
 *   под номером другое движение; пара без сверки места и без решения; одно решение по номеру без экрана закрыло в
 *   одном запуске на разных экранах разные движения; экраны протоколов разные (донор mobile, наш desktop); решение по
 *   номеру без экрана, а рядом лежит протокол донора другого экрана (donor-home-mobile.json), где под этим номером
 *   другое движение, — при файле решений по умолчанию (он один на прогон); при своём файле через --decisions — заметкой.
 *   Петли одинаковых соседей (стопка картинок Framer, у каждой свой период) — одна строка ×N с parent
 *   и members; решение на всю группу — ключ loop:<родитель> > * (loop:div.framer-Nsiv9.framer-x6zctv > *),
 *   ключ вид:подпись любого участника тоже подходит. Голый loop:<родитель> — про сам родитель.
 *   Каким ключом закрыта строка — столбец «ключ решения» (в json — decisionKey).
 *   Движения, которых у донора нет, печатаются как «своё» — проверить, что это задумано (банк идей).
 *   Вердикт: FAIL — есть НЕТ без решения; WARN — есть ОТЛИЧАЕТСЯ без решения или предупреждение; иначе OK
 *   («ЕСТЬ, ДРУГИМ ВИДОМ» со сверенным местом вердикт не портит). Протокол годится доказательством для state.mjs
 *   (визуал/runtime движения): steps[] — status (уровень OK, WARN, FAIL, INFO), match (статус словом), ours (наши номера
 *   пары), cross (пара другим видом), placeChecked: false (место не сверено), decisionKey; counts — сколько каких
 *   (unplaced — пар без сверки места); decisionPrints — файл отпечатков. Несколько пар подряд — протоколы
 *   compare-<тип донора>, итог — худший вердикт. --viewport desktop,mobile — каждая пара на каждом экране за один
 *   запуск: протокол донора другого экрана берётся рядом по имени (donor-home.json ↔ donor-home-mobile.json), наш
 *   адрес снимается на этом экране (наш протокол — тоже сосед по имени); протоколы compare и compare-mobile.
 * selftest: стенд с каждым видом движения, у блоков data-expect; FAIL, если вид не найден или найден вид
 * из data-expect-not (на этом блоке его быть не должно: пружина входа — не петля). Плюс сверка без браузера
 * (fixtures/motion/compare-*.json: лента scrollLeft ↔ transform, наведение на элементе другого вида, --no-clicks;
 * compare-cross-*.json: пары другим видом, наведение по роли, отказы от ложных пар — место другое, появление карточек
 * вместо ленты, парение вместо строки, одно наше на два и три донорских, числа врозь; допуски чисел по одному; место
 * тремя мерками и граница первого экрана; закреплённый элемент; пара без сверки места; число носителей; отпечатки
 * решений по номеру и пересъёмка донора со сдвигом; ключи решений с экраном, имена страниц, compare --viewport
 * desktop,mobile; compare-traps.json — 33 ловушки независимой проверки 02.10, из них три ограничения — заметкой INFO).
 * Плюс две бегущие строки одной подписи с разной скоростью
 * (fixtures/motion/marquee-two.html) — две строки протокола; место на странице (place) у строк стенда.
 * Плюс окно выбора, которое уводит со страницы (fixtures/motion/dismiss.html): страница открыта заново, итог нажатия —
 * в windows, вердикт OK; окно при загрузке без переменной (fixtures/lib/modal-city.html) — WARN в вердикте и windows.
 * Плюс проход кликов на телефоне с видимым окном ×1.25 (страница шире экрана): точка нажатия попадает. Плюс Tilda-донор
 * (fixtures/motion/tilda.html): петля SBS — loop, задержки 0/300/600, лента 0.68, на телефоне — только data-animate-mobile=y.
 *
 * Донор на Tilda (#allrecords с data-tilda-page-id): после прохода прокруткой снимается карта tilda.mjs, и её пункты
 * (source «атрибуты Tilda») идут в инвентарь вместо замеров на тех же элементах (ключ recid:elemid по closest
 * ('.t396__elem'), группа recid:g<id>, стандартный блок — по rec): в строке «замер совпал по виду» или «замер назвал
 * «привязано к прокрутке» — верно по атрибутам Tilda: петля». Переносятся только пункты, которые играют у донора на
 * этом экране (plays); остальное — заметкой «не переносить на этом экране» (на ширине < 1200 Tilda снимает появления,
 * кроме data-animate-mobile=y). Служебное Tilda (проявление #allrecords, t-mbfix, полоса T360) — не движение.
 * Бегущая строка Zero Block (SBS loop без обратного хода, один сдвиг по оси на 200 px и больше) — «бегущая строка» со
 * скоростью в px/с, а не «петля (парение)», как было до 02.10.
 * По клику ещё хуки Tilda: #menuopen — меню, #popup:<имя> — окно (clicks.mjs находит пару «ссылка → окно» в разметке).
 *
 * Код выхода: 0 — снято (и compare без FAIL); 1 — FAIL сверки, неверные аргументы, не открылась страница.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  parseArgs, launch, preparePage, gotoRetry, waitForOverlay, sleep, resolveViewport, evaluateWith, SIG_FN,
  scrollToY, writeJson, readJson, ensureDir, runDir, pageSlug, loadSharp, closeConsent, consentNote, unmangle,
  tildaInfo, IS_TILDA_SERVICE_FN, collectWarnings, takeWarnings, collectNotes, takeNotes,
} from './lib.mjs';
import { findClickTargets, SCREEN_POINT_FN } from './clicks.mjs';
import { tildaSnapshot } from './tilda.mjs';

const HELP = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ ?\* ?/gm, '');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { pos, opt } = parseArgs(process.argv.slice(2), {
  flags: ['help', 'h', 'no-hover', 'no-mouse', 'no-scroll', 'no-crops', 'no-clicks', 'no-browser', 'debug'],
  optional: ['viewport', 'out', 'tag', 'time', 'time-cap', 'hover', 'clicks', 'decisions', 'pages'],
  commands: ['compare', 'selftest'], strict: true,
});
if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
const die = (m) => { console.error(m); process.exit(1); };
/* WARN и INFO из lib (окно при загрузке, SITE_REWORK_DISMISS, свой стиль не вставился) — в протокол (windows) и вердикт
   инвентаря, а не строкой мимо протокола */
collectWarnings(); collectNotes();

/* =====================================================================
   Код внутри страницы
   ===================================================================== */

/* Перехват до загрузки: события анимаций и переходов, element.animate, смена классов и style. */
function instrument() {
  if (window.__mo) return;
  const now = () => Math.round(performance.now());
  const mo = window.__mo = { ev: [], waapi: [], cls: [], style: new Map(), capped: false };
  const push = (arr, x) => { if (arr.length < 8000) arr.push(x); else mo.capped = true; };
  addEventListener('animationstart', (e) => push(mo.ev, { t: now(), type: 'anim', el: e.target, name: e.animationName, pseudo: e.pseudoElement || '' }), true);
  addEventListener('animationend', (e) => push(mo.ev, { t: now(), type: 'anim-end', el: e.target, name: e.animationName, dur: Math.round(e.elapsedTime * 1000), pseudo: e.pseudoElement || '' }), true);
  addEventListener('transitionrun', (e) => push(mo.ev, { t: now(), type: 'trans', el: e.target, prop: e.propertyName, pseudo: e.pseudoElement || '' }), true);
  addEventListener('transitionend', (e) => push(mo.ev, { t: now(), type: 'trans-end', el: e.target, prop: e.propertyName, dur: Math.round(e.elapsedTime * 1000), pseudo: e.pseudoElement || '' }), true);
  try {
    const orig = Element.prototype.animate;
    const wrapped = function animate(kf, o) {
      try {
        const op = typeof o === 'number' ? { duration: o } : (o || {});
        const frames = Array.isArray(kf) ? kf : (kf && typeof kf === 'object' ? [kf] : []);
        const props = [...new Set(frames.flatMap((f) => Object.keys(f || {})).filter((k) => !/^(offset|easing|composite)$/.test(k)))];
        push(mo.waapi, { t: now(), el: this, props, first: frames[0] ? JSON.stringify(frames[0]).slice(0, 200) : '', last: frames.length ? JSON.stringify(frames[frames.length - 1]).slice(0, 200) : '',
          duration: typeof op.duration === 'number' ? Math.round(op.duration) : null, delay: Math.round(op.delay || 0), easing: op.easing || '', iterations: op.iterations === Infinity ? 'infinite' : (op.iterations || 1) });
      } catch (e) { /* не мешать странице */ }
      return orig.apply(this, arguments);
    };
    try { Object.defineProperty(wrapped, 'toString', { value: () => orig.toString() }); } catch (e) { /* нет */ }
    Element.prototype.animate = wrapped;
  } catch (e) { /* нет WAAPI */ }
  const start = () => {
    new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target;
        if (m.attributeName === 'style') {
          const s = mo.style.get(el); const t = now();
          if (s) { s.n++; s.last = t; } else if (mo.style.size < 10000) mo.style.set(el, { n: 1, first: t, last: t });
          if (mo.rec) mo.rec.set(el, t);                             /* после клика: когда скрипт в последний раз менял style */
        } else if (m.attributeName === 'class' && el.classList) {
          const was = new Set(String(m.oldValue || '').split(/\s+/).filter(Boolean));
          const added = [...el.classList].filter((c) => !was.has(c)); const removed = [...was].filter((c) => !el.classList.contains(c));
          if (added.length || removed.length) push(mo.cls, { t: now(), el, added, removed });
        }
      }
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style', 'class'], attributeOldValue: true });
  };
  if (document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
  /* смены текста с загрузки: печать заголовка один раз при загрузке заканчивается до окна «время» (shapefest:
     «UI design.» за 1.1 с, дальше стоит) — частое наблюдение её уже не видит. Элемент → [[время, текст]] */
  mo.text = new Map();
  const textStart = () => {
    new MutationObserver((list) => {
      const t = now();
      for (const m of list) {
        const el = m.type === 'characterData' ? m.target.parentElement : m.target;
        if (!el || el.nodeType !== 1) continue;
        if (m.type === 'childList' && ![...m.addedNodes, ...m.removedNodes].some((n) => n.nodeType === 3)) continue;
        let log = mo.text.get(el);
        if (!log) { if (mo.text.size >= 1500) continue; log = []; mo.text.set(el, log); }
        if (log.length >= 240) continue;
        const txt = (el.textContent || '').trim().slice(0, 80);
        if (!log.length || log[log.length - 1][1] !== txt) log.push([t, txt]);
      }
    }).observe(document.documentElement, { subtree: true, characterData: true, childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', textStart, { once: true }); else textStart();
}

/* Текст, который допечатывался по знаку с загрузки (журнал instrument): кандидаты в печать. */
function textLogInPage() {
  const mo = window.__mo; if (!mo || !mo.text) return [];
  const els = window.__moEls || []; const out = [];
  /* печать в новом элементе на каждое слово (shapefest: новый span.Typewriter__wrapper раз в ~3.5 с): у того, что
     на странице сейчас, журнал бывает в 1–3 записи (слово только начало печататься) — и печать то находилась, то
     нет (5 из 8 прогонов). Прошлые слова — отключённые элементы с тем же тегом и классом, что у подключённого:
     из них и из него берётся самый длинный журнал */
  const kk = (el) => `${el.tagName}.${el.getAttribute('class') || ''}`;
  /* «такой же есть на странице» — по DOM, а не по журналу: только что созданный элемент слова ещё без текста */
  const liveMemo = new Map(); const live = { has: (key) => { if (!liveMemo.has(key)) { const [tag, cls] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)]; liveMemo.set(key, [...document.getElementsByTagName(tag)].some((x) => (x.getAttribute('class') || '') === cls)); } return liveMemo.get(key); } };
  const best = new Map();
  for (const [el, log] of mo.text) {
    if (log.length < 4 || !(el.isConnected || live.has(kk(el)))) continue;
    let grow = 0; for (let k = 1; k < log.length; k++) { const a = log[k - 1][1], b = log[k][1]; if (b.startsWith(a) || a.startsWith(b)) grow++; }
    if (grow / (log.length - 1) < 0.7) continue;
    const b = best.get(kk(el)); if (!b || log.length > b.log.length || (log.length === b.log.length && el.isConnected)) best.set(kk(el), { el, log });
  }
  for (const { el, log } of best.values()) {
    const ex = el.closest('[data-expect]');
    out.push({ sig: sig(el), i: els.indexOf(el), log, text: (el.textContent || '').trim().slice(0, 40), expect: ex ? ex.dataset.expect : '' });
    if (out.length >= 10) break;
  }
  return out;
}

/* Библиотеки движения, CSS scroll-driven, плавная прокрутка, правило «меньше движения». */
function libsInPage() {
  const w = window; const q = (s) => { try { return document.querySelectorAll(s).length; } catch (e) { return 0; } };
  const libs = []; const add = (name, detail) => libs.push(detail ? `${name} (${detail})` : name);
  if (w.gsap) { let n = '?'; try { n = w.ScrollTrigger && w.ScrollTrigger.getAll ? w.ScrollTrigger.getAll().length : 0; } catch (e) { /* нет */ } add('GSAP', w.ScrollTrigger ? `ScrollTrigger ×${n}` : ''); }
  if (w.Lenis || w.lenis || document.documentElement.classList.contains('lenis')) add('Lenis — плавная прокрутка');
  if (w.LocomotiveScroll || q('[data-scroll-container]')) add('Locomotive Scroll');
  if (w.AOS || q('[data-aos]')) add('AOS', `${q('[data-aos]')} блоков`);
  if (w.Swiper || q('.swiper')) add('Swiper');
  if (w.Splide || q('.splide')) add('Splide');
  if (q('[data-framer-appear-id], [data-framer-component-type], [data-framer-name]')) add('Framer', `появлений ${q('[data-framer-appear-id]')}`);
  if (document.documentElement.classList.contains('w-mod-ix') || q('[data-w-id]')) add('Webflow Interactions');
  if (q('.t-animate, [data-animate-style], .t-animate_started')) add('Tilda', `анимированных блоков ${q('.t-animate, [data-animate-style]')}`);
  if (q('lottie-player, dotlottie-player') || w.lottie || w.bodymovin) add('Lottie');
  if (w.anime) add('anime.js');
  if (w.Motion || w.motion) add('Motion One / Framer Motion');
  if (w.THREE) add('Three.js');
  if (w.barba || q('[data-barba]')) add('Barba — переходы страниц');
  if (w.ScrollReveal) add('ScrollReveal');
  if (q('.wow')) add('WOW.js');
  if (w.Rellax || q('.rellax')) add('Rellax');
  let scrollDriven = 0, reducedRule = false, keyframes = 0, unreadable = 0;
  const walk = (rules) => { for (const r of rules) {
    const t = r.cssText || '';
    if (r.type === CSSRule.KEYFRAMES_RULE) keyframes++;
    if (/animation-timeline|view-timeline|scroll-timeline/.test(t) && r.type === CSSRule.STYLE_RULE) scrollDriven++;
    if (r.type === CSSRule.MEDIA_RULE && /prefers-reduced-motion/.test(r.conditionText || '')) reducedRule = true;
    if (r.cssRules && r.type !== CSSRule.KEYFRAMES_RULE) walk(r.cssRules);
  } };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) { unreadable++; } }
  if (scrollDriven) add('CSS scroll-driven (animation-timeline)', `${scrollDriven} правил`);
  const smooth = getComputedStyle(document.documentElement).scrollBehavior === 'smooth';
  return { libs, scrollDriven, reducedRule, keyframes, unreadable, smoothCss: smooth };
}

/* Блоки WOW.js (.wow) после прохода прокруткой: размер, класс animate.css (fadeInUp, slideInLeft, animate__…),
   animation-name (style — его ставит WOW при показе — или вычисленный), индекс под наблюдением. Для заметки, почему
   блок не стал строкой появления: 0×0 на этом экране или без класса анимации (WOW только показывает) —
   mamuka.rest/about: 2 блока .wow, discover пишет «появляются при прокрутке: 2», а движения у них нет */
function wowInPage() {
  const els = window.__moEls || [];
  const AN = /^(animate__)?(bounce|flash|pulse|rubberBand|shake|headShake|swing|tada|wobble|jello|heartBeat|hinge|jackInTheBox)$|^(animate__)?(back|bounce|fade|flip|lightSpeed|rotate|roll|zoom|slide)(In|Out)[A-Za-z]*$/;
  return [...document.querySelectorAll('.wow')].slice(0, 80).map((el) => {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { i: els.indexOf(el), sig: sig(el), w: Math.round(r.width), h: Math.round(r.height), cls: [...el.classList].find((c) => AN.test(c)) || '',
      name: el.style.animationName || s.animationName, display: s.display };
  });
}

/* Ключевые кадры CSS-анимации по имени: первый и последний кадр (для «из → в»). */
function keyframesInPage(names) {
  const out = {};
  const want = new Set(names);
  const walk = (rules) => { for (const r of rules) {
    if (r.type === CSSRule.KEYFRAMES_RULE && want.has(r.name) && !out[r.name]) {
      const frames = [...r.cssRules].map((k) => ({ at: k.keyText, css: k.style.cssText.slice(0, 200) }));
      out[r.name] = frames;
    } else if (r.cssRules && r.type !== CSSRule.KEYFRAMES_RULE) walk(r.cssRules);
  } };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) { /* чужой домен */ } }
  return out;
}

/* Что прокручивается: документ или блок на весь экран (у «приложений» body{height:100%;overflow:auto}).
   Ссылка — в window.__rwScroller (так же её понимает lib.scrollToY). */
function detectScrollerInPage() {
  const se = document.scrollingElement || document.documentElement;
  const docH = Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0);
  if (docH > innerHeight + 2) { window.__rwScroller = null; return docH; }
  let best = null;
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    if (el.scrollHeight <= el.clientHeight + 50 || el.clientHeight < innerHeight * 0.5 || el.clientWidth < innerWidth * 0.5) continue;
    if (!/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
    if (!best || el.scrollHeight > best.scrollHeight) best = el;
  }
  window.__rwScroller = best;
  return best ? best.scrollHeight : docH;
}

/* Все заметные элементы: список живёт в window.__moEls, дальше на него ссылаются индексами. */
function collectInPage(maxN) {
  const skip = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR|HEAD|TITLE|SOURCE|TRACK|WBR|PARAM)$/;
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (skip.test(el.tagName)) continue;
    if (el.ownerSVGElement) continue;                             /* внутренности svg — только сам svg */
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 100 && !(el.childElementCount === 0 && (el.textContent || '').trim())) {
      const p = getComputedStyle(el).position;                     /* полоса прогресса начинается с ширины 0 */
      if (!(p === 'fixed' || p === 'sticky') || getComputedStyle(el).display === 'none') continue;
    }
    out.push(el);
    if (out.length >= maxN) break;
  }
  window.__moEls = out;
  window.__moS = { steps: [], series: new Map(), hot: new Set() };
  return out.length;
}

/* Снимок состояния: у каждого элемента — строка, только если что-то изменилось с прошлой
   (положение в документе, размер, transform, прозрачность, фильтр, шторка, видимость, фон, текст листа,
   верх родителя, прокрутка вбок своего содержимого — scrollLeft: лента разделов с overflow-x едет так, а не transform). */
function sampleInPage(tag) {
  const S = window.__moS; const els = window.__moEls || [];
  const sy = Math.round(window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller.scrollTop : scrollY);
  const step = S.steps.length; S.steps.push({ tag, sy, t: Math.round(performance.now()) });
  let changed = 0;
  for (let i = 0; i < els.length; i++) {
    const el = els[i]; if (!el.isConnected) continue;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    let leaf = ''; for (const c of el.childNodes) if (c.nodeType === 3) leaf += c.textContent; leaf = leaf.trim().slice(0, 60);
    const v = [Math.round(r.top + sy), Math.round(r.left), Math.round(r.width), Math.round(r.height),
      s.transform === 'none' ? '' : s.transform, Math.round(parseFloat(s.opacity) * 1000) / 1000,
      s.filter === 'none' ? '' : s.filter, s.clipPath === 'none' ? '' : s.clipPath,
      s.visibility === 'hidden' ? 1 : 0, s.backgroundColor, leaf, el.parentElement ? Math.round(el.parentElement.getBoundingClientRect().top + sy) : Math.round(r.top + sy),
      Math.round(el.scrollLeft)];
    const h = S.series.get(i);
    if (!h) { S.series.set(i, { rows: [[step, v]] }); continue; }
    const last = h.rows[h.rows.length - 1][1];
    let diff = false; for (let k = 0; k < v.length; k++) if (v[k] !== last[k]) { diff = true; break; }
    if (diff) { h.rows.push([step, v]); S.hot.add(i); changed++; }
  }
  return { step, sy, changed };
}

/* Где за окно «время» текст листа менялся хотя бы дважды — кандидаты на печать/смену слов. */
/* Кандидаты на частое наблюдение текста: текст сменился хоть раз за окно «время». Печать с паузой на слове
   (shapefest: слово стоит несколько секунд) за 6 с меняется и один раз — при пороге «две смены» её теряли. */
function textCandidatesInPage() {
  const S = window.__moS; const out = [];
  for (const [i, h] of S.series) { let n = 0; for (let k = 1; k < h.rows.length; k++) if (h.rows[k][1][10] !== h.rows[k - 1][1][10]) n++; if (n >= 1) out.push(i); }
  return out.slice(0, 6);
}
/* Частая выборка текста у этих элементов (печать: знак за 30–80 мс, пауза на слове — секунды). */
async function textWatchInPage(arg) {
  const els = window.__moEls || []; const out = {}; for (const i of arg.idx) out[i] = [];
  const t0 = performance.now();
  while (performance.now() - t0 < arg.ms) {
    for (const i of arg.idx) { const el = els[i]; let txt = ''; if (el) for (const c of el.childNodes) if (c.nodeType === 3) txt += c.textContent; txt = txt.trim().slice(0, 60); const a = out[i]; if (!a.length || a[a.length - 1][1] !== txt) a.push([Math.round(performance.now()), txt]); }
    await new Promise((r) => setTimeout(r, 40));
  }
  return out;
}

/* Сумма состояний «горячих» элементов — улеглось ли движение после шага прокрутки. */
function hotHashInPage() {
  const S = window.__moS; const els = window.__moEls || []; let h = '';
  for (const i of S.hot) { const el = els[i]; if (!el || !el.isConnected) continue; const s = getComputedStyle(el); h += s.transform + s.opacity + s.filter + s.clipPath + '|'; }
  const busy = document.getAnimations().filter((a) => { try { const t = a.effect.getComputedTiming(); return a.playState === 'running' && t.iterations !== Infinity && t.endTime !== Infinity && !(a.timeline && a.timeline.constructor && /Scroll|View/.test(a.timeline.constructor.name)); } catch (e) { return false; } }).length;
  return { h, busy };
}

/* Итог по элементам, которые менялись: ряды, подпись и то, что нужно для разбора. */
function seriesOutInPage() {
  const S = window.__moS; const els = window.__moEls || []; const out = [];
  const at = new Map(els.map((e, k) => [e, k]));
  /* Tilda: ключ элемента Zero Block (recid:elemid, группы recid:g<id> — как в tilda.mjs), блок появления и служебное —
     чтобы замер сопоставить с пунктом из атрибутов Tilda (точнее замера) */
  const root = document.getElementById('allrecords');
  const TILDA = !!(root && root.hasAttribute('data-tilda-page-id')) || !!document.querySelector('.t-rec[data-record-type]');
  const tkeyOf = (el) => {
    if (!TILDA) return null;
    const ab = el.closest('.t396__artboard'); const rid = ab ? ab.getAttribute('data-artboard-recid') : null; const keys = [];
    const e = el.closest('.t396__elem'); if (e && rid) keys.push(`${rid}:${e.getAttribute('data-elem-id')}`);
    for (let g = el.closest('.t396__group'); g && rid; g = g.parentElement ? g.parentElement.closest('.t396__group') : null) keys.push(`${rid}:g${g.getAttribute('data-group-id')}`);
    const an = el.closest('[data-animate-style]'); const rec = el.closest('.t-rec');
    return { keys, rec: rec ? rec.id : null, std: !!(an && !an.closest('.t396')), svc: svc(el) || el.id === 'allrecords' || el.classList.contains('t-records') || el.classList.contains('t360__bar') };
  };
  for (const [i, h] of S.series) {
    if (h.rows.length < 2) continue;
    const el = els[i]; if (!el) continue;
    const s = getComputedStyle(el);
    const p = el.parentElement;
    const cls = (el.getAttribute && el.getAttribute('class')) || '';
    const no = el.closest('[data-expect-not]');                    /* стенд: на этом блоке такого вида быть не должно */
    const tk = tkeyOf(el);
    out.push({
      ...(tk ? { tk } : {}),
      i, sig: sig(el), tag: el.tagName.toLowerCase(), cls: String(cls).slice(0, 120), id: el.id || '',
      parent: p ? sig(p) : '', pi: p && at.has(p) ? at.get(p) : -1, idx: p ? [...p.children].indexOf(el) : 0, siblings: p ? p.children.length : 0,
      ...(no ? { expectNot: no.dataset.expectNot } : {}),
      position: s.position, text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      trans: { dur: s.transitionDuration, delay: s.transitionDelay, ease: s.transitionTimingFunction, prop: s.transitionProperty },
      anim: { name: s.animationName, dur: s.animationDuration, delay: s.animationDelay, ease: s.animationTimingFunction, iter: s.animationIterationCount, timeline: s.animationTimeline || '' },
      ...(el.classList.contains('wow') ? { wow: { offset: el.getAttribute('data-wow-offset') || '', duration: el.getAttribute('data-wow-duration') || '', delay: el.getAttribute('data-wow-delay') || '' } } : {}),
      expect: el.closest('[data-expect]') ? { kind: el.closest('[data-expect]').dataset.expect, self: el.hasAttribute('data-expect') } : null,
      expectInside: [...el.querySelectorAll('[data-expect]')].map((x) => x.dataset.expect).slice(0, 4),
      rows: h.rows,
    });
  }
  return { steps: S.steps, series: out };
}
/* Лёгкий промежуточный итог окна «время» — продлевать ли его: ряды менявшихся элементов и подпись родителя. */
function timePeekInPage() {
  const S = window.__moS; const els = window.__moEls || []; const out = [];
  for (const i of S.hot) { const h = S.series.get(i); const el = els[i]; if (!h || !el || h.rows.length < 2) continue; out.push({ i, parent: el.parentElement ? sig(el.parentElement) : '', rows: h.rows }); }
  return { t: S.steps.map((s) => s.t), series: out };
}

/* Бесконечные и идущие анимации (getAnimations): цель, имя, длительность, ключевые кадры. */
function animationsInPage() {
  return document.getAnimations().map((a) => {
    let t = {}; try { t = a.effect.getTiming(); } catch (e) { /* нет */ }
    let props = []; let first = '', last = '';
    try { const kf = a.effect.getKeyframes(); props = [...new Set(kf.flatMap((k) => Object.keys(k)).filter((k) => !/^(offset|computedOffset|easing|composite)$/.test(k)))]; first = JSON.stringify(kf[0] || {}).slice(0, 200); last = JSON.stringify(kf[kf.length - 1] || {}).slice(0, 200); } catch (e) { /* нет */ }
    const target = a.effect && a.effect.target;
    const i = target && window.__moEls ? window.__moEls.indexOf(target) : -1;
    const tl = a.timeline && a.timeline.constructor ? a.timeline.constructor.name : '';
    return { i, target: target ? sig(target) : '', pseudo: (a.effect && a.effect.pseudoElement) || '', kind: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || '',
      state: a.playState, duration: typeof t.duration === 'number' ? Math.round(t.duration) : String(t.duration || ''), delay: Math.round(t.delay || 0), easing: t.easing || '',
      iterations: t.iterations === Infinity ? 'infinite' : t.iterations, direction: t.direction || '', fill: t.fill || '', props, first, last, timeline: /Scroll|View/.test(tl) ? tl : '' };
  }).slice(0, 400);
}

/* События перехвата: разложить по индексам элементов. */
function eventsInPage() {
  const mo = window.__mo || { ev: [], waapi: [], cls: [], style: new Map() }; const els = window.__moEls || [];
  const idx = (el) => els.indexOf(el);
  const styleHot = [];
  for (const [el, s] of mo.style) if (s.n >= 5) styleHot.push({ i: idx(el), sig: sig(el), n: s.n, first: s.first, last: s.last });
  /* элементы с событиями — подпись, текст, data-expect, переход и анимация: вход при загрузке, закончившийся до окна
     «время» (страница открылась позже конца входа — окно-заставку lib ждёт до 2 с), в рядах замеров не виден */
  const who = new Map();
  for (const e of [...mo.ev, ...mo.waapi]) {
    const el = e.el; if (!el || el.nodeType !== 1 || who.has(el) || who.size >= 300) continue;
    const i = idx(el); if (i < 0) continue; const s = getComputedStyle(el); const ex = el.closest('[data-expect]');
    who.set(el, { i, sig: sig(el), text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), expect: ex ? { kind: ex.dataset.expect, self: el.hasAttribute('data-expect') } : null,
      trans: { dur: s.transitionDuration, delay: s.transitionDelay, ease: s.transitionTimingFunction, prop: s.transitionProperty },
      anim: { name: s.animationName, dur: s.animationDuration, delay: s.animationDelay, ease: s.animationTimingFunction, iter: s.animationIterationCount, timeline: s.animationTimeline || '' } });
  }
  return {
    who: [...who.values()],
    ev: mo.ev.map((e) => ({ t: e.t, type: e.type, i: idx(e.el), sig: e.el && e.el.nodeType === 1 ? sig(e.el) : '', name: e.name || '', prop: e.prop || '', dur: e.dur || 0, pseudo: e.pseudo || '' })),
    waapi: mo.waapi.map((w) => ({ ...w, el: undefined, i: idx(w.el), sig: w.el && w.el.nodeType === 1 ? sig(w.el) : '' })),
    cls: mo.cls.map((c) => ({ t: c.t, i: idx(c.el), sig: c.el && c.el.nodeType === 1 ? sig(c.el) : '', added: c.added, removed: c.removed })),
    styleHot: styleHot.sort((a, b) => b.n - a.n).slice(0, 60), capped: mo.capped,
  };
}

/* Образцы для наведения: кнопки, карточки-ссылки, пункты меню, ссылки в тексте — по одному на вид. */
function hoverCandidatesInPage(maxN) {
  const seen = new Set(); const out = []; const vw = innerWidth;
  const kindOf = (el) => {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    const hasImg = !!el.querySelector('img, picture, video, canvas, svg, [style*="background-image"]') || [...el.querySelectorAll('*')].some((x) => getComputedStyle(x).backgroundImage !== 'none');
    /* логотип: первая ссылка шапки, ссылка на главную или с «logo» в классе — свой вид, чтобы сверка не путала его с карточкой или меню */
    /* хлебные крошки — не шапка и не меню: «Главная» в них — ссылка в тексте, а не логотип */
    const crumbs = (n) => !!n && /crumb|хлебн|вы здесь|you are here/i.test(`${n.className || ''} ${n.getAttribute('aria-label') || ''}`);
    const head0 = el.closest('header, [class*="header"], nav'); const head = head0 && !crumbs(head0) ? head0 : null;
    const firstLink = head && head.querySelector('a[href]') === el;
    const href = el.getAttribute('href') || '';
    const isHome = href === '/' || href === './' || href === '#' || href === location.origin + '/';
    if (el.tagName === 'A' && (/logo/i.test(String(el.className || '')) || (head && ((firstLink && (!!el.querySelector('img, svg') || isHome)) || isHome)))) return 'logo';
    const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
    if (hasImg && r.width * r.height > 15000) return 'card';
    const inNav = el.closest('header, nav');
    if (inNav && !crumbs(inNav) && el.tagName === 'A' && !filled) return 'nav';
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || (filled && parseFloat(s.paddingLeft) >= 8) || parseFloat(s.borderTopWidth) >= 1) return 'button';
    if (el.tagName === 'A') return 'link';
    return '';
  };
  const els = [...document.querySelectorAll('a[href], button, [role="button"], [class*="card"]')];
  window.__moHover = [];
  for (const el of els) {
    const r = el.getBoundingClientRect(); if (!(r.width > 8 && r.height > 8)) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || parseFloat(s.opacity) < 0.1 || s.display === 'none') continue;
    const kind = kindOf(el); if (!kind) continue;
    const key = kind + ':' + el.tagName + '.' + [...el.classList].filter((c) => !/active|current|is-|js-/.test(c)).slice(0, 2).join('.');
    if (seen.has(key)) continue; seen.add(key);
    window.__moHover.push(el);
    out.push({ h: window.__moHover.length - 1, kind, sig: sig(el), text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), expect: el.closest('[data-expect]') ? el.closest('[data-expect]').dataset.expect : '' });
    if (out.length >= maxN) break;
  }
  return out;
}

/* Состояние элемента наведения: он сам, самая крупная картинка внутри, ::after/::before, первый текст. */
function hoverStateInPage(h) {
  const el = window.__moHover[h]; if (!el || !el.isConnected) return null;
  const pick = (x, pseudo) => { const s = getComputedStyle(x, pseudo || null); return { transform: s.transform, opacity: s.opacity, bg: s.backgroundColor, color: s.color, shadow: s.boxShadow, border: s.borderColor, filter: s.filter, deco: s.textDecorationLine, width: s.width, outline: s.outlineStyle !== 'none' ? s.outlineColor : '' }; };
  let pic = null, area = 0;
  for (const x of el.querySelectorAll('img, picture, video, canvas, div, span')) { const r = x.getBoundingClientRect(); const bg = getComputedStyle(x).backgroundImage !== 'none'; if ((/IMG|PICTURE|VIDEO|CANVAS/.test(x.tagName) || bg) && r.width * r.height > area) { area = r.width * r.height; pic = x; } }
  const durs = [el, pic].filter(Boolean).flatMap((x) => getComputedStyle(x).transitionDuration.split(',').map((d) => parseFloat(d) * (/ms/.test(d) ? 1 : 1000)));
  const pseudoDur = ['::after', '::before'].flatMap((p) => getComputedStyle(el, p).transitionDuration.split(',').map((d) => parseFloat(d) * (/ms/.test(d) ? 1 : 1000)));
  const r = el.getBoundingClientRect();
  return { self: pick(el), pic: pic ? pick(pic) : null, picSig: pic ? sig(pic) : '', after: pick(el, '::after'), before: pick(el, '::before'),
    dur: Math.round(Math.max(0, ...durs, ...pseudoDur)), box: { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }, ease: getComputedStyle(pic || el).transitionTimingFunction };
}

/* Для мыши: transform элементов первого экрана и центры закреплённых элементов. */
function mouseSnapInPage() {
  const els = window.__moEls || []; const vh = innerHeight; const out = {};
  for (let i = 0; i < els.length; i++) {
    const el = els[i]; if (!el.isConnected) continue; const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue;
    const s = getComputedStyle(el);
    const ex = el.closest('[data-expect]');
    out[i] = [s.transform, Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), s.position, sig(el), ex ? ex.dataset.expect : ''];
  }
  return out;
}

/* ---------- клики: снимки всех элементов до и после нажатия ---------- */

/* Снимок состояния всех элементов: видим ли (итоговая прозрачность в порядке документа, доля коробки,
   не обрезанная предками с overflow, пересечение с окном), коробка, прозрачность, transform, шторка, цвета.
   name 'base' — заново собрать список элементов и начать журнал; остальные — снимок в window.__ckS[name]. */
function ckSnapInPage(name) {
  const SKIPT = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR|WBR|SOURCE|TRACK)$/;
  if (name === 'base') {
    window.__ckEls = [...document.body.querySelectorAll('*')].filter((e) => !SKIPT.test(e.tagName) && !e.ownerSVGElement).slice(0, 9000);
    window.__ckS = {}; window.__ckSet = new Set(window.__ckEls);
  }
  const els = window.__ckEls; const vw = innerWidth, vh = innerHeight;
  const effM = new Map(), clipM = new Map(); const out = new Array(els.length);
  const INF = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!el.isConnected) { out[i] = null; continue; }
    const s = getComputedStyle(el); const r = el.getBoundingClientRect(); const p = el.parentElement;
    const e = (s.display === 'none' ? 0 : parseFloat(s.opacity)) * (p && effM.has(p) ? effM.get(p) : 1);
    effM.set(el, s.visibility === 'hidden' ? 0 : e);
    let c = p && clipM.has(p) ? clipM.get(p) : INF;
    if (s.position === 'fixed') c = INF;                              /* закреплённое предки не обрезают */
    const clipOf = { l: Math.max(c.l, r.left), t: Math.max(c.t, r.top), r: Math.min(c.r, r.right), b: Math.min(c.b, r.bottom) };
    const cl = s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none' ? { l: Math.max(c.l, r.left), t: Math.max(c.t, r.top), r: Math.min(c.r, r.right), b: Math.min(c.b, r.bottom) } : c;
    clipM.set(el, cl);
    const area = r.width * r.height;
    const shownA = Math.max(0, clipOf.r - clipOf.l) * Math.max(0, clipOf.b - clipOf.t);
    const inView = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
    /* checkVisibility: закрытый details и content-visibility: hidden прячут содержимое, оставляя ему коробку */
    const vis = area > 0 && e > 0.05 && s.visibility !== 'hidden' && shownA >= area * 0.25 && inView && (!el.checkVisibility || el.checkVisibility()) ? 1 : 0;
    out[i] = [vis, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), Math.round(parseFloat(s.opacity) * 100) / 100,
      s.transform === 'none' ? '' : s.transform, s.clipPath === 'none' ? '' : s.clipPath, s.backgroundColor, s.color, Math.round(shownA), s.display === 'none' ? 1 : 0];
  }
  window.__ckS[name] = { t: Math.round(performance.now()), rows: out };
  if (name === 'base') { const mo = window.__mo; if (mo) { mo.rec = new Map(); window.__ckEv0 = mo.ev.length; window.__ckWa0 = mo.waapi.length; } }
  return { n: els.length, lock: getComputedStyle(document.documentElement).overflow + '/' + getComputedStyle(document.body).overflow };
}

/* Что изменилось между снимком base и end: элементы с разницей (видимость, размер, transform, прозрачность,
   шторка, цвета), у каждого — ближайший изменившийся предок, промежуточные снимки, переходы и события
   после клика (длительность, кривая), новые узлы в DOM. trg — метка нажатого элемента. */
function ckDiffInPage(arg) {
  const els = window.__ckEls || []; const S = window.__ckS || {}; const B = S.base, Z = S.end; if (!B || !Z) return null;
  const mids = (arg.mids || []).filter((n) => S[n]).map((n) => S[n]);
  const trg = document.querySelector(arg.trg);
  const tfDiff = (a, b) => a !== b;
  const changed = []; const P = S.pre;
  const differs = (a, z) => a[0] !== z[0] || Math.abs(a[3] - z[3]) > 3 || Math.abs(a[4] - z[4]) > 3 || a[6] !== z[6] || Math.abs(a[5] - z[5]) > 0.04 || a[7] !== z[7];
  let busy = 0;
  for (let i = 0; i < els.length; i++) {
    const a = B.rows[i], z = Z.rows[i]; if (!a || !z) continue;
    /* менялось и без клика (печать, бегущая строка, карусель, петля) — между двумя снимками до нажатия */
    if (P && P.rows[i] && differs(a, P.rows[i])) { busy++; continue; }
    const d = a[0] !== z[0] || Math.abs(a[3] - z[3]) > 3 || Math.abs(a[4] - z[4]) > 3 || tfDiff(a[6], z[6]) || Math.abs(a[5] - z[5]) > 0.04 || a[7] !== z[7] || a[8] !== z[8] || a[9] !== z[9] || Math.abs(a[1] - z[1]) > 3 || Math.abs(a[2] - z[2]) > 3;
    if (d) changed.push(i);
  }
  /* сдвиг коробки без своего transform и размера — страница под раскрытым блоком съехала вниз: не в счёт */
  const own = changed.filter((i) => { const a = B.rows[i], z = Z.rows[i]; return !(a[0] === z[0] && a[3] === z[3] && a[4] === z[4] && a[6] === z[6] && Math.abs(a[5] - z[5]) <= 0.04 && a[7] === z[7] && a[8] === z[8] && a[9] === z[9]); });
  const set = new Set(own); const idx = new Map(els.map((e, k) => [e, k]));
  const ev = (window.__mo ? window.__mo.ev.slice(window.__ckEv0 || 0) : []).filter((e) => e.type === 'trans-end' || e.type === 'anim-end');
  const wa = window.__mo ? window.__mo.waapi.slice(window.__ckWa0 || 0) : [];
  const rec = window.__mo && window.__mo.rec ? window.__mo.rec : new Map();
  const t0 = arg.t0;
  const out = own.slice(0, 400).map((i) => {
    const el = els[i]; let par = -1;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const k = idx.get(p); if (k !== undefined && set.has(k)) { par = k; break; } }
    const s = getComputedStyle(el);
    const inside = (x) => x && x.nodeType === 1 && (x === el || el.contains(x));
    const evs = ev.filter((e) => e.el === el).map((e) => ({ t: e.t - t0, dur: e.dur, prop: e.prop || e.name }));
    const was = wa.filter((w) => w.el === el).map((w) => ({ t: w.t - t0, dur: w.duration, easing: w.easing, props: w.props, first: w.first, last: w.last }));
    return { i, par, sig: sig(el), tag: el.tagName.toLowerCase(), text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
      trigger: !!trg && (el === trg || el.contains(trg) || trg.contains(el)), inTrigger: !!trg && trg.contains(el) && el !== trg, isTrigger: el === trg,
      base: B.rows[i], end: Z.rows[i], mids: mids.map((m) => ({ t: m.t - t0, v: m.rows[i] })),
      trans: { prop: s.transitionProperty, dur: s.transitionDuration, ease: s.transitionTimingFunction, delay: s.transitionDelay },
      anim: s.animationName !== 'none' ? { name: s.animationName, dur: s.animationDuration, ease: s.animationTimingFunction } : null,
      ev: evs, waapi: was, styleLast: rec.has(el) ? rec.get(el) - t0 : null, childEv: ev.some((e) => e.el !== el && inside(e.el)) };
  });
  /* новые узлы: появились в DOM после base и видны (меню, которое вставляется скриптом) */
  const added = []; const known = window.__ckSet || new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (known.has(el) || el.ownerSVGElement || /^(SCRIPT|STYLE|LINK|META)$/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect(); if (r.width * r.height < 400 || r.bottom <= 0 || r.top >= innerHeight) continue;
    if (added.some((a) => a.el.contains(el))) continue;
    const s = getComputedStyle(el);
    added.push({ el, sig: sig(el), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), op: parseFloat(s.opacity), tf: s.transform === 'none' ? '' : s.transform, trans: { dur: s.transitionDuration, ease: s.transitionTimingFunction }, anim: s.animationName !== 'none' ? { name: s.animationName, dur: s.animationDuration, ease: s.animationTimingFunction } : null });
    if (added.length >= 6) break;
  }
  if (window.__mo) window.__mo.rec = null;
  return { changed: out, total: own.length, busy, added: added.map((a) => ({ ...a, el: undefined })), url: location.href,
    lock: getComputedStyle(document.documentElement).overflow + '/' + getComputedStyle(document.body).overflow };
}

/* Точка нажатия по метке: элемент — в середину окна (закреплённое — как есть), центр коробки, в точке — он сам.
   Точка — в координатах видимого окна (screenPt = SCREEN_POINT_FN из clicks.mjs: сдвиг на offsetLeft/offsetTop,
   без умножения на visualViewport.scale — CDP масштабирует сам; «× scale» при scale 1.056 после discover
   промахивался на 23 px): на телефоне у страницы шире экрана окно раскладки больше видимого, и клик по
   getBoundingClientRect уходил мимо; точка за краем экрана не нажимается. Закреплённое (меню в шапке): видимое
   окно сначала — в начало окна раскладки, после кликов внизу оно остаётся сдвинутым (offsetTop 182), scrollTo(0, 0)
   его не возвращает. lx, ly — в окне раскладки (для вырезки). { sel, noScroll: true } — пересчитать прямо перед
   кликом: наведение сдвигает видимое окно. */
function ckPointInPage(arg) {
  const sel = typeof arg === 'string' ? arg : arg.sel; const noScroll = typeof arg === 'object' && !!arg.noScroll;
  const el = document.querySelector(sel); if (!el) return { skip: 'пропал из DOM' };
  let fixed = false; for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') { fixed = true; break; } }
  if (!fixed && !noScroll) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const vv0 = window.visualViewport; if (fixed && !noScroll && vv0 && (vv0.offsetTop || vv0.offsetLeft)) document.documentElement.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' });
  /* у details нажимается summary: у раскрытого «верх + 30 px» — уже текст ответа */
  const aim = el.matches('details') ? el.querySelector('summary') || el : el;
  const r = aim.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return { skip: 'не виден' };
  const x = Math.round(r.left + Math.min(r.width / 2, 160)), y = Math.round(r.top + Math.min(r.height / 2, 30));
  const hit = document.elementFromPoint(x, y);
  if (!hit || !(el.contains(hit) || hit.contains(el))) return { skip: 'точку нажатия закрывает другой элемент' };
  const a = hit.closest('a[href]'); if (a && !/^(#|javascript:)/i.test(a.getAttribute('href') || '')) return { skip: 'в точке нажатия ссылка на другой адрес' };
  for (const o of document.querySelectorAll('[data-rw-ck-hit]')) o.removeAttribute('data-rw-ck-hit');
  const btn = hit.closest('button, a, [role="button"], [role="tab"], summary, [aria-expanded]');
  (btn && el.contains(btn) ? btn : el.contains(hit) ? hit : el).setAttribute('data-rw-ck-hit', '');
  const s = screenPt(x, y); if (s.off) return { skip: 'точка нажатия за краем экрана (страница шире экрана)' };
  return { x: s.x, y: s.y, lx: x, ly: y, text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30), sig: sig(el), expect: el.closest('[data-expect]') ? el.closest('[data-expect]').dataset.expect : '' };
}

/* =====================================================================
   Разбор в Node
   ===================================================================== */

const round = (x, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; };
const pct = (x) => `${Math.round(x * 100)}%`;
function decompose(tf) {
  const id = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, rx: 0, ry: 0 };
  if (!tf) return id;
  let m = /^matrix\(([^)]+)\)$/.exec(tf);
  if (m) {
    const [a, b, c, d, e, f] = m[1].split(',').map(Number); const sx = Math.hypot(a, b);
    return { tx: e, ty: f, sx, sy: sx ? (a * d - b * c) / sx : 1, rot: Math.atan2(b, a) * 180 / Math.PI, rx: 0, ry: 0 };
  }
  m = /^matrix3d\(([^)]+)\)$/.exec(tf);
  if (m) {
    const v = m[1].split(',').map(Number);
    return { tx: v[12], ty: v[13], sx: Math.hypot(v[0], v[1], v[2]), sy: Math.hypot(v[4], v[5], v[6]), rot: Math.atan2(v[1], v[0]) * 180 / Math.PI,
      rx: Math.atan2(v[6], v[10]) * 180 / Math.PI, ry: Math.asin(Math.max(-1, Math.min(1, -v[2]))) * 180 / Math.PI };
  }
  return id;
}
const blurOf = (f) => { const m = /blur\(([\d.]+)px\)/.exec(f || ''); return m ? Number(m[1]) : 0; };
/* шторка: доля видимой площади по inset(…) в процентах/пикселях */
function clipShare(cp, w, h) {
  if (!cp) return 1;
  const m = /inset\(([^)]+)\)/.exec(cp); if (!m) return null;
  const parts = m[1].replace(/round.*$/, '').trim().split(/\s+/).map((x) => ({ v: parseFloat(x), pc: /%/.test(x) }));
  const [t, r, b, l] = parts.length === 1 ? [parts[0], parts[0], parts[0], parts[0]] : parts.length === 2 ? [parts[0], parts[1], parts[0], parts[1]] : parts.length === 3 ? [parts[0], parts[1], parts[2], parts[1]] : parts;
  const px = (q, size) => (q.pc ? q.v / 100 : size ? q.v / size : 0);
  return Math.max(0, 1 - px(l, w) - px(r, w)) * Math.max(0, 1 - px(t, h) - px(b, h));
}
const msOf = (s) => String(s || '').split(',').map((d) => parseFloat(d) * (/ms/.test(d) ? 1 : 1000)).filter((x) => !Number.isNaN(x));
/* linear(0, 0.0184, …) из десятков точек — пружина (Framer, Motion): в таблицу коротко, значение целиком — в json */
const easeShort = (e) => { const s = String(e || ''); const m = /^linear\((.*)\)$/.exec(s); return m && s.length > 40 ? `пружина — linear() из ${m[1].split(',').length} точек (целиком в json)` : s; };
const easeName = (e) => String(e || '').split(/,(?![^(]*\))/)[0].trim();

/* подпись без состояний и номеров — для объединения одинаковых элементов */
function pattern(sig) {
  return String(sig || '').replace(/#[\w-]+/, '').split('.').filter((c, k) => k === 0 || !/^(in|is-|active|visible|show|shown|animated|aos-|t-animate_started|framer-v-|js-|done|loaded|current)/.test(c)).slice(0, 3).join('.');
}

/* Значения свойств по шагам: ряды разворачиваются на все шаги (значение держится до следующего ряда). */
function unroll(rows, nSteps) {
  const out = new Array(nSteps); let k = 0; let cur = rows[0][1];
  for (let s = 0; s < nSteps; s++) { while (k < rows.length && rows[k][0] <= s) { cur = rows[k][1]; k++; } out[s] = s < rows[0][0] ? null : cur; }
  return out;
}
function propsOf(v) {
  if (!v) return null;
  const d = decompose(v[4]);
  return { docTop: v[0], left: v[1], w: v[2], h: v[3], tx: d.tx, ty: d.ty, sc: (d.sx + d.sy) / 2, rot: d.rot, rx: d.rx, ry: d.ry, op: v[5], blur: blurOf(v[6]), clip: clipShare(v[7], v[2], v[3]), hid: v[8], bg: v[9], text: v[10], ptop: v[11], sl: v[12] || 0, moved: !!v[4] };
}
const EPS = { tx: 0.6, ty: 0.6, sc: 0.012, rot: 0.6, rx: 0.8, ry: 0.8, op: 0.02, blur: 0.4, clip: 0.02, sl: 2 };
const NAMES = { tx: 'сдвиг X', ty: 'сдвиг Y', sc: 'масштаб', rot: 'поворот', rx: 'наклон X', ry: 'наклон Y', op: 'прозрачность', blur: 'размытие', clip: 'шторка (видно)' };
const UNIT = { tx: ' px', ty: ' px', rot: '°', rx: '°', ry: '°', blur: ' px', sc: '', op: '', clip: '' };
const fmtV = (k, v) => (k === 'clip' ? pct(v) : k === 'sc' || k === 'op' ? String(round(v, 2)) : `${round(v, 1)}${UNIT[k]}`);

/* линейная подгонка y = a + b·x и доля объяснённого разброса */
function fit(xs, ys) {
  const n = xs.length; if (n < 2) return { b: 0, a: ys[0] || 0, r2: 0 };
  const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const b = sxx ? sxy / sxx : 0; const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 1;
  return { b, a: my - b * mx, r2 };
}

/* ---------- петли во времени: развороты, что это за движение, группа соседей ---------- */
/* Окно «время» (--time, 6 с) бывает короче периода: покачивание картинок Framer — 7–13 с, и что увидит окно,
   зависит от фазы (shapefest: 35–37 разных наборов петель на 104 скользящих окнах). Поэтому развороты — с
   гистерезисом (размер шага замера не важен), петля — два разворота и размах от разворота к развороту не гаснет;
   меньше двух разворотов и не встало — «окно короче периода»: окно продлевается кусками по chunk до --time-cap. */
const LOOP = { chunk: 2000, cap: 20000, settleMin: 3000, settleShare: 0.35, decay: 0.5, spanRatio: 3 };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/* Развороты: засчитан, когда значение отошло от последнего экстремума больше чем на h; первый — только если
   он отошёл от начального значения больше чем на eps (иначе окно просто началось у разворота). */
function turningPoints(ts, ys, h, eps) {
  const ext = []; let dir = 0, ref = 0, hi = 0, lo = 0;
  for (let i = 1; i < ys.length; i++) {
    if (dir === 0) {
      if (ys[i] > ys[hi]) hi = i; if (ys[i] < ys[lo]) lo = i;
      if (ys[hi] - ys[i] > h) { if (hi > 0 && ys[hi] - ys[0] > eps) ext.push({ i: hi, t: ts[hi], y: ys[hi], type: 'max' }); dir = -1; ref = i; }
      else if (ys[i] - ys[lo] > h) { if (lo > 0 && ys[0] - ys[lo] > eps) ext.push({ i: lo, t: ts[lo], y: ys[lo], type: 'min' }); dir = 1; ref = i; }
      continue;
    }
    if (dir === 1) { if (ys[i] >= ys[ref]) ref = i; else if (ys[ref] - ys[i] > h) { ext.push({ i: ref, t: ts[ref], y: ys[ref], type: 'max' }); dir = -1; ref = i; } }
    else if (ys[i] <= ys[ref]) ref = i; else if (ys[i] - ys[ref] > h) { ext.push({ i: ref, t: ts[ref], y: ys[ref], type: 'min' }); dir = 1; ref = i; }
  }
  return ext;
}
/* сколько мс в конце наблюдения значение стоит (в пределах eps от последнего) */
const tailFlat = (ts, ys, eps) => { const n = ys.length; let j = n - 1; while (j > 0 && Math.abs(ys[j - 1] - ys[n - 1]) <= eps) j--; return ts[n - 1] - ts[j]; };

/* Одно свойство одного элемента во времени. status: small — едва сдвинулось (smooth — ровно и не встало: начало
   долгой петли), marquee, carousel, decay — пружина/вход (гаснет или встало), loop, settled — доводка,
   spin — вращение (ровная скорость ≥ 10 с), undetermined — окно короче периода, step — один переход между
   площадками (карусель с долгим показом слайда или разовый сдвиг: ждать второго). */
function classifyProp(k, ts, ysIn, vals) {
  const ys = [...ysIn];
  if (k === 'rot') for (let q = 1; q < ys.length; q++) ys[q] -= 360 * Math.round((ys[q] - ys[q - 1]) / 360);   /* 179° → −179° — это +2°, а не разворот */
  /* одиночный выброс (соседи равны, между ними — скачок) — не движение: Framer на кадр растягивает контейнер.
     Только если по обе стороны значение стоит (ещё один замер): при шаге замера 300–400 мс вершина пружины или
     петли между двумя замерами на разных склонах тоже «выброс», и её стирало — пружина выглядела петлёй */
  const still = (q) => q < 1 || q >= ys.length || Math.abs(ys[q] - ys[q - 1]) <= EPS[k];
  for (let q = 1; q + 1 < ys.length; q++) if (Math.abs(ys[q - 1] - ys[q + 1]) <= EPS[k] && Math.abs(ys[q] - ys[q - 1]) > EPS[k] * 3 && still(q - 1) && still(q + 2)) ys[q] = ys[q - 1];
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo;
  const obs = ts[ts.length - 1] - ts[0];
  if (span < EPS[k] * 3) {
    /* smooth — ровно и не встало (начало долгой петли); turn — был разворот: покачивание 0↔2° (контейнер стопки
       shapefest) в окне от спуска до подъёма даёт размах 1.77° — на волос меньше 3·EPS, и петля терялась */
    /* сдвиг на 1–2 px у элемента, чей размер меняется (полоса, растущая по ширине, с кадровыми выбросами transform —
       shapefest framer-1x8s64v), — не начало петли: окно из-за него тянулось до предела */
    if ((k === 'tx' || k === 'ty') && (() => { const sz = vals.map((v) => (k === 'tx' ? v.w : v.h)); return Math.max(...sz) - Math.min(...sz) > 1; })()) return null;
    if (span >= EPS[k]) return { k, lo, hi, span, obs, status: 'small', smooth: tailFlat(ts, ys, EPS[k] / 2) < 1500 && fit(ts, ys).r2 > 0.8, turn: span >= EPS[k] * 2 && turningPoints(ts, ys, span * 0.4, EPS[k]).length >= 1 };
    return null;
  }
  /* translate(-50%) за меняющимся размером — только когда размер и правда менялся: медленное парение ±4 px у
     картинки высотой 400 px (2% высоты) прежним правилом выбрасывалось */
  if (k === 'tx' || k === 'ty') { const sz = vals.map((v) => (k === 'tx' ? v.w : v.h)); if (Math.max(...sz) - Math.min(...sz) > 1) { const rel = vals.map((v) => v[k] / Math.max(1, k === 'tx' ? v.w : v.h)); if (Math.max(...rel) - Math.min(...rel) < 0.02) return null; } }
  const f = fit(ts, ys);
  const base = { k, lo, hi, span, obs, r2: f.r2, b: f.b, speed: Math.abs(f.b) * 1000, y0: ys[0], y1: ys[ys.length - 1] };
  if ((k === 'tx' || k === 'ty') && f.r2 > 0.95 && Math.abs(f.b) * 1000 > 5) return { ...base, status: 'marquee' };
  /* ступеньки — карусель: значение стоит (площадки: держится ≥3 замеров подряд), потом прыгает. Без опоры на число
     замеров и на фазу окна (раньше: «стоящих шагов вдвое больше прыжков» и «до первого прыжка стоит 0.6 с» — под
     нагрузкой шаг замера 250–400 мс, и карусель становилась «колебанием»; медленное парение ±4 px, окно у разворота
     — «каруселью, шаг ≈2 px»): путь (сумма |шаг|) — в основном прыжками (шаг > 3·EPS), переходов между площадками
     ≥ 2, на площадках — не меньше 40% времени */
  let pathAll = 0, pathJump = 0, segs = 0, holdMs = 0, inJump = false;
  for (let q = 1; q < ys.length; q++) { const d = Math.abs(ys[q] - ys[q - 1]); pathAll += d; if (d > EPS[k] * 3) { pathJump += d; if (!inJump) segs++; inJump = true; } else { inJump = false; if (d <= EPS[k]) holdMs += ts[q] - ts[q - 1]; } }
  /* площадка — значение стоит не меньше 0.7 с (у пружины у разворотов стоит 0.1–0.3 с, у слайда — секунды) */
  const plats = []; { let a = 0; for (let q = 1; q <= ys.length; q++) { if (q < ys.length && Math.abs(ys[q] - ys[q - 1]) <= EPS[k]) continue; if (ts[q - 1] - ts[a] >= 700) { const v = Math.round(ys[a]); if (!plats.length || Math.abs(plats[plats.length - 1] - v) > EPS[k] * 3) plats.push(v); } a = q; } }
  if ((k === 'tx' || k === 'ty') && plats.length >= 2 && segs >= 2 && pathJump >= pathAll * 0.6 && holdMs >= obs * 0.4) return { ...base, status: 'carousel', plats };
  /* один переход — карусель с долгим показом (5 с) или разовый сдвиг: не решать, ждать второго (stepWait) */
  if ((k === 'tx' || k === 'ty') && plats.length >= 2 && segs === 1 && pathJump >= pathAll * 0.6) {
    let last = 0; for (let q = 1; q < ys.length; q++) if (Math.abs(ys[q] - ys[q - 1]) > EPS[k] * 3) last = q;
    return { ...base, status: 'step', since: ts[ts.length - 1] - ts[last] };
  }
  const ext = turningPoints(ts, ys, Math.max(EPS[k] * 1.5, span * 0.15), EPS[k]);
  /* «встало» — хвост в полосе 5% размаха (не шире EPS): у медленного покачивания 0↔5° за 13 с вершина держится в
     полосе EPS 0.6° больше 3 с, и окно, начатое в покое, решало «доводка» — петля терялась */
  const flat = tailFlat(ts, ys, Math.min(EPS[k], span * 0.05));
  const settled = flat >= Math.max(LOOP.settleMin, LOOP.settleShare * obs);
  Object.assign(base, { turns: ext.length, flat, settled });
  if (ext.length >= 2) {
    const sw = ext.slice(1).map((e, q) => Math.abs(e.y - ext[q].y));
    /* гаснет: последний размах меньше половины первого — или каждый следующий меньше прежнего (< 0.85) и последний
       меньше 0.7 первого (пружина, застанная окном с середины: два размаха 12.5 → 7.3, а «встало» не хватило 24 мс) */
    /* под нагрузкой шаг замера 400 мс — треть периода пружины, вершины теряются и размахи скачут: ещё сравнить
       наибольший размах последней трети с наибольшим первой (огибающая) */
    const third = Math.max(1, Math.floor(sw.length / 3));
    const fading = sw.length >= 2 && (sw[sw.length - 1] < LOOP.decay * sw[0] || (sw.slice(1).every((v, q) => v < sw[q] * 0.85) && sw[sw.length - 1] < sw[0] * 0.7)
      || (sw.length >= 3 && Math.max(...sw.slice(-third)) < 0.6 * Math.max(...sw.slice(0, third))));
    if (fading || settled) return { ...base, status: 'decay' };
    /* два разворота (один размах — гаснет ли, не видно) и после них стоит ≥ 1.5 с: хвост пружины, застанный окном,
       или петля с паузой — решить нельзя, продлить окно (дальше: встало → пружина, новые развороты → петля) */
    if (ext.length === 2 && flat >= 1500) return { ...base, status: 'undetermined' };
    /* период — между одноимёнными разворотами; при двух разворотах — удвоенное расстояние между ними */
    const T = ext.length >= 3 ? median(ext.slice(2).map((e, q) => e.t - ext[q].t)) : 2 * (ext[1].t - ext[0].t);
    const firstMax = ext.find((e) => e.type === 'max');
    return { ...base, status: 'loop', period: Math.round(T), phase: firstMax ? Math.round((firstMax.t - ts[0]) % T) : null, full: ext.length >= 3 };
  }
  if (settled) return { ...base, status: 'settled' };
  /* вращение — ровная скорость не меньше 10 с (по четвертям наблюдения); разгон долгой петли — не вращение */
  if (k === 'rot' && f.r2 > 0.98 && obs >= 10000) {
    const q4 = Math.floor(ys.length / 4); const bs = [0, 1, 2, 3].map((q) => fit(ts.slice(q * q4, (q + 1) * q4), ys.slice(q * q4, (q + 1) * q4)).b);
    if (bs.every((b) => b / f.b > 0.8 && b / f.b < 1.25)) return { ...base, status: 'spin' };
  }
  return { ...base, status: 'undetermined' };
}

/* Элемент целиком: tx ty sc rot op по замерам idx. Свойства бесконечной CSS/WAAPI-анимации (cssLoop) — не здесь:
   их разбирают по ключевым кадрам. */
function classifyEl(el, steps, idx, { cssLoop = null } = {}) {
  const pts = idx.map((s) => [steps[s].t, propsOf(el.u[s])]).filter((x) => x[1]);
  if (pts.length < 3) return [];
  const ts = pts.map((x) => x[0]), vals = pts.map((x) => x[1]); const out = [];
  for (const k of ['tx', 'ty', 'sc', 'rot', 'op']) {
    if (cssLoop && cssLoop.props.some((p) => (k === 'op' ? p === 'opacity' : /transform|translate|rotate|scale/.test(p)))) continue;
    const c = classifyProp(k, ts, vals.map((v) => v[k]), vals); if (c) out.push(c);
  }
  return out;
}
/* нужен ли ещё кусок окна: «окно короче периода» или ровное начало долгой петли */
const slowStart = (c) => c.status === 'small' && (c.smooth || c.turn);
/* один переход между площадками — может быть карусель с долгим показом слайда: ждать второй, но не дольше 8 с после него */
const stepWait = (c) => c.status === 'step' && c.since < 8000;
const unresolved = (cls) => cls.some((c) => c.status === 'undetermined' || slowStart(c) || stepWait(c));

/* Петли → строки протокола: соседи по родителю с тем же свойством — одна строка ×N (стопка картинок Framer:
   у каждой свой период, вразнобой — это задумка донора, а не разные движения). В группу — петли и «окно короче
   периода», а ещё соседи, которые в этом окне стояли у разворота (small, settled и decay при ≤ 2 разворотах);
   пружина с тремя и больше разворотами — нет. Вращение — своей строкой.
   Разные движения соседей с тем же свойством (картинка качается на 3°, значок рядом — на 30°) — разные строки:
   решённые петли (loop) делятся по размаху, если он отличается больше чем в LOOP.spanRatio раз; остальные
   участники (размах у них увиден не целиком) идут к ближайшей по размаху — неполный размах группу не дробит. */
function loopRows(perEl) {
  const rows = []; const groups = new Map();
  const loopish = (c) => c.status === 'loop' || c.status === 'undetermined';
  for (const { el, cls } of perEl) for (const c of cls) {
    if (c.status === 'spin') { rows.push({ kind: 'loop', sub: 'вращение', trigger: 'time', props: [{ prop: NAMES.rot, from: '', to: '' }], timing: { speed: `${round(c.speed, 1)}°/с` }, source: 'js', i: el.i, el, parent: pattern(el.parent), members: [el.sig], is: [el.i], mk: [`${el.i}|rot`] }); continue; }
    if (!['loop', 'undetermined', 'settled', 'decay', 'small'].includes(c.status)) continue;
    const key = `${el.parent}|${c.k}`; const g = groups.get(key) || []; g.push({ el, c }); groups.set(key, g);
  }
  const parts = [];
  for (const g of groups.values()) {
    if (!g.some((x) => loopish(x.c))) continue;
    const pool = g.filter((x) => loopish(x.c) || x.c.status === 'small' || ((x.c.status === 'settled' || x.c.status === 'decay') && x.c.turns <= 2));
    const full = pool.filter((x) => x.c.status === 'loop');
    if (!full.length) { parts.push(pool); continue; }
    const cl = []; for (const x of [...full].sort((a, b) => a.c.span - b.c.span)) { const c = cl[cl.length - 1]; if (c && x.c.span <= c[0].c.span * LOOP.spanRatio) c.push(x); else cl.push([x]); }
    const mid = cl.map((c) => median(c.map((x) => x.c.span)));
    for (const x of pool) if (x.c.status !== 'loop') { let b = 0; for (let q = 1; q < cl.length; q++) if (Math.abs(Math.log(Math.max(x.c.span, 1e-9) / mid[q])) < Math.abs(Math.log(Math.max(x.c.span, 1e-9) / mid[b]))) b = q; cl[b].push(x); }
    for (const c of cl) parts.push(pool.filter((x) => c.includes(x)));            /* порядок участников — как в документе */
  }
  for (const members of parts) {
    const k = members[0].c.k; const first = members[0].el;
    const periods = members.map((x) => x.c.period).filter(Boolean).sort((a, b) => a - b);
    const spans = members.map((x) => x.c.span).sort((a, b) => a - b);
    const open = members.filter((x) => x.c.status !== 'loop');
    const note = [];
    if (periods.length > 1 && periods[periods.length - 1] > periods[0] * 1.08) note.push(`период ${round(periods[0] / 1000, 1)}–${round(periods[periods.length - 1] / 1000, 1)} с, у каждого свой — вразнобой`);
    if (members.length > 1) { const a = fmtV(k, spans[0]), b = fmtV(k, spans[spans.length - 1]); note.push(a === b ? `размах ${a}` : `размах ${a}–${b}`); }
    if (open.length) note.push(`окно ${round(Math.max(...members.map((x) => x.c.obs)) / 1000, 1)} с короче периода${members.length > 1 ? ` у ${open.length}` : ''}`);
    rows.push({ kind: 'loop', sub: k === 'op' ? 'мигание' : k === 'sc' ? 'пульс' : 'колебание', trigger: 'time',
      props: [{ prop: NAMES[k], from: fmtV(k, Math.min(...members.map((x) => x.c.lo))), to: fmtV(k, Math.max(...members.map((x) => x.c.hi))) }],
      timing: { period: periods.length ? median(periods) : undefined, note: note.join('; ') || undefined,
        ...(members.length > 1 ? { periods: members.map((x) => x.c.period || null), ranges: members.map((x) => `${fmtV(k, x.c.lo)}…${fmtV(k, x.c.hi)}`) } : {}),
        phases: members.map((x) => (x.c.phase === undefined ? null : x.c.phase)) },
      source: 'js', i: first.i, el: first, parent: pattern(first.parent), count: members.length, members: members.map((x) => x.el.sig).slice(0, 30), is: members.map((x) => x.el.i), mk: members.map((x) => `${x.el.i}|${k}`),
      cropI: members.length > 1 && first.pi >= 0 ? first.pi : first.i });                     /* вырезка — вся стопка (родитель), если он под наблюдением */
  }
  return rows;
}

/* ---------- фаза «без прокрутки»: петли, печать, счётчики, карусели ---------- */
function analyzeTime(el, steps, timeIdx, anims, finite, watch) {
  const vals = timeIdx.map((s) => propsOf(el.u[s])).filter(Boolean);
  if (vals.length < 3) return { items: [], cls: [] };
  let ts = timeIdx.map((s) => steps[s].t);
  const items = [];
  /* текст листа: долгое частое наблюдение, если было, иначе замеры окна «время» */
  let texts = vals.map((v) => v.text);
  const fromWatch = !!(watch && watch.length >= 3);
  if (fromWatch) { texts = watch.map((w) => w[1]); ts = watch.map((w) => w[0]); }
  const distinct = [...new Set(texts)];
  if (distinct.length >= 3) {
    const nums = distinct.map((x) => Number(String(x).replace(/[\s\u00a0,]/g, '')));
    const shape = (x) => String(x).replace(/\d+/g, '#');
    const shapes = {}; for (const x of texts) shapes[shape(x)] = (shapes[shape(x)] || 0) + 1;
    const topShape = Object.entries(shapes).sort((a, b) => b[1] - a[1])[0];
    if (nums.every((x) => !Number.isNaN(x))) items.push({ kind: 'counter', trigger: 'load', props: [{ prop: 'текст', from: distinct[0], to: distinct[distinct.length - 1] }], timing: {} });
    else if (/#/.test(topShape[0]) && topShape[1] >= texts.length * 0.4 && new Set(texts.filter((x) => shape(x) === topShape[0])).size >= 3) items.push({ kind: 'counter', sub: 'цифры в тексте', trigger: 'time', props: [{ prop: 'текст', from: distinct[0], to: distinct[distinct.length - 1] }], timing: { note: `«${topShape[0]}» — числа меняются сами` } });
    else {
      let grow = 0, pairs = 0;
      for (let k = 1; k < texts.length; k++) { if (texts[k] === texts[k - 1]) continue; pairs++; if (texts[k].startsWith(texts[k - 1]) || texts[k - 1].startsWith(texts[k])) grow++; }
      /* слово — то, что допечаталось и начало стираться (последнее недопечатанное не в счёт) */
      const seq = texts.filter((w, q) => q === 0 || w !== texts[q - 1]);            /* подряд одинаковые — одним */
      const words = [...new Set(seq.filter((w, q) => q + 1 < seq.length && seq[q + 1].length < w.length && (q === 0 || seq[q - 1].length < w.length) && w.length > 1))];
      if (pairs && grow / pairs > 0.7) {
        /* скорость — по участкам набора и стирания целиком (между соседними замерами бывает и 1, и 3 знака) */
        const add = [], del = []; let q0 = 0;
        /* частое наблюдение пишет только смены текста: скорость — по соседним сменам (паузы на слове длиннее 1 с — не в счёт) */
        if (fromWatch) for (let k = 1; k < texts.length; k++) { const dl = texts[k].length - texts[k - 1].length, dt = (ts[k] - ts[k - 1]) / 1000; if (dt > 0 && dt < 1 && dl) (dl > 0 ? add : del).push(Math.abs(dl) / dt); }
        else for (let k = 1; k <= texts.length; k++) {
          const sg = k < texts.length ? Math.sign(texts[k].length - texts[k - 1].length) : 0; const sg0 = Math.sign(texts[Math.min(q0 + 1, texts.length - 1)].length - texts[q0].length);
          if (k === texts.length || (sg && sg0 && sg !== sg0)) { const dl = texts[k - 1].length - texts[q0].length, dt = (ts[k - 1] - ts[q0]) / 1000; if (dt > 0.15 && Math.abs(dl) >= 2) (dl > 0 ? add : del).push(Math.abs(dl) / dt); q0 = k - 1; }
        }
        const med = (a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
        /* ни одно слово не допечаталось до стирания за окно — показать самые длинные из увиденных */
        const seen = words.length ? words : [...new Set(seq)].filter((w) => w.length > 2 && !seq.some((o) => o !== w && o.startsWith(w))).sort((a, b) => b.length - a.length).slice(0, 3);
        items.push({ kind: 'typewriter', trigger: 'time', props: [{ prop: 'текст', from: '', to: seen.slice(0, 5).join(' / ') + (words.length ? '' : ' (видели не целиком)') }], timing: { speed: `${add.length ? `набор ≈${round(med(add))} знаков/с` : 'набор за окно не пойман'}${del.length ? `, стирание ≈${round(med(del))}/с` : ''}` } });
      } else items.push({ kind: 'rotating-words', trigger: 'time', props: [{ prop: 'текст', from: distinct[0], to: distinct.slice(1, 4).join(' / ') }], timing: {} });
    }
  }
  /* transform и прозрачность — по замерам окна «время»: бегущая строка и карусель — здесь, петли и вращение —
     строками групп (loopRows) по разбору cls всех элементов */
  if (finite) return { items, cls: [] };                         /* вход при загрузке — не петля: разберётся отдельно */
  const cssLoop = anims.find((a) => a.i === el.i && a.iterations === 'infinite' && !a.timeline) || null;   /* разберём по ключевым кадрам ниже */
  const cls = classifyEl(el, steps, timeIdx, { cssLoop });
  for (const c of cls) {
    const k = c.k;
    if (c.status === 'marquee') items.push({ kind: 'marquee', trigger: 'time', props: [{ prop: NAMES[k], from: fmtV(k, c.y0), to: fmtV(k, c.y1) }], timing: { speed: `${round(c.speed)} px/с ${k === 'tx' ? (c.b < 0 ? 'влево' : 'вправо') : (c.b < 0 ? 'вверх' : 'вниз')}` }, source: 'js' });
    else if (c.status === 'carousel') {
      /* шаг — разница соседних площадок; до первого прыжка — стоит */
      const dif = c.plats.slice(1).map((v, q) => Math.abs(v - c.plats[q])).sort((a, b) => a - b); const stepPx = dif[Math.floor(dif.length / 2)];
      /* «из → в» — первый слайд и следующий, а не первый и последний: за окно 14 с карусель из трёх слайдов проходит круг,
         последняя площадка равна первой, и строка «сдвиг X −420 → −420» уходила как «без изменения» */
      const next = c.plats.find((v) => v !== c.plats[0]) ?? c.plats[c.plats.length - 1];
      items.push({ kind: 'carousel', trigger: 'time', props: [{ prop: NAMES[k], from: fmtV(k, c.plats[0]), to: fmtV(k, next) }], timing: { note: `шаг ≈${stepPx} px, листает сам` }, source: 'js' });
    }
  }
  return { items, cls };
}

/* кадр анимации {"offset":0,"transform":"…"} → «transform: …; opacity: …» */
function kfText(json) {
  try { const o = JSON.parse(json); return Object.entries(o).filter(([k]) => !/^(offset|computedOffset|easing|composite)$/.test(k)).map(([k, v]) => `${k}: ${v}`).join('; '); } catch (e) { return String(json || '').slice(0, 60); }
}
const kfEase = (json) => { try { return JSON.parse(json).easing || ''; } catch (e) { return ''; } };
/* transform-матрица словами: «сдвиг Y −3 px», «масштаб 1.08», «поворот 45°» */
function tfWords(tf) {
  if (!tf || tf === 'none') return 'нет';
  if (!/^matrix/.test(tf)) return tf;
  const d = decompose(tf); const p = [];
  if (Math.abs(d.tx) >= 0.5) p.push(`сдвиг X ${round(d.tx, 1)} px`); if (Math.abs(d.ty) >= 0.5) p.push(`сдвиг Y ${round(d.ty, 1)} px`);
  if (Math.abs(d.sx - 1) > 0.005 || Math.abs(d.sy - 1) > 0.005) p.push(Math.abs(d.sx - d.sy) < 0.005 ? `масштаб ${round(d.sx, 2)}` : `масштаб ${round(d.sx, 2)}×${round(d.sy, 2)}`);
  if (Math.abs(d.rot) >= 0.5) p.push(`поворот ${round(d.rot, 1)}°`); if (Math.abs(d.rx) + Math.abs(d.ry) >= 0.5) p.push(`наклон ${round(d.rx, 1)}°/${round(d.ry, 1)}°`);
  return p.join(', ') || 'нет';
}

/* бесконечные CSS/WAAPI-анимации по ключевым кадрам */
function classifyLoop(a, kf, el) {
  const txt = `${a.first} ${a.last} ${(kf || []).map((f) => f.css).join(' ')}`;
  const dur = Number(a.duration) || 0;
  const trs = [...txt.matchAll(/translate(?:X|3d)?\((-?[\d.]+)(%|px)/g)].sort((p, q) => Math.abs(parseFloat(q[1])) - Math.abs(parseFloat(p[1])));
  const tr = trs[0] || null;
  if (/rotate\((-?)360deg\)|rotate\(1turn\)|rotate\(-?360/.test(txt)) return { kind: 'loop', sub: 'вращение', timing: { period: dur, speed: dur ? `${round(360 / (dur / 1000))}°/с` : '' } };
  if (tr && ((tr[2] === '%' && Math.abs(parseFloat(tr[1])) >= 25) || (tr[2] === 'px' && Math.abs(parseFloat(tr[1])) > 200))) {
    const v = parseFloat(tr[1]); const unit = tr[2];
    const dist = unit === '%' && el ? Math.abs(v) / 100 * el.w : Math.abs(v);
    return { kind: 'marquee', timing: { period: dur, speed: dur && dist ? `${round(dist / (dur / 1000))} px/с ${v < 0 ? 'влево' : 'вправо'}` : '' } };
  }
  if (/scale\(/.test(txt) && !/translate/.test(txt)) return { kind: 'loop', sub: 'пульс', timing: { period: dur } };
  if (/translateY|translate\(0(px)?,/.test(txt)) return { kind: 'loop', sub: 'парение', timing: { period: dur } };
  if (/opacity/.test(txt)) return { kind: 'loop', sub: 'мигание', timing: { period: dur } };
  if (/background-position|backgroundPosition/.test(txt)) return { kind: 'loop', sub: 'перелив фона', timing: { period: dur } };
  return { kind: 'loop', sub: 'другое', timing: { period: dur } };
}

/* ---------- фаза прокрутки ---------- */
function analyzeScroll(el, steps, scrollIdx, vh, ctx) {
  const items = [];
  const P = scrollIdx.map((s) => ({ s, sy: steps[s].sy, p: propsOf(el.u[s]) })).filter((x) => x.p);
  if (P.length < 3) return items;
  const top = (x) => x.p.docTop - x.sy;                           /* верх в окне */
  /* верх блока для отрезков прокрутки: у слоя с transform — верх родителя (масштаб и сдвиг искажают свой) */
  const btop = (x) => ((x.p.moved && Number.isFinite(x.p.ptop)) ? x.p.ptop : x.p.docTop) - x.sy;
  const fixedLike = el.position === 'fixed' || el.position === 'sticky';
  /* стоит на месте экрана, пока страница едет: сам fixed или внутри закреплённой обёртки (Framer: fixed — у обёртки,
     у ссылки внутри — relative); сдвиг transform не в счёт — он и есть движение */
  const onScreen = el.position === 'fixed' || (P[P.length - 1].sy - P[0].sy > vh && P.every((x) => Math.abs((top(x) - x.p.ty) - (top(P[0]) - P[0].p.ty)) <= 2));
  /* закреплённый: верх в окне стоит, пока прокрутка идёт */
  if (el.position === 'sticky' && P.every((x) => x.p.w > 0 && x.p.h > 0)) {
    let run = 0, best = 0, b0 = -1, bStart = -1;
    for (let k = 1; k < P.length; k++) { if (Math.abs(top(P[k]) - top(P[k - 1])) <= 2 && P[k].sy > P[k - 1].sy) { if (!run) b0 = k - 1; run++; if (run > best) { best = run; bStart = b0; } } else run = 0; }
    if (best >= 3) { const pinPx = P[bStart + best].sy - P[bStart].sy; items.push({ kind: 'pinned', sub: P[bStart].p.h < vh * 0.35 ? 'полоса' : 'раздел', trigger: 'scroll', props: [{ prop: 'закреплён', from: `верх на ${pct(Math.max(0, top(P[bStart])) / vh)} экрана`, to: `на ${round(pinPx)} px прокрутки` }], scroll: { rangePx: pinPx }, timing: {} }); }
  }
  /* шапка/прогресс — закреплённые у верха */
  if (el.position === 'fixed' && P[0].p.docTop - P[0].sy <= 10 && P[0].p.w >= ctx.vw * 0.8) {
    const widths = P.map((x) => x.p.w); const ws = fit(P.map((x) => x.sy), widths);
    if (P[0].p.h <= 12 && ws.b > 0 && ws.r2 > 0.8) { items.push({ kind: 'progress', trigger: 'scroll', props: [{ prop: 'ширина', from: `${Math.round(widths[0])} px`, to: `${Math.round(widths[widths.length - 1])} px` }], timing: {} }); return items; }
  }
  if (el.position === 'fixed' && P[0].p.docTop - P[0].sy <= 10 && P[0].p.h <= 12) {
    const widths = P.map((x) => x.p.w); if (widths[widths.length - 1] - widths[0] > ctx.vw * 0.3) { items.push({ kind: 'progress', trigger: 'scroll', props: [{ prop: 'ширина', from: `${Math.round(widths[0])} px`, to: `${Math.round(widths[widths.length - 1])} px` }], timing: {} }); return items; }
  }
  if (fixedLike && P[0].p.docTop - P[0].sy <= 10 && P[0].p.h < 220 && P[0].p.w >= ctx.vw * 0.6) {
    const bgs = [...new Set(P.map((x) => x.p.bg))]; const tys = P.map((x) => x.p.ty);
    const hid = tys.some((t) => t <= -P[0].p.h * 0.5); const back = ctx.upIdx.length && ctx.upIdx.some((s) => { const q = propsOf(el.u[s]); return q && q.ty > -2; });
    if (bgs.length > 1 || hid) {
      items.push({ kind: 'header', trigger: 'scroll', props: [...(bgs.length > 1 ? [{ prop: 'фон', from: bgs[0], to: bgs[bgs.length - 1] }] : []), ...(hid ? [{ prop: 'прячется при прокрутке вниз', from: '0', to: `${round(Math.min(...tys))} px` }] : [])],
        timing: { note: hid ? (back ? 'возвращается при прокрутке вверх' : 'при прокрутке вверх не вернулась') : '' } });
      return items;
    }
  }
  /* закреплённое, которое показывается при прокрутке ВВЕРХ и прячется при прокрутке вниз (кнопка «Наверх»,
     плавающая кнопка, нижняя панель; у шапки — ветка выше): у конца прохода вниз скрыто, на шагах вверх видно.
     Прыжками вниз этого не отличить от «исчезает» — shapefest «Back to top» так и снимался 24.09 */
  if (onScreen && ctx.upIdx && ctx.upIdx.length) {
    const shown = (q) => !!q && !q.hid && q.op >= 0.5 && q.w > 0 && q.h > 0;
    const U = ctx.upIdx.map((s) => propsOf(el.u[s])).filter(Boolean);
    const last = P[P.length - 1].p; const q = U.find(shown);
    if (q && !shown(last)) {
      const props = [{ prop: NAMES.op, from: fmtV('op', last.op), to: fmtV('op', q.op) }];
      for (const k of ['ty', 'tx', 'sc']) if (Math.abs(q[k] - last[k]) > EPS[k] * 2) props.push({ prop: NAMES[k], from: fmtV(k, last[k]), to: fmtV(k, q[k]) });
      const visStart = shown(P[0].p);
      items.push({ kind: 'reveal', sub: 'при прокрутке вверх', trigger: 'scroll', prop: 'op', from: last.op, to: q.op, props, visAtStart: visStart, timing: {},
        scroll: { at: `закреплён на экране; показывается, когда листают вверх, прячется, когда листают вниз (в начале страницы ${visStart ? 'виден' : 'скрыт'})`, fixed: true, direction: 'up' } });
      return items;
    }
  }
  /* появление из @keyframes (WOW.js, animate.css): до входа в экран блок скрыт visibility: hidden (WOW держит его так
     с animation-name: none в style), при входе — visible и animation-name (slideInLeft, fadeInUp) из style или класса.
     Анимация проходит между замерами, прозрачность и transform в замере стоят как были — у mamuka.rest/about строки
     появления не было вовсе. Числа — из ключевых кадров (разбор появлений ниже). Только у самого анимированного:
     дети наследуют visibility, своей анимации у них нет */
  const kfName = (el.anim && el.anim.name && el.anim.name !== 'none' ? String(el.anim.name).split(',')[0].trim() : '') || (ctx.animOf && ctx.animOf.get(el.i)) || '';
  const hs = P.map((x) => x.p.hid); const on = hs.findIndex((h, q) => q > 0 && hs[q - 1] === 1 && h === 0);
  if (kfName && !fixedLike && on > 0 && hs.slice(on).every((h) => h === 0)) {
    /* верх — по замеру до входа (скрыт, animation-name: none — transform ещё свой): на шаге входа блок уже в анимации
       (translate, а у сдвинутого btop берёт верх родителя) — mamuka.rest/about давал «между 101% и −20%» */
    const d0 = P[on - 1].p.docTop; const tPrev = (d0 - P[on - 1].sy) / vh, tNow = (d0 - P[on].sy) / vh; const cl = (x) => Math.max(-0.2, Math.min(1.2, x));
    const seen = (q) => { const t = top(P[q]); return t < vh && t + P[q].p.h > 0; };
    items.push({ kind: 'reveal', trigger: 'scroll', prop: 'vis', from: 0, to: 1, props: [], kfName, step: P[on].s, visAtStart: seen(0),
      scroll: { at: `верх блока между ${pct(cl(tPrev))} и ${pct(cl(tNow))} высоты экрана`, atPct: Math.round(((tPrev + tNow) / 2) * 100) } });
    return items;
  }
  /* свойства: прыжок (появление) или привязка к прокрутке */
  for (const k of ['op', 'ty', 'tx', 'sc', 'rot', 'blur', 'clip']) {
    const ys = P.map((x) => x.p[k]);
    if (ys.some((y) => y === null)) continue;
    const span = Math.max(...ys) - Math.min(...ys);
    if (span < EPS[k] * 2) continue;
    if (ctx.timeChanged.has(k)) continue;                         /* это петля во времени, не прокрутка */
    /* отрезки изменения */
    const ch = []; for (let q = 1; q < P.length; q++) if (Math.abs(ys[q] - ys[q - 1]) > EPS[k]) ch.push(q);
    if (!ch.length) continue;
    let first = ch[0], last = ch[ch.length - 1];
    const contiguous = last - first + 1 === ch.length;
    if (ch.length >= 3) {                                          /* самый длинный участок в одну сторону */
      let bs = ch[0], be = ch[0], cs = ch[0], dir0 = Math.sign(ys[ch[0]] - ys[ch[0] - 1]);
      for (let q = 1; q < ch.length; q++) { const dq = Math.sign(ys[ch[q]] - ys[ch[q] - 1]); if (ch[q] === ch[q - 1] + 1 && dq === dir0) { if (ch[q] - cs > be - bs) { bs = cs; be = ch[q]; } } else { cs = ch[q]; dir0 = dq; } }
      if (be > bs) { first = bs; last = be; }
    }
    const from = ys[first - 1], to = ys[last];
    const vis = (q) => { const t = top(P[q]); return t < vh && t + P[q].p.h > 0; };
    if (ch.length <= 2 && contiguous && P.slice(last).every((x, j) => Math.abs(ys[last + j] - to) <= EPS[k] * 2)) {
      /* появление: изменилось за 1–2 шага у входа в экран и осталось */
      const tPrev = btop(P[first - 1]) / vh, tNow = btop(P[first]) / vh;
      /* закреплённое на экране (кнопка «Наверх», плавающая кнопка) стоит на одном месте окна — важна не его высота
         в окне, а где на странице оно меняется: у начала, у конца (подвал) или после N px прокрутки */
      const syMax = Math.max(...P.map((x) => x.sy)); const sy0 = P[first - 1].sy, sy1 = P[first].sy;
      const where = onScreen
        ? `закреплён на экране; меняется при прокрутке ${Math.round(sy0)}–${Math.round(sy1)} px из ${Math.round(syMax)} (${syMax - sy1 < vh * 0.6 ? 'у конца страницы' : sy1 <= vh * 1.2 ? 'сразу после начала' : `${Math.round((sy1 / Math.max(1, syMax)) * 100)}% страницы`}${vis(0) ? ', виден с начала' : ', в начале скрыт'})`
        : `верх блока между ${pct(Math.max(-0.2, Math.min(1.2, tPrev)))} и ${pct(Math.max(-0.2, Math.min(1.2, tNow)))} высоты экрана`;
      items.push({ kind: 'reveal', trigger: 'scroll', prop: k, from, to, props: [{ prop: NAMES[k], from: fmtV(k, from), to: fmtV(k, to) }],
        scroll: { at: where, atPct: Math.round(((tPrev + tNow) / 2) * 100), ...(onScreen ? { fixed: true, atPx: Math.round(sy1), ofPx: Math.round(syMax) } : {}) }, step: P[first].s, visAtStart: vis(0) });
      continue;
    }
    /* привязка к прокрутке: меняется несколько шагов подряд, почти линейно */
    const seg = P.slice(first - 1, last + 1); const sy = seg.map((x) => x.sy); const yv = seg.map((x) => x.p[k]);
    const f = fit(sy, yv);
    if (ch.length >= 2 && f.r2 > 0.8) {
      let t0 = btop(P[first - 1]) / vh, t1 = btop(P[last]) / vh;
      /* внутри отрезка значение идёт по прямой: где прямая даёт «из» и «в» — там и края (точнее шага прокрутки) */
      const inner = P.slice(first, last); 
      if (inner.length >= 2) {
        const g = fit(inner.map((x) => x.sy), inner.map((x) => x.p[k]));
        if (g.b && g.r2 > 0.9) {
          const ref = P[first - 1]; const topAt = (yy) => (btop(ref) - (yy - ref.sy)) / vh;
          const e0 = topAt((from - g.a) / g.b), e1 = topAt((to - g.a) / g.b);
          if (Number.isFinite(e0) && Number.isFinite(e1) && Math.abs(e0 - t0) < 0.5 && Math.abs(e1 - t1) < 0.5) { t0 = e0; t1 = e1; }
        }
      }
      const coef = (k === 'tx' || k === 'ty') ? round(f.b, 3) : null;
      if ((k === 'ty' || k === 'tx') && Math.abs(Math.abs(f.b) - 1) < 0.06 && el.position !== 'fixed') {
        items.push({ kind: 'pinned', trigger: 'scroll', props: [{ prop: 'держится сдвигом (pin)', from: fmtV(k, from), to: fmtV(k, to) }], scroll: { rangePx: round(sy[sy.length - 1] - sy[0]) }, timing: {} });
        continue;
      }
      const whole = first <= 2 && last >= P.length - 2;
      const isPar = (k === 'ty' || k === 'tx') && (whole || Math.abs(f.b) < 0.9);
      items.push({ kind: isPar && k === 'ty' ? 'parallax' : 'scroll-linked', sub: k === 'tx' ? 'лента вбок' : undefined, trigger: 'scroll', prop: k, from, to,
        props: [{ prop: NAMES[k], from: fmtV(k, from), to: fmtV(k, to) }],
        scroll: { from: `верх блока на ${pct(t0)} экрана`, to: `на ${pct(t1)}`, rangePx: round(sy[sy.length - 1] - sy[0]), coefficient: coef, startPct: Math.round(t0 * 100), endPct: Math.round(t1 * 100) } });
    } else if (ch.length >= 2) {
      items.push({ kind: 'scroll-linked', trigger: 'scroll', prop: k, from, to, props: [{ prop: NAMES[k], from: fmtV(k, from), to: fmtV(k, to) }], scroll: { note: `меняется на ${ch.length} шагах, не по прямой` }, confidence: 'средняя' });
    }
  }
  /* лента вбок прокруткой своего контейнера (overflow-x), а не transform: при прокрутке страницы скрипт сдвигает
     scrollLeft ленты за активным разделом (Эпицентр /menu: .mm-rib__track) — едет содержимое ленты, сам блок стоит.
     Лента, что прокручивается сама во времени (карусель на scroll-snap), — не от прокрутки страницы (timeChanged) */
  if (!ctx.timeChanged.has('sl')) {
    const sl = P.map((x) => x.p.sl || 0); const span = Math.max(...sl) - Math.min(...sl);
    const moves = sl.slice(1).filter((v, q) => Math.abs(v - sl[q]) > EPS.sl).length;
    if (span >= 20 && moves >= 2) {
      const far = sl.reduce((b, v, q) => (Math.abs(v - sl[0]) > Math.abs(sl[b] - sl[0]) ? q : b), 0);
      const f = fit(P.map((x) => x.sy), sl.map((v) => -v));
      items.push({ kind: 'scroll-linked', sub: 'лента вбок', trigger: 'scroll', prop: 'sl', from: -sl[0], to: -sl[far],
        props: [{ prop: NAMES.tx, from: fmtV('tx', -sl[0]), to: fmtV('tx', -sl[far]) }], timing: {}, source: 'scrollLeft контейнера (overflow-x)',
        scroll: { note: `лента прокручивается вбок (scrollLeft ${sl[0]} → ${sl[far]} px) за прокруткой страницы: сдвигалась на ${moves} шагах из ${P.length - 1}${f.r2 > 0.9 ? ', почти по прямой' : ', ступеньками — за активным пунктом'}`,
          rangePx: round(P[P.length - 1].sy - P[0].sy), coefficient: round(f.b, 3) } });
    }
  }
  /* счётчик после входа в экран */
  const texts = P.map((x) => x.p.text); const nums = [...new Set(texts)].map((x) => Number(String(x).replace(/[\s\u00a0,]/g, ''))).filter((x) => !Number.isNaN(x));
  if (nums.length >= 2 && [...new Set(texts)].length >= 2 && nums[nums.length - 1] > nums[0]) items.push({ kind: 'counter', trigger: 'scroll', props: [{ prop: 'число', from: String(nums[0]), to: String(nums[nums.length - 1]) }], timing: {} });
  return items;
}

/* ---------- фаза кликов: меню, аккордеоны, вкладки, раскрывающиеся кнопки ---------- */
const CLICK_SUB = { toggle: 'меню', accordion: 'аккордеон', tab: 'вкладки', disclosure: 'раскрытие', popup: 'окно' };
const CLICK_RECIPE = { 'меню': 'click-menu', 'аккордеон': 'click-accordion', 'вкладки': 'click-tabs', 'раскрытие': 'click-disclosure', 'окно': 'click-popup' };
const rgbHex = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || ''); if (!m) return String(c || ''); if (m[4] !== undefined && Number(m[4]) === 0) return 'прозрачный'; return '#' + [m[1], m[2], m[3]].map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase(); };

/* Разбор одного клика: панель (самое крупное появившееся, иначе выросшее по высоте, иначе новый узел DOM),
   как она приходит (сдвиг, масштаб, прозрачность, высота, шторка — у неё и изменившихся предков),
   значок (маленький элемент с поворотом), смена вида кнопки, старая панель вкладок, длительность и кривая
   (события переходов и element.animate после клика, последняя смена style скриптом, промежуточные снимки). */
/* «opacity: 0; transform: translateY(8px) scale(.96)» → { op, tx, ty, sc } (проценты сдвига — от ширины/высоты) */
function cssProps(css, w, h) {
  const out = {}; const t = String(css || '');
  const op = /opacity:\s*([\d.]+)/.exec(t); if (op) out.op = Number(op[1]);
  const px = (v, size) => (/%/.test(v) ? parseFloat(v) / 100 * size : parseFloat(v));
  let m = /translateX\(([^)]+)\)/.exec(t); if (m) out.tx = px(m[1], w);
  m = /translateY\(([^)]+)\)/.exec(t); if (m) out.ty = px(m[1], h);
  m = /translate(?:3d)?\(([^,)]+),\s*([^,)]+)/.exec(t); if (m) { out.tx = px(m[1], w); out.ty = px(m[2], h); }
  m = /scale\(([\d.]+)/.exec(t); if (m) out.sc = Number(m[1]);
  if (/transform:\s*none/.test(t)) { out.tx = 0; out.ty = 0; out.sc = 1; }
  return out;
}

function summarizeClick(t, pt, diff, kf = {}) {
  const ch = diff.changed; if (!ch.length && !diff.added.length) return null;
  const byI = new Map(ch.map((c) => [c.i, c]));
  const isAnc = (o, c) => { for (let p = c.par; p >= 0; p = byI.has(p) ? byI.get(p).par : -1) if (p === o.i) return true; return false; };
  const tops = (list) => list.filter((c) => !list.some((o) => o !== c && isAnc(o, c)));
  const area = (v) => (v ? v[3] * v[4] : 0);
  const appeared = tops(ch.filter((c) => c.base[0] === 0 && c.end[0] === 1 && c.end[10] >= 400 && !c.isTrigger)).sort((a, b) => b.end[10] - a.end[10]);
  const grown = ch.filter((c) => !c.isTrigger && c.end[4] - c.base[4] > 12).sort((a, b) => (b.end[4] - b.base[4]) - (a.end[4] - a.base[4]));
  const gone = tops(ch.filter((c) => c.base[0] === 1 && c.end[0] === 0 && area(c.base) >= 1000 && !c.trigger)).sort((a, b) => area(b.base) - area(a.base));
  let panel = appeared.find((c) => c.end[10] >= 1000) || grown[0] || null;
  /* появившийся блок был обрезан предком (Framer: ответ полной высоты внутри пункта с overflow: hidden) —
     панель — предок, который вырос, чтобы его показать; выше — пока предок растёт на столько же и в нём
     не было другого видимого (высота «до» та же). Блок сам рос с нуля (обёртка ответа height 0 → N) — он и панель */
  if (panel && panel.base[4] > 0 && panel.base[0] === 0) {
    const grow = (q) => q.end[4] - q.base[4];
    let p = panel.par; const first = p >= 0 && byI.get(p);
    if (first && grow(first) >= Math.max(12, panel.end[4] * 0.4)) {
      panel = first;
      for (p = panel.par; p >= 0 && byI.has(p); p = byI.get(p).par) { const q = byI.get(p); if (Math.abs(grow(q) - grow(panel)) <= Math.max(4, grow(panel) * 0.15) && q.base[4] <= panel.base[4] + 12) panel = q; else break; }
    }
  }
  const props = []; const put = (prop, from, to) => { if (!props.some((p) => p.prop === prop)) props.push({ prop, from, to }); };
  const chain = [];
  if (panel) { chain.push(panel); for (let p = panel.par, n = 0; p >= 0 && byI.has(p) && n < 2; p = byI.get(p).par, n++) if (!byI.get(p).trigger) chain.push(byI.get(p)); }
  for (const c of chain) {
    const a = decompose(c.base[6]), z = decompose(c.end[6]);
    if (Math.abs(a.tx - z.tx) > 2) put('панель: сдвиг X', fmtV('tx', a.tx), fmtV('tx', z.tx));
    if (Math.abs(a.ty - z.ty) > 2) put('панель: сдвиг Y', fmtV('ty', a.ty), fmtV('ty', z.ty));
    if (Math.abs((a.sx + a.sy) / 2 - (z.sx + z.sy) / 2) > 0.02) put('панель: масштаб', fmtV('sc', (a.sx + a.sy) / 2), fmtV('sc', (z.sx + z.sy) / 2));
    if (Math.abs(c.base[5] - c.end[5]) > 0.04) put('панель: прозрачность', fmtV('op', c.base[5]), fmtV('op', c.end[5]));
    if (c.base[7] !== c.end[7]) { const f = clipShare(c.base[7], c.base[3], c.base[4]), g = clipShare(c.end[7], c.end[3], c.end[4]); if (f !== null && g !== null && Math.abs(f - g) > 0.02) put('панель: шторка (видно)', pct(f), pct(g)); }
    if (c === chain[0] && Math.abs(c.end[4] - c.base[4]) > 3 && !c.base[11] && !(c.base[4] === 0 && props.length)) put('панель: высота', `${c.base[4]} px`, `${c.end[4]} px`);
  }
  /* панель, которую показали (display:none → блок), входит анимацией: «из» — первый кадр @keyframes или element.animate */
  const lead0 = chain[0];
  if (lead0) {
    let fromCss = '', toCss = '';
    const w = lead0.waapi.find((x) => x.first);
    const an = lead0.anim ? String(lead0.anim.name).split(',')[0].trim() : '';
    if (w) { fromCss = kfText(w.first); toCss = w.last && w.last !== w.first ? kfText(w.last) : ''; }
    else if (an && kf && kf[an] && kf[an].length) { const fr = kf[an]; fromCss = fr[0].css; toCss = fr.length > 1 ? fr[fr.length - 1].css : ''; }
    if (fromCss) {
      const a = cssProps(fromCss, lead0.end[3], lead0.end[4]), z = cssProps(toCss, lead0.end[3], lead0.end[4]); const e = decompose(lead0.end[6]);
      if (a.op !== undefined && Math.abs(a.op - (z.op ?? lead0.end[5])) > 0.04) put('панель: прозрачность', fmtV('op', a.op), fmtV('op', z.op ?? lead0.end[5]));
      if (a.tx !== undefined && Math.abs(a.tx - (z.tx ?? e.tx)) > 2) put('панель: сдвиг X', fmtV('tx', a.tx), fmtV('tx', z.tx ?? e.tx));
      if (a.ty !== undefined && Math.abs(a.ty - (z.ty ?? e.ty)) > 2) put('панель: сдвиг Y', fmtV('ty', a.ty), fmtV('ty', z.ty ?? e.ty));
      if (a.sc !== undefined && Math.abs(a.sc - (z.sc ?? (e.sx + e.sy) / 2)) > 0.02) put('панель: масштаб', fmtV('sc', a.sc), fmtV('sc', z.sc ?? (e.sx + e.sy) / 2));
    }
    if (lead0.base[11] && !lead0.end[11]) put('панель: показ', 'display: none', 'видна');
  }
  if (panel && !props.length) put('панель: показ', 'скрыта', 'видна');
  if (!panel && diff.added.length) { const a = diff.added[0]; put('панель: показ', 'нет в DOM', `вставлена ${a.w}×${a.h}`); }
  const icon = ch.find((c) => c.end[3] <= 48 && c.end[4] <= 48 && Math.abs(decompose(c.end[6]).rot - decompose(c.base[6]).rot) >= 10);
  if (icon) put('значок: поворот', fmtV('rot', decompose(icon.base[6]).rot), fmtV('rot', decompose(icon.end[6]).rot));
  const btn = ch.find((c) => (c.isTrigger || c.inTrigger) && c.base[8] !== c.end[8]); if (btn) put('кнопка: фон', rgbHex(btn.base[8]), rgbHex(btn.end[8]));
  const col = ch.find((c) => (c.isTrigger || c.inTrigger) && c.base[9] !== c.end[9]); if (col) put('кнопка: цвет', rgbHex(col.base[9]), rgbHex(col.end[9]));
  if (t.type === 'tab' && gone.length) put('старая панель', 'видна', 'скрыта');
  if (!props.length) return null;
  /* время: события и element.animate после клика у участников, последняя смена style скриптом, снимки */
  const who = [...chain, icon, gone[0]].filter(Boolean);
  const durs = []; let easing = '';
  for (const c of who) {
    for (const e of c.ev) if (e.dur > 0) durs.push(e.dur);
    for (const w of c.waapi) { if (w.dur) durs.push(w.dur + Math.max(0, w.t)); if (!easing && w.easing) easing = w.easing; }
    if (c.styleLast != null && c.styleLast > 60) durs.push(c.styleLast);
  }
  const lead = chain[0] || icon;
  if (!easing && lead) { const d0 = msOf(lead.trans.dur).some((x) => x > 0); easing = d0 ? easeName(lead.trans.ease) : lead.anim ? easeName(lead.anim.ease) : ''; }
  const cssDur = lead ? Math.max(0, ...msOf(lead.trans.dur), ...(lead.anim ? msOf(lead.anim.dur) : [])) : 0;
  const same = (a, b) => !!a && !!b && a[0] === b[0] && Math.abs(a[4] - b[4]) <= 2 && Math.abs(a[3] - b[3]) <= 2 && a[6] === b[6] && Math.abs(a[5] - b[5]) <= 0.02 && a[7] === b[7];
  const midsLead = lead ? lead.mids.filter((m) => m.v) : [];
  const moving = midsLead.some((m) => !same(m.v, lead.end));
  const settledAt = moving ? (midsLead.find((m, k) => same(m.v, lead.end) && midsLead.slice(k).every((x) => same(x.v, lead.end))) || {}).t : null;
  let duration = durs.length ? Math.round(Math.max(...durs)) : cssDur ? Math.round(cssDur) : settledAt ? Math.round(settledAt) : 0;
  const notes = [];
  if (!moving && !durs.length && !cssDur) { duration = 0; notes.push('сразу, без анимации'); }
  else if (!durs.length && !cssDur && moving) notes.push(settledAt ? `по снимкам — улеглось к ${Math.round(settledAt)} мс` : 'двигалось дольше 0.7 с — длительность по снимкам не видна');
  if (diff.lockBase && diff.lock !== diff.lockBase && /hidden|clip/.test(diff.lock)) notes.push('прокрутка страницы блокируется');
  if (t.type === 'accordion' && t.count) notes.push(`пунктов ${t.count}`);
  if (t.type === 'tab' && t.count) notes.push(`вкладок ${t.count}`);
  return { kind: 'click', sub: CLICK_SUB[t.type], trigger: 'click', component: t.how, props: props.slice(0, 6), timing: { duration: duration || undefined, easing: easing || undefined, note: notes.join(', ') || undefined },
    el: { sig: pt.sig, text: pt.text, expect: t.expect ? { kind: t.expect } : pt.expect ? { kind: pt.expect } : null }, box: panel ? { x: panel.end[1], y: panel.end[2], w: panel.end[3], h: panel.end[4] } : null };
}

/* Переходы со страницы на время кликов: запрос документа главного кадра останавливается (CDP Fetch, только тип
   Document — остальные запросы идут как шли, кадры iframe грузятся), документ остаётся — с ним окно замеров и
   window.__moEls. blocked — адреса остановленных переходов; release() — снять (до page.goto обязательно). */
async function holdNavigation(page) {
  const blocked = []; let cdp = null; let on = false;
  const release = async () => { if (!on) return; on = false; try { await cdp.send('Fetch.disable'); } catch (e) { /* вкладка закрыта */ } try { await cdp.detach(); } catch (e) { /* уже */ } };
  try {
    cdp = await page.createCDPSession();
    const { frameTree } = await cdp.send('Page.getFrameTree'); const main = frameTree.frame.id;
    cdp.on('Fetch.requestPaused', (e) => {
      if (e.frameId === main) { blocked.push(e.request.url); cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'Aborted' }).catch(() => {}); }
      else cdp.send('Fetch.continueRequest', { requestId: e.requestId }).catch(() => {});
    });
    await cdp.send('Fetch.enable', { patterns: [{ resourceType: 'Document', requestStage: 'Request' }] }); on = true;
  } catch (e) { if (cdp) await cdp.detach().catch(() => {}); return { ok: false, blocked, release, err: String(e.message || e).slice(0, 100) }; }
  return { ok: true, blocked, release };
}

/**
 * Нажать на всё, что раскрывается по клику (clicks.mjs: меню, аккордеоны — до 2 групп, вкладки,
 * [aria-expanded]), до maxN штук и не дольше 60 с: навести (наведение — до снимка «до»), снимок всех
 * элементов, клик, снимки через 80/200/400/700 мс и через 1.5 с, разбор; вырезка открытого; закрыть
 * (повторный клик, для вкладок — клик по прежней, иначе Escape) и записать, закрылось ли.
 * Клик, который уводит со страницы (кнопка с location.href, отправка формы, перезагрузка, новая вкладка), — пропуск
 * «клик увёл со страницы»: переход остановлен (holdNavigation), вкладка закрыта, клики идут дальше. Смена адреса без
 * перехода (history.replaceState у фильтра: /menu?venue=mosty) — та же страница, разбор как обычно; раньше это
 * считалось уходом, и goBack() уводил на about:blank. Документ всё же сменился — страница открывается заново (home),
 * остальные клики не проверяются, replaced: true (вырезки движений по индексам уже не снять).
 */
async function probeClicks(page, vp, deps, { maxN = 6, cropDir = null, out = null, debug = false, home = null } = {}) {
  const items = [], notes = [], tried = [];
  await scrollToY(page, 0); await page.mouse.move(1, 1).catch(() => {}); await sleep(300);
  let found;
  try { found = await findClickTargets(page, { want: ['accordions', 'toggles', 'tabs', 'disclosures', 'hooks'] }); } catch (e) { notes.push(`поиск нажимаемого: ${String(e.message || e).slice(0, 120)}`); return { items, notes, tried }; }
  const hold = await holdNavigation(page);
  if (!hold.ok) notes.push(`переходы на время кликов не остановлены (CDP Fetch: ${hold.err}) — клик, который уводит со страницы, прервёт клики`);
  const popups = []; const onPopup = (p) => { popups.push(p ? p.url() || 'about:blank' : '?'); if (p) p.close().catch(() => {}); };
  const onDialog = (d) => { d.dismiss().catch(() => {}); };             /* beforeunload и alert на клике — не ждать человека */
  page.on('popup', onPopup); page.on('dialog', onDialog);
  const docTok = await page.evaluate(() => (window.__moDoc = window.__moDoc || String(Math.random()).slice(2))).catch(() => null);
  const sameDoc = async () => docTok !== null && (await page.evaluate(() => window.__moDoc || null).catch(() => null)) === docTok;
  let replaced = false;
  try {
  for (const e of found.errors || []) notes.push(`поиск нажимаемого: ${e}`);
  const targets = [];
  for (const x of found.toggles) targets.push({ type: 'toggle', sel: `[data-rw-ctog="${x.i}"]`, how: x.how, expect: x.expect });
  /* хуки Tilda: #menuopen — меню (если это не тот же переключатель), #popup:<имя> — окно; пара «ссылка → окно» из разметки */
  for (const h of found.hooks || []) if (!found.toggles.some((x) => x.selector === h.selector)) targets.push({ type: h.kind === 'меню' ? 'toggle' : 'popup', sel: `[data-rw-chook="${h.i}"]`, how: `Tilda ${h.href} → ${h.target ? `${h.target.code || '?'} ${h.target.rec || ''}`.trim() : 'окно в разметке не найдено'}`, expect: h.expect });
  for (const g of [...found.accordions.groups].sort((a, b) => b.count - a.count).slice(0, 2)) if (g.probe[0]) targets.push({ type: 'accordion', sel: `[data-rw-cacc="${g.probe[0].id}"]`, how: `${g.chevron || 'без значка'}, ответ ${g.how}`, count: g.count, expect: g.expect });
  for (const x of found.tabs) targets.push({ type: 'tab', sel: `[data-rw-ctab="${x.n}:t"]`, back: `[data-rw-ctab="${x.n}:c"]`, how: x.how, count: x.count, expect: x.expect });
  for (const x of found.disclosures) targets.push({ type: 'disclosure', sel: `[data-rw-cexp="${x.i}"]`, how: x.controls ? `aria-expanded, aria-controls=${x.controls}` : 'aria-expanded', expect: x.expect });
  const t0all = Date.now(); let k = 0;
  const snap = (name) => evaluateWith(page, ckSnapInPage, name, deps);
  for (const t of targets.slice(0, maxN)) {
    if (Date.now() - t0all > 60000) { notes.push(`клики: не хватило 60 с, не нажато ${targets.length - tried.length}`); break; }
    const sub = CLICK_SUB[t.type];
    const pt = await evaluateWith(page, ckPointInPage, t.sel, deps).catch(() => null);
    if (!pt || pt.skip) { tried.push({ ...t, skip: pt ? pt.skip : 'не найден' }); notes.push(`клик (${sub}) ${t.sel}: ${pt ? pt.skip : 'не найден'}`); continue; }
    const url0 = page.url(); const nb = hold.blocked.length, np = popups.length;
    try {
      await page.mouse.move(pt.x, pt.y, { steps: 3 }); await sleep(450);
      const b = await snap('base'); await sleep(300); await snap('pre');   /* второй снимок до клика: что меняется само */
      /* точка заново, без прокрутки: на телефоне наведение сдвигает видимое окно (у страницы шире экрана) */
      const pn = await evaluateWith(page, ckPointInPage, { sel: t.sel, noScroll: true }, deps).catch(() => null); const cp = pn && !pn.skip ? pn : pt;
      const tIn = await page.evaluate(() => performance.now());
      await page.mouse.click(cp.x, cp.y); const tc = Date.now();
      const MIDS = [80, 200, 400, 700];
      for (let q = 0; q < MIDS.length; q++) { const w = MIDS[q] - (Date.now() - tc); if (w > 0) await sleep(w); await snap('m' + q); }
      await sleep(Math.max(0, 1500 - (Date.now() - tc)));
      await snap('end');
      /* увёл со страницы: переход остановлен или открылась новая вкладка — документ тот же, клик не в счёт */
      if (hold.blocked.length > nb || popups.length > np) {
        const how = hold.blocked.length > nb ? `переход на ${hold.blocked[nb]} остановлен` : `открыл новую вкладку (${popups[np]}) — закрыта`;
        tried.push({ ...t, text: pt.text, skip: `клик увёл со страницы: ${how}` }); notes.push(`клик по «${pt.text || pt.sig}» (${sub}) увёл со страницы: ${how}; клик пропущен`);
        await page.mouse.move(1, 1).catch(() => {}); continue;
      }
      if (!(await sameDoc())) throw Object.assign(new Error('документ сменился'), { replacedDoc: true });
      if (page.url().split('#')[0] !== url0.split('#')[0]) notes.push(`клик по «${pt.text || pt.sig}» (${sub}) сменил адрес на ${page.url()} без перехода (history API) — та же страница`);
      let diff = await evaluateWith(page, ckDiffInPage, { t0: tIn, mids: ['m0', 'm1', 'm2', 'm3'], trg: '[data-rw-ck-hit]' }, deps);
      const kfNames = diff ? [...new Set(diff.changed.filter((c) => c.anim).map((c) => String(c.anim.name).split(',')[0].trim()))].slice(0, 20) : [];
      const kf = kfNames.length ? await evaluateWith(page, keyframesInPage, kfNames, deps).catch(() => ({})) : {};
      let it = diff ? summarizeClick(t, pt, { ...diff, lockBase: b.lock }, kf) : null;
      if (!it && vp.hasTouch) { await page.touchscreen.tap(cp.x, cp.y).catch(() => {}); await sleep(1500); await snap('end'); diff = await evaluateWith(page, ckDiffInPage, { t0: tIn, mids: [], trg: '[data-rw-ck-hit]' }, deps); it = diff ? summarizeClick(t, pt, { ...diff, lockBase: b.lock }, kf) : null; }
      tried.push({ ...t, text: pt.text, changed: diff ? diff.total : 0, item: !!it, ...(debug && diff ? { diff: { added: diff.added, changed: diff.changed.slice(0, 40).map((c) => ({ i: c.i, par: c.par, sig: c.sig, text: c.text.slice(0, 30), trigger: c.trigger, base: c.base, end: c.end, mids: c.mids.map((m) => [m.t, m.v && m.v.slice(0, 7)]), ev: c.ev, waapi: c.waapi.map((w) => ({ t: w.t, dur: w.dur, easing: String(w.easing).slice(0, 40) })), styleLast: c.styleLast })) } } : {}) });
      if (!it) { notes.push(`клик по «${pt.text || pt.sig}» (${sub}) видимо ничего не изменил`); continue; }
      k++;
      if (cropDir && it.box) {
        try {
          const sc = await page.evaluate(() => ({ x: scrollX, y: scrollY, vw: innerWidth, vh: innerHeight }));
          const px = cp.lx ?? cp.x, py = cp.ly ?? cp.y;                /* коробка панели — в окне раскладки, точка — тоже */
          const L = Math.max(0, Math.min(it.box.x, px - 40) - 12), T = Math.max(0, Math.min(it.box.y, py - 30) - 12);
          const R = Math.min(sc.vw, Math.max(it.box.x + it.box.w, px + 40) + 12), B = Math.min(sc.vh, Math.max(it.box.y + it.box.h, py + 30) + 12);
          if (R - L > 8 && B - T > 8) { const f = path.join(cropDir, `c${String(k).padStart(2, '0')}.png`); await page.screenshot({ path: f, clip: { x: L + sc.x, y: T + sc.y, width: R - L, height: B - T }, captureBeyondViewport: false }); it.crop = path.relative(out, f).replace(/\\/g, '/'); }
        } catch (e) { /* без вырезки */ }
      }
      delete it.box;
      /* закрыть: повторный клик (вкладки — по прежней), иначе Escape */
      /* закрылось: то, что клик открыл (видимость, высота), вернулось как было; менявшееся само (снимок pre) — не в счёт */
      const shut = async () => { await snap('close'); return page.evaluate(() => { const S = window.__ckS, P = S.pre; let n = 0, back = 0; for (let i = 0; i < S.base.rows.length; i++) { const a = S.base.rows[i], z = S.end.rows[i], c = S.close.rows[i]; if (!a || !z || !c) continue; if (P && P.rows[i] && (P.rows[i][0] !== a[0] || Math.abs(P.rows[i][4] - a[4]) > 3)) continue; if (a[0] !== z[0] || Math.abs(a[4] - z[4]) > 12) { n++; if (c[0] === a[0] && Math.abs(c[4] - a[4]) <= 12) back++; } } return n ? back / n : 1; }); };
      const again = await evaluateWith(page, ckPointInPage, t.back || t.sel, deps).catch(() => null);
      let closedBy = null;
      const waitShut = Math.min(2600, Math.max(1100, (it.timing.duration || 0) + 450));
      if (again && !again.skip) { await page.mouse.click(again.x, again.y).catch(() => {}); await sleep(waitShut); if ((await shut()) >= 0.8) closedBy = t.type === 'tab' ? 'клик по прежней вкладке' : 'повторный клик'; }
      if (!closedBy) { await page.keyboard.press('Escape').catch(() => {}); await sleep(waitShut); if ((await shut()) >= 0.8) closedBy = 'Escape'; }
      /* Tilda: шторка T450 и окна закрываются своей кнопкой или подложкой, Escape не всегда; открытая шторка закрывала бы
         точки нажатия следующих кликов («точку нажатия закрывает другой элемент») */
      if (!closedBy) {
        const hit = await page.evaluate(() => { const el = [...document.querySelectorAll('.t450__close, .t450__close_icon, .t450__overlay, .t-popup_show .t-popup__close, .t-popup_show a[href="#closepopup"], a[href="#closepopup"], .t-popup_show')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (!el) return null; el.click(); return el.className && String(el.className).split(' ')[0] || el.tagName.toLowerCase(); }).catch(() => null);
        if (hit) { await sleep(waitShut); if ((await shut()) >= 0.8) closedBy = `кнопка закрытия Tilda (${hit})`; }
      }
      it.timing.note = [it.timing.note, closedBy ? `закрывается: ${closedBy}` : 'не закрылся ни повторным кликом, ни Escape'].filter(Boolean).join(', ');
      items.push(it);
    } catch (e) {
      /* документ сменился (переход не остановлен, history.back() скриптом страницы): страница — заново, клики — всё */
      if (e.replacedDoc || !(await sameDoc())) {
        replaced = true; const at = page.url();
        tried.push({ ...t, text: pt.text, skip: 'клик увёл со страницы: документ сменился' });
        notes.push(`клик по «${pt.text || pt.sig}» (${sub}) увёл со страницы (документ сменился${at !== url0 ? `, адрес ${at}` : ''}) — страница открыта заново, остальные клики не проверялись`);
        await hold.release();
        try { await gotoRetry(page, home || url0, { waitUntil: 'load', timeout: 60000 }); await closeConsent(page).catch(() => {}); } catch (e2) { notes.push(`страница после ухода не открылась: ${String(e2.message || e2).slice(0, 100)}`); }
        break;
      }
      notes.push(`клик (${sub}) ${t.sel}: ${String(e.message || e).slice(0, 100)}`);
    }
    await page.mouse.move(1, 1).catch(() => {});
  }
  if (!targets.length) notes.push('по клику раскрываться нечему: меню-бургера, аккордеонов, вкладок и [aria-expanded] не найдено');
  } finally { await hold.release(); page.off('popup', onPopup); page.off('dialog', onDialog); }
  return { items, notes, tried, replaced, found: { toggles: found.toggles.length, accordions: found.accordions.groups.length, tabs: found.tabs.length, disclosures: found.disclosures.length, ...(found.hooks && found.hooks.length ? { tildaHooks: found.hooks.length } : {}) } };
}

/* ---------- Tilda: пункты из атрибутов точнее замера ----------
   Tilda-донор: движение Tilda лежит в атрибутах (вид, шаги, длительности, задержки, кривые, точка срабатывания,
   повтор, экраны) — tilda.mjs переводит их в пункты схемы motion.json (source «атрибуты Tilda», plays — играет ли
   у донора на этом экране). Замер на тех же элементах (ключ recid:elemid по closest('.t396__elem'), группа
   recid:g<id>; стандартный блок — по rec) не выводится отдельно: пункт Tilda берёт его в «замер: …» (совпал по
   виду или расходится — верно по атрибутам). Так уходят ложные «привязано к прокрутке» у петель SBS intoview+loop
   (пульс, вращение 25 с), «параллакс» у появлений, пойманных на середине, и «по очереди +133 мс» вместо задержек
   донора 0/300/600. Переносится только то, что играет (plays): на ширине < 1200 Tilda снимает появления, кроме
   data-animate-mobile=y, — их нет и в замере телефона, а пункты с plays: false уходят в заметку (не переносить).
   Служебное Tilda (#allrecords проявляется, t-mbfix, полоса T360) — не движение донора. */
const SVC_SIG = /#allrecords|(^|\.)t-records(\.|$)|t-mbfix|t360__|#tildacopy|t-tildalabel/;
function mergeTilda(final, snap, byI) {
  const T = snap.motion || [];
  const byKey = new Map(), byRec = new Map();
  for (const m of T) {
    for (const k of m.keys || (m.key ? [m.key] : [])) if (!byKey.has(k)) byKey.set(k, m);
    if (m.rec && !m.key) { if (!byRec.has(m.rec)) byRec.set(m.rec, []); byRec.get(m.rec).push(m); }
  }
  const stat = { measuredReplaced: 0, measuredOff: 0, service: 0, added: 0, addedRows: 0, off: 0, appearNow: snap.platform.appearNow, vw: snap.vw };
  const items = [], offSeen = [];
  for (const f of final) {
    const idx = f.is && f.is.length ? f.is : f.i !== undefined ? [f.i] : [];
    const tks = idx.map((i) => (byI.get(i) || {}).tk).filter(Boolean);
    /* вход при загрузке, закончившийся до первого снимка (проявление #allrecords за 0.5 с), — ряда замеров у элемента нет,
       ключа тоже: служебное узнаётся по подписи, обёртка SBS — по id «sbs-<recid>-<elemid>» */
    const fsig = (f.el && f.el.sig) || '';
    if (!tks.length && SVC_SIG.test(fsig)) { stat.service++; continue; }
    const sm = !tks.length && /#sbs-(\d+)-(\d+)/.exec(fsig); if (sm) tks.push({ keys: [`${sm[1]}:${sm[2]}`], rec: `rec${sm[1]}`, std: false, svc: false });
    if (!tks.length) { items.push(f); continue; }
    if (tks.every((t) => t.svc)) { stat.service++; continue; }
    let m = null;
    for (const t of tks) { for (const k of t.keys) if (byKey.has(k)) { m = byKey.get(k); break; } if (m) break; }
    if (!m) for (const t of tks) if (t.std && byRec.has(t.rec)) { m = byRec.get(t.rec).find((x) => x.plays) || byRec.get(t.rec)[0]; break; }
    if (!m) { items.push(f); continue; }
    (m._measured = m._measured || []).push({ kind: f.kind, sub: f.sub, what: f.props.slice(0, 2).map((p) => `${p.prop} ${p.from}→${p.to}`).join('; '), stagger: f.timing && f.timing.stagger });
    if (m.plays) stat.measuredReplaced++; else { stat.measuredOff++; offSeen.push(`${f.el ? f.el.sig : '?'} (${KIND_RU[f.kind] || f.kind})`); }
  }
  /* пункты Tilda, которые играют на этом экране, — одной строкой ×N при одинаковых виде, шагах и числах */
  const groups = new Map();
  for (const m of T) {
    if (!m.plays) { stat.off += m.count || 1; continue; }
    const k = [m.kind, m.sub || '', m.words || JSON.stringify(m.props), (m.timing && m.timing.duration) || '', ((m.timing && m.timing.delays) || []).join('/'), m.recipe || '', m.trigger, m.scroll ? m.scroll.from || m.scroll.at || '' : '', m.where || ''].join('|');
    const g = groups.get(k);
    if (g) { g.count += m.count || 1; for (const e of m.examples || [m.target]) if (g.examples.length < 3 && !g.examples.includes(e)) g.examples.push(e); g.keys.push(...(m.keys || (m.key ? [m.key] : []))); if (m._measured) g._measured.push(...m._measured); continue; }
    groups.set(k, { ...m, count: m.count || 1, examples: [...(m.examples || [m.target])].slice(0, 3), keys: [...(m.keys || (m.key ? [m.key] : []))], _measured: [...(m._measured || [])] });
  }
  for (const g of groups.values()) {
    const ms = g._measured; delete g._measured; delete g.id;
    if (ms.length) {
      const kinds = [...new Set(ms.map((x) => KIND_RU[x.kind] || x.kind))];
      const same = ms.every((x) => x.kind === g.kind || (x.kind === 'entrance' && g.kind === 'reveal'));
      const st = ms.find((x) => x.stagger);
      g.check = same ? `замер совпал по виду (${kinds.join(', ')}); числа — из атрибутов Tilda${st && g.timing && g.timing.delays ? ` (замер: «по очереди +${st.stagger} мс» — у донора задержки ${g.timing.delays.join(' / ')} мс)` : ''}` : `замер назвал «${kinds.join('», «')}» (${ms[0].what}) — верно по атрибутам Tilda: ${KIND_RU[g.kind] || g.kind}${g.sub ? ` (${g.sub})` : ''}`;
    }
    if (g.keys.length > 40) g.keys = g.keys.slice(0, 40);
    if (g.kind === 'click' && !g.recipe) g.recipe = 'click';
    items.push({ ...g, tilda: true, cropSel: g.target, coefs: g.coefs || [], el: { sig: g.target, text: g.text || '' } });
    stat.added += g.count; stat.addedRows++;
  }
  const info = `Tilda: движение из атрибутов (tilda.mjs) — точнее замера: строк ${stat.addedRows} (элементов ${stat.added}); замеров на тех же элементах заменено ${stat.measuredReplaced}${stat.service ? `; служебное Tilda (проявление #allrecords, t-mbfix, полоса T360) не в счёт: ${stat.service}` : ''}`;
  const notes = [];
  if (stat.off) {
    const why = {}; for (const m of T.filter((x) => !x.plays)) why[m.playsBy] = (why[m.playsBy] || 0) + (m.count || 1);
    notes.push(`Tilda на этом экране (${snap.vw}px) не играет: ${stat.off} — ${Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ×${n}`).join('; ')}. Не переносить на этом экране (reference/donor-tilda.md)`);
  }
  if (snap.vw < 1200) notes.push(`Tilda: на ширине < 1200 появления выключает сама Tilda (кроме Zero Block с data-animate-mobile=y) — пустой инвентарь телефона правда, а не сбой`);
  if (stat.measuredOff) notes.push(`замер видел движение на ${stat.measuredOff} элементах, которые по атрибутам Tilda на этом экране не играют (${offSeen.slice(0, 3).join(', ')}) — в инвентарь не взяты; сверить глазами`);
  return { items, stat, notes, info };
}

/* ---------- сборка ---------- */
function describeTrigger(it) {
  if (it.tilda || it.source === 'атрибуты Tilda') {
    if (it.kind === 'loop' || it.kind === 'marquee') return `время, ${it.start || 'само'}${it.scroll && it.scroll.at ? ` (${it.scroll.at})` : ''}`;
    if (it.kind === 'hover') return `наведение${it.hover && it.hover.trigger && it.hover.trigger.length ? ` на ${it.hover.trigger.slice(0, 2).join(', ')}` : ''}${it.hover && it.hover.reverse === false ? ', без обратного хода' : ''}`;
  }
  if (it.kind === 'reveal') return `прокрутка: ${it.scroll.at}${it.cause ? `; ${it.cause}` : ''}`;
  if (it.kind === 'parallax') return `прокрутка: сдвиг = коэффициент × прокрутка${it.coefs && it.coefs.length > 1 ? ` (слои: ${it.coefs.join(', ')})` : ` (${it.scroll.coefficient})`}`;
  if (it.kind === 'scroll-linked') return it.scroll && it.scroll.from ? `прокрутка: ${it.scroll.from} → ${it.scroll.to} (${it.scroll.rangePx} px)` : `прокрутка${it.scroll && it.scroll.note ? `: ${it.scroll.note}` : ''}`;
  return { load: 'загрузка', time: 'время (само)', scroll: 'прокрутка', hover: 'наведение', mouse: 'движение мыши', click: 'клик' }[it.trigger] || it.trigger;
}
function describeTiming(it) {
  const t = it.timing || {}; const p = [];
  if (t.duration) p.push(`${t.duration} мс`); if (t.easing) p.push(easeShort(t.easing)); if (t.delay) p.push(`задержка ${t.delay} мс`);
  if (t.stagger) p.push(`по очереди +${t.stagger} мс`);
  if (t.period && !/у каждого свой/.test(t.note || '')) p.push(`период ${round(t.period / 1000, 1)} с`);   /* у группы вразнобой — диапазон в note */ if (t.speed) p.push(t.speed); if (t.note) p.push(t.note);
  if (it.scroll && it.scroll.coefficient !== null && it.scroll.coefficient !== undefined) p.push(`коэффициент ${it.scroll.coefficient} (px сдвига на px прокрутки)`);
  return p.join(', ') || '—';
}
const RECIPE = { entrance: 'entrance', reveal: 'reveal', 'scroll-linked': 'scroll-scrub', parallax: 'parallax', pinned: 'pin', header: 'header-scroll', progress: 'scroll-progress',
  marquee: 'marquee', typewriter: 'typewriter', 'rotating-words': 'rotating-words', counter: 'counter', carousel: 'carousel-auto', loop: 'loop', hover: 'hover', mouse: 'mouse-tilt', cursor: 'custom-cursor', canvas: 'canvas', video: 'video-bg' };
const KIND_RU = { entrance: 'вход при загрузке', reveal: 'появление', 'scroll-linked': 'привязано к прокрутке', parallax: 'параллакс', pinned: 'закреплённый раздел', header: 'шапка при прокрутке', progress: 'прогресс прокрутки',
  marquee: 'бегущая строка', typewriter: 'печатающийся текст', 'rotating-words': 'смена слов', counter: 'счётчик', carousel: 'карусель сама', loop: 'петля', hover: 'наведение', mouse: 'реакция на мышь', cursor: 'свой курсор', canvas: 'холст рисует', video: 'видео-фон', click: 'по клику' };

async function inventory(url, vpSpec, { out, tag, timeMs = 6000, capMs = LOOP.cap, hoverN = 14, doHover = true, doMouse = true, doScroll = true, doClicks = true, clickN = 6, crops = true, quiet = false, debug = false, browser: shared = null } = {}) {
  const say = (s) => { if (!quiet) console.log(s); };
  const rv = resolveViewport(vpSpec || 'desktop'); if (!rv) die(`Неизвестный экран: ${vpSpec}`);
  const [vpName, vp] = rv;
  const browser = shared || await launch();
  const t0 = Date.now();
  /* phases — что снималось: compare по выключенному у нас (--no-clicks, --no-hover …) пишет «не проверялось», а не «нет» */
  const result = { url, viewport: vpName, size: `${vp.width}×${vp.height}@${vp.deviceScaleFactor || 1}`, takenAt: new Date().toISOString(), phases: { scroll: !!doScroll, hover: !!doHover, mouse: !!doMouse, clicks: !!doClicks }, items: [], libs: {}, notes: [] };
  try {
    const page = await preparePage(browser, vp, {});
    await page.evaluateOnNewDocument(instrument);
    const tLoad0 = Date.now();
    await gotoRetry(page, url, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await waitForOverlay(page, 4000).catch(() => null);
    /* окно cookie закрыть до замеров: оно перекрывает первый экран на вырезках и ловит наведение */
    result.consent = consentNote(await closeConsent(page).catch((e) => ({ found: false, error: String(e.message || e).slice(0, 100) })));
    /* окно выбора из SITE_REWORK_DISMISS увело на другую страницу (город у mamuka.rest: нажали «Ярославль» — перешли
       на главную) — выбор запомнен, снимаемая страница открывается заново; иначе под адресом /about/ снималась главная */
    const pathOf = (u) => { try { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/+$/, '')}`; } catch (e) { return String(u); } };
    if (page.rwDismiss && page.rwDismiss.navTo && pathOf(page.url()) !== pathOf(url)) {
      const at = page.url();
      await gotoRetry(page, url, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await waitForOverlay(page, 4000).catch(() => null);
      await closeConsent(page).catch(() => null);
      result.notes.push(`окно SITE_REWORK_DISMISS увело на ${at} — ${pathOf(page.url()) === pathOf(url) ? 'страница открыта заново' : `открыта заново, но снова ушла на ${page.url()} — снимается не та страница`}`);
      say(`окно SITE_REWORK_DISMISS увело на ${at} — ${url} открыта заново`);
    }
    /* окна при загрузке (lib): увело на другой адрес — lib уже открыл нужную страницу заново (заметка — как раньше);
       итог нажатия и открытое окно — в протокол (windows) и вердикт: WARN — окно открыто (замеры под ним), не найдено,
       скрыто, окно вернулось, снимается не та страница */
    const dl = (page.rwDismiss && page.rwDismiss.list) || [];
    if (!result.notes.some((x) => /^окно SITE_REWORK_DISMISS увело на/.test(x))) for (const d of dl) if (d.nav) result.notes.push(`окно SITE_REWORK_DISMISS ${d.reload ? 'перезагрузило страницу' : `увело на ${d.nav}`} — ${d.wrongPage ? `открыта заново, но снова ушла на ${d.back} — снимается не та страница` : d.again ? 'страница открыта заново, но окно снова на экране — сайт не запомнил выбор' : 'страница открыта заново'}`);
    result.windows = { dismiss: dl.length ? dl : null, modal: page.rwModal || null, wrongPage: page.rwWrongPage || null, notes: takeNotes(), warnings: takeWarnings() };
    for (const x of result.windows.notes) say(`INFO ${x}`);
    for (const x of result.windows.warnings) say(`WARN ${x}`);
    const deps = { sig: SIG_FN, screenPt: SCREEN_POINT_FN, svc: IS_TILDA_SERVICE_FN };
    result.libs = await evaluateWith(page, libsInPage, null, deps);
    let n = await evaluateWith(page, collectInPage, 5000, deps);
    /* под наблюдение попала малая доля элементов (у остальных коробка меньше 100 px²) — страница не дорисовалась:
       shapefest в 2 из 7 открытий давал 69–214 вместо 850–1500, и петли стопки не находились вовсе. Подождать и
       собрать заново один раз; не помогло — записать в протокол */
    const domAll = async () => page.evaluate(() => (document.body ? document.body.getElementsByTagName('*').length : 0)).catch(() => 0);
    let all = await domAll();
    if (all > 300 && n < all * 0.3) { await sleep(2000); n = await evaluateWith(page, collectInPage, 5000, deps); all = await domAll(); }
    if (all > 300 && n < all * 0.3) result.notes.push(`под наблюдением ${n} элементов из ${all} в DOM — страница, похоже, не дорисовалась; снимок неполный, переснять`);
    say(`Страница открыта за ${round((Date.now() - tLoad0) / 1000, 1)} с · элементов под наблюдением: ${n} (в DOM ${all}) · ${result.libs.libs.join(', ') || 'библиотек движения не видно'}`);

    /* 1. без прокрутки: время. Базовое окно timeMs; если кто-то движется медленнее окна (меньше двух разворотов
       и не встал, или едва начал и движется ровно) — продлевать кусками по LOOP.chunk, но не дольше capMs */
    const timeSteps = [];
    const tStart = Date.now(); let tStop = tStart + timeMs; let peeks = 0; let slow = 0;
    for (;;) {
      while (Date.now() < tStop) { timeSteps.push((await evaluateWith(page, sampleInPage, 'time', deps)).step); await sleep(110); }
      if (Date.now() - tStart >= capMs) break;
      const peek = await evaluateWith(page, timePeekInPage, null, deps); peeks++;
      const an = await evaluateWith(page, animationsInPage, null, deps);
      const cssOf = (i) => an.find((a) => a.i === i && a.iterations === 'infinite' && !a.timeline) || null;
      const st = peek.t.map((t) => ({ t }));
      slow = peek.series.filter((el) => { el.u = unroll(el.rows, st.length); return unresolved(classifyEl(el, st, timeSteps, { cssLoop: cssOf(el.i) })); }).length;
      if (!slow) break;
      tStop = Math.min(tStart + capMs, Date.now() + LOOP.chunk);
    }
    const timeObs = Date.now() - tStart;
    if (timeObs > timeMs + 500) say(`Окно «время» продлено до ${round(timeObs / 1000, 1)} с: медленное движение (период длиннее окна ${round(timeMs / 1000, 1)} с)${Date.now() - tStart >= capMs && slow ? ', упёрлось в --time-cap' : ''}`);
    const animsTop = await evaluateWith(page, animationsInPage, null, deps);
    /* текст, который менялся: наблюдать чаще и дольше — слово печатается, держится секунды и стирается */
    const txtIdx = await evaluateWith(page, textCandidatesInPage, null, deps);
    const textWatch = txtIdx.length ? await evaluateWith(page, textWatchInPage, { idx: txtIdx, ms: 9000 }, deps) : {};
    const textLog = await evaluateWith(page, textLogInPage, null, deps).catch((e) => { result.notes.push(`журнал смен текста не прочитан: ${String(e.message || e).slice(0, 120)}`); return []; });
    const textLogSize = debug ? await page.evaluate(() => { const mo = window.__mo; if (!mo || !mo.text) return null; const by = {}; for (const [el, log] of mo.text) { const k = el.tagName + '.' + String(el.getAttribute('class') || '').split(' ')[0] + (el.isConnected ? '' : ' (отключён)'); (by[k] = by[k] || []).push(log.length); } return { size: mo.text.size, by }; }).catch((e) => String(e.message || e)) : null;

    /* 2. прокрутка */
    const scrollSteps = []; const upSteps = [];
    if (doScroll) {
      await scrollToY(page, 0); await sleep(300);
      let H = await evaluateWith(page, detectScrollerInPage, null, deps);
      const step = Math.max(Math.round(vp.height * 0.25), Math.ceil((H - vp.height) / 80));
      const settle = async () => {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        let prev = null;
        for (let i = 0; i < 6; i++) { await sleep(150); const s = await evaluateWith(page, hotHashInPage, null, deps); if (prev && s.h === prev.h && !s.busy) break; prev = s; }
      };
      for (let y = 0; ; y += step) {
        const target = Math.min(y, H - vp.height); await scrollToY(page, target); await settle();
        scrollSteps.push((await evaluateWith(page, sampleInPage, 'scroll', deps)).step);
        H = await page.evaluate(() => { const sc = window.__rwScroller; return sc && sc.isConnected ? sc.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0); });
        if (target >= H - vp.height || scrollSteps.length > 140) break;
      }
      const bottom = await page.evaluate(() => { const sc = window.__rwScroller; return sc && sc.isConnected ? sc.scrollTop : scrollY; });
      for (const k of [0.6, 1.4]) { await scrollToY(page, Math.max(0, bottom - vp.height * k)); await settle(); upSteps.push((await evaluateWith(page, sampleInPage, 'up', deps)).step); }
    }
    /* Tilda: карта из атрибутов (tilda.mjs) — после прохода прокруткой: классы появлений уже расставлены, «играет ли»
       — по ним; пункты из атрибутов точнее замера (сопоставляются по ключу recid:elemid, см. mergeTilda) */
    let tsnap = null;
    const tinfo = await tildaInfo(page);
    if (tinfo.tilda) { try { tsnap = await tildaSnapshot(page, { scroll: false, viewport: vpName }); if (!tsnap.tilda) tsnap = null; } catch (e) { result.notes.push(`карта Tilda (tilda.mjs) не снялась: ${String(e.message || e).slice(0, 120)} — движение только по замеру`); } }

    /* 3. мышь по первому экрану (после прокрутки — вернуться наверх) */
    let mouse = null;
    if (doMouse) {
      await scrollToY(page, 0); await sleep(400);
      const snaps = []; const pts = [[0.25, 0.35], [0.75, 0.35], [0.75, 0.75], [0.25, 0.75]];
      for (const [fx, fy] of pts) { await page.mouse.move(vp.width * fx, vp.height * fy, { steps: 8 }); await sleep(380); snaps.push({ x: vp.width * fx, y: vp.height * fy, s: await evaluateWith(page, mouseSnapInPage, null, deps) }); }
      await page.mouse.move(1, 1); mouse = snaps;
    }

    /* 4. наведение — последним: прыгает по странице */
    const hovers = [];
    if (doHover) {
      const cands = await evaluateWith(page, hoverCandidatesInPage, hoverN, deps);
      for (const c of cands) {
        try {
          await page.evaluate((h) => window.__moHover[h].scrollIntoView({ block: 'center', behavior: 'instant' }), c.h); await sleep(200);
          const before = await evaluateWith(page, hoverStateInPage, c.h, deps); if (!before) continue;
          await page.mouse.move(before.box.x, before.box.y, { steps: 4 });
          await sleep(Math.min(1500, before.dur + 150));
          const after = await evaluateWith(page, hoverStateInPage, c.h, deps);
          await page.mouse.move(1, 1); await sleep(Math.min(800, before.dur + 50));
          if (after) hovers.push({ ...c, before, after });
        } catch (e) { /* элемент ушёл — дальше */ }
      }
      await scrollToY(page, 0); await sleep(300);
    }

    /* замеры со страницы — до кликов: клик может заменить документ (переход, перезагрузка), и с ним пропали бы
       window.__moS и журнал событий — «Cannot read properties of undefined (reading 'series')» на /menu Эпицентра */
    const tClick0 = await page.evaluate(() => performance.now());
    const animsEnd = await evaluateWith(page, animationsInPage, null, deps);
    const wows = result.libs.libs.some((x) => /^WOW\.js/.test(x)) ? await evaluateWith(page, wowInPage, null, deps).catch(() => []) : [];
    const ev = await evaluateWith(page, eventsInPage, null, deps);
    const data = await evaluateWith(page, seriesOutInPage, null, deps);
    const kfNames = [...new Set([...animsTop, ...animsEnd].filter((a) => a.kind === 'CSSAnimation').map((a) => a.name).concat(ev.ev.filter((e) => e.type === 'anim').map((e) => e.name)))].slice(0, 80);
    const kf = await evaluateWith(page, keyframesInPage, kfNames, deps);

    /* 5. клики — после наведения: меню, аккордеоны, вкладки, [aria-expanded] (раскрывают и закрывают обратно) */
    let clicks = null;
    if (doClicks) {
      const cropDir = crops ? ensureDir(path.join(out, 'motion', tag)) : null;
      clicks = await probeClicks(page, vp, deps, { maxN: clickN, cropDir, out, debug, home: url }).catch((e) => ({ items: [], notes: [`клики: ${String(e.message || e).slice(0, 120)}`], tried: [] }));
      await scrollToY(page, 0).catch(() => {}); await sleep(300);
    }

    if (debug) writeJson(path.join(out, "motion", `${tag}.series.json`), { steps: data.steps, series: data.series.map((x) => ({ ...x, u: undefined })), timeIdx: timeSteps, scrollIdx: scrollSteps, upIdx: upSteps, anims: animsTop, textWatch, textLog, textLogSize });
    /* ---------- разбор ---------- */
    const steps = data.steps; const nSteps = steps.length;
    const timeIdx = timeSteps; const scrollIdx = scrollSteps;
    const vw = vp.width, vh = vp.height;
    const items = [];
    const byI = new Map(data.series.map((s) => [s.i, s]));
    for (const el of data.series) el.u = unroll(el.rows, nSteps);
    const loopTargets = new Set(animsTop.filter((a) => a.iterations === 'infinite' && !a.timeline).map((a) => a.i));
    /* имя CSS-анимации, начавшейся у элемента (последней): появление из @keyframes, если класс или style потом сняли */
    const animOf = new Map(); for (const e of ev.ev) if (e.type === 'anim' && e.i >= 0 && !e.pseudo && !loopTargets.has(e.i)) animOf.set(e.i, e.name);
    /* конечные анимации и переходы, начавшиеся в первые 1.5 с окна «время» без нашего участия, — вход при загрузке */
    const tTime0 = steps[timeIdx[0]] ? steps[timeIdx[0]].t : 0;
    /* …кроме того же перехода, что кончается в окне ещё раз (карусель листает раз в 2 с: страница открылась позже —
       lib ждёт окно-заставку до 2 с, — и первый переход попал в первые 1.5 с; карусель пропадала, став входом) */
    const tWin1 = steps[timeIdx[timeIdx.length - 1]] ? steps[timeIdx[timeIdx.length - 1]].t : Infinity;
    const endN = new Map(); for (const e of ev.ev) if ((e.type === 'anim-end' || e.type === 'trans-end') && e.i >= 0 && e.t <= tWin1) { const k = `${e.i}|${e.name || e.prop}`; endN.set(k, (endN.get(k) || 0) + 1); }
    const repeats = new Set([...endN].filter(([, c]) => c >= 2).map(([k]) => Number(k.split('|')[0])));
    const finiteEls = new Set([...ev.ev.filter((e) => (e.type === 'anim-end' || e.type === 'trans-end') && e.t <= tTime0 + 1500).map((e) => e.i), ...ev.waapi.filter((w) => w.t <= tTime0 + 1500 && w.iterations !== 'infinite').map((w) => w.i)].filter((i) => i >= 0 && !loopTargets.has(i) && !repeats.has(i)));
    const evEl = new Map((ev.who || []).map((w) => [w.i, { ...w, rows: [], u: [] }]));
    /* окно «время»: сначала все элементы (петли — группами соседей по родителю), потом прокрутка */
    const timeOf = new Map(); const perEl = [];
    for (const el of data.series) {
      const r = analyzeTime(el, steps, timeIdx, animsTop, finiteEls.has(el.i), textWatch[el.i]);
      timeOf.set(el.i, r); if (r.cls.length) perEl.push({ el, cls: r.cls });
    }
    const loops = loopRows(perEl);
    const inLoop = new Set(loops.flatMap((r) => r.mk));
    const loopAt = new Map(); for (const r of loops) loopAt.set(r.i, [...(loopAt.get(r.i) || []), r]);
    for (const el of data.series) {
      /* какие свойства менялись во времени (петли) — их прокрутке не приписываем: вторая половина окна (как было)
         и то, что разбор окна признал петлёй, вращением, «окном короче периода» или ровным началом долгой петли —
         медленный поворот стопки во второй половину окна не попадал и утекал в параллакс */
      const tv = timeIdx.slice(Math.floor(timeIdx.length / 2)).map((s) => propsOf(el.u[s])).filter(Boolean);
      const timeChanged = new Set();
      for (const k of ['tx', 'ty', 'sc', 'rot', 'op', 'blur', 'clip', 'sl']) { const ys = tv.map((v) => v[k]); if (ys.length > 2 && Math.max(...ys) - Math.min(...ys) > EPS[k] * 2) timeChanged.add(k); }
      if (tv.length > 2 && new Set(tv.map((v) => v.text)).size > 2) timeChanged.add('text');
      const r = timeOf.get(el.i);
      for (const c of r.cls) if (inLoop.has(`${el.i}|${c.k}`) || c.status === 'undetermined' || slowStart(c)) timeChanged.add(c.k);
      for (const it of r.items) items.push({ ...it, i: el.i, el });
      for (const it of loopAt.get(el.i) || []) items.push(it);
      if (loopTargets.has(el.i)) { for (const k of ['tx', 'ty', 'sc', 'rot', 'op']) timeChanged.add(k); }
      for (const it of analyzeScroll(el, steps, scrollIdx, vh, { vw, upIdx: upSteps, timeChanged, animOf })) items.push({ ...it, i: el.i, el });
    }
    /* печать с загрузки (журнал смен текста), которую окна «время» и частое наблюдение не поймали */
    for (const lg of textLog) {
      const prev = items.findIndex((x) => (x.kind === 'typewriter' || x.kind === 'rotating-words') && ((lg.i >= 0 && x.i === lg.i) || (x.el && x.el.sig === lg.sig)));
      const L = lg.log; const add = [], del = [];
      for (let k = 1; k < L.length; k++) { const dl = L[k][1].length - L[k - 1][1].length, dt = (L[k][0] - L[k - 1][0]) / 1000; if (dt > 0 && dt < 1 && dl) (dl > 0 ? add : del).push(Math.abs(dl) / dt); }
      if (add.length < 3) continue;
      const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const once = !del.length && L[L.length - 1][0] < tTime0 + 1500;
      /* окно «время» застало хвост печати, что идёт один раз при загрузке (стенд: печать 1.2 с, страница открылась
         за 0.1 с — «набор ≈1 знаков/с, видели не целиком»): журнал с загрузки видел её целиком — строка из журнала */
      /* то же, если окно видело слово урывками («видели не целиком», «набор ≈0 знаков/с»: shapefest печатает каждое
         слово в новом элементе, под наблюдением только тот, что был при сборе, — длинное окно чаще застаёт его) */
      const weak = (x) => /видели не целиком/.test(x.props.map((p) => p.to).join(' ')) || /≈0 знаков|не пойман/.test((x.timing && x.timing.speed) || '');
      if (prev >= 0 && !once && !weak(items[prev])) continue;
      if (prev >= 0) items.splice(prev, 1);
      const series = lg.i >= 0 ? data.series.find((s) => s.i === lg.i) : null;
      /* слова — допечатанные до стирания (пики длины); ни одного — самое длинное из увиденного */
      const seq = L.map((x) => x[1]); const words = [...new Set(seq.filter((w, q) => q + 1 < seq.length && seq[q + 1].length < w.length && (q === 0 || seq[q - 1].length < w.length) && w.length > 1))];
      /* допечатанное стоит на странице (последняя запись = текущий текст) — слово целое, даже если стирания не видели */
      const settled = seq[seq.length - 1] === lg.text && seq[seq.length - 1].length > 1;
      const shown = once || (!words.length && settled) ? [seq[seq.length - 1]] : words.length ? words.slice(0, 5) : [[...seq].sort((a, b) => b.length - a.length)[0] + ' (видели не целиком)'];
      items.push({ kind: 'typewriter', trigger: once ? 'load' : 'time', props: [{ prop: 'текст', from: '', to: shown.join(' / ').slice(0, 90) }],
        timing: { speed: `набор ≈${round(med(add))} знаков/с${del.length ? `, стирание ≈${round(med(del))}/с` : ''}`, note: once ? `печатается один раз при загрузке (за ${round((L[L.length - 1][0] - L[0][0]) / 1000, 1)} с), дальше стоит` : 'по журналу смен текста с загрузки' },
        ...(lg.i >= 0 ? { i: lg.i } : {}), el: series || { sig: lg.sig, text: lg.text, expect: lg.expect ? { kind: lg.expect } : null } });
    }
    /* бесконечные анимации (CSS/WAAPI): по ключевым кадрам */
    const seenLoop = new Set();
    for (const a of animsTop.filter((x) => x.iterations === 'infinite' && !x.timeline)) {
      const el = byI.get(a.i) || { i: a.i, sig: a.target, text: '', rows: [], u: [] };
      const p0 = el.u && el.u.length ? propsOf(el.u.find(Boolean)) : null;
      const c = classifyLoop(a, kf[a.name], p0);
      /* одна подпись и одни @keyframes — одна строка; у бегущей строки — ещё и одна скорость: две ленты .mq__track с
         одними кадрами и разной длительностью (113 и 164 px/с у «Зелёного уголка») — две строки, а не одна */
      const key = `${a.target}|${a.name}|${a.pseudo}${c.kind === 'marquee' ? `|${c.timing.speed}` : ''}`; if (seenLoop.has(key)) continue; seenLoop.add(key);
      const frames = kf[a.name] && kf[a.name].length ? kf[a.name].map((q) => `${q.at}: ${q.css}`).join(' · ') : '';
      items.push({ ...c, trigger: 'time', props: [{ prop: `${a.pseudo ? a.pseudo + ' ' : ''}кадры`, from: frames ? '' : kfText(a.first), to: frames || kfText(a.last) }],
        timing: { ...c.timing, easing: easeName(kfEase(a.first) || a.easing), period: Number(a.duration) || c.timing.period }, source: a.kind === 'CSSAnimation' ? `css @keyframes ${a.name}` : 'element.animate', i: a.i, el, pseudo: a.pseudo });
    }
    /* CSS scroll-driven: анимации на временной шкале прокрутки */
    for (const a of animsEnd.filter((x) => x.timeline)) {
      const el = byI.get(a.i); const dup = items.find((x) => x.i === a.i && x.kind === 'scroll-linked');
      if (dup) { dup.source = `CSS animation-timeline (${a.timeline}) @keyframes ${a.name}`; continue; }
      items.push({ kind: 'scroll-linked', trigger: 'scroll', props: [{ prop: 'кадры', from: kfText(a.first), to: kfText(a.last) }], scroll: { note: `CSS animation-timeline (${a.timeline})` }, timing: {}, source: `css @keyframes ${a.name}`, i: a.i, el: el || { sig: a.target } });
    }
    /* вход при загрузке: события до конца фазы «время» у элементов первого экрана (базового окна: продление ради
       медленной петли входов не добавляет) */
    const tTimeEnd = Math.min(steps[timeIdx[timeIdx.length - 1]] ? steps[timeIdx[timeIdx.length - 1]].t : Infinity, tTime0 + timeMs);
    const entrance = new Map();
    for (const e of ev.ev.filter((x) => (x.type === 'anim-end' || x.type === 'trans-end') && x.t <= tTimeEnd + 200)) {
      const el = byI.get(e.i) || evEl.get(e.i); const key = `${pattern(e.sig)}|${e.name || e.prop}`;
      if (loopTargets.has(e.i)) continue;
      const g = entrance.get(key) || { sig: e.sig, name: e.name, prop: e.prop, durs: [], starts: [], n: 0, i: e.i, el };
      g.durs.push(e.dur); g.n++; entrance.set(key, g);
    }
    for (const w of ev.waapi.filter((x) => x.t <= tTimeEnd && x.iterations !== 'infinite')) {
      const key = `${pattern(w.sig)}|waapi`; const g = entrance.get(key) || { sig: w.sig, name: 'element.animate', prop: w.props.join(', '), durs: [], n: 0, i: w.i, el: byI.get(w.i) || evEl.get(w.i), waapi: w }; g.durs.push(w.duration || 0); g.n++; entrance.set(key, g);
    }
    for (const g of entrance.values()) {
      const el = g.el; const p0 = el ? propsOf(el.u.find(Boolean)) : null; const p1 = el ? propsOf(el.u[timeIdx[timeIdx.length - 1]] || el.u.find(Boolean)) : null;
      const first = g.waapi ? g.waapi.first : (kf[g.name] && kf[g.name][0] ? kf[g.name][0].css : '');
      const last = g.waapi ? g.waapi.last : (kf[g.name] && kf[g.name].length ? kf[g.name][kf[g.name].length - 1].css : '');
      const isScrollReveal = items.some((x) => (x.i === g.i || (x.is && x.is.includes(g.i))) && ['reveal', 'carousel', 'marquee', 'loop', 'typewriter', 'rotating-words', 'counter'].includes(x.kind));
      if (isScrollReveal) continue;
      items.push({ kind: 'entrance', trigger: 'load', props: [{ prop: g.prop || g.name, from: first.slice(0, 70) || (p0 ? `прозрачность ${p0.op}` : ''), to: last.slice(0, 70) || (p1 ? `прозрачность ${p1.op}` : '') }],
        timing: { duration: Math.max(...g.durs), easing: g.waapi ? g.waapi.easing : (el ? easeName(g.name ? el.anim.ease : el.trans.ease) : '') }, source: g.waapi ? 'element.animate' : (g.name ? `css @keyframes ${g.name}` : `переход ${g.prop}`), i: g.i, el: el || { sig: g.sig }, count: g.n > 1 ? g.n : undefined });
    }
    /* появления: причина (класс, событие) и длительность */
    for (const it of items.filter((x) => x.kind === 'reveal')) {
      const cls = ev.cls.filter((c) => c.i === it.i && c.added.length && c.t < tClick0);
      if (cls.length) it.cause = `класс «${cls[0].added.slice(0, 2).join(' ')}» при входе в экран (IntersectionObserver)`;
      const ends = ev.ev.filter((e) => e.i === it.i && (e.type === 'trans-end' || e.type === 'anim-end'));
      const wa = ev.waapi.filter((w) => w.i === it.i && w.iterations !== 'infinite');
      if (it.prop === 'op' && it.to < it.from) it.sub = 'исчезает';
      const el = it.el;
      const dur = ends.length ? Math.max(...ends.map((e) => e.dur)) : Math.max(0, ...msOf(el.trans.dur), ...msOf(el.anim.dur));
      const delay = Math.max(0, ...msOf(el.trans.delay), ...msOf(el.anim.delay));
      it.timing = { duration: Math.round(dur) || undefined, easing: easeName(ends.length && ends[0].type === 'anim-end' ? el.anim.ease : el.trans.ease), delay: delay || undefined };
      if (!ends.length && wa.length) { it.timing.duration = wa[wa.length - 1].duration || undefined; it.timing.easing = wa[wa.length - 1].easing || it.timing.easing; it.timing.delay = wa[wa.length - 1].delay || it.timing.delay; it.source = 'element.animate'; }
      else if (!ends.length && !dur) it.timing.note = 'без CSS-перехода — рисует скрипт (длительность по кадрам не видна)';
      if (ev.styleHot.some((s) => s.i === it.i)) it.source = 'скрипт (style меняется покадрово)';
      /* появление из @keyframes (WOW.js, animate.css): анимация идёт между замерами — «из» и «в» берутся из первого и
         последнего кадра; сдвиг в % — от своего размера (fadeInUp: translate3d(0, 100%, 0) — на высоту блока) */
      const endAnim = ends.filter((e) => e.type === 'anim-end').pop();
      const an = it.kfName || (endAnim ? endAnim.name : '');
      const fr = an && kf[an];
      if (fr && fr.length) {
        const lastV = el.rows && el.rows.length ? propsOf(el.rows[el.rows.length - 1][1]) : null; const w = lastV ? lastV.w : 0, h = lastV ? lastV.h : 0;
        const a = cssProps(fr[0].css, w, h), z = fr.length > 1 ? cssProps(fr[fr.length - 1].css, w, h) : {};
        const kp = [];
        if (a.op !== undefined && Math.abs(a.op - (z.op ?? 1)) > 0.02) kp.push({ prop: NAMES.op, from: fmtV('op', a.op), to: fmtV('op', z.op ?? 1) });
        for (const k of ['tx', 'ty']) if (a[k] !== undefined && Math.abs(a[k] - (z[k] ?? 0)) > 0.5) kp.push({ prop: NAMES[k], from: fmtV(k, a[k]), to: fmtV(k, z[k] ?? 0) });
        if (a.sc !== undefined && Math.abs(a.sc - (z.sc ?? 1)) > 0.01) kp.push({ prop: NAMES.sc, from: fmtV('sc', a.sc), to: fmtV('sc', z.sc ?? 1) });
        it.props = [...kp, ...it.props.filter((p) => !kp.some((q) => q.prop === p.prop))];
        const pc = /translate(?:3d|X|Y)?\(([^)]*%[^)]*)\)/.exec(fr[0].css);
        if (pc) it.timing.note = [it.timing.note, `сдвиг — translate(${pc[1].replace(/\s+/g, ' ')}) от своего размера (${w}×${h} px)`].filter(Boolean).join('; ');
        it.source = `css @keyframes ${an}`;
      }
      if (it.prop === 'vis') {
        const wow = el.wow ? [el.wow.offset && `offset ${el.wow.offset} px`, el.wow.duration && `data-wow-duration ${el.wow.duration}`, el.wow.delay && `data-wow-delay ${el.wow.delay}`].filter(Boolean).join(', ') : '';
        it.cause = el.wow ? `WOW.js: при входе в экран visibility: visible и animation-name: ${an || '?'}${cls.length ? `, класс «${cls[0].added.slice(0, 2).join(' ')}»` : ''}${wow ? ` (${wow})` : ''}`
          : `при входе в экран visibility: hidden → visible и animation-name: ${an || '?'}${cls.length ? ` (класс «${cls[0].added.slice(0, 2).join(' ')}»)` : ''}`;
        if (!it.props.length) it.props.push({ prop: 'видимость', from: 'скрыт', to: 'виден' });
        it.timing.easing = easeName(el.anim.ease) || it.timing.easing;
      }
    }
    /* наведение */
    for (const hv of hovers) {
      const HN = { transform: 'transform', bg: 'фон', color: 'цвет', shadow: 'тень', border: 'рамка', filter: 'фильтр', deco: 'подчёркивание', opacity: 'прозрачность', outline: 'обводка', width: 'ширина' };
      const human = (k, v) => (k === 'transform' ? tfWords(v) : k === 'shadow' ? (v === 'none' ? 'нет' : String(v).slice(0, 48)) : String(v).slice(0, 50));
      const d = []; const cmp = (label, a, b, keys) => { if (!a || !b) return; for (const k of keys) if (a[k] !== b[k]) d.push({ prop: `${label}${HN[k] || k}`, from: human(k, a[k]), to: human(k, b[k]) }); };
      cmp('', hv.before.self, hv.after.self, ['transform', 'bg', 'color', 'shadow', 'border', 'filter', 'deco', 'opacity', 'outline']);
      cmp('картинка: ', hv.before.pic, hv.after.pic, ['transform', 'filter', 'opacity']);
      cmp('::after ', hv.before.after, hv.after.after, ['transform', 'width', 'opacity', 'bg']);
      cmp('::before ', hv.before.before, hv.after.before, ['transform', 'width', 'opacity', 'bg']);
      if (!d.length) continue;
      const sub = d.some((x) => /^картинка/.test(x.prop) && /transform/.test(x.prop)) ? 'картинка крупнее' : d.some((x) => /::(after|before)/.test(x.prop)) ? 'линия' : d.some((x) => x.prop === 'transform') ? 'сдвиг/масштаб' : d.some((x) => /тень/.test(x.prop)) ? 'тень' : 'цвет';
      items.push({ kind: 'hover', sub, trigger: 'hover', component: hv.kind, props: d.slice(0, 6), timing: { duration: hv.before.dur || undefined, easing: easeName(hv.before.ease) }, el: { sig: hv.sig, text: hv.text, expect: hv.expect ? { kind: hv.expect } : null }, hover: hv.h });
    }
    /* мышь */
    if (mouse) {
      const keys = new Set(Object.keys(mouse[0].s));
      for (const i of keys) {
        const tfs = mouse.map((m) => m.s[i] && m.s[i][0]); if (tfs.some((x) => x === undefined)) continue;
        const el = byI.get(Number(i)) || null; const tv = el ? timeIdx.map((s) => propsOf(el.u[s])).filter(Boolean) : [];
        const loops = el && tv.length > 2 && new Set(tv.map((v) => v && v.tx + ',' + v.ty + ',' + v.sc)).size > 2;
        if (new Set(tfs).size < 2 || loops) continue;
        const pos = mouse.map((m) => m.s[i]); const fixed = pos[0][3] === 'fixed' || pos[0][3] === 'absolute';
        const near = mouse.every((m, k) => Math.hypot(pos[k][1] - m.x, pos[k][2] - m.y) < 40);
        const ds = tfs.map(decompose);
        const mEl = el || { sig: pos[0][4] || '', text: '', expect: pos[0][5] ? { kind: pos[0][5] } : null };
        if (near && fixed) { items.push({ kind: 'cursor', trigger: 'mouse', props: [{ prop: 'следует за мышью', from: '', to: '' }], timing: {}, i: Number(i), el: mEl }); continue; }
        const rot = Math.max(...ds.map((x) => Math.abs(x.rx) + Math.abs(x.ry)));
        const mv = Math.max(...ds.map((x) => Math.hypot(x.tx - ds[0].tx, x.ty - ds[0].ty)));
        if (rot < 0.8 && mv < 2) continue;
        items.push({ kind: 'mouse', sub: rot >= 0.8 ? 'наклон' : 'параллакс', trigger: 'mouse', props: [{ prop: rot >= 0.8 ? 'наклон X/Y' : 'сдвиг', from: '0', to: rot >= 0.8 ? `до ${round(rot, 1)}°` : `до ${round(mv)} px` }], timing: {}, i: Number(i), el: mEl });
      }
    }
    /* холсты и видео */
    const media = await page.evaluate(async () => {
      const vids = [...document.querySelectorAll('video')].map((v) => ({ sig: v.tagName.toLowerCase() + (v.className ? '.' + String(v.className).split(' ')[0] : ''), t0: v.currentTime, autoplay: v.autoplay, loop: v.loop, muted: v.muted, w: Math.round(v.getBoundingClientRect().width), h: Math.round(v.getBoundingClientRect().height), el: v }));
      await new Promise((r) => setTimeout(r, 600));
      const canv = [...document.querySelectorAll('canvas')].map((c) => { const r = c.getBoundingClientRect(); return { sig: 'canvas' + (c.className ? '.' + String(c.className).split(' ')[0] : ''), ctx: c.__rwCtx || '?', w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top + scrollY), x: Math.round(r.left), expect: c.closest('[data-expect]') ? c.closest('[data-expect]').dataset.expect : '' }; }).filter((c) => c.w * c.h > 2000);
      return { videos: vids.map((v) => ({ ...v, el: undefined, playing: v.el.currentTime > v.t0 })), canvases: canv };
    });
    for (const v of media.videos.filter((x) => x.playing && x.w * x.h > 20000)) items.push({ kind: 'video', trigger: 'load', props: [{ prop: 'видео', from: '', to: `${v.w}×${v.h}${v.loop ? ', по кругу' : ''}${v.muted ? ', без звука' : ''}` }], timing: {}, el: { sig: v.sig } });
    let sharp = null; try { sharp = loadSharp(); } catch (e) { /* без sharp — «движется ли — не проверено» */ }
    for (const c of media.canvases.slice(0, 4)) {
      let animated = null;
      try {
        await scrollToY(page, Math.max(0, c.y - vh / 3)); await sleep(250);
        const box = await page.evaluate((cc) => { const el = [...document.querySelectorAll('canvas')].find((x) => Math.round(x.getBoundingClientRect().top + scrollY) === cc.y) || document.querySelector('canvas'); const r = el.getBoundingClientRect(); const x = Math.max(0, r.left), y = Math.max(0, r.top); /* область снимка — в координатах документа (puppeteer 25) */ return { x: x + scrollX, y: y + scrollY, width: Math.min(r.right, innerWidth) - x, height: Math.min(r.bottom, innerHeight) - y }; }, c);
        if (sharp && box.width > 4 && box.height > 4) {
          const a = await page.screenshot({ clip: box, captureBeyondViewport: false }); await sleep(600); const b = await page.screenshot({ clip: box, captureBeyondViewport: false });
          const [ra, rb] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer(), sharp(b).removeAlpha().raw().toBuffer()]);
          let diff = 0; for (let q = 0; q + 2 < Math.min(ra.length, rb.length); q += 3) if (Math.abs(ra[q] - rb[q]) + Math.abs(ra[q + 1] - rb[q + 1]) + Math.abs(ra[q + 2] - rb[q + 2]) > 30) diff++;
          animated = diff / (ra.length / 3) > 0.002;
        }
      } catch (e) { c.err = String(e.message || e).slice(0, 120); }
      if (animated === false) continue;
      items.push({ kind: 'canvas', trigger: 'time', props: [{ prop: `холст ${c.ctx}`, from: '', to: `${c.w}×${c.h}${animated === null ? `, движется ли — не проверено${c.err ? ' (' + c.err + ')' : ''}` : ', рисует движение'}` }], timing: {}, el: { sig: c.sig, expect: c.expect ? { kind: c.expect } : null } });
    }

    if (clicks) { for (const it of clicks.items) items.push(it); result.clicks = { found: clicks.found || null, tried: clicks.tried.map((x) => ({ type: x.type, sel: x.sel, text: x.text, skip: x.skip, changed: x.changed, item: x.item, ...(x.diff ? { diff: x.diff } : {}) })) }; result.notes.push(...clicks.notes); if (clicks.replaced) { result.clicks.replaced = true; result.notes.push('клик заменил документ — страница открыта заново: вырезки движений (mNN.png) не сняты, разбор — по замерам до кликов'); } }
    /* по очереди: появления у соседей с растущей задержкой */
    const reveals = items.filter((x) => x.kind === 'reveal');
    const groups = new Map();
    for (const r of reveals) { const key = `${r.el.parent}|${pattern(r.el.sig)}|${r.prop}`; const g = groups.get(key) || []; g.push(r); groups.set(key, g); }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const delays = g.map((r) => r.timing.delay || 0).sort((a, b) => a - b); const dd = delays.slice(1).map((d, k) => d - delays[k]).filter((x) => x > 0);
      if (dd.length) for (const r of g) r.timing.stagger = Math.round(dd.reduce((a, b) => a + b, 0) / dd.length);
    }
    /* одно появление = одно движение: у элемента несколько свойств (прозрачность + сдвиг) — склеить */
    /* у слоя параллакса поворот/масштаб тоже от прокрутки — одной строкой со сдвигом */
    for (const it of items.filter((x) => x.kind === 'scroll-linked' && x.i !== undefined)) { const par = items.find((x) => x.kind === 'parallax' && x.i === it.i); if (par) { par.props.push(...it.props); it.kind = '_merged'; } }
    const merged = [];
    for (const it of items.filter((x) => x.kind !== '_merged')) {
      const twin = merged.find((m) => m.kind === it.kind && m.kind !== 'hover' && m.i !== undefined && m.i === it.i && (it.kind === 'reveal' ? m.step === it.step : true) && m.trigger === it.trigger);
      if (twin) { twin.props.push(...it.props.filter((p) => !twin.props.some((q) => q.prop === p.prop))); if (it.scroll && twin.scroll && !twin.scroll.coefficient && it.scroll.coefficient) twin.scroll.coefficient = it.scroll.coefficient; continue; }
      merged.push({ ...it, props: [...it.props] });
    }
    /* одинаковые элементы — одной строкой ×N */
    const final = [];
    for (const it of merged) {
      const r1 = (x) => String(x).replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m) * 10) / 10)); /* 0.51 и 0.5 — одно и то же движение */
      const key = `${it.kind}|${it.sub || ''}|${pattern(it.el.sig)}|${it.props.map((p) => p.prop + ':' + r1(p.from) + '>' + r1(p.to)).join(';')}|${it.el.parent || ''}${it.kind === 'marquee' && it.timing && it.timing.speed ? `|${it.timing.speed}` : ''}`;   /* бегущие строки с разной скоростью — разные строки */
      const same = final.find((f) => f._key === key
        || (f.kind === it.kind && it.kind === 'reveal' && pattern(f.el.sig) === pattern(it.el.sig) && f.el.parent === it.el.parent)
        || (f.kind === 'reveal' && it.kind === 'reveal' && f.sub === it.sub && f.props.map((p) => p.prop + p.from + p.to).join() === it.props.map((p) => p.prop + p.from + p.to).join() && (f.timing.duration || 0) === (it.timing.duration || 0))
        || (f.kind === 'scroll-linked' && it.kind === 'scroll-linked' && f.props.map((p) => p.prop + r1(p.from) + r1(p.to)).join() === it.props.map((p) => p.prop + r1(p.from) + r1(p.to)).join())
        || (f.kind === 'hover' && it.kind === 'hover' && f.component === it.component && f.sub === it.sub && f.props.map((p) => p.prop + p.from + p.to).join() === it.props.map((p) => p.prop + p.from + p.to).join())
        || (f.kind === 'parallax' && it.kind === 'parallax' && f.el.parent && f.el.parent === it.el.parent));
      if (same) {
        if (it.members) { same.count = (same.count || 1) + (it.count || 1); same.members = [...(same.members || []), ...it.members].slice(0, 30); same.is = [...(same.is || []), ...it.is]; for (const m of it.members) if (same.examples.length < 3) same.examples.push(m); continue; }
        same.count = (same.count || 1) + 1; if (same.examples.length < 3) same.examples.push(it.el.sig); if (it.kind === 'parallax' && it.scroll) same.coefs.push(it.scroll.coefficient); continue;
      }
      /* строка группы петель — участники в examples (первые три), решение compare — и на группу (members, parent) */
      final.push({ ...it, _key: key, count: it.count || 1, examples: it.members ? it.members.slice(0, 3) : [it.el.sig], coefs: it.scroll && it.kind === 'parallax' ? [it.scroll.coefficient] : [] });
    }
    /* строки без изменения («сдвиг X 0 px → 0 px»: дрожь меньше шага округления) — не движение */
    for (const it of final) it.props = it.props.filter((p) => !(p.from !== '' && p.from === p.to));
    for (let q = final.length - 1; q >= 0; q--) if (!final[q].props.length) final.splice(q, 1);
    /* Tilda: пункты из атрибутов вместо замеров на тех же элементах; не играющее на этом экране — не движение донора */
    if (tsnap) { const mt = mergeTilda(final, tsnap, byI); final.splice(0, final.length, ...mt.items); result.tilda = mt.stat; result.notes.push(...mt.notes); if (mt.stat.addedRows || mt.stat.measuredReplaced || mt.stat.service || mt.stat.off) say(mt.info); }
    /* место каждой строки на странице — compare сверяет его у пар разных видов (лента первого экрана ↔ параллакс в
       подвале — не пара): верх элемента в документе при прокрутке 0, высота, номер экрана из скольких, first — виден
       ли в первом экране (≥ 25% своей высоты или высоты окна). У закреплённого (fixed, sticky) — fixed: место
       не сравнивается. Документ заменён кликом — по первому замеру элемента */
    {
      const refs = final.map((it) => ({ i: Number.isInteger(it.i) && it.i >= 0 ? it.i : -1, hover: typeof it.hover === 'number' ? it.hover : -1, sel: !(Number.isInteger(it.i) && it.i >= 0) && typeof it.hover !== 'number' ? it.cropSel || '' : '' }));
      /* страница — в начало: после холстов и кликов она стоит где-то внизу, а у слоя параллакса и ленты по прокрутке
         верх зависит от прокрутки */
      if (!(clicks && clicks.replaced)) { await scrollToY(page, 0).catch(() => {}); await sleep(250); }
      const got = clicks && clicks.replaced ? null : await page.evaluate((list) => {
        const sc = window.__rwScroller && window.__rwScroller.isConnected ? window.__rwScroller : null; const sy = sc ? sc.scrollTop : scrollY;
        const docH = sc ? sc.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
        return { docH, boxes: list.map((r) => {
          let el = null; try { el = r.sel ? document.querySelector(r.sel) : r.hover >= 0 ? (window.__moHover || [])[r.hover] : r.i >= 0 ? (window.__moEls || [])[r.i] : null; } catch (e) { el = null; }
          if (!el || !el.isConnected) return null;
          const b = el.getBoundingClientRect(); let fixed = false;
          for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') { fixed = true; break; } }
          return { y: Math.round(b.top + sy), h: Math.round(b.height), fixed };
        }) };
      }, refs).catch(() => null);
      const docH = got && got.docH ? got.docH : 0;
      final.forEach((it, q) => {
        let b = got && got.boxes ? got.boxes[q] : null;
        if (!b && it.el && it.el.rows && it.el.rows.length) b = { y: it.el.rows[0][1][0], h: it.el.rows[0][1][3], fixed: it.el.position === 'fixed' || it.el.position === 'sticky' };
        if (!b) return;
        const seen = Math.min(b.y + b.h, vh) - Math.max(b.y, 0);
        it.place = { y: b.y, h: b.h, screen: Math.max(1, Math.floor(Math.max(0, b.y) / vh) + 1), of: Math.max(1, Math.ceil((docH || b.y + b.h) / vh)), first: b.h > 0 ? seen >= Math.min(b.h, vh) * 0.25 : b.y >= 0 && b.y < vh, ...(b.fixed ? { fixed: true } : {}) };
      });
    }
    /* номера, рецепты, вырезки */
    let k = 0; let tildaCrops = 0;
    const cropDir = path.join(out, 'motion', tag);
    if (crops) ensureDir(cropDir);
    for (const it of final) {
      k++; it.id = `m${String(k).padStart(2, '0')}`; it.recipe = it.tilda && it.recipe ? it.recipe : it.kind === 'click' ? CLICK_RECIPE[it.sub] || 'click' : RECIPE[it.kind] || it.kind;
      it.target = it.el.sig; it.text = it.el.text || ''; it.expect = it.el.expect ? it.el.expect.kind : (it.el.expectInside && it.el.expectInside[0]) || '';
      if (crops && !(clicks && clicks.replaced) && (it.i !== undefined || it.hover !== undefined || (it.cropSel && tildaCrops++ < 24))) {
        try {
          const box = await page.evaluate((ref) => {
            const el = ref.sel ? document.querySelector(ref.sel) : ref.hover !== undefined ? window.__moHover[ref.hover] : window.__moEls[ref.i]; if (!el || !el.isConnected) return null;
            el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect();
            const x = Math.max(0, r.left - 12), y = Math.max(0, r.top - 12);
            /* область снимка — в координатах документа (puppeteer 25), внутри окна */
            return { x: x + scrollX, y: y + scrollY, width: Math.max(8, Math.min(innerWidth - x, r.width + 24)), height: Math.max(8, Math.min(innerHeight - y, r.height + 24)) };
          }, { i: it.cropI ?? it.i, hover: it.hover, sel: it.i === undefined && it.hover === undefined ? it.cropSel : undefined });
          if (box) { await sleep(250); const f = path.join(cropDir, `${it.id}.png`); await page.screenshot({ path: f, clip: box, captureBeyondViewport: false }); it.crop = path.relative(out, f).replace(/\\/g, '/'); }
        } catch (e) { /* без вырезки */ }
      }
      if (it.el.expectNot) it.expectNot = it.el.expectNot;
      delete it.el; delete it._key; delete it.kfName; delete it.is; delete it.mk; delete it.cropI; delete it.cropSel; delete it.tilda; if (!it.coefs || !it.coefs.length) delete it.coefs;
    }
    result.items = final;
    /* блоки WOW.js, которые не стали строкой (появление, вход): почему — чтобы «WOW.js есть, а появлений нет» не
       читалось как пропуск замера. С анимацией и видимый, но без строки — это и есть пропуск: переснять с --debug */
    if (wows.length) {
      const hit = (w) => final.some((it) => (w.i >= 0 && it.i === w.i) || it.target === w.sig);
      const why = (w) => (w.display === 'none' || w.w * w.h === 0 ? '0×0 на этом экране — не виден'
        : !w.cls && (!w.name || w.name === 'none') ? 'без класса анимации (animation-name: none) — WOW только показывает, движения нет'
          : `с анимацией ${w.cls || w.name}, но строки нет — не пойман замером, переснять с --debug`);
      const miss = wows.filter((w) => !hit(w)); const by = new Map();
      for (const w of miss) by.set(why(w), [...(by.get(why(w)) || []), w.sig]);
      if (miss.length) result.notes.push(`WOW.js: блоков .wow ${wows.length}, строкой не стали ${miss.length}: ${[...by].map(([k, s]) => `${s.length} — ${k} (${[...new Set(s)].slice(0, 2).map((x) => `\`${x}\``).join(', ')})`).join('; ')}`);
    }
    result.stats = { steps: { time: timeIdx.length, scroll: scrollIdx.length, up: upSteps.length, timeMs: timeObs, timeBaseMs: timeMs, peeks }, slowUnresolved: perEl.filter((x) => unresolved(x.cls)).length || undefined, observed: n, inDom: all, changed: data.series.length, events: ev.ev.length, waapi: ev.waapi.length, classChanges: ev.cls.length, capped: ev.capped, seconds: round((Date.now() - t0) / 1000, 1) };
    if (!result.libs.reducedRule) result.notes.push('правила prefers-reduced-motion в CSS нет — у нас обязательно (reference/motion.md)');
    if (ev.capped) result.notes.push('событий больше 8000 — часть не записана');
    await page.close();
  } finally { if (!shared) await browser.close(); }
  /* WARN lib по ходу снятия (свой стиль не вставился) — туда же; вердикт инвентаря — WARN, если есть WARN lib */
  if (!result.windows) result.windows = { dismiss: null, modal: null, wrongPage: null, notes: [], warnings: [] };
  const late = takeWarnings(); takeNotes();
  for (const x of late) { result.windows.warnings.push(x); say(`WARN ${x}`); }
  result.verdict = result.windows.warnings.length ? 'WARN' : 'OK';
  return result;
}

/* ---------- отчёт ---------- */
function mdTable(res) {
  const L = [`# Движение: ${res.url} (${res.viewport} ${res.size})`, '',
    `Снято ${res.takenAt.slice(0, 16).replace('T', ' ')} · motion.mjs · за ${res.stats ? res.stats.seconds : '?'} с${res.stats && res.stats.steps.timeMs > res.stats.steps.timeBaseMs + 500 ? ` · окно «время» ${round(res.stats.steps.timeMs / 1000, 1)} с (продлено ради медленного движения)` : ''} · окно cookie: ${res.consent || '—'} · библиотеки: ${res.libs.libs && res.libs.libs.length ? res.libs.libs.join(', ') : 'не видно'} · «меньше движения»: ${res.libs.reducedRule ? 'правило есть' : 'НЕТ'}${res.libs.smoothCss ? ' · html{scroll-behavior:smooth}' : ''}`, '',
    ...(res.tilda ? [`Tilda-донор: пункты «атрибуты Tilda» — из атрибутов (tilda.mjs), точнее замера; на этом экране (${res.tilda.vw}px) появления: ${res.tilda.appearNow}; не играет у донора и не перенесено: ${res.tilda.off}. Переносить то, что играет у донора на этом экране; выключенное Tilda на телефоне у нас на телефоне не делать.`, ''] : []),
    '| № | вид | где | запуск | что меняется | параметры | как повторить |', '|---|---|---|---|---|---|---|'];
  for (const it of res.items) {
    /* одинаковый эффект у разных элементов — назвать и остальные (до двух) */
    const tl = it.source === 'атрибуты Tilda'; /* у пунктов Tilda селектор — по ключу (#recN [data-elem-id]), шаблон подписи его портит */
    const others = [...new Set((it.examples || []).map(tl ? String : pattern))].filter((x) => x !== (tl ? it.target : pattern(it.target))).slice(0, 2);
    const where = `\`${it.target}\`${it.count > 1 ? ` ×${it.count}` : ''}${others.length ? ` (и ${others.map((x) => `\`${x}\``).join(', ')})` : ''}${it.members && it.count > 1 && it.parent ? ` · соседи в \`${it.parent}\`` : ''}${it.text ? ` «${it.text.slice(0, 28)}»` : ''}${it.crop ? ` [вырезка](${it.crop})` : ''}`;
    /* у пункта Tilda — шаги словами (SBS в 3–7 шагов: «старт … → за 400 мс прозрачность 0 → …»), у замера — свойства */
    const what = it.words || it.props.map((p) => `${p.prop}${p.from || p.to ? `: ${p.from} → ${p.to}` : ''}`).join('; ');
    const par = describeTiming(it) + (it.coefs && it.coefs.length > 1 ? `; слои: ${it.coefs.join(', ')}` : '') + (it.source ? ` · ${it.source}` : '') + (it.check ? ` · ${it.check}` : '');
    L.push(`| ${it.id} | ${KIND_RU[it.kind] || it.kind}${it.sub ? ` (${it.sub})` : ''}${it.component ? `, ${it.component}` : ''} | ${where} | ${describeTrigger(it)} | ${what.replace(/\|/g, '/')} | ${par.replace(/\|/g, '/')} | \`${it.recipe}\` |`);
  }
  if (!res.items.length) L.push('| — | движения не найдено | | | | | |');
  L.push('', 'Рецепты — `reference/motion.md`. Решение по каждой строке донора — в analysis.md («Движение донора → блоки»);', 'сверка с нашим сайтом — `motion.mjs compare`.');
  if (res.notes.length) L.push('', ...res.notes.map((n) => `- ${n}`));
  return L.join('\n') + '\n';
}

/* ---------- сверка ---------- */
/* семейство для сверки: вид + то, что делает его другим движением */
const FAMILY = (it) => {
  if (it.kind === 'rotating-words' || it.kind === 'typewriter') return 'typewriter';
  if (it.kind === 'loop') return `loop:${it.sub || ''}`;
  if (it.kind === 'reveal') return it.sub === 'исчезает' ? 'reveal:out' : it.sub === 'при прокрутке вверх' ? 'reveal:up' : 'reveal:in';
  if (it.kind === 'hover') return `hover:${it.component || ''}`;
  if (it.kind === 'counter') return 'counter';
  if (it.kind === 'click') return `click:${it.sub || ''}`;
  return it.kind;
};
function nums(it) { const out = {}; for (const p of it.props || []) { const a = parseFloat(String(p.from).replace(',', '.')), b = parseFloat(String(p.to).replace(',', '.')); out[p.prop] = [a, b]; } return out; }
const kindRu = (it) => `${KIND_RU[it.kind] || it.kind}${it.sub ? ` (${it.sub})` : ''}`;

/* === Пары между разными видами движения (02.10: «Зелёный уголок» ↔ generationx5.tech, 10 решений руками) ===
   Один приём записывается разными видами — от того, как сделан и как попал в замер:
   · от прокрутки — «привязано к прокрутке» (у Tilda — из атрибутов SBS), «параллакс» (сдвиг на долю прокрутки по
     замеру) и «появление» (отрезок уложился в один-два шага прохода): лента первого экрана с числами донора
     записана у нас параллаксом на широком экране и появлением на телефоне;
   · по времени — «бегущая строка» и «петля» со сдвигом по кругу (так бегущую строку пишет Tilda: SBS loop);
   · наведение — кнопка Zero Block a.tn-atom записана «ссылкой» (полей у неё нет), у нас a.btn — «кнопка».
   Каждая такая пара — возможность «найти» движение, которого у нас нет, в постороннем. Поэтому пара — только при
   настоящем сходстве: тот же запуск (прокрутка ↔ прокрутка, время ↔ время, наведение ↔ наведение), у нас есть все
   свойства донора и нет своего проявления (прозрачность, шторка, размытие), место на странице то же (первый экран ↔
   первый экран), числа рядом. Статус такой пары — «ЕСТЬ, ДРУГИМ ВИДОМ» с числами обоих, а не OK; числа разошлись —
   «ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ». Одно наше движение закрывает одно движение донора (assignPairs). */
const CROSS = {
  end: 0.25,      /* конечное значение свойства: ±25%, как у пары одного вида */
  span: 0.6,      /* размах «из → в»: от 60% до 167% донорского — замер застаёт движение не с первого пикселя (у ленты
                     первого экрана «из» 11.7 px, а не 0), поэтому «из» само не сверяется */
  range: 2,       /* отрезок прокрутки: расходится больше чем вдвое — разница (замер кратен шагу прохода, четверть экрана) */
  speed: 1.25,    /* скорость бегущей строки: ±25% */
  lum: 0.25,      /* наведение: яркость цвета (0…1) у конца, когда другой конец прозрачный, — не дальше 0.25; ход яркости
                     между двумя цветами — ±25% хода (roleHover); сами цвета не сверяются — палитра у нас своя */
  line: 200,      /* петля «по кругу» — путь за период не меньше 200 px (как у CSS-строки в classifyLoop) */
  near: 1,        /* место: верх элемента у донора и у нас не дальше одного экрана друг от друга — считая от начала страницы
                     или (ниже первого экрана) от её конца: подвал ↔ подвал у страниц разной длины */
  part: 0.15,     /* … или та же доля высоты страницы, ±15% (ниже первого экрана): середина ↔ середина; у страницы в 12
                     экранов это ±1.8 экрана — разделы донора и наши по высоте не совпадают */
  wild: 3,        /* бегущая строка без сверенного места: скорость врозь больше чем втрое — уже не «та же строка с разницей» */
  proof: 2,       /* место не сверено — пара держится на одних числах: совпасть должны хотя бы два свойства, не считая
                     проявления (прозрачность 0 → 1 одинакова у чего угодно) */
};
const sizeOf = (proto) => { const m = /(\d+)\s*[×x]\s*(\d+)/.exec((proto && proto.size) || ''); return m ? { w: Number(m[1]), h: Number(m[2]) } : null; };
/* Закреплённый на экране элемент (fixed, sticky): кнопка «наверх», шапка, плавающая кнопка. Места на странице у него
   нет, и его проявление при прокрутке — не проявление раздела: в протоколах до 02.10 — scroll.fixed, с 02.10 — place.fixed */
const fixedEl = (it) => !!((it.place && it.place.fixed) || (it.scroll && it.scroll.fixed));
/* Место движения на странице. place пишет инвентарь с 02.10 (верх элемента в документе, высота, номер экрана из
   скольких); vh — высота окна протокола. → { first — виден в первом экране, top — верх в экранах от начала страницы,
   part — он же долей высоты страницы, tail — экранов до конца страницы, text }. В протоколах старше места нет: у
   появления известно только visAtStart («виден с начала»), у остального — ничего (null). У закреплённого — null. */
const placeNums = (p, vh) => { const top = Number.isFinite(p.y) && vh > 0 ? p.y / vh : p.screen - 0.5; const of = Math.max(1, p.of || p.screen); return { top, part: top / of, tail: of - top }; };
function placeOf(it, vh) {
  const p = it.place;
  if (p && !p.fixed && Number.isFinite(p.screen)) return { first: !!p.first, ...placeNums(p, vh), text: p.first ? 'первый экран' : p.screen === 1 ? `низ первого экрана (верх на ${p.y} px, видно меньше четверти)` : `экран ${p.screen} из ${p.of}` };
  if (!p && it.kind === 'reveal' && typeof it.visAtStart === 'boolean' && !(it.scroll && it.scroll.fixed)) return { first: it.visAtStart, top: null, text: it.visAtStart ? 'первый экран (виден с начала)' : 'ниже первого экрана' };
  return null;
}
/* То же ли место у движения донора и нашего. Страницы разной длины (донор — 11 экранов, наша — 13), поэтому мерок три:
   расстояние от начала страницы, доля её высоты и расстояние от конца — место то же, если сошлась любая. Первый экран —
   только по расстоянию от начала: с ним «та же доля страницы» — это второй-третий экран длинной страницы. Допуск в
   экран закрывает и границу первого экрана: блок с верхом на 760 px у донора и на 740 px у нас (окно 900) — одно место,
   хотя «виден в первом экране на четверть» у них разное (ловушка t3d); лента 2-го экрана и листик в подвале — разное
   (t3a). → null — сверить нечем (места нет у одного из двух); { far } — сверено: то же (false) или другое (true) */
function placeGap(a, b) {
  if (!a || !b) return null;
  if (Number.isFinite(a.top) && Number.isFinite(b.top)) {
    if (Math.abs(a.top - b.top) <= CROSS.near) return { far: false };
    if (a.first || b.first) return { far: true };
    return { far: !(Math.abs(a.part - b.part) <= CROSS.part || Math.abs(a.tail - b.tail) <= CROSS.near) };
  }
  /* у одного — только «виден с начала» (появление в протоколе до 02.10) */
  if (a.first && b.first) return { far: false };
  if (a.first !== b.first) { const k = Number.isFinite(a.top) ? a : Number.isFinite(b.top) ? b : null; return { far: !(k && !k.first && k.top < CROSS.near) }; }
  return null;                                                         /* оба ниже первого экрана, а где именно — неизвестно */
}
/* один ли это элемент: строки одного i с той же подписью и тем же местом. Один номер i у разных элементов бывает у
   протокола, собранного из двух проходов; подпись сверяется по шаблону (класс состояния .is-in появляется по ходу) */
const sameSpot = (a, b) => pattern(a.target) === pattern(b.target) && (!a.place || !b.place || (Math.abs(a.place.y - b.place.y) <= 8 && Math.abs(a.place.h - b.place.h) <= 8));
/* Движение от прокрутки для сверки между видами: строки одного элемента (тот же i, по одной штуке) — одно движение.
   Лента первого экрана у нас записана двумя строками одного div.hero__ribbon: параллакс (сдвиг, масштаб) и
   «появление» (поворот); у донора это одна строка scroll-linked с четырьмя свойствами. «Лента вбок» и «при
   прокрутке вверх» — свои приёмы, в пары другого вида не идут. Закреплённый на экране элемент — тоже: кнопка «наверх»
   (прозрачность 0 → 1 при прокрутке, места на странице нет) закрывала проявление заголовка раздела у донора — числа у
   «0 → 1» совпадают всегда (ловушки t6b–t6d; такая кнопка есть в протоколах двух наших сайтов из трёх). */
const FADE = new Set([NAMES.op, NAMES.blur, NAMES.clip, 'видимость']);
const scrollKind = (it) => (it.kind === 'scroll-linked' || it.kind === 'parallax' || (it.kind === 'reveal' && it.sub !== 'при прокрутке вверх')) && it.sub !== 'лента вбок';
function scrollUnits(items, vh) {
  const units = []; const byI = new Map();
  for (const it of items) {
    if (!scrollKind(it) || fixedEl(it)) continue;
    const one = Number.isInteger(it.i) && it.i >= 0 && (it.count || 1) === 1;
    let u = one ? byI.get(it.i) : null;
    if (u && !sameSpot(u.parts[0], it)) u = null;                  /* тот же i, а подпись или место другие — другой элемент (t5a) */
    if (!u) { u = { parts: [], props: new Map() }; units.push(u); if (one && !byI.has(it.i)) byI.set(it.i, u); }
    u.parts.push(it);
    for (const p of it.props || []) if (!u.props.has(p.prop)) u.props.set(p.prop, { from: p.from, to: p.to, a: parseFloat(String(p.from).replace(',', '.')), b: parseFloat(String(p.to).replace(',', '.')) });
  }
  for (const u of units) {
    u.ids = u.parts.map((x) => x.id);
    u.range = (u.parts.map((x) => x.scroll && x.scroll.rangePx).find((r) => Number.isFinite(r) && r > 0)) || null;
    u.place = u.parts.map((x) => placeOf(x, vh)).find(Boolean) || null;
    u.many = u.parts.some((x) => (x.count || 1) > 1);              /* строка ×N: место записано у первого из N */
    u.kinds = [...new Set(u.parts.map(kindRu))];
  }
  return units;
}
/* числа одного свойства у пары разных видов (донор a → b, у нас c → e): '' — рядом, 'side' — в другую сторону, 'num' — другие */
function crossNum(a, b, c, e) {
  const sd = b - a, so = e - c;
  if (Math.abs(sd) < 1e-9 && Math.abs(so) < 1e-9) return '';
  if (Math.sign(sd) !== Math.sign(so)) return 'side';
  const endOk = Math.abs(e - b) <= Math.max(Math.abs(b) * CROSS.end, Math.abs(sd) * 0.1, 0.05);
  const r = Math.abs(so) / Math.abs(sd);
  return endOk && r >= CROSS.span && r <= 1 / CROSS.span ? '' : 'num';
}
/* Пара «от прокрутки» между видами: du — движение донора, u — наше (scrollUnits). → null — не похоже;
   { no } — похоже, но парой не засчитано (почему — в строку «НЕТ» подсказкой); { exact, diffs, notes } — пара. */
function crossScroll(du, u, ctx) {
  const names = [...du.props.keys()];
  if (!names.length || !names.every((k) => Number.isFinite(du.props.get(k).a) && Number.isFinite(du.props.get(k).b))) return null;   /* «кадры …», «видимость» — сверять нечем */
  if (!names.every((k) => u.props.has(k) && Number.isFinite(u.props.get(k).a) && Number.isFinite(u.props.get(k).b))) return null;     /* у нас нет свойства донора */
  const extra = [...u.props.keys()].filter((k) => !du.props.has(k));
  if (extra.some((k) => FADE.has(k))) return null;                 /* у нас блок проявляется, у донора — нет: это появление, а не лента */
  const diffs = [], near = []; let same = 0, far = 0;
  for (const k of names) {
    const a = du.props.get(k), b = u.props.get(k); const bad = crossNum(a.a, a.b, b.a, b.b);
    if (bad === 'side' && FADE.has(k)) return null;                 /* появляется ↔ исчезает — разные движения */
    if (bad) { diffs.push(`${k}${bad === 'side' ? ' — в другую сторону' : ''}: у донора ${a.from} → ${a.to}, у нас ${b.from} → ${b.to}`); const r = Math.abs(b.b - b.a) / Math.max(1e-9, Math.abs(a.b - a.a)); if (bad === 'side' || r > 5 || r < 0.2) far++; }
    else { same++; near.push(`${k} ${a.from} → ${a.to} / у нас ${b.from} → ${b.to}`); }
  }
  if (du.range && u.range) { if (Math.max(du.range, u.range) / Math.min(du.range, u.range) > CROSS.range) diffs.push(`отрезок прокрутки: у донора ${du.range} px, у нас ${u.range} px`); else near.push(`отрезок ${du.range} px / у нас ${u.range} px`); }
  else if (du.range && ctx.vhO && du.range > ctx.vhO) diffs.push(`отрезок прокрутки: у донора ${du.range} px, у нас движение уложилось в один-два шага прохода (не больше ${Math.round(ctx.vhO / 2)} px)`);
  else if (u.range && ctx.vhD && u.range > ctx.vhD) diffs.push(`отрезок прокрутки: у донора движение уложилось в один-два шага прохода (не больше ${Math.round(ctx.vhD / 2)} px), у нас ${u.range} px`);
  const who = `${u.ids.join('+')} ${u.kinds.map((k) => `«${k}»`).join(' + ')}`;
  /* подсказка к «НЕТ» — кроме совсем другого (weak): ни одного числа рядом, все — в другую сторону или впятеро врозь */
  const many = (x) => (x.many ? ' (первый из нескольких ×N)' : '');
  const gap = placeGap(du.place, u.place);
  if (gap && gap.far) return { no: `${who} — место другое: у донора ${du.place.text}${many(du)}, у нас ${u.place.text}${many(u)}`, bad: diffs.length, weak: !same && far === names.length };
  const placed = !!gap;
  /* числа другие И у нас меняется ещё что-то — это уже не «тот же приём с другими числами»: вращение фигур на 259°
     «отличалось» бы от любого параллакса с лёгким поворотом (сдвиг Y −80 px, поворот 16°) */
  if (diffs.length && extra.length) return { no: `${who} — свойства донора у нас есть, но числа другие (${diffs.join('; ')}) и меняется ещё ${extra.join(', ')}: другое движение или сильно переделанное — записать решение`, bad: diffs.length, weak: !same && far === names.length };
  /* место не сверено (протокол без place): парой — только точное повторение, иначе любой параллакс страницы «похож» */
  if (!placed && (diffs.length || extra.length)) return { no: `${who} — те же свойства, но ${diffs.length ? `числа другие (${diffs.join('; ')})` : `у нас ещё ${extra.join(', ')}`}, а место на странице не сверено: ${noPlaceWhy(du.place, u.place)} — переснять или записать решение`, bad: diffs.length, weak: !same && far === names.length };
  /* место не сверено, числа рядом: пара держится на одних числах, и они должны быть приметой именно этого движения.
     Одна прозрачность 0 → 1 (или одно любое свойство) совпадает у чего угодно: проявление заголовка донора «нашлось» бы
     в любом нашем блоке, который проявляется. Лента первого экрана — четыре свойства сразу — примета */
  const proof = names.filter((k) => !plainFade(k, du.props.get(k)));
  if (!placed && proof.length < CROSS.proof) return { no: `${who} — совпало только ${names.map((k) => `«${k} ${du.props.get(k).from} → ${du.props.get(k).to}»`).join(', ')}, а место на странице не сверено (${noPlaceWhy(du.place, u.place)}): ${proof.length ? 'одно свойство' : 'проявление «из ничего»'} совпадает у чего угодно — переснять или записать решение`, bad: 0, weak: false };
  /* лишнее у нас (поворот, разворот, сдвиг по другой оси) — приём тот же, движение другое: картинка донора растёт до
     1.5, наш листик растёт до 1.45, но ещё и улетает на 600 px с разворотом на 180° (t6a) — «отличается», а не «есть» */
  if (extra.length) diffs.push(`у нас меняется ещё ${extra.map((k) => `${k} ${u.props.get(k).from} → ${u.props.get(k).to}`).join('; ')} — у донора этого нет`);
  const notes = [`тот же приём другим видом: у донора ${du.kinds.map((k) => `«${k}»`).join(' + ')}, у нас ${u.kinds.map((k) => `«${k}»`).join(' + ')}${u.parts.length > 1 ? ' (строки одного элемента)' : ''}`];
  if (near.length) notes.push(`${diffs.length ? 'рядом только' : 'числа рядом'}: ${near.join('; ')}`);
  notes.push(placed ? `место: у донора ${du.place.text}${many(du)}, у нас ${u.place.text}${many(u)}` : `место на странице не сверено — ${noPlaceWhy(du.place, u.place)}`);
  return { exact: !diffs.length, diffs, notes, placed };
}
/* проявление «из ничего в полное» (прозрачность 0 → 1, шторка 0 → 100%, размытие до нуля, видимость) — одно и то же у
   любого блока, приметой движения не служит; частичное (плашка донора тускнеет 0.9 → 0.51 и уменьшается — пара у
   figurki) — служит */
function plainFade(k, v) {
  if (!FADE.has(k)) return false;
  if (!Number.isFinite(v.a) || !Number.isFinite(v.b)) return true;
  const lo = Math.min(v.a, v.b), hi = Math.max(v.a, v.b);
  return lo <= 0.05 && (k === NAMES.blur || hi >= 0.95);
}
/* почему место не сверено — словами для строки сверки */
function noPlaceWhy(pd, po) {
  if (pd && po) return `у появления в протоколе ${!Number.isFinite(pd.top) && !Number.isFinite(po.top) ? 'донора и нашего сайта' : !Number.isFinite(pd.top) ? 'донора' : 'нашего сайта'} (снят до 02.10) известно только «ниже первого экрана»`;
  return `в протоколе ${!pd && !po ? 'донора и нашего сайта' : !pd ? 'донора' : 'нашего сайта'} нет места элемента (снят до 02.10 или элемент закреплён на экране)`;
}
/* Бегущая строка: скорость и сторона. У «бегущей строки» — из timing.speed («113 px/с влево»); у «петли» — только
   если она по кругу: один сдвиг по оси в одну сторону и прыжок в начало (direction normal, два кадра), путь за период
   ≥ 200 px — так Tilda пишет бегущую строку (SBS loop, translate −2254.8 px за 20 с; tilda.mjs до 02.10 называл её
   «петля (парение)»). Парение значка (ходит туда-обратно), пульс, вращение и петли на JS (по разворотам) — не строка. */
function runLine(it) {
  const t = it.timing || {};
  if (it.kind === 'marquee') { const m = /([\d.]+)\s*px\/с\s+(влево|вправо|вверх|вниз)/.exec(t.speed || ''); return m ? { v: Number(m[1]), dir: m[2] } : { v: null, dir: '' }; }
  if (it.kind !== 'loop' || it.source === 'js') return null;
  const P = it.props || [];
  if (P.length !== 1 || !/^сдвиг [XY]$/.test(P[0].prop) || (t.direction && t.direction !== 'normal') || (it.keyframes && it.keyframes.length !== 2)) return null;
  const a = parseFloat(P[0].from), b = parseFloat(P[0].to); const T = t.period || t.duration;
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < CROSS.line || !(T > 0)) return null;
  return { v: round(Math.abs(b - a) / (T / 1000)), dir: /X$/.test(P[0].prop) ? (b < a ? 'влево' : 'вправо') : (b < a ? 'вверх' : 'вниз') };
}
/* разница двух бегущих строк: сторона и скорость (и у пары одного вида — master скорость не сверял вовсе) */
function lineDiffs(a, b) {
  const diffs = [];
  if (a.dir && b.dir && a.dir !== b.dir) diffs.push(`строка едет в другую сторону: у донора ${a.dir}, у нас ${b.dir}`);
  if (a.v && b.v && Math.max(a.v, b.v) / Math.min(a.v, b.v) > CROSS.speed) diffs.push(`скорость: у донора ${a.v} px/с, у нас ${b.v} px/с`);
  return diffs;
}
const lineAxis = (dir) => (dir === 'вверх' || dir === 'вниз' ? 'Y' : dir ? 'X' : '');
/* Место и «дикая» разница у двух строк (и между видами, и у пары одного вида). → { no } — парой не засчитано (почему);
   { placed } — место сверено и то же (true) или сверить нечем (false).
   · лента вбок и лента вверх — разные приёмы (бегущая строка разделов и столбец отзывов), не пара вовсе (null);
   · место известно у обоих и другое — не пара: строка под первым экраном донора и карусель логотипов в подвале;
   · место не сверено, а строка едет в другую сторону или скорость врозь больше чем втрое — не пара: «та же строка с
     разницей» без места — любая карусель страницы (t4a: 113 px/с влево ↔ 30 px/с вправо давало WARN с кодом 0). */
function linePlace(d, o, a, b, ctx) {
  if (lineAxis(a.dir) && lineAxis(b.dir) && lineAxis(a.dir) !== lineAxis(b.dir)) return null;
  const pd = placeOf(d, ctx.vhD), po = placeOf(o, ctx.vhO); const gap = placeGap(pd, po);
  if (gap && gap.far) return { no: `${o.id} «${kindRu(o)}» \`${o.target}\` — место другое: у донора ${pd.text}, у нас ${po.text}`, bad: 0 };
  const wild = (a.dir && b.dir && a.dir !== b.dir) || (a.v && b.v && Math.max(a.v, b.v) / Math.min(a.v, b.v) > CROSS.wild);
  if (!gap && wild) return { no: `${o.id} «${kindRu(o)}» \`${o.target}\` — строка есть, но ${lineDiffs(a, b).join('; ')}, а место на странице не сверено (${noPlaceWhy(pd, po)}): без места так «отличается» любая карусель страницы — переснять или записать решение`, bad: 2 };
  return { placed: !!gap, pd, po };
}
function crossLine(d, o, ctx) {
  if (d.kind === o.kind) return null;
  const a = runLine(d), b = runLine(o); if (!a || !b || !a.v || !b.v) return null;
  const at = linePlace(d, o, a, b, ctx); if (!at || at.no) return at;
  const diffs = lineDiffs(a, b);
  const ring = (x) => `«${kindRu(x)}»${x.kind === 'loop' ? ' со сдвигом по кругу' : ''}`;
  const notes = [`тот же приём другим видом: у донора ${ring(d)}, у нас ${ring(o)}`, ...(diffs.length ? [] : [`числа рядом: скорость ${a.v} px/с ${a.dir} / у нас ${b.v} px/с ${b.dir}`]),
    at.placed ? `место: у донора ${at.pd.text}, у нас ${at.po.text}` : `место на странице не сверено — ${noPlaceWhy(at.pd, at.po)}`];
  return { exact: !diffs.length, diffs, notes, placed: at.placed };
}
const COMP_RU = { logo: 'логотип', card: 'карточка', nav: 'пункт меню', button: 'кнопка', link: 'ссылка' };
/* Наведение с тем же переходом: каждое свойство донора у нас с теми же «от → до», длительность та же (±25%, у обоих
   или ни у кого). Подпись и вид элемента не важны: у донора — «логотип» a.sidebar-logo, у нас — «ссылка» a.rail__item,
   фон rgba(0, 0, 0, 0) → rgba(0, 0, 0, 0.3) за 300 мс у обоих. → «что за переход» или '' */
const normV = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
function sameHover(d, o) {
  if (!(d.props || []).length) return '';
  for (const p of d.props) { const q = (o.props || []).find((x) => x.prop === p.prop); if (!q || normV(q.from) !== normV(p.from) || normV(q.to) !== normV(p.to)) return ''; }
  const a = (d.timing || {}).duration, b = (o.timing || {}).duration;
  if (!!a !== !!b || (a && b && Math.max(a, b) / Math.min(a, b) > 1.25)) return '';
  return `${d.props.map((p) => `${p.prop} ${p.from} → ${p.to}`).join('; ')}${a ? `, ${a} мс${b !== a ? ` / у нас ${b} мс` : ''}` : ''}`;
}
/* Роль элемента наведения — по смыслу, а не по тегу: кнопка Zero Block a.tn-atom записана «ссылкой» (полей у неё нет,
   размеры заданы), у нас a.btn — «кнопка». Кнопка — только то, что кнопкой и является: вид «кнопка» или ссылка с
   залитым до наведения фоном. Любая плашка с фоном кнопкой не становится: пункт меню остаётся пунктом меню, метка без
   вида — ничем (раньше кнопку донора закрывали пункт меню с фоном и плашка-метка — ловушки t2b, t2c). */
const clearColor = (c) => /rgba\([^)]*,\s*0\)|transparent|прозрачн/i.test(String(c));
const rgbOf = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(String(c)); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const lumOf = (c) => { const v = rgbOf(c); return v ? (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255 : null; };
function hoverRole(it) {
  if (it.component === 'card' || it.component === 'logo') return it.component;        /* карточка и логотип — свои роли при любом фоне */
  const bg = (it.props || []).find((p) => p.prop === 'фон');
  const filled = !!(bg && rgbOf(bg.from) && !clearColor(bg.from));
  /* из остальных видов (кнопка, ссылка, пункт меню, без вида) залитая ссылка — кнопка; пункт меню и элемент без вида — нет */
  return filled && it.component && it.component !== 'nav' ? 'button' : it.component || '';
}
/* Наведение на элементе другого вида с той же ролью (кнопка ↔ кнопка): у нас есть каждое свойство донора, цвет идёт
   тем же ходом — яркость меняется в ту же сторону и на столько же (±0.25), прозрачный остаётся прозрачным, — прочее
   («нет → масштаб 1.04») совпадает буквально, длительность ±25%. Сами цвета не сверяются: палитра у нас своя
   (у донора салатовая #D7FF1E → тёмная #1E5B28, у нас #D3F34A → #1F5530). Что-то не сошлось — не пара вовсе:
   «наведение есть у другого элемента» парой не считается. Место — то же, когда известно у обоих: кнопка первого экрана
   донора и плашка фильтра каталога в третьем экране — не пара (t2a; у плашки вид тоже «кнопка»). Закреплённый элемент
   (кнопка в шапке) — пара только закреплённому. → { far — насколько цвета далеки (0…1), note, placed } или null;
   { no } — роль и переход те же, а место другое (подсказкой в строку «НЕТ») */
function roleHover(d, o, ctx = {}) {
  const role = hoverRole(d);
  if (!role || role !== hoverRole(o) || d.sub !== o.sub || !(d.props || []).length) return null;
  if (fixedEl(d) !== fixedEl(o)) return null;
  let far = 0, n = 0; const said = [];
  for (const p of d.props) {
    const q = (o.props || []).find((x) => x.prop === p.prop); if (!q) return null;
    const c = [p.from, p.to, q.from, q.to];
    if (c.every(rgbOf)) {
      if (clearColor(p.from) !== clearColor(q.from) || clearColor(p.to) !== clearColor(q.to)) return null;
      const l = c.map((x) => (clearColor(x) ? null : lumOf(x)));
      /* ход яркости — ±25% от хода (не меньше 0.02): кнопка, что темнеет на 0.06, и та, что на 0.03, — разные переходы
         (фикстура: #D30052 → #96003C у донора и → #B30046 у нас — не пара) */
      if (l[0] !== null && l[1] !== null) { const hd = l[1] - l[0], ho = l[3] - l[2]; if (Math.abs(hd - ho) > Math.max(0.02, 0.25 * Math.max(Math.abs(hd), Math.abs(ho)))) return null; }
      else for (const k of [0, 1]) if (l[k] !== null && Math.abs(l[k] - l[k + 2]) > CROSS.lum) return null;
      for (const k of [0, 1]) if (l[k] !== null) { far += Math.hypot(...rgbOf(c[k]).map((v, j) => v - rgbOf(c[k + 2])[j])) / 441.7; n++; }
      said.push(`${p.prop} ${rgbHex(p.from)} → ${rgbHex(p.to)} / у нас ${rgbHex(q.from)} → ${rgbHex(q.to)}`);
    } else if (normV(p.from) !== normV(q.from) || normV(p.to) !== normV(q.to)) return null;
    else said.push(`${p.prop} ${p.from} → ${p.to}`);
  }
  const a = (d.timing || {}).duration, b = (o.timing || {}).duration;
  if (!!a !== !!b || (a && b && Math.max(a, b) / Math.min(a, b) > 1.25)) return null;
  const pd = placeOf(d, ctx.vhD), po = placeOf(o, ctx.vhO); const gap = placeGap(pd, po);
  if (gap && gap.far) return { no: `${o.id} «${COMP_RU[o.component] || o.component || '?'}» \`${o.target}\` — наведение то же по роли и ходу цвета, но место другое: у донора ${pd.text}, у нас ${po.text}` };
  const pinned = fixedEl(d) && fixedEl(o);                          /* оба закреплены на экране — место сравнивать не с чем, и не нужно */
  return { far: n ? far / n : 0, note: `${said.join('; ')}${a ? `, ${a} мс${b !== a ? ` / у нас ${b} мс` : ''}` : ''}`, placed: !!gap || pinned,
    place: gap ? `место: у донора ${pd.text}, у нас ${po.text}` : pinned ? 'оба закреплены на экране' : `место на странице не сверено — ${noPlaceWhy(pd, po)}` };
}
/* виды, у которых движение стоит в одном месте страницы и место — часть движения: лента раздела, бегущая строка,
   парящий значок. Появление и наведение заданы классом на все такие элементы страницы, вход при загрузке и мышь — на
   всю страницу: у них место пары одного вида не сверяется */
const SPOT_KINDS = new Set(['scroll-linked', 'parallax', 'marquee', 'loop']);
function similar(d, o, ctx = {}) {
  const fd = FAMILY(d), fo = FAMILY(o);
  const cross = fd !== fo;
  /* наведение на элемент другого вида — пара, только если переход тот же целиком; такая пара сильнее той же по виду, но с разницей */
  if (cross && d.kind === 'hover' && o.kind === 'hover') {
    const same = sameHover(d, o);
    if (same) return { score: 0.9, diffs: [], notes: [`у донора наведение на «${COMP_RU[d.component] || d.component || '?'}», у нас — на «${COMP_RU[o.component] || o.component || '?'}»: переход тот же (${same})`] };
    /* тот же переход своими цветами на элементе той же роли; из нескольких наших кнопок — ближайшая по цвету. Это пара
       другим видом («ЕСТЬ, ДРУГИМ ВИДОМ», cross), а не полное совпадение: цвета свои, элемент записан иначе */
    const rh = roleHover(d, o, ctx);
    if (rh && rh.no) return { score: 0, no: rh.no };
    return rh ? { score: 0.85 - 0.05 * Math.min(1, rh.far), diffs: [], own: true, placed: rh.placed, notes: [`тот же приём другим видом: у донора наведение записано на «${COMP_RU[d.component] || d.component || '?'}», у нас — на «${COMP_RU[o.component] || o.component || '?'}»: по роли это ${COMP_RU[hoverRole(d)] || hoverRole(d)} у обоих, свойства и ход яркости те же, цвета свои (${rh.note})`, rh.place] } : { score: 0 };
  }
  /* разные виды — не здесь: пары «от прокрутки» и «бегущая строка ↔ петля по кругу» собирает compare (crossScroll, crossLine) */
  if (cross) return { score: 0 };
  const diffs = [], notes = []; let score = 1;
  /* закреплённый на экране элемент и элемент в потоке страницы — разное и при одном виде: кнопка «наверх», что
     проявляется после первого экрана, — не появление раздела (то же правило, что у пар другого вида) */
  if (['reveal', 'scroll-linked', 'parallax'].includes(d.kind) && fixedEl(d) !== fixedEl(o)) return { score: 0 };
  /* петля со сдвигом по кругу — бегущая строка (Tilda до 02.10 писала её «петлёй (парение)»): обычной петле того же
     подвида она не пара — раньше строка донора «совпадала» с любым парящим значком у нас (петли сверялись по подвиду,
     без свойств). Две такие петли — сверяются как строки: сторона и скорость */
  if (d.kind === 'loop') {
    const a = runLine(d), b = runLine(o);
    if (!!a !== !!b) return { score: 0 };
    if (a && b) { const at = linePlace(d, o, a, b, ctx); if (!at || at.no) return { score: 0, no: at ? at.no : '' }; for (const x of lineDiffs(a, b)) { diffs.push(x); score -= 0.15; } }
  }
  if (d.kind === 'marquee') { const a = runLine(d), b = runLine(o); if (a && b) { const at = linePlace(d, o, a, b, ctx); if (!at || at.no) return { score: 0, no: at ? at.no : '' }; } }
  /* лента вбок: путь (сколько px проехать) — от длины ленты, то есть от числа разделов; язык движения — что едет и куда */
  const ribbon = d.sub === 'лента вбок' && o.sub === 'лента вбок';
  if (ribbon) { const sl = (x) => /scrollLeft/.test(x.source || ''); if (sl(d) !== sl(o)) notes.push(`лента едет у донора ${sl(d) ? 'прокруткой контейнера (scrollLeft)' : 'сдвигом transform'}, у нас — ${sl(o) ? 'прокруткой контейнера (scrollLeft)' : 'сдвигом transform'}`); }
  if (d.kind === 'hover' && d.sub !== o.sub) { diffs.push(`наведение: у донора «${d.sub}», у нас «${o.sub}»`); score -= 0.3; }
  const nd = nums(d), no = nums(o);
  /* вход при загрузке и движение от прокрутки без единого общего свойства — другое движение, а не «то же с разницей»:
     служебный переход рамки кнопки Tilda (column-rule-width, 200 мс) «отличался» от входа нашего заголовка (opacity,
     1000 мс), въезд значка слева — от смены фона точки слайдера. Раньше это было незаметно (WARN при любой паре); когда
     одно наше движение стало закрывать одно донорское, такой «паре» доставалось наше движение, а настоящей — НЕТ */
  if (['entrance', 'reveal', 'scroll-linked', 'parallax'].includes(d.kind) && !ribbon && Object.keys(nd).length && !Object.keys(nd).some((k) => k in no)) return { score: 0 };
  for (const [prop, [a, b]] of Object.entries(nd)) {
    if (!(prop in no)) {
      if (['reveal', 'scroll-linked', 'parallax', 'entrance', 'click'].includes(d.kind)) { const pr = (d.props || []).find((x) => x.prop === prop); diffs.push(`нет «${prop}» (${pr ? `${pr.from} → ${pr.to}` : `${a} → ${b}`})`); score -= 0.25; }
      /* наведение: у донора меняется цвет, у нас — только подчёркивание — это другое наведение, а не то же */
      else if (d.kind === 'hover') { const pr = (d.props || []).find((x) => x.prop === prop); diffs.push(`у нас не меняется «${prop}»${pr ? ` (у донора ${pr.from} → ${pr.to})` : ''}`); score -= 0.15; }
      continue;
    }
    const [c, e] = no[prop];
    if (d.kind === 'click' && /высота/.test(prop)) continue;       /* высота панели — от содержимого, не язык движения */
    if (ribbon && prop === NAMES.tx) {
      const sd = Math.sign(b - a), so = Math.sign(e - c);
      if (sd && so && sd !== so) { diffs.push(`лента едет в другую сторону: у донора ${a} → ${b} px, у нас ${c} → ${e} px`); score -= 0.15; }
      else notes.push(`путь ленты у донора ${a} → ${b} px, у нас ${c} → ${e} px — от длины ленты, не сравнивается`);
      continue;
    }
    const bad = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) > Math.max(0.05, Math.abs(x) * 0.25);
    if (bad(a, c) || bad(b, e)) { diffs.push(`${prop}: у донора ${a} → ${b}, у нас ${c} → ${e}`); score -= 0.15; }
  }
  const dt = d.timing || {}, ot = o.timing || {};
  if (dt.duration && ot.duration && (ot.duration > dt.duration * 1.6 || ot.duration < dt.duration / 1.6)) { diffs.push(`длительность: ${dt.duration} → у нас ${ot.duration} мс`); score -= 0.1; }
  /* бегущая строка: сторона и скорость (раньше строка со строкой была парой при любых числах: 40 и 400 px/с — «OK») */
  if (d.kind === 'marquee') { const ld = lineDiffs(runLine(d), runLine(o)); for (const x of ld) { diffs.push(x); score -= 0.15; } }
  if (!ribbon && d.scroll && o.scroll && Number.isFinite(d.scroll.startPct) && Number.isFinite(o.scroll.startPct) && (Math.abs(d.scroll.startPct - o.scroll.startPct) > 20 || Math.abs(d.scroll.endPct - o.scroll.endPct) > 20)) { diffs.push(`отрезок прокрутки: у донора ${d.scroll.startPct}% → ${d.scroll.endPct}%, у нас ${o.scroll.startPct}% → ${o.scroll.endPct}%`); score -= 0.1; }
  /* длина отрезка в пикселях — когда проценты её не выдали (их нет или начало и конец те же): 200 px против 3000 — не одно и то же */
  else if (!ribbon && d.kind === 'scroll-linked' && d.scroll && o.scroll && d.scroll.rangePx > 0 && o.scroll.rangePx > 0 && Math.max(d.scroll.rangePx, o.scroll.rangePx) / Math.min(d.scroll.rangePx, o.scroll.rangePx) > CROSS.range) { diffs.push(`отрезок прокрутки: у донора ${d.scroll.rangePx} px, у нас ${o.scroll.rangePx} px`); score -= 0.1; }
  /* место у пары одного вида — когда известно у обоих: лента первого экрана донора и такая же привязка к прокрутке в
     нашем подвале — не пара (t1d), как и у пар другого вида. Наша строка ×N стоит в нескольких местах (место записано
     у первого из N) — её место не сверяется; у строки донора ×N (соседи одного блока) сверяется по первому.
     Подсказкой в строку «НЕТ» это идёт, когда числа рядом (лента с числами донора стоит у нас в
     другом разделе); числа другие и место другое — просто не пара. Бегущая строка — в linePlace выше */
  if (SPOT_KINDS.has(d.kind) && d.kind !== 'marquee' && d.sub !== 'лента вбок' && o.sub !== 'лента вбок' && (o.count || 1) === 1) {
    const pd = placeOf(d, ctx.vhD), po = placeOf(o, ctx.vhO); const gap = placeGap(pd, po);
    if (gap && gap.far) return { score: 0, no: diffs.length ? '' : `${o.id} «${kindRu(o)}» \`${o.target}\` — вид тот же, но место другое: у донора ${pd.text}${(d.count || 1) > 1 ? ' (первый из нескольких ×N)' : ''}, у нас ${po.text}` };
  }
  return { score: Math.max(0.05, score), diffs, notes };
}
/* Что у нас не снималось (--no-clicks, --no-hover, --no-mouse, --no-scroll): строка донора этого вида без пары —
   «не проверялось», а не «нет» (FAIL был ложным). Протокол без phases (снят до 29.09): клики — по наличию clicks,
   его пишет только прогон с кликами. → причина или '' */
function uncheckedWhy(ours, d) {
  const ph = ours.phases || { clicks: !!ours.clicks };
  if (d.kind === 'click') return ph.clicks === false ? 'клики у нас не снимались (--no-clicks)' : '';
  if (d.kind === 'hover') return ph.hover === false ? 'наведение у нас не снималось (--no-hover)' : '';
  if (d.kind === 'mouse' || d.kind === 'cursor') return ph.mouse === false ? 'мышь у нас не снималась (--no-mouse)' : '';
  if (['reveal', 'scroll-linked', 'parallax', 'pinned', 'header', 'progress'].includes(d.kind) || (d.kind === 'counter' && d.trigger === 'scroll')) return ph.scroll === false ? 'прокрутка у нас не снималась (--no-scroll)' : '';
  return '';
}
/* Решение по строке донора: первый найденный ключ — номер, «вид:подпись», «вид:подпись» любого участника группы
   (старые решения на картинку стопки работают), «вид:<родитель> > *» — на всю группу детей, вид. Голый
   «loop:<родитель>» — решение про сам родитель (у shapefest он качается своей строкой), детей не закрывает.
   Ключ с экраном — «m07:mobile», «reveal:div.card:desktop» (как у bgdecor: «margin-object:desktop»): номера mNN у
   протоколов desktop и mobile свои, и один motion-decisions.json на оба экрана путал решения («Зелёный уголок»,
   01.10: m06 — наведение на широком экране и меню на телефоне; обходились двумя файлами и --decisions). У каждого
   ключа сначала ищется вариант с экраном протокола донора, потом без экрана — тот действует на любой экран, как
   раньше. Пустое решение ("" или пробелы) решением не считается. */
const decText = (dec, k) => (k && Object.prototype.hasOwnProperty.call(dec, k) && typeof dec[k] !== 'object' ? String(dec[k] ?? '').trim() : '');
/* подпись без блока Tilda («#rec1689… [data-elem-id="…"]» → « [data-elem-id="…"]») начинается с пробела — ключ годится и без него */
const decBases = (d) => [...new Set([d.id, `${d.kind}:${pattern(d.target)}`, `${d.kind}:${pattern(d.target).trim()}`, ...(d.members || []).map((m) => `${d.kind}:${pattern(m)}`), ...(d.parent ? [`${d.kind}:${d.parent} > *`] : []), d.kind])].filter(Boolean);
/* Решение — это текст «почему нет / чем заменено». Значение не строкой (false, 0, true, число) решением не считается:
   { "m01": false } закрывало строку словом «false» (в master ложное значение решением не было). → { dec — только
   строки, odd — ключи с такими значениями } */
function decisionsOf(raw) {
  const dec = {}, odd = [];
  for (const [k, v] of Object.entries(raw || {})) { if (k.startsWith('_') || (v && typeof v === 'object')) continue; if (typeof v === 'string') dec[k] = v; else odd.push(`«${k}» (${JSON.stringify(v)})`); }
  return { dec, odd };
}
/* === Отпечаток строки донора для решения по номеру ===
   Номера mNN — порядок строк в протоколе, и он плавает: донор generationx5.tech, снятый 01.10 и 02.10 без единой правки
   сайта, поменял местами m04 и m05 (порядок входов при загрузке), а новая строка в начале сдвигает все номера. Старое
   решение «m04: формы нет» закрыло бы «проявление блоков», а «вращение не берём» — ленту блока оптовикам. Проверка по
   времени файла (была до 02.10) снималась первой же правкой файла решений и поднимала ложную тревогу, когда донора
   пересняли без сдвига. Поэтому сверяется само движение: при первом применении решения по номеру запоминается отпечаток
   строки — то, что между съёмами не плавает (по пяти парам съёмов одной страницы, 28.09–02.10: подпись элемента, число
   элементов, набор свойств и подписи текста совпали у всех строк; вид менялся только у бегущей строки Tilda — «петля» →
   «бегущая строка», когда её научились узнавать). Под номером другое движение — решение не применяется, WARN называет
   оба движения и ключ по виду и подписи, который от номеров не зависит.
   Тот же ли это элемент и запуск: подпись по шаблону та же, вид тот же или из той же группы (от прокрутки: привязка,
   параллакс, появление; по времени: строка, петля — замер мог назвать иначе), у того же вида — есть общее свойство. */
const KIND_GROUP = (k) => (['scroll-linked', 'parallax', 'reveal'].includes(k) ? 'scroll' : k === 'marquee' || k === 'loop' ? 'time' : k);
const printOf = (d, text) => ({ decision: text, kind: d.kind, ...(d.sub ? { sub: d.sub } : {}), target: d.target, count: d.count || 1, props: (d.props || []).map((p) => p.prop), what: `${kindRu(d)} ${d.target}${d.count > 1 ? ` ×${d.count}` : ''}${d.text ? ` «${String(d.text).slice(0, 24)}»` : ''}` });
function printMatch(p, d) {
  if (pattern(p.target) !== pattern(d.target) || KIND_GROUP(p.kind) !== KIND_GROUP(d.kind)) return false;
  if (p.kind !== d.kind) return true;
  const a = p.props || [], b = (d.props || []).map((x) => x.prop);
  return !a.length || !b.length || a.some((x) => b.includes(x));
}
/* Привязка задним числом — для решений по номеру, записанных до отпечатков (прогоны старше 02.10). Чему номер
   соответствовал, когда решение писали, видно в прежнем протоколе сверки той же страницы донора и экрана
   (<out>/motion/*.json: steps[].what — «m04 вход при загрузке span.t-submit__text», decisionKey, в конце details — текст
   решения). Отпечаток берётся оттуда, если текст решения с тех пор не менялся; из нескольких протоколов — из самого
   свежего. Иначе первая же сверка после пересъёмки донора привязала бы старые решения к новым номерам — а пересъёмку
   советует сама сверка («место на странице не сверено»), и именно при ней generationx5.tech поменял местами m04 и m05.
   → { prints: { ключ: отпечаток }, from: [имена файлов] } */
function printsFromHistory(dir, donor, screen, decisionsRaw, have) {
  const { dec } = decisionsOf(decisionsRaw);
  const want = Object.keys(dec).filter((k) => /^m\d+(:[\w-]+)?$/.test(k) && !have[k] && dec[k].trim() && (!k.includes(':') || k.endsWith(`:${screen}`)));
  const prints = {}, from = new Set();
  if (!want.length || !donor.url || !fs.existsSync(dir)) return { prints, from: [] };
  const old = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ f, p: readJson(path.join(dir, f)) }))
    .filter(({ p }) => p && !Array.isArray(p) && Array.isArray(p.steps) && !p.items && p.donor === donor.url && (p.donorViewport || p.viewport || 'desktop') === screen)
    .sort((a, b) => String(b.p.takenAt || '').localeCompare(String(a.p.takenAt || '')));
  const kinds = Object.entries(KIND_RU).sort((a, b) => b[1].length - a[1].length);
  for (const k of want) for (const { f, p } of old) {
    const text = dec[k].trim(); const s = p.steps.find((x) => x && x.decisionKey === k && String(x.details || '').endsWith(text)); if (!s) continue;
    const m = /^m\d+ (.+)$/.exec(String(s.what || '')); const kd = m ? kinds.find(([, ru]) => m[1].startsWith(`${ru} `)) : null; if (!kd) continue;
    const rest = m[1].slice(kd[1].length + 1); const cm = / ×(\d+)$/.exec(rest);
    prints[k] = { decision: text, kind: kd[0], target: cm ? rest.slice(0, cm.index) : rest, count: cm ? Number(cm[1]) : 1, props: [], what: m[1], from: `прежний протокол сверки ${f}${p.takenAt ? ` от ${String(p.takenAt).slice(0, 10)}` : ''}` };
    from.add(f); break;
  }
  return { prints, from: [...from] };
}
/* prints — отпечатки этого донора и экрана { ключ: отпечаток }; stale — сюда складываются решения по номеру, под
   которым теперь другое движение (не применены). Решение, текст которого переписан, — новое: привязывается заново. */
function decisionFor(d, dec, screen = '', prints = null, stale = null) {
  for (const b of decBases(d)) for (const k of screen ? [`${b}:${screen}`, b] : [b]) {
    const text = decText(dec, k); if (!text) continue;
    const p = b === d.id && prints ? prints[k] : null;
    if (p && p.decision === text && !printMatch(p, d)) { if (stale) stale.push({ key: k, print: p, d }); continue; }
    return { key: k, text, byId: b === d.id, bare: k === b, shadow: k !== b && decText(dec, b) && decText(dec, b) !== decText(dec, k) ? b : '', bind: b === d.id && !(p && p.decision === text), rebind: b === d.id && !!p && p.decision !== text ? p : null };
  }
  return null;
}
/* Назначение пар. Каждое движение донора идёт к самому похожему нашему (при равном сходстве — к ещё не занятому, как
   было); на одном нашем остаются:
   · все полные совпадения того же вида — одна анимация карточек закрывает все одинаковые появления донора (как было);
   · иначе одна пара — самая похожая. Пара с разницей и пара другим видом занимают наше движение целиком: одно наше
     не закрывает два разных донорских. Раньше одна наша лента ступеней «отличалась» сразу от трёх лент донора, и
     вращение фигур на 259°, которого у нас нет, выходило WARN «отличается», а не FAIL «нет» («Зелёный уголок»).
     Исключение — строки одного элемента донора (тот же i: параллакс и поворот одной ленты).
   · у движения, которое стоит в одном месте (лента раздела, бегущая строка, петля — SPOT_KINDS), и полных совпадений
     на одном нашем — не больше, чем у нас элементов (×N нашей строки): три ленты донора на трёх разделах и одна наша с
     теми же числами — это одна лента, а не три (раньше — три OK; ловушка t1a). Группа одинаковых соседей донора — одна
     строка ×N, ей хватает одной нашей. Появления, наведение, вход и мышь делят наше без счёта, как было: анимация
     задана классом на все такие элементы, и число в ×N у них — сколько элементов попало в замер, а не сколько их есть.
   Вытесненное движение донора идёт к следующему похожему; не нашлось — «НЕТ» с подсказкой, что его вытеснило. */
function assignPairs(donorItems, cands) {
  const held = new Map(), cur = new Map(), order = new Map(donorItems.map((d, k) => [d, k]));
  const on = (o) => { if (!held.has(o)) held.set(o, new Set()); return held.get(o); };
  const sameEl = (a, b) => Number.isInteger(a.i) && a.i >= 0 && a.i === b.i && (a.count || 1) === 1 && (b.count || 1) === 1 && sameSpot(a, b);
  const room = (o) => (SPOT_KINDS.has(o.kind) ? Math.max(1, o.count || 1) : Infinity);
  const queue = [...donorItems];
  while (queue.length) {
    const d = queue.shift(); if (cur.has(d)) continue;
    const list = (cands.get(d) || []).filter((c) => !c.out); if (!list.length) continue;
    const tier = list.filter((c) => c.score === list[0].score);
    const c = tier.find((x) => x.os.every((o) => !on(o).size)) || tier[0];
    cur.set(d, c); for (const o of c.os) on(o).add(c);
    for (const o of c.os) {
      const H = [...on(o)]; if (H.length < 2) continue;
      const full = H.filter((x) => x.share).sort((a, b) => order.get(a.d) - order.get(b.d)).slice(0, room(o));
      const lead = full.length ? full : [H.reduce((b, x) => (x.score > b.score || (x.score === b.score && order.get(x.d) < order.get(b.d)) ? x : b))];
      for (const x of H) {
        if (lead.includes(x) || lead.some((l) => sameEl(l.d, x.d))) continue;
        x.out = lead[0]; cur.delete(x.d); for (const q of x.os) on(q).delete(x); queue.push(x.d);   /* каждый кандидат вытесняется один раз — очередь конечна */
      }
    }
  }
  return cur;
}
/* Сверка: строки донора → пары у нас. screen — экран протокола донора для ключей решений («m07:mobile»). */
function compare(donor, ours, decisionsRaw, { screen = '', prints = null } = {}) {
  const ctx = { vhD: (sizeOf(donor) || {}).h, vhO: (sizeOf(ours) || {}).h };
  const { dec: decisions, odd } = decisionsOf(decisionsRaw);
  const dU = scrollUnits(donor.items, ctx.vhD), oU = scrollUnits(ours.items, ctx.vhO); const unitOf = new Map(); for (const u of dU) for (const p of u.parts) unitOf.set(p, u);
  const sameKind = (a, b) => a.parts.length === 1 && b.parts.length === 1 && FAMILY(a.parts[0]) === FAMILY(b.parts[0]);   /* пара одного вида — в similar */
  const cands = new Map(), almost = new Map();
  for (const d of donor.items) {
    const list = [], no = [];
    /* пара по роли (наведение на элементе другого вида, цвета свои) — пара другим видом: видна словом в статусе и полем cross */
    for (const o of ours.items) { const s = similar(d, o, ctx); if (s.score > 0) list.push({ d, os: [o], score: s.score, diffs: s.diffs || [], notes: s.notes || [], status: s.own ? 'ЕСТЬ, ДРУГИМ ВИДОМ' : (s.diffs || []).length ? 'ОТЛИЧАЕТСЯ' : 'OK', cross: !!s.own, placed: s.own ? !!s.placed : true, share: !(s.diffs || []).length && !s.own }); else if (s.no) no.push({ text: s.no, bad: 0, os: [o] }); }
    /* пары другим видом: точная — сильнее любой пары с разницей, но слабее полного совпадения того же вида */
    const add = (c, os) => { if (!c) return; if (c.no) { if (!c.weak) no.push({ text: c.no, bad: c.bad || 0, os }); return; } list.push({ d, os, score: c.exact ? 0.95 : Math.max(0.05, 0.9 - 0.15 * c.diffs.length), diffs: c.diffs, notes: c.notes, status: c.exact ? 'ЕСТЬ, ДРУГИМ ВИДОМ' : 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ', share: false, cross: true, placed: !!c.placed }); };
    const du = unitOf.get(d);
    if (du) for (const u of oU) if (!sameKind(du, u)) add(crossScroll(du, u, ctx), u.parts);
    for (const o of ours.items) add(crossLine(d, o, ctx), [o]);
    cands.set(d, list.map((c, k) => [c, k]).sort((a, b) => b[0].score - a[0].score || a[1] - b[1]).map((x) => x[0]));
    almost.set(d, no);
  }
  const cur = assignPairs(donor.items, cands);
  const on = new Set([...cur.values()].flatMap((c) => c.os));   /* наши движения, занятые парами */
  const rows = []; const used = new Set(); const stale = [];
  for (const d of donor.items) {
    const c = cur.get(d) || null;
    const hit = decisionFor(d, decisions, screen, prints, stale); const dec = hit ? hit.text : ''; const key = hit ? hit.key : '';
    /* unplaced — пара другим видом с числами рядом, а место на странице не сверено: строка остаётся «ЕСТЬ», но вердикт
       без решения по ней — не лучше WARN (см. ниже) */
    if (c) { for (const o of c.os) used.add(o.id); rows.push({ d, o: c.os[0], os: c.os, status: c.status, diffs: c.diffs, notes: [...c.notes], decision: dec, key, hit, cross: !!c.cross, unplaced: !!c.cross && !c.placed && c.status === 'ЕСТЬ, ДРУГИМ ВИДОМ' }); continue; }
    const why = dec ? '' : uncheckedWhy(ours, d);
    /* пары нет, а похожее у нас есть: что его заняло или почему не засчитано — чтобы «НЕТ» не читалось как «не искали» */
    const hints = []; const lost = (cands.get(d) || []).filter((x) => x.out);
    const busy = (x) => (x.os.some((o) => on.has(o)) ? 1 : 0);
    const near = [...(almost.get(d) || [])].sort((a, b) => busy(a) - busy(b) || a.bad - b.bad)[0];   /* сначала не занятое парой, потом с меньшей разницей */
    if (near) { const by = busy(near) ? [...cur.values()].find((x) => x.os.some((o) => near.os.includes(o))) : null; hints.push(`похожее у нас: ${near.text}${by ? `; к тому же оно уже пара для ${by.d.id} донора` : ''}`); }
    else if (lost.length) hints.push(`похожее у нас — ${lost[0].os.map((o) => o.id).join('+')} \`${lost[0].os[0].target}\`${lost[0].diffs.length ? ` (с разницей: ${lost[0].diffs.slice(0, 2).join('; ')})` : ''}, но оно уже пара для ${lost[0].out.d.id} донора: одно наше движение не закрывает два разных донорских`);
    rows.push({ d, o: null, os: [], status: dec ? 'РЕШЕНО' : why ? 'НЕ ПРОВЕРЯЛОСЬ' : 'НЕТ', diffs: [], notes: why ? [why] : dec ? [] : hints, decision: dec, key, hit });
  }
  /* решение по номеру, под которым теперь другое движение, не применено — сказать об этом и в самой строке */
  for (const s of stale) { const r = rows.find((x) => x.d === s.d); if (r) r.notes.push(`решение «${s.key}» не применено: оно записано для «${s.print.what}»`); }
  const extra = ours.items.filter((o) => !used.has(o.id));
  const miss = rows.filter((r) => r.status === 'НЕТ').length, diff = rows.filter((r) => /^ОТЛИЧАЕТСЯ/.test(r.status) && !r.decision).length;
  const unchecked = rows.filter((r) => r.status === 'НЕ ПРОВЕРЯЛОСЬ').length, other = rows.filter((r) => r.status === 'ЕСТЬ, ДРУГИМ ВИДОМ').length;
  /* предупреждения сверки — в вердикт (не лучше WARN); заметки о решениях — без вердикта */
  const warnings = [], notes = [];
  if (donor.viewport && ours.viewport && donor.viewport !== ours.viewport) warnings.push(`экраны разные: донор снят на ${donor.viewport}, наш сайт — на ${ours.viewport}. Движение на телефоне и на широком экране своё (числа сдвигов, выключенные появления) — сверять протоколы одного экрана`);
  /* пара другим видом засчитана по одним числам — место на странице не сверено: «есть», которое никто не перепроверит,
     хуже «нет». Строка остаётся «ЕСТЬ, ДРУГИМ ВИДОМ» (числа и правда совпали, и не одно), а вердикт — не лучше WARN,
     пока донора не пересняли или пару не подтвердили решением (оба протокола без места: лента первого экрана донора и
     параллакс с теми же числами в нашем подвале неразличимы — ловушка t6e) */
  const loose = rows.filter((r) => r.unplaced && !r.decision);
  if (loose.length) warnings.push(`место на странице не сверено у ${loose.length === 1 ? 'пары' : 'пар'} ${loose.map((r) => `${r.d.id} → ${oursOf(r)}`).join(', ')}: числа совпали, но где стоит элемент, в протоколе не записано (снят до 02.10) — та же ли это часть страницы, сверка не знает. Пересните донора и наш сайт (motion.mjs <адрес>) или сверьте пару глазами и подтвердите решением на ключ строки`);
  const hits = rows.filter((r) => r.hit);
  const idle = hits.filter((r) => (r.status === 'OK' || r.status === 'ЕСТЬ, ДРУГИМ ВИДОМ') && !r.unplaced);
  if (idle.length) notes.push(`решения не понадобились — пара нашлась сама: ${idle.map((r) => `«${r.key}»`).join(', ')} (можно убрать из файла)`);
  const held = hits.filter((r) => r.unplaced);
  if (held.length) notes.push(`решения подтверждают пары, у которых место на странице не сверено: ${held.map((r) => `«${r.key}»`).join(', ')} — после пересъёмки донора (протокол с местом элементов) станут не нужны`);
  for (const r of hits.filter((x) => x.hit.shadow)) notes.push(`решение записано дважды с разным текстом: «${r.key}» и «${r.hit.shadow}» — на экране ${screen} действует ключ с экраном, ключ без экрана остаётся остальным экранам`);
  const bare = hits.filter((r) => r.hit.byId && r.hit.bare);
  if (bare.length) notes.push(bareNote(bare.map((r) => r.key), screen));
  /* решения по номеру: первое применение — отпечаток строки в файл-спутник (пишет команда compare), и сказать, к чему
     привязано; под номером другое движение — WARN, решение не применено */
  const binds = hits.filter((r) => r.hit.bind).map((r) => ({ key: r.key, print: printOf(r.d, r.decision), was: r.hit.rebind }));
  const fresh = binds.filter((b) => !b.was), again = binds.filter((b) => b.was);
  if (prints && fresh.length) notes.push(`решения по номеру привязаны к движениям донора (отпечатки — ${PRINTS_FILE} в папке прогона): ${fresh.map((b) => `${b.key} — ${b.print.what}`).join('; ')}. Сверьте список: если донора пересняли уже после того, как решение записали, номер мог сдвинуться до привязки. Дальше сверка следит сама: под номером другое движение — решение не применит; надёжнее ключ по виду и подписи («${stableKey(hits.find((r) => r.key === fresh[0].key).d, screen)}»)`);
  if (again.length) notes.push(`текст решения по номеру переписан — привязано заново: ${again.map((b) => `${b.key} — теперь «${b.print.what}»${b.was.what !== b.print.what ? `, было «${b.was.what}»` : ''}`).join('; ')}`);
  for (const s of stale) {
    const now = donor.items.find((x) => x !== s.d && printMatch(s.print, x));
    warnings.push(`решение «${s.key}» не применено: оно записано для «${s.print.what}», а сейчас под этим номером «${kindRu(s.d)} ${s.d.target}${s.d.count > 1 ? ` ×${s.d.count}` : ''}» — донора пересняли, номера mNN сдвинулись. ${now ? `То движение теперь ${now.id}` : 'Того движения в протоколе донора теперь нет'}. Перенесите решение на ключ по виду и подписи — "${stableKey(now || s.print, screen)}" (от номеров не зависит)${now ? ` — или на новый номер "${now.id}${screen ? `:${screen}` : ''}"` : ''}; если оно про нынешнее движение — перепишите текст решения, оно привяжется заново`);
  }
  const bases = new Set(donor.items.flatMap(decBases)); const usedKeys = new Set(hits.map((r) => r.key)); const staleKeys = new Set(stale.map((s) => s.key));
  const empty = [], dead = [], miscase = [], renamed = [];
  for (const [k, v] of Object.entries(decisions || {})) {
    if (k.startsWith('_') || (v && typeof v === 'object')) continue;                  /* служебные ключи («_about») — не решения */
    if (!String(v ?? '').trim()) { empty.push(k); continue; }
    if (usedKeys.has(k) || staleKeys.has(k)) continue;
    const cut = k.lastIndexOf(':'); const tail = cut > 0 ? k.slice(cut + 1) : ''; const head = cut > 0 ? k.slice(0, cut) : '';
    const keyed = /^m\d+$/.test(head) || KIND_RU[head] || /^[\w-]+:/.test(head);
    /* экран в ключе — строчными, как в протоколе: «m01:Desktop» принимался за ключ другого экрана и пропадал молча */
    if (tail && keyed && tail !== tail.trim().toLowerCase() && resolveViewport(tail)) { miscase.push(`«${k}» → «${head}:${tail.trim().toLowerCase()}»`); continue; }
    if (tail && tail !== screen && resolveViewport(tail) && keyed) continue;   /* ключ другого экрана */
    const base = tail && tail === screen ? head : k;
    if (bases.has(base)) continue;                                                       /* подходящая строка есть — ключ просто заслонён более точным */
    /* ключ по виду, а движение у донора теперь записано другим видом той же группы: решение «loop» закрывало бегущие
       строки Tilda, пока они писались петлёй; с 02.10 это «бегущая строка» — ключ молча перестал работать */
    const kd = base.split(':')[0]; const sg = base.includes(':') ? base.slice(kd.length + 1) : '';
    const twin = KIND_RU[kd] ? donor.items.find((x) => x.kind !== kd && KIND_GROUP(x.kind) === KIND_GROUP(kd) && KIND_GROUP(kd) !== kd && (!sg || pattern(x.target) === sg || pattern(x.target).trim() === sg)) : null;
    if (twin) renamed.push(`«${k}» — вида «${KIND_RU[kd]}» с такой подписью у донора нет, а «${KIND_RU[twin.kind]}» есть (${twin.id}): ключ «${twin.kind}${sg ? `:${sg}` : ''}${tail && tail === screen ? `:${screen}` : ''}»`);
    else dead.push(k);
  }
  if (odd.length) notes.push(`решение — это текст «почему нет / чем заменено»; значения не строкой решением не считаются: ${odd.join(', ')}`);
  if (empty.length) notes.push(`пустые решения не засчитаны: ${empty.map((k) => `«${k}»`).join(', ')}`);
  if (miscase.length) notes.push(`экран в ключе пишется строчными, как в протоколе, — ключи не применены: ${miscase.join(', ')}`);
  if (renamed.length) notes.push(`ключи решений по виду, которые ничего не закрыли, — движение у донора записано другим видом (замер или разбор назвал его иначе; бегущая строка Tilda до 02.10 писалась «петлёй»): ${renamed.join('; ')}`);
  if (dead.length) notes.push(`ключи решений, которые ничего не закрыли — такого номера, вида или подписи у донора на этом экране нет: ${dead.map((k) => `«${k}»`).join(', ')}${dead.some((k) => /^m\d+:/.test(k)) ? ` (экран в ключе — как в протоколе: ${screen || 'desktop'})` : ''}`);
  const verdict = miss ? 'FAIL' : diff || warnings.length ? 'WARN' : 'OK';
  return { rows, extra, verdict, miss, diff, unchecked, other, warnings, notes, binds, stale, unplaced: loose.length, bareKeys: bare.map((r) => r.key) };
}
/* файл-спутник с отпечатками решений по номеру — в папке прогона, рядом с motion-decisions.json */
const PRINTS_FILE = 'motion-decisions.prints.json';
/* ключ решения, который от номеров не зависит: «вид:подпись[:экран]» */
const stableKey = (d, screen) => `${d.kind}:${pattern(d.target).trim()}${screen ? `:${screen}` : ''}`;
const bareNote = (keys, screen) => `решения по номеру без экрана: ${keys.join(', ')} — действуют на любой экран, а номера mNN у desktop и mobile свои; в общем файле на оба экрана пишите с экраном («${keys[0]}:${screen || 'desktop'}»)`;
/* статус строки сверки для консоли и протокола: «не проверялось» — INFO (как у runtime), в вердикт не идёт */
const rowLevel = (r) => (r.status === 'НЕТ' ? 'FAIL' : /^ОТЛИЧАЕТСЯ/.test(r.status) && !r.decision ? 'WARN' : r.status === 'НЕ ПРОВЕРЯЛОСЬ' ? 'INFO' : 'OK');
const oursOf = (r) => (r.os && r.os.length ? r.os.map((o) => o.id).join('+') : '');
function mdCompare(c, donor, ours) {
  const vp = donor.viewport || 'desktop';
  const L = [`# Сверка движения: донор → наш сайт`, '', `Донор: ${donor.url} (${donor.viewport}) · наш: ${ours.url} (${ours.viewport}) · вердикт **${c.verdict}** (нет без решения: ${c.miss}, отличается: ${c.diff}${c.other ? `, тот же приём другим видом: ${c.other}` : ''}${c.unplaced ? `, из них без сверки места: ${c.unplaced} — переснять донора` : ''}${c.unchecked ? `, не проверялось: ${c.unchecked} — у нас не снималось, в вердикт не входит` : ''})`, '',
    ...(c.warnings.length ? [...c.warnings.map((w) => `- **WARN** ${w}`), ''] : []),
    '| донор | вид | у донора | у нас | статус | разница / решение | ключ решения |', '|---|---|---|---|---|---|---|'];
  for (const r of c.rows) {
    const d = r.d; const dWhat = `\`${d.target}\`${d.count > 1 ? ` ×${d.count}` : ''}: ${d.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ').slice(0, 90)}`;
    /* строка без решения, которой оно нужно: готовый ключ для вставки — по виду и подписи, он от номеров mNN не зависит
       (донора переснимут — номера сдвинутся); у строки ×N — ключ на группу */
    const need = !r.key && (r.status === 'НЕТ' || /^ОТЛИЧАЕТСЯ/.test(r.status) || r.unplaced);
    const hint = !r.key && r.status !== 'OK' && d.parent && d.count > 1 ? `на группу — \`${d.kind}:${d.parent} > *\`` : need ? `для решения — \`${stableKey(d, vp).replace(/\|/g, '/')}\`` : '—';
    /* пара другим видом — у нашего движения назван и вид: «m03+m04 div.hero__ribbon — параллакс + появление»; у наведения — на чём оно */
    const oKind = (o) => (o.kind === 'hover' ? `наведение на «${COMP_RU[o.component] || o.component || '?'}»` : kindRu(o));
    const oWhat = r.o ? `${oursOf(r)} \`${r.o.target}\`${r.cross ? ` — ${[...new Set(r.os.map(oKind))].join(' + ')}` : ''}` : '—';
    L.push(`| ${d.id} | ${KIND_RU[d.kind] || d.kind}${d.sub ? ` (${d.sub})` : ''} | ${dWhat.replace(/\|/g, '/')} | ${oWhat.replace(/\|/g, '/')} | ${r.status} | ${[...r.diffs, ...(r.notes || []), r.decision ? `решение: ${r.decision}` : ''].filter(Boolean).join('; ').replace(/\|/g, '/') || '—'} | ${r.key ? `\`${r.key.replace(/\|/g, '/')}\`` : hint} |`);
  }
  L.push('', `## Своё (у донора нет) — ${c.extra.length}`, '', ...(c.extra.length ? c.extra.map((o) => `- ${o.id} ${KIND_RU[o.kind] || o.kind}${o.sub ? ` (${o.sub})` : ''} — \`${o.target}\`: ${o.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ').slice(0, 100)}`) : ['- нет']));
  if (c.notes.length) L.push('', '## Решения — замечания', '', ...c.notes.map((n) => `- ${n}`));
  L.push('', '## Как читать', '',
    '- **OK** — такое же движение у нас есть: вид тот же, числа рядом (у наведения одного вида сверяется, какие свойства меняются и за сколько, а сами цвета — нет: палитра у нас своя). Делать ничего не нужно.',
    '- **ЕСТЬ, ДРУГИМ ВИДОМ** — приём у нас повторён, но записан иначе: у донора «привязано к прокрутке», у нас «параллакс» или «появление»; у донора «петля» со сдвигом по кругу, у нас «бегущая строка»; наведение у донора записано на «ссылку», у нас — на «кнопку» (переход тот же, цвета свои). Числа донора и наши стоят рядом в строке, место на странице то же. Делать ничего не нужно — кроме случая, когда в строке «место на странице не сверено»: числа совпали, а где стоит элемент, в протоколе нет (снят до 02.10). Тогда вердикт не лучше WARN: переснять донора или сверить пару глазами и подтвердить решением.',
    '- **ОТЛИЧАЕТСЯ** — движение у нас есть, числа другие (какие — в строке). Поправить числа или записать решение, почему так. «ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ» — то же, но приём у нас записан другим видом; сюда же — «у нас меняется ещё …»: числа донора на месте, но у нас добавлен поворот или сдвиг, которого у донора нет.',
    '- **НЕТ** — такого движения у нас нет. Сделать его (рецепты — `reference/motion.md`) или записать решение «почему нет / чем заменено». Если в строке «похожее у нас …» — похожее есть, но парой не засчитано: причина там же (место на странице другое, числа врозь, оно уже пара другому движению донора).',
    '- **РЕШЕНО** — пары нет, причина записана в файле решений. **НЕ ПРОВЕРЯЛОСЬ** — у нас этот вид не снимался.',
    '', `Решения «почему нет / чем заменено» — \`motion-decisions.json\` в папке прогона: { "reveal:div.card": "почему", "m04": "почему" }; на группу петель (строка ×N) — "loop:<родитель> > *". Ключ по виду и подписи надёжнее номера: в столбце «ключ решения» у строки без решения он готов для вставки. Один файл на оба экрана — ключ с экраном: "reveal:div.card:${vp}", "m04:${vp}" (номера mNN у desktop и mobile свои); ключ без экрана действует на любой экран.`,
    `Номер mNN — порядок строк протокола, при пересъёмке донора он сдвигается. Поэтому при первом применении решения по номеру сверка запоминает, какое движение оно закрыло (\`${PRINTS_FILE}\` рядом с решениями), и к другому движению под тем же номером решение не применит — скажет WARN с обоими движениями и готовым ключом.`, 'Своё — сверить с банком идей (`ideas.mjs list`): задумано ли, записать удачное.');
  return L.join('\n') + '\n';
}

/* =====================================================================
   Команды
   ===================================================================== */
const cmd = pos[0] === 'compare' || pos[0] === 'selftest' ? pos.shift() : 'inventory';
const timeMs = opt.time !== undefined ? Number(opt.time) : 6000;
if (!(timeMs >= 1000 && timeMs <= 20000)) die('--time: от 1000 до 20000 мс');
const capMs = opt['time-cap'] !== undefined && opt['time-cap'] !== true ? Number(opt['time-cap']) : LOOP.cap;
if (!(capMs >= 1000 && capMs <= 60000)) die('--time-cap: от 1000 до 60000 мс');
const hoverN = opt.hover !== undefined && opt.hover !== true ? Number(opt.hover) : 14;
if (!(hoverN >= 0 && hoverN <= 60)) die('--hover: от 0 до 60');
const clickN = opt.clicks !== undefined && opt.clicks !== true ? Number(opt.clicks) : 6;
if (!(clickN >= 0 && clickN <= 20)) die('--clicks: от 0 до 20');
const phases = { timeMs, capMs, hoverN, clickN, doHover: !opt['no-hover'], doMouse: !opt['no-mouse'], doScroll: !opt['no-scroll'], doClicks: !opt['no-clicks'] && clickN > 0, crops: !opt['no-crops'] };
const vpList = (v) => String(v && v !== true ? v : 'desktop').split(',').map((x) => x.trim()).filter(Boolean);
for (const v of vpList(opt.viewport)) if (!resolveViewport(v)) die(`Неизвестный экран: ${v}`);

if (cmd === 'selftest') {
  /* сверка без браузера — fixtures/motion/compare-*.json (Эпицентр /menu ↔ mamuka.rest/menu, 29.09): лента вбок у донора
     transform, у нас scrollLeft контейнера — пара, путь ленты не сравнивается, в другую сторону — ОТЛИЧАЕТСЯ; наведение
     с тем же переходом на элементе другого вида (логотип ↔ ссылка) — пара, с другим «до» — нет; клики у нас не снимались
     (--no-clicks) — «не проверялось» и в FAIL не идёт, снимались — НЕТ; протокол без phases и без clicks — «не проверялось» */
  let cbad = 0, cn = 0;
  {
    const cd = readJson(path.join(HERE, 'fixtures', 'motion', 'compare-donor.json')), co = readJson(path.join(HERE, 'fixtures', 'motion', 'compare-ours.json'));
    const C = (ok, what, got) => { cn++; if (!ok) cbad++; console.log(`${ok ? 'OK  ' : 'FAIL'} сверка: ${what}${ok ? '' : ` — получено: ${got}`}`); };
    const st = (c, id) => { const r = c.rows.find((x) => x.d.id === id); return r ? `${r.status}${r.o ? ` ${r.o.id}` : ''}` : 'нет строки'; };
    const c1 = compare(cd, co, {});
    const r1 = c1.rows.find((x) => x.d.id === 'm01');
    C(st(c1, 'm01') === 'OK m01' && r1.notes.some((n) => /не сравнивается/.test(n)), 'лента вбок: у донора transform, у нас scrollLeft контейнера — OK, путь ленты не сравнивается', `${st(c1, 'm01')} ${r1.diffs.join('; ')}`);
    C(st(c1, 'm02') === 'OK m02', 'наведение: тот же переход на элементе другого вида (логотип ↔ ссылка) — пара', st(c1, 'm02'));
    C(st(c1, 'm05') === 'НЕТ', 'наведение: другой переход на элементе другого вида — не пара', st(c1, 'm05'));
    C(st(c1, 'm04') === 'OK m03', 'наведение того же вида — пара, как было', st(c1, 'm04'));
    C(st(c1, 'm03') === 'НЕ ПРОВЕРЯЛОСЬ' && c1.miss === 1 && c1.unchecked === 1 && rowLevel(c1.rows.find((x) => x.d.id === 'm03')) === 'INFO', 'клики у нас не снимались (--no-clicks): по клику — «не проверялось» (INFO), в FAIL не идёт', `${st(c1, 'm03')}, нет ${c1.miss}, не проверялось ${c1.unchecked}`);
    const c2 = compare(cd, { ...co, phases: { ...co.phases, clicks: true } }, {});
    C(st(c2, 'm03') === 'НЕТ', 'клики у нас снимались — по клику без пары — НЕТ', st(c2, 'm03'));
    const c3 = compare(cd, { ...co, phases: undefined }, {});
    C(st(c3, 'm03') === 'НЕ ПРОВЕРЯЛОСЬ', 'протокол без phases и без clicks (снят до 29.09 или с --no-clicks) — «не проверялось»', st(c3, 'm03'));
    const flip = JSON.parse(JSON.stringify(co)); flip.items[0].props[0].to = '1234 px';
    C(/^ОТЛИЧАЕТСЯ/.test(st(compare(cd, flip, {}), 'm01')), 'лента вбок в другую сторону — ОТЛИЧАЕТСЯ', st(compare(cd, flip, {}), 'm01'));
  }
  const out = path.resolve(String(opt.out || path.join(process.env.TEMP || process.env.TMPDIR || '.', 'motion-selftest')));
  /* пары между разными видами движения — fixtures/motion/compare-cross-*.json («Зелёный уголок» ↔ generationx5.tech, 01.10):
     три пары другим видом (привязано к прокрутке ↔ параллакс + появление одного элемента, ↔ появление, петля по кругу ↔
     бегущая строка), наведение по роли, а не по первому элементу, и отказы — сверка не должна находить движение, которого
     у нас нет, в постороннем: место другое, появление карточек вместо ленты, парение вместо строки, одно наше на два и
     три донорских, числа врозь — «ОТЛИЧАЕТСЯ». Плюс ключи решений с экраном и имена страниц (адрес и --pages) */
  {
    const xd = readJson(path.join(HERE, 'fixtures', 'motion', 'compare-cross-donor.json')), xo = readJson(path.join(HERE, 'fixtures', 'motion', 'compare-cross-ours.json'));
    const C = (ok, what, got) => { cn++; if (!ok) cbad++; console.log(`${ok ? 'OK  ' : 'FAIL'} сверка: ${what}${ok ? '' : ` — получено: ${got}`}`); };
    const st = (c, id) => { const r = c.rows.find((x) => x.d.id === id); return r ? `${r.status}${r.os && r.os.length ? ` ${oursOf(r)}` : ''}` : 'нет строки'; };
    const row = (c, id) => c.rows.find((x) => x.d.id === id); const say = (c, id) => { const r = row(c, id); return `${st(c, id)} — ${[...r.diffs, ...r.notes].join('; ').slice(0, 260)}`; };
    const clone = (x) => JSON.parse(JSON.stringify(x)); const it = (p, id) => p.items.find((x) => x.id === id);
    const only = (p, ids) => ({ ...clone(p), items: clone(p).items.filter((x) => ids.includes(x.id)) });
    const noPlace = (p) => { const q = clone(p); for (const x of q.items) delete x.place; return q; };
    const x1 = compare(xd, xo, {}, { screen: 'desktop' });
    const n1 = row(x1, 'm01').notes.join('; ');
    C(st(x1, 'm01') === 'ЕСТЬ, ДРУГИМ ВИДОМ m01+m02' && rowLevel(row(x1, 'm01')) === 'OK' && /привязано к прокрутке/.test(n1) && /параллакс/.test(n1) && /87\.6 px \/ у нас 11\.7 px → 88 px/.test(n1) && /отрезок 600 px \/ у нас 675 px/.test(n1) && /место: у донора первый экран, у нас первый экран/.test(n1),
      'привязано к прокрутке ↔ параллакс + появление одного элемента — «ЕСТЬ, ДРУГИМ ВИДОМ» (не OK), числа обоих, отрезок и место в строке', say(x1, 'm01'));
    C(st(x1, 'm02') === 'ЕСТЬ, ДРУГИМ ВИДОМ m05' && /скорость 113 px\/с влево \/ у нас 113 px\/с влево/.test(row(x1, 'm02').notes.join('; ')), 'петля со сдвигом по кругу (бегущая строка Tilda) ↔ бегущая строка — «ЕСТЬ, ДРУГИМ ВИДОМ», скорости рядом', say(x1, 'm02'));
    C(st(x1, 'm03') === 'НЕТ' && /место другое/.test(row(x1, 'm03').notes.join('; ')), 'вторая строка донора (164 px/с, третий экран) — НЕТ: наша одна строка стоит в первом экране и уже пара первой', say(x1, 'm03'));
    C(st(x1, 'm04') === 'ЕСТЬ, ДРУГИМ ВИДОМ m07' && row(x1, 'm04').cross === true && rowLevel(row(x1, 'm04')) === 'OK' && !row(x1, 'm04').unplaced && /по роли это кнопка у обоих/.test(row(x1, 'm04').notes.join('; ')) && /место: у донора первый экран, у нас первый экран/.test(row(x1, 'm04').notes.join('; ')),
      'наведение по роли и набору свойств: кнопка донора («ссылка» с заливкой) ↔ наша кнопка, а не значок шапки, что наведён первым, — «ЕСТЬ, ДРУГИМ ВИДОМ» (cross), а не обычное OK; место сверено', say(x1, 'm04'));
    C(st(x1, 'm05') === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m04' && rowLevel(row(x1, 'm05')) === 'WARN' && /сдвиг Y: у донора 0 px → -180 px, у нас 0 px → -60 px/.test(row(x1, 'm05').diffs.join('; ')), 'числа втрое врозь (сдвиг −180 и −60 px) — «ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ» (WARN) с числами обоих, а не «есть»', say(x1, 'm05'));
    C(st(x1, 'm06') === 'НЕТ' && st(x1, 'm07') === 'НЕТ', 'вращение на 259° (у нас только параллакс с поворотом 16°) и парение значка (у нас только бегущая строка) — НЕТ', `${st(x1, 'm06')}; ${st(x1, 'm07')}`);
    C(x1.verdict === 'FAIL' && x1.other === 3 && x1.diff === 1 && x1.miss === 3 && x1.unplaced === 0 && !x1.extra.some((o) => o.id === 'm01' || o.id === 'm02'), 'вердикт FAIL (нет: 3), другим видом: 3 (лента, строка, наведение), отличается: 1; обе строки ленты — в паре, а не в «своём»', `${x1.verdict}, другим видом ${x1.other}, отличается ${x1.diff}, нет ${x1.miss}, без сверки места ${x1.unplaced}, своё ${x1.extra.map((o) => o.id).join(' ')}`);
    /* у нас появление (отрезок уложился в шаг прохода — так лента снята на телефоне): та же пара */
    const rv = only(xo, ['m05', 'm07']); rv.items.unshift({ id: 'm09', kind: 'reveal', trigger: 'scroll', target: 'div.hero__ribbon', count: 1, i: 48, visAtStart: true, props: [{ prop: 'сдвиг Y', from: '-19.3 px', to: '-54 px' }, { prop: 'сдвиг X', from: '31.4 px', to: '88 px' }, { prop: 'масштаб', from: '1.17', to: '1.48' }, { prop: 'поворот', from: '1.8°', to: '5°' }], scroll: { at: 'верх блока между 8% и -17% высоты экрана', atPct: -4 }, timing: {} });
    const x2 = compare(xd, rv, {});
    C(st(x2, 'm01') === 'ЕСТЬ, ДРУГИМ ВИДОМ m09' && /«появление»/.test(row(x2, 'm01').notes.join('; ')), 'привязано к прокрутке ↔ появление (без прозрачности, виден с начала) — «ЕСТЬ, ДРУГИМ ВИДОМ»', say(x2, 'm01'));
    /* ложная пара: те же числа, но у нас это параллакс в подвале, а у донора — первый экран */
    const foot = only(xo, ['m05']); foot.items.push({ ...clone(it(xo, 'm01')), id: 'm09', target: 'img.foot__ribbon', i: 600, props: [...it(xo, 'm01').props, ...it(xo, 'm02').props], place: { y: 9800, h: 500, screen: 11, of: 12, first: false } });
    const x3 = compare(xd, foot, {});
    C(st(x3, 'm01') === 'НЕТ' && /место другое: у донора первый экран, у нас экран 11 из 12/.test(row(x3, 'm01').notes.join('; ')), 'у донора лента первого экрана, у нас такой же параллакс в подвале — НЕТ, в строке — «место другое»', say(x3, 'm01'));
    /* протоколы без place (сняты до 02.10): точное повторение — пара с пометкой, числа врозь — НЕТ с подсказкой */
    const x4 = compare(noPlace(xd), noPlace(xo), {});
    C(st(x4, 'm01') === 'ЕСТЬ, ДРУГИМ ВИДОМ m01+m02' && /место на странице не сверено/.test(row(x4, 'm01').notes.join('; ')), 'протокол донора без place: точное повторение — пара с пометкой «место на странице не сверено»', say(x4, 'm01'));
    /* …и вердикт такой сверки не лучше WARN: «есть» по одним числам никто не перепроверит. Решение на строку — подтверждение */
    const x4w = compare(noPlace(only(xd, ['m01', 'm02', 'm04'])), noPlace(only(xo, ['m01', 'm02', 'm05', 'm07'])), {}), x4d = compare(noPlace(only(xd, ['m01', 'm02', 'm04'])), noPlace(only(xo, ['m01', 'm02', 'm05', 'm07'])), { m01: 'есть: лента первого экрана', m02: 'есть: строка', m04: 'есть: .btn:hover' });
    C(x4w.verdict === 'WARN' && x4w.unplaced === 3 && x4w.miss === 0 && x4w.diff === 0 && x4w.rows.every((r) => r.status === 'ЕСТЬ, ДРУГИМ ВИДОМ' && r.unplaced && rowLevel(r) === 'OK') && x4w.warnings.some((w) => /место на странице не сверено у пар m01 → m01\+m02, m02 → m05, m04 → m07/.test(w)) && x4d.verdict === 'OK' && x4d.unplaced === 0 && x4d.notes.some((n) => /решения подтверждают пары, у которых место на странице не сверено: «m01», «m02», «m04»/.test(n)) && !x4d.notes.some((n) => /не понадобились/.test(n)),
      'три пары другим видом без сверки места (лента, строка, наведение): строки «ЕСТЬ, ДРУГИМ ВИДОМ», вердикт WARN с названными парами; решение на строку подтверждает пару — вердикт OK, и оно не «лишнее»', `${x4w.verdict}, без места ${x4w.unplaced}: ${(x4w.warnings[0] || 'предупреждения нет').slice(0, 140)}; с решениями: ${x4d.verdict} · ${x4d.notes.join(' | ').slice(0, 200)}`);
    C(st(x4, 'm05') === 'НЕТ' && /похожее у нас: m04/.test(row(x4, 'm05').notes.join('; ')) && /место на странице не сверено/.test(row(x4, 'm05').notes.join('; ')), 'протокол без place и числа врозь — НЕТ (не «отличается»): без места похожим окажется любой параллакс; в строке — что похоже и почему не засчитано', say(x4, 'm05'));
    /* у нас только появление карточек внизу страницы — ленте донора не пара (у нас проявление, свойств донора нет) */
    const cards = only(xo, ['m08']); const x5 = compare(xd, cards, {}), x5n = compare(noPlace(xd), noPlace(cards), {});
    C(st(x5, 'm01') === 'НЕТ' && st(x5, 'm05') === 'НЕТ' && st(x5n, 'm01') === 'НЕТ' && st(x5n, 'm05') === 'НЕТ', 'у донора ленты по прокрутке, у нас только появление карточек в подвале — НЕТ (и с place, и без)', `${st(x5, 'm01')}; ${st(x5, 'm05')}; без place: ${st(x5n, 'm01')}; ${st(x5n, 'm05')}`);
    /* лента донора едет вверх на 100 px, у нас карточки появляются со сдвигом на те же 100 px в том же месте страницы:
       числа рядом, но у нас блок проявляется (прозрачность 0 → 1), у донора — нет: появление, а не лента */
    const up = { ...clone(xd), items: [{ ...clone(it(xd, 'm05')), id: 'm01', count: 1, props: [{ prop: 'сдвиг Y', from: '100 px', to: '0 px' }] }] };
    const x5b = compare(up, cards, {});
    C(st(x5b, 'm01') === 'НЕТ', 'лента донора со сдвигом Y 100 → 0 px и наше появление карточек с тем же сдвигом и прозрачностью 0 → 1 в том же месте — НЕТ', say(x5b, 'm01'));
    /* бегущая строка донора ↔ у нас только парение или пульс; парение донора ↔ у нас только строка — уже в x1 (m07) */
    const float = { ...clone(xo), items: [{ ...clone(it(xd, 'm07')), id: 'm01', target: 'img.hero__badge' }, { id: 'm02', kind: 'loop', sub: 'пульс', trigger: 'time', target: 'span.dot', count: 1, props: [{ prop: 'кадры', from: '', to: '50%: transform: scale(1.2)' }], timing: { period: 1600 }, source: 'css @keyframes pulse' }] };
    const x6 = compare(only(xd, ['m02', 'm03']), float, {});
    C(st(x6, 'm02') === 'НЕТ' && st(x6, 'm03') === 'НЕТ', 'у донора бегущая строка, у нас парящий значок и пульс — НЕТ', `${st(x6, 'm02')}; ${st(x6, 'm03')}`);
    /* петля донора не по кругу: тот же длинный путь туда-обратно (alternate) и короткий сдвиг в одну сторону — не строка */
    const swing = { ...clone(xd), items: [{ ...clone(it(xd, 'm02')), id: 'm01', timing: { ...it(xd, 'm02').timing, direction: 'alternate' } }, { ...clone(it(xd, 'm02')), id: 'm02', props: [{ prop: 'сдвиг X', from: '0 px', to: '-40 px' }], keyframes: undefined }] };
    const x6b = compare(swing, only(xo, ['m05']), {});
    C(st(x6b, 'm01') === 'НЕТ' && st(x6b, 'm02') === 'НЕТ', 'петля донора туда-обратно на 2254 px и петля в одну сторону на 40 px — бегущей строке не пара', `${st(x6b, 'm01')}; ${st(x6b, 'm02')}`);
    /* скорость: вдвое — «ОТЛИЧАЕТСЯ» и между видами, и у двух бегущих строк (раньше строка со строкой — OK при любых числах) */
    const fast = clone(xo); it(fast, 'm05').timing.speed = '240 px/с влево';
    const x7 = compare(only(xd, ['m02']), fast, {});
    const mm = compare({ ...clone(xd), items: [{ ...clone(it(xo, 'm05')), id: 'm01', timing: { speed: '40 px/с влево' } }] }, { ...clone(xo), items: [{ ...clone(it(xo, 'm05')), timing: { speed: '400 px/с влево' } }] }, {});
    C(st(x7, 'm02') === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m05' && /скорость: у донора 113 px\/с, у нас 240 px\/с/.test(row(x7, 'm02').diffs.join('; ')) && st(mm, 'm01') === 'ОТЛИЧАЕТСЯ m05' && /скорость: у донора 40 px\/с, у нас 400 px\/с/.test(row(mm, 'm01').diffs.join('; ')), 'скорость строки вдвое и больше — «ОТЛИЧАЕТСЯ»: 113 и 240 px/с между видами, 40 и 400 px/с у двух бегущих строк', `${say(x7, 'm02')} · ${say(mm, 'm01')}`);
    /* отрезок прокрутки: 600 px у донора и 3000 px у нас при тех же числах свойств — «ОТЛИЧАЕТСЯ» */
    const far = only(xo, ['m04']); Object.assign(it(far, 'm04'), { props: clone(it(xd, 'm05').props), scroll: { ...it(far, 'm04').scroll, rangePx: 3000 } });
    const x8 = compare(only(xd, ['m05']), far, {});
    C(st(x8, 'm05') === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m04' && /отрезок прокрутки: у донора 600 px, у нас 3000 px/.test(row(x8, 'm05').diffs.join('; ')), 'отрезок прокрутки 600 px против 3000 px — «ОТЛИЧАЕТСЯ»', say(x8, 'm05'));
    /* одно наше движение — одно донорское: три ленты донора с одними числами на трёх разделах и один наш параллакс */
    const three = { ...clone(xd), items: [1, 2, 3].map((q) => ({ ...clone(it(xd, 'm05')), id: `m0${q}`, target: `#rec${q} [data-elem-id="9"]`, count: 1, props: [{ prop: 'сдвиг Y', from: '0 px', to: '-60 px' }, { prop: 'масштаб', from: '1', to: '1.14' }] })) };
    const x9 = compare(three, only(xo, ['m04']), {});
    const got9 = x9.rows.map((r) => r.status);
    C(got9.filter((s) => s === 'ЕСТЬ, ДРУГИМ ВИДОМ').length === 1 && got9.filter((s) => s === 'НЕТ').length === 2 && x9.rows.filter((r) => r.status === 'НЕТ').every((r) => /одно наше движение не закрывает два разных донорских/.test(r.notes.join('; '))), 'три ленты донора на трёх разделах и один наш параллакс — закрыта одна, две — НЕТ с причиной', got9.join(' / '));
    /* то же у пары одного вида с разницей: наше движение, которое «отличается» от двух донорских, остаётся парой одному */
    const two = { ...clone(xd), items: [{ ...clone(it(xd, 'm06')), id: 'm01', props: [{ prop: 'поворот', from: '0°', to: '259°' }] }, { ...clone(it(xd, 'm06')), id: 'm02', target: '#rec2 [data-elem-id="8"]', props: [{ prop: 'поворот', from: '0°', to: '90°' }] }] };
    const oneSl = { ...clone(xo), items: [{ id: 'm01', kind: 'scroll-linked', trigger: 'scroll', target: 'img.sec__ribbon', count: 1, i: 364, props: [{ prop: 'поворот', from: '0°', to: '-14°' }], scroll: { rangePx: 900, startPct: 56, endPct: -11 } }] };
    const x10 = compare(two, oneSl, {}).rows.map((r) => r.status);
    C(x10.filter((s) => s === 'ОТЛИЧАЕТСЯ').length === 1 && x10.filter((s) => s === 'НЕТ').length === 1, 'пара одного вида с разницей: одно наше «отличается» только от одного донорского, второе — НЕТ (раньше — два WARN)', x10.join(' / '));
    /* наведение: роль другая (у нас тот же переход фона, но на карточке) — не пара; из двух наших кнопок — ближайшая по цвету */
    const card = { ...clone(xo), items: [{ ...clone(it(xo, 'm07')), id: 'm01', component: 'card', target: 'a.cat' }] };
    const chips = { ...clone(xo), items: [{ ...clone(it(xo, 'm07')), id: 'm01', target: 'a.chip.chip--on', props: [{ prop: 'фон', from: 'rgb(226, 248, 205)', to: 'rgb(31, 85, 48)' }, { prop: 'цвет', from: 'rgb(31, 85, 48)', to: 'rgb(255, 255, 255)' }, { prop: 'рамка', from: 'rgb(31, 85, 48)', to: 'rgb(255, 255, 255)' }] }, { ...clone(it(xo, 'm07')), id: 'm02' }] };
    const xh1 = compare(only(xd, ['m04']), card, {}), xh2 = compare(only(xd, ['m04']), chips, {});
    C(st(xh1, 'm04') === 'НЕТ' && st(xh2, 'm04') === 'ЕСТЬ, ДРУГИМ ВИДОМ m02', 'наведение на кнопку донора: у нас тот же переход на карточке — НЕТ; из двух наших кнопок — ближайшая по цвету (a.btn), а не первая', `${st(xh1, 'm04')}; ${st(xh2, 'm04')}`);
    /* вход при загрузке без единого общего свойства — другое движение (служебный переход рамки кнопки Tilda и вход нашего
       заголовка); с общим свойством — «отличается», как было (стрелка слайдера донора и точка слайдера у нас: фон) */
    const ent = (id, target, props, duration) => ({ id, kind: 'entrance', trigger: 'load', target, count: 1, props: props.map((p) => ({ prop: p, from: '', to: '' })), timing: { duration } });
    const x12 = compare({ ...clone(xd), items: [ent('m01', 'span.tn-atom__button-border', ['column-rule-width', 'outline-width'], 200), ent('m02', 'div.slider-arrow', ['background-color', 'border-top-color'], 200)] },
      { ...clone(xo), items: [ent('m01', 'h2.h-caps.is-in', ['opacity', 'transform'], 1000), ent('m02', 'button.mh-hero__dot', ['background-color'], 300)] }, {});
    C(st(x12, 'm01') === 'НЕТ' && st(x12, 'm02') === 'ОТЛИЧАЕТСЯ m02', 'вход при загрузке без единого общего свойства — НЕТ (раньше — «отличается»); с общим свойством — ОТЛИЧАЕТСЯ, как было', `${st(x12, 'm01')}; ${st(x12, 'm02')}`);
    /* === доводка 02.10 после независимой проверки: ловушки, на которых сверка находила движение в постороннем, и условия,
       поломку которых selftest не замечал (мутационная проверка: 13 из 21) === */
    {
      const mk = (kind, id, target, props, place, more = {}) => ({ id, kind, trigger: 'scroll', target, count: 1, props: props.map(([prop, from, to]) => ({ prop, from, to })), timing: {}, ...(place ? { place } : {}), ...more });
      const at = (y, of = 12, h = 300) => ({ y, h, screen: Math.floor(y / 900) + 1, of, first: Math.min(y + h, 900) - Math.max(y, 0) >= Math.min(h, 900) * 0.25 });
      const D = (...items) => ({ ...clone(xd), items }), O = (...items) => ({ ...clone(xo), items });
      const one = (d, o, dec = {}) => { const c = compare(D(d), O(...[o].flat()), dec, { screen: 'desktop' }); const r = c.rows[0]; return { c, r, s: `${r.status}${r.os.length ? ` ${oursOf(r)}` : ''}`, t: [...r.diffs, ...r.notes].join('; ') }; };
      const Y = [['сдвиг Y', '0 px', '-100 px'], ['масштаб', '1', '1.2']];
      const dS = (place, props = Y, more = {}) => mk('scroll-linked', 'm01', '#rec1 [data-elem-id="1"]', props, place, { scroll: { rangePx: 600 }, ...more });
      const oP = (place, props = Y, more = {}) => mk('parallax', 'm01', 'img.sec__pic', props, place, { i: 40, scroll: { rangePx: 600 }, ...more });
      /* числа пары другим видом: размах и конец значения — каждый допуск своим случаем */
      const nSpan = one(dS(at(3000)), oP(at(3000), [['сдвиг Y', '-70 px', '-100 px'], ['масштаб', '1', '1.2']])), nEnd = one(dS(at(3000)), oP(at(3000), [['сдвиг Y', '0 px', '-140 px'], ['масштаб', '1', '1.2']])), nOk = one(dS(at(3000)), oP(at(3000), [['сдвиг Y', '-20 px', '-110 px'], ['масштаб', '1', '1.2']]));
      C(nSpan.s === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m01' && nEnd.s === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m01' && nOk.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01', 'допуски чисел у пары другим видом: размах втрое меньше донорского (−70 → −100 против 0 → −100) и конец на 40% дальше (−140 против −100) — «ОТЛИЧАЕТСЯ»; размах 90% и конец +10% — «ЕСТЬ»', `размах: ${nSpan.s}; конец: ${nEnd.s}; рядом: ${nOk.s}`);
      const nSide = one(dS(at(3000)), oP(at(3000), [['сдвиг Y', '0 px', '100 px'], ['масштаб', '1', '1.2']]));
      C(nSide.s === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m01' && /сдвиг Y — в другую сторону: у донора 0 px → -100 px, у нас 0 px → 100 px/.test(nSide.t), 'сдвиг в другую сторону (−100 и +100 px) — «ОТЛИЧАЕТСЯ» со словами «в другую сторону»', `${nSide.s} — ${nSide.t.slice(0, 160)}`);
      const fOut = one(dS(at(3000), [['прозрачность', '1', '0'], ['масштаб', '1', '1.2']]), oP(at(3000), [['прозрачность', '0', '1'], ['масштаб', '1', '1.2']]));
      C(fOut.s === 'НЕТ', 'у донора блок исчезает (прозрачность 1 → 0), у нас появляется (0 → 1) — разные движения, не пара', fOut.s);
      const rail = one(dS(at(3000), [['сдвиг X', '0 px', '-500 px'], ['масштаб', '1', '1.2']], { sub: 'лента вбок' }), oP(at(3000), [['сдвиг X', '0 px', '-500 px'], ['масштаб', '1', '1.2']]));
      C(rail.s === 'НЕТ', '«лента вбок» донора и наш параллакс с тем же сдвигом X — не пара: лента вбок в пары другого вида не идёт', rail.s);
      const long = one(dS(at(3000), Y, { scroll: { rangePx: 3000 } }), mk('reveal', 'm01', 'img.sec__pic', Y, at(3000), { i: 40 }));
      C(long.s === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m01' && /у нас движение уложилось в один-два шага прохода/.test(long.t), 'отрезок донора 3000 px (больше экрана) против нашего «появления» (отрезок — шаг прохода) — «ОТЛИЧАЕТСЯ»', `${long.s} — ${long.t.slice(0, 160)}`);
      const sameRange = one(dS(at(3000), Y, { scroll: { rangePx: 200 } }), mk('scroll-linked', 'm01', 'img.sec__pic', Y, at(3000), { i: 40, scroll: { rangePx: 3000 } }));
      C(sameRange.s === 'ОТЛИЧАЕТСЯ m01' && /отрезок прокрутки: у донора 200 px, у нас 3000 px/.test(sameRange.t), 'пара одного вида: отрезок прокрутки 200 px против 3000 px (процентов в протоколе нет) — «ОТЛИЧАЕТСЯ»', `${sameRange.s} — ${sameRange.t.slice(0, 140)}`);
      /* лишние свойства у нас — «ОТЛИЧАЕТСЯ», а не «ЕСТЬ» */
      const more = one(dS(at(300), [['масштаб', '1', '1.5']]), oP(at(300), [['сдвиг Y', '0 px', '-600 px'], ['поворот', '0°', '180°'], ['масштаб', '1', '1.45']]));
      C(more.s === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m01' && rowLevel(more.r) === 'WARN' && /у нас меняется ещё сдвиг Y 0 px → -600 px; поворот 0° → 180° — у донора этого нет/.test(more.t), 'числа донора на месте (масштаб 1 → 1.5 и 1.45), но у нас ещё сдвиг на 600 px и разворот на 180° — «ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ» (WARN), а не «ЕСТЬ»', `${more.s} — ${more.t.slice(0, 200)}`);
      /* место: три мерки (от начала, доля страницы, от конца), первый экран — только по расстоянию от начала */
      const pMid = one(dS(at(4500, 11)), oP(at(5850, 13))), pTail = one(dS(at(3240, 5)), oP(at(10800, 13))), pHero = one(dS(at(40, 11)), oP(at(1260, 13))), pFar = one(dS(at(2700, 11)), oP(at(9000, 13))), pEdge = one(dS(at(760, 11, 600)), oP(at(740, 13, 600)));
      C(pMid.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01' && pTail.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01' && pEdge.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01' && /место: у донора низ первого экрана \(верх на 760 px/.test(pEdge.t),
        'место то же: середина страницы по доле высоты (экран 6 из 11 ↔ 7 из 13), конец страницы по расстоянию от конца (4 из 5 ↔ 13 из 13), граница первого экрана (верх на 760 и 740 px)', `середина: ${pMid.s}; конец: ${pTail.s}; граница: ${pEdge.s} — ${pEdge.t.slice(-110)}`);
      C(pHero.s === 'НЕТ' && /место другое: у донора первый экран, у нас экран 2 из 13/.test(pHero.t) && pFar.s === 'НЕТ' && /место другое: у донора экран 4 из 11, у нас экран 11 из 13/.test(pFar.t),
        'место другое: первый экран донора ↔ второй экран у нас (полтора экрана ниже; «та же доля страницы» первому экрану не мерка), 4-й экран из 11 ↔ 11-й из 13 — НЕТ', `первый экран: ${pHero.s} — ${pHero.t.slice(0, 120)}; середина и конец: ${pFar.s} — ${pFar.t.slice(0, 120)}`);
      /* «появление» из протокола до 02.10: места нет, известно только «виден с начала» — первый экран сверяется и так */
      const rvOld = (vis) => mk('reveal', 'm01', 'img.sec__pic', Y, null, { i: 40, visAtStart: vis });
      const vTop = one(dS(at(40, 11)), rvOld(true)), vLow = one(dS(at(40, 11)), rvOld(false)), vEdge = one(dS(at(760, 11, 600)), rvOld(true)), vDeep = one(dS(at(4000, 11)), rvOld(false));
      C(vTop.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01' && !vTop.r.unplaced && vLow.s === 'НЕТ' && /место другое: у донора первый экран, у нас ниже первого экрана/.test(vLow.t) && vEdge.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01' && !vEdge.r.unplaced && vDeep.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01' && vDeep.r.unplaced && /известно только «ниже первого экрана»/.test(vDeep.t),
        'наше «появление» без места (протокол до 02.10): «виден с начала» ↔ первый экран донора и его граница — место то же; «не виден с начала» ↔ первый экран — НЕТ; оба ниже первого экрана — место не сверено', `виден: ${vTop.s}${vTop.r.unplaced ? ' (не сверено)' : ''}; не виден: ${vLow.s}; граница: ${vEdge.s}${vEdge.r.unplaced ? ' (не сверено)' : ''}; оба ниже: ${vDeep.s}${vDeep.r.unplaced ? ' (не сверено)' : ''}`);
      /* место у пары одного вида; наша строка ×N стоит в нескольких местах — её место не сверяется */
      const sFar = one(dS(at(40, 11)), mk('scroll-linked', 'm01', 'img.foot__pic', Y, at(10300, 13), { i: 40, scroll: { rangePx: 600 } })), sMany = one(dS(at(40, 11)), mk('scroll-linked', 'm01', 'img.bit', Y, at(10300, 13), { i: 40, count: 3, scroll: { rangePx: 600 } }));
      C(sFar.s === 'НЕТ' && /вид тот же, но место другое: у донора первый экран, у нас экран 12 из 13/.test(sFar.t) && sMany.s === 'OK m01', 'пара одного вида: лента первого экрана донора ↔ такая же привязка в нашем подвале — НЕТ «место другое»; наша строка ×3 (место — у первого из трёх) — пара, как было', `${sFar.s} — ${sFar.t.slice(0, 140)}; ×3: ${sMany.s}`);
      /* место не сверено: пара — только по примете (два свойства, не считая проявления «из ничего») */
      const bare = (x) => { const q = clone(x); delete q.place; return q; };
      const fade = [['прозрачность', '0', '1']];
      const w1 = one(bare(dS(null, fade)), mk('reveal', 'm01', 'h2.lead', fade, null, { i: 40 })), w2 = one(dS(at(4300), fade), mk('reveal', 'm01', 'h2.lead', fade, at(4400), { i: 40 })), w3 = one(bare(dS(null, [['сдвиг Y', '0 px', '-80 px']])), oP(null, [['сдвиг Y', '0 px', '-80 px']]));
      const w4 = one(mk('reveal', 'm01', 'div.framer-153kav9', [['прозрачность', '0.9', '0.51'], ['масштаб', '1.4', '1.11']], null, { sub: 'исчезает' }), mk('scroll-linked', 'm01', 'picture.custom__bg', [['прозрачность', '0.9', '0.5'], ['масштаб', '1.4', '1.1']], null, { i: 40, scroll: { rangePx: 675 } }));
      C(w1.s === 'НЕТ' && /совпало только «прозрачность 0 → 1», а место на странице не сверено[^;]*проявление «из ничего» совпадает у чего угодно/.test(w1.t) && w2.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01' && !w2.r.unplaced && w3.s === 'НЕТ' && /одно свойство совпадает у чего угодно/.test(w3.t),
        'место не сверено: совпала одна прозрачность 0 → 1 или одно свойство — НЕТ с причиной («совпадает у чего угодно»); та же прозрачность при сверенном месте — пара', `без места: ${w1.s} — ${w1.t.slice(0, 150)}; с местом: ${w2.s}; одно свойство: ${w3.s}`);
      C(w4.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01' && w4.r.unplaced && w4.c.verdict === 'WARN', 'место не сверено, совпали два свойства, одно — частичное проявление 0.9 → 0.51 (плашка у figurki): пара, вердикт WARN', `${w4.s}, без сверки места: ${w4.r.unplaced}, вердикт ${w4.c.verdict}`);
      /* закреплённый на экране элемент — не пара элементу в потоке страницы: ни другим видом, ни своим */
      const top = mk('reveal', 'm01', 'a.grow', fade, { y: 829, h: 54, screen: 1, of: 13, first: true, fixed: true }, { i: 559, scroll: { atPct: 92, fixed: true } });
      const f1 = one(dS(at(4300), fade), top), f2 = one(mk('reveal', 'm01', 'h2.about__lead', fade, at(4300)), top), f3 = one(mk('reveal', 'm01', 'button#toTop', fade, null, { scroll: { fixed: true } }), top);
      const f4 = one(dS(at(300)), oP({ y: 300, h: 200, screen: 1, of: 13, first: true, fixed: true }));           /* и с приметными числами: плавающая картинка — не лента раздела */
      C(f1.s === 'НЕТ' && f2.s === 'НЕТ' && f3.s === 'OK m01' && f4.s === 'НЕТ', 'закреплённая кнопка «наверх» (прозрачность 0 → 1) не закрывает проявление заголовка раздела — ни «привязано к прокрутке», ни «появление»; закреплённая картинка с числами ленты — тоже не пара; такая же кнопка донора — пара', `другим видом: ${f1.s}; тем же: ${f2.s}; закреплённый ↔ закреплённый: ${f3.s}; закреплённая картинка: ${f4.s}`);
      /* наведение по роли: длительность, набор свойств, прозрачный и залитый фон, закреплённость */
      const hD = it(xd, 'm04'), hO = it(xo, 'm07');
      const hov = (o, d = hD) => one({ ...clone(d), id: 'm01' }, { ...clone(o), id: 'm01' });
      const hSlow = hov({ ...hO, timing: { duration: 600, easing: 'ease' } }), hLess = hov({ ...hO, props: hO.props.filter((p) => p.prop !== 'рамка') });
      const dark = { ...clone(hD), props: [{ prop: 'фон', from: 'rgb(20, 20, 20)', to: 'rgb(200, 200, 200)' }] }, ghost = { ...clone(hO), props: [{ prop: 'фон', from: 'rgba(0, 0, 0, 0)', to: 'rgb(190, 190, 190)' }] };
      const hGhost = hov(ghost, dark), hFill = hov({ ...clone(hO), props: [{ prop: 'фон', from: 'rgb(30, 30, 30)', to: 'rgb(190, 190, 190)' }] }, dark);
      C(hSlow.s === 'НЕТ' && hLess.s === 'НЕТ' && hGhost.s === 'НЕТ' && hFill.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01', 'наведение по роли: длительность втрое (200 и 600 мс), у нас не меняется рамка, у нас кнопка-призрак (фон из прозрачного) — НЕТ; тёмная залитая кнопка, что светлеет так же, — пара', `длительность: ${hSlow.s}; без рамки: ${hLess.s}; призрак: ${hGhost.s}; залитая: ${hFill.s}`);
      const pin = (y) => ({ y, h: 44, screen: Math.floor(y / 900) + 1, of: 12, first: y < 900, fixed: true });
      const hHead = hov({ ...hO, place: pin(12) }), hBoth = hov({ ...hO, place: pin(9000) }, { ...hD, place: pin(4000) }), hLow = hov({ ...hO, place: at(2137, 13, 48) }), hNav = hov({ ...hO, component: 'nav' }), hNone = hov({ ...hO, component: '' });
      C(hHead.s === 'НЕТ' && hBoth.s === 'ЕСТЬ, ДРУГИМ ВИДОМ m01' && !hBoth.r.unplaced && /оба закреплены на экране/.test(hBoth.t) && hLow.s === 'НЕТ' && /наведение то же по роли и ходу цвета, но место другое: у донора первый экран, у нас экран 3 из 13/.test(hLow.t) && hNav.s === 'НЕТ' && hNone.s === 'НЕТ',
        'наведение по роли: кнопка в закреплённой шапке ↔ кнопка первого экрана — НЕТ; обе закреплены (sticky на 4000 и 9000 px) — пара, место не сравнивается; та же кнопка в третьем экране — НЕТ «место другое»; пункт меню и метка без вида с тем же фоном — НЕТ', `шапка: ${hHead.s}; обе закреплены: ${hBoth.s}; третий экран: ${hLow.s} — ${hLow.t.slice(0, 110)}; пункт меню: ${hNav.s}; без вида: ${hNone.s}`);
      /* бегущая строка: сторона, ось, скорость — и что из этого без сверенного места уже не «отличается» */
      const lD = it(xd, 'm02'), lO = it(xo, 'm05');
      const ln = (speed, { place = 'same', d = lD } = {}) => { const o = { ...clone(lO), id: 'm01', timing: { ...lO.timing, speed } }; const dd = { ...clone(d), id: 'm01' }; if (place === 'none') { delete o.place; delete dd.place; } return one(dd, o); };
      const lSide = ln('113 px/с вправо'), lNoSide = ln('113 px/с вправо', { place: 'none' }), lTwice = ln('240 px/с влево', { place: 'none' }), lWild = ln('500 px/с влево', { place: 'none' }), lUp = ln('113 px/с вверх');
      C(lSide.s === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m01' && /строка едет в другую сторону: у донора влево, у нас вправо/.test(lSide.t) && lTwice.s === 'ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ m01' && lNoSide.s === 'НЕТ' && /а место на странице не сверено/.test(lNoSide.t) && lWild.s === 'НЕТ' && /скорость: у донора 113 px\/с, у нас 500 px\/с, а место на странице не сверено/.test(lWild.t) && lUp.s === 'НЕТ',
        'бегущая строка другим видом: в другую сторону на том же месте — «ОТЛИЧАЕТСЯ»; без сверенного места скорость вдвое — «ОТЛИЧАЕТСЯ», а другая сторона или скорость больше чем втрое — НЕТ с причиной; строка вверх против строки вбок — НЕТ', `сторона: ${lSide.s}; без места — сторона: ${lNoSide.s}, вдвое: ${lTwice.s}, вчетверо: ${lWild.s} — ${lWild.t.slice(0, 120)}; вверх: ${lUp.s}`);
      const mq = { ...clone(lO), id: 'm01', target: '#rec1 [data-elem-id="7"]' };
      const mSide = ln('113 px/с вправо', { d: mq }), mFar = one({ ...mq, place: at(973, 11, 38) }, { ...clone(lO), id: 'm01', place: at(10900, 13, 80) }), mWild = ln('500 px/с влево', { d: mq, place: 'none' });
      const jsLoop = one({ id: 'm01', kind: 'loop', sub: 'колебание', trigger: 'time', target: 'div.jsline', count: 1, source: 'js', props: [{ prop: 'сдвиг X', from: '-300 px', to: '300 px' }], timing: { period: 4000 } }, { ...clone(lO), id: 'm01', timing: { ...lO.timing, speed: '150 px/с вправо' } });
      C(mSide.s === 'ОТЛИЧАЕТСЯ m01' && /строка едет в другую сторону/.test(mSide.t) && mFar.s === 'НЕТ' && /место другое: у донора экран 2 из 11, у нас экран 13 из 13/.test(mFar.t) && mWild.s === 'НЕТ' && jsLoop.s === 'НЕТ',
        'две бегущие строки: в другую сторону на том же месте — «ОТЛИЧАЕТСЯ»; строка под первым экраном донора и карусель в нашем подвале — НЕТ «место другое»; без места скорость вчетверо — НЕТ; петля на JS (ходит туда-обратно) строке не пара', `сторона: ${mSide.s}; подвал: ${mFar.s} — ${mFar.t.slice(0, 110)}; без места вчетверо: ${mWild.s}; петля на JS: ${jsLoop.s}`);
      /* число носителей: движение, которое стоит в одном месте, закрывает столько движений донора, сколько у нас элементов */
      const tri = (kind, props) => D(...[1, 2, 3].map((q) => mk(kind, `m0${q}`, `#rec${q} [data-elem-id="${q}"]`, props, null, { scroll: { rangePx: 600, startPct: 50, endPct: -17 } })));
      const cap = (kind, props, count) => compare(tri(kind, props), O(mk(kind, 'm01', 'img.sec__pic', props, null, { i: 40, count, scroll: { rangePx: 600, startPct: 50, endPct: -17 } })), {}).rows.map((r) => r.status).join(' / ');
      const c1 = cap('scroll-linked', Y, 1), c3 = cap('scroll-linked', Y, 3), cr = cap('reveal', [['прозрачность', '0', '1'], ['сдвиг Y', '100 px', '0 px']], 1);
      C(c1 === 'OK / НЕТ / НЕТ' && c3 === 'OK / OK / OK' && cr === 'OK / OK / OK', 'три привязки к прокрутке донора на трёх разделах с одними числами ↔ одна наша — одна OK, две НЕТ (раньше три OK); наша строка ×3 закрывает три; появления делят одно наше, как было', `одна наша: ${c1}; ×3: ${c3}; появления: ${cr}`);
      /* ловушки независимой проверки — выжимки протоколов в fixtures/motion/compare-traps.json; ограничения — заметкой */
      const traps = readJson(path.join(HERE, 'fixtures', 'motion', 'compare-traps.json')) || { cases: [] };
      const seen = {};
      for (const t of traps.cases) {
        const c = compare(t.donor, t.ours, t.decisions || {}, { screen: t.donor.viewport || 'desktop' }); seen[t.name] = c;
        const got = c.rows.map((r) => r.status).join(' / ');
        if (t.limit) { console.log(`INFO сверка, ограничение ${t.name}: ${t.title} — ${got} (${t.limit})`); continue; }
        C(got === t.expect.join(' / ') && c.verdict === t.verdict, `ловушка ${t.name}: ${t.title} — ${t.expect.join(' / ')}, вердикт ${t.verdict}`, `${got}, вердикт ${c.verdict} — ${[...c.rows[0].diffs, ...c.rows[0].notes].join('; ').slice(0, 200)}`);
      }
      C(traps.cases.length >= 33, 'фикстура ловушек на месте (compare-traps.json, 33 случая)', `случаев ${traps.cases.length}`);
      const tn = (name) => (seen[name] ? seen[name].notes.join(' | ') : 'ловушки нет');
      C(/значения не строкой решением не считаются: «m01» \(false\), «m02» \(0\)/.test(tn('t7a-decision-false-zero')) && /экран в ключе пишется строчными[^|]*«m01:Desktop» → «m01:desktop»/.test(tn('t7b-decision-typos')) && /ничего не закрыли[^|]*«m1:desktop», «M02», «m02 »/.test(tn('t7b-decision-typos')) && /«loop» — вида «петля» с такой подписью у донора нет, а «бегущая строка» есть \(m01\): ключ «marquee»/.test(tn('t8b-kind-key-new-donor')),
        'решения: false и 0 — не решения (названы); экран в ключе другим регистром («m01:Desktop») — сказано, как писать; ключ вида «loop» после того, как строки стали «бегущей строкой», — подсказан ключ «marquee»', `${tn('t7a-decision-false-zero').slice(0, 120)} · ${tn('t7b-decision-typos').slice(0, 200)} · ${tn('t8b-kind-key-new-donor').slice(0, 160)}`);
      /* решения по номеру: отпечаток строки донора вместо времени файла. Донор переснят, в начале новая строка — номера +1 */
      const dec = { m03: 'второй строки нет: один ряд разделов', m06: 'фигур раздела отзывов у нас нет', 'loop:[data-elem-id="1765713300901"]': 'парящего значка нет' };
      const b1 = compare(xd, xo, dec, { screen: 'desktop', prints: {} });
      const prints = Object.fromEntries(b1.binds.map((b) => [b.key, b.print]));
      C(b1.binds.map((b) => b.key).join(' ') === 'm03 m06' && b1.stale.length === 0 && prints.m03.kind === 'loop' && prints.m03.target === it(xd, 'm03').target && prints.m06.props.join() === 'поворот' && b1.notes.some((n) => /решения по номеру привязаны к движениям донора[^|]*m03 — петля \(парение\) #rec1689764921[^|]*m06 — привязано к прокрутке #rec1690088711[^|]*×3/.test(n)) && row(b1, 'm07').key === 'loop:[data-elem-id="1765713300901"]',
        'первое применение решения по номеру — отпечаток строки донора (вид, подпись, число элементов, свойства) и заметка, к чему привязано; ключ по виду и подписи отпечатка не требует (и пишется без пробела в начале)', `${b1.binds.map((b) => `${b.key}: ${b.print.what}`).join('; ')} · ${b1.notes.join(' | ').slice(0, 200)}`);
      const shifted = clone(xd); shifted.items.unshift({ id: 'm00', kind: 'entrance', trigger: 'load', target: 'div.promo-banner', count: 1, props: [{ prop: 'opacity', from: '', to: '' }], timing: { duration: 400 } }); shifted.items.forEach((x, q) => { x.id = `m${String(q + 1).padStart(2, '0')}`; });
      const b2 = compare(shifted, xo, dec, { screen: 'desktop', prints });
      const wb = b2.warnings.join(' | ');
      C(b2.stale.map((s2) => s2.key).join(' ') === 'm03 m06' && !row(b2, 'm03').decision && !row(b2, 'm06').decision && row(b2, 'm04').status === 'НЕТ' && row(b2, 'm07').status === 'НЕТ' && row(b2, 'm08').status === 'РЕШЕНО' && b2.binds.length === 0
        && /решение «m03» не применено: оно записано для «петля \(парение\) #rec1689764921 \[data-elem-id="1765713841547"\]», а сейчас под этим номером «петля \(парение\) #rec1689728881 \[data-elem-id="1765713300876"\]»[^|]*То движение теперь m04[^|]*"loop:\[data-elem-id="1765713841547"\]:desktop" \(от номеров не зависит\) — или на новый номер "m04:desktop"/.test(wb) && /решение «m03» не применено: оно записано для/.test(row(b2, 'm03').notes.join('; ')) && b2.verdict === 'FAIL',
        'донор переснят, номера сдвинулись на один: решения по номеру к другому движению НЕ применены — WARN с обоими движениями, новым номером и ключом по виду и подписи; строки без решения остаются «НЕТ»; ключ по виду и подписи работает как работал', `не применены: ${b2.stale.map((s2) => s2.key).join(' ') || '—'}; m03: ${row(b2, 'm03').decision || 'без решения'}; m04: ${row(b2, 'm04').status}; m08: ${row(b2, 'm08').status} · ${wb.slice(0, 330)}`);
      /* донор переснят без сдвига — тревоги нет (проверка по времени файла её поднимала); вид строки сменился петля → бегущая строка — то же движение */
      const again = clone(xd); again.takenAt = new Date(Date.now() + 3600e3).toISOString(); Object.assign(it(again, 'm03'), { kind: 'marquee', sub: undefined, props: [{ prop: 'сдвиг X', from: '0 px', to: '-3286.8 px' }], timing: { ...it(again, 'm03').timing, speed: '164 px/с влево' } });
      const b3 = compare(again, xo, dec, { screen: 'desktop', prints });
      C(b3.stale.length === 0 && b3.binds.length === 0 && row(b3, 'm03').decision === dec.m03 && row(b3, 'm06').status === 'РЕШЕНО' && !b3.warnings.some((w) => /не применено|сдвин/.test(w)) && !b3.notes.some((n) => /привязаны к движениям/.test(n)),
        'донор переснят без сдвига номеров (и бегущая строка Tilda теперь «бегущая строка», а не «петля») — решения по номеру применены, тревоги нет', `не применены: ${b3.stale.length}; m03: ${row(b3, 'm03').status} ${row(b3, 'm03').key || ''}; m06: ${row(b3, 'm06').status} · ${b3.warnings.join(' | ').slice(0, 160) || 'предупреждений нет'}`);
      /* решение переписали под нынешнее движение (другой текст под тем же номером) — привязывается заново */
      const b4 = compare(shifted, xo, { ...dec, m03: 'первая строка у нас есть' }, { screen: 'desktop', prints });
      C(b4.stale.map((s2) => s2.key).join(' ') === 'm06' && row(b4, 'm03').decision === 'первая строка у нас есть' && b4.binds.length === 1 && b4.binds[0].key === 'm03' && b4.notes.some((n) => /текст решения по номеру переписан — привязано заново: m03 — теперь «петля \(парение\) #rec1689728881[^|]*было «петля \(парение\) #rec1689764921/.test(n)),
        'текст решения под номером переписан — это новое решение: привязано заново к нынешнему движению, с заметкой «было — стало»; соседнее старое решение по-прежнему не применено', `не применены: ${b4.stale.map((s2) => s2.key).join(' ') || '—'}; m03: ${row(b4, 'm03').decision || 'без решения'}; ${b4.notes.join(' | ').slice(0, 260)}`);
    }
    /* то же у видов без «места» (вход при загрузке): пара с разницей наше движение не делит — два входа донора «отличаются» от одного нашего по очереди */
    const x13 = compare({ ...clone(xd), items: [ent('m01', 'div.slider-arrow', ['background-color', 'border-top-color'], 200), ent('m02', 'div.slider-count', ['background-color', 'outline-color'], 200)] }, { ...clone(xo), items: [ent('m01', 'button.mh-hero__dot', ['background-color'], 300)] }, {}).rows.map((r) => r.status).join(' / ');
    C(x13 === 'ОТЛИЧАЕТСЯ / НЕТ', 'два входа при загрузке донора «отличаются» от одного нашего — пара одному, второму НЕТ', x13);
    /* экраны разные: донор снят на телефоне, наш — на широком экране */
    const x11 =compare({ ...clone(only(xd, ['m02'])), viewport: 'mobile' }, only(xo, ['m05']), {}, { screen: 'mobile' });
    C(x11.verdict === 'WARN' && x11.warnings.some((w) => /экраны разные: донор снят на mobile, наш сайт — на desktop/.test(w)), 'протокол донора mobile против нашего desktop — предупреждение и вердикт не лучше WARN', `${x11.verdict}: ${x11.warnings.join('; ') || 'предупреждений нет'}`);
    /* решения: ключ с экраном сильнее ключа без экрана и действует только на своём экране; ключ без экрана — на любом */
    const dec = { _about: 'служебный ключ — не решение', 'm03:desktop': 'второй строки нет: один ряд разделов', m03: 'на телефоне блока нет', 'scroll-linked:desktop': 'фигур раздела отзывов у нас нет', m07: 'парящего значка нет', 'm06:mobile': 'для телефона', m99: 'лишний', 'm05:tablet': 'для планшета', 'reveal:div.nope': 'не та подпись', m01: 'есть: лента первого экрана', 'm02:desktop': '   ' };
    const xdD = compare(xd, xo, dec, { screen: 'desktop' }), xdM = compare(xd, xo, dec, { screen: 'mobile' });
    const k = (c, id) => `${row(c, id).status} ${row(c, id).key || '—'}`;
    C(k(xdD, 'm03') === 'РЕШЕНО m03:desktop' && row(xdD, 'm03').decision === 'второй строки нет: один ряд разделов' && k(xdM, 'm03') === 'РЕШЕНО m03' && row(xdM, 'm03').decision === 'на телефоне блока нет', 'ключ с экраном «m03:desktop» — для desktop, там же ключ без экрана «m03» — для остальных экранов', `desktop: ${k(xdD, 'm03')}; mobile: ${k(xdM, 'm03')}`);
    C(k(xdD, 'm06') === 'РЕШЕНО scroll-linked:desktop' && k(xdM, 'm06') === 'РЕШЕНО m06:mobile' && k(xdD, 'm07') === 'РЕШЕНО m07' && k(xdM, 'm07') === 'РЕШЕНО m07', 'вид с экраном («scroll-linked:desktop») и номер с экраном («m06:mobile») — каждый на своём экране; ключ без экрана — на обоих', `desktop: ${k(xdD, 'm06')}, ${k(xdD, 'm07')}; mobile: ${k(xdM, 'm06')}, ${k(xdM, 'm07')}`);
    const nD = xdD.notes.join(' | ');
    C(/записано дважды с разным текстом: «m03:desktop» и «m03»/.test(nD) && /по номеру без экрана: m01, m07/.test(nD) && /не понадобились — пара нашлась сама: «m01»/.test(nD), 'конфликт ключей и решения по номеру без экрана — понятной заметкой; решение при найденной паре — «не понадобилось»', nD.slice(0, 400));
    C(/пустые решения не засчитаны: «m02:desktop»/.test(nD) && /ничего не закрыли[^|]*«m99», «reveal:div\.nope»/.test(nD) && !/m05:tablet|m06:mobile|_about/.test(nD.split('ничего не закрыли')[1] || '') && row(xdD, 'm02').status === 'ЕСТЬ, ДРУГИМ ВИДОМ', 'пустое решение не засчитано; ключи несуществующего номера и подписи названы; ключи других экранов и служебные — молча', nD.slice(0, 500));
    const xE = compare(xd, xo, { m06: '   ', m07: '' }, { screen: 'desktop' });
    C(st(xE, 'm06') === 'НЕТ' && st(xE, 'm07') === 'НЕТ' && xE.miss === 3, 'пустое решение (пробелы, пустая строка) строку не закрывает — остаётся НЕТ', `${st(xE, 'm06')}; ${st(xE, 'm07')}; нет ${xE.miss}`);
    /* старый файл решений прошлого прогона (ключи — номера без экрана) на новой сверке: закрывает те же строки, что и раньше */
    const old = { m03: 'есть: вторая бегущая строка', m06: 'вращение не берём' }; const xOld = compare(xd, xo, old, { screen: 'desktop' });
    C(k(xOld, 'm03') === 'РЕШЕНО m03' && k(xOld, 'm06') === 'РЕШЕНО m06' && xOld.rows.filter((r) => r.key).length === 2, 'файл решений без экранов работает как раньше: номер закрывает свою строку и только её', xOld.rows.filter((r) => r.key).map((r) => `${r.d.id}←${r.key}`).join(', '));
    /* имена страниц: адрес и та же страница в --pages — один протокол с именем типа */
    const p1 = planPages(['https://x.ru'], 'home=/', ['desktop'], 'site'), p2 = planPages(['https://x.ru/'], 'home=/,about=/about', ['desktop', 'mobile'], 'site'), p3 = planPages(['https://x.ru/a-b', 'https://x.ru/a/b'], null, ['desktop'], ''), p4 = planPages(['https://x.ru'], null, ['desktop'], 'site');
    C(!p1.error && p1.runs.map((r) => r.tag).join(' ') === 'site-home' && !p2.error && p2.runs.map((r) => r.tag).join(' ') === 'site-home site-home-mobile site-about site-about-mobile' && p4.runs.map((r) => r.tag).join(' ') === 'site',
      'адрес и --pages "home=/" — одна страница с именем site-home (было: «Два протокола с одним именем»); с двумя страницами и экранами — четыре имени; один адрес без --pages — имя --tag как есть', `${p1.error || p1.runs.map((r) => r.tag).join(' ')} · ${p2.error || p2.runs.map((r) => r.tag).join(' ')} · ${p4.error || p4.runs.map((r) => r.tag).join(' ')}`);
    C(!!p3.error && /разные страницы с одним именем/.test(p3.error) && p3.error.includes('https://x.ru/a-b') && p3.error.includes('https://x.ru/a/b'), 'разные страницы с одним именем — отказ называет оба адреса', p3.error || p3.runs.map((r) => r.tag).join(' '));
    const p5 = planPages(['https://x.ru'], 'home=/,home=/about.html', ['desktop'], 'site');
    C(!!p5.error && /Тип «home» в --pages дан двум страницам: https:\/\/x\.ru\/? и https:\/\/x\.ru\/about\.html/.test(p5.error) && !/Задайте им типы/.test(p5.error), 'один тип на две страницы в --pages — отказ так и говорит («тип home дан двум страницам»), а не «задайте типы»', p5.error || p5.runs.map((r) => r.tag).join(' '));
    /* командная строка: --viewport desktop,mobile за один запуск и один файл решений; одно решение по номеру без экрана,
       закрывшее на двух экранах разные движения, — WARN; статус словом и пары — в md и json */
    {
      const dir = path.join(out, 'motion', 'cross-cli'); ensureDir(dir);
      /* отпечатки и протоколы прошлого прогона selftest — убрать: каждый прогон первый (прежний протокол сверки — тоже источник отпечатков) */
      fs.rmSync(path.join(dir, PRINTS_FILE), { force: true }); fs.rmSync(path.join(dir, 'motion'), { recursive: true, force: true });
      const mob = (p, drop) => ({ ...clone(p), viewport: 'mobile', size: '390×844@2', items: clone(p).items.filter((x) => !drop.includes(x.id)).map((x, q) => ({ ...x, id: `m${String(q + 1).padStart(2, '0')}` })) });
      writeJson(path.join(dir, 'donor-home.json'), xd); writeJson(path.join(dir, 'donor-home-mobile.json'), mob(xd, ['m01', 'm02']));     /* на телефоне номера сдвинуты: m01 — вторая строка */
      writeJson(path.join(dir, 'ours-home.json'), xo); writeJson(path.join(dir, 'ours-home-mobile.json'), mob(xo, []));
      const decF = path.join(dir, 'decisions.json');
      writeJson(decF, { m03: 'одна бегущая строка', 'm06:desktop': 'фигур нет', m07: 'значка нет', 'm01:mobile': 'на телефоне одна строка', 'm02:mobile': 'кнопка та же', 'm05:desktop': 'числа смягчены', 'm04:mobile': 'фигур нет', 'm05:mobile': 'значка нет' });
      const run = (...a) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'compare', ...a, '--out', dir, '--decisions', decF], { encoding: 'utf8' });
      const r1 = run(path.join(dir, 'donor-home.json'), path.join(dir, 'ours-home.json'), '--viewport', 'desktop,mobile');
      const j1 = readJson(path.join(dir, 'motion', 'compare.json')), j2 = readJson(path.join(dir, 'motion', 'compare-mobile.json'));
      /* отпечатки решений по номеру — сразу после первого запуска (проверка ниже) */
      const book = readJson(path.join(dir, PRINTS_FILE)); const pd = book && book.donors && book.donors['https://generationx5.tech/ · desktop'], pm = book && book.donors && book.donors['https://generationx5.tech/ · mobile'];
      const s1 = j1 && j1.steps.find((s) => /^m01 /.test(s.what)), s4 = j1 && j1.steps.find((s) => /^m04 /.test(s.what));
      C(!!j1 && !!j2 && j1.viewport === 'desktop' && j2.viewport === 'mobile' && j2.donorViewport === 'mobile' && !!s1 && s1.match === 'ЕСТЬ, ДРУГИМ ВИДОМ' && s1.status === 'OK' && s1.cross === true && s1.ours.join('+') === 'm01+m02' && j1.counts.otherKind === 3 && j1.counts.unplaced === 0 && !!s4 && s4.match === 'ЕСТЬ, ДРУГИМ ВИДОМ' && s4.cross === true && s4.ours.join() === 'm07',
        'compare --viewport desktop,mobile: два протокола (compare, compare-mobile) с соседями по имени; в json — match «ЕСТЬ, ДРУГИМ ВИДОМ», cross, ours, counts; пара наведения по роли — тоже cross', `код ${r1.status}; ${j1 ? `${j1.viewport}: ${s1 ? `${s1.status} ${s1.match} ${s1.ours.join('+')}` : 'нет m01'}` : 'compare.json нет'}; ${j2 ? j2.viewport : 'compare-mobile.json нет'} ${(r1.stderr || '').trim().slice(0, 160)}`);
      const md = fs.existsSync(path.join(dir, 'motion', 'compare.md')) ? fs.readFileSync(path.join(dir, 'motion', 'compare.md'), 'utf8') : '';
      C(/\| ЕСТЬ, ДРУГИМ ВИДОМ \|/.test(md) && /m01\+m02 `div\.hero__ribbon` — параллакс \+ появление/.test(md) && /## Как читать/.test(md) && /тот же приём другим видом: 3/.test(md) && /m07 `a.btn` — наведение на «кнопка»/.test(md) && /палитра у нас своя/.test(md) && /кроме случая, когда в строке «место на странице не сверено»/.test(md) && /motion-decisions.prints.json/.test(md),
        'md сверки: статус «ЕСТЬ, ДРУГИМ ВИДОМ», наши строки пары с видами (у наведения — на чём оно), раздел «Как читать»: про цвета у OK, про «место не сверено» и про отпечатки решений', md.slice(0, 200));
      C(/WARN решение «m03» без экрана закрыло разные движения: desktop — петля \(парение\)[^\n]*mobile — привязано к прокрутке/.test(r1.stdout) && j1.verdict === 'WARN' && (j1.warnings || []).some((w) => /«m03:desktop», «m03:mobile»/.test(w)),
        'одно решение по номеру без экрана («m03») закрыло на desktop и mobile разные движения — WARN с подсказкой ключей с экраном, вердикт WARN', `${j1 ? j1.verdict : '—'}; ${(r1.stdout.split('\n').find((l) => /без экрана закрыло/.test(l)) || 'строки нет').slice(0, 300)}`);
      /* запуск одного экрана, а рядом лежит протокол донора другого экрана с другим движением под тем же номером: общий файл
         решений (по умолчанию, один на прогон) — WARN; свой файл через --decisions — заметкой */
      writeJson(path.join(dir, 'motion-decisions.json'), { m03: 'одна бегущая строка', 'm05:desktop': 'числа смягчены', 'm06:desktop': 'фигур нет', 'm07:desktop': 'значка нет' });
      const r4 = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'compare', path.join(dir, 'donor-home.json'), path.join(dir, 'ours-home.json'), '--out', dir, '--tag', 'solo'], { encoding: 'utf8' });
      const j4 = readJson(path.join(dir, 'motion', 'solo.json'));
      const r5 = run(path.join(dir, 'donor-home.json'), path.join(dir, 'ours-home.json'), '--tag', 'solo-own'); const j5 = readJson(path.join(dir, 'motion', 'solo-own.json'));
      const sib = /у экрана mobile \(donor-home-mobile\.json\) под этими номерами другие движения — m03: здесь петля \(парение\)[^;]*, там привязано к прокрутке/;
      C(!!j4 && j4.verdict === 'WARN' && (j4.warnings || []).some((w) => sib.test(w) && /Файл решений один на прогон/.test(w)) && !!j5 && !(j5.warnings || []).some((w) => sib.test(w)) && (j5.decisionNotes || []).some((w) => sib.test(w)),
        'один экран в запуске, рядом протокол донора другого экрана с другим движением под тем же номером: общий файл решений — WARN, свой (--decisions) — заметкой', `общий: ${j4 ? j4.verdict : '—'} ${((j4 && j4.warnings) || ['предупреждения нет'])[0].slice(0, 160)}; свой: ${j5 ? j5.verdict : '—'}, заметок ${((j5 && j5.decisionNotes) || []).filter((w) => sib.test(w)).length} ${(r4.stderr || r5.stderr || '').trim().slice(0, 120)}`);
      /* об одном ключе — одно сообщение: m03 закрыл разные движения на двух экранах (WARN выше) — про соседний экран и в
         общей заметке «по номеру без экрана» о нём уже не повторяется (было три сообщения про один ключ) */
      const about = (j, key) => [...((j && j.warnings) || []), ...((j && j.decisionNotes) || [])].filter((w) => new RegExp(`(^|[^\\w:])${key}([^\\w:]|$)`).test(w.replace(/«|»/g, ' ')) && /без экрана/.test(w));
      C(about(j1, 'm03').length === 1 && about(j2, 'm03').length === 1 && (j1.decisionNotes || []).some((n) => /^решения по номеру без экрана: m07 —/.test(n)),
        'про ключ «m03» без экрана — одно сообщение на экран (WARN «закрыло разные движения»), а не три; остальные ключи без экрана — общей заметкой', `desktop: ${about(j1, 'm03').length}, mobile: ${about(j2, 'm03').length}; ${((j1 && j1.decisionNotes) || []).find((n) => /^решения по номеру без экрана/.test(n)) || 'общей заметки нет'}`.slice(0, 260));
      /* строке без решения — готовый ключ для вставки (по виду и подписи, с экраном), группе ×N — ключ на группу */
      spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'compare', path.join(dir, 'donor-home.json'), path.join(dir, 'ours-home.json'), '--out', dir, '--tag', 'plain', '--decisions', path.join(dir, 'нет-такого-файла.json')], { encoding: 'utf8' });
      const mdP = fs.existsSync(path.join(dir, 'motion', 'plain.md')) ? fs.readFileSync(path.join(dir, 'motion', 'plain.md'), 'utf8') : '';
      C(/\| НЕТ \|[^\n]*\| для решения — `loop:\[data-elem-id="1765713841547"\]:desktop` \|/.test(mdP) && /\| ОТЛИЧАЕТСЯ, ДРУГИМ ВИДОМ \|[^\n]*\| для решения — `scroll-linked:\[data-elem-id="1765716990801"\]:desktop` \|/.test(mdP), 'md: у строки «НЕТ» и «ОТЛИЧАЕТСЯ» без решения — готовый ключ по виду и подписи с экраном (от номеров не зависит)', (mdP.split('\n').find((l) => /\| НЕТ \|/.test(l)) || 'строки НЕТ нет').slice(-120));
      /* решения по номеру и пересъёмка донора: первый запуск (r1) записал отпечатки в файл-спутник; донор переснят со сдвигом
         номеров — решение к другому движению не применено, WARN; время файла решений роли не играет (его «правили после») */
      C(!!pd && !!pm && Object.keys(pd).sort().join(' ') === 'm03 m05:desktop m06:desktop m07' && pd.m03.kind === 'loop' && pd.m03.decision === 'одна бегущая строка' && !!pd.m03.bound && pm.m03.kind === 'scroll-linked' && j1.decisionPrints === path.join(dir, PRINTS_FILE) && /INFO решения: решения по номеру привязаны к движениям донора/.test(r1.stdout),
        'первое применение решений по номеру: файл-спутник motion-decisions.prints.json в папке прогона — отпечатки по странице донора и экрану, заметка в выводе', `${pd ? Object.keys(pd).join(' ') : 'раздела desktop нет'}; mobile: ${pm ? Object.keys(pm).join(' ') : 'нет'}`);
      const shiftD = clone(xd); shiftD.takenAt = new Date(Date.now() + 3600e3).toISOString(); shiftD.items.unshift({ id: 'm00', kind: 'entrance', trigger: 'load', target: 'div.promo-banner', count: 1, props: [{ prop: 'opacity', from: '', to: '' }], timing: { duration: 400 } }); shiftD.items.forEach((x, q) => { x.id = `m${String(q + 1).padStart(2, '0')}`; });
      writeJson(path.join(dir, 'donor-shifted.json'), shiftD); const nowT = new Date(Date.now() + 7200e3); fs.utimesSync(decF, nowT, nowT);
      const r2 = run(path.join(dir, 'donor-shifted.json'), path.join(dir, 'ours-home.json'), '--tag', 'shifted'); const j3 = readJson(path.join(dir, 'motion', 'shifted.json'));
      const s3 = (id) => (j3 ? j3.steps.find((s) => new RegExp(`^${id} `).test(s.what)) : null);
      C(!!j3 && r2.status === 1 && j3.verdict === 'FAIL' && (j3.warnings || []).filter((w) => /^решение «m0[37]» не применено: оно записано для/.test(w)).length === 2 && !s3('m03').decisionKey && s3('m03').match === 'ЕСТЬ, ДРУГИМ ВИДОМ' && s3('m04').match === 'НЕТ' && !s3('m07').decisionKey && s3('m07').match === 'НЕТ' && /WARN решение «m03» не применено[^\n]*То движение теперь m04[^\n]*"loop:\[data-elem-id="1765713841547"\]:desktop"/.test(r2.stdout),
        'донор переснят, номера сдвинулись (файл решений при этом «правили позже»): решения «m03» и «m07» к другим движениям не применены — WARN с ключом по виду и подписи, строки без решения — НЕТ, код 1', `код ${r2.status}, ${j3 ? j3.verdict : '—'}; m03: ${s3('m03') ? `${s3('m03').match} ${s3('m03').decisionKey || 'без решения'}` : '—'}; m07: ${s3('m07') ? `${s3('m07').match} ${s3('m07').decisionKey || 'без решения'}` : '—'}; ${((j3 && j3.warnings) || ['предупреждений нет'])[0].slice(0, 200)}`);
      /* донор переснят без сдвига — решения применены, предупреждения нет (проверка по времени файла давала ложный WARN) */
      const later = clone(xd); later.takenAt = new Date(Date.now() + 3600e3).toISOString(); writeJson(path.join(dir, 'donor-later.json'), later);
      const r6 = run(path.join(dir, 'donor-later.json'), path.join(dir, 'ours-home.json'), '--tag', 'later'); const j6 = readJson(path.join(dir, 'motion', 'later.json'));
      C(!!j6 && r6.status === 0 && j6.verdict === 'OK' && !(j6.warnings || []).length && j6.steps.filter((s) => s.match === 'РЕШЕНО').length === 3 && !/не применено|сдвин/.test(r6.stdout), 'донор переснят без сдвига номеров — решения по номеру применены, предупреждения нет, вердикт OK', `код ${r6.status}, ${j6 ? j6.verdict : '—'}; ${((j6 && j6.warnings) || []).join(' | ').slice(0, 200) || 'предупреждений нет'}`);
      /* привязка задним числом: прогон старше 02.10 — отпечатков нет, но лежит прежний протокол сверки (как писал master:
         what, decisionKey, текст решения в конце details). Донор переснят со сдвигом — уже первая сверка новой версией не
         применяет старые решения к другим движениям; решение, текст которого с тех пор переписан, привязывается к нынешней строке */
      {
        const hd = path.join(out, 'motion', 'cross-history'); fs.rmSync(hd, { recursive: true, force: true }); ensureDir(path.join(hd, 'motion'));
        writeJson(path.join(hd, 'motion', 'cmp.json'), { url: xo.url, donor: xd.url, viewport: 'desktop', takenAt: '2026-10-01T17:21:08.295Z', verdict: 'OK', steps: [
          { status: 'OK', what: 'm03 петля #rec1689764921 [data-elem-id="1765713841547"]', decisionKey: 'm03', details: 'у нас нет; одна бегущая строка' },
          { status: 'OK', what: 'm06 привязано к прокрутке #rec1690088711 [data-elem-id="1765719257106"] ×3', decisionKey: 'm06', details: 'у нас нет; фигур нет' },
          { status: 'OK', what: 'm07 петля #rec1689728881 [data-elem-id="1765713300901"]', decisionKey: 'm07', details: 'у нас нет; прежний текст' }] });
        /* чужие протоколы рядом — не источник: сверка другой страницы донора и сверка другого экрана (обе свежее, и под теми же
           номерами с тем же текстом у них — как раз нынешние строки) */
        writeJson(path.join(hd, 'motion', 'cmp-about.json'), { url: xo.url, donor: 'https://generationx5.tech/about', viewport: 'desktop', takenAt: '2026-10-02T09:00:00.000Z', verdict: 'OK', steps: [{ status: 'OK', what: 'm03 петля #rec1689728881 [data-elem-id="1765713300876"]', decisionKey: 'm03', details: 'у нас нет; одна бегущая строка' }] });
        writeJson(path.join(hd, 'motion', 'cmp-mobile.json'), { url: xo.url, donor: xd.url, viewport: 'mobile', takenAt: '2026-10-02T09:00:00.000Z', verdict: 'OK', steps: [{ status: 'OK', what: 'm06 привязано к прокрутке #rec1689903121 [data-elem-id="1765716990801"] ×2', decisionKey: 'm06', details: 'у нас нет; фигур нет' }] });
        writeJson(path.join(hd, 'motion-decisions.json'), { m03: 'одна бегущая строка', m06: 'фигур нет', m07: 'переписано: нынешнее m07 не берём' });
        writeJson(path.join(hd, 'donor-shifted.json'), shiftD); writeJson(path.join(hd, 'ours-home.json'), xo);
        const rh = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'compare', path.join(hd, 'donor-shifted.json'), path.join(hd, 'ours-home.json'), '--out', hd], { encoding: 'utf8' });
        const jh = readJson(path.join(hd, 'motion', 'compare.json')), bh = readJson(path.join(hd, PRINTS_FILE)); const sh = (id) => (jh ? jh.steps.find((s) => new RegExp(`^${id} `).test(s.what)) : null);
        const ph = bh && bh.donors && bh.donors['https://generationx5.tech/ · desktop'];
        C(!!jh && rh.status === 1 && (jh.warnings || []).filter((w) => /^решение «m0[36]» не применено: оно записано для/.test(w)).length === 2 && !sh('m03').decisionKey && !sh('m06').decisionKey && sh('m07').decisionKey === 'm07' && sh('m07').match === 'РЕШЕНО'
          && (jh.decisionNotes || []).some((n) => /отпечатки решений по номеру \(m03, m06\) взяты из прежнего протокола сверки этого прогона \(cmp\.json\)/.test(n)) && !!ph && ph.m06.kind === 'scroll-linked' && ph.m06.count === 3 && /cmp\.json от 2026-10-01/.test(ph.m06.from) && ph.m07.decision === 'переписано: нынешнее m07 не берём' && !ph.m07.from,
          'прогон без отпечатков, но с прежним протоколом сверки: отпечатки «m03» и «m06» взяты из него — после пересъёмки донора со сдвигом решения не применены уже в первой сверке (WARN, код 1); решение с переписанным текстом («m07») привязано к нынешней строке', `код ${rh.status}; ${jh ? `m03: ${sh('m03').decisionKey || 'без решения'}, m06: ${sh('m06').decisionKey || 'без решения'}, m07: ${sh('m07').decisionKey || 'без решения'} ${sh('m07').match}` : 'протокола нет'}; ${((jh && jh.decisionNotes) || []).find((n) => /прежнего протокола/.test(n)) || 'заметки нет'} ${(rh.stderr || '').trim().slice(0, 160)}`.slice(0, 420));
      }
      const r3 = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'compare', path.join(dir, 'donor-later.json'), path.join(dir, 'ours-home.json'), '--viewport', 'desktop,mobile', '--out', dir], { encoding: 'utf8' });
      C(r3.status === 1 && /нет протокола донора для экрана mobile/.test(r3.stderr), '--viewport desktop,mobile без протокола донора для второго экрана — отказ с подсказкой, что снять', `код ${r3.status}; ${(r3.stderr || r3.stdout).trim().slice(0, 200)}`);
    }
  }
  if (opt['no-browser']) { console.log(`${cbad ? 'FAIL' : 'OK'}: сверка ${cn - cbad}/${cn} (без браузера: распознавание на стенде, Tilda-донор и клики ×1.25 не проверялись)`); process.exit(cbad ? 1 : 0); }
  const url = pathToFileURL(path.join(HERE, 'fixtures', 'motion', 'index.html')).href;
  const res = await inventory(url, vpList(opt.viewport)[0], { out, tag: 'selftest', ...phases, crops: false });
  writeJson(path.join(out, 'motion', 'selftest.json'), res);
  const html = fs.readFileSync(path.join(HERE, 'fixtures', 'motion', 'index.html'), 'utf8');
  const expected = [...html.matchAll(/data-expect="([\w-]+)"/g)].map((m) => m[1]).filter((k) => phases.doClicks || !/^click-/.test(k));
  const need = [...new Set(expected)];
  const CK = { 'меню': 'click-menu', 'аккордеон': 'click-accordion', 'вкладки': 'click-tabs', 'раскрытие': 'click-disclosure' };
  /* петли на JS (source js): группа соседей ×N — loop-group, одна — loop-js (колебание), pulse-js, blink-js, spin-js */
  const JSK = { 'колебание': 'loop-js', 'пульс': 'pulse-js', 'мигание': 'blink-js', 'вращение': 'spin-js' };
  /* ribbon-scroll — лента вбок прокруткой контейнера (scrollLeft), reveal-keyframes — появление из @keyframes (WOW.js) */
  const key = (i) => (i.kind === 'loop' && i.source === 'js' ? (i.count > 1 ? 'loop-group' : JSK[i.sub] || 'loop-js') : i.kind === 'loop' ? ({ 'парение': 'float', 'вращение': 'spin', 'пульс': 'pulse', 'мигание': 'blink' }[i.sub] || 'loop') : i.kind === 'reveal' && i.sub === 'при прокрутке вверх' ? 'reveal-up' :
    i.kind === 'scroll-linked' && /scrollLeft/.test(i.source || '') ? 'ribbon-scroll' : i.kind === 'reveal' && /@keyframes/.test(i.source || '') ? 'reveal-keyframes' : i.kind === 'typewriter' && i.trigger === 'load' ? 'typewriter-load' : i.kind === 'click' ? (i.sub === 'аккордеон' && /details/.test(i.component || '') ? 'click-details' : CK[i.sub] || 'click') : i.kind);
  const found = new Set(res.items.map(key));
  const byExpect = new Set(res.items.map((i) => i.expect).filter(Boolean));
  let bad = 0;
  for (const k of need) { const ok = found.has(k); const at = byExpect.has(k); if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${k}${ok ? (at ? '' : ' (найдено, но не на своём блоке)') : ' — не найдено'}`); }
  /* data-expect-not: на этом блоке такого вида быть не должно (пружина входа — не петля) */
  const nots = [...new Set([...html.matchAll(/data-expect-not="([\w -]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean))]; let wrong = 0;
  for (const k of nots) { const hit = res.items.filter((i) => i.expectNot && i.expectNot.split(/\s+/).includes(k) && (i.kind === k || key(i) === k)); if (hit.length) wrong++; console.log(`${hit.length ? 'FAIL' : 'OK  '} не ${k}${hit.length ? ` — найдено на блоке, где его быть не должно: ${hit.map((i) => `${i.id} ${i.target}`).join(', ')}` : ''}`); }
  /* data-expect-n: строка ×N на своём блоке — одна и участников ровно N (стопка — одной строкой, не поштучно) */
  for (const [, k, n] of html.matchAll(/data-expect="([\w-]+)"[^>]*?data-expect-n="(\d+)"/g)) {
    const rows = res.items.filter((i) => i.expect === k && key(i) === k); const ok = rows.length === 1 && rows[0].count === Number(n); if (!ok) wrong++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${k} ×${n}${ok ? '' : ` — строк ${rows.length}${rows.length ? `, участников ${rows.map((i) => i.count).join('/')}` : ''}`}`);
  }
  /* числа появления WOW.js (0.8 с, задержка 0.2 с, fadeInUp: прозрачность 0 → 1, сдвиг Y на высоту блока 120 px);
     клик, который уводит со страницы, — пропуск, следующий клик проверяется; вкладка с history.replaceState — та же страница */
  {
    const w = res.items.find((i) => i.expect === 'reveal-keyframes' && key(i) === 'reveal-keyframes');
    const pv = (name) => (w ? w.props.find((p) => p.prop === name) : null); const op = pv('прозрачность'), ty = pv('сдвиг Y');
    /* где срабатывает: IntersectionObserver без отступа — верх блока пересекает низ экрана (шаг прохода — четверть экрана):
       «между ≥95% и 50–100%», а не верх родителя сдвинутого блока (было «между 101% и −20%» на mamuka.rest/about) */
    const at = w && w.scroll ? /между (-?\d+)% и (-?\d+)%/.exec(w.scroll.at || '') : null;
    const atOk = !!at && Number(at[1]) >= 95 && Number(at[2]) >= 50 && Number(at[2]) < 100;
    const ok = !!w && w.timing.duration === 800 && w.timing.delay === 200 && !!op && op.from === '0' && op.to === '1' && !!ty && ty.from === '120 px' && ty.to === '0 px' && /WOW\.js/.test(w.cause || '') && atOk;
    if (!ok) wrong++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} WOW.js числа: ${w ? `${w.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ')} · ${describeTiming(w)} · ${w.scroll ? w.scroll.at : 'где — нет'} · ${w.cause || 'без причины'}` : 'строки появления нет'}`);
    /* .wow без класса анимации и пустой .wow 0×0 — строк нет, заметка называет обе причины */
    const wn = res.notes.find((x) => /^WOW\.js: блоков/.test(x)) || '';
    const okW = /блоков \.wow 3, строкой не стали 2/.test(wn) && /1 — 0×0 на этом экране/.test(wn) && /1 — без класса анимации/.test(wn); if (!okW) wrong++;
    console.log(`${okW ? 'OK  ' : 'FAIL'} WOW.js без строки — заметка «почему»: ${wn || 'заметки нет'}`);
    if (phases.doClicks) {
      const tr = (res.clicks && res.clicks.tried) || []; const li = tr.findIndex((x) => /увёл со страницы/.test(x.skip || ''));
      const after = li >= 0 && tr.slice(li + 1).some((x) => x.item);
      const ok2 = li >= 0 && after && res.notes.some((n) => /увёл со страницы: переход на .*tilda\.html остановлен/.test(n)); if (!ok2) wrong++;
      console.log(`${ok2 ? 'OK  ' : 'FAIL'} клик увёл со страницы — пропущен, клики дальше: ${li >= 0 ? `${tr[li].text || tr[li].sel}: ${tr[li].skip}; после него нажато ${tr.slice(li + 1).filter((x) => x.item).length}` : 'пропуска нет'}`);
      const ok3 = found.has('click-tabs') && res.notes.some((n) => /сменил адрес на .*\?tab=t\d без перехода \(history API\)/.test(n)); if (!ok3) wrong++;
      console.log(`${ok3 ? 'OK  ' : 'FAIL'} вкладка с history.replaceState — та же страница: ${res.notes.find((n) => /history API/.test(n)) || 'заметки нет'}`);
    }
  }
  /* окно из SITE_REWORK_DISMISS уводит на другую страницу (город у mamuka.rest → главная): снимаемая страница
     открывается заново, в заметке — куда увело (fixtures/motion/dismiss.html → tilda.html, выбор в sessionStorage) */
  {
    const was = process.env.SITE_REWORK_DISMISS; process.env.SITE_REWORK_DISMISS = '.city li.city__item';
    let dres = null, derr = '';
    try { dres = await inventory(pathToFileURL(path.join(HERE, 'fixtures', 'motion', 'dismiss.html')).href, 'desktop', { out, tag: 'selftest-dismiss', timeMs: 1000, capMs: 1000, doHover: false, doMouse: false, doClicks: false, crops: false, quiet: true }); }
    catch (e) { derr = String(e.message || e).slice(0, 120); }
    finally { if (was === undefined) delete process.env.SITE_REWORK_DISMISS; else process.env.SITE_REWORK_DISMISS = was; }
    const dn = dres ? dres.notes.find((x) => /SITE_REWORK_DISMISS увело на/.test(x)) || '' : '';
    const okD = /увело на .*tilda\.html — страница открыта заново/.test(dn); if (!okD) wrong++;
    console.log(`${okD ? 'OK  ' : 'FAIL'} окно SITE_REWORK_DISMISS увело со страницы — снимаемая открыта заново: ${dn || derr || 'заметки нет'}`);
    /* итог нажатия — в протоколе (windows), а не только заметкой; удачное нажатие вердикт не портит */
    const dw = dres && dres.windows; const d0 = dw && dw.dismiss && dw.dismiss[0];
    const okW = !!(d0 && d0.nav && d0.reopened && dres.verdict === 'OK' && !(dw.warnings || []).length); if (!okW) wrong++;
    console.log(`${okW ? 'OK  ' : 'FAIL'} итог нажатия в протоколе (windows.dismiss: увело, открыта заново), вердикт OK: ${JSON.stringify(d0 || null).slice(0, 200)} · ${dres ? dres.verdict : '—'}`);
  }
  /* окно при загрузке без SITE_REWORK_DISMISS (стенд lib modal-city.html): WARN — в вердикте и протоколе (windows), а не
     строкой мимо протокола (29.09) */
  {
    const was = process.env.SITE_REWORK_DISMISS; delete process.env.SITE_REWORK_DISMISS;
    let mres = null, merr = '';
    try { mres = await inventory(pathToFileURL(path.join(HERE, 'fixtures', 'lib', 'modal-city.html')).href, 'desktop', { out, tag: 'selftest-modal', timeMs: 1000, capMs: 1000, doHover: false, doMouse: false, doClicks: false, doScroll: false, crops: false, quiet: true }); }
    catch (e) { merr = String(e.message || e).slice(0, 120); }
    finally { if (was !== undefined) process.env.SITE_REWORK_DISMISS = was; }
    const okM = !!(mres && mres.verdict === 'WARN' && mres.windows && mres.windows.modal && mres.windows.warnings.some((x) => /на странице открыто окно/.test(x))); if (!okM) wrong++;
    console.log(`${okM ? 'OK  ' : 'FAIL'} окно при загрузке — WARN в вердикте и протоколе (windows): ${mres ? `${mres.verdict}, ${(mres.windows && mres.windows.modal && mres.windows.modal.sig) || 'окна нет'}` : merr}`);
  }
  /* две бегущие строки одной подписи с разной скоростью (fixtures/motion/marquee-two.html: три ленты .mq__track с одними
     @keyframes, две — 20 с на круг, одна — 12 с) — две строки протокола со своими скоростями, а не одна; место (place)
     записано — первый экран */
  {
    let mres = null, merr = '';
    try { mres = await inventory(pathToFileURL(path.join(HERE, 'fixtures', 'motion', 'marquee-two.html')).href, 'desktop', { out, tag: 'selftest-marquee', timeMs: 1500, capMs: 1500, doHover: false, doMouse: false, doClicks: false, doScroll: false, crops: false, quiet: true }); }
    catch (e) { merr = String(e.message || e).slice(0, 120); }
    const mq = mres ? mres.items.filter((i) => i.kind === 'marquee') : []; const sp = mq.map((i) => parseFloat((i.timing || {}).speed)).sort((a, b) => a - b);
    const okQ = mq.length === 2 && sp[0] > 0 && Math.abs(sp[1] / sp[0] - 20 / 12) < 0.05 && mq.every((i) => i.place && i.place.first === true && i.place.screen === 1); if (!okQ) wrong++;
    console.log(`${okQ ? 'OK  ' : 'FAIL'} две бегущие строки одной подписи с разной скоростью — две строки, место — первый экран: ${mq.map((i) => `${i.id} ${i.target} ${(i.timing || {}).speed}${i.place ? ` · экран ${i.place.screen} из ${i.place.of}${i.place.first ? ', первый' : ''}` : ' · place нет'}`).join('; ') || merr || 'строк нет'}`);
  }
  /* место на странице (place) у строк стенда: первый экран у блока в шапке, не первый — у самой нижней строки */
  {
    const placed = res.items.filter((i) => i.place && !i.place.fixed); const top = placed.find((i) => i.expect === 'typewriter' || i.expect === 'entrance' || i.expect === 'hover');
    /* место нужно сверке у движений от прокрутки и по времени — у них оно должно быть у каждой строки */
    const lack = res.items.filter((i) => ['scroll-linked', 'parallax', 'reveal', 'marquee', 'loop', 'pinned'].includes(i.kind) && !i.place);
    const low = [...placed].sort((a, b) => b.place.y - a.place.y)[0];
    const okP = !lack.length && placed.length >= 15 && !!top && top.place.first === true && top.place.screen === 1 && !!low && low.place.first === false && low.place.screen > 1 && low.place.of >= low.place.screen; if (!okP) wrong++;
    console.log(`${okP ? 'OK  ' : 'FAIL'} место на странице (place) в протоколе: с местом ${placed.length} из ${res.items.length} (закреплённые — отдельно)${lack.length ? `, без места: ${lack.map((i) => `${i.id} ${i.kind}`).join(', ')}` : ''}; ${top ? `${top.id} ${top.target} — экран ${top.place.screen}${top.place.first ? ', первый' : ''}` : 'строки первого экрана нет'}; ${low ? `${low.id} ${low.target} — экран ${low.place.screen} из ${low.place.of}${low.place.first ? ', первый' : ''}` : 'нижней строки нет'}`);
  }
  const st = res.stats.steps;
  console.log(`\n${mdTable(res)}`);
  /* Tilda-донор: fixtures/motion/tilda.html (скрипты Tilda заменены маленькой имитацией с теми же именами файлов) —
     пункты из атрибутов точнее замера: петля SBS ниже первого экрана — loop (замер: «привязано к прокрутке»),
     задержки появлений 0/300/600 (замер: «по очереди +300»), лента 0.68 (замер: 0.521), на телефоне — только
     data-animate-mobile=y, служебное — не движение */
  let tbad = 0, tn = 0;
  {
    const [vpn, tvp] = resolveViewport(vpList(opt.viewport)[0]);
    const turl = pathToFileURL(path.join(HERE, 'fixtures', 'motion', 'tilda.html')).href;
    const tr = await inventory(turl, vpn, { out, tag: 'selftest-tilda', ...phases, timeMs: Math.min(phases.timeMs, 3000), doHover: false, doMouse: false, doClicks: false, crops: false, quiet: true });
    writeJson(path.join(out, 'motion', 'selftest-tilda.json'), tr);
    const T = (ok, what, got) => { tn++; if (!ok) tbad++; console.log(`${ok ? 'OK  ' : 'FAIL'} Tilda ${what}: ${got}`); };
    const K = (id) => tr.items.filter((i) => (i.keys || [i.key]).includes(`20:${id}`));
    const show = (l) => l.map((i) => `${i.id} ${KIND_RU[i.kind] || i.kind}${i.sub ? ` (${i.sub})` : ''} ${i.target}${i.count > 1 ? ` ×${i.count}` : ''} · ${describeTiming(i).slice(0, 90)}${i.check ? ` · ${i.check}` : ''}`).join('; ') || 'нет';
    console.log(`\nTilda-донор (${vpn}): ${turl}`);
    if (tvp.width >= 1200) {
      const lp = K(201); T(lp.length === 1 && lp[0].kind === 'loop' && lp[0].sub === 'пульс' && lp[0].source === 'атрибуты Tilda' && !tr.items.some((i) => i.source !== 'атрибуты Tilda' && /scroll-linked|parallax/.test(i.kind) && /pulse|sbs/.test(i.target || '')), 'петля SBS intoview + loop ниже первого экрана — loop из атрибутов, не «привязано к прокрутке»', show(lp));
      const rv = K(203).filter((i) => i.kind === 'reveal');
      T(rv.length === 1 && (rv[0].timing.delays || []).join('/') === '0/300/600' && rv[0].count === 3 && !rv[0].timing.stagger && !tr.items.some((i) => i.kind === 'reveal' && i.source !== 'атрибуты Tilda'), 'задержки появлений как у донора 0/300/600, не «по очереди +N»', show(rv));
      const sc = K(205); T(sc.length === 1 && sc[0].kind === 'scroll-linked' && sc[0].scroll.coefficient === 0.68, 'SBS scroll — лента 340 px на 500 px, коэффициент 0.68 из атрибутов', show(sc));
    } else {
      const src = tr.items.filter((i) => i.source === 'атрибуты Tilda');
      T(src.length === 1 && K(206).length === 1 && tr.items.length === 1, 'телефон: играет только data-animate-mobile=y', show(tr.items));
      T(!!tr.tilda && tr.tilda.off >= 5, 'телефон: выключенное Tilda — заметкой, не в инвентаре', `не играет у донора ${tr.tilda ? tr.tilda.off : '?'}`);
    }
    T(!tr.items.some((i) => /allrecords|t-mbfix/.test(i.target || '')) && !!tr.tilda && tr.tilda.service >= 1, 'служебное (#allrecords проявляется, t-mbfix) — не движение донора', `служебных замеров снято ${tr.tilda ? tr.tilda.service : '?'}`);
  }
  /* клики на телефоне со страницей шире экрана: видимое окно увеличено ×1.25 (Emulation.setPageScaleFactor — так
     бывает после прохода discover, scale 1.056), окно раскладки больше видимого. Точка из getBoundingClientRect
     должна попадать (сдвиг на offset, без «× scale»), меню в шапке — нажаться или честно «за краем экрана» */
  let wide = 0;
  if (phases.doClicks) {
    const [, mvp] = resolveViewport('mobile'); const br = await launch();
    try {
      const page = await preparePage(br, mvp, {}); await page.evaluateOnNewDocument(instrument);
      await gotoRetry(page, url, { waitUntil: 'load', timeout: 60000 });
      const cdp = await page.createCDPSession(); await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 }); await sleep(300);
      const w = await page.evaluate(() => ({ iw: innerWidth, vw: Math.round(visualViewport.width), sc: Math.round(visualViewport.scale * 100) / 100 }));
      const ck = await probeClicks(page, mvp, { sig: SIG_FN, screenPt: SCREEN_POINT_FN }, { maxN: clickN });
      const got = new Set(ck.items.map((it) => (it.sub === 'аккордеон' && /details/.test(it.component || '') ? 'click-details' : CK[it.sub])));
      console.log(`\nклики на телефоне ×${w.sc}: окно раскладки ${w.iw} px, видимое ${w.vw} px`);
      for (const k of ['click-accordion', 'click-details', 'click-tabs', 'click-disclosure']) { const ok = got.has(k); if (!ok) wide++; console.log(`${ok ? 'OK  ' : 'FAIL'} ×1.25 ${k}${ok ? '' : ` — не найдено (${ck.notes.filter((n) => !/меню/.test(n)).join('; ').slice(0, 200) || 'без заметок'})`}`); }
      const edge = ck.notes.find((n) => /меню/.test(n) && /за краем экрана/.test(n)); const ok = got.has('click-menu') || !!edge; if (!ok) wide++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ×1.25 click-menu — ${got.has('click-menu') ? 'нажато' : edge ? 'за краем экрана (не нажимается, как у человека)' : `не найдено (${ck.notes.join('; ').slice(0, 200)})`}`);
      await page.close();
    } finally { await br.close().catch(() => {}); }
  }
  console.log(`${bad || wrong || wide || tbad || cbad ? 'FAIL' : 'OK'}: видов ${need.length}, не найдено ${bad}; запретов, счётов ×N и чисел не выполнено ${wrong}; кликов ×1.25 мимо ${wide}; Tilda ${tn - tbad}/${tn}; сверка ${cn - cbad}/${cn} · окно «время» ${round(st.timeMs / 1000, 1)} с (базовое ${round(st.timeBaseMs / 1000, 1)}) · ${path.join(out, 'motion', 'selftest.json')}`);
  bad += wrong + wide + tbad + cbad;
  process.exit(bad ? 1 : 0);
}

/* страницы запуска: адреса подряд и --pages «тип=путь,…» или «путь,…» от первого адреса.
   Имя протокола: одна страница и один экран без типа — --tag как есть (или <страница>-<экран>); несколько страниц или
   экранов, а также страница с типом из --pages — <--tag>-<тип или страница>, у экрана не desktop — ещё -<экран>
   (donor-home, donor-product-mobile); без --tag — <тип или страница>-<экран>.
   → { runs: [{ url, vp, tag, type }] } или { error } — без браузера, проверяется в selftest. */
function planPages(args, pagesOpt, vps, prefix) {
  const urls = args.filter((p) => /^(https?|file):/i.test(p));
  const junk = args.filter((p) => !/^(https?|file):/i.test(p));
  if (junk.length) return { error: `Не адрес: ${junk.join(' ')} — адреса начинаются с http://, https:// или file:// (страницы от первого адреса — --pages)` };
  /* одна страница — один протокол: адрес и та же страница в --pages («https://x.ru» и "home=/") сводятся в одну, имя —
     тип из --pages. Сравнение — по разобранному адресу (https://x.ru и https://x.ru/ — одно и то же; якорь не в счёт):
     раньше адрес без косой и путь «/» считались двумя страницами — «Два протокола с одним именем site-home» */
  const canon = (u) => { try { const x = new URL(u); x.hash = ''; return x.href; } catch (e) { return String(u); } };
  const list = [];
  for (const u of urls) if (!list.some((x) => canon(x.url) === canon(u))) list.push({ url: u, type: null });
  if (pagesOpt && pagesOpt !== true) {
    if (!urls.length) return { error: '--pages считаются от первого адреса: node motion.mjs <адрес> --pages "home=/,product=/p/x"' };
    for (const part of String(pagesOpt).split(',').map((x) => x.trim()).filter(Boolean)) {
      const m = /^([\p{L}\w-]+)=(.+)$/u.exec(part);
      const href = new URL(unmangle(m ? m[2] : part), urls[0]).href;
      const same = list.find((x) => canon(x.url) === canon(href));
      if (same) { if (m) same.type = m[1]; continue; }
      list.push({ url: href, type: m ? m[1] : null });
    }
  }
  if (!list.length) return { error: 'Нужно: node motion.mjs <адрес> [<адрес>…] [--pages "тип=путь,…"] [--viewport desktop,mobile] [--out папка] (подробно: --help)' };
  const single = list.length === 1 && vps.length === 1 && !list[0].type;
  const runs = [];
  for (const p of list) for (const vp of vps) {
    const name = p.type || pageSlug(p.url);
    const tag = single ? (prefix || `${name}-${vp}`) : prefix ? `${prefix}-${name}${vp === 'desktop' ? '' : '-' + vp}` : `${name}-${vp}`;
    const twin = runs.find((r) => r.tag === tag);
    /* один тип на две страницы ("home=/,home=/about.html") — типы заданы, совет «задайте типы» тут мимо */
    if (twin && twin.url !== p.url) { if (twin.type && twin.type === p.type) return { error: `Тип «${p.type}» в --pages дан двум страницам: ${twin.url} и ${p.url} — у каждой страницы свой тип (например "home=/,about=/about")` }; }
    if (twin) return { error:`Два протокола с одним именем ${tag}: ${twin.url} и ${p.url} — разные страницы с одним именем. Задайте им типы в --pages («тип=путь», например "home=/,catalog=/catalog")` };
    runs.push({ url: p.url, vp, tag, type: p.type });
  }
  return { runs };
}
function pagePlan() {
  const plan = planPages(pos, opt.pages, vpList(opt.viewport), opt.tag && opt.tag !== true ? String(opt.tag) : '');
  if (plan.error) die(plan.error);
  return plan.runs;
}

if (cmd === 'compare') {
  /* пары «протокол донора — наш адрес или протокол» подряд: compare d1.json url1 d2.json url2 … */
  if (pos.length < 2 || pos.length % 2) die('Нужно: node motion.mjs compare <motion.json донора> <адрес или motion.json нашего> [ещё пары…] (подробно: --help)');
  const pairs = []; for (let q = 0; q < pos.length; q += 2) pairs.push([pos[q], pos[q + 1]]);
  /* --viewport списком (desktop,mobile): каждая пара сверяется на каждом экране — протокол донора этого экрана ищется
     рядом по имени инвентаря (donor-home.json ↔ donor-home-mobile.json), наш адрес снимается на этом экране, а наш
     протокол — тоже сосед по имени. Один запуск, один файл решений, ключи с экраном («m07:mobile»). */
  const screens = opt.viewport && opt.viewport !== true ? vpList(opt.viewport) : null;
  const sibling = (file, from, to) => {
    if (from === to) return file;
    const dir = path.dirname(file); const stem = path.basename(file, '.json').replace(new RegExp(`-${String(from).replace(/[^\w-]/g, '.')}$`), '');
    return (to === 'desktop' ? [`${stem}.json`, `${stem}-desktop.json`] : [`${stem}-${to}.json`]).map((n) => path.join(dir, n)).find((f) => fs.existsSync(f)) || null;
  };
  const jobs = [];
  for (const [donorFile, ourArg] of pairs) {
    const d0 = readJson(path.resolve(donorFile)); if (!d0 || !Array.isArray(d0.items)) die(`Не читается протокол донора: ${donorFile}`);
    const isUrl = /^(https?|file):/i.test(ourArg);
    /* один экран в --viewport при протоколе донора другого экрана — как раньше: наш адрес снимается на этом экране, сверка скажет «экраны разные» */
    if (!screens || screens.length < 2) { jobs.push({ donorFile, ourArg, vp: screens ? screens[0] : d0.viewport || 'desktop', isUrl, base: donorFile }); continue; }
    for (const vp of screens) {
      const df = sibling(path.resolve(donorFile), d0.viewport || 'desktop', vp);
      if (!df) die(`--viewport ${screens.join(',')}: рядом с ${donorFile} нет протокола донора для экрана ${vp} (ждал ${path.basename(donorFile, '.json').replace(new RegExp(`-${d0.viewport}$`), '')}${vp === 'desktop' ? '' : `-${vp}`}.json) — снимите: motion.mjs <адрес донора> --viewport ${screens.join(',')} --tag donor`);
      let oa = ourArg;
      if (!isUrl) { const o0 = readJson(path.resolve(ourArg)); if (!o0 || !Array.isArray(o0.items)) die(`Не читается наш протокол: ${ourArg}`); oa = sibling(path.resolve(ourArg), o0.viewport || 'desktop', vp); if (!oa) die(`--viewport ${screens.join(',')}: рядом с ${ourArg} нет нашего протокола для экрана ${vp} — снимите наш сайт на этом экране или дайте адрес вместо файла`); }
      jobs.push({ donorFile: df, ourArg: oa, vp, isUrl, base: donorFile, multi: true });
    }
  }
  const many = pairs.length > 1;
  let browser = null; let worst = 'OK'; const rank = { OK: 0, WARN: 1, FAIL: 2 };
  const byNumber = new Map();          /* решения по номеру без экрана: ключ → что закрыто на каком экране (конфликт экранов) */
  const tags = new Set();
  try {
    for (const job of jobs) {
      const { donorFile, ourArg, vp } = job;
      const donor = readJson(path.resolve(donorFile)); if (!donor || !Array.isArray(donor.items)) die(`Не читается протокол донора: ${donorFile}`);
      let ours; let out;
      if (job.isUrl) {
        out = opt.out ? path.resolve(String(opt.out)) : runDir(opt, ourArg);
        const tag = `${pageSlug(ourArg)}-${vp}`;
        if (!browser) browser = await launch();
        ours = await inventory(ourArg, vp, { out, tag, ...phases, browser });
        writeJson(path.join(out, 'motion', `${tag}.json`), ours); fs.writeFileSync(path.join(out, 'motion', `${tag}.md`), mdTable(ours));
      } else {
        ours = readJson(path.resolve(ourArg)); if (!ours || !Array.isArray(ours.items)) die(`Не читается наш протокол: ${ourArg}`);
        out = opt.out ? path.resolve(String(opt.out)) : path.dirname(path.dirname(path.resolve(ourArg)));
      }
      const decFile = path.resolve(String(opt.decisions && opt.decisions !== true ? opt.decisions : path.join(out, 'motion-decisions.json')));
      const decisions = readJson(decFile, {}) || {};
      const screen = donor.viewport || vp;                          /* номера mNN — из протокола донора, экран ключа — его */
      /* отпечатки решений по номеру — файл-спутник в папке прогона (рядом с motion-decisions.json), свой раздел у каждой
         страницы донора и экрана: номера mNN у них свои. Файла нет или он не читается — как первый запуск */
      const printsFile = path.join(out, PRINTS_FILE);
      const kept = readJson(printsFile, null); const book = kept && typeof kept === 'object' && kept.donors && typeof kept.donors === 'object' ? kept : { donors: {} };
      const page = `${donor.url || path.basename(donorFile)} · ${screen}`;
      /* решения по номеру, у которых отпечатка ещё нет: сначала — из прежнего протокола сверки этого прогона (к чему
         номер относился, когда решение писали), и только чего там нет — привяжется к нынешней строке */
      const past = printsFromHistory(path.join(out, 'motion'), donor, screen, decisions, book.donors[page] || {});
      const pastKeys = Object.keys(past.prints);
      if (pastKeys.length) { book.donors[page] = { ...(book.donors[page] || {}) }; for (const k of pastKeys) book.donors[page][k] = { ...past.prints[k], bound: new Date().toISOString() }; }
      const c = compare(donor, ours, decisions, { screen, prints: book.donors[page] || {} });
      if (pastKeys.length) c.notes.push(`отпечатки решений по номеру (${pastKeys.join(', ')}) взяты из прежнего протокола сверки этого прогона (${past.from.join(', ')}): какое движение номер закрывал тогда — к такому решение и привязано`);
      if (c.binds.length) {
        book.donors[page] = { ...(book.donors[page] || {}) };
        for (const b of c.binds) book.donors[page][b.key] = { ...b.print, bound: new Date().toISOString(), donorTakenAt: donor.takenAt || null };
      }
      if (c.binds.length || pastKeys.length) {
        book._about = 'Отпечатки движений донора для решений по номеру (mNN) — пишет motion.mjs compare при первом применении решения. По ним сверка замечает, что донора пересняли и под номером теперь другое движение (тогда решение не применяется). Править руками не нужно; удалённая запись — решение привяжется заново к движению, которое сейчас под этим номером.';
        writeJson(printsFile, book);
      }
      const dname = path.basename(job.base, '.json').replace(/^donor-/, '');
      let tag = opt.tag && opt.tag !== true ? (many ? `${opt.tag}-${dname}` : String(opt.tag)) : many ? `compare-${dname}` : 'compare';
      if (job.multi && vp !== 'desktop') tag += `-${vp}`;
      if (tags.has(tag)) die(`Две сверки с одним именем ${tag}: дайте парам разные протоколы донора или --tag`);
      tags.add(tag);
      /* наш снимок снят под окном или с неудачным SITE_REWORK_DISMISS (windows.warnings) — сверка не лучше WARN */
      const winW = (ours.windows && ours.windows.warnings) || [];
      const byId = c.rows.filter((r) => r.hit && r.hit.byId);
      /* what — для сравнения (подпись по шаблону: класс состояния не в счёт), show — для сообщения (подпись целиком) */
      const said = new Set();           /* номера без экрана, о которых уже сказано предупреждением: одно сообщение на ключ */
      for (const r of byId.filter((x) => x.hit.bare)) { const l = byNumber.get(r.key) || []; l.push({ screen, what: `${kindRu(r.d)} ${pattern(r.d.target)}`, show: `${kindRu(r.d)} ${r.d.target}`, c, said }); byNumber.set(r.key, l); }
      /* решение по номеру без экрана, а у протокола донора соседнего экрана (donor-home-mobile.json рядом) под этим номером
         другое движение: общий файл решений закроет им там чужую строку («Зелёный уголок»: m06 — наведение на кнопку на
         широком экране и меню на телефоне). Файл решений по умолчанию — один на прогон, то есть общий: WARN; заданный
         через --decisions может быть своим на экран (так обходились раньше) — заметкой */
      const bareId = byId.filter((x) => x.hit.bare); const sib = [];
      for (const v of bareId.length ? ['desktop', 'laptop', 'tablet', 'mobile', 'mobile-s', 'android'].filter((x) => x !== screen) : []) {
        const sf = sibling(path.resolve(donorFile), screen, v); const sd = sf && path.resolve(sf) !== path.resolve(donorFile) ? readJson(sf) : null;
        if (!sd || !Array.isArray(sd.items) || (sd.viewport && sd.viewport !== v)) continue;
        const clash = bareId.map((r) => ({ r, t: sd.items.find((x) => x.id === r.d.id) })).filter(({ r, t }) => t && (t.kind !== r.d.kind || pattern(t.target) !== pattern(r.d.target)));
        if (!clash.length) continue;
        sib.push({ v, sf, clash });
      }
      job.done = { c, donor, ours, out, tag, decFile, winW, sib, said, screen, printsFile };
    }
    /* одно решение по номеру без экрана закрыло на разных экранах разные движения — то, ради чего ключи с экраном */
    for (const [key, l] of byNumber) {
      const kinds = new Map(l.map((x) => [x.screen, x.what])); const show = new Map(l.map((x) => [x.screen, x.show]));
      if (kinds.size > 1 && new Set(kinds.values()).size > 1) for (const x of l) { x.c.warnings.push(`решение «${key}» без экрана закрыло разные движения: ${[...show].map(([s, w]) => `${s} — ${w}`).join('; ')}. Номера mNN у экранов свои — запишите с экраном: ${[...kinds.keys()].map((s) => `«${key}:${s}»`).join(', ')}`); x.said.add(key); }
    }
    /* об одном ключе — одно сообщение: закрыл разные движения в этом запуске (выше) → про соседний экран и общую заметку
       «по номеру без экрана» о нём уже не повторяем (было три сообщения про один m11) */
    for (const job of jobs) {
      const { c, winW, sib, said, screen } = job.done;
      for (const { v, sf, clash: all } of sib) {
        const clash = all.filter(({ r }) => !said.has(r.key)); if (!clash.length) continue;
        const own = !!(opt.decisions && opt.decisions !== true);
        const msg = `решения по номеру без экрана (${clash.map(({ r }) => r.key).join(', ')}): у экрана ${v} (${path.basename(sf)}) под этими номерами другие движения — ${clash.slice(0, 3).map(({ r, t }) => `${r.key}: здесь ${kindRu(r.d)} ${r.d.target}, там ${kindRu(t)} ${t.target}`).join('; ')}${clash.length > 3 ? ' …' : ''}. ${own ? 'Если этот файл решений пойдёт и на тот экран, они закроют там чужие строки' : 'Файл решений один на прогон — на том экране они закроют чужие строки'}: запишите с экраном («${clash[0].r.key}:${screen}»)`;
        if (own) c.notes.push(msg); else c.warnings.push(msg);
        for (const { r } of clash) said.add(r.key);
      }
      const at = c.notes.findIndex((n) => n.startsWith('решения по номеру без экрана: ')); const rest = c.bareKeys.filter((k) => !said.has(k));
      if (at >= 0) { if (rest.length) c.notes[at] = bareNote(rest, screen); else c.notes.splice(at, 1); }
      if (c.verdict === 'OK' && (winW.length || c.warnings.length)) c.verdict = 'WARN';
    }
    for (const job of jobs) {
      const { c, donor, ours, out, tag, decFile, winW, printsFile } = job.done;
      const proto = { url: ours.url, donor: donor.url, viewport: ours.viewport, donorViewport: donor.viewport, takenAt: new Date().toISOString(), verdict: c.verdict, ...(ours.windows ? { windows: ours.windows } : {}), decisionsFile: fs.existsSync(decFile) ? decFile : null, ...(fs.existsSync(printsFile) ? { decisionPrints: printsFile } : {}),
        counts: { ok: c.rows.filter((r) => r.status === 'OK').length, otherKind: c.other, unplaced: c.unplaced, differs: c.rows.filter((r) => /^ОТЛИЧАЕТСЯ/.test(r.status)).length, missing: c.miss, decided: c.rows.filter((r) => r.status === 'РЕШЕНО').length, unchecked: c.unchecked },
        ...(c.warnings.length ? { warnings: c.warnings } : {}), ...(c.notes.length ? { decisionNotes: c.notes } : {}),
        /* status — уровень (OK, WARN, FAIL, INFO), match — статус сверки словом, ours — наши номера пары, cross — пара другим видом,
           placeChecked: false — пара другим видом засчитана по числам, место на странице не сверено */
        steps: c.rows.map((r) => ({ status: rowLevel(r), match: r.status, what: `${r.d.id} ${KIND_RU[r.d.kind] || r.d.kind} ${r.d.target}${r.d.count > 1 ? ` ×${r.d.count}` : ''}`, ours: (r.os || []).map((o) => o.id), ...(r.cross ? { cross: true } : {}), ...(r.unplaced ? { placeChecked: false } : {}), ...(r.key ? { decisionKey: r.key } : {}), details: [r.o ? `у нас ${oursOf(r)}` : 'у нас нет', ...r.diffs, ...(r.notes || []), r.decision].filter(Boolean).join('; ') })),
        extra: c.extra.map((o) => ({ id: o.id, kind: o.kind, target: o.target })) };
      writeJson(path.join(out, 'motion', `${tag}.json`), proto);
      fs.writeFileSync(path.join(out, 'motion', `${tag}.md`), mdCompare(c, donor, ours));
      if (jobs.length > 1) console.log(`\n== ${job.donorFile} → ${job.ourArg}${job.multi ? ` (${job.vp})` : ''}`);
      for (const r of c.rows) console.log(`${rowLevel(r).padEnd(4)} ${r.d.id} ${KIND_RU[r.d.kind] || r.d.kind}${r.d.sub ? ` (${r.d.sub})` : ''} ${r.d.target}${r.d.count > 1 ? ` ×${r.d.count}` : ''} → ${r.o ? oursOf(r) : r.status === 'НЕ ПРОВЕРЯЛОСЬ' ? 'не проверялось' : 'нет'}${r.cross || /^ОТЛИЧАЕТСЯ/.test(r.status) ? ` — ${r.status}` : ''}${r.diffs.length ? ` — ${r.diffs.join('; ')}` : ''}${r.notes && r.notes.length ? ` — ${r.notes.join('; ')}` : ''}${r.decision ? ` — решение (${r.key}): ${r.decision}` : r.status === 'НЕТ' && r.d.parent && r.d.count > 1 ? ` — решение на группу: "${r.d.kind}:${r.d.parent} > *"` : ''}`);
      console.log(`своё (у донора нет): ${c.extra.length}${c.extra.length ? ' — ' + c.extra.slice(0, 8).map((o) => `${o.id} ${KIND_RU[o.kind] || o.kind}`).join(', ') : ''}`);
      for (const n of c.notes) console.log(`INFO решения: ${n}`);
      for (const w of c.warnings) console.log(`WARN ${w}`);
      if (winW.length) console.log(`WARN наш снимок — с предупреждениями окон и lib (${winW.length}): ${winW[0].slice(0, 160)}${winW.length > 1 ? ' …' : ''} — windows в json`);
      console.log(`${c.verdict}: сверка движения${c.other ? ` (тот же приём другим видом: ${c.other}${c.unplaced ? `, из них без сверки места: ${c.unplaced}` : ''})` : ''}${c.unchecked ? ` (не проверялось у нас: ${c.unchecked})` : ''} · ${path.join(out, 'motion', `${tag}.md`)}`);
      if (rank[c.verdict] > rank[worst]) worst = c.verdict;
    }
  } finally { if (browser) await browser.close().catch(() => {}); }
  if (jobs.length > 1) console.log(`\n${worst}: пар ${jobs.length}`);
  process.exit(worst === 'FAIL' ? 1 : 0);
}

/* инвентарь: одна или несколько страниц, один или несколько экранов — один браузер на всё */
const runs = pagePlan();
const out = runDir(opt, runs[0].url);
const browser = await launch();
const summary = [];
try {
  for (const r of runs) {
    if (runs.length > 1) console.log(`\n== ${r.tag}: ${r.url} (${r.vp})`);
    let res;
    try { res = await inventory(r.url, r.vp, { out, tag: r.tag, ...phases, debug: !!opt.debug, browser }); } catch (e) { console.log(`FAIL ${r.tag}: ${String(e.message || e).slice(0, 200)}`); summary.push({ ...r, error: String(e.message || e).slice(0, 120) }); continue; }
    writeJson(path.join(out, 'motion', `${r.tag}.json`), res);
    fs.writeFileSync(path.join(out, 'motion', `${r.tag}.md`), mdTable(res));
    const byKind = {}; for (const it of res.items) byKind[KIND_RU[it.kind] || it.kind] = (byKind[KIND_RU[it.kind] || it.kind] || 0) + (it.count || 1);
    console.log(`Найдено движений: ${res.items.length} (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ') || 'нет'})`);
    for (const it of res.items) console.log(`  ${it.id} ${KIND_RU[it.kind] || it.kind}${it.sub ? ` (${it.sub})` : ''} — ${it.target}${it.count > 1 ? ` ×${it.count}` : ''}: ${it.props.map((p) => `${p.prop} ${p.from}→${p.to}`).join('; ').slice(0, 110)} · ${describeTiming(it).slice(0, 80)}`);
    if (res.notes.length) for (const n of res.notes) console.log(`WARN ${n}`);
    /* вердикт инвентаря: WARN — окно при загрузке, итог SITE_REWORK_DISMISS или свой стиль (строки выше и windows в json) */
    console.log(`${res.verdict}: инвентарь движения${res.verdict !== 'OK' ? ` (окна и lib: ${res.windows.warnings.length} предупреждений — windows в json)` : ''} · ${path.join(out, 'motion', `${r.tag}.md`)}`);
    summary.push({ ...r, items: res.items.length, byKind, verdict: res.verdict });
  }
} finally { await browser.close().catch(() => {}); }
if (runs.length > 1) {
  console.log(`\nСтраниц ${new Set(runs.map((r) => r.url)).size}, экранов ${new Set(runs.map((r) => r.vp)).size}, протоколов ${summary.filter((s) => !s.error).length} из ${runs.length}:`);
  for (const s of summary) console.log(`  ${s.error ? 'FAIL' : (s.verdict || 'OK').padEnd(4)} ${s.tag.padEnd(28)} ${s.error ? s.error : `${s.items} движений (${Object.entries(s.byKind).map(([k, n]) => `${k} ${n}`).join(', ') || 'нет'})`}`);
}
process.exit(summary.some((s) => s.error) ? 1 : 0);
