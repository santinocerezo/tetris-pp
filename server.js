'use strict';

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const { createDb } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const corsOptions = allowedOrigins.length
  ? {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('CORS: origin not allowed'));
      },
    }
  : {};

const MAX_SCORE = 10_000_000;
const MAX_LEVEL = 30;
const MAX_LINES = 100_000;

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many score submissions.' },
});
app.use('/api/', apiLimiter);

let db;

// ─── Validation ────────────────────────────────────────────────────────────────

const NICKNAME_REGEX = /^[a-zA-Z0-9 _\-\.]{1,30}$/;

function sanitize(nickname) {
  return nickname.trim().slice(0, 30);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.post('/api/login', writeLimiter, async (req, res) => {
  try {
    const { nickname } = req.body || {};
    const clean = typeof nickname === 'string' ? sanitize(nickname) : '';

    if (!NICKNAME_REGEX.test(clean)) {
      return res.status(400).json({
        error: 'Nickname must be 1–30 characters (letters, numbers, spaces, _ - .)',
      });
    }

    const player = await db.getOrCreatePlayer(clean);
    const scores = await db.getPlayerScores(player.id);

    res.json({ player, scores });
  } catch (err) {
    console.error('[POST /api/login]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/scores', writeLimiter, async (req, res) => {
  try {
    const { playerId, score, level, lines } = req.body || {};

    if (
      !Number.isInteger(playerId) || playerId <= 0 ||
      !Number.isInteger(score)    || score < 0 || score > MAX_SCORE  ||
      !Number.isInteger(level)    || level < 1 || level > MAX_LEVEL  ||
      !Number.isInteger(lines)    || lines < 0 || lines > MAX_LINES
    ) {
      return res.status(400).json({ error: 'Invalid score payload' });
    }

    await db.saveScore(playerId, score, level, lines);
    const scores = await db.getPlayerScores(playerId);

    res.json({ scores });
  } catch (err) {
    console.error('[POST /api/scores]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const rows = await db.getLeaderboard();
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/leaderboard]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

createDb()
  .then(database => {
    db = database;
    app.listen(PORT, () => {
      console.log(`Tetris server listening on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
