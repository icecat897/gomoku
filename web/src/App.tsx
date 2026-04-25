import { useEffect, useState } from 'react';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { getPlayerId, getPlayerName } from './api';

function readRoomFromHash(): string | null {
  const m = location.hash.match(/^#\/r\/([A-Z0-9]{4,8})$/i);
  return m ? m[1].toUpperCase() : null;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const isLocalhost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const showConfigWarning = !API_BASE && !isLocalhost;

if (typeof console !== 'undefined') {
  console.log('[Gomoku] VITE_API_BASE =', API_BASE || '(empty)');
  console.log('[Gomoku] hostname =', location.hostname);
}

export function App() {
  const [room, setRoom] = useState<string | null>(readRoomFromHash());
  const [name, setName] = useState<string>(getPlayerName());
  const playerId = getPlayerId();

  useEffect(() => {
    const onHash = () => setRoom(readRoomFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const enterRoom = (code: string, n: string) => {
    setName(n);
    location.hash = `#/r/${code}`;
    setRoom(code);
  };

  const leaveRoom = () => {
    location.hash = '';
    setRoom(null);
  };

  const banner = showConfigWarning ? (
    <div className="config-banner">
      ⚠️ 未配置 <code>VITE_API_BASE</code> 环境变量，前端无法连接后端。
      请在 Cloudflare Pages 项目的 Settings → Variables and Secrets 添加。
    </div>
  ) : null;

  if (room) {
    return (
      <>
        {banner}
        <GameRoom
          code={room}
          playerId={playerId}
          playerName={name || '匿名'}
          onLeave={leaveRoom}
        />
      </>
    );
  }
  return (
    <>
      {banner}
      <Lobby onEnterRoom={enterRoom} />
    </>
  );
}
