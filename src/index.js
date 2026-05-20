import express from 'express';
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = Number(process.env.PORT || 3000);
const COMPANY_NAME = process.env.COMPANY_NAME || 'Коминт';
const MANAGER_CHAT_ID = process.env.MANAGER_CHAT_ID || '';
const WEBHOOK_PATH_SECRET = process.env.WEBHOOK_PATH_SECRET || 'telegram-webhook';
const TELEGRAM_SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN || '';

if (!BOT_TOKEN) {
  console.error('Ошибка: укажите BOT_TOKEN в .env');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'comint-telegram-sales-bot' });
});

app.post(`/telegram/${WEBHOOK_PATH_SECRET}`, (req, res) => {
  if (TELEGRAM_SECRET_TOKEN) {
    const headerToken = req.header('X-Telegram-Bot-Api-Secret-Token');
    if (headerToken !== TELEGRAM_SECRET_TOKEN) {
      return res.status(401).json({ ok: false, error: 'Bad Telegram secret token' });
    }
  }

  // Быстро отвечаем Telegram, а обработку делаем отдельно.
  // Так Telegram не будет повторять запрос при долгой обработке файла/заявки.
  res.sendStatus(200);
  handleUpdate(req.body).catch((error) => console.error('handleUpdate error:', error));
});

app.listen(PORT, () => {
  console.log(`Comint Telegram bot is running on port ${PORT}`);
  console.log(`Webhook path: /telegram/${WEBHOOK_PATH_SECRET}`);
});

async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId = msg.chat?.id;
  const chatType = msg.chat?.type;
  const text = (msg.text || msg.caption || '').trim();

  if (!chatId) return;

  if (text.startsWith('/chatid')) {
    await sendMessage(chatId, `chat_id этого чата:\n${chatId}`);
    return;
  }

  // Команды для менеджеров в группе.
  if (chatType !== 'private') {
    await handleManagerChatMessage(msg);
    return;
  }

  await handleClientMessage(msg);
}

async function handleManagerChatMessage(msg) {
  const text = (msg.text || '').trim();
  if (!text) return;

  if (text.startsWith('/reply')) {
    const [, leadId, ...messageParts] = text.split(/\s+/);
    const replyText = messageParts.join(' ').trim();

    if (!leadId || !replyText) {
      await sendMessage(msg.chat.id, 'Формат ответа клиенту:\n/reply LEAD_ID текст сообщения');
      return;
    }

    const leads = await readJson('leads.json', []);
    const lead = leads.find((item) => item.id === leadId);

    if (!lead) {
      await sendMessage(msg.chat.id, `Заявка ${leadId} не найдена.`);
      return;
    }

    await sendMessage(lead.chatId, `Менеджер ${COMPANY_NAME}:\n\n${replyText}`);
    lead.managerReplies = lead.managerReplies || [];
    lead.managerReplies.push({
      at: new Date().toISOString(),
      managerChatId: msg.chat.id,
      managerMessageId: msg.message_id,
      text: replyText
    });
    await saveLead(lead);
    await sendMessage(msg.chat.id, `Сообщение отправлено клиенту по заявке ${leadId}.`);
  }
}

