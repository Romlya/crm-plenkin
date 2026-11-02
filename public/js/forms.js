// Формы создания/редактирования сущностей

import { formModal, toast, confirmModal } from './ui.js';
import { actions, get } from './store.js';
import { esc, fmtMoney, fmtDate, ORDER_STATUS, LEAD_STATUS, PAYMENT_METHOD, telHref, waHref } from './util.js';

const today = () => new Date().toISOString().slice(0, 10);

function sourceOptions(current) {
  const sources = get.settings().sources || [];
  const list = [...sources];
  if (current && !list.includes(current)) list.push(current);
  return list.map((s) => ({ value: s, label: s }));
}

function serviceOptions(current) {
  const services = get.services().filter((s) => s.active !== false);
  const options = services.map((s) => ({ value: s.id, label: `${s.name} · ${fmtMoney(s.price)}/${s.unit || 'м²'}` }));
  if (current && !services.some((s) => s.id === current)) options.push({ value: current, label: 'Услуга удалена' });
  return options;
}

export async function openLeadForm(lead = null, defaults = {}) {
  const values = lead ? { ...lead } : { status: 'new', source: 'Сайт', ...defaults };
  const result = await formModal({
    title: lead ? 'Редактировать лид' : 'Новый лид',
    subtitle: lead ? `Создан ${fmtDate(lead.createdAt)}` : 'Заявка, звонок или сообщение',
    submitLabel: lead ? 'Сохранить' : 'Добавить лид',
    fields: [
      { name: 'name', label: 'Имя / компания', required: true, span: 2, placeholder: 'Анна Сергеева' },
      { name: 'phone', label: 'Телефон', type: 'tel', placeholder: '+7 900 000-00-00' },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'mail@example.ru' },
      { name: 'source', label: 'Источник', type: 'select', options: sourceOptions(values.source) },
      { name: 'serviceId', label: 'Услуга', type: 'select', options: serviceOptions(values.serviceId), emptyOption: 'Не выбрана' },
      { name: 'area', label: 'Площадь, м²', type: 'number', step: '0.1', placeholder: '18' },
      { name: 'estimate', label: 'Оценка, ₽', type: 'money', placeholder: '11 700' },
      { name: 'status', label: 'Статус', type: 'select', options: Object.entries(LEAD_STATUS).map(([value, meta]) => ({ value, label: meta.label })) },
      { name: 'nextActionAt', label: 'Следующий контакт', type: 'date' },
      { name: 'address', label: 'Адрес объекта', placeholder: 'Москва, ул. …', span: 2 },
      { name: 'comment', label: 'Комментарий', type: 'textarea', span: 2, rows: 3, placeholder: 'Что нужно клиенту, детали замера' },
    ],
    values,
    onSubmit: async (payload) => {
      if (lead) {
        await actions.updateLead(lead.id, payload);
        toast('Лид обновлён', 'ok');
      } else {
        await actions.createLead(payload);
        toast('Лид добавлен', 'ok');
      }
    },
  });
  return result;
}

export async function openClientForm(client = null) {
  const result = await formModal({
    title: client ? 'Редактировать клиента' : 'Новый клиент',
    fields: [
      { name: 'name', label: 'Имя / компания', required: true, span: 2 },
      { name: 'phone', label: 'Телефон', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'company', label: 'Компания' },
      { name: 'source', label: 'Источник', type: 'select', options: sourceOptions(client?.source), emptyOption: 'Не указан' },
      { name: 'address', label: 'Адрес', span: 2 },
      { name: 'note', label: 'Заметка', type: 'textarea', span: 2 },
    ],
    values: client || {},
    onSubmit: async (payload) => {
      if (client) {
        await actions.updateClient(client.id, payload);
        toast('Клиент обновлён', 'ok');
      } else {
        await actions.createClient(payload);
        toast('Клиент добавлен', 'ok');
      }
    },
  });
  return result;
}

