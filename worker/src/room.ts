import type { ClientMsg, Color, GameState, Move, Player, ServerMsg } from './types';
import { BOARD_SIZE } from './types';
import { checkWin, emptyBoard, inBounds, isBoardFull } from './gomoku';

interface SocketAttachment {
  playerId: string;
  playerName: string;
}

interface PendingUndo {
  requesterId: string;
  requesterColor: Color;
  expiresAt: number;
}

function freshState(): GameState {
  return {
    status: 'waiting',
    players: [],
    board: emptyBoard(),
    currentTurn: 'black',
    moves: [],
    winner: null,
    winLine: null,
    rematchVotes: [],
    createdAt: Date.now(),
  };
}

export class GameRoom {
  private ctx: DurableObjectState;
  private state: GameState = freshState();
  private loaded = false;
  private pendingUndo: PendingUndo | null = null;

  constructor(ctx: DurableObjectState, _env: unknown) {
    this.ctx = ctx;
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<GameState>('state');
      if (stored) this.state = stored;
      this.loaded = true;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let msg: ClientMsg;
    try {
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      msg = JSON.parse(text) as ClientMsg;
    } catch {
      this.send(ws, { type: 'error', message: 'invalid json' });
      return;
    }

    try {
      await this.handle(ws, msg);
    } catch (e) {
      this.send(ws, { type: 'error', message: (e as Error).message ?? 'error' });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    const others = this.ctx.getWebSockets().filter((s) => s !== ws);
    const stillOnline = others.some((s) => {
      const a = s.deserializeAttachment() as SocketAttachment | null;
      return a?.playerId === att.playerId;
    });
    if (!stillOnline) {
      const player = this.state.players.find((p) => p.id === att.playerId);
      if (player) {
        player.online = false;
        await this.persist();
        this.broadcast({ type: 'playerLeft', name: player.name, color: player.color }, ws);
        this.broadcastStateExcept(ws);
      }
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private async handle(ws: WebSocket, msg: ClientMsg): Promise<void> {
    if (!this.loaded) return;

    switch (msg.type) {
      case 'ping':
        this.send(ws, { type: 'pong' });
        return;

      case 'join':
        await this.handleJoin(ws, msg.playerId, msg.playerName);
        return;

      case 'move':
        await this.handleMove(ws, msg.x, msg.y);
        return;

      case 'resign':
        await this.handleResign(ws);
        return;

      case 'rematch':
        await this.handleRematch(ws);
        return;

      case 'undo':
        await this.handleUndoRequest(ws);
        return;

      case 'undoVote':
        await this.handleUndoVote(ws, msg.accept);
        return;

      default:
        this.send(ws, { type: 'error', message: 'unknown message' });
    }
  }

  private async handleJoin(ws: WebSocket, playerId: string, playerName: string): Promise<void> {
    if (!playerId || playerId.length > 64) {
      this.send(ws, { type: 'error', message: 'invalid playerId' });
      return;
    }
    const safeName = (playerName || '匿名').slice(0, 16);

    let me = this.state.players.find((p) => p.id === playerId);
    let color: Color | null = null;
    let isSpectator = false;

    if (me) {
      me.online = true;
      me.name = safeName;
      color = me.color;
    } else if (this.state.players.length < 2) {
      const usedColors = new Set(this.state.players.map((p) => p.color));
      if (this.state.players.length === 0) {
        color = Math.random() < 0.5 ? 'black' : 'white';
      } else {
        color = usedColors.has('black') ? 'white' : 'black';
      }
      me = { id: playerId, name: safeName, color, online: true };
      this.state.players.push(me);
      if (this.state.players.length === 2 && this.state.status === 'waiting') {
        this.state.status = 'playing';
        this.state.currentTurn = 'black';
      }
      this.broadcast({ type: 'playerJoined', name: me.name, color: me.color }, ws);
    } else {
      isSpectator = true;
    }

    const att: SocketAttachment = { playerId, playerName: safeName };
    ws.serializeAttachment(att);

    await this.persist();

    this.send(ws, {
      type: 'state',
      state: this.publicState(),
      you: { playerId, color, isSpectator },
    });
    this.broadcastStateExcept(ws);
  }

  private broadcastStateExcept(except: WebSocket): void {
    for (const sock of this.ctx.getWebSockets()) {
      if (sock === except) continue;
      const a = sock.deserializeAttachment() as SocketAttachment | null;
      if (!a) continue;
      const p = this.state.players.find((pl) => pl.id === a.playerId);
      this.send(sock, {
        type: 'state',
        state: this.publicState(),
        you: {
          playerId: a.playerId,
          color: p?.color ?? null,
          isSpectator: !p,
        },
      });
    }
  }

  private async handleMove(ws: WebSocket, x: number, y: number): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) {
      this.send(ws, { type: 'error', message: 'not joined' });
      return;
    }
    const player = this.state.players.find((p) => p.id === att.playerId);
    if (!player) {
      this.send(ws, { type: 'error', message: 'spectators cannot move' });
      return;
    }
    if (this.state.status !== 'playing') {
      this.send(ws, { type: 'error', message: 'game not in progress' });
      return;
    }
    if (this.state.currentTurn !== player.color) {
      this.send(ws, { type: 'error', message: 'not your turn' });
      return;
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) {
      this.send(ws, { type: 'error', message: 'out of bounds' });
      return;
    }
    if (this.state.board[y][x] !== 0) {
      this.send(ws, { type: 'error', message: 'cell occupied' });
      return;
    }

    this.state.board[y][x] = player.color === 'black' ? 1 : 2;
    const move: Move = { x, y, color: player.color, ts: Date.now() };
    this.state.moves.push(move);
    this.pendingUndo = null;

    const winLine = checkWin(this.state.board, x, y);
    let nextTurn: Color = player.color === 'black' ? 'white' : 'black';

    if (winLine) {
      this.state.status = 'finished';
      this.state.winner = player.color;
      this.state.winLine = winLine;
    } else if (isBoardFull(this.state.board)) {
      this.state.status = 'finished';
      this.state.winner = 'draw';
    } else {
      this.state.currentTurn = nextTurn;
    }

    await this.persist();
    this.broadcastAll({ type: 'move', move, nextTurn, winLine: winLine ?? null });
    if (this.state.winner) {
      this.broadcastAll({
        type: 'gameOver',
        winner: this.state.winner,
        winLine: this.state.winLine,
      });
    }
  }

  private async handleResign(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    const player = this.state.players.find((p) => p.id === att.playerId);
    if (!player || this.state.status !== 'playing') return;
    const winnerColor: Color = player.color === 'black' ? 'white' : 'black';
    this.state.status = 'finished';
    this.state.winner = winnerColor;
    this.state.winLine = null;
    await this.persist();
    this.broadcastAll({ type: 'gameOver', winner: winnerColor, winLine: null });
  }

  private async handleRematch(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    if (this.state.status !== 'finished') return;
    const player = this.state.players.find((p) => p.id === att.playerId);
    if (!player) return;

    if (!this.state.rematchVotes.includes(player.id)) {
      this.state.rematchVotes.push(player.id);
    }

    if (this.state.rematchVotes.length >= 2) {
      const newPlayers: Player[] = this.state.players.map((p) => ({
        ...p,
        color: p.color === 'black' ? 'white' : 'black',
      }));
      this.state = {
        ...freshState(),
        players: newPlayers,
        status: 'playing',
        currentTurn: 'black',
        createdAt: this.state.createdAt,
      };
      await this.persist();
      for (const sock of this.ctx.getWebSockets()) {
        const a = sock.deserializeAttachment() as SocketAttachment | null;
        if (!a) continue;
        const p = newPlayers.find((np) => np.id === a.playerId);
        this.send(sock, {
          type: 'state',
          state: this.publicState(),
          you: {
            playerId: a.playerId,
            color: p?.color ?? null,
            isSpectator: !p,
          },
        });
      }
    } else {
      await this.persist();
      this.broadcastAll({ type: 'rematchVote', voters: this.state.rematchVotes });
    }
  }

  private async handleUndoRequest(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    const player = this.state.players.find((p) => p.id === att.playerId);
    if (!player || this.state.status !== 'playing') return;
    if (this.state.moves.length === 0) return;

    this.pendingUndo = {
      requesterId: player.id,
      requesterColor: player.color,
      expiresAt: Date.now() + 30_000,
    };
    this.broadcastAll({ type: 'undoRequest', from: player.color });
  }

  private async handleUndoVote(ws: WebSocket, accept: boolean): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att || !this.pendingUndo) return;
    const player = this.state.players.find((p) => p.id === att.playerId);
    if (!player || player.id === this.pendingUndo.requesterId) return;

    if (!accept) {
      this.pendingUndo = null;
      this.broadcastAll({ type: 'undoRejected' });
      return;
    }

    const stepsToUndo = this.state.currentTurn === this.pendingUndo.requesterColor ? 2 : 1;
    for (let i = 0; i < stepsToUndo && this.state.moves.length > 0; i++) {
      const last = this.state.moves.pop()!;
      this.state.board[last.y][last.x] = 0;
    }
    this.state.currentTurn = this.pendingUndo.requesterColor;
    this.pendingUndo = null;
    await this.persist();
    this.broadcastAll({
      type: 'undoApplied',
      moves: this.state.moves,
      currentTurn: this.state.currentTurn,
    });
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  private broadcast(msg: ServerMsg, except?: WebSocket): void {
    for (const sock of this.ctx.getWebSockets()) {
      if (sock === except) continue;
      this.send(sock, msg);
    }
  }

  private broadcastAll(msg: ServerMsg): void {
    this.broadcast(msg);
  }

  private publicState(): GameState {
    return this.state;
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put('state', this.state);
  }
}
