// Questy: samouczek, fabuła, postacie, wioska, odkrywanie, cele serwerowe.

export type GoalKind = 'gather' | 'craft' | 'build' | 'kill' | 'visit' | 'talk' | 'survive' | 'deliver' | 'boss' | 'read' | 'activate' | 'eat' | 'cook' | 'contribute';

export interface Goal { k: GoalKind; t: string; n: number; label: string }
export interface QuestDef {
  id: string;
  title: string;
  desc: string;
  type: 'tutorial' | 'story' | 'char' | 'npc' | 'explore' | 'server' | 'daily';
  scope: 'player' | 'world';
  req?: string[];
  char?: string;
  giver?: string; // 'elder' = trzeba porozmawiać z NPC, brak = automatycznie
  goals: Goal[];
  rewards: { items?: [string, number][]; recipes?: string[]; msg?: string; flag?: string };
  turnIn?: string; // komu oddać (deliver)
}

const Q: QuestDef[] = [
  // ===== Samouczek =====
  { id: 'tut1', title: 'Pierwsze kroki', type: 'tutorial', scope: 'player', desc: 'Rozejrzyj się. Zbierz gałązki z krzaczków i krzemienie leżące na ziemi (kliknij je lub naciśnij Spację w pobliżu).',
    goals: [{ k: 'gather', t: 'twig', n: 4, label: 'Zbierz gałązki' }, { k: 'gather', t: 'flint', n: 2, label: 'Zbierz krzemień' }, { k: 'gather', t: 'grass', n: 4, label: 'Zbierz trawę' }],
    rewards: { items: [['berries', 3]], msg: 'Dobra robota! Teraz zrób siekierę.' } },
  { id: 'tut2', title: 'Ostrze z krzemienia', type: 'tutorial', scope: 'player', req: ['tut1'], desc: 'Otwórz menu craftingu (C) i zrób siekierę. Załóż ją (kliknij w ekwipunku) i zetnij drzewo.',
    goals: [{ k: 'craft', t: 'axe', n: 1, label: 'Zrób siekierę' }, { k: 'gather', t: 'log', n: 4, label: 'Zdobądź kłody' }],
    rewards: { items: [['grass', 4]], msg: 'Słońce zachodzi szybciej niż myślisz...' } },
  { id: 'tut3', title: 'Ogień przed zmrokiem', type: 'tutorial', scope: 'player', req: ['tut2'], desc: 'W ciemności czai się coś, co zabija. Rozpal ognisko i zrób pochodnię.',
    goals: [{ k: 'build', t: 'campfire', n: 1, label: 'Postaw ognisko' }, { k: 'craft', t: 'torch', n: 1, label: 'Zrób pochodnię' }],
    rewards: { items: [['log', 2]], msg: 'Pamiętaj: nigdy nie stój w zupełnej ciemności!' } },
  { id: 'tut4', title: 'Pierwsza noc', type: 'tutorial', scope: 'player', req: ['tut3'], desc: 'Przetrwaj do kolejnego dnia. Jedz, gdy pasek głodu spada.',
    goals: [{ k: 'survive', t: '*', n: 1, label: 'Przetrwaj noc' }, { k: 'eat', t: '*', n: 2, label: 'Zjedz coś' }],
    rewards: { items: [['gold', 1]], msg: 'Przeżyłeś! Teraz pora na prawdziwy obóz.' } },
  { id: 'tut5', title: 'Warsztat', type: 'tutorial', scope: 'player', req: ['tut4'], desc: 'Kilofem rozbij głazy, by zdobyć kamień i złoto. Zrób deski i postaw Warsztat Majsterkowicza – odblokuje nowe receptury.',
    goals: [{ k: 'craft', t: 'pickaxe', n: 1, label: 'Zrób kilof' }, { k: 'gather', t: 'stone', n: 4, label: 'Zdobądź kamień' }, { k: 'build', t: 'workbench', n: 1, label: 'Postaw Warsztat' }],
    rewards: { items: [['rope', 2], ['board', 2]], msg: 'Stoły rzemieślnicze odblokowują nowe receptury, gdy stoisz obok nich.' } },

  // ===== Fabuła (wspólna dla świata) =====
  { id: 'act1', title: 'Akt I: Przebudzenie', type: 'story', scope: 'world', desc: 'Obudziliście się przy dziwnym kamiennym portalu. Rozbijcie pierwszy obóz i przetrwajcie 3 dni.',
    goals: [{ k: 'survive', t: '*', n: 3, label: 'Przetrwajcie 3 dni' }, { k: 'build', t: 'workbench', n: 1, label: 'Zbudujcie Warsztat' }, { k: 'build', t: 'chest', n: 1, label: 'Zbudujcie skrzynię' }],
    rewards: { items: [['blueprint:maptable', 1]], msg: 'Na portalu pojawiają się runy... wskazują na kamienne kręgi.' } },
  { id: 'act2', title: 'Akt II: Pierwszy obóz', type: 'story', scope: 'world', req: ['act1'], desc: 'Obóz musi stać się bazą. Postawcie Kuźnię, grządkę i porozmawiajcie z mieszkańcami wioski.',
    goals: [{ k: 'build', t: 'forge', n: 1, label: 'Zbudujcie Kuźnię' }, { k: 'build', t: 'farm', n: 1, label: 'Załóżcie grządkę' }, { k: 'talk', t: 'elder', n: 1, label: 'Porozmawiajcie z Wodzem Chrumciem' }],
    rewards: { items: [['iron_ingot', 4], ['gear', 2]], msg: 'Wódz mówi o kręgach z czasów Prastarych.' } },
  { id: 'act3', title: 'Akt III: Tajemnica kręgów', type: 'story', scope: 'world', req: ['act2'], desc: 'Odnajdźcie 4 kamienne kręgi i aktywujcie je (kliknij krąg). Pozwolą na szybką podróż.',
    goals: [{ k: 'activate', t: 'stone_circle', n: 4, label: 'Aktywujcie kręgi' }],
    rewards: { items: [['crystal', 4]], msg: 'Kręgi pokazują wizję: trzy bestie pór roku strzegą fragmentów Rdzenia.' } },
  { id: 'act4', title: 'Akt IV: Strażnicy pór roku', type: 'story', scope: 'world', req: ['act3'], desc: 'Pokonajcie Mroźnorożca (zima), Burzogawędzia (wiosna, gniazdo na łąkach) i Piaskowego Tytana (lato, pustynia). Każdy ma Fragment Rdzenia.',
    goals: [{ k: 'boss', t: 'frostdeer', n: 1, label: 'Pokonajcie Mroźnorożca' }, { k: 'boss', t: 'stormgoose', n: 1, label: 'Pokonajcie Burzogawędzia' }, { k: 'boss', t: 'sandtitan', n: 1, label: 'Pokonajcie Piaskowego Tytana' }],
    rewards: { items: [['essence', 4]], msg: 'Fragmenty rezonują. Na Ołtarzu Cienia można z nich wykuć Klucz Prastarych.' } },
  { id: 'act5', title: 'Akt V: Wejście do ruin', type: 'story', scope: 'world', req: ['act4'], desc: 'Wykujcie Klucz Prastarych i dotrzyjcie do Starożytnego Rdzenia w ruinach.',
    goals: [{ k: 'craft', t: 'ancient_key', n: 1, label: 'Wykujcie Klucz Prastarych' }, { k: 'activate', t: 'ancient_core', n: 1, label: 'Naprawcie Starożytny Rdzeń' }],
    rewards: { msg: 'Rdzeń ożył! Odblokował najpotężniejsze receptury – i Portal Ucieczki.' } },
  { id: 'act6', title: 'Akt VI: Ucieczka', type: 'story', scope: 'world', req: ['act5'], desc: 'Zbudujcie Portal Ucieczki przy Rdzeniu i pokonajcie Strażnika Rdzenia.',
    goals: [{ k: 'build', t: 'escape_portal', n: 1, label: 'Zbudujcie Portal Ucieczki' }, { k: 'boss', t: 'core_guardian', n: 1, label: 'Pokonajcie Strażnika Rdzenia' }],
    rewards: { flag: 'victory', msg: 'Portal się otwiera. Jesteście wolni! (Możecie grać dalej w tym świecie.)' } },

  // ===== Wioska Chrumków (NPC) =====
  { id: 'npc_meat', title: 'Głodna wioska', type: 'npc', scope: 'player', giver: 'elder', desc: 'Wódz Chrumcio prosi o 4 kawałki mięsa dla wioski.',
    goals: [{ k: 'deliver', t: 'meat', n: 4, label: 'Przynieś 4 mięsa' }], rewards: { items: [['gold', 6], ['blueprint:vault', 1]] } },
  { id: 'npc_spiders', title: 'Plaga pająków', type: 'npc', scope: 'player', giver: 'elder', req: ['npc_meat'], desc: 'Pająki z lasu napadają na Chrumków. Pokonaj 8 pająków.',
    goals: [{ k: 'kill', t: 'spider', n: 8, label: 'Pokonaj pająki' }], rewards: { items: [['gold', 8], ['silk_bandage', 3]] } },
  { id: 'npc_bridge', title: 'Odbudowa mostu', type: 'npc', scope: 'player', giver: 'elder', req: ['npc_spiders'], desc: 'Wioska potrzebuje drewna i lin, aby odbudować most przez rzekę.',
    goals: [{ k: 'deliver', t: 'board', n: 10, label: 'Przynieś 10 desek' }, { k: 'deliver', t: 'rope', n: 5, label: 'Przynieś 5 lin' }], rewards: { items: [['seeds', 8], ['pumpkin', 2], ['gear', 2]] } },
  { id: 'npc_merms', title: 'Ryboczłeki z bagien', type: 'npc', scope: 'player', giver: 'elder', req: ['npc_bridge'], desc: 'Ryboczłeki kradną ryby. Daj im nauczkę.',
    goals: [{ k: 'kill', t: 'merm', n: 5, label: 'Pokonaj ryboczłeki' }], rewards: { items: [['gold_ingot', 3], ['blueprint:golem_core', 1]] } },
  { id: 'npc_queen', title: 'Matka wszystkich pająków', type: 'npc', scope: 'player', giver: 'elder', req: ['npc_merms'], desc: 'W głębi lasu żyje Królowa Pająków. Pokonaj ją!',
    goals: [{ k: 'boss', t: 'queen', n: 1, label: 'Pokonaj Królową Pająków' }], rewards: { items: [['gold_ingot', 6], ['health_potion', 3]] } },
  { id: 'npc_mole', title: 'Trzęsienia ziemi', type: 'npc', scope: 'player', giver: 'elder', req: ['npc_bridge'], desc: 'W kamiennych pustkowiach coś ryje pod ziemią. Znajdź kopiec Matkokreta.',
    goals: [{ k: 'boss', t: 'mothermole', n: 1, label: 'Pokonaj Matkokreta' }], rewards: { items: [['gold_ingot', 4], ['crystal', 4]] } },
  { id: 'npc_flowers', title: 'Kwiaty dla wodza', type: 'npc', scope: 'player', giver: 'elder', desc: 'Wódz ma urodziny. Przynieś mu wianek.',
    goals: [{ k: 'deliver', t: 'garland', n: 1, label: 'Przynieś wianek' }], rewards: { items: [['sanity_potion', 2], ['gold', 3]] } },

  // ===== Odkrywanie =====
  { id: 'ex_biomes', title: 'Kartograf', type: 'explore', scope: 'player', desc: 'Odwiedź każdy biom wyspy.',
    goals: [
      { k: 'visit', t: 'forest', n: 1, label: 'Las iglasty' }, { k: 'visit', t: 'swamp', n: 1, label: 'Bagna' }, { k: 'visit', t: 'rocky', n: 1, label: 'Kamienne pustkowia' },
      { k: 'visit', t: 'savanna', n: 1, label: 'Sawanna' }, { k: 'visit', t: 'desert', n: 1, label: 'Pustynia' }, { k: 'visit', t: 'mushroom', n: 1, label: 'Grzybowy las' },
      { k: 'visit', t: 'beach', n: 1, label: 'Wybrzeże' }, { k: 'visit', t: 'ruins', n: 1, label: 'Ruiny' }],
    rewards: { items: [['compass', 1], ['big_backpack', 1]] } },
  { id: 'ex_notes', title: 'Zapiski poprzedników', type: 'explore', scope: 'player', desc: 'Na wyspie leżą notatki ludzi, którzy byli tu przed wami. Przeczytaj 6 z nich.',
    goals: [{ k: 'read', t: 'note', n: 6, label: 'Przeczytaj notatki' }], rewards: { items: [['blueprint:multitool', 1], ['essence', 2]] } },
  { id: 'ex_shrines', title: 'Pielgrzym', type: 'explore', scope: 'player', desc: 'Pomódl się przy 3 kapliczkach.',
    goals: [{ k: 'activate', t: 'shrine', n: 3, label: 'Odwiedź kapliczki' }], rewards: { items: [['heart', 1], ['sanity_potion', 2]] } },
  { id: 'ex_cook', title: 'Szef kuchni', type: 'explore', scope: 'player', desc: 'Ugotuj 5 dań w Kuchni Polowej.',
    goals: [{ k: 'cook', t: '*', n: 5, label: 'Ugotuj dania' }], rewards: { items: [['bigos', 2]] } },
  { id: 'ex_hunter', title: 'Łowca', type: 'explore', scope: 'player', desc: 'Upoluj 5 roguli i 10 ogarów.',
    goals: [{ k: 'kill', t: 'beefalo', n: 5, label: 'Upoluj rogule' }, { k: 'kill', t: 'hound', n: 10, label: 'Pokonaj ogary' }], rewards: { items: [['fur_coat', 1], ['tooth', 4]] } },

  // ===== Cel serwerowy =====
  { id: 'srv_tower', title: 'Wieża sygnałowa', type: 'server', scope: 'world', req: ['act1'], desc: 'Cała drużyna buduje wieżę przy portalu. Oddawaj materiały przy Portalu (kliknij go).',
    goals: [{ k: 'contribute', t: 'stone', n: 200, label: 'Kamień' }, { k: 'contribute', t: 'board', n: 60, label: 'Deski' }, { k: 'contribute', t: 'gold', n: 20, label: 'Złoto' }],
    rewards: { items: [['blueprint:vault', 1], ['lantern', 1], ['health_potion', 2]], flag: 'tower', msg: 'Wieża sygnałowa stoi! Cała mapa wyspy została odkryta.' } },

  // ===== Questy postaci =====
  { id: 'ch_bruno', title: 'Rodowe kowadło', type: 'char', char: 'bruno', scope: 'player', desc: 'Bruno chce wykuć broń godną przodków.', goals: [{ k: 'build', t: 'forge', n: 1, label: 'Kuźnia' }, { k: 'craft', t: 'sword', n: 1, label: 'Żelazny miecz' }], rewards: { items: [['multitool', 1]] } },
  { id: 'ch_ilma', title: 'Zielnik', type: 'char', char: 'ilma', scope: 'player', desc: 'Ilma kompletuje zielnik wyspy.', goals: [{ k: 'gather', t: 'petals', n: 10, label: 'Płatki' }, { k: 'gather', t: 'mushroom', n: 5, label: 'Grzyby' }, { k: 'gather', t: 'cactus_flesh', n: 3, label: 'Kaktus' }], rewards: { items: [['fertilizer', 6], ['health_potion', 3]] } },
  { id: 'ch_grot', title: 'Rozkaz: oczyścić teren', type: 'char', char: 'grot', scope: 'player', desc: 'Stare nawyki – Grot patroluje okolice.', goals: [{ k: 'kill', t: 'spider', n: 10, label: 'Pająki' }, { k: 'kill', t: 'hound', n: 6, label: 'Ogary' }], rewards: { items: [['helmet_iron', 1], ['armor_scale', 1]] } },
  { id: 'ch_mira', title: 'Światło w mroku', type: 'char', char: 'mira', scope: 'player', desc: 'Mira chce rozświetlić wyspę.', goals: [{ k: 'build', t: 'campfire', n: 3, label: 'Ogniska' }, { k: 'gather', t: 'glowberry', n: 6, label: 'Świetliste jagody' }], rewards: { items: [['lantern', 1]] } },
  { id: 'ch_tomasz', title: 'Wielki wynalazek', type: 'char', char: 'tomasz', scope: 'player', desc: 'Tomasz chce zbudować pierwszą maszynę na wyspie.', goals: [{ k: 'build', t: 'furnace', n: 1, label: 'Piec hutniczy' }, { k: 'gather', t: 'gear', n: 3, label: 'Tryby' }], rewards: { items: [['blueprint:golem_core', 1], ['gear', 4]] } },
  { id: 'ch_ruda', title: 'Zew pełni', type: 'char', char: 'ruda', scope: 'player', desc: 'Ruda tropi zwierzynę.', goals: [{ k: 'kill', t: 'rabbit', n: 6, label: 'Skoczki' }, { k: 'kill', t: 'beefalo', n: 2, label: 'Rogule' }], rewards: { items: [['bow', 1], ['arrow', 20]] } },
];