async function handleClientMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();
  const userId = String(msg.from?.id || chatId);

  if (text === '/start' || text === '🏠 Главное меню') {
    await resetSession(userId);
    await sendWelcome(chatId);
    return;
  }

  if (text === '/help') {
    await sendHelp(chatId);
    return;
  }

  if (text === '/manager' || isManagerRequest(text)) {
    await startManagerRequest(msg);
    return;
  }

  const fileMeta = extractFileMeta(msg);
  if (fileMeta) {
    await handleClientFile(msg, fileMeta);
    return;
  }

  const session = await getSession(userId);

  if (session.stage === 'ask_phone') {
    await handlePhoneAnswer(msg, session);
    return;
  }

  if (session.stage === 'ask_name') {
    await handleNameAnswer(msg, session);
    return;
  }

  if (session.stage === 'ask_file') {
    if (isNoFile(text)) {
      session.lead.noFile = true;
      await saveSession(userId, { ...session, stage: 'ask_phone' });
      await sendMessage(chatId, 'Хорошо, зафиксировал: файла пока нет.\n\nОставьте номер телефона для связи с менеджером.\n\nПример: +375 29 123-45-67', contactKeyboard());
      return;
    }

    // Если человек написал комментарий вместо файла — сохраняем и продолжаем.
    if (text) {
      session.lead.comments = session.lead.comments || [];
      session.lead.comments.push({ at: new Date().toISOString(), text });
      await saveSession(userId, { ...session, stage: 'ask_phone' });
      await sendMessage(chatId, 'Комментарий записал.\n\nОставьте номер телефона для связи с менеджером.\n\nПример: +375 29 123-45-67', contactKeyboard());
      return;
    }
  }

  if (session.stage === 'ask_questions') {
    await handleQuestionAnswer(msg, session);
    return;
  }

  await routeFreeText(msg);
}

async function sendWelcome(chatId) {
  const text = [
    `Здравствуйте! Я бот компании ${COMPANY_NAME}.`,
    '',
    'Помогу рассчитать заказ, принять макет и передать заявку менеджеру.',
    '',
    'Можно написать обычными словами:',
    '— нужен баннер 2 на 3',
    '— хочу наклейки на банки',
    '— нужны визитки 200 штук',
    '— печать на кружках',
    '— нужна вывеска с подсветкой',
    '',
    'Или выберите вариант ниже.'
  ].join('\n');

  await sendMessage(chatId, text, mainKeyboard());
}

async function sendHelp(chatId) {
  await sendMessage(
    chatId,
    [
      'Я могу помочь с услугами:',
      '— баннеры и широкоформатная печать;',
      '— наклейки, стикеры, этикетки;',
      '— визитки и полиграфия;',
      '— сувенирная продукция;',
      '— наружная реклама;',
      '— roll-up и стенды.',
      '',
      'Для связи с менеджером напишите: менеджер, оператор или /manager.'
    ].join('\n'),
    mainKeyboard()
  );
}

async function routeFreeText(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();

  if (!text) {
    await sendMessage(chatId, 'Напишите, что хотите заказать, или выберите вариант в меню.', mainKeyboard());
    return;
  }

  const services = await readJson('services.json', []);
  const match = matchService(text, services);

  if (!match.best) {
    await sendMessage(
      chatId,
      [
        'Я пока не понял, что именно нужно рассчитать.',
        '',
        'Могу помочь с баннерами, наклейками, визитками, листовками, сувенирной продукцией, наружной рекламой и стендами.',
        '',
        'Напишите задачу чуть подробнее или нажмите «Позвать менеджера».'
      ].join('\n'),
      mainKeyboard()
    );
    return;
  }

  if (match.ambiguous.length > 1) {
    const rows = match.ambiguous.slice(0, 4).map((item) => [item.service.name]);
    rows.push(['👨‍💼 Позвать менеджера']);

    await sendMessage(
      chatId,
      [
        'Нашёл несколько похожих вариантов. Что ближе к вашей задаче?',
        '',
        ...match.ambiguous.slice(0, 4).map((item, index) => `${index + 1}. ${item.service.name}`)
      ].join('\n'),
      { keyboard: rows, resize_keyboard: true }
    );
    return;
  }

  await startServiceFlow(msg, match.best.service, text);
}

