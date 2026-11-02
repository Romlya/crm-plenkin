const crypto = require('crypto');
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
const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
};
function auth() {
  try {
    const u = store.get().users.find((x) => x.role === 'owner') || store.get().users[0];
    if (!u) return { id: 'local', login: 'owner', name: 'Владелец', role: 'owner' };
    return { id: u.id, login: u.login, name: u.name, role: u.role };
  } catch (e) {
    return { id: 'local', login: 'owner', name: 'Владелец', role: 'owner' };
  }
}
module.exports = async function handler(req, res) {
  try {
    const rawUrl = req.url || '/';
    let p = rawUrl.split('?')[0];
    const method = req.method || 'GET';
    if (method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (p.indexOf('/api') !== 0) p = '/api' + p;
    const user = auth();
    if (method === 'POST' && p.indexOf('/api/login') === 0) return json(res, 200, { user });
    if (method === 'POST' && p.indexOf('/api/logout') === 0) return json(res, 200, { ok: true });
    if (method === 'GET' && p.indexOf('/api/me') === 0) return json(res, 200, { user, stages: STAGES });
    if (method === 'GET' && p.indexOf('/api/board') === 0) {
      const db = store.get();
      const board = {};
      for (const s of STAGES) board[s.id] = [];
      for (const d of db.deals || []) {
        const st = board[d.stage] ? d.stage : 'lead';
        board[st].push(d);
      }
      return json(res, 200, { stages: STAGES, board });
    }
    if (method === 'GET' && p === '/api/deals') return json(res, 200, { deals: store.get().deals || [] });
    if (method === 'GET' && p.indexOf('/api/clients') === 0) return json(res, 200, { clients: store.get().clients || [] });
    if (method === 'GET' && p.indexOf('/api/materials') === 0) return json(res, 200, { materials: store.get().materials || [] });
    if (method === 'GET' && p.indexOf('/api/users') === 0) {
      const users = (store.get().users || []).map(u => ({ id: u.id, login: u.login, name: u.name, role: u.role, active: u.active }));
      return json(res, 200, { users });
    }
    if (method === 'GET' && p.indexOf('/api/company') === 0) return json(res, 200, { company: store.get().company || {} });
    if (method === 'GET' && p.indexOf('/api/schedule') === 0) return json(res, 200, { deals: [] });
    if (method === 'GET' && p.indexOf('/api/finance') === 0) return json(res, 200, { summary: {}, expenses: [], deals: [] });
    if (method === 'GET' && p.indexOf('/api/installers') === 0) return json(res, 200, { balances: [] });
    if (method === 'GET' && p.indexOf('/api/search') === 0) return json(res, 200, { clients: [], deals: [] });
    if (method === 'POST' && p === '/api/deals') {
      const id = crypto.randomUUID();
      const deal = { id, title: 'Новая заявка', stage: 'lead', created_at: new Date().toISOString() };
      store.write(db => { db.deals.push(deal); });
      return json(res, 200, { id, deal });
    }
    return json(res, 404, { error: 'Not found: ' + method + ' ' + p });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: String(e && e.message || e) });
  }
};
