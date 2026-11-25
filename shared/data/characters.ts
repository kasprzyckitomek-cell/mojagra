// Grywalne postacie: każda ma zaletę i wadę.

export interface CharDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  perk: string;
  flaw: string;
  hp: number;
  hunger: number;
  sanity: number;
  speed: number;
  dmgMul: number;
  armorBonus: number;
  hungerMul: number;
  ownLight?: number;
  rainSanityMul?: number;
  darkSanityMul?: number;
  craftDiscount?: { cats: string[]; mul: number };
  noRawMeat?: boolean;
  werewolf?: boolean;
  farmBonus?: number;
  buildSpeed?: number;
  // wygląd
  skin: number;
  hair: number;
  cloth: number;
  cloth2: number;
  feature: 'beard' | 'hood' | 'helmet' | 'lantern' | 'goggles' | 'ears';
  start: [string, number][];
}

export const CHARACTERS: CharDef[] = [
  { id: 'bruno', name: 'Bruno Kowalik', title: 'krasnoludzki rzemieślnik', desc: 'Niski, krępy, z rudą brodą i pasem pełnym narzędzi.',
    perk: 'Narzędzia i budowle kosztują 25% mniej.', flaw: 'Chodzi 10% wolniej.',
    hp: 150, hunger: 150, sanity: 200, speed: 0.9, dmgMul: 1, armorBonus: 0, hungerMul: 1,
    craftDiscount: { cats: ['tools', 'build'], mul: 0.75 }, buildSpeed: 1.5,
    skin: 0xf0c8a0, hair: 0xc0501a, cloth: 0x6a4a2a, cloth2: 0x9a7a4a, feature: 'beard', start: [['flint', 2], ['twig', 2]] },
  { id: 'ilma', name: 'Ilma Zielarka', title: 'zielarka z bagien', desc: 'Szczupła, w zielonym kapturze, pachnie ziołami.',
    perk: 'Robi mikstury bez Pracowni, uprawy rosną jej szybciej.', flaw: 'Tylko 100 zdrowia.',
    hp: 100, hunger: 150, sanity: 200, speed: 1, dmgMul: 0.9, armorBonus: 0, hungerMul: 1, farmBonus: 1.5,
    skin: 0xe8c0a0, hair: 0x3a2a1a, cloth: 0x3a7a3a, cloth2: 0x8ab04a, feature: 'hood', start: [['seeds', 4], ['petals', 2]] },
  { id: 'grot', name: 'Kapral Grot', title: 'były żołnierz', desc: 'Barczysty, w pogiętym hełmie, z blizną przez policzek.',
    perk: '+25% obrażeń i +10% pancerza.', flaw: 'Głodnieje o 30% szybciej.',
    hp: 175, hunger: 150, sanity: 150, speed: 1, dmgMul: 1.25, armorBonus: 0.1, hungerMul: 1.3,
    skin: 0xd8a888, hair: 0x2a2a2a, cloth: 0x4a5a3a, cloth2: 0x8a8a6a, feature: 'helmet', start: [['meat_cooked', 2]] },
  { id: 'mira', name: 'Mira Świetlik', title: 'dziewczyna z lampą', desc: 'Drobna, z warkoczem i małą latarenką przy pasie.',
    perk: 'Ma własne słabe światło, ciemność mniej ją przeraża.', flaw: 'Deszcz bardzo obniża jej poczytalność.',
    hp: 125, hunger: 150, sanity: 200, speed: 1.05, dmgMul: 1, armorBonus: 0, hungerMul: 1, ownLight: 3.5, darkSanityMul: 0.5, rainSanityMul: 2.5,
    skin: 0xf8d8c0, hair: 0xe0c060, cloth: 0x4060a0, cloth2: 0xf0e0a0, feature: 'lantern', start: [['glowberry', 2]] },
  { id: 'tomasz', name: 'Tomasz Mechanik', title: 'wynalazca', desc: 'Wysoki, chudy, w goglach i fartuchu z kieszeniami.',
    perk: 'Maszyny kosztują 30% mniej, ma własne receptury.', flaw: 'Nie może jeść surowego mięsa.',
    hp: 150, hunger: 150, sanity: 175, speed: 1, dmgMul: 1, armorBonus: 0, hungerMul: 1, noRawMeat: true,
    craftDiscount: { cats: ['machines'], mul: 0.7 },
    skin: 0xf0d0b0, hair: 0x5a3a2a, cloth: 0x8a6a40, cloth2: 0x40a0c0, feature: 'goggles', start: [['gold', 1]] },
  { id: 'ruda', name: 'Wilczyca Ruda', title: 'zmiennokształtna łowczyni', desc: 'Dzika, rudowłosa, z wilczymi uszami.',
    perk: 'W pełnię księżyca zmienia się w wilka: szybsza i silniejsza.', flaw: 'Jako wilk nie może craftować.',
    hp: 150, hunger: 175, sanity: 150, speed: 1.05, dmgMul: 1.1, armorBonus: 0, hungerMul: 1.1, werewolf: true,
    skin: 0xe8b898, hair: 0xb03a1a, cloth: 0x6a3a2a, cloth2: 0x3a2a1a, feature: 'ears', start: [['small_meat_cooked', 2]] },
];

export const CHAR: Record<string, CharDef> = {};
for (const c of CHARACTERS) CHAR[c.id] = c;
