# Raagam v3.0 — Feature Plan

## Overview
Three major feature areas to transform Raagam from a streaming-only player into a resilient, intelligent, offline-capable music app. All changes are in `docs/` (index.html, style.css, app.js) — pure client-side, no build step.

---

## PHASE 1: Fault Tolerance & Resilience
_Must be done first — all other features depend on reliable API/network handling._

### 1A. Retry with Exponential Backoff
**File:** `app.js` — new `fetchWithRetry()` wrapper
- Wrap all `fetch()` calls in a retry helper
- 3 retries with exponential backoff: 1s → 2s → 4s
- Abort controller with 10s timeout per request
- Return cached result on total failure (if available)

### 1B. Multi-Server API Fallback
**File:** `app.js` — modify `apiSearch()` + new `apiFetch()`
- Maintain ordered list of API servers:
  1. `https://saavn.dev/api` (primary)
  2. `https://jiosaavn-api-privatecvc2.vercel.app` (mirror 1)
  3. `https://jiosaavn-api-2-harsh-bark.vercel.app` (mirror 2)
- If primary fails after retries, auto-switch to next server
- Remember last working server in localStorage (`raagam_active_api`)
- Health check on app startup: ping `/search/songs?query=test&limit=1` to pick fastest server
- Show toast when falling back: "Switched to backup server"

### 1C. Circuit Breaker Pattern
**File:** `app.js` — new `CircuitBreaker` class
- Track failure counts per API server
- States: CLOSED (normal) → OPEN (failing, skip calls) → HALF-OPEN (test one call)
- After 5 consecutive failures → OPEN for 30s → HALF-OPEN → test → CLOSED or OPEN again
- Prevents hammering a dead server

### 1D. Audio Stream Recovery
**File:** `app.js` — enhance audio event handlers
- On `audio.onerror`: retry loading the same URL once, then try lower quality
- On `audio.stalled` / `audio.waiting`: show buffering indicator in mini player + now playing
- If audio fails completely: try re-fetching track from API (URL may have expired), then skip to next
- Add buffering spinner overlay on album art in Now Playing

### 1E. Graceful Degradation UI
**File:** `index.html` + `style.css` + `app.js`
- Add offline detection: `navigator.onLine` + `online`/`offline` events
- When offline:
  - Show banner: "You're offline — playing downloaded songs"
  - Hide search, disable home feed refresh
  - Library tab shows only cached/downloaded tracks
  - Mini player still works for cached audio
- When back online: auto-refresh, dismiss banner
- Add connection status indicator in header (subtle dot)

### 1F. Error Boundary for Each Section
**File:** `app.js` — wrap each home section load independently
- If "Trending" section fails, don't break Telugu/Bollywood/Chill sections
- Each section gets its own try/catch with individual retry button
- "Tap to retry" on failed sections instead of blank space

---

## PHASE 2: Smart Recommendations Engine
_Local-first recommendation system using listening history patterns._

### 2A. Listening History Tracker
**File:** `app.js` — new `HistoryTracker` module
- Store enriched play events in localStorage (`raagam_history`):
  ```js
  {
    trackId, name, artist, album, language,
    playedAt (ISO timestamp),
    duration (seconds listened),
    completed (boolean — listened >80%),
    source: "search" | "recommendation" | "queue" | "home"
  }
  ```
- Cap at 500 entries, FIFO eviction
- Track in `playSong()`: record start; on `ended`/`pause`/track-change: record duration
- Aggregate stats stored separately (`raagam_stats`):
  ```js
  {
    topArtists: { "Artist Name": playCount },
    topLanguages: { "telugu": playCount },
    listenByHour: { "18": playCount },  // peak listening hours
    totalPlays: number,
    totalMinutes: number
  }
  ```

### 2B. Recommendation Algorithm (Client-Side)
**File:** `app.js` — new `Recommender` module
- **Input signals** (weighted scoring):
  - Top 5 artists (weight: 40%) → search `"{artist}" songs`
  - Top language (weight: 25%) → search `"latest {language} songs"`
  - Time-of-day mood (weight: 20%):
    - Morning (6-11): "morning melody calm"
    - Afternoon (12-16): "upbeat energy songs"
    - Evening (17-21): "evening chill romantic"
    - Night (22-5): "night lofi sleep"
  - Recently liked genres (weight: 15%) → search from liked songs' artists
- **Deduplication**: Filter out tracks already in recent 50 plays
- **Diversity**: Max 3 songs from same artist in any recommendation set
- **Refresh**: Regenerate recommendations every 30 minutes or on app open

### 2C. "For You" Home Section
**File:** `index.html` + `app.js`
- New section at TOP of home page (above Trending): "Made For You"
- Horizontal scroll row of 10-15 personalized songs
- Subtitle: "Based on your listening"
- Falls back to "Popular Songs" if no history (<10 plays)

### 2D. "Similar Songs" in Now Playing
**File:** `index.html` + `style.css` + `app.js`
- In Now Playing screen, add collapsible "Up Next — Similar" section below controls
- Auto-search: `"{current_artist}" OR "{current_album}"`
- Show 5 song suggestions (exclude current track)
- Tap to add to queue or play immediately
- Auto-queue: when queue is empty and song ends, auto-play from similar songs

