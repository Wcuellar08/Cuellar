import { WAIST_TO_US_WOMEN } from './defaults.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const parseNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
export const money = (n) =>
  'Q' + (Number(n) || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pad = (n, w = 4) => String(n).padStart(w, '0');

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-GT', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';

/** Fecha local en formato YYYY-MM-DD */
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1, 2)}-${pad(x.getDate(), 2)}`;
};
export const startOfDay = (key) => new Date(key + 'T00:00:00');
export const endOfDay = (key) => new Date(key + 'T23:59:59.999');

export const normalize = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const catById = (settings, id) => settings.categories.find((c) => c.id === id);
export const catName = (settings, id) => catById(settings, id)?.name || '(sin categoría)';

export function itemTitle(item, settings) {
  if (item.description) return item.description;
  const parts = [item.subcategory || catName(settings, item.categoryId), item.brand, item.color].filter(Boolean);
  return parts.join(' · ');
}

/** Talla equivalente de EE. UU. para pantalones de dama en talla de cintura (28 → 6). */
export function usWomenSize(size) {
  const m = String(size ?? '').trim().match(/^(\d{2})$/);
  return m ? WAIST_TO_US_WOMEN[m[1]] || '' : '';
}

/** Talla para mostrar: "28 (6)" si es de dama y la talla es de cintura; si no, la talla tal cual. */
export function sizeText(item) {
  const size = String(item?.size ?? '').trim();
  const us = item?.gender === 'Dama' ? usWomenSize(size) : '';
  return us ? `${size} (${us})` : size;
}

export function itemMeta(item) {
  return [item.size && `Talla ${sizeText(item)}`, item.brand, item.color, item.condition, item.gender]
    .filter(Boolean)
    .join(' · ');
}

export function itemSearchText(item, settings) {
  return normalize(
    [item.code, item.description, item.brand, item.color, sizeText(item), item.subcategory, catName(settings, item.categoryId)].join(' ')
  );
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg, type = 'ok') {
  let el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

// ---------- Modal ----------
let modalCloseHandler = null;
export function openModal(html, { onClose, wide } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal ${wide ? 'wide' : ''}" role="dialog">${html}</div></div>`;
  root.classList.add('open');
  modalCloseHandler = onClose || null;
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal()));
  return root.querySelector('.modal');
}
export function closeModal() {
  const root = $('#modal-root');
  if (!root.classList.contains('open')) return;
  const h = modalCloseHandler;
  modalCloseHandler = null;
  root.classList.remove('open');
  root.innerHTML = '';
  if (h) h();
}

export function confirmDialog(message, { okText = 'Aceptar', cancelText = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal(
      `<div class="modal-body"><p class="confirm-msg">${message}</p></div>
       <div class="modal-actions">
         <button class="btn" data-ans="0">${esc(cancelText)}</button>
         <button class="btn ${danger ? 'danger' : 'primary'}" data-ans="1">${esc(okText)}</button>
       </div>`,
      { onClose: () => !answered && resolve(false) }
    );
    m.querySelectorAll('[data-ans]').forEach((b) =>
      b.addEventListener('click', () => {
        answered = true;
        closeModal();
        resolve(b.dataset.ans === '1');
      })
    );
  });
}
