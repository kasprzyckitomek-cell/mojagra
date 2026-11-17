import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as L from './logic.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const rnd = L.mulberry32(777);

// ---------- renderer ----------
const canvas = $('gl');
let pixelRatio = params.has('lite') ? 1 : Math.min(devicePixelRatio || 1, 1.5);
const FPS_CAP = +params.get('fps') || 0;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07051a);
scene.fog = new THREE.FogExp2(0x07051a, 0.011);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 700);
camera.position.set(0, 10, 12);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = params.get('bloom') !== '0';
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// ---------- swiatla ----------
scene.add(new THREE.HemisphereLight(0x3a2f80, 0x0a0618, 0.55));
const lMag = new THREE.PointLight(0xff2bd6, 260, 38, 2); scene.add(lMag);
const lCya = new THREE.PointLight(0x00e5ff, 220, 38, 2); scene.add(lCya);

// ---------- pomocnicze ----------
const tmpO = new THREE.Object3D();
const tmpC = new THREE.Color();
const hex = (s) => new THREE.Color(s);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- stan klienta ----------
let map = null, S = null, HUD = null, cfg = { voteSeconds: 8 };
let world = null;
let skew = 0; // roznica zegara serwera
const runner = { pos: new THREE.Vector3(), yaw: 0, scale: 1, vis: 1, hop: 0, flash: 0, group: null };
let queue = [], curAnim = null;
let shake = 0, flashAmt = 0, flashCol = '#f00';
let shieldBubble = null;
const parts = { pts: null, vel: [], life: [], n: 300, i: 0 };

// ---------- audio ----------
let AC = null;
function audioOn() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* brak */ } } if (AC && AC.state === 'suspended') AC.resume(); }
addEventListener('pointerdown', audioOn); addEventListener('keydown', audioOn);
function beep(f, d = 0.1, type = 'square', vol = 0.05, slide = 0) {
  if (!AC || params.has('mute')) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, AC.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), AC.currentTime + d);
  g.gain.setValueAtTime(vol, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d);
  o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + d + 0.02);
}
const sfx = {
  hop: () => beep(520 + Math.random() * 80, 0.09, 'square', 0.04, 220),
  deny: () => beep(110, 0.14, 'sawtooth', 0.05),
  fall: () => beep(600, 0.7, 'sawtooth', 0.06, -520),
  shock: () => { beep(90, 0.4, 'sawtooth', 0.09); beep(1400, 0.2, 'square', 0.04, -1200); },
  event: () => { beep(440, 0.18, 'square', 0.06); setTimeout(() => beep(330, 0.18, 'square', 0.06), 190); setTimeout(() => beep(220, 0.5, 'sawtooth', 0.07), 380); },
  good: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', 0.07), i * 90)),
  cp: () => [660, 880].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'triangle', 0.07), i * 110)),
  rewind: () => beep(900, 0.8, 'sawtooth', 0.05, -800),
};

// ---------- budowa swiata ----------
function disposeWorld() {
  if (!world) return;
  scene.remove(world);
  world.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } });
  world = null;
}

let tileBody, tilePlate, gemMesh, gemList = [], arrowMesh, arrowList = [];
let rain, cars = [], carMesh, glitchTiles = [];