export const QUESTS: Record<string, QuestDef> = {};
for (const q of Q) QUESTS[q.id] = q;

// Szablony codziennych zleceń (Tablica ogłoszeń)
export const DAILY_TEMPLATES: { k: GoalKind; t: string; n: [number, number]; label: string; reward: [string, number][] }[] = [
  { k: 'gather', t: 'log', n: [15, 30], label: 'Zetnij drzewa (kłody)', reward: [['gold', 2]] },
  { k: 'gather', t: 'stone', n: [10, 25], label: 'Wydobądź kamień', reward: [['gold', 2]] },
  { k: 'gather', t: 'grass', n: [15, 25], label: 'Zbierz trawę', reward: [['seeds', 3]] },
  { k: 'kill', t: 'spider', n: [3, 6], label: 'Pokonaj pająki', reward: [['silk', 4], ['gold', 1]] },
  { k: 'kill', t: 'rabbit', n: [2, 4], label: 'Upoluj skoczki', reward: [['meat_cooked', 2]] },
  { k: 'craft', t: 'rope', n: [3, 6], label: 'Upleć liny', reward: [['gold', 1]] },
  { k: 'craft', t: 'torch', n: [2, 4], label: 'Zrób pochodnie', reward: [['glowberry', 2]] },
  { k: 'cook', t: '*', n: [2, 3], label: 'Ugotuj dania', reward: [['gold', 3]] },
  { k: 'gather', t: 'berries', n: [10, 20], label: 'Nazbieraj jagód', reward: [['jam', 1]] },
  { k: 'gather', t: 'iron_ore', n: [4, 8], label: 'Wydobądź rudę żelaza', reward: [['gold_ingot', 1]] },
  { k: 'kill', t: 'hound', n: [2, 5], label: 'Pokonaj ogary', reward: [['tooth', 2], ['gold', 2]] },
];

