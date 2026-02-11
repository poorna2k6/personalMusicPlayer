const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

const get = async (method, params = {}) => {
  const apiKey = process.env.LASTFM_API_KEY;

  if (!apiKey || apiKey === 'your_lastfm_api_key_here') {
    return null; // Return null if no API key configured
  }

  const cacheKey = `lastfm:${method}:${JSON.stringify(params)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(BASE_URL, {
      params: {
        method,
        api_key: apiKey,
        format: 'json',
        ...params,
      },
      timeout: 5000,
    });

    cache.set(cacheKey, response.data);
    return response.data;
  } catch {
    return null;
  }
};

const getTrackInfo = async (artist, track) => {
  const data = await get('track.getInfo', { artist, track });
  if (!data?.track) return null;

  const t = data.track;
  return {
    name: t.name,
    artist: typeof t.artist === 'string' ? t.artist : t.artist?.name,
    album: t.album?.title,
    albumCover: t.album?.image?.slice(-1)[0]?.['#text'] || null,
    tags: t.toptags?.tag?.map((x) => x.name) || [],
    playcount: t.playcount,
    listeners: t.listeners,
    summary: t.wiki?.summary?.replace(/<[^>]+>/g, '').split('Read more')[0]?.trim() || null,
    similar: [],
  };
};

const getSimilarTracks = async (artist, track, limit = 10) => {
  const data = await get('track.getSimilar', { artist, track, limit });
  if (!data?.similartracks?.track) return [];

  return data.similartracks.track.map((t) => ({
    name: t.name,
    artist: t.artist?.name,
    playcount: t.playcount,
    match: t.match,
  }));
};

const getArtistInfo = async (artist) => {
  const data = await get('artist.getInfo', { artist });
  if (!data?.artist) return null;

  const a = data.artist;
  return {
    name: a.name,
    image: a.image?.slice(-1)[0]?.['#text'] || null,
    tags: a.tags?.tag?.map((t) => t.name) || [],
    bio: a.bio?.summary?.replace(/<[^>]+>/g, '').split('Read more')[0]?.trim() || null,
    listeners: a.stats?.listeners,
    playcount: a.stats?.playcount,
    similar: a.similar?.artist?.map((s) => s.name) || [],
  };
};

const getSimilarArtists = async (artist, limit = 10) => {
  const data = await get('artist.getSimilar', { artist, limit });
  if (!data?.similarartists?.artist) return [];

  return data.similarartists.artist.map((a) => ({
    name: a.name,
    image: a.image?.slice(-1)[0]?.['#text'] || null,
    match: a.match,
  }));
};

const getTopTracks = async (country = null, limit = 20) => {
  const params = { limit };
  if (country) params.country = country;

  const data = await get(country ? 'geo.getTopTracks' : 'chart.getTopTracks', params);
  const tracks = country ? data?.tracks?.track : data?.tracks?.track;
  if (!tracks) return getFallbackTracks();

  return tracks.map((t) => ({
    name: t.name,
    artist: t.artist?.name || t.artist,
    playcount: t.playcount,
    listeners: t.listeners,
    image: t.image?.slice(-1)[0]?.['#text'] || null,
  }));
};

const getTopArtists = async (limit = 20) => {
  const data = await get('chart.getTopArtists', { limit });
  if (!data?.artists?.artist) return getFallbackArtists();

  return data.artists.artist.map((a) => ({
    name: a.name,
    playcount: a.playcount,
    listeners: a.listeners,
    image: a.image?.slice(-1)[0]?.['#text'] || null,
  }));
};

const searchTrack = async (query, limit = 10) => {
  const data = await get('track.search', { track: query, limit });
  if (!data?.results?.trackmatches?.track) return [];

  return data.results.trackmatches.track.map((t) => ({
    name: t.name,
    artist: t.artist,
    listeners: t.listeners,
    image: t.image?.slice(-1)[0]?.['#text'] || null,
  }));
};

const getTagTopTracks = async (tag, limit = 20) => {
  const data = await get('tag.getTopTracks', { tag, limit });
  if (!data?.tracks?.track) return [];

  return data.tracks.track.map((t) => ({
    name: t.name,
    artist: t.artist?.name,
    image: t.image?.slice(-1)[0]?.['#text'] || null,
  }));
};

// Fallback data when API key not configured
const getFallbackTracks = () => [
  { name: 'Blinding Lights', artist: 'The Weeknd', playcount: '3000000000' },
  { name: 'Shape of You', artist: 'Ed Sheeran', playcount: '2800000000' },
  { name: 'Levitating', artist: 'Dua Lipa', playcount: '2000000000' },
  { name: 'Stay', artist: 'The Kid LAROI', playcount: '1800000000' },
  { name: 'Peaches', artist: 'Justin Bieber', playcount: '1700000000' },
  { name: 'good 4 u', artist: 'Olivia Rodrigo', playcount: '1600000000' },
  { name: 'Montero', artist: 'Lil Nas X', playcount: '1500000000' },
  { name: 'drivers license', artist: 'Olivia Rodrigo', playcount: '1400000000' },
  { name: 'Dynamite', artist: 'BTS', playcount: '1300000000' },
  { name: 'Watermelon Sugar', artist: 'Harry Styles', playcount: '1200000000' },
];

const getFallbackArtists = () => [
  { name: 'The Weeknd', listeners: '45000000' },
  { name: 'Ed Sheeran', listeners: '43000000' },
  { name: 'Dua Lipa', listeners: '40000000' },
  { name: 'Taylor Swift', listeners: '42000000' },
  { name: 'Drake', listeners: '41000000' },
  { name: 'Ariana Grande', listeners: '38000000' },
  { name: 'Post Malone', listeners: '37000000' },
  { name: 'Billie Eilish', listeners: '36000000' },
];

module.exports = {
  getTrackInfo,
  getSimilarTracks,
  getArtistInfo,
  getSimilarArtists,
  getTopTracks,
  getTopArtists,
  searchTrack,
  getTagTopTracks,
};
