'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────

const BOARD_W = 10;
const BOARD_H = 20;

// Standard Tetromino shapes, all 4 rotations defined explicitly.
// Each shape is an array of rows; 1 = filled cell, 0 = empty.
const PIECES = {
  I: {
    color: '#00f5ff',
    shapes: [
      [[1,1,1,1]],
      [[1],[1],[1],[1]],
    ],
  },
  O: {
    color: '#ffe600',
    shapes: [
      [[1,1],[1,1]],
    ],
  },
  T: {
    color: '#bf00ff',
    shapes: [
      [[0,1,0],[1,1,1]],
      [[1,0],[1,1],[1,0]],
      [[1,1,1],[0,1,0]],
      [[0,1],[1,1],[0,1]],
    ],
  },
  S: {
    color: '#39ff14',
    shapes: [
      [[0,1,1],[1,1,0]],
      [[1,0],[1,1],[0,1]],
    ],
  },
  Z: {
    color: '#ff073a',
    shapes: [
      [[1,1,0],[0,1,1]],
      [[0,1],[1,1],[1,0]],
    ],
  },
  J: {
    color: '#4466ff',
    shapes: [
      [[1,0,0],[1,1,1]],
      [[1,1],[1,0],[1,0]],
      [[1,1,1],[0,0,1]],
      [[0,1],[0,1],[1,1]],
    ],
  },
  L: {
    color: '#ff8c00',
    shapes: [
      [[0,0,1],[1,1,1]],
      [[1,0],[1,0],[1,1]],
      [[1,1,1],[1,0,0]],
      [[1,1],[0,1],[0,1]],
    ],
  },
};

const PIECE_TYPES = Object.keys(PIECES);

// Points awarded per number of lines cleared × current level
const LINE_POINTS = [0, 100, 300, 500, 800];

// Drop interval (ms) per level index (level 1 = index 0, etc.)
const DROP_INTERVALS = [800, 717, 633, 550, 467, 383, 300, 217, 133, 100, 83];

// ── TetrisGame class ──────────────────────────────────────────────────────────

class TetrisGame {
  constructor() {
    this._bag = [];
    this.reset();
  }

  // Re-initialize everything for a fresh game
  reset() {
    // Board: 2D array, each cell is null or a color string
    this.board = Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(null));

    this.score    = 0;
    this.level    = 1;
    this.lines    = 0;
    this.gameOver = false;
    this.paused   = false;
    this.canHold  = true;
    this.holdPiece = null;

    // Rows cleared during the last lock (populated by _clearLines, consumed externally)
    this.linesCleared = [];

    // Floating score texts that drift upward after a line clear
    this.floatingTexts = [];

    this._bag      = [];
    this._lastDrop = performance.now();

    this.currentPiece = this._spawnPiece();
    this.nextPiece    = this._spawnPiece();
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  _dropInterval() {
    const idx = Math.min(this.level - 1, DROP_INTERVALS.length - 1);
    return DROP_INTERVALS[idx];
  }

