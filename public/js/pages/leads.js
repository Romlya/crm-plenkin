// Лиды — канбан и список

import { state, get, actions } from '../store.js';
import {
  esc, icon, fmtMoney, fmtArea, fmtDate, initials, telHref, waHref, LEAD_STATUS, daysBetween, plural,
} from '../util.js';
import { emptyState, pageHead, openModal, toast, confirmModal } from '../ui.js';
import { openLeadForm } from '../forms.js';

const STAGES = ['new', 'contacted', 'measure', 'estimate', 'contract', 'won', 'lost'];

export const leadsPage = {
  title: () => 'Лиды',

  render() {
    const all = get.leads();
    const query = state.ui.leadQuery.trim().toLowerCase();
    const source = state.ui.leadSource;
    const sources = [...new Set(all.map((l) => l.source).filter(Boolean))];
    const filtered = all.filter((lead) => {
      if (source && lead.source !== source) return false;
      if (!query) return true;
      return `${lead.name} ${lead.phone} ${lead.email} ${lead.comment} ${lead.address}`.toLowerCase().includes(query);
    }).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    const totalEstimate = filtered
      .filter((lead) => !['won', 'lost'].includes(lead.status))
      .reduce((acc, lead) => acc + (lead.estimate || 0), 0);
    const view = state.ui.leadView;

    return `
      ${pageHead({
        title: 'Лиды',
        subtitle: `${filtered.length} ${plural(filtered.length, ['лид', 'лида', 'лидов'])} · в работе на ${fmtMoney(totalEstimate, true)}`,
        actions: `<button class="btn" data-act="export">${icon('download')} <span class="desktop-only">Экспорт</span></button>
          <button class="btn primary" data-act="new">${icon('plus')} Новый лид</button>`,
      })}
      <div class="toolbar">
        <div class="search-box">
          ${icon('search')}
          <input class="input" id="leadSearch" placeholder="Имя, телефон, комментарий" value="${esc(state.ui.leadQuery)}" />
        </div>
        <select class="select mini" id="sourceFilter" style="max-width:180px">
          <option value="">Все источники</option>
          ${sources.map((s) => `<option value="${esc(s)}" ${s === source ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <div class="segmented" data-view>
          <button data-view-btn="kanban" class="${view === 'kanban' ? 'active' : ''}">Канбан</button>
          <button data-view-btn="list" class="${view === 'list' ? 'active' : ''}">Список</button>
        </div>
      </div>
      ${!all.length ? emptyState({
        icon: 'leads',
        title: 'Лидов пока нет',
        text: 'Добавьте заявку с сайта, звонок или сообщение — и ведите её до заказа.',
        action: `<button class="btn primary mt" data-act="new">${icon('plus')} Добавить лид</button>`,
      }) : view === 'kanban' ? renderKanban(filtered) : renderList(filtered)}
    `;
  },

  mount(root) {
    const search = root.querySelector('#leadSearch');
    if (search) {
      let timer;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.ui.leadQuery = search.value;
          const position = search.selectionStart;
          rerender();
          const next = document.querySelector('#leadSearch');
          if (next) {
            next.focus();
            next.setSelectionRange(position, position);
          }
        }, 220);
      });
    }
    root.querySelector('#sourceFilter')?.addEventListener('change', (event) => {
      state.ui.leadSource = event.target.value;
      rerender();
    });

    root.querySelectorAll('[data-view-btn]').forEach((button) => {
      button.addEventListener('click', () => {
        state.ui.leadView = button.dataset.viewBtn;
        rerender();
      });
    });

    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'new') {
        await openLeadForm();
        rerender();
      }
      if (action === 'export') {
        window.open('/api/export/leads', '_blank');
      }
      const card = event.target.closest('.kcard');
      const row = event.target.closest('[data-lead]');
      if (event.target.closest('[data-menu-lead]')) {
        event.stopPropagation();
        const lead = get.leads().find((l) => l.id === event.target.closest('[data-menu-lead]').dataset.menuLead);
        if (lead) openLeadMenu(lead);
        return;
      }
      if (card) {
        if (event.target.closest('a, button, select')) return;
        const lead = get.leads().find((l) => l.id === card.dataset.leadId);
        if (lead) {
          await openLeadForm(lead);
          rerender();
        }
      } else if (row && !event.target.closest('a')) {
        const lead = get.leads().find((l) => l.id === row.dataset.lead);
        if (lead) {
          await openLeadForm(lead);
          rerender();
        }
      }
    });

    // drag & drop (desktop)
    let draggedId = null;
    root.querySelectorAll('.kcard').forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        draggedId = card.dataset.leadId;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', draggedId); } catch { /* noop */ }
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        draggedId = null;
        root.querySelectorAll('.kanban-col').forEach((col) => col.classList.remove('over'));
      });
    });
    root.querySelectorAll('[data-stage]').forEach((column) => {
      column.addEventListener('dragover', (event) => {
        event.preventDefault();
        column.classList.add('over');
      });
      column.addEventListener('dragleave', (event) => {
        if (!column.contains(event.relatedTarget)) column.classList.remove('over');
      });
      column.addEventListener('drop', async (event) => {
        event.preventDefault();
        column.classList.remove('over');
        const id = draggedId || event.dataTransfer.getData('text/plain');
        if (!id) return;
        const lead = get.leads().find((l) => l.id === id);
        if (!lead || lead.status === column.dataset.stage) return;
        await actions.updateLead(id, { status: column.dataset.stage });
        toast(`«${lead.name}» → ${LEAD_STATUS[column.dataset.stage].label}`, 'ok');
        rerender();
      });
    });
  },
};

function renderKanban(leads) {
  return `<div class="kanban">
    ${STAGES.map((stage) => {
      const items = leads.filter((l) => l.status === stage);
      const sum = items.reduce((acc, l) => acc + (l.estimate || 0), 0);
      return `<section class="kanban-col" data-stage="${stage}">
        <header class="kanban-head">
          <span class="badge ${LEAD_STATUS[stage].color} dot">${LEAD_STATUS[stage].label}</span>
          <span class="kanban-count">${items.length}</span>
        </header>
        <div class="kanban-body">
          ${items.map((lead) => leadCard(lead)).join('')}
          ${!items.length ? '<div class="kanban-empty">Перетащите лид сюда</div>' : ''}
        </div>
        ${sum ? `<div style="padding:8px 12px;border-top:1px solid var(--line);font-size:11.5px;color:var(--dim)">${fmtMoney(sum, true)}</div>` : ''}
      </section>`;
    }).join('')}
  </div>`;
}

function leadCard(lead) {
  const service = get.service(lead.serviceId);
  const age = Math.max(0, daysBetween(lead.updatedAt || lead.createdAt));
  const stale = age >= 3 && !['won', 'lost'].includes(lead.status);
  return `<article class="kcard" draggable="true" data-lead-id="${lead.id}">
    <div class="kcard-top">
      <div class="kcard-name">${esc(lead.name)}</div>
      ${lead.estimate ? `<div class="kcard-sum">${fmtMoney(lead.estimate, true)}</div>` : ''}
    </div>
    <div class="kcard-meta">
      <span class="badge gray">${esc(lead.source || 'Другое')}</span>
      ${service || lead.area ? `<span class="kcard-service">${esc(service?.name || 'Услуга')}${lead.area ? ` · ${fmtArea(lead.area)}` : ''}</span>` : ''}
    </div>
    ${lead.comment ? `<div class="kcard-note">${esc(lead.comment)}</div>` : ''}
    <div class="kcard-foot">
      <a class="btn ghost icon sm" href="${telHref(lead.phone)}" title="Позвонить" aria-label="Позвонить">${icon('phone')}</a>
      <a class="btn ghost icon sm" href="${waHref(lead.phone)}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">${icon('message')}</a>
      <span class="kcard-age ${stale ? 'warn' : ''}">${age === 0 ? 'сегодня' : `${age} дн`}</span>
      <button class="btn ghost icon sm" data-menu-lead="${lead.id}" aria-label="Действия">${icon('more')}</button>
    </div>
  </article>`;
}

function renderList(leads) {
  return `<div class="card flush">
    <div class="list" style="--cols: 1.6fr 1fr 1fr 0.9fr 0.8fr">
      ${leads.map((lead) => {
        const service = get.service(lead.serviceId);
        return `<div class="row" data-lead="${lead.id}" style="cursor:pointer">
          <div class="cell">
            <div class="row-title">
              <span class="avatar sm">${esc(initials(lead.name))}</span>
              <span class="truncate">${esc(lead.name)}</span>
            </div>
            <div class="row-sub">${esc(lead.phone || '—')} · ${esc(lead.source || 'Другое')}</div>
          </div>
          <div class="cell hide-sm">
            <span class="cell-label">Услуга</span>
            <span class="row-sub" style="color:var(--text)">${esc(service?.name || '—')}</span>
          </div>
          <div class="cell hide-sm">
            <span class="cell-label">Оценка</span>
            <span class="row-value sm">${lead.estimate ? fmtMoney(lead.estimate) : '—'}</span>
          </div>
          <div class="cell"><span class="badge ${LEAD_STATUS[lead.status].color} dot">${LEAD_STATUS[lead.status].label}</span></div>
          <div class="cell right">
            <span class="row-sub">${fmtDate(lead.createdAt)}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

async function openLeadMenu(lead) {
  const handle = openModal({
    title: lead.name,
    subtitle: [lead.phone, lead.source].filter(Boolean).join(' · '),
    body: `<div style="display:grid;gap:8px">
      ${lead.convertedOrderId ? `<a class="btn" href="#/orders/${lead.convertedOrderId}" data-go>${icon('orders')} Открыть заказ</a>` : `<button class="btn primary" data-move="convert">${icon('orders')} Конвертировать в заказ</button>`}
      <a class="btn" href="${telHref(lead.phone)}">${icon('phone')} Позвонить</a>
      <a class="btn" href="${waHref(lead.phone)}" target="_blank" rel="noopener">${icon('message')} Написать в WhatsApp</a>
      <div class="field" style="margin-top:6px">
        <label>Переместить на этап</label>
        <select class="select" id="moveStage">
          ${STAGES.map((stage) => `<option value="${stage}" ${stage === lead.status ? 'selected' : ''}>${LEAD_STATUS[stage].label}</option>`).join('')}
        </select>
      </div>
      <button class="btn danger" data-move="delete" style="margin-top:4px">${icon('trash')} Удалить лид</button>
    </div>`,
    onMount: (element, close) => {
      element.querySelector('[data-go]')?.addEventListener('click', () => close());
      element.querySelector('#moveStage')?.addEventListener('change', async (event) => {
        await actions.updateLead(lead.id, { status: event.target.value });
        close();
        toast('Этап обновлён', 'ok');
        rerender();
      });
      element.querySelector('[data-move="convert"]')?.addEventListener('click', async () => {
        close();
        const order = await convertLead(lead);
        if (order) {
          toast('Заказ создан', 'ok');
          location.hash = `#/orders/${order.id}`;
        }
      });
      element.querySelector('[data-move="delete"]')?.addEventListener('click', async () => {
        close();
        const ok = await confirmModal({ title: 'Удалить лид?', text: `«${lead.name}» будет удалён.`, confirmLabel: 'Удалить', danger: true });
        if (ok) {
          await actions.deleteLead(lead.id);
          toast('Лид удалён', 'ok');
          rerender();
        }
      });
    },
  });
  void handle;
}

async function convertLead(lead) {
  const service = get.service(lead.serviceId);
  const amount = lead.estimate || (service && lead.area ? service.price * lead.area : 0);
  const ok = await confirmModal({
    title: 'Создать заказ из лида?',
    text: `${lead.name} → заказ на ${fmtMoney(amount)}. Клиент и история сохранятся.`,
    confirmLabel: 'Создать заказ',
  });
  if (!ok) return null;
  const snapshot = await actions.convertLead(lead.id, { amount });
  return snapshot.order || null;
}

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
