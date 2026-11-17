// Capa de datos. Hay dos "motores":
//  - Firebase (datos compartidos en la nube entre varias personas)
//  - Demo (datos solo en este dispositivo, para probar la app)
// Ambos ofrecen exactamente las mismas funciones a la interfaz.
//
// Usuarios: se entra con un nombre de usuario (ej. "maria"). En Firebase se guarda como
// "maria@booho.app" (no es un correo real, nunca se envía nada ahí).
// La primera persona que configura la app queda como DUEÑA y desde Ajustes › Usuarios
// crea a las demás, cambia contraseñas y desactiva cuentas.

import { firebaseConfig } from './config.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { pad } from './util.js';

export const isDemo = !firebaseConfig || !firebaseConfig.apiKey;
export const USER_DOMAIN = 'booho.app';
export const ROLES = { duena: 'Dueña', ayudante: 'Ayudante' };

function mergeSettings(s) {
  return { ...structuredClone(DEFAULT_SETTINGS), ...(s || {}) };
}

function makeCode(prefix, n) {
  return `${(prefix || 'GEN').toUpperCase()}-${pad(n)}`;
}

export function cleanUsername(u) {
  return String(u || '').trim().toLowerCase().replace(/@.*$/, '').replace(/\s+/g, '');
}
export function validateUsername(u) {
  if (!/^[a-z0-9._-]{3,20}$/.test(u)) return 'El usuario debe tener de 3 a 20 letras o números, sin espacios ni acentos.';
  return '';
}
export function validatePassword(p) {
  return String(p || '').length >= 6 ? '' : 'La contraseña debe tener al menos 6 caracteres.';
}
const toEmail = (username) => `${cleanUsername(username)}@${USER_DOMAIN}`;

const authError = (e) => {
  const c = e?.code || '';
  if (c.includes('email-already-in-use')) return new Error('Ese nombre de usuario ya existe.');
  if (c.includes('invalid') || c.includes('wrong-password') || c.includes('user-not-found')) return new Error('Usuario o contraseña incorrectos.');
  if (c.includes('user-disabled')) return new Error('Este usuario está desactivado.');
  if (c.includes('too-many-requests')) return new Error('Demasiados intentos. Espera unos minutos.');
  if (c.includes('network')) return new Error('Sin conexión a internet.');
  if (c.includes('operation-not-allowed') || c.includes('admin-restricted')) {
    return new Error('Firebase no permite crear usuarios. En Authentication › Configuración › Acciones del usuario, activa "Habilitar creación (registro)".');
  }
  return e instanceof Error ? e : new Error(String(e));
};

export const BACKUP_VERSION = 1;

/** Revisa que un archivo de respaldo tenga el formato correcto. */
export function checkBackup(data) {
  if (!data || data.app !== 'booho-ventas' || !Array.isArray(data.items) || !Array.isArray(data.sales)) {
    throw new Error('Este archivo no es un respaldo de BOOHO.');
  }
  return data;
}

function buildBackup(state, photos = {}) {
  return {
    photos,
    app: 'booho-ventas', version: BACKUP_VERSION, createdAt: new Date().toISOString(),
    createdBy: state.user?.name || '',
    settings: state.settings, items: state.items, sales: state.sales, cortes: state.cortes,
    users: state.users.map(({ uid, username, name, role, active, createdAt }) => ({ uid, username, name, role, active, createdAt })),
  };
}

