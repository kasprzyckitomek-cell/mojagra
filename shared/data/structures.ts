// Budowle, stoły rzemieślnicze i maszyny.

export interface StructDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  radius: number; // promień kolizji / zajętości
  block?: boolean; // blokuje ruch
  station?: string; // id stołu rzemieślniczego
  level?: number;
  light?: number; // promień światła (przy paliwie / zasilaniu)
  fuelMax?: number; // sekundy
  fuelStart?: number;
  heat?: number; // ciepło w promieniu
  slots?: number; // pojemność kontenera
  spoilMul?: number; // mnożnik psucia w kontenerze
  power?: number; // + produkcja / - zużycie
  machine?: string; // rodzaj zachowania maszyny
  flammable?: boolean;
  cook?: boolean; // można piec przy nim
  floor?: number; // podłoga: bonus prędkości
  desc?: string;
  upgradeOf?: string;
  sleep?: boolean;
  uses?: number;
}

const S: StructDef[] = [
  // --- Ogień i światło ---
  { id: 'campfire', name: 'Ognisko', icon: '🔥', hp: 50, radius: 0.8, light: 10, fuelMax: 180, fuelStart: 120, heat: 6, cook: true, flammable: false, desc: 'Daje światło i ciepło. Dorzucaj paliwo (kliknij z paliwem w ręce lub PPM).' },
  { id: 'firepit', name: 'Kamienne palenisko', icon: '🪔', hp: 300, radius: 1, block: true, light: 12, fuelMax: 300, fuelStart: 150, heat: 7, cook: true, desc: 'Trwałe ognisko. Nie gaśnie na zawsze.' },
  { id: 'lamp', name: 'Latarnia elektryczna', icon: '💡', hp: 200, radius: 0.4, block: true, light: 13, power: -1, machine: 'lamp', desc: 'Świeci, gdy ma zasilanie.' },

  // --- Stoły rzemieślnicze ---
  { id: 'workbench', name: 'Warsztat Majsterkowicza', icon: '🛠️', hp: 300, radius: 1.1, block: true, station: 'workbench', level: 1, flammable: true },
  { id: 'forge', name: 'Kuźnia z Kowadłem', icon: '⚒️', hp: 600, radius: 1.3, block: true, station: 'forge', level: 1, light: 4, heat: 4 },
  { id: 'forge2', name: 'Kuźnia Mistrzowska', icon: '🏭', hp: 900, radius: 1.4, block: true, station: 'forge', level: 2, light: 5, heat: 5, upgradeOf: 'forge' },
  { id: 'kitchen', name: 'Kuchnia Polowa', icon: '🍲', hp: 300, radius: 1.1, block: true, station: 'kitchen', level: 1, slots: 4, light: 3, heat: 3, machine: 'kitchen', desc: 'Włóż 4 składniki i kliknij Gotuj.' },
  { id: 'loom', name: 'Krosno Krawieckie', icon: '🧵', hp: 300, radius: 1.1, block: true, station: 'loom', level: 1, flammable: true },
  { id: 'alchemy', name: 'Pracownia Alchemika', icon: '⚗️', hp: 400, radius: 1.1, block: true, station: 'alchemy', level: 1, light: 3 },
  { id: 'maptable', name: 'Stół Kartografa', icon: '🗺️', hp: 300, radius: 1.1, block: true, station: 'cartography', level: 1, flammable: true, desc: 'Łączy mapy całej drużyny i odblokowuje kręgi teleportu.' },
  { id: 'mechbench', name: 'Warsztat Mechanika', icon: '🔧', hp: 600, radius: 1.3, block: true, station: 'mechanic', level: 1 },
  { id: 'shadow_altar', name: 'Ołtarz Cienia', icon: '🕯️', hp: 800, radius: 1.3, block: true, station: 'shadow', level: 1, light: 4 },
  { id: 'escape_portal', name: 'Portal Ucieczki', icon: '🌀', hp: 5000, radius: 2.5, block: true, light: 10, desc: 'Ostatnia budowla. Obudzi Strażnika Rdzenia.' },

  // --- Przechowywanie ---
  { id: 'chest', name: 'Skrzynia', icon: '📦', hp: 150, radius: 0.6, block: true, slots: 9, flammable: true },
  { id: 'big_chest', name: 'Duża skrzynia', icon: '🗃️', hp: 300, radius: 0.8, block: true, slots: 18, flammable: true },
  { id: 'vault', name: 'Skarbiec', icon: '🏦', hp: 800, radius: 0.9, block: true, slots: 27 },
  { id: 'icebox', name: 'Lodówka', icon: '🧊', hp: 200, radius: 0.6, block: true, slots: 9, spoilMul: 0.5, power: -1, machine: 'fridge', desc: 'Spowalnia psucie o 50%, z zasilaniem o 75%.' },

  // --- Ściany i podłogi ---
  { id: 'wall_hay', name: 'Ściana z siana', icon: '🟨', hp: 100, radius: 0.55, block: true, flammable: true },
  { id: 'wall_wood', name: 'Drewniana palisada', icon: '🟫', hp: 250, radius: 0.55, block: true, flammable: true },
  { id: 'wall_stone', name: 'Kamienny mur', icon: '⬜', hp: 500, radius: 0.55, block: true },
  { id: 'wall_metal', name: 'Metalowa ściana', icon: '⬛', hp: 1000, radius: 0.55, block: true },
  { id: 'gate', name: 'Brama', icon: '🚪', hp: 300, radius: 0.6, block: true, flammable: true, desc: 'Kliknij, aby otworzyć/zamknąć.' },
  { id: 'floor_wood', name: 'Drewniana podłoga', icon: '🟤', hp: 100, radius: 1, floor: 1.1, flammable: true },
  { id: 'floor_cobble', name: 'Brukowana droga', icon: '🔳', hp: 100, radius: 1, floor: 1.3 },
  { id: 'floor_carpet', name: 'Dywan', icon: '🟥', hp: 100, radius: 1, floor: 1.1, flammable: true },

  // --- Farma i jedzenie ---
  { id: 'farm', name: 'Grządka', icon: '🌱', hp: 100, radius: 1, machine: 'farm', desc: 'Kliknij z nasionami, aby zasadzić. Rośnie ~2 dni.' },
  { id: 'drying_rack', name: 'Suszarka', icon: '🥓', hp: 100, radius: 0.7, block: true, slots: 3, machine: 'dryer', flammable: true, desc: 'Włóż mięso, po 1 dniu będzie suszone (nie w deszczu).' },
  { id: 'smokehouse', name: 'Wędzarnia', icon: '🏚️', hp: 300, radius: 1, block: true, slots: 6, machine: 'smoker', fuelMax: 300, fuelStart: 0, desc: 'Wędzi mięso 2x szybciej niż suszarka. Wymaga paliwa.' },
  { id: 'tent', name: 'Namiot', icon: '⛺', hp: 200, radius: 1.2, block: true, sleep: true, uses: 8, flammable: true, desc: 'Śpij w nocy: odnawia zdrowie i poczytalność.' },
  { id: 'quest_board', name: 'Tablica ogłoszeń', icon: '📋', hp: 150, radius: 0.6, block: true, flammable: true, desc: 'Codzienne zlecenia dla drużyny.' },
  { id: 'weather_station', name: 'Stacja meteorologiczna', icon: '🌡️', hp: 200, radius: 0.6, block: true, desc: 'Pokazuje prognozę pogody wszystkim graczom.' },
  { id: 'rod_lightning', name: 'Piorunochron', icon: '⚡', hp: 300, radius: 0.4, block: true, desc: 'Łapie pioruny w promieniu 20 m.' },
  { id: 'res_altar', name: 'Ołtarz wskrzeszenia', icon: '⛩️', hp: 300, radius: 0.9, block: true, desc: 'Duch, który go dotknie, wraca do życia. Jednorazowy.' },
  { id: 'scarecrow', name: 'Strach na wróble', icon: '🎎', hp: 100, radius: 0.5, block: true, flammable: true, desc: 'Odstrasza ptaki-złodzieje i dodaje poczytalności w pobliżu.' },

  // --- Maszyny ---
  { id: 'furnace', name: 'Piec hutniczy', icon: '🧱', hp: 500, radius: 1, block: true, slots: 3, machine: 'furnace', fuelMax: 600, fuelStart: 0, light: 4, heat: 5, desc: 'Wytapia rudy w sztabki i piasek w szkło. Wymaga paliwa.' },
  { id: 'generator', name: 'Generator węglowy', icon: '🔋', hp: 400, radius: 1, block: true, power: 10, machine: 'generator', fuelMax: 900, fuelStart: 0, desc: 'Daje 10 energii, spala paliwo. Zasięg sieci 16 m.' },
  { id: 'windmill', name: 'Wiatrak', icon: '🌬️', hp: 300, radius: 1, block: true, power: 4, machine: 'windmill', desc: '4 energii, w czasie burzy 8.' },
  { id: 'waterwheel', name: 'Koło wodne', icon: '🎡', hp: 300, radius: 1.2, block: true, power: 6, machine: 'waterwheel', desc: '6 energii. Musi stać przy wodzie.' },
  { id: 'solar', name: 'Panel kryształowy', icon: '🔆', hp: 250, radius: 0.8, block: true, power: 5, machine: 'solar', desc: '5 energii w dzień.' },
  { id: 'sawmill', name: 'Tartak', icon: '🪚', hp: 400, radius: 1.1, block: true, slots: 6, power: -3, machine: 'sawmill', desc: 'Zamienia kłody w deski (1 → 2).' },
  { id: 'drill', name: 'Wiertnica', icon: '🛢️', hp: 500, radius: 1.1, block: true, slots: 9, power: -4, machine: 'drill', desc: 'Wydobywa kamień i rudy spod siebie.' },
  { id: 'harvester', name: 'Kombajn', icon: '🚜', hp: 400, radius: 1, block: true, slots: 9, power: -3, machine: 'harvester', desc: 'Zbiera plony z grządek w promieniu 10 m.' },
  { id: 'sprinkler', name: 'Zraszacz', icon: '⛲', hp: 300, radius: 0.6, block: true, power: -2, machine: 'sprinkler', desc: 'Gasi pożary, podlewa grządki i chłodzi w promieniu 10 m.' },
  { id: 'turret', name: 'Wieżyczka obronna', icon: '🗼', hp: 600, radius: 0.8, block: true, power: -3, machine: 'turret', desc: 'Strzela do wrogów w promieniu 14 m.' },
  { id: 'hopper', name: 'Podajnik', icon: '📥', hp: 200, radius: 0.5, block: true, power: -1, machine: 'hopper', desc: 'Przenosi przedmioty z maszyn do najbliższej skrzyni (zasięg 4 m).' },
  { id: 'planted_tree', name: 'Posadzone drzewko', icon: '🌲', hp: 100, radius: 0.5, block: true, machine: 'tree', flammable: true, desc: 'Rośnie ok. 3 dni, potem można je ściąć.' },
  { id: 'golem_core', name: 'Golem roboczy', icon: '🗿', hp: 600, radius: 0.8, block: true, machine: 'golem', desc: 'Przywołuje golema, który ścina drzewa i odnosi drewno do skrzyń.' },
];

export const STRUCTS: Record<string, StructDef> = {};
for (const s of S) STRUCTS[s.id] = s;

export const STATIONS: Record<string, { name: string; icon: string; range: number }> = {
  workbench: { name: 'Warsztat Majsterkowicza', icon: '🛠️', range: 6 },
  forge: { name: 'Kuźnia', icon: '⚒️', range: 6 },
  kitchen: { name: 'Kuchnia Polowa', icon: '🍲', range: 6 },
  loom: { name: 'Krosno Krawieckie', icon: '🧵', range: 6 },
  alchemy: { name: 'Pracownia Alchemika', icon: '⚗️', range: 6 },
  cartography: { name: 'Stół Kartografa', icon: '🗺️', range: 6 },
  mechanic: { name: 'Warsztat Mechanika', icon: '🔧', range: 6 },
  shadow: { name: 'Ołtarz Cienia', icon: '🕯️', range: 6 },
  ancient: { name: 'Starożytny Rdzeń', icon: '💠', range: 8 },
};
