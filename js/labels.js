// Impresión de etiquetas con código QR.
import { esc, money } from './util.js';

export const LABEL_FORMATS = {
  carta: {
    name: 'Hoja carta – 30 etiquetas (tipo Avery 5160, 2⅝" × 1")',
    short: 'Hoja carta',
    page: '@page { size: letter; margin: 0.5in 0.19in 0.5in 0.19in; }',
  },
  '50x30': { name: 'Impresora de etiquetas 50 × 30 mm', short: '50 × 30 mm', page: '@page { size: 50mm 30mm; margin: 0; }' },
  '40x30': { name: 'Impresora de etiquetas 40 × 30 mm', short: '40 × 30 mm', page: '@page { size: 40mm 30mm; margin: 0; }' },
  '58x40': { name: 'Impresora de etiquetas 58 × 40 mm', short: '58 × 40 mm', page: '@page { size: 58mm 40mm; margin: 0; }' },
};

export function qrSvg(text) {
  const q = window.qrcode(0, 'M');
  q.addData(String(text));
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

export function labelHtml(item, title, storeName) {
  return `<div class="label">
    <div class="label-qr">${qrSvg(item.code)}</div>
    <div class="label-info">
      <div class="label-store">${esc(storeName)}</div>
      <div class="label-code">${esc(item.code)}</div>
      <div class="label-desc">${esc(title)}</div>
      ${item.size ? `<div class="label-size">Talla ${esc(item.size)}</div>` : ''}
      <div class="label-price">${money(item.price)}</div>
    </div>
  </div>`;
}

/** Imprime ya. Debe llamarse directo desde el toque del botón (si no, el iPad lo bloquea). */
function doPrint() {
  try {
    window.print();
  } catch (e) {
    console.error(e);
  }
}

let onCloseHook = null;

/**
 * Muestra la vista de impresión (las etiquetas a tamaño real) con el botón Imprimir.
 * pause/resume: pausan la conexión con la base de datos mientras está abierta la vista,
 * porque el iPad tarda en abrir la ventana de imprimir si hay una conexión abierta.
 */
export function printLabels(entries, format, storeName, { pause, resume } = {}) {
  const area = document.getElementById('print-area');
  area.className = `fmt-${format}`;
  area.innerHTML = entries
    .map((e) => (e.blank ? '<div class="label blank"></div>' : labelHtml(e.item, e.title, storeName)))
    .join('');
  let st = document.getElementById('print-page-style');
  if (!st) {
    st = document.createElement('style');
    st.id = 'print-page-style';
    document.head.appendChild(st);
  }
  st.textContent = `@media print { ${LABEL_FORMATS[format].page} }`;

  let bar = document.getElementById('print-toolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'print-toolbar';
    document.body.appendChild(bar);
  }
  const count = entries.filter((e) => !e.blank).length;
  bar.innerHTML = `
    <div class="ptb-row">
      <div class="ptb-title"><b>Vista de impresión</b><span>${count} etiqueta${count === 1 ? '' : 's'} · ${esc(LABEL_FORMATS[format].short)}</span></div>
      <button class="btn" id="ptb-close">Cerrar</button>
      <button class="btn primary lg" id="ptb-print" disabled>Preparando…</button>
    </div>
    <p class="ptb-help">¿No se abrió la ventana de imprimir? Usa el menú del navegador:
      en <b>Safari</b> toca Compartir <span class="ptb-ic">⬆︎</span> → <b>Imprimir</b>;
      en <b>Chrome</b> toca <span class="ptb-ic">⋯</span> → Compartir → <b>Imprimir</b>.
      Si abriste BOOHO desde el ícono de la pantalla de inicio y no sale, ábrela en Safari.</p>`;
  const btn = bar.querySelector('#ptb-print');
  btn.addEventListener('click', doPrint);
  bar.querySelector('#ptb-close').addEventListener('click', closePrintPreview);
  document.body.classList.add('printing');
  area.style.top = bar.offsetHeight + 'px';
  area.scrollTop = 0;
  onCloseHook = resume || null;
  Promise.resolve(pause?.()).finally(() => {
    btn.disabled = false;
    btn.textContent = 'Imprimir';
  });
}

export function closePrintPreview() {
  const hook = onCloseHook;
  onCloseHook = null;
  hook?.();
  document.body.classList.remove('printing');
  const area = document.getElementById('print-area');
  if (area) area.innerHTML = '';
}
