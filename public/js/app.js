// ПЛЕНКИН · CRM — точка входа, оболочка, маршрутизация

import { api, actions, state, setData, get } from './store.js';
import { icon, esc, fmtMoney } from './util.js';
import { toast, openModal } from './ui.js';
import { openLeadForm, openOrderForm, openPaymentForm, openExpenseForm, openClientForm, openTaskForm } from './forms.js';
import { dashboardPage } from './pages/dashboard.js';
import { leadsPage } from './pages/leads.js';
import { ordersPage, orderDetailPage } from './pages/orders.js';
import { paymentsPage } from './pages/payments.js';
import { clientsPage, clientDetailPage } from './pages/clients.js';
import { expensesPage } from './pages/expenses.js';
import { installersPage } from './pages/installers.js';
import { documentPage } from './pages/documents.js';
import { analyticsPage } from './pages/analytics.js';
import { settingsPage } from './pages/settings.js';

const NAV = [
  { group: 'Работа', items: [
    { id: 'dashboard', href: '#/dashboard', label: 'Обзор', icon: 'dashboard' },
    { id: 'leads', href: '#/leads', label: 'Лиды', icon: 'leads', badge: 'newLeads' },
    { id: 'orders', href: '#/orders', label: 'Заказы', icon: 'orders', badge: 'activeOrders' },
    { id: 'payments', href: '#/payments', label: 'Оплаты', icon: 'payments' },
    { id: 'clients', href: '#/clients', label: 'Клиенты', icon: 'clients' },
    { id: 'installers', href: '#/installers', label: 'Монтажники', icon: 'wrench' },
    { id: 'expenses', href: '#/expenses', label: 'Расходы', icon: 'expenses' },
  ] },
  { group: 'Анализ', items: [
    { id: 'analytics', href: '#/analytics', label: 'Аналитика', icon: 'analytics' },
    { id: 'settings', href: '#/settings', label: 'Настройки', icon: 'settings' },
  ] },
];

const ROUTES = [
  { pattern: /^\/?$/, id: 'dashboard', page: dashboardPage, title: 'Обзор' },
  { pattern: /^\/dashboard$/, id: 'dashboard', page: dashboardPage, title: 'Обзор' },
  { pattern: /^\/leads$/, id: 'leads', page: leadsPage, title: 'Лиды' },
  { pattern: /^\/orders$/, id: 'orders', page: ordersPage, title: 'Заказы' },
  { pattern: /^\/orders\/([^/]+)\/doc\/([^/]+)$/, id: 'orders', page: documentPage, title: 'Документ', detail: true },
  { pattern: /^\/orders\/([^/]+)$/, id: 'orders', page: orderDetailPage, title: 'Заказ', detail: true },
  { pattern: /^\/payments$/, id: 'payments', page: paymentsPage, title: 'Оплаты' },
  { pattern: /^\/clients$/, id: 'clients', page: clientsPage, title: 'Клиенты' },
  { pattern: /^\/clients\/([^/]+)$/, id: 'clients', page: clientDetailPage, title: 'Клиент', detail: true },
  { pattern: /^\/installers$/, id: 'installers', page: installersPage, title: 'Монтажники' },
  { pattern: /^\/expenses$/, id: 'expenses', page: expensesPage, title: 'Расходы' },
  { pattern: /^\/analytics$/, id: 'analytics', page: analyticsPage, title: 'Аналитика' },
  { pattern: /^\/settings$/, id: 'settings', page: settingsPage, title: 'Настройки' },
];

const $ = (selector, root = document) => root.querySelector(selector);

function profileName() {
  return get.profile().name || 'Руководитель';
}

function initialsOf(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || 'П';
}

function badgeCounts() {
  const leads = get.leads().filter((l) => l.status === 'new').length;
  const orders = get.orders().filter((o) => !['closed', 'cancelled', 'done'].includes(o.status)).length;
  return { newLeads: leads, activeOrders: orders };
}

// ───────────────────────────── оболочка

