(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let user = null, stages = [], installers = [];
  const money = (n) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n || 0);
  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '\u041e\u0448\u0438\u0431\u043a\u0430');
    return data;
  }
  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function showLogin(){ $('#loginView').classList.remove('hidden'); $('#appView').classList.add('hidden'); }
  function showApp(){
    $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
    const rl = {owner:'\u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446',manager:'\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440',installer:'\u043c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a'}[user.role]||user.role;
    $('#userLabel').innerHTML = '<strong>'+escapeHtml(user.name)+'</strong> \u00b7 '+rl;
    $('#newDealBtn').classList.toggle('hidden', user.role==='installer');
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#loginError').classList.add('hidden');
    try {
      const data = await api('/api/login', { method:'POST', body:{ login: fd.get('login'), password: fd.get('password') } });
      user = data.user; await boot();
    } catch(err){ $('#loginError').textContent = err.message; $('#loginError').classList.remove('hidden'); }
  });
  $('#logoutBtn').addEventListener('click', async () => { await api('/api/logout',{method:'POST'}); user=null; showLogin(); });
  $$('#navTabs button').forEach(btn => btn.addEventListener('click', () => {
    $$('#navTabs button').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    const tab = btn.dataset.tab;
    $('#tab-board').classList.toggle('hidden', tab!=='board');
    $('#tab-installers').classList.toggle('hidden', tab!=='installers');
    if (tab==='installers') loadInstallers();
  }));
  async function boot(){
    const me = await api('/api/me'); user = me.user; stages = me.stages; showApp(); await loadBoard();
    if (user.role !== 'installer') {
      try { const u = await api('/api/users'); installers = u.users.filter(x=>x.role==='installer'&&x.active); } catch { installers=[]; }
    }
  }
  async function loadBoard(){
    const data = await api('/api/board'); stages = data.stages; const board = $('#board'); board.innerHTML='';
    for (const s of stages) {
      const col = document.createElement('div'); col.className='column';
      const items = data.board[s.id]||[];
      col.innerHTML = '<div class="column-head"><h2>'+escapeHtml(s.title)+'</h2><span class="count">'+items.length+'</span></div><div class="column-body"></div>';
      const body = col.querySelector('.column-body');
      for (const d of items) {
        const card = document.createElement('div'); card.className='card';
        card.innerHTML = '<div class="card-title">'+escapeHtml(d.title)+'</div><div class="card-meta">'+escapeHtml(d.contact_name||d.client_name||'\u2014')+'<br>'+escapeHtml(d.contact_phone||'')+'<br>'+escapeHtml(d.address||'')+'</div>'+(d.client_total?'<div class="card-money">'+money(d.client_total)+'</div>':'');
        card.addEventListener('click', () => openDeal(d.id)); body.appendChild(card);
      }
      board.appendChild(col);
    }
  }
  $('#newDealBtn').addEventListener('click', async () => {
    const data = await api('/api/deals', { method:'POST', body:{ title:'\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u044f\u0432\u043a\u0430', stage:'lead' } });
    await loadBoard(); openDeal(data.id);
  });
  function openDrawer(){ $('#overlay').classList.add('open'); $('#drawer').classList.add('open'); }
  function closeDrawer(){ $('#overlay').classList.remove('open'); $('#drawer').classList.remove('open'); }
  $('#overlay').addEventListener('click', closeDrawer);
  $('#closeDrawer').addEventListener('click', closeDrawer);
  async function openDeal(id){
    const { deal } = await api('/api/deals/'+id);
    const canEdit = user.role==='owner'||user.role==='manager';
    $('#drawerTitle').textContent = deal.title||'\u0421\u0434\u0435\u043b\u043a\u0430';
    const m = deal.money||{};
    const stageOpts = stages.map(s=>'<option value="'+s.id+'"'+(deal.stage===s.id?' selected':'')+'>'+s.title+'</option>').join('');
    const instOpts = ['<option value="">\u2014</option>'].concat(installers.map(i=>'<option value="'+i.id+'"'+(deal.installer_id===i.id?' selected':'')+'>'+escapeHtml(i.name)+'</option>')).join('');
    $('#drawerBody').innerHTML = canEdit ? (
      '<div class="field"><label>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</label><input id="f_title" value="'+escapeHtml(deal.title)+'"></div>'+
      '<div class="grid-2"><div class="field"><label>\u042d\u0442\u0430\u043f</label><select id="f_stage">'+stageOpts+'</select></div>'+
      '<div class="field"><label>\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a</label><select id="f_installer">'+instOpts+'</select></div></div>'+
      '<div class="grid-2"><div class="field"><label>\u041a\u043e\u043d\u0442\u0430\u043a\u0442</label><input id="f_contact_name" value="'+escapeHtml(deal.contact_name)+'"></div>'+
      '<div class="field"><label>\u0422\u0435\u043b\u0435\u0444\u043e\u043d</label><input id="f_contact_phone" value="'+escapeHtml(deal.contact_phone)+'"></div></div>'+
      '<div class="field"><label>\u0410\u0434\u0440\u0435\u0441</label><input id="f_address" value="'+escapeHtml(deal.address)+'"></div>'+
      '<div class="field"><label>\u0417\u0430\u043c\u0435\u0442\u043a\u0438</label><textarea id="f_notes">'+escapeHtml(deal.notes||'')+'</textarea></div>'+
      '<div class="grid-2"><div class="field"><label>\u041c\u043e\u043d\u0442\u0430\u0436 \u20bd</label><input id="f_install_cost" type="number" value="'+(deal.install_cost||0)+'"></div>'+
      '<div class="field"><label>\u041f\u0440\u043e\u0447\u0435\u0435 \u20bd</label><input id="f_other_cost" type="number" value="'+(deal.other_cost||0)+'"></div></div>'+
      '<div class="section-title">\u0421\u043c\u0435\u0442\u0430</div><table class="table" id="linesTable"><thead><tr><th>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</th><th>\u041a\u043e\u043b-\u0432\u043e</th><th>\u0417\u0430\u043a\u0443\u043f</th><th>\u041a\u043b\u0438\u0435\u043d\u0442\u0443</th></tr></thead><tbody>'+
      (deal.lines||[]).map(l=>'<tr><td><input data-f="title" value="'+escapeHtml(l.title)+'"></td><td><input data-f="qty" type="number" value="'+l.qty+'"></td><td><input data-f="cost_price" type="number" value="'+l.cost_price+'"></td><td><input data-f="sell_price" type="number" value="'+l.sell_price+'"></td></tr>').join('')+
      '</tbody></table><button type="button" class="btn btn-ghost btn-sm" id="addLine">+ \u0421\u0442\u0440\u043e\u043a\u0430</button>'+
      '<div class="section-title">\u0414\u0435\u043d\u044c\u0433\u0438</div><div class="money-box">'+
      '<div class="item"><span>\u041a\u043b\u0438\u0435\u043d\u0442\u0443</span><strong>'+money(m.client_total)+'</strong></div>'+
      '<div class="item"><span>\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e</span><strong>'+money(m.paid_amount)+'</strong></div>'+
      '<div class="item"><span>\u041f\u043b\u0451\u043d\u043a\u0430</span><strong>'+money(m.film_cost)+'</strong></div>'+
      '<div class="item"><span>\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a\u0438</span><strong>'+money(m.installer_accruals)+'</strong></div>'+
      '<div class="item"><span>\u041e\u0441\u0442\u0430\u0442\u043e\u043a</span><strong>'+money(m.balance)+'</strong></div>'+
      '<div class="item profit'+(m.profit<0?' neg':'')+'"><span>\u041f\u0440\u0438\u0431\u044b\u043b\u044c</span><strong>'+money(m.profit)+'</strong></div></div>'+
      '<div class="section-title">\u041e\u043f\u043b\u0430\u0442\u0430</div><div class="grid-2"><div class="field"><label>\u0421\u0443\u043c\u043c\u0430</label><input id="pay_amount" type="number"></div><div class="field"><label>\u041a\u043e\u043c\u043c\u0435\u043d\u0442</label><input id="pay_note"></div></div>'+
      '<button type="button" class="btn btn-ghost btn-sm" id="addPayment">+ \u041e\u043f\u043b\u0430\u0442\u0430</button>'+
      '<div class="section-title">\u041d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u0438\u0435</div><div class="grid-2"><div class="field"><label>\u041a\u0442\u043e</label><select id="acc_installer">'+instOpts+'</select></div><div class="field"><label>\u0421\u0443\u043c\u043c\u0430</label><input id="acc_amount" type="number"></div></div>'+
      '<button type="button" class="btn btn-ghost btn-sm" id="addAccrual">+ \u041d\u0430\u0447\u0438\u0441\u043b\u0438\u0442\u044c</button>'
    ) : (
      '<p class="muted">\u042d\u0442\u0430\u043f: <strong style="color:var(--text)">'+escapeHtml((stages.find(s=>s.id===deal.stage)||{}).title||deal.stage)+'</strong></p>'+
      '<p class="muted">\u0410\u0434\u0440\u0435\u0441: '+escapeHtml(deal.address||'\u2014')+'</p>'+
      '<p class="muted">\u041a\u043e\u043d\u0442\u0430\u043a\u0442: '+escapeHtml(deal.contact_name||'')+' '+escapeHtml(deal.contact_phone||'')+'</p>'+
      '<div class="section-title">\u0414\u0435\u043d\u044c\u0433\u0438</div><div class="money-box"><div class="item"><span>\u041a\u043b\u0438\u0435\u043d\u0442\u0443</span><strong>'+money(m.client_total)+'</strong></div><div class="item profit"><span>\u041f\u0440\u0438\u0431\u044b\u043b\u044c</span><strong>'+money(m.profit)+'</strong></div></div>'
    );
    $('#drawerFoot').innerHTML = canEdit ? '<button type="button" class="btn" id="saveDeal">\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c</button>' : '<span class="muted">\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440</span>';
    openDrawer();
    if (!canEdit) return;
    $('#addLine')?.addEventListener('click', () => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><input data-f="title" value="\u041f\u043e\u0437\u0438\u0446\u0438\u044f"></td><td><input data-f="qty" type="number" value="1"></td><td><input data-f="cost_price" type="number" value="0"></td><td><input data-f="sell_price" type="number" value="0"></td>';
      $('#linesTable tbody').appendChild(tr);
    });
    $('#saveDeal')?.addEventListener('click', async () => {
      await api('/api/deals/'+deal.id, { method:'PATCH', body:{
        title: $('#f_title').value, stage: $('#f_stage').value, installer_id: $('#f_installer').value||null,
        contact_name: $('#f_contact_name').value, contact_phone: $('#f_contact_phone').value,
        address: $('#f_address').value, notes: $('#f_notes').value,
        install_cost: Number($('#f_install_cost').value)||0, other_cost: Number($('#f_other_cost').value)||0
      }});
      const lines = $$('#linesTable tbody tr').map(tr => ({
        title: tr.querySelector('[data-f=title]')?.value, qty: Number(tr.querySelector('[data-f=qty]')?.value)||0,
        cost_price: Number(tr.querySelector('[data-f=cost_price]')?.value)||0, sell_price: Number(tr.querySelector('[data-f=sell_price]')?.value)||0, unit:'\u043c\u00b2'
      }));
      await api('/api/deals/'+deal.id+'/lines', { method:'PUT', body:{ lines } });
      await loadBoard(); openDeal(deal.id);
    });
    $('#addPayment')?.addEventListener('click', async () => {
      const amount = Number($('#pay_amount').value); if (!amount) return alert('\u0421\u0443\u043c\u043c\u0430');
      await api('/api/deals/'+deal.id+'/payments', { method:'POST', body:{ amount, note: $('#pay_note').value } });
      openDeal(deal.id); loadBoard();
    });
    $('#addAccrual')?.addEventListener('click', async () => {
      const installer_id = $('#acc_installer').value; const amount = Number($('#acc_amount').value);
      if (!installer_id||!amount) return alert('\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a \u0438 \u0441\u0443\u043c\u043c\u0430');
      await api('/api/deals/'+deal.id+'/accruals', { method:'POST', body:{ installer_id, amount, assign:true } });
      openDeal(deal.id); loadBoard();
    });
  }
  async function loadInstallers(){
    const data = await api('/api/installers/balances');
    const box = $('#installerList');
    if (!data.balances.length){ box.innerHTML='<p class="muted">\u041d\u0435\u0442 \u043c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a\u043e\u0432</p>'; return; }
    box.innerHTML = data.balances.map(b => '<div class="row"><strong>'+escapeHtml(b.name)+'</strong><span class="badge">\u043d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u043e '+money(b.accrued)+'</span><span class="badge">\u0432\u044b\u043f\u043b\u0430\u0447\u0435\u043d\u043e '+money(b.paid)+'</span><span class="badge">\u0434\u043e\u043b\u0433 '+money(b.debt)+'</span>'+(user.role==='owner'?'<button type="button" class="btn btn-ghost btn-sm" data-pay="'+b.id+'" data-name="'+escapeHtml(b.name)+'">\u0412\u044b\u043f\u043b\u0430\u0442\u0430</button>':'')+'</div>').join('');
    $$('[data-pay]').forEach(btn => btn.addEventListener('click', async () => {
      const amount = Number(prompt('\u0412\u044b\u043f\u043b\u0430\u0442\u0430: '+btn.dataset.name+'. \u0421\u0443\u043c\u043c\u0430 \u20bd:')); if (!amount) return;
      await api('/api/installers/payouts', { method:'POST', body:{ installer_id: btn.dataset.pay, amount } });
      loadInstallers();
    }));
  }
  api('/api/me').then(me => { user = me.user; stages = me.stages; return boot(); }).catch(() => showLogin());
})();
