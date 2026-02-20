/* ===== Raagam — Spotify-Inspired Music Player ===== */

// ===== DOM Helpers =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const audio = document.querySelector('#audio');
let aiWorker;

// ===== Safe localStorage helper — prevents black screen from corrupted data =====
function safeParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[safeParse] Corrupted localStorage key "${key}" — cleared.`, e);
    try { localStorage.removeItem(key); } catch (_) { }
    return fallback;
  }
}

// ===== Config =====
const CONFIG = {
  apiBase: localStorage.getItem('raagam_api') || 'https://jiosaavn-api-privatecvc2.vercel.app',
  quality: parseInt(localStorage.getItem('raagam_quality') || '3'), // 0-4 index into downloadUrl array
  apiMirrors: [
    'https://jiosaavn-api-privatecvc2.vercel.app',
    'https://saavn-api.vercel.app',
    'https://jiosaavn-api-2.vercel.app',
    'https://jiosaavn-api-rose.vercel.app',
    'https://jiosaavn-api-ivory.vercel.app',
    'https://saavn.dev/api'
  ],
  preferredLanguage: localStorage.getItem('raagam_language') || null,
  userProfile: safeParse('raagam_profile', null),
  supportedLanguages: {
    'hindi': { name: 'Hindi', keywords: ['hindi', 'bollywood', 'filmi', 'indian pop'] },
    'telugu': { name: 'Telugu', keywords: ['telugu', 'tollywood', 'telangana'] },
    'tamil': { name: 'Tamil', keywords: ['tamil', 'kollywood', 'tamilnadu'] },
    'kannada': { name: 'Kannada', keywords: ['kannada', 'sandalwood', 'karnataka'] },
    'malayalam': { name: 'Malayalam', keywords: ['malayalam', 'mollywood', 'kerala'] },
    'punjabi': { name: 'Punjabi', keywords: ['punjabi', 'bhangra', 'punjab'] },
    'bengali': { name: 'Bengali', keywords: ['bengali', 'tollywood', 'bengal'] },
    'marathi': { name: 'Marathi', keywords: ['marathi', 'marathi', 'maharashtra'] },
    'gujarati': { name: 'Gujarati', keywords: ['gujarati', 'gujarat'] },
    'bhojpuri': { name: 'Bhojpuri', keywords: ['bhojpuri', 'bihar', 'uttar pradesh'] },
    'english': { name: 'English', keywords: ['english', 'western', 'pop', 'rock', 'jazz'] },
    'all': { name: 'All Languages', keywords: [] }
  },
  aiApiKey: 'AIzaSyBTYjUYHDUCbZZ1QEHmhYwKdw-8u_yYPxI' // User provided Gemini Key
};

// ===== State =====
const state = {
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  shuffle: false,
  repeat: 'off', // off, all, one
  liked: safeParse('raagam_liked', []),
  recent: safeParse('raagam_recent', []),
  history: safeParse('raagam_history', []),  // [{track, playedAt}]
  currentView: 'home',
  searchCache: {},
  albumCache: {},   // { albumId: albumData }
  homeLoaded: false,
  searchTab: 'songs', // 'songs' | 'albums'
  autoPlayMode: localStorage.getItem('raagam_autoPlay') !== 'false', // intelligent auto-play enabled by default
  playedTracks: [], // tracks played in current session for recommendations
  languageSetupComplete: localStorage.getItem('raagam_language_setup') === 'true',
  userProfile: CONFIG.userProfile,
  favoriteGenres: safeParse('raagam_favorite_genres', []),
  listeningHistory: safeParse('raagam_listening_history', []),
  // New feature states
  sleepTimer: null,         // setTimeout reference
  sleepTimerEnd: null,      // timestamp when sleep fires
  sleepTimerMinutes: 0,     // selected minutes
  playbackSpeed: parseFloat(localStorage.getItem('raagam_speed') || '1'),
  eqPreset: localStorage.getItem('raagam_eq_preset') || 'off',
  lyricsCache: {},          // { trackId: { lyrics, copyright } }
  lyricsVisible: false,
  // Alarm state
  alarm: safeParse('raagam_alarm', null),  // { time, songId, songData, autoplay, gentle }
  alarmTimer: null,
  alarmCheckInterval: null,
  alarmSelectedSong: null,  // temp song selection in dialog
  // Alarm keep-alive system
  alarmKeepAliveAudio: null,
  alarmWakeLock: null,
  alarmSWRegistration: null,
  // Custom Playlists
  playlists: safeParse('raagam_playlists', []), // [{id,name,tracks:[],createdAt}]
  // Crossfade
  crossfadeDuration: parseInt(localStorage.getItem('raagam_crossfade') || '0'), // seconds (0=off)
  crossfadeAudio: null, // second Audio element for crossfade
  crossfadeTimeout: null,
  // Visualizer
  visualizerActive: false,
  visualizerAnimFrame: null,
  // Smart Queue
  smartQueueEnabled: localStorage.getItem('raagam_smartQueue') !== 'false',
  // Theme
  currentTheme: localStorage.getItem('raagam_theme') || 'midnight',
  backdropImage: localStorage.getItem('raagam_backdrop') || null,
  // DJ Mixer
  djActive: false,
  djDecks: [],
  djMasterVolume: 1.0,
  djCrossfaderPos: 50,
  djCrossfaderAssign: { a: 0, b: 1 },
  djMaxDecks: 6,
  djLayoutMode: localStorage.getItem('raagam_djLayout') || 'knobs',
  djAutoEQGlobal: false,
  djAutoFillLang: localStorage.getItem('raagam_djAutoFillLang') || 'all',
  djAutoDJEnabled: false,
  djAutoDJInterval: null,
  djSession: null,  // active DJ session: { pool, setlist, setlistIdx, config, poolFetchedAt }
  // { [deckId]: { enabled: bool, timer: number (seconds) } }
  djAutoLoadNext: {},
  // Offline Mode
  offlineMode: false,
  offlineTracks: new Set(), // Set of track IDs that are downloaded
  offlineDB: null, // IndexedDB instance
  offlineStorageQuota: null, // Available storage in bytes
  offlineDownloadQueue: [], // Queue of tracks to download
  offlineDownloading: new Set(), // Set of track IDs currently downloading
  // ── Priority Feature States ──────────────────────────────────────
  // P1: Skip Signal Learning
  skipSignals: safeParse('raagam_skip_signals', {}),
  // P2/P3: Smart DJ + Vibe Arcs
  smartDJEnabled: localStorage.getItem('raagam_smartdj') === 'true',
  smartDJVibe: localStorage.getItem('raagam_smartdj_vibe') || 'auto',
  smartDJBusy: false,
  // P4: Gapless Playback
  gaplessEnabled: localStorage.getItem('raagam_gapless') === 'true',
  gaplessPreloaded: false,
  gaplessPreloadUrl: null,
  // P5: Volume Normalization
  volumeNormEnabled: localStorage.getItem('raagam_volnorm') !== 'false'
};

// ===== Analytics & Tracking =====
const analytics = {
  sessionId: null,
  startTime: null,
  events: [],
  _sendTimer: null,
  _engagementTimer: null,
  _scrollDepth: 0,
  _clicks: 0,
  _touches: 0,

  // Parse user agent into device/browser info
  parseUserAgent() {
    const ua = navigator.userAgent;
    let browser = 'Unknown', browserVersion = '', os = 'Unknown', osVersion = '', deviceType = 'Desktop', deviceModel = '';

    // Browser detection
    if (ua.includes('CriOS')) { browser = 'Chrome iOS'; browserVersion = ua.match(/CriOS\/(\d+)/)?.[1] || ''; }
    else if (ua.includes('FxiOS')) { browser = 'Firefox iOS'; browserVersion = ua.match(/FxiOS\/(\d+)/)?.[1] || ''; }
    else if (ua.includes('Edg/')) { browser = 'Edge'; browserVersion = ua.match(/Edg\/(\d+)/)?.[1] || ''; }
    else if (ua.includes('OPR/') || ua.includes('Opera')) { browser = 'Opera'; browserVersion = ua.match(/OPR\/(\d+)/)?.[1] || ''; }
    else if (ua.includes('Chrome')) { browser = 'Chrome'; browserVersion = ua.match(/Chrome\/(\d+)/)?.[1] || ''; }
    else if (ua.includes('Safari') && !ua.includes('Chrome')) { browser = 'Safari'; browserVersion = ua.match(/Version\/(\d+)/)?.[1] || ''; }
    else if (ua.includes('Firefox')) { browser = 'Firefox'; browserVersion = ua.match(/Firefox\/(\d+)/)?.[1] || ''; }

    // OS detection
    if (ua.includes('iPhone')) { os = 'iOS'; osVersion = ua.match(/OS (\d+[_\.]\d+)/)?.[1]?.replace('_', '.') || ''; deviceType = 'Mobile'; deviceModel = 'iPhone'; }
    else if (ua.includes('iPad')) { os = 'iPadOS'; osVersion = ua.match(/OS (\d+[_\.]\d+)/)?.[1]?.replace('_', '.') || ''; deviceType = 'Tablet'; deviceModel = 'iPad'; }
    else if (ua.includes('Android')) {
      os = 'Android'; osVersion = ua.match(/Android (\d+[\.]\d*)/)?.[1] || '';
      deviceType = ua.includes('Mobile') ? 'Mobile' : 'Tablet';
      deviceModel = ua.match(/;\s*([^;)]+)\s*Build/)?.[1]?.trim() || ua.match(/;\s*([^;)]+)\s*\)/)?.[1]?.trim() || 'Android Device';
    }
    else if (ua.includes('Windows')) { os = 'Windows'; osVersion = ua.match(/Windows NT (\d+\.\d+)/)?.[1] || ''; }
    else if (ua.includes('Mac OS X')) { os = 'macOS'; osVersion = ua.match(/Mac OS X (\d+[_\.]\d+)/)?.[1]?.replace(/_/g, '.') || ''; }
    else if (ua.includes('Linux')) { os = 'Linux'; }
    else if (ua.includes('CrOS')) { os = 'ChromeOS'; deviceType = 'Desktop'; }

    // Device type fallback via screen
    if (deviceType === 'Desktop' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
      if (screen.width < 768) deviceType = 'Mobile';
      else if (screen.width < 1024) deviceType = 'Tablet';
    }

    return { browser, browserVersion, os, osVersion, deviceType, deviceModel };
  },

  // Get connection info
  getConnectionInfo() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return { connectionType: 'unknown', downlink: null, effectiveType: null, saveData: false };
    return {
      connectionType: conn.type || 'unknown',
      effectiveType: conn.effectiveType || 'unknown',
      downlink: conn.downlink || null,
      saveData: conn.saveData || false
    };
  },

  init() {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    const deviceInfo = this.parseUserAgent();
    const connInfo = this.getConnectionInfo();

    // Rich session start event
    this.trackEvent('session_start', {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages ? navigator.languages.join(',') : navigator.language,
      platform: navigator.platform,
      screenSize: `${screen.width}x${screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      referrer: document.referrer,
      url: window.location.href,
      // Enhanced device info
      browser: deviceInfo.browser,
      browserVersion: deviceInfo.browserVersion,
      os: deviceInfo.os,
      osVersion: deviceInfo.osVersion,
      deviceType: deviceInfo.deviceType,
      deviceModel: deviceInfo.deviceModel,
      // Connection
      connectionType: connInfo.connectionType,
      effectiveType: connInfo.effectiveType,
      downlink: connInfo.downlink,
      saveData: connInfo.saveData,
      // Capabilities
      touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      cookiesEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack === '1',
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: navigator.deviceMemory || null,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      // App state
      isStandalone: window.matchMedia('(display-mode: standalone)').matches,
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      // Returning user?
      isReturningUser: !!localStorage.getItem('raagam_profile'),
      previousSessions: parseInt(localStorage.getItem('raagam_session_count') || '0'),
      likedCount: state.liked.length,
      recentCount: state.recent.length
    });

    // Increment session count
    const sessionCount = parseInt(localStorage.getItem('raagam_session_count') || '0') + 1;
    localStorage.setItem('raagam_session_count', sessionCount);

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.trackEvent('visibility_change', {
        hidden: document.hidden,
        timestamp: Date.now(),
        sessionDuration: Date.now() - this.startTime
      });
    });

    // Track interaction metrics
    document.addEventListener('click', () => this._clicks++);
    document.addEventListener('touchstart', () => this._touches++, { passive: true });

    // Track errors
    window.addEventListener('error', (e) => {
      this.trackEvent('js_error', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno
      });
    });

    window.addEventListener('unhandledrejection', (e) => {
      this.trackEvent('promise_error', {
        reason: e.reason?.message || String(e.reason)
      });
    });

    // Track online/offline
    window.addEventListener('online', () => this.trackEvent('connectivity', { online: true }));
    window.addEventListener('offline', () => this.trackEvent('connectivity', { online: false }));

    // Periodic engagement beacon (every 30s)
    this._engagementTimer = setInterval(() => {
      this.trackEvent('engagement_ping', {
        sessionDuration: Date.now() - this.startTime,
        clicks: this._clicks,
        touches: this._touches,
        currentView: state.currentView,
        isPlaying: state.isPlaying,
        queueLength: state.queue.length
      });
      // Also flush events periodically
      this.sendAnalytics();
    }, 30000);

    // Track before unload
    window.addEventListener('beforeunload', () => {
      clearInterval(this._engagementTimer);
      this.trackEvent('session_end', {
        duration: Date.now() - this.startTime,
        totalEvents: this.events.length,
        totalClicks: this._clicks,
        totalTouches: this._touches,
        tracksPlayed: state.playedTracks.length,
        likedCount: state.liked.length,
        searchesPerformed: Object.keys(state.searchCache).length
      });
      this.sendAnalytics();
    });

    // Send any pending analytics from previous sessions
    const pending = localStorage.getItem('pending_analytics');
    if (pending) {
      try {
        const pendingEvents = JSON.parse(pending);
        if (Array.isArray(pendingEvents) && pendingEvents.length > 0) {
          this.events.push(...pendingEvents);
          localStorage.removeItem('pending_analytics');
        }
      } catch (_) { }
    }
  },

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },

  trackEvent(eventType, data = {}) {
    const event = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      eventType,
      data: {
        ...data,
        currentView: state.currentView,
        currentTrack: state.currentTrack ? {
          id: state.currentTrack.id,
          name: getTrackName(state.currentTrack),
          language: detectLanguage(state.currentTrack)
        } : null
      }
    };

    this.events.push(event);

    // Send events in batches of 10
    if (this.events.length >= 10) {
      this.sendAnalytics();
    }
  },

  trackMusicAction(action, trackData = {}) {
    this.trackEvent('music_action', {
      action,
      track: trackData,
      queueLength: state.queue.length,
      queueIndex: state.queueIndex,
      volume: audio ? audio.volume : null,
      currentTime: audio ? audio.currentTime : null
    });
  },

  trackSearch(query, resultsCount, languageFilter = null) {
    this.trackEvent('search', {
      query,
      resultsCount,
      languageFilter,
      hasResults: resultsCount > 0
    });
  },

  trackNavigation(fromView, toView) {
    this.trackEvent('navigation', { fromView, toView });
  },

  trackFeatureUsage(feature, details = {}) {
    this.trackEvent('feature_usage', { feature, ...details });
  },

  trackPlaybackError(track, error) {
    this.trackEvent('playback_error', {
      trackId: track?.id,
      trackName: track ? getTrackName(track) : null,
      error: error?.message || String(error)
    });
  },

  sendAnalytics() {
    if (this.events.length === 0) return;

    // Production: Vercel-hosted analytics service. Dev/LAN: same host on port 4500.
    const isProduction = window.location.hostname.includes('github.io');
    const backendUrl = isProduction
      ? 'https://raagam-analytics.vercel.app/api/analytics'
      : `http://${window.location.hostname}:4500/api/analytics`;
    const eventsToSend = [...this.events];
    this.events = [];

    // Use sendBeacon for reliability (works during page unload)
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify({ sessionId: this.sessionId, events: eventsToSend })], { type: 'application/json' });
      const sent = navigator.sendBeacon(backendUrl, blob);
      if (sent) {
        console.log(`[Analytics] Beaconed ${eventsToSend.length} events`);
        return;
      }
    }

    // Fallback to fetch
    fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, events: eventsToSend }),
      keepalive: true
    }).then(response => {
      if (response.ok) {
        console.log(`[Analytics] Sent ${eventsToSend.length} events`);
      } else {
        console.warn('[Analytics] Send failed:', response.status);
        this._storeLocally(eventsToSend);
      }
    }).catch(err => {
      console.warn('[Analytics] Send error:', err.message);
      this._storeLocally(eventsToSend);
    });
  },

  _storeLocally(events) {
    try {
      const existing = JSON.parse(localStorage.getItem('pending_analytics') || '[]');
      const merged = existing.concat(events).slice(-200); // keep last 200
      localStorage.setItem('pending_analytics', JSON.stringify(merged));
    } catch (_) { }
  }
};

// ===== API — Fault-Tolerant & Resilient =====

// Circuit breaker state per API mirror
const apiHealth = {
  mirrors: {}, // { url: { failures: 0, lastFail: 0, state: 'closed'|'open'|'half-open', latency: [], successCount: 0 } }
  maxFailures: 3,          // failures before opening circuit
  resetTimeout: 30000,     // 30s before trying a failed API again (half-open)
  requestTimeout: 6000,    // 6s per-request timeout
  maxRetries: 2,           // retry count per mirror before moving on
  retryDelay: 500,         // ms between retries
  healthCheckInterval: 60000, // 1min periodic health check

  // Initialize health tracking for all mirrors
  init() {
    CONFIG.apiMirrors.forEach(url => {
      const stored = JSON.parse(localStorage.getItem(`api_health_${btoa(url)}`) || 'null');
      this.mirrors[url] = stored || {
        failures: 0,
        lastFail: 0,
        state: 'closed',        // closed = healthy, open = broken, half-open = testing
        latency: [],             // recent response times in ms
        successCount: 0,
        lastSuccess: 0
      };
      // If stored state was open but enough time passed, set to half-open
      if (this.mirrors[url].state === 'open' &&
        Date.now() - this.mirrors[url].lastFail > this.resetTimeout) {
        this.mirrors[url].state = 'half-open';
      }
    });
    // Start periodic health checks
    this._healthTimer = setInterval(() => this.healthCheckAll(), this.healthCheckInterval);
    console.log('[API Health] Initialized circuit breakers for', CONFIG.apiMirrors.length, 'mirrors');
  },

  // Record a successful request
  recordSuccess(url, latencyMs) {
    const m = this.mirrors[url];
    if (!m) return;
    m.failures = 0;
    m.state = 'closed';
    m.successCount++;
    m.lastSuccess = Date.now();
    m.latency.push(latencyMs);
    if (m.latency.length > 10) m.latency.shift(); // keep last 10
    this._persist(url);
  },

  // Record a failed request
  recordFailure(url, error) {
    const m = this.mirrors[url];
    if (!m) return;
    m.failures++;
    m.lastFail = Date.now();
    if (m.failures >= this.maxFailures) {
      m.state = 'open';
      console.warn(`[Circuit Breaker] OPENED for ${url} after ${m.failures} failures: ${error}`);
    }
    this._persist(url);
  },

  // Check if a mirror is available to use
  isAvailable(url) {
    const m = this.mirrors[url];
    if (!m) return true;
    if (m.state === 'closed') return true;
    if (m.state === 'half-open') return true; // allow one test request
    // state === 'open': check if reset timeout passed
    if (Date.now() - m.lastFail > this.resetTimeout) {
      m.state = 'half-open';
      console.log(`[Circuit Breaker] Half-open for ${url}, allowing test request`);
      return true;
    }
    return false;
  },

  // Get mirrors sorted by health (best first)
  getSortedMirrors() {
    const preferred = CONFIG.apiBase;
    return [...CONFIG.apiMirrors].sort((a, b) => {
      const ma = this.mirrors[a] || {};
      const mb = this.mirrors[b] || {};
      // Prefer the user's selected API
      if (a === preferred) return -1;
      if (b === preferred) return 1;
      // Prefer closed (healthy) over others
      const stateOrder = { closed: 0, 'half-open': 1, open: 2 };
      const stateDiff = (stateOrder[ma.state] || 0) - (stateOrder[mb.state] || 0);
      if (stateDiff !== 0) return stateDiff;
      // Prefer lower average latency
      const avgA = ma.latency?.length ? ma.latency.reduce((s, v) => s + v, 0) / ma.latency.length : 9999;
      const avgB = mb.latency?.length ? mb.latency.reduce((s, v) => s + v, 0) / mb.latency.length : 9999;
      return avgA - avgB;
    });
  },

  // Get a status summary string
  getStatusSummary() {
    return CONFIG.apiMirrors.map(url => {
      const m = this.mirrors[url] || {};
      const avgLatency = m.latency?.length
        ? Math.round(m.latency.reduce((s, v) => s + v, 0) / m.latency.length)
        : '?';
      const short = url.split('/')[2].split('.')[0];
      return `${short}: ${m.state || '?'} (${avgLatency}ms, ${m.successCount || 0} ok, ${m.failures || 0} fail)`;
    }).join('\n');
  },

  // Periodic health check — pings all mirrors in the background
  async healthCheckAll() {
    console.log('[API Health] Running periodic health check...');
    const checks = CONFIG.apiMirrors.map(async (url) => {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const t0 = performance.now();
        const res = await fetch(`${url}/search/songs?query=test&limit=1`, {
          signal: controller.signal
        });
        clearTimeout(tid);
        const latency = Math.round(performance.now() - t0);
        if (res.ok) {
          this.recordSuccess(url, latency);
        } else {
          this.recordFailure(url, `HTTP ${res.status}`);
        }
      } catch (e) {
        this.recordFailure(url, e.message);
      }
    });
    await Promise.allSettled(checks);
    console.log('[API Health] Check complete:\n' + this.getStatusSummary());
  },

  _persist(url) {
    try {
      localStorage.setItem(`api_health_${btoa(url)}`, JSON.stringify(this.mirrors[url]));
    } catch (_) { /* quota exceeded — ignore */ }
  }
};

// Resilient fetch with timeout, retries, and circuit breaker
async function resilientFetch(path, options = {}) {
  const {
    timeout = apiHealth.requestTimeout,
    maxRetries = apiHealth.maxRetries,
    retryDelay = apiHealth.retryDelay
  } = options;

  const sortedMirrors = apiHealth.getSortedMirrors();
  const errors = [];

  for (const apiUrl of sortedMirrors) {
    // Skip mirrors with open circuit breaker
    if (!apiHealth.isAvailable(apiUrl)) {
      console.log(`[Resilient] Skipping ${apiUrl} (circuit open)`);
      continue;
    }

    // Retry loop for this mirror
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const t0 = performance.now();

        const fullUrl = `${apiUrl}${path}`;
        console.log(`[Resilient] ${apiUrl} attempt ${attempt}/${maxRetries}`);

        const res = await fetch(fullUrl, {
          signal: controller.signal,
          ...options.fetchOptions
        });

        clearTimeout(timeoutId);
        const latency = Math.round(performance.now() - t0);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        apiHealth.recordSuccess(apiUrl, latency);

        // Auto-switch to faster/working API
        if (apiUrl !== CONFIG.apiBase) {
          CONFIG.apiBase = apiUrl;
          localStorage.setItem('raagam_api', apiUrl);
          const short = apiUrl.split('/')[2];
          showToast(`Switched to working API: ${short}`);
          const apiInput = $('#api-server');
          if (apiInput) apiInput.value = apiUrl;
        }

        return { data: json, mirror: apiUrl, latency };
      } catch (e) {
        const errMsg = e.name === 'AbortError' ? 'Timeout' : e.message;
        errors.push({ mirror: apiUrl, attempt, error: errMsg });
        console.warn(`[Resilient] ${apiUrl} attempt ${attempt} failed: ${errMsg}`);

        // On last attempt for this mirror, record failure
        if (attempt === maxRetries) {
          apiHealth.recordFailure(apiUrl, errMsg);
        } else {
          // Wait before retry (with exponential backoff)
          await new Promise(r => setTimeout(r, retryDelay * attempt));
        }
      }
    }
  }

  // All mirrors exhausted
  console.error('[Resilient] All API mirrors failed:', errors);
  return { data: null, errors };
}

// Main search function — uses resilient fetch
async function apiSearch(query, limit = 20) {
  const cacheKey = `${query}_${limit}`;
  if (state.searchCache[cacheKey]) return state.searchCache[cacheKey];

  const result = await resilientFetch(
    `/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`
  );

  if (result.data) {
    const results = result.data.data?.results || [];
    if (results.length > 0) {
      state.searchCache[cacheKey] = results;
      return results;
    }
  }

  // All APIs failed — show meaningful error
  if (result.errors) {
    const failedCount = new Set(result.errors.map(e => e.mirror)).size;
    showToast(`Music APIs unavailable (${failedCount} servers tried)`);
  }
  return [];
}

// Album search — searches for albums via JioSaavn API
async function apiSearchAlbums(query, limit = 15) {
  const cacheKey = `album_${query}_${limit}`;
  if (state.searchCache[cacheKey]) return state.searchCache[cacheKey];

  const result = await resilientFetch(
    `/search/albums?query=${encodeURIComponent(query)}&limit=${limit}`
  );

  if (result.data) {
    const results = result.data.data?.results || [];
    if (results.length > 0) {
      state.searchCache[cacheKey] = results;
      return results;
    }
  }
  return [];
}

// Fetch album details (all tracks)
async function fetchAlbumDetails(albumId) {
  if (state.albumCache[albumId]) return state.albumCache[albumId];

  const result = await resilientFetch(
    `/albums?id=${encodeURIComponent(albumId)}`
  );

  if (result.data) {
    const album = result.data.data;
    if (album) {
      state.albumCache[albumId] = album;
      return album;
    }
  }
  return null;
}

// ===== Helpers =====
function getImage(track, quality) {
  const imgs = track.image || [];
  const idx = quality === 'high' ? imgs.length - 1 : quality === 'mid' ? 1 : 0;
  const img = imgs[idx] || imgs[imgs.length - 1] || {};
  return img.url || img.link || '';
}

function getAudioUrl(track) {
  const urls = track.downloadUrl || [];
  const idx = Math.min(CONFIG.quality, urls.length - 1);
  const dl = urls[idx] || urls[urls.length - 1] || {};
  return dl.url || dl.link || '';
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function decodeHtml(html) {
  const t = document.createElement('textarea');
  t.innerHTML = html || '';
  return t.value;
}

function getArtistName(track) {
  if (typeof track.primaryArtists === 'string') return decodeHtml(track.primaryArtists);
  if (track.artists?.primary) return track.artists.primary.map(a => a.name).join(', ');
  return 'Unknown Artist';
}

function getTrackName(track) {
  return decodeHtml(track.name || track.title || 'Unknown');
}

function getAlbumName(track) {
  if (typeof track.album === 'string') return decodeHtml(track.album);
  return decodeHtml(track.album?.name || '');
}

function isLiked(trackId) {
  return state.liked.some(t => t.id === trackId);
}

function toggleLike(track) {
  const idx = state.liked.findIndex(t => t.id === track.id);
  const wasLiked = idx >= 0;

  if (wasLiked) {
    state.liked.splice(idx, 1);
    showToast('Removed from Liked Songs');
    analytics.trackMusicAction('unlike', {
      trackId: track.id,
      trackName: getTrackName(track)
    });
  } else {
    state.liked.unshift(track);
    showToast('Added to Liked Songs');
    analytics.trackMusicAction('like', {
      trackId: track.id,
      trackName: getTrackName(track)
    });
  }
  localStorage.setItem('raagam_liked', JSON.stringify(state.liked));
  updateLikeButtons();
  updateLibraryCounts();
  autoBackup.schedule(); // auto-backup liked songs to IndexedDB
}

function addToRecent(track) {
  state.recent = state.recent.filter(t => t.id !== track.id);
  state.recent.unshift(track);
  if (state.recent.length > 50) state.recent = state.recent.slice(0, 50);
  localStorage.setItem('raagam_recent', JSON.stringify(state.recent));

  // Add to history with timestamp (keep up to 500 entries)
  state.history.unshift({ track, playedAt: Date.now() });
  if (state.history.length > 500) state.history = state.history.slice(0, 500);
  localStorage.setItem('raagam_history', JSON.stringify(state.history));

  updateLibraryCounts();
}

function showToast(msg) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// ===== Language & Genre Functions =====
function detectLanguage(track) {
  const text = `${getTrackName(track)} ${getAlbumName(track)} ${getArtistName(track)}`.toLowerCase();

  for (const [langCode, langData] of Object.entries(CONFIG.supportedLanguages)) {
    if (langCode === 'all') continue;

    for (const keyword of langData.keywords) {
      if (text.includes(keyword)) {
        return langCode;
      }
    }
  }

  return 'all'; // Default to all languages if no specific language detected
}

function filterTracksByLanguage(tracks, preferredLanguage) {
  if (!preferredLanguage || preferredLanguage === 'all') return tracks;

  // First, get tracks that match the preferred language
  const preferredTracks = tracks.filter(track => detectLanguage(track) === preferredLanguage);

  // If we have enough preferred tracks, return them
  if (preferredTracks.length >= 5) return preferredTracks;

  // Otherwise, return preferred tracks first, then others
  const otherTracks = tracks.filter(track => detectLanguage(track) !== preferredLanguage);
  return [...preferredTracks, ...otherTracks];
}

function detectGenre(track) {
  const text = `${getTrackName(track)} ${getAlbumName(track)}`.toLowerCase();

  const genreKeywords = {
    'pop': ['pop', 'dance', 'party', 'club', 'remix'],
    'rock': ['rock', 'metal', 'alternative', 'indie', 'punk'],
    'hip-hop': ['hip hop', 'rap', 'hip-hop', 'trap', 'r&b'],
    'classical': ['classical', 'instrumental', 'orchestra', 'symphony'],
    'folk': ['folk', 'traditional', 'regional', 'desi'],
    'romantic': ['love', 'romantic', 'romance', 'heart', 'jaan'],
    'devotional': ['bhajan', 'devotional', 'spiritual', 'temple', 'god'],
    'patriotic': ['desh', 'bharat', 'india', 'national', 'patriotic']
  };

  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return genre;
      }
    }
  }

  return 'general';
}

// ===== Improved Recommendations =====
function getRecommendedTracks(currentTrack, allTracks, playedTracks = [], maxRecommendations = 5) {
  if (!currentTrack || !allTracks.length) return [];

  const playedIds = new Set(playedTracks.map(t => t.id));
  const availableTracks = allTracks.filter(t => t.id !== currentTrack.id && !playedIds.has(t.id));

  if (availableTracks.length === 0) return [];

  // Detect current track's language and genre
  const currentLanguage = detectLanguage(currentTrack);
  const currentGenre = detectGenre(currentTrack);

  // Calculate similarity scores for each track
  const scoredTracks = availableTracks.map(track => ({
    ...track,
    score: calculateSimilarityScore(currentTrack, track, currentLanguage, currentGenre)
  }));

  // Sort by score descending, then take a wider pool for variety selection
  const sorted = scoredTracks.sort((a, b) => b.score - a.score);
  const pool = sorted.slice(0, maxRecommendations * 3);

  // Variety pass: select from pool ensuring no two adjacent tracks share an artist
  const result = [];
  const usedIds = new Set();
  for (const track of pool) {
    if (result.length >= maxRecommendations) break;
    if (usedIds.has(track.id)) continue;
    const prev = result[result.length - 1];
    if (prev && getArtistName(prev) === getArtistName(track)) continue; // skip back-to-back same artist
    result.push(track);
    usedIds.add(track.id);
  }
  // Fill remaining slots if strict filtering left gaps
  for (const track of sorted) {
    if (result.length >= maxRecommendations) break;
    if (!usedIds.has(track.id)) { result.push(track); usedIds.add(track.id); }
  }
  return result;
}

function calculateSimilarityScore(track1, track2, currentLanguage, currentGenre) {
  let score = 0;

  // Language match: highest priority for preferred language
  const track2Language = detectLanguage(track2);
  if (track2Language === currentLanguage && currentLanguage !== 'all') {
    score += 100; // Very high weight for same language
  } else if (track2Language === CONFIG.preferredLanguage) {
    score += 80; // High weight for preferred language
  }

  // Genre match: high weight
  const track2Genre = detectGenre(track2);
  if (track2Genre === currentGenre && currentGenre !== 'general') {
    score += 60;
  }

  // Same artist: smaller affinity bonus — full +40 caused too much same-artist clustering
  if (getArtistName(track1) === getArtistName(track2)) {
    score += 15;
  }

  // Same album: small weight
  if (getAlbumName(track1) === getAlbumName(track2)) {
    score += 10;
  }

  // Anti-clustering: penalise artists the listener has heard recently
  // Keeps the DJ session feeling varied and party-like rather than artist-locked
  const recentArtists = (state.playedTracks || []).slice(0, 5).map(t => getArtistName(t));
  const artistOccurrences = recentArtists.filter(a => a === getArtistName(track2)).length;
  score -= artistOccurrences * 25; // -25 per recent occurrence (compounding)
  if (recentArtists[0] === getArtistName(track2)) score -= 20; // extra hit for back-to-back

  // Variety bonus: reward an artist the listener hasn't heard in the last 3 tracks
  if (!recentArtists.slice(0, 3).includes(getArtistName(track2))) score += 18;

  // Theme/keyword matching (reduced weight)
  const themeKeywords = [
    'love', 'romantic', 'heart', 'jaan', 'pyar', 'sad', 'happy', 'emotional',
    'party', 'dance', 'remix', 'slow', 'fast', 'classical', 'folk'
  ];

  const title1Words = getTrackName(track1).toLowerCase().split(/\s+/);
  const title2Words = getTrackName(track2).toLowerCase().split(/\s+/);

  const commonThemeWords = title1Words.filter(word =>
    title2Words.includes(word) && themeKeywords.includes(word)
  );

  score += commonThemeWords.length * 10;

  // Duration similarity: small boost
  const duration1 = track1.duration || 0;
  const duration2 = track2.duration || 0;
  if (Math.abs(duration1 - duration2) <= 120) {
    score += 5;
  }

  // P1: Skip signal penalty — down-rank skipped artists/genres
  const skipArtist = state.skipSignals[`artist:${getArtistName(track2)}`] || 0;
  const skipGenre = state.skipSignals[`genre:${detectGenre(track2)}`] || 0;
  score -= skipArtist * 15;
  score -= skipGenre * 8;

  return score;
}

// ===== P1: Skip Signal Learning =====
function recordSkipSignal(track) {
  if (!track || !state.playStartTime) return;
  const listenMs = Date.now() - state.playStartTime;
  if (listenMs > 30000) return; // listened 30s+ = not a skip
  const artistKey = `artist:${getArtistName(track)}`;
  const genreKey = `genre:${detectGenre(track)}`;
  state.skipSignals[artistKey] = Math.min((state.skipSignals[artistKey] || 0) + 1, 10);
  if (detectGenre(track) !== 'general') {
    state.skipSignals[genreKey] = Math.min((state.skipSignals[genreKey] || 0) + 1, 10);
  }
  localStorage.setItem('raagam_skip_signals', JSON.stringify(state.skipSignals));
}

// ===== P6: Time-of-Day Context =====
function getTimeOfDayContext() {
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return { label: 'Morning', icon: '🌅', queries: ['devotional morning songs', 'classical peaceful', 'bhakti songs soft'] };
  if (h >= 9 && h < 13) return { label: 'Focus', icon: '🎯', queries: ['instrumental focus music', 'acoustic calm light', 'soft concentration'] };
  if (h >= 13 && h < 17) return { label: 'Afternoon', icon: '☀️', queries: ['peppy upbeat trending', 'latest hits energy', 'dance remix popular'] };
  if (h >= 17 && h < 21) return { label: 'Evening', icon: '🌆', queries: ['romantic evening songs', 'mood chill relax', 'feel good music'] };
  return { label: 'Night', icon: '🌙', queries: ['slow romantic night', 'soft lullaby soothing', 'chill lofi night'] };
}

// ===== UNIFIED AUTO DJ ENGINE =====
// Works in any mode — one tap, fully automatic, zero manual steps.
// Regular player: intelligent queue + auto-crossfade.
// DJ mixer: auto-fill decks + auto-mix (separate djMixer.toggleAutoDJ).

const SMART_DJ_VIBES = {
  auto: { label: 'Auto', icon: '🕐', queries: null },           // time-based
  morning: { label: 'Morning Raga', icon: '🌅', queries: ['devotional morning', 'classical acoustic peaceful', 'bhakti soft'] },
  focus: { label: 'Focus', icon: '🎯', queries: ['instrumental focus', 'acoustic calm lofi', 'study concentration'] },
  workout: { label: 'Workout', icon: '💪', queries: ['dance remix energetic', 'party beats fast', 'high energy songs'] },
  party: { label: 'Party', icon: '🎉', queries: ['party remix hits', 'dance floor peppy', 'upbeat dj songs'] },
  chill: { label: 'Chill', icon: '😎', queries: ['chill lofi soft', 'mellow acoustic calm', 'relax songs slow'] },
  romantic: { label: 'Romantic', icon: '💕', queries: ['romantic love songs', 'pyar heart touching', 'love ballad'] },
  winddown: { label: 'Wind Down', icon: '🌙', queries: ['slow soothing night', 'soft lullaby peaceful', 'classical slow'] }
};

// ─── DJ SESSION: Energy Arcs & Pool Queries ───────────────────────────────────
// Energy arc templates: arrays of target energy levels (0=chill, 1=med, 2=high, 3=peak)
// Each position = one track in the setlist
const ENERGY_ARCS = {
  party: [1, 1, 2, 2, 3, 3, 3, 2, 3, 3, 3, 3, 2, 3, 3, 3, 2, 2, 1, 1],
  workout: [2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 2, 3, 2, 2],
  morning: [0, 0, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0],
  focus: [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1],
  chill: [0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1],
  romantic: [1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1],
  winddown: [2, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  auto: null  // generated from time of day
};

// Pool queries per vibe — 5 diverse queries each, fetched in parallel for ~100 songs
const DJ_POOL_QUERIES = {
  party: ['party remix energetic', 'dance hits fast beat', 'dj songs club night', 'upbeat peppy trending', 'bhangra dance remix'],
  workout: ['gym workout power songs', 'high energy fast beat', 'running motivation songs', 'pump up remix', 'energetic exercise songs'],
  morning: ['morning fresh devotional', 'bhakti songs soft', 'classical peaceful morning', 'light acoustic fresh start', 'sunrise peaceful songs'],
  focus: ['instrumental concentration', 'acoustic study calm lofi', 'soft background focus', 'light instrumental work', 'calm ambient peaceful'],
  chill: ['chill lofi soft relax', 'mellow slow acoustic', 'easy listening soothing', 'soft night chill', 'peaceful slow mood'],
  romantic: ['romantic love songs', 'pyar heart touching melody', 'love ballad duet', 'slow romantic night', 'emotional love songs'],
  winddown: ['slow soothing night songs', 'lullaby soft sleep', 'peaceful bedtime classical', 'calm gentle night', 'slow melodious wind down'],
  trending: ['trending songs 2025 latest', 'top hits popular', 'viral songs most played', 'new release hot', 'chartbuster hits']
};

// Energy level visual labels and colours used in arc strips
const ENERGY_META = [
  { label: 'Chill', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },  // 0
  { label: 'Medium', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },  // 1
  { label: 'High', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },  // 2
  { label: 'Peak', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },  // 3
];

// Energy levels for progression-aware mixing (0=low → 3=peak)
function getEnergyLevel(track) {
  if (!track) return 1;
  const text = `${getTrackName(track)} ${getAlbumName(track)} ${detectGenre(track)} ${detectMood(track)}`.toLowerCase();
  if (/party|dance|remix|edm|fast beat|electronic|disco|bhangra|workout|energy/.test(text)) return 3;
  if (/pop|folk|peppy|upbeat|happy|hip.?hop|bhangra/.test(text)) return 2;
  if (/romantic|love|melody|soft|acoustic|light/.test(text)) return 1;
  if (/classical|devotional|slow|sad|lullaby|bhakti|chill|lofi|sleep|night/.test(text)) return 0;
  return 1;
}

function getSmartDJQueries() {
  const vibe = SMART_DJ_VIBES[state.smartDJVibe];
  if (!vibe || vibe.queries === null) return getTimeOfDayContext().queries;
  return vibe.queries;
}

// ── Main toggle: one tap = ON immediately, second tap = change vibe or OFF ──
function toggleSmartDJ() {
  if (!state.smartDJEnabled) {
    // FIRST TAP — start immediately, no dialog
    state.smartDJEnabled = true;
    localStorage.setItem('raagam_smartdj', 'true');
    _activateAutoDJ();
  } else {
    // ALREADY ON — show vibe picker to change vibe or stop
    _showAutoDJVibeMenu();
  }
}

function _activateAutoDJ() {
  const vibe = SMART_DJ_VIBES[state.smartDJVibe] || SMART_DJ_VIBES.auto;

  // Save current crossfade so we can restore it on stop
  state._prevCrossfade = state.crossfadeDuration;
  if (state.crossfadeDuration < 5) setCrossfade(6); // ensure smooth transitions

  // Enable gapless pre-buffering for seamless handoff
  if (!state.gaplessEnabled) {
    state.gaplessEnabled = true;
    localStorage.setItem('raagam_gapless', 'true');
    const gbtn = $('#settings-gapless');
    if (gbtn) gbtn.textContent = 'On';
  }

  updateSmartDJUI();

  const timeCtx = getTimeOfDayContext();
  showToast(`🎧 Auto DJ ON · ${vibe.icon} ${vibe.label === 'Auto' ? timeCtx.label : vibe.label} · mixing...`);
  analytics.trackFeatureUsage('auto_dj_on', { vibe: state.smartDJVibe });

  if (!state.currentTrack) {
    // Nothing playing — fetch songs and start
    _autoDJBootstrap();
  } else {
    buildSmartDJQueue();
  }
}

async function _autoDJBootstrap() {
  // No current track → search, build queue, and play
  const queries = getSmartDJQueries();
  const lang = CONFIG.preferredLanguage || 'hindi';
  const ld = CONFIG.supportedLanguages[lang];
  const lk = ld?.keywords?.[0] || lang;
  const q = `${lk} ${queries[0]}`;
  showToast('Auto DJ: finding songs...');
  try {
    const results = await apiSearch(q, 15);
    if (!results.length) { showToast('Auto DJ: no songs found. Try a different language.'); return; }
    state.queue = results;
    state.queueIndex = 0;
    playSong(results[0], false);
    renderQueue();
  } catch (e) { console.warn('[Auto DJ bootstrap]', e); }
}

function stopAutoDJMode() {
  state.smartDJEnabled = false;
  localStorage.setItem('raagam_smartdj', 'false');
  // Restore previous crossfade
  if (typeof state._prevCrossfade === 'number') {
    setCrossfade(state._prevCrossfade);
    state._prevCrossfade = undefined;
  }
  updateSmartDJUI();
  showToast('Auto DJ OFF');
  analytics.trackFeatureUsage('auto_dj_off');
}

function _showAutoDJVibeMenu() {
  document.querySelector('.smart-dj-picker')?.remove();
  const picker = document.createElement('div');
  picker.className = 'smart-dj-picker';
  picker.innerHTML = `
    <div class="sdj-backdrop"></div>
    <div class="sdj-panel">
      <div class="sdj-header">
        <div>
          <h3>🎧 Auto DJ — Active</h3>
          <p class="sdj-subhead">Choose a vibe or turn off</p>
        </div>
        <button class="sdj-close">✕</button>
      </div>
      <div class="sdj-vibes">
        ${Object.entries(SMART_DJ_VIBES).map(([key, v]) => `
          <button class="sdj-vibe-btn${state.smartDJVibe === key ? ' active' : ''}" data-vibe="${key}">
            <span class="sdj-vibe-icon">${v.icon}</span>
            <span>${v.label}</span>
          </button>`).join('')}
      </div>
      <button class="sdj-start">Apply Vibe</button>
      <button class="sdj-stop">Turn Off Auto DJ</button>
    </div>`;
  document.body.appendChild(picker);

  picker.querySelector('.sdj-backdrop').addEventListener('click', () => picker.remove());
  picker.querySelector('.sdj-close').addEventListener('click', () => picker.remove());
  picker.querySelectorAll('.sdj-vibe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      picker.querySelectorAll('.sdj-vibe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.smartDJVibe = btn.dataset.vibe;
      localStorage.setItem('raagam_smartdj_vibe', state.smartDJVibe);
    });
  });
  picker.querySelector('.sdj-start').addEventListener('click', () => {
    picker.remove();
    const vibe = SMART_DJ_VIBES[state.smartDJVibe];
    showToast(`Auto DJ: switched to ${vibe.icon} ${vibe.label}`);
    buildSmartDJQueue();
  });
  picker.querySelector('.sdj-stop').addEventListener('click', () => {
    picker.remove();
    stopAutoDJMode();
  });
}

function updateSmartDJUI() {
  const active = state.smartDJEnabled;
  $$('.auto-dj-btn').forEach(btn => btn.classList.toggle('active', active));
  // Mini player badge
  const badge = $('#mini-autodj-badge');
  if (badge) badge.style.display = active ? 'flex' : 'none';
}

async function buildSmartDJQueue() {
  if (state.smartDJBusy || !state.smartDJEnabled) return;
  state.smartDJBusy = true;
  try {
    const queries = getSmartDJQueries();
    const query = queries[Math.floor(Math.random() * queries.length)];
    const lang = CONFIG.preferredLanguage;
    let searchQuery = query;
    if (lang && lang !== 'all') {
      const ld = CONFIG.supportedLanguages[lang];
      if (ld) searchQuery = `${ld.keywords[0]} ${query}`;
    }

    const results = await apiSearch(searchQuery, 25);
    if (!results.length) return;

    const playedIds = new Set(state.playedTracks.map(t => t.id));
    const existingIds = new Set(state.queue.map(t => t.id));
    const fresh = results.filter(t => !playedIds.has(t.id) && !existingIds.has(t.id));
    const pool = fresh.length >= 5 ? fresh : results.filter(t => !existingIds.has(t.id));
    if (!pool.length) return;

    // Score using similarity + energy matching + anti-clustering
    const curTrack = state.currentTrack;
    const curEnergy = getEnergyLevel(curTrack);
    const recentArtists = (state.playedTracks || []).slice(0, 5).map(t => getArtistName(t));

    const scored = pool.map(t => {
      let s = curTrack
        ? calculateSimilarityScore(curTrack, t, detectLanguage(curTrack), detectGenre(curTrack))
        : 0;
      // Prefer tracks within ±1 energy level of current
      const energyDiff = Math.abs(getEnergyLevel(t) - curEnergy);
      s += energyDiff === 0 ? 20 : energyDiff === 1 ? 10 : 0;
      // Party DJ anti-clustering: penalise recently heard artists
      const artistCount = recentArtists.filter(a => a === getArtistName(t)).length;
      s -= artistCount * 30;
      if (!recentArtists.slice(0, 3).includes(getArtistName(t))) s += 20; // variety bonus
      return { ...t, _score: s };
    }).sort((a, b) => b._score - a._score);

    // Take top candidates, then ensure no two adjacent tracks share an artist
    const candidates = scored.slice(0, 12);
    const picks = [];
    const usedIds = new Set(state.queue.map(t => t.id));
    for (const t of candidates) {
      if (picks.length >= 6) break;
      if (usedIds.has(t.id)) continue;
      const prev = picks[picks.length - 1];
      if (prev && getArtistName(prev) === getArtistName(t)) continue;
      picks.push(t);
      usedIds.add(t.id);
    }
    // Fill any remaining slots without the adjacency restriction
    for (const t of scored) {
      if (picks.length >= 6) break;
      if (!usedIds.has(t.id)) { picks.push(t); usedIds.add(t.id); }
    }

    state.queue.splice(state.queueIndex + 1, 0, ...picks);
    renderQueue();

    const vibe = SMART_DJ_VIBES[state.smartDJVibe];
    const timeLabel = vibe?.label === 'Auto' ? getTimeOfDayContext().label : vibe?.label;
    showToast(`Auto DJ: ${picks.length} tracks queued · ${vibe?.icon || '🎧'} ${timeLabel}`);
  } catch (e) {
    console.warn('[Auto DJ]', e);
  } finally {
    state.smartDJBusy = false;
  }
}

// ===== P4: Gapless Playback =====
function setupGaplessListener() {
  audio.addEventListener('timeupdate', () => {
    if (!state.gaplessEnabled || state.crossfadeDuration > 0) return;
    if (!audio.duration || state.gaplessPreloaded) return;
    const remaining = audio.duration - audio.currentTime;
    if (remaining > 25 || remaining <= 0) return;
    const nextIdx = state.shuffle
      ? Math.floor(Math.random() * state.queue.length)
      : state.queueIndex + 1;
    if (nextIdx >= state.queue.length) return;
    const nextTrack = state.queue[nextIdx];
    const nextUrl = getAudioUrl(nextTrack);
    if (!nextUrl || nextUrl === state.gaplessPreloadUrl) return;
    state.gaplessPreloadUrl = nextUrl;
    state.gaplessPreloaded = true;
    if (!state.crossfadeAudio) state.crossfadeAudio = new Audio();
    state.crossfadeAudio.preload = 'auto';
    state.crossfadeAudio.src = nextUrl;
    state.crossfadeAudio.volume = audio.volume;
    state.crossfadeAudio.load();
    console.log('[Gapless] Pre-buffering next track');
  });
}

function toggleGapless() {
  state.gaplessEnabled = !state.gaplessEnabled;
  localStorage.setItem('raagam_gapless', state.gaplessEnabled ? 'true' : 'false');
  const btn = $('#settings-gapless');
  if (btn) btn.textContent = state.gaplessEnabled ? 'On' : 'Off';
  showToast(state.gaplessEnabled ? 'Gapless playback ON — pre-buffers next song' : 'Gapless playback OFF');
  analytics.trackFeatureUsage('gapless_toggle', { enabled: state.gaplessEnabled });
}

// ===== P5: Volume Normalization =====
function toggleVolumeNorm() {
  state.volumeNormEnabled = !state.volumeNormEnabled;
  localStorage.setItem('raagam_volnorm', state.volumeNormEnabled ? 'true' : 'false');
  if (equalizer.compressor && equalizer.context) {
    const now = equalizer.context.currentTime;
    if (state.volumeNormEnabled) {
      equalizer.compressor.threshold.setValueAtTime(-18, now);
      equalizer.compressor.ratio.setValueAtTime(4, now);
    } else {
      equalizer.compressor.threshold.setValueAtTime(0, now);
      equalizer.compressor.ratio.setValueAtTime(1, now);
    }
  }
  const btn = $('#settings-volnorm');
  if (btn) btn.textContent = state.volumeNormEnabled ? 'On' : 'Off';
  showToast(state.volumeNormEnabled ? 'Volume normalization ON — consistent loudness' : 'Volume normalization OFF');
  analytics.trackFeatureUsage('volnorm_toggle', { enabled: state.volumeNormEnabled });
}

// ===== P7: Daily Mixes =====
async function generateDailyMixes() {
  const today = new Date().toDateString();
  try {
    const stored = JSON.parse(localStorage.getItem('raagam_daily_mixes') || 'null');
    if (stored?.date === today && stored?.mixes?.length) return stored.mixes;
  } catch (e) { }
  const lang = CONFIG.preferredLanguage || 'hindi';
  const ld = CONFIG.supportedLanguages[lang];
  const lk = ld?.keywords[0] || 'hindi';
  const timeCtx = getTimeOfDayContext();
  const likedArtist = state.liked.length
    ? getArtistName(state.liked[Math.floor(Math.random() * Math.min(state.liked.length, 5))])
    : null;
  const mixes = [
    {
      id: 'mix-liked', title: 'Your Daily Mix',
      subtitle: state.liked.length > 0 ? `Based on ${state.liked.length} liked songs` : 'Popular picks for you',
      icon: '❤️', gradient: 'linear-gradient(135deg,#e91e63,#9c27b0)',
      query: likedArtist ? `${likedArtist} songs` : `${lk} trending songs`
    },
    {
      id: 'mix-time', title: timeCtx.label + ' Mix',
      subtitle: 'Perfect for right now', icon: timeCtx.icon,
      gradient: 'linear-gradient(135deg,#1DB954,#005f2e)',
      query: `${lk} ${timeCtx.queries[0]}`
    },
    {
      id: 'mix-discover', title: 'Discover Weekly',
      subtitle: "Fresh songs you haven't heard", icon: '🔍',
      gradient: 'linear-gradient(135deg,#7c3aed,#1e3a8a)',
      query: `new latest ${lk} songs 2025`
    },
    {
      id: 'mix-chill', title: 'Chill Vibes',
      subtitle: 'Sit back and relax', icon: '😎',
      gradient: 'linear-gradient(135deg,#0891b2,#164e63)',
      query: `${lk} chill lofi soft songs`
    },
    {
      id: 'mix-party', title: 'Party Starter',
      subtitle: 'Turn up the energy', icon: '🎉',
      gradient: 'linear-gradient(135deg,#dc2626,#7c3aed)',
      query: `${lk} party dance remix energetic`
    }
  ];
  localStorage.setItem('raagam_daily_mixes', JSON.stringify({ date: today, mixes }));
  return mixes;
}

function renderLoader() {
  return '<div class="loader"><div class="spinner"></div></div>';
}

async function renderDailyMixes(aiGeneratedMixes = null) {
  const container = $('#daily-mixes-row');
  if (!container) return;

  // Show skeleton cards instantly while we validate each mix has real tracks
  container.innerHTML = [0, 1, 2, 3, 4].map(() => `
    <div style="flex-shrink:0;width:140px">
      <div class="skeleton skeleton-card" style="height:140px;border-radius:12px"></div>
      <div class="skeleton skeleton-text" style="width:80%;margin-top:8px"></div>
      <div class="skeleton skeleton-text-sm" style="width:60%;margin-top:4px"></div>
    </div>`).join('');

  try {
    let mixes;
    const today = new Date().toDateString();
    const cacheKey = 'raagam_validated_mixes';

    if (aiGeneratedMixes) {
      // We have new mixes from the AI Worker!
      mixes = aiGeneratedMixes.map(mix => ({
        id: `ai-mix-${Date.now()}-${Math.random()}`,
        title: mix.title,
        subtitle: mix.description,
        icon: '✨',
        gradient: `linear-gradient(135deg, ${mix.color || '#4f46e5'}, #1e1b4b)`,
        query: `${CONFIG.preferredLanguage || 'hindi'} ${mix.vibe}`,
        vibe: mix.vibe // custom data
      }));
    } else {
      const cached = safeParse(cacheKey, null);
      // Reuse today's validated mixes if available — zero API calls
      if (cached?.date === today && cached?.mixes?.length) {
        _renderValidatedMixCards(container, cached.mixes);
        return;
      }
      mixes = await generateDailyMixes();
    }

    const MIN_TRACKS = 3;

    // Validate all mixes in parallel: only keep those that return >= MIN_TRACKS real tracks
    const validated = await Promise.all(
      mixes.map(async mix => {
        try {
          const tracks = await apiSearch(mix.query, MIN_TRACKS + 2);
          return tracks.length >= MIN_TRACKS ? { ...mix, tracks } : null;
        } catch { return null; }
      })
    );

    const validMixes = validated.filter(Boolean);

    // Cache validated mixes for the rest of the day (only if not AI generated)
    if (!aiGeneratedMixes) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ date: today, mixes: validMixes }));
      } catch { }
    }

    _renderValidatedMixCards(container, validMixes);
  } catch (e) {
    console.warn('[Daily Mixes]', e);
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:20px;text-align:center">Daily mixes unavailable. Check your connection.</p>';
  }
}

// Renders mix cards for validated mixes (those that confirmed >= 3 tracks)
function _renderValidatedMixCards(container, mixes) {
  if (!mixes.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:20px;text-align:center">No mixes available right now.</p>';
    return;
  }

  container.innerHTML = mixes.map((mix, i) => `
    <div class="mix-card" data-mix-idx="${i}">
      <div class="mix-card-art" style="background:${mix.gradient}">
        <span class="mix-card-icon">${mix.icon}</span>
        <button class="mix-play-btn" aria-label="Play ${mix.title}">▶</button>
      </div>
      <p class="mix-card-title">${mix.title}</p>
      <p class="mix-card-sub">${mix.subtitle} · ${mix.tracks?.length || 3}+ tracks</p>
    </div>`).join('');

  container.querySelectorAll('.mix-card').forEach(card => {
    const mix = mixes[parseInt(card.dataset.mixIdx, 10)];
    card.addEventListener('click', async () => {
      showToast(`Loading ${mix.title}...`);

      // If AI mix with custom vibe, we use the original aiWorker to get a playlist
      if (mix.vibe && CONFIG.aiApiKey) {
        state.smartDJBusy = true;
        updateSmartDJUI();
        if (!aiWorker) initAIWorker();
        aiWorker.postMessage({
          type: 'GENERATE_PLAYLIST',
          payload: { vibe: mix.vibe, language: CONFIG.preferredLanguage || 'hindi' },
          apiKey: CONFIG.aiApiKey
        });
        return;
      }

      // Otherwise, standard offline mix handling
      // Start with pre-validated tracks; fetch more to fill out the queue
      let tracks = [...(mix.tracks || [])];
      if (tracks.length < 10) {
        try {
          const more = await apiSearch(mix.query, 15);
          const existIds = new Set(tracks.map(t => t.id));
          tracks = [...tracks, ...more.filter(t => !existIds.has(t.id))];
        } catch { }
      }
      if (!tracks.length) { showToast('Could not load mix'); return; }
      state.queue = tracks; state.queueIndex = 0;
      playSong(tracks[0], false);
      renderQueue();
    });
  });
}

function detectMood(track) {
  const text = `${getTrackName(track)} ${getAlbumName(track)}`.toLowerCase();

  if (text.includes('prema') || text.includes('love') || text.includes('romantic')) {
    return 'romantic';
  }
  if (text.includes('folk') || text.includes('traditional') || text.includes('dance')) {
    return 'folk';
  }
  if (text.includes('classical') || text.includes('raaga') || text.includes('carnatic')) {
    return 'classical';
  }
  if (text.includes('devotional') || text.includes('bhakti')) {
    return 'devotional';
  }

  return 'general';
}

// ===== Rendering =====
function renderSongCard(track) {
  const div = document.createElement('div');
  div.className = 'song-card';
  div.innerHTML = `
    <div class="song-card-art">
      <img src="${getImage(track, 'mid')}" alt="" loading="lazy" />
      <div class="song-card-play">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </div>
    <p class="song-card-title">${getTrackName(track)}</p>
    <p class="song-card-artist">${getArtistName(track)}</p>
  `;
  div.addEventListener('click', () => playSong(track));
  return div;
}

function renderResultItem(track, showArt = true) {
  const div = document.createElement('div');
  div.className = 'result-item';
  const isCurrent = state.currentTrack?.id === track.id;
  const artistName = getArtistName(track);
  div.innerHTML = `
    ${showArt ? `<div class="result-art"><img src="${getImage(track, 'low')}" alt="" loading="lazy" /></div>` : ''}
    <div class="result-info">
      <p class="result-title" ${isCurrent ? 'style="color:var(--accent)"' : ''}>${getTrackName(track)}</p>
      <p class="result-sub"><span class="artist-link" data-artist="${artistName.replace(/"/g, '&quot;')}">${artistName}</span>${getAlbumName(track) ? ' · ' + getAlbumName(track) : ''}</p>
    </div>
    <div class="result-actions">
      <button class="download-btn icon-btn" aria-label="Download for offline" title="Download for offline" style="padding:6px;">↓</button>
      <button class="result-radio-btn icon-btn" aria-label="Song Radio" title="Song Radio" style="padding:6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#b3b3b3"><path d="M3.24 6.15C2.51 6.43 2 7.17 2 8v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8c0-.83-.51-1.57-1.24-1.85L12 2 3.24 6.15zM7 20v-8l5 4 5-4v8"/></svg>
      </button>
      <button class="result-add-playlist-btn icon-btn" aria-label="Add to Playlist" title="Add to Playlist" style="padding:6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#b3b3b3"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>
      ${isCurrent ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></svg>' : ''}
    </div>
  `;
  div.querySelector('.result-info').addEventListener('click', () => playSong(track));
  const artistLink = div.querySelector('.artist-link');
  if (artistLink) {
    artistLink.addEventListener('click', (e) => {
      e.stopPropagation();
      openArtistProfile(artistName);
    });
  }

  // Add download button functionality
  addDownloadButtonToResult(div, track);

  const radioBtn = div.querySelector('.result-radio-btn');
  if (radioBtn) radioBtn.addEventListener('click', (e) => { e.stopPropagation(); startSongRadio(track); });
  const addPlBtn = div.querySelector('.result-add-playlist-btn');
  if (addPlBtn) addPlBtn.addEventListener('click', (e) => { e.stopPropagation(); showAddToPlaylistMenu(track); });
  return div;
}

function renderSkeletons(container, count = 5) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const d = document.createElement('div');
    d.style.cssText = 'flex-shrink:0';
    d.innerHTML = `
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text-sm"></div>
    `;
    container.appendChild(d);
  }
}

// ===== AI Worker Setup =====
function initAIWorker() {
  if (!aiWorker) {
    aiWorker = new Worker('ai-worker.js?v=' + Date.now());
    aiWorker.onerror = (e) => {
      console.error('[Main] AI Worker Error:', e.message, 'in', e.filename, 'line', e.lineno);
    };
    aiWorker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'LOG') {
        console.log(payload);
        document.title = "Worker LOG: " + payload; // Debug
        return;
      }
      if (type === 'PLAYLIST_GENERATED') {
        playSmartPlaylist(payload);
      } else if (type === 'DAILY_MIX_GENERATED') {
        renderDailyMixes(payload);
      } else if (type === 'SEARCH_ANALYZED') {
        handleSmartSearchResults(payload);
      } else if (type === 'ERROR') {
        console.error('AI Error:', payload);
        state.smartDJBusy = false;
        updateSmartDJUI();
      }
    };
  }
}

// ===== Home Page =====
async function loadHome() {
  if (state.homeLoaded) return;

  updateGreeting();

  // ── Instant sections (no API needed) ────────────────────────────────────────

  // Quick Picks from recent plays — rendered immediately
  const quickPicks = $('#quick-picks');
  const recentForPicks = state.recent.slice(0, 6);
  if (recentForPicks.length > 0) {
    quickPicks.innerHTML = recentForPicks.map(t => `
      <div class="quick-card" data-id="${t.id}">
        <img src="${getImage(t, 'low')}" alt="" loading="lazy" />
        <span>${getTrackName(t)}</span>
      </div>`).join('');
    quickPicks.querySelectorAll('.quick-card').forEach((card, i) => {
      card.addEventListener('click', () => playSong(recentForPicks[i]));
    });
  } else {
    quickPicks.innerHTML = '';
  }

  // Recently Played — rendered immediately from local state
  const recentRow = $('#recent-row');
  if (state.recent.length > 0) {
    recentRow.innerHTML = '';
    state.recent.slice(0, 10).forEach(t => recentRow.appendChild(renderSongCard(t)));
  } else {
    recentRow.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:20px;text-align:center">Play some songs to see them here</p>';
  }

  // Daily Mixes — async but shows skeletons immediately, only renders valid categories
  if (CONFIG.aiApiKey) {
    if (!aiWorker) initAIWorker();
    aiWorker.postMessage({
      type: 'GENERATE_DAILY_MIX',
      payload: { language: CONFIG.preferredLanguage || 'hindi' },
      apiKey: CONFIG.aiApiKey
    });
    // Render skeletons immediately while waiting for worker
    renderDailyMixes();
  } else {
    // Fallback to local deterministic generator
    renderDailyMixes();
  }

  // ── API sections (cached for fast reload) ──────────────────────────────────

  const lang = CONFIG.preferredLanguage || 'hindi';
  const langName = CONFIG.supportedLanguages[lang]?.name || 'Hindi';
  const currentYear = new Date().getFullYear();

  const trendingTitle = $('#trending-title');
  const languageTitle = $('#language-title');
  const bollywoodTitle = $('#bollywood-title');
  if (trendingTitle) trendingTitle.textContent = `Trending ${langName} Now`;
  if (languageTitle) languageTitle.textContent = `Latest ${langName} Hits`;
  if (bollywoodTitle) bollywoodTitle.textContent = lang === 'hindi' ? 'Bollywood Party Mix' : 'Bollywood Vibes';

  const sections = [
    { id: 'trending-row', query: `trending ${langName} songs ${currentYear}` },
    { id: 'language-row', query: `new ${langName} songs ${currentYear} latest` },
    { id: 'bollywood-row', query: lang === 'hindi' ? `bollywood party songs ${currentYear}` : `bollywood top hits ${currentYear}` },
    { id: 'chill-row', query: 'chill lofi relax' },
  ];

  // Try today's cache — renders instantly with zero API calls
  const today = new Date().toDateString();
  const sectionCacheKey = `raagam_home_${lang}_${today}`;
  const cachedSections = safeParse(sectionCacheKey, null);

  if (cachedSections?.length) {
    sections.forEach((s, i) => {
      const container = $(`#${s.id}`);
      if (!container) return;
      const cached = cachedSections[i];
      if (cached?.length) {
        container.innerHTML = '';
        cached.forEach(t => container.appendChild(renderSongCard(t)));
      } else {
        container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:20px">Could not load. Check your connection.</p>';
      }
    });
    state.homeLoaded = true;
    // Silently refresh cache in background so next session gets fresh content
    setTimeout(() => _refreshHomeSections(sections, sectionCacheKey), 6000);
    return;
  }

  // First load today: show skeletons → fetch all sections in parallel → cache results
  sections.forEach(s => renderSkeletons($(`#${s.id}`)));

  const results = await Promise.all(sections.map(s => apiSearch(s.query, 15)));
  const toCache = [];
  results.forEach((tracks, i) => {
    const container = $(`#${sections[i].id}`);
    if (!container) return;
    container.innerHTML = '';
    if (tracks.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:20px">Could not load. Check your connection.</p>';
      toCache.push([]);
    } else {
      tracks.forEach(t => container.appendChild(renderSongCard(t)));
      toCache.push(tracks);
    }
  });

  try { localStorage.setItem(sectionCacheKey, JSON.stringify(toCache)); } catch { }

  state.homeLoaded = true;
}

// Runs silently in the background to keep the home cache fresh for next session
async function _refreshHomeSections(sections, cacheKey) {
  try {
    const results = await Promise.all(sections.map(s => apiSearch(s.query, 15)));
    const toCache = results.map(tracks => (tracks.length ? tracks : []));
    localStorage.setItem(cacheKey, JSON.stringify(toCache));
  } catch { }
}

// ===== Search =====
let searchDebounce;
function setupSearch() {
  const input = $('#search-input');
  const clearBtn = $('#search-clear');
  const resultsContainer = $('#search-results');
  const categories = $('#browse-categories');

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.classList.toggle('hidden', !q);

    clearTimeout(searchDebounce);
    if (!q) {
      categories.classList.remove('hidden');
      // Clear search tabs and results
      const tabs = resultsContainer.querySelector('.search-tabs');
      if (tabs) tabs.remove();
      resultsContainer.querySelectorAll('.result-section-title, .result-item, .album-result-item, .loader, .empty-state').forEach(e => e.remove());
      return;
    }

    categories.classList.add('hidden');
    searchDebounce = setTimeout(() => performSearch(q), 400);
  });

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (!q) return;
      // Smart Search Trigger: Long query (> 3 words or > 15 chars) + AI Key present
      if (CONFIG.aiApiKey && (q.length > 20 || q.split(' ').length > 3)) {
        clearTimeout(searchDebounce);
        showToast('Asking AI...');
        state.smartDJBusy = true;
        resultsContainer.innerHTML = `<div style="padding:40px;text-align:center;"><p style="color:#888;margin-bottom:20px;">Analyzing your request...</p>${renderLoader()}</div>`;
        if (!aiWorker) initAIWorker();
        aiWorker.postMessage({ type: 'INTELLIGENT_SEARCH', payload: { query: q }, apiKey: CONFIG.aiApiKey });
      } else {
        performSearch(q); // Force immediate search
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    categories.classList.remove('hidden');
    const tabs = resultsContainer.querySelector('.search-tabs');
    if (tabs) tabs.remove();
    resultsContainer.querySelectorAll('.result-section-title, .result-item, .album-result-item, .loader, .empty-state').forEach(e => e.remove());
    input.focus();
  });

  // Language filter
  $('#search-language-filter').addEventListener('change', () => {
    const q = input.value.trim();
    if (q) {
      performSearch(q);
    }
  });

  // Categories
  const cats = [
    { name: 'Telugu', color: '#1DB954', query: 'telugu songs' },
    { name: 'Hindi', color: '#E13300', query: 'hindi songs bollywood' },
    { name: 'English', color: '#5038A0', query: 'english pop hits' },
    { name: 'Tamil', color: '#148A08', query: 'tamil songs latest' },
    { name: 'Romantic', color: '#E8115B', query: 'romantic love songs' },
    { name: 'Devotional', color: '#F59B23', query: 'devotional songs telugu' },
    { name: 'Party', color: '#DC148C', query: 'party dance songs' },
    { name: 'Old Classics', color: '#477D95', query: 'old classic telugu songs' },
  ];

  const grid = $('#category-grid');
  grid.innerHTML = cats.map(c => `
    <div class="category-card" style="background:${c.color}" data-query="${c.query}">
      ${c.name}
    </div>
  `).join('');

  grid.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const q = card.dataset.query;
      input.value = q;
      clearBtn.classList.remove('hidden');
      categories.classList.add('hidden');
      performSearch(q);
    });
  });

  // Voice search
  const voiceBtn = $('#voice-search-btn');
  if (voiceBtn) {
    voiceBtn.addEventListener('click', startVoiceSearch);
  }
}

function renderSearchTabs(container, query) {
  let tabs = container.querySelector('.search-tabs');
  if (!tabs) {
    tabs = document.createElement('div');
    tabs.className = 'search-tabs';
    tabs.innerHTML = `
      <button class="search-tab ${state.searchTab === 'songs' ? 'active' : ''}" data-tab="songs">Songs</button>
      <button class="search-tab ${state.searchTab === 'albums' ? 'active' : ''}" data-tab="albums">Albums</button>
    `;
    container.insertBefore(tabs, container.querySelector('#browse-categories')?.nextSibling || container.firstChild);
  }
  // Update active state
  tabs.querySelectorAll('.search-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.searchTab));

  // Remove old listeners by cloning
  const newTabs = tabs.cloneNode(true);
  tabs.parentNode.replaceChild(newTabs, tabs);
  newTabs.querySelectorAll('.search-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.searchTab = btn.dataset.tab;
      performSearch(query);
    });
  });
}

function handleSmartSearchResults(result) {
  state.smartDJBusy = false;
  const input = $('#search-input');

  if (result.isNaturalLanguage) {
    const q = result.searchQuery;
    showToast(`AI: Searching for "${q}"`);
    if (input) input.value = q; // Update input logic

    // Optional: Show mood/artist toast
    if (result.mood) showToast(`Mood: ${result.mood}`);
    if (result.artist) showToast(`Artist: ${result.artist}`);

    performSearch(q);
  } else {
    // Fallback if AI thinks it's not a complex request
    performSearch(result.searchQuery || (input ? input.value : ''));
  }
}

async function performSearch(query) {
  const resultsContainer = $('#search-results');
  const languageFilter = $('#search-language-filter').value;

  // Clear old results (keep tabs)
  resultsContainer.querySelectorAll('.result-section-title, .result-item, .album-result-item, .loader, .empty-state, .album-detail-view').forEach(e => e.remove());

  // Render search tabs
  renderSearchTabs(resultsContainer, query);

  // Show loader
  const loader = document.createElement('div');
  loader.innerHTML = renderLoader();
  resultsContainer.appendChild(loader.firstElementChild);

  // If language filter is set, include it in search query
  let searchQuery = query;
  if (languageFilter && languageFilter !== 'all') {
    const langData = CONFIG.supportedLanguages[languageFilter];
    if (langData && langData.keywords[0]) {
      searchQuery = `${query} ${langData.keywords[0]}`;
    }
  }

  if (state.searchTab === 'albums') {
    // Album search
    const albums = await apiSearchAlbums(searchQuery, 20);
    resultsContainer.querySelectorAll('.loader').forEach(e => e.remove());

    if (albums.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
        <p>No albums found for "${query}"</p>
      `;
      resultsContainer.appendChild(empty);
      return;
    }

    const title = document.createElement('p');
    title.className = 'result-section-title';
    title.textContent = 'Albums';
    resultsContainer.appendChild(title);

    albums.forEach(album => resultsContainer.appendChild(renderAlbumItem(album)));
    analytics.trackSearch(query, albums.length, languageFilter);
  } else if (state.searchTab === 'podcasts') {
    // Podcast search
    const podcasts = await searchPodcasts(searchQuery);
    resultsContainer.querySelectorAll('.loader').forEach(e => e.remove());

    if (podcasts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
        <p>No podcasts found for "${query}"</p>
      `;
      resultsContainer.appendChild(empty);
      return;
    }

    const title = document.createElement('p');
    title.className = 'result-section-title';
    title.textContent = 'Podcasts';
    resultsContainer.appendChild(title);

    podcasts.forEach(podcast => resultsContainer.appendChild(renderPodcastItem(podcast)));
    analytics.trackSearch(query, podcasts.length, languageFilter);
  } else {
    // Song search (existing)
    const tracks = await apiSearch(searchQuery, 25);
    resultsContainer.querySelectorAll('.loader').forEach(e => e.remove());

    let filteredTracks = tracks;
    if (languageFilter && languageFilter !== 'all') {
      filteredTracks = tracks.filter(track => detectLanguage(track) === languageFilter);
    }

    // Apply parental controls filtering
    filteredTracks = filterSearchResults(filteredTracks);

    if (filteredTracks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <p>No ${languageFilter && languageFilter !== 'all' ? CONFIG.supportedLanguages[languageFilter].name + ' ' : ''}results found for "${query}"</p>
      `;
      resultsContainer.appendChild(empty);
      return;
    }

    const title = document.createElement('p');
    title.className = 'result-section-title';
    title.textContent = languageFilter && languageFilter !== 'all' ? `${CONFIG.supportedLanguages[languageFilter].name} Songs` : 'Songs';
    resultsContainer.appendChild(title);

    filteredTracks.forEach(t => resultsContainer.appendChild(renderResultItem(t)));
    analytics.trackSearch(query, filteredTracks.length, languageFilter);
  }
}

// ===== Album Rendering =====
function renderAlbumItem(album) {
  const div = document.createElement('div');
  div.className = 'album-result-item';
  const imgs = album.image || [];
  const imgUrl = (imgs[imgs.length - 1] || imgs[0])?.url || (imgs[imgs.length - 1] || imgs[0])?.link || '';
  const albumName = decodeHtml(album.name || album.title || 'Unknown Album');
  const artistName = album.artists?.primary?.map(a => a.name).join(', ') || album.primaryArtists || album.artist || 'Unknown';
  const year = album.year || '';
  const songCount = album.songCount || album.songs?.length || '';

  div.innerHTML = `
    <div class="album-result-art">
      <img src="${imgUrl}" alt="" loading="lazy" />
      <div class="album-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
      </div>
    </div>
    <div class="result-info">
      <p class="result-title">${albumName}</p>
      <p class="result-sub">${artistName}${year ? ' · ' + year : ''}${songCount ? ' · ' + songCount + ' songs' : ''}</p>
    </div>
    <div class="result-action">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#b3b3b3"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
    </div>
  `;
  div.addEventListener('click', () => openAlbumDetail(album));
  return div;
}

async function openAlbumDetail(album) {
  const resultsContainer = $('#search-results');

  // Clear current results
  resultsContainer.querySelectorAll('.result-section-title, .result-item, .album-result-item, .loader, .empty-state, .album-detail-view').forEach(e => e.remove());

  // Show loader
  const loader = document.createElement('div');
  loader.innerHTML = renderLoader();
  resultsContainer.appendChild(loader.firstElementChild);

  const albumId = album.id;
  const albumData = await fetchAlbumDetails(albumId);

  resultsContainer.querySelectorAll('.loader').forEach(e => e.remove());

  if (!albumData) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<p>Could not load album details</p>';
    resultsContainer.appendChild(empty);
    return;
  }

  const detail = document.createElement('div');
  detail.className = 'album-detail-view';

  const imgs = albumData.image || album.image || [];
  const imgUrl = (imgs[imgs.length - 1] || imgs[0])?.url || (imgs[imgs.length - 1] || imgs[0])?.link || '';
  const albumName = decodeHtml(albumData.name || albumData.title || album.name || 'Album');
  const artistName = albumData.artists?.primary?.map(a => a.name).join(', ') || albumData.primaryArtists || albumData.artist || '';
  const year = albumData.year || album.year || '';
  const songs = albumData.songs || [];

  detail.innerHTML = `
    <div class="album-detail-header">
      <button class="album-back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        Back
      </button>
    </div>
    <div class="album-detail-info">
      <img class="album-detail-art" src="${imgUrl}" alt="" />
      <div class="album-detail-meta">
        <h2 class="album-detail-name">${albumName}</h2>
        <p class="album-detail-artist">${artistName}</p>
        <p class="album-detail-stats">${year ? year + ' · ' : ''}${songs.length} song${songs.length !== 1 ? 's' : ''}</p>
        <button class="album-play-all-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z"/></svg>
          Play All
        </button>
      </div>
    </div>
    <div class="album-detail-tracks"></div>
  `;

  resultsContainer.appendChild(detail);

  // Back button
  detail.querySelector('.album-back-btn').addEventListener('click', () => {
    const q = $('#search-input').value.trim();
    if (q) performSearch(q);
  });

  // Play All button
  detail.querySelector('.album-play-all-btn').addEventListener('click', () => {
    if (songs.length > 0) {
      // Clear queue and add all album songs
      state.queue = [...songs];
      state.queueIndex = 0;
      playSong(songs[0], false);
      showToast(`Playing "${albumName}" (${songs.length} songs)`);
    }
  });

  // Render tracks
  const trackList = detail.querySelector('.album-detail-tracks');
  songs.forEach((track, idx) => {
    const item = document.createElement('div');
    item.className = 'result-item album-track-item';
    const isCurrent = state.currentTrack?.id === track.id;
    item.innerHTML = `
      <span class="album-track-num">${idx + 1}</span>
      <div class="result-info">
        <p class="result-title" ${isCurrent ? 'style="color:var(--accent)"' : ''}>${getTrackName(track)}</p>
        <p class="result-sub">${getArtistName(track)}${track.duration ? ' · ' + formatTime(track.duration) : ''}</p>
      </div>
    `;
    item.addEventListener('click', () => {
      // Play this song and queue remaining album songs
      state.queue = [...songs];
      state.queueIndex = idx;
      playSong(track, false);
    });
    trackList.appendChild(item);
  });

  analytics.trackEvent('album_opened', { albumId, albumName, songCount: songs.length });
}

// ===== Player =====
function playSong(track, addToQueue = true) {
  const url = getAudioUrl(track);
  if (!url) {
    showToast('No audio available for this track');
    analytics.trackMusicAction('play_failed', { track: track.id });
    return;
  }

  state.currentTrack = track;

  // Track played tracks for recommendations (keep last 20)
  state.playedTracks = state.playedTracks.filter(t => t.id !== track.id);
  state.playedTracks.unshift(track);
  if (state.playedTracks.length > 20) state.playedTracks = state.playedTracks.slice(0, 20);

  // P4: Reset gapless pre-buffer state for new track
  state.gaplessPreloaded = false;
  state.gaplessPreloadUrl = null;

  // P2: Smart DJ — build more songs when queue is running low
  if (state.smartDJEnabled && (state.queue.length - state.queueIndex) <= 3) {
    setTimeout(() => buildSmartDJQueue(), 3000);
  }

  if (addToQueue) {
    // Add to queue after current position
    const existsIdx = state.queue.findIndex(t => t.id === track.id);
    if (existsIdx >= 0) {
      state.queueIndex = existsIdx;
    } else {
      state.queueIndex = state.queue.length;
      state.queue.push(track);
    }
  }

  audio.src = url;
  audio.playbackRate = state.playbackSpeed; // Maintain speed setting
  audio.play().then(() => {
    state.isPlaying = true;
    // Track user stats
    if (state.userProfile) {
      state.userProfile.stats.totalSongsPlayed++;
      state.playStartTime = Date.now();
      saveUserProfile();
    }
    updatePlayerUI();
    analytics.trackMusicAction('play', {
      trackId: track.id,
      trackName: getTrackName(track),
      artist: getArtistName(track),
      language: detectLanguage(track),
      genre: detectGenre(track),
      source: 'user_click' // or 'auto_play', 'queue_next', etc.
    });
  }).catch(e => {
    // AbortError: previous play() was interrupted by a new src assignment — not a real error
    if (e.name === 'AbortError') return;
    console.error('Playback error:', e);
    showToast('Could not play this track');
    analytics.trackMusicAction('play_error', { track: track.id, error: e.message });
  });

  addToRecent(track);
  updatePlayerUI();
  updateMiniPlayer();
  updateNowPlaying();
  // Hide lyrics when switching songs (user can reopen)
  if (state.lyricsVisible) hideLyrics();
  // Check lyrics availability for this track and show/hide button
  checkLyricsAvailability(track.id);
}

function togglePlay() {
  if (!state.currentTrack) return;
  if (audio.paused) {
    audio.play().catch(e => {
      if (e.name === 'AbortError') return; // interrupted by new src — harmless
      if (e.name === 'NotAllowedError') {
        showToast('Tap to play — browser needs a gesture first');
      } else {
        showToast('Could not resume playback');
      }
      state.isPlaying = false;
      updatePlayerUI();
    });
    state.isPlaying = true;
    analytics.trackMusicAction('resume');
  } else {
    audio.pause();
    state.isPlaying = false;
    analytics.trackMusicAction('pause');
  }
  updatePlayerUI();
}

function playNext() {
  // P1: Record skip if user moved on early (< 30s of a non-ending track)
  if (state.currentTrack && audio.duration && audio.currentTime < audio.duration - 2) {
    recordSkipSignal(state.currentTrack);
  }
  if (state.queue.length === 0) {
    // If queue is empty, try smart queue, then auto-play
    if (state.smartQueueEnabled && state.currentTrack) {
      getSmartQueueSuggestions().then(() => {
        if (state.queue.length > state.queueIndex + 1) {
          state.queueIndex++;
          playSong(state.queue[state.queueIndex], false);
        } else if (state.autoPlayMode) {
          getAutoPlayRecommendations();
        }
      });
      return;
    }
    if (state.autoPlayMode && state.currentTrack) {
      getAutoPlayRecommendations();
      return;
    }
    return;
  }

  if (state.repeat === 'one') {
    audio.currentTime = 0;
    audio.play();
    return;
  }

  let nextIdx;
  if (state.shuffle) {
    nextIdx = Math.floor(Math.random() * state.queue.length);
  } else {
    nextIdx = state.queueIndex + 1;
    if (nextIdx >= state.queue.length) {
      if (state.repeat === 'all') nextIdx = 0;
      else {
        // Queue finished, try smart queue then auto-play
        if (state.smartQueueEnabled && state.currentTrack) {
          getSmartQueueSuggestions().then(() => {
            if (state.queue.length > state.queueIndex + 1) {
              state.queueIndex++;
              playSong(state.queue[state.queueIndex], false);
            } else if (state.autoPlayMode) {
              getAutoPlayRecommendations();
            }
          });
          return;
        }
        if (state.autoPlayMode && state.currentTrack) {
          getAutoPlayRecommendations();
          return;
        }
        state.isPlaying = false;
        updatePlayerUI();
        return;
      }
    }
  }

  state.queueIndex = nextIdx;
  playSong(state.queue[nextIdx], false);
  analytics.trackMusicAction('next', { shuffle: state.shuffle, repeat: state.repeat });
}

function playPrev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    analytics.trackMusicAction('rewind');
    return;
  }
  if (state.queue.length === 0) return;

  let prevIdx = state.queueIndex - 1;
  if (prevIdx < 0) prevIdx = state.repeat === 'all' ? state.queue.length - 1 : 0;

  state.queueIndex = prevIdx;
  playSong(state.queue[prevIdx], false);
  analytics.trackMusicAction('previous');
}

function playFromQueue(index) {
  if (index >= 0 && index < state.queue.length) {
    state.queueIndex = index;
    playSong(state.queue[index], false);
  }
}

async function getAutoPlayRecommendations() {
  if (!state.currentTrack) return;

  showToast('Finding similar songs...');

  try {
    // Detect current track's language and genre for better recommendations
    const currentLanguage = detectLanguage(state.currentTrack);
    const currentGenre = detectGenre(state.currentTrack);

    // Create search queries based on language and genre (Spotify-like approach)
    let searchQueries = [];

    // Primary: Search for songs in the same language and genre
    if (currentLanguage !== 'all') {
      const langData = CONFIG.supportedLanguages[currentLanguage];
      if (langData) {
        searchQueries.push(`${langData.keywords[0]} ${currentGenre}`);
        searchQueries.push(`${langData.keywords[0]} songs`);
      }
    }

    // Secondary: Search for genre-specific songs
    if (currentGenre !== 'general') {
      searchQueries.push(`${currentGenre} songs`);
      searchQueries.push(`${currentGenre} music`);
    }

    // Tertiary: Search for artist if no good matches found
    if (searchQueries.length === 0) {
      searchQueries.push(getArtistName(state.currentTrack));
    }

    // P6: Time-of-day context — prepend one contextual query
    const timeCtx = getTimeOfDayContext();
    searchQueries.unshift(timeCtx.queries[0]);

    // Try each search query until we find good recommendations
    let allResults = [];
    for (const query of searchQueries) {
      const results = await apiSearch(query, 15);
      allResults = allResults.concat(results);

      // If we have enough results, break
      if (allResults.length >= 20) break;
    }

    // Remove duplicates
    const uniqueResults = allResults.filter((track, index, self) =>
      index === self.findIndex(t => t.id === track.id)
    );

    if (uniqueResults.length === 0) {
      showToast('No recommendations found');
      state.isPlaying = false;
      updatePlayerUI();
      return;
    }

    // Filter by preferred language and get recommendations
    const filteredResults = filterTracksByLanguage(uniqueResults, CONFIG.preferredLanguage);
    const recommendations = getRecommendedTracks(state.currentTrack, filteredResults, state.playedTracks, 3);

    if (recommendations.length === 0) {
      // Fallback to random from filtered results
      const randomTrack = filteredResults[Math.floor(Math.random() * Math.min(filteredResults.length, 5))];
      playSong(randomTrack);
      return;
    }

    // Add recommendations to queue and play first one
    state.queue = recommendations;
    state.queueIndex = 0;
    playSong(recommendations[0], false);

    showToast(`Playing ${recommendations.length} recommended ${currentGenre} songs`);
  } catch (e) {
    console.error('Auto-play error:', e);
    showToast('Could not get recommendations');
    state.isPlaying = false;
    updatePlayerUI();
  }
}

function removeFromQueue(index) {
  if (index === state.queueIndex) return; // can't remove currently playing
  state.queue.splice(index, 1);
  if (index < state.queueIndex) state.queueIndex--;
  renderQueue();
}

// ===== Sleep Timer =====
function openSleepTimerDialog() {
  const dialog = $('#sleep-timer-dialog');
  dialog.classList.remove('hidden');
  updateSleepTimerDialogUI();
}

function closeSleepTimerDialog() {
  $('#sleep-timer-dialog').classList.add('hidden');
}

function setSleepTimer(minutes) {
  // Clear any existing timer
  if (state.sleepTimer) clearTimeout(state.sleepTimer);
  if (state.sleepTimerInterval) clearInterval(state.sleepTimerInterval);

  state.sleepTimerMinutes = minutes;
  state.sleepTimerEnd = Date.now() + minutes * 60 * 1000;

  state.sleepTimer = setTimeout(() => {
    audio.pause();
    state.isPlaying = false;
    updatePlayerUI();
    showToast('Sleep timer — music stopped 🌙');
    clearSleepTimer();
  }, minutes * 60 * 1000);

  // Update countdown every second
  state.sleepTimerInterval = setInterval(updateSleepTimerUI, 1000);

  updateSleepTimerUI();
  closeSleepTimerDialog();
  showToast(`Sleep timer set for ${minutes} minutes 🌙`);
  analytics.trackEvent('sleep_timer_set', { minutes });
}

function clearSleepTimer() {
  if (state.sleepTimer) clearTimeout(state.sleepTimer);
  if (state.sleepTimerInterval) clearInterval(state.sleepTimerInterval);
  state.sleepTimer = null;
  state.sleepTimerEnd = null;
  state.sleepTimerMinutes = 0;
  updateSleepTimerUI();
}

function updateSleepTimerUI() {
  const label = $('#sleep-label');
  const btn = $('#np-sleep-btn');
  const settingsBtn = $('#settings-sleep-timer');

  if (state.sleepTimerEnd) {
    const remaining = Math.max(0, state.sleepTimerEnd - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const text = mins > 0 ? `${mins}m` : `${secs}s`;
    if (label) label.textContent = text;
    if (btn) btn.classList.add('active');
    if (settingsBtn) settingsBtn.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (remaining === 0) clearSleepTimer();
  } else {
    if (label) label.textContent = 'Sleep';
    if (btn) btn.classList.remove('active');
    if (settingsBtn) settingsBtn.textContent = 'Off';
  }
}

function updateSleepTimerDialogUI() {
  $$('.sleep-option').forEach(opt => {
    opt.classList.toggle('active', parseInt(opt.dataset.minutes) === state.sleepTimerMinutes && state.sleepTimerEnd);
  });
  const statusEl = $('#sleep-timer-status');
  if (state.sleepTimerEnd) {
    const remaining = Math.max(0, Math.ceil((state.sleepTimerEnd - Date.now()) / 60000));
    statusEl.textContent = `Timer active — ${remaining} min remaining`;
    statusEl.style.color = '#1DB954';
  } else {
    statusEl.textContent = 'Music will stop after the selected time';
    statusEl.style.color = '#b3b3b3';
  }
}

// ===== Lyrics =====
async function fetchLyrics(trackId) {
  if (state.lyricsCache[trackId]) return state.lyricsCache[trackId];

  try {
    // Try primary approach: JioSaavn lyrics endpoint
    const res = await resilientFetch(`/lyrics?id=${trackId}`);
    // resilientFetch returns { data: json } where json is the API response
    // API structures vary: { data: { lyrics } } or { lyrics } or { data: { data: { lyrics } } }
    const json = res?.data;
    if (!json) return null;

    // Try nested data.data.lyrics (some mirrors)
    const lyricsText = json?.data?.lyrics || json?.lyrics || json?.data?.data?.lyrics;
    if (lyricsText && lyricsText.trim().length > 0) {
      const result = {
        lyrics: lyricsText,
        copyright: json?.data?.copyright || json?.copyright || json?.data?.snippet || ''
      };
      state.lyricsCache[trackId] = result;
      return result;
    }
  } catch (e) {
    console.warn('Lyrics fetch failed:', e);
  }

  // Cache negative result to avoid repeated requests
  state.lyricsCache[trackId] = null;
  return null;
}

// Check if lyrics exist for a track and show/hide the button
async function checkLyricsAvailability(trackId) {
  const btn = $('#np-lyrics-btn');
  if (!btn) return;
  // Hide by default while checking
  btn.style.display = 'none';
  try {
    const result = await fetchLyrics(trackId);
    if (result && result.lyrics) {
      btn.style.display = '';
    }
  } catch (e) {
    // Keep hidden
  }
}

async function showLyrics() {
  if (!state.currentTrack) return;
  const panel = $('#np-lyrics-panel');
  const content = $('#np-lyrics-content');

  // Show loading state briefly
  content.innerHTML = '<p class="lyrics-loading">Loading lyrics...</p>';
  panel.classList.remove('hidden');
  state.lyricsVisible = true;
  $('#np-lyrics-btn').classList.add('active');

  const result = await fetchLyrics(state.currentTrack.id);

  if (result && result.lyrics) {
    const lines = result.lyrics.split('\n');
    let html = lines.map(line =>
      line.trim() ? `<p class="lyrics-line">${line}</p>` : '<br/>'
    ).join('');
    if (result.copyright) {
      html += `<p class="lyrics-copyright">${result.copyright}</p>`;
    }
    content.innerHTML = html;
    analytics.trackEvent('lyrics_viewed', { trackId: state.currentTrack.id });
  } else {
    // No lyrics available — close panel and show toast
    hideLyrics();
    showToast('Lyrics not available for this song');
    return;
  }
}

function hideLyrics() {
  state.lyricsVisible = false;
  $('#np-lyrics-panel').classList.add('hidden');
  $('#np-lyrics-btn').classList.remove('active');
}

function toggleLyrics() {
  if (state.lyricsVisible) hideLyrics();
  else showLyrics();
}

// ===== Share =====
async function shareSong() {
  if (!state.currentTrack) return;

  const title = getTrackName(state.currentTrack);
  const artist = getArtistName(state.currentTrack);
  const album = getAlbumName(state.currentTrack);
  const text = `🎵 ${title} — ${artist}${album ? ` (${album})` : ''}`;
  const url = state.currentTrack.url || state.currentTrack.perma_url || '';

  // Try native Web Share API first
  if (navigator.share) {
    try {
      await navigator.share({
        title: `${title} — ${artist}`,
        text: text,
        url: url || window.location.href
      });
      showToast('Shared successfully!');
      analytics.trackEvent('share', { method: 'native', trackId: state.currentTrack.id });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled
    }
  }

  // Fallback: copy to clipboard
  const shareText = url ? `${text}\n${url}` : text;
  try {
    await navigator.clipboard.writeText(shareText);
    showToast('Copied to clipboard! 📋');
    analytics.trackEvent('share', { method: 'clipboard', trackId: state.currentTrack.id });
  } catch (e) {
    // Final fallback
    const ta = document.createElement('textarea');
    ta.value = shareText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Copied to clipboard! 📋');
  }
}

// ===== Equalizer (Web Audio API) =====
const equalizer = {
  context: null,
  source: null,
  filters: { bass: null, mid: null, treble: null },
  connected: false,

  presets: {
    'off': { bass: 0, mid: 0, treble: 0 },
    'bass-boost': { bass: 8, mid: 1, treble: -1 },
    'treble-boost': { bass: -1, mid: 0, treble: 7 },
    'vocal': { bass: -3, mid: 6, treble: 3 },
    'rock': { bass: 5, mid: -2, treble: 4 },
    'pop': { bass: 2, mid: 4, treble: 2 },
    'classical': { bass: 0, mid: 0, treble: -2 },
    'jazz': { bass: 3, mid: 2, treble: 4 },
    'electronic': { bass: 7, mid: 0, treble: 5 }
  },

  init() {
    if (this.connected) return;
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.source = this.context.createMediaElementSource(audio);

      // Bass filter (lowshelf)
      this.filters.bass = this.context.createBiquadFilter();
      this.filters.bass.type = 'lowshelf';
      this.filters.bass.frequency.value = 200;

      // Mid filter (peaking)
      this.filters.mid = this.context.createBiquadFilter();
      this.filters.mid.type = 'peaking';
      this.filters.mid.frequency.value = 1500;
      this.filters.mid.Q.value = 1;

      // Treble filter (highshelf)
      this.filters.treble = this.context.createBiquadFilter();
      this.filters.treble.type = 'highshelf';
      this.filters.treble.frequency.value = 6000;

      // P5: Volume normalization compressor
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(state.volumeNormEnabled ? -18 : 0, this.context.currentTime);
      this.compressor.knee.setValueAtTime(10, this.context.currentTime);
      this.compressor.ratio.setValueAtTime(state.volumeNormEnabled ? 4 : 1, this.context.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.context.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.context.currentTime);

      // Chain: source → bass → mid → treble → compressor → destination
      this.source.connect(this.filters.bass);
      this.filters.bass.connect(this.filters.mid);
      this.filters.mid.connect(this.filters.treble);
      this.filters.treble.connect(this.compressor);
      this.compressor.connect(this.context.destination);

      this.connected = true;

      // Restore saved preset
      if (state.eqPreset !== 'off') {
        this.applyPreset(state.eqPreset);
      }
    } catch (e) {
      console.warn('EQ init failed:', e);
    }
  },

  applyPreset(name) {
    const preset = this.presets[name];
    if (!preset) return;

    if (!this.connected) this.init();
    if (!this.connected) return;

    this.filters.bass.gain.value = preset.bass;
    this.filters.mid.gain.value = preset.mid;
    this.filters.treble.gain.value = preset.treble;

    state.eqPreset = name;
    localStorage.setItem('raagam_eq_preset', name);

    // Update slider UI
    const bassSlider = $('#eq-bass');
    const midSlider = $('#eq-mid');
    const trebleSlider = $('#eq-treble');
    if (bassSlider) { bassSlider.value = preset.bass; $('#eq-bass-val').textContent = `${preset.bass} dB`; }
    if (midSlider) { midSlider.value = preset.mid; $('#eq-mid-val').textContent = `${preset.mid} dB`; }
    if (trebleSlider) { trebleSlider.value = preset.treble; $('#eq-treble-val').textContent = `${preset.treble} dB`; }

    // Update preset buttons
    $$('.eq-preset').forEach(b => b.classList.toggle('active', b.dataset.preset === name));

    // Update settings button
    const settingsEq = $('#settings-eq');
    if (settingsEq) settingsEq.textContent = name === 'off' ? 'Off' : name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const eqBtn = $('#np-eq-btn');
    if (eqBtn) eqBtn.classList.toggle('active', name !== 'off');
  },

  setGain(band, value) {
    if (!this.connected) this.init();
    if (!this.connected) return;

    this.filters[band].gain.value = value;

    // Clear active preset since user is customizing
    state.eqPreset = 'custom';
    $$('.eq-preset').forEach(b => b.classList.remove('active'));
  }
};

function openEqDialog() {
  // Init EQ on first open (needs user gesture)
  if (!equalizer.connected) equalizer.init();

  $('#eq-dialog').classList.remove('hidden');
  // Restore current values
  const preset = equalizer.presets[state.eqPreset];
  if (preset) {
    $$('.eq-preset').forEach(b => b.classList.toggle('active', b.dataset.preset === state.eqPreset));
    $('#eq-bass').value = preset.bass;
    $('#eq-mid').value = preset.mid;
    $('#eq-treble').value = preset.treble;
    $('#eq-bass-val').textContent = `${preset.bass} dB`;
    $('#eq-mid-val').textContent = `${preset.mid} dB`;
    $('#eq-treble-val').textContent = `${preset.treble} dB`;
  }
}

function closeEqDialog() {
  $('#eq-dialog').classList.add('hidden');
}

// ===== Playback Speed =====
function setPlaybackSpeed(speed) {
  state.playbackSpeed = speed;
  audio.playbackRate = speed;
  localStorage.setItem('raagam_speed', speed);

  // Update UI
  const label = speed === 1 ? '1x' : `${speed}x`;
  const speedLabel = $('#speed-label');
  if (speedLabel) speedLabel.textContent = label;

  const speedBtn = $('#np-speed-btn');
  if (speedBtn) speedBtn.classList.toggle('active', speed !== 1);

  const settingsSpeed = $('#settings-speed');
  if (settingsSpeed) settingsSpeed.textContent = label;

  // Update active button in dialog
  $$('.speed-option').forEach(b => b.classList.toggle('active', parseFloat(b.dataset.speed) === speed));

  showToast(`Playback speed: ${label}`);
  analytics.trackEvent('playback_speed', { speed });
}

function openSpeedDialog() {
  $('#speed-dialog').classList.remove('hidden');
  $$('.speed-option').forEach(b => b.classList.toggle('active', parseFloat(b.dataset.speed) === state.playbackSpeed));
}

function closeSpeedDialog() {
  $('#speed-dialog').classList.add('hidden');
}

// ===== Alarm Clock =====
function openAlarmDialog() {
  const dialog = $('#alarm-dialog');
  dialog.classList.remove('hidden');

  // Set default time to 5 min from now
  const now = new Date();
  const defaultTime = new Date(now.getTime() + 5 * 60000);
  const hh = defaultTime.getHours().toString().padStart(2, '0');
  const mm = defaultTime.getMinutes().toString().padStart(2, '0');
  $('#alarm-time-input').value = `${hh}:${mm}`;

  // Pre-fill with currently playing song
  state.alarmSelectedSong = state.currentTrack || null;
  updateAlarmSongDisplay();

  // Reset search
  $('#alarm-song-search').value = '';
  $('#alarm-search-results').classList.add('hidden');
}

function closeAlarmDialog() {
  $('#alarm-dialog').classList.add('hidden');
  $('#alarm-search-results').classList.add('hidden');
  state.alarmSelectedSong = null;
}

function updateAlarmSongDisplay() {
  const container = $('#alarm-selected-song');
  if (!container) return;
  if (state.alarmSelectedSong) {
    container.classList.remove('hidden');
    const art = $('#alarm-song-art');
    if (art) art.src = getImage(state.alarmSelectedSong, 'low');
    const title = $('#alarm-song-title');
    if (title) title.textContent = getTrackName(state.alarmSelectedSong);
    const artist = $('#alarm-song-artist');
    if (artist) artist.textContent = getArtistName(state.alarmSelectedSong);
  } else {
    container.classList.add('hidden');
  }
}

let alarmSearchTimeout = null;
async function searchAlarmSongs(query) {
  if (!query || query.length < 2) {
    $('#alarm-search-results').classList.add('hidden');
    return;
  }

  const results = await apiSearch(query, 6);
  const container = $('#alarm-search-results');
  if (!container) return;

  if (results.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.innerHTML = '';
  results.forEach(track => {
    const div = document.createElement('div');
    div.className = 'alarm-search-item';
    div.innerHTML = `
      <img src="${getImage(track, 'low')}" alt="" />
      <div class="alarm-search-item-info">
        <p>${getTrackName(track)}</p>
        <p>${getArtistName(track)}</p>
      </div>
    `;
    div.addEventListener('click', () => {
      state.alarmSelectedSong = track;
      updateAlarmSongDisplay();
      container.classList.add('hidden');
      $('#alarm-song-search').value = '';
    });
    container.appendChild(div);
  });
  container.classList.remove('hidden');
}

function setAlarm() {
  const timeInput = $('#alarm-time-input').value;
  if (!timeInput) {
    showToast('Please set a time for the alarm');
    return;
  }

  const [hours, minutes] = timeInput.split(':').map(Number);
  const now = new Date();
  let alarmDate = new Date(now);
  alarmDate.setHours(hours, minutes, 0, 0);

  // If the time has already passed today, set for tomorrow
  if (alarmDate <= now) {
    alarmDate.setDate(alarmDate.getDate() + 1);
  }

  const alarmData = {
    time: alarmDate.toISOString(),
    timeDisplay: timeInput,
    songData: state.alarmSelectedSong,
    songName: state.alarmSelectedSong ? getTrackName(state.alarmSelectedSong) : null,
    autoplay: $('#alarm-autoplay') ? $('#alarm-autoplay').checked : true,
    gentle: $('#alarm-gentle') ? $('#alarm-gentle').checked : true
  };

  state.alarm = alarmData;
  localStorage.setItem('raagam_alarm', JSON.stringify(alarmData));

  // Start checking
  startAlarmChecker();

  closeAlarmDialog();
  updateAlarmUI();

  // Calculate time until alarm
  const diff = alarmDate - now;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
  showToast(`\u23f0 Alarm set for ${timeInput} (in ${timeStr})`);

  if (typeof analytics !== 'undefined') {
    analytics.trackEvent('alarm_set', {
      time: timeInput,
      hasSong: !!state.alarmSelectedSong,
      autoplay: alarmData.autoplay,
      gentle: alarmData.gentle
    });
  }

  // Notify SW as backup
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SET_ALARM',
      data: {
        alarmId: 'raagam-alarm',
        time: alarmData.time,
        songName: alarmData.songName
      }
    });
  }
}

function cancelAlarm() {
  if (state.alarmCheckInterval) clearInterval(state.alarmCheckInterval);
  state.alarmCheckInterval = null;
  state.alarm = null;
  localStorage.removeItem('raagam_alarm');

  // Stop keep-alive systems
  stopAlarmKeepAlive();

  // Notify Service Worker to cancel
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CANCEL_ALARM', data: { alarmId: 'raagam-alarm' }
    });
  }

  updateAlarmUI();
  showToast('Alarm cancelled');
}

function startAlarmChecker() {
  if (state.alarmCheckInterval) clearInterval(state.alarmCheckInterval);

  // Start keep-alive systems to survive phone lock
  startAlarmKeepAlive();

  // Notify Service Worker to set backup timer
  if (navigator.serviceWorker && navigator.serviceWorker.controller && state.alarm) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SET_ALARM',
      data: {
        alarmId: 'raagam-alarm',
        time: state.alarm.time,
        songName: state.alarm.songName
      }
    });
  }

  state.alarmCheckInterval = setInterval(() => {
    if (!state.alarm) {
      clearInterval(state.alarmCheckInterval);
      state.alarmCheckInterval = null;
      return;
    }

    const now = new Date();
    const alarmTime = new Date(state.alarm.time);

    if (now >= alarmTime) {
      triggerAlarm();
    }

    updateAlarmUI();
  }, 10000);
}

// ===== Alarm Keep-Alive System =====
// Silent audio trick — keeps browser tab alive when phone is locked
function startAlarmKeepAlive() {
  stopAlarmKeepAlive(); // clean up any existing

  // 1. Silent Audio Loop — prevents tab suspension on Android Chrome
  try {
    if (!state.alarmKeepAliveAudio) {
      state.alarmKeepAliveAudio = new Audio();
    }
    // Tiny silent WAV (44 bytes header + minimal data)
    // This is a valid 1-second silent WAV at 8000Hz mono 8-bit
    const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    state.alarmKeepAliveAudio.src = silentWav;
    state.alarmKeepAliveAudio.loop = true;
    state.alarmKeepAliveAudio.volume = 0.001; // nearly inaudible
    const playPromise = state.alarmKeepAliveAudio.play();
    if (playPromise) {
      playPromise.catch(err => {
        console.warn('[Alarm] Silent audio keep-alive failed:', err.message);
      });
    }
    console.log('[Alarm] Silent audio keep-alive started');
  } catch (e) {
    console.warn('[Alarm] Could not start silent audio:', e);
  }

  // 2. Wake Lock API — prevents screen/tab suspension
  requestWakeLock();

  // 3. Periodic SW ping — keeps Service Worker alive
  if (!state.alarmSWPingInterval) {
    state.alarmSWPingInterval = setInterval(() => {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'PING' });
      }
    }, 25000); // every 25s (SW idle timeout is ~30s)
  }

  updateKeepAliveStatus(true);
}

function stopAlarmKeepAlive() {
  // Stop silent audio
  if (state.alarmKeepAliveAudio) {
    state.alarmKeepAliveAudio.pause();
    state.alarmKeepAliveAudio.src = '';
    state.alarmKeepAliveAudio = null;
  }

  // Release Wake Lock
  releaseWakeLock();

  // Stop SW pings
  if (state.alarmSWPingInterval) {
    clearInterval(state.alarmSWPingInterval);
    state.alarmSWPingInterval = null;
  }

  updateKeepAliveStatus(false);
  console.log('[Alarm] Keep-alive systems stopped');
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      state.alarmWakeLock = await navigator.wakeLock.request('screen');
      console.log('[Alarm] Wake Lock acquired');

      // Re-acquire if released (e.g., tab loses visibility then regains)
      state.alarmWakeLock.addEventListener('release', () => {
        console.log('[Alarm] Wake Lock released');
        // Re-acquire if alarm is still active
        if (state.alarm) {
          setTimeout(() => requestWakeLock(), 1000);
        }
      });
    } catch (err) {
      console.warn('[Alarm] Wake Lock failed:', err.message);
    }
  }
}

function releaseWakeLock() {
  if (state.alarmWakeLock) {
    try { state.alarmWakeLock.release(); } catch (e) { }
    state.alarmWakeLock = null;
  }
}

function updateKeepAliveStatus(active) {
  const el = $('#alarm-keepalive-status');
  if (!el) return;
  if (active) {
    const hasWakeLock = 'wakeLock' in navigator;
    const hasSW = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    const parts = ['🔋 Keep-alive active'];
    if (hasWakeLock) parts.push('Wake Lock ✅');
    if (hasSW) parts.push('SW backup ✅');
    parts.push('Silent audio ✅');
    el.textContent = parts.join(' — ');
    el.style.color = '#1DB954';
  } else {
    el.textContent = '';
  }
}

async function triggerAlarm() {
  if (state.alarmCheckInterval) clearInterval(state.alarmCheckInterval);
  state.alarmCheckInterval = null;

  const alarmData = state.alarm;
  state.alarm = null;
  localStorage.removeItem('raagam_alarm');

  // Stop keep-alive systems
  stopAlarmKeepAlive();

  // Cancel SW backup timer
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CANCEL_ALARM', data: { alarmId: 'raagam-alarm' }
    });
  }

  // Try to resume audio context
  if (equalizer.context && equalizer.context.state === 'suspended') {
    try { await equalizer.context.resume(); } catch (e) { }
  }

  // Set autoplay mode if requested
  if (alarmData.autoplay) {
    state.autoPlayMode = true;
    localStorage.setItem('raagam_autoPlay', 'true');
  }

  // Gentle wake: start at low volume, ramp up over 30s
  const targetVolume = audio.volume || 1;
  if (alarmData.gentle) {
    audio.volume = 0.05;
  }

  // Play the alarm song
  if (alarmData.songData && getAudioUrl(alarmData.songData)) {
    playSong(alarmData.songData);
  } else if (state.recent && state.recent.length > 0) {
    playSong(state.recent[0]);
  } else if (state.liked && state.liked.length > 0) {
    playSong(state.liked[0]);
  } else {
    const lang = localStorage.getItem('raagam_preferred_language') || 'hindi';
    const results = await apiSearch(`good morning ${lang} songs`, 5);
    if (results.length > 0) {
      playSong(results[0]);
    } else {
      showToast('Alarm! But no song available to play');
    }
  }

  // Gentle volume ramp over ~30 seconds
  if (alarmData.gentle) {
    let vol = 0.05;
    const rampInterval = setInterval(() => {
      vol = Math.min(vol + 0.03, targetVolume);
      audio.volume = vol;
      if (vol >= targetVolume) clearInterval(rampInterval);
    }, 1000);
  }

  // Show notification if available
  if ('Notification' in window && Notification.permission === 'granted') {
    const songName = alarmData.songName || 'your favorite music';
    new Notification('\u23f0 Raagam Alarm', {
      body: `Good morning! Playing ${songName}`,
      tag: 'raagam-alarm'
    });
  }

  updateAlarmUI();
  showToast('\u23f0 Good morning! Your alarm song is playing \u2600\ufe0f');

  if (typeof analytics !== 'undefined') {
    analytics.trackEvent('alarm_triggered', {
      hadSong: !!alarmData.songData,
      gentle: alarmData.gentle
    });
  }
}

function updateAlarmUI() {
  const settingsBtn = $('#settings-alarm');
  const statusBar = $('#alarm-status-bar');

  if (state.alarm) {
    const alarmTime = new Date(state.alarm.time);
    const now = new Date();
    const diff = Math.max(0, alarmTime - now);
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

    if (settingsBtn) {
      settingsBtn.textContent = state.alarm.timeDisplay;
      settingsBtn.classList.add('alarm-active-glow');
    }
    if (statusBar) {
      statusBar.classList.remove('hidden');
      const statusTime = $('#alarm-status-time');
      if (statusTime) statusTime.textContent = `${state.alarm.timeDisplay} (in ${timeStr})`;
      const statusSong = $('#alarm-status-song');
      const songName = state.alarm.songName || 'Random / Last played';
      if (statusSong) statusSong.textContent = `\ud83c\udfb5 ${songName}`;
    }
  } else {
    if (settingsBtn) {
      settingsBtn.textContent = 'Off';
      settingsBtn.classList.remove('alarm-active-glow');
    }
    if (statusBar) statusBar.classList.add('hidden');
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function initAlarmOnLoad() {
  const saved = localStorage.getItem('raagam_alarm');
  if (saved) {
    try {
      const alarmData = JSON.parse(saved);
      const alarmTime = new Date(alarmData.time);
      const now = new Date();

      if (alarmTime > now) {
        // Alarm is in the future — start checking
        state.alarm = alarmData;
        startAlarmChecker();
        updateAlarmUI();
      } else {
        // Alarm time has PASSED — trigger it now!
        // This handles the case where phone was locked/tab was suspended
        const minutesLate = Math.round((now - alarmTime) / 60000);
        console.log(`[Alarm] Missed alarm by ${minutesLate} minutes — triggering now`);
        state.alarm = alarmData;
        triggerAlarm();
      }
    } catch (e) {
      localStorage.removeItem('raagam_alarm');
    }
  }

  requestNotificationPermission();

  // Check URL params for alarm trigger (from notification click)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('alarm') === 'trigger') {
    // Remove param from URL
    window.history.replaceState({}, '', window.location.pathname);
    // If there's a saved alarm, trigger it
    const alarmSaved = localStorage.getItem('raagam_alarm');
    if (alarmSaved) {
      state.alarm = JSON.parse(alarmSaved);
      triggerAlarm();
    }
  }

  // === Visibility change alarm catch-up ===
  // When user unlocks phone / switches back to tab, immediately check alarm
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.alarm) {
      const now = new Date();
      const alarmTime = new Date(state.alarm.time);
      if (now >= alarmTime) {
        console.log('[Alarm] Tab became visible, missed alarm — triggering now');
        triggerAlarm();
      } else {
        // Re-acquire Wake Lock (released when tab lost visibility)
        if ('wakeLock' in navigator) requestWakeLock();
        updateAlarmUI(); // refresh countdown
      }
    }
  });
}

// ===== Service Worker Registration =====
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      state.alarmSWRegistration = reg;
      console.log('[SW] Registered:', reg.scope);

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        const { type, alarmId } = event.data || {};

        if (type === 'ALARM_FIRED' || type === 'ALARM_PLAY') {
          // SW detected alarm time or user clicked notification
          if (state.alarm) {
            console.log('[SW] Received alarm trigger from Service Worker');
            triggerAlarm();
          }
        }

        if (type === 'ALARM_SNOOZED') {
          showToast('\u23f0 Alarm snoozed for 5 minutes');
        }

        if (type === 'PONG') {
          // SW is alive — good
        }
      });
    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  }
}

// ===== UI Updates =====
function updatePlayerUI() {
  const playIcon = state.isPlaying
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';

  // Mini player
  const miniPlaySvg = $('#mini-play svg');
  if (miniPlaySvg) miniPlaySvg.innerHTML = playIcon;

  // Now playing
  const npPlayIcon = $('#np-play-icon');
  if (npPlayIcon) npPlayIcon.innerHTML = playIcon;

  // Shuffle/Repeat
  $('#np-shuffle')?.classList.toggle('active', state.shuffle);
  const repeatBtn = $('#np-repeat');
  if (repeatBtn) {
    repeatBtn.classList.toggle('active', state.repeat !== 'off');
    if (state.repeat === 'one') {
      repeatBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>';
    } else {
      repeatBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>';
    }
  }

  // Auto-play
  $('#np-autoplay')?.classList.toggle('active', state.autoPlayMode);
  // P2: Smart DJ button state
  updateSmartDJUI();

  // EQ, Speed, Sleep button states
  $('#np-eq-btn')?.classList.toggle('active', state.eqPreset !== 'off');
  $('#np-speed-btn')?.classList.toggle('active', state.playbackSpeed !== 1);
  const speedLabel = $('#speed-label');
  if (speedLabel) speedLabel.textContent = state.playbackSpeed === 1 ? '1x' : `${state.playbackSpeed}x`;
}

function updateMiniPlayer() {
  const mini = $('#mini-player');
  if (!state.currentTrack) { mini.classList.add('hidden'); return; }
  mini.classList.remove('hidden');

  $('#mini-art').src = getImage(state.currentTrack, 'low');
  $('#mini-title').textContent = getTrackName(state.currentTrack);
  $('#mini-artist').textContent = getArtistName(state.currentTrack);
  updateLikeButtons();
}

function updateNowPlaying() {
  if (!state.currentTrack) return;
  const t = state.currentTrack;

  $('#np-art').src = getImage(t, 'high');
  $('#np-title').textContent = getTrackName(t);
  const npArtist = $('#np-artist');
  npArtist.textContent = getArtistName(t);
  npArtist.style.cursor = 'pointer';
  npArtist.onclick = () => { closeNowPlaying(); openArtistProfile(getArtistName(t)); };

  // Background blur
  $('#np-bg').style.backgroundImage = `url(${getImage(t, 'mid')})`;

  updateLikeButtons();
}

function updateLikeButtons() {
  if (!state.currentTrack) return;
  const liked = isLiked(state.currentTrack.id);
  $('#mini-like')?.classList.toggle('liked', liked);
  $('#np-like')?.classList.toggle('liked', liked);
}

function updateLibraryCounts() {
  $('#liked-count').textContent = `${state.liked.length} song${state.liked.length !== 1 ? 's' : ''}`;
  $('#recent-count').textContent = `${state.recent.length} song${state.recent.length !== 1 ? 's' : ''}`;
  const historyCount = $('#history-count');
  if (historyCount) historyCount.textContent = `${state.history.length} song${state.history.length !== 1 ? 's' : ''}`;
}

function updateProgress() {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;

  // Mini progress
  const miniFill = $('#mini-progress-fill');
  if (miniFill) miniFill.style.width = pct + '%';

  // NP progress
  const seek = $('#np-seek');
  if (seek && !seek._dragging) seek.value = pct;

  $('#np-current').textContent = formatTime(audio.currentTime);
  $('#np-duration').textContent = formatTime(audio.duration);
}

// ===== Now Playing Screen =====
function openNowPlaying() {
  if (!state.currentTrack) return;
  const np = $('#now-playing');
  np.classList.remove('hidden', 'slide-down');
  np.classList.add('slide-up');
}

function closeNowPlaying() {
  const np = $('#now-playing');
  np.classList.remove('slide-up');
  np.classList.add('slide-down');
  setTimeout(() => {
    np.classList.add('hidden');
    np.classList.remove('slide-down');
  }, 300);
}

// ===== Queue Panel =====
function openQueue() {
  renderQueue();
  $('#queue-panel').classList.remove('hidden');
}

function closeQueue() {
  $('#queue-panel').classList.add('hidden');
}

function renderQueue() {
  const list = $('#queue-list');
  if (state.queue.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>Your queue is empty</p></div>';
    return;
  }
  list.innerHTML = '';
  state.queue.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = `queue-item ${i === state.queueIndex ? 'active' : ''}`;
    div.dataset.idx = i;
    div.innerHTML = `
      <div class="queue-drag-handle" style="padding:8px 4px;cursor:grab;color:#555;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
      </div>
      <img class="queue-item-art" src="${getImage(t, 'low')}" alt="" />
      <div class="result-info">
        <p class="result-title">${getTrackName(t)}</p>
        <p class="result-sub">${getArtistName(t)}</p>
      </div>
      <button class="queue-item-remove" data-idx="${i}" aria-label="Remove">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    `;
    div.querySelector('.result-info').addEventListener('click', () => playFromQueue(i));
    const removeBtn = div.querySelector('.queue-item-remove');
    if (i !== state.queueIndex) {
      removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFromQueue(i); });
    } else {
      removeBtn.style.visibility = 'hidden';
    }
    list.appendChild(div);
  });
}

// ===== Library =====
function setupLibrary() {
  let showingList = null;

  // Create playlist button
  const createPlBtn = $('#create-playlist-btn');
  if (createPlBtn) createPlBtn.addEventListener('click', openCreatePlaylistDialog);

  // Render playlist cards
  renderPlaylistCards();

  $('#liked-songs-card').addEventListener('click', () => {
    if (showingList === 'liked') {
      hideList();
      return;
    }
    showList('liked', state.liked);
  });

  $('#recent-card').addEventListener('click', () => {
    if (showingList === 'recent') {
      hideList();
      return;
    }
    showList('recent', state.recent);
  });

  function showList(type, tracks) {
    showingList = type;
    const listEl = type === 'liked' ? $('#liked-list') : $('#recent-list');
    const otherEl = type === 'liked' ? $('#recent-list') : $('#liked-list');
    otherEl.classList.add('hidden');
    listEl.classList.remove('hidden');

    if (tracks.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>No songs yet. Start listening!</p></div>';
      return;
    }

    listEl.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'track-list-header';
    header.innerHTML = `
      <h3>${type === 'liked' ? 'Liked Songs' : 'Recently Played'}</h3>
      <button class="back-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        Close
      </button>
    `;
    header.querySelector('.back-btn').addEventListener('click', hideList);
    listEl.appendChild(header);

    tracks.forEach(t => listEl.appendChild(renderResultItem(t)));
  }

  function hideList() {
    showingList = null;
    $('#liked-list').classList.add('hidden');
    $('#recent-list').classList.add('hidden');
    const historyList = $('#history-list');
    if (historyList) historyList.classList.add('hidden');
  }

  // History card
  const historyCard = $('#history-card');
  if (historyCard) {
    historyCard.addEventListener('click', () => {
      if (showingList === 'history') {
        hideList();
        return;
      }
      showingList = 'history';
      $('#liked-list').classList.add('hidden');
      $('#recent-list').classList.add('hidden');
      renderHistoryView();
    });
  }

  updateLibraryCounts();
}

// ===== History Feature =====
function formatHistoryTime(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${h12}:${mins} ${ampm}`;
}

function getHistoryGroup(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (d >= today) return 'Today';
  if (d >= yesterday) return 'Yesterday';
  if (d >= weekAgo) return 'This Week';
  return 'Earlier';
}

function renderHistoryView() {
  const historyList = $('#history-list');
  if (!historyList) return;
  historyList.classList.remove('hidden');
  historyList.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'track-list-header';
  header.innerHTML = `
    <h3>Listening History</h3>
    <div style="display:flex;gap:8px;align-items:center;">
      <button class="clear-history-btn" style="background:rgba(255,60,60,0.15);color:#ff5252;border:1px solid rgba(255,60,60,0.3);border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;">Clear</button>
      <button class="back-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        Close
      </button>
    </div>
  `;
  header.querySelector('.back-btn').addEventListener('click', () => {
    historyList.classList.add('hidden');
  });
  header.querySelector('.clear-history-btn').addEventListener('click', () => {
    if (confirm('Clear all listening history?')) {
      state.history = [];
      localStorage.setItem('raagam_history', '[]');
      historyList.classList.add('hidden');
      updateLibraryCounts();
      showToast('History cleared');
    }
  });
  historyList.appendChild(header);

  if (state.history.length === 0) {
    historyList.innerHTML += '<div class="empty-state"><p>No listening history yet. Start playing songs!</p></div>';
    return;
  }

  // Group by time
  const groups = {};
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  state.history.forEach(entry => {
    const group = getHistoryGroup(entry.playedAt);
    if (!groups[group]) groups[group] = [];
    groups[group].push(entry);
  });

  groupOrder.forEach(groupName => {
    const entries = groups[groupName];
    if (!entries || entries.length === 0) return;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'history-group-header';
    groupHeader.innerHTML = `<span>${groupName}</span><span class="history-group-count">${entries.length} song${entries.length !== 1 ? 's' : ''}</span>`;
    historyList.appendChild(groupHeader);

    entries.forEach(entry => {
      const t = entry.track;
      const div = document.createElement('div');
      div.className = 'result-item history-item';
      const isCurrent = state.currentTrack?.id === t.id;
      div.innerHTML = `
        <div class="result-art"><img src="${getImage(t, 'low')}" alt="" loading="lazy" /></div>
        <div class="result-info">
          <p class="result-title" ${isCurrent ? 'style="color:var(--accent)"' : ''}>${getTrackName(t)}</p>
          <p class="result-sub">${getArtistName(t)}${getAlbumName(t) ? ' · ' + getAlbumName(t) : ''}</p>
        </div>
        <span class="history-time">${formatHistoryTime(entry.playedAt)}</span>
      `;
      div.addEventListener('click', () => playSong(t));
      historyList.appendChild(div);
    });
  });
}

// ===== Custom Playlists =====
function savePlaylists() {
  localStorage.setItem('raagam_playlists', JSON.stringify(state.playlists));
}

function createPlaylist(name) {
  const pl = { id: Date.now().toString(), name, tracks: [], createdAt: Date.now() };
  state.playlists.unshift(pl);
  savePlaylists();
  showToast(`Playlist "${name}" created`);
  renderPlaylistCards();
  return pl;
}

function deletePlaylist(id) {
  state.playlists = state.playlists.filter(p => p.id !== id);
  savePlaylists();
  renderPlaylistCards();
  showToast('Playlist deleted');
}

function addToPlaylist(playlistId, track) {
  const pl = state.playlists.find(p => p.id === playlistId);
  if (!pl) return;
  if (pl.tracks.some(t => t.id === track.id)) { showToast('Already in playlist'); return; }
  pl.tracks.unshift(track);
  savePlaylists();
  renderPlaylistCards(); // ← refresh library card count
  showToast(`Added to "${pl.name}"`);
}

function removeFromPlaylist(playlistId, trackId) {
  const pl = state.playlists.find(p => p.id === playlistId);
  if (!pl) return;
  pl.tracks = pl.tracks.filter(t => t.id !== trackId);
  savePlaylists();
}

function openCreatePlaylistDialog() {
  const dialog = $('#create-playlist-dialog');
  dialog.classList.remove('hidden');
  const input = $('#new-playlist-name');
  input.value = '';
  setTimeout(() => input.focus(), 100);
}

function closeCreatePlaylistDialog() {
  $('#create-playlist-dialog').classList.add('hidden');
}

function renderPlaylistCards() {
  const container = $('#playlist-cards');
  if (!container) return;
  container.innerHTML = '';
  state.playlists.forEach(pl => {
    const div = document.createElement('div');
    div.className = 'library-item playlist-card-item';
    const trackCount = pl.tracks.length;
    const art = trackCount > 0 ? getImage(pl.tracks[0], 'low') : '';
    div.innerHTML = `
      <div class="playlist-gradient" ${art ? `style="background-image:url(${art});background-size:cover;background-position:center;"` : ''}>
        ${!art ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>' : ''}
      </div>
      <div class="library-item-info">
        <h3>${pl.name}</h3>
        <p>${trackCount} song${trackCount !== 1 ? 's' : ''}</p>
      </div>
    `;
    div.addEventListener('click', () => openPlaylistDetail(pl.id));
    container.appendChild(div);
  });
}

function openPlaylistDetail(playlistId) {
  const pl = state.playlists.find(p => p.id === playlistId);
  if (!pl) return;
  const listEl = $('#playlist-detail-list');
  listEl.classList.remove('hidden');
  $('#liked-list').classList.add('hidden');
  $('#recent-list').classList.add('hidden');
  $('#history-list').classList.add('hidden');
  listEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'track-list-header';
  header.innerHTML = `
    <h3>${pl.name}</h3>
    <div style="display:flex;gap:8px;align-items:center;">
      ${pl.tracks.length > 0 ? '<button class="playlist-play-all" style="background:#1DB954;color:#000;border:none;border-radius:16px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">Play All</button>' : ''}
      <button class="playlist-delete-btn" style="background:rgba(255,60,60,0.15);color:#ff5252;border:1px solid rgba(255,60,60,0.3);border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;">Delete</button>
      <button class="back-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        Close
      </button>
    </div>
  `;
  header.querySelector('.back-btn').addEventListener('click', () => listEl.classList.add('hidden'));
  const playAllBtn = header.querySelector('.playlist-play-all');
  if (playAllBtn) {
    playAllBtn.addEventListener('click', () => {
      if (pl.tracks.length > 0) {
        state.queue = [...pl.tracks];
        state.queueIndex = 0;
        playSong(pl.tracks[0], false);
        showToast(`Playing "${pl.name}"`);
      }
    });
  }
  header.querySelector('.playlist-delete-btn').addEventListener('click', () => {
    if (confirm(`Delete "${pl.name}"?`)) {
      deletePlaylist(pl.id);
      listEl.classList.add('hidden');
    }
  });
  listEl.appendChild(header);

  if (pl.tracks.length === 0) {
    listEl.innerHTML += '<div class="empty-state"><p>No songs yet. Add songs from the player.</p></div>';
    return;
  }

  pl.tracks.forEach((t, idx) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    const isCurrent = state.currentTrack?.id === t.id;
    div.innerHTML = `
      <div class="result-art"><img src="${getImage(t, 'low')}" alt="" loading="lazy" /></div>
      <div class="result-info">
        <p class="result-title" ${isCurrent ? 'style="color:var(--accent)"' : ''}>${getTrackName(t)}</p>
        <p class="result-sub">${getArtistName(t)}</p>
      </div>
      <button class="queue-item-remove" aria-label="Remove" style="padding:8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    `;
    div.querySelector('.result-info').addEventListener('click', () => {
      state.queue = [...pl.tracks];
      state.queueIndex = idx;
      playSong(t, false);
    });
    div.querySelector('.queue-item-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromPlaylist(pl.id, t.id);
      openPlaylistDetail(pl.id);
    });
    listEl.appendChild(div);
  });
}

function showAddToPlaylistMenu(track) {
  const dialog = $('#add-to-playlist-dialog');
  dialog.classList.remove('hidden');
  const list = $('#add-to-playlist-list');
  list.innerHTML = '';

  // Create new option
  const createBtn = document.createElement('div');
  createBtn.className = 'add-to-playlist-item';
  createBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#1DB954"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg><span>Create New Playlist</span>`;
  createBtn.addEventListener('click', () => {
    dialog.classList.add('hidden');
    const name = prompt('Playlist name:');
    if (name && name.trim()) {
      const pl = createPlaylist(name.trim());
      addToPlaylist(pl.id, track);
    }
  });
  list.appendChild(createBtn);

  state.playlists.forEach(pl => {
    const item = document.createElement('div');
    item.className = 'add-to-playlist-item';
    item.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#b3b3b3"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg><span>${pl.name} (${pl.tracks.length})</span>`;
    item.addEventListener('click', () => {
      addToPlaylist(pl.id, track);
      dialog.classList.add('hidden');
    });
    list.appendChild(item);
  });
}

// ===== Artist Profiles =====
async function openArtistProfile(artistName) {
  if (!artistName || artistName === 'Unknown Artist') return;

  // Switch to search view and show artist songs
  switchView('search');
  const input = $('#search-input');
  input.value = artistName;
  $('#search-clear').classList.remove('hidden');
  $('#browse-categories').classList.add('hidden');

  const resultsContainer = $('#search-results');
  resultsContainer.querySelectorAll('.result-section-title, .result-item, .album-result-item, .loader, .empty-state, .album-detail-view, .search-tabs, .artist-profile-header').forEach(e => e.remove());

  // Artist profile header
  const profileHeader = document.createElement('div');
  profileHeader.className = 'artist-profile-header';
  profileHeader.innerHTML = `
    <div class="artist-avatar">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
    </div>
    <div class="artist-profile-info">
      <h2>${artistName}</h2>
      <p>Loading songs...</p>
    </div>
  `;
  resultsContainer.appendChild(profileHeader);

  // Show loader
  const loader = document.createElement('div');
  loader.innerHTML = renderLoader();
  resultsContainer.appendChild(loader.firstElementChild);

  // Search for artist songs
  const tracks = await apiSearch(artistName, 30);
  resultsContainer.querySelectorAll('.loader').forEach(e => e.remove());

  // Also search albums
  const albums = await apiSearchAlbums(artistName, 10);

  // Filter tracks that actually match the artist
  const artistTracks = tracks.filter(t => {
    const a = getArtistName(t).toLowerCase();
    return a.includes(artistName.toLowerCase()) || artistName.toLowerCase().includes(a.split(',')[0].trim());
  });

  const displayTracks = artistTracks.length >= 3 ? artistTracks : tracks;

  // Update profile header count
  profileHeader.querySelector('p').textContent = `${displayTracks.length} songs found`;

  if (displayTracks.length > 0) {
    // Play All button
    const playAllBar = document.createElement('div');
    playAllBar.style.cssText = 'display:flex;gap:8px;padding:0 16px 12px;';
    playAllBar.innerHTML = `
      <button class="artist-play-all" style="background:#1DB954;color:#000;border:none;border-radius:20px;padding:10px 24px;font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z"/></svg>
        Play All
      </button>
      <button class="artist-radio-btn" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid #555;border-radius:20px;padding:10px 20px;font-size:14px;cursor:pointer;">Radio</button>
    `;
    playAllBar.querySelector('.artist-play-all').addEventListener('click', () => {
      state.queue = [...displayTracks];
      state.queueIndex = 0;
      playSong(displayTracks[0], false);
      showToast(`Playing ${artistName}`);
    });
    playAllBar.querySelector('.artist-radio-btn').addEventListener('click', () => startSongRadio(displayTracks[0]));
    resultsContainer.appendChild(playAllBar);

    // Songs section
    const songTitle = document.createElement('p');
    songTitle.className = 'result-section-title';
    songTitle.textContent = 'Songs';
    resultsContainer.appendChild(songTitle);

    displayTracks.forEach(t => resultsContainer.appendChild(renderResultItem(t)));
  }

  // Albums section
  if (albums.length > 0) {
    const albumTitle = document.createElement('p');
    albumTitle.className = 'result-section-title';
    albumTitle.style.marginTop = '16px';
    albumTitle.textContent = 'Albums';
    resultsContainer.appendChild(albumTitle);
    albums.slice(0, 5).forEach(a => resultsContainer.appendChild(renderAlbumItem(a)));
  }

  analytics.trackEvent('artist_profile', { artist: artistName, songCount: displayTracks.length });
}

// ===== Song Radio =====
async function startSongRadio(track) {
  if (!track) track = state.currentTrack;
  if (!track) { showToast('Play a song first'); return; }

  showToast('Starting radio — finding similar songs...');

  const artistName = getArtistName(track);
  const trackName = getTrackName(track);
  const lang = detectLanguage(track);
  const genre = detectGenre(track);
  const isCurrentlyPlaying = state.currentTrack?.id === track.id && state.isPlaying;

  // Build search queries for similar songs
  const queries = [];
  if (artistName && artistName !== 'Unknown Artist') queries.push(artistName);
  if (lang !== 'all') {
    const langData = CONFIG.supportedLanguages[lang];
    if (langData) {
      queries.push(`${langData.keywords[0]} ${genre} songs`);
      queries.push(`${langData.keywords[0]} latest hits`);
    }
  }
  if (genre !== 'general') queries.push(`${genre} songs`);
  // Extract keywords from track name
  const words = trackName.split(/\s+/).filter(w => w.length > 3);
  if (words.length > 0) queries.push(words.slice(0, 2).join(' '));

  let allResults = [];
  for (const q of queries.slice(0, 4)) {
    const results = await apiSearch(q, 15);
    allResults = allResults.concat(results);
    if (allResults.length >= 30) break;
  }

  // Deduplicate and exclude current track
  const seen = new Set();
  const unique = allResults.filter(t => {
    if (t.id === track.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  if (unique.length === 0) {
    showToast('Could not find similar songs');
    return;
  }

  // Score and sort by similarity
  const scored = unique.map(t => ({
    ...t,
    score: calculateSimilarityScore(track, t, lang, genre)
  })).sort((a, b) => b.score - a.score);

  const radioTracks = scored.slice(0, 20);

  // If current song is already playing, keep it playing and just add radio tracks after it
  if (isCurrentlyPlaying) {
    state.queue = [track, ...radioTracks];
    state.queueIndex = 0;
    // Don't restart the song — just update queue
    renderQueue();
    showToast(`Radio: ${radioTracks.length} similar songs queued`);
    analytics.trackEvent('song_radio', { trackId: track.id, resultCount: radioTracks.length });
    return;
  }

  state.queue = [track, ...radioTracks];
  state.queueIndex = 0;
  playSong(track, false);
  showToast(`Radio: ${radioTracks.length} similar songs queued`);
  analytics.trackEvent('song_radio', { trackId: track.id, resultCount: radioTracks.length });
}

// ===== Mood-Based Browse =====
const MOOD_CONFIG = [
  { name: 'Happy', emoji: '😊', color: '#FFD700', queries: ['happy songs', 'feel good music', 'upbeat hits'] },
  { name: 'Sad', emoji: '😢', color: '#5B8DEF', queries: ['sad songs', 'emotional songs', 'heartbreak songs'] },
  { name: 'Romantic', emoji: '💕', color: '#E8115B', queries: ['romantic love songs', 'love songs hindi', 'romantic telugu'] },
  { name: 'Energetic', emoji: '⚡', color: '#FF6B35', queries: ['energetic party songs', 'workout music', 'dance hits'] },
  { name: 'Chill', emoji: '🌊', color: '#1DB954', queries: ['chill lofi', 'relaxing music', 'calm songs'] },
  { name: 'Party', emoji: '🎉', color: '#DC148C', queries: ['party dance songs', 'club hits', 'DJ remix'] },
  { name: 'Devotional', emoji: '🙏', color: '#F59B23', queries: ['devotional songs', 'bhajan', 'spiritual music'] },
  { name: 'Focus', emoji: '🎯', color: '#8B5CF6', queries: ['focus music', 'study music instrumental', 'concentration'] },
];

async function browseMood(moodIndex) {
  const mood = MOOD_CONFIG[moodIndex];
  if (!mood) return;

  switchView('search');
  const input = $('#search-input');
  input.value = `${mood.emoji} ${mood.name} Vibes`;
  $('#search-clear').classList.remove('hidden');
  $('#browse-categories').classList.add('hidden');

  const resultsContainer = $('#search-results');
  resultsContainer.querySelectorAll('.result-section-title, .result-item, .album-result-item, .loader, .empty-state, .album-detail-view, .search-tabs, .artist-profile-header, .mood-header').forEach(e => e.remove());

  // Mood header
  const moodHeader = document.createElement('div');
  moodHeader.className = 'mood-header';
  moodHeader.style.background = `linear-gradient(135deg, ${mood.color}33, transparent)`;
  moodHeader.innerHTML = `<span class="mood-header-emoji">${mood.emoji}</span><div><h2>${mood.name} Vibes</h2><p>Songs matching your mood</p></div>`;
  resultsContainer.appendChild(moodHeader);

  const loader = document.createElement('div');
  loader.innerHTML = renderLoader();
  resultsContainer.appendChild(loader.firstElementChild);

  // Add language preference to queries
  let queries = [...mood.queries];
  if (CONFIG.preferredLanguage && CONFIG.preferredLanguage !== 'all') {
    const langData = CONFIG.supportedLanguages[CONFIG.preferredLanguage];
    if (langData) queries.unshift(`${langData.keywords[0]} ${mood.name.toLowerCase()} songs`);
  }

  let allTracks = [];
  for (const q of queries.slice(0, 3)) {
    const results = await apiSearch(q, 15);
    allTracks = allTracks.concat(results);
  }

  resultsContainer.querySelectorAll('.loader').forEach(e => e.remove());

  // Deduplicate
  const seen = new Set();
  const unique = allTracks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });

  if (unique.length === 0) {
    resultsContainer.innerHTML += '<div class="empty-state"><p>No songs found for this mood</p></div>';
    return;
  }

  // Play All button
  const bar = document.createElement('div');
  bar.style.cssText = 'padding:0 16px 12px;';
  bar.innerHTML = `<button style="background:${mood.color};color:#000;border:none;border-radius:20px;padding:10px 24px;font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z"/></svg>Play All</button>`;
  bar.querySelector('button').addEventListener('click', () => {
    state.queue = [...unique];
    state.queueIndex = 0;
    playSong(unique[0], false);
    showToast(`Playing ${mood.name} Vibes (${unique.length} songs)`);
  });
  resultsContainer.appendChild(bar);

  const title = document.createElement('p');
  title.className = 'result-section-title';
  title.textContent = `${unique.length} songs`;
  resultsContainer.appendChild(title);

  unique.forEach(t => resultsContainer.appendChild(renderResultItem(t)));
  analytics.trackEvent('mood_browse', { mood: mood.name, trackCount: unique.length });
}

// ===== Queue Reorder (Touch Drag) =====
function setupQueueDrag() {
  const list = $('#queue-list');
  let dragItem = null, dragIdx = -1, placeholder = null, startY = 0, offsetY = 0;

  list.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.queue-item');
    if (!item || e.target.closest('.queue-item-remove')) return;
    dragIdx = parseInt(item.dataset.idx);
    if (isNaN(dragIdx)) return;
    dragItem = item;
    startY = e.touches[0].clientY;
    offsetY = item.getBoundingClientRect().top - startY;
    item.classList.add('queue-dragging');
    placeholder = document.createElement('div');
    placeholder.className = 'queue-placeholder';
    placeholder.style.height = item.offsetHeight + 'px';
  }, { passive: true });

  list.addEventListener('touchmove', (e) => {
    if (!dragItem) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    dragItem.style.transform = `translateY(${y - startY}px)`;
    dragItem.style.zIndex = '100';

    // Find insert position
    const items = [...list.querySelectorAll('.queue-item:not(.queue-dragging)')];
    let insertBefore = null;
    for (const it of items) {
      const rect = it.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { insertBefore = it; break; }
    }
    if (placeholder.parentNode) placeholder.remove();
    if (insertBefore) list.insertBefore(placeholder, insertBefore);
    else list.appendChild(placeholder);
  }, { passive: false });

  list.addEventListener('touchend', () => {
    if (!dragItem) return;
    dragItem.classList.remove('queue-dragging');
    dragItem.style.transform = '';
    dragItem.style.zIndex = '';

    // Calculate new index
    if (placeholder.parentNode) {
      const items = [...list.querySelectorAll('.queue-item, .queue-placeholder')];
      const newIdx = items.indexOf(placeholder);
      placeholder.remove();

      if (newIdx !== dragIdx && newIdx >= 0) {
        const [moved] = state.queue.splice(dragIdx, 1);
        const insertIdx = newIdx > dragIdx ? newIdx - 1 : newIdx;
        state.queue.splice(insertIdx, 0, moved);
        // Adjust queueIndex
        if (dragIdx === state.queueIndex) state.queueIndex = insertIdx;
        else if (dragIdx < state.queueIndex && insertIdx >= state.queueIndex) state.queueIndex--;
        else if (dragIdx > state.queueIndex && insertIdx <= state.queueIndex) state.queueIndex++;
        renderQueue();
      }
    }
    dragItem = null;
    dragIdx = -1;
  });
}

// ===== Crossfade =====
function setCrossfade(seconds) {
  state.crossfadeDuration = seconds;
  localStorage.setItem('raagam_crossfade', seconds);
  // Update UI
  const label = $('#crossfade-label');
  if (label) label.textContent = seconds === 0 ? 'Off' : `${seconds}s`;
  $$('.crossfade-option').forEach(b => b.classList.toggle('active', parseInt(b.dataset.seconds) === seconds));
  showToast(seconds === 0 ? 'Crossfade off' : `Crossfade: ${seconds}s`);
}

function setupCrossfadeListener() {
  audio.addEventListener('timeupdate', () => {
    if (state.crossfadeDuration <= 0 || !audio.duration) return;
    const remaining = audio.duration - audio.currentTime;
    if (remaining <= state.crossfadeDuration && remaining > 0.5 && !state.crossfadeTimeout) {
      startCrossfade();
    }
  });
}

function startCrossfade() {
  if (state.crossfadeTimeout) return;
  const nextIdx = state.shuffle
    ? Math.floor(Math.random() * state.queue.length)
    : state.queueIndex + 1;

  if (nextIdx >= state.queue.length && state.repeat !== 'all') return;
  const nextTrack = state.queue[nextIdx >= state.queue.length ? 0 : nextIdx];
  if (!nextTrack) return;

  const nextUrl = getAudioUrl(nextTrack);
  if (!nextUrl) return;

  // Create second audio element for crossfade
  if (!state.crossfadeAudio) {
    state.crossfadeAudio = new Audio();
    // Connect to audio context if EQ is active
    if (equalizer.connected && equalizer.context) {
      try {
        const src2 = equalizer.context.createMediaElementSource(state.crossfadeAudio);
        src2.connect(equalizer.filters.bass);
      } catch (e) { /* may already be connected */ }
    }
  }

  state.crossfadeAudio.src = nextUrl;
  state.crossfadeAudio.volume = 0;
  state.crossfadeAudio.playbackRate = state.playbackSpeed;
  state.crossfadeAudio.play().catch(() => { });

  const dur = state.crossfadeDuration * 1000;
  const steps = 20;
  const interval = dur / steps;
  let step = 0;
  const originalVolume = audio.volume;

  state.crossfadeTimeout = setInterval(() => {
    step++;
    const progress = step / steps;
    audio.volume = originalVolume * (1 - progress);
    state.crossfadeAudio.volume = originalVolume * progress;

    if (step >= steps) {
      clearInterval(state.crossfadeTimeout);
      state.crossfadeTimeout = null;

      // Swap audio sources
      audio.pause();
      const nextI = nextIdx >= state.queue.length ? 0 : nextIdx;
      state.queueIndex = nextI;
      state.currentTrack = nextTrack;
      audio.src = nextUrl;
      audio.volume = originalVolume;
      audio.playbackRate = state.playbackSpeed;
      audio.play().catch(() => { });

      state.crossfadeAudio.pause();
      state.crossfadeAudio.src = '';

      addToRecent(nextTrack);
      updatePlayerUI();
      updateMiniPlayer();
      updateNowPlaying();
    }
  }, interval);
}

// ===== Mini Visualizer =====
const visualizer = {
  analyser: null,
  dataArray: null,
  canvas: null,
  ctx: null,

  init() {
    if (this.analyser) return;
    // Ensure EQ audio context exists
    if (!equalizer.connected) equalizer.init();
    if (!equalizer.context) return;

    this.analyser = equalizer.context.createAnalyser();
    this.analyser.fftSize = 64;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    // Tap analyser in parallel — do NOT disconnect treble from destination
    // This reads frequency data without interrupting audio output
    equalizer.filters.treble.connect(this.analyser);
    // Analyser is read-only (getByteFrequencyData) — no need to connect to destination
  },

  start(canvas) {
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.analyser) this.init();
    if (!this.analyser) return;
    state.visualizerActive = true;
    this.draw();
  },

  stop() {
    state.visualizerActive = false;
    if (state.visualizerAnimFrame) cancelAnimationFrame(state.visualizerAnimFrame);
    state.visualizerAnimFrame = null;
  },

  draw() {
    if (!state.visualizerActive || !this.analyser) return;
    state.visualizerAnimFrame = requestAnimationFrame(() => this.draw());

    this.analyser.getByteFrequencyData(this.dataArray);
    const { canvas, ctx, dataArray } = this;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bars = Math.min(dataArray.length, 24);
    const barW = (w / bars) * 0.7;
    const gap = (w / bars) * 0.3;

    for (let i = 0; i < bars; i++) {
      const val = dataArray[i] / 255;
      const barH = Math.max(2, val * h * 0.9);
      const x = i * (barW + gap) + gap / 2;
      const y = h - barH;

      const gradient = ctx.createLinearGradient(0, y, 0, h);
      gradient.addColorStop(0, '#1DB954');
      gradient.addColorStop(1, '#1DB95440');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    }
  }
};

function toggleVisualizer() {
  const canvas = $('#visualizer-canvas');
  if (!canvas) return;
  if (state.visualizerActive) {
    visualizer.stop();
    canvas.classList.add('hidden');
    $('#np-visualizer-btn')?.classList.remove('active');
  } else {
    canvas.classList.remove('hidden');
    canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
    visualizer.start(canvas);
    $('#np-visualizer-btn')?.classList.add('active');
  }
}

// ===== DJ MIXER ENGINE =====
const DECK_COLORS = ['#00f0ff', '#ff00e5', '#39ff14', '#ff8800', '#ff4444', '#aa55ff'];
const DECK_COLORS_RGB = ['0,240,255', '255,0,229', '57,255,20', '255,136,0', '255,68,68', '170,85,255'];

const djMixer = {
  masterGain: null,
  crossfaderGainA: null,
  crossfaderGainB: null,
  context: null,
  initialized: false,
  searchTargetDeck: null,
  _searchDebounce: null,
  deckCounter: 0,

  init() {
    if (this.initialized) return;
    // Ensure audio context exists
    if (!equalizer.context) {
      equalizer.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    this.context = equalizer.context;

    // Master gain
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = state.djMasterVolume;
    this.masterGain.connect(this.context.destination);

    // Crossfader gains
    this.crossfaderGainA = this.context.createGain();
    this.crossfaderGainB = this.context.createGain();
    this.crossfaderGainA.connect(this.masterGain);
    this.crossfaderGainB.connect(this.masterGain);

    // Set initial crossfader
    this.applyCrossfader(state.djCrossfaderPos);
    this.initialized = true;
  },

  applyCrossfader(pos) {
    // pos: 0 = full A, 1 = full B. Equal-power curve.
    const p = pos / 100; // slider is 0-100
    const gainA = Math.cos(p * Math.PI / 2);
    const gainB = Math.sin(p * Math.PI / 2);
    if (this.crossfaderGainA) this.crossfaderGainA.gain.setTargetAtTime(gainA, this.context.currentTime, 0.01);
    if (this.crossfaderGainB) this.crossfaderGainB.gain.setTargetAtTime(gainB, this.context.currentTime, 0.01);
    state.djCrossfaderPos = pos;
  },

  createDeck() {
    if (state.djDecks.length >= state.djMaxDecks) {
      showToast(`Maximum ${state.djMaxDecks} decks allowed`);
      return null;
    }
    const id = this.deckCounter++;
    const idx = state.djDecks.length;
    const color = DECK_COLORS[idx % DECK_COLORS.length];
    const colorRgb = DECK_COLORS_RGB[idx % DECK_COLORS_RGB.length];

    // Create audio element
    const aud = new Audio();
    aud.crossOrigin = 'anonymous';
    aud.preload = 'auto';

    // Web Audio nodes
    let source = null; // Created lazily on first loadTrack to avoid CORS issues
    const bass = this.context.createBiquadFilter();
    bass.type = 'lowshelf'; bass.frequency.value = 200;
    const mid = this.context.createBiquadFilter();
    mid.type = 'peaking'; mid.frequency.value = 1500; mid.Q.value = 1;
    const treble = this.context.createBiquadFilter();
    treble.type = 'highshelf'; treble.frequency.value = 6000;

    const volumeGain = this.context.createGain();
    volumeGain.gain.value = 0.8;

    const analyser = this.context.createAnalyser();
    analyser.fftSize = 2048;

    // FX nodes
    const delayNode = this.context.createDelay(2.0);
    delayNode.delayTime.value = 0;
    const delayFeedback = this.context.createGain();
    delayFeedback.gain.value = 0;
    const delayWet = this.context.createGain();
    delayWet.gain.value = 0;
    const delayDry = this.context.createGain();
    delayDry.gain.value = 1;
    const filterNode = this.context.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = 20000;
    filterNode.Q.value = 1;

    // Chain: bass → mid → treble → filter → dry/wet splits → volumeGain
    bass.connect(mid);
    mid.connect(treble);
    treble.connect(filterNode);
    // Dry path
    filterNode.connect(delayDry);
    delayDry.connect(volumeGain);
    // Wet (echo) path
    filterNode.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayWet);
    delayWet.connect(volumeGain);

    // Also tap for waveform
    volumeGain.connect(analyser);

    // Route to crossfader or master
    const assignA = state.djCrossfaderAssign.a;
    const assignB = state.djCrossfaderAssign.b;
    if (idx === assignA) volumeGain.connect(this.crossfaderGainA);
    else if (idx === assignB) volumeGain.connect(this.crossfaderGainB);
    else volumeGain.connect(this.masterGain);

    const deck = {
      id, idx, color, colorRgb,
      audio: aud, source, bass, mid, treble, filterNode,
      delayNode, delayFeedback, delayWet, delayDry,
      volumeGain, analyser,
      analyserData: new Uint8Array(analyser.frequencyBinCount),
      track: null, isPlaying: false,
      loopIn: null, loopOut: null, loopActive: false,
      cuePoints: [null, null, null, null],
      playbackRate: 1.0, volume: 0.8,
      waveformAnim: null,
      sourceConnected: false,
      keyLock: false,
      fxEcho: 0, fxFilter: 100,
      bpmEstimate: null,
      autoMixEnabled: false,
      autoEQEnabled: false,
      _autoEQInterval: null,
      _autoEQTargets: { bass: 0, mid: 0, treble: 0 }
    };

    state.djDecks.push(deck);
    this.renderDeckCard(deck);
    this.updateCrossfaderSelects();

    // Setup audio events
    aud.addEventListener('timeupdate', () => this.onDeckTimeUpdate(deck));
    aud.addEventListener('ended', () => {
      deck.isPlaying = false;
      this.updateDeckPlayBtn(deck);
      this._updateDeckPlayingUI(deck);
      // Auto-load next song if enabled for this deck
      const autoConf = state.djAutoLoadNext[deck.id];
      if (autoConf?.enabled) {
        const timerMs = (autoConf.timer || 0) * 1000;
        const doLoad = async () => {
          const newTrack = await this.autoLoadNextSong(deck);
          if (newTrack) {
            showToast(`Auto-loaded next song on Deck ${deck.idx + 1}`);
            // Auto-play after loading
            setTimeout(() => this.playDeck(deck.id), 500);
          }
        };
        if (timerMs > 0) {
          showToast(`Deck ${deck.idx + 1}: loading next in ${autoConf.timer}s...`);
          setTimeout(doLoad, timerMs);
        } else {
          doLoad();
        }
      }
    });

    return deck;
  },

  connectSource(deck) {
    if (deck.sourceConnected) return;
    try {
      deck.source = this.context.createMediaElementSource(deck.audio);
      deck.source.connect(deck.bass);
      deck.sourceConnected = true;
    } catch (e) {
      console.warn('DJ createMediaElementSource failed:', e);
    }
  },

  removeDeck(deckId) {
    if (state.djDecks.length <= 2) {
      showToast('Minimum 2 decks required');
      return;
    }
    const idx = state.djDecks.findIndex(d => d.id === deckId);
    if (idx < 0) return;
    const deck = state.djDecks[idx];

    // Stop and disconnect
    deck.audio.pause();
    deck.audio.src = '';
    if (deck.waveformAnim) cancelAnimationFrame(deck.waveformAnim);
    try {
      if (deck.source) deck.source.disconnect();
      deck.volumeGain.disconnect();
      deck.bass.disconnect();
      deck.mid.disconnect();
      deck.treble.disconnect();
      deck.analyser.disconnect();
    } catch (e) { /* ignore */ }

    // Remove from array
    state.djDecks.splice(idx, 1);
    // Re-index
    state.djDecks.forEach((d, i) => { d.idx = i; });

    // Remove DOM
    const el = document.getElementById(`dj-deck-${deckId}`);
    if (el) el.remove();

    // Fix crossfader assignments
    if (state.djCrossfaderAssign.a >= state.djDecks.length) state.djCrossfaderAssign.a = 0;
    if (state.djCrossfaderAssign.b >= state.djDecks.length) state.djCrossfaderAssign.b = Math.min(1, state.djDecks.length - 1);
    this.rerouteAllDecks();
    this.updateCrossfaderSelects();
  },

  rerouteAllDecks() {
    const assignA = state.djCrossfaderAssign.a;
    const assignB = state.djCrossfaderAssign.b;
    state.djDecks.forEach((deck, i) => {
      try { deck.volumeGain.disconnect(); } catch (e) { /* ok */ }
      // Always keep analyser connected
      deck.volumeGain.connect(deck.analyser);
      if (i === assignA) deck.volumeGain.connect(this.crossfaderGainA);
      else if (i === assignB) deck.volumeGain.connect(this.crossfaderGainB);
      else deck.volumeGain.connect(this.masterGain);
    });
  },

  loadTrack(deckId, track) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    const url = getAudioUrl(track);
    if (!url) { showToast('No audio URL for this track'); return; }

    deck.track = track;
    deck.audio.src = url;
    deck.audio.playbackRate = deck.playbackRate;
    deck.audio.load();

    // Connect source on first load
    if (!deck.sourceConnected) {
      this.connectSource(deck);
    }

    // Reset loop/cue
    deck.loopIn = null; deck.loopOut = null; deck.loopActive = false;
    deck.cuePoints = [null, null, null, null];

    this.updateDeckTrackInfo(deck);
    this.resetDeckCueUI(deck);
    this.startWaveform(deck);
    showToast(`Loaded: ${getTrackName(track)}`);
  },

  playDeck(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck || !deck.track) return;
    if (this.context.state === 'suspended') this.context.resume();
    this.connectSource(deck);
    deck.audio.play().then(() => {
      deck.isPlaying = true;
      this.updateDeckPlayBtn(deck);
      this._updateDeckPlayingUI(deck);
      this.startWaveform(deck);
      // Start auto EQ if globally enabled
      if (state.djAutoEQGlobal && !deck._autoEQInterval) this.startAutoEQ(deck);
    }).catch(e => console.warn('playDeck error:', e));
  },

  pauseDeck(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.audio.pause();
    deck.isPlaying = false;
    this.updateDeckPlayBtn(deck);
    this._updateDeckPlayingUI(deck);
    // Stop auto EQ on pause
    if (deck._autoEQInterval) this.stopAutoEQ(deck);
  },

  stopDeck(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.audio.pause();
    deck.audio.currentTime = 0;
    deck.isPlaying = false;
    this.updateDeckPlayBtn(deck);
    this._updateDeckPlayingUI(deck);
  },

  toggleDeck(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    if (deck.isPlaying) this.pauseDeck(deckId);
    else this.playDeck(deckId);
  },

  cueDeck(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    // Jump to first cue point or start
    const cue = deck.cuePoints.find(c => c !== null);
    deck.audio.currentTime = cue ?? 0;
  },

  setDeckVolume(deckId, val) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.volume = val;
    deck.volumeGain.gain.setTargetAtTime(val, this.context.currentTime, 0.02);
  },

  setDeckEQ(deckId, band, val) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck[band].gain.value = val;
  },

  // FX: Echo (delay)
  setDeckEcho(deckId, amount) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.fxEcho = amount; // 0-100
    const norm = amount / 100;
    deck.delayNode.delayTime.setTargetAtTime(norm * 0.4, this.context.currentTime, 0.02);
    deck.delayFeedback.gain.setTargetAtTime(norm * 0.5, this.context.currentTime, 0.02);
    deck.delayWet.gain.setTargetAtTime(norm * 0.6, this.context.currentTime, 0.02);
    deck.delayDry.gain.setTargetAtTime(1 - norm * 0.3, this.context.currentTime, 0.02);
  },

  // FX: Filter sweep (lowpass)
  setDeckFilter(deckId, amount) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.fxFilter = amount; // 0-100
    // Map 0-100 to 200Hz-20000Hz logarithmically
    const minF = 200, maxF = 20000;
    const freq = minF * Math.pow(maxF / minF, amount / 100);
    deck.filterNode.frequency.setTargetAtTime(freq, this.context.currentTime, 0.02);
  },

  // Key Lock (preservesPitch)
  toggleKeyLock(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.keyLock = !deck.keyLock;
    // preservesPitch keeps the pitch when playbackRate changes
    if ('preservesPitch' in deck.audio) {
      deck.audio.preservesPitch = deck.keyLock;
    } else if ('mozPreservesPitch' in deck.audio) {
      deck.audio.mozPreservesPitch = deck.keyLock;
    } else if ('webkitPreservesPitch' in deck.audio) {
      deck.audio.webkitPreservesPitch = deck.keyLock;
    }
    return deck.keyLock;
  },

  // BPM estimation (simple onset detection)
  estimateBPM(deck) {
    if (!deck.track || !deck.audio.duration) return null;
    // Use analyser frequency data for a rough BPM guess
    // Simple energy-based approach
    const bufferLength = deck.analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    deck.analyser.getByteFrequencyData(data);
    // Sum low frequencies (bass hits)
    let energy = 0;
    for (let i = 0; i < 10; i++) energy += data[i];
    // Store energy samples for peak detection
    if (!deck._bpmSamples) deck._bpmSamples = [];
    if (!deck._bpmLastTime) deck._bpmLastTime = 0;
    const now = performance.now();
    if (now - deck._bpmLastTime > 50) { // sample every 50ms
      deck._bpmSamples.push({ time: now, energy });
      deck._bpmLastTime = now;
      if (deck._bpmSamples.length > 200) deck._bpmSamples.shift();
    }
    if (deck._bpmSamples.length < 40) return deck.bpmEstimate;
    // Find peaks
    const avg = deck._bpmSamples.reduce((s, x) => s + x.energy, 0) / deck._bpmSamples.length;
    const peaks = [];
    for (let i = 1; i < deck._bpmSamples.length - 1; i++) {
      if (deck._bpmSamples[i].energy > avg * 1.3 &&
        deck._bpmSamples[i].energy > deck._bpmSamples[i - 1].energy &&
        deck._bpmSamples[i].energy > deck._bpmSamples[i + 1].energy) {
        peaks.push(deck._bpmSamples[i].time);
      }
    }
    if (peaks.length < 4) return deck.bpmEstimate;
    // Average interval between peaks
    let totalInterval = 0;
    for (let i = 1; i < peaks.length; i++) totalInterval += peaks[i] - peaks[i - 1];
    const avgInterval = totalInterval / (peaks.length - 1);
    if (avgInterval > 0) {
      deck.bpmEstimate = Math.round(60000 / avgInterval);
      // Clamp to reasonable range
      if (deck.bpmEstimate < 60) deck.bpmEstimate *= 2;
      if (deck.bpmEstimate > 200) deck.bpmEstimate = Math.round(deck.bpmEstimate / 2);
    }
    return deck.bpmEstimate;
  },

  // Auto-Mix: when current deck nears end, crossfade to next deck
  toggleAutoMix(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.autoMixEnabled = !deck.autoMixEnabled;
    return deck.autoMixEnabled;
  },

  checkAutoMix(deck) {
    if (!deck.autoMixEnabled || !deck.audio.duration) return;
    const remaining = deck.audio.duration - deck.audio.currentTime;
    if (remaining <= 8 && remaining > 7.5) {
      // Find next deck with a loaded track that isn't playing
      const nextDeck = state.djDecks.find(d => d.id !== deck.id && d.track && !d.isPlaying);
      if (nextDeck) {
        this.playDeck(nextDeck.id);
        // Auto crossfade over 6 seconds
        const deckIdx = deck.idx;
        const nextIdx = nextDeck.idx;
        const aIdx = state.djCrossfaderAssign.a;
        const bIdx = state.djCrossfaderAssign.b;
        // If both are on crossfader, animate it
        if ((deckIdx === aIdx && nextIdx === bIdx) || (deckIdx === bIdx && nextIdx === aIdx)) {
          const targetPos = (nextIdx === bIdx) ? 100 : 0;
          const startPos = state.djCrossfaderPos;
          const steps = 60;
          let step = 0;
          const interval = setInterval(() => {
            step++;
            const progress = step / steps;
            const pos = startPos + (targetPos - startPos) * progress;
            this.applyCrossfader(pos);
            const slider = $('#dj-crossfader');
            if (slider) slider.value = pos;
            if (step >= steps) clearInterval(interval);
          }, 100);
        }
        showToast(`Auto-Mix: fading to Deck ${nextDeck.idx + 1}`);
      }
    }
  },

  setDeckSpeed(deckId, rate) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.playbackRate = rate;
    deck.audio.playbackRate = rate;
  },

  setLoopIn(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.loopIn = deck.audio.currentTime;
    this.updateLoopUI(deck);
  },

  setLoopOut(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.loopOut = deck.audio.currentTime;
    if (deck.loopIn !== null && deck.loopOut > deck.loopIn) {
      deck.loopActive = true;
    }
    this.updateLoopUI(deck);
  },

  toggleLoop(deckId) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.loopActive = !deck.loopActive;
    this.updateLoopUI(deck);
  },

  setLoopLength(deckId, seconds) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.loopIn = deck.audio.currentTime;
    deck.loopOut = deck.audio.currentTime + seconds;
    deck.loopActive = true;
    this.updateLoopUI(deck);
  },

  setCuePoint(deckId, padIdx) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    if (deck.cuePoints[padIdx] !== null) {
      // Jump to cue
      deck.audio.currentTime = deck.cuePoints[padIdx];
    } else {
      // Set cue
      deck.cuePoints[padIdx] = deck.audio.currentTime;
    }
    this.updateCuePadUI(deck, padIdx);
  },

  clearCuePoint(deckId, padIdx) {
    const deck = state.djDecks.find(d => d.id === deckId);
    if (!deck) return;
    deck.cuePoints[padIdx] = null;
    this.updateCuePadUI(deck, padIdx);
  },

  setMasterVolume(val) {
    state.djMasterVolume = val;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(val, this.context.currentTime, 0.02);
  },

  onDeckTimeUpdate(deck) {
    // Loop check
    if (deck.loopActive && deck.loopIn !== null && deck.loopOut !== null) {
      if (deck.audio.currentTime >= deck.loopOut) {
        deck.audio.currentTime = deck.loopIn;
      }
    }
    // Update time display
    const el = document.getElementById(`dj-deck-${deck.id}`);
    if (!el) return;
    const cur = el.querySelector('.dj-time-current');
    const dur = el.querySelector('.dj-time-duration');
    const seek = el.querySelector('.dj-seek');
    if (cur) cur.textContent = formatTime(deck.audio.currentTime);
    if (dur) dur.textContent = formatTime(deck.audio.duration);
    if (seek && deck.audio.duration) seek.value = (deck.audio.currentTime / deck.audio.duration * 100) || 0;
    // BPM estimation (runs during playback)
    if (deck.isPlaying) {
      const bpm = this.estimateBPM(deck);
      const bpmEl = el.querySelector('.dj-bpm-val');
      if (bpmEl && bpm) bpmEl.textContent = `${bpm} BPM`;
    }
    // Auto-mix check
    this.checkAutoMix(deck);
  },

  // === Waveform Rendering ===
  startWaveform(deck) {
    if (deck.waveformAnim) cancelAnimationFrame(deck.waveformAnim);
    const el = document.getElementById(`dj-deck-${deck.id}`);
    if (!el) return;
    const canvas = el.querySelector('.dj-waveform-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      deck.waveformAnim = requestAnimationFrame(draw);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      deck.analyser.getByteTimeDomainData(deck.analyserData);
      ctx.fillStyle = '#0d0d20';
      ctx.fillRect(0, 0, w, h);

      // Draw grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 5; i++) {
        const y = (h / 5) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Draw loop region
      if (deck.loopActive && deck.loopIn !== null && deck.loopOut !== null && deck.audio.duration) {
        const x1 = (deck.loopIn / deck.audio.duration) * w;
        const x2 = (deck.loopOut / deck.audio.duration) * w;
        ctx.fillStyle = `rgba(${deck.colorRgb}, 0.08)`;
        ctx.fillRect(x1, 0, x2 - x1, h);
        ctx.strokeStyle = deck.color;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, h); ctx.stroke();
      }

      // Draw cue point markers
      if (deck.audio.duration) {
        const padColors = ['#ff4444', '#ffbb33', '#39ff14', '#448aff'];
        deck.cuePoints.forEach((cp, i) => {
          if (cp === null) return;
          const x = (cp / deck.audio.duration) * w;
          ctx.strokeStyle = padColors[i];
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          ctx.fillStyle = padColors[i];
          ctx.fillRect(x - 2, 0, 4, 6);
        });
      }

      // Draw waveform
      const data = deck.analyserData;
      const sliceW = w / data.length;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = deck.color;
      ctx.shadowColor = deck.color;
      ctx.shadowBlur = 3;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * sliceW, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw playhead
      if (deck.audio.duration) {
        const px = (deck.audio.currentTime / deck.audio.duration) * w;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      }
    };
    draw();
  },

  stopWaveform(deck) {
    if (deck.waveformAnim) {
      cancelAnimationFrame(deck.waveformAnim);
      deck.waveformAnim = null;
    }
  },

  // === Auto-Fill: Parallel API calls ===
  async autoFillDecks() {
    const fillLang = state.djAutoFillLang || 'all';
    // Build diverse random queries based on language
    const buildQueries = (langCode) => {
      const themes = [
        'latest hits', 'romantic songs', 'party dance', 'melody',
        'top songs', 'new release', 'best of', 'popular',
        'trending', 'super hit', 'love songs', 'fast beat',
        'chill vibes', 'classical', 'folk', 'remix',
        'unplugged', 'motivational', 'sad songs', 'duet'
      ];
      // Shuffle themes for variety
      const shuffled = themes.sort(() => Math.random() - 0.5);
      const year = 2020 + Math.floor(Math.random() * 6); // 2020-2025
      if (langCode === 'all') {
        const langs = ['hindi', 'telugu', 'tamil', 'english', 'punjabi', 'kannada'];
        return shuffled.slice(0, 8).map((t, i) => {
          const l = langs[i % langs.length];
          const ld = CONFIG.supportedLanguages[l];
          const kw = ld?.keywords?.[Math.floor(Math.random() * ld.keywords.length)] || l;
          return `${kw} ${t} ${Math.random() > 0.5 ? year : ''}`;
        });
      }
      const ld = CONFIG.supportedLanguages[langCode];
      const kw = ld?.keywords || [langCode];
      return shuffled.slice(0, 8).map(t => {
        const k = kw[Math.floor(Math.random() * kw.length)];
        return `${k} ${t} ${Math.random() > 0.5 ? year : ''}`;
      });
    };

    const emptyDecks = state.djDecks.filter(d => !d.track);
    if (emptyDecks.length === 0) {
      showToast('All decks already have songs');
      return;
    }

    const langName = CONFIG.supportedLanguages[fillLang]?.name || 'All';
    showToast(`Loading ${langName} songs for ${emptyDecks.length} decks...`);

    const queries = buildQueries(fillLang);
    const selectedQueries = queries.slice(0, emptyDecks.length);
    try {
      const results = await Promise.all(
        selectedQueries.map(q => apiSearch(q, 15))
      );

      let loaded = 0;
      const usedIds = new Set();
      // Also track IDs already loaded in other decks
      state.djDecks.forEach(d => { if (d.track?.id) usedIds.add(d.track.id); });
      for (let i = 0; i < emptyDecks.length; i++) {
        const tracks = results[i] || [];
        // Pick a random unused track for variety
        const available = tracks.filter(t => !usedIds.has(t.id));
        if (available.length > 0) {
          const track = available[Math.floor(Math.random() * available.length)];
          usedIds.add(track.id);
          this.loadTrack(emptyDecks[i].id, track);
          loaded++;
        }
      }
      showToast(`Loaded ${loaded} decks with ${langName} music`);
    } catch (e) {
      console.error('Auto-fill error:', e);
      showToast('Failed to auto-fill decks');
    }
  },

  // === Intelligent Auto-Load Next Song ===
  // Uses genre, mood, language, and skip signals to pick the best next track
  async autoLoadNextSong(deck) {
    // Find a reference track — prefer the currently playing deck, else this deck
    const playingDeck = state.djDecks.find(d => d.isPlaying && d.track);
    const refTrack = playingDeck?.track || deck?.track || null;

    const lang = state.djAutoFillLang || CONFIG.preferredLanguage || 'all';
    const ld = lang !== 'all' ? CONFIG.supportedLanguages[lang] : null;
    const langKeyword = ld?.keywords?.[0] || '';

    // Build an intelligent query from the reference track's genre + mood
    let queries = [];
    if (refTrack) {
      const genre = detectGenre(refTrack);
      const mood = detectMood(refTrack);
      const artist = getArtistName(refTrack);
      const title = getTrackName(refTrack);

      // Primary: same genre + language
      if (genre !== 'general') queries.push(`${langKeyword} ${genre} songs`);
      // Secondary: mood-based
      if (mood !== 'general') queries.push(`${langKeyword} ${mood} songs`);
      // Tertiary: same artist for variety
      if (artist) queries.push(`${artist} songs`);
      // Fallback: title keywords
      queries.push(`${langKeyword} ${title.split(' ').slice(0, 2).join(' ')} similar`);
    }

    // Also inject Smart DJ vibe query if Smart DJ is active
    if (state.smartDJEnabled) {
      const vibeQueries = getSmartDJQueries();
      queries.unshift(`${langKeyword} ${vibeQueries[Math.floor(Math.random() * vibeQueries.length)]}`);
    }

    // Time-of-day fallback
    if (queries.length === 0) {
      const timeQ = getTimeOfDayContext().queries;
      queries.push(`${langKeyword} ${timeQ[0]}`);
    }

    // Collect all used IDs to avoid duplicates across decks
    const usedIds = new Set(state.djDecks.map(d => d.track?.id).filter(Boolean));

    try {
      // Try each query until we get usable results
      for (const q of queries) {
        const tracks = await apiSearch(q.trim(), 20);
        if (!tracks.length) continue;

        const available = tracks.filter(t => !usedIds.has(t.id));
        if (!available.length) continue;

        // Score each candidate using the full similarity scorer (includes skip penalties)
        const scored = refTrack
          ? available
            .map(t => ({ ...t, _score: calculateSimilarityScore(refTrack, t, detectLanguage(refTrack), detectGenre(refTrack)) }))
            .sort((a, b) => b._score - a._score)
          : available;

        const best = scored[0];
        this.loadTrack(deck.id, best);
        console.log(`[Auto DJ] Loaded: ${getTrackName(best)} (score: ${best._score ?? 'n/a'})`);
        return best;
      }
    } catch (e) {
      console.warn('[Auto DJ] autoLoadNextSong failed:', e);
    }
    return null;
  },

  // ═══════════════════════════════════════════════════════════════
  // DJ SESSION ENGINE — Trending Pool + Energy Arc + BPM-Aware Mixing
  // ═══════════════════════════════════════════════════════════════

  // Show the session setup dialog before Auto DJ starts
  openDJSessionDialog() {
    const modal = $('#dj-session-modal');
    if (!modal) return;
    // Pre-select user's preferred language
    const prefLang = CONFIG.preferredLanguage || 'hindi';
    modal.querySelectorAll('[data-lang]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === prefLang);
    });
    // Pre-select auto vibe
    modal.querySelectorAll('[data-vibe]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.vibe === 'auto');
    });
    // Pre-select 20-song duration
    modal.querySelectorAll('[data-duration]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.duration === '20');
    });
    // Render arc preview for auto vibe
    this._renderSessionArcPreview('auto', 20);
    modal.classList.remove('hidden');
  },

  closeDJSessionDialog() {
    $('#dj-session-modal')?.classList.add('hidden');
  },

  // Render the energy arc preview bars inside the session setup dialog
  _renderSessionArcPreview(vibeKey, count) {
    const container = $('#dj-session-arc-preview');
    const desc = $('#dj-session-arc-desc');
    if (!container) return;
    const arc = this._getArcForVibe(vibeKey, count);
    container.innerHTML = arc.map((e, i) => {
      const m = ENERGY_META[e];
      return `<div class="dj-arc-bar-preview" style="background:${m.color};height:${12 + e * 10}px" title="${m.label}"></div>`;
    }).join('');
    if (desc) {
      const vibeLabel = SMART_DJ_VIBES[vibeKey]?.label || 'Auto';
      const avgE = arc.reduce((s, e) => s + e, 0) / arc.length;
      const arcShape = avgE >= 2.5 ? 'Sustained peak energy'
        : avgE >= 1.8 ? 'Build-up to high energy'
          : avgE >= 1.2 ? 'Balanced energy flow'
            : 'Relaxed, low-energy flow';
      desc.textContent = `${vibeLabel} · ${count === 0 ? 'Infinite' : count + ' tracks'} · ${arcShape}`;
    }
  },

  // Build energy arc array for a vibe + desired length
  _getArcForVibe(vibeKey, count) {
    let base = ENERGY_ARCS[vibeKey];
    if (!base) {
      // Auto: derive from time of day
      const h = new Date().getHours();
      if (h >= 5 && h < 9) base = ENERGY_ARCS.morning;
      else if (h >= 9 && h < 13) base = ENERGY_ARCS.focus;
      else if (h >= 13 && h < 17) base = ENERGY_ARCS.party;
      else if (h >= 17 && h < 21) base = ENERGY_ARCS.romantic;
      else base = ENERGY_ARCS.winddown;
    }
    if (count === 0) return [...base]; // infinite — just use the template
    // Extend or trim to requested count by repeating the arc pattern
    const result = [];
    for (let i = 0; i < count; i++) result.push(base[i % base.length]);
    return result;
  },

  // Called when user clicks "Load & Start Session"
  async startDJSession(cfg) {
    // cfg = { lang, vibe, songCount }
    this.closeDJSessionDialog();
    state.djAutoDJEnabled = true;
    $('#dj-autodj-toggle')?.classList.add('active');

    // Show loading toast
    showToast(`🎧 Loading ${cfg.songCount === 0 ? 'infinite' : cfg.songCount + '-track'} ${SMART_DJ_VIBES[cfg.vibe]?.label || ''} session...`);

    // Build pool of trending songs
    const pool = await this.buildDJPool(cfg.lang, cfg.vibe);
    if (pool.length < 4) {
      showToast('Could not load enough songs. Check connection.');
      state.djAutoDJEnabled = false;
      $('#dj-autodj-toggle')?.classList.remove('active');
      return;
    }

    // Build the pre-planned setlist from pool + energy arc
    const arc = this._getArcForVibe(cfg.vibe, cfg.songCount || 20);
    const setlist = this.buildDJSetlist(pool, arc);

    // Save session state
    state.djSession = {
      config: cfg,
      pool: pool,
      setlist: setlist,
      setlistIdx: 0,
      poolFetchedAt: Date.now(),
      usedIds: new Set()
    };

    // Eject existing deck tracks, load first 2 from setlist onto decks
    state.djDecks.forEach(d => {
      d.track = null; d.isPlaying = false; d.transitionTriggered = false; d._loading = false;
      const el = document.getElementById(`dj-deck-${d.id}`);
      if (el) { el.querySelector('.dj-deck-title').textContent = 'No track loaded'; el.querySelector('.dj-deck-artist').textContent = 'Loading...'; }
    });

    // Pre-load 2 decks (non-blocking)
    const numDecks = Math.min(2, state.djDecks.length);
    for (let i = 0; i < numDecks; i++) {
      await this.getNextSetlistTrack(state.djDecks[i]);
    }

    // Show arc strip and start playback
    this.updateArcUI();
    this._beginAutoDJPlayback();
  },

  // Fetch a large pool of diverse trending songs for the session
  async buildDJPool(lang, vibe) {
    const langData = lang !== 'all' ? CONFIG.supportedLanguages[lang] : null;
    const lk = langData?.keywords?.[0] || '';

    // Combine vibe-specific queries with generic trending queries
    const vibeQueries = (DJ_POOL_QUERIES[vibe] || DJ_POOL_QUERIES.trending).map(q => `${lk} ${q}`.trim());
    const trendingQueries = DJ_POOL_QUERIES.trending.map(q => `${lk} ${q}`.trim());
    const allQueries = [...new Set([...vibeQueries, ...trendingQueries])].slice(0, 8);

    showToast(`Fetching trending ${langData?.name || 'music'}...`);

    try {
      const results = await Promise.allSettled(allQueries.map(q => apiSearch(q, 20)));
      const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

      // Deduplicate by track ID
      const seen = new Set();
      const unique = all.filter(t => {
        if (!t?.id || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      // Shuffle for variety (Fisher-Yates)
      for (let i = unique.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unique[i], unique[j]] = [unique[j], unique[i]];
      }

      console.log(`[DJ Pool] Built pool: ${unique.length} songs for ${lang}/${vibe}`);
      return unique;
    } catch (e) {
      console.warn('[DJ Pool] buildDJPool failed:', e);
      return [];
    }
  },

  // Pre-assign songs from pool to energy arc positions
  buildDJSetlist(pool, arc) {
    const available = [...pool];
    const setlist = [];
    let prevTrack = null;

    for (const targetEnergy of arc) {
      // Filter candidates within ±1 energy of target
      let candidates = available.filter(t => Math.abs(getEnergyLevel(t) - targetEnergy) <= 1);
      // If not enough, relax to ±2
      if (candidates.length < 3) candidates = available.filter(t => Math.abs(getEnergyLevel(t) - targetEnergy) <= 2);
      // Last fallback: any track
      if (candidates.length === 0) candidates = available.slice(0, 10);
      if (candidates.length === 0) break;

      // Score candidates by similarity to previous track
      let best;
      if (prevTrack) {
        const scored = candidates.map(t => ({
          ...t,
          _score: calculateSimilarityScore(prevTrack, t, detectLanguage(prevTrack), detectGenre(prevTrack))
            + (getEnergyLevel(t) === targetEnergy ? 20 : 0)  // bonus for exact energy match
        })).sort((a, b) => b._score - a._score);
        best = scored[0];
      } else {
        best = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
      }

      setlist.push({ energyTarget: targetEnergy, track: best });
      // Remove from available pool to avoid repeats
      const idx = available.findIndex(t => t.id === best.id);
      if (idx >= 0) available.splice(idx, 1);
      prevTrack = best;
    }

    console.log(`[DJ Setlist] Built ${setlist.length}-track setlist`);
    return setlist;
  },

  // Get next track from the pre-planned setlist (with BPM correction)
  async getNextSetlistTrack(deck) {
    const session = state.djSession;
    if (!session) return this.autoLoadNextSong(deck); // fallback

    // Find next unloaded slot
    const idx = session.setlistIdx;
    if (idx >= session.setlist.length) {
      // Setlist exhausted — refresh pool and extend if infinite session
      if (session.config.songCount === 0) {
        await this.refreshDJPool();
        if (session.setlistIdx >= session.setlist.length) return null;
      } else {
        showToast('DJ Session complete!');
        return null;
      }
    }

    const slot = session.setlist[session.setlistIdx];
    session.setlistIdx++;

    if (!slot?.track) return null;

    // BPM correction: if current deck has a BPM estimate and the pre-assigned track
    // would be a jarring tempo jump (>30 BPM diff), swap with a better pool match
    const currentBPM = state.djDecks.find(d => d.isPlaying)?.bpmEstimate;
    let chosenTrack = slot.track;
    if (currentBPM && session.pool.length > 10) {
      const unusedPool = session.pool.filter(t => !session.usedIds.has(t.id));
      const bpmCompatible = unusedPool.filter(t => {
        if (!t._bpm) return true; // no BPM known, keep as candidate
        return Math.abs(t._bpm - currentBPM) <= 20;
      }).filter(t => Math.abs(getEnergyLevel(t) - slot.energyTarget) <= 1);
      if (bpmCompatible.length > 0) {
        // Score BPM-compatible candidates
        const scored = bpmCompatible.map(t => ({
          ...t,
          _score: calculateSimilarityScore(slot.track, t, detectLanguage(slot.track), detectGenre(slot.track))
        })).sort((a, b) => b._score - a._score);
        chosenTrack = scored[0];
      }
    }

    session.usedIds.add(chosenTrack.id);
    // Store the deck's estimated BPM into the track for future use
    if (currentBPM) chosenTrack._bpm = currentBPM;

    this.loadTrack(deck.id, chosenTrack);
    this.updateArcUI();

    // If we're 60% through, refresh pool in background
    if (session.setlistIdx >= Math.floor(session.setlist.length * 0.6) && !session._refreshing) {
      session._refreshing = true;
      this.refreshDJPool().finally(() => { if (session) session._refreshing = false; });
    }

    return chosenTrack;
  },

  // Extend the setlist with fresh trending songs (background, silent)
  async refreshDJPool() {
    const session = state.djSession;
    if (!session) return;
    const now = Date.now();
    if (now - session.poolFetchedAt < 10 * 60 * 1000) return; // wait 10min between refreshes
    console.log('[DJ Pool] Refreshing pool...');
    const fresh = await this.buildDJPool(session.config.lang, session.config.vibe);
    if (fresh.length < 5) return;
    // Remove already-used tracks
    const newTracks = fresh.filter(t => !session.usedIds.has(t.id));
    // Extend setlist with new arc positions
    const remainingArc = this._getArcForVibe(session.config.vibe, 20);
    const extension = this.buildDJSetlist(newTracks, remainingArc);
    session.setlist.push(...extension);
    session.pool.push(...newTracks);
    session.poolFetchedAt = now;
    this.updateArcUI();
    showToast(`DJ: +${extension.length} fresh trending tracks added`);
  },

  // Update the energy arc strip visualization in the DJ panel
  updateArcUI() {
    const strip = $('#dj-energy-arc-strip');
    const barsRow = $('#dj-arc-bars-row');
    const posLabel = $('#dj-arc-strip-pos');
    const nextLabel = $('#dj-arc-next-label');
    const session = state.djSession;

    if (!session || !strip || !barsRow) return;
    strip.classList.remove('hidden');

    const { setlist, setlistIdx } = session;
    const totalCount = session.config.songCount === 0 ? setlist.length : session.config.songCount;

    // Position label
    if (posLabel) posLabel.textContent = `Track ${Math.min(setlistIdx, setlist.length)} / ${totalCount === 0 ? '∞' : totalCount}`;

    // Next energy label
    const nextSlot = setlist[setlistIdx];
    if (nextLabel && nextSlot) {
      nextLabel.textContent = `Next: ${ENERGY_META[nextSlot.energyTarget]?.label || '?'}`;
      nextLabel.style.color = ENERGY_META[nextSlot.energyTarget]?.color || '#fff';
    }

    // Render arc bars — show window of 30 around current position
    const windowStart = Math.max(0, setlistIdx - 5);
    const windowEnd = Math.min(setlist.length, windowStart + 30);
    const slice = setlist.slice(windowStart, windowEnd);

    barsRow.innerHTML = slice.map((slot, i) => {
      const absIdx = windowStart + i;
      const e = slot.energyTarget;
      const m = ENERGY_META[e];
      const isPast = absIdx < setlistIdx - 1;
      const isCurrent = absIdx === setlistIdx - 1;
      const isFuture = absIdx >= setlistIdx;
      const h = 10 + e * 10; // height 10-40px
      const name = slot.track ? getTrackName(slot.track).slice(0, 12) : '...';
      return `<div class="dj-arc-bar${isCurrent ? ' dj-arc-bar-current' : ''}${isPast ? ' dj-arc-bar-past' : ''}"
        style="height:${h}px;background:${isPast ? '#333' : m.color};box-shadow:${isCurrent ? `0 0 8px ${m.color}` : 'none'}"
        title="${name} (${m.label})">
        ${isCurrent ? '<div class="dj-arc-bar-needle"></div>' : ''}
      </div>`;
    }).join('');

    // Scroll current bar into view
    const currentBar = barsRow.querySelector('.dj-arc-bar-current');
    if (currentBar) currentBar.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  },

  // === Full Auto DJ System ===
  // Automatically manages transitions, loads new songs, and keeps the music going
  toggleAutoDJ() {
    if (state.djAutoDJEnabled) {
      // Already running — stop
      state.djAutoDJEnabled = false;
      $('#dj-autodj-toggle')?.classList.remove('active');
      this.stopAutoDJ();
      showToast('Auto DJ OFF');
    } else {
      // Not running — show setup dialog first (ask user)
      this.openDJSessionDialog();
    }
  },

  startAutoDJ() {
    if (state.djAutoDJInterval) clearInterval(state.djAutoDJInterval);

    const loadedDecks = state.djDecks.filter(d => d.track);
    if (loadedDecks.length === 0) {
      // Auto-fill decks first, then start
      showToast('Auto DJ: filling decks...');
      this.autoFillDecks().then(() => {
        const filled = state.djDecks.filter(d => d.track);
        if (filled.length === 0) {
          showToast('Auto DJ: could not load songs. Check connection.');
          state.djAutoDJEnabled = false;
          $('#dj-autodj-toggle')?.classList.remove('active');
          return;
        }
        this._beginAutoDJPlayback();
      });
      return;
    }
    this._beginAutoDJPlayback();
  },

  _beginAutoDJPlayback() {
    // Start playing first deck if nothing is playing
    const playingDecks = state.djDecks.filter(d => d.isPlaying);
    if (playingDecks.length === 0) {
      const first = state.djDecks.find(d => d.track);
      if (first) this.playDeck(first.id);
    }
    // Monitor every second
    state.djAutoDJInterval = setInterval(() => this._autoDJTick(), 1000);
    showToast('🎧 Auto DJ ON — sit back and enjoy!');
  },

  stopAutoDJ() {
    if (state.djAutoDJInterval) {
      clearInterval(state.djAutoDJInterval);
      state.djAutoDJInterval = null;
    }
    state.djSession = null;
    $('#dj-energy-arc-strip')?.classList.add('hidden');
  },

  async _autoDJTick() {
    if (!state.djAutoDJEnabled || this._tickBusy) return;
    this._tickBusy = true;
    // Choose loader: session setlist (with BPM correction) or classic intelligent search
    const loadNext = (deck) => state.djSession
      ? this.getNextSetlistTrack(deck)
      : this.autoLoadNextSong(deck);
    try {
      const decks = state.djDecks;
      const playingDecks = decks.filter(d => d.isPlaying && d.track);
      // Decks with no track at all — fill them in background
      const emptyDecks = decks.filter(d => !d.track && !d._loading);

      // Auto-load any completely empty decks (non-blocking)
      emptyDecks.forEach(ed => {
        ed._loading = true;
        loadNext(ed).finally(() => { ed._loading = false; });
      });

      if (playingDecks.length === 0) {
        // Nothing playing — find any loaded (and not currently loading) deck and start it
        const first = decks.find(d => d.track && !d._loading);
        if (first) this.playDeck(first.id);
        return;
      }

      for (const deck of playingDecks) {
        if (!deck.audio.duration) continue;
        const remaining = deck.audio.duration - deck.audio.currentTime;

        // ── Transition trigger: within 12s, fire only ONCE per track ──
        if (remaining <= 12 && !deck.transitionTriggered) {
          deck.transitionTriggered = true;

          // Find best next deck: has a track, not playing, and NOT in the middle of loading
          let nextDeck = decks.find(d => d.id !== deck.id && d.track && !d.isPlaying && !d._loading);

          if (!nextDeck) {
            // No ready deck — fire a background load and retry next second
            const idle = decks.find(d => d.id !== deck.id && !d.isPlaying && !d._loading);
            if (idle) {
              idle._loading = true;
              loadNext(idle).finally(() => { idle._loading = false; });
            }
            deck.transitionTriggered = false;
          } else {
            // Ready deck found — start playing it and mix
            this.playDeck(nextDeck.id);
            this._performIntelligentTransition(deck, nextDeck);
            const trackName = nextDeck.track ? getTrackName(nextDeck.track).slice(0, 25) : `Deck ${nextDeck.idx + 1}`;
            showToast(`Auto DJ: mixing → ${trackName}`);
          }
        }

        // ── Song ended (or within last 0.5s): mark done and queue a fresh song ──
        if (remaining <= 0.5) {
          deck.transitionTriggered = false;
          deck.isPlaying = false;
          this.updateDeckPlayBtn(deck);
          this._updateDeckPlayingUI(deck);
          if (!deck._loading) {
            deck._loading = true;
            loadNext(deck).finally(() => { deck._loading = false; });
          }
        }
      }
    } finally {
      this._tickBusy = false;
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // AUTO DJ — Visual Transitions & Deck Glow
  // ═══════════════════════════════════════════════════════════════

  // Smoothly interpolate an EQ band (bass/mid/treble) from fromVal → toVal
  // Updates both Web Audio gain AND the rotary knob + slider visuals in the DJ panel
  _animateKnob(deck, band, fromVal, toVal, durationMs) {
    const steps = Math.max(1, Math.floor(durationMs / 50));
    let step = 0;
    const min = -12, range = 24;
    const circumference = 175.93;
    const deckEl = document.getElementById(`dj-deck-${deck.id}`);
    const iv = setInterval(() => {
      step++;
      const t = step / steps;
      // Cubic ease-in-out
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const val = Math.round(fromVal + (toVal - fromVal) * eased);
      // Update Web Audio gain
      if (deck[band]) deck[band].gain.value = val;
      // Update rotary knob visual
      const knob = deckEl?.querySelector(`.dj-rotary[data-eq="${band}"]`);
      if (knob) {
        const norm = (val - min) / range;
        const offset = circumference * (1 - norm * 0.75);
        const angleDeg = -135 + norm * 270;
        const fill = knob.querySelector('.dj-rotary-fill');
        const ptr = knob.querySelector('.dj-rotary-pointer');
        const vl = knob.querySelector('.dj-rotary-val');
        if (fill) fill.style.strokeDashoffset = offset;
        if (ptr) { ptr.style.transform = `rotate(${angleDeg}deg)`; ptr.style.transformOrigin = '32px 32px'; }
        if (vl) vl.textContent = val > 0 ? `+${val}` : `${val}`;
        knob.dataset.value = val;
      }
      // Update EQ slider and its label (slider mode)
      const slider = deckEl?.querySelector(`.dj-eq-slider[data-eq="${band}"]`);
      if (slider) {
        slider.value = val;
        const label = deckEl?.querySelector(`.dj-seq-val[data-eq="${band}"]`);
        if (label) label.textContent = val > 0 ? `+${val}` : `${val}`;
      }
      if (step >= steps) clearInterval(iv);
    }, 50);
    return iv;
  },

  // Real DJ transition: bass kill on outgoing → crossfade → bass bring-in on incoming
  _performIntelligentTransition(outDeck, nextDeck) {
    const outIdx = state.djDecks.indexOf(outDeck);
    const nextIdx = state.djDecks.indexOf(nextDeck);
    const currentBass = outDeck.bass?.gain?.value ?? 0;

    // 1. Kill bass on outgoing deck over 3s (visual knob animates down)
    this._animateKnob(outDeck, 'bass', currentBass, -12, 3000);

    // 2. Pre-cut incoming deck's bass so the mix starts clean
    if (nextDeck.bass) nextDeck.bass.gain.value = -12;
    const incomingEl = document.getElementById(`dj-deck-${nextDeck.id}`);
    if (incomingEl) this._syncRotaryFromSlider(incomingEl, 'bass', -12);

    // 3. Bring in incoming deck's bass after 2s delay (visual knob animates up)
    setTimeout(() => {
      this._animateKnob(nextDeck, 'bass', -12, 0, 3000);
    }, 2000);

    // 4. Crossfader sweep OR direct volume fade
    const assignA = state.djCrossfaderAssign.a;
    const assignB = state.djCrossfaderAssign.b;
    const onCrossfader = (outIdx === assignA && nextIdx === assignB) ||
      (outIdx === assignB && nextIdx === assignA);
    if (onCrossfader) {
      // Sweep hardware crossfader to next-deck side over 4s
      const targetPos = nextIdx === assignB ? 100 : 0;
      const startPos = state.djCrossfaderPos ?? 50;
      const cfSteps = 80;
      let cfStep = 0;
      const cfIv = setInterval(() => {
        cfStep++;
        const pos = Math.round(startPos + (targetPos - startPos) * (cfStep / cfSteps));
        this.applyCrossfader(pos);
        const slider = $('#dj-crossfader');
        if (slider) slider.value = pos;
        if (cfStep >= cfSteps) clearInterval(cfIv);
      }, 50);
    } else {
      // Fade out outgoing deck volume over 4s
      const startVol = outDeck.volumeGain?.gain?.value ?? 0.8;
      const fadeSteps = 80;
      let fadeStep = 0;
      const fadeIv = setInterval(() => {
        fadeStep++;
        const t = fadeStep / fadeSteps;
        if (outDeck.volumeGain) outDeck.volumeGain.gain.value = Math.max(0, startVol * (1 - t));
        if (fadeStep >= fadeSteps) {
          clearInterval(fadeIv);
          // Restore volume for next auto-load cycle
          setTimeout(() => {
            if (outDeck.volumeGain) outDeck.volumeGain.gain.value = 0.8;
          }, 2000);
        }
      }, 50);
    }

    // 5. Refresh deck glow states
    this._updateDeckPlayingUI(outDeck);
    this._updateDeckPlayingUI(nextDeck);
  },

  // Toggle the .dj-deck-playing CSS class (glowing border + pulsing label) on a deck card
  _updateDeckPlayingUI(deck) {
    const el = document.getElementById(`dj-deck-${deck.id}`);
    if (!el) return;
    el.classList.toggle('dj-deck-playing', !!deck.isPlaying);
  },

  // Enable auto-load-next for a specific deck with optional delay timer
  toggleAutoLoadNext(deckId, timer = 0) {
    const config = state.djAutoLoadNext[deckId];
    if (config?.enabled) {
      delete state.djAutoLoadNext[deckId];
      return false;
    } else {
      state.djAutoLoadNext[deckId] = { enabled: true, timer: timer };
      return true;
    }
  },

  // === DJ Search ===
  openSearchForDeck(deckId) {
    this.searchTargetDeck = deckId;
    const deckNum = state.djDecks.findIndex(d => d.id === deckId) + 1;
    const modal = $('#dj-search-modal');
    const label = $('#dj-search-deck-label');
    const input = $('#dj-search-input');
    const results = $('#dj-search-results');
    if (label) label.textContent = `Deck ${deckNum}`;
    if (results) results.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Search for a song to load</p>';
    if (modal) modal.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
  },

  closeSearch() {
    const modal = $('#dj-search-modal');
    if (modal) modal.classList.add('hidden');
    this.searchTargetDeck = null;
  },

  async doSearch(query) {
    if (!query || query.length < 2) return;
    const results = $('#dj-search-results');
    if (!results) return;
    results.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Searching...</p>';

    const lang = $('#dj-search-lang')?.value || 'all';
    let q = query;
    if (lang !== 'all') {
      const langData = CONFIG.supportedLanguages[lang];
      if (langData) q = `${langData.keywords[0]} ${query}`;
    }

    const tracks = await apiSearch(q, 20);
    if (!tracks.length) {
      results.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">No results found</p>';
      return;
    }

    results.innerHTML = tracks.map(t => `
      <div class="dj-search-result" data-track-id="${t.id}">
        <img src="${getImage(t, 'mid')}" alt="" />
        <div class="dj-search-result-info">
          <div class="dj-search-result-title">${getTrackName(t)}</div>
          <div class="dj-search-result-artist">${getArtistName(t)}</div>
        </div>
        <button class="dj-btn dj-search-load-btn">Load</button>
      </div>
    `).join('');

    // Attach click handlers
    results.querySelectorAll('.dj-search-result').forEach((row, i) => {
      const loadBtn = row.querySelector('.dj-search-load-btn');
      const handler = () => {
        if (this.searchTargetDeck !== null) {
          this.loadTrack(this.searchTargetDeck, tracks[i]);
          this.closeSearch();
        }
      };
      if (loadBtn) loadBtn.addEventListener('click', handler);
      row.addEventListener('dblclick', handler);
    });
  },

  // === Deck UI Rendering ===
  renderDeckCard(deck) {
    const container = $('#dj-decks');
    if (!container) return;
    const num = deck.idx + 1;
    const html = `
    <div class="dj-deck" id="dj-deck-${deck.id}" style="--deck-color:${deck.color};--deck-color-rgb:${deck.colorRgb};">
      <div class="dj-deck-header">
        <span class="dj-deck-number">DECK ${num}</span>
        <div class="dj-deck-track-info">
          <img class="dj-deck-art" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='%231a1a2e'/><text x='20' y='25' text-anchor='middle' fill='%23333' font-size='16'>♪</text></svg>" alt="" />
          <div class="dj-deck-text">
            <div class="dj-deck-title">No track loaded</div>
            <div class="dj-deck-artist">Tap Load to add a song</div>
          </div>
        </div>
        <button class="dj-btn dj-deck-load" data-deck="${deck.id}">Load</button>
        <button class="dj-btn dj-deck-eject" data-deck="${deck.id}">Eject</button>
        ${state.djDecks.length > 2 ? `<button class="dj-btn dj-deck-remove" data-deck="${deck.id}">✕</button>` : ''}
      </div>
      <canvas class="dj-waveform-canvas"></canvas>
      <div class="dj-transport">
        <button class="dj-btn dj-transport-btn dj-stop-btn" data-deck="${deck.id}">⏹</button>
        <button class="dj-btn dj-transport-btn dj-play-btn" data-deck="${deck.id}">▶</button>
        <button class="dj-btn dj-transport-btn dj-cue-btn" data-deck="${deck.id}">CUE</button>
      </div>
      <div class="dj-progress">
        <span class="dj-time dj-time-current">0:00</span>
        <input type="range" class="dj-seek" min="0" max="100" value="0" step="0.1" data-deck="${deck.id}" />
        <span class="dj-time dj-time-duration">0:00</span>
      </div>
      <div class="dj-controls-grid">
        <!-- ===== KNOBS MODE (rotary) ===== -->
        <div class="dj-eq-section dj-mode-knobs" style="display:${state.djLayoutMode === 'knobs' ? 'flex' : 'none'};">
          <div class="dj-eq-title">EQUALIZER</div>
          <div class="dj-eq-knobs-row">
            <div class="dj-rotary-group">
              <div class="dj-rotary" data-deck="${deck.id}" data-eq="treble" data-value="0" data-min="-12" data-max="12">
                <svg viewBox="0 0 64 64" class="dj-rotary-svg">
                  <circle cx="32" cy="32" r="28" class="dj-rotary-track"/>
                  <circle cx="32" cy="32" r="28" class="dj-rotary-fill" stroke-dasharray="175.93" stroke-dashoffset="87.96"/>
                  <line x1="32" y1="32" x2="32" y2="8" class="dj-rotary-pointer"/>
                  <circle cx="32" cy="32" r="12" class="dj-rotary-center"/>
                </svg>
                <span class="dj-rotary-val">0</span>
              </div>
              <label class="dj-rotary-label">HI</label>
            </div>
            <div class="dj-rotary-group">
              <div class="dj-rotary" data-deck="${deck.id}" data-eq="mid" data-value="0" data-min="-12" data-max="12">
                <svg viewBox="0 0 64 64" class="dj-rotary-svg">
                  <circle cx="32" cy="32" r="28" class="dj-rotary-track"/>
                  <circle cx="32" cy="32" r="28" class="dj-rotary-fill" stroke-dasharray="175.93" stroke-dashoffset="87.96"/>
                  <line x1="32" y1="32" x2="32" y2="8" class="dj-rotary-pointer"/>
                  <circle cx="32" cy="32" r="12" class="dj-rotary-center"/>
                </svg>
                <span class="dj-rotary-val">0</span>
              </div>
              <label class="dj-rotary-label">MID</label>
            </div>
            <div class="dj-rotary-group">
              <div class="dj-rotary" data-deck="${deck.id}" data-eq="bass" data-value="0" data-min="-12" data-max="12">
                <svg viewBox="0 0 64 64" class="dj-rotary-svg">
                  <circle cx="32" cy="32" r="28" class="dj-rotary-track"/>
                  <circle cx="32" cy="32" r="28" class="dj-rotary-fill" stroke-dasharray="175.93" stroke-dashoffset="87.96"/>
                  <line x1="32" y1="32" x2="32" y2="8" class="dj-rotary-pointer"/>
                  <circle cx="32" cy="32" r="12" class="dj-rotary-center"/>
                </svg>
                <span class="dj-rotary-val">0</span>
              </div>
              <label class="dj-rotary-label">LO</label>
            </div>
          </div>
        </div>
        <div class="dj-fx-section dj-mode-knobs" style="display:${state.djLayoutMode === 'knobs' ? 'flex' : 'none'};">
          <div class="dj-fx-title">FX</div>
          <div class="dj-eq-knobs-row">
            <div class="dj-rotary-group">
              <div class="dj-rotary dj-rotary-fx" data-deck="${deck.id}" data-fx="echo" data-value="0" data-min="0" data-max="100">
                <svg viewBox="0 0 64 64" class="dj-rotary-svg">
                  <circle cx="32" cy="32" r="28" class="dj-rotary-track"/>
                  <circle cx="32" cy="32" r="28" class="dj-rotary-fill dj-fx-fill" stroke-dasharray="175.93" stroke-dashoffset="175.93"/>
                  <line x1="32" y1="32" x2="32" y2="8" class="dj-rotary-pointer"/>
                  <circle cx="32" cy="32" r="12" class="dj-rotary-center"/>
                </svg>
                <span class="dj-rotary-val">0</span>
              </div>
              <label class="dj-rotary-label">ECHO</label>
            </div>
            <div class="dj-rotary-group">
              <div class="dj-rotary dj-rotary-fx" data-deck="${deck.id}" data-fx="filter" data-value="100" data-min="0" data-max="100">
                <svg viewBox="0 0 64 64" class="dj-rotary-svg">
                  <circle cx="32" cy="32" r="28" class="dj-rotary-track"/>
                  <circle cx="32" cy="32" r="28" class="dj-rotary-fill dj-fx-fill" stroke-dasharray="175.93" stroke-dashoffset="0"/>
                  <line x1="32" y1="32" x2="32" y2="8" class="dj-rotary-pointer"/>
                  <circle cx="32" cy="32" r="12" class="dj-rotary-center"/>
                </svg>
                <span class="dj-rotary-val">100</span>
              </div>
              <label class="dj-rotary-label">FILTER</label>
            </div>
          </div>
        </div>
        <!-- ===== SLIDERS MODE (classic) ===== -->
        <div class="dj-eq-section dj-mode-sliders" style="display:${state.djLayoutMode === 'sliders' ? 'flex' : 'none'};">
          <div class="dj-eq-title">EQUALIZER</div>
          <div class="dj-eq-sliders-row">
            <div class="dj-slider-group">
              <span class="dj-slider-val dj-seq-val" data-eq="treble">0</span>
              <input type="range" class="dj-eq-slider" min="-12" max="12" value="0" step="1" data-deck="${deck.id}" data-eq="treble" />
              <label class="dj-slider-label">HI</label>
            </div>
            <div class="dj-slider-group">
              <span class="dj-slider-val dj-seq-val" data-eq="mid">0</span>
              <input type="range" class="dj-eq-slider" min="-12" max="12" value="0" step="1" data-deck="${deck.id}" data-eq="mid" />
              <label class="dj-slider-label">MID</label>
            </div>
            <div class="dj-slider-group">
              <span class="dj-slider-val dj-seq-val" data-eq="bass">0</span>
              <input type="range" class="dj-eq-slider" min="-12" max="12" value="0" step="1" data-deck="${deck.id}" data-eq="bass" />
              <label class="dj-slider-label">LO</label>
            </div>
          </div>
        </div>
        <div class="dj-fx-section dj-mode-sliders" style="display:${state.djLayoutMode === 'sliders' ? 'flex' : 'none'};">
          <div class="dj-fx-title">FX</div>
          <div class="dj-eq-sliders-row">
            <div class="dj-slider-group">
              <span class="dj-slider-val dj-sfx-val" data-fx="echo">0</span>
              <input type="range" class="dj-fx-slider" min="0" max="100" value="0" step="1" data-deck="${deck.id}" data-fx="echo" />
              <label class="dj-slider-label">ECHO</label>
            </div>
            <div class="dj-slider-group">
              <span class="dj-slider-val dj-sfx-val" data-fx="filter">100</span>
              <input type="range" class="dj-fx-slider" min="0" max="100" value="100" step="1" data-deck="${deck.id}" data-fx="filter" />
              <label class="dj-slider-label">FILTER</label>
            </div>
          </div>
        </div>
        <div class="dj-vol-section">
          <div class="dj-vol-title">VOLUME</div>
          <input type="range" class="dj-vol-fader" min="0" max="100" value="80" data-deck="${deck.id}" />
          <span class="dj-vol-val">80%</span>
        </div>
        <div class="dj-speed-section">
          <div class="dj-speed-title">SPEED</div>
          <div class="dj-speed-row">
            <button class="dj-btn dj-speed-nudge" data-deck="${deck.id}" data-dir="-1">−</button>
            <input type="range" class="dj-speed-slider" min="50" max="200" value="100" step="5" data-deck="${deck.id}" />
            <button class="dj-btn dj-speed-nudge" data-deck="${deck.id}" data-dir="1">+</button>
          </div>
          <span class="dj-speed-val">1.00x</span>
        </div>
        <div class="dj-loop-section">
          <div class="dj-loop-title">LOOP</div>
          <div class="dj-loop-row">
            <button class="dj-btn dj-loop-btn dj-loop-in" data-deck="${deck.id}">IN</button>
            <button class="dj-btn dj-loop-btn dj-loop-out" data-deck="${deck.id}">OUT</button>
            <button class="dj-btn dj-loop-btn dj-loop-toggle" data-deck="${deck.id}">LOOP</button>
          </div>
          <div class="dj-loop-row">
            <button class="dj-btn dj-loop-btn dj-loop-len" data-deck="${deck.id}" data-len="1">1s</button>
            <button class="dj-btn dj-loop-btn dj-loop-len" data-deck="${deck.id}" data-len="2">2s</button>
            <button class="dj-btn dj-loop-btn dj-loop-len" data-deck="${deck.id}" data-len="4">4s</button>
            <button class="dj-btn dj-loop-btn dj-loop-len" data-deck="${deck.id}" data-len="8">8s</button>
          </div>
        </div>
      </div>
      <div class="dj-extras-row">
        <div class="dj-bpm-display">
          <span class="dj-bpm-label">BPM</span>
          <span class="dj-bpm-val">---</span>
        </div>
        <button class="dj-btn dj-keylock-btn" data-deck="${deck.id}">🔑 KEY</button>
        <button class="dj-btn dj-automix-btn" data-deck="${deck.id}">🤖 AUTO</button>
        <button class="dj-btn dj-autoload-btn" data-deck="${deck.id}" title="Auto-load &amp; play next song when current ends">🔄 NEXT</button>
      </div>
      <div class="dj-cue-section">
        <div class="dj-cue-title">HOT CUE</div>
        <div class="dj-cue-pads">
          <div class="dj-cue-pad" data-deck="${deck.id}" data-pad="0">1</div>
          <div class="dj-cue-pad" data-deck="${deck.id}" data-pad="1">2</div>
          <div class="dj-cue-pad" data-deck="${deck.id}" data-pad="2">3</div>
          <div class="dj-cue-pad" data-deck="${deck.id}" data-pad="3">4</div>
        </div>
      </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', html);

    // Attach events for this deck card
    this.attachDeckEvents(deck);
  },

  attachDeckEvents(deck) {
    const el = document.getElementById(`dj-deck-${deck.id}`);
    if (!el) return;
    const did = deck.id;

    // Load
    el.querySelector('.dj-deck-load')?.addEventListener('click', () => this.openSearchForDeck(did));
    // Eject
    el.querySelector('.dj-deck-eject')?.addEventListener('click', () => {
      deck.audio.pause(); deck.audio.src = ''; deck.track = null; deck.isPlaying = false;
      this.updateDeckTrackInfo(deck);
      this.updateDeckPlayBtn(deck);
    });
    // Remove
    el.querySelector('.dj-deck-remove')?.addEventListener('click', () => this.removeDeck(did));
    // Play
    el.querySelector('.dj-play-btn')?.addEventListener('click', () => this.toggleDeck(did));
    // Stop
    el.querySelector('.dj-stop-btn')?.addEventListener('click', () => this.stopDeck(did));
    // Cue
    el.querySelector('.dj-cue-btn')?.addEventListener('click', () => this.cueDeck(did));
    // Seek
    el.querySelector('.dj-seek')?.addEventListener('input', (e) => {
      if (deck.audio.duration) deck.audio.currentTime = (e.target.value / 100) * deck.audio.duration;
    });
    // Waveform click seek
    el.querySelector('.dj-waveform-canvas')?.addEventListener('click', (e) => {
      if (!deck.audio.duration) return;
      const rect = e.target.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      deck.audio.currentTime = ratio * deck.audio.duration;
    });
    // Volume
    el.querySelector('.dj-vol-fader')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value) / 100;
      this.setDeckVolume(did, v);
      const valEl = el.querySelector('.dj-vol-val');
      if (valEl) valEl.textContent = `${e.target.value}%`;
    });
    // Rotary EQ knobs (drag interaction)
    el.querySelectorAll('.dj-rotary[data-eq]').forEach(knob => {
      this._initRotaryKnob(knob, (val) => {
        const band = knob.dataset.eq;
        this.setDeckEQ(did, band, val);
        // Sync slider if visible
        const slider = el.querySelector(`.dj-eq-slider[data-eq="${band}"]`);
        if (slider) slider.value = val;
        const sval = el.querySelector(`.dj-seq-val[data-eq="${band}"]`);
        if (sval) sval.textContent = val > 0 ? `+${val}` : val;
      });
    });
    // FX rotary knobs
    el.querySelectorAll('.dj-rotary[data-fx]').forEach(knob => {
      this._initRotaryKnob(knob, (val) => {
        const fx = knob.dataset.fx;
        if (fx === 'echo') this.setDeckEcho(did, val);
        else if (fx === 'filter') this.setDeckFilter(did, val);
        // Sync slider
        const slider = el.querySelector(`.dj-fx-slider[data-fx="${fx}"]`);
        if (slider) slider.value = val;
        const sval = el.querySelector(`.dj-sfx-val[data-fx="${fx}"]`);
        if (sval) sval.textContent = val;
      });
    });
    // Slider-mode EQ
    el.querySelectorAll('.dj-eq-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const band = e.target.dataset.eq;
        const val = parseFloat(e.target.value);
        this.setDeckEQ(did, band, val);
        const sval = el.querySelector(`.dj-seq-val[data-eq="${band}"]`);
        if (sval) sval.textContent = val > 0 ? `+${val}` : val;
        // Sync rotary knob
        this._syncRotaryFromSlider(el, band, val);
      });
    });
    // Slider-mode FX
    el.querySelectorAll('.dj-fx-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const fx = e.target.dataset.fx;
        const val = parseFloat(e.target.value);
        if (fx === 'echo') this.setDeckEcho(did, val);
        else if (fx === 'filter') this.setDeckFilter(did, val);
        const sval = el.querySelector(`.dj-sfx-val[data-fx="${fx}"]`);
        if (sval) sval.textContent = Math.round(val);
        // Sync rotary knob
        this._syncRotaryFXFromSlider(el, fx, val);
      });
    });
    // Key Lock
    el.querySelector('.dj-keylock-btn')?.addEventListener('click', () => {
      const active = this.toggleKeyLock(did);
      const btn = el.querySelector('.dj-keylock-btn');
      if (btn) btn.classList.toggle('active', active);
    });
    // Auto-Mix
    el.querySelector('.dj-automix-btn')?.addEventListener('click', () => {
      const active = this.toggleAutoMix(did);
      const btn = el.querySelector('.dj-automix-btn');
      if (btn) btn.classList.toggle('active', active);
    });
    // Auto-Load Next
    el.querySelector('.dj-autoload-btn')?.addEventListener('click', () => {
      const active = this.toggleAutoLoadNext(did, 0);
      const btn = el.querySelector('.dj-autoload-btn');
      if (btn) btn.classList.toggle('active', active);
      showToast(active ? `Deck ${deck.idx + 1}: Auto-load next song ON` : `Deck ${deck.idx + 1}: Auto-load OFF`);
    });
    // Speed slider
    el.querySelector('.dj-speed-slider')?.addEventListener('input', (e) => {
      const rate = parseInt(e.target.value) / 100;
      this.setDeckSpeed(did, rate);
      const valEl = el.querySelector('.dj-speed-val');
      if (valEl) valEl.textContent = `${rate.toFixed(2)}x`;
    });
    // Speed nudge
    el.querySelectorAll('.dj-speed-nudge').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = parseInt(btn.dataset.dir);
        const slider = el.querySelector('.dj-speed-slider');
        if (!slider) return;
        slider.value = Math.max(50, Math.min(200, parseInt(slider.value) + dir * 5));
        slider.dispatchEvent(new Event('input'));
      });
    });
    // Loop IN/OUT/Toggle
    el.querySelector('.dj-loop-in')?.addEventListener('click', () => this.setLoopIn(did));
    el.querySelector('.dj-loop-out')?.addEventListener('click', () => this.setLoopOut(did));
    el.querySelector('.dj-loop-toggle')?.addEventListener('click', () => this.toggleLoop(did));
    // Loop length
    el.querySelectorAll('.dj-loop-len').forEach(btn => {
      btn.addEventListener('click', () => this.setLoopLength(did, parseInt(btn.dataset.len)));
    });
    // Hot cue pads
    el.querySelectorAll('.dj-cue-pad').forEach(pad => {
      let longTimer = null;
      const padIdx = parseInt(pad.dataset.pad);
      pad.addEventListener('mousedown', () => {
        longTimer = setTimeout(() => { this.clearCuePoint(did, padIdx); longTimer = null; }, 500);
      });
      pad.addEventListener('mouseup', () => {
        if (longTimer) { clearTimeout(longTimer); this.setCuePoint(did, padIdx); }
      });
      pad.addEventListener('mouseleave', () => { if (longTimer) clearTimeout(longTimer); });
      // Touch
      pad.addEventListener('touchstart', (e) => {
        e.preventDefault();
        longTimer = setTimeout(() => { this.clearCuePoint(did, padIdx); longTimer = null; }, 500);
      });
      pad.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (longTimer) { clearTimeout(longTimer); this.setCuePoint(did, padIdx); }
      });
    });
  },

  // === UI Update Helpers ===
  updateDeckTrackInfo(deck) {
    const el = document.getElementById(`dj-deck-${deck.id}`);
    if (!el) return;
    const art = el.querySelector('.dj-deck-art');
    const title = el.querySelector('.dj-deck-title');
    const artist = el.querySelector('.dj-deck-artist');
    if (deck.track) {
      if (art) art.src = getImage(deck.track, 'mid');
      if (title) title.textContent = getTrackName(deck.track);
      if (artist) artist.textContent = getArtistName(deck.track);
      el.classList.add('active');
    } else {
      if (art) art.src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='%231a1a2e'/><text x='20' y='25' text-anchor='middle' fill='%23333' font-size='16'>♪</text></svg>";
      if (title) title.textContent = 'No track loaded';
      if (artist) artist.textContent = 'Tap Load to add a song';
      el.classList.remove('active');
    }
  },

  // Rotary knob interaction helper
  _initRotaryKnob(el, onChange) {
    const min = parseFloat(el.dataset.min);
    const max = parseFloat(el.dataset.max);
    let value = parseFloat(el.dataset.value);
    const range = max - min;
    const ARC_DEGREES = 270; // knob sweep range
    const circumference = 175.93; // 2 * Math.PI * 28

    const updateVisual = (val) => {
      // Normalize 0-1
      const norm = (val - min) / range;
      // Arc: starts from bottom-left, sweeps clockwise
      const angleDeg = -135 + norm * ARC_DEGREES;
      const offset = circumference * (1 - norm * 0.75); // 75% of circle used
      const fillCircle = el.querySelector('.dj-rotary-fill');
      const pointer = el.querySelector('.dj-rotary-pointer');
      const valLabel = el.querySelector('.dj-rotary-val') ||
        el.closest('.dj-rotary-group')?.querySelector('.dj-rotary-val');
      if (fillCircle) fillCircle.style.strokeDashoffset = offset;
      if (pointer) pointer.style.transform = `rotate(${angleDeg}deg)`;
      if (pointer) pointer.style.transformOrigin = '32px 32px';
      if (valLabel) valLabel.textContent = val > 0 && min < 0 ? `+${val}` : `${val}`;
      el.dataset.value = val;
    };

    updateVisual(value);

    let dragging = false;
    let startY = 0;
    let startVal = 0;

    const onStart = (clientY) => {
      dragging = true;
      startY = clientY;
      startVal = parseFloat(el.dataset.value);
      el.classList.add('dj-rotary-active');
    };

    const onMove = (clientY) => {
      if (!dragging) return;
      const delta = (startY - clientY) * (range / 150); // 150px = full range
      let newVal = startVal + delta;
      // Snap to integer if range allows
      if (Number.isInteger(min) && Number.isInteger(max)) newVal = Math.round(newVal);
      newVal = Math.max(min, Math.min(max, newVal));
      value = newVal;
      updateVisual(value);
      onChange(value);
    };

    const onEnd = () => {
      dragging = false;
      el.classList.remove('dj-rotary-active');
    };

    el.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(e.clientY); });
    window.addEventListener('mousemove', (e) => onMove(e.clientY));
    window.addEventListener('mouseup', onEnd);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(e.touches[0].clientY); });
    window.addEventListener('touchmove', (e) => { if (dragging) onMove(e.touches[0].clientY); });
    window.addEventListener('touchend', onEnd);
    // Double-click to reset
    el.addEventListener('dblclick', () => {
      const defaultVal = min < 0 ? 0 : min;
      value = defaultVal;
      updateVisual(value);
      onChange(value);
    });
  },

  // Sync rotary knob visual when slider changes
  _syncRotaryFromSlider(el, band, val) {
    const knob = el.querySelector(`.dj-rotary[data-eq="${band}"]`);
    if (!knob) return;
    knob.dataset.value = val;
    const min = -12, max = 12, range = 24;
    const norm = (val - min) / range;
    const circumference = 175.93;
    const angleDeg = -135 + norm * 270;
    const offset = circumference * (1 - norm * 0.75);
    const fill = knob.querySelector('.dj-rotary-fill');
    const ptr = knob.querySelector('.dj-rotary-pointer');
    const vl = knob.querySelector('.dj-rotary-val');
    if (fill) fill.style.strokeDashoffset = offset;
    if (ptr) { ptr.style.transform = `rotate(${angleDeg}deg)`; ptr.style.transformOrigin = '32px 32px'; }
    if (vl) vl.textContent = val > 0 ? `+${val}` : `${val}`;
  },

  _syncRotaryFXFromSlider(el, fx, val) {
    const knob = el.querySelector(`.dj-rotary[data-fx="${fx}"]`);
    if (!knob) return;
    knob.dataset.value = val;
    const min = 0, max = 100, range = 100;
    const norm = (val - min) / range;
    const circumference = 175.93;
    const angleDeg = -135 + norm * 270;
    const offset = circumference * (1 - norm * 0.75);
    const fill = knob.querySelector('.dj-rotary-fill');
    const ptr = knob.querySelector('.dj-rotary-pointer');
    const vl = knob.querySelector('.dj-rotary-val');
    if (fill) fill.style.strokeDashoffset = offset;
    if (ptr) { ptr.style.transform = `rotate(${angleDeg}deg)`; ptr.style.transformOrigin = '32px 32px'; }
    if (vl) vl.textContent = Math.round(val);
  },

  // Switch layout between knobs and sliders
  switchDJLayout(mode) {
    state.djLayoutMode = mode;
    localStorage.setItem('raagam_djLayout', mode);
    const showKnobs = mode === 'knobs';
    // Toggle all deck sections
    document.querySelectorAll('.dj-mode-knobs').forEach(el => el.style.display = showKnobs ? 'flex' : 'none');
    document.querySelectorAll('.dj-mode-sliders').forEach(el => el.style.display = showKnobs ? 'none' : 'flex');
    // Update toggle button
    const btn = $('#dj-layout-toggle');
    if (btn) {
      btn.querySelector('.dj-lt-icon').textContent = showKnobs ? '🎛' : '🎚';
      btn.querySelector('.dj-lt-label').textContent = showKnobs ? 'Knobs' : 'Sliders';
    }
    // Sync slider values from current knob values
    state.djDecks.forEach(deck => {
      const el = document.getElementById(`dj-deck-${deck.id}`);
      if (!el) return;
      ['treble', 'mid', 'bass'].forEach(band => {
        const curVal = deck[band].gain.value;
        const slider = el.querySelector(`.dj-eq-slider[data-eq="${band}"]`);
        if (slider) slider.value = Math.round(curVal);
        const sval = el.querySelector(`.dj-seq-val[data-eq="${band}"]`);
        if (sval) sval.textContent = curVal > 0 ? `+${Math.round(curVal)}` : Math.round(curVal);
      });
      // FX sliders
      const echoSlider = el.querySelector('.dj-fx-slider[data-fx="echo"]');
      if (echoSlider) echoSlider.value = deck.fxEcho;
      const echoVal = el.querySelector('.dj-sfx-val[data-fx="echo"]');
      if (echoVal) echoVal.textContent = Math.round(deck.fxEcho);
      const filterSlider = el.querySelector('.dj-fx-slider[data-fx="filter"]');
      if (filterSlider) filterSlider.value = deck.fxFilter;
      const filterVal = el.querySelector('.dj-sfx-val[data-fx="filter"]');
      if (filterVal) filterVal.textContent = Math.round(deck.fxFilter);
    });
  },

  // ===== AUTO DJ EQ ENGINE =====
  // Analyzes frequency spectrum and auto-adjusts EQ for musical movement
  toggleGlobalAutoEQ() {
    state.djAutoEQGlobal = !state.djAutoEQGlobal;
    const btn = $('#dj-autoeq-toggle');
    if (btn) btn.classList.toggle('active', state.djAutoEQGlobal);
    if (state.djAutoEQGlobal) {
      // Start auto EQ on all playing decks
      state.djDecks.forEach(deck => {
        if (deck.isPlaying) this.startAutoEQ(deck);
      });
      showToast('Auto EQ ON — EQ moves with the music');
    } else {
      // Stop all
      state.djDecks.forEach(deck => this.stopAutoEQ(deck));
      showToast('Auto EQ OFF');
    }
  },

  startAutoEQ(deck) {
    if (deck._autoEQInterval) return;
    deck.autoEQEnabled = true;
    const bufLen = deck.analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufLen);
    // Frequency bin resolution: sampleRate / fftSize. At 44100Hz, fftSize=2048 → ~21.5Hz/bin
    // Bass: 0-430Hz (bins 0-20), Mid: 430-6000Hz (bins 20-279), Treble: 6000Hz+ (bins 279+)
    const bassEnd = 20, midEnd = 279;

    deck._autoEQInterval = setInterval(() => {
      if (!deck.isPlaying || !deck.audio.duration) return;
      deck.analyser.getByteFrequencyData(freqData);

      // Compute average energy per band
      let bassSum = 0, midSum = 0, trebleSum = 0;
      for (let i = 0; i < bassEnd; i++) bassSum += freqData[i];
      for (let i = bassEnd; i < midEnd; i++) midSum += freqData[i];
      for (let i = midEnd; i < bufLen; i++) trebleSum += freqData[i];
      const bassAvg = bassSum / bassEnd;
      const midAvg = midSum / (midEnd - bassEnd);
      const trebleAvg = trebleSum / (bufLen - midEnd);
      const totalAvg = (bassAvg + midAvg + trebleAvg) / 3 || 1;

      // Compute relative strength (0-2 range, 1 = balanced)
      const bassRel = bassAvg / totalAvg;
      const midRel = midAvg / totalAvg;
      const trebleRel = trebleAvg / totalAvg;

      // Target EQ: cut dominant bands, boost weak bands (±6dB max)
      // If a band is 1.5x average, cut it by up to -4dB; if 0.5x, boost by up to +4dB
      const computeTarget = (rel) => {
        if (rel > 1.4) return -Math.min((rel - 1) * 4, 6);
        if (rel < 0.6) return Math.min((1 - rel) * 5, 6);
        // Subtle movement in balanced range
        return (1 - rel) * 2;
      };

      let bassTarget = computeTarget(bassRel);
      let midTarget = computeTarget(midRel);
      let trebleTarget = computeTarget(trebleRel);

      // Add subtle randomness for organic feel (±0.5dB)
      bassTarget += (Math.random() - 0.5) * 0.5;
      midTarget += (Math.random() - 0.5) * 0.5;
      trebleTarget += (Math.random() - 0.5) * 0.5;

      // Clamp to ±6dB
      bassTarget = Math.max(-6, Math.min(6, bassTarget));
      midTarget = Math.max(-6, Math.min(6, midTarget));
      trebleTarget = Math.max(-6, Math.min(6, trebleTarget));

      // Smooth interpolation towards target (lerp)
      const lerp = 0.15;
      deck._autoEQTargets.bass += (bassTarget - deck._autoEQTargets.bass) * lerp;
      deck._autoEQTargets.mid += (midTarget - deck._autoEQTargets.mid) * lerp;
      deck._autoEQTargets.treble += (trebleTarget - deck._autoEQTargets.treble) * lerp;

      const bv = Math.round(deck._autoEQTargets.bass * 10) / 10;
      const mv = Math.round(deck._autoEQTargets.mid * 10) / 10;
      const tv = Math.round(deck._autoEQTargets.treble * 10) / 10;

      // Apply
      deck.bass.gain.setTargetAtTime(bv, this.context.currentTime, 0.08);
      deck.mid.gain.setTargetAtTime(mv, this.context.currentTime, 0.08);
      deck.treble.gain.setTargetAtTime(tv, this.context.currentTime, 0.08);

      // Update UI — knobs and sliders
      this._updateEQUI(deck, 'bass', bv);
      this._updateEQUI(deck, 'mid', mv);
      this._updateEQUI(deck, 'treble', tv);
    }, 200);
  },

  stopAutoEQ(deck) {
    if (deck._autoEQInterval) {
      clearInterval(deck._autoEQInterval);
      deck._autoEQInterval = null;
    }
    deck.autoEQEnabled = false;
    deck._autoEQTargets = { bass: 0, mid: 0, treble: 0 };
  },

  // Update both knob and slider UI for a given EQ band
  _updateEQUI(deck, band, val) {
    const el = document.getElementById(`dj-deck-${deck.id}`);
    if (!el) return;
    const roundVal = Math.round(val);
    // Slider
    const slider = el.querySelector(`.dj-eq-slider[data-eq="${band}"]`);
    if (slider) slider.value = roundVal;
    const sval = el.querySelector(`.dj-seq-val[data-eq="${band}"]`);
    if (sval) sval.textContent = roundVal > 0 ? `+${roundVal}` : `${roundVal}`;
    // Rotary knob
    this._syncRotaryFromSlider(el, band, roundVal);
  },

  updateDeckPlayBtn(deck) {
    const el = document.getElementById(`dj-deck-${deck.id}`);
    if (!el) return;
    const btn = el.querySelector('.dj-play-btn');
    if (btn) btn.textContent = deck.isPlaying ? '⏸' : '▶';
  },

  updateLoopUI(deck) {
    const el = document.getElementById(`dj-deck-${deck.id}`);
    if (!el) return;
    const inBtn = el.querySelector('.dj-loop-in');
    const outBtn = el.querySelector('.dj-loop-out');
    const togBtn = el.querySelector('.dj-loop-toggle');
    if (inBtn) inBtn.classList.toggle('active', deck.loopIn !== null);
    if (outBtn) outBtn.classList.toggle('active', deck.loopOut !== null);
    if (togBtn) togBtn.classList.toggle('active', deck.loopActive);
  },

  updateCuePadUI(deck, padIdx) {
    const el = document.getElementById(`dj-deck-${deck.id}`);
    if (!el) return;
    const pad = el.querySelector(`.dj-cue-pad[data-pad="${padIdx}"]`);
    if (!pad) return;
    pad.classList.toggle('set', deck.cuePoints[padIdx] !== null);
  },

  resetDeckCueUI(deck) {
    for (let i = 0; i < 4; i++) this.updateCuePadUI(deck, i);
    this.updateLoopUI(deck);
  },

  updateCrossfaderSelects() {
    const selA = $('#dj-cf-a');
    const selB = $('#dj-cf-b');
    if (!selA || !selB) return;
    const opts = state.djDecks.map((d, i) => `<option value="${i}">Deck ${i + 1}</option>`).join('');
    selA.innerHTML = opts;
    selB.innerHTML = opts;
    selA.value = state.djCrossfaderAssign.a;
    selB.value = state.djCrossfaderAssign.b;
  },

  // === Cleanup ===
  destroy() {
    state.djDecks.forEach(d => {
      d.audio.pause();
      d.audio.src = '';
      if (d.waveformAnim) cancelAnimationFrame(d.waveformAnim);
      try {
        if (d.source) d.source.disconnect();
        d.volumeGain.disconnect();
        d.bass.disconnect();
        d.mid.disconnect();
        d.treble.disconnect();
        d.analyser.disconnect();
      } catch (e) { /* ok */ }
    });
    state.djDecks = [];
    this.deckCounter = 0;
    try {
      if (this.crossfaderGainA) this.crossfaderGainA.disconnect();
      if (this.crossfaderGainB) this.crossfaderGainB.disconnect();
      if (this.masterGain) this.masterGain.disconnect();
    } catch (e) { /* ok */ }
    this.masterGain = null;
    this.crossfaderGainA = null;
    this.crossfaderGainB = null;
    this.initialized = false;
    const container = $('#dj-decks');
    if (container) container.innerHTML = '';
  }
};

// ===== Feature Tour / Onboarding Overlay =====
function showFeatureTour() {
  document.querySelector('.feature-tour-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'feature-tour-overlay';
  overlay.innerHTML = `
    <div class="feature-tour-panel">
      <div class="feature-tour-header">
        <div class="feature-tour-logo">
          <svg viewBox="0 0 120 120" width="48" height="48">
            <defs><linearGradient id="ft-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs>
            <rect x="4" y="4" width="112" height="112" rx="26" fill="url(#ft-grad)"/>
            <g transform="translate(60,60)" fill="white">
              <rect x="-28" y="-10" width="6" height="20" rx="3" opacity=".8"/>
              <rect x="-16" y="-18" width="6" height="36" rx="3" opacity=".85"/>
              <rect x="-4" y="-24" width="6" height="48" rx="3"/>
              <rect x="8" y="-16" width="6" height="32" rx="3" opacity=".85"/>
              <rect x="20" y="-20" width="6" height="40" rx="3" opacity=".9"/>
            </g>
          </svg>
        </div>
        <div>
          <h2>Welcome to Raagam</h2>
          <p class="feature-tour-subtitle">Your Music, Your Vibe</p>
        </div>
        <button class="feature-tour-close" onclick="this.closest('.feature-tour-overlay').remove()">✕</button>
      </div>
      <div class="feature-tour-body">

        <div class="ft-section ft-hero">
          <p>Discover all the powerful features built into Raagam — from unlimited streaming to a full DJ mixer.</p>
        </div>

        <div class="ft-category">🎵 Music Streaming</div>

        <div class="ft-card">
          <div class="ft-card-icon">🔍</div>
          <div class="ft-card-info">
            <h4>Search & Play Instantly</h4>
            <p>Search millions of songs across Hindi, Telugu, Tamil, English, Punjabi & more. Tap any song to start playing immediately.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">📻</div>
          <div class="ft-card-info">
            <h4>Song Radio</h4>
            <p>Tap the radio icon on any playing song to get an endless mix of similar tracks — auto-plays one after another.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">❤️</div>
          <div class="ft-card-info">
            <h4>Like & Library</h4>
            <p>Heart any song to save it to your Liked Songs. Access all your favorites from the Library tab anytime.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">📝</div>
          <div class="ft-card-info">
            <h4>Playlists</h4>
            <p>Create custom playlists, add songs, reorder them, and enjoy your curated collections on repeat.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">🕐</div>
          <div class="ft-card-info">
            <h4>Recently Played</h4>
            <p>Your listening history is automatically saved. Quickly jump back to songs you recently enjoyed.</p>
          </div>
        </div>

        <div class="ft-category">🎛️ Player Controls</div>

        <div class="ft-card">
          <div class="ft-card-icon">🔀</div>
          <div class="ft-card-info">
            <h4>Shuffle & Repeat</h4>
            <p>Shuffle your queue for random playback. Repeat a single song or the entire queue with one tap.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">📊</div>
          <div class="ft-card-info">
            <h4>Equalizer</h4>
            <p>Fine-tune your sound with Bass, Mid, and Treble controls. Available in Settings.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">⏩</div>
          <div class="ft-card-info">
            <h4>Playback Speed</h4>
            <p>Speed up or slow down playback (0.5x to 2x). Great for podcasts or when you want a different feel.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">🔄</div>
          <div class="ft-card-info">
            <h4>Crossfade</h4>
            <p>Enable smooth transitions between songs with configurable crossfade duration (1-12 seconds).</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">📋</div>
          <div class="ft-card-info">
            <h4>Smart Queue</h4>
            <p>Intelligent queue management that builds a smart playlist around your taste. Toggle in Settings.</p>
          </div>
        </div>

        <div class="ft-category">⏰ Utilities</div>

        <div class="ft-card">
          <div class="ft-card-icon">😴</div>
          <div class="ft-card-info">
            <h4>Sleep Timer</h4>
            <p>Set a timer to automatically stop music after 15, 30, 45, or 60 minutes. Perfect for bedtime.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">⏰</div>
          <div class="ft-card-info">
            <h4>Alarm Clock</h4>
            <p>Wake up to your favorite music! Set an alarm time and choose a song. Works even with the app in background.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">🌐</div>
          <div class="ft-card-info">
            <h4>Multi-Language Support</h4>
            <p>Browse and search in Hindi, Telugu, Tamil, English, Kannada, Malayalam, Punjabi and more.</p>
          </div>
        </div>

        <div class="ft-category">🎧 DJ Mixer</div>

        <div class="ft-card">
          <div class="ft-card-icon">🎚️</div>
          <div class="ft-card-info">
            <h4>Multi-Deck DJ System</h4>
            <p>Mix songs like a real DJ with 2-6 decks. Each deck has independent play, pause, stop, speed, and volume controls.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">🎛️</div>
          <div class="ft-card-info">
            <h4>EQ & Effects</h4>
            <p>Per-deck 3-band EQ (Bass, Mid, Treble), Echo delay effect, and Frequency filter sweep. Switch between knob and slider modes.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">🔀</div>
          <div class="ft-card-info">
            <h4>Crossfader & BPM</h4>
            <p>Hardware-style crossfader with equal-power curve. Auto BPM detection, key lock, and beat matching.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">🔴</div>
          <div class="ft-card-info">
            <h4>Hot Cues & Loops</h4>
            <p>4 color-coded hot cue pads per deck. Set loop in/out points or quick 1s/2s/4s/8s loops.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">🤖</div>
          <div class="ft-card-info">
            <h4>Auto DJ & Auto EQ</h4>
            <p>Enable Auto DJ for fully hands-free mixing with smooth crossfade transitions. Auto EQ analyzes audio and adjusts frequencies in real-time.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">⚡</div>
          <div class="ft-card-info">
            <h4>Auto-Fill & Auto-Load Next</h4>
            <p>Auto-Fill loads random songs into all empty decks by language. Auto-Load Next queues up the next song automatically when a track ends.</p>
          </div>
        </div>

        <div class="ft-category">⚙️ Settings & More</div>

        <div class="ft-card">
          <div class="ft-card-icon">🔊</div>
          <div class="ft-card-info">
            <h4>Audio Quality</h4>
            <p>Choose between High (320kbps), Medium (160kbps), Low (96kbps), or Data Saver (48kbps) based on your network.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">🛡️</div>
          <div class="ft-card-info">
            <h4>Resilient Streaming</h4>
            <p>6 API mirrors with automatic failover via circuit breaker pattern. If one server is down, it seamlessly switches to another.</p>
          </div>
        </div>

        <div class="ft-card">
          <div class="ft-card-icon">📱</div>
          <div class="ft-card-info">
            <h4>PWA — Install as App</h4>
            <p>Works offline, installable on your phone's home screen. Full-screen, native app-like experience with no ads ever.</p>
          </div>
        </div>

        <div class="ft-category">🧠 Intelligence Features</div>

        <div class="ft-card ft-card-new">
          <div class="ft-card-icon">🎧</div>
          <div class="ft-card-info">
            <h4>Smart DJ Mode <span class="ft-badge-new">NEW</span></h4>
            <p>One tap on the Smart DJ button in Now Playing. Choose a vibe (Morning, Workout, Party, Chill, Romantic, Wind Down) and the app automatically builds and refreshes your queue — completely hands-free.</p>
          </div>
        </div>

        <div class="ft-card ft-card-new">
          <div class="ft-card-icon">🌅</div>
          <div class="ft-card-info">
            <h4>Energy Vibe Arcs <span class="ft-badge-new">NEW</span></h4>
            <p>7 intelligent vibes: Auto (time-based), Morning Raga, Focus Mode, Workout, Party, Chill, Romantic, Wind Down. Each vibe targets specific genres, tempos and moods. Auto-mode detects time of day and picks the right vibe automatically.</p>
          </div>
        </div>

        <div class="ft-card ft-card-new">
          <div class="ft-card-icon">📈</div>
          <div class="ft-card-info">
            <h4>Skip Signal Learning <span class="ft-badge-new">NEW</span></h4>
            <p>Raagam learns from your skips. Skip a song before 30 seconds and that artist/genre gets down-ranked in future recommendations. The more you use it, the smarter it gets — all stored locally, no account needed.</p>
          </div>
        </div>

        <div class="ft-card ft-card-new">
          <div class="ft-card-icon">🕐</div>
          <div class="ft-card-info">
            <h4>Time-of-Day Music Context <span class="ft-badge-new">NEW</span></h4>
            <p>Autoplay recommendations are now context-aware. Morning? You'll get devotional and classical songs. Evening? Romantic and chill. Night? Slow and soothing. The right music at the right time, automatically.</p>
          </div>
        </div>

        <div class="ft-card ft-card-new">
          <div class="ft-card-icon">📅</div>
          <div class="ft-card-info">
            <h4>Daily Mixes <span class="ft-badge-new">NEW</span></h4>
            <p>5 fresh mixes generated every day on your home screen: Your Daily Mix (based on liked songs), a time-of-day mix, Discover Weekly (new songs you haven't heard), Chill Vibes, and Party Starter. One tap to play any mix.</p>
          </div>
        </div>

        <div class="ft-card ft-card-new">
          <div class="ft-card-icon">🔇</div>
          <div class="ft-card-info">
            <h4>Gapless Playback <span class="ft-badge-new">NEW</span></h4>
            <p>Enable in Settings. Raagam pre-buffers the next song 25 seconds before the current one ends — so there's zero gap between tracks. Seamless listening experience like a real streaming service.</p>
          </div>
        </div>

        <div class="ft-card ft-card-new">
          <div class="ft-card-icon">🔊</div>
          <div class="ft-card-info">
            <h4>Volume Normalization <span class="ft-badge-new">NEW</span></h4>
            <p>Enable in Settings. Uses Web Audio API's dynamics compressor to keep all songs at a consistent loudness level. No more sudden loud or quiet songs — everything plays at the right volume.</p>
          </div>
        </div>

        <div class="ft-footer">
          <button class="ft-start-btn" onclick="this.closest('.feature-tour-overlay').remove()">
            🎵 Start Listening
          </button>
          <p class="ft-footer-note">You can revisit this guide anytime from <strong>Settings → App Features</strong></p>
          <div id="app-version-display" style="margin-top: 15px; font-size: 11px; color: var(--text-dim); text-align: center; font-family: monospace;">Version: Loading...</div>
        </div>

      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Fetch and display version
  fetch('version.json?t=' + Date.now())
    .then(res => res.json())
    .then(data => {
      const versionEl = document.getElementById('app-version-display');
      if (versionEl) versionEl.textContent = `Version: ${data.version}`;
    })
    .catch(() => {
      const versionEl = document.getElementById('app-version-display');
      if (versionEl) versionEl.textContent = 'Version: Local/Dev';
    });

  // Mark as seen
  localStorage.setItem('raagam_feature_tour_seen', 'true');

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ===== DJ Guide / Help Overlay =====
function showDJGuideOverlay() {
  // Remove existing if any
  document.querySelector('.dj-guide-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'dj-guide-overlay';
  overlay.innerHTML = `
    <div class="dj-guide-panel">
      <div class="dj-guide-header">
        <h2>🎛️ DJ Mixer Guide</h2>
        <button class="dj-guide-close" onclick="this.closest('.dj-guide-overlay').remove()">✕</button>
      </div>
      <div class="dj-guide-body">

        <div class="dj-guide-section dj-guide-intro">
          <div class="dj-guide-icon">🎵</div>
          <h3>Welcome to Raagam DJ!</h3>
          <p>Mix songs like a real DJ. This guide explains every control. Tap any section to expand.</p>
        </div>

        <details class="dj-guide-item" open>
          <summary><span class="dj-guide-badge">1</span> Getting Started</summary>
          <div class="dj-guide-content">
            <ol>
              <li><strong>Load songs</strong> — Tap <kbd>Load</kbd> on any deck, search for a song, and tap it to load.</li>
              <li><strong>Auto-Fill</strong> — Tap <kbd>⚡ Auto-Fill</kbd> to load songs into all empty decks at once. Use the language picker next to it to choose which language.</li>
              <li><strong>Play</strong> — Tap <kbd>▶</kbd> on Deck 1, then Deck 2. Both songs play simultaneously — you're DJing!</li>
              <li><strong>Crossfader</strong> — Slide the bar at the bottom left/right to blend between Deck A and Deck B.</li>
            </ol>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">2</span> Transport Controls</summary>
          <div class="dj-guide-content">
            <div class="dj-guide-grid">
              <div class="dj-guide-ctrl"><kbd>▶</kbd><span>Play / Pause the deck</span></div>
              <div class="dj-guide-ctrl"><kbd>⏹</kbd><span>Stop — resets to beginning</span></div>
              <div class="dj-guide-ctrl"><kbd>CUE</kbd><span>Set a temporary cue point. While held, plays from cue; on release, jumps back.</span></div>
              <div class="dj-guide-ctrl"><kbd>Load</kbd><span>Opens search to load a new song</span></div>
              <div class="dj-guide-ctrl"><kbd>Eject</kbd><span>Removes the current song from the deck</span></div>
            </div>
            <p class="dj-guide-tip">💡 <strong>Tip:</strong> Tap the waveform to seek to any position in the song.</p>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">3</span> Equalizer (EQ)</summary>
          <div class="dj-guide-content">
            <p>Each deck has 3 frequency bands you can boost or cut (−12dB to +12dB):</p>
            <div class="dj-guide-grid">
              <div class="dj-guide-ctrl"><kbd>HI</kbd><span>Treble — cymbals, hi-hats, vocal clarity</span></div>
              <div class="dj-guide-ctrl"><kbd>MID</kbd><span>Midrange — vocals, guitars, melodies</span></div>
              <div class="dj-guide-ctrl"><kbd>LO</kbd><span>Bass — kick drums, bass lines, low-end power</span></div>
            </div>
            <p><strong>Knob mode:</strong> Drag up/down on the circular knob. Double-click to reset to 0.</p>
            <p><strong>Slider mode:</strong> Use vertical sliders. Toggle with the <kbd>🎛 Knobs / 🎚 Sliders</kbd> button in the top bar.</p>
            <p class="dj-guide-tip">💡 <strong>Classic DJ move:</strong> Cut the bass (LO = −12) on the incoming track, then swap bass between decks for a smooth transition.</p>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">4</span> Effects (FX)</summary>
          <div class="dj-guide-content">
            <div class="dj-guide-grid">
              <div class="dj-guide-ctrl"><kbd>ECHO</kbd><span>Delay effect — adds repeating echoes. Turn up for more trails (0-100%).</span></div>
              <div class="dj-guide-ctrl"><kbd>FILTER</kbd><span>Frequency sweep — 0% = deep underwater, 100% = full bright. Classic DJ filter effect.</span></div>
            </div>
            <p class="dj-guide-tip">💡 <strong>Tip:</strong> Slowly turn filter from 0→100 while bringing in a new track for dramatic builds.</p>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">5</span> Volume & Speed</summary>
          <div class="dj-guide-content">
            <div class="dj-guide-grid">
              <div class="dj-guide-ctrl"><kbd>VOLUME</kbd><span>Vertical fader — independent volume per deck (0-100%)</span></div>
              <div class="dj-guide-ctrl"><kbd>SPEED</kbd><span>Tempo control — 0.5x (half) to 2.0x (double). Use ± buttons for fine adjustment.</span></div>
              <div class="dj-guide-ctrl"><kbd>🔑 KEY</kbd><span>Key Lock — when ON, changing speed doesn't change pitch. Essential for beat-matching!</span></div>
            </div>
            <p class="dj-guide-tip">💡 <strong>Beat-matching:</strong> Match BPMs between decks using speed controls, then align beats using cue points.</p>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">6</span> Loop System</summary>
          <div class="dj-guide-content">
            <div class="dj-guide-grid">
              <div class="dj-guide-ctrl"><kbd>IN</kbd><span>Sets loop start at current playback position</span></div>
              <div class="dj-guide-ctrl"><kbd>OUT</kbd><span>Sets loop end — looping starts automatically</span></div>
              <div class="dj-guide-ctrl"><kbd>LOOP</kbd><span>Toggle looping on/off</span></div>
              <div class="dj-guide-ctrl"><kbd>1s 2s 4s 8s</kbd><span>Quick-set a loop of that duration from the current position</span></div>
            </div>
            <p class="dj-guide-tip">💡 <strong>Tip:</strong> Loop a buildup section while you prepare the next track, then release the loop at the perfect moment.</p>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">7</span> Hot Cue Pads</summary>
          <div class="dj-guide-content">
            <p>4 color-coded pads per deck: <span style="color:#ff4444">🔴</span> <span style="color:#ffbb33">🟡</span> <span style="color:#39ff14">🟢</span> <span style="color:#448aff">🔵</span></p>
            <div class="dj-guide-grid">
              <div class="dj-guide-ctrl"><kbd>Tap empty pad</kbd><span>Saves current position as a cue marker</span></div>
              <div class="dj-guide-ctrl"><kbd>Tap set pad</kbd><span>Instantly jumps to that saved position</span></div>
              <div class="dj-guide-ctrl"><kbd>Long press</kbd><span>Clears the cue point (hold 0.5s)</span></div>
            </div>
            <p class="dj-guide-tip">💡 <strong>Mark drops, vocals, or transitions</strong> so you can jump to them instantly during a live mix.</p>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">8</span> Crossfader</summary>
          <div class="dj-guide-content">
            <p>The horizontal slider at the bottom blends between two decks:</p>
            <div class="dj-guide-grid">
              <div class="dj-guide-ctrl"><kbd>Full Left (A)</kbd><span>Only Deck A is heard</span></div>
              <div class="dj-guide-ctrl"><kbd>Center</kbd><span>Both decks at equal volume (equal-power curve — no dip)</span></div>
              <div class="dj-guide-ctrl"><kbd>Full Right (B)</kbd><span>Only Deck B is heard</span></div>
            </div>
            <p>Use the <strong>A/B select dropdowns</strong> to assign which decks are on each side.</p>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">9</span> BPM & Automation</summary>
          <div class="dj-guide-content">
            <div class="dj-guide-grid">
              <div class="dj-guide-ctrl"><kbd>BPM</kbd><span>Beats Per Minute — automatically detected from audio analysis</span></div>
              <div class="dj-guide-ctrl"><kbd>🤖 AUTO</kbd><span>Auto-Mix — when enabled, auto-crossfades to the next deck 8 seconds before the current song ends</span></div>
              <div class="dj-guide-ctrl"><kbd>🔄 NEXT</kbd><span>Auto-Load Next — automatically searches & loads a new song when the current one ends, then plays it</span></div>
              <div class="dj-guide-ctrl"><kbd>🤖 Auto EQ</kbd><span>AI-driven EQ — analyzes frequencies in real-time and moves EQ knobs/sliders automatically for musical movement</span></div>
              <div class="dj-guide-ctrl"><kbd>🎧 Auto DJ</kbd><span>Full autopilot! Loads songs, transitions between decks, manages crossfader — completely hands-free mixing</span></div>
            </div>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">10</span> Top Bar Buttons</summary>
          <div class="dj-guide-content">
            <div class="dj-guide-grid">
              <div class="dj-guide-ctrl"><kbd>⚡ Auto-Fill</kbd><span>Loads random songs into all empty decks (uses selected language)</span></div>
              <div class="dj-guide-ctrl"><kbd>🌐 Language</kbd><span>Choose language for Auto-Fill songs (Hindi, Telugu, Tamil, etc.)</span></div>
              <div class="dj-guide-ctrl"><kbd>🎧 Auto DJ</kbd><span>Enables fully automated DJ mode</span></div>
              <div class="dj-guide-ctrl"><kbd>🎛/🎚 Layout</kbd><span>Toggle between rotary knobs and vertical sliders for EQ/FX</span></div>
              <div class="dj-guide-ctrl"><kbd>🤖 Auto EQ</kbd><span>Toggle AI-driven equalizer</span></div>
              <div class="dj-guide-ctrl"><kbd>MASTER</kbd><span>Controls overall output volume for all decks</span></div>
              <div class="dj-guide-ctrl"><kbd>+ Add Deck</kbd><span>Add more decks (up to 6 total)</span></div>
            </div>
          </div>
        </details>

        <details class="dj-guide-item">
          <summary><span class="dj-guide-badge">🎓</span> Pro Tips for Beginners</summary>
          <div class="dj-guide-content">
            <ol class="dj-guide-tips-list">
              <li><strong>Start simple</strong> — Load 2 songs, play both, and practice with just the crossfader.</li>
              <li><strong>Match energy</strong> — Pick songs with similar tempo (BPM) and energy level.</li>
              <li><strong>EQ swap technique</strong> — Cut bass on the incoming track, crossfade, then swap bass between decks.</li>
              <li><strong>Use loops</strong> — Loop a section to buy time while you prepare the next song.</li>
              <li><strong>Mark your drops</strong> — Set a hot cue at the drop/chorus so you can trigger it at the perfect moment.</li>
              <li><strong>Auto DJ is your friend</strong> — Enable it while learning; it handles all transitions for you.</li>
              <li><strong>Filter builds</strong> — Slowly sweep the filter from 0→100 to build energy before a drop.</li>
              <li><strong>Key Lock matters</strong> — Always enable it when adjusting speed, or the pitch will change weirdly.</li>
              <li><strong>Experiment freely</strong> — There's no wrong way to DJ. Have fun! 🎉</li>
            </ol>
          </div>
        </details>

      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function openDJMixer() {
  // Pause main player
  if (state.isPlaying) { audio.pause(); state.isPlaying = false; updatePlayerUI(); }

  state.djActive = true;

  // Show DJ view
  const view = $('#dj-mixer-view');
  if (view) view.classList.remove('hidden');
  const app = $('#app');
  if (app) app.style.display = 'none';

  // Init mixer audio graph
  djMixer.init();

  // Create 2 default decks
  djMixer.createDeck();
  djMixer.createDeck();

  // Resume context if needed
  if (djMixer.context && djMixer.context.state === 'suspended') djMixer.context.resume();
}

function closeDJMixer() {
  state.djActive = false;

  djMixer.destroy();

  const view = $('#dj-mixer-view');
  if (view) view.classList.add('hidden');
  const app = $('#app');
  if (app) app.style.display = '';
}

// ===== Smart Queue Suggestions =====
async function getSmartQueueSuggestions() {
  if (!state.smartQueueEnabled) return;
  if (state.queue.length === 0 || state.queueIndex < state.queue.length - 1) return;

  // Analyze listening patterns
  const recentHistory = state.history.slice(0, 50);
  if (recentHistory.length < 3) return;

  // Count artist frequency
  const artistCounts = {};
  const langCounts = {};
  const genreCounts = {};
  recentHistory.forEach(entry => {
    const artist = getArtistName(entry.track);
    const lang = detectLanguage(entry.track);
    const genre = detectGenre(entry.track);
    artistCounts[artist] = (artistCounts[artist] || 0) + 1;
    langCounts[lang] = (langCounts[lang] || 0) + 1;
    genreCounts[genre] = (genreCounts[genre] || 0) + 1;
  });

  // Top preferences
  const topArtist = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topLang = Object.entries(langCounts).filter(([k]) => k !== 'all').sort((a, b) => b[1] - a[1])[0]?.[0];
  const topGenre = Object.entries(genreCounts).filter(([k]) => k !== 'general').sort((a, b) => b[1] - a[1])[0]?.[0];

  // Build smart queries
  const queries = [];
  if (topArtist) queries.push(topArtist);
  if (topLang) {
    const langData = CONFIG.supportedLanguages[topLang];
    if (langData) queries.push(`${langData.keywords[0]} ${topGenre || ''} songs`);
  }
  if (topGenre) queries.push(`${topGenre} hits`);

  let allResults = [];
  for (const q of queries.slice(0, 2)) {
    const results = await apiSearch(q, 10);
    allResults = allResults.concat(results);
  }

  // Deduplicate and remove already played
  const playedIds = new Set([...state.queue.map(t => t.id), ...state.playedTracks.map(t => t.id)]);
  const seen = new Set();
  const suggestions = allResults.filter(t => {
    if (playedIds.has(t.id) || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  }).slice(0, 5);

  if (suggestions.length > 0) {
    state.queue = [...state.queue, ...suggestions];
    renderQueue();
    showToast(`Smart Queue: Added ${suggestions.length} suggestions`);
    analytics.trackEvent('smart_queue', { count: suggestions.length });
  }
}

// ===== Navigation =====
function switchView(view) {
  // DJ mode is handled separately
  if (view === 'dj') {
    openDJMixer();
    return;
  }

  analytics.trackEvent('view_change', {
    fromView: state.currentView,
    toView: view
  });

  state.currentView = view;
  $$('.view').forEach(v => v.classList.remove('active'));
  const viewEl = $(`#view-${view}`);
  if (viewEl) viewEl.classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

  // Update header
  if (view === 'home') {
    updateGreeting();
    $('#header').style.display = '';
  } else if (view === 'search') {
    $('#header').style.display = 'none';
    setTimeout(() => $('#search-input').focus(), 100);
  } else if (view === 'library') {
    $('#header').style.display = 'none';
  }

  // Scroll to top
  $('#main-content').scrollTop = 0;
}

// ===== Theme System =====
function applyTheme(themeName, saveToStorage = true) {
  const html = document.documentElement;
  html.setAttribute('data-theme', themeName);
  state.currentTheme = themeName;

  // Handle backdrop visibility
  const backdrop = $('#theme-backdrop');
  if (backdrop) {
    if (themeName === 'custom-backdrop' && state.backdropImage) {
      backdrop.style.backgroundImage = `url(${state.backdropImage})`;
      backdrop.classList.add('active');
    } else {
      backdrop.classList.remove('active');
      backdrop.style.backgroundImage = '';
    }
  }

  // Update meta theme-color for mobile browser chrome
  const themeColors = {
    midnight: '#121212', abyss: '#0a0e1a', sunset: '#1a0a1e',
    forest: '#0a1a0f', rose: '#1a0a14', ocean: '#042f2e',
    snow: '#f8fafc', aurora: '#0c0c1d', 'custom-backdrop': '#121212'
  };
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = themeColors[themeName] || '#121212';

  if (saveToStorage) {
    localStorage.setItem('raagam_theme', themeName);
  }

  // Update theme picker active state
  $$('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === themeName));

  // Show/hide backdrop upload area
  const uploadArea = $('#backdrop-upload');
  if (uploadArea) {
    uploadArea.classList.toggle('active', themeName === 'custom-backdrop');
  }

  console.log(`Theme applied: ${themeName}`);
}

function setupThemePicker() {
  const picker = $('#theme-picker');
  if (!picker) return;

  picker.addEventListener('click', (e) => {
    const swatch = e.target.closest('.theme-swatch');
    if (!swatch) return;
    const theme = swatch.dataset.theme;
    applyTheme(theme);
    showToast(`Theme: ${swatch.querySelector('.theme-swatch-name').textContent}`);
  });

  // Custom backdrop image upload
  const uploadArea = $('#backdrop-upload');
  const fileInput = $('#backdrop-file');
  const preview = $('#backdrop-preview');
  const removeBtn = $('#backdrop-remove');

  if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', (e) => {
      if (e.target === removeBtn || e.target.closest('.backdrop-remove-btn')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        showToast('Image too large. Max 10MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        // Compress to reasonable size for localStorage
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = (h / w) * maxDim; w = maxDim; }
            else { w = (w / h) * maxDim; h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);

          state.backdropImage = compressed;
          localStorage.setItem('raagam_backdrop', compressed);

          // Update preview
          if (preview) {
            preview.src = compressed;
            preview.classList.add('active');
          }
          if (removeBtn) removeBtn.classList.add('active');

          // Apply immediately
          if (state.currentTheme === 'custom-backdrop') {
            applyTheme('custom-backdrop', false);
          }
          showToast('Backdrop image set!');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.backdropImage = null;
      localStorage.removeItem('raagam_backdrop');
      if (preview) {
        preview.src = '';
        preview.classList.remove('active');
      }
      removeBtn.classList.remove('active');
      const backdrop = $('#theme-backdrop');
      if (backdrop) {
        backdrop.classList.remove('active');
        backdrop.style.backgroundImage = '';
      }
      showToast('Backdrop removed');
    });
  }

  // Restore backdrop preview if exists
  if (state.backdropImage && preview) {
    preview.src = state.backdropImage;
    preview.classList.add('active');
    if (removeBtn) removeBtn.classList.add('active');
  }
}

// ===== Settings =====
function openSettings() {
  $('#settings-panel').classList.remove('hidden');
  $('#audio-quality').value = CONFIG.quality;
  $('#api-server').value = CONFIG.apiBase;
  const prefLang = $('#preferred-language');
  if (prefLang) prefLang.value = CONFIG.preferredLanguage || 'all';
  const settingsLang = $('#settings-language');
  if (settingsLang) settingsLang.value = CONFIG.preferredLanguage || 'hindi';
  updateHealthStatusUI();
  updateSleepTimerUI();
  // (cloud sync UI removed — profile backup is automatic)
  // Update EQ and Speed labels in settings
  const settingsEq = $('#settings-eq');
  if (settingsEq) settingsEq.textContent = state.eqPreset === 'off' ? 'Off' : state.eqPreset.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const settingsSpeed = $('#settings-speed');
  if (settingsSpeed) settingsSpeed.textContent = state.playbackSpeed === 1 ? '1x' : `${state.playbackSpeed}x`;
  const settingsCrossfade = $('#settings-crossfade');
  if (settingsCrossfade) settingsCrossfade.textContent = state.crossfadeDuration === 0 ? 'Off' : `${state.crossfadeDuration}s`;
  const smartQueueToggle = $('#smart-queue-toggle');
  if (smartQueueToggle) smartQueueToggle.checked = state.smartQueueEnabled;
  updateAlarmUI();

  // Update theme picker active state
  $$('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === state.currentTheme));
  const uploadArea = $('#backdrop-upload');
  if (uploadArea) uploadArea.classList.toggle('active', state.currentTheme === 'custom-backdrop');
}

function updateHealthStatusUI() {
  const container = $('#api-health-status');
  if (!container) return;
  const lines = CONFIG.apiMirrors.map(url => {
    const m = apiHealth.mirrors[url] || {};
    const avg = m.latency?.length
      ? Math.round(m.latency.reduce((s, v) => s + v, 0) / m.latency.length)
      : '—';
    const short = url.split('/')[2];
    const stateIcon = m.state === 'closed' ? '🟢' : m.state === 'half-open' ? '🟡' : '🔴';
    const active = url === CONFIG.apiBase ? ' ◀ active' : '';
    return `${stateIcon} ${short}\n   ${avg}ms avg · ${m.successCount || 0} ok · ${m.failures || 0} fail${active}`;
  });
  container.textContent = lines.join('\n');
}

function closeSettings() {
  $('#settings-panel').classList.add('hidden');
}

// ===== Event Listeners =====
function setupEvents() {
  // Navigation
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Mini player
  $('#mini-player-tap').addEventListener('click', (e) => {
    if (e.target.closest('.mini-controls')) return;
    openNowPlaying();
  });
  $('#mini-play').addEventListener('click', togglePlay);
  $('#mini-like').addEventListener('click', () => {
    if (state.currentTrack) toggleLike(state.currentTrack);
  });

  // Now Playing controls
  $('#np-close').addEventListener('click', closeNowPlaying);
  $('#np-play').addEventListener('click', togglePlay);
  $('#np-next').addEventListener('click', playNext);
  $('#np-prev').addEventListener('click', playPrev);
  $('#np-like').addEventListener('click', () => {
    if (state.currentTrack) toggleLike(state.currentTrack);
  });
  $('#np-shuffle').addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    updatePlayerUI();
    showToast(state.shuffle ? 'Shuffle On' : 'Shuffle Off');
  });
  $('#np-repeat').addEventListener('click', () => {
    if (state.repeat === 'off') state.repeat = 'all';
    else if (state.repeat === 'all') state.repeat = 'one';
    else state.repeat = 'off';
    updatePlayerUI();
    const labels = { off: 'Repeat Off', all: 'Repeat All', one: 'Repeat One' };
    showToast(labels[state.repeat]);
  });
  $('#np-autoplay').addEventListener('click', () => {
    state.autoPlayMode = !state.autoPlayMode;
    localStorage.setItem('raagam_autoPlay', state.autoPlayMode);
    updatePlayerUI();
    showToast(state.autoPlayMode ? 'Auto-play On' : 'Auto-play Off');
  });

  // Seek
  const seek = $('#np-seek');
  seek.addEventListener('mousedown', () => seek._dragging = true);
  seek.addEventListener('touchstart', () => seek._dragging = true, { passive: true });
  seek.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime = (seek.value / 100) * audio.duration;
    }
  });
  seek.addEventListener('mouseup', () => seek._dragging = false);
  seek.addEventListener('touchend', () => seek._dragging = false);
  seek.addEventListener('change', () => seek._dragging = false);

  // Allow CORS so Web Audio API can read the stream (same as DJ deck elements)
  audio.crossOrigin = 'anonymous';

  // Audio events
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('ended', playNext);
  audio.addEventListener('play', () => { state.isPlaying = true; updatePlayerUI(); });
  audio.addEventListener('pause', () => { state.isPlaying = false; updatePlayerUI(); });
  audio.addEventListener('error', (e) => {
    const err = audio.error;
    const MESSAGES = {
      1: 'Playback aborted',
      2: 'Network error — check your connection',
      3: 'Track could not be decoded',
      4: 'Track not supported or unavailable',
    };
    const msg = (err && MESSAGES[err.code]) || 'Could not play track';
    console.warn('[audio error]', err?.code, err?.message);
    if (state.currentTrack) {
      showToast(`${msg} — trying next`);
      state.isPlaying = false;
      updatePlayerUI();
      // Auto-advance to next track after a short delay
      setTimeout(() => { if (!state.isPlaying) playNext(); }, 1200);
    }
  });

  // Queue
  $('#np-queue-btn').addEventListener('click', openQueue);
  $('#queue-close').addEventListener('click', closeQueue);
  $('#queue-clear').addEventListener('click', () => {
    const current = state.queue[state.queueIndex];
    state.queue = current ? [current] : [];
    state.queueIndex = current ? 0 : -1;
    renderQueue();
    showToast('Queue cleared');
  });

  // Settings
  $('#btn-notification').addEventListener('click', openSettings);
  $('#settings-close').addEventListener('click', closeSettings);
  $('#audio-quality').addEventListener('change', (e) => {
    CONFIG.quality = parseInt(e.target.value);
    localStorage.setItem('raagam_quality', CONFIG.quality);
    showToast('Audio quality updated');
  });
  $('#api-server').addEventListener('change', (e) => {
    CONFIG.apiBase = e.target.value;
    localStorage.setItem('raagam_api', CONFIG.apiBase);
    state.homeLoaded = false;
    state.searchCache = {};
    showToast('API server changed. Reloading...');
    setTimeout(() => loadHome(), 500);
  });
  $('#preferred-language').addEventListener('change', (e) => {
    CONFIG.preferredLanguage = e.target.value;
    localStorage.setItem('raagam_language', CONFIG.preferredLanguage);
    showToast(`Preferred language: ${CONFIG.supportedLanguages[e.target.value].name}`);
  });

  // Settings: Language preference change — reload home with new language
  const settingsLangEl = $('#settings-language');
  if (settingsLangEl) {
    settingsLangEl.addEventListener('change', (e) => {
      const newLang = e.target.value;
      CONFIG.preferredLanguage = newLang;
      localStorage.setItem('raagam_language', newLang);
      state.homeLoaded = false; // Force home reload
      showToast(`Language changed to ${CONFIG.supportedLanguages[newLang]?.name || newLang}. Refreshing home...`);
      // Also update the old language select if it exists
      const prefLang = $('#preferred-language');
      if (prefLang) prefLang.value = newLang;
      setTimeout(() => loadHome(), 300);
    });
  }

  // Health check button
  const healthBtn = $('#health-check-btn');
  if (healthBtn) {
    healthBtn.addEventListener('click', async () => {
      healthBtn.textContent = 'Checking...';
      healthBtn.disabled = true;
      await apiHealth.healthCheckAll();
      updateHealthStatusUI();
      healthBtn.textContent = 'Check Now';
      healthBtn.disabled = false;
      showToast('Health check complete');
    });
  }

  // ===== New Feature Event Listeners =====

  // Lyrics
  $('#np-lyrics-btn').addEventListener('click', toggleLyrics);
  $('#np-lyrics-close').addEventListener('click', hideLyrics);

  // Share
  $('#np-share-btn').addEventListener('click', shareSong);

  // Sleep Timer
  $('#np-sleep-btn').addEventListener('click', openSleepTimerDialog);
  $('#sleep-timer-cancel').addEventListener('click', closeSleepTimerDialog);
  $('#sleep-timer-off').addEventListener('click', () => {
    clearSleepTimer();
    closeSleepTimerDialog();
    showToast('Sleep timer turned off');
  });
  $$('.sleep-option').forEach(btn => {
    btn.addEventListener('click', () => setSleepTimer(parseInt(btn.dataset.minutes)));
  });

  // Equalizer
  $('#np-eq-btn').addEventListener('click', openEqDialog);
  $('#eq-close').addEventListener('click', closeEqDialog);
  $$('.eq-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      equalizer.applyPreset(btn.dataset.preset);
      showToast(`EQ: ${btn.dataset.preset === 'off' ? 'Off' : btn.textContent}`);
      analytics.trackEvent('eq_preset', { preset: btn.dataset.preset });
    });
  });
  // EQ sliders
  ['bass', 'mid', 'treble'].forEach(band => {
    const slider = $(`#eq-${band}`);
    if (slider) {
      slider.addEventListener('input', () => {
        const val = parseInt(slider.value);
        equalizer.setGain(band, val);
        $(`#eq-${band}-val`).textContent = `${val} dB`;
      });
    }
  });

  // Playback Speed
  $('#np-speed-btn').addEventListener('click', openSpeedDialog);
  $('#speed-close').addEventListener('click', closeSpeedDialog);
  $$('.speed-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setPlaybackSpeed(parseFloat(btn.dataset.speed));
      closeSpeedDialog();
    });
  });

  // Settings panel shortcuts for new features
  const settingsSleep = $('#settings-sleep-timer');
  if (settingsSleep) settingsSleep.addEventListener('click', () => { closeSettings(); openSleepTimerDialog(); });
  const settingsEqBtn = $('#settings-eq');
  if (settingsEqBtn) settingsEqBtn.addEventListener('click', () => { closeSettings(); openEqDialog(); });
  const settingsSpeedBtn = $('#settings-speed');
  if (settingsSpeedBtn) settingsSpeedBtn.addEventListener('click', () => { closeSettings(); openSpeedDialog(); });

  // Alarm Clock
  const settingsAlarmBtn = $('#settings-alarm');
  if (settingsAlarmBtn) settingsAlarmBtn.addEventListener('click', () => { closeSettings(); openAlarmDialog(); });
  const alarmSetBtn = $('#alarm-set-btn');
  if (alarmSetBtn) alarmSetBtn.addEventListener('click', setAlarm);
  const alarmCancelBtn = $('#alarm-cancel-btn');
  if (alarmCancelBtn) alarmCancelBtn.addEventListener('click', () => { closeAlarmDialog(); });
  const alarmCancelQuick = $('#alarm-cancel-quick');
  if (alarmCancelQuick) alarmCancelQuick.addEventListener('click', cancelAlarm);

  // Theme Scheduler
  const themeSchedulerBtn = $('#theme-scheduler-btn');
  if (themeSchedulerBtn) themeSchedulerBtn.addEventListener('click', () => { closeSettings(); openThemeSchedulerDialog(); });

  // Parental Controls
  const parentalControlsBtn = $('#parental-controls-btn');
  if (parentalControlsBtn) parentalControlsBtn.addEventListener('click', () => { closeSettings(); openParentalControlsDialog(); });

  // User Profile
  const userProfileBtn = $('#user-profile-btn');
  if (userProfileBtn) userProfileBtn.addEventListener('click', () => { closeSettings(); openUserProfileDialog(); });

  // Alarm song search with debounce
  const alarmSearchInput = $('#alarm-song-search');
  if (alarmSearchInput) {
    alarmSearchInput.addEventListener('input', (e) => {
      if (alarmSearchTimeout) clearTimeout(alarmSearchTimeout);
      alarmSearchTimeout = setTimeout(() => searchAlarmSongs(e.target.value.trim()), 400);
    });
  }

  // Alarm clear selected song
  const alarmClearSong = $('#alarm-clear-song');
  if (alarmClearSong) alarmClearSong.addEventListener('click', () => {
    state.alarmSelectedSong = null;
    updateAlarmSongDisplay();
  });

  // Alarm quick time buttons
  $$('.alarm-quick-time').forEach(btn => {
    btn.addEventListener('click', () => {
      const addMin = parseInt(btn.dataset.offset);
      const now = new Date();
      const target = new Date(now.getTime() + addMin * 60000);
      const hh = target.getHours().toString().padStart(2, '0');
      const mm = target.getMinutes().toString().padStart(2, '0');
      $('#alarm-time-input').value = `${hh}:${mm}`;
    });
  });

  // ===== New Feature Listeners =====

  // Song Radio button in Now Playing
  const npRadioBtn = $('#np-radio-btn');
  if (npRadioBtn) npRadioBtn.addEventListener('click', () => startSongRadio(state.currentTrack));

  // Add to Playlist button in Now Playing
  const npAddPlaylistBtn = $('#np-add-playlist-btn');
  if (npAddPlaylistBtn) npAddPlaylistBtn.addEventListener('click', () => {
    if (state.currentTrack) showAddToPlaylistMenu(state.currentTrack);
  });

  // Create Playlist dialog
  const createPlSave = $('#create-playlist-save');
  if (createPlSave) createPlSave.addEventListener('click', () => {
    const name = $('#new-playlist-name').value.trim();
    if (name) { createPlaylist(name); closeCreatePlaylistDialog(); }
    else showToast('Enter a playlist name');
  });
  const createPlCancel = $('#create-playlist-cancel');
  if (createPlCancel) createPlCancel.addEventListener('click', closeCreatePlaylistDialog);

  // Add to Playlist dialog close
  const addPlClose = $('#add-to-playlist-close');
  if (addPlClose) addPlClose.addEventListener('click', () => $('#add-to-playlist-dialog').classList.add('hidden'));

  // Mood cards on home
  $$('.mood-card').forEach((card, idx) => {
    card.addEventListener('click', () => browseMood(idx));
  });

  // Crossfade options
  $$('.crossfade-option').forEach(btn => {
    btn.addEventListener('click', () => setCrossfade(parseInt(btn.dataset.seconds)));
  });
  const crossfadeSettingsBtn = $('#settings-crossfade');
  if (crossfadeSettingsBtn) crossfadeSettingsBtn.addEventListener('click', () => {
    closeSettings();
    $('#crossfade-dialog').classList.remove('hidden');
    $$('.crossfade-option').forEach(b => b.classList.toggle('active', parseInt(b.dataset.seconds) === state.crossfadeDuration));
  });
  const crossfadeClose = $('#crossfade-close');
  if (crossfadeClose) crossfadeClose.addEventListener('click', () => $('#crossfade-dialog').classList.add('hidden'));

  // Visualizer toggle
  const npVisualizerBtn = $('#np-visualizer-btn');
  if (npVisualizerBtn) npVisualizerBtn.addEventListener('click', toggleVisualizer);

  // Auto DJ — unified handler for all buttons (mini player + now playing)
  $$('.auto-dj-btn').forEach(btn => btn.addEventListener('click', toggleSmartDJ));
  // Mini player Auto DJ button specifically wired (for buttons added later)
  const miniAutoDJ = $('#mini-autodj');
  if (miniAutoDJ) miniAutoDJ.addEventListener('click', (e) => { e.stopPropagation(); toggleSmartDJ(); });
  updateSmartDJUI();

  // P4: Gapless Playback toggle
  setupGaplessListener();
  const gaplessBtn = $('#settings-gapless');
  if (gaplessBtn) {
    gaplessBtn.textContent = state.gaplessEnabled ? 'On' : 'Off';
    gaplessBtn.addEventListener('click', toggleGapless);
  }

  // P5: Volume Normalization toggle
  const volNormBtn = $('#settings-volnorm');
  if (volNormBtn) {
    volNormBtn.textContent = state.volumeNormEnabled ? 'On' : 'Off';
    volNormBtn.addEventListener('click', toggleVolumeNorm);
  }

  // Smart Queue toggle in settings
  const smartQueueToggle = $('#smart-queue-toggle');
  if (smartQueueToggle) {
    smartQueueToggle.checked = state.smartQueueEnabled;
    smartQueueToggle.addEventListener('change', () => {
      state.smartQueueEnabled = smartQueueToggle.checked;
      localStorage.setItem('raagam_smartQueue', state.smartQueueEnabled);
      showToast(state.smartQueueEnabled ? 'Smart Queue enabled' : 'Smart Queue disabled');
    });
  }

  // Offline mode toggle
  const offlineBtn = $('#settings-offline-btn');
  if (offlineBtn) offlineBtn.addEventListener('click', toggleOfflineMode);

  // Queue drag & drop
  setupQueueDrag();

  // Crossfade audio listener
  setupCrossfadeListener();

  // Media Session API
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', togglePlay);
    navigator.mediaSession.setActionHandler('pause', togglePlay);
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }

  // Update media session metadata when track changes
  audio.addEventListener('loadeddata', () => {
    if (!state.currentTrack || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: getTrackName(state.currentTrack),
      artist: getArtistName(state.currentTrack),
      album: getAlbumName(state.currentTrack),
      artwork: (state.currentTrack.image || []).map(img => ({
        src: img.url || img.link,
        sizes: img.quality || '300x300',
        type: 'image/jpeg',
      })),
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (state.djActive) {
      if (e.code === 'Escape') { closeDJMixer(); return; }
      return; // Don't trigger main player shortcuts in DJ mode
    }
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') playNext();
    if (e.code === 'ArrowLeft') playPrev();
    if (e.code === 'KeyL') toggleLyrics();
    if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) shareSong();
    if (e.code === 'KeyD') openDJMixer();
  });

  // ===== DJ Mixer Event Listeners =====
  // DJ Nav button (bottom nav)
  const navDJ = $('#nav-dj');
  if (navDJ) navDJ.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openDJMixer();
  });

  // DJ Exit
  const djExit = $('#dj-exit');
  if (djExit) djExit.addEventListener('click', closeDJMixer);

  // DJ Master Volume
  const djMasterVol = $('#dj-master-vol');
  if (djMasterVol) djMasterVol.addEventListener('input', (e) => {
    const v = parseInt(e.target.value) / 100;
    djMixer.setMasterVolume(v);
    const val = $('#dj-master-val');
    if (val) val.textContent = `${e.target.value}%`;
  });

  // DJ Add Deck
  const djAddDeck = $('#dj-add-deck');
  if (djAddDeck) djAddDeck.addEventListener('click', () => djMixer.createDeck());

  // DJ Auto-Fill
  const djAutoFill = $('#dj-autofill');
  if (djAutoFill) djAutoFill.addEventListener('click', () => djMixer.autoFillDecks());

  // DJ Auto-Fill Language selector
  const djAutoFillLang = $('#dj-autofill-lang');
  if (djAutoFillLang) {
    djAutoFillLang.value = state.djAutoFillLang || 'all';
    djAutoFillLang.addEventListener('change', (e) => {
      state.djAutoFillLang = e.target.value;
      localStorage.setItem('raagam_djAutoFillLang', e.target.value);
      const name = CONFIG.supportedLanguages[e.target.value]?.name || 'All';
      showToast(`Auto-Fill language: ${name}`);
    });
  }

  // DJ Auto DJ toggle
  const djAutoDJToggle = $('#dj-autodj-toggle');
  if (djAutoDJToggle) djAutoDJToggle.addEventListener('click', () => djMixer.toggleAutoDJ());

  // ── DJ Session Setup Modal ──────────────────────────────────────────────────
  // Close buttons
  $('#dj-session-close')?.addEventListener('click', () => djMixer.closeDJSessionDialog());
  $('#dj-session-backdrop')?.addEventListener('click', () => djMixer.closeDJSessionDialog());

  // Language selection (single-select)
  $('#dj-session-langs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lang]');
    if (!btn) return;
    $$('#dj-session-langs [data-lang]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Refresh arc preview with current vibe + updated lang context
    const vibe = $('#dj-session-vibes [data-vibe].active')?.dataset.vibe || 'auto';
    const count = parseInt($('#dj-session-durations [data-duration].active')?.dataset.duration || '20');
    djMixer._renderSessionArcPreview(vibe, count);
  });

  // Vibe selection (single-select) — updates arc preview live
  $('#dj-session-vibes')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vibe]');
    if (!btn) return;
    $$('#dj-session-vibes [data-vibe]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const count = parseInt($('#dj-session-durations [data-duration].active')?.dataset.duration || '20');
    djMixer._renderSessionArcPreview(btn.dataset.vibe, count);
  });

  // Duration selection (single-select) — updates arc preview
  $('#dj-session-durations')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-duration]');
    if (!btn) return;
    $$('#dj-session-durations [data-duration]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const vibe = $('#dj-session-vibes [data-vibe].active')?.dataset.vibe || 'auto';
    djMixer._renderSessionArcPreview(vibe, parseInt(btn.dataset.duration));
  });

  // Start Session button
  $('#dj-session-start')?.addEventListener('click', () => {
    const lang = $('#dj-session-langs [data-lang].active')?.dataset.lang || CONFIG.preferredLanguage || 'hindi';
    const vibe = $('#dj-session-vibes [data-vibe].active')?.dataset.vibe || 'auto';
    const songCount = parseInt($('#dj-session-durations [data-duration].active')?.dataset.duration || '20');
    djMixer.startDJSession({ lang, vibe, songCount });
  });

  // Arc strip refresh button
  $('#dj-arc-refresh')?.addEventListener('click', async () => {
    if (!state.djSession) return;
    state.djSession.poolFetchedAt = 0; // force refresh
    showToast('Refreshing DJ pool with fresh trending songs...');
    await djMixer.refreshDJPool();
  });

  // DJ Help / Guide button
  const djHelpBtn = $('#dj-help-btn');
  if (djHelpBtn) djHelpBtn.addEventListener('click', () => showDJGuideOverlay());

  // DJ Layout Toggle
  const djLayoutToggle = $('#dj-layout-toggle');
  if (djLayoutToggle) djLayoutToggle.addEventListener('click', () => {
    const newMode = state.djLayoutMode === 'knobs' ? 'sliders' : 'knobs';
    djMixer.switchDJLayout(newMode);
  });

  // DJ Auto EQ Toggle
  const djAutoEQToggle = $('#dj-autoeq-toggle');
  if (djAutoEQToggle) djAutoEQToggle.addEventListener('click', () => djMixer.toggleGlobalAutoEQ());

  // DJ Crossfader
  const djCrossfader = $('#dj-crossfader');
  if (djCrossfader) djCrossfader.addEventListener('input', (e) => {
    djMixer.applyCrossfader(parseInt(e.target.value));
  });

  // DJ Crossfader assign selects
  const djCfA = $('#dj-cf-a');
  const djCfB = $('#dj-cf-b');
  if (djCfA) djCfA.addEventListener('change', (e) => {
    state.djCrossfaderAssign.a = parseInt(e.target.value);
    djMixer.rerouteAllDecks();
  });
  if (djCfB) djCfB.addEventListener('change', (e) => {
    state.djCrossfaderAssign.b = parseInt(e.target.value);
    djMixer.rerouteAllDecks();
  });

  // DJ Search modal
  const djSearchClose = $('#dj-search-close');
  if (djSearchClose) djSearchClose.addEventListener('click', () => djMixer.closeSearch());
  const djSearchInput = $('#dj-search-input');
  if (djSearchInput) {
    djSearchInput.addEventListener('input', () => {
      clearTimeout(djMixer._searchDebounce);
      djMixer._searchDebounce = setTimeout(() => djMixer.doSearch(djSearchInput.value.trim()), 400);
    });
    djSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(djMixer._searchDebounce);
        djMixer.doSearch(djSearchInput.value.trim());
      }
    });
  }

  // Swipe down to close now playing
  let touchStartY = 0;
  const np = $('#now-playing');
  np.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  np.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].clientY - touchStartY;
    if (diff > 100) closeNowPlaying();
  });
}

// ===== Language Setup =====
function showLanguageDialog() {
  const dialog = $('#language-dialog');
  dialog.classList.remove('hidden');

  // Add event listeners to language options
  const languageOptions = $$('.language-option');
  languageOptions.forEach(option => {
    option.addEventListener('click', () => {
      const selectedLang = option.dataset.lang;
      CONFIG.preferredLanguage = selectedLang;
      localStorage.setItem('raagam_language', selectedLang);
      localStorage.setItem('raagam_language_setup', 'true');
      state.languageSetupComplete = true;

      dialog.classList.add('hidden');

      // Now initialize the app
      setTimeout(() => {
        $('#app').classList.remove('hidden');
        $('#splash').addEventListener('animationend', () => $('#splash').remove());
      }, 100);

      setupEvents();
      setupSearch();
      setupLibrary();
      loadHome();

      showToast(`Language set to ${CONFIG.supportedLanguages[selectedLang].name}`);
    });
  });
}

function showProfileDialog() {
  // Redirect to the unified auth + profile dialog
  const authDialog = $('#auth-dialog');
  if (authDialog) {
    authDialog.classList.remove('hidden');
    return;
  }

  // Fallback if auth-dialog is absent — auto-create a guest profile
  CONFIG.userProfile = { name: 'Music Lover', phone: '' };
  localStorage.setItem('raagam_profile', JSON.stringify(CONFIG.userProfile));
  state.userProfile = CONFIG.userProfile;
  init();
}

function updateLanguageSetting() {
  const langSelect = $('#preferred-language');
  if (langSelect) {
    langSelect.value = CONFIG.preferredLanguage || 'all';
  }
}

function updateGreeting() {
  const headerTitle = $('.header-title');
  const now = new Date();
  const hour = now.getHours();
  let greeting = 'Good evening';

  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  if (CONFIG.userProfile && CONFIG.userProfile.name) {
    headerTitle.textContent = `${greeting}, ${CONFIG.userProfile.name}!`;
  } else {
    headerTitle.textContent = greeting;
  }
}

let appInitialized = false;

function init() {
  console.log('init() called');

  try {
    // Check if profile is set up
    if (!state.userProfile) {
      console.log('Profile not set up, showing profile dialog');
      showProfileDialog();
      return;
    }

    // Check if language setup is needed
    if (!state.languageSetupComplete) {
      // Default to hindi if no language was set (e.g. old users upgrading)
      if (!CONFIG.preferredLanguage) {
        CONFIG.preferredLanguage = 'hindi';
        localStorage.setItem('raagam_language', 'hindi');
      }
      localStorage.setItem('raagam_language_setup', 'true');
      state.languageSetupComplete = true;
    }

    // Show app and remove splash
    const splashEl = $('#splash');
    const appEl = $('#app');
    if (appEl) appEl.classList.remove('hidden');
    if (splashEl) {
      splashEl.style.opacity = '0';
      splashEl.style.transition = 'opacity 0.4s ease';
      setTimeout(() => splashEl.remove(), 500);
    }
    updateGreeting();

    // Only set up events once
    if (!appInitialized) {
      appInitialized = true;
      try {
        setupEvents();
        setupSearch();
        setupLibrary();
      } catch (err) {
        console.error('Error setting up core events:', err);
      }

      // Restore saved playback speed
      try {
        if (state.playbackSpeed !== 1) {
          audio.playbackRate = state.playbackSpeed;
          const speedLabel = $('#speed-label');
          if (speedLabel) speedLabel.textContent = `${state.playbackSpeed}x`;
        }
      } catch (e) { console.warn('Speed restore failed', e); }

      // Restore alarm if active
      try { initAlarmOnLoad(); } catch (e) { console.warn('Alarm restore failed', e); }

      // Restore theme
      try {
        applyTheme(state.currentTheme, false);
        setupThemePicker();
      } catch (e) { console.warn('Theme restore failed', e); }

      // Show feature tour for first-time users (after a short delay so UI loads)
      if (!localStorage.getItem('raagam_feature_tour_seen')) {
        setTimeout(() => showFeatureTour(), 1200);
      }

      // Settings: Features button
      const featuresBtn = $('#settings-features-btn');
      if (featuresBtn) featuresBtn.addEventListener('click', () => showFeatureTour());

      // Settings: Sign Out button (Firebase)
      const signOutBtn = $('#settings-signout-btn');
      if (signOutBtn) signOutBtn.addEventListener('click', () => {
        if (window.signOutFirebase) window.signOutFirebase();
      });

      // Settings: Reset (Erase Data) button (Firebase)
      const resetProfileBtn = $('#settings-reset-profile-btn');
      if (resetProfileBtn) resetProfileBtn.addEventListener('click', () => {
        if (confirm('This will permanently erase your history, liked songs, and playlists from the cloud. Continue?')) {
          if (window.resetCloudProfile) window.resetCloudProfile();
        }
      });
    }
    loadHome();
  } catch (criticalError) {
    console.error('CRITICAL INIT ERROR:', criticalError);
    // Last ditch effort to show UI
    const appEl = $('#app');
    if (appEl) appEl.classList.remove('hidden');
    const splashEl = $('#splash');
    if (splashEl) splashEl.remove();
    showToast('App recovered from error. Please clear data if issues persist.');
  }
}

// ===== USER PROFILES =====

// User profile functionality
function initUserProfiles() {
  // Load saved user profile (support legacy keys)
  const savedPrimary = localStorage.getItem('raagam_profile');
  const savedAlt = localStorage.getItem('raagam_user_profile');
  let parsed = null;
  if (savedPrimary) {
    try { parsed = JSON.parse(savedPrimary); } catch (e) { parsed = null; }
  }
  if (!parsed && savedAlt) {
    try { parsed = JSON.parse(savedAlt); } catch (e) { parsed = null; }
  }

  // Robust merge: ensure all required fields exist even if loaded profile is partial
  const defaults = createDefaultProfile();

  if (parsed) {
    // Deep merge stats and preferences to prevent crashes on missing keys
    state.userProfile = {
      ...defaults,
      ...parsed,
      stats: { ...defaults.stats, ...(parsed.stats || {}) },
      preferences: { ...defaults.preferences, ...(parsed.preferences || {}) }
    };
  } else {
    state.userProfile = null; // No profile: trigger onboarding dialog
  }

  // Update profile stats periodically
  updateProfileStats();
  setInterval(updateProfileStats, 60000); // Update every minute
}

function createDefaultProfile() {
  return {
    name: 'Music Lover',
    avatar: null,
    stats: {
      totalSongsPlayed: 0,
      totalPlayTime: 0, // in seconds
      favoriteGenres: [],
      favoriteArtists: [],
      playlistsCreated: 0,
      lastActive: new Date().toISOString()
    },
    preferences: {
      defaultVolume: 70,
      crossfadeEnabled: true,
      eqPreset: 'flat',
      theme: 'midnight',
      language: 'all'
    },
    achievements: []
  };
}

function updateProfileStats() {
  if (!state.userProfile) return;
  // Guard against missing stats object
  if (!state.userProfile.stats) {
    state.userProfile.stats = createDefaultProfile().stats;
  }

  // Update play time
  if (state.currentSong && state.isPlaying) {
    const now = Date.now();
    const playTime = Math.floor((now - (state.playStartTime || now)) / 1000);
    state.userProfile.stats.totalPlayTime += playTime;
    state.playStartTime = now;
  }

  // Update favorite artists based on play history
  if (state.playHistory && state.playHistory.length > 0) {
    const artistCounts = {};
    state.playHistory.forEach(track => {
      const artist = track.artist || 'Unknown';
      artistCounts[artist] = (artistCounts[artist] || 0) + 1;
    });

    const sortedArtists = Object.entries(artistCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([artist]) => artist);

    state.userProfile.stats.favoriteArtists = sortedArtists;
  }

  // Update favorite genres (simplified - would need genre detection)
  state.userProfile.stats.favoriteGenres = ['Pop', 'Rock', 'Electronic']; // Mock data

  // Update last active
  state.userProfile.stats.lastActive = new Date().toISOString();

  // Save profile (persist under both keys for compatibility)
  try {
    const toSave = JSON.stringify(state.userProfile);
    localStorage.setItem('raagam_user_profile', toSave);
    localStorage.setItem('raagam_profile', toSave);
  } catch (e) {
    console.warn('Failed to save user profile:', e);
  }
}

function openUserProfileDialog() {
  const dialog = $('#user-profile-dialog');
  if (!dialog) {
    // Create dialog if it doesn't exist
    createUserProfileDialog();
    return;
  }

  // Populate dialog with current profile data
  populateUserProfileDialog();
  dialog.classList.remove('hidden');
}

function createUserProfileDialog() {
  const dialog = document.createElement('div');
  dialog.id = 'user-profile-dialog';
  dialog.className = 'dialog-overlay';
  dialog.innerHTML = `
    <div class="dialog-box" style="max-width: 500px;">
      <div class="dialog-header">
        <h2>User Profile</h2>
        <button id="user-profile-close" class="dialog-close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="dialog-content">
        <div class="profile-header" style="text-align: center; margin-bottom: 24px;">
          <div class="profile-avatar" style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
          <h3 id="profile-name" style="margin: 0 0 4px 0;">Music Lover</h3>
          <p id="profile-last-active" style="margin: 0; font-size: 12px; color: var(--text-dim);">Last active: Just now</p>
        </div>

        <div class="profile-stats" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
          <div class="stat-card" style="background: var(--bg-card); padding: 16px; border-radius: 8px; text-align: center;">
            <div id="stat-songs-played" style="font-size: 24px; font-weight: 700; color: var(--accent);">0</div>
            <div style="font-size: 12px; color: var(--text-dim);">Songs Played</div>
          </div>
          <div class="stat-card" style="background: var(--bg-card); padding: 16px; border-radius: 8px; text-align: center;">
            <div id="stat-play-time" style="font-size: 24px; font-weight: 700; color: var(--accent);">0h</div>
            <div style="font-size: 12px; color: var(--text-dim);">Play Time</div>
          </div>
        </div>

        <div class="profile-section" style="margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0;">Favorite Artists</h4>
          <div id="favorite-artists" style="display: flex; flex-wrap: wrap; gap: 8px;">
            <!-- Favorite artists will be populated here -->
          </div>
        </div>

        <div class="profile-section" style="margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0;">Favorite Genres</h4>
          <div id="favorite-genres" style="display: flex; flex-wrap: wrap; gap: 8px;">
            <!-- Favorite genres will be populated here -->
          </div>
        </div>

        <div class="profile-section">
          <h4 style="margin: 0 0 12px 0;">Preferences</h4>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Default Volume</span>
              <input type="range" id="profile-default-volume" min="0" max="100" style="width: 100px;" />
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Crossfade</span>
              <input type="checkbox" id="profile-crossfade" style="width: 18px; height: 18px;" />
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Theme</span>
              <select id="profile-theme" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--text-dim); background: var(--bg); color: var(--text-primary);">
                <option value="midnight">Midnight</option>
                <option value="abyss">Abyss</option>
                <option value="sunset">Sunset</option>
                <option value="forest">Forest</option>
                <option value="rose">Rose</option>
                <option value="ocean">Ocean</option>
                <option value="snow">Snow</option>
                <option value="aurora">Aurora</option>
              </select>
            </label>
          </div>
        </div>

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--text-dim);">
          <button id="reset-profile-btn" style="background: rgba(255,60,60,0.1); color: #ff5252; border: 1px solid rgba(255,60,60,0.3); border-radius: 8px; padding: 10px 16px; cursor: pointer; width: 100%;">
            Reset Profile
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // Event listeners
  $('#user-profile-close').addEventListener('click', () => dialog.classList.add('hidden'));
  $('#profile-default-volume').addEventListener('input', (e) => {
    state.userProfile.preferences.defaultVolume = parseInt(e.target.value);
    saveUserProfile();
  });
  $('#profile-crossfade').addEventListener('change', (e) => {
    state.userProfile.preferences.crossfadeEnabled = e.target.checked;
    saveUserProfile();
  });
  $('#profile-theme').addEventListener('change', (e) => {
    state.userProfile.preferences.theme = e.target.value;
    saveUserProfile();
  });
  $('#reset-profile-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset your profile? This will clear all stats and preferences.')) {
      state.userProfile = createDefaultProfile();
      saveUserProfile();
      populateUserProfileDialog();
      showToast('Profile reset successfully');
    }
  });

  populateUserProfileDialog();
  dialog.classList.remove('hidden');
}

function populateUserProfileDialog() {
  const profile = state.userProfile;
  if (!profile) return;

  // Basic info
  $('#profile-name').textContent = profile.name;
  $('#profile-last-active').textContent = `Last active: ${new Date(profile.stats.lastActive).toLocaleDateString()}`;

  // Stats
  $('#stat-songs-played').textContent = profile.stats.totalSongsPlayed.toLocaleString();
  const playTimeHours = Math.floor(profile.stats.totalPlayTime / 3600);
  $('#stat-play-time').textContent = `${playTimeHours}h`;

  // Favorite artists
  const artistsContainer = $('#favorite-artists');
  artistsContainer.innerHTML = '';
  profile.stats.favoriteArtists.forEach(artist => {
    const tag = document.createElement('span');
    tag.style.cssText = 'background: var(--accent); color: #000; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 500;';
    tag.textContent = artist;
    artistsContainer.appendChild(tag);
  });

  // Favorite genres
  const genresContainer = $('#favorite-genres');
  genresContainer.innerHTML = '';
  profile.stats.favoriteGenres.forEach(genre => {
    const tag = document.createElement('span');
    tag.style.cssText = 'background: var(--bg-card); color: var(--text-primary); padding: 4px 8px; border-radius: 12px; font-size: 12px; border: 1px solid var(--text-dim);';
    tag.textContent = genre;
    genresContainer.appendChild(tag);
  });

  // Preferences
  $('#profile-default-volume').value = profile.preferences.defaultVolume;
  $('#profile-crossfade').checked = profile.preferences.crossfadeEnabled;
  $('#profile-theme').value = profile.preferences.theme;
}

function saveUserProfile() {
  localStorage.setItem('raagam_user_profile', JSON.stringify(state.userProfile));
  autoBackup.schedule();
}

// ===== Auto Profile Backup — IndexedDB =====
// Silently backs up the full profile to IndexedDB on every change.
// IndexedDB survives iOS 7-day storage purges and browser "Clear History".
// On startup, if localStorage appears empty, autoBackup restores everything.
// Zero user action — profile is backed up the moment they enter their name.
const autoBackup = {
  _db: null,
  _saveTimer: null,
  DB_NAME: 'raagam-idb',
  DB_VER: 1,

  // Open (or reuse) the IndexedDB connection
  async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'k' });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  async _put(key, value) {
    try {
      const db = await this._open();
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k: key, v: value, t: Date.now() });
    } catch { }
  },

  async _get(key) {
    try {
      const db = await this._open();
      return new Promise(resolve => {
        const tx = db.transaction('kv', 'readonly');
        const req = tx.objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result?.v ?? null);
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  },

  // Debounced save — called after any profile change
  schedule() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveAll(), 2500);
  },

  async _saveAll() {
    await this._put('snapshot', {
      profile: state.userProfile,
      language: CONFIG.preferredLanguage,
      liked: state.liked,
      playlists: state.playlists,
      recent: state.recent.slice(0, 50),
      favoriteGenres: state.favoriteGenres,
      skipSignals: state.skipSignals,
      theme: state.currentTheme,
      savedAt: Date.now(),
    });
  },

  // Called on startup — restores from IndexedDB if localStorage was purged
  async restore() {
    const snap = await this._get('snapshot');
    if (!snap) return false;

    let restored = false;

    if (snap.liked?.length && !state.liked.length) {
      state.liked = snap.liked;
      localStorage.setItem('raagam_liked', JSON.stringify(snap.liked));
      restored = true;
    }
    if (snap.recent?.length && !state.recent.length) {
      state.recent = snap.recent;
      localStorage.setItem('raagam_recent', JSON.stringify(snap.recent));
      restored = true;
    }
    if (snap.playlists?.length && !state.playlists.length) {
      state.playlists = snap.playlists;
      localStorage.setItem('raagam_playlists', JSON.stringify(snap.playlists));
      restored = true;
    }
    if (snap.profile && !localStorage.getItem('raagam_profile')) {
      state.userProfile = snap.profile;
      CONFIG.userProfile = snap.profile;
      localStorage.setItem('raagam_profile', JSON.stringify(snap.profile));
      restored = true;
    }
    if (snap.language && !CONFIG.preferredLanguage) {
      CONFIG.preferredLanguage = snap.language;
      localStorage.setItem('raagam_language', snap.language);
      state.languageSetupComplete = true;
      localStorage.setItem('raagam_language_setup', 'true');
      restored = true;
    }

    if (restored) {
      state.homeLoaded = false;
      try { updateLikeButtons(); } catch (_) { }
      try { updateLibraryCounts(); } catch (_) { }
      console.log('[AutoBackup] Restored profile from IndexedDB');
    }
    return restored;
  },

  // Export profile as a downloadable JSON file
  exportJSON() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: state.userProfile,
      language: CONFIG.preferredLanguage,
      liked: state.liked,
      playlists: state.playlists,
      recent: state.recent.slice(0, 50),
      theme: state.currentTheme,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raagam-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Import profile from a JSON file the user selects
  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.liked?.length) {
            const seen = new Set(state.liked.map(t => t.id));
            data.liked.forEach(t => { if (!seen.has(t.id)) { state.liked.push(t); seen.add(t.id); } });
            localStorage.setItem('raagam_liked', JSON.stringify(state.liked));
          }
          if (data.playlists?.length && !state.playlists.length) {
            state.playlists = data.playlists;
            localStorage.setItem('raagam_playlists', JSON.stringify(state.playlists));
          }
          if (data.recent?.length) {
            const seen = new Set(state.recent.map(t => t.id));
            data.recent.forEach(t => { if (!seen.has(t.id)) { state.recent.push(t); seen.add(t.id); } });
            state.recent = state.recent.slice(0, 50);
            localStorage.setItem('raagam_recent', JSON.stringify(state.recent));
          }
          if (data.language && !CONFIG.preferredLanguage) {
            CONFIG.preferredLanguage = data.language;
            localStorage.setItem('raagam_language', data.language);
          }
          state.homeLoaded = false;
          autoBackup.schedule();
          resolve(data);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  },
};

// ── Profile Backup Settings UI ───────────────────────────────────────────────
// Injected into the settings panel once; shows auto-backup status + export/import
function _initProfileBackupUI() {
  const panel = $('#settings-panel');
  if (!panel || document.getElementById('profile-backup-section')) return;

  const section = document.createElement('div');
  section.id = 'profile-backup-section';
  section.className = 'setting-item';
  section.style.cssText = 'flex-direction:column;align-items:stretch;gap:10px;';
  section.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="display:flex;align-items:center;gap:6px;font-weight:600;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 6h-2.18c.07-.44.18-.88.18-1.25C18 2.57 15.86 1 13.5 1c-1.4 0-2.72.58-3.65 1.6L9 3.5l-.85-.9C7.22 1.58 5.9 1 4.5 1 2.14 1 0 2.57 0 4.75c0 2.7 2.83 5.05 7.13 8.5L9 14.8l1.87-1.55C15.17 9.8 18 7.45 18 4.75c0-.37-.11-.81-.18-1.25H20c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-5h2v5h16V7.5z"/>
        </svg>
        Profile &amp; Backup
      </span>
      <span style="font-size:11px;color:#1DB954;font-weight:600;">Auto-saved</span>
    </div>
    <p style="font-size:12px;color:#b3b3b3;margin:0;">
      Your liked songs, playlists &amp; history are <b>automatically backed up</b> on this device.
      Export a file to restore your profile on another device.
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="profile-export-btn"
        style="flex:1;min-width:120px;background:var(--accent);color:#000;border:none;
               padding:9px 12px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
        Export Profile
      </button>
      <label id="profile-import-label"
        style="flex:1;min-width:120px;background:var(--bg-card);color:var(--text-primary);
               border:1px solid var(--border);padding:9px 12px;border-radius:8px;
               font-size:13px;font-weight:600;cursor:pointer;text-align:center;">
        Import Profile
        <input id="profile-import-input" type="file" accept=".json" style="display:none;" />
      </label>
    </div>
    <div id="profile-backup-info" style="font-size:11px;color:#666;"></div>
  `;
  panel.appendChild(section);

  // Export
  document.getElementById('profile-export-btn').addEventListener('click', () => {
    autoBackup.exportJSON();
    showToast('Profile exported!');
  });

  // Import
  document.getElementById('profile-import-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await autoBackup.importJSON(file);
      showToast('Profile imported! Home is refreshing…');
      state.homeLoaded = false;
      loadHome();
    } catch (err) {
      showToast('Import failed — invalid file');
    }
    e.target.value = ''; // reset so same file can be re-selected
  });

  // Show last backup timestamp
  autoBackup._get('snapshot').then(snap => {
    const el = document.getElementById('profile-backup-info');
    if (!el || !snap?.savedAt) return;
    const d = new Date(snap.savedAt);
    el.textContent = `Last backup: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  });
}

// Podcast functionality
function initPodcasts() {
  // Add podcast tab to search
  const searchTabs = $('#search-tabs');
  if (searchTabs) {
    const podcastTab = document.createElement('button');
    podcastTab.className = 'search-tab';
    podcastTab.dataset.tab = 'podcasts';
    podcastTab.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
      Podcasts
    `;
    searchTabs.appendChild(podcastTab);

    podcastTab.addEventListener('click', () => {
      $$('.search-tab').forEach(t => t.classList.remove('active'));
      podcastTab.classList.add('active');
      state.searchTab = 'podcasts';
    });
  }
}

// Mock podcast data (in a real app, this would come from an API)
const mockPodcasts = [
  {
    id: 'podcast-1',
    name: 'Music Discovery Weekly',
    description: 'Weekly podcast exploring new music and artists',
    host: 'Raagam Team',
    episodes: [
      {
        id: 'ep-1',
        title: 'Indie Rock Revival',
        description: 'Exploring the latest indie rock bands making waves',
        duration: '45:30',
        published: '2024-01-15',
        audioUrl: 'https://example.com/podcast1.mp3' // Mock URL
      },
      {
        id: 'ep-2',
        title: 'Jazz Legends',
        description: 'A deep dive into jazz history and modern jazz artists',
        duration: '52:15',
        published: '2024-01-08',
        audioUrl: 'https://example.com/podcast2.mp3' // Mock URL
      }
    ]
  },
  {
    id: 'podcast-2',
    name: 'Artist Interviews',
    description: 'In-depth conversations with musicians and producers',
    host: 'Music Insider',
    episodes: [
      {
        id: 'ep-3',
        title: 'Electronic Music Production',
        description: 'How modern producers create electronic music',
        duration: '38:45',
        published: '2024-01-12',
        audioUrl: 'https://example.com/podcast3.mp3' // Mock URL
      }
    ]
  }
];

async function searchPodcasts(query) {
  // In a real implementation, this would search a podcast API
  // For now, return mock data filtered by query
  if (!query) return mockPodcasts;

  return mockPodcasts.filter(podcast =>
    podcast.name.toLowerCase().includes(query.toLowerCase()) ||
    podcast.description.toLowerCase().includes(query.toLowerCase()) ||
    podcast.episodes.some(ep =>
      ep.title.toLowerCase().includes(query.toLowerCase()) ||
      ep.description.toLowerCase().includes(query.toLowerCase())
    )
  );
}

function renderPodcastItem(podcast) {
  const div = document.createElement('div');
  div.className = 'podcast-result-item';
  div.innerHTML = `
    <div class="podcast-result-art">
      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
      </div>
    </div>
    <div class="result-info">
      <p class="result-title">${podcast.name}</p>
      <p class="result-sub">${podcast.host} · ${podcast.episodes.length} episodes</p>
      <p class="result-desc" style="font-size: 12px; color: var(--text-dim); margin-top: 4px; line-height: 1.4;">${podcast.description}</p>
    </div>
  `;

  div.addEventListener('click', () => showPodcastDetail(podcast));
  return div;
}

function renderPodcastEpisode(episode, podcast) {
  const div = document.createElement('div');
  div.className = 'episode-result-item';
  div.innerHTML = `
    <div class="episode-result-art">
      <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </div>
    <div class="result-info">
      <p class="result-title">${episode.title}</p>
      <p class="result-sub">${episode.duration} · ${new Date(episode.published).toLocaleDateString()}</p>
      <p class="result-desc" style="font-size: 12px; color: var(--text-dim); margin-top: 4px; line-height: 1.4;">${episode.description}</p>
    </div>
    <button class="episode-play-btn" data-episode-id="${episode.id}" style="background: var(--accent); color: #000; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 12px; font-weight: 600;">
      Play
    </button>
  `;

  const playBtn = div.querySelector('.episode-play-btn');
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    playPodcastEpisode(episode, podcast);
  });

  return div;
}

function showPodcastDetail(podcast) {
  const resultsContainer = $('#search-results');

  // Clear existing content
  resultsContainer.innerHTML = '';

  // Create podcast detail view
  const detailView = document.createElement('div');
  detailView.className = 'podcast-detail-view';
  detailView.innerHTML = `
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding: 20px; background: var(--bg-card); border-radius: 12px;">
      <div style="width: 120px; height: 120px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
      </div>
      <div style="flex: 1;">
        <h2 style="margin: 0 0 8px 0; font-size: 24px;">${podcast.name}</h2>
        <p style="margin: 0 0 8px 0; color: var(--text-dim);">${podcast.host}</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.5;">${podcast.description}</p>
      </div>
    </div>
    <h3 style="margin-bottom: 16px;">Episodes</h3>
    <div class="episodes-list">
      ${podcast.episodes.map(ep => renderPodcastEpisode(ep, podcast).outerHTML).join('')}
    </div>
  `;

  resultsContainer.appendChild(detailView);
}

function playPodcastEpisode(episode, podcast) {
  // Create a mock track object for podcast episode
  const podcastTrack = {
    id: episode.id,
    name: episode.title,
    artist: podcast.name,
    album: podcast.name,
    duration: episode.duration,
    image: [], // No image for podcasts
    downloadUrl: episode.audioUrl,
    isPodcast: true,
    podcastInfo: {
      podcast: podcast.name,
      host: podcast.host,
      description: episode.description,
      published: episode.published
    }
  };

  // Play the podcast episode
  playSong(podcastTrack);
  showToast(`Playing: ${episode.title}`);
}

// Parental controls functionality
function initParentalControls() {
  // Load saved parental controls setting
  state.parentalControls = localStorage.getItem('raagam_parental_controls') === 'true';
}

function toggleParentalControls(enabled) {
  state.parentalControls = enabled;
  localStorage.setItem('raagam_parental_controls', enabled.toString());

  if (enabled) {
    showToast('Parental controls enabled - explicit content will be filtered');
  } else {
    showToast('Parental controls disabled');
  }
}

function isContentAllowed(track) {
  if (!state.parentalControls) return true;

  // Check for explicit content indicators
  const title = (track.name || '').toLowerCase();
  const artist = (track.artist || '').toLowerCase();
  const album = (track.album || '').toLowerCase();

  // Common explicit content keywords
  const explicitKeywords = [
    'explicit', 'clean', 'censored', 'radio edit',
    'fuck', 'shit', 'damn', 'bitch', 'ass', 'dick', 'pussy',
    'nigga', 'nigger', 'cunt', 'cock', 'tits', 'boobs',
    'sex', 'porn', 'cum', 'jizz', 'whore', 'slut'
  ];

  const content = `${title} ${artist} ${album}`;

  // Check if any explicit keywords are present
  return !explicitKeywords.some(keyword => content.includes(keyword));
}

function filterSearchResults(results) {
  if (!state.parentalControls) return results;

  return results.filter(track => isContentAllowed(track));
}

function openParentalControlsDialog() {
  const dialog = $('#parental-controls-dialog');
  if (!dialog) {
    // Create dialog if it doesn't exist
    createParentalControlsDialog();
    return;
  }

  // Update dialog state
  const toggle = $('#parental-controls-toggle');
  if (toggle) toggle.checked = state.parentalControls;

  dialog.classList.remove('hidden');
}

function createParentalControlsDialog() {
  const dialog = document.createElement('div');
  dialog.id = 'parental-controls-dialog';
  dialog.className = 'dialog-overlay';
  dialog.innerHTML = `
    <div class="dialog-box" style="max-width: 400px;">
      <div class="dialog-header">
        <h2>Parental Controls</h2>
        <button id="parental-controls-close" class="dialog-close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="dialog-content">
        <div style="margin-bottom: 20px;">
          <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 16px;">
            <input type="checkbox" id="parental-controls-toggle" style="width: 20px; height: 20px;" />
            <div>
              <div style="font-weight: 600;">Enable Content Filtering</div>
              <div style="font-size: 14px; color: var(--text-dim); margin-top: 4px;">
                Filter out songs with explicit lyrics or content
              </div>
            </div>
          </label>
        </div>
        <div style="background: var(--bg-card); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0; color: var(--text-primary);">What gets filtered:</h4>
          <ul style="margin: 0; padding-left: 20px; color: var(--text-dim); font-size: 14px; line-height: 1.5;">
            <li>Songs with explicit language in titles</li>
            <li>Artists known for explicit content</li>
            <li>Albums marked as explicit</li>
            <li>Content with profanity or adult themes</li>
          </ul>
        </div>
        <div style="font-size: 12px; color: var(--text-dim); text-align: center;">
          Note: This is a basic content filter. For comprehensive parental controls, consider additional monitoring tools.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // Event listeners
  $('#parental-controls-close').addEventListener('click', () => dialog.classList.add('hidden'));
  $('#parental-controls-toggle').addEventListener('change', (e) => {
    toggleParentalControls(e.target.checked);
  });

  dialog.classList.remove('hidden');
}

// Theme scheduling functionality
let themeSchedulerInterval = null;

function initThemeScheduler() {
  // Load saved schedule
  const saved = localStorage.getItem('raagam_theme_schedule');
  if (saved) {
    try {
      state.themeSchedule = JSON.parse(saved);
    } catch (e) {
      state.themeSchedule = null;
    }
  }

  // Start scheduler if enabled
  if (state.themeSchedule?.enabled) {
    startThemeScheduler();
  }
}

function startThemeScheduler() {
  if (themeSchedulerInterval) clearInterval(themeSchedulerInterval);

  // Check every minute
  themeSchedulerInterval = setInterval(() => {
    checkThemeSchedule();
  }, 60000);

  // Check immediately
  checkThemeSchedule();
}

function stopThemeScheduler() {
  if (themeSchedulerInterval) {
    clearInterval(themeSchedulerInterval);
    themeSchedulerInterval = null;
  }
}

function checkThemeSchedule() {
  if (!state.themeSchedule?.enabled) return;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  // Find the active schedule entry
  let activeTheme = null;
  for (const entry of state.themeSchedule.entries || []) {
    const [hours, minutes] = entry.time.split(':').map(Number);
    const entryTime = hours * 60 + minutes;

    // Check if current time is within this schedule entry's range
    if (currentTime >= entryTime) {
      activeTheme = entry.theme;
    } else {
      break; // Schedule entries should be sorted by time
    }
  }

  // If we found an active theme and it's different from current, apply it
  if (activeTheme && activeTheme !== state.currentTheme) {
    applyTheme(activeTheme);
    showToast(`Theme changed to ${getThemeDisplayName(activeTheme)} (scheduled)`);
  }
}

function saveThemeSchedule(schedule) {
  state.themeSchedule = schedule;
  localStorage.setItem('raagam_theme_schedule', JSON.stringify(schedule));

  if (schedule?.enabled) {
    startThemeScheduler();
  } else {
    stopThemeScheduler();
  }
}

function getThemeDisplayName(theme) {
  const names = {
    'midnight': 'Midnight',
    'abyss': 'Abyss',
    'sunset': 'Sunset',
    'forest': 'Forest',
    'rose': 'Rose',
    'ocean': 'Ocean',
    'snow': 'Snow',
    'aurora': 'Aurora',
    'custom-backdrop': 'My Photo'
  };
  return names[theme] || theme;
}

function openThemeSchedulerDialog() {
  const dialog = $('#theme-scheduler-dialog');
  if (!dialog) {
    // Create dialog if it doesn't exist
    createThemeSchedulerDialog();
    return;
  }

  // Populate existing schedule
  populateThemeSchedulerDialog();
  dialog.classList.remove('hidden');
}

function createThemeSchedulerDialog() {
  const dialog = document.createElement('div');
  dialog.id = 'theme-scheduler-dialog';
  dialog.className = 'dialog-overlay';
  dialog.innerHTML = `
    <div class="dialog-box" style="max-width: 500px;">
      <div class="dialog-header">
        <h2>Theme Scheduler</h2>
        <button id="theme-scheduler-close" class="dialog-close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="dialog-content">
        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="theme-scheduler-enabled" style="width: 18px; height: 18px;" />
            <span>Enable automatic theme changes</span>
          </label>
        </div>
        <div id="theme-schedule-entries" style="margin-bottom: 16px;">
          <!-- Schedule entries will be populated here -->
        </div>
        <button id="add-theme-schedule-entry" style="background: var(--accent); color: #000; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; width: 100%;">
          Add Schedule Entry
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // Event listeners
  $('#theme-scheduler-close').addEventListener('click', () => dialog.classList.add('hidden'));
  $('#theme-scheduler-enabled').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    if (state.themeSchedule) {
      state.themeSchedule.enabled = enabled;
    } else {
      state.themeSchedule = { enabled, entries: [] };
    }
    saveThemeSchedule(state.themeSchedule);
  });
  $('#add-theme-schedule-entry').addEventListener('click', addThemeScheduleEntry);

  populateThemeSchedulerDialog();
  dialog.classList.remove('hidden');
}

function populateThemeSchedulerDialog() {
  const enabledCheckbox = $('#theme-scheduler-enabled');
  const entriesContainer = $('#theme-schedule-entries');

  if (enabledCheckbox) {
    enabledCheckbox.checked = state.themeSchedule?.enabled || false;
  }

  if (entriesContainer) {
    entriesContainer.innerHTML = '';

    const entries = state.themeSchedule?.entries || [];
    entries.sort((a, b) => a.time.localeCompare(b.time));

    entries.forEach((entry, index) => {
      const entryDiv = document.createElement('div');
      entryDiv.className = 'theme-schedule-entry';
      entryDiv.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-card); border-radius: 8px; margin-bottom: 8px;';
      entryDiv.innerHTML = `
        <input type="time" value="${entry.time}" style="flex: 1; padding: 6px; border-radius: 4px; border: 1px solid var(--text-dim);" />
        <select style="flex: 2; padding: 6px; border-radius: 4px; border: 1px solid var(--text-dim); background: var(--bg); color: var(--text-primary);">
          <option value="midnight" ${entry.theme === 'midnight' ? 'selected' : ''}>Midnight</option>
          <option value="abyss" ${entry.theme === 'abyss' ? 'selected' : ''}>Abyss</option>
          <option value="sunset" ${entry.theme === 'sunset' ? 'selected' : ''}>Sunset</option>
          <option value="forest" ${entry.theme === 'forest' ? 'selected' : ''}>Forest</option>
          <option value="rose" ${entry.theme === 'rose' ? 'selected' : ''}>Rose</option>
          <option value="ocean" ${entry.theme === 'ocean' ? 'selected' : ''}>Ocean</option>
          <option value="snow" ${entry.theme === 'snow' ? 'selected' : ''}>Snow</option>
          <option value="aurora" ${entry.theme === 'aurora' ? 'selected' : ''}>Aurora</option>
          <option value="custom-backdrop" ${entry.theme === 'custom-backdrop' ? 'selected' : ''}>My Photo</option>
        </select>
        <button class="remove-schedule-entry" style="background: #ff4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Remove</button>
      `;

      const timeInput = entryDiv.querySelector('input[type="time"]');
      const themeSelect = entryDiv.querySelector('select');
      const removeBtn = entryDiv.querySelector('.remove-schedule-entry');

      timeInput.addEventListener('change', () => {
        entry.time = timeInput.value;
        saveThemeSchedule(state.themeSchedule);
      });

      themeSelect.addEventListener('change', () => {
        entry.theme = themeSelect.value;
        saveThemeSchedule(state.themeSchedule);
      });

      removeBtn.addEventListener('click', () => {
        state.themeSchedule.entries.splice(index, 1);
        saveThemeSchedule(state.themeSchedule);
        populateThemeSchedulerDialog();
      });

      entriesContainer.appendChild(entryDiv);
    });
  }
}

function addThemeScheduleEntry() {
  if (!state.themeSchedule) {
    state.themeSchedule = { enabled: false, entries: [] };
  }

  // Add a new entry with default time and theme
  const now = new Date();
  const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  state.themeSchedule.entries.push({
    time: defaultTime,
    theme: 'midnight'
  });

  saveThemeSchedule(state.themeSchedule);
  populateThemeSchedulerDialog();
}

// Voice search functionality
let voiceRecognition = null;
let isListening = false;

function initVoiceSearch() {
  // Check if Web Speech API is supported
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Voice search not supported in this browser');
    return false;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  voiceRecognition = new SpeechRecognition();

  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = false;
  voiceRecognition.lang = 'en-US'; // Default to English, could be made configurable

  voiceRecognition.onstart = () => {
    isListening = true;
    updateVoiceSearchUI();
    showToast('🎤 Listening... Say a song or artist name');
  };

  voiceRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log('Voice search transcript:', transcript);

    // Stop listening
    stopVoiceSearch();

    // Process the voice input
    processVoiceInput(transcript);
  };

  voiceRecognition.onerror = (event) => {
    console.error('Voice search error:', event.error);
    stopVoiceSearch();
    showToast('Voice search failed. Try again.');
  };

  voiceRecognition.onend = () => {
    isListening = false;
    updateVoiceSearchUI();
  };

  return true;
}

function startVoiceSearch() {
  if (!voiceRecognition) {
    if (!initVoiceSearch()) {
      showToast('Voice search not supported in this browser');
      return;
    }
  }

  if (isListening) {
    stopVoiceSearch();
    return;
  }

  try {
    voiceRecognition.start();
  } catch (error) {
    console.error('Failed to start voice recognition:', error);
    showToast('Could not start voice search');
  }
}

function stopVoiceSearch() {
  if (voiceRecognition && isListening) {
    voiceRecognition.stop();
  }
}

function processVoiceInput(transcript) {
  // Clean up the transcript
  const query = transcript.trim().toLowerCase();

  if (!query) {
    showToast('No speech detected');
    return;
  }

  console.log('Processing voice input:', query);
  showToast(`🎵 Searching for: "${query}"`);

  // Switch to search view
  switchView('search');

  // Set the search input
  const searchInput = $('#search-input');
  if (searchInput) {
    searchInput.value = query;
    $('#search-clear').classList.remove('hidden');
    $('#browse-categories').classList.add('hidden');

    // Trigger search
    performSearch(query);
  }

  analytics.trackEvent('voice_search', { query, transcript });
}

function updateVoiceSearchUI() {
  const voiceBtn = $('#voice-search-btn');
  if (voiceBtn) {
    voiceBtn.classList.toggle('listening', isListening);
    voiceBtn.innerHTML = isListening ?
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8" opacity="0.3"/><circle cx="12" cy="12" r="4" opacity="0.6"/><circle cx="12" cy="12" r="2"/></svg>' :
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>';
  }
}

// Initialize IndexedDB for offline storage
async function initOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('RaagamOffline', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      state.offlineDB = request.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('tracks')) {
        const store = db.createObjectStore('tracks', { keyPath: 'id' });
        store.createIndex('artist', 'artist', { unique: false });
        store.createIndex('album', 'album', { unique: false });
      }
    };
  });
}

// Check storage quota
async function checkStorageQuota() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      state.offlineStorageQuota = estimate.quota - estimate.usage;
      return estimate;
    } catch (e) {
      console.warn('Storage estimate failed:', e);
    }
  }
  return null;
}

// Download track for offline playback
async function downloadTrack(track) {
  if (!track || state.offlineDownloading.has(track.id)) return;

  const url = getAudioUrl(track);
  if (!url) {
    showToast('No audio URL available for download');
    return;
  }

  state.offlineDownloading.add(track.id);
  updateOfflineUI();

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const size = blob.size;

    // Check if we have enough storage
    if (state.offlineStorageQuota && size > state.offlineStorageQuota) {
      throw new Error('Not enough storage space');
    }

    // Store in IndexedDB
    const db = state.offlineDB;
    const transaction = db.transaction(['tracks'], 'readwrite');
    const store = transaction.objectStore('tracks');

    const offlineTrack = {
      id: track.id,
      name: getTrackName(track),
      artist: getArtistName(track),
      album: getAlbumName(track),
      image: getImage(track, 'mid'),
      duration: track.duration,
      blob: blob,
      downloadedAt: Date.now(),
      size: size
    };

    await new Promise((resolve, reject) => {
      const request = store.put(offlineTrack);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    state.offlineTracks.add(track.id);
    state.offlineStorageQuota -= size;
    showToast(`Downloaded: ${getTrackName(track)}`);

  } catch (error) {
    console.error('Download failed:', error);
    showToast(`Download failed: ${error.message}`);
  } finally {
    state.offlineDownloading.delete(track.id);
    updateOfflineUI();
  }
}

// Remove track from offline storage
async function removeOfflineTrack(trackId) {
  try {
    const db = state.offlineDB;
    const transaction = db.transaction(['tracks'], 'readwrite');
    const store = transaction.objectStore('tracks');

    // Get track to reclaim storage space
    const track = await new Promise((resolve) => {
      const request = store.get(trackId);
      request.onsuccess = () => resolve(request.result);
    });

    if (track) {
      state.offlineStorageQuota += track.size;
    }

    await new Promise((resolve, reject) => {
      const request = store.delete(trackId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    state.offlineTracks.delete(trackId);
    showToast('Removed from offline storage');
    updateOfflineUI();

  } catch (error) {
    console.error('Remove failed:', error);
    showToast('Failed to remove track');
  }
}

// Get offline track data
async function getOfflineTrack(trackId) {
  if (!state.offlineDB || !state.offlineTracks.has(trackId)) return null;

  try {
    const db = state.offlineDB;
    const transaction = db.transaction(['tracks'], 'readonly');
    const store = transaction.objectStore('tracks');

    return await new Promise((resolve) => {
      const request = store.get(trackId);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (error) {
    console.error('Get offline track failed:', error);
    return null;
  }
}

// Toggle offline mode
function toggleOfflineMode() {
  state.offlineMode = !state.offlineMode;
  localStorage.setItem('raagam_offline_mode', state.offlineMode);

  if (state.offlineMode) {
    showToast('Offline mode enabled');
  } else {
    showToast('Offline mode disabled');
  }

  updateOfflineUI();
}

// Update offline UI elements
function updateOfflineUI() {
  const offlineBtn = $('#settings-offline-btn');
  const offlineStatus = $('#offline-status');
  const downloadCount = $('#offline-download-count');

  if (offlineBtn) {
    offlineBtn.classList.toggle('active', state.offlineMode);
    offlineBtn.textContent = state.offlineMode ? 'Disable Offline' : 'Enable Offline';
  }

  if (offlineStatus) {
    const online = navigator.onLine;
    const hasOfflineTracks = state.offlineTracks.size > 0;
    const downloading = state.offlineDownloading.size > 0;

    let status = online ? '🟢 Online' : '🔴 Offline';
    if (state.offlineMode) {
      status += hasOfflineTracks ? ` • ${state.offlineTracks.size} offline tracks` : ' • No offline tracks';
      if (downloading) status += ` • Downloading ${state.offlineDownloading.size}`;
    }

    offlineStatus.textContent = status;
    offlineStatus.classList.toggle('offline-active', state.offlineMode);
  }

  if (downloadCount) {
    downloadCount.textContent = state.offlineTracks.size;
  }

  // Update download buttons in result items
  document.querySelectorAll('.result-item').forEach(item => {
    const trackId = item.dataset.trackId;
    if (trackId) {
      const downloadBtn = item.querySelector('.download-btn');
      if (downloadBtn) {
        const isDownloaded = state.offlineTracks.has(trackId);
        const isDownloading = state.offlineDownloading.has(trackId);

        downloadBtn.classList.toggle('downloaded', isDownloaded);
        downloadBtn.classList.toggle('downloading', isDownloading);
        downloadBtn.innerHTML = isDownloading ? '⏳' : isDownloaded ? '✓' : '↓';
        downloadBtn.title = isDownloading ? 'Downloading...' : isDownloaded ? 'Remove from offline' : 'Download for offline';
      }
    }
  });
}

// Load offline tracks from IndexedDB
async function loadOfflineTracks() {
  if (!state.offlineDB) return;

  try {
    const db = state.offlineDB;
    const transaction = db.transaction(['tracks'], 'readonly');
    const store = transaction.objectStore('tracks');

    const tracks = await new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });

    tracks.forEach(track => {
      state.offlineTracks.add(track.id);
    });

    console.log(`Loaded ${tracks.length} offline tracks`);
  } catch (error) {
    console.error('Load offline tracks failed:', error);
  }
}

// Process download queue
async function processDownloadQueue() {
  if (state.offlineDownloadQueue.length === 0) return;

  const track = state.offlineDownloadQueue.shift();
  await downloadTrack(track);

  // Continue processing queue
  setTimeout(processDownloadQueue, 1000);
}

// Add download button to result items
function addDownloadButtonToResult(resultItem, track) {
  if (!resultItem || !track) return;

  resultItem.dataset.trackId = track.id;

  // Check if download button already exists
  let downloadBtn = resultItem.querySelector('.download-btn');
  if (downloadBtn) return;

  downloadBtn = document.createElement('button');
  downloadBtn.className = 'download-btn icon-btn';
  downloadBtn.style.cssText = 'padding:6px;margin-left:4px;';
  downloadBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    const isDownloaded = state.offlineTracks.has(track.id);
    const isDownloading = state.offlineDownloading.has(track.id);

    if (isDownloading) {
      showToast('Already downloading...');
      return;
    }

    if (isDownloaded) {
      await removeOfflineTrack(track.id);
    } else {
      state.offlineDownloadQueue.push(track);
      processDownloadQueue();
    }
  });

  // Add to result actions
  const actions = resultItem.querySelector('.result-actions');
  if (actions) {
    actions.insertBefore(downloadBtn, actions.firstChild);
  }
}

// Override playSong to support offline tracks
const originalPlaySong = playSong;
playSong = async function (track, addToQueue = true) {
  // Check if offline mode and track is downloaded
  if (state.offlineMode && state.offlineTracks.has(track.id)) {
    const offlineTrack = await getOfflineTrack(track.id);
    if (offlineTrack) {
      // Create blob URL for offline playback
      const blobUrl = URL.createObjectURL(offlineTrack.blob);
      track._offlineUrl = blobUrl; // Store for cleanup

      // Temporarily override getAudioUrl for this track
      const originalGetAudioUrl = getAudioUrl;
      getAudioUrl = (t) => t.id === track.id ? blobUrl : originalGetAudioUrl(t);

      // Play normally
      await originalPlaySong(track, addToQueue);

      // Restore original function
      getAudioUrl = originalGetAudioUrl;

      // Clean up blob URL when track ends
      audio.addEventListener('ended', () => {
        if (track._offlineUrl) {
          URL.revokeObjectURL(track._offlineUrl);
          delete track._offlineUrl;
        }
      }, { once: true });

      return;
    }
  }

  // Normal online playback
  await originalPlaySong(track, addToQueue);
};

// Start the app
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded fired');
  // Apply theme immediately to prevent flash
  const savedTheme = localStorage.getItem('raagam_theme') || 'midnight';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (savedTheme === 'custom-backdrop') {
    const img = localStorage.getItem('raagam_backdrop');
    const bd = document.getElementById('theme-backdrop');
    if (bd && img) {
      bd.style.backgroundImage = `url(${img})`;
      bd.classList.add('active');
    }
  }
  apiHealth.init();  // Initialize circuit breakers & health tracking
  analytics.init();  // Initialize analytics
  registerServiceWorker(); // Register Service Worker for alarm support

  // Initialize offline mode
  state.offlineMode = localStorage.getItem('raagam_offline_mode') === 'true';
  initOfflineDB().then(() => {
    loadOfflineTracks();
    checkStorageQuota();
  }).catch(err => console.warn('Offline DB init failed:', err));

  // Initialize voice search
  initVoiceSearch();

  // Initialize theme scheduler
  initThemeScheduler();

  // Initialize parental controls
  initParentalControls();

  // Initialize podcasts
  initPodcasts();

  // Initialize user profiles and backup UI
  initUserProfiles();
  _initProfileBackupUI();

  // Restore from IndexedDB if localStorage was purged (iOS 7-day purge, cache clear, etc.)
  // Runs async before init() — profile data is available when home renders.
  autoBackup.restore().then(restored => {
    if (restored) showToast('Profile restored from backup');
  }).catch(() => { });

  init();

  // Recovery: if app remains hidden after initialization, force-show at 1.5s / 4s / 8s.
  // The 8-second hard recovery also dismisses stuck dialogs (profile / language) that
  // may have failed to attach event listeners, which would otherwise leave a black screen.
  function _uiRecovery(hard) {
    try {
      const appEl = $('#app');
      const splash = $('#splash');
      const pdlg = $('#profile-dialog');
      const ldlg = $('#language-dialog');
      const adlg = $('#auth-dialog'); // Firebase auth dialog — do NOT dismiss it
      if (!appEl || !appEl.classList.contains('hidden')) return; // already visible

      // If the auth dialog is visible, the app is in the sign-in flow — let it be.
      if (adlg && !adlg.classList.contains('hidden')) return;

      const dialogsHidden = (!pdlg || pdlg.classList.contains('hidden')) &&
        (!ldlg || ldlg.classList.contains('hidden'));

      if (dialogsHidden || hard) {
        // Hide any stuck dialogs on hard recovery
        if (hard && !dialogsHidden) {
          pdlg?.classList.add('hidden');
          ldlg?.classList.add('hidden');
          // Create a minimal profile so init() won't loop back
          if (!state.userProfile) {
            state.userProfile = CONFIG.userProfile = { name: 'Music Lover', phone: '' };
            localStorage.setItem('raagam_profile', JSON.stringify(state.userProfile));
          }
          if (!state.languageSetupComplete) {
            state.languageSetupComplete = true;
            localStorage.setItem('raagam_language_setup', 'true');
          }
        }
        console.warn(`[UI recovery${hard ? ' HARD' : ''}] Forcing app visible`);
        appEl.classList.remove('hidden');
        if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 400); }
        if (!appInitialized) {
          try { setupEvents(); setupSearch(); setupLibrary(); loadHome(); } catch (_) { }
        }
        if (hard) showToast('App recovered — if issues persist, go to Settings → Clear Data');
      }
    } catch (e) {
      console.warn('UI recovery failed:', e);
    }
  }
  setTimeout(() => _uiRecovery(false), 1500);  // soft: only fires if no dialog visible
  setTimeout(() => _uiRecovery(false), 4000);  // second soft attempt
  setTimeout(() => _uiRecovery(true), 8000);  // hard: clears stuck dialogs, forces show
});

// ===== bfcache fix =====
// Mobile browsers (iOS Safari, Android Chrome) restore the DOM from a snapshot
// when the user switches back to the tab or reopens from the homescreen.
// In that case DOMContentLoaded never fires again, leaving the splash visible.
// `pageshow` fires on EVERY page presentation, including bfcache restores.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return; // normal navigation — DOMContentLoaded handles this
  console.log('[bfcache] Page restored from cache — re-surfacing app');

  // Remove stale splash that is still in the cached DOM
  const splash = $('#splash');
  if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 300); }

  // Make app visible in case it was hidden in the snapshot
  const app = $('#app');
  if (app) app.classList.remove('hidden');

  // Reset so home sections re-render (picks up any newly synced profile data)
  state.homeLoaded = false;

  if (appInitialized) {
    updateGreeting?.();
    loadHome?.();
  } else {
    init?.();
  }
});

// ===== Firebase Auth & Cloud Sync Module =====
// This is an additive layer that wraps the existing app logic.
// It does NOT break any existing features — it simply adds an auth gate
// and syncs user data to Firestore in the background.
(function initFirebaseSync() {
  // --- Constants ---
  const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
  const LAST_SYNC_KEY = 'raagam_last_cloud_sync';

  // --- Auth Dialog Elements ---
  const authDialog = document.getElementById('auth-dialog');
  const authGoogleBtn = document.getElementById('auth-google-btn');
  const authErrorMsg = document.getElementById('auth-error-msg');

  // --- Show / Hide Auth Dialog ---
  function showAuthDialog() {
    if (authDialog) authDialog.classList.remove('hidden');
  }
  function hideAuthDialog() {
    if (authDialog) authDialog.classList.add('hidden');
  }

  // --- Google Sign-in Button ---
  if (authGoogleBtn) {
    authGoogleBtn.addEventListener('click', async () => {
      if (!window.raagamFirebase) {
        if (authErrorMsg) authErrorMsg.textContent = 'Firebase not ready. Please refresh.';
        return;
      }

      // Capture name / phone / language from the unified onboarding form
      const nameInput = document.getElementById('user-name');
      const phoneInput = document.getElementById('user-phone');
      const langInput = document.getElementById('user-language');

      const enteredName = nameInput?.value.trim() || '';
      const enteredPhone = phoneInput?.value.trim() || '';
      const enteredLang = langInput?.value || 'hindi';

      // Persist name+phone into profile immediately so init() doesn't re-prompt
      const chosenName = enteredName || 'Music Lover';
      CONFIG.userProfile = { name: chosenName, phone: enteredPhone };
      localStorage.setItem('raagam_profile', JSON.stringify(CONFIG.userProfile));
      state.userProfile = CONFIG.userProfile;

      // Persist language preference
      CONFIG.preferredLanguage = enteredLang;
      localStorage.setItem('raagam_language', enteredLang);
      localStorage.setItem('raagam_language_setup', 'true');
      state.languageSetupComplete = true;

      authGoogleBtn.disabled = true;
      authGoogleBtn.innerHTML = '<span style="opacity:0.7">Signing in...</span>';
      if (authErrorMsg) authErrorMsg.textContent = '';
      try {
        await window.raagamFirebase.signIn();
        // onAuthStateChanged listener takes it from here — will override name with Google display name
      } catch (err) {
        console.error('[Auth] Google sign-in failed:', err);
        if (authErrorMsg) authErrorMsg.textContent = 'Sign-in failed. Please try again.';
        authGoogleBtn.disabled = false;
        authGoogleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)"><path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/><path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/><path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/><path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/></g></svg> Continue with Google`;
      }
    });
  }

  // --- Auth State Observer ---
  // Waits for Firebase to be ready, then listens for auth state changes.
  function waitForFirebaseAndListen() {
    if (window.raagamFirebase) {
      startAuthListener();
      return;
    }
    // Firebase module loads asynchronously — poll until ready
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (window.raagamFirebase) {
        clearInterval(poll);
        startAuthListener();
      } else if (attempts > 40) {
        // Firebase failed to load after 10 seconds — allow app to run anyway
        clearInterval(poll);
        console.warn('[Firebase] Could not initialize — running without cloud sync');
        hideAuthDialog();
      }
    }, 250);
  }

  function startAuthListener() {
    // Listen for auth state changes dispatched by firebase-config.js
    window.addEventListener('raagam:auth-changed', async (e) => {
      const user = e.detail?.user;
      if (user) {
        // === User is signed in ===
        console.log('[Auth] Signed in as:', user.email || user.phoneNumber);
        hideAuthDialog();

        // Store uid in state for use across the app
        state.firebaseUid = user.uid;
        state.firebaseUser = { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL };

        // Update profile name if available from Google account
        if (user.displayName && (!state.userProfile || !state.userProfile.name || state.userProfile.name === 'Music Lover')) {
          if (!state.userProfile) state.userProfile = {};
          state.userProfile.name = user.displayName;
          localStorage.setItem('raagam_profile', JSON.stringify(state.userProfile));
        }

        // Update the Settings account section
        const accountSection = document.getElementById('firebase-account-section');
        const userLabel = document.getElementById('firebase-user-label');
        if (accountSection) accountSection.style.display = '';
        if (userLabel) userLabel.textContent = user.displayName || user.email || 'Signed In';

        // Load cloud data (if any) then decide whether to sync local -> cloud
        await loadCloudData(user.uid);

        // Schedule background sync every 12 hours
        scheduleBatchSync(user.uid);

      } else {
        // === User is signed out ===
        console.log('[Auth] User signed out — showing auth dialog');
        state.firebaseUid = null;
        state.firebaseUser = null;

        // Hide the Settings account section
        const accountSection = document.getElementById('firebase-account-section');
        if (accountSection) accountSection.style.display = 'none';

        showAuthDialog();
      }
    });
  }

  // --- Load data from Firestore into state ---
  async function loadCloudData(uid) {
    try {
      const cloudData = await window.raagamFirebase.getProfile(uid);
      if (!cloudData) {
        // First-time user — push local data to cloud immediately
        console.log('[Sync] No cloud data found — uploading local data');
        await syncToCloud(uid);
        return;
      }

      // Merge cloud data carefully (cloud wins on newer timestamps, else keep local)
      const cloudTs = cloudData.lastSyncedAt || 0;
      const localTs = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');

      if (cloudTs > localTs) {
        console.log('[Sync] Cloud data is newer — loading from cloud');
        if (Array.isArray(cloudData.liked) && cloudData.liked.length > 0) {
          state.liked = cloudData.liked;
          localStorage.setItem('raagam_liked', JSON.stringify(state.liked));
        }
        if (Array.isArray(cloudData.history) && cloudData.history.length > 0) {
          state.history = cloudData.history.slice(0, 500); // cap at 500
          localStorage.setItem('raagam_history', JSON.stringify(state.history));
        }
        if (Array.isArray(cloudData.playlists) && cloudData.playlists.length > 0) {
          state.playlists = cloudData.playlists;
          localStorage.setItem('raagam_playlists', JSON.stringify(state.playlists));
        }
        if (cloudData.preferredLanguage) {
          CONFIG.preferredLanguage = cloudData.preferredLanguage;
          localStorage.setItem('raagam_language', cloudData.preferredLanguage);
        }
        showToast('✅ Profile synced from cloud');
      } else {
        // Local is newer or same — sync local to cloud as source of truth
        await syncToCloud(uid);
      }
    } catch (err) {
      console.warn('[Sync] Could not load cloud data:', err);
    }
  }

  // --- Push local data up to Firestore ---
  async function syncToCloud(uid) {
    if (!window.raagamFirebase || !uid) return;
    try {
      const payload = {
        liked: state.liked || [],
        history: (state.history || []).slice(0, 500), // keep last 500
        playlists: state.playlists || [],
        preferredLanguage: CONFIG.preferredLanguage || 'hindi',
        userProfile: state.userProfile || {},
        lastSyncedAt: Date.now()
      };
      await window.raagamFirebase.saveProfile(uid, payload);
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      console.log('[Sync] Data synced to cloud at', new Date().toLocaleTimeString());
    } catch (err) {
      console.warn('[Sync] Upload failed:', err);
    }
  }

  // --- Schedule automatic 12-hour batch sync ---
  function scheduleBatchSync(uid) {
    // Do an immediate sync on login
    syncToCloud(uid);

    // Schedule every 12 hours
    setInterval(() => {
      console.log('[Sync] Running scheduled 12-hour cloud sync');
      syncToCloud(uid);
    }, SYNC_INTERVAL_MS);

    // Also sync when page is about to close
    window.addEventListener('beforeunload', () => syncToCloud(uid));
  }

  // --- Expose reset function to Settings ---
  // Called by the "Reset Profile Data" button added to Settings
  window.resetCloudProfile = async function () {
    const uid = state.firebaseUid;
    if (!uid || !window.raagamFirebase) {
      showToast('❌ Not signed in — cannot reset cloud profile');
      return;
    }
    try {
      // Clear local state
      state.liked = [];
      state.history = [];
      state.recent = [];
      state.playlists = [];
      localStorage.removeItem('raagam_liked');
      localStorage.removeItem('raagam_history');
      localStorage.removeItem('raagam_playlists');
      localStorage.removeItem(LAST_SYNC_KEY);

      // Clear cloud data
      await window.raagamFirebase.saveProfile(uid, {
        liked: [],
        history: [],
        playlists: [],
        lastSyncedAt: Date.now(),
        profileReset: true
      });

      // Refresh UI
      renderLibrary?.();
      renderRecentRow?.();
      showToast('🗑️ Profile data reset successfully');
    } catch (err) {
      console.error('[Reset] Failed to reset profile:', err);
      showToast('❌ Reset failed — please try again');
    }
  };

  // --- Sign-out helper ---
  window.signOutFirebase = async function () {
    if (!window.raagamFirebase) return;
    try {
      await window.raagamFirebase.signOut();
      showToast('Signed out');
    } catch (err) {
      console.error('[Auth] Sign-out failed:', err);
    }
  };

  // --- Kick everything off after DOM is ready ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForFirebaseAndListen);
  } else {
    waitForFirebaseAndListen();
  }

})(); // end initFirebaseSync IIFE

// ===== AI PERSONALIZED RECOMMENDATIONS ENGINE =====
(function initAIRecommendations() {
  const CACHE_KEY = 'raagam_ai_recs';
  const CACHE_TS_KEY = 'raagam_ai_recs_ts';
  const REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours

  // ── Wait for app to be ready ──────────────────────────────────────────
  function waitAndStart() {
    if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
      document.addEventListener('DOMContentLoaded', tryLoad);
    } else {
      setTimeout(tryLoad, 1500); // small delay so app.js history loads first
    }
  }

  function tryLoad() {
    const cached = loadCache();
    if (cached) {
      renderAIPicks(cached);
    }
    // Check if 24hrs passed → refresh silently in background
    const lastTs = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0');
    if (Date.now() - lastTs > REFRESH_MS) {
      generateRecs();
    }
    wireButtons();
  }

  // ── Cache helpers ─────────────────────────────────────────────────────
  function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
  }
  function saveCache(data) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  }

  // ── Wire "Get New" / "✨ New" buttons ─────────────────────────────────
  function wireButtons() {
    const homeBtn = document.getElementById('ai-picks-refresh-btn');
    const libBtn = document.getElementById('ai-picks-library-refresh');
    [homeBtn, libBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', (e) => {
        e.stopPropagation();
        generateRecs(true); // force fresh
      });
    });

    // Library card click → open the AI picks detail
    const libCard = document.getElementById('ai-picks-library-card');
    if (libCard) libCard.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const cached = loadCache();
      if (cached && cached.resolvedTracks && cached.resolvedTracks.length > 0) {
        openAIPicksDetail(cached);
      }
    });
  }

  // ── Generate fresh recommendations via AI worker ──────────────────────
  function generateRecs(forced = false) {
    if (!CONFIG.aiApiKey) return; // No API key configured
    if (!window.aiWorker && typeof initAIWorker === 'function') initAIWorker();
    if (!window.aiWorker) return;

    const history = (state.history || []).slice(0, 30);
    const liked = (state.liked || []).slice(0, 20);
    const language = CONFIG.preferredLanguage || 'hindi';

    // Show loading state
    setLoadingState(true);

    window.aiWorker.postMessage({
      type: 'PERSONALIZED_RECS',
      payload: { history, likedSongs: liked, language },
      apiKey: CONFIG.aiApiKey
    });

    // Listen for response — attach once per request
    const onMsg = async (e) => {
      if (e.data.type === 'RECS_GENERATED') {
        window.aiWorker.removeEventListener('message', onMsg);
        const result = e.data.payload;
        if (!result || !Array.isArray(result.songs)) { setLoadingState(false); return; }
        // Resolve songs to playable tracks
        const resolvedTracks = await resolveSongs(result.songs);
        const fullData = { ...result, resolvedTracks, generatedAt: Date.now() };
        saveCache(fullData);
        setLoadingState(false);
        renderAIPicks(fullData);
      } else if (e.data.type === 'ERROR') {
        window.aiWorker.removeEventListener('message', onMsg);
        setLoadingState(false);
        console.warn('[AI Recs] Worker error:', e.data.payload);
      }
    };
    window.aiWorker.addEventListener('message', onMsg);
  }

  // ── Resolve song text → playable tracks via existing search ──────────
  async function resolveSongs(songs) {
    const resolved = [];
    for (const item of songs) {
      try {
        const results = await apiSearch(item.query || `${item.song} ${item.artist}`, 1);
        if (results && results.length > 0) {
          resolved.push({ ...results[0], _aiSong: item.song, _aiArtist: item.artist }); // keep AI meta
        }
      } catch { /* skip unresolvable tracks */ }
      if (resolved.length >= 10) break;
    }
    return resolved;
  }

  // ── Loading state ─────────────────────────────────────────────────────
  function setLoadingState(loading) {
    const homeBtn = document.getElementById('ai-picks-refresh-btn');
    const libBtn = document.getElementById('ai-picks-library-refresh');
    if (homeBtn) homeBtn.textContent = loading ? '⏳ Loading...' : '✨ Get New';
    if (libBtn) libBtn.textContent = loading ? '⏳' : '✨ New';
    const libCount = document.getElementById('ai-picks-library-count');
    if (loading && libCount) libCount.textContent = 'Asking Gemini...';
  }

  // ── Render picks on Home + update Library card ────────────────────────
  function renderAIPicks(data) {
    if (!data || !data.resolvedTracks || data.resolvedTracks.length === 0) return;

    const playlistName = data.playlistName || '✨ AI Picks for You';
    const tagline = data.tagline || '';
    const tracks = data.resolvedTracks;

    // ── Home section ──────────────────────────────────────────────────
    const homeSection = document.getElementById('section-ai-picks');
    const homeRow = document.getElementById('ai-picks-row');
    const titleEl = document.getElementById('ai-picks-section-title');
    const taglineEl = document.getElementById('ai-picks-tagline');

    if (homeSection && homeRow) {
      homeSection.style.display = '';
      if (titleEl) titleEl.textContent = `✨ ${playlistName}`;
      if (taglineEl) taglineEl.textContent = tagline;
      homeRow.innerHTML = '';
      tracks.forEach((track, i) => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.style.cssText = 'flex-shrink:0;width:140px;cursor:pointer;';
        const imgSrc = getImage(track, 'low') || '';
        card.innerHTML = `
          <div style="position:relative;width:140px;height:140px;border-radius:12px;overflow:hidden;background:#282828;margin-bottom:6px;">
            ${imgSrc ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;">🎵</div>'}
            <div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.7);border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
          <p style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;">${track.title || track.song || 'Unknown'}</p>
          <p style="font-size:11px;color:#b3b3b3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:2px 0 0;">${track.artist || 'Unknown'}</p>
        `;
        card.addEventListener('click', () => {
          const queue = [...tracks];
          state.queue = queue;
          state.queueIndex = i;
          playSong(track, false);
        });
        homeRow.appendChild(card);
      });
    }

    // ── Library card ─────────────────────────────────────────────────
    const libCard = document.getElementById('ai-picks-library-card');
    const libName = document.getElementById('ai-picks-library-name');
    const libCount = document.getElementById('ai-picks-library-count');
    if (libCard) {
      libCard.style.display = '';
      if (libName) libName.textContent = `✨ ${playlistName}`;
      if (libCount) libCount.textContent = `${tracks.length} song${tracks.length !== 1 ? 's' : ''} · AI curated`;
    }
  }

  // ── Full-screen detail when Library card is tapped ────────────────────
  function openAIPicksDetail(data) {
    const tracks = data.resolvedTracks;
    const listEl = document.getElementById('playlist-detail-list');
    if (!listEl) return;
    listEl.classList.remove('hidden');
    document.getElementById('liked-list')?.classList.add('hidden');
    document.getElementById('recent-list')?.classList.add('hidden');
    document.getElementById('history-list')?.classList.add('hidden');
    listEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'track-list-header';
    header.innerHTML = `
      <h3 style="background:linear-gradient(135deg,#7c3aed,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">✨ ${data.playlistName}</h3>
      <div style="display:flex;gap:8px;align-items:center;">
        <p style="font-size:12px;color:#b3b3b3;margin:2px 0;">${data.tagline || ''}</p>
        ${tracks.length > 0 ? '<button class="playlist-play-all" style="background:#1DB954;color:#000;border:none;border-radius:16px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">Play All</button>' : ''}
        <button class="back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          Close
        </button>
      </div>
    `;
    header.querySelector('.back-btn').addEventListener('click', () => listEl.classList.add('hidden'));
    const playAllBtn = header.querySelector('.playlist-play-all');
    if (playAllBtn) playAllBtn.addEventListener('click', () => {
      state.queue = [...tracks]; state.queueIndex = 0;
      playSong(tracks[0], false);
      showToast(`Playing ✨ ${data.playlistName}`);
    });
    listEl.appendChild(header);

    tracks.forEach((track, i) => {
      const row = document.createElement('div');
      row.className = 'track-item';
      row.style.cursor = 'pointer';
      const img = getImage(track, 'low');
      row.innerHTML = `
        <div class="track-num" style="color:#7c3aed;font-weight:700;">${i + 1}</div>
        ${img ? `<img class="track-art" src="${img}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;" loading="lazy"/>` : '<div class="track-art" style="width:40px;height:40px;border-radius:6px;background:#333;display:flex;align-items:center;justify-content:center;font-size:18px;">🎵</div>'}
        <div class="track-info">
          <p class="track-title">${track.title || track.song || 'Unknown'}</p>
          <p class="track-artist">${track.artist || 'Unknown'}</p>
        </div>
      `;
      row.addEventListener('click', () => {
        state.queue = [...tracks]; state.queueIndex = i;
        playSong(track, false);
      });
      listEl.appendChild(row);
    });
  }

  waitAndStart();
})(); // end initAIRecommendations IIFE
