# Raagam — Feature Roadmap

## Implemented — Priority Batch 1 (Feb 2026)

| # | Feature | Status |
|---|---------|--------|
| P1 | **Skip Signal Learning** — downranks skipped artists/genres in recommendations | ✅ Done |
| P2 | **Smart DJ Mode** — main player button, auto-builds & refreshes queue | ✅ Done |
| P3 | **Energy / Vibe Arcs** — 7 vibes (Morning, Focus, Workout, Party, Chill, Romantic, Wind Down) | ✅ Done |
| P4 | **Gapless Playback** — pre-buffers next song at 25s remaining, zero gap | ✅ Done |
| P5 | **Volume Normalization** — Web Audio API DynamicsCompressor, consistent loudness | ✅ Done |
| P6 | **Time-of-Day Context** — autoplay recommendations aware of morning/afternoon/evening/night | ✅ Done |
| P7 | **Daily Mixes** — 5 mixes auto-generated daily on home screen | ✅ Done |

Hot Cues, Loops, and Auto DJ in the DJ mixer were already implemented in v3.2.

---

## Upcoming — Batch 2

### High Priority

- **Session Memory / Listen Percentage Tracking**
  Track what % of each song the user listened to. Songs skipped before 50% → stronger negative signal. Songs replayed → strong positive signal for similar content. Store per-session in `listeningHistory`.

- **"You Haven't Heard in a While" Section**
  Surface songs from `state.history` not played in 14+ days. Show on home screen as a "Rediscover" shelf.

- **Artist Deep Dive**
  "Play all by this artist" — auto-fetch artist's full discography from JioSaavn and queue in chronological or popularity order.

- **Collaborative Filtering via Replay Count**
  Songs replayed 2+ times in history → higher score multiplier when recommending similar content. Already have `state.history` data — just need aggregation logic.

### DJ Enhancements

- **FX Rack on Decks**
  Web Audio API effects per deck: Reverb (ConvolverNode), Echo (DelayNode), Filter Sweep (BiquadFilterNode). Tap icons on deck panel to enable.

- **Beat Sync / BPM-aware Auto-Fill**
  Infer energy level from genre (classical=low, dance/remix=high). Auto-Fill and Auto DJ prefer same-energy songs. Display energy bar on each deck.

- **DJ Session Recording**
  Auto-save the sequence of songs played in each DJ session as a named playlist. "DJ Set — Feb 18, 2026" saved to library.

### Discovery

- **Discover Weekly Playlist**
  Weekly auto-generated playlist. Algorithm: top artists from liked songs → find their songs you haven't heard → score and select top 20. Refreshes every Monday.

- **"Similar Artists" Radio**
  From artist profile page, one tap to get a radio of that artist + similar artists. Uses JioSaavn search to find related names.

- **Trending in Your Language** shelf on Home
  Separate from the existing trending row — a dedicated "Trending Telugu / Hindi / Tamil" section that refreshes more frequently.

### UX / Polish

- **Swipe Gestures on Mini Player**
  Swipe right = next track, swipe left = previous, swipe down = dismiss mini player.

- **Haptic Feedback**
  `navigator.vibrate()` on button presses (like/skip/play) for mobile tactile response.

- **Smart Volume per Song**
  Analyze each song's loudness with `AnalyserNode` and apply a per-song gain correction on top of the global normalization.

- **Car Mode UI**
  Full-screen simplified layout — giant album art, oversized play/pause, swipe gestures only. Activate from Settings.

- **Karaoke Mode**
  When JioSaavn has an instrumental version of a song, load it and display synchronized lyrics.

### Social / Backend

- **Sync Liked Songs Across Devices**
  Lightweight backend (Vercel serverless + Supabase) to sync liked songs and playlists using user's phone number as key.

- **Share DJ Mix as Link**
  Export current queue as a shareable URL. When recipient opens it, the songs auto-load into their Raagam session.

---

## Notes on Implementation

- All features should remain **clientside-only** unless explicitly requiring a backend
- Keep `app.js` as a single file for simplicity — use clearly labeled section comments
- All new settings should persist to `localStorage` following the `raagam_*` key convention
- Analytics events should be tracked for all new features using `analytics.trackFeatureUsage()`
- Test on mobile (Android Chrome, iOS Safari) before marking as done
