import TrackRow from './TrackRow';

const MIN_MIX_TRACKS = 3; // Don't show a mix card unless it has at least this many tracks

// Genre/mood mix definitions — each has a display name, keywords to match, and a gradient color
const MIX_DEFINITIONS = [
  { id: 'romantic', label: 'Love & Romance', desc: 'Soft feelings, warm melodies', gradient: 'from-rose-600 to-pink-700', keywords: ['romantic', 'romance', 'love', 'prema', 'jaan', 'pyar', 'heart', 'ishq', 'dil'] },
  { id: 'folk',     label: 'Folk Vibes',     desc: 'Traditional beats from the soil', gradient: 'from-amber-600 to-orange-700', keywords: ['folk', 'telangana', 'janapadha', 'traditional', 'paata'] },
  { id: 'classical', label: 'Classical',     desc: 'Ragas, swaras, timeless grace', gradient: 'from-violet-600 to-purple-700', keywords: ['classical', 'raaga', 'carnatic', 'hindustani', 'swaraalu', 'raagam'] },
  { id: 'devotional', label: 'Devotional',   desc: 'Bhakti and spiritual songs', gradient: 'from-yellow-600 to-amber-700', keywords: ['devotional', 'bhakti', 'temple', 'spiritual', 'mantra'] },
  { id: 'party',   label: 'Party Hits',      desc: 'Energy, bass, and dance floor', gradient: 'from-green-600 to-teal-700', keywords: ['party', 'dance', 'beat', 'remix', 'club'] },
  { id: 'sad',     label: 'Emotional',       desc: 'Feel every note deeply', gradient: 'from-blue-600 to-indigo-700', keywords: ['sad', 'cry', 'pain', 'broken', 'farewell', 'tears'] },
  { id: 'telugu',  label: 'Telugu Songs',    desc: 'Pure Telugu melodies', gradient: 'from-teal-600 to-cyan-700', keywords: ['telugu'] },
];

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5)  return 'Late night listening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

// Build a mix for a given definition by matching keywords across genre/title/album
function buildMixTracks(tracks, definition) {
  const matched = tracks.filter(t => {
    const text = `${t.genre || ''} ${t.title} ${t.album}`.toLowerCase();
    return definition.keywords.some(kw => text.includes(kw));
  });
  // Shuffle for daily variety
  return [...matched].sort(() => Math.random() - 0.5);
}

// "Everything" mix — full library, shuffled
function buildAllMix(tracks) {
  return [...tracks].sort(() => Math.random() - 0.5);
}

export default function HomeView({ tracks, player, playlists, onUpdate }) {
  const { playAll, playTrack, currentTrack, isPlaying, recentlyPlayed, startDjSession } = player;

  const greeting = getTimeGreeting();
  const hasLibrary = tracks.length > 0;

  // Build daily mixes — validate each has >= MIN_MIX_TRACKS before showing
  const dailyMixes = MIX_DEFINITIONS
    .map(def => ({ ...def, tracks: buildMixTracks(tracks, def) }))
    .filter(mix => mix.tracks.length >= MIN_MIX_TRACKS);

  // "All tracks" mix — only show if library is not empty
  const allMix = hasLibrary ? { id: 'all', label: 'All Songs Mix', desc: 'Your entire library, shuffled', gradient: 'from-indigo-600 to-purple-700', tracks: buildAllMix(tracks) } : null;

  const recentTracks = recentlyPlayed.slice(0, 5);

  return (
    <div className="space-y-10">
      {/* Greeting */}
      <div>
        <h2 className="text-3xl font-bold text-white">{greeting}</h2>
        {!hasLibrary && (
          <p className="text-surface-400 mt-2 text-sm">
            No music found. Click "Scan Library" in the top bar to get started.
          </p>
        )}
      </div>

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

      {/* Your Daily Mix — only shown when library has matching tracks */}
      {dailyMixes.length > 0 && (
        <section>
          <h3 className="text-xl font-bold mb-4">Your Daily Mix</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {/* All songs mix first */}
            {allMix && (
              <MixCard
                mix={allMix}
                onPlay={() => playAll(allMix.tracks)}
                onDj={() => {
                  const seed = allMix.tracks[0];
                  startDjSession(seed, tracks);
                }}
              />
            )}
            {dailyMixes.map(mix => (
              <MixCard
                key={mix.id}
                mix={mix}
                onPlay={() => playAll(mix.tracks)}
                onDj={() => {
                  const seed = mix.tracks[0];
                  startDjSession(seed, tracks);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently played quick-access — only if history exists */}
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

      {/* Empty state when library has tracks but no mix matched */}
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
      {/* Gradient background */}
      <div className={`w-full aspect-square bg-gradient-to-br ${mix.gradient} flex flex-col items-start justify-end p-3`}>
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
        {/* Play button overlay */}
        <button
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all"
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
          title="Play mix"
        >
          <svg className="w-4 h-4 text-surface-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        {/* DJ button */}
        <button
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDj(); }}
          title="Start Party DJ from this mix"
        >
          <DjIcon small />
        </button>
      </div>
      {/* Text below */}
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