function buildWorld() {
  disposeWorld();
  world = new THREE.Group(); scene.add(world);
  const tiles = map.tiles, plats = map.platforms, N = tiles.length;

  // klocki
  const bodyGeo = new THREE.BoxGeometry(0.96, 0.6, 0.96); bodyGeo.translate(0, -0.3, 0);
  tileBody = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.75, roughness: 0.38 }), N);
  const plateGeo = new THREE.BoxGeometry(0.8, 0.05, 0.8); plateGeo.translate(0, 0.03, 0);
  tilePlate = new THREE.InstancedMesh(plateGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  tileBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tilePlate.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tileBody.frustumCulled = false; tilePlate.frustumCulled = false;
  for (let i = 0; i < N; i++) { tileBody.setColorAt(i, tmpC.set(0x1a1633)); tilePlate.setColorAt(i, tmpC.set(0x00e5ff)); }
  tileBody.instanceColor.setUsage(THREE.DynamicDrawUsage); tilePlate.instanceColor.setUsage(THREE.DynamicDrawUsage);
  world.add(tileBody, tilePlate);

  // filary pod platformami
  const pilGeo = new THREE.BoxGeometry(0.42, 60, 0.42); pilGeo.translate(0, -30.6, 0);
  const pillars = new THREE.InstancedMesh(pilGeo, new THREE.MeshStandardMaterial({ color: 0x0f0c22, metalness: 0.8, roughness: 0.5 }), plats.length);
  plats.forEach((p, i) => {
    let cx = 0, cz = 0; p.tiles.forEach((id) => { cx += tiles[id].x; cz += tiles[id].z; });
    const t0 = tiles[p.tiles[0]];
    tmpO.position.set(cx / 5, t0.y, cz / 5); tmpO.rotation.set(0, 0, 0); tmpO.scale.set(1, 1, 1); tmpO.updateMatrix();
    pillars.setMatrixAt(i, tmpO.matrix);
  });
  world.add(pillars);

  // przenosniki (strzalki) i bonusy
  arrowList = []; gemList = [];
  tiles.forEach((t, id) => {
    if (t.t === 'conveyor') {
      const p = plats[t.p]; const i = p.route.indexOf(id); const n = tiles[p.route[i + 1]];
      arrowList.push({ id, ang: Math.atan2(n.x - t.x, n.z - t.z) });
    }
    if (t.t === 'bonus') gemList.push(id);
  });
  arrowMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 0.5, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd9a8ff }), Math.max(1, arrowList.length));
  arrowMesh.count = arrowList.length; world.add(arrowMesh);
  gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xffe600 }), Math.max(1, gemList.length));
  gemMesh.count = gemList.length; world.add(gemMesh);

  // bramy: checkpointy, strefy, meta
  const ringGeo = new THREE.TorusGeometry(1.6, 0.07, 8, 40);
  tiles.forEach((t, id) => {
    const isCp = t.t === 'checkpoint';
    const firstOfZone = plats.some((p, i) => p.zone > 0 && (i === 0 || plats[i - 1].zone !== p.zone) && p.entry === id);
    if (!isCp && !firstOfZone) return;
    const z = L_ZONES()[plats[t.p].zone];
    const col = isCp ? hex('#39ff88') : hex(z.color);
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col.multiplyScalar(1.8) }));
    m.position.set(t.x, t.y + 1.6, t.z); world.add(m);
    if (!isCp) { const m2 = m.clone(); m2.scale.setScalar(1.3); m2.material = new THREE.MeshBasicMaterial({ color: hex(z.color2).multiplyScalar(1.6) }); world.add(m2); }
  });
  const fin = tiles[map.route[map.route.length - 1]];
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 260, 12, 1, true), new THREE.MeshBasicMaterial({ color: hex('#ffe600').multiplyScalar(2), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(fin.x, fin.y + 130, fin.z); world.add(beam);

  buildCity(); buildSigns(); buildRain(); buildCars(); buildRunner(); buildParticles();
  for (let i = 0; i < N; i++) setTileVisual(i, 0, true);
  tileBody.instanceMatrix.needsUpdate = true; tilePlate.instanceMatrix.needsUpdate = true;
  tileBody.instanceColor.needsUpdate = true; tilePlate.instanceColor.needsUpdate = true;
}
const L_ZONES = () => L.ZONES;

function buildCity() {
  const tiles = map.tiles;
  const CELL = 8, cellMin = new Map();
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const t of tiles) {
    const k = Math.floor(t.x / CELL) + ',' + Math.floor(t.z / CELL);
    const v = cellMin.get(k); if (v === undefined || t.y < v) cellMin.set(k, t.y);
    x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); z0 = Math.min(z0, t.z); z1 = Math.max(z1, t.z);
  }
  const minNear = (x, z, r) => {
    let m = 1e9; const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL), d0 = Math.floor((z - r) / CELL), d1 = Math.floor((z + r) / CELL);
    for (let a = c0; a <= c1; a++) for (let b = d0; b <= d1; b++) { const v = cellMin.get(a + ',' + b); if (v !== undefined && v < m) m = v; }
    return m;
  };
  const tex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#05040c'; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
      if (Math.random() < 0.38) { const c = ['#ffe9a8', '#7cf7ff', '#ff7be9', '#fff'][Math.floor(Math.random() * 4)]; g.fillStyle = c; g.globalAlpha = 0.35 + Math.random() * 0.65; g.fillRect(x, y, 4, 5); }
    }
    g.globalAlpha = 1;
  });
  const BASE = -80, M = 90;
  const list = [];
  const want = 1100; let tries = 0;
  while (list.length < want && tries++ < want * 6) {
    const x = x0 - M + rnd() * (x1 - x0 + 2 * M), z = z0 - M + rnd() * (z1 - z0 + 2 * M);
    const w = 3 + rnd() * 7, d = 3 + rnd() * 7;
    const hw = Math.max(w, d) / 2;
    let top = BASE + 40 + rnd() * rnd() * 190;
    const m1 = minNear(x, z, hw + 7); if (m1 < 1e8) top = Math.min(top, m1 - 4);
    const m2 = minNear(x, z, hw + 24); if (m2 < 1e8) top = Math.min(top, m2 + 6);
    if (top - BASE < 14) continue;
    list.push({ x, z, w, d, h: top - BASE });
  }
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, list.length);
  const cols = ['#ff8bf0', '#7cf7ff', '#9a7bff', '#ffd27c', '#7cffb0'];
  list.forEach((b, i) => {
    tmpO.position.set(b.x, BASE, b.z); tmpO.scale.set(b.w, b.h, b.d); tmpO.rotation.set(0, 0, 0); tmpO.updateMatrix(); mesh.setMatrixAt(i, tmpO.matrix);
    mesh.setColorAt(i, tmpC.set(cols[i % cols.length]).multiplyScalar(0.55 + rnd() * 0.6));
  });
  mesh.frustumCulled = false; world.add(mesh);
  // dach z antena (swiecaca czerwona kropka na wiekszych)
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 6, 6), new THREE.MeshBasicMaterial({ color: hex('#ff2040').multiplyScalar(2.2) }), list.length);
  let c = 0;
  list.forEach((b) => { if (b.h > 90) { tmpO.position.set(b.x, BASE + b.h + 0.5, b.z); tmpO.scale.set(1, 1, 1); tmpO.updateMatrix(); lights.setMatrixAt(c++, tmpO.matrix); } });
  lights.count = c; lights.frustumCulled = false; world.add(lights);
  // siatka ulic na dole
  const gtex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#04030a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff2bd6'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); g.strokeStyle = '#00e5ff'; g.lineWidth = 1; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); });
  gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gtex, color: 0x777777 }));
  ground.position.set((x0 + x1) / 2, BASE - 0.5, (z0 + z1) / 2); world.add(ground);
}

