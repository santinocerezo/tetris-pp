'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { createDb } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

// ─── Validation helpers ────────────────────────────────────────────────────────

function isValidNickname(nickname) {
  return typeof nickname === 'string'
    && nickname.trim().length >= 1
    && nickname.trim().length <= 30
    && /^[a-zA-Z0-9 _\-\.]+$/.test(nickname.trim());
}

function sanitize(nickname) {
  return nickname.trim().slice(0, 30);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Login or register — no password, just a nickname
app.post('/api/login', async (req, res) => {
  try {
    const { nickname } = req.body;

    if (!isValidNickname(nickname)) {
      return res.status(400).json({
        error: 'Nickname must be 1–30 characters (letters, numbers, spaces, _ - .)',
      });
    }

    const clean  = sanitize(nickname);
    const player = await db.getOrCreatePlayer(clean);
    const scores = await db.getPlayerScores(player.id);

    res.json({ player, scores });
  } catch (err) {
    console.error('[POST /api/login]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save a completed game score
app.post('/api/scores', async (req, res) => {
  try {
    const { playerId, score, level, lines } = req.body;

    if (
      !Number.isInteger(playerId) ||
      !Number.isInteger(score)    || score < 0  ||
      !Number.isInteger(level)    || level < 1  ||
      !Number.isInteger(lines)    || lines < 0
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

// Global top-20 leaderboard
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

// ─── Start ─────────────────────────────────────────────────────────────────────

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
