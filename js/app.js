import { checkBackup, cleanUsername, createStore, isDemo, ROLES, validatePassword, validateUsername } from './store.js';
import { computeCorte } from './corte.js';
import { CONDITIONS, GENDERS, PANTS_SIZES, SIZE_SUGGESTIONS, usesPantsSizes } from './defaults.js';
import {
  $, $$, catById, catName, closeModal, confirmDialog, dayKey, esc, fmtDate, fmtDateTime, itemMeta,
  itemSearchText, itemTitle, money, normalize, openModal, pad, parseNum, round2, toast, uid,
} from './util.js';
import { computeReport } from './reports.js';
import { exportReport } from './excel.js';
import { LABEL_FORMATS, printLabels, qrSvg } from './labels.js';
import { openScanner } from './scanner.js';
import { fileToPhotos, openPhotoViewer } from './photos.js';

let store;
const S = () => store.state;

const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

const ui = {
  tab: 'inicio',
  cart: [], // {itemId, finalPrice}
  discount: 0,
  payment: null,
  channel: lsGet('ui.channel', null),
  customer: { name: '', phone: '' },
  auth: '',
  ship: { on: false, address: '', carrier: '', fee: 0 },
  sellQ: '',
  inv: { q: '', status: 'disponible', cat: '' },
  salesQ: '',
  rep: { preset: 'mes', from: '', to: '', group: lsGet('ui.repGroup', 'cat') },
  labelFormat: lsGet('ui.labelFormat', 'carta'),
  itemDefaults: {},
  draft: null,
};

// ------------------------------------------------------------------ iconos
const ICONS = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
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
  ['inicio', 'Inicio', 'home'],
  ['vender', 'Vender', 'sell'],
  ['inventario', 'Inventario', 'box'],
  ['ventas', 'Ventas', 'receipt'],
  ['reportes', 'Reportes', 'chart', 'owner'],
  ['ajustes', 'Ajustes', 'gear'],
];
const isOwner = () => store.isOwner();
const visibleTabs = () => TABS.filter((t) => t[3] !== 'owner' || isOwner());

// ------------------------------------------------------------------ redes (Instagram, Vitrinnea…)
const platforms = () => S().settings.platforms || [];
function platAbbr(p) {
  const n = normalize(p);
  if (n.includes('instagram')) return 'IG';
  if (n.includes('facebook')) return 'FB';
  if (n.includes('tiktok')) return 'TT';
  if (n.includes('vitrin')) return 'VI';
  return p.slice(0, 2).toUpperCase();
}
/** Indicadores de dónde está publicada (tocarlos marca/desmarca). */
function pubBadges(it) {
  const on = it.publishedOn || [];
  return platforms().map((p) => `<button type="button" class="pub ${on.includes(p) ? 'on' : ''}" data-pub="${esc(it.id)}" data-plat="${esc(p)}"
    title="${esc(p)}${on.includes(p) ? ' (publicada)' : ' (sin publicar)'}">${esc(platAbbr(p))}</button>`).join('');
}
const pendingSocial = () => S().items
  .filter((i) => i.status === 'vendido' && (i.pendingUnpublish || []).length)
  .sort((a, b) => (b.soldAt || '').localeCompare(a.soldAt || ''));

/** Miniatura de la prenda (tocarla abre la foto grande). */
function thumbHtml(it) {
  return it.thumb
    ? `<img class="thumb" src="${esc(it.thumb)}" alt="" data-photo="${esc(it.id)}">`
    : '<span class="thumb empty"></span>';
}
async function showItemPhoto(id) {
  const it = store.getItem(id);
  if (!it) return;
  if (it.thumb) openPhotoViewer(it.thumb, `${it.code} · ${itemTitle(it, S().settings)}`);
  const full = await store.getPhoto(id);
  if (full) openPhotoViewer(full, `${it.code} · ${itemTitle(it, S().settings)}`);
}

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
  // Tocar una miniatura abre la foto grande (sin activar la fila)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-photo]');
    if (!t) return;
    e.stopPropagation();
    e.preventDefault();
    showItemPhoto(t.dataset.photo);
  }, true);
  await store.init();
}

let lastUid = null;
function renderApp() {
  const user = S().user;
  const app = $('#app');
  if (!user) return renderLogin(app);
  // Al entrar (o cambiar de usuario) se abre el Inicio
  if (user.uid !== lastUid) { ui.tab = 'inicio'; lastUid = user.uid; }
  if (!visibleTabs().some((t) => t[0] === ui.tab)) ui.tab = 'inicio';
  app.innerHTML = `
    <header class="topbar">
      <div class="brand" id="brand" role="button" tabindex="0" title="Inicio">${icon('tag')}<span id="store-name">${esc(S().settings.storeName)}</span>
        ${isDemo ? '<span class="badge warn">Modo demo</span>' : ''}</div>
      <div class="top-right"><span id="net" class="net"></span>
        <button class="bell" id="bell" aria-label="Notificaciones">${icon('bell')}<span class="bell-n" id="bell-n"></span></button><span class="who">${esc(user.name || user.username || '')}${isOwner() ? '' : ' · Ayudante'}</span></div>
    </header>
    <main id="view"></main>
    <nav class="tabbar">${visibleTabs().map(([id, label, ic]) =>
      `<button data-tab="${id}" class="${ui.tab === id ? 'active' : ''}">${icon(ic)}<span>${label}</span></button>`).join('')}
    </nav>`;
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#brand').addEventListener('click', () => switchTab('inicio'));
  $('#bell').addEventListener('click', () => openNotifications());
  updateBell();
  updateNetBadge();
  mountView();
  if (!user.name && isOwner()) askName();
  if (isOwner() && !isDemo) {
    setTimeout(() => {
      const d = daysSinceBackup();
      if (S().items.length && (d === null || d > 7)) toast('Recuerda hacer un respaldo (Ajustes › Respaldo)');
    }, 2500);
  }
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
  updateBell();
  if ($('#notif-list')) drawNotifications();
  VIEWS[ui.tab].refresh?.();
}

