// Party DJ recommendation engine
// Spotify/YTM-style: preference-weighted scoring + mood transitions + taste breaker

const MOOD_MAP = {
  romantic:  ['prema', 'love', 'jaan', 'pyar', 'romantic', 'heart', 'ishq', 'dil'],
  folk:      ['folk', 'telangana', 'traditional', 'dance', 'janapadha', 'paata'],
  classical: ['classical', 'raaga', 'carnatic', 'hindustani', 'swaraalu'],
  devotional:['devotional', 'bhakti', 'temple', 'god', 'spiritual', 'mantra'],
  party:     ['party', 'dance', 'beat', 'club', 'remix', 'dj'],
  sad:       ['sad', 'cry', 'tears', 'pain', 'broken', 'farewell'],
};

const MOOD_TRANSITIONS = {
  romantic:  ['romantic', 'sad', 'classical'],
  folk:      ['folk', 'party', 'classical'],
  classical: ['classical', 'devotional', 'romantic', 'folk'],
  devotional:['devotional', 'classical'],
  party:     ['party', 'folk', 'romantic'],
  sad:       ['sad', 'romantic', 'classical'],
  null:      ['romantic', 'folk', 'classical', 'devotional', 'party', 'sad'],
};

export function detectMood(track) {
  if (!track) return null;
  const text = `${track.title} ${track.album} ${track.genre || ''}`.toLowerCase();
  for (const [mood, keywords] of Object.entries(MOOD_MAP)) {
    if (keywords.some(kw => text.includes(kw))) return mood;
  }
  return null;
}

// Load user preference weights from localStorage (written by usePlayerStore)
function loadPreferences() {
  try {
    const raw = localStorage.getItem('user-preferences');
    if (!raw) return { artistWeights: {}, genreWeights: {} };
    return JSON.parse(raw);
  } catch {
    return { artistWeights: {}, genreWeights: {} };
  }
}

// Score a candidate track for how well it fits next in a DJ session.
// Combines: anti-clustering, mood transitions, and Spotify-style preference weights.
function scoreForPartyDJ(candidate, recentlyPlayed, currentMood, prefs) {
  let score = 0;

  // --- Anti-clustering: penalise recently heard artists/albums ---
  const last5Artists = recentlyPlayed.slice(0, 5).map(t => t.artist);
  const last3Artists = recentlyPlayed.slice(0, 3).map(t => t.artist);
  const last3Albums  = recentlyPlayed.slice(0, 3).map(t => t.album);

  const artistOccurrences = last5Artists.filter(a => a === candidate.artist).length;
  score -= artistOccurrences * 30;

  if (recentlyPlayed[0]?.artist === candidate.artist) score -= 60; // hard block same-artist repeat
  if (last3Albums.includes(candidate.album)) score -= 40;

  // --- Variety reward ---
  if (!last3Artists.includes(candidate.artist)) score += 25;
  if (artistOccurrences === 0) score += 10;

  // --- Mood transition ---
  const candidateMood = detectMood(candidate);
  const allowedMoods = MOOD_TRANSITIONS[currentMood] || MOOD_TRANSITIONS.null;

  if (currentMood && candidateMood === currentMood) {
    score += 5;
  } else if (allowedMoods.includes(candidateMood)) {
    score += 15;
  } else if (candidateMood !== null) {
    score -= 10;
  }

  // --- Genre affinity ---
  const recentGenres = recentlyPlayed.slice(0, 3).map(t => t.genre);
  if (!recentGenres.includes(candidate.genre)) score += 10;
  if (candidate.genre && recentlyPlayed[0]?.genre === candidate.genre) score -= 5;

  // --- Year affinity (small signal) ---
  if (recentlyPlayed[0] && Math.abs((candidate.year || 0) - (recentlyPlayed[0].year || 0)) <= 5) {
    score += 3;
  }

  // --- User preference weight (Spotify-style taste signal) ---
  // Artist preference: range -5 to +10 → maps to -15 to +20 DJ score bonus
  const artistPref = prefs.artistWeights?.[candidate.artist] || 0;
  score += artistPref * 2;

  // Genre preference: range -5 to +10 → maps to -5 to +10 DJ score bonus
  const genrePref = prefs.genreWeights?.[candidate.genre] || 0;
  score += genrePref;

  // Strong negative preference (artist frequently skipped) → hard penalty
  if (artistPref < -2) score -= 30;

  return score;
}

