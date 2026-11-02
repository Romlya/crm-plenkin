// Страница документа: КП, смета, счёт, акт, гарантийный талон

import { get } from '../store.js';
import { esc, icon } from '../util.js';
import { renderDocument, DOC_TYPES } from '../documents.js';
import { openEstimateForm } from '../forms.js';

export const documentPage = {
  title: (params) => DOC_TYPES[params.type]?.title || 'Документ',

  render(params) {
    const order = get.order(params.id);
    if (!order) {
      return `<div class="card"><div class="empty">
        <div class="empty-icon">${icon('alert')}</div>
        <div class="empty-title">Заказ не найден</div>
        <a class="btn mt" href="#/orders">К заказам</a>
      </div></div>`;
    }
    if (!DOC_TYPES[params.type]) {
      location.hash = `#/orders/${order.id}`;
      return '';
    }

    const client = get.client(order.clientId);
    const settings = get.settings();
    const orderWithPaid = { ...order, paid: get.paid(order.id) };
    const pages = renderDocument(params.type, orderWithPaid, client, settings.company, settings);

    return `
      <div class="doc-toolbar">
        <a class="btn" href="#/orders/${order.id}">${icon('chevron')} К заказу</a>
        <div class="segmented doc-types">
          ${Object.entries(DOC_TYPES).map(([key, type]) => `
            <a class="doc-type ${key === params.type ? 'active' : ''}" href="#/orders/${order.id}/doc/${key}">${esc(type.short)}</a>`).join('')}
        </div>
        <div class="spacer"></div>
        <button class="btn" data-act="terms">${icon('edit')} Условия</button>
        <button class="btn primary" data-act="print">${icon('file')} Печать / PDF</button>
      </div>
      <div class="doc-hint">В диалоге печати выберите «Сохранить как PDF» — получится готовый файл для отправки клиенту.</div>
      <div class="doc-wrap" id="docWrap">
        ${pages.join('')}
      </div>
      <div class="doc-toolbar doc-toolbar-bottom">
        <button class="btn" data-act="terms">${icon('edit')} Доп. условия</button>
        <button class="btn primary" data-act="print">${icon('file')} Печать / PDF</button>
      </div>`;
  },

  mount(root, params) {
    const order = get.order(params.id);
    if (!order) return;
    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'print') window.print();
      if (action === 'terms') {
        const saved = await openEstimateForm(order);
        if (saved) {
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      }
    });
  },
};
