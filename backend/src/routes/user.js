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

// POST /api/user/history — record a track play
router.post('/history', requireAuth, (req, res) => {
  const { trackId } = req.body;
  if (!trackId) return res.status(400).json({ error: 'Missing trackId' });

  const db = getDb();
  const track = db.prepare('SELECT id, genre, artist FROM tracks WHERE id = ?').get(trackId);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  db.prepare('INSERT INTO user_history (user_id, track_id) VALUES (?, ?)').run(
    req.user.userId,
    trackId
  );

  // Update genre/artist preference weights
  let prefs = db
    .prepare('SELECT * FROM user_preferences WHERE user_id = ?')
    .get(req.user.userId);

  if (!prefs) {
    const prefId = uuidv4();
    db.prepare(
      'INSERT INTO user_preferences (id, user_id) VALUES (?, ?)'
    ).run(prefId, req.user.userId);
    prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.userId);
  }

  const genreWeights = JSON.parse(prefs.genre_weights || '{}');
  const artistWeights = JSON.parse(prefs.artist_weights || '{}');

  if (track.genre) {
    genreWeights[track.genre] = (genreWeights[track.genre] || 0) + 1;
  }
  if (track.artist) {
    artistWeights[track.artist] = (artistWeights[track.artist] || 0) + 1;
  }

  db.prepare(
    'UPDATE user_preferences SET genre_weights = ?, artist_weights = ?, updated_at = datetime("now") WHERE user_id = ?'
  ).run(JSON.stringify(genreWeights), JSON.stringify(artistWeights), req.user.userId);

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

// GET /api/user/recommendations — personalized recommendations based on listening history
router.get('/recommendations', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const prefs = db
    .prepare('SELECT * FROM user_preferences WHERE user_id = ?')
    .get(req.user.userId);

  if (!prefs) {
    // No preferences yet — return random tracks
    const tracks = db
      .prepare('SELECT * FROM tracks ORDER BY RANDOM() LIMIT ?')
      .all(limit);
    return res.json(tracks);
  }

  const artistWeights = JSON.parse(prefs.artist_weights || '{}');
  const genreWeights = JSON.parse(prefs.genre_weights || '{}');

  const topArtists = Object.entries(artistWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((e) => e[0]);

  const topGenres = Object.entries(genreWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((e) => e[0]);

  // Get recently played track IDs to avoid repeating them
  const recentPlayed = db
    .prepare(
      `SELECT DISTINCT track_id FROM user_history
       WHERE user_id = ?
       ORDER BY played_at DESC
       LIMIT 30`
    )
    .all(req.user.userId)
    .map((r) => r.track_id);

  let recommended = [];

  // Tracks by top artists
  if (topArtists.length > 0) {
    const placeholders = topArtists.map(() => '?').join(',');
    const excludePlaceholders =
      recentPlayed.length > 0 ? recentPlayed.map(() => '?').join(',') : null;
    const query = excludePlaceholders
      ? `SELECT * FROM tracks WHERE artist IN (${placeholders}) AND id NOT IN (${excludePlaceholders}) ORDER BY RANDOM() LIMIT ?`
      : `SELECT * FROM tracks WHERE artist IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`;
    const args = excludePlaceholders
      ? [...topArtists, ...recentPlayed, Math.ceil(limit * 0.6)]
      : [...topArtists, Math.ceil(limit * 0.6)];
    recommended = db.prepare(query).all(...args);
  }

  // Pad with genre-based recommendations
  if (recommended.length < limit && topGenres.length > 0) {
    const alreadyHave = [...recommended.map((t) => t.id), ...recentPlayed];
    const placeholders = topGenres.map(() => '?').join(',');
    const excludePlaceholders =
      alreadyHave.length > 0 ? alreadyHave.map(() => '?').join(',') : null;
    const needed = limit - recommended.length;
    const query = excludePlaceholders
      ? `SELECT * FROM tracks WHERE genre IN (${placeholders}) AND id NOT IN (${excludePlaceholders}) ORDER BY RANDOM() LIMIT ?`
      : `SELECT * FROM tracks WHERE genre IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`;
    const args = excludePlaceholders
      ? [...topGenres, ...alreadyHave, needed]
      : [...topGenres, needed];
    const genreTracks = db.prepare(query).all(...args);
    recommended = [...recommended, ...genreTracks];
  }

  // Fill remainder with random tracks
  if (recommended.length < limit) {
    const alreadyHave = recommended.map((t) => t.id);
    const needed = limit - recommended.length;
    const excludePlaceholders =
      alreadyHave.length > 0 ? alreadyHave.map(() => '?').join(',') : null;
    const query = excludePlaceholders
      ? `SELECT * FROM tracks WHERE id NOT IN (${excludePlaceholders}) ORDER BY RANDOM() LIMIT ?`
      : `SELECT * FROM tracks ORDER BY RANDOM() LIMIT ?`;
    const args = excludePlaceholders ? [...alreadyHave, needed] : [needed];
    const randomTracks = db.prepare(query).all(...args);
    recommended = [...recommended, ...randomTracks];
  }

  res.json(recommended);
});

module.exports = router;
