const socket = io();
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const deadBox = document.getElementById('dead');

let myId = null, world = 3000, state = null, playing = false;
let mouse = { x: 0, y: 0 };

function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener('resize', resize);
resize();

function play() {
  const name = document.getElementById('name').value;
  socket.emit('join', name);
  menu.classList.add('hidden');
  playing = true;
}
document.getElementById('play').onclick = play;
document.getElementById('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });
document.getElementById('again').onclick = () => {
  socket.emit('respawn');
  deadBox.classList.add('hidden');
  playing = true;
};

socket.on('init', (d) => { myId = d.id; world = d.world; });
socket.on('state', (s) => { state = s; });
socket.on('dead', (d) => {
  playing = false;
  document.getElementById('deadInfo').textContent = `Zjadł Cię: ${d.by}. Twój wynik: ${d.score}`;
  deadBox.classList.remove('hidden');
});

function setMouse(x, y) { mouse.x = x; mouse.y = y; }
addEventListener('mousemove', (e) => setMouse(e.clientX, e.clientY));
addEventListener('touchmove', (e) => { const t = e.touches[0]; setMouse(t.clientX, t.clientY); }, { passive: true });
addEventListener('touchstart', (e) => { const t = e.touches[0]; setMouse(t.clientX, t.clientY); }, { passive: true });

// wysylanie kierunku ruchu 30x/s
setInterval(() => {
  if (!playing) return;
  const dx = mouse.x - canvas.width / 2;
  const dy = mouse.y - canvas.height / 2;
  const dist = Math.hypot(dx, dy);
  const k = Math.min(1, dist / 80); // blisko srodka = wolniej
  socket.emit('input', dist > 1 ? { x: (dx / dist) * k, y: (dy / dist) * k } : { x: 0, y: 0 });
}, 33);

function draw() {
  requestAnimationFrame(draw);
  ctx.fillStyle = '#0f1220';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state) return;

  const me = state.players.find((p) => p.id === myId);
  const cx = me ? me.x : world / 2;
  const cy = me ? me.y : world / 2;
  const scale = me ? Math.max(0.5, 1.4 - me.r / 120) : 0.5;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  // siatka
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= world; i += 100) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, world); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(world, i); ctx.stroke();
  }
  ctx.strokeStyle = '#ff5c5c';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, world, world);

  for (const o of state.orbs) {
    ctx.fillStyle = `hsl(${o.h} 90% 60%)`;
    ctx.beginPath(); ctx.arc(o.x, o.y, 8, 0, Math.PI * 2); ctx.fill();
  }

  for (const p of [...state.players].sort((a, b) => a.r - b.r)) {
    ctx.fillStyle = `hsl(${p.h} 70% 55%)`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = p.id === myId ? '#fff' : `hsl(${p.h} 70% 35%)`;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(12, p.r * 0.5)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name, p.x, p.y);
  }
  ctx.restore();

  document.getElementById('score').textContent = 'Wynik: ' + (me ? me.score : 0);
  document.getElementById('board').innerHTML = state.board
    .map((b, i) => `${i + 1}. ${b.name.replace(/</g, '&lt;')} — ${b.score}`).join('<br>');
}
draw();
