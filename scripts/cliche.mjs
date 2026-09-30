#!/usr/bin/env node
/**
 * cliche.mjs — шаблонность страницы числами и сравнение с донором.
 *
 * Ищет приёмы, которые модель ставит «по умолчанию» (форма-набор с подписями
 * капсом и пилюлей, надзаголовок, шаги 01/02/03, плюс в кружке, зебра секций,
 * огромное слово в подвале, акцент там, где у донора его нет, своя «похожая»
 * гарнитура вместо гарнитуры донора…), и для каждого печатает: правило, сколько
 * раз, долю страницы, селекторы и пометку относительно донора:
 *   есть у донора       — это язык донора, шаблоном не считается;
 *   НЕТ У ДОНОРА        — у донора этого приёма нет: нужна причина или переделка;
 *   размножено ×N       — приём донора, но чаще, чем у донора, больше чем вдвое;
 *   ЗАПРЕЩЁН            — пользователь отверг этот приём (журнал вкуса, --taste);
 *   ВОПРОС              — запрет пользователя спорит с явной чертой нового донора:
 *                         спросить пользователя, а не блокировать молча.
 *
 *   node cliche.mjs <url> [--baseline <json>[,<json>…]] [--taste [папка]] [--viewport desktop,mobile]
 *                         [--run <папка прогона>] [--decisions <json>] [--tag <имя>] [--shot] [--json <файл>|-]
 *   node cliche.mjs baseline <url донора> [--pages "/,/menu"] [--out <файл.json|папка>] [--viewport desktop,mobile]
 *   node cliche.mjs rules [--json]
 *   node cliche.mjs selftest [--no-browser]        (то же: --selftest)
 *   node cliche.mjs --help
 *
 * Флаги:
 *   --baseline <json>  база: файл `cliche.mjs baseline` донора (или результат прогона сайта «до»).
 *                      Без базы — только список черт страницы, вердикт по запретам и весу 3.
 *                      Несколько файлов — через запятую или флагом повторно: приём «есть у донора»,
 *                      если он есть хоть в одном (страницы донора, снятые отдельно); у правила
 *                      в пометке — страница донора, где он найден («у донора 8 на /menu»).
 *   --pages "/,/a"     baseline: страницы донора от адреса — каждая меряется, база одна: приём есть хоть
 *                      на одной (у правила — страница, где он сильнее); в файле pages и perPage. Без
 *                      baseline — ошибка (код 2): страницы своего сайта — отдельными запусками с --tag.
 *   --tag <имя>        имя прогона в файлах: <run>/cliche/cliche-<имя>.json и cliche-<имя>-<экран>.png
 *                      (baseline — cliche-baseline-<имя>.json); без тега — cliche.json, как раньше, и
 *                      прогоны «до» и «после» друг друга затирают. Буквы, цифры, «-», «_», «.».
 *   --selftest         (или команда selftest) сравнение, слияние баз, обоснования, флаги — без браузера;
 *                      стенды fixtures/cliche (скрытое и закрытые меню, заголовки на div, одна метка капсом,
 *                      обоснования с block у правил CSS, --tag, baseline --pages) — в браузере.
 *   --no-browser       selftest без стендов в браузере.
 *   --taste [папка]    запреты пользователя из журнала вкуса (taste.mjs); без папки —
 *                      SITE_REWORK_TASTE или ~/.claude/site-rework/taste. Действуют общие запреты
 *                      (область general и старые записи без области) и запреты с областью site
 *                      этого прогона: имя папки --run (или найденной от базы) сверяется с полем run
 *                      записи. Запреты других прогонов не действуют — печатается только их число.
 *   --viewport <list>  экраны через запятую (пресеты lib.mjs или ШxВ@плотность). По умолчанию —
 *                      экраны из базы, без базы — desktop (в режиме baseline — desktop,mobile).
 *                      Сравнивать можно только одинаковые экраны. --viewports — то же самое (как в
 *                      discover, a11y, perf): оба сразу с разными списками — ошибка; повтор экрана
 *                      в списке снимается один раз. Флаг без списка или неизвестный экран — код 2.
 *   --run <папка>      папка прогона (синоним --out): там ищется authorship-decisions.json, туда
 *                      пишутся cliche/cliche.json и снимки. По умолчанию — папка, найденная от файла
 *                      базы вверх (до 3 уровней), где лежит state.json или authorship-decisions.json;
 *                      иначе runDir (lib.mjs): ~/.claude/site-rework/runs/<адрес>.
 *   --decisions <json> файл обоснований, если он не в папке прогона.
 *   --shot             снимок страницы с обводкой того, что пошло в счёт: <run>/cliche/cliche[-<tag>]-<экран>.png
 *   --json <файл>|-    куда записать итог (по умолчанию <run>/cliche/cliche[-<tag>].json); «-» — JSON в
 *                      stdout вместо текста.
 *   --out              в режиме baseline: файл .json или папка (там cliche-baseline.json).
 *   --strict           принимается для единообразия с другими скриптами: FAIL и так даёт код 1.
 *   --help, -h, --h    эта справка.
 *
 * Как сравнивается (исправление по аудиту A12):
 *   декоративные приёмы (режим length: надзаголовок, двоеточие в заголовках, бегущая строка,
 *     мелкий капс с разрядкой, мелкий текст, градиентный текст, курсив-акцент) — частота на
 *     10 000 px высоты страницы; «размножено», если здесь их больше, чем у донора, и частота
 *     выше донорской больше чем в 2 раза;
 *   функциональные (режим share: пилюли среди кнопок, одно скругление среди коробок) — доля
 *     внутри своего класса, а не частота: у витрины кнопок просто больше;
 *   остальные (режим role: форма-набор, 01/02/03, карточки по типу…) — есть приём у донора
 *     или нет; роль зашита в правило (фото-карточки ≠ карточки с иконками);
 *   base — только с базой: гарнитуры, которых у донора нет (font-swapped); акцент
 *     сравнивается по оттенку (accent-added).
 *
 * Кнопка — a, button, [role=button], input[type=submit|button] высотой 24–90 px с заливкой или рамкой:
 *   своей или у вложенного блока на всю коробку (Framer: <a> без фона, внутри div с заливкой). Текст
 *   кнопки — цвет видимого текста внутри, а не самого <a> (у Framer он синий по умолчанию).
 * Акцент (одно правило с extract и discover) — цвет действий: заливка залитых кнопок и ссылок-кнопок,
 *   кнопки первого экрана — первыми; насыщенной заливки нет — цвет ссылок при наведении (мышь наводится на
 *   до 8 текстовых ссылок разного вида); фоны секций, шапки и подвала — не акцент. Рамка и текст кнопки и
 *   насыщенные плашки-метки тоже идут в счёт приёма. Пиксели не сверяются — только стили тех же коробок.
 * Фото-карточки — сетка, где у ≥75% карточек картинка занимает ≥35% площади: плитка «ещё» того же размера
 *   без картинки — часть сетки. Перед замером страница проходится до низа, картинки, которые прокрутка
 *   запустила, догружаются (до 4 с); ещё не загруженная <img> считается по атрибутам width/height.
 * Скрытое не в счёт: display и visibility (checkVisibility), закреплённое (fixed) целиком за окном — меню,
 *   уехавшее вверх или вбок transform'ом; прочее левее или правее страницы и выше её верха; обрезанное — overflow
 *   предков и форма clip-path (inset, circle, ellipse, polygon: прямоугольник, в который вписана форма) или clip: rect()
 *   у себя и предков: sr-only, шторка «inset(0 0 100% 0)», меню-круг «circle(0 at 100% 0)»; ссылки, кнопки и поля под
 *   aria-hidden="true" или inert (дубль слайда, закрытая панель). Видимое украшение под aria-hidden (огромное слово в
 *   подвале) — в счёт: его видно. Стенды: fixtures/cliche/hidden.html, closed-menus.html (19 способов закрыть меню).
 * Заголовок — по роли: h1–h3, [role=heading] уровня 1–3 и крупная надпись-блок (div, p, span) от max(24 px,
 *   основной кегль × 1.15), не ссылка и не в шапке; основной кегль — больше всего знаков в абзацах от 40 знаков.
 *   Идёт в надзаголовок (eyebrow), двоеточие (heading-colon) и section-template: у mamuka.rest нет h1–h6.
 * Порог приёма — только у проверяемой страницы: caps-microlabel от 4 меток (меньше — «ниже порога», не в
 *   счёт); у донора метки пишутся от одной — две метки «ПРОШЕДШИЕ» уже его язык.
 * section-template у донора: разделов с заголовком меньше 4, но заголовки одного стиля (от 2, ≥ 75%) — «есть у
 *   донора»; разделы не выделены (уже 90% ширины), но крупные заголовки страницы (от 28 px, кроме h1 и подвала)
 *   одного стиля — тоже; заголовков у донора нет вовсе — «не измерено у донора» (WARN), а не «нет».
 * Окна перед замером закрываются, как у discover (closeConsent): cookie и SITE_REWORK_DISMISS — окно выбора
 *   города mamuka.rest иначе лежит поверх каждой страницы донора; итог — open.consent и строка «окно». Выбор в окне
 *   увёл на другую страницу (mamuka.rest/menu → главная) — адрес открывается заново и мерится он (open.consent.movedTo).
 *
 * Tilda-донор: служебное конструктора (плашка Made on Tilda, t-mbfix, полоса T360 — IS_TILDA_SERVICE_FN) и обрезанное
 *   артбордом (заглушка «Zero Block») — вне индекса; кегли и радиусы — на экране, computed × zoom (Zero Block при
 *   upscale=window: madeon 40 → 48 px); ленивые — по data-original и .t-bgimg (loading=lazy у Tilda нет).
 * Слова-пустышки (copy-buzz) — общий словарь copy-rules.mjs (buzzSource) с границами слова: «лучш» внутри «улучшим» не
 *   ловится. WARN из lib (свой стиль не вставился) — в вердикт экрана и json (warnings), а не посреди вывода.
 *
 * Вердикт экрана:
 *   FAIL — есть ЗАПРЕЩЁН; правило веса 3 «НЕТ У ДОНОРА» без записи в authorship-decisions.json;
 *          «размножено» больше ×2 у правила веса 2–3 (обоснование этого не снимает — снизить частоту);
 *   WARN — «НЕТ У ДОНОРА» веса 1–2 без записи; «размножено» у правила веса 1; ВОПРОС пользователю;
 *          «не измерено у донора» без записи; нет базы (тогда правило веса 3 без записи — WARN, а не FAIL);
 *   OK   — остальное. Индекс = сумма весов правил в счёте (+ вес ещё раз за запрет) — для
 *          сравнения «до/после», сам по себе ничего не значит.
 *
 * authorship-decisions.json (в папке прогона) — правило → блок → почему:
 *   [{ "rule": "photo-cards", "page": "/", "block": "#mhDishes", "why": "сетка блюд донора с /menu" }]
 *   page — путь страницы («/», «/menu»; список через запятую или массив; «*» — все), block — CSS-селектор блока
 *   (находка внутри него — el.closest): обоснование снимает правило только на этих страницах и только у
 *   находок в этих блоках; остальные находки правила — «обосновано N из M», FAIL/WARN как без обоснования.
 *   block с кириллицей, «метка: …» или словом, которое не тег HTML («hero», «hero cards»), — подпись, не селектор.
 *   Прежний вид { "правило": { "метка": "почему" } } (или { "метка": { "why", "page", "block" } }) и список
 *   [{ "rule", "block": "hero", "why" }] без page и селектора — на всех страницах, как раньше.
 *   Правила по тексту CSS (bounce-ease, hover-lift, transition-all) своего элемента не имеют: находка ведётся к
 *   элементам селектора своего правила (у «--spring: cubic-bezier(…)» — правил с var(--spring)), блок её покрывает,
 *   если в нём все эти элементы. Селектор ничего не нашёл (@keyframes 50%, :root) — в причине «page без block».
 *   Селектор, которого на странице нет или который неверен, назван в причине. Ключи с «_» — комментарии.
 *   Обоснование снимает только «НЕТ У ДОНОРА». Запрет снимает только пользователь
 *   (taste.mjs add --by user --verdict accepted …).
 *
 * Коды выхода: 0 — OK или WARN; 1 — FAIL; 2 — неверные аргументы (нет адреса, флаг без значения,
 * неизвестный экран) или файл; 3 — страница не открылась или упал браузер.
 *
 * Детектор врёт в обе стороны. Известные ложные срабатывания прототипа учтены: «небо» bureau.ru
 * (стопка из 10 градиентных слоёв одного размера — считается только видимый слой и только если
 * соседние слои не разноцветные), значок «Working…» linear.app (бегущая строка — от половины
 * ширины экрана), бледный градиент linear.app (ai-palette — только насыщенные точки). Смысла он
 * не видит: подпись капсом у донора и у нас выглядят одинаково, поэтому решает сравнение с донором.
 *
 * Экспорт: RULES, MODES, measureViewport, compareResult, loadDecisions, pageMatches, mergeResults, mergeBaselines,
 *   printResult.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launch, preparePage, gotoRetry, onPageLogReset, waitForOverlay, forceInstantScroll, scrollThrough, scrollToY, evaluateWith, hexColors,
  EFFECTIVE_OPACITY_FN, HEX_FN, parseArgs, pickViewports, parseViewport, runDir, writeJson, readJson, ensureDir, sleep, slugFromUrl,
  EFFECTIVE_ZOOM_FN, IS_TILDA_SERVICE_FN, collectWarnings, takeWarnings, closeConsent, pagesFrom,
} from './lib.mjs';
/* необязательное из lib (checkOpenModal — проверка открытого окна после closeConsent): есть не во всех версиях */
import * as LIB from './lib.mjs';
import { tasteDir, activeBans, bansElsewhere, readJournal, baselineResult, conflictsWith, runKey } from './taste.mjs';
/* общий словарь пустых оценок (copy-buzz) — один на cliche.mjs и copy.mjs; английские слова — здесь */
import { buzzSource } from './copy-rules.mjs';
/* словарь в страницу — исходником RegExp для evaluateWith (buzz). Границы слова (?<![\p{L}\d])…(?![\p{L}\d]):
   «лучш» не ловится внутри «улучшим», «уникальн» — внутри «неуникальный»; свои основы — те, что жили в cliche */
const BUZZ_EXTRA = ['погрузит\\S*', 'откройте для себя', 'новый уровень', 'supercharg\\S*', 'elevate', 'unlock', 'seamless\\S*', 'empower\\S*', 'effortless\\S*', 'next-level'];
const BUZZ_RE = `new RegExp(${JSON.stringify(buzzSource({ extra: BUZZ_EXTRA }))}, 'giu')`;

/* ---------- каталог: вес 3 — сильный признак, 2 — средний, 1 — слабый; id совпадают с reference/authorship.md ---------- */
export const RULES = {
  'form-kit': { w: 3, mode: 'role', t: 'форма-набор: подписи капсом над коробками полей, пилюля «Отправить», «не обязательно» мелко' },
  'eyebrow': { w: 3, mode: 'length', t: 'надзаголовок: подпись капсом с разрядкой прямо над крупным заголовком' },
  'numbered-steps': { w: 3, mode: 'role', t: 'шаги 01 / 02 / 03 над одинаковыми колонками' },
  'faq-plus': { w: 3, mode: 'role', t: 'аккордеон вопросов с плюсом или шевроном (в кружке)' },
  'icon-cards': { w: 3, mode: 'role', t: 'сетка одинаковых карточек «иконка + заголовок + текст»' },
  'stat-row': { w: 3, mode: 'role', t: 'полоса цифр-достижений «10+ лет, 500 клиентов»' },
  'trusted-logos': { w: 3, mode: 'role', t: 'полоса серых логотипов «нам доверяют»' },
  'glass': { w: 3, mode: 'role', t: 'стеклянные панели (backdrop-filter: blur)' },
  'gradient-blob': { w: 3, mode: 'role', t: 'размытые цветные пятна, свечение' },
  'gradient-text': { w: 3, mode: 'length', t: 'градиентный текст' },
  'ai-palette': { w: 3, mode: 'role', t: 'сине-фиолетовый градиент, неон на тёмном' },
  'italic-serif-accent': { w: 3, mode: 'length', t: 'одно слово курсивной антиквой в гротесковом заголовке' },
  'left-stripe': { w: 3, mode: 'role', t: 'цветная полоска слева у карточки' },
  'centered-hero': { w: 2, mode: 'role', t: 'первый экран по центру' },
  'hero-two-ctas': { w: 2, mode: 'role', t: 'две кнопки рядом на первом экране (залитая + контурная)' },
  'caps-microlabel': { w: 2, mode: 'length', min: 4, t: 'мелкий капс с разрядкой на подписях, ценах, подвале' },
  'pill-everywhere': { w: 2, mode: 'share', t: 'все кнопки — пилюли' },
  'uniform-radius': { w: 2, mode: 'share', t: 'одно скругление 6–20 px на всех коробках' },
  'soft-shadow': { w: 2, mode: 'role', t: 'мягкая тень «0 20 40» под карточками' },
  'fade-up-reveal': { w: 2, mode: 'role', t: 'каждый блок выезжает снизу с проявлением' },
  'hover-lift': { w: 2, mode: 'role', t: 'подъём на 2–8 px при наведении' },
  'heading-colon': { w: 2, mode: 'length', t: 'двоеточие в конце заголовков секций' },
  'marquee': { w: 2, mode: 'length', t: 'бегущая строка со слоганами через «•»' },
  'giant-footer-word': { w: 2, mode: 'role', t: 'огромное слово-логотип в подвале' },
  'section-template': { w: 2, mode: 'role', t: 'все секции собраны одинаково: заголовок одного стиля → содержимое' },
  'alternating-bands': { w: 2, mode: 'role', t: 'фоны секций строго чередуются (зебра)' },
  'equal-cards': { w: 2, mode: 'role', t: 'сетка одинаковых текстовых карточек' },
  'no-photos': { w: 2, mode: 'role', t: 'на странице нет ни одной фотографии' },
  'accent-added': { w: 2, mode: 'role', t: 'насыщенный цвет-акцент на кнопках и метках (у донора акцента нет или он другого цвета)' },
  'font-swapped': { w: 2, mode: 'base', t: 'гарнитура, которой нет у донора: его шрифт заменён своим «похожим»' },
  'demo-badges': { w: 2, mode: 'role', t: 'метки «демо» и мелкие оговорки россыпью по секциям' },
  'photo-cards': { w: 1, mode: 'role', t: 'сетка одинаковых фото-карточек' },
  'footer-columns': { w: 1, mode: 'role', t: 'подвал колонками с капс-заголовками' },
  'overused-font': { w: 1, mode: 'role', t: 'гарнитура из «ИИ-набора» (Inter, Geist, Manrope, Space Grotesk…)' },
  'fine-print': { w: 1, mode: 'length', t: 'мелкий текст меньше 12 px по всей странице' },
  'transition-all': { w: 1, mode: 'role', t: 'transition: all' },
  'bounce-ease': { w: 1, mode: 'role', t: 'пружинящая кривая (cubic-bezier с перелётом)' },
  'copy-buzz': { w: 1, mode: 'role', t: 'слова-пустышки в текстах' },
  'copy-triad': { w: 1, mode: 'role', t: 'триады «Быстро. Надёжно. Удобно.»' },
};
export const MODES = {
  length: 'частота на 10 000 px высоты против донора (декоративные)',
  share: 'доля внутри своего класса против донора (функциональные)',
  role: 'есть у донора или нет',
  base: 'только с базой: сравнение с донором напрямую',
};
/* правила по тексту CSS: своего элемента у находки нет — только селектор правила (обоснование с block — по его элементам) */
const CSS_RULES = new Set(['hover-lift', 'transition-all', 'bounce-ease']);
const W3 = '███', W2 = '██░', W1 = '█░░';
const WMARK = { 3: W3, 2: W2, 1: W1 };

