// Dekoracje na platformach – zależne od motywu sekcji. Czysto wizualne, bez kolizji.
import * as THREE from 'three';

const G = {
  cone: new THREE.ConeGeometry(1, 1, 6),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  sph: new THREE.SphereGeometry(1, 12, 10),
  ico: new THREE.IcosahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.1, 6, 24),
  dode: new THREE.DodecahedronGeometry(1, 0),
  cap: new THREE.CapsuleGeometry(1, 1, 3, 8),
  hemi: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
};
const matCache = new Map();
function M(color, glow = 0) {
  const k = color + '|' + glow;
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshStandardMaterial({
      color, roughness: 0.8, flatShading: true,
      emissive: glow ? color : 0x000000, emissiveIntensity: glow,
    }));
  }
  return matCache.get(k);
}
function mesh(parent, geo, mat, x, y, z, sx, sy = sx, sz = sx, shadow = false) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow;
  parent.add(m);
  return m;
}
const pick = (r, arr) => arr[(r() * arr.length) | 0];

// --- elementy ---
const ITEMS = {
  tuft(r, a) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { const m = mesh(g, G.cone, M(pick(r, [0x4fa83a, 0x66c44c, 0x3f8f2f])), (r() - 0.5) * 0.25, 0.16, (r() - 0.5) * 0.25, 0.05, 0.34 + r() * 0.15, 0.05); m.rotation.z = (r() - 0.5) * 0.5; }
    const ph = r() * 6; a.push((t) => { g.rotation.z = Math.sin(t * 1.8 + ph) * 0.08; });
    return g;
  },
  flower(r, a) {
    const g = new THREE.Group(); const c = pick(r, [0xff6f91, 0xffd84a, 0xffffff, 0xb980ff, 0xff9a3c]);
    mesh(g, G.cyl, M(0x3f8f2f), 0, 0.22, 0, 0.02, 0.44, 0.02);
    const head = new THREE.Group(); head.position.y = 0.46; g.add(head);
    for (let i = 0; i < 6; i++) { const ang = i / 6 * 6.283; mesh(head, G.sph, M(c), Math.cos(ang) * 0.08, 0, Math.sin(ang) * 0.08, 0.055, 0.025, 0.055); }
    mesh(head, G.sph, M(0xffb300), 0, 0.01, 0, 0.045);
    const ph = r() * 6; a.push((t) => { g.rotation.z = Math.sin(t * 1.5 + ph) * 0.1; });
    return g;
  },
  tree(r, a) {
    const g = new THREE.Group();
    mesh(g, G.cyl, M(0x7a4e2a), 0, 0.55, 0, 0.12, 1.1, 0.12, true);
    const crown = new THREE.Group(); crown.position.y = 1.3; g.add(crown);
    mesh(crown, G.ico, M(0x3fa045), 0, 0.1, 0, 0.62, 0.55, 0.62, true);
    mesh(crown, G.ico, M(0x58b858), 0.22, 0.45, 0.1, 0.42, 0.38, 0.42, true);
    mesh(crown, G.ico, M(0x4aae4a), -0.2, 0.3, -0.15, 0.36, 0.34, 0.36);
    const ph = r() * 6; a.push((t) => { crown.rotation.z = Math.sin(t * 0.9 + ph) * 0.03; crown.rotation.x = Math.cos(t * 0.8 + ph) * 0.03; });
    return g;
  },
  lantern(r, a) {
    const g = new THREE.Group();
    mesh(g, G.cyl, M(0x4a3626), 0, 0.5, 0, 0.04, 1, 0.04, true);
    mesh(g, G.box, M(0x4a3626), 0.12, 0.98, 0, 0.3, 0.03, 0.03);
    const glow = mesh(g, G.sph, M(0xffb347, 2.6), 0.26, 0.86, 0, 0.1);
    const ph = r() * 6; a.push((t) => { const f = 1 + Math.sin(t * 9 + ph) * 0.08 + Math.sin(t * 23 + ph) * 0.05; glow.scale.setScalar(0.1 * f); });
    return g;
  },
  barrel(r) {
    const g = new THREE.Group();
    mesh(g, G.cyl, M(0x8a5a30), 0, 0.28, 0, 0.22, 0.56, 0.22, true);
    mesh(g, G.cyl, M(0x3a3a3a), 0, 0.14, 0, 0.225, 0.04, 0.225);
    mesh(g, G.cyl, M(0x3a3a3a), 0, 0.42, 0, 0.225, 0.04, 0.225);
    return g;
  },
  cactus(r, a) {
    const g = new THREE.Group(); const c = M(0x3d9a52);
    mesh(g, G.cap, c, 0, 0.45, 0, 0.13, 0.55, 0.13, true);
    const arm = mesh(g, G.cap, c, 0.2, 0.55, 0, 0.07, 0.22, 0.07); arm.rotation.z = -0.7;
    mesh(g, G.sph, M(0xff6fa8), 0, 0.95, 0, 0.05);
    return g;
  },
  rock(r) {
    const g = new THREE.Group();
    mesh(g, G.dode, M(pick(r, [0x9a9a9a, 0x8b8478, 0xb5ab98])), 0, 0.14, 0, 0.2 + r() * 0.12, 0.14 + r() * 0.08, 0.22, true);
    return g;
  },
  torch(r, a) {
    const g = new THREE.Group();
    mesh(g, G.cyl, M(0x5b4636), 0, 0.5, 0, 0.04, 1, 0.04, true);
    mesh(g, G.cyl, M(0x3a3a3a), 0, 1.02, 0, 0.09, 0.08, 0.09);
    const f1 = mesh(g, G.cone, M(0xff7a1a, 2.4), 0, 1.2, 0, 0.1, 0.3, 0.1);
    const f2 = mesh(g, G.cone, M(0xffd24a, 2.8), 0, 1.15, 0, 0.055, 0.2, 0.055);
    const ph = r() * 6; a.push((t) => { const f = 1 + Math.sin(t * 12 + ph) * 0.18 + Math.sin(t * 29 + ph) * 0.1; f1.scale.set(0.1 / f, 0.3 * f, 0.1 / f); f2.scale.set(0.055 / f, 0.2 * f, 0.055 / f); });
    return g;
  },
  mushroom(r, a) {
    const g = new THREE.Group(); const c = pick(r, [0xff4d6d, 0x5ee0ff, 0xc77dff]);
    mesh(g, G.cyl, M(0xf3ecd8), 0, 0.12, 0, 0.05, 0.24, 0.05);
    const cap = mesh(g, G.hemi, M(c, 0.9), 0, 0.22, 0, 0.17, 0.14, 0.17);
    const ph = r() * 6; a.push((t) => { cap.material.emissiveIntensity = 0.9; cap.scale.y = 0.14 + Math.sin(t * 2 + ph) * 0.006; });
    return g;
  },
  pine(r, a) {
    const g = new THREE.Group();
    mesh(g, G.cyl, M(0x6a4a2e), 0, 0.2, 0, 0.07, 0.4, 0.07);
    for (let i = 0; i < 3; i++) {
      mesh(g, G.cone, M(0x2f7d52), 0, 0.55 + i * 0.38, 0, 0.5 - i * 0.12, 0.55, 0.5 - i * 0.12, true);
      mesh(g, G.cone, M(0xf4faff), 0, 0.7 + i * 0.38, 0, 0.3 - i * 0.08, 0.28, 0.3 - i * 0.08);
    }
    const ph = r() * 6; a.push((t) => { g.rotation.z = Math.sin(t * 1.2 + ph) * 0.02; });
    return g;
  },
  icicle(r) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) mesh(g, G.cone, M(0xbfeaff, 0.5), (i - 1) * 0.14, 0.2 + i % 2 * 0.1, (r() - 0.5) * 0.1, 0.07, 0.4 + i % 2 * 0.2, 0.07);
    return g;
  },
  flames(r, a) {
    const g = new THREE.Group(); const fl = [];
    for (let i = 0; i < 3; i++) {
      const f = mesh(g, G.cone, M(i === 1 ? 0xffd24a : 0xff5a00, 2.6), (i - 1) * 0.12, 0.2, (r() - 0.5) * 0.1, 0.1, 0.35, 0.1);
      fl.push([f, r() * 6]);
    }
    mesh(g, G.dode, M(0x2a2222), 0, 0.06, 0, 0.3, 0.1, 0.3);
    a.push((t) => { for (const [f, ph] of fl) { const k = 1 + Math.sin(t * 11 + ph) * 0.25; f.scale.set(0.1 / k, 0.35 * k, 0.1 / k); } });
    return g;
  },
  column(r) {
    const g = new THREE.Group(); const c = M(0xf0ece0);
    mesh(g, G.cyl, c, 0, 0.08, 0, 0.17, 0.16, 0.17, true);
    mesh(g, G.cyl, c, 0, 0.55, 0, 0.11, 0.9, 0.11, true);
    mesh(g, G.cyl, c, 0, 1.03, 0, 0.17, 0.12, 0.17, true);
    return g;
  },
  crystals(r, a) {
    const g = new THREE.Group(); const items = [];
    for (let i = 0; i < 3; i++) {
      const c = pick(r, [0xff7ad9, 0x7ad9ff, 0xb07bff, 0x7affc2]);
      const m = mesh(g, G.oct, M(c, 1.4), (i - 1) * 0.22, 0.3 + i % 2 * 0.15, (r() - 0.5) * 0.2, 0.1, 0.3 + r() * 0.15, 0.1, true);
      items.push([m, r() * 6]);
    }
    a.push((t) => { for (const [m, ph] of items) { m.rotation.y = t * 0.8 + ph; m.position.y += Math.sin(t * 2 + ph) * 0.0006; } });
    return g;
  },
  ring(r, a) {
    const g = new THREE.Group();
    mesh(g, G.cyl, M(0x1c2a40), 0, 0.4, 0, 0.04, 0.8, 0.04);
    const ring = mesh(g, G.torus, M(0x00e5ff, 2.2), 0, 1.05, 0, 0.22);
    const ring2 = mesh(g, G.torus, M(0xff2bd6, 2.0), 0, 1.05, 0, 0.14);
    a.push((t) => { ring.rotation.x = t * 1.2; ring.rotation.y = t * 0.7; ring2.rotation.y = t * 1.6; ring2.rotation.z = t; });
    return g;
  },
  neonpole(r, a) {
    const g = new THREE.Group();
    mesh(g, G.cyl, M(0x1c2a40), 0, 0.6, 0, 0.04, 1.2, 0.04, true);
    const bulb = mesh(g, G.sph, M(0x00e5ff, 3), 0, 1.25, 0, 0.1);
    const ph = r() * 6; a.push((t) => { bulb.material.emissiveIntensity = 3; bulb.scale.setScalar(0.1 * (1 + Math.sin(t * 5 + ph) * 0.12)); });
    return g;
  },
  dish(r, a) {
    const g = new THREE.Group();
    mesh(g, G.cyl, M(0x6b768f), 0, 0.2, 0, 0.05, 0.4, 0.05, true);
    const d = new THREE.Group(); d.position.y = 0.45; g.add(d);
    const bowl = mesh(d, G.hemi, M(0xc9d3ea), 0, 0, 0, 0.3, 0.14, 0.3, true); bowl.rotation.x = Math.PI * 0.85;
    mesh(d, G.sph, M(0x4fc3ff, 2), 0, -0.14, 0, 0.04);
    a.push((t) => { d.rotation.y = t * 0.6; });
    return g;
  },
  floatcube(r, a) {
    const g = new THREE.Group(); const c = mesh(g, G.box, M(0x4fc3ff, 1.5), 0, 0.7, 0, 0.18, 0.18, 0.18, true);
    const ph = r() * 6; a.push((t) => { c.rotation.x = t * 0.9 + ph; c.rotation.y = t * 0.7; c.position.y = 0.7 + Math.sin(t * 1.6 + ph) * 0.1; });
    return g;
  },
  coins(r) {
    const g = new THREE.Group(); const c = M(0xffd23f, 0.6);
    for (let i = 0; i < 5; i++) mesh(g, G.cyl, c, (r() - 0.5) * 0.04, 0.03 + i * 0.045, (r() - 0.5) * 0.04, 0.17, 0.035, 0.17, true);
    return g;
  },
  gemstand(r, a) {
    const g = new THREE.Group();
    mesh(g, G.cyl, M(0xf2e6c4), 0, 0.2, 0, 0.12, 0.4, 0.12, true);
    const gem = mesh(g, G.oct, M(0xff3d7f, 1.6), 0, 0.65, 0, 0.13, 0.2, 0.13);
    a.push((t) => { gem.rotation.y = t; gem.position.y = 0.65 + Math.sin(t * 2) * 0.04; });
    return g;
  },
};

