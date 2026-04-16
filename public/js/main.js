'use strict';

// ── DOM references ─────────────────────────────────────────────────────────────
const loginScreen   = document.getElementById('login-screen');
const gameScreen    = document.getElementById('game-screen');
const nicknameInput = document.getElementById('nickname-input');
const playBtn       = document.getElementById('play-btn');
const loginErrorEl  = document.getElementById('login-error');

const playerNameEl  = document.getElementById('player-name');
const scoreEl       = document.getElementById('score');
const bestScoreEl   = document.getElementById('best-score');
const levelEl       = document.getElementById('level');
const linesEl       = document.getElementById('lines');

const gameCanvas    = document.getElementById('game-canvas');
const nextCanvas    = document.getElementById('next-canvas');
const holdCanvas    = document.getElementById('hold-canvas');

const overlay       = document.getElementById('overlay');
const overlayTitle  = document.getElementById('overlay-title');
const overlayScore  = document.getElementById('overlay-score');
const overlayLines  = document.getElementById('overlay-lines');
const restartBtn    = document.getElementById('restart-btn');

const historyBtn    = document.getElementById('history-btn');
const logoutBtn     = document.getElementById('logout-btn');

const historyModal  = document.getElementById('history-modal');
const closeHistory  = document.getElementById('close-history');
const historyContent= document.getElementById('history-content');

const leaderboardEl = document.getElementById('leaderboard-list');

// ── App state ──────────────────────────────────────────────────────────────────
let player       = null;   // { id, nickname, created_at }
let playerScores = [];     // sorted by score DESC
let game         = null;   // TetrisGame instance
let rafId        = null;   // requestAnimationFrame handle
let flashAlpha   = 0;      // line-clear flash overlay

// ── Keyboard state (DAS / ARR) ─────────────────────────────────────────────────
const DAS_DELAY  = 160;    // ms before auto-repeat starts
const ARR_RATE   = 50;     // ms between auto-repeat ticks

const held       = {};
let leftDasTimer = null;
let leftArrTimer = null;
let rightDasTimer= null;
let rightArrTimer= null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function formatScore(n) {
  return Number(n).toLocaleString('en-US');
}

function formatDate(str) {
  const d = new Date(str);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function bestScore() {
  if (!playerScores.length) return 0;
  return Math.max(...playerScores.map(s => s.score));
}

// ── Screen switching ───────────────────────────────────────────────────────────

function showLogin() {
  gameScreen.classList.remove('active');
  loginScreen.classList.add('active');
  nicknameInput.focus();
}

function showGame() {
  loginScreen.classList.remove('active');
  gameScreen.classList.add('active');
}

// ── Login ──────────────────────────────────────────────────────────────────────

function showLoginError(msg) {
  loginErrorEl.textContent = msg;
  loginErrorEl.classList.remove('hidden');
}

function clearLoginError() {
  loginErrorEl.classList.add('hidden');
}

async function doLogin() {
  const raw = nicknameInput.value.trim();
  if (!raw) {
    showLoginError('Enter a nickname first.');
    return;
  }

  playBtn.disabled    = true;
  playBtn.textContent = '...';
  clearLoginError();

  try {
    const res = await fetch('/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nickname: raw }),
    });

    const data = await res.json();
    if (!res.ok) {
      showLoginError(data.error || 'Something went wrong.');
      return;
    }

    player       = data.player;
    playerScores = data.scores || [];

    localStorage.setItem('tetris_nick', player.nickname);

    showGame();
    startNewGame();
    updateLeaderboard();
  } catch {
    showLoginError('Cannot reach the server. Is it running?');
  } finally {
    playBtn.disabled    = false;
    playBtn.textContent = 'PLAY';
  }
}

// ── Game lifecycle ─────────────────────────────────────────────────────────────

function startNewGame() {
  if (rafId) cancelAnimationFrame(rafId);

  game       = new TetrisGame();
  flashAlpha = 0;

  playerNameEl.textContent = player.nickname;
  scoreEl.textContent      = '0';
  levelEl.textContent      = '1';
  linesEl.textContent      = '0';
  bestScoreEl.textContent  = formatScore(bestScore());

  overlay.classList.add('hidden');

  gameLoop();
}