// =================================================================== login
async function renderLogin(app) {
  app.innerHTML = '<div class="loading">Cargando…</div>';
  const setup = await store.needsSetup();
  if (S().user) return; // entró mientras se consultaba
  const pre = store.takeLoginError?.() || '';
  app.innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="login-brand">
          <div class="wordmark">BOOHO</div>
          <div class="rule"></div>
          <h1>Bienvenido a BOOHO</h1>
          <p>Registro de ventas</p>
        </div>
        ${isDemo ? '<p class="muted small">Estás en <b>modo demo</b>: los datos se guardan solo en este dispositivo.</p>' : ''}
        ${setup ? `
          <p class="muted">Primera vez: crea tu usuario de <b>dueña</b>. Después, desde <b>Ajustes › Usuarios</b>, creas a las demás personas.</p>
          <label>Tu nombre<input id="l-name" autocomplete="name" placeholder="Ej. María"></label>
        ` : ''}
        <label>Usuario<input id="l-user" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Ej. maria"></label>
        <label>Contraseña<input id="l-pass" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}"></label>
        ${setup ? '<label>Repite la contraseña<input id="l-pass2" type="password" autocomplete="new-password"></label>' : ''}
        <p id="l-err" class="err-text">${esc(pre)}</p>
        <button id="l-go" class="btn primary lg block">${setup ? 'Crear y entrar' : 'Entrar'}</button>
      </div>
    </div>`;
  const go = async () => {
    const err = $('#l-err');
    err.textContent = '';
    const username = cleanUsername($('#l-user').value);
    const password = $('#l-pass').value;
    if (setup) {
      const name = $('#l-name').value.trim();
      if (!name) return (err.textContent = 'Escribe tu nombre.');
      const e1 = validateUsername(username) || validatePassword(password);
      if (e1) return (err.textContent = e1);
      if (password !== $('#l-pass2').value) return (err.textContent = 'Las contraseñas no coinciden.');
    } else if (!username || !password) {
      return (err.textContent = 'Escribe tu usuario y contraseña.');
    }
    const btn = $('#l-go');
    btn.disabled = true;
    try {
      if (setup) await store.setupOwner({ username, name: $('#l-name').value.trim(), password });
      else await store.login(username, password);
      // Si Firebase rechazó el perfil (desactivado, etc.) se vuelve a mostrar con el mensaje
      setTimeout(() => {
        if (!S().user && $('#l-err')) {
          const m = store.takeLoginError?.();
          if (m) $('#l-err').textContent = m;
          if ($('#l-go')) $('#l-go').disabled = false;
        }
      }, 1500);
    } catch (e) {
      err.textContent = e.message || 'No se pudo entrar.';
      btn.disabled = false;
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

// =================================================================== INICIO (Home)
function salesSum(sales) {
  sales = sales.filter((s) => !s.voided);
  let total = 0, items = 0;
  sales.forEach((s) => s.items.forEach((li) => { if (!li.returned) { total += li.finalPrice || 0; items++; } }));
  return { total: round2(total), items, tickets: sales.filter((s) => s.items.some((li) => !li.returned)).length };
}
const inDay = (iso, from, to) => { const k = dayKey(iso); return k >= from && k <= to; };

function homeAlerts() {
  const me = S().user;
  const owner = isOwner();
  const alerts = [];
  const pending = S().items.filter((i) => i.status === 'disponible' && !i.labelPrinted).length;
  if (pending) alerts.push({ act: 'labels', tone: 'warn', text: `${pending} prenda${pending === 1 ? '' : 's'} sin etiqueta impresa`, cta: 'Imprimir' });
  const pack = S().sales.filter((s) => !s.voided && s.shipping?.status === 'por_empacar').length;
  if (pack) alerts.push({ act: 'envios', tone: 'warn', text: `${pack} envío${pack === 1 ? '' : 's'} por empacar`, cta: 'Ver' });
  const soc = pendingSocial().length;
  if (soc) alerts.push({ act: 'notif', tone: 'warn', text: `${soc} prenda${soc === 1 ? '' : 's'} vendida${soc === 1 ? '' : 's'} por marcar en tus redes`, cta: 'Ver' });
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yk = dayKey(y);
  const ySales = S().sales.filter((s) => dayKey(s.date) === yk && (owner || s.sellerUid === me.uid));
  const yCorte = S().cortes.some((k) => k.day === yk && (owner || k.createdByUid === me.uid));
  if (ySales.length && !yCorte) alerts.push({ act: 'corte-ayer', tone: 'warn', text: 'No se hizo el corte de caja de ayer', cta: 'Hacer corte' });
  if (owner) {
    const d = daysSinceBackup();
    if (S().items.length && (d === null || d > 7)) {
      alerts.push({ act: 'backup', tone: 'warn', text: d === null ? 'Todavía no has hecho un respaldo' : `Hace ${d} días que no haces un respaldo`, cta: 'Respaldar' });
    } else if (hasPhotos()) {
      const f = daysSinceFullBackup();
      if (f === null || f > 30) {
        alerts.push({ act: 'backup', tone: 'info', text: f === null ? 'Haz tu primer respaldo completo (con fotos)' : `Hace ${f} días sin respaldo completo (con fotos)`, cta: 'Respaldar' });
      }
    }
    const old = S().items.filter((i) => i.status === 'disponible' && Date.now() - new Date(i.createdAt).getTime() > 60 * 86400000).length;
    if (old) alerts.push({ act: 'old', tone: 'info', text: `${old} prenda${old === 1 ? '' : 's'} con más de 60 días sin venderse`, cta: 'Ver' });
  }
  return alerts;
}

VIEWS.inicio = {
  mount(v) {
    v.innerHTML = '<div id="home"></div>';
    $('#home').addEventListener('click', (e) => this.onClick(e));
  },
  onClick(e) {
    const a = e.target.closest('[data-act]');
    if (!a) {
      const s = e.target.closest('[data-sale]');
      if (s) openSaleDetail(s.dataset.sale);
      return;
    }
    const act = a.dataset.act;
    if (act === 'vender') switchTab('vender');
    else if (act === 'nueva') { switchTab('inventario'); openItemForm(); }
    else if (act === 'labels') openLabelsModal();
    else if (act === 'corte') openCorte();
    else if (act === 'corte-ayer') { const y = new Date(); y.setDate(y.getDate() - 1); openCorte(dayKey(y)); }
    else if (act === 'backup') switchTab('ajustes');
    else if (act === 'old') { ui.rep.preset = 'mes'; switchTab('reportes'); setTimeout(() => $$('#r-body h3').find((h) => h.textContent.startsWith('Más tiempo'))?.scrollIntoView({ block: 'start' }), 100); }
    else if (act === 'ventas') switchTab('ventas');
    else if (act === 'notif') openNotifications();
    else if (act === 'envios') openShipments();
    else if (act === 'goal') openGoal();
    else if (act === 'reportes') switchTab('reportes');
  },
  refresh() {
    const el = $('#home');
    if (!el) return;
    const me = S().user;
    const owner = isOwner();
    const now = new Date();
    const today = dayKey(now);
    const hour = now.getHours();
    const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const mine = (s) => owner || s.sellerUid === me.uid;
    const sales = S().sales.filter(mine);

    // --- números
    let kpis;
    if (owner) {
      const monthFrom = dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
      const lastFrom = dayKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastTo = dayKey(new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), lastMonthEnd.getDate())));
      const d = computeReport(S(), today, today).kpis;
      const m = computeReport(S(), monthFrom, today).kpis;
      const l = computeReport(S(), lastFrom, lastTo).kpis;
      const change = l.revenue ? Math.round(((m.revenue - l.revenue) / l.revenue) * 100) : null;
      const monthName = now.toLocaleDateString('es-GT', { month: 'long' });
      kpis = `
        ${homeKpi('Ventas de hoy', money(d.revenue), `${d.items} prenda${d.items === 1 ? '' : 's'} · ${d.tickets} ticket${d.tickets === 1 ? '' : 's'}`)}
        ${homeKpi('Ganancia de hoy', money(d.profit), d.revenue ? `Margen ${Math.round(d.margin * 100)}%` : '—')}
        ${homeKpi(`Ventas de ${monthName}`, money(m.revenue),
          change === null ? `${m.items} prendas` : `<span class="${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%</span> vs. mismo periodo del mes pasado`)}
        ${homeKpi(`Ganancia de ${monthName}`, money(m.profit), `${m.items} prendas · ${m.tickets} tickets`)}`;
    } else {
      const d = salesSum(sales.filter((s) => inDay(s.date, today, today)));
      const w0 = new Date(now); w0.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const w = salesSum(sales.filter((s) => inDay(s.date, dayKey(w0), today)));
      kpis = `
        ${homeKpi('Mis ventas de hoy', money(d.total), `${d.items} prenda${d.items === 1 ? '' : 's'} · ${d.tickets} ticket${d.tickets === 1 ? '' : 's'}`)}
        ${homeKpi('Mis ventas de la semana', money(w.total), `${w.items} prendas · ${w.tickets} tickets`)}`;
    }

    // --- avisos
    const alerts = homeAlerts();
    const alertsHtml = alerts.length
      ? alerts.map((a) => `<div class="alert ${a.tone}"><span class="grow">${esc(a.text)}</span><button class="btn small" data-act="${a.act}">${esc(a.cta)}</button></div>`).join('')
      : '<div class="alert ok"><span class="grow">✓ Todo al día</span></div>';

    // --- últimas ventas
    const recent = sales.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const recentHtml = recent.length ? recent.map((s) => {
      const n = saleNet(s);
      return `<div class="row-item tap" data-sale="${esc(s.id)}">
        <div class="time">${dayKey(s.date) === today ? new Date(s.date).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }) : fmtDate(s.date).slice(0, 6)}</div>
        <div class="grow"><div>${n.count} prenda${n.count === 1 ? '' : 's'}${s.customerName ? ' · ' + esc(s.customerName) : ''}</div>
          <small class="muted">${esc(s.paymentMethod)} · ${esc(s.channel)}${owner ? ' · ' + esc(s.sellerName || '') : ''}</small></div>
        <div class="price">${money(n.total)}</div></div>`;
    }).join('') : '<p class="empty">Todavía no hay ventas.</p>';

    // --- lo más vendido de la semana (dueña)
    let topHtml = '';
    if (owner) {
      const w0 = new Date(now); w0.setDate(now.getDate() - 6);
      const r = computeReport(S(), dayKey(w0), today);
      topHtml = donutChart('Lo más vendido (últimos 7 días)', 'Prendas vendidas por subcategoría',
        groupCount(r.lines, 'sub', (l) => [l.category, l.subcategory], (l) => l.finalPrice),
        'vendidas', 'en ventas', 'Sin ventas en los últimos 7 días.');
    }

    el.innerHTML = `
      <div class="home-hello">
        <h1>${hello}, ${esc((me.name || '').split(' ')[0])}</h1>
        <p class="muted">${(() => { const t = now.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); })()}</p>
      </div>
      <div class="home-kpis ${owner ? '' : 'two'}">${kpis}</div>
      ${owner ? goalCardHtml() : ''}
      <div class="quick">
        <button class="quick-btn primary" data-act="vender">${icon('sell')}<span>Vender</span></button>
        <button class="quick-btn" data-act="nueva">${icon('plus')}<span>Nueva prenda</span></button>
        ${owner ? `<button class="quick-btn" data-act="reportes">${icon('chart')}<span>Reportes</span></button>`
          : `<button class="quick-btn" data-act="ventas">${icon('receipt')}<span>Mis ventas</span></button>`}
        <button class="quick-btn" data-act="corte">${icon('receipt')}<span>Corte de caja</span></button>
      </div>
      <div class="home-grid">
        <section class="card"><h3>Avisos</h3><div class="alerts">${alertsHtml}</div></section>
        <section class="card">
          <div class="card-head"><h3>${owner ? 'Últimas ventas' : 'Mis últimas ventas'}</h3><button class="btn small ghost" data-act="ventas">Ver todas</button></div>
          <div class="list">${recentHtml}</div>
        </section>
      </div>
      ${topHtml}`;
    if (owner) bindChartTips(el);
  },
};

function homeKpi(label, value, sub) {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-val">${value}</div><div class="kpi-sub">${sub}</div></div>`;
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
            <label id="c-auth-wrap" class="auth-field">
              <span id="c-auth-label"></span>
              <input id="c-auth" value="${esc(ui.auth)}" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Obligatorio">
            </label>
            <div class="field-label">Canal de venta</div>
            <div class="chips" id="c-chan">${st.channels.map((p) => `<button class="chip ${p === ui.channel ? 'on' : ''}" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>
            <div class="grid2">
              <label><span id="c-name-lbl">Cliente (opcional)</span><input id="c-name" value="${esc(ui.customer.name)}" autocomplete="off"></label>
              <label><span id="c-phone-lbl">Teléfono (opcional)</span><input id="c-phone" type="tel" inputmode="tel" value="${esc(ui.customer.phone)}" autocomplete="off"></label>
            </div>
            <label class="check ship-toggle"><input type="checkbox" id="c-ship" ${ui.ship.on ? 'checked' : ''}> Es un envío (paquetería o a domicilio)</label>
            <div id="c-ship-box" class="ship-box">
              <label>Dirección de entrega *<textarea id="c-ship-addr" rows="2" placeholder="Dirección, zona, municipio, departamento">${esc(ui.ship.address)}</textarea></label>
              <div class="grid2">
                <label>Paquetería<select id="c-ship-carrier">${(st.carriers || []).map((c) => `<option ${c === ui.ship.carrier ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
                <label>Envío que paga la clienta (Q)<input id="c-ship-fee" inputmode="decimal" value="${ui.ship.fee || ''}" placeholder="0.00"></label>
              </div>
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
    // Número de autorización: se pide en todo lo que no sea efectivo
    const syncAuth = () => {
      const need = needsAuth(ui.payment);
      $('#c-auth-wrap').style.display = need ? '' : 'none';
      $('#c-auth-label').textContent = authLabel(ui.payment);
    };
    $('#c-pay').addEventListener('click', syncAuth);
    $('#c-auth').addEventListener('input', (e) => { ui.auth = e.target.value; e.target.classList.remove('invalid'); });
    syncAuth();
    $('#c-name').addEventListener('input', (e) => (ui.customer.name = e.target.value));
    $('#c-phone').addEventListener('input', (e) => (ui.customer.phone = e.target.value));
    $('#c-pay-btn').addEventListener('click', () => checkout());
    const syncShip = () => {
      $('#c-ship-box').style.display = ui.ship.on ? '' : 'none';
      $('#c-name-lbl').textContent = ui.ship.on ? 'Cliente *' : 'Cliente (opcional)';
      $('#c-phone-lbl').textContent = ui.ship.on ? 'Teléfono *' : 'Teléfono (opcional)';
    };
    $('#c-ship').addEventListener('change', (e) => { ui.ship.on = e.target.checked; syncShip(); this.refreshTotals(); });
    $('#c-ship-addr').addEventListener('input', (e) => (ui.ship.address = e.target.value));
    $('#c-ship-carrier').addEventListener('change', (e) => (ui.ship.carrier = e.target.value));
    $('#c-ship-fee').addEventListener('input', (e) => { ui.ship.fee = parseNum(e.target.value); this.refreshTotals(); });
    if (!ui.ship.carrier) ui.ship.carrier = (st.carriers || [])[0] || '';
    syncShip();
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
            ${thumbHtml(it)}
            <div class="grow"><div><span class="code">${esc(it.code)}</span> ${esc(itemTitle(it, st))}</div>
              <small class="muted">${itemMeta(it) ? esc(itemMeta(it)) + ' · ' : ''}Etiqueta ${money(it.price)}</small></div>
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
          ${thumbHtml(it)}
          <div class="grow"><div><span class="code">${esc(it.code)}</span> ${esc(itemTitle(it, st))}</div>
            <small class="muted">${esc(catName(st, it.categoryId))}${it.subcategory ? ' › ' + esc(it.subcategory) : ''}${itemMeta(it) ? ' · ' + esc(itemMeta(it)) : ''}</small></div>
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
      ${ui.ship.on && ui.ship.fee ? `<div class="muted"><span>Envío</span><span>${money(ui.ship.fee)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${money(t.total + (ui.ship.on ? ui.ship.fee || 0 : 0))}</span></div>`;
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
  ui.auth = '';
  ui.ship = { on: false, address: '', carrier: ui.ship?.carrier || '', fee: 0 };
}

/** Todo lo que no sea efectivo pide número de autorización / referencia. */
const needsAuth = (method) => !!method && !normalize(method).includes('efectivo');
function authLabel(method) {
  const n = normalize(method);
  if (n.includes('transfer') || n.includes('deposit')) return `Número de referencia de la ${n.includes('deposit') ? 'boleta' : 'transferencia'} *`;
  if (n.includes('tarjeta')) return 'Número de autorización (voucher) *';
  return `Número de autorización (${method}) *`;
}

async function checkout() {
  if (!ui.cart.length) return toast('Agrega al menos una prenda', 'err');
  if (ui.cart.some((c) => c.finalPrice < 0)) return toast('Revisa los precios', 'err');
  if (ui.ship.on) {
    if (!ui.ship.address.trim()) return toast('Escribe la dirección de entrega', 'err');
    if (!ui.customer.name.trim() || !ui.customer.phone.trim()) return toast('Para un envío escribe el nombre y teléfono de la clienta', 'err');
  }
  const auth = needsAuth(ui.payment) ? String(ui.auth || '').trim().replace(/\s+/g, '').toUpperCase() : '';
  if (needsAuth(ui.payment)) {
    if (!auth) {
      const inp = $('#c-auth');
      inp?.classList.add('invalid');
      inp?.focus();
      return toast(`Escribe el número de autorización de ${ui.payment}`, 'err');
    }
    // Avisa si ese número ya se usó en otra venta (posible venta repetida)
    const dup = S().sales.find((s) => !s.voided && s.authCode && s.authCode === auth && s.paymentMethod === ui.payment);
    if (dup && !(await confirmDialog(`El número <b>${esc(auth)}</b> ya está en la venta <b>${esc(dup.folio)}</b> del ${fmtDateTime(dup.date)}.<br>¿Seguro que es otra venta?`, { okText: 'Sí, registrar', cancelText: 'Revisar' }))) return;
  }
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
    `<b>Cobrar ${money(t.total + (ui.ship.on ? ui.ship.fee || 0 : 0))}</b>${ui.ship.on && ui.ship.fee ? ` <span class="small">(incluye envío ${money(ui.ship.fee)})</span>` : ''}<br>${lines.length} prenda${lines.length === 1 ? '' : 's'} · ${esc(ui.payment)} · ${esc(ui.channel)}${auth ? `<br>Autorización: <b>${esc(auth)}</b>` : ''}${ui.customer.name ? '<br>Cliente: ' + esc(ui.customer.name) : ''}`,
    { okText: 'Confirmar venta' }
  );
  if (!ok) return;
  const now = new Date();
  const folio = `T${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}-${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
  const sale = {
    date: now.toISOString(), folio, items: lines, subtotal: t.tagTotal, discount: round2(t.tagTotal - t.total),
    total: t.total, paymentMethod: ui.payment, channel: ui.channel, authCode: auth,
    customerName: ui.customer.name.trim(), customerPhone: ui.customer.phone.trim(),
    sellerUid: S().user.uid, sellerName: S().user.name || S().user.username || '',
  };
  if (ui.ship.on) {
    sale.shipping = {
      address: ui.ship.address.trim(), carrier: ui.ship.carrier, fee: round2(ui.ship.fee || 0),
      status: 'por_empacar', tracking: '', createdAt: now.toISOString(),
    };
  }
  // Redes donde estaban publicadas las prendas vendidas
  const toUnpublish = new Map();
  lines.forEach((l) => (store.getItem(l.itemId)?.publishedOn || []).forEach((p) => toUnpublish.set(p, (toUnpublish.get(p) || 0) + 1)));
  try {
    await store.createSale(sale);
  } catch (e) {
    return toast(e.message, 'err');
  }
  resetCart();
  mountView();
  updateBell();
  openModal(`
    <div class="modal-body center">
      <div class="big-check">✓</div>
      <h2>Venta registrada</h2>
      <p class="muted">Ticket ${esc(folio)}</p>
      <p class="big-money">${money(sale.total + (sale.shipping?.fee || 0))}</p>
      ${sale.shipping ? `<div class="alert info social-remind">${icon('box')}<span class="grow">El envío quedó en <b>Ventas › Envíos › Por empacar</b>.</span></div>` : ''}
      ${toUnpublish.size ? `<div class="alert info social-remind">${icon('bell')}<span class="grow">Recuerda marcar como vendida en
        <b>${[...toUnpublish.entries()].map(([p, n]) => `${esc(p)}${lines.length > 1 ? ` (${n})` : ''}`).join(' y ')}</b>.
        Te queda en la campanita de arriba.</span></div>` : ''}
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
        ${isOwner() ? `<button class="btn lg" id="inv-bulk">% Rebajas</button>` : ''}
        <button class="btn lg" id="inv-labels">${icon('tag')} Etiquetas <span id="inv-pending" class="badge"></span></button>
      </div>
      <div class="filters">
        <input id="inv-q" type="search" placeholder="Buscar código, descripción, marca…" value="${esc(ui.inv.q)}">
        <select id="inv-status">
          <option value="disponible">Disponibles</option>
          ${platforms().length ? '<option value="sinpub">Disponibles sin publicar</option>' : ''}
          <option value="vendido">Vendidas</option><option value="todas">Todas</option>
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
    $('#inv-bulk')?.addEventListener('click', () => openBulkPrice());
    $('#inv-list').addEventListener('click', (e) => {
      const pb = e.target.closest('[data-pub]');
      if (pb) {
        // Marcar / desmarcar publicada sin abrir la prenda
        const it = store.getItem(pb.dataset.pub);
        const on = new Set(it.publishedOn || []);
        const p = pb.dataset.plat;
        on.has(p) ? on.delete(p) : on.add(p);
        store.updateItem(it.id, { publishedOn: [...on] });
        toast(`${it.code}: ${on.has(p) ? 'publicada' : 'sin publicar'} en ${p}`);
        pb.blur(); // si el botón queda enfocado, la lista no se redibuja
        setTimeout(() => this.refresh(true), 30);
        return;
      }
      const r = e.target.closest('[data-item]');
      if (r) openItemForm(store.getItem(r.dataset.item));
    });
  },
  refresh(force) {
    const st = S().settings;
    const q = normalize(ui.inv.q);
    const terms = q ? q.split(/\s+/) : [];
    const list = S().items
      .filter((i) => ui.inv.status === 'todas'
        || (ui.inv.status === 'sinpub' ? i.status === 'disponible' && platforms().some((p) => !(i.publishedOn || []).includes(p)) : i.status === ui.inv.status))
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
        ${thumbHtml(it)}
        <div class="grow"><div><span class="code">${esc(it.code)}</span> ${esc(itemTitle(it, st))}</div>
          <small class="muted">${esc(catName(st, it.categoryId))}${it.subcategory ? ' › ' + esc(it.subcategory) : ''}${itemMeta(it) ? ' · ' + esc(itemMeta(it)) : ''}</small></div>
        ${it.status === 'vendido' ? `<span class="badge">Vendida ${fmtDate(it.soldAt)}</span>` : (!it.labelPrinted ? '<span class="badge warn">Sin etiqueta</span>' : '')}
        ${it.status === 'disponible' ? `<span class="pubs">${pubBadges(it)}</span>` : ''}
        <div class="price">${it.originalPrice && it.status === 'disponible' ? `<s class="muted small">${money(it.originalPrice)}</s> ` : ''}${money(it.price)}</div>
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
      <div class="photo-pick">
        <div class="photo-box" id="f-photo"></div>
        <div class="photo-btns">
          <label class="btn">${icon('camera')} Tomar foto<input type="file" accept="image/*" capture="environment" class="file-hidden" id="f-cam"></label>
          <label class="btn">Elegir de galería<input type="file" accept="image/*" class="file-hidden" id="f-gal"></label>
          <button class="btn ghost danger small" id="f-photo-rm" type="button">Quitar foto</button>
          <p class="muted small" id="f-photo-msg"></p>
        </div>
      </div>
      ${platforms().length ? `
        <div class="field-label">¿Dónde está publicada?</div>
        <div class="chips" id="f-pub">${platforms().map((p) => `<button type="button" class="chip pub-chip ${(d.publishedOn || []).includes(p) ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
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
      <div id="f-size-chips" class="size-chips"></div>
      <div class="grid2">
        <label>Estado<select id="f-cond"><option value=""></option>${opts(CONDITIONS, d.condition)}</select></label>
        <label>Género<select id="f-gender"><option value=""></option>${opts(GENDERS, d.gender)}</select></label>
      </div>
      <div class="grid2">
        ${isOwner() ? `<label>Costo (Q)<input id="f-cost" inputmode="decimal" value="${d.cost ?? ''}" placeholder="0.00"></label>` : ''}
        <label>Precio de venta (Q) *<input id="f-price" inputmode="decimal" value="${d.price ?? ''}" placeholder="0.00"></label>
      </div>
      ${!isNew && !sold ? '<p class="muted small">Si cambias la categoría, el código se queda igual.</p>' : ''}
      <datalist id="sizes">${[...new Set([...PANTS_SIZES, ...SIZE_SUGGESTIONS])].map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <datalist id="brands">${[...new Set(S().items.map((i) => i.brand).filter(Boolean))].sort().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <p id="f-err" class="err-text"></p>
    </div>
    <div class="modal-actions">
      ${!isNew && !sold && isOwner() ? `<button class="btn danger ghost" id="f-del">Eliminar</button>` : ''}
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

  // Tallas de pantalón: botones "28 (6-8)" según la categoría
  const sizeInput = m.querySelector('#f-size');
  const drawSizes = () => {
    const box = m.querySelector('#f-size-chips');
    const pants = usesPantsSizes(catById(st, m.querySelector('#f-cat').value));
    box.style.display = pants ? '' : 'none';
    if (!pants) return;
    const cur = sizeInput.value.trim();
    box.innerHTML = `<div class="field-label">Talla de pantalón · cintura (talla)</div>
      <div class="chips">${PANTS_SIZES.map((sz) => `<button type="button" class="chip size-chip ${sz === cur ? 'on' : ''}" data-size="${esc(sz)}">${esc(sz)}</button>`).join('')}</div>`;
  };
  m.querySelector('#f-size-chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-size]');
    if (!c) return;
    sizeInput.value = c.dataset.size;
    drawSizes();
  });
  sizeInput.addEventListener('input', drawSizes);
  drawSizes();
  m.querySelector('#f-cat').addEventListener('change', () => { d.subcategory = ''; fillSubs(); drawSizes(); });

  m.querySelector('#f-pub')?.addEventListener('click', (e) => {
    const c = e.target.closest('[data-p]');
    if (c) c.classList.toggle('on');
  });

  // --- foto
  const photo = { thumb: item?.thumb || '', full: null, changed: false, removed: false };
  let skipPhotoWarned = false;
  const drawPhoto = () => {
    const box = m.querySelector('#f-photo');
    const src = photo.full || photo.thumb;
    box.innerHTML = src ? `<img src="${esc(src)}" alt="">` : `<div class="photo-empty">${icon('camera')}<span>Sin foto</span></div>`;
    box.classList.toggle('has', !!src);
    m.querySelector('#f-photo-rm').style.display = src ? '' : 'none';
  };
  drawPhoto();
  if (item?.thumb) store.getPhoto(item.id).then((f) => { if (f && !photo.changed && !photo.removed) { photo.full = f; drawPhoto(); } });
  const onFile = async (input) => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const msg = m.querySelector('#f-photo-msg');
    msg.textContent = 'Procesando foto…';
    try {
      Object.assign(photo, await fileToPhotos(f), { changed: true, removed: false });
      msg.textContent = '';
      m.querySelector('#f-err').textContent = '';
      drawPhoto();
    } catch (e) {
      msg.textContent = e.message;
    }
  };
  m.querySelector('#f-cam').addEventListener('change', (e) => onFile(e.target));
  m.querySelector('#f-gal').addEventListener('change', (e) => onFile(e.target));
  m.querySelector('#f-photo-rm').addEventListener('click', () => {
    Object.assign(photo, { thumb: '', full: null, changed: false, removed: true });
    drawPhoto();
  });
  m.querySelector('#f-photo').addEventListener('click', () => {
    const src = photo.full || photo.thumb;
    if (src) openPhotoViewer(src, item ? item.code : '');
  });

  m.querySelector('#f-save').addEventListener('click', async (ev) => {
    const val = (id) => m.querySelector(id).value.trim();
    const data = {
      categoryId: val('#f-cat'), subcategory: val('#f-sub'), description: val('#f-desc'),
      size: val('#f-size'), brand: val('#f-brand'), color: val('#f-color'), condition: val('#f-cond'),
      gender: val('#f-gender'), price: round2(parseNum(val('#f-price'))),
    };
    if (m.querySelector('#f-pub')) data.publishedOn = $$('#f-pub .chip.on', m).map((c) => c.dataset.p);
    if (isOwner()) data.cost = round2(parseNum(val('#f-cost')));
    else if (isNew) data.cost = 0;
    const err = m.querySelector('#f-err');
    if (!data.categoryId) return (err.textContent = 'Elige una categoría.');
    if (!(data.price > 0)) return (err.textContent = 'Escribe el precio de venta.');
    if (isNew && !photo.thumb && !skipPhotoWarned) {
      skipPhotoWarned = true;
      return (err.textContent = 'Falta la foto: toca "Tomar foto" o "Elegir de galería". Si quieres guardarla sin foto, toca Guardar otra vez.');
    }
    if (photo.changed) data.thumb = photo.thumb;
    if (photo.removed) data.thumb = '';
    ev.target.disabled = true;
    try {
      if (isNew) {
        const created = await store.createItem(data);
        store.log('prenda_nueva', `Registró ${created.code} (${itemTitle(created, st)}) a ${money(created.price)}`, created.id);
        if (photo.changed && photo.full) store.savePhoto(created.id, photo.full);
        ui.itemDefaults = { categoryId: data.categoryId, subcategory: data.subcategory, gender: data.gender, condition: data.condition };
        showCreated(created);
      } else {
        if (sold) delete data.price; // no cambiar el precio de algo ya vendido
        const before = { ...item }; // cómo estaba, para el historial
        await store.updateItem(item.id, data);
        {
          const diffs = [];
          if (data.price !== undefined && data.price !== before.price) diffs.push(`precio ${money(before.price)} → ${money(data.price)}`);
          if (data.cost !== undefined && data.cost !== (before.cost || 0)) diffs.push(`costo ${money(before.cost || 0)} → ${money(data.cost)}`);
          if (data.categoryId !== before.categoryId) diffs.push(`categoría ${catName(st, before.categoryId)} → ${catName(st, data.categoryId)}`);
          ['description', 'size', 'brand', 'color', 'condition', 'gender', 'subcategory'].forEach((k) => {
            if ((data[k] || '') !== (before[k] || '')) diffs.push(k === 'description' ? 'descripción' : { size: 'talla', brand: 'marca', color: 'color', condition: 'estado', gender: 'género', subcategory: 'subcategoría' }[k]);
          });
          if (photo.changed) diffs.push('foto');
          if (photo.removed) diffs.push('quitó la foto');
          if (diffs.length) store.log(diffs.some((x) => x.startsWith('precio')) ? 'precio' : 'prenda_editada', `Editó ${item.code}: ${diffs.join(', ')}`, item.id);
        }
        if (photo.changed && photo.full) store.savePhoto(item.id, photo.full);
        else if (photo.removed && item.thumb) store.deletePhoto(item.id);
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
      store.log('prenda_eliminada', `Eliminó ${item.code} (${itemTitle(item, st)}, ${money(item.price)})`, item.id);
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
      <div class="created-media">
        ${item.thumb ? `<img class="created-photo" src="${esc(item.thumb)}" alt="">` : ''}
        <div class="created-qr">${qrSvg(item.code)}</div>
      </div>
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
    printLabels(entries, ui.labelFormat, st.storeName, { pause: () => store.pauseSync(), resume: () => store.resumeSync() });
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
  if (s.voided) return { count: 0, total: 0, returned: 0, voided: true };
  const kept = s.items.filter((li) => !li.returned);
  return { count: kept.length, total: round2(kept.reduce((a, li) => a + li.finalPrice, 0)), returned: s.items.length - kept.length };
};

VIEWS.ventas = {
  mount(v) {
    v.innerHTML = `
      <div class="toolbar"><button class="btn primary lg" id="s-corte">${icon('receipt')} Corte de caja</button>
        <button class="btn lg" id="s-envios">${icon('box')} Envíos <span id="s-envios-n" class="badge"></span></button></div>
      <div class="filters"><input id="s-q" type="search" placeholder="Buscar ticket, cliente, código, autorización…" value="${esc(ui.salesQ)}"></div>
      <div id="s-list"></div>`;
    $('#s-corte').addEventListener('click', () => openCorte());
    $('#s-envios').addEventListener('click', () => openShipments());
    $('#s-q').addEventListener('input', (e) => { ui.salesQ = e.target.value; this.refresh(true); });
    $('#s-list').addEventListener('click', (e) => {
      const r = e.target.closest('[data-sale]');
      if (r) openSaleDetail(r.dataset.sale);
    });
  },
  refresh(force) {
    const pend = shipmentsBy('por_empacar').length + shipmentsBy('enviado').length;
    const en = $('#s-envios-n');
    if (en) { en.textContent = pend ? `${pend} pendiente${pend === 1 ? '' : 's'}` : ''; en.style.display = pend ? '' : 'none'; }
    const q = normalize(ui.salesQ);
    const list = S().sales
      .filter((s) => !q || normalize([s.folio, s.authCode, s.customerName, s.customerPhone, s.paymentMethod, s.channel, s.sellerName, ...s.items.map((i) => i.code + ' ' + i.title)].join(' ')).includes(q))
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
            <small class="muted">${esc(s.folio)} · ${esc(s.paymentMethod)}${s.authCode ? ` #${esc(s.authCode)}` : ''} · ${esc(s.channel)} · ${esc(s.sellerName || '')}</small></div>
          ${s.voided ? '<span class="badge bad">Anulada</span>' : ''}
          ${s.shipping ? `<span class="badge ${s.shipping.status === 'entregado' ? 'ok' : 'warn'}">${SHIP_STATUS[s.shipping.status]}</span>` : ''}
          ${n.returned ? `<span class="badge warn">${n.returned} devuelta${n.returned === 1 ? '' : 's'}</span>` : ''}
          <div class="price">${s.voided ? `<s class="muted">${money(s.total)}</s>` : money(n.total)}</div>
        </div>`;
      }).join('')}</div>`).join('')
      : `<p class="empty">${S().sales.length ? 'Sin resultados.' : 'Aún no hay ventas registradas.'}</p>`;
    const el = $('#s-list');
    if (force) el.innerHTML = html; else safeSet(el, html);
  },
};

const SHIP_STATUS = { por_empacar: 'Por empacar', enviado: 'Enviado', entregado: 'Entregado' };

function openSaleDetail(id) {
  const s = S().sales.find((x) => x.id === id);
  if (!s) return;
  const n = saleNet(s);
  const sh = s.shipping;
  const m = openModal(`
    <div class="modal-head"><h2>Ticket ${esc(s.folio)}</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body">
      ${s.voided ? `<div class="alert bad-alert"><span class="grow"><b>Venta anulada</b> por ${esc(s.voidedBy || '')} el ${fmtDateTime(s.voidedAt)}${s.voidReason ? `<br>Motivo: ${esc(s.voidReason)}` : ''}</span></div>` : ''}
      <p class="muted">${fmtDateTime(s.date)} · vendió ${esc(s.sellerName || '')}${s.editedAt ? ` · corregida por ${esc(s.editedBy || '')} el ${fmtDateTime(s.editedAt)}` : ''}</p>
      <div class="kv"><span>Forma de pago</span><b>${esc(s.paymentMethod)}</b>
        ${s.authCode ? `<span>Autorización</span><b class="mono">${esc(s.authCode)}</b>` : ''}
        <span>Canal</span><b>${esc(s.channel)}</b>
        ${s.customerName ? `<span>Cliente</span><b>${esc(s.customerName)}</b>` : ''}
        ${s.customerPhone ? `<span>Teléfono</span><b>${esc(s.customerPhone)}</b>` : ''}</div>
      ${sh ? `<div class="ship-info">
        <div><b>Envío</b> · <span class="badge ${sh.status === 'entregado' ? 'ok' : 'warn'}">${SHIP_STATUS[sh.status] || ''}</span></div>
        <div class="muted small">${esc(sh.address || '')}</div>
        <div class="small">${esc(sh.carrier || '')}${sh.tracking ? ` · Guía <b class="mono">${esc(sh.tracking)}</b>` : ''}${sh.fee ? ` · cobrado ${money(sh.fee)}` : ''}</div>
      </div>` : ''}
      <div class="list">${s.items.map((li) => `
        <div class="row-item ${li.returned || s.voided ? 'returned' : ''}">
          <div class="grow"><div><span class="code">${esc(li.code)}</span> ${esc(li.title)}</div>
            <small class="muted">Etiqueta ${money(li.tagPrice)}${li.returned ? ` · Devuelta ${fmtDate(li.returnedAt)}` : ''}</small></div>
          <div class="price">${money(li.finalPrice)}</div>
          ${s.voided ? '' : li.returned ? '<span class="badge warn">Devuelta</span>' : `<button class="btn small ghost danger" data-ret="${li.itemId}">Devolución</button>`}
        </div>`).join('')}</div>
      <div class="totals">
        ${s.discount > 0 ? `<div class="muted"><span>Descuento</span><span>−${money(s.discount)}</span></div>` : ''}
        ${sh?.fee ? `<div class="muted"><span>Envío cobrado</span><span>${money(sh.fee)}</span></div>` : ''}
        <div class="grand"><span>Total${n.returned ? ' (sin devoluciones)' : ''}</span><span>${s.voided ? `<s>${money(s.total + (sh?.fee || 0))}</s> Q0.00` : money(n.total + (sh?.fee || 0))}</span></div>
      </div>
    </div>
    ${isOwner() && !s.voided ? `<div class="modal-actions">
      <button class="btn danger ghost" id="sd-void">Anular venta</button>
      <span class="grow"></span>
      <button class="btn" id="sd-edit">Corregir venta</button>
    </div>` : ''}`, { wide: true });
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ret]');
    if (!b) return;
    const li = s.items.find((x) => x.itemId === b.dataset.ret);
    if (await confirmDialog(`¿Registrar devolución de <b>${esc(li.code)}</b> por ${money(li.finalPrice)}?<br>La prenda vuelve a estar disponible en el inventario.`, { okText: 'Registrar devolución', danger: true })) {
      await store.returnItem(s.id, li.itemId);
      store.log('devolucion', `Devolución de ${li.code} (${li.title}) por ${money(li.finalPrice)} · ticket ${s.folio}`, s.id);
      toast('Devolución registrada');
      setTimeout(() => openSaleDetail(s.id), 50);
    }
  });
  m.querySelector('#sd-edit')?.addEventListener('click', () => openSaleEdit(s.id));
  m.querySelector('#sd-void')?.addEventListener('click', () => openVoidSale(s.id));
}

/** Corregir una venta (solo dueña): forma de pago, autorización, canal, cliente, precios y envío. */
function openSaleEdit(id) {
  const s = S().sales.find((x) => x.id === id);
  if (!s) return;
  const st = S().settings;
  const d = { pay: s.paymentMethod, auth: s.authCode || '', channel: s.channel };
  const opt = (arr, v) => [...new Set([...arr, v].filter(Boolean))].map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const m = openModal(`
    <div class="modal-head"><h2>Corregir ticket ${esc(s.folio)}</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body form">
      <div class="grid2">
        <label>Forma de pago<select id="se-pay">${opt(st.paymentMethods, s.paymentMethod)}</select></label>
        <label id="se-auth-wrap">Número de autorización<input id="se-auth" value="${esc(d.auth)}" autocapitalize="characters" autocorrect="off" spellcheck="false"></label>
      </div>
      <div class="grid2">
        <label>Canal<select id="se-chan">${opt(st.channels, s.channel)}</select></label>
        <span></span>
      </div>
      <div class="grid2">
        <label>Cliente<input id="se-name" value="${esc(s.customerName || '')}"></label>
        <label>Teléfono<input id="se-phone" type="tel" value="${esc(s.customerPhone || '')}"></label>
      </div>
      ${s.shipping ? `<div class="grid2">
        <label>Dirección de envío<input id="se-addr" value="${esc(s.shipping.address || '')}"></label>
        <label>Envío cobrado (Q)<input id="se-fee" inputmode="decimal" value="${s.shipping.fee || ''}"></label>
      </div>` : ''}
      <div class="field-label">Precio final de cada prenda</div>
      <div class="list">${s.items.map((li, i) => `
        <div class="row-item ${li.returned ? 'returned' : ''}">
          <div class="grow"><span class="code">${esc(li.code)}</span> ${esc(li.title)}<small class="muted">Etiqueta ${money(li.tagPrice)}${li.returned ? ' · devuelta' : ''}</small></div>
          <input class="price-in" inputmode="decimal" data-i="${i}" value="${li.finalPrice}" ${li.returned ? 'disabled' : ''}>
        </div>`).join('')}</div>
      <p id="se-err" class="err-text"></p>
    </div>
    <div class="modal-actions"><span class="grow"></span><button class="btn" data-close>Cancelar</button>
      <button class="btn primary" id="se-save">Guardar corrección</button></div>`, { wide: true });
  const syncAuth = () => { m.querySelector('#se-auth-wrap').style.visibility = needsAuth(m.querySelector('#se-pay').value) ? 'visible' : 'hidden'; };
  m.querySelector('#se-pay').addEventListener('change', syncAuth);
  syncAuth();
  m.querySelector('#se-save').addEventListener('click', async () => {
    const err = m.querySelector('#se-err');
    const pay = m.querySelector('#se-pay').value;
    const auth = needsAuth(pay) ? m.querySelector('#se-auth').value.trim().replace(/\s+/g, '').toUpperCase() : '';
    if (needsAuth(pay) && !auth) return (err.textContent = `Escribe el número de autorización de ${pay}.`);
    const items = s.items.map((li, i) => {
      const inp = m.querySelector(`[data-i="${i}"]`);
      return li.returned ? li : { ...li, finalPrice: round2(parseNum(inp.value)) };
    });
    if (items.some((li) => li.finalPrice < 0)) return (err.textContent = 'Revisa los precios.');
    const total = round2(items.reduce((a, li) => a + li.finalPrice, 0));
    const patch = {
      paymentMethod: pay, authCode: auth, channel: m.querySelector('#se-chan').value,
      customerName: m.querySelector('#se-name').value.trim(), customerPhone: m.querySelector('#se-phone').value.trim(),
      items, total, discount: round2(s.subtotal - total),
      editedAt: new Date().toISOString(), editedBy: S().user.name,
    };
    if (s.shipping) patch.shipping = { ...s.shipping, address: m.querySelector('#se-addr').value.trim(), fee: round2(parseNum(m.querySelector('#se-fee').value)) };
    // Qué cambió (para el historial)
    const changes = [];
    if (pay !== s.paymentMethod) changes.push(`forma de pago ${s.paymentMethod} → ${pay}`);
    if (auth !== (s.authCode || '')) changes.push(`autorización ${s.authCode || '—'} → ${auth || '—'}`);
    if (patch.channel !== s.channel) changes.push(`canal ${s.channel} → ${patch.channel}`);
    if (patch.customerName !== (s.customerName || '')) changes.push(`cliente → ${patch.customerName || '—'}`);
    items.forEach((li, i) => { if (li.finalPrice !== s.items[i].finalPrice) changes.push(`${li.code} ${money(s.items[i].finalPrice)} → ${money(li.finalPrice)}`); });
    if (s.shipping && patch.shipping.fee !== (s.shipping.fee || 0)) changes.push(`envío ${money(s.shipping.fee || 0)} → ${money(patch.shipping.fee)}`);
    if (!changes.length && (!s.shipping || patch.shipping.address === s.shipping.address)) { closeModal(); return; }
    await store.updateSale(s.id, patch);
    // Precio vendido de cada prenda
    store.updateItems(items.filter((li, i) => !li.returned && li.finalPrice !== s.items[i].finalPrice).map((li) => [li.itemId, { soldPrice: li.finalPrice }]));
    store.log('venta_corregida', `Corrigió ticket ${s.folio}: ${changes.join('; ') || 'datos del envío'}`, s.id);
    toast('Venta corregida');
    setTimeout(() => openSaleDetail(s.id), 50);
  });
}

function openVoidSale(id) {
  const s = S().sales.find((x) => x.id === id);
  if (!s) return;
  const n = saleNet(s);
  const m = openModal(`
    <div class="modal-head"><h2>Anular ticket ${esc(s.folio)}</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body">
      <p>La venta deja de contar en reportes y en el corte de caja, y ${n.count === 1 ? 'la prenda vuelve' : `las ${n.count} prendas vuelven`} a estar disponibles en el inventario.</p>
      <p class="muted small">Úsalo cuando la venta se registró por error. Si la clienta devolvió una prenda, usa "Devolución".</p>
      <label>Motivo *<input id="sv-reason" placeholder="Ej. Se registró dos veces"></label>
      <p id="sv-err" class="err-text"></p>
    </div>
    <div class="modal-actions"><span class="grow"></span><button class="btn" data-close>Cancelar</button>
      <button class="btn danger" id="sv-ok">Anular venta</button></div>`);
  m.querySelector('#sv-ok').addEventListener('click', async () => {
    const reason = m.querySelector('#sv-reason').value.trim();
    if (!reason) return (m.querySelector('#sv-err').textContent = 'Escribe el motivo.');
    await store.voidSale(s.id, reason);
    store.log('venta_anulada', `Anuló ticket ${s.folio} (${money(n.total)}, ${s.items.map((li) => li.code).join(', ')}). Motivo: ${reason}`, s.id);
    toast('Venta anulada');
    setTimeout(() => openSaleDetail(s.id), 50);
  });
  setTimeout(() => m.querySelector('#sv-reason').focus(), 50);
}

// =================================================================== ENVÍOS
const shipmentsBy = (status) => S().sales.filter((s) => !s.voided && s.shipping?.status === status);

function openShipments(tab = 'por_empacar') {
  const m = openModal(`
    <div class="modal-head"><h2>Envíos</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="chips" id="sh-tabs">${Object.entries(SHIP_STATUS).map(([k, l]) => `<button class="chip ${k === tab ? 'on' : ''}" data-t="${k}">${l} <span class="badge">${shipmentsBy(k).length}</span></button>`).join('')}</div>
      <div id="sh-list" class="list"></div>
    </div>`, { wide: true });
  const draw = () => {
    const st = S().settings;
    let list = shipmentsBy(tab).sort((a, b) => (tab === 'entregado' ? b : a).date.localeCompare((tab === 'entregado' ? a : b).date));
    if (tab === 'entregado') list = list.slice(0, 40);
    m.querySelector('#sh-list').innerHTML = list.length ? list.map((s) => {
      const sh = s.shipping;
      const phone = (s.customerPhone || '').replace(/\D/g, '');
      const wa = phone ? `https://wa.me/${phone.length === 8 ? '502' + phone : phone}?text=${encodeURIComponent(
        `Hola ${s.customerName || ''}, tu pedido de ${st.storeName} ${sh.status === 'entregado' ? 'fue entregado' : 'ya fue enviado'}${sh.carrier ? ` por ${sh.carrier}` : ''}.${sh.tracking ? ` Número de guía: ${sh.tracking}.` : ''} ¡Gracias por tu compra!`)}` : '';
      return `<div class="row-item ship-row">
        <div class="grow">
          <div><b>${esc(s.customerName || 'Sin nombre')}</b> ${s.customerPhone ? `<span class="muted">· ${esc(s.customerPhone)}</span>` : ''}</div>
          <div class="small">${esc(sh.address || '')}</div>
          <small class="muted">${esc(s.folio)} · ${fmtDate(s.date)} · ${s.items.filter((li) => !li.returned).map((li) => esc(li.code)).join(', ')} · ${esc(sh.carrier || '')}${sh.tracking ? ` · guía ${esc(sh.tracking)}` : ''}</small>
          <div class="ship-actions">
            ${tab === 'por_empacar' ? `<input class="sh-track" data-track="${esc(s.id)}" placeholder="Número de guía (opcional)" autocapitalize="characters">
              <button class="btn small primary" data-sent="${esc(s.id)}">Marcar enviado</button>` : ''}
            ${tab === 'enviado' ? `<button class="btn small primary" data-deliv="${esc(s.id)}">Marcar entregado</button>` : ''}
            ${tab === 'entregado' ? `<span class="muted small">Entregado ${fmtDate(sh.deliveredAt)}</span>` : ''}
            ${wa && tab !== 'por_empacar' ? `<a class="btn small" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp a la clienta</a>` : ''}
            <button class="btn small ghost" data-open="${esc(s.id)}">Ver ticket</button>
          </div>
        </div>
      </div>`;
    }).join('') : `<p class="empty">No hay envíos ${SHIP_STATUS[tab].toLowerCase()}.</p>`;
    m.querySelectorAll('#sh-tabs .chip').forEach((c) => {
      c.classList.toggle('on', c.dataset.t === tab);
      c.querySelector('.badge').textContent = shipmentsBy(c.dataset.t).length;
    });
  };
  m.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-t]');
    if (t) { tab = t.dataset.t; return draw(); }
    const sent = e.target.closest('[data-sent]');
    const deliv = e.target.closest('[data-deliv]');
    const open = e.target.closest('[data-open]');
    if (open) return openSaleDetail(open.dataset.open);
    const sid = sent?.dataset.sent || deliv?.dataset.deliv;
    if (!sid) return;
    const s = S().sales.find((x) => x.id === sid);
    const now = new Date().toISOString();
    let shipping;
    if (sent) {
      const tracking = (m.querySelector(`[data-track="${sid}"]`)?.value || '').trim().toUpperCase();
      shipping = { ...s.shipping, status: 'enviado', sentAt: now, tracking };
      store.log('envio', `Marcó enviado ${s.folio}${tracking ? ` (guía ${tracking})` : ''}`, s.id);
    } else {
      shipping = { ...s.shipping, status: 'entregado', deliveredAt: now };
      store.log('envio', `Marcó entregado ${s.folio}`, s.id);
    }
    await store.updateShipping(sid, shipping);
    toast(sent ? 'Marcado como enviado' : 'Marcado como entregado');
    setTimeout(() => { draw(); updateBell(); }, 50);
  });
  draw();
}

