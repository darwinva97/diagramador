/* Service worker: la app funciona sin conexión.
 * - Navegaciones (cualquier ruta del router sirve el mismo index.html): red primero, con un
 *   tope de espera, y si falla o tarda demasiado, lo guardado. Así una red mala no deja la
 *   aplicación colgada cuando en realidad ya la tenemos entera en el equipo.
 * - Resto (manifest, iconos): caché primero.
 * - La API nunca pasa por caché: sesiones y datos en vivo.
 */
const CACHE = 'drawer-v5';
const PRECACHE = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];
const RED_MAX = 4000; // ms que se espera a la red antes de tirar de lo guardado

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const conTiempo = (promesa, ms) => Promise.race([
  promesa,
  new Promise((_, rej) => setTimeout(() => rej(new Error('red lenta')), ms)),
]);

async function navegar(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await conTiempo(fetch(req), RED_MAX);
    if (res && res.ok) await cache.put('/', res.clone());
    return res;
  } catch {
    const guardada = await cache.match('/');
    return guardada || Response.error();
  }
}

async function recurso(req) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const isHtml = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  e.respondWith(isHtml ? navegar(req) : recurso(req));
});
