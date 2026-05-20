import 'dotenv/config';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Заполните BOT_TOKEN в .env');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ drop_pending_updates: true })
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
