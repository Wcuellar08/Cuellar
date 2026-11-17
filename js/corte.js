// Cálculo del corte de caja de un día.
import { dayKey, normalize, round2 } from './util.js';

/**
 * Dinero que entró y salió en un día, por forma de pago.
 * - Ventas: todo lo cobrado ese día (aunque después se devuelva).
 * - Devoluciones: lo que se regresó ese día (de ventas de cualquier fecha),
 *   con la forma de pago de la venta original.
 * sellerUid = '' para todos los vendedores.
 */
export function computeCorte(state, day, sellerUid = '', sellerName = '') {
  const { settings, sales } = state;
  const rows = new Map();
  const row = (m) => {
    const k = m || '(sin dato)';
    if (!rows.has(k)) rows.set(k, { method: k, tickets: 0, items: 0, sales: 0, returns: 0, returnsCount: 0 });
    return rows.get(k);
  };
  settings.paymentMethods.forEach((m) => row(m));

  for (const s of sales) {
    if (dayKey(s.date) === day && (!sellerUid || s.sellerUid === sellerUid)) {
      const r = row(s.paymentMethod);
      r.tickets++;
      r.items += s.items.length;
      r.sales += s.items.reduce((a, li) => a + (li.finalPrice || 0), 0);
    }
    for (const li of s.items) {
      if (!li.returned || !li.returnedAt || dayKey(li.returnedAt) !== day) continue;
      if (sellerUid && li.returnedByUid !== sellerUid && !(!li.returnedByUid && li.returnedBy === sellerName)) continue;
      const r = row(s.paymentMethod);
      r.returns += li.finalPrice || 0;
      r.returnsCount++;
    }
  }
  const list = [...rows.values()]
    .map((r) => ({ ...r, sales: round2(r.sales), returns: round2(r.returns), net: round2(r.sales - r.returns) }))
    .filter((r) => r.tickets || r.returnsCount || settings.paymentMethods.includes(r.method));
  const cash = list.find((r) => normalize(r.method).includes('efectivo')) || null;
  return {
    day, rows: list, cash,
    tickets: list.reduce((a, r) => a + r.tickets, 0),
    items: list.reduce((a, r) => a + r.items, 0),
    totalSales: round2(list.reduce((a, r) => a + r.sales, 0)),
    totalReturns: round2(list.reduce((a, r) => a + r.returns, 0)),
    totalNet: round2(list.reduce((a, r) => a + r.net, 0)),
  };
}
