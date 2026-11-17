import * as L from './logic.js';
// Lekka wersja 2D (Canvas) - dla slabych serwerow / Raspberry Pi. Ten sam HUD i logika co wersja 3D.
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const rnd = L.mulberry32(777);
let map = null, S = null, HUD = null, cfg = { voteSeconds: 8 }, skew = 0;
let queue = [], curAnim = null, shake = 0, flashAmt = 0, flashCol = '#f00';
const FPS_CAP = +params.get('fps') || 24;

// ---------- canvas ----------
const cv = $('gl'); const RW = +params.get('w') || 960, RH = Math.round(RW * 9 / 16);
cv.width = RW; cv.height = RH;
const ctx = cv.getContext('2d', { alpha: false });
const SP = RW / 20, HY = RW / 75, CX = RW / 2, CY = RH * 0.6;
const cam = { x: 0, y: 0, z: 0, init: false };
const runner = { x: 0, y: 0, z: 0, face: 0, vis: 1, scale: 1 };
const parts = [];

// ---------- audio (proste beepy) ----------
let AC = null;
addEventListener('pointerdown', () => { if (!AC) try { AC = new AudioContext(); } catch (e) { /* brak */ } });
function beep(f, d = 0.1, type = 'square', vol = 0.04, slide = 0) {
  if (!AC || params.has('mute')) return;
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, AC.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), AC.currentTime + d);
  g.gain.setValueAtTime(vol, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d);
  o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + d + 0.02);
}
const sfx = { hop: () => beep(520, 0.09, 'square', 0.04, 220), deny: () => beep(110, 0.14, 'sawtooth'), fall: () => beep(600, 0.7, 'sawtooth', 0.06, -520), shock: () => beep(90, 0.4, 'sawtooth', 0.09), event: () => beep(330, 0.4, 'square', 0.06), good: () => beep(784, 0.25, 'triangle', 0.07), rewind: () => beep(900, 0.8, 'sawtooth', 0.05, -800) };

// ---------- kolory ----------
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const css = (c, k = 1, a = 1) => `rgba(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0},${a})`;
const ZRGB = L.ZONES.map((z) => rgb(z.color));
const C = { cp: rgb('#39ff88'), fin: rgb('#ffe600'), blink: rgb('#00e5ff'), laser: rgb('#ff9a1f'), shock: rgb('#ff1744'), crumble: rgb('#d98a4a'), conv: rgb('#b26bff'), bonus: rgb('#ffe600') };

// ---------- tlo (rysowane raz) ----------
let layers = [];
function buildBackground() {
  layers = [];
  const cfgL = [{ k: 0.06, h: 0.55, col: '#0d0a24', win: 0.18 }, { k: 0.14, h: 0.7, col: '#120d30', win: 0.3 }, { k: 0.3, h: 0.9, col: '#18123d', win: 0.45 }];
  cfgL.forEach((l, li) => {
    const c = document.createElement('canvas'); c.width = RW * 2; c.height = RH * 1.4; const g = c.getContext('2d');
    let x = 0; const wcols = ['#ffe9a8', '#7cf7ff', '#ff7be9'];
    while (x < c.width) {
      const w = 30 + rnd() * 70, h = c.height * (0.25 + rnd() * l.h * 0.75);
      g.fillStyle = l.col; g.fillRect(x, c.height - h, w, h);
      g.fillStyle = css(rgb(['#ff2bd6', '#00e5ff', '#9a7bff'][(rnd() * 3) | 0]), 0.5, 0.5); g.fillRect(x, c.height - h, w, 2);
      for (let wy = c.height - h + 8; wy < c.height - 4; wy += 9) for (let wx = x + 5; wx < x + w - 5; wx += 8) {
        if (rnd() < l.win) { g.fillStyle = wcols[(rnd() * 3) | 0]; g.globalAlpha = 0.25 + rnd() * 0.5; g.fillRect(wx, wy, 3, 4); }
      }
      g.globalAlpha = 1;
      if (rnd() < 0.18) { g.fillStyle = css(rgb(['#ff2bd6', '#00e5ff', '#ffe600'][(rnd() * 3) | 0]), 1, 0.9); g.fillRect(x + w * 0.2, c.height - h * (0.4 + rnd() * 0.4), w * 0.6, 6); }
      x += w + 2 + rnd() * 10;
    }
    layers.push(Object.assign({ c }, l));
  });
}
const rain = Array.from({ length: 90 }, () => ({ x: rnd() * RW, y: rnd() * RH, s: 9 + rnd() * 8 }));
const cars = Array.from({ length: 7 }, (_, i) => ({ y: rnd() * RH * 0.5, x: rnd() * RW, v: (40 + rnd() * 90) * (i % 2 ? 1 : -1), col: ['#ff2bd6', '#00e5ff', '#ffe600'][i % 3] }));

