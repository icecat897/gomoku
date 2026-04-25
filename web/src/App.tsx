import { useEffect, useState } from 'react';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { getPlayerId, getPlayerName } from './api';

function readRoomFromHash(): string | null {
  const m = location.hash.match(/^#\/r\/([A-Z0-9]{4,8})$/i);
  return m ? m[1].toUpperCase() : null;
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

  if (room) {
    return (
      <GameRoom
        code={room}
        playerId={playerId}
        playerName={name || '匿名'}
        onLeave={leaveRoom}
      />
    );
  }
  return <Lobby onEnterRoom={enterRoom} />;
}