// =================================================================== REBAJAS EN GRUPO
function openBulkPrice() {
  const st = S().settings;
  const f = { cat: '', sub: '', days: 0, mode: 'pct', value: 30, round: 1, action: 'apply' };
  const m = openModal(`
    <div class="modal-head"><h2>Rebajas en grupo</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body form">
      <div class="chips" id="bp-action">
        <button class="chip on" data-a="apply">Aplicar rebaja</button>
        <button class="chip" data-a="undo">Quitar rebaja (volver al precio anterior)</button>
      </div>
      <div class="grid3">
        <label>Categoría<select id="bp-cat"><option value="">Todas</option>${st.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
        <label>Subcategoría<select id="bp-sub"><option value="">Todas</option></select></label>
        <label>Con más de (días)<input id="bp-days" type="number" min="0" value="0" inputmode="numeric"></label>
      </div>
      <div id="bp-apply-opts">
        <div class="grid3">
          <label>Tipo<select id="bp-mode"><option value="pct">% de descuento</option><option value="fixed">Precio fijo (Q)</option></select></label>
          <label id="bp-val-lbl">Descuento (%)<input id="bp-val" inputmode="decimal" value="30"></label>
          <label>Redondear a<select id="bp-round"><option value="1">Q1</option><option value="5">Q5</option><option value="0.5">Q0.50</option></select></label>
        </div>
      </div>
      <div id="bp-preview" class="bp-preview"></div>
      <p class="muted small">Las prendas que cambien de precio quedan como "sin etiqueta" para que reimprimas su etiqueta con el precio nuevo.</p>
    </div>
    <div class="modal-actions"><span class="grow"></span><button class="btn" data-close>Cancelar</button>
      <button class="btn primary" id="bp-go">Aplicar</button></div>`, { wide: true });

  const targets = () => S().items.filter((i) => i.status === 'disponible'
    && (!f.cat || i.categoryId === f.cat) && (!f.sub || i.subcategory === f.sub)
    && (!f.days || (Date.now() - new Date(i.createdAt).getTime()) / 86400000 >= f.days)
    && (f.action === 'apply' || i.originalPrice));
  const newPrice = (i) => {
    const base = i.originalPrice || i.price; // la rebaja siempre se calcula sobre el precio original
    const raw = f.mode === 'pct' ? base * (1 - f.value / 100) : f.value;
    return Math.max(0, round2(Math.round(raw / f.round) * f.round));
  };
  const changes = () => targets().map((i) => {
    if (f.action === 'undo') return [i, i.originalPrice];
    return [i, newPrice(i)];
  }).filter(([i, p]) => p !== i.price && p > 0);
  const draw = () => {
    const ch = changes();
    m.querySelector('#bp-preview').innerHTML = `<b>${ch.length} prenda${ch.length === 1 ? '' : 's'} cambia${ch.length === 1 ? '' : 'n'} de precio</b>
      ${ch.length ? `<div class="bp-examples">${ch.slice(0, 8).map(([i, p]) => `<div><span class="code">${esc(i.code)}</span> ${esc(itemTitle(i, st))}: <s>${money(i.price)}</s> → <b>${money(p)}</b></div>`).join('')}${ch.length > 8 ? `<div class="muted">y ${ch.length - 8} más…</div>` : ''}</div>` : ''}`;
    m.querySelector('#bp-go').disabled = !ch.length;
    m.querySelector('#bp-go').textContent = f.action === 'apply' ? `Aplicar a ${ch.length}` : `Quitar a ${ch.length}`;
  };
  const fillSubs = () => {
    const c = catById(st, f.cat);
    m.querySelector('#bp-sub').innerHTML = '<option value="">Todas</option>' + (c?.subs || []).map((x) => `<option>${esc(x)}</option>`).join('');
    f.sub = '';
  };
  m.querySelector('#bp-action').addEventListener('click', (e) => {
    const c = e.target.closest('[data-a]');
    if (!c) return;
    f.action = c.dataset.a;
    $$('#bp-action .chip', m).forEach((x) => x.classList.toggle('on', x === c));
    m.querySelector('#bp-apply-opts').style.display = f.action === 'apply' ? '' : 'none';
    draw();
  });
  m.querySelector('#bp-cat').addEventListener('change', (e) => { f.cat = e.target.value; fillSubs(); draw(); });
  m.querySelector('#bp-sub').addEventListener('change', (e) => { f.sub = e.target.value; draw(); });
  m.querySelector('#bp-days').addEventListener('input', (e) => { f.days = parseInt(e.target.value, 10) || 0; draw(); });
  m.querySelector('#bp-mode').addEventListener('change', (e) => {
    f.mode = e.target.value;
    m.querySelector('#bp-val-lbl').firstChild.textContent = f.mode === 'pct' ? 'Descuento (%)' : 'Precio nuevo (Q)';
    draw();
  });
  m.querySelector('#bp-val').addEventListener('input', (e) => { f.value = parseNum(e.target.value); draw(); });
  m.querySelector('#bp-round').addEventListener('change', (e) => { f.round = parseFloat(e.target.value); draw(); });
  m.querySelector('#bp-go').addEventListener('click', async () => {
    const ch = changes();
    if (!ch.length) return;
    if (f.action === 'apply' && f.mode === 'pct' && (f.value <= 0 || f.value >= 100)) return toast('El descuento debe ser entre 1% y 99%', 'err');
    const now = new Date().toISOString();
    await store.updateItems(ch.map(([i, p]) => [i.id, f.action === 'apply'
      ? { price: p, originalPrice: i.originalPrice || i.price, discountedAt: now, labelPrinted: false }
      : { price: p, originalPrice: null, discountedAt: null, labelPrinted: false }]));
    const scope = [catName(st, f.cat) !== '(sin categoría)' ? catName(st, f.cat) : 'todas las categorías', f.sub, f.days ? `+${f.days} días` : ''].filter(Boolean).join(', ');
    store.log('rebaja', f.action === 'apply'
      ? `Rebaja ${f.mode === 'pct' ? f.value + '%' : 'a ' + money(f.value)} a ${ch.length} prendas (${scope})`
      : `Quitó la rebaja a ${ch.length} prendas (${scope})`);
    closeModal();
    toast(`${ch.length} precios actualizados. Reimprime sus etiquetas.`);
  });
  draw();
}

