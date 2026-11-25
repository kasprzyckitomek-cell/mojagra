// AI stworzeń, bossów, spawnery.
import { MOBS, MobDef, BossAbility } from '../shared/data/mobs';
import { OBJ } from '../shared/data/objects';
import { STRUCTS } from '../shared/data/structures';
import { ITEMS } from '../shared/data/items';
import type { World } from './world';
import type { Mob, Player, Struct } from './types';
import { makeSlot, addToSlots } from './inventory';
import { questEvent } from './quests';

const MAX_MOBS = 260;

export function spawnMob(w: World, type: string, x: number, z: number): Mob | null {
  const def = MOBS[type];
  if (!def) return null;
  if (w.mobs.size >= MAX_MOBS && !def.boss) return null;
  // nie na wodzie
  if (!def.fly && w.gen.height(x, z) < 0.1) {
    let ok = false;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const nx = x + Math.cos(a) * (2 + i), nz = z + Math.sin(a) * (2 + i);
      if (w.gen.height(nx, nz) >= 0.2) { x = nx; z = nz; ok = true; break; }
    }
    if (!ok) return null;
  }
  x = Math.max(2, Math.min(w.settings.size - 2, x));
  z = Math.max(2, Math.min(w.settings.size - 2, z));
  const pc = Math.max(1, w.players.size);
  let hp = def.hp;
  if (def.boss) hp = Math.round(def.hp * (1 + 0.6 * (pc - 1)) * (w.settings.difficulty === 'relax' ? 0.6 : w.settings.difficulty === 'hardcore' ? 1.3 : 1));
  const m: Mob = {
    id: w.newId(), type, x, z, r: Math.random() * 6.28, hp, maxHp: hp, state: 'idle', target: 0, tt: 0, home: { x, z }, spawner: 0,
    atkCd: 1, anim: 0, animUntil: 0, owner: 0, leader: 0, leaderUntil: 0, status: {}, cds: {}, lastNear: w.time, scale: def.scale,
  };
  if (def.abilities) for (const a of def.abilities) m.cds[a.k] = w.time + 3 + Math.random() * 3;
  w.mobs.set(m.id, m);
  if (def.boss) {
    w.broadcast({ t: 'toast', text: `⚠ ${def.name} się pojawia!`, kind: 'danger' });
    w.fx(x, z, 'bossSpawn');
  }
  return m;
}

function dmgMul(w: World) {
  return w.settings.difficulty === 'relax' ? 0.5 : w.settings.difficulty === 'hardcore' ? 1.3 : 1;
}

function findTarget(w: World, id: number): { x: number; z: number; kind: 'p' | 'm'; p?: Player; m?: Mob } | null {
  const p = w.players.get(id);
  if (p) return p.ghost ? null : { x: p.x, z: p.z, kind: 'p', p };
  const m = w.mobs.get(id);
  if (m) return { x: m.x, z: m.z, kind: 'm', m };
  return null;
}

function moveToward(w: World, m: Mob, def: MobDef, tx: number, tz: number, speed: number, dt: number, away = false) {
  let dx = tx - m.x, dz = tz - m.z;
  if (away) { dx = -dx; dz = -dz; }
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return false;
  const step = Math.min(d, speed * dt);
  let ang = Math.atan2(dx, dz);
  for (let tries = 0; tries < 5; tries++) {
    const a = ang + [0, 0.8, -0.8, 1.6, -1.6][tries];
    const nx = m.x + Math.sin(a) * step, nz = m.z + Math.cos(a) * step;
    if (nx < 1 || nz < 1 || nx > w.settings.size - 1 || nz > w.settings.size - 1) continue;
    if (!def.fly && w.gen.height(nx, nz) < 0.12) continue;
    // kolizja z blokującymi budowlami
    let blocked: Struct | null = null;
    const rr = def.radius * (m.scale / def.scale);
    for (const s of w.structsNear(nx, nz, 3.5)) {
      const sd = STRUCTS[s.type];
      if (!sd.block || (s.type === 'gate' && s.open)) continue;
      const lim = sd.radius + rr * 0.6;
      if ((s.x - nx) ** 2 + (s.z - nz) ** 2 < lim * lim) { blocked = s; break; }
    }
    if (blocked) {
      if (def.destroys || def.boss) {
        if (m.atkCd <= 0) { w.damageStruct(blocked, def.dmg * 1.5); m.atkCd = def.atkCd; m.anim = 2; m.animUntil = w.time + 0.5; }
        return false;
      }
      if ((def.ai === 'hostile' || def.ai === 'hound' || def.ai === 'nightHostile') && m.atkCd <= 0 && tries === 4) {
        w.damageStruct(blocked, def.dmg * 0.5); m.atkCd = def.atkCd; m.anim = 2; m.animUntil = w.time + 0.5;
      }
      continue;
    }
    m.x = nx; m.z = nz;
    m.r = a;
    return true;
  }
  return false;
}

