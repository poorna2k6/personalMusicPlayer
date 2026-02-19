// Party DJ recommendation engine
// Goal: variety first, smooth transitions second — never the same artist back-to-back

const MOOD_MAP = {
  romantic: ['prema', 'love', 'jaan', 'pyar', 'romantic', 'heart', 'ishq', 'dil'],
  folk:     ['folk', 'telangana', 'traditional', 'dance', 'janapadha', 'paata'],
  classical: ['classical', 'raaga', 'carnatic', 'hindustani', 'swaraalu'],
  devotional: ['devotional', 'bhakti', 'temple', 'god', 'spiritual', 'mantra'],
  party:    ['party', 'dance', 'beat', 'club', 'remix', 'dj'],
  sad:      ['sad', 'cry', 'tears', 'pain', 'broken', 'farewell'],
};

// Moods that can transition into each other smoothly
const MOOD_TRANSITIONS = {
  romantic: ['romantic', 'sad', 'classical'],
  folk:     ['folk', 'party', 'classical'],
  classical: ['classical', 'devotional', 'romantic', 'folk'],
  devotional: ['devotional', 'classical'],
  party:    ['party', 'folk', 'romantic'],
  sad:      ['sad', 'romantic', 'classical'],
  null:     ['romantic', 'folk', 'classical', 'devotional', 'party', 'sad'],
};

function detectMood(track) {
  if (!track) return null;
  const text = `${track.title} ${track.album} ${track.genre || ''}`.toLowerCase();
  for (const [mood, keywords] of Object.entries(MOOD_MAP)) {
    if (keywords.some(kw => text.includes(kw))) return mood;
  }
  return null;
}

// Scores a candidate track for how well it fits as the NEXT track in a party set.
// Core principle: penalize repetition heavily, reward variety and smooth mood transitions.
function scoreForPartyDJ(candidate, recentlyPlayed, currentMood) {
  let score = 0;

  // --- Anti-clustering: penalise artists/albums heard recently ---
  const last5Artists = recentlyPlayed.slice(0, 5).map(t => t.artist);
  const last3Artists = recentlyPlayed.slice(0, 3).map(t => t.artist);
  const last3Albums  = recentlyPlayed.slice(0, 3).map(t => t.album);

  const artistOccurrences = last5Artists.filter(a => a === candidate.artist).length;
  score -= artistOccurrences * 30; // -30 each time the artist appeared in the last 5 tracks

  // Immediate repeat artist — hard block
  if (recentlyPlayed[0]?.artist === candidate.artist) score -= 60;

  // Repeat album in last 3 tracks — strong block
  if (last3Albums.includes(candidate.album)) score -= 40;

  // --- Variety reward ---
  if (!last3Artists.includes(candidate.artist)) score += 25;  // Fresh artist
  if (last5Artists.filter(a => a === candidate.artist).length === 0) score += 10; // Not heard at all recently

  // --- Mood transition (smooth, not mood-locked) ---
  const candidateMood = detectMood(candidate);
  const allowedMoods = MOOD_TRANSITIONS[currentMood] || MOOD_TRANSITIONS.null;

  if (currentMood && candidateMood === currentMood) {
    score += 5;  // Same mood: small bonus (don't lock, just slightly prefer)
  } else if (allowedMoods.includes(candidateMood)) {
    score += 15; // Adjacent/transition mood: good fit
  } else if (candidateMood !== null) {
    score -= 10; // Jarring mood shift: small penalty
  }

  // --- Genre affinity (lighter weight than before) ---
  const recentGenres = recentlyPlayed.slice(0, 3).map(t => t.genre);
  if (!recentGenres.includes(candidate.genre)) score += 10; // Genre variety bonus
  if (candidate.genre && recentlyPlayed[0]?.genre === candidate.genre) score -= 5; // Gentle same-genre penalty

  // --- Year affinity (small signal) ---
  if (recentlyPlayed[0] && Math.abs((candidate.year || 0) - (recentlyPlayed[0].year || 0)) <= 5) {
    score += 3;
  }

  return score;
}

// Main export: Party DJ next-track selection
// Returns up to `count` tracks that would make a great next set — varied, fresh, flowing.
export function getPartyDJRecommendations(currentTrack, allTracks, recentlyPlayed = [], count = 8) {
  if (!currentTrack || !allTracks.length) return [];

  const playedIds = new Set(recentlyPlayed.map(t => t.id));
  playedIds.add(currentTrack.id);

  // Candidates = tracks not recently played
  const candidates = allTracks.filter(t => !playedIds.has(t.id));

  // If library is small and we've exhausted unplayed tracks, allow played ones back in
  // but still exclude the immediate last 3 to avoid jarring repeats
  const lastThreeIds = new Set(recentlyPlayed.slice(0, 3).map(t => t.id));
  const pool = candidates.length >= count
    ? candidates
    : allTracks.filter(t => t.id !== currentTrack.id && !lastThreeIds.has(t.id));

  if (pool.length === 0) return [];

  const currentMood = detectMood(currentTrack);

  const scored = pool.map(track => ({
    ...track,
    _score: scoreForPartyDJ(track, recentlyPlayed, currentMood),
  }));

  // Sort by score descending, then pick top results
  scored.sort((a, b) => b._score - a._score);

  // Take top 2× the count, then randomise slightly to avoid mechanical predictability
  const topPool = scored.slice(0, count * 2);
  topPool.sort(() => Math.random() - 0.5);

  // Final selection: ensure no two adjacent tracks are the same artist
  const selected = [];
  const used = new Set();
  for (const track of topPool) {
    if (selected.length >= count) break;
    if (used.has(track.id)) continue;
    const lastSelected = selected[selected.length - 1];
    if (lastSelected?.artist === track.artist) continue; // avoid adjacent same artist
    selected.push(track);
    used.add(track.id);
  }

  // If strict filtering left us short, fill with remaining top candidates
  if (selected.length < count) {
    for (const track of scored) {
      if (selected.length >= count) break;
      if (!used.has(track.id)) {
        selected.push(track);
        used.add(track.id);
      }
    }
  }

  // Strip the internal score field before returning
  return selected.map(({ _score, ...track }) => track);
}

// Kept for backward compatibility — routes through Party DJ engine
export function getSequentialRecommendations(currentTrack, allTracks, playedTracks = []) {
  return getPartyDJRecommendations(currentTrack, allTracks, playedTracks, 5);
}

// Used by HomeView to build a Daily Mix for a specific genre/mood
export function buildMix(tracks, genreOrMood, maxTracks = 30) {
  const keyword = genreOrMood.toLowerCase();
  const matching = tracks.filter(t => {
    const text = `${t.genre || ''} ${t.title} ${t.album}`.toLowerCase();
    return text.includes(keyword);
  });

  // Shuffle for daily freshness
  const shuffled = [...matching].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, maxTracks);
}

export { detectMood };
