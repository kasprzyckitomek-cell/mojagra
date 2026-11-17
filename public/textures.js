// Proceduralne tekstury bloków: 12 motywów (po jednym na sekcję) + lód + pęknięte platformy.
import * as THREE from 'three';

const S = 128;

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mk() { const c = document.createElement('canvas'); c.width = c.height = S; return c; }
function bevel(g, a = 0.16) {
  g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S);
  g.fillStyle = `rgba(0,0,0,${a + 0.08})`; g.fillRect(0, S - 3, S, 3); g.fillRect(S - 3, 0, 3, S);
}
function speck(g, r, n, cols, s0, s1, alpha = 1) {
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(r() * cols.length) | 0];
    const s = s0 + r() * (s1 - s0);
    g.fillRect(r() * S, r() * S, s, s);
  }
  g.globalAlpha = 1;
}
function fill(g, c) { g.fillStyle = c; g.fillRect(0, 0, S, S); }
function crack(g, r, color, w, n, glow = 0) {
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
  if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  for (let k = 0; k < n; k++) {
    let x = r() * S, y = r() * S;
    g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < 5; i++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  g.shadowBlur = 0;
}
function planks(g, r, horizontal) {
  const cols = ['#b7824a', '#a9733f', '#c08f55', '#9d6b3a'];
  g.save();
  if (horizontal) { g.translate(S, 0); g.rotate(Math.PI / 2); }
  for (let i = 0; i < 4; i++) {
    g.fillStyle = cols[i]; g.fillRect(i * 32, 0, 32, S);
    g.strokeStyle = 'rgba(60,35,15,.35)'; g.lineWidth = 1;
    for (let k = 0; k < 7; k++) {
      const x = i * 32 + 4 + r() * 24;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 3, 40, x - 3, 80, x, S); g.stroke();
    }
    g.fillStyle = 'rgba(40,25,10,.65)'; g.fillRect(i * 32, 0, 2, S);
    g.fillStyle = '#3a3a3a'; g.fillRect(i * 32 + 14, 6, 3, 3); g.fillRect(i * 32 + 14, S - 10, 3, 3);
  }
  g.restore();
}
function bricks(g, r, base, mortar) {
  fill(g, mortar);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 16 : 0;
    for (let col = -1; col < 4; col++) {
      const l = 52 + r() * 14 - 8;
      g.fillStyle = base[(r() * base.length) | 0];
      g.fillRect(col * 32 + off + 1.5, row * 16 + 1.5, 29, 13);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(col * 32 + off + 1.5, row * 16 + 1.5, 29, 2);
    }
  }
}

