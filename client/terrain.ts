// Teren (chunki z kolorami biomów), woda i instancjonowane obiekty świata.
import * as THREE from 'three';
import { WorldGen, CHUNK, StaticObj, Biome } from '../shared/world';
import { objGeometry, vcMat } from './models';
import { OBJ } from '../shared/data/objects';
import type { Season } from '../shared/env';

const SEG = 16;
const BIOME_COL: Record<Biome, number[]> = {
  ocean: [0x22404e], beach: [0xb09a6c, 0xa69064], grass: [0x5c6a2c, 0x66722f, 0x535f28], forest: [0x2f3d22, 0x354325, 0x2a3620],
  swamp: [0x343e28, 0x3a4229, 0x2e3623], rocky: [0x6a645a, 0x726b5e, 0x5f5a50], savanna: [0x9a8846, 0xa4904c, 0x8e7e40],
  desert: [0xbfa16a, 0xc6a871, 0xb59762], mushroom: [0x3c3250, 0x443858, 0x352c48], ruins: [0x5a5448, 0x524c42, 0x625b4e],
};
const SEASON_TINT: Record<Season, [number, number, number]> = { autumn: [1.18, 0.92, 0.65], winter: [1, 1, 1], spring: [0.92, 1.08, 0.92], summer: [1.2, 1.08, 0.72] };

export class Terrain {
  group = new THREE.Group();
  chunks = new Map<number, THREE.Mesh>();
  mat: THREE.MeshLambertMaterial;
  water: THREE.Mesh;
  season: Season = 'autumn';

  constructor(public gen: WorldGen, scene: THREE.Scene) {
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    scene.add(this.group);
    const wg = new THREE.PlaneGeometry(900, 900, 60, 60);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color: 0x1e3a48, transparent: true, opacity: 0.88, shininess: 40, specular: 0x506a70, flatShading: true }));
    this.water.position.y = -0.05;
    this.water.receiveShadow = false;
    scene.add(this.water);
  }

  colorAt(x: number, z: number, h: number): THREE.Color {
    const b = this.gen.biome(x, z);
    const arr = BIOME_COL[b];
    const n = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const c = new THREE.Color(arr[Math.floor(n * arr.length)]);
    if (b === 'ocean') {
      c.setHex(h > -2 ? 0xc8b07a : 0x4a6a6a);
    }
    if (this.season === 'winter' && b !== 'ocean' && b !== 'desert') {
      const snow = b === 'beach' ? 0.5 : 0.85;
      c.lerp(new THREE.Color(0xd8dcd8), snow);
    } else if (b !== 'ocean') {
      const t = SEASON_TINT[this.season];
      if (b === 'grass' || b === 'forest' || b === 'savanna' || b === 'swamp') { c.r *= t[0]; c.g *= t[1]; c.b *= t[2]; }
    }
    // łagodne plamy koloru + jaśniejsze szczyty
    const patch = Math.sin(x * 0.071 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.063 + Math.sin(x * 0.043) * 2);
    const k = 0.9 + Math.min(0.16, h * 0.012) + patch * 0.08;
    c.multiplyScalar(k);
    return c;
  }

  buildChunk(cx: number, cz: number) {
    const key = this.gen.chunkKey(cx, cz);
    if (this.chunks.has(key)) return;
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const x0 = cx * CHUNK + CHUNK / 2, z0 = cz * CHUNK + CHUNK / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + x0, z = pos.getZ(i) + z0;
      const h = this.gen.height(x, z);
      pos.setY(i, h);
      const c = this.colorAt(x, z, h);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.mat);
    m.position.set(x0, 0, z0);
    m.receiveShadow = true;
    m.userData.chunk = key;
    this.group.add(m);
    this.chunks.set(key, m);
  }

  removeChunk(key: number) {
    const m = this.chunks.get(key);
    if (!m) return;
    this.group.remove(m);
    m.geometry.dispose();
    this.chunks.delete(key);
  }

  recolorAll() {
    for (const [key, m] of this.chunks) {
      const geo = m.geometry;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const col = geo.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + m.position.x, z = pos.getZ(i) + m.position.z;
        const c = this.colorAt(x, z, pos.getY(i));
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
      void key;
    }
  }

  update(px: number, pz: number, radius: number, t: number) {
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const want = new Set<number>();
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > (radius + 0.5) ** 2) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= this.gen.chunks || z >= this.gen.chunks) continue;
        const k = this.gen.chunkKey(x, z);
        want.add(k);
      }
    let built = 0;
    // najpierw najbliższe
    const order = [...want].filter((k) => !this.chunks.has(k)).map((k) => [k, (k % 10000 - cx) ** 2 + (Math.floor(k / 10000) - cz) ** 2]).sort((a, b) => a[1] - b[1]);
    for (const [k] of order) {
      if (built++ > 3) break;
      this.buildChunk(k % 10000, Math.floor(k / 10000));
    }
    for (const k of [...this.chunks.keys()]) if (!want.has(k)) this.removeChunk(k);
    this.water.position.x = Math.round(px / 15) * 15;
    this.water.position.z = Math.round(pz / 15) * 15;
    const wp = this.water.geometry.attributes.position as THREE.BufferAttribute;
    if (Math.floor(t * 10) % 2 === 0) {
      for (let i = 0; i < wp.count; i++) {
        const x = wp.getX(i) + this.water.position.x, z = wp.getZ(i) + this.water.position.z;
        wp.setY(i, Math.sin(x * 0.15 + t * 1.3) * 0.12 + Math.cos(z * 0.13 + t * 1.1) * 0.12);
      }
      wp.needsUpdate = true;
      this.water.geometry.computeVertexNormals();
    }
  }
}

