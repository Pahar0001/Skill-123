#!/usr/bin/env node
/**
 * Фактура сайта двух видов. Зерно — мелкий шум слоем поверх страницы: найти слои зерна и
 * шума, снять их параметры, разобрать файл текстуры и измерить силу зерна числом. Крупная
 * фактура — картинка-плитка в фоне (мятая бумага, камень с прожилками, холст, доски):
 * найти её, снять плитку, её вид (мятая или зернистая бумага, камень, ткань или «не определён»), размер показа,
 * наложение по тону секций и силу на снимке. Всё —
 * у донора и у своей сборки одним и тем же способом; напечатать рецепт и переменные для
 * site.tokens.css; сравнить донора со сборкой по каждому экрану.
 *
 *   node texture.mjs <url> [--viewport desktop,tablet,mobile] [--out папка] [--screens 4]
 *                    [--label имя] [--json файл] [--tokens файл] [--css файл] [--md файл] [--extras] [--strict]
 *   node texture.mjs <texture.json> [--viewport desktop,mobile] [--tokens файл] [--css файл] [--md файл]
 *                    [--json файл]      рецепт и файлы по прошлому замеру: страница заново не открывается
 *   node texture.mjs compare <донор: url|texture.json> <сайт: url|texture.json>
 *                    [--viewport desktop,mobile] [--out папка] [--screens 4] [--sd-tol 0.2] [--lag-tol 0.15]
 *                    [--surface-tol 0.3]
 *   node texture.mjs --png снимок.png [--png2 через-250мс.png] [--png3 ещё.png]
 *                    [--without без-слоя.png] [--region x,y,w,h] [--json файл]
 *   node texture.mjs --tile файл.gif|png|webp|svg      разбор файла текстуры по всем кадрам
 *   node texture.mjs selftest [--no-browser]           самопроверка (то же: --selftest)
 *   node texture.mjs --help | --h | -h
 *
 * Режим <texture.json>: вместо адреса — texture.json прошлого замера (файл должен существовать
 * и кончаться на .json; массив результатов, { results: [...] } или один результат). Печатает
 * замеры, рецепт и блок переменных, пишет --tokens/--css/--md; --viewport оставляет только эти
 * экраны (нет таких — ошибка, код 1); texture.json пишется, только если задан --json;
 * --out, --screens, --label и --extras здесь не действуют. Путь на .json, которого нет, —
 * «нет файла <путь>», код 1 (и в compare); не адрес (http, https, file, data, about) и не .json — «Неверный адрес».
 * Аргументы, экраны и texture.json проверяются до создания папок и запуска браузера.
 *
 * Флаги:
 *   --viewport  экраны через запятую (пресеты lib.mjs или ШxВ@плотность); по умолчанию
 *               desktop,tablet,mobile — фактуру снимаем по каждому экрану отдельно (у донора
 *               зерно бывает только на широких). --viewports и --vp (старое имя) — то же самое
 *               во всех режимах: замер, texture.json, compare; разные значения у них — ошибка, код 1.
 *               В compare по умолчанию desktop,mobile.
 *   --strict    код выхода 1 при FAIL. FAIL даёт только compare («фактура не как у донора») — там
 *               код 1 и без флага; одиночный замер, --png и --tile выдают только OK и WARN, с --strict
 *               код 0. Ошибка замера или аргументов — всегда код 1.
 *   --out       папка для снимков, файлов текстур и texture.json
 *               (по умолчанию <папка прогона>/texture, см. runDir в lib.mjs).
 *   --screens   сколько экранов по высоте страницы снимать (4, равномерно, снимки ОКНА).
 *   --label     метка замера: имя в файлах снимков (по умолчанию адрес-экран) и в имени итога —
 *               <out>/texture-<метка>.json вместо <out>/texture.json: два замера в одну --out (сайт и донор,
 *               два потока сразу) не затирают итог друг друга. Без --label имя прежнее, texture.json.
 *   --json      куда записать итог (по умолчанию <out>/texture.json, с --label — <out>/texture-<метка>.json).
 *               Если файл итога уже есть и он от ДРУГОГО адреса — WARN «перезаписан» с подсказкой про --label.
 *   --tokens    записать блок переменных --grain-* в файл (site.tokens.css): блок между
 *               /* texture:start *\/ и /* texture:end *\/ заменяется дословно (знаки «$&», «$'» в адресе
 *               страницы остаются как есть, «*\/» в адресе пишется как «*%2F»), иначе дописывается.
 *               Есть крупная фактура — в том же блоке ещё переменные --surface-* (нет её — блок прежний).
 *   --css       записать шаблон templates/grain.css с подставленными значениями рецепта; есть крупная
 *               фактура — ещё и templates/surface.css (есть только она, без зерна, — только surface.css).
 *   --md        записать раздел «Фактура (параметры для переноса)» для discovery.md (с подразделом
 *               «Крупная фактура» или строкой, что её нет).
 *   --extras    ещё вуали, псевдоэлементы, backdrop-filter, blend, градиенты, фоновые видео.
 *   --sd-tol    допуск σ в compare (0.2 = ±20 %), --lag-tol — допуск lag1 (0.15).
 *   --surface-tol  допуск силы крупной фактуры в compare (0.3 = ±30 %): плитки у донора и у сайта разные
 *               по рисунку, и на тех же числах яркости σ на участке гуляет шире, чем у зерна.
 *   --png/--png2/--png3/--without/--region  метрика по готовым снимкам (1:1, не уменьшенным).
 *   --tile      разбор файла текстуры: кадры, мс на кадр, σ, lag1, альфа, похож ли на шум, крупная ли это
 *               фактура (и почему нет), её вид с уверенностью и основанием, числа рисунка (доля мелких и
 *               крупных деталей, асимметрия, повтор, направленность, ровное поле, хвост остатка), шов при повторе.
 *   --selftest  (или команда selftest) самопроверка: разбор файлов, вид плитки, находки проверки 02.10.2026 (мягкое
 *               зерно, рисунок на ровном поле, полупрозрачная фотография, общий уклон, почти белые плитки, вид на шуме,
 *               шов зернистой плитки), участки, рецепт, сверка, разбор аргументов — без браузера; стенды со своей
 *               плиткой, с зерном (и мягким зерном слоем), без фактуры, с обманками (имя texture у фотографии,
 *               орнамент, сетка), с шумом в самих фотографиях, с зерном шум-плиткой в фоне блока, с полупрозрачной
 *               плиткой, с картинкой-подложкой тегом img, с фактурой в части страницы — в браузере.
 *   --no-browser  selftest без стендов в браузере.
 *
 * Где ищется слой: имя файла фона/src (noise, grain, film, paper, dust… — только подсказка, где искать:
 * картинка с таким именем, которую разбор файла признал фотографией или рисунком, слоем не считается); feTurbulence в
 * data-URI, во встроенном <svg> или в фильтре filter:url(#…); любой большой fixed/absolute
 * элемент с pointer-events:none — div с фоном, img, picture, svg, canvas, video, ::before/::after —
 * если он полупрозрачный (итоговая opacity < 0.6), с режимом наложения или с шумом внутри;
 * повторяющаяся мелкая плитка в фоне body/секции, если её файл по разбору — шум.
 *
 * Метрика «сила зерна» σ: снимок ОКНА (не full: закреплённый слой есть только в верхнем
 * экране полностраничного снимка) → яркость Y (Rec.709) → плитки 32×32 → из плитки вычитается
 * плоскость (а не размытие 7×7 — оно занижает крупное зерно) → стандартное отклонение остатка.
 * Берутся только РОВНЫЕ плитки: если слой найден, ровность решает снимок того же места БЕЗ слоя
 * (там зерна нет, порог абсолютный); если слоя нет — порог относительный (растёт с силой и
 * размером зерна) плюс форма распределения (текст и края отсекаются). Полосы фона: тёмная
 * (Y<60), средняя, светлая (Y>190) — режимы наложения ведут себя на них по-разному.
 *   σ       — сила зерна в уровнях 0..255 (5 видно глазом на чёрном; <1 — зерна нет);
 *   lag1    — связь соседних пикселей остатка: ~0 — зерно в 1 px, 0.5 — 2 px, 0.67 — 3 px;
 *   вклад   — σ разности «со слоем − без слоя» на тех же плитках, подъём — средняя разность;
 *   кипение — разность двух снимков одного места через 250 мс (и ещё через 120), /√2:
 *             ≈ σ — кадры независимы, 0 — зерно стоит. Снимки отвечают только «кипит / нет»;
 *             частота берётся из файла (кадры и задержки GIF/WebP) или из @keyframes.
 * Меньше 10 ровных плиток в полосе — «не измерено», а не «зерна нет».
 * Проход «без слоя»: слой прячется через visibility; если зерно лежит в фоне body или секции
 * с содержимым — из background-image убирается только картинка шума, содержимое остаётся.
 * Строгий CSP (style-src без 'unsafe-inline'): вставленный <style> страница молча не применяет, и
 * «без слоя» снимался бы со слоем (вклад 0, ложное «зерна нет») — поэтому стиль тогда ставится
 * сконструированной таблицей document.adoptedStyleSheets (CSP на неё не распространяется), в выводе
 * строка «слой спрятан таблицей adoptedStyleSheets». Не вышло и так — WARN «проход без слоя не сделан»,
 * σ по снимкам со слоем.
 * Сравнение донора и сборки — только при одинаковом экране и DPR.
 *
 * Правила режимов наложения (замер lab.mjs аудита, проверен независимо):
 *   normal, hard-light, luminosity — одинаковая сила на любом фоне; normal поднимает чёрный на
 *   ≈ opacity×127; multiply, overlay, soft-light гаснут на тёмных фонах (Y до ~50), overlay и
 *   soft-light — ещё и на светлых (годятся только для средних тонов); screen гаснет на светлом.
 *   opacity = нужная σ / σ плитки (своя плитка grain-tile.mjs: σ 78.3 → σ 5 при .064).
 *   feTurbulence не запрещён — его силу надо мерить (альфа фильтра часто около 0.3).
 *
 * Крупная фактура (01.10.2026; образец — zakroma.rest: «фон не просто белый, а с прожилками и мятостями»; пороги
 * перепроверены 02.10.2026 на наборе живых сайтов — см. комментарий у SURFACE и KIND). Свой вид фактуры, наряду с зерном:
 *   где ищется — файл найденного слоя (по имени, вуаль, плитка), а ещё картинка в фоне любого большого блока (шире
 *     60 % окна) и картинка-подложка (img с position absolute или fixed); имя и размер фона любые (auto, 880px,
 *     cover). Кандидаты из фонов в layers не идут (их читают discover, a11y и perf) — отдельный список;
 *   что решает — разбор файла (пороги SURFACE): σ яркости 0.8…12; детали крупнее пикселя — доля разброса мельче
 *     5 px не больше 0.6 и при этом есть рисунок крупнее зерна (пятна крупнее 49 px, эксцесс или асимметрия): так
 *     проходят мятая бумага и доски в JPEG с шумом сжатия, а шум, мягкое зерно (шум, размытый на пару пикселей) и
 *     крупное зерно — нет; ткань узнаётся по повтору рисунка по обеим осям, даже когда соседние пиксели не связаны
 *     (нить в полтора пикселя); сторона от 64 px; детали по всей площади (14 из 16 частей, не собраны в рамку); нет
 *     общего уклона (разброс средних по частям до 0.7 σ, у плитки до 512 px — до 0.8); цвет не гуляет. Полупрозрачная
 *     плитка (альфа от 0.05) разбирается положенной на средний серый и принимается, только если крупных пятен в ней
 *     нет (доля разброса крупнее 49 px до 0.3); её яркость и σ в рецепте — какой она выходит на белом поле. Шум,
 *     мягкое зерно, фотография, градиент, бледный рисунок, рисунок на ровном поле (линии, значки, орнамент: поле между
 *     знаками ровное и одного тона), орнамент с повтором по осям, сетка в два тона (два самых частых уровня не
 *     соседние), полупрозрачная фотография и мелкий узор не проходят — причина пишется. Картинка-подложка тегом img
 *     (не фон блока) с разбросом в крупных пятнах (от 0.6) фактурой на странице не считается — это иллюстрация;
 *   вид — какой из видов своей плитки surface-tile.mjs ближе (tileKind, пороги KIND): canvas — повтор по обеим осям;
 *     pulp — зерно и волокна (доля мельче 5 px от 0.15): зернистая бумага, крафт, картон; paper — заломы на гладком
 *     поле (резкие перепады без линий одного знака): мятая бумага; stone — тонкие линии одного знака на гладком поле
 *     (прожилки). «Не определён» — мягкие пятна без линий и зерна, зерно без волокон поверх крупного рельефа (мятая
 *     бумага в JPEG или пергамент с разводами), дерево (штрихи вдоль одной оси: такого вида у surface-tile.mjs нет),
 *     плитка мельче 48 px — и всё, где признак держится на шуме: яркость упирается в край шкалы (до края меньше 1.5 σ —
 *     асимметрию даёт обрезка), разброс мал (σ меньше 1.8 — «бумага» не доказана), тёмные выбросы занимают меньше 1.7 %
 *     площади (пятнышки, волокна после сжатия — не прожилки), асимметрия у границы (1.0…1.4), зерно со слабыми штрихами
 *     (эксцесс меньше 3) поверх сильного рельефа (пятна крупнее 49 px от 0.2: такой эксцесс дают и заломы). С
 *     видом — уверенность числом и словом и основание числами; при низкой — два кандидата и «выбрать глазами»;
 *   как меряется — проход «без крупной фактуры»: картинка убирается из фона всех блоков, где стоит (и с
 *     карточек), зерно при этом остаётся; вклад «с плиткой − без» считается на ровных участках 128 px
 *     (где их под фактурой мало — 64 px) по полосам фона: σ участка — мелкие детали и перепад между плитками 32 px
 *     вместе. В счёт идут участки, лежащие под фактурой целиком: закрытые содержимым (вклад нулевой) и стоящие
 *     на краю слоя (там σ — ступенька между «с плиткой» и «без») отброшены — иначе фактура в одном блоке из многих
 *     давала «нет», а карточка с бумагой на белой странице — σ втрое выше плитки. «Есть» — σ от 0.6. Зерно на такой
 *     странице меряется по снимку без плитки, иначе прожилки сошли бы за зерно;
 *   что в итоге — вердикт «крупная фактура: есть / нет / не измерено», плитка (размер, яркость ± σ, шов, вид),
 *     по каждому слою: фон блока или слой поверх, тон секции под ним, наложение, размер показа, сила, где
 *     выключен (@media); рецепт: вид и команда surface-tile.mjs с ним, период показа, наложение для светлых и для
 *     тёмных полей (граница — яркость поля 130, см. SURFACE_DARK_Y), цель для своей плитки, переменные --surface-*;
 *     у ткани — шаг переплетения (--thread), у зернистой бумаги — направление волокон (--dir) и период не больше
 *     1024 px; имя файла плитки в рецепте и в --css — surface-<вид>-<период>.webp, его же делает surface-tile.mjs --like;
 *   в texture.json — поле surface у каждого результата (tile.kind — вид, tile.feat — числа рисунка) и
 *     recipe.surface (kind); старые поля не тронуты. Слои крупной фактуры лежат в surface.layers, в layers — только зерно;
 *   compare — строки «крупная фактура» (есть / нет), «вид плитки», «фактура σ» по полосам ±surface-tol, «наложение».
 *     FAIL — у одного есть, у другого нет, или σ мимо допуска; режим наложения и вид плитки сами FAIL не дают (другой
 *     вид — подсказка; вида в замере нет — строка «не снимался» и подсказка перемерить). Мимо допуска только тёмные
 *     поля при светлых в норме — совет не ослаблять общую плитку, а сделать отдельную для тёмных полей
 *     (--surface-tile-dark); тёмное поле — где у сайта плитка лежит через color-burn или яркость ниже 130, а не только
 *     полоса «тёмный» (до 60). Тёмные поля донора и сайта попали в разные полосы (яркость 62 и 47) — строки «—», вердикт
 *     прежний, подсказка «тёмные поля не сверены» с ориентиром в процентах. Нет её ни у кого — строк нет. Замер одной из сторон
 *     сделан версией до 01.10.2026, а у другой фактура найдена — WARN: строки зерна помечены «не в счёт», подсказка
 *     одна — что перемерить и какой командой (раньше выходил FAIL по строкам зерна).
 *   Зерно без слоя: слоёв зерна на странице нет — вердикт «зерна нет» (в замере inPictures: true): σ на «ровных»
 *     участках дают сами картинки (шум матрицы в тёмных фотографиях, сжатие), рецепта слоя шума нет, в сверке сила зерна
 *     такой страницы — ноль. Исключение — бледная шум-плитка в фоне блока (σ 0.8…12, соседние пиксели не связаны):
 *     зерно от неё настоящее, в замере — поле paleNoise.
 *   Ограничения (не различает и не видит): фактуры с σ > 12 (контрастное дерево, бетон, тёмный мрамор) — «контрастная
 *     картинка»: на наборе калибровки таких фактур не встретилось (самая сильная — 11.6), а среди картинок с σ 12…30
 *     там одни фотографии и иллюстрации, поэтому порог не тронут; приглушённая или затемнённая фотография в фоне блока
 *     с σ до 12 и ровным разбросом по площади (общий уклон до 0.7) проходит как фактура — так было и в первой версии, на
 *     стенде проверки таких 100 из 454 — смотреть вырезку 1:1 (тегом img такая картинка не проходит); картинка с общим
 *     уклоном больше 0.7 σ (тёмный мрамор с крупными разводами, затемнённая подложка на весь блок) — «градиент или
 *     фотография»; полупрозрачная плитка с крупными пятнами (мрамор или мятая бумага с альфой) — «полупрозрачная
 *     картинка»; признаки считаются в пикселях файла, поэтому зависят от его масштаба: волокнистая бумага и доски с
 *     деталями в один пиксель (файл одинарной плотности или уменьшенный вдвое: доля мелких деталей 0.62…0.69 при пороге
 *     0.6; своя зернистая бумага, уменьшенная вдвое, — 27 случаев из 27) — «шум», тот же рисунок в файле двойной плотности
 *     проходит; порог не поднят: у зерна loumalnatis.com доля 0.70 — запаса нет; редкая пыль и царапины на чёрном — тоже
 *     «шум»; фон колонки уже 60 % окна кандидатом не считается; дерево узнаётся, но своего вида плитки для него нет;
 *     фактура за окном-воротами (возраст, cookie) меряется под ним — закрыть SITE_REWORK_DISMISS; вид на плитке мельче
 *     448 px — с пониженной уверенностью; у ткани с шагом мельче 32 px сбой фазы на краю меряется, только пока рисунок
 *     чистый (после сжатия с потерями связь столбцов на шаге падает ниже 0.6 — тогда шов только по скачку яркости).
 *
 * Экспорт для других скриптов (discover.mjs, a11y.mjs): findTextureLayers, TEXTURE_LAYERS_FN,
 * hideTextureLayers, showTextureLayers, measureTexture, textureOnUrl, analyzeTile, measurePng,
 * grainTiles, summarize, lumaOf, blendAdvice, recipeFrom, tokensBlock, fillGrainCss,
 * textureMarkdown, compareTexture, compareSets, TILE_SD, setPageStyle, dropPageStyle (свой стиль и при
 * строгом CSP), CSP_NO_STYLE; для крупной фактуры — SURFACE, SURFACE_MIN_SD, SURFACE_MIN_BLOCKS,
 * SURFACE_DARK_Y, SEAM_WARN, SEAM_FAIL, seamOf, seamPhase, surfaceBandOf, surfaceRecipe, fillSurfaceCss,
 * compareSurface, PULP_SIZE_MAX, FINE_WEAVE_SIZE_MAX, SEAM_GRAIN, а для её вида — KIND, FIBRE_COH, tileFeatures, tileKind.
 * Описание — в комментариях у функций.
 *
 * Коды выхода: 0 — готово (одиночный замер — при любых WARN); 1 — compare с FAIL, неверные аргументы
 * (экран, адрес, нет файла, флаг без значения), ошибка замера (FAIL texture.mjs: …) или провал в selftest;
 * 2 — у compare не два аргумента.
 *
 * Чужой файл текстуры (noise.gif, texture.webp донора) сохраняется в --out ТОЛЬКО для замера: на сайт он
 * не переносится никогда, своя плитка — grain-tile.mjs (зерно) и surface-tile.mjs (крупная фактура).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launch, openPage, loadSharp, parseArgs, sleep, ensureDir, writeJson, readJson, runDir, slugFromUrl,
  scrollThrough, forceInstantScroll, scrollToY, screenSegment, segmentPositions, pickViewports, resolveViewport,
  SIG_FN, EFFECTIVE_OPACITY_FN, addStyleSafe, removeStyleSafe, collectWarnings, takeWarnings,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, '..', 'templates', 'grain.css');
const TEMPLATE_SURFACE = path.join(HERE, '..', 'templates', 'surface.css');

let sharpMod;
function needSharp() {
  if (sharpMod === undefined) sharpMod = loadSharp() || null;
  if (!sharpMod) throw new Error('нужен sharp: npm i sharp --prefix ~/.claude/site-rework (или запускать из папки проекта, где он есть)');
  return sharpMod;
}

const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const median = (a) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const quant = (a, p) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

/** σ своей плитки grain-tile.mjs (256 px, 16 уровней, серая, seed 7) — проверено запуском: 78.35. */
export const TILE_SD = 78.35;
/** Меньше стольких ровных плиток в полосе — «не измерено». */
export const MIN_TILES = 10;
/** Порог «зерно есть» по σ, уровней. */
export const GRAIN_MIN_SD = 1;

/* ======================================================================
   1. Поиск слоёв на странице
   ====================================================================== */

/* Функция страницы. Свободные переменные eff и sig подставляются из lib.mjs
   (EFFECTIVE_OPACITY_FN, SIG_FN) — см. TEXTURE_LAYERS_FN ниже. */
function textureLayersInPage(opts) {
  const o = opts || {};
  const minW = o.minW || 0.6, minH = o.minH || 0.4;
  const vw = innerWidth, vh = innerHeight;
  const TEX = /noise|grain|grit|texture|dust|film|paper|scratch|шум|зерн/i;
  const MEDIA = { img: 1, picture: 1, svg: 1, canvas: 1, video: 1 };
  const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const isData = (u) => /^data:/i.test(u);
  const turbIn = (u) => isData(u) && /feTurbulence/i.test(dec(u));
  const nameNoise = (u) => { if (!u || isData(u)) return false; let p = u; try { p = new URL(u, location.href).pathname; } catch (e) { /* как есть */ } return TEX.test(dec(p)); };
  /* верхнеуровневые запятые: «url("a,b"), linear-gradient(red, blue)» → 2 части */
  const splitTop = (str) => {
    const out = []; let depth = 0, q = null, cur = ''; const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { cur += ch; if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const urlOf = (item) => { const m = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*?))\s*\)/.exec(item || ''); return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] || '').replace(/\\(.)/g, '$1') : null; };
  const short = (u) => (isData(u) ? u.slice(0, 48) + '…(' + u.length + ' симв.)' : u.length > 160 ? u.slice(0, 160) + '…' : u);
  const msOf = (t) => { const n = parseFloat(t); return /ms$/.test(t) ? n : n * 1000; };

  /* SVG-фильтры с feTurbulence: id → параметры */
  const turb = new Map();
  for (const t of document.querySelectorAll('feTurbulence')) {
    const f = t.closest('filter'); const fa = f && f.querySelector('feFuncA');
    const key = (f && f.id) || ('#анон' + turb.size);
    turb.set(key, { baseFrequency: t.getAttribute('baseFrequency'), numOctaves: t.getAttribute('numOctaves'), type: t.getAttribute('type') || 'turbulence', filterId: (f && f.id) || null, alphaTable: fa ? (fa.getAttribute('tableValues') || fa.getAttribute('type') || '') : null, usedBy: [] });
  }
  const filterTurb = (css) => { const m = /url\(\s*["']?[^"')#]*#([^"')\s]+)["']?\s*\)/.exec(css || ''); return m ? turb.get(m[1]) || null : null; };

  /* правила внутри @media: для каждого слоя — при каких условиях он задан; off — правило слой выключает
     (display: none, картинка фона убрана…): так видно, где фактура снята, а не только где упомянута */
  const media = []; let unreadable = 0;
  const offOf = (st) => {
    if (!st) return null;
    if (st.display === 'none') return 'display: none';
    if (st.visibility === 'hidden') return 'visibility: hidden';
    if (st.opacity === '0') return 'opacity: 0';
    if (st.backgroundImage === 'none') return 'background-image: none';
    if (st.content === 'none') return 'content: none';
    return null;
  };
  const walk = (rules, conds) => {
    for (const r of rules) {
      if (media.length > 30000) return;
      if (r.type === 4) walk(r.cssRules, conds.concat(r.conditionText || (r.media && r.media.mediaText) || ''));
      else if (r.type === 1) { if (conds.length) media.push({ sel: r.selectorText, cond: conds.join(' and '), off: offOf(r.style) }); }
      else if (r.type !== 7 && r.cssRules) walk(r.cssRules, conds);
    }
  };
  for (const ss of document.styleSheets) { let rs = null; try { rs = ss.cssRules; } catch (e) { unreadable++; continue; } if (rs) walk(rs, []); }
  const mediaHit = (m, el, pseudo) => {
    for (const part of m.sel.split(',')) {
      let p = part.trim(); const pm = /::?(before|after)\s*$/i.exec(p);
      if (pseudo ? !(pm && '::' + pm[1].toLowerCase() === pseudo) : pm) continue;
      p = p.replace(/::?(before|after)\s*$/i, '').trim() || '*';
      let ok = false; try { ok = el.matches(p); } catch (e) { /* селектор не для matches */ }
      if (ok) return true;
    }
    return false;
  };
  const mediaFor = (el, pseudo) => {
    const out = [];
    for (const m of media) {
      if (!m.sel) continue;
      if (mediaHit(m, el, pseudo) && !out.includes(m.cond)) out.push(m.cond);
      if (out.length >= 6) break;
    }
    return out;
  };
  /* где слой выключен: условия @media, при которых правило для него прячет его или убирает картинку фона */
  const mediaOffFor = (el, pseudo) => {
    const out = [];
    for (const m of media) {
      if (!m.sel || !m.off) continue;
      if (mediaHit(m, el, pseudo) && !out.some((x) => x.cond === m.cond)) out.push({ cond: m.cond, how: m.off });
      if (out.length >= 4) break;
    }
    return out;
  };
  /* @keyframes: имя → { css, offsets } */
  const kfCache = {};
  const keyframes = (name) => {
    if (name in kfCache) return kfCache[name];
    let res = null;
    const visit = (rules) => { for (const r of rules) { if (res) return; if (r.type === 7 && r.name === name) { const offs = []; for (const k of r.cssRules) for (const t of String(k.keyText).split(',')) { const x = t.trim(); offs.push(x === 'from' ? 0 : x === 'to' ? 100 : parseFloat(x)); } res = { css: r.cssText.replace(/\s+/g, ' ').slice(0, 900), offsets: [...new Set(offs)].sort((a, b) => a - b) }; } else if (r.type !== 7 && r.cssRules) visit(r.cssRules); } };
    for (const ss of document.styleSheets) { if (res) break; try { visit(ss.cssRules); } catch (e) { /* чужой домен */ } }
    kfCache[name] = res; return res;
  };
  const animsOf = (s, who) => {
    if (!s.animationName || s.animationName === 'none') return [];
    const names = splitTop(s.animationName), durs = splitTop(s.animationDuration), tfs = splitTop(s.animationTimingFunction), its = splitTop(s.animationIterationCount), ps = splitTop(s.animationPlayState || 'running');
    return names.map((n, i) => { const kf = keyframes(n); return { on: who, name: n, durationMs: msOf(durs[i % durs.length] || '0s'), timing: tfs[i % tfs.length] || 'ease', iterations: its[i % its.length] || '1', playState: ps[i % ps.length] || 'running', offsets: kf ? kf.offsets : null, css: kf ? kf.css : null }; }).filter((a) => a.name !== 'none');
  };

  const layers = []; let k = 0; let tileCands = 0;
  const small = new Map(); /* мелкие элементы с шумом (иконки, кнопки, карточки) — не слои, только сводка */
  const asLayer = new Set();
  /* кандидаты в крупную фактуру — отдельным списком, не в layers: discover, a11y и perf читают layers как слои
     зерна и вуали, а фон секции с картинкой (или первый экран с фотографией) таким слоем не является */
  const surfCands = []; const surfSeen = new Set();
  const all = [document.documentElement, ...document.querySelectorAll('body, body *')];
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (el instanceof SVGElement && tag !== 'svg') continue;
    if (tag === 'svg' && el.parentElement && el.parentElement.closest('svg')) continue;
    /* <img> внутри <picture>, который уже слой, — тот же слой */
    if (tag === 'img' && el.parentElement && el.parentElement.tagName === 'PICTURE' && asLayer.has(el.parentElement)) continue;
    const base = getComputedStyle(el);
    if (base.display === 'none') continue;
    for (const pseudo of [null, '::before', '::after']) {
      if (pseudo && MEDIA[tag]) continue;
      const s = pseudo ? getComputedStyle(el, pseudo) : base;
      if (pseudo && (s.content === 'none' || s.content === 'normal' || s.display === 'none')) continue;
      const bg = s.backgroundImage || 'none';
      const items = bg === 'none' ? [] : splitTop(bg);
      const urls = items.map(urlOf).filter(Boolean);
      let src = null;
      if (!pseudo) {
        if (tag === 'img') src = el.currentSrc || el.src || null;
        else if (tag === 'picture') { const i = el.querySelector('img'); src = i ? i.currentSrc || i.src : null; }
        else if (tag === 'video') src = el.currentSrc || el.src || el.poster || null;
      }
      const allUrls = src ? urls.concat(src) : urls;
      const reason = [];
      const noiseUrls = allUrls.filter((u) => nameNoise(u) || turbIn(u));
      if (allUrls.some(nameNoise)) reason.push('имя');
      if (allUrls.some(turbIn)) reason.push('feTurbulence');
      let svg = null;
      if (!pseudo && tag === 'svg') {
        const t = el.querySelector('feTurbulence');
        const ref = [...el.querySelectorAll('[filter]')].map((n) => filterTurb(n.getAttribute('filter'))).find(Boolean) || [...el.querySelectorAll('*')].slice(0, 200).map((n) => filterTurb(getComputedStyle(n).filter)).find(Boolean);
        const inf = ref || (t ? turb.get((t.closest('filter') || {}).id) : null) || (t ? { baseFrequency: t.getAttribute('baseFrequency'), numOctaves: t.getAttribute('numOctaves'), type: t.getAttribute('type'), alphaTable: null, usedBy: [] } : null);
        if (inf) { svg = { baseFrequency: inf.baseFrequency, numOctaves: inf.numOctaves, type: inf.type, alphaTable: inf.alphaTable }; reason.push('feTurbulence'); if (inf.usedBy) inf.usedBy.push(sig(el)); }
      }
      const fT = filterTurb(s.filter);
      if (fT) { svg = svg || { baseFrequency: fT.baseFrequency, numOctaves: fT.numOctaves, type: fT.type, alphaTable: fT.alphaTable }; if (!reason.includes('feTurbulence')) reason.push('feTurbulence'); fT.usedBy.push(sig(el) + (pseudo || '')); }

      const er = el.getBoundingClientRect();
      let r = er;
      if (pseudo) {
        const px = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
        r = s.position === 'fixed' ? { x: px(s.left, 0), y: px(s.top, 0), width: px(s.width, vw), height: px(s.height, vh) }
          : { x: er.x + (s.position === 'absolute' ? px(s.left, 0) : 0), y: er.y + (s.position === 'absolute' ? px(s.top, 0) : 0), width: px(s.width, er.width), height: px(s.height, er.height) };
      }
      const big = r.width >= vw * minW && r.height >= vh * minH;
      /* слой — только заметный по площади: 0×0-svg с определением фильтра, иконка с feTurbulence или
         кнопка с «шумным» фоном идут в сводку small, а не в слои (их не прячут на проходе «без слоя») */
      const sizeOk = r.width * r.height >= 0.1 * vw * vh || (r.width >= vw * minW && r.height >= 100);
      if (reason.length && !sizeOk) {
        const key = sig(el).replace(/#[^.]+/, '') + (pseudo || '') + '|' + reason.join(',');
        const e = small.get(key);
        if (e) e.count++; else if (small.size < 12) small.set(key, { el: sig(el) + (pseudo || ''), reason: reason.slice(), w: Math.round(r.width), h: Math.round(r.height), count: 1 });
        continue;
      }
      const visualish = urls.length > 0 || (!pseudo && !!MEDIA[tag]) || !!svg;
      const veilCand = big && s.pointerEvents === 'none' && visualish;

      /* мелкая повторяющаяся плитка в фоне большого блока без «шумного» имени — решит разбор файла */
      const tileUrls = [];
      if (!reason.length && urls.length && r.width >= vw * minW && r.height >= 100 && tileCands < 8) {
        const reps = splitTop(s.backgroundRepeat), sizes = splitTop(s.backgroundSize);
        items.forEach((it, i) => {
          const u = urlOf(it); if (!u || (isData(u) && !/^data:image\/(png|gif|webp|jpeg|svg)/i.test(u))) return;
          const rep = reps[i % reps.length] || 'repeat'; if (/no-repeat/.test(rep) && !/repeat-[xy]/.test(rep)) return;
          const sz = sizes[i % sizes.length] || 'auto'; if (/cover|contain|%/.test(sz)) return;
          const nums = (sz.match(/[\d.]+px/g) || []).map(parseFloat); if (nums.some((n) => n > 512)) return;
          tileUrls.push(u);
        });
      }
      /* крупная фактура (мятая бумага, камень, холст) лежит картинкой в фоне большого блока или картинкой-
         подложкой; имя у файла любое, размер фона любой (auto, 880px, cover). Фактура это или фотография —
         решит разбор файла (measureTexture): здесь только кандидат. Не больше 6 разных файлов на страницу */
      let surfUrl = null;
      if (!reason.length && r.width >= vw * minW && r.height >= 100 && surfCands.length < 24) {
        if (!pseudo && tag === 'img') { if ((s.position === 'absolute' || s.position === 'fixed') && src && !isData(src)) surfUrl = src; }
        else for (const it of items) { const u = urlOf(it); if (u && (!isData(u) || /^data:image\/(png|gif|webp|jpeg)/i.test(u))) { surfUrl = u; break; } }
        if (surfUrl && !surfSeen.has(surfUrl) && surfSeen.size >= 6) surfUrl = null;
      }
      if (!reason.length && !veilCand && !tileUrls.length && !surfUrl) continue;

      /* дорогое — только у кандидатов: цепочка предков, итоговая прозрачность */
      let fixedBy = pseudo && s.position === 'fixed' ? sig(el) + pseudo : null;
      const blendChain = []; const chainAnims = [];
      for (let p = pseudo ? el : el.parentElement; p && p.nodeType === 1; p = p.parentElement) {
        const ps = p === el ? base : getComputedStyle(p);
        if (ps.mixBlendMode && ps.mixBlendMode !== 'normal') blendChain.push(sig(p) + ':' + ps.mixBlendMode);
        if (!fixedBy && ps.position === 'fixed') fixedBy = sig(p);
        if (chainAnims.length < 4) chainAnims.push(...animsOf(ps, sig(p)).filter((a) => a.iterations === 'infinite'));
      }
      const own = parseFloat(s.opacity);
      const effO = Math.round(eff(el) * (pseudo ? own : 1) * 1000) / 1000;
      const positioned = s.position === 'fixed' || s.position === 'absolute' || !!fixedBy;
      let maybe = false;
      if (veilCand && positioned) {
        if (effO < 0.6 || s.mixBlendMode !== 'normal' || blendChain.length > 0 || !!svg) { reason.push('вуаль'); if (s.mixBlendMode !== 'normal' || blendChain.length) reason.push('режим наложения'); }
        else if (!reason.length && (!pseudo && (tag === 'img' || tag === 'picture' || tag === 'canvas' || tag === 'video') || urls.length)) {
          /* непрозрачный слой поверх страницы: шум может быть в альфе самих пикселей (холст, PNG) —
             решит разбор файла или разность снимков «со слоем − без» (measureTexture) */
          reason.push('поверх страницы'); maybe = true;
        }
      }
      if (!reason.length && tileUrls.length) { reason.push('плитка'); maybe = true; tileCands++; }
      /* ни шум, ни вуаль, ни мелкая плитка — остаётся кандидат в крупную фактуру (или ничего) */
      const cand = !reason.length && !!surfUrl;
      if (!reason.length && !cand) continue;
      if (cand) { reason.push('фон'); maybe = true; surfSeen.add(surfUrl); }
      if (!pseudo && !cand) asLayer.add(el);
      const hideUrls = cand ? [surfUrl] : noiseUrls.length ? noiseUrls.slice() : maybe ? (tileUrls.length ? tileUrls.slice() : urls.slice()) : [];
      /* какой файл разбирать: шумный по имени, иначе плитка, иначе src картинки или первый фон вуали */
      const fileUrl = cand ? surfUrl : noiseUrls[0] || tileUrls[0] || src || urls[0] || null;

      const hasContent = !pseudo && (el === document.body || el === document.documentElement || el.children.length > 0 || (el.textContent || '').trim().length > 0);
      const kind = pseudo ? 'background' : MEDIA[tag] ? tag : urls.length ? 'background' : fT ? 'filter' : 'background';
      let hide = 'visibility';
      if (hasContent && kind === 'background' && hideUrls.length) hide = 'background';
      else if (hasContent && kind === 'filter') hide = 'filter';
      /* у кандидата своя метка: по data-rw-tex discover, a11y и perf узнают слой зерна или вуаль */
      const markAttr = cand ? 'data-rw-surf' : 'data-rw-tex';
      if (o.mark) el.setAttribute(pseudo ? markAttr + '-' + pseudo.slice(2) : markAttr, String(k));
      const anims = animsOf(s, 'сам');
      const kfs = {}; for (const a of anims.concat(chainAnims)) if (a.css) kfs[a.name] = a.css;
      (cand ? surfCands : layers).push({
        k: k++, el: sig(el), pseudo, tag, kind, reason, ...(maybe ? { maybe: true } : {}), ...(cand ? { mark: markAttr } : {}), hide,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        coversViewport: r.width >= vw * 0.95 && r.height >= vh * 0.95,
        position: s.position, fixedBy, zIndex: s.zIndex, pointerEvents: s.pointerEvents,
        opacity: own, effectiveOpacity: effO, mixBlendMode: s.mixBlendMode, blendChain,
        backgroundImage: bg.length > 240 ? bg.slice(0, 240) + '…' : bg, urls: allUrls.map(short), noiseUrls: noiseUrls.map(short),
        hideUrls, fileUrl,
        backgroundSize: s.backgroundSize, backgroundRepeat: s.backgroundRepeat, backgroundPosition: s.backgroundPosition, backgroundColor: s.backgroundColor,
        /* режим наложения картинки на цвет фона того же блока (у слоя поверх страницы его роль играет mixBlendMode) */
        backgroundBlendMode: s.backgroundBlendMode, backgroundAttachment: s.backgroundAttachment,
        imageRendering: s.imageRendering, svg,
        animation: anims.length ? anims.map((a) => `${a.name} ${a.durationMs}ms ${a.timing} ${a.iterations}`).join(', ') : null,
        anims, animsChain: chainAnims, animChain: chainAnims.map((a) => `${a.on}: ${a.name} ${a.durationMs}ms ${a.timing} ${a.iterations}`), keyframes: kfs,
        mediaRules: mediaFor(el, pseudo), mediaOff: mediaOffFor(el, pseudo), filter: s.filter, transform: s.transform,
      });
    }
  }
  const pseudoUsed = (p) => { const s = getComputedStyle(document.body, p); return !(s.content === 'none' || s.content === 'normal'); };
  const res = {
    vw, vh, dpr: devicePixelRatio, bodyBg: getComputedStyle(document.body).backgroundColor, scrollY: Math.round(scrollY),
    marked: !!o.mark, layers, svgNoise: [...turb.values()], small: [...small.values()], bodyAfterUsed: pseudoUsed('::after'), bodyBeforeUsed: pseudoUsed('::before'),
    unreadableSheets: unreadable, surfaceCands: surfCands,
  };

  if (o.extras) {
    /* прочая «фактура» (прототип texture-probe аудита): для раздела discovery.md */
    const gradKind = (b) => b.match(/(repeating-)?(linear|radial|conic)-gradient/g) || [];
    const ex = { overlays: [], pseudo: [], backdrop: [], blend: [], filters: [], masks: [], gradients: [], videos: [], textFx: [], bgImages: [] };
    for (const el of all) {
      if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') continue;
      const s = getComputedStyle(el); if (s.display === 'none') continue;
      const r = el.getBoundingClientRect(); const area = Math.min(r.width, vw) * Math.min(r.height, vh);
      const bgU = splitTop(s.backgroundImage === 'none' ? '' : s.backgroundImage).map(urlOf).filter(Boolean);
      const big = r.width >= vw * 0.8 && r.height >= vh * 0.8;
      if ((s.position === 'fixed' || s.position === 'absolute') && big && (bgU.length || gradKind(s.backgroundImage).length || s.mixBlendMode !== 'normal' || (s.backdropFilter && s.backdropFilter !== 'none') || !/rgba\(0, 0, 0, 0\)/.test(s.backgroundColor))) {
        ex.overlays.push({ el: sig(el), position: s.position, zIndex: s.zIndex, pointerEvents: s.pointerEvents, opacity: eff(el), blend: s.mixBlendMode, bg: bgU.map(short).concat(gradKind(s.backgroundImage)), bgColor: s.backgroundColor });
      }
      for (const pe of ['::before', '::after']) {
        const ps = getComputedStyle(el, pe); if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
        const pU = splitTop(ps.backgroundImage === 'none' ? '' : ps.backgroundImage).map(urlOf).filter(Boolean); const g = gradKind(ps.backgroundImage);
        const hasBg = pU.length || g.length || !/rgba\(0, 0, 0, 0\)|transparent/.test(ps.backgroundColor);
        if (!hasBg && ps.mixBlendMode === 'normal' && (!ps.backdropFilter || ps.backdropFilter === 'none')) continue;
        ex.pseudo.push({ el: sig(el) + pe, position: ps.position, zIndex: ps.zIndex, opacity: parseFloat(ps.opacity), blend: ps.mixBlendMode, bg: pU.map(short).concat(g), size: ps.backgroundSize, pointerEvents: ps.pointerEvents });
      }
      if (r.width === 0 || r.height === 0) continue;
      if (s.backdropFilter && s.backdropFilter !== 'none') ex.backdrop.push({ el: sig(el), filter: s.backdropFilter, bg: s.backgroundColor, radius: s.borderTopLeftRadius, w: Math.round(r.width), h: Math.round(r.height) });
      if (s.mixBlendMode !== 'normal') ex.blend.push({ el: sig(el), mode: s.mixBlendMode, position: s.position });
      if (s.filter !== 'none') ex.filters.push({ el: sig(el), filter: s.filter.slice(0, 80) });
      if ((s.maskImage && s.maskImage !== 'none') || s.clipPath !== 'none') ex.masks.push({ el: sig(el), mask: (s.maskImage || '').slice(0, 60), clip: s.clipPath.slice(0, 60) });
      const g = gradKind(s.backgroundImage); if (g.length && area > 4000) ex.gradients.push({ el: sig(el), kinds: g.join('+'), area: Math.round(area), css: s.backgroundImage.slice(0, 120) });
      if (bgU.length && area > 2000) ex.bgImages.push({ el: sig(el), src: bgU.map(short).join(', '), size: s.backgroundSize, repeat: s.backgroundRepeat, attachment: s.backgroundAttachment, area: Math.round(area) });
      if (el.tagName === 'VIDEO') ex.videos.push({ el: sig(el), autoplay: el.autoplay, muted: el.muted, loop: el.loop, controls: el.controls, w: Math.round(r.width), h: Math.round(r.height), background: el.autoplay && el.muted && !el.controls && r.width > vw * 0.5 });
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (ownText && ((s.textShadow !== 'none') || parseFloat(s.webkitTextStrokeWidth) > 0 || s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text')) ex.textFx.push({ el: sig(el), shadow: s.textShadow.slice(0, 60), stroke: s.webkitTextStrokeWidth, clip: s.backgroundClip });
    }
    const dedupe = (list, key, n) => { const m = new Map(); for (const x of list) { const kk = key(x); const e = m.get(kk); if (e) e.count++; else m.set(kk, { ...x, count: 1 }); } return [...m.values()].slice(0, n); };
    ex.pseudo = dedupe(ex.pseudo, (x) => x.el.replace(/#[^.:]+/, '') + x.bg.join(), 12);
    ex.gradients = dedupe(ex.gradients.sort((a, b) => b.area - a.area), (x) => x.css, 8);
    ex.bgImages = dedupe(ex.bgImages.sort((a, b) => b.area - a.area), (x) => x.size + x.repeat + x.src, 8);
    ex.textFx = dedupe(ex.textFx, (x) => x.shadow + x.stroke + x.clip, 6);
    ex.filters = dedupe(ex.filters, (x) => x.filter, 8);
    ex.blend = dedupe(ex.blend, (x) => x.mode + x.position, 8);
    ex.masks = ex.masks.slice(0, 8); ex.backdrop = ex.backdrop.slice(0, 8); ex.overlays = ex.overlays.slice(0, 10);
    res.extras = ex;
  }
  return res;
}

/**
 * Самодостаточный исходник функции страницы (opts) => Found — для page.evaluate:
 *   await page.evaluate(`(${TEXTURE_LAYERS_FN})(${JSON.stringify({ extras: true })})`)
 */
export const TEXTURE_LAYERS_FN = `((eff, sig) => ${textureLayersInPage.toString()})(${EFFECTIVE_OPACITY_FN}, ${SIG_FN})`;

/**
 * Слои фактуры на открытой странице. { mark = false, extras = false, minW = 0.6, minH = 0.4 }.
 * mark: true — ставит data-rw-tex(-before|-after)="k" (нужно hideTextureLayers); иначе DOM не меняется.
 * Звать после прокрутки страницы: ленивые фоны грузятся при прокрутке.
 * → { vw, vh, dpr, bodyBg, scrollY, marked, layers[], svgNoise[], bodyAfterUsed, bodyBeforeUsed, extras? }
 */
export async function findTextureLayers(page, { mark = false, extras = false, minW = 0.6, minH = 0.4 } = {}) {
  return page.evaluate(`(${TEXTURE_LAYERS_FN})(${JSON.stringify({ mark, extras, minW, minH })})`);
}

/* Функция страницы: все блоки, в фоне которых лежит картинка из списка (адреса полные), кроме уже помеченных
   слоёв, — карточки, плашки, кнопки с той же плиткой. Нужны, чтобы проход «без крупной фактуры» убрал её
   везде: иначе на карточках вклад вышел бы 0 и занизил итог. Ставит data-rw-surf(-before|-after) = k. */
function surfaceUsersInPage(arg) {
  const want = new Set(arg.urls || []); let k = arg.from || 0; const out = [];
  const splitTop = (str) => {
    const o = []; let depth = 0, q = null, cur = ''; const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { cur += ch; if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { o.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) o.push(cur.trim());
    return o;
  };
  const urlOf = (item) => { const m = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*?))\s*\)/.exec(item || ''); return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] || '').replace(/\\(.)/g, '$1') : null; };
  const absOf = (u) => { if (/^data:/i.test(u)) return u; try { return new URL(u, location.href).href; } catch (e) { return u; } };
  for (const el of document.querySelectorAll('html, body, body *')) {
    if (out.length >= 400) break;
    if (el instanceof SVGElement) continue;
    const base = getComputedStyle(el); if (base.display === 'none') continue;
    for (const pseudo of [null, '::before', '::after']) {
      const s = pseudo ? getComputedStyle(el, pseudo) : base;
      if (pseudo && (s.content === 'none' || s.content === 'normal' || s.display === 'none')) continue;
      const bg = s.backgroundImage; if (!bg || bg === 'none' || bg.indexOf('url(') < 0) continue;
      const items = splitTop(bg); const idx = items.findIndex((it) => { const u = urlOf(it); return !!u && want.has(absOf(u)); });
      if (idx < 0) continue;
      const sfx = pseudo ? '-' + pseudo.slice(2) : '';
      if (el.hasAttribute('data-rw-tex' + sfx) || el.hasAttribute('data-rw-surf' + sfx)) continue;
      const r = el.getBoundingClientRect(); if (!pseudo && (r.width < 8 || r.height < 8)) continue;
      el.setAttribute('data-rw-surf' + sfx, String(k));
      const pick = (v) => { const p = splitTop(v); return p[idx % p.length] || p[0] || ''; };
      out.push({
        k: k++, el: sig(el), pseudo, kind: 'background', hide: 'background', mark: 'data-rw-surf', small: true,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        position: s.position, hideUrls: [urlOf(items[idx])], fileUrl: urlOf(items[idx]), bgIndex: idx,
        opacity: parseFloat(s.opacity), effectiveOpacity: Math.round(eff(el) * (pseudo ? parseFloat(s.opacity) : 1) * 1000) / 1000,
        mixBlendMode: s.mixBlendMode, backgroundBlendMode: pick(s.backgroundBlendMode), backgroundColor: s.backgroundColor,
        backgroundSize: pick(s.backgroundSize), backgroundRepeat: pick(s.backgroundRepeat),
      });
    }
  }
  return { users: out, next: k, scrollY: Math.round(scrollY) };
}
const SURFACE_USERS_FN = `((eff, sig) => ${surfaceUsersInPage.toString()})(${EFFECTIVE_OPACITY_FN}, ${SIG_FN})`;

/** Текст ошибки, когда стиль не вставился ни элементом, ни adoptedStyleSheets. */
export const CSP_NO_STYLE = 'CSP страницы запрещает вставку стиля';
/**
 * Свой стиль под ключом (тот же ключ — замена), в том числе при строгом CSP — через lib.addStyleSafe:
 * CSP страницы (заголовок из preparePage и meta) проверяется до вставки, и при запрете <style> не
 * пробуется, а сразу ставится сконструированная таблица (document.adoptedStyleSheets). Раньше <style>
 * пробовался всегда: нарушение CSP попадало в журнал консоли вкладки, perf и runtime считали его
 * ошибкой консоли сайта, а на report-uri сайта уходил отчёт. → 'style' | 'adopted' | null (не вставился
 * никак). WARN здесь не печатается — решает вызывающий (CSP_NO_STYLE). Для perf (--overlay) и hideTextureLayers.
 */
export function setPageStyle(page, key, css) { return addStyleSafe(page, css, { key, warn: false }); }
/** Убрать стиль, вставленный setPageStyle под этим ключом (любым из двух способов). */
export function dropPageStyle(page, key) { return removeStyleSafe(page, key); }

/**
 * Спрятать найденные слои (после findTextureLayers с mark: true): слой — visibility:hidden и opacity:0;
 * зерно в фоне блока с содержимым — только картинка шума в background-image заменяется на none;
 * шум фильтром у блока с содержимым — filter:none. Возвращает число правил.
 * Стиль ставится через setPageStyle (ключ texture-hide): при строгом CSP — adoptedStyleSheets; раньше
 * <style> там молча не применялся, и проход «без слоя» снимал страницу со слоем. info — необязательный
 * объект: в info.via пишется способ ('style' | 'adopted'). Не вставился никак — ошибка CSP_NO_STYLE.
 */
export async function hideTextureLayers(page, layers, info = null) {
  const spec = (layers || []).map((L) => ({ k: L.k, pseudo: L.pseudo, hide: L.hide, mark: L.mark || 'data-rw-tex', urls: (L.hideUrls || []).map((u) => String(u).slice(0, 300)), filterId: L.svg && L.svg.filterId ? L.svg.filterId : null }));
  const rules = await page.evaluate((spec) => {
    const splitTop = (str) => {
      const out = []; let depth = 0, q = null, cur = ''; const s = String(str || '');
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (q) { cur += ch; if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; continue; } if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
        if (ch === '(') depth++; else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    };
    const urlOf = (item) => { const m = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*?))\s*\)/.exec(item || ''); return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] || '').replace(/\\(.)/g, '$1') : null; };
    /* верхнеуровневые части значения filter: «url(#g) contrast(1.1)» → ['url(#g)', 'contrast(1.1)'] */
    const splitSpace = (str) => { const out = []; let depth = 0, cur = ''; for (const ch of String(str || '')) { if (ch === '(') depth++; else if (ch === ')') depth--; if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; } cur += ch; } if (cur) out.push(cur); return out; };
    const rules = [];
    for (const L of spec) {
      /* метка слоя: data-rw-tex у слоёв зерна и вуали, data-rw-surf у найденных как крупная фактура */
      const attr = L.pseudo ? L.mark + '-' + L.pseudo.slice(2) : L.mark;
      const sel = `[${attr}="${L.k}"]${L.pseudo || ''}`;
      const el = document.querySelector(`[${attr}="${L.k}"]`);
      /* opacity:0 обязательно: у SVG с фильтром (feTurbulence) Chrome рисует вывод фильтра и при visibility:hidden */
      if (L.hide === 'visibility') rules.push(`${sel}{visibility:hidden!important;opacity:0!important}`);
      else if (L.hide === 'filter') {
        /* убрать только ссылку на фильтр с шумом, остальные функции filter оставить */
        if (!el) continue;
        const parts = splitSpace(getComputedStyle(el, L.pseudo).filter).filter((p) => !(/^url\(/i.test(p) && (!L.filterId || p.includes('#' + L.filterId))));
        rules.push(`${sel}{filter:${parts.length ? parts.join(' ') : 'none'}!important}`);
      } else {
        if (!el) continue;
        const bg = getComputedStyle(el, L.pseudo).backgroundImage;
        const items = splitTop(bg).map((it) => { const u = urlOf(it); return u != null && L.urls.some((x) => x && u.slice(0, 300) === x) ? 'none' : it; });
        rules.push(`${sel}{background-image:${items.join(', ')}!important}`);
      }
    }
    return rules;
  }, spec);
  const via = await setPageStyle(page, 'texture-hide', rules.join('\n'));
  if (info) info.via = via;
  if (!via && rules.length) throw new Error(`${CSP_NO_STYLE} — слой не спрятать`);
  return rules.length;
}
/** Вернуть спрятанные слои. */
export async function showTextureLayers(page) {
  await dropPageStyle(page, 'texture-hide');
}

/* ======================================================================
   2. Пиксели: яркость, плитки, полосы
   ====================================================================== */

/** Яркость Y (Rec.709) снимка: файл или Buffer → { Y: Float32Array, w, h }. */
export async function lumaOf(input) {
  const sharp = needSharp();
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, ch = info.channels; const Y = new Float32Array(n);
  for (let i = 0; i < n; i++) Y[i] = ch >= 3 ? 0.2126 * data[i * ch] + 0.7152 * data[i * ch + 1] + 0.0722 * data[i * ch + 2] : data[i * ch];
  return { Y, w: info.width, h: info.height };
}

function boxBlur(Y, w, h, r) {
  const W = w + 1, I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += Y[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/* Остаток плитки после вычитания плоскости a + b·x + c·y: σ, lag1 (среднее по
   горизонтали и вертикали), асимметрия и эксцесс, среднее. R — рабочий буфер T×T. */
function planeStats(A, w, tx, ty, T, R) {
  const c = (T - 1) / 2; const n = T * T; const Sxx = n * (T * T - 1) / 12;
  let s = 0, sx = 0, sy = 0;
  for (let y = 0; y < T; y++) { const row = (ty + y) * w + tx; const dy = y - c; for (let x = 0; x < T; x++) { const v = A[row + x]; s += v; sx += (x - c) * v; sy += dy * v; } }
  const mean = s / n, bx = sx / Sxx, by = sy / Sxx;
  let m2 = 0, m3 = 0, m4 = 0;
  for (let y = 0; y < T; y++) { const row = (ty + y) * w + tx; const dy = y - c; for (let x = 0; x < T; x++) { const r = A[row + x] - mean - bx * (x - c) - by * dy; R[y * T + x] = r; const r2v = r * r; m2 += r2v; m3 += r2v * r; m4 += r2v * r2v; } }
  m2 /= n; m3 /= n; m4 /= n;
  let ch = 0, cv = 0;
  for (let y = 0; y < T; y++) for (let x = 0; x < T - 1; x++) ch += R[y * T + x] * R[y * T + x + 1];
  for (let y = 0; y < T - 1; y++) for (let x = 0; x < T; x++) cv += R[y * T + x] * R[(y + 1) * T + x];
  const lag1 = m2 > 0.05 ? ((ch / (T * (T - 1))) + (cv / (T * (T - 1)))) / 2 / m2 : null;
  return { mean, sd: Math.sqrt(m2), lag1, skew: m2 > 0.05 ? m3 / Math.pow(m2, 1.5) : 0, kurt: m2 > 0.05 ? m4 / (m2 * m2) - 3 : 0 };
}
/* σ, среднее и lag1 разности A − B в плитке (без плоскости: содержимое то же). */
function diffStats(A, B, w, tx, ty, T, R) {
  let s = 0; const n = T * T;
  for (let y = 0; y < T; y++) { const row = (ty + y) * w + tx; for (let x = 0; x < T; x++) { const d = A[row + x] - B[row + x]; R[y * T + x] = d; s += d; } }
  const mean = s / n; let m2 = 0, ch = 0;
  for (let i = 0; i < n; i++) { const d = R[i] - mean; m2 += d * d; }
  m2 /= n;
  for (let y = 0; y < T; y++) for (let x = 0; x < T - 1; x++) ch += (R[y * T + x] - mean) * (R[y * T + x + 1] - mean);
  return { mean, sd: Math.sqrt(m2), lag1: m2 > 0.05 ? ch / (T * (T - 1)) / m2 : null };
}

/**
 * Ровные плитки T×T с силой зерна. Y — снимок со слоями; Y2, Y3 — тот же экран позже (кипение);
 * Yw — тот же экран без слоёв: если есть, ровность решает он (абсолютный порог, зерна в нём нет),
 * и у плитки есть вклад слоя (sdD, meanD, lagD). Без Yw — относительный порог ровности.
 * Возвращает массив ровных плиток (свойство .total — сколько плиток рассмотрено).
 * Плитка: { x, y, y_mean, sd, lag1, flicker2?, flicker3?, yw?, sdW?, sdD?, meanD?, lagD? }.
 * Yf — с каким снимком сравнивать Y2 и Y3 для кипения (по умолчанию Y): нужен, когда Y снят без крупной
 * фактуры, а Y2 и Y3 — со всеми слоями (тогда Yf — первый снимок со всеми слоями).
 */
export function grainTiles(Y, w, h, { T = 32, Y2 = null, Y3 = null, Yw = null, Yf = null, region = null, border = 12 } = {}) {
  const same = (A) => (A && A.length === Y.length ? A : null);
  Y2 = same(Y2); Y3 = same(Y3); Yw = same(Yw); Yf = same(Yf) || Y;
  const blur = boxBlur(Yw || Y, w, h, 10);
  const R = new Float32Array(T * T);
  const [rx, ry, rw, rh] = region || [0, 0, w, h];
  const tiles = []; let total = 0;
  for (let ty = Math.max(ry, border); ty + T <= Math.min(h - border, ry + rh); ty += T) {
    for (let tx = Math.max(rx, border); tx + T <= Math.min(w - border, rx + rw); tx += T) {
      total++;
      let mn = 1e9, mx = -1e9;
      for (let y = ty; y < ty + T; y++) for (let x = tx; x < tx + T; x++) { const f = blur[y * w + x]; if (f < mn) mn = f; if (f > mx) mx = f; }
      const range = mx - mn;
      const st = planeStats(Y, w, tx, ty, T, R);
      const t = { x: tx, y: ty, y_mean: st.mean, sd: st.sd, lag1: st.lag1 };
      if (Yw) {
        const sw = planeStats(Yw, w, tx, ty, T, R);
        if (!(range <= 8 && sw.sd <= 3)) continue;
        const d = diffStats(Y, Yw, w, tx, ty, T, R);
        Object.assign(t, { yw: sw.mean, sdW: sw.sd, sdD: d.sd, meanD: d.mean, lagD: d.lag1 });
      } else {
        /* относительный порог: размытие 21×21 от шума с σ и зерном p px гуляет на ~σ·p/21 */
        const p = Math.min(4, Math.max(1, 1 / (1 - Math.max(0, Math.min(0.9, st.lag1 || 0)))));
        const allow = 8 + 5 * Math.min(st.sd, 40) * p / 21;
        if (!(range <= allow && st.sd <= 60)) continue;
        if (st.sd >= 1.5 && !(Math.abs(st.skew) <= 1 && st.kurt <= 2.5)) continue; /* текст и края: хвосты */
      }
      if (Y2) t.flicker2 = diffStats(Y2, Yf, w, tx, ty, T, R).sd / Math.SQRT2;
      if (Y3) t.flicker3 = diffStats(Y3, Yf, w, tx, ty, T, R).sd / Math.SQRT2;
      tiles.push(t);
    }
  }
  tiles.total = total;
  return tiles;
}

/**
 * Полосы фона по плиткам: { dark (Y<60), mid, light (Y>190), all, coverage }.
 * key — какое число сводить ('sd' — что видно; 'sdD' — вклад слоя; 'sdW' — без слоя),
 * yKey — по какой яркости делить на полосы. У полосы: { tiles, sd, sd_p90, lag1, y, flicker, status }:
 * status 'есть' (σ ≥ 1), 'нет', 'не измерено' (ровных плиток меньше 10 — числа только справочно).
 */
export function summarize(tiles, { key = 'sd', yKey = 'y_mean', lagKey = 'lag1' } = {}) {
  const band = (f) => {
    const t = tiles.filter((x) => x[key] != null && f(x[yKey]));
    const sd = median(t.map((x) => x[key]));
    const f2 = median(t.map((x) => x.flicker2)), f3 = median(t.map((x) => x.flicker3));
    const flick = f2 == null && f3 == null ? null : Math.max(f2 || 0, f3 || 0);
    return {
      tiles: t.length, sd: r2(sd), sd_p90: r2(quant(t.map((x) => x[key]), 0.9)), lag1: r2(median(t.map((x) => x[lagKey]))),
      y: r2(median(t.map((x) => x[yKey]))), ...(key === 'sd' && flick != null ? { flicker: r2(flick) } : {}),
      status: t.length < MIN_TILES ? 'не измерено' : sd >= GRAIN_MIN_SD ? 'есть' : 'нет',
    };
  };
  return {
    dark: band((y) => y < 60), mid: band((y) => y >= 60 && y <= 190), light: band((y) => y > 190), all: band(() => true),
    coverage: tiles.length ? r2(tiles.filter((t) => t[key] >= 1.5).length / tiles.length) : null,
    considered: tiles.total ?? null,
  };
}
function liftOf(tiles) {
  const b = (f) => { const t = tiles.filter((x) => x.meanD != null && f(x.yw)); return t.length >= MIN_TILES ? r2(median(t.map((x) => x.meanD))) : null; };
  return { dark: b((y) => y < 60), mid: b((y) => y >= 60 && y <= 190), light: b((y) => y > 190) };
}
function bandsAll(tiles, hasW) {
  return {
    grain: summarize(tiles),
    without: hasW ? summarize(tiles, { key: 'sdW', yKey: 'yw' }) : null,
    contribution: hasW ? summarize(tiles, { key: 'sdD', yKey: 'yw', lagKey: 'lagD' }) : null,
    lift: hasW ? liftOf(tiles) : null,
  };
}

/**
 * Метрика по готовым снимкам (1:1, снимки ОКНА). measurePng(file, { file2, file3, without, region })
 * или по-старому measurePng(file, file2, region). → { size, dark, mid, light, all, coverage,
 * without, contribution, lift, _tiles }.
 */
export async function measurePng(file, opts = {}, region3 = null) {
  if (typeof opts === 'string' || opts == null) opts = { file2: opts || null, region: region3 };
  const a = await lumaOf(file);
  const load = async (f) => { if (!f) return null; const x = await lumaOf(f); return x.w === a.w && x.h === a.h ? x.Y : null; };
  const Y2 = await load(opts.file2), Y3 = await load(opts.file3), Yw = await load(opts.without);
  const tiles = grainTiles(a.Y, a.w, a.h, { Y2, Y3, Yw, region: opts.region || null });
  const b = bandsAll(tiles, !!Yw);
  return { size: [a.w, a.h], ...b.grain, without: b.without, contribution: b.contribution, lift: b.lift, _tiles: tiles };
}

/** Вырез ровной плитки ×6 с растянутым контрастом — чтобы зерно увидел человек. */
async function cropTile(file, t, out, gain = 6) {
  if (!t) return null;
  const sharp = needSharp();
  const { data, info } = await sharp(file).extract({ left: t.x, top: t.y, width: 32, height: 32 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const Y = new Float32Array(32 * 32); let m = 0;
  for (let i = 0; i < Y.length; i++) { Y[i] = 0.2126 * data[i * info.channels] + 0.7152 * data[i * info.channels + 1] + 0.0722 * data[i * info.channels + 2]; m += Y[i]; }
  m /= Y.length;
  const px = Buffer.alloc(32 * 32); for (let i = 0; i < px.length; i++) px[i] = Math.max(0, Math.min(255, Math.round(128 + (Y[i] - m) * gain)));
  await sharp(px, { raw: { width: 32, height: 32, channels: 1 } }).resize(192, 192, { kernel: 'nearest' }).png().toFile(out);
  return out;
}

/* ======================================================================
   3. Файл текстуры
   ====================================================================== */

/**
 * Пороги «крупной фактуры» по файлу — картинка-плитка с деталями крупнее пикселя (мятая бумага, камень
 * с прожилками, холст, дерево), а не шум и не фотография. Первая версия (01.10.2026) подобрана по одному образцу
 * (zakroma.rest, texture.webp 1416×1688: яркость 248.28 ± 2.51, lag1 0.96/0.97) и своим плиткам. 02.10.2026
 * пороги перепроверены на 36 живых сайтах (13 с крупной фактурой — бумага зернистая, волокнистая, мятая, крафт,
 * пергамент, камень с прожилками, тёмная кладка, ткань, белёные доски; 5 с мелким зерном; 5 с ровным фоном и
 * градиентами; 13 обманок — фото, иллюстрации, затемнённая подложка, орнаменты, узоры, видео) и на пяти из них ещё на
 * телефоне. Истина снята глазами по снимкам и вырезкам 1:1. В тот же день пороги прошли независимую проверку: стенд из
 * 454 файлов-обманок (приглушённые, затемнённые и полупрозрачные фотографии, шум, орнаменты, значки, линии), 432 своих
 * плитки и 53 сайта вне набора — и доведены: обманок, которые проходят сейчас и не проходили у версии 01.10.2026, — 0
 * из 454 (у правки до проверки — 56; всего проходит 100, у версии 01.10.2026 — 115), все фактуры набора на месте.
 * wurmonline.com (общий уклон 0.74) после проверки считается обманкой: это затемнённая подложка, а не плитка.
 * Здесь — числа, на которых стоит каждый порог:
 *   sdMin…sdMax — разброс яркости, уровней: меньше — ровная заливка, больше — контрастная картинка;
 *   fineMax — «детали крупнее пикселя» мерой, которую не сбивает шум сжатия: fine — доля разброса мельче 5 px
 *     (var(Y − среднее 5×5) / var(Y)). Выше fineMax — шум. Раньше стояло «lag1 ≥ 0.8 по обеим осям» — и мимо шли
 *     мятая бумага JPEG (tijuanaflats.com: lag1 0.71/0.76, fine 0.44, заломы — low 0.16), доски (teremok.ru:
 *     0.91/0.55, fine 0.53, эксцесс 14), бумага с волокнами (dogfish.com: 0.91/0.76, fine 0.39). Шум остаётся мимо:
 *     плитки зерна lagunitas.com (fine 0.85), massandra.ru (0.93), stumptowncoffee.com (0.95), loumalnatis.com
 *     (0.70), linear.app (1.0);
 *   lowMin, kurtMin, skewMin — рисунок крупнее зерна: пятна крупнее 49 px (low от lowMin) или линии (эксцесс от
 *     kurtMin, асимметрия от skewMin). Нужен при ЛЮБОЙ доле мелких деталей (после проверки 02.10.2026; до неё — только
 *     при fine от 0.3): шум, размытый на 1.6–2 px, и шум, увеличенный в 3–4 раза, дают fine 0.12…0.28 при пятнах
 *     0.006…0.015, эксцессе и асимметрии около нуля — и проходили как фактура, а слой такого зерна объявлялся
 *     «крупной фактурой» (стенды проверяющего g1, g2). У фактур набора и своих плиток хотя бы один признак есть
 *     (слабейшие — пергамент uesp.net: пятна 0.36; свой pulp: пятна 0.1, эксцесс 6);
 *   calmMax, calmLow — рисунок на ровном поле: линии, значки, орнамент на заливке. Эксцесс и асимметрия у них как у
 *     волокон и прожилок, шаг орнамента может быть больше окна автокорреляции (96 px) или идти под углом — правило
 *     орнамента их не ловит. Признак — ровное поле между знаками: calm — доля клеток 8×8 px, где разброс яркости
 *     меньше 0.2 σ остатка, — от calmMax при том, что крупных пятен нет (low ниже calmLow). Обманки проверяющего:
 *     линии-горизонтали calm 0.48 / low 0.07, значки 0.78 / 0.03, орнамент в JPEG с шагом 96 px 0.47 / 0.003,
 *     орнамент под 30° 0.47 / 0.005. Фактуры с ровным полем крупные пятна имеют (zakroma.rest 0.50 / 0.58,
 *     famousdaves.com 0.67 / 0.25, свои камень и бумага 0.3…0.87 / 0.36…0.74), а фактуры без крупных пятен поля не
 *     имеют (dogfish.com 0.06 / 0.04, teremok.ru 0.31 / 0.07, ткань 0 / 0.001). Запас: calmMax 0.32…0.46, calmLow 0.07…0.24.
 *     fieldMax — третье условие: ровные клетки должны быть одного тона (field — разброс их средних в долях σ остатка —
 *     до fieldMax). У рисунков на заливке он 0…0.01 (у карты с точечным узором jackstackbbq.com 0.08), а у зерна,
 *     сглаженного сжатием в блоках 8×8 (своя зернистая бумага после JPEG q40…q60: ровных клеток 0.5…0.9), и у досок
 *     после JPEG q40 — 0.24…0.87: без этого условия они отсекались как «рисунок»;
 *   fineSure, lagMin, farMin — прежнее правило (связь соседних пикселей и на 3–6 px): действует для плиток, у которых
 *     признаки не считались (сторона меньше 48 px); fineSure и lagMin ещё отличают картинку от шума у слоя «по имени»;
 *   alphaMin, alphaOpaque, thinLowMax — полупрозрачная плитка (альфа от alphaMin до alphaOpaque) разбирается положенной
 *     на средний серый (dogfish.com: бумага с альфой 0.6; acehotel.com: ткань с альфой 0.29); почти прозрачная —
 *     рисунок на прозрачном поле. Принимается, только если крупных пятен в ней нет (low до thinLowMax): у плиток
 *     набора 0.073 и 0.001, а у фотографий в png с ровной альфой 0.12 и 0.3 — 0.36…0.85 (26 из 48 таких файлов
 *     проходили как фактура). Цена: полупрозрачный мрамор или мятая бумага (low 0.4…0.7) не распознаются — на наборе
 *     таких нет;
 *   sideMin — меньшая сторона, px; liveMin — сколько из 16 частей картинки (4×4) несут детали (σ части не меньше
 *     0.35 медианы); spreadMax — разброс средних по частям в долях σ: у фактур набора до 0.63, у градиента 0.96, у
 *     фотографий и картин 0.71…0.95. Порог 0.7, как в первой версии: при 0.8 проходили 19 приглушённых и затемнённых
 *     фотографий с разбросом 0.71…0.80, а тёмная картинка wurmonline.com (0.74), ради которой порог поднимался, —
 *     затемнённая подложка на весь блок, а не плитка. spreadSmall, smallSide — у плитки со стороной до smallSide px
 *     пятна крупные относительно её самой (свои плитки камня 256–512 px — до 0.75), порог для неё spreadSmall;
 *     chromaMax — разброс цвета в долях σ яркости (и не меньше 4 уровней);
 *   hotMax — детали собраны в немногих клетках: средний разброс остатка по 64 клеткам (8×8) против медианного.
 *     У фактуры 1…3; у тёмной панели с рамкой (dndbeyond.com, σ 10.5 — раньше проходила как фактура) —
 *     десятки: рисунок по краям, середина пустая;
 *   flat2Max, flatGap — доля двух самых частых уровней яркости: выше flat2Max — рисунок в два тона (сетка oatly.com
 *     0.97, вектор), но только когда эти два уровня не соседние (между ними от flatGap уровней): у слабой своей плитки
 *     на почти белом (252 ± 1) почти все пиксели лежат на двух уровнях подряд (доля 0.92…0.93), и правило без этой
 *     оговорки её отсекало. У почти белой фактуры с обрезкой по 255 доля доходит до 0.85 (famousdaves.com);
 *   ornPeak, ornDepth, ornKurt — орнамент: рисунок повторяется по обеим осям (пик автокорреляции от ornPeak,
 *     глубина провала перед ним от ornDepth), а поле между знаками ровное (эксцесс от ornKurt). Так отсеяна
 *     бледная карта с точечным узором (jackstackbbq.com, σ 4.1 — раньше проходила как фактура). ornSure, ornCalm —
 *     слабый повтор (пик ниже ornSure) считается орнаментом, только если поле между знаками ровное (calm от ornCalm):
 *     у зернистой бумаги tabasco.com в файле одинарной плотности повтор 0.28 и 0.33 при calm 0.07 — она шла «орнаментом»;
 *   imgLowMax — картинка-подложка тегом img (не фон блока) принимается за фактуру на странице, только если доля её
 *     разброса крупнее 49 px не больше этой (dndbeyond.com: приглушённая иллюстрация — 0.76);
 *   weavePeak, weaveDepth — ткань: повтор по обеим осям при плотном рисунке (эксцесс ниже ornKurt); у неё
 *     соседние пиксели могут быть не связаны вовсе (acehotel.com: нить в 1.5 px, lag1 −0.19, шаг 3 px).
 */
export const SURFACE = { sdMin: 0.8, sdMax: 12, fineMax: 0.6, fineSure: 0.3, lowMin: 0.05, kurtMin: 1.5, skewMin: 1, calmMax: 0.4, calmLow: 0.15, fieldMax: 0.1, lagMin: 0.8, farMin: 0.5, alphaMin: 0.05, alphaOpaque: 0.98, thinLowMax: 0.3, imgLowMax: 0.6, sideMin: 64, liveMin: 14, spreadMax: 0.7, spreadSmall: 0.8, smallSide: 512, chromaMax: 2, hotMax: 6, flat2Max: 0.9, flatGap: 3, ornPeak: 0.25, ornDepth: 0.2, ornKurt: 3, ornSure: 0.5, ornCalm: 0.3, weavePeak: 0.3, weaveDepth: 0.3 };
/** Порог «крупная фактура видна на снимке»: σ вклада слоя на ровном участке, уровней. */
export const SURFACE_MIN_SD = 0.6;
/** Пороги шва плитки (seamOf): до SEAM_WARN — бесшовная, выше SEAM_FAIL — стык при повторе виден. */
export const SEAM_WARN = 1.6, SEAM_FAIL = 2.5;
/** Зернистая плитка для меры шва: медианный скачок между соседними пикселями внутри плитки — от этой доли σ (гладкие свои
 *  плитки — 0.02…0.05, ткань — 0.25, но у неё повтор нитей; зернистая бумага после WebP — 0.27…0.31, она же с волокнами
 *  в одну сторону (--dir) вдоль штрихов — 0.20…0.27, шум — 1.1). Порог 0.2: при 0.12 вырез направленной бумаги с видимым
 *  стыком (скачок внутри плитки 0.14…0.20 σ) выходил «бесшовной» — 24 выреза из 24 против 2 у прежней меры (проверка 02.10).
 *  Цена: своя направленная плитка 127 ± 3.3 бывает на самом пороге (0.200), считается гладкой и поднимает качество —
 *  64–66 КБ вместо 48–51 (2 пробы зерна и угла из 7, остальные не задеты). Порог закреплён самопроверкой surface-tile.mjs: вырез направленной бумаги со скачком 0.19 σ — не бесшовная. */
export const SEAM_GRAIN = 0.2;
/**
 * Граница «тёмное поле / светлое поле» для выбора наложения, яркость Y. Светлая плитка (яркость s ≈ 0.97)
 * на поле яркости b: умножение оставляет от её разброса долю b, color-burn — долю (1 − b) / s². Равны они
 * при b ≈ 0.51 (Y ≈ 130): темнее сильнее color-burn, светлее — умножение. На белом color-burn гаснет совсем,
 * на чёрном гаснет умножение.
 */
export const SURFACE_DARK_Y = 130;
/** Меньше стольких ровных участков в полосе фона — «не измерено». */
export const SURFACE_MIN_BLOCKS = 4;
/** Наибольший период своей плитки зернистой бумаги (pulp) в рецепте, px. */
export const PULP_SIZE_MAX = 1024;
/** Наибольший период своей плитки ткани с шагом переплетения мельче 16 px в рецепте, px. */
export const FINE_WEAVE_SIZE_MAX = 512;

/**
 * Шов плитки числом: виден ли стык при повторе. Y — яркость w×h. Для каждой пары соседних столбцов
 * считается средний модуль скачка; пара «последний — первый» (при повторе они соседи) сравнивается с почти
 * самым большим из обычных скачков внутри плитки (98-й процентиль: у ткани каждая шестнадцатая граница —
 * стык нитей, и край плитки может стоять на таком стыке). То же по строкам, и ещё раз по средним K пикселей
 * с каждой стороны — ступенька, спрятанная под мелкой рябью. Около 1 и меньше — край не отличить от
 * середины; замерено: свои плитки до сжатия 0.5…1.0, WebP q86 до 1.3; вырез из плитки (не бесшовный)
 * 5…9, плавный уклон 10…20, ступенька в 1 уровень 1.9…3.5; texture.webp образца — 4.18 (стык у донора есть).
 * У плитки с повтором рисунка (ткань) скачка яркости на краю может не быть, а стык виден: рисунок сбит по фазе —
 * нить у правого края не продолжается у левого. Вырезы из своей ткани с шириной, не кратной шагу, давали шов
 * 0.5…1.5 («бесшовная»). Для такой плитки к мере добавлен сбой фазы (seamPhase): связь столбцов на шаге рисунка
 * внутри плитки против такой же связи через край; число шва — большее из двух. per — повтор рисунка, если он уже
 * посчитан (tileFeatures(...).per), иначе считается здесь по окну 512 px; per = false — сбой фазы не считать.
 * → { x, y, max, detail: { x1, xK, y1, yK: { edge, inner, top, ratio }, phase: { x, y: { lag, inner, edge, seam } | null } } }.
 */
export function seamOf(Y, w, h, K = 6, per = null) {
  /* m — поперёк шва, n — вдоль; at(c, t) — индекс пикселя. J[c] — средний модуль скачка между полосой
     [c−k, c) и полосой [c, c+k); c = 0 — граница плитки (конец против начала) */
  const one = (m, n, at, k) => {
    const J = new Float64Array(m), S = new Float32Array(m);
    for (let t = 0; t < n; t++) {
      let s = 0; for (let q = 0; q < k; q++) s += Y[at(q, t)];
      for (let c = 0; c < m; c++) { S[c] = s; s += Y[at((c + k) % m, t)] - Y[at(c, t)]; }
      for (let c = 0; c < m; c++) J[c] += Math.abs(S[c] - S[(c - k + m) % m]);
    }
    const edge = J[0] / (k * n);
    /* внутри плитки: все границы, обе полосы которых не задевают край */
    const inner = []; for (let c = k; c <= m - k; c++) inner.push(J[c] / (k * n));
    inner.sort((p, q) => p - q);
    const q = (p) => (inner.length ? inner[Math.min(inner.length - 1, Math.floor(inner.length * p))] : 0);
    const ref = q(0.98);
    return { edge: r2(edge), inner: r2(q(0.5)), top: r2(ref), ratio: ref > 1e-6 ? edge / ref : edge > 0.05 ? 99 : 1 };
  };
  if (w < 8 || h < 8) return { x: null, y: null, max: null, detail: null };
  const ax = (c, t) => t * w + c, ay = (c, t) => c * w + t;
  const x1 = one(w, h, ax, 1), xK = one(w, h, ax, Math.max(1, Math.min(K, w >> 2))), y1 = one(h, w, ay, 1), yK = one(h, w, ay, Math.max(1, Math.min(K, h >> 2)));
  const ph = per === false ? { x: null, y: null } : seamPhase(Y, w, h, per);   /* per = false — только скачок яркости, без сбоя фазы */
  /* зернистая плитка (зернистая бумага, шум): соседние пиксели и внутри плитки скачут не меньше чем на SEAM_GRAIN σ, повтора
     нитей нет. Сжатие с потерями сглаживает зерно внутри плитки, а через край не сглаживает — там пиксели не соседи; скачок в
     один пиксель через край остаётся таким, каким был до сжатия (своя зернистая бумага q86: край 2.03 при 0.78 внутри —
     отношение 1.6…2.0), а стыка на листе 2×2 при усиленном контрасте не видно: знак скачка вдоль края случайный. У такой
     плитки шов — только ступенька по средним K пикселей (там же: край 2.0 при 1.73 внутри — 0.98). per = false (подбор
     качества у гладких плиток и ткани) — правило не действует, мера прежняя */
  let grainy = false;
  if (per !== false && !ph.x && !ph.y) { let s = 0, s2 = 0; const n = w * h; for (let i = 0; i < n; i++) { s += Y[i]; s2 += Y[i] * Y[i]; } const sd = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)); grainy = sd > 1e-6 && Math.min(x1.inner, y1.inner) >= SEAM_GRAIN * sd; }
  const x = Math.max(grainy ? 0 : x1.ratio, xK.ratio, ph.x ? ph.x.seam : 0), y = Math.max(grainy ? 0 : y1.ratio, yK.ratio, ph.y ? ph.y.seam : 0);
  return { x: r2(x), y: r2(y), max: r2(Math.max(x, y)), ...(grainy ? { grainy: true } : {}), detail: { x1, xK, y1, yK, phase: ph } };
}
/**
 * Сбой фазы на краю плитки с повтором рисунка. Для оси с повтором (шаг lag, пик автокорреляции не ниже порога ткани):
 * inner — средняя связь столбцов на расстоянии шага внутри плитки, edge — такая же связь через край (столбец
 * w − lag + i против столбца i: при повторе плитки между ними ровно шаг). У бесшовной плитки они почти равны (нити
 * разные, а сжатие с потерями кодирует края независимо — до четверти связи теряется и без сбоя); число шва —
 * 1 + 5 × (доля потерянной связи − 0.2), не меньше 1: потеря половины связи — 2.5, порог SEAM_FAIL. Замерено на
 * своей ткани: бесшовная плитка до сжатия 1.0, WebP q86 — до 1.4; вырез с шириной, кратной шагу (нити стыкуются,
 * но чужие) 1.0…1.5; вырез со сбитой фазой 3.1…5 — выше SEAM_FAIL. Нет повтора по оси — null.
 * У шага мельче 32 px связь внутри плитки меряется на расстоянии целого числа шагов не ближе 32 px (at) и только на
 * чистом рисунке (связь выше 0.6): после сжатия с потерями она ниже, и сбой фазы не меряется (null).
 * → { x, y: { lag, at?, inner, edge, seam } | null }.
 */
export function seamPhase(Y, w, h, per = null) {
  let P = per;
  if (!P) {
    /* повтор — по окну до 512 px из середины: нужен только шаг */
    const ww = Math.min(w, 512), hh = Math.min(h, 512), ox = (w - ww) >> 1, oy = (h - hh) >> 1; if (ww < 32 || hh < 32) return { x: null, y: null };
    const Z = new Float32Array(ww * hh); for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) Z[y * ww + x] = Y[(y + oy) * w + x + ox];
    const lo = boxBlur(Z, ww, hh, 24); for (let i = 0; i < Z.length; i++) Z[i] -= lo[i];
    const D = Math.max(8, Math.min(96, Math.min(ww, hh) >> 2));
    P = { x: axisRepeat(Z, ww, hh, D, false), y: axisRepeat(Z, ww, hh, D, true) };
  }
  /* связь двух линий (столбцов или строк) длины n: at(c, t) — индекс пикселя линии c в точке t. Из каждой линии
     вычитается средний профиль всех линий (prof): у ткани поперечные нити одни и те же во всех столбцах, и без этого
     столбцы связаны при любом сдвиге (вырез со сдвигом в полнити терял всего 0.23 связи); остаётся своё у столбца —
     какая нить идёт сверху, — а оно при сбое фазы не совпадает */
  const corr = (a, b, n, at, prof) => { let sa = 0, sb = 0; for (let t = 0; t < n; t++) { sa += Y[at(a, t)] - prof[t]; sb += Y[at(b, t)] - prof[t]; } sa /= n; sb /= n; let c = 0, va = 0, vb = 0; for (let t = 0; t < n; t++) { const p = Y[at(a, t)] - prof[t] - sa, q = Y[at(b, t)] - prof[t] - sb; c += p * q; va += p * p; vb += q * q; } return va > 1e-9 && vb > 1e-9 ? c / Math.sqrt(va * vb) : 0; };
  const one = (p, m, n, at) => {
    if (!repeatsAt(p, SURFACE.weavePeak, SURFACE.weaveDepth) || m < 4 * p.lag) return null;
    const prof = new Float32Array(n); for (let t = 0; t < n; t++) { let q = 0; for (let c = 0; c < m; c++) q += Y[at(c, t)]; prof[t] = q / m; }
    const L = p.lag;
    const pairs = (D) => { let s = 0, k = 0; const step = Math.max(1, Math.floor((m - D - 2 * L) / 48)); for (let c = L; c + D < m - L; c += step) { s += corr(c, c + D, n, at, prof); k++; } return k ? s / k : 0; };
    /* связь внутри плитки. У мелкого шага (меньше 32 px) столбцы на расстоянии одного шага лежат в одном блоке сжатия и
       делят его огрехи, а столбцы через край — нет: своя ткань с шагом 6 px после WebP q86 давала связь 0.5 внутри и
       0.04 через край — «стык виден» (4.6…6) у бесшовной плитки. Поэтому у мелкого шага внутренняя связь меряется на
       расстоянии целого числа шагов не ближе 32 px (лучшее из ±2 px вокруг: шаг бывает не целым) — как через край,
       между разными блоками. У шага от 32 px — на одном шаге, как раньше */
    let inner = pairs(L), D = L; const far = Math.ceil(32 / L);
    if (far > 1) { inner = -2; for (let d = far * L - 2; d <= far * L + 2; d++) { if (d + 3 * L > m) break; const q = pairs(d); if (q > inner) { inner = q; D = d; } } if (inner === -2) return null; }
    let edge = 0; for (let i = 0; i < L; i++) edge += corr(m - L + i, i, n, at, prof); edge /= L;
    /* мелкий шаг после сжатия с потерями: связь на шаге внутри плитки падает до 0.3…0.45 — у края она ещё ниже и без сбоя
       (крайние столбцы кодек держит хуже). Меряем сбой фазы у мелкого шага, только пока рисунок чистый (связь выше 0.6) */
    if (!(inner > (far > 1 ? 0.6 : 0.2))) return null;
    return { lag: L, ...(D !== L ? { at: D } : {}), inner: r2(inner), edge: r2(edge), seam: r2(1 + 5 * Math.max(0, (inner - edge) / inner - 0.2)) };
  };
  return { x: one(P.x, w, h, (c, t) => t * w + c), y: one(P.y, h, w, (c, t) => c * w + t) };
}

/** Окно разбора рисунка плитки: не больше стольких px по стороне, из середины кадра. */
const FEAT_WIN = 1024;
/* повтор вдоль оси: автокорреляция остатка R (каждая вторая строка или столбец — хватает; нормирована на разброс
   тех же точек), первый провал и первый заметный пик после него. → { lag — шаг, px; peak — автокорреляция на шаге;
   depth — пик минус провал; peak2 — на двойном шаге (null — не поместился) } */
function axisRepeat(R, w, h, D, vert) {
  const none = { lag: 0, peak: 0, depth: 0, peak2: null };
  const ac = new Float64Array(D + 2); let v = 0, kv = 0;
  if (!vert) for (let y = 0; y < h; y += 2) { const row = y * w; for (let x = 0; x < w; x++) { v += R[row + x] * R[row + x]; kv++; } }
  else for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x += 2) { v += R[row + x] * R[row + x]; kv++; } }
  v /= kv || 1; if (!(v > 1e-9)) return none;
  for (let d = 1; d <= D; d++) {
    let c = 0, k = 0;
    if (!vert) for (let y = 0; y < h; y += 2) { const row = y * w; for (let x = 0; x + d < w; x++) { c += R[row + x] * R[row + x + d]; k++; } }
    else for (let y = 0; y + d < h; y++) { const a = y * w, b = (y + d) * w; for (let x = 0; x < w; x += 2) { c += R[a + x] * R[b + x]; k++; } }
    ac[d] = k ? c / k / v : 0;
  }
  let i = 1; while (i + 1 <= D && ac[i + 1] < ac[i]) i++;
  const trough = ac[i]; let best = -2;
  const isMax = (d) => ac[d] >= ac[d - 1] && ac[d] >= ac[d + 1];
  for (let d = i + 1; d < D; d++) if (isMax(d) && ac[d] > best) best = ac[d];
  if (best <= 0) return none;
  /* шаг — первый пик не ниже 0.85 самого высокого: у ткани высокие пики идут на каждом кратном шаге */
  let lag = 0; for (let d = i + 1; d < D; d++) if (isMax(d) && ac[d] >= 0.85 * best) { lag = d; break; }
  if (!lag) return none;
  const p2 = 2 * lag <= D ? Math.max(ac[2 * lag - 1], ac[2 * lag], 2 * lag + 1 <= D ? ac[2 * lag + 1] : -2) : null;
  return { lag, peak: r2(ac[lag]), depth: r2(ac[lag] - trough), peak2: p2 == null ? null : r2(p2) };
}
/**
 * Признаки рисунка плитки — для вердикта «крупная фактура» (surfaceJudge) и её вида (tileKind). Y — яркость w×h
 * (у полупрозрачной плитки — положенная на средний серый); считается окно не больше 1024×1024 из середины.
 *   fine — доля разброса мельче 5 px: var(Y − среднее 5×5) / var(Y). Шум — 0.7…1; зернистая и волокнистая бумага,
 *          доски — 0.2…0.55; гладкие прожилки и заломы (свои плитки, zakroma.rest) — до 0.06;
 *   low  — доля разброса крупнее 49 px: var(среднее 49×49) / var(Y) — мягкие пятна, общий тон;
 *   sdR, skew, kurt — σ, асимметрия и эксцесс остатка R = Y − среднее 49×49 (детали до 49 px). Тонкие линии на
 *          ровном поле (прожилки, волокна, трещины) — сильная асимметрия и большой эксцесс; заломы и грани —
 *          асимметрии почти нет; плотный рисунок без поля (ткань, шум) — эксцесс около нуля и ниже;
 *   live8 — в скольких из 64 клеток (8×8) есть детали (σ остатка не меньше 0.35 медианы); hot8 — средний разброс
 *          остатка по клеткам против медианного: 1…3 — детали всюду, десятки — собраны в немногих клетках;
 *   flat2 — доля двух самых частых уровней яркости: близко к 1 — рисунок в два тона; gap2 — сколько уровней между ними
 *          (у слабой фактуры на почти белом они соседние);
 *   calm, field — ровное поле: доля клеток 8×8 px, где разброс яркости меньше 0.2 σ остатка, и разброс средних этих
 *          клеток в долях σ остатка (у рисунка на заливке ровных клеток много и все они одного тона);
 *   mean, sd, room, clip — яркость и разброс в окне, запас до края шкалы в σ, доля пикселей на самом краю (0–1 и 254–255);
 *   tail — хвост остатка дальше 2.5 σ со стороны асимметрии: share — доля пикселей, cells — доля клеток 32×32 px, где он
 *          есть, lin — вытянутость хвоста в клетке (медиана);
 *   per.x, per.y — повтор вдоль ширины и высоты (axisRepeat): у ткани и орнамента — по обеим осям;
 *   coh, dir — направленность: когерентность тензора градиентов (0 — направления нет, 1 — все штрихи в одну
 *          сторону) и угол штрихов к горизонтали, градусов (0 — вдоль ширины, 90 — вдоль высоты).
 */
export function tileFeatures(Y0, w0, h0) {
  const w = Math.min(w0, FEAT_WIN), h = Math.min(h0, FEAT_WIN), ox = (w0 - w) >> 1, oy = (h0 - h) >> 1, n = w * h;
  let Y = Y0;
  if (w !== w0 || h !== h0) { Y = new Float32Array(n); for (let y = 0; y < h; y++) { const src = (y + oy) * w0 + ox; for (let x = 0; x < w; x++) Y[y * w + x] = Y0[src + x]; } }
  const varOf = (A) => { let s = 0, s2 = 0; for (let i = 0; i < A.length; i++) { s += A[i]; s2 += A[i] * A[i]; } const m = s / A.length; return Math.max(0, s2 / A.length - m * m); };
  const v = varOf(Y);
  const lo2 = boxBlur(Y, w, h, 2), lo24 = boxBlur(Y, w, h, 24);
  const R = new Float32Array(n), F = new Float32Array(n); const hist = new Uint32Array(256);
  let mR = 0;
  for (let i = 0; i < n; i++) { R[i] = Y[i] - lo24[i]; F[i] = Y[i] - lo2[i]; mR += R[i]; const q = Math.round(Y[i]); hist[q < 0 ? 0 : q > 255 ? 255 : q]++; }
  mR /= n; let m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < n; i++) { const d = R[i] - mR, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
  m2 /= n; m3 /= n; m4 /= n;
  /* два самых частых уровня яркости: их доля (flat2) и расстояние между ними (gap2) */
  let t1 = 0, t2 = -1; for (let q = 1; q < 256; q++) { if (hist[q] > hist[t1]) { t2 = t1; t1 = q; } else if (t2 < 0 || hist[q] > hist[t2]) t2 = q; }
  const top = [hist[t1], hist[t2]]; const mY = (() => { let s = 0; for (let q = 0; q < 256; q++) s += q * hist[q]; return s / n; })();
  /* ровное поле между знаками: доля клеток 8×8 px, где разброс яркости меньше 0.2 σ остатка. У листа, камня и доски
     между деталями всегда есть мелкая рябь; у линий, значков и орнамента на заливке поле между ними ровное */
  const sdR0 = Math.sqrt(m2); let cellN = 0, calmN = 0, cs = 0, cs2 = 0; { const C = 8, thr = (0.2 * sdR0) ** 2;
    for (let y = 0; y + C <= h; y += C) for (let x = 0; x + C <= w; x += C) { let a = 0, b = 0; for (let j = 0; j < C; j++) { const row = (y + j) * w + x; for (let i = 0; i < C; i++) { const q = Y[row + i]; a += q; b += q * q; } } const m = a / (C * C); if (b / (C * C) - m * m < thr) { calmN++; cs += m; cs2 += m * m; } cellN++; } }
  /* одного ли тона ровные клетки: у линий и значков на заливке поле между ними — один уровень; у зерна, сглаженного
     сжатием (блоки 8×8 без деталей), и у фактуры с ровными участками тон от клетки к клетке гуляет */
  const field = calmN > 1 && sdR0 > 1e-6 ? Math.sqrt(Math.max(0, cs2 / calmN - (cs / calmN) ** 2)) / sdR0 : null;
  /* хвост остатка со стороны асимметрии (то, что даёт «линии одного знака»): какую долю клеток 32×32 px он задевает и
     вытянут ли он в клетке в линию. Прожилки — немногие клетки, в каждой вытянутая полоска; волокна и крапины — почти
     все клетки; пятнышки и потемневшие края — клеток мало, а вытянутости нет */
  const tail = (() => {
    const sgn = m3 < 0 ? -1 : 1, cut = 2.5 * sdR0, Q = 32, gw = Math.floor(w / Q), gh = Math.floor(h / Q); if (!(sdR0 > 1e-6) || gw < 2 || gh < 2) return null;
    const A = new Float64Array(gw * gh * 6); let all = 0;
    for (let y = 0; y < gh * Q; y++) { const cy = Math.floor(y / Q); for (let x = 0; x < gw * Q; x++) { if (sgn * (R[y * w + x] - mR) <= cut) continue; const o = (cy * gw + Math.floor(x / Q)) * 6, px = x % Q, py = y % Q; A[o]++; A[o + 1] += px; A[o + 2] += py; A[o + 3] += px * px; A[o + 4] += py * py; A[o + 5] += px * py; all++; } }
    const lin = []; let hit = 0;
    for (let k = 0; k < gw * gh; k++) { const o = k * 6, c = A[o]; if (c < 6) continue; hit++; const mx = A[o + 1] / c, my = A[o + 2] / c, vx = A[o + 3] / c - mx * mx, vy = A[o + 4] / c - my * my, vxy = A[o + 5] / c - mx * my; const tr = vx + vy; lin.push(tr > 1e-9 ? Math.sqrt((vx - vy) ** 2 + 4 * vxy * vxy) / tr : 0); }
    lin.sort((p, q) => p - q);
    return { share: r3(all / (gw * gh * Q * Q)), cells: r2(hit / (gw * gh)), lin: lin.length ? r2(lin[lin.length >> 1]) : null };
  })();
  /* детали по площади: разброс остатка в клетках 8×8 */
  const G = 8, cv = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x0 = Math.floor(i * w / G), x1 = Math.floor((i + 1) * w / G), y0 = Math.floor(j * h / G), y1 = Math.floor((j + 1) * h / G);
    let a = 0, b = 0, k = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const q = R[y * w + x]; a += q; b += q * q; k++; }
    const m = a / (k || 1); cv.push(Math.max(0, b / (k || 1) - m * m));
  }
  const med = cv.slice().sort((a, b) => a - b)[G * G / 2], mean8 = cv.reduce((a, b) => a + b, 0) / cv.length;
  /* направленность: тензор градиентов по слегка сглаженной картинке (шум пикселя направления не имеет) */
  let jxx = 0, jyy = 0, jxy = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const gx = lo2[i + 1] - lo2[i - 1], gy = lo2[i + w] - lo2[i - w]; jxx += gx * gx; jyy += gy * gy; jxy += gx * gy; }
  const coh = jxx + jyy > 1e-9 ? Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / (jxx + jyy) : 0;
  let dir = Math.round(0.5 * Math.atan2(2 * jxy, jxx - jyy) * 180 / Math.PI) + 90; if (dir >= 180) dir -= 180;   /* штрихи идут поперёк градиента */
  const D = Math.max(8, Math.min(96, Math.min(w, h) >> 2));
  return {
    fine: v > 1e-9 ? r3(varOf(F) / v) : 0, low: v > 1e-9 ? r3(varOf(lo24) / v) : 0, sdR: r2(Math.sqrt(m2)),
    skew: m2 > 1e-9 ? r2(m3 / Math.pow(m2, 1.5)) : 0, kurt: m2 > 1e-9 ? r2(m4 / (m2 * m2) - 3) : 0,
    live8: med > 4e-4 ? cv.filter((q) => Math.sqrt(q) >= 0.35 * Math.sqrt(med)).length : 0, hot8: med > 4e-4 ? r2(mean8 / med) : null,
    flat2: r2((top[0] + top[1]) / n), gap2: Math.abs(t1 - t2), calm: cellN ? r2(calmN / cellN) : 0, field: field == null ? null : r2(field),
    mean: r2(mY), sd: r2(Math.sqrt(v)), clip: r2((hist[0] + hist[1] + hist[254] + hist[255]) / n), room: v > 1e-9 ? r2(Math.min(mY, 255 - mY) / Math.sqrt(v)) : null, tail,
    per: { x: axisRepeat(R, w, h, D, false), y: axisRepeat(R, w, h, D, true) }, coh: r2(coh), dir, win: [w, h],
  };
}
const repeatsAt = (p, peak, depth) => !!p && p.lag >= 2 && p.peak >= peak && p.depth >= depth;
/* повтор рисунка по обеим осям: ткань (плотный рисунок) или орнамент (знаки на ровном поле) */
const isWeave = (F) => !!F && repeatsAt(F.per.x, SURFACE.weavePeak, SURFACE.weaveDepth) && repeatsAt(F.per.y, SURFACE.weavePeak, SURFACE.weaveDepth) && F.kurt < SURFACE.ornKurt;
/* слабый повтор (пик ниже ornSure) — орнамент только при ровном поле между знаками: у зернистой бумаги tabasco.com в файле
   одинарной плотности повтор 0.28 и 0.33 (следы формования листа), а ровных клеток 0.07 — это не орнамент */
const isOrnament = (F) => !!F && repeatsAt(F.per.x, SURFACE.ornPeak, SURFACE.ornDepth) && repeatsAt(F.per.y, SURFACE.ornPeak, SURFACE.ornDepth) && F.kurt >= SURFACE.ornKurt && (Math.min(F.per.x.peak, F.per.y.peak) >= SURFACE.ornSure || F.calm == null || F.calm >= SURFACE.ornCalm);

/**
 * Пороги вида плитки (tileKind). Подобраны 02.10.2026 по своим плиткам surface-tile.mjs (три вида × 8 зёрен, размеров
 * и целей) и файлам живых сайтов набора калибровки:
 *   woodCoh, woodFine — дерево и доски: штрихи вытянуты в одну сторону (rudysbbq.com 0.67, teremok.ru 0.66) и
 *     мелкие (fine 0.32 и 0.53); у бумаги с волокнами направленность ниже (dogfish.com 0.39…0.48), у своих плиток
 *     256 px она случайно доходит до 0.71, но fine у них до 0.06 — поэтому оба условия вместе. woodCohBig — те же
 *     доски в файле двойной плотности (rudysbbq.com на телефоне, 3840 px): штрихи вдвое крупнее, fine 0.065, и они
 *     шли «камнем»; на окне от sideSure направленность от 0.6 — дерево и без мелких штрихов (свои плитки от 448 px —
 *     до 0.47, фактуры набора без направления — до 0.48);
 *   grainFine — зернистая и волокнистая бумага, крафт, пергамент (вид pulp): fine от 0.15 (tabasco.com 0.31,
 *     dogfish.com 0.21 и 0.39, 4rsmokehouse.com 0.21, uesp.net 0.24, своя плитка pulp 0.38); свои гладкие плитки
 *     (paper, stone) — до 0.12;
 *   fibreKurt, reliefLow — зерно бывает и шумом сжатия поверх крупного рельефа: мятая бумага в JPEG (tijuanaflats.com:
 *     fine 0.44, эксцесс 0.95, пятна крупнее 49 px 0.16) или пергамент с разводами (uesp.net: эксцесс 0.74, пятна
 *     0.36). Волокон в таком зерне нет (эксцесс ниже fibreKurt; у бумаги с волокнами он 6…47), а рельеф есть (low
 *     от reliefLow) — тогда вид «не определён»: кандидаты paper и pulp, решают глаза;
 *   veinSkew — прожилки на гладком поле: |асимметрия| остатка от 1.2 (свой камень −1.7…−2.8, zakroma.rest −3.1,
 *     своя бумага −0.1…−0.6);
 *   creaseKurt — заломы и грани без прожилок: эксцесс от 1.5 при малой асимметрии (своя бумага 2.4…7.1);
 *   blobLow — резкие перепады без линий одного знака дают и заломы бумаги, и разводы мрамора; когда почти весь
 *     разброс — пятна крупнее 49 px (low от 0.65: тёмный мрамор wurmonline.com 0.745, своя бумага до 0.62), это уже
 *     не довод за бумагу — уверенность падает на 5 × (low − blobLow), и вид выходит «не определён»;
 *   sideSure — сторона окна, с которой бумага и камень различаются надёжно: на плитке 256 px прожилок и заломов
 *     единицы, и асимметрия гуляет через порог (своя бумага 256 px −1.5, свой камень −0.86) — уверенность для этих
 *     двух видов умножается на сторона / sideSure (не меньше sideFloor); повтор нитей у ткани от размера не зависит;
 *   sure, fair — уверенность словом: от sure — «высокая», от fair — «средняя», ниже — «низкая» (вид не называется,
 *     в рецепте — «выбрать глазами» и два кандидата).
 * Независимая проверка 02.10.2026 нашла неверный вид с уверенностью выше низкой там, где признак держится на шуме;
 * для этих случаев — свои пороги, и вид при них не называется:
 *   clipRoom — яркость упирается в край шкалы: от средней до 0 или 255 меньше clipRoom σ. Обрезка срезает одну сторону
 *     распределения и сама даёт асимметрию (своя бумага 254 ± 2 выходила «камнем» с уверенностью 1);
 *   veinShare — прожилки занимают площадь: доля пикселей остатка дальше 2.5 σ со стороны асимметрии. Свой камень
 *     1.7…3.1 %, zakroma.rest 2.4 %; редкие пятнышки винтажной бумаги (mcsorleysoldalehouse.nyc — «камень» 0.79)
 *     1.1…1.4 %, волокна после сжатия q60 (dogfish.com — «камень» 1, monkey47.com — 0.82) 1.3…1.5 %;
 *   skewGap — мёртвая зона у порога асимметрии: при veinSkew ± skewGap ни прожилки, ни их отсутствие не доказаны (свой
 *     камень после JPEG q60: −1.18 — выходил «бумагой» 0.51);
 *   faintSd — «бумага» выводится из отсутствия линий одного знака, а при σ меньше faintSd тонкие линии тонут в
 *     квантовании и сжатии (свой камень 250 ± 0.9 и 251 ± 1.5 выходил «бумагой» 0.74 и 0.67);
 *   clipHalf — больше половины пикселей на краю шкалы: у зернистой бумаги уверенность не выше средней (famousdaves.com:
 *     крапины на чистом белом — выходила 1);
 *   fibreKurtBig, reliefBig — при сильном рельефе (пятна крупнее 49 px от reliefBig) волокна доказывает только эксцесс от
 *     fibreKurtBig: слабый дают и заломы мятого листа (чёрная мятая бумага tijuanaflats.com: эксцесс 2.65, пятна 0.24 —
 *     выходила «зернистой» 0.84). У зернистой бумаги набора при пятнах от 0.2 эксцесс 39…155 (monkey47.com,
 *     4rsmokehouse.com, famousdaves.com), у остальных и у своей пятна до 0.13 — правило их не задевает.
 * Проверено на 432 своих плитках (вид × размер × тон × зерно; как есть, поворот, JPEG q60, уменьшение вдвое), 24 почти
 * белых и 16 плитках сайтов в тех же четырёх вариантах: неверный вид с уверенностью от средней — 0 на своих и на наборе;
 * остаётся спорный случай вне набора — меловая доска mightyquinnsbbq.com (pulp 0.83).
 */
export const KIND = { woodCoh: 0.5, woodFine: 0.15, woodCohBig: 0.6, grainFine: 0.15, fibreKurt: 1.5, reliefLow: 0.1, fibreKurtBig: 3, reliefBig: 0.2, veinSkew: 1.2, skewGap: 0.2, veinShare: 0.017, clipRoom: 1.5, clipHalf: 0.5, faintSd: 1.8, creaseKurt: 1.5, blobLow: 0.65, sideSure: 448, sideFloor: 0.6, sure: 0.7, fair: 0.45 };
/** Направленность штрихов, с которой волокна считаются уложенными в одну сторону («волокна вдоль ширины»): её же берёт surface-tile.mjs --like для направления волокон своей зернистой бумаги. */
export const FIBRE_COH = 0.35;
const KIND_TITLE = { paper: 'мятая бумага', pulp: 'зернистая бумага', stone: 'камень', canvas: 'ткань' };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
/**
 * Вид крупной фактуры по признакам рисунка: какой из видов своей плитки surface-tile.mjs ближе.
 * → { kind: 'paper' | 'pulp' | 'stone' | 'canvas' | null, conf — уверенность 0…1, word — она же словом, basis — на чём
 *     основано (числа), alt — два кандидата, когда уверенность низкая, guess — ближайший вид для команды }.
 * kind = null — «не определено»: признаки слабые или такого вида у surface-tile.mjs нет (дерево).
 */
export function tileKind(F) {
  /* признаков нет или окно мельче 48 px (analyzeTile такие сюда не пускает, но функция экспортируется: массив 3×3
     выходил «зернистой бумагой» с уверенностью 1) — вид не называется */
  if (!F || (F.win && Math.min(F.win[0], F.win[1]) < 48)) return { kind: null, conf: 0, word: 'не определено', basis: 'плитка мелкая — рисунок не разбирался', alt: ['paper', 'stone'], guess: 'paper' };
  const K = KIND; const out = (kind, conf, basis, alt) => {
    const c = r2(clamp01(conf)); const word = c >= K.sure ? 'высокая' : c >= K.fair ? 'средняя' : 'низкая';
    return { kind: c >= K.fair ? kind : null, conf: c, word, basis, alt: alt || null, guess: kind || (alt && alt[0]) || 'paper' };
  };
  const px = F.per.x, py = F.per.y;
  const small = F.win ? Math.max(K.sideFloor, Math.min(1, Math.min(F.win[0], F.win[1]) / K.sideSure)) : 1;
  const tiny = small < 1 ? `; плитка мелкая (${Math.min(F.win[0], F.win[1])} px) — линий мало, уверенность снижена` : '';
  if (isWeave(F)) return out('canvas', 0.4 + 0.6 * Math.min(px.peak, py.peak), `рисунок повторяется по обеим осям: шаг ${px.lag} px по ширине и ${py.lag} px по высоте (автокорреляция ${px.peak} и ${py.peak}) — переплетение нитей`, ['canvas', 'paper']);
  const along = F.dir <= 20 || F.dir >= 160 ? 'вдоль ширины' : Math.abs(F.dir - 90) <= 20 ? 'вдоль высоты' : `под углом ${F.dir}°`;
  if ((F.coh >= K.woodCoh && F.fine >= K.woodFine) || (F.coh >= K.woodCohBig && small >= 1)) return out(null, 0.3, `штрихи вытянуты ${along} (направленность ${F.coh}${F.fine >= K.woodFine ? `) и мелкие (доля деталей мельче 5 px ${F.fine}` : ''}) — дерево, доски или шлифовка: такого вида у surface-tile.mjs нет`, ['stone', 'paper']);
  if (F.fine >= K.grainFine) {
    /* зерно без волокон поверх крупного рельефа — шум сжатия на мятой бумаге или пергамент с разводами: не решить */
    if (F.kurt < K.fibreKurt && F.low >= K.reliefLow) return out(null, 0.4, `зерно без волокон (доля деталей мельче 5 px ${F.fine}, эксцесс ${F.kurt}) поверх крупного рельефа (пятна крупнее 49 px ${F.low}) — мятая бумага с шумом сжатия или зернистая бумага с разводами`, ['paper', 'pulp']);
    /* при сильном рельефе слабый эксцесс волокон не доказывает: его дают и заломы мятого листа. Чёрная мятая бумага
       tijuanaflats.com (шапка, 380×369, JPEG с шумом: эксцесс 2.65, пятна 0.24) выходила «зернистой» с уверенностью 0.84 */
    if (F.kurt < K.fibreKurtBig && F.low >= K.reliefBig) return out(null, 0.4, `зерно со слабыми штрихами (доля деталей мельче 5 px ${F.fine}, эксцесс ${F.kurt} при пороге ${K.fibreKurtBig}) поверх сильного рельефа (пятна крупнее 49 px ${F.low}) — такой эксцесс дают и заломы мятого листа: мятая бумага с шумом сжатия или зернистая бумага с разводами`, ['paper', 'pulp']);
    /* зерно и волокна — зернистая бумага; крупные мягкие пятна рядом с ними (low от 0.5) — уже спорно: камень с шумом сжатия выглядит так же */
    let conf = (0.5 + (F.fine - K.grainFine) * 2 - Math.max(0, F.low - 0.4)) * small;
    /* больше половины пикселей — чистый белый (или чёрный): видны одни крапины, зерна самого листа нет — уверенность не
       выше средней (famousdaves.com: 254 ± 2.5, на краю шкалы 85 % пикселей — выходила 1) */
    const clipped = F.clip != null && F.clip > K.clipHalf; if (clipped) conf = Math.min(conf, 0.6);
    return out('pulp', conf, `зерно и волокна: доля деталей мельче 5 px ${F.fine}${Math.abs(F.skew) >= K.veinSkew ? `, тонкие ${F.skew < 0 ? 'тёмные' : 'светлые'} штрихи (асимметрия ${F.skew})` : ''}${F.coh >= FIBRE_COH ? `, волокна ${along}` : ''} — зернистая бумага, крафт, картон${clipped ? `; но ${Math.round(F.clip * 100)} % пикселей лежат на краю шкалы — видны одни крапины, уверенность снижена` : ''}${tiny}`, ['pulp', 'paper']);
  }
  /* дальше вид решает асимметрия остатка — а она надёжна не всегда. Где признак держится на шуме, вид не называется:
     два кандидата и «выбрать глазами» (проверка 02.10.2026: неверный вид с уверенностью выше низкой недопустим) */
  const a = Math.abs(F.skew), sign = F.skew < 0 ? 'тёмные' : 'светлые';
  const skewHi = r2(K.veinSkew + K.skewGap), skewLo = r2(K.veinSkew - K.skewGap);
  /* яркость упирается в край шкалы: обрезка по 255 (или 0) срезает одну сторону распределения и сама даёт асимметрию —
     своя бумага 254 ± 2 выходила «камнем» с уверенностью 1 */
  if (F.room != null && F.room < K.clipRoom) return out(null, 0.4, `яркость упирается в край шкалы (${F.mean} ± ${F.sd}: до края ${F.room} σ, на краю ${Math.round((F.clip || 0) * 100)} % пикселей) — асимметрию (${F.skew}) даёт обрезка, а не рисунок: прожилки это или заломы, по числам не решить`, a >= K.veinSkew ? ['stone', 'paper'] : ['paper', 'stone']);
  if (a >= skewHi) {
    /* линии одного знака должны занимать заметную площадь: у прожилок с тенью хвост остатка — от 1.7 % пикселей (свой
       камень 1.7…3.1 %, zakroma.rest 2.4 %); у редких пятнышек и потемневших краёв винтажной бумаги
       (mcsorleysoldalehouse.nyc: 1.1…1.4 % — выходила «камнем» 0.79) и у волокон, сглаженных сжатием (dogfish.com после
       WebP q60: 1.5 % — «камень» 1), асимметрия та же, а линий-прожилок нет */
    if (F.tail && F.tail.share < K.veinShare) return out(null, 0.4, `${sign} выбросы есть (асимметрия ${F.skew}, эксцесс ${F.kurt}), но занимают мало площади (${r2(F.tail.share * 100)} % при ${r2(K.veinShare * 100)} % у прожилок) — прожилки это, редкие пятнышки или волокна, сглаженные сжатием, по числам не решить`, F.fine >= K.grainFine / 2 ? ['pulp', 'stone'] : ['paper', 'stone']);
    return out('stone', (0.5 + (a - K.veinSkew) * 0.4) * small, `тонкие ${sign} линии на гладком поле (асимметрия ${F.skew}, эксцесс ${F.kurt}; доля деталей мельче 5 px ${F.fine}) — прожилки${tiny}`, ['stone', 'paper']);
  }
  /* асимметрия у самой границы: ни прожилки, ни их отсутствие не доказаны (свой камень после JPEG q60: −1.18 — выходил «бумагой» 0.51) */
  if (a > skewLo) return out(null, 0.4, `асимметрия остатка у границы (${F.skew} при пороге прожилок ${K.veinSkew} ± ${K.skewGap}, эксцесс ${F.kurt}) — слабые прожилки или заломы, по числам не решить`, a >= K.veinSkew ? ['stone', 'paper'] : ['paper', 'stone']);
  if (F.kurt >= K.creaseKurt) {
    /* «бумага» — вывод от отсутствия линий одного знака, а при малом разбросе тонкие линии тонут в квантовании и сжатии:
       свой камень 250 ± 0.9 и 251 ± 1.5 выходил «бумагой» 0.74 и 0.67 */
    if (F.sd != null && F.sd < K.faintSd) return out(null, 0.4, `резкие перепады без линий одного знака (эксцесс ${F.kurt}, асимметрия ${F.skew}), но разброс мал (σ ${F.sd} при пороге ${K.faintSd}): тонкие прожилки при нём тонут в квантовании и сжатии — мятая бумага это или камень, по числам не решить`, ['paper', 'stone']);
    return out('paper', (0.5 + (K.veinSkew - a) * 0.4) * small - Math.max(0, F.low - K.blobLow) * 5, `резкие перепады без тонких линий одного знака (эксцесс ${F.kurt}, асимметрия ${F.skew}) на гладком поле — заломы и грани мятой бумаги${F.low > K.blobLow ? `; но почти весь разброс — пятна крупнее 49 px (${F.low}): так выглядят и разводы камня` : ''}${tiny}`, ['paper', 'stone']);
  }
  return out(null, 0.35, `мягкие пятна без линий и зерна (эксцесс ${F.kurt}, асимметрия ${F.skew}, доля крупнее 49 px ${F.low}) — штукатурка, бетон, ровный камень или гладкая бумага`, ['stone', 'paper']);
}

/* рисунок крупнее зерна: пятна крупнее 49 px или линии (эксцесс, асимметрия остатка). Нет его — это зерно, пусть и мягкое */
const hasMarks = (F) => F.low >= SURFACE.lowMin || F.kurt >= SURFACE.kurtMin || Math.abs(F.skew) >= SURFACE.skewMin;
/* мягкое или крупное зерно: соседние пиксели связаны (размытый шум, шум, увеличенный в 3–4 раза), а рисунка нет. Крупной
   фактурой не считается, фотографией и рисунком — тоже: слой с таким файлом остаётся слоем зерна */
const softGrain = (F) => !!F && F.fine >= 0.03 && F.fine <= SURFACE.fineMax && !hasMarks(F) && !isWeave(F) && !isOrnament(F) && F.hot8 != null && F.hot8 <= 1.5;   /* зерно — по всей площади и не вырожденное: у прозрачной накладки с рисунком по краям (dinosaurbarbque.com, texture-black.png) окно разбора пустое */
/* Крупная ли это фактура — по числам первого кадра (пороги SURFACE). → { ok, why[] } — why: чем не подошла. */
function surfaceJudge(t) {
  const f = t.frames[0]; const S = SURFACE; const why = []; const F = f.feat || null;
  /* полупрозрачная плитка судится положенной на средний серый: так считаются sdOver, связь соседей и части */
  const thin = f.alphaMean < S.alphaOpaque; const sd = thin ? f.sdOver : f.sd;
  if (t.pages > 1) why.push(`кадров ${t.pages} — анимация`);
  if (f.alphaMean < S.alphaMin) why.push(`почти прозрачная (альфа ${f.alphaMean}) — рисунок на прозрачном поле`);
  if (sd < S.sdMin) why.push(`ровная заливка (σ ${sd})`);
  else if (sd > S.sdMax) why.push(`контрастная картинка (σ ${sd} при пороге ${S.sdMax})`);
  if (isOrnament(F)) why.push(`рисунок повторяется по обеим осям на ровном поле (шаг ${F.per.x.lag} и ${F.per.y.lag} px, эксцесс ${F.kurt}) — орнамент, не фактура`);
  else if (!isWeave(F)) {
    if (F) {
      if (F.fine > S.fineMax) why.push(`соседние пиксели не связаны (lag1 ${f.lag1}/${f.lag1v}, доля деталей мельче 5 px ${F.fine}) — шум или мелкий узор`);
      /* признак рисунка нужен при любой доле мелких деталей: шум, размытый на 1.6–2 px, и шум, увеличенный втрое, дают
         долю 0.12…0.28 и без него проходили как фактура — а слой такого зерна пропадал из зерна */
      else if (!hasMarks(F)) why.push(`рисунка крупнее зерна нет (пятна крупнее 49 px ${F.low}, эксцесс ${F.kurt}, асимметрия ${F.skew}; доля деталей мельче 5 px ${F.fine}) — мягкое или крупное зерно, не фактура`);
      /* линии, значки, орнамент на заливке: эксцесс и асимметрия у них как у волокон, но поле между знаками ровное и
         крупных пятен нет */
      else if (F.calm >= S.calmMax && F.low < S.calmLow && F.field != null && F.field <= S.fieldMax) why.push(`рисунок на ровном поле (ровных клеток 8×8 px ${F.calm}, все одного тона — разброс ${F.field} σ; пятен крупнее 49 px нет — ${F.low}) — линии, значки или орнамент, не фактура`);
    } else if (Math.min(f.lag1, f.lag1v) < S.lagMin) why.push(`соседние пиксели не связаны (lag1 ${f.lag1}/${f.lag1v}) — шум или мелкий узор`);
    else if (f.farCorr < S.farMin) why.push(`детали мельче 3 px (связь на 3–6 px ${f.farCorr})`);
  }
  /* полупрозрачная плитка — только без крупных пятен: фотография в png с ровной альфой 0.12 на сером выглядит бледной,
     как фактура, но почти весь её разброс — пятна крупнее 49 px */
  if (thin && f.alphaMean >= S.alphaMin && F && F.low > S.thinLowMax) why.push(`полупрозрачная картинка с крупными пятнами (альфа ${f.alphaMean}, доля разброса крупнее 49 px ${F.low} при пороге ${S.thinLowMax}) — фотография или вуаль, не плитка`);
  /* «два тона» — когда два самых частых уровня далеко друг от друга (линии на заливке); у слабой фактуры на почти
     белом поле они соседние: при σ около 1 почти все пиксели лежат на двух уровнях подряд */
  if (F && F.flat2 > S.flat2Max && F.gap2 >= S.flatGap && sd >= S.sdMin) why.push(`рисунок в два тона (доля двух самых частых уровней яркости ${F.flat2}, между ними ${F.gap2} ур.) — сетка, схема или вектор, не фактура`);
  if (F && F.hot8 != null && F.hot8 > S.hotMax) why.push(`детали собраны в немногих местах (разброс по клеткам 8×8: средний против медианного ${F.hot8}) — рамка или рисунок на ровном поле, не фактура`);
  if (Math.min(t.width, t.height) < S.sideMin) why.push(`мелкая плитка ${t.width}×${t.height} — узор`);
  if (f.parts) {
    if (f.parts.live < S.liveMin) why.push(`детали не по всей площади (живых частей ${f.parts.live} из 16) — рисунок, не фактура`);
    /* у плитки до smallSide px пятна крупные относительно её самой — порог мягче; фотографию на весь блок такой файл не даст */
    const spreadMax = Math.min(t.width, t.height) <= S.smallSide ? S.spreadSmall : S.spreadMax;
    if (f.parts.spread > spreadMax) why.push(`общий уклон яркости (разброс средних ${f.parts.spread} σ при пороге ${spreadMax}) — градиент или фотография`);
  }
  if (f.chromaSd != null && f.chromaSd > Math.max(4, S.chromaMax * sd)) why.push(`цвет меняется по картинке (разброс ${f.chromaSd}) — цветной рисунок`);
  return { ok: !why.length, why };
}

/**
 * Разбор файла текстуры по ВСЕМ кадрам (GIF/WebP) — файл или Buffer (SVG тоже: sharp его рисует).
 * → { file, format, bytes, width, height, pages, delayMs[], frameMs, cycleMs, fps, loop,
 *     frames: [{ mean, sd, sdOver, lag1, lag1v, alphaMean, transparent, chroma, levels }],
 *     frameCorr[], noiseLike, surfaceLike, surfaceWhy[], seam }. sdOver — σ яркости, положенной на средний
 * серый (для альфа-зерна);
 * noiseLike — похоже на шум: σ заметная, связь соседей < 0.8, на расстоянии 3–6 px связи нет (не узор);
 * surfaceLike — крупная фактура (пороги SURFACE), surfaceWhy — чем не подошла; у первого кадра ещё
 * parts { live — сколько из 16 частей картинки несут детали, spread — разброс средних по частям в долях σ },
 * chromaSd — разброс цвета по картинке, tint — средний цвет; seam — шов при повторе (seamOf; один кадр).
 */
export async function analyzeTile(input, { name = null, seam = null } = {}) {
  const sharp = needSharp();
  const meta = await sharp(input, { animated: true }).metadata();
  const pages = meta.pages || 1, W = meta.width, H = meta.pageHeight || meta.height;
  const { data } = await sharp(input, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frames = []; const lums = [];
  for (let p = 0; p < pages; p++) {
    const off = p * W * H * 4, n = W * H; const L = new Float32Array(n); const C = new Float32Array(n);
    let s = 0, s2 = 0, so = 0, so2 = 0, aSum = 0, a0 = 0, chroma = 0, sw = 0, sw2 = 0, sk = 0, sk2 = 0; const lv = new Set();
    for (let i = 0; i < n; i++) {
      const o = off + i * 4; const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; L[i] = l; s += l; s2 += l * l;
      const c = (a / 255) * l + (1 - a / 255) * 128; C[i] = c; so += c; so2 += c * c;
      if (p === 0 && a < 255) { const k = (a / 255) * l, wv = k + (1 - a / 255) * 255; sw += wv; sw2 += wv * wv; sk += k; sk2 += k * k; } else if (p === 0) { sw += l; sw2 += l * l; sk += l; sk2 += l * l; }
      aSum += a; if (a === 0) a0++; chroma += Math.max(r, g, b) - Math.min(r, g, b); if (lv.size < 300) lv.add(Math.round(l));
    }
    const m = s / n, v = Math.max(0, s2 / n - m * m), mo = so / n, vo = Math.max(0, so2 / n - mo * mo);
    const corrAt = (dx, dy) => { let c = 0, k = 0; for (let y = 0; y + dy < H; y++) for (let x = 0; x + dx < W; x++) { c += (C[y * W + x] - mo) * (C[(y + dy) * W + x + dx] - mo); k++; } return k && vo > 0 ? c / k / vo : 0; };
    const lagH = corrAt(1, 0), lagV = corrAt(0, 1);
    const far = [3, 4, 5, 6].flatMap((d) => [corrAt(d, 0), corrAt(0, d)]).map(Math.abs);
    lums.push({ L, m, C: p === 0 ? C : null });
    frames.push({ mean: r2(m), sd: r2(Math.sqrt(v)), sdOver: r2(Math.sqrt(vo)), lag1: r2(lagH), lag1v: r2(lagV), farCorr: r2(Math.max(...far)), alphaMean: r2(aSum / n / 255), transparent: r2(a0 / n), chroma: r2(chroma / n), levels: lv.size >= 300 ? '300+' : lv.size });
    /* полупрозрачная плитка: какой она выходит на белом и на чёрном поле (яркость ± σ) — для рецепта своей плитки */
    if (p === 0 && aSum / n / 255 < SURFACE.alphaOpaque) { const st = (a, b) => { const mm = a / n; return { mean: r2(mm), sd: r2(Math.sqrt(Math.max(0, b / n - mm * mm))) }; }; frames[0].over = { white: st(sw, sw2), black: st(sk, sk2) }; }
  }
  const frameCorr = [];
  for (let p = 1; p < pages; p++) { const A = lums[p - 1], B = lums[p]; let s = 0, sa = 0, sb = 0; for (let i = 0; i < A.L.length; i++) { const x = A.L[i] - A.m, y = B.L[i] - B.m; s += x * y; sa += x * x; sb += y * y; } frameCorr.push(sa && sb ? r2(s / Math.sqrt(sa * sb)) : null); }
  const delay = Array.isArray(meta.delay) ? meta.delay.slice(0, pages) : [];
  const cycle = delay.reduce((a, b) => a + b, 0);
  const f0 = frames[0];
  const noiseLike = f0.sdOver >= 6 && Math.abs(f0.lag1) < 0.8 && Math.abs(f0.lag1v) < 0.8 && f0.farCorr < 0.3;
  /* первый кадр — для крупной фактуры: разброс цвета и средний цвет, ровность по площади (16 частей 4×4) */
  {
    const translucent = f0.alphaMean < SURFACE.alphaOpaque; const sdEff = translucent ? f0.sdOver : f0.sd;
    const n = W * H, L = translucent ? lums[0].C : lums[0].L; let rg = 0, rg2 = 0, bg = 0, bg2 = 0, sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < n; i++) { const o = i * 4; const r = data[o], g = data[o + 1], b = data[o + 2]; const d1 = r - g, d2 = b - g; rg += d1; rg2 += d1 * d1; bg += d2; bg2 += d2 * d2; sr += r; sg += g; sb += b; }
    f0.chromaSd = r2(Math.sqrt(Math.max(0, rg2 / n - (rg / n) ** 2) + Math.max(0, bg2 / n - (bg / n) ** 2)));
    f0.tint = '#' + [sr, sg, sb].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
    if (W >= 16 && H >= 16) {
      const G = 4; const sds = [], means = [];
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const x0 = Math.floor(i * W / G), x1 = Math.floor((i + 1) * W / G), y0 = Math.floor(j * H / G), y1 = Math.floor((j + 1) * H / G);
        let s = 0, s2 = 0, k = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = L[y * W + x]; s += v; s2 += v * v; k++; }
        const m = s / k; means.push(m); sds.push(Math.sqrt(Math.max(0, s2 / k - m * m)));
      }
      const med = sds.slice().sort((a, b) => a - b)[8]; const mm = means.reduce((a, b) => a + b, 0) / means.length;
      const spread = Math.sqrt(means.reduce((a, b) => a + (b - mm) * (b - mm), 0) / means.length);
      f0.parts = { live: med > 0.05 ? sds.filter((v) => v >= 0.35 * med).length : 0, spread: sdEff > 0 ? r2(spread / sdEff) : 0 };
    }
    /* признаки рисунка (повтор, зерно, линии, направленность) — у одиночного кадра со стороной от 48 px и разбросом,
       при котором вопрос «фактура ли это» ещё стоит: у фотографии с σ 40+ ответ уже есть, а счёт дорогой */
    if (pages === 1 && Math.min(W, H) >= 48 && sdEff >= SURFACE.sdMin / 2 && sdEff <= SURFACE.sdMax * 3) f0.feat = tileFeatures(L, W, H);
  }
  const sj = surfaceJudge({ pages, width: W, height: H, frames });
  const bytes = Buffer.isBuffer(input) ? input.length : fs.statSync(input).size;
  /* шов считается у плитки крупной фактуры (и по просьбе: seam: true) — остальным он ни к чему */
  const seamRes = pages === 1 && (seam === true || (seam == null && sj.ok)) ? seamOf(f0.alphaMean < SURFACE.alphaOpaque ? lums[0].C : lums[0].L, W, H) : null;   /* повтор для сбоя фазы seamOf считает сам: признаки сняты с окна, а шов — по краям всего кадра */
  /* вид — только у плитки, признанной крупной фактурой */
  const kind = sj.ok ? tileKind(f0.feat || null) : null;
  return {
    file: name || (Buffer.isBuffer(input) ? '(данные)' : path.basename(input)), format: meta.format, bytes, width: W, height: H, pages,
    delayMs: delay, frameMs: delay.length ? median(delay) : null, cycleMs: cycle || null, fps: cycle ? r2(1000 * delay.length / cycle) : null,
    loop: meta.loop ?? null, frames, frameCorr, noiseLike, surfaceLike: sj.ok, surfaceWhy: sj.why, ...(kind ? { kind } : {}), ...(seamRes ? { seam: seamRes } : {}),
  };
}

/* бледная шум-плитка: разброс как у фона (σ на сером от sdMin до sdMax), соседние пиксели не связаны и на 3–6 px
   связи нет — зерно, положенное плиткой в фон блока (massandra.ru: 100×100, σ 2.81, lag1 0.12). Слоем зерна такой
   файл не считается (noiseLike требует σ от 6), крупной фактурой — тоже */
const paleNoiseTile = (t) => { const q = t && !t.error && t.frames && t.frames[0]; return !!q && t.pages === 1 && !t.surfaceLike && q.sdOver >= SURFACE.sdMin && q.sdOver <= SURFACE.sdMax && Math.abs(q.lag1) < 0.5 && Math.abs(q.lag1v) < 0.5 && q.farCorr < 0.2; };

/* файл слоя: data-URI, fetch из страницы (кэш браузера) или обычный запрос без своих заголовков */
async function fetchLayerFile(page, u) {
  if (/^data:/i.test(u)) {
    const m = /^data:([^,;]*)((?:;[^,;]*)*),(.*)$/is.exec(u); if (!m) return null;
    const buf = /;base64/i.test(m[2] || '') ? Buffer.from(m[3], 'base64') : Buffer.from((() => { try { return decodeURIComponent(m[3]); } catch { return m[3]; } })(), 'utf8');
    return { buf, via: 'data-URI', type: m[1] || '' };
  }
  let abs; try { abs = new URL(u, page.url()).href; } catch { return null; }
  /* страница с диска (сборка до выкладки, стенд): fetch к file:// закрыт и в странице, и в Node — читаем файл сами */
  if (/^file:/i.test(abs)) {
    try { const buf = fs.readFileSync(fileURLToPath(abs.split('#')[0].split('?')[0])); return buf.length <= 8e6 ? { buf, via: 'диск', url: abs } : null; } catch { return null; }
  }
  const b64 = await page.evaluate(async (x) => {
    try { const r = await fetch(x); if (!r.ok) return null; const a = new Uint8Array(await r.arrayBuffer()); if (a.length > 8e6) return null; let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); } catch (e) { return null; }
  }, abs).catch(() => null);
  if (b64) return { buf: Buffer.from(b64, 'base64'), via: 'страница', url: abs };
  try { const r = await fetch(abs, { signal: AbortSignal.timeout(20000) }); if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); if (buf.length <= 8e6) return { buf, via: 'сеть', url: abs }; } } catch { /* нет */ }
  return null;
}

/* ======================================================================
   4. Кипение, правила режимов, диагноз
   ====================================================================== */

/* частота кипения из @keyframes: сегменты между кадрами ключей × steps(n) */
function boilFromAnim(a) {
  if (!a || a.iterations !== 'infinite' || !(a.durationMs > 0) || a.playState === 'paused') return null;
  const st = /steps\(\s*(\d+)/.exec(a.timing || ''); const stepEnd = /step-(start|end)/.test(a.timing || '');
  const offs = [...new Set([0, 100, ...((a.offsets || []).filter((x) => Number.isFinite(x)))])].sort((x, y) => x - y);
  const segments = Math.max(1, offs.length - 1);
  if (!st && !stepEnd) return { frames: null, frameMs: null, cycleMs: a.durationMs, smooth: true, name: a.name };
  const frames = segments * (st ? Number(st[1]) : 1);
  return { frames, frameMs: Math.round(a.durationMs / frames), cycleMs: a.durationMs, smooth: false, name: a.name };
}
function boilSource(layers) {
  for (const L of layers) if (L.file && L.file.pages > 1) return { source: 'файл', frames: L.file.pages, frameMs: L.file.frameMs, cycleMs: L.file.cycleMs, of: L.el + (L.pseudo || '') };
  for (const L of layers) for (const a of [...(L.anims || []), ...(L.animsChain || [])]) { const b = boilFromAnim(a); if (b) return { source: '@keyframes', ...b, of: L.el + (L.pseudo || '') }; }
  return null;
}

/**
 * Правила режимов наложения для зерна (G3): even — одинаковая сила на любом фоне;
 * deadOnDark — гаснет на тёмных фонах (Y до ~50); deadOnLight — на светлых.
 */
export function blendAdvice(mode) {
  const m = String(mode || 'normal').toLowerCase();
  const even = ['normal', 'hard-light', 'luminosity', 'difference', 'exclusion'].includes(m);
  const deadOnDark = ['multiply', 'overlay', 'soft-light', 'darken', 'color-burn'].includes(m);
  const deadOnLight = ['screen', 'overlay', 'soft-light', 'lighten', 'color-dodge'].includes(m);
  const text = even ? `${m}: одинаковая сила на любом фоне${m === 'normal' ? ', чёрный поднимается на ≈ opacity×127' : m === 'hard-light' ? ', чёрный поднимается меньше' : ''}`
    : deadOnDark && deadOnLight ? `${m}: гаснет на тёмных (Y до ~50) и на светлых фонах, работает только на средних тонах`
    : deadOnDark ? `${m}: гаснет на тёмных фонах (Y до ~50), на чёрном зерна нет`
    : deadOnLight ? `${m}: гаснет на светлых фонах, на белом зерна нет`
    : `${m}: поведение по фонам не проверено — мерить`;
  return { mode: m, even, deadOnDark, deadOnLight, text };
}
const layerBlend = (L) => (L.mixBlendMode && L.mixBlendMode !== 'normal' ? L.mixBlendMode : L.blendChain && L.blendChain.length ? L.blendChain[0].split(':').pop() : 'normal');

function diagnose(res) {
  const out = []; const g = res.grain; const c = res.contribution;
  const fmtB = (b) => (b && b.tiles ? `σ ${b.sd} на Y ${Math.round(b.y)}` : 'не измерено');
  for (const L of res.layers) {
    const mode = layerBlend(L); const adv = blendAdvice(mode);
    const name = `${L.el}${L.pseudo || ''}`;
    const dark = (c && c.dark.status !== 'не измерено' ? c.dark : null) || (g.dark.status !== 'не измерено' ? g.dark : null);
    const light = (c && c.light.status !== 'не измерено' ? c.light : null) || (g.light.status !== 'не измерено' ? g.light : null);
    if (adv.deadOnDark && dark && dark.sd < GRAIN_MIN_SD) out.push(`${mode} гасит на тёмном: ${fmtB(dark)} (слой ${name}, opacity ${L.effectiveOpacity}) → normal или hard-light, opacity = нужная σ / σ плитки (${TILE_SD})`);
    else if (adv.deadOnDark && !dark) out.push(`${mode} у слоя ${name}: на тёмных фонах погаснет (тёмных ровных участков на снимках нет — не измерено)`);
    if (adv.deadOnLight && light && light.sd < GRAIN_MIN_SD) out.push(`${mode} гасит на светлом: ${fmtB(light)} (слой ${name}) → normal или hard-light`);
    if (L.svg && (L.svg.alphaTable == null)) out.push(`feTurbulence у ${name} без feFuncA: альфа шума ≈ 0.3, сила зависит от неё — смотреть замер, а не opacity`);
    if (L.kind === 'svg' || (L.svg && L.kind === 'filter')) out.push(`шум рисуется фильтром SVG (${name}) на каждый кадр — цену мерить perf-замером`);
  }
  if (res.layers.length && c) {
    const vals = ['dark', 'mid', 'light'].map((k) => c[k]).filter((b) => b.status !== 'не измерено');
    if (vals.length && vals.every((b) => b.sd < 0.5)) out.push('слой есть, но не виден: вклад «со слоем − без» ≈ 0 на всех фонах (спрятан, нулевой размер, режим наложения или @media)');
  }
  if (!res.layers.length && res.status === 'есть') out.push(res.paleNoise ? `слоя зерна нет, зерно — от бледной шум-плитки в фоне блока (${res.paleNoise.file} ${res.paleNoise.width}×${res.paleNoise.height}, σ ${res.paleNoise.sd}, lag1 ${res.paleNoise.lag1}): слоем она не считается, сила — по снимку; у себя — слой зерна той же силы` : 'зерно на снимке есть, а слой не найден: оно в самих картинках или фонах — повторять не слоем');
  if (res.status === 'не измерено' && (res.patterns || []).some((p) => /узор/.test(p.why))) out.push(`узор в фоне (${res.patterns.filter((p) => /узор/.test(p.why)).map((p) => p.el).join(', ')}) — не зерно; он же делает участки неровными, поэтому зерно поверх него не измерить`);
  const d = g.dark, l = g.light;
  /* слоя зерна нет, σ — шум самих картинок (inPictures): сравнивать тёмное со светлым нечего */
  if (!res.inPictures && d.status !== 'не измерено' && l.status !== 'не измерено' && Math.max(d.sd, l.sd) >= GRAIN_MIN_SD) {
    const ratio = d.sd / Math.max(0.1, l.sd);
    if (ratio < 0.5 || ratio > 2) out.push(`зерно неравномерно: тёмный/светлый = ${r2(ratio)} (режим наложения не normal или альфа-плитка)`);
  }
  if (res.boil && res.boil.boils === false && res.boil.source === 'файл') out.push(`файл анимирован (${res.boil.frames} кадра), а на снимках через 250 мс зерно стоит — кадр мог не смениться в безголовом Chrome; частоту брать из файла`);
  if (res.hideError) out.push(`проход «без слоя» не сделан: ${res.hideError} — вклад слоя не измерен, σ — по снимкам со слоем (картинки и градиенты тоже дают σ)`);
  return out;
}

/* ======================================================================
   4а. Крупная фактура на снимках
   ====================================================================== */

/* яркость цвета CSS «rgb(…)» / «rgba(…)»; прозрачный и нечитаемый — null */
const yOfCss = (c) => {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(String(c || '')); if (!m) return null;
  const a = m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : Number(m[4]);
  return a < 0.5 ? null : 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3];
};
const toneOf = (y) => (y == null ? null : y < 60 ? 'dark' : y > 190 ? 'light' : 'mid');
const TONE = { dark: 'тёмный', mid: 'средний', light: 'светлый' };
const firstCss = (v, d) => String(v || d).split(',')[0].trim() || d;
/* режим наложения крупной фактуры: у картинки в фоне блока — background-blend-mode (на цвет того же блока),
   у отдельного слоя и картинки-подложки — mix-blend-mode (на то, что под слоем) */
const surfaceBlend = (L) => {
  if (L.via !== 'фон блока') return layerBlend(L);
  const modes = String(L.backgroundBlendMode || 'normal').split(',').map((x) => x.trim()).filter(Boolean);
  return modes.find((m) => m !== 'normal') || modes[0] || 'normal';
};
/* как показана плитка: размер фона, повтор, ширина одного повтора в CSS px */
function surfaceShown(L, file) {
  const size = firstCss(L.backgroundSize, 'auto'), repeat = firstCss(L.backgroundRepeat, 'repeat');
  const px = /^([\d.]+)px/.exec(size), pc = /^([\d.]+)%/.exec(size);
  const stretched = L.kind !== 'background' || /cover|contain|%/.test(size);
  const w = L.kind !== 'background' ? L.rect.w : px ? Number(px[1]) : pc ? L.rect.w * Number(pc[1]) / 100 : /cover|contain/.test(size) ? L.rect.w : file ? file.width : null;
  return { size: L.kind !== 'background' ? 'картинка на блок' : size, repeat, px: w ? Math.round(w) : null, stretched };
}

/**
 * Участки B×B ровных плиток (B = 4 — 128 px, B = 2 — 64 px) одной полосы фона на одном экране: σ участка —
 * разброс вклада фактуры по всему участку, то есть мелкие детали внутри плиток (sdD) и перепад между
 * плитками (meanD) вместе. Зерно меряют в плитке 32 px с вычтенной плоскостью; у крупной фактуры главное
 * как раз крупнее 32 px, и так она вышла бы втрое слабее, чем видна. need — сколько плиток участка должны
 * быть ровными. → [{ s, x, y, size, band, sd, fine, lift, yw, n }]
 */
function surfaceBlocks(tiles, B, need) {
  const groups = new Map(); const step = 32 * B;
  for (const t of tiles) {
    if (t.sdD == null) continue;
    const key = `${t.s || 0}|${Math.floor((t.x - 12) / step)}|${Math.floor((t.y - 12) / step)}|${toneOf(t.yw)}`;
    let g = groups.get(key); if (!g) groups.set(key, g = []); g.push(t);
  }
  const out = [];
  for (const [key, g] of groups) {
    if (g.length < need) continue;
    const [s, bx, by, band] = key.split('|'); const n = g.length; let w = 0, m = 0, yw = 0;
    for (const t of g) { w += t.sdD * t.sdD; m += t.meanD; yw += t.yw; }
    m /= n; let b = 0; for (const t of g) b += (t.meanD - m) * (t.meanD - m);
    /* тронутые плитки — где разность «с фактурой − без» не нулевая. Все тронуты — участок под фактурой (shown); часть —
       участок на границе слоя (mixed): половина под плиткой, половина нет, и σ такого участка — это ступенька между
       ними, а не фактура (4rsmokehouse.com: карточка с бумагой на белой странице давала σ 19.5 при σ плитки 6.3) */
    let touched = 0; for (const t of g) if (t.sdD > 0.02 || Math.abs(t.meanD) > 0.02) touched++;
    out.push({ s: Number(s), x: 12 + Number(bx) * step, y: 12 + Number(by) * step, size: step, band, sd: Math.sqrt((w + b) / n), fine: Math.sqrt(w / n), lift: m, yw: yw / n, n, shown: touched === n, mixed: touched > 0 && touched < n });
  }
  return out;
}
/* полоса фона по участкам: { blocks, shown, sd, sd_p90, fine, lift, y, status } — «есть» при σ ≥ SURFACE_MIN_SD.
   Сила считается по участкам, которые лежат под фактурой целиком (shown): на странице, где плитка стоит в фоне
   одного блока из многих или закрыта карточками, медиана по всем ровным участкам полосы равна нулю, и вердикт
   выходил «нет» при видимой фактуре (tabasco.com: σ слоя 3.01, медиана по полосе 0). Таких участков меньше
   SURFACE_MIN_BLOCKS — сила по всем участкам, кроме пограничных: фактуры в этой полосе не видно */
function surfaceBand(all) {
  const under = all.filter((b) => b.shown); const use = under.length >= SURFACE_MIN_BLOCKS ? under : all.filter((b) => !b.mixed);
  const blocks = use; const sd = median(blocks.map((b) => b.sd));
  return {
    blocks: blocks.length, shown: under.length, sd: r2(sd), sd_p90: r2(quant(blocks.map((b) => b.sd), 0.9)), fine: r2(median(blocks.map((b) => b.fine))),
    lift: r2(median(blocks.map((b) => b.lift))), y: r2(median(blocks.map((b) => b.yw))),
    status: blocks.length < SURFACE_MIN_BLOCKS ? 'не измерено' : sd >= SURFACE_MIN_SD ? 'есть' : 'нет',
  };
}
/**
 * Полоса крупной фактуры для вердикта и сравнения: участки 128 px, а где их мало — 64 px. «Мало» — и когда ровных
 * участков 128 px в полосе меньше SURFACE_MIN_BLOCKS, и когда под фактурой их меньше, а участков 64 px под ней
 * хватает: на странице, плотно закрытой содержимым, фактура видна в просветах уже 128 px (oldschool.runescape.com:
 * 43 ровных участка 128 px, под фактурой один; участков 64 px под ней 40). → Band & { size }.
 */
export function surfaceBandOf(surface, k) {
  if (!surface || !surface.bands) return { blocks: 0, sd: null, status: 'не измерено', size: 128 };
  const a = surface.bands[k], b = surface.bands64 && surface.bands64[k];
  const meas = (x) => !!x && x.status !== 'не измерено';
  /* в замерах до 02.10.2026 поля shown нет — тогда решает только «измерено», как раньше */
  const under = (x) => (x && x.shown != null ? x.shown >= SURFACE_MIN_BLOCKS : null);
  if (meas(a) && (under(a) !== false || !(meas(b) && under(b)))) return { ...a, size: 128 };
  if (meas(b)) return { ...b, size: 64 };
  return { ...(a || { blocks: 0, sd: null, status: 'не измерено' }), size: 128 };
}

/**
 * Итог по крупной фактуре на экране: слои (с режимом наложения, тоном секции и силой на ней), плитка,
 * сила на снимках по полосам фона, мелкие блоки с той же плиткой, диагнозы.
 * tiles — ровные плитки снимка «с фактурой» против снимка «без неё» (grainTiles с Yw).
 */
function surfaceResult({ layers, users, tiles, screens, rejected, error, measured }) {
  const none = (note) => ({ status: 'нет', statusNote: note, layers: [], users: [], usersCount: 0, tile: null, bands: null, bands64: null, byTone: null, diagnosis: [], rejected: rejected || [] });
  if (!layers.length) return none(measured === false ? 'файлы слоёв не разбирались' : 'картинок-плиток с крупной фактурой не найдено');
  const b128 = surfaceBlocks(tiles, 4, 12), b64 = surfaceBlocks(tiles, 2, 4);
  const bandsOf = (blocks, size) => { const o = { size }; for (const k of ['dark', 'mid', 'light']) o[k] = surfaceBand(blocks.filter((b) => b.band === k)); return o; };

  /* плитка: файл, который стоит на большинстве слоёв */
  const byFile = new Map();
  for (const L of layers) { const f = L.file; if (!f || f.error) continue; const e = byFile.get(L.fileUrl) || { f, n: 0, L }; e.n++; byFile.set(L.fileUrl, e); }
  const top = [...byFile.values()].sort((a, b) => b.n - a.n)[0];
  const f0 = top.f.frames[0];
  /* полупрозрачная плитка: яркость и σ — какой она выходит на белом поле (так её и повторять умножением на цвет
     поля); числа самого файла — в raw */
  const thin = f0.alphaMean < SURFACE.alphaOpaque && f0.over ? f0.over.white : null;
  const tile = {
    file: top.f.file, format: top.f.format, width: top.f.width, height: top.f.height, bytes: top.f.bytes,
    mean: thin ? thin.mean : f0.mean, sd: thin ? thin.sd : f0.sd, ...(thin ? { alpha: f0.alphaMean, raw: { mean: f0.mean, sd: f0.sd }, onBlack: f0.over.black } : {}),
    kind: top.f.kind || tileKind(f0.feat || null), feat: f0.feat || null, lag1: f0.lag1, lag1v: f0.lag1v, farCorr: f0.farCorr, chroma: f0.chroma, chromaSd: f0.chromaSd, tint: f0.tint, levels: f0.levels,
    seam: top.f.seam ? { x: top.f.seam.x, y: top.f.seam.y, max: top.f.seam.max } : null, saved: top.f.saved || null, layers: top.n, files: byFile.size,
  };

  /* какому слою принадлежит участок. Прямоугольники слоёв — те, что были на экране в момент снимка
     (screens[s].rects): секции бывают липкими и наезжают друг на друга, по координатам страницы их не найти.
     Из слоёв, в чей прямоугольник попал центр участка, берётся самый внутренний (меньший по площади), а из
     почти равных — более поздний в документе: он лежит сверху. Спрятанный слой участков не получает */
  const all = layers.concat(users);
  const hiddenOf = (L) => L.effectiveOpacity != null && L.effectiveOpacity < 0.02;
  const ownerOf = (b) => {
    const rects = (screens[b.s] && screens[b.s].rects) || {}; const cx = b.x + b.size / 2, cy = b.y + b.size / 2; let best = null, bestArea = Infinity;
    for (const L of all) {
      const q = rects[L.k]; if (!q || !q.shown || hiddenOf(L)) continue;
      if (!(cx >= q.x && cx < q.x + q.w && cy >= q.y && cy < q.y + q.h)) continue;
      const area = q.w * q.h;
      if (!best || area < bestArea * 0.75 || (area <= bestArea * 1.25 && L.k > best.k)) { best = L; bestArea = area; }
    }
    return best;
  };
  /* участок на краю слоя — наполовину под плиткой, наполовину нет: его разброс — ступенька между «с плиткой» и «без»,
     а не фактура (4rsmokehouse.com: карточка с бумагой 207 на белой странице — σ участков на её краю до 37 при σ
     плитки 6.3). В счёт идут участки, лежащие в прямоугольнике своего слоя целиком; тронутый плиткой участок без
     слоя-хозяина (центр мимо всех слоёв) — тоже пограничный. Прямоугольников для экрана нет — метка не ставится */
  const own128 = new Map(), own64 = new Map();
  for (const [blocks, map] of [[b128, own128], [b64, own64]]) for (const b of blocks) {
    const rects = screens[b.s] && screens[b.s].rects; const known = !!rects && Object.keys(rects).length > 0;
    const L = ownerOf(b);
    if (!L) { if (known && (b.shown || b.mixed)) { b.shown = false; b.mixed = true; } continue; }
    const q = rects[L.k];
    if (!(b.x >= q.x && b.y >= q.y && b.x + b.size <= q.x + q.w && b.y + b.size <= q.y + q.h)) { b.shown = false; b.mixed = true; }
    let g = map.get(L.k); if (!g) map.set(L.k, g = []); g.push(b);
  }
  const bands = bandsOf(b128, 128), bands64 = bandsOf(b64, 64);
  for (const L of all) {
    /* сила слоя — по его участкам, лежащим под фактурой целиком; пограничные и закрытые содержимым не в счёт */
    const under = (list) => { const u = list.filter((b) => b.shown); return u.length >= 2 ? u : list.filter((b) => !b.mixed); };
    const a128 = own128.get(L.k) || [], g64all = own64.get(L.k) || []; const g128 = under(a128), g64 = under(g64all); const g = g128.length >= 2 ? g128 : g64;
    const yMeasured = g64.length ? median(g64.map((b) => b.yw)) : g64all.length ? median(g64all.map((b) => b.yw)) : null;
    /* тон секции: по снимку без фактуры; не попало ни одного ровного участка — по цвету фона блока */
    const y = yMeasured != null ? yMeasured : L.via === 'фон блока' ? yOfCss(L.backgroundColor) : null;
    L.surf = {
      via: L.via, blend: surfaceBlend(L), tone: toneOf(y), side: y == null ? null : y < SURFACE_DARK_Y ? 'dark' : 'light', y: r2(y), toneBy: yMeasured != null ? 'снимок' : y != null ? 'цвет фона' : null,
      sd: g.length ? r2(median(g.map((b) => b.sd))) : null, lift: g.length ? r2(median(g.map((b) => b.lift))) : null, blocks: g.length, blockSize: g.length ? g[0].size : null,
      shown: surfaceShown(L, L.file && !L.file.error ? L.file : top.f), hidden: hiddenOf(L),
      opacity: L.effectiveOpacity != null ? L.effectiveOpacity : 1,
    };
  }
  /* режим наложения: что стоит чаще (слои и мелкие блоки вместе; спрятанные не в счёт). byTone — по полосам
     фона замера (тёмная, средняя, светлая), bySide — по сторонам границы SURFACE_DARK_Y: для рецепта */
  const tally = (pick, keys) => {
    const out = {};
    for (const k of keys) {
      const modes = {}; let n = 0;
      for (const L of all) { if (pick(L) !== k || L.surf.hidden) continue; modes[L.surf.blend] = (modes[L.surf.blend] || 0) + 1; n++; }
      const best = Object.entries(modes).sort((a, b) => b[1] - a[1])[0];
      out[k] = { mode: best ? best[0] : null, count: n, modes };
    }
    return out;
  };
  const byTone = tally((L) => L.surf.tone, ['dark', 'mid', 'light']);
  const bySide = tally((L) => L.surf.side, ['dark', 'light']);
  /* мелкие блоки — группами: тон и режим */
  const groups = new Map();
  for (const U of users) {
    const key = `${U.surf.tone || '?'}|${U.surf.blend}`; const e = groups.get(key);
    if (e) e.count++; else groups.set(key, { tone: U.surf.tone, blend: U.surf.blend, count: 1, el: U.el + (U.pseudo || ''), size: `${U.rect.w}×${U.rect.h}`, sd: U.surf.sd });
  }
  const st = ['dark', 'mid', 'light'].map((k) => surfaceBandOf({ bands, bands64 }, k));
  const status = st.some((b) => b.status === 'есть') ? 'есть' : st.some((b) => b.status === 'нет') ? 'нет' : 'не измерено';
  const statusNote = status === 'есть' ? ''
    : status === 'нет' ? `слои с плиткой найдены (${layers.length}), но на снимках её вклад меньше ${SURFACE_MIN_SD} — фактуры не видно: спрятана, гаснет в режиме наложения или выключена на этом экране`
    : error ? `проход «без фактуры» не сделан: ${error} — сила на странице не измерена, рецепт — по файлу и CSS`
    : 'ровных участков на снимках мало — силу на странице не измерить; рецепт — по файлу и CSS, смотреть вырезы глазами';
  const diagnosis = [];
  for (const k of ['dark', 'mid', 'light']) {
    const b = surfaceBandOf({ bands, bands64 }, k); const m = byTone[k].mode; if (b.status !== 'нет' || !m) continue;
    const adv = blendAdvice(m); const where = `на фоне «${TONE[k]}» (Y ${Math.round(b.y)})`;
    if (b.y < SURFACE_DARK_Y && m !== 'color-burn' && (adv.deadOnDark || m === 'normal')) diagnosis.push(`крупная фактура ${where} не видна: σ ${b.sd} при наложении ${m} — на тёмном оно гаснет → на тёмных полях класть color-burn (затемняет основу: прожилки проступают темнее фона)`);
    else if (b.y >= SURFACE_DARK_Y && (adv.deadOnLight || m === 'color-burn')) diagnosis.push(`крупная фактура ${where} не видна: σ ${b.sd} при наложении ${m} — на светлом оно гаснет → на светлых полях класть multiply`);
    else diagnosis.push(`крупная фактура ${where} не видна: σ ${b.sd} (наложение ${m})`);
  }
  if (tile.seam && tile.seam.max > SEAM_FAIL) diagnosis.push(`у плитки ${tile.file} виден стык: шов ${tile.seam.x} по ширине и ${tile.seam.y} по высоте (больше ${SEAM_FAIL} — края при повторе не сходятся); своя плитка surface-tile.mjs бесшовная`);
  return {
    status, statusNote, layers, users: [...groups.values()], usersCount: users.length, tile, bands, bands64, byTone, bySide, diagnosis, rejected: rejected || [],
    ...(error ? { hideError: error } : {}),
  };
}

/* где сейчас на экране помеченные слои: { k: { x, y, w, h, shown } } — для привязки участков снимка к слоям */
async function layerRectsNow(page, list) {
  const spec = list.map((L) => ({ k: L.k, attr: (L.mark || 'data-rw-tex') + (L.pseudo ? '-' + L.pseudo.slice(2) : '') }));
  const got = await page.evaluate((spec) => {
    const out = {};
    for (const L of spec) {
      const el = document.querySelector(`[${L.attr}="${L.k}"]`); if (!el) continue;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      out[L.k] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), shown: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 };
    }
    return out;
  }, spec).catch(() => null);
  return got || {};
}

/* ======================================================================
   5. Замер на странице
   ====================================================================== */

/**
 * Вклад одного слоя: снимок окна там, где слой виден, со слоем и без него (после mark: true).
 * σ разности на ровных плитках — зерно ли это (холст с шумом в альфе, видео с плёнкой) или гладкий
 * фон (3D-сцена, градиент). → { sd, lag1, tiles } по полосе с наибольшим вкладом или null.
 */
async function soloContribution(page, L, scrollY0 = 0) {
  if (L.position !== 'fixed' && !L.fixedBy) await scrollToY(page, Math.max(0, scrollY0 + L.rect.y - 40));
  await sleep(300);
  const a = await page.screenshot({ type: 'png' });
  await hideTextureLayers(page, [L]); /* CSP не дал вставить стиль — ошибка уходит вызывающему (в «почему»), а не «не зерно» */
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
  await sleep(120);
  const w = await page.screenshot({ type: 'png' });
  await showTextureLayers(page);
  const A = await lumaOf(a), W = await lumaOf(w);
  const c = summarize(grainTiles(A.Y, A.w, A.h, { Yw: W.Y }), { key: 'sdD', yKey: 'yw', lagKey: 'lagD' });
  const bands = ['dark', 'mid', 'light'].map((k) => c[k]).filter((b) => b.status !== 'не измерено');
  if (!bands.length) return null;
  const best = bands.sort((x, y) => y.sd - x.sd)[0];
  return { sd: best.sd, lag1: best.lag1, tiles: best.tiles };
}

/**
 * Замер фактуры на уже открытой (и прокрученной) странице. Опции:
 *   found — результат findTextureLayers с mark:true (иначе ищет сам), dir — куда класть снимки
 *   и файлы текстур, label, screens (4), boilMs (250), pause (900), files (true), withWithout (true), extras.
 * Снимки — окна (screenSegment), по screens экранам равномерно по высоте; на каждом: снимок,
 * ещё два через boilMs и +120 мс (кипение), затем снимок без найденных слоёв.
 * → Result (см. TEXTURE_API.md): grain / without / contribution / lift / boil / status / diagnosis.
 */
export async function measureTexture(page, opts = {}) {
  const { dir = null, label = 'page', screens = 4, boilMs = 250, pause = 900, files = true, withWithout = true, extras = false } = opts;
  needSharp();
  await forceInstantScroll(page);
  const found = opts.found && opts.found.marked ? opts.found : await findTextureLayers(page, { mark: true, extras: extras || !!(opts.found && opts.found.extras) });
  if (dir) ensureDir(dir);
  /* файлы текстур: разбор всех кадров; «плитка» без имени остаётся слоем, только если похожа на шум */
  const patterns = [];
  /* крупная фактура: слои-кандидаты, которых подтвердил разбор файла; rejected — кого не подтвердил (справочно) */
  const surfLayers = []; const surfRejected = [];
  /* бледная шум-плитка среди разобранных фонов (massandra.ru: 100×100, σ 2.81, lag1 0.12): слоем зерна она не
     считается (σ меньше 6), но зерно на странице — от неё. Единственный случай, когда «зерно есть» без слоя — правда */
  let paleNoise = null;
  if (files) {
    const cache = new Map(); const parsed = new Map();
    /* файл слоя: получить, разобрать (разбор одного адреса — один раз), сохранить в dir (save) */
    const readFile = async (L, save) => {
      const u = L.fileUrl;
      if (!u || L.kind === 'canvas') return;
      try {
        let got = cache.get(u);
        if (got === undefined) { got = await fetchLayerFile(page, u); cache.set(u, got); }
        if (!got) { L.file = { error: 'файл не получен' }; return; }
        const ext = /^data:image\/svg/i.test(u) || /<svg/i.test(got.buf.slice(0, 200).toString()) ? '.svg' : (() => { try { return path.extname(new URL(u, page.url()).pathname) || '.img'; } catch { return '.img'; } })();
        let fname = null;
        if (dir && save) { fname = path.join(dir, `${label}-layer${L.k}${ext}`); fs.writeFileSync(fname, got.buf); }
        let t = parsed.get(u);
        if (!t) { t = await analyzeTile(got.buf, { name: /^data:/i.test(u) ? `data-URI ${ext.slice(1)}` : path.basename(new URL(u, page.url()).pathname) }); parsed.set(u, t); }
        L.file = { ...t, via: got.via }; if (fname) L.file.saved = fname;
        return { buf: got.buf, ext };
      } catch (e) { L.file = { error: String(e.message || e).slice(0, 160) }; }
      return null;
    };
    /* картинка-подложка тегом img (не фон блока) чаще фотография или иллюстрация, чем плитка: за фактуру принимается, только
       если её разброс не собран в крупных пятнах. dndbeyond.com: приглушённая тёмная иллюстрация (σ 10.5, пятна крупнее 49 px
       0.76) по файлу проходит у всех версий; на странице она вышла «есть», когда сила стала считаться по участкам под ней */
    const imgBlob = (L) => (L.kind === 'img' || L.kind === 'picture') && !!(L.file && !L.file.error && L.file.surfaceLike && L.file.frames[0].feat && L.file.frames[0].feat.low > SURFACE.imgLowMax);
    const imgBlobWhy = (L) => `картинка-подложка тегом img, а её разброс — крупные пятна (доля крупнее 49 px ${L.file.frames[0].feat.low} при пороге ${SURFACE.imgLowMax}) — приглушённая фотография или иллюстрация, не плитка`;
    const isSurface = (L) => !!(L.file && !L.file.error && L.file.surfaceLike && (L.kind === 'background' || L.kind === 'img' || L.kind === 'picture')) && !imgBlob(L);
    /* файл разобран, шумом и крупной фактурой не признан, а пиксели в нём связаны — фотография, рисунок, градиент */
    /* мягкое зерно (размытый шум: соседи связаны, рисунка нет) картинкой не считается — слой с ним остаётся зерном */
    const pictureLike = (t) => { if (!t || t.error || t.noiseLike || t.surfaceLike) return false; const f0 = t.frames[0]; if (softGrain(f0.feat)) return false; return Math.min(f0.lag1, f0.lag1v) >= SURFACE.lagMin || !!(f0.feat && f0.feat.fine <= SURFACE.fineSure); };
    for (const L of found.layers) await readFile(L, true);
    for (let i = found.layers.length - 1; i >= 0; i--) {
      const L = found.layers[i];
      /* файл слоя — крупная фактура (мятая бумага, камень, холст): это не зерно, у него свой замер и свой рецепт.
         Раньше такой слой или считался зерном (по имени texture, paper), или отбрасывался как «не шум» */
      if (isSurface(L)) { L.surface = true; continue; }
      /* слово texture, paper, film, dust, grain в пути файла — только подсказка, где искать: решает разбор. Картинка
         (соседние пиксели связаны, как у фотографии и рисунка), которую разбор не признал ни шумом, ни крупной
         фактурой, слоем зерна не считается — раньше любой фон с таким именем шёл слоем зерна, и замер «без слоя»
         прятал фотографию или гранж-накладку (dinosaurbarbque.com: 14 «слоёв» texture-black.png) */
      if (!L.maybe && L.reason.length === 1 && L.reason[0] === 'имя' && pictureLike(L.file)) {
        patterns.push({ el: L.el, urls: L.urls, why: `имя файла похоже на фактуру, но по разбору это картинка, а не зерно и не крупная фактура (${(L.file.surfaceWhy || []).slice(0, 2).join('; ') || 'пиксели связаны, как у рисунка'})` });
        found.layers.splice(i, 1); continue;
      }
      if (!L.maybe) continue;
      if (L.file && !L.file.error) {
        if (!L.file.noiseLike) { patterns.push({ el: L.el, urls: L.urls, why: imgBlob(L) ? imgBlobWhy(L) : 'по разбору не шум (узор или картинка)' }); if (imgBlob(L) && surfRejected.length < 6) surfRejected.push({ el: L.el + (L.pseudo || ''), file: L.file.file, why: imgBlobWhy(L) }); found.layers.splice(i, 1); }
        continue;
      }
      /* файла нет (холст, видео) или он не получен — решает разность снимков со слоем и без него одного */
      let soloErr = null;
      const solo = await soloContribution(page, L, found.scrollY || 0).catch((e) => { soloErr = String(e && e.message ? e.message : e).slice(0, 160); return null; });
      L.solo = solo;
      if (!solo || solo.sd < GRAIN_MIN_SD) {
        patterns.push({ el: L.el, urls: L.urls, why: solo ? `по разности снимков со слоем и без — не зерно (σ вклада ${solo.sd} на ${solo.tiles} ровных плитках)` : `${L.file && L.file.error ? L.file.error + '; ' : ''}разность снимков не измерена (${soloErr || 'нет ровных участков'})` });
        found.layers.splice(i, 1);
      }
    }
    /* кандидаты в крупную фактуру (картинка в фоне большого блока): файл сохраняется, только если подтверждён —
       фотографии первого экрана в папке прогона не нужны */
    for (const C of found.surfaceCands || []) {
      const got = await readFile(C, false);
      if (isSurface(C)) {
        C.surface = true; surfLayers.push(C);
        if (dir && got) { const fname = path.join(dir, `${label}-layer${C.k}${got.ext}`); fs.writeFileSync(fname, got.buf); C.file.saved = fname; }
      } else if (surfRejected.length < 6) surfRejected.push({ el: C.el + (C.pseudo || ''), file: C.file && !C.file.error ? C.file.file : null, why: C.file && C.file.error ? C.file.error : C.file ? (imgBlob(C) ? imgBlobWhy(C) : (C.file.surfaceWhy || []).slice(0, 2).join('; ')) : 'файла нет' });
    }
    for (const t of parsed.values()) { if (paleNoiseTile(t)) { const q = t.frames[0]; paleNoise = { file: t.file, width: t.width, height: t.height, sd: q.sdOver, lag1: q.lag1, lag1v: q.lag1v }; break; } }
  }
  /* слои зерна — как раньше; слои крупной фактуры — отдельным списком (found.layers не меняется: его читает discover) */
  const layers = found.layers.filter((L) => !L.surface);
  surfLayers.unshift(...found.layers.filter((L) => L.surface));
  for (const L of surfLayers) {
    L.via = L.kind !== 'background' ? 'картинка' : L.hide === 'background' ? 'фон блока' : 'слой';
    /* у крупной фактуры из фона убирается только картинка: цвет поля, тень и рамка блока остаются */
    if (L.kind === 'background' && (L.hideUrls || []).length) L.hide = 'background';
  }
  /* та же плитка на мелких блоках (карточки, плашки) — пометить, чтобы проход «без крупной фактуры» убрал её везде */
  let surfUsers = [];
  if (surfLayers.length) {
    const absOf = (u) => { if (/^data:/i.test(u)) return u; try { return new URL(u, page.url()).href; } catch { return u; } };
    const urls = [...new Set(surfLayers.map((L) => absOf(L.fileUrl)))];
    const from = 1 + Math.max(-1, ...found.layers.map((L) => L.k), ...(found.surfaceCands || []).map((L) => L.k));
    const got = await page.evaluate(`(${SURFACE_USERS_FN})(${JSON.stringify({ urls, from })})`).catch(() => null);
    surfUsers = got ? got.users : [];
    for (const U of surfUsers) { U.scrollY0 = got.scrollY; U.via = 'фон блока'; }
  }
  const surfHide = surfLayers.concat(surfUsers);

  const vh = found.vh; const vpNow = page.viewport() || { width: found.vw, height: vh, deviceScaleFactor: found.dpr };
  const total = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
  const ys = segmentPositions(total, vh, { step: 1, maxShots: Math.max(1, Number(screens) || 4) });
  const allTiles = []; const perScreen = []; const surfTiles = []; const surfRects = [];
  let hasLayers = layers.length > 0 && withWithout;
  let hasSurf = surfHide.length > 0;
  /* как прятался слой: 'style' или 'adopted' (строгий CSP); не спрятался — прохода «без слоя» нет */
  const hideInfo = { via: null }; let hideError = null, surfError = null;
  const settleFrame = async () => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {}); await sleep(120); };
  for (let i = 0; i < ys.length; i++) {
    const seg = await screenSegment(page, ys[i], { pause, settle: 800, mediaTimeout: 4000 });
    const a = seg.buffer;
    await sleep(boilMs); const b = await page.screenshot({ type: 'png' });
    await sleep(120); const c = await page.screenshot({ type: 'png' });
    /* без крупной фактуры (зерно, если есть, остаётся): на этом снимке меряется зерно — иначе прожилки и заломы
       плитки сошли бы за него — и от него считается вклад самой фактуры */
    let nosurf = null;
    surfRects.push(hasSurf ? await layerRectsNow(page, surfHide) : null);
    if (hasSurf) {
      try { await hideTextureLayers(page, surfHide, hideInfo); } catch (e) { surfError = String(e && e.message ? e.message : e).slice(0, 160); }
      if (surfError) { await showTextureLayers(page).catch(() => {}); hasSurf = false; }
      else { await settleFrame(); nosurf = await page.screenshot({ type: 'png' }); await showTextureLayers(page); }
    }
    let wbuf = null;
    if (hasLayers) {
      try { await hideTextureLayers(page, hasSurf ? layers.concat(surfHide) : layers, hideInfo); } catch (e) { hideError = String(e && e.message ? e.message : e).slice(0, 160); }
      if (hideError) {
        /* снимок «без слоя» был бы снимком со слоем: вклад вышел бы 0, а статус — ложное «нет» */
        await showTextureLayers(page).catch(() => {});
        hasLayers = false; /* итог — по снимкам со слоем, без вклада; причина — в diagnosis */
      } else {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
        await sleep(120);
        wbuf = await page.screenshot({ type: 'png' });
        await showTextureLayers(page);
      }
    }
    /* есть и зерно, и крупная фактура: её вклад — между снимками без зерна (с ней и без неё), чтобы кипящее
       зерно не попало в разность */
    let surfOnly = null;
    if (hasSurf && nosurf && wbuf) {
      try { await hideTextureLayers(page, layers, hideInfo); await settleFrame(); surfOnly = await page.screenshot({ type: 'png' }); } catch { surfOnly = null; }
      await showTextureLayers(page).catch(() => {});
    }
    const shots = {};
    if (dir) {
      const put = (buf, tag) => { if (!buf) return null; const f = path.join(dir, `${label}-s${i}-${tag}.png`); fs.writeFileSync(f, buf); return f; };
      shots.a = put(a, 'a'); shots.b = put(b, 'b'); shots.c = put(c, 'c'); shots.without = put(wbuf, 'without');
      if (nosurf) shots.nosurface = put(nosurf, 'nosurface');
    }
    const A = await lumaOf(a); const B = await lumaOf(b); const C = await lumaOf(c); const Wl = wbuf ? await lumaOf(wbuf) : null;
    const Ns = nosurf ? await lumaOf(nosurf) : null; const So = surfOnly ? await lumaOf(surfOnly) : null;
    /* зерно: на снимке без крупной фактуры. Ровность плиток решает снимок без слоёв зерна, а если их нет —
       тот же снимок без фактуры (порог абсолютный, как раньше у слоёв «по имени»): относительный порог,
       когда ровных фонов мало, принимает за ровные плитки фотографии (σ 20–34 вместо зерна) */
    const tiles = grainTiles(Ns ? Ns.Y : A.Y, A.w, A.h, { Y2: B.Y, Y3: C.Y, Yw: Wl ? Wl.Y : Ns ? Ns.Y : null, Yf: A.Y });
    for (const t of tiles) t.s = i;
    allTiles.push(...tiles);
    const bb = bandsAll(tiles, !!Wl);
    perScreen.push({ y: ys[i], scrollY: seg.scrollY, with: bb.grain, without: bb.without, contribution: bb.contribution, lift: bb.lift, shots });
    if (Ns) {
      const st = So && Wl ? grainTiles(So.Y, A.w, A.h, { Yw: Wl.Y }) : grainTiles(A.Y, A.w, A.h, { Yw: Ns.Y });
      for (const t of st) { t.s = i; surfTiles.push(t); }
    }
  }
  allTiles.total = perScreen.reduce((s, p) => s + (p.with.considered || 0), 0);
  const B = bandsAll(allTiles, hasLayers);
  const res = {
    url: page.url(), label, viewport: { name: page.vpName || vpNow.name || `${vpNow.width}x${vpNow.height}@${vpNow.deviceScaleFactor || 1}`, width: vpNow.width, height: vpNow.height, dpr: found.dpr },
    takenAt: new Date().toISOString(), page: { vw: found.vw, vh: found.vh, dpr: found.dpr, bodyBg: found.bodyBg },
    layers, patterns, svgNoise: found.svgNoise, bodyAfterUsed: found.bodyAfterUsed, bodyBeforeUsed: found.bodyBeforeUsed, unreadableSheets: found.unreadableSheets,
    ...(found.extras ? { extras: found.extras } : {}),
    screens: perScreen, grain: B.grain, without: B.without, contribution: B.contribution, lift: B.lift,
    /* как прятался слой для прохода «без слоя»: 'style' или 'adopted' (строгий CSP); hideError — не спрятался */
    ...(hideInfo.via ? { hideVia: hideInfo.via } : {}), ...(hideError ? { hideError } : {}),
  };
  /* крупная фактура: слои, плитка, сила на снимках по полосам фона, режимы наложения по тону секции */
  res.surface = surfaceResult({ layers: surfLayers, users: surfUsers, tiles: surfTiles, screens: surfRects.map((rects) => ({ rects })), rejected: surfRejected, error: surfError, measured: files });
  /* кипение: «да / нет» — по снимкам; частота — из файла или @keyframes */
  const src = boilSource(layers);
  const gAll = B.grain.all; const flick = gAll.flicker; const sdAll = gAll.sd;
  let boils = null, ratio = null;
  if (gAll.status !== 'не измерено' && sdAll >= GRAIN_MIN_SD && flick != null) { ratio = r2(flick / sdAll); boils = ratio >= 0.5 ? true : ratio < 0.25 ? false : 'слабо'; }
  else if (src && gAll.status === 'есть') boils = true;
  res.boil = { boils, flicker: flick, sd: sdAll, ratio, source: src ? src.source : boils != null ? 'снимки' : null, frames: src ? src.frames : null, frameMs: src ? src.frameMs : null, cycleMs: src ? src.cycleMs : null, smooth: src ? !!src.smooth : null, of: src ? src.of : null };
  const bands = ['dark', 'mid', 'light'].map((k) => B.grain[k]);
  res.status = bands.some((b) => b.status === 'есть') ? 'есть' : bands.some((b) => b.status === 'нет') ? 'нет' : 'не измерено';
  res.statusNote = res.status === 'не измерено' ? `ровных плиток мало (тёмных ${B.grain.dark.tiles}, средних ${B.grain.mid.tiles}, светлых ${B.grain.light.tiles}; нужно ≥ ${MIN_TILES} в полосе) — это «не измерено», а не «зерна нет»` : '';
  /* слой найден и снят проход «без слоя» — решает вклад слоя: σ на снимке могут давать
     картины, градиенты и сжатие картинок, а не зерно (на «ХОЛСТе» σ 1.63 в средних тонах при вкладе 0.32) */
  if (hasLayers && res.status === 'есть' && B.contribution) {
    const cb = ['dark', 'mid', 'light'].map((k) => B.contribution[k]).filter((b) => b.status !== 'не измерено');
    if (cb.length && cb.every((b) => b.sd < GRAIN_MIN_SD)) {
      const names = { dark: 'тёмный', mid: 'средний', light: 'светлый' };
      const from = ['dark', 'mid', 'light'].filter((k) => B.grain[k].status === 'есть').map((k) => `${names[k]} σ ${B.grain[k].sd}`).join(', ');
      res.status = 'нет';
      res.statusNote = `слой найден, но его вклад «со слоем − без» меньше ${GRAIN_MIN_SD} на всех фонах; σ на снимке (${from}) дают картинки и градиенты, а не зерно`;
    }
  }
  /* слоёв зерна нет вовсе — «есть» не выдаётся: σ на «ровных» участках дают сами картинки и фоны (шум матрицы в
     тёмных фотографиях, сжатие), а не зерно слоем. Без слоя ровность решает относительный порог (плитка с σ до 60
     годится), и на страницах с фотографиями выходило «зерно есть» с рецептом слоя шума: dinosaurbarbque.com,
     famousdaves.com, mcgillins.com, ebbitt.com — после того как «слои по имени», признанные картинками, перестали
     считаться слоями; на наборе калибровки так было у 21 замера из 41 и до того, при истине «есть» у одного.
     Исключение — бледная шум-плитка в фоне блока (paleNoise): зерно от неё настоящее, хотя слоем она не считается.
     Числа σ остаются в замере справочно; inPictures — признак для рецепта и вывода */
  if (files && !layers.length && res.status === 'есть') {
    if (paleNoise) res.paleNoise = paleNoise;
    else {
      const names = { dark: 'тёмный', mid: 'средний', light: 'светлый' };
      const from = ['dark', 'mid', 'light'].filter((k) => B.grain[k].status === 'есть').map((k) => `${names[k]} σ ${B.grain[k].sd}`).join(', ');
      res.status = 'нет'; res.inPictures = true;
      res.statusNote = `слоя зерна нет; σ на снимке (${from}) — шум в самих картинках и фонах, а не зерно слоем: повторять нечем и незачем`;
    }
  }
  res.diagnosis = diagnose(res);
  if (dir) {
    const pick = (f) => allTiles.filter((t) => f(t.y_mean)).sort((x, y) => y.sd - x.sd)[Math.floor(allTiles.filter((t) => f(t.y_mean)).length / 2)];
    for (const [f, tag] of [[(y) => y < 60, 'dark'], [(y) => y > 190, 'light'], [(y) => y >= 60 && y <= 190, 'mid']]) {
      const t = pick(f); if (!t) continue;
      const shot = perScreen[t.s] && perScreen[t.s].shots.a; if (!shot) continue;
      try { res[`crop_${tag}`] = await cropTile(shot, t, path.join(dir, `${label}-crop-${tag}.png`)); } catch { /* нет выреза */ }
    }
  }
  return res;
}

/**
 * Открыть адрес на экране и снять фактуру. { viewport = 'desktop' (имя или объект), out, label,
 * screens = 4, browser = null (свой браузер закрывается в finally), settle = 3000, extras }.
 */
export async function textureOnUrl(url, { viewport = 'desktop', out = null, label = null, screens = 4, browser = null, settle = 3000, extras = false } = {}) {
  const rv = typeof viewport === 'object' ? [viewport.name || 'custom', viewport] : resolveViewport(viewport);
  if (!rv) throw new Error(`Неизвестный экран ${viewport}`);
  const [vpName, vp] = rv;
  const own = !browser; const br = browser || await launch();
  let page;
  try {
    page = await openPage(br, url, vp, { settle });
    page.vpName = vpName;
    await forceInstantScroll(page);
    await scrollThrough(page, { pause: 250 }); /* ленивые фоны (Tilda t-bgimg) грузятся только при прокрутке */
    await sleep(600);
    const lbl = label || `${slugFromUrl(url).slice(0, 40)}-${vpName}`;
    const res = await measureTexture(page, { dir: out, label: lbl, screens, extras });
    res.url = url;
    res.viewport.name = vpName;
    if (page.retries) res.retries = page.retries;
    return res;
  } finally {
    if (page) await page.close().catch(() => {});
    if (own) await br.close().catch(() => {});
  }
}

/* ======================================================================
   6. Рецепт, токены, шаблон, markdown
   ====================================================================== */

const mainLayer = (res) => (res.layers || []).slice().sort((a, b) => (b.coversViewport - a.coversViewport) || ((b.file && !b.file.error) - (a.file && !a.file.error)) || (b.rect.w * b.rect.h - a.rect.w * a.rect.h))[0] || null;
const minWidthOf = (conds) => { let best = null; for (const c of conds || []) for (const m of String(c).matchAll(/min-width:\s*([\d.]+)px/g)) best = Math.max(best || 0, Number(m[1])); return best; };

/**
 * Рецепт повторения фактуры своей плиткой по результатам экранов (один Result или массив).
 * → { present, none, minWidth, minWidthNote, sd, bandsSd, opacity, tileSd, px, size, rendering, blend,
 *     blendNote, frames, frameMs, boil, boilSource, lift, tileCmd, notes[], base }
 */
export function recipeFrom(results, { tileSd = TILE_SD } = {}) {
  const list = (Array.isArray(results) ? results : [results]).filter(Boolean);
  const present = {}; for (const r of list) present[r.viewport.name] = r.status === 'есть' ? true : r.status === 'нет' ? false : null;
  const withGrain = list.filter((r) => r.status === 'есть');
  const base = withGrain.filter((r) => r.viewport.dpr === 1).sort((a, b) => b.viewport.width - a.viewport.width)[0] || withGrain.sort((a, b) => a.viewport.dpr - b.viewport.dpr)[0] || null;
  const notes = [];
  const rec = { present, none: !base, tileSd, size: 256, px: 1, rendering: 'auto', blend: 'normal', blendNote: '', opacity: null, sd: null, bandsSd: null, frames: 1, frameMs: 100, boil: false, boilSource: null, lift: null, minWidth: 0, minWidthNote: '', notes, base: base ? base.viewport.name : null };
  /* крупная фактура — свой рецепт (null, если замер старый и её не снимал); зерну он не мешает */
  const surf = surfaceRecipe(list); if (surf) rec.surface = surf;
  if (!base) { notes.push(list.some((r) => r.status === 'не измерено') ? 'зерно не измерено (мало ровных участков) — повторять нечего доказать; смотреть вырезы 1:1 глазами' : `у донора зерна нет ни на одном экране — слой не нужен${list.some((r) => r.inPictures) ? ' (σ на снимке дают сами картинки — шум фотографий и сжатие, слоя зерна у донора нет)' : ''}`); return rec; }
  const L = mainLayer(base);
  const bandsSd = {}; for (const k of ['dark', 'mid', 'light']) { const b = grainBand(base, k); bandsSd[k] = b.status === 'не измерено' ? null : b.sd; }
  rec.bandsSd = bandsSd;
  const measured = Object.values(bandsSd).filter((v) => v != null && v >= GRAIN_MIN_SD);
  rec.sd = r2(median(measured.length ? measured : Object.values(bandsSd).filter((v) => v != null)));
  const mode = L ? layerBlend(L) : 'normal'; const adv = blendAdvice(mode);
  if (!L) { notes.push(base.paleNoise ? `слоя зерна у донора нет, зерно даёт бледная шум-плитка в фоне блока (${base.paleNoise.file}, σ ${base.paleNoise.sd}) — у себя повторяется слоем зерна той же силы` : 'слой не найден, зерно — в самих картинках/фонах: своим слоем его не повторить один в один'); }
  if (adv.even) { rec.blend = mode === 'hard-light' ? 'hard-light' : 'normal'; rec.opacity = r3(rec.sd / tileSd); rec.blendNote = `${mode} у донора → ${rec.blend}; opacity = σ ${rec.sd} / σ плитки ${tileSd}`; }
  else {
    rec.blend = mode;
    const byFile = L && L.file && !L.file.error ? r3(L.effectiveOpacity * (L.file.frames[0].sdOver || L.file.frames[0].sd) / tileSd) : null;
    rec.opacity = byFile || r3((bandsSd.light || rec.sd) / tileSd);
    rec.blendNote = `у донора ${adv.text}; повторять тем же режимом, стартовая opacity ${rec.opacity} — подогнать по compare`;
  }
  /* зерно: размер в CSS px — из файла (ячейка × масштаб фона), иначе из lag1 снимка */
  const f = L && L.file && !L.file.error ? L.file : null;
  if (f) {
    const cellFile = Math.max(1, Math.round(1 / (1 - Math.max(0, Math.min(0.9, f.frames[0].lag1 || 0)))));
    const bs = /^([\d.]+)px/.exec(L.backgroundSize || ''); const scale = bs ? Number(bs[1]) / f.width : 1;
    rec.px = Math.max(1, Math.round(cellFile * scale));
  } else {
    const lag = grainBand(base, 'all').lag1 || 0; const pDev = 1 / (1 - Math.max(0, Math.min(0.9, lag)));
    rec.px = Math.max(1, Math.round(pDev / (base.viewport.dpr || 1)));
  }
  rec.rendering = L && L.imageRendering && L.imageRendering !== 'auto' ? L.imageRendering : 'auto';
  const bo = base.boil || {};
  rec.boil = bo.boils === true || bo.boils === 'слабо';
  rec.boilSource = bo.source;
  if (rec.boil && bo.frames) { rec.frames = bo.frames; rec.frameMs = bo.frameMs || 100; }
  else if (rec.boil) { rec.frames = 4; rec.frameMs = 100; notes.push('кипит, но частоту не из чего взять (нет файла и @keyframes с steps) — 4 × 100 мс по умолчанию, проверить глазами'); }
  else { rec.frames = 1; rec.frameMs = 100; }
  rec.lift = base.lift ? base.lift.dark : null;
  /* с какой ширины: @media у слоя, иначе по экранам с зерном и без */
  const mw = L ? minWidthOf(L.mediaRules) : null;
  const sorted = list.slice().sort((a, b) => a.viewport.width - b.viewport.width);
  const lowestWith = sorted.find((r) => present[r.viewport.name] === true);
  const widestWithout = sorted.filter((r) => present[r.viewport.name] === false && r.viewport.width < (lowestWith ? lowestWith.viewport.width : Infinity)).pop();
  if (mw) { rec.minWidth = mw; rec.minWidthNote = `из @media у слоя (${L.mediaRules.find((c) => /min-width/.test(c))})`; }
  else if (widestWithout && lowestWith) { rec.minWidth = lowestWith.viewport.width; rec.minWidthNote = `по экранам: на ${widestWithout.viewport.width} px зерна нет, на ${lowestWith.viewport.width} px есть — точная граница между ними`; }
  else rec.minWidthNote = 'зерно на всех снятых экранах';
  if (list.some((r) => r.viewport.dpr !== base.viewport.dpr && r.status === 'есть')) notes.push(`на экранах с DPR ≠ ${base.viewport.dpr} сила другая (сглаживание плитки): сравнивать донора и сборку только при одинаковом DPR`);
  rec.tileCmd = `node grain-tile.mjs --out <папка сайта>${rec.px > 1 ? ` --px ${rec.px}` : ''}   (σ плитки ${tileSd}; чужой файл не переносить)`;
  if (L && L.svg) notes.push('у донора шум из feTurbulence: своя плитка повторяет его силу числом, форма зерна другая — сверять compare');
  return rec;
}

/**
 * Рецепт крупной фактуры по результатам экранов: чем повторить её своей плиткой (surface-tile.mjs) и как
 * положить (templates/surface.css). null — у замеров нет поля surface (texture.json до 01.10.2026).
 * → { present, none, base, measured, tile { file, width, height, bytes, mean, sd, lag1, chroma, tint, seam },
 *     shown { size, repeat, px, stretched }, via, size — период показа своей плитки, px,
 *     blend { dark, mid, light } — наложение у донора по тону секции, use { light, dark } — что класть у себя,
 *     opacity, tileMean, tileSd — цель для своей плитки, sd { dark, mid, light } — σ на снимках, lift,
 *     sections[], small[], smallCount, off[], minWidth, minWidthNote, reducedMotion, tileCmd, tileName, notes[] }
 */
export function surfaceRecipe(results) {
  const list = (Array.isArray(results) ? results : [results]).filter((r) => r && r.surface);
  if (!list.length) return null;
  const present = {}; for (const r of list) present[r.viewport.name] = r.surface.status === 'есть' ? true : r.surface.status === 'нет' ? false : null;
  const cand = list.filter((r) => (r.surface.layers || []).length && r.surface.status !== 'нет');
  const seen = cand.filter((r) => r.surface.status === 'есть');
  const base = seen.filter((r) => r.viewport.dpr === 1).sort((a, b) => b.viewport.width - a.viewport.width)[0] || seen.sort((a, b) => a.viewport.dpr - b.viewport.dpr)[0] || cand[0] || null;
  const notes = [];
  const rec = { present, none: !base, base: base ? base.viewport.name : null, notes };
  if (!base) { notes.push(list.some((r) => (r.surface.layers || []).length) ? 'слои с плиткой есть, но на снимках её не видно — повторять нечего' : 'крупной фактуры нет — фон ровный (или с зерном, см. выше)'); return rec; }
  const S = base.surface, T = S.tile;
  rec.measured = S.status === 'есть';
  rec.tile = { file: T.file, width: T.width, height: T.height, bytes: T.bytes, mean: T.mean, sd: T.sd, lag1: T.lag1, chroma: T.chroma, tint: T.tint, seam: T.seam ? T.seam.max : null, ...(T.alpha != null ? { alpha: T.alpha } : {}) };
  /* вид плитки: какой из видов surface-tile.mjs ближе к рисунку донора. Замер старой версии (вида в нём нет) —
     «не определено» с подсказкой перемерить */
  rec.kind = T.kind || { kind: null, conf: 0, word: 'не определено', basis: 'замер сделан версией до 02.10.2026 — вид не снимался; перемерить донора или выбрать глазами', alt: ['paper', 'stone'], guess: 'paper' };
  const vis = S.layers.filter((L) => !L.surf.hidden);
  const main = (vis.length ? vis : S.layers).slice().sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0];
  rec.shown = main.surf.shown; rec.via = main.surf.via;
  /* период показа своей плитки: как у донора; картинка, растянутая на блок, плиткой не была — берём 1024 */
  rec.size = rec.shown.px && !rec.shown.stretched ? Math.max(256, Math.min(2048, rec.shown.px)) : 1024;
  /* наложение у донора: на светлых полях (Y от SURFACE_DARK_Y) и на тёмных */
  const side = S.bySide || { light: { mode: S.byTone.light.mode }, dark: { mode: S.byTone.dark.mode } };
  rec.blend = { light: side.light.mode, dark: side.dark.mode };
  /* что класть у себя: на светлых и цветных полях — умножение на цвет поля (обычный слой донора с непрозрачной
     светлой плиткой на белом выглядит так же, а на цветном поле умножение цвет сохраняет); на тёмных — как у
     донора, а если у донора там фактуры нет — color-burn: умножение на тёмном гаснет */
  const soft = (m) => !m || ['normal', 'multiply', 'darken'].includes(m);
  rec.use = { light: soft(rec.blend.light) ? 'multiply' : rec.blend.light, dark: rec.blend.dark && rec.blend.dark !== 'normal' ? rec.blend.dark : 'color-burn' };
  /* прозрачность слоя донора уходит в силу своей плитки: в фоне блока картинку не сделать прозрачнее, чем блок */
  const ops = vis.filter((L) => L.surf.via !== 'фон блока').map((L) => L.surf.opacity).filter((v) => v != null);
  rec.opacity = ops.length ? r2(median(ops)) : 1;
  rec.tileMean = r2(255 - (255 - T.mean) * rec.opacity); rec.tileSd = r2(T.sd * rec.opacity);
  rec.sd = {}; rec.lift = {};
  for (const k of ['dark', 'mid', 'light']) { const b = surfaceBandOf(S, k); rec.sd[k] = b.status === 'не измерено' ? null : b.sd; rec.lift[k] = b.status === 'не измерено' ? null : b.lift; }
  rec.sections = S.layers.map((L) => ({ el: L.el + (L.pseudo || ''), via: L.surf.via, tone: L.surf.tone, y: L.surf.y, blend: L.surf.blend, opacity: L.surf.opacity, size: L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`, sd: L.surf.sd, lift: L.surf.lift, hidden: L.surf.hidden }));
  rec.small = S.users || []; rec.smallCount = S.usersCount || 0;
  /* где выключена: правила @media у слоёв, которые её прячут или убирают картинку */
  const off = new Map();
  for (const L of S.layers) for (const m of L.mediaOff || []) { const key = `${m.cond}|${m.how}`; const e = off.get(key) || { cond: m.cond, how: m.how, els: [] }; e.els.push(L.el + (L.pseudo || '')); off.set(key, e); }
  rec.off = [...off.values()].map((e) => ({ cond: e.cond, how: e.how, layers: e.els.length, of: S.layers.length, el: e.els.length === 1 && S.layers.length > 1 ? e.els[0] : null }));
  const printed = new Set(); for (const L of S.layers) if ((L.mediaOff || []).some((m) => /print/.test(m.cond))) printed.add(L.k);
  rec.print = !printed.size ? 'остаётся' : printed.size === S.layers.length ? 'выключена' : `выключена у ${printed.size} из ${S.layers.length} секций`;
  rec.reducedMotion = rec.off.some((e) => /prefers-reduced-motion/.test(e.cond)) ? 'выключена' : 'остаётся (она неподвижна)';
  /* с какой ширины: правило max-width у всех слоёв, иначе по экранам с фактурой и без */
  const maxW = rec.off.filter((e) => e.layers === e.of).map((e) => /max-width:\s*([\d.]+)px/.exec(e.cond)).filter(Boolean).map((m) => Number(m[1]));
  const sorted = list.slice().sort((a, b) => a.viewport.width - b.viewport.width);
  const lowestWith = sorted.find((r) => present[r.viewport.name] === true);
  const widestWithout = sorted.filter((r) => present[r.viewport.name] === false && r.viewport.width < (lowestWith ? lowestWith.viewport.width : Infinity)).pop();
  rec.minWidth = 0;
  if (maxW.length) { rec.minWidth = Math.max(...maxW) + 1; rec.minWidthNote = `из @media у слоёв: до ${Math.max(...maxW)} px выключена`; }
  else if (widestWithout && lowestWith) { rec.minWidth = lowestWith.viewport.width; rec.minWidthNote = `по экранам: на ${widestWithout.viewport.width} px фактуры нет, на ${lowestWith.viewport.width} px есть — точная граница между ними`; }
  else rec.minWidthNote = list.length > 1 ? 'на всех снятых экранах' : `снят один экран (${base.viewport.name}) — телефон проверить отдельно`;
  const kd = rec.kind, kindArg = kd.kind || kd.guess || 'paper';
  /* зернистая бумага однородна: крупного рисунка, который повторялся бы, в ней нет, а вес растёт с площадью (2048 px при
     σ 4.6 — 296 КБ против 71 при 1024 px). Период больше PULP_SIZE_MAX ей не назначается */
  const sizeAsked = rec.size; if (kindArg === 'pulp' && rec.size > PULP_SIZE_MAX) rec.size = PULP_SIZE_MAX;
  const TF = T.feat || null;
  rec.thread = kindArg === 'canvas' && TF && TF.per && TF.per.x.lag >= 2 && TF.per.y.lag >= 2 ? Math.max(3, Math.round((TF.per.x.lag + TF.per.y.lag) / 2)) : null;   /* 3 px — наименьший шаг у surface-tile.mjs */
  /* ткань с мелким шагом тоже однородна, а сжимается плохо (1024 px при шаге 6 px — 147 КБ против 15 при 512 px) */
  if (rec.thread != null && rec.thread < 16 && rec.size > FINE_WEAVE_SIZE_MAX) rec.size = FINE_WEAVE_SIZE_MAX;
  /* шаг переплетения ткани (повтор рисунка по осям) и направление волокон зернистой бумаги — в рецепт и в команду: без
     шага своя ткань выходила корзинкой с шагом 32 px при шаге 3 и 6 px у доноров (acehotel.com, frauncestavern.com) */
  rec.dir = kindArg === 'pulp' && TF && TF.coh >= FIBRE_COH && TF.dir != null ? TF.dir : null;
  if (rec.thread != null) notes.push(`шаг переплетения у донора — ${TF.per.x.lag} px по ширине и ${TF.per.y.lag} px по высоте (в пикселях файла): своя ткань делается с тем же шагом (--thread ${rec.thread}); по умолчанию у неё шаг 32 px — крупная корзинка`);
  if (rec.dir != null) notes.push(`волокна у донора уложены ${rec.dir <= 20 || rec.dir >= 160 ? 'вдоль ширины' : Math.abs(rec.dir - 90) <= 20 ? 'вдоль высоты' : `под углом ${rec.dir}°`} (направленность ${TF.coh}): своя зернистая бумага делается с тем же направлением (--dir ${rec.dir})`);
  rec.tileName = `surface-${kindArg}-${rec.size}.webp`;
  rec.tileCmd = `node surface-tile.mjs --out <папка сайта> --kind ${kindArg} --size ${rec.size} --mean ${rec.tileMean} --sd ${rec.tileSd}${rec.thread != null ? ` --thread ${rec.thread}` : ''}${rec.dir != null ? ` --dir ${rec.dir}` : ''}   (${kd.kind ? `вид ${kd.kind} — по рисунку плитки донора, уверенность ${kd.conf}` : `вид не определён: выбрать глазами по вырезке 1:1 — ${(kd.alt || ['paper', 'stone']).join(' или ')}`}; чужой файл не переносить)`;
  if (!kd.kind) notes.push(`вид плитки не определён (${kd.basis}) — сделать обе: --kind ${(kd.alt || ['paper', 'stone']).join(' и --kind ')}, положить вырезки 1:1 рядом с вырезкой донора и выбрать глазами`);
  else if (kd.conf < KIND.sure) notes.push(`вид плитки ${kd.kind} определён со средней уверенностью (${kd.conf}) — сверить глазами вырезку 1:1 своей плитки с вырезкой донора${kd.alt ? `; запасной вид — ${kd.alt.find((k) => k !== kd.kind) || kd.alt[0]}` : ''}`);
  if (!rec.measured) notes.push(S.statusNote);
  if (rec.blend.light === 'normal' && rec.via !== 'фон блока') notes.push('у донора на светлых секциях плитка лежит обычным слоем и сама служит фоном; у себя — умножением на цвет поля: на белом вид тот же, на цветном поле цвет сохраняется');
  if (!rec.blend.light) notes.push('на светлых полях у донора фактуры нет (или её там не измерить) — multiply для них взят по правилу, а не с донора');
  if (!rec.blend.dark) notes.push('на тёмных полях у донора фактуры нет (или её там не измерить) — color-burn для них взят по правилу, а не с донора');
  else if (rec.blend.dark === 'normal') notes.push('на тёмных полях у донора плитка лежит обычным слоем — светлая плитка закрывает тёмный цвет; у себя — color-burn, цвет поля остаётся');
  else if (rec.blend.dark !== 'color-burn') notes.push(`на тёмных полях у донора ${blendAdvice(rec.blend.dark).text}`);
  if (rec.opacity < 0.98) notes.push(`слой донора полупрозрачный (${rec.opacity}): сила переведена в плитку — яркость ${rec.tileMean} ± ${rec.tileSd} вместо ${T.mean} ± ${T.sd}`);
  if (T.alpha != null) notes.push(`плитка донора полупрозрачная (альфа ${T.alpha}): яркость ${T.mean} ± ${T.sd} — какой она выходит на белом поле (в файле ${T.raw.mean} ± ${T.raw.sd}${T.onBlack ? `, на чёрном поле ${T.onBlack.mean} ± ${T.onBlack.sd}` : ''}); своя плитка непрозрачная, цвет даёт поле под ней`);
  if (rec.shown.stretched) notes.push(`у донора картинка растянута на блок (${rec.shown.size}), а не повторяется — у себя класть плиткой ${rec.size} px с повтором`);
  if (rec.size !== sizeAsked) notes.push(`период показа у донора ${rec.shown.px || sizeAsked} px, своя ${kindArg === 'pulp' ? 'зернистая бумага' : 'ткань с мелким шагом'} — плиткой ${rec.size} px: она однородна, повтор не виден, а вес при ${sizeAsked} px был бы в разы больше`);
  else if (rec.shown.px && !rec.shown.stretched && rec.shown.px !== rec.size) notes.push(`период показа у донора ${rec.shown.px} px — взят ${rec.size} px (плитка surface-tile.mjs — от 256 до 2048 px)`);
  if (T.chroma > 12) notes.push(`плитка донора цветная (средний цвет ${T.tint}, цветность ${T.chroma}): своя плитка серая, цвет даёт поле под ней`);
  if (T.seam && T.seam.max > SEAM_FAIL) notes.push(`у плитки донора виден стык (шов ${T.seam.max}) — своя бесшовная`);
  if (S.tile.files > 1) notes.push(`у донора ${S.tile.files} разных плитки — рецепт по самой частой (${T.file})`);
  return rec;
}

/* вид плитки одной строкой: «камень (stone) — уверенность 0.92, высокая: …» или «не определён (…): выбрать глазами — stone или paper» */
const kindLine = (k) => (!k ? 'не снимался' : k.kind ? `${KIND_TITLE[k.kind]} (${k.kind}) — уверенность ${k.conf}, ${k.word}: ${k.basis}` : `не определён (уверенность ${k.conf}, ${k.word}): ${k.basis}; выбрать глазами по вырезке 1:1 — ${(k.alt || ['paper', 'stone']).join(' или ')}`);
/* строки про крупную фактуру для комментария блока переменных */
function surfaceTokenLines(S, list) {
  const per = list.filter((r) => r.surface).map((r) => {
    const b = (k) => { const x = surfaceBandOf(r.surface, k); return x.status === 'не измерено' ? '—' : x.sd; };
    return `${r.viewport.name} ${r.surface.status}${(r.surface.layers || []).length ? ` (σ на снимке тёмный ${b('dark')} / средний ${b('mid')} / светлый ${b('light')})` : ''}`;
  });
  const bl = (k) => S.blend[k] || '—';
  return [
    `   крупная фактура (картинка-плитка): ${per.join('; ')}`,
    `   плитка донора ${S.tile.width}×${S.tile.height}, яркость ${S.tile.mean} ± ${S.tile.sd}, показ ${S.shown.size} ${S.shown.repeat}; наложение у донора: светлые поля ${bl('light')}, тёмные ${bl('dark')}`,
    ...(S.kind ? [`   вид плитки: ${S.kind.kind ? `${S.kind.kind}, уверенность ${S.kind.conf} (${S.kind.word})` : `не определён — выбрать глазами: ${(S.kind.alt || ['paper', 'stone']).join(' или ')}`}`] : []),
    `   своя плитка: ${S.tileCmd}; класть — templates/surface.css`,
  ];
}

/** Блок переменных для site.tokens.css (с маркерами texture:start/end и сырыми замерами в комментарии). */
export function tokensBlock(rec, results = []) {
  const list = (Array.isArray(results) ? results : [results]).filter(Boolean);
  const raw = list.map((r) => {
    const b = (k) => { const x = grainBand(r, k); return x.status === 'не измерено' ? '—' : x.sd; };
    return `   ${r.viewport.name} ${r.viewport.width}×${r.viewport.height}@${r.viewport.dpr}: ${r.status}; σ${r.contribution ? ' (вклад слоя)' : ''} тёмный ${b('dark')} / средний ${b('mid')} / светлый ${b('light')}, lag1 ${grainBand(r, 'all').lag1 ?? '—'}, кипение ${r.boil && r.boil.boils === true ? 'да' : r.boil && r.boil.boils === false ? 'нет' : r.boil && r.boil.boils ? r.boil.boils : '—'}${r.boil && r.boil.frames ? ` (${r.boil.frames} × ${r.boil.frameMs} мс, ${r.boil.source})` : ''}${r.lift && r.lift.dark != null ? `, подъём чёрного ${r.lift.dark}` : ''}`;
  });
  /* адрес внутри комментария CSS: «*\/» в нём закрыл бы комментарий раньше времени */
  const src = list[0] && list[0].url ? String(list[0].url).replace(/\*\//g, '*%2F') : '';
  /* крупная фактура: строки в комментарий и переменные --surface-*; нет её — блок прежний, знак в знак */
  const S = rec.surface && !rec.surface.none ? rec.surface : null;
  return [
    '/* texture:start */',
    `/* Фактура (texture.mjs${src ? `, ${src}` : ''}, ${new Date().toISOString().slice(0, 10)}):`,
    ...raw,
    `   ${!rec.none ? `рецепт: ${rec.blendNote}; ${rec.minWidthNote}` : list.some((r) => r.status === 'не измерено') ? 'зерно не измерено (мало ровных участков) — переменные ниже выключают слой; решать глазами по вырезам 1:1' : 'зерна нет — переменные ниже выключают слой (opacity 0)'}`,
    `   ${rec.tileCmd ? `плитка: ${rec.tileCmd}` : 'плитка не нужна, пока зерна нет'}${S ? '' : ' */'}`,
    ...(S ? surfaceTokenLines(S, list).map((l, i, a) => l.replace(/\*\//g, '*%2F') + (i === a.length - 1 ? ' */' : '')) : []),
    ':root{',
    `  --grain-opacity: ${rec.none ? 0 : rec.opacity};`,
    `  --grain-size: ${rec.size}px;`,
    `  --grain-px: ${rec.px};`,
    `  --grain-frames: ${rec.frames};`,
    `  --grain-frame-ms: ${rec.frameMs}ms;`,
    `  --grain-blend: ${rec.blend};`,
    `  --grain-min-width: ${rec.minWidth || 0}px;`,
    `  --grain-rendering: ${rec.rendering};`,
    ...(S ? [
      `  --surface-size: ${S.size}px;`,
      `  --surface-blend: ${S.use.light};`,
      `  --surface-blend-dark: ${S.use.dark};`,
      `  --surface-min-width: ${S.minWidth || 0}px;`,
      `  --surface-mean: ${S.tileMean};`,
      `  --surface-sd: ${S.tileSd};`,
    ] : []),
    '}',
    '/* texture:end */',
  ].join('\n');
}

/* сдвиги «кадров» внутри плитки: не кратные ей, далеко друг от друга, в пределах [0, size) */
function boilShifts(n, size) {
  if (n === 4 && size === 256) return [[0, 0], [97, 173], [211, 41], [59, 229]];
  const out = [[0, 0]]; let a = 97, b = 173;
  for (let i = 1; i < n; i++) { out.push([a % (size - 16), b % (size - 16)]); a += 113; b += 71; }
  return out;
}

/** templates/grain.css с подставленными значениями рецепта (@media по minWidth, N кадров @keyframes). */
export function fillGrainCss(rec, { tile = null, template = TEMPLATE } = {}) {
  let css = fs.readFileSync(template, 'utf8');
  const set = (name, val) => { css = css.replace(new RegExp(`(${name}:\\s*)[^;]+;`), `$1${val};`); };
  const tileFile = tile || `grain-gray-256${rec.px > 1 ? `-px${rec.px}` : ''}.png`;
  set('--grain-tile', `url(${tileFile})`);
  set('--grain-size', `${rec.size}px`);
  set('--grain-opacity', rec.none ? '0' : String(rec.opacity));
  set('--grain-blend', rec.blend);
  set('--grain-rendering', rec.rendering);
  set('--grain-frames', String(rec.frames));
  set('--grain-frame-ms', `${rec.frameMs}ms`);
  set('--grain-px', String(rec.px));
  set('--grain-min-width', `${rec.minWidth || 0}px`);
  css = css.replace(/@media \(min-width:\s*[\d.]+px\)\s*\{\s*\/\* grain-min-width \*\//, `@media (min-width: ${rec.minWidth || 0}px) { /* grain-min-width */`);
  const sh = boilShifts(Math.max(1, rec.boil ? rec.frames : 1), rec.size);
  const kf = `@keyframes grain-boil{\n${sh.map(([x, y], i) => `  ${`${r2(i * 100 / sh.length)}%`.padEnd(6)}{transform:translate(${x}px,${y}px)}`).join('\n')}\n}`;
  css = css.replace(/\/\* grain-keyframes:start \*\/[\s\S]*?\/\* grain-keyframes:end \*\//, `/* grain-keyframes:start */\n${kf}\n/* grain-keyframes:end */`);
  if (!rec.boil) css = css.replace(/animation:grain-boil[^;]*;/, 'animation:none;');
  return css;
}

/**
 * templates/surface.css с подставленным рецептом крупной фактуры (S — recipe.surface): период показа,
 * режимы наложения для светлых и тёмных полей, @media по ширине; tile — имя файла своей плитки.
 */
export function fillSurfaceCss(S, { tile = null, template = TEMPLATE_SURFACE } = {}) {
  let css = fs.readFileSync(template, 'utf8');
  const set = (name, val) => { css = css.replace(new RegExp(`(${name}:\\s*)[^;]+;`), (m, head) => `${head}${val};`); };
  set('--surface-tile', `url(${tile || S.tileName})`);
  set('--surface-size', `${S.size}px`);
  set('--surface-blend', S.use.light);
  set('--surface-blend-dark', S.use.dark);
  set('--surface-min-width', `${S.minWidth || 0}px`);
  css = css.replace(/@media \(min-width:\s*[\d.]+px\)\s*\{\s*\/\* surface-min-width \*\//, `@media (min-width: ${S.minWidth || 0}px) { /* surface-min-width */`);
  return css;
}

/* подраздел «Крупная фактура» для discovery.md: таблица по экранам, плитка, слои, рецепт. Замер старый
   (поля surface нет) — пусто; фактуры нет — одна строка */
function surfaceMarkdown(list, S) {
  const withField = list.filter((r) => r.surface);
  if (!withField.length || !S) return [];
  if (S.none && !withField.some((r) => (r.surface.layers || []).length)) return ['', 'Крупная фактура (картинка-плитка в фоне: мятая бумага, камень, ткань): нет — таких картинок на странице не найдено.'];
  const b = (r, k) => { const x = surfaceBandOf(r.surface, k); return x.status === 'не измерено' ? (x.blocks ? `не измерено (${x.blocks} уч.)` : '—') : `${x.sd}${x.status === 'есть' ? '' : ' (нет)'}`; };
  const lines = ['', '### Крупная фактура (картинка-плитка)', '',
    'Не зерно: светлая картинка-плитка с деталями крупнее пикселя — прожилки, заломы, нити. σ — разброс её вклада (снимок с плиткой − без) на ровных участках 128 px (где их мало — 64 px), подъём — насколько она темнит или светлит фон.', '',
    '| экран | фактура | σ тёмный | σ средний | σ светлый | слоёв | мелких блоков |', '|---|---|---|---|---|---|---|'];
  for (const r of withField) lines.push(`| ${r.viewport.name} ${r.viewport.width}×${r.viewport.height}@${r.viewport.dpr} | ${r.surface.status} | ${b(r, 'dark')} | ${b(r, 'mid')} | ${b(r, 'light')} | ${(r.surface.layers || []).length} | ${r.surface.usersCount || 0} |`);
  lines.push('');
  const seenTile = new Set(), seenLayer = new Set();
  for (const r of withField) {
    const T = r.surface.tile;
    if (T && !seenTile.has(T.file)) { seenTile.add(T.file); lines.push(`- **плитка ${T.file}**: ${T.format} ${T.width}×${T.height}, ${Math.round(T.bytes / 1024)} КБ; яркость ${T.mean} ± ${T.sd}${T.alpha != null ? ` (на белом поле; полупрозрачная, альфа ${T.alpha})` : ''}, lag1 ${T.lag1}, цветность ${T.chroma}${T.seam ? `, шов ${T.seam.max}${T.seam.max > SEAM_FAIL ? ' (стык виден)' : ''}` : ''} — только для замера, на сайт не переносить`); if (T.kind) lines.push(`  - вид: ${kindLine(T.kind)}`); }
    for (const L of r.surface.layers || []) {
      const key = L.el + (L.pseudo || ''); if (seenLayer.has(key)) continue; seenLayer.add(key);
      const s = L.surf;
      lines.push(`- **${key}** (${r.viewport.name}): ${s.via}, ${L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`}, фон под ней ${s.tone ? `${TONE[s.tone]} (Y ${Math.round(s.y)})` : 'не определён'}, наложение ${s.blend}${s.opacity < 0.98 ? `, прозрачность ${s.opacity}` : ''}, показ ${s.shown.size} ${s.shown.repeat}${s.sd != null ? `; σ ${s.sd}, подъём ${s.lift}` : ''}${s.hidden ? '; спрятан' : ''}${(L.mediaOff || []).length ? `; выключена: ${L.mediaOff.map((m) => `@media ${m.cond} (${m.how})`).join(', ')}` : ''}`);
    }
    for (const U of (r.surface.users || []).slice(0, 6)) lines.push(`- мелкие блоки (${r.viewport.name}): ${U.count} × ${U.el} — фон ${U.tone ? TONE[U.tone] : 'не определён'}, наложение ${U.blend}`);
    for (const d of r.surface.diagnosis || []) lines.push(`- ${r.viewport.name}: ${d}`);
  }
  if (!S.none) {
    lines.push('', `Рецепт крупной фактуры: светлые и цветные поля — \`${S.use.light}\`, тёмные — \`${S.use.dark}\` (у донора: светлые ${S.blend.light || '—'}, тёмные ${S.blend.dark || '—'}; граница — яркость поля ${SURFACE_DARK_Y}); период показа ${S.size} px; ${S.minWidthNote}; в печати ${S.print}, при «меньше движения» ${S.reducedMotion}.`);
    if (S.kind) lines.push(`Вид плитки: ${kindLine(S.kind)}.`);
    lines.push(`Плитка: \`${S.tileCmd}\`; как класть — templates/surface.css.`);
    for (const n of S.notes) lines.push(`- ${n}`);
  } else for (const n of S.notes) lines.push('', `Крупная фактура: ${n}.`);
  return lines;
}

/** Раздел «Фактура (параметры для переноса)» для discovery.md по результатам экранов. */
export function textureMarkdown(results, { recipe = null } = {}) {
  const list = (Array.isArray(results) ? results : [results]).filter(Boolean);
  const rec = recipe || recipeFrom(list);
  const b = (r, k) => {
    const x = grainBand(r, k); if (!x || !x.tiles && x.status === 'не измерено') return '—';
    if (x.status === 'не измерено') return `не измерено (${x.tiles} плиток)`;
    return `${x.sd}${x.status === 'есть' ? '' : ' (нет)'}${notGrainNote(x) ? ` — на снимке ${x.raw.sd}, не зерно` : ''}`;
  };
  const lines = ['## Фактура (параметры для переноса)', '', 'Замер texture.mjs: снимки окна 1:1, σ на ровных плитках по полосам фона — вклад найденных слоёв (снимок со слоем − без), где слоя нет — σ на снимке. Полностраничный снимок и уменьшенные картинки фактуру не показывают — доказательство только числом и вырезами 1:1.', '',
    '| экран | зерно | σ тёмный | σ средний | σ светлый | lag1 | кипение | слоёв |', '|---|---|---|---|---|---|---|---|'];
  for (const r of list) lines.push(`| ${r.viewport.name} ${r.viewport.width}×${r.viewport.height}@${r.viewport.dpr} | ${r.status} | ${b(r, 'dark')} | ${b(r, 'mid')} | ${b(r, 'light')} | ${grainBand(r, 'all').lag1 ?? '—'} | ${r.boil && r.boil.boils != null ? (r.boil.boils === true ? 'да' : r.boil.boils === false ? 'нет' : r.boil.boils) : '—'}${r.boil && r.boil.frames ? ` ${r.boil.frames}×${r.boil.frameMs} мс (${r.boil.source})` : ''} | ${r.layers.length} |`);
  lines.push('');
  const seen = new Set();
  for (const r of list) for (const L of r.layers) {
    const key = L.el + (L.pseudo || '') + L.backgroundImage; if (seen.has(key)) continue; seen.add(key);
    const f = L.file && !L.file.error ? L.file : null;
    lines.push(`- **${L.el}${L.pseudo || ''}** (${r.viewport.name}): ${L.kind}, ${L.position}${L.fixedBy && L.position !== 'fixed' ? ` через ${L.fixedBy}` : ''}, z ${L.zIndex}, ${L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`}, opacity ${L.opacity} (итоговая ${L.effectiveOpacity}), наложение ${L.mixBlendMode}${L.blendChain.length ? ` / ${L.blendChain.join(', ')}` : ''}, фон ${L.backgroundSize} ${L.backgroundRepeat}, image-rendering ${L.imageRendering}, pointer-events ${L.pointerEvents}; причина: ${L.reason.join(', ')}${L.animation ? `; анимация ${L.animation}` : ''}${L.mediaRules && L.mediaRules.length ? `; @media ${L.mediaRules.join(' | ')}` : ''}`);
    if (f) lines.push(`  - файл ${f.file}: ${f.format} ${f.width}×${f.height}, ${Math.round(f.bytes / 1024)} КБ, кадров ${f.pages}${f.frameMs ? ` по ${f.frameMs} мс` : ''}; σ ${f.frames[0].sd}, lag1 ${f.frames[0].lag1}, альфа ${f.frames[0].alphaMean}, цветность ${f.frames[0].chroma}${f.frameCorr.length ? `, связь кадров ${f.frameCorr.join('/')}` : ''} — только для замера, на сайт не переносить`);
    if (L.svg) lines.push(`  - feTurbulence ${L.svg.type} baseFrequency ${L.svg.baseFrequency} octaves ${L.svg.numOctaves}${L.svg.alphaTable != null ? `, feFuncA ${L.svg.alphaTable}` : ', альфа не выставлена'}`);
  }
  for (const r of list) for (const d of r.diagnosis || []) lines.push(`- ${r.viewport.name}: ${d}`);
  lines.push('', `Рецепт: ${rec.none ? rec.notes.join('; ') : `${rec.blendNote}; зерно ${rec.px} px, image-rendering ${rec.rendering}; кипение ${rec.boil ? `${rec.frames} × ${rec.frameMs} мс (${rec.boilSource})` : 'нет'}; ${rec.minWidthNote}`}.`);
  if (!rec.none) lines.push(`Плитка: \`${rec.tileCmd}\`; слой — templates/grain.css. Решение «повторять ли отсутствие зерна на телефоне» записать явно.`);
  for (const n of rec.notes || []) if (!rec.none) lines.push(`- ${n}`);
  lines.push(...surfaceMarkdown(list, rec.surface || null));
  lines.push('', '```css', tokensBlock(rec, list), '```', '');
  return lines.join('\n');
}

/* ======================================================================
   7. Сравнение донора со сборкой
   ====================================================================== */

/**
 * Донор против сайта на одном экране: σ по полосам ±sdTol (доля), lag1 ±lagTol, кипение да/нет.
 * Разный DPR — FAIL «сравнение недостоверно». → { viewport, dprOk, rows[], verdict, hints[] }.
 */
/**
 * Зерно в полосе фона для рецепта и сравнения: вклад найденных слоёв (снимок со слоем − без),
 * если проход «без слоя» был и полоса в нём измерена, — σ на снимке дают ещё картины, градиенты
 * и сжатие картинок; иначе σ на снимке. → Band & { via: 'вклад'|'снимок', raw }.
 */
export function grainBand(res, k) {
  const c = res.contribution && res.contribution[k]; const g = res.grain[k];
  if (c && c.status !== 'не измерено') return { ...c, via: 'вклад', raw: g };
  /* слоя зерна нет, σ на снимке — шум самих картинок (res.inPictures): сила зерна слоем — ноль, иначе сверка требовала
     бы от сайта повторить шум чужих фотографий */
  if (res.inPictures && g.status !== 'не измерено') return { ...g, sd: 0, sd_p90: 0, status: 'нет', via: 'картинки', raw: g };
  return { ...g, via: 'снимок', raw: g };
}
const notGrainNote = (b) => (b.via === 'вклад' && b.raw && b.raw.status === 'есть' && b.sd < GRAIN_MIN_SD ? `σ ${b.raw.sd} на снимке — не зерно (вклад слоя ${b.sd})` : b.via === 'картинки' && b.raw && b.raw.status === 'есть' ? `σ ${b.raw.sd} на снимке — в самих картинках, слоя зерна нет` : '');

export function compareTexture(donor, site, { sdTol = 0.2, lagTol = 0.15, surfaceTol = 0.3 } = {}) {
  const rows = []; const hints = [];
  const vpn = donor.viewport.name;
  const dprOk = donor.viewport.dpr === site.viewport.dpr && donor.viewport.width === site.viewport.width;
  rows.push({ what: 'экран', donor: `${donor.viewport.width}×${donor.viewport.height}@${donor.viewport.dpr}`, site: `${site.viewport.width}×${site.viewport.height}@${site.viewport.dpr}`, ok: dprOk, note: dprOk ? '' : 'разный экран или DPR — сравнение недостоверно' });
  if (!dprOk) return { viewport: vpn, dprOk, rows, verdict: 'FAIL', hints };
  const nameOf = { dark: 'σ тёмный', mid: 'σ средний', light: 'σ светлый' };
  let lagBand = null;
  const lagOf = {};
  for (const k of ['dark', 'mid', 'light']) {
    const d = grainBand(donor, k), s = grainBand(site, k);
    const dm = d.status !== 'не измерено', sm = s.status !== 'не измерено';
    let ok = null, note = '';
    if (!dm || !sm) note = !dm && !sm ? 'нет таких фонов ни там, ни там' : !dm ? 'у донора не измерено' : 'у сайта не измерено';
    else if (d.sd < GRAIN_MIN_SD && s.sd < GRAIN_MIN_SD) { ok = true; note = 'зерна нет у обоих'; }
    else if (d.sd < GRAIN_MIN_SD) { ok = false; note = 'у донора зерна нет, у сайта есть'; }
    else { const rel = (s.sd - d.sd) / d.sd; ok = Math.abs(rel) <= sdTol; note = `${rel >= 0 ? '+' : ''}${Math.round(rel * 100)} %`; if (!lagBand || d.tiles > lagOf[lagBand].d.tiles) lagBand = k; }
    lagOf[k] = { d, s };
    const extra = [notGrainNote(d) && `у донора ${notGrainNote(d)}`, notGrainNote(s) && `у сайта ${notGrainNote(s)}`].filter(Boolean).join('; ');
    if (extra) note = note ? `${note}; ${extra}` : extra;
    rows.push({ what: nameOf[k], donor: dm ? `${d.sd} (${d.tiles})` : `— (${d.tiles})`, site: sm ? `${s.sd} (${s.tiles})` : `— (${s.tiles})`, tol: `±${Math.round(sdTol * 100)} %`, ok, note, via: { donor: d.via, site: s.via } });
    if (ok === false && dm && sm && d.sd >= GRAIN_MIN_SD) {
      const L = mainLayer(site);
      const adv = L ? blendAdvice(layerBlend(L)) : null;
      const dead = adv && ((k === 'dark' && adv.deadOnDark) || (k === 'light' && adv.deadOnLight));
      if (s.sd < GRAIN_MIN_SD && L && dead) hints.push(`${nameOf[k]}: у сайта зерна нет при слое ${L.el}${L.pseudo || ''} (${layerBlend(L)}) — ${adv.text}`);
      else if (s.sd < GRAIN_MIN_SD && L) hints.push(`${nameOf[k]}: слой ${L.el}${L.pseudo || ''} слишком слабый (σ ${s.sd} при нужной ${d.sd}) — своя плитка и opacity по рецепту: texture.mjs <донор> --css grain.css`);
      else if (L && s.sd > 0) hints.push(`${nameOf[k]}: opacity слоя ${L.el}${L.pseudo || ''} ${L.opacity} × ${r2(d.sd / s.sd)} → ${r3(L.opacity * d.sd / s.sd)}`);
    }
  }
  if (lagBand) {
    const dl = lagOf[lagBand].d.lag1, sl = lagOf[lagBand].s.lag1;
    const ok = dl != null && sl != null ? Math.abs(dl - sl) <= lagTol : null;
    rows.push({ what: `lag1 (${lagBand === 'dark' ? 'тёмный' : lagBand === 'mid' ? 'средний' : 'светлый'})`, donor: dl, site: sl, tol: `±${lagTol}`, ok, note: ok === false ? (sl > dl ? 'у сайта зерно крупнее/мыльнее: image-rendering или --px' : 'у сайта зерно мельче') : '' });
  }
  const bv = (b) => (!b || b.boils == null ? null : b.boils === true || b.boils === 'слабо');
  const db = bv(donor.boil), sb = bv(site.boil);
  const donorHasGrain = donor.status === 'есть';
  rows.push({ what: 'кипение', donor: db == null ? '—' : db ? `да${donor.boil.frames ? ` (${donor.boil.frames}×${donor.boil.frameMs} мс)` : ''}` : 'нет', site: sb == null ? '—' : sb ? `да${site.boil.frames ? ` (${site.boil.frames}×${site.boil.frameMs} мс)` : ''}` : 'нет', tol: 'да/нет', ok: !donorHasGrain ? null : db == null || sb == null ? null : db === sb, note: donorHasGrain ? '' : 'у донора зерна нет — не сравнивается' });
  const bandRows = rows.filter((r) => r.what.startsWith('σ'));
  let verdict = rows.some((r) => r.ok === false) ? 'FAIL' : bandRows.every((r) => r.ok == null) ? 'WARN' : rows.some((r) => r.ok == null && r.what !== 'кипение' && !r.what.startsWith('σ')) ? 'WARN' : 'OK';
  /* крупная фактура — своими строками и своим итогом; общий итог — худший из двух. Нет её ни там, ни там —
     строк нет, и сверка зерна выглядит как раньше */
  const cs = compareSurface(donor, site, { tol: surfaceTol });
  if (cs.rows.length) {
    /* у одной стороны замер старой версии (до 01.10.2026), а у другой найдена крупная фактура: старый замер считал
       плитку зерном, и строки зерна сравнивают разное. Раньше выходил FAIL «фактура не как у донора» с подсказкой
       «перемерить» в самом конце — теперь эти строки помечены «не в счёт», итог — WARN, подсказка одна и первая */
    if (cs.old) {
      for (const r of rows) if (r.ok === false && r.what !== 'экран') { r.ok = null; r.note = `${r.note ? `${r.note}; ` : ''}не в счёт: замер ${cs.old === 'donor' ? 'донора' : 'сайта'} старой версии`; }
      hints.length = 0; verdict = 'WARN';
    }
    rows.push(...cs.rows); hints.push(...cs.hints);
    const rank = { OK: 0, WARN: 1, FAIL: 2 };
    if (rank[cs.verdict] > rank[verdict]) verdict = cs.verdict;
  }
  return { viewport: vpn, dprOk, rows, verdict, hints, ...(cs.rows.length ? { surface: cs.verdict } : {}) };
}

/**
 * Крупная фактура донора против сайта на одном экране: есть / нет, σ на ровных участках по полосам фона
 * ±tol (участки одного размера: 128 px, а если у кого-то их мало — 64 px у обоих), режим наложения по тону.
 * Логика та же, что у зерна: FAIL — у одного есть, у другого нет, или σ мимо допуска; WARN — сравнить нечем
 * (не измерено, замер донора старый); режим наложения сам FAIL не даёт — решает сила на снимке.
 * → { rows[], hints[], verdict } (rows пуст, если фактуры нет ни у кого).
 */
export function compareSurface(donor, site, { tol = 0.3 } = {}) {
  const rows = [], hints = []; const D = donor.surface, S = site.surface;
  const has = (x) => !!(x && ((x.layers || []).length || x.status === 'есть'));
  if (!has(D) && !has(S)) return { rows, hints, verdict: 'OK' };
  const stOf = (x) => (x ? x.status : 'не снималась');
  let ok = null, note = '';
  if (!D || !S) note = `${!D ? 'у донора' : 'у сайта'} крупная фактура не снималась (texture.json старой версии) — перемерить`;
  else if (D.status === 'есть' && S.status === 'есть') ok = true;
  else if (D.status === 'нет' && S.status === 'нет') { ok = true; note = 'слои с плиткой есть, но не видны у обоих'; }
  else if (D.status === 'есть' && S.status === 'нет') { ok = false; note = has(S) ? 'у сайта плитка есть, но на снимках её не видно' : 'у сайта крупной фактуры нет'; }
  else if (D.status === 'нет' && S.status === 'есть') { ok = false; note = has(D) ? 'у донора плитка не видна, у сайта видна' : 'у донора крупной фактуры нет, у сайта есть'; }
  else note = `${D.status === 'не измерено' ? 'у донора' : 'у сайта'} не измерено — ровных участков мало`;
  rows.push({ what: 'крупная фактура', donor: stOf(D), site: stOf(S), tol: 'да/нет', ok, note, group: 'surface' });
  if (ok === false && D && D.status === 'есть' && !has(S)) hints.push('крупная фактура: у сайта её нет — своя плитка surface-tile.mjs --like <texture.json донора> и templates/surface.css (texture.mjs <донор> --css surface.css)');
  if (!D || !S) {
    const who = !D ? 'донора' : 'сайта';
    hints.push(`крупная фактура: замер ${who} сделан версией до 01.10.2026 — крупную фактуру она не снимала, а плитку с именем texture или paper считала слоем зерна. Поэтому строки «σ» и «кипение» выше сравнивают плитку с зерном и в счёт не идут. Что сделать: перемерить ${!D ? 'донора' : 'сайт'} нынешней версией — node texture.mjs <адрес ${who}> --out <папка> — и повторить compare с новым texture.json`);
    return { rows, hints, verdict: 'WARN', old: !D ? 'donor' : 'site' };
  }
  /* вид плитки: у донора камень, у нас бумага — рисунок другого характера при тех же числах. Подсказка, не провал:
     вид определяется по признакам с допуском, решают глаза по вырезкам 1:1 */
  const dk = D.tile && D.tile.kind, sk = S.tile && S.tile.kind;
  /* у одной из сторон плитка есть, а вида в замере нет — замер сделан версией 01.10.2026 (фактуру снимала, вид — нет).
     Раньше строки не было вовсе и итог выходил OK молча */
  if (D.tile && S.tile && (!dk || !sk)) {
    const who = !dk && !sk ? 'ни у донора, ни у сайта' : !dk ? 'у донора' : 'у сайта';
    rows.push({ what: 'вид плитки', donor: dk ? (dk.kind ? `${dk.kind} (${dk.conf})` : 'не определён') : 'не снимался', site: sk ? (sk.kind ? `${sk.kind} (${sk.conf})` : 'не определён') : 'не снимался', tol: '', ok: null, note: `вид ${who} не снимался (замер версии до 02.10.2026)`, group: 'surface' });
    hints.push(`вид плитки: ${who} не снимался — замер сделан версией до 02.10.2026, она вида не определяла. Сверить вид: перемерить нынешней версией (node texture.mjs <адрес> --out <папка>) и повторить compare; силу фактуры это не меняет`);
  }
  if (dk && sk) {
    const both = !!(dk.kind && sk.kind), same = both && dk.kind === sk.kind;
    const nm = (k) => (k.kind ? `${k.kind} (${k.conf})` : 'не определён');
    rows.push({ what: 'вид плитки', donor: nm(dk), site: nm(sk), tol: '', ok: same ? true : null, note: same ? '' : both ? 'вид другой — подсказка, не провал' : 'у одной из плиток вид не определён — сверить глазами', group: 'surface' });
    if (both && !same) hints.push(`вид плитки: у донора ${KIND_TITLE[dk.kind]} (${dk.kind}, уверенность ${dk.conf} — ${dk.basis}), у сайта ${KIND_TITLE[sk.kind]} (${sk.kind}) — рисунок другого характера при тех же числах; своя плитка того же вида: surface-tile.mjs --kind ${dk.kind} --like <texture.json донора>. Это подсказка, а не провал: положить вырезки 1:1 рядом и решить глазами`);
  }
  const tileS = S.tile, sdRows = []; const off = [], fine = [], darkOf = {}, lone = [];
  for (const k of ['dark', 'mid', 'light']) {
    let d = surfaceBandOf(D, k), s = surfaceBandOf(S, k);
    /* участки разного размера не сравнить: σ растёт с размером участка — тогда 64 px у обоих */
    if (d.status !== 'не измерено' && s.status !== 'не измерено' && d.size !== s.size) {
      const d6 = D.bands64 && D.bands64[k], s6 = S.bands64 && S.bands64[k];
      d = d6 ? { ...d6, size: 64 } : { status: 'не измерено', blocks: 0 }; s = s6 ? { ...s6, size: 64 } : { status: 'не измерено', blocks: 0 };
    }
    const dm = d.status !== 'не измерено', sm = s.status !== 'не измерено';
    if (!dm && !sm) continue;
    let rok = null, rnote = '';
    if (!dm || !sm) rnote = !dm ? 'у донора таких фонов с фактурой нет или не измерено' : 'у сайта таких фонов с фактурой нет или не измерено';
    else if (d.sd < SURFACE_MIN_SD && s.sd < SURFACE_MIN_SD) { rok = true; rnote = 'не видна у обоих'; }
    else if (d.sd < SURFACE_MIN_SD) { rok = false; rnote = 'у донора на этом фоне фактура не видна, у сайта видна'; }
    else { const rel = (s.sd - d.sd) / d.sd; rok = Math.abs(rel) <= tol; rnote = `${rel >= 0 ? '+' : ''}${Math.round(rel * 100)} %${d.size === 64 ? '; участки 64 px' : ''}`; }
    const row = { what: `фактура σ ${TONE[k]}`, donor: dm ? `${d.sd} (${d.blocks})` : `— (${d.blocks || 0})`, site: sm ? `${s.sd} (${s.blocks})` : `— (${s.blocks || 0})`, tol: `±${Math.round(tol * 100)} %`, ok: rok, note: rnote, group: 'surface' };
    rows.push(row); sdRows.push(row);
    const dMode = D.byTone && D.byTone[k].mode, sMode = S.byTone && S.byTone[k].mode;
    /* полоса измерена только у одной стороны: запомнить для подсказки о тёмных полях в разных полосах (ниже) */
    if (dm !== sm) { const b = dm ? d : s, mode = dm ? dMode : sMode; if (b.sd >= SURFACE_MIN_SD && (mode === 'color-burn' || (b.y != null && b.y < SURFACE_DARK_Y))) lone.push({ k, side: dm ? 'donor' : 'site', sd: b.sd, y: b.y }); }
    if (rok === false && dm && sm && d.sd >= SURFACE_MIN_SD) {
      const adv = sMode ? blendAdvice(sMode) : null;
      if (s.sd < SURFACE_MIN_SD && (k === 'dark' || (s.y != null && s.y < SURFACE_DARK_Y)) && sMode && sMode !== 'color-burn') hints.push(`фактура σ ${TONE[k]}: у сайта не видна при наложении ${sMode}${adv && adv.deadOnDark ? ' (гаснет на тёмном)' : ''} → на тёмных полях color-burn${dMode ? ` (у донора ${dMode})` : ''}`);
      else if (tileS && s.sd > 0) off.push({ k, d: d.sd, s: s.sd, sdNeed: r2(tileS.sd * d.sd / s.sd) });
    } else if (rok === true && dm && sm && d.sd >= SURFACE_MIN_SD) fine.push(k);
    /* тёмное ли это поле для плитки: там, где у сайта стоит color-burn, или яркость поля ниже SURFACE_DARK_Y. Полоса
       замера «тёмный» — только до яркости 60, а тёмно-зелёные секции образца (zakroma.rest) — 62: они в полосе «средний»,
       хотя плитка на них лежит через color-burn */
    if (sm) darkOf[k] = sMode === 'color-burn' || (s.y != null && s.y < SURFACE_DARK_Y);
    /* режим наложения: совпал или равносилен (на светлом обычный слой, умножение и darken дают одно и то же) —
       OK; разный при силе в допуске — тоже OK с пометкой; разный при силе мимо допуска — причина в подсказке */
    if (dMode && sMode) {
      const soft = (m) => ['normal', 'multiply', 'darken'].includes(m);
      const same = dMode === sMode || (k !== 'dark' && soft(dMode) && soft(sMode));
      rows.push({ what: `наложение ${TONE[k]}`, donor: dMode, site: sMode, tol: '', ok: same || rok === true ? true : null, note: dMode === sMode ? '' : same ? 'на этом фоне равносильны' : rok === true ? 'режим другой, сила та же' : 'режим другой', group: 'surface' });
    }
  }
  /* сила мимо допуска. Плитка одна на все поля, и её σ меняет фактуру сразу везде: если мимо только тёмные поля, а
     светлые в норме (так вышло на пробной странице против zakroma.rest: светлые +3 %, тёмные +47 %), совет «ослабить
     плитку» сломал бы светлые. Тогда — отдельная плитка для тёмных полей (--surface-tile-dark в surface.css) */
  for (const o of off) {
    const others = fine.filter((k) => k !== o.k); const head = `фактура σ ${TONE[o.k]}: у сайта ${o.s} при ${o.d} у донора`;
    const names = (list) => list.map((k) => TONE[k]).join('» и «');
    /* в норме поля другой стороны (светлые при тёмном мимо или наоборот) — у них своя переменная плитки; поля той же
       стороны делят плитку с тем, что мимо */
    const lightOk = others.filter((k) => !darkOf[k]), darkOk = others.filter((k) => darkOf[k]);
    if (darkOf[o.k] && lightOk.length) hints.push(`${head} — это тёмное поле (плитка через color-burn или яркость ниже ${SURFACE_DARK_Y}), а на светлых полях «${names(lightOk)}» сила в норме → общую плитку не трогать (её σ меняет все поля сразу): для тёмных полей сделать отдельную — surface-tile.mjs --sd ${o.sdNeed} --name <имя>-dark — и назначить её переменной --surface-tile-dark в surface.css (сейчас σ плитки ${tileS.sd})`);
    else if (!darkOf[o.k] && darkOk.length) hints.push(`${head} → общая плитка с --sd ${o.sdNeed} (сейчас σ плитки ${tileS.sd}); surface-tile.mjs --sd. На тёмных полях «${names(darkOk)}» сила сейчас в норме — им оставить нынешнюю плитку: назначить её переменной --surface-tile-dark в surface.css${lightOk.length ? `; на светлых полях «${names(lightOk)}» с новой плиткой сила изменится — перемерить` : ''}`);
    else if (others.length) hints.push(`${head} → своя плитка с --sd ${o.sdNeed} (сейчас σ плитки ${tileS.sd}); surface-tile.mjs --sd. На полях «${names(others)}» сила сейчас в норме, а плитка у них та же — с новой она изменится и там: перемерить`);
    else hints.push(`${head} → своя плитка с --sd ${o.sdNeed} (сейчас σ плитки ${tileS.sd}); surface-tile.mjs --sd`);
  }
  /* тёмные поля донора и сайта попали в разные полосы замера (у zakroma.rest яркость тёмных секций 62 — «средний», у
     сайта 47 — «тёмный»): обе строки «—», и сила на тёмных полях молча не сверялась вовсе. Вердикта это не меняет (сила
     через color-burn зависит от яркости поля, сравнение полос нечестное) — но сказать об этом надо */
  { const ld = lone.filter((x) => x.side === 'donor'), ls = lone.filter((x) => x.side === 'site');
    if (ld.length && ls.length) { const a = ld[0], b = ls[0]; hints.push(`тёмные поля не сверены: у донора они в полосе «${TONE[a.k]}» (яркость поля ${a.y != null ? Math.round(a.y) : "—"}, σ ${a.sd}), у сайта — в полосе «${TONE[b.k]}» (яркость ${b.y != null ? Math.round(b.y) : "—"}, σ ${b.sd}) — полосы разные, обе строки «—». Ориентир, не вердикт: ${b.sd >= a.sd ? '+' : ''}${Math.round((b.sd - a.sd) / a.sd * 100)} % (сила через color-burn зависит от яркости поля). Чтобы сверить: взять у себя поле той же яркости, что у донора, либо сравнить вырезки 1:1 глазами`); } }
  const verdict = rows.some((r) => r.ok === false) ? 'FAIL' : rows[0].ok == null || (D.status === 'есть' && S.status === 'есть' && sdRows.every((r) => r.ok == null)) ? 'WARN' : 'OK';
  return { rows, hints, verdict };
}
/** compareTexture по каждому экрану (сопоставление по viewport.name). */
export function compareSets(donorList, siteList, opts = {}) {
  const out = [];
  for (const d of donorList) {
    const s = siteList.find((x) => x.viewport.name === d.viewport.name);
    if (!s) { out.push({ viewport: d.viewport.name, rows: [], verdict: 'WARN', hints: [`у сайта нет замера на экране ${d.viewport.name}`] }); continue; }
    out.push(compareTexture(d, s, opts));
  }
  return out;
}

/* ======================================================================
   8. CLI
   ====================================================================== */

const HELP = `texture.mjs — фактура: слои зерна, их параметры, сила зерна числом, рецепт и сверка с донором;
крупная фактура (картинка-плитка в фоне: мятая бумага, камень, холст, доски) — есть ли, плитка, её вид
(мятая или зернистая бумага, камень, ткань или «не определён»), наложение, рецепт

  node texture.mjs <url> [--viewport desktop,tablet,mobile] [--out папка] [--screens 4] [--label имя]
                   [--json файл] [--tokens файл] [--css файл] [--md файл] [--extras] [--strict]
  node texture.mjs <texture.json> [--viewport desktop,mobile] [--tokens файл] [--css файл] [--md файл] [--json файл]
                   рецепт, --tokens/--css/--md по прошлому замеру — страница заново не открывается;
                   --viewport оставляет только эти экраны; texture.json пишется только с --json;
                   путь на .json, которого нет, — «нет файла <путь>», код 1
  node texture.mjs compare <донор: url|texture.json> <сайт: url|texture.json> [--viewport desktop,mobile]
                   [--out папка] [--screens 4] [--sd-tol 0.2] [--lag-tol 0.15] [--surface-tol 0.3]
  node texture.mjs --png снимок.png [--png2 b.png] [--png3 c.png] [--without без-слоя.png] [--region x,y,w,h] [--json файл]
  node texture.mjs --tile файл.gif|png|webp|svg
  node texture.mjs selftest [--no-browser]
  node texture.mjs --help | --h | -h

  --viewport  экраны через запятую (desktop, laptop, tablet, mobile, mobile-s, android, ШxВ@DPR);
              по умолчанию desktop,tablet,mobile (compare: desktop,mobile). --viewports и --vp (старое
              имя) — то же во всех режимах; разные значения у них — ошибка, код 1.
  --strict    код 1 при FAIL. FAIL даёт только compare (там код 1 и без флага); одиночный замер,
              --png и --tile — только OK и WARN, код 0. Ошибка замера или аргументов — всегда 1.
  --out       папка снимков и texture.json (по умолчанию <папка прогона>/texture)
  --screens   экранов по высоте страницы (4), снимки окна
  --label     метка замера: имя в файлах снимков и итог <out>/texture-<метка>.json (два замера в одну
              --out не затирают друг друга); без неё — texture.json
  --json      файл итога (по умолчанию <out>/texture.json, с --label — texture-<метка>.json; в compare —
              <out>/compare.json); итог от другого адреса на этом месте — WARN «перезаписан»
  --tokens    записать блок --grain-* в файл (заменяет блок texture:start…end или дописывает);
              есть крупная фактура — в том же блоке ещё --surface-*
  --css       записать templates/grain.css с подставленным рецептом; есть крупная фактура — и
              templates/surface.css (только она, без зерна, — один surface.css)
  --md        записать раздел «Фактура (параметры для переноса)» для discovery.md
  --extras    ещё вуали, псевдоэлементы, backdrop-filter, blend, градиенты, фоновые видео
  --sd-tol    допуск σ по полосам в compare (0.2 = ±20 %); --lag-tol — допуск lag1 (0.15)
  --surface-tol  допуск силы крупной фактуры в compare (0.3 = ±30 %)
  --png …     метрика по готовым снимкам окна 1:1: --png2/--png3 — тот же экран позже (кипение),
              --without — тот же экран без слоя (ровность и вклад слоя), --region x,y,w,h
  --tile      разбор файла текстуры по всем кадрам (кадры, мс, σ, lag1, альфа, похож ли на шум,
              крупная ли это фактура и почему нет, её вид с уверенностью, числа рисунка, шов при повторе)
  --selftest  самопроверка (или команда selftest): разбор файлов, вид плитки, находки проверки 02.10.2026 (мягкое
              зерно, рисунок на ровном поле, почти белые плитки, вид на шуме), участки, рецепт, сверка, аргументы —
              без браузера; стенды со своей плиткой, с зерном (и мягким), без фактуры, с обманками (имя texture
              у фотографии, орнамент), с шумом в фотографиях, с шум-плиткой в фоне, с полупрозрачной плиткой,
              с подложкой тегом img и с фактурой в части страницы — в браузере
  --no-browser  selftest без стендов в браузере

Крупная фактура: картинка-плитка с деталями крупнее пикселя — в фоне блока или слоем поверх, в том числе
полупрозрачная (без крупных пятен). Узнаётся по файлу: σ яркости 0.8…12, детали крупнее пикселя (доля разброса
мельче 5 px до 0.6 и есть рисунок крупнее зерна — пятна или линии; ткань — по повтору рисунка по обеим осям),
детали по всей площади, общий уклон яркости до 0.7 σ (у плитки до 512 px — до 0.8). Не проходят, с причиной: шум
и мягкое зерно, фотография, градиент, рисунок на ровном поле (линии, значки, орнамент), сетка в два тона,
полупрозрачная фотография. Имя файла (texture, paper, grain) — только подсказка: фотография с таким именем слоем
не считается.
Сила — вклад «с плиткой − без» на ровных участках 128 px (где их мало — 64 px), лежащих под фактурой целиком.
Вид плитки — какой вид своей плитки ближе: pulp (зернистая бумага: зерно и волокна), paper (мятая бумага:
заломы и грани), stone (тонкие прожилки на гладком поле), canvas (повтор нитей); с уверенностью числом и словом
и основанием. «Не определён» — два кандидата и «выбрать глазами по вырезке 1:1» — когда признак держится на шуме:
уверенность низкая, мягкие пятна без линий, зерно без волокон поверх крупного рельефа, дерево (своего вида нет),
яркость у края шкалы (почти белая плитка), малый разброс (σ меньше 1.8), редкие тёмные выбросы вместо прожилок,
слабые штрихи (эксцесс меньше 3) поверх сильного рельефа (мятая бумага в JPEG с шумом), плитка мельче 48 px
(рисунок не разбирается).
В выводе — вердикт «крупная фактура: есть / нет», плитка и её вид, наложение по тону секций и рецепт с командой
surface-tile.mjs --kind <вид> --size <период> (у ткани — ещё --thread <шаг>, у зернистой бумаги — --dir <угол>);
как класть — templates/surface.css. compare: строка «вид плитки» (другой вид — подсказка, не FAIL; вида в замере
нет — «не снимался»); мимо допуска только тёмные поля (color-burn или яркость ниже 130) — совет про отдельную
плитку (--surface-tile-dark); тёмные поля донора и сайта в разных полосах замера — подсказка «не сверены»
с ориентиром в процентах, вердикт прежний.
Зерно: слоёв зерна нет — «зерна нет», даже когда на снимке есть σ: это шум самих картинок (тёмные фотографии,
сжатие). Исключение — бледная шум-плитка в фоне блока.

Не различает и не видит: фактуры с σ > 12 (контрастное дерево, бетон, тёмный мрамор) — «контрастная картинка»;
приглушённая или затемнённая фотография в фоне блока с σ до 12 и ровным разбросом по площади может пройти как
фактура — смотреть вырезку 1:1; мрамор с крупными разводами и затемнённая подложка отсеиваются как «общий уклон»;
полупрозрачная плитка с крупными пятнами — «полупрозрачная картинка»; волокнистая бумага и доски с деталями в
один пиксель (файл одинарной плотности или уменьшенный вдвое: признаки считаются в пикселях файла) — «шум»; фон колонки уже 60 % окна; для дерева своего вида плитки нет;
фактура за окном-воротами меряется под ним (SITE_REWORK_DISMISS); вид на плитке мельче 448 px — с пониженной
уверенностью.

Вердикты: OK — совпадает/есть; WARN — не измерено или гаснет; FAIL — не как у донора (compare, код 1).
Строгий CSP страницы: слой для прохода «без слоя» прячется таблицей adoptedStyleSheets (<style> там не действует).
Коды: 0 — готово; 1 — compare с FAIL, неверные аргументы, ошибка замера или провал в selftest; 2 — у compare не два аргумента.`;

const vb = (b) => (b === true ? 'да' : b === false ? 'нет' : b == null ? '—' : String(b));
function fmtBand(x) {
  if (!x) return '—';
  if (x.status === 'не измерено') return `не измерено (ровных плиток ${x.tiles}${x.tiles ? `, справочно σ ${x.sd}` : ''})`;
  return `σ ${x.sd} (p90 ${x.sd_p90}), lag1 ${x.lag1 ?? '—'}${x.flicker != null ? `, кипение ${x.flicker}` : ''}, Y ${Math.round(x.y)}, плиток ${x.tiles} — ${x.status}`;
}
function printBands(g, title) {
  console.log(`${title}:`);
  console.log(`  тёмный:  ${fmtBand(g.dark)}`);
  console.log(`  средний: ${fmtBand(g.mid)}`);
  console.log(`  светлый: ${fmtBand(g.light)}`);
}
function printLayer(L) {
  console.log(`  #${L.k} ${L.el}${L.pseudo || ''} [${L.kind}; ${L.reason.join(', ')}]: ${L.position}${L.fixedBy && L.position !== 'fixed' ? ` (закреплён через ${L.fixedBy})` : ''}, z ${L.zIndex}, ${L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`}, opacity ${L.opacity} (итоговая ${L.effectiveOpacity}), наложение ${L.mixBlendMode}${L.blendChain.length ? ' / ' + L.blendChain.join(', ') : ''}, фон ${L.backgroundSize} ${L.backgroundRepeat}, image-rendering ${L.imageRendering}, pointer-events ${L.pointerEvents}${L.animation ? `, анимация ${L.animation}` : ''}${L.animChain.length ? ` [${L.animChain.join('; ')}]` : ''}${L.mediaRules && L.mediaRules.length ? `, @media ${L.mediaRules.join(' | ')}` : ''}; без слоя — ${L.hide === 'background' ? 'убрать картинку шума из фона' : L.hide === 'filter' ? 'filter:none' : 'спрятать'}`);
  const f = L.file;
  if (f && f.error) console.log(`     файл: ${f.error}`);
  else if (f) console.log(`     файл ${f.file}: ${f.format} ${f.width}×${f.height}, ${Math.round(f.bytes / 1024)} КБ, кадров ${f.pages}${f.frameMs ? ` по ${f.frameMs} мс` : ''}; яркость ${f.frames[0].mean}±${f.frames[0].sd}, lag1 ${f.frames[0].lag1}, альфа ${f.frames[0].alphaMean}, цветность ${f.frames[0].chroma}, уровней ${f.frames[0].levels}${f.frameCorr.length ? `, связь кадров ${f.frameCorr.join('/')}` : ''}${f.noiseLike ? ', шум' : ', не похоже на шум'}${f.saved ? ` → ${path.basename(f.saved)} (только для замера)` : ''}`);
  if (L.svg) console.log(`     feTurbulence ${L.svg.type} baseFrequency ${L.svg.baseFrequency} octaves ${L.svg.numOctaves}${L.svg.alphaTable != null ? `, feFuncA ${L.svg.alphaTable}` : ', альфа фильтра не выставлена'}`);
}
function printResult(r) {
  console.log(`\n== ${r.viewport.name} ${r.viewport.width}×${r.viewport.height}@${r.viewport.dpr} — ${r.url}`);
  console.log(`слоёв фактуры ${r.layers.length}, feTurbulence в документе ${r.svgNoise.length}${r.patterns && r.patterns.length ? `, отброшено кандидатов ${r.patterns.length}` : ''}; body::after ${r.bodyAfterUsed ? 'занят' : 'свободен'}`);
  if (r.hideVia === 'adopted') console.log('  проход «без слоя»: CSP страницы не применяет вставленный <style> — слой спрятан таблицей adoptedStyleSheets');
  for (const L of r.layers) printLayer(L);
  for (const p of (r.patterns || []).slice(0, 4)) console.log(`  – ${p.el}: не слой — ${p.why}`);
  printBands(r.grain, `зерно на снимках окна (${r.screens.length} экр.)`);
  if (r.contribution) {
    const c = r.contribution; const li = r.lift || {};
    const one = (x, l) => (x.status === 'не измерено' ? 'не измерено' : `σ ${x.sd}${l != null ? `, подъём ${l}` : ''}`);
    console.log(`вклад слоёв (со слоем − без): тёмный ${one(c.dark, li.dark)}; средний ${one(c.mid, li.mid)}; светлый ${one(c.light, li.light)}`);
  }
  const bo = r.boil;
  console.log(`кипение: ${vb(bo.boils)}${bo.ratio != null ? ` (снимки через 250 мс: ${bo.flicker} при σ ${bo.sd}, доля ${bo.ratio})` : ''}${bo.frames ? `; частота — ${bo.frames} × ${bo.frameMs} мс (${bo.source}${bo.of ? `, ${bo.of}` : ''})` : bo.smooth ? `; плавная анимация ${bo.cycleMs} мс (${bo.source})` : ''}`);
  const st = r.status === 'есть' ? 'OK' : 'WARN';
  console.log(`${st.padEnd(4)} зерно ${r.viewport.name}: ${r.status}${r.statusNote ? ` — ${r.statusNote}` : ''}`);
  for (const d of r.diagnosis) console.log(`WARN ${d}`);
  if (r.crop_dark || r.crop_light) console.log(`     вырезы ×6: ${[r.crop_dark, r.crop_mid, r.crop_light].filter(Boolean).map((f) => path.basename(f)).join(', ')}`);
  printSurface(r);
}
/* блок «крупная фактура» одного экрана; у замера старой версии (поля surface нет) — ничего */
function printSurface(r) {
  const S = r.surface; if (!S) return;
  const vp = r.viewport.name;
  if (!(S.layers || []).length) { console.log(`     крупная фактура ${vp}: нет — ${S.statusNote}`); return; }
  const T = S.tile;
  console.log(`крупная фактура (картинка-плитка): слоёв ${S.layers.length}, мелких блоков с той же плиткой ${S.usersCount || 0}`);
  console.log(`  плитка ${T.file}: ${T.format} ${T.width}×${T.height}, ${Math.round(T.bytes / 1024)} КБ; яркость ${T.mean} ± ${T.sd}, lag1 ${T.lag1}/${T.lag1v}, цветность ${T.chroma}${T.seam ? `, шов ${T.seam.x} по ширине и ${T.seam.y} по высоте (${T.seam.max > SEAM_FAIL ? 'стык виден' : T.seam.max > SEAM_WARN ? 'стык возможен' : 'бесшовная'})` : ''}${T.saved ? ` → ${path.basename(T.saved)} (только для замера)` : ''}`);
  if (T.alpha != null) console.log(`     плитка полупрозрачная (альфа ${T.alpha}): яркость ± σ — какой она выходит на белом поле; в файле ${T.raw.mean} ± ${T.raw.sd}`);
  if (T.kind) console.log(`  вид плитки: ${kindLine(T.kind)}`);
  for (const L of S.layers) {
    const s = L.surf;
    console.log(`  #${L.k} ${L.el}${L.pseudo || ''} [${s.via}; ${L.reason.join(', ')}]: ${L.coversViewport ? 'весь экран' : `${L.rect.w}×${L.rect.h}`}, фон под ней ${s.tone ? `${TONE[s.tone]} (Y ${Math.round(s.y)}${s.toneBy === 'цвет фона' ? ', по цвету блока' : ''})` : 'не определён'}, наложение ${s.blend}${s.opacity < 0.98 ? `, прозрачность ${s.opacity}` : ''}, показ ${s.shown.size} ${s.shown.repeat}${s.shown.px ? ` (${s.shown.px} px)` : ''}${s.sd != null ? `; σ ${s.sd}, подъём ${s.lift} (участков ${s.blocks} по ${s.blockSize} px)` : '; на снимках не измерена'}${s.hidden ? '; спрятан (итоговая прозрачность 0)' : ''}${(L.mediaOff || []).length ? `; выключена: ${L.mediaOff.map((m) => `@media ${m.cond} (${m.how})`).join(', ')}` : ''}`);
  }
  if ((S.users || []).length) console.log(`  мелкие блоки: ${S.users.slice(0, 8).map((U) => `${U.count} × ${U.el} (фон ${U.tone ? TONE[U.tone] : '?'}, ${U.blend})`).join('; ')}${S.users.length > 8 ? ` и ещё ${S.users.length - 8} групп` : ''}`);
  const one = (k) => { const b = surfaceBandOf(S, k); return b.status === 'не измерено' ? `не измерено (участков ${b.blocks || 0})` : `σ ${b.sd} (p90 ${b.sd_p90}), подъём ${b.lift}, Y ${Math.round(b.y)}, участков ${b.blocks}${b.size === 64 ? ' по 64 px' : ''}${b.shown != null && b.shown < SURFACE_MIN_BLOCKS ? ' (под фактурой их нет)' : ''} — ${b.status}`; };
  console.log('  на снимках (вклад «с плиткой − без», ровные участки 128 px под фактурой):');
  console.log(`    тёмный:  ${one('dark')}`);
  console.log(`    средний: ${one('mid')}`);
  console.log(`    светлый: ${one('light')}`);
  console.log(`${(S.status === 'есть' ? 'OK' : 'WARN').padEnd(4)} крупная фактура ${vp}: ${S.status}${S.statusNote ? ` — ${S.statusNote}` : ''}`);
  for (const d of S.diagnosis || []) console.log(`WARN ${d}`);
}
function printRecipe(rec) {
  console.log('\nрецепт (своя плитка + templates/grain.css):');
  if (rec.none) { for (const n of rec.notes) console.log(`  ${n}`); printSurfaceRecipe(rec.surface); return; }
  console.log(`  где есть: ${Object.entries(rec.present).map(([k, v]) => `${k} ${vb(v)}`).join(', ')}; --grain-min-width: ${rec.minWidth}px (${rec.minWidthNote})`);
  console.log(`  --grain-opacity: ${rec.opacity}   (${rec.blendNote})`);
  console.log(`  --grain-blend: ${rec.blend}; --grain-px: ${rec.px}; --grain-rendering: ${rec.rendering} (как у донора)`);
  console.log(`  движение: ${rec.boil ? `--grain-frames: ${rec.frames}; --grain-frame-ms: ${rec.frameMs}ms (${rec.boilSource}) → animation grain-boil ${rec.frames * rec.frameMs}ms steps(1), ${rec.frames} сдвига` : 'не кипит — без анимации'}`);
  if (rec.lift != null) console.log(`  подъём чёрного у донора: ${rec.lift} ур.`);
  console.log(`  плитка: ${rec.tileCmd}`);
  for (const n of rec.notes) console.log(`  · ${n}`);
  printSurfaceRecipe(rec.surface);
}
/* рецепт крупной фактуры; нет её (или замер старый) — ни строки: вывод рецепта зерна остаётся прежним */
function printSurfaceRecipe(S) {
  if (!S || S.none) return;
  const sd = (k) => (S.sd[k] == null ? '—' : `${S.sd[k]} (подъём ${S.lift[k]})`);
  const hidden = S.sections.filter((x) => x.hidden).length;
  console.log('\nрецепт крупной фактуры (своя плитка surface-tile.mjs + templates/surface.css):');
  console.log(`  где есть: ${Object.entries(S.present).map(([k, v]) => `${k} ${vb(v)}`).join(', ')}; --surface-min-width: ${S.minWidth}px (${S.minWidthNote})`);
  console.log(`  плитка донора: ${S.tile.width}×${S.tile.height}, яркость ${S.tile.mean} ± ${S.tile.sd}, показ ${S.shown.size} ${S.shown.repeat}${S.shown.px ? ` (${S.shown.px} px)` : ''}, ${S.via} → своя: --surface-size: ${S.size}px, яркость ${S.tileMean} ± ${S.tileSd}`);
  console.log(`  наложение по тону секции у донора: светлые поля ${S.blend.light || '—'}, тёмные ${S.blend.dark || '—'} (граница — яркость поля ${SURFACE_DARK_Y}) → --surface-blend: ${S.use.light} (светлые и цветные поля); --surface-blend-dark: ${S.use.dark} (тёмные)`);
  console.log(`  сила на снимке, σ: тёмный ${sd('dark')}, средний ${sd('mid')}, светлый ${sd('light')}`);
  console.log(`  секций с фактурой: ${S.sections.length}${hidden ? ` (спрятанных ${hidden})` : ''}${S.smallCount ? `; мелких блоков с той же плиткой ${S.smallCount}` : ''}; прозрачность слоя ${S.opacity}`);
  console.log(`  где выключена: ${S.off.length ? S.off.map((e) => `@media ${e.cond} — ${e.how} (${e.el ? `только ${e.el}` : e.layers === e.of ? 'все секции' : `${e.layers} из ${e.of} секций`})`).join('; ') : 'правил @media, которые её выключают, нет'}; в печати ${S.print}; при «меньше движения» ${S.reducedMotion}`);
  if (S.kind) console.log(`  вид плитки: ${kindLine(S.kind)}`);
  console.log(`  плитка: ${S.tileCmd}`);
  for (const n of S.notes) console.log(`  · ${n}`);
}
function writeTokens(file, block) {
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const re = /\/\* texture:start \*\/[\s\S]*?\/\* texture:end \*\//;
  /* замена функцией: строкой-заменой «$&», «$'», «$`» из адреса в блоке подставляли старый блок и хвост файла */
  const next = re.test(prev) ? prev.replace(re, () => block) : (prev ? prev.replace(/\s*$/, '\n\n') : '') + block + '\n';
  ensureDir(path.dirname(path.resolve(file))); fs.writeFileSync(file, next);
}
/**
 * Файл итога одиночного замера: <out>/texture.json, с меткой (--label) — <out>/texture-<метка>.json. До 06.10 метка
 * шла только в имена снимков, и два замера в одну папку (сайт и донор) затирали texture.json друг друга: в отчёте
 * донора оказалась фактура сайта (03.10, прогон bbq-fresh).
 */
export function textureJsonFile(out, label = null) {
  const l = label === null || label === undefined || label === true ? '' : String(label).trim().replace(/[^\w.а-яё-]+/gi, '_');
  return path.join(out, l ? `texture-${l}.json` : 'texture.json');
}
/** Итог на этом месте уже есть и он от другого адреса — текст WARN (файл будет перезаписан), иначе null. */
export function textureOverwriteNote(file, url) {
  const prev = readJson(file); if (!prev || !prev.url) return null;
  const key = (u) => { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/(index\.html?)?$/, ''); } catch { return String(u); } };
  if (key(prev.url) === key(url)) return null;
  return `${path.basename(file)} в этой папке был от другого адреса (${prev.url}${prev.takenAt ? `, ${String(prev.takenAt).slice(0, 16).replace('T', ' ')}` : ''}) — перезаписан. Два адреса в одной папке — с меткой: --label имя (итог texture-имя.json) или своя --out`;
}
async function runSet(url, vps, out, screens, extras, tag = null) {
  const list = [];
  const browser = await launch();
  try {
    for (const [vpName, vp] of vps) {
      console.log(`… ${tag ? tag + ': ' : ''}${url} на ${vpName}`);
      const r = await textureOnUrl(url, { viewport: vp, browser, out, label: `${tag ? tag + '-' : ''}${slugFromUrl(url).slice(0, 40)}-${vpName}`, screens, extras });
      r.viewport.name = vpName;
      list.push(r);
    }
  } finally { await browser.close().catch(() => {}); }
  return list;
}
const loadSet = (file) => {
  const j = readJson(String(file)); if (!j) throw new Error(`не читается ${file}`);
  const list = Array.isArray(j) ? j : j.results || [j];
  if (!list.length || list.some((r) => !r || !r.viewport || !r.grain)) throw new Error(`${file} — не texture.json замера (нет results[] с viewport и grain)`);
  return list;
};
/* адрес страницы или texture.json прошлого замера — до папок и браузера. Путь на .json (не http, https, file, data, about)
   без файла — «нет файла», а не «Invalid URL» или переход браузера на C:/… с ERR_FILE_NOT_FOUND */
const PAGE_URL = /^(https?|file|data|about):$/i;
function inputKind(s, die) {
  const str = String(s);
  let url = false; try { url = PAGE_URL.test(new URL(str).protocol); } catch { /* не адрес */ }
  if (url) return 'url';
  if (/\.json$/i.test(str)) return fs.existsSync(str) ? 'json' : die(`нет файла ${str}`);
  return die(`Неверный адрес «${str}»: нужен полный адрес — http://…, https://… или file:///… — или texture.json прошлого замера  (подробно: --help)`);
}

/* ======================================================================
   9. selftest: разбор файлов, участки, рецепт, сверка и аргументы — без браузера; стенды
      fixtures/texture (своя плитка в фоне и слоем, зерно, страница без фактуры) — в браузере
   ====================================================================== */
async function selftest({ browser = true } = {}) {
  const os = await import('node:os'); const { spawnSync } = await import('node:child_process'); const { pathToFileURL } = await import('node:url');
  const ST = await import('./surface-tile.mjs'); const GT = await import('./grain-tile.mjs');
  const sharp = needSharp();
  let n = 0, bad = 0;
  const say = (ok, msg) => { n++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };
  const SELF = fileURLToPath(import.meta.url); const FIX = path.join(HERE, 'fixtures', 'texture');
  /* в имени папки нет слов texture, paper, grain: по ним в пути файла слой считается «шумным по имени» */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-tx-selftest-'));
  const run = (args) => spawnSync(process.execPath, [SELF, ...args], { cwd: tmp, encoding: 'utf8', timeout: 300000, windowsHide: true });
  const text = (r) => `${r.stdout || ''}${r.stderr || ''}`;
  const png = (buf, w, h, ch = 1) => sharp(Buffer.from(buf), { raw: { width: w, height: h, channels: ch } }).png().toBuffer();
  const whyOf = (t) => (t.surfaceWhy || []).join('; ');
  try {
    /* ---- 1. файл: крупная фактура или нет, и почему ---- */
    const N = 384; const tiles = {};
    for (const kind of Object.keys(ST.KINDS)) {
      tiles[kind] = (await ST.renderTile(ST.makeField({ kind, size: N, seed: 11 }), N, {})).data;
      const t = await analyzeTile(tiles[kind], { name: kind });
      say(t.surfaceLike && !t.noiseLike && !!t.seam && t.seam.max <= SEAM_WARN, `своя плитка ${kind}: крупная фактура (σ ${t.frames[0].sd}, lag1 ${t.frames[0].lag1}/${t.frames[0].lag1v}), не шум, шов ${t.seam ? t.seam.max : '—'}${t.surfaceLike ? '' : ` — ${whyOf(t)}`}`);
    }
    const tileY = (await lumaOf(tiles.stone)).Y;   /* яркость плитки камня N×N — материал для синтетики ниже */
    let seed = 5; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    {
      const [g1] = GT.makeFrames({ size: 256, levels: 16, px: 1, frames: 1, mode: 'gray', seed: 7 });
      const t1 = await analyzeTile(await png(g1, 256, 256), { name: 'шум' });
      say(t1.noiseLike && !t1.surfaceLike, `плитка зерна grain-tile.mjs: шум, не крупная фактура (${whyOf(t1)})`);
      const [g8] = GT.makeFrames({ size: 256, levels: 16, px: 8, frames: 1, mode: 'gray', seed: 7 });
      const t8 = await analyzeTile(await png(g8, 256, 256), { name: 'шум 8 px' });
      say(!t8.surfaceLike && /контрастная/.test(whyOf(t8)), `зерно 8 px (lag1 ${t8.frames[0].lag1}): не крупная фактура — ${whyOf(t8)}`);
      const weak = Buffer.alloc(256 * 256); for (let i = 0; i < weak.length; i++) weak[i] = Math.round(250 + (rnd() - 0.5) * 10);
      const tw = await analyzeTile(await png(weak, 256, 256), { name: 'слабый шум' });
      say(!tw.surfaceLike && !tw.noiseLike && /не связаны/.test(whyOf(tw)), `слабый шум на белом (250 ± ${tw.frames[0].sd}): ни зерно-плитка, ни крупная фактура — ${whyOf(tw)}`);
      const M = 600; const ramp = Buffer.alloc(M * M), pale = Buffer.alloc(M * M, 250), photo = Buffer.alloc(M * M), flat = Buffer.alloc(M * M, 247);
      for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
        ramp[y * M + x] = Math.round(235 + 16 * (x + y) / (2 * M));
        photo[y * M + x] = Math.max(0, Math.min(255, Math.round(128 + 55 * Math.sin(x / 90) * Math.cos(y / 70) + 30 * Math.sin((x + y) / 40))));
      }
      /* бледные мягкие пятна только в одной четверти — рисунок, а не фактура по всему полю */
      for (let k = 0; k < 14; k++) { const cx = 30 + rnd() * 240, cy = 30 + rnd() * 240, r = 14 + rnd() * 16; for (let y = Math.max(0, Math.floor(cy - 3 * r)); y < Math.min(M, cy + 3 * r); y++) for (let x = Math.max(0, Math.floor(cx - 3 * r)); x < Math.min(M, cx + 3 * r); x++) { const d = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r); pale[y * M + x] = Math.round(pale[y * M + x] - 9 * Math.exp(-d)); } }
      const tr = await analyzeTile(await png(ramp, M, M), { name: 'градиент' });
      say(!tr.surfaceLike && /уклон/.test(whyOf(tr)), `плавный градиент (σ ${tr.frames[0].sd}, lag1 ${tr.frames[0].lag1}): не фактура — ${whyOf(tr)}`);
      const tp = await analyzeTile(await png(pale, M, M), { name: 'бледный рисунок' });
      say(!tp.surfaceLike && /не по всей площади/.test(whyOf(tp)), `бледный рисунок в углу (σ ${tp.frames[0].sd}): не фактура — ${whyOf(tp)}`);
      const tf = await analyzeTile(await png(photo, M, M), { name: 'фото' });
      say(!tf.surfaceLike && /контрастная/.test(whyOf(tf)), `контрастная картинка (σ ${tf.frames[0].sd}): не фактура — ${(tf.surfaceWhy || [])[0]}`);
      const tfl = await analyzeTile(await png(flat, M, M), { name: 'заливка' });
      say(!tfl.surfaceLike && /ровная заливка/.test(whyOf(tfl)), `ровная заливка: не фактура — ${(tfl.surfaceWhy || [])[0]}`);
      const dots = Buffer.alloc(24 * 24, 250); for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (Math.hypot(x - 12, y - 12) < 4) dots[y * 24 + x] = 232;
      const td = await analyzeTile(await png(dots, 24, 24), { name: 'узор' });
      say(!td.surfaceLike && /мелкая плитка/.test(whyOf(td)), `узор 24 px: не фактура — ${whyOf(td)}`);
      const rgba = Buffer.alloc(N * N * 4), kraft = Buffer.alloc(N * N * 3), blobs = Buffer.alloc(N * N * 3);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x, v = tileY[i], c = 3 * Math.sin(x / 37) * Math.cos(y / 29);
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = Math.round(v); rgba[i * 4 + 3] = 128;
        kraft[i * 3] = Math.round(v * 0.96); kraft[i * 3 + 1] = Math.round(v * 0.9); kraft[i * 3 + 2] = Math.round(v * 0.78);
        /* цвет гуляет, яркость почти нет: ΔR и ΔB подобраны так, что 0.2126·ΔR + 0.0722·ΔB = 0 */
        blobs[i * 3] = Math.round(v - 12 + 6 * c); blobs[i * 3 + 1] = Math.round(v - 12); blobs[i * 3 + 2] = Math.round(v - 12 - 17.7 * c);
      }
      /* полупрозрачная плитка принимается, только если крупных пятен в ней нет: зернистая бумага — да (как у dogfish.com),
         камень с пятнами — нет (так же выглядит на сером фотография в png с ровной альфой: 26 таких проходили как фактура) */
      const pulpY = (await lumaOf(tiles.pulp)).Y; const rgbaP = Buffer.alloc(N * N * 4); for (let i = 0; i < N * N; i++) { rgbaP[i * 4] = rgbaP[i * 4 + 1] = rgbaP[i * 4 + 2] = Math.round(pulpY[i]); rgbaP[i * 4 + 3] = 128; }
      const ta = await analyzeTile(await png(rgbaP, N, N, 4), { name: 'полупрозрачная' });
      const tpo = await analyzeTile(tiles.pulp, { name: 'зернистая бумага' }); const ov = ta.frames[0].over;
      say(ta.surfaceLike && !!ov && Math.abs(ov.white.sd - tpo.frames[0].sd / 2) <= 0.3 && Math.abs(ov.white.mean - (255 - (255 - tpo.frames[0].mean) / 2)) <= 1 && !!ta.kind && ta.kind.kind === tpo.kind.kind && ta.frames[0].feat.low <= SURFACE.thinLowMax, `полупрозрачная плитка зернистой бумаги (альфа ${ta.frames[0].alphaMean}, пятна крупнее 49 px ${ta.frames[0].feat ? ta.frames[0].feat.low : '—'}): крупная фактура, вид тот же, что у непрозрачной (${ta.kind ? ta.kind.kind : '—'}); на белом поле ${ov ? `${ov.white.mean} ± ${ov.white.sd}` : '—'} при ${tpo.frames[0].mean} ± ${tpo.frames[0].sd} в файле${ta.surfaceLike ? '' : ` — ${whyOf(ta)}`}`);
      const tas = await analyzeTile(await png(rgba, N, N, 4), { name: 'полупрозрачный камень' });
      say(!tas.surfaceLike && tas.surfaceWhy.length === 1 && /полупрозрачная картинка с крупными пятнами/.test(whyOf(tas)), `полупрозрачная картинка с крупными пятнами (свой камень с альфой 0.5, пятна ${tas.frames[0].feat ? tas.frames[0].feat.low : '—'} при пороге ${SURFACE.thinLowMax}): не фактура — так же выглядит фотография в png с ровной альфой (ограничение названо в справке)`);
      const ghost = Buffer.alloc(N * N * 4); for (let i = 0; i < N * N; i++) { const v = tileY[i]; ghost[i * 4] = ghost[i * 4 + 1] = ghost[i * 4 + 2] = Math.round(v); ghost[i * 4 + 3] = 6; }
      const tg0 = await analyzeTile(await png(ghost, N, N, 4), { name: 'почти прозрачная' });
      say(!tg0.surfaceLike && /почти прозрачная/.test(whyOf(tg0)), `почти прозрачная плитка (альфа ${tg0.frames[0].alphaMean}): не фактура — ${(tg0.surfaceWhy || [])[0]}`);
      const tk = await analyzeTile(await png(kraft, N, N, 3), { name: 'крафт' });
      say(tk.surfaceLike && tk.frames[0].chroma > 12, `тонированная плитка (крафт, цветность ${tk.frames[0].chroma}, средний цвет ${tk.frames[0].tint}): крупная фактура — тон не мешает${tk.surfaceLike ? '' : ` — ${whyOf(tk)}`}`);
      const tb = await analyzeTile(await png(blobs, N, N, 3), { name: 'цветные пятна' });
      say(!tb.surfaceLike && tb.surfaceWhy.length === 1 && /цвет меняется/.test(whyOf(tb)), `цветные пятна при той же яркости (σ яркости ${tb.frames[0].sd}, разброс цвета ${tb.frames[0].chromaSd}): не фактура — ${whyOf(tb)}`);
    }

    /* ---- 1а. вид плитки и случаи набора калибровки (02.10.2026) ---- */
    {
      const kindTxt = (t) => (t.kind ? `${t.kind.kind || 'не определён'} (${t.kind.conf}, ${t.kind.word}) — ${t.kind.basis}` : `не фактура: ${whyOf(t)}`);
      for (const kind of Object.keys(ST.KINDS)) {
        const t = await analyzeTile(tiles[kind], { name: kind });
        say(!!t.kind && t.kind.kind === kind && t.kind.conf >= KIND.fair, `вид своей плитки ${kind}: ${kindTxt(t)}`);
      }
      /* «не определено»: камень без прожилок — мягкие пятна, ни линий, ни зерна */
      const soft = await analyzeTile((await ST.renderTile(ST.makeField({ kind: 'stone', size: 512, seed: 11, veins: 0 }), 512, {})).data, { name: 'пятна' });
      say(soft.surfaceLike && !!soft.kind && soft.kind.kind == null && soft.kind.conf < KIND.fair && (soft.kind.alt || []).length === 2, `камень без прожилок (мягкие пятна): крупная фактура, вид не определён — два кандидата ${soft.kind && soft.kind.alt ? soft.kind.alt.join(' и ') : '—'} (${kindTxt(soft)})`);
      /* «не определено»: дерево — мелкие штрихи вдоль одной оси; своего вида нет */
      const M = 640; const wood = new Float32Array(M * M).fill(244);
      for (let k = 0; k < 300; k++) { const y = Math.floor(rnd() * (M - 2)), x0 = Math.floor(rnd() * M), len = 60 + Math.floor(rnd() * 300), a = (rnd() < 0.85 ? -1 : 1) * (5 + rnd() * 10); for (let x = x0; x < Math.min(M, x0 + len); x++) { const v = a * Math.sin(Math.PI * (x - x0 + 0.5) / len); wood[y * M + x] += v; wood[(y + 1) * M + x] += v * 0.8; } }
      const woodB = Buffer.alloc(M * M); for (let i = 0; i < M * M; i++) woodB[i] = Math.max(0, Math.min(255, Math.round(wood[i] + (rnd() - 0.5) * 1.2)));
      const tw2 = await analyzeTile(await png(woodB, M, M), { name: 'дерево' });
      say(tw2.surfaceLike && !!tw2.kind && tw2.kind.kind == null && /дерево/.test(tw2.kind.basis) && tw2.frames[0].feat.coh >= KIND.woodCoh, `штрихи вдоль одной оси (дерево; σ ${tw2.frames[0].sd}, направленность ${tw2.frames[0].feat ? tw2.frames[0].feat.coh : '—'}): крупная фактура, вид не определён — ${kindTxt(tw2)}`);
      /* ткань с нитью в полтора пикселя: соседние пиксели не связаны (lag1 < 0), но рисунок повторяется */
      const fine = Buffer.alloc(300 * 300); for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) fine[y * 300 + x] = Math.round(60 + 5 * Math.cos(2 * Math.PI * x / 3) + 5 * Math.cos(2 * Math.PI * y / 3) + (rnd() - 0.5) * 4);
      const tf3 = await analyzeTile(await png(fine, 300, 300), { name: 'мелкая ткань' });
      say(tf3.surfaceLike && !tf3.noiseLike && Math.min(tf3.frames[0].lag1, tf3.frames[0].lag1v) < SURFACE.lagMin && !!tf3.kind && tf3.kind.kind === 'canvas' && tf3.frames[0].feat.per.x.lag === 3, `ткань с шагом 3 px (lag1 ${tf3.frames[0].lag1}/${tf3.frames[0].lag1v} — по прежнему правилу «не связаны»): крупная фактура по повтору рисунка — ${kindTxt(tf3)}`);
      /* мятая бумага с шумом сжатия: lag1 ниже 0.8, но заломы крупные (случай tijuanaflats.com) */
      const noisy = Buffer.alloc(N * N); const pY = (await lumaOf(tiles.paper)).Y; for (let i = 0; i < N * N; i++) noisy[i] = Math.max(0, Math.min(255, Math.round(pY[i] + (rnd() - 0.5) * 8)));
      const tn = await analyzeTile(await png(noisy, N, N), { name: 'бумага с шумом' });
      say(tn.surfaceLike && Math.min(tn.frames[0].lag1, tn.frames[0].lag1v) < SURFACE.lagMin && tn.frames[0].feat.fine > SURFACE.fineSure, `мятая бумага с шумом сжатия (lag1 ${tn.frames[0].lag1}/${tn.frames[0].lag1v}, доля мельче 5 px ${tn.frames[0].feat ? tn.frames[0].feat.fine : '—'}): крупная фактура — заломы крупнее зерна${tn.surfaceLike ? '' : ` — ${whyOf(tn)}`}`);
      say(!!tn.kind && tn.kind.kind == null && (tn.kind.alt || []).join() === 'paper,pulp', `мятая бумага с шумом сжатия: вид не определён, кандидаты ${tn.kind && tn.kind.alt ? tn.kind.alt.join(' и ') : '—'} — ${kindTxt(tn).slice(0, 150)}`);
      /* крупное зерно 4 px без рисунка: соседи связаны слабо, а ни пятен, ни линий нет — это зерно (grain-tile --px 4) */
      const blocky = Buffer.alloc(256 * 256); { const c = new Float32Array(64 * 64); for (let i = 0; i < c.length; i++) c[i] = (rnd() - 0.5) * 10; for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) blocky[y * 256 + x] = Math.round(246 + c[(y >> 2) * 64 + (x >> 2)]); }
      const tb4 = await analyzeTile(await png(blocky, 256, 256), { name: 'зерно 4 px' });
      say(!tb4.surfaceLike && /не связаны|крупное зерно/.test(whyOf(tb4)), `зерно 4 px при слабом разбросе (σ ${tb4.frames[0].sd}, lag1 ${tb4.frames[0].lag1}): не крупная фактура — ${whyOf(tb4)}`);
      /* σ > 12: граница стоит на 12 — на наборе фактур контрастнее не встретилось (самая сильная — 11.6) */
      const F5 = ST.makeField({ kind: 'stone', size: 512, seed: 11 });
      const s11 = await analyzeTile((await ST.renderTile(F5, 512, { mean: 60, sd: 11 })).data, { name: 'камень σ 11' }), s16 = await analyzeTile((await ST.renderTile(F5, 512, { mean: 60, sd: 16 })).data, { name: 'камень σ 16' });
      say(s11.surfaceLike && !s16.surfaceLike && /контрастная/.test(whyOf(s16)), `тёмный камень σ ${s11.frames[0].sd} — крупная фактура; тот же рисунок при σ ${s16.frames[0].sd} — нет: ${(s16.surfaceWhy || [])[0]} (порог sdMax ${SURFACE.sdMax}; ограничение названо в справке)`);
      /* обманки: бледный орнамент плиткой, сетка в два тона, панель с рамкой */
      const P = 512; const orn = Buffer.alloc(P * P), grid = Buffer.alloc(P * P, 250), frame = Buffer.alloc(P * P);
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
        const dx = (x % 32) - 16, dy = (y % 32) - 16; orn[y * P + x] = Math.round(246 - 11 * Math.exp(-(dx * dx + dy * dy) / 9) + (rnd() - 0.5) * 1.6);
        if (x % 24 === 0 || y % 24 === 0) grid[y * P + x] = 238;
        const e = Math.min(x, y, P - 1 - x, P - 1 - y); frame[y * P + x] = Math.round(52 + (e >= 14 && e <= 17 ? 60 : 0) + (rnd() - 0.5) * 1.4);
      }
      const to = await analyzeTile(await png(orn, P, P), { name: 'орнамент' });
      say(!to.surfaceLike && /орнамент/.test(whyOf(to)), `бледный орнамент плиткой (σ ${to.frames[0].sd}, lag1 ${to.frames[0].lag1}/${to.frames[0].lag1v}, шаг ${to.frames[0].feat ? to.frames[0].feat.per.x.lag : '—'} px): не фактура — ${(to.surfaceWhy || [])[0]}`);
      const tgr = await analyzeTile(await png(grid, P, P), { name: 'сетка' });
      say(!tgr.surfaceLike && /в два тона|орнамент/.test(whyOf(tgr)), `сетка в два тона (σ ${tgr.frames[0].sd}): не фактура — ${whyOf(tgr).slice(0, 150)}`);
      const tfr = await analyzeTile(await png(frame, P, P), { name: 'рамка' });
      say(!tfr.surfaceLike && /немногих местах|не по всей площади/.test(whyOf(tfr)), `тёмная панель с рамкой (σ ${tfr.frames[0].sd}): не фактура — ${whyOf(tfr).slice(0, 170)}`);
      /* шов ткани: вырез с шириной, не кратной шагу нити, — скачка яркости нет, а рисунок сбит по фазе */
      const cF = Float32Array.from(ST.fieldToBytes(ST.makeField({ kind: 'canvas', size: 512, seed: 11 }), {})); const cw = 440, crop = new Float32Array(cw * cw);
      for (let y = 0; y < cw; y++) for (let x = 0; x < cw; x++) crop[y * cw + x] = cF[(y + 31) * 512 + x + 19];
      const sFull = seamOf(cF, 512, 512), sCrop = seamOf(crop, cw, cw);
      say(sFull.max <= SEAM_WARN && sCrop.max > SEAM_FAIL && !!sCrop.detail.phase.x && sCrop.detail.phase.x.edge < sCrop.detail.phase.x.inner - 0.25, `шов ткани: бесшовная плитка ${sFull.max}, вырез 440 px со сбитой фазой ${sCrop.max} (связь через край ${sCrop.detail.phase.x ? sCrop.detail.phase.x.edge : '—'} при ${sCrop.detail.phase.x ? sCrop.detail.phase.x.inner : '—'} внутри) — больше ${SEAM_FAIL}`);
    }

    /* ---- 1б. находки независимой проверки 02.10.2026: каждая — случаем, чтобы не вернулась ---- */
    {
      const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      const gray = (arr, w, h) => { const b = Buffer.alloc(w * h); for (let i = 0; i < w * h; i++) b[i] = Math.max(0, Math.min(255, Math.round(arr[i]))); return b; };
      const fit = (arr, mean, sd) => { let s = 0, s2 = 0; for (const v of arr) { s += v; s2 += v * v; } const m = s / arr.length, d = Math.sqrt(Math.max(1e-9, s2 / arr.length - m * m)); return Float32Array.from(arr, (v) => mean + (v - m) * sd / d); };
      const Q = 512;
      /* P1-2: мягкое зерно — шум, размытый на 1.6 px, и шум, увеличенный втрое: соседи связаны, а рисунка нет */
      const noise = new Float32Array(Q * Q); for (let i = 0; i < Q * Q; i++) noise[i] = 128 + gauss() * 40;
      const nb = await sharp(gray(noise, Q, Q), { raw: { width: Q, height: Q, channels: 1 } }).blur(1.6).raw().toBuffer({ resolveWithObject: true });
      const blurred = fit(Float32Array.from({ length: Q * Q }, (_, i) => nb.data[i * nb.info.channels]), 128, 10);
      const up = new Float32Array(Q * Q); { const c = new Float32Array(172 * 172); for (let i = 0; i < c.length; i++) c[i] = gauss(); for (let y = 0; y < Q; y++) for (let x = 0; x < Q; x++) { const fx = x / 3, fy = y / 3, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0; up[y * Q + x] = c[y0 * 172 + x0] * (1 - tx) * (1 - ty) + c[y0 * 172 + x0 + 1] * tx * (1 - ty) + c[(y0 + 1) * 172 + x0] * (1 - tx) * ty + c[(y0 + 1) * 172 + x0 + 1] * tx * ty; } }
      for (const [name, arr] of [['шум, размытый на 1.6 px', blurred], ['шум, увеличенный втрое', fit(up, 246, 4)]]) {
        const t = await analyzeTile(await png(gray(arr, Q, Q), Q, Q), { name }); const F = t.frames[0].feat;
        say(!t.surfaceLike && /мягкое или крупное зерно/.test(whyOf(t)) && F.fine <= SURFACE.fineSure, `${name} (σ ${t.frames[0].sd}, доля мельче 5 px ${F.fine}, пятна ${F.low}, эксцесс ${F.kurt}): не крупная фактура — ${whyOf(t).slice(0, 120)}`);
      }
      /* P1-3: рисунок на ровном поле — линии, значки, орнамент с шагом 96 px и под углом; у всех эксцесс и асимметрия как у волокон */
      const flatField = () => new Float32Array(Q * Q).fill(247);
      /* мягкая точка в 3 px: линия выходит сглаженной, как у векторного рисунка, а не лесенкой в один пиксель */
      const dab = (A, x, y, ink) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const px = Math.round(x) + i, py = Math.round(y) + j; if (px < 0 || py < 0 || px >= Q || py >= Q) continue; const v = 247 - ink * (i === 0 && j === 0 ? 1 : i === 0 || j === 0 ? 0.6 : 0.3); if (v < A[py * Q + px]) A[py * Q + px] = v; } };
      const stroke = (A, x0, y0, x1, y1, ink) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let i = 0; i <= n; i++) dab(A, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, ink); };
      const ring = (A, cx, cy, r, ink) => { for (let a = 0; a < 360; a += 1) dab(A, cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180), ink); };
      const lines = flatField(); for (let k = 0; k < 14; k++) { let x = 0, y = 20 + k * 36 + rnd() * 10; while (x < Q) { const nx = x + 30 + rnd() * 50, ny = y + (rnd() - 0.5) * 40; stroke(lines, x, y, nx, ny, 22); x = nx; y = ny; } }
      const icons = flatField(); for (let k = 0; k < 60; k++) { const cx = rnd() * Q, cy = rnd() * Q, r = 6 + rnd() * 9; if (rnd() < 0.5) ring(icons, cx, cy, r, 20); else { stroke(icons, cx - r, cy - r, cx + r, cy + r, 20); stroke(icons, cx - r, cy + r, cx + r, cy - r, 20); } }
      const orn = flatField(); for (let y = 48; y < Q; y += 96) for (let x = 48; x < Q; x += 96) { ring(orn, x, y, 28, 18); stroke(orn, x - 40, y, x, y - 40, 18); stroke(orn, x, y - 40, x + 40, y, 18); stroke(orn, x + 40, y, x, y + 40, 18); stroke(orn, x, y + 40, x - 40, y, 18); }
      const rot = flatField(); { const ca = Math.cos(Math.PI / 6), sa = Math.sin(Math.PI / 6); for (let j = -8; j < 16; j++) for (let i = -8; i < 16; i++) { const u = i * 70, v = j * 70, x = u * ca - v * sa, y = u * sa + v * ca; if (x > -40 && y > -40 && x < Q + 40 && y < Q + 40) ring(rot, x, y, 22, 18); } }
      const jpg = (arr) => sharp(gray(arr, Q, Q), { raw: { width: Q, height: Q, channels: 1 } }).jpeg({ quality: 82 }).toBuffer();
      for (const [name, buf] of [['линии на заливке', await png(gray(lines, Q, Q), Q, Q)], ['значки вразброс, JPEG', await jpg(icons)], ['орнамент с шагом 96 px, JPEG', await jpg(orn)], ['орнамент под углом 30°', await png(gray(rot, Q, Q), Q, Q)]]) {
        const t = await analyzeTile(buf, { name }); const F = t.frames[0].feat;
        /* по прежним правилам они проходили: мелких деталей в меру, эксцесс и асимметрия есть — отсекает только ровное поле */
        say(!t.surfaceLike && /рисунок на ровном поле/.test(whyOf(t)) && F.fine <= SURFACE.fineMax && hasMarks(F) && F.calm >= SURFACE.calmMax && F.low < SURFACE.calmLow && F.field <= SURFACE.fieldMax, `${name} (σ ${t.frames[0].sd}, доля мельче 5 px ${F.fine}, эксцесс ${F.kurt}, асимметрия ${F.skew}; ровных клеток ${F.calm}, пятна ${F.low}): не фактура — ${whyOf(t).slice(0, 110)}`);
      }
      /* P1-3: фотография в png с ровной альфой 0.12 — на сером бледная, как фактура, но разброс у неё в крупных пятнах */
      { const rgbaF = Buffer.alloc(Q * Q * 4); for (let y = 0; y < Q; y++) for (let x = 0; x < Q; x++) { const i = y * Q + x; const v = Math.max(0, Math.min(255, Math.round(128 + 60 * Math.sin(x / 47) * Math.cos(y / 61) + 35 * Math.sin((x + 2 * y) / 23) + (rnd() - 0.5) * 18))); rgbaF[i * 4] = rgbaF[i * 4 + 1] = rgbaF[i * 4 + 2] = v; rgbaF[i * 4 + 3] = 31; }
        const t = await analyzeTile(await png(rgbaF, Q, Q, 4), { name: 'фото с альфой' });
        say(!t.surfaceLike && /полупрозрачная картинка с крупными пятнами/.test(whyOf(t)) && t.frames[0].sdOver <= SURFACE.sdMax, `фотография в png с альфой ${t.frames[0].alphaMean} (на сером σ ${t.frames[0].sdOver}, пятна крупнее 49 px ${t.frames[0].feat ? t.frames[0].feat.low : '—'}): не фактура — ${whyOf(t).slice(0, 120)}`); }
      /* P1-3: общий уклон 0.7…0.8 — приглушённая фотография; у плитки до 512 px тот же разброс допустим (свой камень 256–512 px — до 0.75) */
      { const B = 640; const base = Float32Array.from(ST.fieldToBytes(ST.makeField({ kind: 'paper', size: B, seed: 11 }), { mean: 200, sd: 4 }));
        const withRamp = (a) => { const o = new Float32Array(B * B); for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) o[y * B + x] = base[y * B + x] + a * ((x + y) / (2 * B) - 0.5); return o; };
        let lo = 0, hi = 60, tm = null; for (let it = 0; it < 14; it++) { const a = (lo + hi) / 2; tm = await analyzeTile(await png(gray(withRamp(a), B, B), B, B), { name: 'уклон' }); const sp = tm.frames[0].parts.spread; if (sp > 0.77) hi = a; else if (sp < 0.73) lo = a; else break; }
        const sp = tm.frames[0].parts.spread; const half = await analyzeTile(await sharp(await png(gray(withRamp((lo + hi) / 2), B, B), B, B)).extract({ left: 64, top: 64, width: 512, height: 512 }).png().toBuffer(), { name: 'плитка 512' });
        say(sp > SURFACE.spreadMax && sp <= SURFACE.spreadSmall && !tm.surfaceLike && /общий уклон/.test(whyOf(tm)), `картинка ${B} px с общим уклоном ${sp} σ (порог ${SURFACE.spreadMax}): не фактура — ${whyOf(tm).slice(0, 100)}`);
        say(SURFACE.spreadMax === 0.7 && SURFACE.spreadSmall === 0.8 && (half.frames[0].parts.spread > SURFACE.spreadSmall || !/общий уклон/.test(whyOf(half))), `та же картинка вырезом 512 px (разброс средних ${half.frames[0].parts.spread}): для плитки до ${SURFACE.smallSide} px порог ${SURFACE.spreadSmall} — ${/общий уклон/.test(whyOf(half)) ? 'уклон больше и его' : 'по уклону проходит'}`); }
      /* P1-4: слабая своя плитка на почти белом (252 ± 1): два самых частых уровня соседние — это не «рисунок в два тона» */
      for (const kind of ['paper', 'stone', 'pulp']) {
        const t = await analyzeTile((await ST.renderTile(ST.makeField({ kind, size: Q, seed: 11 }), Q, { mean: 252, sd: 1 })).data, { name: kind }); const F = t.frames[0].feat;
        say(t.surfaceLike && F.gap2 < SURFACE.flatGap, `своя плитка ${kind} 252 ± 1 (доля двух самых частых уровней ${F.flat2}, между ними ${F.gap2} ур.): крупная фактура${t.surfaceLike ? '' : ` — ${whyOf(t)}`}`);
      }
      /* P2: вид не называется там, где признак держится на шуме */
      const kindOf = async (kind, mean, sd, size = Q) => analyzeTile((await ST.renderTile(ST.makeField({ kind, size, seed: 11 }), size, { mean, sd })).data, { name: kind });
      const k1 = await kindOf('paper', 254, 2);
      say(k1.surfaceLike && !!k1.kind && k1.kind.kind == null && /край шкалы/.test(k1.kind.basis) && (k1.kind.alt || []).length === 2, `своя бумага 254 ± 2 (обрезка по 255: до края ${k1.frames[0].feat.room} σ, асимметрия ${k1.frames[0].feat.skew}): вид не определён — ${k1.kind ? `кандидаты ${(k1.kind.alt || []).join(' и ')}` : whyOf(k1)} (выходила «камнем» с уверенностью 1)`);
      const k2 = await kindOf('stone', 250, 0.9, 1024);
      say(k2.surfaceLike && !!k2.kind && k2.kind.kind !== 'paper' && k2.kind.kind !== 'pulp', `свой камень 250 ± 0.9 (σ ${k2.frames[0].feat.sd}, асимметрия ${k2.frames[0].feat.skew}): вид ${k2.kind && k2.kind.kind ? `${k2.kind.kind} (${k2.kind.conf})` : 'не определён'} — «бумагой» не назван (выходил «бумагой» 0.74)`);
      /* признаки настоящих случаев, записанные с файлов: винтажная бумага с пятнышками, волокна после сжатия */
      const per0 = { x: { lag: 0, peak: 0, depth: 0, peak2: null }, y: { lag: 0, peak: 0, depth: 0, peak2: null } };
      const real = [
        ['mcsorleysoldalehouse.nyc, винтажная бумага', { fine: 0.016, low: 0.819, skew: -1.92, kurt: 18.23, coh: 0.19, dir: 0, sd: 4.66, mean: 245, room: 2.13, clip: 0, calm: 0.25, tail: { share: 0.014, cells: 0.24, lin: 0.72 }, per: per0, win: [855, 1024] }, ['paper', 'stone']],
        ['dogfish.com, бумага с волокнами после WebP q60', { fine: 0.111, low: 0.129, skew: -5.83, kurt: 125.16, coh: 0.4, dir: 0, sd: 1.28, mean: 199, room: 43.61, clip: 0, calm: 0.11, tail: { share: 0.015, cells: 0.51, lin: 0.8 }, per: per0, win: [1024, 1024] }, ['pulp', 'stone']],
        ['monkey47.com, бумага после JPEG q60', { fine: 0.129, low: 0.42, skew: -1.99, kurt: 25.36, coh: 0.11, dir: 0, sd: 2.32, mean: 244, room: 4.65, clip: 0, calm: 0.65, tail: { share: 0.013, cells: 0.42, lin: 0.7 }, per: per0, win: [1024, 900] }, ['pulp', 'stone']],
        ['tijuanaflats.com, чёрная мятая бумага в шапке (JPEG с шумом)', { fine: 0.411, low: 0.243, skew: 0.68, kurt: 2.65, coh: 0.06, dir: 97, sd: 6.14, mean: 15.67, room: 2.55, clip: 0, calm: 0.1, tail: { share: 0.015, cells: 0.66, lin: 0.62 }, per: per0, win: [380, 369] }, ['paper', 'pulp']],
        ['свой камень 512 px после JPEG q60', { fine: 0.01, low: 0.556, skew: -1.18, kurt: 4.29, coh: 0.08, dir: 0, sd: 9.93, mean: 30, room: 3.03, clip: 0.01, calm: 0.34, tail: { share: 0.029, cells: 0.28, lin: 0.87 }, per: per0, win: [512, 512] }, ['paper', 'stone']],
      ];
      for (const [name, F, alt] of real) { const k = tileKind(F); say(k.kind == null && k.conf < KIND.fair && (k.alt || []).join() === alt.join(), `${name} (асимметрия ${F.skew}, хвост ${F.tail.share}): вид не определён, кандидаты ${(k.alt || []).join(' и ')} — ${k.basis.slice(0, 110)}`); }
      const kz = tileKind({ fine: 0.05, low: 0.581, skew: -3.11, kurt: 21.37, coh: 0.32, dir: 90, sd: 2.51, mean: 248.28, room: 2.67, clip: 0, calm: 0.5, tail: { share: 0.024, cells: 0.37, lin: 0.89 }, per: per0, win: [1024, 1024] });
      say(kz.kind === 'stone' && kz.conf >= KIND.sure, `zakroma.rest, прожилки (асимметрия −3.11, хвост 2.4 %): вид ${kz.kind} (${kz.conf}) — настоящие прожилки называются по-прежнему`);
      const kf = tileKind({ fine: 0.456, low: 0.249, skew: -8.91, kurt: 154.86, coh: 0.04, dir: 167, sd: 2.51, mean: 254.13, room: 0.35, clip: 0.85, calm: 0.67, tail: { share: 0.016, cells: 0.41, lin: 0.61 }, per: per0, win: [1024, 759] });
      say(kf.kind === 'pulp' && kf.conf < KIND.sure && /на краю шкалы/.test(kf.basis), `famousdaves.com, крапины на чистом белом (на краю шкалы 85 % пикселей): ${kf.kind} с уверенностью ${kf.conf} — не выше средней (выходила 1)`);
      /* вырожденный вход: массив 3×3 напрямую в tileFeatures → tileKind выходил «зернистой бумагой» с уверенностью 1 */
      { const Y3 = Float32Array.from([0, 1, 2, 0, 1, 2, 0, 1, 2]); const k3 = tileKind(tileFeatures(Y3, 3, 3));
        say(k3.kind == null && k3.conf === 0, `tileKind на окне 3×3 px: вид не определён (уверенность ${k3.conf}) — ${k3.basis}`); }
      /* шов зернистой плитки: после сжатия скачок в один пиксель через край больше, чем внутри, а ступеньки нет */
      { const pz = await ST.renderTile(ST.makeField({ kind: 'pulp', size: Q, seed: 11 }), Q, { quality: 86 }); const pY = (await lumaOf(pz.data)).Y; const s = seamOf(pY, Q, Q), sOld = seamOf(pY, Q, Q, 6, false), sSt = seamOf((await lumaOf(tiles.stone)).Y, N, N);
        say(s.grainy === true && s.max <= SEAM_WARN && sOld.max >= s.max && !sSt.grainy, `шов зернистой плитки после WebP q86: по средним шести пикселей ${s.max} (по одному пикселю вышло бы ${sOld.max}) — бесшовная; гладкая плитка камня меряется по-прежнему (${sSt.max})`); }
    }

    /* ---- 2. участки: сила крупной фактуры на снимке ---- */
    {
      const W = 24 + 32 * 20, H = 24 + 32 * 12; const base = new Float32Array(W * H).fill(200), withT = new Float32Array(W * H), weakT = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = tileY[(y % N) * N + (x % N)] - 248; withT[y * W + x] = 200 + d; weakT[y * W + x] = 200 + d * 0.06; }
      const t = grainTiles(withT, W, H, { Yw: base }); for (const x of t) x.s = 0;
      const b = surfaceBand(surfaceBlocks(t, 4, 12).filter((q) => q.band === 'light')), b6 = surfaceBand(surfaceBlocks(t, 2, 4).filter((q) => q.band === 'light'));
      const fine = summarize(t, { key: 'sdD', yKey: 'yw', lagKey: 'lagD' }).light.sd;
      say(b.status === 'есть' && b.sd > 1.2 && b.sd < 3.2 && Math.abs(b.lift) < 0.8, `плитка σ 2.5 на ровном поле: участки 128 px — σ ${b.sd}, подъём ${b.lift}, участков ${b.blocks} — «${b.status}»`);
      say(fine < b6.sd && b6.sd < b.sd, `чем крупнее участок, тем полнее сила: плитка 32 px ${fine} < участок 64 px ${b6.sd} < участок 128 px ${b.sd}`);
      const tw = grainTiles(weakT, W, H, { Yw: base }); for (const x of tw) x.s = 0;
      const bw = surfaceBand(surfaceBlocks(tw, 4, 12).filter((q) => q.band === 'light'));
      say(bw.status === 'нет' && bw.sd < SURFACE_MIN_SD, `та же плитка в 16 раз слабее: σ ${bw.sd} — «нет» (порог ${SURFACE_MIN_SD})`);
      const w3 = 24 + 32 * 8, h3 = 152; const sw = new Float32Array(w3 * h3), sb3 = new Float32Array(w3 * h3).fill(200);
      for (let y = 0; y < h3; y++) for (let x = 0; x < w3; x++) sw[y * w3 + x] = withT[y * W + x];
      const small = grainTiles(sw, w3, h3, { Yw: sb3 }); for (const x of small) x.s = 0;
      const bs = surfaceBand(surfaceBlocks(small, 4, 12));
      say(bs.status === 'не измерено' && bs.blocks > 0 && bs.blocks < SURFACE_MIN_BLOCKS, `ровный клочок ${w3}×${h3} px: участков 128 px ${bs.blocks} (σ ${bs.sd}) — «не измерено», а не «есть» и не «нет»`);
      const two = new Float32Array(W * H), twoW = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const bg = x < 12 + 32 * 8 ? 40 : 230; twoW[y * W + x] = bg; two[y * W + x] = bg + (tileY[(y % N) * N + (x % N)] - 248) * (bg < 100 ? 0.5 : 1); }
      const t2 = grainTiles(two, W, H, { Yw: twoW }); for (const x of t2) x.s = 0;
      const blocks2 = surfaceBlocks(t2, 4, 12); const bd = surfaceBand(blocks2.filter((q) => q.band === 'dark')), bl = surfaceBand(blocks2.filter((q) => q.band === 'light'));
      say(bd.blocks >= 4 && bl.blocks >= 4 && bd.sd < bl.sd && Math.round(bd.y) === 40 && Math.round(bl.y) === 230, `тёмная и светлая половины считаются отдельно: тёмный σ ${bd.sd} (Y ${bd.y}), светлый σ ${bl.sd} (Y ${bl.y})`);
      /* фактура только в части страницы: бумага 215 ± σ в левой трети белого поля, остальное без плитки. Сила — по
         участкам под фактурой, участки на границе (половина под плиткой) не в счёт */
      const W4 = 24 + 32 * 40; const part = new Float32Array(W4 * H), partW = new Float32Array(W4 * H).fill(255); const edge = 12 + 32 * 11;
      for (let y = 0; y < H; y++) for (let x = 0; x < W4; x++) part[y * W4 + x] = x < edge ? 215 + (tileY[(y % N) * N + (x % N)] - 248) : 255;
      const t3 = grainTiles(part, W4, H, { Yw: partW }); for (const x of t3) x.s = 0;
      const blocks3 = surfaceBlocks(t3, 4, 12).filter((q) => q.band === 'light'), b3 = surfaceBand(blocks3);
      const mixed = blocks3.filter((q) => q.mixed), under = blocks3.filter((q) => q.shown);
      say(b3.status === 'есть' && b3.sd > 1.2 && b3.sd < 3.2 && under.length >= 4 && under.length < blocks3.length / 2 && mixed.length >= 2 && Math.min(...mixed.map((q) => q.sd)) > 10, `фактура в трети страницы: под ней ${under.length} участков из ${blocks3.length} — σ ${b3.sd}, «${b3.status}» (медиана по всем была бы ${r2(median(blocks3.map((q) => q.sd)))}); пограничных ${mixed.length} с σ от ${r2(Math.min(...mixed.map((q) => q.sd)))} — не в счёт`);
    }

    /* ---- 3. сверка: синтетические замеры ---- */
    const vp = { name: 'desktop', width: 1440, height: 900, dpr: 1 };
    {
      const band = (sd, blocks = 20, y = 240) => (sd == null ? { blocks: 0, sd: null, status: 'не измерено' } : { blocks, sd, sd_p90: r2(sd * 1.3), fine: r2(sd * 0.5), lift: -5, y, status: blocks < SURFACE_MIN_BLOCKS ? 'не измерено' : sd >= SURFACE_MIN_SD ? 'есть' : 'нет' });
      /* kind — вид плитки в замере (false — замер версии 01.10.2026, вида нет); mid, midY — фактура в полосе «средний» */
      const mkS = ({ light = 2, dark = 1.2, mid = null, midY = 62, n128 = 20, modes = { light: 'multiply', dark: 'color-burn' }, tileSd = 2.5, kind = 'stone' } = {}) => {
        const bands = { size: 128, dark: band(dark, n128, 40), mid: band(mid, n128, midY), light: band(light, n128) };
        const bands64 = { size: 64, dark: band(dark == null ? null : r2(dark * 0.8), 60, 40), mid: band(mid == null ? null : r2(mid * 0.8), 60, midY), light: band(light == null ? null : r2(light * 0.8), 60) };
        const st = ['dark', 'mid', 'light'].map((k) => surfaceBandOf({ bands, bands64 }, k));
        return { status: st.some((b) => b.status === 'есть') ? 'есть' : st.some((b) => b.status === 'нет') ? 'нет' : 'не измерено', statusNote: '', layers: [{}], users: [], usersCount: 0, tile: { file: 't.webp', mean: 248, sd: tileSd, ...(kind === false ? {} : { kind: { kind, conf: 0.9, word: 'высокая', basis: 'проба', alt: ['paper', 'stone'], guess: kind || 'paper' } }) }, bands, bands64, byTone: { dark: { mode: modes.dark }, mid: { mode: modes.mid || null }, light: { mode: modes.light } }, diagnosis: [], rejected: [] };
      };
      const none = { status: 'нет', statusNote: 'картинок-плиток с крупной фактурой не найдено', layers: [], users: [], usersCount: 0, tile: null, bands: null, bands64: null, byTone: null, diagnosis: [], rejected: [] };
      const R = (surface) => ({ viewport: vp, ...(surface ? { surface } : {}) });
      const cmp = (a, b, o) => compareSurface(R(a), R(b), o);
      const rowOf = (c, re) => c.rows.find((r) => re.test(r.what));
      let c = cmp(mkS(), mkS());
      say(c.verdict === 'OK' && c.rows.length >= 3 && c.rows.every((r) => r.ok === true), `сверка, одинаковая фактура: ${c.verdict}, строк ${c.rows.length}`);
      c = cmp(mkS(), mkS({ light: 3 }));
      say(c.verdict === 'FAIL' && rowOf(c, /σ светлый/).ok === false && c.hints.some((h) => /--sd 1\.67/.test(h)), `сверка, у сайта светлый σ 3 при 2 у донора: ${c.verdict} (${rowOf(c, /σ светлый/).note}), подсказка: ${(c.hints[0] || '').slice(0, 90)}`);
      c = cmp(mkS(), mkS({ light: 2.5 }));
      const c2 = cmp(mkS(), mkS({ light: 2.5 }), { tol: 0.2 });
      say(c.verdict === 'OK' && c2.verdict === 'FAIL', `сверка, +25 %: при допуске 30 % — ${c.verdict}, при 20 % — ${c2.verdict}`);
      c = cmp(mkS(), none);
      say(c.verdict === 'FAIL' && /у сайта крупной фактуры нет/.test(c.rows[0].note) && c.hints.some((h) => /surface-tile\.mjs/.test(h)), `сверка, у сайта фактуры нет: ${c.verdict} — ${c.rows[0].note}`);
      c = cmp(none, mkS());
      say(c.verdict === 'FAIL' && /у донора крупной фактуры нет, у сайта есть/.test(c.rows[0].note), `сверка, у донора нет, у сайта есть: ${c.verdict} — ${c.rows[0].note}`);
      c = cmp(none, none);
      say(c.rows.length === 0 && c.verdict === 'OK', `сверка, фактуры нет ни у кого: строк ${c.rows.length} — сверка зерна выглядит как раньше`);
      c = cmp(null, mkS());
      say(c.verdict === 'WARN' && /перемерить/.test(c.rows[0].note) && c.hints.some((h) => /до 01\.10\.2026/.test(h)), `сверка, замер донора старой версии: ${c.verdict} — ${c.rows[0].note}`);
      c = cmp(mkS(), mkS({ n128: 2 }));
      say(c.verdict === 'OK' && /участки 64 px/.test(rowOf(c, /σ светлый/).note), `сверка, у сайта мало участков 128 px: сравнение по 64 px у обоих — ${rowOf(c, /σ светлый/).donor} и ${rowOf(c, /σ светлый/).site}, ${c.verdict}`);
      c = cmp(mkS(), mkS({ dark: 0.2, modes: { light: 'multiply', dark: 'multiply' } }));
      say(c.verdict === 'FAIL' && rowOf(c, /σ тёмный/).ok === false && c.hints.some((h) => /color-burn/.test(h)), `сверка, на тёмном у сайта multiply и σ 0.2: ${c.verdict}, подсказка: ${(c.hints.find((h) => /color-burn/.test(h)) || '').slice(0, 100)}`);
      c = cmp(mkS({ modes: { light: 'normal', dark: 'color-burn' } }), mkS());
      say(c.verdict === 'OK' && rowOf(c, /наложение светлый/).ok === true && /равносильны/.test(rowOf(c, /наложение светлый/).note), `сверка, на светлом normal у донора и multiply у сайта: ${c.verdict} — ${rowOf(c, /наложение светлый/).note}`);
      /* вид плитки: подсказка, не провал */
      const withKind = (S0, kind, conf = 0.9) => { S0.tile.kind = { kind, conf, word: 'высокая', basis: 'проба', alt: ['paper', 'stone'], guess: kind || 'paper' }; return S0; };
      c = cmp(withKind(mkS(), 'stone'), withKind(mkS(), 'paper'));
      say(c.verdict === 'OK' && rowOf(c, /вид плитки/).ok === null && c.hints.some((h) => /вид плитки: у донора камень/.test(h) && /--kind stone/.test(h)), `сверка, у донора камень, у сайта бумага: ${c.verdict} (не провал), строка «вид плитки» — ${rowOf(c, /вид плитки/).note}; подсказка: ${(c.hints.find((h) => /вид плитки/.test(h)) || '').slice(0, 80)}`);
      c = cmp(withKind(mkS(), 'stone'), withKind(mkS(), 'stone'));
      say(c.verdict === 'OK' && rowOf(c, /вид плитки/).ok === true && !c.hints.length, `сверка, вид плитки тот же: ${c.verdict}, подсказок ${c.hints.length}`);
      c = cmp(withKind(mkS(), 'stone'), withKind(mkS(), null, 0.3));
      say(c.verdict === 'OK' && rowOf(c, /вид плитки/).ok === null && !c.hints.some((h) => /вид плитки/.test(h)), `сверка, вид у сайта не определён: ${c.verdict}, строка — ${rowOf(c, /вид плитки/).note}`);
      /* мимо только тёмные поля: совет — отдельная плитка для тёмных, а не ослабить общую */
      c = cmp(mkS(), mkS({ dark: 1.8 }));
      const hd = c.hints.find((h) => /σ тёмный/.test(h)) || '';
      say(c.verdict === 'FAIL' && rowOf(c, /σ светлый/).ok === true && /--surface-tile-dark/.test(hd) && /общую плитку не трогать/.test(hd) && /--sd 1\.67/.test(hd), `сверка, на тёмном +50 %, светлые в норме: ${c.verdict}; подсказка: ${hd.slice(0, 150)}`);
      c = cmp(mkS(), mkS({ dark: 1.8, light: 3 }));
      say(c.verdict === 'FAIL' && c.hints.filter((h) => /своя плитка с --sd 1\.67/.test(h)).length === 2 && !c.hints.some((h) => /--surface-tile-dark/.test(h)), `сверка, сильнее и на тёмном, и на светлом: ${c.verdict}; совет — общая плитка с --sd (${c.hints.length} подсказки)`);
      /* тёмное поле в полосе «средний»: тёмно-зелёные секции образца (zakroma.rest) имеют яркость 62 — выше границы полосы
         «тёмный» (60), плитка на них лежит через color-burn. Раньше условие стояло на полосе «тёмный», и совет выходил
         «ослабить общую плитку» */
      const mM = { light: 'multiply', mid: 'color-burn' };
      c = cmp(mkS({ dark: null, mid: 1, modes: mM }), mkS({ dark: null, mid: 1.45, light: 1.77, modes: mM }));
      const hm = c.hints.find((h) => /σ средний/.test(h)) || '';
      say(c.verdict === 'FAIL' && rowOf(c, /σ средний/).ok === false && rowOf(c, /σ светлый/).ok === true && /--surface-tile-dark/.test(hm) && /общую плитку не трогать/.test(hm) && /тёмное поле/.test(hm), `сверка, тёмное поле яркости 62 (полоса «средний», color-burn) +45 %, светлые в норме: ${c.verdict}; подсказка: ${hm.slice(0, 170)}`);
      c = cmp(mkS(), mkS({ light: 3 }));
      const hl = c.hints.find((h) => /σ светлый/.test(h)) || '';
      say(/общая плитка с --sd 1\.67/.test(hl) && /На тёмных полях «тёмный» сила сейчас в норме — им оставить нынешнюю плитку/.test(hl) && /--surface-tile-dark/.test(hl), `сверка, мимо светлые поля, тёмные в норме: хвост подсказки — оставить нынешнюю плитку тёмным полям (${hl.slice(-120)})`);
      /* тёмные поля в разных полосах замера: у донора яркость 62 («средний»), у сайта 47 («тёмный») — обе строки «—».
         Вердикт прежний, но подсказка говорит, что тёмные поля не сверены, и даёт ориентир */
      c = cmp(mkS({ dark: null, mid: 1, modes: mM }), mkS({ dark: 1.64, light: 1.77 }));
      const hx = c.hints.find((h) => /тёмные поля не сверены/.test(h)) || '';
      say(c.verdict === 'OK' && rowOf(c, /σ тёмный/).ok === null && rowOf(c, /σ средний/).ok === null && /«средний» \(яркость поля 62, σ 1\)/.test(hx) && /«тёмный» \(яркость 40, σ 1\.64\)/.test(hx) && /\+64 %/.test(hx), `сверка, тёмные поля донора и сайта в разных полосах (62 и 40): ${c.verdict}, строки «—», подсказка: ${hx.slice(0, 150)}`);
      c = cmp(mkS(), mkS());
      say(!c.hints.some((h) => /тёмные поля не сверены/.test(h)), 'сверка, полосы совпадают: подсказки «тёмные поля не сверены» нет');
      /* замер версии 01.10.2026: плитка есть, вида нет — раньше строки «вид плитки» не было и итог был OK молча */
      c = cmp(mkS({ kind: false }), mkS());
      say(c.verdict === 'OK' && !!rowOf(c, /вид плитки/) && rowOf(c, /вид плитки/).ok === null && /у донора не снимался/.test(rowOf(c, /вид плитки/).note) && c.hints.some((h) => /вид плитки: у донора не снимался/.test(h) && /перемерить/.test(h)), `сверка, у донора замер без вида плитки: ${c.verdict}, строка «вид плитки» — ${rowOf(c, /вид плитки/) ? rowOf(c, /вид плитки/).note : 'нет строки'}; подсказка — перемерить`);

      /* замеры без крупной фактуры: сверка, рецепт, переменные и раздел — как до неё */
      const gb = (sd, t = 100, y = 128) => ({ tiles: t, sd, sd_p90: sd, lag1: 0.1, y, status: t < MIN_TILES ? 'не измерено' : sd >= GRAIN_MIN_SD ? 'есть' : 'нет' });
      const old = (d, l) => ({ url: 'https://old.example/', viewport: vp, layers: [], patterns: [], svgNoise: [], screens: [], grain: { dark: gb(d, 100, 20), mid: gb(0, 0), light: gb(l, 100, 240), all: gb(d) }, without: null, contribution: null, lift: null, boil: { boils: false }, status: Math.max(d, l) >= GRAIN_MIN_SD ? 'есть' : 'нет', statusNote: '', diagnosis: [] });
      const ct = compareTexture(old(5, 5), old(5.2, 4.9)), ctf = compareTexture(old(5, 5), old(2, 2));
      say(ct.verdict === 'OK' && ctf.verdict === 'FAIL' && ct.rows.every((r) => r.group !== 'surface') && !('surface' in ct), `сверка зерна по замерам старой версии: ${ct.verdict} и ${ctf.verdict}, строк о крупной фактуре нет`);
      const rec = recipeFrom([old(5, 5)]), blk = tokensBlock(rec, [old(5, 5)]), md = textureMarkdown([old(5, 5)]);
      say(!('surface' in rec) && !/--surface/.test(blk) && (blk.match(/--grain-/g) || []).length === 8 && !/Крупная фактура/.test(md), 'замер старой версии: рецепт, блок переменных (8 × --grain-*) и раздел — без крупной фактуры, как раньше');
      const withNone = { ...old(5, 5), surface: none };
      const rec2 = recipeFrom([withNone]), blk2 = tokensBlock(rec2, [withNone]), md2 = textureMarkdown([withNone]);
      say(rec2.surface && rec2.surface.none === true && blk2 === tokensBlock(rec, [old(5, 5)]) && /Крупная фактура[^\n]*: нет/.test(md2), 'замер без крупной фактуры: блок переменных знак в знак прежний, в разделе — одна строка «нет»');
      const ctn = compareTexture(withNone, withNone);
      say(ctn.verdict === 'OK' && ctn.rows.every((r) => r.group !== 'surface'), 'сверка двух замеров без крупной фактуры: строк о ней нет');
      /* слоя зерна нет, σ на снимке — шум самих картинок (inPictures): сила зерна слоем — ноль. Сверка такого донора со
         своим сайтом без зерна — OK, а не требование повторить шум чужих фотографий; рецепт — «слой не нужен» */
      const pics = { ...old(4.95, 0.3), status: 'нет', inPictures: true, statusNote: 'слоя зерна нет', surface: none };
      const gp = grainBand(pics, 'dark'), cp = compareTexture(pics, { ...old(0.2, 0.2), surface: none }), rp = recipeFrom([pics]);
      say(gp.sd === 0 && gp.via === 'картинки' && gp.raw.sd === 4.95 && cp.verdict !== 'FAIL' && cp.rows.some((r) => /σ тёмный/.test(r.what) && r.ok === true && /в самих картинках/.test(r.note)) && rp.none && /шум фотографий/.test(rp.notes.join(' ')) && /--grain-opacity: 0;/.test(tokensBlock(rp, [pics])), `донор с шумом в фотографиях и без слоя зерна (σ на снимке ${gp.raw.sd}): сила зерна слоем ${gp.sd}, сверка со своим сайтом без зерна — ${cp.verdict}, рецепт — «${rp.notes[0].slice(0, 60)}…»`);
      /* донор снят версией до 01.10.2026 (поля surface нет, плитка шла зерном), сайт — нынешней: раньше FAIL «не как у
         донора» по строкам зерна, теперь они не в счёт, итог WARN и одна подсказка — что перемерить и чем */
      const siteNew = { ...old(0.2, 0.2), status: 'нет', surface: mkS() };
      const cto = compareTexture(old(5, 5), siteNew);
      say(cto.verdict === 'WARN' && cto.rows.every((r) => r.ok !== false) && cto.rows.some((r) => /не в счёт: замер донора старой версии/.test(r.note || '')) && cto.hints.length === 1 && /перемерить донора нынешней версией — node texture\.mjs <адрес донора>/.test(cto.hints[0]), `сверка, донор снят старой версией, у сайта крупная фактура: ${cto.verdict} (не FAIL), строк зерна «не в счёт» ${cto.rows.filter((r) => /не в счёт/.test(r.note || '')).length}; подсказка: ${(cto.hints[0] || '').slice(0, 110)}`);
    }

    /* ---- 4. командная строка без браузера ---- */
    {
      const f = path.join(tmp, 'stone.webp'); fs.writeFileSync(f, tiles.stone);
      const t = run(['--tile', f]);
      say(t.status === 0 && /крупная фактура[^\n]*: да/.test(text(t)) && /бесшовная/.test(text(t)) && /НЕ похоже на шум/.test(text(t)), `--tile своей плитки: код ${t.status}, «крупная фактура: да», «бесшовная»`);
      say(/вид: камень \(stone\) — уверенность/.test(text(t)) && /рисунок: доля деталей мельче 5 px/.test(text(t)), `--tile своей плитки: строка вида — ${(/вид: [^\n]*/.exec(text(t)) || ['нет'])[0].slice(0, 110)}`);
      const [g1] = GT.makeFrames({ size: 256, levels: 16, px: 1, frames: 1, mode: 'gray', seed: 7 });
      const gf = path.join(tmp, 'grain.png'); fs.writeFileSync(gf, await png(g1, 256, 256));
      const tg = run(['--tile', gf]);
      say(tg.status === 0 && /; похоже на шум/.test(text(tg)) && /крупная фактура[^\n]*: нет/.test(text(tg)), `--tile плитки зерна: код ${tg.status}, «похоже на шум», «крупная фактура: нет»`);
      /* Ж:805 — метка разводит итог: без неё имя прежнее */
      const nm = (l) => path.basename(textureJsonFile(tmp, l));
      say(nm(null) === 'texture.json' && nm(undefined) === 'texture.json' && nm('') === 'texture.json' && nm('donor') === 'texture-donor.json' && nm('до нор/1') === 'texture-до_нор_1.json' && path.dirname(textureJsonFile(tmp, 'donor')) === tmp, `имя итога: без метки ${nm(null)}, с меткой ${nm('donor')}, метка с пробелом и «/» — ${nm('до нор/1')}`);
      {
        const pf = path.join(tmp, 'texture-prev.json'); writeJson(pf, { url: 'https://donor.example/menu/', takenAt: '2026-10-03T10:00:00.000Z', results: [] });
        const same = textureOverwriteNote(pf, 'https://donor.example/menu/index.html'), other = textureOverwriteNote(pf, 'http://localhost:4010/sites/bbq-kitchen/'), none = textureOverwriteNote(path.join(tmp, 'нет-такого.json'), 'https://a.ru/');
        say(same === null && none === null && /texture-prev\.json в этой папке был от другого адреса \(https:\/\/donor\.example\/menu\/, 2026-10-03 10:00\) — перезаписан/.test(other || '') && /--label/.test(other || ''), `итог другого адреса на том же месте: WARN «перезаписан» с подсказкой --label; тот же адрес и новый файл — тихо`);
      }
      const h = run(['-h']);
      const flags = ['viewport', 'out', 'json', 'tokens', 'css', 'md', 'png', 'png2', 'png3', 'without', 'region', 'tile', 'label', 'screens', 'extras', 'strict', 'sd-tol', 'lag-tol', 'surface-tol', 'selftest', 'no-browser'];
      const missing = flags.filter((k) => !new RegExp(`--${k}(?![\\w-])`).test(h.stdout || ''));
      say(h.status === 0 && !missing.length, `-h: код ${h.status}, флаги названы${missing.length ? ` (нет: ${missing.join(', ')})` : ''}`);
      const e1 = run(['compare', 'a.json', 'b.json', '--surface-tol', 'abc']);
      say(e1.status === 1 && /--surface-tol abc/.test(text(e1)), `--surface-tol не число: код ${e1.status}`);
      const e2 = run(['compare', 'a.json', 'b.json', '--surfase-tol', '0.3']);
      say(e2.status === 1 && /--surface-tol\?/.test(text(e2)), `опечатка --surfase-tol: код ${e2.status}, подсказка «--surface-tol?»`);
    }

    /* ---- 5. стенды в браузере ---- */
    if (!browser) console.log('SKIP стенды в браузере (--no-browser)');
    else {
      const site = ensureDir(path.join(tmp, 'site')), shots = ensureDir(path.join(tmp, 'shots'));
      const F = ST.makeField({ kind: 'paper', size: 512, seed: 11 });
      fs.writeFileSync(path.join(site, 'tile.webp'), (await ST.renderTile(F, 512, { mean: 248, sd: 2.5 })).data);
      fs.writeFileSync(path.join(site, 'tile-strong.webp'), (await ST.renderTile(F, 512, { mean: 244, sd: 5.5 })).data);
      const [g] = GT.makeFrames({ size: 256, levels: 16, px: 1, frames: 1, mode: 'gray', seed: 7 });
      fs.writeFileSync(path.join(site, 'grain-gray-256.png'), await png(g, 256, 256));
      const PW = 1200, PH = 640; const photo = Buffer.alloc(PW * PH), ramp = Buffer.alloc(PW * PH);
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) { photo[y * PW + x] = Math.max(0, Math.min(255, Math.round(120 + 60 * Math.sin(x / 130) * Math.cos(y / 90) + 35 * Math.sin((x + 2 * y) / 55)))); ramp[y * PW + x] = Math.round(228 + 20 * x / PW); }
      await sharp(photo, { raw: { width: PW, height: PH, channels: 1 } }).jpeg({ quality: 80 }).toFile(path.join(site, 'photo.jpg'));
      fs.writeFileSync(path.join(site, 'ramp.png'), await png(ramp, PW, PH));
      /* стенды 02.10.2026: имя файла «texture» у фотографии, орнамент и сетка плиткой; полупрозрачная бумага; фактура
         в части страницы и карточка с тёмной бумагой на белом */
      fs.copyFileSync(path.join(site, 'photo.jpg'), path.join(site, 'paper-texture-photo.jpg'));
      { const Q = 128; const orn = Buffer.alloc(Q * Q), grid = Buffer.alloc(96 * 96, 247);
        for (let y = 0; y < Q; y++) for (let x = 0; x < Q; x++) { const dx = (x % 32) - 16, dy = (y % 32) - 16; orn[y * Q + x] = Math.round(248 - 12 * Math.exp(-(dx * dx + dy * dy) / 9)); }
        for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (x % 24 === 0 || y % 24 === 0) grid[y * 96 + x] = 232;
        fs.writeFileSync(path.join(site, 'ornament.png'), await png(orn, Q, Q)); fs.writeFileSync(path.join(site, 'grid.png'), await png(grid, 96, 96)); }
      { const raw = ST.fieldToBytes(ST.makeField({ kind: 'pulp', size: 512, seed: 11 }), { mean: 242, sd: 6 }); const rgba = Buffer.alloc(512 * 512 * 4); for (let i = 0; i < 512 * 512; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = raw[i]; rgba[i * 4 + 3] = 128; }
        fs.writeFileSync(path.join(site, 'thin.png'), await png(rgba, 512, 512, 4)); }
      fs.writeFileSync(path.join(site, 'tile-kraft.webp'), (await ST.renderTile(F, 512, { mean: 207, sd: 6 })).data);
      const sRec = (tile) => ({ tileName: tile, size: 512, use: { light: 'multiply', dark: 'color-burn' }, minWidth: 0 });
      fs.writeFileSync(path.join(site, 'surface.css'), fillSurfaceCss(sRec('tile.webp')));
      fs.writeFileSync(path.join(site, 'surface-strong.css'), fillSurfaceCss(sRec('tile-strong.webp')));
      fs.writeFileSync(path.join(site, 'grain.css'), fillGrainCss({ none: false, size: 256, px: 1, opacity: 0.064, blend: 'normal', rendering: 'auto', frames: 1, frameMs: 100, boil: false, minWidth: 0 }));
      const tpl = fs.readFileSync(path.join(FIX, 'surface.html'), 'utf8');
      const page = (name, { dark = 'surface--dark', head = '', extra = '', css = 'surface.css' } = {}) => fs.writeFileSync(path.join(site, name), tpl.split('{{DARK}}').join(dark).split('{{HEAD}}').join(head).split('{{EXTRA}}').join(extra).replace('href="surface.css"', `href="${css}"`));
      page('surface.html'); page('surface-strong.html', { css: 'surface-strong.css' }); page('surface-dead.html', { dark: 'surface' });
      page('both.html', { head: '<link rel="stylesheet" href="grain.css">', extra: '<div class="grain-overlay" aria-hidden="true"></div>' });
      /* стенды находок проверки 02.10.2026: мягкое зерно слоем; шум в самих фотографиях без слоя зерна; зерно бледной шум-плиткой в фоне блока */
      { let sd = 9; const rn = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; }; const gs = () => { let u = 0, v = 0; while (u === 0) u = rn(); while (v === 0) v = rn(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
        const SN = 400; const nz = Buffer.alloc(SN * SN); for (let i = 0; i < SN * SN; i++) nz[i] = Math.max(0, Math.min(255, Math.round(128 + gs() * 40)));
        const bl = await sharp(nz, { raw: { width: SN, height: SN, channels: 1 } }).blur(1.6).raw().toBuffer({ resolveWithObject: true }); let m = 0, v = 0; for (let i = 0; i < SN * SN; i++) m += bl.data[i * bl.info.channels]; m /= SN * SN; for (let i = 0; i < SN * SN; i++) v += (bl.data[i * bl.info.channels] - m) ** 2; v = Math.sqrt(v / (SN * SN));
        const soft = Buffer.alloc(SN * SN); for (let i = 0; i < SN * SN; i++) soft[i] = Math.max(0, Math.min(255, Math.round(128 + (bl.data[i * bl.info.channels] - m) * 10 / v)));
        fs.writeFileSync(path.join(site, 'soft-noise.png'), await png(soft, SN, SN));
        const pit = Buffer.alloc(PW * PH); for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) pit[y * PW + x] = Math.max(0, Math.min(255, Math.round(34 + 20 * Math.sin(x / 400) * Math.cos(y / 300) + 130 * Math.exp(-((x - 900) ** 2 + (y - 200) ** 2) / (2 * 110 * 110)) + gs() * 4)));
        await sharp(pit, { raw: { width: PW, height: PH, channels: 1 } }).jpeg({ quality: 92 }).toFile(path.join(site, 'pit.jpg'));
        const vg = Buffer.alloc(600 * 320 * 4); for (let y = 0; y < 320; y++) for (let x = 0; x < 600; x++) { const d = Math.hypot((x - 300) / 300, (y - 160) / 160); vg[(y * 600 + x) * 4 + 3] = Math.round(Math.min(1, d) * 60); }
        fs.writeFileSync(path.join(site, 'texture-black.png'), await png(vg, 600, 320, 4));
        const sp = Buffer.alloc(100 * 100 * 4); for (let i = 0; i < 100 * 100; i++) { const c = rn() < 0.5 ? 0 : 255; sp[i * 4] = sp[i * 4 + 1] = sp[i * 4 + 2] = c; sp[i * 4 + 3] = 11; }
        fs.writeFileSync(path.join(site, 'speck.png'), await png(sp, 100, 100, 4)); }
      for (const f of ['veil.html', 'grain.html', 'plain.html', 'named.html', 'thin.html', 'soft.html', 'pics.html', 'pale.html']) fs.copyFileSync(path.join(FIX, f), path.join(site, f));
      /* картинка-подложка тегом img: из одних крупных пятен (как приглушённая иллюстрация) и зернистая бумага */
      fs.writeFileSync(path.join(site, 'blobs.webp'), (await ST.renderTile(ST.makeField({ kind: 'stone', size: 1024, seed: 11, veins: 0 }), 1024, { mean: 244, sd: 5 })).data);
      fs.writeFileSync(path.join(site, 'sheet.webp'), (await ST.renderTile(ST.makeField({ kind: 'pulp', size: 1024, seed: 11 }), 1024, { mean: 244, sd: 5, fullSeam: true })).data);
      { const ut = fs.readFileSync(path.join(FIX, 'underlay.html'), 'utf8'); fs.writeFileSync(path.join(site, 'underlay-blobs.html'), ut.split('{{IMG}}').join('blobs.webp')); fs.writeFileSync(path.join(site, 'underlay-sheet.html'), ut.split('{{IMG}}').join('sheet.webp')); }
      fs.writeFileSync(path.join(site, 'partial.html'), fs.readFileSync(path.join(FIX, 'partial.html'), 'utf8').replace('tile-strong.webp', 'tile-kraft.webp'));
      const VP = '1200x800@1';
      let br = await launch();
      const shoot = async (f) => {
        const go = () => textureOnUrl(pathToFileURL(path.join(site, f)).href, { viewport: VP, out: shots, label: f.replace('.html', ''), screens: 3, browser: br, settle: 600 });
        try { return await go(); } catch (e) {
          /* мало памяти — браузер роняет снимок: одна повторная попытка в новом браузере */
          console.log(`     ${f}: ${String(e && e.message ? e.message : e).slice(0, 100)} — повтор в новом браузере`);
          await br.close().catch(() => {}); await sleep(15000); br = await launch();
          try { return await go(); } catch (e2) { return { error: String(e2 && e2.message ? e2.message : e2).slice(0, 160) }; }
        }
      };
      const R = {};
      try { for (const f of ['surface', 'surface-strong', 'surface-dead', 'veil', 'grain', 'plain', 'both', 'named', 'thin', 'partial', 'soft', 'pics', 'pale', 'underlay-blobs', 'underlay-sheet']) { R[f] = await shoot(`${f}.html`); if (R[f].error) say(false, `стенд ${f}.html не снят: ${R[f].error}`); } }
      finally { await br.close().catch(() => {}); }
      const ok = (k) => R[k] && !R[k].error;
      const sb = (r, k) => surfaceBandOf(r.surface, k);
      if (ok('surface')) {
        const r = R.surface, S = r.surface, rec = recipeFrom([r]), by = (re) => S.layers.find((L) => re.test(L.el));
        const deep = by(/section\.deep/), mint = by(/section\.mint/), body = by(/^body/);
        say(S.status === 'есть' && S.layers.length >= 4 && sb(r, 'light').status === 'есть' && sb(r, 'dark').status === 'есть', `стенд «фактура в фоне»: крупная фактура ${S.status}, слоёв ${S.layers.length}; светлый σ ${sb(r, 'light').sd}, тёмный σ ${sb(r, 'dark').sd}`);
        say(!!deep && deep.surf.blend === 'color-burn' && deep.surf.side === 'dark' && !!mint && mint.surf.blend === 'multiply' && mint.surf.side === 'light' && !!body && body.surf.via === 'фон блока', `стенд: тёмная секция — ${deep ? `${deep.surf.blend}, Y ${deep.surf.y}` : 'не найдена'}; мятная — ${mint ? `${mint.surf.blend}, Y ${mint.surf.y}` : 'не найдена'}; body — ${body ? body.surf.via : 'не найден'}`);
        say(r.status !== 'есть' && r.layers.length === 0, `стенд: зерно «${r.status}», слоёв зерна ${r.layers.length} — плитка не принята за зерно`);
        say(S.usersCount >= 3 && S.users.some((u) => u.blend === 'color-burn') && S.users.some((u) => u.blend === 'multiply'), `стенд: мелких блоков с плиткой ${S.usersCount} (${S.users.map((u) => `${u.count} × ${u.blend}`).join(', ')})`);
        say(Math.abs(S.tile.mean - 248) <= 1 && Math.abs(S.tile.sd - 2.5) <= 0.4 && S.tile.seam.max <= SEAM_WARN && S.tile.width === 512, `стенд: плитка ${S.tile.file} ${S.tile.width}×${S.tile.height}, яркость ${S.tile.mean} ± ${S.tile.sd}, шов ${S.tile.seam.max}`);
        const RS = rec.surface;
        say(!!RS && !RS.none && RS.use.light === 'multiply' && RS.use.dark === 'color-burn' && RS.size === 512 && RS.print === 'выключена' && RS.blend.light === 'multiply' && RS.blend.dark === 'color-burn', `стенд, рецепт: светлые ${RS && RS.use ? RS.use.light : '—'}, тёмные ${RS && RS.use ? RS.use.dark : '—'}, период ${RS ? RS.size : '—'} px, в печати ${RS ? RS.print : '—'}`);
        say(!!RS && RS.off.some((e) => /max-width: 700px/.test(e.cond) && e.el && /mint/.test(e.el)), `стенд, рецепт: выключение на узком экране найдено у одной секции (${RS ? RS.off.map((e) => `${e.cond}: ${e.how}`).join('; ') : '—'})`);
        const blk = tokensBlock(rec, [r]), css = RS && !RS.none ? fillSurfaceCss(RS) : '', md = textureMarkdown([r]);
        say(/--surface-size: 512px;/.test(blk) && /--surface-blend: multiply;/.test(blk) && /--surface-blend-dark: color-burn;/.test(blk) && /--grain-opacity: 0;/.test(blk) && blk.split('*/').length === 4, 'стенд: блок переменных — --grain-* и --surface-* в одном блоке, комментарий закрыт один раз');
        say(/--surface-tile: url\(surface-paper-512\.webp\);/.test(css) && /--surface-size: 512px;/.test(css) && /@media \(min-width: 0px\) \{ \/\* surface-min-width \*\//.test(css) && /### Крупная фактура/.test(md), 'стенд: surface.css с рецептом и подраздел «Крупная фактура» в разделе для discovery.md');
      }
      if (ok('veil')) {
        const r = R.veil, S = r.surface, rec = recipeFrom([r]).surface;
        say(S.status === 'есть' && S.layers.length === 3 && S.layers.every((L) => L.surf.via === 'слой' && L.reason.includes('фон')), `стенд «фактура слоем»: ${S.status}, слоёв ${S.layers.length} — найдены как картинка в фоне большого блока и подтверждены разбором файла, без подсказки в имени (причина: ${S.layers[0] ? S.layers[0].reason.join(', ') : '—'})`);
        say(r.layers.length === 0, `стенд «фактура слоем»: в слоях зерна её нет (слоёв зерна ${r.layers.length})`);
        say(S.byTone.light.mode === 'normal' && S.bySide.dark.mode === 'color-burn' && !!rec && rec.use.light === 'multiply' && rec.use.dark === 'color-burn' && rec.notes.some((x) => /обычным слоем/.test(x)), `стенд «фактура слоем»: у донора светлые ${S.byTone.light.mode}, тёмные ${S.bySide.dark.mode} → у себя ${rec ? `${rec.use.light} и ${rec.use.dark}` : '—'}`);
        say(!!rec && rec.off.some((e) => /max-width: 700px/.test(e.cond) && /display: none/.test(e.how)) && r.status !== 'есть', `стенд «фактура слоем»: выключение на узком экране — ${rec ? rec.off.map((e) => `${e.cond} (${e.how}, ${e.layers} из ${e.of})`).join('; ') : '—'}; зерно «${r.status}»`);
      }
      if (ok('grain')) {
        const r = R.grain, rec = recipeFrom([r]); const c = r.contribution || {};
        say(r.status === 'есть' && r.layers.length === 1 && c.dark && c.light && c.dark.sd > 3.5 && c.dark.sd < 6.5 && c.light.sd > 3.5 && c.light.sd < 6.5, `стенд «зерно»: зерно ${r.status}, вклад слоя тёмный ${c.dark ? c.dark.sd : '—'} / светлый ${c.light ? c.light.sd : '—'} (ждём около 5)`);
        say(r.surface.status === 'нет' && r.surface.layers.length === 0 && rec.surface.none && !/--surface/.test(tokensBlock(rec, [r])) && !rec.none && rec.blend === 'normal', `стенд «зерно»: крупная фактура «${r.surface.status}», в блоке переменных только --grain-* (opacity ${rec.opacity})`);
      }
      if (ok('plain')) {
        const r = R.plain, S = r.surface;
        say(S.status === 'нет' && S.layers.length === 0 && r.status !== 'есть', `стенд «без фактуры»: крупная фактура «${S.status}», зерно «${r.status}»`);
        say(S.rejected.some((x) => /photo/.test(x.file || '') && /контрастная/.test(x.why)) && S.rejected.some((x) => /ramp/.test(x.file || '') && /уклон/.test(x.why)), `стенд «без фактуры»: фотография и градиент в фоне отвергнуты (${S.rejected.map((x) => `${x.file}: ${x.why.split(';')[0]}`).join(' | ')})`);
      }
      if (ok('surface')) {
        const RS = recipeFrom([R.surface]).surface, K = R.surface.surface.tile.kind;
        say(!!K && K.kind === 'paper' && !!RS.kind && RS.kind.kind === 'paper' && /--kind paper /.test(RS.tileCmd) && /уверенность/.test(RS.tileCmd) && !/выбрать глазами/.test(RS.tileCmd), `стенд, вид плитки: ${K ? `${K.kind} (${K.conf}, ${K.word})` : '—'} — в рецепте: ${RS.tileCmd.slice(0, 120)}`);
      }
      if (ok('named')) {
        const r = R.named, S = r.surface;
        say(r.layers.length === 0 && (r.patterns || []).some((p) => /hero/.test(p.el) && /имя файла похоже на фактуру/.test(p.why)), `стенд «имя texture у фотографии»: слоёв зерна ${r.layers.length}; фотография отброшена — ${((r.patterns || []).find((p) => /hero/.test(p.el)) || { why: 'не найдена в отброшенных' }).why.slice(0, 120)}`);
        say(S.status === 'нет' && S.layers.length === 0 && r.status !== 'есть' && (r.patterns || []).some((p) => /orn/.test(p.el)) && (r.patterns || []).some((p) => /grid/.test(p.el)), `стенд «орнамент и сетка плиткой»: крупная фактура «${S.status}», зерно «${r.status}»; отброшено кандидатов ${(r.patterns || []).length} (${(r.patterns || []).map((p) => p.el).join(', ')})`);
      }
      if (ok('thin')) {
        const r = R.thin, S = r.surface, T = S.tile, rec = recipeFrom([r]).surface;
        say(S.status === 'есть' && S.layers.length >= 2 && !!T && Math.abs(T.alpha - 0.5) <= 0.02 && Math.abs(T.sd - 3) <= 0.5 && Math.abs(T.mean - 248.5) <= 1.5 && sb(r, 'light').status === 'есть', `стенд «полупрозрачная плитка»: крупная фактура ${S.status}, слоёв ${S.layers.length}; плитка альфа ${T ? T.alpha : '—'}, на белом поле ${T ? `${T.mean} ± ${T.sd}` : '—'} (в файле ${T && T.raw ? `${T.raw.mean} ± ${T.raw.sd}` : '—'}); светлый σ ${sb(r, 'light').sd}`);
        say(!!rec && !rec.none && rec.notes.some((n) => /плитка донора полупрозрачная/.test(n)) && Math.abs(rec.tileSd - T.sd) < 0.01 && !!T.kind && T.kind.kind === 'pulp' && r.layers.length === 0, `стенд «полупрозрачная плитка»: вид ${T.kind ? T.kind.kind : '—'}, в рецепте цель ${rec ? `${rec.tileMean} ± ${rec.tileSd}` : '—'} и пометка о прозрачности; слоёв зерна ${r.layers.length}`);
      }
      if (ok('partial')) {
        const r = R.partial, S = r.surface, by = (re) => S.layers.find((L) => re.test(L.el)); const main = by(/^main/), card = by(/paper/), bl = sb(r, 'light');
        say(S.status === 'есть' && bl.status === 'есть' && bl.shown >= SURFACE_MIN_BLOCKS && bl.sd >= 1.2 && bl.sd <= 7.5 && !!main && main.surf.sd >= 1.2 && main.surf.sd <= 3.6, `стенд «фактура в части страницы»: крупная фактура ${S.status}; светлый σ ${bl.sd} по ${bl.blocks} участкам под фактурой; блок main — σ ${main ? main.surf.sd : '—'} (плитка ${S.tile ? S.tile.sd : '—'})`);
        say(!!card && card.surf.sd != null && card.surf.sd >= 3 && card.surf.sd <= 8.5 && Math.abs(card.surf.lift + 48) <= 8, `стенд «карточка с бумагой на белом»: σ ${card ? card.surf.sd : '—'} при σ плитки 6 (подъём ${card ? card.surf.lift : '—'}: ступенька на краю карточки в счёт не идёт)`);
      }
      if (ok('soft')) {
        const r = R.soft, c = r.contribution || {}, rec = recipeFrom([r]);
        say(r.status === 'есть' && r.layers.length === 1 && c.light && c.light.sd > 3.5 && c.light.sd < 6.5 && !rec.none && rec.opacity > 0.04 && rec.opacity < 0.09, `стенд «мягкое зерно слоем»: зерно ${r.status}, слоёв ${r.layers.length}, вклад на светлом ${c.light ? c.light.sd : '—'} (ждём около 5), в рецепте opacity ${rec.opacity}`);
        say(r.surface.status === 'нет' && r.surface.layers.length === 0 && !!r.layers[0] && !!r.layers[0].file && !r.layers[0].file.surfaceLike && /мягкое или крупное зерно/.test((r.layers[0].file.surfaceWhy || []).join('; ')), `стенд «мягкое зерно слоем»: крупная фактура «${r.surface.status}» — файл слоя: ${r.layers[0] && r.layers[0].file ? (r.layers[0].file.surfaceWhy || []).join('; ').slice(0, 110) : '—'}`);
      }
      if (ok('pics')) {
        const r = R.pics, rec = recipeFrom([r]), raw = r.grain.dark;
        say(r.status === 'нет' && r.inPictures === true && r.layers.length === 0 && raw.status === 'есть' && raw.sd >= 2 && /слоя зерна нет/.test(r.statusNote) && rec.none && /--grain-opacity: 0;/.test(tokensBlock(rec, [r])), `стенд «шум в самих фотографиях»: зерно «${r.status}» (${(r.statusNote || '').slice(0, 70)}…), слоёв ${r.layers.length}; σ на снимке справочно ${raw.sd}; рецепт — слой не нужен`);
        say((r.patterns || []).some((p) => /имя файла похоже на фактуру/.test(p.why)) && r.surface.status === 'нет' && r.surface.layers.length === 0 && grainBand(r, 'dark').sd === 0, `стенд «шум в самих фотографиях»: накладка texture-black.png слоем не считается, крупная фактура «${r.surface.status}», сила зерна слоем для сверки ${grainBand(r, 'dark').sd}`);
      }
      if (ok('pale')) {
        const r = R.pale, rec = recipeFrom([r]);
        say(r.status === 'есть' && r.layers.length === 0 && !!r.paleNoise && /speck/.test(r.paleNoise.file) && !r.inPictures && !rec.none && r.diagnosis.some((d) => /шум-плитки в фоне блока/.test(d)), `стенд «зерно шум-плиткой в фоне блока»: зерно ${r.status} без слоя — по бледной шум-плитке ${r.paleNoise ? `${r.paleNoise.file} (σ ${r.paleNoise.sd}, lag1 ${r.paleNoise.lag1})` : '—'}; рецепт есть (opacity ${rec.opacity})`);
      }
      if (ok('underlay-blobs') && ok('underlay-sheet')) {
        const rb = R['underlay-blobs'], rs = R['underlay-sheet']; const tb = await analyzeTile(path.join(site, 'blobs.webp'));
        const whyB = [...(rb.surface.rejected || []).map((x) => x.why), ...(rb.patterns || []).map((p) => p.why)].find((w) => /картинка-подложка тегом img/.test(w)) || '';
        say(tb.surfaceLike && tb.frames[0].feat.low > SURFACE.imgLowMax && rb.surface.status === 'нет' && rb.surface.layers.length === 0 && !!whyB, `стенд «подложка тегом img из крупных пятен» (по файлу — «фактура», пятна ${tb.frames[0].feat.low}): на странице крупная фактура «${rb.surface.status}» — ${whyB.slice(0, 110) || 'причина не названа'}`);
        say(rs.surface.status === 'есть' && rs.surface.layers.length === 1 && rs.surface.layers[0].surf.via === 'картинка' && !!rs.surface.tile.kind && rs.surface.tile.kind.kind === 'pulp', `стенд «подложка тегом img с зернистой бумагой»: крупная фактура ${rs.surface.status}, слой — ${rs.surface.layers[0] ? rs.surface.layers[0].surf.via : '—'}, вид ${rs.surface.tile && rs.surface.tile.kind ? rs.surface.tile.kind.kind : '—'} — настоящая фактура тегом img находится`);
      }
      if (ok('surface')) {
        /* шаг переплетения и период зернистой бумаги в рецепте — на замере стенда с подменой вида и признаков плитки */
        const rc = JSON.parse(JSON.stringify(R.surface)); rc.surface.tile.kind = { kind: 'canvas', conf: 0.8, word: 'высокая', basis: 'проба', alt: ['canvas', 'paper'], guess: 'canvas' }; rc.surface.tile.feat.per = { x: { lag: 3, peak: 0.45, depth: 0.6, peak2: 0.4 }, y: { lag: 3, peak: 0.45, depth: 0.6, peak2: 0.4 } };
        const rs = recipeFrom([rc]).surface;
        say(rs.thread === 3 && / --thread 3 /.test(rs.tileCmd) && rs.tileName === 'surface-canvas-512.webp' && rs.notes.some((n) => /шаг переплетения у донора/.test(n)), `рецепт ткани: шаг переплетения из замера — ${rs.tileCmd.slice(0, 110)}`);
        const rp = JSON.parse(JSON.stringify(R.surface)); rp.surface.tile.kind = { kind: 'pulp', conf: 0.8, word: 'высокая', basis: 'проба', alt: ['pulp', 'paper'], guess: 'pulp' }; rp.surface.tile.feat.coh = 0.45; rp.surface.tile.feat.dir = 0; for (const L of rp.surface.layers) { L.backgroundSize = '2400px'; if (L.surf && L.surf.shown) { L.surf.shown.px = 2400; L.surf.shown.size = '2400px'; } }
        const rq = recipeFrom([rp]).surface;
        say(rq.size === PULP_SIZE_MAX && rq.dir === 0 && / --dir 0 /.test(rq.tileCmd) && rq.tileName === `surface-pulp-${PULP_SIZE_MAX}.webp` && rq.notes.some((n) => /однородна/.test(n)), `рецепт зернистой бумаги: период ${rq.size} px при ${rq.shown.px} px у донора, направление волокон из замера — ${rq.tileCmd.slice(0, 110)}`);
      }
      if (ok('both') && ok('surface')) {
        const r = R.both, c = r.contribution || {}; const cs = compareSurface(R.surface, r);
        say(r.status === 'есть' && r.layers.length === 1 && c.light && c.light.sd > 3.5 && c.light.sd < 6.5 && r.surface.status === 'есть', `стенд «зерно и фактура»: зерно ${r.status} (вклад на светлом ${c.light ? c.light.sd : '—'}), крупная фактура ${r.surface.status}`);
        say(cs.verdict === 'OK', `стенд «зерно и фактура»: сила фактуры та же, что без зерна — светлый ${sb(R.surface, 'light').sd} и ${sb(r, 'light').sd} (${cs.verdict}): зерно в её замер не попало`);
      }
      if (ok('surface') && ok('surface-strong') && ok('surface-dead') && ok('plain') && ok('veil') && ok('grain')) {
        const c1 = compareSets([R.surface], [R.surface])[0], c2 = compareSets([R.surface], [R['surface-strong']])[0], c3 = compareSets([R.surface], [R['surface-dead']])[0], c4 = compareSets([R.surface], [R.plain])[0], c5 = compareSets([R.veil], [R.surface])[0], c6 = compareSets([R.grain], [R.grain])[0];
        say(c1.verdict === 'OK' && c1.surface === 'OK', `сверка стендов, сайт сам с собой: ${c1.verdict}`);
        say(c2.verdict === 'FAIL' && c2.hints.some((h) => /--sd/.test(h)), `сверка стендов, плитка вдвое сильнее: ${c2.verdict} (${(c2.rows.find((x) => x.ok === false) || {}).note}); подсказка: ${(c2.hints.find((h) => /--sd/.test(h)) || '').slice(0, 110)}`);
        say(c3.verdict === 'FAIL' && c3.rows.some((x) => /σ тёмный/.test(x.what) && x.ok === false) && c3.hints.some((h) => /color-burn/.test(h)), `сверка стендов, на тёмном multiply вместо color-burn: ${c3.verdict} (тёмный ${sb(R.surface, 'dark').sd} против ${sb(R['surface-dead'], 'dark').sd})`);
        say(c4.verdict === 'FAIL' && c4.rows.some((x) => x.what === 'крупная фактура' && x.ok === false), `сверка стендов, у сайта фактуры нет: ${c4.verdict}`);
        say(c5.rows.some((x) => /наложение светлый/.test(x.what) && x.ok === true) && c5.rows.some((x) => x.what === 'крупная фактура' && x.ok === true), `сверка стендов, слой у донора против фона блока у сайта: ${c5.verdict}; наложение на светлом — ${(c5.rows.find((x) => /наложение светлый/.test(x.what)) || {}).note || 'совпало'}`);
        say(c6.verdict === 'OK' && c6.rows.every((x) => x.group !== 'surface'), `сверка стендов, зерно само с собой: ${c6.verdict}, строк о крупной фактуре нет`);
        /* Ж:805 — два замера в одну --out: с --label итог свой, без метки — прежний texture.json; третий адрес
           без метки на месте чужого итога — WARN «перезаписан» */
        {
          const two = path.join(tmp, 'two'); const u = (f) => pathToFileURL(path.join(site, f)).href;
          const a = run([u('grain.html'), '--viewport', VP, '--out', two, '--screens', '1', '--label', 'donor']);
          const b = run([u('plain.html'), '--viewport', VP, '--out', two, '--screens', '1']);
          const ja = readJson(path.join(two, 'texture-donor.json')), jb = readJson(path.join(two, 'texture.json'));
          say(a.status === 0 && b.status === 0 && !!ja && !!jb && /grain\.html$/.test(ja.url) && /plain\.html$/.test(jb.url) && ja.results.length === 1 && jb.results.length === 1 && /итог → .*texture-donor\.json/.test(text(a)) && !/перезаписан/.test(text(a) + text(b)), `два замера в одну папку: --label donor → texture-donor.json (${ja ? path.basename(ja.url) : 'нет'}), без метки → texture.json (${jb ? path.basename(jb.url) : 'нет'}), друг друга не затёрли`);
          const c = run([u('veil.html'), '--viewport', VP, '--out', two, '--screens', '1']);
          const jc = readJson(path.join(two, 'texture.json')), ja2 = readJson(path.join(two, 'texture-donor.json'));
          say(c.status === 0 && /WARN texture\.json в этой папке был от другого адреса \([^)]*plain\.html[^)]*\) — перезаписан/.test(text(c)) && !!jc && /veil\.html$/.test(jc.url) && (jc.warnings || []).some((x) => /перезаписан/.test(x)) && !!ja2 && /grain\.html$/.test(ja2.url), `третий адрес без метки на месте чужого итога: WARN «перезаписан» в выводе и в json, итог с меткой цел`);
          const d = run([u('veil.html'), '--viewport', VP, '--out', two, '--screens', '1']);
          say(d.status === 0 && !/перезаписан/.test(text(d)), 'повторный замер того же адреса — без WARN о перезаписи');
        }
        /* командная строка по сохранённым замерам */
        const save = (k) => { const f = path.join(tmp, `${k}.json`), rec = recipeFrom([R[k]]); writeJson(f, { url: R[k].url, takenAt: R[k].takenAt, results: [R[k]], recipe: rec, tokens: tokensBlock(rec, [R[k]]) }); return f; };
        const jS = save('surface'), jD = save('surface-dead'), jG = save('grain');
        const o = run([jS, '--css', path.join(tmp, 'o.css'), '--tokens', path.join(tmp, 'o.tokens.css'), '--md', path.join(tmp, 'o.md')]);
        const oc = fs.existsSync(path.join(tmp, 'o.css')) ? fs.readFileSync(path.join(tmp, 'o.css'), 'utf8') : '';
        say(o.status === 0 && /OK   крупная фактура/.test(text(o)) && /рецепт крупной фактуры/.test(text(o)) && /surface\.css с рецептом/.test(text(o)) && /\.surface--dark/.test(oc) && !/grain-overlay/.test(oc), `texture.mjs <texture.json> --css: код ${o.status}, вердикт и рецепт напечатаны, в файле — только surface.css (зерна нет)`);
        const og = run([jG, '--css', path.join(tmp, 'g.css')]);
        const gc = fs.existsSync(path.join(tmp, 'g.css')) ? fs.readFileSync(path.join(tmp, 'g.css'), 'utf8') : '';
        say(og.status === 0 && /grain\.css с рецептом/.test(text(og)) && /grain-overlay/.test(gc) && !/\.surface/.test(gc) && /крупная фактура[^\n]*: нет/.test(text(og)) && !/рецепт крупной фактуры/.test(text(og)), `texture.mjs <texture.json> у сайта с зерном: код ${og.status}, grain.css как раньше, строка «крупная фактура: нет»`);
        const lk = spawnSync(process.execPath, [path.join(HERE, 'surface-tile.mjs'), '--out', path.join(tmp, 'mine'), '--size', '256', '--like', jS, '--json', path.join(tmp, 'mine.json')], { cwd: tmp, encoding: 'utf8', timeout: 240000, windowsHide: true });
        const mj = readJson(path.join(tmp, 'mine.json'));
        say(lk.status === 0 && !!mj && Math.abs(mj.files[0].mean - R.surface.surface.tile.mean) <= 1 && Math.abs(mj.files[0].sd - R.surface.surface.tile.sd) <= 0.4, `surface-tile.mjs --like <этот texture.json>: своя плитка ${mj ? `${mj.files[0].mean} ± ${mj.files[0].sd}` : '—'} при ${R.surface.surface.tile.mean} ± ${R.surface.surface.tile.sd} у донора`);
        const cc = run(['compare', jS, jD, '--viewport', VP, '--out', path.join(tmp, 'cmp1')]), co = run(['compare', jS, jS, '--viewport', VP, '--out', path.join(tmp, 'cmp2')]);
        say(cc.status === 1 && /FAIL/.test(text(cc)) && /фактура σ тёмный/.test(text(cc)) && co.status === 0 && /OK: сверка фактуры/.test(text(co)), `texture.mjs compare по замерам: расхождение — код ${cc.status}, совпадение — код ${co.status}`);
      }
    }
  } catch (e) {
    say(false, `selftest оборвался: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* временная папка занята — останется */ } }
  console.log(`\n${bad ? 'FAIL' : 'OK'}: проверок ${n}, провалов ${bad}`);
  return bad ? 1 : 0;
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const VALUES = ['viewport', 'viewports', 'vp', 'out', 'json', 'tokens', 'css', 'md', 'png', 'png2', 'png3', 'without', 'region', 'tile', 'label', 'screens'];
  const TOLS = ['sd-tol', 'lag-tol', 'surface-tol'];
  const { pos, opt } = parseArgs(process.argv.slice(2), { flags: ['extras', 'help', 'h', 'strict', 'selftest', 'no-browser'], values: VALUES, optional: TOLS, commands: ['compare', 'selftest'], strict: true });
  const die = (msg) => { console.error(msg); process.exit(1); };
  /* WARN lib (свой стиль не вставился) — не посреди вывода, а в итоге и в json (warnings). Только как скрипт:
     texture — ещё и модуль discover, perf и a11y, у них свой сбор */
  collectWarnings();
  const libWarnings = () => { const w = takeWarnings(); for (const x of w) console.log(`WARN ${x}`); return w; };
  /* --viewport, --viewports и старое --vp — один флаг во всех режимах (замер, texture.json, compare) */
  const vpKeys = ['viewport', 'viewports', 'vp'].filter((k) => opt[k] !== undefined && opt[k] !== true);
  const vpSpec = vpKeys.length ? String(opt[vpKeys[0]]).trim() : null;
  try {
    /* короткий -h parseArgs отдаёт позиционным — без этой проверки он уходил в замер как адрес;
       -h на месте значения флага (--out -h) — тоже справка, до любых папок и браузера */
    if (opt.help || opt.h || pos.includes('-h') || Object.values(opt).includes('-h') || (!pos.length && !opt.png && !opt.tile && !opt.selftest)) {
      console.log(HELP);
      process.exit(0);
    }
    /* флаг со значением без значения: --tokens в конце писал файл «true», --sd-tol без числа давал допуск 100 % */
    for (const k of [...VALUES, ...TOLS]) if (opt[k] === true) die(`--${k}: нужно значение (подробно: --help)`);
    if (new Set(vpKeys.map((k) => String(opt[k]).trim())).size > 1) die(`Заданы ${vpKeys.map((k) => `--${k} ${opt[k]}`).join(' и ')} — это один флаг (--viewport, --viewports, --vp), оставьте один`);
    for (const k of TOLS) if (opt[k] !== undefined && !(Number(opt[k]) >= 0)) die(`--${k} ${opt[k]}: нужно число от 0 (0.2 = ±20 %)`);
    if (pos[0] === 'selftest' || opt.selftest) {
      /* без await: selftest подгружает surface-tile.mjs, а тот импортирует этот файл — пока здесь ждёт
         await верхнего уровня, загрузка не закончится и оба встанут */
      selftest({ browser: !opt['no-browser'] }).then((code) => process.exit(code), (e) => { console.error(`FAIL texture.mjs selftest: ${e && e.message ? e.message : e}`); process.exit(1); });
    } else if (opt.tile) {
      const t = await analyzeTile(String(opt.tile), { seam: true });
      console.log(`${t.file}: ${t.format} ${t.width}×${t.height}, ${Math.round(t.bytes / 1024)} КБ, кадров ${t.pages}${t.frameMs ? ` по ${t.frameMs} мс (цикл ${t.cycleMs} мс)` : ''}, повтор ${t.loop ?? '—'}; ${t.noiseLike ? 'похоже на шум' : 'НЕ похоже на шум'}`);
      t.frames.forEach((f, i) => console.log(`  кадр ${i}: яркость ${f.mean}±${f.sd} (на сером ±${f.sdOver}), lag1 ${f.lag1}/${f.lag1v}, связь на 3–6 px ${f.farCorr}, альфа ${f.alphaMean} (прозрачных ${f.transparent}), цветность ${f.chroma}, уровней ${f.levels}`));
      if (t.frameCorr.length) console.log(`  связь соседних кадров: ${t.frameCorr.join(' / ')} (≈0 — независимые, «кипит»)`);
      /* крупная фактура — отдельной строкой: первая строка про шум остаётся как была */
      const f0 = t.frames[0];
      console.log(`  крупная фактура (мятая бумага, камень, ткань): ${t.surfaceLike ? `да — σ ${f0.alphaMean < SURFACE.alphaOpaque ? f0.sdOver : f0.sd} в пределах ${SURFACE.sdMin}…${SURFACE.sdMax}, детали крупнее пикселя (lag1 ${f0.lag1}/${f0.lag1v}${f0.feat ? `, доля мельче 5 px ${f0.feat.fine}` : ''}) и по всей площади (частей с деталями ${f0.parts ? f0.parts.live : '—'} из 16)` : `нет — ${t.surfaceWhy.join('; ')}`}`);
      if (t.kind) console.log(`  вид: ${kindLine(t.kind)}`);
      if (f0.feat) { const F = f0.feat; console.log(`  рисунок: доля деталей мельче 5 px ${F.fine}, крупнее 49 px ${F.low}; остаток — асимметрия ${F.skew}, эксцесс ${F.kurt}; повтор по ширине ${F.per.x.lag ? `шаг ${F.per.x.lag} px (${F.per.x.peak})` : 'нет'}, по высоте ${F.per.y.lag ? `шаг ${F.per.y.lag} px (${F.per.y.peak})` : 'нет'}; направленность ${F.coh} (${F.dir}°); ровных клеток 8×8 px ${F.calm}${F.field != null ? ` (их тон гуляет на ${F.field} σ)` : ''}${F.tail ? `; хвост остатка ${r2(F.tail.share * 100)} % площади` : ''}${F.room != null ? `; до края шкалы ${F.room} σ` : ''}`); }
      if (f0.over) console.log(`  полупрозрачная (альфа ${f0.alphaMean}): на белом поле ${f0.over.white.mean} ± ${f0.over.white.sd}, на чёрном ${f0.over.black.mean} ± ${f0.over.black.sd}`);
      if (t.seam && t.seam.max != null) console.log(`  шов при повторе: ${t.seam.x} по ширине, ${t.seam.y} по высоте — ${t.seam.max > SEAM_FAIL ? 'стык виден' : t.seam.max > SEAM_WARN ? 'стык возможен, смотреть глазами' : 'бесшовная'} (1 — край не отличить от середины; больше ${SEAM_FAIL} — стык виден)`);
      if (opt.json) writeJson(String(opt.json), t);
    } else if (opt.png) {
      const region = opt.region ? String(opt.region).split(',').map(Number) : null;
      const m = await measurePng(String(opt.png), { file2: opt.png2 ? String(opt.png2) : null, file3: opt.png3 ? String(opt.png3) : null, without: opt.without ? String(opt.without) : null, region });
      console.log(`${path.basename(String(opt.png))}: ${m.size[0]}×${m.size[1]}, ровных плиток ${m._tiles.length} из ${m._tiles.total}${opt.without ? ' (ровность — по снимку без слоя)' : ' (относительный порог ровности)'}`);
      printBands(m, 'зерно');
      if (m.contribution) printBands(m.contribution, 'вклад слоя (со слоем − без)');
      const st = [m.dark, m.mid, m.light].some((b) => b.status === 'есть') ? 'есть' : [m.dark, m.mid, m.light].some((b) => b.status === 'нет') ? 'нет' : 'не измерено';
      console.log(`${st === 'есть' ? 'OK  ' : 'WARN'} зерно: ${st}${st === 'не измерено' ? ' — ровных участков мало, это не «зерна нет»' : ''}`);
      if (m.size[0] > 2600 || m.size[1] > 4000) console.log('WARN снимок очень большой — если это полностраничный снимок, закреплённое зерно на нём есть только в верхнем экране; мерить снимки окна');
      if (opt.json) writeJson(String(opt.json), { ...m, _tiles: undefined });
    } else if (pos[0] === 'compare') {
      /* код 1, как у остальных ошибок аргументов и как обещает справка (до 28.09.2026 здесь был 2) */
      if (!pos[1] || !pos[2]) die('compare <донор: url|json> <сайт: url|json>');
      const kDonor = inputKind(pos[1], die), kSite = inputKind(pos[2], die);
      const vps = pickViewports(vpSpec || 'desktop,mobile');
      /* texture.json читаются до папок и браузера: битый файл — ошибка сразу, а не после замера второй стороны */
      const donorSet = kDonor === 'json' ? loadSet(pos[1]) : null, siteSet = kSite === 'json' ? loadSet(pos[2]) : null;
      const out = path.resolve(String(opt.out || path.join(runDir({}, kSite === 'json' ? 'http://site.local/' : String(pos[2])), 'texture-compare')));
      ensureDir(out);
      const screens = Number(opt.screens) || 4;
      const donor = donorSet || await runSet(String(pos[1]), vps, out, screens, false, 'donor');
      const site = siteSet || await runSet(String(pos[2]), vps, out, screens, false, 'site');
      const want = new Set(vps.map(([n]) => n));
      const dl = donor.filter((r) => want.has(r.viewport.name)); const sl = site.filter((r) => want.has(r.viewport.name));
      for (const r of dl) printResult(r);
      for (const r of sl) printResult(r);
      const cmp = compareSets(dl.length ? dl : donor, sl.length ? sl : site, { sdTol: opt['sd-tol'] != null ? Number(opt['sd-tol']) : 0.2, lagTol: opt['lag-tol'] != null ? Number(opt['lag-tol']) : 0.15, surfaceTol: opt['surface-tol'] != null ? Number(opt['surface-tol']) : 0.3 });
      console.log('\n== донор против сайта');
      console.log('   σ по полосам — вклад найденных слоёв (снимок со слоем − без); где прохода без слоя не было — σ на снимке');
      if (cmp.some((c) => c.surface)) console.log('   фактура σ — крупная фактура: разброс её вклада (снимок с плиткой − без) на ровных участках 128 px, в скобках — сколько участков');
      let fail = false, warn = false;
      for (const c of cmp) {
        console.log(`\n${c.viewport}:`);
        console.log(`  ${'что'.padEnd(18)}${'донор'.padEnd(20)}${'сайт'.padEnd(20)}${'допуск'.padEnd(10)}итог`);
        for (const r of c.rows) console.log(`  ${String(r.what).padEnd(18)}${String(r.donor ?? '—').padEnd(20)}${String(r.site ?? '—').padEnd(20)}${String(r.tol || '').padEnd(10)}${r.ok === true ? 'OK' : r.ok === false ? 'FAIL' : '—'}${r.note ? `  ${r.note}` : ''}`);
        for (const h of c.hints || []) console.log(`  → ${h}`);
        console.log(`${c.verdict.padEnd(4)} ${c.viewport}: ${c.verdict === 'OK' ? 'фактура как у донора' : c.verdict === 'WARN' ? 'сравнить нечем (нет ровных фонов или замера)' : 'фактура не как у донора'}`);
        if (c.verdict === 'FAIL') fail = true; if (c.verdict === 'WARN') warn = true;
      }
      const lw = libWarnings(); if (lw.length) warn = true;
      writeJson(String(opt.json || path.join(out, 'compare.json')), { donor: dl, site: sl, compare: cmp, ...(lw.length ? { warnings: lw } : {}) });
      console.log(`\n${fail ? 'FAIL' : warn ? 'WARN' : 'OK'}: сверка фактуры — ${path.join(out, 'compare.json')}`);
      if (fail) process.exit(1); /* compare даёт 1 при FAIL и без --strict — как раньше */
    } else {
      /* texture.json прошлого замера вместо адреса: рецепт, --tokens, --css, --md без нового замера */
      const fromJson = inputKind(pos[0], die) === 'json';
      const saved = fromJson ? readJson(String(pos[0])) : null;
      const url = fromJson ? String((saved && saved.url) || pos[0]) : String(pos[0]);
      let list;
      if (fromJson) {
        list = loadSet(pos[0]);
        if (vpSpec) { const want = new Set(pickViewports(vpSpec).map(([n]) => n)); list = list.filter((r) => want.has(r.viewport.name)); }
        if (!list.length) throw new Error(`в ${pos[0]} нет замеров${vpSpec ? ' для этих экранов' : ''}`);
        console.log(`замер из ${pos[0]} (${url}, ${saved && saved.takenAt ? saved.takenAt.slice(0, 10) : 'дата неизвестна'}) — страница заново не открывается`);
      } else {
        const vps = pickViewports(vpSpec || 'desktop,tablet,mobile');
        const out = path.resolve(String(opt.out || path.join(runDir({}, url), 'texture')));
        ensureDir(out);
        list = await runSet(url, vps, out, Number(opt.screens) || 4, !!opt.extras, opt.label ? String(opt.label) : null);
      }
      for (const r of list) printResult(r);
      const rec = recipeFrom(list);
      printRecipe(rec);
      const block = tokensBlock(rec, list);
      console.log(`\nпеременные для site.tokens.css:\n${block}`);
      const jf = fromJson ? (opt.json ? String(opt.json) : null) : String(opt.json || textureJsonFile(path.resolve(String(opt.out || path.join(runDir({}, url), 'texture'))), opt.label));
      const lw = libWarnings();
      /* итог другого адреса на этом месте (два потока в одну --out без --label) — не молча */
      const over = jf && !fromJson ? textureOverwriteNote(jf, url) : null;
      if (over) { console.log(`WARN ${over}`); lw.push(over); }
      if (jf) writeJson(jf, { url, takenAt: fromJson && saved && saved.takenAt ? saved.takenAt : new Date().toISOString(), results: list, recipe: rec, tokens: block, ...(lw.length ? { warnings: lw } : {}) });
      if (opt.tokens) { writeTokens(String(opt.tokens), block); console.log(`блок переменных → ${opt.tokens}`); }
      if (opt.css) {
        /* зерно — templates/grain.css, крупная фактура — templates/surface.css. Есть только крупная фактура —
           в файл идёт она одна: выключенный слой зерна (opacity 0) рядом с ней ни к чему */
        const S = rec.surface && !rec.surface.none ? rec.surface : null;
        const parts = []; if (!S || !rec.none) parts.push(fillGrainCss(rec)); if (S) parts.push(fillSurfaceCss(S));
        ensureDir(path.dirname(path.resolve(String(opt.css)))); fs.writeFileSync(String(opt.css), parts.join('\n'));
        console.log(`${!S ? 'grain.css' : rec.none ? 'surface.css' : 'grain.css и surface.css'} с рецептом → ${opt.css}`);
      }
      if (opt.md) { ensureDir(path.dirname(path.resolve(String(opt.md)))); fs.writeFileSync(String(opt.md), textureMarkdown(list, { recipe: rec })); console.log(`раздел для discovery.md → ${opt.md}`); }
      if (jf) console.log(`итог → ${jf}`);
      /* одиночный замер сравнивать не с чем: вердикты OK и WARN (не измерено, гаснет, не виден);
         «не как у донора» — FAIL только в compare. --strict: код 1 при FAIL, здесь его не бывает */
      const surfWarn = list.reduce((s, r) => s + (r.surface && (r.surface.layers || []).length ? (r.surface.status !== 'есть' ? 1 : 0) + (r.surface.diagnosis || []).length : 0), 0);
      const nWarn = list.filter((r) => r.status !== 'есть').length + list.reduce((s, r) => s + (r.diagnosis || []).length, 0) + lw.length + surfWarn;
      console.log(`\nИтог: ${nWarn ? `WARN ${nWarn}` : 'OK'} — одиночный замер даёт только OK и WARN; «фактура не как у донора» (FAIL, код 1) — texture.mjs compare${opt.strict ? ' (--strict: код выхода 0 — FAIL нет)' : ''}`);
    }
  } catch (e) {
    console.error(`FAIL texture.mjs: ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
}
