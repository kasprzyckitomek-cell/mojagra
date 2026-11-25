// Autorytatywna symulacja jednego świata (pokoju gry).
import type { WebSocket } from 'ws';
import { WorldGen, CHUNK, StaticObj } from '../shared/world';
import { clock, Clock, AMBIENT, BASE_SPEED } from '../shared/env';
import { ITEMS } from '../shared/data/items';
import { STRUCTS } from '../shared/data/structures';
import { MOBS } from '../shared/data/mobs';
import { CHAR } from '../shared/data/characters';
import { OBJ } from '../shared/data/objects';
import { QUESTS } from '../shared/data/quests';
import type { Player, OS, Struct, Drop, Mob, Proj, Slot, WorldSettings, QP } from './types';
import { addToSlots, makeSlot } from './inventory';
import { mobTick, spawnMob, damageMob, spawnersTick, bossSpawnTick } from './mobs';
import { machinesTick, energyTick } from './machines';
import { questEvent, startAutoQuests, questSummary, dailyTick } from './quests';
import { handleMessage } from './actions';

export const VIEW_CHUNKS = 5;
export const SNAP_RADIUS = 90;
const MAP_CELL = 16;

export interface CharSave {
  name: string; char: string; skin: number; x: number; z: number; r: number;
  hp: number; hunger: number; sanity: number; temp: number; wet: number;
  inv: (Slot | null)[]; equip: Player['equip']; known: string[]; quests: Record<string, QP>; tracked: string[];
  ghost: boolean; buffs: Record<string, number>; stats: Player['stats']; notes: number[]; shrines: number[]; visited: string[];
  map: string; ach: string[];
}

export class World {
  id: string;
  settings: WorldSettings;
  gen: WorldGen;
  time = 0;
  clk!: Clock;
  objState = new Map<number, OS>();
  objByChunk = new Map<number, Set<number>>();
  structs = new Map<number, Struct>();
  structByChunk = new Map<number, Set<number>>();
  drops = new Map<number, Drop>();
  mobs = new Map<number, Mob>();
  projs = new Map<number, Proj>();
  players = new Map<number, Player>();
  chars: Record<string, CharSave> = {};
  flags: Record<string, any> = {};
  wq: Record<string, QP> = {};
  daily: { day: number; tasks: any[] } = { day: 0, tasks: [] };
  nextId = 2_000_000;
  nextRaid = 0;
  raidWarned = false;
  weather = { kind: 'clear', i: 0, until: 0, next: 0, nextKind: 'rain' };
  pending: { at: number; fn: () => void }[] = [];
  spawnerNext = new Map<number, number>();
  regrowQueue: number[] = [];
  mapAll: Uint8Array;
  lastSave = 0;
  emptySince = 0;
  tickN = 0;
  dirtySave = false;
  onEmpty?: () => void;
  saveFn?: (w: World) => Promise<void>;
  private interval: NodeJS.Timeout | null = null;
  sandstorm = 0;
  lightningRods: Struct[] = [];

  constructor(id: string, settings: WorldSettings, state?: any) {
    this.id = id;
    this.settings = settings;
    this.gen = new WorldGen(settings.seed, settings.size, settings.resources);
    const cells = Math.ceil(settings.size / MAP_CELL);
    this.mapAll = new Uint8Array(Math.ceil((cells * cells) / 8));
    if (state) this.load(state);
    else {
      this.time = settings.dayLength * 0.09;
      this.nextRaid = settings.dayLength * (4.6 + Math.random());
      this.weather.next = settings.dayLength * (1 + Math.random());
    }
    this.clk = clock(this.time, settings.dayLength, settings.seasonLength);
    startAutoQuests(this, null);
  }

  // ===================== Pętla =====================
  start() {
    let last = Date.now();
    this.interval = setInterval(() => {
      const now = Date.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;
      try {
        this.tick(dt);
      } catch (e) {
        console.error('[world tick error]', this.id, e);
      }
    }, 50);
  }
  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  tick(dt: number) {
    if (this.players.size === 0) return; // świat zatrzymany, gdy nikogo nie ma
    this.tickN++;
    const prevDay = this.clk.day;
    this.time += dt;
    this.clk = clock(this.time, this.settings.dayLength, this.settings.seasonLength);
    if (this.clk.day !== prevDay) this.onNewDay();
    // efekty opóźnione (telegrafowane ataki)
    if (this.pending.length) {
      const now = this.time;
      const due = this.pending.filter((p) => p.at <= now);
      this.pending = this.pending.filter((p) => p.at > now);
      for (const p of due) p.fn();
    }
    for (const m of this.mobs.values()) mobTick(this, m, dt);
    this.projTick(dt);
    for (const p of this.players.values()) this.playerFastTick(p, dt);
    if (this.tickN % 2 === 0) this.sendSnapshots();
    if (this.tickN % 20 === 0) this.slowTick(1);
    if (this.tickN % 100 === 0) this.verySlowTick(5);
    for (const p of this.players.values()) this.flushPlayer(p);
  }

  slowTick(dt: number) {
    for (const p of this.players.values()) this.survivalTick(p, dt);
    energyTick(this);
    machinesTick(this, dt);
    this.fireTick(dt);
    this.weatherTick();
    this.raidTick();
    spawnersTick(this);
    bossSpawnTick(this);
    this.regrowTick();
    this.sendEnv();
    if (this.time - this.lastSave > 180 && this.saveFn) {
      this.lastSave = this.time;
      this.saveFn(this).catch((e) => console.error('autosave', e));
    }
  }

  verySlowTick(dt: number) {
    this.spoilTick(dt);
    for (const p of this.players.values()) this.exploreTick(p);
    if (this.tickN % 200 === 0) this.sendMaps();
    // usuwanie bardzo starych dropów
    if (this.drops.size > 600) {
      const arr = [...this.drops.values()].sort((a, b) => a.t - b.t);
      for (let i = 0; i < arr.length - 600; i++) this.removeDrop(arr[i].id);
    }
  }