function renderShell() {
  const counts = badgeCounts();
  const sidebar = $('#sidebar');
  sidebar.innerHTML = `
    <div class="brand">
      <div class="brand-mark">П</div>
      <div>
        <div class="brand-name">ПЛЕНКИН</div>
        <div class="brand-tag">АРХИТЕКТУРНЫЕ ПЛЁНКИ · CRM</div>
      </div>
    </div>
    <nav class="nav" aria-label="Основная навигация">
      ${NAV.map((group, index) => `
        ${index === 0 ? '' : `<div class="nav-label">${esc(group.group)}</div>`}
        ${group.items.map((item) => {
          const badge = item.badge && counts[item.badge] ? `<span class="nav-badge ${item.badge === 'activeOrders' ? 'soft' : ''}" data-badge="${item.badge}">${counts[item.badge]}</span>` : `<span class="nav-badge ${item.badge === 'activeOrders' ? 'soft' : ''} hidden" data-badge="${item.badge}">0</span>`;
          return `<a class="nav-item" data-nav="${item.id}" href="${item.href}">${icon(item.icon)}<span>${esc(item.label)}</span>${badge}</a>`;
        }).join('')}
      `).join('')}
    </nav>
    <div class="side-foot">
      <div class="side-card">
        <b>Совет дня</b>
        Конвертируйте лид в заказ одним действием — история и клиент сохранятся.
      </div>
      <button class="user-chip" data-open-profile>
        <span class="avatar">${esc(initialsOf(profileName()))}</span>
        <span class="user-meta">
          <span class="user-name">${esc(profileName())}</span>
          <span class="user-role">Руководитель</span>
        </span>
      </button>
    </div>`;

  $('#topbar').innerHTML = `
    <button class="btn ghost icon mobile-only" data-menu aria-label="Меню">${icon('menu')}</button>
    <div>
      <div class="top-title" id="topTitle">Обзор</div>
      <div class="top-crumb" id="topCrumb">${esc(todayLabel())}</div>
    </div>
    <div class="top-spacer"></div>
    <div class="top-actions">
      <button class="search-trigger" data-search aria-label="Поиск">
        ${icon('search')}<span class="label">Поиск по базе</span><kbd>Ctrl K</kbd>
      </button>
      <button class="btn primary" data-quick-add>${icon('plus')}<span class="desktop-only">Добавить</span></button>
    </div>`;

  const mb = badgeCounts();
  $('#mobileNav').innerHTML = `<div class="mobile-nav-inner">
    <a class="mnav-item" data-nav="dashboard" href="#/dashboard">${icon('dashboard')}<span>Обзор</span></a>
    <a class="mnav-item" data-nav="leads" href="#/leads">${icon('leads')}<span>Лиды</span></a>
    <button class="mnav-fab" data-quick-add aria-label="Добавить">${icon('plus')}</button>
    <a class="mnav-item" data-nav="orders" href="#/orders">${icon('orders')}<span>Заказы<span data-mobile-badge>${mb.activeOrders ? ` · ${mb.activeOrders}` : ''}</span></span></a>
    <button class="mnav-item" data-more>${icon('menu')}<span>Ещё</span></button>
  </div>`;

  sidebar.addEventListener('click', (event) => {
    const item = event.target.closest('[data-nav]');
    if (item) closeSidebar();
    if (event.target.closest('[data-open-profile]')) location.hash = '#/settings';
  });
}

function todayLabel() {
  return new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function syncChrome(activeId) {
  document.querySelectorAll('[data-nav]').forEach((node) => {
    node.classList.toggle('active', node.dataset.nav === activeId);
  });
  const counts = badgeCounts();
  document.querySelectorAll('[data-badge]').forEach((node) => {
    const value = counts[node.dataset.badge] || 0;
    node.textContent = String(value);
    node.classList.toggle('hidden', !value);
  });
  const mobileBadge = document.querySelector('[data-mobile-badge]');
  if (mobileBadge) mobileBadge.textContent = counts.activeOrders ? ` · ${counts.activeOrders}` : '';
}

function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#scrim').hidden = false;
  state.ui.sidebarOpen = true;
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#scrim').hidden = true;
  state.ui.sidebarOpen = false;
}