async function startServiceFlow(msg, service, initialText = '') {
  const userId = String(msg.from?.id || msg.chat.id);
  const lead = createLead(msg);

  lead.service = {
    code: service.code,
    name: service.name,
    category: service.category,
    managerOnly: Boolean(service.managerOnly)
  };
  lead.initialMessage = initialText;
  lead.fields = lead.fields || {};
  lead.answers = lead.answers || [];

  prefillLeadFromText(lead, service, initialText);

  const nextQuestion = getNextQuestion(service, lead);
  const session = {
    stage: nextQuestion ? 'ask_questions' : 'ask_file',
    serviceCode: service.code,
    lead,
    updatedAt: new Date().toISOString()
  };

  await saveSession(userId, session);

  if (nextQuestion) {
    const already = buildPrefillSummary(lead);
    await sendMessage(
      msg.chat.id,
      [
        service.intro || `Понял: ${service.name}.`,
        already ? `\nУже понял из сообщения:\n${already}` : '',
        '',
        nextQuestion.prompt
      ].filter(Boolean).join('\n'),
      serviceKeyboard()
    );
  } else {
    await askForFileOrPhone(msg.chat.id, userId, session, service);
  }
}

async function handleQuestionAnswer(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const services = await readJson('services.json', []);
  const service = services.find((item) => item.code === session.serviceCode);

  if (!service) {
    await resetSession(userId);
    await sendMessage(msg.chat.id, 'Сценарий услуги не найден. Напишите запрос заново или позовите менеджера.', mainKeyboard());
    return;
  }

  const question = getNextQuestion(service, session.lead);
  const text = (msg.text || msg.caption || '').trim();

  if (!question) {
    await askForFileOrPhone(msg.chat.id, userId, session, service);
    return;
  }

  setAnswer(session.lead, question, text);

  const nextQuestion = getNextQuestion(service, session.lead);
  if (nextQuestion) {
    await saveSession(userId, { ...session, updatedAt: new Date().toISOString() });
    await sendMessage(msg.chat.id, nextQuestion.prompt, serviceKeyboard());
    return;
  }

  await askForFileOrPhone(msg.chat.id, userId, session, service);
}

async function askForFileOrPhone(chatId, userId, session, service) {
  const calculation = await calculateLead(session.lead, service);
  if (calculation) {
    session.lead.priceEstimate = calculation.priceEstimate;
    session.lead.calculation = calculation;
  }

  if (service.askFile) {
    await saveSession(userId, { ...session, stage: 'ask_file', updatedAt: new Date().toISOString() });
    await sendMessage(
      chatId,
      [
        calculation?.clientText || '',
        'Прикрепите макет, логотип, фото примера или техническое задание.',
        '',
        'Подходящие форматы: jpg, png, jpeg, tiff, tif, pdf, cdr, psd.',
        '',
        'Если файла нет — нажмите «Файла нет».'
      ].filter(Boolean).join('\n'),
      fileKeyboard()
    );
    return;
  }

  await saveSession(userId, { ...session, stage: 'ask_phone', updatedAt: new Date().toISOString() });
  await sendMessage(chatId, 'Оставьте номер телефона для связи с менеджером.\n\nПример: +375 29 123-45-67', contactKeyboard());
}

async function handleClientFile(msg, fileMeta) {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id || chatId);
  let session = await getSession(userId);

  if (!session.lead) {
    session = {
      stage: 'ask_phone',
      lead: createLead(msg),
      updatedAt: new Date().toISOString()
    };
    session.lead.service = session.lead.service || {
      code: 'unknown',
      name: 'Не определено, клиент прислал файл',
      category: 'Не определено',
      managerOnly: true
    };
  }

  session.lead.files = session.lead.files || [];
  session.lead.files.push(fileMeta);
  await saveSession(userId, { ...session, stage: 'ask_phone', updatedAt: new Date().toISOString() });

  await sendMessage(
    chatId,
    'Файл получил и прикрепил к заявке.\n\nОставьте номер телефона для связи с менеджером.\n\nПример: +375 29 123-45-67',
    contactKeyboard()
  );
}

