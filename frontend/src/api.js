const API_BASE = '/api';

export async function fetchTracks(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/tracks${query ? '?' + query : ''}`);
  if (!res.ok) throw new Error('Failed to fetch tracks');
  return res.json();
}

export async function fetchArtists() {
  const res = await fetch(`${API_BASE}/tracks/artists`);
  if (!res.ok) throw new Error('Failed to fetch artists');
  return res.json();
}

export async function fetchAlbums() {
  const res = await fetch(`${API_BASE}/tracks/albums`);
  if (!res.ok) throw new Error('Failed to fetch albums');
  return res.json();
}

export async function fetchPlaylists() {
  const res = await fetch(`${API_BASE}/playlists`);
  if (!res.ok) throw new Error('Failed to fetch playlists');
  return res.json();
}

export async function fetchPlaylist(id) {
  const res = await fetch(`${API_BASE}/playlists/${id}`);
  if (!res.ok) throw new Error('Failed to fetch playlist');
  return res.json();
}

export async function createPlaylist(name) {
  const res = await fetch(`${API_BASE}/playlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create playlist');
  return res.json();
}

export async function deletePlaylist(id) {
  const res = await fetch(`${API_BASE}/playlists/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete playlist');
  return res.json();
}

export async function addTrackToPlaylist(playlistId, trackId) {
  const res = await fetch(`${API_BASE}/playlists/${playlistId}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId }),
  });
  if (!res.ok) throw new Error('Failed to add track to playlist');
  return res.json();
}

export async function removeTrackFromPlaylist(playlistId, trackId) {
  const res = await fetch(`${API_BASE}/playlists/${playlistId}/tracks/${trackId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to remove track from playlist');
  return res.json();
}

export async function scanLibrary() {
  const res = await fetch(`${API_BASE}/scan`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to scan library');
  return res.json();
}

export function getAudioUrl(filePath) {
  return `${API_BASE}/audio/${encodeURIComponent(filePath)}`;
}

export function getCoverUrl(trackId) {
  return `${API_BASE}/tracks/${trackId}/cover`;
}
