# 🎵 Rythmix — Personal Music Player

> **Ad-free personal music streaming** inspired by Spotify, YouTube Music & JioSaavn.
> 100% free, self-hosted, intelligent recommendations, zero ads.

---

## How It's Free (No Ads, No Subscription)

| Feature | Source | Cost |
|---------|--------|------|
| Music Streaming | YouTube (via `ytdl-core`) | **Free** |
| Search | YouTube Search API | **Free** |
| Metadata & Tags | Last.fm API | **Free** (up to 5 req/sec) |
| Smart Recommendations | Last.fm Similar Tracks | **Free** |
| Artist Info & Bios | Last.fm | **Free** |
| Global Charts | Last.fm Charts API | **Free** |
| Storage | SQLite (local) | **Free** |
| Hosting | Your own machine / VPS | Your cost |

**No Spotify Premium needed. No YouTube Premium. No JioSaavn subscription.**

---

## Features

- **Spotify-like Dark UI** — Sidebar, player bar, expanded player, cards
- **Zero Ads** — Direct YouTube audio stream, no YouTube UI/ads
- **Intelligent Search** — YouTube search + Last.fm metadata enrichment
- **Smart Recommendations** — Last.fm similar tracks + YouTube related videos
- **Auto-Queue** — Auto-plays similar songs when queue ends
- **Mood Playlists** — Chill, Workout, Night Drive, Bollywood, Love Songs, etc.
- **Genre Browse** — Pop, Hip-Hop, Rock, Electronic, R&B, Indie, Bollywood, Latin
- **Artist Pages** — Bio, top songs, similar artists
- **Liked Songs** — Heart any track, auto-saved
- **Custom Playlists** — Create, rename, delete, add/remove tracks
- **Recently Played** — Auto-tracked listening history
- **Shuffle & Repeat** — All modes (off / repeat-all / repeat-one)
- **Volume Control** — Slider + mute
- **Seek Bar** — Click/drag to seek
- **Expanded Player** — Full-screen now-playing view

---

## Tech Stack

```
Frontend:  React 18 + Vite + Tailwind CSS
Backend:   Node.js + Express
Streaming: ytdl-core (YouTube audio, no ads)
Metadata:  Last.fm API (free)
Database:  SQLite (via better-sqlite3)
```

---

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- (Optional) Free Last.fm API key from https://www.last.fm/api/account/create

### 1. Install dependencies
```bash
npm install --prefix backend
npm install --prefix frontend
```

### 2. Configure environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env and add your Last.fm API key (optional but recommended)
```

### 3. Start development
```bash
# Terminal 1 — Backend
npm run dev --prefix backend

# Terminal 2 — Frontend
npm run dev --prefix frontend
```

Open http://localhost:3000

### 4. Production build
```bash
npm run build --prefix frontend
NODE_ENV=production npm start --prefix backend
# Visit http://localhost:4000
```

---

## Project Structure

```
personalMusicPlayer/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express server
│   │   ├── routes/
│   │   │   ├── music.js          # Stream, like, recently-played
│   │   │   ├── search.js         # Search + history
│   │   │   ├── playlists.js      # CRUD playlists
│   │   │   └── recommendations.js # Home, moods, similar tracks
│   │   ├── services/
│   │   │   ├── youtube.js        # ytdl-core streaming + search
│   │   │   └── lastfm.js         # Last.fm API client
│   │   └── db/
│   │       └── database.js       # SQLite schema
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Routes + layout
│   │   ├── context/
│   │   │   └── PlayerContext.jsx # Audio state machine
│   │   ├── components/
│   │   │   ├── Player/           # Bottom bar + expanded view
│   │   │   ├── Sidebar/          # Navigation
│   │   │   ├── Header/           # Top bar
│   │   │   └── Cards/            # Track, Mood, Artist cards
│   │   ├── pages/
│   │   │   ├── Home/             # Recommendations + moods
│   │   │   ├── Search/           # Search + browse
│   │   │   ├── Library/          # Playlists + liked
│   │   │   ├── Artist/           # Artist page
│   │   │   ├── Mood/             # Mood playlist page
│   │   │   └── Genre/            # Genre page
│   │   └── utils/
│   │       ├── api.js            # Axios client
│   │       └── format.js         # Time/number formatting
│   └── package.json
└── package.json                  # Root scripts
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/music/stream/:videoId` | Stream audio (no ads!) |
| GET | `/api/music/info/:videoId` | Track metadata |
| GET | `/api/music/related/:videoId` | Related tracks |
| POST | `/api/music/played` | Log played track |
| GET | `/api/music/recently-played` | History |
| POST | `/api/music/like` | Toggle like |
| GET | `/api/music/liked` | All liked songs |
| GET | `/api/search?q=query` | Search music |
| GET | `/api/search/history` | Search history |
| GET | `/api/playlists` | All playlists |
| POST | `/api/playlists` | Create playlist |
| GET | `/api/playlists/:id` | Playlist + tracks |
| POST | `/api/playlists/:id/tracks` | Add track |
| GET | `/api/recommendations/home` | Home page data |
| GET | `/api/recommendations/mood/:query` | Mood playlist |
| GET | `/api/recommendations/similar` | Similar tracks |
| GET | `/api/recommendations/artist/:name` | Artist page |
| GET | `/api/recommendations/genre/:tag` | Genre tracks |

---

## Legal Note

This app streams audio from YouTube for **personal, private use only**.
It does not download or redistribute copyrighted content.
Use responsibly and in accordance with YouTube's Terms of Service.
