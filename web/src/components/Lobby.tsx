import { useState } from 'react';
import { createRoom, getPlayerName, setPlayerName } from '../api';

interface LobbyProps {
  onEnterRoom: (code: string, name: string) => void;
}

export function Lobby({ onEnterRoom }: LobbyProps) {
  const [name, setName] = useState(getPlayerName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalName = (name.trim() || '匿名').slice(0, 16);

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      setPlayerName(finalName);
      const c = await createRoom();
      onEnterRoom(c, finalName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = () => {
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(trimmed)) {
      setError('房间号格式不对，应为 4-8 位字母或数字');
      return;
    }
    setPlayerName(finalName);
    onEnterRoom(trimmed, finalName);
  };

  return (
    <div className="lobby">
      <h1 className="title">联机五子棋</h1>
      <p className="subtitle">和朋友输入同一个房间号即可对战</p>

      <div className="card">
        <label className="field">
          <span>你的昵称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="匿名"
            maxLength={16}
          />
        </label>

        <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
          {busy ? '创建中…' : '创建房间'}
        </button>

        <div className="divider"><span>或</span></div>

        <label className="field">
          <span>输入房间号加入</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDE"
            maxLength={8}
            inputMode="text"
            autoCapitalize="characters"
          />
        </label>

        <button className="btn" onClick={handleJoin} disabled={busy || !code.trim()}>
          加入房间
        </button>

        {error && <div className="error">{error}</div>}
      </div>

      <p className="footnote">部署在 Cloudflare · 仅好友间通过房间号对战</p>
    </div>
  );
}