// Select a "taste breaker" — a track that's deliberately outside the user's usual taste.
// Used every ~7 tracks to inject discovery, like Spotify's "something different" card.
function pickTasteBreaker(pool, recentlyPlayed, prefs) {
  if (pool.length === 0) return null;

  // Find artists that have low/zero preference weight (unexplored territory)
  const lastArtist = recentlyPlayed[0]?.artist;
  const candidates = pool.filter(t => {
    const artistPref = prefs.artistWeights?.[t.artist] || 0;
    return t.artist !== lastArtist && artistPref <= 1; // low familiarity
  });

  if (candidates.length === 0) return null;

  // Among low-preference candidates, pick one that's a fresh mood (different from recent)
  const recentMoods = recentlyPlayed.slice(0, 3).map(detectMood).filter(Boolean);
  const freshMood = candidates.find(t => {
    const m = detectMood(t);
    return m && !recentMoods.includes(m);
  });

  if (freshMood) return freshMood;
  return candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
}

// Main export: Party DJ next-track selection
// injectTasteBreaker: if true, forces a discovery pick instead of a preference-based one
export function getPartyDJRecommendations(
  currentTrack,
  allTracks,
  recentlyPlayed = [],
  count = 8,
  injectTasteBreaker = false
) {
  if (!currentTrack || !allTracks.length) return [];

  const prefs = loadPreferences();

  const playedIds = new Set(recentlyPlayed.map(t => t.id));
  playedIds.add(currentTrack.id);

  const candidates = allTracks.filter(t => !playedIds.has(t.id));

  const lastFiveIds = new Set(recentlyPlayed.slice(0, 5).map(t => t.id));
  const relaxedPool = allTracks.filter(t => t.id !== currentTrack.id && !lastFiveIds.has(t.id));
  const finalFallback = allTracks.filter(t => t.id !== currentTrack.id && t.id !== recentlyPlayed[0]?.id);

  const pool = candidates.length >= count
    ? candidates
    : relaxedPool.length > 0 ? relaxedPool : finalFallback;

  if (pool.length === 0) return [];

  const currentMood = detectMood(currentTrack);

  // Taste breaker injection: replace the last slot with a discovery track
  if (injectTasteBreaker && count > 1) {
    const breaker = pickTasteBreaker(pool, recentlyPlayed, prefs);
    if (breaker) {
      // Exclude the breaker from the normal batch so it doesn't appear twice
      const normalRecs = getPartyDJRecommendations(
        currentTrack, allTracks, [...recentlyPlayed, breaker], count - 1, false
      );
      // Insert breaker near the end (not last — avoid a jarring mood jump at tail)
      const insertAt = Math.max(0, normalRecs.length - 2);
      const result = [...normalRecs];
      result.splice(insertAt, 0, breaker);
      return result.slice(0, count);
    }
  }

  const scored = pool.map(track => ({
    ...track,
    _score: scoreForPartyDJ(track, recentlyPlayed, currentMood, prefs),
  }));

  scored.sort((a, b) => b._score - a._score);

  // Take top 2× count, shuffle slightly to avoid mechanical predictability
  const topPool = scored.slice(0, count * 2);
  topPool.sort(() => Math.random() - 0.5);

  // Final selection: no two adjacent tracks from same artist
  const selected = [];
  const used = new Set();
  for (const track of topPool) {
    if (selected.length >= count) break;
    if (used.has(track.id)) continue;
    if (selected[selected.length - 1]?.artist === track.artist) continue;
    selected.push(track);
    used.add(track.id);
  }

  // Fill remainder if strict filtering left us short
  if (selected.length < count) {
    for (const track of scored) {
      if (selected.length >= count) break;
      if (!used.has(track.id)) {
        selected.push(track);
        used.add(track.id);
      }
    }
  }

  return selected.map(({ _score, ...track }) => track);
}

// Kept for backward compatibility
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
  const shuffled = [...matching].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, maxTracks);
}
