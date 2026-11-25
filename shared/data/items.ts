// Definicje przedmiotów. Wszystkie wartości balansu są tutaj, nie w logice.

export type EquipSlot = 'hand' | 'head' | 'body' | 'back';
export type ToolKind = 'chop' | 'mine' | 'dig' | 'hammer' | 'fish';
export type FoodCat = 'meat' | 'veg' | 'fruit' | 'egg' | 'fish' | 'monster' | 'none';

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  desc?: string;
  stack?: number; // domyślnie 40 dla zasobów, 1 dla narzędzi
  cat: 'res' | 'food' | 'tool' | 'weapon' | 'armor' | 'cloth' | 'light' | 'misc' | 'ammo' | 'potion' | 'boss';
  // jedzenie
  food?: { hunger: number; hp: number; san: number; spoil?: number; cat?: FoodCat; cooked?: string; buff?: string; noRaw?: boolean };
  // wyposażenie
  slot?: EquipSlot;
  tool?: ToolKind[];
  toolPower?: number; // mnożnik szybkości pracy
  dmg?: number;
  range?: number; // zasięg ataku dystansowego
  ammo?: string; // przedmiot zużywany przy strzale
  proj?: string; // wygląd pocisku
  armor?: number; // procent pochłanianych obrażeń (0..1)
  dur?: number; // wytrzymałość (użycia lub pochłonięte obrażenia lub sekundy)
  durKind?: 'use' | 'armor' | 'time';
  light?: number; // promień światła gdy trzymane
  warmth?: number; // izolacja zimowa
  cool?: number; // izolacja letnia
  water?: number; // wodoodporność 0..1
  sanity?: number; // zmiana poczytalności na minutę gdy założone
  speed?: number; // mnożnik prędkości
  slots?: number; // plecak
  fuel?: number; // sekundy paliwa
  effect?: string; // efekt przy użyciu
  status?: string; // efekt nakładany przy trafieniu
}

