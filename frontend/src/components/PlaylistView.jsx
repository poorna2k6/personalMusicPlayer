import { useState, useEffect } from 'react';
import { fetchPlaylist, deletePlaylist, removeTrackFromPlaylist } from '../api';
import TrackRow from './TrackRow';

export default function PlaylistView({ playlistId, player, onUpdate }) {
  const [playlist, setPlaylist] = useState(null);

  const load = () => {
    if (playlistId) {
      fetchPlaylist(playlistId).then(setPlaylist);
    }
  };

  useEffect(() => {
    load();
  }, [playlistId]);

  const handleDelete = async () => {
    if (!confirm('Delete this playlist?')) return;
    await deletePlaylist(playlistId);
    onUpdate();
  };

  const handleRemoveTrack = async (trackId) => {
    await removeTrackFromPlaylist(playlistId, trackId);
    load();
    onUpdate();
  };

  if (!playlist) {
    return <p className="text-surface-400">Loading playlist...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-surface-400 uppercase tracking-wider">Playlist</p>
          <h2 className="text-3xl font-bold mt-1">{playlist.name}</h2>
          <p className="text-surface-400 mt-1">{playlist.tracks?.length || 0} tracks</p>
        </div>
        <div className="flex gap-2">
          {playlist.tracks?.length > 0 && (
            <button
              onClick={() => player.playAll(playlist.tracks)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play All
            </button>
          )}
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {playlist.tracks?.length > 0 ? (
        <div className="space-y-0.5">
          <div className="grid grid-cols-[2rem_1fr_1fr_1fr_6rem] gap-4 px-4 py-2 text-xs font-medium text-surface-400 uppercase tracking-wider border-b border-surface-800">
            <span>#</span>
            <span>Title</span>
            <span>Artist</span>
            <span>Album</span>
            <span className="text-right">Actions</span>
          </div>
          {playlist.tracks.map((track, i) => (
            <div key={`${track.id}-${i}`} className="group flex items-center">
              <div className="flex-1">
                <TrackRow
                  track={track}
                  index={i + 1}
                  isActive={player.currentTrack?.id === track.id}
                  isPlaying={player.currentTrack?.id === track.id && player.isPlaying}
                  onPlay={() => player.playTrack(track, playlist.tracks)}
                  player={player}
                />
              </div>
              <button
                onClick={() => handleRemoveTrack(track.id)}
                className="opacity-0 group-hover:opacity-100 px-2 py-1 text-red-400 hover:text-red-300 transition-opacity text-sm"
                title="Remove from playlist"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-surface-400">This playlist is empty.</p>
          <p className="text-surface-500 text-sm mt-1">Browse your library and add tracks using the menu.</p>
        </div>
      )}
    </div>
  );
}