const HELP = `cliche.mjs — шаблонность страницы числами и сравнение с донором

  node cliche.mjs <url> [--baseline <json>[,<json>…]] [--taste [папка]] [--viewport desktop,mobile]
                        [--run <папка прогона>] [--decisions <json>] [--tag <имя>] [--shot] [--json <файл>|-]
  node cliche.mjs baseline <url донора> [--pages "/,/menu"] [--out <файл.json|папка>] [--viewport desktop,mobile]
  node cliche.mjs rules [--json]
  node cliche.mjs selftest [--no-browser]        (то же: --selftest)
  node cliche.mjs --help

Флаги:
  --baseline <json>  база: файл «cliche.mjs baseline» донора (или результат прогона сайта «до»).
                     Без базы — только список черт страницы; вердикт по запретам и весу 3.
                     Несколько файлов — через запятую или флагом повторно: приём «есть у донора»,
                     если он есть хоть в одном («у донора 8 на /menu»).
  --pages "/,/a"     baseline: страницы донора от адреса; база одна — приём есть хоть на одной
                     странице (pages и perPage в файле). Без baseline — код 2.
  --tag <имя>        имя прогона в файлах: cliche/cliche-<имя>.json и cliche-<имя>-<экран>.png
                     (baseline — cliche-baseline-<имя>.json); без тега — cliche.json, как раньше.
  --selftest         (или команда selftest) проверки без браузера и стенды fixtures/cliche.
  --no-browser       selftest без стендов в браузере.
  --taste [папка]    запреты пользователя из журнала вкуса (taste.mjs); без папки —
                     SITE_REWORK_TASTE или ~/.claude/site-rework/taste. Действуют общие запреты и
                     запреты с областью site этого прогона (имя папки --run сверяется с полем run
                     записи); запреты других прогонов не действуют.
  --viewport <list>  экраны через запятую (desktop, laptop, tablet, mobile, mobile-s, android или
                     ШxВ@плотность). По умолчанию — экраны из базы, без базы — desktop
                     (baseline — desktop,mobile). --viewports — то же самое; оба сразу
                     с разными списками — ошибка (код 2).
  --run <папка>      папка прогона (синоним --out): там authorship-decisions.json, туда
                     cliche/cliche.json и снимки. По умолчанию — папка с state.json или
                     authorship-decisions.json от файла базы вверх (до 3 уровней), иначе
                     ~/.claude/site-rework/runs/<адрес>.
  --decisions <json> файл обоснований, если он не в папке прогона.
  --shot             снимок с обводкой того, что пошло в счёт: <run>/cliche/cliche[-<tag>]-<экран>.png
  --json <файл>|-    куда записать итог (по умолчанию <run>/cliche/cliche[-<tag>].json); «-» — JSON в stdout.
  --out              в режиме baseline: файл .json или папка (там cliche-baseline.json).
  --strict           как у других скриптов; FAIL и без него даёт код 1.
  --help, -h, --h    эта справка.

Пометки: есть у донора · НЕТ У ДОНОРА · размножено ×N · ЗАПРЕЩЁН пользователем · ВОПРОС пользователю ·
ниже порога (caps-microlabel меньше 4 у проверяемой страницы) · не измерено у донора (section-template).
Скрытое не в счёт: display, visibility, закреплённое целиком за окном (закрытое меню), вне страницы,
обрезанное overflow или формой clip-path / clip (sr-only, шторка inset(0 0 100% 0), круг circle(0));
ссылки и кнопки под aria-hidden или inert. Видимое украшение под aria-hidden — в счёт.
Заголовок — по роли: h1–h3, role=heading и крупная надпись на div/p от max(24 px, основной × 1.15).
Окна (cookie, SITE_REWORK_DISMISS) перед замером закрываются, как у discover; выбор в окне увёл на
другую страницу — адрес открывается заново («увело на … — адрес открыт заново»).
Сравнение: декоративные приёмы (length) — частота на 10 000 px страницы, «размножено» при > ×2;
функциональные (share) — доля внутри своего класса (пилюли среди кнопок); остальные (role) — есть
у донора или нет; font-swapped и accent-added сверяются с базой по гарнитурам и оттенку.
Кнопка — с заливкой или рамкой своей или у вложенного блока на всю коробку (<a> Framer).
Акцент — цвет действий: заливка кнопок (первый экран первым); заливок нет — цвет ссылок при
наведении; фоны секций, шапки и подвала — не акцент. Фото-сетка — картинка у ≥75% карточек
(плитка «ещё» без картинки — часть сетки); картинки, запущенные прокруткой, догружаются до замера.
База версии ниже 4 снята до этих правил — пересобрать (cliche.mjs baseline … --pages).

Вердикт: FAIL — ЗАПРЕЩЁН; вес 3 «НЕТ У ДОНОРА» без обоснования; «размножено» > ×2 (вес 2–3).
         WARN — «НЕТ У ДОНОРА» веса 1–2 без обоснования; «размножено» веса 1; ВОПРОС;
         «не измерено у донора»; нет базы.
         OK — остальное.
Обоснования: <run>/authorship-decisions.json — [{ "rule", "page": "/путь", "block": "#селектор", "why" }]:
только на этих страницах и у находок в этом блоке (остальные — «обосновано N из M»); без page и
селектора ({ "правило": { "метка": "почему" } }, block-подпись «hero») — на всех страницах. У правил
CSS (bounce-ease, hover-lift, transition-all) блок — по элементам селектора правила; нет элементов —
только page. Снимают только «НЕТ У ДОНОРА».
Запрет снимает только пользователь (taste.mjs add --by user --verdict accepted).

Коды выхода: 0 — OK/WARN, 1 — FAIL, 2 — неверные аргументы (нет адреса, флаг без значения,
неизвестный экран) или файл, 3 — страница не открылась.
Список правил с весами: node cliche.mjs rules`;

/* ======================================================================
   В странице: всё, что считается по вычисленным стилям.
   Зависимости (evaluateWith): eff — итоговая непрозрачность, hex — любой CSS-цвет в #RRGGBB[AA], zoom — итоговый
   CSS zoom (Tilda Zero Block при upscale=window: кегль и радиус на экране = computed × zoom), svc — служебное Tilda
   (плашка Made on Tilda, t-mbfix, полоса T360 — вне индекса), buzz — словарь пустых оценок (copy-rules.mjs).
   ====================================================================== */
