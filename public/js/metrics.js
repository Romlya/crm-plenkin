// Расчёты: выручка, себестоимость, прибыль, воронка, аналитика

import { get } from './store.js';
import { sum, percent, daysLeft } from './util.js';

export { daysLeft };

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  return startOfDay(d);
}

export function addMonths(date, count) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + count);
  return d;
}

export function inRange(value, from, to) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= from.getTime() && time <= to.getTime();
}

export function rangeFor(preset) {
  const now = new Date();
  switch (preset) {
    case '7d': {
      const from = startOfDay(new Date(now.getTime() - 6 * 86400000));
      return { from, to: endOfDay(now), label: '7 дней' };
    }
    case '30d': {
      const from = startOfDay(new Date(now.getTime() - 29 * 86400000));
      return { from, to: endOfDay(now), label: '30 дней' };
    }
    case 'quarter': {
      const from = startOfMonth(addMonths(now, -2));
      return { from, to: endOfDay(now), label: '3 месяца' };
    }
    case 'year': {
      const from = startOfDay(new Date(now.getFullYear(), 0, 1));
      return { from, to: endOfDay(now), label: 'Этот год' };
    }
    case 'prevMonth': {
      const first = startOfMonth(addMonths(now, -1));
      const last = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { from: first, to: last, label: 'Прошлый месяц' };
    }
    case 'all': {
      const dates = [
        ...get.payments().map((p) => p.date),
        ...get.orders().map((o) => o.createdAt),
        ...get.leads().map((l) => l.createdAt),
      ].filter(Boolean).map((d) => new Date(d).getTime());
      const from = dates.length ? startOfDay(new Date(Math.min(...dates))) : startOfMonth(now);
      return { from, to: endOfDay(now), label: 'Всё время' };
    }
    case 'month':
    default:
      return { from: startOfMonth(now), to: endOfDay(now), label: 'Этот месяц' };
  }
}

export function prevRange(range) {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
  return { from: new Date(from.getTime() - days * 86400000), to: new Date(from.getTime() - 1) };
}

export function orderPaid(orderId) {
  return get.paid(orderId);
}

export function orderDebt(order) {
  return Math.max(0, (order.amount || 0) - orderPaid(order.id));
}

export function isActiveOrder(order) {
  return !['closed', 'cancelled'].includes(order.status);
}

/**
 * Метрики за период.
 * Выручка — поступления. Себестоимость — доля cost заказа, пропорциональная оплате.
 */
export function metrics(from, to) {
  const payments = get.payments().filter((p) => inRange(p.date, from, to));
  const revenue = sum(payments, (p) => p.amount);

  let cogs = 0;
  for (const payment of payments) {
    const order = get.order(payment.orderId);
    if (!order || order.status === 'cancelled') continue;
    if (!order.amount) continue;
    const ratio = Math.min(1, payment.amount / order.amount);
    cogs += (order.cost || 0) * ratio;
  }

  const expenses = get.expenses().filter((e) => inRange(e.date, from, to));
  const otherExpenses = sum(expenses, (e) => e.amount);

  const laborPayouts = get.payouts().filter((p) => p.status === 'paid' && inRange(p.date, from, to));
  const laborPaid = sum(laborPayouts, (p) => p.amount);

  const grossProfit = revenue - cogs - laborPaid;
  const profit = grossProfit - otherExpenses;

  const ordersCreated = get.orders().filter((o) => inRange(o.createdAt, from, to));
  const paymentsCount = payments.length;
  const avgCheck = ordersCreated.length ? sum(ordersCreated, (o) => o.amount) / ordersCreated.length : 0;

  const leadsCreated = get.leads().filter((l) => inRange(l.createdAt, from, to));
  const leadsWon = leadsCreated.filter((l) => l.status === 'won').length;
  const leadsLost = leadsCreated.filter((l) => l.status === 'lost').length;
  const conversion = leadsWon + leadsLost ? Math.round((leadsWon / (leadsWon + leadsLost)) * 100) : 0;

  const allOrders = get.orders().filter((o) => o.status !== 'cancelled');
  const paidAll = new Map();
  for (const payment of get.payments()) {
    paidAll.set(payment.orderId, (paidAll.get(payment.orderId) || 0) + payment.amount);
  }
  const debt = allOrders.reduce((acc, order) => acc + Math.max(0, order.amount - (paidAll.get(order.id) || 0)), 0);
  const pipeline = allOrders
    .filter((o) => ['new', 'measure', 'materials', 'install'].includes(o.status))
    .reduce((acc, order) => acc + order.amount, 0);

  const marginPercent = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  return {
    from, to,
    revenue,
    cogs,
    laborPaid,
    otherExpenses,
    grossProfit,
    profit,
    marginPercent,
    paymentsCount,
    ordersCreated: ordersCreated.length,
    ordersCreatedAmount: sum(ordersCreated, (o) => o.amount),
    avgCheck,
    leadsCreated: leadsCreated.length,
    leadsWon,
    leadsLost,
    conversion,
    debt,
    pipeline,
    expensesCount: expenses.length,
  };
}