async function startManagerRequest(msg) {
  const userId = String(msg.from?.id || msg.chat.id);
  const lead = createLead(msg);
  lead.service = {
    code: 'manager_request',
    name: 'Запрос менеджера',
    category: 'Ручная консультация',
    managerOnly: true
  };
  lead.initialMessage = msg.text || msg.caption || '';
  lead.status = 'draft';

  const session = {
    stage: 'ask_phone',
    serviceCode: 'manager_request',
    lead,
    updatedAt: new Date().toISOString()
  };

  await saveSession(userId, session);
  await sendMessage(
    msg.chat.id,
    'Передаю вас менеджеру.\n\nОставьте, пожалуйста, номер телефона и коротко опишите задачу.\n\nПример: +375 29 123-45-67',
    contactKeyboard()
  );
}

async function handlePhoneAnswer(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const phone = extractPhone(msg);

  if (!phone) {
    await sendMessage(
      msg.chat.id,
      'Не смог распознать номер телефона. Напишите, пожалуйста, в формате:\n+375 29 123-45-67\n\nИли нажмите «Позвать менеджера».',
      contactKeyboard()
    );
    return;
  }

  session.lead.phone = phone;
  await saveSession(userId, { ...session, stage: 'ask_name', updatedAt: new Date().toISOString() });
  await sendMessage(msg.chat.id, 'Как к вам обращаться?', { remove_keyboard: true });
}

async function handleNameAnswer(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const name = (msg.text || msg.from?.first_name || 'Клиент').trim();
  session.lead.clientName = name;
  await finalizeLead(msg.chat.id, userId, session);
}

async function finalizeLead(chatId, userId, session) {
  const services = await readJson('services.json', []);
  const service = services.find((item) => item.code === session.serviceCode);

  if (service) {
    const calculation = await calculateLead(session.lead, service);
    if (calculation) {
      session.lead.priceEstimate = calculation.priceEstimate;
      session.lead.calculation = calculation;
    }
  }

  session.lead.status = 'new';
  session.lead.updatedAt = new Date().toISOString();
  session.lead.priceEstimate = session.lead.priceEstimate || 'Требуется расчёт менеджером';

  const savedLead = await saveLead(session.lead);
  await resetSession(userId);

  await sendMessage(
    chatId,
    [
      'Спасибо! Заявка принята.',
      '',
      'Менеджер проверит параметры, макет и подтвердит точную стоимость.',
      '',
      `Номер заявки: ${savedLead.id}`
    ].join('\n'),
    mainKeyboard()
  );

  await notifyManagers(savedLead);
}

async function notifyManagers(lead) {
  if (!MANAGER_CHAT_ID) {
    console.warn('MANAGER_CHAT_ID не указан. Заявка сохранена, но менеджерам не отправлена.', lead.id);
    return;
  }

  const managerText = formatLeadForManager(lead);
  await sendMessage(MANAGER_CHAT_ID, managerText);

  if (Array.isArray(lead.files)) {
    for (const file of lead.files) {
      try {
        await tg('copyMessage', {
          chat_id: MANAGER_CHAT_ID,
          from_chat_id: lead.chatId,
          message_id: file.messageId,
          caption: `Файл к заявке ${lead.id}`
        });
      } catch (error) {
        console.error('Cannot copy file to manager chat:', error.message);
      }
    }
  }
}

