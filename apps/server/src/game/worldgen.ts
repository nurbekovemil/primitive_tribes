import { COLS, ROWS, TERRAIN, VISION, WORLD } from '@game/shared';
import { rand, randInt, type Pt } from './util';

export interface GeneratedWorld {
  terrain: string;
  trees: Pt[];
  bushes: Pt[];
}

/** Озёра из нескольких перекрывающихся эллипсов, вдали от стоянок — редкие рощи и кусты (основной лес сажает `plantAround`). */
export function generateWorld(): GeneratedWorld {
  const cells = new Array<string>(COLS * ROWS).fill(TERRAIN.grass);
  const T = WORLD.tile;

  const lakes = randInt(5, 7);
  for (let l = 0; l < lakes; l++) {
    const cx = rand(300, WORLD.width - 300), cy = rand(300, WORLD.height - 300);
    const blobs = randInt(2, 4);
    for (let b = 0; b < blobs; b++) {
      const bx = cx + rand(-110, 110), by = cy + rand(-80, 80);
      const rx = rand(90, 190), ry = rand(60, 130);
      for (let ty = 0; ty < ROWS; ty++)
        for (let tx = 0; tx < COLS; tx++) {
          const x = tx * T + T / 2, y = ty * T + T / 2;
          if (((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2 <= 1) cells[ty * COLS + tx] = TERRAIN.water;
        }
    }
  }
  const terrain = cells.join('');
  const water = (p: Pt) => {
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    return tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || terrain[ty * COLS + tx] === TERRAIN.water;
  };
  const nearWater = (p: Pt, r: number) =>
    water(p) || water({ x: p.x + r, y: p.y }) || water({ x: p.x - r, y: p.y }) || water({ x: p.x, y: p.y + r }) || water({ x: p.x, y: p.y - r });

  const trees: Pt[] = [];
  const place = (list: Pt[], p: Pt, minGap: number) => {
    if (p.x < 40 || p.y < 40 || p.x > WORLD.width - 40 || p.y > WORLD.height - 40) return;
    if (nearWater(p, 20)) return;
    if (trees.some((t) => (t.x - p.x) ** 2 + (t.y - p.y) ** 2 < minGap * minGap)) return;
    list.push(p);
  };
  for (let f = 0; f < 8; f++) {
    const cx = rand(150, WORLD.width - 150), cy = rand(150, WORLD.height - 150);
    const n = randInt(8, 16);
    for (let i = 0; i < n; i++) place(trees, { x: cx + rand(-190, 190), y: cy + rand(-170, 170) }, 45);
  }
  for (let i = 0; i < 25; i++) place(trees, { x: rand(40, WORLD.width - 40), y: rand(40, WORLD.height - 40) }, 45);

  const bushes: Pt[] = [];
  for (let c = 0; c < 12; c++) {
    const cx = rand(100, WORLD.width - 100), cy = rand(100, WORLD.height - 100);
    const n = randInt(2, 6);
    for (let i = 0; i < n; i++) {
      const p = { x: cx + rand(-90, 90), y: cy + rand(-90, 90) };
      if (!nearWater(p, 16) && !trees.some((t) => (t.x - p.x) ** 2 + (t.y - p.y) ** 2 < 35 * 35)) bushes.push(p);
    }
  }
  return { terrain, trees, bushes };
}

/** Радиус свободной поляны вокруг стоянки: чуть больше обзора стоянки, чтобы ресурсы были прямо за туманом. */
export const CLEARING = VISION.camp + 20;

/** Рощи и ягодники вокруг новой стоянки: несколько групп деревьев и кустов сразу за краем тумана. */
export function plantAround(spot: Pt, isWater: (x: number, y: number) => boolean, existing: Pt[], camps: Pt[]): { trees: Pt[]; bushes: Pt[] } {
  const trees: Pt[] = [];
  const bushes: Pt[] = [];
  const all = [...existing];
  const ok = (p: Pt, gap: number) =>
    p.x > 40 && p.y > 40 && p.x < WORLD.width - 40 && p.y < WORLD.height - 40 &&
    ![0, 20, -20].some((d) => isWater(p.x + d, p.y) || isWater(p.x, p.y + d)) &&
    // вокруг стоянки — свободное место под постройки, ресурсы начинаются сразу за туманом
    (p.x - spot.x) ** 2 + (p.y - spot.y) ** 2 > CLEARING ** 2 &&
    camps.every((c) => (c.x - p.x) ** 2 + (c.y - p.y) ** 2 > CLEARING ** 2) &&
    all.every((t) => (t.x - p.x) ** 2 + (t.y - p.y) ** 2 > gap * gap);
  const around = (r0: number, r1: number, a: number) => {
    const r = rand(r0, r1);
    return { x: spot.x + Math.cos(a) * r, y: spot.y + Math.sin(a) * r * 0.85 };
  };
  const a0 = rand(0, Math.PI * 2);
  const groves = randInt(3, 4);
  for (let g = 0; g < groves; g++) {
    const c = around(CLEARING + 110, CLEARING + 200, a0 + (g / groves) * Math.PI * 2 + rand(-0.4, 0.4));
    const n = randInt(7, 11);
    for (let i = 0, tries = 0; i < n && tries < 60; tries++) {
      const p = { x: c.x + rand(-120, 120), y: c.y + rand(-100, 100) };
      if (!ok(p, 45)) continue;
      trees.push(p);
      all.push(p);
      i++;
    }
  }
  const patches = 3;
  for (let b = 0; b < patches; b++) {
    const c = around(CLEARING + 30, CLEARING + 80, a0 + ((b + 0.5) / patches) * Math.PI * 2);
    for (let i = 0, tries = 0; i < 4 && tries < 30; tries++) {
      const p = { x: c.x + rand(-50, 50), y: c.y + rand(-45, 45) };
      if (!ok(p, 32)) continue;
      bushes.push(p);
      all.push(p);
      i++;
    }
  }
  return { trees, bushes };
}
