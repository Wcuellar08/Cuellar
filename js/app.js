import { createStore, isDemo } from './store.js';
import { CONDITIONS, GENDERS, SIZE_SUGGESTIONS } from './defaults.js';
import {
  $, $$, catById, catName, closeModal, confirmDialog, dayKey, esc, fmtDate, fmtDateTime, itemMeta,
  itemSearchText, itemTitle, money, normalize, openModal, pad, parseNum, round2, toast, uid,
} from './util.js';
import { computeReport } from './reports.js';
import { exportReport } from './excel.js';
import { LABEL_FORMATS, printLabels, qrSvg } from './labels.js';
import { openScanner } from './scanner.js';

let store;
const S = () => store.state;

const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

const ui = {
  tab: lsGet('ui.tab', 'vender'),
  cart: [], // {itemId, finalPrice}
  discount: 0,
  payment: null,
  channel: lsGet('ui.channel', null),
  customer: { name: '', phone: '' },
  sellQ: '',
  inv: { q: '', status: 'disponible', cat: '' },
  salesQ: '',
  rep: { preset: 'mes', from: '', to: '' },
  labelFormat: lsGet('ui.labelFormat', 'carta'),
  itemDefaults: {},
  draft: null,
};

// ------------------------------------------------------------------ iconos
const ICONS = {
  sell: '<path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.8h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

const TABS = [
  ['vender', 'Vender', 'sell'],
  ['inventario', 'Inventario', 'box'],
  ['ventas', 'Ventas', 'receipt'],
  ['reportes', 'Reportes', 'chart'],
  ['ajustes', 'Ajustes', 'gear'],
];

/** Reemplaza el contenido salvo que el usuario esté escribiendo dentro. */
function safeSet(el, html) {
  if (!el) return;
  if (el.contains(document.activeElement) && document.activeElement !== document.body) {
    el.dataset.stale = '1';
    return;
  }
  el.innerHTML = html;
  delete el.dataset.stale;
}

// =================================================================== arranque
async function main() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  store = await createStore();
  store.onAuth(() => renderApp());
  store.subscribe(() => refreshView());
  window.addEventListener('store-error', (e) => {
    const code = e.detail?.code || '';
    toast(code === 'permission-denied' ? 'Sin permiso para guardar. Revisa las reglas de Firebase.' : 'Error al guardar: ' + (e.detail?.message || code), 'err');
  });
  window.addEventListener('online', updateNetBadge);
  window.addEventListener('offline', updateNetBadge);
  // Si la venta se queda con un input enfocado, refresca al salir de él
  document.addEventListener('focusout', () => setTimeout(() => {
    if ($$('[data-stale]').length) refreshView();
  }, 50));
  await store.init();
}

function renderApp() {
  const user = S().user;
  const app = $('#app');
  if (!user) return renderLogin(app);
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">${icon('tag')}<span id="store-name">${esc(S().settings.storeName)}</span>
        ${isDemo ? '<span class="badge warn">Modo demo</span>' : ''}</div>
      <div class="top-right"><span id="net" class="net"></span><span class="who">${esc(user.name || user.email || '')}</span></div>
    </header>
    <main id="view"></main>
    <nav class="tabbar">${TABS.map(([id, label, ic]) =>
      `<button data-tab="${id}" class="${ui.tab === id ? 'active' : ''}">${icon(ic)}<span>${label}</span></button>`).join('')}
    </nav>`;
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  updateNetBadge();
  mountView();
  if (!user.name) askName();
}

function updateNetBadge() {
  const el = $('#net');
  if (!el) return;
  if (isDemo) { el.textContent = 'Solo este iPad'; el.className = 'net demo'; return; }
  el.textContent = navigator.onLine ? 'En línea' : 'Sin internet – se guarda y sincroniza después';
  el.className = navigator.onLine ? 'net on' : 'net off';
}

function switchTab(tab) {
  ui.tab = tab;
  lsSet('ui.tab', tab);
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  mountView();
}

const VIEWS = {};
function mountView() {
  const v = $('#view');
  if (!v) return;
  if (ui.tab !== 'ajustes') ui.draft = null;
  v.scrollTop = 0;
  VIEWS[ui.tab].mount(v);
  VIEWS[ui.tab].refresh?.();
}
function refreshView() {
  if (!S().user || !$('#view')) return;
  const sn = $('#store-name');
  if (sn) sn.textContent = S().settings.storeName;
  VIEWS[ui.tab].refresh?.();
}

// =================================================================== login
function renderLogin(app) {
  app.innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="login-logo">${icon('tag')}</div>
        <h1>Registro de ventas</h1>
        ${isDemo ? `
          <p class="muted">Estás en <b>modo demo</b>: los datos se guardan solo en este dispositivo.
          Cuando conectemos Firebase, cada persona entrará con su correo y contraseña.</p>
          <label>Tu nombre<input id="l-name" autocomplete="name" placeholder="Ej. María"></label>
        ` : `
          <label>Correo<input id="l-email" type="email" autocomplete="username" autocapitalize="off"></label>
          <label>Contraseña<input id="l-pass" type="password" autocomplete="current-password"></label>
        `}
        <p id="l-err" class="err-text"></p>
        <button id="l-go" class="btn primary lg block">Entrar</button>
      </div>
    </div>`;
  const go = async () => {
    const err = $('#l-err');
    err.textContent = '';
    try {
      if (isDemo) {
        const n = $('#l-name').value.trim();
        if (!n) return (err.textContent = 'Escribe tu nombre');
        await store.login(n);
      } else {
        $('#l-go').disabled = true;
        await store.login($('#l-email').value.trim(), $('#l-pass').value);
      }
    } catch (e) {
      const c = e.code || '';
      err.textContent = c.includes('invalid') || c.includes('wrong') || c.includes('not-found')
        ? 'Correo o contraseña incorrectos.'
        : c.includes('network') ? 'Sin conexión a internet.' : 'No se pudo entrar: ' + (e.message || c);
      const b = $('#l-go'); if (b) b.disabled = false;
    }
  };
  $('#l-go').addEventListener('click', go);
  $$('.login input').forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && go()));
}

