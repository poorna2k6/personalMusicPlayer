import { useRef, useEffect, useState } from 'react';
import { getAudioUrl, getCoverUrl } from '../api';

export default function Player({ player }) {
  const audioRef = useRef(null);
  const [playbackError, setPlaybackError] = useState(null);
  const {
    currentTrack, isPlaying, volume, currentTime, duration,
    shuffle, repeat, djMode,
    setCurrentTime, setDuration, setIsPlaying,
    togglePlay, nextTrack, prevTrack, setVolume,
    toggleShuffle, toggleRepeat, toggleDjMode,
  } = player;

  // Sync audio element with player state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    setPlaybackError(null);
    const src = getAudioUrl(currentTrack.file_path);
    if (audio.src !== new URL(src, window.location.origin).href) {
      audio.src = src;
    }

    if (isPlaying) {
      audio.play().catch((err) => {
        if (err.name !== 'AbortError') {
          setPlaybackError('Could not play this track. The file may be missing or unsupported.');
          setIsPlaying(false);
        }
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (currentTrack) togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextTrack();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevTrack();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.1));
          break;
        case 'm':
        case 'M':
          setVolume(volume > 0 ? 0 : 0.8);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, togglePlay, nextTrack, prevTrack, setVolume, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  const handleTimeUpdate = () => setCurrentTime(audioRef.current.currentTime);
  const handleLoadedMetadata = () => setDuration(audioRef.current.duration);

  const handleEnded = () => {
    setPlaybackError(null);
    if (repeat === 'one') {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } else {
      nextTrack();
    }
  };

  const handleError = () => {
    setPlaybackError('Could not play this track. The file may be missing or unsupported.');
    setIsPlaying(false);
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!currentTrack) {
    return (
      <footer className="h-20 bg-surface-900 border-t border-surface-800 flex items-center justify-center shrink-0">
        <p className="text-surface-500 text-sm">Select a track to start playing</p>
        <audio ref={audioRef} />
      </footer>
    );
  }

  return (
    <footer className="h-24 bg-surface-900 border-t border-surface-800 flex items-center px-4 gap-4 relative shrink-0">
      {playbackError && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-1 px-3 py-1.5 rounded-lg bg-red-900/90 border border-red-700 text-red-200 text-xs whitespace-nowrap z-10">
          {playbackError}
          <button
            onClick={() => setPlaybackError(null)}
            className="ml-2 text-red-400 hover:text-red-200"
          >
            &times;
          </button>
        </div>
      )}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
      />

      {/* Track info */}
      <div className="flex items-center gap-3 w-64 shrink-0">
        <div className="w-14 h-14 rounded-lg bg-surface-700 overflow-hidden shrink-0">
          <img
            src={getCoverUrl(currentTrack.id)}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{currentTrack.title}</p>
          <p className="text-xs text-surface-400 truncate">{currentTrack.artist}</p>
          {djMode && (
            <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              DJ MODE
            </span>
          )}
        </div>
      </div>

      {/* Center controls */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-xl mx-auto">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleShuffle}
            className={`p-1 transition-colors ${shuffle ? 'text-indigo-400' : 'text-surface-400 hover:text-white'}`}
            title="Shuffle"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
            </svg>
          </button>

          <button onClick={prevTrack} className="p-1 text-surface-300 hover:text-white transition-colors" title="Previous">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-white text-surface-900 flex items-center justify-center hover:scale-105 transition-transform"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button onClick={nextTrack} className="p-1 text-surface-300 hover:text-white transition-colors" title="Next">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          <button
            onClick={toggleRepeat}
            className={`p-1 transition-colors relative ${repeat !== 'none' ? 'text-indigo-400' : 'text-surface-400 hover:text-white'}`}
            title={`Repeat: ${repeat}`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
            </svg>
            {repeat === 'one' && <span className="text-[8px] absolute -top-0.5 -right-0.5 font-bold">1</span>}
          </button>
        </div>

        {/* Seek bar */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-surface-400 w-10 text-right">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1"
            step={0.1}
          />
          <span className="text-xs text-surface-400 w-10">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right side: DJ Mode + Volume */}
      <div className="flex items-center gap-3 w-48 shrink-0 justify-end">
        {/* Party DJ toggle */}
        <button
          onClick={toggleDjMode}
          title={djMode ? 'DJ Mode ON — click to disable' : 'Enable Party DJ Mode'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
            djMode
              ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
              : 'bg-surface-800 border-surface-700 text-surface-400 hover:text-white hover:border-surface-600'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
          </svg>
          DJ
        </button>

        {/* Volume */}
        <button
          onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
          className="text-surface-400 hover:text-white transition-colors"
          title="Toggle mute"
        >
          {volume === 0 ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-20"
        />
      </div>
    </footer>
  );
}
