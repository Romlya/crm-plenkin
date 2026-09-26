const crypto = require('crypto');
const { verifyPassword, hashPassword } = require('./pass');
const store = require('./store');
const STAGES = [
  { id: 'lead', title: 'Заявка' },
  { id: 'measure', title: 'Замер' },
  { id: 'kp', title: 'КП' },
  { id: 'contract', title: 'Договор' },
  { id: 'install', title: 'Монтаж' },
  { id: 'done', title: 'Закрыто' },
  { id: 'reject', title: 'Отказ' },
];
const uuid = () => crypto.randomUUID();
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
function auth() {
  const u = store.get().users.find((x) => x.role === 'owner' && x.active) || store.get().users[0];
  if (!u) return { id: 'local', login: 'owner', name: 'Владелец', role: 'owner' };
  return { id: u.id, login: u.login, name: u.name, role: u.role };
}
function uname(id) {
  return (store.get().users.find((u) => u.id === id) || {}).name || '';
}
function moneyDeal(dealId) {
  const db = store.get();
  const lines = db.deal_lines.filter((l) => l.deal_id === dealId);
  let film = 0, total = 0;
  for (const l of lines) {
    film += (Number(l.cost_price) || 0) * (Number(l.qty) || 0);
    total += (Number(l.sell_price) || 0) * (Number(l.qty) || 0);
  }
  const deal = db.deals.find((d) => d.id === dealId);
  const inst = Number(deal && deal.install_cost) || 0;
  const other = Number(deal && deal.other_cost) || 0;
  const paid = db.deal_payments.filter((p) => p.deal_id === dealId).reduce((s, p) => s + Number(p.amount), 0);
  const acc = db.installer_accruals.filter((a) => a.deal_id === dealId).reduce((s, a) => s + Number(a.amount), 0);
  return {
    film_cost: film, install_cost: inst, other_cost: other, installer_accruals: acc,
    client_total: total, paid_amount: paid, profit: total - film - inst - other - acc, balance: total - paid,
  };
}
function enrichDeal(d) {
  const db = store.get();
  const cl = db.clients.find((c) => c.id === d.client_id);
  const m = moneyDeal(d.id);
  return Object.assign({}, d, {
    client_name: cl ? cl.name : '',
    client_company: cl ? (cl.company || '') : '',
    manager_name: uname(d.manager_id),
    installer_name: uname(d.installer_id),
    film_cost: m.film_cost,
    client_total: m.client_total,
    paid_amount: m.paid_amount,
    money: m,
    lines: db.deal_lines.filter((l) => l.deal_id === d.id),
    payments: db.deal_payments.filter((p) => p.deal_id === d.id),
    accruals: db.installer_accruals.filter((a) => a.deal_id === d.id).map((a) => Object.assign({}, a, { installer_name: uname(a.installer_id) })),
  });
}
function pathId(p, prefix) {
  if (p.indexOf(prefix) !== 0) return null;
  const rest = p.slice(prefix.length).replace(/^\//, '');
  if (!rest) return null;
  return rest.split('/')[0];
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

    if (method === 'POST' && p.indexOf('/api/login') === 0) return json(res, 200, { user: auth() });
    if (method === 'POST' && p.indexOf('/api/logout') === 0) return json(res, 200, { ok: true });

    const user = auth();

    if (method === 'GET' && p.indexOf('/api/me') === 0) return json(res, 200, { user: user, stages: STAGES });

    if (method === 'GET' && p.indexOf('/api/board') === 0) {
      const db = store.get();
      const board = {};
      for (const s of STAGES) board[s.id] = [];
      for (const d of db.deals) {
        const e = enrichDeal(d);
        const st = board[e.stage] ? e.stage : 'lead';
        board[st].push(e);
      }
      return json(res, 200, { stages: STAGES, board: board });
    }

    if (method === 'POST' && p === '/api/deals') {
      const b = await body(req);
      const id = uuid();
      const now = new Date().toISOString();
      const deal = {
        id, client_id: b.client_id || null,
        title: b.title || 'Новая заявка', stage: b.stage || 'lead',
        address: b.address || '', contact_name: b.contact_name || '', contact_phone: b.contact_phone || '',
        contact_email: b.contact_email || '', source: b.source || 'manual',
        manager_id: user.id, installer_id: b.installer_id || null,
        area_m2: 0, film_cost: 0, install_cost: 0, other_cost: 0, client_total: 0, paid_amount: 0,
        notes: b.notes || '', measure_notes: '', measure_date: '', install_date: '', reject_reason: '',
        created_at: now, updated_at: now,
      };
      store.write((db) => { db.deals.push(deal); });
      return json(res, 200, { id: id, deal: enrichDeal(deal) });
    }

    const dealId = pathId(p, '/api/deals');
    if (dealId && method === 'GET' && p.indexOf('/lines') < 0 && p.indexOf('/payments') < 0 && p.indexOf('/accruals') < 0) {
      const d = store.get().deals.find((x) => x.id === dealId);
      if (!d) return json(res, 404, { error: 'Не найдено' });
      return json(res, 200, { deal: enrichDeal(d) });
    }
    if (dealId && method === 'PATCH') {
      const b = await body(req);
      let found = false;
      store.write((db) => {
        const d = db.deals.find((x) => x.id === dealId);
        if (!d) return;
        found = true;
        ['title','stage','source','client_id','contact_name','contact_phone','contact_email','address',
         'installer_id','notes','measure_notes','measure_date','install_date','reject_reason','install_cost','other_cost','area_m2'
        ].forEach((f) => { if (b[f] !== undefined) d[f] = b[f]; });
        d.updated_at = new Date().toISOString();
      });
      if (!found) return json(res, 404, { error: 'Не найдено' });
      return json(res, 200, { deal: enrichDeal(store.get().deals.find((x) => x.id === dealId)) });
    }
    if (dealId && method === 'DELETE') {
      store.write((db) => {
        db.deals = db.deals.filter((x) => x.id !== dealId);
        db.deal_lines = db.deal_lines.filter((x) => x.deal_id !== dealId);
        db.deal_payments = db.deal_payments.filter((x) => x.deal_id !== dealId);
        db.installer_accruals = db.installer_accruals.filter((x) => x.deal_id !== dealId);
      });
      return json(res, 200, { ok: true });
    }
    if (dealId && method === 'PUT' && p.indexOf('/lines') >= 0) {
      const b = await body(req);
      const lines = Array.isArray(b.lines) ? b.lines : [];
      store.write((db) => {
        db.deal_lines = db.deal_lines.filter((x) => x.deal_id !== dealId);
        for (const l of lines) {
          db.deal_lines.push({
            id: uuid(), deal_id: dealId,
            title: l.title || '', qty: Number(l.qty) || 0,
            cost_price: Number(l.cost_price) || 0, sell_price: Number(l.sell_price) || 0,
            unit: l.unit || 'м²', material_id: l.material_id || null,
          });
        }
        const d = db.deals.find((x) => x.id === dealId);
        if (d) d.updated_at = new Date().toISOString();
      });
      return json(res, 200, { deal: enrichDeal(store.get().deals.find((x) => x.id === dealId)) });
    }
    if (dealId && method === 'POST' && p.indexOf('/payments') >= 0) {
      const b = await body(req);
      store.write((db) => {
        db.deal_payments.push({
          id: uuid(), deal_id: dealId, amount: Number(b.amount) || 0,
          note: b.note || '', paid_at: new Date().toISOString(), created_by: user.id,
        });
      });
      return json(res, 200, { deal: enrichDeal(store.get().deals.find((x) => x.id === dealId)) });
    }
    if (dealId && method === 'POST' && p.indexOf('/accruals') >= 0) {
      const b = await body(req);
      store.write((db) => {
        db.installer_accruals.push({
          id: uuid(), deal_id: dealId, installer_id: b.installer_id,
          amount: Number(b.amount) || 0, note: b.note || '', created_at: new Date().toISOString(),
        });
        if (b.assign) {
          const d = db.deals.find((x) => x.id === dealId);
          if (d) d.installer_id = b.installer_id;
        }
      });
      return json(res, 200, { deal: enrichDeal(store.get().deals.find((x) => x.id === dealId)) });
    }

    if (method === 'GET' && p === '/api/clients') {
      const db = store.get();
      const clients = db.clients.map((c) => {
        const deals = db.deals.filter((d) => d.client_id === c.id);
        let sum = 0;
        for (const d of deals) sum += moneyDeal(d.id).client_total;
        return Object.assign({}, c, { deals_count: deals.length, deals_sum: sum });
      });
      return json(res, 200, { clients: clients });
    }
    if (method === 'POST' && p === '/api/clients') {
      const b = await body(req);
      const id = uuid();
      const c = { id, name: b.name || '', phone: b.phone || '', email: b.email || '', company: b.company || '', inn: b.inn || '', notes: b.notes || '', created_at: new Date().toISOString() };
      store.write((db) => db.clients.push(c));
      return json(res, 200, { client: c });
    }
    const clientId = pathId(p, '/api/clients');
    if (clientId && method === 'GET') {
      const c = store.get().clients.find((x) => x.id === clientId);
      if (!c) return json(res, 404, { error: 'Не найдено' });
      const deals = store.get().deals.filter((d) => d.client_id === clientId).map(enrichDeal);
      return json(res, 200, { client: c, deals: deals });
    }
    if (clientId && method === 'PATCH') {
      const b = await body(req);
      store.write((db) => {
        const c = db.clients.find((x) => x.id === clientId);
        if (!c) return;
        ['name','phone','email','company','inn','notes'].forEach((f) => { if (b[f] !== undefined) c[f] = b[f]; });
      });
      return json(res, 200, { client: store.get().clients.find((x) => x.id === clientId) });
    }

    if (method === 'GET' && p.indexOf('/api/materials') === 0) return json(res, 200, { materials: store.get().materials });
    if (method === 'POST' && p === '/api/materials') {
      const b = await body(req);
      const m = { id: uuid(), title: b.title || '', unit: b.unit || 'м²', cost_price: Number(b.cost_price)||0, sell_price: Number(b.sell_price)||0, category: b.category||'', stock_qty: Number(b.stock_qty)||0, active: 1, created_at: new Date().toISOString() };
      store.write((db) => db.materials.push(m));
      return json(res, 200, { material: m });
    }
    const matId = pathId(p, '/api/materials');
    if (matId && method === 'PATCH') {
      const b = await body(req);
      store.write((db) => {
        const m = db.materials.find((x) => x.id === matId);
        if (!m) return;
        ['title','unit','cost_price','sell_price','category','stock_qty','active'].forEach((f) => { if (b[f] !== undefined) m[f] = b[f]; });
      });
      return json(res, 200, { material: store.get().materials.find((x) => x.id === matId) });
    }

    if (method === 'POST' && p === '/api/users') {
      const b = await body(req);
      if (!b.login || !b.password || !b.name || !b.role) return json(res, 400, { error: 'Заполните поля' });
      if (store.get().users.find((u) => u.login === b.login)) return json(res, 400, { error: 'Логин занят' });
      const id = uuid();
      store.write((db) => {
        db.users.push({
          id, login: b.login, password_hash: hashPassword(b.password),
          name: b.name, role: b.role, phone: b.phone || '', active: 1,
          created_at: new Date().toISOString(),
        });
      });
      return json(res, 200, { ok: true, id: id });
    }
    const userId = pathId(p, '/api/users');
    if (userId && method === 'PATCH') {
      const b = await body(req);
      store.write((db) => {
        const u = db.users.find((x) => x.id === userId);
        if (!u) return;
        if (b.name !== undefined) u.name = b.name;
        if (b.role !== undefined) u.role = b.role;
        if (b.phone !== undefined) u.phone = b.phone;
        if (b.active !== undefined) u.active = Number(b.active) ? 1 : 0;
        if (b.password) u.password_hash = hashPassword(b.password);
      });
      return json(res, 200, { ok: true });
    }
    if (method === 'GET' && p.indexOf('/api/users') === 0) {
      return json(res, 200, { users: store.get().users.map((u) => ({ id: u.id, login: u.login, name: u.name, role: u.role, phone: u.phone, active: u.active })) });
    }

    if (method === 'GET' && p.indexOf('/api/company') === 0) return json(res, 200, { company: store.get().company });
    if (method === 'PATCH' && p.indexOf('/api/company') === 0) {
      const b = await body(req);
      store.write((db) => {
        if (!db.company) db.company = {};
        ['name','phone','email','address','inn'].forEach((f) => { if (b[f] !== undefined) db.company[f] = b[f]; });
      });
      return json(res, 200, { company: store.get().company });
    }
    if (method === 'GET' && p.indexOf('/api/schedule') === 0) {
      const db = store.get();
      const now = new Date().toISOString().slice(0, 10);
      const items = [];
      for (const d of db.deals) {
        const cl = db.clients.find((c) => c.id === d.client_id);
        const cn = cl ? cl.name : '';
        if (d.measure_date && d.measure_date >= now) items.push({ type: 'measure', date: d.measure_date, deal: enrichDeal(d), client_name: cn });
        if (d.install_date && d.install_date >= now) items.push({ type: 'install', date: d.install_date, deal: enrichDeal(d), client_name: cn });
      }
      items.sort((a, b) => a.date.localeCompare(b.date));
      return json(res, 200, { items: items });
    }
    if (method === 'GET' && p.indexOf('/api/finance') === 0) {
      const db = store.get();
      let revenue = 0, cost = 0, paid = 0;
      for (const d of db.deals) {
        if (d.stage === 'reject') continue;
        const m = moneyDeal(d.id);
        revenue += m.client_total;
        cost += m.film_cost + m.install_cost + m.other_cost + m.installer_accruals;
        paid += m.paid_amount;
      }
      const expenses = (db.expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);
      return json(res, 200, { revenue, cost, paid, expenses, profit: revenue - cost - expenses, deals_count: db.deals.length, expense_list: db.expenses || [] });
    }
    if (method === 'POST' && p.indexOf('/api/expenses') === 0) {
      const b = await body(req);
      const e = { id: uuid(), title: b.title || '', amount: Number(b.amount)||0, date: b.date || new Date().toISOString().slice(0,10), note: b.note || '', created_at: new Date().toISOString() };
      store.write((db) => { if (!db.expenses) db.expenses = []; db.expenses.push(e); });
      return json(res, 200, { expense: e });
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
    if (method === 'POST' && p.indexOf('/api/installers/payouts') === 0) {
      const b = await body(req);
      store.write((db) => {
        db.installer_payouts.push({ id: uuid(), installer_id: b.installer_id, amount: Number(b.amount)||0, paid_at: new Date().toISOString(), note: b.note || '', created_by: user.id });
      });
      return json(res, 200, { ok: true });
    }
    if (method === 'GET' && p.indexOf('/api/search') === 0) {
      const q = String(qs.q || '').toLowerCase().trim();
      const db = store.get();
      if (!q) return json(res, 200, { clients: [], deals: [] });
      const clients = db.clients.filter((c) => (c.name||'').toLowerCase().indexOf(q)>=0 || (c.phone||'').indexOf(q)>=0).slice(0, 10);
      const deals = db.deals.filter((d) => (d.title||'').toLowerCase().indexOf(q)>=0 || (d.contact_name||'').toLowerCase().indexOf(q)>=0 || (d.contact_phone||'').indexOf(q)>=0 || (d.address||'').toLowerCase().indexOf(q)>=0).slice(0, 10).map(enrichDeal);
      return json(res, 200, { clients, deals });
    }

    return json(res, 404, { error: 'Not found: ' + method + ' ' + p });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error: ' + (e && e.message || 'unknown') });
  }
};
