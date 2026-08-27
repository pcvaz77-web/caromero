const CACHE = 'carometro-commercial-v22';
const CORE = [
  './',
  './index.html',
  './app-core.js?v=3',
  './carometro-config.js?v=3',
  './school-context.js?v=6',
  './mobile.css?v=11',
  './responsive-audit-fixes.css?v=9',
  './carometro-icon-192.png',
  './carometro-icon-512.png'
];
const SENSITIVE_PAGE_NAMES = new Set(['accept-invite.html', 'reset-password.html']);
const STATIC_EXTENSION = /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/i;

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Convites carregam token na query string. Recuperação de senha carrega a
  // sessão no fragmento. Nenhuma dessas páginas deve ficar no Cache Storage.
  if (SENSITIVE_PAGE_NAMES.has(url.pathname.split('/').pop())) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }

  if (!STATIC_EXTENSION.test(url.pathname)) return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(async () => (await caches.match(event.request)) || Response.error())
  );
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body:event.data?.text() || 'Nova atualização no CARÔMETRO.' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'CARÔMETRO', {
    body:data.body || 'Existe uma nova atualização.',
    icon:'./carometro-icon-192.png',
    badge:'./carometro-icon-192.png',
    tag:data.tag || 'carometro',
    renotify:true,
    data:{ url:data.url || './' },
    vibrate:[180, 80, 180]
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const scope = new URL(self.registration.scope);
  let target = new URL('./', scope);
  try {
    const requested = new URL(event.notification.data?.url || './', scope);
    if (requested.origin === scope.origin && requested.pathname.startsWith(scope.pathname)) {
      target = requested;
    }
  } catch {}

  event.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
    const open = list.find(client => client.url.startsWith(scope.href));
    if (open) {
      open.navigate(target.href);
      return open.focus();
    }
    return self.clients.openWindow(target.href);
  }));
});
