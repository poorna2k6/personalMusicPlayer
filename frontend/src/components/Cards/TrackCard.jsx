import React, { useState } from 'react';
import { MdPlayArrow, MdPause, MdMoreVert, MdQueueMusic, MdFavorite, MdPlaylistAdd } from 'react-icons/md';
import { usePlayer } from '../../context/PlayerContext';
import { formatTime } from '../../utils/format';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function TrackCard({ track, tracks = [], index = 0, showIndex = false, showDuration = false }) {
  const { currentTrack, isPlaying, playTrack, addToQueue, togglePlay } = usePlayer();
  const [menuOpen, setMenuOpen] = useState(false);

  const isCurrent = currentTrack?.videoId === track.videoId;

  const handlePlay = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, tracks.length > 0 ? tracks : [track], index);
    }
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    try {
      const res = await api.post('/music/like', {
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        duration: track.duration,
      });
      toast.success(res.liked ? '❤️ Added to Liked Songs' : 'Removed from Liked Songs');
    } catch {
      toast.error('Failed to update likes');
    }
    setMenuOpen(false);
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-md group cursor-pointer transition-colors hover:bg-sp-hover ${
        isCurrent ? 'bg-sp-hover' : ''
      }`}
      onClick={handlePlay}
    >
      {/* Index / Play button */}
      <div className="w-8 flex items-center justify-center flex-shrink-0">
        {isCurrent && isPlaying ? (
          <div className="flex items-end gap-0.5 h-4">
            <span className="equalizer-bar" style={{ height: '8px' }} />
            <span className="equalizer-bar" style={{ height: '14px' }} />
            <span className="equalizer-bar" style={{ height: '6px' }} />
          </div>
        ) : (
          <>
            <span className={`text-sm group-hover:hidden ${isCurrent ? 'text-sp-green' : 'text-sp-muted'}`}>
              {showIndex ? index + 1 : ''}
            </span>
            <MdPlayArrow
              size={20}
              className={`hidden group-hover:block ${isCurrent ? 'text-sp-green' : 'text-white'}`}
            />
          </>
        )}
      </div>

      {/* Thumbnail */}
      <img
        src={track.thumbnail || `https://img.youtube.com/vi/${track.videoId}/mqdefault.jpg`}
        alt={track.title}
        className="w-10 h-10 rounded object-cover flex-shrink-0"
        onError={(e) => { e.target.src = 'https://via.placeholder.com/40x40/282828/535353?text=♪'; }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCurrent ? 'text-sp-green' : 'text-white'}`}>
          {track.title}
        </p>
        <p className="text-xs text-sp-muted truncate">{track.artist}</p>
      </div>

      {/* Duration */}
      {showDuration && (
        <span className="text-sp-muted text-xs flex-shrink-0 group-hover:hidden">
          {formatTime(track.duration)}
        </span>
      )}

      {/* Context menu */}
      <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="text-sp-muted hover:text-white opacity-0 group-hover:opacity-100 transition-opacity p-1"
        >
          <MdMoreVert size={20} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-8 z-50 bg-sp-card rounded-md shadow-xl py-1 w-48 border border-sp-border">
              <button
                className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-sp-hover w-full text-left"
                onClick={() => { addToQueue(track); setMenuOpen(false); }}
              >
                <MdQueueMusic size={16} /> Add to queue
              </button>
              <button
                className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-sp-hover w-full text-left"
                onClick={handleLike}
              >
                <MdFavorite size={16} /> Like song
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
