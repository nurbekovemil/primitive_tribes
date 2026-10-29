import {
  BUILDING_STATS,
  COLS,
  LIMITS,
  ROWS,
  TERRAIN,
  WORLD,
  type BuildingKind,
  type ResourceKind,
  type Sex,
  type UnitKind,
} from './constants';

// ---------- местность ----------

export const tileX = (x: number) => Math.max(0, Math.min(COLS - 1, Math.floor(x / WORLD.tile)));
export const tileY = (y: number) => Math.max(0, Math.min(ROWS - 1, Math.floor(y / WORLD.tile)));

export function isWater(terrain: string, x: number, y: number): boolean {
  return terrain[tileY(y) * COLS + tileX(x)] === TERRAIN.water;
}

// ---------- правый клик: что сделает человек ----------

/** Описание цели правого клика с точки зрения игрока. */
export type TargetInfo =
  | { entity: 'resource'; kind: ResourceKind }
  | { entity: 'animal' }
  | { entity: 'unit'; own: boolean }
  | { entity: 'building'; own: boolean; built: boolean; kind: BuildingKind }
  | { entity: 'tribe'; own: boolean };

export type SmartAction = 'gather' | 'attack' | 'build' | 'settle' | 'deposit' | 'cook' | 'eat';

/**
 * Что сделает человек данного вида по правому клику на цель.
 * null — такого действия нет, человек просто подойдёт к цели.
 */
export function actionFor(kind: UnitKind, target: TargetInfo, armed = kind === 'warrior'): SmartAction | null {
  // на свою кухню есть может прийти каждый, женщина там ещё и готовит
  if (target.entity === 'building' && target.own && target.built && target.kind === 'kitchen') return kind === 'woman' ? 'cook' : 'eat';
  if (kind === 'child') return null;
  const warrior = kind === 'warrior';
  switch (target.entity) {
    case 'resource':
      // воин с копьём ягоды не собирает, житель без копья — собирает
      if (target.kind === 'bush') return warrior && armed ? null : 'gather';
      return 'gather';
    case 'animal':
      return warrior ? 'attack' : null;
    case 'unit':
      return !target.own && warrior ? 'attack' : null;
    case 'building':
      if (!target.own) return warrior ? 'attack' : null;
      if (!target.built) return 'build';
      return target.kind === 'storage' ? 'deposit' : target.kind === 'hut' ? 'settle' : null;
    case 'tribe':
      return target.own ? 'deposit' : null;
  }
}

export const ACTION_HINT: Record<SmartAction, string> = {
  gather: 'Добывать',
  attack: 'Атаковать',
  build: 'Строить',
  settle: 'Заселить семью',
  deposit: 'Отнести добычу',
  cook: 'Готовить на кухне (или поесть, если повар уже есть)',
  eat: 'Поесть на кухне',
};

// ---------- семьи ----------

export interface FamilyCandidate {
  id: string;
  tribe: string;
  kind: UnitKind;
  sex: Sex;
  partner: string;
}

/** Причина, почему пару нельзя поженить, или null, если можно. */
export function marriageProblem(a: FamilyCandidate, b: FamilyCandidate): string | null {
  if (a.tribe !== b.tribe) return 'Люди из разных племён';
  if (a.kind === 'child' || b.kind === 'child') return 'Дети ещё не выросли';
  if (a.sex === b.sex) return 'Нужны мужчина и женщина';
  if (a.partner || b.partner) return 'Кто-то из них уже в семье';
  return null;
}

// ---------- строительство ----------

interface Point {
  x: number;
  y: number;
}

export interface PlacementWorld {
  terrain: string;
  buildings: Iterable<Point & { kind: string }>;
  resources: Iterable<Point & { kind: string }>;
  campfires: Iterable<Point & { id: string }>;
  ownTribe: Point & { id: string; border: number };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- лимиты племени ----------

/** Лимиты от готовых построек: население, место под еду и под дерево (каждого), граница племени. */
export function tribeLimits(huts: number, storages: number) {
  return {
    pop: Math.min(LIMITS.popMax, LIMITS.popBase + huts * LIMITS.popPerHut),
    res: LIMITS.resBase + storages * LIMITS.resPerStorage,
    border: Math.min(LIMITS.borderMax, LIMITS.borderBase + huts * LIMITS.borderPerHut),
  };
}

/** Как далеко от ратуши можно ставить постройку при данной границе племени. */
export const buildRadius = (kind: BuildingKind, border: number) => (kind === 'storage' ? border + LIMITS.storageExtra : border);

/** Причина, почему здесь нельзя строить, или null, если можно. */
export function placementProblem(kind: BuildingKind, x: number, y: number, w: PlacementWorld): string | null {
  const r = BUILDING_STATS[kind].radius;
  const p = { x, y };
  if (x < r + 20 || y < r + 20 || x > WORLD.width - r - 20 || y > WORLD.height - r - 20) return 'Край мира';
  if (dist(p, w.ownTribe) > buildRadius(kind, w.ownTribe.border)) return 'За границей племени — постройте ещё хижин';
  if (dist(p, w.ownTribe) < 170) return 'Слишком близко к ратуше';
  for (const c of w.campfires) if (c.id !== w.ownTribe.id && dist(p, c) < 300) return 'Рядом чужой костёр';
  for (let dx = -r; dx <= r; dx += r / 2)
    for (let dy = -r; dy <= r; dy += r / 2) if (isWater(w.terrain, x + dx, y + dy)) return 'Здесь вода';
  for (const b of w.buildings) if (dist(p, b) < r + BUILDING_STATS[b.kind as BuildingKind].radius + 8) return 'Мешает другая постройка';
  for (const res of w.resources) {
    if (res.kind === 'carcass') continue;
    if (dist(p, res) < r + (res.kind === 'tree' ? 16 : 12)) return 'Мешает дерево или куст';
  }
  return null;
}
