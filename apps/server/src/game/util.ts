export interface Pt {
  x: number;
  y: number;
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const dist = (a: Pt, b: Pt) => Math.sqrt(dist2(a, b));

export function nearest<T extends Pt>(items: Iterable<T>, from: Pt, filter?: (t: T) => boolean, maxDist = Infinity): T | null {
  let best: T | null = null;
  let bestD = maxDist * maxDist;
  for (const it of items) {
    if (filter && !filter(it)) continue;
    const d = dist2(it, from);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

/** Присвоить поле схемы, только если значение изменилось (меньше лишних патчей). */
export function setIfChanged<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): void {
  if (obj[key] !== value) obj[key] = value;
}
