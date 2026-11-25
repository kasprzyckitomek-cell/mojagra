// Teren (chunki z kolorami biomów), woda i instancjonowane obiekty świata.
import * as THREE from 'three';
import { WorldGen, CHUNK, StaticObj, Biome } from '../shared/world';
import { objGeometry, vcMat } from './models';
import { mulberry32, hash3 } from '../shared/rng';
import { OBJ } from '../shared/data/objects';
import type { Season } from '../shared/env';

const SEG = 16;
// Kolor trawy/gruntu biomu (jak w Minecrafcie – płynnie mieszany między biomami)
const BIOME_COL: Record<Biome, number> = {
  ocean: 0x3a4a44, beach: 0xc8b07a, grass: 0x6e8c30, forest: 0x3c6428, swamp: 0x4e5a2c, rocky: 0x7a786a, savanna: 0xb4a048,
  desert: 0xd2b07a, mushroom: 0x5c4c74, ruins: 0x6e6a5c, birchwood: 0x82a83a, heath: 0x7a5e6a, autumnwood: 0xa0702c, tundra: 0xa8b4a8,
};
// typ podłoża: 0 = trawa, 1 = piasek/śnieg, 2 = skała
const BIOME_GROUND: Record<Biome, number> = {
  ocean: 1, beach: 1, grass: 0, forest: 0, swamp: 0, rocky: 1.8, savanna: 0.2, desert: 1, mushroom: 0.1, ruins: 2, birchwood: 0, heath: 0.3, autumnwood: 0, tundra: 0.75,
};
const SEASON_TINT: Record<Season, [number, number, number]> = { autumn: [1.15, 0.94, 0.7], winter: [1, 1, 1], spring: [0.92, 1.1, 0.9], summer: [1.18, 1.06, 0.74] };
const GRASS_REF = new THREE.Color(0x66722f);

/** Mnożnik koloru dla roślin (kępy trawy, krzaki) – żeby pasowały do trawy biomu. */
export function grassTint(gen: WorldGen, x: number, z: number, season: Season, out = new THREE.Color()) {
  let r = 0, g = 0, b = 0;
  const S = [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]];
  const c = new THREE.Color();
  for (const [dx, dz] of S) { c.setHex(BIOME_COL[gen.biome(x + dx, z + dz)]); r += c.r; g += c.g; b += c.b; }
  out.setRGB(r / 5 / GRASS_REF.r, g / 5 / GRASS_REF.g, b / 5 / GRASS_REF.b);
  if (season !== 'winter') { const t = SEASON_TINT[season]; out.r *= t[0]; out.g *= t[1]; out.b *= t[2]; }
  else out.lerp(new THREE.Color(1.6, 1.6, 1.7), 0.5);
  out.r = Math.min(1.9, Math.max(0.4, out.r)); out.g = Math.min(1.9, Math.max(0.4, out.g)); out.b = Math.min(1.9, Math.max(0.4, out.b));
  return out;
}

