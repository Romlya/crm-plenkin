const crypto = require('crypto');
const { verifyPassword } = require('./pass');
const store = require('./store');
const SECRET = process.env.CRM_JWT_SECRET || 'plenkin-crm-change-me-in-production-2026';
const COOKIE = 'plenkin_token';
const STAGES = [
  { id: 'lead', title: 'Заявка' },
  { id: 'measure', title: 'Замер' },
  { id: 'kp', title: 'КП' },
  { id: 'contract', title: 'Договор' },
  { id: 'install', title: 'Монтаж' },
  { id: 'done', title: 'Закрыто' },
  { id: 'reject', title: 'Отказ' },
];
const sign = (u) => {
  const p = Buffer.from(JSON.stringify({ id: u.id, role: u.role, name: u.name, login: u.login, exp: Date.now() + 14 * 864e5 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
};
const verify = (t) => {
  if (!t) return null;
  const [p, s] = String(t).split('.');
  if (!p || !s) return null;
  if (s !== crypto.createHmac('sha256', SECRET).update(p).digest('base64url')) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp < Date.now() ? null : d;
  } catch (e) { return null; }
};
const cookies = (h) => {
  const o = {};
  String(h || '').split(';').forEach((part) => {
    const [k, ...v] = part.trim().split('=');
    if (k) o[k] = decodeURIComponent(v.join('='));
  });
  return o;
};
const json = (res, status, data, hdrs) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (hdrs) Object.keys(hdrs).forEach((k) => res.setHeader(k, hdrs[k]));
  res.end(JSON.stringify(data));
};
const body = async (req) => {
  if (req.body != null) {
    if (typeof req.body === 'object') return req.body;
    try { return JSON.parse(String(req.body) || '{}'); } catch (e) { return {}; }
  }
  return new Promise((resolve) => {
    const ch = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { resolve(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch (e) { resolve({}); }
    };
    req.on('data', (c) => ch.push(c));
    req.on('end', finish);
    req.on('error', () => { done = true; resolve({}); });
    setTimeout(finish, 2500);
  });
};
function auth(req) {
  // Auth disabled for now — single user mode (owner)
  const u = store.get().users.find((x) => x.role === 'owner' && x.active) || store.get().users[0];
  if (!u) return { id: 'local', login: 'owner', name: 'Владелец', role: 'owner' };
  return { id: u.id, login: u.login, name: u.name, role: u.role };
}
function moneyDeal(dealId) {
  const db = store.get();
  const lines = db.deal_lines.filter((l) => l.deal_id === dealId);
  let film = 0, total = 0;
  for (let i = 0; i < lines.length; i++) {
    film += (Number(lines[i].cost_price) || 0) * (Number(lines[i].qty) || 0);
    total += (Number(lines[i].sell_price) || 0) * (Number(lines[i].qty) || 0);
  }
  const deal = db.deals.find((d) => d.id === dealId);
  const inst = Number(deal && deal.install_cost) || 0;
  const other = Number(deal && deal.other_cost) || 0;
  const paid = db.deal_payments.filter((p) => p.deal_id === dealId).reduce((s, p) => s + Number(p.amount), 0);
  const acc = db.installer_accruals.filter((a) => a.deal_id === dealId).reduce((s, a) => s + Number(a.amount), 0);
  return { film_cost: film, install_cost: inst, other_cost: other, installer_accruals: acc, client_total: total, paid_amount: paid, profit: total - film - inst - other - acc, balance: total - paid };
}

module.exports = async function handler(req, res) {
  try {
    const rawUrl = req.url || '/';
    let qs = {};
    try { qs = Object.fromEntries(new URL(rawUrl, 'http://x').searchParams); } catch (e) {}
    let p = rawUrl.split('?')[0];
    if (qs.__p) p = '/api/' + String(qs.__p).replace(/^\/+/, '');
    if (p.indexOf('/api') !== 0) p = '/api' + (p.charAt(0) === '/' ? p : '/' + p);
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      return res.end();
    }

    if (method === 'POST' && p.indexOf('/api/login') === 0) {
      const u = store.get().users.find((x) => x.role === 'owner' && x.active) || store.get().users[0];
      const session = u ? { id: u.id, login: u.login, name: u.name, role: u.role } : { id: 'local', login: 'owner', name: 'Владелец', role: 'owner' };
      return json(res, 200, { user: session });
    }
    if (method === 'POST' && p.indexOf('/api/logout') === 0) {
      return json(res, 200, { ok: true });
    }

    const user = auth(req);
    if (!user) return json(res, 401, { error: 'Требуется вход' });
    if (method === 'GET' && p.indexOf('/api/me') === 0) return json(res, 200, { user: user, stages: STAGES });

    if (method === 'GET' && p.indexOf('/api/board') === 0) {
      const db = store.get();
      const deals = db.deals.map((d) => {
        const o = Object.assign({}, d);
        const cl = db.clients.find((c) => c.id === d.client_id);
        const mg = db.users.find((u) => u.id === d.manager_id);
        const ins = db.users.find((u) => u.id === d.installer_id);
        o.client_name = cl ? cl.name : '';
        o.manager_name = mg ? mg.name : '';
        o.installer_name = ins ? ins.name : '';
        o.money = moneyDeal(d.id);
        return o;
      });
      return json(res, 200, { stages: STAGES, deals: deals });
    }

    if (method === 'GET' && p.indexOf('/api/clients') === 0) return json(res, 200, { clients: store.get().clients });
    if (method === 'GET' && p.indexOf('/api/materials') === 0) return json(res, 200, { materials: store.get().materials });
    if (method === 'GET' && p.indexOf('/api/company') === 0) return json(res, 200, { company: store.get().company });
    if (method === 'GET' && p.indexOf('/api/users') === 0) {
      return json(res, 200, { users: store.get().users.map((u) => ({ id: u.id, login: u.login, name: u.name, role: u.role, phone: u.phone, active: u.active })) });
    }
    if (method === 'GET' && p.indexOf('/api/schedule') === 0) {
      const db = store.get();
      const now = new Date().toISOString().slice(0, 10);
      const items = [];
      for (let i = 0; i < db.deals.length; i++) {
        const d = db.deals[i];
        const cl = db.clients.find((c) => c.id === d.client_id);
        const cn = cl ? cl.name : '';
        if (d.measure_date && d.measure_date >= now) items.push({ type: 'measure', date: d.measure_date, deal: d, client_name: cn });
        if (d.install_date && d.install_date >= now) items.push({ type: 'install', date: d.install_date, deal: d, client_name: cn });
      }
      items.sort((a, b) => a.date.localeCompare(b.date));
      return json(res, 200, { items: items });
    }
    if (method === 'GET' && p.indexOf('/api/finance') === 0) {
      return json(res, 200, { revenue: 0, cost: 0, paid: 0, expenses: 0, profit: 0, deals_count: 0, expense_list: [] });
    }
    if (method === 'GET' && p.indexOf('/api/installers/balances') === 0) {
      const db = store.get();
      const balances = db.users.filter((u) => u.role === 'installer').map((u) => {
        const acc = db.installer_accruals.filter((a) => a.installer_id === u.id).reduce((s, a) => s + Number(a.amount), 0);
        const pay = db.installer_payouts.filter((p) => p.installer_id === u.id).reduce((s, p) => s + Number(p.amount), 0);
        return { id: u.id, name: u.name, accrued: acc, paid: pay, balance: acc - pay };
      });
      return json(res, 200, { balances: balances });
    }
    if (method === 'GET' && p.indexOf('/api/search') === 0) {
      return json(res, 200, { clients: [], deals: [] });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error: ' + (e && e.message || 'unknown') });
  }
};
