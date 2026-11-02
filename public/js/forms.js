// Формы создания/редактирования сущностей

import { formModal, toast, confirmModal, openModal } from './ui.js';
import { actions, get } from './store.js';
import { esc, fmtMoney, fmtDate, fmtArea, ORDER_STATUS, LEAD_STATUS, PAYMENT_METHOD, telHref, waHref } from './util.js';

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

// ───────────────────────────── смета и условия

export function openEstimateForm(order) {
  const initial = order.items?.length
    ? order.items.map((item) => ({ ...item }))
    : [{
      name: order.title,
      qty: order.area || 1,
      unit: 'м²',
      price: order.area ? Math.round(order.amount / order.area) : order.amount,
      cost: order.area ? Math.round(order.cost / order.area) : order.cost,
    }];

  const rowHtml = (item = {}) => `
    <div class="estimate-row" data-row>
      <input class="input" data-field="name" placeholder="Наименование" value="${esc(item.name || '')}" />
      <input class="input" data-field="qty" type="number" step="0.1" placeholder="1" value="${esc(item.qty ?? 1)}" />
      <input class="input" data-field="unit" placeholder="м²" value="${esc(item.unit || 'м²')}" />
      <input class="input" data-field="price" type="number" step="1" placeholder="0" value="${esc(item.price ?? 0)}" />
      <input class="input" data-field="cost" type="number" step="1" placeholder="0" value="${esc(item.cost ?? 0)}" title="Себестоимость за единицу" />
      <button class="btn ghost icon sm" type="button" data-remove aria-label="Удалить строку">${'✕'}</button>
    </div>`;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      handle.close();
      resolve(value);
    };

    const handle = openModal({
      title: 'Смета и условия',
      subtitle: `${order.number} · ${order.title}`,
      size: 'wide',
      body: `
        <div class="estimate-grid-head">
          <span>Наименование</span><span>Кол-во</span><span>Ед.</span><span>Цена</span><span>Себест.</span><span></span>
        </div>
        <div id="estimateRows">${initial.map(rowHtml).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn sm" type="button" id="addRow">+ Строка</button>
          <span class="dim" style="font-size:12px;align-self:center">Себестоимость — за единицу, для расчёта прибыли</span>
        </div>
        <div class="form-grid" style="margin-top:16px">
          <div class="field">
            <label>Скидка, ₽</label>
            <input class="input" id="estimateDiscount" type="number" min="0" step="1" value="${Number(order.discount) || 0}" />
          </div>
          <div class="field">
            <label>Итого</label>
            <div class="estimate-total" id="estimateTotal">0 ₽</div>
          </div>
          <div class="field span-2">
            <label>Дополнительные условия (печатаются в документах)</label>
            <textarea class="textarea" id="estimateTerms" rows="4" placeholder="Например: работы в будни с 9:00 до 18:00, пропуска оформляет заказчик">${esc(order.terms || '')}</textarea>
          </div>
        </div>`,
      footer: `<div class="spacer"></div>
        <button class="btn" data-act="cancel">Отмена</button>
        <button class="btn primary" data-act="save">Сохранить смету</button>`,
      onMount: (element) => {
        const rows = element.querySelector('#estimateRows');
        const totalNode = element.querySelector('#estimateTotal');
        const discountNode = element.querySelector('#estimateDiscount');

        const total = () => {
          let sum = 0;
          rows.querySelectorAll('[data-row]').forEach((row) => {
            const qty = Number(row.querySelector('[data-field="qty"]').value) || 0;
            const price = Number(row.querySelector('[data-field="price"]').value) || 0;
            sum += qty * price;
          });
          sum -= Number(discountNode.value) || 0;
          totalNode.textContent = fmtMoney(Math.max(0, sum));
          return sum;
        };

        const collect = () => [...rows.querySelectorAll('[data-row]')].map((row) => ({
          name: row.querySelector('[data-field="name"]').value.trim(),
          qty: Number(row.querySelector('[data-field="qty"]').value) || 0,
          unit: row.querySelector('[data-field="unit"]').value.trim() || 'м²',
          price: Number(row.querySelector('[data-field="price"]').value) || 0,
          cost: Number(row.querySelector('[data-field="cost"]').value) || 0,
        })).filter((item) => item.name);

        element.addEventListener('input', total);
        element.querySelector('#addRow').addEventListener('click', () => {
          rows.insertAdjacentHTML('beforeend', rowHtml({}));
          total();
        });
        rows.addEventListener('click', (event) => {
          if (event.target.closest('[data-remove]')) {
            event.target.closest('[data-row]').remove();
            total();
          }
        });
        element.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(null));
        element.querySelector('[data-act="save"]').addEventListener('click', async () => {
          const items = collect();
          if (!items.length) {
            toast('Добавьте хотя бы одну строку', 'err');
            return;
          }
          try {
            await actions.updateOrder(order.id, {
              items,
              discount: Number(discountNode.value) || 0,
              terms: element.querySelector('#estimateTerms').value,
              title: order.title,
            });
            toast('Смета сохранена', 'ok');
            finish(true);
          } catch (error) {
            toast(error.message, 'err');
          }
        });
        total();
      },
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    });
  });
}

