// Obsługa wiadomości od klienta: ruch, akcje, ekwipunek, crafting, dialogi, czat.
import { ITEMS } from '../shared/data/items';
import { STRUCTS } from '../shared/data/structures';
import { RECIPES, BLUEPRINT_ONLY, recipeStations, Recipe } from '../shared/data/recipes';
import { MOBS } from '../shared/data/mobs';
import { OBJ } from '../shared/data/objects';
import { CHAR } from '../shared/data/characters';
import { QUESTS, NOTES } from '../shared/data/quests';
import { SEASONS } from '../shared/env';
import type { World } from './world';
import type { Player, Slot, Struct } from './types';
import { addToSlots, countItem, removeItem, makeSlot, canMerge, stackOf } from './inventory';
import { damageMob, spawnMob } from './mobs';
import { questEvent, completeQuest, npcQuestsFor } from './quests';
import { nearWater, SMELT } from './machines';
import { StaticObj } from '../shared/world';
import { censor } from './auth';

const work = new WeakMap<World, Map<number, number>>();
function workMap(w: World) {
  let m = work.get(w);
  if (!m) { m = new Map(); work.set(w, m); }
  return m;
}

export function handleMessage(w: World, p: Player, msg: any) {
  if (!msg || typeof msg.t !== 'string') return;
  switch (msg.t) {
    case 'in': return onMove(w, p, msg);
    case 'act': return onAct(w, p, msg);
    case 'actg': return onActGround(w, p, msg);
    case 'inv': return onInv(w, p, msg);
    case 'craft': return onCraft(w, p, msg);
    case 'cont': return onCont(w, p, msg);
    case 'q': return onQuest(w, p, msg);
    case 'tp': return onTeleport(w, p, msg);
    case 'chat': return onChat(w, p, msg);
    case 'emote': p.emote = Math.max(0, Math.min(4, msg.e | 0)); setTimeout(() => (p.emote = 0), 3000); return;
    case 'ping': w.broadcast({ t: 'ping', x: +msg.x, z: +msg.z, n: p.name }); return;
    case 'track': {
      const q = String(msg.q);
      if (p.tracked.includes(q)) p.tracked = p.tracked.filter((x) => x !== q);
      else if (p.quests[q] && !p.quests[q].done) { p.tracked.push(q); if (p.tracked.length > 3) p.tracked.shift(); }
      p.dirty.quests = true;
      return;
    }
    case 'mapsync': return;
  }
}

// ========== Ruch ==========
function onMove(w: World, p: Player, msg: any) {
  const now = Date.now();
  const dt = Math.min(1, (now - p.lastIn) / 1000);
  p.lastIn = now;
  const nx = +msg.x, nz = +msg.z;
  if (!isFinite(nx) || !isFinite(nz)) return;
  if (p.status.freeze || p.status.stun) { w.send(p, { t: 'pos', x: p.x, z: p.z }); return; }
  const d = Math.hypot(nx - p.x, nz - p.z);
  const max = p.spd * 1.45 * dt + 1.0;
  if (d > max * 1.6 && d > 2) { w.send(p, { t: 'pos', x: p.x, z: p.z }); return; }
  if (nx < 1 || nz < 1 || nx > w.settings.size - 1 || nz > w.settings.size - 1) { w.send(p, { t: 'pos', x: p.x, z: p.z }); return; }
  if (!p.ghost && w.gen.height(nx, nz) < -0.35) { w.send(p, { t: 'pos', x: p.x, z: p.z }); return; }
  if (d > 0.05) {
    if (p.sleeping) { p.sleeping = 0; }
    if (p.fishing) { p.fishing = null; }
  }
  p.x = nx; p.z = nz;
  p.r = +msg.r || 0;
  if (!p.animUntil) p.anim = msg.a | 0;
  w.updateChunks(p);
  if (p.contOpen) {
    const s = w.structs.get(p.contOpen);
    if (!s || (s.x - p.x) ** 2 + (s.z - p.z) ** 2 > 49) { p.contOpen = 0; w.send(p, { t: 'cont', id: 0 }); }
  }
}

// ========== Akcje ==========
function reachOk(p: Player, x: number, z: number, extra: number) {
  return (p.x - x) ** 2 + (p.z - z) ** 2 <= (2.8 + extra) ** 2;
}

function onAct(w: World, p: Player, msg: any) {
  const id = msg.id | 0;
  const kind = String(msg.k || '');
  if (p.ghost) {
    // duch: tylko portal i ołtarz wskrzeszenia
    if (kind === 'o') {
      const o = w.gen.objectById(id);
      if (o && o.type === 'portal' && reachOk(p, o.x, o.z, 3)) w.revivePlayer(p, 'Kamienny Portal');
    } else if (kind === 's') {
      const s = w.structs.get(id);
      if (s && s.type === 'res_altar' && reachOk(p, s.x, s.z, 2)) { w.removeStruct(s, false); w.revivePlayer(p, 'Ołtarz wskrzeszenia'); }
    }
    return;
  }
  if (p.actCd > 0) return;
  if (p.wolf && kind === 's' && !['gate'].includes(w.structs.get(id)?.type || '')) { w.toast(p, 'Jako wilk nie potrafisz tego użyć.', 'warn'); return; }
  if (p.sleeping) p.sleeping = 0;
  switch (kind) {
    case 'o': return actObject(w, p, id, !!msg.alt);
    case 's': return actStruct(w, p, id, !!msg.alt);
    case 'm': return actMob(w, p, id, !!msg.alt);
    case 'd': return actDrop(w, p, id);
    case 'p': return actPlayer(w, p, id, !!msg.alt);
  }
}

function setAnim(w: World, p: Player, a: number, dur = 0.45) {
  p.anim = a;
  p.animUntil = w.time + dur;
}

function toolName(t: string) {
  return ({ chop: 'siekiery', mine: 'kilofa', dig: 'łopaty', hammer: 'młotka' } as any)[t] || t;
}

