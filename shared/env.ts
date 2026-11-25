// Czas, pory dnia, pory roku i temperatury – wspólne dla klienta i serwera.

export const SEASONS = ['autumn', 'winter', 'spring', 'summer'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_NAMES: Record<Season, string> = { autumn: 'Jesień', winter: 'Zima', spring: 'Wiosna', summer: 'Lato' };
// [koniec dnia, koniec zmierzchu] jako ułamek doby
export const PHASES: Record<Season, [number, number]> = {
  autumn: [0.5, 0.7],
  winter: [0.38, 0.56],
  spring: [0.5, 0.7],
  summer: [0.62, 0.76],
};
export const AMBIENT: Record<Season, [number, number]> = {
  autumn: [26, 12],
  winter: [-6, -22],
  spring: [20, 9],
  summer: [74, 44],
};

export interface Clock {
  day: number;
  frac: number;
  season: Season;
  seasonIdx: number;
  seasonDay: number;
  phase: 'day' | 'dusk' | 'night';
  moon: number; // 0..9, 5 = pełnia
  light: number; // 0..1 jasność otoczenia
  year: number;
}

export function clock(time: number, dayLen: number, seasonLen: number): Clock {
  const day = Math.floor(time / dayLen) + 1;
  const frac = (time % dayLen) / dayLen;
  const sIdxAbs = Math.floor((day - 1) / seasonLen);
  const seasonIdx = sIdxAbs % 4;
  const season = SEASONS[seasonIdx];
  const seasonDay = ((day - 1) % seasonLen) + 1;
  const [d, k] = PHASES[season];
  const phase = frac < d ? 'day' : frac < k ? 'dusk' : 'night';
  let light: number;
  if (frac < 0.06) light = 0.15 + (frac / 0.06) * 0.85; // świt
  else if (frac < d) light = 1;
  else if (frac < k) light = 1 - ((frac - d) / (k - d)) * 0.85;
  else light = 0.15 - Math.min(1, (frac - k) / 0.05) * 0.15;
  const moon = (day - 1) % 10;
  return { day, frac, season, seasonIdx, seasonDay, phase, moon, light: Math.max(0, light), year: Math.floor(sIdxAbs / 4) };
}

export const BASE_SPEED = 4.2;
