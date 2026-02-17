import { useState, useEffect } from 'react';
import { usePlayerStore } from './hooks/usePlayerStore';
import Sidebar from './components/Sidebar';
import Library from './components/Library';
import AlbumView from './components/AlbumView';
import ArtistView from './components/ArtistView';
import PlaylistView from './components/PlaylistView';
import Player from './components/Player';
import TrackRow from './components/TrackRow';
import { fetchTracks, fetchArtists, fetchAlbums, fetchPlaylists, scanLibrary } from './api';

export default function App() {
  const player = usePlayerStore();
  const [view, setView] = useState('tracks'); // 'tracks' | 'artists' | 'albums' | 'playlist'
  const [tracks, setTracks] = useState([]);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);

  const loadData = async () => {
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
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const renderContent = () => {
    switch (view) {
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
      <header className="flex items-center justify-between px-6 py-3 bg-surface-900 border-b border-surface-800">
        <h1
          className="text-xl font-bold text-indigo-400 cursor-pointer"
          onClick={() => { setView('tracks'); setSearchQuery(''); loadData(); }}
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
            {scanning ? 'Scanning...' : 'Scan Library'}
          </button>
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
