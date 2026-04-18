'use strict';

const path = require('path');

// Returns a database abstraction with the same async interface
// regardless of whether we're using SQLite or PostgreSQL.
async function createDb() {
  if (process.env.DATABASE_URL) {
    return createPostgresDb();
  }
  return createSqliteDb();
}

// ─── PostgreSQL (Railway / production) ────────────────────────────────────────

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

  return {
    async getOrCreatePlayer(nickname) {
      let { rows } = await pool.query(
        'SELECT * FROM players WHERE nickname = $1',
        [nickname]
      );
      if (rows.length === 0) {
        ({ rows } = await pool.query(
          'INSERT INTO players (nickname) VALUES ($1) RETURNING *',
          [nickname]
        ));
      }
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
        FROM scores s
        JOIN players p ON s.player_id = p.id
        ORDER BY s.score DESC, s.created_at DESC
      `);
      return rows;
    },
  };
}

// ─── SQLite (local dev) ────────────────────────────────────────────────────────

async function createSqliteDb() {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, 'tetris.db'));

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname   TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      score      INTEGER NOT NULL,
      level      INTEGER NOT NULL,
      lines      INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return {
    async getOrCreatePlayer(nickname) {
      let player = db.prepare('SELECT * FROM players WHERE nickname = ?').get(nickname);
      if (!player) {
        db.prepare('INSERT INTO players (nickname) VALUES (?)').run(nickname);
        player = db.prepare('SELECT * FROM players WHERE nickname = ?').get(nickname);
      }
      return player;
    },

    async saveScore(playerId, score, level, lines) {
      const result = db.prepare(
        'INSERT INTO scores (player_id, score, level, lines) VALUES (?, ?, ?, ?)'
      ).run(playerId, score, level, lines);
      return db.prepare('SELECT * FROM scores WHERE id = ?').get(result.lastInsertRowid);
    },

    async getPlayerScores(playerId) {
      return db.prepare(
        'SELECT * FROM scores WHERE player_id = ? ORDER BY score DESC, created_at DESC LIMIT 10'
      ).all(playerId);
    },

    async getLeaderboard() {
      return db.prepare(`
        SELECT p.nickname, s.score, s.level, s.lines, s.created_at
        FROM scores s
        JOIN players p ON s.player_id = p.id
        ORDER BY s.score DESC, s.created_at DESC
      `).all();
    },
  };
}

module.exports = { createDb };
