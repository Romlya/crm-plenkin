'use strict';

/**
 * UI-аудит CRM: открывает все разделы в headless Chrome, проверяет рендер,
 * ловит ошибки консоли и прогоняет пользовательские сценарии.
 *
 * Запуск: node tools/audit-ui.js [http://localhost:7821]
 * Требуется Node 22+ и установленный Chrome.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const BASE = process.argv[2] || process.env.CRM_URL || 'http://localhost:7821';
const BROWSER = process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.CDP_PORT || 9335);
const SHOTS = path.join(__dirname, '..', '..', 'shots');
const PASSWORD = process.env.CRM_AUDIT_PASSWORD || 'audit-pass-123';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;
const failures = [];

function check(ok, label, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return ok;
}

async function api(pathname, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
}

async function getJson(pathname, method = 'GET') {
  const response = await fetch(`http://127.0.0.1:${PORT}${pathname}`, { method });
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.exceptions = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const detail = message.params.exceptionDetails;
        this.exceptions.push(detail.exception?.description || detail.text || 'unknown');
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.exceptions.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 25000);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed');
    }
    return result.result.value;
  }
}

const WAIT_HELPER = `
  const wait = (fn, ms = 5000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      let ok = false;
      try { ok = fn(); } catch { ok = false; }
      if (ok) { clearInterval(timer); resolve(true); }
      else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error('timeout')); }
    }, 50);
  });
`;

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  console.log(`UI-АУДИТ ${BASE}`);

  // ── подготовка сессии
  let session = await api('/api/auth/setup', { method: 'POST', body: { password: PASSWORD, name: 'Аудит' } });
  if (session.status !== 200) session = await api('/api/auth/login', { method: 'POST', body: { password: PASSWORD } });
  const setCookie = session.headers.get('set-cookie') || '';
  const cookiePair = setCookie.split(';')[0];
  const cookieValue = cookiePair.split('=')[1];
  const setupOk = session.status === 200;
  check(setupOk, 'авторизация / создание владельца', `status ${session.status}`);
  check(Boolean(cookieValue), 'сессионная cookie получена');

  const dataResponse = await api('/api/data', { cookie: cookiePair });
  const data = dataResponse.body;
  check(dataResponse.status === 200 && data.orders.length > 0, 'данные загружены', `orders=${data?.orders?.length}`);

  const orderId = data.orders.find((o) => o.status !== 'closed')?.id || data.orders[0].id;
  const clientId = data.clients[0].id;

  // ── браузер
  const profile = path.join(os.tmpdir(), `crm-audit-${Date.now()}`);
  const child = spawn(BROWSER, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  let ready = null;
  for (let i = 0; i < 40; i += 1) {
    try { ready = await getJson('/json/version'); break; } catch { await sleep(250); }
  }
  if (!ready) throw new Error('браузер не запустился');

  const target = await getJson('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const host = new URL(BASE).hostname;
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', { name: 'plenkin_crm', value: cookieValue, domain: host, path: '/' });

  const goto = async (hash, waitMs = 700) => {
    if (!hash) throw new Error('пустой маршрут');
    await cdp.evaluate(`location.hash = ${JSON.stringify(hash)};`);
    await sleep(waitMs);
  };

  const shot = async (name) => {
    const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, `audit-${name}.png`), Buffer.from(image.data, 'base64'));
  };

  await cdp.send('Page.navigate', { url: `${BASE}/#/dashboard` });
  await sleep(1500);

  // ── разделы
  const sections = [
    {
      hash: '#/dashboard', name: 'dashboard', title: 'Обзор',
      script: `return {
        title: document.title,
        kpi: document.querySelectorAll('.kpi').length,
        chart: Boolean(document.querySelector('svg.chart')),
        funnel: document.querySelectorAll('.funnel-row').length,
        tasks: document.querySelectorAll('.task-item').length,
        text: document.querySelector('#view')?.innerText.length || 0
      };`,
      validate: (v) => v.kpi >= 4 && v.chart && v.funnel >= 5 && v.text > 300,
    },
    {
      hash: '#/leads', name: 'leads', title: 'Лиды',
      script: `return {
        columns: document.querySelectorAll('.kanban-col').length,
        cards: document.querySelectorAll('.kcard').length,
        text: document.querySelector('#view')?.innerText.length || 0
      };`,
      validate: (v) => v.columns === 7 && v.cards > 0,
    },
    {
      hash: '#/orders', name: 'orders', title: 'Заказы',
      script: `return {
        rows: document.querySelectorAll('#view .list .row').length,
        head: Boolean(document.querySelector('#view .list-head')),
        text: document.querySelector('#view')?.innerText.length || 0
      };`,
      validate: (v) => v.rows >= 10 && v.head,
    },
    {
      hash: '#/payments', name: 'payments', title: 'Оплаты',
      script: `return {
        rows: document.querySelectorAll('#view .list .row').length,
        kpi: document.querySelectorAll('.kpi').length
      };`,
      validate: (v) => v.rows > 0 && v.kpi >= 4,
    },
    {
      hash: '#/clients', name: 'clients', title: 'Клиенты',
      script: `return { rows: document.querySelectorAll('#view .list .row').length };`,
      validate: (v) => v.rows >= 6,
    },
    {
      hash: '#/expenses', name: 'expenses', title: 'Расходы',
      script: `return {
        rows: document.querySelectorAll('#view .list .row').length,
        kpi: document.querySelectorAll('.kpi').length
      };`,
      validate: (v) => v.rows > 0 && v.kpi >= 4,
    },
    {
      hash: '#/analytics', name: 'analytics', title: 'Аналитика',
      script: `return {
        chart: Boolean(document.querySelector('svg.chart')),
        stat: document.querySelectorAll('.stat-line').length,
        funnel: document.querySelectorAll('.funnel-row').length
      };`,
      validate: (v) => v.chart && v.stat >= 4 && v.funnel >= 5,
    },
    {
      hash: '#/settings', name: 'settings', title: 'Настройки',
      script: `return {
        inputs: document.querySelectorAll('#view input').length,
        services: document.querySelectorAll('[data-svc-row]').length,
        token: Boolean(document.querySelector('input[readonly]'))
      };`,
      validate: (v) => v.inputs > 10 && v.services >= 8 && v.token,
    },
    {
      hash: `#/orders/${orderId}`, name: 'order-detail', title: 'Заказ',
      script: `return {
        kpi: document.querySelectorAll('.kpi').length,
        payments: document.querySelectorAll('[data-del-payment]').length,
        status: Boolean(document.querySelector('[data-status]'))
      };`,
      validate: (v) => v.kpi >= 4 && v.status && v.payments >= 1,
    },
    {
      hash: `#/clients/${clientId}`, name: 'client-detail', title: 'Клиент',
      script: `return {
        kpi: document.querySelectorAll('.kpi').length,
        orders: document.querySelectorAll('a[href^="#/orders/"]').length
      };`,
      validate: (v) => v.kpi >= 4 && v.orders > 0,
    },
  ];

  for (const section of sections) {
    cdp.exceptions = [];
    await goto(section.hash, 650);
    let value = null;
    try {
      value = await cdp.evaluate(section.script);
    } catch (error) {
      value = null;
    }
    check(Boolean(value) && section.validate(value), `${section.title}: отрисовка`, JSON.stringify(value));
    check(cdp.exceptions.length === 0, `${section.title}: без JS-ошибок`, cdp.exceptions.slice(0, 2).join(' | '));
    await shot(section.name);
  }

  // ── сценарий: создать лид через интерфейс
  await goto('#/leads', 500);
  let flow = await cdp.evaluate(`
    ${WAIT_HELPER}
    document.querySelector('[data-quick-add]').click();
    await wait(() => document.querySelector('[data-quick="lead"]'));
    document.querySelector('[data-quick="lead"]').click();
    await wait(() => document.querySelector('.modal form [name="name"]'));
    const form = document.querySelector('.modal form');
    form.querySelector('[name="name"]').value = 'Аудит Лид';
    form.querySelector('[name="phone"]').value = '+7 900 111-22-33';
    form.querySelector('[name="estimate"]').value = '5000';
    document.querySelector('.modal [data-act="submit"]').click();
    await wait(() => !document.querySelector('.modal'), 6000);
    await wait(() => document.body.innerText.includes('Аудит Лид'), 4000);
    return { ok: true };
  `);
  check(flow.ok, 'Лид: создание через форму');

  // ── сценарий: конвертировать лид в заказ
  await goto('#/leads', 500);
  cdp.exceptions = [];
  try {
    flow = await cdp.evaluate(`
      ${WAIT_HELPER}
      const cards = [...document.querySelectorAll('.kcard')];
      const card = cards.find((c) => c.innerText.includes('Аудит Лид'));
      if (!card) throw new Error('карточка лида не найдена');
      card.querySelector('[data-menu-lead]').click();
      await wait(() => document.querySelector('.modal [data-move="convert"]'));
      document.querySelector('.modal [data-move="convert"]').click();
      await wait(() => document.querySelector('.modal [data-act="ok"]'));
      document.querySelector('.modal [data-act="ok"]').click();
      await wait(() => location.hash.startsWith('#/orders/'), 6000);
      await wait(() => document.querySelector('#view')?.innerText.includes('ПЛ-'), 4000);
      return { ok: true, hash: location.hash, title: document.querySelector('.page-title')?.innerText };
    `);
  } catch (error) {
    const diag = await cdp.evaluate(`
      return {
        modals: document.querySelectorAll('.modal').length,
        menu: document.querySelectorAll('[data-menu-lead]').length,
        hash: location.hash,
        view: document.querySelector('#view')?.innerText.slice(0, 200)
      };
    `).catch(() => null);
    console.log('  DEBUG convert:', error.message, JSON.stringify(diag), '| exceptions:', cdp.exceptions.join(' | '));
    flow = { ok: false, hash: diag?.hash };
  }
  check(flow.ok && /^#\/orders\//.test(flow.hash || ''), 'Лид → заказ: конвертация', flow.hash);
  const createdOrderHash = flow.hash || `#/orders/${data.orders[0].id}`;

  // ── сценарий: оплата по заказу
  await goto(createdOrderHash, 700);
  flow = null;
  cdp.exceptions = [];
  try {
    flow = await cdp.evaluate(`
      ${WAIT_HELPER}
      const before = [...document.querySelectorAll('.stat-line')].find((n) => n.innerText.includes('Оплачено'))?.innerText || '';
      const buttons = document.querySelectorAll('[data-act="pay"]').length;
      document.querySelector('[data-act="pay"]').click();
      await wait(() => document.querySelector('.modal [name="amount"]'));
      const form = document.querySelector('.modal form');
      form.querySelector('[name="amount"]').value = '1500';
      document.querySelector('.modal [data-act="submit"]').click();
      await wait(() => !document.querySelector('.modal'), 6000);
      await wait(() => document.querySelector('#view').innerText.replace(/\u00A0/g, ' ').includes('1 500'), 4000);
      return { ok: true, before, buttons };
    `);
  } catch (error) {
    const diag = await cdp.evaluate(`
      return {
        modals: document.querySelectorAll('.modal').length,
        error: document.querySelector('.form-error')?.innerText || '',
        amount: document.querySelector('.modal [name="amount"]')?.value || '',
        select: document.querySelector('.modal [name="orderId"]')?.value || '',
        hash: location.hash,
        toast: document.querySelector('.toast')?.innerText || ''
      };
    `).catch(() => null);
    console.log('  DEBUG pay:', error.message, JSON.stringify(diag), '| exceptions:', cdp.exceptions.join(' | '));
    flow = { ok: false };
  }
  check(flow.ok, 'Оплата: добавление из карточки заказа', flow.buttons);

  // ── сценарий: расход
  await goto('#/expenses', 500);
  flow = await cdp.evaluate(`
    ${WAIT_HELPER}
    document.querySelector('[data-act="new"]').click();
    await wait(() => document.querySelector('.modal [name="amount"]'));
    const form = document.querySelector('.modal form');
    form.querySelector('[name="amount"]').value = '1234';
    form.querySelector('[name="note"]').value = 'Проверка аудита';
    document.querySelector('.modal [data-act="submit"]').click();
    await wait(() => !document.querySelector('.modal'), 6000);
    await wait(() => document.querySelector('#view').innerText.replace(/\u00A0/g, ' ').includes('1 234'), 4000);
    return { ok: true };
  `);
  check(flow.ok, 'Расходы: создание');

  // ── сценарий: настройки (сохранение)
  await goto('#/settings', 500);
  flow = await cdp.evaluate(`
    ${WAIT_HELPER}
    const input = document.querySelector('[data-company="site"]');
    input.value = 'plenkinaokna.ru';
    document.querySelector('[data-act="save-company"]').click();
    await wait(() => document.body.innerText.includes('Данные компании сохранены'), 5000);
    return { ok: true };
  `);
  check(flow.ok, 'Настройки: сохранение компании');

  // ── сценарий: поиск
  await goto('#/orders', 400);
  flow = await cdp.evaluate(`
    ${WAIT_HELPER}
    document.querySelector('[data-search]').click();
    await wait(() => document.querySelector('#searchInput'));
    const input = document.querySelector('#searchInput');
    input.value = 'СтройГрад';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(() => document.querySelectorAll('#searchResults .attn-item').length > 0, 4000);
    const found = document.querySelectorAll('#searchResults .attn-item').length;
    document.querySelector('.modal-close').click();
    return { ok: true, found };
  `);
  check(flow.ok && flow.found > 0, 'Поиск: находит клиента', `найдено ${flow.found}`);

  // ── сценарий: валидация формы
  flow = await cdp.evaluate(`
    ${WAIT_HELPER}
    document.querySelector('[data-quick-add]').click();
    await wait(() => document.querySelector('[data-quick="lead"]'));
    document.querySelector('[data-quick="lead"]').click();
    await wait(() => document.querySelector('.modal [data-act="submit"]'));
    document.querySelector('.modal [data-act="submit"]').click();
    await wait(() => document.querySelector('.form-error') && !document.querySelector('.form-error').classList.contains('hidden'), 3000);
    const text = document.querySelector('.form-error').innerText;
    document.querySelector('.modal-close').click();
    return { ok: true, text };
  `);
  check(flow.ok && /Заполните/.test(flow.text), 'Валидация: обязательные поля', flow.text);

  // ── mobile
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await goto('#/dashboard', 900);
  const mobile = await cdp.evaluate(`
    return {
      nav: getComputedStyle(document.querySelector('.mobile-nav')).display,
      sidebar: getComputedStyle(document.querySelector('#sidebar')).transform,
      kpi: document.querySelectorAll('.kpi').length,
      overflow: document.documentElement.scrollWidth <= 391
    };
  `);
  check(mobile.nav !== 'none', 'Мобильная версия: нижняя навигация', mobile.nav);
  check(mobile.sidebar !== 'none', 'Мобильная версия: сайдбар скрыт', mobile.sidebar);
  check(mobile.overflow, 'Мобильная версия: нет горизонтального скролла');
  await shot('mobile');

  // ── итог
  console.log(`\nИТОГО UI: ${passed} ok, ${failed} fail`);
  if (failures.length) console.log('Провалено:', failures.join(', '));

  ws.close();
  child.kill();
  await sleep(300);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error('UI AUDIT ERROR', error.message);
  process.exitCode = 1;
});

