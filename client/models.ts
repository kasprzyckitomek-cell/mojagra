// Proceduralne modele low-poly (postacie, stworzenia, budowle, obiekty świata, przedmioty).
// Każdy model jest zbudowany z prymitywów – można je później podmienić na pliki GLB przez AssetRegistry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharDef } from '../shared/data/characters';
import type { MobDef } from '../shared/data/mobs';

// ---------- Materiały ----------
let gradient: THREE.DataTexture | null = null;
function gradientMap() {
  if (!gradient) {
    const d = new Uint8Array([60, 60, 60, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
    gradient = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}
const matCache = new Map<string, THREE.Material>();
export function toon(color: number, opts: { emissive?: number; transparent?: boolean; opacity?: number } = {}) {
  const key = `${color}|${opts.emissive || 0}|${opts.opacity || 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), emissive: opts.emissive ?? 0, transparent: !!opts.transparent || (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1 });
    matCache.set(key, m);
  }
  return m;
}
export const vcMat = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() });
export const outlineMat = new THREE.MeshBasicMaterial({ color: 0x15100c, side: THREE.BackSide });

// ---------- Geometrie bazowe ----------
const G = {
  box: new THREE.BoxGeometry(1, 1, 1, 2, 2, 2),
  sph: new THREE.SphereGeometry(0.5, 10, 8),
  sphLo: new THREE.SphereGeometry(0.5, 7, 5),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 2),
  cylLo: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  coneLo: new THREE.ConeGeometry(0.5, 1, 6),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  dode: new THREE.DodecahedronGeometry(0.5, 0),
  tor: new THREE.TorusGeometry(0.5, 0.12, 6, 14),
  oct: new THREE.OctahedronGeometry(0.5, 0),
};

function mesh(geo: THREE.BufferGeometry, color: number, p: number[] = [0, 0, 0], s: number[] = [1, 1, 1], r: number[] = [0, 0, 0], opts?: any) {
  const m = new THREE.Mesh(geo, toon(color, opts));
  m.position.set(p[0], p[1], p[2]);
  m.scale.set(s[0], s[1], s[2]);
  m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = true;
  return m;
}

// Część do scalenia (geometria z kolorem wierzchołków)
function part(geo: THREE.BufferGeometry, color: number, p: number[] = [0, 0, 0], s: number[] = [1, 1, 1], r: number[] = [0, 0, 0]) {
  const g = geo.index ? geo.clone().toNonIndexed() : geo.clone();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), new THREE.Vector3(s[0], s[1], s[2]));
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  // lekka wariacja jasności dla efektu "ręcznie malowanego"
  for (let i = 0; i < n; i++) {
    const v = 0.92 + ((i * 7919) % 17) / 17 * 0.16;
    col[i * 3] = c.r * v; col[i * 3 + 1] = c.g * v; col[i * 3 + 2] = c.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingSphere();
  return g;
}

// ---------- "Ręcznie lepione" zniekształcenie geometrii ----------
function hnoise(x: number, y: number, z: number, s: number) {
  const v = Math.sin(Math.round(x * 400) * 12.9898 + Math.round(y * 400) * 78.233 + Math.round(z * 400) * 37.719 + s * 11.13) * 43758.5453;
  return v - Math.floor(v) - 0.5;
}
/** Przesuwa wierzchołki o deterministyczny szum (te same pozycje → to samo przesunięcie, więc bez dziur). */
export function wobble(geo: THREE.BufferGeometry, amt: number, seed = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + hnoise(x, y, z, seed) * amt, y + hnoise(y, z, x, seed + 1) * amt * 0.7, z + hnoise(z, x, y, seed + 2) * amt);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
const wobCache = new Map<string, THREE.BufferGeometry>();
function wobbleCached(geo: THREE.BufferGeometry, amt: number, variant: number) {
  const k = `${geo.uuid}|${amt}|${variant}`;
  let g = wobCache.get(k);
  if (!g) { g = wobble(geo, amt, variant * 7 + 3); wobCache.set(k, g); }
  return g;
}
/** Zniekształca wszystkie siatki w grupie (potwory, budowle) i lekko je przechyla. */
export function organic(root: THREE.Object3D, amt = 0.07, tilt = 0.04, seed = 1) {
  let i = seed;
  root.traverse((o: any) => {
    if (!o.isMesh || o.material === outlineMat || o.userData.noWobble) return;
    const sc = (o.scale.x + o.scale.y + o.scale.z) / 3;
    if (sc < 0.12) return; // oczy i drobne detale zostają gładkie
    i++;
    o.geometry = wobbleCached(o.geometry, amt, i % 4);
    if (tilt) { o.rotation.x += hnoise(i, 1, 2, seed) * tilt * 2; o.rotation.z += hnoise(2, i, 1, seed) * tilt * 2; }
  });
}
// Krzywa gałąź z kilku segmentów
function branch(parts: THREE.BufferGeometry[], col: number, x: number, y: number, z: number, len: number, r: number, ax: number, az: number, segs = 3, bend = 0.25) {
  let cx = x, cy = y, cz = z, a1 = ax, a2 = az;
  for (let i = 0; i < segs; i++) {
    const l = len / segs, rr = r * (1 - i / (segs + 1));
    const dx = Math.sin(a2) * Math.cos(a1) * 0 + Math.sin(a2), dy = Math.cos(a2) * Math.cos(a1), dzz = Math.sin(a1);
    const nx = cx + dx * l, ny = cy + dy * l, nz = cz + dzz * l;
    parts.push(part(G.cylLo, col, [(cx + nx) / 2, (cy + ny) / 2, (cz + nz) / 2], [rr * 2, l * 1.05, rr * 2], [a1, 0, -a2]));
    cx = nx; cy = ny; cz = nz;
    a2 += bend * (i % 2 ? -1 : 1); a1 += bend * 0.6;
  }
  return [cx, cy, cz];
}

// =====================================================================
// Obiekty świata (instancjonowane)
// =====================================================================
const objGeoCache = new Map<string, THREE.BufferGeometry | null>();

export function objGeometry(t: string): THREE.BufferGeometry | null {
  if (objGeoCache.has(t)) return objGeoCache.get(t)!;
  let g = buildObj(t);
  if (g) {
    const amt = WOB[t] ?? 0.06;
    if (amt > 0) g = wobble(g, amt, t.length);
  }
  objGeoCache.set(t, g);
  return g;
}

const WOB: Record<string, number> = {
  boulder: 0.22, boulder_gold: 0.2, boulder_iron: 0.2, boulder_copper: 0.2, boulder_coal: 0.2, crystal_node: 0.05, mole_mound: 0.35, queen_nest: 0.3,
  tree_pine: 0.12, tree_pine_snow: 0.12, tree_birch: 0.12, tree_maple: 0.14, heather: 0.03, mushtree: 0.12, spider_den: 0.25, ruin_pillar: 0.1, portal: 0.08, stone_circle: 0.1,
  grass: 0.03, flowers: 0.02, flint: 0.03, note: 0, titan_lair: 0.1, rabbit_hole: 0.05, deco_tuft: 0.02, deco_pebble: 0.05, deco_twig: 0.02,
};
function evergreen(leaf: number, trunk: number, snow = false) {
  // ciemne, opadające, poszarpane piętra igieł na krzywym pniu
  const p: THREE.BufferGeometry[] = [];
  const [tx, ty, tz] = branch(p, trunk, 0, 0, 0, 3.2, 0.24, 0.05, 0.08, 3, 0.07);
  void tx; void ty; void tz;
  const tiers = [[1.3, 1.6, 2.5], [2.3, 1.4, 2.0], [3.2, 1.2, 1.5], [4.0, 1.0, 1.0]];
  tiers.forEach(([y, h, r], i) => {
    const off = (i % 2 ? 0.08 : -0.06);
    const tier = new THREE.ConeGeometry(0.5, 1, 7, 1, true);
    p.push(part(tier, i % 2 ? leaf : 0x24453a, [off, y + h * 0.4, -off], [r, h, r], [0, i * 0.7, off * 0.6]));
    // poszarpany brzeg – kilka "frędzli"
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + i;
      p.push(part(G.coneLo, leaf, [Math.sin(a) * r * 0.42 + off, y - 0.05, Math.cos(a) * r * 0.42 - off], [0.28, 0.55, 0.28], [Math.cos(a) * 2.6, 0, -Math.sin(a) * 2.6]));
    }
    if (snow) p.push(part(G.coneLo, 0xd8dcd8, [off, y + h * 0.55, -off], [r * 0.85, h * 0.45, r * 0.85]));
  });
  p.push(part(G.coneLo, leaf, [0.12, 4.9, 0.05], [0.35, 0.9, 0.35], [0, 0, -0.35]));
  return p;
}
function lumpyTree(leaf: number, leaf2: number, trunk: number) {
  // krzywy pień z gałęziami i nieregularną koroną z kilku brył
  const p: THREE.BufferGeometry[] = [];
  const [x, y, z] = branch(p, trunk, 0, 0, 0, 2.6, 0.22, 0.1, -0.12, 3, 0.18);
  branch(p, trunk, 0, 1.4, 0, 1.2, 0.09, 0.4, 0.9, 2, 0.3);
  branch(p, trunk, 0, 1.7, 0, 1.0, 0.08, -0.5, -0.8, 2, 0.3);
  const blobs = [[0, 0.5, 0, 1.6], [0.8, 0.2, 0.3, 1.1], [-0.7, 0.1, -0.2, 1.15], [0.2, 1.1, -0.2, 1.0], [-0.3, 0.6, 0.7, 0.9]];
  blobs.forEach(([bx, by, bz, r], i) => p.push(part(G.ico, i % 2 ? leaf : leaf2, [x + bx, y + by, z + bz], [r * 1.3, r * 1.05, r * 1.3], [i, i * 2, 0])));
  return p;
}
function pineTree(leaf: number, trunk = 0x3e2c1c) {
  return [
    part(G.cylLo, trunk, [0, 0.9, 0], [0.35, 1.8, 0.35]),
    part(G.coneLo, leaf, [0, 2.3, 0], [2.4, 2.2, 2.4]),
    part(G.coneLo, leaf, [0, 3.4, 0], [1.9, 1.9, 1.9]),
    part(G.coneLo, leaf, [0, 4.4, 0], [1.3, 1.6, 1.3]),
  ];
}

function buildObj(t: string): THREE.BufferGeometry | null {
  switch (t) {
    case 'tree_pine': return merge(evergreen(0x1c3a2e, 0x2e2216));
    case 'tree_pine_snow': return merge(evergreen(0x1c3a2e, 0x2e2216, true));
    case 'tree_birch': {
      // brzoza: jasny, cętkowany pień i jasnozielona korona
      const p: THREE.BufferGeometry[] = [];
      const [x, y, z] = branch(p, 0xd8d2c2, 0, 0, 0, 3.0, 0.17, 0.06, -0.08, 3, 0.1);
      for (let k = 0; k < 6; k++) p.push(part(G.box, 0x1e1a16, [Math.sin(k * 2.1) * 0.12, 0.4 + k * 0.42, Math.cos(k * 2.1) * 0.12], [0.12, 0.05, 0.12]));
      branch(p, 0xc8c0ae, 0, 1.8, 0, 0.9, 0.06, 0.3, 0.8, 2, 0.3);
      const blobs = [[0, 0.4, 0, 1.3], [0.6, 0.0, 0.3, 0.9], [-0.55, 0.1, -0.2, 0.95], [0.1, 1.0, -0.1, 0.85]];
      blobs.forEach(([bx, by, bz, r], i) => p.push(part(G.ico, i % 2 ? 0x6a8a34 : 0x5c7a2e, [x + bx, y + by, z + bz], [r * 1.2, r * 1.15, r * 1.2], [i, i * 2, 0])));
      return merge(p);
    }
    case 'tree_maple': return merge(lumpyTree(0xa84a1c, 0x8a2e16, 0x3e2a1c));
    case 'heather': return merge([part(G.ico, 0x3a4228, [0, 0.25, 0], [0.8, 0.5, 0.8]), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => part(G.coneLo, i % 2 ? 0x8a4a8a : 0x9a5aa0, [Math.sin(i * 0.8) * 0.3, 0.5, Math.cos(i * 0.8) * 0.3], [0.1, 0.35, 0.1], [Math.sin(i) * 0.4, 0, Math.cos(i) * 0.4]))]);
    case 'heather_picked': return merge([part(G.ico, 0x3a4228, [0, 0.2, 0], [0.7, 0.4, 0.7])]);
    case 'tree_dead': {
      const p: THREE.BufferGeometry[] = [];
      const [x, y, z] = branch(p, 0x3a2c22, 0, 0, 0, 2.6, 0.2, 0.12, 0.15, 4, 0.22);
      branch(p, 0x3a2c22, 0, 1.2, 0, 1.3, 0.08, 0.3, 1.1, 3, 0.4);
      branch(p, 0x3a2c22, 0, 1.6, 0, 1.1, 0.07, -0.6, -1.0, 3, -0.4);
      branch(p, 0x3a2c22, x, y, z, 0.8, 0.05, 0.9, 0.4, 2, 0.5);
      return merge(p);
    }
    case 'mushtree': {
      const p: THREE.BufferGeometry[] = [];
      const [x, y, z] = branch(p, 0xb8ae98, 0, 0, 0, 3.2, 0.32, 0.15, 0.2, 3, -0.12);
      p.push(part(G.sph, 0x4a3462, [x, y + 0.15, z], [3.3, 1.5, 3.1]));
      p.push(part(G.cylLo, 0x2e2240, [x, y - 0.35, z], [2.6, 0.2, 2.4]));
      for (let k = 0; k < 6; k++) p.push(part(G.sphLo, 0x80d8e8, [x + Math.sin(k * 1.9) * 1.1, y + 0.45, z + Math.cos(k * 1.9) * 1.0], [0.28, 0.16, 0.28]));
      return merge(p);
    }
    case 'palm': return merge([
      part(G.cylLo, 0x8a6a40, [0, 1.6, 0], [0.3, 3.2, 0.3], [0.1, 0, 0.05]),
      ...[0, 1.2, 2.4, 3.6, 4.8].map((a) => part(G.box, 0x4a8a3a, [Math.sin(a) * 0.9, 3.2, Math.cos(a) * 0.9], [0.4, 0.06, 1.8], [0.3, a, 0])),
    ]);
    case 'stump': return merge([part(G.cylLo, 0x3e2c1c, [0, 0.25, 0], [0.55, 0.5, 0.55]), part(G.cylLo, 0xc8a070, [0, 0.51, 0], [0.48, 0.02, 0.48])]);
    case 'sapling': { const p: THREE.BufferGeometry[] = []; for (let k = 0; k < 4; k++) branch(p, 0x5a4028, 0, 0, 0, 1.1, 0.04, Math.sin(k * 1.6) * 0.4, Math.cos(k * 1.6) * 0.4, 3, 0.35); p.push(part(G.ico, 0x4a5a2c, [0, 0.9, 0], [0.4, 0.3, 0.4])); return merge(p); }
    case 'sapling_picked': return merge([part(G.cylLo, 0x7a5a3a, [0, 0.15, 0], [0.06, 0.3, 0.06])]);
    case 'grass': return merge([0, 1, 2, 3, 4, 5, 6].map((i) => part(G.coneLo, i % 2 ? 0x6e6a2c : 0x7e7834, [Math.sin(i * 1.3) * 0.18, 0.45, Math.cos(i * 1.3) * 0.18], [0.09, 0.95 + (i % 3) * 0.2, 0.09], [Math.sin(i) * 0.45, 0, Math.cos(i) * 0.45])));
    case 'grass_picked': return merge([0, 1, 2].map((i) => part(G.coneLo, 0x8a9a4a, [Math.sin(i * 2) * 0.12, 0.08, Math.cos(i * 2) * 0.12], [0.1, 0.16, 0.1])));
    case 'berry_bush': return merge([part(G.ico, 0x2e4426, [0, 0.55, 0], [1.2, 1.0, 1.2]), part(G.ico, 0x263a20, [0.35, 0.4, 0.2], [0.8, 0.7, 0.8]), ...[0, 1, 2, 3, 4, 5, 6].map((i) => part(G.sphLo, 0x2a3a8a, [Math.sin(i * 0.9) * 0.5, 0.45 + (i % 3) * 0.17, Math.cos(i * 0.9) * 0.5], [0.15, 0.15, 0.15]))]);
    case 'berry_bush_empty': return merge([part(G.ico, 0x3e4a2e, [0, 0.5, 0], [1.1, 0.9, 1.1])]);
    case 'reeds': return merge([0, 1, 2, 3, 4, 5].map((i) => part(G.cylLo, 0x6a8a4a, [Math.sin(i * 1.7) * 0.25, 0.7, Math.cos(i * 1.7) * 0.25], [0.05, 1.4, 0.05])).concat([part(G.cylLo, 0x5a3a20, [0, 1.35, 0.1], [0.08, 0.3, 0.08])]));
    case 'reeds_picked': return merge([0, 1, 2].map((i) => part(G.cylLo, 0x6a8a4a, [Math.sin(i * 2) * 0.2, 0.15, Math.cos(i * 2) * 0.2], [0.05, 0.3, 0.05])));
    case 'flowers': return merge([0, 1, 2, 3].map((i) => [part(G.cylLo, 0x4a8a3a, [Math.sin(i * 1.6) * 0.25, 0.2, Math.cos(i * 1.6) * 0.25], [0.03, 0.4, 0.03]), part(G.sphLo, [0xf05080, 0xf0d040, 0xa060f0, 0xffffff][i], [Math.sin(i * 1.6) * 0.25, 0.42, Math.cos(i * 1.6) * 0.25], [0.16, 0.1, 0.16])]).flat());
    case 'flint': return merge([part(G.oct, 0x505868, [0, 0.12, 0], [0.3, 0.25, 0.22], [0.3, 0.5, 0])]);
    case 'rocks': return merge([part(G.dode, 0x8a8a88, [0, 0.1, 0], [0.3, 0.2, 0.3]), part(G.dode, 0x7a7a78, [0.25, 0.08, 0.1], [0.2, 0.15, 0.2])]);
    case 'carrot': return merge([part(G.coneLo, 0x4a6a2a, [0, 0.25, 0], [0.25, 0.4, 0.25]), part(G.coneLo, 0xe07a20, [0, 0.05, 0], [0.15, 0.15, 0.15], [Math.PI, 0, 0])]);
    case 'mushroom': return merge([part(G.cylLo, 0xf0e8d8, [0, 0.12, 0], [0.1, 0.24, 0.1]), part(G.sphLo, 0xc03020, [0, 0.26, 0], [0.32, 0.18, 0.32]), part(G.sphLo, 0xffffff, [0.08, 0.32, 0.05], [0.06, 0.04, 0.06])]);
    case 'glowcap': return merge([part(G.cylLo, 0xd0f0f0, [0, 0.35, 0], [0.1, 0.7, 0.1]), part(G.sphLo, 0x80f0ff, [0, 0.72, 0], [0.5, 0.28, 0.5])]);
    case 'glowcap_picked': return merge([part(G.cylLo, 0xa0c0c0, [0, 0.25, 0], [0.1, 0.5, 0.1])]);
    case 'driftwood': return merge([part(G.cylLo, 0xb0a080, [0, 0.12, 0], [0.18, 1.4, 0.18], [0, 0, Math.PI / 2]), part(G.cylLo, 0xa09070, [0.3, 0.1, 0.3], [0.1, 0.6, 0.1], [0.5, 0, Math.PI / 2])]);
    case 'sand': return merge([part(G.sphLo, 0xe8d090, [0, 0, 0], [0.9, 0.25, 0.9])]);
    case 'clay': return merge([part(G.sphLo, 0xb06a40, [0, 0, 0], [0.8, 0.25, 0.7]), part(G.sphLo, 0xa05a30, [0.3, 0.05, 0.2], [0.4, 0.2, 0.4])]);
    case 'cactus': return merge([part(G.cylLo, 0x4a8a4a, [0, 0.8, 0], [0.45, 1.6, 0.45]), part(G.cylLo, 0x4a8a4a, [0.35, 1.0, 0], [0.22, 0.6, 0.22], [0, 0, -1.2]), part(G.cylLo, 0x4a8a4a, [0.55, 1.3, 0], [0.2, 0.5, 0.2]), part(G.sphLo, 0xf070a0, [0, 1.65, 0], [0.2, 0.15, 0.2])]);
    case 'cactus_picked': return merge([part(G.cylLo, 0x4a7a4a, [0, 0.4, 0], [0.4, 0.8, 0.4])]);
    case 'tumbleweed': return merge([part(G.ico, 0xb09060, [0, 0.4, 0], [0.8, 0.8, 0.8]), part(G.ico, 0x9a7a50, [0, 0.4, 0], [0.6, 0.6, 0.6], [0.5, 0.5, 0])]);
    case 'boulder': return merge([part(G.dode, 0x7a766e, [0, 0.55, 0], [1.7, 1.3, 1.5], [0.3, 0.5, 0.1]), part(G.dode, 0x6a665e, [0.55, 0.3, 0.35], [0.9, 0.6, 0.8]), part(G.box, 0x3a3630, [0.1, 0.9, 0.7], [0.05, 0.5, 0.05], [0.4, 0, 0.6])]);
    case 'boulder_gold': return merge([part(G.dode, 0x8a8478, [0, 0.5, 0], [1.6, 1.2, 1.4]), ...[0, 1, 2, 3].map((i) => part(G.oct, 0xf0c030, [Math.sin(i * 1.7) * 0.6, 0.6 + (i % 2) * 0.3, Math.cos(i * 1.7) * 0.55], [0.25, 0.25, 0.25]))]);
    case 'boulder_iron': return merge([part(G.dode, 0x6a6460, [0, 0.5, 0], [1.6, 1.2, 1.4]), ...[0, 1, 2, 3].map((i) => part(G.oct, 0xa05030, [Math.sin(i * 1.7) * 0.6, 0.6 + (i % 2) * 0.3, Math.cos(i * 1.7) * 0.55], [0.25, 0.25, 0.25]))]);
    case 'boulder_copper': return merge([part(G.dode, 0x7a7068, [0, 0.5, 0], [1.6, 1.2, 1.4]), ...[0, 1, 2, 3].map((i) => part(G.oct, 0xe08040, [Math.sin(i * 1.7) * 0.6, 0.6 + (i % 2) * 0.3, Math.cos(i * 1.7) * 0.55], [0.25, 0.25, 0.25]))]);
    case 'boulder_coal': return merge([part(G.dode, 0x4a4a4a, [0, 0.4, 0], [1.4, 1, 1.3]), part(G.dode, 0x202020, [0.4, 0.5, 0.3], [0.6, 0.5, 0.6])]);
    case 'crystal_node': return merge([part(G.oct, 0x80d0ff, [0, 0.8, 0], [0.5, 1.6, 0.5]), part(G.oct, 0xa0a0ff, [0.4, 0.5, 0.2], [0.35, 1, 0.35], [0, 0, -0.4]), part(G.oct, 0x80f0e0, [-0.35, 0.45, -0.2], [0.3, 0.9, 0.3], [0.3, 0, 0.4]), part(G.dode, 0x606070, [0, 0.1, 0], [1, 0.3, 1])]);
    case 'ruin_pillar': return merge([part(G.box, 0x8a8070, [0, 1.4, 0], [0.9, 2.8, 0.9]), part(G.box, 0x7a7060, [0, 2.9, 0], [1.2, 0.3, 1.2]), part(G.box, 0x40c0d0, [0, 1.5, 0.46], [0.3, 0.6, 0.02])]);
    case 'ruin_rubble': return merge([part(G.box, 0x8a8070, [0, 0.2, 0], [0.7, 0.4, 0.6], [0, 0.4, 0.1]), part(G.box, 0x7a7060, [0.5, 0.15, 0.3], [0.5, 0.3, 0.5], [0.2, 1, 0]), part(G.cylLo, 0x9a8a50, [-0.3, 0.1, 0.3], [0.3, 0.1, 0.3], [Math.PI / 2, 0, 0])]);
    case 'bones': return merge([part(G.sphLo, 0xf0ead8, [0, 0.2, 0], [0.35, 0.3, 0.4]), part(G.cylLo, 0xe8e0d0, [0.4, 0.06, 0], [0.06, 0.8, 0.06], [0, 0, Math.PI / 2]), part(G.cylLo, 0xe8e0d0, [0.2, 0.06, 0.4], [0.05, 0.6, 0.05], [Math.PI / 2, 0.5, 0])]);
    case 'rabbit_hole': return merge([part(G.cylLo, 0x5a4030, [0, 0.02, 0], [0.8, 0.05, 0.8]), part(G.cylLo, 0x201510, [0, 0.04, 0], [0.45, 0.05, 0.45])]);
    case 'spider_den': return merge([part(G.sphLo, 0xe8e8e8, [0, 0.8, 0], [2.2, 1.6, 2.2]), part(G.sphLo, 0xd0d0d0, [0.6, 1.4, 0.3], [1.2, 1.2, 1.2]), part(G.cylLo, 0x101010, [0, 0.4, 1.0], [0.4, 0.3, 0.2], [Math.PI / 2, 0, 0])]);
    case 'merm_hut': return merge([part(G.cylLo, 0x6a5a40, [0, 0.6, 0], [2, 1.2, 2]), part(G.coneLo, 0x5a7a40, [0, 1.8, 0], [2.6, 1.4, 2.6]), part(G.box, 0x201810, [0, 0.5, 1.0], [0.6, 0.9, 0.05])]);
    case 'gobbler_nest': return merge([part(G.tor, 0x8a6a40, [0, 0.2, 0], [1, 1, 1], [Math.PI / 2, 0, 0]), part(G.sphLo, 0xf0f0e0, [0, 0.2, 0], [0.25, 0.3, 0.25])]);
    case 'scorpion_burrow': return merge([part(G.sphLo, 0xc09a60, [0, 0, 0], [1.4, 0.5, 1.4]), part(G.cylLo, 0x302010, [0, 0.2, 0], [0.4, 0.1, 0.4])]);
    case 'bat_cave': return merge([part(G.dode, 0x4a4450, [0, 0.9, 0], [2.6, 2, 2.4]), part(G.sphLo, 0x0a0808, [0, 0.6, 1.0], [1.1, 1, 0.5])]);
    case 'crab_den': return merge([part(G.dode, 0x7a7a80, [0, 0.4, 0], [1.4, 0.9, 1.2]), part(G.sphLo, 0x2a2020, [0, 0.25, 0.55], [0.5, 0.4, 0.3])]);
    case 'mole_hill': return merge([part(G.sphLo, 0x6a5030, [0, 0, 0], [1, 0.6, 1]), part(G.cylLo, 0x201510, [0, 0.28, 0], [0.25, 0.05, 0.25])]);
    case 'guardian_spawn': return merge([part(G.box, 0x7a7060, [0, 0.4, 0], [1.4, 0.8, 1.4]), part(G.tor, 0x40d0e0, [0, 0.82, 0], [0.8, 0.8, 0.8], [Math.PI / 2, 0, 0])]);
    case 'pig_house': return merge([part(G.box, 0xc0a070, [0, 1, 0], [2.4, 2, 2.4]), part(G.coneLo, 0x8a3020, [0, 2.8, 0], [3.6, 1.8, 3.6]), part(G.box, 0x5a3a20, [0, 0.7, 1.21], [0.7, 1.3, 0.05]), part(G.box, 0xf0e080, [0.8, 1.3, 1.21], [0.4, 0.4, 0.05])]);
    case 'chicken_coop': return merge([part(G.tor, 0xb09060, [0, 0.15, 0], [0.8, 0.8, 0.8], [Math.PI / 2, 0, 0]), part(G.sphLo, 0xf0ead0, [0.1, 0.18, 0], [0.2, 0.25, 0.2]), part(G.sphLo, 0xf0ead0, [-0.15, 0.18, 0.1], [0.2, 0.25, 0.2])]);
    case 'portal': {
      const p: THREE.BufferGeometry[] = [];
      for (let k = 0; k <= 12; k++) {
        const a = Math.PI * (k / 12);
        const x = -Math.cos(a) * 2.3, y = Math.sin(a) * 3.6 + 0.4;
        p.push(part(G.dode, k % 2 ? 0x5a5a5e : 0x4a4a50, [x, y, 0], [0.95 - Math.sin(a) * 0.25, 0.8, 0.9], [k, k * 0.7, 0]));
        if (k % 3 === 0) p.push(part(G.coneLo, 0x3a3a3e, [x * 1.15, y + 0.3, 0], [0.25, 0.7, 0.25], [0, 0, -x * 0.25]));
      }
      p.push(part(G.cylLo, 0x55535a, [0, 0.12, 0], [6.4, 0.25, 4]));
      p.push(part(G.box, 0x40d0a0, [0, 3.95, 0.42], [0.6, 0.3, 0.05]));
      for (let k = 0; k < 5; k++) p.push(part(G.dode, 0x4e4c52, [Math.sin(k * 1.3) * 2.8, 0.3, Math.cos(k * 1.3) * 1.6], [0.5, 0.4, 0.5]));
      return merge(p);
    }
    case 'stone_circle': return merge([0, 1, 2, 3, 4, 5].map((i) => part(G.box, 0x7a7a80, [Math.sin((i / 6) * Math.PI * 2) * 3, 1, Math.cos((i / 6) * Math.PI * 2) * 3], [0.6, 2, 0.4], [0, (i / 6) * Math.PI * 2, 0])).concat([part(G.cylLo, 0x6a6a70, [0, 0.05, 0], [2.4, 0.1, 2.4])]));
    case 'shrine': return merge([part(G.box, 0x9a9080, [0, 0.4, 0], [1.4, 0.8, 1]), part(G.box, 0x8a8070, [0, 1.2, 0], [0.9, 0.8, 0.7]), part(G.coneLo, 0x6a3020, [0, 1.9, 0], [1.4, 0.7, 1.2], [0, Math.PI / 4, 0]), part(G.sphLo, 0xf0d060, [0, 1.25, 0.36], [0.25, 0.25, 0.1])]);
    case 'camp_chest': return merge([part(G.box, 0x7a5030, [0, 0.35, 0], [1, 0.7, 0.7]), part(G.box, 0xd0a030, [0, 0.4, 0.36], [0.2, 0.2, 0.02]), part(G.box, 0x6a4020, [0, 0.75, 0], [1.05, 0.12, 0.75])]);
    case 'camp_chest_open': return merge([part(G.box, 0x6a4a30, [0, 0.35, 0], [1, 0.7, 0.7]), part(G.box, 0x6a4020, [0, 0.95, -0.3], [1.05, 0.6, 0.1], [-0.5, 0, 0])]);
    case 'wreck': return merge([part(G.box, 0x6a5038, [0, 0.4, 0], [4, 0.8, 1.6], [0, 0, 0.2]), part(G.cylLo, 0x5a4030, [0.5, 1.8, 0], [0.15, 3, 0.15], [0, 0, 0.6]), part(G.box, 0xd0c8b0, [1.2, 2.2, 0], [0.05, 1.2, 1], [0, 0, 0.6])]);
    case 'note': return merge([part(G.box, 0xf0ead0, [0, 0.05, 0], [0.5, 0.02, 0.6], [0, 0.3, 0.05]), part(G.dode, 0x7a7a78, [0.2, 0.08, 0.2], [0.15, 0.12, 0.15])]);
    case 'ancient_core': return merge([
      part(G.cylLo, 0x5a5048, [0, 0.4, 0], [6, 0.8, 6]), part(G.box, 0x6a6058, [0, 1.6, 0], [2.4, 2.4, 2.4]), part(G.oct, 0x40e0ff, [0, 3.6, 0], [1.6, 2.4, 1.6]),
      ...[0, 1, 2, 3].map((i) => part(G.box, 0x7a7060, [Math.sin(i * Math.PI / 2 + 0.78) * 2.6, 1.8, Math.cos(i * Math.PI / 2 + 0.78) * 2.6], [0.6, 3.6, 0.6])),
    ]);
    case 'queen_nest': return merge([part(G.sphLo, 0xf0f0f0, [0, 1.5, 0], [4.5, 3, 4.5]), part(G.sphLo, 0xe0e0e0, [1.4, 2.6, 0.6], [2, 2, 2]), part(G.sphLo, 0xe0e0e8, [-1.2, 2.2, -0.8], [2, 1.8, 2]), part(G.cylLo, 0x101010, [0, 0.7, 2.1], [1, 0.7, 0.3], [Math.PI / 2, 0, 0])]);
    case 'storm_nest': return merge([part(G.tor, 0x7a6040, [0, 0.5, 0], [3.4, 3.4, 3.4], [Math.PI / 2, 0, 0]), part(G.sphLo, 0xf0e8a0, [0, 0.6, 0], [0.8, 1, 0.8]), part(G.sphLo, 0xf0e8a0, [0.7, 0.5, 0.3], [0.7, 0.9, 0.7])]);
    case 'titan_lair': return merge([part(G.cylLo, 0xd0a060, [0, 0.02, 0], [8, 0.06, 8]), part(G.cylLo, 0xb08040, [0, 0.04, 0], [5, 0.06, 5]), part(G.cylLo, 0x906030, [0, 0.06, 0], [2, 0.06, 2])]);
    case 'mole_mound': return merge([part(G.sphLo, 0x6a5030, [0, 0, 0], [6, 3, 6]), part(G.dode, 0x7a7a7a, [1.5, 1.2, 1], [1, 0.8, 1]), part(G.cylLo, 0x201510, [0, 1.45, 0], [1, 0.1, 1])]);
    case 'village_fire': return merge([...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => part(G.dode, 0x7a7a7a, [Math.sin(i * 0.785) * 1, 0.15, Math.cos(i * 0.785) * 1], [0.4, 0.3, 0.4])), part(G.cylLo, 0x5a3a20, [0, 0.15, 0], [0.15, 1.2, 0.15], [0, 0, Math.PI / 2]), part(G.coneLo, 0xff9030, [0, 0.6, 0], [0.8, 1, 0.8])]);
    case 'tentacle_spot': return merge([part(G.cylLo, 0x2a3a2a, [0, 0.02, 0], [1.6, 0.04, 1.6]), part(G.sphLo, 0x4a5a4a, [0.2, 0.05, 0.3], [0.2, 0.1, 0.2])]);
    case 'beefalo_herd': return null;
    case 'deco_tuft': return merge([0, 1, 2].map((i) => part(G.coneLo, 0x4a4a22, [Math.sin(i * 2.1) * 0.08, 0.15, Math.cos(i * 2.1) * 0.08], [0.06, 0.35, 0.06], [Math.sin(i) * 0.5, 0, Math.cos(i) * 0.5])));
    case 'deco_pebble': return merge([part(G.dode, 0x5a564e, [0, 0.03, 0], [0.22, 0.12, 0.18]), part(G.dode, 0x4e4a44, [0.18, 0.02, 0.1], [0.12, 0.08, 0.12])]);
    case 'deco_twig': return merge([part(G.cylLo, 0x3a2a1a, [0, 0.03, 0], [0.03, 0.6, 0.03], [0, 0.4, Math.PI / 2]), part(G.cylLo, 0x3a2a1a, [0.1, 0.03, 0.12], [0.02, 0.3, 0.02], [0, 1.4, Math.PI / 2])]);
    case 'deco_skull': return merge([part(G.sphLo, 0xd0c8b0, [0, 0.1, 0], [0.22, 0.18, 0.26]), part(G.sphLo, 0x1a1612, [0.05, 0.12, 0.11], [0.05, 0.05, 0.03]), part(G.sphLo, 0x1a1612, [-0.05, 0.12, 0.11], [0.05, 0.05, 0.03])]);
  }
  return merge([part(G.box, 0xff00ff, [0, 0.3, 0], [0.6, 0.6, 0.6])]);
}

// =====================================================================
// Postacie graczy
// =====================================================================
export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  legs: THREE.Object3D[];
  wings?: THREE.Object3D[];
  tail?: THREE.Object3D;
  hand?: THREE.Group;
  headTop?: THREE.Group;
  back?: THREE.Group;
  bodyMesh?: THREE.Mesh;
  kind: string;
  height: number;
  segs?: THREE.Object3D[];
  ghost?: THREE.Group;
  normal?: THREE.Group;
  wolf?: Rig;
  outlines?: THREE.Mesh[];
}

function addOutline(m: THREE.Mesh, rig: Rig, scale = 1.07) {
  const o = new THREE.Mesh(m.geometry, outlineMat);
  o.scale.setScalar(scale);
  m.add(o);
  (rig.outlines = rig.outlines || []).push(o);
}

export const SKIN_TINTS = [0, 0x2a3a5a, 0x5a1a2a];

export function makeCharacter(c: CharDef, skin = 0): Rig {
  // Styl "mrocznej bajki": wielka blada głowa, czarne oczy, cienkie kończyny, ciemne ubranie.
  const root = new THREE.Group();
  const normal = new THREE.Group();
  root.add(normal);
  const body = new THREE.Group();
  normal.add(body);
  const cloth = skin ? SKIN_TINTS[skin] || c.cloth : c.cloth;
  const ink = 0x16120e;
  const rig: Rig = { root, body, legs: [], kind: 'char', height: 2.3, normal };
  // tułów – wąski, lekko trapezowy
  const torso = mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.72, 8), cloth, [0, 1.12, 0]);
  addOutline(torso, rig, 1.1);
  body.add(torso);
  rig.bodyMesh = torso;
  body.add(mesh(G.cyl, c.cloth2, [0, 0.8, 0], [0.62, 0.14, 0.5]));            // pas/spódnica kurtki
  body.add(mesh(G.cone, c.cloth2, [0, 1.42, 0.08], [0.46, 0.18, 0.3], [0.2, 0, 0])); // kołnierz
  body.add(mesh(G.cylLo, c.skin, [0, 1.52, 0], [0.12, 0.18, 0.12]));          // szyja
  const head = new THREE.Group();
  head.position.set(0, 1.92, 0);
  body.add(head);
  rig.head = head;
  const hm = mesh(G.sph, c.skin, [0, 0, 0], [1.0, 0.94, 0.88]);
  addOutline(hm, rig, 1.06);
  head.add(hm);
  // duże czarne oczy, bez białek
  head.add(mesh(G.sphLo, ink, [0.16, 0.06, 0.4], [0.14, 0.22, 0.06], [-0.25, 0.3, 0]));
  head.add(mesh(G.sphLo, ink, [-0.16, 0.06, 0.4], [0.14, 0.22, 0.06], [-0.25, -0.3, 0]));
  head.add(mesh(G.box, ink, [0, -0.22, 0.41], [0.12, 0.025, 0.02]));          // usta
  head.add(mesh(G.coneLo, c.skin, [0, -0.08, 0.45], [0.05, 0.09, 0.05], [1.5, 0, 0])); // nosek
  // włosy – nastroszone kolce
  const spikes = (n: number, h: number, spread: number, y = 0.3) => {
    // gęsta czupryna na czubku i z tyłu głowy + nastroszone kolce (twarz zostaje odsłonięta)
    head.add(mesh(G.sph, c.hair, [0, 0.2, -0.06], [1.04, 0.72, 0.98]));
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.55 + (i / Math.max(1, n - 1)) * Math.PI * 0.9; // tylko z tyłu i po bokach
      const dx = Math.sin(a), dz = Math.cos(a);
      head.add(mesh(G.coneLo, c.hair, [dx * spread, y + 0.1, dz * spread], [0.26, h, 0.26], [dz * 0.9, 0, -dx * 0.9]));
    }
    for (let i = 0; i < 3; i++) head.add(mesh(G.coneLo, c.hair, [(i - 1) * 0.18, y + 0.28, -0.02 - Math.abs(i - 1) * 0.08], [0.28, h * 1.25, 0.28], [-0.25, 0, (1 - i) * 0.35]));
  };
  switch (c.feature) {
    case 'beard':
      spikes(6, 0.5, 0.36);
      head.add(mesh(G.cone, c.hair, [0, -0.38, 0.22], [0.62, 0.62, 0.36], [Math.PI + 0.35, 0, 0]));
      head.add(mesh(G.box, c.hair, [0, -0.13, 0.42], [0.3, 0.06, 0.06]));   // wąsy
      break;
    case 'hood':
      head.add(mesh(G.sph, c.hair, [0, 0.16, -0.14], [0.95, 0.6, 0.78]));
      head.add(mesh(G.cone, c.cloth, [0, 0.36, -0.15], [1.05, 1.05, 1.05], [-0.35, 0, 0]));
      head.add(mesh(G.coneLo, c.cloth, [0, 0.95, -0.55], [0.18, 0.5, 0.18], [-1.1, 0, 0]));
      break;
    case 'helmet':
      head.add(mesh(G.sph, 0x4a4c3c, [0, 0.18, 0], [1.02, 0.6, 0.96]));
      head.add(mesh(G.cyl, 0x4a4c3c, [0, 0.12, 0.02], [1.12, 0.05, 1.05]));
      head.add(mesh(G.box, 0x7a2a22, [0.24, -0.08, 0.39], [0.03, 0.26, 0.02], [0, 0, 0.35])); // blizna
      break;
    case 'lantern':
      spikes(4, 0.3, 0.36, 0.2);
      head.add(mesh(G.cylLo, c.hair, [0, -0.35, -0.45], [0.14, 0.7, 0.14], [0.45, 0, 0])); // warkocz
      head.add(mesh(G.sphLo, c.hair, [0, -0.7, -0.6], [0.16, 0.16, 0.16]));
      break;
    case 'goggles':
      spikes(5, 0.35, 0.36);
      head.add(mesh(G.cyl, 0x3a2a18, [0, 0.24, 0], [1.02, 0.08, 0.92]));
      for (const sx of [0.17, -0.17]) {
        head.add(mesh(G.tor, 0x5a4020, [sx, 0.26, 0.38], [0.22, 0.22, 0.3]));
        head.add(mesh(G.cyl, 0xb0a070, [sx, 0.26, 0.4], [0.16, 0.02, 0.16], [Math.PI / 2, 0, 0], { emissive: 0x201808 }));
      }
      break;
    case 'ears':
      spikes(8, 0.6, 0.38);
      head.add(mesh(G.cone, c.hair, [0.3, 0.5, 0], [0.2, 0.42, 0.12], [0, 0, -0.35]));
      head.add(mesh(G.cone, c.hair, [-0.3, 0.5, 0], [0.2, 0.42, 0.12], [0, 0, 0.35]));
      break;
  }
  if (c.feature === 'lantern') {
    body.add(mesh(G.cylLo, 0x2a2420, [0.3, 0.95, 0.15], [0.03, 0.15, 0.03]));
    body.add(mesh(G.box, 0xffd070, [0.3, 0.82, 0.15], [0.14, 0.18, 0.14], [0, 0, 0], { emissive: 0xff9010 }));
  }
  rig.headTop = new THREE.Group();
  rig.headTop.position.set(0, 0.3, 0);
  head.add(rig.headTop);
  const mkArm = (side: number) => {
    const a = new THREE.Group();
    a.position.set(side * 0.27, 1.42, 0);
    a.add(mesh(G.cylLo, cloth, [0, -0.3, 0], [0.11, 0.6, 0.11]));
    a.add(mesh(G.sphLo, c.skin, [0, -0.64, 0], [0.13, 0.13, 0.13]));
    body.add(a);
    return a;
  };
  rig.armL = mkArm(1);
  rig.armR = mkArm(-1);
  rig.hand = new THREE.Group();
  rig.hand.position.set(0, -0.66, 0.05);
  rig.armR.add(rig.hand);
  rig.back = new THREE.Group();
  rig.back.position.set(0, 1.12, -0.3);
  body.add(rig.back);
  for (const side of [1, -1]) {
    const l = new THREE.Group();
    l.position.set(side * 0.11, 0.78, 0);
    l.add(mesh(G.cylLo, c.cloth2, [0, -0.36, 0], [0.13, 0.72, 0.13]));
    l.add(mesh(G.box, ink, [0, -0.74, 0.08], [0.16, 0.1, 0.34]));
    normal.add(l);
    rig.legs.push(l);
  }
  // duch
  const ghost = new THREE.Group();
  const gm = toon(0xd8dde8, { opacity: 0.6, emissive: 0x1a2030 });
  const gb = new THREE.Mesh(G.cone, gm); gb.scale.set(0.9, 1.5, 0.9); gb.position.y = 1.05; gb.rotation.x = Math.PI; ghost.add(gb);
  const gh = new THREE.Mesh(G.sph, gm); gh.scale.setScalar(0.95); gh.position.y = 1.85; ghost.add(gh);
  ghost.add(mesh(G.sphLo, ink, [0.15, 1.88, 0.4], [0.11, 0.17, 0.05]));
  ghost.add(mesh(G.sphLo, ink, [-0.15, 1.88, 0.4], [0.11, 0.17, 0.05]));
  ghost.add(mesh(G.sphLo, ink, [0, 1.65, 0.42], [0.1, 0.12, 0.04]));
  ghost.visible = false;
  root.add(ghost);
  rig.ghost = ghost;
  if (c.werewolf) {
    const wolf = makeMobRig({ model: 'quad', color: 0x5a2a14, color2: 0x1a120c, scale: 1.1, id: 'wolf' } as any);
    wolf.root.visible = false;
    root.add(wolf.root);
    rig.wolf = wolf;
  }
  return rig;
}

// Wyposażenie widoczne na modelu
export function itemModel(id: string): THREE.Object3D | null {
  const g = new THREE.Group();
  const stick = (len = 0.9, c = 0x7a5a3a) => mesh(G.cylLo, c, [0, -len / 2 + 0.2, 0], [0.06, len, 0.06]);
  switch (id) {
    case 'axe': case 'axe_iron':
      g.add(stick()); g.add(mesh(G.box, id === 'axe' ? 0x505868 : 0xb0b8c0, [0.12, 0.15, 0], [0.26, 0.2, 0.05])); break;
    case 'pickaxe': case 'pickaxe_iron': case 'multitool':
      g.add(stick()); g.add(mesh(G.box, id === 'multitool' ? 0xf0c040 : id === 'pickaxe' ? 0x505868 : 0xb0b8c0, [0, 0.18, 0], [0.6, 0.08, 0.08], [0, 0, 0.2])); break;
    case 'shovel': g.add(stick(1.1)); g.add(mesh(G.box, 0x8a8a90, [0, -0.45, 0], [0.22, 0.3, 0.03])); break;
    case 'hammer': g.add(stick(0.7)); g.add(mesh(G.box, 0x6a6a70, [0, 0.18, 0], [0.32, 0.16, 0.16])); break;
    case 'rod': g.add(mesh(G.cylLo, 0x9a7a4a, [0, 0.5, 0.2], [0.04, 1.6, 0.04], [0.5, 0, 0])); break;
    case 'torch': {
      g.add(stick(0.7));
      const f = mesh(G.cone, 0xffa020, [0, 0.35, 0], [0.18, 0.35, 0.18], [0, 0, 0], { emissive: 0xff6a00 });
      f.name = 'flame'; g.add(f); break;
    }
    case 'lantern': g.add(mesh(G.box, 0xffe080, [0, -0.15, 0.1], [0.2, 0.26, 0.2], [0, 0, 0], { emissive: 0xffb030 })); break;
    case 'umbrella': g.add(stick(1.2)); g.add(mesh(G.cone, 0x4060a0, [0, 0.55, 0], [1.4, 0.35, 1.4])); break;
    case 'spear': g.add(stick(1.6)); g.add(mesh(G.cone, 0x707880, [0, 0.62, 0], [0.1, 0.25, 0.1])); break;
    case 'sword': case 'shadow_sword': case 'ancient_sword':
      g.add(mesh(G.box, id === 'sword' ? 0xc0c8d0 : id === 'shadow_sword' ? 0x302040 : 0x40e0f0, [0, 0.35, 0], [0.08, 0.8, 0.03], [0, 0, 0], id !== 'sword' ? { emissive: id === 'shadow_sword' ? 0x301050 : 0x105060 } : {}));
      g.add(mesh(G.box, 0x6a4a20, [0, -0.08, 0], [0.3, 0.06, 0.08])); g.add(stick(0.25, 0x3a2a1a)); break;
    case 'tentacle_spike': g.add(mesh(G.cone, 0x6a3a6a, [0, 0.3, 0], [0.16, 0.8, 0.16])); break;
    case 'slingshot': g.add(mesh(G.cylLo, 0x7a5a3a, [0, 0, 0], [0.05, 0.4, 0.05])); g.add(mesh(G.box, 0x7a5a3a, [0, 0.2, 0], [0.3, 0.05, 0.05])); break;
    case 'bow': case 'crossbow': g.add(mesh(G.tor, 0x7a5a3a, [0, 0.1, 0], [0.6, 1.1, 0.6], [0, Math.PI / 2, 0])); break;
    case 'ice_staff': case 'fire_staff': case 'storm_staff':
      g.add(stick(1.5, 0x5a4030));
      g.add(mesh(G.oct, id === 'ice_staff' ? 0x80e0ff : id === 'fire_staff' ? 0xff5020 : 0xf0f060, [0, 0.62, 0], [0.22, 0.32, 0.22], [0, 0, 0], { emissive: id === 'ice_staff' ? 0x205070 : id === 'fire_staff' ? 0x802000 : 0x606000 })); break;
    // głowa
    case 'helmet_leather': g.add(mesh(G.sph, 0x7a5030, [0, 0, 0], [0.86, 0.5, 0.84])); break;
    case 'helmet_iron': g.add(mesh(G.sph, 0xa0a8b0, [0, 0, 0], [0.88, 0.52, 0.86])); g.add(mesh(G.box, 0xa0a8b0, [0, -0.05, 0.36], [0.08, 0.3, 0.05])); break;
    case 'crab_shield': g.add(mesh(G.sph, 0xd04a30, [0, 0, 0], [0.9, 0.5, 0.9])); break;
    case 'straw_hat': g.add(mesh(G.cyl, 0xe0c070, [0, 0, 0], [1.3, 0.05, 1.3])); g.add(mesh(G.cyl, 0xd8b860, [0, 0.12, 0], [0.6, 0.25, 0.6])); break;
    case 'winter_hat': g.add(mesh(G.sph, 0xc03030, [0, 0.02, 0], [0.86, 0.5, 0.84])); g.add(mesh(G.sphLo, 0xffffff, [0, 0.3, 0], [0.22, 0.22, 0.22])); break;
    case 'garland': g.add(mesh(G.tor, 0xf070a0, [0, -0.02, 0], [0.72, 0.72, 0.9], [Math.PI / 2, 0, 0])); break;
    case 'goggles': g.add(mesh(G.tor, 0x6a4a20, [0.14, -0.05, 0.3], [0.2, 0.2, 0.3])); g.add(mesh(G.tor, 0x6a4a20, [-0.14, -0.05, 0.3], [0.2, 0.2, 0.3])); break;
    // plecy
    case 'backpack': g.add(mesh(G.box, 0x8a6a40, [0, 0, 0], [0.5, 0.6, 0.3])); break;
    case 'big_backpack': g.add(mesh(G.box, 0x6a4020, [0, 0.05, -0.05], [0.6, 0.8, 0.4])); break;
    case 'wing_pack': g.add(mesh(G.box, 0x402030, [0.4, 0.2, 0], [0.7, 0.05, 0.5], [0, 0, 0.4])); g.add(mesh(G.box, 0x402030, [-0.4, 0.2, 0], [0.7, 0.05, 0.5], [0, 0, -0.4])); break;
    default: return null;
  }
  return g;
}

export const ARMOR_COLORS: Record<string, number> = {
  armor_wood: 0x8a6a3a, armor_scale: 0x5a8a7a, armor_crystal: 0x90d0ff, armor_shadow: 0x302040, armor_ancient: 0x40c0d0,
  fur_coat: 0x7a5a3a, raincoat: 0xe0c030, summer_vest: 0xe0e0c0,
};

// =====================================================================
// Stworzenia
// =====================================================================
export function makeMobRig(def: MobDef): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const c = def.color, c2 = def.color2 ?? 0x222222;
  const rig: Rig = { root, body, legs: [], kind: def.model, height: 1.2 };
  const eyeC = def.boss || ['hound', 'shade', 'guardian', 'core_guardian', 'frostdeer'].includes(def.id) ? 0xff3020 : 0x111111;
  const eyeE = def.boss || ['hound', 'shade'].includes(def.id) ? 0xaa1000 : 0;
  const eyes = (parent: THREE.Object3D, y: number, z: number, sp: number, s = 0.08, col = eyeC, em = eyeE) => {
    parent.add(mesh(G.sphLo, col, [sp, y, z], [s, s, s], [0, 0, 0], em ? { emissive: em } : {}));
    parent.add(mesh(G.sphLo, col, [-sp, y, z], [s, s, s], [0, 0, 0], em ? { emissive: em } : {}));
  };
  const leg = (x: number, z: number, len: number, r: number, col = c2, y = len) => {
    const l = new THREE.Group();
    l.position.set(x, y, z);
    l.add(mesh(G.cylLo, col, [0, -len / 2, 0], [r, len, r]));
    body.add(l);
    rig.legs.push(l);
    return l;
  };
  switch (def.model) {
    case 'rabbit': {
      body.add(mesh(G.sph, c, [0, 0.35, 0], [0.55, 0.5, 0.75]));
      const h = new THREE.Group(); h.position.set(0, 0.6, 0.35); body.add(h); rig.head = h;
      h.add(mesh(G.sph, c, [0, 0, 0], [0.42, 0.4, 0.42]));
      h.add(mesh(G.box, c, [0.1, 0.32, -0.05], [0.08, 0.4, 0.06], [0.2, 0, 0.1]));
      h.add(mesh(G.box, c, [-0.1, 0.32, -0.05], [0.08, 0.4, 0.06], [0.2, 0, -0.1]));
      h.add(mesh(G.cone, 0xf0e0c0, [0, 0.12, 0.18], [0.06, 0.2, 0.06], [0.6, 0, 0]));
      eyes(h, 0.05, 0.18, 0.1, 0.06);
      body.add(mesh(G.sphLo, c2, [0, 0.4, -0.4], [0.2, 0.2, 0.2]));
      leg(0.15, 0.25, 0.2, 0.1); leg(-0.15, 0.25, 0.2, 0.1); leg(0.15, -0.25, 0.2, 0.12); leg(-0.15, -0.25, 0.2, 0.12);
      rig.height = 0.9;
      break;
    }
    case 'quad': case 'deer': {
      const deer = def.model === 'deer';
      const legLen = deer ? 1.0 : 0.6;
      const bm = mesh(G.sph, c, [0, legLen + 0.35, 0], [0.9, 0.75, 1.45]);
      body.add(bm);
      rig.bodyMesh = bm;
      if (def.id === 'beefalo') body.add(mesh(G.sph, c2, [0, legLen + 0.55, 0.3], [1.05, 0.85, 1.0]));
      const h = new THREE.Group(); h.position.set(0, legLen + 0.6, 0.75); body.add(h); rig.head = h;
      h.add(mesh(G.sph, deer ? c : def.id === 'beefalo' ? c2 : c, [0, 0, 0.12], [0.55, 0.5, 0.7]));
      h.add(mesh(G.box, def.id === 'beefalo' ? 0x3a2a20 : c, [0, -0.08, 0.45], [0.3, 0.22, 0.25]));
      eyes(h, 0.08, 0.38, 0.16, 0.07);
      if (def.id === 'beefalo') {
        h.add(mesh(G.cone, 0xe8e0c8, [0.32, 0.18, 0.1], [0.1, 0.4, 0.1], [0, 0, -1.2]));
        h.add(mesh(G.cone, 0xe8e0c8, [-0.32, 0.18, 0.1], [0.1, 0.4, 0.1], [0, 0, 1.2]));
      } else if (deer) {
        for (const s of [1, -1]) {
          h.add(mesh(G.cylLo, c2, [s * 0.2, 0.45, 0], [0.06, 0.7, 0.06], [0, 0, -s * 0.4], { emissive: 0x204060 }));
          h.add(mesh(G.cylLo, c2, [s * 0.38, 0.7, 0.05], [0.05, 0.4, 0.05], [0, 0, -s * 1.0], { emissive: 0x204060 }));
          h.add(mesh(G.oct, 0x80e0ff, [s * 0.3, 0.95, 0], [0.12, 0.25, 0.12], [0, 0, 0], { emissive: 0x3080c0 }));
        }
      } else {
        h.add(mesh(G.cone, c, [0.18, 0.28, -0.05], [0.12, 0.25, 0.08]));
        h.add(mesh(G.cone, c, [-0.18, 0.28, -0.05], [0.12, 0.25, 0.08]));
      }
      const t = new THREE.Group(); t.position.set(0, legLen + 0.5, -0.7); body.add(t); rig.tail = t;
      t.add(mesh(G.cone, c2, [0, 0, -0.2], [0.12, 0.5, 0.12], [-1.2, 0, 0]));
      const lr = deer ? 0.1 : def.id === 'beefalo' ? 0.2 : 0.12;
      leg(0.3, 0.45, legLen, lr); leg(-0.3, 0.45, legLen, lr); leg(0.3, -0.45, legLen, lr); leg(-0.3, -0.45, legLen, lr);
      rig.height = legLen + 1.2;
      break;
    }
    case 'spider': {
      body.add(mesh(G.sph, c, [0, 0.55, -0.45], [1.0, 0.85, 1.1]));
      body.add(mesh(G.sphLo, c2, [0, 0.8, -0.5], [0.3, 0.12, 0.4]));
      const h = new THREE.Group(); h.position.set(0, 0.5, 0.25); body.add(h); rig.head = h;
      h.add(mesh(G.sph, c, [0, 0, 0], [0.6, 0.5, 0.55]));
      eyes(h, 0.1, 0.26, 0.12, 0.07, 0xff2020, 0x800000);
      eyes(h, 0.18, 0.22, 0.06, 0.05, 0xff2020, 0x800000);
      if (def.boss) h.add(mesh(G.cylLo, 0xf0d040, [0, 0.35, 0], [0.35, 0.18, 0.35], [0, 0, 0], { emissive: 0x403000 }));
      for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
        const l = new THREE.Group();
        l.position.set(s * 0.25, 0.55, 0.2 - i * 0.22);
        const seg = mesh(G.cylLo, c, [s * 0.35, 0.05, 0], [0.06, 0.8, 0.06], [0, 0, s * 1.1]);
        l.add(seg);
        l.add(mesh(G.cylLo, c, [s * 0.72, -0.3, 0], [0.05, 0.7, 0.05], [0, 0, -s * 0.3]));
        l.rotation.y = s * (i - 1.5) * 0.35;
        body.add(l);
        rig.legs.push(l);
      }
      rig.height = 1.2;
      break;
    }
    case 'golem': case 'guardian': if (def.id === 'treeguard') {
      // chodzące drzewo: pień-tułów, korzenie-nogi, gałęzie-ręce, korona
      const trunk = mesh(new THREE.CylinderGeometry(0.45, 0.65, 2.2, 8, 3), c, [0, 1.9, 0]);
      body.add(trunk); rig.bodyMesh = trunk;
      for (let k = 0; k < 5; k++) body.add(mesh(G.ico, k % 2 ? def.color2! : 0x24402a, [Math.sin(k * 1.3) * 0.7, 3.3 + (k % 2) * 0.4, Math.cos(k * 1.3) * 0.6 - 0.1], [1.3, 1.0, 1.3]));
      const h = new THREE.Group(); h.position.set(0, 2.3, 0.45); body.add(h); rig.head = h;
      eyes(h, 0, 0.05, 0.18, 0.12, 0xe8d040, 0x806000);
      h.add(mesh(G.box, 0x1a120a, [0, -0.35, 0.05], [0.4, 0.12, 0.05]));
      const mk = (sd: number) => {
        const a = new THREE.Group(); a.position.set(sd * 0.55, 2.5, 0);
        a.add(mesh(G.cylLo, c, [sd * 0.2, -0.6, 0], [0.22, 1.3, 0.22], [0, 0, sd * 0.3]));
        a.add(mesh(G.cylLo, c, [sd * 0.45, -1.2, 0.1], [0.12, 0.6, 0.12], [0.4, 0, sd * 0.9]));
        a.add(mesh(G.cylLo, c, [sd * 0.25, -1.3, -0.1], [0.1, 0.5, 0.1], [-0.4, 0, -sd * 0.4]));
        body.add(a); return a;
      };
      rig.armL = mk(1); rig.armR = mk(-1);
      for (const sd of [1, -1]) {
        const l = new THREE.Group(); l.position.set(sd * 0.35, 0.9, 0);
        l.add(mesh(G.coneLo, c, [0, -0.45, 0], [0.45, 1.0, 0.45], [Math.PI, 0, 0]));
        l.add(mesh(G.cylLo, c, [sd * 0.3, -0.85, 0.2], [0.12, 0.6, 0.12], [0.5, 0, sd * 1.2]));
        body.add(l); rig.legs.push(l);
      }
      rig.height = 4.2;
      break;
    } else {
      // golemy z poskładanych kamieni / metalu z ruin
      const stone = def.id === 'golem' ? c : c;
      const torso = mesh(G.dode, stone, [0, 1.35, 0], [1.3, 1.25, 1.0]);
      body.add(torso); rig.bodyMesh = torso;
      body.add(mesh(G.dode, c2, [0, 1.0, 0.05], [0.9, 0.5, 0.8]));
      if (def.model === 'guardian' || def.id === 'guardian') {
        body.add(mesh(G.oct, def.color2!, [0, 1.45, 0.48], [0.35, 0.45, 0.12], [0, 0, 0], { emissive: 0x20a0b0 }));
        for (const sd of [1, -1]) body.add(mesh(G.oct, 0x40f0ff, [sd * 0.6, 2.2, -0.2], [0.25, 0.7, 0.25], [0, 0, sd * 0.4], { emissive: 0x2090a0 }));
      }
      if (def.id === 'golem') body.add(mesh(G.ico, 0x4a6a3a, [0.2, 2.0, -0.1], [0.6, 0.3, 0.6]));
      const h = new THREE.Group(); h.position.set(0, 2.2, 0.05); body.add(h); rig.head = h;
      h.add(mesh(G.dode, stone, [0, 0, 0], [0.7, 0.6, 0.65]));
      eyes(h, 0.05, 0.3, 0.15, 0.09, 0x40f0ff, 0x20a0b0);
      const mk = (sd: number) => {
        const a = new THREE.Group(); a.position.set(sd * 0.8, 1.85, 0);
        a.add(mesh(G.dode, c2, [0, -0.25, 0], [0.5, 0.55, 0.5]));
        a.add(mesh(G.dode, stone, [0, -0.8, 0.05], [0.45, 0.6, 0.45]));
        a.add(mesh(G.dode, c2, [0, -1.25, 0.1], [0.55, 0.45, 0.55]));
        body.add(a); return a;
      };
      rig.armL = mk(1); rig.armR = mk(-1);
      for (const sd of [1, -1]) {
        const l = new THREE.Group(); l.position.set(sd * 0.35, 0.85, 0);
        l.add(mesh(G.dode, c2, [0, -0.3, 0], [0.5, 0.6, 0.5]));
        l.add(mesh(G.dode, stone, [0, -0.7, 0.08], [0.55, 0.35, 0.65]));
        body.add(l); rig.legs.push(l);
      }
      rig.height = 2.7;
      break;
    }
    // eslint-disable-next-line no-fallthrough
    case 'biped': {
      const big = false as boolean;
      const torso = mesh(big ? G.box : new THREE.CapsuleGeometry(0.34, 0.45, 4, 8), c, [0, big ? 1.3 : 1.1, 0], big ? [1.1, 1.1, 0.8] : [1, 1, 1]);
      body.add(torso); rig.bodyMesh = torso;
      if (def.id === 'elder') body.add(mesh(G.cone, c2, [0, 0.8, 0], [1, 1.3, 1]));
      const h = new THREE.Group(); h.position.set(0, big ? 2.1 : 1.75, 0); body.add(h); rig.head = h;
      if (def.id === 'pigman' || def.id === 'elder') {
        h.add(mesh(G.sph, c, [0, 0, 0], [0.75, 0.7, 0.7]));
        h.add(mesh(G.cyl, 0xe08880, [0, -0.05, 0.36], [0.28, 0.18, 0.28], [Math.PI / 2, 0, 0]));
        h.add(mesh(G.sphLo, 0x502020, [0.06, -0.05, 0.46], [0.05, 0.07, 0.03]));
        h.add(mesh(G.sphLo, 0x502020, [-0.06, -0.05, 0.46], [0.05, 0.07, 0.03]));
        h.add(mesh(G.cone, c, [0.25, 0.32, 0], [0.15, 0.22, 0.1], [0, 0, -0.5]));
        h.add(mesh(G.cone, c, [-0.25, 0.32, 0], [0.15, 0.22, 0.1], [0, 0, 0.5]));
        eyes(h, 0.12, 0.3, 0.14, 0.06);
        if (def.id === 'elder') h.add(mesh(G.cylLo, 0xf0c030, [0, 0.38, 0], [0.4, 0.2, 0.4], [0, 0, 0], { emissive: 0x302000 }));
      } else if (def.id === 'merm') {
        h.add(mesh(G.sph, c, [0, 0, 0.05], [0.7, 0.65, 0.85]));
        h.add(mesh(G.cone, c2, [0, 0.35, -0.1], [0.08, 0.5, 0.4]));
        eyes(h, 0.1, 0.33, 0.2, 0.09, 0xf0f040);
      } else {
        h.add(mesh(G.box, c, [0, 0, 0], [0.7, 0.6, 0.6]));
        eyes(h, 0.05, 0.31, 0.16, 0.08, def.id === 'treeguard' ? 0xf0e040 : 0x40f0ff, def.id === 'treeguard' ? 0x606000 : 0x20a0b0);
      }
      const armLen = big ? 1.1 : 0.6;
      const mk = (s: number) => {
        const a = new THREE.Group(); a.position.set(s * (big ? 0.75 : 0.42), big ? 1.75 : 1.35, 0);
        a.add(mesh(big ? G.box : G.cylLo, big ? c2 : c, [0, -armLen / 2, 0], big ? [0.35, armLen, 0.35] : [0.17, armLen, 0.17]));
        body.add(a); return a;
      };
      rig.armL = mk(1); rig.armR = mk(-1);
      if (def.id === 'merm' || def.id === 'pigman') {
        const spear = mesh(G.cylLo, 0x7a5a3a, [0, -0.6, 0.2], [0.05, 1.4, 0.05], [1.2, 0, 0]);
        rig.armR.add(spear);
      }
      const ll = big ? 0.8 : 0.65;
      leg(0.2 * (big ? 1.5 : 1), 0, ll, big ? 0.3 : 0.18, big ? c2 : def.id === 'elder' ? c2 : 0x5a3a2a, ll + 0.05);
      leg(-0.2 * (big ? 1.5 : 1), 0, ll, big ? 0.3 : 0.18, big ? c2 : def.id === 'elder' ? c2 : 0x5a3a2a, ll + 0.05);
      rig.height = big ? 2.6 : 2.2;
      break;
    }
    case 'bird': case 'bat': {
      const bat = def.model === 'bat';
      body.add(mesh(G.sph, c, [0, bat ? 0 : 0.6, 0], bat ? [0.5, 0.5, 0.55] : [0.7, 0.65, 0.85]));
      const h = new THREE.Group(); h.position.set(0, bat ? 0.2 : 1.05, bat ? 0.2 : 0.35); body.add(h); rig.head = h;
      h.add(mesh(G.sph, c, [0, 0, 0], [0.45, 0.45, 0.45]));
      if (!bat) h.add(mesh(G.cone, def.id === 'gobbler' || def.id === 'stormgoose' ? def.color2! : 0xf0a020, [0, -0.02, 0.3], [0.12, 0.3, 0.12], [Math.PI / 2, 0, 0]));
      else { h.add(mesh(G.cone, c, [0.13, 0.25, 0], [0.1, 0.25, 0.08])); h.add(mesh(G.cone, c, [-0.13, 0.25, 0], [0.1, 0.25, 0.08])); }
      if (def.id === 'chicken') h.add(mesh(G.box, 0xe03030, [0, 0.25, 0.05], [0.06, 0.18, 0.2]));
      eyes(h, 0.06, 0.18, 0.12, 0.05, bat ? 0xff3030 : 0x111111, bat ? 0x600000 : 0);
      rig.wings = [];
      for (const s of [1, -1]) {
        const wg = new THREE.Group(); wg.position.set(s * (bat ? 0.2 : 0.3), bat ? 0.05 : 0.7, 0);
        wg.add(mesh(G.box, def.id === 'stormgoose' ? def.color2! : bat ? def.color2! : c, [s * (bat ? 0.5 : 0.3), 0, -0.05], bat ? [1, 0.04, 0.5] : [0.6, 0.08, 0.5]));
        body.add(wg); rig.wings.push(wg);
      }
      if (!bat) { leg(0.15, 0, 0.35, 0.05, 0xf0a020); leg(-0.15, 0, 0.35, 0.05, 0xf0a020); }
      if (def.id === 'stormgoose') body.add(mesh(G.cone, 0xf0f060, [0, 1.4, -0.1], [0.2, 0.4, 0.2], [0, 0, 0], { emissive: 0x606000 }));
      rig.height = bat ? 0.8 : 1.4;
      break;
    }
    case 'tentacle': {
      rig.segs = [];
      let parent: THREE.Object3D = body;
      for (let i = 0; i < 7; i++) {
        const seg = new THREE.Group();
        seg.position.y = i === 0 ? 0 : 0.42;
        const r = 0.32 - i * 0.04;
        seg.add(mesh(G.cylLo, i % 2 ? c : c2, [0, 0.21, 0], [r * 2, 0.44, r * 2]));
        if (i % 2 === 0) seg.add(mesh(G.sphLo, 0xe0b0e0, [r * 0.9, 0.2, 0], [0.08, 0.08, 0.08]));
        parent.add(seg);
        rig.segs.push(seg);
        parent = seg;
      }
      parent.add(mesh(G.cone, c2, [0, 0.4, 0], [0.12, 0.4, 0.12]));
      rig.height = 3.2;
      break;
    }
    case 'scorpion': case 'crab': {
      const crab = def.model === 'crab';
      body.add(mesh(G.sph, c, [0, 0.4, 0], crab ? [1.1, 0.45, 0.8] : [0.7, 0.35, 1.1]));
      const h = new THREE.Group(); h.position.set(0, 0.45, crab ? 0.3 : 0.5); body.add(h); rig.head = h;
      eyes(h, 0.15, 0.05, 0.12, 0.06);
      for (const s of [1, -1]) {
        const cl = new THREE.Group(); cl.position.set(s * (crab ? 0.5 : 0.3), 0.45, crab ? 0.35 : 0.55);
        cl.add(mesh(G.cylLo, c, [0, 0, 0.2], [0.1, 0.4, 0.1], [Math.PI / 2, 0, 0]));
        cl.add(mesh(G.sph, c2, [0, 0, 0.45], crab ? [0.35, 0.25, 0.4] : [0.25, 0.15, 0.3]));
        body.add(cl);
        if (s === 1) rig.armL = cl; else rig.armR = cl;
      }
      if (!crab) {
        const t = new THREE.Group(); t.position.set(0, 0.45, -0.5); body.add(t); rig.tail = t;
        let p: THREE.Object3D = t;
        for (let i = 0; i < 4; i++) { const sg = new THREE.Group(); sg.position.set(0, i ? 0.22 : 0, i ? -0.05 : 0); sg.rotation.x = -0.45; sg.add(mesh(G.sphLo, c, [0, 0.1, 0], [0.2, 0.25, 0.2])); p.add(sg); p = sg; }
        p.add(mesh(G.cone, c2, [0, 0.3, 0.1], [0.1, 0.25, 0.1], [0.8, 0, 0]));
      }
      for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
        const l = new THREE.Group(); l.position.set(s * 0.35, 0.35, 0.2 - i * 0.25);
        l.add(mesh(G.cylLo, c2, [s * 0.25, -0.12, 0], [0.05, 0.55, 0.05], [0, 0, s * 1.0]));
        body.add(l); rig.legs.push(l);
      }
      rig.height = 0.9;
      break;
    }
    case 'shadow': {
      const sm = toon(0x0a0a12, { opacity: 0.8 });
      const b = new THREE.Mesh(G.sph, sm); b.scale.set(0.9, 1.6, 0.9); b.position.y = 1.0; body.add(b);
      for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(G.cone, sm); t.scale.set(0.2, 0.9, 0.2); t.position.set(Math.sin(i * 1.25) * 0.3, 0.2, Math.cos(i * 1.25) * 0.3); t.rotation.x = Math.PI; body.add(t); }
      const h = new THREE.Group(); h.position.set(0, 1.5, 0.35); body.add(h); rig.head = h;
      eyes(h, 0, 0.05, 0.15, 0.1, 0xffffff, 0xffffff);
      rig.height = 2.2;
      break;
    }
    case 'mole': case 'titan': {
      const titan = def.model === 'titan';
      if (titan) {
        rig.segs = [];
        for (let i = 0; i < 4; i++) { const s = mesh(G.sph, i % 2 ? c : c2, [0, 0.7 - i * 0.05, -i * 0.8], [1.4 - i * 0.2, 1.3 - i * 0.2, 1.1]); body.add(s); rig.segs.push(s); }
        const h = new THREE.Group(); h.position.set(0, 1.0, 0.7); body.add(h); rig.head = h;
        h.add(mesh(G.cone, 0xe0d0b0, [0.3, 0, 0.3], [0.15, 0.5, 0.15], [1.4, 0, -0.3]));
        h.add(mesh(G.cone, 0xe0d0b0, [-0.3, 0, 0.3], [0.15, 0.5, 0.15], [1.4, 0, 0.3]));
        eyes(h, 0.3, 0.2, 0.3, 0.1, 0xff6020, 0x803000);
        rig.height = 2;
      } else {
        body.add(mesh(G.sph, c, [0, 0.4, 0], [0.9, 0.75, 1.1]));
        if (def.boss) for (let i = 0; i < 4; i++) body.add(mesh(G.dode, 0x7a7a7a, [Math.sin(i) * 0.3, 0.8, -0.2 + i * 0.1], [0.3, 0.3, 0.3]));
        const h = new THREE.Group(); h.position.set(0, 0.4, 0.5); body.add(h); rig.head = h;
        h.add(mesh(G.cone, c2, [0, 0, 0.2], [0.25, 0.4, 0.25], [Math.PI / 2, 0, 0]));
        h.add(mesh(G.sphLo, 0xf04060, [0, 0, 0.42], [0.1, 0.1, 0.1]));
        for (const s of [1, -1]) { const cl = new THREE.Group(); cl.position.set(s * 0.4, 0.2, 0.35); cl.add(mesh(G.box, 0xe0d0c0, [0, 0, 0.1], [0.25, 0.06, 0.25])); body.add(cl); rig.legs.push(cl); }
        rig.height = 0.9;
      }
      break;
    }
  }
  // dodatki "z charakterem"
  if (def.id === 'spider' || def.id === 'spider_warrior' || def.id === 'queen') for (let k = 0; k < 10; k++) body.add(mesh(G.coneLo, c, [Math.sin(k * 2.4) * 0.35, 0.9 + (k % 3) * 0.12, -0.45 + Math.cos(k * 2.4) * 0.35], [0.06, 0.22, 0.06], [Math.cos(k) * 0.6, 0, Math.sin(k) * 0.6]));
  if (def.id === 'hound') for (let k = 0; k < 5; k++) body.add(mesh(G.coneLo, 0x1a1410, [0, 1.0, 0.4 - k * 0.22], [0.1, 0.35, 0.1], [-0.4, 0, 0]));
  if (def.id === 'beefalo') for (let k = 0; k < 8; k++) body.add(mesh(G.ico, c2, [Math.sin(k * 0.8) * 0.45, 1.05 + (k % 2) * 0.12, 0.3 - k * 0.12], [0.42, 0.32, 0.42]));
  if (def.id === 'pigman' || def.id === 'elder') body.add(mesh(G.sph, c, [0, 1.0, 0.12], [0.75, 0.7, 0.62]));
  if (def.model === 'shadow') { /* cienie zostają gładkie */ } else organic(root, def.boss ? 0.09 : 0.07, 0.05, def.id.length);
  return rig;
}

// =====================================================================
// Budowle
// =====================================================================
const STRUCT_SMOOTH = new Set(['floor_wood', 'floor_cobble', 'floor_carpet', 'planted_tree', 'farm', 'escape_portal']);
export interface StructModel { g: THREE.Group; anim?: THREE.Object3D[]; flame?: THREE.Object3D; glow?: THREE.Mesh[]; plant?: THREE.Group; door?: THREE.Object3D; head?: THREE.Object3D }

export function makeStruct(type: string): StructModel {
  const g = new THREE.Group();
  const res: StructModel = { g, anim: [], glow: [] };
  const add = (geo: THREE.BufferGeometry, col: number, p: number[], s: number[], r: number[] = [0, 0, 0], opts?: any) => { const m = mesh(geo, col, p, s, r, opts); g.add(m); return m; };
  const flame = (y: number, sc = 1) => {
    const f = new THREE.Group();
    f.position.y = y;
    f.add(mesh(G.cone, 0xff8020, [0, 0.35 * sc, 0], [0.7 * sc, 0.9 * sc, 0.7 * sc], [0, 0, 0], { emissive: 0xff5000 }));
    f.add(mesh(G.cone, 0xffe060, [0, 0.3 * sc, 0], [0.4 * sc, 0.6 * sc, 0.4 * sc], [0, 0, 0], { emissive: 0xffa000 }));
    g.add(f);
    res.flame = f;
  };
  const table = (top: number, leg = 0x6a4a2a) => {
    add(G.box, top, [0, 0.9, 0], [1.8, 0.15, 1.1]);
    for (const [x, z] of [[0.75, 0.45], [-0.75, 0.45], [0.75, -0.45], [-0.75, -0.45]]) add(G.box, leg, [x, 0.42, z], [0.12, 0.85, 0.12]);
  };
  switch (type) {
    case 'campfire':
      for (let i = 0; i < 7; i++) add(G.dode, 0x7a7a78, [Math.sin(i * 0.9) * 0.6, 0.1, Math.cos(i * 0.9) * 0.6], [0.3, 0.22, 0.3]);
      add(G.cylLo, 0x5a3a20, [0, 0.15, 0], [0.15, 0.9, 0.15], [0, 0.5, Math.PI / 2]);
      add(G.cylLo, 0x5a3a20, [0, 0.18, 0], [0.15, 0.9, 0.15], [0, -0.7, Math.PI / 2]);
      flame(0.15);
      break;
    case 'firepit':
      for (let i = 0; i < 10; i++) add(G.box, 0x8a8a88, [Math.sin(i * 0.628) * 0.85, 0.2, Math.cos(i * 0.628) * 0.85], [0.35, 0.4, 0.3], [0, i * 0.628, 0]);
      add(G.cylLo, 0x3a2a1a, [0, 0.05, 0], [1.3, 0.1, 1.3]);
      flame(0.15, 1.2);
      break;
    case 'lamp':
      add(G.cylLo, 0x404048, [0, 1.3, 0], [0.12, 2.6, 0.12]);
      res.glow!.push(add(G.sph, 0xfff0c0, [0, 2.7, 0], [0.4, 0.4, 0.4], [0, 0, 0], { emissive: 0x000000 }));
      add(G.cone, 0x404048, [0, 2.95, 0], [0.5, 0.25, 0.5]);
      break;
    case 'workbench':
      table(0x9a7040);
      add(G.box, 0x707880, [0.4, 1.05, 0.1], [0.4, 0.12, 0.2]);
      add(G.cylLo, 0x7a5a3a, [-0.4, 1.05, 0], [0.05, 0.6, 0.05], [0, 0, Math.PI / 2]);
      add(G.box, 0x505868, [-0.65, 1.05, 0], [0.12, 0.15, 0.04]);
      break;
    case 'forge': case 'forge2':
      add(G.box, type === 'forge2' ? 0x6a3a30 : 0x7a6a60, [-0.5, 0.7, 0], [1.2, 1.4, 1.4]);
      res.glow!.push(add(G.box, 0xff7020, [-0.5, 0.6, 0.71], [0.6, 0.5, 0.02], [0, 0, 0], { emissive: 0xc04000 }));
      add(G.box, 0x404048, [0.7, 0.75, 0], [0.7, 0.2, 0.35]);
      add(G.box, 0x404048, [0.7, 0.4, 0], [0.3, 0.6, 0.25]);
      add(G.cylLo, 0x5a4a40, [-0.5, 1.8, 0], [0.4, 1, 0.4]);
      if (type === 'forge2') add(G.box, 0xd0a040, [0.2, 1.5, -0.6], [0.5, 0.5, 0.3]);
      break;
    case 'kitchen':
      for (let i = 0; i < 6; i++) add(G.dode, 0x7a7a78, [Math.sin(i) * 0.6, 0.15, Math.cos(i) * 0.6], [0.3, 0.3, 0.3]);
      add(G.sph, 0x303034, [0, 0.75, 0], [1.2, 0.9, 1.2]);
      add(G.cylLo, 0x404044, [0, 1.15, 0], [0.9, 0.12, 0.9]);
      for (const a of [0, 2.1, 4.2]) add(G.cylLo, 0x404044, [Math.sin(a) * 0.5, 0.35, Math.cos(a) * 0.5], [0.08, 0.7, 0.08]);
      res.glow!.push(add(G.cone, 0xff8020, [0, 0.2, 0], [0.5, 0.4, 0.5], [0, 0, 0], { emissive: 0x000000 }));
      break;
    case 'loom':
      add(G.box, 0x8a6a40, [0.8, 0.9, 0], [0.12, 1.8, 0.12]); add(G.box, 0x8a6a40, [-0.8, 0.9, 0], [0.12, 1.8, 0.12]);
      add(G.box, 0x8a6a40, [0, 1.75, 0], [1.8, 0.12, 0.12]); add(G.box, 0xd0c0a0, [0, 1.1, 0], [1.4, 1.1, 0.03]);
      add(G.box, 0x8a6a40, [0, 0.5, 0.4], [1.7, 0.1, 0.5]);
      break;
    case 'alchemy':
      table(0x5a4a6a);
      for (let i = 0; i < 4; i++) res.glow!.push(add(G.sph, [0x40f080, 0xf04080, 0x40a0f0, 0xf0d040][i], [-0.6 + i * 0.4, 1.15, 0], [0.22, 0.3, 0.22], [0, 0, 0], { emissive: [0x106030, 0x601030, 0x103060, 0x605010][i] }));
      add(G.cylLo, 0x8a8a90, [0.6, 1.3, -0.3], [0.05, 0.6, 0.05]);
      break;
    case 'maptable':
      table(0x8a6a40);
      add(G.box, 0xf0e6c8, [0, 0.99, 0], [1.4, 0.02, 0.8]);
      add(G.box, 0x4a8a4a, [-0.2, 1.0, 0.1], [0.5, 0.02, 0.3]);
      add(G.box, 0x4060a0, [0.4, 1.0, -0.1], [0.3, 0.02, 0.4]);
      break;
    case 'mechbench':
      table(0x6a6a74, 0x404048);
      res.anim!.push(add(G.cylLo, 0xd0a040, [-0.4, 1.15, 0], [0.5, 0.08, 0.5], [Math.PI / 2, 0, 0]));
      res.anim!.push(add(G.cylLo, 0xb08030, [0.1, 1.1, 0.1], [0.35, 0.08, 0.35], [Math.PI / 2, 0, 0]));
      add(G.box, 0x4060a0, [0.6, 1.05, 0], [0.3, 0.2, 0.4]);
      break;
    case 'shadow_altar':
      add(G.box, 0x2a2030, [0, 0.4, 0], [1.6, 0.8, 1.6]);
      add(G.cone, 0x1a1020, [0, 1.8, 0], [0.8, 2, 0.8], [0, Math.PI / 4, 0]);
      res.glow!.push(add(G.oct, 0xa040f0, [0, 3.1, 0], [0.4, 0.6, 0.4], [0, 0, 0], { emissive: 0x6020a0 }));
      res.anim!.push(res.glow![0]);
      break;
    case 'escape_portal': {
      add(G.cylLo, 0x5a5060, [0, 0.15, 0], [5, 0.3, 5]);
      const ring = add(G.tor, 0x40e0ff, [0, 2.8, 0], [4.5, 4.5, 3], [0, 0, 0], { emissive: 0x1080a0 });
      res.anim!.push(ring);
      res.glow!.push(add(G.cyl, 0x80f0ff, [0, 2.8, 0], [3.8, 0.05, 3.8], [Math.PI / 2, 0, 0], { emissive: 0x2080a0, opacity: 0.6 }));
      break;
    }
    case 'chest': add(G.box, 0x8a5a30, [0, 0.35, 0], [1, 0.7, 0.7]); add(G.box, 0x6a4020, [0, 0.75, 0], [1.05, 0.12, 0.75]); add(G.box, 0xd0b040, [0, 0.45, 0.36], [0.18, 0.2, 0.02]); break;
    case 'big_chest': add(G.box, 0x7a4a28, [0, 0.45, 0], [1.4, 0.9, 0.9]); add(G.box, 0x707880, [0, 0.95, 0], [1.45, 0.14, 0.95]); add(G.box, 0x707880, [0.5, 0.45, 0], [0.08, 0.92, 0.92]); add(G.box, 0x707880, [-0.5, 0.45, 0], [0.08, 0.92, 0.92]); break;
    case 'vault': add(G.box, 0x50545c, [0, 0.6, 0], [1.4, 1.2, 1.1]); add(G.cyl, 0xc0a040, [0, 0.6, 0.56], [0.5, 0.05, 0.5], [Math.PI / 2, 0, 0]); break;
    case 'icebox': add(G.box, 0xd8e8f0, [0, 0.6, 0], [0.9, 1.2, 0.8]); add(G.box, 0xa0b0c0, [0.3, 0.7, 0.41], [0.06, 0.4, 0.04]); res.glow!.push(add(G.box, 0x80e0ff, [0, 1.15, 0.41], [0.3, 0.06, 0.02], [0, 0, 0], { emissive: 0 })); break;
    case 'wall_hay': add(G.box, 0xd8c070, [0, 0.7, 0], [1.1, 1.4, 0.5]); add(G.box, 0xc0a050, [0, 1.45, 0], [1.1, 0.12, 0.5]); break;
    case 'wall_wood': for (let i = 0; i < 3; i++) add(G.cylLo, 0x7a5a3a, [-0.35 + i * 0.35, 1.0, 0], [0.34, 2, 0.34]); for (let i = 0; i < 3; i++) add(G.coneLo, 0x7a5a3a, [-0.35 + i * 0.35, 2.15, 0], [0.34, 0.3, 0.34]); break;
    case 'wall_stone': add(G.box, 0x9a9a98, [0, 0.9, 0], [1.1, 1.8, 0.7]); add(G.box, 0x8a8a88, [0, 1.9, 0], [1.15, 0.2, 0.75]); break;
    case 'wall_metal': add(G.box, 0x7a8088, [0, 1.0, 0], [1.1, 2, 0.4]); add(G.box, 0x5a6068, [0, 1.0, 0.21], [0.9, 1.8, 0.02]); break;
    case 'gate': {
      add(G.box, 0x6a4a2a, [0.55, 1, 0], [0.15, 2, 0.15]); add(G.box, 0x6a4a2a, [-0.55, 1, 0], [0.15, 2, 0.15]);
      const door = new THREE.Group(); door.position.set(-0.5, 0, 0);
      door.add(mesh(G.box, 0x8a6a3a, [0.5, 0.9, 0], [0.95, 1.6, 0.1]));
      g.add(door); res.door = door;
      break;
    }
    case 'floor_wood': add(G.box, 0x9a7040, [0, 0.03, 0], [2, 0.06, 2]); for (let i = 0; i < 4; i++) add(G.box, 0x7a5030, [-0.75 + i * 0.5, 0.065, 0], [0.04, 0.01, 2]); break;
    case 'floor_cobble': add(G.box, 0x8a8a8a, [0, 0.03, 0], [2, 0.06, 2]); for (let i = 0; i < 6; i++) add(G.dode, 0x9a9a98, [Math.sin(i * 2.3) * 0.6, 0.07, Math.cos(i * 1.7) * 0.6], [0.4, 0.05, 0.4]); break;
    case 'floor_carpet': add(G.box, 0xa03030, [0, 0.03, 0], [2, 0.05, 2]); add(G.box, 0xe0c040, [0, 0.06, 0], [1.6, 0.01, 1.6]); add(G.box, 0xa03030, [0, 0.065, 0], [1.4, 0.01, 1.4]); break;
    case 'farm': {
      add(G.box, 0x5a3a20, [0, 0.08, 0], [1.9, 0.16, 1.9]);
      for (let i = 0; i < 3; i++) add(G.box, 0x4a2a18, [-0.6 + i * 0.6, 0.17, 0], [0.12, 0.02, 1.8]);
      const pl = new THREE.Group(); g.add(pl); res.plant = pl;
      break;
    }
    case 'drying_rack':
      add(G.cylLo, 0x7a5a3a, [0.7, 0.8, 0], [0.08, 1.6, 0.08]); add(G.cylLo, 0x7a5a3a, [-0.7, 0.8, 0], [0.08, 1.6, 0.08]);
      add(G.cylLo, 0x7a5a3a, [0, 1.55, 0], [0.06, 1.5, 0.06], [0, 0, Math.PI / 2]);
      for (let i = 0; i < 3; i++) add(G.box, 0xa04030, [-0.4 + i * 0.4, 1.25, 0], [0.18, 0.4, 0.06]);
      break;
    case 'smokehouse':
      add(G.box, 0x7a5a3a, [0, 0.8, 0], [1.6, 1.6, 1.6]); add(G.coneLo, 0x5a3a20, [0, 2, 0], [2.4, 0.9, 2.4], [0, Math.PI / 4, 0]);
      add(G.box, 0x8a8a88, [0.5, 2.3, 0.4], [0.3, 0.9, 0.3]);
      res.glow!.push(add(G.box, 0xff7020, [0, 0.4, 0.81], [0.4, 0.3, 0.02], [0, 0, 0], { emissive: 0 }));
      break;
    case 'tent':
      add(G.coneLo, 0xc0b090, [0, 1, 0], [2.6, 2, 2.6], [0, Math.PI / 4, 0]);
      add(G.box, 0x302820, [0, 0.55, 0.92], [0.6, 1.0, 0.05]);
      break;
    case 'quest_board':
      add(G.cylLo, 0x6a4a2a, [0.6, 0.9, 0], [0.1, 1.8, 0.1]); add(G.cylLo, 0x6a4a2a, [-0.6, 0.9, 0], [0.1, 1.8, 0.1]);
      add(G.box, 0x8a6a40, [0, 1.3, 0], [1.4, 0.9, 0.08]);
      for (let i = 0; i < 3; i++) add(G.box, 0xf0e6c8, [-0.4 + i * 0.4, 1.3 + (i % 2) * 0.1, 0.05], [0.3, 0.4, 0.01]);
      break;
    case 'weather_station':
      add(G.cylLo, 0x707880, [0, 1.2, 0], [0.08, 2.4, 0.08]);
      { const head = new THREE.Group(); head.position.y = 2.4; for (let i = 0; i < 3; i++) head.add(mesh(G.sphLo, 0xd0a040, [Math.sin(i * 2.09) * 0.4, 0, Math.cos(i * 2.09) * 0.4], [0.18, 0.18, 0.18])); g.add(head); res.anim!.push(head); }
      add(G.box, 0xf0f0f0, [0, 0.9, 0.15], [0.3, 0.4, 0.15]);
      break;
    case 'rod_lightning': add(G.cylLo, 0x8a6a40, [0, 1.8, 0], [0.12, 3.6, 0.12]); add(G.cone, 0xf0c040, [0, 3.8, 0], [0.12, 0.5, 0.12]); add(G.cylLo, 0x7a7a7a, [0, 0.15, 0], [0.6, 0.3, 0.6]); break;
    case 'res_altar': add(G.box, 0x9a9080, [0, 0.5, 0], [1.3, 1, 0.9]); res.glow!.push(add(G.sph, 0xe03050, [0, 1.25, 0], [0.4, 0.4, 0.3], [0, 0, 0], { emissive: 0x801020 })); break;
    case 'scarecrow':
      add(G.cylLo, 0x7a5a3a, [0, 1, 0], [0.1, 2, 0.1]); add(G.cylLo, 0x7a5a3a, [0, 1.5, 0], [0.08, 1.6, 0.08], [0, 0, Math.PI / 2]);
      add(G.box, 0x6a7a3a, [0, 1.2, 0], [0.7, 0.8, 0.3]); add(G.sph, 0xe08020, [0, 2.05, 0], [0.6, 0.5, 0.6]); add(G.cone, 0xa08040, [0, 2.45, 0], [0.7, 0.4, 0.7]);
      break;
    case 'furnace':
      add(G.sph, 0x9a5a40, [0, 0.8, 0], [1.8, 1.8, 1.8]); add(G.box, 0x9a5a40, [0, 0.3, 0], [1.6, 0.6, 1.6]);
      res.glow!.push(add(G.box, 0xff6020, [0, 0.6, 0.85], [0.6, 0.5, 0.05], [0, 0, 0], { emissive: 0 }));
      add(G.cylLo, 0x6a4a40, [0, 1.9, 0], [0.4, 0.8, 0.4]);
      break;
    case 'generator':
      add(G.box, 0x5a6068, [0, 0.6, 0], [1.6, 1.2, 1.1]); add(G.cylLo, 0x404048, [0.5, 1.6, 0], [0.3, 1, 0.3]);
      res.glow!.push(add(G.box, 0x40ff80, [-0.4, 0.9, 0.56], [0.3, 0.2, 0.02], [0, 0, 0], { emissive: 0 }));
      res.anim!.push(add(G.cylLo, 0xa0a0a0, [-0.81, 0.6, 0], [0.5, 0.1, 0.5], [0, 0, Math.PI / 2]));
      break;
    case 'windmill': {
      add(G.cylLo, 0xc0b090, [0, 2, 0], [1.2, 4, 1.2]); add(G.coneLo, 0x8a3a20, [0, 4.4, 0], [1.6, 1, 1.6]);
      const blades = new THREE.Group(); blades.position.set(0, 3.6, 0.75);
      for (let i = 0; i < 4; i++) { const b = new THREE.Group(); b.rotation.z = i * Math.PI / 2; b.add(mesh(G.box, 0xe8e0d0, [0, 1.2, 0], [0.4, 2.4, 0.05])); blades.add(b); }
      g.add(blades); res.anim!.push(blades);
      break;
    }
    case 'waterwheel': {
      add(G.box, 0x6a4a2a, [0.4, 1.3, 0], [0.15, 2.6, 0.15]); add(G.box, 0x6a4a2a, [-0.4, 1.3, 0], [0.15, 2.6, 0.15]);
      const wheel = new THREE.Group(); wheel.position.set(0, 1.5, 0);
      wheel.add(mesh(G.tor, 0x7a5a3a, [0, 0, 0], [2.4, 2.4, 2], [0, Math.PI / 2, 0]));
      for (let i = 0; i < 8; i++) { const p = new THREE.Group(); p.rotation.x = i * Math.PI / 4; p.add(mesh(G.box, 0x8a6a3a, [0, 1.1, 0], [0.5, 0.5, 0.08])); wheel.add(p); }
      g.add(wheel); res.anim!.push(wheel);
      break;
    }
    case 'solar':
      add(G.cylLo, 0x606068, [0, 0.6, 0], [0.12, 1.2, 0.12]);
      res.glow!.push(add(G.box, 0x6080f0, [0, 1.25, 0], [1.4, 0.08, 1], [-0.5, 0, 0], { emissive: 0 }));
      break;
    case 'sawmill': {
      table(0x7a6a50, 0x505058);
      const saw = mesh(G.cyl, 0xc0c8d0, [0, 1.1, 0], [0.9, 0.03, 0.9], [Math.PI / 2, 0, 0]);
      g.add(saw); res.anim!.push(saw);
      break;
    }
    case 'drill': {
      add(G.box, 0x505058, [0.6, 1.4, 0], [0.2, 2.8, 0.2]); add(G.box, 0x505058, [-0.6, 1.4, 0], [0.2, 2.8, 0.2]); add(G.box, 0x505058, [0, 2.8, 0], [1.4, 0.2, 0.3]);
      const bit = new THREE.Group(); bit.position.y = 1.4; bit.add(mesh(G.cone, 0xa0a0a8, [0, -0.6, 0], [0.4, 1.2, 0.4], [Math.PI, 0, 0])); bit.add(mesh(G.cylLo, 0xd0a040, [0, 0.4, 0], [0.5, 0.8, 0.5]));
      g.add(bit); res.anim!.push(bit);
      break;
    }
    case 'harvester': {
      add(G.box, 0xc04030, [0, 0.8, 0], [1.6, 0.8, 1.1]); add(G.box, 0x404048, [0, 1.4, -0.2], [0.8, 0.5, 0.6]);
      for (const [x, z] of [[0.7, 0.5], [-0.7, 0.5], [0.7, -0.5], [-0.7, -0.5]]) add(G.cyl, 0x202020, [x, 0.35, z], [0.6, 0.15, 0.6], [0, 0, Math.PI / 2]);
      const reel = mesh(G.cylLo, 0xd0a040, [0, 0.6, 0.8], [0.4, 1.6, 0.4], [0, 0, Math.PI / 2]); g.add(reel); res.anim!.push(reel);
      break;
    }
    case 'sprinkler': {
      add(G.cylLo, 0xa0a0a8, [0, 0.7, 0], [0.15, 1.4, 0.15]); add(G.cylLo, 0x707078, [0, 0.1, 0], [0.6, 0.2, 0.6]);
      const head = new THREE.Group(); head.position.y = 1.45; head.add(mesh(G.box, 0x4080c0, [0, 0, 0], [0.9, 0.1, 0.1])); g.add(head); res.anim!.push(head);
      break;
    }
    case 'turret': {
      add(G.cylLo, 0x606068, [0, 0.5, 0], [1.2, 1, 1.2]);
      const head = new THREE.Group(); head.position.y = 1.2;
      head.add(mesh(G.box, 0x707880, [0, 0, 0], [0.6, 0.4, 0.8])); head.add(mesh(G.tor, 0x7a5a3a, [0, 0, 0.4], [0.5, 0.5, 0.5], [0, Math.PI / 2, 0])); head.add(mesh(G.cylLo, 0x404048, [0, 0, 0.5], [0.08, 0.6, 0.08], [Math.PI / 2, 0, 0]));
      g.add(head); res.head = head;
      break;
    }
    case 'hopper': add(G.cone, 0x707880, [0, 0.9, 0], [1, 0.8, 1], [Math.PI, 0, 0]); add(G.cylLo, 0x606068, [0, 0.3, 0], [0.2, 0.6, 0.2]); break;
    case 'golem_core': add(G.box, 0x6a6070, [0, 0.4, 0], [1.2, 0.8, 1.2]); res.glow!.push(add(G.oct, 0x90f0a0, [0, 1.2, 0], [0.4, 0.6, 0.4], [0, 0, 0], { emissive: 0x30a040 })); res.anim!.push(res.glow![0]); break;
    case 'planted_tree': {
      const pl = new THREE.Group(); g.add(pl); res.plant = pl;
      const t = new THREE.Mesh(objGeometry('tree_pine')!, vcMat()); t.castShadow = true; pl.add(t);
      break;
    }
    default: add(G.box, 0xff00ff, [0, 0.5, 0], [1, 1, 1]);
  }
  if (!STRUCT_SMOOTH.has(type)) organic(g, 0.06, 0.035, type.length);
  return res;
}

const plantColors: Record<string, number> = { carrot: 0xe07a20, potato: 0xc0a060, pumpkin: 0xe08020, berries: 0x3050c0 };
export function setFarmPlant(sm: StructModel, plant: string | undefined, growth: number) {
  const pl = sm.plant!;
  pl.clear();
  if (!plant) return;
  const stage = growth >= 1 ? 3 : growth > 0.5 ? 2 : 1;
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * 0.8 - 0.4, z = Math.floor(i / 2) * 0.8 - 0.4;
    pl.add(mesh(G.coneLo, 0x4a6a2a, [x, 0.2 + stage * 0.12, z], [0.25 * stage, 0.4 * stage, 0.25 * stage]));
    if (stage === 3) pl.add(mesh(plant === 'pumpkin' ? G.sph : G.sphLo, plantColors[plant] || 0xffffff, [x + 0.1, 0.3, z + 0.1], plant === 'pumpkin' ? [0.45, 0.35, 0.45] : [0.2, 0.2, 0.2]));
  }
}

// =====================================================================
// Pociski
// =====================================================================
export function projModel(kind: string): THREE.Object3D {
  switch (kind) {
    case 'arrow': return mesh(G.cylLo, 0x8a6a40, [0, 1.2, 0], [0.05, 0.8, 0.05], [Math.PI / 2, 0, 0]);
    case 'stone': return mesh(G.dode, 0x8a8a8a, [0, 1.2, 0], [0.2, 0.2, 0.2]);
    case 'ice': return mesh(G.oct, 0x90e0ff, [0, 1.2, 0], [0.3, 0.3, 0.5], [0, 0, 0], { emissive: 0x3080c0 });
    case 'fire': return mesh(G.sph, 0xff6020, [0, 1.2, 0], [0.4, 0.4, 0.4], [0, 0, 0], { emissive: 0xff4000 });
    case 'bolt': return mesh(G.oct, 0xffff80, [0, 1.2, 0], [0.25, 0.25, 0.7], [0, 0, 0], { emissive: 0xffff00 });
  }
  return mesh(G.sph, 0xffffff, [0, 1.2, 0], [0.2, 0.2, 0.2]);
}

// =====================================================================
// Emoji jako tekstury (dropy, ikony)
// =====================================================================
const emojiCache = new Map<string, THREE.Texture>();
export function emojiTexture(e: string): THREE.Texture {
  let t = emojiCache.get(e);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.font = '48px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e, 32, 36);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    emojiCache.set(e, t);
  }
  return t;
}

export function textSprite(text: string, color = '#ffffff', bg = 'rgba(0,0,0,0.45)'): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 28px sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 20;
  c.width = w; c.height = 40;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = bg;
  ctx.beginPath();
  (ctx as any).roundRect ? (ctx as any).roundRect(0, 0, w, 40, 10) : ctx.rect(0, 0, w, 40);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 21);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(w / 80, 0.5, 1);
  s.renderOrder = 10;
  return s;
}