export const THEMES = [
  { id: 'meadow', name: 'Łąka', rough: 0.9,
    paint(g, r, part) {
      if (part === 'top') {
        fill(g, '#5db347'); speck(g, r, 260, ['#4f9e3b', '#74c25a', '#68b850', '#3f8a30'], 2, 6, 0.8);
        for (let i = 0; i < 80; i++) { g.strokeStyle = ['#8fd96e', '#3b8a2b'][i % 2]; g.lineWidth = 1.5; const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 5 - r() * 6); g.stroke(); }
        for (let i = 0; i < 6; i++) { g.fillStyle = ['#ffffff', '#ffd84a', '#ff7aa8'][i % 3]; g.beginPath(); g.arc(r() * S, r() * S, 2.2, 0, 6.3); g.fill(); }
        bevel(g, 0.1);
      } else {
        fill(g, '#8a5a36'); speck(g, r, 220, ['#774b2b', '#9a6840', '#6a4226', '#aaa39b'], 2, 7, 0.9);
        g.fillStyle = '#5db347'; g.fillRect(0, 0, S, 24);
        for (let x = 0; x < S; x += 8) g.fillRect(x, 18, 8, 6 + r() * 14);
        bevel(g, 0.08);
      }
    } },
  { id: 'wood', name: 'Drewno', rough: 0.8,
    paint(g, r, part) { planks(g, r, part === 'side'); bevel(g, 0.1); } },
  { id: 'sand', name: 'Pustynia', rough: 0.95,
    paint(g, r, part) {
      fill(g, '#e6cf94'); speck(g, r, 300, ['#d8bf80', '#f0dba5', '#cdb272'], 1, 4, 0.8);
      if (part === 'top') { g.strokeStyle = 'rgba(160,125,60,.35)'; g.lineWidth = 2; for (let y = 10; y < S; y += 22) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(40, y - 8, 80, y + 8, S, y); g.stroke(); } }
      else { for (let y = 0; y < S; y += 26) { g.fillStyle = y % 52 ? 'rgba(180,140,70,.35)' : 'rgba(255,240,200,.25)'; g.fillRect(0, y, S, 12); } }
      bevel(g, 0.1);
    } },
  { id: 'brick', name: 'Zamek', rough: 0.9,
    paint(g, r) { bricks(g, r, ['#a85a45', '#9a4e3b', '#b66850', '#8e4636'], '#7a756f'); bevel(g, 0.1); } },
  { id: 'moss', name: 'Mech', rough: 1,
    paint(g, r) {
      fill(g, '#6d7568');
      for (let i = 0; i < 18; i++) { g.fillStyle = ['#8a9186', '#7b8377', '#9aa095'][i % 3]; const x = (i % 4) * 32 + 2, y = ((i / 4) | 0) * 26 + 2; g.beginPath(); g.roundRect(x, y, 28, 22, 8); g.fill(); }
      for (let i = 0; i < 40; i++) { g.fillStyle = ['rgba(70,140,60,.7)', 'rgba(100,170,70,.6)'][i % 2]; g.beginPath(); g.arc(r() * S, r() * S, 3 + r() * 8, 0, 6.3); g.fill(); }
      bevel(g, 0.08);
    } },
  { id: 'snow', name: 'Śnieg', rough: 0.6,
    paint(g, r, part) {
      if (part === 'top') {
        fill(g, '#eaf4ff'); speck(g, r, 220, ['#d4e6fa', '#ffffff', '#c5dcf5'], 2, 6, 0.9);
        speck(g, r, 30, ['#ffffff'], 1, 3);
      } else {
        fill(g, '#9ed0f0'); speck(g, r, 180, ['#86c1e6', '#b6defa', '#ffffff'], 2, 6, 0.7);
        g.fillStyle = '#f4faff'; g.fillRect(0, 0, S, 26); for (let x = 0; x < S; x += 10) g.fillRect(x, 20, 10, 6 + r() * 16);
      }
      bevel(g, 0.12);
    } },
  { id: 'lava', name: 'Lawa', rough: 0.8, emissive: [0xff5a00, 2.6, 0.9],
    paint(g, r, part) {
      if (part === 'emis') { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); crack(g, r, '#ff7a1a', 3, 7, 14); return; }
      fill(g, '#2b2424'); speck(g, r, 260, ['#1f1a1a', '#3a3030', '#463a3a'], 2, 8, 0.8);
      crack(g, r, '#ff7a1a', 3, 7, 6); bevel(g, 0.06);
    }, hasEmis: true },
  { id: 'marble', name: 'Marmur', rough: 0.25,
    paint(g, r, part) {
      fill(g, '#f2efe6'); speck(g, r, 80, ['#e6e2d6', '#fff'], 3, 9, 0.6);
      g.strokeStyle = 'rgba(120,120,135,.55)'; g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(r() * S, 0); g.bezierCurveTo(r() * S, 40, r() * S, 80, r() * S, S); g.stroke(); }
      g.strokeStyle = 'rgba(200,160,60,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, r() * S); g.bezierCurveTo(40, r() * S, 80, r() * S, S, r() * S); g.stroke();
      bevel(g, 0.14);
    } },
  { id: 'crystal', name: 'Kryształy', rough: 0.2, metal: 0.2, emissive: [0xb07bff, 1.0, 0.5],
    paint(g, r, part) {
      if (part === 'emis') { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); for (let i = 0; i < 14; i++) { g.fillStyle = ['#ff7ad9', '#7ad9ff', '#b07bff'][i % 3]; g.globalAlpha = 0.5; g.beginPath(); g.arc(r() * S, r() * S, 3 + r() * 9, 0, 6.3); g.fill(); } g.globalAlpha = 1; return; }
      fill(g, part === 'top' ? '#6a45d8' : '#463099');
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `hsla(${255 + r() * 50},70%,${35 + r() * 35}%,.65)`;
        g.beginPath(); g.moveTo(r() * S, r() * S); g.lineTo(r() * S, r() * S); g.lineTo(r() * S, r() * S); g.fill();
      }
      bevel(g, 0.18);
    }, hasEmis: true },
  { id: 'neon', name: 'Neon', rough: 0.35, metal: 0.4, emissive: [0x00e5ff, 2.4, 0.8],
    paint(g, r, part) {
      if (part === 'emis') {
        g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = '#00e5ff'; g.lineWidth = 4; g.shadowColor = '#00e5ff'; g.shadowBlur = 10;
        if (part === 'emis') { g.strokeRect(8, 8, S - 16, S - 16); g.beginPath(); g.moveTo(8, S / 2); g.lineTo(S - 8, S / 2); g.moveTo(S / 2, 8); g.lineTo(S / 2, S - 8); g.stroke(); }
        g.shadowBlur = 0; g.fillStyle = '#ff2bd6'; g.fillRect(20, 20, 8, 8); g.fillRect(S - 28, S - 28, 8, 8);
        return;
      }
      fill(g, '#0e1c2f'); speck(g, r, 120, ['#13263d', '#0a1424'], 3, 10, 0.8);
      g.strokeStyle = '#1f3a5a'; g.lineWidth = 2; g.strokeRect(8, 8, S - 16, S - 16); bevel(g, 0.1);
    }, hasEmis: true },
  { id: 'space', name: 'Stacja', rough: 0.4, metal: 0.55, emissive: [0x4fc3ff, 2.2, 0.6],
    paint(g, r, part) {
      if (part === 'emis') { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.fillStyle = '#4fc3ff'; g.shadowColor = '#4fc3ff'; g.shadowBlur = 10; for (const [x, y] of [[16, 16], [S - 16, 16], [16, S - 16], [S - 16, S - 16]]) { g.beginPath(); g.arc(x, y, 4, 0, 6.3); g.fill(); } g.fillRect(34, S - 12, 60, 4); g.shadowBlur = 0; return; }
      fill(g, '#39425a'); speck(g, r, 100, ['#434d68', '#2e364c'], 3, 9, 0.7);
      g.strokeStyle = '#222a3d'; g.lineWidth = 3; g.strokeRect(4, 4, S - 8, S - 8); g.beginPath(); g.moveTo(S / 2, 4); g.lineTo(S / 2, S - 4); g.stroke();
      bevel(g, 0.14);
    }, hasEmis: true },
  { id: 'gold', name: 'Złoto', rough: 0.3, metal: 0.55, emissive: [0xffc83a, 0.25, 0.5],
    paint(g, r, part) {
      const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#f6cf55'); gr.addColorStop(0.5, '#e0a91c'); gr.addColorStop(1, '#f2c64a');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      speck(g, r, 80, ['#fff1a8', '#c8901a'], 2, 6, 0.5);
      g.strokeStyle = 'rgba(120,70,0,.5)'; g.lineWidth = 3; g.strokeRect(6, 6, S - 12, S - 12);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(10, 10); g.lineTo(60, 10); g.lineTo(10, 60); g.fill();
      bevel(g, 0.2);
    } },
  // 12: lód (specjalna platforma)
  { id: 'ice', name: 'Lód', rough: 0.1, metal: 0.1,
    paint(g, r, part) {
      fill(g, part === 'top' ? '#a9e3ff' : '#7fc6ee'); speck(g, r, 160, ['#c9f0ff', '#8fd3f5', '#ffffff'], 2, 9, 0.6);
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; crack(g, r, 'rgba(255,255,255,.7)', 1.5, 6);
      bevel(g, 0.2);
    } },
];
export const ICE = THEMES.length - 1;