function askName() {
  const m = openModal(`
    <div class="modal-head"><h2>¿Cómo te llamas?</h2></div>
    <div class="modal-body"><p class="muted">Tu nombre aparecerá en las ventas que registres.</p>
      <input id="nm" placeholder="Tu nombre" autocomplete="name"></div>
    <div class="modal-actions"><button class="btn primary" id="nm-ok">Guardar</button></div>`);
  const ok = async () => {
    const n = m.querySelector('#nm').value.trim();
    if (!n) return;
    await store.setUserName(n);
    closeModal();
  };
  m.querySelector('#nm-ok').addEventListener('click', ok);
  m.querySelector('#nm').addEventListener('keydown', (e) => e.key === 'Enter' && ok());
}

// =================================================================== VENDER
VIEWS.vender = {
  mount(v) {
    const st = S().settings;
    if (!ui.payment || !st.paymentMethods.includes(ui.payment)) ui.payment = st.paymentMethods[0] || '';
    if (!ui.channel || !st.channels.includes(ui.channel)) ui.channel = st.channels[0] || '';
    v.innerHTML = `
      <div class="sell">
        <section class="card">
          <div class="search-row">
            <button class="btn primary lg" id="btn-scan">${icon('camera')} Escanear</button>
            <input id="sell-q" type="search" placeholder="Código o descripción…" autocomplete="off" value="${esc(ui.sellQ)}">
          </div>
          <div id="sell-results" class="list"></div>
        </section>
        <section class="card cart-card">
          <div class="card-head"><h2>Venta actual</h2><button id="cart-clear" class="btn small ghost">Vaciar</button></div>
          <div id="cart-items"></div>
          <div class="cart-form">
            <label class="inline">Descuento general (Q)<input id="c-disc" inputmode="decimal" value="${ui.discount || ''}" placeholder="0.00"></label>
            <div class="field-label">Forma de pago</div>
            <div class="chips" id="c-pay">${st.paymentMethods.map((p) => `<button class="chip ${p === ui.payment ? 'on' : ''}" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>
            <div class="field-label">Canal de venta</div>
            <div class="chips" id="c-chan">${st.channels.map((p) => `<button class="chip ${p === ui.channel ? 'on' : ''}" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>
            <div class="grid2">
              <label>Cliente (opcional)<input id="c-name" value="${esc(ui.customer.name)}" autocomplete="off"></label>
              <label>Teléfono (opcional)<input id="c-phone" type="tel" inputmode="tel" value="${esc(ui.customer.phone)}" autocomplete="off"></label>
            </div>
            <div id="cart-totals" class="totals"></div>
            <button id="c-pay-btn" class="btn primary lg block">Cobrar</button>
          </div>
        </section>
      </div>`;

    const q = $('#sell-q');
    q.addEventListener('input', () => { ui.sellQ = q.value; this.refreshResults(true); });
    q.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const it = store.findByCode(q.value);
      if (it) {
        const r = addToCart(it);
        toast(r.msg, r.ok ? 'ok' : 'err');
        if (r.ok) { q.value = ''; ui.sellQ = ''; this.refreshResults(true); }
      }
    });
    $('#btn-scan').addEventListener('click', () =>
      openScanner((code) => {
        const it = store.findByCode(code);
        if (!it) return { ok: false, msg: `Código ${code} no encontrado` };
        return addToCart(it);
      })
    );
    $('#sell-results').addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]');
      if (!b) return;
      const r = addToCart(store.getItem(b.dataset.add));
      toast(r.msg, r.ok ? 'ok' : 'err');
    });
    $('#cart-items').addEventListener('input', (e) => {
      const i = e.target.dataset.price;
      if (i === undefined) return;
      ui.cart[i].finalPrice = parseNum(e.target.value);
      this.refreshTotals();
    });
    $('#cart-items').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      ui.cart.splice(+b.dataset.rm, 1);
      this.refresh();
    });
    $('#cart-clear').addEventListener('click', async () => {
      if (!ui.cart.length || (await confirmDialog('¿Vaciar la venta actual?'))) { resetCart(); this.mount(v); this.refresh(); }
    });
    $('#c-disc').addEventListener('input', (e) => { ui.discount = parseNum(e.target.value); this.refreshTotals(); });
    const chipGroup = (id, key) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      ui[key] = b.dataset.v;
      if (key === 'channel') lsSet('ui.channel', b.dataset.v);
      $$(id + ' .chip').forEach((c) => c.classList.toggle('on', c === b));
    });
    chipGroup('#c-pay', 'payment');
    chipGroup('#c-chan', 'channel');
    $('#c-name').addEventListener('input', (e) => (ui.customer.name = e.target.value));
    $('#c-phone').addEventListener('input', (e) => (ui.customer.phone = e.target.value));
    $('#c-pay-btn').addEventListener('click', () => checkout());
  },
  refresh() {
    // Quita del carrito lo que otra persona ya vendió
    const before = ui.cart.length;
    ui.cart = ui.cart.filter((c) => store.getItem(c.itemId)?.status === 'disponible');
    if (ui.cart.length < before) toast('Se quitó del carrito una prenda que ya se vendió', 'err');
    this.refreshResults();
    const st = S().settings;
    safeSet($('#cart-items'), ui.cart.length
      ? ui.cart.map((c, i) => {
          const it = store.getItem(c.itemId);
          return `<div class="cart-row">
            <div class="grow"><div><span class="code">${esc(it.code)}</span> ${esc(itemTitle(it, st))}</div>
              <small class="muted">${esc(itemMeta(it))} · Etiqueta ${money(it.price)}</small></div>
            <input class="price-in" inputmode="decimal" data-price="${i}" value="${c.finalPrice}">
            <button class="icon-btn" data-rm="${i}" aria-label="Quitar">${icon('x')}</button>
          </div>`;
        }).join('')
      : '<p class="empty">Escanea o busca prendas para agregarlas.</p>');
    this.refreshTotals();
  },
  refreshResults(force) {
    const el = $('#sell-results');
    if (!el) return;
    const st = S().settings;
    const q = normalize(ui.sellQ);
    const inCart = new Set(ui.cart.map((c) => c.itemId));
    let list;
    if (!q) {
      list = S().items.filter((i) => i.status === 'disponible')
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 12);
    } else {
      const terms = q.split(/\s+/);
      list = S().items.filter((i) => { const t = itemSearchText(i, st); return terms.every((x) => t.includes(x)); })
        .sort((a, b) => (a.status === 'disponible' ? 0 : 1) - (b.status === 'disponible' ? 0 : 1) || a.number - b.number)
        .slice(0, 40);
    }
    const html = (q ? '' : '<div class="list-caption">Agregadas recientemente</div>') + (list.length
      ? list.map((it) => `<div class="row-item">
          <div class="grow"><div><span class="code">${esc(it.code)}</span> ${esc(itemTitle(it, st))}</div>
            <small class="muted">${esc(catName(st, it.categoryId))}${it.subcategory ? ' › ' + esc(it.subcategory) : ''} · ${esc(itemMeta(it))}</small></div>
          <div class="price">${money(it.price)}</div>
          ${it.status !== 'disponible' ? '<span class="badge">Vendida</span>'
            : inCart.has(it.id) ? '<span class="badge ok">En venta</span>'
            : `<button class="btn small primary" data-add="${it.id}">Agregar</button>`}
        </div>`).join('')
      : `<p class="empty">${q ? 'No se encontraron prendas.' : 'Aún no hay prendas en el inventario.'}</p>`);
    if (force) el.innerHTML = html; else safeSet(el, html);
  },
  refreshTotals() {
    const el = $('#cart-totals');
    if (!el) return;
    const t = cartTotals();
    el.innerHTML = `
      <div><span>${ui.cart.length} prenda${ui.cart.length === 1 ? '' : 's'}</span><span>${money(t.tagTotal)}</span></div>
      ${t.tagTotal - t.total > 0.004 ? `<div class="muted"><span>Descuentos</span><span>−${money(t.tagTotal - t.total)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${money(t.total)}</span></div>`;
  },
};

function addToCart(it) {
  if (!it) return { ok: false, msg: 'Prenda no encontrada' };
  if (it.status !== 'disponible') return { ok: false, msg: `${it.code} ya fue vendida` };
  if (ui.cart.some((c) => c.itemId === it.id)) return { ok: false, msg: `${it.code} ya está en la venta` };
  ui.cart.push({ itemId: it.id, finalPrice: it.price || 0 });
  if (ui.tab === 'vender') VIEWS.vender.refresh();
  return { ok: true, msg: `Agregada ${it.code} – ${itemTitle(it, S().settings)} (${money(it.price)})` };
}

function cartTotals() {
  const tagTotal = round2(ui.cart.reduce((a, c) => a + (store.getItem(c.itemId)?.price || 0), 0));
  const sumFinal = round2(ui.cart.reduce((a, c) => a + (c.finalPrice || 0), 0));
  const disc = Math.min(Math.max(0, ui.discount || 0), sumFinal);
  return { tagTotal, sumFinal, disc, total: round2(sumFinal - disc) };
}

function resetCart() {
  ui.cart = [];
  ui.discount = 0;
  ui.customer = { name: '', phone: '' };
  ui.sellQ = '';
}

async function checkout() {
  if (!ui.cart.length) return toast('Agrega al menos una prenda', 'err');
  if (ui.cart.some((c) => c.finalPrice < 0)) return toast('Revisa los precios', 'err');
  const st = S().settings;
  const t = cartTotals();
  // Reparte el descuento general entre las prendas, proporcional a su precio
  const lines = ui.cart.map((c) => {
    const it = store.getItem(c.itemId);
    const share = t.sumFinal > 0 ? (t.disc * c.finalPrice) / t.sumFinal : 0;
    return {
      itemId: it.id, code: it.code, title: itemTitle(it, st), categoryId: it.categoryId,
      categoryName: catName(st, it.categoryId), subcategory: it.subcategory || '', size: it.size || '',
      brand: it.brand || '', tagPrice: it.price || 0, finalPrice: round2(c.finalPrice - share), cost: it.cost || 0,
    };
  });
  const diff = round2(t.total - lines.reduce((a, l) => a + l.finalPrice, 0));
  if (lines.length && diff) lines[lines.length - 1].finalPrice = round2(lines[lines.length - 1].finalPrice + diff);

  const ok = await confirmDialog(
    `<b>Cobrar ${money(t.total)}</b><br>${lines.length} prenda${lines.length === 1 ? '' : 's'} · ${esc(ui.payment)} · ${esc(ui.channel)}${ui.customer.name ? '<br>Cliente: ' + esc(ui.customer.name) : ''}`,
    { okText: 'Confirmar venta' }
  );
  if (!ok) return;
  const now = new Date();
  const folio = `T${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}-${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
  const sale = {
    date: now.toISOString(), folio, items: lines, subtotal: t.tagTotal, discount: round2(t.tagTotal - t.total),
    total: t.total, paymentMethod: ui.payment, channel: ui.channel,
    customerName: ui.customer.name.trim(), customerPhone: ui.customer.phone.trim(),
    sellerUid: S().user.uid, sellerName: S().user.name || S().user.email || '',
  };
  try {
    await store.createSale(sale);
  } catch (e) {
    return toast(e.message, 'err');
  }
  resetCart();
  mountView();
  openModal(`
    <div class="modal-body center">
      <div class="big-check">✓</div>
      <h2>Venta registrada</h2>
      <p class="muted">Ticket ${esc(folio)}</p>
      <p class="big-money">${money(sale.total)}</p>
    </div>
    <div class="modal-actions"><button class="btn primary lg block" data-close>Nueva venta</button></div>`);
}

// =================================================================== INVENTARIO
VIEWS.inventario = {
  mount(v) {
    const st = S().settings;
    v.innerHTML = `
      <div class="toolbar">
        <button class="btn primary lg" id="inv-new">${icon('plus')} Nueva prenda</button>
        <button class="btn lg" id="inv-labels">${icon('tag')} Etiquetas <span id="inv-pending" class="badge"></span></button>
      </div>
      <div class="filters">
        <input id="inv-q" type="search" placeholder="Buscar código, descripción, marca…" value="${esc(ui.inv.q)}">
        <select id="inv-status">
          <option value="disponible">Disponibles</option><option value="vendido">Vendidas</option><option value="todas">Todas</option>
        </select>
        <select id="inv-cat"><option value="">Todas las categorías</option>
          ${st.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div id="inv-summary" class="summary"></div>
      <div id="inv-list" class="list card"></div>`;
    $('#inv-status').value = ui.inv.status;
    $('#inv-cat').value = ui.inv.cat;
    $('#inv-q').addEventListener('input', (e) => { ui.inv.q = e.target.value; this.refresh(true); });
    $('#inv-status').addEventListener('change', (e) => { ui.inv.status = e.target.value; this.refresh(); });
    $('#inv-cat').addEventListener('change', (e) => { ui.inv.cat = e.target.value; this.refresh(); });
    $('#inv-new').addEventListener('click', () => openItemForm());
    $('#inv-labels').addEventListener('click', () => openLabelsModal());
    $('#inv-list').addEventListener('click', (e) => {
      const r = e.target.closest('[data-item]');
      if (r) openItemForm(store.getItem(r.dataset.item));
    });
  },
  refresh(force) {
    const st = S().settings;
    const q = normalize(ui.inv.q);
    const terms = q ? q.split(/\s+/) : [];
    const list = S().items
      .filter((i) => ui.inv.status === 'todas' || i.status === ui.inv.status)
      .filter((i) => !ui.inv.cat || i.categoryId === ui.inv.cat)
      .filter((i) => { if (!terms.length) return true; const t = itemSearchText(i, st); return terms.every((x) => t.includes(x)); })
      .sort((a, b) => (b.number || 0) - (a.number || 0));
    const pending = S().items.filter((i) => i.status === 'disponible' && !i.labelPrinted).length;
    const pe = $('#inv-pending');
    if (pe) { pe.textContent = pending ? `${pending} sin imprimir` : ''; pe.style.display = pending ? '' : 'none'; }
    const sum = $('#inv-summary');
    if (sum) sum.textContent = `${list.length} prenda${list.length === 1 ? '' : 's'} · valor ${money(list.reduce((a, i) => a + (i.price || 0), 0))}`;
    const html = list.length ? list.slice(0, 400).map((it) => `
      <div class="row-item tap" data-item="${it.id}">
        <div class="grow"><div><span class="code">${esc(it.code)}</span> ${esc(itemTitle(it, st))}</div>
          <small class="muted">${esc(catName(st, it.categoryId))}${it.subcategory ? ' › ' + esc(it.subcategory) : ''} · ${esc(itemMeta(it))}</small></div>
        ${it.status === 'vendido' ? `<span class="badge">Vendida ${fmtDate(it.soldAt)}</span>` : (!it.labelPrinted ? '<span class="badge warn">Sin etiqueta</span>' : '')}
        <div class="price">${money(it.price)}</div>
      </div>`).join('')
      : `<p class="empty">${S().items.length ? 'No hay prendas con estos filtros.' : 'Aún no hay prendas. Toca “Nueva prenda” para empezar.'}</p>`;
    const el = $('#inv-list');
    if (force) el.innerHTML = html; else safeSet(el, html);
  },
};

function openItemForm(item = null) {
  const st = S().settings;
  const d = item || { ...ui.itemDefaults };
  const isNew = !item;
  const sold = item?.status === 'vendido';
  const opts = (arr, val) => arr.map((x) => `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const m = openModal(`
    <div class="modal-head"><h2>${isNew ? 'Nueva prenda' : `Prenda <span class="code">${esc(item.code)}</span>`}</h2>
      <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body form">
      ${!isNew ? `<p class="muted small">Ingresada ${fmtDateTime(item.createdAt)}${item.createdBy ? ' por ' + esc(item.createdBy) : ''}${sold ? ` · <b>Vendida ${fmtDateTime(item.soldAt)}</b> en ${money(item.soldPrice)}` : ''}</p>` : ''}
      <div class="grid2">
        <label>Categoría *<select id="f-cat"><option value="">Elegir…</option>
          ${st.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === d.categoryId ? 'selected' : ''}>${esc(c.name)} (${esc(c.prefix)})</option>`).join('')}</select></label>
        <label>Subcategoría<select id="f-sub"></select></label>
      </div>
      <label>Descripción<input id="f-desc" value="${esc(d.description || '')}" placeholder="Ej. Blusa floreada con botones"></label>
      <div class="grid3">
        <label>Talla<input id="f-size" list="sizes" value="${esc(d.size || '')}" autocapitalize="characters"></label>
        <label>Marca<input id="f-brand" value="${esc(d.brand || '')}" list="brands"></label>
        <label>Color<input id="f-color" value="${esc(d.color || '')}"></label>
      </div>
      <div class="grid2">
        <label>Estado<select id="f-cond"><option value=""></option>${opts(CONDITIONS, d.condition)}</select></label>
        <label>Género<select id="f-gender"><option value=""></option>${opts(GENDERS, d.gender)}</select></label>
      </div>
      <div class="grid2">
        <label>Costo (Q)<input id="f-cost" inputmode="decimal" value="${d.cost ?? ''}" placeholder="0.00"></label>
        <label>Precio de venta (Q) *<input id="f-price" inputmode="decimal" value="${d.price ?? ''}" placeholder="0.00"></label>
      </div>
      ${!isNew && !sold ? '<p class="muted small">Si cambias la categoría, el código se queda igual.</p>' : ''}
      <datalist id="sizes">${[...new Set(SIZE_SUGGESTIONS)].map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <datalist id="brands">${[...new Set(S().items.map((i) => i.brand).filter(Boolean))].sort().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <p id="f-err" class="err-text"></p>
    </div>
    <div class="modal-actions">
      ${!isNew && !sold ? `<button class="btn danger ghost" id="f-del">Eliminar</button>` : ''}
      ${!isNew ? `<button class="btn" id="f-label">${icon('tag')} Etiqueta</button>` : ''}
      <span class="grow"></span>
      <button class="btn" data-close>Cancelar</button>
      <button class="btn primary" id="f-save">${isNew ? 'Guardar y asignar número' : 'Guardar'}</button>
    </div>`, { wide: true });

  const fillSubs = () => {
    const c = catById(st, m.querySelector('#f-cat').value);
    const subs = c?.subs || [];
    const cur = d.subcategory || '';
    m.querySelector('#f-sub').innerHTML = `<option value="">${subs.length ? '—' : '(sin subcategorías)'}</option>` +
      subs.map((s) => `<option ${s === cur ? 'selected' : ''}>${esc(s)}</option>`).join('');
  };
  fillSubs();
  m.querySelector('#f-cat').addEventListener('change', () => { d.subcategory = ''; fillSubs(); });

  m.querySelector('#f-save').addEventListener('click', async (ev) => {
    const val = (id) => m.querySelector(id).value.trim();
    const data = {
      categoryId: val('#f-cat'), subcategory: val('#f-sub'), description: val('#f-desc'),
      size: val('#f-size'), brand: val('#f-brand'), color: val('#f-color'), condition: val('#f-cond'),
      gender: val('#f-gender'), cost: round2(parseNum(val('#f-cost'))), price: round2(parseNum(val('#f-price'))),
    };
    const err = m.querySelector('#f-err');
    if (!data.categoryId) return (err.textContent = 'Elige una categoría.');
    if (!(data.price > 0)) return (err.textContent = 'Escribe el precio de venta.');
    ev.target.disabled = true;
    try {
      if (isNew) {
        const created = await store.createItem(data);
        ui.itemDefaults = { categoryId: data.categoryId, subcategory: data.subcategory, gender: data.gender, condition: data.condition };
        showCreated(created);
      } else {
        if (sold) delete data.price; // no cambiar el precio de algo ya vendido
        await store.updateItem(item.id, data);
        closeModal();
        toast('Cambios guardados');
      }
    } catch (e) {
      err.textContent = e.message || 'No se pudo guardar.';
      ev.target.disabled = false;
    }
  });
  m.querySelector('#f-del')?.addEventListener('click', async () => {
    if (await confirmDialog(`¿Eliminar la prenda <b>${esc(item.code)}</b>? Esto no se puede deshacer.`, { okText: 'Eliminar', danger: true })) {
      await store.deleteItem(item.id);
      toast('Prenda eliminada');
    }
  });
  m.querySelector('#f-label')?.addEventListener('click', () => openLabelsModal([item.id]));
  if (isNew) setTimeout(() => m.querySelector(d.categoryId ? '#f-desc' : '#f-cat')?.focus(), 50);
}

function showCreated(item) {
  const st = S().settings;
  const m = openModal(`
    <div class="modal-body center">
      <p class="muted">Prenda guardada con el número</p>
      <div class="created-code">${esc(item.code)}</div>
      <div class="created-qr">${qrSvg(item.code)}</div>
      <p>${esc(itemTitle(item, st))} · <b>${money(item.price)}</b></p>
      <p class="muted small">Escribe este número en la etiqueta o imprímela ahora (o después, todas juntas, desde “Etiquetas”).</p>
    </div>
    <div class="modal-actions">
      <button class="btn" id="c-label">${icon('tag')} Imprimir etiqueta</button>
      <span class="grow"></span>
      <button class="btn" data-close>Cerrar</button>
      <button class="btn primary" id="c-another">${icon('plus')} Agregar otra</button>
    </div>`);
  m.querySelector('#c-another').addEventListener('click', () => { closeModal(); openItemForm(); });
  m.querySelector('#c-label').addEventListener('click', () => openLabelsModal([item.id]));
}

function openLabelsModal(preselect = null) {
  const st = S().settings;
  let showAll = !!preselect;
  const selected = new Set(preselect || S().items.filter((i) => i.status === 'disponible' && !i.labelPrinted).map((i) => i.id));
  let skip = 0;
  const m = openModal(`
    <div class="modal-head"><h2>Imprimir etiquetas</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body">
      <label>Tipo de etiqueta<select id="lb-fmt">${Object.entries(LABEL_FORMATS).map(([k, f]) =>
        `<option value="${k}" ${k === ui.labelFormat ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
      <label id="lb-skip-wrap" class="inline">Empezar en la etiqueta nº (si la hoja ya está usada)<input id="lb-skip" type="number" min="1" max="30" value="1"></label>
      <div class="lb-tools">
        <label class="check"><input type="checkbox" id="lb-all-toggle" ${showAll ? 'checked' : ''}> Mostrar también las ya impresas</label>
        <span class="grow"></span>
        <button class="btn small" id="lb-sel">Todas</button><button class="btn small" id="lb-none">Ninguna</button>
      </div>
      <div id="lb-list" class="list lb-list"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="lb-mark">Marcar como impresas</button>
      <span class="grow"></span>
      <button class="btn primary" id="lb-print">Imprimir</button>
    </div>`, { wide: true });

  const visible = () => S().items
    .filter((i) => i.status === 'disponible' && (showAll || !i.labelPrinted || selected.has(i.id)))
    .sort((a, b) => b.number - a.number);
  const draw = () => {
    const list = visible();
    m.querySelector('#lb-list').innerHTML = list.length ? list.map((it) => `
      <label class="row-item check">
        <input type="checkbox" data-id="${it.id}" ${selected.has(it.id) ? 'checked' : ''}>
        <div class="grow"><span class="code">${esc(it.code)}</span> ${esc(itemTitle(it, st))}
          <small class="muted">${it.size ? 'Talla ' + esc(it.size) + ' · ' : ''}${money(it.price)}</small></div>
        ${it.labelPrinted ? '<span class="badge">Impresa</span>' : ''}
      </label>`).join('') : '<p class="empty">No hay etiquetas pendientes de imprimir.</p>';
    m.querySelector('#lb-print').textContent = `Imprimir (${selected.size})`;
    m.querySelector('#lb-skip-wrap').style.display = ui.labelFormat === 'carta' ? '' : 'none';
  };
  draw();
  m.querySelector('#lb-list').addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    if (!id) return;
    e.target.checked ? selected.add(id) : selected.delete(id);
    m.querySelector('#lb-print').textContent = `Imprimir (${selected.size})`;
  });
  m.querySelector('#lb-fmt').addEventListener('change', (e) => { ui.labelFormat = e.target.value; lsSet('ui.labelFormat', ui.labelFormat); draw(); });
  m.querySelector('#lb-skip').addEventListener('input', (e) => (skip = Math.max(0, Math.min(29, (parseInt(e.target.value, 10) || 1) - 1))));
  m.querySelector('#lb-all-toggle').addEventListener('change', (e) => { showAll = e.target.checked; draw(); });
  m.querySelector('#lb-sel').addEventListener('click', () => { visible().forEach((i) => selected.add(i.id)); draw(); });
  m.querySelector('#lb-none').addEventListener('click', () => { selected.clear(); draw(); });
  m.querySelector('#lb-print').addEventListener('click', () => {
    const items = S().items.filter((i) => selected.has(i.id)).sort((a, b) => a.number - b.number);
    if (!items.length) return toast('Selecciona al menos una etiqueta', 'err');
    const entries = items.map((item) => ({ item, title: itemTitle(item, st) }));
    if (ui.labelFormat === 'carta') for (let k = 0; k < skip; k++) entries.unshift({ blank: true });
    printLabels(entries, ui.labelFormat, st.storeName);
  });
  m.querySelector('#lb-mark').addEventListener('click', async () => {
    if (!selected.size) return;
    await store.markLabelsPrinted([...selected]);
    toast(`${selected.size} etiqueta(s) marcadas como impresas`);
    closeModal();
  });
}

// =================================================================== VENTAS
const saleNet = (s) => {
  const kept = s.items.filter((li) => !li.returned);
  return { count: kept.length, total: round2(kept.reduce((a, li) => a + li.finalPrice, 0)), returned: s.items.length - kept.length };
};

VIEWS.ventas = {
  mount(v) {
    v.innerHTML = `
      <div class="filters"><input id="s-q" type="search" placeholder="Buscar ticket, cliente, código…" value="${esc(ui.salesQ)}"></div>
      <div id="s-list"></div>`;
    $('#s-q').addEventListener('input', (e) => { ui.salesQ = e.target.value; this.refresh(true); });
    $('#s-list').addEventListener('click', (e) => {
      const r = e.target.closest('[data-sale]');
      if (r) openSaleDetail(r.dataset.sale);
    });
  },
  refresh(force) {
    const q = normalize(ui.salesQ);
    const list = S().sales
      .filter((s) => !q || normalize([s.folio, s.customerName, s.customerPhone, s.paymentMethod, s.channel, s.sellerName, ...s.items.map((i) => i.code + ' ' + i.title)].join(' ')).includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 300);
    const groups = new Map();
    list.forEach((s) => { const k = dayKey(s.date); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    const html = list.length ? [...groups.entries()].map(([k, arr]) => `
      <div class="day-head"><span>${fmtDate(k + 'T12:00:00')}</span><span>${money(arr.reduce((a, s) => a + saleNet(s).total, 0))}</span></div>
      <div class="list card">${arr.map((s) => {
        const n = saleNet(s);
        return `<div class="row-item tap" data-sale="${s.id}">
          <div class="time">${new Date(s.date).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="grow"><div>${n.count} prenda${n.count === 1 ? '' : 's'}${s.customerName ? ' · ' + esc(s.customerName) : ''}</div>
            <small class="muted">${esc(s.folio)} · ${esc(s.paymentMethod)} · ${esc(s.channel)} · ${esc(s.sellerName || '')}</small></div>
          ${n.returned ? `<span class="badge warn">${n.returned} devuelta${n.returned === 1 ? '' : 's'}</span>` : ''}
          <div class="price">${money(n.total)}</div>
        </div>`;
      }).join('')}</div>`).join('')
      : `<p class="empty">${S().sales.length ? 'Sin resultados.' : 'Aún no hay ventas registradas.'}</p>`;
    const el = $('#s-list');
    if (force) el.innerHTML = html; else safeSet(el, html);
  },
};

function openSaleDetail(id) {
  const s = S().sales.find((x) => x.id === id);
  if (!s) return;
  const n = saleNet(s);
  const m = openModal(`
    <div class="modal-head"><h2>Ticket ${esc(s.folio)}</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body">
      <p class="muted">${fmtDateTime(s.date)} · vendió ${esc(s.sellerName || '')}</p>
      <div class="kv"><span>Forma de pago</span><b>${esc(s.paymentMethod)}</b><span>Canal</span><b>${esc(s.channel)}</b>
        ${s.customerName ? `<span>Cliente</span><b>${esc(s.customerName)}</b>` : ''}
        ${s.customerPhone ? `<span>Teléfono</span><b>${esc(s.customerPhone)}</b>` : ''}</div>
      <div class="list">${s.items.map((li) => `
        <div class="row-item ${li.returned ? 'returned' : ''}">
          <div class="grow"><div><span class="code">${esc(li.code)}</span> ${esc(li.title)}</div>
            <small class="muted">Etiqueta ${money(li.tagPrice)}${li.returned ? ` · Devuelta ${fmtDate(li.returnedAt)}` : ''}</small></div>
          <div class="price">${money(li.finalPrice)}</div>
          ${li.returned ? '<span class="badge warn">Devuelta</span>' : `<button class="btn small ghost danger" data-ret="${li.itemId}">Devolución</button>`}
        </div>`).join('')}</div>
      <div class="totals">
        ${s.discount > 0 ? `<div class="muted"><span>Descuento</span><span>−${money(s.discount)}</span></div>` : ''}
        <div class="grand"><span>Total${n.returned ? ' (sin devoluciones)' : ''}</span><span>${money(n.total)}</span></div>
      </div>
    </div>`, { wide: true });
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ret]');
    if (!b) return;
    const li = s.items.find((x) => x.itemId === b.dataset.ret);
    if (await confirmDialog(`¿Registrar devolución de <b>${esc(li.code)}</b> por ${money(li.finalPrice)}?<br>La prenda vuelve a estar disponible en el inventario.`, { okText: 'Registrar devolución', danger: true })) {
      await store.returnItem(s.id, li.itemId);
      toast('Devolución registrada');
      setTimeout(() => openSaleDetail(s.id), 50);
    }
  });
}

// =================================================================== REPORTES
function presetRange(p) {
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth();
  const k = (d) => dayKey(d);
  switch (p) {
    case 'hoy': return [k(now), k(now)];
    case 'ayer': { const d = new Date(y, mo, now.getDate() - 1); return [k(d), k(d)]; }
    case 'semana': { const dow = (now.getDay() + 6) % 7; return [k(new Date(y, mo, now.getDate() - dow)), k(now)]; }
    case 'mes': return [k(new Date(y, mo, 1)), k(now)];
    case 'mespasado': return [k(new Date(y, mo - 1, 1)), k(new Date(y, mo, 0))];
    case 'anio': return [k(new Date(y, 0, 1)), k(now)];
    default: return [ui.rep.from, ui.rep.to];
  }
}
const PRESETS = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mespasado', 'Mes pasado'], ['anio', 'Este año']];

VIEWS.reportes = {
  mount(v) {
    if (ui.rep.preset !== 'custom') [ui.rep.from, ui.rep.to] = presetRange(ui.rep.preset);
    v.innerHTML = `
      <div class="card rep-controls">
        <div class="chips" id="r-presets">${PRESETS.map(([k, l]) => `<button class="chip ${ui.rep.preset === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
        <div class="rep-dates">
          <label>Desde<input type="date" id="r-from" value="${ui.rep.from}"></label>
          <label>Hasta<input type="date" id="r-to" value="${ui.rep.to}"></label>
          <button class="btn primary lg" id="r-export">${icon('download')} Exportar a Excel</button>
        </div>
      </div>
      <div id="r-body"></div>`;
    $('#r-presets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      ui.rep.preset = b.dataset.p;
      this.mount(v); this.refresh();
    });
    const onDate = () => {
      ui.rep.preset = 'custom';
      ui.rep.from = $('#r-from').value || ui.rep.from;
      ui.rep.to = $('#r-to').value || ui.rep.to;
      if (ui.rep.from > ui.rep.to) [ui.rep.from, ui.rep.to] = [ui.rep.to, ui.rep.from];
      $$('#r-presets .chip').forEach((c) => c.classList.remove('on'));
      this.refresh();
    };
    $('#r-from').addEventListener('change', onDate);
    $('#r-to').addEventListener('change', onDate);
    $('#r-export').addEventListener('click', () => {
      try {
        const file = exportReport(computeReport(S(), ui.rep.from, ui.rep.to), S().settings.storeName);
        toast('Descargado: ' + file);
      } catch (e) {
        console.error(e);
        toast('No se pudo exportar: ' + e.message, 'err');
      }
    });
  },
  refresh() {
    const r = computeReport(S(), ui.rep.from, ui.rep.to);
    const k = r.kpis;
    const kpi = (label, val, sub = '') => `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
    const table = (title, head, rows) => `<section class="card"><h3>${title}</h3>${rows.length
      ? `<div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
      : '<p class="empty">Sin datos en este periodo.</p>'}</section>`;
    const pct = (x) => (x * 100).toFixed(0) + '%';
    $('#r-body').innerHTML = `
      <div class="kpis">
        ${kpi('Ventas', money(k.revenue), `${k.tickets} ticket${k.tickets === 1 ? '' : 's'} · ${k.items} prenda${k.items === 1 ? '' : 's'}`)}
        ${kpi('Ganancia', money(k.profit), `Margen ${pct(k.margin)} · costo ${money(k.cost)}`)}
        ${kpi('Ticket promedio', money(k.avgTicket), `Descuentos ${money(k.discounts)}${k.returns ? ` · ${k.returns} devol.` : ''}`)}
        ${kpi('Inventario disponible', `${k.invCount} prendas`, `Valor ${money(k.invValue)} · costo ${money(k.invCost)}`)}
      </div>
      <div class="rep-grid">
        ${table('Por categoría', ['Categoría', 'Prendas', 'Ventas', 'Ganancia'], r.byCat.flatMap((c) => [
          `<tr class="strong"><td>${esc(c.name)}</td><td class="num">${c.items}</td><td class="num">${money(c.total)}</td><td class="num">${money(c.profit)}</td></tr>`,
          ...c.subs.map((s) => `<tr class="sub"><td>› ${esc(s.name)}</td><td class="num">${s.items}</td><td class="num">${money(s.total)}</td><td class="num">${money(s.profit)}</td></tr>`),
        ]))}
        <div>
          ${table('Por forma de pago', ['Forma de pago', 'Tickets', 'Total'], r.byPay.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.tickets}</td><td class="num">${money(x.total)}</td></tr>`))}
          ${table('Por canal', ['Canal', 'Tickets', 'Total'], r.byChannel.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.tickets}</td><td class="num">${money(x.total)}</td></tr>`))}
        </div>
        ${table('Por día', ['Fecha', 'Tickets', 'Ventas', 'Ganancia'], r.byDay.slice().reverse().map((x) => `<tr><td>${fmtDate(x.day + 'T12:00:00')}</td><td class="num">${x.tickets}</td><td class="num">${money(x.total)}</td><td class="num">${money(x.profit)}</td></tr>`))}
        ${table('Más tiempo sin venderse', ['Prenda', 'Días', 'Precio'], r.inventory.slice(0, 15).map((i) => `<tr><td><span class="code">${esc(i.code)}</span> ${esc(i.title)}</td><td class="num">${i.days}</td><td class="num">${money(i.price)}</td></tr>`))}
      </div>`;
  },
};

// =================================================================== AJUSTES
VIEWS.ajustes = {
  mount(v) {
    if (!ui.draft) ui.draft = structuredClone(S().settings);
    const u = S().user;
    v.innerHTML = `
      <section class="card">
        <h3>Tienda</h3>
        <label>Nombre de la tienda (sale en las etiquetas)<input id="a-store" value="${esc(ui.draft.storeName)}"></label>
      </section>
      <section class="card">
        <h3>Categorías y subcategorías</h3>
        <p class="muted small">El <b>prefijo</b> (2 a 4 letras) es el inicio del número de cada prenda, por ejemplo <span class="code">BLU-0001</span>. El número que sigue es único para toda la tienda.</p>
        <div id="a-cats"></div>
        <button class="btn" id="a-addcat">${icon('plus')} Nueva categoría</button>
      </section>
      <section class="card">
        <h3>Formas de pago</h3><div id="a-pay"></div>
        <h3>Canales de venta</h3><div id="a-chan"></div>
      </section>
      <div class="save-bar"><p id="a-err" class="err-text"></p><button class="btn primary lg" id="a-save">Guardar cambios</button></div>
      <section class="card">
        <h3>Mi usuario</h3>
        <p>${esc(u.name || '')} ${u.email ? `<span class="muted">(${esc(u.email)})</span>` : ''}</p>
        <div class="row-btns">
          <button class="btn" id="a-rename">Cambiar mi nombre</button>
          <button class="btn danger ghost" id="a-logout">Cerrar sesión</button>
        </div>
      </section>
      ${isDemo ? `<section class="card"><h3>Modo demo</h3>
        <p class="muted small">Los datos se guardan solo en este dispositivo. Cuando configures Firebase, la app usará la nube y estos datos de prueba no se pasan.</p>
        <button class="btn danger ghost" id="a-reset">Borrar todos los datos de prueba</button></section>` : ''}
      <p class="muted small center">Registro de Ventas · v1.0</p>`;
    this.drawCats();
    this.drawList('#a-pay', 'paymentMethods', 'Nueva forma de pago');
    this.drawList('#a-chan', 'channels', 'Nuevo canal');
    $('#a-store').addEventListener('input', (e) => (ui.draft.storeName = e.target.value));
    $('#a-addcat').addEventListener('click', () => {
      ui.draft.categories.push({ id: uid(), name: '', prefix: '', subs: [] });
      this.drawCats();
      $$('#a-cats [data-f="name"]').pop()?.focus();
    });
    $('#a-save').addEventListener('click', () => saveSettings());
    $('#a-rename').addEventListener('click', () => askName());
    $('#a-logout').addEventListener('click', async () => { if (await confirmDialog('¿Cerrar sesión?')) store.logout(); });
    $('#a-reset')?.addEventListener('click', async () => {
      if (await confirmDialog('¿Borrar <b>todo</b> (prendas, ventas y ajustes) de este dispositivo?', { okText: 'Borrar todo', danger: true })) store.resetDemo();
    });
  },
  drawCats() {
    const used = new Set(S().items.map((i) => i.categoryId));
    const el = $('#a-cats');
    el.innerHTML = ui.draft.categories.map((c, i) => `
      <div class="cat-card" data-i="${i}">
        <div class="cat-row">
          <input data-f="name" value="${esc(c.name)}" placeholder="Nombre de categoría">
          <input data-f="prefix" class="prefix" value="${esc(c.prefix)}" placeholder="ABC" maxlength="4" autocapitalize="characters">
          <button class="icon-btn" data-delcat="${i}" ${used.has(c.id) ? 'disabled title="Tiene prendas"' : ''} aria-label="Eliminar">${icon('x')}</button>
        </div>
        <div class="chips">
          ${c.subs.map((s, j) => `<span class="chip on">${esc(s)}<button data-delsub="${i}:${j}" aria-label="Quitar">×</button></span>`).join('')}
          <input class="chip-input" data-addsub="${i}" placeholder="+ subcategoría">
        </div>
      </div>`).join('');
    el.oninput = (e) => {
      const card = e.target.closest('.cat-card');
      const f = e.target.dataset.f;
      if (!card || !f) return;
      const c = ui.draft.categories[+card.dataset.i];
      if (f === 'prefix') { e.target.value = e.target.value.toUpperCase().replace(/[^A-ZÑ]/g, ''); }
      c[f] = e.target.value;
    };
    el.onclick = (e) => {
      const dc = e.target.closest('[data-delcat]');
      if (dc && !dc.disabled) { ui.draft.categories.splice(+dc.dataset.delcat, 1); return this.drawCats(); }
      const ds = e.target.closest('[data-delsub]');
      if (ds) { const [i, j] = ds.dataset.delsub.split(':').map(Number); ui.draft.categories[i].subs.splice(j, 1); this.drawCats(); }
    };
    const addSub = (inp) => {
      const v = inp.value.trim();
      if (!v) return;
      const c = ui.draft.categories[+inp.dataset.addsub];
      if (!c.subs.includes(v)) c.subs.push(v);
      this.drawCats();
      $(`[data-addsub="${inp.dataset.addsub}"]`)?.focus();
    };
    $$('[data-addsub]', el).forEach((inp) => {
      inp.addEventListener('keydown', (e) => e.key === 'Enter' && addSub(inp));
      inp.addEventListener('change', () => addSub(inp));
    });
  },
  drawList(sel, key, ph) {
    const el = $(sel);
    el.innerHTML = `<div class="chips">${ui.draft[key].map((s, j) => `<span class="chip on">${esc(s)}<button data-del="${j}" aria-label="Quitar">×</button></span>`).join('')}
      <input class="chip-input" placeholder="+ ${ph}"></div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-del]');
      if (b) { ui.draft[key].splice(+b.dataset.del, 1); this.drawList(sel, key, ph); }
    };
    const inp = $('.chip-input', el);
    const add = () => {
      const v = inp.value.trim();
      if (v && !ui.draft[key].includes(v)) ui.draft[key].push(v);
      this.drawList(sel, key, ph);
      $(sel + ' .chip-input').focus();
    };
    inp.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    inp.addEventListener('change', add);
  },
};

async function saveSettings() {
  const d = ui.draft;
  const err = $('#a-err');
  err.textContent = '';
  d.storeName = d.storeName.trim() || 'Mi Tienda';
  const seen = new Set();
  for (const c of d.categories) {
    c.name = c.name.trim();
    c.prefix = c.prefix.trim().toUpperCase();
    if (!c.name) return (err.textContent = 'Hay una categoría sin nombre.');
    if (!/^[A-ZÑ]{2,4}$/.test(c.prefix)) return (err.textContent = `El prefijo de “${c.name}” debe tener de 2 a 4 letras.`);
    if (seen.has(c.prefix)) return (err.textContent = `El prefijo ${c.prefix} está repetido.`);
    seen.add(c.prefix);
  }
  if (!d.paymentMethods.length) return (err.textContent = 'Agrega al menos una forma de pago.');
  if (!d.channels.length) return (err.textContent = 'Agrega al menos un canal de venta.');
  await store.saveSettings(structuredClone(d));
  toast('Ajustes guardados');
}

main().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="login"><div class="login-card"><h1>Error al iniciar</h1><p>${esc(e.message)}</p></div></div>`;
});
