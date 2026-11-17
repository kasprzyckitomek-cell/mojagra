// Wspolna logika trybu "czat prowadzi postac" (serwer + klient).
// Mapa: lancuch platform po 5 kratek (pentomino). Jeden glos = ruch o dokladnie jedna kratke.

export const COMMANDS = ['gora', 'dol', 'lewo', 'prawo', 'czekaj'];
export const DIRS = { gora: [0, -1], dol: [0, 1], lewo: [-1, 0], prawo: [1, 0] };
export const OPPOSITE = { gora: 'dol', dol: 'gora', lewo: 'prawo', prawo: 'lewo', czekaj: 'czekaj' };

const ALIASES = {
  gora: 'gora', 'góra': 'gora', w: 'gora', up: 'gora', g: 'gora',
  dol: 'dol', 'dół': 'dol', s: 'dol', down: 'dol',
  lewo: 'lewo', a: 'lewo', left: 'lewo', l: 'lewo',
  prawo: 'prawo', d: 'prawo', right: 'prawo', p: 'prawo',
  czekaj: 'czekaj', x: 'czekaj', wait: 'czekaj', stop: 'czekaj',
};
export function parseCommand(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim().toLowerCase();
  if (!t || t.length > 20) return null;
  if (t[0] === '!') t = t.slice(1);
  return ALIASES[t] || null;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ZONES = [
  { name: 'Dzielnica Neonów', color: '#ff2bd6', color2: '#00e5ff' },
  { name: 'Zaułki Deszczu', color: '#2b8cff', color2: '#7cf7ff' },
  { name: 'Fabryka Dronów', color: '#ff9a1f', color2: '#ff3b3b' },
  { name: 'Szyby Wentylacyjne', color: '#39ff88', color2: '#00b3ff' },
  { name: 'Giełda Danych', color: '#ffe600', color2: '#ff2bd6' },
  { name: 'Katedra Serwerów', color: '#a855ff', color2: '#00ffd5' },
  { name: 'Lodowa Sieć', color: '#9fe8ff', color2: '#ffffff' },
  { name: 'Rdzeń', color: '#ff1744', color2: '#ffd1dc' },
];

const BASE = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  L: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]],
  Y: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1]],
  N: [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3]],
  P: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
  U: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  V: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  W: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]],
  X: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  Z: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],
  F: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
};
function variants(cells) {
  const seen = new Set(); const out = [];
  for (let m = 0; m < 8; m++) {
    let c = cells.map(([x, y]) => {
      let a = x, b = y;
      for (let r = 0; r < (m & 3); r++) { const t = a; a = -b; b = t; }
      if (m & 4) a = -a;
      return [a, b];
    });
    const mx = Math.min(...c.map((p) => p[0])), my = Math.min(...c.map((p) => p[1]));
    c = c.map(([a, b]) => [a - mx, b - my]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const k = c.join(';');
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  }
  return out;
}
const SHAPES = Object.entries(BASE).map(([name, cells]) => ({ name, vars: variants(cells) }));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function bfsInShape(cells, start) {
  const key = (c) => c[0] + ',' + c[1];
  const set = new Map(cells.map((c, i) => [key(c), i]));
  const dist = new Array(cells.length).fill(-1), prev = new Array(cells.length).fill(-1);
  dist[start] = 0; const q = [start];
  while (q.length) {
    const i = q.shift();
    for (const [dx, dz] of N4) {
      const j = set.get((cells[i][0] + dx) + ',' + (cells[i][1] + dz));
      if (j !== undefined && dist[j] < 0) { dist[j] = dist[i] + 1; prev[j] = i; q.push(j); }
    }
  }
  return { dist, prev };
}

export function generateMap(seed = 20260101, platformCount = 240) {
  const rng = mulberry32(seed);
  const tiles = []; const platforms = [];
  const grid = new Map(); // "x,z" -> [id]
  const gget = (x, z) => grid.get(x + ',' + z) || [];
  const add = (x, y, z, p) => {
    const id = tiles.length;
    tiles.push({ x, y, z, t: 'normal', p });
    const k = x + ',' + z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
    return id;
  };
  const removeLast = (n) => {
    for (let i = 0; i < n; i++) {
      const tl = tiles.pop(); const arr = grid.get(tl.x + ',' + tl.z); arr.pop(); if (!arr.length) grid.delete(tl.x + ',' + tl.z);
    }
  };

  // platforma startowa: X
  {
    const cells = BASE.X.map(([x, z]) => [x - 1, z - 1]);
    const ids = cells.map(([x, z]) => add(x, 0, z, 0));
    const entry = ids[2]; // srodek
    const { dist } = bfsInShape(cells, 2);
    const cand = ids.map((id, i) => i).filter((i) => i !== 2);
    const ex = pick(rng, cand);
    platforms.push({ id: 0, shape: 'X', zone: 0, tiles: ids, entry, exit: ids[ex], route: [entry, ids[ex]] });
  }

  const dirTries = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let lastDir = [0, -1];
  const failCount = [];
  let guard = 0;
  while (platforms.length < platformCount) {
    if (++guard > platformCount * 400) throw new Error('generateMap: nie udalo sie zbudowac mapy');
    const prev = platforms[platforms.length - 1];
    const ex = tiles[prev.exit];
    let placed = false;
    const order = shuffle(rng, dirTries.slice()).sort((a, b) => {
      const w = (d) => (d[0] === lastDir[0] && d[1] === lastDir[1] ? 0 : d[0] === -lastDir[0] && d[1] === -lastDir[1] ? 2 : 1);
      return w(a) + rng() * 1.6 - (w(b) + rng() * 1.6);
    });
    outer:
    for (let attempt = 0; attempt < 30; attempt++) {
      const shape = pick(rng, SHAPES);
      const vr = pick(rng, shape.vars);
      const r = rng();
      const dy = r < 0.45 ? 1 : r < 0.9 ? 0 : -1;
      for (const d of order) {
        const tx = ex.x + d[0], tz = ex.z + d[1], ty = ex.y + dy;
        for (const ei of shuffle(rng, [0, 1, 2, 3, 4])) {
          const ox = tx - vr[ei][0], oz = tz - vr[ei][1];
          let ok = true;
          for (let i = 0; i < 5 && ok; i++) {
            const x = ox + vr[i][0], z = oz + vr[i][1];
            for (const id of gget(x, z)) if (Math.abs(tiles[id].y - ty) < 4) { ok = false; break; }
            if (!ok) break;
            for (const [nx, nz] of N4) {
              for (const id of gget(x + nx, z + nz)) {
                if (Math.abs(tiles[id].y - ty) <= 1 && !(i === ei && id === prev.exit)) { ok = false; break; }
              }
              if (!ok) break;
            }
          }
          if (!ok) continue;
          const pi = platforms.length;
          const ids = vr.map(([cx, cz]) => add(ox + cx, ty, oz + cz, pi));
          const { dist, prev: pr } = bfsInShape(vr, ei);
          const maxd = Math.max(...dist);
          const far = dist.map((v, i) => (v === maxd ? i : -1)).filter((i) => i >= 0);
          const xi = pick(rng, far);
          const route = []; for (let c = xi; c !== -1; c = pr[c]) route.push(ids[c]); route.reverse();
          platforms.push({ id: pi, shape: shape.name, zone: 0, tiles: ids, entry: ids[ei], exit: ids[xi], route });
          lastDir = d; placed = true; break outer;
        }
      }
    }
    if (!placed) { // cofnij ostatnia platforme i sprobuj inaczej
      if (platforms.length <= 1) throw new Error('generateMap: ugrzezlismy na starcie');
      const last = platforms.pop(); removeLast(last.tiles.length);
      lastDir = pick(rng, dirTries);
    }
  }

  // strefy, typy kratek
  const N = platforms.length;
  for (const p of platforms) p.zone = Math.min(ZONES.length - 1, Math.floor((p.id * ZONES.length) / N));
  const route = []; // globalna trasa (id kratek)
  for (const p of platforms) for (const id of p.route) route.push(id);
  const isRoute = new Set(route);
  const HAZ = new Set(['blink', 'laser', 'crumble']);
  let prevHaz = false;
  for (const p of platforms) {
    const t = p.id / (N - 1);
    const d = 0.15 + 0.85 * Math.pow(t, 0.8);
    const hp = 0.08 + 0.55 * d;
    p.diff = d;
    for (let ri = 0; ri < p.route.length; ri++) {
      const id = p.route[ri]; const tl = tiles[id];
      const special = p.id === 0 || (id === p.exit && (p.id % 15 === 0 || p.id === N - 1));
      if (special) { prevHaz = false; continue; }
      if (!prevHaz && rng() < hp) {
        const r = rng();
        tl.t = r < 0.45 ? 'blink' : r < 0.7 ? 'laser' : 'crumble';
        if (tl.t === 'blink') { tl.per = 6 + Math.floor(rng() * 4); tl.on = Math.max(2, tl.per - (2 + Math.floor(d * 3))); tl.ph = Math.floor(rng() * tl.per); }
        if (tl.t === 'laser') { tl.per = 7 + Math.floor(rng() * 5); tl.on = 2 + Math.floor(d * 2); tl.ph = Math.floor(rng() * tl.per); }
        prevHaz = true;
      } else prevHaz = false;
    }
    // przenosniki i glitch na trasie
    for (let ri = 0; ri < p.route.length - 1; ri++) {
      const id = p.route[ri]; const tl = tiles[id]; const nx = tiles[p.route[ri + 1]];
      if (tl.t !== 'normal' || id === p.entry && p.id === 0) continue;
      if (!HAZ.has(nx.t) && nx.t === 'normal' && rng() < 0.07) tl.t = 'conveyor';
      else if (rng() < 0.03 + 0.1 * d) tl.t = 'glitch';
    }
    // galezie: puapki
    let bonus = false;
    for (const id of p.tiles) {
      if (isRoute.has(id)) continue;
      const tl = tiles[id]; const r = rng();
      if (p.id > 0 && r < 0.14 + 0.32 * d) tl.t = 'shock';
      else if (!bonus && r > 0.93) { tl.t = 'bonus'; bonus = true; }
      else if (r > 0.8 && p.id > 0) { tl.t = 'blink'; tl.per = 6 + Math.floor(rng() * 4); tl.on = tl.per - 3; tl.ph = Math.floor(rng() * tl.per); }
    }
  }
  for (const p of platforms) if (p.id > 0 && p.id % 15 === 0 && p.id < N - 1) tiles[p.exit].t = 'checkpoint';
  tiles[platforms[N - 1].exit].t = 'finish';
  tiles[platforms[0].entry].t = 'start';
  tiles[platforms[0].entry].t = 'normal';

  const map = { seed, tiles, platforms, route, zones: ZONES };
  return buildIndex(map);
}

export function buildIndex(map) {
  const grid = new Map();
  map.tiles.forEach((t, id) => { const k = t.x + ',' + t.z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id); });
  map.grid = grid;
  map.routeIdx = new Map(map.route.map((id, i) => [id, i]));
  map.start = map.platforms[0].entry;
  map.finish = map.platforms[map.platforms.length - 1].exit;
  return map;
}
export function compactMap(map) {
  return { seed: map.seed, tiles: map.tiles, platforms: map.platforms.map((p) => ({ id: p.id, shape: p.shape, zone: p.zone, tiles: p.tiles, entry: p.entry, exit: p.exit, route: p.route, diff: p.diff })), route: map.route };
}