// =================================================================== META DEL MES
function goalCardHtml() {
  const goal = S().settings.monthlyGoal || 0;
  const now = new Date();
  const monthName = now.toLocaleDateString('es-GT', { month: 'long' });
  if (!goal) {
    return `<section class="card goal-card empty-goal"><span class="grow">¿Quieres ponerte una <b>meta de ventas</b> para ${monthName}?</span>
      <button class="btn small" data-act="goal">Poner meta</button></section>`;
  }
  const from = dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const sold = computeReport(S(), from, dayKey(now)).kpis.revenue;
  const pct = Math.min(1, sold / goal);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - now.getDate() + 1; // incluye hoy
  const missing = Math.max(0, goal - sold);
  return `<section class="card goal-card" data-act="goal" role="button" tabindex="0">
    <div class="goal-head"><b>Meta de ${monthName}</b><span class="muted small">${money(sold)} de ${money(goal)}</span></div>
    <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${sold}"><div class="meter-fill" style="width:${(pct * 100).toFixed(1)}%"></div></div>
    <div class="goal-foot"><b>${Math.round((sold / goal) * 100)}%</b>
      <span class="muted small">${missing ? `Faltan ${money(missing)} · ${money(missing / daysLeft)} por día (${daysLeft} día${daysLeft === 1 ? '' : 's'})` : '🎉 ¡Meta cumplida!'}</span></div>
  </section>`;
}

