import type { WorldView } from '@game/shared';

/** Высота спрайтов зверей в единицах мира. */
const ANIMAL_SIZE: Record<string, number> = { deer: 69, mammoth: 117, wolf: 51, tiger: 57 };

/** Найти сущность под точкой мира. Возвращает её id или null. */
export function pickAt(
  w: WorldView,
  x: number,
  y: number,
  opts: { ownUnitsOnly?: boolean; myTribe?: string; canSee?: (id: string) => boolean } = {},
): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  const consider = (id: string, cx: number, cy: number, r: number, bias = 0) => {
    const d = Math.hypot(x - cx, y - cy);
    // в тумане ничего не выбрать и не атаковать
    if (d <= r && opts.canSee && !opts.canSee(id)) return;
    if (d > r) return;
    const score = d / r + bias;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  };
  for (const u of w.units.values()) {
    if (opts.ownUnitsOnly && u.tribe !== opts.myTribe) continue;
    const s = u.kind === 'child' ? 0.72 : 1;
    consider(u.id, u.x, u.y - 30 * s, 28 * s);
  }
  if (opts.ownUnitsOnly) return best;
  for (const a of w.animals.values()) {
    const size = ANIMAL_SIZE[a.kind] ?? 40;
    consider(a.id, a.x, a.y - size * 0.45, size * 0.55);
  }
  for (const b of w.buildings.values()) consider(b.id, b.x, b.y - 55, 62, 0.2);
  // ратуша: от точки сдачи добычи до крыши
  for (const t of w.tribes.values()) consider(t.id, t.x, t.y - 70, 90, 0.3);
  for (const r of w.resources.values()) {
    if (r.kind === 'tree') consider(r.id, r.x, r.y - (r.amount < 1 ? 10 : 110), r.amount < 1 ? 20 : 70, 0.45);
    else consider(r.id, r.x, r.y - 20, 34, 0.4);
  }
  return best;
}
