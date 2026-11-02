// Обзор — главный экран

import { get, actions } from '../store.js';
import {
  fmtMoney, fmtDate, fmtDateTime, fmtNum, esc, icon, statusBadge, daysLabel, timeAgo, plural,
} from '../util.js';
import { kpiCard, deltaChip, sparkline, barChart, emptyState, openModal, toast, confirmModal } from '../ui.js';
import { metrics, prevRange, rangeFor, monthlySeries, leadFunnel, upcomingTasks, attentionItems, orderDebt, daysLeft } from '../metrics.js';
import { openLeadForm, openOrderForm, openPaymentForm, openTaskForm, openExpenseForm } from '../forms.js';

export const dashboardPage = {
  title: () => 'Обзор',

  render() {
    const range = rangeFor('30d');
    const prev = prevRange(range);
    const current = metrics(range.from, range.to);
    const before = metrics(prev.from, prev.to);
    const series = monthlySeries(6);
    const chartRows = monthlySeries(12);
    const funnel = leadFunnel();
    const tasks = upcomingTasks();
    const attention = attentionItems();
    const orders = [...get.orders()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    const activity = get.activity();
    const isDemo = get.settings().demo;
    const isEmpty = !get.leads().length && !get.orders().length && !get.clients().length;

    const greeting = greetingForHour();
    const heroActions = `
      <button class="btn" data-act="payment">${icon('payments')} Оплата</button>
      <button class="btn primary" data-act="lead">${icon('plus')} Новый лид</button>`;

    return `
      ${isDemo ? `<div class="banner">
        ${icon('sparkles')}
        <div><b>Демо-режим.</b> Здесь примеры данных, чтобы показать возможности. Когда будете готовы — очистите их в настройках.</div>
        <div class="spacer"></div>
        <button class="btn sm" data-act="clear-demo">Очистить демо</button>
      </div>` : ''}
      ${isEmpty ? onboarding() : ''}

      <div class="page-head">
        <div>
          <h1 class="page-title">${esc(greeting)}, ${esc(get.profile().name || 'друг')}</h1>
          <p class="page-sub">${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })} · вот что происходит в бизнесе</p>
        </div>
        <div class="page-actions">${heroActions}</div>
      </div>

      <div class="grid kpi">
        ${kpiCard({
          label: 'Выручка · 30 дней',
          value: fmtNum(current.revenue),
          unit: '₽',
          icon: 'wallet',
          delta: deltaChip(current.revenue, before.revenue),
          foot: `было ${fmtMoney(before.revenue, true)}`,
          trend: sparkline(series.map((s) => s.revenue), '#e8b42a'),
        })}
        ${kpiCard({
          label: 'Прибыль · 30 дней',
          value: fmtNum(current.profit),
          unit: '₽',
          icon: 'trend',
          delta: deltaChip(current.profit, before.profit),
          foot: `маржа ${current.marginPercent}%`,
          trend: sparkline(series.map((s) => s.profit), '#34d399'),
        })}
        ${kpiCard({
          label: 'Лиды · 30 дней',
          value: fmtNum(current.leadsCreated),
          icon: 'leads',
          delta: deltaChip(current.leadsCreated, before.leadsCreated),
          foot: `в заказ: ${current.leadsWon} · конверсия ${current.conversion}%`,
        })}
        ${kpiCard({
          label: 'Дебиторка',
          value: fmtNum(current.debt),
          unit: '₽',
          icon: 'alert',
          foot: `${get.orders().filter((o) => orderDebt(o) > 0 && o.status !== 'cancelled').length} заказов ждут оплаты`,
          delta: current.debt > 0 ? `<span class="delta down">ожидает</span>` : '<span class="delta up">чисто</span>',
        })}
      </div>

      <div class="grid main-side mt">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Выручка и прибыль</div>
              <div class="card-sub">Поступления и чистая прибыль по месяцам</div>
            </div>
            <div class="legend">
              <span><i style="background:linear-gradient(180deg,#f5d76e,#e8b42a)"></i>Выручка</span>
              <span><i style="background:#34d399"></i>Прибыль</span>
            </div>
          </div>
          <div class="chart-wrap">${barChart(chartRows, { height: 250 })}</div>
          <div class="stat-line" style="margin-top:8px">
            <span class="label">Воронка сейчас: ${esc(String(current.pipeline ? fmtMoney(current.pipeline, true) : '0 ₽'))} в работе</span>
            <a class="card-link" href="#/analytics">Аналитика →</a>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Воронка лидов</div>
              <div class="card-sub">${get.leads().length} ${plural(get.leads().length, ['лид', 'лида', 'лидов'])} всего</div>
            </div>
            <a class="card-link" href="#/leads">Все →</a>
          </div>
          <div class="funnel">
            ${funnel.slice(0, 6).map((row) => `
              <div class="funnel-row">
                <div class="funnel-top">
                  <span class="funnel-name">${esc(row.label)}</span>
                  <span class="funnel-val">${row.count}</span>
                </div>
                <div class="funnel-bar"><div class="funnel-fill" style="width:${Math.max(2, row.percent)}%;opacity:${row.key === 'lost' ? 0.35 : 1}"></div></div>
              </div>`).join('')}
          </div>
        </section>
      </div>

      <div class="grid main-side mt">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Требуют внимания</div>
              <div class="card-sub">Просрочки, долги и лиды без движения</div>
            </div>
            <span class="badge ${attention.length ? 'orange' : 'green'}">${attention.length}</span>
          </div>
          ${attention.length ? `<div>${attention.slice(0, 6).map((item) => `
            <a class="attn-item" href="${item.href}">
              <span class="attn-icon ${item.tone}">${icon(item.icon)}</span>
              <span style="min-width:0">
                <span class="attn-title" style="display:block">${esc(item.title)}</span>
                <span class="attn-sub" style="display:block">${esc(item.sub || '')}</span>
              </span>
              <span style="margin-left:auto;color:var(--dim)">${icon('chevron')}</span>
            </a>`).join('')}</div>` : emptyState({ icon: 'check', title: 'Всё под контролем', text: 'Нет просрочек и забытых лидов', compact: true })}
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Задачи</div>
              <div class="card-sub">${tasks.length ? `Ближайшие ${Math.min(tasks.length, 5)}` : 'На сегодня'}</div>
            </div>
            <button class="btn sm ghost" data-act="task">${icon('plus')} Добавить</button>
          </div>
          ${tasks.length ? `<div>${tasks.slice(0, 5).map((task) => {
            const left = daysLeft(task.dueAt);
            const dueClass = left === null ? '' : left < 0 ? 'late' : left === 0 ? 'today' : '';
            return `<div class="task-item">
              <input type="checkbox" data-task="${task.id}" aria-label="Выполнено" />
              <div style="min-width:0;flex:1">
                <div class="task-title">${esc(task.title)}</div>
                <div class="task-due ${dueClass}">${task.dueAt ? fmtDate(task.dueAt) : 'без срока'}</div>
              </div>
              <button class="btn ghost icon sm" data-task-del="${task.id}" aria-label="Удалить">${icon('x')}</button>
            </div>`;
          }).join('')}</div>` : emptyState({ icon: 'check', title: 'Задач нет', text: 'Добавьте звонок или напоминание', compact: true })}
        </section>
      </div>

      <div class="grid main-side mt">
        <section class="card flush">
          <div class="topper">
            <span class="topper-title">Последние заказы</span>
            <a class="card-link" href="#/orders">Все заказы →</a>
          </div>
          ${orders.length ? `<div class="list" style="--cols: 1.5fr 1fr 0.9fr">
            ${orders.map((order) => `
              <a class="row" href="#/orders/${order.id}">
                <div class="cell">
                  <div class="row-title"><span class="mono dim">${esc(order.number)}</span></div>
                  <div class="row-sub">${esc(order.title)}</div>
                </div>
                <div class="cell hide-sm">
                  <span class="cell-label">Клиент</span>
                  <span class="row-sub" style="color:var(--text)">${esc(get.client(order.clientId)?.name || 'Без клиента')}</span>
                </div>
                <div class="cell right">
                  <span class="row-value">${fmtMoney(order.amount)}</span>
                  <span style="margin-top:2px">${statusBadge(order.status)}</span>
                </div>
              </a>`).join('')}
          </div>` : emptyState({ icon: 'orders', title: 'Заказов пока нет', text: 'Создайте первый заказ или сконвертируйте лид' })}
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">Лента</div></div>
          ${activity.length ? `<div>${activity.slice(0, 7).map((item) => `
            <div class="activity-item">
              <span class="activity-dot"></span>
              <div>
                <div class="activity-text">${esc(item.text)}</div>
                <div class="activity-time">${timeAgo(item.at)}</div>
              </div>
            </div>`).join('')}</div>` : emptyState({ icon: 'sparkles', title: 'Пока тихо', text: 'Здесь появятся события', compact: true })}
        </section>
      </div>
    `;
  },

  mount(root) {
    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'lead') { await openLeadForm(); refresh(); }
      if (action === 'payment') { await openPaymentForm(); refresh(); }
      if (action === 'task') { await openTaskForm(); refresh(); }
      if (action === 'lead-order') { await openOrderForm(); refresh(); }
      if (action === 'clear-demo') {
        const ok = await confirmModal({
          title: 'Очистить демо-данные?',
          text: 'Все демонстрационные лиды, заказы, оплаты и расходы будут удалены. Настройки и пароль останутся.',
          confirmLabel: 'Очистить',
          danger: true,
        });
        if (ok) {
          await actions.clearDemo();
          toast('Демо-данные удалены', 'ok');
          location.hash = '#/dashboard';
          refresh();
        }
      }
      if (action === 'seed') {
        await actions.seedDemo();
        toast('Демо-данные загружены', 'ok');
        refresh();
      }
    });

    root.addEventListener('change', async (event) => {
      const taskId = event.target.dataset?.task;
      if (taskId) {
        await actions.updateTask(taskId, { done: event.target.checked });
        refresh();
      }
    });

    root.addEventListener('click', async (event) => {
      const id = event.target.closest('[data-task-del]')?.dataset.taskDel;
      if (!id) return;
      event.stopPropagation();
      await actions.deleteTask(id);
      toast('Задача удалена', 'ok');
      refresh();
    });
  },
};

function refresh() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function greetingForHour() {
  const hour = new Date().getHours();
  if (hour < 6) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function onboarding() {
  return `<section class="card" style="margin-bottom:16px;background:linear-gradient(135deg,rgba(232,180,42,.09),rgba(232,180,42,.01));border-color:var(--gold-line)">
    <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
      <div class="empty-icon" style="margin:0;background:var(--gold-soft)">${icon('sparkles')}</div>
      <div style="flex:1;min-width:240px">
        <h2 style="font-size:20px;letter-spacing:-.02em">CRM готова к работе</h2>
        <p class="muted" style="font-size:13.5px;margin-top:6px;max-width:560px">Начните с первого лида или загрузите демо-данные, чтобы посмотреть, как устроены заказы, оплаты и прибыль.</p>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <button class="btn primary" data-act="lead">${icon('plus')} Добавить лид</button>
          <button class="btn" data-act="lead-order">${icon('orders')} Создать заказ</button>
          <button class="btn ghost" data-act="seed">${icon('sparkles')} Демо-данные</button>
        </div>
      </div>
    </div>
  </section>`;
}
