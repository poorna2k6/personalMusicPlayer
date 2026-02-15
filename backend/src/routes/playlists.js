const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

// GET /api/playlists - List all playlists
router.get('/', (req, res) => {
  const db = getDb();
  const playlists = db.prepare(`
    SELECT p.id, p.name, p.created_at, p.updated_at, COUNT(pt.id) as track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all();
  res.json(playlists);
});

// POST /api/playlists - Create a new playlist
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO playlists (id, name) VALUES (?, ?)').run(id, name.trim());
  res.status(201).json({ id, name: name.trim() });
});

// GET /api/playlists/:id - Get a playlist with its tracks
router.get('/:id', (req, res) => {
  const db = getDb();
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found' });
  }

  const tracks = db.prepare(`
    SELECT t.id, t.title, t.artist, t.album, t.duration, t.file_path, t.file_name, pt.position
    FROM playlist_tracks pt
    JOIN tracks t ON pt.track_id = t.id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `).all(req.params.id);

  res.json({ ...playlist, tracks });
});

// PUT /api/playlists/:id - Update playlist name
router.put('/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  const db = getDb();
  const result = db.prepare(
    "UPDATE playlists SET name = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name.trim(), req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  res.json({ id: req.params.id, name: name.trim() });
});

// DELETE /api/playlists/:id - Delete a playlist
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  res.json({ message: 'Playlist deleted' });
});

// POST /api/playlists/:id/tracks - Add a track to a playlist
router.post('/:id/tracks', (req, res) => {
  const { trackId } = req.body;
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }

  const db = getDb();
  const playlist = db.prepare('SELECT id FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found' });
  }

  const track = db.prepare('SELECT id FROM tracks WHERE id = ?').get(trackId);
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }

  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), 0) as max_pos FROM playlist_tracks WHERE playlist_id = ?'
  ).get(req.params.id);

  db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)'
  ).run(req.params.id, trackId, maxPos.max_pos + 1);

  db.prepare("UPDATE playlists SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);

  res.status(201).json({ message: 'Track added to playlist' });
});

// DELETE /api/playlists/:id/tracks/:trackId - Remove a track from a playlist
router.delete('/:id/tracks/:trackId', (req, res) => {
  const db = getDb();
  const result = db.prepare(
    'DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?'
  ).run(req.params.id, req.params.trackId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Track not found in playlist' });
  }

  db.prepare("UPDATE playlists SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ message: 'Track removed from playlist' });
});

module.exports = router;