// ───────────────────────────── маршрутизация

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/dashboard';
  return raw.split('?')[0];
}

function resolveRoute(path) {
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return { route, params: { id: match[1], type: match[2] } };
  }
  return null;
}

let renderToken = 0;

function renderRoute() {
  if (!state.data) return;
  const path = parseHash();
  const resolved = resolveRoute(path);
  if (!resolved) {
    location.hash = '#/dashboard';
    return;
  }
  const { route, params } = resolved;
  const stale = $('#view');
  const view = stale.cloneNode(false);
  stale.replaceWith(view);
  const token = ++renderToken;

  $('#topTitle').textContent = route.page.title?.(params, state.data) || route.title;
  $('#topCrumb').textContent = todayLabel();
  syncChrome(route.id);
  view.scrollTop = 0;
  window.scrollTo({ top: 0 });

  try {
    const html = route.page.render(params);
    if (token !== renderToken) return;
    view.innerHTML = html;
    route.page.mount?.(view, params);
    document.title = `${route.page.title?.(params, state.data) || route.title} · ПЛЕНКИН CRM`;
  } catch (error) {
    console.error(error);
    view.innerHTML = `<div class="card"><div class="empty">
      <div class="empty-icon">${icon('alert')}</div>
      <div class="empty-title">Не удалось открыть раздел</div>
      <div class="empty-text">${esc(error.message)}</div>
      <button class="btn mt" data-reload>Перезагрузить</button>
    </div></div>`;
    view.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
  }
}

// ───────────────────────────── быстрые действия

function openQuickAdd() {
  const options = [
    { key: 'lead', title: 'Лид', desc: 'Звонок, заявка с сайта, сообщение', icon: 'leads' },
    { key: 'order', title: 'Заказ', desc: 'Новый объект или договор', icon: 'orders' },
    { key: 'payment', title: 'Оплата', desc: 'Поступление по заказу', icon: 'payments' },
    { key: 'expense', title: 'Расход', desc: 'Материалы, реклама, зарплата', icon: 'expenses' },
    { key: 'client', title: 'Клиент', desc: 'Карточка без заказа', icon: 'clients' },
    { key: 'task', title: 'Задача', desc: 'Напоминание на дату', icon: 'check' },
  ];
  const handle = openModal({
    title: 'Что добавить?',
    subtitle: 'Быстрое создание записи',
    body: `<div style="display:grid;gap:8px">
      ${options.map((option) => `<button class="attn-item" data-quick="${option.key}" style="border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(255,255,255,.02)">
        <span class="attn-icon gold">${icon(option.icon)}</span>
        <span style="min-width:0"><span class="attn-title">${option.title}</span><span class="attn-sub">${option.desc}</span></span>
        <span style="margin-left:auto;color:var(--dim)">${icon('chevron')}</span>
      </button>`).join('')}
    </div>`,
    onMount: (element) => {
      element.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-quick]');
        if (!button) return;
        handle.close();
        const kind = button.dataset.quick;
        if (kind === 'lead') await openLeadForm();
        if (kind === 'order') await openOrderForm();
        if (kind === 'payment') await openPaymentForm();
        if (kind === 'expense') await openExpenseForm();
        if (kind === 'client') await openClientForm();
        if (kind === 'task') await openTaskForm();
        if (kind === 'order' || kind === 'lead') renderRoute();
      });
    },
  });
}

// ───────────────────────────── поиск (Ctrl+K)