function openGoal() {
  const cur = S().settings.monthlyGoal || '';
  const m = openModal(`
    <div class="modal-head"><h2>Meta de ventas del mes</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body"><label>Meta mensual (Q)<input id="g-val" inputmode="decimal" value="${cur}" placeholder="Ej. 10000"></label>
      <p class="muted small">Se usa la misma meta cada mes; la puedes cambiar cuando quieras. Déjala vacía para quitarla.</p></div>
    <div class="modal-actions"><span class="grow"></span><button class="btn" data-close>Cancelar</button><button class="btn primary" id="g-ok">Guardar</button></div>`);
  m.querySelector('#g-ok').addEventListener('click', async () => {
    const v = round2(parseNum(m.querySelector('#g-val').value));
    await store.saveSettings({ ...structuredClone(S().settings), monthlyGoal: v });
    store.log('ajustes', v ? `Puso la meta del mes en ${money(v)}` : 'Quitó la meta del mes');
    closeModal();
    toast(v ? 'Meta guardada' : 'Meta quitada');
  });
  setTimeout(() => m.querySelector('#g-val').focus(), 50);
}

// =================================================================== HISTORIAL
const LOG_TYPES = {
  prendas: { label: 'Prendas', actions: ['prenda_nueva', 'prenda_editada', 'precio', 'prenda_eliminada', 'rebaja'] },
  ventas: { label: 'Ventas', actions: ['devolucion', 'venta_corregida', 'venta_anulada', 'envio', 'corte'] },
  usuarios: { label: 'Usuarios', actions: ['usuario'] },
  ajustes: { label: 'Ajustes y respaldos', actions: ['ajustes', 'respaldo'] },
};
function openLogs() {
  const f = { who: '', type: '' };
  const m = openModal(`
    <div class="modal-head"><h2>Historial de cambios</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="filters">
        <select id="lg-who"><option value="">Todas las personas</option>${[...new Set(S().logs.map((l) => l.by).filter(Boolean))].map((n) => `<option>${esc(n)}</option>`).join('')}</select>
        <select id="lg-type"><option value="">Todo</option>${Object.entries(LOG_TYPES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('')}</select>
      </div>
      <div id="lg-list" class="list"></div>
    </div>`, { wide: true });
  const draw = () => {
    const acts = f.type ? LOG_TYPES[f.type].actions : null;
    const list = S().logs.filter((l) => (!f.who || l.by === f.who) && (!acts || acts.includes(l.action))).slice(0, 300);
    m.querySelector('#lg-list').innerHTML = list.length ? list.map((l) => `
      <div class="row-item log-row">
        <div class="log-when">${fmtDate(l.at)}<br><span class="muted">${new Date(l.at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="grow"><b>${esc(l.by || '')}</b> <span>${esc(l.text)}</span></div>
      </div>`).join('') : '<p class="empty">No hay cambios registrados todavía.</p>';
  };
  m.querySelector('#lg-who').addEventListener('change', (e) => { f.who = e.target.value; draw(); });
  m.querySelector('#lg-type').addEventListener('change', (e) => { f.type = e.target.value; draw(); });
  draw();
}

