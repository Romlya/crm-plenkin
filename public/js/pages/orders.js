// Заказы — список и карточка

import { state, get, actions } from '../store.js';
import {
  esc, icon, fmtMoney, fmtArea, fmtDate, statusBadge, ORDER_STATUS, PAYMENT_METHOD, methodLabel, telHref, daysLeft, plural,
} from '../util.js';
import { emptyState, pageHead, progressBar, toast, confirmModal, formModal } from '../ui.js';
import { openOrderForm, openPaymentForm, deleteEntity } from '../forms.js';

function paid(order) {
  return get.paid(order.id);
}

function filterOrders() {
  const query = state.ui.orderQuery.trim().toLowerCase();
  const status = state.ui.orderStatus;
  return [...get.orders()]
    .filter((order) => {
      if (status && order.status !== status) return false;
      if (!query) return true;
      const client = get.client(order.clientId);
      return `${order.number} ${order.title} ${order.address} ${client?.name || ''}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const rank = (o) => (o.status === 'install' ? 0 : o.status === 'materials' ? 1 : o.status === 'measure' ? 2 : o.status === 'new' ? 3 : 4);
      return rank(a) - rank(b) || new Date(b.createdAt) - new Date(a.createdAt);
    });
}

export const ordersPage = {
  title: () => 'Заказы',

  render() {
    const orders = filterOrders();
    const active = get.orders().filter((o) => !['closed', 'cancelled', 'done'].includes(o.status));
    const totalActive = active.reduce((acc, o) => acc + o.amount, 0);
    const debt = get.orders().filter((o) => o.status !== 'cancelled').reduce((acc, o) => acc + Math.max(0, o.amount - paid(o)), 0);

    return `
      ${pageHead({
        title: 'Заказы',
        subtitle: `${active.length} ${plural(active.length, ['активный', 'активных', 'активных'])} на ${fmtMoney(totalActive, true)} · долги ${fmtMoney(debt, true)}`,
        actions: `<button class="btn" data-act="export">${icon('download')} <span class="desktop-only">Экспорт</span></button>
          <button class="btn primary" data-act="new">${icon('plus')} Новый заказ</button>`,
      })}
      <div class="toolbar">
        <div class="search-box">
          ${icon('search')}
          <input class="input" id="orderSearch" placeholder="Номер, объект, клиент" value="${esc(state.ui.orderQuery)}" />
        </div>
        <select class="select mini" id="statusFilter" style="max-width:190px">
          <option value="">Все статусы</option>
          ${Object.entries(ORDER_STATUS).map(([key, meta]) => `<option value="${key}" ${state.ui.orderStatus === key ? 'selected' : ''}>${meta.label}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <span class="dim" style="font-size:12px">${orders.length} ${plural(orders.length, ['заказ', 'заказа', 'заказов'])}</span>
      </div>
      ${!get.orders().length ? emptyState({
        icon: 'orders',
        title: 'Заказов пока нет',
        text: 'Создайте заказ вручную или конвертируйте лид — номер присвоится автоматически.',
        action: `<button class="btn primary mt" data-act="new">${icon('plus')} Создать заказ</button>`,
      }) : !orders.length ? emptyState({ icon: 'search', title: 'Ничего не найдено', text: 'Измените фильтр или поисковый запрос' }) : `
      <div class="card flush">
        <div class="list" style="--cols: 1.7fr 1.1fr 1.1fr 0.9fr 0.7fr">
          <div class="list-head"><span>Заказ</span><span>Клиент</span><span>Оплата</span><span>Статус</span><span class="right">Срок</span></div>
          ${orders.map((order) => {
            const client = get.client(order.clientId);
            const left = daysLeft(order.deadline);
            const overdue = left !== null && left < 0 && !['done', 'closed', 'cancelled'].includes(order.status);
            const p = paid(order);
            const percent = order.amount > 0 ? Math.min(100, Math.round((p / order.amount) * 100)) : 0;
            return `<a class="row" href="#/orders/${order.id}">
              <div class="cell">
                <div class="row-title">
                  <span class="mono dim">${esc(order.number)}</span>
                  ${overdue ? '<span class="badge red">просрочен</span>' : ''}
                </div>
                <div class="row-sub">${esc(order.title)}</div>
              </div>
              <div class="cell hide-sm">
                <span class="cell-label">Клиент</span>
                <div class="row-sub" style="color:var(--text)">${esc(client?.name || 'Без клиента')}</div>
                <div class="row-sub">${esc(order.address || '')}</div>
              </div>
              <div class="cell">
                <span class="cell-label">Оплата</span>
                <div class="row-value sm">${fmtMoney(p)} <span class="dim" style="font-weight:400">/ ${fmtMoney(order.amount)}</span></div>
                <div class="progress ${percent >= 100 ? 'green' : percent === 0 ? 'red' : ''}" style="margin-top:5px"><i style="width:${percent}%"></i></div>
              </div>
              <div class="cell"><span class="cell-label">Статус</span>${statusBadge(order.status)}</div>
              <div class="cell right">
                <span class="cell-label">Срок</span>
                <span class="row-sub" style="${overdue ? 'color:var(--red)' : ''}">${order.deadline ? fmtDate(order.deadline) : '—'}</span>
              </div>
            </a>`;
          }).join('')}
        </div>
      </div>`}
    `;
  },

  mount(root) {
    const search = root.querySelector('#orderSearch');
    if (search) {
      let timer;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.ui.orderQuery = search.value;
          const position = search.selectionStart;
          rerender();
          const next = document.querySelector('#orderSearch');
          if (next) { next.focus(); next.setSelectionRange(position, position); }
        }, 220);
      });
    }
    root.querySelector('#statusFilter')?.addEventListener('change', (event) => {
      state.ui.orderStatus = event.target.value;
      rerender();
    });
    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'new') { await openOrderForm(); rerender(); }
      if (action === 'export') window.open('/api/export/orders', '_blank');
    });
  },
};