function formatLeadForManager(lead) {
  const lines = [];
  lines.push('🆕 Новая заявка из Telegram-бота');
  lines.push('');
  lines.push(`ID: ${lead.id}`);
  lines.push(`Создана: ${formatDate(lead.createdAt)}`);
  lines.push('');
  lines.push(`Клиент: ${lead.clientName || lead.user?.firstName || 'не указано'}`);
  lines.push(`Телефон: ${lead.phone || 'не указан'}`);
  lines.push(`Telegram: ${formatTelegramUser(lead.user)}`);
  lines.push('');
  lines.push(`Услуга: ${lead.service?.name || 'не определена'}`);
  lines.push(`Категория: ${lead.service?.category || 'не определена'}`);

  if (lead.initialMessage) {
    lines.push('');
    lines.push(`Первое сообщение: ${lead.initialMessage}`);
  }

  if (lead.answers?.length) {
    lines.push('');
    lines.push('Параметры:');
    for (const answer of lead.answers) {
      lines.push(`— ${answer.label}: ${answer.rawValue || answer.value}`);
    }
  }

  if (lead.comments?.length) {
    lines.push('');
    lines.push('Комментарии клиента:');
    for (const comment of lead.comments) {
      lines.push(`— ${comment.text}`);
    }
  }

  lines.push('');
  lines.push(`Стоимость: ${lead.priceEstimate || 'Требуется расчёт менеджером'}`);

  if (lead.calculation?.details) {
    lines.push(`Расчёт: ${lead.calculation.details}`);
  }

  lines.push('');
  lines.push(`Файлы: ${lead.files?.length ? `${lead.files.length} шт. Ниже будут отправлены копии файлов.` : lead.noFile ? 'файла нет' : 'не прикреплены'}`);
  lines.push('');
  lines.push('Ответ клиенту из группы:');
  lines.push(`/reply ${lead.id} текст сообщения`);

  return lines.join('\n');
}

async function calculateLead(lead, service) {
  if (!service?.calc || service.calc.type === 'manager') {
    return null;
  }

  const prices = await readJson('prices.json', { currency: 'BYN', prices: {} });
  const currency = prices.currency || 'BYN';

  if (service.calc.type === 'area_m2') {
    const priceRule = prices.prices?.[service.calc.priceKey];
    const pricePerM2 = Number(priceRule?.value || 0);
    const width = Number(lead.fields?.width_m || 0);
    const height = Number(lead.fields?.height_m || 0);

    if (!width || !height || !pricePerM2) {
      return null;
    }

    const area = roundMoney(width * height);
    const amount = roundMoney(area * pricePerM2);

    return {
      type: 'area_m2',
      priceEstimate: `${amount} ${currency}`,
      clientText: `Площадь: ${area} м².\nПредварительная стоимость: ${amount} ${currency}.\n\nТочная цена зависит от материала, обработки, срочности и макета.`,
      details: `${width} × ${height} м = ${area} м²; ${pricePerM2} ${currency}/м²; итого ${amount} ${currency}`
    };
  }

  return null;
}

function createLead(msg) {
  const from = msg.from || {};
  return {
    id: makeLeadId(),
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chatId: msg.chat.id,
    user: {
      id: from.id,
      username: from.username || '',
      firstName: from.first_name || '',
      lastName: from.last_name || ''
    },
    service: null,
    fields: {},
    answers: [],
    files: [],
    comments: []
  };
}

