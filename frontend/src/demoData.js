// Static demo data for GitHub Pages deployment (no backend needed)
const DEMO_TRACKS = [
  { id: "1", title: "Amma Paata", artist: "Demo Artist", album: "Telugu Melodies", duration: 15, file_path: "Telugu Melodies/Amma_Paata.wav", file_name: "Amma_Paata.wav", genre: "Telugu", year: 2024 },
  { id: "2", title: "Vaana Villulu", artist: "Demo Artist", album: "Telugu Melodies", duration: 12, file_path: "Telugu Melodies/Vaana_Villulu.wav", file_name: "Vaana_Villulu.wav", genre: "Telugu", year: 2024 },
  { id: "3", title: "Chandamama", artist: "Priya", album: "Telugu Melodies", duration: 14, file_path: "Telugu Melodies/Chandamama.wav", file_name: "Chandamama.wav", genre: "Telugu", year: 2024 },
  { id: "4", title: "Naa Hrudayam", artist: "Priya", album: "Prema Geethalu", duration: 13, file_path: "Prema Geethalu/Naa_Hrudayam.wav", file_name: "Naa_Hrudayam.wav", genre: "Romance", year: 2024 },
  { id: "5", title: "Gali Chirugali", artist: "Ravi Kumar", album: "Prema Geethalu", duration: 16, file_path: "Prema Geethalu/Gali_Chirugali.wav", file_name: "Gali_Chirugali.wav", genre: "Romance", year: 2024 },
  { id: "6", title: "Edo Oka Raagam", artist: "Ravi Kumar", album: "Prema Geethalu", duration: 11, file_path: "Prema Geethalu/Edo_Oka_Raagam.wav", file_name: "Edo_Oka_Raagam.wav", genre: "Romance", year: 2024 },
  { id: "7", title: "Telangana Beats", artist: "Demo Beats", album: "Folk Rhythms", duration: 10, file_path: "Folk Rhythms/Telangana_Beats.wav", file_name: "Telangana_Beats.wav", genre: "Folk", year: 2024 },
  { id: "8", title: "Janapadham", artist: "Demo Beats", album: "Folk Rhythms", duration: 14, file_path: "Folk Rhythms/Janapadham.wav", file_name: "Janapadham.wav", genre: "Folk", year: 2024 },
  { id: "9", title: "Pacha Bottesina", artist: "Demo Beats", album: "Folk Rhythms", duration: 12, file_path: "Folk Rhythms/Pacha_Bottesina.wav", file_name: "Pacha_Bottesina.wav", genre: "Folk", year: 2024 },
  { id: "10", title: "Swaraalu", artist: "Sangeetha", album: "Classical Notes", duration: 15, file_path: "Classical Notes/Swaraalu.wav", file_name: "Swaraalu.wav", genre: "Classical", year: 2024 },
  { id: "11", title: "Raaga Tarangalu", artist: "Sangeetha", album: "Classical Notes", duration: 13, file_path: "Classical Notes/Raaga_Tarangalu.wav", file_name: "Raaga_Tarangalu.wav", genre: "Classical", year: 2024 },
  { id: "12", title: "Nuvvu Naaku", artist: "Sangeetha", album: "Classical Notes", duration: 11, file_path: "Classical Notes/Nuvvu_Naaku.wav", file_name: "Nuvvu_Naaku.wav", genre: "Classical", year: 2024 },
];

// Derive artists and albums from tracks
function deriveArtists(tracks) {
  const map = {};
  tracks.forEach(t => {
    if (!map[t.artist]) map[t.artist] = { artist: t.artist, track_count: 0 };
    map[t.artist].track_count++;
  });
  return Object.values(map).sort((a, b) => a.artist.localeCompare(b.artist));
}

function deriveAlbums(tracks) {
  const map = {};
  tracks.forEach(t => {
    const key = `${t.album}::${t.artist}`;
    if (!map[key]) map[key] = { album: t.album, artist: t.artist, track_count: 0, cover_art: null };
    map[key].track_count++;
  });
  return Object.values(map).sort((a, b) => a.album.localeCompare(b.album));
}

export const demoTracks = DEMO_TRACKS;
export const demoArtists = deriveArtists(DEMO_TRACKS);
export const demoAlbums = deriveAlbums(DEMO_TRACKS);

// In-memory playlists for demo mode
let _playlists = [];
let _playlistIdCounter = 1;

export function demoFetchPlaylists() {
  return _playlists.map(p => ({ ...p, track_count: p.tracks.length }));
}

export function demoCreatePlaylist(name) {
  const p = { id: String(_playlistIdCounter++), name, tracks: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  _playlists.push(p);
  return p;
}

export function demoDeletePlaylist(id) {
  _playlists = _playlists.filter(p => p.id !== id);
}

export function demoFetchPlaylist(id) {
  const p = _playlists.find(p => p.id === id);
  if (!p) return null;
  return { ...p, track_count: p.tracks.length };
}

export function demoAddTrackToPlaylist(playlistId, trackId) {
  const p = _playlists.find(p => p.id === playlistId);
  if (!p) return;
  const track = DEMO_TRACKS.find(t => t.id === trackId);
  if (track && !p.tracks.find(t => t.id === trackId)) {
    p.tracks.push(track);
  }
}

export function demoRemoveTrackFromPlaylist(playlistId, trackId) {
  const p = _playlists.find(p => p.id === playlistId);
  if (!p) return;
  p.tracks = p.tracks.filter(t => t.id !== trackId);
}
