require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const tracksRouter = require('./routes/tracks');
const playlistsRouter = require('./routes/playlists');
const { initDb } = require('./db');
const { scanLibrary } = require('./scanner');

const app = express();
const PORT = process.env.PORT || 4000;
const MUSIC_LIBRARY_PATH = process.env.MUSIC_LIBRARY_PATH || path.join(__dirname, '../../music');

app.use(cors());
app.use(express.json());

// Serve album art and audio files
app.use('/api/audio', express.static(MUSIC_LIBRARY_PATH));

// API routes
app.use('/api/tracks', tracksRouter);
app.use('/api/playlists', playlistsRouter);

// Scan endpoint
app.post('/api/scan', async (req, res) => {
  try {
    const count = await scanLibrary(MUSIC_LIBRARY_PATH);
    res.json({ message: `Scanned ${count} tracks` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize database and start server
initDb();
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Music library path: ${MUSIC_LIBRARY_PATH}`);

  // Auto-scan on startup
  scanLibrary(MUSIC_LIBRARY_PATH).then(count => {
    console.log(`Initial scan complete: ${count} tracks found`);
  }).catch(err => {
    console.error('Initial scan failed:', err.message);
  });
});
