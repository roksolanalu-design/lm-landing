// Cloudflare Worker «lm-leads»: приймає заявку з форми сайту й пересилає її в Telegram.
//
// Секретів у цьому файлі НЕМАЄ і не має бути. Вони задаються в Cloudflare:
//   Settings → Variables and Secrets → тип Secret:
//   BOT_TOKEN — токен Telegram-бота (від @BotFather)
//   CHAT_ID   — куди слати повідомлення (id чату або групи)
//
// Формат запиту — той самий, що шле sendToTelegram() у js/main.js:
//   POST, Content-Type: application/json
//   { topic, name, phone, email, botcheck, page, source, sentAt }
// Відповідь: { ok: true } або { ok: false, error: "..." } з відповідним статусом.

// Звідки дозволено надсилати заявки (точний збіг Origin)
const ALLOWED_ORIGINS = [
  'https://lm-buh.com.ua',
  'https://www.lm-buh.com.ua',
  'http://localhost:8080'
];

// Максимальна довжина полів (символів)
const LIMITS = { topic: 100, name: 100, phone: 30, email: 200 };
// Службові поля не відхиляємо, а обрізаємо — вони не від клієнта
const SERVICE_LIMIT = 500;
// Більший запит — точно не з нашої форми
const MAX_BODY_BYTES = 10000;
// Скільки чекати Telegram, мс (форма на сайті чекає 10 с)
const TELEGRAM_TIMEOUT = 8000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ ok: false, error: 'forbidden' }, 403);
    }
    const cors = corsHeaders(origin);

    // Preflight: браузер питає дозволу перед POST з JSON
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405, { ...cors, Allow: 'POST, OPTIONS' });
    }
    if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
      return json({ ok: false, error: 'unsupported_media_type' }, 415, cors);
    }

    // Читаємо тіло з обмеженням розміру
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return json({ ok: false, error: 'too_large' }, 413, cors);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: 'bad_json' }, 400, cors);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return json({ ok: false, error: 'bad_json' }, 400, cors);
    }

    // Пастка для ботів: заповнене приховане поле → тихо «успіх», без відправки
    if (text(data.botcheck)) {
      return json({ ok: true }, 200, cors);
    }

    const lead = {
      topic: text(data.topic),
      name: text(data.name),
      phone: text(data.phone),
      email: text(data.email),
      page: text(data.page).slice(0, SERVICE_LIMIT)
    };

    // Обов'язкові поля й довжина
    for (const field of ['topic', 'name', 'phone']) {
      if (!lead[field]) return json({ ok: false, error: 'missing_' + field }, 400, cors);
    }
    for (const field of Object.keys(LIMITS)) {
      if (lead[field].length > LIMITS[field]) return json({ ok: false, error: 'too_long_' + field }, 400, cors);
    }

    if (!env.BOT_TOKEN || !env.CHAT_ID) {
      console.error('lm-leads: не задано секрети BOT_TOKEN або CHAT_ID');
      return json({ ok: false, error: 'not_configured' }, 500, cors);
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.CHAT_ID,
          text: buildMessage(lead),
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true }
        }),
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        // У лог — лише код і опис від Telegram, без токена
        console.error('lm-leads: Telegram відповів помилкою', response.status, result.description || '');
        return json({ ok: false, error: 'telegram_error' }, 502, cors);
      }
    } catch (error) {
      console.error('lm-leads: Telegram недоступний або не відповів вчасно', error && error.name);
      return json({ ok: false, error: 'telegram_unavailable' }, 502, cors);
    }

    return json({ ok: true }, 200, cors);
  }
};

// Текст повідомлення. Телефон — окремим рядком: Telegram сам розпізнає номер,
// і на телефоні його можна натиснути, щоб подзвонити.
function buildMessage(lead) {
  const lines = [
    '🆕 <b>Нова заявка з сайту</b>',
    '',
    `<b>Тема:</b> ${escapeHtml(lead.topic)}`,
    `<b>Ім’я:</b> ${escapeHtml(lead.name)}`,
    `<b>Телефон:</b> ${escapeHtml(lead.phone)}`
  ];
  if (lead.email) lines.push(`<b>E-mail:</b> ${escapeHtml(lead.email)}`);
  lines.push(`<b>Дата:</b> ${kyivDateTime()} (Київ)`);
  if (lead.page) lines.push(`<b>Сторінка:</b> ${escapeHtml(lead.page)}`);
  return lines.join('\n');
}

// Дата й час за Києвом, напр. «03.11.2026, 14:05» — рахуємо на сервері, а не беремо з браузера
function kyivDateTime() {
  return new Date().toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Для parse_mode HTML Telegram вимагає екранувати лише < > &
function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Будь-яке значення → обрізаний рядок (не рядок → порожньо)
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}