// ───────────────────────────── карточка заказа

export const orderDetailPage = {
  title: (params) => get.order(params.id)?.number || 'Заказ',

  render(params) {
    const order = get.order(params.id);
    if (!order) {
      return `<div class="card">${emptyState({ icon: 'alert', title: 'Заказ не найден', text: 'Возможно, он был удалён', action: '<a class="btn mt" href="#/orders">К списку заказов</a>' })}</div>`;
    }
    const client = get.client(order.clientId);
    const service = get.service(order.serviceId);
    const paidSum = paid(order);
    const debt = Math.max(0, order.amount - paidSum);
    const margin = order.amount - order.cost;
    const marginPercent = order.amount > 0 ? Math.round((margin / order.amount) * 100) : 0;
    const payments = get.payments().filter((p) => p.orderId === order.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    const left = daysLeft(order.deadline);
    const overdue = left !== null && left < 0 && !['done', 'closed', 'cancelled'].includes(order.status);

    return `
      <div style="margin-bottom:16px">
        <a href="#/orders" class="card-link" style="display:inline-flex;align-items:center;gap:4px">← Все заказы</a>
      </div>
      ${pageHead({
        title: order.title,
        subtitle: `${order.number} · создан ${fmtDate(order.createdAt)}`,
        actions: `<button class="btn" data-act="edit">${icon('edit')} Изменить</button>
          <button class="btn primary" data-act="pay">${icon('wallet')} Добавить оплату</button>`,
      })}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${statusBadge(order.status)}
        ${overdue ? `<span class="badge red">просрочен на ${Math.abs(left)} дн</span>` : ''}
        ${order.deadline ? `<span class="badge gray">срок ${fmtDate(order.deadline)}</span>` : ''}
        ${debt > 0 ? `<span class="badge orange">долг ${fmtMoney(debt)}</span>` : '<span class="badge green">оплачен полностью</span>'}
      </div>

      <div class="grid kpi">
        <div class="kpi"><div class="kpi-top">Сумма заказа</div><div class="kpi-value">${fmtMoney(order.amount)}</div></div>
        <div class="kpi"><div class="kpi-top">Оплачено</div><div class="kpi-value">${fmtMoney(paidSum)}</div><div style="margin-top:10px">${progressBar(paidSum, order.amount, { showLabel: true })}</div></div>
        <div class="kpi"><div class="kpi-top">Себестоимость</div><div class="kpi-value">${fmtMoney(order.cost)}</div></div>
        <div class="kpi"><div class="kpi-top">Прибыль</div><div class="kpi-value gold">${fmtMoney(margin)}</div><div class="kpi-foot">маржа ${marginPercent}%</div></div>
      </div>

      <div class="detail-grid mt">
        <div style="display:grid;gap:16px">
          <section class="card">
            <div class="card-head"><div class="card-title">Параметры</div></div>
            <dl class="kv">
              <div class="kv-row"><dt>Клиент</dt><dd>${client ? `<a class="card-link" href="#/clients/${client.id}">${esc(client.name)}</a>` : '<span class="dim">не указан</span>'}</dd></div>
              <div class="kv-row"><dt>Телефон</dt><dd>${client?.phone ? `<a href="${telHref(client.phone)}" class="card-link">${esc(client.phone)}</a>` : '—'}</dd></div>
              <div class="kv-row"><dt>Услуга</dt><dd>${esc(service?.name || '—')}</dd></div>
              <div class="kv-row"><dt>Площадь</dt><dd>${order.area ? fmtArea(order.area) : '—'}</dd></div>
              <div class="kv-row"><dt>Адрес объекта</dt><dd>${esc(order.address || '—')}</dd></div>
              <div class="kv-row"><dt>Срок сдачи</dt><dd>${order.deadline ? fmtDate(order.deadline) : '—'} ${overdue ? '<span class="badge red">просрочен</span>' : ''}</dd></div>
              <div class="kv-row"><dt>Статус</dt><dd>
                <select class="select mini" data-status style="max-width:190px">
                  ${Object.entries(ORDER_STATUS).map(([key, meta]) => `<option value="${key}" ${key === order.status ? 'selected' : ''}>${meta.label}</option>`).join('')}
                </select>
              </dd></div>
              ${order.note ? `<div class="kv-row"><dt>Комментарий</dt><dd style="white-space:pre-wrap">${esc(order.note)}</dd></div>` : ''}
            </dl>
          </section>

          <section class="card flush">
            <div class="topper">
              <span class="topper-title">Оплаты · ${fmtMoney(paidSum)}</span>
              <button class="btn sm" data-act="pay">${icon('plus')} Добавить</button>
            </div>
            ${payments.length ? `<div class="list">
              ${payments.map((payment) => `
                <div class="row static" style="--cols:1fr auto auto">
                  <div class="cell">
                    <div class="row-title">${fmtMoney(payment.amount)}</div>
                    <div class="row-sub">${fmtDate(payment.date)} · ${methodLabel(payment.method)}${payment.note ? ` · ${esc(payment.note)}` : ''}</div>
                  </div>
                  <div class="cell right"><span class="badge green">получено</span></div>
                  <div class="cell right"><button class="btn ghost icon sm" data-del-payment="${payment.id}" aria-label="Удалить">${icon('trash')}</button></div>
                </div>`).join('')}
            </div>` : emptyState({ icon: 'wallet', title: 'Оплат пока нет', text: 'Добавьте аванс или полную оплату', compact: true })}
          </section>
        </div>

        <div style="display:grid;gap:16px">
          ${client ? `<section class="card">
            <div class="card-head"><div class="card-title">Клиент</div><a class="card-link" href="#/clients/${client.id}">Карточка →</a></div>
            <div style="display:flex;gap:12px;align-items:center">
              <span class="avatar lg">${esc(initialsOf(client.name))}</span>
              <div style="min-width:0">
                <div style="font-weight:600">${esc(client.name)}</div>
                <div class="dim" style="font-size:12.5px">${esc(client.phone || '')}</div>
                <div class="dim" style="font-size:12.5px">${esc(client.company || '')}</div>
              </div>
            </div>
            <div class="stat-line mt-sm"><span class="label">Всего заказов</span><span class="value">${get.clientStats(client.id).orders}</span></div>
            <div class="stat-line"><span class="label">Сумма по клиенту</span><span class="value">${fmtMoney(get.clientStats(client.id).total)}</span></div>
            <div class="stat-line"><span class="label">Долг</span><span class="value ${get.clientStats(client.id).debt ? 'red' : ''}">${fmtMoney(get.clientStats(client.id).debt)}</span></div>
          </section>` : ''}

          <section class="card">
            <div class="card-head"><div class="card-title">Действия</div></div>
            <div style="display:grid;gap:8px">
              <button class="btn" data-act="pay">${icon('wallet')} Внести оплату</button>
              ${client?.phone ? `<a class="btn" href="tel:${client.phone.replace(/[^\d+]/g, '')}">${icon('phone')} Позвонить клиенту</a>` : ''}
              <button class="btn" data-act="edit">${icon('edit')} Редактировать заказ</button>
              <button class="btn danger" data-act="delete">${icon('trash')} Удалить заказ</button>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><div class="card-title">Финансы</div></div>
            <div class="stat-line"><span class="label">Сумма</span><span class="value">${fmtMoney(order.amount)}</span></div>
            <div class="stat-line"><span class="label">Себестоимость</span><span class="value">${fmtMoney(order.cost)}</span></div>
            <div class="stat-line"><span class="label">Валовая прибыль</span><span class="value ${margin >= 0 ? 'green' : 'red'}">${fmtMoney(margin)}</span></div>
            <div class="stat-line"><span class="label">Оплачено</span><span class="value">${fmtMoney(paidSum)}</span></div>
            <div class="stat-line"><span class="label">Остаток</span><span class="value ${debt ? 'gold' : ''}">${fmtMoney(debt)}</span></div>
          </section>
        </div>
      </div>
    `;
  },

  mount(root, params) {
    const order = get.order(params.id);
    if (!order) return;

    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'edit') {
        await openOrderForm(order);
        rerender();
      }
      if (action === 'pay') {
        await openPaymentForm(order.id);
        rerender();
      }
      if (action === 'delete') {
        const ok = await deleteEntity('order', order);
        if (ok) location.hash = '#/orders';
      }
      const paymentId = event.target.closest('[data-del-payment]')?.dataset.delPayment;
      if (paymentId) {
        const payment = get.payments().find((p) => p.id === paymentId);
        const confirmed = await confirmModal({
          title: 'Удалить оплату?',
          text: `Платёж на ${fmtMoney(payment.amount)} от ${fmtDate(payment.date)} будет удалён.`,
          confirmLabel: 'Удалить',
          danger: true,
        });
        if (confirmed) {
          await actions.deletePayment(paymentId);
          toast('Оплата удалена', 'ok');
          rerender();
        }
      }
    });

    root.querySelector('[data-status]')?.addEventListener('change', async (event) => {
      await actions.updateOrder(order.id, { status: event.target.value });
      toast('Статус обновлён', 'ok');
      rerender();
    });
  },
};

function initialsOf(name) {
  return String(name || '?').replace(/[«»"']/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
