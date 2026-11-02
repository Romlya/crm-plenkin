'use strict';

/**
 * ПЛЕНКИН · CRM
 * Самодостаточный сервер: Node.js (>= 18), без внешних зависимостей.
 * Данные — data/db.json (атомарная запись) + ежедневные бэкапы в data/backups.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.CRM_DATA_DIR ? path.resolve(process.env.CRM_DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const PORT = Number(process.env.PORT || 7788);
const VERSION = '2.0.0';
const SESSION_COOKIE = 'plenkin_crm';
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────── утилиты

const nowIso = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function str(value, max = 500) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u0000/g, '').trim().slice(0, max);
}

function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

function int(value, fallback = 0) {
  const n = num(value, fallback);
  return Math.round(n);
}

function isoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function dayKey(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function escapeCsv(value) {
  const s = String(value ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ─────────────────────────────────────────────────────────────── хранилище

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function readSecret() {
  ensureDirs();
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

let SECRET = '';

function defaultServices() {
  return [
    { id: 'sv_solar', name: 'Солнцезащитная плёнка', price: 650, unit: 'м²', active: true },
    { id: 'sv_athermal', name: 'Атермальная плёнка', price: 800, unit: 'м²', active: true },
    { id: 'sv_k4', name: 'Противоосколочная К4 (SB2)', price: 1100, unit: 'м²', active: true },
    { id: 'sv_p2a', name: 'Ударостойкая Р2А–Р4А', price: 2200, unit: 'м²', active: true },
    { id: 'sv_decor', name: 'Декоративная / матирование', price: 650, unit: 'м²', active: true },
    { id: 'sv_brand', name: 'Фотопечать и брендирование', price: 1250, unit: 'м²', active: true },
    { id: 'sv_smart', name: 'Смарт-плёнка (PDLC)', price: 4500, unit: 'м²', active: true },
    { id: 'sv_plotter', name: 'Плоттерная резка', price: 900, unit: 'м²', active: true },
  ];
}

function defaultSettings() {
  return {
    company: {
      name: 'ПЛЕНКИН',
      tagline: 'АРХИТЕКТУРНЫЕ ПЛЁНКИ',
      phone: '+7 985 780-13-75',
      phoneRaw: '+79857801375',
      email: 'plenkininfo@yandex.ru',
      site: 'plenkinaokna.ru',
      address: 'Москва и Московская область',
      hours: 'ежедневно 9:00–21:00',
      inn: '',
      legal: 'ИП Пленкин',
    },
    currency: '₽',
    sources: ['Сайт', 'Телефон', 'MAX', 'WhatsApp', 'Авито', 'Рекомендация', 'Госзакупки', 'Другое'],
    services: defaultServices(),
    expenseCategories: ['Материалы', 'Зарплата', 'Реклама', 'Аренда', 'Транспорт', 'Связь', 'Налоги', 'Прочее'],
    leadToken: crypto.randomBytes(18).toString('hex'),
    siteImport: { url: '', token: '' },
    demo: false,
    onboarded: false,
  };
}

function emptyDb() {
  return {
    version: VERSION,
    createdAt: nowIso(),
    auth: null,
    profile: { name: 'Руководитель' },
    settings: defaultSettings(),
    counters: { orderSeq: {} },
    clients: [],
    leads: [],
    orders: [],
    payments: [],
    expenses: [],
    tasks: [],
    activity: [],
  };
}

let db = null;
let saveTimer = null;

function loadDb() {
  ensureDirs();
  SECRET = readSecret();
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = { ...emptyDb(), ...parsed };
      db.settings = { ...defaultSettings(), ...(parsed.settings || {}) };
      db.settings.company = { ...defaultSettings().company, ...(parsed.settings?.company || {}) };
      for (const key of ['clients', 'leads', 'orders', 'payments', 'expenses', 'tasks', 'activity']) {
        if (!Array.isArray(db[key])) db[key] = [];
      }
      return;
    } catch (error) {
      console.error('[db] Не удалось прочитать db.json:', error.message);
      const broken = `${DB_FILE}.broken-${Date.now()}`;
      try { fs.copyFileSync(DB_FILE, broken); } catch { /* ignore */ }
      console.error(`[db] Повреждённый файл сохранён как ${broken}`);
    }
  }
  db = emptyDb();
  saveDb(true);
}

function saveDb(immediate = false) {
  ensureDirs();
  const write = () => {
    saveTimer = null;
    try {
      const tmp = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
      fs.renameSync(tmp, DB_FILE);
    } catch (error) {
      console.error('[db] Ошибка записи:', error.message);
    }
  };
  if (immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    write();
  } else if (!saveTimer) {
    saveTimer = setTimeout(write, 250);
  }
}

function backupDaily() {
  try {
    ensureDirs();
    const target = path.join(BACKUP_DIR, `db-${dayKey()}.json`);
    if (fs.existsSync(target)) return;
    fs.copyFileSync(DB_FILE, target);
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('db-')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 30))) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    }
  } catch (error) {
    console.error('[backup]', error.message);
  }
}

function logActivity(type, text, refId = '') {
  db.activity.unshift({ id: uid('act'), type, text, refId, at: nowIso() });
  if (db.activity.length > 300) db.activity.length = 300;
}

