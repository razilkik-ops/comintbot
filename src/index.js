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
const SALES_MANAGER_NAME = process.env.SALES_MANAGER_NAME || 'Екатерина';
const FIRST_ORDER_DISCOUNT = Number(process.env.FIRST_ORDER_DISCOUNT || 5);
const WEBSITE_BASE_URL = 'https://comint.onrender.com';
const DEFAULT_PRICE_NOTE = 'Цену по этой услуге подскажет менеджер после уточнения тиража, размеров, материала, макета и сроков.';
const APPROVED_PRICE_NOTE = 'Цена указана по утвержденному прайсу. Итоговая стоимость зависит от тиража, макета и дополнительных работ.';

const CANCEL_TEXTS = ['отмена', 'отменить', 'отменить заявку', '❌ отменить заявку', '/cancel'];
const BACK_TEXTS = ['назад', '⬅️ назад', '← назад'];
const SERVICES_TEXTS = ['услуги', '📋 услуги', '📋 каталог', 'каталог', 'каталог услуг', '/services'];
const STATUS_TEXTS = ['статус', 'статус заявки', '🔎 статус заявки', '/status'];
const PRICE_TEXTS = ['цены', '💰 цены', 'стоимость', 'сколько стоит', 'прайс', 'прайс-лист', 'прайс лист', 'прайс-листы', 'прайс листы', '/price', '/prices'];

const POLYGRAPHY_PRODUCTS = {
  'визитки': { serviceCode: 'business_cards', label: 'Визитки' },
  'буклеты a4': { serviceCode: 'buklet_a4_standard', label: 'Буклеты A4' },
  'буклеты/листовки': { serviceCode: 'flyers', label: 'Буклеты/листовки' },
  'листовка a4 1 сторона': { serviceCode: 'listovka_a4_one_side', label: 'Листовка A4 односторонняя' },
  'листовка a4 2 стороны': { serviceCode: 'listovka_a4_two_side', label: 'Листовка A4 двусторонняя' },
  'листовки/флаеры': { serviceCode: 'flyers', label: 'Листовки/флаеры' },
  'наклейки/этикетки': { serviceCode: 'stickers', label: 'Наклейки/этикетки' },
  'бейджи a6': { serviceCode: 'bejdzh', label: 'Бейджи A6' },
  'бланки a4': { serviceCode: 'pechat_firmennyh_blankov', label: 'Бланки A4' },
  'папки a4': { serviceCode: 'papki', label: 'Папки A4' },
  'сертификаты a4': { serviceCode: 'sertifikaty_diplomy', label: 'Сертификаты A4' }
};

const SOUVENIR_TYPES = {
  'подарочные наборы': 'Подарочные наборы',
  'брендированный текстиль': 'Брендированный текстиль',
  'кружки и термокружки': 'Кружки и термокружки с логотипом',
  'ежедневники и органайзеры': 'Ежедневники и органайзеры'
};

const SOUVENIR_EVENTS = {
  'подарок сотруднику': 'Подарок сотруднику',
  'подарок для партнера': 'Подарок для партнера',
  'промо-раздача': 'Промо-раздача на мероприятии'
};

const CATEGORY_QUESTIONS = {
  'Полиграфия': [
    { key: 'product_details', label: 'Что изготовить', prompt: 'Что именно нужно изготовить? Укажите формат, если знаете.' },
    { key: 'quantity', label: 'Тираж', prompt: 'Укажите тираж.\n\nПример: 100, 500 или 1000 шт.' },
    { key: 'paper', label: 'Материал', prompt: 'Материал или бумага известны? Если нет — напишите «не знаю».' },
    { key: 'deadline', label: 'Срок', prompt: 'К какому сроку нужен заказ?' }
  ],
  'Сувенирная продукция': [
    { key: 'item', label: 'Предмет', prompt: 'На какой продукции нужно нанести логотип? Например: кружки, ручки, пакеты, флешки или другое.' },
    { key: 'quantity', label: 'Количество', prompt: 'Укажите количество.' },
    { key: 'print_details', label: 'Нанесение', prompt: 'Нанесение нужно с одной стороны или с двух? Сколько цветов в логотипе?' },
    { key: 'deadline', label: 'Срок', prompt: 'К какому сроку нужен заказ?' }
  ],
  'Наружная реклама': [
    { key: 'construction_type', label: 'Тип конструкции', prompt: 'Что нужно изготовить: вывеска, световой короб, табличка, штендер, витрина или другое?' },
    { key: 'size_text', label: 'Размер', prompt: 'Укажите примерный размер.' },
    { key: 'mounting', label: 'Монтаж', prompt: 'Нужен монтаж? Если да — укажите адрес или город установки.' },
    { key: 'deadline', label: 'Срок', prompt: 'К какому сроку нужен заказ?' }
  ],
  'Широкоформатная печать': [
    { key: 'size_text', label: 'Размер', prompt: 'Укажите размер изделия.\n\nПример: 2×3 м или A1.' },
    { key: 'quantity', label: 'Количество', prompt: 'Укажите количество.' },
    { key: 'material', label: 'Материал', prompt: 'Материал известен? Например: баннер, пленка, сетка, бумага. Если нет — напишите «не знаю».' },
    { key: 'deadline', label: 'Срок', prompt: 'К какому сроку нужен заказ?' }
  ],
  default: [
    { key: 'details', label: 'Задача', prompt: 'Опишите задачу: что нужно изготовить и для чего будет использоваться.' },
    { key: 'quantity', label: 'Количество', prompt: 'Укажите количество или тираж.' },
    { key: 'size_text', label: 'Размер', prompt: 'Укажите размер, если он известен. Если нет — напишите «не знаю».' },
    { key: 'deadline', label: 'Срок', prompt: 'К какому сроку нужен заказ?' }
  ]
};

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
    return;
  }

  if (text.startsWith('/lead')) {
    const [, leadId] = text.split(/\s+/);
    if (!leadId) {
      await sendMessage(msg.chat.id, 'Формат:\n/lead LEAD_ID');
      return;
    }

    const lead = await findLead(leadId);
    await sendMessage(msg.chat.id, lead ? formatLeadForManager(lead) : `Заявка ${leadId} не найдена.`);
    return;
  }

  if (text.startsWith('/done')) {
    const [, leadId, ...messageParts] = text.split(/\s+/);
    const clientText = messageParts.join(' ').trim();

    if (!leadId) {
      await sendMessage(msg.chat.id, 'Формат:\n/done LEAD_ID\nили\n/done LEAD_ID текст для клиента');
      return;
    }

    const lead = await findLead(leadId);
    if (!lead) {
      await sendMessage(msg.chat.id, `Заявка ${leadId} не найдена.`);
      return;
    }

    lead.status = 'done';
    await saveLead(lead);

    if (clientText) {
      await sendMessage(lead.chatId, `Менеджер ${COMPANY_NAME}:\n\n${clientText}`);
    }

    await sendMessage(msg.chat.id, `Заявка ${leadId} отмечена как выполненная.`);
    return;
  }

  if (text.startsWith('/status')) {
    const [, leadId, ...statusParts] = text.split(/\s+/);
    const status = statusParts.join(' ').trim();

    if (!leadId || !status) {
      await sendMessage(msg.chat.id, 'Формат:\n/status LEAD_ID новый статус');
      return;
    }

    const lead = await findLead(leadId);
    if (!lead) {
      await sendMessage(msg.chat.id, `Заявка ${leadId} не найдена.`);
      return;
    }

    lead.status = status;
    lead.managerStatusUpdatedAt = new Date().toISOString();
    await saveLead(lead);
    await sendMessage(msg.chat.id, `Статус заявки ${leadId} обновлён: ${status}`);
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

  if (isCancelRequest(text)) {
    await resetSession(userId);
    await sendMessage(
      chatId,
      [
        'Хорошо, текущую заявку отменил.',
        '',
        'Когда будете готовы, напишите задачу обычными словами или выберите услугу в меню.'
      ].join('\n'),
      mainKeyboard()
    );
    return;
  }

  if (text === '/help') {
    await sendHelp(chatId);
    return;
  }

  const session = await getSession(userId);

  if (isBackRequest(text)) {
    await handleBack(msg, session);
    return;
  }

  if (session.stage === 'catalog_categories') {
    await handleCatalogCategory(msg, session);
    return;
  }

  if (session.stage === 'catalog_services') {
    await handleCatalogService(msg, session);
    return;
  }

  if (session.stage === 'price_categories') {
    await handlePriceCategory(msg, session);
    return;
  }

  if (session.stage === 'price_services') {
    await handlePriceService(msg, session);
    return;
  }

  if (isServicesRequest(text)) {
    await sendServices(msg);
    return;
  }

  if (isPriceRequest(text)) {
    await sendPrices(msg);
    return;
  }

  if (isStatusRequest(text)) {
    await sendClientStatus(chatId);
    return;
  }

  if (text === '/manager' || isManagerRequest(text)) {
    await startManagerRequest(msg);
    return;
  }

  if (isPolygraphyEntry(text)) {
    await startPolygraphyFunnel(msg);
    return;
  }

  if (isSouvenirEntry(text)) {
    await startSouvenirFunnel(msg);
    return;
  }

  if (isComplexProjectEntry(text)) {
    await startComplexProjectRequest(msg);
    return;
  }

  const fileMeta = extractFileMeta(msg);
  if (fileMeta) {
    await handleClientFile(msg, fileMeta);
    return;
  }

  if (session.stage === 'polygraphy_product') {
    await handlePolygraphyProduct(msg, session);
    return;
  }

  if (session.stage === 'polygraphy_custom') {
    await handlePolygraphyCustom(msg, session);
    return;
  }

  if (session.stage === 'polygraphy_quantity') {
    await handlePolygraphyQuantity(msg, session);
    return;
  }

  if (session.stage === 'polygraphy_urgency') {
    await handlePolygraphyUrgency(msg, session);
    return;
  }

  if (session.stage === 'souvenir_type') {
    await handleSouvenirType(msg, session);
    return;
  }

  if (session.stage === 'souvenir_event') {
    await handleSouvenirEvent(msg, session);
    return;
  }

  if (session.stage === 'complex_project_details') {
    await handleComplexProjectDetails(msg, session);
    return;
  }

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
      await sendMessage(chatId, ['Хорошо, зафиксировал: файла пока нет.', '', phoneRequestText()].join('\n'), contactKeyboard());
      return;
    }

    // Если человек написал комментарий вместо файла — сохраняем и продолжаем.
    if (text) {
      session.lead.comments = session.lead.comments || [];
      session.lead.comments.push({ at: new Date().toISOString(), text });
      await saveSession(userId, { ...session, stage: 'ask_phone' });
      await sendMessage(chatId, ['Комментарий записал.', '', phoneRequestText()].join('\n'), contactKeyboard());
      return;
    }
  }

  if (session.stage === 'ask_questions') {
    await handleQuestionAnswer(msg, session);
    return;
  }

  if (extractPhone(msg)) {
    await handleOrphanPhoneAnswer(msg);
    return;
  }

  await routeFreeText(msg);
}

