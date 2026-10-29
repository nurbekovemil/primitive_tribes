export const SERVER_PORT = 2567;
export const ROOM_NAME = 'world';

export const WORLD = { width: 4000, height: 3000, tile: 40 } as const;
export const COLS = WORLD.width / WORLD.tile;
export const ROWS = WORLD.height / WORLD.tile;

/** Символы карты местности: трава и вода. */
export const TERRAIN = { grass: '.', water: '~' } as const;

export type UnitKind = 'warrior' | 'woman' | 'child';
export type Sex = 'm' | 'f';
export type AnimalKind = 'deer' | 'mammoth' | 'wolf' | 'tiger';
export type ResourceKind = 'tree' | 'bush' | 'carcass';
export type BuildingKind = 'hut' | 'storage' | 'forge' | 'kitchen' | 'training';
/** Оружие мужчины; делается только в кузнице. '' — без оружия (житель). */
export type WeaponKind = 'spear' | 'axe';
export type CarryType = '' | 'food' | 'wood';
export type UnitAction = 'idle' | 'move' | 'gather' | 'deposit' | 'attack' | 'build' | 'settle' | 'birth' | 'flee' | 'craft' | 'cook' | 'eat' | 'train';
export type AnimalAction = 'idle' | 'walk' | 'run' | 'attack';

export interface UnitStats {
  hp: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
  carry: number;
  radius: number;
}

export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  warrior: { hp: 110, speed: 62, damage: 13, range: 80, cooldown: 1.1, carry: 20, radius: 10 },
  woman: { hp: 70, speed: 58, damage: 0, range: 0, cooldown: 1, carry: 15, radius: 9 },
  child: { hp: 40, speed: 52, damage: 0, range: 0, cooldown: 1, carry: 0, radius: 6 },
};

/** В атаке воины бегут: скорость умножается на это. */
export const RUN_K = 1.4;
/** Копейщик отбегает, если цель подошла ближе этого (от края цели), — держит безопасное расстояние. */
export const SPEAR_SAFE = 60;

/** Мужчина без копья бьёт кулаком вплотную — слабее и ближе, чем копьём. */
export const UNARMED = { damage: 6, range: 20, cooldown: 1 } as const;

export interface AnimalStats {
  hp: number;
  walk: number;
  run: number;
  damage: number;
  cooldown: number;
  radius: number;
  meat: number;
  /** Радиус, в котором хищник замечает людей. 0 — не нападает первым. */
  aggro: number;
}

export const ANIMAL_STATS: Record<AnimalKind, AnimalStats> = {
  deer: { hp: 30, walk: 28, run: 80, damage: 0, cooldown: 1, radius: 14, meat: 35, aggro: 0 },
  mammoth: { hp: 380, walk: 18, run: 52, damage: 28, cooldown: 1.6, radius: 32, meat: 200, aggro: 0 },
  wolf: { hp: 45, walk: 30, run: 78, damage: 7, cooldown: 1, radius: 13, meat: 15, aggro: 220 },
  tiger: { hp: 95, walk: 30, run: 84, damage: 13, cooldown: 1, radius: 17, meat: 40, aggro: 250 },
};

/** Ресурсы не восстанавливаются: срубленное дерево остаётся пнём, обобранный куст — пустым. */
export const RESOURCE_STATS: Record<ResourceKind, { amount: number; gatherRate: number }> = {
  tree: { amount: 40, gatherRate: 2.5 },
  /** У куста запас случайный: от amount до BUSH_MAX. */
  bush: { amount: 200, gatherRate: 2 },
  carcass: { amount: 0, gatherRate: 5 },
};

export const BUSH_MAX = 400;

/** Основание постройки на земле — эллипс, как нарисовано (base в sprites.json): центр по y от точки постройки и полуоси. Сквозь него не ходят. */
export interface Footprint {
  dy: number;
  rx: number;
  ry: number;
}
export const FOOTPRINT: Record<BuildingKind, Footprint> = {
  hut: { dy: -25, rx: 56, ry: 23 },
  storage: { dy: -27, rx: 61, ry: 25 },
  forge: { dy: -26, rx: 59, ry: 24 },
  /** Кухня под открытым небом: обходят только очаг, к скамьям можно подойти. */
  kitchen: { dy: 0, rx: 24, ry: 12 },
  /** Площадка открытая: обходят только стойку с копьями посередине. */
  training: { dy: -4, rx: 16, ry: 8 },
};
/** Ратуша стоит позади центра племени (там сдают добычу). */
export const TOWNHALL_FOOTPRINT: Footprint = { dy: -61, rx: 72, ry: 30 };

