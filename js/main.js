// LM Бухгалтерські послуги — скрипти сторінки

// Сигнал для запобіжника в <head>: скрипт завантажився, клас .js знімати не треба
window.lmReady = true;

// ---------- Налаштування форми заявки ----------
// WEB3FORMS_KEY — access key Web3Forms. Він публічний за задумом сервісу,
//   тому лежить у коді сайту. Лист іде на пошту, прив'язану до ключа.
// TELEGRAM_WORKER_URL — адреса нашого Cloudflare Worker для Telegram.
//   Порожній рядок → канал вимкнений і не викликається.
// УВАГА: токен Telegram-бота НІКОЛИ не кладемо сюди — код сайту бачать усі.
// Токен зберігається лише в налаштуваннях (secrets) Cloudflare Worker.
var CONFIG = {
  WEB3FORMS_KEY: 'a664bf43-7ca9-4755-ad96-ab21aacb2e26',
  TELEGRAM_WORKER_URL: 'https://lm-leads.mml-buh.workers.dev',
  TIMEOUT: 10000 // скільки чекати відповіді кожного каналу, мс
};

// Коли відкрили сторінку — для захисту від ботів, що надсилають форму миттєво
var PAGE_OPENED_AT = Date.now();

// ---------- Відправка заявки ----------
// Заявка йде паралельно в усі увімкнені канали:
//   1) e-mail — через сервіс форм Web3Forms;
//   2) Telegram — через наш Cloudflare Worker, який пересилає її боту.
// Успіх — якщо дійшла хоча б одним каналом; помилка — лише якщо впали всі.

var WEB3FORMS_PLACEHOLDER = 'ВСТАВТЕ_КЛЮЧ_WEB3FORMS';

function isLocalhost() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

// POST із JSON і обмеженням часу: якщо канал «завис», не чекаємо вічно
function postJSON(url, body) {
  var controller = 'AbortController' in window ? new AbortController() : null;
  var timer = controller && setTimeout(function () { controller.abort(); }, CONFIG.TIMEOUT);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: controller ? controller.signal : undefined
  }).finally(function () {
    clearTimeout(timer);
  });
}

