import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MdPlayArrow, MdShuffle } from 'react-icons/md';
import api from '../../utils/api';
import { usePlayer } from '../../context/PlayerContext';
import TrackCard from '../../components/Cards/TrackCard';
import ArtistCard from '../../components/Cards/ArtistCard';
import { getInitials } from '../../utils/format';

export default function Artist() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { playTrack, dispatch } = usePlayer();

  useEffect(() => {
    setLoading(true);
    api.get(`/recommendations/artist/${encodeURIComponent(decodedName)}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [name]);

  const playAll = () => {
    if (data?.tracks?.length > 0) playTrack(data.tracks[0], data.tracks, 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-sp-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Hero */}
      <div className="relative h-64 overflow-hidden">
        {data?.info?.image ? (
          <img
            src={data.info.image}
            alt={decodedName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-sp-card to-sp-dark flex items-center justify-center">
            <span className="text-8xl font-bold text-sp-subtle">{getInitials(decodedName)}</span>
          </div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #121212 20%, transparent 80%)' }} />
        <div className="absolute bottom-4 left-6">
          <p className="text-white text-xs uppercase font-bold tracking-widest mb-1">Artist</p>
          <h1 className="text-4xl font-black text-white">{decodedName}</h1>
          {data?.info?.listeners && (
            <p className="text-sp-muted text-sm mt-1">
              {parseInt(data.info.listeners).toLocaleString()} monthly listeners
            </p>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 px-6 py-4">
        <button
          onClick={playAll}
          className="w-14 h-14 bg-sp-green rounded-full flex items-center justify-center hover:scale-105 transition-transform"
        >
          <MdPlayArrow size={30} className="text-black ml-1" />
        </button>
        <button
          onClick={() => { playAll(); dispatch({ type: 'TOGGLE_SHUFFLE' }); }}
          className="text-sp-muted hover:text-white"
        >
          <MdShuffle size={28} />
        </button>
      </div>

      {/* Bio */}
      {data?.info?.bio && (
        <div className="px-6 mb-6">
          <h2 className="text-white font-bold text-lg mb-2">About</h2>
          <p className="text-sp-muted text-sm leading-relaxed line-clamp-3">{data.info.bio}</p>
        </div>
      )}

      {/* Tags */}
      {data?.info?.tags?.length > 0 && (
        <div className="px-6 mb-6 flex flex-wrap gap-2">
          {data.info.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="bg-sp-card text-sp-muted text-xs px-3 py-1 rounded-full border border-sp-border">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Popular tracks */}
      {data?.tracks?.length > 0 && (
        <div className="px-6 mb-8">
          <h2 className="text-white font-bold text-lg mb-3">Popular</h2>
          <div className="space-y-1">
            {data.tracks.map((track, i) => (
              <TrackCard
                key={track.videoId}
                track={track}
                tracks={data.tracks}
                index={i}
                showIndex
                showDuration
              />
            ))}
          </div>
        </div>
      )}

      {/* Similar artists */}
      {data?.similar?.length > 0 && (
        <div className="px-6">
          <h2 className="text-white font-bold text-lg mb-4">Similar Artists</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {data.similar.slice(0, 6).map((artist, i) => (
              <ArtistCard key={i} artist={artist} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
