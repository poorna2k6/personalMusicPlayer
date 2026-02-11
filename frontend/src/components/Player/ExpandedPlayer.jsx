import React from 'react';
import {
  MdPlayArrow, MdPause, MdSkipNext, MdSkipPrevious,
  MdShuffle, MdRepeat, MdRepeatOne, MdVolumeUp, MdVolumeOff,
  MdFavorite, MdFavoriteBorder, MdKeyboardArrowDown
} from 'react-icons/md';
import { usePlayer } from '../../context/PlayerContext';
import { formatTime } from '../../utils/format';

export default function ExpandedPlayer({ onClose }) {
  const {
    currentTrack, isPlaying, isLoading, progress, duration,
    volume, isMuted, repeatMode, isShuffled,
    togglePlay, seek, playNext, playPrev,
    setVolume, dispatch,
  } = usePlayer();

  if (!currentTrack) return null;

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in"
      style={{
        background: `linear-gradient(to bottom, #1a1a2e 0%, #121212 60%)`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <button onClick={onClose} className="text-sp-muted hover:text-white">
          <MdKeyboardArrowDown size={32} />
        </button>
        <div className="text-center">
          <p className="text-white text-xs uppercase tracking-widest font-medium">Now Playing</p>
        </div>
        <div className="w-8" />
      </div>

      {/* Album Art */}
      <div className="flex-1 flex items-center justify-center px-10 py-6">
        <div className="w-full max-w-sm aspect-square">
          <img
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className={`w-full h-full object-cover rounded-xl shadow-2xl ${
              isPlaying ? 'animate-pulse-fast' : ''
            }`}
            style={{ animationDuration: '4s' }}
            onError={(e) => {
              e.target.src = 'https://via.placeholder.com/400x400/282828/535353?text=♪';
            }}
          />
        </div>
      </div>

      {/* Track Info + Controls */}
      <div className="px-6 pb-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-xl font-bold truncate">{currentTrack.title}</h2>
            <p className="text-sp-muted">{currentTrack.artist}</p>
          </div>
          <button className="text-sp-muted hover:text-sp-green">
            <MdFavoriteBorder size={24} />
          </button>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={progress}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full"
            style={{
              background: `linear-gradient(to right, #1DB954 ${progressPct}%, #535353 ${progressPct}%)`,
              borderRadius: '4px',
              height: '6px',
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          />
          <div className="flex justify-between text-sp-muted text-xs">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SHUFFLE' })}
            className={isShuffled ? 'text-sp-green' : 'text-sp-muted hover:text-white'}
          >
            <MdShuffle size={24} />
          </button>

          <button onClick={playPrev} className="text-white hover:text-sp-green transition-colors">
            <MdSkipPrevious size={36} />
          </button>

          <button
            onClick={togglePlay}
            className="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-xl"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <MdPause size={36} className="text-black" />
            ) : (
              <MdPlayArrow size={36} className="text-black" />
            )}
          </button>

          <button onClick={playNext} className="text-white hover:text-sp-green transition-colors">
            <MdSkipNext size={36} />
          </button>

          <button
            onClick={() => dispatch({ type: 'NEXT_REPEAT_MODE' })}
            className={repeatMode !== 'off' ? 'text-sp-green' : 'text-sp-muted hover:text-white'}
          >
            {repeatMode === 'one' ? <MdRepeatOne size={24} /> : <MdRepeat size={24} />}
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_MUTE' })}
            className="text-sp-muted"
          >
            {isMuted ? <MdVolumeOff size={20} /> : <MdVolumeUp size={20} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-1"
            style={{
              background: `linear-gradient(to right, #ffffff ${(isMuted ? 0 : volume) * 100}%, #535353 ${(isMuted ? 0 : volume) * 100}%)`,
              borderRadius: '2px',
              height: '4px',
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          />
          <MdVolumeUp size={20} className="text-sp-muted" />
        </div>
      </div>
    </div>
  );
}
