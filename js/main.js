// LM Бухгалтерські послуги — скрипти сторінки
// Далі тут з'являться: акордеон FAQ, форма (sendLead), анімації.

// ---------- Бургер-меню ----------
(function () {
  var burger = document.querySelector('.burger');
  var nav = document.getElementById('site-nav');
  if (!burger || !nav) return;

  var desktop = window.matchMedia('(min-width: 1280px)');

  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
  }

  function isOpen() {
    return burger.getAttribute('aria-expanded') === 'true';
  }

  burger.addEventListener('click', function () {
    var open = !isOpen();
    setOpen(open);
    if (open) nav.querySelector('a').focus();
  });

  // Після переходу за пунктом меню панель закривається
  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) setOpen(false);
  });

  // Esc закриває меню і повертає фокус на кнопку
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen()) {
      setOpen(false);
      burger.focus();
    }
  });

  // Клік повз меню теж закриває його
  document.addEventListener('click', function (event) {
    if (isOpen() && !event.target.closest('.site-header')) setOpen(false);
  });

  // На десктопі панелі немає — скидаємо стан
  desktop.addEventListener('change', function (event) {
    if (event.matches) setOpen(false);
  });
})();
