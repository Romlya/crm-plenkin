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
            body: {
              title: $('#e_title').value,
              amount: Number($('#e_amount').value),
              note: $('#e_note').value,
              paid_at: ($('#e_date').value || todayStr()) + 'T12:00:00.000Z',
            },
          });
          closeDrawer();
          renderFinance(from, to);
        }
      );
    });
  }

  // INSTALLERS
  async function renderInstallers() {
    const data = await api('/api/installers/balances');
    const deals = allDeals();
    $('#page-installers').innerHTML = `
      <div class="panel"><div class="panel-head"><h2>Взаиморасчёты с монтажниками</h2></div>
        ${
          data.balances
            .map((b) => {
              const myDeals = deals.filter((d) => d.installer_id === b.id && d.stage !== 'done' && d.stage !== 'reject');
              return `
          <div class="inst-block">
            <div class="inst-row">
              <strong>${escapeHtml(b.name)}</strong>
              <span class="badge">${b.active_jobs || myDeals.length} в работе</span>
              <span class="badge">начисл. ${money(b.accrued)}</span>
              <span class="badge">выплач. ${money(b.paid)}</span>
              <span class="badge ${b.debt > 0 ? 'warn' : ''}">долг ${money(b.debt)}</span>
              ${isOwner() ? '<button type="button" class="btn btn-ghost btn-sm" data-pay="' + b.id + '" data-name="' + escapeHtml(b.name) + '">Выплата</button>' : ''}
            </div>
            ${
              myDeals.length
                ? '<div class="inst-deals">' +
                  myDeals
                    .map(
                      (d) =>
                        '<div class="deal-row" data-id="' +
                        d.id +
                        '"><div class="title">' +
                        escapeHtml(d.title) +
                        '</div><span class="stage-pill">' +
                        escapeHtml(stageTitle(d.stage)) +
                        '</span>' +
                        (d.install_date ? '<span class="date-hint">монтаж ' + fmtDate(d.install_date) + '</span>' : '') +
                        '</div>'
                    )
                    .join('') +
                  '</div>'
                : '<div class="muted" style="padding:4px 16px 12px">Нет активных сделок</div>'
            }
          </div>`;
            })
            .join('') || '<div class="empty-hint">Нет монтажников — добавьте в разделе «Сотрудники»</div>'
        }
      </div>`;
    bindDealRows('#page-installers');
    $$('[data-pay]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const amount = Number(prompt('Выплата: ' + btn.dataset.name + '. Сумма ₽:'));
        if (!amount) return;
        await api('/api/installers/payouts', { method: 'POST', body: { installer_id: btn.dataset.pay, amount } });
        renderInstallers();
      })
    );
  }

  // STAFF
  async function renderStaff() {
    const data = await api('/api/users');
    $('#page-staff').innerHTML = `
      <div class="toolbar-row"><h2>Сотрудники</h2>
        <button type="button" class="btn btn-sm" id="addUser">+ Сотрудник</button>
      </div>
      <div class="panel">
        ${data.users
          .map(
            (u) => `
          <div class="staff-row">
            <strong>${escapeHtml(u.name)}</strong>
            <span class="badge">${escapeHtml(roleLabel(u.role))}</span>
            <span class="meta">${escapeHtml(u.login)}</span>
            <span class="meta">${u.active ? 'активен' : 'откл.'}</span>
            <button type="button" class="btn btn-ghost btn-sm" data-user="${u.id}">Изменить</button>
          </div>`
          )
          .join('')}
      </div>`;
    $('#addUser')?.addEventListener('click', () => editUser(null));
    $$('[data-user]').forEach((btn) => btn.addEventListener('click', () => editUser(btn.dataset.user, data.users)));
  }

  function editUser(id, list) {
    const u = id && list ? list.find((x) => x.id === id) : { name: '', login: '', role: 'manager', phone: '', active: 1 };
    openForm(
      id ? 'Сотрудник' : 'Новый сотрудник',
      `
      <div class="field"><label>Имя</label><input id="u_name" value="${escapeHtml(u.name || '')}"></div>
      ${!id ? '<div class="field"><label>Логин</label><input id="u_login" value=""></div>' : ''}
      <div class="field"><label>${id ? 'Новый пароль (пусто = не менять)' : 'Пароль'}</label><input id="u_pass" type="password"></div>
      <div class="field"><label>Роль</label><select id="u_role">
        <option value="owner" ${u.role === 'owner' ? 'selected' : ''}>Владелец</option>
        <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Менеджер</option>
        <option value="installer" ${u.role === 'installer' ? 'selected' : ''}>Монтажник</option>
      </select></div>
      <div class="field"><label>Телефон</label><input id="u_phone" value="${escapeHtml(u.phone || '')}"></div>
      ${
        id
          ? '<div class="field"><label>Статус</label><select id="u_active"><option value="1" ' +
            (u.active ? 'selected' : '') +
            '>Активен</option><option value="0" ' +
            (!u.active ? 'selected' : '') +
            '>Отключён</option></select></div>'
          : ''
      }
    `,
      async () => {
        if (id) {
          const body = { name: $('#u_name').value, role: $('#u_role').value, phone: $('#u_phone').value, active: Number($('#u_active').value) };
          if ($('#u_pass').value) body.password = $('#u_pass').value;
          await api('/api/users/' + id, { method: 'PATCH', body });
        } else {
          await api('/api/users', {
            method: 'POST',
            body: {
              name: $('#u_name').value,
              login: $('#u_login').value,
              password: $('#u_pass').value,
              role: $('#u_role').value,
              phone: $('#u_phone').value,
            },
          });
        }
        closeDrawer();
        renderStaff();
      }
    );
  }

  // SETTINGS
  async function renderSettings() {
    const data = await api('/api/company');
    const c = data.company || {};
    $('#page-settings').innerHTML = `
      <div class="panel"><div class="panel-head"><h2>Реквизиты компании</h2></div>
        <div style="padding:16px">
          <div class="field"><label>Название</label><input id="co_name" value="${escapeHtml(c.name || '')}"></div>
          <div class="grid-2">
            <div class="field"><label>Телефон</label><input id="co_phone" value="${escapeHtml(c.phone || '')}"></div>
            <div class="field"><label>Email</label><input id="co_email" value="${escapeHtml(c.email || '')}"></div>
          </div>
          <div class="field"><label>Адрес</label><input id="co_address" value="${escapeHtml(c.address || '')}"></div>
          <div class="field"><label>ИНН</label><input id="co_inn" value="${escapeHtml(c.inn || '')}"></div>
          <button type="button" class="btn" id="saveCo">Сохранить</button>
        </div>
      </div>
      <div class="panel"><div class="panel-head"><h2>Резервная копия</h2></div>
        <div style="padding:16px">
          <p class="muted" style="margin-bottom:12px">На Vercel данные хранятся во временной папке и могут сброситься. Регулярно скачивайте копию. На VPS sweb файл data/plenkin.json — постоянный.</p>
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
            <button type="button" class="btn" id="btnExport">⬇ Скачать базу</button>
            <label class="btn btn-ghost" style="cursor:pointer;margin:0">
              ⬆ Загрузить базу
              <input type="file" id="importFile" accept=".json,application/json" style="display:none">
            </label>
          </div>
          <p class="muted" id="importStatus"></p>
        </div>
      </div>
      <div class="panel" style="padding:16px">
        <p class="muted">Доступы по умолчанию (когда включим логин): owner / plenkin2026 · manager / manager2026 · installer / montage2026</p>
      </div>`;
    $('#saveCo')?.addEventListener('click', async () => {
      await api('/api/company', {
        method: 'PATCH',
        body: {
          name: $('#co_name').value,
          phone: $('#co_phone').value,
          email: $('#co_email').value,
          address: $('#co_address').value,
          inn: $('#co_inn').value,
        },
      });
      alert('Сохранено');
    });
    $('#btnExport')?.addEventListener('click', async () => {
      try {
        const r = await fetch('/api/export');
        if (!r.ok) throw new Error('Ошибка экспорта');
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'plenkin-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) {
        alert(e.message);
      }
    });
    $('#importFile')?.addEventListener('change', async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      if (!confirm('Внимание! Текущие данные будут полностью заменены файлом «' + f.name + '». Продолжить?')) {
        ev.target.value = '';
        return;
      }
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        const res = await api('/api/import', { method: 'POST', body: data });
        $('#importStatus').textContent = 'Готово: ' + (res.deals || 0) + ' сделок, ' + (res.clients || 0) + ' клиентов, ' + (res.users || 0) + ' сотрудников. Обновите страницу.';
        alert('База восстановлена. Обновите страницу (F5).');
        location.reload();
      } catch (e) {
        alert('Ошибка загрузки: ' + e.message);
      }
      ev.target.value = '';
    });
  }

  // GENERIC FORM DRAWER

  async function printSmeta(deal) {
    let company = { name: 'ПЛЕНКИН', phone: '', email: '', address: '', inn: '' };
    try {
      const r = await api('/api/company');
      company = r.company || company;
    } catch (_) {}
    const m = deal.money || {};
    const lines = deal.lines || [];
    const linesHtml = lines.length
      ? lines.map((l, i) => {
          const qty = Number(l.qty) || 0;
          const sell = Number(l.sell_price) || 0;
          const sum = qty * sell;
          return `<tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(l.title || '')}</td>
            <td class="num">${qty}</td>
            <td>${escapeHtml(l.unit || 'м²')}</td>
            <td class="num">${money(sell)}</td>
            <td class="num">${money(sum)}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:#888">Позиции не добавлены</td></tr>';
    const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Смета — ${escapeHtml(deal.title || '')}</title>
<style>
  *{box-sizing:border-box} body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#111;font-size:14px;line-height:1.45}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:16px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .muted{color:#666;font-size:12px} .head{display:flex;justify-content:space-between;gap:16px;margin-bottom:20px}
  .co strong{font-size:18px} table{width:100%;border-collapse:collapse;margin:8px 0 16px}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left} th{background:#f5f5f5;font-weight:600}
  .num{text-align:right;white-space:nowrap} .totals{margin-top:12px;width:280px;margin-left:auto}
  .totals .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee}
  .totals .row.big{font-weight:700;font-size:15px;border-bottom:2px solid #111;margin-top:6px}
  .foot{margin-top:32px;font-size:12px;color:#555;display:flex;justify-content:space-between}
  @media print{body{margin:12mm} .no-print{display:none!important}}
</style></head><body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer">🖨 Печать</button>
    <button onclick="window.close()" style="padding:8px 16px;font-size:14px;cursor:pointer;margin-left:8px">Закрыть</button>
  </div>
  <div class="head">
    <div class="co">
      <strong>${escapeHtml(company.name || 'ПЛЕНКИН')}</strong><br>
      ${company.phone ? 'тел. ' + escapeHtml(company.phone) + '<br>' : ''}
      ${company.email ? escapeHtml(company.email) + '<br>' : ''}
      ${company.address ? escapeHtml(company.address) + '<br>' : ''}
      ${company.inn ? 'ИНН ' + escapeHtml(company.inn) : ''}
    </div>
    <div style="text-align:right">
      <div class="muted">Смета / коммерческое предложение</div>
      <div>${fmtDate(new Date().toISOString())}</div>
      <div class="muted">№ ${escapeHtml(String(deal.id || '').slice(0, 8))}</div>
    </div>
  </div>
  <h1>${escapeHtml(deal.title || 'Смета')}</h1>
  <p>
    <strong>Клиент:</strong> ${escapeHtml(deal.contact_name || '—')}<br>
    ${deal.contact_phone ? '<strong>Тел.:</strong> ' + escapeHtml(deal.contact_phone) + '<br>' : ''}
    ${deal.address ? '<strong>Адрес:</strong> ' + escapeHtml(deal.address) + '<br>' : ''}
    ${deal.measure_date ? '<strong>Замер:</strong> ' + fmtDate(deal.measure_date) + '<br>' : ''}
    ${deal.install_date ? '<strong>Монтаж:</strong> ' + fmtDate(deal.install_date) : ''}
  </p>
  <h2>Состав работ и материалов</h2>
  <table>
    <thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Сумма</th></tr></thead>
    <tbody>${linesHtml}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Итого по смете</span><span>${money(m.client_total)}</span></div>
    <div class="row"><span>Оплачено</span><span>${money(m.paid_amount)}</span></div>
    <div class="row big"><span>К оплате</span><span>${money(m.balance)}</span></div>
  </div>
  ${deal.notes ? '<h2>Примечания</h2><p>' + escapeHtml(deal.notes) + '</p>' : ''}
  <div class="foot">
    <div>Менеджер: ${escapeHtml(user && user.name || '')}</div>
    <div>Документ сформирован в CRM ПЛЕНКИН</div>
  </div>
  <script>setTimeout(function(){ window.print(); }, 300);<\/script>
</body></html>`;
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!w) return alert('Разрешите всплывающие окна для печати');
    w.document.write(html);
    w.document.close();
  }

  async function duplicateDeal(deal) {
    if (!confirm('Создать копию этой сделки?')) return;
    try {
      const body = {
        title: (deal.title || 'Заявка') + ' (копия)',
        stage: 'lead',
        source: deal.source || 'manual',
        client_id: deal.client_id || null,
        contact_name: deal.contact_name || '',
        contact_phone: deal.contact_phone || '',
        contact_email: deal.contact_email || '',
        address: deal.address || '',
        notes: deal.notes || '',
        measure_notes: deal.measure_notes || '',
        install_cost: Number(deal.install_cost) || 0,
        other_cost: Number(deal.other_cost) || 0,
      };
      const created = await api('/api/deals', { method: 'POST', body });
      const newId = created.id || (created.deal && created.deal.id);
      if (newId && (deal.lines || []).length) {
        const lines = (deal.lines || []).map((l) => ({
          material_id: l.material_id || null,
          title: l.title,
          qty: l.qty,
          unit: l.unit || 'м²',
          cost_price: l.cost_price,
          sell_price: l.sell_price,
        }));
        await api('/api/deals/' + newId + '/lines', { method: 'PUT', body: { lines } });
      }
      await refreshBoard();
      openDeal(newId);
      if (currentPage === 'board') renderBoard();
      if (currentPage === 'deals') renderDeals();
      if (currentPage === 'dashboard') renderDashboard();
    } catch (e) {
      alert(e.message || 'Не удалось скопировать');
    }
  }

  function openForm(title, bodyHtml, onSave, readOnly) {
    $('#drawerTitle').textContent = title;
    $('#drawerBody').innerHTML = bodyHtml;
    if (readOnly || !onSave) {
      $('#drawerFoot').innerHTML = '';
    } else {
      $('#drawerFoot').innerHTML = '<button type="button" class="btn" id="formSave">Сохранить</button>';
      $('#formSave').onclick = () => onSave().catch((e) => alert(e.message));
    }
    openDrawer();
  }

  // NEW DEAL
  $('#newDealBtn').addEventListener('click', async () => {
    const data = await api('/api/deals', { method: 'POST', body: { title: 'Новая заявка', stage: 'lead' } });
    await refreshBoard();
    goPage('board');
    openDeal(data.id);
  });

  function openDrawer() {
    $('#overlay').classList.add('open');
    $('#drawer').classList.add('open');
  }
  function closeDrawer() {
    $('#overlay').classList.remove('open');
    $('#drawer').classList.remove('open');
  }
  $('#overlay').addEventListener('click', closeDrawer);
  $('#closeDrawer').addEventListener('click', closeDrawer);

  async function openDeal(id) {
    const { deal } = await api('/api/deals/' + id);
    renderDeal(deal);
    openDrawer();
  }

  function renderDeal(deal) {
    const edit = canEdit();
    $('#drawerTitle').textContent = deal.title || 'Сделка';
    const stageOpts = stages.map((s) => '<option value="' + s.id + '"' + (deal.stage === s.id ? ' selected' : '') + '>' + s.title + '</option>').join('');
    const instOpts = ['<option value="">— не назначен —</option>']
      .concat(installers.map((i) => '<option value="' + i.id + '"' + (deal.installer_id === i.id ? ' selected' : '') + '>' + escapeHtml(i.name) + '</option>'))
      .join('');
    const clientOpts = ['<option value="">— без клиента —</option>']
      .concat(clients.map((c) => '<option value="' + c.id + '"' + (deal.client_id === c.id ? ' selected' : '') + '>' + escapeHtml(c.name) + (c.phone ? ' · ' + escapeHtml(c.phone) : '') + '</option>'))
      .join('');
    const matOpts = materials
      .map((m) => {
        const isWork = m.category === 'работа';
        const stock = Number(m.stock_qty) || 0;
        const low = !isWork && stock < 10;
        const stockLabel = isWork ? '' : ' · ост. ' + stock + ' ' + (m.unit || 'м²') + (low ? ' ⚠' : '');
        return (
          '<option value="' +
          m.id +
          '" data-cost="' +
          m.cost_price +
          '" data-sell="' +
          m.sell_price +
          '" data-title="' +
          escapeHtml(m.title) +
          '" data-unit="' +
          escapeHtml(m.unit || 'м²') +
          '" data-stock="' +
          stock +
          '" data-cat="' +
          escapeHtml(m.category || '') +
          '">' +
          escapeHtml(m.title) +
          ' (' +
          money(m.sell_price) +
          '/' +
          (m.unit || 'м²') +
          stockLabel +
          ')</option>'
        );
      })
      .join('');
    const srcOpts = SOURCES.map((s) => '<option value="' + s.id + '"' + ((deal.source || 'manual') === s.id ? ' selected' : '') + '>' + s.title + '</option>').join('');
    const m = deal.money || {};
    const profitClass = (m.profit || 0) >= 0 ? 'profit' : 'profit neg';
    const stagePills = stages
      .map(
        (s) =>
          '<button type="button" class="stage-chip' +
          (deal.stage === s.id ? ' active' : '') +
          '" data-stage="' +
          s.id +
          '">' +
          escapeHtml(s.title) +
          '</button>'
      )
      .join('');

    if (edit) {
      $('#drawerBody').innerHTML = `
      <div class="stage-chips">${stagePills}</div>
      <input type="hidden" id="f_stage" value="${escapeHtml(deal.stage || 'lead')}">

      <div class="section-title">Основное</div>
      <div class="field"><label>Название заявки</label><input id="f_title" value="${escapeHtml(deal.title)}"></div>
      <div class="grid-2">
        <div class="field"><label>Источник</label><select id="f_source">${srcOpts}</select></div>
        <div class="field"><label>Монтажник</label><select id="f_installer">${instOpts}</select></div>
      </div>

      <div class="section-title">Клиент и объект
        ${deal.client_id ? '<button type="button" class="btn btn-ghost btn-sm" id="openClientFromDeal" style="margin-left:8px">Карточка клиента</button>' : ''}
        <button type="button" class="btn btn-ghost btn-sm" id="newClientFromDeal" style="margin-left:8px">+ Новый клиент</button>
      </div>
      <div class="field"><label>Клиент из базы</label><select id="f_client">${clientOpts}</select></div>
      <div class="grid-2">
        <div class="field"><label>Контактное лицо</label><input id="f_contact_name" value="${escapeHtml(deal.contact_name || '')}" placeholder="ФИО"></div>
        <div class="field"><label>Телефон</label>
          <div class="phone-row">
            <input id="f_contact_phone" value="${escapeHtml(deal.contact_phone || '')}" placeholder="+7...">
            <span id="phoneQuick" class="phone-quick"></span>
          </div>
        </div>
      </div>
      <div class="field"><label>Адрес объекта</label><input id="f_address" value="${escapeHtml(deal.address || '')}" placeholder="Город, улица, дом"></div>

      <div class="section-title">Даты и выезд</div>
      <div class="grid-2">
        <div class="field"><label>Дата замера</label><input id="f_measure_date" type="date" value="${escapeHtml((deal.measure_date || '').slice(0, 10))}"></div>
        <div class="field"><label>Дата монтажа</label><input id="f_install_date" type="date" value="${escapeHtml((deal.install_date || '').slice(0, 10))}"></div>
      </div>
      <div class="field"><label>Заметки по замеру</label><textarea id="f_measure_notes" placeholder="Размеры, особенности объекта...">${escapeHtml(deal.measure_notes || '')}</textarea></div>
      <div class="field"><label>Общие заметки</label><textarea id="f_notes">${escapeHtml(deal.notes || '')}</textarea></div>

      <div class="section-title">Смета (плёнка и работы)</div>
      ${materials.length ? '<div class="field"><label>Добавить из склада</label><select id="matPick"><option value="">— выбрать позицию —</option>' + matOpts + '</select></div>' : '<p class="muted" style="margin-bottom:8px">Справочник пуст — добавьте плёнки в разделе «Склад»</p>'}
      <div id="stockWarn" class="stock-warn hidden"></div>
      <div class="table-wrap"><table class="table" id="linesTable">
        <thead><tr><th>Название</th><th>Кол-во</th><th>Ед.</th><th>Закуп ₽</th><th>Клиенту ₽</th><th>Сумма</th><th></th></tr></thead>
        <tbody>${(deal.lines || [])
          .map((l) => {
            const mat = l.material_id ? materials.find((x) => x.id === l.material_id) : null;
            const unit = (l.unit || (mat && mat.unit) || 'м²');
            const stock = mat && mat.category !== 'работа' ? Number(mat.stock_qty) || 0 : null;
            const qty = Number(l.qty) || 0;
            const over = stock != null && qty > stock;
            const lineSum = qty * (Number(l.sell_price) || 0);
            return (
              '<tr' +
              (l.material_id ? ' data-material-id="' + escapeHtml(String(l.material_id)) + '"' : '') +
              (stock != null ? ' data-stock="' + stock + '"' : '') +
              (over ? ' class="line-overstock"' : '') +
              '><td><input data-f="title" value="' +
              escapeHtml(l.title) +
              '"></td><td><input data-f="qty" type="number" step="0.01" min="0" value="' +
              l.qty +
              '"></td><td class="unit-cell">' +
              escapeHtml(unit) +
              '</td><td><input data-f="cost_price" type="number" value="' +
              l.cost_price +
              '"></td><td><input data-f="sell_price" type="number" value="' +
              l.sell_price +
              '"></td><td class="line-sum">' +
              money(lineSum) +
              '</td><td><button type="button" class="btn btn-ghost btn-sm del-line" title="Удалить">×</button></td></tr>'
            );
          })
          .join('')}</tbody>
      </table></div>
      <div class="lines-totals" id="linesTotals"></div>
      <button type="button" class="btn btn-ghost btn-sm" id="addLine" style="margin-top:8px">+ Своя строка</button>

      <div class="section-title">Себестоимость вне сметы</div>
      <div class="grid-2">
        <div class="field"><label>Монтаж (себест.) ₽</label><input id="f_install_cost" type="number" value="${deal.install_cost || 0}"></div>
        <div class="field"><label>Прочие расходы ₽</label><input id="f_other_cost" type="number" value="${deal.other_cost || 0}"></div>
      </div>

      <div class="section-title">Итоги по сделке</div>
      <div class="money-box">
        <div class="item"><span>Смета клиенту</span><strong>${money(m.client_total)}</strong></div>
        <div class="item"><span>Оплачено</span><strong>${money(m.paid_amount)}</strong></div>
        <div class="item"><span>Остаток долга</span><strong style="color:${(m.balance || 0) > 0 ? 'var(--danger)' : 'var(--ok)'}">${money(m.balance)}</strong></div>
        <div class="item"><span>Плёнка (закуп)</span><strong>${money(m.film_cost)}</strong></div>
        <div class="item"><span>Начисл. монтажникам</span><strong>${money(m.installer_accruals)}</strong></div>
        <div class="item ${profitClass}"><span>Прибыль</span><strong>${money(m.profit)}</strong></div>
      </div>
      ${deal.stock_deducted
        ? '<div class="stock-badge ok">✓ Склад списан' + (deal.stock_deducted_at ? ' · ' + fmtDate(deal.stock_deducted_at) : '') + '</div>'
        : (deal.stage === 'install' || deal.stage === 'done'
          ? '<div class="stock-badge warn">Склад ещё не списан — сохраните или смените этап ещё раз</div>'
          : '<div class="stock-badge">Склад спишется автоматически при переходе в «Монтаж» или «Закрыто»</div>')}

      <div class="section-title">Оплаты от клиента</div>
      ${(deal.payments || []).length
        ? (deal.payments || []).map((p) => '<div class="fin-line"><span>' + fmtDate(p.paid_at) + (p.note ? ' · ' + escapeHtml(p.note) : '') + '</span><span class="amt plus">+ ' + money(p.amount) + '</span></div>').join('')
        : '<div class="muted" style="margin-bottom:8px">Оплат пока нет</div>'}
      <div class="grid-2"><div class="field"><label>Сумма ₽</label><input id="pay_amount" type="number" placeholder="0"></div><div class="field"><label>Комментарий</label><input id="pay_note" placeholder="Наличные / перевод"></div></div>
      <button type="button" class="btn btn-ghost btn-sm" id="addPayment">+ Внести оплату</button>

      <div class="section-title">Начисления монтажникам</div>
      ${(deal.accruals || []).length
        ? (deal.accruals || []).map((a) => '<div class="fin-line"><span>' + escapeHtml(a.installer_name || '') + (a.note ? ' · ' + escapeHtml(a.note) : '') + '</span><span class="amt minus">− ' + money(a.amount) + '</span></div>').join('')
        : '<div class="muted" style="margin-bottom:8px">Начислений пока нет</div>'}
      <div class="grid-2"><div class="field"><label>Монтажник</label><select id="acc_installer">${instOpts}</select></div><div class="field"><label>Сумма ₽</label><input id="acc_amount" type="number" placeholder="0"></div></div>
      <button type="button" class="btn btn-ghost btn-sm" id="addAccrual" style="margin-top:8px">+ Начислить</button>
    `;
    } else {
      $('#drawerBody').innerHTML = `
      <div class="stage-chips"><span class="stage-chip active">${escapeHtml(stageTitle(deal.stage))}</span></div>
      <div class="client-card-info">
        <p><strong>${escapeHtml(deal.title)}</strong></p>
        <p class="meta">Адрес: ${escapeHtml(deal.address || '—')}</p>
        <p>Контакт: ${escapeHtml(deal.contact_name || '—')} ${deal.contact_phone ? phoneLink(deal.contact_phone) : ''}</p>
        <p class="meta">Замер: ${fmtDate(deal.measure_date)} · Монтаж: ${fmtDate(deal.install_date)}</p>
        ${deal.installer_name ? '<p class="meta">Монтажник: ' + escapeHtml(deal.installer_name) + '</p>' : ''}
        ${deal.measure_notes ? '<p class="meta">Замер: ' + escapeHtml(deal.measure_notes) + '</p>' : ''}
        ${deal.notes ? '<p class="meta">' + escapeHtml(deal.notes) + '</p>' : ''}
      </div>
      ${(deal.lines || []).length ? '<div class="section-title">Смета</div><div class="table-wrap"><table class="table"><thead><tr><th>Позиция</th><th>Кол-во</th><th>Сумма</th></tr></thead><tbody>' +
        (deal.lines || []).map((l) => '<tr><td>' + escapeHtml(l.title) + '</td><td>' + l.qty + '</td><td>' + money((l.qty || 0) * (l.sell_price || 0)) + '</td></tr>').join('') +
        '</tbody></table></div>' : ''}
      <div class="section-title">Деньги</div>
      <div class="money-box">
        <div class="item"><span>Смета</span><strong>${money(m.client_total)}</strong></div>
        <div class="item"><span>Оплачено</span><strong>${money(m.paid_amount)}</strong></div>
        <div class="item ${profitClass}"><span>Прибыль</span><strong>${money(m.profit)}</strong></div>
      </div>`;
    }

    $('#drawerFoot').innerHTML = edit
      ? '<button type="button" class="btn" id="saveDeal">Сохранить</button>' +
        '<button type="button" class="btn btn-ghost" id="printDeal">🖨 Смета</button>' +
        '<button type="button" class="btn btn-ghost" id="dupDeal">⧉ Копия</button>' +
        (isOwner() ? '<button type="button" class="btn btn-ghost" id="delDeal">Удалить</button>' : '')
      : '<button type="button" class="btn btn-ghost" id="printDeal">🖨 Смета</button>';

    if (!edit) return;

    // Stage chips → change stage immediately
    $$('.stage-chip[data-stage]').forEach((chip) => {
      chip.addEventListener('click', async () => {
        const st = chip.dataset.stage;
        if (st === deal.stage) return;
        try {
          await api('/api/deals/' + deal.id, { method: 'PATCH', body: { stage: st } });
          await refreshBoard();
          openDeal(deal.id);
          if (currentPage === 'board') renderBoard();
          if (currentPage === 'dashboard') renderDashboard();
          if (currentPage === 'deals') renderDeals();
          if (currentPage === 'schedule') renderSchedule();
        } catch (e) {
          alert(e.message);
        }
      });
    });

    // Client select → autofill contact
    $('#f_client')?.addEventListener('change', () => {
      const cid = $('#f_client').value;
      if (!cid) return;
      const c = clients.find((x) => x.id === cid);
      if (!c) return;
      if (c.name && !$('#f_contact_name').value) $('#f_contact_name').value = c.name;
      if (c.phone && !$('#f_contact_phone').value) $('#f_contact_phone').value = c.phone;
    });


    function refreshPhoneQuick() {
      const el = $('#phoneQuick');
      if (!el) return;
      const p = ($('#f_contact_phone') && $('#f_contact_phone').value) || deal.contact_phone || '';
      el.innerHTML = phoneLink(p) || '';
    }
    refreshPhoneQuick();
    $('#f_contact_phone')?.addEventListener('input', refreshPhoneQuick);

    $('#openClientFromDeal')?.addEventListener('click', () => {
      if (deal.client_id) {
        closeDrawer();
        openClientCard(deal.client_id);
      }
    });

    $('#newClientFromDeal')?.addEventListener('click', () => {
      const name = ($('#f_contact_name').value || '').trim() || prompt('Имя клиента:');
      if (!name) return;
      const phone = ($('#f_contact_phone').value || '').trim();
      (async () => {
        try {
          const res = await api('/api/clients', { method: 'POST', body: { name, phone } });
          const c = await api('/api/clients');
          clients = c.clients;
          const created = res.client || clients.find((x) => x.id === res.id) || clients[clients.length - 1];
          if (created) {
            const sel = $('#f_client');
            if (sel) {
              const opt = document.createElement('option');
              opt.value = created.id;
              opt.textContent = created.name + (created.phone ? ' · ' + created.phone : '');
              opt.selected = true;
              sel.appendChild(opt);
              sel.value = created.id;
            }
            await api('/api/deals/' + deal.id, { method: 'PATCH', body: { client_id: created.id, contact_name: name, contact_phone: phone } });
            alert('Клиент создан и привязан');
          }
        } catch (e) {
          alert(e.message);
        }
      })();
    });

    function recalcLines() {
      let clientSum = 0, costSum = 0, overList = [];
      $$('#linesTable tbody tr').forEach((tr) => {
        const qty = Number(tr.querySelector('[data-f="qty"]')?.value) || 0;
        const cost = Number(tr.querySelector('[data-f="cost_price"]')?.value) || 0;
        const sell = Number(tr.querySelector('[data-f="sell_price"]')?.value) || 0;
        const title = tr.querySelector('[data-f="title"]')?.value || 'Позиция';
        const lineSum = qty * sell;
        clientSum += lineSum;
        costSum += qty * cost;
        const sumEl = tr.querySelector('.line-sum');
        if (sumEl) sumEl.textContent = money(lineSum);
        const stock = tr.dataset.stock !== undefined && tr.dataset.stock !== '' ? Number(tr.dataset.stock) : null;
        if (stock != null && qty > stock) {
          tr.classList.add('line-overstock');
          overList.push(title + ': нужно ' + qty + ', на складе ' + stock);
        } else {
          tr.classList.remove('line-overstock');
        }
      });
      const totals = $('#linesTotals');
      if (totals) {
        totals.innerHTML =
          '<div class="lines-totals-inner">' +
          '<span>Итого клиенту: <strong>' + money(clientSum) + '</strong></span>' +
          '<span>Закуп: <strong>' + money(costSum) + '</strong></span>' +
          '<span>Маржа: <strong class="' + (clientSum - costSum >= 0 ? 'ok' : 'neg') + '">' + money(clientSum - costSum) + '</strong></span>' +
          '</div>';
      }
      const warn = $('#stockWarn');
      if (warn) {
        if (overList.length) {
          warn.classList.remove('hidden');
          warn.innerHTML = '⚠ Не хватает на складе:<br>' + overList.map((x) => '· ' + escapeHtml(x)).join('<br>');
        } else {
          warn.classList.add('hidden');
          warn.innerHTML = '';
        }
      }
    }

    function bindLineRow(tr) {
      tr.querySelector('.del-line')?.addEventListener('click', () => {
        tr.remove();
        recalcLines();
      });
      $$('[data-f]', tr).forEach((inp) => {
        inp.addEventListener('input', recalcLines);
        inp.addEventListener('change', recalcLines);
      });
    }

    $$('#linesTable tbody tr').forEach(bindLineRow);
    recalcLines();

    $('#matPick')?.addEventListener('change', (e) => {
      const opt = e.target.selectedOptions[0];
      if (!opt || !opt.value) return;
      const stock = opt.dataset.stock !== undefined ? Number(opt.dataset.stock) : null;
      const isWork = opt.dataset.cat === 'работа';
      const tr = document.createElement('tr');
      tr.dataset.materialId = opt.value;
      if (!isWork && stock != null) tr.dataset.stock = String(stock);
      const unit = opt.dataset.unit || 'м²';
      tr.innerHTML =
        '<td><input data-f="title" value="' +
        opt.dataset.title +
        '"></td><td><input data-f="qty" type="number" step="0.01" min="0" value="1"></td><td class="unit-cell">' +
        escapeHtml(unit) +
        '</td><td><input data-f="cost_price" type="number" value="' +
        opt.dataset.cost +
        '"></td><td><input data-f="sell_price" type="number" value="' +
        opt.dataset.sell +
        '"></td><td class="line-sum">' +
        money(Number(opt.dataset.sell) || 0) +
        '</td><td><button type="button" class="btn btn-ghost btn-sm del-line">×</button></td>';
      $('#linesTable tbody').appendChild(tr);
      bindLineRow(tr);
      recalcLines();
      if (!isWork && stock != null && stock < 1) {
        alert('Внимание: на складе «' + opt.dataset.title + '» остаток ' + stock + ' ' + unit);
      }
      e.target.value = '';
    });

    $('#addLine')?.addEventListener('click', () => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input data-f="title" value="Позиция"></td><td><input data-f="qty" type="number" step="0.01" min="0" value="1"></td><td class="unit-cell">м²</td><td><input data-f="cost_price" type="number" value="0"></td><td><input data-f="sell_price" type="number" value="0"></td><td class="line-sum">0 ₽</td><td><button type="button" class="btn btn-ghost btn-sm del-line">×</button></td>';
      $('#linesTable tbody').appendChild(tr);
      bindLineRow(tr);
      recalcLines();
    });

    async function saveLines() {
      const lines = $$('#linesTable tbody tr').map((tr) => {
        const get = (f) => tr.querySelector('[data-f="' + f + '"]')?.value;
        const unit = tr.querySelector('.unit-cell')?.textContent?.trim() || 'м²';
        return {
          material_id: tr.dataset.materialId || null,
          title: get('title'),
          qty: Number(get('qty')) || 0,
          cost_price: Number(get('cost_price')) || 0,
          sell_price: Number(get('sell_price')) || 0,
          unit: unit,
        };
      });
      await api('/api/deals/' + deal.id + '/lines', { method: 'PUT', body: { lines } });
    }

    async function afterDealChange() {
      await refreshBoard();
      openDeal(deal.id);
      if (currentPage === 'dashboard') renderDashboard();
      if (currentPage === 'board') renderBoard();
      if (currentPage === 'deals') renderDeals();
      if (currentPage === 'schedule') renderSchedule();
      if (currentPage === 'finance') renderFinance();
      if (currentPage === 'installers') renderInstallers();
      if (currentPage === 'clients') renderClients();
    }

    $('#printDeal')?.addEventListener('click', () => printSmeta(deal));
    $('#dupDeal')?.addEventListener('click', () => duplicateDeal(deal));

    $('#saveDeal')?.addEventListener('click', async () => {
      try {
        await api('/api/deals/' + deal.id, {
          method: 'PATCH',
          body: {
            title: $('#f_title').value,
            stage: $('#f_stage').value,
            source: $('#f_source').value,
            client_id: $('#f_client').value || null,
            contact_name: $('#f_contact_name').value,
            contact_phone: $('#f_contact_phone').value,
            address: $('#f_address').value,
            installer_id: $('#f_installer').value || null,
            notes: $('#f_notes').value,
            measure_notes: $('#f_measure_notes').value,
            measure_date: $('#f_measure_date').value || '',
            install_date: $('#f_install_date').value || '',
            install_cost: Number($('#f_install_cost').value) || 0,
            other_cost: Number($('#f_other_cost').value) || 0,
          },
        });
        await saveLines();
        await afterDealChange();
      } catch (e) {
        alert(e.message);
      }
    });

    $('#delDeal')?.addEventListener('click', async () => {
      if (!confirm('Удалить сделку безвозвратно?')) return;
      await api('/api/deals/' + deal.id, { method: 'DELETE' });
      closeDrawer();
      await refreshBoard();
      if (currentPage === 'dashboard') renderDashboard();
      if (currentPage === 'board') renderBoard();
      if (currentPage === 'deals') renderDeals();
      if (currentPage === 'schedule') renderSchedule();
    });

    $('#addPayment')?.addEventListener('click', async () => {
      const amount = Number($('#pay_amount').value);
      if (!amount) return alert('Укажите сумму оплаты');
      try {
        await api('/api/deals/' + deal.id + '/payments', { method: 'POST', body: { amount, note: $('#pay_note').value } });
        await afterDealChange();
      } catch (e) {
        alert(e.message);
      }
    });

    $('#addAccrual')?.addEventListener('click', async () => {
      const installer_id = $('#acc_installer').value;
      const amount = Number($('#acc_amount').value);
      if (!installer_id || !amount) return alert('Выберите монтажника и укажите сумму');
      try {
        await api('/api/deals/' + deal.id + '/accruals', { method: 'POST', body: { installer_id, amount, assign: true } });
        await afterDealChange();
      } catch (e) {
        alert(e.message);
      }
    });
  }

  api('/api/me')
    .then((me) => {
      user = me.user;
      stages = me.stages;
      return boot();
    })
    .catch((err) => {
      console.error(err);
      user = { id: 'local', login: 'owner', name: 'Владелец', role: 'owner' };
      stages = stages.length ? stages : [
        { id: 'lead', title: 'Заявка' }, { id: 'measure', title: 'Замер' }, { id: 'kp', title: 'КП' },
        { id: 'contract', title: 'Договор' }, { id: 'install', title: 'Монтаж' },
        { id: 'done', title: 'Закрыто' }, { id: 'reject', title: 'Отказ' },
      ];
      showApp();
      refreshBoard().then(() => goPage('dashboard')).catch(() => {
        $('#page-dashboard').innerHTML = '<div class="empty-hint">Не удалось загрузить данные</div>';
      });
    });
})();