async function sendWelcome(chatId) {
  const text = [
    `Здравствуйте! Вы в типографии «${COMPANY_NAME}».`,
    'Чем можем быть полезны?',
    '',
    'Выберите направление, и я задам несколько коротких вопросов. Так менеджер сразу получит уже подготовленную заявку.'
  ].join('\n');

  await sendMessage(chatId, text, mainKeyboard());
}

async function sendHelp(chatId) {
  await sendMessage(
    chatId,
    [
      'Как я могу помочь:',
      '',
      '— подобрать сценарий под вашу услугу;',
      '— собрать размеры, тираж, сроки и другие параметры;',
      '— принять макет, фото примера или техзадание;',
      '— передать заявку менеджеру;',
      '— показать статус последней заявки.',
      '',
      'Команды:',
      '/services — список услуг',
      '/prices — как рассчитывается стоимость',
      '/status — статус последней заявки',
      '/manager — позвать менеджера',
      '/cancel — отменить текущую заявку',
      '',
      'Быстрый старт:',
      '— Полиграфия',
      '— Сувениры',
      '— Сложный проект'
    ].join('\n'),
    mainKeyboard()
  );
}

async function sendServices(msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id || chatId);
  const services = await loadServices();
  const groups = groupServicesByCategory(services);

  await saveSession(userId, {
    stage: 'catalog_categories',
    updatedAt: new Date().toISOString()
  });

  await sendMessage(
    chatId,
    `Выберите раздел каталога ${COMPANY_NAME}:`,
    catalogCategoryKeyboard(groups)
  );
}

async function handleCatalogCategory(msg, session) {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id || chatId);
  const text = (msg.text || msg.caption || '').trim();
  const services = await loadServices();
  const groups = groupServicesByCategory(services);
  const group = groups.find(([category]) => normalizeText(category) === normalizeText(text));

  if (!group) {
    await sendMessage(chatId, 'Выберите раздел кнопкой ниже.', catalogCategoryKeyboard(groups));
    return;
  }

  const [category, items] = group;
  await saveSession(userId, {
    ...session,
    stage: 'catalog_services',
    catalogCategory: category,
    updatedAt: new Date().toISOString()
  });

  await sendMessage(
    chatId,
    `Раздел: ${category}. Выберите услугу:`,
    catalogServiceKeyboard(items)
  );
}

async function handleCatalogService(msg, session) {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();
  const services = await loadServices();
  const group = groupServicesByCategory(services).find(([category]) => category === session.catalogCategory);
  const items = group?.[1] || [];
  const service = items.find((item) => normalizeText(item.name) === normalizeText(text));

  if (!service) {
    await sendMessage(chatId, 'Выберите услугу кнопкой ниже или нажмите «Назад».', catalogServiceKeyboard(items));
    return;
  }

  await startServiceFlow(msg, service, service.name, {
    menuContext: {
      type: 'catalog_services',
      category: session.catalogCategory
    }
  });
}

async function handleBack(msg, session) {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id || chatId);

  if (!session || session.stage === 'idle') {
    await resetSession(userId);
    await sendWelcome(chatId);
    return;
  }

  if (session.stage === 'catalog_categories') {
    await resetSession(userId);
    await sendWelcome(chatId);
    return;
  }

  if (session.stage === 'price_categories') {
    await resetSession(userId);
    await sendWelcome(chatId);
    return;
  }

  if (session.stage === 'catalog_services') {
    const services = await loadServices();
    const groups = groupServicesByCategory(services);
    await saveSession(userId, {
      stage: 'catalog_categories',
      updatedAt: new Date().toISOString()
    });
    await sendMessage(chatId, `Выберите раздел каталога ${COMPANY_NAME}:`, catalogCategoryKeyboard(groups));
    return;
  }

  if (session.stage === 'price_services') {
    const services = await loadServices();
    const groups = groupServicesByCategory(services);
    await saveSession(userId, {
      stage: 'price_categories',
      updatedAt: new Date().toISOString()
    });
    await sendMessage(chatId, 'Выберите раздел, чтобы посмотреть цены:', catalogCategoryKeyboard(groups));
    return;
  }

  if (session.stage === 'polygraphy_product' || session.stage === 'souvenir_type' || session.stage === 'complex_project_details') {
    await resetSession(userId);
    await sendWelcome(chatId);
    return;
  }

  if (session.stage === 'polygraphy_custom') {
    await saveSession(userId, { ...session, stage: 'polygraphy_product', updatedAt: new Date().toISOString() });
    await sendMessage(chatId, 'Выберите тип полиграфии:', polygraphyProductKeyboard());
    return;
  }

  if (session.stage === 'polygraphy_quantity') {
    removeFieldAnswer(session.lead, 'product_type');
    session.lead.service = {
      code: 'polygraphy',
      name: 'Полиграфия',
      category: 'Полиграфия',
      managerOnly: false,
      sourceUrl: `${WEBSITE_BASE_URL}/services#category-print`,
      priceNote: DEFAULT_PRICE_NOTE
    };
    await saveSession(userId, { ...session, stage: 'polygraphy_product', serviceCode: 'polygraphy', updatedAt: new Date().toISOString() });
    await sendMessage(chatId, 'Выберите тип полиграфии:', polygraphyProductKeyboard());
    return;
  }

  if (session.stage === 'polygraphy_urgency') {
    removeFieldAnswer(session.lead, 'quantity_range');
    await saveSession(userId, { ...session, stage: 'polygraphy_quantity', updatedAt: new Date().toISOString() });
    await sendMessage(chatId, 'Какой тираж планируете?', quantityRangeKeyboard());
    return;
  }

  if (session.stage === 'souvenir_event') {
    removeFieldAnswer(session.lead, 'souvenir_type');
    await saveSession(userId, { ...session, stage: 'souvenir_type', updatedAt: new Date().toISOString() });
    await sendMessage(chatId, 'Выберите тип сувенира, который вас интересует:', souvenirTypeKeyboard());
    return;
  }

  if (session.stage === 'ask_questions') {
    await backFromQuestionFlow(chatId, userId, session);
    return;
  }

  if (session.stage === 'ask_file') {
    await backFromFileStep(chatId, userId, session);
    return;
  }

  if (session.stage === 'ask_phone') {
    if (session.serviceCode === 'manager_request') {
      await resetSession(userId);
      await sendWelcome(chatId);
      return;
    }

    if (session.serviceCode === 'complex_project') {
      await saveSession(userId, { ...session, stage: 'complex_project_details', updatedAt: new Date().toISOString() });
      await sendMessage(
        chatId,
        'Опишите задачу: что нужно сделать, тираж/размер, сроки и есть ли макет.',
        serviceKeyboard()
      );
      return;
    }

    await saveSession(userId, { ...session, stage: 'ask_file', updatedAt: new Date().toISOString() });
    await sendMessage(chatId, 'Можно прикрепить макет, логотип, фото примера или техническое задание.', fileKeyboard());
    return;
  }

  if (session.stage === 'ask_name') {
    delete session.lead.phone;
    await saveSession(userId, { ...session, stage: 'ask_phone', updatedAt: new Date().toISOString() });
    await sendMessage(chatId, phoneRequestText(), contactKeyboard());
    return;
  }

  await resetSession(userId);
  await sendWelcome(chatId);
}

