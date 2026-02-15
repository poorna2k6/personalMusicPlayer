import { useState, useEffect } from 'react';
import { fetchTracks } from '../api';
import TrackRow from './TrackRow';

export default function AlbumView({ album, artist, player }) {
  const [tracks, setTracks] = useState([]);

  useEffect(() => {
    if (album) {
      fetchTracks({ album: album.album || album, artist }).then(setTracks);
    }
  }, [album, artist]);

  const albumName = album?.album || album;

  return (
    <div>
      <div className="flex items-center gap-6 mb-8">
        <div className="w-40 h-40 rounded-xl bg-surface-800 overflow-hidden shrink-0 flex items-center justify-center">
          {album?.cover_art ? (
            <img src={album.cover_art} alt={albumName} className="w-full h-full object-cover" />
          ) : (
            <svg className="w-16 h-16 text-surface-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
            </svg>
          )}
        </div>
        <div>
          <p className="text-sm text-surface-400 uppercase tracking-wider">Album</p>
          <h2 className="text-3xl font-bold mt-1">{albumName}</h2>
          <p className="text-surface-400 mt-1">{artist} &middot; {tracks.length} tracks</p>
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
        <div className="grid grid-cols-[2rem_1fr_4rem] gap-4 px-4 py-2 text-xs font-medium text-surface-400 uppercase tracking-wider border-b border-surface-800">
          <span>#</span>
          <span>Title</span>
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
