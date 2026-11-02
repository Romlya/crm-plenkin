// Шаблоны документов: КП, смета, счёт, акт, гарантийный талон

import { esc, fmtMoney, moneyFmt, moneyFmt2, moneyInWords, fmtDate, plural } from './util.js';

export const DOC_TYPES = {
  kp: { title: 'Коммерческое предложение', short: 'КП', prefix: 'КП', icon: 'file' },
  smeta: { title: 'Смета', short: 'Смета', prefix: 'СМ', icon: 'expenses' },
  invoice: { title: 'Счёт на оплату', short: 'Счёт', prefix: 'СЧ', icon: 'payments' },
  act: { title: 'Акт выполненных работ', short: 'Акт', prefix: 'АКТ', icon: 'check' },
  warranty: { title: 'Гарантийный талон', short: 'Гарантия', prefix: 'ГТ', icon: 'target' },
};

const todayStr = () => new Date().toLocaleDateString('ru-RU');
const money = (value) => `${moneyFmt2.format(Number(value) || 0)} ₽`;
const dateStr = (value) => (value ? fmtDate(value) : '—');

function docNumber(order, prefix) {
  return `${prefix}-${String(order.number || '').replace(/^ПЛ-/, '')}`;
}

function orderItems(order) {
  if (order.items && order.items.length) {
    return order.items.map((item) => ({
      name: item.name,
      qty: Number(item.qty) || 0,
      unit: item.unit || 'м²',
      price: Number(item.price) || 0,
      cost: Number(item.cost) || 0,
      total: (Number(item.qty) || 0) * (Number(item.price) || 0),
    }));
  }
  const qty = Number(order.area) || 1;
  return [{
    name: order.title,
    qty,
    unit: order.area ? 'м²' : 'усл.',
    price: qty ? Math.round((Number(order.amount) || 0) / qty) : Number(order.amount) || 0,
    cost: 0,
    total: Number(order.amount) || 0,
  }];
}

function totals(order) {
  const items = orderItems(order);
  const sum = items.reduce((acc, item) => acc + item.total, 0);
  const discount = Number(order.discount) || 0;
  const amount = Number(order.amount) || Math.max(0, sum - discount);
  return { items, sum, discount, amount };
}

function companyTitle(company) {
  return company?.legal || company?.name || 'ПЛЕНКИН';
}

function requisitesRows(company) {
  const rows = [];
  if (company?.inn) rows.push(['ИНН', company.inn]);
  if (company?.kpp) rows.push(['КПП', company.kpp]);
  if (company?.ogrn) rows.push(['ОГРН / ОГРНИП', company.ogrn]);
  if (company?.legalAddress) rows.push(['Юр. адрес', company.legalAddress]);
  if (company?.bankName) rows.push(['Банк', company.bankName]);
  if (company?.bik) rows.push(['БИК', company.bik]);
  if (company?.account) rows.push(['Р/с', company.account]);
  if (company?.corrAccount) rows.push(['К/с', company.corrAccount]);
  return rows;
}

function header(company, { title, number, date = todayStr(), city = 'Москва' }) {
  const reqs = requisitesRows(company);
  return `
    <header class="doc-head">
      <div class="doc-brand">
        <div class="doc-brand-name">ПЛЕНКИН</div>
        <div class="doc-brand-tag">АРХИТЕКТУРНЫЕ ПЛЁНКИ</div>
      </div>
      <div class="doc-req">
        <div class="doc-req-company">${esc(companyTitle(company))}</div>
        ${reqs.slice(0, 4).map(([label, value]) => `<div>${esc(label)}: ${esc(value)}</div>`).join('')}
        <div>${esc(company?.phone || '')}${company?.email ? ` · ${esc(company.email)}` : ''}</div>
      </div>
    </header>
    <div class="doc-titlebar">
      <h1>${esc(title)}</h1>
      <div class="doc-meta">
        <div>№ ${esc(number)}</div>
        <div>${esc(city)} · ${esc(date)}</div>
      </div>
    </div>`;
}

