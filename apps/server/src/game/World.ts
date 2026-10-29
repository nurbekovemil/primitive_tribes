import {
  AGE,
  ANIMAL_LABEL,
  ANIMAL_STATS,
  BUILDING_STATS,
  BUSH_MAX,
  FIRE_SAFE_RADIUS,
  FOOTPRINT,
  KITCHEN,
  TOWNHALL_FOOTPRINT,
  pushOutOf,
  RESOURCE_STATS,
  START,
  TIMES,
  TRIBE_COLORS,
  UNIT_STATS,
  WILD_DISTANCE,
  WORLD,
  entityType,
  tribeLimits,
  randomName,
  yearsText,
  type AnimalKind,
  type BuildingKind,
  type Command,
  type LogTone,
  type ResourceKind,
  type Sex,
  type WeaponKind,
  type TargetInfo,
  type UnitKind,
} from '@game/shared';
import { Animal, Building, Resource, Tribe, Unit, WorldState } from '../state/schema';
import { BLOCK, Grid } from './grid';
import { CLEARING, generateWorld, plantAround } from './worldgen';

import { dist, dist2, rand, setIfChanged, type Pt } from './util';
import { updateUnit, separateUnits } from './units';
import { updateAnimal, spawnAnimals } from './animals';
import { updateTribes } from './tribes';
import { applyCommand } from './commands';
import { runBots } from './bot';

// ---------- серверные данные сущностей (не синхронизируются) ----------

export type Job =
  | { type: 'idle' }
  | { type: 'move'; x: number; y: number }
  | { type: 'gather'; res: string; kind: ResourceKind; returning: boolean }
  /** auto — сам напал (самооборона, охрана); chase — дальше этого за целью не гонится. */
  | { type: 'attack'; target: string; auto: boolean; chase?: number }
  | { type: 'build'; building: string }
  | { type: 'settle'; building: string }
  | { type: 'birth'; building: string; paid: number }
  | { type: 'deposit' }
  | { type: 'flee' }
  /** paid — сколько дерева уже взято у племени (вернётся при отмене). */
  | { type: 'craft'; weapon: WeaponKind; forge: string; progress: number; paid: number }
  /** Повар на кухне: носит еду со склада и варит порции. */
  | { type: 'cook'; kitchen: string; progress: number }
  /** Раненый идёт поесть: seat — место за очагом (-1 — ещё не сел, ждёт очереди). */
  | { type: 'eat'; kitchen: string; seat: number }
  /** Тренировка на площадке: бег по кругу (lap — точка круга) и бой с мишенью или чучелом; t — сколько идёт этап. */
  | { type: 'train'; ground: string; progress: number; phase: 'run' | 'drill'; t: number; lap: number };

export interface UnitData {
  hp: number;
  carry: number;
  growth: number;
  /** Возраст в годах (дробный) и когда умрёт от старости. */
  age: number;
  lifespan: number;
  job: Job;
  /** Работа, к которой воин вернётся после самообороны. */
  resume: Job | null;
  path: Pt[] | null;
  pathGoal: Pt | null;
  repath: number;
  cd: number;
  lastAttacker: string;
  attackedAt: number;
  /** Что делает руками в этом тике (для анимации у клиентов). */
  task: string;
  /** Сколько ещё секунд кладёт сданную ношу (стоит на месте). */
  drop: number;
  /** Когда воин в следующий раз осмотрится, нет ли кому помочь. */
  guardT: number;
}

export interface AnimalData {
  hp: number;
  wx: number;
  wy: number;
  wait: number;
  cd: number;
  target: string;
  angerBy: string;
  angerT: number;
  fleeFrom: Pt | null;
  fleeT: number;
  stamina: number;
  fed: number;
  lastAttacker: string;
}

export interface TribeData {
  token: string;
  food: number;
  wood: number;
  eatT: number;
  offlineT: number;
  /** Когда последний раз предупреждали, что склады полны (чтобы не спамить). */
  fullWarnT: number;
}

export interface BuildingData {
  hp: number;
  progress: number;
  birth: number;
  /** Кухня: принесённая сырая еда, сваренные порции, кто сидит на местах ('' — свободно), очередь снаружи. */
  raw: number;
  meals: number;
  seats: string[];
  queue: string[];
}

