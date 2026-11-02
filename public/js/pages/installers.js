// Монтажники и выплаты

import { state, get, actions } from '../store.js';
import { esc, icon, fmtMoney, fmtDate, initials, telHref, plural, methodLabel } from '../util.js';
import { emptyState, pageHead, toast, confirmModal } from '../ui.js';
import { openInstallerForm, openPayoutForm } from '../forms.js';
import { installerList, payoutsSummary } from '../metrics.js';

const TABS = [['team', 'Команда'], ['payouts', 'Выплаты']];

export const installersPage = {
  title: () => 'Монтажники',

  render() {
    const tab = state.ui.installerTab || 'team';
    const team = installerList();
    const payouts = [...get.payouts()].sort((a, b) => new Date(b.date) - new Date(a.date));
    const summary = payoutsSummary();
    const totalAssigned = team.reduce((sum, row) => sum + row.assigned, 0);
    const totalPaid = team.reduce((sum, row) => sum + row.paid, 0);
    const totalDebt = Math.max(0, totalAssigned - totalPaid);
    const filter = state.ui.payoutFilter || 'all';
    const shownPayouts = payouts.filter((p) => filter === 'all' || p.status === filter);

    return `
      ${pageHead({
        title: 'Монтажники',
        subtitle: `${team.length} ${plural(team.length, ['человек', 'человека', 'человек'])} · назначено ${fmtMoney(totalAssigned, true)} · выплачено ${fmtMoney(totalPaid, true)}`,
        actions: tab === 'team'
          ? `<button class="btn primary" data-act="new-installer">${icon('plus')} Монтажник</button>`
          : `<button class="btn primary" data-act="new-payout">${icon('plus')} Выплата</button>`,
      })}

      <div class="toolbar">
        <div class="segmented" data-tab>
          ${TABS.map(([key, label]) => `<button data-tab-btn="${key}" class="${tab === key ? 'active' : ''}">${label}</button>`).join('')}
        </div>
        <div class="spacer"></div>
        ${tab === 'payouts' ? `<div class="segmented" data-filter>
          ${[['all', 'Все'], ['paid', 'Выплачено'], ['planned', 'Запланировано']].map(([key, label]) => `<button data-filter-btn="${key}" class="${filter === key ? 'active' : ''}">${label}</button>`).join('')}
        </div>` : `<span class="dim" style="font-size:12px">Долг бригадам: ${fmtMoney(totalDebt)}</span>`}
      </div>

      <div class="grid kpi">
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('clients')}</span>В команде</div><div class="kpi-value">${team.length}</div><div class="kpi-foot">активных ${team.filter((r) => r.installer.active !== false).length}</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('orders')}</span>Назначено</div><div class="kpi-value">${fmtMoney(totalAssigned)}</div><div class="kpi-foot">по всем объектам</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('wallet')}</span>Выплачено</div><div class="kpi-value">${fmtMoney(totalPaid)}</div><div class="kpi-foot">${summary.planned ? `запланировано ${fmtMoney(summary.planned, true)}` : 'всё закрыто'}</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('alert')}</span>Осталось выплатить</div><div class="kpi-value ${totalDebt ? 'gold' : ''}">${fmtMoney(totalDebt)}</div><div class="kpi-foot">в плане ${fmtMoney(summary.planned, true)} · ${payouts.filter((p) => p.status !== 'paid').length} платежей</div></div>
      </div>

      <div class="mt">
        ${tab === 'team' ? renderTeam(team) : renderPayouts(shownPayouts)}
      </div>
    `;
  },

  mount(root) {
    root.querySelectorAll('[data-tab-btn]').forEach((button) => {
      button.addEventListener('click', () => {
        state.ui.installerTab = button.dataset.tabBtn;
        rerender();
      });
    });
    root.querySelectorAll('[data-filter-btn]').forEach((button) => {
      button.addEventListener('click', () => {
        state.ui.payoutFilter = button.dataset.filterBtn;
        rerender();
      });
    });

    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'new-installer') {
        await openInstallerForm();
        rerender();
      }
      if (action === 'new-payout') {
        await openPayoutForm();
        rerender();
      }

      const editId = event.target.closest('[data-edit-installer]')?.dataset.editInstaller;
      if (editId) {
        await openInstallerForm(get.installer(editId));
        rerender();
      }

      const delId = event.target.closest('[data-del-installer]')?.dataset.delInstaller;
      if (delId) {
        const installer = get.installer(delId);
        const ok = await confirmModal({
          title: 'Удалить монтажника?',
          text: `«${installer.name}» будет удалён вместе с назначениями и выплатами.`,
          confirmLabel: 'Удалить',
          danger: true,
        });
        if (ok) {
          await actions.deleteInstaller(delId);
          toast('Монтажник удалён', 'ok');
          rerender();
        }
      }

      const payId = event.target.closest('[data-pay-payout]')?.dataset.payPayout;
      if (payId) {
        await actions.updatePayout(payId, { status: 'paid' });
        toast('Выплата отмечена', 'ok');
        rerender();
      }

      const delPayId = event.target.closest('[data-del-payout]')?.dataset.delPayout;
      if (delPayId) {
        const payout = get.payouts().find((p) => p.id === delPayId);
        const ok = await confirmModal({
          title: 'Удалить выплату?',
          text: `${fmtMoney(payout.amount)} — ${get.installer(payout.installerId)?.name || ''}`,
          confirmLabel: 'Удалить',
          danger: true,
        });
        if (ok) {
          await actions.deletePayout(delPayId);
          toast('Выплата удалена', 'ok');
          rerender();
        }
      }
    });
  },
};