export async function openOrderForm(order = null, defaults = {}) {
  const clients = [...get.clients()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const values = order ? { ...order } : { status: 'new', amount: 0, cost: 0, ...defaults };
  let createdId = null;

  const result = await formModal({
    title: order ? `Заказ ${order.number}` : 'Новый заказ',
    subtitle: order ? '' : 'Номер присвоится автоматически',
    submitLabel: order ? 'Сохранить' : 'Создать заказ',
    size: 'wide',
    fields: [
      { name: 'title', label: 'Название', required: true, span: 2, placeholder: 'Атермальная плёнка, офис' },
      { name: 'clientId', label: 'Клиент', type: 'select', options: clientOptions, emptyOption: 'Без клиента' },
      { name: 'serviceId', label: 'Услуга', type: 'select', options: serviceOptions(values.serviceId), emptyOption: 'Не выбрана' },
      { name: 'amount', label: 'Сумма заказа, ₽', type: 'money', required: true },
      { name: 'cost', label: 'Себестоимость, ₽', type: 'money', hint: 'Материалы + монтаж' },
      { name: 'area', label: 'Площадь, м²', type: 'number', step: '0.1' },
      { name: 'status', label: 'Статус', type: 'select', options: Object.entries(ORDER_STATUS).map(([value, meta]) => ({ value, label: meta.label })) },
      { name: 'deadline', label: 'Срок сдачи', type: 'date' },
      { name: 'address', label: 'Адрес объекта', span: 2 },
      { name: 'note', label: 'Комментарий', type: 'textarea', span: 2 },
    ],
    values,
    onSubmit: async (payload) => {
      if (order) {
        await actions.updateOrder(order.id, payload);
        toast('Заказ обновлён', 'ok');
      } else {
        const snapshot = await actions.createOrder(payload);
        createdId = snapshot.item?.id || null;
        toast('Заказ создан', 'ok');
      }
    },
  });
  if (result && createdId) {
    location.hash = `#/orders/${createdId}`;
  }
  return result;
}

export async function openPaymentForm(orderId = '', defaults = {}) {
  const orders = get.orders().filter((o) => o.status !== 'cancelled');
  const options = orders.map((o) => {
    const paid = get.paid(o.id);
    const debt = Math.max(0, o.amount - paid);
    return { value: o.id, label: `${o.number} · ${o.title} · долг ${fmtMoney(debt)}` };
  });
  const selected = orders.find((o) => o.id === orderId);
  const remaining = selected ? Math.max(0, selected.amount - get.paid(selected.id)) : 0;

  const result = await formModal({
    title: 'Добавить оплату',
    fields: [
      { name: 'orderId', label: 'Заказ', type: 'select', required: true, options, emptyOption: orders.length ? 'Выберите заказ' : 'Нет заказов', span: 2 },
      { name: 'amount', label: 'Сумма, ₽', type: 'money', required: true, hint: remaining ? `Остаток по заказу: ${fmtMoney(remaining)}` : '' },
      { name: 'date', label: 'Дата', type: 'date' },
      { name: 'method', label: 'Способ', type: 'select', options: Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label })) },
      { name: 'note', label: 'Комментарий', placeholder: 'Аванс 50%' },
    ],
    values: { orderId, date: today(), method: 'transfer', amount: remaining || '', ...defaults },
    submitLabel: 'Добавить',
    onSubmit: async (payload) => {
      await actions.addPayment(payload);
      toast('Оплата добавлена', 'ok');
    },
  });
  return result;
}

export async function openExpenseForm(defaults = {}) {
  const categories = get.settings().expenseCategories || ['Прочее'];
  const result = await formModal({
    title: 'Новый расход',
    fields: [
      { name: 'category', label: 'Категория', type: 'select', options: categories.map((c) => ({ value: c, label: c })) },
      { name: 'amount', label: 'Сумма, ₽', type: 'money', required: true },
      { name: 'date', label: 'Дата', type: 'date' },
      { name: 'note', label: 'Комментарий', placeholder: 'За что и кому' },
    ],
    values: { category: categories[0], date: today(), ...defaults },
    submitLabel: 'Добавить',
    onSubmit: async (payload) => {
      await actions.addExpense(payload);
      toast('Расход добавлен', 'ok');
    },
  });
  return result;
}

export async function openTaskForm(defaults = {}) {
  const result = await formModal({
    title: 'Новая задача',
    fields: [
      { name: 'title', label: 'Что сделать', required: true, span: 2, placeholder: 'Позвонить клиенту' },
      { name: 'dueAt', label: 'Срок', type: 'date' },
    ],
    values: { dueAt: today(), ...defaults },
    submitLabel: 'Добавить',
    onSubmit: async (payload) => {
      await actions.addTask(payload);
      toast('Задача добавлена', 'ok');
    },
  });
  return result;
}

export async function deleteEntity(kind, entity) {
  const meta = {
    lead: ['Удалить лид?', `«${entity.name}» будет удалён безвозвратно.`, () => actions.deleteLead(entity.id)],
    client: ['Удалить клиента?', `«${entity.name}» будет удалён. Заказы останутся без привязки.`, () => actions.deleteClient(entity.id)],
    order: ['Удалить заказ?', `${entity.number} и все его оплаты будут удалены.`, () => actions.deleteOrder(entity.id)],
    payment: ['Удалить оплату?', `Платёж на ${fmtMoney(entity.amount)} будет удалён.`, () => actions.deletePayment(entity.id)],
    expense: ['Удалить расход?', `Расход на ${fmtMoney(entity.amount)} будет удалён.`, () => actions.deleteExpense(entity.id)],
    task: ['Удалить задачу?', entity.title, () => actions.deleteTask(entity.id)],
  }[kind];
  if (!meta) return false;
  const ok = await confirmModal({ title: meta[0], text: meta[1], confirmLabel: 'Удалить', danger: true });
  if (!ok) return false;
  await meta[2]();
  toast('Удалено', 'ok');
  return true;
}

export function leadContactLinks(lead) {
  return `<a class="btn sm" href="${telHref(lead.phone)}" target="_blank" rel="noopener">Позвонить</a>
    <a class="btn sm" href="${waHref(lead.phone)}" target="_blank" rel="noopener">WhatsApp</a>`;
}

export { esc, fmtMoney, fmtDate };
