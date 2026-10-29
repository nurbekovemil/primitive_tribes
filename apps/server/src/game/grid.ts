import { COLS, ROWS, TERRAIN, WORLD } from '@game/shared';
import type { Pt } from './util';

export const BLOCK = { water: 1, tree: 2, building: 4 } as const;

const T = WORLD.tile;
const N = COLS * ROWS;
const SQRT2 = Math.SQRT2;

/** Сетка проходимости и поиск пути A* по 8 направлениям. */
export class Grid {
  readonly flags = new Uint8Array(N);
  private readonly g = new Float32Array(N);
  private readonly f = new Float32Array(N);
  private readonly came = new Int32Array(N);
  private readonly stamp = new Uint32Array(N);
  private readonly closedStamp = new Uint32Array(N);
  private gen = 1;

  constructor(terrain: string) {
    for (let i = 0; i < N; i++) if (terrain[i] === TERRAIN.water) this.flags[i] = BLOCK.water;
  }

  inBounds(tx: number, ty: number) {
    return tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS;
  }

  walkable(tx: number, ty: number) {
    return this.inBounds(tx, ty) && this.flags[ty * COLS + tx] === 0;
  }

  walkableAt(x: number, y: number) {
    return this.walkable(Math.floor(x / T), Math.floor(y / T));
  }

  isWaterAt(x: number, y: number) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    return !this.inBounds(tx, ty) || (this.flags[ty * COLS + tx] & BLOCK.water) !== 0;
  }

  /** Пометить клетки, центры которых попадают в круг. */
  markCircle(x: number, y: number, r: number, flag: number, on: boolean) {
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
    const y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        const cx = tx * T + T / 2, cy = ty * T + T / 2;
        if ((cx - x) ** 2 + (cy - y) ** 2 > r * r) continue;
        const i = ty * COLS + tx;
        this.flags[i] = on ? this.flags[i] | flag : this.flags[i] & ~flag;
      }
  }

  /** Пометить клетки, центры которых попадают в эллипс (с запасом в полклетки, чтобы путь шёл в обход). */
  markEllipse(cx: number, cy: number, rx: number, ry: number, flag: number, on: boolean) {
    const ex = rx + T * 0.4, ey = ry + T * 0.4;
    const x0 = Math.floor((cx - ex) / T), x1 = Math.floor((cx + ex) / T);
    const y0 = Math.floor((cy - ey) / T), y1 = Math.floor((cy + ey) / T);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        const px = tx * T + T / 2, py = ty * T + T / 2;
        if (((px - cx) / ex) ** 2 + ((py - cy) / ey) ** 2 > 1) continue;
        const i = ty * COLS + tx;
        this.flags[i] = on ? this.flags[i] | flag : this.flags[i] & ~flag;
      }
  }

  lineOfSight(a: Pt, b: Pt): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(d / 10);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      if (!this.walkableAt(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)) return false;
    }
    return true;
  }

  /** Ближайшая проходимая клетка к точке (поиск по кольцам). */
  nearestWalkable(x: number, y: number, maxRing = 6): Pt | null {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (this.walkable(tx, ty)) return { x, y };
    for (let r = 1; r <= maxRing; r++) {
      let best: Pt | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (!this.walkable(tx + dx, ty + dy)) continue;
          const p = { x: (tx + dx) * T + T / 2, y: (ty + dy) * T + T / 2 };
          const d = (p.x - x) ** 2 + (p.y - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
      if (best) return best;
    }
    return null;
  }

  /** Путь от from к to. Возвращает список точек (без стартовой) или null. */
  findPath(from: Pt, to: Pt, maxNodes = 6000): Pt[] | null {
    if (this.lineOfSight(from, to)) return [to];
    const goal = this.nearestWalkable(to.x, to.y);
    if (!goal) return null;
    const sx = Math.floor(from.x / T), sy = Math.floor(from.y / T);
    const gx = Math.floor(goal.x / T), gy = Math.floor(goal.y / T);
    const start = sy * COLS + sx, target = gy * COLS + gx;
    if (start === target) return [goal];

    const gen = ++this.gen;
    const open = new MinHeap();
    const h = (i: number) => {
      const dx = Math.abs((i % COLS) - gx), dy = Math.abs(Math.floor(i / COLS) - gy);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };
    this.stamp[start] = gen;
    this.g[start] = 0;
    this.f[start] = h(start);
    this.came[start] = -1;
    open.push(start, this.f[start]);
    let expanded = 0;
    let found = false;

    while (open.size > 0) {
      const cur = open.pop();
      if (this.closedStamp[cur] === gen) continue;
      this.closedStamp[cur] = gen;
      if (cur === target) {
        found = true;
        break;
      }
      if (++expanded > maxNodes) break;
      const cx = cur % COLS, cy = Math.floor(cur / COLS);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.walkable(nx, ny)) continue;
          // не срезаем углы
          if (dx && dy && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
          const ni = ny * COLS + nx;
          if (this.closedStamp[ni] === gen) continue;
          const ng = this.g[cur] + (dx && dy ? SQRT2 : 1);
          if (this.stamp[ni] === gen && ng >= this.g[ni]) continue;
          this.stamp[ni] = gen;
          this.g[ni] = ng;
          this.came[ni] = cur;
          this.f[ni] = ng + h(ni);
          open.push(ni, this.f[ni]);
        }
    }
    if (!found) return null;

    const tiles: Pt[] = [];
    for (let i = target; i !== -1 && i !== start; i = this.came[i]) {
      tiles.push({ x: (i % COLS) * T + T / 2, y: Math.floor(i / COLS) * T + T / 2 });
    }
    tiles.reverse();
    tiles[tiles.length - 1] = goal;
    return this.smooth(from, tiles);
  }

  /** Срезаем лишние точки пути там, где путь виден напрямую. */
  private smooth(from: Pt, pts: Pt[]): Pt[] {
    const out: Pt[] = [];
    let anchor = from;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineOfSight(anchor, pts[j])) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, p: number) {
    const a = this.items, q = this.prio;
    a.push(item);
    q.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (q[parent] <= q[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [q[i], q[parent]] = [q[parent], q[i]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items, q = this.prio;
    const top = a[0];
    const lastItem = a.pop()!, lastP = q.pop()!;
    if (a.length) {
      a[0] = lastItem;
      q[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && q[l] < q[m]) m = l;
        if (r < a.length && q[r] < q[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [q[i], q[m]] = [q[m], q[i]];
        i = m;
      }
    }
    return top;
  }
}
