// Receptury. `st` = wymagany stół (lub kilka stołów naraz), `place` = budowla stawiana w świecie.

export type RecipeCat = 'tools' | 'light' | 'survival' | 'food' | 'science' | 'war' | 'build' | 'cloth' | 'magic' | 'machines';

export interface Recipe {
  id: string;
  out: string;
  n?: number;
  ing: [string, number][];
  st?: string | string[];
  lvl?: number;
  cat: RecipeCat;
  place?: boolean;
  char?: string; // tylko dla tej postaci
  bp?: boolean; // wymaga planu (blueprint) z questów / skrzyń / bossów
  time?: number; // sekundy wytwarzania
}

export const CATS: { id: RecipeCat; name: string; icon: string }[] = [
  { id: 'tools', name: 'Narzędzia', icon: '🪓' },
  { id: 'light', name: 'Światło', icon: '🔥' },
  { id: 'survival', name: 'Przetrwanie', icon: '🎒' },
  { id: 'food', name: 'Jedzenie i rolnictwo', icon: '🍖' },
  { id: 'science', name: 'Stoły rzemieślnicze', icon: '🛠️' },
  { id: 'war', name: 'Walka', icon: '⚔️' },
  { id: 'build', name: 'Budowle', icon: '🧱' },
  { id: 'cloth', name: 'Odzież', icon: '🧥' },
  { id: 'magic', name: 'Magia i alchemia', icon: '✨' },
  { id: 'machines', name: 'Maszyny', icon: '⚙️' },
];

