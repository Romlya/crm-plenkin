const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword } = require('./pass');

const isVercel = !!process.env.VERCEL;

function dataPath() {
  if (isVercel) return path.join('/tmp', 'plenkin-crm.json');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return process.env.CRM_DB_PATH || path.join(dataDir, 'plenkin.json');
}

function empty() {
  return {
    users: [],
    clients: [],
    deals: [],
    deal_lines: [],
    deal_payments: [],
    installer_accruals: [],
    installer_payouts: [],
    deal_addresses: [],
    materials: [],
    expenses: [],
    tasks: [],
    company: {
      name: 'ПЛЕНКИН',
      phone: '',
      email: 'plenkininfo@yandex.ru',
      address: '',
      inn: '',
    },
  };
}

function seed(data) {
  if (!data.materials) data.materials = [];
  if (!data.expenses) data.expenses = [];
  if (!data.tasks) data.tasks = [];
  if (!data.company) {
    data.company = { name: 'ПЛЕНКИН', phone: '', email: 'plenkininfo@yandex.ru', address: '', inn: '' };
  }

  if (!data.users.length) {
    const defaults = [
      { login: 'owner', password: 'plenkin2026', name: 'Владелец', role: 'owner' },
      { login: 'manager', password: 'manager2026', name: 'Менеджер', role: 'manager' },
      { login: 'installer', password: 'montage2026', name: 'Монтажник', role: 'installer' },
    ];
    for (const u of defaults) {
      data.users.push({
        id: crypto.randomUUID(),
        login: u.login,
        password_hash: hashPassword(u.password),
        name: u.name,
        role: u.role,
        phone: '',
        active: 1,
        created_at: new Date().toISOString(),
      });
    }
  }

  if (!data.materials.length) {
    const mats = [
      { title: 'SF300 CL (300 мкм)', unit: 'м²', cost_price: 900, sell_price: 1500, category: 'защита', stock_qty: 50 },
      { title: 'USB Bronze 15', unit: 'м²', cost_price: 450, sell_price: 1900, category: 'солнце', stock_qty: 80 },
      { title: 'ClearBlue / Nanoceramic 7080', unit: 'м²', cost_price: 700, sell_price: 2400, category: 'атермальная', stock_qty: 40 },
      { title: 'Silver Bronze', unit: 'м²', cost_price: 300, sell_price: 2000, category: 'солнце', stock_qty: 60 },
      { title: 'TN Titanium 50', unit: 'м²', cost_price: 300, sell_price: 2000, category: 'солнце', stock_qty: 55 },
      { title: 'Матовая декоративная', unit: 'м²', cost_price: 250, sell_price: 1200, category: 'декор', stock_qty: 30 },
      { title: 'Монтаж', unit: 'м²', cost_price: 0, sell_price: 1700, category: 'работа', stock_qty: 0 },
    ];
    for (const m of mats) {
      data.materials.push({
        id: crypto.randomUUID(),
        ...m,
        active: 1,
        created_at: new Date().toISOString(),
      });
    }
  } else {
    for (const m of data.materials) {
      if (m.stock_qty === undefined) m.stock_qty = 0;
    }
  }

  for (const d of data.deals || []) {
    if (d.measure_date === undefined) d.measure_date = '';
    if (d.install_date === undefined) d.install_date = '';
    if (d.source === undefined) d.source = 'manual';
  }
}

function load() {
  const p = dataPath();
  if (globalThis.__plenkinDb) {
    seed(globalThis.__plenkinDb);
    return globalThis.__plenkinDb;
  }
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      seed(data);
      globalThis.__plenkinDb = data;
      return data;
    } catch {}
  }
  const data = empty();
  seed(data);
  globalThis.__plenkinDb = data;
  try {
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  } catch {}
  return data;
}

function save(data) {
  globalThis.__plenkinDb = data;
  try {
    fs.writeFileSync(dataPath(), JSON.stringify(data, null, 2));
  } catch {}
}

function get() {
  return load();
}

function write(mutator) {
  const data = load();
  mutator(data);
  save(data);
  return data;
}

module.exports = { get, write, dataPath, uuid: () => crypto.randomUUID() };
