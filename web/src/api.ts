const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export async function createRoom(): Promise<string> {
  const url = `${API_BASE}/api/room/create`;
  console.log('[api] createRoom POST', url);
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`创建房间失败 (HTTP ${res.status})`);
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

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getPlayerId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(PLAYER_ID_KEY);
  } catch {}
  if (!id) {
    id = makeId();
    try {
      localStorage.setItem(PLAYER_ID_KEY, id);
    } catch {}
  }
  return id;
}

export function getPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setPlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {}
}