// ---------- Proceduralne tekstury gruntu (szarości – barwione kolorem biomu) ----------
function makeTex(draw: (g: CanvasRenderingContext2D, S: number) => void) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  draw(g, S);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rnd = mulberry32(1234);
function wrapDraw(S: number, x: number, y: number, f: (x: number, y: number) => void) {
  f(x, y);
  if (x < 40) f(x + S, y); if (x > S - 40) f(x - S, y);
  if (y < 40) f(x, y + S); if (y > S - 40) f(x, y - S);
}
function grassTexture() {
  return makeTex((g, S) => {
    g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, S, S);
    // duże plamy jasności
    for (let i = 0; i < 60; i++) {
      const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 70, v = 120 + rnd() * 50;
      wrapDraw(S, x, y, (xx, yy) => { const gr = g.createRadialGradient(xx, yy, 0, xx, yy, r); gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(xx - r, yy - r, r * 2, r * 2); });
    }
    // źdźbła trawy
    g.lineCap = 'round';
    for (let i = 0; i < 9000; i++) {
      const x = rnd() * S, y = rnd() * S, len = 5 + rnd() * 11, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
      const v = Math.floor(90 + rnd() * 120);
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.lineWidth = 1 + rnd() * 1.4;
      wrapDraw(S, x, y, (xx, yy) => { g.beginPath(); g.moveTo(xx, yy); g.quadraticCurveTo(xx + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 3, yy + Math.sin(a) * len * 0.5, xx + Math.cos(a) * len, yy + Math.sin(a) * len); g.stroke(); });
    }
    // ciemne prześwity ziemi
    for (let i = 0; i < 400; i++) { const x = rnd() * S, y = rnd() * S; g.fillStyle = `rgba(40,36,30,${0.15 + rnd() * 0.25})`; wrapDraw(S, x, y, (xx, yy) => { g.beginPath(); g.arc(xx, yy, 1 + rnd() * 2.5, 0, 7); g.fill(); }); }
  });
}
function sandTexture() {
  return makeTex((g, S) => {
    g.fillStyle = '#a8a8a8'; g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) { const v = 150 + (rnd() - 0.5) * 70; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; }
    g.putImageData(img, 0, 0);
    // fale piasku i kamyczki
    for (let i = 0; i < 40; i++) { const y = rnd() * S; g.strokeStyle = 'rgba(90,90,90,0.18)'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 6); g.stroke(); }
    for (let i = 0; i < 500; i++) { const x = rnd() * S, y = rnd() * S, v = Math.floor(70 + rnd() * 120); g.fillStyle = `rgb(${v},${v},${v})`; wrapDraw(S, x, y, (xx, yy) => { g.beginPath(); g.arc(xx, yy, 0.8 + rnd() * 2, 0, 7); g.fill(); }); }
  });
}
function rockTexture() {
  return makeTex((g, S) => {
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * S, y = rnd() * S, r = 14 + rnd() * 40, v = Math.floor(100 + rnd() * 70);
      wrapDraw(S, x, y, (xx, yy) => { g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.4); g.lineTo(xx + Math.cos(a) * rr, yy + Math.sin(a) * rr); } g.closePath(); g.fill(); g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 2; g.stroke(); });
    }
    for (let i = 0; i < 2000; i++) { const x = rnd() * S, y = rnd() * S, v = Math.floor(60 + rnd() * 140); g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(x, y, 1.5, 1.5); }
  });
}

export class Terrain {
  group = new THREE.Group();
  chunks = new Map<number, THREE.Mesh>();
  mat: THREE.MeshLambertMaterial;
  water: THREE.Mesh;
  season: Season = 'autumn';

