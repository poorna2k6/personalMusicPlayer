const express = require('express');
const router = express.Router();
const youtube = require('../services/youtube');
const lastfm = require('../services/lastfm');
const db = require('../db/database');

// Stream audio - main endpoint
router.get('/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const stream = youtube.getStream(videoId);

    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');

    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream failed' });
      }
    });

    req.on('close', () => {
      stream.destroy();
    });

    stream.pipe(res);
  } catch (err) {
    console.error('Stream setup error:', err.message);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

// Get track info
router.get('/info/:videoId', async (req, res) => {
  try {
    const info = await youtube.getInfo(req.params.videoId);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get related/up-next tracks
router.get('/related/:videoId', async (req, res) => {
  try {
    const related = await youtube.getRelatedVideos(req.params.videoId);
    res.json(related);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Track metadata from Last.fm
router.get('/metadata', async (req, res) => {
  const { artist, track } = req.query;
  if (!artist || !track) return res.status(400).json({ error: 'artist and track required' });

  try {
    const info = await lastfm.getTrackInfo(artist, track);
    res.json(info || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log recently played
router.post('/played', (req, res) => {
  const { videoId, title, artist, thumbnail, duration } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId required' });

  try {
    // Keep only last 50 entries
    const count = db.prepare('SELECT COUNT(*) as c FROM recently_played').get();
    if (count.c >= 50) {
      db.prepare('DELETE FROM recently_played WHERE id = (SELECT id FROM recently_played ORDER BY id ASC LIMIT 1)').run();
    }

    // Don't add duplicate if last played is same
    const last = db.prepare('SELECT video_id FROM recently_played ORDER BY id DESC LIMIT 1').get();
    if (last?.video_id !== videoId) {
      db.prepare(
        'INSERT INTO recently_played (video_id, title, artist, thumbnail, duration) VALUES (?, ?, ?, ?, ?)'
      ).run(videoId, title || '', artist || '', thumbnail || '', duration || 0);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recently played
router.get('/recently-played', (req, res) => {
  try {
    const rows = db
      .prepare('SELECT * FROM recently_played ORDER BY played_at DESC LIMIT 20')
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Like/unlike a song
router.post('/like', (req, res) => {
  const { videoId, title, artist, thumbnail, duration } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId required' });

  try {
    const existing = db.prepare('SELECT video_id FROM liked_songs WHERE video_id = ?').get(videoId);
    if (existing) {
      db.prepare('DELETE FROM liked_songs WHERE video_id = ?').run(videoId);
      res.json({ liked: false });
    } else {
      db.prepare(
        'INSERT INTO liked_songs (video_id, title, artist, thumbnail, duration) VALUES (?, ?, ?, ?, ?)'
      ).run(videoId, title || '', artist || '', thumbnail || '', duration || 0);
      res.json({ liked: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/liked', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM liked_songs ORDER BY liked_at DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/liked/:videoId', (req, res) => {
  try {
    const row = db.prepare('SELECT video_id FROM liked_songs WHERE video_id = ?').get(req.params.videoId);
    res.json({ liked: !!row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