// Notatki fabularne
export const NOTES: string[] = [
  'Dzień 3. Ogień to życie. W ciemności coś na mnie patrzyło i miało ZĘBY.',
  'Chrumki z wioski są przyjazne, jeśli dasz im mięso. Wódz pamięta czasy Prastarych.',
  'Kręgi z kamienia brzęczą, gdy ktoś stoi w środku. Myślę, że kiedyś służyły do podróży.',
  'Zima przyszła nagle. Ogromny jeleń z lodu rozbił mój obóz. Na jego czole świeciło coś niebieskiego.',
  'Pustynia latem zabija upałem. Coś wielkiego pływa pod piaskiem jak w wodzie.',
  'Prastarzy zbudowali Rdzeń, by zamknąć ten świat. Trzy fragmenty, trzy pory roku, trzy bestie.',
  'Jeśli czytasz to w grzybowym lesie – uciekaj przed zmrokiem. Nietoperze.',
  'Wiosną burze są wściekłe. Ptak, który je sprowadza, gnieździ się na łąkach.',
  'Nie trać zmysłów. Kiedy poczytalność spada, cienie stają się prawdziwe.',
  'Ostatni wpis: zbudowałem portal przy Rdzeniu. Strażnik się budzi. Jeśli zawiodę – spróbuj ty.',
];
