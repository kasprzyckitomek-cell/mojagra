import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { generateLevel, SECTIONS, mulberry32 } from './level.js';
import { makePlayer, stepPlayer, buildBoxes, EYE } from './physics.js';
import { THEMES, ICE, platformMaterials } from './textures.js';
import { makeAvatar, animateAvatar } from './avatar.js';
import { buildDecor } from './decor.js';
import { createAmbient, createPuffs, createBirds, createBalloons, createShootingStars, createGems, initAudio, toggleMute, sfx } from './effects.js';

const $ = (id) => document.getElementById(id);
const socket = io();

// ---------- poziom ----------
const SEED = 1337;
const plats = generateLevel(SEED);
const boxes = buildBoxes(plats);
const themeOf = (p) => (p.kind === 'ice' ? ICE : p.section === 0 ? 0 : (p.section - 1) % 12);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfeaff, 70, 340);
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

// bloom (blask neonów, lawy, kryształów) z awaryjnym wyłączeniem na słabych komputerach
const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.setSize(innerWidth, innerHeight);
composer.renderTarget1.samples = 4;
composer.renderTarget2.samples = 4;
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = true;

// ---------- niebo ----------
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
const cB = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);
let nightAmount = 0;
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
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
  nightAmount = Math.min(1, Math.max(0, (h - 45) / 22));
  stars.material.opacity = nightAmount;
  cloudMat.color.copy(scene.fog.color).lerp(WHITE, 0.55);
}

// ---------- etykiety ----------
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

// ---------- platformy, dekoracje ----------
const levelGroup = new THREE.Group();
scene.add(levelGroup);
const animatedMats = [];   // świecące materiały (lawa, neon...)
const anims = [];          // animacje dekoracji
const flags = [];          // flagi na wietrze
const crumbles = [];       // znikające platformy

plats.forEach((p, i) => {
  const ti = themeOf(p);
  const mats = platformMaterials(ti, p.kind === 'crumble' ? 'crumble' : 'normal', p.size, animatedMats);
  if (p.kind === 'finish') mats[2].color.set(0xffe9a0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size, 1, p.size), mats);
  mesh.position.set(p.x, p.y - 0.5, p.z);
  mesh.castShadow = mesh.receiveShadow = true;
  levelGroup.add(mesh);
  p.mesh = mesh;
  if (p.kind === 'crumble') crumbles.push({ i, mesh, state: 'idle', t: 0, vy: 0 });

  const decor = buildDecor(THEMES[ti].id, p, mulberry32(i * 977 + 5), anims);
  decor.position.set(p.x, p.y, p.z);
  levelGroup.add(decor);

  if (p.kind === 'checkpoint' || p.kind === 'finish' || p.kind === 'start') {
    const flagColor = p.kind === 'finish' ? 0xffd23f : p.kind === 'start' ? 0x4cd964 : 0xff4d4d;
    const px = p.x + p.size / 2 - 0.5, pz = p.z + p.size / 2 - 0.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.4, roughness: 0.4 }));
    pole.position.set(px, p.y + 1.6, pz);
    const fgeo = new THREE.PlaneGeometry(1.3, 0.8, 10, 2);
    fgeo.translate(0.65, 0, 0);
    const flag = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({ color: flagColor, emissive: flagColor, emissiveIntensity: 0.5, side: THREE.DoubleSide }));
    flag.position.set(px, p.y + 2.8, pz);
    flag.rotation.y = Math.PI * 0.5;
    pole.castShadow = flag.castShadow = true;
    levelGroup.add(pole, flag);
    flags.push({ geo: fgeo, base: Float32Array.from(fgeo.attributes.position.array), ph: i });
    const label = textSprite(p.kind === 'finish' ? 'META' : p.kind === 'start' ? 'START' : `Sekcja ${p.section}`);
    label.position.set(p.x, p.y + 4.4, p.z);
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
});

