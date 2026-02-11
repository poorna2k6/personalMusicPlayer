import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  MdHome, MdSearch, MdLibraryMusic, MdFavorite, MdAdd,
  MdMusicNote, MdChevronLeft, MdChevronRight
} from 'react-icons/md';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function Sidebar() {
  const [playlists, setPlaylists] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    try {
      const data = await api.get('/playlists');
      setPlaylists(data);
    } catch {}
  };

  const createPlaylist = async () => {
    const name = `My Playlist #${playlists.length + 1}`;
    try {
      const pl = await api.post('/playlists', { name });
      setPlaylists((prev) => [pl, ...prev]);
      navigate(`/playlist/${pl.id}`);
      toast.success('Playlist created');
    } catch {
      toast.error('Failed to create playlist');
    }
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive ? 'text-white bg-sp-hover' : 'text-sp-muted hover:text-white'
    }`;

  return (
    <aside
      className={`flex flex-col bg-sp-black transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      } min-h-0 shrink-0`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sp-green rounded-full flex items-center justify-center">
              <MdMusicNote className="text-black text-lg" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">Rythmix</span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto w-8 h-8 bg-sp-green rounded-full flex items-center justify-center">
            <MdMusicNote className="text-black text-lg" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-sp-muted hover:text-white ml-auto"
        >
          {collapsed ? <MdChevronRight size={20} /> : <MdChevronLeft size={20} />}
        </button>
      </div>

      {/* Main Nav */}
      <nav className="px-2 space-y-1">
        <NavLink to="/" className={navLinkClass}>
          <MdHome size={22} />
          {!collapsed && <span>Home</span>}
        </NavLink>
        <NavLink to="/search" className={navLinkClass}>
          <MdSearch size={22} />
          {!collapsed && <span>Search</span>}
        </NavLink>
        <NavLink to="/library" className={navLinkClass}>
          <MdLibraryMusic size={22} />
          {!collapsed && <span>Your Library</span>}
        </NavLink>
      </nav>

      <div className="h-px bg-sp-border mx-3 my-3" />

      {/* Quick actions */}
      <div className="px-2 space-y-1">
        <button
          onClick={createPlaylist}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sp-muted hover:text-white w-full transition-colors"
        >
          <div className="w-6 h-6 bg-sp-muted rounded-sm flex items-center justify-center flex-shrink-0">
            <MdAdd size={16} className="text-black" />
          </div>
          {!collapsed && <span>Create Playlist</span>}
        </button>
        <NavLink to="/liked" className={navLinkClass}>
          <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-white rounded-sm flex items-center justify-center flex-shrink-0">
            <MdFavorite size={14} className="text-white" />
          </div>
          {!collapsed && <span>Liked Songs</span>}
        </NavLink>
      </div>

      <div className="h-px bg-sp-border mx-3 my-3" />

      {/* Playlists */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-4">
        {!collapsed && playlists.map((pl) => (
          <NavLink
            key={pl.id}
            to={`/playlist/${pl.id}`}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm transition-colors truncate ${
                isActive ? 'text-white' : 'text-sp-muted hover:text-white'
              }`
            }
          >
            {pl.name}
          </NavLink>
        ))}
        {collapsed && playlists.slice(0, 5).map((pl) => (
          <NavLink
            key={pl.id}
            to={`/playlist/${pl.id}`}
            className="flex items-center justify-center py-2 text-sp-muted hover:text-white"
            title={pl.name}
          >
            <MdMusicNote size={18} />
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
