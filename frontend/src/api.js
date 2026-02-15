import {
  demoTracks, demoArtists, demoAlbums,
  demoFetchPlaylists, demoCreatePlaylist, demoDeletePlaylist,
  demoFetchPlaylist, demoAddTrackToPlaylist, demoRemoveTrackFromPlaylist,
} from './demoData';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const API_BASE = '/api';
const BASE_URL = import.meta.env.BASE_URL || '/';

// --- Tracks ---

export async function fetchTracks(params = {}) {
  if (DEMO_MODE) {
    let tracks = [...demoTracks];
    if (params.artist) tracks = tracks.filter(t => t.artist === params.artist);
    if (params.album) tracks = tracks.filter(t => t.album === params.album);
    if (params.search) {
      const q = params.search.toLowerCase();
      tracks = tracks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    }
    return tracks;
  }
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/tracks${query ? '?' + query : ''}`);
  if (!res.ok) throw new Error('Failed to fetch tracks');
  return res.json();
}

export async function fetchArtists() {
  if (DEMO_MODE) return demoArtists;
  const res = await fetch(`${API_BASE}/tracks/artists`);
  if (!res.ok) throw new Error('Failed to fetch artists');
  return res.json();
}

export async function fetchAlbums() {
  if (DEMO_MODE) return demoAlbums;
  const res = await fetch(`${API_BASE}/tracks/albums`);
  if (!res.ok) throw new Error('Failed to fetch albums');
  return res.json();
}

// --- Playlists ---

export async function fetchPlaylists() {
  if (DEMO_MODE) return demoFetchPlaylists();
  const res = await fetch(`${API_BASE}/playlists`);
  if (!res.ok) throw new Error('Failed to fetch playlists');
  return res.json();
}

export async function fetchPlaylist(id) {
  if (DEMO_MODE) return demoFetchPlaylist(id);
  const res = await fetch(`${API_BASE}/playlists/${id}`);
  if (!res.ok) throw new Error('Failed to fetch playlist');
  return res.json();
}

export async function createPlaylist(name) {
  if (DEMO_MODE) return demoCreatePlaylist(name);
  const res = await fetch(`${API_BASE}/playlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create playlist');
  return res.json();
}

export async function deletePlaylist(id) {
  if (DEMO_MODE) return demoDeletePlaylist(id);
  const res = await fetch(`${API_BASE}/playlists/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete playlist');
  return res.json();
}

export async function addTrackToPlaylist(playlistId, trackId) {
  if (DEMO_MODE) return demoAddTrackToPlaylist(playlistId, trackId);
  const res = await fetch(`${API_BASE}/playlists/${playlistId}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId }),
  });
  if (!res.ok) throw new Error('Failed to add track to playlist');
  return res.json();
}

export async function removeTrackFromPlaylist(playlistId, trackId) {
  if (DEMO_MODE) return demoRemoveTrackFromPlaylist(playlistId, trackId);
  const res = await fetch(`${API_BASE}/playlists/${playlistId}/tracks/${trackId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to remove track from playlist');
  return res.json();
}

export async function scanLibrary() {
  if (DEMO_MODE) return { message: 'Demo mode - library is pre-loaded' };
  const res = await fetch(`${API_BASE}/scan`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to scan library');
  return res.json();
}

// --- Audio URLs ---

export function getAudioUrl(filePath) {
  if (DEMO_MODE) {
    return `${BASE_URL}audio/${filePath}`;
  }
  return `${API_BASE}/audio/${encodeURIComponent(filePath)}`;
}

export function getCoverUrl(trackId) {
  return `${API_BASE}/tracks/${trackId}/cover`;
}
