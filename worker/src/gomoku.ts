import type { Cell } from './types';
import { BOARD_SIZE } from './types';

const DIRS: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function emptyBoard(): Cell[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => 0 as Cell),
  );
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function checkWin(
  board: Cell[][],
  x: number,
  y: number,
): [number, number][] | null {
  const player = board[y]?.[x];
  if (!player) return null;
  for (const [dx, dy] of DIRS) {
    const line: Array<[number, number]> = [[x, y]];
    for (let i = 1; i < BOARD_SIZE; i++) {
      const nx = x + dx * i;
      const ny = y + dy * i;
      if (!inBounds(nx, ny) || board[ny][nx] !== player) break;
      line.push([nx, ny]);
    }
    for (let i = 1; i < BOARD_SIZE; i++) {
      const nx = x - dx * i;
      const ny = y - dy * i;
      if (!inBounds(nx, ny) || board[ny][nx] !== player) break;
      line.unshift([nx, ny]);
    }
    if (line.length >= 5) return line;
  }
  return null;
}

export function isBoardFull(board: Cell[][]): boolean {
  for (const row of board) for (const c of row) if (c === 0) return false;
  return true;
}
