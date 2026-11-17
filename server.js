const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MAX_PER_ROOM = 16;
const SEND_MS = 1000 / 15;

app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.send('ok'));

const players = new Map(); // socket.id -> stan gracza

const num = (v, lim = 100000) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);

io.on('connection', (socket) => {
  socket.on('join', (d) => {
    d = d || {};
    const room = String(d.room || 'glowny').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'glowny';
    const inRoom = [...players.values()].filter((p) => p.room === room).length;
    if (inRoom >= MAX_PER_ROOM) { socket.emit('full'); return; }
    const name = String(d.name || 'Gracz').trim().slice(0, 14) || 'Gracz';
    const hue = Math.floor(num(d.hue, 360)) % 360;
    socket.join(room);
    players.set(socket.id, { id: socket.id, room, name, hue, x: 0, y: 0, z: 0, yaw: 0, sp: 0, sec: 0, h: 0 });
    socket.emit('joined', { id: socket.id, room });
  });

  socket.on('pos', (s) => {
    const p = players.get(socket.id);
    if (!p || !s) return;
    p.x = num(s.x); p.y = num(s.y); p.z = num(s.z);
    p.yaw = num(s.yaw, 10); p.sp = num(s.sp, 50);
    p.sec = Math.floor(num(s.sec, 100)); p.h = num(s.h, 10000);
  });

  socket.on('disconnect', () => players.delete(socket.id));
});

setInterval(() => {
  const rooms = new Map();
  for (const p of players.values()) {
    if (!rooms.has(p.room)) rooms.set(p.room, []);
    rooms.get(p.room).push({
      id: p.id, name: p.name, hue: p.hue,
      x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
      yaw: +p.yaw.toFixed(2), sp: +p.sp.toFixed(1), sec: p.sec, h: +p.h.toFixed(1),
    });
  }
  for (const [room, list] of rooms) io.to(room).emit('players', list);
}, SEND_MS);

require('./chatserver')(app, io).catch((e) => console.error('[chat] blad startu', e)).finally(() => {
  server.listen(PORT, '0.0.0.0', () => console.log(`Serwer dziala na porcie ${PORT}`));
});
