import { useEffect, useMemo, useState } from 'react';
import { Board } from './Board';
import { useGameSocket } from '../hooks/useGameSocket';
import type { Color } from '../types';

interface GameRoomProps {
  code: string;
  playerId: string;
  playerName: string;
  onLeave: () => void;
}

export function GameRoom({ code, playerId, playerName, onLeave }: GameRoomProps) {
  const { status, state, me, toast, send, clearToast, wsUrl, attempts, closeInfo, reconnect } =
    useGameSocket(code, playerId, playerName);
  const [pendingMove, setPendingMove] = useState<{ x: number; y: number } | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  useEffect(() => {
    if (state) return;
    const t = window.setTimeout(() => setShowDiag(true), 4000);
    return () => window.clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(clearToast, 2500);
    return () => window.clearTimeout(t);
  }, [toast, clearToast]);

  useEffect(() => {
    if (state?.status !== 'playing' || state.currentTurn !== me.color) {
      setPendingMove(null);
    }
  }, [state?.status, state?.currentTurn, me.color]);

  const lastMove = state && state.moves.length > 0 ? state.moves[state.moves.length - 1] : null;
  const myTurn =
    !!state && state.status === 'playing' && me.color !== null && state.currentTurn === me.color;
  const opponent = state?.players.find((p) => p.color !== me.color) ?? null;
  const meInfo = state?.players.find((p) => p.color === me.color) ?? null;

  const handleCellTap = (x: number, y: number) => {
    if (!myTurn) return;
    if (state!.board[y][x] !== 0) return;
    if (pendingMove && pendingMove.x === x && pendingMove.y === y) {
      send({ type: 'move', x, y });
      setPendingMove(null);
    } else {
      setPendingMove({ x, y });
    }
  };

  const handleConfirm = () => {
    if (!pendingMove || !myTurn) return;
    send({ type: 'move', x: pendingMove.x, y: pendingMove.y });
    setPendingMove(null);
  };

  const handleCancel = () => setPendingMove(null);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {}
  };

  const shareUrl = useMemo(() => {
    const url = new URL(location.href);
    url.hash = `#/r/${code}`;
    return url.toString();
  }, [code]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {}
  };

  const turnHint = useMemo(() => {
    if (!state) return '连接中…';
    if (status !== 'open') return '正在重新连接…';
    if (state.status === 'waiting') return '等待对手加入…（把房间号发给朋友）';
    if (state.status === 'finished') {
      if (state.winner === 'draw') return '平局';
      const won = state.winner === me.color;
      return won ? '🎉 你赢了' : `${state.winner === 'black' ? '黑方' : '白方'}获胜`;
    }
    if (me.isSpectator) {
      return `${state.currentTurn === 'black' ? '黑方' : '白方'}回合（你是观战）`;
    }
    if (myTurn) return pendingMove ? '点击同一位置或"确认"落子' : '轮到你了，请落子';
    return '等待对手落子…';
  }, [state, status, me, myTurn, pendingMove]);

  if (!state) {
    return (
      <div className="game-loading">
        <div className="loading-card">
          <h2>正在进入房间 {code}</h2>
          <div className={`conn conn-${status}`} style={{ alignSelf: 'center' }}>
            {statusLabel(status)}（尝试 {attempts} 次）
          </div>
          {closeInfo && (
            <div className="diag-line">
              上次断开：code={closeInfo.code} {closeInfo.reason || '(无原因)'}
            </div>
          )}
          {showDiag && (
            <div className="diag">
              <p className="diag-title">连接超过 4 秒未成功，请检查：</p>
              <ol>
                <li>Cloudflare Pages 的 <code>VITE_API_BASE</code> 环境变量是否填了 Worker 地址</li>
                <li>Worker 是否已成功 <code>wrangler deploy</code></li>
                <li>下面这个 URL 在浏览器里打开 <code>/api/health</code> 是否返回 ok：</li>
              </ol>
              <div className="diag-url">{wsUrl}</div>
              <p className="diag-tip">手机端可能是缓存问题，下拉刷新一次或换浏览器试试。</p>
            </div>
          )}
          <div className="loading-actions">
            <button className="btn" onClick={reconnect}>重新连接</button>
            <button className="btn btn-ghost" onClick={onLeave}>返回大厅</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-room">
      <header className="game-header">
        <button className="btn-back" onClick={onLeave} aria-label="返回">←</button>
        <div className="room-code">
          <span className="label">房间</span>
          <strong>{code}</strong>
          <button className="btn-tiny" onClick={copyCode}>复制号</button>
          <button className="btn-tiny" onClick={copyLink}>复制链接</button>
        </div>
        <div className={`conn conn-${status}`}>{statusLabel(status)}</div>
      </header>

      <div className="players">
        <PlayerCard
          label="对手"
          color={opponent?.color ?? (me.color === 'black' ? 'white' : 'black')}
          name={opponent?.name ?? '等待加入…'}
          online={opponent?.online ?? false}
          active={!!opponent && state.status === 'playing' && state.currentTurn === opponent.color}
        />
        <PlayerCard
          label="你"
          color={me.color}
          name={meInfo?.name ?? playerName}
          online={true}
          active={myTurn}
          isMe
        />
      </div>

      <Board
        board={state.board}
        lastMove={lastMove}
        winLine={state.winLine}
        pendingMove={pendingMove}
        myColor={me.color}
        canMove={myTurn}
        onCellTap={handleCellTap}
      />

      <div className="turn-hint">{turnHint}</div>

      <div className="controls">
        {state.status === 'playing' && !me.isSpectator && (
          <>
            <button
              className="btn btn-primary"
              disabled={!pendingMove}
              onClick={handleConfirm}
            >
              确认落子
            </button>
            <button className="btn" disabled={!pendingMove} onClick={handleCancel}>
              取消
            </button>
            <button className="btn btn-ghost" onClick={() => send({ type: 'undo' })}>
              悔棋
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (confirm('确定认输？')) send({ type: 'resign' });
              }}
            >
              认输
            </button>
          </>
        )}
        {state.status === 'finished' && !me.isSpectator && (
          <button
            className="btn btn-primary"
            onClick={() => send({ type: 'rematch' })}
            disabled={state.rematchVotes.includes(playerId)}
          >
            再来一局（{state.rematchVotes.length}/2）
          </button>
        )}
      </div>

      {toast && <div className="toast" onClick={clearToast}>{toast}</div>}
    </div>
  );
}

function PlayerCard({
  label,
  color,
  name,
  online,
  active,
  isMe,
}: {
  label: string;
  color: Color | null;
  name: string;
  online: boolean;
  active: boolean;
  isMe?: boolean;
}) {
  return (
    <div className={`player ${active ? 'active' : ''} ${isMe ? 'me' : ''}`}>
      <div className={`stone-icon stone-${color ?? 'none'}`} />
      <div className="player-info">
        <div className="player-label">{label}</div>
        <div className="player-name">
          {name}
          {!online && <span className="offline">离线</span>}
        </div>
      </div>
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case 'open':
      return '已连接';
    case 'connecting':
      return '连接中';
    case 'closed':
      return '断开';
    default:
      return '错误';
  }
}
