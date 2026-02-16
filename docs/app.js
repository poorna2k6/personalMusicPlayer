/* ===== Raagam — Spotify-Inspired Music Player ===== */

// ===== Config =====
const CONFIG = {
  apiBase: localStorage.getItem('raagam_api') || 'https://jiosaavn-api-privatecvc2.vercel.app',
  quality: parseInt(localStorage.getItem('raagam_quality') || '3'), // 0-4 index into downloadUrl array
  apiMirrors: [
    'https://jiosaavn-api-privatecvc2.vercel.app',
    'https://saavn-api.vercel.app',
    'https://jiosaavn-api-2.vercel.app',
    'https://saavn.dev/api'
  ],
  preferredLanguage: localStorage.getItem('raagam_language') || null,
  userProfile: JSON.parse(localStorage.getItem('raagam_profile') || 'null'),
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
  }
};

// ===== State =====
const state = {
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  shuffle: false,
  repeat: 'off', // off, all, one
  liked: JSON.parse(localStorage.getItem('raagam_liked') || '[]'),
  recent: JSON.parse(localStorage.getItem('raagam_recent') || '[]'),
  currentView: 'home',
  searchCache: {},
  homeLoaded: false,
  autoPlayMode: localStorage.getItem('raagam_autoPlay') !== 'false', // intelligent auto-play enabled by default
  playedTracks: [], // tracks played in current session for recommendations
  languageSetupComplete: localStorage.getItem('raagam_language_setup') === 'true',
  userProfile: CONFIG.userProfile,
  favoriteGenres: JSON.parse(localStorage.getItem('raagam_favorite_genres') || '[]'),
  listeningHistory: JSON.parse(localStorage.getItem('raagam_listening_history') || '[]')
};

// ===== Analytics & Tracking =====
const analytics = {
  sessionId: null,
  startTime: null,
  events: [],

  init() {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();

    // Track basic session info
    this.trackEvent('session_start', {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenSize: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      referrer: document.referrer,
      url: window.location.href
    });

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.trackEvent('visibility_change', {
        hidden: document.hidden,
        timestamp: Date.now()
      });
    });

    // Track before unload
    window.addEventListener('beforeunload', () => {
      this.trackEvent('session_end', {
        duration: Date.now() - this.startTime,
        totalEvents: this.events.length
      });
      this.sendAnalytics();
    });
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

    // Send events in batches of 10 or every 30 seconds
    if (this.events.length >= 10) {
      this.sendAnalytics();
    }
  },

  trackMusicAction(action, trackData = {}) {
    this.trackEvent('music_action', {
      action, // play, pause, next, prev, like, unlike, search, etc.
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

  sendAnalytics() {
    if (this.events.length === 0) return;

    // Send to backend analytics endpoint
    const backendUrl = 'http://localhost:8765/api/analytics'; // Update this to your backend URL

    fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        events: this.events
      })
    }).then(response => {
      if (response.ok) {
        console.log(`Sent ${this.events.length} analytics events to backend`);
      } else {
        console.warn('Analytics send failed:', response.status);
      }
    }).catch(err => {
      console.warn('Analytics send error:', err);
      // Fallback: store locally if backend is unavailable
      localStorage.setItem('pending_analytics', JSON.stringify(this.events));
    });

    // Clear sent events
    this.events = [];
  }
};