  // ===================== Gracze =====================
  addPlayer(ws: WebSocket, key: string, name: string, charId: string, skin: number, admin: boolean): Player {
    const id = this.newId();
    const save = this.chars[key];
    const cd = CHAR[save?.char || charId] || CHAR.bruno;
    const cells = Math.ceil(this.settings.size / MAP_CELL);
    const p: Player = {
      id, key, name, char: cd.id, skin, ws, admin,
      x: this.gen.spawn.x + (Math.random() - 0.5) * 4, z: this.gen.spawn.z + 4 + Math.random() * 2, r: 0,
      hp: cd.hp, hunger: cd.hunger * 0.9, sanity: cd.sanity, temp: 30, wet: 0,
      maxHp: cd.hp, maxHunger: cd.hunger, maxSanity: cd.sanity,
      inv: new Array(15).fill(null), equip: { hand: null, head: null, body: null, back: null },
      known: new Set(), quests: {}, tracked: [], ghost: false, deadAt: 0, buffs: {}, status: {},
      actCd: 0, lastIn: Date.now(), anim: 0, animUntil: 0, sleeping: 0, darkT: 0, contOpen: 0,
      chunks: new Set(), chunkKey: -1,
      stats: { days: 0, kills: 0, deaths: 0, crafted: 0, cooked: 0 }, notes: [], shrines: [], shrineCd: 0,
      biome: '', visited: [], wolf: false, fishing: null,
      map: new Uint8Array(Math.ceil((cells * cells) / 8)),
      dirty: { me: true, inv: true, known: true, quests: true }, lastMeSent: 0, ach: [], emote: 0, chatCd: 0, spd: BASE_SPEED,
      joinedAt: this.time,
    };
    if (save) {
      Object.assign(p, {
        name, x: save.x, z: save.z, r: save.r, hp: save.hp, hunger: save.hunger, sanity: save.sanity, temp: save.temp, wet: save.wet,
        inv: save.inv, equip: save.equip, known: new Set(save.known), quests: save.quests, tracked: save.tracked || [],
        ghost: save.ghost, buffs: save.buffs || {}, stats: save.stats, notes: save.notes || [], shrines: save.shrines || [],
        visited: save.visited || [], ach: save.ach || [], skin: save.skin ?? skin,
      });
      if (save.map) {
        const b = Buffer.from(save.map, 'base64');
        p.map.set(b.subarray(0, p.map.length));
      }
      const bpSlots = 15 + (ITEMS[p.equip.back?.id || '']?.slots || 0);
      while (p.inv.length < bpSlots) p.inv.push(null);
    } else {
      for (const [it, n] of cd.start) addToSlots(p.inv, makeSlot(it, n));
      if (this.settings.difficulty === 'relax') addToSlots(p.inv, makeSlot('meat_cooked', 3));
      this.questStart(p, 'tut1');
      for (const q of Object.values(QUESTS)) {
        if ((q.type === 'explore') || (q.type === 'char' && q.char === p.char)) this.questStart(p, q.id);
      }
    }
    if (p.ghost) p.deadAt = this.time;
    this.players.set(id, p);
    startAutoQuests(this, p);
    this.broadcast({ t: 'sys', text: `${p.name} dołącza do świata.` });
    return p;
  }

  removePlayer(p: Player) {
    this.saveChar(p);
    this.players.delete(p.id);
    p.ws = null;
    this.broadcast({ t: 'sys', text: `${p.name} opuszcza świat.` });
    // pozbądź się cieni gracza
    for (const m of this.mobs.values()) if (m.owner === p.id) this.mobs.delete(m.id);
    if (this.players.size === 0) {
      this.emptySince = Date.now();
      this.saveFn?.(this).catch((e) => console.error('save on empty', e));
      this.onEmpty?.();
    }
  }

  saveChar(p: Player) {
    this.chars[p.key] = {
      name: p.name, char: p.char, skin: p.skin, x: p.x, z: p.z, r: p.r, hp: p.hp, hunger: p.hunger, sanity: p.sanity, temp: p.temp, wet: p.wet,
      inv: p.inv, equip: p.equip, known: [...p.known], quests: p.quests, tracked: p.tracked, ghost: p.ghost, buffs: p.buffs,
      stats: p.stats, notes: p.notes, shrines: p.shrines, visited: p.visited, map: Buffer.from(p.map).toString('base64'), ach: p.ach,
    };
  }

  questStart(p: Player, qid: string) {
    if (p.quests[qid]) return;
    const q = QUESTS[qid];
    p.quests[qid] = { g: q.goals.map(() => 0) };
    if (p.tracked.length < 3 && q.type !== 'explore') p.tracked.push(qid);
    p.dirty.quests = true;
  }

  newId() {
    return this.nextId++;
  }

  // ===================== Wiadomości =====================
  send(p: Player, msg: any) {
    if (p.ws && p.ws.readyState === 1) {
      try { p.ws.send(JSON.stringify(msg)); } catch { /* */ }
    }
  }
  broadcast(msg: any) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
  broadcastNear(x: number, z: number, rad: number, msg: any) {
    const s = JSON.stringify(msg);
    const r2 = rad * rad;
    for (const p of this.players.values()) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r2 && p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
  broadcastChunk(key: number, msg: any) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.chunks.has(key) && p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
  toast(p: Player, text: string, kind = 'info') {
    this.send(p, { t: 'toast', text, kind });
  }
  fx(x: number, z: number, k: string, extra: any = {}) {
    this.broadcastNear(x, z, 100, { t: 'fx', k, x: +x.toFixed(2), z: +z.toFixed(2), ...extra });
  }

  // ===================== Chunki =====================
  chunkKeyOf(x: number, z: number) {
    return this.gen.chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  }

  updateChunks(p: Player, force = false) {
    const cx = Math.floor(p.x / CHUNK), cz = Math.floor(p.z / CHUNK);
    const key = this.gen.chunkKey(cx, cz);
    if (key === p.chunkKey && !force) return;
    p.chunkKey = key;
    const want = new Set<number>();
    for (let dx = -VIEW_CHUNKS; dx <= VIEW_CHUNKS; dx++)
      for (let dz = -VIEW_CHUNKS; dz <= VIEW_CHUNKS; dz++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= this.gen.chunks || z >= this.gen.chunks) continue;
        want.add(this.gen.chunkKey(x, z));
      }
    const added: number[] = [];
    for (const k of want) if (!p.chunks.has(k)) added.push(k);
    const removed: number[] = [];
    for (const k of p.chunks) if (!want.has(k)) removed.push(k);
    p.chunks = want;
    if (added.length) {
      const data: any[] = [];
      for (const k of added) {
        const os: any[] = [];
        const ids = this.objByChunk.get(k);
        if (ids) for (const id of ids) { const o = this.objState.get(id); if (o) os.push([id, o.s]); }
        const ss: any[] = [];
        const sids = this.structByChunk.get(k);
        if (sids) for (const id of sids) { const s = this.structs.get(id); if (s) ss.push(this.structView(s)); }
        data.push([k, os, ss]);
      }
      this.send(p, { t: 'chunks', add: data, rem: removed });
    } else if (removed.length) this.send(p, { t: 'chunks', add: [], rem: removed });
  }

  // ===================== Obiekty statyczne =====================
  objStateOf(id: number): OS | undefined {
    return this.objState.get(id);
  }

  setObjState(o: StaticObj, s: string | null, regrowDays?: number) {
    const key = this.chunkKeyOf(o.x, o.z);
    if (s === null) {
      this.objState.delete(o.id);
      this.objByChunk.get(key)?.delete(o.id);
    } else {
      const st: OS = { s };
      if (regrowDays) {
        let days = regrowDays;
        if (this.clk.season === 'winter' && OBJ[o.type]?.winterNo) days += 3;
        st.t = this.time + days * this.settings.dayLength * (0.8 + Math.random() * 0.4);
        this.regrowQueue.push(o.id);
      }
      this.objState.set(o.id, st);
      if (!this.objByChunk.has(key)) this.objByChunk.set(key, new Set());
      this.objByChunk.get(key)!.add(o.id);
    }
    this.broadcastChunk(key, { t: 'o', id: o.id, s });
    this.dirtySave = true;
  }