export function monthlySeries(months = 12) {
  const rows = [];
  const now = new Date();
  for (let index = months - 1; index >= 0; index -= 1) {
    const start = startOfMonth(addMonths(now, -index));
    const end = endOfDay(new Date(start.getFullYear(), start.getMonth() + 1, 0));
    const m = metrics(start, end);
    rows.push({
      label: start.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''),
      fullLabel: start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
      revenue: m.revenue,
      profit: m.profit,
      start,
      end,
    });
  }
  return rows;
}

export function weeklySeries(weeks = 8) {
  const rows = [];
  const now = endOfDay();
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const end = new Date(now.getTime() - index * 7 * 86400000);
    const start = startOfDay(new Date(end.getTime() - 6 * 86400000));
    const m = metrics(start, end);
    rows.push({
      label: start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
      revenue: m.revenue,
      profit: m.profit,
      start,
      end,
    });
  }
  return rows;
}

export function leadFunnel() {
  const leads = get.leads();
  const stages = [
    ['new', 'Новые'],
    ['contacted', 'В работе'],
    ['measure', 'Замер'],
    ['estimate', 'Смета'],
    ['contract', 'Договор'],
    ['won', 'В заказ'],
    ['lost', 'Отказ'],
  ];
  const total = leads.length || 1;
  return stages.map(([key, label]) => {
    const count = leads.filter((l) => l.status === key).length;
    return { key, label, count, percent: Math.round((count / total) * 100) };
  });
}

export function sourceStats() {
  const leads = get.leads();
  const orders = get.orders();
  const map = new Map();
  for (const lead of leads) {
    const key = lead.source || 'Другое';
    const item = map.get(key) || { source: key, leads: 0, won: 0, lost: 0, amount: 0 };
    item.leads += 1;
    if (lead.status === 'won') item.won += 1;
    if (lead.status === 'lost') item.lost += 1;
    item.amount += Number(lead.estimate) || 0;
    map.set(key, item);
  }
  return [...map.values()]
    .map((item) => ({ ...item, conversion: item.won + item.lost ? Math.round((item.won / (item.won + item.lost)) * 100) : 0 }))
    .sort((a, b) => b.leads - a.leads);
}

