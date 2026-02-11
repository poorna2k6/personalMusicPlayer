import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdAdd, MdSearch, MdPlayArrow } from 'react-icons/md';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function Library() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    try {
      const data = await api.get('/playlists');
      setPlaylists(data);
    } catch {
      toast.error('Failed to load library');
    } finally {
      setLoading(false);
    }
  };

  const createPlaylist = async () => {
    const name = `My Playlist #${playlists.length + 1}`;
    try {
      const pl = await api.post('/playlists', { name });
      setPlaylists((prev) => [pl, ...prev]);
      navigate(`/playlist/${pl.id}`);
      toast.success('Playlist created!');
    } catch {
      toast.error('Failed to create playlist');
    }
  };

  return (
    <div className="px-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-2">
        <h1 className="text-2xl font-bold text-white">Your Library</h1>
        <div className="flex items-center gap-2">
          <button className="text-sp-muted hover:text-white">
            <MdSearch size={22} />
          </button>
          <button
            onClick={createPlaylist}
            className="w-8 h-8 rounded-full bg-sp-muted/20 hover:bg-sp-muted/30 flex items-center justify-center text-sp-muted hover:text-white transition-colors"
          >
            <MdAdd size={22} />
          </button>
        </div>
      </div>

      {/* Liked Songs */}
      <div
        className="flex items-center gap-4 p-3 rounded-md hover:bg-sp-hover cursor-pointer group mb-2"
        onClick={() => navigate('/liked')}
      >
        <div className="w-12 h-12 rounded bg-gradient-to-br from-indigo-500 to-white flex items-center justify-center flex-shrink-0">
          <span className="text-xl">♥</span>
        </div>
        <div className="flex-1">
          <p className="text-white text-sm font-medium">Liked Songs</p>
          <p className="text-sp-muted text-xs">Playlist</p>
        </div>
      </div>

      {/* Playlists */}
      {loading ? (
        <div className="space-y-2 mt-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-sp-card rounded-md animate-pulse" />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-sp-card rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">🎵</span>
          </div>
          <p className="text-white font-bold text-lg mb-2">Create your first playlist</p>
          <p className="text-sp-muted text-sm mb-6">It's easy, we'll help you</p>
          <button
            onClick={createPlaylist}
            className="bg-white text-black font-bold px-6 py-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            Create playlist
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {playlists.map((pl) => (
            <PlaylistRow key={pl.id} playlist={pl} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlaylistRow({ playlist }) {
  const navigate = useNavigate();

  return (
    <div
      className="flex items-center gap-4 p-3 rounded-md hover:bg-sp-hover cursor-pointer group"
      onClick={() => navigate(`/playlist/${playlist.id}`)}
    >
      <div className="w-12 h-12 rounded bg-sp-card flex items-center justify-center flex-shrink-0 relative overflow-hidden">
        {playlist.cover_url ? (
          <img src={playlist.cover_url} alt={playlist.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sp-muted text-xl">🎵</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{playlist.name}</p>
        <p className="text-sp-muted text-xs">
          Playlist · {playlist.trackCount || 0} songs
        </p>
      </div>
    </div>
  );
}