/** Точка внутри эллипса основания — выталкиваем на его край (по лучу от центра). */
export function pushOutOf(x: number, y: number, cx: number, cy: number, f: Footprint): { x: number; y: number } | null {
  const dx = x - cx, dy = y - (cy + f.dy);
  const v = (dx / f.rx) ** 2 + (dy / f.ry) ** 2;
  if (v >= 1) return null;
  if (v < 1e-6) return { x: cx, y: cy + f.dy + f.ry };
  const k = 1.001 / Math.sqrt(v);
  return { x: cx + dx * k, y: cy + f.dy + dy * k };
}

export const BUILDING_STATS: Record<BuildingKind, { hp: number; radius: number; buildTime: number; wood: number }> = {
  /** buildTime — секунды работы одного строителя. */
  hut: { hp: 250, radius: 42, buildTime: 12, wood: 25 },
  /** Склад: сюда, как и в ратушу, сносят добычу — ставьте его у дальнего леса. */
  storage: { hp: 300, radius: 46, buildTime: 15, wood: 30 },
  /** Кузница: только здесь мужчины делают себе копья и топоры. */
  forge: { hp: 280, radius: 46, buildTime: 15, wood: 40 },
  /** Кухня под открытым небом: повар варит еду со склада, раненые приходят сюда поесть и лечатся. */
  kitchen: { hp: 260, radius: 86, buildTime: 18, wood: 35 },
  /** Площадка для тренировок: мужчины с оружием бегают, бросают копьё и рубят чучела — и получают звание воина. */
  training: { hp: 240, radius: 92, buildTime: 16, wood: 40 },
};

/**
 * Тренировка: time секунд на площадке (круг бега runTime, потом бой drillTime с мишенью или чучелом).
 * Обученный воин быстрее (speed), сильнее (damage), крепче (hp) и живёт на life лет дольше.
 */
export const TRAIN = { time: 45, runTime: 8, drillTime: 7, speed: 1.15, damage: 1.3, hp: 1.25, life: 5 } as const;

/**
 * Воины охраняют племя: идут на помощь своим, на кого напали, ближе help; гонят чужих и хищников,
 * которых видят на земле племени; гонятся не дальше chase.
 */
export const GUARD = { help: 600, chase: 700, every: 0.5 } as const;

/**
 * Кухня. Здоровье само не восстанавливается: раненый (ниже hungryAt) сам идёт на кухню и ест.
 * Повар (женщина) носит еду со склада или из ратуши и варит порции: mealFood еды → одна порция за cookTime секунд.
 * Порция лечит mealHeal от всего здоровья, лечение идёт со скоростью eatRate (доля здоровья в секунду).
 */
export const KITCHEN = {
  seats: 4,
  mealFood: 5,
  mealMax: 8,
  cookTime: 3,
  mealHeal: 0.5,
  eatRate: 0.12,
  hungryAt: 0.3,
} as const;

/**
 * Оружие из кузницы. Копьё — бросок с безопасного расстояния, им охотятся. Топор — удар вплотную, зато сильнее.
 * wood — цена, time — сколько секунд мастерить.
 */
export const WEAPONS: Record<WeaponKind, { wood: number; time: number; damage: number; range: number; cooldown: number }> = {
  spear: { wood: 10, time: 4, damage: 13, range: 170, cooldown: 1.3 },
  axe: { wood: 15, time: 5, damage: 22, range: 24, cooldown: 1.1 },
};
export const WEAPON_LABEL: Record<WeaponKind, string> = { spear: 'Копьё', axe: 'Топор' };

export const COSTS = {
  birthFood: 20,
} as const;

/**
 * Возраст: год проходит за yearSec секунд, детство (до adult лет) — быстрее, за TIMES.growUp.
 * Мужчина: до beard лет без бороды, с grey — седой; женщина седеет с womanGrey. Седые ходят медленнее (oldSpeed).
 * Умирают от старости в случайном возрасте из life.
 */
export const AGE = {
  yearSec: 30,
  adult: 10,
  beard: 25,
  grey: 35,
  womanGrey: 40,
  oldSpeed: 0.8,
  life: { m: [40, 50], f: [50, 60] },
  /** С какого возраста начинают вождь и его жена. */
  start: { m: 25, f: 22 },
} as const;

/** Как выглядит человек по возрасту: young — взрослый без бороды, old — седой, '' — обычный. Дети — ''. */
export function ageLook(u: { kind: string; sex: string; age: number }): '' | 'young' | 'old' {
  if (u.kind === 'child') return '';
  if (u.age >= (u.sex === 'm' ? AGE.grey : AGE.womanGrey)) return 'old';
  if (u.sex === 'm' && u.age < AGE.beard) return 'young';
  return '';
}

