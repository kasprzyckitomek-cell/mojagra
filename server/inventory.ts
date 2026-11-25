// Operacje na ekwipunku i kontenerach.
import { ITEMS } from '../shared/data/items';
import type { Slot } from './types';

export function stackOf(id: string) {
  return ITEMS[id]?.stack ?? 40;
}

export function makeSlot(id: string, n = 1): Slot {
  if (id.startsWith('blueprint:')) return { id: 'blueprint', n: 1, m: id.slice(10) };
  const def = ITEMS[id];
  const s: Slot = { id, n };
  if (def?.dur) s.d = 1;
  if (def?.food?.spoil) s.f = 1;
  return s;
}

export function canMerge(a: Slot, b: Slot) {
  return a.id === b.id && a.d === undefined && b.d === undefined && a.m === b.m && stackOf(a.id) > 1;
}

/** Dodaje przedmiot do listy slotów. Zwraca ile się NIE zmieściło. */
export function addToSlots(slots: (Slot | null)[], item: Slot): number {
  let left = item.n;
  const max = stackOf(item.id);
  if (max > 1 && item.d === undefined) {
    for (const s of slots) {
      if (left <= 0) break;
      if (s && canMerge(s, item) && s.n < max) {
        const k = Math.min(max - s.n, left);
        if (item.f !== undefined && s.f !== undefined) s.f = (s.f * s.n + item.f * k) / (s.n + k);
        s.n += k;
        left -= k;
      }
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (!slots[i]) {
      const k = Math.min(max, left);
      slots[i] = { ...item, n: k };
      left -= k;
    }
  }
  return left;
}

export function countItem(slots: (Slot | null)[], id: string) {
  let c = 0;
  for (const s of slots) if (s && s.id === id) c += s.n;
  return c;
}

export function removeItem(slots: (Slot | null)[], id: string, n: number): boolean {
  if (countItem(slots, id) < n) return false;
  let left = n;
  for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
    const s = slots[i];
    if (s && s.id === id) {
      const k = Math.min(s.n, left);
      s.n -= k;
      left -= k;
      if (s.n <= 0) slots[i] = null;
    }
  }
  return true;
}

export function freeSpaceFor(slots: (Slot | null)[], id: string, n: number) {
  const max = stackOf(id);
  let space = 0;
  for (const s of slots) {
    if (!s) space += max;
    else if (s.id === id && s.d === undefined && max > 1) space += max - s.n;
    if (space >= n) return true;
  }
  return space >= n;
}
