import { useEffect, useRef, useState, useCallback } from 'react';
import type { ClientMsg, Color, GameState, ServerMsg } from '../types';
import { getWsUrl } from '../api';

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface UseGameSocket {
  status: ConnectionStatus;
  state: GameState | null;
  me: { color: Color | null; isSpectator: boolean };
  lastError: string | null;
  toast: string | null;
  send: (msg: ClientMsg) => void;
  clearToast: () => void;
}

export function useGameSocket(
  roomCode: string,
  playerId: string,
  playerName: string,
): UseGameSocket {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [state, setState] = useState<GameState | null>(null);
  const [me, setMe] = useState<{ color: Color | null; isSpectator: boolean }>({
    color: null,
    isSpectator: false,
  });
  const [lastError, setLastError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const closedByUser = useRef(false);
  const playerIdRef = useRef(playerId);
  const playerNameRef = useRef(playerName);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);
  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  const connect = useCallback(() => {
    if (closedByUser.current) return;
    setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(getWsUrl(roomCode));
    } catch (e) {
      setStatus('error');
      setLastError((e as Error).message);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      ws.send(
        JSON.stringify({
          type: 'join',
          playerId: playerIdRef.current,
          playerName: playerNameRef.current,
        } satisfies ClientMsg),
      );
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data) as ServerMsg;
      } catch {
        return;
      }
      handleServerMsg(msg);
    };

    ws.onclose = () => {
      setStatus('closed');
      if (closedByUser.current) return;
      reconnectTimer.current = window.setTimeout(connect, 1500);
    };

    ws.onerror = () => {
      setStatus('error');
    };
  }, [roomCode]);

  const handleServerMsg = useCallback((msg: ServerMsg) => {
    switch (msg.type) {
      case 'state':
        setState(msg.state);
        setMe({ color: msg.you.color, isSpectator: msg.you.isSpectator });
        break;
      case 'move':
        setState((prev) => {
          if (!prev) return prev;
          const board = prev.board.map((row) => row.slice());
          board[msg.move.y][msg.move.x] = msg.move.color === 'black' ? 1 : 2;
          const moves = [...prev.moves, msg.move];
          if (msg.winLine) {
            return {
              ...prev,
              board,
              moves,
              status: 'finished',
              winner: msg.move.color,
              winLine: msg.winLine,
            };
          }
          return { ...prev, board, moves, currentTurn: msg.nextTurn };
        });
        break;
      case 'gameOver':
        setState((prev) =>
          prev
            ? { ...prev, status: 'finished', winner: msg.winner, winLine: msg.winLine }
            : prev,
        );
        break;
      case 'playerJoined':
        setToast(`${msg.name}（${msg.color === 'black' ? '黑' : '白'}）加入了房间`);
        break;
      case 'playerLeft':
        setToast(`${msg.name}（${msg.color === 'black' ? '黑' : '白'}）离开了`);
        break;
      case 'rematchVote':
        setState((prev) => (prev ? { ...prev, rematchVotes: msg.voters } : prev));
        setToast(`再来一局：${msg.voters.length}/2`);
        break;
      case 'undoRequest':
        setToast(`${msg.from === 'black' ? '黑方' : '白方'}请求悔棋（点击悔棋按钮同意）`);
        break;
      case 'undoApplied':
        setState((prev) => {
          if (!prev) return prev;
          const board = prev.board.map((r) => r.slice());
          for (let y = 0; y < board.length; y++)
            for (let x = 0; x < board[y].length; x++) board[y][x] = 0;
          for (const m of msg.moves) board[m.y][m.x] = m.color === 'black' ? 1 : 2;
          return {
            ...prev,
            board,
            moves: msg.moves,
            currentTurn: msg.currentTurn,
            winLine: null,
          };
        });
        setToast('悔棋成功');
        break;
      case 'undoRejected':
        setToast('对方拒绝了悔棋');
        break;
      case 'error':
        setLastError(msg.message);
        setToast(`错误：${msg.message}`);
        break;
      case 'pong':
        break;
    }
  }, []);

  useEffect(() => {
    closedByUser.current = false;
    connect();
    return () => {
      closedByUser.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' } satisfies ClientMsg));
      }
    }, 25_000);
    return () => window.clearInterval(id);
  }, []);

  const send = useCallback((msg: ClientMsg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  return { status, state, me, lastError, toast, send, clearToast };
}