### 2E. "Your Stats" in Library
**File:** `index.html` + `style.css` + `app.js`
- New card in Library: "Your Stats" with chart icon
- Shows:
  - Total listening time (hours/minutes)
  - Top 5 artists (with play counts)
  - Most played song
  - Favorite language
  - Peak listening hour
- Simple bar charts using CSS (no chart library)

---

## PHASE 3: Offline Cache & Download
_PWA with Service Worker, Cache API, and IndexedDB for true offline playback._

### 3A. Service Worker Registration
**File:** new `docs/sw.js` + `app.js` registration
- Register SW in `init()`:
  ```js
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
  ```
- **App Shell caching** (install event): cache `index.html`, `style.css`, `app.js`
- **Network-first strategy** for API calls (fetch from network, fall back to cache)
- **Cache-first strategy** for album art images (cache on first load)
- Version-based cache busting (`raagam-v3-shell`, `raagam-v3-images`)

### 3B. PWA Manifest
**File:** new `docs/manifest.json` + link in `index.html`
- App name: "Raagam"
- Icons (generate from SVG): 192x192, 512x512
- Theme color: #121212
- Background color: #121212
- Display: standalone
- Start URL: ./
- Add install prompt handling in app.js

### 3C. Audio Download Manager
**File:** `app.js` — new `DownloadManager` module
- **Download flow:**
  1. User taps download icon on any song (result item, now playing, queue)
  2. Fetch audio blob from downloadUrl
  3. Store in IndexedDB (`raagam-audio-store`):
     - Key: track ID
     - Value: `{ blob, metadata (name, artist, album, image, duration), downloadedAt }`
  4. Show progress toast: "Downloading... 45%"
  5. On complete: toast "Downloaded for offline"
- **IndexedDB schema:**
  ```
  Database: raagam-db
  ├── Store: tracks     (key: trackId → { metadata, downloadedAt })
  └── Store: audio      (key: trackId → { blob, mimeType, size })
  ```
- **Storage quota management:**
  - Check `navigator.storage.estimate()` before download
  - Warn if <100MB remaining
  - Setting: max cache size (default 500MB)
  - Auto-cleanup: remove least-recently-played downloads when over quota

### 3D. Offline Playback Integration
**File:** `app.js` — modify `playSong()` + `getAudioUrl()`
- Modified `getAudioUrl()` flow:
  1. Check IndexedDB for cached audio blob → use `URL.createObjectURL(blob)`
  2. If not cached → use streaming URL (current behavior)
  3. If offline + not cached → show "Not available offline" toast
- Downloaded songs show a checkmark badge on album art
- Mini player works fully offline for downloaded tracks

### 3E. Download Queue & Bulk Download
**File:** `app.js` + `index.html`
- Download queue: multiple songs can be queued for download
- Background downloading (one at a time to avoid bandwidth issues)
- "Download All" button on liked songs list
- Download progress indicator in Library tab
- Pause/resume/cancel individual downloads

### 3F. Downloads Tab in Library
**File:** `index.html` + `style.css` + `app.js`
- New Library card: "Downloads" with download icon
- Shows all downloaded songs with:
  - Song info + file size
  - Delete individual download button
  - Sort by: date downloaded, name, size
- Storage usage bar: "Using 234 MB of 500 MB"
- "Clear All Downloads" button with confirmation

### 3G. Smart Pre-caching
**File:** `app.js` — enhance `playNext` logic
- When a song starts playing, pre-fetch the next song in queue in background
- Cache album art for all search results automatically
- Pre-cache audio for top 3 recommendations (Wi-Fi only, using `navigator.connection.type`)

---

## FILE CHANGES SUMMARY

| File | Changes |
|------|---------|
| `docs/app.js` | Major: add RetryHelper, CircuitBreaker, HistoryTracker, Recommender, DownloadManager, SW registration, offline detection, audio recovery, buffering UI |
| `docs/index.html` | Add: "For You" section, buffering overlay, offline banner, download buttons, stats view, downloads library card, PWA manifest link, SW registration |
| `docs/style.css` | Add: buffering spinner, offline banner, download progress, stats charts, download badges, retry buttons, connection indicator |
| `docs/sw.js` | **New file**: Service Worker for app shell + image + API caching |
| `docs/manifest.json` | **New file**: PWA manifest with icons and theme |

---

## IMPLEMENTATION ORDER

1. **Phase 1** (Resilience) — ~1 session
   - 1A → 1B → 1C → 1D → 1E → 1F

2. **Phase 2** (Recommendations) — ~1 session
   - 2A → 2B → 2C → 2D → 2E

3. **Phase 3** (Offline/Downloads) — ~1 session
   - 3A → 3B → 3C → 3D → 3E → 3F → 3G

Each phase is independently valuable and deployable. Phase 1 is prerequisite for Phase 3 (offline mode depends on resilience layer). Phase 2 is independent and can be done in parallel.
