// Życie na mapie: cząsteczki, ptaki, balony, spadające gwiazdy, kurz, kryształy, dźwięki.
import * as THREE from 'three';

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const DOT = dotTexture();

// ---------- cząsteczki otaczające gracza (zależne od motywu) ----------
// [kolor, rozmiar, wx, vy, wiggle, miganie]
const AMBIENT = {
  meadow:  [0xe8ff7a, 6, 0, 0.0, 0.8, 1],
  wood:    [0xffc15a, 5, 0.2, -0.5, 0.6, 1],
  sand:    [0xe8d29b, 3, 2.2, 0.0, 0.3, 0],
  brick:   [0xff9a4a, 3, 0, 0.7, 0.4, 1],
  moss:    [0x9aff9a, 5, 0, 0.35, 0.5, 1],
  snow:    [0xffffff, 4, 0.3, -1.5, 0.4, 0],
  lava:    [0xff7a1a, 4, 0, 1.4, 0.4, 1],
  marble:  [0xfff2c8, 3, 0, 0.25, 0.3, 1],
  crystal: [0xff9af0, 5, 0, 0.2, 0.5, 1],
  neon:    [0x00e5ff, 3, 0, 1.6, 0.1, 1],
  space:   [0xbfe3ff, 3, 1.0, 0, 0.2, 1],
  gold:    [0xffe27a, 4, 0, 0.3, 0.3, 1],
};
const THEME_ORDER = ['meadow', 'wood', 'sand', 'brick', 'moss', 'snow', 'lava', 'marble', 'crystal', 'neon', 'space', 'gold'];

export function createAmbient(scene) {
  const N = 260, BX = 26, BY = 16;
  const pos = new Float32Array(N * 3), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * BX * 2; pos[i * 3 + 1] = (Math.random() - 0.5) * BY * 2; pos[i * 3 + 2] = (Math.random() - 0.5) * BX * 2; ph[i] = Math.random() * 6.28; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: DOT, size: 6, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  let cfg = AMBIENT.meadow;
  return {
    update(dt, t, p, sectionIdx) {
      cfg = AMBIENT[THEME_ORDER[Math.max(0, Math.min(11, sectionIdx - 1))]] || AMBIENT.meadow;
      mat.color.set(cfg[0]); mat.size = cfg[1];
      mat.opacity = cfg[5] ? 0.55 + Math.sin(t * 3) * 0.25 : 0.9;
      const a = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        a[j] += (cfg[2] + Math.sin(t * 0.9 + ph[i]) * cfg[4]) * dt;
        a[j + 1] += (cfg[3] + Math.cos(t * 0.7 + ph[i]) * cfg[4] * 0.5) * dt;
        a[j + 2] += Math.cos(t * 0.8 + ph[i] * 1.3) * cfg[4] * dt;
        // zawijanie wokół gracza
        const ox = a[j] + 0, oy = a[j + 1], oz = a[j + 2];
        // pozycje przechowujemy względem gracza w świecie – przesuwamy do pudełka
        const wx = ((ox - p.x + BX * 3) % (BX * 2) + BX * 2) % (BX * 2) - BX + p.x;
        const wy = ((oy - p.y + BY * 3) % (BY * 2) + BY * 2) % (BY * 2) - BY + p.y;
        const wz = ((oz - p.z + BX * 3) % (BX * 2) + BX * 2) % (BX * 2) - BX + p.z;
        a[j] = wx; a[j + 1] = wy; a[j + 2] = wz;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ---------- kurz i iskry ----------
export function createPuffs(scene, count = 48) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; scene.add(s);
    items.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1 });
  }
  let next = 0;
  return {
    emit(x, y, z, n, color = 0xffffff, speed = 1.5, size = 0.5, up = 0.5, life = 0.55) {
      for (let k = 0; k < n; k++) {
        const it = items[next++ % count];
        it.s.visible = true; it.s.position.set(x, y, z);
        it.s.material.color.set(color);
        const a = Math.random() * 6.283, sp = speed * (0.4 + Math.random() * 0.8);
        it.vx = Math.cos(a) * sp; it.vz = Math.sin(a) * sp; it.vy = up + Math.random() * up;
        it.life = it.max = life * (0.7 + Math.random() * 0.6); it.size = size * (0.7 + Math.random() * 0.6);
      }
    },
    update(dt) {
      for (const it of items) {
        if (it.life <= 0) { it.s.visible = false; continue; }
        it.life -= dt;
        const k = 1 - it.life / it.max;
        it.s.position.x += it.vx * dt; it.s.position.y += it.vy * dt; it.s.position.z += it.vz * dt;
        it.vx *= 0.94; it.vz *= 0.94; it.vy *= 0.96;
        it.s.scale.setScalar(it.size * (0.6 + k * 1.2));
        it.s.material.opacity = (1 - k) * 0.65;
      }
    },
  };
}

