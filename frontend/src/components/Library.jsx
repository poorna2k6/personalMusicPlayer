import { useState } from 'react';
import TrackRow from './TrackRow';

export default function Library({ tracks, player, playlists, onUpdate }) {
  const { playTrack, playAll, currentTrack, isPlaying } = player;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">All Tracks</h2>
        {tracks.length > 0 && (
          <button
            onClick={() => playAll(tracks)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play All
          </button>
        )}
      </div>

      {tracks.length > 0 ? (
        <div className="space-y-0.5">
          {/* Header */}
          <div className="grid grid-cols-[2rem_1fr_1fr_1fr_4rem] gap-4 px-4 py-2 text-xs font-medium text-surface-400 uppercase tracking-wider border-b border-surface-800">
            <span>#</span>
            <span>Title</span>
            <span>Artist</span>
            <span>Album</span>
            <span className="text-right">Duration</span>
          </div>

          {tracks.map((track, i) => (
            <TrackRow
              key={track.id}
              track={track}
              index={i + 1}
              isActive={currentTrack?.id === track.id}
              isPlaying={currentTrack?.id === track.id && isPlaying}
              onPlay={() => playTrack(track, tracks)}
              playlists={playlists}
              onUpdate={onUpdate}
              player={player}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <svg className="w-16 h-16 mx-auto text-surface-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
          </svg>
          <h3 className="text-lg font-medium text-surface-300 mb-2">No tracks found</h3>
          <p className="text-surface-500">Add music files to your library folder and click "Scan Library" to get started.</p>
        </div>
      )}
    </div>
  );
}