export function neighbor(map, id, dirName) {
  const d = DIRS[dirName]; if (!d) return -1;
  const t = map.tiles[id];
  const arr = map.grid.get((t.x + d[0]) + ',' + (t.z + d[1]));
  if (!arr) return -1;
  for (const j of arr) if (Math.abs(map.tiles[j].y - t.y) <= 1) return j;
  return -1;
}

export function newState(map) {
  return { pos: map.start, tick: 0, history: [map.start], cp: map.start, cpHist: 0, shield: 0, blackout: 0, chaos: 0, glitch: false, crumbleAt: {}, sabotage: {}, bonusTaken: {}, won: false, moves: 0, falls: 0, setbacks: 0, maxRoute: 0, events: 0, lastEvent: '' };
}

// stan kratki w danym ticku: 'ok' | 'void' | 'shock'
export function tileMode(map, state, id, tick) {
  const t = map.tiles[id];
  const sab = state.sabotage[id]; if (sab !== undefined && tick < sab) return 'shock';
  switch (t.t) {
    case 'blink': { const on = state.chaos > 0 ? Math.max(1, t.on - 2) : t.on; return ((tick + t.ph) % t.per) < on ? 'ok' : 'void'; }
    case 'laser': { const on = t.on; return ((tick + t.ph) % t.per) >= t.per - on ? 'shock' : 'ok'; }
    case 'crumble': { const at = state.crumbleAt[id]; return at !== undefined && tick >= at && tick < at + 25 ? 'void' : 'ok'; }
    case 'shock': return 'shock';
    default: return 'ok';
  }
}
export const isHazard = (t) => t === 'blink' || t === 'laser' || t === 'crumble';