function actObject(w: World, p: Player, id: number, alt: boolean) {
  const o = w.gen.objectById(id);
  if (!o) return;
  const st = w.objState.get(id);
  let type = o.type;
  if (st?.s === 'stump') type = 'stump';
  else if (st && (st.s === 'gone' || st.s === 'picked')) { w.toast(p, 'Nic tu nie ma – odrośnie z czasem.'); return; }
  const def = OBJ[type];
  if (!def) return;
  if (!reachOk(p, o.x, o.z, (def.block || 0) + 0.6)) { w.send(p, { t: 'far', id, k: 'o' }); return; }
  p.r = Math.atan2(o.x - p.x, o.z - p.z);
  if (def.special) return specialObject(w, p, o, def.special, st?.s);
  if (!def.verb) { w.toast(p, def.name); return; }
  void alt;
  const hand = p.equip.hand;
  const hdef = hand ? ITEMS[hand.id] : undefined;
  let power = 1;
  if (def.tool) {
    if (!hdef?.tool?.includes(def.tool)) { w.toast(p, `Potrzebujesz ${toolName(def.tool)}.`, 'warn'); return; }
    power = hdef.toolPower || 1;
    if (p.wolf) power *= 1.5;
  }
  if (def.winterNo && w.clk.season === 'winter') { w.toast(p, 'Zimą nic tu nie rośnie.', 'warn'); return; }
  const wm = workMap(w);
  const prog = (wm.get(id) || 0) + power;
  const need = def.work || 1;
  setAnim(w, p, def.tool ? 3 : 5, def.tool ? 0.5 : 0.35);
  p.actCd = def.tool ? 0.55 : 0.35;
  w.fx(o.x, o.z, 'hit', { c: def.tool || 'pick' });
  if (def.tool) w.useDurability(p, 'hand', 1);
  if (type === 'spider_den' && prog <= power) {
    for (const m of w.mobs.values()) if (m.spawner === id) { m.target = p.id; m.tt = w.time + 20; }
    for (let i = 0; i < 2; i++) { const m = spawnMob(w, 'spider', o.x, o.z); if (m) { m.target = p.id; m.tt = w.time + 20; m.spawner = id; } }
  }
  if (prog < need) { wm.set(id, prog); return; }
  wm.delete(id);
  for (const [it, n, ch] of def.drops || []) {
    if (Math.random() > ch) continue;
    const item = it === 'blueprint:*' ? w.randomBlueprint() : it;
    w.giveItem(p, item, n);
  }
  if (def.hurt && p.equip.body?.id !== 'armor_wood') { w.damagePlayer(p, def.hurt, 'kolce', true); w.toast(p, 'Au! Kłuje!', 'warn'); }
  if (def.sanity) p.sanity = Math.min(p.maxSanity, p.sanity + def.sanity);
  const after = def.after || 'picked';
  w.setObjState(o, after === 'remove' ? 'gone' : after, after === 'stump' ? OBJ[o.type].regrow : def.regrow);
  if (type === 'stump') w.setObjState(o, 'gone', OBJ[o.type].regrow);
  // drzewiec – kara za wycinkę lasu
  if ((o.type === 'tree_pine' || o.type === 'tree_birch') && type !== 'stump' && w.gen.biome(o.x, o.z) === 'forest' && Math.random() < 0.02 * w.settings.monsters) {
    let near = false;
    for (const m of w.mobs.values()) if (m.type === 'treeguard' && (m.x - o.x) ** 2 + (m.z - o.z) ** 2 < 2500) near = true;
    if (!near) {
      const m = spawnMob(w, 'treeguard', o.x + 4, o.z + 4);
      if (m) { m.target = p.id; m.tt = w.time + 60; w.toast(p, '🌳 Las się budzi! Drzewiec-strażnik jest wściekły!', 'danger'); }
    }
  }
}

const LOOT: [string, number][] = [['gold', 3], ['rope', 3], ['torch', 1], ['meat_cooked', 2], ['flint', 4], ['board', 3], ['silk', 3], ['iron_ingot', 2], ['gear', 1], ['health_potion', 1], ['bandage', 2], ['crystal', 1], ['seeds', 4], ['spear', 1], ['backpack', 1], ['jerky', 2], ['glass', 2], ['copper_ingot', 2], ['heart', 1]];

function specialObject(w: World, p: Player, o: StaticObj, special: string, state?: string) {
  switch (special) {
    case 'portal': {
      const tower = w.wq.srv_tower;
      const goals = tower && !tower.done ? QUESTS.srv_tower.goals.map((g, i) => ({ t: g.t, l: g.label, n: g.n, c: tower.g[i], have: countItem(p.inv, g.t) })) : null;
      w.send(p, { t: 'dialog', kind: 'portal', title: 'Kamienny Portal', text: 'Starożytny portal pulsuje słabym światłem. To tutaj się obudziliście. Duchy poległych mogą go dotknąć, aby wrócić do życia.', tower: goals });
      return;
    }
    case 'circle': {
      const circles: number[] = (w.flags.circles = w.flags.circles || []);
      if (!circles.includes(o.id)) {
        circles.push(o.id);
        w.fx(o.x, o.z, 'revive');
        w.broadcast({ t: 'toast', text: `🔮 ${p.name} aktywował(a) kamienny krąg (${circles.length}/4).`, kind: 'good' });
        questEvent(w, p, 'activate', 'stone_circle', 1);
        return;
      }
      if (!w.flags.maptable) { w.toast(p, 'Krąg jest aktywny. Zbudujcie Stół Kartografa, aby podróżować między kręgami.', 'info'); return; }
      const dest = circles.filter((c) => c !== o.id).map((c) => { const poi = w.gen.pois.find((x) => x.id === c)!; return { id: c, name: `Krąg ${'IVX'[0]}${poi.idx! + 1}`, biome: w.gen.biome(poi.x, poi.z) }; });
      w.send(p, { t: 'dialog', kind: 'circle', title: 'Kamienny krąg', text: dest.length ? 'Wybierz cel podróży:' : 'Brak innych aktywnych kręgów.', from: o.id, dest });
      return;
    }
    case 'shrine': {
      if (p.shrineCd > w.time) { w.toast(p, 'Kapliczka milczy. Wróć jutro.', 'info'); return; }
      p.shrineCd = w.time + w.settings.dayLength * 0.8;
      p.buffs.blessed = w.time + 120;
      p.buffs.speed = w.time + 120;
      p.sanity = Math.min(p.maxSanity, p.sanity + 40);
      p.hp = Math.min(p.maxHp, p.hp + 20);
      w.fx(o.x, o.z, 'revive');
      w.toast(p, '🙏 Czujesz spokój i lekkość (błogosławieństwo na 2 minuty).', 'good');
      if (!p.shrines.includes(o.id)) { p.shrines.push(o.id); questEvent(w, p, 'activate', 'shrine', 1); }
      return;
    }
    case 'loot': {
      if (state === 'opened') { w.toast(p, 'Pusto.'); return; }
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) { const [it, k] = LOOT[Math.floor(Math.random() * LOOT.length)]; w.giveItem(p, it, k); }
      if (Math.random() < 0.4) w.giveItem(p, w.randomBlueprint(), 1);
      w.setObjState(o, 'opened');
      w.fx(o.x, o.z, 'pick');
      return;
    }
    case 'note': {
      const poi = w.gen.pois.find((x) => x.id === o.id);
      const text = NOTES[(poi?.idx ?? 0) % NOTES.length];
      w.send(p, { t: 'dialog', kind: 'note', title: '📄 Notatka', text });
      if (!p.notes.includes(o.id)) { p.notes.push(o.id); questEvent(w, p, 'read', 'note', 1); }
      return;
    }
    case 'core': {
      if (w.flags.coreRepaired) {
        w.send(p, { t: 'dialog', kind: 'info', title: 'Starożytny Rdzeń', text: 'Rdzeń pulsuje błękitnym światłem. Stojąc obok, możesz tworzyć przedmioty Prastarych i Portal Ucieczki.' });
        return;
      }
      if (removeItem(p.inv, 'ancient_key', 1)) {
        w.flags.coreRepaired = true;
        p.dirty.inv = true;
        w.fx(o.x, o.z, 'bossSpawn');
        w.broadcast({ t: 'toast', text: `💠 ${p.name} naprawił(a) Starożytny Rdzeń!`, kind: 'good' });
        questEvent(w, p, 'activate', 'ancient_core', 1);
        return;
      }
      w.send(p, { t: 'dialog', kind: 'info', title: 'Starożytny Rdzeń', text: 'Martwy mechanizm Prastarych. W środku jest zamek w kształcie klucza. (Potrzebny Klucz Prastarych – wykuj go na Ołtarzu Cienia z 3 Fragmentów Rdzenia.)' });
      return;
    }
    case 'villagefire':
      w.toast(p, 'Ognisko wioski Chrumków. Porozmawiaj z Wodzem.');
      return;
    default:
      if (special.startsWith('lair:')) {
        const boss = MOBS[special.slice(5)];
        w.send(p, { t: 'dialog', kind: 'info', title: OBJ[o.type].name, text: `Coś tu mieszka... ${boss ? `Ślady wskazują na: ${boss.name}.` : ''}` });
      }
  }
}

