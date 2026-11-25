// Deterministyczne generatory liczb losowych i hashe (wspólne dla klienta i serwera).

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash3(a: number, b: number, c: number): number {
  let h = (a | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (b | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (c | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickWeighted<T extends string>(table: [T, number][], r: number): T {
  let total = 0;
  for (const [, w] of table) total += w;
  let x = r * total;
  for (const [k, w] of table) {
    x -= w;
    if (x <= 0) return k;
  }
  return table[table.length - 1][0];
}

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
export function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function dist2(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
