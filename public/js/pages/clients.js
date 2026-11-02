// Клиенты

import { state, get, actions } from '../store.js';
import { esc, icon, fmtMoney, fmtDate, initials, telHref, waHref, statusBadge, plural } from '../util.js';
import { emptyState, pageHead, toast } from '../ui.js';
import { openClientForm, deleteEntity } from '../forms.js';

export const clientsPage = {
  title: () => 'Клиенты',

  render() {
    const query = state.ui.clientQuery.trim().toLowerCase();
    const clients = get.clients()
      .filter((client) => {
        if (!query) return true;
        return `${client.name} ${client.phone} ${client.email} ${client.company} ${client.address}`.toLowerCase().includes(query);
      })
      .sort((a, b) => get.clientStats(b.id).total - get.clientStats(a.id).total);

    const totalRevenue = get.clients().reduce((acc, client) => acc + get.clientStats(client.id).paid, 0);
    const totalDebt = get.clients().reduce((acc, client) => acc + get.clientStats(client.id).debt, 0);

    return `
      ${pageHead({
        title: 'Клиенты',
        subtitle: `${get.clients().length} ${plural(get.clients().length, ['клиент', 'клиента', 'клиентов'])} · оплачено ${fmtMoney(totalRevenue, true)} · долги ${fmtMoney(totalDebt, true)}`,
        actions: `<button class="btn" data-act="export">${icon('download')} <span class="desktop-only">CSV</span></button>
          <button class="btn primary" data-act="new">${icon('plus')} Новый клиент</button>`,
      })}
      <div class="toolbar">
        <div class="search-box">
          ${icon('search')}
          <input class="input" id="clientSearch" placeholder="Имя, телефон, компания" value="${esc(state.ui.clientQuery)}" />
        </div>
      </div>
      ${!get.clients().length ? emptyState({
        icon: 'clients',
        title: 'Клиентов пока нет',
        text: 'Клиенты создаются автоматически при конвертации лида или вручную.',
        action: `<button class="btn primary mt" data-act="new">${icon('plus')} Добавить клиента</button>`,
      }) : !clients.length ? emptyState({ icon: 'search', title: 'Ничего не найдено' }) : `
      <div class="card flush">
        <div class="list" style="--cols: 1.7fr 1fr 1fr 1fr 0.8fr">
          <div class="list-head"><span>Клиент</span><span>Источник</span><span>Заказы</span><span>Долг</span><span class="right">С нами</span></div>
          ${clients.map((client) => {
            const stats = get.clientStats(client.id);
            return `<a class="row" href="#/clients/${client.id}">
              <div class="cell">
                <div class="row-title"><span class="avatar sm">${esc(initials(client.name))}</span><span class="truncate">${esc(client.name)}</span></div>
                <div class="row-sub">${esc(client.phone || '—')}${client.company ? ` · ${esc(client.company)}` : ''}</div>
              </div>
              <div class="cell hide-sm">
                <span class="cell-label">Источник</span>
                <span class="row-sub" style="color:var(--text)">${esc(client.source || '—')}</span>
              </div>
              <div class="cell">
                <span class="cell-label">Заказы</span>
                <span class="row-value sm">${stats.orders} · ${fmtMoney(stats.total, true)}</span>
              </div>
              <div class="cell hide-sm">
                <span class="cell-label">Долг</span>
                <span class="row-sub" style="color:${stats.debt ? 'var(--red)' : 'var(--dim)'}">${stats.debt ? fmtMoney(stats.debt) : 'нет'}</span>
              </div>
              <div class="cell right">
                <span class="cell-label">С нами</span>
                <span class="row-sub">${fmtDate(client.createdAt)}</span>
              </div>
            </a>`;
          }).join('')}
        </div>
      </div>`}
    `;
  },

  mount(root) {
    const search = root.querySelector('#clientSearch');
    if (search) {
      let timer;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.ui.clientQuery = search.value;
          const position = search.selectionStart;
          rerender();
          const next = document.querySelector('#clientSearch');
          if (next) { next.focus(); next.setSelectionRange(position, position); }
        }, 220);
      });
    }
    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'new') { await openClientForm(); rerender(); }
      if (action === 'export') window.open('/api/export/clients', '_blank');
    });
  },
};

// ───────────────────────────── карточка клиента

