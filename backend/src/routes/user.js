const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function getTimeOfDay(hour) {
  if (hour < 5)  return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

// POST /api/user/history — record a track play with rich listening signals
router.post('/history', requireAuth, (req, res) => {
  const {
    trackId,
    playDuration = 0,
    completionPct = 0,
    skipped = false,
    timeOfDay,
  } = req.body;

  if (!trackId) return res.status(400).json({ error: 'Missing trackId' });

  const db = getDb();
  const track = db.prepare('SELECT id, genre, artist FROM tracks WHERE id = ?').get(trackId);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const tod = timeOfDay || getTimeOfDay(new Date().getHours());

  db.prepare(
    `INSERT INTO user_history (user_id, track_id, play_duration, completion_pct, skipped, time_of_day)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.user.userId, trackId, playDuration, completionPct, skipped ? 1 : 0, tod);

  // Update stored preference weights: completion-weighted delta
  // Full listen → +completionPct, skip → -0.5
  const delta = skipped ? -0.5 : completionPct;

  let prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.userId);
  if (!prefs) {
    db.prepare('INSERT INTO user_preferences (id, user_id) VALUES (?, ?)').run(uuidv4(), req.user.userId);
    prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.userId);
  }

  const genreWeights   = JSON.parse(prefs.genre_weights   || '{}');
  const artistWeights  = JSON.parse(prefs.artist_weights  || '{}');
  const skipCounts     = JSON.parse(prefs.skip_counts     || '{}');
  const timeAffinities = JSON.parse(prefs.time_affinities || '{}');

  if (track.genre)  genreWeights[track.genre]   = (genreWeights[track.genre]   || 0) + delta;
  if (track.artist) artistWeights[track.artist] = (artistWeights[track.artist] || 0) + delta;

  if (skipped && track.artist) {
    skipCounts[track.artist] = (skipCounts[track.artist] || 0) + 1;
  }

  // Time-of-day genre affinity
  if (track.genre) {
    if (!timeAffinities[tod]) timeAffinities[tod] = {};
    timeAffinities[tod][track.genre] = (timeAffinities[tod][track.genre] || 0) + delta;
  }

  db.prepare(
    `UPDATE user_preferences
     SET genre_weights = ?, artist_weights = ?, skip_counts = ?, time_affinities = ?, updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(
    JSON.stringify(genreWeights),
    JSON.stringify(artistWeights),
    JSON.stringify(skipCounts),
    JSON.stringify(timeAffinities),
    req.user.userId
  );

  res.json({ ok: true });
});

// GET /api/user/history — get user's play history
router.get('/history', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  const history = db
    .prepare(
      `SELECT t.*, uh.played_at
       FROM user_history uh
       JOIN tracks t ON t.id = uh.track_id
       WHERE uh.user_id = ?
       ORDER BY uh.played_at DESC
       LIMIT ?`
    )
    .all(req.user.userId, limit);

  res.json(history);
});

// GET /api/user/recommendations — Spotify-style personalized recommendations
// Algorithm: heat score (completion × recency decay) + skip penalties + time-of-day + discovery injection
router.get('/recommendations', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  // --- Compute decayed heat scores from raw history ---
  // Recency decay buckets: today=1.0, this week=0.7, this month=0.4, older=0.1
  // Avoids relying on EXP() for cross-SQLite-version compatibility.
  const artistHeat = db.prepare(`
    SELECT
      t.artist,
      SUM(
        COALESCE(h.completion_pct, 0.5) *
        CASE
          WHEN julianday('now') - julianday(h.played_at) <= 1  THEN 1.0
          WHEN julianday('now') - julianday(h.played_at) <= 7  THEN 0.7
          WHEN julianday('now') - julianday(h.played_at) <= 30 THEN 0.4
          ELSE 0.1
        END
      ) AS heat_score,
      SUM(CASE WHEN h.skipped = 1 THEN 1.0 ELSE 0.0 END) * 1.0 / COUNT(*) AS skip_rate,
      COUNT(*) AS play_count
    FROM user_history h
    JOIN tracks t ON t.id = h.track_id
    WHERE h.user_id = ?
    GROUP BY t.artist
    ORDER BY heat_score DESC
    LIMIT 12
  `).all(req.user.userId);

  const genreHeat = db.prepare(`
    SELECT
      t.genre,
      SUM(
        COALESCE(h.completion_pct, 0.5) *
        CASE
          WHEN julianday('now') - julianday(h.played_at) <= 1  THEN 1.0
          WHEN julianday('now') - julianday(h.played_at) <= 7  THEN 0.7
          WHEN julianday('now') - julianday(h.played_at) <= 30 THEN 0.4
          ELSE 0.1
        END
      ) AS heat_score,
      COUNT(*) AS play_count
    FROM user_history h
    JOIN tracks t ON t.id = h.track_id
    WHERE h.user_id = ? AND t.genre IS NOT NULL
    GROUP BY t.genre
    ORDER BY heat_score DESC
    LIMIT 6
  `).all(req.user.userId);

  // No listening history yet → random tracks
  if (artistHeat.length === 0 && genreHeat.length === 0) {
    return res.json(db.prepare('SELECT * FROM tracks ORDER BY RANDOM() LIMIT ?').all(limit));
  }

  // --- Time-of-day context ---
  const tod = getTimeOfDay(new Date().getHours());
  const timeGenres = db.prepare(`
    SELECT t.genre, COUNT(*) AS cnt
    FROM user_history h
    JOIN tracks t ON t.id = h.track_id
    WHERE h.user_id = ? AND h.time_of_day = ? AND h.skipped = 0 AND t.genre IS NOT NULL
    GROUP BY t.genre
    ORDER BY cnt DESC
    LIMIT 3
  `).all(req.user.userId, tod).map(r => r.genre);

  // --- Exclude recently played ---
  const totalTracks = db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n;
  const recentLimit = totalTracks > 200 ? 50 : 30;
  const recentIds = db.prepare(
    `SELECT DISTINCT track_id FROM user_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?`
  ).all(req.user.userId, recentLimit).map(r => r.track_id);

  // Artists with high skip rate (>50%, played >2 times) → exclude from recommendations
  const skippyArtists = new Set(
    artistHeat.filter(a => a.skip_rate > 0.5 && a.play_count > 2).map(a => a.artist)
  );

  const topArtists = artistHeat
    .filter(a => !skippyArtists.has(a.artist))
    .slice(0, 5)
    .map(a => a.artist);

  // Combine time-of-day genres with heat-scored genres (time-of-day first for context)
  const topGenres = [...new Set([...timeGenres, ...genreHeat.map(g => g.genre)])].slice(0, 4);

  // Helper: build NOT IN clause
  function notIn(ids) {
    return ids.length > 0 ? `AND id NOT IN (${ids.map(() => '?').join(',')})` : '';
  }

  let recommended = [];

  // 65% — top-artist tracks (the "taste profile" bucket)
  const artistSlot = Math.ceil(limit * 0.65);
  if (topArtists.length > 0) {
    const ap = topArtists.map(() => '?').join(',');
    const q = `SELECT * FROM tracks WHERE artist IN (${ap}) ${notIn(recentIds)} ORDER BY RANDOM() LIMIT ?`;
    recommended = db.prepare(q).all(...topArtists, ...recentIds, artistSlot);
  }

  // 20% — genre-based (time-of-day aware)
  const genreSlot = Math.ceil(limit * 0.2);
  if (topGenres.length > 0 && recommended.length < limit) {
    const exclude = [...recommended.map(t => t.id), ...recentIds];
    const gp = topGenres.map(() => '?').join(',');
    const q = `SELECT * FROM tracks WHERE genre IN (${gp}) ${notIn(exclude)} ORDER BY RANDOM() LIMIT ?`;
    const genreTracks = db.prepare(q).all(...topGenres, ...exclude, genreSlot);
    recommended = [...recommended, ...genreTracks];
  }

  // 15% — discovery: tracks by artists the user hasn't heard yet
  const discoverySlot = limit - recommended.length;
  if (discoverySlot > 0) {
    const knownArtists = artistHeat.map(a => a.artist);
    const exclude = [...recommended.map(t => t.id), ...recentIds];
    const q = knownArtists.length > 0
      ? `SELECT * FROM tracks WHERE artist NOT IN (${knownArtists.map(() => '?').join(',')}) ${notIn(exclude)} ORDER BY RANDOM() LIMIT ?`
      : `SELECT * FROM tracks ${notIn(exclude).replace('AND ', 'WHERE ')} ORDER BY RANDOM() LIMIT ?`;
    const args = knownArtists.length > 0
      ? [...knownArtists, ...exclude, discoverySlot]
      : [...exclude, discoverySlot];
    recommended = [...recommended, ...db.prepare(q).all(...args)];
  }

  // Shuffle final list so the buckets aren't visually obvious
  for (let i = recommended.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [recommended[i], recommended[j]] = [recommended[j], recommended[i]];
  }

  res.json(recommended);
});

module.exports = router;
