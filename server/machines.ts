// Maszyny, sieć energetyczna, farmy, kuchnia.
import { STRUCTS } from '../shared/data/structures';
import { ITEMS } from '../shared/data/items';
import { MOBS } from '../shared/data/mobs';
import { cookPot } from '../shared/data/recipes';
import type { World } from './world';
import type { Struct, Slot } from './types';
import { addToSlots, makeSlot } from './inventory';
import { damageMob } from './mobs';
import { questEvent } from './quests';

export const SMELT: Record<string, [string, number, number]> = {
  // wejście: [wyjście, ile wejścia, ile wyjścia]
  iron_ore: ['iron_ingot', 1, 1],
  copper_ore: ['copper_ingot', 1, 1],
  gold: ['gold_ingot', 2, 1],
  sand: ['glass', 2, 1],
  clay: ['brick', 1, 2],
  log: ['coal', 1, 1],
};
const DRYABLE: Record<string, string> = { meat: 'jerky', small_meat: 'jerky', monster_meat: 'jerky', fish: 'fish_cooked' };
const NET_RANGE = 16;

export function energyTick(w: World) {
  const nodes = [...w.structs.values()].filter((s) => STRUCTS[s.type].power);
  if (!nodes.length) return;
  // grupy połączone w zasięgu
  const group = new Map<number, number>();
  let g = 0;
  for (const s of nodes) {
    if (group.has(s.id)) continue;
    g++;
    const stack = [s];
    group.set(s.id, g);
    while (stack.length) {
      const c = stack.pop()!;
      for (const o of nodes) {
        if (group.has(o.id)) continue;
        if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 <= NET_RANGE * NET_RANGE) { group.set(o.id, g); stack.push(o); }
      }
    }
  }
  const supply = new Map<number, number>(), demand = new Map<number, number>();
  for (const s of nodes) {
    const def = STRUCTS[s.type];
    const gid = group.get(s.id)!;
    if (def.power! > 0) {
      let p = 0;
      if (s.on === false) p = 0;
      else if (def.machine === 'generator') {
        if ((s.fuel || 0) <= 0 && s.inv?.[0]) {
          const it = s.inv[0];
          const f = ITEMS[it.id]?.fuel;
          if (f) { s.fuel = (s.fuel || 0) + f * 3; it.n--; if (it.n <= 0) s.inv[0] = null; w.refreshContainer(s); }
        }
        p = (s.fuel || 0) > 0 ? def.power! : 0;
      } else if (def.machine === 'windmill') p = w.weather.kind === 'storm' ? 8 : w.weather.kind === 'clear' ? def.power! : 6;
      else if (def.machine === 'waterwheel') p = nearWater(w, s.x, s.z, 4) ? def.power! : 0;
      else if (def.machine === 'solar') p = w.clk.phase === 'day' ? def.power! : w.clk.phase === 'dusk' ? 2 : 0;
      (s as any).out = p;
      supply.set(gid, (supply.get(gid) || 0) + p);
    } else if (s.on !== false) demand.set(gid, (demand.get(gid) || 0) - def.power!);
  }
  for (const s of nodes) {
    const def = STRUCTS[s.type];
    const gid = group.get(s.id)!;
    const ok = (supply.get(gid) || 0) >= (demand.get(gid) || 0) && (supply.get(gid) || 0) > 0;
    if (def.power! < 0) {
      const pw = ok && s.on !== false;
      if (s.powered !== pw) { s.powered = pw; w.updateStruct(s); w.refreshContainer(s); }
    } else {
      if (def.machine === 'generator' && (demand.get(gid) || 0) > 0 && (s.fuel || 0) > 0) {
        s.fuel = Math.max(0, s.fuel! - 1);
        if (w.tickN % 100 === 0) w.updateStruct(s);
      }
      const pw = ((s as any).out || 0) > 0;
      if (s.powered !== pw) { s.powered = pw; w.updateStruct(s); }
    }
  }
  (w as any).energyInfo = { supply, demand, group };
}

export function nearWater(w: World, x: number, z: number, r: number) {
  for (let a = 0; a < 8; a++) {
    const nx = x + Math.cos((a / 8) * Math.PI * 2) * r, nz = z + Math.sin((a / 8) * Math.PI * 2) * r;
    if (w.gen.height(nx, nz) < 0.05) return true;
  }
  return false;
}

function addOut(s: Struct, id: string, n: number, from = 0): boolean {
  if (!s.inv) return false;
  const slots = s.inv.slice(from);
  const left = addToSlots(slots, makeSlot(id, n));
  for (let i = from; i < s.inv.length; i++) s.inv[i] = slots[i - from];
  return left === 0;
}

