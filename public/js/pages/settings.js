// Настройки: компания, услуги, интеграции, данные, безопасность

import { get, actions, state } from '../store.js';
import { esc, icon, fmtMoney, fmtDate, plural } from '../util.js';
import { pageHead, toast, confirmModal, formModal, copyText, openModal } from '../ui.js';

export const settingsPage = {
  title: () => 'Настройки',

  render() {
    const settings = get.settings();
    const company = settings.company || {};
    const services = settings.services || [];
    const sources = settings.sources || [];
    const endpoint = `${location.origin}/api/public/lead`;
    const token = settings.leadToken || '';
    const snippet = `await fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${token}'
  },
  body: JSON.stringify({
    name: 'Иван',
    phone: '+7 900 000-00-00',
    email: 'mail@example.ru',
    subject: 'Заявка с сайта',
    message: 'Комментарий клиента',
    source: 'Сайт'
  })
})`;

    return `
      ${pageHead({ title: 'Настройки', subtitle: 'Компания, услуги, документы, интеграции и данные' })}
      ${get.storage().mode === 'ephemeral' ? `<div class="banner warn">
        ${icon('alert')}
        <div><b>Демо-режим Vercel.</b> Постоянное хранилище не подключено — данные могут сброситься после перезапуска. Подключите Vercel KV (Upstash Redis) в настройках проекта.</div>
      </div>` : ''}

      <div class="grid two">
        <section class="card">
          <div class="card-head"><div class="card-title">Компания</div><span class="badge gold">бренд</span></div>
          <div class="form-grid">
            <div class="field span-2"><label>Название</label><input class="input" data-company="name" value="${esc(company.name || '')}" /></div>
            <div class="field"><label>Телефон</label><input class="input" data-company="phone" value="${esc(company.phone || '')}" /></div>
            <div class="field"><label>Email</label><input class="input" data-company="email" value="${esc(company.email || '')}" /></div>
            <div class="field"><label>Сайт</label><input class="input" data-company="site" value="${esc(company.site || '')}" /></div>
            <div class="field"><label>Часы работы</label><input class="input" data-company="hours" value="${esc(company.hours || '')}" /></div>
            <div class="field span-2"><label>География</label><input class="input" data-company="address" value="${esc(company.address || '')}" /></div>

            <div class="field span-2" style="margin-top:10px"><label>Юридическое лицо / ИП</label><input class="input" data-company="legal" placeholder="ИП Пленкин Р. Р." value="${esc(company.legal || '')}" /></div>
            <div class="field"><label>ИНН</label><input class="input" data-company="inn" value="${esc(company.inn || '')}" /></div>
            <div class="field"><label>КПП</label><input class="input" data-company="kpp" value="${esc(company.kpp || '')}" /></div>
            <div class="field"><label>ОГРН / ОГРНИП</label><input class="input" data-company="ogrn" value="${esc(company.ogrn || '')}" /></div>
            <div class="field"><label>Юридический адрес</label><input class="input" data-company="legalAddress" value="${esc(company.legalAddress || '')}" /></div>
            <div class="field span-2"><label>Банк</label><input class="input" data-company="bankName" value="${esc(company.bankName || '')}" /></div>
            <div class="field"><label>БИК</label><input class="input" data-company="bik" value="${esc(company.bik || '')}" /></div>
            <div class="field"><label>Расчётный счёт</label><input class="input" data-company="account" value="${esc(company.account || '')}" /></div>
            <div class="field"><label>Корр. счёт</label><input class="input" data-company="corrAccount" value="${esc(company.corrAccount || '')}" /></div>
            <div class="field"><label>Подписант</label><input class="input" data-company="director" value="${esc(company.director || '')}" /></div>
            <div class="field"><label>Должность подписанта</label><input class="input" data-company="directorPosition" value="${esc(company.directorPosition || '')}" /></div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:14px">
            <button class="btn primary" data-act="save-company">Сохранить</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">Профиль</div></div>
          <div class="field"><label>Ваше имя</label><input class="input" data-profile="name" value="${esc(get.profile().name || '')}" /></div>
          <div class="stat-line mt"><span class="label">Версия</span><span class="value">2.1.0</span></div>
          <div class="stat-line"><span class="label">Заказов в базе</span><span class="value">${get.orders().length}</span></div>
          <div class="stat-line"><span class="label">Лидов в базе</span><span class="value">${get.leads().length}</span></div>
          <div class="stat-line"><span class="label">Клиентов</span><span class="value">${get.clients().length}</span></div>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
            <button class="btn" data-act="save-profile">Сохранить</button>
            <button class="btn danger" data-act="logout">${icon('logout')} Выйти</button>
          </div>
        </section>
      </div>

      <section class="card mt">
        <div class="card-head">
          <div><div class="card-title">Документы и гарантии</div><div class="card-sub">Подставляются в КП, смету, счёт, акт и гарантийный талон</div></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Срок действия КП, дней</label><input class="input" type="number" data-doc="offerDays" value="${Number(settings.documents?.offerDays) || 14}" /></div>
          <div class="field"><label>Гарантия на материал, мес.</label><input class="input" type="number" data-doc="warrantyMaterialMonths" value="${Number(settings.documents?.warrantyMaterialMonths) || 180}" /></div>
          <div class="field"><label>Гарантия на монтаж, мес.</label><input class="input" type="number" data-doc="warrantyInstallMonths" value="${Number(settings.documents?.warrantyInstallMonths) || 24}" /></div>
          <div class="field span-2"><label>Условия оплаты</label><textarea class="textarea" rows="2" data-doc="paymentTerms">${esc(settings.documents?.paymentTerms || '')}</textarea></div>
          <div class="field span-2"><label>Примечание в смете / КП</label><textarea class="textarea" rows="2" data-doc="validityNote">${esc(settings.documents?.validityNote || '')}</textarea></div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px">
          <button class="btn primary" data-act="save-documents">Сохранить</button>
        </div>
      </section>

      <section class="card mt">
        <div class="card-head">
          <div><div class="card-title">Услуги и цены</div><div class="card-sub">Используются в лидах, заказах и калькуляторе оценки</div></div>
          <button class="btn sm" data-act="add-service">${icon('plus')} Услуга</button>
        </div>
        <div class="table-wrap">
          <div style="display:grid;grid-template-columns:1.6fr 0.8fr 0.6fr 0.5fr 32px;gap:8px;align-items:center;min-width:560px">
            <span class="dim" style="font-size:11px;letter-spacing:.06em">НАЗВАНИЕ</span>
            <span class="dim" style="font-size:11px;letter-spacing:.06em">ЦЕНА, ₽</span>
            <span class="dim" style="font-size:11px;letter-spacing:.06em">ЕД.</span>
            <span class="dim" style="font-size:11px;letter-spacing:.06em">ВКЛ.</span>
            <span></span>
            ${services.map((service) => `
              <div data-svc-row="${service.id}" style="display:contents">
                <input class="input" data-svc="name" value="${esc(service.name)}" />
                <input class="input" type="number" data-svc="price" value="${service.price || 0}" />
                <input class="input" data-svc="unit" value="${esc(service.unit || 'м²')}" />
                <label class="check" style="justify-content:center"><input type="checkbox" data-svc="active" ${service.active !== false ? 'checked' : ''} /></label>
                <button class="btn ghost icon sm" data-act="remove-service" data-id="${service.id}" aria-label="Удалить">${icon('trash')}</button>
              </div>`).join('')}
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px">
          <button class="btn primary" data-act="save-services">Сохранить услуги</button>
        </div>
      </section>

      <div class="grid two mt">
        <section class="card">
          <div class="card-head"><div class="card-title">Источники лидов</div></div>
          <div class="pill-row">
            ${sources.map((source) => `<span class="chip">${esc(source)}<button data-act="rm-source" data-source="${esc(source)}" aria-label="Удалить">${icon('x')}</button></span>`).join('')}
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <input class="input" id="newSource" placeholder="Новый источник" />
            <button class="btn" data-act="add-source">Добавить</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">Категории расходов</div></div>
          <div class="pill-row">
            ${(settings.expenseCategories || []).map((category) => `<span class="chip">${esc(category)}<button data-act="rm-category" data-category="${esc(category)}" aria-label="Удалить">${icon('x')}</button></span>`).join('')}
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <input class="input" id="newCategory" placeholder="Новая категория" />
            <button class="btn" data-act="add-category">Добавить</button>
          </div>
        </section>
      </div>

      <section class="card mt">
        <div class="card-head">
          <div><div class="card-title">Приём заявок с сайта</div><div class="card-sub">Заявки с plenkinaokna.ru попадают в CRM автоматически</div></div>
          <button class="btn sm" data-act="rotate">${icon('refresh')} Обновить ключ</button>
        </div>
        <div class="field">
          <label>Адрес приёма заявок</label>
          <div style="display:flex;gap:8px">
            <input class="input mono" readonly value="${esc(endpoint)}" />
            <button class="btn" data-act="copy-endpoint">${icon('copy')}</button>
          </div>
        </div>
        <div class="field" style="margin-top:12px">
          <label>Ключ интеграции (X-API-Key)</label>
          <div style="display:flex;gap:8px">
            <input class="input mono" readonly value="${esc(token)}" />
            <button class="btn" data-act="copy-token">${icon('copy')}</button>
          </div>
        </div>
        <details style="margin-top:12px">
          <summary style="cursor:pointer;font-size:13px;color:var(--muted)">Пример запроса для сайта</summary>
          <pre style="margin-top:10px;background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto;font-size:11.5px;line-height:1.55">${esc(snippet)}</pre>
        </details>
        <div class="banner" style="margin:14px 0 0;border-color:var(--line)">
          ${icon('alert')}
          <div>Ключ действует только внутри вашей сети. Для приёма заявок из интернета разместите CRM на сервере с HTTPS.</div>
        </div>
      </section>

      <div class="grid two mt">
        <section class="card">
          <div class="card-head"><div class="card-title">Импорт старых заявок</div></div>
          <p class="dim" style="font-size:12.5px;line-height:1.5;margin-bottom:12px">Если на сайте уже накопились заявки в leads.json — заберите их одним нажатием.</p>
          <div class="field"><label>Адрес сайта</label><input class="input" id="importUrl" placeholder="https://plenkinaokna.ru" value="${esc(settings.siteImport?.url || '')}" /></div>
          <div class="field" style="margin-top:10px"><label>Токен LEADS_API_TOKEN</label><input class="input" id="importToken" value="${esc(settings.siteImport?.token || '')}" /></div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn" data-act="save-import">Сохранить</button>
            <button class="btn primary" data-act="import">${icon('download')} Импортировать</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">Данные и бэкапы</div></div>
          <div style="display:grid;gap:8px">
            <a class="btn" href="/api/backup" download>${icon('download')} Скачать бэкап (JSON)</a>
            <div style="display:flex;gap:8px">
              <button class="btn" data-act="csv-orders">${icon('file')} Заказы CSV</button>
              <button class="btn" data-act="csv-payments">${icon('file')} Оплаты CSV</button>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn" data-act="csv-clients">${icon('file')} Клиенты CSV</button>
              <button class="btn" data-act="csv-leads">${icon('file')} Лиды CSV</button>
            </div>
          </div>
          <div class="dim" style="font-size:11.5px;margin-top:12px;line-height:1.5">Копия базы создаётся автоматически раз в день (30 последних) в папке data/backups.</div>
          ${settings.demo ? `<div class="banner" style="margin-top:14px">${icon('sparkles')}<div>Загружены демо-данные.</div><div class="spacer"></div><button class="btn sm" data-act="clear-demo">Очистить</button></div>` : ''}
        </section>
      </div>

      <section class="card mt">
        <div class="card-head"><div class="card-title">Безопасность</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-act="password">${icon('settings')} Сменить пароль</button>
          <button class="btn" data-act="logout">${icon('logout')} Выйти из аккаунта</button>
        </div>
        <p class="dim" style="font-size:12px;margin-top:10px;line-height:1.5">Пароль хранится в виде scrypt-хеша. Сессии подписаны и живут 30 дней.</p>
      </section>
    `;
  },

  mount(root) {
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      const action = button?.dataset.act;
      if (!action) return;

      if (action === 'save-company') {
        const company = {};
        root.querySelectorAll('[data-company]').forEach((input) => { company[input.dataset.company] = input.value; });
        await actions.saveSettings({ company });
        toast('Данные компании сохранены', 'ok');
      }

      if (action === 'save-documents') {
        const documents = {};
        root.querySelectorAll('[data-doc]').forEach((input) => {
          documents[input.dataset.doc] = input.type === 'number' ? Number(input.value) || 0 : input.value;
        });
        await actions.saveSettings({ documents });
        toast('Параметры документов сохранены', 'ok');
      }

      if (action === 'save-profile') {
        const input = root.querySelector('[data-profile="name"]');
        await actions.saveSettings({ profile: { name: input.value } });
        toast('Имя сохранено', 'ok');
      }

      if (action === 'add-service') {
        const services = collectServices(root);
        services.push({ id: `sv_${Date.now()}`, name: 'Новая услуга', price: 650, unit: 'м²', active: true });
        await actions.saveSettings({ services });
        rerender();
      }

      if (action === 'remove-service') {
        const id = button.dataset.id;
        const services = collectServices(root).filter((service) => service.id !== id);
        await actions.saveSettings({ services });
        toast('Услуга удалена', 'ok');
        rerender();
      }

      if (action === 'save-services') {
        await actions.saveSettings({ services: collectServices(root) });
        toast('Услуги сохранены', 'ok');
        rerender();
      }

      if (action === 'add-source') {
        const value = root.querySelector('#newSource')?.value.trim();
        if (!value) return;
        await actions.saveSettings({ sources: [...new Set([...get.settings().sources, value])] });
        toast('Источник добавлен', 'ok');
        rerender();
      }

      if (action === 'rm-source') {
        const source = button.dataset.source;
        await actions.saveSettings({ sources: get.settings().sources.filter((s) => s !== source) });
        rerender();
      }

      if (action === 'add-category') {
        const value = root.querySelector('#newCategory')?.value.trim();
        if (!value) return;
        await actions.saveSettings({ expenseCategories: [...new Set([...get.settings().expenseCategories, value])] });
        toast('Категория добавлена', 'ok');
        rerender();
      }

      if (action === 'rm-category') {
        const category = button.dataset.category;
        await actions.saveSettings({ expenseCategories: get.settings().expenseCategories.filter((c) => c !== category) });
        rerender();
      }

      if (action === 'save-import') {
        await actions.saveSettings({
          siteImport: {
            url: root.querySelector('#importUrl').value.trim(),
            token: root.querySelector('#importToken').value.trim(),
          },
        });
        toast('Настройки импорта сохранены', 'ok');
      }

      if (action === 'import') {
        await actions.saveSettings({
          siteImport: {
            url: root.querySelector('#importUrl').value.trim(),
            token: root.querySelector('#importToken').value.trim(),
          },
        });
        try {
          const result = await actions.importSite();
          toast(`Импортировано заявок: ${result.added ?? 0}`, 'ok');
          rerender();
        } catch (error) {
          toast(error.message, 'err');
        }
      }

      if (action === 'copy-endpoint') copyText(`${location.origin}/api/public/lead`, 'Адрес скопирован');
      if (action === 'copy-token') copyText(get.settings().leadToken || '', 'Ключ скопирован');

      if (action === 'rotate') {
        const ok = await confirmModal({
          title: 'Обновить ключ интеграции?',
          text: 'Старый ключ перестанет работать — обновите его на сайте.',
          confirmLabel: 'Обновить',
          danger: true,
        });
        if (ok) {
          await actions.rotateToken();
          toast('Ключ обновлён', 'ok');
          rerender();
        }
      }

      if (action === 'password') {
        const result = await formModal({
          title: 'Смена пароля',
          fields: [
            { name: 'current', label: 'Текущий пароль', type: 'password', required: true, span: 2 },
            { name: 'password', label: 'Новый пароль', type: 'password', required: true, span: 2, hint: 'Минимум 6 символов' },
          ],
          submitLabel: 'Сменить пароль',
          onSubmit: async (payload) => {
            const response = await fetch('/api/auth/password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Не удалось сменить пароль');
          },
        });
        if (result) toast('Пароль изменён', 'ok');
      }

      if (action === 'logout') {
        await fetch('/api/auth/logout', { method: 'POST' });
        location.reload();
      }

      if (action === 'clear-demo') {
        const ok = await confirmModal({
          title: 'Удалить демо-данные?',
          text: 'Лиды, заказы, оплаты и расходы будут удалены. Настройки останутся.',
          confirmLabel: 'Удалить',
          danger: true,
        });
        if (ok) {
          await actions.clearDemo();
          toast('Демо-данные удалены', 'ok');
          rerender();
        }
      }

      const csv = { 'csv-orders': 'orders', 'csv-payments': 'payments', 'csv-clients': 'clients', 'csv-leads': 'leads' }[action];
      if (csv) window.open(`/api/export/${csv}`, '_blank');
    });

    root.querySelector('#newSource')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); root.querySelector('[data-act="add-source"]').click(); }
    });
    root.querySelector('#newCategory')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); root.querySelector('[data-act="add-category"]').click(); }
    });
  },
};

function collectServices(root) {
  return [...root.querySelectorAll('[data-svc-row]')].map((row) => ({
    id: row.dataset.svcRow,
    name: row.querySelector('[data-svc="name"]').value.trim(),
    price: Number(row.querySelector('[data-svc="price"]').value) || 0,
    unit: row.querySelector('[data-svc="unit"]').value.trim() || 'м²',
    active: row.querySelector('[data-svc="active"]').checked,
  })).filter((service) => service.name);
}

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
