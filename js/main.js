// LM Бухгалтерські послуги — скрипти сторінки

// Сигнал для запобіжника в <head>: скрипт завантажився, клас .js знімати не треба
window.lmReady = true;

// ---------- Відправка заявки ----------
// ЗАГЛУШКА. Куди надсилати (Telegram / e-mail) — ще не вирішено.
// Щоб підключити справжню відправку, замініть лише тіло цієї функції.
// Вона отримує об'єкт { topic, name, phone, email } і має повернути Promise:
// resolve — заявку прийнято, reject — сталася помилка.
// УВАГА: не вставляйте сюди секретні ключі (наприклад, токен Telegram-бота) —
// код сайту бачать усі. Запит має йти на власний сервер або сервіс форм.
//
// Для перевірки попапа помилки введіть у поле «Ім'я» слово test-error.
function sendLead(data) {
  return new Promise(function (resolve, reject) {
    console.info('sendLead (заглушка):', data);
    setTimeout(function () {
      if (data.name === 'test-error') reject(new Error('Тестова помилка'));
      else resolve();
    }, 1000);
  });
}

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

  var desktop = window.matchMedia('(min-width: 1024px)');

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
      // setTimeout — щоб фокус поставився після переходу за якорем.
      // Позначка каже формі: фокус поставив скрипт, а не людина,
      // тож вихід із порожнього поля ще не привід показувати помилку.
      if (name) {
        setTimeout(function () {
          name.dataset.autoFocused = 'true';
          name.focus({ preventScroll: true });
        }, 0);
      }
    });
  });
})();

// ---------- Форма ----------
(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;

  var button = form.querySelector('.form__button');
  var buttonText = button.textContent;
  var fields = {
    topic: form.elements.topic,
    name: form.elements.name,
    phone: form.elements.phone,
    email: form.elements.email
  };

  // Кожне правило повертає текст помилки або порожній рядок, якщо все гаразд
  var rules = {
    topic: function (value) {
      return value ? '' : 'Оберіть тему звернення.';
    },
    name: function (value) {
      return value.length < 2 ? 'Вкажіть ім’я.' : '';
    },
    phone: function (value) {
      if (!value) return 'Вкажіть номер телефону.';
      var digits = value.replace(/\D/g, '');
      var ok = /^[\d\s()+-]+$/.test(value) && digits.length >= 10 && digits.length <= 13;
      return ok ? '' : 'Перевірте номер: наприклад, 067 208 46 31.';
    },
    email: function (value) {
      if (!value) return ''; // e-mail необов'язковий
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Перевірте e-mail: наприклад, name@example.com.';
    }
  };

  // Показує або прибирає помилку під полем і повертає її текст
  function validateField(key) {
    var input = fields[key];
    var error = document.getElementById(input.id + '-error');
    var message = rules[key](input.value.trim());
    error.textContent = message;
    error.hidden = !message;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', error.id);
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
    return message;
  }

  function clearErrors() {
    Object.keys(fields).forEach(function (key) {
      var input = fields[key];
      var error = document.getElementById(input.id + '-error');
      error.textContent = '';
      error.hidden = true;
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    });
  }

  // Помилку показуємо, коли людина вийшла з поля (blur) або спробувала надіслати.
  // Під час набору нових помилок не показуємо, але вже показана зникає,
  // щойно поле виправлено.
  // popupOpen: коли відкривається попап, поле теж втрачає фокус —
  // це не привід показувати помилку в щойно очищеній формі.
  var popupOpen = false;
  Object.keys(fields).forEach(function (key) {
    var input = fields[key];
    input.addEventListener('blur', function () {
      // Фокус поставив скрипт (кнопка «Обрати» на картці), і людина нічого не ввела —
      // це ще не взаємодія з полем
      var untouched = input.dataset.autoFocused && !input.value;
      delete input.dataset.autoFocused;
      if (!popupOpen && !untouched) validateField(key);
    });
    input.addEventListener('input', function () {
      delete input.dataset.autoFocused;
      if (input.hasAttribute('aria-invalid') && !rules[key](input.value.trim())) validateField(key);
    });
  });
  fields.topic.addEventListener('change', function () {
    validateField('topic');
  });

  function showPopup(id) {
    var popup = document.getElementById(id);
    popupOpen = true;
    popup.showModal(); // сам переводить фокус усередину і закривається по Esc
  }

  document.querySelectorAll('.popup').forEach(function (popup) {
    popup.querySelector('[data-popup-close]').addEventListener('click', function () {
      popup.close();
    });
    // Клік по затемненню навколо попапа теж закриває його
    popup.addEventListener('click', function (event) {
      if (event.target === popup) popup.close();
    });
    // Хай як закрили (кнопка, Esc, клік повз) — фокус повертається на кнопку форми
    popup.addEventListener('close', function () {
      button.focus();
      popupOpen = false; // після focus(), щоб перехід фокуса не запустив перевірку полів
    });
  });

  // Поки заявка надсилається, кнопка неактивна — подвійних заявок не буде
  function setBusy(busy) {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    button.textContent = busy ? 'Надсилаємо…' : buttonText;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (button.disabled) return;

    var firstInvalid = null;
    Object.keys(fields).forEach(function (key) {
      if (validateField(key) && !firstInvalid) firstInvalid = fields[key];
    });
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    // Пастка заповнена — це бот: тихо нічого не надсилаємо
    if (form.elements.hp_field.value) {
      form.reset();
      return;
    }

    var data = {
      topic: fields.topic.value,
      name: fields.name.value.trim(),
      phone: fields.phone.value.trim(),
      email: fields.email.value.trim()
    };

    setBusy(true);
    sendLead(data).then(function () {
      setBusy(false);
      form.reset();
      clearErrors();
      showPopup('popup-success');
    }, function () {
      // При помилці поля НЕ очищаємо
      setBusy(false);
      showPopup('popup-error');
    });
  });
})();

