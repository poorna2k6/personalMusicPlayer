// Recommendation engine for smart auto-play
export function getRecommendedTracks(currentTrack, allTracks, playedTracks = [], maxRecommendations = 5) {
  if (!currentTrack || !allTracks.length) return [];

  const playedIds = new Set(playedTracks.map(t => t.id));
  const availableTracks = allTracks.filter(t => t.id !== currentTrack.id && !playedIds.has(t.id));

  if (availableTracks.length === 0) return [];

  // Calculate similarity scores for each track
  const scoredTracks = availableTracks.map(track => ({
    ...track,
    score: calculateSimilarityScore(currentTrack, track)
  }));

  // Sort by score (highest first) and return top recommendations
  return scoredTracks
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRecommendations);
}

function calculateSimilarityScore(track1, track2) {
  let score = 0;

  // Same artist: high weight
  if (track1.artist === track2.artist) {
    score += 50;
  }

  // Same album: very high weight
  if (track1.album === track2.album) {
    score += 40;
  }

  // Same genre: medium weight
  if (track1.genre === track2.genre) {
    score += 20;
  }

  // Similar year (within 5 years): small weight
  if (Math.abs((track1.year || 0) - (track2.year || 0)) <= 5) {
    score += 10;
  }

  // Telugu music specific: keyword matching in titles
  const teluguKeywords = [
    'prema', 'love', 'heart', 'jaan', 'pyar', 'song', 'melody', 'raaga',
    'telugu', 'tamil', 'hindi', 'bollywood', 'folk', 'classical',
    'dance', 'romantic', 'sad', 'happy', 'emotional'
  ];

  const title1Words = track1.title.toLowerCase().split(/\s+/);
  const title2Words = track2.title.toLowerCase().split(/\s+/);

  const commonWords = title1Words.filter(word =>
    title2Words.includes(word) && teluguKeywords.includes(word)
  );

  score += commonWords.length * 15;

  // Boost score for tracks with similar duration (within 2 minutes)
  if (Math.abs(track1.duration - track2.duration) <= 120) {
    score += 5;
  }

  return score;
}

// Get tracks that would make a good sequence
export function getSequentialRecommendations(currentTrack, allTracks, playedTracks = []) {
  const recommendations = getRecommendedTracks(currentTrack, allTracks, playedTracks, 10);

  // For Telugu music, try to create mood-based sequences
  const moodKeywords = {
    romantic: ['prema', 'love', 'jaan', 'pyar', 'romantic', 'heart'],
    folk: ['folk', 'telangana', 'traditional', 'dance', 'folk rhythms'],
    classical: ['classical', 'raaga', 'carnatic', 'hindustani', 'raagam'],
    devotional: ['devotional', 'bhakti', 'temple', 'god', 'spiritual']
  };

  const currentMood = detectMood(currentTrack);
  if (currentMood) {
    return recommendations.filter(track => detectMood(track) === currentMood).slice(0, 5);
  }

  return recommendations.slice(0, 5);
}

function detectMood(track) {
  const text = `${track.title} ${track.album} ${track.genre || ''}`.toLowerCase();

  if (text.includes('prema') || text.includes('love') || text.includes('romantic')) {
    return 'romantic';
  }
  if (text.includes('folk') || text.includes('traditional') || text.includes('dance')) {
    return 'folk';
  }
  if (text.includes('classical') || text.includes('raaga') || text.includes('carnatic')) {
    return 'classical';
  }
  if (text.includes('devotional') || text.includes('bhakti') || text.includes('spiritual')) {
    return 'devotional';
  }

  return null;
}