  regrowTick() {
    if (this.tickN % 100 !== 0 || !this.regrowQueue.length) return;
    const keep: number[] = [];
    for (const id of this.regrowQueue) {
      const st = this.objState.get(id);
      if (!st || st.t === undefined) continue;
      if (st.t <= this.time) {
        const o = this.gen.objectById(id);
        if (!o) { this.objState.delete(id); continue; }
        // nie odrastaj pod budowlą ani tuż przy graczu
        let busy = false;
        for (const p of this.players.values()) if ((p.x - o.x) ** 2 + (p.z - o.z) ** 2 < 4) busy = true;
        if (busy) { keep.push(id); continue; }
        this.setObjState(o, null);
      } else keep.push(id);
    }
    this.regrowQueue = keep;
  }

  objAlive(o: StaticObj) {
    const st = this.objState.get(o.id);
    return !st || (st.s !== 'gone' && st.s !== 'picked' && st.s !== 'stump');
  }

  // ===================== Budowle =====================
  structView(s: Struct) {
    const def = STRUCTS[s.type];
    const v: any = { id: s.id, ty: s.type, x: +s.x.toFixed(2), z: +s.z.toFixed(2), r: +s.rot.toFixed(2), hp: Math.round((s.hp / def.hp) * 100) };
    if (def.fuelMax) v.f = Math.round(((s.fuel || 0) / def.fuelMax) * 100);
    if (s.on !== undefined) v.on = s.on ? 1 : 0;
    if (s.powered !== undefined) v.pw = s.powered ? 1 : 0;
    if (s.open) v.op = 1;
    if (s.plant) { v.pl = s.plant; v.g = Math.round((s.growth || 0) * 100); }
    else if (s.growth !== undefined) v.g = Math.round(s.growth * 100);
    if (s.burning && s.burning > this.time) v.b = 1;
    if (s.prog) v.pr = Math.round(s.prog * 100);
    return v;
  }

  addStruct(type: string, x: number, z: number, rot: number, owner: string): Struct {
    const def = STRUCTS[type];
    const s: Struct = { id: this.newId(), type, x, z, rot, hp: def.hp, owner };
    if (def.fuelMax) s.fuel = def.fuelStart ?? 0;
    if (def.slots) s.inv = new Array(def.slots).fill(null);
    if (def.machine === 'furnace') s.inv = new Array(3).fill(null);
    if (def.machine === 'generator') s.inv = new Array(1).fill(null);
    if (def.power || def.machine === 'lamp') s.on = true;
    if (def.uses) s.uses = def.uses;
    this.structs.set(s.id, s);
    const key = this.chunkKeyOf(x, z);
    if (!this.structByChunk.has(key)) this.structByChunk.set(key, new Set());
    this.structByChunk.get(key)!.add(s.id);
    this.broadcastChunk(key, { t: 'st', s: this.structView(s) });
    if (type === 'maptable') { this.flags.maptable = true; this.sendMaps(); }
    if (type === 'golem_core') {
      const g = spawnMob(this, 'golem', x + 2, z + 2);
      if (g) { g.core = s.id; s.golem = g.id; }
    }
    this.dirtySave = true;
    return s;
  }

  updateStruct(s: Struct) {
    this.broadcastChunk(this.chunkKeyOf(s.x, s.z), { t: 'st', s: this.structView(s) });
    this.dirtySave = true;
  }

  removeStruct(s: Struct, dropContents = true) {
    this.structs.delete(s.id);
    const key = this.chunkKeyOf(s.x, s.z);
    this.structByChunk.get(key)?.delete(s.id);
    if (dropContents && s.inv) for (const it of s.inv) if (it) this.spawnDrop(it, s.x, s.z);
    this.broadcastChunk(key, { t: 'sd', id: s.id });
    if (s.type === 'maptable' && ![...this.structs.values()].some((x) => x.type === 'maptable')) this.flags.maptable = false;
    if (s.golem) this.mobs.delete(s.golem);
    for (const p of this.players.values()) if (p.contOpen === s.id) { p.contOpen = 0; this.send(p, { t: 'cont', id: 0 }); }
    this.dirtySave = true;
  }

  damageStruct(s: Struct, dmg: number) {
    s.hp -= dmg;
    this.fx(s.x, s.z, 'hit', { c: 'wood' });
    if (s.hp <= 0) {
      this.fx(s.x, s.z, 'break');
      this.removeStruct(s);
    } else this.updateStruct(s);
  }