// ───────────────────────────── монтажники

export async function openInstallerForm(installer = null) {
  const result = await formModal({
    title: installer ? 'Монтажник' : 'Новый монтажник',
    fields: [
      { name: 'name', label: 'Имя', required: true, span: 2 },
      { name: 'phone', label: 'Телефон', type: 'tel' },
      { name: 'role', label: 'Роль', placeholder: 'Монтажник / Бригадир' },
      {
        name: 'rateType', label: 'Ставка', type: 'select',
        options: [
          { value: 'percent', label: 'Процент от заказа' },
          { value: 'per_m2', label: '₽ за м²' },
          { value: 'fixed', label: 'Фиксированная' },
        ],
      },
      { name: 'rate', label: 'Значение ставки', type: 'number', step: '0.1' },
      { name: 'active', label: 'Работает', type: 'checkbox', checkLabel: 'Активен', value: true },
      { name: 'note', label: 'Заметка', type: 'textarea', span: 2 },
    ],
    values: installer || { rateType: 'percent', rate: 20, active: true },
    onSubmit: async (payload) => {
      if (installer) {
        await actions.updateInstaller(installer.id, payload);
        toast('Монтажник обновлён', 'ok');
      } else {
        await actions.createInstaller(payload);
        toast('Монтажник добавлен', 'ok');
      }
    },
  });
  return result;
}

export function openAssignForm(order) {
  const assigned = new Set((order.installers || []).map((a) => a.installerId));
  const available = get.installers().filter((i) => i.active !== false && !assigned.has(i.id));
  if (!available.length) {
    toast('Все активные монтажники уже назначены', 'err');
    return Promise.resolve(null);
  }
  const options = available.map((i) => ({
    value: i.id,
    label: `${i.name} · ${i.role} · ${i.rateType === 'percent' ? `${i.rate}%` : i.rateType === 'per_m2' ? `${i.rate} ₽/м²` : `${fmtMoney(i.rate)}`}`,
  }));

  return formModal({
    title: 'Назначить монтажника',
    subtitle: order.number,
    fields: [
      { name: 'installerId', label: 'Монтажник', type: 'select', required: true, options, span: 2 },
      { name: 'role', label: 'Роль на объекте', placeholder: 'Монтажник' },
      { name: 'amount', label: 'Сумма к выплате, ₽', type: 'money', required: true, hint: 'Можно изменить вручную' },
    ],
    values: { role: 'Монтажник', amount: '' },
    submitLabel: 'Назначить',
    onSubmit: async (payload) => {
      const next = [...(order.installers || []), {
        installerId: payload.installerId,
        role: payload.role || 'Монтажник',
        amount: Number(payload.amount) || 0,
      }];
      await actions.updateOrder(order.id, { installers: next });
      toast('Монтажник назначен', 'ok');
    },
  });
}

export function openPayoutForm(order, installerId = '') {
  const installers = get.installers();
  if (!installers.length) {
    toast('Сначала добавьте монтажников', 'err');
    return Promise.resolve(null);
  }
  const orderOptions = get.orders()
    .filter((o) => o.status !== 'cancelled')
    .map((o) => ({ value: o.id, label: `${o.number} · ${o.title}` }));

  const options = installers.map((i) => ({ value: i.id, label: `${i.name} · ${i.role}` }));
  const labor = order ? orderLaborLocal(order) : { assigned: 0, paid: 0, planned: 0, debt: 0 };

  return formModal({
    title: 'Выплата монтажнику',
    fields: [
      { name: 'orderId', label: 'Заказ', type: 'select', required: true, options: orderOptions, emptyOption: 'Выберите заказ', span: 2 },
      { name: 'installerId', label: 'Монтажник', type: 'select', required: true, options, span: 2 },
      { name: 'amount', label: 'Сумма, ₽', type: 'money', required: true, hint: order ? `Назначено: ${fmtMoney(labor.assigned)} · к выплате: ${fmtMoney(labor.debt)}` : '' },
      { name: 'status', label: 'Статус', type: 'select', options: [{ value: 'paid', label: 'Выплачено' }, { value: 'planned', label: 'Запланировано' }] },
      { name: 'date', label: 'Дата', type: 'date' },
      { name: 'method', label: 'Способ', type: 'select', options: Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label })) },
      { name: 'note', label: 'Комментарий', placeholder: 'Аванс / расчёт', span: 2 },
    ],
    values: {
      orderId: order?.id || '',
      installerId,
      amount: labor.debt || '',
      status: 'paid',
      date: today(),
      method: 'transfer',
    },
    submitLabel: 'Сохранить',
    onSubmit: async (payload) => {
      await actions.createPayout(payload);
      toast('Выплата сохранена', 'ok');
    },
  });
}

function orderLaborLocal(order) {
  const assigned = (order.installers || []).reduce((sum, item) => sum + (item.amount || 0), 0);
  const payouts = get.payouts().filter((p) => p.orderId === order.id);
  const paid = payouts.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const planned = payouts.filter((p) => p.status !== 'paid').reduce((sum, p) => sum + p.amount, 0);
  return { assigned, paid, planned, debt: Math.max(0, assigned - paid) };
}

export { esc, fmtMoney, fmtDate, fmtArea };
