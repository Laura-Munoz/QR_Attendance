/* ============================================================
   Service Worker — Vida de Yoguis
   Estrategia: Cache-first para assets estáticos.
   Las peticiones a Apps Script siempre van a la red.
   ============================================================ */

const CACHE_VERSION = 'vdy-v1';
const ASSETS_ESTATICOS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
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

// ── Fetch: sirve desde caché; red como fallback ────────────────
self.addEventListener('fetch', (evento) => {
  const url = evento.request.url;

  // Las peticiones al backend de Apps Script NUNCA se cachean
  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    evento.respondWith(fetch(evento.request));
    return;
  }

  // Para el resto: cache-first → si no está en caché, ir a red y guardar
  evento.respondWith(
    caches.match(evento.request).then((respuestaCacheada) => {
      if (respuestaCacheada) return respuestaCacheada;

      return fetch(evento.request).then((respuestaRed) => {
        // Solo cachear respuestas válidas
        if (!respuestaRed || respuestaRed.status !== 200 || respuestaRed.type === 'opaque') {
          return respuestaRed;
        }
        const respuestaClonada = respuestaRed.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(evento.request, respuestaClonada);
        });
        return respuestaRed;
      });
    })
  );
});
