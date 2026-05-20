import 'dotenv/config';

const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const WEBHOOK_PATH_SECRET = process.env.WEBHOOK_PATH_SECRET;
const TELEGRAM_SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN || '';

if (!BOT_TOKEN || !PUBLIC_BASE_URL || !WEBHOOK_PATH_SECRET) {
  console.error('Заполните BOT_TOKEN, PUBLIC_BASE_URL и WEBHOOK_PATH_SECRET в .env');
  process.exit(1);
}

const webhookUrl = `${PUBLIC_BASE_URL}/telegram/${WEBHOOK_PATH_SECRET}`;

const payload = {
  url: webhookUrl,
  drop_pending_updates: true,
  allowed_updates: ['message']
};

if (TELEGRAM_SECRET_TOKEN) {
  payload.secret_token = TELEGRAM_SECRET_TOKEN;
}

const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
console.log(`Webhook URL: ${webhookUrl}`);
