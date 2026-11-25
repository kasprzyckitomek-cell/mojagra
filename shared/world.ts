// Proceduralny generator świata – identyczny wynik na kliencie i serwerze dla tego samego seeda.
import { Simplex } from './noise';
import { mulberry32, hash3, pickWeighted, smoothstep } from './rng';
import { BIOME_TABLES, OBJ } from './data/objects';

export const CHUNK = 32;
export type Biome = 'ocean' | 'beach' | 'grass' | 'forest' | 'swamp' | 'rocky' | 'savanna' | 'desert' | 'mushroom' | 'ruins' | 'birchwood' | 'heath' | 'autumnwood' | 'tundra';

export interface StaticObj {
  id: number;
  type: string;
  x: number;
  z: number;
  r: number;
  s: number;
}

export interface POI {
  id: number;
  type: string;
  x: number;
  z: number;
  clear: number; // promień wolny od innych obiektów
  idx?: number;
}

export const SIZES: Record<string, number> = { small: 768, medium: 1536, large: 2560 };

export class WorldGen {
  seed: number;
  size: number;
  chunks: number;
  resMul: number;
  private A: Simplex;
  private B: Simplex;
  private C: Simplex;
  private W: Simplex;
  cells: { x: number; z: number; b: Biome }[] = [];
  spawn = { x: 0, z: 0 };
  pois: POI[] = [];
  private poiChunks = new Map<number, POI[]>();
  private cache = new Map<number, StaticObj[]>();

  constructor(seed: number, size: number, resMul = 1) {
    this.seed = seed >>> 0;
    this.size = size;
    this.chunks = Math.ceil(size / CHUNK);
    this.resMul = resMul;
    this.A = new Simplex(this.seed ^ 0x1234);
    this.B = new Simplex(this.seed ^ 0xbeef);
    this.C = new Simplex(this.seed ^ 0x7777);
    this.W = new Simplex(this.seed ^ 0x4242);
    this.buildCells();
    this.buildPOIs();
  }

  // ---------- Teren ----------
  landMask(x: number, z: number): number {
    const dx = x / this.size - 0.5, dz = z / this.size - 0.5;
    let d = Math.sqrt(dx * dx + dz * dz) * 2;
    d += this.A.fbm(x / 260, z / 260, 3) * 0.2;
    return 1 - smoothstep(0.74, 0.98, d);
  }

  height(x: number, z: number): number {
    const land = this.landMask(x, z);
    let h = 1.6 + (this.B.fbm(x / 180, z / 180, 4) * 0.5 + 0.5) * 6 + Math.max(0, this.C.fbm(x / 90, z / 90, 3)) * 6;
    h = h * land - (1 - land) * 14;
    return h;
  }

  biome(x: number, z: number): Biome {
    const h = this.height(x, z);
    if (h < 0) return 'ocean';
    if (h < 0.9) return 'beach';
    return this.cellBiome(x, z);
  }

  cellBiome(x: number, z: number): Biome {
    const wx = x + this.W.noise(x / 110, z / 110) * 45;
    const wz = z + this.W.noise(z / 110 + 50, x / 110) * 45;
    let best = 1e18, b: Biome = 'grass';
    for (const c of this.cells) {
      const d = (c.x - wx) * (c.x - wx) + (c.z - wz) * (c.z - wz);
      if (d < best) { best = d; b = c.b; }
    }
    return b;
  }

  isWater(x: number, z: number) {
    return this.height(x, z) < 0.05;
  }