function inPage({ ids: RULE_IDS, blocks: BLOCK_SELS = [] }) {
  const vw = innerWidth, vh = innerHeight;
  const docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const found = Object.fromEntries(RULE_IDS.map((id) => [id, { items: [], info: {} }]));
  const cs = (el, p) => getComputedStyle(el, p);
  const px = (v) => parseFloat(v) || 0;
  const zM = new Map(); const Z = (el) => { let v = zM.get(el); if (v === undefined) { v = zoom(el) || 1; zM.set(el, v); } return v; };
  /* кегль на экране: computed × zoom (у Tilda Zero Block при upscale=window computed мельче экрана: madeon 40 → 48 px) */
  const fpx = (el) => { const v = px(cs(el).fontSize); const z = Z(el); return z === 1 ? v : Math.round(v * z * 100) / 100; };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
  /* обрезка формой у самого элемента: clip-path inset / circle / ellipse / polygon (прямоугольник, в который вписана
     форма) и clip: rect() у absolute и fixed — в пикселях его коробки { l, t, r, b }; null — не обрезает или форму не
     понять (url(), path()). Закрытая панель «clip-path: inset(0 0 100% 0)», «circle(0 at 100% 0)», «inset(50%)»,
     «clip: rect(0 0 0 0)» — пустой прямоугольник (второй круг 29.09: полноэкранная панель с двумя кнопками,
     закрытая clip-path, шла в hero-two-ctas и в master, и в копии). Форма — в своих координатах, в окно переводится
     при каждом вызове: страница прокручивается (ai-palette), и закреплённое едет вместе с окном */
  const shapeM = new Map();
  const lenOf = (v, ref) => { v = String(v || '').trim(); const k = { left: 0, top: 0, center: 50, right: 100, bottom: 100 }[v]; if (k !== undefined) return k / 100 * ref; if (/%$/.test(v)) return parseFloat(v) / 100 * ref; if (/px$/.test(v) || /^-?[\d.]+$/.test(v)) return parseFloat(v); return NaN; };
  const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const shapeLocal = (el) => {
    let v = shapeM.get(el); if (v !== undefined) return v; v = null;
    const s = cs(el); const cp = String(s.clipPath || 'none').trim(); const cl = String(s.clip || 'auto').trim();
    if (cp !== 'none' || /^rect\(/.test(cl)) {
      const w = el.offsetWidth || el.getBoundingClientRect().width, h = el.offsetHeight || el.getBoundingClientRect().height;
      const m = /^(inset|circle|ellipse|polygon)\((.*)\)/.exec(cp);
      if (m) {
        const body = m[2].trim();
        if (m[1] === 'inset') {
          const a = body.split(/\s+round\s+/)[0].trim().split(/\s+/);
          const t = lenOf(a[0], h), rt = lenOf(a[1] ?? a[0], w), b = lenOf(a[2] ?? a[0], h), l = lenOf(a[3] ?? a[1] ?? a[0], w);
          if ([t, rt, b, l].every(Number.isFinite)) v = { l, t, r: w - rt, b: h - b };
        } else if (m[1] === 'polygon') {
          const pts = splitTop(body.replace(/^(nonzero|evenodd)\s*,\s*/, '')).map((p) => p.split(/\s+/)).map(([x, y]) => [lenOf(x, w), lenOf(y, h)]);
          if (pts.length && pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) {
            let A = 0; pts.forEach(([x1, y1], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; A += x1 * y2 - x2 * y1; });
            const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
            v = Math.abs(A) / 2 < 1 ? { l: 0, t: 0, r: 0, b: 0 } : { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
          }
        } else {
          const [rad, at] = body.split(/\s+at\s+/);
          const pos = String(at || 'center center').trim().split(/\s+/);
          const cx = lenOf(pos[0], w), cy = lenOf(pos[1] ?? 'center', h);
          const rs = String(rad || '').trim().split(/\s+/).filter(Boolean);
          const side = (kw, ds) => (kw === 'farthest-side' ? Math.max(...ds) : kw === 'closest-side' ? Math.min(...ds) : NaN);
          const one = (x, ref, ds) => (/side$/.test(x) ? side(x, ds) : lenOf(x, ref));
          let rx, ry;
          if (m[1] === 'circle') rx = ry = one(rs[0] || 'closest-side', Math.hypot(w, h) / Math.SQRT2, [cx, w - cx, cy, h - cy]);
          else { rx = one(rs[0] || 'closest-side', w, [cx, w - cx]); ry = one(rs[1] || 'closest-side', h, [cy, h - cy]); }
          if ([cx, cy, rx, ry].every(Number.isFinite)) v = { l: cx - rx, t: cy - ry, r: cx + rx, b: cy + ry };
        }
      }
      /* clip: rect(верх, право, низ, лево) — только у absolute и fixed; auto — край коробки */
      const c = /^rect\((.*)\)$/.exec(cl);
      if (c && /absolute|fixed/.test(s.position)) {
        const a = c[1].split(/\s*,\s*|\s+/); const val = (x, d) => (x === 'auto' ? d : lenOf(x, 0));
        const q = { t: val(a[0], 0), r: val(a[1], w), b: val(a[2], h), l: val(a[3], 0) };
        if ([q.t, q.r, q.b, q.l].every(Number.isFinite)) v = v ? { l: Math.max(v.l, q.l), t: Math.max(v.t, q.t), r: Math.min(v.r, q.r), b: Math.min(v.b, q.b) } : q;
      }
    }
    shapeM.set(el, v); return v;
  };
  /* форма элемента в координатах окна (масштаб transform — по отношению коробки на экране к offsetWidth/Height) */
  const shapeBox = (el) => {
    const v = shapeLocal(el); if (!v) return null;
    const r = el.getBoundingClientRect(); const w = el.offsetWidth || r.width, h = el.offsetHeight || r.height;
    const kx = w ? r.width / w : 1, ky = h ? r.height / h : 1;
    return { L: r.left + v.l * kx, T: r.top + v.t * ky, R: r.left + v.r * kx, B: r.top + v.b * ky };
  };
  /* какая доля элемента не обрезана: предками с overflow hidden/clip (заглушка Tilda «Zero Block» лежит в артборде
     шириной 0 с overflow:hidden — в DOM она есть, на экране её нет) и формой clip-path / clip у себя и у предков */
  const clipShare = (el) => {
    const r = el.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
    const cut = (q) => { if (!q) return; L = Math.max(L, q.L); T = Math.max(T, q.T); R = Math.min(R, q.R); B = Math.min(B, q.B); };
    cut(shapeBox(el));
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/hidden|clip/.test(s.overflowX)) { const q = p.getBoundingClientRect(); L = Math.max(L, q.left); R = Math.min(R, q.right); }
      if (/hidden|clip/.test(s.overflowY)) { const q = p.getBoundingClientRect(); T = Math.max(T, q.top); B = Math.min(B, q.bottom); }
      cut(shapeBox(p));
      if (s.position === 'fixed') break;
    }
    return (Math.max(0, R - L) * Math.max(0, B - T)) / Math.max(1, r.width * r.height);
  };
  /* скрытое не в счёт (epicentr-mamuka 29.09: hero-two-ctas засчитывался по ссылкам закрытого бокового меню #drawer):
     display и visibility — через eff (checkVisibility); вне экрана — закреплённое (fixed у себя или предка) целиком
     за окном (меню, уехавшее вверх или вбок transform'ом), остальное — левее или правее страницы и выше её верха;
     обрезанное — clipShare: overflow предков и форма clip-path (inset, circle, ellipse, polygon) или clip: rect() у
     себя и предков — sr-only, закрытая панель «inset(0 0 100% 0)», меню-круг «circle(0 at 100% 0)»; действия (ссылка,
     кнопка, поле) под aria-hidden="true" или inert — не действия ни для кого (дубль слайда, закрытая панель).
     Видимое украшение под aria-hidden (огромное слово в подвале, дубль бегущей строки) — в счёт: его видно */
  const fixM = new Map();
  const fixedOf = (el) => { if (!el || el === document.body || el === document.documentElement) return false; let v = fixM.get(el); if (v === undefined) { v = cs(el).position === 'fixed' || fixedOf(el.parentElement); fixM.set(el, v); } return v; };
  const offscreen = (el, r) => (fixedOf(el) ? r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw : r.right + scrollX <= 0 || r.left + scrollX >= vw || r.bottom + scrollY <= 0);
  const ACTION = 'a, button, input, select, textarea, summary, [role=button], [role=link]';
  const muted = (el) => el.matches(ACTION) && !!el.closest('[aria-hidden="true"], [inert]');
  /* служебное Tilda — не язык страницы: вне индекса; обрезанное артбордом (заглушка «Zero Block») и формой отсекает clipShare */
  const visible = (el) => { if (!el || !el.getBoundingClientRect) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; if (offscreen(el, r) || muted(el)) return false; return eff(el) > 0.05 && clipShare(el) > 0.1 && !svc(el); };
  const sel = (el) => {
    const part = (e) => {
      if (e.id && !/^\d|rec\d/.test(e.id)) return '#' + CSS.escape(e.id);
      const cls = [...e.classList].filter((c) => !/^(is-|in$|t-rec|r$|loaded|t-animate)/.test(c)).slice(0, 2);
      return e.tagName.toLowerCase() + (cls.length ? '.' + cls.map((c) => CSS.escape(c)).join('.') : '');
    };
    const out = []; let e = el;
    for (let i = 0; e && e !== document.body && i < 3; i++) { const p = part(e); out.unshift(p); if (p.startsWith('#')) break; e = e.parentElement; }
    return out.join(' > ');
  };
  /* блоки из authorship-decisions.json (поле block — CSS-селектор): в каких из них лежит находка (el.closest) —
     обоснование с block снимает правило только там */
  const blocksOf = (el) => { const out = []; BLOCK_SELS.forEach((s, i) => { try { if (el.closest(s)) out.push(i); } catch { /* неверный селектор — видно по page.blocks */ } }); return out; };
  const add = (id, el, note, extra) => { if (!found[id]) return; const r = rectOf(el); found[id].items.push({ sel: sel(el), note: note || '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), ...(BLOCK_SELS.length ? { blocks: blocksOf(el) } : {}), ...(extra || {}) }); };
  /* цвет: {r,g,b,a} из любой CSS-записи (rgb, oklch, lab, color-mix…) через hex из lib.mjs */
  const col = (css) => { const h = hex(css); if (!h) return null; return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: h.length > 7 ? parseInt(h.slice(7, 9), 16) / 255 : 1 }; };
  const COLOR_RE = /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi;
  const colorsIn = (s) => [...String(s || '').matchAll(COLOR_RE)].map((m) => col(m[0])).filter(Boolean);
  const hexOf = (c) => (c ? '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase() : null);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const hue = (c) => { const r = c.r / 255, g = c.g / 255, b = c.b / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const d = mx - mn; if (d < 0.12) return null; let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; return (h * 60 + 360) % 360; };
  const hsl = (c) => { const r = c.r / 255, g = c.g / 255, b = c.b / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); return { s, l }; };
  const chroma = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = col(cs(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const isUpper = (el, t) => cs(el).textTransform === 'uppercase' || (/[A-ZА-ЯЁ]/.test(t) && t === t.toUpperCase());
  const lsEm = (el) => { const s = cs(el); const ls = s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing); return ls / (px(s.fontSize) || 16); };
  const radius = (el) => { const s = cs(el); const r = s.borderTopLeftRadius; return (r.endsWith('%') ? Math.min(el.offsetWidth, el.offsetHeight) * parseFloat(r) / 100 : px(r)) * Z(el); };
  const hasBorderAll = (s) => ['Top', 'Right', 'Bottom', 'Left'].every((k) => px(s['border' + k + 'Width']) >= 0.9 && s['border' + k + 'Style'] !== 'none');
  const shadows = (s) => {
    if (!s.boxShadow || s.boxShadow === 'none') return [];
    return s.boxShadow.split(/,(?![^(]*\))/).map((p) => { const c = colorsIn(p)[0] || null; const nums = p.replace(COLOR_RE, '').trim().split(/\s+/).filter((x) => /px$/.test(x)).map(px); return { c, x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, inset: /inset/.test(p) }; });
  };
  const inDoc = (r) => r.y >= -2 && r.y + r.h <= docH + 2 && r.x + r.w > 0 && r.x < vw;
  const all = [...document.querySelectorAll('body *')].filter((e) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION'].includes(e.tagName) && !(e instanceof SVGElement));
  const vis = all.filter(visible);
  /* кнопка — элемент действия с заливкой или рамкой: своей или у вложенного блока на всю его коробку
     (Framer: <a> без фона, внутри div с заливкой и скруглением — так сделана главная кнопка shapefest.com) */
  const painted = (el) => { const s = cs(el); const bg = col(s.backgroundColor); return (bg && bg.a > 0.3) || hasBorderAll(s); };
  const paintBox = (e) => {
    if (painted(e)) return e;
    const r = e.getBoundingClientRect(); const A = r.width * r.height;
    for (const d of e.querySelectorAll('*')) {
      if (d instanceof SVGElement) continue;
      const q = d.getBoundingClientRect(); const a = q.width * q.height;
      if (a < 0.8 * A || a > 1.25 * A || Math.abs(q.left - r.left) > r.width * 0.2 || Math.abs(q.top - r.top) > r.height * 0.2) continue;
      if (painted(d) && eff(d) > 0.05) return d;
    }
    return null;
  };
  const btnBox = new Map();
  for (const e of vis) {
    if (!e.matches('a, button, [role=button], input[type=submit], input[type=button]')) continue;
    const r = e.getBoundingClientRect(); if (r.height < 24 || r.height > 90 || r.width < 40) continue;
    const pb = paintBox(e); if (pb) btnBox.set(e, pb);
  }
  /* <a> вокруг <button> с той же коробкой — одна кнопка: считается внутренний элемент */
  const cands = [...btnBox.keys()];
  const buttonLike = cands.filter((e) => btnBox.get(e) === e || !cands.some((o) => o !== e && e.contains(o) && btnBox.get(o) === btnBox.get(e)));
  const boxOf = (b) => btnBox.get(b) || b;
  const paintBoxes = new Set(buttonLike.map(boxOf));
  const isPill = (e) => { const r = e.getBoundingClientRect(); return radius(e) >= Math.min(r.height, r.width) / 2 - 1.5; };

  /* ===== типографика ===== */
  /* заголовок по роли, а не по тегу (mamuka.rest: ни одного h1–h6, заголовки разделов — div и p 44/28 px, на телефоне
     мельче 40 px): h1–h3, [role=heading] уровня 1–3 и крупная надпись-блок — кегль от max(24 px, основной × 1.15),
     свой текст 2–120 знаков с буквами, не ссылка, не кнопка и не поле, не в шапке и меню, не внутри другого заголовка.
     Основной кегль — тот, которым набрано больше всего знаков в абзацах (свой текст от 40 знаков). */
  const bodyHist = {};
  for (const e of vis) { const t = ownText(e); if (t.length < 40) continue; const f = Math.round(fpx(e)); if (f >= 40) continue; bodyHist[f] = (bodyHist[f] || 0) + t.length; }
  const bodyFs = +((Object.entries(bodyHist).sort((a, b) => b[1] - a[1])[0] || ['16'])[0]);
  const headMin = Math.max(24, Math.round(bodyFs * 1.15 * 10) / 10);
  const HEAD_DISPLAY = /^(block|flex|grid|list-item|table-caption|flow-root|inline-block|inline-flex|inline-grid)$/;
  const headTag = (e) => /^H[1-3]$/.test(e.tagName) || (e.getAttribute('role') === 'heading' && +(e.getAttribute('aria-level') || 2) <= 3);
  const headLike = (e) => {
    if (e.matches('a, button, label, input, select, textarea, option, [role=button], [role=link]') || e.closest('nav, header, button, [role=navigation], [role=button]')) return false;
    if (e.parentElement && e.parentElement.closest('h1, h2, h3, h4, h5, h6, [role=heading]')) return false;
    const t = ownText(e); if (t.length < 2 || t.length > 120 || !/[A-Za-zА-Яа-яЁё]{2}/.test(t)) return false;
    return fpx(e) >= headMin && HEAD_DISPLAY.test(cs(e).display) && textOf(e).length <= 120;
  };
  const hs3 = vis.filter((e) => headTag(e) || headLike(e));
  const headings = vis.filter((e) => hs3.includes(e) || (fpx(e) >= 40 && textOf(e).length > 1 && textOf(e).length < 120 && ownText(e).length > 1));
  const caps = []; let spacedAll = 0; const spacedEx = [];
  for (const e of vis) {
    const t = ownText(e); if (t.length < 2) continue;
    const s = cs(e); const fs = fpx(e);
    if (lsEm(e) >= 0.05 && /[A-Za-zА-Яа-яЁё]/.test(t)) { spacedAll++; if (spacedEx.length < 5) spacedEx.push(`«${t.slice(0, 24)}» ${fs}px ${lsEm(e).toFixed(2)}em`); }
    if (t.length > 48 || fs > 14.5 || !isUpper(e, t) || lsEm(e) < 0.07) continue;
    if (e.closest('button, [role=button], nav') || buttonLike.includes(e.closest('a'))) continue;
    caps.push(e);
  }
  const eyebrowSet = new Set();
  for (const h of headings) {
    const hfs = fpx(h); if (hfs < 28) continue;
    let prev = h.previousElementSibling; while (prev && !visible(prev)) prev = prev.previousElementSibling;
    if (!prev || /^H[1-6]$/.test(prev.tagName)) continue;
    const t = textOf(prev); if (t.length < 2 || t.length > 60) continue;
    const pfs = fpx(prev);
    const cand = [prev, ...prev.querySelectorAll('*')].find((x) => ownText(x).length > 1) || prev;
    if (pfs <= 15 && hfs / pfs >= 2.2 && isUpper(cand, t) && lsEm(cand) >= 0.06) {
      eyebrowSet.add(prev);
      const first = prev.getBoundingClientRect().top + scrollY < vh;
      add('eyebrow', prev, `«${t.slice(0, 40)}» ${pfs}px, разрядка ${lsEm(cand).toFixed(2)}em над «${textOf(h).slice(0, 30)}» ${Math.round(hfs)}px` + (isPill(prev) ? ', чип-пилюля' : '') + (first ? ' · первый экран' : ' · секция'));
    }
  }
  const capsRest = caps.filter((e) => ![...eyebrowSet].some((x) => x === e || x.contains(e)));
  const ctx = (e) => (e.closest('form') ? 'форма' : e.closest('footer, .foot, [class*=footer]') ? 'подвал' : e.closest('header') ? 'шапка' : 'страница');
  found['caps-microlabel'].info = { spacedAll, spacedExamples: spacedEx, capsSmall: caps.length };
  /* метки пишутся все, от одной: у донора и две метки «ПРОШЕДШИЕ» — его язык. Порог приёма (RULES min: 4) — только для
     проверяемой страницы, в compareResult: меньше 4 — «ниже порога», не в счёт */
  if (capsRest.length >= 1) {
    const byCtx = {}; capsRest.forEach((e) => { byCtx[ctx(e)] = (byCtx[ctx(e)] || 0) + 1; });
    capsRest.forEach((e) => add('caps-microlabel', e, `«${ownText(e).slice(0, 30)}» ${fpx(e)}px ${lsEm(e).toFixed(2)}em · ${ctx(e)}`));
    found['caps-microlabel'].info.byContext = byCtx;
  }
  found['heading-colon'].info = { headings: hs3.length, byRole: hs3.filter((h) => !headTag(h)).length, bodyFs, headMin, midColon: hs3.filter((h) => /[:：]\s*\S/.test(textOf(h))).length };
  for (const h of hs3) { const t = textOf(h); if (/[:：]\s*$/.test(t)) add('heading-colon', h, `«${t.slice(0, 40)}» ${h.tagName.toLowerCase()}`); }
  for (const h of vis.filter((e) => /^H[12]$/.test(e.tagName) && fpx(e) >= 40)) {
    const hs = cs(h);
    for (const c of h.querySelectorAll('em, i, span')) { const s = cs(c); if (s.fontStyle === 'italic' && /serif|georgia|times|playfair|instrument|garamond|fraunces/i.test(s.fontFamily) && s.fontFamily !== hs.fontFamily) add('italic-serif-accent', c, `«${textOf(c).slice(0, 30)}»`); }
  }
  /* гарнитуры по ролям (знаки текста): для overused-font и сравнения с донором (font-swapped) */
  const fonts = { heading: {}, text: {}, button: {}, small: {} };
  for (const e of vis) {
    const t = ownText(e); if (t.length < 2 || !/[A-Za-zА-Яа-яЁё0-9]/.test(t)) continue;
    const s = cs(e); const fs = fpx(e); if (fs < 6) continue;
    const fam = s.fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (!fam) continue;
    const b = e.closest('a, button, [role=button], input[type=submit]');
    const role = b && buttonLike.includes(b) ? 'button' : (e.closest('h1, h2, h3, h4, h5, h6') || fs >= 28) ? 'heading' : fs < 13 ? 'small' : 'text';
    fonts[role][fam] = (fonts[role][fam] || 0) + t.length;
  }
  const fams = {}; for (const r of Object.values(fonts)) for (const [f, n] of Object.entries(r)) fams[f] = (fams[f] || 0) + n;
  const famTotal = Object.values(fams).reduce((a, b) => a + b, 0) || 1;
  const OVERUSED = /^(inter( var| variable| tight| display)?|geist( sans| mono)?|manrope|space grotesk|instrument serif|dm sans|plus jakarta sans|poppins|outfit|sora|satoshi|general sans|onest|montserrat|golos( text)?)$/i;
  found['overused-font'].info.families = Object.fromEntries(Object.entries(fams).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [k, +(v / famTotal).toFixed(2)]));
  for (const [f, n] of Object.entries(fams)) if (OVERUSED.test(f) && n / famTotal > 0.2) found['overused-font'].items.push({ sel: 'font-family', note: `${f}: ${Math.round(n / famTotal * 100)}% текста` });

  /* ===== форма-набор ===== */
  const forms = vis.filter((e) => e.tagName === 'FORM');
  const loose = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')].filter((f) => visible(f) && !f.closest('form'));
  if (loose.length >= 2) { let c = loose[0].parentElement; while (c && !loose.every((f) => c.contains(f))) c = c.parentElement; if (c) forms.push(c); }
  for (const form of forms) {
    const fields = [...form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, select')].filter(visible);
    if (fields.length < 2) continue;
    const signs = [];
    const capsIn = caps.filter((c) => form.contains(c));
    if (capsIn.length >= Math.min(2, fields.length)) signs.push(`подписи капсом ${capsIn.length} (${px(cs(capsIn[0]).fontSize)}px, разрядка ${lsEm(capsIn[0]).toFixed(2)}em)`);
    const boxed = fields.filter((f) => { const r = radius(f); return r >= 4 && r <= 16 && hasBorderAll(cs(f)); });
    if (boxed.length >= fields.length * 0.75) {
      const r0 = Math.round(radius(boxed[0])); const fbg = col(cs(boxed[0]).backgroundColor); const pbg = bgOf(form.parentElement);
      const tone = fbg && fbg.a > 0.5 ? (lum(fbg) < 0.05 ? ', тёмная заливка' : '') + ` ${hexOf(fbg)} на ${hexOf(pbg)}` : '';
      signs.push(`коробки полей r${r0} с рамкой со всех сторон ${boxed.length}/${fields.length}${tone}`);
    }
    const widths = fields.map((f) => Math.round(f.getBoundingClientRect().width)); const xs = fields.map((f) => Math.round(f.getBoundingClientRect().left));
    if (new Set(widths).size === 1 && new Set(xs).size === 1 && fields.length >= 3) signs.push(`${fields.length} поля столбиком одной ширины ${widths[0]}px`);
    const submit = [...form.querySelectorAll('button, input[type=submit]')].filter(visible).pop();
    if (submit && isPill(boxOf(submit))) { const sb = col(cs(boxOf(submit)).backgroundColor); signs.push(`отправка — пилюля ${Math.round(submit.getBoundingClientRect().height)}px «${textOf(submit).slice(0, 24)}»` + (sb && sb.a > 0.5 && chroma(sb) >= 90 ? `, акцент ${hexOf(sb)}` : '')); }
    const opt = [...form.querySelectorAll('*')].find((e) => /не\s*обязательн|необязательн|optional/i.test(ownText(e)) && fpx(e) <= 13);
    if (opt) signs.push(`«${ownText(opt)}» ${fpx(opt)}px`);
    if (signs.length >= 3) add('form-kit', form, `${signs.length} из 5: ` + signs.join('; '));
  }

  /* ===== кнопки, коробки, тени, стекло ===== */
  const pills = buttonLike.filter((b) => isPill(boxOf(b)));
  found['pill-everywhere'].info = { pills: pills.length, buttons: buttonLike.length, share: buttonLike.length ? +(pills.length / buttonLike.length).toFixed(2) : 0 };
  if (buttonLike.length >= 4 && pills.length >= 5 && pills.length / buttonLike.length >= 0.6) pills.forEach((e) => add('pill-everywhere', e, `r${Math.round(radius(boxOf(e)))}, h${Math.round(e.getBoundingClientRect().height)}`));
  const boxes = vis.filter((e) => {
    const r = e.getBoundingClientRect(); if (r.width * r.height < 4000 || buttonLike.includes(e) || paintBoxes.has(e)) return false;
    const s = cs(e); const bg = col(s.backgroundColor);
    return ((bg && bg.a > 0.3) || hasBorderAll(s) || s.boxShadow !== 'none' || e.matches('input, textarea, select, canvas, img')) && radius(e) > 0 && !isPill(e);
  });
  const radHist = {}; boxes.forEach((e) => { const r = Math.round(radius(e)); radHist[r] = (radHist[r] || 0) + 1; });
  const radTop = Object.entries(radHist).sort((a, b) => b[1] - a[1]);
  const mid = radTop.filter(([r]) => r >= 6 && r <= 20).reduce((a, [, n]) => a + n, 0);
  found['uniform-radius'].info = { hist: Object.fromEntries(radTop.slice(0, 6)), boxes: boxes.length, mid, share: boxes.length ? +(mid / boxes.length).toFixed(2) : 0 };
  if (boxes.length >= 5 && mid / boxes.length >= 0.6) boxes.filter((e) => { const r = radius(e); return r >= 6 && r <= 20; }).forEach((e) => add('uniform-radius', e, `r${Math.round(radius(e))}`));
  const gradCands = [];
  for (const e of vis) {
    const s = cs(e); const r = e.getBoundingClientRect();
    const sh = shadows(s).filter((x) => !x.inset);
    if (sh.some((x) => x.blur >= 16 && Math.abs(x.y) >= 8 && x.c && chroma(x.c) < 40)) add('soft-shadow', e, s.boxShadow.slice(0, 60));
    if (sh.some((x) => x.blur >= 12 && x.c && x.c.a > 0.15 && chroma(x.c) >= 90)) add('gradient-blob', e, 'цветное свечение ' + s.boxShadow.slice(0, 50));
    if (/blur\(/.test(s.backdropFilter || s.webkitBackdropFilter || '')) { const bg = col(s.backgroundColor); if (!bg || bg.a < 0.95) add('glass', e, `backdrop-filter ${s.backdropFilter}, фон ${s.backgroundColor}`); }
    const fb = /blur\((\d+)/.exec(s.filter || '');
    if (fb && +fb[1] >= 30 && r.width >= 150) add('gradient-blob', e, `filter ${s.filter}`);
    if (/gradient/.test(s.backgroundImage) && /text/.test(s.webkitBackgroundClip || s.backgroundClip || '')) add('gradient-text', e, `«${textOf(e).slice(0, 30)}»`);
    else if (/gradient/.test(s.backgroundImage) && r.width * r.height > 20000) {
      /* только насыщенные точки: бледный «белый → лавандовый» linear.app — не «ИИ-палитра» */
      const cols = colorsIn(s.backgroundImage).filter((c) => c.a > 0.2);
      const vivid = cols.filter((c) => { const x = hsl(c); return x.s >= 0.45 && x.l >= 0.2 && x.l <= 0.78; });
      const hs = vivid.map(hue).filter((h) => h !== null);
      if (hs.length >= 2 && hs.every((h) => h >= 200 && h <= 300) && Math.max(...hs) - Math.min(...hs) >= 20) gradCands.push({ e, cols });
    }
    const bl = px(s.borderLeftWidth);
    if (bl >= 2 && bl <= 6 && px(s.borderTopWidth) === 0 && px(s.borderRightWidth) === 0 && r.height >= 40) { const c = col(s.borderLeftColor); if (c && hue(c) !== null) add('left-stripe', e, `border-left ${bl}px ${hexOf(c)}`); }
  }
  /* ai-palette: слой должен быть виден (не закрыт соседом того же размера), а соседние
     градиенты — не разноцветный набор: у bureau.ru это «небо» из 10 стопкой лежащих слоёв */
  const skipped = [];
  const sy0 = scrollY;
  for (const { e, cols } of gradCands) {
    const sibs = e.parentElement ? [...e.parentElement.children].filter((k) => k !== e && /gradient/.test(cs(k).backgroundImage)) : [];
    const other = sibs.filter((k) => colorsIn(cs(k).backgroundImage).some((c) => { const h = hue(c); const x = hsl(c); return h !== null && x.s >= 0.3 && (h < 200 || h > 300); }));
    if (other.length >= 2) { skipped.push(`${sel(e)}: рядом ещё ${sibs.length} градиентов разных оттенков — иллюстрация`); continue; }
    const r0 = rectOf(e);
    scrollTo({ top: Math.max(0, r0.y + r0.h / 2 - vh / 2), behavior: 'instant' });
    const r = e.getBoundingClientRect();
    const pts = [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]).filter(([x, y]) => x >= 0 && x < vw && y >= 0 && y < vh);
    const seen = pts.some(([x, y]) => { const hit = document.elementFromPoint(x, y); return !hit || hit === e || e.contains(hit) || hit.contains(e); });
    if (!seen && cs(e).pointerEvents !== 'none') { skipped.push(`${sel(e)}: закрыт другим слоем`); continue; }
    add('ai-palette', e, 'градиент ' + cols.map(hexOf).join('→'));
  }
  scrollTo({ top: sy0, behavior: 'instant' });
  found['ai-palette'].info = { candidates: gradCands.length, skipped: skipped.slice(0, 6) };

  /* ===== акцент — цвет действий (одно правило с extract и discover): заливка залитых кнопок и ссылок-кнопок,
     в т. ч. фон вложенного блока на всю коробку <a>, кнопки первого экрана — первыми; насыщенной заливки нет —
     цвет ссылок при наведении (досчитывает measureViewport наведением мыши); фоны секций, шапки и подвала — не
     акцент. Рамка и текст кнопки, насыщенные плашки-метки ≤ 420×64 — тоже в счёт приёма, но акцентом донора
     первыми идут заливки. Группы по оттенку собирает groupAccents. ===== */
  const accents = [];
  const satOk = (c, o) => c && c.a * o >= 0.5 && chroma(c) >= 90 && Math.max(c.r, c.g, c.b) >= 90;
  /* цвет видимого текста кнопки: у <a> Framer свой цвет — синий по умолчанию (#0000EE), а текст внутри другой */
  const textColor = (b) => { if (b.matches('input')) return col(cs(b).color); const t = [b, ...b.querySelectorAll('*')].find((x) => ownText(x).length > 0 && visible(x)); return t ? col(cs(t).color) : null; };
  for (const b of buttonLike) {
    const r = rectOf(b); if (!inDoc(r)) continue;
    const pb = boxOf(b); const s = cs(pb); const o = eff(pb); const first = r.y < vh;
    const pick = [[col(s.backgroundColor), 'фон'], [hasBorderAll(s) ? col(s.borderTopColor) : null, 'рамка'], [textColor(b), 'текст']].find(([c]) => satOk(c, o));
    if (pick) accents.push({ e: b, c: pick[0], how: `кнопка, ${pick[1]}${first ? ', первый экран' : ''}`, fill: pick[1] === 'фон', first });
  }
  for (const e of vis) {
    if (buttonLike.includes(e) || e.closest('a, button')) continue;
    const t = ownText(e) || textOf(e); if (t.length < 1 || t.length > 30) continue;
    const r = rectOf(e); if (r.h > 64 || r.w > 420 || !inDoc(r)) continue;
    const c = col(cs(e).backgroundColor); if (satOk(c, eff(e))) accents.push({ e, c, how: 'метка', fill: false, first: r.y < vh });
  }
  const hueR = (c) => (hue(c) === null ? null : Math.round(hue(c)));
  found['accent-added'].info = { raw: accents.map((a) => ({ hex: hexOf(a.c), hue: hueR(a.c), fill: a.fill, first: a.first, how: a.how })) };
  accents.forEach((a) => add('accent-added', a.e, `${hexOf(a.c)} ${a.how}, «${textOf(a.e).slice(0, 24)}»`, { hue: hueR(a.c) }));
  /* ссылки для наведения (шаг 2 правила акцента; наводит measureViewport, только если насыщенной заливки нет):
     текстовые, не кнопки, сверху вниз, не больше двух одного вида (цвет, кегль, насыщенность, подчёркивание), всего 8.
     Индексы — в document.querySelectorAll('a[href]') */
  const linkAll = [...document.querySelectorAll('a[href]')]; const perStyle = {}; const hoverLinks = [];
  for (const a of vis.filter((x) => x.tagName === 'A' && x.hasAttribute('href') && !btnBox.has(x)).sort((p, q) => rectOf(p).y - rectOf(q).y)) {
    const r = a.getBoundingClientRect(); if (r.height > 60 || r.width < 16) continue;
    const t = textOf(a); if (t.length < 2 || t.length > 60) continue;
    const te = [a, ...a.querySelectorAll('*')].find((x) => ownText(x).length > 0 && visible(x)); if (!te) continue;
    const s = cs(te); const key = [s.color, s.fontSize, s.fontWeight, s.textDecorationLine].join('|');
    if ((perStyle[key] = (perStyle[key] || 0) + 1) > 2) continue;
    hoverLinks.push(linkAll.indexOf(a)); if (hoverLinks.length >= 8) break;
  }

  /* ===== сетки и повторы ===== */
  const parents = new Set(vis.map((e) => e.parentElement).filter(Boolean));
  const cardGroups = [];
  for (const p of parents) {
    const kids = [...p.children].filter((k) => visible(k) && k.getBoundingClientRect().width >= 120 && k.getBoundingClientRect().height >= 90);
    if (kids.length < 3) continue;
    const key = (k) => { const r = k.getBoundingClientRect(); return Math.round(r.width / 4) + 'x' + Math.round(r.height / 4); };
    const groups = {}; kids.forEach((k) => { (groups[key(k)] = groups[key(k)] || []).push(k); });
    const best = Object.values(groups).sort((a, b) => b.length - a.length)[0];
    if (best.length < 3 || best.length / kids.length < 0.75) continue;
    const rows = new Set(best.map((k) => Math.round(k.getBoundingClientRect().top))).size;
    const cols = best.length / rows; if (cols < 2 && rows < 3) continue;
    if (best.some((k) => k.getBoundingClientRect().width > vw * 0.9)) continue;
    cardGroups.push({ p, cards: best });
  }
  const inside = (a, b) => b !== a && b.contains(a);
  const topGroups = cardGroups.filter((g) => !cardGroups.some((o) => o !== g && o.cards.some((c) => inside(g.p, c))));
  /* площадь картинки: ленивая, ещё не загруженная <img> — по атрибутам width/height (пропорции), иначе
     пустая коробка без размеров даёт 0 px, и фото-карточка выглядит текстовой */
  const mediaArea = (m, kr) => {
    const r = m.getBoundingClientRect(); let a = r.width * r.height;
    if (m.tagName === 'IMG' && (!m.complete || m.naturalWidth <= 2)) {
      const aw = parseFloat(m.getAttribute('width')), ah = parseFloat(m.getAttribute('height'));
      if (aw > 0 && ah > 0) { const w = Math.min(r.width >= 2 ? r.width : aw, kr.width); a = Math.max(a, w * Math.min(kr.height, w * ah / aw)); }
    }
    return a;
  };
  for (const g of topGroups) {
    const r0 = g.cards[0].getBoundingClientRect();
    const media = (k) => { const kr = k.getBoundingClientRect(); return [...k.querySelectorAll('img, canvas, video, picture, [style*="background-image"], .t-bgimg')].concat([k]).some((m) => { const bi = cs(m).backgroundImage; const isMedia = /IMG|CANVAS|VIDEO|PICTURE/.test(m.tagName) || /url\(/.test(bi); return isMedia && mediaArea(m, kr) >= 0.35 * kr.width * kr.height; }); };
    const icon = (k) => [...k.querySelectorAll('svg, img, i[class*=icon], span[class*=icon]')].some((m) => { const mr = m.getBoundingClientRect(); return mr.width >= 12 && mr.width <= 80 && mr.height <= 80 && mr.top - k.getBoundingClientRect().top < 120; });
    const deco = (k) => { const s = cs(k); const bg = col(s.backgroundColor); return (bg && bg.a > 0.3) || hasBorderAll(s) || s.boxShadow !== 'none' || radius(k) >= 6; };
    const texty = (k) => k.querySelector('h2, h3, h4, b, strong') && textOf(k).length > 30;
    const n = g.cards.length;
    /* фото-сетка — по большинству: у ≥75% карточек картинка. Плитка «ещё / нет нужной?» того же размера
       без картинки (у shapefest.com 9-я в каждой сетке, у VN3D 8-я) — часть той же сетки, а не повод
       назвать всю сетку текстовыми карточками */
    const withMedia = g.cards.filter(media);
    if (withMedia.length >= Math.max(3, Math.ceil(n * 0.75))) g.cards.forEach((k) => add('photo-cards', k, `${n} шт ${Math.round(r0.width)}×${Math.round(r0.height)}` + (withMedia.includes(k) ? '' : ' · плитка без картинки')));
    else if (g.cards.filter(icon).length >= n * 0.75 && g.cards.every(texty)) g.cards.forEach((k) => add('icon-cards', k, `${n} шт ${Math.round(r0.width)}×${Math.round(r0.height)}`));
    else if (g.cards.every(deco) && g.cards.every(texty)) g.cards.forEach((k) => add('equal-cards', k, `${n} шт ${Math.round(r0.width)}×${Math.round(r0.height)}`));
  }
  const numEls = vis.filter((e) => /^(0?[1-9]|1[0-9])[.)]?$/.test(ownText(e)) && !e.closest('a, button, nav, [class*=pag]') && !e.matches('input, option'));
  const byGrand = new Map();
  numEls.forEach((e) => { const g = e.parentElement && e.parentElement.parentElement; if (!g) return; if (!byGrand.has(g)) byGrand.set(g, []); byGrand.get(g).push(e); });
  for (const [, list] of byGrand) { const ns = list.map((e) => parseInt(ownText(e), 10)); if (list.length >= 3 && ns.slice(1).every((n, i) => n === ns[i] + 1)) list.forEach((e) => add('numbered-steps', e.parentElement, `«${ownText(e)}» ${fpx(e)}px`)); }
  const statEls = vis.filter((e) => /^[+~≈>]?\d[\d\s.,]*\s?(\+|%|×|x|k|K|м|млн|тыс\.?|лет|год|₽|\$|ч|мин)?\+?$/.test(ownText(e)) && fpx(e) >= 28 && !e.closest('button, a'));
  const statGroups = new Map();
  statEls.forEach((e) => { const g = e.parentElement && e.parentElement.parentElement; if (!g) return; if (!statGroups.has(g)) statGroups.set(g, []); statGroups.get(g).push(e); });
  for (const [, list] of statGroups) if (list.length >= 3) list.forEach((e) => add('stat-row', e.parentElement, `«${ownText(e)}»`));
  const toggles = vis.filter((e) => e.tagName === 'SUMMARY' || (e.matches('button[aria-expanded], [role=button][aria-expanded]') && !e.closest('nav, header')));
  if (toggles.length >= 3) {
    for (const t of toggles) {
      const marks = ['::after', '::before'].map((p) => ({ p, s: cs(t, p) })).filter(({ s }) => s.content && s.content !== 'none' && s.content !== 'normal');
      const plus = marks.find(({ s }) => /["'][+＋›⌄∨▾▸⌃−-]["']/.test(s.content) || (s.content === '""' && (s.backgroundImage !== 'none' || s.borderRightWidth !== '0px')));
      const svg = t.querySelector('svg');
      if (plus || svg) add('faq-plus', t, (plus ? `${plus.p} ${plus.s.content}` : 'svg-значок') + (plus && px(plus.s.borderTopWidth) > 0 && /50%|\d{2}px/.test(plus.s.borderTopLeftRadius) ? ' в кружке' : ''));
    }
  }
  /* бегущая строка: бесконечный сдвиг по X у блока от половины ширины (значок «Working…» linear.app — не она) */
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target; if (!t || !a.effect.getComputedTiming) continue;
    if (a.effect.getComputedTiming().iterations !== Infinity) continue;
    const kf = (a.effect.getKeyframes ? a.effect.getKeyframes() : []).map((k) => k.transform || '').join(' ');
    if (/translate(X|3d)?\(\s*-?\d/.test(kf) && t.getBoundingClientRect().width >= vw * 0.5 && eff(t) > 0.05) { const box = t.closest('[class*=ticker], [class*=marquee], [class*=running]') || t.parentElement; add('marquee', box, `«${textOf(t).slice(0, 50)}»`); }
  }
  /* первый экран */
  const h1 = vis.find((e) => e.tagName === 'H1') || headings.slice().sort((a, b) => fpx(b) - fpx(a))[0];
  if (h1) { const r = h1.getBoundingClientRect(); if (r.top + scrollY < vh && cs(h1).textAlign === 'center' && Math.abs(r.left + r.width / 2 - vw / 2) < vw * 0.05) add('centered-hero', h1, `h1 по центру, ${fpx(h1)}px`); }
  const heroBtns = buttonLike.filter((b) => b.getBoundingClientRect().top + scrollY < vh && b.getBoundingClientRect().height >= 36 && !b.closest('nav, header, [class*=nav], [class*=menu], [class*=floating]'));
  const byParent = new Map(); heroBtns.forEach((b) => { const p = b.parentElement; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(b); });
  for (const [p, list] of byParent) if (list.length >= 2) { const fills = list.map((b) => { const bg = col(cs(boxOf(b)).backgroundColor); return bg && bg.a > 0.5 ? 'залитая' : 'контурная'; }); add('hero-two-ctas', p, list.map((b, i) => `«${textOf(b).slice(0, 22)}» ${fills[i]}`).join(' + ')); }
  /* секции */
  const full = vis.filter((e) => e.getBoundingClientRect().width >= vw * 0.9 && e.getBoundingClientRect().height >= 150);
  const pc = new Map(); full.forEach((e) => { const p = e.parentElement; if (!p) return; pc.set(p, (pc.get(p) || 0) + 1); });
  const secParent = [...pc.entries()].sort((a, b) => b[1] - a[1])[0];
  const sections = secParent ? [...secParent[0].children].filter((e) => full.includes(e)) : [];
  const secBg = (s) => {
    const own = col(cs(s).backgroundColor); if (own && own.a > 0.5) return hexOf(own);
    const sr = s.getBoundingClientRect();
    for (const d of s.querySelectorAll('*')) { const r = d.getBoundingClientRect(); if (r.width * r.height < 0.7 * sr.width * sr.height) continue; const c = col(cs(d).backgroundColor); if (c && c.a > 0.5) return hexOf(c); if (/gradient|url\(/.test(cs(d).backgroundImage)) return 'картинка'; }
    if (/gradient|url\(/.test(cs(s).backgroundImage)) return 'картинка';
    return hexOf(bgOf(s.parentElement));
  };
  const seq = sections.filter((s) => s.getBoundingClientRect().height >= 200).map((s) => ({ s, bg: secBg(s) }));
  found['alternating-bands'].info.sequence = seq.map((x) => x.bg);
  let run = 1, bestRun = 1, bestEnd = 0;
  for (let i = 2; i < seq.length; i++) { if (seq[i].bg === seq[i - 2].bg && seq[i].bg !== seq[i - 1].bg) { run = run < 2 ? 3 : run + 1; if (run > bestRun) { bestRun = run; bestEnd = i; } } else run = 1; }
  if (bestRun >= 5) for (let i = bestEnd - bestRun + 1; i <= bestEnd; i++) add('alternating-bands', seq[i].s, seq[i].bg);
  /* заголовок раздела — первый заголовок по роли (hs3: h1–h3 и крупная надпись на div/p) в 320 px от верха раздела */
  const headKey = (s) => { const sr = s.getBoundingClientRect(); const h = hs3.find((x) => s.contains(x) && x.getBoundingClientRect().top - sr.top < 320); if (!h) return null; const st = cs(h); return { h, k: [st.fontFamily.split(',')[0], Math.round(px(st.fontSize)), st.textTransform, st.fontWeight, st.textAlign].join('|') }; };
  const keys = seq.map((x) => ({ ...x, hk: headKey(x.s) })).filter((x) => x.hk);
  const kc = {}; keys.forEach((x) => { kc[x.hk.k] = (kc[x.hk.k] || 0) + 1; });
  const topK = Object.entries(kc).sort((a, b) => b[1] - a[1])[0];
  /* сколько разделов с заголовком и сколько из них одного стиля — пишется всегда: у донора с 2–3 разделами приёма
     «≥ 4 одинаковых» нет, но язык тот же (все заголовки одного стиля) — compareResult это различает */
  /* запасной признак для донора: крупные заголовки страницы (от 28 px, кроме h1 и подвала) одного стиля — разделы
     mamuka.rest на компьютере уже 90% ширины (1280 из 1440) и разделами не выделяются, а заголовки у них одни */
  const bigHeads = hs3.filter((h) => fpx(h) >= 28 && h.tagName !== 'H1' && !h.closest('footer'));
  const hsc = {}; bigHeads.forEach((h) => { const st = cs(h); const k = [st.fontFamily.split(',')[0], Math.round(px(st.fontSize)), st.textTransform, st.fontWeight, st.textAlign].join('|'); hsc[k] = (hsc[k] || 0) + 1; });
  const hTop = Object.entries(hsc).sort((a, b) => b[1] - a[1])[0];
  found['section-template'].info = { sections: keys.length, top: topK ? { style: topK[0], count: topK[1] } : null, heads: { count: bigHeads.length, top: hTop ? { style: hTop[0], count: hTop[1] } : null } };
  if (topK && topK[1] >= 4) keys.filter((x) => x.hk.k === topK[0]).forEach((x) => add('section-template', x.s, `«${textOf(x.hk.h).slice(0, 30)}» ${topK[0]}`));
  /* подвал */
  const footer = document.querySelector('footer') || sections[sections.length - 1];
  for (const e of vis) {
    const fs = fpx(e); const t = ownText(e); const r = e.getBoundingClientRect();
    if (fs >= Math.max(vw * 0.11, 72) && t && t.split(/\s+/).length <= 2 && r.width >= vw * 0.5 && r.top + scrollY > docH * 0.6) add('giant-footer-word', e, `«${t}» ${Math.round(fs)}px`);
  }
  if (footer) {
    for (const p of [footer, ...footer.querySelectorAll('*')]) {
      const kids = [...p.children].filter(visible); if (kids.length < 3) continue;
      const tops = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top))); if (tops.size !== 1) continue;
      const withCaps = kids.filter((k) => caps.some((c) => k.contains(c) && c.getBoundingClientRect().top - k.getBoundingClientRect().top < 30));
      if (withCaps.length >= 3) { add('footer-columns', p, `${kids.length} колонок, капс-заголовков ${withCaps.length}`); break; }
    }
  }
  for (const p of parents) {
    const logos = [...p.children].filter((k) => visible(k) && (k.matches('img, svg') || k.querySelector(':scope > img, :scope > svg')) && k.getBoundingClientRect().height <= 80);
    if (logos.length < 4) continue;
    const grey = logos.filter((k) => { const t = k.matches('img, svg') ? k : k.querySelector('img, svg'); const s = cs(t); return /grayscale/.test(s.filter) || +s.opacity <= 0.7; });
    if (grey.length >= 4) add('trusted-logos', p, `${grey.length} серых логотипов`);
  }
  const photos = vis.filter((e) => { const r = e.getBoundingClientRect(); if (r.width * r.height < 40000) return false; if (e.matches('img, video, picture')) return true; return /url\(["']?(?!data:image\/svg)/.test(cs(e).backgroundImage) && !/\.(svg|gif)/i.test(cs(e).backgroundImage); });
  found['no-photos'].info = { photos: photos.length, canvases: vis.filter((e) => e.tagName === 'CANVAS').length };
  if (photos.length === 0) found['no-photos'].items.push({ sel: 'img, video, background-image', note: `фото 0, холстов ${found['no-photos'].info.canvases}` });

  /* ===== оговорки и мелкий текст ===== */
  const DEMO_RE = /(^|[^а-яёa-z])(демо|демонстрац\S*|условн\S*|для примера|пример(ная|ные)?\s+цен\S*|не является офертой|demo|sample|placeholder)([^а-яёa-z]|$)/iu;
  const secOf = (e) => { const s = e.closest('section, footer, header, form, main > *, [class*=section], .t-rec'); return s ? sel(s) : 'страница'; };
  const demo = vis.filter((e) => {
    const t = ownText(e); if (t.length < 2 || t.length > 160 || !DEMO_RE.test(t)) return false;
    const s = cs(e); const fs = fpx(e); const bg = col(s.backgroundColor);
    const badge = t.length <= 24 && ((bg && bg.a > 0.3) || hasBorderAll(s));
    return fs <= 13 || badge;
  });
  const demoSecs = new Set(demo.map(secOf));
  found['demo-badges'].info = { total: demo.length, sections: demoSecs.size };
  if (demo.length >= 3 && demoSecs.size >= 2) demo.forEach((e) => add('demo-badges', e, `«${ownText(e).slice(0, 40)}» ${fpx(e)}px · ${secOf(e)}`));
  const fine = vis.filter((e) => { const t = ownText(e); return t.length >= 2 && /[A-Za-zА-Яа-яЁё]/.test(t) && fpx(e) < 12; });
  found['fine-print'].info = { total: fine.length, chars: fine.reduce((a, e) => a + ownText(e).length, 0) };
  if (fine.length >= 5) fine.forEach((e) => add('fine-print', e, `«${ownText(e).slice(0, 30)}» ${fpx(e)}px`));

  /* ===== тексты ===== */
  const bodyText = textOf(document.body);
  const BUZZ = buzz;
  (bodyText.match(BUZZ) || []).slice(0, 20).forEach((w) => found['copy-buzz'].items.push({ sel: 'текст', note: w }));
  vis.filter((e) => /^([^\s.!]+\.\s){2,}[^\s.!]+\.$/.test(ownText(e))).forEach((e) => add('copy-triad', e, `«${ownText(e)}»`));

  found.page = { vw, vh, docH, sections: seq.length, buttons: buttonLike.length, pills: pills.length, boxes: boxes.length, capsTotal: caps.length, spacedAll, headings: hs3.length, bodyFs, fonts, fine: fine.length, hoverLinks };
  /* селекторы блоков из обоснований: сколько элементов нашлось (-1 — селектор неверный) */
  if (BLOCK_SELS.length) found.page.blocks = BLOCK_SELS.map((s) => { try { return document.querySelectorAll(s).length; } catch { return -1; } });
  return found;
}

/* появления: до прокрутки — ниже сгиба, прозрачные и сдвинутые вниз */
function revealCandidates() {
  const vh = innerHeight; const out = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect(); if (r.top < vh || r.width < 40 || r.height < 20) continue;
    const s = getComputedStyle(e); if (+s.opacity > 0.05) continue;
    if (e.parentElement && +getComputedStyle(e.parentElement).opacity <= 0.05) continue;
    const m = /matrix\(([^)]+)\)/.exec(s.transform); const ty = m ? +m[1].split(',')[5] : 0;
    if (ty >= 6 && ty <= 90) out.push({ sel: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), ty: Math.round(ty), x: Math.round(r.left), y: Math.round(r.top + scrollY - ty), h: Math.round(r.height), w: Math.round(r.width) });
  }
  return out;
}

/* CSS-текст: наведение, переходы, кривые, появления. У находок hover-lift, transition-all, bounce-ease — { text, sel }:
   sel — селектор правила (у пружины в своём свойстве «--spring: cubic-bezier(…)» — селекторы правил с var(--spring)),
   по нему measureViewport находит элементы для обоснований с block */
function cssRules(cssText) {
  const hits = { 'hover-lift': [], 'transition-all': [], 'bounce-ease': [], 'fade-up-css': [] };
  const flat = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  /* селектор правила, в котором стоит место i: ближайшая незакрытая «{» слева, текст перед ней — от «}», «{» или «;» */
  const ruleAt = (i) => {
    let d = 0;
    for (let k = i - 1; k >= 0; k--) {
      const ch = flat[k];
      if (ch === '}') d++;
      else if (ch === '{') { if (d) d--; else return flat.slice(Math.max(flat.lastIndexOf('}', k - 1), flat.lastIndexOf('{', k - 1), flat.lastIndexOf(';', k - 1)) + 1, k).trim(); }
    }
    return '';
  };
  for (const m of flat.matchAll(/([^{}]*:hover[^{}]*)\{([^{}]*)\}/g)) { const t = /translateY\(\s*-(\d+(?:\.\d+)?)px/.exec(m[2]) || /translate\(\s*0(?:px)?\s*,\s*-(\d+(?:\.\d+)?)px/.exec(m[2]); if (t && +t[1] >= 2 && +t[1] <= 8) hits['hover-lift'].push({ text: m[1].trim().slice(0, 60) + ` → −${t[1]}px`, sel: m[1].trim() }); }
  for (const m of flat.matchAll(/([^{}]*)\{[^{}]*transition(?:-property)?\s*:\s*all\b[^{}]*\}/g)) hits['transition-all'].push({ text: m[1].trim().slice(0, 60), sel: m[1].trim() });
  for (const m of flat.matchAll(/cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.-]+)\s*,\s*([\d.]+)\s*,\s*([\d.-]+)\s*\)/g)) {
    if (!(+m[2] > 1.05 || +m[4] > 1.05 || +m[2] < -0.05)) continue;
    const decl = flat.slice(Math.max(flat.lastIndexOf(';', m.index), flat.lastIndexOf('{', m.index)) + 1, m.index);
    const v = /^\s*(--[\w-]+)\s*:/.exec(decl);
    let sel = ruleAt(m.index);
    if (v) { const uses = [...flat.matchAll(new RegExp(`var\\(\\s*${v[1].replace(/[-]/g, '\\-')}(?![\\w-])`, 'g'))].map((u) => ruleAt(u.index)).filter(Boolean); if (uses.length) sel = [...new Set(uses)].join(', '); }
    hits['bounce-ease'].push({ text: m[0], sel, via: v ? v[1] : null, kf: /^(?:from|to|[\d.]+%)(?:\s*,\s*(?:from|to|[\d.]+%))*$/i.test(sel) });
  }
  for (const m of flat.matchAll(/([^{}]*)\{([^{}]*)\}/g)) if (/opacity\s*:\s*0\s*[;}]?/.test(m[2] + ';') && /translate(?:Y|3d)?\(\s*(?:0(?:px)?\s*,\s*)?(\d{1,2})px/.test(m[2])) hits['fade-up-css'].push(m[1].trim().slice(0, 60));
  return hits;
}

/* Находки из CSS — к элементам (в странице): у правила CSS своего элемента нет, у его селектора есть. Состояния
   (:hover, :focus…) и псевдоэлементы снимаются; в счёт — показанные элементы, кроме html и body. Блок обоснования
   покрывает находку, если в нём все её элементы. → [{ els, blocks }] по порядку sels; els 0 — селектор на странице
   ничего не нашёл (@keyframes 50%, :root без var(), неверный) */
function cssItemBlocks({ sels, blocks }) {
  const split = (s) => { const out = []; let d = 0, cur = ''; for (const ch of String(s || '')) { if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()).filter(Boolean); };
  const STATE = /::?(?:hover|focus-visible|focus-within|focus|active|visited|target|before|after|first-line|first-letter|placeholder|marker|selection|backdrop)(?![\w-])|::?-(?:webkit|moz|ms)-[\w-]+/g;
  return sels.map((sel) => {
    const els = new Set();
    for (const part of split(sel)) {
      const q = part.replace(STATE, '').trim(); if (!q || /[>+~]$/.test(q)) continue;
      try { document.querySelectorAll(q).forEach((e) => { if (e !== document.documentElement && e !== document.body && e.getClientRects().length) els.add(e); }); } catch { /* 50% в @keyframes, неверный селектор */ }
    }
    const list = [...els];
    if (!list.length) return { els: 0, blocks: [] };
    const out = []; blocks.forEach((b, i) => { try { if (list.every((e) => e.closest(b))) out.push(i); } catch { /* неверный селектор блока — видно по page.blocks */ } });
    return { els: list.length, blocks: out };
  });
}

/* ленивые картинки: прокрутка запустила загрузку — ждём, пока догрузятся (не дольше ms), иначе фото-карточка
   с пустой <img> без размеров считается текстовой. → { images, lazy, pending } (pending — не догрузились) */
function waitImagesInPage(ms) {
  return new Promise((res) => {
    const shown = [...document.images].filter((i) => i.getClientRects().length > 0 && (i.currentSrc || i.getAttribute('src')));
    /* Tilda грузит не loading=lazy, а по data-original и фонами .t-bgimg (до прокрутки — заглушки /-/resize/20x/) */
    const T = document.querySelector('.t-rec[data-record-type], #allrecords[data-tilda-page-id]');
    const tilda = T ? { dataOriginal: document.querySelectorAll('[data-original]').length, bg: document.querySelectorAll('.t-bgimg').length, bgLoaded: document.querySelectorAll('.t-bgimg.loaded').length } : null;
    const done = () => res({ images: shown.length, lazy: shown.filter((i) => i.loading === 'lazy').length, pending: shown.filter((i) => !i.complete).length, ...(tilda ? { tilda } : {}) });
    const wait = shown.filter((i) => !i.complete);
    if (!wait.length) { done(); return; }
    let left = wait.length; const one = () => { if (--left <= 0) done(); };
    wait.forEach((i) => { i.addEventListener('load', one, { once: true }); i.addEventListener('error', one, { once: true }); });
    setTimeout(done, ms);
  });
}

/* цвета в Node: '#RRGGBB[AA]' → оттенок и насыщенность — те же пороги, что в странице */
const rgbOf = (hx) => ({ r: parseInt(hx.slice(1, 3), 16), g: parseInt(hx.slice(3, 5), 16), b: parseInt(hx.slice(5, 7), 16), a: hx.length > 7 ? parseInt(hx.slice(7, 9), 16) / 255 : 1 });
const hueOfHex = (hx) => { const c = rgbOf(hx); const r = c.r / 255, g = c.g / 255, b = c.b / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const d = mx - mn; if (d < 0.12) return null; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return Math.round((h * 60 + 360) % 360); };
const saturatedHex = (hx) => { const c = rgbOf(hx); const mx = Math.max(c.r, c.g, c.b); return c.a >= 0.5 && mx - Math.min(c.r, c.g, c.b) >= 90 && mx >= 90; };

/**
 * Шаг 2 правила акцента: насыщенной заливки у кнопок нет — цвет ссылок при наведении. Мышь наводится по очереди
 * на ссылки, отобранные в странице (indices в querySelectorAll('a[href]'), до 8 разного вида); сравниваются цвет
 * видимого текста, подчёркивания и фона ссылки до и после. → { tried, items: [{ hex, how, sel, text, x, y, w, h }] }
 */
async function hoverAccents(page, indices) {
  if (!indices || !indices.length) return { tried: 0, items: [] };
  const read = (a) => {
    const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    const t = [a, ...a.querySelectorAll('*')].find((x) => own(x).length > 0) || a; const s = getComputedStyle(t); const r = a.getBoundingClientRect();
    const cls = [...a.classList].slice(0, 2).map((c) => '.' + c).join('');
    return { color: s.color, deco: s.textDecorationLine !== 'none' ? s.textDecorationColor : '', bg: getComputedStyle(a).backgroundColor, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24), sel: (a.parentElement ? a.parentElement.tagName.toLowerCase() + ' > ' : '') + 'a' + cls };
  };
  /* ручки только на отобранные ссылки (до 8), а не на все a[href] страницы */
  const arr = await page.evaluateHandle((idx) => { const all = document.querySelectorAll('a[href]'); return idx.map((i) => all[i]).filter(Boolean); }, indices);
  const links = [...(await arr.getProperties()).values()].map((h) => h.asElement()).filter(Boolean);
  await arr.dispose().catch(() => {});
  const raw = []; let tried = 0;
  try {
    for (const h of links) {
      const before = await h.evaluate(read).catch(() => null); if (!before) continue;
      try { await h.hover(); } catch { continue; }
      tried++; await sleep(350); /* переход цвета у ссылок обычно 150–300 мс */
      const after = await h.evaluate(read).catch(() => null); if (!after) continue;
      for (const [k, how] of [['color', 'текст'], ['deco', 'подчёркивание'], ['bg', 'фон']]) if (after[k] && after[k] !== before[k]) raw.push({ css: after[k], how, sel: after.sel, text: after.text, x: before.x, y: before.y, w: before.w, h: before.h });
    }
  } finally {
    await page.mouse.move(0, 0).catch(() => {});
    await Promise.all(links.map((h) => h.dispose().catch(() => {})));
    await scrollToY(page, 0).catch(() => {});
  }
  const hexes = raw.length ? await hexColors(page, raw.map((x) => x.css)).catch(() => []) : [];
  /* одна запись на ссылку и цвет: текст и подчёркивание одного цвета — «текст, подчёркивание» */
  const items = [];
  raw.forEach((x, k) => {
    const hx = hexes[k]; if (!hx || !saturatedHex(hx)) return;
    const hex = hx.slice(0, 7); const same = items.find((o) => o.hex === hex && o.x === x.x && o.y === x.y && o.sel === x.sel);
    if (same) same.how += `, ${x.how}`; else items.push({ ...x, hex });
  });
  return { tried, items };
}

/**
 * Акценты страницы по оттенку (корзины по 30°): [{ hex, hue, count, fill, first, hover }]. Первыми — заливки кнопок
 * первого экрана, затем заливки, затем по числу; hex группы — тоже с заливки первого экрана, если она есть.
 */
function groupAccents(raw) {
  const groups = {};
  for (const a of raw || []) {
    const k = a.hue === null ? 'x' : Math.round(a.hue / 30) % 12;
    const g = groups[k] || (groups[k] = { hexes: {}, hue: a.hue, count: 0, fill: false, first: false, hover: false });
    g.count++; g.hexes[a.hex] = (g.hexes[a.hex] || 0) + (a.fill && a.first ? 1000 : a.fill ? 100 : 1);
    if (a.fill) g.fill = true; if (a.fill && a.first) g.first = true; if (a.hover) g.hover = true;
  }
  return Object.values(groups).map((g) => ({ hex: Object.entries(g.hexes).sort((a, b) => b[1] - a[1])[0][0], hue: g.hue, count: g.count, fill: g.fill, first: g.first, hover: g.hover }))
    .sort((a, b) => (b.first - a.first) || (b.fill - a.fill) || (b.count - a.count));
}
/* акценты нескольких страниц (уже сгруппированные) — снова по корзинам оттенка: счёт складывается, признаки — «или» */
function mergeAccents(list) {
  const groups = {};
  for (const a of list || []) {
    const k = a.hue === null || a.hue === undefined ? 'x' : Math.round(a.hue / 30) % 12;
    const g = groups[k] || (groups[k] = { best: a, hue: a.hue, count: 0, fill: false, first: false, hover: false });
    g.count += a.count || 1; g.fill = g.fill || !!a.fill; g.first = g.first || !!a.first; g.hover = g.hover || !!a.hover;
    const pr = (x) => (x.first ? 2 : 0) + (x.fill ? 1 : 0);
    if (pr(a) > pr(g.best) || (pr(a) === pr(g.best) && (a.count || 0) > (g.best.count || 0))) g.best = a;
  }
  return Object.values(groups).map((g) => ({ hex: g.best.hex, hue: g.hue, count: g.count, fill: g.fill, first: g.first, hover: g.hover }))
    .sort((a, b) => (b.first - a.first) || (b.fill - a.fill) || (b.count - a.count));
}

/**
 * Результаты одного экрана с нескольких страниц донора (или из нескольких файлов базы) → один результат-база:
 * приём «есть у донора», если он есть хоть на одной странице. У правила берётся страница, где приём сильнее
 * (length — частота на 10 000 px, share — доля в классе, остальные — число; section-template без находок —
 * больше заголовков одного стиля), её высота (docH) и адрес (from); on — страницы, где приём есть. Гарнитуры
 * складываются (font-swapped), акценты сливаются по оттенку (accent-added).
 */
export function mergeResults(list) {
  const rs = (list || []).filter((r) => r && r.rules);
  if (rs.length <= 1) return rs[0] || null;
  const first = rs[0];
  const fonts = {};
  for (const r of rs) for (const [role, m] of Object.entries((r.page && r.page.fonts) || {})) { fonts[role] = fonts[role] || {}; for (const [f, n] of Object.entries(m)) fonts[role][f] = (fonts[role][f] || 0) + n; }
  /* сначала — сработал ли приём (доля в классе считается и без срабатывания: 4 коробки из 4 — ещё не приём),
     потом его величина */
  const rank = (e, mode) => (e.count > 0 ? 1e6 : 0) + (mode === 'length' ? e.per10kpx || 0 : mode === 'share' ? e.classShare || (e.info && e.info.share) || 0 : e.count || 0);
  const tie = (e) => Math.max((e.info && e.info.top && e.info.top.count) || 0, (e.info && e.info.heads && e.info.heads.top && e.info.heads.top.count) || 0);
  const out = { ...first, urls: [...new Set(rs.flatMap((r) => r.urls || [r.url]))], merged: rs.length, page: { ...first.page, fonts }, rules: {} };
  for (const id of new Set(rs.flatMap((r) => Object.keys(r.rules)))) {
    const es = rs.map((r) => ({ r, e: r.rules[id] })).filter((x) => x.e);
    const mode = (RULES[id] || es[0].e).mode;
    const best = es.slice().sort((a, b) => rank(b.e, mode) - rank(a.e, mode) || tie(b.e) - tie(a.e))[0];
    const m = { ...best.e, docH: best.e.docH || (best.r.page && best.r.page.docH), from: best.e.from || best.r.url, on: [...new Set(es.filter((x) => x.e.count).flatMap((x) => x.e.on || [x.r.url]))] };
    if (id === 'accent-added') m.info = { ...(best.e.info || {}), accents: mergeAccents(es.flatMap((x) => (x.e.info && x.e.info.accents) || [])) };
    out.rules[id] = m;
  }
  return out;
}

/**
 * Несколько файлов базы (или прогонов сайта «до») → один документ базы: экраны по имени; где имени нет —
 * экран того же класса ширины (baselineResult). → { kind, version (наименьшая), url, urls, files, viewports }
 */
export function mergeBaselines(docs) {
  if (docs.length === 1) return docs[0].json;
  const names = [...new Set(docs.flatMap((d) => (d.json.viewports ? Object.keys(d.json.viewports) : [d.json.viewport || 'desktop'])))];
  const viewports = {};
  for (const vn of names) {
    const vp = parseViewport(vn); const wide = vp && vp.width ? vp.width >= 1024 : ['desktop', 'laptop'].includes(vn);
    const list = docs.map((d) => baselineResult(d.json, vn, vp)).filter((r) => r && r.page && ((r.page.vw || 0) >= 1024) === wide);
    if (list.length) viewports[vn] = mergeResults(list);
  }
  const urls = [...new Set(Object.values(viewports).flatMap((r) => r.urls || [r.url]))];
  return { kind: 'cliche-baseline', version: Math.min(...docs.map((d) => d.json.version || 1)), url: docs[0].json.url || urls[0], urls, files: docs.map((d) => d.file), viewports };
}

/** Акцент строкой: «#6A4EE1×1 (заливка, первый экран)». */
const accentText = (a) => `${a.hex}×${a.count}${a.first ? ' (заливка, первый экран)' : a.fill ? ' (заливка)' : a.hover ? ' (ссылки при наведении)' : ''}`;
/** Пометка к акценту, когда заливок не было и наводилась мышь. */
const hoverNote = (h) => (h ? ` [насыщенной заливки у кнопок нет — наведение на ссылки: ${h.tried} из ${h.links}, цветов ${h.colors}${h.error ? `, ошибка: ${h.error}` : ''}]` : '');

/* ======================================================================
   Замер одного экрана: открыть, прокрутить, посчитать. Возвращает результат без сравнения.
   ====================================================================== */
export async function measureViewport(browser, url, vpName, vp, { keepPage = false, blockSels = [] } = {}) {
  const page = await preparePage(browser, vp, {});
  const cssTexts = [];
  page.on('response', async (r) => { try { if (r.request().resourceType() === 'stylesheet' && r.ok()) cssTexts.push(await r.text()); } catch { /* тело недоступно */ } });
  /* нажатие SITE_REWORK_DISMISS увело на другой адрес и lib открыл нужную страницу заново — стили промежуточной не в счёт */
  onPageLogReset(page, () => { cssTexts.length = 0; });
  try {
    await gotoRetry(page, url, { timeout: 90000 });
    /* адрес, куда пришли (с переадресацией сервера: /menu → /menu/), — до окон: SITE_REWORK_DISMISS жмёт уже
       waitForOverlay (lib), и сравнивать с адресом после него поздно */
    const landed = page.url();
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    /* окна согласия и выбора города (SITE_REWORK_DISMISS — как у discover и typeset): у mamuka.rest окно выбора
       города лежит поверх всех страниц, его кнопки и метки иначе идут в базу донора. Открытое окно — после
       closeConsent (ворота, которые он закроет, — не WARN) */
    const overlay = await waitForOverlay(page, 5000, { modalCheck: false });
    const consent = await closeConsent(page).catch((e) => ({ found: false, error: String(e && e.message || e).slice(0, 120) }));
    /* выбор в окне может увести на другую страницу (mamuka.rest: «Ярославль» на /menu открывает главную, и мерилась
       главная — 3132 px вместо 18 976) — выбор запомнен, открыть нужный адрес ещё раз */
    const pressed = (consent && consent.found) || ((overlay && overlay.dismiss) || []).some((d) => d && d.found);
    const bare = (u) => String(u).replace(/#.*$/, '').replace(/\/+$/, '');
    /* нажатие SITE_REWORK_DISMISS увело — lib (waitForOverlay → applyDismiss) уже открыл нужную страницу заново: куда
       увело и чем кончилось — из его итога (ждать перехода здесь уже нечего) */
    const libNav = ((overlay && overlay.dismiss) || []).find((d) => d && d.nav);
    if (libNav) { consent.movedTo = libNav.nav; if (libNav.wrongPage) consent.again = `снова увело на ${libNav.back} — мерилась она`; else if (libNav.again) consent.again = 'окно вернулось — сайт не запомнил выбор'; }
    if (pressed && !libNav && bare(page.url()) === bare(landed)) await page.waitForNavigation({ timeout: 2500, waitUntil: 'domcontentloaded' }).catch(() => {});
    if (bare(page.url()) !== bare(landed)) {
      consent.movedTo = page.url();
      await gotoRetry(page, url, { timeout: 90000 });
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await waitForOverlay(page, 5000, { modalCheck: false });
      const again = await closeConsent(page).catch(() => null);
      if (again && again.found) consent.again = again.closed ? 'закрыто' : 'не закрылось';
      if (bare(page.url()) !== bare(landed)) consent.again = `снова увело на ${page.url()} — мерилась она`;
    }
    if (typeof LIB.checkOpenModal === 'function') await LIB.checkOpenModal(page).catch(() => null);
    /* нажатое по SITE_REWORK_DISMISS уже в waitForOverlay (lib) — closeConsent его не жмёт снова: в итог из overlay */
    if (consent && !consent.dismiss && overlay && overlay.dismiss && overlay.dismiss.length) {
      consent.dismiss = overlay.dismiss;
      if (!consent.found && overlay.dismiss.some((d) => d && d.found)) Object.assign(consent, { found: true, closed: overlay.dismiss.every((d) => !d.found || d.gone || d.nav), kind: 'dismiss', pick: (overlay.dismiss.find((d) => d.found) || {}).label || null });
    }
    await forceInstantScroll(page);
    await sleep(1200);
    const reveal = await page.evaluate(revealCandidates);
    const sc = await scrollThrough(page, { pause: 300 });
    await sleep(700);
    /* картинки, которые прокрутка запустила (ленивые), — догрузить до замера сеток */
    const images = await page.evaluate(waitImagesInPage, 4000).catch(() => null);
    const inline = await page.evaluate(() => [...document.querySelectorAll('style:not([data-rw])')].map((s) => s.textContent).join('\n'));
    const found = await evaluateWith(page, inPage, { ids: Object.keys(RULES), blocks: blockSels }, { eff: EFFECTIVE_OPACITY_FN, hex: HEX_FN, zoom: EFFECTIVE_ZOOM_FN, svc: IS_TILDA_SERVICE_FN, buzz: BUZZ_RE });
    const css = cssRules(cssTexts.join('\n') + '\n' + inline);
    const P = found.page; delete found.page;
    const hoverLinks = P.hoverLinks || []; delete P.hoverLinks;
    /* акцент: насыщенной заливки у кнопок нет — цвет ссылок при наведении (правило акцента, шаг 2) */
    const A = found['accent-added']; const rawAcc = (A.info && A.info.raw) || [];
    let hover = null;
    if (!rawAcc.some((a) => a.fill)) {
      const hv = await hoverAccents(page, hoverLinks).catch((e) => ({ tried: 0, items: [], error: String(e && e.message || e).slice(0, 120) }));
      hover = { links: hoverLinks.length, tried: hv.tried, colors: hv.items.length, ...(hv.error ? { error: hv.error } : {}) };
      for (const x of hv.items) {
        const hu = hueOfHex(x.hex);
        rawAcc.push({ hex: x.hex, hue: hu, fill: false, first: x.y < P.vh, hover: true, how: `ссылка при наведении, ${x.how}` });
        A.items.push({ sel: x.sel, note: `${x.hex} ссылка при наведении (${x.how}), «${x.text}»`, x: Math.round(x.x), y: Math.round(x.y), w: Math.round(x.w), h: Math.round(x.h), hue: hu });
      }
    }
    A.info = { accents: groupAccents(rawAcc), ...(hover ? { hover } : {}) };
    found['fade-up-reveal'] = { items: reveal.map((r) => ({ sel: r.sel, note: `сдвиг ${r.ty}px`, y: r.y, h: r.h, w: r.w, x: r.x })), info: { cssRules: css['fade-up-css'].length, blocks: reveal.length } };
    if (reveal.length < 6 && css['fade-up-css'].length < 3) found['fade-up-reveal'].items = [];
    /* у пружины в пометке — селектор правила (где она), у hover-lift и transition-all он уже в тексте */
    for (const k of CSS_RULES) found[k] = { items: css[k].slice(0, 30).map((x) => ({ sel: x.text, note: k === 'bounce-ease' && x.sel ? `правило CSS · ${x.kf ? '@keyframes, шаг ' : ''}${x.sel.slice(0, 70)}${x.via ? ` (через ${x.via})` : ''}` : 'правило CSS', css: x.sel || '' })), info: { rules: css[k].length } };
    /* обоснования с block: находки из CSS — к элементам своего селектора (второй круг 29.09, случай opara: пружина входа
       первого экрана с block «#hero» не покрывалась никогда — у правила CSS нет элемента) */
    if (blockSels.length) {
      const cssItems = [...CSS_RULES].flatMap((k) => found[k].items);
      const got = cssItems.length ? await page.evaluate(cssItemBlocks, { sels: cssItems.map((i) => i.css), blocks: blockSels }).catch(() => null) : null;
      if (got) cssItems.forEach((i, n) => { i.blocks = got[n].blocks; i.els = got[n].els; });
    }
    const docArea = P.vw * P.docH;
    const cons = consent && (consent.found || consent.error || consent.dismiss) ? { found: !!consent.found, closed: !!consent.closed, kind: consent.kind || null, pick: consent.pick || null, ...(consent.movedTo ? { movedTo: consent.movedTo, reopened: true, ...(consent.again ? { again: consent.again } : {}) } : {}), ...(consent.error ? { error: consent.error } : {}), ...(consent.dismiss ? { dismiss: consent.dismiss.map((d) => (d.found ? `${d.spec}: нажато` : `${d.spec}: ${d.why || 'не найдено'}`)) } : {}) } : null;
    const result = { url, viewport: vpName, date: new Date().toISOString(), page: P, open: { attempt: (page.gotoInfo || {}).attempt || 1, waitUntil: (page.gotoInfo || {}).waitUntil || 'networkidle2', overlay: overlay.overlay || null, consent: cons, stuck: !!sc.stuck, reachedBottom: !!sc.reachedBottom, images }, rules: {} };
    for (const [id, meta] of Object.entries(RULES)) {
      const f = found[id] || { items: [], info: {} };
      const items = f.items || [];
      const rects = items.filter((i) => i.w && i.h).sort((a, b) => b.w * b.h - a.w * a.h);
      const kept = []; for (const r of rects) if (!kept.some((k) => r.x >= k.x - 1 && r.y >= k.y - 1 && r.x + r.w <= k.x + k.w + 1 && r.y + r.h <= k.y + k.h + 1)) kept.push(r);
      const area = kept.reduce((a, r) => a + r.w * r.h, 0);
      const entry = { weight: meta.w, mode: meta.mode, title: meta.t, count: items.length, share: +(area / docArea * 100).toFixed(1), per10kpx: +(items.length / (P.docH / 10000)).toFixed(2), items: items.slice(0, 40), info: f.info || {} };
      /* блоки обоснований у всех находок (items режутся до 40, покрытие считается по всем) */
      if (blockSels.length) entry.itemBlocks = items.map((i) => i.blocks || []);
      if (meta.mode === 'share') entry.classShare = (f.info && f.info.share) || 0;
      result.rules[id] = entry;
    }
    if (keepPage) result._page = page; else await page.close().catch(() => {});
    return result;
  } catch (e) { await page.close().catch(() => {}); throw e; }
}

/* ======================================================================
   Сравнение с базой, запреты, обоснования, вердикт.
   ====================================================================== */
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|-apple-system|blinkmacsystemfont|inherit|initial|emoji|math)$/i;
const famKey = (f) => String(f).toLowerCase().replace(/["'\s_-]+/g, '').replace(/(variable|var|vf|webfont|web)$/, '');
const sameFamily = (a, b) => { const x = famKey(a), y = famKey(b); if (!x || !y) return false; return x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))); };
const ROLE_RU = { heading: 'заголовки', text: 'текст', button: 'кнопки', small: 'мелкое' };
const fontTotals = (fonts) => { const tot = {}; let all = 0; for (const r of Object.values(fonts || {})) for (const [f, n] of Object.entries(r)) { tot[f] = (tot[f] || 0) + n; all += n; } return { tot, all: all || 1 }; };
const topFam = (roleMap) => { const e = Object.entries(roleMap || {}).sort((a, b) => b[1] - a[1]); const s = e.reduce((a, [, n]) => a + n, 0) || 1; return e.slice(0, 2).map(([f, n]) => `${f} ${Math.round(n / s * 100)}%`).join(', '); };
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/* block — CSS-селектор, если похож на него: #id, .класс, [атрибут], составной, без кириллицы; имена тегов в нём — только
   теги HTML (main, footer, section > div). Иначе это подпись — «главная: хиты кухни», «hero», «hero cards» (старый
   список [{ rule, block: "hero", why }] из reference/authorship.md, второй круг 29.09: «hero» считался селектором тега,
   на странице ничего не находил, и обоснование переставало действовать), и область задаёт только page */
const HTML_TAGS = new Set(('a abbr address article aside audio b blockquote body button canvas caption cite code dd details dialog div dl dt em '
  + 'fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup html i iframe img input label legend li main mark menu nav ol p '
  + 'picture pre q s section select small span strong sub summary sup svg table tbody td textarea tfoot th thead time tr u ul video').split(' '));
const selectorLike = (s) => {
  if (typeof s !== 'string') return false; const t = s.trim();
  if (!t || t === '*' || /[А-Яа-яЁё]/.test(t) || !/^[#.[:*a-z]/i.test(t) || /:\s/.test(t)) return false;
  const bare = t.replace(/\[[^\]]*\]/g, '[]').replace(/\([^)]*\)/g, '()');
  return [...bare.matchAll(/(?:^|[\s>+~,(])([a-z][a-z0-9-]*)/gi)].every((m) => HTML_TAGS.has(m[1].toLowerCase()));
};
const asList = (v) => (v == null || v === '' ? null : (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean));

/**
 * Файл обоснований: { правило: { метка: почему | { why, page, block } } } или [{ rule, block, page, why }].
 * page — путь страницы («/», «/menu»; список через запятую или массив; «*» — все), block — CSS-селектор блока
 * (el.closest): обоснование снимает «НЕТ У ДОНОРА» только на этих страницах и только у находок в этих блоках.
 * Без page и селектора — на всех страницах (прежний вид, ключ-метка). → { file, exists, map, bad, sels }:
 * map[правило] = [{ block, page, sel, selIdx, why }], sels — селекторы для замера в странице.
 */
export function loadDecisions(file) {
  const out = { file, exists: false, map: {}, bad: [], sels: [] };
  if (!file || !fs.existsSync(file)) return out;
  out.exists = true;
  const j = readJson(file);
  if (!j) { out.bad.push('не читается как JSON'); return out; }
  const list = Array.isArray(j) ? j : Array.isArray(j.decisions) ? j.decisions
    : Object.entries(j).filter(([k]) => !k.startsWith('_')).flatMap(([rule, v]) => (typeof v === 'string' ? [{ rule, label: '*', why: v }] : v && typeof v === 'object' ? Object.entries(v).filter(([b]) => !b.startsWith('_')).map(([label, why]) => (typeof why === 'string' ? { rule, label, why } : { rule, label, ...(why || {}) })) : []));
  for (const d of list) {
    if (!d || !d.rule) { out.bad.push('запись без rule'); continue; }
    if (!RULES[d.rule]) { out.bad.push(`неизвестное правило ${d.rule}`); continue; }
    const why = String(d.why || '').trim();
    const name = d.block || d.label || '*';
    if (why.length < 8) { out.bad.push(`${d.rule}/${name}: пустое «почему»`); continue; }
    const sel = d.selector || d.sel || (selectorLike(d.block) ? String(d.block).trim() : null);
    let selIdx = null;
    if (sel) { selIdx = out.sels.indexOf(sel); if (selIdx < 0) { out.sels.push(sel); selIdx = out.sels.length - 1; } }
    (out.map[d.rule] = out.map[d.rule] || []).push({ block: name, page: asList(d.page), sel, selIdx, why });
  }
  return out;
}

/* путь страницы для сверки с page обоснования: «/», «/menu»; файл — путь файла; /index.html — «/» */
const pathKey = (u) => { let p; try { const x = new URL(u); p = x.protocol === 'file:' ? decodeURIComponent(x.pathname) : x.pathname; } catch { p = String(u).replace(/[?#].*$/, ''); } p = p.replace(/\/index\.html?$/i, '/').replace(/\/+$/, ''); return p || '/'; };
/** Действует ли обоснование на странице url: page не задан или «*» — везде; путь — точно (у file:// — концом пути). */
export function pageMatches(pages, url) {
  if (!pages || !pages.length) return true;
  const me = pathKey(url); const file = /^file:/i.test(String(url));
  let raw = ''; try { raw = decodeURIComponent(new URL(url).pathname); } catch { /* не адрес */ }
  return pages.some((p) => {
    if (p === '*') return true;
    if (/^(https?|file):/i.test(p)) return pathKey(p) === me;
    const s = String(p).replace(/^\/+/, ''); const q = pathKey('/' + s);
    return me === q || (file && !!s && (raw.endsWith('/' + s) || me.endsWith(q)));
  });
}
const scopeText = (x) => `${x.page ? x.page.join(',') + ' ' : ''}${x.sel || (x.block && x.block !== '*' ? x.block : x.page ? '' : 'все страницы')}`.trim();

/**
 * Сравнить результат экрана с базой донора, запретами и обоснованиями; дописывает в результат
 * пометки правил (mark, ratio, banned, question, decision), индекс и вердикт.
 * base — результат донора для этого экрана (или null), bans — activeBans(), decisions — loadDecisions().
 */
export function compareResult(result, base, { bans = null, decisions = null, baseExact = true } = {}) {
  const P = result.page; const fail = [], warn = [];
  /* гарнитуры: только с базой */
  const fsw = result.rules['font-swapped'];
  if (base && base.page && base.page.fonts) {
    const S = fontTotals(P.fonts), D = fontTotals(base.page.fonts);
    /* гарнитура донора — любая, которой у него набран видимый текст (Roboto на 28 знаков мелкого — тоже его) */
    const donorFams = Object.entries(D.tot).filter(([, n]) => n > 0).map(([f]) => f);
    const items = [];
    for (const [f, n] of Object.entries(S.tot)) {
      if (GENERIC.test(f)) continue;
      const roles = Object.entries(P.fonts).map(([r, m]) => [r, m[f] ? m[f] / (Object.values(m).reduce((a, b) => a + b, 0) || 1) : 0]).filter(([, s]) => s >= 0.15);
      if (n / S.all < 0.05 && !roles.length) continue;
      if (donorFams.some((d) => sameFamily(f, d))) continue;
      const where = roles.map(([r, s]) => `${ROLE_RU[r]} ${Math.round(s * 100)}%`).join(', ');
      const donorSame = roles.map(([r]) => `${ROLE_RU[r]}: ${topFam(base.page.fonts[r]) || '—'}`).join('; ');
      items.push({ sel: 'font-family', note: `${f} — ${Math.round(n / S.all * 100)}% текста${where ? ` (${where})` : ''}; у донора ${donorSame || 'такой гарнитуры нет'}` });
    }
    fsw.items = items; fsw.count = items.length; fsw.per10kpx = +(items.length / (P.docH / 10000)).toFixed(2);
    fsw.info = { donorFamilies: donorFams.slice(0, 8) };
  } else if (fsw) { fsw.items = []; fsw.count = 0; fsw.info = { note: 'нужна база донора' }; }

  let index = 0;
  const banConflicts = new Set(base && bans ? conflictsWith(bans, base).map((c) => c.rule) : []);
  /* база из нескольких страниц донора (mergeResults): у правила своя страница-источник и своя высота */
  const onPage = (d) => (d && d.from && base && d.from !== base.url ? ` на ${pathKey(d.from)}` : '');
  const blockCounts = (P && P.blocks) || [];
  for (const [id, e] of Object.entries(result.rules)) {
    delete e.mark; delete e.ratio; delete e.banned; delete e.question; delete e.decision; delete e.decisionPartial; delete e.allowed; delete e.counts; delete e.donorNote;
    const d = base && base.rules ? base.rules[id] || { count: 0 } : null;
    if (!e.count) { if (d && d.count) e.donorNote = `у донора есть (${d.count}${onPage(d)}), здесь нет`; continue; }
    /* порог приёма — только у проверяемой страницы: две метки капсом — ещё не «мелкий капс везде» */
    const min = (RULES[id] || {}).min;
    if (min && e.count < min) { e.mark = 'ниже порога'; e.counts = false; e.donorNote = `меньше ${min} — приёмом не считается${d && d.count ? `; у донора ${d.count}${onPage(d)}` : ''}`; continue; }
    /* пометка относительно донора */
    if (!d) e.mark = 'без базы';
    else if (id === 'font-swapped') e.mark = 'НЕТ У ДОНОРА';
    else if (id === 'accent-added') {
      const dh = ((d.info && d.info.accents) || []).filter((a) => a.hue !== null).map((a) => a.hue);
      const mine = (e.info.accents || []);
      const alien = mine.filter((a) => a.hue === null || !dh.some((h) => hueDist(h, a.hue) <= 30));
      const donorAcc = ((d.info && d.info.accents) || []).map(accentText).join(', ');
      if (!alien.length) { e.mark = 'есть у донора'; e.donorNote = `у донора: ${donorAcc}`; }
      else { e.mark = 'НЕТ У ДОНОРА'; e.donorNote = dh.length ? `у донора акцент другого цвета: ${donorAcc}` : 'у донора нет насыщенного цвета действий: ни заливки кнопок, ни ссылок при наведении, ни меток'; }
    } else if (id === 'section-template' && !d.count) {
      /* у донора разделов с заголовком меньше 4, но все одного стиля — язык тот же; заголовков у донора не нашлось
         вовсе — сравнить не с чем, а не «нет» (заголовки на div считаются с 29.09, старая база их не видела) */
      const di = d.info || {};
      const bySec = di.sections >= 2 && di.top ? { n: di.sections, top: di.top, what: 'заголовки разделов' } : null;
      const byHead = di.heads && di.heads.count >= 2 && di.heads.top ? { n: di.heads.count, top: di.heads.top, what: 'крупные заголовки страницы' } : null;
      const src = [bySec, byHead].filter(Boolean).find((s) => s.top.count >= 2 && s.top.count / s.n >= 0.75);
      if (di.sections === undefined) e.mark = 'НЕТ У ДОНОРА';
      else if (src) { e.mark = 'есть у донора'; e.donorNote = `у донора ${src.what} одного стиля: ${src.top.count} из ${src.n}${onPage(d)} (${src.top.style})`; }
      else if (!di.sections && !(di.heads && di.heads.count)) { e.mark = 'не измерено у донора'; e.donorNote = 'у донора не найдено ни одного заголовка раздела — сравнить не с чем'; }
      else { e.mark = 'НЕТ У ДОНОРА'; e.donorNote = `у донора заголовков разделов ${di.sections}, одного стиля ${di.top ? di.top.count : 0}; крупных заголовков ${di.heads ? di.heads.count : 0}, одного стиля ${di.heads && di.heads.top ? di.heads.top.count : 0}`; }
    } else if (!d.count) e.mark = 'НЕТ У ДОНОРА';
    else if (e.mode === 'length') {
      const ratio = d.per10kpx ? e.per10kpx / d.per10kpx : Infinity;
      e.ratio = +ratio.toFixed(2);
      e.donorNote = `у донора ${d.count} на ${d.docH || base.page.docH} px${onPage(d)} (${d.per10kpx} на 10 000), здесь ${e.count} на ${P.docH} px (${e.per10kpx})`;
      e.mark = e.count > d.count && ratio > 2 ? 'размножено' : 'есть у донора';
    } else if (e.mode === 'share') {
      const di = d.info || {};
      const ds = d.classShare || di.share || (di.buttons ? di.pills / di.buttons : 0) || (di.boxes ? di.mid / di.boxes : 0); const ratio = ds ? (e.classShare || 0) / ds : Infinity;
      e.ratio = +ratio.toFixed(2);
      e.donorNote = id === 'pill-everywhere' ? `пилюль среди кнопок: у донора ${Math.round(ds * 100)}% (${(d.info || {}).pills}/${(d.info || {}).buttons}), здесь ${Math.round((e.classShare || 0) * 100)}% (${e.info.pills}/${e.info.buttons})` : `доля в классе: у донора ${Math.round(ds * 100)}%, здесь ${Math.round((e.classShare || 0) * 100)}%`;
      e.mark = ratio > 2 ? 'размножено' : 'есть у донора';
    } else e.mark = 'есть у донора';
    if (e.mark === 'есть у донора' && !e.donorNote && d) e.donorNote = `у донора ${d.count}${onPage(d)}`;
    /* запрет пользователя */
    const ban = bans && bans[id];
    if (ban) {
      const donorUrl = base && base.url;
      if (donorUrl && ban.allowedFor && ban.allowedFor.includes(donorUrl)) e.allowed = `запрет «${ban.quote}» снят пользователем для этого донора`;
      else if (banConflicts.has(id)) { e.question = `запрет пользователя (${ban.date}${ban.scope === 'site' ? ', только этот сайт' : ''}) «${ban.quote}» спорит с чертой донора (у донора ${d.count}) — спросить: держится ли запрет для этого донора`; warn.push(`${id}: ВОПРОС пользователю — запрет спорит с донором`); }
      else { e.banned = `ЗАПРЕЩЁН пользователем (${ban.date}${ban.block ? ', ' + ban.block : ''}${ban.scope === 'site' ? `, только прогон ${ban.run}` : ''}): «${ban.quote}»`; fail.push(`${id}: ЗАПРЕЩЁН пользователем${ban.scope === 'site' ? ` (для этого сайта)` : ''}`); }
    }
    /* обоснование: действует на своих страницах (page) и только на находки в своих блоках (block — селектор) */
    const decAll = (decisions && decisions.map[id]) || [];
    const here = decAll.filter((x) => pageMatches(x.page, result.url));
    if (here.some((x) => x.sel == null)) e.decision = here.filter((x) => x.sel == null);
    else if (here.length) {
      const blocks = e.itemBlocks || (e.items || []).map((i) => i.blocks || []);
      const hit = (b) => here.filter((x) => b.includes(x.selIdx));
      const covered = blocks.filter((b) => hit(b).length).length;
      if (e.count && covered >= e.count) e.decision = here.filter((x) => blocks.some((b) => b.includes(x.selIdx)));
      else {
        const miss = (e.items || []).filter((i) => !hit(i.blocks || []).length).map((i) => i.sel);
        const none = here.filter((x) => blockCounts[x.selIdx] === 0 || blockCounts[x.selIdx] === -1).map((x) => `${x.sel} ${blockCounts[x.selIdx] === -1 ? '(неверный селектор)' : '(на странице нет)'}`);
        /* находка из CSS, у селектора которой на странице нет элемента (@keyframes, :root без var(), селектор ничего не
           нашёл), блоком не покрывается никогда — сказать, что ей нужен page без block */
        const noEl = CSS_RULES.has(id) ? (e.items || []).filter((i) => !(i.els > 0) && !hit(i.blocks || []).length).length : 0;
        e.decisionPartial = { covered, total: e.count, by: here.map((x) => x.sel), uncovered: [...new Set(miss)].slice(0, 3), ...(none.length ? { notFound: none } : {}), ...(noEl ? { cssNoEl: noEl } : {}) };
      }
    }
    const counted = e.mark !== 'есть у донора';
    e.counts = counted || !!e.banned;
    if (counted) index += e.weight;
    if (e.banned) index += e.weight;
    const dp = e.decisionPartial;
    const partial = dp ? ` (обосновано ${dp.covered} из ${dp.total} — блоки ${dp.by.join(', ')}; без обоснования: ${dp.uncovered.join('; ') || '—'}${dp.notFound ? `; ${dp.notFound.join(', ')}` : ''}${dp.cssNoEl ? `; у ${dp.cssNoEl} — правило CSS без элемента на странице: block их не покроет, для них обоснование — page без block` : ''})` : '';
    if (e.mark === 'НЕТ У ДОНОРА' && !e.decision) (e.weight >= 3 ? fail : warn).push(`${id}: вес ${e.weight}, НЕТ У ДОНОРА без обоснования${partial}`);
    if (e.mark === 'размножено') (e.weight >= 2 ? fail : warn).push(`${id}: размножено ×${e.ratio} (порог ×2)`);
    if (e.mark === 'не измерено у донора' && !e.decision) warn.push(`${id}: вес ${e.weight}, не измерено у донора — сверить глазами или записать обоснование`);
    if (e.mark === 'без базы' && e.weight >= 3 && !e.decision) warn.push(`${id}: вес 3 (без базы — сравнить не с чем)${partial}`);
  }
  if (!base) warn.push('нет --baseline: вердикт только по запретам и весу 3');
  else if (!baseExact) warn.push(`база снята на другом экране (${base.viewport}) — частоты и доли неточны`);
  if (result.open && result.open.stuck) warn.push('страница не прокрутилась — появления и нижние блоки недостоверны');
  for (const w of result.warnings || []) warn.push(libLabel(w));
  result.index = index;
  result.reasons = { fail, warn };
  result.verdict = fail.length ? 'FAIL' : warn.length ? 'WARN' : 'OK';
  return result;
}

/* WARN из lib с подписью: открытое окно (checkOpenModal) — как есть, остальное — свой стиль не вставился (CSP) */
const libLabel = (w) => (/^на странице открыто окно/.test(w) ? w : `свой стиль: ${w}`);

/* ---------- печать ---------- */
const ORDER = (e) => (e.banned ? 0 : e.mark === 'НЕТ У ДОНОРА' && e.weight >= 3 ? 1 : e.mark === 'размножено' ? 2 : e.question ? 3 : e.mark === 'НЕТ У ДОНОРА' || e.mark === 'не измерено у донора' ? 4 : e.mark === 'без базы' ? 5 : 6);
export function printResult(r, { log = console.log } = {}) {
  const P = r.page;
  log(`\nШаблонность: ${r.url} · ${r.viewport} ${P.vw}×${P.vh} · страница ${P.docH} px · секций ${P.sections}` + (r.open && r.open.attempt > 1 ? ` · открылась с ${r.open.attempt}-й попытки (${r.open.waitUntil})` : ''));
  const T = r.taste;
  const tasteLine = T ? `${T.bans.length} запрет(ов)${T.bans.length ? ' — ' + T.bans.map((id) => `${id}${T.scopes && T.scopes[id] === 'site' ? ' (только этот сайт)' : ''}`).join(', ') : ''}${T.elsewhere && T.elsewhere.length ? `; запретов других сайтов ${T.elsewhere.length} — здесь не действуют` : ''}; прогон ${T.run || '—'}` : 'не подключён';
  const B = r.baseline;
  const baseWhere = B ? `${B.url}${B.urls && B.urls.length > 1 ? ` + ${B.urls.filter((u) => u !== B.url).map(pathKey).join(', ')} (страниц ${B.urls.length})` : ''}` : '';
  log(`база: ${B ? `${baseWhere} (${B.viewport}${B.exact ? '' : ', ДРУГОЙ ЭКРАН'})${B.files && B.files.length > 1 ? ` из ${B.files.length} файлов` : ''}` : 'нет'} · журнал вкуса: ${tasteLine} · обоснования: ${r.decisions ? `${r.decisions.file}${r.decisions.exists ? ` (${r.decisions.rules} правил)` : ' (файла нет)'}` : '—'}`);
  if (B && (B.version || 0) < 3) log('      база снята версией до правки акцента и фото-сеток (кнопки Framer, наведение ссылок, плитка «ещё» в сетке) — пересобрать: cliche.mjs baseline <донор> --out <файл>');
  else if (B && (B.version || 0) < 4) log('      база снята версией до 29.09 (скрытое в счёте, заголовки только h1–h3, мелкий капс донора от 4 меток, без окна выбора города) — пересобрать: cliche.mjs baseline <донор> --pages "/,…" --out <файл>');
  const cons = r.open && r.open.consent;
  if (cons && (cons.found || cons.dismiss)) log(`окно на странице: ${cons.found ? `${cons.closed ? 'закрыто' : 'НЕ закрылось'}${cons.pick ? ` («${cons.pick}»)` : ''}${cons.movedTo ? ` · увело на ${cons.movedTo} — адрес открыт заново${cons.again ? ` (окно снова: ${cons.again})` : ''}` : ''}` : 'не найдено'}${cons.dismiss ? ` · SITE_REWORK_DISMISS: ${cons.dismiss.join('; ')}` : ''}`);
  const hit = Object.entries(r.rules).filter(([, e]) => e.count).sort((a, b) => ORDER(a[1]) - ORDER(b[1]) || b[1].weight - a[1].weight || b[1].share - a[1].share);
  log(`индекс ${r.index ?? '—'} · сработало правил ${hit.length}, в счёт ${hit.filter(([, e]) => e.counts).length}\n`);
  for (const [id, e] of hit) {
    const mark = e.mark === 'размножено' ? `размножено ×${e.ratio}` : e.mark || '';
    const dp = e.decisionPartial;
    const tags = [mark, e.banned ? '✗ ' + e.banned : '', e.question ? '? ВОПРОС: ' + e.question : '', e.allowed || '',
      e.decision ? `обосновано: ${e.decision.map((x) => `${scopeText(x) ? scopeText(x) + ' ' : ''}— ${x.why}`).join(' | ').slice(0, 160)}` : '',
      dp ? `обосновано ${dp.covered} из ${dp.total} (${dp.by.join(', ')})${dp.notFound ? ` · ${dp.notFound.join(', ')}` : ''}${dp.cssNoEl ? ` · без элемента ${dp.cssNoEl} (правило CSS) — для них page без block` : ''}` : ''].filter(Boolean);
    log(`${e.counts ? WMARK[e.weight] : '···'} ${id.padEnd(20)} ${String(e.count).padStart(3)} шт ${String(e.share).padStart(5)}% стр.  ${tags.join(' · ')}`);
    log(`    ${e.title}` + (e.donorNote ? `  [${e.donorNote}]` : ''));
    const uniq = []; for (const i of e.items) { const s = `${i.sel}${i.note ? ' — ' + i.note : ''}`; if (!uniq.includes(s)) uniq.push(s); }
    uniq.slice(0, 4).forEach((s) => log(`    · ${s.slice(0, 180)}`));
    if (uniq.length > 4) log(`    · … ещё ${uniq.length - 4}`);
  }
  const gone = Object.entries(r.rules).filter(([, e]) => !e.count && e.donorNote).map(([id]) => id);
  if (gone.length) log(`\nу донора есть, здесь нет: ${gone.join(', ')}`);
  const info = (id) => (r.rules[id] || {}).info || {};
  const pe = info('pill-everywhere'); const ac = info('accent-added').accents || [];
  const fontsLine = Object.entries(P.fonts || {}).filter(([, m]) => Object.keys(m).length).map(([k, m]) => `${ROLE_RU[k]}: ${topFam(m)}`).join('; ');
  log(`\nсправка: кнопок ${pe.buttons}, пилюль ${pe.pills} (${Math.round((pe.share || 0) * 100)}%); скругления ${JSON.stringify(info('uniform-radius').hist)}; разрядка ≥0.05em у ${P.spacedAll} элементов; мелкий текст <12px: ${P.fine}; акцент: ${ac.length ? ac.map(accentText).join(', ') : 'нет'}${hoverNote(info('accent-added').hover)}`);
  const im = r.open && r.open.images;
  if (im && im.pending) log(`         картинок не догрузилось к замеру: ${im.pending} из ${im.images} (ленивых ${im.lazy}) — сетки с ними считались по атрибутам width/height`);
  const seq = info('alternating-bands').sequence || [];
  log(`         фоны секций ${seq.length > 12 ? `${seq.length}: ${JSON.stringify(seq.slice(0, 12))} …` : JSON.stringify(seq)}; гарнитуры — ${fontsLine}`);
  if ((info('ai-palette').skipped || []).length) log(`         ai-palette не засчитан: ${info('ai-palette').skipped.join('; ')}`);
  if (r.verdict) {
    log(`\n${r.verdict.padEnd(4)} ${r.viewport}: индекс ${r.index}` + (r.reasons.fail.length ? `\n  FAIL: ${r.reasons.fail.join('\n  FAIL: ')}` : '') + (r.reasons.warn.length ? `\n  WARN: ${r.reasons.warn.join('\n  WARN: ')}` : ''));
  }
}

/* ---------- снимок с обводкой ---------- */
async function shotMarks(page, r, file) {
  /* лёгкие правила рисуются первыми, тяжёлые и запрещённые — поверх, чтобы их подписи не закрывались */
  const marks = Object.entries(r.rules).filter(([, e]) => e.counts).flatMap(([id, e]) => e.items.filter((i) => i.w && i.h).map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h, id, wt: e.weight, ban: !!e.banned })))
    .sort((a, b) => (a.ban - b.ban) || (a.wt - b.wt) || (b.w * b.h - a.w * a.h));
  await page.evaluate((list) => {
    const layer = document.createElement('div'); layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;pointer-events:none;z-index:2147483647';
    const colr = { 3: '#FF2D2D', 2: '#FF9900', 1: '#00B3FF' };
    for (const m of list) { const d = document.createElement('div'); const c = m.ban ? '#FF00D4' : colr[m.wt]; d.style.cssText = `position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;outline:4px solid ${c};outline-offset:-2px`; const l = document.createElement('span'); l.textContent = m.id + (m.ban ? ' ✗' : ''); l.style.cssText = `position:absolute;left:0;top:0;background:${c};color:#000;font:700 14px/1.2 monospace;padding:1px 5px;white-space:nowrap`; d.appendChild(l); layer.appendChild(d); }
    document.body.appendChild(layer);
    document.querySelectorAll('body *').forEach((e) => { if (e !== layer && getComputedStyle(e).position === 'fixed') e.style.setProperty('position', 'absolute', 'important'); });
  }, marks);
  const dpr = (page.viewport() || {}).deviceScaleFactor || 1;
  const h = Math.min(r.page.docH, Math.floor(16000 / dpr));
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: r.page.vw, height: h }, captureBeyondViewport: true });
  return { file, marks: marks.length, height: h, cut: h < r.page.docH };
}

/* ======================================================================
   selftest: сравнение, слияние баз, обоснования и флаги — без браузера; стенды fixtures/cliche — в браузере
   ====================================================================== */
async function selftest(opt = {}) {
  const SELF = fileURLToPath(import.meta.url);
  const FIX = path.join(path.dirname(SELF), 'fixtures', 'cliche');
  const os = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  let n = 0, bad = 0;
  const say = (ok, msg) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cliche-selftest-'));
  /* синтетический результат: все правила с нулём, over — { правило: { count, info, items, itemBlocks } } */
  const fake = (url, over = {}, page = {}) => {
    const P = { vw: 1440, vh: 900, docH: 5000, sections: 5, fonts: { heading: {}, text: {}, button: {}, small: {} }, ...page };
    return { url, viewport: P.vw >= 1024 ? 'desktop' : 'mobile', page: P, open: {}, rules: Object.fromEntries(Object.entries(RULES).map(([id, m]) => {
      const o = over[id] || {}; const count = o.count || 0;
      const items = o.items || Array.from({ length: count }, (_, i) => ({ sel: `div.item${i}`, note: '' }));
      return [id, { weight: m.w, mode: m.mode, title: m.t, count, share: 0, per10kpx: +(count / (P.docH / 10000)).toFixed(2), items, info: o.info || {}, ...(o.itemBlocks ? { itemBlocks: o.itemBlocks } : {}), ...(m.mode === 'share' ? { classShare: o.classShare || 0 } : {}) }];
    })) };
  };
  const decFrom = (obj) => { const f = path.join(tmp, `dec-${n}.json`); fs.writeFileSync(f, JSON.stringify(obj)); return loadDecisions(f); };

  /* 1. порог caps-microlabel — только у проверяемой страницы */
  {
    const r = compareResult(fake('http://s/', { 'caps-microlabel': { count: 2 } }), null);
    const e = r.rules['caps-microlabel'];
    say(e.mark === 'ниже порога' && e.counts === false && r.index === 0, `caps-microlabel: 2 метки у проверяемой страницы — «ниже порога», не в счёт (пометка ${e.mark}, индекс ${r.index})`);
    const donor = fake('https://donor/', { 'caps-microlabel': { count: 2 } }, { vw: 390, vh: 844, docH: 3396 });
    const r2 = compareResult(fake('http://s/', { 'caps-microlabel': { count: 7 } }, { vw: 390, vh: 844, docH: 7108 }), donor);
    say(r2.rules['caps-microlabel'].mark === 'есть у донора', `caps-microlabel: у донора 2 метки на 3396 px, у нас 7 на 7108 px — «есть у донора» (${r2.rules['caps-microlabel'].mark}; ${r2.rules['caps-microlabel'].donorNote})`);
  }
  /* 2. section-template: язык донора — все заголовки разделов одного стиля, даже если разделов меньше 4 */
  {
    const site = () => fake('http://s/', { 'section-template': { count: 4, info: { sections: 4, top: { style: 'IBM Plex Serif|44|none|500|start', count: 4 } } } });
    const same = compareResult(site(), fake('https://donor/', { 'section-template': { info: { sections: 2, top: { style: 'IBM Plex Serif|44|none|500|start', count: 2 } } } }));
    const none = compareResult(site(), fake('https://donor/', { 'section-template': { info: { sections: 0, top: null } } }));
    const old = compareResult(site(), fake('https://donor/', {}));
    say(same.rules['section-template'].mark === 'есть у донора' && none.rules['section-template'].mark === 'не измерено у донора' && none.reasons.warn.some((w) => /не измерено у донора/.test(w)) && old.rules['section-template'].mark === 'НЕТ У ДОНОРА',
      `section-template: донор 2 из 2 одного стиля — «${same.rules['section-template'].mark}»; заголовков у донора 0 — «${none.rules['section-template'].mark}» и WARN; старая база без info — «${old.rules['section-template'].mark}»`);
  }
  /* 3. база с нескольких страниц: приём есть хоть на одной — «есть у донора», с пометкой страницы */
  {
    const home = fake('https://donor/', { eyebrow: { count: 1 } }, { docH: 3132, fonts: { heading: { 'IBM Plex Serif': 100 }, text: {}, button: {}, small: {} } });
    const menu = fake('https://donor/menu', { 'photo-cards': { count: 8 } }, { docH: 6000, fonts: { heading: {}, text: { 'Roboto Slab': 300 }, button: {}, small: {} } });
    const m = mergeResults([home, menu]);
    const r = compareResult(fake('http://s/', { 'photo-cards': { count: 12 }, eyebrow: { count: 1 } }), m);
    say(m.rules['photo-cards'].count === 8 && m.rules['photo-cards'].from === 'https://donor/menu' && m.urls.length === 2 && m.page.fonts.text['Roboto Slab'] === 300 && r.rules['photo-cards'].mark === 'есть у донора' && /\/menu/.test(r.rules['photo-cards'].donorNote) && r.rules.eyebrow.mark === 'есть у донора',
      `mergeResults: фото-сетка с /menu донора — «${r.rules['photo-cards'].mark}» [${r.rules['photo-cards'].donorNote}], надзаголовок с главной — «${r.rules.eyebrow.mark}», гарнитуры сложены`);
    /* доля в классе считается и без срабатывания: 4 коробки r6 из 4 на главной (share 1, приёма нет) не должны
       перебить 120 из 120 на /menu (mamuka.rest, телефон) */
    const mr = mergeResults([fake('https://donor/', { 'uniform-radius': { count: 0, classShare: 1 } }), fake('https://donor/menu', { 'uniform-radius': { count: 120, classShare: 1 } })]);
    say(mr.rules['uniform-radius'].count === 120 && mr.rules['uniform-radius'].from === 'https://donor/menu', `mergeResults, режим share: сработавший приём (/menu, 120) главнее доли без срабатывания (главная, 4 из 4) — count ${mr.rules['uniform-radius'].count}`);
    const heads = compareResult(fake('http://s/', { 'section-template': { count: 4, info: { sections: 4, top: { style: 'A|44|none|500|start', count: 4 } } } }), fake('https://donor/', { 'section-template': { info: { sections: 1, top: { style: 'A|44|none|500|start', count: 1 }, heads: { count: 2, top: { style: 'A|44|none|500|start', count: 2 } } } } }));
    say(heads.rules['section-template'].mark === 'есть у донора' && /крупные заголовки/.test(heads.rules['section-template'].donorNote), `section-template: разделы донора не выделены (1), но крупные заголовки одного стиля 2 из 2 — «${heads.rules['section-template'].mark}»`);
    const docs = [{ json: { kind: 'cliche-baseline', version: 4, url: 'https://donor/', viewports: { desktop: home } }, file: 'a.json' }, { json: { kind: 'cliche-baseline', version: 3, url: 'https://donor/menu', viewports: { desktop: menu } }, file: 'b.json' }];
    const mb = mergeBaselines(docs);
    say(mb.version === 3 && mb.viewports.desktop.rules['photo-cards'].count === 8 && mb.urls.length === 2 && mb.files.length === 2, `mergeBaselines: два файла базы — один документ (версия — наименьшая ${mb.version}, страниц ${mb.urls.length})`);
  }
  /* 4. обоснования: page и block снимают правило только там */
  {
    const dec = decFrom([{ rule: 'eyebrow', page: '/', block: '#hero', why: 'надзаголовок донора над первым заголовком' }]);
    say(dec.sels.length === 1 && dec.map.eyebrow[0].sel === '#hero' && dec.map.eyebrow[0].page[0] === '/', `loadDecisions: [{ rule, page, block }] — селектор ${dec.map.eyebrow[0].sel}, страница ${dec.map.eyebrow[0].page}`);
    const one = compareResult(fake('http://s/', { eyebrow: { count: 2, itemBlocks: [[0], []] } }), fake('https://donor/', {}), { decisions: dec });
    const all = compareResult(fake('http://s/', { eyebrow: { count: 2, itemBlocks: [[0], [0]] } }), fake('https://donor/', {}), { decisions: dec });
    const other = compareResult(fake('http://s/menu', { eyebrow: { count: 1, itemBlocks: [[0]] } }), fake('https://donor/', {}), { decisions: dec });
    say(one.verdict === 'FAIL' && one.reasons.fail.some((x) => /обосновано 1 из 2/.test(x)) && all.verdict !== 'FAIL' && !!all.rules.eyebrow.decision && other.verdict === 'FAIL' && !other.rules.eyebrow.decision,
      `block/page: обосновано 1 из 2 — FAIL (${(one.reasons.fail[0] || '').slice(0, 90)}…); оба в #hero — снято; на /menu обоснование для «/» не действует`);
    const legacy = decFrom({ eyebrow: { 'главная: надзаголовок': 'как у донора: один надзаголовок на страницу' } });
    const lg = compareResult(fake('http://s/menu', { eyebrow: { count: 1 } }), fake('https://donor/', {}), { decisions: legacy });
    say(!legacy.sels.length && !!lg.rules.eyebrow.decision && lg.verdict !== 'FAIL', 'прежний вид { правило: { метка: почему } } — действует на всех страницах, как раньше');
    say(pageMatches(['/menu'], 'http://x/menu/') && !pageMatches(['/menu'], 'http://x/kids/menu') && pageMatches(['/'], 'http://x/index.html') && pageMatches(['index.html'], 'file:///C:/w/site/index.html') && pageMatches(['*'], 'http://x/a'), 'pageMatches: «/menu» = /menu/, ≠ /kids/menu; «/» = /index.html; файл — концом пути; «*» — везде');
    /* второй круг 29.09: старый список [{ rule, block: "hero" }] (reference/authorship.md) — block-подпись, действует
       везде, как раньше; «hero» считался селектором тега и на странице ничего не находил. Тег HTML и составной — селекторы */
    const lab = decFrom([{ rule: 'eyebrow', block: 'hero', why: 'старый список: block — подпись, не селектор' }, { rule: 'eyebrow', block: 'hero cards', why: 'подпись латиницей из двух слов' }, { rule: 'caps-microlabel', block: 'main', why: 'тег HTML — селектор блока' }, { rule: 'photo-cards', block: 'section.cards > div', why: 'составной селектор блока' }]);
    const lr = compareResult(fake('http://s/menu', { eyebrow: { count: 1 } }), fake('https://donor/', {}), { decisions: lab });
    say(JSON.stringify(lab.sels) === '["main","section.cards > div"]' && lab.map.eyebrow.every((x) => x.sel == null) && !!lr.rules.eyebrow.decision && lr.verdict !== 'FAIL',
      `block «hero» и «hero cards» — подписи (обоснование действует на всех страницах, как в старом списке); «main» и «section.cards > div» — селекторы (${JSON.stringify(lab.sels)})`);
    /* правило CSS с block: находки покрываются по элементам своего селектора (itemBlocks из страницы, els — сколько
       элементов); у находки без элемента — «page без block» в причине (случай opara, cc-skeptic/dec-css.mjs) */
    const cssDec = decFrom([{ rule: 'bounce-ease', page: '/', block: '#hero', why: 'пружина первого экрана — как у сайта «до» (JS)' }]);
    const cssFake = (bl, els) => fake('http://s/', { 'bounce-ease': { count: bl.length, items: bl.map((b, i) => ({ sel: `cubic-bezier(.22, 1.18, .36, ${i + 1})`, note: 'правило CSS', css: '.hero__title', blocks: b, els: els[i] })), itemBlocks: bl } });
    const cAll = compareResult(cssFake([[0], [0]], [2, 1]), fake('https://donor/', {}), { decisions: cssDec });
    const cPart = compareResult(cssFake([[0], []], [2, 0]), fake('https://donor/', {}), { decisions: cssDec });
    const cOld = compareResult(fake('http://s/', { 'bounce-ease': { count: 2, itemBlocks: [[], []], items: [{ sel: '.x0', note: 'правило CSS' }, { sel: '.x1', note: 'правило CSS' }] } }), fake('https://donor/', {}), { decisions: cssDec });
    const cw = cPart.reasons.warn.find((x) => /bounce-ease/.test(x)) || '';
    const ow = cOld.reasons.warn.find((x) => /bounce-ease/.test(x)) || '';
    say(!!cAll.rules['bounce-ease'].decision && !cAll.reasons.warn.some((x) => /bounce-ease/.test(x)) && cPart.rules['bounce-ease'].decisionPartial.cssNoEl === 1 && /обосновано 1 из 2/.test(cw) && /page без block/.test(cw) && /обосновано 0 из 2/.test(ow) && /page без block/.test(ow),
      `правило CSS с block: элементы селектора в #hero — обосновано; у одной находки элемента нет — «обосновано 1 из 2» и «page без block»; находки без элементов (замер без block) — тоже подсказка (${cw.replace(/^.*?\(/, '(').slice(0, 150)}…)`);
  }
  /* 5. флаги */
  {
    const node = (args) => spawnSync(process.execPath, [SELF, ...args], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    const t1 = node(['http://localhost:9/', '--tag', 'до/после']);
    const t2 = node(['http://localhost:9/', '--pages', '/,/menu']);
    const t3 = node(['http://localhost:9/', '--baseline', `${path.join(tmp, 'нет.json')},${path.join(tmp, 'нет2.json')}`]);
    say(t1.status === 2 && /--tag/.test(t1.stderr) && t2.status === 2 && /только для baseline/.test(t2.stderr) && t3.status === 2 && /нет файла базы/.test(t3.stderr), `флаги: --tag с «/» — код 2; --pages без baseline — код 2; --baseline a,b без файлов — код 2 (${t3.stderr.trim().slice(0, 60)}…)`);
    const h = node(['--help']);
    say(h.status === 0 && /--tag/.test(h.stdout) && /--pages/.test(h.stdout) && /selftest/.test(h.stdout), '-h называет --tag, --pages и selftest');
  }

  /* 6. стенды в браузере: скрытое, заголовки на div, одна метка капсом, блоки обоснований */
  if (!opt['no-browser']) {
    const url = (f) => pathToFileURL(path.join(FIX, f)).href;
    let browser = null;
    try {
      browser = await launch();
      const [[, dsk]] = pickViewports('desktop'); const [[, mob]] = pickViewports('mobile');
      const hd = await measureViewport(browser, url('hidden.html'), 'desktop', dsk, { blockSels: ['footer', '#nope', '::bad('] });
      const hm = await measureViewport(browser, url('hidden.html'), 'mobile', mob);
      say(hd.rules['hero-two-ctas'].count === 0 && hm.rules['hero-two-ctas'].count === 0, `hidden.html: меню за экраном (fixed + translateY(-100%)), панель visibility:hidden, боковое меню и дубль под aria-hidden — hero-two-ctas 0 (компьютер ${hd.rules['hero-two-ctas'].count}, телефон ${hm.rules['hero-two-ctas'].count}; было 3)`);
      say(hd.rules['giant-footer-word'].count === 1, `hidden.html: видимое украшение под aria-hidden — в счёт (giant-footer-word ${hd.rules['giant-footer-word'].count})`);
      const gw = hd.rules['giant-footer-word'];
      say(JSON.stringify(hd.page.blocks) === '[1,0,-1]' && JSON.stringify(gw.itemBlocks) === '[[0]]', `блоки обоснований в странице: footer 1, #nope 0, неверный −1 (${JSON.stringify(hd.page.blocks)}); находка в подвале — в блоке 0 (${JSON.stringify(gw.itemBlocks)})`);
      const two = await measureViewport(browser, url('hero-two.html'), 'desktop', dsk);
      say(two.rules['hero-two-ctas'].count === 1, `hero-two.html: видимая пара «залитая + контурная» — hero-two-ctas 1 (${two.rules['hero-two-ctas'].count})`);
      /* второй круг 29.09: 19 способов закрыть меню, каждый — пара кнопок на первом экране; в счёте только видимая
         #ctaLive. master: 13 пар, копия первого круга: 6 (шторка clip-path inset, круг, эллипс, многоугольник) */
      for (const [vn, vp] of [['desktop', dsk], ['mobile', mob]]) {
        const cm = await measureViewport(browser, url('closed-menus.html'), vn, vp);
        const sels = cm.rules['hero-two-ctas'].items.map((i) => i.sel);
        say(sels.length === 1 && sels[0] === '#ctaLive', `closed-menus.html (${vn}): закрытые меню — display, visibility, opacity, aria-hidden, inert, hidden, dialog, details, за окном вверх / вбок / вниз / влево, clip-path inset / circle / ellipse / polygon, clip: rect, высота 0, масштаб 0 — не в счёт; hero-two-ctas только у видимой пары (${sels.join(' | ') || 'нет'})`);
      }
      /* находки из CSS — к элементам своего селектора (второй круг 29.09, случай opara): пружина в .hero__title и через
         var(--spring) у .hero .btn — в #hero; @keyframes pop — без элемента; .card:hover — три карточки вне #hero */
      const cd = await measureViewport(browser, url('css-decisions.html'), 'desktop', dsk, { blockSels: ['#hero'] });
      const be = cd.rules['bounce-ease'], hl = cd.rules['hover-lift'];
      const cdDec = decFrom([{ rule: 'bounce-ease', block: '#hero', why: 'пружина входа первого экрана — как у сайта «до»' }, { rule: 'hover-lift', block: '#hero', why: 'подъём кнопки первого экрана — как у донора' }]);
      const cdr = compareResult(cd, fake('https://donor/', {}), { decisions: cdDec });
      const bp = cdr.rules['bounce-ease'].decisionPartial || {}; const hp = cdr.rules['hover-lift'].decisionPartial || {};
      say(be.count === 3 && JSON.stringify(be.itemBlocks) === '[[0],[0],[]]' && JSON.stringify(be.items.map((i) => i.els)) === '[1,1,0]' && bp.covered === 2 && bp.cssNoEl === 1 && /\.hero \.btn \(через --spring\)/.test(be.items[0].note)
        && hl.count === 1 && JSON.stringify(hl.itemBlocks) === '[[]]' && hl.items[0].els === 3 && hp.covered === 0 && !hp.cssNoEl,
        `css-decisions.html: bounce-ease к элементам — var(--spring) → .hero .btn и .hero__title в #hero, @keyframes без элемента (обосновано ${bp.covered} из ${be.count}, без элемента ${bp.cssNoEl || 0}); hover-lift .card:hover — ${hl.items[0] ? hl.items[0].els : '—'} элемента вне #hero (обосновано ${hp.covered} из ${hl.count})`);
      const dm = await measureViewport(browser, url('div-headings.html'), 'mobile', mob);
      const dd = await measureViewport(browser, url('div-headings.html'), 'desktop', dsk);
      const st = dm.rules['section-template'].info || {};
      say(dm.rules.eyebrow.count === 1 && dd.rules.eyebrow.count === 1 && st.sections === 4 && dm.rules['section-template'].count === 4 && dm.page.bodyFs === 20, `div-headings.html: заголовки на div и p по кеглю — надзаголовок и на телефоне (28 px; было 0), разделов с заголовком ${st.sections}, основной текст ${dm.page.bodyFs}px`);
      const cm = compareResult(dm, null).rules['caps-microlabel'];
      say(dm.rules['caps-microlabel'].count === 1 && cm.mark === 'ниже порога', `div-headings.html: одна метка «ПРОШЕДШИЕ» записана (caps-microlabel ${dm.rules['caps-microlabel'].count}; было 0), у проверяемой страницы — «${cm.mark}»`);
      /* окно выбора города уводит на другую страницу (mamuka.rest/menu → главная): адрес открыть заново и мерить его */
      const keep = process.env.SITE_REWORK_DISMISS; process.env.SITE_REWORK_DISMISS = '.city li';
      let ct = null;
      try { ct = await measureViewport(browser, url('city.html'), 'desktop', dsk); } finally { if (keep === undefined) delete process.env.SITE_REWORK_DISMISS; else process.env.SITE_REWORK_DISMISS = keep; }
      const cc = (ct && ct.open && ct.open.consent) || {};
      say(!!cc.movedTo && /hero-two\.html$/.test(cc.movedTo) && ct.rules['photo-cards'].count === 4 && ct.rules['hero-two-ctas'].count === 0,
        `city.html: выбор города увёл на ${cc.movedTo ? path.basename(new URL(cc.movedTo).pathname) : '—'} — адрес открыт заново, мерился он (photo-cards ${ct ? ct.rules['photo-cards'].count : '—'}, у hero-two.html 0; hero-two-ctas ${ct ? ct.rules['hero-two-ctas'].count : '—'})`);
    } catch (e) { say(false, `стенды в браузере: ${String(e && e.message || e).slice(0, 200)}`); }
    finally { if (browser) await browser.close().catch(() => {}); }
    /* командная строка — после закрытия своего браузера (один браузер за раз): --tag, baseline --pages */
    const node = (args) => spawnSync(process.execPath, [SELF, ...args], { encoding: 'utf8', timeout: 300000, windowsHide: true });
    const run = path.join(tmp, 'run');
    const a = node([url('hero-two.html'), '--viewport', 'desktop', '--run', run, '--tag', 'before', '--shot']);
    const b = node([url('hero-two.html'), '--viewport', 'desktop', '--run', run]);
    const has = (f) => fs.existsSync(path.join(run, 'cliche', f));
    say(a.status === 0 && b.status === 0 && has('cliche-before.json') && has('cliche-before-desktop.png') && has('cliche.json') && (readJson(path.join(run, 'cliche', 'cliche-before.json')) || {}).tag === 'before', `--tag before: cliche-before.json и cliche-before-desktop.png, прогон без тега — cliche.json рядом, не затирает (${fs.existsSync(path.join(run, 'cliche')) ? fs.readdirSync(path.join(run, 'cliche')).join(', ') : 'папки нет'})`);
    const bf = path.join(tmp, 'donor.json');
    const c = node(['baseline', url('hidden.html'), '--pages', 'hidden.html,div-headings.html', '--viewport', 'desktop', '--out', bf]);
    const bj = readJson(bf) || {};
    const d = node([url('div-headings.html'), '--viewport', 'desktop', '--baseline', bf, '--run', run, '--json', '-']);
    let dj = null; try { dj = JSON.parse(d.stdout); } catch { /* нет */ }
    const ste = dj && dj.viewports.desktop.rules['section-template'];
    say(c.status === 0 && bj.version === 4 && (bj.pages || []).length === 2 && (bj.perPage || []).length === 2 && bj.viewports.desktop.rules['section-template'].count === 4 && ste && ste.mark === 'есть у донора',
      `baseline --pages: база с 2 страниц (версия ${bj.version}, perPage ${(bj.perPage || []).length}); section-template со второй страницы — «${ste ? ste.mark : '—'}» (${c.status === 0 ? 'код 0' : c.stderr.trim().slice(0, 100)})`);
  } else console.log('--    стенды в браузере пропущены (--no-browser)');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${bad ? 'FAIL' : 'OK'}: проверок ${n}, провалов ${bad}`);
  return bad ? 1 : 0;
}

/* ======================================================================
   Командная строка
   ====================================================================== */
const isMain =(() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const argv = process.argv.slice(2);
  const { pos, opt } = parseArgs(argv, { flags: ['shot', 'strict', 'help', 'h', 'selftest', 'no-browser'], values: ['baseline', 'viewport', 'viewports', 'run', 'out', 'decisions', 'tag', 'pages'], optional: ['taste', 'json'], commands: ['baseline', 'rules', 'selftest'], strict: true });
  /* WARN из lib (свой стиль не вставился) — собирать, а не печатать посреди вывода: в вердикт экрана и json */
  collectWarnings();
  const isUrl = (s) => /^(https?|file):/i.test(String(s));
  /* «--taste http://…» — адрес, а не папка журнала */
  if (typeof opt.taste === 'string' && isUrl(opt.taste)) { pos.push(opt.taste); opt.taste = true; }
  const die = (msg, code = 2) => { console.error(`FAIL  ${msg}`); process.exit(code); };
  const cmd = pos[0];

  if (opt.help || opt.h || pos.includes('-h')) { console.log(HELP); process.exit(0); }
  if (cmd === 'selftest' || opt.selftest) process.exit(await selftest(opt));
  /* --tag: имя прогона в именах файлов (cliche-<tag>.json, cliche-<tag>-<экран>.png) — «до» и «после» не затирают друг друга */
  if (opt.tag !== undefined && (opt.tag === true || !/^[\p{L}\d_.-]{1,60}$/u.test(String(opt.tag)))) die('--tag: имя из букв, цифр, «-», «_», «.» (до 60 знаков), например before или after-r2');
  const tagPart = opt.tag ? `-${opt.tag}` : '';
  if (cmd === 'rules') {
    if (opt.json) { console.log(JSON.stringify({ rules: RULES, modes: MODES }, null, 1)); process.exit(0); }
    console.log('id                    вес  режим   приём');
    for (const [id, m] of Object.entries(RULES)) console.log(`${id.padEnd(22)}${String(m.w).padEnd(5)}${m.mode.padEnd(8)}${m.t}`);
    console.log(`\nрежимы: ${Object.entries(MODES).map(([k, v]) => `${k} — ${v}`).join('; ')}`);
    console.log(`всего ${Object.keys(RULES).length}`);
    process.exit(0);
  }
  if (!pos.length) { console.log(HELP); process.exit(2); }
  /* --viewports — синоним --viewport (как в discover, a11y, perf): раньше молча пропускался, и прогон шёл
     на экранах по умолчанию. Без списка, с неизвестным экраном или оба с разными списками — код 2
     (неверные аргументы), а не 1, как у pickViewports: 1 у cliche — это FAIL шаблонности */
  for (const k of ['viewport', 'viewports']) if (opt[k] === true || (typeof opt[k] === 'string' && (!opt[k].trim() || opt[k].startsWith('--')))) die(`--${k}: нужен список экранов через запятую, например desktop,mobile`);
  if (opt.viewport !== undefined && opt.viewports !== undefined && String(opt.viewport).trim() !== String(opt.viewports).trim()) die(`заданы и --viewport ${opt.viewport}, и --viewports ${opt.viewports} — это один флаг, оставьте один`);
  const vpSpec = opt.viewport ?? opt.viewports;
  if (vpSpec) { const bad = vpSpec.split(',').map((x) => x.trim()).filter((x) => x && !parseViewport(x)); if (bad.length) die(`неизвестные экраны: ${bad.join(', ')} — есть desktop, laptop, tablet, mobile, mobile-s, android или ШxВ@плотность (320x568@2)`); }

  const baselineMode = cmd === 'baseline';
  const url = baselineMode ? pos[1] : pos[0];
  if (!url || !isUrl(url)) die(`нужен адрес страницы (http://, https:// или file://), получено: ${url || 'ничего'}`);

  /* страницы донора для базы: --pages "/,/menu" от адреса (в режиме baseline); страницы своего сайта — отдельными
     запусками с --tag */
  if (opt.pages !== undefined && (opt.pages === true || !String(opt.pages).trim() || String(opt.pages).startsWith('--'))) die('--pages: нужен список путей через запятую, например "/,/menu"');
  if (opt.pages && !baselineMode) die('--pages — только для baseline (база с нескольких страниц донора); страницы своего сайта — отдельными запусками: cliche.mjs <адрес страницы> --tag <имя>');
  const pageUrls = baselineMode ? (opt.pages ? [...new Set(pagesFrom(opt.pages, url))] : [url]) : [url];

  /* база: один файл или несколько (--baseline a.json,b.json или флаг повтором) — приём «есть у донора», если он
     есть хоть на одной странице донора (mergeBaselines) */
  let baseJson = null; let baseFile = null; let baseFiles = [];
  if (!baselineMode && opt.baseline !== undefined) {
    const raw = []; for (let i = 0; i < argv.length; i++) { const a = String(argv[i]); if (a === '--') break; if (a === '--baseline') { if (i + 1 < argv.length) raw.push(String(argv[++i])); else raw.push(''); } else if (a.startsWith('--baseline=')) raw.push(a.slice(11)); }
    for (const b of raw) {
      if (!b.trim() || b.startsWith('--')) die('--baseline без файла');
      baseFiles.push(...(fs.existsSync(b) ? [b] : b.split(',').map((x) => x.trim()).filter(Boolean)));
    }
    baseFiles = [...new Set(baseFiles.map((f) => path.resolve(f)))];
    const docs = [];
    for (const f of baseFiles) {
      if (!fs.existsSync(f)) die(`нет файла базы ${f}`);
      const j = readJson(f);
      if (!j || !(j.viewports || j.rules)) die(`${f}: это не результат cliche.mjs (нет viewports/rules)`);
      docs.push({ json: j, file: f });
    }
    baseFile = baseFiles[0];
    baseJson = mergeBaselines(docs);
  }
  const vpList = vpSpec || (baselineMode ? 'desktop,mobile' : baseJson && baseJson.viewports ? Object.keys(baseJson.viewports).join(',') : 'desktop');
  const vpSeen = new Set();
  const vps = pickViewports(vpList).filter(([n]) => !vpSeen.has(n) && vpSeen.add(n));
  if (!vps.length) die('пустой список экранов');

  /* папка прогона без --run: от файла базы вверх (до 3 уровней) — где лежит state.json или
     authorship-decisions.json; SKILL.md кладёт базу в <папка>/ или <папка>/donor/ */
  const inferRun = () => {
    if (!baseFile) return null;
    let d = path.dirname(baseFile);
    for (let i = 0; i < 3; i++) {
      if (fs.existsSync(path.join(d, 'authorship-decisions.json')) || fs.existsSync(path.join(d, 'state.json'))) return d;
      const up = path.dirname(d); if (up === d) break; d = up;
    }
    return null;
  };
  const run = baselineMode ? null : path.resolve(String(opt.run && opt.run !== true ? opt.run : opt.out && opt.out !== true ? opt.out : inferRun() || runDir({}, url)));
  /* журнал вкуса: общие запреты и запреты с областью site этого прогона (по имени папки прогона) */
  let bans = null; let tdir = null; let away = [];
  const runId = baselineMode ? '' : runKey(run);
  if (!baselineMode && opt.taste) {
    tdir = tasteDir(opt.taste === true ? null : opt.taste);
    if (opt.taste !== true && !fs.existsSync(tdir)) die(`нет папки журнала ${tdir}`);
    const j = readJournal(tdir);
    if (j.bad.length) console.error(`WARN  журнал ${tdir}: битых строк ${j.bad.length} — пропущены`);
    bans = activeBans(j, { run: runId });
    away = bansElsewhere(j, runId);
  }
  const decFile = baselineMode ? null : path.resolve(String(opt.decisions && opt.decisions !== true ? opt.decisions : path.join(run, 'authorship-decisions.json')));
  if (opt.decisions && opt.decisions !== true && !fs.existsSync(decFile)) die(`нет файла обоснований ${decFile}`);
  const decisions = baselineMode ? null : loadDecisions(decFile);
  if (decisions && decisions.bad.length) console.error(`WARN  ${decFile}: ${decisions.bad.join('; ')}`);

  const toStdout = opt.json === '-';
  const log = toStdout ? (...a) => console.error(...a) : (...a) => console.log(...a);
  let browser;
  try { browser = await launch(); } catch (e) { die(`браузер не запустился: ${e.message}`, 3); }
  const results = {};
  let code = 0; let fatal = null;
  const perPage = [];
  try {
    for (const [vpName, vp] of vps) {
      const got = [];
      for (const pu of pageUrls) {
        log(`… ${vpName}: открываю ${pu}`);
        let r;
        try { r = await measureViewport(browser, pu, vpName, vp, { keepPage: !!opt.shot && !baselineMode, blockSels: decisions ? decisions.sels : [] }); }
        catch (e) { fatal = `${vpName}: страница ${pu} не открылась или упала — ${String(e && e.message || e).slice(0, 200)}. Для медленного донора подождать и повторить`; break; }
        /* WARN из lib (свой стиль не вставился: строгий CSP) — в вердикт этого экрана и json, а не посреди вывода */
        const lw = takeWarnings(); if (lw.length) r.warnings = lw;
        got.push(r);
      }
      if (fatal) break;
      if (!baselineMode) {
        const r = got[0]; const page = r._page; delete r._page;
        const base = baseJson ? baselineResult(baseJson, vpName, vp) : null;
        const exact = !base || base.viewport === vpName;
        compareResult(r, base, { bans, decisions, baseExact: exact });
        r.baseline = base ? { file: baseFile, ...(baseFiles.length > 1 ? { files: baseFiles } : {}), url: base.url, ...(base.urls && base.urls.length > 1 ? { urls: base.urls } : {}), viewport: base.viewport, exact, version: baseJson.version || 1 } : null;
        r.taste = bans ? { dir: tdir, run: runId, bans: Object.keys(bans), scopes: Object.fromEntries(Object.entries(bans).map(([k, b]) => [k, b.scope])), elsewhere: away.map((x) => `${x.rule} (${x.run})`) } : null;
        r.decisions = { file: decFile, exists: decisions.exists, rules: Object.keys(decisions.map).length, ...(decisions.sels.length ? { blocks: decisions.sels.map((s, i) => ({ sel: s, found: (r.page.blocks || [])[i] ?? null })) } : {}) };
        if (opt.shot && page) {
          const sf = path.join(run, 'cliche', `cliche${tagPart}-${vpName}.png`); ensureDir(path.dirname(sf));
          try { r.shot = await shotMarks(page, r, sf); } catch (e) { r.shot = { error: String(e.message || e).slice(0, 160) }; }
          await page.close().catch(() => {});
        }
        printResult(r, { log });
        if (r.shot) log(r.shot.file ? `снимок: ${r.shot.file} (обводок ${r.shot.marks}${r.shot.cut ? `, обрезан на ${r.shot.height} px` : ''})` : `WARN снимок не сделан: ${r.shot.error}`);
        results[vpName] = r;
      } else {
        for (const r of got) {
          const hit = Object.entries(r.rules).filter(([, e]) => e.count);
          const pe = r.rules['pill-everywhere'].info; const ai = r.rules['accent-added'].info; const ac = ai.accents || [];
          const st = r.rules['section-template'].info || {};
          log(`${vpName} ${r.page.vw}×${r.page.vh}${pageUrls.length > 1 ? ` ${pathKey(r.url)}` : ''}, страница ${r.page.docH} px: черт донора ${hit.length} — ${hit.map(([id, e]) => `${id}×${e.count}`).join(', ') || 'нет'}`);
          log(`  кнопок ${pe.buttons}, пилюль ${pe.pills}; скругления ${JSON.stringify(r.rules['uniform-radius'].info.hist)}; разрядка у ${r.page.spacedAll}; мелкий текст <12px: ${r.page.fine}; акцент: ${ac.length ? ac.map(accentText).join(', ') : 'нет'}${hoverNote(ai.hover)}`);
          log(`  заголовков ${r.page.headings} (по кеглю, не h1–h3: ${(r.rules['heading-colon'].info || {}).byRole || 0}; основной текст ${r.page.bodyFs}px); разделов с заголовком ${st.sections || 0}${st.top ? `, одного стиля ${st.top.count} (${st.top.style})` : ''}; крупных заголовков ${st.heads ? st.heads.count : 0}${st.heads && st.heads.top ? `, одного стиля ${st.heads.top.count}` : ''}`);
          log(`  гарнитуры — ${Object.entries(r.page.fonts).filter(([, m]) => Object.keys(m).length).map(([k, m]) => `${ROLE_RU[k]}: ${topFam(m)}`).join('; ')}`);
          const im = r.open.images;
          if (im) log(`  картинок ${im.images}, ленивых ${im.lazy}${im.tilda ? ` (Tilda data-original ${im.tilda.dataOriginal}, фонов .t-bgimg загружено ${im.tilda.bgLoaded} из ${im.tilda.bg})` : ''}${im.pending ? `, не догрузились к замеру ${im.pending} — сетки с ними считались по атрибутам width/height` : ', все догружены'}`);
          const cons = r.open.consent;
          if (cons && (cons.found || cons.dismiss)) log(`  окно: ${cons.found ? `${cons.closed ? 'закрыто' : 'НЕ закрылось'}${cons.pick ? ` («${cons.pick}»)` : ''}${cons.movedTo ? ` · увело на ${cons.movedTo} — адрес открыт заново${cons.again ? ` (окно снова: ${cons.again})` : ''}` : ''}` : 'не найдено'}${cons.dismiss ? ` · SITE_REWORK_DISMISS: ${cons.dismiss.join('; ')}` : ''}`);
          if (r.warnings) for (const w of r.warnings) log(`  WARN ${libLabel(w)}`);
          let pp = perPage.find((x) => x.url === r.url); if (!pp) { pp = { url: r.url, viewports: {} }; perPage.push(pp); }
          pp.viewports[vpName] = { docH: r.page.docH, rules: Object.fromEntries(Object.entries(r.rules).filter(([, e]) => e.count).map(([id, e]) => [id, e.count])) };
        }
        const m = mergeResults(got);
        if (got.length > 1) log(`${vpName}: база с ${got.length} страниц — ${Object.entries(m.rules).filter(([, e]) => e.count).map(([id, e]) => `${id}×${e.count}${e.from !== url ? ` (${pathKey(e.from)})` : ''}`).join(', ') || 'нет черт'}`);
        results[vpName] = m;
      }
    }
  } finally { await browser.close().catch(() => {}); }
  if (fatal) die(fatal, 3);

  if (baselineMode) {
    let out = opt.out && opt.out !== true ? path.resolve(String(opt.out)) : path.join(runDir({}, url), 'cliche', `cliche-baseline${tagPart}.json`);
    if (!/\.json$/i.test(out)) out = path.join(out, `cliche-baseline${tagPart}.json`);
    /* версия 3: кнопки с заливкой у вложенного блока, акцент по правилу «заливка → наведение», фото-сетка по большинству;
       версия 4 (29.09): скрытое не в счёт, заголовки по роли (div и p по кеглю), мелкий капс от одной метки, окно выбора
       города закрыто (SITE_REWORK_DISMISS), несколько страниц (--pages) — pages и perPage */
    writeJson(out, { kind: 'cliche-baseline', version: 4, url, ...(pageUrls.length > 1 ? { pages: pageUrls, perPage } : {}), date: new Date().toISOString(), viewports: results });
    log(`\nOK   база донора${pageUrls.length > 1 ? ` (страниц: ${pageUrls.length})` : ''} → ${out}\n     дальше: node cliche.mjs <сайт> --baseline "${out}" --taste`);
  } else {
    const verdicts = Object.values(results).map((r) => r.verdict);
    const total = verdicts.includes('FAIL') ? 'FAIL' : verdicts.includes('WARN') ? 'WARN' : 'OK';
    const doc = { kind: 'cliche', version: 4, url, ...(opt.tag ? { tag: opt.tag } : {}), date: new Date().toISOString(), baseline: baseFile, ...(baseFiles.length > 1 ? { baselines: baseFiles } : {}), verdict: total, viewports: results };
    if (toStdout) process.stdout.write(JSON.stringify(doc, null, 1) + '\n');
    else {
      const jf = opt.json && opt.json !== true ? path.resolve(String(opt.json)) : path.join(run, 'cliche', `cliche${tagPart}.json`);
      writeJson(jf, doc);
      const label = /^file:/i.test(url) ? decodeURIComponent(path.basename(new URL(url).pathname)) : slugFromUrl(url);
      log(`\n${total.padEnd(4)} шаблонность ${label}: ${Object.entries(results).map(([k, r]) => `${k} ${r.verdict} (индекс ${r.index})`).join(', ')}`);
      log(`json: ${jf}`);
      if (total === 'FAIL' && Object.values(results).some((r) => r.reasons.fail.some((x) => /без обоснования/.test(x)))) log(`обоснование: ${decFile} — [{ "rule": "правило", "page": "/путь", "block": "#селектор блока", "why": "какое правило донора или задача блока" }] (без page и block — на всех страницах)`);
    }
    code = total === 'FAIL' ? 1 : 0;
  }
  process.exit(code);
}
