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
    skin: 0xe8dcc8, hair: 0x7a2e14, cloth: 0x4a3424, cloth2: 0x2a221a, feature: 'beard', start: [['flint', 2], ['twig', 2]] },
  { id: 'ilma', name: 'Ilma Zielarka', title: 'zielarka z bagien', desc: 'Szczupła, w zielonym kapturze, pachnie ziołami.',
    perk: 'Robi mikstury bez Pracowni, uprawy rosną jej szybciej.', flaw: 'Tylko 100 zdrowia.',
    hp: 100, hunger: 150, sanity: 200, speed: 1, dmgMul: 0.9, armorBonus: 0, hungerMul: 1, farmBonus: 1.5,
    skin: 0xe2d8c4, hair: 0x241a12, cloth: 0x34442a, cloth2: 0x22261a, feature: 'hood', start: [['seeds', 4], ['petals', 2]] },
  { id: 'grot', name: 'Kapral Grot', title: 'były żołnierz', desc: 'Barczysty, w pogiętym hełmie, z blizną przez policzek.',
    perk: '+25% obrażeń i +10% pancerza.', flaw: 'Głodnieje o 30% szybciej.',
    hp: 175, hunger: 150, sanity: 150, speed: 1, dmgMul: 1.25, armorBonus: 0.1, hungerMul: 1.3,
    skin: 0xdccdb6, hair: 0x1a1a1a, cloth: 0x3a3e2c, cloth2: 0x26261e, feature: 'helmet', start: [['meat_cooked', 2]] },
  { id: 'mira', name: 'Mira Świetlik', title: 'dziewczyna z lampą', desc: 'Drobna, z warkoczem i małą latarenką przy pasie.',
    perk: 'Ma własne słabe światło, ciemność mniej ją przeraża.', flaw: 'Deszcz bardzo obniża jej poczytalność.',
    hp: 125, hunger: 150, sanity: 200, speed: 1.05, dmgMul: 1, armorBonus: 0, hungerMul: 1, ownLight: 3.5, darkSanityMul: 0.5, rainSanityMul: 2.5,
    skin: 0xf0e6d6, hair: 0xb89a4a, cloth: 0x2a3044, cloth2: 0x1c1e26, feature: 'lantern', start: [['glowberry', 2]] },
  { id: 'tomasz', name: 'Tomasz Mechanik', title: 'wynalazca', desc: 'Wysoki, chudy, w goglach i fartuchu z kieszeniami.',
    perk: 'Maszyny kosztują 30% mniej, ma własne receptury.', flaw: 'Nie może jeść surowego mięsa.',
    hp: 150, hunger: 150, sanity: 175, speed: 1, dmgMul: 1, armorBonus: 0, hungerMul: 1, noRawMeat: true,
    craftDiscount: { cats: ['machines'], mul: 0.7 },
    skin: 0xe6dccc, hair: 0x2e2018, cloth: 0x5a4632, cloth2: 0x222020, feature: 'goggles', start: [['gold', 1]] },
  { id: 'ruda', name: 'Wilczyca Ruda', title: 'zmiennokształtna łowczyni', desc: 'Dzika, rudowłosa, z wilczymi uszami.',
    perk: 'W pełnię księżyca zmienia się w wilka: szybsza i silniejsza.', flaw: 'Jako wilk nie może craftować.',
    hp: 150, hunger: 175, sanity: 150, speed: 1.05, dmgMul: 1.1, armorBonus: 0, hungerMul: 1.1, werewolf: true,
    skin: 0xe0d2be, hair: 0x7a2410, cloth: 0x3e2418, cloth2: 0x1e1612, feature: 'ears', start: [['small_meat_cooked', 2]] },
];

export const CHAR: Record<string, CharDef> = {};
for (const c of CHARACTERS) CHAR[c.id] = c;
