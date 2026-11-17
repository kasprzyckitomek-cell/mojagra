import * as THREE from 'three';
import { generateLevel, SECTIONS } from './level.js';
import { makePlayer, stepPlayer, buildBoxes, EYE, SPRINT } from './physics.js';

const $ = (id) => document.getElementById(id);
const socket = io();

// ---------- poziom ----------
const SEED = 1337;
const plats = generateLevel(SEED);
const boxes = buildBoxes(plats);

// ---------- scena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfeaff, 60, 320);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 700);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xdff0ff, 0x6a7a55, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 160 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// niebo: gradient zależny od wysokości
const skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(500, 24, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = clamp(normalize(vP).y * 1.4 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  }),
);
sky.renderOrder = -10;
scene.add(sky);

// gwiazdy
const starPos = [];
for (let i = 0; i < 700; i++) {
  const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.05, Math.random() - 0.5).normalize().multiplyScalar(450);
  starPos.push(v.x, v.y, v.z);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
scene.add(stars);

const SKY_KEYS = [
  { h: 0,  top: 0x4aa3ff, bottom: 0xcfeaff, fog: 0xcfeaff, sun: 1.7, hemi: 0.8 },
  { h: 22, top: 0x5e8fd8, bottom: 0xffd3a1, fog: 0xffd3a1, sun: 1.5, hemi: 0.75 },
  { h: 42, top: 0x2d2f7a, bottom: 0xff8a5c, fog: 0xc7725c, sun: 0.9, hemi: 0.55 },
  { h: 60, top: 0x0a0b24, bottom: 0x3b2a6e, fog: 0x1d1a45, sun: 0.6, hemi: 0.4 },
  { h: 78, top: 0x02030a, bottom: 0x0a0d26, fog: 0x080a1e, sun: 0.45, hemi: 0.3 },
];
const cA = new THREE.Color(), cB = new THREE.Color();
function applySky(h) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && h > SKY_KEYS[i + 1].h) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
  skyUniforms.top.value.set(a.top).lerp(cB.set(b.top), t);
  skyUniforms.bottom.value.set(a.bottom).lerp(cB.set(b.bottom), t);
  scene.fog.color.set(a.fog).lerp(cB.set(b.fog), t);
  sun.intensity = a.sun + (b.sun - a.sun) * t;
  hemi.intensity = a.hemi + (b.hemi - a.hemi) * t;
  stars.material.opacity = Math.min(1, Math.max(0, (h - 45) / 22));
  cloudMat.color.copy(scene.fog.color).lerp(WHITE, 0.55);
}

// ---------- platformy ----------
const texCache = new Map();
function blockTexture(hue, kind) {
  const key = hue + kind;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const sat = kind === 'ice' ? 55 : 55, light = kind === 'ice' ? 78 : 58;
  const baseHue = kind === 'ice' ? 195 : hue;
  g.fillStyle = `hsl(${baseHue} ${sat}% ${light}%)`;
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
    g.fillStyle = `hsla(${baseHue} ${sat}% ${light + (Math.random() - 0.5) * 14}% / .55)`;
    g.fillRect(x, y, 8, 8);
  }
  g.strokeStyle = `hsl(${baseHue} ${sat}% ${light - 22}%)`;
  g.lineWidth = 4;
  g.strokeRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function textSprite(text, scale = 1) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.65)';
  g.strokeText(text, 128, 34);
  g.fillStyle = '#fff';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(2.4 * scale, 0.6 * scale, 1);
  return s;
}