  constructor(public gen: WorldGen, scene: THREE.Scene) {
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const tg = grassTexture(), ts = sandTexture(), tr = rockTexture();
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: tg }; sh.uniforms.tSand = { value: ts }; sh.uniforms.tRock = { value: tr };
      sh.vertexShader = 'attribute float gtype;\nvarying float vG;\nvarying vec2 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vG = gtype;\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D tGrass;\nuniform sampler2D tSand;\nuniform sampler2D tRock;\nvarying float vG;\nvarying vec2 vWPos;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
        vec2 wuv = vWPos * 0.16;
        // dwie skale próbkowania – brak widocznego powtarzania kafli
        vec3 tgc = texture2D(tGrass, wuv).rgb * 0.65 + texture2D(tGrass, wuv * 0.23 + 0.37).rgb * 0.35;
        vec3 tsc = texture2D(tSand, wuv * 0.8).rgb;
        vec3 trc = texture2D(tRock, wuv * 0.45).rgb;
        vec3 tex = mix(tgc, tsc, clamp(vG, 0.0, 1.0));
        tex = mix(tex, trc, clamp(vG - 1.0, 0.0, 1.0));
        tex = mix(vec3(dot(tex, vec3(0.333))), tex, 1.0);
        tex = (tex - 0.55) * 1.45 + 0.55;
        diffuseColor.rgb *= max(tex, 0.05) * 1.85;`);
    };
    scene.add(this.group);
    const wg = new THREE.PlaneGeometry(900, 900, 60, 60);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color: 0x1e3a48, transparent: true, opacity: 0.88, shininess: 40, specular: 0x506a70, flatShading: true }));
    this.water.position.y = -0.05;
    this.water.receiveShadow = false;
    scene.add(this.water);
  }

  private tmp = new THREE.Color();
  /** Kolor gruntu w punkcie – średnia z kilku próbek, więc biomy przechodzą płynnie jak w Minecrafcie. */
  colorAt(x: number, z: number, h: number, outG?: { g: number }): THREE.Color {
    const c = new THREE.Color(0, 0, 0);
    let gt = 0;
    const S = [[0, 0], [6, 2], [-5, 5], [2, -6], [-6, -3]];
    for (const [dx, dz] of S) {
      const bb = h < 0 && dx === 0 ? 'ocean' : this.gen.biome(x + dx, z + dz);
      this.tmp.setHex(BIOME_COL[bb]);
      c.r += this.tmp.r / 5; c.g += this.tmp.g / 5; c.b += this.tmp.b / 5;
      gt += BIOME_GROUND[bb] / 5;
    }
    const b = this.gen.biome(x, z);
    if (h < 0) { c.setHex(h > -2 ? 0xc8b07a : 0x4a5a56); gt = 1; }
    else if (h < 1.1) { const k = 1 - h / 1.1; c.lerp(new THREE.Color(BIOME_COL.beach), k); gt = gt + (1 - gt) * k; }
    if (this.season === 'winter' && b !== 'ocean' && b !== 'desert') {
      c.lerp(new THREE.Color(0xdde2e2), b === 'beach' ? 0.5 : 0.85);
      gt = Math.max(gt, 0.9);
    } else if (b === 'tundra') {
      c.lerp(new THREE.Color(0xdde2e2), 0.35);
    } else if (b !== 'ocean') {
      const t = SEASON_TINT[this.season];
      c.r *= t[0]; c.g *= t[1]; c.b *= t[2];
    }
    if (outG) outG.g = gt;
    // łagodne plamy koloru + jaśniejsze szczyty
    const patch = Math.sin(x * 0.071 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.063 + Math.sin(x * 0.043) * 2);
    const k = 0.92 + Math.min(0.12, h * 0.01) + patch * 0.07;
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
    const gta = new Float32Array(pos.count);
    const x0 = cx * CHUNK + CHUNK / 2, z0 = cz * CHUNK + CHUNK / 2;
    const og = { g: 0 };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + x0, z = pos.getZ(i) + z0;
      const h = this.gen.height(x, z);
      pos.setY(i, h);
      const c = this.colorAt(x, z, h, og);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      gta[i] = og.g;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('gtype', new THREE.BufferAttribute(gta, 1));
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
      const gta = geo.attributes.gtype as THREE.BufferAttribute;
      const og = { g: 0 };
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + m.position.x, z = pos.getZ(i) + m.position.z;
        const c = this.colorAt(x, z, pos.getY(i), og);
        col.setXYZ(i, c.r, c.g, c.b);
        gta.setX(i, og.g);
      }
      col.needsUpdate = true;
      gta.needsUpdate = true;
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
const SWAY = new Set(['tree_pine', 'tree_pine_snow', 'tree_birch', 'tree_maple', 'heather', 'tree_dead', 'mushtree', 'palm', 'grass', 'sapling', 'reeds', 'flowers', 'berry_bush', 'berry_bush_empty', 'deco_tuft', 'carrot', 'glowcap', 'cactus']);

const TINTED = new Set(['grass', 'grass_picked', 'deco_tuft', 'sapling', 'berry_bush', 'berry_bush_empty']);

export class WorldObjects {
  group = new THREE.Group();
  meshes = new Map<string, THREE.InstancedMesh>();
  state = new Map<number, string>(); // id -> stan z serwera
  chunks = new Set<number>(); // chunki aktywne (od serwera)
  dirty = true;
  lastBuild = 0;
  visible: StaticObj[] = [];
  mat = vcMat();
  swayMat = vcMat();
  swayU = { value: 0 };
  windU = { value: 1 };
  season: Season = 'autumn';
  private deco = new Map<number, { type: string; x: number; z: number; r: number; s: number }[]>();
  private instMap = new Map<string, number[]>();

  constructor(public gen: WorldGen, scene: THREE.Scene) {
    scene.add(this.group);
    // kołysanie roślin na wietrze (shader wierzchołków)
    this.swayMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.swayU;
      sh.uniforms.uWind = this.windU;
      sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sw = max(0.0, transformed.y - 0.35);
        transformed.x += sin(uTime * 1.3 + ip.x * 0.37 + ip.z * 0.21) * sw * 0.035 * uWind;
        transformed.z += cos(uTime * 1.1 + ip.x * 0.23 + ip.z * 0.31) * sw * 0.025 * uWind;`);
    };
  }

  /** Drobne, nieinteraktywne detale gruntu (kępki, kamyki, patyki) – tylko po stronie klienta. */
  decoFor(cx: number, cz: number) {
    const key = this.gen.chunkKey(cx, cz);
    let d = this.deco.get(key);
    if (d) return d;
    d = [];
    const r = mulberry32(hash3(this.gen.seed ^ 0x5eed, cx, cz));
    for (let i = 0; i < 44; i++) {
      const x = cx * CHUNK + r() * CHUNK, z = cz * CHUNK + r() * CHUNK, roll = r(), rot = r() * 6.28, sc = 0.7 + r() * 0.7;
      const b = this.gen.biome(x, z);
      let type = '';
      if (b === 'grass' || b === 'savanna' || b === 'swamp' || b === 'birchwood' || b === 'heath') type = roll < 0.75 ? 'deco_tuft' : 'deco_pebble';
      else if (b === 'autumnwood') type = roll < 0.5 ? 'deco_twig' : 'deco_tuft';
      else if (b === 'tundra') type = roll < 0.6 ? 'deco_pebble' : roll < 0.75 ? 'deco_tuft' : '';
      else if (b === 'forest') type = roll < 0.45 ? 'deco_twig' : roll < 0.85 ? 'deco_tuft' : 'deco_pebble';
      else if (b === 'rocky' || b === 'ruins' || b === 'mushroom') type = roll < 0.8 ? 'deco_pebble' : 'deco_twig';
      else if (b === 'desert') type = roll < 0.06 ? 'deco_skull' : roll < 0.6 ? 'deco_pebble' : '';
      else if (b === 'beach') type = roll < 0.4 ? 'deco_pebble' : '';
      if (type) d.push({ type, x, z, r: rot, s: sc });
    }
    this.deco.set(key, d);
    if (this.deco.size > 3000) this.deco.delete(this.deco.keys().next().value as number);
    return d;
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
        case 'heather': return 'heather_picked';
        default: return null;
      }
    }
    if (t === 'berry_bush' && this.season === 'winter') return 'berry_bush_empty';
    if (t === 'tree_pine' && (this.season === 'winter' || this.gen.biome(o.x, o.z) === 'tundra')) return 'tree_pine_snow';
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
      for (const dd of this.decoFor(cx, cz)) {
        if ((dd.x - px) ** 2 + (dd.z - pz) ** 2 > r2 * 0.5) continue;
        if (!counts.has(dd.type)) counts.set(dd.type, []);
        counts.get(dd.type)!.push({ id: 0, type: dd.type, x: dd.x, z: dd.z, r: dd.r, s: dd.s });
      }
      for (const o of this.gen.chunkObjects(cx, cz)) {
        if ((o.x - px) ** 2 + (o.z - pz) ** 2 > r2) continue;
        this.visible.push(o);
        const rt = this.renderType(o);
        if (!rt) continue;
        if (!counts.has(rt)) counts.set(rt, []);
        counts.get(rt)!.push(o);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), gtc = new THREE.Color();
    for (const [rt, list] of counts) {
      let im = this.meshes.get(rt);
      if (!im || im.instanceMatrix.count < list.length) {
        if (im) { this.group.remove(im); im.dispose(); }
        const geo = objGeometry(rt);
        if (!geo) continue;
        im = new THREE.InstancedMesh(geo, SWAY.has(rt) ? this.swayMat : this.mat, Math.ceil(list.length * 1.4) + 16);
        im.castShadow = !rt.startsWith('deco_') && !['grass', 'grass_picked', 'flint', 'rocks', 'sand', 'clay', 'note', 'rabbit_hole', 'titan_lair', 'tentacle_spot', 'flowers', 'carrot', 'mushroom'].includes(rt);
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
        const s = o.id < 10000 && o.id > 0 ? 1 : o.s;
        sc.set(s, s, s);
        m4.compose(v, q, sc);
        im!.setMatrixAt(i, m4);
        // wariacja kolorów + pory roku
        let tint = 0.9 + ((o.id * 2654435761) % 1000) / 1000 * 0.2;
        col.setRGB(tint, tint, tint);
        if (TINTED.has(rt)) { grassTint(this.gen, o.x, o.z, this.season, gtc); col.setRGB(gtc.r * tint, gtc.g * tint, gtc.b * tint); }
        else if (this.season === 'autumn' && rt === 'tree_birch') col.setRGB(1.5 * tint, 0.95 * tint, 0.45 * tint);
        im!.setColorAt(i, col);
        if (o.id) ids.push(o.id);
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