function openSearch(initial = '') {
  const handle = openModal({
    title: 'Поиск',
    subtitle: 'Клиенты, заказы, лиды — Enter открывает первую запись',
    body: `<div class="search-box" style="max-width:none">
        ${icon('search')}
        <input class="input" id="searchInput" placeholder="Имя, телефон, номер заказа…" value="${esc(initial)}" autocomplete="off" />
      </div>
      <div id="searchResults" style="margin-top:12px;max-height:52vh;overflow:auto"></div>`,
    onMount: (element, close) => {
      const input = element.querySelector('#searchInput');
      const results = element.querySelector('#searchResults');
      let items = [];
      let cursor = 0;

      const draw = () => {
        if (!items.length) {
          results.innerHTML = `<div class="empty" style="padding:24px 8px">
            <div class="empty-text">${input.value.trim() ? 'Ничего не найдено' : 'Начните вводить запрос'}</div>
          </div>`;
          return;
        }
        results.innerHTML = items.map((item, index) => `
          <button class="attn-item" data-index="${index}" style="width:100%;${index === cursor ? 'background:rgba(232,180,42,.07);border-radius:10px' : ''}">
            <span class="attn-icon">${icon(item.icon)}</span>
            <span style="min-width:0">
              <span class="attn-title">${esc(item.title)}</span>
              <span class="attn-sub">${esc(item.sub)}</span>
            </span>
            <span style="margin-left:auto;font-size:11px;color:var(--dim)">${esc(item.type)}</span>
          </button>`).join('');
      };

      const search = () => {
        const query = input.value.trim().toLowerCase();
        if (!query) {
          items = [];
          draw();
          return;
        }
        const found = [];
        for (const client of get.clients()) {
          if (`${client.name} ${client.phone} ${client.email} ${client.company}`.toLowerCase().includes(query)) {
            found.push({ type: 'клиент', icon: 'clients', title: client.name, sub: [client.phone, client.company].filter(Boolean).join(' · '), href: `#/clients/${client.id}` });
          }
        }
        for (const order of get.orders()) {
          if (`${order.number} ${order.title} ${order.address}`.toLowerCase().includes(query)) {
            found.push({ type: 'заказ', icon: 'orders', title: `${order.number} · ${order.title}`, sub: `${fmtMoney(order.amount)} · ${get.client(order.clientId)?.name || 'без клиента'}`, href: `#/orders/${order.id}` });
          }
        }
        for (const lead of get.leads()) {
          if (`${lead.name} ${lead.phone} ${lead.comment}`.toLowerCase().includes(query)) {
            found.push({ type: 'лид', icon: 'leads', title: lead.name, sub: [lead.phone, lead.source].filter(Boolean).join(' · '), href: `#/leads` });
          }
        }
        items = found.slice(0, 12);
        cursor = 0;
        draw();
      };

      const go = (item) => {
        if (!item) return;
        close();
        location.hash = item.href;
        setTimeout(() => {
          if (item.href === '#/leads') {
            const query = input.value.trim();
            state.ui.leadQuery = query;
            renderRoute();
          }
        }, 30);
      };

      input.addEventListener('input', search);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          cursor = Math.min(items.length - 1, cursor + 1);
          draw();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          cursor = Math.max(0, cursor - 1);
          draw();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          go(items[cursor]);
        }
      });
      results.addEventListener('click', (event) => {
        const button = event.target.closest('[data-index]');
        if (button) go(items[Number(button.dataset.index)]);
      });
      search();
      setTimeout(() => input.focus(), 40);
    },
  });
  return handle;
}

// ───────────────────────────── вход / инициализация

function showBoot(show) {
  $('#boot').classList.toggle('done', !show);
}

