export type Cell = 0 | 1 | 2;
export type Color = 'black' | 'white';
export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface Player {
  id: string;
  name: string;
  color: Color;
  online: boolean;
}

export interface Move {
  x: number;
  y: number;
  color: Color;
  ts: number;
}

export interface GameState {
  status: GameStatus;
  players: Player[];
  board: Cell[][];
  currentTurn: Color;
  moves: Move[];
  winner: Color | 'draw' | null;
  winLine: [number, number][] | null;
  rematchVotes: string[];
  createdAt: number;
}

export interface PublicState extends GameState {}

export type ClientMsg =
  | { type: 'join'; playerId: string; playerName: string }
  | { type: 'move'; x: number; y: number }
  | { type: 'resign' }
  | { type: 'rematch' }
  | { type: 'undo' }
  | { type: 'undoVote'; accept: boolean }
  | { type: 'ping' };

export type ServerMsg =
  | {
      type: 'state';
      state: PublicState;
      you: { playerId: string; color: Color | null; isSpectator: boolean };
    }
  | { type: 'move'; move: Move; nextTurn: Color; winLine?: [number, number][] | null }
  | { type: 'gameOver'; winner: Color | 'draw'; winLine: [number, number][] | null }
  | { type: 'playerJoined'; name: string; color: Color }
  | { type: 'playerLeft'; name: string; color: Color }
  | { type: 'rematchVote'; voters: string[] }
  | { type: 'undoRequest'; from: Color }
  | { type: 'undoApplied'; moves: Move[]; currentTurn: Color }
  | { type: 'undoRejected' }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export const BOARD_SIZE = 15;
