import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MdPlayArrow, MdShuffle } from 'react-icons/md';
import api from '../../utils/api';
import { usePlayer } from '../../context/PlayerContext';
import TrackCard from '../../components/Cards/TrackCard';

export default function MoodPage() {
  const { query } = useParams();
  const decodedQuery = decodeURIComponent(query);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { playTrack, dispatch } = usePlayer();

  useEffect(() => {
    setLoading(true);
    setTracks([]);
    api.get(`/recommendations/mood/${encodeURIComponent(decodedQuery)}`)
      .then(setTracks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query]);

  const playAll = () => {
    if (tracks.length > 0) playTrack(tracks[0], tracks, 0);
  };

  const shuffle = () => {
    if (tracks.length === 0) return;
    const idx = Math.floor(Math.random() * tracks.length);
    playTrack(tracks[idx], tracks, idx);
    dispatch({ type: 'TOGGLE_SHUFFLE' });
  };

  // Generate a color from query string
  const colors = ['#e13300', '#8d67ab', '#477d95', '#e8115b', '#148a08', '#1e3264', '#6c63ff', '#f9ca24'];
  const color = colors[decodedQuery.charCodeAt(0) % colors.length];

  return (
    <div className="pb-8">
      {/* Hero */}
      <div
        className="px-6 py-12 mb-4"
        style={{ background: `linear-gradient(to bottom, ${color}99 0%, #121212 100%)` }}
      >
        <h1 className="text-4xl font-black text-white mb-2 capitalize">
          {decodedQuery.replace(/music|songs|2024|playlist/gi, '').trim() || 'Playlist'}
        </h1>
        <p className="text-sp-muted text-sm">{tracks.length} songs</p>
      </div>

      {/* Controls */}
      {!loading && tracks.length > 0 && (
        <div className="flex items-center gap-4 px-6 mb-4">
          <button
            onClick={playAll}
            className="w-14 h-14 bg-sp-green rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
          >
            <MdPlayArrow size={30} className="text-black ml-1" />
          </button>
          <button onClick={shuffle} className="text-sp-muted hover:text-sp-green transition-colors">
            <MdShuffle size={28} />
          </button>
        </div>
      )}

      {/* Tracks */}
      <div className="px-6 space-y-1">
        {loading ? (
          [...Array(10)].map((_, i) => (
            <div key={i} className="h-14 bg-sp-card rounded-md animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
          ))
        ) : tracks.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-white font-bold text-lg">No songs found</p>
            <p className="text-sp-muted">Try a different search</p>
          </div>
        ) : (
          tracks.map((track, i) => (
            <TrackCard
              key={track.videoId}
              track={track}
              tracks={tracks}
              index={i}
              showIndex
              showDuration
            />
          ))
        )}
      </div>
    </div>
  );
}