// =================================================================== NOTIFICACIONES
function updateBell() {
  const n = pendingSocial().reduce((a, i) => a + i.pendingUnpublish.length, 0) + shipmentsBy('por_empacar').length;
  const el = $('#bell-n');
  if (!el) return;
  el.textContent = n > 99 ? '99+' : n;
  el.style.display = n ? '' : 'none';
  $('#bell')?.classList.toggle('has', n > 0);
}

function openNotifications() {
  openModal(`
    <div class="modal-head"><h2>Notificaciones</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body">
      <div id="notif-ship"></div>
      <p class="muted small">Prendas vendidas que siguen publicadas. Márcalas como vendidas en cada red y toca el botón para quitarlas de aquí.</p>
      <div id="notif-list" class="list"></div>
    </div>`, { wide: true });
  $('#notif-ship').addEventListener('click', (e) => { if (e.target.closest('[data-envios]')) openShipments(); });
  $('#notif-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-done]');
    if (!b) return;
    const it = store.getItem(b.dataset.done);
    if (!it) return;
    const plats = b.dataset.plat ? [b.dataset.plat] : [...(it.pendingUnpublish || [])];
    store.updateItem(it.id, {
      pendingUnpublish: (it.pendingUnpublish || []).filter((p) => !plats.includes(p)),
      publishedOn: (it.publishedOn || []).filter((p) => !plats.includes(p)),
    });
    setTimeout(() => { drawNotifications(); updateBell(); }, 30);
  });
  drawNotifications();
}

function drawNotifications() {
  const el = $('#notif-list');
  if (!el) return;
  const ns = shipmentsBy('por_empacar').length;
  $('#notif-ship').innerHTML = ns ? `<div class="alert warn"><span class="grow">${ns} envío${ns === 1 ? '' : 's'} por empacar</span>
    <button class="btn small" data-envios>Ver envíos</button></div>` : '';
  const st = S().settings;
  const list = pendingSocial();
  el.innerHTML = list.length ? list.map((it) => `
    <div class="row-item notif-row">
      ${thumbHtml(it)}
      <div class="grow"><div><span class="code">${esc(it.code)}</span> ${esc(itemTitle(it, st))}</div>
        <small class="muted">Vendida ${fmtDate(it.soldAt)} en ${money(it.soldPrice)}</small>
        <div class="notif-actions">
          ${it.pendingUnpublish.map((p) => `<button class="btn small" data-done="${esc(it.id)}" data-plat="${esc(p)}">✓ Ya la marqué en ${esc(p)}</button>`).join('')}
          ${it.pendingUnpublish.length > 1 ? `<button class="btn small ghost" data-done="${esc(it.id)}">Todas listas</button>` : ''}
        </div>
      </div>
    </div>`).join('') : '<p class="empty">✓ No tienes pendientes. Todo lo vendido ya está marcado en tus redes.</p>';
}

// =================================================================== CORTE DE CAJA
function openCorte(initialDay = null) {
  const me = S().user;
  const owner = isOwner();
  const st = { day: initialDay || dayKey(new Date()), seller: owner ? '' : me.uid, fondo: 0, contado: null, notes: '' };
  const sellerName = (uidv) => (uidv ? S().users.find((u) => u.uid === uidv)?.name || me.name : 'Todos');

  const m = openModal(`
    <div class="modal-head"><h2>Corte de caja</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="grid2">
        <label>Día<input type="date" id="k-day" value="${st.day}" max="${dayKey(new Date())}"></label>
        ${owner ? `<label>Vendedor<select id="k-seller"><option value="">Todos</option>
          ${S().users.filter((u) => u.active || S().sales.some((s) => s.sellerUid === u.uid)).map((u) => `<option value="${esc(u.uid)}">${esc(u.name)}</option>`).join('')}
          </select></label>` : `<label>Vendedor<input value="${esc(me.name)}" disabled></label>`}
      </div>
      <div id="k-body"></div>
      <div id="k-saved"></div>
    </div>
    <div class="modal-actions">
      <span class="grow"></span>
      <button class="btn" data-close>Cerrar</button>
      <button class="btn primary" id="k-save">Guardar corte</button>
    </div>`, { wide: true });

  const draw = () => {
    const c = computeCorte(S(), st.day, st.seller, sellerName(st.seller));
    const cashExpected = c.cash ? round2(st.fondo + c.cash.net) : null;
    const diff = c.cash && st.contado !== null ? round2(st.contado - cashExpected) : null;
    st.calc = { c, cashExpected, diff };
    m.querySelector('#k-body').innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Forma de pago</th><th class="num">Tickets</th><th class="num">Ventas</th><th class="num">Devoluciones</th><th class="num">Neto</th></tr></thead>
        <tbody>${c.rows.map((r) => `<tr><td>${esc(r.method)}</td><td class="num">${r.tickets}</td><td class="num">${money(r.sales)}</td>
          <td class="num">${r.returns ? '−' + money(r.returns) : '—'}</td><td class="num"><b>${money(r.net)}</b></td></tr>`).join('')}
          <tr class="strong"><td>Total</td><td class="num">${c.tickets}</td><td class="num">${money(c.totalSales)}</td>
          <td class="num">${c.totalReturns ? '−' + money(c.totalReturns) : '—'}</td><td class="num">${money(c.totalNet)}</td></tr>
        </tbody></table></div>
      ${c.cash ? `
        <div class="cash-box">
          <h3>Efectivo en caja</h3>
          <label class="inline">Fondo inicial (cambio con el que abriste)<input id="k-fondo" inputmode="decimal" value="${st.fondo || ''}" placeholder="0.00"></label>
          <div class="cash-line"><span>+ Ventas en efectivo</span><span>${money(c.cash.sales)}</span></div>
          ${c.cash.returns ? `<div class="cash-line"><span>− Devoluciones en efectivo</span><span>−${money(c.cash.returns)}</span></div>` : ''}
          <div class="cash-line grand"><span>Debe haber en caja</span><span id="k-exp">${money(cashExpected)}</span></div>
          <label class="inline">Efectivo contado<input id="k-contado" inputmode="decimal" value="${st.contado ?? ''}" placeholder="Cuenta el dinero"></label>
          <div id="k-diff">${diffHtml(diff)}</div>
        </div>` : '<p class="muted small">No hay una forma de pago llamada "Efectivo", así que no se calcula el efectivo en caja.</p>'}
      <label>Notas (opcional)<input id="k-notes" value="${esc(st.notes)}" placeholder="Ej. salió Q50 para bolsas"></label>`;
    const fondo = m.querySelector('#k-fondo');
    const contado = m.querySelector('#k-contado');
    const live = () => {
      st.fondo = parseNum(fondo.value);
      st.contado = contado.value.trim() === '' ? null : parseNum(contado.value);
      const exp = round2(st.fondo + c.cash.net);
      const d = st.contado !== null ? round2(st.contado - exp) : null;
      st.calc = { c, cashExpected: exp, diff: d };
      m.querySelector('#k-exp').textContent = money(exp);
      m.querySelector('#k-diff').innerHTML = diffHtml(d);
    };
    fondo?.addEventListener('input', live);
    contado?.addEventListener('input', live);
    m.querySelector('#k-notes').addEventListener('input', (e) => (st.notes = e.target.value));
    drawSaved();
  };
  const drawSaved = () => {
    const list = S().cortes
      .filter((k) => k.day === st.day && (owner || k.createdByUid === me.uid))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    m.querySelector('#k-saved').innerHTML = list.length ? `
      <h3 class="mt">Cortes guardados de este día</h3>
      <div class="list">${list.map((k) => `<div class="row-item">
        <div class="time">${new Date(k.createdAt).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="grow"><div>${esc(k.sellerName)} · neto ${money(k.totalNet)}</div>
          <small class="muted">por ${esc(k.createdBy)}${k.cashCounted !== null && k.cashCounted !== undefined ? ` · contado ${money(k.cashCounted)} de ${money(k.cashExpected)}` : ''}${k.notes ? ' · ' + esc(k.notes) : ''}</small></div>
        ${k.difference === null || k.difference === undefined ? '' : diffBadge(k.difference)}
      </div>`).join('')}</div>` : '';
  };

  m.querySelector('#k-day').addEventListener('change', (e) => { st.day = e.target.value || st.day; draw(); });
  m.querySelector('#k-seller')?.addEventListener('change', (e) => { st.seller = e.target.value; draw(); });
  m.querySelector('#k-save').addEventListener('click', async () => {
    const { c, cashExpected, diff } = st.calc;
    if (c.cash && st.contado === null && !(await confirmDialog('No escribiste el efectivo contado. ¿Guardar el corte así?', { okText: 'Guardar' }))) return;
    await store.saveCorte({
      day: st.day, createdAt: new Date().toISOString(), createdBy: me.name, createdByUid: me.uid,
      sellerUid: st.seller, sellerName: sellerName(st.seller),
      rows: c.rows.map(({ method, tickets, sales, returns, net }) => ({ method, tickets, sales, returns, net })),
      tickets: c.tickets, totalSales: c.totalSales, totalReturns: c.totalReturns, totalNet: c.totalNet,
      fondo: c.cash ? st.fondo : null, cashExpected: c.cash ? cashExpected : null,
      cashCounted: c.cash ? st.contado : null, difference: c.cash ? diff : null, notes: st.notes.trim(),
    });
    toast('Corte guardado');
    store.log('corte', `Guardó corte de caja del ${fmtDate(st.day + 'T12:00:00')} (${sellerName(st.seller)}): neto ${money(c.totalNet)}${diff === null ? '' : `, diferencia ${money(diff)}`}`);
    st.contado = null; st.notes = '';
    setTimeout(draw, 50);
  });
  draw();
}

function diffHtml(d) {
  if (d === null || d === undefined) return '';
  if (Math.abs(d) < 0.005) return '<div class="diff ok">✓ La caja cuadra</div>';
  return d > 0 ? `<div class="diff warn">Sobran ${money(d)}</div>` : `<div class="diff bad">Faltan ${money(-d)}</div>`;
}
function diffBadge(d) {
  if (Math.abs(d) < 0.005) return '<span class="badge ok">Cuadra</span>';
  return d > 0 ? `<span class="badge warn">Sobran ${money(d)}</span>` : `<span class="badge bad">Faltan ${money(-d)}</span>`;
}

// =================================================================== RESPALDO
const BACKUP_KEY = 'ui.lastBackup'; // cualquier respaldo (rápido o completo)
const FULL_BACKUP_KEY = 'ui.lastFullBackup'; // respaldo completo (con fotos)
function daysSince(key) {
  const t = lsGet(key, null);
  return t ? Math.floor((Date.now() - new Date(t).getTime()) / 86400000) : null;
}
const daysSinceBackup = () => daysSince(BACKUP_KEY);
const daysSinceFullBackup = () => daysSince(FULL_BACKUP_KEY);
const hasPhotos = () => S().items.some((i) => i.status === 'disponible' && i.thumb);

async function downloadBackup(withPhotos) {
  const btn = $(withPhotos ? '#a-backup-full' : '#a-backup-quick');
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Preparando…'; }
  let data;
  try {
    data = await store.exportData({
      withPhotos,
      onProgress: (n, total) => { if (btn) btn.textContent = `Preparando fotos… ${n} de ${total}`; },
    });
  } catch (e) {
    toast('No se pudo preparar el respaldo: ' + e.message, 'err');
    return;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
  }
  const nPhotos = Object.keys(data.photos || {}).length;
  const json = JSON.stringify(data);
  const mb = json.length / 1024 / 1024;
  // El iPad solo deja abrir "Compartir / Guardar en Archivos" directo desde un toque
  const m = openModal(`
    <div class="modal-body center">
      <h2>${withPhotos ? 'Respaldo completo listo' : 'Respaldo rápido listo'}</h2>
      <p>${data.items.length} prendas · ${data.sales.length} ventas · ${(data.cortes || []).length} cortes${withPhotos ? ` · ${nPhotos} fotos` : ''}</p>
      <p class="muted small">Tamaño: ${mb < 0.1 ? 'menos de 0.1' : mb.toFixed(1)} MB</p>
      <p class="muted small">Toca "Guardar" y elige <b>Guardar en Archivos</b> → iCloud Drive.</p>
    </div>
    <div class="modal-actions"><span class="grow"></span><button class="btn" data-close>Cancelar</button>
      <button class="btn primary lg" id="bk-save">${icon('download')} Guardar</button></div>`);
  m.querySelector('#bk-save').addEventListener('click', () => { closeModal(); saveBackupFile(data, json, withPhotos); });
}

async function saveBackupFile(data, json, withPhotos) {
  const now = new Date();
  const name = `BOOHO_respaldo_${withPhotos ? 'completo' : 'rapido'}_${dayKey(now)}_${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Respaldo BOOHO' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  } catch (e) {
    if (e.name === 'AbortError') return; // canceló el menú de compartir
    return toast('No se pudo guardar el respaldo: ' + e.message, 'err');
  }
  lsSet(BACKUP_KEY, now.toISOString());
  if (withPhotos) lsSet(FULL_BACKUP_KEY, now.toISOString());
  toast(`Respaldo guardado: ${data.items.length} prendas, ${data.sales.length} ventas`);
  if (ui.tab === 'ajustes') VIEWS.ajustes.drawBackup?.();
}

function restoreBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    let data;
    try {
      data = checkBackup(JSON.parse(await f.text()));
    } catch (e) {
      return toast(e instanceof SyntaxError ? 'El archivo está dañado o no es un respaldo.' : e.message, 'err');
    }
    const ok = await confirmDialog(
      `<b>Restaurar respaldo</b><br>Del ${fmtDateTime(data.createdAt)}${data.createdBy ? ' (hecho por ' + esc(data.createdBy) + ')' : ''}:<br>
       ${data.items.length} prendas · ${data.sales.length} ventas · ${(data.cortes || []).length} cortes · ${Object.keys(data.photos || {}).length} fotos<br><br>
       <span class="small">Se recupera todo lo que está en el respaldo (lo borrado vuelve y lo cambiado regresa a como estaba).
       Lo que se agregó después del respaldo <b>no</b> se borra.</span>`,
      { okText: 'Restaurar' }
    );
    if (!ok) return;
    try {
      toast('Restaurando…');
      await store.importData(data, (n, total) => toast(`Restaurando… ${n} de ${total}`));
      store.log('respaldo', `Restauró un respaldo del ${fmtDateTime(data.createdAt)} (${data.items.length} prendas, ${data.sales.length} ventas)`);
      toast('Respaldo restaurado');
    } catch (e) {
      toast('No se pudo restaurar: ' + e.message, 'err');
    }
  });
  input.click();
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