// Дата й час відправки за Києвом, напр. «02.11.2026, 14:05»
function kyivDateTime() {
  return new Date().toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Канал 1: e-mail через Web3Forms
function sendToEmail(data) {
  var body = {
    access_key: CONFIG.WEB3FORMS_KEY,
    subject: 'Нова заявка з сайту LM — ' + data.topic,
    from_name: 'Сайт LM Бухгалтерські послуги',
    botcheck: data.botcheck,
    'Тема звернення': data.topic,
    'Ім’я': data.name,
    'Телефон': data.phone
  };
  // E-mail — лише якщо вказали; тоді ж він стає адресою для відповіді (Reply-To)
  if (data.email) {
    body['E-mail'] = data.email;
    body.replyto = data.email;
  }
  body['Сторінка'] = data.page;
  body['Джерело'] = data.source;
  body['Дата й час (Київ)'] = data.sentAt;

  return postJSON('https://api.web3forms.com/submit', body).then(function (response) {
    return response.json().then(function (result) {
      if (!response.ok || !result.success) throw new Error('Web3Forms: ' + (result.message || response.status));
      console.info('Web3Forms:', result.message || 'OK');
    });
  });
}

// Канал 2: Telegram через Cloudflare Worker
function sendToTelegram(data) {
  return postJSON(CONFIG.TELEGRAM_WORKER_URL, data).then(function (response) {
    if (!response.ok) throw new Error('Telegram Worker: ' + response.status);
  });
}

// Отримує { topic, name, phone, email, botcheck, page, source, sentAt }, повертає Promise:
// resolve — заявку прийнято, reject — не дійшла жодним каналом.
function sendLead(data) {
  var emailOn = Boolean(CONFIG.WEB3FORMS_KEY) && CONFIG.WEB3FORMS_KEY !== WEB3FORMS_PLACEHOLDER;
  var telegramOn = Boolean(CONFIG.TELEGRAM_WORKER_URL);

  var channels = [];
  if (emailOn) channels.push(sendToEmail(data));
  if (telegramOn) channels.push(sendToTelegram(data));

  if (!channels.length) {
    // Тестовий режим — ЛИШЕ на localhost: ім'я test-error показує попап помилки,
    // будь-яке інше — попап успіху
    if (isLocalhost()) {
      console.info('sendLead: канали не налаштовані, тестовий режим (localhost)', data);
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (data.name === 'test-error') reject(new Error('Тестова помилка'));
          else resolve();
        }, 1000);
      });
    }
    // На живому сайті заявка не має «зникнути» мовчки — показуємо помилку
    console.error('sendLead: жоден канал не налаштований (CONFIG.WEB3FORMS_KEY і CONFIG.TELEGRAM_WORKER_URL) — заявку не надіслано');
    return Promise.reject(new Error('Канали не налаштовані'));
  }

  // Канали йдуть паралельно; чекаємо, доки завершаться всі
  return Promise.allSettled(channels).then(function (results) {
    var delivered = results.some(function (result) {
      return result.status === 'fulfilled';
    });
    results.forEach(function (result) {
      if (result.status === 'rejected') console.warn('sendLead: канал не спрацював —', result.reason);
    });
    if (!delivered) throw new Error('Заявка не дійшла жодним каналом');
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

// ---------- Мобільне меню ----------
// Повноекранний <dialog>. showModal сам тримає Tab усередині і закривається по Esc,
// а фокус ставить на перший пункт меню (атрибут autofocus у HTML).
(function () {
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('mobile-menu');
  if (!burger || !menu || !menu.showModal) return;

  var closeButton = menu.querySelector('.mobile-menu__close');
  var returnFocus = true; // після кліку на пункт фокус іде до секції, а не на бургер

  function open() {
    returnFocus = true;
    menu.showModal();
    document.documentElement.classList.add('is-menu-open');
    burger.setAttribute('aria-expanded', 'true');
  }

  burger.addEventListener('click', open);

  closeButton.addEventListener('click', function () {
    menu.close();
  });

  // Будь-яке посилання в меню (пункт, контакт, кнопка, лого) закриває його,
  // а перехід до секції робить браузер
  menu.addEventListener('click', function (event) {
    if (event.target.closest('a')) {
      returnFocus = false;
      // Знімаємо блок прокрутки одразу, ще до переходу браузера до секції
      document.documentElement.classList.remove('is-menu-open');
      menu.close();
    }
  });

  // Хай як закрили (хрестик, Esc, посилання) — прибираємо блок прокрутки
  menu.addEventListener('close', function () {
    document.documentElement.classList.remove('is-menu-open');
    burger.setAttribute('aria-expanded', 'false');
    if (returnFocus) burger.focus();
  });

  // На десктопі меню немає — закриваємо, якщо вікно розширили
  window.matchMedia('(min-width: 1024px)').addEventListener('change', function (event) {
    if (event.matches && menu.open) menu.close();
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

// ---------- Перегляд сертифікатів ----------
// Мініатюри — посилання на велике зображення (href) з data-атрибутами
// (JPG-фолбек, розміри, назва, організатор, рік). Без JS посилання просто відкриває
// картинку; з JS перехоплюємо клік і показуємо перегляд.
// Велике зображення підвантажується лише при відкритті й гортанні.
// Закриття: хрестик, Esc (робить сам <dialog>) або клік по темному тлу.
(function () {
  var viewer = document.getElementById('cert-viewer');
  var thumbs = Array.prototype.slice.call(document.querySelectorAll('.cert__thumb'));
  if (!viewer || !viewer.showModal || !thumbs.length) return;

  var image = viewer.querySelector('.lightbox__image');
  var source = viewer.querySelector('.lightbox__stage source');
  var caption = viewer.querySelector('.lightbox__caption');
  var current = viewer.querySelector('.lightbox__current');
  var index = 0;

  viewer.querySelector('.lightbox__total').textContent = thumbs.length;

  function show(i) {
    index = (i + thumbs.length) % thumbs.length; // з останнього — на перший і навпаки
    var data = thumbs[index].dataset;
    var full = thumbs[index].getAttribute('href');

    // Той самий файл повторно не вантажиться і load не прийде — тоді не притушуємо
    if (source.getAttribute('srcset') !== full) image.classList.add('is-loading');
    source.srcset = full;
    image.src = data.fallback;
    image.width = data.width;
    image.height = data.height;
    image.alt = 'Сертифікат «' + data.title + '», ' + data.org + ', ' + data.year;
    caption.textContent = data.title + ' · ' + data.org + ', ' + data.year;
    current.textContent = index + 1;
  }

  ['load', 'error'].forEach(function (type) {
    image.addEventListener(type, function () {
      image.classList.remove('is-loading');
    });
  });

  thumbs.forEach(function (thumb, i) {
    thumb.addEventListener('click', function (event) {
      // Cmd/Ctrl/Shift-клік лишаємо браузеру: картинка відкриється в новій вкладці
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      show(i);
      viewer.showModal();
      document.documentElement.classList.add('is-lightbox-open');
    });
  });

  viewer.querySelector('.lightbox__prev').addEventListener('click', function () { show(index - 1); });
  viewer.querySelector('.lightbox__next').addEventListener('click', function () { show(index + 1); });
  viewer.querySelector('.lightbox__close').addEventListener('click', function () { viewer.close(); });

  // Клік повз зображення, кнопки й підписи — закриває
  viewer.addEventListener('click', function (event) {
    if (!event.target.closest('img, button, p')) viewer.close();
  });

  viewer.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });

  // Свайп на сенсорному екрані: горизонтальний рух від 50px гортає
  var startX = null;
  var startY = null;
  viewer.addEventListener('touchstart', function (event) {
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, { passive: true });
  viewer.addEventListener('touchend', function (event) {
    if (startX === null) return;
    var dx = event.changedTouches[0].clientX - startX;
    var dy = event.changedTouches[0].clientY - startY;
    startX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
  });

  // Хай як закрили — повертаємо прокрутку й фокус на мініатюру сертифіката,
  // який був відкритий останнім
  viewer.addEventListener('close', function () {
    document.documentElement.classList.remove('is-lightbox-open');
    thumbs[index].focus();
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

  // «Обрати →»: підставляємо послугу, коротко підсвічуємо поле «Тема звернення»
  // й оголошуємо вибір скрінрідеру. Сам перехід до форми робить браузер за посиланням #contact.
  // Фокус:
  //   - з мишею (pointer: fine) — у поле «Ім'я», щоб одразу друкувати;
  //   - на сенсорних пристроях (pointer: coarse) — на заголовок форми: фокус у полі
  //     відкрив би клавіатуру, і браузер прокрутив би сторінку до кінця форми.
  var touch = window.matchMedia('(pointer: coarse)');
  var status = document.getElementById('contact-topic-status');
  var title = document.getElementById('contact-title');
  var highlightTimer = null;

  function highlightTopic(topic) {
    topic.classList.remove('is-picked');
    void topic.offsetWidth; // перезапуск анімації, якщо «Обрати» натиснули знову
    topic.classList.add('is-picked');
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(function () { topic.classList.remove('is-picked'); }, 1500);
  }

  function announce(text) {
    if (!status) return;
    status.textContent = '';
    // Нове значення в наступному кадрі — щоб той самий текст оголосився й повторно
    setTimeout(function () { status.textContent = text; }, 50);
  }

  links.forEach(function (link) {
    link.addEventListener('click', function () {
      var topic = document.getElementById(TOPIC_ID);
      var name = document.getElementById(NAME_ID);
      if (topic) {
        topic.value = link.dataset.service;
        topic.dispatchEvent(new Event('change', { bubbles: true }));
        highlightTopic(topic);
        announce('Обрано тему: ' + link.dataset.service);
      }
      // setTimeout — щоб фокус поставився після переходу за якорем;
      // preventScroll — щоб фокус не зсунув прокрутку, яку зробив перехід
      setTimeout(function () {
        if (touch.matches) {
          if (!title) return;
          title.setAttribute('tabindex', '-1');
          title.focus({ preventScroll: true });
        } else if (name) {
          // Позначка каже формі: фокус поставив скрипт, а не людина,
          // тож вихід із порожнього поля ще не привід показувати помилку
          name.dataset.autoFocused = 'true';
          name.focus({ preventScroll: true });
        }
      }, 0);
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

    // Схоже на бота — пастка заповнена або форму надіслали менш ніж за 3 с
    // після відкриття сторінки. Тихо показуємо «успіх», нічого не надсилаючи
    var botcheck = form.elements.botcheck.value;
    if (botcheck || Date.now() - PAGE_OPENED_AT < 3000) {
      form.reset();
      clearErrors();
      showPopup('popup-success');
      return;
    }

    var data = {
      topic: fields.topic.value,
      name: fields.name.value.trim(),
      phone: fields.phone.value.trim(),
      email: fields.email.value.trim(),
      botcheck: botcheck,
      page: location.href,
      source: document.referrer || 'прямий перехід',
      sentAt: kyivDateTime()
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
      // Усі, хто з'явився одночасно (картки в одному ряду), ідуть по черзі —
      // у порядку на екрані: зверху вниз, зліва направо (заголовок раніше за картки)
      var order = 0;
      entries.sort(function (a, b) {
        return (a.boundingClientRect.top - b.boundingClientRect.top) ||
          (a.boundingClientRect.left - b.boundingClientRect.left);
      });
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        // Не більше 5 кроків затримки (заголовок + 5 кроків «Як ми працюємо» в ряд):
        // після швидкої прокрутки в одну пачку потрапляє пів сторінки,
        // і останні елементи інакше чекали б секунду.
        // --reveal-delay — та сама затримка для вкладених анімацій (лінія шкали)
        var delay = Math.min(order, 5) * stagger + 'ms';
        entry.target.style.animationDelay = delay;
        entry.target.style.setProperty('--reveal-delay', delay);
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
        order += 1;
      });
    }, { threshold: 0.15 });
    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  }

  // --- Патерн-смуга ---
  // Смуга пливе лише тоді, коли її видно; поза екраном анімація на паузі
  var strips = document.querySelectorAll('.pattern-strip');
  if (strips.length && !reduceMotion && 'IntersectionObserver' in window) {
    var stripObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('is-moving', entry.isIntersecting);
      });
    });
    strips.forEach(function (strip) {
      stripObserver.observe(strip);
    });
  }

  // --- Лічильник у статистиці Hero ---
  // Скрінрідер читає приховану копію з фінальним числом, тут анімується видима.
  // Лічильник — частина таймлайну Hero: стартує разом із появою статистики.
  var counters = document.querySelectorAll('[data-count]');
  var stats = document.querySelector('.stats');
  var counterDuration = ms('--duration-hero-counter');
  if (!counters.length || !stats || reduceMotion || !counterDuration) return;

  // Фіксуємо ширину, поки число росте, щоб сусідні цифри не їздили
  counters.forEach(function (counter) {
    var box = counter.closest('.stats__value');
    box.style.minWidth = box.getBoundingClientRect().width + 'px';
    counter.textContent = '0';
  });

  var started = false;
  function runCounters() {
    if (started) return;
    started = true;
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var progress = Math.min((now - start) / counterDuration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); // ease-out: наприкінці сповільнюється
      counters.forEach(function (counter) {
        // ceil, а не round: інакше число надовго «зависає» на 299 перед 300
        counter.textContent = Math.ceil(Number(counter.dataset.count) * eased);
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

  // Рахуємо з моменту, коли статистика починає з'являтися (кінець її затримки в CSS)
  function startWithStats() {
    var appearing = stats.getAnimations ? stats.getAnimations() : [];
    var pending = appearing.some(function (animation) {
      return animation.playState !== 'finished' &&
        (animation.currentTime || 0) < animation.effect.getTiming().delay;
    });
    if (pending) stats.addEventListener('animationstart', runCounters, { once: true });
    else runCounters();
  }

  var box = stats.getBoundingClientRect();
  var onScreen = box.top + box.height / 2 < window.innerHeight;
  if (onScreen || !('IntersectionObserver' in window)) {
    // Звичайний випадок: статистику видно одразу — працює таймлайн Hero
    startWithStats();
  } else {
    // Статистика нижче першого екрана: вона і лічильник чекають, поки її побачать
    stats.classList.add('is-waiting');
    var counterObserver = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      counterObserver.disconnect(); // один раз
      stats.classList.add('is-late');
      stats.classList.remove('is-waiting');
      runCounters();
    }, { threshold: 0.5 });
    counterObserver.observe(stats);
  }
})();

// ---------- Sticky CTA (mobile) ----------
// Липка панель «Залишити заявку» внизу екрана, лише <1024px.
// Видно, коли кнопка з data-sticky-cta-yield (Hero) уже пішла вгору під шапку
// І верх форми ще не з'явився. На формі й футері — схована.
// Схована панель — inert (не фокусується, не читається).
// Меню, попапи й лайтбокс ховають її самі через CSS (html:has(dialog[open])).
// Без розмітки [data-sticky-cta] функція тихо завершується — фіча вимкнена.
function initStickyCta() {
  var panel = document.querySelector('[data-sticky-cta]');
  var yields = Array.prototype.slice.call(document.querySelectorAll('[data-sticky-cta-yield]'));
  var form = document.getElementById('contact');
  if (!panel || !yields.length || !form || !('IntersectionObserver' in window)) return;

  var mobile = window.matchMedia('(max-width: 1023.98px)');
  var FAR = '100000px';   // «нескінченний» запас в один бік (див. start)
  var heroGone = false;   // кнопка Hero вже вище шапки
  var formAhead = false;  // верх форми ще нижче за екран
  var observers = [];

  function update() {
    var show = mobile.matches && heroGone && formAhead;
    panel.classList.toggle('is-visible', show);
    panel.inert = !show;
  }

  // Перший стан ставимо без анімації: після перезавантаження посередині сторінки
  // панель одразу на місці. Анімацію вмикаємо, коли сторінка завантажилась
  // (браузер уже відновив скрол) і всі спостерігачі звітували хоча б раз
  var loaded = document.readyState === 'complete';
  var firstReports = 0;
  panel.classList.add('is-instant');

  function enableMotion() {
    if (!loaded || firstReports < observers.length) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { panel.classList.remove('is-instant'); });
    });
  }

  if (!loaded) {
    window.addEventListener('load', function () {
      loaded = true;
      enableMotion();
    });
  }

  function watch(targets, rootMargin, onEntry) {
    var reported = false;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(onEntry);
      update();
      if (!reported) {
        reported = true;
        firstReports += 1;
        enableMotion();
      }
    }, { rootMargin: rootMargin });
    targets.forEach(function (target) { observer.observe(target); });
    observers.push(observer);
  }

  function start() {
    // Кожне питання — окремий спостерігач, у якого «екран» продовжено до нескінченності
    // в протилежний бік. Тоді він перемикається рівно на своїй межі, навіть якщо
    // сторінка перестрибнула через екран (якір без плавної прокрутки)
    var header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
    // Hero: «пішла» — коли її низ вище низу липкої шапки
    watch([yields[0]], -header + 'px 0px ' + FAR + ' 0px', function (entry) {
      heroGone = !entry.isIntersecting;
    });
    // Форма: «попереду» — поки її верх нижче екрана
    watch([form], FAR + ' 0px 0px 0px', function (entry) {
      formAhead = !entry.isIntersecting;
    });
  }

  function stop() {
    observers.forEach(function (observer) { observer.disconnect(); });
    observers = [];
    heroGone = formAhead = false;
    update();
  }

  // Поворот екрана або зміна ширини: на ≥1024 панель вимикається повністю
  mobile.addEventListener('change', function () {
    stop();
    if (mobile.matches) start();
  });

  if (mobile.matches) start();
  else update();
}

initStickyCta();
