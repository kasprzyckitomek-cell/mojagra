// Testy jednostkowe: generator świata, crafting, questy, ekwipunek.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldGen } from '../shared/world';
import { RECIPES, cookPot } from '../shared/data/recipes';
import { ITEMS } from '../shared/data/items';
import { STRUCTS } from '../shared/data/structures';
import { MOBS } from '../shared/data/mobs';
import { QUESTS } from '../shared/data/quests';
import { OBJ } from '../shared/data/objects';
import { addToSlots, removeItem, countItem, makeSlot } from '../server/inventory';
import { clock } from '../shared/env';

test('generator świata jest deterministyczny i ma wszystkie biomy', () => {
  const a = new WorldGen(42, 1536), b = new WorldGen(42, 1536);
  assert.deepEqual(a.spawn, b.spawn);
  assert.deepEqual(a.chunkObjects(20, 20), b.chunkObjects(20, 20));
  const biomes = new Set(a.cells.map((c) => c.b));
  for (const x of ['grass', 'forest', 'swamp', 'rocky', 'savanna', 'desert', 'mushroom', 'ruins', 'birchwood', 'heath', 'autumnwood', 'tundra']) assert.ok(biomes.has(x as any), x);
  assert.ok(a.height(a.spawn.x, a.spawn.z) > 0, 'spawn na lądzie');
  for (const t of ['portal', 'village_fire', 'ancient_core', 'queen_nest', 'storm_nest', 'titan_lair', 'mole_mound']) assert.ok(a.pois.some((p) => p.type === t), t);
  assert.equal(a.pois.filter((p) => p.type === 'stone_circle').length, 4);
});

test('wszystkie receptury odnoszą się do istniejących przedmiotów/budowli', () => {
  for (const r of Object.values(RECIPES)) {
    assert.ok(ITEMS[r.out] || STRUCTS[r.out], `wynik ${r.id}: ${r.out}`);
    if (r.place) assert.ok(STRUCTS[r.out], `budowla ${r.id}`);
    for (const [i] of r.ing) assert.ok(ITEMS[i], `składnik ${r.id}: ${i}`);
  }
});

test('dropy potworów i obiektów istnieją', () => {
  for (const m of Object.values(MOBS)) for (const [i] of m.drops) assert.ok(ITEMS[i] || i.startsWith('blueprint:'), `${m.id}: ${i}`);
  for (const [k, o] of Object.entries(OBJ)) for (const [i] of o.drops || []) assert.ok(ITEMS[i] || i.startsWith('blueprint:'), `${k}: ${i}`);
  for (const o of Object.values(OBJ)) if (o.spawn) assert.ok(MOBS[o.spawn.mob]);
});

test('questy mają poprawne nagrody i wymagania', () => {
  for (const q of Object.values(QUESTS)) {
    for (const r of q.req || []) assert.ok(QUESTS[r], `${q.id} req ${r}`);
    for (const [i] of q.rewards.items || []) assert.ok(ITEMS[i] || (i.startsWith('blueprint:') && RECIPES[i.slice(10)]), `${q.id} nagroda ${i}`);
  }
});

test('kuchnia: przepisy z kategorii', () => {
  assert.equal(cookPot({ meat: 2, veg: 2 }), 'bigos');
  assert.equal(cookPot({ meat: 3, fruit: 1 }), 'stew');
  assert.equal(cookPot({ veg: 1, egg: 1, meat: 1, fruit: 1 }), 'pierogi');
  assert.equal(cookPot({ fruit: 4 }), 'jam');
  assert.equal(cookPot({ none: 4 }), 'goop');
});

test('ekwipunek: stackowanie i usuwanie', () => {
  const inv: any[] = new Array(3).fill(null);
  assert.equal(addToSlots(inv, makeSlot('log', 25)), 0);
  assert.equal(countItem(inv, 'log'), 25);
  assert.equal(inv.filter(Boolean).length, 2);
  assert.ok(removeItem(inv, 'log', 21));
  assert.equal(countItem(inv, 'log'), 4);
  assert.equal(addToSlots(inv, makeSlot('axe')), 0);
  assert.equal(addToSlots(inv, makeSlot('axe')), 0);
  assert.equal(addToSlots(inv, makeSlot('axe')), 1, 'brak miejsca');
});

test('zegar: pory dnia i roku', () => {
  const c = clock(0, 480, 12);
  assert.equal(c.day, 1); assert.equal(c.season, 'autumn');
  assert.equal(clock(480 * 12 + 10, 480, 12).season, 'winter');
  assert.equal(clock(480 * 0.9, 480, 12).phase, 'night');
});
