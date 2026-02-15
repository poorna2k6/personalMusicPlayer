const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma', '.opus']);

async function scanLibrary(libraryPath) {
  if (!fs.existsSync(libraryPath)) {
    fs.mkdirSync(libraryPath, { recursive: true });
    console.log(`Created music library directory: ${libraryPath}`);
    return 0;
  }

  const files = getAllMusicFiles(libraryPath);
  const db = getDb();

  const existingPaths = new Set(
    db.prepare('SELECT file_path FROM tracks').all().map(r => r.file_path)
  );

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO tracks (id, title, artist, album, duration, track_number, genre, year, file_path, file_name, cover_art)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;

  for (const filePath of files) {
    const relativePath = path.relative(libraryPath, filePath);

    // Skip if already scanned and file hasn't changed
    if (existingPaths.has(relativePath)) {
      count++;
      continue;
    }

    try {
      const metadata = await mm.parseFile(filePath);
      const common = metadata.common;
      const format = metadata.format;

      const id = uuidv4();
      const title = common.title || path.basename(filePath, path.extname(filePath));
      const artist = common.artist || 'Unknown Artist';
      const album = common.album || 'Unknown Album';
      const duration = format.duration || 0;
      const trackNumber = common.track?.no || null;
      const genre = common.genre?.[0] || null;
      const year = common.year || null;

      // Extract cover art if available
      let coverArt = null;
      if (common.picture && common.picture.length > 0) {
        const pic = common.picture[0];
        coverArt = `data:${pic.format};base64,${pic.data.toString('base64')}`;
      }

      insertStmt.run(id, title, artist, album, duration, trackNumber, genre, year, relativePath, path.basename(filePath), coverArt);
      count++;
    } catch (err) {
      console.warn(`Failed to parse ${filePath}: ${err.message}`);
      // Still add the file with basic info
      const id = uuidv4();
      const fileName = path.basename(filePath);
      const title = path.basename(filePath, path.extname(filePath));
      insertStmt.run(id, title, 'Unknown Artist', 'Unknown Album', 0, null, null, null, relativePath, fileName, null);
      count++;
    }
  }

  // Remove tracks whose files no longer exist
  const allTracksInDb = db.prepare('SELECT id, file_path FROM tracks').all();
  const deleteStmt = db.prepare('DELETE FROM tracks WHERE id = ?');
  for (const track of allTracksInDb) {
    const fullPath = path.join(libraryPath, track.file_path);
    if (!fs.existsSync(fullPath)) {
      deleteStmt.run(track.id);
    }
  }

  return count;
}

function getAllMusicFiles(dirPath) {
  const files = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return files;
}

module.exports = { scanLibrary };
