const ytdl = require('ytdl-core');
const YouTubeSearch = require('youtube-sr').default;
const NodeCache = require('node-cache');

// Cache search results for 10 minutes
const searchCache = new NodeCache({ stdTTL: 600 });

const search = async (query, limit = 20) => {
  const cacheKey = `search:${query}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const results = await YouTubeSearch.search(query, {
    limit,
    type: 'video',
    safeSearch: false,
  });

  const tracks = results.map((r) => ({
    videoId: r.id,
    title: r.title,
    artist: r.channel?.name || 'Unknown Artist',
    thumbnail: r.thumbnail?.url || `https://img.youtube.com/vi/${r.id}/mqdefault.jpg`,
    duration: r.duration || 0,
    durationFormatted: formatDuration(r.duration),
  }));

  searchCache.set(cacheKey, tracks);
  return tracks;
};

const getInfo = async (videoId) => {
  const cacheKey = `info:${videoId}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
  const details = info.videoDetails;

  const result = {
    videoId: details.videoId,
    title: details.title,
    artist: details.author?.name || 'Unknown Artist',
    thumbnail: details.thumbnails?.slice(-1)[0]?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    duration: parseInt(details.lengthSeconds, 10),
    durationFormatted: formatDuration(parseInt(details.lengthSeconds, 10) * 1000),
    description: details.description,
  };

  searchCache.set(cacheKey, result, 3600);
  return result;
};

const getStreamUrl = async (videoId) => {
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);

  // Get best audio format
  const format = ytdl.chooseFormat(info.formats, {
    quality: 'highestaudio',
    filter: 'audioonly',
  });

  return {
    url: format.url,
    mimeType: format.mimeType,
    bitrate: format.audioBitrate,
  };
};

const getStream = (videoId) => {
  return ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
    quality: 'highestaudio',
    filter: 'audioonly',
    highWaterMark: 1 << 25, // 32MB buffer
  });
};

const searchMusic = async (query, limit = 20) => {
  // Append "music" to bias towards music results
  const musicQuery = query.includes('music') || query.includes('song') || query.includes('audio')
    ? query
    : `${query} music`;
  return search(musicQuery, limit);
};

const getRelatedVideos = async (videoId) => {
  const cacheKey = `related:${videoId}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
    const related = (info.related_videos || []).slice(0, 10).map((v) => ({
      videoId: v.id,
      title: v.title,
      artist: v.author?.name || 'Unknown Artist',
      thumbnail: v.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`,
      duration: v.length_seconds ? parseInt(v.length_seconds, 10) * 1000 : 0,
      durationFormatted: formatDuration((v.length_seconds || 0) * 1000),
    }));

    searchCache.set(cacheKey, related, 1800);
    return related;
  } catch {
    return [];
  }
};

const formatDuration = (ms) => {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

module.exports = { search, searchMusic, getInfo, getStreamUrl, getStream, getRelatedVideos };
