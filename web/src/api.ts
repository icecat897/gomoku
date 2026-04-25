const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export async function createRoom(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/room/create`, { method: 'POST' });
  if (!res.ok) throw new Error('创建房间失败');
  const data = (await res.json()) as { code: string };
  return data.code;
}

export function getWsUrl(roomCode: string): string {
  if (API_BASE) {
    const u = new URL(API_BASE);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = `/api/room/${roomCode}/ws`;
    return u.toString();
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/room/${roomCode}/ws`;
}

const PLAYER_ID_KEY = 'gomoku_player_id';
const PLAYER_NAME_KEY = 'gomoku_player_name';

export function getPlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function getPlayerName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
}

export function setPlayerName(name: string): void {
  localStorage.setItem(PLAYER_NAME_KEY, name);
}
