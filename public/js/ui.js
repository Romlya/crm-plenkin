// UI-компоненты: тосты, модальные окна, формы, графики

import { esc, icon, fmtMoney, fmtNum, moneyFmt } from './util.js';

const overlay = () => document.getElementById('overlay');
let modalCounter = 0;
const modalStack = [];

export function toast(message, type = 'info', timeout = 3200) {
  const root = document.getElementById('toasts');
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<i></i><div>${esc(message)}</div>`;
  root.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 220);
  }, timeout);
}

function lockScroll(lock) {
  document.body.style.overflow = lock ? 'hidden' : '';
}

export function openModal({ title, subtitle = '', body, footer = '', size = '', onMount, dismissible = true, onClose }) {
  const id = `modal-${++modalCounter}`;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.dataset.modalId = id;
  backdrop.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="modal-head">
        <div>
          <h3 id="${id}-title">${esc(title)}</h3>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
        </div>
        <button class="modal-close" type="button" aria-label="Закрыть">${icon('x')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  overlay().appendChild(backdrop);
  lockScroll(true);
  modalStack.push(id);

  const close = () => {
    if (!backdrop.isConnected) return;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    const index = modalStack.indexOf(id);
    if (index >= 0) modalStack.splice(index, 1);
    if (!modalStack.length) lockScroll(false);
    onClose?.();
  };

  backdrop.addEventListener('mousedown', (event) => {
    if (dismissible && event.target === backdrop) close();
  });
  backdrop.querySelector('.modal-close')?.addEventListener('click', close);

  const onKey = (event) => {
    if (event.key === 'Escape' && modalStack[modalStack.length - 1] === id && dismissible) {
      event.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey);

  const element = backdrop.querySelector('.modal');
  onMount?.(element, close);

  return {
    element,
    close: () => {
      document.removeEventListener('keydown', onKey);
      close();
    },
  };
}

let confirmCounter = 0;

export function confirmModal({ title, text = '', confirmLabel = 'Подтвердить', cancelLabel = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    const id = `confirm-${++confirmCounter}`;
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      handle.close();
      resolve(value);
    };
    const handle = openModal({
      title,
      body: `<p class="muted" style="font-size:13.5px;line-height:1.55">${esc(text)}</p>`,
      footer: `<div class="spacer"></div>
        <button class="btn" data-act="cancel">${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(confirmLabel)}</button>`,
      onMount: (element) => {
        element.querySelector('[data-act="cancel"]').addEventListener('click', () => done(false));
        element.querySelector('[data-act="ok"]').addEventListener('click', () => done(true));
      },
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
    void id;
  });
}

function fieldControl(field, value) {
  const id = `fld_${field.name}`;
  const common = `id="${id}" name="${field.name}" ${field.required ? 'required' : ''} ${field.disabled ? 'disabled' : ''}`;
  const placeholder = field.placeholder ? `placeholder="${esc(field.placeholder)}"` : '';
  switch (field.type) {
    case 'select': {
      const options = (field.options || []).map((option) => {
        const opt = typeof option === 'string' ? { value: option, label: option } : option;
        const selected = String(opt.value) === String(value ?? '') ? ' selected' : '';
        return `<option value="${esc(opt.value)}"${selected}>${esc(opt.label)}</option>`;
      });
      const empty = field.emptyOption ? `<option value="">${esc(field.emptyOption)}</option>` : '';
      return `<select class="select" ${common}>${empty}${options.join('')}</select>`;
    }
    case 'textarea':
      return `<textarea class="textarea" ${common} ${placeholder} rows="${field.rows || 3}">${esc(value ?? '')}</textarea>`;
    case 'checkbox':
      return `<label class="check"><input type="checkbox" ${common} ${value ? 'checked' : ''} /> ${esc(field.checkLabel || '')}</label>`;
    case 'money':
    case 'number':
      return `<input class="input" type="number" step="${field.step || 'any'}" inputmode="decimal" ${common} ${placeholder} value="${esc(value ?? '')}" />`;
    case 'date':
      return `<input class="input" type="date" ${common} value="${esc(value ? String(value).slice(0, 10) : '')}" />`;
    case 'time':
      return `<input class="input" type="time" ${common} value="${esc(value ?? '')}" />`;
    case 'tel':
      return `<input class="input" type="tel" ${common} ${placeholder} value="${esc(value ?? '')}" />`;
    case 'email':
      return `<input class="input" type="email" ${common} ${placeholder} value="${esc(value ?? '')}" />`;
    case 'password':
      return `<input class="input" type="password" ${common} ${placeholder} value="${esc(value ?? '')}" autocomplete="new-password" />`;
    default:
      return `<input class="input" type="text" ${common} ${placeholder} value="${esc(value ?? '')}" />`;
  }
}

export function formModal({
  title,
  subtitle = '',
  fields = [],
  values = {},
  submitLabel = 'Сохранить',
  size = '',
  extra = '',
  note = '',
  onSubmit,
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      handle.close();
      resolve(value);
    };

    const body = `
      <form class="form-grid" novalidate>
        ${fields.map((field) => `
          <div class="field ${field.span === 2 ? 'span-2' : ''} ${field.type === 'checkbox' ? 'span-2' : ''}">
            ${field.type === 'checkbox' ? '' : `<label for="fld_${field.name}">${esc(field.label || field.name)}</label>`}
            ${fieldControl(field, values[field.name] ?? field.value ?? '')}
            ${field.hint ? `<span class="hint">${esc(field.hint)}</span>` : ''}
          </div>`).join('')}
        <div class="form-error hidden"></div>
      </form>
      ${extra}`;

    const handle = openModal({
      title,
      subtitle,
      body,
      size,
      footer: `<div class="spacer"></div>
        <button class="btn" data-act="cancel">Отмена</button>
        <button class="btn primary" data-act="submit">${esc(submitLabel)}</button>
        ${note ? `<span class="dim" style="font-size:11.5px;margin-left:8px">${esc(note)}</span>` : ''}`,
      onMount: (element) => {
        const form = element.querySelector('form');
        const errorBox = element.querySelector('.form-error');
        const submitButton = element.querySelector('[data-act="submit"]');
        element.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(null));

        const submit = async () => {
          const raw = Object.fromEntries(new FormData(form).entries());
          const payload = {};
          for (const field of fields) {
            let value = raw[field.name];
            if (field.type === 'checkbox') value = form.querySelector(`[name="${field.name}"]`).checked;
            if (field.type === 'number' || field.type === 'money') value = value === '' ? 0 : Number(value);
            payload[field.name] = value;
          }
          const missing = fields.filter((field) => field.required && !String(payload[field.name] ?? '').trim());
          if (missing.length) {
            errorBox.textContent = `Заполните: ${missing.map((f) => f.label || f.name).join(', ')}`;
            errorBox.classList.remove('hidden');
            return;
          }
          errorBox.classList.add('hidden');
          submitButton.disabled = true;
          submitButton.textContent = 'Сохранение…';
          try {
            if (onSubmit) {
              const result = await onSubmit(payload);
              if (result === false) {
                submitButton.disabled = false;
                submitButton.textContent = submitLabel;
                return;
              }
            }
            finish(payload);
          } catch (error) {
            errorBox.textContent = error.message || 'Не удалось сохранить';
            errorBox.classList.remove('hidden');
            submitButton.disabled = false;
            submitButton.textContent = submitLabel;
          }
        };

        form.addEventListener('submit', (event) => {
          event.preventDefault();
          submit();
        });
        element.querySelector('[data-act="submit"]').addEventListener('click', submit);
        setTimeout(() => form.querySelector('input, textarea, select')?.focus(), 60);
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

export function emptyState({ icon: iconName = 'sparkles', title, text = '', action = '', compact = false }) {
  return `<div class="empty" style="${compact ? 'padding:26px 16px' : ''}">
    <div class="empty-icon">${icon(iconName)}</div>
    <div class="empty-title">${esc(title)}</div>
    ${text ? `<div class="empty-text">${esc(text)}</div>` : ''}
    ${action}
  </div>`;
}

export function pageHead({ title, subtitle = '', actions = '' }) {
  return `<div class="page-head">
    <div>
      <h1 class="page-title">${esc(title)}</h1>
      ${subtitle ? `<p class="page-sub">${esc(subtitle)}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

export function kpiCard({ label, value, unit = '', icon: iconName, foot = '', delta = null, trend = null }) {
  return `<div class="kpi">
    <div class="kpi-top">${iconName ? `<span class="kpi-icon">${icon(iconName)}</span>` : ''}<span>${esc(label)}</span></div>
    <div class="kpi-value">${value}${unit ? `<span class="cur">${unit}</span>` : ''}</div>
    <div class="kpi-foot">${delta}${foot ? `<span>${foot}</span>` : ''}</div>
    ${trend || ''}
  </div>`;
}

export function deltaChip(current, previous) {
  if (!previous && !current) return '<span class="delta flat">—</span>';
  if (!previous) return '<span class="delta up">новое</span>';
  const diff = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (!Number.isFinite(diff) || diff === 0) return '<span class="delta flat">0%</span>';
  const up = diff > 0;
  return `<span class="delta ${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(diff)}%</span>`;
}

export function sparkline(values, color = '#e8b42a', height = 34) {
  if (!values.length) return '';
  const width = 140;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${height} ${points.join(' ')} ${width},${height}`;
  const gradientId = `sp${Math.random().toString(36).slice(2, 7)}`;
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#${gradientId})"/>
    <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function niceMax(value) {
  if (value <= 0) return 1000;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const base = value / pow;
  const mult = base <= 1 ? 1 : base <= 2 ? 2 : base <= 3 ? 3 : base <= 5 ? 5 : 10;
  return mult * pow;
}

export function barChart(rows, { height = 240, showProfit = true } = {}) {
  const width = 760;
  const padLeft = 54;
  const padBottom = 26;
  const padTop = 10;
  const innerW = width - padLeft - 8;
  const innerH = height - padBottom - padTop;
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => [r.revenue || 0, r.profit || 0])));
  const slot = innerW / Math.max(rows.length, 1);
  const barW = Math.min(26, slot * 0.32);
  const gap = showProfit ? 4 : 0;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const y = padTop + innerH - innerH * step;
    const label = fmtShort(max * step);
    return `<line class="grid-line" x1="${padLeft}" y1="${y}" x2="${width}" y2="${y}"/>
      <text x="${padLeft - 8}" y="${y + 3}" text-anchor="end">${label}</text>`;
  }).join('');

  const bars = rows.map((row, index) => {
    const cx = padLeft + slot * index + slot / 2;
    const hRev = Math.max(row.revenue > 0 ? 2 : 0, (row.revenue / max) * innerH);
    const hProfit = Math.max(row.profit > 0 ? 2 : 0, (row.profit / max) * innerH);
    const xRev = cx - (showProfit ? barW + gap / 2 : barW / 2);
    const xProfit = cx + gap / 2;
    return `<g class="bar">
      <title>${esc(row.label)}: выручка ${fmtMoney(row.revenue)}, прибыль ${fmtMoney(row.profit)}</title>
      <rect x="${xRev}" y="${padTop + innerH - hRev}" width="${barW}" height="${hRev}" rx="4" fill="url(#goldGrad)"/>
      ${showProfit ? `<rect x="${xProfit}" y="${padTop + innerH - hProfit}" width="${barW}" height="${hProfit}" rx="4" fill="#34d399" opacity="0.85"/>` : ''}
      <rect x="${padLeft + slot * index}" y="${padTop}" width="${slot}" height="${innerH}" fill="transparent"/>
    </g>`;
  }).join('');

  const labels = rows.map((row, index) => {
    const cx = padLeft + slot * index + slot / 2;
    return `<text x="${cx}" y="${height - 8}" text-anchor="middle">${esc(row.label)}</text>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="График выручки и прибыли">
    <defs><linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f5d76e"/><stop offset="100%" stop-color="#e8b42a"/>
    </linearGradient></defs>
    ${grid}${bars}${labels}
  </svg>`;
}

function fmtShort(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')}м`;
  if (value >= 1000) return `${Math.round(value / 1000)}к`;
  return moneyFmt.format(Math.round(value));
}

export function donutChart(items, { size = 132, thickness = 14 } = {}) {
  const total = items.reduce((acc, item) => acc + item.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = items.map((item) => {
    const fraction = total ? item.value / total : 0;
    const dash = fraction * circumference;
    const segment = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${item.color}" stroke-width="${thickness}"
      stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    offset += dash;
    return segment;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${thickness}"/>
    ${segments}
    <text x="50%" y="47%" text-anchor="middle" fill="#fafafa" font-size="20" font-weight="700">${fmtNum(total)}</text>
    <text x="50%" y="60%" text-anchor="middle" fill="#71717a" font-size="10">всего</text>
  </svg>`;
}

export function progressBar(paid, amount, { showLabel = false } = {}) {
  const percent = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0;
  const cls = percent >= 100 ? 'green' : percent === 0 ? 'red' : '';
  return `<div style="display:grid;gap:5px">
    ${showLabel ? `<div class="dim" style="font-size:11.5px">Оплачено ${percent}%</div>` : ''}
    <div class="progress ${cls}"><i style="width:${percent}%"></i></div>
  </div>`;
}

export async function copyText(text, message = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(text);
    toast(message, 'ok');
  } catch {
    toast('Не удалось скопировать', 'err');
  }
}
