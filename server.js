const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const WORLD = 3000;
const TICK_MS = 1000 / 30;
const ORB_COUNT = 250;
const START_R = 20;
const MAX_NAME = 14;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.send('ok'));

const players = new Map();
let orbs = [];
let orbId = 0;

const rand = (a, b) => a + Math.random() * (b - a);
const hue = () => Math.floor(rand(0, 360));

function newOrb() {
  return { id: orbId++, x: rand(20, WORLD - 20), y: rand(20, WORLD - 20), h: hue() };
}
for (let i = 0; i < ORB_COUNT; i++) orbs.push(newOrb());

function spawn(p) {
  p.x = rand(200, WORLD - 200);
  p.y = rand(200, WORLD - 200);
  p.r = START_R;
  p.score = 0;
  p.alive = true;
}

io.on('connection', (socket) => {
  socket.on('join', (rawName) => {
    const name = String(rawName || 'Gracz').trim().slice(0, MAX_NAME) || 'Gracz';
    const p = { id: socket.id, name, h: hue(), tx: 0, ty: 0, best: 0 };
    spawn(p);
    players.set(socket.id, p);
    socket.emit('init', { id: socket.id, world: WORLD });
  });

  // kierunek ruchu: wektor jednostkowy (lub krotszy = wolniej)
  socket.on('input', (d) => {
    const p = players.get(socket.id);
    if (!p || !d) return;
    let x = Number(d.x), y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.tx = x;
    p.ty = y;
  });

  socket.on('respawn', () => {
    const p = players.get(socket.id);
    if (p && !p.alive) spawn(p);
  });

  socket.on('disconnect', () => players.delete(socket.id));
});

function tick() {
  const list = [...players.values()].filter((p) => p.alive);

  for (const p of list) {
    const speed = 7 * Math.pow(START_R / p.r, 0.35);
    p.x = Math.min(WORLD, Math.max(0, p.x + p.tx * speed));
    p.y = Math.min(WORLD, Math.max(0, p.y + p.ty * speed));

    // zbieranie kulek
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      if (Math.hypot(o.x - p.x, o.y - p.y) < p.r) {
        orbs[i] = newOrb();
        p.r += 0.6;
        p.score += 1;
      }
    }
  }

  // zjadanie graczy: wiekszy pochlania mniejszego (min. 10% wiekszy)
  for (const a of list) {
    for (const b of list) {
      if (a === b || !a.alive || !b.alive) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (a.r > b.r * 1.1 && d < a.r - b.r * 0.4) {
        a.r = Math.sqrt(a.r * a.r + b.r * b.r * 0.8);
        a.score += 10 + b.score;
        b.alive = false;
        b.best = Math.max(b.best, b.score);
        io.to(b.id).emit('dead', { by: a.name, score: b.score });
      }
    }
  }

  // powolne zmniejszanie duzych graczy
  for (const p of list) if (p.alive && p.r > START_R) p.r -= p.r * 0.0002;

  const state = {
    players: list.map((p) => ({
      id: p.id, name: p.name, h: p.h,
      x: Math.round(p.x), y: Math.round(p.y), r: Math.round(p.r * 10) / 10,
      score: p.score,
    })),
    orbs,
    board: [...list].sort((a, b) => b.score - a.score).slice(0, 5)
      .map((p) => ({ name: p.name, score: p.score })),
  };
  io.emit('state', state);
}
setInterval(tick, TICK_MS);

server.listen(PORT, '0.0.0.0', () => console.log(`Gra dziala na porcie ${PORT}`));
