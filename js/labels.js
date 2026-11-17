// Impresión de etiquetas con código QR.
import { esc, money } from './util.js';

export const LABEL_FORMATS = {
  carta: {
    name: 'Hoja carta – 30 etiquetas (tipo Avery 5160, 2⅝" × 1")',
    page: '@page { size: letter; margin: 0.5in 0.19in 0.5in 0.19in; }',
  },
  '50x30': { name: 'Impresora de etiquetas 50 × 30 mm', page: '@page { size: 50mm 30mm; margin: 0; }' },
  '40x30': { name: 'Impresora de etiquetas 40 × 30 mm', page: '@page { size: 40mm 30mm; margin: 0; }' },
  '58x40': { name: 'Impresora de etiquetas 58 × 40 mm', page: '@page { size: 58mm 40mm; margin: 0; }' },
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

export function printLabels(entries, format, storeName) {
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
  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    area.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Pequeña pausa para que el navegador dibuje los códigos antes de imprimir
  setTimeout(() => {
    window.print();
    // Safari en iPad a veces no dispara "afterprint"
    setTimeout(() => document.body.classList.contains('printing') && cleanup(), 1500);
  }, 150);
}
