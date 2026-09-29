/* Стенд perf.mjs --selftest: обычный скрипт страницы больше 1 КБ — по нему судится «сервер не сжимает».
   Сервер стенда отдаёт его как есть (без gzip и brotli), адрес локальный — ждём INFO, а не находку про бой. */
(function () {
  'use strict';

  /* маска телефона: +7 (900) 000-00-00 — оставляет только цифры и расставляет разделители */
  function formatPhone(value) {
    var digits = String(value || '').replace(/\D+/g, '');
    if (digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    if (digits.charAt(0) !== '7') digits = '7' + digits;
    digits = digits.slice(0, 11);
    var out = '+7';
    if (digits.length > 1) out += ' (' + digits.slice(1, 4);
    if (digits.length >= 4) out += ')';
    if (digits.length > 4) out += ' ' + digits.slice(4, 7);
    if (digits.length > 7) out += '-' + digits.slice(7, 9);
    if (digits.length > 9) out += '-' + digits.slice(9, 11);
    return out;
  }

  /* все поля с type=tel получают маску при вводе и при вставке */
  function bindPhones(root) {
    var fields = (root || document).querySelectorAll('input[type="tel"]');
    for (var i = 0; i < fields.length; i++) {
      fields[i].addEventListener('input', function (event) {
        var field = event.target;
        field.value = formatPhone(field.value);
      });
      fields[i].addEventListener('paste', function (event) {
        var field = event.target;
        setTimeout(function () { field.value = formatPhone(field.value); }, 0);
      });
    }
  }

  /* меню на телефоне: кнопка открывает и закрывает, Escape закрывает, фокус возвращается на кнопку */
  function bindMenu() {
    var button = document.querySelector('[data-menu-toggle]');
    var menu = document.querySelector('[data-menu]');
    if (!button || !menu) return;
    function setOpen(open) {
      menu.hidden = !open;
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) button.focus();
    }
    button.addEventListener('click', function () { setOpen(menu.hidden); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !menu.hidden) setOpen(false);
    });
  }

  /* год в подвале — чтобы не править руками каждый январь */
  function stampYear() {
    var nodes = document.querySelectorAll('[data-year]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = String(new Date().getFullYear());
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindPhones(document);
    bindMenu();
    stampYear();
  });
})();
