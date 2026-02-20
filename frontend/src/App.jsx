import { useState, useEffect } from 'react';
import { usePlayerStore } from './hooks/usePlayerStore';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Library from './components/Library';
import AlbumView from './components/AlbumView';
import ArtistView from './components/ArtistView';
import PlaylistView from './components/PlaylistView';
import HomeView from './components/HomeView';
import Player from './components/Player';
import TrackRow from './components/TrackRow';
import AuthScreen from './components/AuthScreen';
import { fetchTracks, fetchArtists, fetchAlbums, fetchPlaylists, scanLibrary } from './api';

export default function App() {
  const player = usePlayerStore();
  const { user, authState, logout } = useAuth();

  const [view, setView] = useState('home');
  const [tracks, setTracks] = useState([]);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const loadData = async () => {
    setLoadError(null);
    try {
      const [t, ar, al, pl] = await Promise.all([
        fetchTracks(),
        fetchArtists(),
        fetchAlbums(),
        fetchPlaylists(),
      ]);
      setTracks(t);
      setArtists(ar);
      setAlbums(al);
      setPlaylists(pl);
      player.updateAllTracks(t);
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoadError('Could not load your music library. Make sure the server is running, then click Retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authState === 'authenticated' || authState === 'skipped') {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await scanLibrary();
      await loadData();
    } catch (err) {
      console.error('Scan failed:', err);
    }
    setScanning(false);
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = await fetchTracks({ search: query });
      setTracks(results);
      setView('tracks');
    } else {
      const t = await fetchTracks();
      setTracks(t);
    }
  };

  const navigate = (newView, payload) => {
    setView(newView);
    if (newView === 'artist') setSelectedArtist(payload);
    else if (newView === 'album') setSelectedAlbum(payload);
    else if (newView === 'playlist') setSelectedPlaylist(payload);
  };

  // Show loading spinner while checking stored auth
  if (authState === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-950">
        <svg className="w-8 h-8 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  // Show auth/login screen when not logged in and not skipped
  if (authState === 'unauthenticated') {
    return <AuthScreen />;
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <svg className="w-10 h-10 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-surface-400 text-sm">Loading your library…</p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
          <svg className="w-12 h-12 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-white font-medium mb-1">Could not load music library</p>
            <p className="text-surface-400 text-sm">{loadError}</p>
          </div>
          <button
            onClick={loadData}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    switch (view) {
      case 'home':
        return <HomeView tracks={tracks} player={player} playlists={playlists} onUpdate={loadData} />;
      case 'artist':
        return <ArtistView artist={selectedArtist} player={player} />;
      case 'album':
        return <AlbumView album={selectedAlbum} artist={selectedAlbum?.artist} player={player} />;
      case 'playlist':
        return (
          <PlaylistView
            playlistId={selectedPlaylist?.id}
            player={player}
            onUpdate={loadData}
          />
        );
      case 'artists':
        return (
          <ArtistList artists={artists} onSelect={(a) => navigate('artist', a.artist)} />
        );
      case 'albums':
        return (
          <AlbumList albums={albums} onSelect={(a) => navigate('album', a)} />
        );
      case 'recent':
        return <RecentlyPlayed tracks={player.recentlyPlayed} player={player} playlists={playlists} onUpdate={loadData} />;
      default:
        return <Library tracks={tracks} player={player} playlists={playlists} onUpdate={loadData} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-surface-950">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-surface-900 border-b border-surface-800 shrink-0">
        <h1
          className="text-xl font-bold text-indigo-400 cursor-pointer"
          onClick={() => { setView('home'); setSearchQuery(''); loadData(); }}
        >
          Raagam
        </h1>
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Search tracks..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="px-4 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-sm text-white placeholder-surface-400 focus:outline-none focus:border-indigo-500 w-64"
          />
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {scanning ? 'Scanning…' : 'Scan Library'}
          </button>

          {/* User avatar / guest badge */}
          {authState === 'authenticated' && user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-2 rounded-full focus:outline-none"
                title={user.name}
              >
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-8 h-8 rounded-full border-2 border-indigo-500"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold border-2 border-indigo-500">
                    {user.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </button>
              {showUserMenu && (
                <div
                  className="absolute right-0 top-10 w-52 bg-surface-800 border border-surface-700 rounded-xl shadow-xl z-50 overflow-hidden"
                  onMouseLeave={() => setShowUserMenu(false)}
                >
                  <div className="px-4 py-3 border-b border-surface-700">
                    <p className="text-sm font-medium text-white truncate">{user.name}</p>
                    <p className="text-xs text-surface-400 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-surface-500 bg-surface-800 px-2.5 py-1 rounded-full border border-surface-700">
              Guest
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          view={view}
          setView={setView}
          playlists={playlists}
          onSelectPlaylist={(p) => navigate('playlist', p)}
          onUpdate={loadData}
          hasRecentlyPlayed={player.recentlyPlayed.length > 0}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </main>
      </div>

      {/* Bottom player */}
      <Player player={player} />
    </div>
  );
}

function ArtistList({ artists, onSelect }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Artists</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {artists.map((a) => (
          <button
            key={a.artist}
            onClick={() => onSelect(a)}
            className="p-4 rounded-xl bg-surface-800 hover:bg-surface-700 transition-colors text-left"
          >
            <div className="w-full aspect-square rounded-lg bg-surface-700 flex items-center justify-center mb-3">
              <svg className="w-12 h-12 text-surface-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <p className="font-medium truncate">{a.artist}</p>
            <p className="text-sm text-surface-400">{a.track_count} tracks</p>
          </button>
        ))}
      </div>
      {artists.length === 0 && (
        <p className="text-surface-400 text-center mt-12">No artists found. Scan your library to get started.</p>
      )}
    </div>
  );
}

function AlbumList({ albums, onSelect }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Albums</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {albums.map((a) => (
          <button
            key={`${a.album}-${a.artist}`}
            onClick={() => onSelect(a)}
            className="p-4 rounded-xl bg-surface-800 hover:bg-surface-700 transition-colors text-left"
          >
            <div className="w-full aspect-square rounded-lg bg-surface-700 flex items-center justify-center mb-3 overflow-hidden">
              {a.cover_art ? (
                <img src={a.cover_art} alt={a.album} className="w-full h-full object-cover" />
              ) : (
                <svg className="w-12 h-12 text-surface-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
                </svg>
              )}
            </div>
            <p className="font-medium truncate">{a.album}</p>
            <p className="text-sm text-surface-400 truncate">{a.artist}</p>
          </button>
        ))}
      </div>
      {albums.length === 0 && (
        <p className="text-surface-400 text-center mt-12">No albums found. Scan your library to get started.</p>
      )}
    </div>
  );
}

function RecentlyPlayed({ tracks, player, playlists, onUpdate }) {
  const { playTrack, currentTrack, isPlaying } = player;

  const formatRelativeTime = (ts) => {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Recently Played</h2>
        <span className="text-sm text-surface-400">{tracks.length} tracks</span>
      </div>

      {tracks.length > 0 ? (
        <div className="space-y-0.5">
          <div className="grid grid-cols-[2rem_1fr_1fr_1fr_6rem] gap-4 px-4 py-2 text-xs font-medium text-surface-400 uppercase tracking-wider border-b border-surface-800">
            <span>#</span>
            <span>Title</span>
            <span>Artist</span>
            <span>Album</span>
            <span className="text-right">Played</span>
          </div>
          {tracks.map((track, i) => (
            <div key={`${track.id}-${track.playedAt}`} className="relative">
              <TrackRow
                track={track}
                index={i + 1}
                isActive={currentTrack?.id === track.id}
                isPlaying={currentTrack?.id === track.id && isPlaying}
                onPlay={() => playTrack(track, tracks)}
                playlists={playlists}
                onUpdate={onUpdate}
                player={player}
              />
              <span className="absolute right-12 top-1/2 -translate-y-1/2 text-xs text-surface-500 pointer-events-none">
                {formatRelativeTime(track.playedAt)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <svg className="w-16 h-16 mx-auto text-surface-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
          <h3 className="text-lg font-medium text-surface-300 mb-2">No history yet</h3>
          <p className="text-surface-500">Tracks you play will appear here.</p>
        </div>
      )}
    </div>
  );
}