function actStruct(w: World, p: Player, id: number, alt: boolean) {
  const s = w.structs.get(id);
  if (!s) return;
  const def = STRUCTS[s.type];
  if (!reachOk(p, s.x, s.z, def.radius + 0.6)) { w.send(p, { t: 'far', id, k: 's' }); return; }
  p.r = Math.atan2(s.x - p.x, s.z - p.z);
  const hand = p.equip.hand;
  // młotek: rozbiórka / naprawa
  if (hand && ITEMS[hand.id]?.tool?.includes('hammer') && (alt || true)) {
    if (w.settings.protect && s.owner !== p.key && !p.admin && s.owner !== '') { w.toast(p, 'To nie twoja budowla (ochrona baz włączona).', 'warn'); return; }
    if (countItem(p.inv, 'repair_kit') && s.hp < def.hp && !alt) {
      removeItem(p.inv, 'repair_kit', 1);
      s.hp = Math.min(def.hp, s.hp + def.hp * 0.5);
      p.dirty.inv = true;
      w.updateStruct(s);
      w.fx(s.x, s.z, 'build');
      w.toast(p, `Naprawiono: ${def.name}.`, 'good');
      return;
    }
    const wm = workMap(w);
    const prog = (wm.get(id) || 0) + 1;
    setAnim(w, p, 3, 0.5);
    p.actCd = 0.5;
    w.useDurability(p, 'hand', 1);
    w.fx(s.x, s.z, 'hit', { c: 'hammer' });
    if (prog < 3) { wm.set(id, prog); return; }
    wm.delete(id);
    const rec = Object.values(RECIPES).find((r) => r.out === s.type && r.place);
    if (rec) for (const [it, n] of rec.ing) { const k = Math.floor(n / (rec.n || 1) / 2); if (k > 0) w.spawnDrop(makeSlot(it, k), s.x, s.z); }
    w.removeStruct(s);
    w.fx(s.x, s.z, 'break');
    return;
  }
  p.actCd = 0.25;
  // paliwo z ręki do ognia
  switch (s.type) {
    case 'campfire': case 'firepit': case 'smokehouse': case 'generator': case 'furnace': {
      if (s.type === 'furnace' || s.type === 'generator' || s.type === 'smokehouse') {
        if (!alt) return openContainer(w, p, s);
      }
      const fuelIdx = p.inv.findIndex((it) => it && ITEMS[it.id]?.fuel && !ITEMS[it.id]?.food);
      if (fuelIdx < 0) { w.toast(p, 'Nie masz paliwa (trawa, gałązki, kłody, węgiel).', 'warn'); return; }
      const it = p.inv[fuelIdx]!;
      s.fuel = Math.min(def.fuelMax!, (s.fuel || 0) + ITEMS[it.id].fuel!);
      it.n--; if (it.n <= 0) p.inv[fuelIdx] = null;
      p.dirty.inv = true;
      w.updateStruct(s);
      w.fx(s.x, s.z, 'fuel');
      setAnim(w, p, 5, 0.3);
      return;
    }
    case 'gate':
      s.open = !s.open;
      w.updateStruct(s);
      return;
    case 'tent': {
      if (w.clk.phase === 'day') { w.toast(p, 'Nie jestem śpiący – śpi się w nocy.', 'info'); return; }
      if (p.hunger < 15) { w.toast(p, 'Jestem zbyt głodny, żeby spać.', 'warn'); return; }
      p.sleeping = s.id;
      p.x = s.x + 0.1; p.z = s.z + 0.1;
      s.uses = (s.uses || 1) - 1;
      w.send(p, { t: 'pos', x: p.x, z: p.z });
      w.toast(p, 'Zasypiasz... (ruszenie się budzi)', 'info');
      if (s.uses <= 0) w.removeStruct(s, false); else w.updateStruct(s);
      // jeśli wszyscy śpią – przewiń noc
      const all = [...w.players.values()].filter((q) => !q.ghost);
      if (all.length && all.every((q) => q.sleeping)) {
        const dl = w.settings.dayLength;
        const next = (Math.floor(w.time / dl) + 1) * dl + 1;
        w.time = next;
        w.broadcast({ t: 'toast', text: '🌅 Wszyscy zasnęli – nastaje ranek.', kind: 'good' });
        for (const q of all) { q.sleeping = 0; q.hunger = Math.max(0, q.hunger - 40); q.sanity = Math.min(q.maxSanity, q.sanity + 50); q.hp = Math.min(q.maxHp, q.hp + 40); }
      }
      return;
    }
    case 'farm': return actFarm(w, p, s);
    case 'quest_board':
      w.send(p, { t: 'dialog', kind: 'board', title: '📋 Tablica ogłoszeń', text: w.daily.tasks.length ? 'Dzisiejsze zlecenia (dla całej drużyny):' : 'Nowe zlecenia pojawią się o świcie.', tasks: w.daily.tasks.map((t) => ({ l: t.label, c: t.prog, n: t.n, done: t.done, rw: t.reward })) });
      return;
    case 'res_altar':
      w.toast(p, 'Ołtarz czeka na ducha, który go dotknie.', 'info');
      return;
    case 'escape_portal':
      if (w.flags.victory) w.send(p, { t: 'victory' });
      else w.toast(p, 'Portal jest martwy, dopóki Strażnik Rdzenia żyje.', 'warn');
      return;
    case 'planted_tree': {
      if ((s.growth || 0) < 1) { w.toast(p, `Drzewko rośnie (${Math.round((s.growth || 0) * 100)}%).`); return; }
      if (!hand || !ITEMS[hand.id]?.tool?.includes('chop')) { w.toast(p, 'Potrzebujesz siekiery.', 'warn'); return; }
      const wm = workMap(w);
      const prog = (wm.get(id) || 0) + (ITEMS[hand.id].toolPower || 1);
      setAnim(w, p, 3, 0.5); p.actCd = 0.55; w.useDurability(p, 'hand', 1);
      w.fx(s.x, s.z, 'hit', { c: 'chop' });
      if (prog < 6) { wm.set(id, prog); return; }
      wm.delete(id);
      w.giveItem(p, 'log', 3);
      if (Math.random() < 0.6) w.giveItem(p, 'pinecone', 1);
      w.removeStruct(s, false);
      return;
    }
  }
  if (def.station && !def.slots) {
    w.send(p, { t: 'openCraft', st: def.station });
    if (s.type === 'maptable') w.sendMaps();
    return;
  }
  if (s.inv) return openContainer(w, p, s);
  if (def.power) {
    if (alt) { s.on = s.on === false; w.updateStruct(s); w.toast(p, `${def.name}: ${s.on === false ? 'wyłączono' : 'włączono'}.`); return; }
    const info = (w as any).energyInfo;
    w.toast(p, `${def.name}: ${s.powered ? '⚡ zasilana' : 'brak zasilania'}. (Shift+klik: wł./wył.)`);
    void info;
    return;
  }
  w.toast(p, def.desc || def.name);
}