function gameLoop() {
  const now = performance.now();
  game.update(now);

  // Capture and reset line-clear data before next frame
  if (game.linesCleared.length > 0) {
    flashAlpha = 0.75;
    game.linesCleared = [];
  }
  if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - 0.045);

  render(game, gameCanvas, nextCanvas, holdCanvas, flashAlpha);
  updateHUD();

  if (game.gameOver) {
    handleGameOver();
    return;
  }

  rafId = requestAnimationFrame(gameLoop);
}

function updateHUD() {
  scoreEl.textContent = formatScore(game.score);
  levelEl.textContent = game.level;
  linesEl.textContent = game.lines;

  const best = Math.max(bestScore(), game.score);
  bestScoreEl.textContent = formatScore(best);
}

async function handleGameOver() {
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = formatScore(game.score);
  overlayLines.textContent = `Level ${game.level}  ·  ${game.lines} lines`;

  // Remove pause styling if present
  overlay.querySelector('.overlay-box')?.classList.remove('pause');
  overlay.classList.remove('hidden');

  await saveScore();
}

// ── Score persistence ──────────────────────────────────────────────────────────

async function saveScore() {
  if (!player || game.score === 0) return;
  try {
    const res = await fetch('/api/scores', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: player.id,
        score:    game.score,
        level:    game.level,
        lines:    game.lines,
      }),
    });
    if (res.ok) {
      const data  = await res.json();
      playerScores = data.scores || [];
      bestScoreEl.textContent = formatScore(bestScore());
      updateLeaderboard();
    }
  } catch {
    // Score loss on network error is acceptable — don't block the UI
  }
}

// ── Leaderboard ────────────────────────────────────────────────────────────────

async function updateLeaderboard() {
  try {
    const res  = await fetch('/api/leaderboard');
    const rows = await res.json();

    if (!rows.length) {
      leaderboardEl.innerHTML = '<span class="lb-loading">No scores yet</span>';
      return;
    }

    leaderboardEl.innerHTML = rows
      .slice(0, 10)
      .map((r, i) => {
        const isMe = player && r.nickname === player.nickname;
        return `
          <div class="lb-entry ${isMe ? 'is-me' : ''}">
            <span class="lb-rank">#${i + 1}</span>
            <span class="lb-name">${escapeHtml(r.nickname)}</span>
            <span class="lb-score">${formatScore(r.score)}</span>
          </div>`;
      })
      .join('');
  } catch {
    leaderboardEl.innerHTML = '<span class="lb-loading">Unavailable</span>';
  }
}

// ── History modal ──────────────────────────────────────────────────────────────

function showHistoryModal() {
  if (!playerScores.length) {
    historyContent.innerHTML = '<p class="history-empty">No games yet. Play one!</p>';
  } else {
    historyContent.innerHTML = playerScores
      .map((s, i) => `
        <div class="history-entry">
          <span class="h-rank">#${i + 1}</span>
          <span class="h-score">${formatScore(s.score)}</span>
          <span class="h-details">Lv.${s.level} · ${s.lines} lines</span>
          <span class="h-date">${formatDate(s.created_at)}</span>
        </div>`)
      .join('');
  }
  historyModal.classList.remove('hidden');
  // Pause game while browsing history
  if (game && !game.gameOver && !game.paused) {
    game.togglePause();
    _showPauseOverlay();
  }
}

function closeHistoryModal() {
  historyModal.classList.add('hidden');
}

// ── Pause overlay ──────────────────────────────────────────────────────────────

function _showPauseOverlay() {
  overlayTitle.textContent = 'PAUSED';
  overlayScore.textContent = '';
  overlayLines.textContent = 'Press P to resume';
  const box = overlay.querySelector('.overlay-box');
  if (box) box.classList.add('pause');
  overlay.classList.remove('hidden');
}

