// Stworzenia, potwory i bossowie.

export type AI = 'passive' | 'neutral' | 'hostile' | 'nightHostile' | 'herd' | 'static' | 'thief' | 'shadow' | 'hound' | 'boss' | 'npc' | 'pig' | 'golem';
export type Model = 'rabbit' | 'quad' | 'spider' | 'biped' | 'bird' | 'tentacle' | 'scorpion' | 'crab' | 'shadow' | 'mole' | 'deer' | 'golem' | 'bat' | 'guardian' | 'titan';

export interface BossAbility {
  k: 'slam' | 'summon' | 'freeze' | 'lightning' | 'charge' | 'burrow' | 'web' | 'sandstorm';
  cd: number;
  r?: number;
  dmg?: number;
  tele?: number;
  mob?: string;
  n?: number;
}

export interface MobDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  runSpeed?: number;
  dmg: number;
  atkRange: number;
  atkCd: number;
  sight: number;
  ai: AI;
  model: Model;
  scale: number;
  color: number;
  color2?: number;
  drops: [string, number, number][]; // [item, ilość, szansa]
  sanityAura?: number; // na minutę w promieniu 8 m
  radius: number;
  boss?: boolean;
  abilities?: BossAbility[];
  destroys?: boolean; // niszczy budowle
  fly?: boolean;
  flee?: number;
  nightOnly?: boolean;
  dayOnly?: boolean;
  desc?: string;
}

