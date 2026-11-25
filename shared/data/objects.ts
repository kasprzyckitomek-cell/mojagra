// Obiekty świata generowane proceduralnie (drzewa, krzaki, głazy, gniazda, punkty zainteresowania).

export interface ObjDef {
  name: string;
  verb?: string; // nazwa akcji
  tool?: 'chop' | 'mine' | 'dig' | 'hammer';
  work?: number; // ile uderzeń
  drops?: [string, number, number][]; // [item, n, szansa]
  after?: 'remove' | 'stump' | 'picked';
  regrow?: number; // dni do odrośnięcia
  block?: number; // promień kolizji
  light?: number;
  spawn?: { mob: string; max: number; night?: boolean; day?: boolean; every: number };
  winterNo?: boolean; // nie owocuje zimą
  hurt?: number; // rani przy zbieraniu
  special?: string; // akcja specjalna
  hidden?: boolean; // niewidoczny znacznik
  sanity?: number;
}

export const OBJ: Record<string, ObjDef> = {
  tree_pine: { name: 'Sosna', verb: 'Zetnij', tool: 'chop', work: 6, drops: [['log', 2, 1], ['log', 1, 0.5], ['pinecone', 1, 0.6]], after: 'stump', regrow: 8, block: 0.5 },
  tree_birch: { name: 'Brzoza', verb: 'Zetnij', tool: 'chop', work: 5, drops: [['log', 2, 1], ['pinecone', 1, 0.4], ['petals', 1, 0.2]], after: 'stump', regrow: 8, block: 0.45 },
  tree_dead: { name: 'Uschnięte drzewo', verb: 'Zetnij', tool: 'chop', work: 3, drops: [['log', 1, 1], ['twig', 1, 1]], after: 'remove', regrow: 15, block: 0.4 },
  mushtree: { name: 'Grzybodrzew', verb: 'Zetnij', tool: 'chop', work: 6, drops: [['log', 2, 1], ['mushroom', 1, 1], ['glowberry', 1, 0.2]], after: 'stump', regrow: 10, block: 0.6, light: 4 },
  palm: { name: 'Palma', verb: 'Zetnij', tool: 'chop', work: 5, drops: [['log', 2, 1], ['twig', 1, 1]], after: 'stump', regrow: 10, block: 0.4 },
  stump: { name: 'Pniak', verb: 'Wykop', tool: 'dig', work: 1, drops: [['log', 1, 1]], after: 'remove' },
  sapling: { name: 'Krzaczek', verb: 'Zbierz', work: 1, drops: [['twig', 2, 1]], after: 'picked', regrow: 4 },
  grass: { name: 'Kępa trawy', verb: 'Zetnij', work: 1, drops: [['grass', 1, 1], ['grass', 1, 0.3]], after: 'picked', regrow: 3 },
  berry_bush: { name: 'Krzak jagód', verb: 'Zbierz', work: 1, drops: [['berries', 3, 1]], after: 'picked', regrow: 4, winterNo: true },
  reeds: { name: 'Trzcina', verb: 'Zbierz', work: 1, drops: [['reeds', 1, 1]], after: 'picked', regrow: 5 },
  flowers: { name: 'Kwiaty', verb: 'Zerwij', work: 1, drops: [['petals', 1, 1]], after: 'picked', regrow: 3, sanity: 5 },
  flint: { name: 'Krzemień', verb: 'Podnieś', work: 1, drops: [['flint', 1, 1]], after: 'picked', regrow: 8 },
  rocks: { name: 'Kamyki', verb: 'Podnieś', work: 1, drops: [['stone', 1, 1]], after: 'picked', regrow: 8 },
  carrot: { name: 'Dzika marchew', verb: 'Wyrwij', work: 1, drops: [['carrot', 1, 1]], after: 'picked', regrow: 6, winterNo: true },
  mushroom: { name: 'Grzyb', verb: 'Zbierz', work: 1, drops: [['mushroom', 1, 1]], after: 'picked', regrow: 5 },
  glowcap: { name: 'Świetlik grzybowy', verb: 'Zbierz', work: 1, drops: [['glowberry', 1, 1]], after: 'picked', regrow: 6, light: 3.5 },
  driftwood: { name: 'Wyrzucone drewno', verb: 'Podnieś', work: 1, drops: [['log', 1, 1], ['twig', 1, 0.5]], after: 'picked', regrow: 4 },
  sand: { name: 'Piasek', verb: 'Nabierz', work: 1, drops: [['sand', 2, 1]], after: 'picked', regrow: 3 },
  clay: { name: 'Złoże gliny', verb: 'Wykop', work: 1, drops: [['clay', 2, 1]], after: 'picked', regrow: 6 },
  cactus: { name: 'Kaktus', verb: 'Zerwij', work: 1, drops: [['cactus_flesh', 1, 1]], after: 'picked', regrow: 4, hurt: 6, block: 0.4 },
  tumbleweed: { name: 'Biegacz stepowy', verb: 'Przeszukaj', work: 1, drops: [['twig', 1, 0.5], ['grass', 1, 0.5], ['seeds', 2, 0.3], ['bone', 1, 0.2], ['gold', 1, 0.15], ['flint', 1, 0.3], ['blueprint:*', 1, 0.02]], after: 'picked', regrow: 2 },
  boulder: { name: 'Głaz', verb: 'Rozbij', tool: 'mine', work: 6, drops: [['stone', 3, 1], ['flint', 1, 1], ['flint', 1, 0.5]], after: 'remove', regrow: 20, block: 0.9 },
  boulder_gold: { name: 'Głaz ze złotem', verb: 'Rozbij', tool: 'mine', work: 8, drops: [['stone', 2, 1], ['gold', 2, 1], ['gold', 1, 0.5]], after: 'remove', regrow: 25, block: 0.9 },
  boulder_iron: { name: 'Żyła żelaza', verb: 'Rozbij', tool: 'mine', work: 8, drops: [['stone', 2, 1], ['iron_ore', 2, 1], ['iron_ore', 1, 0.5]], after: 'remove', regrow: 25, block: 0.9 },
  boulder_copper: { name: 'Żyła miedzi', verb: 'Rozbij', tool: 'mine', work: 8, drops: [['stone', 2, 1], ['copper_ore', 2, 1], ['copper_ore', 1, 0.4]], after: 'remove', regrow: 25, block: 0.9 },
  boulder_coal: { name: 'Złoże węgla', verb: 'Rozbij', tool: 'mine', work: 6, drops: [['coal', 3, 1], ['stone', 1, 1]], after: 'remove', regrow: 20, block: 0.8 },
  crystal_node: { name: 'Kryształowy wyrostek', verb: 'Rozbij', tool: 'mine', work: 8, drops: [['crystal', 2, 1], ['crystal', 1, 0.3]], after: 'remove', regrow: 30, block: 0.7, light: 3 },
  ruin_pillar: { name: 'Pękła kolumna', verb: 'Rozbij', tool: 'mine', work: 10, drops: [['ruin_metal', 2, 1], ['gear', 1, 0.35], ['stone', 2, 1]], after: 'remove', regrow: 30, block: 0.8 },
  ruin_rubble: { name: 'Gruzowisko Prastarych', verb: 'Rozbij', tool: 'mine', work: 5, drops: [['ruin_metal', 1, 1], ['gear', 1, 0.5], ['essence', 1, 0.1]], after: 'remove', regrow: 20, block: 0.6 },
  bones: { name: 'Szkielet', verb: 'Przeszukaj', work: 1, drops: [['bone', 2, 1], ['gold', 1, 0.2], ['blueprint:*', 1, 0.05]], after: 'picked', regrow: 30 },

  // Gniazda / spawnery
  rabbit_hole: { name: 'Nora skoczków', spawn: { mob: 'rabbit', max: 2, day: true, every: 0.5 } },
  spider_den: { name: 'Pajęcze gniazdo', verb: 'Zniszcz', tool: 'mine', work: 10, drops: [['silk', 4, 1], ['gland', 2, 1], ['blueprint:*', 1, 0.08]], after: 'remove', regrow: 15, block: 1.3, spawn: { mob: 'spider', max: 3, every: 1 } },
  beefalo_herd: { name: 'Pastwisko roguli', hidden: true, spawn: { mob: 'beefalo', max: 4, every: 4 } },
  merm_hut: { name: 'Szałas ryboczłeków', verb: 'Rozbierz', tool: 'hammer', work: 4, drops: [['board', 2, 1], ['fish', 2, 1]], after: 'remove', regrow: 15, block: 1.2, spawn: { mob: 'merm', max: 2, every: 2 } },
  tentacle_spot: { name: 'Bulgocząca woda', hidden: true, spawn: { mob: 'tentacle', max: 1, every: 3 } },
  gobbler_nest: { name: 'Gniazdo gargulców', spawn: { mob: 'gobbler', max: 2, day: true, every: 2 } },
  scorpion_burrow: { name: 'Nora skorpiona', spawn: { mob: 'scorpion', max: 2, every: 2 } },
  bat_cave: { name: 'Jaskinia nietoperzy', block: 1.4, spawn: { mob: 'bat', max: 3, night: true, every: 1 } },
  crab_den: { name: 'Krabia skała', block: 0.8, spawn: { mob: 'crab', max: 2, every: 2 } },
  mole_hill: { name: 'Kopczyk', verb: 'Rozkop', tool: 'dig', work: 2, drops: [['iron_ore', 1, 0.5], ['flint', 1, 1]], after: 'remove', regrow: 10, spawn: { mob: 'mole', max: 1, every: 3 } },
  guardian_spawn: { name: 'Uśpiony mechanizm', block: 0.9, spawn: { mob: 'guardian', max: 1, every: 5 } },
  pig_house: { name: 'Chatka Chrumków', block: 1.5, spawn: { mob: 'pigman', max: 1, every: 2 } },
  chicken_coop: { name: 'Dzikie gniazdo pierzastek', spawn: { mob: 'chicken', max: 3, day: true, every: 1 } },

  // Punkty zainteresowania
  portal: { name: 'Kamienny Portal', verb: 'Dotknij', block: 2, light: 6, special: 'portal' },
  stone_circle: { name: 'Kamienny krąg', verb: 'Aktywuj', special: 'circle', light: 2 },
  shrine: { name: 'Kapliczka', verb: 'Pomódl się', block: 0.9, special: 'shrine', light: 3 },
  camp_chest: { name: 'Porzucona skrzynia', verb: 'Otwórz', block: 0.6, special: 'loot' },
  wreck: { name: 'Wrak łodzi', verb: 'Przeszukaj', block: 2, special: 'loot' },
  note: { name: 'Notatka', verb: 'Przeczytaj', special: 'note' },
  ancient_core: { name: 'Starożytny Rdzeń', verb: 'Zbadaj', block: 2.5, light: 8, special: 'core' },
  queen_nest: { name: 'Kokon Królowej', block: 2.5, special: 'lair:queen' },
  storm_nest: { name: 'Gniazdo burzy', block: 2, special: 'lair:stormgoose' },
  titan_lair: { name: 'Ruchome piaski', special: 'lair:sandtitan' },
  mole_mound: { name: 'Wielki kopiec', block: 3, special: 'lair:mothermole' },
  village_fire: { name: 'Wiejskie palenisko', block: 1, light: 9, special: 'villagefire' },
};

