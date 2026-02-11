require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting - prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Stream endpoint gets separate higher limit
const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
});
app.use('/api/music/stream', streamLimiter);

// Routes
app.use('/api/music', require('./routes/music'));
app.use('/api/search', require('./routes/search'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/recommendations', require('./routes/recommendations'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasLastfmKey: !!(process.env.LASTFM_API_KEY && process.env.LASTFM_API_KEY !== 'your_lastfm_api_key_here'),
  });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🎵 Personal Music Player Backend running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  if (!process.env.LASTFM_API_KEY || process.env.LASTFM_API_KEY === 'your_lastfm_api_key_here') {
    console.log('\n   ⚠️  No Last.fm API key set. Add LASTFM_API_KEY to .env for better metadata.');
    console.log('   Get free key at: https://www.last.fm/api/account/create\n');
  }
});

module.exports = app;