function wander(w: World, m: Mob, def: MobDef, dt: number, radius = 8) {
  if (m.state !== 'wander' || m.tt < w.time) {
    if (Math.random() < 0.5) { m.state = 'idle'; m.tt = w.time + 2 + Math.random() * 4; m.anim = 0; return; }
    m.state = 'wander';
    m.tt = w.time + 3 + Math.random() * 4;
    const a = Math.random() * Math.PI * 2;
    (m as any).wx = m.home.x + Math.cos(a) * Math.random() * radius;
    (m as any).wz = m.home.z + Math.sin(a) * Math.random() * radius;
  }
  if (m.state === 'wander') {
    const moved = moveToward(w, m, def, (m as any).wx, (m as any).wz, def.speed, dt);
    m.anim = moved ? 1 : 0;
    if (!moved) m.tt = 0;
  }
}

function nearestPlayer(w: World, x: number, z: number, maxD: number): Player | null {
  let best: Player | null = null, bd = maxD * maxD;
  for (const p of w.players.values()) {
    if (p.ghost) continue;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function attackTarget(w: World, m: Mob, def: MobDef, t: { x: number; z: number; kind: 'p' | 'm'; p?: Player; m?: Mob }, dt: number, speedMul = 1) {
  const d = Math.hypot(t.x - m.x, t.z - m.z);
  const reach = def.atkRange + (t.kind === 'm' && t.m ? MOBS[t.m.type].radius * t.m.scale : 0.3);
  if (d > reach) {
    const moved = moveToward(w, m, def, t.x, t.z, (def.runSpeed || def.speed) * speedMul, dt);
    m.anim = moved ? 10 : 0;
  } else {
    m.r = Math.atan2(t.x - m.x, t.z - m.z);
    if (m.atkCd <= 0) {
      m.atkCd = def.atkCd;
      m.anim = 2; m.animUntil = w.time + 0.45;
      const dmg = def.dmg * dmgMul(w);
      if (t.kind === 'p' && t.p) {
        w.damagePlayer(t.p, dmg, def.name);
        if (m.type === 'spider_warrior' || m.type === 'scorpion') if (Math.random() < 0.25) t.p.status.slow = w.time + 2;
      } else if (t.m) damageMob(w, t.m, dmg, null);
    }
  }
}

export function mobTick(w: World, m: Mob, dt: number) {
  const def = MOBS[m.type];
  if (!def) { w.mobs.delete(m.id); return; }
  // aktywność tylko w pobliżu graczy
  let nd = 1e9;
  for (const p of w.players.values()) { const d = (p.x - m.x) ** 2 + (p.z - m.z) ** 2; if (d < nd) nd = d; }
  nd = Math.sqrt(nd);
  if (nd > 110 && def.ai !== 'golem') {
    const limit = def.boss ? 90 : 25;
    if (w.time - m.lastNear > limit) {
      w.mobs.delete(m.id);
      if (def.boss) { w.flags[`${m.type}_spawned`] = 0; w.flags[`${m.type}_y${w.clk.year}`] = 0; }
    }
    return;
  }
  m.lastNear = w.time;
  if (m.atkCd > 0) m.atkCd -= dt;
  if (m.animUntil && m.animUntil < w.time) { m.anim = 0; m.animUntil = 0; }
  for (const k in m.status) if (m.status[k] < w.time) delete m.status[k];
  if (m.status.burn && w.tickN % 20 === 0) damageMob(w, m, 6, null);
  if (m.status.freeze || m.status.stun || m.hidden) return;
  const spMul = m.status.slow ? 0.5 : 1;

  switch (def.ai) {
    case 'passive': {
      if (def.dayOnly && w.clk.phase === 'night') {
        if (moveToward(w, m, def, m.home.x, m.home.z, def.runSpeed || def.speed, dt)) m.anim = 10;
        if ((m.x - m.home.x) ** 2 + (m.z - m.home.z) ** 2 < 1.5) w.mobs.delete(m.id);
        return;
      }
      const threat = nearestPlayer(w, m.x, m.z, def.flee || 5);
      if (threat || (m.state === 'flee' && m.tt > w.time)) {
        if (threat) { m.state = 'flee'; m.tt = w.time + 2; m.target = threat.id; }
        const t = w.players.get(m.target);
        if (t) moveToward(w, m, def, t.x, t.z, (def.runSpeed || def.speed) * spMul, dt, true);
        m.anim = 10;
        return;
      }
      wander(w, m, def, dt, 10);
      return;
    }
    case 'npc': {
      const p = nearestPlayer(w, m.x, m.z, 8);
      if (p) m.r = Math.atan2(p.x - m.x, p.z - m.z);
      m.anim = 0;
      return;
    }
    case 'static': {
      const p = nearestPlayer(w, m.x, m.z, def.atkRange + 0.6);
      if (p) {
        m.anim = 0;
        attackTarget(w, m, def, { x: p.x, z: p.z, kind: 'p', p }, dt);
        m.hidden = false;
      } else m.anim = 6;
      return;
    }
    case 'thief': {
      const threat = nearestPlayer(w, m.x, m.z, def.flee || 6);
      const scare = w.structsNear(m.x, m.z, 10, (s) => s.type === 'scarecrow')[0];
      if (threat || scare) {
        const fx = threat ? threat.x : scare!.x, fz = threat ? threat.z : scare!.z;
        moveToward(w, m, def, fx, fz, (def.runSpeed || def.speed) * spMul, dt, true);
        m.anim = 10;
        return;
      }
      let best: any = null, bd = 144;
      for (const d of w.drops.values()) { const dd = (d.x - m.x) ** 2 + (d.z - m.z) ** 2; if (dd < bd) { bd = dd; best = d; } }
      if (best) {
        if (bd < 1) {
          (m as any).bag = (m as any).bag || [];
          (m as any).bag.push(best.item);
          w.removeDrop(best.id);
          m.carry = ((m.carry || 0) + 1);
        } else { moveToward(w, m, def, best.x, best.z, def.speed * 1.5, dt); m.anim = 1; }
        return;
      }
      wander(w, m, def, dt, 12);
      return;
    }
    case 'shadow': {
      const owner = w.players.get(m.owner);
      if (!owner || owner.ghost || owner.sanity > owner.maxSanity * 0.55) { w.mobs.delete(m.id); return; }
      attackTarget(w, m, def, { x: owner.x, z: owner.z, kind: 'p', p: owner }, dt, spMul);
      return;
    }
    case 'hound': {
      let t = findTarget(w, m.target);
      if (!t) {
        const p = nearestPlayer(w, m.x, m.z, def.sight);
        if (!p) { if (nd > 60) w.mobs.delete(m.id); else wander(w, m, def, dt, 5); return; }
        m.target = p.id;
        t = findTarget(w, p.id);
      }
      if (t) attackTarget(w, m, def, t, dt, spMul);
      return;
    }
    case 'pig': return pigAI(w, m, def, dt, spMul);
    case 'golem': return golemAI(w, m, def, dt);
    case 'boss': return bossAI(w, m, def, dt, spMul);
    default: {
      // neutral / herd / hostile / nightHostile
      const night = w.clk.phase !== 'day';
      if (def.nightOnly && !night) {
        if (moveToward(w, m, def, m.home.x, m.home.z, def.speed, dt)) m.anim = 1;
        if ((m.x - m.home.x) ** 2 + (m.z - m.home.z) ** 2 < 2) w.mobs.delete(m.id);
        return;
      }
      const aggressive = def.ai === 'hostile' || (def.ai === 'nightHostile' && night);
      let t = m.target ? findTarget(w, m.target) : null;
      if (t && (m.tt < w.time || Math.hypot(t.x - m.home.x, t.z - m.home.z) > def.sight * 3 + 20)) { m.target = 0; t = null; }
      if (!t && aggressive) {
        const p = nearestPlayer(w, m.x, m.z, def.sight);
        if (p) { m.target = p.id; m.tt = w.time + 15; t = findTarget(w, p.id); }
        // atakuj też chrumki i golemy w pobliżu
        if (!t) for (const o of w.mobs.values()) {
          const od = MOBS[o.type];
          if ((od.ai === 'pig' || od.ai === 'golem') && (o.x - m.x) ** 2 + (o.z - m.z) ** 2 < 36) { m.target = o.id; m.tt = w.time + 10; t = findTarget(w, o.id); break; }
        }
      }
      if (t) { attackTarget(w, m, def, t, dt, spMul); return; }
      if (def.ai === 'nightHostile' && !night && (m.x - m.home.x) ** 2 + (m.z - m.home.z) ** 2 > 25) {
        if (moveToward(w, m, def, m.home.x, m.home.z, def.speed, dt)) m.anim = 1;
        return;
      }
      wander(w, m, def, dt, def.ai === 'herd' ? 14 : 8);
    }
  }
}

function pigAI(w: World, m: Mob, def: MobDef, dt: number, spMul: number) {
  // atak na wrogów w pobliżu (pająki, ryboczłeki, ogary) albo wskazany cel
  let t = m.target ? findTarget(w, m.target) : null;
  if (t && m.tt < w.time) { m.target = 0; t = null; }
  const leader = m.leader && m.leaderUntil > w.time ? w.players.get(m.leader) : undefined;
  if (!leader && m.leader) { m.leader = 0; }
  if (!t) {
    for (const o of w.mobs.values()) {
      const od = MOBS[o.type];
      if (['spider', 'spider_warrior', 'merm', 'hound', 'scorpion', 'bat'].includes(o.type) || (od.ai === 'shadow' && leader && o.owner === leader.id)) {
        const cx = leader ? leader.x : m.x, cz = leader ? leader.z : m.z;
        if ((o.x - cx) ** 2 + (o.z - cz) ** 2 < 100) { m.target = o.id; m.tt = w.time + 12; t = findTarget(w, o.id); break; }
      }
    }
  }
  if (t) { attackTarget(w, m, def, t, dt, spMul); return; }
  if (leader) {
    const d = Math.hypot(leader.x - m.x, leader.z - m.z);
    if (d > 3.5) { moveToward(w, m, def, leader.x, leader.z, d > 8 ? def.runSpeed || def.speed : def.speed, dt); m.anim = d > 8 ? 10 : 1; }
    else m.anim = 0;
    m.home = { x: leader.x, z: leader.z };
    return;
  }
  if (w.clk.phase === 'night' && m.spawner) {
    const o = w.gen.objectById(m.spawner);
    if (o) {
      if (moveToward(w, m, def, o.x, o.z, def.speed, dt)) m.anim = 1;
      if ((m.x - o.x) ** 2 + (m.z - o.z) ** 2 < 3) w.mobs.delete(m.id);
      return;
    }
  }
  wander(w, m, def, dt, 10);
}

function golemAI(w: World, m: Mob, def: MobDef, dt: number) {
  const core = m.core ? w.structs.get(m.core) : undefined;
  if (!core) { w.mobs.delete(m.id); return; }
  const bag: { id: string; n: number }[] = ((m as any).bag = (m as any).bag || []);
  const carried = bag.reduce((a, b) => a + b.n, 0);
  m.carry = carried;
  // obrona
  for (const o of w.mobs.values()) {
    const od = MOBS[o.type];
    if (['hostile', 'hound', 'shadow', 'nightHostile'].includes(od.ai) && !od.boss && (o.x - m.x) ** 2 + (o.z - m.z) ** 2 < 64 && (od.ai !== 'nightHostile' || w.clk.phase !== 'day')) {
      attackTarget(w, m, def, { x: o.x, z: o.z, kind: 'm', m: o }, dt);
      return;
    }
  }
  if (carried >= 10) {
    const chest = w.structsNear(core.x, core.z, 25, (s) => ['chest', 'big_chest', 'vault'].includes(s.type) && !!s.inv && s.inv.some((x) => !x || (x.id === 'log' && x.n < 20)))[0];
    if (!chest) { m.anim = 0; return; }
    const d = Math.hypot(chest.x - m.x, chest.z - m.z);
    if (d > 2) { moveToward(w, m, def, chest.x, chest.z, def.speed, dt); m.anim = 1; return; }
    for (const it of bag) { const left = addToSlots(chest.inv!, makeSlot(it.id, it.n)); if (left) w.spawnDrop(makeSlot(it.id, left), chest.x, chest.z); }
    (m as any).bag = [];
    w.refreshContainer(chest);
    return;
  }
  // szukaj drzewa
  let tree = (m as any).tree ? w.gen.objectById((m as any).tree) : undefined;
  if (!tree || !w.objAlive(tree)) {
    tree = undefined;
    let bd = 1e9;
    for (const o of w.gen.objectsNear(core.x, core.z, 25)) {
      if (!['tree_pine', 'tree_birch', 'mushtree', 'palm'].includes(o.type) || !w.objAlive(o)) continue;
      const d = (o.x - m.x) ** 2 + (o.z - m.z) ** 2;
      if (d < bd) { bd = d; tree = o; }
    }
    (m as any).tree = tree?.id;
  }
  if (!tree) { m.anim = 0; return; }
  const d = Math.hypot(tree.x - m.x, tree.z - m.z);
  if (d > 1.8) { moveToward(w, m, def, tree.x, tree.z, def.speed, dt); m.anim = 1; return; }
  m.r = Math.atan2(tree.x - m.x, tree.z - m.z);
  if (m.atkCd <= 0) {
    m.atkCd = 1.2;
    m.anim = 3; m.animUntil = w.time + 0.5;
    const st = w.objState.get(tree.id) || { s: 'ok', w: 0 };
    st.w = (st.w || 0) + 1;
    w.fx(tree.x, tree.z, 'hit', { c: 'chop' });
    if (st.w >= (OBJ[tree.type].work || 6)) {
      const od = OBJ[tree.type];
      for (const [it, n, ch] of od.drops || []) if (Math.random() < ch && it === 'log') bag.push({ id: it, n });
      w.setObjState(tree, 'stump', od.regrow);
      (m as any).tree = 0;
    } else w.objState.set(tree.id, st);
  }
}

function bossAI(w: World, m: Mob, def: MobDef, dt: number, spMul: number) {
  // szarża
  if (m.dashUntil && m.dashUntil > w.time && m.dashDir) {
    const sp = (def.runSpeed || def.speed) * 3.5;
    const nx = m.x + m.dashDir[0] * sp * dt, nz = m.z + m.dashDir[1] * sp * dt;
    if (w.gen.height(nx, nz) > 0.1) { m.x = nx; m.z = nz; }
    m.anim = 10;
    for (const p of w.players.values()) {
      if (p.ghost || m.hitSet?.has(p.id)) continue;
      if ((p.x - m.x) ** 2 + (p.z - m.z) ** 2 < (def.radius * 1.2) ** 2) {
        m.hitSet?.add(p.id);
        w.damagePlayer(p, (def.abilities?.find((a) => a.k === 'charge')?.dmg || 50) * dmgMul(w), def.name);
      }
    }
    for (const s of w.structsNear(m.x, m.z, def.radius + 0.5)) w.damageStruct(s, 40);
    return;
  }
  let t = m.target ? findTarget(w, m.target) : null;
  if (!t || Math.hypot(t.x - m.x, t.z - m.z) > def.sight * 1.6) {
    const p = nearestPlayer(w, m.x, m.z, def.sight);
    m.target = p ? p.id : 0;
    t = p ? findTarget(w, p.id) : null;
  }
  if (!t) { wander(w, m, def, dt, 10); return; }
  const d = Math.hypot(t.x - m.x, t.z - m.z);
  if (def.abilities && d < 24) {
    for (const ab of def.abilities) {
      if ((m.cds[ab.k] || 0) > w.time) continue;
      m.cds[ab.k] = w.time + ab.cd * (0.85 + Math.random() * 0.3);
      useAbility(w, m, def, ab, t);
      return;
    }
  }
  attackTarget(w, m, def, t, dt, spMul);
}

function useAbility(w: World, m: Mob, def: MobDef, ab: BossAbility, t: { x: number; z: number }) {
  const mul = dmgMul(w);
  const tele = ab.tele || 1.2;
  m.anim = 2; m.animUntil = w.time + tele;
  switch (ab.k) {
    case 'slam': {
      const x = m.x, z = m.z, r = ab.r || 5;
      w.fx(x, z, 'tele', { r, d: tele });
      w.pending.push({ at: w.time + tele, fn: () => {
        w.fx(x, z, 'slam', { r });
        for (const p of w.players.values()) if (!p.ghost && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) w.damagePlayer(p, (ab.dmg || 60) * mul, def.name);
        for (const s of w.structsNear(x, z, r)) w.damageStruct(s, 60);
      } });
      break;
    }
    case 'freeze': {
      const x = m.x, z = m.z, r = ab.r || 8;
      w.fx(x, z, 'tele', { r, d: tele, c: 'ice' });
      w.pending.push({ at: w.time + tele, fn: () => {
        w.fx(x, z, 'freeze', { r });
        for (const p of w.players.values()) if (!p.ghost && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) {
          p.status.freeze = w.time + 2.5; p.temp = Math.min(p.temp, 8); w.damagePlayer(p, 15 * mul, def.name);
          w.toast(p, 'Zamrożono cię!', 'danger');
        }
      } });
      break;
    }
    case 'web': {
      const x = t.x, z = t.z, r = ab.r || 5;
      w.fx(x, z, 'tele', { r, d: tele, c: 'web' });
      w.pending.push({ at: w.time + tele, fn: () => {
        w.fx(x, z, 'web', { r });
        for (const p of w.players.values()) if (!p.ghost && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) { p.status.web = w.time + 4; w.toast(p, 'Oplatają cię pajęczyny!', 'warn'); }
      } });
      break;
    }
    case 'lightning': {
      const ps = [...w.players.values()].filter((p) => !p.ghost && (p.x - m.x) ** 2 + (p.z - m.z) ** 2 < 900);
      for (let i = 0; i < (ab.n || 3); i++) {
        const p = ps[i % Math.max(1, ps.length)];
        if (!p) break;
        const x = p.x + (Math.random() - 0.5) * (i < ps.length ? 1 : 8), z = p.z + (Math.random() - 0.5) * (i < ps.length ? 1 : 8);
        w.fx(x, z, 'tele', { r: 2.2, d: tele + i * 0.15, c: 'bolt' });
        w.pending.push({ at: w.time + tele + i * 0.15, fn: () => {
          w.fx(x, z, 'lightning');
          for (const q of w.players.values()) if (!q.ghost && (q.x - x) ** 2 + (q.z - z) ** 2 < 5) w.damagePlayer(q, (ab.dmg || 40) * mul, def.name);
        } });
      }
      break;
    }
    case 'charge': {
      const dx = t.x - m.x, dz = t.z - m.z, d = Math.hypot(dx, dz) || 1;
      m.dashDir = [dx / d, dz / d];
      m.r = Math.atan2(dx, dz);
      w.fx(m.x, m.z, 'roar');
      m.hitSet = new Set();
      w.pending.push({ at: w.time + 0.6, fn: () => { m.dashUntil = w.time + 1.1; } });
      break;
    }
    case 'burrow': {
      m.hidden = true;
      w.fx(m.x, m.z, 'dig');
      const r = ab.r || 5;
      w.pending.push({ at: w.time + 1.6, fn: () => {
        const tp = nearestPlayer(w, m.x, m.z, 40);
        const x = tp ? tp.x : m.x, z = tp ? tp.z : m.z;
        w.fx(x, z, 'tele', { r, d: tele, c: 'sand' });
        w.pending.push({ at: w.time + tele, fn: () => {
          if (!w.mobs.has(m.id)) return;
          m.x = x; m.z = z; m.hidden = false;
          w.fx(x, z, 'slam', { r });
          for (const p of w.players.values()) if (!p.ghost && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) w.damagePlayer(p, (ab.dmg || 70) * mul, def.name);
          for (const s of w.structsNear(x, z, r)) w.damageStruct(s, 80);
        } });
      } });
      break;
    }
    case 'summon': {
      for (let i = 0; i < (ab.n || 2); i++) {
        const a = Math.random() * Math.PI * 2;
        const s = spawnMob(w, ab.mob || 'spider', m.x + Math.cos(a) * 4, m.z + Math.sin(a) * 4);
        if (s) { s.target = (m.target as number) || 0; s.tt = w.time + 20; s.home = { x: m.x, z: m.z }; }
      }
      w.fx(m.x, m.z, 'roar');
      break;
    }
    case 'sandstorm': {
      w.sandstorm = w.time + 30;
      w.broadcastNear(m.x, m.z, 80, { t: 'toast', text: '🌪 Piaskowy Tytan wzbija burzę piaskową!', kind: 'danger' });
      break;
    }
  }
}

export function damageMob(w: World, m: Mob, dmg: number, attacker: Player | null, status?: string) {
  const def = MOBS[m.type];
  if (!def || def.ai === 'npc' || m.hidden || m.hp <= 0) return;
  m.hp -= dmg;
  w.fx(m.x, m.z, 'hit', { c: 'flesh', id: m.id });
  if (status === 'freeze') m.status.freeze = w.time + (def.boss ? 1.2 : 4);
  if (status === 'burn') m.status.burn = w.time + 4;
  if (status === 'stun') m.status.stun = w.time + (def.boss ? 0.8 : 2);
  if (attacker) {
    if (def.ai === 'passive') { m.state = 'flee'; m.tt = w.time + 4; m.target = attacker.id; }
    else if (def.ai !== 'shadow' && def.ai !== 'golem') {
      if (m.leader === attacker.id) { m.leader = 0; }
      m.target = attacker.id; m.tt = w.time + 20;
      if (def.ai === 'herd' || def.ai === 'pig' || m.type === 'spider') {
        for (const o of w.mobs.values()) if (o.type === m.type && o !== m && (o.x - m.x) ** 2 + (o.z - m.z) ** 2 < 225 && o.leader !== attacker.id) { o.target = attacker.id; o.tt = w.time + 20; }
      }
    }
    // przyjaciele gracza atakują ten cel
    for (const o of w.mobs.values()) if (o.leader === attacker.id && o !== m) { o.target = m.id; o.tt = w.time + 10; }
  }
  if (m.hp <= 0) killMob(w, m, attacker);
}

function killMob(w: World, m: Mob, killer: Player | null) {
  const def = MOBS[m.type];
  w.mobs.delete(m.id);
  w.fx(m.x, m.z, 'death', { big: def.boss ? 1 : 0 });
  for (const [it, n, ch] of def.drops) {
    if (Math.random() > ch) continue;
    let id = it;
    if (id === 'blueprint:*') id = w.randomBlueprint();
    const slot = makeSlot(id, n);
    if (slot.id === 'blueprint' || ITEMS[slot.id]) w.spawnDrop(slot, m.x, m.z, def.boss ? 3 : 1.2);
  }
  for (const it of (m as any).bag || []) w.spawnDrop(it, m.x, m.z);
  if (m.spawner) w.spawnerNext.set(m.spawner, w.time + 60);
  if (killer) {
    killer.stats.kills++;
    questEvent(w, killer, 'kill', m.type, 1);
  }
  if (def.boss) {
    w.broadcast({ t: 'toast', text: `🏆 ${def.name} pokonany!`, kind: 'good' });
    w.broadcast({ t: 'boss', id: m.id, n: def.name, hp: 0 });
    w.flags[`${m.type}_killed`] = (w.flags[`${m.type}_killed`] || 0) + 1;
    w.flags[`${m.type}_next`] = w.time + w.settings.dayLength * 20;
    w.flags[`${m.type}_spawned`] = 0;
    questEvent(w, null, 'boss', m.type, 1);
    for (const p of w.players.values()) {
      if ((p.x - m.x) ** 2 + (p.z - m.z) ** 2 < 3600) {
        if (p !== killer) questEvent(w, p, 'boss', m.type, 1);
        else questEvent(w, p, 'boss', m.type, 1);
        if (!p.ach.includes('boss1')) { p.ach.push('boss1'); w.toast(p, '🏆 Osiągnięcie: Pogromca bestii!', 'good'); }
      }
    }
    if (m.type === 'core_guardian') {
      w.flags.victory = true;
      w.broadcast({ t: 'victory' });
    }
  }
  if (m.type === 'golem' && m.core) {
    const core = w.structs.get(m.core);
    if (core) { core.golem = 0; w.pending.push({ at: w.time + w.settings.dayLength, fn: () => { if (w.structs.has(core.id) && !core.golem) { const g = spawnMob(w, 'golem', core.x + 2, core.z + 2); if (g) { g.core = core.id; core.golem = g.id; } } } }); }
  }
}

// ======== Spawnery (co 1 s) ========
export function spawnersTick(w: World) {
  if (w.tickN % 40 !== 0) return;
  const counts = new Map<number, number>();
  for (const m of w.mobs.values()) if (m.spawner) counts.set(m.spawner, (counts.get(m.spawner) || 0) + 1);
  const seen = new Set<number>();
  const dlMul = w.settings.dayLength / 480;
  for (const p of w.players.values()) {
    for (const o of w.gen.objectsNear(p.x, p.z, 70)) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      if (o.type === 'village_fire') {
        if (!counts.get(o.id)) { const e = spawnMob(w, 'elder', o.x + 2, o.z); if (e) { e.spawner = o.id; counts.set(o.id, 1); } }
        continue;
      }
      const def = OBJ[o.type];
      if (!def?.spawn) continue;
      if (!w.objAlive(o)) continue;
      const sp = def.spawn;
      const mdef = MOBS[sp.mob];
      const hostile = ['hostile', 'nightHostile', 'static'].includes(mdef.ai);
      const max = Math.max(1, Math.round(sp.max * (hostile ? w.settings.monsters : 1)));
      if ((counts.get(o.id) || 0) >= max) continue;
      if (sp.day && w.clk.phase !== 'day') continue;
      if (sp.night && w.clk.phase === 'day') continue;
      if (mdef.dayOnly && w.clk.phase === 'night') continue;
      if (mdef.nightOnly && w.clk.phase === 'day') continue;
      const next = w.spawnerNext.get(o.id) || 0;
      if (next > w.time) continue;
      if ((p.x - o.x) ** 2 + (p.z - o.z) ** 2 < 16 && mdef.ai !== 'static') continue;
      const a = Math.random() * Math.PI * 2;
      const off = mdef.ai === 'static' ? 0 : 1.5;
      const m = spawnMob(w, sp.mob, o.x + Math.cos(a) * off, o.z + Math.sin(a) * off);
      if (m) {
        m.spawner = o.id;
        m.home = { x: o.x, z: o.z };
        if (mdef.ai === 'static') m.hidden = false;
        counts.set(o.id, (counts.get(o.id) || 0) + 1);
      }
      w.spawnerNext.set(o.id, w.time + sp.every * 60 * dlMul * (0.7 + Math.random() * 0.6));
    }
  }
}

// ======== Bossowie (co 1 s) ========
export function bossSpawnTick(w: World) {
  if (!w.settings.bosses || w.tickN % 40 !== 20) return;
  const alive = (t: string) => { for (const m of w.mobs.values()) if (m.type === t) return true; return false; };
  const c = w.clk;
  const yearKey = (t: string) => `${t}_y${c.year}`;
  const anyNear = (x: number, z: number, r: number) => {
    for (const p of w.players.values()) if (!p.ghost && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return p;
    return null;
  };
  const poi = (type: string) => w.gen.pois.find((p) => p.type === type);
  // Mroźnorożec – zima, od 3. dnia
  if (c.season === 'winter' && c.seasonDay >= Math.min(3, w.settings.seasonLength) && !w.flags[yearKey('frostdeer')] && !alive('frostdeer')) {
    const ps = [...w.players.values()].filter((p) => !p.ghost);
    if (ps.length) {
      const p = ps[Math.floor(Math.random() * ps.length)];
      const a = Math.random() * Math.PI * 2;
      if (spawnMob(w, 'frostdeer', p.x + Math.cos(a) * 35, p.z + Math.sin(a) * 35)) w.flags[yearKey('frostdeer')] = 1;
    }
  }
  const lair = (type: string, boss: string, r: number, cond: boolean, perYear: boolean) => {
    const pp = poi(type);
    if (!pp || !cond || alive(boss)) return;
    if (perYear && w.flags[yearKey(boss)]) return;
    if (!perYear && (w.flags[`${boss}_next`] || 0) > w.time) return;
    if (!anyNear(pp.x, pp.z, r)) return;
    const m = spawnMob(w, boss, pp.x, pp.z);
    if (m) { m.home = { x: pp.x, z: pp.z }; if (perYear) w.flags[yearKey(boss)] = 1; }
  };
  lair('storm_nest', 'stormgoose', 40, c.season === 'spring', true);
  lair('titan_lair', 'sandtitan', 40, c.season === 'summer', true);
  lair('queen_nest', 'queen', 30, c.phase !== 'day', false);
  lair('mole_mound', 'mothermole', 30, true, false);
  // Strażnik Rdzenia – po zbudowaniu portalu ucieczki
  const portal = [...w.structs.values()].find((s) => s.type === 'escape_portal');
  if (portal && !w.flags.core_guardian_killed && !alive('core_guardian') && anyNear(portal.x, portal.z, 45)) {
    const m = spawnMob(w, 'core_guardian', portal.x + 8, portal.z + 8);
    if (m) m.home = { x: portal.x, z: portal.z };
  }
}