// =====================================================================
// Obiekty świata – instancjonowanie per typ wyglądu
// =====================================================================
export class WorldObjects {
  group = new THREE.Group();
  meshes = new Map<string, THREE.InstancedMesh>();
  state = new Map<number, string>(); // id -> stan z serwera
  chunks = new Set<number>(); // chunki aktywne (od serwera)
  dirty = true;
  lastBuild = 0;
  visible: StaticObj[] = [];
  mat = vcMat();
  season: Season = 'autumn';
  private instMap = new Map<string, number[]>();

  constructor(public gen: WorldGen, scene: THREE.Scene) {
    scene.add(this.group);
  }

  renderType(o: StaticObj): string | null {
    const s = this.state.get(o.id);
    const t = o.type;
    if (s === 'gone') return null;
    if (s === 'stump') return 'stump';
    if (s === 'opened') return t === 'camp_chest' ? 'camp_chest_open' : t;
    if (s === 'picked') {
      switch (t) {
        case 'sapling': return 'sapling_picked';
        case 'grass': return 'grass_picked';
        case 'berry_bush': return 'berry_bush_empty';
        case 'reeds': return 'reeds_picked';
        case 'cactus': return 'cactus_picked';
        case 'glowcap': return 'glowcap_picked';
        default: return null;
      }
    }
    if (t === 'berry_bush' && this.season === 'winter') return 'berry_bush_empty';
    if (t === 'tree_pine' && this.season === 'winter') return 'tree_pine_snow';
    if (OBJ[t]?.hidden) return t === 'tentacle_spot' ? 'tentacle_spot' : null;
    return t;
  }

  isAlive(o: StaticObj) {
    const s = this.state.get(o.id);
    return !s || s === 'ok';
  }

  rebuild(px: number, pz: number, radius: number) {
    this.dirty = false;
    const counts = new Map<string, StaticObj[]>();
    const r2 = radius * radius;
    this.visible = [];
    for (const key of this.chunks) {
      const cx = key % 10000, cz = Math.floor(key / 10000);
      if ((cx * CHUNK + 16 - px) ** 2 + (cz * CHUNK + 16 - pz) ** 2 > (radius + 32) ** 2) continue;
      for (const o of this.gen.chunkObjects(cx, cz)) {
        if ((o.x - px) ** 2 + (o.z - pz) ** 2 > r2) continue;
        this.visible.push(o);
        const rt = this.renderType(o);
        if (!rt) continue;
        if (!counts.has(rt)) counts.set(rt, []);
        counts.get(rt)!.push(o);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (const [rt, list] of counts) {
      let im = this.meshes.get(rt);
      if (!im || im.instanceMatrix.count < list.length) {
        if (im) { this.group.remove(im); im.dispose(); }
        const geo = objGeometry(rt);
        if (!geo) continue;
        im = new THREE.InstancedMesh(geo, this.mat, Math.ceil(list.length * 1.4) + 16);
        im.castShadow = !['grass', 'grass_picked', 'flint', 'rocks', 'sand', 'clay', 'note', 'rabbit_hole', 'titan_lair', 'tentacle_spot', 'flowers', 'carrot', 'mushroom'].includes(rt);
        im.receiveShadow = false;
        im.frustumCulled = false;
        this.group.add(im);
        this.meshes.set(rt, im);
      }
      const ids: number[] = [];
      list.forEach((o, i) => {
        const y = this.gen.height(o.x, o.z);
        v.set(o.x, y - 0.05, o.z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.r);
        const s = o.id < 10000 ? 1 : o.s;
        sc.set(s, s, s);
        m4.compose(v, q, sc);
        im!.setMatrixAt(i, m4);
        // wariacja kolorów + pory roku
        let tint = 0.9 + ((o.id * 2654435761) % 1000) / 1000 * 0.2;
        col.setRGB(tint, tint, tint);
        if (this.season === 'autumn' && (rt === 'tree_birch' || rt === 'berry_bush' || rt === 'sapling')) col.setRGB(1.5 * tint, 0.95 * tint, 0.45 * tint);
        if (this.season === 'summer' && (rt === 'grass' || rt === 'tree_birch')) col.setRGB(1.15 * tint, 1.05 * tint, 0.7 * tint);
        im!.setColorAt(i, col);
        ids.push(o.id);
      });
      im.count = list.length;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.instMap.set(rt, ids);
    }
    for (const [rt, im] of this.meshes) if (!counts.has(rt)) im.count = 0;
  }

  /** Obiekty interaktywne w pobliżu punktu */
  near(x: number, z: number, r: number): StaticObj[] {
    const res: StaticObj[] = [];
    for (const o of this.visible) if ((o.x - x) ** 2 + (o.z - z) ** 2 <= r * r) res.push(o);
    return res;
  }
}
