import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MdPlayArrow, MdShuffle, MdEdit, MdDelete, MdMoreVert } from 'react-icons/md';
import api from '../../utils/api';
import { usePlayer } from '../../context/PlayerContext';
import TrackCard from '../../components/Cards/TrackCard';
import toast from 'react-hot-toast';

export default function Playlist() {
  const { id } = useParams();
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const { playTrack, dispatch } = usePlayer();
  const navigate = useNavigate();

  useEffect(() => {
    loadPlaylist();
  }, [id]);

  const loadPlaylist = async () => {
    try {
      const data = await api.get(`/playlists/${id}`);
      setPlaylist(data);
      setEditName(data.name);
    } catch {
      toast.error('Playlist not found');
      navigate('/library');
    } finally {
      setLoading(false);
    }
  };

  const tracks = playlist?.tracks?.map((t) => ({
    videoId: t.video_id,
    title: t.title,
    artist: t.artist,
    thumbnail: t.thumbnail,
    duration: t.duration,
    _trackId: t.id,
  })) || [];

  const playAll = () => {
    if (tracks.length > 0) playTrack(tracks[0], tracks, 0);
  };

  const shuffle = () => {
    if (tracks.length === 0) return;
    const idx = Math.floor(Math.random() * tracks.length);
    playTrack(tracks[idx], tracks, idx);
    dispatch({ type: 'TOGGLE_SHUFFLE' });
  };

  const deletePlaylist = async () => {
    if (!window.confirm('Delete this playlist?')) return;
    try {
      await api.delete(`/playlists/${id}`);
      toast.success('Playlist deleted');
      navigate('/library');
    } catch {
      toast.error('Failed to delete playlist');
    }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/playlists/${id}`, { name: editName });
      setPlaylist((p) => ({ ...p, name: editName }));
      setEditing(false);
      toast.success('Playlist updated');
    } catch {
      toast.error('Failed to update');
    }
  };

  const removeTrack = async (trackId) => {
    try {
      await api.delete(`/playlists/${id}/tracks/${trackId}`);
      setPlaylist((p) => ({
        ...p,
        tracks: p.tracks.filter((t) => t.id !== trackId),
      }));
      toast.success('Removed from playlist');
    } catch {
      toast.error('Failed to remove track');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-sp-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Color based on playlist id
  const colors = ['#2d46b9', '#8d67ab', '#477d95', '#e13300', '#e8115b', '#148a08'];
  const color = colors[id.charCodeAt(0) % colors.length];

  return (
    <div className="pb-8">
      {/* Hero */}
      <div
        className="px-6 py-8 mb-4"
        style={{ background: `linear-gradient(to bottom, ${color}88 0%, ${color}22 60%, #121212 100%)` }}
      >
        <div
          className="w-48 h-48 mx-auto mb-4 rounded-lg flex items-center justify-center shadow-2xl"
          style={{ backgroundColor: color }}
        >
          {playlist.cover_url ? (
            <img src={playlist.cover_url} alt={playlist.name} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span className="text-6xl">🎵</span>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="bg-white/10 text-white text-2xl font-bold rounded px-3 py-1 outline-none border border-white/30 flex-1"
              onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
              autoFocus
            />
            <button onClick={saveEdit} className="bg-sp-green text-black font-bold px-4 py-1 rounded-full text-sm">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-sp-muted text-sm px-2">
              Cancel
            </button>
          </div>
        ) : (
          <h1 className="text-3xl font-bold text-white">{playlist.name}</h1>
        )}
        {playlist.description && (
          <p className="text-sp-muted mt-1 text-sm">{playlist.description}</p>
        )}
        <p className="text-sp-muted mt-1 text-sm">{tracks.length} songs</p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 px-6 mb-4">
        {tracks.length > 0 && (
          <>
            <button
              onClick={playAll}
              className="w-14 h-14 bg-sp-green rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
            >
              <MdPlayArrow size={30} className="text-black ml-1" />
            </button>
            <button onClick={shuffle} className="text-sp-muted hover:text-sp-green transition-colors">
              <MdShuffle size={28} />
            </button>
          </>
        )}

        <div className="ml-auto relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-sp-muted hover:text-white"
          >
            <MdMoreVert size={24} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-50 bg-sp-card rounded-md shadow-xl py-1 w-40 border border-sp-border">
                <button
                  className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-sp-hover w-full"
                  onClick={() => { setEditing(true); setMenuOpen(false); }}
                >
                  <MdEdit size={16} /> Rename
                </button>
                <button
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-sp-hover w-full"
                  onClick={() => { deletePlaylist(); setMenuOpen(false); }}
                >
                  <MdDelete size={16} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tracks */}
      <div className="px-6 space-y-1">
        {tracks.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-white font-bold text-lg mb-2">Your playlist is empty</p>
            <p className="text-sp-muted">Find songs and add them here</p>
          </div>
        ) : (
          tracks.map((track, i) => (
            <div key={track.videoId} className="group relative">
              <TrackCard
                track={track}
                tracks={tracks}
                index={i}
                showIndex
                showDuration
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
