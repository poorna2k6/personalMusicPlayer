require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const tracksRouter = require('./routes/tracks');
const playlistsRouter = require('./routes/playlists');
const { initDb, getDb } = require('./db');
const { scanLibrary } = require('./scanner');

const app = express();
const PORT = process.env.PORT || 5000;
const MUSIC_LIBRARY_PATH = process.env.MUSIC_LIBRARY_PATH || path.join(__dirname, '../../music');

app.use(cors());
app.use(express.json());

// Serve album art and audio files
app.use('/api/audio', express.static(MUSIC_LIBRARY_PATH));

// API routes
app.use('/api/tracks', tracksRouter);
app.use('/api/playlists', playlistsRouter);

// Analytics endpoint
app.post('/api/analytics', (req, res) => {
  try {
    const { sessionId, events } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';

    if (!sessionId || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid analytics data' });
    }

    const db = getDb();

    // Check if session exists, if not create it
    const existingSession = db.prepare('SELECT id FROM analytics_sessions WHERE id = ?').get(sessionId);
    if (!existingSession) {
      const firstEvent = events[0];
      if (firstEvent && firstEvent.eventType === 'session_start') {
        db.prepare(`
          INSERT INTO analytics_sessions (id, user_agent, ip_address, language, platform, screen_size, timezone, referrer, url, start_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          firstEvent.data.userAgent,
          clientIP,
          firstEvent.data.language,
          firstEvent.data.platform,
          firstEvent.data.screenSize,
          firstEvent.data.timezone,
          firstEvent.data.referrer,
          firstEvent.data.url,
          firstEvent.timestamp
        );
      }
    }

    // Insert events
    const insertEvent = db.prepare(`
      INSERT INTO analytics_events (session_id, event_type, event_data, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = db.transaction((events) => {
      for (const event of events) {
        insertEvent.run(sessionId, event.eventType, JSON.stringify(event.data), event.timestamp);
      }
    });

    insertMany(events);

    // Update session end time if this includes a session_end event
    const sessionEndEvent = events.find(e => e.eventType === 'session_end');
    if (sessionEndEvent) {
      db.prepare('UPDATE analytics_sessions SET end_time = ?, duration = ? WHERE id = ?')
        .run(sessionEndEvent.timestamp, sessionEndEvent.data.duration, sessionId);
    }

    res.json({ status: 'ok', eventsProcessed: events.length });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to process analytics' });
  }
});

// Scan endpoint
app.post('/api/scan', async (req, res) => {
  try {
    const count = await scanLibrary(MUSIC_LIBRARY_PATH);
    res.json({ message: `Scanned ${count} tracks` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics dashboard endpoint
app.get('/api/analytics/dashboard', (req, res) => {
  try {
    const db = getDb();

    // Get session stats
    const sessionStats = db.prepare(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(DISTINCT ip_address) as unique_ips,
        AVG(duration) as avg_session_duration,
        MAX(start_time) as latest_session
      FROM analytics_sessions
      WHERE start_time > strftime('%s', 'now', '-30 days') * 1000
    `).get();

    // Get popular tracks
    const popularTracks = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.track.trackName') as track_name,
        JSON_EXTRACT(event_data, '$.track.artist') as artist,
        COUNT(*) as play_count
      FROM analytics_events
      WHERE event_type = 'music_action' AND JSON_EXTRACT(event_data, '$.action') = 'play'
      GROUP BY JSON_EXTRACT(event_data, '$.track.trackName'), JSON_EXTRACT(event_data, '$.track.artist')
      ORDER BY play_count DESC
      LIMIT 10
    `).all();

    // Get search queries
    const searchQueries = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.query') as query,
        JSON_EXTRACT(event_data, '$.resultsCount') as results_count,
        COUNT(*) as search_count
      FROM analytics_events
      WHERE event_type = 'search'
      GROUP BY JSON_EXTRACT(event_data, '$.query')
      ORDER BY search_count DESC
      LIMIT 10
    `).all();

    // Get event type breakdown
    const eventBreakdown = db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM analytics_events
      GROUP BY event_type
      ORDER BY count DESC
    `).all();

    res.json({
      sessionStats,
      popularTracks,
      searchQueries,
      eventBreakdown
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Enhanced analytics endpoints
app.get('/api/analytics/sessions/daily', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const db = getDb();

    const dailySessions = db.prepare(`
      SELECT
        DATE(start_time / 1000, 'unixepoch') as date,
        COUNT(*) as sessions,
        COUNT(DISTINCT ip_address) as unique_users,
        AVG(duration) as avg_duration
      FROM analytics_sessions
      WHERE start_time > strftime('%s', 'now', '-${days} days') * 1000
      GROUP BY DATE(start_time / 1000, 'unixepoch')
      ORDER BY date DESC
    `).all();

    res.json({ dailySessions });
  } catch (err) {
    console.error('Daily sessions error:', err);
    res.status(500).json({ error: 'Failed to load daily sessions' });
  }
});

app.get('/api/analytics/events/timeline', (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const db = getDb();

    const timeline = db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:00:00', timestamp / 1000, 'unixepoch') as hour,
        event_type,
        COUNT(*) as count
      FROM analytics_events
      WHERE timestamp > strftime('%s', 'now', '-${hours} hours') * 1000
      GROUP BY hour, event_type
      ORDER BY hour DESC, count DESC
    `).all();

    res.json({ timeline, hours });
  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ error: 'Failed to load timeline' });
  }
});

app.get('/api/analytics/users/demographics', (req, res) => {
  try {
    const db = getDb();

    // Platform breakdown
    const platforms = db.prepare(`
      SELECT platform, COUNT(*) as count
      FROM analytics_sessions
      GROUP BY platform
      ORDER BY count DESC
    `).all();

    // Language breakdown
    const languages = db.prepare(`
      SELECT language, COUNT(*) as count
      FROM analytics_sessions
      GROUP BY language
      ORDER BY count DESC
    `).all();

    // Screen size categories
    const screenSizes = db.prepare(`
      SELECT
        CASE
          WHEN screen_size LIKE '%x%' THEN
            CASE
              WHEN CAST(SUBSTR(screen_size, 1, INSTR(screen_size, 'x') - 1) AS INTEGER) < 768 THEN 'Mobile'
              WHEN CAST(SUBSTR(screen_size, 1, INSTR(screen_size, 'x') - 1) AS INTEGER) < 1024 THEN 'Tablet'
              ELSE 'Desktop'
            END
          ELSE 'Unknown'
        END as category,
        COUNT(*) as count
      FROM analytics_sessions
      GROUP BY category
      ORDER BY count DESC
    `).all();

    res.json({ platforms, languages, screenSizes });
  } catch (err) {
    console.error('Demographics error:', err);
    res.status(500).json({ error: 'Failed to load demographics' });
  }
});

app.get('/api/analytics/music/popularity', (req, res) => {
  try {
    const period = req.query.period || 'week';
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 1;
    const db = getDb();

    // Most played tracks
    const popularTracks = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.track.trackName') as track_name,
        JSON_EXTRACT(event_data, '$.track.artist') as artist,
        JSON_EXTRACT(event_data, '$.track.language') as language,
        COUNT(*) as play_count,
        AVG(JSON_EXTRACT(event_data, '$.currentTime')) as avg_listen_time
      FROM analytics_events
      WHERE event_type = 'music_action'
        AND JSON_EXTRACT(event_data, '$.action') = 'play'
        AND timestamp > strftime('%s', 'now', '-${days} days') * 1000
      GROUP BY JSON_EXTRACT(event_data, '$.track.trackName'), JSON_EXTRACT(event_data, '$.track.artist')
      ORDER BY play_count DESC
      LIMIT 20
    `).all();

    // Language preferences
    const languagePrefs = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.track.language') as language,
        COUNT(*) as play_count
      FROM analytics_events
      WHERE event_type = 'music_action'
        AND JSON_EXTRACT(event_data, '$.action') = 'play'
        AND timestamp > strftime('%s', 'now', '-${days} days') * 1000
      GROUP BY JSON_EXTRACT(event_data, '$.track.language')
      ORDER BY play_count DESC
    `).all();

    res.json({ popularTracks, languagePrefs, period });
  } catch (err) {
    console.error('Music popularity error:', err);
    res.status(500).json({ error: 'Failed to load music popularity' });
  }
});

app.get('/api/analytics/search/analytics', (req, res) => {
  try {
    const db = getDb();

    // Search success rates
    const searchStats = db.prepare(`
      SELECT
        CASE WHEN JSON_EXTRACT(event_data, '$.resultsCount') > 0 THEN 'successful' ELSE 'no_results' END as result_type,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'search'
      GROUP BY result_type
    `).all();

    // Popular search terms
    const popularSearches = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.query') as query,
        JSON_EXTRACT(event_data, '$.resultsCount') as results_count,
        JSON_EXTRACT(event_data, '$.languageFilter') as language_filter,
        COUNT(*) as search_count
      FROM analytics_events
      WHERE event_type = 'search'
      GROUP BY JSON_EXTRACT(event_data, '$.query')
      ORDER BY search_count DESC
      LIMIT 15
    `).all();

    // Language filter usage
    const languageFilters = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.languageFilter') as language,
        COUNT(*) as usage_count
      FROM analytics_events
      WHERE event_type = 'search' AND JSON_EXTRACT(event_data, '$.languageFilter') IS NOT NULL
      GROUP BY JSON_EXTRACT(event_data, '$.languageFilter')
      ORDER BY usage_count DESC
    `).all();

    res.json({ searchStats, popularSearches, languageFilters });
  } catch (err) {
    console.error('Search analytics error:', err);
    res.status(500).json({ error: 'Failed to load search analytics' });
  }
});

app.get('/api/analytics/performance/errors', (req, res) => {
  try {
    const db = getDb();

    // Error events
    const errors = db.prepare(`
      SELECT
        event_type,
        JSON_EXTRACT(event_data, '$.error') as error_message,
        COUNT(*) as count,
        MAX(timestamp) as last_occurred
      FROM analytics_events
      WHERE event_type LIKE '%error%' OR event_type = 'play_failed'
      GROUP BY event_type, JSON_EXTRACT(event_data, '$.error')
      ORDER BY count DESC
      LIMIT 10
    `).all();

    // API performance (if we track response times)
    const apiCalls = db.prepare(`
      SELECT
        event_type,
        COUNT(*) as total_calls,
        AVG(JSON_EXTRACT(event_data, '$.duration')) as avg_duration
      FROM analytics_events
      WHERE event_type IN ('api_search', 'api_load')
      GROUP BY event_type
    `).all();

    res.json({ errors, apiCalls });
  } catch (err) {
    console.error('Performance error:', err);
    res.status(500).json({ error: 'Failed to load performance data' });
  }
});

app.get('/api/analytics/export', (req, res) => {
  try {
    const format = req.query.format || 'json';
    const db = getDb();

    // Export all analytics data
    const sessions = db.prepare('SELECT * FROM analytics_sessions ORDER BY start_time DESC').all();
    const events = db.prepare('SELECT * FROM analytics_events ORDER BY timestamp DESC LIMIT 10000').all();

    const exportData = {
      exportDate: new Date().toISOString(),
      sessions,
      events,
      summary: {
        totalSessions: sessions.length,
        totalEvents: events.length,
        dateRange: {
          earliest: sessions.length > 0 ? new Date(Math.min(...sessions.map(s => s.start_time))) : null,
          latest: sessions.length > 0 ? new Date(Math.max(...sessions.map(s => s.start_time))) : null
        }
      }
    };

    if (format === 'csv') {
      // Convert to CSV format
      let csv = 'Session ID,Start Time,Duration,Platform,Language,IP Address\n';
      sessions.forEach(session => {
        csv += `${session.id},${new Date(session.start_time).toISOString()},${session.duration || 0},${session.platform},${session.language},${session.ip_address}\n`;
      });
      csv += '\nEvent ID,Session ID,Timestamp,Event Type,Data\n';
      events.forEach(event => {
        csv += `${event.id},${event.session_id},${new Date(event.timestamp).toISOString()},${event.event_type},"${JSON.stringify(event.event_data).replace(/"/g, '""')}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="analytics_export.csv"');
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="analytics_export.json"');
      res.json(exportData);
    }
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize database and start server
initDb();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
  console.log(`Accessible at: http://localhost:${PORT}`);
  console.log(`Music library path: ${MUSIC_LIBRARY_PATH}`);

  // Auto-scan on startup
  scanLibrary(MUSIC_LIBRARY_PATH).then(count => {
    console.log(`Initial scan complete: ${count} tracks found`);
  }).catch(err => {
    console.error('Initial scan failed:', err.message);
  });
});