// ===== API =====
async function apiSearch(query, limit = 20) {
  const cacheKey = `${query}_${limit}`;
  if (state.searchCache[cacheKey]) return state.searchCache[cacheKey];

  // Try current API first, then fallbacks
  for (const apiUrl of CONFIG.apiMirrors) {
    try {
      console.log(`Trying API: ${apiUrl}`);

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const res = await fetch(`${apiUrl}/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`API ${apiUrl} returned ${res.status}, trying next...`);
        continue;
      }

      const json = await res.json();
      const results = json.data?.results || [];

      if (results.length > 0) {
        // If we used a different API than the current one, update the config
        if (apiUrl !== CONFIG.apiBase) {
          CONFIG.apiBase = apiUrl;
          localStorage.setItem('raagam_api', apiUrl);
          showToast(`Switched to working API: ${apiUrl.split('/')[2]}`);
          $('#api-server').value = apiUrl;
        }

        state.searchCache[cacheKey] = results;
        return results;
      }
    } catch (e) {
      console.warn(`API ${apiUrl} failed:`, e.message);
      continue;
    }
  }

  console.error('All APIs failed');
  showToast('All music APIs are currently unavailable');
  return [];
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
}

function addToRecent(track) {
  state.recent = state.recent.filter(t => t.id !== track.id);
  state.recent.unshift(track);
  if (state.recent.length > 50) state.recent = state.recent.slice(0, 50);
  localStorage.setItem('raagam_recent', JSON.stringify(state.recent));
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

  // Sort by score (highest first) and return top recommendations
  return scoredTracks
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRecommendations);
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

  // Same artist: medium-high weight
  if (getArtistName(track1) === getArtistName(track2)) {
    score += 40;
  }

  // Same album: medium weight (but lower than language/genre)
  if (getAlbumName(track1) === getAlbumName(track2)) {
    score += 20;
  }

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

  return score;
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
  div.innerHTML = `
    ${showArt ? `<div class="result-art"><img src="${getImage(track, 'low')}" alt="" loading="lazy" /></div>` : ''}
    <div class="result-info">
      <p class="result-title" ${isCurrent ? 'style="color:var(--accent)"' : ''}>${getTrackName(track)}</p>
      <p class="result-sub">${getArtistName(track)}${getAlbumName(track) ? ' · ' + getAlbumName(track) : ''}</p>
    </div>
    <div class="result-action">
      ${isCurrent ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></svg>' : ''}
    </div>
  `;
  div.addEventListener('click', () => playSong(track));
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

function renderLoader() {
  return '<div class="loader"><div class="spinner"></div></div>';
}

// ===== Home Page =====
async function loadHome() {
  if (state.homeLoaded) return;

  updateGreeting();

  // Quick picks from recent
  const quickPicks = $('#quick-picks');
  const recentForPicks = state.recent.slice(0, 6);
  if (recentForPicks.length > 0) {
    quickPicks.innerHTML = recentForPicks.map(t => `
      <div class="quick-card" data-id="${t.id}">
        <img src="${getImage(t, 'low')}" alt="" />
        <span>${getTrackName(t)}</span>
      </div>
    `).join('');
    quickPicks.querySelectorAll('.quick-card').forEach((card, i) => {
      card.addEventListener('click', () => playSong(recentForPicks[i]));
    });
  } else {
    quickPicks.innerHTML = '';
  }

  // Recently played section
  const recentRow = $('#recent-row');
  if (state.recent.length > 0) {
    recentRow.innerHTML = '';
    const recentTracks = state.recent.slice(0, 10); // Show last 10 played
    recentTracks.forEach(t => recentRow.appendChild(renderSongCard(t)));
  } else {
    recentRow.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:20px;text-align:center">Play some songs to see them here</p>';
  }

  // Load sections
  const sections = [
    { id: 'trending-row', query: 'trending telugu songs 2024' },
    { id: 'telugu-row', query: 'telugu hit songs latest' },
    { id: 'bollywood-row', query: 'bollywood top hits' },
    { id: 'chill-row', query: 'chill lofi relax' },
  ];

  sections.forEach(s => renderSkeletons($(`#${s.id}`)));

  const results = await Promise.all(sections.map(s => apiSearch(s.query, 15)));
  results.forEach((tracks, i) => {
    const container = $(`#${sections[i].id}`);
    container.innerHTML = '';
    if (tracks.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:20px">Could not load. Check your connection.</p>';
      return;
    }
    tracks.forEach(t => container.appendChild(renderSongCard(t)));
  });

  state.homeLoaded = true;
  console.log('Home loaded successfully');
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
      resultsContainer.querySelectorAll('.result-section-title, .result-item, .loader, .empty-state').forEach(e => e.remove());
      return;
    }

    categories.classList.add('hidden');
    searchDebounce = setTimeout(() => performSearch(q), 400);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    categories.classList.remove('hidden');
    resultsContainer.querySelectorAll('.result-section-title, .result-item, .loader, .empty-state').forEach(e => e.remove());
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
}

async function performSearch(query) {
  const resultsContainer = $('#search-results');
  const languageFilter = $('#search-language-filter').value;

  // Clear old results
  resultsContainer.querySelectorAll('.result-section-title, .result-item, .loader, .empty-state').forEach(e => e.remove());

  // Show loader
  const loader = document.createElement('div');
  loader.innerHTML = renderLoader();
  resultsContainer.appendChild(loader.firstElementChild);

  // If language filter is set, include it in search query
  let searchQuery = query;
  if (languageFilter) {
    const langData = CONFIG.supportedLanguages[languageFilter];
    if (langData) {
      searchQuery = `${query} ${langData.keywords[0]}`;
    }
  }

  const tracks = await apiSearch(searchQuery, 25);

  // Remove loader
  resultsContainer.querySelectorAll('.loader').forEach(e => e.remove());

  // Filter results by selected language if specified
  let filteredTracks = tracks;
  if (languageFilter) {
    filteredTracks = tracks.filter(track => detectLanguage(track) === languageFilter);
  }

  if (filteredTracks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      <p>No ${languageFilter ? CONFIG.supportedLanguages[languageFilter].name + ' ' : ''}results found for "${query}"</p>
    `;
    resultsContainer.appendChild(empty);
    return;
  }

  const title = document.createElement('p');
  title.className = 'result-section-title';
  title.textContent = languageFilter ? `${CONFIG.supportedLanguages[languageFilter].name} Songs` : 'Songs';
  resultsContainer.appendChild(title);

  filteredTracks.forEach(t => resultsContainer.appendChild(renderResultItem(t)));

  // Track search analytics
  analytics.trackSearch(query, filteredTracks.length, languageFilter);
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
  audio.play().then(() => {
    state.isPlaying = true;
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
    console.error('Playback error:', e);
    showToast('Could not play this track');
    analytics.trackMusicAction('play_error', { track: track.id, error: e.message });
  });

  addToRecent(track);
  updatePlayerUI();
  updateMiniPlayer();
  updateNowPlaying();
}

function togglePlay() {
  if (!state.currentTrack) return;
  if (audio.paused) {
    audio.play();
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
  if (state.queue.length === 0) {
    // If queue is empty and auto-play is enabled, get recommendations
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
        // Queue finished, try auto-play if enabled
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
  $('#np-artist').textContent = getArtistName(t);

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
    div.innerHTML = `
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
  }

  updateLibraryCounts();
}

// ===== Navigation =====
function switchView(view) {
  analytics.trackEvent('view_change', {
    fromView: state.currentView,
    toView: view
  });

  state.currentView = view;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');
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

// ===== Settings =====
function openSettings() {
  $('#settings-panel').classList.remove('hidden');
  $('#audio-quality').value = CONFIG.quality;
  $('#api-server').value = CONFIG.apiBase;
  $('#preferred-language').value = CONFIG.preferredLanguage || 'all';
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

  // Audio events
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('ended', playNext);
  audio.addEventListener('play', () => { state.isPlaying = true; updatePlayerUI(); });
  audio.addEventListener('pause', () => { state.isPlaying = false; updatePlayerUI(); });

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
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') playNext();
    if (e.code === 'ArrowLeft') playPrev();
  });

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
  const dialog = $('#profile-dialog');
  dialog.classList.remove('hidden');

  const form = $('#profile-form');
  const skipBtn = $('#skip-profile');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#user-name').value.trim();
    const phone = $('#user-phone').value.trim();

    if (name) {
      CONFIG.userProfile = { name, phone };
      localStorage.setItem('raagam_profile', JSON.stringify(CONFIG.userProfile));
      state.userProfile = CONFIG.userProfile;
      analytics.trackEvent('profile_created', { hasPhone: !!phone });
    }

    dialog.classList.add('hidden');
    init(); // Continue to next step
  });

  skipBtn.addEventListener('click', () => {
    dialog.classList.add('hidden');
    analytics.trackEvent('profile_skipped');
    init(); // Continue without profile
  });
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

function init() {
  console.log('init() called');
  console.log('userProfile:', state.userProfile);
  console.log('languageSetupComplete:', state.languageSetupComplete);

  // Check if profile is set up
  if (!state.userProfile) {
    console.log('Profile not set up, showing profile dialog');
    showProfileDialog();
    return;
  }

  // Check if language setup is needed
  if (!state.languageSetupComplete) {
    console.log('Language setup not complete, auto-setting to English');
    // For testing: auto-select English and skip dialog
    CONFIG.preferredLanguage = 'english';
    localStorage.setItem('raagam_language', 'english');
    localStorage.setItem('raagam_language_setup', 'true');
    state.languageSetupComplete = true;
    console.log('Language setup completed automatically for testing');
  }

  console.log('Showing app after splash');
  // Show app after splash
  setTimeout(() => {
    console.log('Removing hidden class from app');
    $('#app').classList.remove('hidden');
    $('#splash').addEventListener('animationend', () => $('#splash').remove());
    updateGreeting();
  }, 100);

  console.log('Setting up events, search, library, and loading home');
  setupEvents();
  setupSearch();
  setupLibrary();
  loadHome();
}

// Start the app
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded fired');
  analytics.init(); // Initialize analytics
  init();
});
