const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

// Get all playlists
router.get('/', (req, res) => {
  try {
    const playlists = db.prepare('SELECT * FROM playlists ORDER BY updated_at DESC').all();
    const withCounts = playlists.map((p) => {
      const count = db.prepare('SELECT COUNT(*) as c FROM playlist_tracks WHERE playlist_id = ?').get(p.id);
      return { ...p, trackCount: count.c };
    });
    res.json(withCounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create playlist
router.post('/', (req, res) => {
  const { name, description = '', cover_url = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  try {
    const id = uuidv4();
    db.prepare('INSERT INTO playlists (id, name, description, cover_url) VALUES (?, ?, ?, ?)').run(
      id, name, description, cover_url
    );
    res.json({ id, name, description, cover_url, trackCount: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single playlist with tracks
router.get('/:id', (req, res) => {
  try {
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const tracks = db
      .prepare('SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY added_at ASC')
      .all(req.params.id);

    res.json({ ...playlist, tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update playlist
router.put('/:id', (req, res) => {
  const { name, description, cover_url } = req.body;
  try {
    const existing = db.prepare('SELECT id FROM playlists WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Playlist not found' });

    db.prepare(
      'UPDATE playlists SET name = COALESCE(?, name), description = COALESCE(?, description), cover_url = COALESCE(?, cover_url), updated_at = unixepoch() WHERE id = ?'
    ).run(name, description, cover_url, req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete playlist
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add track to playlist
router.post('/:id/tracks', (req, res) => {
  const { videoId, title, artist, thumbnail, duration } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId required' });

  try {
    const playlist = db.prepare('SELECT id FROM playlists WHERE id = ?').get(req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    // Check if track already in playlist
    const existing = db.prepare(
      'SELECT id FROM playlist_tracks WHERE playlist_id = ? AND video_id = ?'
    ).get(req.params.id, videoId);

    if (existing) return res.status(409).json({ error: 'Track already in playlist' });

    const id = uuidv4();
    db.prepare(
      'INSERT INTO playlist_tracks (id, playlist_id, video_id, title, artist, thumbnail, duration) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.params.id, videoId, title || '', artist || '', thumbnail || '', duration || 0);

    db.prepare('UPDATE playlists SET updated_at = unixepoch() WHERE id = ?').run(req.params.id);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove track from playlist
router.delete('/:id/tracks/:trackId', (req, res) => {
  try {
    db.prepare('DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?').run(
      req.params.trackId, req.params.id
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
