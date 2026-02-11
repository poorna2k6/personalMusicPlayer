import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdPlayArrow } from 'react-icons/md';
import api from '../../utils/api';
import { usePlayer } from '../../context/PlayerContext';
import TrackCard from '../../components/Cards/TrackCard';
import MoodCard from '../../components/Cards/MoodCard';
import ArtistCard from '../../components/Cards/ArtistCard';

export default function Home() {
  const [homeData, setHomeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const { playTrack } = usePlayer();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get('/recommendations/home'),
      api.get('/music/recently-played'),
    ])
      .then(([home, recent]) => {
        setHomeData(home);
        setRecentlyPlayed(recent.slice(0, 6));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-sp-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-6 pb-8 space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-4">{getGreeting()}</h1>

        {/* Recently played grid */}
        {recentlyPlayed.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {recentlyPlayed.map((track) => (
              <button
                key={track.video_id}
                onClick={() => playTrack({
                  videoId: track.video_id,
                  title: track.title,
                  artist: track.artist,
                  thumbnail: track.thumbnail,
                  duration: track.duration,
                })}
                className="flex items-center gap-3 bg-sp-card hover:bg-sp-hover rounded-md overflow-hidden group transition-colors text-left"
              >
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  className="w-12 h-12 object-cover flex-shrink-0"
                  onError={(e) => { e.target.src = 'https://via.placeholder.com/48x48/282828/535353?text=♪'; }}
                />
                <span className="text-white text-sm font-medium truncate pr-2 flex-1">
                  {track.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Trending tracks */}
      {homeData?.trending?.length > 0 && (
        <Section title="Trending Now" onSeeAll={() => navigate('/mood/trending music 2024 hits')}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {homeData.trending.map((track, i) => (
              <TrackTile
                key={track.videoId}
                track={track}
                tracks={homeData.trending}
                index={i}
                onClick={() => playTrack(track, homeData.trending, i)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Moods */}
      {homeData?.moods?.length > 0 && (
        <Section title="Moods & Genres">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {homeData.moods.map((mood) => (
              <MoodCard key={mood.query} mood={mood} />
            ))}
          </div>
        </Section>
      )}

      {/* Top Tracks */}
      {homeData?.topTracks?.length > 0 && (
        <Section title="Global Top 50">
          <div className="space-y-1">
            {homeData.topTracks.slice(0, 10).map((track, i) => (
              <TopTrackRow
                key={i}
                track={track}
                index={i}
                onClick={() => {
                  const query = `${track.artist} ${track.name}`;
                  navigate(`/search?q=${encodeURIComponent(query)}&autoplay=1`);
                }}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Top Artists */}
      {homeData?.topArtists?.length > 0 && (
        <Section title="Popular Artists">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {homeData.topArtists.slice(0, 6).map((artist, i) => (
              <ArtistCard key={i} artist={artist} />
            ))}
          </div>
        </Section>
      )}

      {/* Genres */}
      {homeData?.genres?.length > 0 && (
        <Section title="Browse by Genre">
          <div className="grid grid-cols-4 gap-3">
            {homeData.genres.map((genre) => (
              <GenreChip key={genre.tag} genre={genre} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children, onSeeAll }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-sp-muted text-sm hover:text-white font-medium">
            See all
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function TrackTile({ track, tracks, index, onClick }) {
  const { currentTrack, isPlaying } = usePlayer();
  const isCurrent = currentTrack?.videoId === track.videoId;

  return (
    <div
      className="music-card rounded-lg p-3 cursor-pointer play-reveal bg-sp-card"
      onClick={onClick}
    >
      <div className="relative mb-3">
        <img
          src={track.thumbnail}
          alt={track.title}
          className="w-full aspect-square object-cover rounded"
          onError={(e) => { e.target.src = 'https://via.placeholder.com/200x200/282828/535353?text=♪'; }}
        />
        <div className="play-btn absolute bottom-2 right-2 w-10 h-10 bg-sp-green rounded-full flex items-center justify-center shadow-lg">
          {isCurrent && isPlaying ? (
            <div className="flex items-end gap-0.5 h-4">
              <span className="equalizer-bar" />
              <span className="equalizer-bar" />
              <span className="equalizer-bar" />
            </div>
          ) : (
            <MdPlayArrow size={22} className="text-black ml-0.5" />
          )}
        </div>
      </div>
      <p className={`text-sm font-medium truncate ${isCurrent ? 'text-sp-green' : 'text-white'}`}>
        {track.title}
      </p>
      <p className="text-xs text-sp-muted truncate mt-0.5">{track.artist}</p>
    </div>
  );
}

function TopTrackRow({ track, index, onClick }) {
  return (
    <div
      className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-sp-hover cursor-pointer group"
      onClick={onClick}
    >
      <span className="text-sp-muted text-sm w-6 text-right">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{track.name}</p>
        <p className="text-sp-muted text-xs truncate">{track.artist}</p>
      </div>
      <span className="text-sp-muted text-xs">
        {track.playcount ? `${parseInt(track.playcount).toLocaleString()} plays` : ''}
      </span>
    </div>
  );
}

function GenreChip({ genre }) {
  const navigate = useNavigate();
  const colors = ['#e13300', '#1e3264', '#477d95', '#8c67aa', '#148a08', '#e8115b', '#af2896', '#1e3264'];
  const colorIndex = genre.tag.charCodeAt(0) % colors.length;

  return (
    <div
      className="rounded-lg p-4 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden relative h-20"
      style={{ backgroundColor: colors[colorIndex] }}
      onClick={() => navigate(`/genre/${encodeURIComponent(genre.tag)}`)}
    >
      <p className="text-white font-bold text-sm">{genre.emoji} {genre.label}</p>
      <div
        className="absolute -bottom-2 -right-2 w-16 h-16 rounded-lg rotate-12 opacity-50"
        style={{ backgroundColor: colors[(colorIndex + 2) % colors.length] }}
      />
    </div>
  );
}
