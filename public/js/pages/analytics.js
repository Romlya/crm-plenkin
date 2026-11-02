// Аналитика и P&L

import { state, get } from '../store.js';
import { esc, icon, fmtMoney, fmtNum, plural, percent } from '../util.js';
import { emptyState, pageHead, barChart, donutChart } from '../ui.js';
import {
  rangeFor, metrics, monthlySeries, conversionFunnel, sourceStats, serviceStats, topClients, orderDebt,
} from '../metrics.js';

const PERIODS = [['30d', '30 дней'], ['quarter', '3 мес'], ['year', 'Год'], ['all', 'Всё время']];

const COLORS = ['#e8b42a', '#34d399', '#60a5fa', '#a78bfa', '#fb923c', '#22d3ee'];

export const analyticsPage = {
  title: () => 'Аналитика',

  render() {
    const preset = state.ui.analyticsPeriod || 'year';
    const range = rangeFor(preset);
    const m = metrics(range.from, range.to);
    const series = monthlySeries(12);
    const funnel = conversionFunnel(range.from, range.to).map((row, index, all) => ({
      ...row,
      drop: index === 0 ? 100 : percent(row.value, all[0].value || 1),
    }));
    const sources = sourceStats();
    const services = serviceStats();
    const clients = topClients(6);
    const debts = get.orders()
      .filter((o) => o.status !== 'cancelled' && orderDebt(o) > 0)
      .sort((a, b) => orderDebt(b) - orderDebt(a))
      .slice(0, 6);
    const totalSourceLeads = sources.reduce((acc, s) => acc + s.leads, 0) || 1;

    return `
      ${pageHead({
        title: 'Аналитика',
        subtitle: `${range.label} · ${get.orders().length} заказов в базе`,
        actions: `<button class="btn" data-act="print">${icon('file')} <span class="desktop-only">Печать</span></button>`,
      })}
      <div class="toolbar">
        <div class="segmented" data-period>
          ${PERIODS.map(([key, label]) => `<button data-period-btn="${key}" class="${preset === key ? 'active' : ''}">${label}</button>`).join('')}
        </div>
      </div>

      <div class="grid kpi">
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('wallet')}</span>Выручка</div><div class="kpi-value">${fmtNum(m.revenue)}<span class="cur">₽</span></div><div class="kpi-foot">${m.paymentsCount} поступлений</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('trend')}</span>Прибыль</div><div class="kpi-value">${fmtNum(m.profit)}<span class="cur">₽</span></div><div class="kpi-foot">маржа ${m.marginPercent}%</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('orders')}</span>Заказов создано</div><div class="kpi-value">${m.ordersCreated}</div><div class="kpi-foot">на ${fmtMoney(m.ordersCreatedAmount, true)}</div></div>
        <div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon('leads')}</span>Конверсия в заказ</div><div class="kpi-value">${m.conversion}%</div><div class="kpi-foot">${m.leadsWon} из ${m.leadsWon + m.leadsLost} закрытых</div></div>
      </div>

      <div class="grid main-side mt">
        <section class="card">
          <div class="card-head">
            <div><div class="card-title">Динамика за 12 месяцев</div><div class="card-sub">Выручка и прибыль по месяцам</div></div>
            <div class="legend"><span><i style="background:#e8b42a"></i>Выручка</span><span><i style="background:#34d399"></i>Прибыль</span></div>
          </div>
          ${barChart(series, { height: 260 })}
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">P&L за период</div><span class="badge ${m.profit >= 0 ? 'green' : 'red'}">${m.profit >= 0 ? 'прибыль' : 'убыток'}</span></div>
          <div class="stat-line"><span class="label">Выручка (оплаты)</span><span class="value">${fmtMoney(m.revenue)}</span></div>
          <div class="stat-line"><span class="label">Себестоимость</span><span class="value">−${fmtMoney(m.cogs)}</span></div>
          <div class="stat-line"><span class="label">Монтаж (выплаты)</span><span class="value">−${fmtMoney(m.laborPaid)}</span></div>
          <div class="stat-line"><span class="label">Валовая прибыль</span><span class="value">${fmtMoney(m.grossProfit)}</span></div>
          <div class="stat-line"><span class="label">Прочие расходы</span><span class="value">−${fmtMoney(m.otherExpenses)}</span></div>
          <div class="stat-line" style="border-top:1px solid var(--line-strong);padding-top:11px">
            <span class="label" style="color:var(--text);font-weight:600">Чистая прибыль</span>
            <span class="value ${m.profit >= 0 ? 'gold' : 'red'}" style="font-size:18px">${fmtMoney(m.profit)}</span>
          </div>
          <div class="dim" style="font-size:11.5px;margin-top:10px;line-height:1.5">Материалы — пропорционально оплатам по заказам. Монтаж — фактические выплаты за период. Расходы — по дате.</div>
        </section>
      </div>

      <div class="grid two mt">
        <section class="card">
          <div class="card-head"><div class="card-title">Воронка конверсии</div><div class="card-sub">${m.leadsCreated} лидов за период</div></div>
          ${funnel.map((row, index) => `
            <div class="funnel-row" style="margin-bottom:12px">
              <div class="funnel-top">
                <span class="funnel-name">${esc(row.label)}</span>
                <span class="dim" style="font-size:11px">${row.drop}%</span>
                <span class="funnel-val">${row.value}</span>
              </div>
              <div class="funnel-bar"><div class="funnel-fill" style="width:${Math.max(2, row.percent)}%;opacity:${1 - index * 0.1}"></div></div>
            </div>`).join('')}
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">Источники лидов</div><div class="card-sub">Справа — сумма оценок заявок</div></div>
          ${sources.length ? `<div style="display:grid;gap:11px">
            ${sources.map((source, index) => `
              <div style="display:flex;align-items:center;gap:10px">
                <span style="width:8px;height:8px;border-radius:2px;background:${COLORS[index % COLORS.length]};flex:none"></span>
                <span style="flex:1;font-size:13px">${esc(source.source)}</span>
                <span class="dim" style="font-size:12px">${source.leads} · конв. ${source.conversion}%</span>
                <span style="font-weight:600;font-size:13px;min-width:80px;text-align:right">${fmtMoney(source.amount, true)}</span>
              </div>
              <div class="progress"><i style="width:${Math.max(3, Math.round((source.leads / totalSourceLeads) * 100))}%;background:${COLORS[index % COLORS.length]}"></i></div>
            `).join('')}
          </div>` : '<div class="dim" style="font-size:13px">Нет данных</div>'}
        </section>
      </div>

      <div class="grid main-side mt">
        <section class="card flush">
          <div class="topper"><span class="topper-title">Услуги</span><span class="dim" style="font-size:12px">сумма · маржа</span></div>
          ${services.length ? `<div class="list" style="--cols:1.6fr 0.8fr 1fr 0.9fr">
            ${services.map((service) => {
              const margin = service.amount - service.cost;
              const mp = service.amount > 0 ? Math.round((margin / service.amount) * 100) : 0;
              return `<div class="row" style="cursor:default">
                <div class="cell"><div class="row-title">${esc(service.name)}</div><div class="row-sub">${service.orders} ${plural(service.orders, ['заказ', 'заказа', 'заказов'])} · ${fmtNum(service.area)} м²</div></div>
                <div class="cell"><span class="cell-label">Сумма</span><span class="row-value sm">${fmtMoney(service.amount, true)}</span></div>
                <div class="cell hide-sm"><span class="cell-label">Себестоимость</span><span class="row-sub">${fmtMoney(service.cost, true)}</span></div>
                <div class="cell right"><span class="cell-label">Маржа</span><span class="row-value sm ${mp >= 30 ? 'green' : mp >= 0 ? '' : 'red'}">${fmtMoney(margin, true)} · ${mp}%</span></div>
              </div>`;
            }).join('')}
          </div>` : emptyState({ icon: 'orders', title: 'Нет заказов', compact: true })}
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">Топ клиентов</div></div>
          ${clients.length ? clients.map((row, index) => `
            <a class="stat-line" href="#/clients/${row.client.id}" style="text-decoration:none">
              <span class="label" style="display:flex;align-items:center;gap:8px">
                <span class="dim" style="width:14px">${index + 1}</span>${esc(row.client.name)}
              </span>
              <span class="value">${fmtMoney(row.total, true)}</span>
            </a>`).join('') : '<div class="dim" style="font-size:13px">Нет данных</div>'}
        </section>
      </div>

      <section class="card flush mt">
        <div class="topper"><span class="topper-title">Дебиторская задолженность</span><span class="dim" style="font-size:12px">${fmtMoney(m.debt)}</span></div>
        ${debts.length ? `<div class="list" style="--cols:1.5fr 1fr 0.8fr 0.8fr">
          ${debts.map((order) => {
            const debt = orderDebt(order);
            const paid = order.amount - debt;
            return `<a class="row" href="#/orders/${order.id}">
              <div class="cell"><div class="row-title"><span class="mono dim">${esc(order.number)}</span></div><div class="row-sub">${esc(order.title)}</div></div>
              <div class="cell hide-sm"><span class="cell-label">Клиент</span><div class="row-sub" style="color:var(--text)">${esc(get.client(order.clientId)?.name || '—')}</div></div>
              <div class="cell"><span class="cell-label">Оплачено</span><span class="row-value sm">${fmtMoney(paid)} / ${fmtMoney(order.amount)}</span></div>
              <div class="cell right"><span class="cell-label">Долг</span><span class="row-value gold">${fmtMoney(debt)}</span></div>
            </a>`;
          }).join('')}
        </div>` : emptyState({ icon: 'check', title: 'Долгов нет', compact: true })}
      </section>
    `;
  },

  mount(root) {
    root.querySelectorAll('[data-period-btn]').forEach((button) => {
      button.addEventListener('click', () => {
        state.ui.analyticsPeriod = button.dataset.periodBtn;
        rerender();
      });
    });
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-act="print"]')) window.print();
    });
  },
};

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
