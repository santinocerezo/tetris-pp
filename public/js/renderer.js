'use strict';

// ── Cell size in pixels for the main board ─────────────────────────────────────
const CELL = 30;

// ── Draw one filled cell on the main canvas ────────────────────────────────────
function drawCell(ctx, col, row, color, alpha = 1) {
  const x = col * CELL;
  const y = row * CELL;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur  = 14;

  // Main fill
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

  // Remove glow for overlays
  ctx.shadowBlur = 0;

  // Top-left highlight to give a 3-D feel
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x + 2, y + 2, CELL - 4, 3);   // top strip
  ctx.fillRect(x + 2, y + 2, 3, CELL - 4);   // left strip

  // Darker bottom-right for depth
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 3, y + CELL - 4, CELL - 4, 3);  // bottom strip
  ctx.fillRect(x + CELL - 4, y + 3, 3, CELL - 4);  // right strip

  // Subtle inner border
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);

  ctx.restore();
}

// ── Draw the static board (background + locked cells) ─────────────────────────
function drawBoard(ctx, board) {
  // Dark background
  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, BOARD_W * CELL, BOARD_H * CELL);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth   = 1;
  for (let c = 0; c <= BOARD_W; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, BOARD_H * CELL);
    ctx.stroke();
  }
  for (let r = 0; r <= BOARD_H; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(BOARD_W * CELL, r * CELL);
    ctx.stroke();
  }

  // Locked pieces
  for (let r = 0; r < BOARD_H; r++) {
    for (let c = 0; c < BOARD_W; c++) {
      if (board[r][c]) {
        drawCell(ctx, c, r, board[r][c]);
      }
    }
  }
}

// ── Draw the ghost piece (outline where the current piece will land) ───────────
function drawGhost(ctx, game) {
  const { shape, x, color } = game.currentPiece;
  const gy = game.getGhostY();

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.globalAlpha = 0.28;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 8;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const px = (x + c) * CELL;
      const py = (gy + r) * CELL;
      ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
    }
  }
  ctx.restore();
}

// ── Draw the active falling piece ─────────────────────────────────────────────
function drawActivePiece(ctx, piece) {
  const { shape, x, y, color } = piece;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c] && y + r >= 0) {
        drawCell(ctx, x + c, y + r, color);
      }
    }
  }
}

// ── White flash overlay (triggered on line clear) ─────────────────────────────
function drawFlash(ctx, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = '#ffffff';
  ctx.fillRect(0, 0, BOARD_W * CELL, BOARD_H * CELL);
  ctx.restore();
}

// ── Score / clear label floating texts ────────────────────────────────────────
function drawFloatingTexts(ctx, texts) {
  ctx.save();
  ctx.font      = 'bold 13px Orbitron, monospace';
  ctx.textAlign = 'center';
  for (const t of texts) {
    if (t.alpha <= 0) continue;
    ctx.globalAlpha = Math.min(1, t.alpha);
    ctx.fillStyle   = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur  = 12;
    ctx.fillText(t.text, t.x * CELL, t.y * CELL);
  }
  ctx.restore();
}

// ── Draw a piece centered in a small preview canvas (next / hold) ─────────────
function drawPreview(canvas, piece) {
  const ctx = canvas.getContext('2d');
  const w   = canvas.width;
  const h   = canvas.height;

  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, w, h);

  if (!piece) return;

  const shape    = piece.shapes ? piece.shapes[0] : piece.shape;
  const color    = piece.color;
  const cs       = 18;  // preview cell size
  const cols     = shape[0].length;
  const rows     = shape.length;
  const offsetX  = (w - cols * cs) / 2;
  const offsetY  = (h - rows * cs) / 2;

  ctx.save();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!shape[r][c]) continue;
      const px = offsetX + c * cs;
      const py = offsetY + r * cs;

      ctx.shadowColor = color;
      ctx.shadowBlur  = 10;
      ctx.fillStyle   = color;
      ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);

      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(255,255,255,0.20)';
      ctx.fillRect(px + 2, py + 2, cs - 4, 2);
      ctx.fillRect(px + 2, py + 2, 2, cs - 4);
    }
  }
  ctx.restore();
}

// ── Master render call — called every animation frame ─────────────────────────
function render(game, gameCanvas, nextCanvas, holdCanvas, flashAlpha) {
  const ctx = gameCanvas.getContext('2d');

  drawBoard(ctx, game.board);

  // Only render moving pieces when the game is actively running
  if (!game.gameOver) {
    drawGhost(ctx, game);
    drawActivePiece(ctx, game.currentPiece);
  }

  drawFlash(ctx, flashAlpha);
  drawFloatingTexts(ctx, game.floatingTexts);

  drawPreview(nextCanvas, game.nextPiece);
  drawPreview(holdCanvas, game.holdPiece);
}