function buildSigns() {
  const words = ['NEON', 'ラーメン', '2077', 'CYBER', 'ネオン', 'HACK', 'BAR', 'SYNTH', 'ドローン', 'DATA', '404', 'LIVE', 'KICK', 'ZERO', 'VOID', '電脳', 'OPEN', 'NIGHT'];
  const colors = ['#ff2bd6', '#00e5ff', '#ffe600', '#39ff88', '#ff9a1f', '#a855ff'];
  const route = map.route; const g = new THREE.Group();
  for (let i = 0; i < 45; i++) {
    const ri = 6 + Math.floor((i / 45) * (route.length - 12)) + Math.floor(rnd() * 8);
    const t = map.tiles[route[Math.min(route.length - 1, ri)]];
    const side = rnd() < 0.5 ? -1 : 1;
    const col = colors[Math.floor(rnd() * colors.length)], word = words[Math.floor(rnd() * words.length)];
    const tex = canvasTex(256, 96, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.strokeStyle = col; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10);
      c.fillStyle = col; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(word, w / 2, h / 2 + 3);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4 + rnd() * 2.5, 1.6 + rnd()), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(1.1, 1.1, 1.1), side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(t.x + side * (16 + rnd() * 12), t.y + 2 + rnd() * 10, t.z - 6 - rnd() * 18);
    m.rotation.y = side * -0.35 + (rnd() - 0.5) * 0.3;
    g.add(m);
  }
  world.add(g);
}