// chmury (dryfują powoli)
let seedCloud = 7;
const rnd = () => { seedCloud = (seedCloud * 16807) % 2147483647; return seedCloud / 2147483647; };
const clouds = [];
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
  const bx = ref.x + Math.cos(ang) * dist, by = ref.y - 14 - rnd() * 24, bz = ref.z + Math.sin(ang) * dist;
  cg.position.set(bx, by, bz);
  scene.add(cg);
  clouds.push({ g: cg, bx, bz, sp: 0.4 + rnd() * 0.8, ph: rnd() * 6.28 });
}

// życie na mapie
const ambient = createAmbient(scene);
const puffs = createPuffs(scene);
const birds = createBirds(scene, plats);
const balloons = createBalloons(scene, plats);
const shooting = createShootingStars(scene);
const gems = createGems(scene, plats, mulberry32(4242));
$('gemsTotal').textContent = gems.total;

// ---------- stan gry ----------
const start = plats[0];
let p = makePlayer(start.x, start.y + 0.02, start.z);
let cp = { x: start.x, y: start.y, z: start.z, section: 0 };
let yaw = Math.PI, pitch = -0.25;
let started = false, locked = false, finished = false, thirdPerson = true;
let best = 0, deaths = 0, gemCount = 0, startedAt = null, finalTime = 0;
let jumpPressed = false;
const keys = new Set();
let myId = null;
let curSection = 1;

const variantOf = (hue) => hue % 5;
let me = makeAvatar(200, 0);
scene.add(me.group);

const remotes = new Map();
let remoteList = [];
let myName = 'Gracz', myHue = 200;

