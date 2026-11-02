// Оплаты

import { state, get, actions } from '../store.js';
import { esc, icon, fmtMoney, fmtDate, methodLabel, plural, sum } from '../util.js';
import { emptyState, pageHead, toast, confirmModal } from '../ui.js';
import { openPaymentForm } from '../forms.js';
import { rangeFor, prevRange, metrics } from '../metrics.js';

const PERIODS = [
  ['30d', '30 дней'],
  ['month', 'Месяц'],
  ['quarter', '3 мес'],
  ['all', 'Всё'],
];

export const paymentsPage = {
  title: () => 'Оплаты',

  render() {
    const preset = state.ui.paymentPeriod || '30d';
    const range = rangeFor(preset);
    const prev = prevRange(range);
    const current = metrics(range.from, range.to);
    const before = metrics(prev.from, prev.to);
    const payments = get.payments()
      .filter((p) => {
        const time = new Date(p.date).getTime();
        return time >= range.from.getTime() && time <= range.to.getTime();
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = sum(payments, (p) => p.amount);
    const avg = payments.length ? total / payments.length : 0;
    const delta = before.revenue > 0 && current.revenue > 0
      ? Math.round(((current.revenue - before.revenue) / before.revenue) * 100)
      : null;

    const byMethod = new Map();
    for (const payment of payments) {
      byMethod.set(payment.method, (byMethod.get(payment.method) || 0) + payment.amount);
    }
    const topMethod = [...byMethod.entries()].sort((a, b) => b[1] - a[1])[0];

    return `
      ${pageHead({
        title: 'Оплаты',
        subtitle: `${payments.length} ${plural(payments.length, ['поступление', 'поступления', 'поступлений'])} · ${range.label}`,
        actions: `<button class="btn" data-act="export">${icon('download')} <span class="desktop-only">CSV</span></button>
          <button class="btn primary" data-act="new">${icon('plus')} Добавить оплату</button>`,
      })}
      <div class="toolbar">
        <div class="segmented" data-period>
          ${PERIODS.map(([key, label]) => `<button data-period-btn="${key}" class="${preset === key ? 'active' : ''}">${label}</button>`).join('')}
        </div>
        <div class="spacer"></div>
        ${delta ? `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)}% к прошлому периоду</span>` : ''}
      </div>

      <div class="grid kpi">
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('wallet')}</span>Поступило</div><div class="kpi-value">${fmtMoney(total)}</div><div class="kpi-foot">${range.label}</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('payments')}</span>Средний платёж</div><div class="kpi-value">${fmtMoney(avg)}</div><div class="kpi-foot">${payments.length} операций</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('alert')}</span>Дебиторка</div><div class="kpi-value">${fmtMoney(current.debt)}</div><div class="kpi-foot">ждут оплаты</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('analytics')}</span>Способ оплаты</div><div class="kpi-value" style="font-size:18px">${topMethod ? esc(methodLabel(topMethod[0])) : '—'}</div><div class="kpi-foot">${byMethod.size ? `${byMethod.size} способа(ов)` : 'нет операций'}</div></div>
      </div>

      <div class="mt">
        ${payments.length ? `<div class="card flush">
          <div class="topper"><span class="topper-title">Поступления</span><span class="dim" style="font-size:12px">${fmtMoney(total)}</span></div>
          <div class="list" style="--cols: 0.9fr 1.5fr 1fr 0.9fr 0.7fr 36px">
            <div class="list-head"><span>Дата</span><span>Заказ</span><span>Клиент</span><span>Способ</span><span class="right">Сумма</span><span></span></div>
            ${payments.map((payment) => {
              const order = get.order(payment.orderId);
              const client = order ? get.client(order.clientId) : null;
              return `<div class="row" style="cursor:default">
                <div class="cell"><span class="cell-label">Дата</span><div class="row-sub" style="color:var(--text)">${fmtDate(payment.date)}</div></div>
                <div class="cell">
                  <span class="cell-label">Заказ</span>
                  ${order ? `<a class="card-link" href="#/orders/${order.id}">${esc(order.number)}</a>` : '<span class="dim">удалён</span>'}
                  <div class="row-sub">${esc(order?.title || '')}</div>
                </div>
                <div class="cell hide-sm"><span class="cell-label">Клиент</span><div class="row-sub" style="color:var(--text)">${esc(client?.name || '—')}</div></div>
                <div class="cell hide-sm"><span class="cell-label">Способ</span><div class="row-sub">${esc(methodLabel(payment.method))}${payment.note ? ` · ${esc(payment.note)}` : ''}</div></div>
                <div class="cell right">
                  <span class="cell-label">Сумма</span>
                  <span class="row-value" style="color:var(--green)">+${fmtMoney(payment.amount)}</span>
                </div>
                <div class="cell right">
                  <button class="btn ghost icon sm" data-del="${payment.id}" aria-label="Удалить">${icon('trash')}</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>` : emptyState({
          icon: 'payments',
          title: 'Оплат за период нет',
          text: 'Добавьте поступление — оно сразу попадёт в выручку и прибыль.',
          action: `<button class="btn primary mt" data-act="new">${icon('plus')} Добавить оплату</button>`,
        })}
      </div>
    `;
  },

  mount(root) {
    root.querySelectorAll('[data-period-btn]').forEach((button) => {
      button.addEventListener('click', () => {
        state.ui.paymentPeriod = button.dataset.periodBtn;
        rerender();
      });
    });
    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'new') { await openPaymentForm(); rerender(); }
      if (action === 'export') window.open('/api/export/payments', '_blank');
      const id = event.target.closest('[data-del]')?.dataset.del;
      if (id) {
        const payment = get.payments().find((p) => p.id === id);
        const ok = await confirmModal({
          title: 'Удалить оплату?',
          text: `${fmtMoney(payment.amount)} от ${fmtDate(payment.date)} будет удалено из выручки.`,
          confirmLabel: 'Удалить',
          danger: true,
        });
        if (ok) {
          await actions.deletePayment(id);
          toast('Оплата удалена', 'ok');
          rerender();
        }
      }
    });
  },
};

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
