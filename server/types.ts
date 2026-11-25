import type { WebSocket } from 'ws';

export interface Slot { id: string; n: number; d?: number; f?: number; m?: string }

export interface QP { g: number[]; done?: boolean }

export interface Player {
  id: number;
  key: string;
  name: string;
  char: string;
  skin: number;
  ws: WebSocket | null;
  admin: boolean;
  x: number; z: number; r: number;
  hp: number; hunger: number; sanity: number; temp: number; wet: number;
  maxHp: number; maxHunger: number; maxSanity: number;
  inv: (Slot | null)[];
  equip: Record<'hand' | 'head' | 'body' | 'back', Slot | null>;
  known: Set<string>;
  quests: Record<string, QP>;
  tracked: string[];
  ghost: boolean;
  deadAt: number;
  buffs: Record<string, number>;
  status: Record<string, number>;
  actCd: number;
  lastIn: number;
  anim: number;
  animUntil: number;
  sleeping: number; // id namiotu lub 0
  darkT: number;
  contOpen: number;
  chunks: Set<number>;
  chunkKey: number;
  stats: { days: number; kills: number; deaths: number; crafted: number; cooked: number };
  notes: number[];
  shrines: number[];
  shrineCd: number;
  biome: string;
  visited: string[];
  wolf: boolean;
  fishing: { until: number } | null;
  map: Uint8Array;
  dirty: { me: boolean; inv: boolean; known: boolean; quests: boolean };
  lastMeSent: number;
  ach: string[];
  emote: number;
  chatCd: number;
  spd: number;
  joinedAt: number;
}

export interface OS { s: string; t?: number; w?: number }

export interface Struct {
  id: number;
  type: string;
  x: number; z: number; rot: number;
  hp: number;
  owner: string;
  fuel?: number;
  inv?: (Slot | null)[];
  open?: boolean;
  on?: boolean; // włączona/zasilona/świeci
  powered?: boolean;
  prog?: number;
  plant?: string;
  growth?: number;
  watered?: number;
  burning?: number;
  uses?: number;
  cookBy?: string;
  golem?: number;
}

export interface Drop { id: number; item: Slot; x: number; z: number; t: number }

export interface Mob {
  id: number;
  type: string;
  x: number; z: number; r: number;
  hp: number; maxHp: number;
  state: string;
  target: number; // id celu (gracz/mob/struktura)
  tt: number;
  home: { x: number; z: number };
  spawner: number;
  atkCd: number;
  anim: number;
  animUntil: number;
  owner: number; // cienie: id gracza
  leader: number; // chrumki: id gracza, za którym idą
  leaderUntil: number;
  status: Record<string, number>;
  cds: Record<string, number>;
  lastNear: number;
  hidden?: boolean;
  carry?: number;
  core?: number;
  dashUntil?: number;
  dashDir?: [number, number];
  hitSet?: Set<number>;
  scale: number;
}

export interface Proj { id: number; kind: string; x: number; z: number; vx: number; vz: number; dmg: number; owner: number; ownerKind: 'p' | 'm' | 's'; until: number; status?: string }

export interface WorldSettings {
  name: string;
  seed: number;
  size: number;
  sizeName: string;
  dayLength: number;
  seasonLength: number;
  difficulty: 'relax' | 'normal' | 'hardcore';
  pvp: boolean;
  password: string;
  maxPlayers: number;
  resources: number;
  monsters: number;
  raids: number;
  bosses: boolean;
  protect: boolean;
  creator: string;
  created: number;
}