function buildRain() {
  const n = 2600; const pos = new Float32Array(n * 6);
  rain = { n, pos, geo: new THREE.BufferGeometry() };
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * 90, y = rnd() * 60 - 20, z = (rnd() - 0.5) * 90;
    pos.set([x, y, z, x - 0.05, y - 1.4, z], i * 6);
  }
  rain.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rain.mesh = new THREE.LineSegments(rain.geo, new THREE.LineBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.35 }));
  rain.mesh.frustumCulled = false; world.add(rain.mesh);
}
function updateRain(dt, cx, cy, cz) {
  const p = rain.pos;
  for (let i = 0; i < rain.n; i++) {
    const o = i * 6; const d = 34 * dt;
    p[o + 1] -= d; p[o + 4] -= d;
    if (p[o + 1] < cy - 22) { const x = cx + (Math.random() - 0.5) * 90, y = cy + 30 + Math.random() * 10, z = cz + (Math.random() - 0.5) * 90; p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = x - 0.05; p[o + 4] = y - 1.4; p[o + 5] = z; }
  }
  rain.geo.attributes.position.needsUpdate = true;
}

function buildCars() {
  const n = 90; carMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.35, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  cars = [];
  const route = map.route;
  for (let i = 0; i < n; i++) {
    const t = map.tiles[route[Math.floor(rnd() * route.length)]];
    const axis = rnd() < 0.5 ? 0 : 1;
    cars.push({ cx: t.x + (rnd() - 0.5) * 50, cz: t.z + (rnd() - 0.5) * 50, y: t.y + 2 + rnd() * 16, axis, dir: rnd() < 0.5 ? -1 : 1, sp: 3 + rnd() * 9, off: rnd() * 100, len: 50 + rnd() * 30 });
    carMesh.setColorAt(i, tmpC.set(['#ff2bd6', '#00e5ff', '#ffe600', '#ff3b3b'][i % 4]).multiplyScalar(2));
  }
  carMesh.frustumCulled = false; world.add(carMesh);
}
function updateCars(time) {
  cars.forEach((c, i) => {
    const u = ((time * c.sp * c.dir + c.off) % c.len + c.len) % c.len - c.len / 2;
    tmpO.position.set(c.axis === 0 ? c.cx + u : c.cx, c.y, c.axis === 1 ? c.cz + u : c.cz);
    tmpO.rotation.set(0, c.axis === 0 ? 0 : Math.PI / 2, 0); tmpO.scale.set(1, 1, 1); tmpO.updateMatrix(); carMesh.setMatrixAt(i, tmpO.matrix);
  });
  carMesh.instanceMatrix.needsUpdate = true;
}

function buildParticles() {
  const g = new THREE.BufferGeometry(); const n = parts.n;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(9999), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  parts.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  parts.pts.frustumCulled = false; parts.vel = new Array(n).fill(0).map(() => new THREE.Vector3()); parts.life = new Float32Array(n);
  world.add(parts.pts);
}
function burst(p, color, n = 30, spd = 4) {
  const pos = parts.pts.geometry.attributes.position, col = parts.pts.geometry.attributes.color; const c = hex(color).multiplyScalar(1.8);
  for (let k = 0; k < n; k++) {
    const i = parts.i = (parts.i + 1) % parts.n;
    pos.setXYZ(i, p.x, p.y + 0.5, p.z); col.setXYZ(i, c.r, c.g, c.b);
    parts.vel[i].set((Math.random() - 0.5) * spd, Math.random() * spd, (Math.random() - 0.5) * spd); parts.life[i] = 0.6 + Math.random() * 0.6;
  }
}
function updateParticles(dt) {
  const pos = parts.pts.geometry.attributes.position;
  for (let i = 0; i < parts.n; i++) {
    if (parts.life[i] <= 0) continue; parts.life[i] -= dt;
    if (parts.life[i] <= 0) { pos.setXYZ(i, 9999, 9999, 9999); continue; }
    parts.vel[i].y -= 6 * dt;
    pos.setXYZ(i, pos.getX(i) + parts.vel[i].x * dt, pos.getY(i) + parts.vel[i].y * dt, pos.getZ(i) + parts.vel[i].z * dt);
  }
  pos.needsUpdate = true;
}

