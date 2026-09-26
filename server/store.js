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
    users: [],
    clients: [],
    deals: [],
    deal_lines: [],
    deal_payments: [],
    installer_accruals: [],
    installer_payouts: [],
    deal_addresses: [],
  };
}

function seed(data) {
  if (data.users.length) return;
  const defaults = [
    { login: 'owner', password: 'plenkin2026', name: 'Владелец', role: 'owner' },
    { login: 'manager', password: 'manager2026', name: 'Менеджер', role: 'manager' },
    { login: 'installer', password: 'montage2026', name: 'Монтажник', role: 'installer' },
  ];
  for (const u of defaults) {
    data.users.push({
      id: uuid(),
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

function load() {
  const p = dataPath();
  if (globalThis.__plenkinDb) return globalThis.__plenkinDb;
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      globalThis.__plenkinDb = data;
      return data;
    } catch {}
  }
  const data = empty();
  seed(data);
  globalThis.__plenkinDb = data;
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2)); } catch {}
  return data;
}

function save(data) {
  globalThis.__plenkinDb = data;
  try { fs.writeFileSync(dataPath(), JSON.stringify(data, null, 2)); } catch {}
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

module.exports = { get, write, dataPath };
