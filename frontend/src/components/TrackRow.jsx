import { useState, useRef, useEffect } from 'react';
import { addTrackToPlaylist } from '../api';

export default function TrackRow({ track, index, isActive, isPlaying, onPlay, playlists, onUpdate, player }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleAddToPlaylist = async (playlistId) => {
    await addTrackToPlaylist(playlistId, track.id);
    setShowMenu(false);
    if (onUpdate) onUpdate();
  };

  return (
    <div
      className={`grid grid-cols-[2rem_1fr_1fr_1fr_4rem] gap-4 px-4 py-2 rounded-lg text-sm group cursor-pointer transition-colors ${
        isActive
          ? 'bg-indigo-600/10 text-indigo-400'
          : 'hover:bg-surface-800/50 text-surface-300'
      }`}
      onDoubleClick={onPlay}
    >
      <span className="flex items-center">
        <span className="group-hover:hidden">{isActive && isPlaying ? (
          <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : index}</span>
        <button
          onClick={onPlay}
          className="hidden group-hover:block text-white"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </span>
      <span className="truncate font-medium">{track.title}</span>
      <span className="truncate text-surface-400">{track.artist}</span>
      <span className="truncate text-surface-400">{track.album}</span>
      <div className="flex items-center justify-end gap-2">
        <span className="text-surface-500">{formatDuration(track.duration)}</span>
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="opacity-0 group-hover:opacity-100 text-surface-400 hover:text-white transition-opacity p-0.5"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 bottom-6 z-50 w-48 py-1 rounded-lg bg-surface-800 border border-surface-700 shadow-xl">
              <button
                onClick={() => { player.addToQueue(track); setShowMenu(false); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-700 text-surface-300"
              >
                Add to Queue
              </button>
              {playlists && playlists.length > 0 && (
                <>
                  <div className="border-t border-surface-700 my-1" />
                  <p className="px-3 py-1 text-xs text-surface-500">Add to playlist:</p>
                  {playlists.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddToPlaylist(p.id)}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-700 text-surface-300 truncate"
                    >
                      {p.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