export function machinesTick(w: World, dt: number) {
  const dl = w.settings.dayLength;
  for (const s of w.structs.values()) {
    const def = STRUCTS[s.type];
    if (!def.machine) continue;
    switch (def.machine) {
      case 'furnace': {
        const inp = s.inv![0];
        const recipe = inp ? SMELT[inp.id] : undefined;
        if ((s.fuel || 0) <= 0 && recipe && inp!.n >= recipe[1] && s.inv![1]) {
          const f = s.inv![1]!;
          const fv = ITEMS[f.id]?.fuel;
          if (fv) { s.fuel = fv * 2; f.n--; if (f.n <= 0) s.inv![1] = null; }
        }
        if (recipe && inp!.n >= recipe[1] && (s.fuel || 0) > 0) {
          const out = s.inv![2];
          if (!out || (out.id === recipe[0] && out.n + recipe[2] <= (ITEMS[out.id]?.stack || 20))) {
            s.prog = (s.prog || 0) + dt / 8;
            s.fuel = Math.max(0, s.fuel! - dt);
            if (s.prog >= 1) {
              s.prog = 0;
              inp!.n -= recipe[1];
              if (inp!.n <= 0) s.inv![0] = null;
              if (out) out.n += recipe[2]; else s.inv![2] = makeSlot(recipe[0], recipe[2]);
              w.fx(s.x, s.z, 'smelt');
            }
            if (!s.on) { s.on = true; w.updateStruct(s); }
            w.refreshContainer(s);
          }
        } else if (s.on) { s.on = false; s.prog = 0; w.updateStruct(s); w.refreshContainer(s); }
        break;
      }
      case 'kitchen': {
        if (s.prog && s.prog > 0) {
          s.prog += dt / 10;
          if (s.prog >= 1) {
            s.prog = 0;
            const cats: Record<string, number> = {};
            for (const it of s.inv!) if (it) { const c = ITEMS[it.id]?.food?.cat || 'none'; cats[c] = (cats[c] || 0) + 1; }
            const res = cookPot(cats);
            s.inv = [makeSlot(res, 1), null, null, null];
            s.on = false;
            w.fx(s.x, s.z, 'cooked');
            const p = [...w.players.values()].find((q) => q.key === s.cookBy);
            if (p) { questEvent(w, p, 'cook', res, 1); p.stats.cooked++; }
            w.updateStruct(s);
          }
          w.refreshContainer(s);
        }
        break;
      }
      case 'dryer':
      case 'smoker': {
        const raining = w.weather.kind === 'rain' || w.weather.kind === 'storm';
        const has = s.inv!.some((it) => it && DRYABLE[it.id]);
        if (!has) { if (s.prog) { s.prog = 0; w.refreshContainer(s); } break; }
        if (def.machine === 'dryer' && raining) break;
        if (def.machine === 'smoker') {
          if ((s.fuel || 0) <= 0) break;
          s.fuel = Math.max(0, s.fuel! - dt);
        }
        const need = def.machine === 'smoker' ? dl * 0.5 : dl;
        s.prog = (s.prog || 0) + dt / need;
        if (s.prog >= 1) {
          s.prog = 0;
          for (let i = 0; i < s.inv!.length; i++) { const it = s.inv![i]; if (it && DRYABLE[it.id]) s.inv![i] = makeSlot(DRYABLE[it.id], it.n); }
          w.fx(s.x, s.z, 'cooked');
        }
        if (w.tickN % 100 === 0) w.refreshContainer(s);
        break;
      }
      case 'farm': {
        if (!s.plant || (s.growth || 0) >= 1) break;
        if (w.clk.season === 'winter') break;
        let rate = dt / (dl * 2);
        if (s.watered && s.watered > w.time) rate *= 1.6;
        if (w.weather.kind === 'rain' || w.weather.kind === 'storm') rate *= 1.3;
        if (w.clk.season === 'summer' && !(s.watered && s.watered > w.time)) rate *= 0.6;
        rate *= (s as any).bonus || 1;
        const before = Math.floor((s.growth || 0) * 3);
        s.growth = Math.min(1, (s.growth || 0) + rate);
        if (Math.floor(s.growth * 3) !== before || s.growth >= 1) w.updateStruct(s);
        break;
      }
      case 'tree': {
        if ((s.growth || 0) >= 1 || w.clk.season === 'winter') break;
        const before = Math.floor((s.growth || 0) * 4);
        s.growth = Math.min(1, (s.growth || 0) + dt / (dl * 3));
        if (Math.floor(s.growth * 4) !== before) w.updateStruct(s);
        break;
      }
      case 'sawmill': {
        if (!s.powered) break;
        s.prog = (s.prog || 0) + dt / 5;
        if (s.prog >= 1) {
          s.prog = 0;
          const i = s.inv!.findIndex((it) => it && it.id === 'log');
          if (i >= 0) {
            const it = s.inv![i]!;
            it.n--; if (it.n <= 0) s.inv![i] = null;
            if (!addOut(s, 'board', 2)) { addOut(s, 'log', 1); }
            w.fx(s.x, s.z, 'saw');
            w.refreshContainer(s);
          }
        }
        break;
      }
      case 'drill': {
        if (!s.powered) break;
        s.prog = (s.prog || 0) + dt / 15;
        if (s.prog >= 1) {
          s.prog = 0;
          const b = w.gen.biome(s.x, s.z);
          const r = Math.random();
          const rich = b === 'rocky' || b === 'ruins';
          let item = 'stone';
          if (r < (rich ? 0.15 : 0.04)) item = 'iron_ore';
          else if (r < (rich ? 0.27 : 0.07)) item = 'copper_ore';
          else if (r < (rich ? 0.35 : 0.09)) item = 'gold';
          else if (r < (rich ? 0.45 : 0.12)) item = 'coal';
          else if (r < 0.6) item = 'flint';
          if (b === 'ruins' && Math.random() < 0.15) item = 'ruin_metal';
          if (b === 'mushroom' && Math.random() < 0.15) item = 'crystal';
          addOut(s, item, 1);
          w.fx(s.x, s.z, 'drill');
          w.refreshContainer(s);
        }
        break;
      }
      case 'harvester': {
        if (!s.powered) break;
        s.prog = (s.prog || 0) + dt / 4;
        if (s.prog >= 1) {
          s.prog = 0;
          for (const f of w.structsNear(s.x, s.z, 10, (q) => q.type === 'farm' && !!q.plant && (q.growth || 0) >= 1)) {
            if (addOut(s, f.plant!, 1 + (Math.random() < 0.5 ? 1 : 0))) {
              if (Math.random() < 0.4) addOut(s, 'seeds', 1);
              f.plant = undefined; f.growth = 0;
              w.updateStruct(f);
              w.fx(f.x, f.z, 'pick');
              break;
            }
          }
          w.refreshContainer(s);
        }
        break;
      }
      case 'sprinkler': {
        if (!s.powered) break;
        for (const f of w.structsNear(s.x, s.z, 10, (q) => q.type === 'farm')) f.watered = w.time + 5;
        for (const f of w.structsNear(s.x, s.z, 10, (q) => !!q.burning)) { f.burning = 0; w.updateStruct(f); w.fx(f.x, f.z, 'smoke'); }
        break;
      }
      case 'turret': {
        if (!s.powered) break;
        s.prog = (s.prog || 0) + dt;
        if (s.prog >= 1.2) {
          let best = null, bd = 14 * 14;
          for (const m of w.mobs.values()) {
            const md = MOBS[m.type];
            if (m.hidden || !['hostile', 'hound', 'nightHostile', 'boss', 'shadow', 'static'].includes(md.ai)) continue;
            if (md.ai === 'nightHostile' && w.clk.phase === 'day' && !m.target) continue;
            const d = (m.x - s.x) ** 2 + (m.z - s.z) ** 2;
            if (d < bd) { bd = d; best = m; }
          }
          if (best) {
            s.prog = 0;
            w.spawnProj('arrow', s.x, s.z, best.x, best.z, 28, s.id, 's');
            s.rot = Math.atan2(best.x - s.x, best.z - s.z);
            w.updateStruct(s);
          } else s.prog = 1.2;
        }
        break;
      }
      case 'hopper': {
        if (!s.powered) break;
        s.prog = (s.prog || 0) + dt / 2;
        if (s.prog < 1) break;
        s.prog = 0;
        const sources = w.structsNear(s.x, s.z, 4, (q) => ['sawmill', 'drill', 'harvester', 'furnace', 'drying_rack', 'smokehouse'].includes(q.type) && !!q.inv);
        const chest = w.structsNear(s.x, s.z, 4, (q) => ['chest', 'big_chest', 'vault', 'icebox'].includes(q.type) && !!q.inv)[0];
        if (!chest) break;
        for (const src of sources) {
          const from = src.type === 'furnace' ? [2] : src.inv!.map((_, i) => i);
          let moved = false;
          for (const i of from) {
            const it = src.inv![i];
            if (!it) continue;
            if (src.type === 'sawmill' && it.id === 'log') continue;
            if ((src.type === 'drying_rack' || src.type === 'smokehouse') && DRYABLE[it.id]) continue;
            const left = addToSlots(chest.inv!, { ...it } as Slot);
            if (left < it.n) {
              it.n = left;
              if (left <= 0) src.inv![i] = null;
              moved = true;
              break;
            }
          }
          if (moved) { w.refreshContainer(src); w.refreshContainer(chest); w.fx(s.x, s.z, 'pick'); break; }
        }
        break;
      }
    }
  }
  void damageMob;
}
