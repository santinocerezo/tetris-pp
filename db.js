'use strict';

// Unified DB adapter. Usa PostgreSQL si hay DATABASE_URL; caso contrario
// cae a un fallback in-memory para poder correr el juego en local sin setup.

async function createDb() {
  if (process.env.DATABASE_URL) return createPostgresDb();
  return createMemoryDb();
}

// ─── PostgreSQL ───────────────────────────────────────────────────────────────

async function createPostgresDb() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id         SERIAL PRIMARY KEY,
      nickname   VARCHAR(30) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id         SERIAL PRIMARY KEY,
      player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      score      INTEGER NOT NULL,
      level      INTEGER NOT NULL,
      lines      INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_scores_score  ON scores(score DESC)');

  return {
    async getOrCreatePlayer(nickname) {
      const { rows } = await pool.query(`
        INSERT INTO players (nickname) VALUES ($1)
        ON CONFLICT (nickname) DO UPDATE SET nickname = EXCLUDED.nickname
        RETURNING *
      `, [nickname]);
      return rows[0];
    },
    async saveScore(playerId, score, level, lines) {
      const { rows } = await pool.query(
        'INSERT INTO scores (player_id, score, level, lines) VALUES ($1, $2, $3, $4) RETURNING *',
        [playerId, score, level, lines]
      );
      return rows[0];
    },
    async getPlayerScores(playerId) {
      const { rows } = await pool.query(
        'SELECT * FROM scores WHERE player_id = $1 ORDER BY score DESC, created_at DESC LIMIT 10',
        [playerId]
      );
      return rows;
    },
    async getLeaderboard() {
      const { rows } = await pool.query(`
        SELECT p.nickname, s.score, s.level, s.lines, s.created_at
        FROM scores s JOIN players p ON s.player_id = p.id
        ORDER BY s.score DESC, s.created_at DESC
      `);
      return rows;
    },
  };
}

// ─── In-memory fallback ───────────────────────────────────────────────────────

function createMemoryDb() {
  console.log('[DB] No DATABASE_URL — using in-memory storage.');
  const playersByName = new Map();
  const playersById   = new Map();
  const scores        = [];
  let nextPlayerId = 1;
  let nextScoreId  = 1;

  return {
    async getOrCreatePlayer(nickname) {
      const key = nickname.toLowerCase();
      let p = playersByName.get(key);
      if (!p) {
        p = { id: nextPlayerId++, nickname, created_at: new Date() };
        playersByName.set(key, p);
        playersById.set(p.id, p);
      }
      return p;
    },
    async saveScore(playerId, score, level, lines) {
      const row = { id: nextScoreId++, player_id: playerId, score, level, lines, created_at: new Date() };
      scores.push(row);
      return row;
    },
    async getPlayerScores(playerId) {
      return scores
        .filter(s => s.player_id === playerId)
        .sort((a, b) => b.score - a.score || b.created_at - a.created_at)
        .slice(0, 10);
    },
    async getLeaderboard() {
      return scores
        .slice()
        .sort((a, b) => b.score - a.score || b.created_at - a.created_at)
        .map(s => {
          const p = playersById.get(s.player_id);
          return p ? { nickname: p.nickname, score: s.score, level: s.level, lines: s.lines, created_at: s.created_at } : null;
        })
        .filter(Boolean);
    },
  };
}

module.exports = { createDb };