export function serviceStats() {
  const orders = get.orders().filter((o) => o.status !== 'cancelled');
  const map = new Map();
  for (const order of orders) {
    const service = get.service(order.serviceId);
    const key = service?.name || 'Без услуги';
    const item = map.get(key) || { name: key, orders: 0, amount: 0, cost: 0, area: 0 };
    item.orders += 1;
    item.amount += order.amount;
    item.cost += order.cost;
    item.area += order.area || 0;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function topClients(limit = 5) {
  const rows = get.clients().map((client) => {
    const stats = get.clientStats(client.id);
    return { client, ...stats };
  }).filter((row) => row.orders > 0);
  return rows.sort((a, b) => b.total - a.total).slice(0, limit);
}

export function attentionItems() {
  const items = [];
  const now = Date.now();

  for (const lead of get.leads()) {
    if (['won', 'lost'].includes(lead.status)) continue;
    const idle = Math.floor((now - new Date(lead.updatedAt || lead.createdAt).getTime()) / 86400000);
    if (idle >= 2) {
      items.push({
        type: 'lead',
        title: `${lead.name} — без движения ${idle} дн`,
        sub: [lead.phone, lead.source].filter(Boolean).join(' · '),
        href: '#/leads',
        icon: 'leads',
        tone: idle >= 5 ? 'red' : '',
      });
    }
  }

  for (const order of get.orders()) {
    if (['closed', 'cancelled', 'done'].includes(order.status)) continue;
    if (order.deadline && new Date(order.deadline).getTime() < now) {
      const late = Math.floor((now - new Date(order.deadline).getTime()) / 86400000);
      items.push({
        type: 'order',
        title: `${order.number} просрочен на ${late} дн`,
        sub: order.title,
        href: `#/orders/${order.id}`,
        icon: 'clock',
        tone: 'red',
      });
    }
  }

  for (const order of get.orders()) {
    if (['cancelled'].includes(order.status)) continue;
    const debt = orderDebt(order);
    if (debt > 0 && ['done', 'closed'].includes(order.status)) {
      items.push({
        type: 'payment',
        title: `Долг ${debt.toLocaleString('ru-RU')} ₽`,
        sub: `${order.number} · ${order.title}`,
        href: `#/orders/${order.id}`,
        icon: 'wallet',
        tone: 'gold',
      });
    }
  }

  for (const task of get.tasks()) {
    if (task.done) continue;
    if (task.dueAt && new Date(task.dueAt).getTime() <= endOfDay().getTime()) {
      items.push({
        type: 'task',
        title: task.title,
        sub: task.dueAt ? `срок ${new Date(task.dueAt).toLocaleDateString('ru-RU')}` : 'без срока',
        href: '#/dashboard',
        icon: 'check',
        tone: '',
      });
    }
  }

  return items;
}

export function upcomingTasks() {
  return get.tasks()
    .filter((t) => !t.done)
    .sort((a, b) => {
      const av = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bv = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return av - bv;
    });
}

export function conversionFunnel(from, to) {
  const leads = get.leads().filter((l) => inRange(l.createdAt, from, to));
  const total = leads.length || 1;
  return [
    { label: 'Заявки', value: leads.length, percent: 100 },
    { label: 'Взяты в работу', value: leads.filter((l) => l.status !== 'new').length, percent: percent(leads.filter((l) => l.status !== 'new').length, total) },
    { label: 'Замер / смета', value: leads.filter((l) => ['measure', 'estimate', 'contract', 'won'].includes(l.status)).length, percent: percent(leads.filter((l) => ['measure', 'estimate', 'contract', 'won'].includes(l.status)).length, total) },
    { label: 'Договор', value: leads.filter((l) => ['contract', 'won'].includes(l.status)).length, percent: percent(leads.filter((l) => ['contract', 'won'].includes(l.status)).length, total) },
    { label: 'В заказ', value: leads.filter((l) => l.status === 'won').length, percent: percent(leads.filter((l) => l.status === 'won').length, total) },
  ];
}

// ───────────────────────────── монтажники и выплаты

export function orderLabor(order) {
  const assigned = (order?.installers || []).reduce((sum, item) => sum + (item.amount || 0), 0);
  const payouts = get.payouts().filter((p) => p.orderId === order?.id);
  const paid = payouts.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const planned = payouts.filter((p) => p.status !== 'paid').reduce((sum, p) => sum + p.amount, 0);
  return { assigned, paid, planned, debt: Math.max(0, assigned - paid) };
}

export function payoutsSummary(from, to) {
  const payouts = get.payouts().filter((p) => (from && to ? inRange(p.date, from, to) : true));
  const paid = payouts.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const planned = payouts.filter((p) => p.status !== 'paid').reduce((sum, p) => sum + p.amount, 0);
  return { paid, planned, count: payouts.length };
}

export function installerList() {
  return get.installers()
    .map((installer) => ({ installer, ...get.installerStats(installer.id) }))
    .sort((a, b) => b.assigned - a.assigned || a.installer.name.localeCompare(b.installer.name, 'ru'));
}
