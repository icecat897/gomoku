import { useEffect, useRef, useState, useCallback } from 'react';
import type { Cell, Color, Move } from '../types';
import { BOARD_SIZE } from '../types';

interface BoardProps {
  board: Cell[][];
  lastMove: Move | null;
  winLine: [number, number][] | null;
  pendingMove: { x: number; y: number } | null;
  myColor: Color | null;
  canMove: boolean;
  onCellTap: (x: number, y: number) => void;
}

const PADDING_RATIO = 0.045;

export function Board({
  board,
  lastMove,
  winLine,
  pendingMove,
  myColor,
  canMove,
  onCellTap,
}: BoardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setSize(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!size) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, size, { board, lastMove, winLine, pendingMove, myColor });
  }, [size, board, lastMove, winLine, pendingMove, myColor]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!size || !canMove) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const padding = size * PADDING_RATIO;
      const cellSize = (size - padding * 2) / (BOARD_SIZE - 1);
      const x = Math.round((px - padding) / cellSize);
      const y = Math.round((py - padding) / cellSize);
      if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
      const ix = padding + x * cellSize;
      const iy = padding + y * cellSize;
      const dist = Math.hypot(px - ix, py - iy);
      if (dist > cellSize * 0.55) return;
      onCellTap(x, y);
    },
    [size, canMove, onCellTap],
  );

  return (
    <div ref={wrapperRef} className="board-wrapper">
      <canvas
        ref={canvasRef}
        className="board-canvas"
        onPointerDown={handlePointerDown}
        style={{ cursor: canMove ? 'pointer' : 'default' }}
      />
    </div>
  );
}

interface DrawProps {
  board: Cell[][];
  lastMove: Move | null;
  winLine: [number, number][] | null;
  pendingMove: { x: number; y: number } | null;
  myColor: Color | null;
}

function draw(ctx: CanvasRenderingContext2D, size: number, p: DrawProps) {
  ctx.clearRect(0, 0, size, size);

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#e6c389');
  grad.addColorStop(1, '#cda35e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const padding = size * PADDING_RATIO;
  const cellSize = (size - padding * 2) / (BOARD_SIZE - 1);

  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = Math.max(1, cellSize * 0.025);
  for (let i = 0; i < BOARD_SIZE; i++) {
    const v = padding + i * cellSize;
    ctx.beginPath();
    ctx.moveTo(padding, v);
    ctx.lineTo(size - padding, v);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(v, padding);
    ctx.lineTo(v, size - padding);
    ctx.stroke();
  }

  const stars: Array<[number, number]> = [
    [3, 3],
    [3, 7],
    [3, 11],
    [7, 3],
    [7, 7],
    [7, 11],
    [11, 3],
    [11, 7],
    [11, 11],
  ];
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  for (const [sx, sy] of stars) {
    ctx.beginPath();
    ctx.arc(padding + sx * cellSize, padding + sy * cellSize, cellSize * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = p.board[y]?.[x];
      if (!cell) continue;
      drawStone(
        ctx,
        padding + x * cellSize,
        padding + y * cellSize,
        cellSize * 0.42,
        cell === 1 ? 'black' : 'white',
      );
    }
  }

  if (p.lastMove) {
    const cx = padding + p.lastMove.x * cellSize;
    const cy = padding + p.lastMove.y * cellSize;
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = Math.max(2, cellSize * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (p.pendingMove && p.myColor) {
    const cx = padding + p.pendingMove.x * cellSize;
    const cy = padding + p.pendingMove.y * cellSize;
    ctx.globalAlpha = 0.55;
    drawStone(ctx, cx, cy, cellSize * 0.42, p.myColor);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = Math.max(2, cellSize * 0.07);
    ctx.setLineDash([cellSize * 0.18, cellSize * 0.12]);
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (p.winLine && p.winLine.length >= 2) {
    const [sx, sy] = p.winLine[0];
    const [ex, ey] = p.winLine[p.winLine.length - 1];
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = Math.max(3, cellSize * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(padding + sx * cellSize, padding + sy * cellSize);
    ctx.lineTo(padding + ex * cellSize, padding + ey * cellSize);
    ctx.stroke();
  }
}

function drawStone(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: Color,
) {
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = r * 0.4;
  ctx.shadowOffsetY = r * 0.15;
  const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  if (color === 'black') {
    grad.addColorStop(0, '#5a5a5a');
    grad.addColorStop(0.6, '#1a1a1a');
    grad.addColorStop(1, '#000');
  } else {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#e6e6e6');
    grad.addColorStop(1, '#bdbdbd');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}