// ---------- robot-biegacz ----------
function buildRunner() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23204a, metalness: 0.8, roughness: 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: hex('#00e5ff').multiplyScalar(2.2) });
  const mag = new THREE.MeshBasicMaterial({ color: hex('#ff2bd6').multiplyScalar(2) });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(0.5, 0.55, 0.34), dark, 0, 0.78, 0);
  add(new THREE.BoxGeometry(0.36, 0.1, 0.02), mag, 0, 0.82, -0.18);
  add(new THREE.BoxGeometry(0.4, 0.34, 0.36), dark, 0, 1.27, 0);
  add(new THREE.BoxGeometry(0.3, 0.09, 0.02), glow, 0, 1.3, -0.19);
  add(new THREE.BoxGeometry(0.14, 0.4, 0.14), dark, -0.14, 0.3, 0); add(new THREE.BoxGeometry(0.14, 0.4, 0.14), dark, 0.14, 0.3, 0);
  add(new THREE.BoxGeometry(0.1, 0.4, 0.1), dark, -0.34, 0.78, 0); add(new THREE.BoxGeometry(0.1, 0.4, 0.1), dark, 0.34, 0.78, 0);
  add(new THREE.BoxGeometry(0.03, 0.3, 0.03), dark, 0.1, 1.6, 0); add(new THREE.SphereGeometry(0.06, 8, 8), mag, 0.1, 1.78, 0);
  add(new THREE.BoxGeometry(0.2, 0.04, 0.2), glow, 0, 0.03, 0);
  shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), new THREE.MeshBasicMaterial({ color: hex('#39ff88').multiplyScalar(1.4), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  shieldBubble.position.y = 0.85; g.add(shieldBubble);
  runner.group = g; world.add(g);
}
const tilePos = (id) => { const t = map.tiles[id]; return new THREE.Vector3(t.x, t.y, t.z); };

// ---------- wyglad kratek ----------
const COL = {
  cp: hex('#39ff88'), fin: hex('#ffe600'), blink: hex('#00e5ff'), laser: hex('#ff9a1f'), shockC: hex('#ff1744'),
  crumble: hex('#d98a4a'), conv: hex('#b26bff'), glitch: hex('#ff2bd6'), bonus: hex('#ffe600'),
};
function setTileVisual(id, time, init) {
  const t = map.tiles[id]; const st = S || L.newState(map);
  const mode = L.tileMode(map, st, id, st.tick + 1), mode2 = L.tileMode(map, st, id, st.tick + 2);
  const z = L.ZONES[map.platforms[t.p].zone];
  let c = tmpC, show = 1, body = 1;
  const flick = 0.55 + 0.45 * Math.sin(time * 18 + id);
  switch (t.t) {
    case 'checkpoint': c.copy(COL.cp).multiplyScalar(1.6); break;
    case 'finish': c.copy(COL.fin).multiplyScalar(2.2); break;
    case 'blink': if (mode === 'ok') { c.copy(COL.blink).multiplyScalar(mode2 === 'ok' ? 1.3 : 0.5 + flick); } else { c.copy(COL.blink).multiplyScalar(0.1); show = 0.9; body = 0; } break;
    case 'laser': if (mode === 'shock') c.copy(COL.shockC).multiplyScalar(2.4); else c.copy(COL.laser).multiplyScalar(mode2 === 'shock' ? 0.5 + flick : 0.9); break;
    case 'crumble': if (mode === 'void') { c.copy(COL.crumble).multiplyScalar(0.08); body = 0; } else c.copy(COL.crumble).multiplyScalar(st.crumbleAt[id] !== undefined ? 0.5 + flick : 1.0); break;
    case 'conveyor': c.copy(COL.conv).multiplyScalar(1.3); break;
    case 'glitch': c.setHSL((time * 0.7 + id * 0.13) % 1, 1, 0.55).multiplyScalar(1.2); break;
    case 'shock': c.copy(COL.shockC).multiplyScalar(1.2 + flick * 0.9); break;
    case 'bonus': c.copy(COL.bonus).multiplyScalar(0.9); break;
    default: c.set(z.color).multiplyScalar(0.5);
  }
  if (mode === 'shock' && t.t !== 'laser' && t.t !== 'shock') c.copy(COL.shockC).multiplyScalar(1.4 + flick); // sabotaz
  tilePlate.setColorAt(id, c);
  tmpO.position.set(t.x, t.y, t.z); tmpO.rotation.set(0, 0, 0);
  tmpO.scale.set(show, show, show); tmpO.updateMatrix(); tilePlate.setMatrixAt(id, tmpO.matrix);
  tmpO.scale.set(body || 0.0001, body || 0.0001, body || 0.0001); tmpO.updateMatrix(); tileBody.setMatrixAt(id, tmpO.matrix);
  tileBody.setColorAt(id, tmpC.set(z.color).multiplyScalar(0.1).add(hex('#14102c')));
}
function refreshTiles(time) {
  if (!map || !S) return;
  const cur = map.tiles[S.pos].p; const a = Math.max(0, cur - 8), b = Math.min(map.platforms.length - 1, cur + 16);
  for (let p = a; p <= b; p++) for (const id of map.platforms[p].tiles) setTileVisual(id, time, false);
  tileBody.instanceMatrix.needsUpdate = true; tilePlate.instanceMatrix.needsUpdate = true;
  tileBody.instanceColor.needsUpdate = true; tilePlate.instanceColor.needsUpdate = true;
  // strzalki i klejnoty
  arrowList.forEach((a2, i) => { const t = map.tiles[a2.id]; tmpO.position.set(t.x, t.y + 0.12, t.z); tmpO.rotation.set(0, a2.ang, 0); tmpO.scale.setScalar(1 + 0.2 * Math.sin(time * 6 - i)); tmpO.updateMatrix(); arrowMesh.setMatrixAt(i, tmpO.matrix); });
  arrowMesh.instanceMatrix.needsUpdate = true;
  gemList.forEach((id, i) => { const t = map.tiles[id]; const taken = S.bonusTaken[id]; tmpO.position.set(t.x, t.y + 0.7 + 0.1 * Math.sin(time * 3 + i), t.z); tmpO.rotation.set(0, time * 2, 0); tmpO.scale.setScalar(taken ? 0.0001 : 1); tmpO.updateMatrix(); gemMesh.setMatrixAt(i, tmpO.matrix); });
  gemMesh.instanceMatrix.needsUpdate = true;
}

// ---------- animacje ruchu ----------
function setRunnerTo(id) { const p = tilePos(id); runner.pos.copy(p); runner.vis = 1; runner.scale = 1; }
function enqueue(steps) {
  for (const s of steps) queue.push(Object.assign({ dur: 0 }, s));
}
function startAnim(s, now) {
  curAnim = { s, t0: now };
  switch (s.k) {
    case 'move': s.dur = 0.36; s.a = tilePos(s.from); s.b = tilePos(s.to); runner.yaw = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z) + Math.PI; sfx.hop(); break;
    case 'slide': s.dur = 0.28; s.a = tilePos(s.from); s.b = tilePos(s.to); burst(s.a, '#b26bff', 10, 3); break;
    case 'blocked': s.dur = 0.24; s.a = runner.pos.clone(); { const d = L.DIRS[s.dir]; s.b = new THREE.Vector3(d[0], 0, d[1]); runner.yaw = Math.atan2(d[0], d[1]) + Math.PI; } sfx.deny(); break;
    case 'wait': s.dur = 0.05; break;
    case 'glitch': s.dur = 0.25; burst(runner.pos, '#ff2bd6', 25, 5); beep(300, 0.2, 'sawtooth', 0.04, 500); break;
    case 'bonus': s.dur = 0.3; burst(runner.pos, '#ffe600', 40, 5); sfx.good(); break;
    case 'cp': s.dur = 0.4; burst(runner.pos, '#39ff88', 60, 6); sfx.cp(); break;
    case 'win': s.dur = 0.2; break;
    case 'fall': s.dur = 0.8; s.a = tilePos(s.from); s.b = tilePos(s.to); sfx.fall(); break;
    case 'bounce': s.dur = 0.3; s.a = tilePos(s.from); s.b = tilePos(s.to); flashFx('#39ff88', 0.35); burst(runner.pos, '#39ff88', 40, 5); sfx.good(); break;
    case 'rewind': s.dur = s.shock ? 1.1 : 1.0; s.a = tilePos(s.from); s.b = tilePos(s.to); if (s.shock) { flashFx('#ff1744', 0.7); shake = 0.9; sfx.shock(); burst(runner.pos, '#ff1744', 60, 7); } sfx.rewind(); break;
    case 'teleport': s.dur = 0.9; s.a = tilePos(s.from); s.b = tilePos(s.to); flashFx('#ffe600', 0.6); sfx.good(); break;
    default: s.dur = 0;
  }
}
function stepAnim(now) {
  if (!curAnim) { const s = queue.shift(); if (!s) return; startAnim(s, now); }
  const { s, t0 } = curAnim; const u = s.dur > 0 ? Math.min(1, (now - t0) / s.dur) : 1;
  switch (s.k) {
    case 'move': runner.pos.lerpVectors(s.a, s.b, u); runner.pos.y += Math.sin(Math.PI * u) * 0.75 + (s.b.y - s.a.y) * 0; runner.scale = 1 + 0.15 * Math.sin(Math.PI * u); break;
    case 'slide': runner.pos.lerpVectors(s.a, s.b, u); break;
    case 'blocked': runner.pos.copy(s.a).addScaledVector(s.b, Math.sin(Math.PI * u) * 0.25); break;
    case 'fall': if (u < 0.55) { const v = u / 0.55; runner.pos.copy(s.a); runner.pos.y -= v * v * 14; runner.vis = 1 - v; } else { const v = (u - 0.55) / 0.45; runner.pos.copy(s.b); runner.vis = v; runner.scale = v; } break;
    case 'bounce': runner.pos.lerpVectors(s.a, s.b, u); runner.pos.y += Math.sin(Math.PI * u) * 0.9; break;
    case 'rewind': { const e = u * u * (3 - 2 * u); runner.pos.lerpVectors(s.a, s.b, e); runner.pos.y += Math.sin(Math.PI * e) * 1.5; runner.vis = 0.5 + 0.5 * Math.sin(u * 40); break; }
    case 'teleport': { const e = u * u * (3 - 2 * u); runner.pos.lerpVectors(s.a, s.b, e); runner.pos.y += Math.sin(Math.PI * e) * 3; break; }
  }
  if (u >= 1) {
    if (s.b && (s.k === 'move' || s.k === 'slide' || s.k === 'fall' || s.k === 'bounce' || s.k === 'rewind' || s.k === 'teleport')) { runner.pos.copy(s.b); runner.vis = 1; runner.scale = 1; }
    if (s.k === 'fall') burst(runner.pos, '#00e5ff', 40, 5);
    if (s.k === 'move') burst(runner.pos, '#00e5ff', 6, 2);
    if (s.k === 'win') { burst(runner.pos, '#ffe600', 120, 10); }
    curAnim = null;
  }
}
function flashFx(col, a) { flashCol = col; flashAmt = Math.max(flashAmt, a); }

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
  tmpScene.zone = z;
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
    buildWorld(); applyState(d.state); applyHud(d.hud); setRunnerTo(S.pos); setWin(S.won);
    if (!window.__started) { window.__started = true; requestAnimationFrame(frame); }
  });
  socket.on('window', (d) => { applyState(d.state); applyHud(d.hud); setVotes({ gora: 0, dol: 0, lewo: 0, prawo: 0, czekaj: 0 }); });
  socket.on('votes', (d) => setVotes(d.counts));
  socket.on('tick', (d) => {
    setVotes(d.counts); enqueue(d.steps); applyState(d.state); applyHud(d.hud);
  });
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
let last = performance.now(), tMiniLast = 0, fpsAcc = 0, fpsN = 0, lowT = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(); let camInit = false;
function frame(nowMs) {
  requestAnimationFrame(frame);
  if (FPS_CAP && nowMs - last < 1000 / FPS_CAP - 2) return;
  const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs; const time = nowMs / 1000;
  if (!map || !S) return;
  stepAnim(time);
  // runner
  const g = runner.group;
  g.position.copy(runner.pos); g.rotation.y = runner.yaw;
  const idle = !curAnim ? Math.sin(time * 3) * 0.04 : 0;
  g.position.y += idle; g.scale.setScalar(Math.max(0.001, runner.scale) * 1.3);
  g.visible = runner.vis > 0.02 && (runner.vis > 0.99 || Math.random() < runner.vis + 0.3);
  shieldBubble.visible = S.shield > 0; shieldBubble.material.opacity = 0.1 + 0.07 * S.shield + 0.04 * Math.sin(time * 5);
  lMag.position.set(runner.pos.x - 3, runner.pos.y + 4.5, runner.pos.z + 3);
  lCya.position.set(runner.pos.x + 3, runner.pos.y + 3.5, runner.pos.z - 3);
  // kamera
  const target = runner.pos;
  const desired = new THREE.Vector3(target.x + 0, target.y + 10.5, target.z + 12.5);
  if (!camInit) { camPos.copy(desired); camLook.copy(target); camInit = true; }
  const k = 1 - Math.exp(-dt * 3.2); camPos.lerp(desired, k);
  camLook.lerp(new THREE.Vector3(target.x, target.y + 0.4, target.z - 3.2), k * 1.4);
  shake = Math.max(0, shake - dt * 1.6);
  camera.position.copy(camPos).add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.6, (Math.random() - 0.5) * shake * 0.6, 0));
  camera.lookAt(camLook);
  // otoczenie wg strefy
  const zc = hex(tmpScene.zone.color).multiplyScalar(0.07).add(hex('#05030f'));
  scene.background.lerp(zc, dt * 1.2); scene.fog.color.copy(scene.background);
  refreshTiles(time); updateRain(dt, camera.position.x, camera.position.y, camera.position.z); updateCars(time); updateParticles(dt);
  // HUD timery
  const srv = Date.now() + skew;
  if (HUD) {
    const left = Math.max(0, HUD.windowEnd - srv); const frozen = HUD.frozenUntil > srv;
    $('tbar').style.width = (frozen ? 0 : 100 * left / HUD.voteMs) + '%';
    $('tsec').textContent = frozen ? 'FROZEN' : (left / 1000).toFixed(1) + ' s';
    const ev = Math.max(0, HUD.nextEventAt - srv), mm = Math.floor(ev / 60000), ss = Math.floor((ev % 60000) / 1000);
    $('evt').textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); $('evt').style.color = ev < 30000 ? '#ff1744' : '#ffe600';
    $('freeze').style.display = frozen ? 'block' : 'none'; if (frozen) $('freeze').textContent = 'SYSTEM FROZEN ' + Math.ceil((HUD.frozenUntil - srv) / 1000);
  }
  if (S.won && resetAt) { $('wreset').textContent = 'New game in ' + Math.max(0, Math.ceil((resetAt - performance.now()) / 1000)) + ' s'; }
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('show'); }
  flashAmt = Math.max(0, flashAmt - dt * 1.8); const fl = $('flash'); fl.style.background = flashCol; fl.style.opacity = flashAmt * 0.55;
  if (nowMs - tMiniLast > 120) { tMiniLast = nowMs; drawMini(time); }
  // render + awaryjne obnizenie jakosci
  if (useBloom) composer.render(); else renderer.render(scene, camera);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 3) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 26) { lowT++; if (lowT === 1 && pixelRatio > 1) { pixelRatio = 1; renderer.setPixelRatio(1); composer.setPixelRatio(1); composer.setSize(innerWidth, innerHeight); } else if (lowT >= 2) useBloom = false; } else lowT = 0; }
}

connect();