async function backFromQuestionFlow(chatId, userId, session) {
  const service = await loadSessionService(session);
  if (!service) {
    await backToSavedMenu(chatId, userId, session);
    return;
  }

  const questions = getServiceQuestions(service);
  const currentQuestion = getNextQuestion(service, session.lead);
  const currentIndex = currentQuestion ? questions.findIndex((item) => item.key === currentQuestion.key) : questions.length;

  if (currentIndex <= 0) {
    await backToSavedMenu(chatId, userId, session);
    return;
  }

  const previousQuestion = questions[currentIndex - 1];
  removeFieldAnswer(session.lead, previousQuestion.key);
  await saveSession(userId, { ...session, stage: 'ask_questions', updatedAt: new Date().toISOString() });
  await sendMessage(chatId, formatQuestionPrompt(service, session.lead, previousQuestion), serviceKeyboard());
}

async function backFromFileStep(chatId, userId, session) {
  if (session.stage === 'ask_file' && session.lead?.sourceFunnel === 'polygraphy') {
    removeFieldAnswer(session.lead, 'urgency');
    await saveSession(userId, { ...session, stage: 'polygraphy_urgency', updatedAt: new Date().toISOString() });
    await sendMessage(chatId, 'По срокам как удобнее?', urgencyKeyboard());
    return;
  }

  if (session.stage === 'ask_file' && session.lead?.sourceFunnel === 'souvenir') {
    removeFieldAnswer(session.lead, 'souvenir_event');
    await saveSession(userId, { ...session, stage: 'souvenir_event', updatedAt: new Date().toISOString() });
    await sendMessage(chatId, 'Для какого события вам нужны сувениры?', souvenirEventKeyboard());
    return;
  }

  const service = await loadSessionService(session);
  if (!service) {
    await backToSavedMenu(chatId, userId, session);
    return;
  }

  const questions = getServiceQuestions(service);
  const previousQuestion = [...questions].reverse().find((question) => session.lead?.fields?.[question.key] !== undefined);
  if (!previousQuestion) {
    await backToSavedMenu(chatId, userId, session);
    return;
  }

  removeFieldAnswer(session.lead, previousQuestion.key);
  await saveSession(userId, { ...session, stage: 'ask_questions', updatedAt: new Date().toISOString() });
  await sendMessage(chatId, formatQuestionPrompt(service, session.lead, previousQuestion), serviceKeyboard());
}

async function backToSavedMenu(chatId, userId, session) {
  if (session.menuContext?.type === 'catalog_services') {
    const services = await loadServices();
    const group = groupServicesByCategory(services).find(([category]) => category === session.menuContext.category);
    const items = group?.[1] || [];
    await saveSession(userId, {
      stage: 'catalog_services',
      catalogCategory: session.menuContext.category,
      updatedAt: new Date().toISOString()
    });
    await sendMessage(chatId, `Раздел: ${session.menuContext.category}. Выберите услугу:`, catalogServiceKeyboard(items));
    return;
  }

  await resetSession(userId);
  await sendWelcome(chatId);
}

async function sendPrices(msg) {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id || chatId);
  const services = await loadServices();
  const groups = groupServicesByCategory(services);

  await saveSession(userId, {
    stage: 'price_categories',
    updatedAt: new Date().toISOString()
  });

  await sendMessage(
    chatId,
    [
      'Выберите раздел, чтобы посмотреть цены.',
      '',
      'Если по услуге нет утвержденной цены, стоимость подскажет менеджер.'
    ].join('\n'),
    catalogCategoryKeyboard(groups)
  );
}

async function handlePriceCategory(msg, session) {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id || chatId);
  const text = (msg.text || msg.caption || '').trim();
  const services = await loadServices();
  const groups = groupServicesByCategory(services);
  const group = groups.find(([category]) => normalizeText(category) === normalizeText(text));

  if (!group) {
    await sendMessage(chatId, 'Выберите раздел кнопкой ниже.', catalogCategoryKeyboard(groups));
    return;
  }

  const [category, items] = group;
  await saveSession(userId, {
    ...session,
    stage: 'price_services',
    priceCategory: category,
    updatedAt: new Date().toISOString()
  });

  await sendMessage(
    chatId,
    `Раздел: ${category}. Выберите услугу, чтобы посмотреть цену:`,
    catalogServiceKeyboard(items)
  );
}

async function handlePriceService(msg, session) {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();
  const services = await loadServices();
  const group = groupServicesByCategory(services).find(([category]) => category === session.priceCategory);
  const items = group?.[1] || [];
  const service = items.find((item) => normalizeText(item.name) === normalizeText(text));

  if (!service) {
    await sendMessage(chatId, 'Выберите услугу кнопкой ниже или нажмите «Назад».', catalogServiceKeyboard(items));
    return;
  }

  await sendMessage(
    chatId,
    formatServicePriceText(service),
    catalogServiceKeyboard(items)
  );
}

async function startPolygraphyFunnel(msg) {
  const userId = String(msg.from?.id || msg.chat.id);
  const lead = createLead(msg);
  lead.service = {
    code: 'polygraphy',
    name: 'Полиграфия',
    category: 'Полиграфия',
    managerOnly: false,
    sourceUrl: `${WEBSITE_BASE_URL}/services#category-print`,
    priceNote: DEFAULT_PRICE_NOTE
  };
  lead.initialMessage = msg.text || msg.caption || 'Хочу заказать полиграфию';
  lead.sourceFunnel = 'polygraphy';

  await saveSession(userId, {
    stage: 'polygraphy_product',
    serviceCode: 'polygraphy',
    lead,
    updatedAt: new Date().toISOString()
  });

  await sendMessage(
    msg.chat.id,
    [
      'Отлично! Расскажите, что именно вам нужно напечатать?',
      '',
      'Если нужного варианта нет, выберите «Другое» и напишите задачу вручную.'
    ].join('\n'),
    polygraphyProductKeyboard()
  );
}

