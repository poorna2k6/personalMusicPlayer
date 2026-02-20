// Raagam Service Worker — Alarm & Caching
const CACHE_NAME = 'raagam-v3.7';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './music-icon.svg'
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first with cache fallback + navigation fallback to index.html
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip API calls and AI worker — let them go to network directly
  if (url.pathname.includes('/api/') || url.pathname.includes('ai-worker.js')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful same-origin static responses
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Network failed — serve from cache
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // For navigation requests (page loads), serve index.html as fallback
        // so the app shell always loads even offline
        if (event.request.mode === 'navigate') {
          const indexCache = await caches.match('./index.html');
          if (indexCache) return indexCache;
        }
        // No cache hit — return a minimal offline response
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});

// ===== Alarm System =====
let alarmTimers = {};

// Receive messages from main app
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};

  if (type === 'SET_ALARM') {
    const { alarmId, time, songName } = data;
    const delay = new Date(time).getTime() - Date.now();

    if (delay > 0) {
      // Clear existing timer for this alarm
      if (alarmTimers[alarmId]) clearTimeout(alarmTimers[alarmId]);

      console.log(`[SW] Alarm set: ${alarmId}, fires in ${Math.round(delay / 1000)}s`);

      alarmTimers[alarmId] = setTimeout(() => {
        fireAlarmNotification(alarmId, songName);
      }, delay);
    }
  }

  if (type === 'CANCEL_ALARM') {
    const { alarmId } = data;
    if (alarmTimers[alarmId]) {
      clearTimeout(alarmTimers[alarmId]);
      delete alarmTimers[alarmId];
      console.log(`[SW] Alarm cancelled: ${alarmId}`);
    }
  }

  if (type === 'PING') {
    // Keep SW alive — respond to periodic pings
    event.source?.postMessage({ type: 'PONG', timestamp: Date.now() });
  }
});

async function fireAlarmNotification(alarmId, songName) {
  console.log(`[SW] Firing alarm: ${alarmId}`);
  delete alarmTimers[alarmId];

  const title = '\u23f0 Raagam Alarm';
  const body = songName
    ? `Time to wake up! Playing: ${songName}`
    : 'Time to wake up! Your music is ready \u2600\ufe0f';

  // Show notification
  try {
    await self.registration.showNotification(title, {
      body,
      icon: new URL('./music-icon.svg', self.registration.scope).href,
      badge: new URL('./music-icon.svg', self.registration.scope).href,
      tag: 'raagam-alarm',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200, 100, 200],
      actions: [
        { action: 'play', title: '\u25b6 Play Music' },
        { action: 'snooze', title: '\u23f0 Snooze 5min' }
      ],
      data: { alarmId, songName, timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[SW] Notification failed:', err);
  }

  // Also try to wake the app tab directly
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'ALARM_FIRED', alarmId });
    try { client.focus(); } catch (e) { }
  }
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  const { action } = event;
  const { alarmId, songName } = event.notification.data || {};

  event.notification.close();

  if (action === 'snooze') {
    // Snooze for 5 minutes
    const snoozeTime = new Date(Date.now() + 5 * 60000).toISOString();
    alarmTimers[alarmId + '_snooze'] = setTimeout(() => {
      fireAlarmNotification(alarmId, songName);
    }, 5 * 60000);

    // Notify all clients about snooze
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'ALARM_SNOOZED', alarmId, snoozeTime });
        });
      })
    );
    return;
  }

  // Default action or 'play' — open/focus the app and trigger alarm
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Try to focus an existing window
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'ALARM_PLAY', alarmId });
          return;
        }
      }
      // No existing window — open new one
      return self.clients.openWindow(self.registration.scope + '?alarm=trigger').then(client => {
        // The app will check URL params and auto-trigger alarm on load
      });
    })
  );
});