// ─────────────────────────────────────────────────────────────── авторизация

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, auth) {
  if (!auth?.salt || !auth?.hash) return false;
  const { hash } = hashPassword(password, auth.salt);
  return safeEqual(hash, auth.hash);
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readSession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

const loginAttempts = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.reset) {
    loginAttempts.set(ip, { count: 1, reset: now + 10 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 12;
}

// ─────────────────────────────────────────────────────────────── HTTP помощники

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function fail(res, status, message, details) {
  sendJson(res, status, { ok: false, error: message, details });
}

async function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error('Некорректный JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket.encrypted);
}

function setSessionCookie(res, req, token, remember) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (remember) parts.push(`Max-Age=${Math.floor(SESSION_TTL / 1000)}`);
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ─────────────────────────────────────────────────────────────── нормализация

const LEAD_STATUSES = ['new', 'contacted', 'measure', 'estimate', 'contract', 'won', 'lost'];
const ORDER_STATUSES = ['new', 'measure', 'materials', 'install', 'done', 'closed', 'cancelled'];

function normalizeClient(input = {}, current = null) {
  const base = current || {};
  const name = str(input.name ?? base.name, 120);
  if (!name) throw Object.assign(new Error('Укажите имя клиента'), { status: 400 });
  return {
    id: base.id || uid('cl'),
    name,
    phone: str(input.phone ?? base.phone, 40),
    email: str(input.email ?? base.email, 160),
    company: str(input.company ?? base.company, 160),
    address: str(input.address ?? base.address, 240),
    source: str(input.source ?? base.source, 40) || 'Другое',
    note: str(input.note ?? base.note, 2000),
    tags: Array.isArray(input.tags) ? input.tags.map((t) => str(t, 30)).filter(Boolean).slice(0, 10) : base.tags || [],
    createdAt: base.createdAt || isoDate(input.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeLead(input = {}, current = null) {
  const base = current || {};
  const name = str(input.name ?? base.name, 120);
  const phone = str(input.phone ?? base.phone, 40);
  if (!name) throw Object.assign(new Error('Укажите имя'), { status: 400 });
  const status = LEAD_STATUSES.includes(input.status) ? input.status : base.status || 'new';
  return {
    id: base.id || uid('ld'),
    name,
    phone,
    email: str(input.email ?? base.email, 160),
    source: str(input.source ?? base.source, 40) || 'Сайт',
    serviceId: str(input.serviceId ?? base.serviceId, 40),
    area: num(input.area ?? base.area, 0),
    estimate: num(input.estimate ?? base.estimate, 0),
    status,
    clientId: input.clientId ?? base.clientId ?? null,
    owner: str(input.owner ?? base.owner, 80),
    comment: str(input.comment ?? base.comment, 4000),
    address: str(input.address ?? base.address, 240),
    nextActionAt: isoDate(input.nextActionAt ?? base.nextActionAt),
    lostReason: str(input.lostReason ?? base.lostReason, 200),
    externalId: str(input.externalId ?? base.externalId, 120),
    convertedOrderId: input.convertedOrderId ?? base.convertedOrderId ?? null,
    createdAt: base.createdAt || isoDate(input.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function nextOrderNumber() {
  const year = new Date().getFullYear();
  const key = String(year);
  db.counters.orderSeq = db.counters.orderSeq || {};
  const next = (db.counters.orderSeq[key] || 0) + 1;
  db.counters.orderSeq[key] = next;
  return `ПЛ-${year}-${String(next).padStart(4, '0')}`;
}

function normalizeOrder(input = {}, current = null) {
  const base = current || {};
  const items = Array.isArray(input.items ?? base.items)
    ? (input.items ?? base.items).slice(0, 50).map((item) => ({
      name: str(item?.name, 160),
      qty: num(item?.qty, 1),
      price: num(item?.price, 0),
      cost: num(item?.cost, 0),
    })).filter((item) => item.name)
    : [];
  const itemsSum = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const itemsCost = items.reduce((sum, item) => sum + item.qty * item.cost, 0);
  const amount = items.length ? Math.round(itemsSum * 100) / 100 : num(input.amount ?? base.amount, 0);
  const cost = items.length ? Math.round(itemsCost * 100) / 100 : num(input.cost ?? base.cost, 0);
  const status = ORDER_STATUSES.includes(input.status) ? input.status : base.status || 'new';
  const title = str(input.title ?? base.title, 160) || 'Заказ';
  return {
    id: base.id || uid('or'),
    number: base.number || nextOrderNumber(),
    clientId: input.clientId ?? base.clientId ?? null,
    leadId: input.leadId ?? base.leadId ?? null,
    title,
    serviceId: str(input.serviceId ?? base.serviceId, 40),
    area: num(input.area ?? base.area, 0),
    address: str(input.address ?? base.address, 240),
    amount,
    cost,
    status,
    deadline: isoDate(input.deadline ?? base.deadline),
    paidAt: isoDate(input.paidAt ?? base.paidAt),
    items,
    note: str(input.note ?? base.note, 4000),
    createdAt: base.createdAt || isoDate(input.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizePayment(input = {}, current = null) {
  const base = current || {};
  const orderId = str(input.orderId ?? base.orderId, 40);
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw Object.assign(new Error('Заказ не найден'), { status: 400 });
  const amount = num(input.amount ?? base.amount, 0);
  if (amount <= 0) throw Object.assign(new Error('Сумма оплаты должна быть больше нуля'), { status: 400 });
  return {
    id: base.id || uid('pay'),
    orderId,
    amount,
    date: isoDate(input.date ?? base.date) || nowIso(),
    method: ['cash', 'card', 'transfer', 'account'].includes(input.method) ? input.method : base.method || 'transfer',
    note: str(input.note ?? base.note, 300),
    createdAt: base.createdAt || nowIso(),
  };
}

function normalizeExpense(input = {}, current = null) {
  const base = current || {};
  const amount = num(input.amount ?? base.amount, 0);
  if (amount <= 0) throw Object.assign(new Error('Сумма расхода должна быть больше нуля'), { status: 400 });
  return {
    id: base.id || uid('exp'),
    category: str(input.category ?? base.category, 60) || 'Прочее',
    amount,
    date: isoDate(input.date ?? base.date) || nowIso(),
    note: str(input.note ?? base.note, 300),
    orderId: input.orderId ?? base.orderId ?? null,
    createdAt: base.createdAt || nowIso(),
  };
}

function normalizeTask(input = {}, current = null) {
  const base = current || {};
  const title = str(input.title ?? base.title, 200);
  if (!title) throw Object.assign(new Error('Укажите задачу'), { status: 400 });
  return {
    id: base.id || uid('tsk'),
    title,
    dueAt: isoDate(input.dueAt ?? base.dueAt),
    done: Boolean(input.done ?? base.done),
    refType: str(input.refType ?? base.refType, 20),
    refId: str(input.refId ?? base.refId, 40),
    createdAt: base.createdAt || nowIso(),
  };
}

// ─────────────────────────────────────────────────────────────── демо-данные

function demoSeed() {
  const today = new Date();
  const dateAt = (daysAgo) => new Date(today.getTime() - daysAgo * 86400000).toISOString();
  const dayAt = (offset) => {
    const d = new Date(today.getTime() + offset * 86400000);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };

  const clients = [
    { name: 'ООО «СтройГрад»', phone: '+7 916 240-18-32', email: 'office@stroygrad.ru', company: 'ООО «СтройГрад»', address: 'Москва, Пресненская наб., 12', source: 'Сайт' },
    { name: 'Анна Сергеева', phone: '+7 903 771-45-09', email: 'a.sergeeva@mail.ru', company: '', address: 'Москва, ул. Профсоюзная, 84', source: 'Рекомендация' },
    { name: 'ГБОУ Школа № 1234', phone: '+7 499 152-33-70', email: 'school1234@edu.mos.ru', company: 'ГБОУ Школа № 1234', address: 'Москва, ул. Новозаводская, 5', source: 'Госзакупки' },
    { name: 'Кофейня «Бариста»', phone: '+7 925 118-62-44', email: 'hello@barista.cafe', company: 'ИП Кузнецов', address: 'Мытищи, ул. Мира, 21', source: 'Авито' },
    { name: 'Клиника «Медиан»', phone: '+7 495 780-22-19', email: 'info@median-clinic.ru', company: 'ООО «Медиан»', address: 'Москва, Ленинский пр-т, 42', source: 'Сайт' },
    { name: 'УК «Ривер Парк»', phone: '+7 499 110-77-40', email: 'office@riverpark.ru', company: 'ООО «Ривер Парк»', address: 'Москва, Нагатинская наб., 10', source: 'Рекомендация' },
  ].map((client) => normalizeClient(client));
  clients.forEach((client, index) => {
    client.createdAt = dateAt(168 - index * 21);
  });
  const [clientStroy, clientAnna, clientSchool, clientBarista, clientClinic, clientRiver] = clients;

  const leads = [
    { name: 'Анна Сергеева', phone: '+7 903 771-45-09', email: 'a.sergeeva@mail.ru', source: 'Рекомендация', serviceId: 'sv_solar', area: 18, estimate: 11700, status: 'contract', clientId: clientAnna.id, comment: 'Квартира, южная сторона, нужна атермалка + лёгкая тонировка.' },
    { name: 'ООО «СтройГрад»', phone: '+7 916 240-18-32', source: 'Сайт', serviceId: 'sv_k4', area: 120, estimate: 132000, status: 'measure', clientId: clientStroy.id, comment: 'Бизнес-центр, 3 этажа. Замер в четверг.' },
    { name: 'ГБОУ Школа № 1234', phone: '+7 499 152-33-70', source: 'Госзакупки', serviceId: 'sv_p2a', area: 210, estimate: 462000, status: 'estimate', clientId: clientSchool.id, comment: '44-ФЗ. Нужны сертификаты и акты, класс Р2А.' },
    { name: 'Дмитрий К.', phone: '+7 968 402-77-15', source: 'Авито', serviceId: 'sv_decor', area: 9, estimate: 5850, status: 'contacted', comment: 'Матирование перегородки в офисе.' },
    { name: 'Кофейня «Бариста»', phone: '+7 925 118-62-44', source: 'Сайт', serviceId: 'sv_brand', area: 14, estimate: 17500, status: 'new', clientId: clientBarista.id, comment: 'Брендирование витрины, нужен дизайн-макет.' },
    { name: 'Ирина П.', phone: '+7 985 220-71-03', source: 'Телефон', serviceId: 'sv_solar', area: 24, estimate: 15600, status: 'won', comment: 'Дом в Одинцово, заказала солнцезащиту.' },
    { name: 'ООО «Вектор»', phone: '+7 495 640-11-88', source: 'Сайт', serviceId: 'sv_smart', area: 6, estimate: 27000, status: 'new', comment: 'Переговорная, PDLC.' },
    { name: 'Сергей М.', phone: '+7 903 118-45-62', source: 'Другое', serviceId: 'sv_k4', area: 35, estimate: 38500, status: 'lost', comment: 'Дорого, ушёл к конкуренту.', lostReason: 'Цена' },
  ].map((lead, index) => normalizeLead({ ...lead, createdAt: dateAt(index + 1), updatedAt: dateAt(index) }));

  const orders = [
    { number: 'ПЛ-2026-0001', title: 'Солнцезащитная плёнка, офис на Тверской', clientId: clientStroy.id, serviceId: 'sv_solar', area: 60, amount: 42000, cost: 15000, status: 'closed', address: 'Москва, ул. Тверская, 18', createdAt: dateAt(150), deadline: dateAt(145) },
    { number: 'ПЛ-2026-0002', title: 'Плёнка К4, детский сад № 78', clientId: clientSchool.id, serviceId: 'sv_k4', area: 90, amount: 99000, cost: 40000, status: 'closed', address: 'Москва, ул. Строителей, 4', createdAt: dateAt(120), deadline: dateAt(115) },
    { number: 'ПЛ-2026-0003', title: 'Декоративная плёнка, клиника «Медиан»', clientId: clientClinic.id, serviceId: 'sv_decor', area: 35, amount: 26000, cost: 9000, status: 'closed', address: 'Москва, Ленинский пр-т, 42', createdAt: dateAt(90), deadline: dateAt(86) },
    { number: 'ПЛ-2026-0004', title: 'Атермальная плёнка, ЖК «Ривер Парк»', clientId: clientRiver.id, serviceId: 'sv_athermal', area: 48, amount: 38400, cost: 14000, status: 'closed', address: 'Москва, Нагатинская наб., 10', createdAt: dateAt(60), deadline: dateAt(56) },
    { number: 'ПЛ-2026-0005', title: 'Брендирование ресепшн, ТЦ «Афимолл»', clientId: clientBarista.id, serviceId: 'sv_brand', area: 25, amount: 34000, cost: 12000, status: 'closed', address: 'Москва, Пресненская наб., 2', createdAt: dateAt(35), deadline: dateAt(31) },
    { number: 'ПЛ-2026-0006', title: 'Атермальная плёнка, ЖК «Символ»', clientId: clientAnna.id, leadId: leads[0].id, serviceId: 'sv_athermal', area: 18, amount: 14400, cost: 5200, status: 'closed', address: 'Москва, ул. Профсоюзная, 84', createdAt: dateAt(25), deadline: dateAt(21) },
    { number: 'ПЛ-2026-0007', title: 'Противоосколочная плёнка К4, БЦ «СтройГрад»', clientId: clientStroy.id, leadId: leads[1].id, serviceId: 'sv_k4', area: 120, amount: 132000, cost: 58000, status: 'install', address: 'Москва, Пресненская наб., 12', createdAt: dateAt(20), deadline: dayAt(2) },
    { number: 'ПЛ-2026-0008', title: 'Класс Р2А, школа № 1234', clientId: clientSchool.id, leadId: leads[2].id, serviceId: 'sv_p2a', area: 210, amount: 462000, cost: 210000, status: 'materials', address: 'Москва, ул. Новозаводская, 5', createdAt: dateAt(12), deadline: dayAt(9) },
    { number: 'ПЛ-2026-0009', title: 'Брендирование витрины', clientId: clientBarista.id, serviceId: 'sv_brand', area: 14, amount: 17500, cost: 6300, status: 'done', address: 'Мытищи, ул. Мира, 21', createdAt: dateAt(9), deadline: dateAt(3) },
    { number: 'ПЛ-2026-0010', title: 'Солнцезащита, дом в Одинцово', clientId: null, leadId: leads[5].id, serviceId: 'sv_solar', area: 24, amount: 15600, cost: 5100, status: 'measure', address: 'Одинцово, ул. Лесная, 7', createdAt: dateAt(5), deadline: dayAt(5) },
  ].map((order) => normalizeOrder(order));
  db.counters.orderSeq[String(new Date().getFullYear())] = orders.length;
  db.orders.push(...orders);

  const payments = [
    { orderId: orders[0].id, amount: 42000, date: dateAt(148), method: 'transfer', note: 'Полная оплата' },
    { orderId: orders[1].id, amount: 99000, date: dateAt(118), method: 'account', note: 'Оплата по контракту' },
    { orderId: orders[2].id, amount: 26000, date: dateAt(88), method: 'card', note: 'Полная оплата' },
    { orderId: orders[3].id, amount: 30000, date: dateAt(58), method: 'transfer', note: 'Аванс 78%' },
    { orderId: orders[3].id, amount: 8400, date: dateAt(30), method: 'card', note: 'Остаток' },
    { orderId: orders[4].id, amount: 34000, date: dateAt(33), method: 'transfer', note: 'Оплата по счёту' },
    { orderId: orders[5].id, amount: 14400, date: dateAt(23), method: 'card', note: 'Полная оплата' },
    { orderId: orders[6].id, amount: 66000, date: dateAt(18), method: 'transfer', note: 'Аванс 50%' },
    { orderId: orders[7].id, amount: 92400, date: dateAt(10), method: 'account', note: 'Аванс по контракту' },
    { orderId: orders[8].id, amount: 17500, date: dateAt(7), method: 'transfer', note: 'Оплата по счёту' },
    { orderId: orders[9].id, amount: 5000, date: dateAt(3), method: 'cash', note: 'Предоплата' },
  ].map((payment) => normalizePayment(payment));

  const expenses = [
    { category: 'Аренда', amount: 28000, date: dateAt(140), note: 'Склад и офис' },
    { category: 'Зарплата', amount: 60000, date: dateAt(135), note: 'Монтажная бригада' },
    { category: 'Реклама', amount: 15000, date: dateAt(130), note: 'Яндекс.Директ' },
    { category: 'Реклама', amount: 12000, date: dateAt(70), note: 'Директ + карты' },
    { category: 'Аренда', amount: 28000, date: dateAt(40), note: 'Склад и офис' },
    { category: 'Зарплата', amount: 45000, date: dateAt(20), note: 'Монтажники, смена' },
    { category: 'Транспорт', amount: 3400, date: dateAt(6), note: 'Логистика на объект' },
    { category: 'Связь', amount: 2400, date: dateAt(3), note: 'Телефония и CRM' },
  ].map((expense) => normalizeExpense(expense));

  const tasks = [
    { title: 'Позвонить в школу № 1234 — согласовать смету', dueAt: dayAt(0), refType: 'lead', refId: leads[2].id },
    { title: 'Подтвердить выезд замерщика к «СтройГрад»', dueAt: dayAt(1), refType: 'lead', refId: leads[1].id },
    { title: 'Закрыть акт по кофейне «Бариста»', dueAt: dayAt(2), refType: 'order', refId: orders[8].id },
  ].map((task) => normalizeTask(task));

  db.clients.push(...clients);
  db.leads.push(...leads);
  db.payments.push(...payments);
  db.expenses.push(...expenses);
  db.tasks.push(...tasks);
  db.settings.demo = true;
  logActivity('system', 'Загружены демонстрационные данные');
  saveDb(true);
}

// ─────────────────────────────────────────────────────────────── API

function snapshot() {
  return {
    ok: true,
    version: VERSION,
    profile: db.profile,
    settings: db.settings,
    counters: db.counters,
    clients: db.clients,
    leads: db.leads,
    orders: db.orders,
    payments: db.payments,
    expenses: db.expenses,
    tasks: db.tasks,
    activity: db.activity,
    today: new Date().toISOString(),
  };
}

function recomputeOrder(orderId) {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return;
  const paid = db.payments.filter((p) => p.orderId === orderId).reduce((sum, p) => sum + p.amount, 0);
  const full = order.amount > 0 && paid >= order.amount;
  if (full && ['done', 'install', 'materials', 'measure', 'new'].includes(order.status)) {
    order.paidAt = order.paidAt || nowIso();
  }
  if (!full) order.paidAt = '';
  order.updatedAt = nowIso();
}

function findClientForLead(lead) {
  if (lead.clientId) {
    const existing = db.clients.find((c) => c.id === lead.clientId);
    if (existing) return existing;
  }
  const phone = String(lead.phone || '').replace(/\D/g, '');
  if (phone) {
    const byPhone = db.clients.find((c) => String(c.phone || '').replace(/\D/g, '') === phone);
    if (byPhone) return byPhone;
  }
  return null;
}

const routes = [];
function route(method, pattern, handler, options = {}) {
  const keys = [];
  const regex = new RegExp(`^${pattern.replace(/\/:([a-zA-Z]+)/g, (_, key) => {
    keys.push(key);
    return '/([^/]+)';
  })}$`);
  routes.push({ method, regex, keys, handler, public: Boolean(options.public) });
}

function matchRoute(method, pathname) {
  for (const item of routes) {
    if (item.method !== method) continue;
    const match = item.regex.exec(pathname);
    if (match) {
      const params = {};
      item.keys.forEach((key, index) => { params[key] = decodeURIComponent(match[index + 1]); });
      return { route: item, params };
    }
  }
  return null;
}

// ── авторизация

route('GET', '/api/auth/status', async (req, res) => {
  const session = req.crmSession || readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  sendJson(res, 200, {
    ok: true,
    needsSetup: !db.auth,
    authenticated: Boolean(session),
    profile: db.profile,
    version: VERSION,
  });
}, { public: true });

route('POST', '/api/auth/setup', async (req, res) => {
  if (db.auth) return fail(res, 400, 'Пароль уже установлен');
  const body = await readBody(req);
  const password = str(body.password, 200);
  if (password.length < 6) return fail(res, 400, 'Пароль должен быть не короче 6 символов');
  db.auth = { ...hashPassword(password), createdAt: nowIso() };
  db.profile.name = str(body.name, 80) || 'Руководитель';
  const token = signSession({ u: 'owner', exp: Date.now() + SESSION_TTL });
  setSessionCookie(res, req, token, true);
  saveDb(true);
  logActivity('system', 'CRM активирована, установлен пароль');
  sendJson(res, 200, { ok: true, ...snapshot() });
}, { public: true });

route('POST', '/api/auth/login', async (req, res) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) return fail(res, 429, 'Слишком много попыток. Подождите 10 минут.');
  if (!db.auth) return fail(res, 400, 'Сначала задайте пароль');
  const body = await readBody(req);
  if (!verifyPassword(str(body.password, 200), db.auth)) {
    logActivity('system', 'Неудачная попытка входа');
    return fail(res, 401, 'Неверный пароль');
  }
  const token = signSession({ u: 'owner', exp: Date.now() + SESSION_TTL });
  setSessionCookie(res, req, token, Boolean(body.remember));
  sendJson(res, 200, { ok: true, ...snapshot() });
}, { public: true });

route('POST', '/api/auth/logout', async (req, res) => {
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
});

route('POST', '/api/auth/password', async (req, res) => {
  const body = await readBody(req);
  if (!db.auth || !verifyPassword(str(body.current, 200), db.auth)) return fail(res, 400, 'Текущий пароль неверен');
  const next = str(body.password, 200);
  if (next.length < 6) return fail(res, 400, 'Пароль должен быть не короче 6 символов');
  db.auth = { ...hashPassword(next), createdAt: nowIso() };
  saveDb(true);
  sendJson(res, 200, { ok: true });
});

// ── данные

route('GET', '/api/data', async (req, res) => {
  sendJson(res, 200, snapshot());
});

route('GET', '/api/bootstrap', async (req, res) => {
  sendJson(res, 200, { ok: true, version: VERSION, profile: db.profile, settings: db.settings, counters: db.counters });
});

// клиенты
route('POST', '/api/clients', async (req, res) => {
  const body = await readBody(req);
  const client = normalizeClient(body);
  db.clients.unshift(client);
  logActivity('client', `Добавлен клиент ${client.name}`, client.id);
  saveDb();
  sendJson(res, 201, { ok: true, item: client, ...snapshot() });
});

route('PATCH', '/api/clients/:id', async (req, res, params) => {
  const current = db.clients.find((c) => c.id === params.id);
  if (!current) return fail(res, 404, 'Клиент не найден');
  const body = await readBody(req);
  const updated = normalizeClient(body, current);
  Object.assign(current, updated);
  saveDb();
  sendJson(res, 200, { ok: true, item: current, ...snapshot() });
});

route('DELETE', '/api/clients/:id', async (req, res, params) => {
  const index = db.clients.findIndex((c) => c.id === params.id);
  if (index < 0) return fail(res, 404, 'Клиент не найден');
  const [removed] = db.clients.splice(index, 1);
  logActivity('client', `Удалён клиент ${removed.name}`, removed.id);
  saveDb();
  sendJson(res, 200, { ok: true, ...snapshot() });
});

// лиды
route('POST', '/api/leads', async (req, res) => {
  const body = await readBody(req);
  const lead = normalizeLead(body);
  db.leads.unshift(lead);
  logActivity('lead', `Новый лид: ${lead.name}`, lead.id);
  saveDb();
  sendJson(res, 201, { ok: true, item: lead, ...snapshot() });
});

route('PATCH', '/api/leads/:id', async (req, res, params) => {
  const current = db.leads.find((l) => l.id === params.id);
  if (!current) return fail(res, 404, 'Лид не найден');
  const body = await readBody(req);
  const previousStatus = current.status;
  Object.assign(current, normalizeLead(body, current));
  if (previousStatus !== current.status) {
    logActivity('lead', `Лид ${current.name}: ${previousStatus} → ${current.status}`, current.id);
  }
  saveDb();
  sendJson(res, 200, { ok: true, item: current, ...snapshot() });
});

route('DELETE', '/api/leads/:id', async (req, res, params) => {
  const index = db.leads.findIndex((l) => l.id === params.id);
  if (index < 0) return fail(res, 404, 'Лид не найден');
  const [removed] = db.leads.splice(index, 1);
  logActivity('lead', `Удалён лид ${removed.name}`, removed.id);
  saveDb();
  sendJson(res, 200, { ok: true, ...snapshot() });
});

route('POST', '/api/leads/:id/convert', async (req, res, params) => {
  const lead = db.leads.find((l) => l.id === params.id);
  if (!lead) return fail(res, 404, 'Лид не найден');
  const body = await readBody(req);

  let client = findClientForLead(lead);
  if (!client) {
    client = normalizeClient({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      source: lead.source,
      note: `Создан из лида от ${new Date(lead.createdAt).toLocaleDateString('ru-RU')}`,
    });
    db.clients.unshift(client);
  }

  const service = db.settings.services.find((s) => s.id === lead.serviceId);
  const area = num(lead.area, 0);
  const amount = num(body.amount, lead.estimate) || (service && area ? service.price * area : 0);

  const order = normalizeOrder({
    title: body.title || (service ? `${service.name}${area ? `, ${area} м²` : ''}` : `Заказ по лиду ${lead.name}`),
    clientId: client.id,
    leadId: lead.id,
    serviceId: lead.serviceId,
    area,
    amount,
    cost: num(body.cost, 0),
    status: 'new',
    address: lead.address,
    deadline: body.deadline,
    note: lead.comment,
  });
  db.orders.unshift(order);

  lead.status = 'won';
  lead.clientId = client.id;
  lead.convertedOrderId = order.id;
  lead.updatedAt = nowIso();

  logActivity('order', `Лид «${lead.name}» → заказ ${order.number}`, order.id);
  saveDb(true);
  sendJson(res, 200, { ok: true, order, client, ...snapshot() });
});

// заказы
route('POST', '/api/orders', async (req, res) => {
  const body = await readBody(req);
  const order = normalizeOrder(body);
  db.orders.unshift(order);
  logActivity('order', `Создан заказ ${order.number}`, order.id);
  saveDb();
  sendJson(res, 201, { ok: true, item: order, ...snapshot() });
});

route('PATCH', '/api/orders/:id', async (req, res, params) => {
  const current = db.orders.find((o) => o.id === params.id);
  if (!current) return fail(res, 404, 'Заказ не найден');
  const body = await readBody(req);
  const previousStatus = current.status;
  Object.assign(current, normalizeOrder(body, current));
  if (previousStatus !== current.status) {
    logActivity('order', `Заказ ${current.number}: ${previousStatus} → ${current.status}`, current.id);
  }
  saveDb();
  sendJson(res, 200, { ok: true, item: current, ...snapshot() });
});

route('DELETE', '/api/orders/:id', async (req, res, params) => {
  const index = db.orders.findIndex((o) => o.id === params.id);
  if (index < 0) return fail(res, 404, 'Заказ не найден');
  const [removed] = db.orders.splice(index, 1);
  db.payments = db.payments.filter((p) => p.orderId !== removed.id);
  logActivity('order', `Удалён заказ ${removed.number}`, removed.id);
  saveDb();
  sendJson(res, 200, { ok: true, ...snapshot() });
});

// платежи
route('POST', '/api/payments', async (req, res) => {
  const body = await readBody(req);
  const payment = normalizePayment(body);
  db.payments.unshift(payment);
  recomputeOrder(payment.orderId);
  const order = db.orders.find((o) => o.id === payment.orderId);
  logActivity('payment', `Оплата ${payment.amount.toLocaleString('ru-RU')} ₽ — ${order?.number || ''}`, payment.id);
  saveDb();
  sendJson(res, 201, { ok: true, item: payment, ...snapshot() });
});

route('PATCH', '/api/payments/:id', async (req, res, params) => {
  const current = db.payments.find((p) => p.id === params.id);
  if (!current) return fail(res, 404, 'Платёж не найден');
  const body = await readBody(req);
  const updated = normalizePayment(body, current);
  Object.assign(current, updated);
  recomputeOrder(current.orderId);
  saveDb();
  sendJson(res, 200, { ok: true, item: current, ...snapshot() });
});

route('DELETE', '/api/payments/:id', async (req, res, params) => {
  const index = db.payments.findIndex((p) => p.id === params.id);
  if (index < 0) return fail(res, 404, 'Платёж не найден');
  const [removed] = db.payments.splice(index, 1);
  recomputeOrder(removed.orderId);
  saveDb();
  sendJson(res, 200, { ok: true, ...snapshot() });
});

// расходы
route('POST', '/api/expenses', async (req, res) => {
  const body = await readBody(req);
  const expense = normalizeExpense(body);
  db.expenses.unshift(expense);
  logActivity('expense', `Расход ${expense.amount.toLocaleString('ru-RU')} ₽ — ${expense.category}`, expense.id);
  saveDb();
  sendJson(res, 201, { ok: true, item: expense, ...snapshot() });
});

route('DELETE', '/api/expenses/:id', async (req, res, params) => {
  const index = db.expenses.findIndex((e) => e.id === params.id);
  if (index < 0) return fail(res, 404, 'Расход не найден');
  db.expenses.splice(index, 1);
  saveDb();
  sendJson(res, 200, { ok: true, ...snapshot() });
});

// задачи
route('POST', '/api/tasks', async (req, res) => {
  const body = await readBody(req);
  const task = normalizeTask(body);
  db.tasks.unshift(task);
  saveDb();
  sendJson(res, 201, { ok: true, item: task, ...snapshot() });
});

route('PATCH', '/api/tasks/:id', async (req, res, params) => {
  const current = db.tasks.find((t) => t.id === params.id);
  if (!current) return fail(res, 404, 'Задача не найдена');
  const body = await readBody(req);
  Object.assign(current, normalizeTask(body, current));
  saveDb();
  sendJson(res, 200, { ok: true, item: current, ...snapshot() });
});

route('DELETE', '/api/tasks/:id', async (req, res, params) => {
  const index = db.tasks.findIndex((t) => t.id === params.id);
  if (index < 0) return fail(res, 404, 'Задача не найдена');
  db.tasks.splice(index, 1);
  saveDb();
  sendJson(res, 200, { ok: true, ...snapshot() });
});

// настройки
route('PATCH', '/api/settings', async (req, res) => {
  const body = await readBody(req);
  const settings = db.settings;
  if (body.company && typeof body.company === 'object') {
    for (const key of Object.keys(settings.company)) {
      if (key in body.company) settings.company[key] = str(body.company[key], 200);
    }
  }
  if (Array.isArray(body.services)) {
    settings.services = body.services.slice(0, 60).map((service, index) => ({
      id: str(service.id, 40) || `sv_${Date.now()}_${index}`,
      name: str(service.name, 120),
      price: num(service.price, 0),
      unit: str(service.unit, 10) || 'м²',
      active: service.active !== false,
    })).filter((service) => service.name);
  }
  if (Array.isArray(body.sources)) {
    settings.sources = body.sources.map((s) => str(s, 40)).filter(Boolean).slice(0, 30);
  }
  if (Array.isArray(body.expenseCategories)) {
    settings.expenseCategories = body.expenseCategories.map((s) => str(s, 40)).filter(Boolean).slice(0, 30);
  }
  if (typeof body.demo === 'boolean') settings.demo = body.demo;
  if (typeof body.onboarded === 'boolean') settings.onboarded = body.onboarded;
  if (body.siteImport && typeof body.siteImport === 'object') {
    settings.siteImport = {
      url: str(body.siteImport.url, 300),
      token: str(body.siteImport.token, 300),
    };
  }
  if (body.leadToken) settings.leadToken = str(body.leadToken, 100);
  if (body.profile && typeof body.profile === 'object') {
    db.profile.name = str(body.profile.name, 80) || db.profile.name;
  }
  saveDb(true);
  sendJson(res, 200, { ok: true, ...snapshot() });
});

route('POST', '/api/settings/rotate-token', async (req, res) => {
  db.settings.leadToken = crypto.randomBytes(18).toString('hex');
  saveDb(true);
  sendJson(res, 200, { ok: true, ...snapshot() });
});

// демо
route('POST', '/api/demo/clear', async (req, res) => {
  const keepAuth = db.auth;
  const keepSettings = { ...db.settings, demo: false, leadToken: db.settings.leadToken };
  const fresh = emptyDb();
  db = { ...fresh, auth: keepAuth, settings: { ...keepSettings }, profile: db.profile, activity: [] };
  saveDb(true);
  sendJson(res, 200, { ok: true, ...snapshot() });
});

route('POST', '/api/demo/seed', async (req, res) => {
  if (db.orders.length || db.leads.length) return fail(res, 400, 'В базе уже есть данные');
  demoSeed();
  sendJson(res, 200, { ok: true, ...snapshot() });
});

// публичный приём лидов с сайта
route('POST', '/api/public/lead', async (req, res) => {
  const body = await readBody(req);
  const token = req.headers['x-api-key'] || body.token;
  if (!safeEqual(token, db.settings.leadToken)) return fail(res, 401, 'Неверный ключ интеграции');

  const phone = str(body.phone, 40);
  if (!str(body.name, 120) || !phone) return fail(res, 400, 'Нужны имя и телефон');
  if (!/^\+?\d{10,15}$/.test(phone.replace(/[\s\-()]/g, ''))) return fail(res, 400, 'Неверный телефон');

  const lead = normalizeLead({
    name: str(body.name, 120),
    phone,
    email: str(body.email, 160),
    source: str(body.source, 40) || 'Сайт',
    serviceId: str(body.serviceId, 40),
    area: num(body.area, 0),
    estimate: num(body.estimate ?? body.priceMax, 0),
    comment: [str(body.subject, 160), str(body.message, 2000)].filter(Boolean).join('\n'),
    address: str(body.address, 240),
    externalId: str(body.externalId ?? body.id, 120),
  });
  db.leads.unshift(lead);
  logActivity('lead', `Заявка с сайта: ${lead.name}`, lead.id);
  saveDb(true);
  sendJson(res, 201, { ok: true, id: lead.id });
}, { public: true });

route('OPTIONS', '/api/public/lead', async (req, res) => {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Max-Age': '86400',
  });
  res.end();
}, { public: true });

// импорт с сайта
route('POST', '/api/import/site', async (req, res) => {
  const { url, token } = db.settings.siteImport || {};
  if (!url || !token) return fail(res, 400, 'Заполните адрес сайта и токен в настройках');
  let endpoint;
  try {
    endpoint = new URL('/api/leads', url).toString();
  } catch {
    return fail(res, 400, 'Некорректный адрес сайта');
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return fail(res, 502, `Сайт ответил ${response.status}`);
    const payload = await response.json();
    const incoming = Array.isArray(payload.leads) ? payload.leads : [];
    let added = 0;
    for (const raw of incoming) {
      const externalId = str(raw.id, 120);
      if (!externalId) continue;
      if (db.leads.some((lead) => lead.externalId === externalId)) continue;
      const calc = raw.calculatorData && typeof raw.calculatorData === 'object' ? raw.calculatorData : {};
      const lead = normalizeLead({
        name: str(raw.name, 120) || 'Без имени',
        phone: str(raw.phone, 40),
        email: str(raw.email, 160),
        source: 'Сайт',
        area: num(calc.area, 0),
        estimate: num(calc.priceMax, 0),
        comment: [str(raw.subject, 160), str(raw.message, 2000)].filter(Boolean).join('\n'),
        externalId,
        createdAt: isoDate(raw.createdAt) || nowIso(),
      });
      db.leads.push(lead);
      added += 1;
    }
    if (added) logActivity('lead', `Импортировано заявок с сайта: ${added}`);
    saveDb(true);
    sendJson(res, 200, { ok: true, added, total: incoming.length, ...snapshot() });
  } catch (error) {
    return fail(res, 502, `Не удалось получить заявки: ${error.message}`);
  }
});

// экспорт CSV
const exportMap = {
  clients: {
    filename: 'clients',
    columns: [['name', 'Клиент'], ['phone', 'Телефон'], ['email', 'Email'], ['company', 'Компания'], ['address', 'Адрес'], ['source', 'Источник'], ['createdAt', 'Создан']],
  },
  leads: {
    filename: 'leads',
    columns: [['createdAt', 'Дата'], ['name', 'Имя'], ['phone', 'Телефон'], ['email', 'Email'], ['source', 'Источник'], ['status', 'Статус'], ['area', 'Площадь'], ['estimate', 'Оценка'], ['comment', 'Комментарий']],
  },
  orders: {
    filename: 'orders',
    columns: [['number', 'Номер'], ['createdAt', 'Создан'], ['title', 'Название'], ['amount', 'Сумма'], ['cost', 'Себестоимость'], ['status', 'Статус'], ['deadline', 'Дедлайн'], ['address', 'Адрес']],
  },
  payments: {
    filename: 'payments',
    columns: [['date', 'Дата'], ['amount', 'Сумма'], ['method', 'Способ'], ['note', 'Комментарий']],
  },
  expenses: {
    filename: 'expenses',
    columns: [['date', 'Дата'], ['category', 'Категория'], ['amount', 'Сумма'], ['note', 'Комментарий']],
  },
};

route('GET', '/api/export/:entity', async (req, res, params) => {
  const config = exportMap[params.entity];
  if (!config) return fail(res, 404, 'Неизвестный экспорт');
  const rows = (db[params.entity] || []).map((item) => config.columns.map(([key]) => item[key]).join(';'));
  const header = config.columns.map(([, label]) => label).join(';');
  const csv = `\uFEFF${[header, ...rows].join('\r\n')}`;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${config.filename}-${dayKey()}.csv"`,
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(csv),
  });
  res.end(csv);
});

route('GET', '/api/backup', async (req, res) => {
  const body = JSON.stringify(db, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="plenkin-crm-backup-${dayKey()}.json"`,
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
});

route('GET', '/api/health', async (req, res) => {
  sendJson(res, 200, { ok: true, version: VERSION, uptime: Math.round(process.uptime()), orders: db.orders.length, leads: db.leads.length });
}, { public: true });

// ─────────────────────────────────────────────────────────────── статика

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(path.resolve(PUBLIC_DIR))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      if (!path.extname(relative)) {
        return serveStatic(req, res, '/index.html');
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Не найдено');
    }
    const ext = path.extname(filePath).toLowerCase();
    const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60',
      ETag: etag,
      'Last-Modified': stat.mtime.toUTCString(),
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ─────────────────────────────────────────────────────────────── сервер

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'"
  );

  try {
    if (pathname.startsWith('/api/')) {
      const matched = matchRoute(req.method, pathname);
      if (!matched) return fail(res, 404, 'Метод не найден');

      if (pathname === '/api/public/lead') {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }

      const session = readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
      req.crmSession = session;
      if (!matched.route.public && !session) return fail(res, 401, 'Требуется вход');

      // защита от CSRF: Origin должен совпадать с хостом
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.headers.origin;
        if (origin) {
          try {
            if (new URL(origin).host !== req.headers.host) return fail(res, 403, 'Запрос с чужого источника');
          } catch {
            return fail(res, 403, 'Некорректный Origin');
          }
        }
      }

      await matched.route.handler(req, res, matched.params);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[api]', req.method, pathname, error);
    if (!res.headersSent) fail(res, status, error.message || 'Внутренняя ошибка');
  } finally {
    if (process.env.CRM_LOG === '1') {
      console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }
});

function localAddresses() {
  const out = [];
  for (const items of Object.values(os.networkInterfaces())) {
    for (const item of items || []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address);
    }
  }
  return out;
}

function start(port, attempt = 0) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attempt < 10) {
      console.log(`Порт ${port} занят, пробую ${port + 1}…`);
      start(port + 1, attempt + 1);
      return;
    }
    console.error('Не удалось запустить сервер:', error.message);
    process.exit(1);
  });
  server.listen(port, '0.0.0.0', () => {
    backupDaily();
    const lan = localAddresses();
    console.log('');
    console.log('  ПЛЕНКИН · CRM  v' + VERSION);
    console.log('  ──────────────────────────────────────────');
    console.log(`  Локально:   http://localhost:${port}`);
    for (const ip of lan) console.log(`  По сети:    http://${ip}:${port}`);
    console.log(`  Данные:     ${DB_FILE}`);
    console.log(`  Пароль:     ${db.auth ? 'установлен' : 'задайте при первом входе'}`);
    console.log('  ──────────────────────────────────────────');
    console.log('  Остановить: Ctrl + C');
    console.log('');

    if (process.argv.includes('--open')) {
      const { exec } = require('node:child_process');
      const url = `http://localhost:${port}`;
      setTimeout(() => {
        if (process.platform === 'win32') exec(`start "" "${url}"`);
        else if (process.platform === 'darwin') exec(`open "${url}"`);
        else exec(`xdg-open "${url}"`);
      }, 700);
    }
  });
}

ensureDirs();
loadDb();
start(PORT);