const levelGroup = new THREE.Group();
scene.add(levelGroup);
for (const p of plats) {
  const topTex = blockTexture(p.hue, p.kind === 'ice' ? 'ice' : 'n').clone();
  topTex.needsUpdate = true;
  topTex.repeat.set(p.size, p.size);
  const sideColor = new THREE.Color().setHSL((p.kind === 'ice' ? 195 : p.hue) / 360, 0.35, 0.33);
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: p.kind === 'ice' ? 0.12 : 0.85, metalness: p.kind === 'ice' ? 0.15 : 0 });
  if (p.kind === 'finish') topMat.color.set(0xffe27a);
  const sideMat = new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.95 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size, 1, p.size), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
  mesh.position.set(p.x, p.y - 0.5, p.z);
  mesh.castShadow = mesh.receiveShadow = true;
  levelGroup.add(mesh);

  if (p.kind === 'checkpoint' || p.kind === 'finish' || p.kind === 'start') {
    const flagColor = p.kind === 'finish' ? 0xffd23f : p.kind === 'start' ? 0x4cd964 : 0xff4d4d;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
    pole.position.set(p.x + p.size / 2 - 0.5, p.y + 1.5, p.z + p.size / 2 - 0.5);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: flagColor, emissive: flagColor, emissiveIntensity: 0.35 }));
    flag.position.set(pole.position.x - 0.55, p.y + 2.6, pole.position.z);
    pole.castShadow = flag.castShadow = true;
    levelGroup.add(pole, flag);
    const label = textSprite(p.kind === 'finish' ? 'META' : p.kind === 'start' ? 'START' : `Sekcja ${p.section}`);
    label.position.set(p.x, p.y + 4.2, p.z);
    levelGroup.add(label);
  }
  if (p.kind === 'finish') {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 200, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    beam.position.set(p.x, p.y + 100, p.z);
    levelGroup.add(beam);
  }
}

// chmury dla klimatu
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const WHITE = new THREE.Color(0xffffff);
let seedCloud = 7;
const rnd = () => { seedCloud = (seedCloud * 16807) % 2147483647; return seedCloud / 2147483647; };
for (let i = 0; i < 90; i++) {
  const ref = plats[Math.floor(rnd() * plats.length)];
  const ang = rnd() * Math.PI * 2, dist = 30 + rnd() * 90;
  const cg = new THREE.Group();
  const parts = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < parts; k++) {
    const w = 4 + rnd() * 6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.5 + rnd() * 1.5, 3 + rnd() * 4), cloudMat);
    m.position.set(k * 4 - parts * 2 + rnd() * 2, rnd() * 1.2, rnd() * 3);
    cg.add(m);
  }
  cg.position.set(ref.x + Math.cos(ang) * dist, ref.y - 14 - rnd() * 24, ref.z + Math.sin(ang) * dist);
  scene.add(cg);
}

// ---------- awatary ----------
function makeAvatar(hue) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.7, 0.5), roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((hue + 200) % 360) / 360, 0.45, 0.3), roughness: 0.8 });
  const eye = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; };
  const limb = (w, h, d, mat, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = box(w, h, d, mat);
    m.position.y = -h / 2;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  };
  const head = box(0.5, 0.5, 0.5, skin); head.position.y = 1.55;
  const e1 = box(0.08, 0.08, 0.02, eye), e2 = box(0.08, 0.08, 0.02, eye);
  e1.position.set(-0.12, 1.58, -0.255); e2.position.set(0.12, 1.58, -0.255);
  const body = box(0.5, 0.7, 0.3, shirt); body.position.y = 1.0;
  g.add(head, e1, e2, body);
  const legL = limb(0.24, 0.65, 0.24, pants, -0.13, 0.65);
  const legR = limb(0.24, 0.65, 0.24, pants, 0.13, 0.65);
  const armL = limb(0.2, 0.65, 0.2, skin, -0.37, 1.35);
  const armR = limb(0.2, 0.65, 0.2, skin, 0.37, 1.35);
  return { group: g, legL, legR, armL, armR };
}
function animateAvatar(av, speed, airborne, t) {
  const k = Math.min(speed / 6, 1);
  const sw = Math.sin(t * 11) * 0.95 * k;
  av.legL.rotation.x = airborne ? 0.5 : sw;
  av.legR.rotation.x = airborne ? -0.4 : -sw;
  av.armL.rotation.x = airborne ? -2.4 : -sw;
  av.armR.rotation.x = airborne ? -2.4 : sw;
}

// ---------- stan gry ----------
const start = plats[0];
let p = makePlayer(start.x, start.y + 0.02, start.z);
let cp = { x: start.x, y: start.y, z: start.z, section: 0 };
let yaw = 0, pitch = 0;
let started = false, locked = false, finished = false, thirdPerson = false;
let best = 0, deaths = 0, startedAt = null, finalTime = 0;
let jumpPressed = false;
const keys = new Set();
let myId = null;