function rewind(map, state, k) {
  const minLen = state.cpHist + 1;
  const from = state.pos;
  const newLen = Math.max(minLen, state.history.length - k);
  state.history.length = newLen;
  state.pos = state.history[newLen - 1];
  state.setbacks++;
  return { k: 'rewind', from, to: state.pos, n: k };
}

function land(map, state, id, steps) {
  const t = map.tiles[id];
  state.pos = id;
  const ri = map.routeIdx.get(id); if (ri !== undefined && ri > state.maxRoute) state.maxRoute = ri;
  if (t.t === 'checkpoint') { state.cp = id; state.cpHist = state.history.length - 1; steps.push({ k: 'cp', at: id }); }
  else if (t.t === 'finish') { state.won = true; steps.push({ k: 'win', at: id }); }
  else if (t.t === 'crumble') state.crumbleAt[id] = state.tick + 2;
  else if (t.t === 'bonus' && !state.bonusTaken[id]) { state.bonusTaken[id] = 1; state.shield = Math.min(3, state.shield + 1); steps.push({ k: 'bonus', at: id }); }
  else if (t.t === 'glitch') state.glitch = true;
}

// jeden tick glosowania. cmd: nazwa komendy. Zwraca liste krokow do animacji.
export function applyTick(map, state, cmd, rng = Math.random) {
  const steps = [];
  if (state.won) return steps;
  state.tick++;
  if (state.blackout > 0) { state.blackout--; cmd = OPPOSITE[cmd] || cmd; }
  if (state.chaos > 0) state.chaos--;
  if (cmd !== 'czekaj' && DIRS[cmd]) {
    if (state.glitch) { cmd = pick(rng, Object.keys(DIRS)); state.glitch = false; steps.push({ k: 'glitch', dir: cmd }); }
    const nb = neighbor(map, state.pos, cmd);
    if (nb < 0) steps.push({ k: 'blocked', dir: cmd });
    else {
      const from = state.pos;
      state.history.push(nb); state.moves++;
      steps.push({ k: 'move', from, to: nb, dir: cmd });
      land(map, state, nb, steps);
      const t = map.tiles[nb];
      if (t.t === 'conveyor' && !state.won) {
        const p = map.platforms[t.p]; const i = p.route.indexOf(nb);
        if (i >= 0 && i < p.route.length - 1) {
          const n2 = p.route[i + 1];
          state.history.push(n2);
          steps.push({ k: 'slide', from: nb, to: n2 });
          land(map, state, n2, steps);
        }
      }
    }
  } else steps.push({ k: 'wait' });
  if (state.won) return steps;
  const mode = tileMode(map, state, state.pos, state.tick);
  if (mode !== 'ok') {
    if (state.shield > 0) {
      state.shield--;
      const from = state.pos;
      if (state.history.length > state.cpHist + 1) { state.history.pop(); state.pos = state.history[state.history.length - 1]; }
      steps.push({ k: 'bounce', from, to: state.pos });
    } else if (mode === 'void') {
      const from = state.pos;
      state.history.length = state.cpHist + 1; state.pos = state.cp; state.falls++;
      steps.push({ k: 'fall', from, to: state.pos });
    } else {
      steps.push(Object.assign({ shock: true }, rewind(map, state, 3)));
    }
  }
  return steps;
}

