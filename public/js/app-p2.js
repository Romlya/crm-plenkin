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
