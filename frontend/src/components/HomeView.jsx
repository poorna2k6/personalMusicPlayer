import { useState, useEffect } from 'react';
import TrackRow from './TrackRow';
import { useAuth } from '../context/AuthContext';
import { getUserRecommendations, getUserHistory } from '../api';

const MIN_MIX_TRACKS = 3;

const MIX_DEFINITIONS = [
  { id: 'romantic',   label: 'Love & Romance',   desc: 'Soft feelings, warm melodies',        gradient: 'from-rose-600 to-pink-700',    keywords: ['romantic', 'romance', 'love', 'prema', 'jaan', 'pyar', 'heart', 'ishq', 'dil'] },
  { id: 'folk',       label: 'Folk Vibes',        desc: 'Traditional beats from the soil',     gradient: 'from-amber-600 to-orange-700', keywords: ['folk', 'telangana', 'janapadha', 'traditional', 'paata'] },
  { id: 'classical',  label: 'Classical',         desc: 'Ragas, swaras, timeless grace',       gradient: 'from-violet-600 to-purple-700',keywords: ['classical', 'raaga', 'carnatic', 'hindustani', 'swaraalu', 'raagam'] },
  { id: 'devotional', label: 'Devotional',        desc: 'Bhakti and spiritual songs',          gradient: 'from-yellow-600 to-amber-700', keywords: ['devotional', 'bhakti', 'temple', 'spiritual', 'mantra'] },
  { id: 'party',      label: 'Party Hits',        desc: 'Energy, bass, and dance floor',       gradient: 'from-green-600 to-teal-700',   keywords: ['party', 'dance', 'beat', 'remix', 'club'] },
  { id: 'sad',        label: 'Emotional',         desc: 'Feel every note deeply',              gradient: 'from-blue-600 to-indigo-700',  keywords: ['sad', 'cry', 'pain', 'broken', 'farewell', 'tears'] },
  { id: 'telugu',     label: 'Telugu Songs',      desc: 'Pure Telugu melodies',                gradient: 'from-teal-600 to-cyan-700',    keywords: ['telugu'] },
];

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5)  return 'Late night listening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function buildMixTracks(tracks, definition) {
  const matched = tracks.filter(t => {
    const text = `${t.genre || ''} ${t.title} ${t.album}`.toLowerCase();
    return definition.keywords.some(kw => text.includes(kw));
  });
  return [...matched].sort(() => Math.random() - 0.5);
}

function buildAllMix(tracks) {
  return [...tracks].sort(() => Math.random() - 0.5);
}