function makeLeadId() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${yyyy}${mm}${dd}-${random}`;
}

async function saveLead(lead) {
  const leads = await readJson('leads.json', []);
  const index = leads.findIndex((item) => item.id === lead.id);
  const normalized = { ...lead, updatedAt: new Date().toISOString() };

  if (index >= 0) {
    leads[index] = normalized;
  } else {
    leads.push(normalized);
  }

  await writeJson('leads.json', leads);
  return normalized;
}

async function getSession(userId) {
  const sessions = await readJson('sessions.json', {});
  return sessions[userId] || { stage: 'idle' };
}

async function saveSession(userId, session) {
  const sessions = await readJson('sessions.json', {});
  sessions[userId] = { ...session, updatedAt: new Date().toISOString() };
  await writeJson('sessions.json', sessions);
}

async function resetSession(userId) {
  const sessions = await readJson('sessions.json', {});
  delete sessions[userId];
  await writeJson('sessions.json', sessions);
}

async function readJson(fileName, fallback) {
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) return fallback;
    return JSON.parse(content);
  } catch (error) {
    await writeJson(fileName, fallback);
    return fallback;
  }
}

async function writeJson(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
}

function matchService(input, services) {
  const normalizedInput = normalizeText(input);
  const inputTokens = tokenize(normalizedInput);
  const results = [];

  for (const service of services) {
    const phrases = [service.name, service.category, ...(service.synonyms || [])]
      .filter(Boolean)
      .map(normalizeText);

    let score = 0;
    const hits = [];

    for (const phrase of phrases) {
      if (!phrase) continue;

      if (normalizedInput.includes(phrase)) {
        const phraseScore = phrase.includes(' ') ? 8 : 5;
        score += phraseScore;
        hits.push(phrase);
        continue;
      }

      const phraseTokens = tokenize(phrase);
      for (const phraseToken of phraseTokens) {
        if (phraseToken.length < 3) continue;

        if (inputTokens.includes(phraseToken)) {
          score += phraseToken.length >= 6 ? 2.5 : 1.8;
          hits.push(phraseToken);
          continue;
        }

        const bestDistance = Math.min(...inputTokens.map((token) => levenshtein(token, phraseToken)));
        if (phraseToken.length >= 5 && bestDistance <= 1) {
          score += 1.5;
          hits.push(`${phraseToken}~`);
        } else if (phraseToken.length >= 7 && bestDistance <= 2) {
          score += 0.8;
          hits.push(`${phraseToken}~~`);
        }
      }
    }

    if (score > 0) {
      results.push({ service, score, hits: [...new Set(hits)] });
    }
  }

  results.sort((a, b) => b.score - a.score);

  const best = results[0] || null;
  if (!best || best.score < 2) {
    return { best: null, ambiguous: [] };
  }

  const ambiguous = results.filter((item) => item.score >= Math.max(2, best.score * 0.7));
  if (ambiguous.length > 1 && (best.score - ambiguous[1].score) < 2) {
    return { best: null, ambiguous };
  }

  return { best, ambiguous: [] };
}

function prefillLeadFromText(lead, service, text) {
  const normalized = normalizeText(text);

  if (service.code === 'banner') {
    const dimensions = parseDimensions(normalized);
    if (dimensions) {
      setFieldAnswer(lead, 'width_m', 'Ширина', dimensions.width, `${dimensions.width} м`);
      setFieldAnswer(lead, 'height_m', 'Высота', dimensions.height, `${dimensions.height} м`);
    }
  }

  const quantity = parseQuantity(normalized);
  if (quantity) {
    setFieldAnswer(lead, 'quantity', 'Количество/тираж', quantity, `${quantity} шт.`);
  }
}

function buildPrefillSummary(lead) {
  const useful = (lead.answers || []).filter((item) => ['width_m', 'height_m', 'quantity'].includes(item.key));
  return useful.map((item) => `— ${item.label}: ${item.rawValue || item.value}`).join('\n');
}

function getNextQuestion(service, lead) {
  const questions = service.questions || [];
  return questions.find((question) => lead.fields?.[question.key] === undefined || lead.fields?.[question.key] === '');
}

function setAnswer(lead, question, rawValue) {
  let value = rawValue;

  if (question.key === 'width_m' || question.key === 'height_m') {
    const number = parseNumber(rawValue);
    if (number) value = number;
  }

  if (question.key === 'quantity') {
    const qty = parseQuantity(rawValue) || parseInt(String(rawValue).replace(/\D+/g, ''), 10);
    if (qty) value = qty;
  }

  setFieldAnswer(lead, question.key, question.label, value, rawValue);
}

function setFieldAnswer(lead, key, label, value, rawValue) {
  lead.fields = lead.fields || {};
  lead.answers = lead.answers || [];
  lead.fields[key] = value;

  const existingIndex = lead.answers.findIndex((item) => item.key === key);
  const item = { key, label, value, rawValue };

  if (existingIndex >= 0) {
    lead.answers[existingIndex] = item;
  } else {
    lead.answers.push(item);
  }
}

function extractFileMeta(msg) {
  if (msg.document) {
    return {
      type: 'document',
      messageId: msg.message_id,
      fileId: msg.document.file_id,
      fileUniqueId: msg.document.file_unique_id,
      fileName: msg.document.file_name || '',
      mimeType: msg.document.mime_type || '',
      fileSize: msg.document.file_size || 0,
      caption: msg.caption || ''
    };
  }

  if (msg.photo?.length) {
    const photo = msg.photo[msg.photo.length - 1];
    return {
      type: 'photo',
      messageId: msg.message_id,
      fileId: photo.file_id,
      fileUniqueId: photo.file_unique_id,
      fileSize: photo.file_size || 0,
      caption: msg.caption || ''
    };
  }

  if (msg.video) {
    return {
      type: 'video',
      messageId: msg.message_id,
      fileId: msg.video.file_id,
      fileUniqueId: msg.video.file_unique_id,
      fileName: msg.video.file_name || '',
      mimeType: msg.video.mime_type || '',
      fileSize: msg.video.file_size || 0,
      caption: msg.caption || ''
    };
  }

  return null;
}

function extractPhone(msg) {
  if (msg.contact?.phone_number) {
    return msg.contact.phone_number;
  }

  const text = msg.text || msg.caption || '';
  const match = text.match(/\+?[\d\s()\-]{7,}/);
  if (!match) return null;

  const digits = match[0].replace(/\D/g, '');
  if (digits.length < 7) return null;

  return match[0].trim();
}

function parseDimensions(text) {
  const normalized = text
    .replace(/,/g, '.')
    .replace(/[×хx]/gi, ' x ')
    .replace(/\s+на\s+/gi, ' x ')
    .replace(/\s+by\s+/gi, ' x ');

  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(?:м|m)?\s*x\s*(\d+(?:\.\d+)?)\s*(?:м|m)?/i);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;

  return { width, height };
}

function parseQuantity(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/(\d{1,7})\s*(шт|штук|ед|экз|тираж|визит|накле|флаер|листов|круж|руч)/i);
  if (match) return Number(match[1]);
  return null;
}

function parseNumber(text) {
  const match = String(text).replace(',', '.').match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

function isManagerRequest(text = '') {
  const normalized = normalizeText(text);
  const phrases = [
    'менеджер', 'оператор', 'живой человек', 'человек', 'позвоните', 'свяжитесь', 'свяжите', 'хочу с менеджером', 'хочу с человеком', 'не понял', 'перезвоните'
  ];
  return phrases.some((phrase) => normalized.includes(phrase));
}

function isNoFile(text = '') {
  const normalized = normalizeText(text);
  return ['файла нет', 'нет файла', 'макета нет', 'нет макета', 'без файла', 'продолжить'].some((phrase) => normalized.includes(phrase));
}

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/ў/g, 'у')
    .replace(/[^a-zа-я0-9+\s.×хx-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value = '') {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatTelegramUser(user = {}) {
  const parts = [];
  if (user.username) parts.push(`@${user.username}`);
  if (user.id) parts.push(`id:${user.id}`);
  if (!parts.length) return 'не указан';
  return parts.join(' / ');
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Minsk'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function mainKeyboard() {
  return {
    keyboard: [
      ['Баннер / широкоформат', 'Наклейки / этикетки'],
      ['Визитки / полиграфия', 'Листовки / флаеры'],
      ['Сувенирка', 'Наружная реклама'],
      ['Roll-up / стенд', '👨‍💼 Позвать менеджера']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function serviceKeyboard() {
  return {
    keyboard: [
      ['👨‍💼 Позвать менеджера'],
      ['🏠 Главное меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function fileKeyboard() {
  return {
    keyboard: [
      ['Файла нет'],
      ['👨‍💼 Позвать менеджера'],
      ['🏠 Главное меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function contactKeyboard() {
  return {
    keyboard: [
      [{ text: 'Отправить телефон', request_contact: true }],
      ['🏠 Главное меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

async function sendMessage(chatId, text, replyMarkup = undefined) {
  const payload = { chat_id: chatId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tg('sendMessage', payload);
}

async function tg(method, payload) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const description = data?.description || response.statusText || 'Unknown Telegram API error';
    throw new Error(`${method}: ${description}`);
  }

  return data.result;
}