/** Запас ягод в новом кусте — случайный. */
const bushAmount = () => rand(RESOURCE_STATS.bush.amount, BUSH_MAX);

export interface WorldEvents {
  log(tribeId: string, text: string, tone: LogTone): void;
  /** Удар человека id; у копья — полёт [x1, y1, x2, y2]. */
  fx(id: string, spear: number[] | null): void;
  tribeGone(tribe: Tribe, reason: 'extinct' | 'left'): void;
  chat(text: string): void;
}

export const BOT_NAMES = ['Племя Бизона', 'Племя Ворона', 'Племя Медведя', 'Племя Камня', 'Племя Реки', 'Племя Волка'];

export class World {
  readonly state = new WorldState();
  readonly grid: Grid;
  time = 0;
  private seq = 0;
  readonly units = new Map<string, UnitData>();
  readonly animals = new Map<string, AnimalData>();
  readonly tribes = new Map<string, TribeData>();
  readonly buildings = new Map<string, BuildingData>();
  readonly resAmount = new Map<string, number>();
  readonly carcassTtl = new Map<string, number>();
  /** Какая туша осталась от убитого зверя — охотники переходят к разделке. */
  readonly carcassOf = new Map<string, string>();
  private spawnT = 0;
  private botT = 0;
  botTribes = 2;

  constructor(readonly events: WorldEvents) {
    const gen = generateWorld();
    this.state.terrain = gen.terrain;
    this.grid = new Grid(gen.terrain);
    for (const p of gen.trees) this.addResource('tree', p.x, p.y, RESOURCE_STATS.tree.amount);
    for (const p of gen.bushes) this.addResource('bush', p.x, p.y, bushAmount());
    for (let i = 0; i < 40; i++) spawnAnimals(this);
  }

  nextId(prefix: string) {
    return prefix + (++this.seq).toString(36);
  }

  log(tribeId: string, text: string, tone: LogTone = 'info') {
    this.events.log(tribeId, text, tone);
  }

  // ---------- ресурсы ----------

  addResource(kind: ResourceKind, x: number, y: number, amount: number): Resource {
    const r = new Resource({ id: this.nextId('r'), kind, x, y, amount: Math.floor(amount), max: Math.floor(amount) });
    this.state.resources.set(r.id, r);
    this.resAmount.set(r.id, amount);
    if (kind === 'tree') this.grid.markCircle(x, y, 14, BLOCK.tree, true);
    if (kind === 'carcass') this.carcassTtl.set(r.id, TIMES.carcassDecay);
    return r;
  }

  amountOf(r: Resource) {
    return this.resAmount.get(r.id) ?? 0;
  }

  setAmount(r: Resource, v: number) {
    this.resAmount.set(r.id, v);
    setIfChanged(r, 'amount', Math.floor(v));
  }

  removeResource(id: string) {
    const r = this.state.resources.get(id);
    if (!r) return;
    if (r.kind === 'tree') this.grid.markCircle(r.x, r.y, 14, BLOCK.tree, false);
    this.state.resources.delete(id);
    this.resAmount.delete(id);
    this.carcassTtl.delete(id);
  }

  // ---------- племена ----------

  private findCampSpot(): Pt {
    let best: Pt | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 120; i++) {
      const c = { x: rand(350, WORLD.width - 350), y: rand(350, WORLD.height - 350) };
      let waterNear = false;
      for (let a = 0; a < 16 && !waterNear; a++)
        for (const r of [60, 140, 220]) {
          if (this.grid.isWaterAt(c.x + Math.cos((a / 16) * Math.PI * 2) * r, c.y + Math.sin((a / 16) * Math.PI * 2) * r)) {
            waterNear = true;
            break;
          }
        }
      if (waterNear) continue;
      let score = 5000;
      for (const t of this.state.tribes.values()) score = Math.min(score, dist(t, c));
      for (const a of this.state.animals.values())
        if (ANIMAL_STATS[a.kind as AnimalKind].aggro && dist2(a, c) < 500 * 500) score -= 400;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best ?? { x: WORLD.width / 2, y: WORLD.height / 2 };
  }