export default function HomeView({ tracks, player, playlists, onUpdate }) {
  const { playAll, playTrack, currentTrack, isPlaying, recentlyPlayed, startDjSession } = player;
  const { authState, user, token } = useAuth();

  const [recommendations, setRecommendations] = useState([]);
  const [userHistory, setUserHistory] = useState([]);
  const [recLoading, setRecLoading] = useState(false);

  const isLoggedIn = authState === 'authenticated';

  useEffect(() => {
    if (isLoggedIn && token) {
      setRecLoading(true);
      Promise.all([
        getUserRecommendations(token, 10),
        getUserHistory(token, 5),
      ])
        .then(([recs, hist]) => {
          setRecommendations(recs);
          setUserHistory(hist);
        })
        .catch(() => {})
        .finally(() => setRecLoading(false));
    }
  }, [isLoggedIn, token]);

  const greeting = getTimeGreeting();
  const hasLibrary = tracks.length > 0;

  const dailyMixes = MIX_DEFINITIONS
    .map(def => ({ ...def, tracks: buildMixTracks(tracks, def) }))
    .filter(mix => mix.tracks.length >= MIN_MIX_TRACKS);

  const allMix = hasLibrary
    ? { id: 'all', label: 'All Songs Mix', desc: 'Your entire library, shuffled', gradient: 'from-indigo-600 to-purple-700', tracks: buildAllMix(tracks) }
    : null;

  const recentTracks = recentlyPlayed.slice(0, 5);

  return (
    <div className="space-y-10">
      {/* Greeting */}
      <div>
        <h2 className="text-3xl font-bold text-white">
          {isLoggedIn && user?.name
            ? `${greeting}, ${user.name.split(' ')[0]}`
            : greeting}
        </h2>
        {!hasLibrary && (
          <p className="text-surface-400 mt-2 text-sm">
            No music found. Click "Scan Library" in the top bar to get started.
          </p>
        )}
      </div>

      {/* Guest nudge — only shown when skipped */}
      {authState === 'skipped' && (
        <div className="flex items-start gap-3 bg-indigo-950/50 border border-indigo-800/50 rounded-xl p-4">
          <svg className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
          <div>
            <p className="text-indigo-300 font-medium text-sm">You're browsing as Guest</p>
            <p className="text-indigo-400/70 text-xs mt-0.5">
              History and personalized recommendations are unavailable. Sign in with Google to unlock them.
            </p>
          </div>
        </div>
      )}

      {/* Quick-play: All songs + DJ mode */}
      {hasLibrary && (
        <section>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => playAll(buildAllMix(tracks))}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold transition-colors"
            >
              <PlayIcon />
              Play All (Shuffled)
            </button>
            <button
              onClick={() => {
                const seed = tracks[Math.floor(Math.random() * tracks.length)];
                startDjSession(seed, tracks);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-sm font-semibold transition-colors border border-surface-600"
              title="Start Party DJ — endless music, no repeats, always varied"
            >
              <DjIcon />
              Start Party DJ
            </button>
          </div>
        </section>
      )}

      {/* Personalized recommendations — only for logged-in users */}
      {isLoggedIn && (
        <section>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>Recommended for You</span>
            {recLoading && (
              <svg className="w-4 h-4 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
          </h3>

          {!recLoading && recommendations.length === 0 && (
            <p className="text-surface-400 text-sm">
              Play some tracks to build your recommendation profile. The more you listen, the better your picks get.
            </p>
          )}

          {recommendations.length > 0 && (
            <div className="space-y-0.5">
              <div className="grid grid-cols-[2rem_1fr_1fr_1fr_4rem] gap-4 px-4 py-2 text-xs font-medium text-surface-400 uppercase tracking-wider border-b border-surface-800">
                <span>#</span><span>Title</span><span>Artist</span><span>Album</span><span className="text-right">Duration</span>
              </div>
              {recommendations.map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={i + 1}
                  isActive={currentTrack?.id === track.id}
                  isPlaying={currentTrack?.id === track.id && isPlaying}
                  onPlay={() => playTrack(track, recommendations)}
                  playlists={playlists}
                  onUpdate={onUpdate}
                  player={player}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* User history from server — only for logged-in users */}
      {isLoggedIn && !recLoading && userHistory.length > 0 && (
        <section>
          <h3 className="text-xl font-bold mb-4">Your History</h3>
          <div className="space-y-0.5">
            <div className="grid grid-cols-[2rem_1fr_1fr_1fr_4rem] gap-4 px-4 py-2 text-xs font-medium text-surface-400 uppercase tracking-wider border-b border-surface-800">
              <span>#</span><span>Title</span><span>Artist</span><span>Album</span><span className="text-right">Duration</span>
            </div>
            {userHistory.map((track, i) => (
              <TrackRow
                key={`hist-${track.id}-${i}`}
                track={track}
                index={i + 1}
                isActive={currentTrack?.id === track.id}
                isPlaying={currentTrack?.id === track.id && isPlaying}
                onPlay={() => playTrack(track, userHistory)}
                playlists={playlists}
                onUpdate={onUpdate}
                player={player}
              />
            ))}
          </div>
        </section>
      )}

      {/* Daily Mix — genre-based */}
      {dailyMixes.length > 0 && (
        <section>
          <h3 className="text-xl font-bold mb-4">Your Daily Mix</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {allMix && (
              <MixCard
                mix={allMix}
                onPlay={() => playAll(allMix.tracks)}
                onDj={() => startDjSession(allMix.tracks[0], tracks)}
              />
            )}
            {dailyMixes.map(mix => (
              <MixCard
                key={mix.id}
                mix={mix}
                onPlay={() => playAll(mix.tracks)}
                onDj={() => startDjSession(mix.tracks[0], tracks)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently played (local) — quick-access */}
      {recentTracks.length > 0 && (
        <section>
          <h3 className="text-xl font-bold mb-4">Jump back in</h3>
          <div className="space-y-0.5">
            <div className="grid grid-cols-[2rem_1fr_1fr_1fr_4rem] gap-4 px-4 py-2 text-xs font-medium text-surface-400 uppercase tracking-wider border-b border-surface-800">
              <span>#</span><span>Title</span><span>Artist</span><span>Album</span><span className="text-right">Duration</span>
            </div>
            {recentTracks.map((track, i) => (
              <TrackRow
                key={`${track.id}-${track.playedAt}`}
                track={track}
                index={i + 1}
                isActive={currentTrack?.id === track.id}
                isPlaying={currentTrack?.id === track.id && isPlaying}
                onPlay={() => playTrack(track, recentTracks)}
                playlists={playlists}
                onUpdate={onUpdate}
                player={player}
              />
            ))}
          </div>
        </section>
      )}

      {hasLibrary && dailyMixes.length === 0 && (
        <section>
          <p className="text-surface-400 text-sm">
            Not enough tracks in any genre category yet to build mixes. Keep adding music!
          </p>
        </section>
      )}
    </div>
  );
}

function MixCard({ mix, onPlay, onDj }) {
  return (
    <div className="group relative rounded-xl overflow-hidden cursor-pointer" onClick={onPlay}>
      <div className={`w-full aspect-square bg-gradient-to-br ${mix.gradient} flex flex-col items-start justify-end p-3`}>
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
        <button
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all"
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
          title="Play mix"
        >
          <svg className="w-4 h-4 text-surface-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDj(); }}
          title="Start Party DJ from this mix"
        >
          <DjIcon small />
        </button>
      </div>
      <div className="pt-2 pb-1 px-0.5">
        <p className="text-sm font-semibold text-white leading-snug truncate">{mix.label}</p>
        <p className="text-xs text-surface-400 truncate">{mix.tracks.length} tracks · {mix.desc}</p>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function DjIcon({ small }) {
  return (
    <svg className={small ? 'w-3.5 h-3.5 text-white' : 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
    </svg>
  );
}
