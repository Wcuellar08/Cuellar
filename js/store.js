// Capa de datos. Hay dos "motores":
//  - Firebase (datos compartidos en la nube entre varias personas)
//  - Demo (datos solo en este dispositivo, para probar la app)
// Ambos ofrecen exactamente las mismas funciones a la interfaz.

import { firebaseConfig } from './config.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { pad } from './util.js';

export const isDemo = !firebaseConfig || !firebaseConfig.apiKey;

function mergeSettings(s) {
  return { ...structuredClone(DEFAULT_SETTINGS), ...(s || {}) };
}

function makeCode(prefix, n) {
  return `${(prefix || 'GEN').toUpperCase()}-${pad(n)}`;
}

/** Interfaz común */
function baseStore() {
  const listeners = new Set();
  const authListeners = new Set();
  const store = {
    state: { settings: mergeSettings(), items: [], sales: [], user: null, ready: false },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onAuth(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },
    emit() { listeners.forEach((f) => f(store.state)); },
    emitAuth() { authListeners.forEach((f) => f(store.state.user)); },
    getItem(id) { return store.state.items.find((i) => i.id === id); },
    findByCode(code) {
      const c = String(code || '').trim().toUpperCase();
      return store.state.items.find((i) => i.code === c);
    },
  };
  return store;
}

// =====================================================================
//  MODO DEMO (localStorage)
// =====================================================================
function createLocalStore() {
  const KEY = 'tienda-demo-v1';
  const store = baseStore();
  store.mode = 'demo';
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || null; } catch { db = null; }
  if (!db) db = { settings: mergeSettings(), items: [], sales: [], counter: 1, user: null };

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error(e); }
    sync();
  };
  const sync = () => {
    store.state.settings = mergeSettings(db.settings);
    store.state.items = db.items;
    store.state.sales = db.sales;
    store.state.ready = true;
    store.emit();
  };

  Object.assign(store, {
    async init() {
      sync();
      store.state.user = db.user;
      store.emitAuth();
    },
    async login(name) {
      db.user = { uid: 'demo-' + name.toLowerCase().replace(/\s+/g, '-'), name, email: '' };
      store.state.user = db.user;
      save();
      store.emitAuth();
    },
    async logout() {
      db.user = null;
      store.state.user = null;
      save();
      store.emitAuth();
    },
    async setUserName(name) {
      db.user.name = name;
      store.state.user = db.user;
      save();
      store.emitAuth();
    },
    async createItem(data) {
      const cat = db.settings.categories.find((c) => c.id === data.categoryId);
      const n = db.counter++;
      const item = {
        ...data, id: 'i' + n + '-' + Date.now().toString(36), number: n, code: makeCode(cat?.prefix, n),
        status: 'disponible', labelPrinted: false,
        createdAt: new Date().toISOString(), createdBy: store.state.user?.name || '',
      };
      db.items.push(item);
      save();
      return item;
    },
    async updateItem(id, patch) {
      const it = db.items.find((i) => i.id === id);
      if (it) Object.assign(it, patch);
      save();
    },
    async deleteItem(id) {
      db.items = db.items.filter((i) => i.id !== id);
      save();
    },
    async markLabelsPrinted(ids) {
      db.items.forEach((i) => ids.includes(i.id) && (i.labelPrinted = true));
      save();
    },
    async createSale(sale) {
      const s = { ...sale, id: 's' + Date.now().toString(36) };
      for (const li of s.items) {
        const it = db.items.find((i) => i.id === li.itemId);
        if (!it || it.status !== 'disponible') throw new Error(`La prenda ${li.code} ya no está disponible`);
      }
      s.items.forEach((li) => {
        const it = db.items.find((i) => i.id === li.itemId);
        Object.assign(it, { status: 'vendido', soldAt: s.date, saleId: s.id, soldPrice: li.finalPrice });
      });
      db.sales.push(s);
      save();
      return s;
    },
    async returnItem(saleId, itemId) {
      const s = db.sales.find((x) => x.id === saleId);
      const li = s?.items.find((x) => x.itemId === itemId);
      if (!li || li.returned) return;
      li.returned = true;
      li.returnedAt = new Date().toISOString();
      li.returnedBy = store.state.user?.name || '';
      const it = db.items.find((i) => i.id === itemId);
      if (it) Object.assign(it, { status: 'disponible', soldAt: null, saleId: null, soldPrice: null });
      save();
    },
    async saveSettings(settings) {
      db.settings = settings;
      save();
    },
    async resetDemo() {
      localStorage.removeItem(KEY);
      location.reload();
    },
  });
  return store;
}

