# Raagam: Personal Telugu Music Player

## Overview

Raagam is a personal, self-hosted music player application specifically designed for Telugu music enthusiasts. It provides an ad-free, subscription-free alternative to commercial streaming services, inspired by the user interface of Spotify. The application allows users to play their own local music library through a clean, responsive web interface, leveraging backend APIs to serve real songs without any external dependencies or tracking.

## Key Features

- **Ad-Free Experience**: No advertisements, tracking, or premium subscriptions required
- **Local Music Library**: Play music files (MP3, WAV, FLAC, OGG, M4A, AAC, WMA, OPUS) from your own collection
- **Spotify-Inspired UI**: Clean, modern interface with intuitive navigation and controls
- **Metadata Management**: Automatic extraction of song metadata (title, artist, album, genre, year, etc.)
- **Playlist Support**: Create, manage, and play custom playlists
- **Advanced Playback Controls**: Play, pause, skip, shuffle, repeat, volume control, seek bar
- **Search and Filtering**: Search by title, artist, or album; filter by artist, album, or genre
- **Persistent State**: Playback queue and settings saved in browser localStorage
- **Responsive Design**: Works on desktop and mobile devices
- **Demo Mode**: Includes sample Telugu-themed tracks for testing and demonstration

## Architecture

Raagam follows a full-stack architecture with a clear separation between frontend and backend:

### Backend (Node.js/Express)
- **API Endpoints**: RESTful API for tracks, artists, albums, and playlists
- **File Serving**: Static file serving for audio files and album art
- **Library Scanning**: Automatic scanning and metadata extraction from music files
- **Database**: SQLite for storing track metadata and playlist information
- **Dependencies**: Express, better-sqlite3, music-metadata, CORS, UUID

### Frontend (React/Vite)
- **UI Components**: Modular React components for different views (Library, Album, Artist, Playlist)
- **State Management**: Zustand store for playback state and queue management
- **Audio Playback**: HTML5 Audio API for client-side audio playback
- **Styling**: Tailwind CSS for responsive, modern UI
- **Dependencies**: React, React DOM, Vite

### Database Schema
- **tracks**: Stores song metadata (id, title, artist, album, duration, etc.)
- **playlists**: Playlist information (id, name, timestamps)
- **playlist_tracks**: Many-to-many relationship between playlists and tracks

## Technical Implementation

### Backend Components

#### Server Setup (`src/index.js`)
- Express server with CORS enabled
- Static file serving for audio files
- API route mounting
- Database initialization
- Automatic library scanning on startup

#### Database (`src/db.js`)
- SQLite database with better-sqlite3
- WAL mode for better concurrency
- Schema creation for tracks, playlists, and relationships

#### Scanner (`src/scanner.js`)
- Recursive file system scanning for supported audio formats
- Metadata extraction using music-metadata library
- Database insertion/update of track information
- Support for album art extraction

#### API Routes
- **Tracks** (`routes/tracks.js`): CRUD operations, filtering, search
- **Playlists** (`routes/playlists.js`): Playlist management and track association

### Frontend Components

#### App Structure (`src/App.jsx`)
- Main application component with view routing
- Data loading and state management
- Integration with player store

#### Player Store (`hooks/usePlayerStore.js`)
- Zustand-based state management
- Queue management, current track, playback controls
- LocalStorage persistence for user preferences

#### UI Components
- **Sidebar**: Navigation between different views
- **Library**: Main track listing with search/filter
- **AlbumView/ArtistView**: Detailed views for albums and artists
- **PlaylistView**: Playlist management interface
- **Player**: Audio controls and progress display
- **TrackRow**: Individual track display component

#### API Client (`src/api.js`)
- Fetch functions for backend API calls
- Demo mode support for development
- Error handling and data transformation

## Setup and Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Local music library folder

### Installation Steps
1. Clone the repository
2. Run `npm run install:all` to install dependencies for all modules
3. Configure environment variables (optional):
   - `MUSIC_LIBRARY_PATH`: Path to your music folder
   - `PORT`: Backend server port (default: 4000)
   - `DB_PATH`: SQLite database path
4. Start development servers: `npm run dev`
5. Access the application at `http://localhost:5173` (frontend) and `http://localhost:4000` (backend)

### Production Deployment
1. Build frontend: `npm run build`
2. Start backend: `npm run start`
3. Serve built frontend files through backend or web server

## Usage

### Adding Music
- Place audio files in the configured music library folder
- Trigger manual scan via UI or API endpoint
- Automatic scanning occurs on server startup

### Playback
- Browse tracks by library, artist, album, or playlist
- Click play button or double-click track to start playback
- Use player controls for navigation and volume adjustment
- Enable shuffle or repeat modes as needed

### Playlists
- Create new playlists from the sidebar
- Add tracks to playlists by right-clicking or using add buttons
- Manage playlist order and remove tracks

## Demo Mode

The application includes a demo mode for development and testing:
- Set `VITE_DEMO_MODE=true` in frontend environment
- Uses generated sample WAV files with Telugu-themed metadata
- No backend required for basic functionality testing

## Future Enhancements

- Mobile app versions (React Native)
- Offline playback with service workers
- Social features (sharing playlists)
- Advanced audio features (equalizer, visualizations)
- Integration with external music databases for metadata enrichment
- User accounts and multi-user support

## Philosophy

Raagam embodies the principle of personal music ownership and privacy. By keeping all music data local and avoiding cloud dependencies, it ensures users maintain complete control over their listening experience. The focus on Telugu music reflects the cultural heritage of the target audience while providing a universal, extensible platform for personal music management.

## License

[Specify license - e.g., MIT]

## Contributing

[Guidelines for contributors]

## Acknowledgments

- Inspired by Spotify's user interface design
- Built with modern web technologies for performance and maintainability
- Dedicated to preserving and enjoying Telugu musical traditions</content>
<parameter name="filePath">/Users/sushmachandu/Documents/Python/MusicPlayer/personalMusicPlayer/Raagam_Document.md