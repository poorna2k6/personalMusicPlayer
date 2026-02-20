const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function getGoogleClient() {
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
}

// POST /api/auth/google — verify Google ID token, create/update user, return JWT
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google auth not configured on server' });
  }

  try {
    const client = getGoogleClient();
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const db = getDb();
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(payload.sub);

    if (!user) {
      const userId = uuidv4();
      db.prepare(
        'INSERT INTO users (id, google_id, email, name, picture) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, payload.sub, payload.email, payload.name, payload.picture || null);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    } else {
      db.prepare(
        'UPDATE users SET last_login = datetime("now"), name = ?, picture = ? WHERE id = ?'
      ).run(payload.name, payload.picture || null, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, picture: user.picture },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, picture: user.picture },
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

// GET /api/auth/me — get current user from JWT
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db
      .prepare('SELECT id, email, name, picture FROM users WHERE id = ?')
      .get(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
