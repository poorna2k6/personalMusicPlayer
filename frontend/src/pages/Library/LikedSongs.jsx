import React, { useState, useEffect } from 'react';
import { MdPlayArrow, MdShuffle } from 'react-icons/md';
import api from '../../utils/api';
import { usePlayer } from '../../context/PlayerContext';
import TrackCard from '../../components/Cards/TrackCard';

export default function LikedSongs() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { playTrack, dispatch } = usePlayer();

  useEffect(() => {
    api.get('/music/liked')
      .then((data) => setTracks(data.map((t) => ({
        videoId: t.video_id,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnail,
        duration: t.duration,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const playAll = () => {
    if (tracks.length > 0) playTrack(tracks[0], tracks, 0);
  };

  const shuffle = () => {
    if (tracks.length === 0) return;
    const idx = Math.floor(Math.random() * tracks.length);
    playTrack(tracks[idx], tracks, idx);
    dispatch({ type: 'TOGGLE_SHUFFLE' });
  };

  return (
    <div className="pb-8">
      {/* Hero */}
      <div className="px-6 py-8 bg-gradient-to-b from-indigo-800 to-sp-dark mb-4">
        <div className="w-48 h-48 mx-auto mb-4 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-white flex items-center justify-center shadow-2xl">
          <span className="text-6xl">♥</span>
        </div>
        <h1 className="text-3xl font-bold text-white">Liked Songs</h1>
        <p className="text-sp-muted mt-1">{tracks.length} songs</p>
      </div>

      {tracks.length > 0 && (
        <div className="flex items-center gap-3 px-6 mb-4">
          <button
            onClick={playAll}
            className="w-14 h-14 bg-sp-green rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
          >
            <MdPlayArrow size={30} className="text-black ml-1" />
          </button>
          <button
            onClick={shuffle}
            className="text-sp-muted hover:text-sp-green transition-colors"
          >
            <MdShuffle size={28} />
          </button>
        </div>
      )}

      <div className="px-6 space-y-1">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-sp-card rounded-md animate-pulse" />
          ))
        ) : tracks.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white font-bold text-lg mb-2">Songs you like will appear here</p>
            <p className="text-sp-muted">Save songs by tapping the heart icon</p>
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