  structsNear(x: number, z: number, rad: number, filter?: (s: Struct) => boolean): Struct[] {
    const res: Struct[] = [];
    const r2 = rad * rad;
    const c0x = Math.floor((x - rad) / CHUNK), c1x = Math.floor((x + rad) / CHUNK);
    const c0z = Math.floor((z - rad) / CHUNK), c1z = Math.floor((z + rad) / CHUNK);
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++) {
        const ids = this.structByChunk.get(this.gen.chunkKey(cx, cz));
        if (!ids) continue;
        for (const id of ids) {
          const s = this.structs.get(id);
          if (s && (s.x - x) ** 2 + (s.z - z) ** 2 <= r2 && (!filter || filter(s))) res.push(s);
        }
      }
    return res;
  }

  // ===================== Dropy =====================
  spawnDrop(item: Slot, x: number, z: number, spread = 1.2) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
    let dx = x + Math.cos(a) * r, dz = z + Math.sin(a) * r;
    if (this.gen.height(dx, dz) < 0.05) { dx = x; dz = z; }
    const d: Drop = { id: this.newId(), item: { ...item }, x: dx, z: dz, t: this.time };
    this.drops.set(d.id, d);
    return d;
  }
  removeDrop(id: number) {
    this.drops.delete(id);
  }

  giveItem(p: Player, id: string, n = 1, notify = true) {
    if (n <= 0) return;
    const slot = makeSlot(id, n);
    const left = addToSlots(p.inv, slot);
    if (left > 0) {
      this.spawnDrop({ ...slot, n: left }, p.x, p.z, 0.8);
      if (notify) this.toast(p, 'Ekwipunek pełny – przedmiot upadł na ziemię.', 'warn');
    }
    p.dirty.inv = true;
    if (notify) this.send(p, { t: 'got', id: slot.id, n, m: slot.m });
    if (slot.id !== 'blueprint') questEvent(this, p, 'gather', slot.id, n);
  }

  // ===================== Pociski =====================
  spawnProj(kind: string, x: number, z: number, tx: number, tz: number, dmg: number, owner: number, ownerKind: 'p' | 'm' | 's', status?: string, speed = 26) {
    const dx = tx - x, dz = tz - z;
    const d = Math.hypot(dx, dz) || 1;
    const pr: Proj = { id: this.newId(), kind, x, z, vx: (dx / d) * speed, vz: (dz / d) * speed, dmg, owner, ownerKind, until: this.time + Math.min(1.2, d / speed + 0.25), status };
    this.projs.set(pr.id, pr);
  }

  projTick(dt: number) {
    for (const pr of this.projs.values()) {
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      let hit = false;
      if (pr.ownerKind === 'm') {
        for (const p of this.players.values()) {
          if (p.ghost) continue;
          if ((p.x - pr.x) ** 2 + (p.z - pr.z) ** 2 < 1) { this.damagePlayer(p, pr.dmg, 'pocisk'); hit = true; break; }
        }
      } else {
        for (const m of this.mobs.values()) {
          const def = MOBS[m.type];
          if (def.ai === 'npc' || m.hidden) continue;
          if (pr.ownerKind === 's' && (def.ai === 'golem' || def.ai === 'pig' || def.ai === 'passive' || def.ai === 'herd')) continue;
          const rr = def.radius * (m.scale || 1) + 0.5;
          if ((m.x - pr.x) ** 2 + (m.z - pr.z) ** 2 < rr * rr) {
            const owner = pr.ownerKind === 'p' ? this.players.get(pr.owner) || null : null;
            damageMob(this, m, pr.dmg, owner, pr.status);
            hit = true;
            break;
          }
        }
      }
      if (hit || pr.until <= this.time) {
        if (hit) this.fx(pr.x, pr.z, 'hit', { c: pr.kind });
        this.projs.delete(pr.id);
      }
    }
  }

  // ===================== Szybki tick gracza =====================
  playerFastTick(p: Player, dt: number) {
    if (p.actCd > 0) p.actCd -= dt;
    if (p.animUntil && p.animUntil < this.time) { p.anim = 0; p.animUntil = 0; }
    if (p.fishing && p.fishing.until <= this.time) {
      p.fishing = null;
      const r = Math.random();
      const item = r < 0.8 ? 'fish' : r < 0.9 ? 'scales' : r < 0.97 ? 'twig' : 'blueprint:*';
      this.giveItem(p, item === 'blueprint:*' ? this.randomBlueprint() : item, 1);
      this.useDurability(p, 'hand', 1);
      this.fx(p.x, p.z, 'splash');
    }
  }

  randomBlueprint() {
    const list = ['multitool', 'wing_pack', 'vault', 'ice_staff', 'fire_staff', 'storm_staff', 'golem_core'];
    return 'blueprint:' + list[Math.floor(Math.random() * list.length)];
  }

  useDurability(p: Player, slot: 'hand' | 'head' | 'body' | 'back', amount: number) {
    const it = p.equip[slot];
    if (!it || it.d === undefined) return;
    const def = ITEMS[it.id];
    if (!def?.dur) return;
    it.d -= amount / def.dur;
    if (it.d <= 0) {
      p.equip[slot] = null;
      this.toast(p, `${def.name} się zniszczył(a).`, 'warn');
      this.fx(p.x, p.z, 'break');
    }
    p.dirty.inv = true;
  }

  // ===================== Przetrwanie (co 1 s) =====================
  lightAt(x: number, z: number, self?: Player): number {
    // zwraca maks. "zasięg pokrycia" – >0 gdy oświetlone
    let lit = 0;
    for (const s of this.structsNear(x, z, 16)) {
      const def = STRUCTS[s.type];
      if (!def.light) continue;
      let rad = def.light;
      if (def.fuelMax && (s.type === 'campfire' || s.type === 'firepit')) {
        if (!s.fuel || s.fuel <= 0) continue;
        rad = 3 + def.light * Math.min(1, s.fuel / (def.fuelMax * 0.5));
      } else if (def.fuelMax && (s.fuel || 0) <= 0) continue;
      if (def.power && def.machine === 'lamp' && !s.powered) continue;
      if (s.burning && s.burning > this.time) rad = Math.max(rad, 7);
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < rad * rad) lit = 1;
    }
    if (lit) return 1;
    for (const s of this.structsNear(x, z, 8, (q) => !!(q.burning && q.burning > this.time))) if (s) return 1;
    for (const p of this.players.values()) {
      if (p.ghost) continue;
      let rad = 0;
      const h = p.equip.hand;
      if (h && ITEMS[h.id]?.light) rad = ITEMS[h.id].light!;
      const own = CHAR[p.char]?.ownLight || 0;
      if (own) rad = Math.max(rad, own);
      if (p.buffs.glow && p.buffs.glow > this.time) rad = Math.max(rad, 3.5);
      if (rad && (p.x - x) ** 2 + (p.z - z) ** 2 < rad * rad) return 1;
    }
    for (const o of this.gen.objectsNear(x, z, 5)) {
      const def = OBJ[o.type];
      if (def?.light && this.objAlive(o) && (o.x - x) ** 2 + (o.z - z) ** 2 < def.light * def.light) return 1;
    }
    for (const pr of this.mobs.values()) if (MOBS[pr.type].boss && (pr.x - x) ** 2 + (pr.z - z) ** 2 < 36) return 1;
    void self;
    return 0;
  }

  ambientTemp(x: number, z: number) {
    const [d, n] = AMBIENT[this.clk.season];
    const l = this.clk.light;
    let t = n + (d - n) * l;
    const b = this.gen.biome(x, z);
    if (b === 'desert') t += 10;
    if (b === 'swamp' || b === 'mushroom') t -= 3;
    if (this.weather.kind !== 'clear') t -= 8 * this.weather.i;
    return t;
  }

  survivalTick(p: Player, dt: number) {
    const cd = CHAR[p.char];
    const dl = this.settings.dayLength;
    const relax = this.settings.difficulty === 'relax';
    // zmiana biomu (questy odkrywania)
    const b = this.gen.biome(p.x, p.z);
    if (b !== p.biome) {
      p.biome = b;
      if (!p.visited.includes(b)) { p.visited.push(b); questEvent(this, p, 'visit', b, 1); }
    }
    if (p.ghost) {
      if (this.settings.difficulty === 'hardcore' && this.time - p.deadAt > 12) this.hardcoreRespawn(p);
      return;
    }
    // wilkołak
    if (cd.werewolf) {
      const want = this.clk.moon === 5 && this.clk.phase === 'night';
      if (want !== p.wolf) {
        p.wolf = want;
        this.toast(p, want ? 'Pełnia! Zmieniasz się w wilka.' : 'Wracasz do ludzkiej postaci.', 'info');
        this.fx(p.x, p.z, 'poof');
        p.dirty.me = true;
      }
    }
    // głód
    let hRate = (75 / dl) * cd.hungerMul;
    if (p.wolf) hRate *= 1.5;
    if (relax && this.clk.phase === 'night') hRate *= 0.5;
    if (p.sleeping) hRate *= 0.6;
    p.hunger -= hRate * dt;
    if (p.hunger <= 0) { p.hunger = 0; this.damagePlayer(p, (relax ? 0.5 : 1) * dt, 'głód', true); }
    // światło i ciemność
    const lit = this.lightAt(p.x, p.z, p);
    const dark = this.clk.light < 0.25 && !lit && this.clk.moon !== 5;
    if (dark) {
      p.darkT += dt;
      if (p.darkT >= 4 && Math.floor(p.darkT) % 2 === 0) {
        this.damagePlayer(p, relax ? 10 : 25, 'ciemność');
        this.fx(p.x, p.z, 'charlie');
        this.toast(p, 'Coś w ciemności cię zaatakowało! Znajdź światło!', 'danger');
      } else if (p.darkT < 1.5) this.toast(p, 'Jest zbyt ciemno...', 'warn');
    } else p.darkT = 0;
    // poczytalność
    let san = 0; // na minutę
    if (this.clk.phase === 'dusk') san -= 2;
    if (this.clk.phase === 'night') san -= 5;
    if (dark) san -= 15 * (cd.darkSanityMul ?? 1);
    if (p.wet > 30) san -= 3 * (cd.rainSanityMul ?? 1);
    for (const m of this.mobs.values()) {
      const md = MOBS[m.type];
      if (md.sanityAura && (m.x - p.x) ** 2 + (m.z - p.z) ** 2 < 64 && (!m.owner || m.owner === p.id)) san += md.sanityAura;
    }
    let friends = 0;
    for (const q of this.players.values()) if (q !== p && !q.ghost && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 144) friends++;
    else if (q !== p && q.ghost && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 64) san -= 3;
    if (friends && this.clk.phase === 'day') san += Math.min(3, friends * 1.5);
    for (const slot of ['head', 'body', 'hand'] as const) { const it = p.equip[slot]; if (it && ITEMS[it.id]?.sanity) san += ITEMS[it.id].sanity!; }
    if (this.structsNear(p.x, p.z, 6, (s) => s.type === 'scarecrow').length) san += 2;
    if (p.buffs.blessed && p.buffs.blessed > this.time) san += 6;
    if (this.sandstorm > this.time && b === 'desert' && p.equip.head?.id !== 'goggles') san -= 3;
    if (p.sleeping) san += 30;
    if (relax && san < 0) san *= 0.5;
    p.sanity = Math.max(0, Math.min(p.maxSanity, p.sanity + (san / 60) * dt));
    // cienie przy niskiej poczytalności
    if (p.sanity < p.maxSanity * 0.3 && Math.random() < 0.025 * dt) {
      let mine = 0;
      for (const m of this.mobs.values()) if (m.owner === p.id) mine++;
      const lim = p.sanity < p.maxSanity * 0.1 ? 3 : 1;
      if (mine < lim) {
        const a = Math.random() * Math.PI * 2;
        const sm = spawnMob(this, 'shade', p.x + Math.cos(a) * 14, p.z + Math.sin(a) * 14);
        if (sm) { sm.owner = p.id; sm.target = p.id; sm.state = 'chase'; }
      }
    }
    // wilgotność
    let water = 0;
    for (const slot of ['head', 'body', 'hand'] as const) { const it = p.equip[slot]; if (it && ITEMS[it.id]?.water) water = Math.max(water, ITEMS[it.id].water!); }
    const raining = this.weather.kind === 'rain' || this.weather.kind === 'storm';
    const nearFire = this.structsNear(p.x, p.z, 6, (s) => !!STRUCTS[s.type].heat && ((s.fuel || 0) > 0 || !STRUCTS[s.type].fuelMax)).length > 0;
    const nearSprinkler = this.structsNear(p.x, p.z, 10, (s) => s.type === 'sprinkler' && !!s.powered).length > 0;
    if (raining) p.wet = Math.min(100, p.wet + this.weather.i * 1.2 * (1 - water) * dt);
    else p.wet = Math.max(0, p.wet - (nearFire ? 3 : 0.4) * dt);
    if (nearSprinkler && this.clk.season === 'summer') p.wet = Math.min(40, p.wet + 1 * dt);
    // temperatura
    let warmth = 0, cool = 0;
    for (const slot of ['head', 'body', 'hand'] as const) {
      const it = p.equip[slot];
      if (!it) continue;
      warmth += ITEMS[it.id]?.warmth || 0;
      cool += ITEMS[it.id]?.cool || 0;
    }
    if (p.wolf) warmth += 90;
    let target = this.ambientTemp(p.x, p.z);
    for (const s of this.structsNear(p.x, p.z, 8)) {
      const def = STRUCTS[s.type];
      if (!def.heat) continue;
      if (def.fuelMax && (s.fuel || 0) <= 0 && s.type !== 'forge' && s.type !== 'forge2' && s.type !== 'kitchen' && s.type !== 'alchemy') continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < def.heat) target = Math.max(target, 40 + (1 - d / def.heat) * 30);
    }
    if (p.buffs.warm && p.buffs.warm > this.time) target += 25;
    if (p.buffs.cool && p.buffs.cool > this.time) target -= 30;
    if (nearSprinkler) target -= 18;
    target -= p.wet * 0.15;
    const diff = target - p.temp;
    let rate = diff * 0.03;
    if (diff < 0) rate /= 1 + warmth / 60;
    else rate /= 1 + cool / 60;
    if (p.inv.some((s) => s?.id === 'thermal_stone')) rate *= 0.5;
    rate = Math.max(-1.5, Math.min(1.5, rate));
    p.temp += rate * dt;
    if (p.temp < 0) { this.damagePlayer(p, (relax ? 0.6 : 1.25) * dt, 'mróz', true); if (Math.random() < 0.15) this.toast(p, 'Zamarzasz! Ogrzej się przy ogniu.', 'danger'); }
    if (p.temp > 70) { this.damagePlayer(p, (relax ? 0.6 : 1.25) * dt, 'upał', true); if (Math.random() < 0.15) this.toast(p, 'Przegrzewasz się! Znajdź chłód.', 'danger'); }
    // sen
    if (p.sleeping) {
      p.hp = Math.min(p.maxHp, p.hp + 1 * dt);
      if (this.clk.phase === 'day') { p.sleeping = 0; this.toast(p, 'Budzisz się wypoczęty.'); }
    }
    // zbyt wolne odnawianie zdrowia przy pełnym brzuchu
    if (p.hunger > p.maxHunger * 0.75 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 0.05 * dt);
    // trwałość przedmiotów "czasowych"
    for (const slot of ['hand', 'head', 'body'] as const) {
      const it = p.equip[slot];
      if (it && ITEMS[it.id]?.durKind === 'time') {
        const rain = it.id === 'umbrella' || it.id === 'raincoat' ? (raining ? 1 : 0.2) : 1;
        this.useDurability(p, slot, dt * rain);
      }
    }
    // status
    for (const k of Object.keys(p.status)) if (p.status[k] < this.time) delete p.status[k];
    if (p.status.burn) this.damagePlayer(p, 4 * dt, 'ogień', true);
    // prędkość
    p.spd = this.playerSpeed(p);
    p.dirty.me = true;
  }

  playerSpeed(p: Player) {
    const cd = CHAR[p.char];
    let s = BASE_SPEED * cd.speed;
    if (p.ghost) return BASE_SPEED * 1.1;
    if (p.wolf) s *= 1.4;
    if (p.buffs.speed && p.buffs.speed > this.time) s *= 1.3;
    const back = p.equip.back;
    if (back && ITEMS[back.id]?.speed) s *= ITEMS[back.id].speed!;
    if (p.status.web || p.status.slow) s *= 0.45;
    if (p.status.freeze || p.status.stun) s = 0;
    if (this.sandstorm > this.time && p.biome === 'desert' && p.equip.head?.id !== 'goggles') s *= 0.65;
    if (this.clk.season === 'winter' && p.biome !== 'beach') s *= 0.95;
    return s;
  }

  damagePlayer(p: Player, dmg: number, cause: string, ignoreArmor = false) {
    if (p.ghost || dmg <= 0) return;
    if (p.buffs.god && p.buffs.god > this.time) return;
    let taken = dmg;
    if (!ignoreArmor) {
      const cd = CHAR[p.char];
      let keep = 1 - cd.armorBonus;
      for (const slot of ['head', 'body'] as const) {
        const it = p.equip[slot];
        const a = it ? ITEMS[it.id]?.armor || 0 : 0;
        if (a > 0) {
          keep *= 1 - a;
          this.useDurability(p, slot, dmg * a);
        }
      }
      if (p.wolf) keep *= 0.7;
      taken = dmg * keep;
      if (p.sleeping) { p.sleeping = 0; this.toast(p, 'Coś cię obudziło!', 'danger'); }
      this.fx(p.x, p.z, 'hurt', { id: p.id });
    }
    p.hp -= taken;
    p.dirty.me = true;
    if (p.hp <= 0) this.killPlayer(p, cause);
  }

  killPlayer(p: Player, cause: string) {
    p.hp = 0;
    p.ghost = true;
    p.deadAt = this.time;
    p.sleeping = 0;
    p.wolf = false;
    p.stats.deaths++;
    p.fishing = null;
    for (let i = 0; i < p.inv.length; i++) { const it = p.inv[i]; if (it) this.spawnDrop(it, p.x, p.z, 2); p.inv[i] = null; }
    for (const k of ['hand', 'head', 'body', 'back'] as const) { const it = p.equip[k]; if (it) this.spawnDrop(it, p.x, p.z, 2); p.equip[k] = null; }
    p.inv.length = 15;
    this.fx(p.x, p.z, 'death');
    this.broadcast({ t: 'sys', text: `☠ ${p.name} zginął(ęła): ${cause}.` });
    const hc = this.settings.difficulty === 'hardcore';
    this.send(p, { t: 'dead', cause, hardcore: hc });
    p.dirty.inv = p.dirty.me = true;
    for (const m of this.mobs.values()) if (m.owner === p.id) this.mobs.delete(m.id);
  }

  revivePlayer(p: Player, by: string) {
    if (!p.ghost) return;
    p.ghost = false;
    p.hp = p.maxHp * 0.5;
    p.sanity = Math.max(p.sanity, p.maxSanity * 0.5);
    p.hunger = Math.max(p.hunger, p.maxHunger * 0.5);
    p.temp = 30;
    this.fx(p.x, p.z, 'revive');
    this.broadcast({ t: 'sys', text: `✨ ${p.name} wraca do życia (${by}).` });
    this.send(p, { t: 'revived' });
    p.dirty.me = true;
  }

  hardcoreRespawn(p: Player) {
    const cd = CHAR[p.char];
    p.ghost = false;
    p.hp = cd.hp; p.hunger = cd.hunger; p.sanity = cd.sanity; p.temp = 30; p.wet = 0;
    p.x = this.gen.spawn.x; p.z = this.gen.spawn.z + 4;
    for (const [it, n] of cd.start) addToSlots(p.inv, makeSlot(it, n));
    this.send(p, { t: 'pos', x: p.x, z: p.z });
    this.send(p, { t: 'revived' });
    this.toast(p, 'Tryb Hardcore: zaczynasz od nowa przy portalu.', 'warn');
    p.dirty.me = p.dirty.inv = true;
  }

  // ===================== Pogoda, pożary, najazdy =====================
  weatherTick() {
    const w = this.weather;
    const dl = this.settings.dayLength;
    if (w.kind !== 'clear' && this.time >= w.until) {
      w.kind = 'clear'; w.i = 0;
      const gap: Record<string, number> = { autumn: 0.9, winter: 0.7, spring: 0.35, summer: 2.5 };
      w.next = this.time + dl * gap[this.clk.season] * (0.5 + Math.random());
      w.nextKind = this.pickWeatherKind();
    }
    if (w.kind === 'clear' && this.time >= w.next) {
      w.kind = w.nextKind;
      if (this.clk.season === 'winter' && w.kind !== 'clear') w.kind = 'snow';
      w.i = 0.4 + Math.random() * 0.6;
      w.until = this.time + dl * (0.12 + Math.random() * 0.35);
      if (this.clk.season === 'summer' && Math.random() < 0.6) {
        // zamiast deszczu – burza piaskowa nad pustynią
        w.kind = 'clear';
        this.sandstorm = this.time + dl * 0.3;
        w.next = this.time + dl * (1 + Math.random());
        this.broadcast({ t: 'sys', text: '🌪 Nad pustynią zrywa się burza piaskowa.' });
      }
    }
    // pioruny
    if (w.kind === 'storm' && Math.random() < 0.06) {
      const ps = [...this.players.values()].filter((p) => !p.ghost);
      if (ps.length) {
        const p = ps[Math.floor(Math.random() * ps.length)];
        const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 30;
        let x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        const rod = this.structsNear(x, z, 20, (s) => s.type === 'rod_lightning')[0];
        if (rod) { x = rod.x; z = rod.z; }
        this.fx(x, z, 'lightning');
        if (!rod) {
          for (const q of this.players.values()) if (!q.ghost && (q.x - x) ** 2 + (q.z - z) ** 2 < 6) this.damagePlayer(q, 30, 'piorun');
          for (const s of this.structsNear(x, z, 3, (s) => !!STRUCTS[s.type].flammable)) { s.burning = this.time + 30; this.updateStruct(s); }
        }
      }
    }
    // zmrożenie roślin zimą nie jest symulowane – rośliny po prostu nie owocują (winterNo)
  }

  pickWeatherKind(): string {
    const s = this.clk.season;
    if (s === 'spring') return Math.random() < 0.5 ? 'storm' : 'rain';
    return 'rain';
  }

  fireTick(dt: number) {
    const raining = this.weather.kind === 'rain' || this.weather.kind === 'storm';
    for (const s of this.structs.values()) {
      const def = STRUCTS[s.type];
      // paliwo ognisk
      if ((s.type === 'campfire' || s.type === 'firepit') && (s.fuel || 0) > 0) {
        s.fuel = Math.max(0, s.fuel! - dt * (raining ? 2 : 1));
        if (s.fuel <= 0) {
          if (s.type === 'campfire') { this.fx(s.x, s.z, 'smoke'); this.removeStruct(s); continue; }
          this.updateStruct(s);
        } else if (this.tickN % 100 === 0) this.updateStruct(s);
      }
      if (s.burning) {
        if (s.burning <= this.time) { s.burning = 0; this.updateStruct(s); continue; }
        if (raining || this.structsNear(s.x, s.z, 10, (q) => q.type === 'sprinkler' && !!q.powered).length) {
          s.burning = 0; this.fx(s.x, s.z, 'smoke'); this.updateStruct(s); continue;
        }
        this.damageStruct(s, 8 * dt);
        if (Math.random() < 0.15) {
          for (const n of this.structsNear(s.x, s.z, 3, (q) => !!STRUCTS[q.type].flammable && !q.burning)) {
            if (Math.random() < 0.35) { n.burning = this.time + 25; this.updateStruct(n); }
          }
        }
        for (const p of this.players.values()) if (!p.ghost && (p.x - s.x) ** 2 + (p.z - s.z) ** 2 < 2) this.damagePlayer(p, 3 * dt, 'ogień', true);
      } else if (def.flammable && this.clk.season === 'summer' && this.clk.phase === 'day' && Math.random() < 0.00004 * dt) {
        if (!this.structsNear(s.x, s.z, 10, (q) => q.type === 'sprinkler' && !!q.powered).length) {
          s.burning = this.time + 30;
          this.updateStruct(s);
          this.broadcastNear(s.x, s.z, 80, { t: 'toast', text: `🔥 ${def.name} zajęła się od upału! Gaś!`, kind: 'danger' });
        }
      }
    }
  }

  raidTick() {
    if (this.settings.raids <= 0) return;
    const dl = this.settings.dayLength;
    if (!this.raidWarned && this.time > this.nextRaid - 25) {
      this.raidWarned = true;
      this.broadcast({ t: 'toast', text: '🐺 Słychać wycie ogarów... Przygotuj się do walki!', kind: 'danger' });
      this.broadcast({ t: 'fx', k: 'howl' });
    }
    if (this.time >= this.nextRaid) {
      this.raidWarned = false;
      const day = this.clk.day;
      for (const p of this.players.values()) {
        if (p.ghost) continue;
        const n = Math.min(10, Math.round((2 + Math.floor(day / 6)) * this.settings.monsters * (this.settings.difficulty === 'relax' ? 0.5 : 1)));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const m = spawnMob(this, 'hound', p.x + Math.cos(a) * 28, p.z + Math.sin(a) * 28);
          if (m) { m.target = p.id; m.state = 'chase'; }
        }
      }
      this.nextRaid = this.time + dl * (3.5 + Math.random() * 3) / Math.max(0.3, this.settings.raids);
    }
  }

  onNewDay() {
    for (const p of this.players.values()) {
      if (!p.ghost) {
        p.stats.days++;
        questEvent(this, p, 'survive', '*', 1);
        const ach = [[10, 'days10'], [50, 'days50'], [100, 'days100']] as const;
        for (const [n, a] of ach) if (p.stats.days >= n && !p.ach.includes(a)) { p.ach.push(a); this.toast(p, `🏆 Osiągnięcie: Przetrwaj ${n} dni!`, 'good'); }
      }
    }
    questEvent(this, null, 'survive', '*', 1);
    dailyTick(this);
    const c = this.clk;
    if (c.seasonDay === 1) this.broadcast({ t: 'toast', text: `Nadchodzi ${({ autumn: 'jesień', winter: 'zima', spring: 'wiosna', summer: 'lato' } as any)[c.season]}!`, kind: 'info' });
    if (c.moon === 5) this.broadcast({ t: 'sys', text: '🌕 Tej nocy będzie pełnia.' });
  }

  sendEnv() {
    const c = this.clk;
    const msg: any = {
      t: 'env', time: +this.time.toFixed(1), day: c.day, frac: +c.frac.toFixed(4), ph: c.phase, se: c.season, sd: c.seasonDay,
      sl: this.settings.seasonLength, dl: this.settings.dayLength, w: this.weather.kind, wi: +this.weather.i.toFixed(2), moon: c.moon,
      ss: this.sandstorm > this.time ? 1 : 0,
    };
    if ([...this.structs.values()].some((s) => s.type === 'weather_station')) {
      msg.fc = this.weather.kind === 'clear' ? { k: this.weather.nextKind, in: Math.max(0, Math.round(this.weather.next - this.time)) } : { k: 'clear', in: Math.max(0, Math.round(this.weather.until - this.time)) };
    }
    if (this.raidWarned) msg.raid = 1;
    this.broadcast(msg);
  }

  // ===================== Psucie jedzenia =====================
  spoilTick(dt: number) {
    const dl = this.settings.dayLength;
    const spoil = (slots: (Slot | null)[], mul: number) => {
      let ch = false;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s || s.f === undefined) continue;
        const sp = ITEMS[s.id]?.food?.spoil;
        if (!sp) continue;
        s.f -= (dt / (sp * dl)) * mul;
        if (s.f <= 0) { slots[i] = { id: 'rot', n: s.n }; ch = true; }
      }
      return ch;
    };
    const winter = this.clk.season === 'winter' ? 0.6 : 1;
    for (const p of this.players.values()) {
      spoil(p.inv, winter);
      p.dirty.inv = true;
    }
    for (const s of this.structs.values()) {
      if (!s.inv) continue;
      const def = STRUCTS[s.type];
      let mul = def.spoilMul ?? 1;
      if (s.type === 'icebox' && s.powered) mul = 0.25;
      if (spoil(s.inv, mul * winter)) this.refreshContainer(s);
    }
    for (const d of this.drops.values()) {
      if (d.item.f !== undefined) {
        const sp = ITEMS[d.item.id]?.food?.spoil;
        if (sp) { d.item.f -= dt / (sp * dl); if (d.item.f <= 0) d.item = { id: 'rot', n: d.item.n }; }
      }
    }
  }

  refreshContainer(s: Struct) {
    for (const p of this.players.values()) if (p.contOpen === s.id) this.sendContainer(p, s);
  }

  sendContainer(p: Player, s: Struct) {
    const def = STRUCTS[s.type];
    this.send(p, {
      t: 'cont', id: s.id, ty: s.type, slots: s.inv, fuel: def.fuelMax ? Math.round(((s.fuel || 0) / def.fuelMax) * 100) : undefined,
      prog: s.prog ? Math.round(s.prog * 100) : 0, pw: s.powered, on: s.on,
    });
  }

  // ===================== Mapa =====================
  exploreTick(p: Player) {
    const cells = Math.ceil(this.settings.size / MAP_CELL);
    const cx = Math.floor(p.x / MAP_CELL), cz = Math.floor(p.z / MAP_CELL);
    const R = 5;
    for (let dx = -R; dx <= R; dx++)
      for (let dz = -R; dz <= R; dz++) {
        if (dx * dx + dz * dz > R * R) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
        const i = z * cells + x;
        p.map[i >> 3] |= 1 << (i & 7);
        this.mapAll[i >> 3] |= 1 << (i & 7);
      }
  }

  sendMaps() {
    if (this.flags.tower) {
      for (const p of this.players.values()) this.send(p, { t: 'map', all: 1 });
      return;
    }
    if (!this.flags.maptable) return;
    const b = Buffer.from(this.mapAll).toString('base64');
    this.broadcast({ t: 'map', b });
  }

  // ===================== Snapshoty =====================
  sendSnapshots() {
    for (const p of this.players.values()) {
      if (!p.ws || p.ws.readyState !== 1) continue;
      const e: any[] = [];
      const r2 = SNAP_RADIUS * SNAP_RADIUS;
      for (const q of this.players.values()) {
        if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 > r2 * 4) continue;
        const fl = (q.ghost ? 1 : 0) | (q.wolf ? 2 : 0) | (q.sleeping ? 4 : 0);
        e.push([q.id, 0, q.char, +q.x.toFixed(2), +q.z.toFixed(2), +q.r.toFixed(2), q.anim, Math.round((q.hp / q.maxHp) * 100), q.name, fl,
          `${q.equip.hand?.id || ''}|${q.equip.head?.id || ''}|${q.equip.body?.id || ''}|${q.equip.back?.id || ''}`, q.skin, q.emote]);
      }
      for (const m of this.mobs.values()) {
        if (m.owner && m.owner !== p.id) continue;
        if ((m.x - p.x) ** 2 + (m.z - p.z) ** 2 > r2) continue;
        const fl = (MOBS[m.type].boss ? 1 : 0) | (m.status.freeze ? 2 : 0) | (m.status.burn ? 4 : 0) | (m.hidden ? 8 : 0) | (m.leader ? 16 : 0);
        e.push([m.id, 1, m.type, +m.x.toFixed(2), +m.z.toFixed(2), +m.r.toFixed(2), m.anim, Math.round((m.hp / m.maxHp) * 100), fl, m.carry || 0]);
      }
      for (const d of this.drops.values()) {
        if ((d.x - p.x) ** 2 + (d.z - p.z) ** 2 > r2) continue;
        e.push([d.id, 2, d.item.id, +d.x.toFixed(2), +d.z.toFixed(2), 0, 0, d.item.n]);
      }
      for (const pr of this.projs.values()) {
        if ((pr.x - p.x) ** 2 + (pr.z - p.z) ** 2 > r2) continue;
        e.push([pr.id, 3, pr.kind, +pr.x.toFixed(2), +pr.z.toFixed(2), +Math.atan2(pr.vx, pr.vz).toFixed(2)]);
      }
      p.ws.send(JSON.stringify({ t: 's', e }));
    }
    // pasek bossa
    for (const m of this.mobs.values()) {
      if (!MOBS[m.type].boss) continue;
      if (this.tickN % 10 === 0) this.broadcastNear(m.x, m.z, 70, { t: 'boss', id: m.id, n: MOBS[m.type].name, hp: Math.round((m.hp / m.maxHp) * 1000) / 10 });
    }
  }

  flushPlayer(p: Player) {
    const now = Date.now();
    if (p.dirty.me && now - p.lastMeSent > 150) {
      p.lastMeSent = now;
      p.dirty.me = false;
      this.send(p, {
        t: 'me', hp: +p.hp.toFixed(1), mhp: p.maxHp, hu: +p.hunger.toFixed(1), mhu: p.maxHunger, sa: +p.sanity.toFixed(1), msa: p.maxSanity,
        te: +p.temp.toFixed(1), we: Math.round(p.wet), g: p.ghost ? 1 : 0, wolf: p.wolf ? 1 : 0, spd: +p.spd.toFixed(2), sl: p.sleeping ? 1 : 0,
        bf: Object.fromEntries(Object.entries(p.buffs).filter(([, v]) => v > this.time).map(([k, v]) => [k, Math.round(v - this.time)])),
        st: Object.keys(p.status), dark: p.darkT > 0 ? 1 : 0,
      });
    }
    if (p.dirty.inv) { p.dirty.inv = false; this.send(p, { t: 'inv', inv: p.inv, eq: p.equip, stock: (p as any).stock || {} }); }
    if (p.dirty.known) { p.dirty.known = false; this.send(p, { t: 'known', k: [...p.known] }); }
    if (p.dirty.quests) { p.dirty.quests = false; this.send(p, { t: 'quests', ...questSummary(this, p) }); }
  }

  // ===================== Zapis / odczyt =====================
  serialize() {
    for (const p of this.players.values()) this.saveChar(p);
    return {
      v: 1, time: this.time, objState: [...this.objState.entries()], structs: [...this.structs.values()].map((s) => ({ ...s })),
      drops: [...this.drops.values()].slice(-400), chars: this.chars, flags: this.flags, wq: this.wq, daily: this.daily,
      nextRaid: this.nextRaid, weather: this.weather, nextId: this.nextId, mapAll: Buffer.from(this.mapAll).toString('base64'),
      bosses: [...this.mobs.values()].filter((m) => MOBS[m.type].boss || m.type === 'golem').map((m) => ({ type: m.type, x: m.x, z: m.z, hp: m.hp, core: m.core })),
    };
  }

  load(st: any) {
    this.time = st.time || 0;
    this.nextId = Math.max(this.nextId, st.nextId || 0);
    for (const [id, os] of st.objState || []) {
      this.objState.set(id, os);
      const o = this.gen.objectById(id);
      if (o) {
        const k = this.chunkKeyOf(o.x, o.z);
        if (!this.objByChunk.has(k)) this.objByChunk.set(k, new Set());
        this.objByChunk.get(k)!.add(id);
      }
      if (os.t !== undefined) this.regrowQueue.push(id);
    }
    for (const s of st.structs || []) {
      if (!STRUCTS[s.type]) continue;
      this.structs.set(s.id, s);
      const k = this.chunkKeyOf(s.x, s.z);
      if (!this.structByChunk.has(k)) this.structByChunk.set(k, new Set());
      this.structByChunk.get(k)!.add(s.id);
      s.golem = undefined;
    }
    for (const d of st.drops || []) this.drops.set(d.id, d);
    this.chars = st.chars || {};
    this.flags = st.flags || {};
    this.wq = st.wq || {};
    this.daily = st.daily || { day: 0, tasks: [] };
    this.nextRaid = st.nextRaid || this.settings.dayLength * 5;
    if (st.weather) this.weather = st.weather;
    if (st.mapAll) { const b = Buffer.from(st.mapAll, 'base64'); this.mapAll.set(b.subarray(0, this.mapAll.length)); }
    this.clk = clock(this.time, this.settings.dayLength, this.settings.seasonLength);
    for (const b of st.bosses || []) {
      const m = spawnMob(this, b.type, b.x, b.z);
      if (m) {
        m.hp = b.hp;
        if (b.core) { m.core = b.core; const s = this.structs.get(b.core); if (s) s.golem = m.id; }
      }
    }
    for (const s of this.structs.values()) {
      if (s.type === 'golem_core' && !s.golem) {
        const g = spawnMob(this, 'golem', s.x + 2, s.z + 2);
        if (g) { g.core = s.id; s.golem = g.id; }
      }
    }
  }

  // ===================== Obsługa wiadomości =====================
  onMessage(p: Player, msg: any) {
    handleMessage(this, p, msg);
  }
}
