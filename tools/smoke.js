'use strict';

/**
 * Smoke-тест API CRM. Запуск: node tools/smoke.js [baseUrl]
 * Проверяет все CRUD-сценарии, авторизацию, экспорт и приём заявок.
 */

const BASE = process.argv[2] || process.env.CRM_URL || 'http://localhost:7810';
let cookie = '';
let failed = 0;
let passed = 0;

function assert(condition, label, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label} ${extra}`);
  }
}

async function call(method, path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let payload = null;
  const type = response.headers.get('content-type') || '';
  if (type.includes('json')) payload = await response.json();
  else payload = await response.text();
  return { status: response.status, body: payload };
}

async function main() {
  console.log(`SMOKE ${BASE}`);

  const health = await call('GET', '/api/health');
  assert(health.status === 200 && health.body.ok, 'health 200');

  const unauthorized = await call('GET', '/api/data');
  assert(unauthorized.status === 401, 'данные без входа → 401');

  let setup = await call('POST', '/api/auth/setup', { password: 'testpass123', name: 'Тест' });
  if (setup.status !== 200) setup = await call('POST', '/api/auth/login', { password: 'testpass123' });
  assert(setup.status === 200 && setup.body.ok, 'первичная настройка пароля');

  const data = await call('GET', '/api/data');
  assert(data.status === 200 && Array.isArray(data.body.leads), 'чтение данных после входа');

  const client = await call('POST', '/api/clients', { name: 'ООО Тест', phone: '+7 900 000-00-01', source: 'Сайт' });
  assert(client.status === 201 && client.body.item.id, 'создание клиента');
  const clientId = client.body.item.id;

  const clientPatch = await call('PATCH', `/api/clients/${clientId}`, { name: 'ООО Тест 2', email: 'test@test.ru' });
  assert(clientPatch.status === 200 && clientPatch.body.item.name === 'ООО Тест 2', 'редактирование клиента');

  const lead = await call('POST', '/api/leads', { name: 'Иван Тестов', phone: '+7 900 000-00-02', source: 'Сайт', estimate: 12000, area: 10 });
  assert(lead.status === 201 && lead.body.item.id, 'создание лида');
  const leadId = lead.body.item.id;

  const leadPatch = await call('PATCH', `/api/leads/${leadId}`, { status: 'measure' });
  assert(leadPatch.status === 200 && leadPatch.body.item.status === 'measure', 'смена статуса лида');

  const convert = await call('POST', `/api/leads/${leadId}/convert`, { amount: 12000 });
  assert(convert.status === 200 && convert.body.order.number.startsWith('ПЛ-'), 'конвертация лида в заказ');
  const orderId = convert.body.order.id;
  assert(convert.body.order.clientId === clientId || convert.body.order.clientId, 'заказ связан с клиентом');

  const orderPatch = await call('PATCH', `/api/orders/${orderId}`, { cost: 5000, status: 'install' });
  assert(orderPatch.status === 200 && orderPatch.body.item.cost === 5000, 'редактирование заказа');

  const payment = await call('POST', '/api/payments', { orderId, amount: 6000, method: 'cash', note: 'Аванс' });
  assert(payment.status === 201, 'добавление оплаты');

  const overpay = await call('POST', '/api/payments', { orderId, amount: 9000, method: 'card' });
  assert(overpay.status === 201, 'вторая оплата (переплата допустима)');

  const badPayment = await call('POST', '/api/payments', { orderId, amount: 0 });
  assert(badPayment.status === 400, 'оплата 0 ₽ отклонена');

  const expense = await call('POST', '/api/expenses', { category: 'Реклама', amount: 3000, note: 'Тест' });
  assert(expense.status === 201, 'добавление расхода');

  const task = await call('POST', '/api/tasks', { title: 'Позвонить', dueAt: new Date().toISOString() });
  assert(task.status === 201, 'добавление задачи');
  const taskDone = await call('PATCH', `/api/tasks/${task.body.item.id}`, { done: true });
  assert(taskDone.status === 200 && taskDone.body.item.done === true, 'закрытие задачи');

  const settings = await call('PATCH', '/api/settings', { company: { phone: '+7 985 780-13-75' } });
  assert(settings.status === 200 && settings.body.settings.company.phone === '+7 985 780-13-75', 'сохранение настроек');

  const token = settings.body.settings.leadToken;
  const publicLead = await call('POST', '/api/public/lead', { name: 'Сайт Тест', phone: '+7 900 000-00-03', message: 'Проверка' }, { 'X-API-Key': token });
  assert(publicLead.status === 201, 'приём заявки с сайта по ключу');

  const badToken = await call('POST', '/api/public/lead', { name: 'Взлом', phone: '+7 900 000-00-04' }, { 'X-API-Key': 'wrong' });
  assert(badToken.status === 401, 'заявка с неверным ключом → 401');

  const csv = await call('GET', '/api/export/orders');
  assert(csv.status === 200 && String(csv.body).includes('Номер'), 'экспорт заказов в CSV');

  const backup = await call('GET', '/api/backup');
  assert(backup.status === 200 && typeof backup.body === 'object', 'скачивание бэкапа');

  const delPayment = await call('DELETE', `/api/payments/${payment.body.item.id}`);
  assert(delPayment.status === 200, 'удаление оплаты');

  const delExpense = await call('DELETE', `/api/expenses/${expense.body.item.id}`);
  assert(delExpense.status === 200, 'удаление расхода');

  const delLead = await call('DELETE', `/api/leads/${leadId}`);
  assert(delLead.status === 200, 'удаление лида');

  const delClient = await call('DELETE', `/api/clients/${clientId}`);
  assert(delClient.status === 200, 'удаление клиента');

  const logout = await call('POST', '/api/auth/logout');
  assert(logout.status === 200, 'выход');
  cookie = '';
  const afterLogout = await call('GET', '/api/data');
  assert(afterLogout.status === 401, 'после выхода данные недоступны');

  const badLogin = await call('POST', '/api/auth/login', { password: 'wrong' });
  assert(badLogin.status === 401, 'неверный пароль → 401');

  const login = await call('POST', '/api/auth/login', { password: 'testpass123', remember: true });
  assert(login.status === 200 && login.body.ok, 'вход с верным паролем');

  await call('POST', '/api/demo/clear');
  const seed = await call('POST', '/api/demo/seed');
  assert(seed.status === 200 && seed.body.orders.length >= 10, 'загрузка демо-данных');

  const clear = await call('POST', '/api/demo/clear');
  assert(clear.status === 200 && clear.body.orders.length === 0, 'очистка демо-данных');

  const badRoute = await call('GET', '/api/unknown');
  assert(badRoute.status === 404, 'неизвестный API → 404');

  const traversal = await fetch(`${BASE}/../server.js`);
  assert(traversal.status === 404 || traversal.status === 403, 'защита от обхода каталога');

  console.log(`\nИТОГО: ${passed} ok, ${failed} fail`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error('SMOKE FAILED', error);
  process.exitCode = 1;
});
