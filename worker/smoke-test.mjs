// quick smoke test for two players + a winning sequence
import WebSocket from 'ws';

const url = (code) => `ws://127.0.0.1:8787/api/room/${code}/ws`;

async function createRoom() {
  const r = await fetch('http://127.0.0.1:8787/api/room/create', { method: 'POST' });
  return (await r.json()).code;
}

function open(code, playerId, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url(code));
    const log = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', playerId, playerName: name }));
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      log.push(m);
      if (m.type === 'state' && m.you) {
        resolve({ ws, you: m.you, state: m.state, log });
      }
    });
    ws.on('error', reject);
  });
}

function next(ws, predicate) {
  return new Promise((resolve) => {
    const fn = (raw) => {
      const m = JSON.parse(raw.toString());
      if (predicate(m)) {
        ws.off('message', fn);
        resolve(m);
      }
    };
    ws.on('message', fn);
  });
}

(async () => {
  const code = await createRoom();
  console.log('room:', code);

  const a = await open(code, 'pa', 'Alice');
  const b = await open(code, 'pb', 'Bob');
  console.log('A color:', a.you.color, 'B color:', b.you.color);

  // wait for both clients to see status=playing
  await new Promise((r) => setTimeout(r, 200));

  // Black plays a 5-in-a-row on row 7: x = 0..4
  const black = a.you.color === 'black' ? a.ws : b.ws;
  const white = a.you.color === 'black' ? b.ws : a.ws;

  for (let i = 0; i < 5; i++) {
    const winPromise = i === 4 ? next(black, (m) => m.type === 'gameOver') : null;
    black.send(JSON.stringify({ type: 'move', x: i, y: 7 }));
    await new Promise((r) => setTimeout(r, 60));
    if (i < 4) {
      white.send(JSON.stringify({ type: 'move', x: i, y: 8 }));
      await new Promise((r) => setTimeout(r, 60));
    } else {
      const result = await winPromise;
      console.log('gameOver:', result);
    }
  }

  a.ws.close();
  b.ws.close();
  console.log('SMOKE TEST PASSED ✓');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