function parties(company, client) {
  return `
    <section class="doc-parties">
      <div>
        <div class="doc-label">Исполнитель</div>
        <div class="doc-strong">${esc(companyTitle(company))}</div>
        ${company?.inn ? `<div class="doc-small">ИНН ${esc(company.inn)}</div>` : ''}
        <div class="doc-small">${esc(company?.phone || '')}</div>
      </div>
      <div>
        <div class="doc-label">Заказчик</div>
        <div class="doc-strong">${esc(client?.name || '—')}</div>
        ${client?.company && client.company !== client.name ? `<div class="doc-small">${esc(client.company)}</div>` : ''}
        <div class="doc-small">${esc(client?.phone || '')}${client?.address ? ` · ${esc(client.address)}` : ''}</div>
      </div>
    </section>`;
}

function table(items, { cost = false } = {}) {
  return `
    <table class="doc-table">
      <thead>
        <tr>
          <th style="width:34px">№</th>
          <th>Наименование</th>
          <th style="width:70px">Кол-во</th>
          <th style="width:48px">Ед.</th>
          <th style="width:92px">Цена</th>
          ${cost ? '<th style="width:92px">Себест.</th>' : ''}
          <th style="width:104px">Сумма</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => `
          <tr>
            <td class="doc-center">${index + 1}</td>
            <td>${esc(item.name)}</td>
            <td class="doc-center">${Number.isInteger(item.qty) ? moneyFmt.format(item.qty) : moneyFmt2.format(item.qty)}</td>
            <td class="doc-center">${esc(item.unit)}</td>
            <td class="doc-right">${money(item.price)}</td>
            ${cost ? `<td class="doc-right">${money(item.cost)}</td>` : ''}
            <td class="doc-right">${money(item.total)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function sumBlock(order, { paid = 0 } = {}) {
  const { sum, discount, amount } = totals(order);
  const rest = Math.max(0, amount - paid);
  return `
    <div class="doc-sums">
      <div class="doc-sum-row"><span>Итого:</span><span>${money(sum)}</span></div>
      ${discount ? `<div class="doc-sum-row"><span>Скидка:</span><span>−${money(discount)}</span></div>` : ''}
      <div class="doc-sum-row doc-sum-total"><span>Всего к оплате:</span><span>${money(amount)}</span></div>
      ${paid ? `<div class="doc-sum-row"><span>Оплачено:</span><span>${money(paid)}</span></div>` : ''}
      ${paid && rest ? `<div class="doc-sum-row"><span>Остаток:</span><span>${money(rest)}</span></div>` : ''}
    </div>
    <div class="doc-words">Сумма прописью: ${esc(moneyInWords(amount))}</div>`;
}

function termsBlock(order, settings) {
  const terms = [
    order.terms ? String(order.terms).trim() : '',
  ].filter(Boolean);
  if (!terms.length) return '';
  return `
    <section class="doc-section">
      <div class="doc-label">Дополнительные условия</div>
      <div class="doc-terms">${esc(terms.join('\n')).replace(/\n/g, '<br>')}</div>
    </section>`;
}

function signatures(company, client, { leftLabel = 'Исполнитель', rightLabel = 'Заказчик' } = {}) {
  return `
    <section class="doc-sign">
      <div>
        <div class="doc-label">${esc(leftLabel)}</div>
        <div class="doc-sign-line"></div>
        <div class="doc-small">${esc(company?.director || '')}${company?.directorPosition ? ` · ${esc(company.directorPosition)}` : ''}</div>
      </div>
      <div>
        <div class="doc-label">${esc(rightLabel)}</div>
        <div class="doc-sign-line"></div>
        <div class="doc-small">${esc(client?.name || '')}</div>
      </div>
    </section>`;
}

function footer(company) {
  return `
    <footer class="doc-foot">
      <span>${esc(company?.name || 'ПЛЕНКИН')}</span>
      <span>${esc(company?.site || '')}${company?.phone ? ` · ${esc(company.phone)}` : ''}</span>
      <span>${esc(company?.email || '')}</span>
    </footer>`;
}

function warrantyYears(months) {
  const value = Number(months) || 0;
  if (!value) return '—';
  if (value % 12 === 0) return `${value / 12} лет`;
  return `${value} мес.`;
}

// ───────────────────────────── КП

function kpPages(order, client, company, settings) {
  const { amount } = totals(order);
  const docs = settings?.documents || {};
  const area = Number(order.area) || 0;
  const term = order.deadline && order.createdAt
    ? Math.max(1, Math.round((new Date(order.deadline) - new Date(order.createdAt)) / 86400000))
    : 14;
  const termLabel = `${term} ${plural(term, ['рабочий день', 'рабочих дня', 'рабочих дней'])}`;
  const number = docNumber(order, 'КП');

  const cover = `
    <section class="doc-page doc-dark">
      <div class="doc-cover">
        <div class="doc-brand-name">ПЛЕНКИН</div>
        <div class="doc-brand-tag">АРХИТЕКТУРНЫЕ ПЛЁНКИ</div>
        <h1 class="doc-cover-title">Коммерческое предложение</h1>
        <div class="doc-cover-sub">${esc(order.title)}</div>
        <div class="doc-cover-meta">
          <span>${area ? `${moneyFmt.format(area)} м²` : 'объект'}</span>
          <span>${termLabel}</span>
          <span>${money(amount)}</span>
        </div>
        <div class="doc-cover-object">${esc(client?.name || '')}${order.address ? ` · ${esc(order.address)}` : ''}</div>
        <div class="doc-cover-foot">
          <div>${esc(company?.phone || '')}</div>
          <div>${esc(company?.site || '')} · ${esc(company?.email || '')}</div>
        </div>
      </div>
    </section>`;

  const about = `
    <section class="doc-page">
      ${header(company, { title: 'Объект и задача', number, date: todayStr() })}
      <section class="doc-rows">
        <div class="doc-row"><span>Объект</span><b>${esc(order.address || '—')}</b></div>
        <div class="doc-row"><span>Заказчик</span><b>${esc(client?.name || '—')}</b></div>
        <div class="doc-row"><span>Остекление</span><b>${esc(order.title)}</b></div>
        <div class="doc-row"><span>Площадь</span><b>${area ? `${moneyFmt.format(area)} м²` : '—'}</b></div>
        <div class="doc-row"><span>Решение</span><b>${esc(settings?.services?.find((s) => s.id === order.serviceId)?.name || order.title)}</b></div>
        <div class="doc-row"><span>Документы</span><b>Сертификаты, акты, гарантийный талон</b></div>
        <div class="doc-row"><span>Срок</span><b>${termLabel}</b></div>
        <div class="doc-row"><span>Гарантия</span><b>на материал — ${warrantyYears(order.warrantyMonths || docs.warrantyMaterialMonths)}, на монтаж — ${warrantyYears(order.warrantyInstallMonths || docs.warrantyInstallMonths)}</b></div>
      </section>
      <section class="doc-section">
        <div class="doc-label">Что входит в стоимость</div>
        <ul class="doc-list">
          <li>материалы (плёнка) и монтаж;</li>
          <li>выезд бригады, доставка материала, вывоз отходов;</li>
          <li>сопроводительные документы и гарантийный талон.</li>
        </ul>
      </section>
      ${footer(company)}
    </section>`;

  const estimate = `
    <section class="doc-page">
      ${header(company, { title: 'Смета', number: docNumber(order, 'СМ'), date: todayStr() })}
      ${table(totals(order).items)}
      ${sumBlock(order)}
      <section class="doc-section">
        <div class="doc-label">Условия оплаты</div>
        <div class="doc-terms">${esc(docs.paymentTerms || '')}</div>
      </section>
      ${termsBlock(order, settings)}
      <div class="doc-note">${esc(docs.validityNote || '')}</div>
      ${signatures(company, client, { rightLabel: 'Согласовано' })}
      ${footer(company)}
    </section>`;

  return [cover, about, estimate];
}

// ───────────────────────────── Смета

function smetaPage(order, client, company, settings) {
  return `
    <section class="doc-page">
      ${header(company, { title: 'Смета', number: docNumber(order, 'СМ') })}
      ${parties(company, client)}
      <div class="doc-object">Объект: ${esc(order.address || '—')} · ${esc(order.title)}</div>
      ${table(totals(order).items)}
      ${sumBlock(order)}
      ${termsBlock(order, settings)}
      <div class="doc-note">${esc(settings?.documents?.validityNote || '')}</div>
      ${signatures(company, client)}
      ${footer(company)}
    </section>`;
}

// ───────────────────────────── Счёт

function invoicePage(order, client, company, settings) {
  const { amount } = totals(order);
  const reqs = requisitesRows(company);
  const due = settings?.documents?.offerDays ? `Оплатить до ${new Date(Date.now() + settings.documents.offerDays * 86400000).toLocaleDateString('ru-RU')}` : '';
  return `
    <section class="doc-page">
      ${header(company, { title: 'Счёт на оплату', number: docNumber(order, 'СЧ') })}
      <div class="doc-bank">
        <div class="doc-bank-title">Реквизиты для оплаты</div>
        ${reqs.length ? reqs.map(([label, value]) => `<div class="doc-bank-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('') : '<div class="doc-small">Заполните реквизиты в Настройках → Компания</div>'}
      </div>
      ${parties(company, client)}
      <div class="doc-object">Назначение: ${esc(order.title)}${order.address ? ` · ${esc(order.address)}` : ''}</div>
      ${table(totals(order).items)}
      ${sumBlock(order)}
      <div class="doc-words">НДС не облагается.</div>
      ${due ? `<div class="doc-note">${esc(due)}</div>` : ''}
      ${signatures(company, client, { leftLabel: 'Руководитель', rightLabel: 'Получатель' })}
      ${footer(company)}
    </section>`;
}

// ───────────────────────────── Акт

function actPage(order, client, company, settings) {
  const paid = Number(order.paid) || 0;
  return `
    <section class="doc-page">
      ${header(company, { title: 'Акт выполненных работ', number: docNumber(order, 'АКТ') })}
      ${parties(company, client)}
      <div class="doc-object">Объект: ${esc(order.address || '—')} · ${esc(order.title)}</div>
      <p class="doc-text">Мы, нижеподписавшиеся, составили настоящий акт о том, что работы по монтажу архитектурной плёнки выполнены в полном объёме, в срок и с надлежащим качеством. Заказчик претензий по объёму, качеству и срокам выполнения работ не имеет.</p>
      ${table(totals(order).items)}
      ${sumBlock(order, { paid })}
      ${termsBlock(order, settings)}
      <div class="doc-note">Гарантия: на материал — ${warrantyYears(order.warrantyMonths || settings?.documents?.warrantyMaterialMonths)}, на монтаж — ${warrantyYears(order.warrantyInstallMonths || settings?.documents?.warrantyInstallMonths)} с даты подписания акта.</div>
      ${signatures(company, client)}
      ${footer(company)}
    </section>`;
}

// ───────────────────────────── Гарантийный талон

function warrantyPage(order, client, company, settings) {
  const docs = settings?.documents || {};
  const material = warrantyYears(order.warrantyMonths || docs.warrantyMaterialMonths);
  const install = warrantyYears(order.warrantyInstallMonths || docs.warrantyInstallMonths);
  return `
    <section class="doc-page">
      ${header(company, { title: 'Гарантийный талон', number: docNumber(order, 'ГТ') })}
      ${parties(company, client)}
      <section class="doc-rows">
        <div class="doc-row"><span>Объект</span><b>${esc(order.address || '—')}</b></div>
        <div class="doc-row"><span>Работы</span><b>${esc(order.title)}</b></div>
        <div class="doc-row"><span>Площадь</span><b>${order.area ? `${moneyFmt.format(order.area)} м²` : '—'}</b></div>
        <div class="doc-row"><span>Дата выполнения</span><b>${dateStr(order.deadline || order.updatedAt)}</b></div>
        <div class="doc-row"><span>Гарантия на материал</span><b>${material}</b></div>
        <div class="doc-row"><span>Гарантия на монтаж</span><b>${install}</b></div>
      </section>
      <section class="doc-section">
        <div class="doc-label">Условия гарантии</div>
        <ul class="doc-list">
          <li>гарантия действует с даты подписания акта выполненных работ;</li>
          <li>гарантия распространяется на дефекты, возникшие по вине исполнителя;</li>
          <li>гарантия не покрывает механические повреждения после приёмки, воздействие агрессивных сред, абразивную мойку, самостоятельный демонтаж;</li>
          <li>претензии принимаются по телефону ${esc(company?.phone || '')} или на ${esc(company?.email || '')}.</li>
        </ul>
      </section>
      ${termsBlock(order, settings)}
      ${signatures(company, client, { leftLabel: 'Исполнитель', rightLabel: 'Заказчик' })}
      <div class="doc-note">Талон действителен при предъявлении. Сохраняйте документ.</div>
      ${footer(company)}
    </section>`;
}

export function renderDocument(type, order, client, company, settings) {
  switch (type) {
    case 'kp': return kpPages(order, client, company, settings);
    case 'smeta': return [smetaPage(order, client, company, settings)];
    case 'invoice': return [invoicePage(order, client, company, settings)];
    case 'act': return [actPage(order, client, company, settings)];
    case 'warranty': return [warrantyPage(order, client, company, settings)];
    default: return [];
  }
}
