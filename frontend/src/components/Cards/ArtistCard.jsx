import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getInitials } from '../../utils/format';

export default function ArtistCard({ artist }) {
  const navigate = useNavigate();

  return (
    <div
      className="music-card rounded-lg p-4 cursor-pointer text-center group"
      onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
    >
      <div className="relative mx-auto mb-3">
        {artist.image ? (
          <img
            src={artist.image}
            alt={artist.name}
            className="w-full aspect-square object-cover rounded-full"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="w-full aspect-square rounded-full bg-sp-card flex items-center justify-center text-3xl font-bold text-sp-muted"
          style={{ display: artist.image ? 'none' : 'flex' }}
        >
          {getInitials(artist.name)}
        </div>
      </div>
      <p className="text-white text-sm font-medium truncate">{artist.name}</p>
      <p className="text-sp-muted text-xs mt-0.5">Artist</p>
    </div>
  );
}