// =====================================================================
//  FIREBASE
// =====================================================================
async function createFirebaseStore() {
  const { initializeApp } = await import('../vendor/firebase-app.js');
  const A = await import('../vendor/firebase-auth.js');
  const F = await import('../vendor/firebase-firestore.js');

  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('Sin caché offline', e);
    db = F.getFirestore(app);
  }

  const store = baseStore();
  store.mode = 'firebase';
  let unsubs = [];
  const stopListeners = () => { unsubs.forEach((u) => u()); unsubs = []; };

  const fire = (promise) => promise.catch((e) => {
    console.error(e);
    window.dispatchEvent(new CustomEvent('store-error', { detail: e }));
  });

  function startListeners() {
    let got = { settings: false, items: false, sales: false };
    const markReady = (k) => {
      got[k] = true;
      if (got.settings && got.items && got.sales) store.state.ready = true;
      store.emit();
    };
    unsubs.push(F.onSnapshot(F.doc(db, 'settings', 'main'), (snap) => {
      if (!snap.exists() && !snap.metadata.fromCache) {
        fire(F.setDoc(F.doc(db, 'settings', 'main'), structuredClone(DEFAULT_SETTINGS)));
      }
      store.state.settings = mergeSettings(snap.exists() ? snap.data() : null);
      markReady('settings');
    }, (e) => console.error(e)));
    unsubs.push(F.onSnapshot(F.collection(db, 'items'), (snap) => {
      store.state.items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      markReady('items');
    }, (e) => console.error(e)));
    unsubs.push(F.onSnapshot(F.collection(db, 'sales'), (snap) => {
      store.state.sales = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      markReady('sales');
    }, (e) => console.error(e)));
  }

  Object.assign(store, {
    async init() {
      A.onAuthStateChanged(auth, async (user) => {
        stopListeners();
        if (!user) {
          store.state.user = null;
          store.state.ready = false;
          store.emitAuth();
          return;
        }
        let name = '';
        try {
          const p = await F.getDoc(F.doc(db, 'users', user.uid));
          name = p.exists() ? p.data().name || '' : '';
        } catch { /* offline */ }
        store.state.user = { uid: user.uid, email: user.email, name };
        startListeners();
        store.emitAuth();
      });
    },
    async login(email, password) {
      await A.signInWithEmailAndPassword(auth, email, password);
    },
    async logout() {
      await A.signOut(auth);
    },
    async setUserName(name) {
      const u = store.state.user;
      fire(F.setDoc(F.doc(db, 'users', u.uid), { name, email: u.email || '' }, { merge: true }));
      store.state.user = { ...u, name };
      store.emitAuth();
    },
    async createItem(data) {
      if (!navigator.onLine) throw new Error('Se necesita internet para crear prendas (para asignar el número único).');
      const cat = store.state.settings.categories.find((c) => c.id === data.categoryId);
      const counterRef = F.doc(db, 'counters', 'items');
      const itemRef = F.doc(F.collection(db, 'items'));
      return F.runTransaction(db, async (tx) => {
        const c = await tx.get(counterRef);
        const n = c.exists() ? c.data().next : 1;
        const item = {
          ...data, number: n, code: makeCode(cat?.prefix, n),
          status: 'disponible', labelPrinted: false,
          createdAt: new Date().toISOString(), createdBy: store.state.user?.name || '',
        };
        tx.set(counterRef, { next: n + 1 });
        tx.set(itemRef, item);
        return { ...item, id: itemRef.id };
      });
    },
    async updateItem(id, patch) {
      fire(F.updateDoc(F.doc(db, 'items', id), patch));
    },
    async deleteItem(id) {
      fire(F.deleteDoc(F.doc(db, 'items', id)));
    },
    async markLabelsPrinted(ids) {
      const b = F.writeBatch(db);
      ids.forEach((id) => b.update(F.doc(db, 'items', id), { labelPrinted: true }));
      fire(b.commit());
    },
    async createSale(sale) {
      for (const li of sale.items) {
        const it = store.getItem(li.itemId);
        if (!it || it.status !== 'disponible') throw new Error(`La prenda ${li.code} ya no está disponible`);
      }
      const saleRef = F.doc(F.collection(db, 'sales'));
      const b = F.writeBatch(db);
      b.set(saleRef, sale);
      sale.items.forEach((li) =>
        b.update(F.doc(db, 'items', li.itemId), {
          status: 'vendido', soldAt: sale.date, saleId: saleRef.id, soldPrice: li.finalPrice,
        })
      );
      // No se espera la confirmación del servidor: así funciona sin internet
      // y se sincroniza en cuanto vuelve la conexión.
      fire(b.commit());
      return { ...sale, id: saleRef.id };
    },
    async returnItem(saleId, itemId) {
      const s = store.state.sales.find((x) => x.id === saleId);
      if (!s) return;
      const items = s.items.map((li) =>
        li.itemId === itemId && !li.returned
          ? { ...li, returned: true, returnedAt: new Date().toISOString(), returnedBy: store.state.user?.name || '' }
          : li
      );
      const b = F.writeBatch(db);
      b.update(F.doc(db, 'sales', saleId), { items });
      b.update(F.doc(db, 'items', itemId), { status: 'disponible', soldAt: null, saleId: null, soldPrice: null });
      fire(b.commit());
    },
    async saveSettings(settings) {
      fire(F.setDoc(F.doc(db, 'settings', 'main'), settings));
    },
  });
  return store;
}

export async function createStore() {
  return isDemo ? createLocalStore() : createFirebaseStore();
}