const cache = new Map();

function toBump(src) {
  const c = mk(); const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, S, S);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = d.data[i] * 0.3 + d.data[i + 1] * 0.55 + d.data[i + 2] * 0.15;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  return c;
}
function tex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// zwraca { top:{map,bump,emis}, side:{map,bump}, cfg }
export function getTheme(index, variant = 'normal') {
  const key = index + variant;
  if (cache.has(key)) return cache.get(key);
  const th = THEMES[index];
  const out = { cfg: th, top: {}, side: {} };
  const parts = { top: mk(), side: mk() };
  for (const part of ['top', 'side']) {
    const c = parts[part]; const g = c.getContext('2d');
    th.paint(g, rng(index * 131 + (part === 'top' ? 1 : 2)), part);
    if (part === 'top' && variant === 'crumble') {
      g.fillStyle = 'rgba(30,15,5,.28)'; g.fillRect(0, 0, S, S);
      crack(g, rng(77), 'rgba(20,10,0,.9)', 3, 9);
      g.strokeStyle = 'rgba(255,220,160,.5)'; g.lineWidth = 1; crack(g, rng(77), 'rgba(255,220,160,.45)', 1, 9);
    }
    out[part].map = tex(c, true);
    out[part].bump = tex(toBump(c), false);
  }
  if (th.hasEmis) {
    const c = mk(); th.paint(c.getContext('2d'), rng(index * 131 + 3), 'emis');
    out.top.emis = tex(c, true);
    // dla boków neonu/stacji/lawy: ta sama mapa świecenia
    out.side.emis = out.top.emis;
  }
  cache.set(key, out);
  return out;
}

// materiały dla platformy (klony tekstur z odpowiednim powtarzaniem)
export function platformMaterials(themeIndex, variant, size, animated) {
  const base = getTheme(themeIndex, variant);
  const th = base.cfg;
  const rep = (t, rx, ry) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); return c; };
  const mkMat = (part, rx, ry) => {
    const o = base[part];
    const m = new THREE.MeshStandardMaterial({
      map: rep(o.map, rx, ry), bumpMap: rep(o.bump, rx, ry), bumpScale: 1.6,
      roughness: th.rough ?? 0.85, metalness: th.metal ?? 0,
    });
    if (th.emissive && o.emis) {
      m.emissiveMap = rep(o.emis, rx, ry);
      m.emissive = new THREE.Color(th.emissive[0]);
      m.emissiveIntensity = th.emissive[1];
      if (animated) animated.push({ mat: m, base: th.emissive[1], amp: th.emissive[2], phase: Math.random() * 6.28 });
    }
    return m;
  };
  const top = mkMat('top', size, size);
  const side = mkMat('side', size, 1);
  const bottom = new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 1 });
  return [side, side, top, bottom, side, side];
}