const M: MobDef[] = [
  { id: 'rabbit', name: 'Skoczek', hp: 25, speed: 2, runSpeed: 6, dmg: 0, atkRange: 0, atkCd: 1, sight: 8, ai: 'passive', model: 'rabbit', scale: 0.5, color: 0xc8b49a, color2: 0xfff4e0, drops: [['small_meat', 1, 1], ['horn', 1, 0.3]], radius: 0.3, flee: 7, dayOnly: true, desc: 'Płochliwy królik z małym rogiem.' },
  { id: 'beefalo', name: 'Rogul', hp: 500, speed: 1.5, runSpeed: 5, dmg: 34, atkRange: 2.5, atkCd: 3, sight: 6, ai: 'herd', model: 'quad', scale: 1.6, color: 0x6b4a2e, color2: 0x3b2a1a, drops: [['meat', 4, 1], ['fur', 3, 1], ['horn', 1, 0.33]], radius: 1.1, desc: 'Włochaty, spokojny – chyba że go zaatakujesz.' },
  { id: 'spider', name: 'Pająk-tkacz', hp: 100, speed: 3, runSpeed: 5, dmg: 20, atkRange: 1.8, atkCd: 2, sight: 10, ai: 'nightHostile', model: 'spider', scale: 0.8, color: 0x2a2030, color2: 0xd04040, drops: [['monster_meat', 1, 0.5], ['silk', 1, 0.5], ['gland', 1, 0.3]], radius: 0.6, sanityAura: -3 },
  { id: 'spider_warrior', name: 'Pająk-wojownik', hp: 200, speed: 4, runSpeed: 6, dmg: 25, atkRange: 2.4, atkCd: 1.6, sight: 14, ai: 'hostile', model: 'spider', scale: 1.0, color: 0x4a3a10, color2: 0xf0c020, drops: [['monster_meat', 1, 0.5], ['silk', 1, 0.5], ['gland', 1, 0.5]], radius: 0.7, sanityAura: -5 },
  { id: 'pigman', name: 'Chrumek', hp: 250, speed: 3, runSpeed: 5, dmg: 33, atkRange: 2, atkCd: 2, sight: 8, ai: 'pig', model: 'biped', scale: 1.05, color: 0xf0a8a0, color2: 0x8a5a3a, drops: [['meat', 1, 0.75], ['leather', 1, 1]], radius: 0.6, desc: 'Mieszkaniec wioski. Daj mu mięso, a pójdzie z tobą.' },
  { id: 'elder', name: 'Wódz Chrumcio', hp: 9999, speed: 0, dmg: 0, atkRange: 0, atkCd: 1, sight: 0, ai: 'npc', model: 'biped', scale: 1.25, color: 0xe89890, color2: 0x7030a0, drops: [], radius: 0.7, desc: 'Przywódca wioski Chrumków. Ma zadania.' },
  { id: 'merm', name: 'Ryboczłek', hp: 250, speed: 3, runSpeed: 4.5, dmg: 30, atkRange: 2, atkCd: 3, sight: 10, ai: 'hostile', model: 'biped', scale: 1.0, color: 0x5a8a6a, color2: 0x2a4a3a, drops: [['fish', 1, 1], ['scales', 1, 0.6]], radius: 0.6 },
  { id: 'tentacle', name: 'Macka bagienna', hp: 500, speed: 0, dmg: 34, atkRange: 3.5, atkCd: 2, sight: 4, ai: 'static', model: 'tentacle', scale: 1.4, color: 0x6a3a6a, color2: 0x2a102a, drops: [['monster_meat', 1, 0.5], ['tentacle_spike', 1, 0.5], ['scales', 1, 0.3]], radius: 0.5 },
  { id: 'treeguard', name: 'Drzewiec-strażnik', hp: 2000, speed: 1.6, dmg: 60, atkRange: 3, atkCd: 3, sight: 18, ai: 'hostile', model: 'golem', scale: 2.4, color: 0x5a4028, color2: 0x2e6a2e, drops: [['living_log', 6, 1], ['monster_meat', 2, 1]], radius: 1.2, desc: 'Budzi się, gdy ktoś wycina za dużo drzew.' },
  { id: 'gobbler', name: 'Gargulec złotodzioby', hp: 80, speed: 2, runSpeed: 6, dmg: 0, atkRange: 0, atkCd: 1, sight: 12, ai: 'thief', model: 'bird', scale: 0.8, color: 0x707880, color2: 0xe0b020, drops: [['feather', 2, 1], ['gold', 1, 0.5], ['small_meat', 1, 1]], radius: 0.4, flee: 6 },
  { id: 'scorpion', name: 'Skorpion piaskowy', hp: 150, speed: 3.5, dmg: 25, atkRange: 1.8, atkCd: 2, sight: 10, ai: 'hostile', model: 'scorpion', scale: 0.9, color: 0xc09040, color2: 0x603010, drops: [['venom', 1, 0.7], ['monster_meat', 1, 0.5]], radius: 0.6 },
  { id: 'mole', name: 'Kretojad', hp: 120, speed: 2.5, dmg: 10, atkRange: 1.5, atkCd: 2, sight: 6, ai: 'thief', model: 'mole', scale: 0.7, color: 0x5a4a40, color2: 0xe0a0a0, drops: [['claw', 1, 1], ['iron_ore', 1, 0.5], ['small_meat', 1, 1]], radius: 0.4, flee: 5 },
  { id: 'bat', name: 'Nietoperz jaskiniowy', hp: 50, speed: 5, dmg: 15, atkRange: 1.6, atkCd: 1.5, sight: 14, ai: 'hostile', model: 'bat', scale: 0.7, color: 0x302030, color2: 0x804060, drops: [['bat_wing', 1, 0.6], ['monster_meat', 1, 0.3]], radius: 0.4, fly: true, nightOnly: true },
  { id: 'crab', name: 'Krab łupieżca', hp: 150, speed: 2.5, runSpeed: 4, dmg: 15, atkRange: 1.6, atkCd: 2, sight: 6, ai: 'neutral', model: 'crab', scale: 0.8, color: 0xd04a30, color2: 0xf0e0c0, drops: [['shell', 1, 0.6], ['fish', 1, 1]], radius: 0.6 },
  { id: 'chicken', name: 'Pierzastka', hp: 40, speed: 1.5, runSpeed: 5, dmg: 0, atkRange: 0, atkCd: 1, sight: 6, ai: 'passive', model: 'bird', scale: 0.55, color: 0xf0f0e0, color2: 0xe04040, drops: [['small_meat', 1, 1], ['feather', 2, 1], ['egg', 1, 0.5]], radius: 0.3, flee: 5 },
  { id: 'hound', name: 'Ogar mroku', hp: 150, speed: 7, dmg: 20, atkRange: 1.8, atkCd: 2, sight: 40, ai: 'hound', model: 'quad', scale: 0.9, color: 0x3a3028, color2: 0xc03020, drops: [['monster_meat', 1, 1], ['tooth', 1, 0.4], ['essence', 1, 0.2]], radius: 0.6, sanityAura: -6 },
  { id: 'shade', name: 'Szepczący cień', hp: 150, speed: 4, dmg: 20, atkRange: 2, atkCd: 2, sight: 30, ai: 'shadow', model: 'shadow', scale: 1.4, color: 0x101018, color2: 0xffffff, drops: [['essence', 1, 1]], radius: 0.6, sanityAura: -10 },
  { id: 'guardian', name: 'Mechaniczny strażnik', hp: 450, speed: 3, dmg: 40, atkRange: 2.4, atkCd: 2, sight: 14, ai: 'hostile', model: 'golem', scale: 1.4, color: 0x8a7a50, color2: 0x40d0e0, drops: [['ruin_metal', 2, 1], ['gear', 1, 0.6], ['essence', 1, 0.3]], radius: 0.8, destroys: true },
  { id: 'golem', name: 'Golem roboczy', hp: 600, speed: 3, dmg: 30, atkRange: 2, atkCd: 2, sight: 12, ai: 'golem', model: 'golem', scale: 1.1, color: 0x6a6070, color2: 0x90f0a0, drops: [], radius: 0.7 },

  // ===== Bossowie =====
  { id: 'queen', name: 'Królowa Pająków', hp: 2500, speed: 2.2, dmg: 60, atkRange: 3.5, atkCd: 2.5, sight: 20, ai: 'boss', model: 'spider', scale: 2.8, color: 0x3a1040, color2: 0xf0e040, boss: true, radius: 2, sanityAura: -20,
    abilities: [{ k: 'summon', cd: 14, mob: 'spider_warrior', n: 3 }, { k: 'web', cd: 10, r: 6, tele: 1 }],
    drops: [['queen_silk', 3, 1], ['monster_meat', 4, 1], ['blueprint:wing_pack', 1, 1], ['silk', 8, 1]] },
  { id: 'frostdeer', name: 'Mroźnorożec', hp: 4000, speed: 2.5, dmg: 75, atkRange: 4, atkCd: 3, sight: 25, ai: 'boss', model: 'deer', scale: 3.5, color: 0xd0e8f8, color2: 0x60a0e0, boss: true, radius: 2.2, destroys: true, sanityAura: -20,
    abilities: [{ k: 'freeze', cd: 12, r: 9, tele: 1.4 }, { k: 'slam', cd: 8, r: 5, dmg: 80, tele: 1.2 }],
    drops: [['frost_antler', 2, 1], ['core_fragment', 1, 1], ['meat', 8, 1], ['blueprint:ice_staff', 1, 1]] },
  { id: 'stormgoose', name: 'Burzogawędź', hp: 3500, speed: 3, dmg: 60, atkRange: 3, atkCd: 2.5, sight: 25, ai: 'boss', model: 'bird', scale: 3.4, color: 0xe8d070, color2: 0x404080, boss: true, radius: 2, sanityAura: -15,
    abilities: [{ k: 'lightning', cd: 7, n: 4, dmg: 45, tele: 1.3 }, { k: 'charge', cd: 10, dmg: 50 }],
    drops: [['storm_feather', 2, 1], ['core_fragment', 1, 1], ['feather', 10, 1], ['blueprint:storm_staff', 1, 1]] },
  { id: 'sandtitan', name: 'Piaskowy Tytan', hp: 5000, speed: 2, dmg: 80, atkRange: 4.5, atkCd: 3, sight: 25, ai: 'boss', model: 'titan', scale: 3.2, color: 0xd8b070, color2: 0x804020, boss: true, radius: 2.5, destroys: true, sanityAura: -15,
    abilities: [{ k: 'burrow', cd: 14, r: 6, dmg: 90, tele: 1.5 }, { k: 'sandstorm', cd: 25 }, { k: 'slam', cd: 9, r: 6, dmg: 70, tele: 1.2 }],
    drops: [['sand_heart', 2, 1], ['core_fragment', 1, 1], ['blueprint:fire_staff', 1, 1], ['gold', 10, 1]] },
  { id: 'mothermole', name: 'Kamienny Matkokret', hp: 3000, speed: 2.4, dmg: 55, atkRange: 3.5, atkCd: 2.5, sight: 20, ai: 'boss', model: 'mole', scale: 3.0, color: 0x6a5a50, color2: 0xe09090, boss: true, radius: 2,
    abilities: [{ k: 'summon', cd: 15, mob: 'mole', n: 4 }, { k: 'burrow', cd: 12, r: 5, dmg: 70, tele: 1.4 }],
    drops: [['mother_claw', 2, 1], ['iron_ore', 10, 1], ['gold', 6, 1], ['blueprint:multitool', 1, 1]] },
  { id: 'core_guardian', name: 'Strażnik Rdzenia', hp: 12000, speed: 2.8, dmg: 90, atkRange: 4, atkCd: 2.5, sight: 40, ai: 'boss', model: 'guardian', scale: 3.8, color: 0x302838, color2: 0x40f0ff, boss: true, radius: 2.5, destroys: true, sanityAura: -30,
    abilities: [{ k: 'slam', cd: 7, r: 6, dmg: 90, tele: 1.2 }, { k: 'summon', cd: 16, mob: 'guardian', n: 2 }, { k: 'lightning', cd: 9, n: 5, dmg: 50, tele: 1.3 }, { k: 'charge', cd: 11, dmg: 70 }],
    drops: [['ruin_metal', 20, 1], ['essence', 10, 1]] },
];

export const MOBS: Record<string, MobDef> = {};
for (const m of M) MOBS[m.id] = m;

export const BOSS_IDS = M.filter((m) => m.boss).map((m) => m.id);
