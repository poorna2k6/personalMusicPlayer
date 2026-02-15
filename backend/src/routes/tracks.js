const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /api/tracks - List all tracks with optional filtering
router.get('/', (req, res) => {
  const db = getDb();
  const { artist, album, genre, search, sort = 'title', order = 'asc' } = req.query;

  let query = 'SELECT id, title, artist, album, duration, track_number, genre, year, file_path, file_name FROM tracks';
  const conditions = [];
  const params = [];

  if (artist) {
    conditions.push('artist = ?');
    params.push(artist);
  }
  if (album) {
    conditions.push('album = ?');
    params.push(album);
  }
  if (genre) {
    conditions.push('genre = ?');
    params.push(genre);
  }
  if (search) {
    conditions.push('(title LIKE ? OR artist LIKE ? OR album LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const allowedSorts = ['title', 'artist', 'album', 'duration', 'year', 'created_at'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'title';
  const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
  query += ` ORDER BY ${sortCol} ${sortOrder}`;

  const tracks = db.prepare(query).all(...params);
  res.json(tracks);
});

// GET /api/tracks/artists - List all unique artists
router.get('/artists', (req, res) => {
  const db = getDb();
  const artists = db.prepare(
    'SELECT artist, COUNT(*) as track_count FROM tracks GROUP BY artist ORDER BY artist ASC'
  ).all();
  res.json(artists);
});

// GET /api/tracks/albums - List all unique albums
router.get('/albums', (req, res) => {
  const db = getDb();
  const albums = db.prepare(
    'SELECT album, artist, COUNT(*) as track_count, MIN(cover_art) as cover_art FROM tracks GROUP BY album, artist ORDER BY album ASC'
  ).all();
  res.json(albums);
});

// GET /api/tracks/:id - Get a single track
router.get('/:id', (req, res) => {
  const db = getDb();
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.json(track);
});

// GET /api/tracks/:id/cover - Get cover art for a track
router.get('/:id/cover', (req, res) => {
  const db = getDb();
  const track = db.prepare('SELECT cover_art FROM tracks WHERE id = ?').get(req.params.id);
  if (!track || !track.cover_art) {
    return res.status(404).json({ error: 'No cover art available' });
  }
  // cover_art is stored as data URI, extract and send
  const matches = track.cover_art.match(/^data:(.+);base64,(.+)$/);
  if (matches) {
    const buffer = Buffer.from(matches[2], 'base64');
    res.set('Content-Type', matches[1]);
    res.send(buffer);
  } else {
    res.status(404).json({ error: 'Invalid cover art data' });
  }
});

module.exports = router;
