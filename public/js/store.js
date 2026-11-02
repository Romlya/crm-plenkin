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
}

export const get = {
  clients: () => state.data?.clients || [],
  leads: () => state.data?.leads || [],
  orders: () => state.data?.orders || [],
  payments: () => state.data?.payments || [],
  expenses: () => state.data?.expenses || [],
  tasks: () => state.data?.tasks || [],
  activity: () => state.data?.activity || [],
  settings: () => state.data?.settings || {},
  profile: () => state.data?.profile || { name: 'Руководитель' },
  services: () => state.data?.settings?.services || [],
  client: (id) => state.derived.clientsById?.get(id) || null,
  order: (id) => state.derived.ordersById?.get(id) || null,
  service: (id) => state.derived.servicesById?.get(id) || null,
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
  saveSettings: (body) => mutate('/api/settings', { method: 'PATCH', body }),
  rotateToken: () => mutate('/api/settings/rotate-token', { method: 'POST', body: {} }),
  clearDemo: () => mutate('/api/demo/clear', { method: 'POST', body: {} }),
  seedDemo: () => mutate('/api/demo/seed', { method: 'POST', body: {} }),
  importSite: () => mutate('/api/import/site', { method: 'POST', body: {} }),
};