async function handlePolygraphyProduct(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const text = (msg.text || msg.caption || '').trim();
  const normalized = normalizeText(text);

  if (normalized.includes('другое')) {
    session.lead.service = {
      code: 'custom_polygraphy',
      name: 'Полиграфия: другой запрос',
      category: 'Полиграфия',
      managerOnly: true
    };
    setFieldAnswer(session.lead, 'product_type', 'Тип продукции', 'Другое', text);
    await saveSession(userId, { ...session, stage: 'polygraphy_custom', serviceCode: 'custom_polygraphy' });
    await sendMessage(
      msg.chat.id,
      [
        'Опишите, пожалуйста, что нужно изготовить.',
        '',
        'Можно коротко: формат, тираж, материал, срок и что уже есть по макету.'
      ].join('\n'),
      serviceKeyboard()
    );
    return;
  }

  const product = findOption(normalized, POLYGRAPHY_PRODUCTS);
  if (!product) {
    await sendMessage(msg.chat.id, 'Выберите вариант кнопкой ниже или нажмите «Другое».', polygraphyProductKeyboard());
    return;
  }

  const services = await loadServices();
  const service = services.find((item) => item.code === product.serviceCode);

  if (service) {
    await startServiceFlow(msg, service, text);
    return;
  }

  session.lead.service = {
    code: service?.code || product.serviceCode,
    name: service?.name || product.label,
    category: service?.category || 'Полиграфия',
    managerOnly: Boolean(service?.managerOnly),
    sourceUrl: service?.sourceUrl || '',
    priceNote: service?.priceNote || DEFAULT_PRICE_NOTE
  };
  session.serviceCode = service?.code || product.serviceCode;
  setFieldAnswer(session.lead, 'product_type', 'Тип продукции', product.label, text);

  await saveSession(userId, { ...session, stage: 'polygraphy_quantity', updatedAt: new Date().toISOString() });
  await sendMessage(msg.chat.id, 'Какой тираж планируете?', quantityRangeKeyboard());
}

async function handlePolygraphyCustom(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const text = (msg.text || msg.caption || '').trim();

  session.lead.comments = session.lead.comments || [];
  session.lead.comments.push({ at: new Date().toISOString(), text: text || 'Клиент выбрал другой запрос по полиграфии' });
  session.lead.managerReason = 'Нестандартный запрос по полиграфии';

  await saveSession(userId, { ...session, stage: 'ask_phone', updatedAt: new Date().toISOString() });
  await sendMessage(msg.chat.id, managerHandoffText(), contactKeyboard());
}

async function handlePolygraphyQuantity(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const text = (msg.text || msg.caption || '').trim();

  setFieldAnswer(session.lead, 'quantity_range', 'Тираж', normalizeQuantityRange(text), text);
  await saveSession(userId, { ...session, stage: 'polygraphy_urgency', updatedAt: new Date().toISOString() });
  await sendMessage(msg.chat.id, 'По срокам как удобнее?', urgencyKeyboard());
}

async function handlePolygraphyUrgency(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const text = (msg.text || msg.caption || '').trim();

  setFieldAnswer(session.lead, 'urgency', 'Срочность', normalizeUrgency(text), text);

  const services = await loadServices();
  const service = services.find((item) => item.code === session.serviceCode) || session.lead.service;
  const calculation = await calculateLead(session.lead, service);

  if (calculation) {
    session.lead.priceEstimate = calculation.priceEstimate;
    session.lead.calculation = calculation;
  }

  await saveSession(userId, { ...session, stage: 'ask_file', updatedAt: new Date().toISOString() });
  await sendMessage(
    msg.chat.id,
    [
      calculation?.clientText || 'По этому заказу лучше сделать индивидуальный просчёт: цена зависит от макета, материала и точных параметров.',
      !calculation ? formatPriceNote(service) : '',
      '',
      'Можно прикрепить макет, фото примера или техзадание. Если файла пока нет — нажмите «Файла нет».'
    ].filter(Boolean).join('\n'),
    fileKeyboard()
  );
}

async function startSouvenirFunnel(msg) {
  const userId = String(msg.from?.id || msg.chat.id);
  const lead = createLead(msg);
  lead.service = {
    code: 'souvenir',
    name: 'Сувенирная продукция с логотипом',
    category: 'Сувенирная продукция',
    managerOnly: true,
    sourceUrl: `${WEBSITE_BASE_URL}/services#category-souvenirs`,
    priceNote: DEFAULT_PRICE_NOTE
  };
  lead.initialMessage = msg.text || msg.caption || 'Нужны сувениры с логотипом';
  lead.sourceFunnel = 'souvenir';
  lead.discountOffer = FIRST_ORDER_DISCOUNT ? `${FIRST_ORDER_DISCOUNT}% на первый заказ` : '';

  await saveSession(userId, {
    stage: 'souvenir_type',
    serviceCode: 'souvenir',
    lead,
    updatedAt: new Date().toISOString()
  });

  await sendMessage(msg.chat.id, 'Выберите тип сувенира, который вас интересует:', souvenirTypeKeyboard());
}

async function handleSouvenirType(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const text = (msg.text || msg.caption || '').trim();
  const type = findOption(normalizeText(text), SOUVENIR_TYPES) || text;

  setFieldAnswer(session.lead, 'souvenir_type', 'Тип сувенира', type, text);
  await saveSession(userId, { ...session, stage: 'souvenir_event', updatedAt: new Date().toISOString() });
  await sendMessage(msg.chat.id, 'Для какого события вам нужны сувениры?', souvenirEventKeyboard());
}

async function handleSouvenirEvent(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const text = (msg.text || msg.caption || '').trim();
  const event = findOption(normalizeText(text), SOUVENIR_EVENTS) || text;

  setFieldAnswer(session.lead, 'souvenir_event', 'Событие', event, text);
  session.lead.managerReason = 'Сувенирная продукция требует индивидуального подбора';

  await saveSession(userId, { ...session, stage: 'ask_file', updatedAt: new Date().toISOString() });
  await sendMessage(
    msg.chat.id,
    [
      `Отлично, подготовим индивидуальный просчёт. Если оставите заявку прямо сейчас, добавим скидку ${FIRST_ORDER_DISCOUNT}% на первый заказ.`,
      '',
      formatPriceNote(session.lead.service),
      '',
      'Можно прикрепить логотип, брендбук, фото примера или список желаемых товаров.',
      '',
      'Если файла нет — нажмите «Файла нет».'
    ].join('\n'),
    fileKeyboard()
  );
}

async function startComplexProjectRequest(msg) {
  const userId = String(msg.from?.id || msg.chat.id);
  const lead = createLead(msg);
  lead.service = {
    code: 'complex_project',
    name: 'Сложный проект',
    category: 'Индивидуальный запрос',
    managerOnly: true
  };
  lead.initialMessage = msg.text || msg.caption || 'Сложный проект, хочу обсудить с менеджером';
  lead.managerReason = 'Клиент выбрал сложный проект';

  await saveSession(userId, {
    stage: 'complex_project_details',
    serviceCode: 'complex_project',
    lead,
    updatedAt: new Date().toISOString()
  });

  await sendMessage(
    msg.chat.id,
    [
      'Поняла, здесь лучше не гадать и сразу подключить специалиста.',
      '',
      'Опишите задачу в двух-трёх словах: что нужно сделать, тираж/размер, сроки и есть ли макет.'
    ].join('\n'),
    serviceKeyboard()
  );
}

async function handleComplexProjectDetails(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const text = (msg.text || msg.caption || '').trim();

  if (text) {
    session.lead.comments = session.lead.comments || [];
    session.lead.comments.push({ at: new Date().toISOString(), text });
  }

  await saveSession(userId, { ...session, stage: 'ask_phone', updatedAt: new Date().toISOString() });
  await sendMessage(msg.chat.id, managerHandoffText(), contactKeyboard());
}

async function sendClientStatus(chatId) {
  const leads = await readJson('leads.json', []);
  const clientLeads = leads
    .filter((lead) => String(lead.chatId) === String(chatId))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const lead = clientLeads[0];
  if (!lead) {
    await sendMessage(
      chatId,
      [
        'Пока не вижу сохранённых заявок в этом чате.',
        '',
        'Напишите, что нужно заказать, и я помогу всё оформить.'
      ].join('\n'),
      mainKeyboard()
    );
    return;
  }

  await sendMessage(
    chatId,
    [
      `Последняя заявка: ${lead.id}`,
      `Услуга: ${lead.service?.name || 'не определена'}`,
      `Статус: ${formatLeadStatus(lead.status)}`,
      `Создана: ${formatDate(lead.createdAt)}`,
      '',
      'Если нужно что-то уточнить, напишите «менеджер».'
    ].join('\n'),
    mainKeyboard()
  );
}

