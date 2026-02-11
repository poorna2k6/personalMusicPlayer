import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { PlayerProvider } from './context/PlayerContext';
import Sidebar from './components/Sidebar/Sidebar';
import Player from './components/Player/Player';
import ExpandedPlayer from './components/Player/ExpandedPlayer';
import Header from './components/Header/Header';
import Home from './pages/Home/Home';
import Search from './pages/Search/Search';
import Library from './pages/Library/Library';
import LikedSongs from './pages/Library/LikedSongs';
import Playlist from './pages/Playlist/Playlist';
import Artist from './pages/Artist/Artist';
import MoodPage from './pages/Mood/MoodPage';
import GenrePage from './pages/Genre/GenrePage';

export default function App() {
  const [expandedPlayer, setExpandedPlayer] = useState(false);

  return (
    <PlayerProvider>
      <div className="flex flex-col h-screen bg-sp-black overflow-hidden">
        {/* Main layout */}
        <div className="flex flex-1 min-h-0 gap-2 p-2">
          {/* Sidebar */}
          <Sidebar />

          {/* Main content area */}
          <main className="flex-1 bg-sp-dark rounded-lg overflow-hidden flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto relative">
              <Header />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library" element={<Library />} />
                <Route path="/liked" element={<LikedSongs />} />
                <Route path="/playlist/:id" element={<Playlist />} />
                <Route path="/artist/:name" element={<Artist />} />
                <Route path="/mood/:query" element={<MoodPage />} />
                <Route path="/genre/:tag" element={<GenrePage />} />
              </Routes>
            </div>
          </main>
        </div>

        {/* Bottom Player Bar */}
        <Player onExpand={() => setExpandedPlayer(true)} />

        {/* Expanded Player overlay */}
        {expandedPlayer && (
          <ExpandedPlayer onClose={() => setExpandedPlayer(false)} />
        )}
      </div>

      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#282828',
            color: '#fff',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#1DB954', secondary: '#fff' },
          },
        }}
      />
    </PlayerProvider>
  );
}