const THEME_ITEMS = {
  meadow: ['tuft', 'flower', 'flower', 'tree', 'tuft'],
  wood: ['lantern', 'barrel', 'tuft', 'barrel'],
  sand: ['cactus', 'rock', 'cactus', 'rock'],
  brick: ['torch', 'barrel', 'torch', 'rock'],
  moss: ['mushroom', 'mushroom', 'tuft', 'rock'],
  snow: ['pine', 'icicle', 'rock', 'pine'],
  lava: ['flames', 'rock', 'flames', 'rock'],
  marble: ['column', 'column', 'rock', 'column'],
  crystal: ['crystals', 'crystals', 'crystals', 'rock'],
  neon: ['ring', 'neonpole', 'neonpole', 'ring'],
  space: ['dish', 'floatcube', 'floatcube', 'dish'],
  gold: ['coins', 'gemstand', 'coins', 'coins'],
  ice: ['icicle', 'icicle', 'pine'],
};

// zwraca Group z dekoracjami platformy
export function buildDecor(themeId, plat, r, anims) {
  const group = new THREE.Group();
  if (plat.kind === 'crumble') return group;
  const list = THEME_ITEMS[themeId] || [];
  const big = plat.kind === 'start' || plat.kind === 'checkpoint' || plat.kind === 'finish';
  const count = plat.size < 2.3 ? 0 : plat.size < 3.2 ? 1 : plat.size < 4.5 ? 2 : big ? 5 : 3;
  const h = plat.size / 2 - 0.35;
  for (let i = 0; i < count; i++) {
    const name = list[(r() * list.length) | 0];
    if (!name || (name === 'tree' && plat.size < 4)) continue;
    const item = ITEMS[name](r, anims);
    // rozmieszczenie przy krawędziach, żeby nie zasłaniać skoków
    const side = (r() * 4) | 0, u = (r() * 2 - 1) * h;
    const x = side === 0 ? -h : side === 1 ? h : u;
    const z = side === 2 ? -h : side === 3 ? h : u;
    item.position.set(x, 0, z);
    item.rotation.y = r() * 6.283;
    group.add(item);
  }
  return group;
}
