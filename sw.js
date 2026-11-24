// Service worker: guarda la app en el iPad para que abra sin internet.
// Estrategia: primero intenta la red (para recibir actualizaciones) y si no hay, usa la copia guardada.
const CACHE = 'ventas-v23';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/store.js', './js/config.js', './js/defaults.js', './js/util.js',
  './js/reports.js', './js/excel.js', './js/labels.js', './js/scanner.js', './js/corte.js', './js/photos.js',
  './vendor/firebase-app.js', './vendor/firebase-auth.js', './vendor/firebase-firestore.js',
  './vendor/qrcode.js', './vendor/jsQR.js', './vendor/xlsx.full.min.js',
  './fonts/cormorant-garamond-latin-500-normal.woff2', './fonts/cormorant-garamond-latin-600-normal.woff2',
  './fonts/cormorant-garamond-latin-500-italic.woff2', './fonts/jost-latin-400-normal.woff2',
  './fonts/jost-latin-500-normal.woff2', './fonts/jost-latin-600-normal.woff2',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