const R: Recipe[] = [
  // ===== Poziom 0: z ręki =====
  { id: 'axe', out: 'axe', ing: [['twig', 1], ['flint', 1]], cat: 'tools' },
  { id: 'pickaxe', out: 'pickaxe', ing: [['twig', 2], ['flint', 2]], cat: 'tools' },
  { id: 'torch', out: 'torch', ing: [['twig', 2], ['grass', 2]], cat: 'light' },
  { id: 'campfire', out: 'campfire', ing: [['grass', 3], ['log', 2]], cat: 'light', place: true },
  { id: 'rope', out: 'rope', ing: [['grass', 3]], cat: 'survival' },
  { id: 'bandage', out: 'bandage', ing: [['grass', 4], ['petals', 2]], cat: 'survival' },
  { id: 'garland', out: 'garland', ing: [['petals', 12]], cat: 'cloth' },
  { id: 'workbench', out: 'workbench', ing: [['board', 4], ['stone', 4], ['gold', 1]], cat: 'science', place: true },
  { id: 'board_hand', out: 'board', ing: [['log', 4]], cat: 'survival' },

  // ===== Poziom 1: Warsztat Majsterkowicza =====
  { id: 'board', out: 'board', ing: [['log', 3]], st: 'workbench', cat: 'survival' },
  { id: 'brick', out: 'brick', ing: [['stone', 3]], st: 'workbench', cat: 'survival' },
  { id: 'paper', out: 'paper', ing: [['reeds', 4]], st: 'workbench', cat: 'survival' },
  { id: 'shovel', out: 'shovel', ing: [['twig', 2], ['flint', 2]], st: 'workbench', cat: 'tools' },
  { id: 'hammer', out: 'hammer', ing: [['twig', 3], ['rope', 2], ['stone', 2]], st: 'workbench', cat: 'tools' },
  { id: 'rod', out: 'rod', ing: [['twig', 2], ['silk', 2]], st: 'workbench', cat: 'tools' },
  { id: 'compass', out: 'compass', ing: [['gold', 1], ['paper', 1]], st: 'workbench', cat: 'tools' },
  { id: 'spear', out: 'spear', ing: [['twig', 2], ['rope', 1], ['flint', 1]], st: 'workbench', cat: 'war' },
  { id: 'slingshot', out: 'slingshot', ing: [['twig', 2], ['leather', 1], ['rope', 1]], st: 'workbench', cat: 'war' },
  { id: 'armor_wood', out: 'armor_wood', ing: [['log', 8], ['rope', 2]], st: 'workbench', cat: 'war' },
  { id: 'helmet_leather', out: 'helmet_leather', ing: [['leather', 2]], st: 'workbench', cat: 'war' },
  { id: 'backpack', out: 'backpack', ing: [['grass', 4], ['twig', 4], ['rope', 1]], st: 'workbench', cat: 'survival' },
  { id: 'straw_hat', out: 'straw_hat', ing: [['grass', 12]], st: 'workbench', cat: 'cloth' },
  { id: 'chest', out: 'chest', ing: [['board', 3]], st: 'workbench', cat: 'build', place: true },
  { id: 'wall_hay', out: 'wall_hay', n: 4, ing: [['grass', 4], ['twig', 2]], st: 'workbench', cat: 'build', place: true },
  { id: 'wall_wood', out: 'wall_wood', n: 4, ing: [['log', 2], ['rope', 1]], st: 'workbench', cat: 'build', place: true },
  { id: 'gate', out: 'gate', ing: [['board', 2], ['rope', 1]], st: 'workbench', cat: 'build', place: true },
  { id: 'floor_wood', out: 'floor_wood', ing: [['board', 1]], st: 'workbench', cat: 'build', place: true },
  { id: 'floor_cobble', out: 'floor_cobble', ing: [['stone', 2]], st: 'workbench', cat: 'build', place: true },
  { id: 'farm', out: 'farm', ing: [['grass', 8], ['rot', 2], ['log', 2]], st: 'workbench', cat: 'food', place: true },
  { id: 'farm_alt', out: 'farm', ing: [['grass', 10], ['log', 3]], st: 'workbench', cat: 'food', place: true },
  { id: 'drying_rack', out: 'drying_rack', ing: [['twig', 3], ['rope', 3]], st: 'workbench', cat: 'food', place: true },
  { id: 'firepit', out: 'firepit', ing: [['log', 2], ['stone', 12]], st: 'workbench', cat: 'light', place: true },
  { id: 'quest_board', out: 'quest_board', ing: [['board', 3], ['paper', 2]], st: 'workbench', cat: 'build', place: true },
  { id: 'scarecrow', out: 'scarecrow', ing: [['grass', 6], ['twig', 4], ['pumpkin', 1]], st: 'workbench', cat: 'build', place: true },
  { id: 'forge', out: 'forge', ing: [['brick', 6], ['iron_ingot', 4], ['coal', 1]], st: 'workbench', cat: 'science', place: true },
  { id: 'furnace_wb', out: 'furnace', ing: [['brick', 8], ['coal', 2]], st: 'workbench', cat: 'machines', place: true },
  { id: 'kitchen', out: 'kitchen', ing: [['stone', 3], ['coal', 6], ['twig', 6]], st: 'workbench', cat: 'science', place: true },
  { id: 'loom', out: 'loom', ing: [['board', 4], ['silk', 6], ['fur', 2]], st: 'workbench', cat: 'science', place: true },
  { id: 'fertilizer', out: 'fertilizer', ing: [['rot', 3], ['bone', 1]], st: 'workbench', cat: 'food' },

  // ===== Poziom 2: Kuźnia =====
  { id: 'axe_iron', out: 'axe_iron', ing: [['twig', 2], ['iron_ingot', 2]], st: 'forge', cat: 'tools' },
  { id: 'pickaxe_iron', out: 'pickaxe_iron', ing: [['twig', 2], ['iron_ingot', 3]], st: 'forge', cat: 'tools' },
  { id: 'sword', out: 'sword', ing: [['board', 1], ['iron_ingot', 3], ['leather', 1]], st: 'forge', cat: 'war' },
  { id: 'armor_scale', out: 'armor_scale', ing: [['scales', 6], ['iron_ingot', 4], ['leather', 2]], st: 'forge', cat: 'war' },
  { id: 'helmet_iron', out: 'helmet_iron', ing: [['iron_ingot', 4], ['leather', 1]], st: 'forge', cat: 'war' },
  { id: 'crab_shield', out: 'crab_shield', ing: [['shell', 3], ['iron_ingot', 1]], st: 'forge', cat: 'war' },
  { id: 'crossbow', out: 'crossbow', ing: [['board', 2], ['iron_ingot', 3], ['rope', 2]], st: 'forge', lvl: 2, cat: 'war' },
  { id: 'wall_stone', out: 'wall_stone', n: 4, ing: [['brick', 3]], st: 'forge', cat: 'build', place: true },
  { id: 'wall_metal', out: 'wall_metal', n: 4, ing: [['iron_ingot', 2], ['brick', 2]], st: 'forge', lvl: 2, cat: 'build', place: true },
  { id: 'furnace', out: 'furnace', ing: [['brick', 6], ['iron_ingot', 2]], st: 'forge', cat: 'machines', place: true },
  { id: 'big_chest', out: 'big_chest', ing: [['board', 5], ['iron_ingot', 1]], st: 'forge', cat: 'build', place: true },
  { id: 'vault', out: 'vault', ing: [['iron_ingot', 6], ['brick', 4], ['gold_ingot', 1]], st: 'forge', lvl: 2, cat: 'build', place: true },
  { id: 'rod_lightning', out: 'rod_lightning', ing: [['gold_ingot', 2], ['copper_ingot', 2], ['stone', 3]], st: 'forge', cat: 'build', place: true },
  { id: 'lantern', out: 'lantern', ing: [['iron_ingot', 1], ['glass', 1], ['glowberry', 2]], st: 'forge', cat: 'light' },
  { id: 'repair_kit', out: 'repair_kit', ing: [['iron_ingot', 1], ['board', 1], ['rope', 1]], st: 'forge', cat: 'tools' },
  { id: 'multitool', out: 'multitool', ing: [['gold_ingot', 2], ['iron_ingot', 3], ['living_log', 1]], st: 'forge', lvl: 2, cat: 'tools' },
  { id: 'forge2', out: 'forge2', ing: [['iron_ingot', 6], ['copper_ingot', 4], ['coal', 6], ['leather', 2]], st: 'forge', cat: 'science', place: true },
  { id: 'arrow', out: 'arrow', n: 10, ing: [['twig', 5], ['flint', 2], ['feather', 2]], st: 'forge', cat: 'war' },
  { id: 'bow', out: 'bow', ing: [['twig', 3], ['silk', 4], ['board', 1]], st: 'forge', cat: 'war' },

  // ===== Kuchnia Polowa =====
  { id: 'icebox', out: 'icebox', ing: [['gold_ingot', 2], ['iron_ingot', 1], ['board', 2]], st: 'kitchen', cat: 'food', place: true },
  { id: 'smokehouse', out: 'smokehouse', ing: [['brick', 4], ['board', 4], ['rope', 2]], st: 'kitchen', cat: 'food', place: true },
  { id: 'jerky_fast', out: 'jerky', ing: [['meat', 1], ['coal', 1]], st: 'kitchen', cat: 'food' },

  // ===== Krosno =====
  { id: 'winter_hat', out: 'winter_hat', ing: [['fur', 4], ['silk', 4]], st: 'loom', cat: 'cloth' },
  { id: 'fur_coat', out: 'fur_coat', ing: [['fur', 8], ['silk', 4], ['rope', 2]], st: 'loom', cat: 'cloth' },
  { id: 'raincoat', out: 'raincoat', ing: [['scales', 4], ['leather', 2], ['rope', 2]], st: 'loom', cat: 'cloth' },
  { id: 'summer_vest', out: 'summer_vest', ing: [['silk', 6], ['feather', 4]], st: 'loom', cat: 'cloth' },
  { id: 'goggles', out: 'goggles', ing: [['glass', 2], ['leather', 1]], st: 'loom', cat: 'cloth' },
  { id: 'umbrella', out: 'umbrella', ing: [['twig', 6], ['bat_wing', 3], ['rope', 1]], st: 'loom', cat: 'cloth' },
  { id: 'big_backpack', out: 'big_backpack', ing: [['leather', 4], ['silk', 6], ['rope', 3]], st: 'loom', cat: 'survival' },
  { id: 'wing_pack', out: 'wing_pack', ing: [['bat_wing', 8], ['silk', 4], ['board', 2]], st: 'loom', cat: 'survival' },
  { id: 'silk_bandage', out: 'silk_bandage', ing: [['silk', 2], ['gland', 2]], st: 'loom', cat: 'survival' },
  { id: 'tent', out: 'tent', ing: [['silk', 6], ['twig', 4], ['rope', 3]], st: 'loom', cat: 'survival', place: true },
  { id: 'floor_carpet', out: 'floor_carpet', ing: [['fur', 1], ['board', 1]], st: 'loom', cat: 'build', place: true },

  // ===== Pracownia Alchemika =====
  { id: 'health_potion', out: 'health_potion', ing: [['gland', 2], ['berries', 3], ['glass', 1]], st: 'alchemy', cat: 'magic' },
  { id: 'sanity_potion', out: 'sanity_potion', ing: [['petals', 6], ['mushroom', 2], ['glass', 1]], st: 'alchemy', cat: 'magic' },
  { id: 'speed_potion', out: 'speed_potion', ing: [['venom', 1], ['carrot', 2], ['glass', 1]], st: 'alchemy', cat: 'magic' },
  { id: 'fire_potion', out: 'fire_potion', ing: [['coal', 2], ['cactus_flesh', 1], ['glass', 1]], st: 'alchemy', cat: 'magic' },
  { id: 'frost_potion', out: 'frost_potion', ing: [['crystal', 1], ['berries', 2], ['glass', 1]], st: 'alchemy', cat: 'magic' },
  { id: 'thermal_stone', out: 'thermal_stone', ing: [['stone', 10], ['crystal', 2], ['gold', 2]], st: 'alchemy', cat: 'survival' },
  { id: 'fertilizer_good', out: 'fertilizer', n: 3, ing: [['rot', 4], ['bone', 1], ['venom', 1]], st: 'alchemy', cat: 'food' },
  { id: 'heart', out: 'heart', ing: [['meat', 2], ['gland', 3], ['crystal', 1]], st: 'alchemy', cat: 'magic' },
  { id: 'res_altar', out: 'res_altar', ing: [['brick', 6], ['crystal', 3], ['gold_ingot', 2], ['heart', 1]], st: 'alchemy', cat: 'magic', place: true },
  { id: 'ice_staff', out: 'ice_staff', ing: [['living_log', 1], ['crystal', 3], ['frost_antler', 1]], st: 'alchemy', cat: 'magic' },
  { id: 'fire_staff', out: 'fire_staff', ing: [['living_log', 1], ['crystal', 2], ['sand_heart', 1]], st: 'alchemy', cat: 'magic' },
  { id: 'storm_staff', out: 'storm_staff', ing: [['living_log', 1], ['crystal', 3], ['storm_feather', 1]], st: 'alchemy', cat: 'magic' },
  { id: 'glass_alt', out: 'glass', n: 2, ing: [['sand', 3], ['coal', 1]], st: 'alchemy', cat: 'survival' },
  // wymaga dwóch stołów obok siebie
  { id: 'armor_crystal', out: 'armor_crystal', ing: [['crystal', 6], ['iron_ingot', 4], ['leather', 2]], st: ['forge', 'alchemy'], cat: 'war' },
  { id: 'solar', out: 'solar', ing: [['crystal', 4], ['glass', 4], ['copper_ingot', 2]], st: ['alchemy', 'mechanic'], cat: 'machines', place: true },

  // ===== Stół Kartografa =====
  { id: 'weather_station', out: 'weather_station', ing: [['copper_ingot', 2], ['glass', 1], ['paper', 2]], st: 'cartography', cat: 'science', place: true },

  // ===== Warsztat Mechanika =====
  { id: 'generator', out: 'generator', ing: [['iron_ingot', 6], ['copper_ingot', 4], ['gear', 2]], st: 'mechanic', cat: 'machines', place: true },
  { id: 'windmill', out: 'windmill', ing: [['board', 8], ['copper_ingot', 3], ['gear', 1]], st: 'mechanic', cat: 'machines', place: true },
  { id: 'waterwheel', out: 'waterwheel', ing: [['board', 10], ['iron_ingot', 2], ['gear', 2]], st: 'mechanic', cat: 'machines', place: true },
  { id: 'lamp', out: 'lamp', ing: [['iron_ingot', 1], ['copper_ingot', 1], ['glass', 1]], st: 'mechanic', cat: 'light', place: true },
  { id: 'sawmill', out: 'sawmill', ing: [['iron_ingot', 4], ['gear', 2], ['board', 4]], st: 'mechanic', cat: 'machines', place: true },
  { id: 'drill', out: 'drill', ing: [['iron_ingot', 6], ['gear', 3], ['copper_ingot', 2]], st: 'mechanic', cat: 'machines', place: true },
  { id: 'harvester', out: 'harvester', ing: [['iron_ingot', 4], ['gear', 2], ['board', 3]], st: 'mechanic', cat: 'machines', place: true },
  { id: 'sprinkler', out: 'sprinkler', ing: [['copper_ingot', 3], ['gear', 1], ['glass', 1]], st: 'mechanic', cat: 'machines', place: true },
  { id: 'turret', out: 'turret', ing: [['iron_ingot', 5], ['gear', 2], ['crossbow', 1]], st: 'mechanic', cat: 'machines', place: true },
  { id: 'hopper', out: 'hopper', ing: [['iron_ingot', 2], ['gear', 1]], st: 'mechanic', cat: 'machines', place: true },
  { id: 'gear', out: 'gear', ing: [['iron_ingot', 1], ['copper_ingot', 1]], st: 'mechanic', cat: 'machines' },

  // ===== Ołtarz Cienia =====
  { id: 'shadow_sword', out: 'shadow_sword', ing: [['essence', 5], ['living_log', 1], ['iron_ingot', 2]], st: 'shadow', cat: 'magic' },
  { id: 'armor_shadow', out: 'armor_shadow', ing: [['essence', 6], ['queen_silk', 2], ['scales', 4]], st: 'shadow', cat: 'magic' },
  { id: 'golem_core', out: 'golem_core', ing: [['essence', 6], ['living_log', 3], ['ruin_metal', 4]], st: 'shadow', cat: 'magic', place: true },
  { id: 'ancient_key', out: 'ancient_key', ing: [['core_fragment', 3], ['essence', 4]], st: 'shadow', cat: 'magic' },

  // ===== Starożytny Rdzeń (tylko w ruinach, po naprawie) =====
  { id: 'ancient_sword', out: 'ancient_sword', ing: [['ruin_metal', 6], ['mother_claw', 1], ['crystal', 4]], st: 'ancient', cat: 'war' },
  { id: 'armor_ancient', out: 'armor_ancient', ing: [['ruin_metal', 8], ['queen_silk', 2], ['frost_antler', 1]], st: 'ancient', cat: 'war' },
  { id: 'escape_portal', out: 'escape_portal', ing: [['ruin_metal', 12], ['crystal', 8], ['essence', 10], ['gold_ingot', 6]], st: 'ancient', cat: 'magic', place: true },

  // ===== Kolejne stoły =====
  { id: 'shadow_altar', out: 'shadow_altar', ing: [['essence', 6], ['crystal', 4], ['mother_claw', 1]], st: 'alchemy', cat: 'science', place: true },
  { id: 'alchemy', out: 'alchemy', ing: [['gold_ingot', 4], ['crystal', 2], ['glass', 4]], st: 'forge', cat: 'science', place: true },
  { id: 'maptable', out: 'maptable', ing: [['board', 4], ['paper', 4], ['compass', 1]], st: 'workbench', cat: 'science', place: true },
  { id: 'mechbench', out: 'mechbench', ing: [['iron_ingot', 8], ['copper_ingot', 4], ['gear', 4]], st: 'forge', lvl: 2, cat: 'science', place: true },
  { id: 'gear_forge', out: 'gear', ing: [['iron_ingot', 2], ['copper_ingot', 1]], st: 'forge', cat: 'machines' },

  // ===== Unikalne dla postaci =====
  { id: 'c_potion', out: 'health_potion', ing: [['berries', 4], ['petals', 4]], cat: 'magic', char: 'ilma' },
  { id: 'c_sanity', out: 'sanity_potion', ing: [['petals', 6], ['mushroom', 2]], cat: 'magic', char: 'ilma' },
  { id: 'c_turret', out: 'turret', ing: [['iron_ingot', 3], ['gear', 1], ['spear', 1]], st: 'workbench', cat: 'machines', place: true, char: 'tomasz' },
  { id: 'c_kit', out: 'repair_kit', n: 2, ing: [['iron_ingot', 1], ['rope', 1]], cat: 'tools', char: 'tomasz' },
  { id: 'c_hammer', out: 'hammer', ing: [['twig', 2], ['stone', 2]], cat: 'tools', char: 'bruno' },
  { id: 'c_spear', out: 'spear', ing: [['twig', 2], ['flint', 1]], cat: 'war', char: 'grot' },
  { id: 'c_lantern', out: 'lantern', ing: [['glowberry', 3], ['silk', 2]], cat: 'light', char: 'mira' },
  { id: 'c_bow', out: 'bow', ing: [['twig', 3], ['rope', 2]], cat: 'war', char: 'ruda' },
];

