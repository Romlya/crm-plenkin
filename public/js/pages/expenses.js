// Расходы

import { state, get, actions } from '../store.js';
import { esc, icon, fmtMoney, fmtDate, plural, sum } from '../util.js';
import { emptyState, pageHead, toast, confirmModal } from '../ui.js';
import { openExpenseForm } from '../forms.js';
import { rangeFor, metrics } from '../metrics.js';

const PERIODS = [['30d', '30 дней'], ['month', 'Месяц'], ['quarter', '3 мес'], ['year', 'Год'], ['all', 'Всё']];

export const expensesPage = {
  title: () => 'Расходы',

  render() {
    const preset = state.ui.expensePeriod || '30d';
    const range = rangeFor(preset);
    const m = metrics(range.from, range.to);
    const expenses = get.expenses()
      .filter((e) => {
        const time = new Date(e.date).getTime();
        return time >= range.from.getTime() && time <= range.to.getTime();
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = sum(expenses, (e) => e.amount);
    const byCategory = new Map();
    for (const expense of expenses) {
      byCategory.set(expense.category, (byCategory.get(expense.category) || 0) + expense.amount);
    }
    const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const maxCategory = categories[0]?.[1] || 1;
    const share = m.revenue > 0 ? Math.round((total / m.revenue) * 100) : 0;

    return `
      ${pageHead({
        title: 'Расходы',
        subtitle: `${expenses.length} ${plural(expenses.length, ['операция', 'операции', 'операций'])} · ${range.label}`,
        actions: `<button class="btn" data-act="export">${icon('download')} <span class="desktop-only">CSV</span></button>
          <button class="btn primary" data-act="new">${icon('plus')} Добавить расход</button>`,
      })}
      <div class="toolbar">
        <div class="segmented" data-period>
          ${PERIODS.map(([key, label]) => `<button data-period-btn="${key}" class="${preset === key ? 'active' : ''}">${label}</button>`).join('')}
        </div>
      </div>

      <div class="grid kpi">
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('expenses')}</span>Расходы</div><div class="kpi-value">${fmtMoney(total)}</div><div class="kpi-foot">${range.label}</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('analytics')}</span>Доля от выручки</div><div class="kpi-value">${share}%</div><div class="kpi-foot">выручка ${fmtMoney(m.revenue, true)}</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('box')}</span>Крупная статья</div><div class="kpi-value" style="font-size:18px">${esc(categories[0]?.[0] || '—')}</div><div class="kpi-foot">${categories[0] ? fmtMoney(categories[0][1]) : 'нет данных'}</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('trend')}</span>Прибыль после</div><div class="kpi-value ${m.profit >= 0 ? '' : 'red'}">${fmtMoney(m.profit)}</div><div class="kpi-foot">маржа ${m.marginPercent}%</div></div>
      </div>

      <div class="mt grid main-side">
        <section class="card flush">
          <div class="topper"><span class="topper-title">Операции</span><span class="dim" style="font-size:12px">${fmtMoney(total)}</span></div>
          ${expenses.length ? `<div class="list" style="--cols:1.2fr 1fr 1.4fr 0.7fr 36px">
            <div class="list-head"><span>Дата</span><span>Категория</span><span>Комментарий</span><span class="right">Сумма</span><span></span></div>
            ${expenses.map((expense) => `
              <div class="row" style="cursor:default">
                <div class="cell"><span class="cell-label">Дата</span><div class="row-sub" style="color:var(--text)">${fmtDate(expense.date)}</div></div>
                <div class="cell"><span class="cell-label">Категория</span><span class="badge gray">${esc(expense.category)}</span></div>
                <div class="cell hide-sm"><span class="cell-label">Комментарий</span><div class="row-sub">${esc(expense.note || '—')}</div></div>
                <div class="cell right">
                  <span class="cell-label">Сумма</span>
                  <span class="row-value" style="color:var(--red)">−${fmtMoney(expense.amount)}</span>
                </div>
                <div class="cell right">
                  <button class="btn ghost icon sm" data-del="${expense.id}" aria-label="Удалить">${icon('trash')}</button>
                </div>
              </div>`).join('')}
          </div>` : emptyState({
            icon: 'expenses',
            title: 'Расходов нет',
            text: 'Добавьте материалы, рекламу или зарплату — прибыль станет точной.',
            action: `<button class="btn primary mt" data-act="new">${icon('plus')} Добавить расход</button>`,
          })}
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">По категориям</div></div>
          ${categories.length ? `<div style="display:grid;gap:12px">
            ${categories.map(([name, amount]) => `
              <div>
                <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px">
                  <span class="muted">${esc(name)}</span><span style="font-weight:600">${fmtMoney(amount)}</span>
                </div>
                <div class="progress"><i style="width:${Math.max(4, Math.round((amount / maxCategory) * 100))}%"></i></div>
              </div>`).join('')}
          </div>` : '<div class="dim" style="font-size:13px">Нет расходов за период</div>'}
        </section>
      </div>
    `;
  },

  mount(root) {
    root.querySelectorAll('[data-period-btn]').forEach((button) => {
      button.addEventListener('click', () => {
        state.ui.expensePeriod = button.dataset.periodBtn;
        rerender();
      });
    });
    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'new') { await openExpenseForm(); rerender(); }
      if (action === 'export') window.open('/api/export/expenses', '_blank');
      const id = event.target.closest('[data-del]')?.dataset.del;
      if (id) {
        const expense = get.expenses().find((e) => e.id === id);
        const ok = await confirmModal({
          title: 'Удалить расход?',
          text: `${fmtMoney(expense.amount)} · ${expense.category}`,
          confirmLabel: 'Удалить',
          danger: true,
        });
        if (ok) {
          await actions.deleteExpense(id);
          toast('Расход удалён', 'ok');
          rerender();
        }
      }
    });
  },
};

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
