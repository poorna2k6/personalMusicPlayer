import { useState } from 'react';
import { createPlaylist } from '../api';

export default function Sidebar({ view, setView, playlists, onSelectPlaylist, onUpdate, hasRecentlyPlayed }) {
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createPlaylist(newName.trim());
    setNewName('');
    setShowNewPlaylist(false);
    onUpdate();
  };

  const navItems = [
    { id: 'tracks', label: 'All Tracks', icon: MusicIcon },
    { id: 'artists', label: 'Artists', icon: ArtistIcon },
    { id: 'albums', label: 'Albums', icon: AlbumIcon },
    ...(hasRecentlyPlayed ? [{ id: 'recent', label: 'Recently Played', icon: RecentIcon }] : []),
  ];

  return (
    <aside className="w-60 bg-surface-900 border-r border-surface-800 flex flex-col overflow-y-auto shrink-0">
      <nav className="p-3 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
              view === id
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'text-surface-300 hover:bg-surface-800 hover:text-white'
            }`}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      <div className="border-t border-surface-800 mt-2 pt-2 px-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Playlists</span>
          <button
            onClick={() => setShowNewPlaylist(!showNewPlaylist)}
            className="text-surface-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {showNewPlaylist && (
          <div className="flex gap-1 mb-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Playlist name"
              className="flex-1 px-2 py-1 text-sm rounded bg-surface-800 border border-surface-700 text-white placeholder-surface-500 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <button
              onClick={handleCreate}
              className="px-2 py-1 text-sm rounded bg-indigo-600 hover:bg-indigo-500"
            >
              Add
            </button>
          </div>
        )}

        <div className="space-y-0.5">
          {playlists.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectPlaylist(p)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-sm transition-colors text-left ${
                view === 'playlist'
                  ? 'text-surface-300 hover:bg-surface-800'
                  : 'text-surface-300 hover:bg-surface-800'
              }`}
            >
              <svg className="w-4 h-4 shrink-0 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" />
              </svg>
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-xs text-surface-500">{p.track_count}</span>
            </button>
          ))}
          {playlists.length === 0 && (
            <p className="text-xs text-surface-500 px-3 py-2">No playlists yet</p>
          )}
        </div>
      </div>
    </aside>
  );
}

function MusicIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
    </svg>
  );
}

function ArtistIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
    </svg>
  );
}

function AlbumIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 7a3 3 0 100 6 3 3 0 000-6z" />
    </svg>
  );
}

function RecentIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}