const I: ItemDef[] = [
  // --- Zasoby podstawowe ---
  { id: 'twig', name: 'Gałązki', icon: '🥢', cat: 'res', fuel: 15 },
  { id: 'grass', name: 'Ścięta trawa', icon: '🌾', cat: 'res', fuel: 15 },
  { id: 'log', name: 'Kłoda', icon: '🪵', cat: 'res', fuel: 45, stack: 20 },
  { id: 'board', name: 'Deska', icon: '🟫', cat: 'res', fuel: 30, stack: 20 },
  { id: 'flint', name: 'Krzemień', icon: '🔺', cat: 'res' },
  { id: 'stone', name: 'Kamień', icon: '🪨', cat: 'res' },
  { id: 'brick', name: 'Kamienna cegła', icon: '🧱', cat: 'res', stack: 20 },
  { id: 'gold', name: 'Bryłka złota', icon: '🪙', cat: 'res' },
  { id: 'gold_ingot', name: 'Sztabka złota', icon: '🟨', cat: 'res', stack: 20 },
  { id: 'iron_ore', name: 'Ruda żelaza', icon: '🟤', cat: 'res' },
  { id: 'iron_ingot', name: 'Sztabka żelaza', icon: '🔩', cat: 'res', stack: 20 },
  { id: 'copper_ore', name: 'Ruda miedzi', icon: '🟠', cat: 'res' },
  { id: 'copper_ingot', name: 'Sztabka miedzi', icon: '🟧', cat: 'res', stack: 20 },
  { id: 'coal', name: 'Węgiel', icon: '⚫', cat: 'res', fuel: 90 },
  { id: 'crystal', name: 'Kryształ', icon: '💎', cat: 'res' },
  { id: 'sand', name: 'Piasek', icon: '⏳', cat: 'res' },
  { id: 'glass', name: 'Szkło', icon: '🪟', cat: 'res', stack: 20 },
  { id: 'clay', name: 'Glina', icon: '🏺', cat: 'res' },
  { id: 'reeds', name: 'Trzcina', icon: '🎋', cat: 'res', fuel: 15 },
  { id: 'paper', name: 'Papier', icon: '📜', cat: 'res' },
  { id: 'rope', name: 'Lina', icon: '🪢', cat: 'res' },
  { id: 'silk', name: 'Pajęczy jedwab', icon: '🕸️', cat: 'res' },
  { id: 'gland', name: 'Gruczoł pajęczy', icon: '🟢', cat: 'res' },
  { id: 'fur', name: 'Futro', icon: '🦬', cat: 'res' },
  { id: 'leather', name: 'Skóra', icon: '👝', cat: 'res' },
  { id: 'bone', name: 'Kość', icon: '🦴', cat: 'res' },
  { id: 'scales', name: 'Łuski', icon: '🐚', cat: 'res' },
  { id: 'feather', name: 'Pióro', icon: '🪶', cat: 'res' },
  { id: 'horn', name: 'Róg', icon: '📯', cat: 'res' },
  { id: 'tooth', name: 'Kieł ogara', icon: '🦷', cat: 'res' },
  { id: 'venom', name: 'Jad skorpiona', icon: '🧪', cat: 'res' },
  { id: 'shell', name: 'Pancerz kraba', icon: '🦀', cat: 'res' },
  { id: 'bat_wing', name: 'Błona nietoperza', icon: '🦇', cat: 'res' },
  { id: 'claw', name: 'Pazur kretojada', icon: '🪝', cat: 'res' },
  { id: 'living_log', name: 'Żywe drewno', icon: '🌳', cat: 'res', stack: 20 },
  { id: 'petals', name: 'Płatki kwiatów', icon: '🌸', cat: 'res', food: { hunger: 0, hp: 1, san: 0, spoil: 6, cat: 'none' } },
  { id: 'essence', name: 'Esencja cienia', icon: '🌑', cat: 'res' },
  { id: 'ruin_metal', name: 'Metal z ruin', icon: '🔘', cat: 'res' },
  { id: 'gear', name: 'Tryb', icon: '⚙️', cat: 'res' },
  { id: 'pinecone', name: 'Szyszka', icon: '🌰', cat: 'misc', fuel: 15, desc: 'Posadź na ziemi (PPM w ekwipunku przy wolnym miejscu), wyrośnie drzewo.' },
  { id: 'seeds', name: 'Nasiona', icon: '🌱', cat: 'misc', desc: 'Zasadź na grządce.', food: { hunger: 4, hp: 0, san: 0, spoil: 40, cat: 'none' } },
  { id: 'blueprint', name: 'Plan konstrukcyjny', icon: '📘', cat: 'misc', stack: 1, effect: 'learn', desc: 'Użyj, aby nauczyć się receptury.' },
  { id: 'note', name: 'Notatka', icon: '📄', cat: 'misc', stack: 1 },

  // --- Jedzenie ---
  { id: 'berries', name: 'Jagody', icon: '🫐', cat: 'food', stack: 20, food: { hunger: 9, hp: 0, san: 0, spoil: 6, cat: 'fruit', cooked: 'berries_cooked' } },
  { id: 'berries_cooked', name: 'Pieczone jagody', icon: '🍇', cat: 'food', stack: 20, food: { hunger: 12, hp: 1, san: 0, spoil: 3, cat: 'fruit' } },
  { id: 'carrot', name: 'Marchew', icon: '🥕', cat: 'food', stack: 20, food: { hunger: 12, hp: 1, san: 0, spoil: 10, cat: 'veg', cooked: 'carrot_cooked' } },
  { id: 'carrot_cooked', name: 'Pieczona marchew', icon: '🍠', cat: 'food', stack: 20, food: { hunger: 12, hp: 3, san: 0, spoil: 6, cat: 'veg' } },
  { id: 'potato', name: 'Ziemniak', icon: '🥔', cat: 'food', stack: 20, food: { hunger: 18, hp: 0, san: 0, spoil: 15, cat: 'veg', cooked: 'potato_cooked' } },
  { id: 'potato_cooked', name: 'Pieczony ziemniak', icon: '🥔', cat: 'food', stack: 20, food: { hunger: 25, hp: 3, san: 1, spoil: 8, cat: 'veg' } },
  { id: 'pumpkin', name: 'Dynia', icon: '🎃', cat: 'food', stack: 10, food: { hunger: 37, hp: 3, san: 0, spoil: 15, cat: 'veg', cooked: 'pumpkin_cooked' } },
  { id: 'pumpkin_cooked', name: 'Pieczona dynia', icon: '🍮', cat: 'food', stack: 10, food: { hunger: 37, hp: 8, san: 0, spoil: 8, cat: 'veg' } },
  { id: 'mushroom', name: 'Grzyb', icon: '🍄', cat: 'food', stack: 20, food: { hunger: 12, hp: -5, san: -5, spoil: 10, cat: 'veg', cooked: 'mushroom_cooked' } },
  { id: 'mushroom_cooked', name: 'Smażony grzyb', icon: '🍄‍🟫', cat: 'food', stack: 20, food: { hunger: 6, hp: 3, san: 10, spoil: 6, cat: 'veg' } },
  { id: 'glowberry', name: 'Świetlista jagoda', icon: '🔆', cat: 'food', stack: 10, food: { hunger: 11, hp: 3, san: -5, spoil: 8, cat: 'fruit', buff: 'glow' } },
  { id: 'cactus_flesh', name: 'Miąższ kaktusa', icon: '🌵', cat: 'food', stack: 20, food: { hunger: 12, hp: -3, san: -5, spoil: 10, cat: 'veg', cooked: 'cactus_cooked' } },
  { id: 'cactus_cooked', name: 'Pieczony kaktus', icon: '🥒', cat: 'food', stack: 20, food: { hunger: 12, hp: 1, san: 15, spoil: 6, cat: 'veg' } },
  { id: 'meat', name: 'Mięso', icon: '🥩', cat: 'food', stack: 20, food: { hunger: 25, hp: 1, san: -10, spoil: 6, cat: 'meat', cooked: 'meat_cooked', noRaw: true } },
  { id: 'meat_cooked', name: 'Pieczone mięso', icon: '🍖', cat: 'food', stack: 20, food: { hunger: 25, hp: 3, san: 0, spoil: 10, cat: 'meat' } },
  { id: 'small_meat', name: 'Kawałek mięsa', icon: '🍗', cat: 'food', stack: 20, food: { hunger: 12, hp: 1, san: -10, spoil: 6, cat: 'meat', cooked: 'small_meat_cooked', noRaw: true } },
  { id: 'small_meat_cooked', name: 'Pieczony kąsek', icon: '🍢', cat: 'food', stack: 20, food: { hunger: 12, hp: 1, san: 0, spoil: 10, cat: 'meat' } },
  { id: 'monster_meat', name: 'Mięso potwora', icon: '🫀', cat: 'food', stack: 20, food: { hunger: 18, hp: -20, san: -15, spoil: 6, cat: 'monster', cooked: 'monster_cooked', noRaw: true } },
  { id: 'monster_cooked', name: 'Pieczone mięso potwora', icon: '🥓', cat: 'food', stack: 20, food: { hunger: 18, hp: -3, san: -10, spoil: 10, cat: 'monster' } },
  { id: 'fish', name: 'Ryba', icon: '🐟', cat: 'food', stack: 20, food: { hunger: 12, hp: 1, san: 0, spoil: 3, cat: 'fish', cooked: 'fish_cooked' } },
  { id: 'fish_cooked', name: 'Pieczona ryba', icon: '🍣', cat: 'food', stack: 20, food: { hunger: 12, hp: 3, san: 0, spoil: 6, cat: 'fish' } },
  { id: 'egg', name: 'Jajo', icon: '🥚', cat: 'food', stack: 20, food: { hunger: 9, hp: 0, san: 0, spoil: 10, cat: 'egg', cooked: 'egg_cooked' } },
  { id: 'egg_cooked', name: 'Jajecznica', icon: '🍳', cat: 'food', stack: 20, food: { hunger: 12, hp: 3, san: 0, spoil: 6, cat: 'egg' } },
  { id: 'jerky', name: 'Suszone mięso', icon: '🥓', cat: 'food', stack: 20, food: { hunger: 25, hp: 20, san: 15, spoil: 20, cat: 'meat' } },
  // dania z Kuchni Polowej
  { id: 'meatballs', name: 'Klopsiki', icon: '🧆', cat: 'food', stack: 10, food: { hunger: 62, hp: 3, san: 5, spoil: 10, cat: 'none' } },
  { id: 'stew', name: 'Gulasz', icon: '🍲', cat: 'food', stack: 10, food: { hunger: 150, hp: 12, san: 5, spoil: 10, cat: 'none' } },
  { id: 'bigos', name: 'Bigos', icon: '🍛', cat: 'food', stack: 10, food: { hunger: 75, hp: 20, san: 15, spoil: 15, cat: 'none', buff: 'warm' } },
  { id: 'pierogi', name: 'Pierogi', icon: '🥟', cat: 'food', stack: 10, food: { hunger: 50, hp: 30, san: 10, spoil: 15, cat: 'none' } },
  { id: 'chlodnik', name: 'Chłodnik', icon: '🥣', cat: 'food', stack: 10, food: { hunger: 37, hp: 15, san: 15, spoil: 6, cat: 'none', buff: 'cool' } },
  { id: 'fishcakes', name: 'Paszteciki rybne', icon: '🥞', cat: 'food', stack: 10, food: { hunger: 37, hp: 20, san: 5, spoil: 10, cat: 'none' } },
  { id: 'fruit_salad', name: 'Sałatka owocowa', icon: '🥗', cat: 'food', stack: 10, food: { hunger: 25, hp: 20, san: 10, spoil: 6, cat: 'none', buff: 'speed' } },
  { id: 'jam', name: 'Konfitura', icon: '🍯', cat: 'food', stack: 10, food: { hunger: 37, hp: 10, san: 20, spoil: 30, cat: 'none' } },
  { id: 'goop', name: 'Mokra breja', icon: '🤢', cat: 'food', stack: 10, food: { hunger: 0, hp: 0, san: 0, spoil: 6, cat: 'none' } },
  { id: 'rot', name: 'Zgnilizna', icon: '🦠', cat: 'misc', stack: 40, food: { hunger: -10, hp: -1, san: 0, cat: 'none' }, desc: 'Dobry nawóz.' },

  // --- Narzędzia ---
  { id: 'axe', name: 'Siekiera z krzemienia', icon: '🪓', cat: 'tool', slot: 'hand', tool: ['chop'], toolPower: 1, dmg: 27, dur: 100, durKind: 'use' },
  { id: 'pickaxe', name: 'Kilof z krzemienia', icon: '⛏️', cat: 'tool', slot: 'hand', tool: ['mine'], toolPower: 1, dmg: 27, dur: 33, durKind: 'use' },
  { id: 'axe_iron', name: 'Żelazna siekiera', icon: '🪓', cat: 'tool', slot: 'hand', tool: ['chop'], toolPower: 2, dmg: 34, dur: 250, durKind: 'use' },
  { id: 'pickaxe_iron', name: 'Żelazny kilof', icon: '⛏️', cat: 'tool', slot: 'hand', tool: ['mine'], toolPower: 2, dmg: 34, dur: 120, durKind: 'use' },
  { id: 'multitool', name: 'Kilofosiekiera', icon: '⚒️', cat: 'tool', slot: 'hand', tool: ['chop', 'mine'], toolPower: 2.5, dmg: 42, dur: 400, durKind: 'use' },
  { id: 'shovel', name: 'Łopata', icon: '🪏', cat: 'tool', slot: 'hand', tool: ['dig'], toolPower: 1, dmg: 17, dur: 25, durKind: 'use' },
  { id: 'hammer', name: 'Młotek', icon: '🔨', cat: 'tool', slot: 'hand', tool: ['hammer'], toolPower: 1, dmg: 17, dur: 75, durKind: 'use', desc: 'Rozbiera budowle (odzyskujesz połowę materiałów) i naprawia z zestawem naprawczym.' },
  { id: 'rod', name: 'Wędka', icon: '🎣', cat: 'tool', slot: 'hand', tool: ['fish'], dmg: 5, dur: 9, durKind: 'use', desc: 'Kliknij wodę, aby łowić ryby.' },
  { id: 'torch', name: 'Pochodnia', icon: '🔥', cat: 'light', slot: 'hand', light: 7, dmg: 17, dur: 150, durKind: 'time', status: 'burn' },
  { id: 'lantern', name: 'Latarnia', icon: '🏮', cat: 'light', slot: 'hand', light: 10, dmg: 10, dur: 900, durKind: 'time' },
  { id: 'umbrella', name: 'Parasol', icon: '☂️', cat: 'tool', slot: 'hand', water: 0.9, cool: 60, dmg: 10, dur: 900, durKind: 'time' },
  { id: 'compass', name: 'Kompas', icon: '🧭', cat: 'tool', stack: 1, desc: 'Pokazuje kierunki na minimapie. Składnik Stołu Kartografa.' },
  { id: 'repair_kit', name: 'Zestaw naprawczy', icon: '🧰', cat: 'misc', stack: 10, effect: 'repair', desc: 'Naprawia budowle i maszyny (trzymaj młotek lub kliknij PPM budowlę).' },
  { id: 'heart', name: 'Serce życia', icon: '❤️', cat: 'misc', stack: 5, effect: 'revive', desc: 'Kliknij ducha sojusznika, aby go wskrzesić.' },
  { id: 'ancient_key', name: 'Klucz Prastarych', icon: '🗝️', cat: 'boss', stack: 1, desc: 'Otwiera Starożytny Rdzeń w ruinach.' },

  // --- Bronie ---
  { id: 'spear', name: 'Włócznia', icon: '🔱', cat: 'weapon', slot: 'hand', dmg: 34, dur: 150, durKind: 'use' },
  { id: 'sword', name: 'Żelazny miecz', icon: '⚔️', cat: 'weapon', slot: 'hand', dmg: 51, dur: 200, durKind: 'use' },
  { id: 'tentacle_spike', name: 'Kolec macki', icon: '🍢', cat: 'weapon', slot: 'hand', dmg: 51, dur: 100, durKind: 'use' },
  { id: 'shadow_sword', name: 'Miecz Cienia', icon: '🗡️', cat: 'weapon', slot: 'hand', dmg: 68, dur: 300, durKind: 'use', sanity: -20 },
  { id: 'ancient_sword', name: 'Miecz Prastarych', icon: '🗡️', cat: 'weapon', slot: 'hand', dmg: 85, dur: 600, durKind: 'use' },
  { id: 'slingshot', name: 'Proca', icon: '🪃', cat: 'weapon', slot: 'hand', dmg: 20, range: 14, ammo: 'stone', proj: 'stone', dur: 120, durKind: 'use' },
  { id: 'bow', name: 'Łuk', icon: '🏹', cat: 'weapon', slot: 'hand', dmg: 34, range: 18, ammo: 'arrow', proj: 'arrow', dur: 150, durKind: 'use' },
  { id: 'crossbow', name: 'Kusza', icon: '🎯', cat: 'weapon', slot: 'hand', dmg: 55, range: 22, ammo: 'arrow', proj: 'arrow', dur: 200, durKind: 'use' },
  { id: 'arrow', name: 'Strzały', icon: '➶', cat: 'ammo', stack: 40 },
  { id: 'ice_staff', name: 'Laska Mrozu', icon: '❄️', cat: 'weapon', slot: 'hand', dmg: 10, range: 16, proj: 'ice', dur: 25, durKind: 'use', status: 'freeze' },
  { id: 'fire_staff', name: 'Laska Ognia', icon: '☄️', cat: 'weapon', slot: 'hand', dmg: 40, range: 16, proj: 'fire', dur: 25, durKind: 'use', status: 'burn' },
  { id: 'storm_staff', name: 'Laska Burzy', icon: '⚡', cat: 'weapon', slot: 'hand', dmg: 70, range: 18, proj: 'bolt', dur: 30, durKind: 'use', status: 'stun' },

  // --- Pancerze ---
  { id: 'armor_wood', name: 'Zbroja z drewna', icon: '🛡️', cat: 'armor', slot: 'body', armor: 0.6, dur: 450, durKind: 'armor' },
  { id: 'helmet_leather', name: 'Skórzany hełm', icon: '⛑️', cat: 'armor', slot: 'head', armor: 0.6, dur: 450, durKind: 'armor' },
  { id: 'armor_scale', name: 'Zbroja łuskowa', icon: '🥋', cat: 'armor', slot: 'body', armor: 0.75, dur: 800, durKind: 'armor' },
  { id: 'helmet_iron', name: 'Żelazny hełm', icon: '🪖', cat: 'armor', slot: 'head', armor: 0.75, dur: 700, durKind: 'armor' },
  { id: 'armor_crystal', name: 'Zbroja kryształowa', icon: '💠', cat: 'armor', slot: 'body', armor: 0.85, dur: 1200, durKind: 'armor' },
  { id: 'armor_shadow', name: 'Zbroja Cienia', icon: '🖤', cat: 'armor', slot: 'body', armor: 0.9, dur: 1000, durKind: 'armor', sanity: -10 },
  { id: 'armor_ancient', name: 'Zbroja Prastarych', icon: '👑', cat: 'armor', slot: 'body', armor: 0.9, dur: 2500, durKind: 'armor', warmth: 60 },
  { id: 'crab_shield', name: 'Krabia tarcza (hełm)', icon: '🦀', cat: 'armor', slot: 'head', armor: 0.7, dur: 600, durKind: 'armor', water: 0.3 },

  // --- Odzież ---
  { id: 'garland', name: 'Wianek', icon: '💐', cat: 'cloth', slot: 'head', sanity: 1.33 * 1, dur: 480, durKind: 'time' },
  { id: 'straw_hat', name: 'Słomkowy kapelusz', icon: '👒', cat: 'cloth', slot: 'head', cool: 60, water: 0.2, dur: 1200, durKind: 'time' },
  { id: 'winter_hat', name: 'Czapka zimowa', icon: '🧢', cat: 'cloth', slot: 'head', warmth: 60, sanity: 1, dur: 1500, durKind: 'time' },
  { id: 'fur_coat', name: 'Futrzany płaszcz', icon: '🧥', cat: 'cloth', slot: 'body', warmth: 120, dur: 2400, durKind: 'time' },
  { id: 'raincoat', name: 'Płaszcz przeciwdeszczowy', icon: '🥼', cat: 'cloth', slot: 'body', water: 0.7, warmth: 30, dur: 2400, durKind: 'time' },
  { id: 'summer_vest', name: 'Przewiewna kamizelka', icon: '🦺', cat: 'cloth', slot: 'body', cool: 120, dur: 2400, durKind: 'time' },
  { id: 'goggles', name: 'Gogle pustynne', icon: '🥽', cat: 'cloth', slot: 'head', cool: 30, desc: 'Chronią przed burzą piaskową.', dur: 2400, durKind: 'time' },
  { id: 'backpack', name: 'Plecak', icon: '🎒', cat: 'cloth', slot: 'back', slots: 8, stack: 1 },
  { id: 'big_backpack', name: 'Duży plecak', icon: '🧳', cat: 'cloth', slot: 'back', slots: 12, stack: 1 },
  { id: 'wing_pack', name: 'Lotnia z błon', icon: '🪁', cat: 'cloth', slot: 'back', speed: 1.2, slots: 4, stack: 1 },

  // --- Mikstury i leczenie ---
  { id: 'bandage', name: 'Bandaż z trawy', icon: '🩹', cat: 'potion', stack: 20, effect: 'heal20' },
  { id: 'silk_bandage', name: 'Opatrunek z jedwabiu', icon: '🩹', cat: 'potion', stack: 20, effect: 'heal40' },
  { id: 'health_potion', name: 'Mikstura zdrowia', icon: '❤️‍🩹', cat: 'potion', stack: 10, effect: 'heal75' },
  { id: 'sanity_potion', name: 'Eliksir poczytalności', icon: '🧠', cat: 'potion', stack: 10, effect: 'sanity60' },
  { id: 'speed_potion', name: 'Eliksir szybkości', icon: '💨', cat: 'potion', stack: 10, effect: 'speed' },
  { id: 'fire_potion', name: 'Ognisty napar', icon: '🌶️', cat: 'potion', stack: 10, effect: 'warm' },
  { id: 'frost_potion', name: 'Mroźny napar', icon: '🧊', cat: 'potion', stack: 10, effect: 'cool' },
  { id: 'fertilizer', name: 'Nawóz', icon: '💩', cat: 'misc', stack: 20, effect: 'fertilize', desc: 'Kliknij grządkę, aby przyspieszyć wzrost.' },
  { id: 'thermal_stone', name: 'Termokamień', icon: '🥌', cat: 'misc', stack: 1, desc: 'Gdy jest w ekwipunku, temperatura ciała zmienia się o 50% wolniej.' },

  // --- Łupy bossów ---
  { id: 'queen_silk', name: 'Królewski jedwab', icon: '👑', cat: 'boss', stack: 10 },
  { id: 'frost_antler', name: 'Mroźne poroże', icon: '🦌', cat: 'boss', stack: 10 },
  { id: 'storm_feather', name: 'Pióro Burzy', icon: '🌩️', cat: 'boss', stack: 10 },
  { id: 'sand_heart', name: 'Serce Piasku', icon: '🏜️', cat: 'boss', stack: 10 },
  { id: 'mother_claw', name: 'Pazur Matkokreta', icon: '🦾', cat: 'boss', stack: 10 },
  { id: 'core_fragment', name: 'Fragment Rdzenia', icon: '🔷', cat: 'boss', stack: 10 },
];

export const ITEMS: Record<string, ItemDef> = {};
for (const it of I) {
  if (it.stack === undefined) {
    it.stack = it.slot || it.dur ? 1 : 40;
  }
  ITEMS[it.id] = it;
}

export function itemName(id: string) {
  return ITEMS[id]?.name ?? id;
}
export function itemIcon(id: string) {
  return ITEMS[id]?.icon ?? '❔';
}