  private buildCells() {
    const g = Math.max(3, Math.round(this.size / 300));
    const r = mulberry32(this.seed ^ 0xabc);
    const cell = this.size / g;
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < g; i++)
      for (let j = 0; j < g; j++) {
        const x = (i + 0.5 + (r() - 0.5) * 0.7) * cell;
        const z = (j + 0.5 + (r() - 0.5) * 0.7) * cell;
        if (this.landMask(x, z) > 0.25) pts.push({ x, z });
      }
    const c = this.size / 2;
    pts.sort((a, b) => (a.x - c) ** 2 + (a.z - c) ** 2 - ((b.x - c) ** 2 + (b.z - c) ** 2));
    const base: Biome[] = ['forest', 'savanna', 'rocky', 'swamp', 'mushroom', 'desert', 'birchwood', 'heath', 'autumnwood', 'tundra'];
    const order: Biome[] = [];
    while (order.length < pts.length + 8) {
      const extra: Biome[] = [...base, 'forest', 'grass'];
      for (let i = extra.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [extra[i], extra[j]] = [extra[j], extra[i]]; }
      order.push(...extra);
    }
    // pierwsza (najbliżej środka) = łąki startowe, ostatnia (najdalej) = ruiny
    pts.forEach((p, idx) => {
      let b: Biome;
      if (idx === 0) b = 'grass';
      else if (idx === pts.length - 1) b = 'ruins';
      else b = order[idx - 1];
      this.cells.push({ x: p.x, z: p.z, b });
    });
    // gwarancja obecności każdego biomu
    const need: Biome[] = ['forest', 'savanna', 'rocky', 'swamp', 'mushroom', 'desert', 'birchwood', 'heath', 'autumnwood', 'tundra'];
    for (const b of need) {
      if (!this.cells.some((c) => c.b === b) && this.cells.length > 2) {
        const counts = new Map<Biome, number>();
        this.cells.forEach((c) => counts.set(c.b, (counts.get(c.b) || 0) + 1));
        const victim = this.cells.slice(1, -1).find((c) => (counts.get(c.b) || 0) > 1);
        if (victim) victim.b = b;
      }
    }
    this.spawn = this.findLand(this.cells[0].x, this.cells[0].z, r);
  }

  private findLand(x: number, z: number, r: () => number, minH = 1.2, biome?: Biome): { x: number; z: number } {
    for (let t = 0; t < 400; t++) {
      const rad = t * 1.5;
      const a = r() * Math.PI * 2;
      const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      if (px < 10 || pz < 10 || px > this.size - 10 || pz > this.size - 10) continue;
      if (this.height(px, pz) > minH && (!biome || this.biome(px, pz) === biome)) return { x: px, z: pz };
    }
    return { x, z };
  }

  private randomLand(r: () => number, biome?: Biome): { x: number; z: number } {
    for (let t = 0; t < 2000; t++) {
      const x = 20 + r() * (this.size - 40), z = 20 + r() * (this.size - 40);
      const h = this.height(x, z);
      if (h > 1.2 && (!biome || this.biome(x, z) === biome)) return { x, z };
    }
    return { ...this.spawn };
  }

  private buildPOIs() {
    const r = mulberry32(this.seed ^ 0x9090);
    let id = 1;
    const add = (type: string, p: { x: number; z: number }, clear: number, idx?: number) => {
      const poi: POI = { id: id++, type, x: p.x, z: p.z, clear, idx };
      this.pois.push(poi);
      return poi;
    };
    add('portal', this.spawn, 9);
    const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
    const cellsOf = (b: Biome) => this.cells.filter((c, i) => c.b === b && i !== 0);
    const pickCell = (bs: Biome[], minD: number, used: Set<any>) => {
      const cand = this.cells.filter((c, i) => i !== 0 && bs.includes(c.b) && !used.has(c) && dist(c, this.spawn) >= minD);
      cand.sort((a, b) => dist(a, this.spawn) - dist(b, this.spawn));
      return cand[0];
    };
    const used = new Set<any>();
    // wioska
    const vc = pickCell(['grass', 'savanna'], 120, used) || pickCell(['forest', 'grass', 'savanna'], 60, used);
    const vpos = vc ? this.findLand(vc.x, vc.z, r, 1.5) : this.findLand(this.spawn.x + 140, this.spawn.z, r, 1.5);
    if (vc) used.add(vc);
    add('village_fire', vpos, 16);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      add('pig_house', { x: vpos.x + Math.cos(a) * 11, z: vpos.z + Math.sin(a) * 11 }, 3);
    }
    // ruiny i rdzeń
    const ruins = this.cells.find((c) => c.b === 'ruins');
    const rpos = ruins ? this.findLand(ruins.x, ruins.z, r, 1.5, 'ruins') : this.randomLand(r);
    add('ancient_core', rpos, 12);
    // legowiska bossów
    const lair = (type: string, b: Biome, clear: number) => {
      const c = cellsOf(b).find((cc) => !used.has(cc));
      if (c) used.add(c);
      const p = c ? this.findLand(c.x, c.z, r, 1.5, b) : this.randomLand(r, undefined);
      add(type, p, clear);
    };
    lair('queen_nest', 'forest', 7);
    lair('titan_lair', 'desert', 6);
    lair('mole_mound', 'rocky', 7);
    const sc = pickCell(['grass', 'savanna'], 100, used);
    add('storm_nest', sc ? this.findLand(sc.x, sc.z, r, 1.5) : this.randomLand(r, 'savanna'), 7);
    // kręgi kamienne w czterech ćwiartkach
    const c = this.size / 2;
    const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    quads.forEach(([qx, qz], i) => {
      const p = this.findLand(c + qx * this.size * 0.22, c + qz * this.size * 0.22, r, 1.5);
      add('stone_circle', p, 6, i);
    });
    for (let i = 0; i < 3; i++) add('shrine', this.randomLand(r), 3, i);
    for (let i = 0; i < 7; i++) add('camp_chest', this.randomLand(r), 3, i);
    for (let i = 0; i < 10; i++) add('note', this.randomLand(r), 1.5, i);
    for (let i = 0; i < 3; i++) {
      let p = this.randomLand(r);
      for (let t = 0; t < 300; t++) {
        const x = 20 + r() * (this.size - 40), z = 20 + r() * (this.size - 40);
        const h = this.height(x, z);
        if (h > 0.2 && h < 0.85) { p = { x, z }; break; }
      }
      add('wreck', p, 4, i);
    }
    for (const p of this.pois) {
      const k = this.chunkKey(Math.floor(p.x / CHUNK), Math.floor(p.z / CHUNK));
      if (!this.poiChunks.has(k)) this.poiChunks.set(k, []);
      this.poiChunks.get(k)!.push(p);
    }
  }

  chunkKey(cx: number, cz: number) {
    return cz * 10000 + cx;
  }

  // ---------- Obiekty statyczne ----------
  chunkObjects(cx: number, cz: number): StaticObj[] {
    const key = this.chunkKey(cx, cz);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const out: StaticObj[] = [];
    if (cx < 0 || cz < 0 || cx >= this.chunks || cz >= this.chunks) {
      this.cache.set(key, out);
      return out;
    }
    const r = mulberry32(hash3(this.seed, cx, cz));
    const G = 6, cs = CHUNK / G;
    const base = 10000 + (cz * this.chunks + cx) * 64;
    let i = 0;
    const nearPOIs = this.poisNear(cx * CHUNK + CHUNK / 2, cz * CHUNK + CHUNK / 2, CHUNK + 20);
    for (let gx = 0; gx < G; gx++)
      for (let gz = 0; gz < G; gz++) {
        const x = cx * CHUNK + (gx + r()) * cs;
        const z = cz * CHUNK + (gz + r()) * cs;
        const rot = r() * Math.PI * 2, s = 0.8 + r() * 0.45, roll = r(), dens = r();
        const id = base + i++;
        if (dens > this.resMul) continue;
        const b = this.biome(x, z);
        if (b === 'ocean') continue;
        const table = BIOME_TABLES[b];
        if (!table) continue;
        const type = pickWeighted(table, roll);
        if (type === '_') continue;
        let blocked = false;
        for (const p of nearPOIs) if ((p.x - x) ** 2 + (p.z - z) ** 2 < p.clear * p.clear) { blocked = true; break; }
        if (blocked) continue;
        out.push({ id, type, x, z, r: rot, s });
      }
    // dodatkowe wartości gęstości dla lasów
    const pl = this.poiChunks.get(key);
    if (pl) for (const p of pl) out.push({ id: p.id, type: p.type, x: p.x, z: p.z, r: (p.id * 1.7) % 6.28, s: 1 });
    this.cache.set(key, out);
    if (this.cache.size > 4000) {
      const first = this.cache.keys().next().value as number;
      this.cache.delete(first);
    }
    return out;
  }

  poisNear(x: number, z: number, rad: number) {
    return this.pois.filter((p) => Math.abs(p.x - x) < rad && Math.abs(p.z - z) < rad);
  }

  objectsNear(x: number, z: number, rad: number): StaticObj[] {
    const res: StaticObj[] = [];
    const c0x = Math.floor((x - rad) / CHUNK), c1x = Math.floor((x + rad) / CHUNK);
    const c0z = Math.floor((z - rad) / CHUNK), c1z = Math.floor((z + rad) / CHUNK);
    const r2 = rad * rad;
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++)
        for (const o of this.chunkObjects(cx, cz)) if ((o.x - x) ** 2 + (o.z - z) ** 2 <= r2) res.push(o);
    return res;
  }

  objectById(id: number): StaticObj | undefined {
    if (id < 10000) {
      const p = this.pois.find((pp) => pp.id === id);
      return p ? { id: p.id, type: p.type, x: p.x, z: p.z, r: 0, s: 1 } : undefined;
    }
    const idx = Math.floor((id - 10000) / 64);
    const cx = idx % this.chunks, cz = Math.floor(idx / this.chunks);
    return this.chunkObjects(cx, cz).find((o) => o.id === id);
  }

  blockRadius(type: string) {
    return OBJ[type]?.block ?? 0;
  }
}

export function chunkOf(x: number, z: number) {
  return [Math.floor(x / CHUNK), Math.floor(z / CHUNK)] as const;
}