  createTribe(name: string, bot: boolean): { tribe: Tribe; token: string } {
    const spot = this.findCampSpot();
    const used = new Set([...this.state.tribes.values()].map((t) => t.color));
    const color = TRIBE_COLORS.find((c) => !used.has(c)) ?? TRIBE_COLORS[Math.floor(Math.random() * TRIBE_COLORS.length)];
    const tribe = new Tribe({ id: this.nextId('t'), name, color, x: spot.x, y: spot.y, bot, online: !bot, food: START.food, wood: START.wood });
    const token = crypto.randomUUID();
    this.state.tribes.set(tribe.id, tribe);
    this.tribes.set(tribe.id, { token, food: START.food, wood: START.wood, eatT: 0, offlineT: 0, fullWarnT: 0 });
    this.refreshLimits(tribe);

    // поляна под постройки вокруг стоянки и никаких хищников рядом
    for (const r of [...this.state.resources.values()]) if (r.kind !== 'carcass' && dist2(r, spot) < CLEARING * CLEARING) this.removeResource(r.id);
    // ратуша стоит за точкой сдачи добычи, её нельзя пройти насквозь
    this.markFootprint(spot.x, spot.y, TOWNHALL_FOOTPRINT, true);
    // лес и ягоды вокруг стоянки — основной запас племени
    const others = [...this.state.tribes.values()].filter((t) => t.id !== tribe.id);
    const near = [...this.state.resources.values()].filter((r) => r.kind === 'tree' && dist2(r, spot) < 600 * 600);
    const gen = plantAround(spot, (x, y) => this.grid.isWaterAt(x, y), near, others);
    for (const p of gen.trees) this.addResource('tree', p.x, p.y, RESOURCE_STATS.tree.amount);
    for (const p of gen.bushes) this.addResource('bush', p.x, p.y, bushAmount());
    // все звери — за туманом, подальше от новой ратуши (взамен появятся новые вдали)
    for (const a of [...this.state.animals.values()]) if (dist2(a, spot) < WILD_DISTANCE * WILD_DISTANCE) this.state.animals.delete(a.id);

    // вождь начинает без оружия — его делают в кузнице
    const man = this.spawnUnit(tribe, 'warrior', 'm', spot.x - 25, spot.y + 20, AGE.start.m);
    man.chief = true;
    const woman = this.spawnUnit(tribe, 'woman', 'f', spot.x + 25, spot.y + 20, AGE.start.f);
    man.partner = woman.id;
    woman.partner = man.id;
    if (!bot) {
      this.log(tribe.id, `${name}: ${man.name} и ${woman.name} построили ратушу. Теперь всё зависит от вас, вождь!`, 'good');
      this.log(tribe.id, 'Выделите людей мышью, затем правый клик: по кусту — собирать, по дереву — рубить, по зверю — охотиться.');
      this.log(tribe.id, 'У вождя пока нет оружия: постройте кузницу — там делают копья и топоры.');
      this.log(tribe.id, 'Каждая хижина раздвигает границу племени и даёт место ещё 4 людям, каждый склад — место под еду и дерево.');
    }
    return { tribe, token };
  }

  tokenOf(tribeId: string) {
    return this.tribes.get(tribeId)?.token;
  }

  findTribeByToken(token: string): Tribe | undefined {
    for (const [id, d] of this.tribes) if (d.token === token) return this.state.tribes.get(id);
    return undefined;
  }

  removeTribe(id: string, reason: 'extinct' | 'left') {
    const tribe = this.state.tribes.get(id);
    if (!tribe) return;
    for (const u of [...this.state.units.values()]) if (u.tribe === id) this.deleteUnit(u.id);
    for (const b of [...this.state.buildings.values()]) if (b.tribe === id) this.deleteBuilding(b.id);
    this.markFootprint(tribe.x, tribe.y, TOWNHALL_FOOTPRINT, false);
    this.state.tribes.delete(id);
    this.tribes.delete(id);
    this.remarkFootprints();
    this.events.tribeGone(tribe, reason);
  }

  addTribeRes(tribe: Tribe, food: number, wood: number) {
    const d = this.tribes.get(tribe.id)!;
    d.food = Math.max(0, d.food + food);
    d.wood = Math.max(0, d.wood + wood);
    setIfChanged(tribe, 'food', Math.floor(d.food));
    setIfChanged(tribe, 'wood', Math.floor(d.wood));
  }