export const RECIPES: Record<string, Recipe> = {};
for (const r of R) RECIPES[r.id] = r;

// Receptury, które trzeba odblokować planem (nie są widoczne/wykonywalne od samego stołu).
export const BLUEPRINT_ONLY = new Set<string>(['multitool', 'wing_pack', 'ice_staff', 'fire_staff', 'storm_staff', 'golem_core', 'vault']);

export function recipeStations(r: Recipe): string[] {
  if (!r.st) return [];
  return Array.isArray(r.st) ? r.st : [r.st];
}

// ===== Kuchnia Polowa: przepisy z kategorii składników =====
export function cookPot(cats: Record<string, number>): string {
  const m = (cats.meat || 0) + (cats.monster || 0) * 0.5;
  const v = cats.veg || 0, f = cats.fruit || 0, e = cats.egg || 0, fi = cats.fish || 0;
  const meatAll = m + fi * 0.5;
  if (m >= 2 && v >= 2) return 'bigos';
  if (meatAll >= 3) return 'stew';
  if (v >= 1 && e >= 1 && meatAll >= 1) return 'pierogi';
  if (v >= 2 && e >= 1) return 'chlodnik';
  if (fi >= 2) return 'fishcakes';
  if (f >= 2 && v >= 1 && meatAll === 0) return 'fruit_salad';
  if (meatAll >= 1 && v + f + e >= 1) return 'meatballs';
  if (f >= 3) return 'jam';
  return 'goop';
}
