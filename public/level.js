// Deterministyczny generator poziomu: każdy gracz dostaje te same platformy.
export const SECTIONS = 12;
export const PER_SECTION = 7;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generateLevel(seed = 1337) {
  const r = mulberry32(seed);
  const plats = [];
  const start = { x: 0, y: 0, z: 0, size: 8, section: 0, kind: 'start', hue: 200 };
  plats.push(start);

  let cur = start;
  let lastDir = [0, -1];
  const total = SECTIONS * (PER_SECTION + 1);
  let count = 0;

  for (let s = 1; s <= SECTIONS; s++) {
    for (let i = 0; i <= PER_SECTION; i++) {
      const isCp = i === PER_SECTION;
      const isFinal = isCp && s === SECTIONS;
      const t = count / total;
      count++;

      const size = isCp ? 5 : Math.max(1.6, 4 - 2.4 * t + (r() - 0.5) * 0.6);
      let gap = 1.3 + 1.7 * t + r() * 0.3;
      // z lodu trudno się rozpędzić, więc skok z lodu jest krótszy
      if (isCp || cur.kind === 'ice') gap = Math.min(gap, 2.2);
      const dy = 0.25 + 0.7 * t + r() * 0.25;
      const y = cur.y + dy;

      // wybór kierunku: bez zawracania, bez kolizji z wcześniejszymi platformami
      const order = DIRS.filter((d) => !(d[0] === -lastDir[0] && d[1] === -lastDir[1]))
        .map((d) => [r(), d]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      const lat = (r() - 0.5) * Math.min(size, cur.size) * 0.7;

      let chosen = null;
      for (const d of order) {
        const dist = cur.size / 2 + gap + size / 2;
        const x = cur.x + d[0] * dist + (d[0] === 0 ? lat : 0);
        const z = cur.z + d[1] * dist + (d[1] === 0 ? lat : 0);
        let ok = true;
        for (const p of plats) {
          if (p === cur) continue;
          if (Math.abs(p.y - y) > 3.4) continue;
          const m = 1.2;
          if (Math.abs(p.x - x) < (p.size + size) / 2 + m && Math.abs(p.z - z) < (p.size + size) / 2 + m) { ok = false; break; }
        }
        if (ok) { chosen = { d, x, z }; break; }
      }
      if (!chosen) throw new Error(`Brak miejsca na platformę ${count} (seed ${seed})`);

      // lód od sekcji 4, tylko na zwykłych platformach
      const kind = isFinal ? 'finish' : isCp ? 'checkpoint' : (s >= 4 && r() < 0.18 + 0.02 * s ? 'ice' : 'normal');
      const plat = { x: chosen.x, y, z: chosen.z, size, section: s, kind, hue: (s * 31 + 180) % 360, gap, dy };
      plats.push(plat);
      lastDir = chosen.d;
      cur = plat;
    }
  }
  return plats;
}
