import React, { useState } from 'react';
import {
  MdPlayArrow, MdPause, MdSkipNext, MdSkipPrevious,
  MdShuffle, MdRepeat, MdRepeatOne, MdVolumeUp, MdVolumeOff,
  MdFavorite, MdFavoriteBorder, MdQueueMusic, MdOpenInFull
} from 'react-icons/md';
import { usePlayer } from '../../context/PlayerContext';
import { formatTime } from '../../utils/format';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function Player({ onExpand }) {
  const {
    currentTrack, isPlaying, isLoading, progress, duration,
    volume, isMuted, repeatMode, isShuffled,
    togglePlay, seek, playNext, playPrev,
    setVolume, dispatch,
  } = usePlayer();

  const [liked, setLiked] = useState(false);

  const handleLike = async () => {
    if (!currentTrack) return;
    try {
      const res = await api.post('/music/like', {
        videoId: currentTrack.videoId,
        title: currentTrack.title,
        artist: currentTrack.artist,
        thumbnail: currentTrack.thumbnail,
        duration: currentTrack.duration,
      });
      setLiked(res.liked);
      toast.success(res.liked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    } catch {}
  };

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const volumePct = isMuted ? 0 : volume * 100;

  if (!currentTrack) {
    return (
      <div className="h-20 bg-sp-dark border-t border-sp-border flex items-center justify-center">
        <p className="text-sp-subtle text-sm">Pick a song to start playing</p>
      </div>
    );
  }

  return (
    <div className="h-20 bg-sp-dark border-t border-sp-border flex items-center px-4 gap-4 select-none">
      {/* Track Info */}
      <div
        className="flex items-center gap-3 w-64 min-w-0 cursor-pointer group"
        onClick={onExpand}
      >
        <div className="relative flex-shrink-0">
          <img
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="w-14 h-14 rounded object-cover"
            onError={(e) => { e.target.src = 'https://via.placeholder.com/56x56/282828/535353?text=♪'; }}
          />
          {isLoading && (
            <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-sp-green border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate group-hover:underline">
            {currentTrack.title}
          </p>
          <p className="text-sp-muted text-xs truncate">{currentTrack.artist}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleLike(); }}
          className={`ml-2 flex-shrink-0 ${liked ? 'text-sp-green' : 'text-sp-muted hover:text-white'}`}
        >
          {liked ? <MdFavorite size={18} /> : <MdFavoriteBorder size={18} />}
        </button>
      </div>

      {/* Center Controls */}
      <div className="flex-1 flex flex-col items-center gap-1.5 max-w-xl">
        {/* Buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SHUFFLE' })}
            className={`transition-colors ${isShuffled ? 'text-sp-green' : 'text-sp-muted hover:text-white'}`}
          >
            <MdShuffle size={20} />
          </button>

          <button
            onClick={playPrev}
            className="text-sp-muted hover:text-white transition-colors"
          >
            <MdSkipPrevious size={28} />
          </button>

          <button
            onClick={togglePlay}
            className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform flex-shrink-0"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <MdPause size={22} className="text-black" />
            ) : (
              <MdPlayArrow size={22} className="text-black" />
            )}
          </button>

          <button
            onClick={playNext}
            className="text-sp-muted hover:text-white transition-colors"
          >
            <MdSkipNext size={28} />
          </button>

          <button
            onClick={() => dispatch({ type: 'NEXT_REPEAT_MODE' })}
            className={`transition-colors relative ${
              repeatMode !== 'off' ? 'text-sp-green' : 'text-sp-muted hover:text-white'
            }`}
          >
            {repeatMode === 'one' ? <MdRepeatOne size={20} /> : <MdRepeat size={20} />}
            {repeatMode !== 'off' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-sp-green rounded-full" />
            )}
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-sp-muted text-xs w-8 text-right">{formatTime(progress)}</span>
          <div className="flex-1 relative group">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={progress}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="w-full h-1 appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #1DB954 ${progressPct}%, #535353 ${progressPct}%)`,
                borderRadius: '2px',
                height: '4px',
              }}
            />
          </div>
          <span className="text-sp-muted text-xs w-8">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume & Extra */}
      <div className="flex items-center gap-3 w-48 justify-end">
        <button className="text-sp-muted hover:text-white">
          <MdQueueMusic size={20} />
        </button>

        <button
          onClick={() => dispatch({ type: 'TOGGLE_MUTE' })}
          className="text-sp-muted hover:text-white"
        >
          {isMuted || volume === 0 ? <MdVolumeOff size={20} /> : <MdVolumeUp size={20} />}
        </button>

        <div className="w-24">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, #ffffff ${volumePct}%, #535353 ${volumePct}%)`,
              borderRadius: '2px',
              height: '4px',
            }}
          />
        </div>

        <button
          onClick={onExpand}
          className="text-sp-muted hover:text-white"
        >
          <MdOpenInFull size={18} />
        </button>
      </div>
    </div>
  );
}
