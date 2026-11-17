import { catName, dayKey, endOfDay, itemTitle, round2, startOfDay } from './util.js';

const add = (map, key, init) => {
  if (!map.has(key)) map.set(key, init());
  return map.get(key);
};

/** Calcula todos los números del reporte entre dos fechas (YYYY-MM-DD, inclusivas). */
export function computeReport(state, fromKey, toKey) {
  const { settings, sales, items } = state;
  const from = startOfDay(fromKey).getTime();
  const to = endOfDay(toKey).getTime();
  const inRange = sales
    .filter((s) => {
      const t = new Date(s.date).getTime();
      return t >= from && t <= to;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines = [];
  const tickets = [];
  const byCat = new Map();
  const byPay = new Map();
  const byChannel = new Map();
  const byDay = new Map();
  let returns = 0;

  for (const s of inRange) {
    const kept = s.items.filter((li) => !li.returned);
    returns += s.items.length - kept.length;
    const total = round2(kept.reduce((a, li) => a + (li.finalPrice || 0), 0));
    const subtotal = round2(kept.reduce((a, li) => a + (li.tagPrice || 0), 0));
    const cost = round2(kept.reduce((a, li) => a + (li.cost || 0), 0));
    tickets.push({
      date: s.date, folio: s.folio, items: kept.length, returned: s.items.length - kept.length,
      subtotal, discount: round2(subtotal - total), total, profit: round2(total - cost),
      payment: s.paymentMethod, channel: s.channel, customer: s.customerName || '', phone: s.customerPhone || '',
      seller: s.sellerName || '',
    });
    if (kept.length) {
      const p = add(byPay, s.paymentMethod || '(sin dato)', () => ({ tickets: 0, items: 0, total: 0 }));
      p.tickets++; p.items += kept.length; p.total += total;
      const c = add(byChannel, s.channel || '(sin dato)', () => ({ tickets: 0, items: 0, total: 0 }));
      c.tickets++; c.items += kept.length; c.total += total;
      const d = add(byDay, dayKey(s.date), () => ({ tickets: 0, items: 0, total: 0, cost: 0 }));
      d.tickets++; d.items += kept.length; d.total += total; d.cost += cost;
    }
    for (const li of kept) {
      const profit = round2((li.finalPrice || 0) - (li.cost || 0));
      const cname = li.categoryName || catName(settings, li.categoryId);
      lines.push({
        date: s.date, folio: s.folio, code: li.code, title: li.title, category: cname,
        subcategory: li.subcategory || '', size: li.size || '', brand: li.brand || '',
        tagPrice: li.tagPrice || 0, finalPrice: li.finalPrice || 0, cost: li.cost || 0, profit,
        payment: s.paymentMethod, channel: s.channel, customer: s.customerName || '',
        phone: s.customerPhone || '', seller: s.sellerName || '',
      });
      const cat = add(byCat, cname, () => ({ items: 0, total: 0, cost: 0, subs: new Map() }));
      cat.items++; cat.total += li.finalPrice || 0; cat.cost += li.cost || 0;
      const sub = add(cat.subs, li.subcategory || '(sin subcategoría)', () => ({ items: 0, total: 0, cost: 0 }));
      sub.items++; sub.total += li.finalPrice || 0; sub.cost += li.cost || 0;
    }
  }

  const revenue = round2(lines.reduce((a, l) => a + l.finalPrice, 0));
  const cost = round2(lines.reduce((a, l) => a + l.cost, 0));
  const discounts = round2(lines.reduce((a, l) => a + (l.tagPrice - l.finalPrice), 0));
  const ticketCount = tickets.filter((t) => t.items > 0).length;

  const now = Date.now();
  const inventory = items
    .filter((i) => i.status === 'disponible')
    .map((i) => ({
      ...i,
      title: itemTitle(i, settings),
      categoryName: catName(settings, i.categoryId),
      days: Math.max(0, Math.floor((now - new Date(i.createdAt).getTime()) / 86400000)),
    }))
    .sort((a, b) => b.days - a.days);

  const sortByTotal = (m) =>
    [...m.entries()].map(([name, v]) => ({ name, ...v, total: round2(v.total) })).sort((a, b) => b.total - a.total);

  const cortes = (state.cortes || [])
    .filter((k) => k.day >= fromKey && k.day <= toKey)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    from: fromKey, to: toKey, lines, tickets, cortes,
    byCat: [...byCat.entries()]
      .map(([name, v]) => ({
        name, items: v.items, total: round2(v.total), cost: round2(v.cost), profit: round2(v.total - v.cost),
        subs: [...v.subs.entries()]
          .map(([sname, s]) => ({ name: sname, items: s.items, total: round2(s.total), cost: round2(s.cost), profit: round2(s.total - s.cost) }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total),
    byPay: sortByTotal(byPay),
    byChannel: sortByTotal(byChannel),
    byDay: [...byDay.entries()]
      .map(([day, v]) => ({ day, ...v, total: round2(v.total), cost: round2(v.cost), profit: round2(v.total - v.cost) }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    kpis: {
      revenue, cost, profit: round2(revenue - cost), margin: revenue ? (revenue - cost) / revenue : 0,
      items: lines.length, tickets: ticketCount, avgTicket: ticketCount ? round2(revenue / ticketCount) : 0,
      discounts, returns,
      invCount: inventory.length,
      invValue: round2(inventory.reduce((a, i) => a + (i.price || 0), 0)),
      invCost: round2(inventory.reduce((a, i) => a + (i.cost || 0), 0)),
    },
    inventory,
  };
}