  /** Пересчитать лимиты племени по его готовым постройкам. */
  refreshLimits(tribe: Tribe) {
    let huts = 0, storages = 0;
    for (const b of this.state.buildings.values()) {
      if (b.tribe !== tribe.id || !this.isBuilt(b)) continue;
      if (b.kind === 'hut') huts++;
      else if (b.kind === 'storage') storages++;
    }
    const l = tribeLimits(huts, storages);
    setIfChanged(tribe, 'popCap', l.pop);
    setIfChanged(tribe, 'resCap', l.res);
    setIfChanged(tribe, 'border', l.border);
  }

  /** Склады полны: сказать игроку, но не чаще раза в 20 секунд. */
  warnFull(tribe: Tribe, wood: boolean) {
    const d = this.tribes.get(tribe.id);
    if (!d || Date.now() - d.fullWarnT < 20000) return;
    d.fullWarnT = Date.now();
    this.log(tribe.id, `Некуда класть ${wood ? 'дерево' : 'еду'}: всё занято (${tribe.resCap}). Постройте склад — люди ждут с ношей.`, 'bad');
  }

  /** Сколько людей в племени, считая тех, кто вот-вот родится. */
  popOf(tribeId: string) {
    let n = 0;
    for (const u of this.state.units.values()) if (u.tribe === tribeId) n++;
    for (const b of this.state.buildings.values()) if (b.tribe === tribeId && b.birth > 0) n++;
    return n;
  }

  tribeRes(tribe: Tribe) {
    const d = this.tribes.get(tribe.id)!;
    return { food: d.food, wood: d.wood };
  }

  // ---------- люди ----------

  spawnUnit(tribe: Tribe, kind: UnitKind, sex: Sex, x: number, y: number, age = kind === 'child' ? 0 : 20): Unit {
    const p = this.grid.nearestWalkable(x, y) ?? { x, y };
    const st = UNIT_STATS[kind];
    const u = new Unit({
      id: this.nextId('u'),
      tribe: tribe.id,
      kind,
      sex,
      name: randomName(sex),
      x: p.x,
      y: p.y,
      hp: st.hp,
      maxHp: st.hp,
      growth: kind === 'child' ? 0 : 100,
      age: Math.floor(age),
      action: 'idle',
    });
    const [l0, l1] = AGE.life[sex];
    this.state.units.set(u.id, u);
    this.units.set(u.id, {
      hp: st.hp,
      carry: 0,
      growth: kind === 'child' ? 0 : 1,
      age,
      lifespan: rand(l0, l1),
      job: { type: 'idle' },
      resume: null,
      path: null,
      pathGoal: null,
      repath: 0,
      cd: 0,
      drop: 0,
      guardT: Math.random() * 0.5,
      lastAttacker: '',
      attackedAt: -99,
      task: '',
    });
    return u;
  }

  private deleteUnit(id: string) {
    this.state.units.delete(id);
    this.units.delete(id);
  }

  unitsOf(tribeId: string): Unit[] {
    const out: Unit[] = [];
    for (const u of this.state.units.values()) if (u.tribe === tribeId) out.push(u);
    return out;
  }

  // ---------- звери ----------

  spawnAnimal(kind: AnimalKind, x: number, y: number): Animal | null {
    const p = this.grid.nearestWalkable(x, y, 3);
    if (!p) return null;
    const st = ANIMAL_STATS[kind];
    const a = new Animal({ id: this.nextId('a'), kind, x: p.x, y: p.y, hp: st.hp, maxHp: st.hp, action: 'idle' });
    this.state.animals.set(a.id, a);
    this.animals.set(a.id, {
      hp: st.hp,
      wx: p.x,
      wy: p.y,
      wait: rand(0, 3),
      cd: 0,
      target: '',
      angerBy: '',
      angerT: 0,
      fleeFrom: null,
      fleeT: 0,
      stamina: 4,
      fed: 0,
      lastAttacker: '',
    });
    return a;
  }

  // ---------- постройки ----------

  addBuilding(tribe: Tribe, kind: BuildingKind, x: number, y: number): Building {
    const st = BUILDING_STATS[kind];
    const b = new Building({ id: this.nextId('b'), tribe: tribe.id, kind, x, y, hp: st.hp, maxHp: st.hp });
    this.state.buildings.set(b.id, b);
    this.buildings.set(b.id, { hp: st.hp, progress: 0, birth: 0, raw: 0, meals: 0, seats: Array<string>(KITCHEN.seats).fill(''), queue: [] });
    this.markFootprint(x, y, FOOTPRINT[kind], true);
    return b;
  }

