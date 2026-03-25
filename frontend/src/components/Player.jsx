import { useRef, useEffect, useState } from 'react';
import { getAudioUrl, getCoverUrl, recordPlayHistory } from '../api';
import { useAuth } from '../context/AuthContext';

// Extracts dominant color from an img element using a hidden canvas
function extractDominantColor(imgSrc, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;
      let r = 0, g = 0, b = 0;
      const count = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      // Darken the color significantly so text remains readable
      const factor = 0.45;
      callback(`rgb(${Math.round((r / count) * factor)},${Math.round((g / count) * factor)},${Math.round((b / count) * factor)})`);
    } catch {
      callback(null);
    }
  };
  img.onerror = () => callback(null);
  img.src = imgSrc;
}

const CROSSFADE_STEPS = 20;
const CROSSFADE_MS = 60; // ms per step → 1.2 s total

export default function Player({ player }) {
  const audioRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const playStartRef = useRef(null); // timestamp (ms) when current track started playing
  const [playbackError, setPlaybackError] = useState(null);
  const [accentColor, setAccentColor] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [titleKey, setTitleKey] = useState(0); // triggers fade animation on track change
  const { token } = useAuth();
  const {
    currentTrack, isPlaying, volume, currentTime, duration,
    shuffle, repeat, djMode, queue, currentIndex,
    setCurrentTime, setDuration, setIsPlaying,
    togglePlay, nextTrack, prevTrack, setVolume,
    toggleShuffle, toggleRepeat, toggleDjMode,
    removeFromQueue,
  } = player;

  // Track when the current track started playing so we can compute completion %
  useEffect(() => {
    if (isPlaying && currentTrack) {
      playStartRef.current = Date.now();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]); // reset on track change, not on pause/resume

  // Build play signals and send history to backend — fire-and-forget
  function recordCurrentTrack(audioCurrentTime, audioDuration) {
    if (!currentTrack || !token) return;
    const elapsed = playStartRef.current
      ? Math.round((Date.now() - playStartRef.current) / 1000)
      : Math.round(audioCurrentTime);
    const trackDuration = audioDuration || currentTrack.duration || 0;
    const completionPct = trackDuration > 0 ? Math.min(1, audioCurrentTime / trackDuration) : 0;
    const skipped = completionPct < 0.5;
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 5  ? 'night' :
      hour < 12 ? 'morning' :
      hour < 17 ? 'afternoon' :
      hour < 21 ? 'evening' : 'night';
    recordPlayHistory(token, currentTrack.id, {
      playDuration: elapsed,
      completionPct: Math.round(completionPct * 100) / 100,
      skipped,
      timeOfDay,
    });
  }

  // Extract dominant color from album art on track change
  useEffect(() => {
    if (!currentTrack) { setAccentColor(null); return; }
    setTitleKey(k => k + 1); // trigger title fade animation
    // Don't reset color to null — keep the previous color until the new one is ready
    // to avoid a jarring snap-to-black between tracks
    extractDominantColor(getCoverUrl(currentTrack.id), (color) => {
      if (color) setAccentColor(color);
    });
  }, [currentTrack?.id]);

  // Sync audio element with player state — crossfades in DJ mode on track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    setPlaybackError(null);
    const newSrc = getAudioUrl(currentTrack.file_path);
    const isSameSrc = audio.src === new URL(newSrc, window.location.origin).href;

    // Cancel any in-progress fade
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
      audio.volume = volume;
    }

    if (isSameSrc) {
      // Same track — just play/pause
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
      return;
    }

    // New track — crossfade only in DJ mode if audio is actively playing
    const shouldCrossfade = djMode && isPlaying && !audio.paused && audio.currentTime > 0;

    if (shouldCrossfade) {
      const startVol = audio.volume;
      let step = 0;
      fadeIntervalRef.current = setInterval(() => {
        step++;
        audio.volume = Math.max(0, startVol * (1 - step / CROSSFADE_STEPS));
        if (step >= CROSSFADE_STEPS) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
          doSwitch();
        }
      }, CROSSFADE_MS);
    } else {
      doSwitch();
    }

    function doSwitch() {
      audio.src = newSrc;
      if (isPlaying) {
        audio.volume = 0;
        audio.play().catch((err) => {
          if (err.name !== 'AbortError') {
            setPlaybackError('Could not play this track. The file may be missing or unsupported.');
            setIsPlaying(false);
          }
        });
        const targetVol = volume;
        let step = 0;
        fadeIntervalRef.current = setInterval(() => {
          step++;
          audio.volume = Math.min(targetVol, targetVol * (step / CROSSFADE_STEPS));
          if (step >= CROSSFADE_STEPS) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
            audio.volume = targetVol;
          }
        }, CROSSFADE_MS);
      } else {
        audio.volume = volume;
      }
    }

    return () => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
    };
  }, [currentTrack, isPlaying, djMode]);

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
          recordCurrentTrack(audioRef.current?.currentTime || 0, audioRef.current?.duration || 0);
          nextTrack(audioRef.current?.currentTime || 0, audioRef.current?.duration || 0);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          recordCurrentTrack(audioRef.current?.currentTime || 0, audioRef.current?.duration || 0);
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
        case '?':
          setShowShortcuts(prev => !prev);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, togglePlay, nextTrack, prevTrack, setVolume, volume, token]);

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
      const dur = audioRef.current?.duration || 0;
      // Natural completion — completionPct = 1.0
      recordCurrentTrack(dur, dur);
      nextTrack(dur, dur);
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

  // Compute the upcoming tracks slice for the "Up Next" panel
  const upNextTracks = djMode && queue.length > 0
    ? queue.slice(currentIndex, currentIndex + 13) // index 0 is current, 1-12 are upcoming
    : [];
  const isQueueRunningLow = djMode && (queue.length - currentIndex) <= 3;

  return (
    <>
      {/* Up Next DJ Queue Panel — slides in above the player when open */}
      {djMode && showUpNext && (
        <div className="border-t border-indigo-800/60 bg-surface-900/95 backdrop-blur shrink-0 animate-fadeUp">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Up Next — Auto DJ</span>
              <button
                onClick={() => setShowUpNext(false)}
                className="text-surface-500 hover:text-white text-lg leading-none transition-colors"
                title="Close queue"
              >
                &times;
              </button>
            </div>
            {isQueueRunningLow && (
              <div className="mb-2 px-2 py-1.5 rounded-md bg-amber-900/30 border border-amber-700/40 text-amber-300 text-xs flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Queue running low — fetching more tracks…
              </div>
            )}
            <div className="space-y-0.5 max-h-64 overflow-y-auto pr-0.5">
              {upNextTracks.map((track, i) => {
                const queueIndex = currentIndex + i;
                const isCurrentlyPlaying = i === 0;
                return (
                  <div
                    key={`upnext-${track.id}-${queueIndex}`}
                    className={`flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors group ${
                      isCurrentlyPlaying
                        ? 'bg-indigo-600/20 border border-indigo-500/30'
                        : 'hover:bg-surface-800/60'
                    }`}
                  >
                    <span className={`text-xs w-5 text-center shrink-0 font-mono ${isCurrentlyPlaying ? 'text-indigo-400' : 'text-surface-500'}`}>
                      {isCurrentlyPlaying ? (
                        <span className="inline-flex items-end gap-[2px] h-3">
                          <span className="w-[2px] rounded-sm bg-indigo-400 animate-eq1" style={{ height: '3px' }} />
                          <span className="w-[2px] rounded-sm bg-indigo-400 animate-eq2" style={{ height: '8px' }} />
                          <span className="w-[2px] rounded-sm bg-indigo-400 animate-eq3" style={{ height: '5px' }} />
                        </span>
                      ) : (
                        queueIndex + 1
                      )}
                    </span>
                    <img
                      src={getCoverUrl(track.id)}
                      alt=""
                      className="w-8 h-8 rounded object-cover shrink-0 bg-surface-700"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium truncate ${isCurrentlyPlaying ? 'text-white' : 'text-surface-200'}`}>
                        {track.title}
                        {isCurrentlyPlaying && (
                          <span className="ml-1.5 text-[9px] font-bold text-indigo-400 uppercase tracking-wide">Now Playing</span>
                        )}
                      </p>
                      <p className="text-[11px] text-surface-400 truncate">{track.artist}</p>
                    </div>
                    {/* Remove from queue button — hidden until hover, not shown for current track */}
                    {!isCurrentlyPlaying && removeFromQueue && (
                      <button
                        onClick={() => removeFromQueue(queueIndex)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 p-1 text-surface-600 hover:text-rose-400 transition-all"
                        title="Remove from queue"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
              {upNextTracks.length <= 1 && !isQueueRunningLow && (
                <p className="text-xs text-surface-500 px-2 py-1">Raagam will pick more tracks automatically as you listen.</p>
              )}
            </div>
          </div>
        </div>
      )}
    <footer
      className="h-24 border-t border-surface-800 flex items-center px-4 gap-4 relative shrink-0 transition-all duration-700"
      style={{ background: accentColor ? `linear-gradient(to right, ${accentColor} 0%, #0f172a 55%)` : '#0f172a' }}
    >
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
        <div className={`w-14 h-14 rounded-lg bg-surface-700 overflow-hidden shrink-0 relative ${isPlaying ? 'animate-pulse-subtle' : ''}`}>
          <img
            src={getCoverUrl(currentTrack.id)}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          {/* Animated equalizer bars overlay while playing */}
          {isPlaying && (
            <div className="absolute bottom-1 left-1 flex items-end gap-[2px]">
              <span className="w-[3px] rounded-sm bg-white/80 animate-eq1" style={{ height: '4px' }} />
              <span className="w-[3px] rounded-sm bg-white/80 animate-eq2" style={{ height: '10px' }} />
              <span className="w-[3px] rounded-sm bg-white/80 animate-eq3" style={{ height: '7px' }} />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p key={`title-${titleKey}`} className="text-sm font-medium truncate animate-fadeUp">{currentTrack.title}</p>
          <p key={`artist-${titleKey}`} className="text-xs text-surface-400 truncate animate-fadeUp" style={{ animationDelay: '30ms' }}>{currentTrack.artist}</p>
          {djMode && (
            <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/25 text-indigo-200 border border-indigo-400/50 shadow-sm shadow-indigo-900/50">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-pulse" />
              🎧 DJ MODE
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

          <button onClick={() => { recordCurrentTrack(audioRef.current?.currentTime || 0, audioRef.current?.duration || 0); prevTrack(); }} className="p-1 text-surface-300 hover:text-white transition-colors" title="Previous">
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

          <button onClick={() => { recordCurrentTrack(audioRef.current?.currentTime || 0, audioRef.current?.duration || 0); nextTrack(audioRef.current?.currentTime || 0, audioRef.current?.duration || 0); }} className="p-1 text-surface-300 hover:text-white transition-colors" title="Next">
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

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div
          className="absolute bottom-28 right-4 z-50 w-64 rounded-xl bg-surface-800 border border-surface-700 shadow-2xl p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">Keyboard Shortcuts</h4>
            <button onClick={() => setShowShortcuts(false)} className="text-surface-400 hover:text-white text-lg leading-none">&times;</button>
          </div>
          <div className="space-y-1.5 text-xs text-surface-300">
            {[
              ['Space', 'Play / Pause'],
              ['→', 'Next track'],
              ['←', 'Previous track'],
              ['↑', 'Volume up'],
              ['↓', 'Volume down'],
              ['M', 'Toggle mute'],
              ['?', 'Show shortcuts'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span>{label}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface-700 border border-surface-600 font-mono text-[10px]">{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Right side: DJ Mode + Up Next + Volume */}
      <div className="flex items-center gap-2 w-64 shrink-0 justify-end">
        {/* Up Next toggle — only shown in DJ mode */}
        {djMode && (
          <button
            onClick={() => setShowUpNext(prev => !prev)}
            title="Show / hide upcoming tracks"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all border ${
              showUpNext
                ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-200'
                : 'bg-surface-800 border-surface-700 text-surface-400 hover:text-white hover:border-surface-600'
            }`}
          >
            Up Next {showUpNext ? '▼' : '▲'}
          </button>
        )}

        {/* Track position indicator in DJ mode */}
        {djMode && currentIndex >= 0 && (
          <span className="text-[10px] text-indigo-400/80 font-mono whitespace-nowrap">
            Track {currentIndex + 1}
          </span>
        )}

        {/* Party DJ toggle */}
        <button
          onClick={toggleDjMode}
          title={djMode ? 'Stop DJ session' : 'Enable Auto DJ — endless music, always varied'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
            djMode
              ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-200 shadow-sm shadow-indigo-900/50'
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
        <button
          onClick={() => setShowShortcuts(prev => !prev)}
          className="text-surface-500 hover:text-surface-300 transition-colors text-xs font-mono border border-surface-700 rounded px-1"
          title="Keyboard shortcuts (?)"
        >
          ?
        </button>
      </div>
    </footer>
    </>
  );
}
