(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let user = null, stages = [], installers = [], materials = [], clients = [], boardData = null, currentPage = 'dashboard';
  const titles = {
    dashboard: 'Дашборд', board: 'Канбан', schedule: 'График', deals: 'Сделки', clients: 'Клиенты',
    finance: 'Финансы', materials: 'Склад плёнок', installers: 'Монтажники',
    staff: 'Сотрудники', settings: 'Настройки',
  };
  const SOURCES = [
    { id: 'manual', title: 'Вручную' }, { id: 'site', title: 'Сайт' }, { id: 'avito', title: 'Авито' },
    { id: 'referral', title: 'Рекомендация' }, { id: 'call', title: 'Звонок' }, { id: 'other', title: 'Другое' },
  ];
  const sourceTitle = (id) => (SOURCES.find((s) => s.id === id) || {}).title || id || '—';
  const money = (n) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n || 0);
  const escapeHtml = (s) => String(s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
  const roleLabel = (r) => ({ owner: 'Владелец', manager: 'Менеджер', installer: 'Монтажник' }[r] || r);
  const stageTitle = (id) => (stages.find((s) => s.id === id) || {}).title || id;
  const canEdit = () => user && (user.role === 'owner' || user.role === 'manager');
  const isOwner = () => user && user.role === 'owner';
  const fmtDate = (d) => {
    if (!d) return '—';
    const x = String(d).slice(0, 10);
    const [y, m, day] = x.split('-');
    return day && m ? day + '.' + m + '.' + y : x;
  };
  const todayStr = () => new Date().toISOString().slice(0, 10);

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    return data;
  }

  function showApp() {
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    if ($('#sideUser')) $('#sideUser').innerHTML = '<strong>' + escapeHtml(user.name) + '</strong> ' + escapeHtml(roleLabel(user.role));
    $('#newDealBtn')?.classList.toggle('hidden', !canEdit());
    $$('.nav-item.mgr').forEach((el) => el.classList.toggle('hidden', user.role === 'installer'));
    $$('.nav-item.own').forEach((el) => el.classList.toggle('hidden', user.role !== 'owner'));
  }

  function closeMenu() {
    $('#sidebar')?.classList.remove('open');
    $('#sidebarBackdrop')?.classList.remove('open');
  }
  function openMenu() {
    $('#sidebar')?.classList.add('open');
    $('#sidebarBackdrop')?.classList.add('open');
  }
  $('#menuBtn')?.addEventListener('click', openMenu);
  $('#sidebarBackdrop')?.addEventListener('click', closeMenu);

  $$('#sideNav .nav-item').forEach((btn) =>
    btn.addEventListener('click', () => { goPage(btn.dataset.page); closeMenu(); })
  );

  function goPage(page) {
    currentPage = page;
    $$('#sideNav .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    $$('.page').forEach((p) => p.classList.add('hidden'));
    const el = $('#page-' + page);
    if (el) el.classList.remove('hidden');
    if ($('#pageTitle')) $('#pageTitle').textContent = titles[page] || page;
    if (page === 'dashboard') renderDashboard();
    if (page === 'board') renderBoard();
    if (page === 'schedule') renderSchedule();
    if (page === 'deals') renderDeals();
    if (page === 'clients') renderClients();
    if (page === 'finance') renderFinance();
    if (page === 'materials') renderMaterials();
    if (page === 'installers') renderInstallers();
    if (page === 'staff') renderStaff();
    if (page === 'settings') renderSettings();
  }

  async function refreshBoard() {
    boardData = await api('/api/board');
    stages = boardData.stages || stages;
    if (!boardData.board) {
      boardData.board = {};
      for (const s of stages) boardData.board[s.id] = [];
      if (Array.isArray(boardData.deals)) {
        for (const d of boardData.deals) {
          const st = boardData.board[d.stage] ? d.stage : 'lead';
          boardData.board[st].push(d);
        }
      }
    }
  }

  function allDeals() {
    if (!boardData || !boardData.board) return [];
    const list = [];
    for (const s of stages) for (const d of boardData.board[s.id] || []) list.push(d);
    return list;
  }

  function dealRowHtml(d) {
    const dates = [];
    if (d.measure_date) dates.push('замер ' + fmtDate(d.measure_date));
    if (d.install_date) dates.push('монтаж ' + fmtDate(d.install_date));
    return (
      '<div class="deal-row" data-id="' + d.id + '">' +
      '<div class="title">' + escapeHtml(d.title) + '</div>' +
      '<span class="stage-pill">' + escapeHtml(stageTitle(d.stage)) + '</span>' +
      '<div class="meta">' + escapeHtml(d.contact_name || d.client_name || '—') +
      (d.contact_phone ? ' · ' + escapeHtml(d.contact_phone) : '') +
      (dates.length ? '<br><span class="date-hint">' + dates.join(' · ') + '</span>' : '') +
      '</div>' +
      (d.client_total ? '<div class="money">' + money(d.client_total) + '</div>' : '') +
      '</div>'
    );
  }

  function bindDealRows(root) {
    $$(root + ' .deal-row[data-id]').forEach((row) => row.addEventListener('click', () => openDeal(row.dataset.id)));
  }

  function renderDashboard() {
    const deals = allDeals();
    const active = deals.filter((d) => d.stage !== 'done' && d.stage !== 'reject');
    const done = deals.filter((d) => d.stage === 'done');
    const sum = (arr) => arr.reduce((s, d) => s + (Number(d.client_total) || 0), 0);
    const recent = [...deals].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 8);
    const today = todayStr();
    const upcoming = deals
      .filter((d) => (d.measure_date && d.measure_date >= today) || (d.install_date && d.install_date >= today))
      .sort((a, b) => ((a.measure_date || a.install_date || '9999') < (b.measure_date || b.install_date || '9999') ? -1 : 1))
      .slice(0, 6);

    $('#page-dashboard').innerHTML =
      '<div class="stats">' +
      '<div class="stat-card"><div class="label">В работе</div><div class="value">' + active.length + '</div></div>' +
      '<div class="stat-card"><div class="label">Закрыто</div><div class="value ok">' + done.length + '</div></div>' +
      '<div class="stat-card"><div class="label">Сумма в работе</div><div class="value gold">' + money(sum(active)) + '</div></div>' +
      '<div class="stat-card"><div class="label">Закрыто на сумму</div><div class="value gold">' + money(sum(done)) + '</div></div>' +
      '</div>' +
      '<div class="panel"><div class="panel-head"><h2>Воронка</h2></div><div class="funnel">' +
      stages.map((s) => {
        const n = ((boardData && boardData.board && boardData.board[s.id]) || []).length;
        return '<div class="funnel-item"><div class="n">' + n + '</div><div class="t">' + escapeHtml(s.title) + '</div></div>';
      }).join('') +
      '</div></div>' +
      '<div class="panel"><div class="panel-head"><h2>Последние сделки</h2></div><div class="deal-list">' +
      (recent.length ? recent.map(dealRowHtml).join('') : '<div class="empty-hint">Нет сделок — нажмите «+ Заявка»</div>') +
      '</div></div>';
    bindDealRows('#page-dashboard');
  }

  function renderBoard() {
    const board = $('#board');
    if (!board) return;
    board.innerHTML = '';
    for (const s of stages) {
      const items = (boardData && boardData.board && boardData.board[s.id]) || [];
      const col = document.createElement('div');
      col.className = 'column';
      col.innerHTML =
        '<div class="column-head"><h2>' + escapeHtml(s.title) + '</h2><span class="count">' + items.length + '</span></div><div class="column-body"></div>';
      const body = col.querySelector('.column-body');
      for (const d of items) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML =
          '<div class="card-title">' + escapeHtml(d.title) + '</div>' +
          '<div class="card-meta">' + escapeHtml(d.contact_name || d.client_name || '—') + '<br>' +
          escapeHtml(d.contact_phone || '') + '<br>' + escapeHtml(d.address || '') + '</div>' +
          (d.client_total ? '<div class="card-money">' + money(d.client_total) + '</div>' : '');
        card.addEventListener('click', () => openDeal(d.id));
        body.appendChild(card);
      }
      board.appendChild(col);
    }
  }

  async function renderSchedule() {
    try {
      const data = await api('/api/schedule');
      const items = data.items || [];
      $('#page-schedule').innerHTML =
        '<div class="panel"><div class="panel-head"><h2>График замеров и монтажей</h2></div>' +
        (items.length
          ? '<div class="deal-list">' +
            items.map((it) => {
              const d = it.deal || {};
              return '<div class="deal-row sched-row" data-id="' + d.id + '">' +
                '<div class="title">' + escapeHtml(it.type === 'measure' ? 'Замер' : 'Монтаж') + ' · ' + fmtDate(it.date) + '</div>' +
                '<div class="meta">' + escapeHtml(d.title || '') + '<br>' + escapeHtml(it.client_name || d.address || '') + '</div></div>';
            }).join('') +
            '</div>'
          : '<div class="empty-hint">Нет запланированных дат</div>') +
        '</div>';
      $$('#page-schedule .sched-row').forEach((r) => r.addEventListener('click', () => openDeal(r.dataset.id)));
    } catch (e) {
      $('#page-schedule').innerHTML = '<div class="empty-hint">' + escapeHtml(e.message) + '</div>';
    }
  }

  function renderDeals() {
    const deals = allDeals();
    $('#page-deals').innerHTML =
      '<div class="panel"><div class="panel-head"><h2>Все сделки</h2></div><div class="deal-list">' +
      (deals.length ? deals.map(dealRowHtml).join('') : '<div class="empty-hint">Нет сделок</div>') +
      '</div></div>';
    bindDealRows('#page-deals');
  }

  async function renderClients() {
    try {
      const data = await api('/api/clients');
      clients = data.clients || [];
      $('#page-clients').innerHTML =
        '<div class="panel"><div class="panel-head"><h2>Клиенты</h2>' +
        '<button type="button" class="btn btn-sm" id="addClient">+ Клиент</button></div>' +
        '<div class="deal-list">' +
        (clients.length
          ? clients.map((c) => '<div class="deal-row"><div class="title">' + escapeHtml(c.name) + '</div><div class="meta">' + escapeHtml(c.phone || '') + '</div></div>').join('')
          : '<div class="empty-hint">Нет клиентов</div>') +
        '</div></div>';
      $('#addClient')?.addEventListener('click', async () => {
        const name = prompt('Имя клиента');
        if (!name) return;
        await api('/api/clients', { method: 'POST', body: { name } });
        renderClients();
      });
    } catch (e) {
      $('#page-clients').innerHTML = '<div class="empty-hint">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function renderMaterials() {
    try {
      const data = await api('/api/materials');
      materials = data.materials || [];
      $('#page-materials').innerHTML =
        '<div class="panel"><div class="panel-head"><h2>Склад плёнок</h2></div><div class="deal-list">' +
        materials.map((m) => '<div class="deal-row"><div class="title">' + escapeHtml(m.title) + '</div><div class="meta">' + money(m.sell_price) + ' / ' + escapeHtml(m.unit) + ' · остаток ' + (m.stock_qty || 0) + '</div></div>').join('') +
        '</div></div>';
    } catch (e) {
      $('#page-materials').innerHTML = '<div class="empty-hint">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function renderFinance() {
    try {
      const data = await api('/api/finance');
      $('#page-finance').innerHTML =
        '<div class="stats">' +
        '<div class="stat-card"><div class="label">Выручка</div><div class="value gold">' + money(data.revenue) + '</div></div>' +
        '<div class="stat-card"><div class="label">Затраты</div><div class="value">' + money(data.cost) + '</div></div>' +
        '<div class="stat-card"><div class="label">Оплачено</div><div class="value ok">' + money(data.paid) + '</div></div>' +
        '<div class="stat-card"><div class="label">Прибыль</div><div class="value">' + money(data.profit) + '</div></div>' +
        '</div>';
    } catch (e) {
      $('#page-finance').innerHTML = '<div class="empty-hint">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function renderInstallers() {
    try {
      const data = await api('/api/installers/balances');
      const list = data.balances || [];
      $('#page-installers').innerHTML =
        '<div class="panel"><div class="panel-head"><h2>Монтажники</h2></div><div class="deal-list">' +
        (list.length
          ? list.map((u) => '<div class="deal-row"><div class="title">' + escapeHtml(u.name) + '</div><div class="meta">Начислено ' + money(u.accrued) + ' · Выплачено ' + money(u.paid) + ' · Баланс ' + money(u.balance) + '</div></div>').join('')
          : '<div class="empty-hint">Нет монтажников</div>') +
        '</div></div>';
    } catch (e) {
      $('#page-installers').innerHTML = '<div class="empty-hint">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function renderStaff() {
    try {
      const data = await api('/api/users');
      $('#page-staff').innerHTML =
        '<div class="panel"><div class="panel-head"><h2>Сотрудники</h2></div><div class="deal-list">' +
        (data.users || []).map((u) => '<div class="deal-row"><div class="title">' + escapeHtml(u.name) + '</div><div class="meta">' + escapeHtml(roleLabel(u.role)) + ' · ' + escapeHtml(u.login) + '</div></div>').join('') +
        '</div></div>';
    } catch (e) {
      $('#page-staff').innerHTML = '<div class="empty-hint">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function renderSettings() {
    try {
      const data = await api('/api/company');
      const c = data.company || {};
      $('#page-settings').innerHTML =
        '<div class="panel"><div class="panel-head"><h2>Компания</h2></div>' +
        '<p><strong>' + escapeHtml(c.name || 'ПЛЕНКИН') + '</strong></p>' +
        '<p class="meta">' + escapeHtml(c.phone || '') + ' · ' + escapeHtml(c.email || '') + '</p>' +
        '<p class="meta">' + escapeHtml(c.address || '') + '</p></div>';
    } catch (e) {
      $('#page-settings').innerHTML = '<div class="empty-hint">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function openDeal(id) {
    try {
      const { deal } = await api('/api/deals/' + id);
      $('#drawerTitle').textContent = deal.title || 'Сделка';
      $('#drawerBody').innerHTML =
        '<div class="field"><label>Название</label><input id="f_title" value="' + escapeHtml(deal.title) + '"></div>' +
        '<div class="field"><label>Этап</label><select id="f_stage">' +
        stages.map((s) => '<option value="' + s.id + '"' + (s.id === deal.stage ? ' selected' : '') + '>' + escapeHtml(s.title) + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Контакт</label><input id="f_contact_name" value="' + escapeHtml(deal.contact_name || '') + '"></div>' +
        '<div class="field"><label>Телефон</label><input id="f_contact_phone" value="' + escapeHtml(deal.contact_phone || '') + '"></div>' +
        '<div class="field"><label>Адрес</label><input id="f_address" value="' + escapeHtml(deal.address || '') + '"></div>' +
        '<div class="field"><label>Замер</label><input id="f_measure_date" type="date" value="' + escapeHtml((deal.measure_date || '').slice(0, 10)) + '"></div>' +
        '<div class="field"><label>Монтаж</label><input id="f_install_date" type="date" value="' + escapeHtml((deal.install_date || '').slice(0, 10)) + '"></div>' +
        '<div class="field"><label>Заметки</label><textarea id="f_notes">' + escapeHtml(deal.notes || '') + '</textarea></div>' +
        '<div class="money-box"><div class="item"><span>Клиенту</span><strong>' + money(deal.money && deal.money.client_total) + '</strong></div>' +
        '<div class="item"><span>Оплачено</span><strong>' + money(deal.money && deal.money.paid_amount) + '</strong></div></div>';
      $('#drawerFoot').innerHTML = '<button type="button" class="btn" id="saveDeal">Сохранить</button>';
      $('#overlay').classList.add('open');
      $('#drawer').classList.add('open');
      $('#saveDeal')?.addEventListener('click', async () => {
        await api('/api/deals/' + deal.id, {
          method: 'PATCH',
          body: {
            title: $('#f_title').value,
            stage: $('#f_stage').value,
            contact_name: $('#f_contact_name').value,
            contact_phone: $('#f_contact_phone').value,
            address: $('#f_address').value,
            measure_date: $('#f_measure_date').value || '',
            install_date: $('#f_install_date').value || '',
            notes: $('#f_notes').value,
          },
        });
        closeDrawer();
        await refreshBoard();
        goPage(currentPage);
      });
    } catch (e) {
      alert(e.message);
    }
  }

  function closeDrawer() {
    $('#overlay')?.classList.remove('open');
    $('#drawer')?.classList.remove('open');
  }
  $('#closeDrawer')?.addEventListener('click', closeDrawer);
  $('#overlay')?.addEventListener('click', closeDrawer);

  $('#newDealBtn')?.addEventListener('click', async () => {
    try {
      const data = await api('/api/deals', { method: 'POST', body: { title: 'Новая заявка', stage: 'lead' } });
      await refreshBoard();
      openDeal(data.id);
      goPage(currentPage);
    } catch (e) {
      alert(e.message);
    }
  });

  async function boot() {
    try {
      const me = await api('/api/me');
      user = me.user;
      stages = me.stages || STAGES_FALLBACK;
      showApp();
      await refreshBoard();
      goPage('dashboard');
    } catch (e) {
      console.error(e);
      $('#page-dashboard').innerHTML = '<div class="empty-hint">Ошибка: ' + escapeHtml(e.message) + '</div>';
      showApp();
    }
  }

  const STAGES_FALLBACK = [
    { id: 'lead', title: 'Заявка' }, { id: 'measure', title: 'Замер' }, { id: 'kp', title: 'КП' },
    { id: 'contract', title: 'Договор' }, { id: 'install', title: 'Монтаж' },
    { id: 'done', title: 'Закрыто' }, { id: 'reject', title: 'Отказ' },
  ];

  boot();
})();
