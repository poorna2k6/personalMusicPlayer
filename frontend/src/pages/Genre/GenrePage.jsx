import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MdPlayArrow, MdShuffle } from 'react-icons/md';
import api from '../../utils/api';
import { usePlayer } from '../../context/PlayerContext';
import TrackCard from '../../components/Cards/TrackCard';

export default function GenrePage() {
  const { tag } = useParams();
  const decodedTag = decodeURIComponent(tag);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { playTrack, dispatch } = usePlayer();

  useEffect(() => {
    setLoading(true);
    api.get(`/recommendations/genre/${encodeURIComponent(decodedTag)}`)
      .then(setTracks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tag]);

  const playAll = () => {
    if (tracks.length > 0) playTrack(tracks[0], tracks, 0);
  };

  return (
    <div className="pb-8">
      <div className="px-6 py-10 mb-4 bg-gradient-to-b from-sp-card to-transparent">
        <h1 className="text-4xl font-black text-white capitalize">{decodedTag}</h1>
        <p className="text-sp-muted mt-1">{tracks.length} songs</p>
      </div>

      {!loading && tracks.length > 0 && (
        <div className="flex items-center gap-4 px-6 mb-4">
          <button
            onClick={playAll}
            className="w-14 h-14 bg-sp-green rounded-full flex items-center justify-center hover:scale-105 transition-transform"
          >
            <MdPlayArrow size={30} className="text-black ml-1" />
          </button>
          <button
            onClick={() => { playAll(); dispatch({ type: 'TOGGLE_SHUFFLE' }); }}
            className="text-sp-muted hover:text-sp-green"
          >
            <MdShuffle size={28} />
          </button>
        </div>
      )}

      <div className="px-6 space-y-1">
        {loading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="h-14 bg-sp-card rounded-md animate-pulse" />
          ))
        ) : (
          tracks.map((track, i) => (
            <TrackCard key={track.videoId} track={track} tracks={tracks} index={i} showIndex showDuration />
          ))
        )}
      </div>
    </div>
  );
}
