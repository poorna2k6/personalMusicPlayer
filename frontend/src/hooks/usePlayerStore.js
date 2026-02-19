import { useState, useCallback, useRef, useEffect } from 'react';
import { getPartyDJRecommendations } from '../utils/recommendations';

const STORAGE_KEY = 'music-player-state';
const STATE_VERSION = 3; // Bump this to force-clear stale localStorage on breaking changes
const MAX_SAVED_QUEUE = 30; // Cap queue saved to localStorage to avoid quota errors

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // Wipe stale state from old versions — prevents black screen on reopen
    if (parsed.version !== STATE_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    // Corrupted JSON — wipe it
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    return null;
  }
}

function saveState(state) {
  try {
    // Cap queue size around currentIndex to prevent localStorage quota errors
    let savedQueue = state.queue;
    let savedIndex = state.currentIndex;
    if (savedQueue.length > MAX_SAVED_QUEUE) {
      const start = Math.max(0, savedIndex - 5);
      const end = Math.min(savedQueue.length, start + MAX_SAVED_QUEUE);
      savedQueue = savedQueue.slice(start, end);
      savedIndex = Math.max(0, savedIndex - start);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STATE_VERSION,
      queue: savedQueue,
      currentIndex: savedIndex,
      volume: state.volume,
      shuffle: state.shuffle,
      repeat: state.repeat,
      djMode: state.djMode,
      recentlyPlayed: state.recentlyPlayed,
    }));
  } catch {
    // Quota exceeded or serialization error — fail silently but don't crash
  }
}

export function usePlayerStore() {
  const saved = useRef(loadState());

  const [queue, setQueue] = useState(saved.current?.queue || []);
  const [currentIndex, setCurrentIndex] = useState(saved.current?.currentIndex ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(saved.current?.volume ?? 0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(saved.current?.shuffle || false);
  const [repeat, setRepeat] = useState(saved.current?.repeat || 'none'); // 'none' | 'all' | 'one'
  const [djMode, setDjMode] = useState(saved.current?.djMode || false);
  const [allTracks, setAllTracks] = useState([]);
  const [playedTracks, setPlayedTracks] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState(saved.current?.recentlyPlayed || []);

  const currentTrack = queue[currentIndex] ?? null;

  // Persist state on every relevant change
  useEffect(() => {
    saveState({ queue, currentIndex, volume, shuffle, repeat, djMode, recentlyPlayed });
  }, [queue, currentIndex, volume, shuffle, repeat, djMode, recentlyPlayed]);

  const playTrack = useCallback((track, trackList) => {
    if (trackList) {
      setQueue(trackList);
      const idx = trackList.findIndex(t => t.id === track.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
    }
    setIsPlaying(true);
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(t => t.id !== track.id);
      return [{ ...track, playedAt: Date.now() }, ...filtered].slice(0, 20);
    });
  }, []);

  const playAll = useCallback((tracks) => {
    if (tracks.length === 0) return;
    setQueue(tracks);
    setCurrentIndex(0);
    setIsPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const nextTrack = useCallback(() => {
    if (queue.length === 0) return;

    // Track what was just played for DJ recommendations
    if (currentTrack) {
      setPlayedTracks(prev => {
        const updated = [currentTrack, ...prev.filter(t => t.id !== currentTrack.id)];
        return updated.slice(0, 50);
      });
    }

    if (shuffle) {
      let next;
      do {
        next = Math.floor(Math.random() * queue.length);
      } while (next === currentIndex && queue.length > 1);
      setCurrentIndex(next);
    } else if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (repeat === 'all') {
      setCurrentIndex(0);
    } else {
      // End of queue — if DJ mode is on, fetch recommendations
      if (djMode && currentTrack && allTracks.length > 0) {
        const recs = getPartyDJRecommendations(currentTrack, allTracks, playedTracks);
        if (recs.length > 0) {
          setQueue(prev => [...prev, ...recs]);
          setCurrentIndex(prev => prev + 1);
          return;
        }
      }
      setIsPlaying(false);
      return;
    }

    // DJ mode: top-up queue before it runs dry (keep at least 3 tracks ahead)
    if (djMode && currentTrack && allTracks.length > 0 && (queue.length - currentIndex) <= 3) {
      const recs = getPartyDJRecommendations(currentTrack, allTracks, playedTracks);
      if (recs.length > 0) {
        setQueue(prev => [...prev, ...recs]);
      }
    }
  }, [queue, currentIndex, shuffle, repeat, djMode, currentTrack, allTracks, playedTracks]);

  const prevTrack = useCallback(() => {
    if (queue.length === 0) return;
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else if (repeat === 'all') {
      setCurrentIndex(queue.length - 1);
    }
  }, [queue, currentIndex, repeat]);

  const toggleShuffle = useCallback(() => setShuffle(prev => !prev), []);

  const toggleRepeat = useCallback(() => {
    setRepeat(prev => {
      if (prev === 'none') return 'all';
      if (prev === 'all') return 'one';
      return 'none';
    });
  }, []);

  const addToQueue = useCallback((track) => {
    setQueue(prev => [...prev, track]);
  }, []);

  const toggleDjMode = useCallback(() => {
    setDjMode(prev => !prev);
  }, []);

  const updateAllTracks = useCallback((tracks) => {
    setAllTracks(tracks);
  }, []);

  // Kick off a DJ session from the current track
  const startDjSession = useCallback((seedTrack, trackPool) => {
    if (!seedTrack || !trackPool.length) return;
    const recs = getPartyDJRecommendations(seedTrack, trackPool, [seedTrack]);
    const sessionQueue = [seedTrack, ...recs];
    setQueue(sessionQueue);
    setCurrentIndex(0);
    setDjMode(true);
    setIsPlaying(true);
  }, []);

  return {
    queue, currentTrack, currentIndex, isPlaying, volume, currentTime, duration,
    shuffle, repeat, djMode, recentlyPlayed, allTracks,
    setVolume, setCurrentTime, setDuration, setIsPlaying,
    playTrack, playAll, togglePlay, nextTrack, prevTrack,
    toggleShuffle, toggleRepeat, addToQueue,
    toggleDjMode, updateAllTracks, startDjSession,
    // Keep backward compat alias
    smartAutoPlay: djMode,
    toggleSmartAutoPlay: toggleDjMode,
  };
}
