/* ============================================================
   Service Worker — Vida de Yoguis
   Estrategia: Cache-first para assets estáticos.
   Las peticiones a Apps Script siempre van a la red.
   ============================================================ */

const CACHE_VERSION = 'vdy-v3';
const ASSETS_ESTATICOS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json'
  // Los iconos se omiten hasta que existan físicamente en /icons/
];

// ── Instalación: precarga los assets en caché ──────────────────
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(ASSETS_ESTATICOS);
    })
  );
  // Activar inmediatamente sin esperar a que cierren las pestañas anteriores
  self.skipWaiting();
});

// ── Activación: elimina cachés de versiones anteriores ─────────
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(
        claves
          .filter((clave) => clave !== CACHE_VERSION)
          .map((clave) => caches.delete(clave))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first → siempre intenta la red; caché solo si hay error de red ──
self.addEventListener('fetch', (evento) => {
  const url = evento.request.url;

  // Las peticiones al backend de Apps Script NUNCA se cachean
  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    evento.respondWith(fetch(evento.request));
    return;
  }

  // Network-first: trae el archivo fresco de la red y actualiza caché.
  // Solo usa caché si la red falla (modo offline).
  evento.respondWith(
    fetch(evento.request).then((respuestaRed) => {
      if (respuestaRed && respuestaRed.status === 200 && respuestaRed.type !== 'opaque') {
        const clon = respuestaRed.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(evento.request, clon));
      }
      return respuestaRed;
    }).catch(() => {
      return caches.match(evento.request);
    })
  );
});
