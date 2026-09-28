#!/usr/bin/env node
/**
 * Собирает маленькие .docx для requirements.mjs selftest без зависимостей: prd-mini.docx
 * (вымышленный сервис «Полка» в разметке учебного шаблона PRD — FR-таблица, NFR, строки-примеры
 * шаблона «Веб-сервис: …», «Заполнить», таблица ФИО с вымышленными именами, стек, глоссарий,
 * пустая таблица вопросов) и prd-mini-v2.docx (FR-02 изменён, FR-04 «чат» добавлен, термин
 * «Полка» убран). Вывод детерминированный: дата в zip — 1980-01-01.
 *
 *   node make-docx.mjs            пересобрать оба файла рядом с собой
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const P = (text, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${text ? `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : ''}</w:p>`;
const T = (rows) => `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${rows[0].map(() => '<w:gridCol w:w="2000"/>').join('')}</w:tblGrid>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${c ? P(c) : '<w:p/>'}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
const H = (t) => P(t, 'Heading1');

function prd(v2) {
  return [
    P('Product Requirements Document (PRD)', 'Title'),
    P('Учебный пример для самопроверки requirements.mjs: вымышленный сервис «Полка».'),
    T([['Поле', 'Значение'], ['Название продукта', 'Полка'], ['Тип продукта', 'Веб-сервис'], ['Название команды', 'Заполнить'], ['Версия документа', v2 ? '0.2' : '0.1']]),
    H('1. Суть продукта'),
    P('Полка — веб-сервис, где друзья вместе выбирают книгу для клуба.'),
    H('5.1. Что входит в проект'),
    P('• Поиск книг. • Карточка книги. • Комната клуба.'),
    P('Веб-сервис: нет оплаты и роли администратора.'),
    H('6. Функциональные требования'),
    T([['ID', 'Роль', 'Что пользователь может делать', 'Приоритет', 'Критерий готовности'],
      ['FR-01', 'Пользователь', 'Ищет книгу по названию', 'Must', 'Книги отображаются'],
      ['FR-02', 'Пользователь', v2 ? 'Открывает карточку книги с отзывами' : 'Открывает карточку книги', 'Must', 'Показывается описание'],
      ['FR-03', 'Участник', 'Создаёт комнату клуба', 'Should', 'Создаётся комната с кодом'],
      ...(v2 ? [['FR-04', 'Участник', 'Общается в чате комнаты', 'Must', 'Сообщения видны участникам']] : [])]),
    H('7. Нефункциональные требования и ограничения'),
    P('Веб-сервис: Производительность | Страница расписания открывается не дольше 2 с при 100 одновременных пользователях | Нагрузочный тест на стенде.'),
    T([['Категория', 'Требование', 'Как проверим'], ['Производительность', 'Основные страницы открываются до 2 секунд', 'Проверка в браузере'], ['Совместимость', 'Работа в Chrome, Firefox и Edge', 'Проверка'], ['Надёжность', 'Ошибки не приводят к потере комнаты', 'Тестирование']]),
    H('8. Критерии успешности проекта'),
    P('Веб-сервис: Доля успешных сценариев записи | Ручной прогон 20 сценариев | Не менее 18 из 20.'),
    H('9. Участники проекта'),
    T([['ФИО', 'Учебная группа', 'Основная роль'], ['Иван Тестовый', 'ИТ-00', 'Тестировщик'], ['Мария Примерова', 'ИТ-00', 'Дизайнер']]),
    H('11. Ресурсы и технологический стек'),
    T([['Категория', 'Что используем', 'Почему'], ['Клиентская часть', 'React, TypeScript', 'привычно команде'], ['Хранение данных', 'PostgreSQL', 'надёжно']]),
    H('14. Глоссарий'),
    T([['Термин', 'Что означает в нашем проекте'], ['Клуб', 'Группа друзей, которые вместе выбирают книгу.'], ...(v2 ? [] : [['Полка', 'Общий список книг клуба.']])]),
    H('15. Открытые вопросы'),
    T([['Вопрос', 'Кто отвечает', 'Срок']]),
  ].join('');
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const files = (body) => [
  ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`],
  ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
  ['word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ['word/styles.xml', `${XML}<w:styles ${W}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style></w:styles>`],
  ['word/document.xml', `${XML}<w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`],
];

function zip(list) {
  const locals = []; const central = []; let off = 0;
  for (const [n, text] of list) {
    const name = Buffer.from(n, 'utf8'); const raw = Buffer.from(text, 'utf8'); const comp = zlib.deflateRawSync(raw, { level: 9 }); const crc = zlib.crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(list.length, 8); end.writeUInt16LE(list.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

for (const [name, v2] of [['prd-mini.docx', false], ['prd-mini-v2.docx', true]]) {
  const f = path.join(HERE, name); fs.writeFileSync(f, zip(files(prd(v2)))); console.log(`OK ${f}`);
}
