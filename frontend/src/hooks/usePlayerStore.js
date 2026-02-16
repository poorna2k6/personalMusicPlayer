import { useState, useCallback, useRef, useEffect } from 'react';
import { getSequentialRecommendations } from '../utils/recommendations';

const STORAGE_KEY = 'music-player-state';

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      queue: state.queue,
      currentIndex: state.currentIndex,
      volume: state.volume,
      shuffle: state.shuffle,
      repeat: state.repeat,
      smartAutoPlay: state.smartAutoPlay,
    }));
  } catch {}
}

export function usePlayerStore() {
  const saved = useRef(loadState());

  const [queue, setQueue] = useState(saved.current?.queue || []);
  const [currentIndex, setCurrentIndex] = useState(saved.current?.currentIndex || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(saved.current?.volume ?? 0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(saved.current?.shuffle || false);
  const [repeat, setRepeat] = useState(saved.current?.repeat || 'none'); // 'none' | 'all' | 'one'
  const [smartAutoPlay, setSmartAutoPlay] = useState(saved.current?.smartAutoPlay || false);
  const [allTracks, setAllTracks] = useState([]); // Store all available tracks for recommendations
  const [playedTracks, setPlayedTracks] = useState([]); // Track played songs for better recommendations

  const currentTrack = queue[currentIndex] || null;

  // Persist state
  useEffect(() => {
    saveState({ queue, currentIndex, volume, shuffle, repeat, smartAutoPlay });
  }, [queue, currentIndex, volume, shuffle, repeat, smartAutoPlay]);

  const playTrack = useCallback((track, trackList) => {
    if (trackList) {
      setQueue(trackList);
      const idx = trackList.findIndex(t => t.id === track.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
    }
    setIsPlaying(true);
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

    // Add current track to played tracks for recommendations
    if (currentTrack) {
      setPlayedTracks(prev => {
        const newPlayed = [currentTrack, ...prev.filter(t => t.id !== currentTrack.id)];
        return newPlayed.slice(0, 50); // Keep last 50 played tracks
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
      // End of queue - check if smart auto-play is enabled
      if (smartAutoPlay && currentTrack && allTracks.length > 0) {
        const recommendations = getSequentialRecommendations(currentTrack, allTracks, playedTracks);
        if (recommendations.length > 0) {
          setQueue(prev => [...prev, ...recommendations]);
          setCurrentIndex(prev => prev + 1);
          return;
        }
      }
      setIsPlaying(false);
    }

    // Auto-queue more tracks if smart mode is on and queue is running low
    if (smartAutoPlay && currentTrack && allTracks.length > 0 && queue.length - currentIndex <= 2) {
      const recommendations = getSequentialRecommendations(currentTrack, allTracks, playedTracks);
      if (recommendations.length > 0) {
        setQueue(prev => [...prev, ...recommendations]);
      }
    }
  }, [queue, currentIndex, shuffle, repeat, smartAutoPlay, currentTrack, allTracks, playedTracks]);

  const prevTrack = useCallback(() => {
    if (queue.length === 0) return;
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else if (repeat === 'all') {
      setCurrentIndex(queue.length - 1);
    }
  }, [queue, currentIndex, repeat]);

  const toggleShuffle = useCallback(() => {
    setShuffle(prev => !prev);
  }, []);

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

  const toggleSmartAutoPlay = useCallback(() => {
    setSmartAutoPlay(prev => !prev);
  }, []);

  const updateAllTracks = useCallback((tracks) => {
    setAllTracks(tracks);
  }, []);

  const addRecommendedTracks = useCallback((count = 5) => {
    if (!currentTrack || allTracks.length === 0) return;

    const recommendations = getSequentialRecommendations(currentTrack, allTracks, playedTracks, count);
    if (recommendations.length > 0) {
      setQueue(prev => [...prev, ...recommendations]);
    }
  }, [currentTrack, allTracks, playedTracks]);

  return {
    queue, currentTrack, currentIndex, isPlaying, volume, currentTime, duration,
    shuffle, repeat, smartAutoPlay,
    setVolume, setCurrentTime, setDuration, setIsPlaying,
    playTrack, playAll, togglePlay, nextTrack, prevTrack,
    toggleShuffle, toggleRepeat, addToQueue,
    toggleSmartAutoPlay, updateAllTracks, addRecommendedTracks,
  };
}