// ------------------------------------------------------------------ gráficos de barras
/** Agrupa filas por categoría o subcategoría: [{name, count, amount}] ordenado de mayor a menor. */
function groupCount(rows, group, keyFn, amountFn) {
  const m = new Map();
  rows.forEach((r) => {
    const [cat, sub] = keyFn(r);
    const name = group === 'sub' ? `${cat} › ${sub || 'Sin subcategoría'}` : cat;
    const g = m.get(name) || { name, cat, count: 0, amount: 0 };
    g.count++;
    g.amount += amountFn(r);
    m.set(name, g);
  });
  return [...m.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
}

// Colores de categoría (paleta validada para daltonismo). Cada categoría tiene siempre el
// mismo color, según su lugar en Ajustes; sus subcategorías usan el color de la categoría.
// Paleta validada; en modo oscuro se usan los mismos tonos ajustados para fondo oscuro
const isDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const CAT_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const CAT_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
const CAT_COLORS = new Proxy([], { get: (_, k) => (isDark() ? CAT_DARK : CAT_LIGHT)[k] });
let catColorMap = null;
/**
 * Reparte los colores entre las categorías que aparecen en los gráficos de la pantalla
 * (en el orden de Ajustes), para que no se repitan mientras haya 8 o menos.
 */
function setChartCategories(names) {
  const order = (n) => {
    const i = S().settings.categories.findIndex((c) => c.name === n);
    return i < 0 ? 999 : i;
  };
  const uniq = [...new Set(names)].sort((a, b) => order(a) - order(b) || String(a).localeCompare(String(b)));
  catColorMap = new Map(uniq.map((n, i) => [n, CAT_COLORS[i % CAT_COLORS.length]]));
}
function catColor(name) {
  if (catColorMap?.has(name)) return catColorMap.get(name);
  const i = [...String(name || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return CAT_COLORS[i % CAT_COLORS.length];
}

function hbarChart(title, subtitle, data, countWord, amountWord, emptyMsg) {
  const MAX = 10;
  let rows = data;
  if (data.length > MAX) {
    const rest = data.slice(MAX - 1);
    rows = [...data.slice(0, MAX - 1), {
      name: `Otras (${rest.length})`, count: rest.reduce((a, x) => a + x.count, 0),
      amount: rest.reduce((a, x) => a + x.amount, 0), other: true,
    }];
  }
  const total = data.reduce((a, x) => a + x.count, 0);
  const max = Math.max(1, ...rows.map((x) => x.count));
  const body = rows.length ? `<div class="hbar" role="list">${rows.map((x) => {
    const pctTxt = total ? Math.round((x.count / total) * 100) + '%' : '0%';
    const tip = `<b>${esc(x.name)}</b><br>${x.count} prenda${x.count === 1 ? '' : 's'} ${countWord} (${pctTxt})<br>${money(x.amount)} ${amountWord}`;
    return `<div class="hbar-row ${x.other ? 'other' : ''}" role="listitem" tabindex="0"
        aria-label="${esc(x.name)}: ${x.count} ${countWord}, ${pctTxt}" data-tip="${esc(tip)}">
      <div class="hbar-label">${x.count === max && !x.other ? '<span class="hbar-top">★</span>' : ''}${esc(x.name)}</div>
      <div class="hbar-track"><div class="hbar-bar" style="width:calc((100% - 40px) * ${(x.count / max).toFixed(4)});${x.other ? '' : `background:${catColor(x.cat)}`}"></div><span class="hbar-val">${x.count}</span></div>
    </div>`;
  }).join('')}</div>` : `<p class="empty">${emptyMsg}</p>`;
  return `<section class="card chart-card">
    <div class="chart-head"><h3>${title}</h3><span class="muted small">${subtitle}${total ? ` · ${total} en total` : ''}</span></div>
    ${body}
  </section>`;
}


// Gráfico de dona (paleta categórica validada; "Otras" en gris)
const DONUT_COLORS = new Proxy([], { get: (_, k) => (isDark() ? CAT_DARK : CAT_LIGHT)[k] });
const DONUT_OTHER = 'var(--other)';

function donutChart(title, subtitle, data, countWord, amountWord, emptyMsg) {
  const MAX = 5;
  let rows = data.slice(0, MAX).map((x, i) => ({ ...x, color: DONUT_COLORS[i] }));
  if (data.length > MAX) {
    const rest = data.slice(MAX);
    rows.push({ name: `Otras (${rest.length})`, count: rest.reduce((a, x) => a + x.count, 0), amount: rest.reduce((a, x) => a + x.amount, 0), color: DONUT_OTHER });
  }
  const total = rows.reduce((a, x) => a + x.count, 0);
  if (!total) return `<section class="card chart-card"><div class="chart-head"><h3>${title}</h3><span class="muted small">${subtitle}</span></div><p class="empty">${emptyMsg}</p></section>`;
  const R = 70, r = 46, C = 90; // radio exterior, interior, centro
  const pt = (rad, a) => [C + rad * Math.sin(a), C - rad * Math.cos(a)];
  let a0 = 0;
  const tipOf = (x) => {
    const pct = Math.round((x.count / total) * 100) + '%';
    return `<b>${esc(x.name)}</b><br>${x.count} prenda${x.count === 1 ? '' : 's'} ${countWord} (${pct})<br>${money(x.amount)} ${amountWord}`;
  };
  const slices = rows.map((x, i) => {
    const a1 = a0 + (x.count / total) * Math.PI * 2;
    let d;
    if (rows.length === 1) {
      d = `M${C} ${C - R}A${R} ${R} 0 1 1 ${C - 0.01} ${C - R}Z M${C} ${C - r}A${r} ${r} 0 1 0 ${C + 0.01} ${C - r}Z`;
    } else {
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const [x1, y1] = pt(R, a0), [x2, y2] = pt(R, a1), [x3, y3] = pt(r, a1), [x4, y4] = pt(r, a0);
      d = `M${x1} ${y1}A${R} ${R} 0 ${big} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${big} 0 ${x4} ${y4}Z`;
    }
    a0 = a1;
    return `<path class="donut-slice" data-k="${i}" d="${d}" style="fill:${x.color}" data-tip="${esc(tipOf(x))}" fill-rule="evenodd"></path>`;
  }).join('');
  const legend = rows.map((x, i) => `
    <div class="donut-leg hbar-row" data-k="${i}" tabindex="0" data-tip="${esc(tipOf(x))}" aria-label="${esc(x.name)}: ${x.count} ${countWord}">
      <span class="sw" style="background:${x.color}"></span>
      <span class="grow name">${esc(x.name)}</span>
      <span class="hbar-val">${x.count}</span>
      <span class="muted pct">${Math.round((x.count / total) * 100)}%</span>
    </div>`).join('');
  return `<section class="card chart-card">
    <div class="chart-head"><h3>${title}</h3><span class="muted small">${subtitle}</span></div>
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 180 180" role="img" aria-label="${esc(title)}">
        ${slices}
        <text x="90" y="88" text-anchor="middle" class="donut-num">${total}</text>
        <text x="90" y="108" text-anchor="middle" class="donut-lbl">prendas</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>
  </section>`;
}

/** Tooltip al pasar el dedo / tocar una barra. */
function bindChartTips(root) {
  let tip = $('#chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chart-tip';
    tip.className = 'chart-tip';
    document.body.appendChild(tip);
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.hbar-row, .donut-slice')) hideTip(); });
    window.addEventListener('scroll', () => hideTip(), true);
  }
  $$('.hbar-row, .donut-slice', root).forEach((row) => {
    row.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && showTip(row, root));
    row.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hideTip());
    row.addEventListener('click', () => showTip(row, root));
    row.addEventListener('focus', () => showTip(row, root));
    row.addEventListener('blur', () => hideTip());
  });
}
function showTip(row, root) {
  const tip = $('#chart-tip');
  $$('.hbar-row.active, .donut-slice.active', root).forEach((r) => r.classList.toggle('active', false));
  row.classList.toggle('active', true);
  // En la dona, se resaltan juntos el pedazo y su nombre en la leyenda
  if (row.dataset.k !== undefined) {
    row.closest('.chart-card')?.querySelectorAll(`[data-k="${row.dataset.k}"]`).forEach((x) => x.classList.toggle('active', true));
  }
  tip.innerHTML = row.dataset.tip;
  tip.classList.toggle('show', true);
  const bar = (row.querySelector('.hbar-val') || row).getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  let x = bar.right + 12;
  let y = bar.top + bar.height / 2 - t.height / 2;
  if (x + t.width > window.innerWidth - 8) { x = window.innerWidth - t.width - 8; y = bar.top - t.height - 10; }
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}
function hideTip() {
  const tip = $('#chart-tip');
  if (tip) tip.classList.toggle('show', false);
  $$('.hbar-row.active, .donut-slice.active').forEach((r) => r.classList.toggle('active', false));
}

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
      <div class="chart-filter">
        <span class="muted small">Gráficos por</span>
        <div class="chips" id="r-group">
          <button class="chip ${ui.rep.group === 'cat' ? 'on' : ''}" data-g="cat">Categoría</button>
          <button class="chip ${ui.rep.group === 'sub' ? 'on' : ''}" data-g="sub">Subcategoría</button>
        </div>
      </div>
      <div class="chart-grid">
        ${(() => {
          const sold = groupCount(r.lines, ui.rep.group, (l) => [l.category, l.subcategory], (l) => l.finalPrice);
          const inv = groupCount(r.inventory, ui.rep.group, (i) => [i.categoryName, i.subcategory], (i) => i.price || 0);
          const shown = (d) => (d.length > 10 ? d.slice(0, 9) : d);
          setChartCategories([...shown(sold), ...shown(inv)].map((x) => x.cat));
          return hbarChart('Lo que más vendes', `Prendas vendidas del ${fmtDate(ui.rep.from + 'T12:00:00')} al ${fmtDate(ui.rep.to + 'T12:00:00')}`,
              sold, 'vendidas', 'en ventas', 'Aún no hay ventas en este periodo.')
            + hbarChart('Lo que más tienes en inventario', 'Prendas disponibles hoy',
              inv, 'disponibles', 'a precio de venta', 'No hay prendas disponibles.');
        })()}
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
    $('#r-group').addEventListener('click', (e) => {
      const b = e.target.closest('[data-g]');
      if (!b) return;
      ui.rep.group = b.dataset.g;
      lsSet('ui.repGroup', ui.rep.group);
      this.refresh();
    });
    bindChartTips($('#r-body'));
  },
};