function renderTeam(team) {
  if (!team.length) {
    return emptyState({
      icon: 'clients',
      title: 'Монтажников пока нет',
      text: 'Добавьте бригаду, чтобы назначать людей на заказы и вести выплаты.',
      action: `<button class="btn primary mt" data-act="new-installer">${icon('plus')} Добавить монтажника</button>`,
    });
  }
  return `<div class="card flush">
    <div class="list" style="--cols: 1.7fr 0.9fr 0.8fr 0.9fr 0.9fr 64px">
      <div class="list-head"><span>Монтажник</span><span>Роль</span><span>Заказы</span><span>Назначено</span><span class="right">Выплачено / долг</span><span></span></div>
      ${team.map(({ installer, assigned, paid, debt, orders }) => `
        <div class="row" style="cursor:default">
          <div class="cell">
            <div class="row-title"><span class="avatar sm">${esc(initials(installer.name))}</span><span class="truncate">${esc(installer.name)}</span></div>
            <div class="row-sub">${installer.phone ? `<a href="${telHref(installer.phone)}" style="color:var(--dim)">${esc(installer.phone)}</a>` : '—'}${installer.active === false ? ' · не работает' : ''}</div>
          </div>
          <div class="cell hide-sm"><span class="cell-label">Роль</span><span class="badge gray">${esc(installer.role || 'Монтажник')}</span></div>
          <div class="cell"><span class="cell-label">Заказы</span><span class="row-value sm">${orders}</span></div>
          <div class="cell"><span class="cell-label">Назначено</span><span class="row-value sm">${fmtMoney(assigned, true)}</span></div>
          <div class="cell right">
            <span class="cell-label">Выплачено</span>
            <span class="row-value sm green">${fmtMoney(paid, true)}</span>
            <span class="row-sub" style="color:${debt ? 'var(--gold)' : 'var(--dim)'}">${debt ? `долг ${fmtMoney(debt, true)}` : 'нет долга'}</span>
          </div>
          <div class="cell right">
            <span class="row-actions">
              <button class="btn ghost icon sm" data-edit-installer="${installer.id}" aria-label="Изменить">${icon('edit')}</button>
              <button class="btn ghost icon sm" data-del-installer="${installer.id}" aria-label="Удалить">${icon('trash')}</button>
            </span>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

function renderPayouts(payouts) {
  if (!payouts.length) {
    return emptyState({
      icon: 'wallet',
      title: 'Выплат нет',
      text: 'Назначайте оплату монтажникам по заказам — здесь будет история.',
      action: `<button class="btn primary mt" data-act="new-payout">${icon('plus')} Добавить выплату</button>`,
    });
  }
  return `<div class="card flush">
    <div class="list" style="--cols: 0.8fr 1.2fr 1.4fr 0.8fr 0.8fr 64px">
      <div class="list-head"><span>Дата</span><span>Монтажник</span><span>Заказ</span><span>Сумма</span><span class="right">Статус</span><span></span></div>
      ${payouts.map((payout) => {
        const installer = get.installer(payout.installerId);
        const order = get.order(payout.orderId);
        return `<div class="row" style="cursor:default">
          <div class="cell"><span class="cell-label">Дата</span><div class="row-sub" style="color:var(--text)">${fmtDate(payout.date)}</div></div>
          <div class="cell"><span class="cell-label">Монтажник</span><div class="row-title">${esc(installer?.name || '—')}</div><div class="row-sub">${esc(installer?.role || '')}</div></div>
          <div class="cell hide-sm"><span class="cell-label">Заказ</span><a class="card-link" href="#/orders/${order?.id || ''}">${esc(order?.number || '—')}</a><div class="row-sub">${esc(order?.title || '')}</div></div>
          <div class="cell"><span class="cell-label">Сумма</span><span class="row-value">${fmtMoney(payout.amount)}</span><div class="row-sub">${esc(methodLabel(payout.method))}</div></div>
          <div class="cell right"><span class="badge ${payout.status === 'paid' ? 'green' : 'gold'}">${payout.status === 'paid' ? 'выплачено' : 'запланировано'}</span></div>
          <div class="cell right">
            <span class="row-actions">
              ${payout.status !== 'paid' ? `<button class="btn ghost icon sm" data-pay-payout="${payout.id}" title="Отметить выплаченной">${icon('check')}</button>` : ''}
              <button class="btn ghost icon sm" data-del-payout="${payout.id}" aria-label="Удалить">${icon('trash')}</button>
            </span>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