export const EVENT_TYPES = {
  cofniecie: { title: 'AWARIA SIECI', desc: 'Cofnięcie o kilka pól!' },
  jackpot: { title: 'JACKPOT', desc: 'Teleport do przodu!' },
  blackout: { title: 'BLACKOUT', desc: 'Sterowanie odwrócone!' },
  burza: { title: 'BURZA DANYCH', desc: 'Kratki szaleją!' },
  zamrozenie: { title: 'ZAMROŻENIE', desc: 'System zawieszony na 30 s' },
  tarcza: { title: 'TARCZA', desc: '+1 tarcza ochronna' },
  sabotaz: { title: 'SABOTAŻ', desc: 'Kratki przed nami pod napięciem!' },
};
export function pickEvent(rng, state) {
  const w = { cofniecie: 25, jackpot: 10, blackout: 15, burza: 15, zamrozenie: 12, tarcza: 12, sabotaz: 11 };
  if (state.lastEvent !== 'cofniecie' && state.events % 2 === 1) return 'cofniecie';
  if (state.lastEvent) w[state.lastEvent] = 0;
  const tot = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rng() * tot;
  for (const [k, v] of Object.entries(w)) { if ((r -= v) < 0) return k; }
  return 'cofniecie';
}
export function applyEvent(map, state, type, rng = Math.random) {
  const steps = []; const info = Object.assign({ type }, EVENT_TYPES[type]);
  state.events++; state.lastEvent = type;
  switch (type) {
    case 'cofniecie': { const k = 3 + Math.floor(rng() * 6); info.n = k; steps.push(rewind(map, state, k)); break; }
    case 'jackpot': {
      const i = map.routeIdx.get(state.pos);
      if (i === undefined) { state.shield = Math.min(3, state.shield + 2); info.desc = '+2 tarcze!'; break; }
      const j = 4 + Math.floor(rng() * 4);
      const to = Math.min(map.route.length - 2, i + j);
      const from = state.pos;
      for (let r = i + 1; r <= to; r++) {
        state.history.push(map.route[r]);
        const t = map.tiles[map.route[r]];
        if (t.t === 'checkpoint') { state.cp = map.route[r]; state.cpHist = state.history.length - 1; }
        if (t.t === 'crumble') state.crumbleAt[map.route[r]] = state.tick + 2;
      }
      state.pos = map.route[to]; if (to > state.maxRoute) state.maxRoute = to;
      info.n = to - i; steps.push({ k: 'teleport', from, to: state.pos });
      // pozycja po teleporcie ma byc bezpieczna: jesli hazard, przesun do poprzedniej bezpiecznej
      while (state.history.length > 1 && tileMode(map, state, state.pos, state.tick + 1) !== 'ok' && map.tiles[state.pos].t !== 'normal') {
        state.history.pop(); state.pos = state.history[state.history.length - 1];
      }
      break;
    }
    case 'blackout': state.blackout = 25; break;
    case 'burza': state.chaos = 12; break;
    case 'zamrozenie': info.freezeMs = 30000; break;
    case 'tarcza': state.shield = Math.min(3, state.shield + 1); break;
    case 'sabotaz': {
      const i = map.routeIdx.get(state.pos);
      if (i !== undefined) for (let r = i + 2; r <= Math.min(map.route.length - 2, i + 10); r++) {
        const t = map.tiles[map.route[r]];
        if (t.t === 'normal' && rng() < 0.45) state.sabotage[map.route[r]] = state.tick + 20;
      }
      break;
    }
  }
  return { info, steps };
}

