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

// Simple in-memory rate limiter for analytics endpoints
const rateLimitMap = new Map();
function rateLimit(windowMs, maxRequests) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, []);
    }

    const requests = rateLimitMap.get(key).filter(ts => ts > windowStart);
    requests.push(now);
    rateLimitMap.set(key, requests);

    if (requests.length > maxRequests) {
      return res.status(429).json({ error: 'Too many requests, please try again later.' });
    }
    next();
  };
}

// Clean up rate limit map periodically to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const filtered = timestamps.filter(ts => ts > cutoff);
    if (filtered.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, filtered);
    }
  }
}, 5 * 60 * 1000);

// Input validation helpers
function validateDays(days, defaultVal = 30, max = 365) {
  const n = parseInt(days);
  if (isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

function validateHours(hours, defaultVal = 24, max = 168) {
  const n = parseInt(hours);
  if (isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

function validatePeriod(period) {
  const allowed = ['day', 'week', 'month'];
  return allowed.includes(period) ? period : 'week';
}

function validateFormat(format) {
  const allowed = ['json', 'csv'];
  return allowed.includes(format) ? format : 'json';
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve album art and audio files
app.use('/api/audio', express.static(MUSIC_LIBRARY_PATH));

// API routes
app.use('/api/tracks', tracksRouter);
app.use('/api/playlists', playlistsRouter);

// Apply rate limiting to analytics write endpoint
app.post('/api/analytics', rateLimit(60 * 1000, 30), (req, res) => {
  try {
    const { sessionId, events } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 128) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid analytics data: events must be an array' });
    }
    if (events.length > 100) {
      return res.status(400).json({ error: 'Too many events in a single request (max 100)' });
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
    const days = validateDays(req.query.days);
    const db = getDb();

    const cutoff = (Math.floor(Date.now() / 1000) - days * 86400) * 1000;
    const dailySessions = db.prepare(`
      SELECT
        DATE(start_time / 1000, 'unixepoch') as date,
        COUNT(*) as sessions,
        COUNT(DISTINCT ip_address) as unique_users,
        AVG(duration) as avg_duration
      FROM analytics_sessions
      WHERE start_time > ?
      GROUP BY DATE(start_time / 1000, 'unixepoch')
      ORDER BY date DESC
    `).all(cutoff);

    res.json({ dailySessions });
  } catch (err) {
    console.error('Daily sessions error:', err);
    res.status(500).json({ error: 'Failed to load daily sessions' });
  }
});

app.get('/api/analytics/events/timeline', (req, res) => {
  try {
    const hours = validateHours(req.query.hours);
    const db = getDb();

    const cutoff = (Math.floor(Date.now() / 1000) - hours * 3600) * 1000;
    const timeline = db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:00:00', timestamp / 1000, 'unixepoch') as hour,
        event_type,
        COUNT(*) as count
      FROM analytics_events
      WHERE timestamp > ?
      GROUP BY hour, event_type
      ORDER BY hour DESC, count DESC
    `).all(cutoff);

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
    const period = validatePeriod(req.query.period);
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 1;
    const db = getDb();

    const cutoff = (Math.floor(Date.now() / 1000) - days * 86400) * 1000;

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
        AND timestamp > ?
      GROUP BY JSON_EXTRACT(event_data, '$.track.trackName'), JSON_EXTRACT(event_data, '$.track.artist')
      ORDER BY play_count DESC
      LIMIT 20
    `).all(cutoff);

    // Language preferences
    const languagePrefs = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.track.language') as language,
        COUNT(*) as play_count
      FROM analytics_events
      WHERE event_type = 'music_action'
        AND JSON_EXTRACT(event_data, '$.action') = 'play'
        AND timestamp > ?
      GROUP BY JSON_EXTRACT(event_data, '$.track.language')
      ORDER BY play_count DESC
    `).all(cutoff);

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
    const format = validateFormat(req.query.format);
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

// ===== Enhanced Analytics Endpoints for Admin Dashboard =====

// Full dashboard data in one call
app.get('/api/analytics/admin/overview', (req, res) => {
  try {
    const db = getDb();
    const days = validateDays(req.query.days);
    const cutoff = (Math.floor(Date.now() / 1000) - days * 86400) * 1000;

    // KPI summary
    const kpis = db.prepare(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(DISTINCT ip_address) as unique_visitors,
        ROUND(AVG(duration) / 1000.0, 1) as avg_session_sec,
        MAX(start_time) as last_session_time,
        MIN(start_time) as first_session_time
      FROM analytics_sessions
      WHERE start_time > ?
    `).get(cutoff);

    // Today's stats
    const today = db.prepare(`
      SELECT
        COUNT(*) as sessions_today,
        COUNT(DISTINCT ip_address) as visitors_today
      FROM analytics_sessions
      WHERE DATE(start_time/1000, 'unixepoch') = DATE('now')
    `).get();

    // Total events
    const eventCount = db.prepare(`
      SELECT COUNT(*) as total FROM analytics_events
      WHERE timestamp > ?
    `).get(cutoff);

    // Sessions per day (trend)
    const dailyTrend = db.prepare(`
      SELECT
        DATE(start_time/1000, 'unixepoch') as date,
        COUNT(*) as sessions,
        COUNT(DISTINCT ip_address) as unique_users,
        ROUND(AVG(duration)/1000.0, 1) as avg_duration_sec
      FROM analytics_sessions
      WHERE start_time > ?
      GROUP BY date ORDER BY date
    `).all(cutoff);

    // Hourly heatmap (which hours are busiest)
    const hourlyHeatmap = db.prepare(`
      SELECT
        CAST(strftime('%H', start_time/1000, 'unixepoch') AS INTEGER) as hour,
        COUNT(*) as sessions
      FROM analytics_sessions
      WHERE start_time > ?
      GROUP BY hour ORDER BY hour
    `).all(cutoff);

    // Event type breakdown
    const eventBreakdown = db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM analytics_events
      WHERE timestamp > ?
      GROUP BY event_type ORDER BY count DESC
    `).all(cutoff);

    res.json({ kpis, today, eventCount, dailyTrend, hourlyHeatmap, eventBreakdown });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Browser & device breakdown
app.get('/api/analytics/admin/devices', (req, res) => {
  try {
    const db = getDb();
    const days = validateDays(req.query.days);
    const cutoff = (Math.floor(Date.now() / 1000) - days * 86400) * 1000;

    // Extract browser from session_start events
    const browsers = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.browser') as browser,
        JSON_EXTRACT(event_data, '$.browserVersion') as version,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'session_start'
        AND timestamp > ?
      GROUP BY browser ORDER BY count DESC
    `).all(cutoff);

    // OS breakdown
    const operatingSystems = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.os') as os,
        JSON_EXTRACT(event_data, '$.osVersion') as version,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'session_start'
        AND timestamp > ?
      GROUP BY os ORDER BY count DESC
    `).all(cutoff);

    // Device types
    const deviceTypes = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.deviceType') as device_type,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'session_start'
        AND timestamp > ?
      GROUP BY device_type ORDER BY count DESC
    `).all(cutoff);

    // Device models
    const deviceModels = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.deviceModel') as model,
        JSON_EXTRACT(event_data, '$.os') as os,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'session_start'
        AND JSON_EXTRACT(event_data, '$.deviceModel') IS NOT NULL
        AND JSON_EXTRACT(event_data, '$.deviceModel') != ''
        AND timestamp > ?
      GROUP BY model ORDER BY count DESC LIMIT 20
    `).all(cutoff);

    // Screen sizes
    const screenSizes = db.prepare(`
      SELECT screen_size, COUNT(*) as count
      FROM analytics_sessions
      WHERE start_time > ?
        AND screen_size IS NOT NULL
      GROUP BY screen_size ORDER BY count DESC LIMIT 15
    `).all(cutoff);

    // Connection types
    const connections = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.effectiveType') as connection,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'session_start'
        AND timestamp > ?
      GROUP BY connection ORDER BY count DESC
    `).all(cutoff);

    res.json({ browsers, operatingSystems, deviceTypes, deviceModels, screenSizes, connections });
  } catch (err) {
    console.error('Devices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Audience & geography
app.get('/api/analytics/admin/audience', (req, res) => {
  try {
    const db = getDb();
    const days = validateDays(req.query.days);
    const cutoff = (Math.floor(Date.now() / 1000) - days * 86400) * 1000;

    // Timezone distribution (proxy for geography)
    const timezones = db.prepare(`
      SELECT timezone, COUNT(*) as count
      FROM analytics_sessions
      WHERE start_time > ?
        AND timezone IS NOT NULL
      GROUP BY timezone ORDER BY count DESC
    `).all(cutoff);

    // Language
    const languages = db.prepare(`
      SELECT language, COUNT(*) as count
      FROM analytics_sessions
      WHERE start_time > ?
      GROUP BY language ORDER BY count DESC
    `).all(cutoff);

    // New vs returning
    const newVsReturning = db.prepare(`
      SELECT
        CASE WHEN JSON_EXTRACT(event_data, '$.isReturningUser') = 1 THEN 'Returning' ELSE 'New' END as user_type,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'session_start'
        AND timestamp > ?
      GROUP BY user_type
    `).all(cutoff);

    // Color scheme preference
    const colorScheme = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.colorScheme') as scheme,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'session_start'
        AND timestamp > ?
      GROUP BY scheme
    `).all(cutoff);

    // Standalone (PWA) vs browser
    const installMode = db.prepare(`
      SELECT
        CASE WHEN JSON_EXTRACT(event_data, '$.isStandalone') = 1 THEN 'PWA/Standalone' ELSE 'Browser' END as mode,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'session_start'
        AND timestamp > ?
      GROUP BY mode
    `).all(cutoff);

    res.json({ timezones, languages, newVsReturning, colorScheme, installMode });
  } catch (err) {
    console.error('Audience error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Engagement metrics
app.get('/api/analytics/admin/engagement', (req, res) => {
  try {
    const db = getDb();
    const days = validateDays(req.query.days);
    const cutoff = (Math.floor(Date.now() / 1000) - days * 86400) * 1000;

    // Session duration distribution
    const durationBuckets = db.prepare(`
      SELECT
        CASE
          WHEN duration < 10000 THEN '0-10s (Bounce)'
          WHEN duration < 30000 THEN '10-30s'
          WHEN duration < 60000 THEN '30s-1m'
          WHEN duration < 300000 THEN '1-5m'
          WHEN duration < 600000 THEN '5-10m'
          WHEN duration < 1800000 THEN '10-30m'
          ELSE '30m+'
        END as bucket,
        COUNT(*) as count
      FROM analytics_sessions
      WHERE start_time > ?
        AND duration IS NOT NULL
      GROUP BY bucket ORDER BY MIN(duration)
    `).all(cutoff);

    // Feature usage
    const featureUsage = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.feature') as feature,
        COUNT(*) as usage_count
      FROM analytics_events
      WHERE event_type = 'feature_usage'
        AND timestamp > ?
      GROUP BY feature ORDER BY usage_count DESC
    `).all(cutoff);

    // Music actions breakdown
    const musicActions = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.action') as action,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'music_action'
        AND timestamp > ?
      GROUP BY action ORDER BY count DESC
    `).all(cutoff);

    // View navigation patterns
    const viewTransitions = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.fromView') as from_view,
        JSON_EXTRACT(event_data, '$.toView') as to_view,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'navigation'
        AND timestamp > ?
      GROUP BY from_view, to_view ORDER BY count DESC LIMIT 20
    `).all(cutoff);

    // Avg tracks per session
    const tracksPerSession = db.prepare(`
      SELECT
        e.session_id,
        COUNT(*) as tracks_played
      FROM analytics_events e
      WHERE e.event_type = 'music_action'
        AND JSON_EXTRACT(e.event_data, '$.action') = 'play'
        AND e.timestamp > ?
      GROUP BY e.session_id
    `).all(cutoff);
    const avgTracksPerSession = tracksPerSession.length > 0
      ? (tracksPerSession.reduce((s, r) => s + r.tracks_played, 0) / tracksPerSession.length).toFixed(1)
      : 0;

    res.json({ durationBuckets, featureUsage, musicActions, viewTransitions, avgTracksPerSession });
  } catch (err) {
    console.error('Engagement error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Errors & issues
app.get('/api/analytics/admin/errors', (req, res) => {
  try {
    const db = getDb();
    const days = validateDays(req.query.days);
    const cutoff = (Math.floor(Date.now() / 1000) - days * 86400) * 1000;

    const jsErrors = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.message') as message,
        JSON_EXTRACT(event_data, '$.filename') as filename,
        JSON_EXTRACT(event_data, '$.lineno') as line,
        COUNT(*) as count,
        MAX(timestamp) as last_seen
      FROM analytics_events
      WHERE event_type = 'js_error'
        AND timestamp > ?
      GROUP BY message ORDER BY count DESC LIMIT 20
    `).all(cutoff);

    const playbackErrors = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.trackName') as track,
        JSON_EXTRACT(event_data, '$.error') as error,
        COUNT(*) as count,
        MAX(timestamp) as last_seen
      FROM analytics_events
      WHERE event_type = 'playback_error'
        AND timestamp > ?
      GROUP BY error ORDER BY count DESC LIMIT 20
    `).all(cutoff);

    const promiseErrors = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.reason') as reason,
        COUNT(*) as count,
        MAX(timestamp) as last_seen
      FROM analytics_events
      WHERE event_type = 'promise_error'
        AND timestamp > ?
      GROUP BY reason ORDER BY count DESC LIMIT 20
    `).all(cutoff);

    const connectivityIssues = db.prepare(`
      SELECT
        JSON_EXTRACT(event_data, '$.online') as went_online,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'connectivity'
        AND timestamp > ?
      GROUP BY went_online
    `).all(cutoff);

    res.json({ jsErrors, playbackErrors, promiseErrors, connectivityIssues });
  } catch (err) {
    console.error('Errors endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Recent sessions list
app.get('/api/analytics/admin/sessions', (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const sessions = db.prepare(`
      SELECT
        s.*,
        (SELECT COUNT(*) FROM analytics_events WHERE session_id = s.id) as event_count,
        (SELECT JSON_EXTRACT(event_data, '$.browser') FROM analytics_events WHERE session_id = s.id AND event_type = 'session_start' LIMIT 1) as browser,
        (SELECT JSON_EXTRACT(event_data, '$.os') FROM analytics_events WHERE session_id = s.id AND event_type = 'session_start' LIMIT 1) as os,
        (SELECT JSON_EXTRACT(event_data, '$.deviceType') FROM analytics_events WHERE session_id = s.id AND event_type = 'session_start' LIMIT 1) as device_type,
        (SELECT JSON_EXTRACT(event_data, '$.deviceModel') FROM analytics_events WHERE session_id = s.id AND event_type = 'session_start' LIMIT 1) as device_model
      FROM analytics_sessions s
      ORDER BY s.start_time DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM analytics_sessions').get();

    res.json({ sessions, total: total.count, limit, offset });
  } catch (err) {
    console.error('Sessions list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// User specific logs
app.get('/api/analytics/admin/user_logs', (req, res) => {
  try {
    const db = getDb();
    const identifier = req.query.identifier; // can be sessionId or IP address

    if (!identifier) {
      return res.status(400).json({ error: 'identifier is required' });
    }

    const sessions = db.prepare(`
      SELECT s.*
      FROM analytics_sessions s
      WHERE s.id = ? OR s.ip_address = ?
      ORDER BY s.start_time DESC
      LIMIT 20
    `).all(identifier, identifier);

    const sessionIds = sessions.map(s => s.id);
    let events = [];
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      events = db.prepare(`
        SELECT *
        FROM analytics_events
        WHERE session_id IN (${placeholders})
        ORDER BY timestamp DESC
        LIMIT 500
      `).all(...sessionIds);
    }

    res.json({ sessions, events });
  } catch (err) {
    console.error('User logs error:', err);
    res.status(500).json({ error: err.message });
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