/** Interfaz común */
function baseStore() {
  const listeners = new Set();
  const authListeners = new Set();
  const store = {
    state: { settings: mergeSettings(), items: [], sales: [], users: [], cortes: [], user: null, ready: false },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onAuth(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },
    emit() { listeners.forEach((f) => f(store.state)); },
    emitAuth() { authListeners.forEach((f) => f(store.state.user)); },
    getItem(id) { return store.state.items.find((i) => i.id === id); },
    findByCode(code) {
      const c = String(code || '').trim().toUpperCase();
      return store.state.items.find((i) => i.code === c);
    },
    isOwner() { return store.state.user?.role === 'duena'; },
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
  if (!db) db = { settings: mergeSettings(), items: [], sales: [], counter: 1 };
  db.users ||= [];
  db.cortes ||= [];
  delete db.user; // versión anterior

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error(e); }
    sync();
  };
  // Fotos grandes aparte (en modo demo; si no caben, quedan solo mientras la app esté abierta)
  const PKEY = 'tienda-demo-photos';
  let photos = {};
  try { photos = JSON.parse(localStorage.getItem(PKEY)) || {}; } catch { photos = {}; }
  const savePhotos = () => { try { localStorage.setItem(PKEY, JSON.stringify(photos)); } catch (e) { console.warn('Fotos sin espacio', e); } };
  const publicUser = (u) => u && { uid: u.uid, username: u.username, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt };
  const sync = () => {
    store.state.settings = mergeSettings(db.settings);
    store.state.items = db.items;
    store.state.sales = db.sales;
    store.state.users = db.users.map(publicUser);
    store.state.cortes = db.cortes;
    store.state.ready = true;
    store.emit();
  };
  const setSession = (uid) => {
    db.session = uid;
    const u = db.users.find((x) => x.uid === uid && x.active);
    store.state.user = publicUser(u) || null;
    save();
    store.emitAuth();
  };
  const ownerOnly = () => { if (!store.isOwner()) throw new Error('Solo la dueña puede hacer esto.'); };

  Object.assign(store, {
    async init() {
      sync();
      const u = db.users.find((x) => x.uid === db.session && x.active);
      store.state.user = publicUser(u) || null;
      store.emitAuth();
    },
    async needsSetup() { return !db.users.length; },
    async setupOwner({ username, name, password }) {
      if (db.users.length) throw new Error('La app ya está configurada.');
      const u = { uid: 'u' + Date.now().toString(36), username: cleanUsername(username), name, role: 'duena', active: true, password, createdAt: new Date().toISOString() };
      db.users.push(u);
      setSession(u.uid);
    },
    async login(username, password) {
      const u = db.users.find((x) => x.username === cleanUsername(username));
      if (!u || u.password !== password) throw new Error('Usuario o contraseña incorrectos.');
      if (!u.active) throw new Error('Este usuario está desactivado. Habla con la dueña.');
      setSession(u.uid);
    },
    async logout() { setSession(null); },
    async setUserName(name) {
      const u = db.users.find((x) => x.uid === store.state.user.uid);
      u.name = name;
      setSession(u.uid);
    },
    async createUser({ username, name, role, password }) {
      ownerOnly();
      const un = cleanUsername(username);
      if (db.users.some((x) => x.username === un)) throw new Error('Ese nombre de usuario ya existe.');
      db.users.push({ uid: 'u' + Date.now().toString(36), username: un, name, role, active: true, password, createdAt: new Date().toISOString() });
      save();
    },
    async updateUser(uid, patch) {
      ownerOnly();
      Object.assign(db.users.find((x) => x.uid === uid), patch);
      save();
      if (uid === store.state.user.uid) setSession(uid);
    },
    async getPassword(uid) { ownerOnly(); return db.users.find((x) => x.uid === uid)?.password || ''; },
    async setPassword(uid, password) {
      ownerOnly();
      db.users.find((x) => x.uid === uid).password = password;
      save();
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
      ownerOnly();
      db.items = db.items.filter((i) => i.id !== id);
      save();
      store.deletePhoto(id);
    },
    async savePhoto(itemId, dataUrl) {
      photos[itemId] = dataUrl;
      savePhotos();
    },
    async getPhoto(itemId) { return photos[itemId] || null; },
    async deletePhoto(itemId) {
      delete photos[itemId];
      savePhotos();
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
      li.returnedByUid = store.state.user?.uid || '';
      const it = db.items.find((i) => i.id === itemId);
      if (it) Object.assign(it, { status: 'disponible', soldAt: null, saleId: null, soldPrice: null });
      save();
    },
    async saveSettings(settings) {
      ownerOnly();
      db.settings = settings;
      save();
    },
    async saveCorte(corte) {
      db.cortes.push({ ...corte, id: 'c' + Date.now().toString(36) });
      save();
    },
    async pauseSync() {},
    async resumeSync() {},
    async exportData({ withPhotos = false } = {}) {
      const keep = {};
      if (withPhotos) {
        db.items.filter((i) => i.status === 'disponible' && photos[i.id]).forEach((i) => { keep[i.id] = photos[i.id]; });
      }
      return buildBackup(store.state, keep);
    },
    async importData(data) {
      ownerOnly();
      checkBackup(data);
      const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
      const items = byId(db.items); data.items.forEach((x) => items.set(x.id, x));
      const sales = byId(db.sales); data.sales.forEach((x) => sales.set(x.id, x));
      const cortes = byId(db.cortes); (data.cortes || []).forEach((x) => cortes.set(x.id, x));
      db.items = [...items.values()];
      db.sales = [...sales.values()];
      db.cortes = [...cortes.values()];
      if (data.settings) db.settings = data.settings;
      db.counter = Math.max(db.counter, ...db.items.map((i) => (i.number || 0) + 1));
      Object.assign(photos, data.photos || {});
      savePhotos();
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
  const { initializeApp, deleteApp } = await import('../vendor/firebase-app.js');
  const A = await import('../vendor/firebase-auth.js');
  const F = await import('../vendor/firebase-firestore.js');

  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  if (firebaseConfig.useEmulators) A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
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

  // Solo para pruebas locales con los emuladores de Firebase
  if (firebaseConfig.useEmulators) F.connectFirestoreEmulator(db, '127.0.0.1', 8080);

  const store = baseStore();
  store.mode = 'firebase';
  const photoCache = new Map();
  let unsubs = [];
  let loginError = '';
  const stopListeners = () => { unsubs.forEach((u) => u()); unsubs = []; };

  const fire = (promise) => promise.catch((e) => {
    console.error(e);
    window.dispatchEvent(new CustomEvent('store-error', { detail: e }));
  });
  const ownerOnly = () => { if (!store.isOwner()) throw new Error('Solo la dueña puede hacer esto.'); };

  /** Ejecuta algo con una sesión aparte, sin cerrar la sesión de la dueña. */
  async function withSecondaryAuth(fn) {
    const sec = initializeApp(firebaseConfig, 'aux-' + Date.now());
    const sAuth = A.initializeAuth(sec, { persistence: A.inMemoryPersistence });
    if (firebaseConfig.useEmulators) A.connectAuthEmulator(sAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    try {
      return await fn(sAuth);
    } catch (e) {
      throw authError(e);
    } finally {
      await A.signOut(sAuth).catch(() => {});
      await deleteApp(sec).catch(() => {});
    }
  }

  function startListeners() {
    const got = { settings: false, items: false, sales: false };
    const markReady = (k) => {
      got[k] = true;
      if (got.settings && got.items && got.sales) store.state.ready = true;
      store.emit();
    };
    unsubs.push(F.onSnapshot(F.doc(db, 'settings', 'main'), (snap) => {
      if (!snap.exists() && !snap.metadata.fromCache && store.isOwner()) {
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
    unsubs.push(F.onSnapshot(F.collection(db, 'cortes'), (snap) => {
      store.state.cortes = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      store.emit();
    }, (e) => console.error(e)));
    unsubs.push(F.onSnapshot(F.collection(db, 'users'), (snap) => {
      store.state.users = snap.docs.map((d) => ({ ...d.data(), uid: d.id }));
      const me = store.state.users.find((u) => u.uid === store.state.user?.uid);
      if (me && !me.active) {
        loginError = 'Tu usuario fue desactivado.';
        A.signOut(auth);
        return;
      }
      if (me && (me.role !== store.state.user.role || me.name !== store.state.user.name)) {
        store.state.user = { ...store.state.user, role: me.role, name: me.name };
        store.emitAuth();
      }
      store.emit();
    }, (e) => console.error(e)));
  }

  async function readProfile(uid) {
    const ref = F.doc(db, 'users', uid);
    try { return await F.getDoc(ref); } catch { return F.getDocFromCache(ref); }
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
        let p = null;
        try { p = await readProfile(user.uid); } catch (e) { console.error(e); }
        if (!p || !p.exists() || !p.data().active) {
          loginError = p && p.exists() ? 'Este usuario está desactivado. Habla con la dueña.'
            : p ? 'Este usuario no tiene acceso. Pídele a la dueña que lo cree desde la app.'
            : 'Se necesita internet para entrar la primera vez.';
          await A.signOut(auth);
          return;
        }
        const d = p.data();
        store.state.user = { uid: user.uid, username: d.username, name: d.name, role: d.role };
        startListeners();
        store.emitAuth();
      });
    },
    takeLoginError() { const e = loginError; loginError = ''; return e; },
    async needsSetup() {
      try {
        const s = await F.getDoc(F.doc(db, 'meta', 'public'));
        return !s.exists();
      } catch {
        return false;
      }
    },
    async setupOwner({ username, name, password }) {
      const un = cleanUsername(username);
      let cred;
      try {
        cred = await A.createUserWithEmailAndPassword(auth, toEmail(un), password);
      } catch (e) {
        throw authError(e);
      }
      const uid = cred.user.uid;
      const b = F.writeBatch(db);
      b.set(F.doc(db, 'users', uid), { username: un, name, role: 'duena', active: true, createdAt: new Date().toISOString() });
      b.set(F.doc(db, 'meta', 'public'), { ownerSet: true, ownerUid: uid });
      try {
        await b.commit();
        await F.setDoc(F.doc(db, 'secrets', uid), { password });
      } catch (e) {
        await cred.user.delete().catch(() => {});
        throw new Error('No se pudo configurar: ' + (e.code === 'permission-denied' ? 'revisa que pegaste las reglas de Firestore.' : e.message));
      }
      // Volver a entrar para que se cargue el perfil recién creado
      await A.signOut(auth);
      await A.signInWithEmailAndPassword(auth, toEmail(un), password);
    },
    async login(username, password) {
      try {
        await A.signInWithEmailAndPassword(auth, toEmail(username), password);
      } catch (e) {
        throw authError(e);
      }
    },
    async logout() {
      await A.signOut(auth);
    },
    async setUserName(name) {
      ownerOnly();
      const u = store.state.user;
      fire(F.updateDoc(F.doc(db, 'users', u.uid), { name }));
      store.state.user = { ...u, name };
      store.emitAuth();
    },
    async createUser({ username, name, role, password }) {
      ownerOnly();
      if (!navigator.onLine) throw new Error('Se necesita internet para crear usuarios.');
      const un = cleanUsername(username);
      const uid = await withSecondaryAuth(async (sAuth) => {
        const cred = await A.createUserWithEmailAndPassword(sAuth, toEmail(un), password);
        return cred.user.uid;
      });
      const b = F.writeBatch(db);
      b.set(F.doc(db, 'users', uid), { username: un, name, role, active: true, createdAt: new Date().toISOString() });
      b.set(F.doc(db, 'secrets', uid), { password });
      await b.commit();
    },
    async updateUser(uid, patch) {
      ownerOnly();
      await F.updateDoc(F.doc(db, 'users', uid), patch);
    },
    async getPassword(uid) {
      ownerOnly();
      const s = await F.getDoc(F.doc(db, 'secrets', uid));
      return s.exists() ? s.data().password || '' : '';
    },
    async setPassword(uid, password) {
      ownerOnly();
      if (!navigator.onLine) throw new Error('Se necesita internet para cambiar contraseñas.');
      const u = store.state.users.find((x) => x.uid === uid);
      const old = await store.getPassword(uid);
      if (!old) throw new Error('No se conoce la contraseña anterior de este usuario.');
      await withSecondaryAuth(async (sAuth) => {
        const cred = await A.signInWithEmailAndPassword(sAuth, toEmail(u.username), old);
        await A.updatePassword(cred.user, password);
      });
      await F.setDoc(F.doc(db, 'secrets', uid), { password });
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
      ownerOnly();
      fire(F.deleteDoc(F.doc(db, 'items', id)));
      store.deletePhoto(id);
    },
    async savePhoto(itemId, dataUrl) {
      photoCache.set(itemId, dataUrl);
      fire(F.setDoc(F.doc(db, 'photos', itemId), { data: dataUrl, updatedAt: new Date().toISOString() }));
    },
    async getPhoto(itemId) {
      if (photoCache.has(itemId)) return photoCache.get(itemId);
      try {
        const snap = await F.getDoc(F.doc(db, 'photos', itemId));
        const v = snap.exists() ? snap.data().data : null;
        photoCache.set(itemId, v);
        return v;
      } catch {
        return null;
      }
    },
    async deletePhoto(itemId) {
      photoCache.delete(itemId);
      if (store.isOwner()) fire(F.deleteDoc(F.doc(db, 'photos', itemId)));
      else fire(F.setDoc(F.doc(db, 'photos', itemId), { data: null, updatedAt: new Date().toISOString() }));
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
          ? { ...li, returned: true, returnedAt: new Date().toISOString(), returnedBy: store.state.user?.name || '', returnedByUid: store.state.user?.uid || '' }
          : li
      );
      const b = F.writeBatch(db);
      b.update(F.doc(db, 'sales', saleId), { items });
      b.update(F.doc(db, 'items', itemId), { status: 'disponible', soldAt: null, saleId: null, soldPrice: null });
      fire(b.commit());
    },
    async saveSettings(settings) {
      ownerOnly();
      fire(F.setDoc(F.doc(db, 'settings', 'main'), settings));
    },
    async saveCorte(corte) {
      fire(F.addDoc(F.collection(db, 'cortes'), corte));
    },
    // El iPad no abre la ventana de imprimir mientras haya una conexión abierta
    // (Firestore mantiene una siempre abierta). Se pausa durante la vista de impresión.
    async pauseSync() {
      clearTimeout(store._resumeTimer);
      await F.disableNetwork(db).catch(() => {});
      // Por seguridad, se reanuda sola a los 10 minutos
      store._resumeTimer = setTimeout(() => store.resumeSync(), 10 * 60 * 1000);
    },
    async resumeSync() {
      clearTimeout(store._resumeTimer);
      await F.enableNetwork(db).catch(() => {});
    },
    /**
     * withPhotos = false: respaldo rápido (sin fotos grandes).
     * withPhotos = true: incluye las fotos grandes solo de las prendas disponibles.
     */
    async exportData({ withPhotos = false, onProgress } = {}) {
      const photos = {};
      if (withPhotos) {
        if (!navigator.onLine) throw new Error('Se necesita internet para el respaldo con fotos.');
        const ids = store.state.items.filter((i) => i.status === 'disponible' && i.thumb).map((i) => i.id);
        // Firestore permite buscar hasta 30 documentos a la vez por su id
        for (let i = 0; i < ids.length; i += 30) {
          const q = F.query(F.collection(db, 'photos'), F.where(F.documentId(), 'in', ids.slice(i, i + 30)));
          const snap = await F.getDocs(q);
          snap.forEach((d) => { if (d.data().data) photos[d.id] = d.data().data; });
          onProgress?.(Math.min(ids.length, i + 30), ids.length);
        }
      }
      return buildBackup(store.state, photos);
    },
    async importData(data, onProgress) {
      ownerOnly();
      checkBackup(data);
      if (!navigator.onLine) throw new Error('Se necesita internet para restaurar un respaldo.');
      const strip = ({ id, ...rest }) => rest;
      const ops = [
        ...data.items.map((x) => [F.doc(db, 'items', x.id), strip(x)]),
        ...data.sales.map((x) => [F.doc(db, 'sales', x.id), strip(x)]),
        ...(data.cortes || []).map((x) => [F.doc(db, 'cortes', x.id), strip(x)]),
      ];
      if (data.settings) ops.push([F.doc(db, 'settings', 'main'), data.settings]);
      const maxNum = Math.max(0, ...store.state.items.map((i) => i.number || 0), ...data.items.map((i) => i.number || 0));
      const counter = await F.getDoc(F.doc(db, 'counters', 'items'));
      const next = Math.max(maxNum + 1, counter.exists() ? counter.data().next : 1);
      ops.push([F.doc(db, 'counters', 'items'), { next }]);
      // Firestore acepta hasta 500 cambios por lote
      const photoOps = Object.entries(data.photos || {}).map(([id, v]) => [F.doc(db, 'photos', id), { data: v, updatedAt: new Date().toISOString() }]);
      const total = ops.length + photoOps.length;
      for (let i = 0; i < ops.length; i += 400) {
        const b = F.writeBatch(db);
        ops.slice(i, i + 400).forEach(([ref, val]) => b.set(ref, val));
        await b.commit();
        onProgress?.(Math.min(ops.length, i + 400), total);
      }
      // Las fotos pesan más: lotes chicos
      for (let i = 0; i < photoOps.length; i += 15) {
        const b = F.writeBatch(db);
        photoOps.slice(i, i + 15).forEach(([ref, val]) => b.set(ref, val));
        await b.commit();
        onProgress?.(ops.length + Math.min(photoOps.length, i + 15), total);
      }
      photoCache.clear();
    },
  });
  return store;
}

export async function createStore() {
  return isDemo ? createLocalStore() : createFirebaseStore();
}