function drawBackground(dt, time) {
  const z = ZRGB[tmpScene.zoneIdx || 0];
  const g = ctx.createLinearGradient(0, 0, 0, RH); g.addColorStop(0, css(z, 0.16)); g.addColorStop(1, '#06040f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, RW, RH);
  for (const l of layers) {
    const ox = -(((cam.x * SP * l.k + cam.z * SP * l.k * 0.4) % RW) + RW) % RW;
    const oy = RH * 0.45 + cam.y * HY * l.k * 4 - l.c.height + RH * 0.5;
    ctx.globalAlpha = 0.9; ctx.drawImage(l.c, ox, oy); ctx.drawImage(l.c, ox + RW, oy);
  }
  ctx.globalAlpha = 1;
  // samochody
  ctx.globalCompositeOperation = 'lighter';
  for (const c of cars) { c.x += c.v * dt; if (c.x > RW + 40) c.x = -40; if (c.x < -40) c.x = RW + 40; ctx.fillStyle = c.col; ctx.globalAlpha = 0.8; ctx.fillRect(c.x, c.y, 16, 2); ctx.globalAlpha = 0.25; ctx.fillRect(c.x - (c.v > 0 ? 16 : -16), c.y, 16, 2); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawRain(dt) {
  ctx.strokeStyle = 'rgba(140,210,255,0.28)'; ctx.lineWidth = 1; ctx.beginPath();
  for (const r of rain) { r.y += 520 * dt; r.x -= 40 * dt; if (r.y > RH) { r.y = -10; r.x = rnd() * RW + 40; } ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - 2, r.y - r.s); }
  ctx.stroke();
}

// ---------- kratki ----------
const sx = (x) => CX + (x - cam.x) * SP;
const sy = (z, y) => CY + (z - cam.z) * SP - (y - cam.y) * HY;
function tileStyle(id, time) {
  const t = map.tiles[id]; const st = S;
  const mode = L.tileMode(map, st, id, st.tick + 1), mode2 = L.tileMode(map, st, id, st.tick + 2);
  const zc = ZRGB[map.platforms[t.p].zone]; const fl = 0.6 + 0.4 * Math.sin(time * 16 + id);
  let c = zc, k = 0.55, body = true, edge = zc;
  switch (t.t) {
    case 'checkpoint': c = C.cp; k = 1.1; break;
    case 'finish': c = C.fin; k = 1.2; break;
    case 'blink': c = C.blink; if (mode === 'ok') k = mode2 === 'ok' ? 0.95 : 0.4 + fl * 0.5; else { k = 0.1; body = false; } break;
    case 'laser': if (mode === 'shock') { c = C.shock; k = 1.3; } else { c = C.laser; k = mode2 === 'shock' ? 0.5 + fl * 0.4 : 0.7; } break;
    case 'crumble': c = C.crumble; if (mode === 'void') { k = 0.08; body = false; } else k = st.crumbleAt[id] !== undefined ? 0.4 + fl * 0.5 : 0.75; break;
    case 'conveyor': c = C.conv; k = 0.95; break;
    case 'glitch': c = rgb('#ff2bd6'); k = 0.7 + fl * 0.5; if (((time * 8 + id) | 0) % 2) c = rgb('#00e5ff'); break;
    case 'shock': c = C.shock; k = 0.7 + fl * 0.6; break;
    case 'bonus': c = C.bonus; k = 0.7; break;
  }
  if (mode === 'shock' && t.t !== 'laser' && t.t !== 'shock') { c = C.shock; k = 0.7 + fl * 0.6; }
  return { c, k, body, edge: c };
}
let visible = [];
function drawTiles(time) {
  const cur = map.tiles[S.pos].p; const a = Math.max(0, cur - 7), b = Math.min(map.platforms.length - 1, cur + 13);
  visible.length = 0;
  for (let p = a; p <= b; p++) for (const id of map.platforms[p].tiles) {
    const t = map.tiles[id]; const dy = t.y - cam.y; if (Math.abs(dy) > 8) continue;
    const px = sx(t.x), py = sy(t.z, t.y); if (px < -SP || px > RW + SP || py < -SP || py > RH + SP * 2) continue;
    visible.push({ id, t, px, py, dy });
  }
  visible.sort((u, v) => u.t.y - v.t.y || u.t.z - v.t.z);
  const half = SP / 2 - 2, side = Math.max(5, HY * 0.9);
  for (const v of visible) {
    const st = tileStyle(v.id, time); const far = Math.abs(v.dy) > 3 ? 0.35 : 1;
    ctx.globalAlpha = far;
    if (st.body) { ctx.fillStyle = css(st.c, 0.16); ctx.fillRect(v.px - half, v.py + half, half * 2, side); }
    ctx.fillStyle = css(st.c, st.k * 0.55 + 0.05); ctx.fillRect(v.px - half, v.py - half, half * 2, half * 2);
    ctx.fillStyle = css(st.c, st.k, 0.9); ctx.fillRect(v.px - half + 4, v.py - half + 4, half * 2 - 8, half * 2 - 8);
    v.st = st;
  }
  // poswiata krawedzi (jedna przejscie additive)
  ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2;
  for (const v of visible) { if (!v.st.body && v.t.t !== 'blink') continue; ctx.globalAlpha = (Math.abs(v.dy) > 3 ? 0.12 : 0.45) * Math.min(1, v.st.k + 0.3); ctx.strokeStyle = css(v.st.c, 1.4); ctx.strokeRect(v.px - half, v.py - half, half * 2, half * 2); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  // oznaczenia: przenosnik, bonus, checkpoint, meta
  for (const v of visible) {
    if (Math.abs(v.dy) > 3) continue; const t = v.t;
    if (t.t === 'conveyor') { const p = map.platforms[t.p]; const i = p.route.indexOf(v.id); const n = map.tiles[p.route[i + 1]]; const ang = Math.atan2(n.z - t.z, n.x - t.x); ctx.save(); ctx.translate(v.px, v.py); ctx.rotate(ang); ctx.fillStyle = '#e6c8ff'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.fill(); ctx.restore(); }
    else if (t.t === 'bonus' && !S.bonusTaken[v.id]) { const bob = Math.sin(time * 3) * 2; ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.moveTo(v.px, v.py - 8 + bob); ctx.lineTo(v.px + 6, v.py + bob); ctx.lineTo(v.px, v.py + 8 + bob); ctx.lineTo(v.px - 6, v.py + bob); ctx.fill(); }
    else if (t.t === 'checkpoint' || t.t === 'finish') { ctx.strokeStyle = t.t === 'finish' ? '#ffe600' : '#39ff88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(v.px, v.py - 4, 12, 7 + Math.sin(time * 4) * 1.5, 0, 0, 7); ctx.stroke(); }
  }
}

// ---------- robot ----------
function drawRunner(time) {
  if (runner.vis < 0.05) return;
  const px = sx(runner.x), baseY = sy(runner.z, runner.y); const s = SP / 56 * runner.scale;
  const idle = curAnim ? 0 : Math.sin(time * 3) * 1.2;
  ctx.globalAlpha = Math.min(1, runner.vis * (runner.vis > 0.99 ? 1 : 0.6 + Math.random() * 0.4));
  const gy = sy(runner.z, runner.y0 !== undefined ? runner.y0 : runner.y);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(px, gy + 2, 13 * s, 5 * s, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(px, baseY - idle); ctx.scale(s, s);
  ctx.fillStyle = '#23204a'; ctx.fillRect(-8, -14, 6, 14); ctx.fillRect(2, -14, 6, 14);      // nogi
  ctx.fillStyle = '#2f2b66'; ctx.fillRect(-12, -38, 24, 26);                                   // tulow
  ctx.fillStyle = '#ff2bd6'; ctx.fillRect(-9, -30, 18, 4);                                     // pas
  ctx.fillStyle = '#2f2b66'; ctx.fillRect(-10, -58, 20, 18);                                   // glowa
  ctx.fillStyle = '#00e5ff'; ctx.fillRect(-8, -52, 16, 5);                                     // wizjer
  ctx.fillStyle = '#ff2bd6'; ctx.fillRect(5, -66, 2, 8); ctx.fillRect(4, -69, 4, 4);          // antena
  if (S.shield > 0) { ctx.strokeStyle = 'rgba(57,255,136,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -32, 36, 0, 7); ctx.stroke(); }
  ctx.restore(); ctx.globalAlpha = 1;
  // poswiata
  ctx.globalCompositeOperation = 'lighter'; const gr = ctx.createRadialGradient(px, baseY - 20, 2, px, baseY - 20, 60 * s); gr.addColorStop(0, 'rgba(0,229,255,0.22)'); gr.addColorStop(1, 'rgba(0,229,255,0)'); ctx.fillStyle = gr; ctx.fillRect(px - 70, baseY - 90, 140, 140); ctx.globalCompositeOperation = 'source-over';
}

// ---------- czasteczki ----------
function burst(p, color, n = 20, spd = 4) { const c = rgb(color); for (let i = 0; i < n && parts.length < 160; i++) parts.push({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * spd, vz: (Math.random() - 0.5) * spd * 0.6, vy: Math.random() * spd, life: 0.7, col: c }); }
function drawParts(dt) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy -= 7 * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; ctx.fillStyle = css(p.col, 1.2, Math.min(1, p.life * 2)); ctx.fillRect(sx(p.x), sy(p.z, p.y), 3, 3); }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- animacje ruchu ----------
const tilePos = (id) => { const t = map.tiles[id]; return { x: t.x, y: t.y, z: t.z }; };
const lerp3 = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });
const setRun = (p) => { runner.x = p.x; runner.y = p.y; runner.z = p.z; };
function flashFx(col, a) { flashCol = col; flashAmt = Math.max(flashAmt, a); }
function enqueue(steps) { for (const s of steps) queue.push(Object.assign({ dur: 0 }, s)); }
function startAnim(s, now) {
  curAnim = { s, t0: now }; runner.y0 = undefined;
  switch (s.k) {
    case 'move': s.dur = 0.34; s.a = tilePos(s.from); s.b = tilePos(s.to); sfx.hop(); break;
    case 'slide': s.dur = 0.26; s.a = tilePos(s.from); s.b = tilePos(s.to); burst(s.a, '#b26bff', 8, 3); break;
    case 'blocked': { s.dur = 0.22; s.a = { x: runner.x, y: runner.y, z: runner.z }; const d = L.DIRS[s.dir]; s.b = { x: d[0], z: d[1] }; sfx.deny(); break; }
    case 'wait': s.dur = 0.05; break;
    case 'glitch': s.dur = 0.25; burst(runner, '#ff2bd6', 20, 5); break;
    case 'bonus': s.dur = 0.3; burst(runner, '#ffe600', 30, 5); sfx.good(); break;
    case 'cp': s.dur = 0.4; burst(runner, '#39ff88', 40, 6); sfx.good(); break;
    case 'win': s.dur = 0.2; break;
    case 'fall': s.dur = 0.8; s.a = tilePos(s.from); s.b = tilePos(s.to); sfx.fall(); break;
    case 'bounce': s.dur = 0.3; s.a = tilePos(s.from); s.b = tilePos(s.to); flashFx('#39ff88', 0.35); sfx.good(); break;
    case 'rewind': s.dur = 1.0; s.a = tilePos(s.from); s.b = tilePos(s.to); if (s.shock) { flashFx('#ff1744', 0.7); shake = 0.9; sfx.shock(); burst(runner, '#ff1744', 40, 7); } sfx.rewind(); break;
    case 'teleport': s.dur = 0.9; s.a = tilePos(s.from); s.b = tilePos(s.to); flashFx('#ffe600', 0.6); sfx.good(); break;
    default: s.dur = 0;
  }
}
function stepAnim(now) {
  if (!curAnim) { const s = queue.shift(); if (!s) return; startAnim(s, now); }
  const { s, t0 } = curAnim; const u = s.dur > 0 ? Math.min(1, (now - t0) / s.dur) : 1;
  switch (s.k) {
    case 'move': { const p = lerp3(s.a, s.b, u); runner.y0 = p.y; setRun(p); runner.y += Math.sin(Math.PI * u) * 0.9; runner.scale = 1 + 0.12 * Math.sin(Math.PI * u); break; }
    case 'slide': setRun(lerp3(s.a, s.b, u)); break;
    case 'blocked': runner.x = s.a.x + s.b.x * Math.sin(Math.PI * u) * 0.25; runner.z = s.a.z + s.b.z * Math.sin(Math.PI * u) * 0.25; break;
    case 'fall': if (u < 0.55) { const v = u / 0.55; setRun(s.a); if (s.dir) { const d = L.DIRS[s.dir]; const o = Math.min(1, v * 2.2) * 0.9; runner.x += d[0] * o; runner.z += d[1] * o; } runner.y -= v * v * 8; runner.vis = 1 - v; } else { const v = (u - 0.55) / 0.45; setRun(s.b); runner.vis = v; } break;
    case 'bounce': { const p = lerp3(s.a, s.b, u); runner.y0 = p.y; setRun(p); runner.y += Math.sin(Math.PI * u); break; }
    case 'rewind': { const e = u * u * (3 - 2 * u); const p = lerp3(s.a, s.b, e); runner.y0 = p.y; setRun(p); runner.y += Math.sin(Math.PI * e) * 1.5; runner.vis = 0.5 + 0.5 * Math.sin(u * 40); break; }
    case 'teleport': { const e = u * u * (3 - 2 * u); const p = lerp3(s.a, s.b, e); runner.y0 = p.y; setRun(p); runner.y += Math.sin(Math.PI * e) * 3; break; }
  }
  if (u >= 1) {
    if (s.b && s.b.y !== undefined && s.k !== 'blocked') { setRun(s.b); runner.vis = 1; runner.scale = 1; runner.y0 = undefined; }
    if (s.k === 'fall') burst(runner, '#00e5ff', 25, 5);
    if (s.k === 'win') burst(runner, '#ffe600', 80, 9);
    runner.scale = 1; curAnim = null;
  }
}

// ---------- HUD ----------
const CEN = { gora: 'up', dol: 'down', lewo: 'left', prawo: 'right', czekaj: 'wait' };
const CMDS = ['gora', 'dol', 'lewo', 'prawo', 'czekaj'];
const CNAMES = { gora: '▲ !up', dol: '▼ !down', lewo: '◀ !left', prawo: '▶ !right', czekaj: '■ !wait' };
const vrows = {};
CMDS.forEach((c) => {
  const row = document.createElement('div'); row.className = 'vrow';
  row.innerHTML = `<span class="k">${CNAMES[c]}</span><span class="b"><i></i></span><span class="n">0</span>`;
  row.onclick = () => sendVote(c); $('vrows').appendChild(row);
  vrows[c] = { bar: row.querySelector('i'), n: row.querySelector('.n') };
});
const nick = (() => { try { let n = localStorage.getItem('nick'); if (!n) { n = 'widz-' + Math.floor(Math.random() * 9000 + 1000); localStorage.setItem('nick', n); } return n; } catch (e) { return 'widz-' + Math.floor(Math.random() * 9000 + 1000); } })();
let socket = null;
function sendVote(c) { if (socket && cfg.webVote) socket.emit('vote', { name: nick, cmd: c }); }
addEventListener('keydown', (e) => {
  const m = { ArrowUp: 'gora', ArrowDown: 'dol', ArrowLeft: 'lewo', ArrowRight: 'prawo', ' ': 'czekaj' }[e.key];
  if (m) { e.preventDefault(); sendVote(m); }
});

function setVotes(counts) {
  const tot = Math.max(1, Object.values(counts).reduce((a, b) => a + b, 0));
  $('tn').textContent = Object.values(counts).reduce((a, b) => a + b, 0) + ' votes';
  CMDS.forEach((c) => { vrows[c].bar.style.width = (100 * counts[c] / tot) + '%'; vrows[c].n.textContent = counts[c]; });
}
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function applyHud(h) {
  if (!h) return; HUD = h; skew = h.now - Date.now();
  $('top').innerHTML = '<b style="color:#ff2bd6">TOP VOTERS</b><br>' + (h.top.length ? h.top.map((t, i) => `${i + 1}. ${esc(t[0])} <span style="color:#00e5ff">${t[1]}</span>`).join('<br>') : '—') + `<br><span style="color:#6f8aa8">wins: ${h.wins} • runs: ${h.runs}</span>`;
  $('feed').innerHTML = h.feed.slice().reverse().map((f) => `<span style="color:#00e5ff">${esc(f.u)}</span> → ${CEN[f.c]||f.c}`).join('<br>');
}
function applyState(st) {
  S = st; if (!map) return;
  const t = map.tiles[st.pos]; const z = L.ZONES[map.platforms[t.p].zone];
  $('zone').textContent = z.name.toUpperCase(); $('zone').style.color = z.color;
  const cur = st.routeNow >= 0 ? st.routeNow : st.maxRoute;
  $('prog').style.width = (100 * cur / (st.routeLen - 1)) + '%';
  $('stats').innerHTML = `Height: <b>${(t.y + 1) * 3} m</b> • Progress: <b>${cur}/${st.routeLen - 1}</b><br>Moves: ${st.moves} • Falls: ${st.falls} • Setbacks: ${st.setbacks}`;
  let sh = '';
  for (let i = 0; i < 3; i++) sh += `<span style="color:${i < st.shield ? '#39ff88' : '#2a2a44'}">◆</span> `;
  if (st.blackout > 0) sh += `<br><span style="color:#ff2bd6">BLACKOUT: controls reversed (${st.blackout})</span>`;
  if (st.chaos > 0) sh += `<br><span style="color:#ff9a1f">DATA STORM (${st.chaos})</span>`;
  if (st.glitch) sh += `<br><span style="color:#ff2bd6">GLITCH: next move is random!</span>`;
  $('shield').innerHTML = 'SHIELDS: ' + sh;
  tmpScene.zone = z; tmpScene.zoneIdx = map.platforms[t.p].zone;
}
const tmpScene = { zone: L.ZONES[0] };

let bannerT = 0;
function banner(title, desc, color) {
  $('bt').textContent = title; $('bt').style.color = color || '#ff2bd6'; $('bd').textContent = desc || '';
  const b = $('banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); bannerT = 3.4;
}
const EV_COL = { cofniecie: '#ff1744', jackpot: '#ffe600', blackout: '#ff2bd6', burza: '#ff9a1f', zamrozenie: '#9fe8ff', tarcza: '#39ff88', sabotaz: '#ff1744' };
function setWin(on, h) {
  $('win').style.display = on ? 'flex' : 'none';
  if (on && S) { $('wstat').textContent = `Moves: ${S.moves} • Falls: ${S.falls} • Setbacks: ${S.setbacks} • Events: ${S.events}`; }
}
let resetAt = 0;

// ---------- socket ----------
function connect() {
  socket = io('/chat');
  socket.on('connect', () => { $('conn').textContent = 'connected'; });
  socket.on('disconnect', () => { $('conn').textContent = 'disconnected — retrying…'; });
  socket.on('init', (d) => {
    document.body.classList.toggle('noweb', !d.cfg.webVote);
    map = L.buildIndex(d.map); cfg = d.cfg; S = d.state; queue = []; curAnim = null;
    applyState(d.state); applyHud(d.hud); const p = tilePos(S.pos); setRun(p); runner.vis = 1; runner.scale = 1; cam.init = false; setWin(S.won);
    if (!window.__started) { window.__started = true; buildBackground(); requestAnimationFrame(frame); }
  });
  socket.on('window', (d) => { applyState(d.state); applyHud(d.hud); setVotes({ gora: 0, dol: 0, lewo: 0, prawo: 0, czekaj: 0 }); });
  socket.on('votes', (d) => setVotes(d.counts));
  socket.on('tick', (d) => { setVotes(d.counts); enqueue(d.steps); applyState(d.state); applyHud(d.hud); });
  socket.on('event', (d) => {
    applyState(d.state); applyHud(d.hud); enqueue(d.steps);
    banner(d.info.title, d.info.desc + (d.info.n ? ` (${d.info.n})` : ''), EV_COL[d.info.type]);
    sfx.event(); flashFx(EV_COL[d.info.type] || '#f0f', 0.5); shake = 0.6;
  });
  socket.on('won', (d) => { applyState(d.state); applyHud(d.hud); resetAt = performance.now() + d.resetIn * 1000; setTimeout(() => setWin(true), 1200); sfx.good(); });
}

// ---------- minimapa ----------
const mini = $('mini').getContext('2d');
function drawMini(time) {
  if (!map || !S) return; const W = 190, R = 10, cell = W / (R * 2 + 1);
  const me = map.tiles[S.pos]; mini.clearRect(0, 0, W, W);
  const a = Math.max(0, map.tiles[S.pos].p - 5), b = Math.min(map.platforms.length - 1, map.tiles[S.pos].p + 8);
  for (let p = a; p <= b; p++) for (const id of map.platforms[p].tiles) {
    const t = map.tiles[id]; const dx = t.x - me.x, dz = t.z - me.z; if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
    const dy = t.y - me.y; const mode = L.tileMode(map, S, id, S.tick + 1);
    let col = '#' + L.ZONES[map.platforms[t.p].zone].color.slice(1);
    if (t.t === 'checkpoint') col = '#39ff88'; else if (t.t === 'finish') col = '#ffe600'; else if (t.t === 'shock' || mode === 'shock') col = '#ff1744';
    else if (t.t === 'blink') col = mode === 'ok' ? '#00e5ff' : '#123'; else if (t.t === 'laser') col = '#ff9a1f'; else if (t.t === 'crumble') col = mode === 'ok' ? '#d98a4a' : '#321'; else if (t.t === 'conveyor') col = '#b26bff'; else if (t.t === 'bonus') col = '#ffe600';
    mini.globalAlpha = Math.abs(dy) <= 1 ? 0.95 : 0.3; mini.fillStyle = col;
    mini.fillRect((dx + R) * cell + 1, (dz + R) * cell + 1, cell - 2, cell - 2);
  }
  mini.globalAlpha = 1; mini.fillStyle = '#fff'; mini.shadowColor = '#fff'; mini.shadowBlur = 8;
  if (Math.floor(time * 3) % 2 === 0) mini.fillRect(R * cell + cell * 0.25, R * cell + cell * 0.25, cell * 0.5, cell * 0.5);
  mini.shadowBlur = 0;
}

// ---------- petla ----------
let last = performance.now(), tMiniLast = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  if (nowMs - last < 1000 / FPS_CAP - 2) return;
  const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs; const time = nowMs / 1000;
  if (!map || !S) return;
  stepAnim(time);
  if (!cam.init) { cam.x = runner.x; cam.y = runner.y; cam.z = runner.z; cam.init = true; }
  const k = 1 - Math.exp(-dt * 3.5); cam.x += (runner.x - cam.x) * k; cam.z += (runner.z - cam.z) * k; cam.y += ((runner.y0 !== undefined ? runner.y0 : runner.y) - cam.y) * k;
  shake = Math.max(0, shake - dt * 1.6);
  ctx.save(); if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10);
  drawBackground(dt, time); drawTiles(time); drawRunner(time); drawParts(dt); drawRain(dt);
  ctx.restore();
  const srv = Date.now() + skew;
  if (HUD) {
    const left = Math.max(0, HUD.windowEnd - srv); const frozen = HUD.frozenUntil > srv;
    $('tbar').style.width = (frozen ? 0 : 100 * left / HUD.voteMs) + '%';
    $('tsec').textContent = frozen ? 'FROZEN' : (left / 1000).toFixed(1) + ' s';
    const ev = Math.max(0, HUD.nextEventAt - srv), mm = Math.floor(ev / 60000), ss = Math.floor((ev % 60000) / 1000);
    $('evt').textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); $('evt').style.color = ev < 30000 ? '#ff1744' : '#ffe600';
    $('freeze').style.display = frozen ? 'block' : 'none'; if (frozen) $('freeze').textContent = 'SYSTEM FROZEN ' + Math.ceil((HUD.frozenUntil - srv) / 1000);
  }
  if (S.won && resetAt) $('wreset').textContent = 'New game in ' + Math.max(0, Math.ceil((resetAt - performance.now()) / 1000)) + ' s';
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('show'); }
  flashAmt = Math.max(0, flashAmt - dt * 1.8); const fl = $('flash'); fl.style.background = flashCol; fl.style.opacity = flashAmt * 0.55;
  if (nowMs - tMiniLast > 250) { tMiniLast = nowMs; drawMini(time); }
}
connect();
