import { useState, useEffect } from 'react';
import { fetchTracks } from '../api';
import TrackRow from './TrackRow';

export default function ArtistView({ artist, player }) {
  const [tracks, setTracks] = useState([]);

  useEffect(() => {
    if (artist) {
      fetchTracks({ artist }).then(setTracks);
    }
  }, [artist]);

  return (
    <div>
      <div className="flex items-center gap-6 mb-8">
        <div className="w-32 h-32 rounded-full bg-surface-800 flex items-center justify-center shrink-0">
          <svg className="w-16 h-16 text-surface-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-surface-400 uppercase tracking-wider">Artist</p>
          <h2 className="text-3xl font-bold mt-1">{artist}</h2>
          <p className="text-surface-400 mt-1">{tracks.length} tracks</p>
        </div>
      </div>

      {tracks.length > 0 && (
        <button
          onClick={() => player.playAll(tracks)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors mb-6"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          Play All
        </button>
      )}

      <div className="space-y-0.5">
        <div className="grid grid-cols-[2rem_1fr_1fr_4rem] gap-4 px-4 py-2 text-xs font-medium text-surface-400 uppercase tracking-wider border-b border-surface-800">
          <span>#</span>
          <span>Title</span>
          <span>Album</span>
          <span className="text-right">Duration</span>
        </div>
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i + 1}
            isActive={player.currentTrack?.id === track.id}
            isPlaying={player.currentTrack?.id === track.id && player.isPlaying}
            onPlay={() => player.playTrack(track, tracks)}
            player={player}
          />
        ))}
      </div>
    </div>
  );
}