// =================================================================== AJUSTES
VIEWS.ajustes = {
  mount(v) {
    const u = S().user;
    const myCard = `
      <section class="card">
        <h3>Mi usuario</h3>
        <p>${esc(u.name || '')} <span class="muted">· usuario <b>${esc(u.username || '')}</b> · ${esc(ROLES[u.role] || '')}</span></p>
        <div class="row-btns">
          ${isOwner() ? '<button class="btn" id="a-rename">Cambiar mi nombre</button>' : ''}
          <button class="btn danger ghost" id="a-logout">Cerrar sesión</button>
        </div>
        ${isOwner() ? '' : '<p class="muted small">Para cambiar tu contraseña o tu nombre, pídeselo a la dueña.</p>'}
      </section>`;
    if (!isOwner()) {
      v.innerHTML = myCard + '<p class="muted small center">BOOHO · Registro de Ventas · v1.8</p>';
      $('#a-logout').addEventListener('click', async () => { if (await confirmDialog('¿Cerrar sesión?')) store.logout(); });
      return;
    }
    if (!ui.draft) ui.draft = structuredClone(S().settings);
    v.innerHTML = `
      <section class="card">
        <div class="card-head"><h3>Usuarios</h3><button class="btn small primary" id="a-newuser">${icon('plus')} Nuevo usuario</button></div>
        <p class="muted small"><b>Dueña</b>: ve y hace todo. <b>Ayudante</b>: vende, registra prendas, imprime etiquetas y hace devoluciones; no ve costos, ganancias, reportes ni ajustes.</p>
        <div id="a-users" class="list"></div>
      </section>
      <section class="card">
        <h3>Respaldo</h3>
        <p class="muted small">Guarda una copia en un archivo. En el iPad elige <b>Guardar en Archivos</b> → iCloud Drive.</p>
        <div class="backup-opts">
          <div class="backup-opt">
            <b>Rápido (sin fotos)</b>
            <span class="muted small">Prendas, ventas, cortes y ajustes. Pesa poco. Hazlo cada semana.</span>
            <span id="a-bk-quick-status"></span>
            <button class="btn primary" id="a-backup-quick">${icon('download')} Respaldo rápido</button>
          </div>
          <div class="backup-opt">
            <b>Completo (con fotos)</b>
            <span class="muted small">Todo lo anterior más las fotos de las prendas disponibles. Hazlo una vez al mes.</span>
            <span id="a-bk-full-status"></span>
            <button class="btn" id="a-backup-full">${icon('download')} Respaldo completo</button>
          </div>
        </div>
        <div class="row-btns"><button class="btn ghost" id="a-restore">Restaurar desde archivo</button></div>
      </section>
      <section class="card row-card">
        <div class="grow"><h3>Historial de cambios</h3>
          <p class="muted small">Quién cambió precios, borró prendas, hizo devoluciones, corrigió o anuló ventas, etc.</p></div>
        <button class="btn" id="a-logs">Ver historial</button>
      </section>
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
        <h3>Dónde publicas tus prendas</h3>
        <p class="muted small">Al registrar una prenda marcas dónde está publicada. Cuando se vende, la campanita te recuerda marcarla como vendida ahí.</p>
        <div id="a-plat"></div>
        <h3>Formas de pago</h3><div id="a-pay"></div>
        <h3>Canales de venta</h3><div id="a-chan"></div>
        <h3>Paqueterías para envíos</h3><div id="a-carriers"></div>
      </section>
      <div class="save-bar"><p id="a-err" class="err-text"></p><button class="btn primary lg" id="a-save">Guardar cambios</button></div>
      ${myCard}
      ${isDemo ? `<section class="card"><h3>Modo demo</h3>
        <p class="muted small">Los datos se guardan solo en este dispositivo. Cuando configures Firebase, la app usará la nube y estos datos de prueba no se pasan.</p>
        <button class="btn danger ghost" id="a-reset">Borrar todos los datos de prueba</button></section>` : ''}
      <p class="muted small center">BOOHO · Registro de Ventas · v1.8</p>`;
    this.drawCats();
    this.drawList('#a-pay', 'paymentMethods', 'Nueva forma de pago');
    this.drawList('#a-chan', 'channels', 'Nuevo canal');
    ui.draft.platforms ||= [];
    this.drawList('#a-plat', 'platforms', 'Nueva red o página');
    ui.draft.carriers ||= [];
    this.drawList('#a-carriers', 'carriers', 'Nueva paquetería');
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
      if (await confirmDialog('¿Borrar <b>todo</b> (prendas, ventas, usuarios y ajustes) de este dispositivo?', { okText: 'Borrar todo', danger: true })) store.resetDemo();
    });
    $('#a-newuser').addEventListener('click', () => openUserForm());
    $('#a-backup-quick').addEventListener('click', () => downloadBackup(false));
    $('#a-backup-full').addEventListener('click', () => downloadBackup(true));
    $('#a-restore').addEventListener('click', () => restoreBackup());
    $('#a-logs').addEventListener('click', () => openLogs());
    this.drawBackup();
    $('#a-users').addEventListener('click', (e) => {
      const r = e.target.closest('[data-user]');
      if (r) openUserForm(S().users.find((x) => x.uid === r.dataset.user));
    });
  },
  drawBackup() {
    const show = (sel, d, limit) => {
      const el = $(sel);
      if (!el) return;
      const when = d === null ? 'Nunca desde este iPad' : `Último: ${d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`}`;
      el.className = d === null || d > limit ? 'bk-status warn' : 'bk-status';
      el.textContent = when;
    };
    show('#a-bk-quick-status', daysSinceBackup(), 7);
    show('#a-bk-full-status', daysSinceFullBackup(), 30);
  },
  refresh() {
    const el = $('#a-users');
    if (!el) return;
    const me = S().user.uid;
    const users = S().users.slice().sort((a, b) =>
      (b.active ? 1 : 0) - (a.active ? 1 : 0) || (a.role === 'duena' ? -1 : 1) - (b.role === 'duena' ? -1 : 1) || (a.name || '').localeCompare(b.name || ''));
    el.innerHTML = users.map((x) => `
      <div class="row-item tap" data-user="${esc(x.uid)}">
        <div class="avatar">${esc((x.name || x.username || '?').trim().charAt(0).toUpperCase())}</div>
        <div class="grow"><div><b>${esc(x.name || '')}</b>${x.uid === me ? ' <span class="muted small">(tú)</span>' : ''}</div>
          <small class="muted">usuario: ${esc(x.username || '')}</small></div>
        ${x.active ? '' : '<span class="badge warn">Desactivado</span>'}
        <span class="badge ${x.role === 'duena' ? 'ok' : ''}">${esc(ROLES[x.role] || x.role)}</span>
      </div>`).join('') || '<p class="empty">Sin usuarios.</p>';
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


function openUserForm(user = null) {
  const isNew = !user;
  const isMe = user && user.uid === S().user.uid;
  const m = openModal(`
    <div class="modal-head"><h2>${isNew ? 'Nuevo usuario' : esc(user.name)}</h2>
      <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body form">
      <label>Nombre (aparece en las ventas)<input id="u-name" value="${esc(user?.name || '')}" placeholder="Ej. Juan Pérez"></label>
      ${isNew
        ? `<label>Usuario (para entrar)<input id="u-user" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Ej. juan"></label>`
        : `<p class="muted">Usuario para entrar: <b>${esc(user.username)}</b></p>`}
      <label>Tipo de usuario<select id="u-role" ${isMe ? 'disabled' : ''}>
        ${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${(user?.role || 'ayudante') === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      ${isNew ? `
        <label>Contraseña (mínimo 6)<input id="u-pass" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      ` : `
        <div class="pw-box">
          <div class="field-label">Contraseña</div>
          <div class="pw-row"><span id="u-pw-show" class="pw-val">••••••</span><button class="btn small" id="u-pw-see">Ver</button></div>
          <div class="pw-row"><input id="u-pass" placeholder="Nueva contraseña" autocapitalize="off" autocorrect="off" spellcheck="false">
            <button class="btn small" id="u-pw-set">Cambiar</button></div>
        </div>
        ${isMe ? '' : `<label class="check"><input type="checkbox" id="u-active" ${user.active ? 'checked' : ''}> Puede entrar a la app (activo)</label>`}
      `}
      <p id="u-err" class="err-text"></p>
    </div>
    <div class="modal-actions"><span class="grow"></span>
      <button class="btn" data-close>Cancelar</button>
      <button class="btn primary" id="u-save">${isNew ? 'Crear usuario' : 'Guardar'}</button>
    </div>`);
  const err = m.querySelector('#u-err');
  const busy = (b, on) => { b.disabled = on; };

  m.querySelector('#u-pw-see')?.addEventListener('click', async (e) => {
    busy(e.target, true);
    try {
      const pw = await store.getPassword(user.uid);
      m.querySelector('#u-pw-show').textContent = pw || '(no guardada)';
    } catch (x) { err.textContent = x.message; }
    busy(e.target, false);
  });
  m.querySelector('#u-pw-set')?.addEventListener('click', async (e) => {
    const pw = m.querySelector('#u-pass').value;
    const ve = validatePassword(pw);
    if (ve) return (err.textContent = ve);
    err.textContent = '';
    busy(e.target, true);
    try {
      await store.setPassword(user.uid, pw);
      store.log('usuario', `Cambió la contraseña de ${user.username}`);
      m.querySelector('#u-pw-show').textContent = pw;
      m.querySelector('#u-pass').value = '';
      toast('Contraseña cambiada');
    } catch (x) { err.textContent = x.message; }
    busy(e.target, false);
  });
  m.querySelector('#u-save').addEventListener('click', async (e) => {
    err.textContent = '';
    const name = m.querySelector('#u-name').value.trim();
    const role = m.querySelector('#u-role').value;
    if (!name) return (err.textContent = 'Escribe el nombre.');
    busy(e.target, true);
    try {
      if (isNew) {
        const username = cleanUsername(m.querySelector('#u-user').value);
        const password = m.querySelector('#u-pass').value;
        const ve = validateUsername(username) || validatePassword(password);
        if (ve) { busy(e.target, false); return (err.textContent = ve); }
        if (S().users.some((x) => x.username === username)) { busy(e.target, false); return (err.textContent = 'Ese nombre de usuario ya existe.'); }
        await store.createUser({ username, name, role, password });
        store.log('usuario', `Creó el usuario ${username} (${name}, ${ROLES[role]})`);
        closeModal();
        openModal(`<div class="modal-body center">
            <div class="big-check">✓</div><h2>Usuario creado</h2>
            <p>Para entrar a la app, ${esc(name)} usa:</p>
            <div class="kv center-kv"><span>Usuario</span><b>${esc(username)}</b><span>Contraseña</span><b>${esc(password)}</b></div>
          </div><div class="modal-actions"><button class="btn primary lg block" data-close>Listo</button></div>`);
      } else {
        const patch = { name };
        if (!isMe) {
          patch.role = role;
          patch.active = m.querySelector('#u-active').checked;
        }
        await store.updateUser(user.uid, patch);
        {
          const d = [];
          if (patch.name !== user.name) d.push(`nombre → ${patch.name}`);
          if (patch.role && patch.role !== user.role) d.push(`tipo → ${ROLES[patch.role]}`);
          if (patch.active !== undefined && patch.active !== user.active) d.push(patch.active ? 'lo activó' : 'lo desactivó');
          if (d.length) store.log('usuario', `Usuario ${user.username}: ${d.join(', ')}`);
        }
        closeModal();
        toast('Usuario actualizado');
      }
    } catch (x) {
      err.textContent = x.message || 'No se pudo guardar.';
      busy(e.target, false);
    }
  });
  setTimeout(() => m.querySelector('#u-name')?.focus(), 50);
}

async function saveSettings() {
  const d = ui.draft;
  const err = $('#a-err');
  err.textContent = '';
  d.storeName = d.storeName.trim() || 'BOOHO';
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
  store.log('ajustes', 'Cambió los ajustes (categorías, listas o nombre de la tienda)');
  toast('Ajustes guardados');
}

main().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="login"><div class="login-card"><h1>Error al iniciar</h1><p>${esc(e.message)}</p></div></div>`;
});