function _hidePauseOverlay() {
  const box = overlay.querySelector('.overlay-box');
  if (box) box.classList.remove('pause');
  overlay.classList.add('hidden');
}

// ── Keyboard input ─────────────────────────────────────────────────────────────

function clearMovementTimers() {
  clearTimeout(leftDasTimer);
  clearInterval(leftArrTimer);
  clearTimeout(rightDasTimer);
  clearInterval(rightArrTimer);
  leftDasTimer = leftArrTimer = rightDasTimer = rightArrTimer = null;
}

document.addEventListener('keydown', e => {
  if (held[e.code]) return;   // ignore key-repeat events from the OS
  held[e.code] = true;

  // Allow some keys on the login screen
  if (!game) {
    if (e.code === 'Enter' && loginScreen.classList.contains('active')) {
      doLogin();
    }
    return;
  }

  // Modal is open — only Escape matters
  if (!historyModal.classList.contains('hidden')) {
    if (e.code === 'Escape') closeHistoryModal();
    return;
  }

  switch (e.code) {
    case 'ArrowLeft':
      if (game.gameOver || game.paused) break;
      game.moveLeft();
      leftDasTimer = setTimeout(() => {
        leftArrTimer = setInterval(() => game.moveLeft(), ARR_RATE);
      }, DAS_DELAY);
      break;

    case 'ArrowRight':
      if (game.gameOver || game.paused) break;
      game.moveRight();
      rightDasTimer = setTimeout(() => {
        rightArrTimer = setInterval(() => game.moveRight(), ARR_RATE);
      }, DAS_DELAY);
      break;

    case 'ArrowDown':
      e.preventDefault();
      if (!game.gameOver && !game.paused) game.moveDown();
      break;

    case 'ArrowUp':
      e.preventDefault();
      if (!game.gameOver && !game.paused) game.rotate(1);
      break;

    case 'KeyZ':
      if (!game.gameOver && !game.paused) game.rotate(-1);
      break;

    case 'Space':
      e.preventDefault();
      if (!game.gameOver && !game.paused) game.hardDrop();
      break;

    case 'KeyC':
      if (!game.gameOver && !game.paused) game.hold();
      break;

    case 'KeyP':
      if (game.gameOver) break;
      game.togglePause();
      if (game.paused) {
        _showPauseOverlay();
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      } else {
        _hidePauseOverlay();
        rafId = requestAnimationFrame(gameLoop);
      }
      break;
  }
});

document.addEventListener('keyup', e => {
  held[e.code] = false;
  if (e.code === 'ArrowLeft') {
    clearTimeout(leftDasTimer);
    clearInterval(leftArrTimer);
    leftDasTimer = leftArrTimer = null;
  }
  if (e.code === 'ArrowRight') {
    clearTimeout(rightDasTimer);
    clearInterval(rightArrTimer);
    rightDasTimer = rightArrTimer = null;
  }
});

// ── Button listeners ───────────────────────────────────────────────────────────

playBtn.addEventListener('click', doLogin);

nicknameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') doLogin();
});

restartBtn.addEventListener('click', () => {
  clearMovementTimers();
  startNewGame();
});

historyBtn.addEventListener('click', showHistoryModal);

closeHistory.addEventListener('click', () => {
  closeHistoryModal();
  // Resume game if it was paused just for the modal
  if (game && !game.gameOver && game.paused) {
    game.togglePause();
    _hidePauseOverlay();
    rafId = requestAnimationFrame(gameLoop);
  }
});

historyModal.querySelector('.modal-backdrop').addEventListener('click', () => {
  closeHistory.click();
});

logoutBtn.addEventListener('click', () => {
  if (rafId) cancelAnimationFrame(rafId);
  clearMovementTimers();
  player       = null;
  playerScores = [];
  game         = null;
  localStorage.removeItem('tetris_nick');
  nicknameInput.value = '';
  showLogin();
});

// ── Auto-fill nickname from last session ───────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('tetris_nick');
  if (saved) {
    nicknameInput.value = saved;
    nicknameInput.select();
  } else {
    nicknameInput.focus();
  }
});