// ---------- ptaki ----------
export function createBirds(scene, plats) {
  const wingGeo = new THREE.PlaneGeometry(0.7, 0.22); wingGeo.translate(0.35, 0, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0x20243a, side: THREE.DoubleSide });
  const bodyGeo = new THREE.ConeGeometry(0.09, 0.45, 5); bodyGeo.rotateX(-Math.PI / 2);
  const flocks = [];
  const mid = (i) => plats[Math.floor((i / 8) * (plats.length - 1))];
  for (let f = 0; f < 8; f++) {
    const ref = mid(f);
    const birds = [];
    for (let b = 0; b < 4; b++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, mat));
      const wl = new THREE.Mesh(wingGeo, mat); wl.scale.x = -1; const wr = new THREE.Mesh(wingGeo, mat);
      g.add(wl, wr); scene.add(g);
      birds.push({ g, wl, wr, off: b * 0.35, ph: Math.random() * 6 });
    }
    flocks.push({ ref, birds, r: 22 + Math.random() * 24, sp: (0.12 + Math.random() * 0.12) * (f % 2 ? 1 : -1), h: 6 + Math.random() * 16, a0: Math.random() * 6.28 });
  }
  return {
    update(t) {
      for (const f of flocks) {
        for (const b of f.birds) {
          const a = f.a0 + t * f.sp + b.off * Math.sign(f.sp) * -1;
          const x = f.ref.x + Math.cos(a) * f.r, z = f.ref.z + Math.sin(a) * f.r;
          b.g.position.set(x, f.ref.y + f.h + Math.sin(t * 0.7 + b.ph) * 1.5, z);
          b.g.rotation.y = -a + (f.sp > 0 ? Math.PI : 0);
          const flap = Math.sin(t * 9 + b.ph) * 0.7;
          b.wl.rotation.z = -flap; b.wr.rotation.z = flap;
        }
      }
    },
  };
}

// ---------- balony ----------
export function createBalloons(scene, plats) {
  const balloons = [];
  const colors = [['#ff5d5d', '#ffe27a'], ['#4fc3ff', '#ffffff'], ['#b07bff', '#ffd1f0'], ['#4cd964', '#fff3a8'], ['#ff9a3c', '#ffffff']];
  for (let i = 0; i < 5; i++) {
    const [c1, c2] = colors[i];
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const g = cv.getContext('2d');
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? c1 : c2; g.fillRect(k * 16, 0, 16, 64); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
    const grp = new THREE.Group();
    const bal = new THREE.Mesh(new THREE.SphereGeometry(3.6, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    bal.scale.y = 1.25; bal.position.y = 5.5;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.4), new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.9 }));
    grp.add(bal, basket);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 4), new THREE.MeshBasicMaterial({ color: 0x4a3626 }));
      rope.position.set(sx * 0.6, 1.9, sz * 0.6); rope.rotation.z = -sx * 0.18; rope.rotation.x = sz * 0.18;
      grp.add(rope);
    }
    scene.add(grp);
    const ref = plats[Math.floor(((i + 0.5) / 5) * (plats.length - 1))];
    balloons.push({ grp, ref, r: 55 + i * 9, sp: (0.018 + Math.random() * 0.012) * (i % 2 ? -1 : 1), a0: Math.random() * 6.28, y: ref.y + 4 + Math.random() * 10 });
  }
  return {
    update(t) {
      for (const b of balloons) {
        const a = b.a0 + t * b.sp;
        b.grp.position.set(b.ref.x + Math.cos(a) * b.r, b.y + Math.sin(t * 0.3 + b.a0) * 2, b.ref.z + Math.sin(a) * b.r);
        b.grp.rotation.y = t * 0.05 + b.a0;
        b.grp.rotation.z = Math.sin(t * 0.5 + b.a0) * 0.03;
      }
    },
  };
}