export function tally(votes, rng = Math.random) {
  const c = { gora: 0, dol: 0, lewo: 0, prawo: 0, czekaj: 0 };
  for (const v of Object.values(votes)) if (c[v] !== undefined) c[v]++;
  const max = Math.max(...Object.values(c));
  if (max === 0) return { winner: 'czekaj', counts: c, total: 0 };
  const top = Object.keys(c).filter((k) => c[k] === max);
  return { winner: pick(rng, top), counts: c, total: Object.values(c).reduce((a, b) => a + b, 0) };
}

// pomoc dla testow / autogry: najlepszy ruch wzdluz trasy
export function botMove(map, state) {
  if (map.tiles[state.pos] === undefined) return 'czekaj';
  const cur = map.routeIdx.get(state.pos);
  let target;
  if (cur !== undefined) target = map.route[cur + 1];
  else { // na galezi: wracamy BFS po kratkach do najblizszej kratki trasy
    const q = [state.pos]; const prev = new Map([[state.pos, -1]]); let found = -1;
    while (q.length) {
      const id = q.shift(); if (map.routeIdx.has(id)) { found = id; break; }
      for (const d of Object.keys(DIRS)) { const n = neighbor(map, id, d); if (n >= 0 && !prev.has(n)) { prev.set(n, id); q.push(n); } }
    }
    if (found < 0) return 'czekaj';
    let c = found; while (prev.get(c) !== state.pos && prev.get(c) !== -1) c = prev.get(c);
    target = c;
  }
  if (target === undefined) return 'czekaj';
  const mode = tileMode(map, state, target, state.tick + 1);
  const t = map.tiles[target];
  if (mode !== 'ok') return 'czekaj';
  if (t.t === 'blink' && tileMode(map, state, target, state.tick + 2) !== 'ok' && false) return 'czekaj';
  for (const d of Object.keys(DIRS)) if (neighbor(map, state.pos, d) === target) return d;
  return 'czekaj';
}
