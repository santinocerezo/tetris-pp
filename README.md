# TETRIS — Neon Edition

A fully-featured Tetris game built with vanilla JavaScript, Node.js, and Express.  
Player profiles, score history, and a global leaderboard — no account needed, just enter your name.

![Tetris Neon]()

## Features

- Neon / fluorescent visual design with glow effects on the game canvas
- Player profiles saved by nickname — no password required
- Full score history per player (best 10 games)
- Global leaderboard (top 20 scores)
- Ghost piece, hold piece, and next piece preview
- Standard 7-bag randomizer and SRS-style wall kicks
- Scoring: 100 / 300 / 500 / 800 points × level per line clear
- Speed increases every 10 lines cleared
- Keyboard controls with DAS (Delayed Auto Shift)

## Controls

| Key | Action |
|-----|--------|
| ← → | Move left / right |
| ↑ | Rotate clockwise |
| Z | Rotate counter-clockwise |
| ↓ | Soft drop (+1 pt/cell) |
| Space | Hard drop (+2 pt/cell) |
| C | Hold piece |
| P | Pause / Resume |

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Deploying to Railway

1. Push this repo to GitHub
2. Go to [Railway](https://railway.app) → New Project → Deploy from GitHub
3. Select this repo
4. *(Optional but recommended)* Add a PostgreSQL plugin to your Railway project
5. Railway auto-sets `DATABASE_URL` — the app will use PostgreSQL automatically when it's present
6. Set `PORT` if needed (Railway injects it automatically)
7. Deploy

> **Note:** Without a PostgreSQL plugin, the app uses SQLite. Data in SQLite will reset on each Railway redeploy. Add the PostgreSQL plugin for persistent storage.

## Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (local) / PostgreSQL (production via `DATABASE_URL`)
- **Frontend:** Vanilla HTML + CSS + JavaScript — no frameworks, no bundler
- **Canvas:** HTML5 Canvas API for game rendering