async function routeFreeText(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();

  if (!text) {
    await sendMessage(chatId, 'Напишите, что хотите заказать, или выберите услугу в меню. Можно коротко: «баннер 2 на 3» или «наклейки 100 штук».', mainKeyboard());
    return;
  }

  const services = await loadServices();
  const match = matchService(text, services);

  if (!match.best) {
    await sendMessage(
      chatId,
      [
        'Пока не уверен, какую услугу выбрать.',
        '',
        'Напишите чуть подробнее: что нужно изготовить, примерный размер, тираж и срок.',
        '',
        'Например: «баннер 2 на 3 к пятнице» или «круглые наклейки 100 штук». Если проще живым голосом — нажмите «Позвать менеджера».'
      ].join('\n'),
      mainKeyboard()
    );
    return;
  }

  if (match.ambiguous.length > 1) {
    const rows = match.ambiguous.slice(0, 4).map((item) => [item.service.name]);
    rows.push(['👨‍💼 Позвать менеджера'], ['🏠 Главное меню']);

    await sendMessage(
      chatId,
      [
        'Нашёл несколько похожих вариантов. Выберите, что ближе к вашей задаче:',
        '',
        ...match.ambiguous.slice(0, 4).map((item, index) => `${index + 1}. ${item.service.name}`)
      ].join('\n'),
      { keyboard: rows, resize_keyboard: true }
    );
    return;
  }

  await startServiceFlow(msg, match.best.service, text);
}

async function startServiceFlow(msg, service, initialText = '', options = {}) {
  const userId = String(msg.from?.id || msg.chat.id);
  const lead = createLead(msg);

  lead.service = {
    code: service.code,
    name: service.name,
    category: service.category,
    managerOnly: Boolean(service.managerOnly),
    sourceUrl: service.sourceUrl || '',
    priceNote: service.priceNote || DEFAULT_PRICE_NOTE
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
    menuContext: options.menuContext || null,
    updatedAt: new Date().toISOString()
  };

  await saveSession(userId, session);

  if (nextQuestion) {
    const already = buildPrefillSummary(lead);
    await sendMessage(
      msg.chat.id,
      [
        service.intro || `Понял, оформляем: ${service.name}.`,
        formatPriceNote(service),
        already ? `\nУже записал из сообщения:\n${already}` : '',
        '',
        formatQuestionPrompt(service, lead, nextQuestion)
      ].filter(Boolean).join('\n'),
      serviceKeyboard()
    );
  } else {
    await askForFileOrPhone(msg.chat.id, userId, session, service);
  }
}

async function handleQuestionAnswer(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const services = await loadServices();
  const service = services.find((item) => item.code === session.serviceCode);

  if (!service) {
    await resetSession(userId);
    await sendMessage(msg.chat.id, 'Не нашёл сценарий этой услуги. Давайте начнём заново или сразу подключим менеджера.', mainKeyboard());
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
    await sendMessage(msg.chat.id, formatQuestionPrompt(service, session.lead, nextQuestion), serviceKeyboard());
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
        !calculation ? formatPriceNote(service) : '',
        'Теперь можно прикрепить макет, логотип, фото примера или техническое задание.',
        '',
        'Подходящие форматы: jpg, png, jpeg, tiff, tif, pdf, cdr, psd.',
        '',
        'Если файла пока нет — нажмите «Файла нет», заявку всё равно передадим менеджеру.'
      ].filter(Boolean).join('\n'),
      fileKeyboard()
    );
    return;
  }

  await saveSession(userId, { ...session, stage: 'ask_phone', updatedAt: new Date().toISOString() });
  await sendMessage(chatId, phoneRequestText(), contactKeyboard());
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
    ['Файл получил и прикрепил к заявке.', '', phoneRequestText()].join('\n'),
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
  await sendMessage(msg.chat.id, managerHandoffText(), contactKeyboard());
}

async function handlePhoneAnswer(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const phone = extractPhone(msg);

  if (!phone) {
    await sendMessage(
      msg.chat.id,
      'Не смог уверенно распознать номер телефона. Напишите, пожалуйста, в формате:\n+375 29 123-45-67\n\nИли нажмите «Отправить телефон».',
      contactKeyboard()
    );
    return;
  }

  session.lead.phone = phone;
  const phoneComment = extractCommentAfterPhone(msg, phone);
  if (phoneComment) {
    session.lead.comments = session.lead.comments || [];
    session.lead.comments.push({ at: new Date().toISOString(), text: phoneComment });
  }
  await saveSession(userId, { ...session, stage: 'ask_name', updatedAt: new Date().toISOString() });
  await sendMessage(msg.chat.id, 'Спасибо. Как к вам обращаться?', nameKeyboard(msg.from));
}

async function handleOrphanPhoneAnswer(msg) {
  const userId = String(msg.from?.id || msg.chat.id);
  const phone = extractPhone(msg);
  const lead = createLead(msg);

  lead.service = {
    code: 'manager_request',
    name: 'Запрос менеджера',
    category: 'Ручная консультация',
    managerOnly: true
  };
  lead.initialMessage = msg.text || msg.caption || '';
  lead.phone = phone;
  lead.managerReason = 'Клиент отправил телефон без активной сессии';

  const phoneComment = extractCommentAfterPhone(msg, phone);
  if (phoneComment) {
    lead.comments = lead.comments || [];
    lead.comments.push({ at: new Date().toISOString(), text: phoneComment });
  }

  await saveSession(userId, {
    stage: 'ask_name',
    serviceCode: 'manager_request',
    lead,
    updatedAt: new Date().toISOString()
  });

  await sendMessage(
    msg.chat.id,
    [
      'Спасибо, номер получил.',
      '',
      'Похоже, предыдущий шаг не сохранился, поэтому я оформлю заявку через менеджера, чтобы не потерять обращение.',
      '',
      'Как к вам обращаться?'
    ].join('\n'),
    nameKeyboard(msg.from)
  );
}

async function handleNameAnswer(msg, session) {
  const userId = String(msg.from?.id || msg.chat.id);
  const name = (msg.text || msg.from?.first_name || 'Клиент').trim();
  session.lead.clientName = name;
  await finalizeLead(msg.chat.id, userId, session);
}