  private deleteBuilding(id: string) {
    const b = this.state.buildings.get(id);
    if (!b) return;
    this.markFootprint(b.x, b.y, FOOTPRINT[b.kind as BuildingKind], false);
    for (const u of this.state.units.values()) if (u.home === id) u.home = '';
    this.state.buildings.delete(id);
    this.buildings.delete(id);
    // соседние клетки могли быть общими — помечаем оставшиеся постройки заново
    this.remarkFootprints();
  }

  private markFootprint(x: number, y: number, f: { dy: number; rx: number; ry: number }, on: boolean) {
    this.grid.markEllipse(x, y + f.dy, f.rx, f.ry, BLOCK.building, on);
  }

  private remarkFootprints() {
    for (const b of this.state.buildings.values()) this.markFootprint(b.x, b.y, FOOTPRINT[b.kind as BuildingKind], true);
    for (const t of this.state.tribes.values()) this.markFootprint(t.x, t.y, TOWNHALL_FOOTPRINT, true);
  }

  /** Точка не внутри основания постройки или ратуши: если внутри — выталкиваем на край, чтобы люди обходили здания. */
  outsideBuildings(x: number, y: number): { x: number; y: number } {
    let p = { x, y };
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (const b of this.state.buildings.values()) {
        const q = pushOutOf(p.x, p.y, b.x, b.y, FOOTPRINT[b.kind as BuildingKind]);
        if (q) {
          p = q;
          moved = true;
        }
      }
      for (const t of this.state.tribes.values()) {
        const q = pushOutOf(p.x, p.y, t.x, t.y, TOWNHALL_FOOTPRINT);
        if (q) {
          p = q;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return p;
  }

  isBuilt(b: Building) {
    return (this.buildings.get(b.id)?.progress ?? 0) >= 1;
  }

  // ---------- поиск сущностей ----------

  /** Позиция и радиус любой сущности по id. */
  locate(id: string): (Pt & { r: number }) | null {
    switch (entityType(id)) {
      case 'unit': {
        const u = this.state.units.get(id);
        return u ? { x: u.x, y: u.y, r: UNIT_STATS[u.kind as UnitKind].radius } : null;
      }
      case 'animal': {
        const a = this.state.animals.get(id);
        return a ? { x: a.x, y: a.y, r: ANIMAL_STATS[a.kind as AnimalKind].radius } : null;
      }
      case 'building': {
        const b = this.state.buildings.get(id);
        return b ? { x: b.x, y: b.y, r: BUILDING_STATS[b.kind as BuildingKind].radius } : null;
      }
      case 'resource': {
        const r = this.state.resources.get(id);
        return r ? { x: r.x, y: r.y, r: r.kind === 'tree' ? 14 : 10 } : null;
      }
      case 'tribe': {
        const t = this.state.tribes.get(id);
        return t ? { x: t.x, y: t.y, r: 30 } : null;
      }
      default:
        return null;
    }
  }

  /** Описание цели правого клика для правил actionFor. */
  describe(id: string, tribeId: string): TargetInfo | null {
    switch (entityType(id)) {
      case 'resource': {
        const r = this.state.resources.get(id);
        return r ? { entity: 'resource', kind: r.kind as ResourceKind } : null;
      }
      case 'animal':
        return this.state.animals.has(id) ? { entity: 'animal' } : null;
      case 'unit': {
        const u = this.state.units.get(id);
        return u ? { entity: 'unit', own: u.tribe === tribeId } : null;
      }
      case 'building': {
        const b = this.state.buildings.get(id);
        return b ? { entity: 'building', own: b.tribe === tribeId, built: this.isBuilt(b), kind: b.kind as BuildingKind } : null;
      }
      case 'tribe':
        return this.state.tribes.has(id) ? { entity: 'tribe', own: id === tribeId } : null;
      default:
        return null;
    }
  }

  /** Ратуша, к которой точка ближе WILD_DISTANCE: там звери не бродят. */
  nearCamp(p: Pt): Tribe | null {
    for (const t of this.state.tribes.values()) if (dist2(p, t) < WILD_DISTANCE * WILD_DISTANCE) return t;
    return null;
  }

  inFireZone(p: Pt): Tribe | null {
    for (const t of this.state.tribes.values()) if (dist2(p, t) < FIRE_SAFE_RADIUS * FIRE_SAFE_RADIUS) return t;
    return null;
  }

  // ---------- урон ----------

  damageUnit(u: Unit, amount: number, sourceId: string) {
    const d = this.units.get(u.id);
    if (!d) return;
    d.hp -= amount;
    d.lastAttacker = sourceId;
    d.attackedAt = this.time;
    setIfChanged(u, 'hp', Math.max(0, Math.ceil(d.hp)));
  }

  damageAnimal(a: Animal, amount: number, sourceId: string) {
    const d = this.animals.get(a.id);
    if (!d) return;
    d.hp -= amount;
    d.lastAttacker = sourceId;
    setIfChanged(a, 'hp', Math.max(0, Math.ceil(d.hp)));
    const src = this.locate(sourceId);
    if (a.kind === 'deer') {
      d.fleeFrom = src;
      d.fleeT = 3;
      return;
    }
    d.angerBy = sourceId;
    d.angerT = 12;
    if (a.kind === 'mammoth') {
      // стадо защищает своих
      for (const m of this.state.animals.values()) {
        if (m.kind !== 'mammoth' || m === a || dist2(m, a) > 280 * 280) continue;
        const md = this.animals.get(m.id)!;
        md.angerBy = sourceId;
        md.angerT = 12;
      }
    }
  }

  damageBuilding(b: Building, amount: number) {
    const d = this.buildings.get(b.id);
    if (!d) return;
    d.hp -= amount;
    setIfChanged(b, 'hp', Math.max(0, Math.ceil(d.hp)));
  }

  /** Вождь умер — вождём становится самый старший мужчина племени. */
  private passChief(tribeId: string) {
    let best: Unit | null = null;
    for (const u of this.state.units.values()) if (u.tribe === tribeId && u.kind === 'warrior' && (!best || u.age > best.age)) best = u;
    if (!best) return;
    best.chief = true;
    this.log(tribeId, `Новый вождь племени — ${best.name} (${yearsText(best.age)}).`, 'good');
  }

  /** Описание убийцы для сообщений. */
  private killerName(sourceId: string): string {
    if (sourceId === 'hunger') return 'от голода';
    if (sourceId === 'age') return 'от старости';
    const a = this.state.animals.get(sourceId);
    if (a) return `— ${ANIMAL_LABEL[a.kind as AnimalKind].toLowerCase()}`;
    const u = this.state.units.get(sourceId);
    if (u) return `— воины «${this.state.tribes.get(u.tribe)?.name ?? 'врагов'}»`;
    return '';
  }

  /** Убираем погибших и уничтоженное. */
  private reap() {
    for (const [id, d] of this.animals) {
      if (d.hp > 0) continue;
      const a = this.state.animals.get(id)!;
      const carcass = this.addResource('carcass', a.x, a.y, ANIMAL_STATS[a.kind as AnimalKind].meat);
      this.carcassOf.set(id, carcass.id);
      const killer = this.state.units.get(d.lastAttacker);
      if (killer) {
        const tribe = this.state.tribes.get(killer.tribe);
        if (tribe) {
          tribe.kills++;
          if (a.kind === 'mammoth') this.log(tribe.id, 'МАМОНТ ПОВЕРЖЕН! Отправьте людей разделать тушу — это очень много мяса.', 'good');
          else if (a.kind !== 'deer') this.log(tribe.id, `${killer.name} убил: ${ANIMAL_LABEL[a.kind as AnimalKind].toLowerCase()}.`, 'good');
        }
      }
      this.state.animals.delete(id);
      this.animals.delete(id);
    }
    for (const [id, d] of this.units) {
      if (d.hp > 0) continue;
      const u = this.state.units.get(id)!;
      this.cancelJob(u, d);
      const partner = u.partner ? this.state.units.get(u.partner) : undefined;
      if (partner) partner.partner = '';
      if (u.home) {
        const b = this.state.buildings.get(u.home);
        if (b) {
          if (b.familyMan === id) b.familyMan = '';
          if (b.familyWoman === id) b.familyWoman = '';
        }
      }
      if (d.lastAttacker === 'age') {
        this.log(u.tribe, `${u.name} ${u.sex === 'm' ? 'умер' : 'умерла'} от старости в ${yearsText(u.age)}.`, 'bad');
      } else {
        const who = u.kind === 'warrior' ? 'Погиб воин' : u.kind === 'woman' ? 'Погибла женщина' : 'Погиб ребёнок';
        this.log(u.tribe, `${who} ${u.name} ${this.killerName(d.lastAttacker)}.`.replace(' .', '.'), 'bad');
      }
      this.deleteUnit(id);
      if (u.chief) this.passChief(u.tribe);
    }
    for (const [id, d] of this.buildings) {
      if (d.hp > 0) continue;
      const b = this.state.buildings.get(id)!;
      this.log(b.tribe, 'Наша хижина разрушена!', 'bad');
      this.deleteBuilding(id);
    }
    for (const t of [...this.state.tribes.values()]) {
      let alive = false;
      for (const u of this.state.units.values())
        if (u.tribe === t.id) {
          alive = true;
          break;
        }
      if (!alive) this.removeTribe(t.id, 'extinct');
    }
  }

  // ---------- приказы ----------

  /** Сменить работу человека, корректно отменив текущую (например, вернуть еду за роды). */
  setJob(u: Unit, job: Job, resume: Job | null = null) {
    const d = this.units.get(u.id);
    if (!d) return;
    this.cancelJob(u, d);
    d.job = job;
    d.resume = resume;
    d.path = null;
    d.pathGoal = null;
    d.drop = 0;
    setIfChanged(u, 'action', job.type);
  }

  private cancelJob(u: Unit, d: UnitData) {
    const j = d.job;
    if (j.type === 'birth') {
      u.inside = '';
      const b = this.state.buildings.get(j.building);
      const bd = b && this.buildings.get(b.id);
      if (b && bd) {
        bd.birth = 0;
        b.birth = 0;
      }
      const tribe = this.state.tribes.get(u.tribe);
      if (tribe && j.paid) this.addTribeRes(tribe, j.paid, 0);
      j.paid = 0;
    }
    if (j.type === 'eat') {
      const bd = this.buildings.get(j.kitchen);
      j.seat = -1;
      if (bd) {
        bd.seats = bd.seats.map((id) => (id === u.id ? '' : id));
        bd.queue = bd.queue.filter((id) => id !== u.id);
      }
    }
    if (j.type === 'cook') {
      const b = this.state.buildings.get(j.kitchen);
      if (b && b.cook === u.id) b.cook = '';
    }
    if (j.type === 'craft') {
      const tribe = this.state.tribes.get(u.tribe);
      if (tribe && j.paid) this.addTribeRes(tribe, 0, j.paid);
      j.paid = 0;
    }
  }

  command(tribeId: string, cmd: Command) {
    applyCommand(this, tribeId, cmd);
  }

  // ---------- главный цикл ----------

  tick(dt: number) {
    this.time += dt;
    updateTribes(this, dt);
    for (const u of this.state.units.values()) updateUnit(this, u, dt);
    separateUnits(this);
    for (const a of this.state.animals.values()) updateAnimal(this, a, dt);

    for (const r of this.state.resources.values()) {
      const amount = this.resAmount.get(r.id) ?? 0;
      if (r.kind === 'carcass') {
        const ttl = (this.carcassTtl.get(r.id) ?? 0) - dt;
        this.carcassTtl.set(r.id, ttl);
        if (ttl <= 0 || amount < 0.5) this.removeResource(r.id);
      }
    }
    for (const [aid, rid] of this.carcassOf) if (!this.state.resources.has(rid)) this.carcassOf.delete(aid);

    this.reap();

    this.spawnT += dt;
    if (this.spawnT > 2) {
      this.spawnT = 0;
      spawnAnimals(this);
      this.ensureBots();
    }
    this.botT += dt;
    if (this.botT > 1.5) {
      this.botT = 0;
      runBots(this);
    }
  }

  private ensureBots() {
    const bots = [...this.state.tribes.values()].filter((t) => t.bot);
    if (bots.length >= this.botTribes) return;
    const used = new Set([...this.state.tribes.values()].map((t) => t.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? 'Дикое племя';
    this.createTribe(name, true);
    this.events.chat(`${name} построило ратушу.`);
  }
}
