import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MdSearch, MdClose, MdHistory } from 'react-icons/md';
import api from '../../utils/api';
import { usePlayer } from '../../context/PlayerContext';
import TrackCard from '../../components/Cards/TrackCard';

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const { playTrack } = usePlayer();
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    loadHistory();
  }, []);

  // Auto-search if query in URL
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && q !== query) {
      setQuery(q);
      performSearch(q);
    }
  }, [searchParams]);

  const loadHistory = async () => {
    try {
      const data = await api.get('/search/history');
      setHistory(data);
    } catch {}
  };

  const performSearch = async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(q)}&limit=30`);
      setResults(data.tracks || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchParams(val ? { q: val } : {});
      performSearch(val);
    }, 400);
  };

  const handleHistoryClick = (q) => {
    setQuery(q);
    setSearchParams({ q });
    performSearch(q);
  };

  const clearHistory = async () => {
    try {
      await api.delete('/search/history');
      setHistory([]);
    } catch {}
  };

  return (
    <div className="px-6 pb-8">
      {/* Search bar */}
      <div className="sticky top-0 pt-4 pb-4 z-10" style={{ background: 'linear-gradient(to bottom, #121212 80%, transparent)' }}>
        <div className="relative max-w-2xl">
          <MdSearch
            size={22}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sp-subtle"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInput}
            placeholder="What do you want to listen to?"
            className="w-full bg-white text-black placeholder-gray-500 rounded-full py-3 pl-11 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sp-green"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setSearchParams({}); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              <MdClose size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-sp-green border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div>
          <h2 className="text-white font-bold text-lg mb-3">Results</h2>
          <div className="space-y-1">
            {results.map((track, i) => (
              <TrackCard
                key={track.videoId}
                track={track}
                tracks={results}
                index={i}
                showDuration
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && query && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MdSearch size={64} className="text-sp-subtle mb-4" />
          <p className="text-white font-bold text-xl mb-2">No results found</p>
          <p className="text-sp-muted">Try different keywords or check your spelling</p>
        </div>
      )}

      {/* Search history (when no query) */}
      {!query && !loading && (
        <div>
          {history.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-bold text-lg">Recent Searches</h2>
                <button onClick={clearHistory} className="text-sp-muted text-sm hover:text-white">
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((item) => (
                  <button
                    key={item.query}
                    onClick={() => handleHistoryClick(item.query)}
                    className="flex items-center gap-2 bg-sp-card hover:bg-sp-hover px-4 py-2 rounded-full text-sm text-sp-muted hover:text-white transition-colors"
                  >
                    <MdHistory size={16} />
                    {item.query}
                  </button>
                ))}
              </div>
            </div>
          )}

          <BrowseCategories />
        </div>
      )}
    </div>
  );
}

const BROWSE_CATEGORIES = [
  { label: 'Pop', color: '#e13300', query: 'top pop songs 2024' },
  { label: 'Hip-Hop', color: '#8d67ab', query: 'best hip hop rap 2024' },
  { label: 'Rock', color: '#e8115b', query: 'classic rock hits' },
  { label: 'Electronic', color: '#0d73ec', query: 'electronic dance music EDM' },
  { label: 'R&B', color: '#e91429', query: 'r&b soul music 2024' },
  { label: 'Indie', color: '#477d95', query: 'indie alternative music' },
  { label: 'Bollywood', color: '#f9ca24', query: 'bollywood hindi songs 2024' },
  { label: 'Latin', color: '#148a08', query: 'latin reggaeton music 2024' },
  { label: 'Jazz', color: '#1e3264', query: 'jazz classics smooth' },
  { label: 'Classical', color: '#af2896', query: 'classical music orchestra' },
  { label: 'Lo-fi', color: '#6c63ff', query: 'lofi hip hop study beats' },
  { label: 'K-Pop', color: '#e8115b', query: 'kpop hits 2024' },
];

function BrowseCategories() {
  const navigate = useNavigate();

  return (
    <div>
      <h2 className="text-white font-bold text-lg mb-4">Browse all</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {BROWSE_CATEGORIES.map((cat) => (
          <div
            key={cat.label}
            className="rounded-lg p-4 cursor-pointer hover:opacity-90 transition-opacity h-24 relative overflow-hidden"
            style={{ backgroundColor: cat.color }}
            onClick={() => navigate(`/mood/${encodeURIComponent(cat.query)}`)}
          >
            <p className="text-white font-bold text-base">{cat.label}</p>
            <div
              className="absolute -bottom-3 -right-3 w-20 h-20 rounded-lg rotate-12 opacity-40"
              style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