const dbgSection = parseInt(new URLSearchParams(location.search).get('dbgsection') || '0', 10);
if (dbgSection > 0 && dbgSection <= SECTIONS) {
  const pl = plats.find((q) => q.section === dbgSection && (q.kind === 'checkpoint' || q.kind === 'finish'));
  cp = { x: pl.x, y: pl.y, z: pl.z, section: pl.section };
  p = makePlayer(pl.x, pl.y + 0.02, pl.z);
  curSection = pl.section;
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
  scene.remove(me.group);
  me = makeAvatar(myHue, variantOf(myHue));
  scene.add(me.group);
  socket.emit('join', { name: myName, room, hue: myHue });
  $('menu').classList.add('hidden');
  started = true;
  initAudio();
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
  if (e.code === 'KeyV') thirdPerson = !thirdPerson;
  if (e.code === 'KeyM') toast(toggleMute() ? 'Dźwięk wyłączony' : 'Dźwięk włączony');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

function respawn(fell) {
  p = makePlayer(cp.x, cp.y + 0.02, cp.z);
  p.yaw = yaw;
  if (fell) { deaths++; toast('Spadłeś! Wracasz do checkpointu'); sfx.fall(); }
}
function restart() {
  cp = { x: start.x, y: start.y, z: start.z, section: 0 };
  p = makePlayer(start.x, start.y + 0.02, start.z);
  deaths = 0; startedAt = null; finished = false; gemCount = 0; gems.reset();
  $('finish').classList.add('hidden');
  lockPointer();
}
$('again').onclick = restart;

// ---------- multiplayer ----------
socket.on('joined', (d) => { myId = d.id; $('roomHint').textContent = `Pokój: ${d.room}`; });
socket.on('full', () => toast('Pokój jest pełny'));
socket.on('players', (list) => {
  remoteList = list;
  const seen = new Set();
  for (const pl of list) {
    if (pl.id === myId) continue;
    seen.add(pl.id);
    let r = remotes.get(pl.id);
    if (!r) {
      const av = makeAvatar(pl.hue, variantOf(pl.hue));
      const tag = textSprite(pl.name);
      tag.position.y = 2.25;
      av.group.add(tag);
      av.group.position.set(pl.x, pl.y, pl.z);
      scene.add(av.group);
      r = { av, tag, x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw, sp: 0, airT: 0, vy: 0 };
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

// ---------- znikające platformy ----------
function updateCrumbles(dt) {
  for (const c of crumbles) {
    const box = boxes[c.i], base = plats[c.i];
    const standing = p.grounded && p.groundIdx === c.i;
    if (c.state === 'idle') {
      c.mesh.position.set(base.x, base.y - 0.5, base.z); c.mesh.scale.setScalar(1);
      if (standing) { c.state = 'shaking'; c.t = 0; sfx.crumble(); }
    } else if (c.state === 'shaking') {
      c.t += dt;
      c.mesh.position.x = base.x + (Math.random() - 0.5) * 0.07;
      c.mesh.position.z = base.z + (Math.random() - 0.5) * 0.07;
      if (Math.random() < dt * 14) puffs.emit(base.x + (Math.random() - 0.5) * base.size, base.y, base.z + (Math.random() - 0.5) * base.size, 1, 0xc9a77a, 0.6, 0.3, 0.4, 0.5);
      if (c.t > 0.85) { c.state = 'fallen'; c.t = 0; c.vy = 0; box.off = true; puffs.emit(base.x, base.y, base.z, 12, 0xc9a77a, 2, 0.6, 0.6); }
    } else if (c.state === 'fallen') {
      c.t += dt; c.vy += 22 * dt;
      c.mesh.position.y -= c.vy * dt;
      c.mesh.rotation.x += dt * 0.6; c.mesh.rotation.z += dt * 0.4;
      c.mesh.visible = c.t < 1.6;
      if (c.t > 3.4) { box.off = false; c.mesh.visible = true; c.mesh.rotation.set(0, 0, 0); c.mesh.scale.setScalar(0.2); c.state = 'pop'; c.t = 0; }
    } else if (c.state === 'pop') {
      c.t += dt; const k = Math.min(1, c.t / 0.25);
      c.mesh.position.set(base.x, base.y - 0.5, base.z);
      c.mesh.scale.setScalar(0.2 + 0.8 * k * (2 - k));
      if (k >= 1) c.state = 'idle';
    }
  }
}

// ---------- pętla ----------
let last = performance.now();
let hudT = 0, runDust = 0, slowFrames = 0, frames = 0;
let prevGrounded = true, prevVy = 0;
const fwdVec = new THREE.Vector3();
const eye = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  // automatyczne obniżenie jakości na słabszych komputerach
  frames++;
  if (dt > 0.034) slowFrames++;
  if (frames === 120) {
    if (slowFrames > 70 && useBloom) {
      useBloom = false; pixelRatio = 1;
      renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
      renderer.shadowMap.enabled = false;
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
    frames = 0; slowFrames = 0;
  }

  const playing = started && locked && !finished;
  if (playing) {
    const fw = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const st = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (startedAt === null && (fw || st || jumpPressed)) startedAt = now;
    p.yaw = yaw;
    prevGrounded = p.grounded; prevVy = p.vy;
    stepPlayer(p, { fw, st, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), jumpPressed }, dt, boxes);
    jumpPressed = false;

    // efekty skoku i lądowania
    if (prevGrounded && !p.grounded && p.vy > 5) { sfx.jump(); puffs.emit(p.x, p.y, p.z, 5, 0xffffff, 1.2, 0.4, 0.3); }
    if (!prevGrounded && p.grounded && prevVy < -5) { sfx.land(); puffs.emit(p.x, p.y + 0.05, p.z, 9, 0xffffff, 2.2, 0.5, 0.3); }
    const spd = Math.hypot(p.vx, p.vz);
    runDust -= dt;
    if (p.grounded && spd > 5.5 && runDust <= 0) { runDust = 0.11; puffs.emit(p.x, p.y + 0.05, p.z, 2, 0xe8e8e8, 0.7, 0.35, 0.2, 0.4); }

    if (p.y < cp.y - 14) respawn(true);

    if (p.grounded && p.groundIdx >= 0) {
      const pl = plats[p.groundIdx];
      if (pl.section > 0) curSection = pl.section;
      if (pl.section > cp.section && (pl.kind === 'checkpoint' || pl.kind === 'finish')) {
        cp = { x: pl.x, y: pl.y, z: pl.z, section: pl.section };
        puffs.emit(pl.x, pl.y + 0.5, pl.z, 26, 0xffe27a, 4, 0.7, 2.5, 0.9);
        if (pl.kind === 'finish') {
          finished = true; sfx.finish();
          finalTime = now - (startedAt ?? now);
          $('finishInfo').textContent = `Czas: ${fmtTime(finalTime)} · Upadki: ${deaths} · Kryształy: ${gemCount}/${gems.total}`;
          $('finish').classList.remove('hidden');
          document.exitPointerLock();
        } else {
          sfx.checkpoint();
          toast(`Checkpoint! Sekcja ${pl.section}/${SECTIONS}`);
        }
      }
    }
    if (p.y > best) {
      const prev = best; best = p.y;
      if (prev < 10 && best >= 10) toast('Już 10 metrów!');
      if (prev < 50 && best >= 50) toast('50 metrów! Widać gwiazdy ✨');
    }
    updateCrumbles(dt);
    gems.update(t, p, (g) => {
      gemCount++; sfx.gem(g.bonus);
      puffs.emit(g.x, g.y, g.z, 10, g.bonus ? 0xffe27a : 0xffffff, 2.6, 0.5, 1.2, 0.6);
    });
  } else {
    jumpPressed = false;
    updateCrumbles(dt);
    gems.update(t, p, () => {});
  }

  // kamera
  eye.set(p.x, p.y + EYE, p.z);
  camera.rotation.set(pitch, yaw, 0);
  if (thirdPerson) {
    fwdVec.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.position.copy(eye).addScaledVector(fwdVec, -4.6);
    camera.position.y += 0.35;
  } else {
    camera.position.copy(eye);
  }
  const sprinting = playing && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && Math.hypot(p.vx, p.vz) > 5;
  camera.fov += ((sprinting ? 82 : 75) - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();

  // własny awatar
  me.group.visible = thirdPerson;
  me.group.position.set(p.x, p.y, p.z);
  me.group.rotation.y = yaw;
  animateAvatar(me, Math.hypot(p.vx, p.vz), !p.grounded, p.vy, dt);

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
    if (Math.abs(dy) > 0.2) { r.airT = 0.18; r.vy = dy; }
    r.airT -= dt;
    animateAvatar(r.av, r.sp, r.airT > 0, r.vy, dt);
    r.tag.quaternion.copy(camera.quaternion);
  }

  // świat żyje
  for (const a of animatedMats) a.mat.emissiveIntensity = a.base + Math.sin(t * 2 + a.phase) * a.amp * 0.5;
  for (const f of anims) f(t);
  for (const c of clouds) c.g.position.set(c.bx + Math.sin(t * 0.03 * c.sp + c.ph) * 18, c.g.position.y, c.bz + Math.cos(t * 0.025 * c.sp + c.ph) * 10);
  for (const f of flags) {
    const a = f.geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = f.base[i];
      a[i + 2] = Math.sin(x * 3.2 - t * 5 + f.ph) * 0.12 * x;
      a[i + 1] = f.base[i + 1] + Math.sin(x * 2.4 - t * 4 + f.ph) * 0.03 * x;
    }
    f.geo.attributes.position.needsUpdate = true;
  }
  ambient.update(dt, t, p, curSection);
  puffs.update(dt);
  birds.update(t);
  balloons.update(t);
  shooting.update(dt, camera.position, camera, nightAmount);

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
    $('gems').textContent = gemCount;
    $('time').textContent = fmtTime(finished ? finalTime : startedAt === null ? 0 : now - startedAt);
  }

  if (useBloom) composer.render(); else renderer.render(scene, camera);
}
requestAnimationFrame(frame);
