// Exporta el reporte a un archivo .xlsx con varias hojas (usa SheetJS).
import { fmtDate } from './util.js';

const MONEY_FMT = '"Q"#,##0.00';
const PCT_FMT = '0.0%';

function sheet(rows, { money = [], pct = [], widths = [] } = {}) {
  const XLSX = window.XLSX;
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], { dateNF: 'dd/mm/yyyy' });
  if (!rows.length) return ws;
  const headers = Object.keys(rows[0]);
  const range = XLSX.utils.decode_range(ws['!ref']);
  headers.forEach((h, c) => {
    const fmt = money.includes(h) ? MONEY_FMT : pct.includes(h) ? PCT_FMT : null;
    if (!fmt) return;
    for (let r = 1; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = fmt;
    }
  });
  ws['!cols'] = headers.map((h, i) => ({
    wch: widths[i] || Math.min(40, Math.max(h.length + 2, ...rows.map((r) => String(r[h] ?? '').length + 2))),
  }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  return ws;
}

const d = (iso) => (iso ? new Date(iso) : '');
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }) : '');

export function exportReport(report, storeName) {
  const XLSX = window.XLSX;
  const k = report.kpis;
  const wb = XLSX.utils.book_new();

  // --- Resumen ---
  const resumen = [
    ['Reporte de', storeName],
    ['Periodo', `${fmtDate(report.from + 'T12:00:00')} al ${fmtDate(report.to + 'T12:00:00')}`],
    ['Generado', new Date().toLocaleString('es-GT')],
    [],
    ['VENTAS', ''],
    ['Ventas netas', k.revenue],
    ['Costo de lo vendido', k.cost],
    ['Ganancia', k.profit],
    ['Margen', k.margin],
    ['Descuentos dados', k.discounts],
    ['Tickets', k.tickets],
    ['Prendas vendidas', k.items],
    ['Ticket promedio', k.avgTicket],
    ['Devoluciones', k.returns],
    [],
    ['INVENTARIO ACTUAL', ''],
    ['Prendas disponibles', k.invCount],
    ['Valor a precio de venta', k.invValue],
    ['Costo del inventario', k.invCost],
  ];
  const wsR = XLSX.utils.aoa_to_sheet(resumen);
  ['B6', 'B7', 'B8', 'B10', 'B13', 'B18', 'B19'].forEach((a) => wsR[a] && (wsR[a].z = MONEY_FMT));
  if (wsR.B9) wsR.B9.z = PCT_FMT;
  wsR['!cols'] = [{ wch: 26 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumen');

  // --- Ventas detalle ---
  XLSX.utils.book_append_sheet(wb, sheet(report.lines.map((l) => ({
    Fecha: d(l.date), Hora: time(l.date), Ticket: l.folio, 'Código': l.code, 'Descripción': l.title,
    'Categoría': l.category, 'Subcategoría': l.subcategory, Talla: l.size, Marca: l.brand,
    'Precio etiqueta': l.tagPrice, 'Precio final': l.finalPrice, Costo: l.cost, Ganancia: l.profit,
    'Forma de pago': l.payment, 'Autorización': l.auth, Canal: l.channel, Cliente: l.customer, 'Teléfono': l.phone, Vendedor: l.seller,
  })), { money: ['Precio etiqueta', 'Precio final', 'Costo', 'Ganancia'], widths: [12, 8, 16, 11] }), 'Ventas detalle');

  // --- Tickets ---
  XLSX.utils.book_append_sheet(wb, sheet(report.tickets.map((t) => ({
    Fecha: d(t.date), Hora: time(t.date), Ticket: t.folio, Prendas: t.items, Devueltas: t.returned,
    Subtotal: t.subtotal, Descuento: t.discount, Total: t.total, Ganancia: t.profit,
    'Forma de pago': t.payment, 'Autorización': t.auth, Canal: t.channel, Cliente: t.customer, 'Teléfono': t.phone, Vendedor: t.seller,
  })), { money: ['Subtotal', 'Descuento', 'Total', 'Ganancia'], widths: [12, 8, 16] }), 'Tickets');

  // --- Por día ---
  XLSX.utils.book_append_sheet(wb, sheet(report.byDay.map((x) => ({
    Fecha: new Date(x.day + 'T12:00:00'), Tickets: x.tickets, Prendas: x.items, Ventas: x.total, Costo: x.cost,
    Ganancia: x.profit,
  })), { money: ['Ventas', 'Costo', 'Ganancia'], widths: [12] }), 'Por día');

  // --- Por categoría ---
  const catRows = [];
  report.byCat.forEach((c) => {
    catRows.push({ 'Categoría': c.name, 'Subcategoría': '(total)', Prendas: c.items, Ventas: c.total, Costo: c.cost, Ganancia: c.profit, Margen: c.total ? c.profit / c.total : 0 });
    c.subs.forEach((s) =>
      catRows.push({ 'Categoría': c.name, 'Subcategoría': s.name, Prendas: s.items, Ventas: s.total, Costo: s.cost, Ganancia: s.profit, Margen: s.total ? s.profit / s.total : 0 })
    );
  });
  XLSX.utils.book_append_sheet(wb, sheet(catRows, { money: ['Ventas', 'Costo', 'Ganancia'], pct: ['Margen'] }), 'Por categoría');

  // --- Por pago y canal ---
  const pc = (arr, label) => arr.map((x) => ({ [label]: x.name, Tickets: x.tickets, Prendas: x.items, Total: x.total }));
  XLSX.utils.book_append_sheet(wb, sheet(pc(report.byPay, 'Forma de pago'), { money: ['Total'] }), 'Por forma de pago');
  XLSX.utils.book_append_sheet(wb, sheet(pc(report.byChannel, 'Canal'), { money: ['Total'] }), 'Por canal');

  // --- Inventario ---
  XLSX.utils.book_append_sheet(wb, sheet(report.inventory.map((i) => ({
    'Código': i.code, 'Descripción': i.title, 'Categoría': i.categoryName, 'Subcategoría': i.subcategory || '',
    Talla: i.size || '', Marca: i.brand || '', Color: i.color || '', Estado: i.condition || '', 'Género': i.gender || '',
    Costo: i.cost || 0, Precio: i.price || 0, 'Fecha ingreso': d(i.createdAt), 'Días en inventario': i.days,
  })), { money: ['Costo', 'Precio'], widths: [11] }), 'Inventario');

  // --- Cortes de caja ---
  XLSX.utils.book_append_sheet(wb, sheet((report.cortes || []).map((k) => ({
    'Día': new Date(k.day + 'T12:00:00'), Hora: time(k.createdAt), Vendedor: k.sellerName, 'Hecho por': k.createdBy,
    Tickets: k.tickets, Ventas: k.totalSales, Devoluciones: k.totalReturns, Neto: k.totalNet,
    'Fondo inicial': k.fondo ?? '', 'Efectivo esperado': k.cashExpected ?? '', 'Efectivo contado': k.cashCounted ?? '',
    Diferencia: k.difference ?? '', Notas: k.notes || '',
  })), { money: ['Ventas', 'Devoluciones', 'Neto', 'Fondo inicial', 'Efectivo esperado', 'Efectivo contado', 'Diferencia'], widths: [12, 8] }), 'Cortes de caja');

  const file = `Reporte_${report.from}_a_${report.to}.xlsx`;
  XLSX.writeFile(wb, file);
  return file;
}
