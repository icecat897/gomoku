import { GameRoom } from './room';
export { GameRoom };

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (url.pathname === '/api/room/create' && request.method === 'POST') {
      const code = generateRoomCode();
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      await stub.fetch(`https://do/init?code=${code}`);
      return new Response(JSON.stringify({ code }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const wsMatch = url.pathname.match(/^\/api\/room\/([A-Z0-9]+)\/ws$/);
    if (wsMatch) {
      const code = wsMatch[1];
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(origin) });
  },
};