export const BIOME_NAMES: Record<string, string> = {
  ocean: 'Ocean', beach: 'Wybrzeże', grass: 'Łąki', forest: 'Las iglasty', swamp: 'Bagna', rocky: 'Kamienne pustkowia',
  savanna: 'Sawanna', desert: 'Pustynia', mushroom: 'Grzybowy las', ruins: 'Ruiny Prastarych',
};

// Tabele losowania obiektów na biom: [typ, waga]
export const BIOME_TABLES: Record<string, [string, number][]> = {
  grass: [['grass', 14], ['sapling', 8], ['berry_bush', 4], ['flowers', 10], ['flint', 4], ['carrot', 3], ['tree_birch', 6], ['rabbit_hole', 1], ['boulder', 1.2], ['rocks', 2], ['chicken_coop', 0.3], ['_', 18]],
  forest: [['tree_pine', 34], ['sapling', 5], ['grass', 3], ['flint', 2], ['spider_den', 0.6], ['mushroom', 1.5], ['boulder', 1], ['berry_bush', 1], ['bones', 0.2], ['_', 14]],
  swamp: [['reeds', 10], ['tree_dead', 5], ['tentacle_spot', 0.9], ['merm_hut', 0.35], ['mushroom', 3], ['grass', 2], ['flowers', 1], ['bones', 0.3], ['_', 26]],
  rocky: [['boulder', 9], ['boulder_gold', 3], ['boulder_iron', 3.5], ['boulder_copper', 2.5], ['boulder_coal', 2.5], ['flint', 6], ['rocks', 3], ['gobbler_nest', 0.4], ['mole_hill', 0.8], ['tree_dead', 1], ['bones', 0.3], ['_', 26]],
  savanna: [['grass', 22], ['beefalo_herd', 0.22], ['rabbit_hole', 2], ['flint', 2], ['tree_birch', 1], ['carrot', 1], ['rocks', 1], ['_', 24]],
  desert: [['cactus', 8], ['boulder', 2], ['scorpion_burrow', 0.6], ['tumbleweed', 3], ['sand', 4], ['clay', 2], ['boulder_copper', 1], ['bones', 0.6], ['tree_dead', 1], ['_', 30]],
  mushroom: [['mushtree', 20], ['mushroom', 6], ['glowcap', 4], ['bat_cave', 0.35], ['crystal_node', 2.2], ['grass', 1], ['_', 18]],
  beach: [['driftwood', 3], ['crab_den', 0.6], ['flint', 2], ['reeds', 1], ['sand', 4], ['palm', 2], ['rocks', 2], ['_', 34]],
  ruins: [['ruin_pillar', 4], ['ruin_rubble', 5], ['guardian_spawn', 0.5], ['crystal_node', 0.8], ['bones', 0.6], ['_', 26]],
};
