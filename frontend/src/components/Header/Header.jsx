import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MdChevronLeft, MdChevronRight, MdSearch } from 'react-icons/md';

export default function Header({ onSearchFocus }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSearchPage = location.pathname === '/search';

  return (
    <header className="flex items-center justify-between px-6 py-4 sticky top-0 z-30"
      style={{ background: 'linear-gradient(to bottom, rgba(18,18,18,0.95) 0%, rgba(18,18,18,0) 100%)' }}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
        >
          <MdChevronLeft size={20} />
        </button>
        <button
          onClick={() => navigate(1)}
          className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
        >
          <MdChevronRight size={20} />
        </button>
      </div>

      {!isSearchPage && (
        <button
          onClick={() => { navigate('/search'); if (onSearchFocus) onSearchFocus(); }}
          className="flex items-center gap-2 bg-sp-card/80 text-sp-muted hover:text-white px-4 py-2 rounded-full text-sm transition-colors"
        >
          <MdSearch size={18} />
          <span>Search songs, artists...</span>
        </button>
      )}

      <div className="w-20" />
    </header>
  );
}
