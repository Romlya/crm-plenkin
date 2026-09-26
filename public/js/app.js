(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let user = null, stages = [], installers = [], boardData = null, currentPage = 'dashboard';
  const titles = { dashboard: '\u0414\u0430\u0448\u0431\u043e\u0440\u0434', board: '\u041a\u0430\u043d\u0431\u0430\u043d', deals: '\u0421\u0434\u0435\u043b\u043a\u0438', installers: '\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a\u0438' };
  const money = (n) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n || 0);
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '\u041e\u0448\u0438\u0431\u043a\u0430');
    return data;
  }
  function showLogin() { $('#loginView').classList.remove('hidden'); $('#appView').classList.add('hidden'); }
  function roleLabel(r) { return ({ owner: '\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446', manager: '\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440', installer: '\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a' }[r] || r); }
  function showApp() {
    $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
    $('#sideUser').innerHTML = '<strong>' + escapeHtml(user.name) + '</strong>' + escapeHtml(roleLabel(user.role));
    $('#newDealBtn').classList.toggle('hidden', !(user.role === 'owner' || user.role === 'manager'));
  }
  function closeMenu() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('open'); }
  function openMenu() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('open'); }
  $('#menuBtn')?.addEventListener('click', openMenu);
  $('#sidebarBackdrop')?.addEventListener('click', closeMenu);
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#loginError').classList.add('hidden');
    try {
      const data = await api('/api/login', { method: 'POST', body: { login: fd.get('login'), password: fd.get('password') } });
      user = data.user; await boot();
    } catch (err) { $('#loginError').textContent = err.message; $('#loginError').classList.remove('hidden'); }
  });
  $('#logoutBtn').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); user = null; closeMenu(); showLogin(); });
  $$('#sideNav .nav-item').forEach((btn) => btn.addEventListener('click', () => { goPage(btn.dataset.page); closeMenu(); }));
  function goPage(page) {
    currentPage = page;
    $$('#sideNav .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    $$('.page').forEach((p) => p.classList.add('hidden'));
    const el = $('#page-' + page); if (el) el.classList.remove('hidden');
    $('#pageTitle').textContent = titles[page] || page;
    if (page === 'dashboard') renderDashboard();
    if (page === 'board') renderBoard();
    if (page === 'deals') renderDealsList();
    if (page === 'installers') loadInstallers();
  }
  async function boot() {
    const me = await api('/api/me'); user = me.user; stages = me.stages; showApp();
    const filter = $('#dealFilter');
    if (filter) {
      filter.innerHTML = '<option value="">\u0412\u0441\u0435 \u044d\u0442\u0430\u043f\u044b</option>' + stages.map((s) => '<option value="' + s.id + '">' + escapeHtml(s.title) + '</option>').join('');
      filter.onchange = () => renderDealsList();
    }
    if (user.role !== 'installer') {
      try { const u = await api('/api/users'); installers = u.users.filter((x) => x.role === 'installer' && x.active); } catch { installers = []; }
    }
    await refreshBoard();
    goPage(user.role === 'installer' ? 'board' : 'dashboard');
  }
  async function refreshBoard() { boardData = await api('/api/board'); stages = boardData.stages; }
  function allDeals() {
    if (!boardData) return [];
    const list = [];
    for (const s of stages) for (const d of boardData.board[s.id] || []) list.push(d);
    return list;
  }
  function stageTitle(id) { return (stages.find((s) => s.id === id) || {}).title || id; }
  function dealRowHtml(d) {
    return '<div class="deal-row" data-id="' + d.id + '"><div class="title">' + escapeHtml(d.title) + '</div><span class="stage-pill">' + escapeHtml(stageTitle(d.stage)) + '</span><div class="meta">' + escapeHtml(d.contact_name || d.client_name || '\u2014') + (d.contact_phone ? ' \u00b7 ' + escapeHtml(d.contact_phone) : '') + '</div>' + (d.client_total ? '<div class="money">' + money(d.client_total) + '</div>' : '') + '</div>';
  }
  function renderDashboard() {
    const deals = allDeals();
    const active = deals.filter((d) => d.stage !== 'done' && d.stage !== 'reject');
    const done = deals.filter((d) => d.stage === 'done');
    const sum = (arr) => arr.reduce((s, d) => s + (Number(d.client_total) || 0), 0);
    $('#dashStats').innerHTML = '<div class="stat-card"><div class="label">\u0412 \u0440\u0430\u0431\u043e\u0442\u0435</div><div class="value">' + active.length + '</div></div><div class="stat-card"><div class="label">\u0417\u0430\u043a\u0440\u044b\u0442\u043e</div><div class="value ok">' + done.length + '</div></div><div class="stat-card"><div class="label">\u0421\u0443\u043c\u043c\u0430 \u0432 \u0440\u0430\u0431\u043e\u0442\u0435</div><div class="value gold">' + money(sum(active)) + '</div></div><div class="stat-card"><div class="label">\u0421\u0443\u043c\u043c\u0430 \u0437\u0430\u043a\u0440\u044b\u0442\u044b\u0445</div><div class="value gold">' + money(sum(done)) + '</div></div>';
    $('#dashFunnel').innerHTML = stages.map((s) => { const n = (boardData.board[s.id] || []).length; return '<div class="funnel-item"><div class="n">' + n + '</div><div class="t">' + escapeHtml(s.title) + '</div></div>'; }).join('');
    const recent = [...deals].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 8);
    $('#dashRecent').innerHTML = recent.length ? recent.map(dealRowHtml).join('') : '<div class="deal-row"><span class="muted">\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0441\u0434\u0435\u043b\u043e\u043a \u2014 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u00ab+ \u0417\u0430\u044f\u0432\u043a\u0430\u00bb</span></div>';
    $$('#dashRecent .deal-row[data-id]').forEach((row) => row.addEventListener('click', () => openDeal(row.dataset.id)));
  }
  function renderBoard() {
    const board = $('#board'); board.innerHTML = '';
    for (const s of stages) {
      const items = (boardData && boardData.board[s.id]) || [];
      const col = document.createElement('div'); col.className = 'column';
      col.innerHTML = '<div class="column-head"><h2>' + escapeHtml(s.title) + '</h2><span class="count">' + items.length + '</span></div><div class="column-body"></div>';
      const body = col.querySelector('.column-body');
      for (const d of items) {
        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = '<div class="card-title">' + escapeHtml(d.title) + '</div><div class="card-meta">' + escapeHtml(d.contact_name || d.client_name || '\u2014') + '<br>' + escapeHtml(d.contact_phone || '') + '<br>' + escapeHtml(d.address || '') + '</div>' + (d.client_total ? '<div class="card-money">' + money(d.client_total) + '</div>' : '');
        card.addEventListener('click', () => openDeal(d.id)); body.appendChild(card);
      }
      board.appendChild(col);
    }
  }
  function renderDealsList() {
    const filter = $('#dealFilter')?.value || '';
    let deals = allDeals();
    if (filter) deals = deals.filter((d) => d.stage === filter);
    deals.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    const box = $('#dealsList');
    box.innerHTML = deals.length ? deals.map(dealRowHtml).join('') : '<div class="deal-row"><span class="muted">\u041d\u0435\u0442 \u0441\u0434\u0435\u043b\u043e\u043a</span></div>';
    $$('#dealsList .deal-row[data-id]').forEach((row) => row.addEventListener('click', () => openDeal(row.dataset.id)));
  }
  $('#newDealBtn').addEventListener('click', async () => {
    const data = await api('/api/deals', { method: 'POST', body: { title: '\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u044f\u0432\u043a\u0430', stage: 'lead' } });
    await refreshBoard(); goPage('board'); openDeal(data.id);
  });
  function openDrawer() { $('#overlay').classList.add('open'); $('#drawer').classList.add('open'); }
  function closeDrawer() { $('#overlay').classList.remove('open'); $('#drawer').classList.remove('open'); }
  $('#overlay').addEventListener('click', closeDrawer);
  $('#closeDrawer').addEventListener('click', closeDrawer);
  async function openDeal(id) { const { deal } = await api('/api/deals/' + id); renderDeal(deal); openDrawer(); }
  function renderDeal(deal) {
    const canEdit = user.role === 'owner' || user.role === 'manager';
    $('#drawerTitle').textContent = deal.title || '\u0421\u0434\u0435\u043b\u043a\u0430';
    const stageOpts = stages.map((s) => '<option value="' + s.id + '"' + (deal.stage === s.id ? ' selected' : '') + '>' + s.title + '</option>').join('');
    const installerOpts = ['<option value="">\u2014 \u043d\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d \u2014</option>'].concat(installers.map((i) => '<option value="' + i.id + '"' + (deal.installer_id === i.id ? ' selected' : '') + '>' + escapeHtml(i.name) + '</option>')).join('');
    const m = deal.money || {};
    const profitClass = (m.profit || 0) >= 0 ? 'profit' : 'profit neg';
    let linesHtml = canEdit
      ? '<div class="section-title">\u041f\u043e\u0437\u0438\u0446\u0438\u0438 \u0441\u043c\u0435\u0442\u044b</div><table class="table" id="linesTable"><thead><tr><th>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</th><th>\u041a\u043e\u043b-\u0432\u043e</th><th>\u0417\u0430\u043a\u0443\u043f</th><th>\u041a\u043b\u0438\u0435\u043d\u0442\u0443</th></tr></thead><tbody>' + (deal.lines || []).map((l) => '<tr><td><input data-f="title" value="' + escapeHtml(l.title) + '"></td><td><input data-f="qty" type="number" step="0.01" value="' + l.qty + '"></td><td><input data-f="cost_price" type="number" value="' + l.cost_price + '"></td><td><input data-f="sell_price" type="number" value="' + l.sell_price + '"></td></tr>').join('') + '</tbody></table><button type="button" class="btn btn-ghost btn-sm" id="addLine" style="margin-top:8px">+ \u0421\u0442\u0440\u043e\u043a\u0430</button>'
      : '<div class="section-title">\u041f\u043e\u0437\u0438\u0446\u0438\u0438</div><table class="table"><thead><tr><th>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</th><th>\u041a\u043e\u043b-\u0432\u043e</th><th>\u0421\u0443\u043c\u043c\u0430</th></tr></thead><tbody>' + ((deal.lines || []).map((l) => '<tr><td>' + escapeHtml(l.title) + '</td><td>' + l.qty + '</td><td>' + money(l.sell_price * l.qty) + '</td></tr>').join('') || '<tr><td colspan="3">\u041d\u0435\u0442</td></tr>') + '</tbody></table>';
    $('#drawerBody').innerHTML = canEdit
      ? '<div class="field"><label>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</label><input id="f_title" value="' + escapeHtml(deal.title) + '"></div><div class="grid-2"><div class="field"><label>\u042d\u0442\u0430\u043f</label><select id="f_stage">' + stageOpts + '</select></div><div class="field"><label>\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a</label><select id="f_installer">' + installerOpts + '</select></div></div><div class="grid-2"><div class="field"><label>\u041a\u043e\u043d\u0442\u0430\u043a\u0442</label><input id="f_contact_name" value="' + escapeHtml(deal.contact_name) + '"></div><div class="field"><label>\u0422\u0435\u043b\u0435\u0444\u043e\u043d</label><input id="f_contact_phone" value="' + escapeHtml(deal.contact_phone) + '"></div></div><div class="field"><label>Email</label><input id="f_contact_email" value="' + escapeHtml(deal.contact_email) + '"></div><div class="field"><label>\u0410\u0434\u0440\u0435\u0441</label><input id="f_address" value="' + escapeHtml(deal.address) + '"></div><div class="field"><label>\u0417\u0430\u043c\u0435\u0442\u043a\u0438</label><textarea id="f_notes">' + escapeHtml(deal.notes || '') + '</textarea></div><div class="grid-2"><div class="field"><label>\u041c\u043e\u043d\u0442\u0430\u0436 \u20bd</label><input id="f_install_cost" type="number" value="' + (deal.install_cost || 0) + '"></div><div class="field"><label>\u041f\u0440\u043e\u0447\u0435\u0435 \u20bd</label><input id="f_other_cost" type="number" value="' + (deal.other_cost || 0) + '"></div></div>' + linesHtml + '<div class="section-title">\u0414\u0435\u043d\u044c\u0433\u0438</div><div class="money-box"><div class="item"><span>\u041a\u043b\u0438\u0435\u043d\u0442\u0443</span><strong>' + money(m.client_total) + '</strong></div><div class="item"><span>\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e</span><strong>' + money(m.paid_amount) + '</strong></div><div class="item"><span>\u041f\u043b\u0451\u043d\u043a\u0430</span><strong>' + money(m.film_cost) + '</strong></div><div class="item"><span>\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a\u0438</span><strong>' + money(m.installer_accruals) + '</strong></div><div class="item"><span>\u041e\u0441\u0442\u0430\u0442\u043e\u043a</span><strong>' + money(m.balance) + '</strong></div><div class="item ' + profitClass + '"><span>\u041f\u0440\u0438\u0431\u044b\u043b\u044c</span><strong>' + money(m.profit) + '</strong></div></div><div class="section-title">\u041e\u043f\u043b\u0430\u0442\u0430</div><div class="grid-2"><div class="field"><label>\u0421\u0443\u043c\u043c\u0430</label><input id="pay_amount" type="number"></div><div class="field"><label>\u041a\u043e\u043c\u043c\u0435\u043d\u0442</label><input id="pay_note"></div></div><button type="button" class="btn btn-ghost btn-sm" id="addPayment">+ \u041e\u043f\u043b\u0430\u0442\u0430</button><div class="section-title">\u041d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u0438\u0435</div><div class="grid-2"><div class="field"><label>\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a</label><select id="acc_installer">' + installerOpts + '</select></div><div class="field"><label>\u0421\u0443\u043c\u043c\u0430</label><input id="acc_amount" type="number"></div></div><button type="button" class="btn btn-ghost btn-sm" id="addAccrual" style="margin-top:8px">+ \u041d\u0430\u0447\u0438\u0441\u043b\u0438\u0442\u044c</button>'
      : '<p class="muted">\u042d\u0442\u0430\u043f: <strong style="color:var(--text)">' + escapeHtml(stageTitle(deal.stage)) + '</strong></p><p class="muted" style="margin-top:8px">\u0410\u0434\u0440\u0435\u0441: ' + escapeHtml(deal.address || '\u2014') + '</p><p class="muted">\u041a\u043e\u043d\u0442\u0430\u043a\u0442: ' + escapeHtml(deal.contact_name || '') + ' ' + escapeHtml(deal.contact_phone || '') + '</p>' + linesHtml + '<div class="section-title">\u0414\u0435\u043d\u044c\u0433\u0438</div><div class="money-box"><div class="item"><span>\u041a\u043b\u0438\u0435\u043d\u0442\u0443</span><strong>' + money(m.client_total) + '</strong></div><div class="item ' + profitClass + '"><span>\u041f\u0440\u0438\u0431\u044b\u043b\u044c</span><strong>' + money(m.profit) + '</strong></div></div>';
    $('#drawerFoot').innerHTML = canEdit ? '<button type="button" class="btn" id="saveDeal">\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c</button><button type="button" class="btn btn-ghost" id="saveLines">\u041f\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u0442\u044c</button>' : '<span class="muted">\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440</span>';
    if (!canEdit) return;
    $('#addLine')?.addEventListener('click', () => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><input data-f="title" value="\u041f\u043e\u0437\u0438\u0446\u0438\u044f"></td><td><input data-f="qty" type="number" value="1"></td><td><input data-f="cost_price" type="number" value="0"></td><td><input data-f="sell_price" type="number" value="0"></td>';
      $('#linesTable tbody').appendChild(tr);
    });
    async function saveLines() {
      const lines = $$('#linesTable tbody tr').map((tr) => {
        const get = (f) => tr.querySelector('[data-f="' + f + '"]')?.value;
        return { title: get('title'), qty: Number(get('qty')) || 0, cost_price: Number(get('cost_price')) || 0, sell_price: Number(get('sell_price')) || 0, unit: '\u043c\u00b2' };
      });
      await api('/api/deals/' + deal.id + '/lines', { method: 'PUT', body: { lines } });
    }
    $('#saveDeal')?.addEventListener('click', async () => {
      await api('/api/deals/' + deal.id, { method: 'PATCH', body: { title: $('#f_title').value, stage: $('#f_stage').value, installer_id: $('#f_installer').value || null, contact_name: $('#f_contact_name').value, contact_phone: $('#f_contact_phone').value, contact_email: $('#f_contact_email').value, address: $('#f_address').value, notes: $('#f_notes').value, install_cost: Number($('#f_install_cost').value) || 0, other_cost: Number($('#f_other_cost').value) || 0 } });
      await saveLines(); await refreshBoard(); openDeal(deal.id);
      if (currentPage === 'dashboard') renderDashboard();
      if (currentPage === 'board') renderBoard();
      if (currentPage === 'deals') renderDealsList();
    });
    $('#saveLines')?.addEventListener('click', async () => { await saveLines(); await refreshBoard(); openDeal(deal.id); });
    $('#addPayment')?.addEventListener('click', async () => {
      const amount = Number($('#pay_amount').value); if (!amount) return alert('\u0421\u0443\u043c\u043c\u0430');
      await api('/api/deals/' + deal.id + '/payments', { method: 'POST', body: { amount, note: $('#pay_note').value } });
      openDeal(deal.id); await refreshBoard();
    });
    $('#addAccrual')?.addEventListener('click', async () => {
      const installer_id = $('#acc_installer').value; const amount = Number($('#acc_amount').value);
      if (!installer_id || !amount) return alert('\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a \u0438 \u0441\u0443\u043c\u043c\u0430');
      await api('/api/deals/' + deal.id + '/accruals', { method: 'POST', body: { installer_id, amount, assign: true } });
      openDeal(deal.id); await refreshBoard();
    });
  }
  async function loadInstallers() {
    const data = await api('/api/installers/balances');
    const box = $('#installerList');
    if (!data.balances.length) { box.innerHTML = '<div class="inst-row"><span class="muted">\u041d\u0435\u0442 \u043c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a\u043e\u0432</span></div>'; return; }
    box.innerHTML = data.balances.map((b) => '<div class="inst-row"><strong>' + escapeHtml(b.name) + '</strong><span class="badge">\u043d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u043e ' + money(b.accrued) + '</span><span class="badge">\u0432\u044b\u043f\u043b\u0430\u0447\u0435\u043d\u043e ' + money(b.paid) + '</span><span class="badge ' + (b.debt > 0 ? 'warn' : '') + '">\u0434\u043e\u043b\u0433 ' + money(b.debt) + '</span>' + (user.role === 'owner' ? '<button type="button" class="btn btn-ghost btn-sm" data-pay="' + b.id + '" data-name="' + escapeHtml(b.name) + '">\u0412\u044b\u043f\u043b\u0430\u0442\u0430</button>' : '') + '</div>').join('');
    $$('[data-pay]').forEach((btn) => btn.addEventListener('click', async () => {
      const amount = Number(prompt('\u0412\u044b\u043f\u043b\u0430\u0442\u0430: ' + btn.dataset.name + '. \u0421\u0443\u043c\u043c\u0430 \u20bd:')); if (!amount) return;
      await api('/api/installers/payouts', { method: 'POST', body: { installer_id: btn.dataset.pay, amount } }); loadInstallers();
    }));
  }
  api('/api/me').then((me) => { user = me.user; stages = me.stages; return boot(); }).catch(() => showLogin());
})();
