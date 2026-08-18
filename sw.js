/* TourDesk Pro — Service Worker
   App shell offline + assets cacheados. Los datos en vivo (Firestore) NO se
   interceptan: el SDK de Firestore gestiona su propio offline (IndexedDB). */
const CACHE = 'tourdesk-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // allSettled: si un asset externo falla, la instalación no se aborta
      return Promise.allSettled(SHELL.map(function (u) { return c.add(u); }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Endpoints de datos en vivo que el SW NO debe tocar (los maneja el SDK)
function isLiveData(url) {
  return /firestore\.googleapis\.com|firebaseinstallations|firebaseremoteconfig|\/google\.firestore|googleapis\.com\/.*(channel|Listen|Write)/.test(url);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;        // escrituras / POST de Firestore → red directa
  if (isLiveData(req.url)) return;         // datos en vivo → SDK gestiona offline

  // Cargar la app (navegación): red primero (para recibir updates), con
  // fallback al index cacheado cuando no hay conexión.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  // Resto de recursos (iconos, manifest, librerías CDN, fuentes):
  // stale-while-revalidate — sirve cache al instante y refresca en segundo plano.
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