const me = makeAvatar(200);
me.group.visible = false;
scene.add(me.group);

const remotes = new Map();
let remoteList = [];
let myName = 'Gracz', myHue = 200;

const dbgSection = parseInt(params0().get('dbgsection') || '0', 10);
function params0() { return new URLSearchParams(location.search); }
if (dbgSection > 0 && dbgSection <= SECTIONS) {
  const pl = plats.find((q) => q.section === dbgSection && (q.kind === 'checkpoint' || q.kind === 'finish'));
  cp = { x: pl.x, y: pl.y, z: pl.z, section: pl.section };
  p = makePlayer(pl.x, pl.y + 0.02, pl.z);
}

// ---------- UI ----------
const toastEl = $('toast');
let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}
function fmtTime(ms) {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
function hashHue(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

const params = new URLSearchParams(location.search);
$('name').value = localStorage.getItem('pk_name') || '';
$('room').value = params.get('room') || localStorage.getItem('pk_room') || '';

function lockPointer() { try { canvas.requestPointerLock(); } catch (e) { /* ignoruj */ } }

function play() {
  myName = ($('name').value.trim() || 'Gracz').slice(0, 14);
  const room = $('room').value.trim();
  myHue = hashHue(myName + Math.floor(Math.random() * 5));
  localStorage.setItem('pk_name', myName);
  localStorage.setItem('pk_room', room);
  // nowy avatar w kolorze gracza
  scene.remove(me.group);
  Object.assign(me, makeAvatar(myHue));
  me.group.visible = thirdPerson;
  scene.add(me.group);
  socket.emit('join', { name: myName, room, hue: myHue });
  $('menu').classList.add('hidden');
  started = true;
  lockPointer();
}
$('play').onclick = play;
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });
$('room').addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });
$('resume').onclick = lockPointer;

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  $('paused').classList.toggle('hidden', locked || !started || finished);
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  yaw -= e.movementX * 0.0022;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0022));
});

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') jumpPressed = true;
  if (e.code === 'KeyR') { finished ? restart() : respawn(false); }
  if (e.code === 'KeyV') { thirdPerson = !thirdPerson; me.group.visible = thirdPerson; }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

function respawn(fell) {
  p = makePlayer(cp.x, cp.y + 0.02, cp.z);
  p.yaw = yaw;
  if (fell) { deaths++; toast('Spadłeś! Wracasz do checkpointu'); }
}
function restart() {
  cp = { x: start.x, y: start.y, z: start.z, section: 0 };
  p = makePlayer(start.x, start.y + 0.02, start.z);
  deaths = 0; startedAt = null; finished = false;
  $('finish').classList.add('hidden');
  lockPointer();
}
$('again').onclick = restart;

// ---------- multiplayer ----------
socket.on('joined', (d) => {
  myId = d.id;
  $('roomHint').textContent = `Pokój: ${d.room}`;
});
socket.on('full', () => toast('Pokój jest pełny'));
socket.on('players', (list) => {
  remoteList = list;
  const seen = new Set();
  for (const pl of list) {
    if (pl.id === myId) continue;
    seen.add(pl.id);
    let r = remotes.get(pl.id);
    if (!r) {
      const av = makeAvatar(pl.hue);
      const tag = textSprite(pl.name);
      tag.position.y = 2.25;
      av.group.add(tag);
      av.group.position.set(pl.x, pl.y, pl.z);
      scene.add(av.group);
      r = { av, tag, x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw, sp: 0, name: pl.name, prevY: pl.y, air: false };
      remotes.set(pl.id, r);
    }
    r.x = pl.x; r.y = pl.y; r.z = pl.z; r.yaw = pl.yaw; r.sp = pl.sp;
  }
  for (const [id, r] of remotes) if (!seen.has(id)) { scene.remove(r.av.group); remotes.delete(id); }
});
setInterval(() => {
  if (!started || !myId) return;
  socket.emit('pos', { x: p.x, y: p.y, z: p.z, yaw, sp: Math.hypot(p.vx, p.vz), sec: cp.section, h: best });
}, 1000 / 15);

