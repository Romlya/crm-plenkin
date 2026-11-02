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
    { id: 'manual', title: 'Вручную' },
    { id: 'site', title: 'Сайт' },
    { id: 'avito', title: 'Авито' },
    { id: 'referral', title: 'Рекомендация' },
    { id: 'call', title: 'Звонок' },
    { id: 'other', title: 'Другое' },
  ];
  const sourceTitle = (id) => (SOURCES.find((s) => s.id === id) || {}).title || id || '—';

  const money = (n) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n || 0);
  const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const roleLabel = (r) => ({ owner: 'Владелец', manager: 'Менеджер', installer: 'Монтажник' }[r] || r);
  const stageTitle = (id) => (stages.find((s) => s.id === id) || {}).title || id;
  const canEdit = () => user && (user.role === 'owner' || user.role === 'manager');
  const isOwner = () => user && user.role === 'owner';
  const fmtDate = (d) => {
    if (!d) return '—';
    const x = String(d).slice(0, 10);
    const [y, m, day] = x.split('-');
    return day && m ? `${day}.${m}.${y}` : x;
  };
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const isOverdue = (d) => {
    if (!d || d.stage === 'done' || d.stage === 'reject') return false;
    const today = todayStr();
    // просрочен замер: дата прошла, этап ещё lead/measure
    if (d.measure_date && String(d.measure_date).slice(0, 10) < today && ['lead', 'measure'].includes(d.stage)) return true;
    // просрочен монтаж: дата прошла, не закрыто
    if (d.install_date && String(d.install_date).slice(0, 10) < today) return true;
    return false;
  };
  const overdueLabel = (d) => {
    if (!isOverdue(d)) return '';
    const today = todayStr();
    if (d.install_date && String(d.install_date).slice(0, 10) < today) return 'просрочен монтаж';
    if (d.measure_date && String(d.measure_date).slice(0, 10) < today) return 'просрочен замер';
    return 'просрочено';
  };
  const dealBalance = (d) => Math.max(0, Number(d.client_total || 0) - Number(d.paid_amount || 0));
  const isDebt = (d) => d && d.stage !== 'reject' && dealBalance(d) > 0.5;
  const weekRange = () => {
    const today = todayStr();
    const end = new Date();
    end.setDate(end.getDate() + 7);
    return { today, endStr: end.toISOString().slice(0, 10) };
  };
  const inThisWeek = (d) => {
    const { today, endStr } = weekRange();
    const m = d.measure_date && String(d.measure_date).slice(0, 10);
    const i = d.install_date && String(d.install_date).slice(0, 10);
    return (m && m >= today && m <= endStr) || (i && i >= today && i <= endStr);
  };

  const normalizePhone = (p) => {
    let n = String(p || '').replace(/\D/g, '');
    if (!n) return '';
    if (n.startsWith('8') && n.length === 11) n = '7' + n.slice(1);
    if (n.length === 10) n = '7' + n;
    return n;
  };
  const phoneLink = (p) => {
    const n = normalizePhone(p);
    if (!n) return '';
    const tel = '+' + n;
    const wa = 'https://wa.me/' + n;
    return `<span class="phone-actions">` +
      `<a class="phone-link" href="tel:${tel}">${escapeHtml(p)}</a>` +
      `<a class="btn-icon" href="tel:${tel}" title="Позвонить">📞</a>` +
      `<a class="btn-icon wa" href="${wa}" target="_blank" rel="noopener" title="WhatsApp">WA</a>` +
      `</span>`;
  };

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

  function showLogin() {
    $('#loginView').classList.remove('hidden');
    $('#appView').classList.add('hidden');
  }
  function showApp() {
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    $('#sideUser').innerHTML = '<strong>' + escapeHtml(user.name) + '</strong>' + escapeHtml(roleLabel(user.role));
    $('#newDealBtn').classList.toggle('hidden', !canEdit());
    $$('.nav-item.mgr').forEach((el) => el.classList.toggle('hidden', user.role === 'installer'));
    $$('.nav-item.own').forEach((el) => el.classList.toggle('hidden', user.role !== 'owner'));
  }

  function closeMenu() {
    $('#sidebar').classList.remove('open');
    $('#sidebarBackdrop').classList.remove('open');
  }
  function openMenu() {
    $('#sidebar').classList.add('open');
    $('#sidebarBackdrop').classList.add('open');
  }
  $('#menuBtn')?.addEventListener('click', openMenu);
  $('#sidebarBackdrop')?.addEventListener('click', closeMenu);

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#loginError').classList.add('hidden');
    try {
      const data = await api('/api/login', { method: 'POST', body: { login: fd.get('login'), password: fd.get('password') } });
      user = data.user;
      await boot();
    } catch (err) {
      $('#loginError').textContent = err.message;
      $('#loginError').classList.remove('hidden');
    }
  });
  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    user = null;
    closeMenu();
    showLogin();
  });

  $$('#sideNav .nav-item').forEach((btn) =>
    btn.addEventListener('click', () => {
      goPage(btn.dataset.page);
      closeMenu();
    })
  );

  function goPage(page) {
    currentPage = page;
    $$('#sideNav .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    $$('.page').forEach((p) => p.classList.add('hidden'));
    const el = $('#page-' + page);
    if (el) el.classList.remove('hidden');
    $('#pageTitle').textContent = titles[page] || page;
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

  async function boot() {
    const me = await api('/api/me');
    user = me.user;
    stages = me.stages;
    showApp();
    if (canEdit()) {
      try {
        const u = await api('/api/users');
        installers = u.users.filter((x) => x.role === 'installer' && x.active);
      } catch {
        installers = [];
      }
      try {
        const c = await api('/api/clients');
        clients = c.clients;
      } catch {
        clients = [];
      }
      try {
        const m = await api('/api/materials');
        materials = m.materials;
      } catch {
        materials = [];
      }
    }
    await refreshBoard();
    goPage(user.role === 'installer' ? 'schedule' : 'dashboard');
  }

  async function refreshBoard() {
    boardData = await api('/api/board');
    stages = boardData.stages;
  }

  function allDeals() {
    if (!boardData || !boardData.board) return [];
    const list = [];
    for (const s of stages) for (const d of (boardData.board[s.id] || [])) list.push(d);
    return list;
  }

  function dealRowHtml(d) {
    const dates = [];
    if (d.measure_date) dates.push('Замер ' + fmtDate(d.measure_date));
    if (d.install_date) dates.push('Монтаж ' + fmtDate(d.install_date));
    const od = isOverdue(d);
    const debt = dealBalance(d);
    const tags = [];
    if (od) tags.push('<span class="tag overdue">' + overdueLabel(d) + '</span>');
    if (isDebt(d)) tags.push('<span class="tag debt">долг ' + money(debt) + '</span>');
    return (
      '<div class="deal-row' +
      (od ? ' overdue' : '') +
      (isDebt(d) ? ' has-debt' : '') +
      '" data-id="' +
      d.id +
      '"><div class="title">' +
      escapeHtml(d.title) +
      (tags.length ? ' ' + tags.join(' ') : '') +
      '</div><span class="stage-pill">' +
      escapeHtml(stageTitle(d.stage)) +
      '</span><div class="meta">' +
      escapeHtml(d.contact_name || d.client_name || '—') +
      (d.contact_phone ? ' · ' + escapeHtml(d.contact_phone) : '') +
      (d.address ? '<br>' + escapeHtml(d.address) : '') +
      (dates.length ? '<br><span class="date-hint' + (od ? ' overdue-text' : '') + '">' + dates.join(' · ') + '</span>' : '') +
      '</div>' +
      (d.client_total
        ? '<div class="money' + (isDebt(d) ? ' danger' : '') + '">' + money(d.client_total) + (isDebt(d) ? '<br><small>долг ' + money(debt) + '</small>' : '') + '</div>'
        : '') +
      '</div>'
    );
  }

  function bindDealRows(root) {
    $$(root + ' .deal-row[data-id]').forEach((row) => row.addEventListener('click', () => openDeal(row.dataset.id)));
  }

  // SEARCH
  let searchTimer = null;
  $('#globalSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = $('#globalSearch').value.trim();
    if (q.length < 2) {
      $('#searchDrop').classList.add('hidden');
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const data = await api('/api/search?q=' + encodeURIComponent(q));
        let html = '';
        if (data.clients?.length) {
          html += '<div class="search-group">Клиенты</div>';
          data.clients.forEach((c) => {
            html +=
              '<button type="button" class="search-item" data-client="' +
              c.id +
              '"><strong>' +
              escapeHtml(c.name) +
              '</strong><span>' +
              escapeHtml(c.phone || '') +
              '</span></button>';
          });
        }
        if (data.deals?.length) {
          html += '<div class="search-group">Сделки</div>';
          data.deals.forEach((d) => {
            html +=
              '<button type="button" class="search-item" data-deal="' +
              d.id +
              '"><strong>' +
              escapeHtml(d.title) +
              '</strong><span>' +
              escapeHtml(stageTitle(d.stage)) +
              ' · ' +
              escapeHtml(d.contact_phone || d.client_name || '') +
              '</span></button>';
          });
        }
        if (!html) html = '<div class="search-empty">Ничего не найдено</div>';
        $('#searchDrop').innerHTML = html;
        $('#searchDrop').classList.remove('hidden');
        $$('#searchDrop [data-deal]').forEach((b) =>
          b.addEventListener('click', () => {
            $('#searchDrop').classList.add('hidden');
            $('#globalSearch').value = '';
            openDeal(b.dataset.deal);
          })
        );
        $$('#searchDrop [data-client]').forEach((b) =>
          b.addEventListener('click', () => {
            $('#searchDrop').classList.add('hidden');
            $('#globalSearch').value = '';
            goPage('clients');
            openClientCard(b.dataset.client);
          })
        );
      } catch {}
    }, 250);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) $('#searchDrop')?.classList.add('hidden');
  });

  // DASHBOARD
  function renderDashboard() {
    const deals = allDeals();
    const active = deals.filter((d) => d.stage !== 'done' && d.stage !== 'reject');
    const done = deals.filter((d) => d.stage === 'done');
    const sum = (arr) => arr.reduce((s, d) => s + (Number(d.client_total) || 0), 0);
    const recent = [...deals].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 8);
    const today = todayStr();
    const upcoming = deals
      .filter((d) => (d.measure_date && d.measure_date >= today) || (d.install_date && d.install_date >= today))
      .sort((a, b) => {
        const da = a.measure_date || a.install_date || '9999';
        const db = b.measure_date || b.install_date || '9999';
        return da < db ? -1 : 1;
      })
      .slice(0, 6);
    const unpaid = deals.filter(isDebt);
    const debtSum = unpaid.reduce((s, d) => s + dealBalance(d), 0);
    const weekDeals = deals.filter(inThisWeek);
    const overdue = deals.filter((d) => isOverdue(d)).sort((a, b) => {
      const da = a.install_date || a.measure_date || '9999';
      const db = b.install_date || b.measure_date || '9999';
      return da < db ? -1 : 1;
    });
    const srcMap = {};
    for (const d of deals) {
      const s = d.source || 'manual';
      srcMap[s] = (srcMap[s] || 0) + 1;
    }

    $('#page-dashboard').innerHTML = `
      <div class="stats">
        <div class="stat-card"><div class="label">В работе</div><div class="value">${active.length}</div></div>
        <div class="stat-card"><div class="label">Закрыто</div><div class="value ok">${done.length}</div></div>
        <div class="stat-card"><div class="label">Сумма в работе</div><div class="value gold">${money(sum(active))}</div></div>
        <div class="stat-card clickable" id="statDebt"><div class="label">Долги клиентов</div><div class="value ${debtSum > 0 ? 'danger' : 'ok'}">${money(debtSum)}</div><div class="sub">${unpaid.length} сдел.</div></div>
      </div>
      <div class="quick-chips dash-chips">
        <button type="button" class="qchip danger" id="dashOverdue">⚠ Просрочено <span class="qnum">${overdue.length}</span></button>
        <button type="button" class="qchip warn" id="dashDebt">Долги <span class="qnum">${unpaid.length}</span></button>
        <button type="button" class="qchip" id="dashWeek">На неделе <span class="qnum">${weekDeals.length}</span></button>
        <button type="button" class="qchip" id="dashAllDeals">Все сделки</button>
      </div>
      ${overdue.length ? `<div class="panel panel-danger"><div class="panel-head"><h2>⚠ Просрочено (${overdue.length})</h2>
          <button type="button" class="btn btn-ghost btn-sm" id="goOverdueDeals">Все</button></div>
          <div class="deal-list">${overdue.slice(0, 8).map((d) => {
            return '<div class="deal-row overdue" data-id="' + d.id + '"><div class="title">' + escapeHtml(d.title) +
              '</div><span class="tag overdue">' + overdueLabel(d) + '</span><div class="meta">' +
              escapeHtml(d.address || d.contact_name || '') +
              (d.measure_date ? '<br>замер ' + fmtDate(d.measure_date) : '') +
              (d.install_date ? ' · монтаж ' + fmtDate(d.install_date) : '') +
              (isDebt(d) ? '<br><span class="tag debt">долг ' + money(dealBalance(d)) + '</span>' : '') +
              '</div></div>';
          }).join('')}</div></div>` : ''}
      <div class="panel"><div class="panel-head"><h2>Воронка</h2></div>
        <div class="funnel">${stages
          .map((s) => {
            const n = ((boardData && boardData.board && boardData.board[s.id]) || []).length;
            return '<div class="funnel-item"><div class="n">' + n + '</div><div class="t">' + escapeHtml(s.title) + '</div></div>';
          })
          .join('')}</div>
      </div>
      <div class="dash-grid">
        <div class="panel"><div class="panel-head"><h2>Ближайшие выезды</h2>
          <button type="button" class="btn btn-ghost btn-sm" id="goSchedule">Весь график</button></div>
          <div class="deal-list">${
            upcoming.length
              ? upcoming
                  .map((d) => {
                    const bits = [];
                    if (d.measure_date && d.measure_date >= today) bits.push('<span class="tag measure">Замер ' + fmtDate(d.measure_date) + '</span>');
                    if (d.install_date && d.install_date >= today) bits.push('<span class="tag install">Монтаж ' + fmtDate(d.install_date) + '</span>');
                    return (
                      '<div class="deal-row" data-id="' +
                      d.id +
                      '"><div class="title">' +
                      escapeHtml(d.title) +
                      '</div><div class="meta">' +
                      bits.join(' ') +
                      '<br>' +
                      escapeHtml(d.address || d.contact_name || '') +
                      '</div></div>'
                    );
                  })
                  .join('')
              : '<div class="empty-hint">Нет запланированных дат — укажите дату замера/монтажа в сделке</div>'
          }</div>
        </div>
        <div class="panel"><div class="panel-head"><h2>Долги клиентов</h2></div>
          <div class="deal-list">${
            unpaid.length
              ? unpaid
                  .slice(0, 8)
                  .map((d) => {
                    const bal = Number(d.client_total) - Number(d.paid_amount || 0);
                    return (
                      '<div class="deal-row" data-id="' +
                      d.id +
                      '"><div class="title">' +
                      escapeHtml(d.title) +
                      '</div><div class="money danger">' +
                      money(bal) +
                      '</div></div>'
                    );
                  })
                  .join('')
              : '<div class="empty-hint">Нет долгов</div>'
          }</div>
        </div>
      </div>
      <div class="panel"><div class="panel-head"><h2>Источники заявок</h2></div>
        <div class="funnel">${Object.keys(srcMap)
          .map((k) => '<div class="funnel-item"><div class="n">' + srcMap[k] + '</div><div class="t">' + escapeHtml(sourceTitle(k)) + '</div></div>')
          .join('') || '<div class="empty-hint">Нет данных</div>'}</div>
      </div>
      <div class="panel"><div class="panel-head"><h2>Последние сделки</h2></div>
        <div class="deal-list">${recent.length ? recent.map(dealRowHtml).join('') : '<div class="empty-hint">Нет сделок — нажмите «+ Заявка»</div>'}</div>
      </div>`;
    bindDealRows('#page-dashboard');
    $('#goSchedule')?.addEventListener('click', () => goPage('schedule'));
    const goDealsFiltered = (q) => {
      goPage('deals');
      setTimeout(() => {
        const chip = document.querySelector('#dealChips .qchip[data-q="' + q + '"]');
        if (chip) chip.click();
        else if (!q) {
          const all = document.querySelector('#dealChips .qchip[data-q=""]');
          if (all) all.click();
        }
      }, 50);
    };
    $('#dashOverdue')?.addEventListener('click', () => goDealsFiltered('overdue'));
    $('#dashDebt')?.addEventListener('click', () => goDealsFiltered('debt'));
    $('#dashWeek')?.addEventListener('click', () => goDealsFiltered('week'));
    $('#dashAllDeals')?.addEventListener('click', () => goDealsFiltered(''));
    $('#goOverdueDeals')?.addEventListener('click', () => goDealsFiltered('overdue'));
    $('#statDebt')?.addEventListener('click', () => goDealsFiltered('debt'));
  }

  // BOARD
  function renderBoard() {
    const board = $('#board');
    board.innerHTML = '';
    for (const s of stages) {
      const items = (boardData && boardData.board[s.id]) || [];
      const col = document.createElement('div');
      col.className = 'column';
      col.innerHTML =
        '<div class="column-head"><h2>' +
        escapeHtml(s.title) +
        '</h2><span class="count">' +
        items.length +
        '</span></div><div class="column-body"></div>';
      const body = col.querySelector('.column-body');
      for (const d of items) {
        const card = document.createElement('div');
        const od = isOverdue(d);
        card.className = 'card' + (od ? ' overdue' : '');
        const tags = [];
        if (od) tags.push('<span class="tag overdue">' + overdueLabel(d) + '</span>');
        if (d.measure_date) tags.push('<span class="tag measure">Замер ' + fmtDate(d.measure_date) + '</span>');
        if (d.install_date) tags.push('<span class="tag install">Монтаж ' + fmtDate(d.install_date) + '</span>');
        const bal = Number(d.client_total || 0) - Number(d.paid_amount || 0);
        const paidHint = d.client_total
          ? bal > 0
            ? '<span class="card-debt">долг ' + money(bal) + '</span>'
            : '<span class="card-paid">оплачено</span>'
          : '';
        card.innerHTML =
          '<div class="card-title">' +
          escapeHtml(d.title) +
          '</div><div class="card-meta">' +
          escapeHtml(d.contact_name || d.client_name || '—') +
          (d.contact_phone ? ' · ' + escapeHtml(d.contact_phone) : '') +
          (d.address ? '<br>' + escapeHtml(d.address) : '') +
          (d.installer_name ? '<br>👷 ' + escapeHtml(d.installer_name) : '') +
          (tags.length ? '<br>' + tags.join(' ') : '') +
          '</div>' +
          (d.client_total
            ? '<div class="card-money">' + money(d.client_total) + ' ' + paidHint + '</div>'
            : '');
        card.addEventListener('click', () => openDeal(d.id));
        body.appendChild(card);
      }
      board.appendChild(col);
    }
  }

  // SCHEDULE
  async function renderSchedule() {
    let data;
    try {
      data = await api('/api/schedule');
    } catch (e) {
      $('#page-schedule').innerHTML = '<div class="empty-hint">' + e.message + '</div>';
      return;
    }
    const today = todayStr();
    const items = data.items || [];
    const past = items.filter((i) => i.date < today);
    const soon = items.filter((i) => i.date >= today);

    function row(i) {
      const typeLabel = i.type === 'measure' ? 'Замер' : 'Монтаж';
      const cls = i.type === 'measure' ? 'tag measure' : 'tag install';
      const past = i.date < today;
      return (
        '<div class="sched-row' + (past ? ' overdue' : '') + '" data-id="' +
        i.deal_id +
        '">' +
        '<div class="sched-date">' +
        fmtDate(i.date) +
        '</div>' +
        '<span class="' +
        cls +
        '">' +
        typeLabel +
        '</span>' +
        '<div class="sched-body"><strong>' +
        escapeHtml(i.title) +
        '</strong>' +
        '<div class="meta">' +
        escapeHtml(i.address || '') +
        (i.contact_phone ? ' · ' + escapeHtml(i.contact_phone) : '') +
        (i.installer_name ? ' · ' + escapeHtml(i.installer_name) : '') +
        '</div></div></div>'
      );
    }

    $('#page-schedule').innerHTML = `
      <div class="panel"><div class="panel-head"><h2>Предстоящие (${soon.length})</h2></div>
        <div>${soon.length ? soon.map(row).join('') : '<div class="empty-hint">Нет запланированных выездов. В карточке сделки укажите дату замера и/или монтажа.</div>'}</div>
      </div>
      ${
        past.length
          ? '<div class="panel"><div class="panel-head"><h2>Прошедшие (без закрытия)</h2></div><div>' +
            past
              .slice(-15)
              .reverse()
              .map(row)
              .join('') +
            '</div></div>'
          : ''
      }`;
    $$('#page-schedule .sched-row').forEach((r) => r.addEventListener('click', () => openDeal(r.dataset.id)));
  }

  // DEALS LIST
  function renderDeals() {
    const all = allDeals();
    const nDebt = all.filter(isDebt).length;
    const nOver = all.filter(isOverdue).length;
    const nWeek = all.filter(inThisWeek).length;
    const debtSum = all.filter(isDebt).reduce((s, d) => s + dealBalance(d), 0);
    const deals = all.slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    $('#page-deals').innerHTML = `
      <div class="quick-chips" id="dealChips">
        <button type="button" class="qchip active" data-q="">Все <span class="qnum">${all.length}</span></button>
        <button type="button" class="qchip danger" data-q="overdue">Просрочено <span class="qnum">${nOver}</span></button>
        <button type="button" class="qchip warn" data-q="debt">Долги <span class="qnum">${nDebt}</span></button>
        <button type="button" class="qchip" data-q="week">На неделе <span class="qnum">${nWeek}</span></button>
      </div>
      ${debtSum > 0 ? '<div class="debt-banner">Сумма долгов клиентов: <strong>' + money(debtSum) + '</strong> · ' + nDebt + ' сдел.</div>' : ''}
      <div class="panel">
        <div class="panel-head"><h2 id="dealsTitle">Все сделки (${deals.length})</h2>
          <div class="filter-row">
            <select id="dealFilter" class="select-sm"><option value="">Все этапы</option>${stages
              .map((s) => '<option value="' + s.id + '">' + escapeHtml(s.title) + '</option>')
              .join('')}</select>
          </div>
        </div>
        <div id="dealsList" class="deal-list">${deals.map(dealRowHtml).join('') || '<div class="empty-hint">Нет сделок</div>'}</div>
      </div>`;
    let quick = '';
    function applyDealFilters() {
      const f = $('#dealFilter').value;
      let list = allDeals();
      if (f) list = list.filter((d) => d.stage === f);
      if (quick === 'debt') list = list.filter(isDebt);
      if (quick === 'overdue') list = list.filter(isOverdue);
      if (quick === 'week') list = list.filter(inThisWeek);
      list.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
      const labels = { '': 'Все сделки', debt: 'С долгом', overdue: 'Просроченные', week: 'На этой неделе' };
      $('#dealsTitle').textContent = (labels[quick] || 'Сделки') + ' (' + list.length + ')';
      $('#dealsList').innerHTML = list.map(dealRowHtml).join('') || '<div class="empty-hint">Нет сделок по фильтру</div>';
      bindDealRows('#dealsList');
    }
    $$('#dealChips .qchip').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('#dealChips .qchip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        quick = btn.dataset.q || '';
        applyDealFilters();
      });
    });
    $('#dealFilter').onchange = applyDealFilters;
    bindDealRows('#dealsList');
  }

  // CLIENTS
  async function renderClients() {
    try {
      const c = await api('/api/clients');
      clients = c.clients;
    } catch {
      clients = [];
    }
    $('#page-clients').innerHTML = `
      <div class="toolbar-row"><h2>База клиентов</h2>
        <button type="button" class="btn btn-sm" id="addClient">+ Клиент</button>
      </div>
      <div class="panel"><div id="clientsBox">
        ${
          clients.length
            ? clients
                .map(
                  (c) => `
          <div class="client-row" data-id="${c.id}">
            <strong>${escapeHtml(c.name)}</strong>
            <span class="meta">${escapeHtml(c.company || '')}</span>
            <span class="meta">${escapeHtml(c.phone || '')}</span>
            <span class="badge">${c.deals_count || 0} сделок</span>
            <span class="money">${money(c.deals_sum)}</span>
            <button type="button" class="btn btn-ghost btn-sm" data-open="${c.id}">Карточка</button>
            <button type="button" class="btn btn-ghost btn-sm" data-edit="${c.id}">Изм.</button>
          </div>`
                )
                .join('')
            : '<div class="empty-hint">Клиентов пока нет</div>'
        }
      </div></div>`;
    $('#addClient')?.addEventListener('click', () => editClient(null));
    $$('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        editClient(btn.dataset.edit);
      })
    );
    $$('[data-open]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openClientCard(btn.dataset.open);
      })
    );
  }

  async function openClientCard(id) {
    const data = await api('/api/clients/' + id);
    const c = data.client;
    const deals = data.deals || [];
    openForm(
      'Клиент: ' + (c.name || ''),
      `
      <div class="client-card-info">
        <p><strong>${escapeHtml(c.name)}</strong></p>
        <p class="meta">${escapeHtml(c.company || '')}</p>
        <p>${c.phone ? phoneLink(c.phone) : '—'} ${c.email ? ' · ' + escapeHtml(c.email) : ''}</p>
        ${c.inn ? '<p class="meta">ИНН ' + escapeHtml(c.inn) + '</p>' : ''}
        ${c.notes ? '<p class="meta">' + escapeHtml(c.notes) + '</p>' : ''}
      </div>
      <div class="section-title">Сделки клиента (${deals.length})</div>
      <div class="deal-list">${
        deals.length
          ? deals
              .map(
                (d) =>
                  '<div class="deal-row" data-id="' +
                  d.id +
                  '"><div class="title">' +
                  escapeHtml(d.title) +
                  '</div><span class="stage-pill">' +
                  escapeHtml(stageTitle(d.stage)) +
                  '</span><div class="money">' +
                  money(d.client_total) +
                  '</div></div>'
              )
              .join('')
          : '<div class="empty-hint">Нет сделок</div>'
      }</div>
    `,
      null,
      true
    );
    $$('#drawerBody .deal-row[data-id]').forEach((row) =>
      row.addEventListener('click', () => {
        closeDrawer();
        openDeal(row.dataset.id);
      })
    );
  }

  function editClient(id) {
    const c = id ? clients.find((x) => x.id === id) : { name: '', phone: '', email: '', company: '', inn: '', notes: '' };
    openForm(
      'Клиент',
      `
      <div class="field"><label>Имя / название</label><input id="c_name" value="${escapeHtml(c.name || '')}"></div>
      <div class="field"><label>Компания</label><input id="c_company" value="${escapeHtml(c.company || '')}"></div>
      <div class="grid-2">
        <div class="field"><label>Телефон</label><input id="c_phone" value="${escapeHtml(c.phone || '')}"></div>
        <div class="field"><label>Email</label><input id="c_email" value="${escapeHtml(c.email || '')}"></div>
      </div>
      <div class="field"><label>ИНН</label><input id="c_inn" value="${escapeHtml(c.inn || '')}"></div>
      <div class="field"><label>Заметки</label><textarea id="c_notes">${escapeHtml(c.notes || '')}</textarea></div>
    `,
      async () => {
        const body = {
          name: $('#c_name').value,
          company: $('#c_company').value,
          phone: $('#c_phone').value,
          email: $('#c_email').value,
          inn: $('#c_inn').value,
          notes: $('#c_notes').value,
        };
        if (id) await api('/api/clients/' + id, { method: 'PATCH', body });
        else await api('/api/clients', { method: 'POST', body });
        closeDrawer();
        renderClients();
      }
    );
  }

  // MATERIALS + STOCK
  async function renderMaterials() {
    try {
      const m = await api('/api/materials');
      materials = m.materials;
    } catch {
      materials = [];
    }
    $('#page-materials').innerHTML = `
      <div class="toolbar-row"><h2>Склад плёнок и материалов</h2>
        <button type="button" class="btn btn-sm" id="addMat">+ Позиция</button>
      </div>
      <div class="panel"><div class="table-wrap"><table class="table">
        <thead><tr><th>Название</th><th>Категория</th><th>Остаток</th><th>Закуп ₽</th><th>Клиенту ₽</th><th></th></tr></thead>
        <tbody>
          ${
            materials
              .map((m) => {
                const low = m.category !== 'работа' && Number(m.stock_qty) < 10;
                return `<tr>
            <td>${escapeHtml(m.title)}</td><td>${escapeHtml(m.category || '')}</td>
            <td class="${low ? 'stock-low' : ''}">${m.category === 'работа' ? '—' : Number(m.stock_qty || 0) + ' ' + (m.unit || 'м²')}</td>
            <td>${m.cost_price}</td><td>${m.sell_price}</td>
            <td><button type="button" class="btn btn-ghost btn-sm" data-mat="${m.id}">Изм.</button></td>
          </tr>`;
              })
              .join('') || '<tr><td colspan="6">Пусто</td></tr>'
          }
        </tbody>
      </table></div></div>
      <p class="muted" style="padding:0 4px">Остаток подсвечивается, если меньше 10 м². При списании со склада уменьшайте остаток вручную после монтажа.</p>`;
    $('#addMat')?.addEventListener('click', () => editMat(null));
    $$('[data-mat]').forEach((btn) => btn.addEventListener('click', () => editMat(btn.dataset.mat)));
  }

  function editMat(id) {
    const m = id ? materials.find((x) => x.id === id) : { title: '', category: '', cost_price: 0, sell_price: 0, unit: 'м²', stock_qty: 0 };
    openForm(
      'Материал',
      `
      <div class="field"><label>Название</label><input id="m_title" value="${escapeHtml(m.title || '')}"></div>
      <div class="field"><label>Категория</label><input id="m_cat" value="${escapeHtml(m.category || '')}" placeholder="защита / солнце / декор / работа"></div>
      <div class="grid-2">
        <div class="field"><label>Закуп ₽</label><input id="m_cost" type="number" value="${m.cost_price || 0}"></div>
        <div class="field"><label>Клиенту ₽</label><input id="m_sell" type="number" value="${m.sell_price || 0}"></div>
      </div>
      <div class="field"><label>Остаток на складе (${m.unit || 'м²'})</label><input id="m_stock" type="number" step="0.1" value="${m.stock_qty || 0}"></div>
    `,
      async () => {
        const body = {
          title: $('#m_title').value,
          category: $('#m_cat').value,
          cost_price: Number($('#m_cost').value) || 0,
          sell_price: Number($('#m_sell').value) || 0,
          stock_qty: Number($('#m_stock').value) || 0,
        };
        if (id) await api('/api/materials/' + id, { method: 'PATCH', body });
        else await api('/api/materials', { method: 'POST', body });
        closeDrawer();
        renderMaterials();
      }
    );
  }

  // FINANCE
  async function renderFinance(from, to) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    let data;
    try {
      data = await api('/api/finance' + (params.toString() ? '?' + params : ''));
    } catch (e) {
      $('#page-finance').innerHTML = '<div class="empty-hint">' + e.message + '</div>';
      return;
    }
    const s = data.summary;
    const monthStart = (() => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    })();
    $('#page-finance').innerHTML = `
      <div class="toolbar-row">
        <h2>Период</h2>
        <input type="date" id="finFrom" class="select-sm" value="${escapeHtml(from || '')}">
        <input type="date" id="finTo" class="select-sm" value="${escapeHtml(to || '')}">
        <button type="button" class="btn btn-ghost btn-sm" id="finApply">Показать</button>
        <button type="button" class="btn btn-ghost btn-sm" id="finMonth">Этот месяц</button>
        <button type="button" class="btn btn-ghost btn-sm" id="finAll">Всё время</button>
      </div>
      <div class="stats">
        <div class="stat-card"><div class="label">Выручка (сметы)</div><div class="value gold">${money(s.client_total)}</div></div>
        <div class="stat-card"><div class="label">Оплачено клиентами</div><div class="value ok">${money(s.income)}</div></div>
        <div class="stat-card"><div class="label">Прибыль (расчёт)</div><div class="value">${money(s.profit)}</div></div>
        <div class="stat-card"><div class="label">Касса</div><div class="value gold">${money(s.cash)}</div></div>
      </div>
      <div class="panel"><div class="panel-head"><h2>Структура затрат (все сделки)</h2></div>
        <div class="fin-line"><span>Плёнка (закуп)</span><span class="amt minus">− ${money(s.film_cost)}</span></div>
        <div class="fin-line"><span>Монтаж (себест.)</span><span class="amt minus">− ${money(s.install_cost)}</span></div>
        <div class="fin-line"><span>Прочее по сделкам</span><span class="amt minus">− ${money(s.other_cost)}</span></div>
        <div class="fin-line"><span>Начислено монтажникам</span><span class="amt minus">− ${money(s.accruals)}</span></div>
        <div class="fin-line"><span>Выплачено монтажникам</span><span class="amt minus">− ${money(s.payouts)}</span></div>
        <div class="fin-line"><span>Прочие расходы</span><span class="amt minus">− ${money(s.expenses)}</span></div>
      </div>
      <div class="toolbar-row"><h2>Прочие расходы</h2>
        ${isOwner() ? '<button type="button" class="btn btn-sm" id="addExp">+ Расход</button>' : ''}
      </div>
      <div class="panel">
        ${(data.expenses || []).map((e) => '<div class="fin-line"><span>' + escapeHtml(e.title) + (e.paid_at ? ' · ' + fmtDate(e.paid_at) : '') + '</span><span class="amt minus">− ' + money(e.amount) + '</span></div>').join('') || '<div class="empty-hint">Нет расходов</div>'}
      </div>
      <div class="panel"><div class="panel-head"><h2>Оплаты от клиентов</h2></div>
        ${(data.payments || [])
          .slice(0, 20)
          .map((p) => '<div class="fin-line fin-click" data-deal="' + (p.deal_id || '') + '"><span>' + escapeHtml(p.deal_title || 'Сделка') + (p.note ? ' · ' + escapeHtml(p.note) : '') + ' · ' + fmtDate(p.paid_at) + '</span><span class="amt plus">+ ' + money(p.amount) + '</span></div>')
          .join('') || '<div class="empty-hint">Нет оплат</div>'}
      </div>`;
    $('#finApply')?.addEventListener('click', () => renderFinance($('#finFrom').value, $('#finTo').value));
    $('#finMonth')?.addEventListener('click', () => renderFinance(monthStart, todayStr()));
    $('#finAll')?.addEventListener('click', () => renderFinance('', ''));
    $$('.fin-click[data-deal]').forEach((el) => {
      if (!el.dataset.deal) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => openDeal(el.dataset.deal));
    });
    $('#addExp')?.addEventListener('click', () => {
      openForm(
        'Расход',
        `
        <div class="field"><label>Название</label><input id="e_title" placeholder="Аренда, бензин, реклама..."></div>
        <div class="field"><label>Сумма ₽</label><input id="e_amount" type="number"></div>
        <div class="field"><label>Дата</label><input id="e_date" type="date" value="${todayStr()}"></div>
        <div class="field"><label>Комментарий</label><input id="e_note"></div>
      `,
        async () => {
          await api('/api/expenses', {
            method: 'POST',