  // 7-bag randomizer: shuffle a full set of pieces and draw from it
  _drawFromBag() {
    if (this._bag.length === 0) {
      this._bag = [...PIECE_TYPES];
      for (let i = this._bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this._bag[i], this._bag[j]] = [this._bag[j], this._bag[i]];
      }
    }
    return this._bag.pop();
  }

  _spawnPiece(type) {
    const t      = type || this._drawFromBag();
    const def    = PIECES[t];
    const shape  = def.shapes[0];
    const cols   = shape[0].length;

    return {
      type,
      rotation: 0,
      shape,
      shapes: def.shapes,
      color: def.color,
      x: Math.floor((BOARD_W - cols) / 2),
      y: 0,
    };
  }

  // Returns true if `shape` placed at (x, y) does not collide with walls or locked cells
  _isValid(shape, x, y) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = x + c;
        const ny = y + r;
        if (nx < 0 || nx >= BOARD_W || ny >= BOARD_H) return false;
        if (ny >= 0 && this.board[ny][nx] !== null) return false;
      }
    }
    return true;
  }

  // Lock the current piece into the board, then check for cleared lines
  _lockPiece() {
    const { shape, x, y, color } = this.currentPiece;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const ny = y + r;
        if (ny < 0) {
          // Piece locked above the visible board → game over
          this.gameOver = true;
          return;
        }
        this.board[ny][x + c] = color;
      }
    }

    this._clearLines();

    this.canHold      = true;
    this.currentPiece = this.nextPiece;
    this.nextPiece    = this._spawnPiece();

    // If the new piece immediately collides, game over
    if (!this._isValid(this.currentPiece.shape, this.currentPiece.x, this.currentPiece.y)) {
      this.gameOver = true;
    }
  }

  _clearLines() {
    const full = [];
    for (let r = 0; r < BOARD_H; r++) {
      if (this.board[r].every(cell => cell !== null)) {
        full.push(r);
      }
    }
    if (full.length === 0) return;

    // Remove full rows (top to bottom so indices stay valid)
    for (const r of [...full].reverse()) {
      this.board.splice(r, 1);
    }
    // Prepend empty rows to keep board height
    while (this.board.length < BOARD_H) {
      this.board.unshift(Array(BOARD_W).fill(null));
    }

    const pts = LINE_POINTS[full.length] * this.level;
    this.score += pts;
    this.lines += full.length;
    this.level  = Math.floor(this.lines / 10) + 1;

    this.linesCleared = full;

    // Spawn a floating text in the middle of the board
    const labels = ['', '+' + pts, 'DOUBLE! +' + pts, 'TRIPLE! +' + pts, '✦ TETRIS! +' + pts];
    this.floatingTexts.push({
      x:     BOARD_W / 2,
      y:     full[0] - 0.5,
      text:  labels[full.length] || '+' + pts,
      color: full.length >= 4 ? '#ff073a' : '#ffffff',
      alpha: 1.2,
      vy:   -0.08,
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Returns the lowest Y the current piece can fall to (for ghost rendering)
  getGhostY() {
    const { shape, x, y } = this.currentPiece;
    let gy = y;
    while (this._isValid(shape, x, gy + 1)) gy++;
    return gy;
  }

  moveLeft() {
    if (this.gameOver || this.paused) return;
    const { shape, x, y } = this.currentPiece;
    if (this._isValid(shape, x - 1, y)) this.currentPiece.x--;
  }

  moveRight() {
    if (this.gameOver || this.paused) return;
    const { shape, x, y } = this.currentPiece;
    if (this._isValid(shape, x + 1, y)) this.currentPiece.x++;
  }

  // Returns true if the piece moved down, false if it locked
  moveDown() {
    if (this.gameOver || this.paused) return false;
    const { shape, x, y } = this.currentPiece;
    if (this._isValid(shape, x, y + 1)) {
      this.currentPiece.y++;
      this.score++;  // soft drop bonus
      this._lastDrop = performance.now();
      return true;
    }
    this._lockPiece();
    return false;
  }

  hardDrop() {
    if (this.gameOver || this.paused) return;
    const ghostY   = this.getGhostY();
    const distance = ghostY - this.currentPiece.y;
    this.score += distance * 2;
    this.currentPiece.y = ghostY;
    this._lockPiece();
    this._lastDrop = performance.now();
  }

  // direction: +1 = clockwise, -1 = counter-clockwise
  rotate(direction) {
    if (this.gameOver || this.paused) return;
    const piece    = this.currentPiece;
    const nextRot  = (piece.rotation + direction + piece.shapes.length) % piece.shapes.length;
    const newShape = piece.shapes[nextRot];

    // Try the natural position first, then kick left/right by 1 and 2 cells
    const kicks = [0, 1, -1, 2, -2];
    for (const kick of kicks) {
      if (this._isValid(newShape, piece.x + kick, piece.y)) {
        piece.x        += kick;
        piece.rotation  = nextRot;
        piece.shape     = newShape;
        return;
      }
    }
    // If still no valid position, try kicking up once (floor kicks)
    if (this._isValid(newShape, piece.x, piece.y - 1)) {
      piece.y--;
      piece.rotation = nextRot;
      piece.shape    = newShape;
    }
  }

  hold() {
    if (this.gameOver || this.paused || !this.canHold) return;
    this.canHold = false;

    const swapBack = this.holdPiece ? this.holdPiece.type : null;

    this.holdPiece = {
      type:   this.currentPiece.type,
      color:  this.currentPiece.color,
      shapes: this.currentPiece.shapes,
    };

    this.currentPiece = swapBack
      ? this._spawnPiece(swapBack)
      : this.nextPiece;

    if (!swapBack) {
      this.nextPiece = this._spawnPiece();
    }
  }

  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
    if (!this.paused) this._lastDrop = performance.now();
  }

  // Called every animation frame; handles gravity and floating text decay
  update(now) {
    if (this.gameOver || this.paused) return;

    // Decay floating texts
    this.floatingTexts = this.floatingTexts
      .map(t => ({ ...t, y: t.y + t.vy, alpha: t.alpha - 0.025 }))
      .filter(t => t.alpha > 0);

    // Gravity
    if (now - this._lastDrop >= this._dropInterval()) {
      this._lastDrop = now;
      const { shape, x, y } = this.currentPiece;
      if (this._isValid(shape, x, y + 1)) {
        this.currentPiece.y++;
      } else {
        this._lockPiece();
      }
    }
  }
}