function actFarm(w: World, p: Player, s: Struct) {
  if (s.plant && (s.growth || 0) >= 1) {
    const n = 1 + (Math.random() < 0.5 ? 1 : 0) + (CHAR[p.char].farmBonus ? 1 : 0);
    w.giveItem(p, s.plant, n);
    if (Math.random() < 0.5) w.giveItem(p, 'seeds', 1);
    s.plant = undefined; s.growth = 0;
    w.updateStruct(s);
    setAnim(w, p, 5, 0.35);
    return;
  }
  if (s.plant) {
    if (removeItem(p.inv, 'fertilizer', 1) || removeItem(p.inv, 'rot', 2)) {
      s.growth = Math.min(1, (s.growth || 0) + 0.35);
      p.dirty.inv = true;
      w.updateStruct(s);
      w.fx(s.x, s.z, 'pick');
      w.toast(p, 'Nawieziono grządkę.', 'good');
      return;
    }
    w.toast(p, `Rośnie: ${ITEMS[s.plant]?.name} (${Math.round((s.growth || 0) * 100)}%). ${w.clk.season === 'winter' ? 'Zimą nie rośnie!' : ''}`);
    return;
  }
  if (!removeItem(p.inv, 'seeds', 1)) { w.toast(p, 'Potrzebujesz nasion.', 'warn'); return; }
  const season = w.clk.season;
  const pool = season === 'summer' ? ['pumpkin', 'carrot', 'berries'] : season === 'spring' ? ['carrot', 'potato', 'berries'] : ['potato', 'carrot', 'pumpkin'];
  s.plant = pool[Math.floor(Math.random() * pool.length)];
  s.growth = 0;
  (s as any).bonus = CHAR[p.char].farmBonus || 1;
  p.dirty.inv = true;
  w.updateStruct(s);
  setAnim(w, p, 5, 0.35);
  w.toast(p, `Zasadzono: ${ITEMS[s.plant].name}.`, 'good');
}

function openContainer(w: World, p: Player, s: Struct) {
  p.contOpen = s.id;
  w.sendContainer(p, s);
}

function playerDamage(p: Player, w: World) {
  const h = p.equip.hand;
  const def = h ? ITEMS[h.id] : undefined;
  let dmg = def?.dmg ?? 10;
  dmg *= CHAR[p.char].dmgMul;
  if (p.wolf) dmg = Math.max(dmg, 45) * 1.6;
  void w;
  return dmg;
}

function actMob(w: World, p: Player, id: number, alt: boolean) {
  const m = w.mobs.get(id);
  if (!m) return;
  const def = MOBS[m.type];
  const hand = p.equip.hand;
  const hdef = hand ? ITEMS[hand.id] : undefined;
  const d = Math.hypot(m.x - p.x, m.z - p.z);
  if (def.ai === 'npc') {
    if (d > 5) { w.send(p, { t: 'far', id, k: 'm' }); return; }
    questEvent(w, p, 'talk', m.type, 1);
    const qs = npcQuestsFor(w, p, 'elder');
    w.send(p, { t: 'dialog', kind: 'npc', npc: 'elder', title: def.name, text: elderLine(w, p), ...qs });
    return;
  }
  if (def.ai === 'golem') { w.toast(p, `Golem roboczy niesie ${m.carry || 0} kłód.`); return; }
  // karmienie chrumka
  if (def.ai === 'pig' && !alt && m.target !== p.id) {
    const meatIdx = p.inv.findIndex((it) => it && ['meat', 'small_meat', 'monster_meat', 'meat_cooked', 'small_meat_cooked'].includes(it.id));
    if (meatIdx >= 0) {
      if (d > 3.5) { w.send(p, { t: 'far', id, k: 'm' }); return; }
      const it = p.inv[meatIdx]!;
      it.n--; if (it.n <= 0) p.inv[meatIdx] = null;
      p.dirty.inv = true;
      m.leader = p.id;
      m.leaderUntil = w.time + w.settings.dayLength * 0.5;
      m.target = 0;
      w.fx(m.x, m.z, 'heart');
      w.toast(p, 'Chrumek idzie za tobą! (Shift+klik, aby zaatakować)', 'good');
      return;
    }
  }
  if (def.ai === 'pig' && m.leader === p.id && !alt) { w.toast(p, 'To twój towarzysz. Shift+klik, aby zaatakować.'); return; }
  const ranged = !!hdef?.range;
  if (ranged) {
    if (d > (hdef!.range || 12) + 1) { w.send(p, { t: 'far', id, k: 'm' }); return; }
    if (hdef!.ammo && !removeItem(p.inv, hdef!.ammo, 1)) { w.toast(p, `Brak amunicji: ${ITEMS[hdef!.ammo].name}.`, 'warn'); return; }
    if (hdef!.ammo) p.dirty.inv = true;
    w.spawnProj(hdef!.proj || 'arrow', p.x, p.z, m.x, m.z, playerDamage(p, w), p.id, 'p', hdef!.status);
    p.actCd = 0.8;
  } else {
    const reach = 2.5 + def.radius * m.scale / def.scale + 0.6;
    if (d > reach) { w.send(p, { t: 'far', id, k: 'm' }); return; }
    damageMob(w, m, playerDamage(p, w), p, hdef?.status);
    p.actCd = p.wolf ? 0.4 : 0.55;
  }
  p.r = Math.atan2(m.x - p.x, m.z - p.z);
  setAnim(w, p, 2, 0.4);
  if (hand && hdef?.durKind === 'use') w.useDurability(p, 'hand', 1);
}

