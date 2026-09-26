const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword } = require('./pass');

const uuid = () => crypto.randomUUID();
const isVercel = !!process.env.VERCEL;

function dataPath() {
  if (isVercel) return path.join('/tmp', 'plenkin-crm.json');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return process.env.CRM_DB_PATH || path.join(dataDir, 'plenkin.json');
}

function empty() {
  return {
    users: [], clients: [], deals: [], deal_lines: [], deal_payments: [],
    installer_accruals: [], installer_payouts: [], deal_addresses: [],
    materials: [], expenses: [],
    company: { name: '\u041f\u041b\u0415\u041d\u041a\u0418\u041d', phone: '', email: 'plenkininfo@yandex.ru', address: '', inn: '' },
  };
}

function seed(data) {
  if (!data.materials) data.materials = [];
  if (!data.expenses) data.expenses = [];
  if (!data.company) data.company = { name: '\u041f\u041b\u0415\u041d\u041a\u0418\u041d', phone: '', email: 'plenkininfo@yandex.ru', address: '', inn: '' };
  if (!data.users.length) {
    const defaults = [
      { login: 'owner', password: 'plenkin2026', name: '\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446', role: 'owner' },
      { login: 'manager', password: 'manager2026', name: '\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440', role: 'manager' },
      { login: 'installer', password: 'montage2026', name: '\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a', role: 'installer' },
    ];
    for (const u of defaults) {
      data.users.push({ id: uuid(), login: u.login, password_hash: hashPassword(u.password), name: u.name, role: u.role, phone: '', active: 1, created_at: new Date().toISOString() });
    }
  }
  if (!data.materials.length) {
    const mats = [
      { title: 'SF300 CL (300 \u043c\u043a\u043c)', unit: '\u043c\u00b2', cost_price: 900, sell_price: 1500, category: '\u0437\u0430\u0449\u0438\u0442\u0430' },
      { title: 'USB Bronze 15', unit: '\u043c\u00b2', cost_price: 450, sell_price: 1900, category: '\u0441\u043e\u043b\u043d\u0446\u0435' },
      { title: 'ClearBlue / Nanoceramic 7080', unit: '\u043c\u00b2', cost_price: 700, sell_price: 2400, category: '\u0430\u0442\u0435\u0440\u043c\u0430\u043b\u044c\u043d\u0430\u044f' },
      { title: 'Silver Bronze', unit: '\u043c\u00b2', cost_price: 300, sell_price: 2000, category: '\u0441\u043e\u043b\u043d\u0446\u0435' },
      { title: 'TN Titanium 50', unit: '\u043c\u00b2', cost_price: 300, sell_price: 2000, category: '\u0441\u043e\u043b\u043d\u0446\u0435' },
      { title: '\u041c\u0430\u0442\u043e\u0432\u0430\u044f \u0434\u0435\u043a\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u0430\u044f', unit: '\u043c\u00b2', cost_price: 250, sell_price: 1200, category: '\u0434\u0435\u043a\u043e\u0440' },
      { title: '\u041c\u043e\u043d\u0442\u0430\u0436', unit: '\u043c\u00b2', cost_price: 0, sell_price: 1700, category: '\u0440\u0430\u0431\u043e\u0442\u0430' },
    ];
    for (const m of mats) data.materials.push({ id: uuid(), ...m, active: 1, created_at: new Date().toISOString() });
  }
}

function load() {
  const p = dataPath();
  if (globalThis.__plenkinDb) { seed(globalThis.__plenkinDb); return globalThis.__plenkinDb; }
  if (fs.existsSync(p)) {
    try { const data = JSON.parse(fs.readFileSync(p, 'utf8')); seed(data); globalThis.__plenkinDb = data; return data; } catch {}
  }
  const data = empty(); seed(data); globalThis.__plenkinDb = data;
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2)); } catch {}
  return data;
}
function save(data) { globalThis.__plenkinDb = data; try { fs.writeFileSync(dataPath(), JSON.stringify(data, null, 2)); } catch {} }
function get() { return load(); }
function write(mutator) { const data = load(); mutator(data); save(data); return data; }
module.exports = { get, write, dataPath, uuid: () => crypto.randomUUID() };