// ---------- Анімації ----------
(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rootStyle = getComputedStyle(document.documentElement);

  // Читає тривалість із токена: «1600ms» → 1600
  function ms(token) {
    var value = rootStyle.getPropertyValue(token).trim();
    return value.indexOf('ms') > -1 ? parseFloat(value) : parseFloat(value) * 1000;
  }

  // --- Поява секцій ---
  // Елементи з data-reveal сховані в CSS (лише під .js і без «Зменшити рух»).
  // Коли елемент заходить на екран, він отримує клас is-visible — один раз.
  var revealItems = document.querySelectorAll('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach(function (item) {
      item.classList.add('is-visible');
    });
  } else {
    var stagger = ms('--stagger');
    var revealObserver = new IntersectionObserver(function (entries) {
      // Усі, хто з'явився одночасно (картки в одному ряду), ідуть по черзі
      var order = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.style.animationDelay = order * stagger + 'ms';
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
        order += 1;
      });
    }, { threshold: 0.15 });
    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  }

  // --- Лічильник у статистиці ---
  // Скрінрідер читає приховану копію з фінальним числом, тут анімується видима.
  var counters = document.querySelectorAll('[data-count]');
  var stats = document.querySelector('.stats');
  var counterDuration = ms('--duration-counter');
  if (!counters.length || !stats || reduceMotion || !counterDuration || !('IntersectionObserver' in window)) return;

  // Фіксуємо ширину, поки число росте, щоб сусідні цифри не їздили
  counters.forEach(function (counter) {
    var box = counter.closest('.stats__value');
    box.style.minWidth = box.getBoundingClientRect().width + 'px';
    counter.textContent = '0';
  });

  function runCounters() {
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var progress = Math.min((now - start) / counterDuration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); // ease-out
      counters.forEach(function (counter) {
        counter.textContent = Math.round(Number(counter.dataset.count) * eased);
      });
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        counters.forEach(function (counter) {
          counter.closest('.stats__value').style.minWidth = '';
        });
      }
    }
    requestAnimationFrame(frame);
  }

  var counterObserver = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    counterObserver.disconnect(); // один раз
    runCounters();
  }, { threshold: 0.5 });
  counterObserver.observe(stats);
})();
