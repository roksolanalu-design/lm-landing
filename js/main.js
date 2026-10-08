// LM Бухгалтерські послуги — скрипти сторінки
// Далі тут з'являться: акордеон FAQ, форма (sendLead), анімації.

// ---------- Липка шапка: лінія після початку скролу ----------
// Замість слухача scroll стежимо за міткою вгорі сторінки:
// браузер сам повідомляє, коли вона виходить з екрана.
(function () {
  var header = document.querySelector('.site-header');
  if (!header || !('IntersectionObserver' in window)) return;

  var sentinel = document.createElement('div');
  sentinel.className = 'scroll-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  document.body.prepend(sentinel);

  new IntersectionObserver(function (entries) {
    header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
  }).observe(sentinel);
})();

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

// ---------- Акордеон FAQ ----------
// Кожне питання відкривається і закривається незалежно від інших.
(function () {
  document.querySelectorAll('.faq__toggle').forEach(function (button) {
    button.addEventListener('click', function () {
      var open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      button.closest('.faq__item').classList.toggle('is-open', open);
    });
  });
})();

// ---------- Послуги → форма ----------
// Список послуг один: це картки в HTML (атрибут data-service).
// Звідси ж беруться варіанти поля «Тема звернення», тому вони не можуть розійтися.
(function () {
  var TOPIC_ID = 'contact-topic'; // <select> «Тема звернення»
  var NAME_ID = 'contact-name';   // поле «Ім'я»

  var links = document.querySelectorAll('[data-service]');
  if (!links.length) return;

  // Заповнюємо селект назвами послуг із карток
  var topic = document.getElementById(TOPIC_ID);
  if (topic) {
    links.forEach(function (link) {
      var option = document.createElement('option');
      option.value = option.textContent = link.dataset.service;
      topic.appendChild(option);
    });
  }

  // «Обрати →»: підставляємо послугу і ставимо курсор у поле «Ім'я».
  // Сам перехід до форми робить браузер за посиланням #contact.
  links.forEach(function (link) {
    link.addEventListener('click', function () {
      var topic = document.getElementById(TOPIC_ID);
      var name = document.getElementById(NAME_ID);
      if (topic) {
        topic.value = link.dataset.service;
        topic.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // setTimeout — щоб фокус поставився після переходу за якорем
      if (name) {
        setTimeout(function () {
          name.focus({ preventScroll: true });
        }, 0);
      }
    });
  });
})();