function updateBoard() {
  const rows = remoteList.map((r) => ({ name: r.name, h: r.h, hue: r.hue, me: r.id === myId }));
  if (!rows.some((r) => r.me)) rows.push({ name: myName, h: best, hue: myHue, me: true });
  rows.sort((a, b) => b.h - a.h);
  $('list').innerHTML = rows.slice(0, 6).map((r, i) =>
    `<div style="${r.me ? 'font-weight:800' : ''}"><span style="color:hsl(${r.hue} 80% 65%)">●</span> ${i + 1}. ${r.name.replace(/</g, '&lt;')} — ${Math.round(r.h)} m</div>`).join('');
}
setInterval(updateBoard, 400);

// ---------- pętla ----------
let last = performance.now();
let hudT = 0;
const fwdVec = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  const playing = started && locked && !finished;
  if (playing) {
    const fw = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const st = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (startedAt === null && (fw || st || jumpPressed)) startedAt = now;
    p.yaw = yaw;
    stepPlayer(p, { fw, st, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), jumpPressed }, dt, boxes);
    jumpPressed = false;

    if (p.y < cp.y - 14) respawn(true);

    if (p.grounded && p.groundIdx >= 0) {
      const pl = plats[p.groundIdx];
      if (pl.section > cp.section && (pl.kind === 'checkpoint' || pl.kind === 'finish')) {
        cp = { x: pl.x, y: pl.y, z: pl.z, section: pl.section };
        if (pl.kind === 'finish') {
          finished = true;
          finalTime = now - (startedAt ?? now);
          $('finishInfo').textContent = `Czas: ${fmtTime(finalTime)} · Upadki: ${deaths}`;
          $('finish').classList.remove('hidden');
          document.exitPointerLock();
        } else {
          toast(`Checkpoint! Sekcja ${pl.section}/${SECTIONS}`);
        }
      }
    }
    if (p.y > best) {
      const prev = best;
      best = p.y;
      if (prev < 10 && best >= 10) toast('Już 10 metrów!');
    }
  } else {
    jumpPressed = false;
  }

  // kamera
  const eye = new THREE.Vector3(p.x, p.y + EYE, p.z);
  camera.rotation.set(pitch, yaw, 0);
  if (thirdPerson) {
    fwdVec.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.position.copy(eye).addScaledVector(fwdVec, -4.2);
    camera.position.y += 0.3;
  } else {
    camera.position.copy(eye);
  }
  const sprinting = playing && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && Math.hypot(p.vx, p.vz) > 5;
  camera.fov += ((sprinting ? 83 : 75) - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();

  // własny awatar
  me.group.position.set(p.x, p.y, p.z);
  me.group.rotation.y = yaw;
  animateAvatar(me, Math.hypot(p.vx, p.vz), !p.grounded, t);

  // zdalni gracze
  const k = 1 - Math.exp(-12 * dt);
  for (const r of remotes.values()) {
    const g = r.av.group;
    const dy = r.y - g.position.y;
    g.position.x += (r.x - g.position.x) * k;
    g.position.y += dy * k;
    g.position.z += (r.z - g.position.z) * k;
    let da = r.yaw - g.rotation.y;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    g.rotation.y += da * k;
    r.air = Math.abs(dy) > 0.25;
    animateAvatar(r.av, r.sp, r.air, t);
    r.tag.quaternion.copy(camera.quaternion);
  }

  // światło i niebo podążają za graczem
  sun.position.set(p.x + 30, p.y + 50, p.z + 20);
  sun.target.position.set(p.x, p.y, p.z);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  applySky(Math.max(0, p.y));

  // HUD
  hudT += dt;
  if (hudT > 0.08) {
    hudT = 0;
    $('h').textContent = Math.max(0, Math.round(p.y));
    $('best').textContent = Math.round(best);
    $('sec').textContent = cp.section;
    $('deaths').textContent = deaths;
    $('time').textContent = fmtTime(finished ? finalTime : startedAt === null ? 0 : now - startedAt);
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