/** «1 год», «3 года», «25 лет». */
export function yearsText(n: number): string {
  const d = n % 10, dd = n % 100;
  const w = d === 1 && dd !== 11 ? 'год' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'года' : 'лет';
  return `${n} ${w}`;
}

/** Малыш (рост меньше until, в процентах) ползает на четвереньках — медленнее, скорость × speed. */
export const CRAWL = { until: 35, speed: 0.55 } as const;

export const TIMES = {
  /** Ребёнок взрослеет за минуту. */
  growUp: 60,
  birth: 8,
  eatEvery: 15,
  carcassDecay: 180,
  /** Сколько секунд человек кладёт или бросает ношу у склада. */
  drop: 0.6,
  /** Сколько ждёт племя отключившегося игрока. */
  offlineKeep: 300,
} as const;

/**
 * Лимиты растут от построек (см. tribeLimits в rules.ts): ратуша даёт базу,
 * каждая готовая хижина — людей и границу племени, каждый склад — место под еду и дерево.
 */
export const LIMITS = {
  kidsPerHut: 4,
  /** Больше этого племя не вырастет никогда. */
  popMax: 60,
  popBase: 5,
  popPerHut: 4,
  /** Сколько еды и сколько дерева помещается (каждого отдельно). */
  resBase: 150,
  resPerStorage: 150,
  /** Граница племени — радиус от ратуши, внутри которого можно строить. */
  borderBase: 450,
  borderPerHut: 120,
  borderMax: 1300,
  /** Склад можно поставить за границей — у дальнего леса. */
  storageExtra: 400,
} as const;

/** Радиус обзора: дальше этого игрок не видит чужих людей и зверей (туман войны). */
export const VISION = { warrior: 320, woman: 260, child: 200, hut: 240, storage: 220, forge: 220, kitchen: 220, training: 240, camp: 340 } as const;

/** Дикие звери живут за туманом: появляются и бродят не ближе этого к ратуше (обзор ратуши + запас). */
export const WILD_DISTANCE = VISION.camp + 260;

/** Хищники не заходят на стоянку ближе этого радиуса. */
export const FIRE_SAFE_RADIUS = 150;
/** Радиус, в котором люди сдают добычу на стоянке. */
export const DEPOSIT_RADIUS = 45;

export const START = { food: 50, wood: 30 } as const;

/** Цвета племён — приглушённые, «земляные»: ими красят одежду, флажки и кольца под ногами. */
export const TRIBE_COLORS = [
  '#a85a4a', '#5f8a55', '#b89a4e', '#4f6e94', '#b8784a', '#7a5a8c', '#4f8f8c', '#a86a7e',
  '#8a9450', '#c08e72', '#3f6f5e', '#8a80a8', '#7f6440', '#a8a080', '#6e3c3c', '#78a088',
];

export const UNIT_LABEL: Record<UnitKind, string> = { warrior: 'Воин', woman: 'Женщина', child: 'Ребёнок' };
/** Мужчина без оружия — житель, с оружием — охотник, после тренировки — воин (охраняет племя, не работает). */
export const unitLabel = (u: { kind: string; armed: boolean; trained?: boolean }) =>
  u.kind !== 'warrior' ? UNIT_LABEL[u.kind as UnitKind] : u.trained ? 'Воин' : u.armed ? 'Охотник' : 'Житель';
export const BUILDING_LABEL: Record<BuildingKind, string> = { hut: 'Хижина', storage: 'Склад', forge: 'Кузница', kitchen: 'Кухня', training: 'Площадка для тренировок' };
export const ANIMAL_LABEL: Record<AnimalKind, string> = {
  deer: 'Олень',
  mammoth: 'Мамонт',
  wolf: 'Волк',
  tiger: 'Саблезубый тигр',
};
export const RESOURCE_LABEL: Record<ResourceKind, string> = { tree: 'Дерево', bush: 'Ягодный куст', carcass: 'Туша' };
export const ACTION_LABEL: Record<UnitAction, string> = {
  idle: 'Ждёт приказа',
  move: 'Идёт',
  gather: 'Добывает',
  deposit: 'Несёт добычу',
  attack: 'Атакует',
  build: 'Строит',
  settle: 'Заселяется',
  birth: 'С парой в хижине',
  flee: 'Убегает к ратуше',
  craft: 'Мастерит оружие',
  cook: 'Готовит еду на кухне',
  eat: 'Идёт поесть на кухню',
  train: 'Тренируется',
};
