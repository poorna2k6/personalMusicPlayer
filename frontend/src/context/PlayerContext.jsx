import React, { createContext, useContext, useReducer, useRef, useEffect, useCallback } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const PlayerContext = createContext(null);

const REPEAT_MODES = ['off', 'all', 'one'];

const initialState = {
  currentTrack: null,
  queue: [],
  queueIndex: 0,
  isPlaying: false,
  isLoading: false,
  progress: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  repeatMode: 'off', // 'off' | 'all' | 'one'
  isShuffled: false,
  shuffledQueue: [],
  showPlayer: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TRACK':
      return {
        ...state,
        currentTrack: action.track,
        isLoading: true,
        isPlaying: false,
        showPlayer: true,
        progress: 0,
      };
    case 'SET_QUEUE':
      return {
        ...state,
        queue: action.queue,
        queueIndex: action.index ?? 0,
        shuffledQueue: action.queue,
      };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying };
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'SET_PROGRESS':
      return { ...state, progress: action.progress };
    case 'SET_DURATION':
      return { ...state, duration: action.duration };
    case 'SET_VOLUME':
      return { ...state, volume: action.volume, isMuted: action.volume === 0 };
    case 'TOGGLE_MUTE':
      return { ...state, isMuted: !state.isMuted };
    case 'NEXT_REPEAT_MODE': {
      const idx = REPEAT_MODES.indexOf(state.repeatMode);
      return { ...state, repeatMode: REPEAT_MODES[(idx + 1) % REPEAT_MODES.length] };
    }
    case 'TOGGLE_SHUFFLE':
      if (!state.isShuffled) {
        // Shuffle the queue
        const shuffled = [...state.queue];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return { ...state, isShuffled: true, shuffledQueue: shuffled };
      }
      return { ...state, isShuffled: false, shuffledQueue: state.queue };
    case 'SET_QUEUE_INDEX':
      return { ...state, queueIndex: action.index };
    case 'ADD_TO_QUEUE':
      return {
        ...state,
        queue: [...state.queue, action.track],
        shuffledQueue: [...state.shuffledQueue, action.track],
      };
    case 'CLEAR_QUEUE':
      return { ...state, queue: [], shuffledQueue: [], queueIndex: 0 };
    default:
      return state;
  }
}

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const audioRef = useRef(new Audio());
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const activeQueue = state.isShuffled ? state.shuffledQueue : state.queue;

  // Wire up audio events
  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => {
      dispatch({ type: 'SET_PROGRESS', progress: audio.currentTime });
    };
    const onDurationChange = () => {
      dispatch({ type: 'SET_DURATION', duration: audio.duration || 0 });
    };
    const onCanPlay = () => {
      dispatch({ type: 'SET_LOADING', isLoading: false });
      audio.play().catch(() => {});
      dispatch({ type: 'SET_PLAYING', isPlaying: true });
    };
    const onEnded = () => {
      const s = stateRef.current;
      if (s.repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      const queue = s.isShuffled ? s.shuffledQueue : s.queue;
      const nextIndex = s.queueIndex + 1;
      if (nextIndex < queue.length) {
        playTrack(queue[nextIndex], queue, nextIndex);
      } else if (s.repeatMode === 'all' && queue.length > 0) {
        playTrack(queue[0], queue, 0);
      } else {
        dispatch({ type: 'SET_PLAYING', isPlaying: false });
      }
    };
    const onError = () => {
      dispatch({ type: 'SET_LOADING', isLoading: false });
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
      toast.error('Failed to load track. Try another.');
    };
    const onWaiting = () => dispatch({ type: 'SET_LOADING', isLoading: true });
    const onPlaying = () => dispatch({ type: 'SET_LOADING', isLoading: false });

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
    };
  }, []);

  // Volume/mute sync
  useEffect(() => {
    audioRef.current.volume = state.isMuted ? 0 : state.volume;
  }, [state.volume, state.isMuted]);

  const playTrack = useCallback((track, queue = null, index = 0) => {
    const audio = audioRef.current;
    audio.pause();
    audio.src = '';

    dispatch({ type: 'SET_TRACK', track });
    if (queue) {
      dispatch({ type: 'SET_QUEUE', queue, index });
    }
    dispatch({ type: 'SET_QUEUE_INDEX', index });

    // Use backend streaming endpoint
    audio.src = `/api/music/stream/${track.videoId}`;
    audio.load();

    // Log to recently played
    api.post('/music/played', {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
      duration: track.duration,
    }).catch(() => {});
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (state.isPlaying) {
      audio.pause();
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
    } else {
      audio.play().catch(() => {});
      dispatch({ type: 'SET_PLAYING', isPlaying: true });
    }
  }, [state.isPlaying]);

  const seek = useCallback((time) => {
    audioRef.current.currentTime = time;
    dispatch({ type: 'SET_PROGRESS', progress: time });
  }, []);

  const playNext = useCallback(() => {
    const s = stateRef.current;
    const queue = s.isShuffled ? s.shuffledQueue : s.queue;
    const nextIndex = s.queueIndex + 1;
    if (nextIndex < queue.length) {
      playTrack(queue[nextIndex], null, nextIndex);
      dispatch({ type: 'SET_QUEUE_INDEX', index: nextIndex });
    } else if (s.repeatMode === 'all' && queue.length > 0) {
      playTrack(queue[0], null, 0);
      dispatch({ type: 'SET_QUEUE_INDEX', index: 0 });
    }
  }, [playTrack]);

  const playPrev = useCallback(() => {
    const audio = audioRef.current;
    // If more than 3 seconds in, restart the track
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const s = stateRef.current;
    const queue = s.isShuffled ? s.shuffledQueue : s.queue;
    const prevIndex = s.queueIndex - 1;
    if (prevIndex >= 0) {
      playTrack(queue[prevIndex], null, prevIndex);
      dispatch({ type: 'SET_QUEUE_INDEX', index: prevIndex });
    }
  }, [playTrack]);

  const addToQueue = useCallback((track) => {
    dispatch({ type: 'ADD_TO_QUEUE', track });
    toast.success('Added to queue');
  }, []);

  const setVolume = useCallback((vol) => {
    dispatch({ type: 'SET_VOLUME', volume: vol });
  }, []);

  const value = {
    ...state,
    activeQueue,
    playTrack,
    togglePlay,
    seek,
    playNext,
    playPrev,
    addToQueue,
    setVolume,
    dispatch,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
};