function renderAuth(mode, { error = '' } = {}) {
  const auth = $('#auth');
  auth.classList.remove('hidden');
  $('#app').classList.add('hidden');
  const isSetup = mode === 'setup';
  auth.innerHTML = `<div class="auth-card">
    <div class="auth-logo">ПЛЕНКИН</div>
    <div class="auth-tag">АРХИТЕКТУРНЫЕ ПЛЁНКИ · CRM</div>
    <h1 class="auth-title">${isSetup ? 'Настройка CRM' : 'Вход в систему'}</h1>
    <p class="auth-desc">${isSetup ? 'Задайте пароль — он защитит ваши заказы и оплаты.' : 'Введите пароль, чтобы продолжить работу.'}</p>
    <form class="auth-form" id="authForm">
      ${isSetup ? `<div class="field"><label for="authName">Ваше имя</label><input class="input" id="authName" name="name" placeholder="Роман" value="Роман" /></div>` : ''}
      <div class="field"><label for="authPass">Пароль</label><input class="input" id="authPass" name="password" type="password" autocomplete="${isSetup ? 'new-password' : 'current-password'}" placeholder="${isSetup ? 'Минимум 6 символов' : 'Введите пароль'}" required /></div>
      ${isSetup ? `<div class="field"><label for="authPass2">Повторите пароль</label><input class="input" id="authPass2" name="password2" type="password" autocomplete="new-password" placeholder="Ещё раз" required /></div>` : ''}
      ${!isSetup ? `<label class="check"><input type="checkbox" name="remember" checked /> Запомнить меня на 30 дней</label>` : ''}
      <div class="auth-error ${error ? '' : 'hidden'}" id="authError">${esc(error)}</div>
      <button class="btn primary lg block" type="submit">${isSetup ? 'Начать работу' : 'Войти'}</button>
    </form>
    <div class="auth-foot">${isSetup ? 'Данные хранятся локально на этом компьютере' : 'ПЛЕНКИН · с 2009 года · Москва и МО'}</div>
  </div>`;

  const form = $('#authForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    const errorBox = $('#authError');
    button.disabled = true;
    button.textContent = isSetup ? 'Создаём…' : 'Входим…';
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      if (isSetup && data.password !== data.password2) throw new Error('Пароли не совпадают');
      if (isSetup && String(data.password).length < 6) throw new Error('Пароль — минимум 6 символов');
      const snapshot = isSetup
        ? await api.post('/api/auth/setup', { password: data.password, name: data.name })
        : await api.post('/api/auth/login', { password: data.password, remember: Boolean(data.remember) });
      setData(snapshot);
      await enterApp();
    } catch (submitError) {
      errorBox.textContent = submitError.message;
      errorBox.classList.remove('hidden');
      button.disabled = false;
      button.textContent = isSetup ? 'Начать работу' : 'Войти';
      form.querySelector('input[name=password]')?.select();
    }
  });
  setTimeout(() => form.querySelector('input[name=password]')?.focus(), 80);
}

async function enterApp() {
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderShell();
  if (!state.data) await actions.load();
  renderRoute();
  showBoot(false);
}

async function boot() {
  try {
    const status = await api.get('/api/auth/status');
    if (status.needsSetup) {
      renderAuth('setup');
      showBoot(false);
      return;
    }
    if (!status.authenticated) {
      renderAuth('login');
      showBoot(false);
      return;
    }
    await actions.load();
    await enterApp();
  } catch (error) {
    console.error(error);
    renderAuth('login', { error: 'Сервер недоступен. Запустите CRM и обновите страницу.' });
    showBoot(false);
  }
}

// ───────────────────────────── глобальные обработчики

window.addEventListener('hashchange', () => {
  if (!state.data) return;
  renderRoute();
});

window.addEventListener('crm:unauthorized', () => {
  state.data = null;
  toast('Сессия истекла — войдите снова', 'err');
  renderAuth('login');
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (state.data) openSearch();
  }
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-search]')) openSearch();
  if (event.target.closest('[data-quick-add]')) openQuickAdd();
  if (event.target.closest('[data-menu]')) openSidebar();
  if (event.target.closest('[data-more]')) openSidebar();
  if (event.target.closest('#scrim')) closeSidebar();
  if (event.target.closest('[data-logout]')) {
    api.post('/api/auth/logout', {}).finally(() => {
      state.data = null;
      renderAuth('login');
    });
  }
  if (event.target.closest('[data-nav]') && window.innerWidth <= 860) closeSidebar();
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 860) closeSidebar();
});

boot();