function elderLine(w: World, p: Player) {
  const lines = [
    `Witaj, ${p.name}! Chrumki pamiętają czasy Prastarych...`,
    'Za lasem jest Kokon Królowej. Nie chodź tam w nocy.',
    'Kamienne kręgi... dawniej Prastarzy podróżowali nimi w mgnieniu oka.',
    'Mięso! Przynieś mięso, a moi chłopcy pójdą za tobą w ogień.',
    `Dzień ${w.clk.day}. ${w.clk.season === 'winter' ? 'Zima jest długa. Trzymaj się ognia.' : 'Dobra pogoda na zbieranie.'}`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function actDrop(w: World, p: Player, id: number) {
  const d = w.drops.get(id);
  if (!d) return;
  if (!reachOk(p, d.x, d.z, 0.5)) { w.send(p, { t: 'far', id, k: 'd' }); return; }
  const left = addToSlots(p.inv, d.item);
  const taken = d.item.n - left;
  if (taken <= 0) { w.toast(p, 'Ekwipunek pełny.', 'warn'); return; }
  if (left > 0) d.item.n = left; else w.removeDrop(id);
  p.dirty.inv = true;
  p.actCd = 0.15;
  setAnim(w, p, 5, 0.25);
  w.send(p, { t: 'got', id: d.item.id, n: taken, m: d.item.m });
  if (d.item.id !== 'blueprint') questEvent(w, p, 'gather', d.item.id, taken);
}

function actPlayer(w: World, p: Player, id: number, alt: boolean) {
  const q = w.players.get(id);
  if (!q || q === p) return;
  if (!reachOk(p, q.x, q.z, 1)) { w.send(p, { t: 'far', id, k: 'p' }); return; }
  if (q.ghost) {
    if (removeItem(p.inv, 'heart', 1)) { p.dirty.inv = true; w.revivePlayer(q, `wskrzeszony(a) przez ${p.name}`); }
    else w.toast(p, 'Potrzebujesz Serca życia, aby wskrzesić ducha.', 'warn');
    return;
  }
  if (w.settings.pvp && alt) {
    w.damagePlayer(q, playerDamage(p, w), `gracz ${p.name}`);
    setAnim(w, p, 2, 0.4);
    p.actCd = 0.6;
  }
}

function onActGround(w: World, p: Player, msg: any) {
  if (p.ghost || p.actCd > 0) return;
  const x = +msg.x, z = +msg.z;
  if (!isFinite(x) || !isFinite(z)) return;
  const hand = p.equip.hand;
  if (hand && ITEMS[hand.id]?.tool?.includes('fish')) {
    if ((x - p.x) ** 2 + (z - p.z) ** 2 > 64) return;
    if (w.gen.height(x, z) > 0) { w.toast(p, 'Musisz łowić w wodzie.', 'warn'); return; }
    if (p.fishing) return;
    p.fishing = { until: w.time + 3 + Math.random() * 4 };
    p.r = Math.atan2(x - p.x, z - p.z);
    setAnim(w, p, 3, 7);
    w.toast(p, 'Zarzucasz wędkę...');
  }
}

// ========== Ekwipunek ==========
type Ref = { arr: (Slot | null)[]; i: number; kind: 'i' | 'c' } | { eq: 'hand' | 'head' | 'body' | 'back'; kind: 'e' };

function resolveRef(w: World, p: Player, ref: string): Ref | null {
  if (typeof ref !== 'string') return null;
  const [k, v] = ref.split(':');
  if (k === 'i') { const i = +v; if (i >= 0 && i < p.inv.length) return { arr: p.inv, i, kind: 'i' }; }
  if (k === 'e' && ['hand', 'head', 'body', 'back'].includes(v)) return { eq: v as any, kind: 'e' };
  if (k === 'c' && p.contOpen) {
    const s = w.structs.get(p.contOpen);
    const i = +v;
    if (s?.inv && i >= 0 && i < s.inv.length) return { arr: s.inv, i, kind: 'c' };
  }
  return null;
}
function getRef(p: Player, r: Ref): Slot | null {
  return r.kind === 'e' ? p.equip[r.eq] : r.arr[r.i];
}
function setRef(p: Player, r: Ref, v: Slot | null) {
  if (r.kind === 'e') p.equip[r.eq] = v; else r.arr[r.i] = v;
}

function resizeInv(w: World, p: Player) {
  const size = 15 + (ITEMS[p.equip.back?.id || '']?.slots || 0);
  while (p.inv.length < size) p.inv.push(null);
  if (p.inv.length > size) {
    const extra = p.inv.splice(size);
    for (const it of extra) if (it) { const left = addToSlots(p.inv, it); if (left) w.spawnDrop({ ...it, n: left }, p.x, p.z); }
  }
}

function onInv(w: World, p: Player, msg: any) {
  if (p.ghost) return;
  const op = msg.op;
  if (op === 'move') {
    const a = resolveRef(w, p, msg.a), b = resolveRef(w, p, msg.b);
    if (!a || !b) return;
    const A = getRef(p, a), B = getRef(p, b);
    if (!A) return;
    const cont = p.contOpen ? w.structs.get(p.contOpen) : undefined;
    if (cont && (a.kind === 'c' || b.kind === 'c')) {
      if (cont.type === 'kitchen' && cont.prog) return;
      if (cont.type === 'furnace' && b.kind === 'c') {
        const bi = (b as any).i;
        if (bi === 2) return;
        if (bi === 0 && !SMELT[A.id]) { w.toast(p, 'Tego nie da się przetopić.', 'warn'); return; }
        if (bi === 1 && !ITEMS[A.id]?.fuel) { w.toast(p, 'To nie jest paliwo.', 'warn'); return; }
      }
      if (cont.type === 'generator' && b.kind === 'c' && !ITEMS[A.id]?.fuel) { w.toast(p, 'To nie jest paliwo.', 'warn'); return; }
      if (cont.type === 'kitchen' && b.kind === 'c' && !ITEMS[A.id]?.food) { w.toast(p, 'Do kuchni wkładaj tylko jedzenie.', 'warn'); return; }
      if (cont.type === 'kitchen' && b.kind === 'c' && !B && A.n > 1) {
        // po jednym składniku na slot
        A.n--; setRef(p, b, { ...A, n: 1 });
        p.dirty.inv = true; w.refreshContainer(cont); return;
      }
    }
    if (b.kind === 'e') {
      if (ITEMS[A.id]?.slot !== b.eq) return;
      if (p.wolf) { w.toast(p, 'Wilk nie nosi ekwipunku.', 'warn'); return; }
    }
    if (a.kind === 'e' && B && ITEMS[B.id]?.slot !== a.eq) {
      // nie da się zamienić – przenieś do wolnego slotu
      const left = addToSlots(p.inv, A);
      if (left === 0) p.equip[a.eq] = null;
    } else if (B && canMerge(A, B) && a !== b) {
      const max = stackOf(B.id);
      const k = Math.min(max - B.n, A.n);
      if (A.f !== undefined && B.f !== undefined) B.f = (B.f * B.n + A.f * k) / (B.n + k);
      B.n += k; A.n -= k;
      if (A.n <= 0) setRef(p, a, null);
    } else {
      setRef(p, a, B);
      setRef(p, b, A);
    }
    if (a.kind === 'e' || b.kind === 'e') resizeInv(w, p);
    p.dirty.inv = true;
    if (cont) w.refreshContainer(cont);
    return;
  }
  if (op === 'quick') {
    // shift+klik: przenieś między ekwipunkiem a otwartym kontenerem
    const a = resolveRef(w, p, msg.a);
    if (!a || a.kind === 'e') return;
    const A = getRef(p, a);
    if (!A) return;
    const cont = p.contOpen ? w.structs.get(p.contOpen) : undefined;
    if (!cont?.inv) return;
    if (cont.type === 'kitchen' && cont.prog) return;
    if (a.kind === 'i') {
      let target = cont.inv;
      if (cont.type === 'furnace') {
        if (SMELT[A.id]) target = [cont.inv[0]];
        else if (ITEMS[A.id]?.fuel) target = [cont.inv[1]];
        else return;
        const idx = SMELT[A.id] ? 0 : 1;
        const tmp = [cont.inv[idx]];
        const left = addToSlots(tmp, A);
        cont.inv[idx] = tmp[0];
        if (left) A.n = left; else a.arr[a.i] = null;
      } else if (cont.type === 'kitchen') {
        if (!ITEMS[A.id]?.food) return;
        const i = cont.inv.findIndex((x) => !x);
        if (i < 0) return;
        cont.inv[i] = { ...A, n: 1 };
        A.n--; if (A.n <= 0) a.arr[a.i] = null;
      } else if (cont.type === 'generator') {
        if (!ITEMS[A.id]?.fuel) return;
        const left = addToSlots(cont.inv, A);
        if (left) A.n = left; else a.arr[a.i] = null;
      } else {
        const left = addToSlots(target, A);
        if (left) A.n = left; else a.arr[a.i] = null;
      }
    } else {
      const left = addToSlots(p.inv, A);
      if (left) A.n = left; else a.arr[a.i] = null;
      questEvent(w, p, 'gather', A.id, A.n - left);
    }
    p.dirty.inv = true;
    w.refreshContainer(cont);
    return;
  }
  if (op === 'drop') {
    const a = resolveRef(w, p, msg.a);
    if (!a) return;
    const A = getRef(p, a);
    if (!A) return;
    const n = msg.one ? 1 : A.n;
    w.spawnDrop({ ...A, n }, p.x + Math.sin(p.r) * 0.8, p.z + Math.cos(p.r) * 0.8, 0.3);
    A.n -= n;
    if (A.n <= 0) setRef(p, a, null);
    if (a.kind === 'e') resizeInv(w, p);
    p.dirty.inv = true;
    if (a.kind === 'c') w.refreshContainer(w.structs.get(p.contOpen)!);
    return;
  }
  if (op === 'use') return useItem(w, p, msg);
}

function nearFire(w: World, p: Player) {
  return w.structsNear(p.x, p.z, 3.5, (s) => (s.type === 'campfire' || s.type === 'firepit') && (s.fuel || 0) > 0)[0];
}

function useItem(w: World, p: Player, msg: any) {
  const a = resolveRef(w, p, msg.a);
  if (!a) return;
  const A = getRef(p, a);
  if (!A) return;
  const def = ITEMS[A.id];
  if (!def) return;
  const take = () => { A.n--; if (A.n <= 0) setRef(p, a, null); p.dirty.inv = true; };
  // zdejmowanie
  if (a.kind === 'e') {
    const left = addToSlots(p.inv, A);
    if (left === 0) { p.equip[a.eq] = null; resizeInv(w, p); p.dirty.inv = true; }
    else w.toast(p, 'Brak miejsca w ekwipunku.', 'warn');
    return;
  }
  const fire = nearFire(w, p);
  // gotowanie przy ogniu
  if (fire && def.food?.cooked && !msg.alt) {
    take();
    w.giveItem(p, def.food.cooked, 1, false);
    w.fx(fire.x, fire.z, 'cook');
    setAnim(w, p, 5, 0.3);
    return;
  }
  // dorzucanie do ognia
  if (fire && def.fuel && !def.food && !def.slot && !msg.alt && A.id !== 'pinecone') {
    const fdef = STRUCTS[fire.type];
    fire.fuel = Math.min(fdef.fuelMax!, (fire.fuel || 0) + def.fuel);
    take();
    w.updateStruct(fire);
    w.fx(fire.x, fire.z, 'fuel');
    return;
  }
  if (def.slot) {
    if (p.wolf) { w.toast(p, 'Wilk nie nosi ekwipunku.', 'warn'); return; }
    const cur = p.equip[def.slot];
    p.equip[def.slot] = A;
    setRef(p, a, cur);
    resizeInv(w, p);
    p.dirty.inv = true;
    return;
  }
  switch (def.effect) {
    case 'learn': {
      const r = A.m;
      if (!r || !RECIPES[r]) { take(); return; }
      if (p.known.has(r)) { w.toast(p, 'Znasz już tę recepturę.'); return; }
      p.known.add(r);
      p.dirty.known = true;
      take();
      w.toast(p, `📘 Nauczono się: ${ITEMS[RECIPES[r].out]?.name || STRUCTS[RECIPES[r].out]?.name}!`, 'good');
      return;
    }
    case 'heal20': p.hp = Math.min(p.maxHp, p.hp + 20); take(); w.fx(p.x, p.z, 'heal'); return;
    case 'heal40': p.hp = Math.min(p.maxHp, p.hp + 40); take(); w.fx(p.x, p.z, 'heal'); return;
    case 'heal75': p.hp = Math.min(p.maxHp, p.hp + 75); take(); w.fx(p.x, p.z, 'heal'); return;
    case 'sanity60': p.sanity = Math.min(p.maxSanity, p.sanity + 60); take(); w.fx(p.x, p.z, 'heal'); return;
    case 'speed': p.buffs.speed = w.time + 120; take(); w.toast(p, 'Szybkość +30% na 2 min.', 'good'); return;
    case 'warm': p.buffs.warm = w.time + 180; take(); w.toast(p, 'Rozgrzewa cię ogień w żyłach (3 min).', 'good'); return;
    case 'cool': p.buffs.cool = w.time + 180; take(); w.toast(p, 'Przyjemny chłód (3 min).', 'good'); return;
    case 'revive': {
      const g = [...w.players.values()].find((q) => q.ghost && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 25);
      if (!g) { w.toast(p, 'W pobliżu nie ma ducha.', 'warn'); return; }
      take(); w.revivePlayer(g, `wskrzeszony(a) przez ${p.name}`); return;
    }
    case 'fertilize': {
      const f = w.structsNear(p.x, p.z, 4, (s) => s.type === 'farm' && !!s.plant && (s.growth || 0) < 1)[0];
      if (!f) { w.toast(p, 'Stań przy rosnącej grządce.', 'warn'); return; }
      take(); f.growth = Math.min(1, (f.growth || 0) + 0.35); w.updateStruct(f); w.fx(f.x, f.z, 'pick'); return;
    }
    case 'repair': {
      const s = w.structsNear(p.x, p.z, 4, (q) => q.hp < STRUCTS[q.type].hp)[0];
      if (!s) { w.toast(p, 'W pobliżu nie ma uszkodzonej budowli.', 'warn'); return; }
      take(); s.hp = Math.min(STRUCTS[s.type].hp, s.hp + STRUCTS[s.type].hp * 0.5); w.updateStruct(s); w.fx(s.x, s.z, 'build'); return;
    }
  }
  if (A.id === 'seeds') {
    const f = w.structsNear(p.x, p.z, 4, (s) => s.type === 'farm' && !s.plant)[0];
    if (f) { actFarm(w, p, f); return; }
  }
  if (A.id === 'pinecone') {
    const x = p.x + Math.sin(p.r) * 1.5, z = p.z + Math.cos(p.r) * 1.5;
    if (w.gen.height(x, z) < 0.3) { w.toast(p, 'Nie można tu sadzić.', 'warn'); return; }
    take();
    const s = w.addStruct('planted_tree', x, z, Math.random() * 6, p.key);
    s.growth = 0;
    w.toast(p, 'Posadzono drzewko. Urośnie w ~3 dni.', 'good');
    return;
  }
  if (def.food) {
    const cd = CHAR[p.char];
    if (cd.noRawMeat && def.food.noRaw) { w.toast(p, 'Nie zjem tego na surowo! Upiecz przy ognisku.', 'warn'); return; }
    if (p.wolf && def.food.cat !== 'meat' && def.food.cat !== 'monster') { w.toast(p, 'Wilk je tylko mięso.', 'warn'); return; }
    const fresh = A.f ?? 1;
    const mul = fresh > 0.5 ? 1 : fresh > 0.2 ? 0.66 : 0.4;
    p.hunger = Math.max(0, Math.min(p.maxHunger, p.hunger + def.food.hunger * mul));
    const hp = def.food.hp > 0 ? def.food.hp * mul : def.food.hp;
    const san = def.food.san > 0 ? def.food.san * mul : def.food.san + (fresh < 0.5 ? -5 : 0);
    if (p.wolf && def.food.cat === 'monster') { /* wilk toleruje */ } else {
      p.hp = Math.min(p.maxHp, p.hp + hp);
      p.sanity = Math.max(0, Math.min(p.maxSanity, p.sanity + san));
    }
    if (def.food.buff === 'warm') p.buffs.warm = w.time + 240;
    if (def.food.buff === 'cool') p.buffs.cool = w.time + 240;
    if (def.food.buff === 'speed') p.buffs.speed = w.time + 120;
    if (def.food.buff === 'glow') p.buffs.glow = w.time + 120;
    take();
    w.fx(p.x, p.z, 'eat');
    setAnim(w, p, 4, 0.6);
    questEvent(w, p, 'eat', A.id, 1);
    if (p.hp <= 0) w.killPlayer(p, 'zatrucie');
    return;
  }
  w.toast(p, def.desc || 'Nie można tego użyć.');
}

// ========== Crafting ==========
export function recipeStatus(w: World, p: Player, r: Recipe): 'ok' | 'station' | 'blueprint' | 'hidden' {
  if (r.char && r.char !== p.char) return 'hidden';
  if (BLUEPRINT_ONLY.has(r.id) && !p.known.has(r.id)) return 'blueprint';
  if (p.known.has(r.id)) return 'ok';
  const sts = recipeStations(r);
  if (CHAR[p.char].id === 'ilma' && r.out.endsWith('_potion')) return 'ok';
  for (const st of sts) {
    if (st === 'ancient') {
      const core = w.gen.pois.find((x) => x.type === 'ancient_core');
      if (!w.flags.coreRepaired || !core || (core.x - p.x) ** 2 + (core.z - p.z) ** 2 > 144) return 'station';
      continue;
    }
    const found = w.structsNear(p.x, p.z, 6.5, (s) => STRUCTS[s.type].station === st && (STRUCTS[s.type].level || 1) >= (r.lvl || 1));
    if (!found.length) return 'station';
  }
  return 'ok';
}

export function recipeCost(p: Player, r: Recipe): [string, number][] {
  const cd = CHAR[p.char];
  const disc = cd.craftDiscount && cd.craftDiscount.cats.includes(r.cat) ? cd.craftDiscount.mul : 1;
  return r.ing.map(([id, n]) => [id, Math.max(1, Math.ceil(n * disc))]);
}

function onCraft(w: World, p: Player, msg: any) {
  if (p.ghost) return;
  const r = RECIPES[String(msg.r)];
  if (!r) return;
  if (p.wolf) { w.toast(p, 'Wilk nie potrafi craftować.', 'warn'); return; }
  const stock: Record<string, number> = ((p as any).stock = (p as any).stock || {});
  const fromStock = !!r.place && (stock[r.out] || 0) > 0;
  const st = fromStock ? 'ok' : recipeStatus(w, p, r);
  if (st === 'hidden') return;
  if (st === 'blueprint') { w.toast(p, 'Potrzebujesz planu konstrukcyjnego (blueprint).', 'warn'); return; }
  if (st === 'station') { w.toast(p, 'Musisz stać przy odpowiednim stole rzemieślniczym.', 'warn'); return; }
  const cost = fromStock ? [] : recipeCost(p, r);
  for (const [id, n] of cost) if (countItem(p.inv, id) < n) { w.toast(p, `Brakuje: ${ITEMS[id]?.name || id}.`, 'warn'); return; }
  let built: Struct | null = null;
  if (r.place) {
    const x = +msg.x, z = +msg.z, rot = +msg.rot || 0;
    if (!isFinite(x) || !isFinite(z)) return;
    const err = placementError(w, p, r.out, x, z);
    if (err) { w.toast(p, err, 'warn'); return; }
    for (const [id, n] of cost) removeItem(p.inv, id, n);
    const def = STRUCTS[r.out];
    if (def.upgradeOf) {
      const old = w.structsNear(x, z, 8, (s) => s.type === def.upgradeOf)[0];
      if (old) { w.removeStruct(old); built = w.addStruct(r.out, old.x, old.z, old.rot, p.key); }
    }
    if (!built) {
      built = w.addStruct(r.out, x, z, rot, p.key);
      // receptury dające kilka segmentów (ściany): reszta trafia do "zapasu" i kolejne stawia się za darmo
      if (fromStock) stock[r.out]--;
      else if ((r.n || 1) > 1) stock[r.out] = (stock[r.out] || 0) + (r.n || 1) - 1;
    }
    w.fx(x, z, 'build');
    questEvent(w, p, 'build', r.out, 1);
    if (r.out === 'campfire' || r.out === 'firepit') built.fuel = STRUCTS[r.out].fuelStart;
  } else {
    for (const [id, n] of cost) removeItem(p.inv, id, n);
    w.giveItem(p, r.out, r.n || 1, true);
    questEvent(w, p, 'craft', r.out, 1);
    w.fx(p.x, p.z, 'craft');
  }
  if (recipeStations(r).length && !p.known.has(r.id)) {
    p.known.add(r.id);
    p.dirty.known = true;
    w.send(p, { t: 'learned', r: r.id });
  }
  p.stats.crafted++;
  p.dirty.inv = true;
  setAnim(w, p, 5, 0.4);
  // osiągnięcie: wszystkie stoły
  const stations = ['workbench', 'forge', 'kitchen', 'loom', 'alchemy', 'maptable', 'mechbench', 'shadow_altar'];
  if (!p.ach.includes('allstations') && stations.every((s) => [...w.structs.values()].some((x) => x.type === s))) {
    p.ach.push('allstations');
    w.toast(p, '🏆 Osiągnięcie: Mistrz rzemiosła (wszystkie stoły)!', 'good');
  }
}

/** Zwraca opis błędu lub null, jeśli można postawić. */
export function placementError(w: World, p: Player, type: string, x: number, z: number): string | null {
  const def = STRUCTS[type];
  if (!def) return 'Nieznana budowla.';
  if ((x - p.x) ** 2 + (z - p.z) ** 2 > 12 * 12) return 'Za daleko.';
  if (w.gen.height(x, z) < 0.25) return 'Nie można budować na wodzie.';
  if (type === 'waterwheel' && !nearWater(w, x, z, 4)) return 'Koło wodne musi stać przy wodzie.';
  if (type === 'escape_portal') {
    const core = w.gen.pois.find((q) => q.type === 'ancient_core');
    if (!core || (core.x - x) ** 2 + (core.z - z) ** 2 > 30 * 30) return 'Portal musi stać przy Starożytnym Rdzeniu.';
  }
  if (def.upgradeOf) {
    if (!w.structsNear(x, z, 8, (s) => s.type === def.upgradeOf).length) return `Postaw obok istniejącej budowli: ${STRUCTS[def.upgradeOf].name}.`;
    return null;
  }
  const isFloor = !!def.floor;
  for (const s of w.structsNear(x, z, 4)) {
    const sd = STRUCTS[s.type];
    if (!!sd.floor !== isFloor) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    const isWall = type.startsWith('wall_') || type === 'gate';
    const otherWall = s.type.startsWith('wall_') || s.type === 'gate';
    const lim = isWall && otherWall ? 0.85 : (def.radius + sd.radius) * 0.85;
    if (d < lim) return 'Za blisko innej budowli.';
  }
  if (!isFloor) {
    for (const o of w.gen.objectsNear(x, z, 4)) {
      const od = OBJ[o.type];
      const st = w.objState.get(o.id);
      if (!od?.block || (st && st.s !== 'stump' && st.s !== 'ok' && st.s !== 'opened')) continue;
      const br = st?.s === 'stump' ? 0.3 : od.block;
      if (Math.hypot(o.x - x, o.z - z) < br + def.radius * 0.7) return 'Coś tu przeszkadza.';
    }
    for (const poi of w.gen.pois) if (['portal', 'ancient_core'].includes(poi.type) && Math.hypot(poi.x - x, poi.z - z) < 4) return 'Za blisko portalu.';
  }
  return null;
}

// ========== Kontenery ==========
function onCont(w: World, p: Player, msg: any) {
  if (msg.op === 'close') { p.contOpen = 0; return; }
  const s = p.contOpen ? w.structs.get(p.contOpen) : undefined;
  if (!s) return;
  if (msg.op === 'cook' && s.type === 'kitchen') {
    if (s.prog) return;
    if (!s.inv!.every((x) => x && ITEMS[x.id]?.food)) { w.toast(p, 'Włóż 4 składniki jedzenia.', 'warn'); return; }
    s.prog = 0.001;
    s.on = true;
    s.cookBy = p.key;
    w.updateStruct(s);
    w.refreshContainer(s);
    return;
  }
  if (msg.op === 'toggle' && STRUCTS[s.type].power) { s.on = s.on === false; w.updateStruct(s); w.refreshContainer(s); }
}

// ========== Questy ==========
function onQuest(w: World, p: Player, msg: any) {
  const qid = String(msg.q);
  const q = QUESTS[qid];
  if (!q) return;
  if (msg.op === 'accept') {
    if (p.quests[qid] || !q.giver) return;
    if (!(q.req || []).every((r) => p.quests[r]?.done)) return;
    w.questStart(p, qid);
    w.toast(p, `Nowe zadanie: ${q.title}`, 'good');
    return;
  }
  if (msg.op === 'turnin') {
    const qp = p.quests[qid];
    if (!qp || qp.done) return;
    for (const [i, g] of q.goals.entries()) {
      if (g.k === 'deliver') { if (countItem(p.inv, g.t) < g.n) { w.toast(p, `Brakuje: ${ITEMS[g.t]?.name}.`, 'warn'); return; } }
      else if (qp.g[i] < g.n) { w.toast(p, 'Zadanie jeszcze nie jest ukończone.', 'warn'); return; }
    }
    for (const g of q.goals) if (g.k === 'deliver') removeItem(p.inv, g.t, g.n);
    p.dirty.inv = true;
    completeQuest(w, p, qid);
    return;
  }
  if (msg.op === 'contribute') {
    const qp = w.wq[qid];
    if (!qp || qp.done) return;
    const gi = q.goals.findIndex((g) => g.k === 'contribute' && g.t === msg.item);
    if (gi < 0) return;
    const need = q.goals[gi].n - qp.g[gi];
    const have = countItem(p.inv, msg.item);
    const k = Math.min(need, have);
    if (k <= 0) { w.toast(p, 'Nie masz tego materiału.', 'warn'); return; }
    removeItem(p.inv, msg.item, k);
    qp.g[gi] += k;
    p.dirty.inv = true;
    for (const pl of w.players.values()) pl.dirty.quests = true;
    w.broadcast({ t: 'sys', text: `🏗 ${p.name} oddaje ${k}× ${ITEMS[msg.item]?.name} na wieżę sygnałową.` });
    if (q.goals.every((g, i) => qp.g[i] >= g.n)) {
      qp.done = true;
      for (const pl of w.players.values()) { for (const [it, n] of q.rewards.items || []) w.giveItem(pl, it, n, true); w.send(pl, { t: 'qdone', title: q.title, msg: q.rewards.msg, world: 1 }); }
      if (q.rewards.flag) w.flags[q.rewards.flag] = true;
      w.mapAll.fill(255);
      w.sendMaps();
    }
  }
}

function onTeleport(w: World, p: Player, msg: any) {
  if (p.ghost || !w.flags.maptable) return;
  const circles: number[] = w.flags.circles || [];
  const from = w.gen.pois.find((x) => x.id === msg.from);
  const to = w.gen.pois.find((x) => x.id === msg.to);
  if (!from || !to || !circles.includes(from.id) || !circles.includes(to.id)) return;
  if ((from.x - p.x) ** 2 + (from.z - p.z) ** 2 > 64) return;
  if (p.hunger < 10) { w.toast(p, 'Jesteś zbyt głodny na podróż.', 'warn'); return; }
  p.hunger -= 10;
  p.sanity = Math.max(0, p.sanity - 15);
  w.fx(p.x, p.z, 'poof');
  p.x = to.x + 2; p.z = to.z + 2;
  w.send(p, { t: 'pos', x: p.x, z: p.z });
  w.updateChunks(p, true);
  w.fx(p.x, p.z, 'poof');
}

// ========== Czat i komendy ==========
function onChat(w: World, p: Player, msg: any) {
  let text = String(msg.text || '').slice(0, 200).trim();
  if (!text) return;
  if (p.chatCd > Date.now()) return;
  p.chatCd = Date.now() + 400;
  if (text.startsWith('/')) return command(w, p, text);
  text = censor(text.replace(/[<>]/g, ''));
  w.broadcast({ t: 'chat', n: p.name, id: p.id, text });
}

function command(w: World, p: Player, text: string) {
  const [cmd, ...args] = text.slice(1).split(/\s+/);
  const say = (s: string) => w.send(p, { t: 'sys', text: s });
  const admin = () => { if (!p.admin) { say('Tylko administrator świata.'); return false; } return true; };
  switch (cmd) {
    case 'help':
      say('Komendy: /where, /seed, /kill, /admin <hasło>. Admin: /give <id> [n], /spawn <mob>, /time day|dusk|night|+<dni>, /season autumn|winter|spring|summer, /god, /heal, /tp <x> <z>, /kick <nick>, /reveal, /save');
      return;
    case 'where': say(`Pozycja: ${p.x.toFixed(0)}, ${p.z.toFixed(0)} – biom: ${w.gen.biome(p.x, p.z)}`); return;
    case 'seed': say(`Seed świata: ${w.settings.seed}`); return;
    case 'kill': if (!p.ghost) w.killPlayer(p, 'własna decyzja'); return;
    case 'admin': {
      const pass = process.env.ADMIN_PASSWORD;
      if (pass && args[0] === pass) { p.admin = true; say('Masz uprawnienia administratora.'); } else say('Złe hasło.');
      return;
    }
    case 'give': if (!admin()) return; {
      const id = args[0];
      if (!ITEMS[id] && !id?.startsWith('blueprint:')) { say('Nieznany przedmiot.'); return; }
      w.giveItem(p, id, Math.max(1, Math.min(999, +(args[1] || 1))));
      return;
    }
    case 'spawn': if (!admin()) return; {
      const m = spawnMob(w, args[0], p.x + 5, p.z + 5);
      say(m ? `Przywołano: ${MOBS[args[0]].name}` : 'Nieznany mob.');
      return;
    }
    case 'time': if (!admin()) return; {
      const dl = w.settings.dayLength;
      const base = Math.floor(w.time / dl) * dl;
      const c = w.clk;
      const ph = ({ autumn: [0.5, 0.7], winter: [0.38, 0.56], spring: [0.5, 0.7], summer: [0.62, 0.76] } as any)[c.season];
      if (args[0] === 'day') w.time = base + dl * 0.1;
      else if (args[0] === 'dusk') w.time = base + dl * ph[0] + 1;
      else if (args[0] === 'night') w.time = base + dl * ph[1] + 1;
      else if (args[0]?.startsWith('+')) w.time += dl * +args[0].slice(1);
      say('Czas zmieniony.');
      return;
    }
    case 'season': if (!admin()) return; {
      const idx = SEASONS.indexOf(args[0] as any);
      if (idx < 0) { say('Pory: autumn, winter, spring, summer'); return; }
      const dl = w.settings.dayLength, sl = w.settings.seasonLength;
      const year = Math.floor((w.clk.day - 1) / (sl * 4));
      w.time = (year * 4 + idx) * sl * dl + dl * 0.1;
      say(`Pora roku: ${args[0]}`);
      return;
    }
    case 'god': if (!admin()) return; p.buffs.god = p.buffs.god && p.buffs.god > w.time ? 0 : w.time + 1e7; say(`Nieśmiertelność: ${p.buffs.god ? 'wł.' : 'wył.'}`); return;
    case 'heal': if (!admin()) return; p.hp = p.maxHp; p.hunger = p.maxHunger; p.sanity = p.maxSanity; p.temp = 30; if (p.ghost) w.revivePlayer(p, 'admin'); return;
    case 'tp': if (!admin()) return; p.x = +args[0]; p.z = +args[1]; w.send(p, { t: 'pos', x: p.x, z: p.z }); w.updateChunks(p, true); return;
    case 'reveal': if (!admin()) return; w.send(p, { t: 'map', all: 1 }); return;
    case 'save': if (!admin()) return; w.saveFn?.(w).then(() => say('Zapisano.')); return;
    case 'kick': if (!admin()) return; {
      const q = [...w.players.values()].find((x) => x.name === args[0]);
      if (q) { w.send(q, { t: 'kicked' }); q.ws?.close(); }
      return;
    }
    default: say('Nieznana komenda. Wpisz /help');
  }
}
