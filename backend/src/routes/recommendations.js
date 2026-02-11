const express = require('express');
const router = express.Router();
const youtube = require('../services/youtube');
const lastfm = require('../services/lastfm');

// Genre-based recommendations
const GENRES = [
  { tag: 'pop', label: 'Pop Hits', emoji: '🎵' },
  { tag: 'hip-hop', label: 'Hip-Hop', emoji: '🎤' },
  { tag: 'rock', label: 'Rock', emoji: '🎸' },
  { tag: 'electronic', label: 'Electronic', emoji: '🎧' },
  { tag: 'rnb', label: 'R&B Soul', emoji: '🎷' },
  { tag: 'indie', label: 'Indie', emoji: '🎼' },
  { tag: 'bollywood', label: 'Bollywood', emoji: '🎬' },
  { tag: 'latin', label: 'Latin', emoji: '💃' },
];

// Featured playlists / moods
const MOODS = [
  { query: 'chill lofi hip hop beats', label: 'Chill & Focus', color: '#6c63ff' },
  { query: 'workout gym motivation music 2024', label: 'Workout Energy', color: '#ff6b6b' },
  { query: 'happy feel good pop songs', label: 'Feel Good', color: '#ffd93d' },
  { query: 'late night drive music playlist', label: 'Night Drive', color: '#1a1a2e' },
  { query: 'romantic love songs acoustic', label: 'Love Songs', color: '#ff6b9d' },
  { query: 'throwback 90s 2000s hits nostalgia', label: '90s/2000s Throwback', color: '#4ecdc4' },
  { query: 'trending songs 2024 hits', label: 'Trending Now', color: '#45b7d1' },
  { query: 'bollywood hindi hits 2024', label: 'Bollywood Hits', color: '#f9ca24' },
];

// Get home page content
router.get('/home', async (req, res) => {
  try {
    const [topTracks, topArtists] = await Promise.allSettled([
      lastfm.getTopTracks(null, 15),
      lastfm.getTopArtists(12),
    ]);

    // Get a featured mood playlist
    const randomMood = MOODS[Math.floor(Math.random() * 3)]; // First 3 for trending
    const trendingSearch = await youtube.searchMusic('trending music 2024 hits', 10).catch(() => []);

    res.json({
      moods: MOODS,
      genres: GENRES,
      topTracks: topTracks.status === 'fulfilled' ? topTracks.value : [],
      topArtists: topArtists.status === 'fulfilled' ? topArtists.value : [],
      trending: trendingSearch.slice(0, 8),
      featuredMood: randomMood,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get tracks for a mood/genre
router.get('/mood/:query', async (req, res) => {
  try {
    const decodedQuery = decodeURIComponent(req.params.query);
    const tracks = await youtube.searchMusic(decodedQuery, 20);
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get similar tracks (for auto-play queue)
router.get('/similar', async (req, res) => {
  const { artist, track, videoId } = req.query;

  try {
    const results = await Promise.allSettled([
      artist && track ? lastfm.getSimilarTracks(artist, track, 10) : Promise.resolve([]),
      videoId ? youtube.getRelatedVideos(videoId) : Promise.resolve([]),
    ]);

    const lfmSimilar = results[0].status === 'fulfilled' ? results[0].value : [];
    const ytRelated = results[1].status === 'fulfilled' ? results[1].value : [];

    // If we have Last.fm similar, search YouTube for those tracks
    if (lfmSimilar.length > 0) {
      const ytResults = await Promise.allSettled(
        lfmSimilar.slice(0, 5).map((t) => youtube.searchMusic(`${t.artist} ${t.name}`, 1))
      );

      const lfmYtTracks = ytResults
        .filter((r) => r.status === 'fulfilled' && r.value.length > 0)
        .map((r) => r.value[0]);

      // Combine: Last.fm-sourced first, then YouTube related
      const combined = [...lfmYtTracks, ...ytRelated].slice(0, 15);
      return res.json(combined);
    }

    res.json(ytRelated.slice(0, 15));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Artist info + top tracks
router.get('/artist/:name', async (req, res) => {
  try {
    const artistName = decodeURIComponent(req.params.name);
    const [artistInfo, topTracks, similarArtists] = await Promise.allSettled([
      lastfm.getArtistInfo(artistName),
      youtube.searchMusic(`${artistName} best songs`, 15),
      lastfm.getSimilarArtists(artistName, 6),
    ]);

    res.json({
      info: artistInfo.status === 'fulfilled' ? artistInfo.value : null,
      tracks: topTracks.status === 'fulfilled' ? topTracks.value : [],
      similar: similarArtists.status === 'fulfilled' ? similarArtists.value : [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Genre top tracks
router.get('/genre/:tag', async (req, res) => {
  try {
    const tag = decodeURIComponent(req.params.tag);
    const [lfmTracks, ytTracks] = await Promise.allSettled([
      lastfm.getTagTopTracks(tag, 10),
      youtube.searchMusic(`best ${tag} music`, 10),
    ]);

    const lfm = lfmTracks.status === 'fulfilled' ? lfmTracks.value : [];
    const yt = ytTracks.status === 'fulfilled' ? ytTracks.value : [];

    // Prefer YouTube results (playable), enrich with Last.fm metadata
    const tracks = yt.map((t) => {
      const lfmMatch = lfm.find((m) => m.artist?.toLowerCase() === t.artist?.toLowerCase());
      return { ...t, lastfmImage: lfmMatch?.image };
    });

    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
