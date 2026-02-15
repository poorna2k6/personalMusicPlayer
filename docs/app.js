/* ===== Raagam — Spotify-Inspired Music Player ===== */

// ===== Config =====
const CONFIG = {
  apiBase: localStorage.getItem('raagam_api') || 'https://saavn.dev/api',
  quality: parseInt(localStorage.getItem('raagam_quality') || '3'), // 0-4 index into downloadUrl array
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
};

// ===== DOM =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const audio = $('#audio');

// ===== API =====
async function apiSearch(query, limit = 20) {
  const cacheKey = `${query}_${limit}`;
  if (state.searchCache[cacheKey]) return state.searchCache[cacheKey];

  try {
    const res = await fetch(`${CONFIG.apiBase}/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`);
    const json = await res.json();
    const results = json.data?.results || [];
    state.searchCache[cacheKey] = results;
    return results;
  } catch (e) {
    console.error('API error:', e);
    return [];
  }
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
  if (idx >= 0) {
    state.liked.splice(idx, 1);
    showToast('Removed from Liked Songs');
  } else {
    state.liked.unshift(track);
    showToast('Added to Liked Songs');
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

  $('.header-title').textContent = getGreeting();

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
  // Clear old results
  resultsContainer.querySelectorAll('.result-section-title, .result-item, .loader, .empty-state').forEach(e => e.remove());

  // Show loader
  const loader = document.createElement('div');
  loader.innerHTML = renderLoader();
  resultsContainer.appendChild(loader.firstElementChild);

  const tracks = await apiSearch(query, 25);

  // Remove loader
  resultsContainer.querySelectorAll('.loader').forEach(e => e.remove());

  if (tracks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      <p>No results found for "${query}"</p>
    `;
    resultsContainer.appendChild(empty);
    return;
  }

  const title = document.createElement('p');
  title.className = 'result-section-title';
  title.textContent = 'Songs';
  resultsContainer.appendChild(title);

  tracks.forEach(t => resultsContainer.appendChild(renderResultItem(t)));
}

// ===== Player =====
function playSong(track, addToQueue = true) {
  const url = getAudioUrl(track);
  if (!url) {
    showToast('No audio available for this track');
    return;
  }

  state.currentTrack = track;

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
  }).catch(e => {
    console.error('Playback error:', e);
    showToast('Could not play this track');
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
  } else {
    audio.pause();
    state.isPlaying = false;
  }
  updatePlayerUI();
}

function playNext() {
  if (state.queue.length === 0) return;

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
      else { state.isPlaying = false; updatePlayerUI(); return; }
    }
  }

  state.queueIndex = nextIdx;
  playSong(state.queue[nextIdx], false);
}

function playPrev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  if (state.queue.length === 0) return;

  let prevIdx = state.queueIndex - 1;
  if (prevIdx < 0) prevIdx = state.repeat === 'all' ? state.queue.length - 1 : 0;

  state.queueIndex = prevIdx;
  playSong(state.queue[prevIdx], false);
}

function playFromQueue(index) {
  if (index >= 0 && index < state.queue.length) {
    state.queueIndex = index;
    playSong(state.queue[index], false);
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
  state.currentView = view;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

  // Update header
  if (view === 'home') {
    $('.header-title').textContent = getGreeting();
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

// ===== Init =====
function init() {
  // Show app after splash
  setTimeout(() => {
    $('#app').classList.remove('hidden');
    $('#splash').addEventListener('animationend', () => $('#splash').remove());
  }, 100);

  setupEvents();
  setupSearch();
  setupLibrary();
  loadHome();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