async function finalizeLead(chatId, userId, session) {
  const services = await loadServices();
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
      'Спасибо, заявку принял.',
      '',
      'Менеджер проверит параметры, макет и предварительную стоимость. Если нужно будет что-то уточнить, напишем вам здесь.',
      '',
      `Номер заявки: ${savedLead.id}`,
      '',
      'Чтобы посмотреть статус позже, нажмите «Статус заявки».'
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
  lines.push(`Новая заявка ${lead.id}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('Заявка');
  lines.push(`Статус: ${formatLeadStatus(lead.status)}`);
  lines.push(`Создана: ${formatDate(lead.createdAt)}`);
  lines.push(`ID: ${lead.id}`);
  lines.push('');

  lines.push('Клиент');
  lines.push(`Клиент: ${lead.clientName || lead.user?.firstName || 'не указано'}`);
  lines.push(`Телефон: ${lead.phone || 'не указан'}`);
  lines.push(`Telegram: ${formatTelegramUser(lead.user)}`);
  lines.push('');

  lines.push('Услуга');
  lines.push(`Услуга: ${lead.service?.name || 'не определена'}`);
  lines.push(`Категория: ${lead.service?.category || 'не определена'}`);
  if (lead.service?.sourceUrl) {
    lines.push(`Страница: ${lead.service.sourceUrl}`);
  }
  if (lead.service?.priceNote) {
    lines.push(`Примечание по цене: ${lead.service.priceNote}`);
  }
  if (lead.sourceFunnel) {
    lines.push(`Воронка: ${lead.sourceFunnel}`);
  }
  if (lead.managerReason) {
    lines.push(`Причина передачи: ${lead.managerReason}`);
  }
  if (lead.discountOffer) {
    lines.push(`Бонус: ${lead.discountOffer}`);
  }
  if (lead.initialMessage) {
    lines.push(`Первое сообщение: ${lead.initialMessage}`);
  }
  lines.push('');

  lines.push('Параметры');
  if (lead.answers?.length) {
    for (const answer of lead.answers) {
      lines.push(`— ${answer.label}: ${answer.rawValue || answer.value}`);
    }
  } else {
    lines.push('— не указаны');
  }
  lines.push('');

  lines.push('Комментарии');
  if (lead.comments?.length) {
    for (const comment of lead.comments) {
      lines.push(`— ${comment.text}`);
    }
  } else {
    lines.push('— нет');
  }
  lines.push('');

  lines.push('Стоимость');
  lines.push(`Стоимость: ${lead.priceEstimate || 'Требуется расчёт менеджером'}`);
  if (lead.calculation?.details) {
    lines.push(`Расчёт: ${lead.calculation.details}`);
  }
  lines.push('');

  lines.push('Файлы');
  lines.push(`Файлы: ${lead.files?.length ? `${lead.files.length} шт. Ниже будут отправлены копии файлов.` : lead.noFile ? 'файла нет' : 'не прикреплены'}`);
  lines.push('');

  lines.push('Ответ клиенту');
  lines.push(`/reply ${lead.id} текст сообщения`);
  lines.push('');
  lines.push('Команды менеджера');
  lines.push(`/lead ${lead.id} — показать заявку`);
  lines.push(`/status ${lead.id} в работе — обновить статус`);
  lines.push(`/done ${lead.id} — отметить выполненной`);

  return lines.join('\n');
}

async function calculateLead(lead, service) {
  if (!service) {
    return null;
  }

  const prices = await readJson('prices.json', { currency: 'BYN', prices: {} });
  const currency = prices.currency || 'BYN';

  if (service.calc?.type === 'area_m2') {
    const priceRule = prices.prices?.[service.calc.priceKey];
    const pricePerM2 = Number(priceRule?.value || 0);
    const width = Number(lead.fields?.width_m || 0);
    const height = Number(lead.fields?.height_m || 0);

    if (width && height && pricePerM2) {
      const area = roundMoney(width * height);
      const amount = roundMoney(area * pricePerM2);

      return {
        type: 'area_m2',
        priceEstimate: `${amount} ${currency}`,
        clientText: `Площадь: ${area} м².\nПредварительная стоимость: ${amount} ${currency}.\n\nТочная цена зависит от материала, обработки, срочности и макета.`,
        details: `${width} × ${height} м = ${area} м²; ${pricePerM2} ${currency}/м²; итого ${amount} ${currency}`
      };
    }
  }

  if (service.calc?.type === 'tiered_quantity') {
    const priceRule = prices.prices?.[service.calc.priceKey];
    const tiers = priceRule?.tiers || {};
    const quantityRange = String(lead.fields?.quantity_range || '');
    const urgency = String(lead.fields?.urgency || '');
    const tier = tiers[quantityRange];

    if (tier) {
      const baseAmount = Number(tier.value || 0);
      if (baseAmount) {
        const urgentMultiplier = urgency === 'urgent' ? Number(priceRule.urgentMultiplier || 1.25) : 1;
        const amount = roundMoney(baseAmount * urgentMultiplier);
        const urgencyText = urgency === 'urgent' ? `Срочность: применён коэффициент ${urgentMultiplier}.` : 'Срок: обычный заказ.';
        const discountText = lead.discountOffer ? `\nПри подтверждении заявки действует бонус: ${lead.discountOffer}.` : '';

        return {
          type: 'tiered_quantity',
          priceEstimate: `от ${amount} ${currency}`,
          clientText: [
            `Предварительная стоимость: от ${amount} ${currency}.`,
            urgencyText,
            'Точная цена зависит от бумаги, цветности, постпечатной обработки и макета.',
            discountText
          ].filter(Boolean).join('\n'),
          details: `${lead.service?.name || service.name}; тираж: ${tier.label || quantityRange}; база: ${baseAmount} ${currency}; срочность: ${urgency || 'standard'}; итого от ${amount} ${currency}`
        };
      }
    }
  }

  const approvedCalculation = calculateApprovedTieredPrice(lead, service, prices, currency);
  if (approvedCalculation) return approvedCalculation;

  return calculateFixedPrice(lead, service, prices, currency);
}

function calculateFixedPrice(lead, service, prices, currency) {
  const priceRule = prices.prices?.[service.code] || prices.prices?.[`${service.code}_base`];
  const amount = Number(priceRule?.value || 0);
  if (!amount) return null;

  const unit = priceRule.unit || 'за заказ';
  const note = priceRule.comment || APPROVED_PRICE_NOTE;

  return {
    type: 'fixed_price',
    priceEstimate: `от ${amount} ${currency}`,
    clientText: [
      `Предварительная стоимость: от ${amount} ${currency} ${unit}.`,
      note,
      'Итоговая цена зависит от параметров заказа и подтверждается менеджером.'
    ].join('\n'),
    details: `${lead.service?.name || service.name}; цена по прайсу: от ${amount} ${currency} ${unit}`
  };
}

function calculateApprovedTieredPrice(lead, service, prices, currency) {
  const priceRule = getApprovedPriceRule(service, prices);
  if (!priceRule?.tiers?.length) return null;

  const quantity = resolveLeadQuantity(lead);
  const tier = quantity ? findApprovedTier(priceRule.tiers, quantity) : findLowestApprovedTier(priceRule.tiers);
  const unitPrice = readTierPrice(tier);

  if (!tier || !unitPrice) {
    return {
      type: 'approved_tiered_manager',
      priceEstimate: 'Цену подскажет менеджер',
      clientText: [
        'По выбранному тиражу в утвержденном прайсе цена не указана.',
        'Стоимость подскажет менеджер после уточнения параметров заказа.'
      ].join('\n'),
      details: `${lead.service?.name || service.name}; цена по выбранному тиражу не указана в прайсе`
    };
  }

  const unit = priceRule.unit || 'шт';
  const designText = priceRule.designDevelopment ? `Разработка дизайна: ${priceRule.designDevelopment}.` : '';
  const baseText = `Цена по прайсу: от ${formatMoney(unitPrice)} ${currency} за ${unit}.`;

  if (!quantity) {
    return {
      type: 'approved_tiered',
      priceEstimate: `от ${formatMoney(unitPrice)} ${currency} за ${unit}`,
      clientText: [
        baseText,
        'Точную сумму по вашему тиражу подскажет менеджер.',
        designText
      ].filter(Boolean).join('\n'),
      details: `${lead.service?.name || service.name}; минимальная цена по прайсу: ${formatMoney(unitPrice)} ${currency} за ${unit}`
    };
  }

  const total = roundMoney(quantity * unitPrice);
  return {
    type: 'approved_tiered',
    priceEstimate: `от ${formatMoney(total)} ${currency}`,
    clientText: [
      `Тираж: ${quantity} ${unit}.`,
      `Цена по прайсу: ${formatMoney(unitPrice)} ${currency} за ${unit}.`,
      `Предварительная стоимость: от ${formatMoney(total)} ${currency}.`,
      designText,
      'Итоговую стоимость подтвердит менеджер после проверки макета и параметров заказа.'
    ].filter(Boolean).join('\n'),
    details: `${lead.service?.name || service.name}; тираж ${quantity} ${unit}; цена ${formatMoney(unitPrice)} ${currency}/${unit}; итого от ${formatMoney(total)} ${currency}`
  };
}

async function formatServicePriceText(service) {
  const prices = await readJson('prices.json', { currency: 'BYN', prices: {} });
  const currency = prices.currency || 'BYN';
  const priceRule = getServicePriceRule(service, prices);

  if (!priceRule) {
    return [
      `${service.name}`,
      '',
      'Цена: цену подскажет менеджер.'
    ].join('\n');
  }

  if (priceRule.tiers) {
    return formatApprovedPriceRuleText(service, priceRule, currency);
  }

  return [
    `${service.name}`,
    '',
    `Цена: от ${formatMoney(priceRule.amount)} ${currency}${priceRule.unit ? ` ${priceRule.unit}` : ''}`,
    '',
    'Итоговую стоимость подтверждает менеджер после проверки параметров заказа.'
  ].join('\n');
}

function getServicePriceRule(service, prices) {
  if (service.calc?.type === 'area_m2') {
    const priceRule = prices.prices?.[service.calc.priceKey];
    const amount = Number(priceRule?.value || 0);
    if (amount) return { amount, unit: `за ${priceRule.unit || 'м²'}` };
  }

  if (service.calc?.type === 'tiered_quantity') {
    const priceRule = prices.prices?.[service.calc.priceKey];
    const tiers = Object.values(priceRule?.tiers || {});
    const amounts = tiers.map((tier) => Number(tier.value || 0)).filter(Boolean);
    if (amounts.length) return { amount: Math.min(...amounts), unit: priceRule.unit || 'за тираж' };
  }

  const priceRule = prices.prices?.[service.code] || prices.prices?.[`${service.code}_base`];
  const amount = Number(priceRule?.value || 0);
  if (amount) return { amount, unit: priceRule.unit || 'за заказ' };

  const approvedRule = getApprovedPriceRule(service, prices);
  if (approvedRule?.tiers?.length) return approvedRule;

  return null;
}

function getApprovedPriceRule(service, prices) {
  const priceKey = service.calc?.priceKey || service.code;
  const priceRule = prices.prices?.[priceKey];
  if (!priceRule || !Array.isArray(priceRule.tiers)) return null;
  return priceRule;
}

function formatApprovedPriceRuleText(service, priceRule, currency) {
  const lines = [`${service.name}`, ''];

  if (priceRule.description) {
    lines.push(priceRule.description, '');
  }

  const printableTiers = priceRule.tiers
    .map((tier) => {
      const price = readTierPrice(tier);
      const label = tier.label || `от ${tier.minQuantity}`;
      const unit = priceRule.unit || 'шт';
      return price ? `${label}: ${formatMoney(price)} ${currency} за ${unit}` : `${label}: цену подскажет менеджер`;
    });

  if (printableTiers.length) {
    lines.push('Прайс:', ...printableTiers);
  } else {
    lines.push('Цена: цену подскажет менеджер.');
  }

  if (priceRule.designDevelopment) {
    lines.push('', `Разработка дизайна: ${priceRule.designDevelopment}.`);
  }

  lines.push('', 'Итоговую стоимость подтверждает менеджер после проверки макета и параметров заказа.');
  return lines.join('\n');
}

function readTierPrice(tier = {}) {
  const price = Number(tier.priceWithVat || tier.price || tier.value || 0);
  return price || null;
}

function findApprovedTier(tiers = [], quantity = 0) {
  const sorted = [...tiers].sort((a, b) => Number(a.minQuantity || 0) - Number(b.minQuantity || 0));
  if (!sorted.length || quantity < Number(sorted[0].minQuantity || 0)) return null;
  return sorted.reduce((selected, tier) => {
    if (Number(tier.minQuantity || 0) <= quantity) return tier;
    return selected;
  }, null);
}

function findLowestApprovedTier(tiers = []) {
  return [...tiers]
    .filter((tier) => readTierPrice(tier))
    .sort((a, b) => readTierPrice(a) - readTierPrice(b))[0] || null;
}

function resolveLeadQuantity(lead = {}) {
  const exactQuantity = Number(lead.fields?.quantity || 0);
  if (exactQuantity) return exactQuantity;

  const fromInitialMessage = parseQuantity(lead.initialMessage || '');
  if (fromInitialMessage) return fromInitialMessage;

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

async function findLead(leadId) {
  const leads = await readJson('leads.json', []);
  const normalizedId = normalizeLeadId(leadId);
  return leads.find((item) => normalizeLeadId(item.id) === normalizedId) || null;
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

async function loadServices() {
  const configuredServices = await readJson('services.json', []);
  const catalog = await readJson('catalog.json', []);
  const services = configuredServices.map((service) => normalizeService(service));

  for (const categoryBlock of catalog) {
    const category = categoryBlock.category || 'Другое';
    for (const item of categoryBlock.items || []) {
      const code = item.code || makeServiceCode(item.url || item.name);
      const existing = services.find((service) => service.code === code || normalizeText(service.name) === normalizeText(item.name));

      if (existing) {
        existing.category = existing.category || category;
        existing.sourceUrl = existing.sourceUrl || absoluteSiteUrl(item.url);
        existing.priceNote = existing.priceNote || DEFAULT_PRICE_NOTE;
        continue;
      }

      services.push(normalizeService({
        code,
        category,
        name: item.name,
        sourceUrl: absoluteSiteUrl(item.url),
        synonyms: item.synonyms || [],
        intro: `Понял, оформляем: ${item.name}.`,
        managerOnly: true,
        askFile: true,
        calc: { type: 'manager' },
        priceNote: DEFAULT_PRICE_NOTE
      }));
    }
  }

  return services;
}

async function loadSessionService(session = {}) {
  const services = await loadServices();
  return services.find((item) => item.code === session.serviceCode) || session.lead?.service || null;
}

function normalizeService(service) {
  return {
    ...service,
    sourceUrl: service.sourceUrl || '',
    priceNote: service.priceNote || DEFAULT_PRICE_NOTE,
    synonyms: buildServiceSynonyms(service)
  };
}

function absoluteSiteUrl(url = '') {
  if (!url) return WEBSITE_BASE_URL;
  if (/^https?:\/\//i.test(url)) return url;
  return `${WEBSITE_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function makeServiceCode(value = '') {
  return String(value)
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/services\//, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/-+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function groupServicesByCategory(services) {
  const grouped = new Map();
  for (const service of services) {
    const category = service.category || 'Другое';
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(service);
  }

  return [...grouped.entries()];
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

function buildServiceSynonyms(service = {}) {
  const variants = new Set();
  const explicit = Array.isArray(service.synonyms) ? service.synonyms : [];
  const sourceUrl = service.sourceUrl || service.url || '';
  const slug = sourceUrl.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ') || '';

  for (const phrase of [service.name, service.category, slug, ...explicit]) {
    addSynonymVariant(variants, phrase);
  }

  return [...variants].filter(Boolean);
}

function addSynonymVariant(variants, phrase = '') {
  const normalized = normalizeText(phrase);
  if (!normalized) return;

  variants.add(phrase);
  variants.add(normalized);

  const shortened = normalized
    .replace(/\b(изготовление|изготовления|печать|печатные|печатный|заказать|услуги|услуга|минске|компании)\b/g, ' ')
    .replace(/\b(с логотипом|на заказ)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (shortened && shortened !== normalized) {
    variants.add(shortened);
  }

  for (const token of tokenize(normalized)) {
    const stem = stemServiceToken(token);
    if (stem) variants.add(stem);
  }
}

function stemServiceToken(token = '') {
  if (token.length < 6) return '';
  if (['печать', 'услуг', 'заказ', 'минск', 'изготовлен'].some((word) => token.startsWith(word))) return '';

  const stem = token
    .replace(/(иями|ями|ами|иях|ях|ах|ого|ему|ыми|ими|ую|юю|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|ов|ев|ам|ям|ом|ем|а|я|ы|и|у|ю|е)$/i, '');

  return stem.length >= 4 ? stem : '';
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
  const questions = getServiceQuestions(service);
  return questions.find((question) => lead.fields?.[question.key] === undefined || lead.fields?.[question.key] === '');
}

function getServiceQuestions(service = {}) {
  if (Array.isArray(service.questions) && service.questions.length) {
    return service.questions;
  }

  return CATEGORY_QUESTIONS[service.category] || CATEGORY_QUESTIONS.default;
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

function formatQuestionPrompt(service, lead, question) {
  const questions = getServiceQuestions(service);
  const currentIndex = questions.findIndex((item) => item.key === question.key);
  const progress = currentIndex >= 0 ? `Вопрос ${currentIndex + 1} из ${questions.length}` : 'Следующий вопрос';

  return [
    progress,
    question.prompt,
    '',
    'Если точного ответа нет, можно написать «не знаю».'
  ].join('\n');
}

function formatPriceNote(service = {}) {
  const note = service.priceNote || DEFAULT_PRICE_NOTE;
  return note ? `Цена: ${note}` : '';
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

function removeFieldAnswer(lead, key) {
  if (!lead || !key) return;
  if (lead.fields) delete lead.fields[key];
  if (Array.isArray(lead.answers)) {
    lead.answers = lead.answers.filter((item) => item.key !== key);
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

function extractCommentAfterPhone(msg, phone) {
  const text = (msg.text || msg.caption || '').trim();
  if (!text || !phone) return '';

  const escapedPhone = phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withoutPhone = text.replace(new RegExp(escapedPhone), '').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();
  if (!withoutPhone || withoutPhone === text) return '';

  return withoutPhone;
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
  const match = normalized.match(/(\d{1,7})\s*(шт|штук|ед|экз|компл|комплект|тираж|визит|накле|стикер|флаер|листов|буклет|бланк|блокнот|бейдж|папк|пакет|сертифик|диплом|круж|руч|рол|roll|фигур|календар)/i);
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

function isPolygraphyEntry(text = '') {
  const normalized = normalizeText(text);
  return [
    'хочу заказать полиграфию',
    'полиграфия',
    'заказать полиграфию'
  ].some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function isSouvenirEntry(text = '') {
  const normalized = normalizeText(text);
  return [
    'нужны сувениры с логотипом',
    'сувениры с логотипом',
    'сувениры',
    'сувенирка',
    'подарочные наборы'
  ].some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function isComplexProjectEntry(text = '') {
  const normalized = normalizeText(text);
  return [
    'у меня сложный проект хочу обсудить с менеджером',
    'сложный проект',
    'обсудить с менеджером',
    'индивидуальный проект'
  ].some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function isCancelRequest(text = '') {
  const normalized = normalizeText(text);
  return CANCEL_TEXTS.some((phrase) => normalized === normalizeText(phrase));
}

function isBackRequest(text = '') {
  const normalized = normalizeText(text);
  return BACK_TEXTS.some((phrase) => normalized === normalizeText(phrase));
}

function isServicesRequest(text = '') {
  const normalized = normalizeText(text);
  return SERVICES_TEXTS.some((phrase) => normalized === normalizeText(phrase));
}

function isStatusRequest(text = '') {
  const normalized = normalizeText(text);
  return STATUS_TEXTS.some((phrase) => normalized === normalizeText(phrase));
}

function isPriceRequest(text = '') {
  const normalized = normalizeText(text);
  return PRICE_TEXTS.some((phrase) => normalized === normalizeText(phrase));
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

function formatMoney(value) {
  const rounded = roundMoney(value);
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(rounded);
}

function formatTelegramUser(user = {}) {
  const parts = [];
  if (user.username) parts.push(`@${user.username}`);
  if (user.id) parts.push(`id:${user.id}`);
  if (!parts.length) return 'не указан';
  return parts.join(' / ');
}

function formatLeadStatus(status = '') {
  const normalized = normalizeText(status);
  const labels = {
    draft: 'черновик',
    new: 'новая, передана менеджеру',
    done: 'выполнена'
  };

  return labels[normalized] || status || 'передана менеджеру';
}

function normalizeLeadId(value = '') {
  return String(value).trim().toUpperCase();
}

function phoneRequestText() {
  return [
    'Оставьте номер телефона для связи с менеджером.',
    '',
    'Пример: +375 29 123-45-67'
  ].join('\n');
}

function managerHandoffText() {
  return [
    'Спасибо за подробности. Этот запрос требует индивидуального подхода.',
    '',
    `Пожалуйста, оставьте контактные данные, и наш специалист ${SALES_MANAGER_NAME} свяжется с вами в ближайшее время и подготовит лучшее предложение.`,
    '',
    'Можно нажать «Отправить телефон» или написать номер вручную.'
  ].join('\n');
}

function findOption(normalizedText, options) {
  if (!normalizedText) return null;

  const entry = Object.entries(options).find(([key]) => {
    const normalizedKey = normalizeText(key);
    return normalizedText === normalizedKey || normalizedText.includes(normalizedKey) || normalizedKey.includes(normalizedText);
  });

  return entry?.[1] || null;
}

function normalizeQuantityRange(text = '') {
  const normalized = normalizeText(text);

  if (normalized.includes('до 100')) return 'up_to_100';
  if (normalized.includes('100') && normalized.includes('500')) return '100_500';
  if (normalized.includes('500') && normalized.includes('1000')) return '500_1000';
  if (normalized.includes('свыше') || normalized.includes('больше') || normalized.includes('1000')) return 'over_1000';

  const quantity = parseQuantity(normalized) || parseInt(normalized.replace(/\D+/g, ''), 10);
  if (!quantity) return normalized || 'unknown';
  if (quantity <= 100) return 'up_to_100';
  if (quantity <= 500) return '100_500';
  if (quantity <= 1000) return '500_1000';
  return 'over_1000';
}

function normalizeUrgency(text = '') {
  const normalized = normalizeText(text);
  if (normalized.includes('срочно') || normalized.includes('завтра') || normalized.includes('сегодня')) {
    return 'urgent';
  }

  return 'standard';
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
      ['📋 Каталог', '💰 Цены'],
      ['Полиграфия', 'Сувениры'],
      ['Сложный проект'],
      ['🔎 Статус заявки'],
      ['👨‍💼 Позвать менеджера']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function catalogCategoryKeyboard(groups) {
  const rows = chunkRows(groups.map(([category]) => category), 2);
  rows.push(['⬅️ Назад', '🏠 Главное меню']);
  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function catalogServiceKeyboard(services) {
  const rows = services.map((service) => [service.name]);
  rows.push(['⬅️ Назад', '🏠 Главное меню']);
  rows.push(['👨‍💼 Позвать менеджера']);
  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function polygraphyProductKeyboard() {
  return {
    keyboard: [
      ['Визитки', 'Буклеты A4'],
      ['Листовка A4 1 сторона', 'Листовка A4 2 стороны'],
      ['Бейджи A6', 'Бланки A4'],
      ['Папки A4', 'Сертификаты A4'],
      ['Наклейки/этикетки', 'Другое'],
      ['👨‍💼 Позвать менеджера'],
      ['⬅️ Назад', '🏠 Главное меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function quantityRangeKeyboard() {
  return {
    keyboard: [
      ['До 100 шт', '100-500 шт'],
      ['500-1000 шт', 'Свыше 1000 шт'],
      ['👨‍💼 Позвать менеджера'],
      ['⬅️ Назад', '❌ Отменить заявку']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function urgencyKeyboard() {
  return {
    keyboard: [
      ['Обычный заказ'],
      ['Срочно, нужно завтра'],
      ['👨‍💼 Позвать менеджера'],
      ['⬅️ Назад', '❌ Отменить заявку']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function souvenirTypeKeyboard() {
  return {
    keyboard: [
      ['Подарочные наборы'],
      ['Брендированный текстиль'],
      ['Кружки и термокружки'],
      ['Ежедневники и органайзеры'],
      ['👨‍💼 Позвать менеджера'],
      ['⬅️ Назад', '🏠 Главное меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function souvenirEventKeyboard() {
  return {
    keyboard: [
      ['Подарок сотруднику'],
      ['Подарок для партнера'],
      ['Промо-раздача'],
      ['👨‍💼 Позвать менеджера'],
      ['⬅️ Назад', '❌ Отменить заявку']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function serviceKeyboard() {
  return {
    keyboard: [
      ['👨‍💼 Позвать менеджера'],
      ['⬅️ Назад', '❌ Отменить заявку'],
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
      ['⬅️ Назад', '❌ Отменить заявку'],
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
      ['⬅️ Назад', '❌ Отменить заявку'],
      ['🏠 Главное меню']
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function nameKeyboard(user = {}) {
  const firstName = user?.first_name || '';
  const rows = firstName ? [[firstName], ['⬅️ Назад', '❌ Отменить заявку']] : [['⬅️ Назад', '❌ Отменить заявку']];
  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function chunkRows(items, columns = 2) {
  const rows = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return rows;
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
