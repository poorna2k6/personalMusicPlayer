const express = require('express');
const router = express.Router();
const youtube = require('../services/youtube');
const lastfm = require('../services/lastfm');
const db = require('../db/database');

// Main search endpoint
router.get('/', async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    // Save search history
    db.prepare('INSERT INTO search_history (query) VALUES (?)').run(q);

    // Search YouTube for music
    const [ytResults, lfmResults] = await Promise.allSettled([
      youtube.searchMusic(q, parseInt(limit)),
      lastfm.searchTrack(q, 5),
    ]);

    const tracks = ytResults.status === 'fulfilled' ? ytResults.value : [];
    const metadata = lfmResults.status === 'fulfilled' ? lfmResults.value : [];

    // Enrich with Last.fm data if available
    const enriched = tracks.map((t) => {
      const lfm = metadata.find(
        (m) => m.name?.toLowerCase() === t.title?.toLowerCase() ||
               m.artist?.toLowerCase() === t.artist?.toLowerCase()
      );
      return {
        ...t,
        albumCover: lfm?.image || t.thumbnail,
        lastfmListeners: lfm?.listeners,
      };
    });

    res.json({ tracks: enriched, total: enriched.length });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Search history
router.get('/history', (req, res) => {
  try {
    const rows = db
      .prepare('SELECT DISTINCT query, MAX(searched_at) as last_searched FROM search_history GROUP BY query ORDER BY last_searched DESC LIMIT 10')
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/history', (req, res) => {
  try {
    db.prepare('DELETE FROM search_history').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