export const clientDetailPage = {
  title: (params) => get.client(params.id)?.name || 'Клиент',

  render(params) {
    const client = get.client(params.id);
    if (!client) {
      return `<div class="card">${emptyState({ icon: 'alert', title: 'Клиент не найден', action: '<a class="btn mt" href="#/clients">К клиентам</a>' })}</div>`;
    }
    const stats = get.clientStats(client.id);
    const orders = get.orders().filter((o) => o.clientId === client.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const leads = get.leads().filter((l) => l.clientId === client.id || (l.phone && l.phone === client.phone));
    const payments = get.payments()
      .filter((p) => orders.some((o) => o.id === p.orderId))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return `
      <div style="margin-bottom:16px"><a href="#/clients" class="card-link">← Все клиенты</a></div>
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
          <span class="avatar lg">${esc(initials(client.name))}</span>
          <div style="flex:1;min-width:220px">
            <h1 class="page-title" style="font-size:23px">${esc(client.name)}</h1>
            <div class="muted" style="font-size:13px;margin-top:4px">${esc([client.company, client.source].filter(Boolean).join(' · ') || 'Клиент')}</div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:13px">
              ${client.phone ? `<a class="card-link" href="${telHref(client.phone)}">${icon('phone')} ${esc(client.phone)}</a>` : ''}
              ${client.email ? `<a class="card-link" href="mailto:${esc(client.email)}">${icon('mail')} ${esc(client.email)}</a>` : ''}
              ${client.address ? `<span class="dim">${esc(client.address)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" data-act="edit">${icon('edit')} Изменить</button>
            <button class="btn danger" data-act="delete">${icon('trash')}</button>
          </div>
        </div>
      </div>

      <div class="grid kpi">
        <div class="kpi"><div class="kpi-top">Заказов</div><div class="kpi-value">${stats.orders}</div><div class="kpi-foot">всего на ${fmtMoney(stats.total, true)}</div></div>
        <div class="kpi"><div class="kpi-top">Оплачено</div><div class="kpi-value">${fmtMoney(stats.paid)}</div></div>
        <div class="kpi"><div class="kpi-top">Долг</div><div class="kpi-value ${stats.debt ? 'red' : ''}">${fmtMoney(stats.debt)}</div></div>
        <div class="kpi"><div class="kpi-top">Средний чек</div><div class="kpi-value">${fmtMoney(stats.orders ? stats.total / stats.orders : 0)}</div></div>
      </div>

      <div class="detail-grid mt">
        <div style="display:grid;gap:16px">
          <section class="card flush">
            <div class="topper"><span class="topper-title">Заказы клиента</span></div>
            ${orders.length ? `<div class="list" style="--cols:1.4fr 1fr 1fr 0.8fr">
              ${orders.map((order) => `
                <a class="row" href="#/orders/${order.id}">
                  <div class="cell">
                    <div class="row-title"><span class="mono dim">${esc(order.number)}</span></div>
                    <div class="row-sub">${esc(order.title)}</div>
                  </div>
                  <div class="cell"><span class="cell-label">Сумма</span><span class="row-value sm">${fmtMoney(order.amount)}</span></div>
                  <div class="cell"><span class="cell-label">Статус</span>${statusBadge(order.status)}</div>
                  <div class="cell right"><span class="row-sub">${fmtDate(order.createdAt)}</span></div>
                </a>`).join('')}
            </div>` : emptyState({ icon: 'orders', title: 'Заказов нет', compact: true })}
          </section>

          <section class="card flush">
            <div class="topper"><span class="topper-title">Оплаты</span></div>
            ${payments.length ? `<div class="list" style="--cols:1fr 1fr 0.8fr">
              ${payments.map((payment) => {
                const order = get.order(payment.orderId);
                return `<a class="row" href="#/orders/${order?.id || ''}">
                  <div class="cell"><div class="row-title">${fmtMoney(payment.amount)}</div><div class="row-sub">${fmtDate(payment.date)}</div></div>
                  <div class="cell"><span class="row-sub">${esc(order?.number || '')}</span></div>
                  <div class="cell right"><span class="badge green">получено</span></div>
                </a>`;
              }).join('')}
            </div>` : emptyState({ icon: 'wallet', title: 'Оплат нет', compact: true })}
          </section>
        </div>

        <div style="display:grid;gap:16px">
          <section class="card">
            <div class="card-head"><div class="card-title">Контакты</div></div>
            <dl class="kv">
              <div class="kv-row"><dt>Телефон</dt><dd>${esc(client.phone || '—')}</dd></div>
              <div class="kv-row"><dt>Email</dt><dd>${esc(client.email || '—')}</dd></div>
              <div class="kv-row"><dt>Компания</dt><dd>${esc(client.company || '—')}</dd></div>
              <div class="kv-row"><dt>Адрес</dt><dd>${esc(client.address || '—')}</dd></div>
              <div class="kv-row"><dt>Источник</dt><dd>${esc(client.source || '—')}</dd></div>
              <div class="kv-row"><dt>В базе с</dt><dd>${fmtDate(client.createdAt)}</dd></div>
            </dl>
            <div style="display:flex;gap:8px;margin-top:14px">
              ${client.phone ? `<a class="btn sm" href="${waHref(client.phone)}" target="_blank" rel="noopener">${icon('message')} WhatsApp</a>` : ''}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><div class="card-title">Лиды клиента</div></div>
            ${leads.length ? leads.map((lead) => `
              <div class="stat-line">
                <span class="label">${esc(lead.name)} · ${fmtDate(lead.createdAt)}</span>
                ${statusBadge(lead.status, 'lead')}
              </div>`).join('') : '<div class="dim" style="font-size:13px">Связанных лидов нет</div>'}
          </section>

          ${client.note ? `<section class="card"><div class="card-head"><div class="card-title">Заметка</div></div><div class="muted" style="font-size:13px;white-space:pre-wrap">${esc(client.note)}</div></section>` : ''}
        </div>
      </div>
    `;
  },

  mount(root, params) {
    const client = get.client(params.id);
    if (!client) return;
    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'edit') { await openClientForm(client); rerender(); }
      if (action === 'delete') {
        const ok = await deleteEntity('client', client);
        if (ok) location.hash = '#/clients';
      }
    });
  },
};

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