// ---------- spadające gwiazdy ----------
export function createShootingStars(scene) {
  const geo = new THREE.PlaneGeometry(14, 0.12);
  const stars = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m);
    stars.push({ m, life: 0, wait: 2 + Math.random() * 6, dir: new THREE.Vector3() });
  }
  return {
    update(dt, camPos, camera, night) {
      for (const s of stars) {
        if (s.life > 0) {
          s.life -= dt;
          s.m.position.addScaledVector(s.dir, dt * 260);
          s.m.material.opacity = Math.max(0, Math.min(1, s.life * 2)) * night;
          if (s.life <= 0) s.m.visible = false;
        } else {
          s.wait -= dt;
          if (s.wait <= 0 && night > 0.3) {
            const a = Math.random() * 6.283;
            s.m.position.set(camPos.x + Math.cos(a) * 380, camPos.y + 120 + Math.random() * 120, camPos.z + Math.sin(a) * 380);
            s.dir.set(-Math.sin(a) * (Math.random() < 0.5 ? 1 : -1), -0.35, Math.cos(a)).normalize();
            s.m.lookAt(camPos); s.m.quaternion.copy(camera.quaternion);
            s.m.rotation.z = Math.atan2(s.dir.y, 1);
            s.m.visible = true; s.life = 0.9; s.wait = 3 + Math.random() * 7;
          }
        }
      }
    },
  };
}

// ---------- kryształy do zbierania ----------
export function createGems(scene, plats, rnd) {
  const geo = new THREE.OctahedronGeometry(0.22, 0); geo.scale(1, 1.5, 1);
  const gems = [];
  const add = (x, y, z, hue, bonus) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue / 360, 0.9, 0.6), emissive: new THREE.Color().setHSL(hue / 360, 0.9, 0.55),
      emissiveIntensity: bonus ? 1.2 : 0.8, roughness: 0.2, metalness: 0.3, flatShading: true,
    }));
    m.position.set(x, y, z);
    if (bonus) m.scale.setScalar(1.25);
    scene.add(m);
    gems.push({ m, x, y, z, taken: false, ph: rnd() * 6.28, bonus });
  };
  for (let i = 1; i < plats.length; i++) {
    const a = plats[i];
    if ((a.kind === 'normal' || a.kind === 'ice') && rnd() < 0.55) add(a.x, a.y + 1.1, a.z, (a.section * 31 + 40) % 360, false);
    if (i < plats.length - 1 && rnd() < 0.45) {
      const b = plats[i + 1];
      add((a.x + b.x) / 2, (a.y + b.y) / 2 + 2.0, (a.z + b.z) / 2, 50, true);
    }
  }
  return {
    total: gems.length,
    update(t, p, onCollect) {
      for (const g of gems) {
        if (g.taken) continue;
        g.m.rotation.y = t * 1.8 + g.ph;
        g.m.position.y = g.y + Math.sin(t * 2 + g.ph) * 0.1;
        const dx = g.x - p.x, dz = g.z - p.z, dy = g.y - (p.y + 0.9);
        if (dx * dx + dz * dz + dy * dy < 1.2) {
          g.taken = true; g.m.visible = false;
          onCollect(g);
        }
      }
    },
    reset() { for (const g of gems) { g.taken = false; g.m.visible = true; } },
  };
}

// ---------- dźwięk (syntezator, bez plików) ----------
let ac = null, muted = false;
export function initAudio() {
  if (ac) return;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
}
export function toggleMute() { muted = !muted; return muted; }
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
export const sfx = {
  jump: () => tone(330, 0.18, 'square', 0.05, 280),
  land: () => tone(110, 0.12, 'sine', 0.12, -50),
  gem: (bonus) => { tone(bonus ? 880 : 740, 0.12, 'triangle', 0.12); tone(bonus ? 1320 : 1108, 0.18, 'triangle', 0.1, 0, 0.07); },
  checkpoint: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0, i * 0.09)),
  fall: () => tone(420, 0.5, 'sawtooth', 0.07, -340),
  crumble: () => tone(90, 0.25, 'sawtooth', 0.06, -30),
  finish: () => [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.3, 'triangle', 0.13, 0, i * 0.1)),
};
