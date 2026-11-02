// Состояние приложения и работа с API

export const state = {
  data: null,
  ui: {
    sidebarOpen: false,
    leadView: 'kanban',
    leadQuery: '',
    leadSource: '',
    orderQuery: '',
    orderStatus: '',
    clientQuery: '',
    paymentPeriod: '30d',
    analyticsPeriod: 'year',
    dashboardPeriod: 'month',
    search: '',
  },
  derived: {},
  listeners: new Set(),
};

export function emit() {
  for (const listener of state.listeners) listener();
}

export function onChange(listener) {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('crm:unauthorized'));
  }
  if (!response.ok) {
    const error = new Error(payload?.error || `Ошибка ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};

export function setData(snapshot) {
  if (!snapshot) return;
  state.data = {
    profile: snapshot.profile || state.data?.profile || { name: 'Руководитель' },
    settings: snapshot.settings || state.data?.settings,
    counters: snapshot.counters || {},
    clients: snapshot.clients || [],
    leads: snapshot.leads || [],
    orders: snapshot.orders || [],
    payments: snapshot.payments || [],
    expenses: snapshot.expenses || [],
    tasks: snapshot.tasks || [],
    installers: snapshot.installers || [],
    payouts: snapshot.payouts || [],
    storage: snapshot.storage || state.data?.storage || { mode: 'file', persistent: true },
    activity: snapshot.activity || [],
  };
  recompute();
  emit();
}

export function recompute() {
  const data = state.data;
  if (!data) return;
  const clientsById = new Map(data.clients.map((c) => [c.id, c]));
  const ordersById = new Map(data.orders.map((o) => [o.id, o]));
  const servicesById = new Map((data.settings?.services || []).map((s) => [s.id, s]));
  const paidByOrder = new Map();
  for (const payment of data.payments) {
    paidByOrder.set(payment.orderId, (paidByOrder.get(payment.orderId) || 0) + payment.amount);
  }
  const clientStats = new Map();
  for (const order of data.orders) {
    if (!order.clientId) continue;
    const stat = clientStats.get(order.clientId) || { orders: 0, total: 0, paid: 0, debt: 0 };
    const paid = paidByOrder.get(order.id) || 0;
    stat.orders += 1;
    stat.total += order.amount;
    stat.paid += paid;
    stat.debt += Math.max(0, order.amount - paid);
    clientStats.set(order.clientId, stat);
  }
  state.derived = { clientsById, ordersById, servicesById, paidByOrder, clientStats };

  const installersById = new Map((data.installers || []).map((i) => [i.id, i]));
  const payoutsByOrder = new Map();
  const installerStats = new Map();
  for (const installer of data.installers || []) {
    installerStats.set(installer.id, { assigned: 0, paid: 0, planned: 0, orders: 0, orderIds: new Set() });
  }
  for (const order of data.orders) {
    for (const assignment of order.installers || []) {
      const stat = installerStats.get(assignment.installerId);
      if (!stat) continue;
      stat.assigned += assignment.amount || 0;
      if (!stat.orderIds.has(order.id)) {
        stat.orderIds.add(order.id);
        stat.orders += 1;
      }
    }
  }
  for (const payout of data.payouts || []) {
    payoutsByOrder.set(payout.orderId, (payoutsByOrder.get(payout.orderId) || 0) + payout.amount);
    const stat = installerStats.get(payout.installerId);
    if (!stat) continue;
    if (payout.status === 'paid') stat.paid += payout.amount || 0;
    else stat.planned += payout.amount || 0;
  }
  for (const stat of installerStats.values()) {
    stat.debt = Math.max(0, stat.assigned - stat.paid);
    delete stat.orderIds;
  }
  Object.assign(state.derived, { installersById, payoutsByOrder, installerStats });
}

export const get = {
  clients: () => state.data?.clients || [],
  leads: () => state.data?.leads || [],
  orders: () => state.data?.orders || [],
  payments: () => state.data?.payments || [],
  expenses: () => state.data?.expenses || [],
  tasks: () => state.data?.tasks || [],
  installers: () => state.data?.installers || [],
  payouts: () => state.data?.payouts || [],
  activity: () => state.data?.activity || [],
  storage: () => state.data?.storage || { mode: 'file', persistent: true },
  settings: () => state.data?.settings || {},
  profile: () => state.data?.profile || { name: 'Руководитель' },
  services: () => state.data?.settings?.services || [],
  client: (id) => state.derived.clientsById?.get(id) || null,
  order: (id) => state.derived.ordersById?.get(id) || null,
  service: (id) => state.derived.servicesById?.get(id) || null,
  installer: (id) => state.derived.installersById?.get(id) || null,
  installerStats: (id) => state.derived.installerStats?.get(id) || { assigned: 0, paid: 0, planned: 0, orders: 0, debt: 0 },
  paid: (orderId) => state.derived.paidByOrder?.get(orderId) || 0,
  debt: (order) => Math.max(0, (order?.amount || 0) - get.paid(order?.id)),
  clientStats: (id) => state.derived.clientStats?.get(id) || { orders: 0, total: 0, paid: 0, debt: 0 },
};

async function mutate(path, options) {
  const snapshot = await request(path, options);
  setData(snapshot);
  return snapshot;
}

export const actions = {
  load: async () => {
    const snapshot = await api.get('/api/data');
    setData(snapshot);
    return snapshot;
  },
  createClient: (body) => mutate('/api/clients', { method: 'POST', body }),
  updateClient: (id, body) => mutate(`/api/clients/${id}`, { method: 'PATCH', body }),
  deleteClient: (id) => mutate(`/api/clients/${id}`, { method: 'DELETE' }),
  createLead: (body) => mutate('/api/leads', { method: 'POST', body }),
  updateLead: (id, body) => mutate(`/api/leads/${id}`, { method: 'PATCH', body }),
  deleteLead: (id) => mutate(`/api/leads/${id}`, { method: 'DELETE' }),
  convertLead: (id, body = {}) => mutate(`/api/leads/${id}/convert`, { method: 'POST', body }),
  createOrder: (body) => mutate('/api/orders', { method: 'POST', body }),
  updateOrder: (id, body) => mutate(`/api/orders/${id}`, { method: 'PATCH', body }),
  deleteOrder: (id) => mutate(`/api/orders/${id}`, { method: 'DELETE' }),
  addPayment: (body) => mutate('/api/payments', { method: 'POST', body }),
  deletePayment: (id) => mutate(`/api/payments/${id}`, { method: 'DELETE' }),
  addExpense: (body) => mutate('/api/expenses', { method: 'POST', body }),
  deleteExpense: (id) => mutate(`/api/expenses/${id}`, { method: 'DELETE' }),
  addTask: (body) => mutate('/api/tasks', { method: 'POST', body }),
  updateTask: (id, body) => mutate(`/api/tasks/${id}`, { method: 'PATCH', body }),
  deleteTask: (id) => mutate(`/api/tasks/${id}`, { method: 'DELETE' }),
  createInstaller: (body) => mutate('/api/installers', { method: 'POST', body }),
  updateInstaller: (id, body) => mutate(`/api/installers/${id}`, { method: 'PATCH', body }),
  deleteInstaller: (id) => mutate(`/api/installers/${id}`, { method: 'DELETE' }),
  createPayout: (body) => mutate('/api/payouts', { method: 'POST', body }),
  updatePayout: (id, body) => mutate(`/api/payouts/${id}`, { method: 'PATCH', body }),
  deletePayout: (id) => mutate(`/api/payouts/${id}`, { method: 'DELETE' }),
  saveSettings: (body) => mutate('/api/settings', { method: 'PATCH', body }),
  rotateToken: () => mutate('/api/settings/rotate-token', { method: 'POST', body: {} }),
  clearDemo: () => mutate('/api/demo/clear', { method: 'POST', body: {} }),
  seedDemo: () => mutate('/api/demo/seed', { method: 'POST', body: {} }),
  importSite: () => mutate('/api/import/site', { method: 'POST', body: {} }),
};
