import {
  ANIMAL_STATS,
  BUILDING_STATS,
  CRAWL,
  DEPOSIT_RADIUS,
  FIRE_SAFE_RADIUS,
  KITCHEN,
  LIMITS,
  RESOURCE_STATS,
  RUN_K,
  SPEAR_SAFE,
  TIMES,
  UNARMED,
  UNIT_STATS,
  WEAPONS,
  WEAPON_LABEL,
  entityType,
  type AnimalKind,
  type BuildingKind,
  type ResourceKind,
  type UnitKind,
  type WeaponKind,
} from '@game/shared';
import type { Building, Tribe, Unit } from '../state/schema';
import type { Job, UnitData, World } from './World';
import { dist, dist2, nearest, setIfChanged } from './util';

/** Шаг к точке с обходом непроходимых клеток «скольжением» вдоль препятствия. */
function step(w: World, u: Unit, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - u.x, dy = ty - u.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return true;
  const s = Math.min(speed * dt, len);
  let nx = u.x + (dx / len) * s, ny = u.y + (dy / len) * s;
  if (!w.grid.walkableAt(nx, ny) && w.grid.walkableAt(u.x, u.y)) {
    if (w.grid.walkableAt(nx, u.y)) ny = u.y;
    else if (w.grid.walkableAt(u.x, ny)) nx = u.x;
    else return true;
  }
  // сквозь постройки не ходим: упёрлись в основание — скользим вдоль его края
  const q = w.outsideBuildings(nx, ny);
  if (!w.grid.walkableAt(q.x, q.y) && w.grid.walkableAt(u.x, u.y)) return true;
  u.x = q.x;
  u.y = q.y;
  if (Math.abs(dx) > 0.5) setIfChanged(u, 'dir', dx > 0 ? 1 : -1);
  return s >= len - 0.01;
}

/** Идти к точке по пути A*. Возвращает true, когда подошли на расстояние stop (или ближе нельзя). */
function goTo(w: World, u: Unit, d: UnitData, x0: number, y0: number, stop: number, dt: number, run = 1): boolean {
  // цель внутри постройки — идём к её краю
  const { x, y } = w.outsideBuildings(x0, y0);
  if (Math.hypot(x - u.x, y - u.y) <= stop) {
    d.path = null;
    return true;
  }
  d.repath -= dt;
  const moved = d.pathGoal ? Math.hypot(d.pathGoal.x - x, d.pathGoal.y - y) : Infinity;
  if (!d.path || moved > 30 || (d.repath <= 0 && moved > 4)) {
    d.path = w.grid.findPath(u, { x, y });
    d.pathGoal = { x, y };
    d.repath = 0.6;
    if (!d.path) {
      d.path = [];
      return true;
    }
  }
  const next = d.path[0];
  if (!next) return true;
  const crawl = u.kind === 'child' && u.growth < CRAWL.until ? CRAWL.speed : 1;
  const speed = UNIT_STATS[u.kind as UnitKind].speed * run * crawl;
  if (step(w, u, next.x, next.y, speed, dt)) d.path.shift();
  return Math.hypot(x - u.x, y - u.y) <= stop;
}

/** Сдать ношу. Сколько не влезло (склады полны) — остаётся в руках; возвращает true, если сдал всё. */
function deposit(w: World, u: Unit, d: UnitData, tribe: Tribe): boolean {
  if (d.carry > 0) {
    const wood = u.carryType === 'wood';
    const res = w.tribeRes(tribe);
    const put = Math.max(0, Math.min(d.carry, tribe.resCap - (wood ? res.wood : res.food)));
    if (wood) w.addTribeRes(tribe, 0, put);
    else w.addTribeRes(tribe, put, 0);
    d.carry -= put;
    if (d.carry >= 0.5) {
      setIfChanged(u, 'carry', Math.floor(d.carry));
      w.warnFull(tribe, wood);
      return false;
    }
  }
  d.carry = 0;
  setIfChanged(u, 'carry', 0);
  setIfChanged(u, 'carryType', '');
  return true;
}

/** Куда сдавать добычу: ратуша или ближайший готовый склад племени. */
function dropPoint(w: World, u: { x: number; y: number; tribe: string }, tribe: Tribe): { x: number; y: number; r: number } {
  let best = { x: tribe.x, y: tribe.y, r: DEPOSIT_RADIUS };
  let bestD = Math.hypot(u.x - tribe.x, u.y - tribe.y);
  for (const b of w.state.buildings.values()) {
    if (b.tribe !== u.tribe || b.kind !== 'storage' || !w.isBuilt(b)) continue;
    const d = Math.hypot(u.x - b.x, u.y - b.y);
    if (d < bestD) {
      bestD = d;
      best = { x: b.x, y: b.y + 8, r: BUILDING_STATS.storage.radius + 16 };
    }
  }
  return best;
}

function idle(w: World, u: Unit, d: UnitData) {
  const resume = d.resume;
  w.setJob(u, resume ?? { type: 'idle' });
}

/** Расстояние между мужем и женой, когда они идут за руку. */
const HAND_GAP = 16;

// ---------- работы ----------

function doGather(w: World, u: Unit, d: UnitData, job: Extract<Job, { type: 'gather' }>, tribe: Tribe, dt: number) {
  const cap = UNIT_STATS[u.kind as UnitKind].carry;
  const wantType = job.kind === 'tree' ? 'wood' : 'food';
  if (d.carry > 0 && u.carryType && u.carryType !== wantType) job.returning = true;
  if (d.carry >= cap - 0.01) job.returning = true;

  const res = w.state.resources.get(job.res);
  if (job.returning) {
    const drop = dropPoint(w, u, tribe);
    if (goTo(w, u, d, drop.x, drop.y, drop.r, dt)) {
      d.path = null;
      // склады полны — человек ждёт с ношей, пока не освободится место
      if (!deposit(w, u, d, tribe)) return w.setJob(u, { type: 'idle' });
      job.returning = false;
    }
    return;
  }
  if (!res || w.amountOf(res) < 0.5) {
    // ресурс кончился — ищем такой же рядом
    const from = res ?? u;
    const next = nearest(w.state.resources.values(), from, (r) => r.kind === job.kind && w.amountOf(r) >= 1, 350);
    if (next) {
      job.res = next.id;
      d.path = null;
      return;
    }
    if (d.carry > 0) job.returning = true;
    else {
      w.log(u.tribe, `${u.name}: здесь больше нечего добывать.`);
      idle(w, u, d);
    }
    return;
  }
  const stop = res.kind === 'tree' ? 24 : 18;
  if (goTo(w, u, d, res.x, res.y + 4, stop, dt)) {
    const take = Math.min(RESOURCE_STATS[res.kind as ResourceKind].gatherRate * dt, w.amountOf(res), cap - d.carry);
    w.setAmount(res, w.amountOf(res) - take);
    d.carry += take;
    setIfChanged(u, 'carry', Math.floor(d.carry));
    setIfChanged(u, 'carryType', wantType);
    setIfChanged(u, 'dir', res.x > u.x ? 1 : -1);
    d.task = res.kind === 'tree' ? 'chop' : 'pick';
    if (d.carry >= cap - 0.01) job.returning = true;
  }
}

/** Боевые качества: копьё бьёт издалека, топор — вплотную и сильнее, без оружия — кулаками. */
function fightStats(u: Unit) {
  const st = UNIT_STATS[u.kind as UnitKind];
  if (u.kind !== 'warrior') return st;
  const wpn = WEAPONS[u.weapon as WeaponKind];
  return wpn ? { ...st, ...wpn } : { ...st, ...UNARMED };
}

function doAttack(w: World, u: Unit, d: UnitData, job: Extract<Job, { type: 'attack' }>, dt: number) {
  const st = fightStats(u);
  const kind = entityType(job.target);
  const target =
    kind === 'animal' ? w.state.animals.get(job.target) : kind === 'unit' ? w.state.units.get(job.target) : w.state.buildings.get(job.target);
  if (!target || target.hp <= 0) {
    const carcass = w.carcassOf.get(job.target);
    if (carcass && w.state.resources.has(carcass) && !job.auto) {
      w.setJob(u, { type: 'gather', res: carcass, kind: 'carcass', returning: false });
    } else idle(w, u, d);
    return;
  }
  const loc = w.locate(job.target)!;
  const range = st.range + loc.r;
  const dd = dist(u, loc);
  if (job.auto && dd > 400) {
    idle(w, u, d);
    return;
  }
  // копейщик держит дистанцию: подошедшая цель — отбегаем, бросать на бегу нельзя
  const retreat = u.weapon === 'spear' && kind !== 'building' && dd < SPEAR_SAFE + loc.r;
  if (retreat) {
    d.path = null;
    const k = 1 / Math.max(1, dd), ox = u.x, oy = u.y;
    step(w, u, u.x + (u.x - loc.x) * k * 40, u.y + (u.y - loc.y) * k * 40, UNIT_STATS.warrior.speed * RUN_K, dt);
    // упёрся (вода, постройка) — бьёт с места
    if (Math.hypot(u.x - ox, u.y - oy) > 0.2) return;
  }
  if (dd > range) {
    // к цели — бегом
    goTo(w, u, d, loc.x, loc.y, Math.max(4, range - 8), dt, RUN_K);
  } else {
    d.path = null;
    setIfChanged(u, 'dir', loc.x > u.x ? 1 : -1);
  }
  if (dd <= range + 4 && d.cd <= 0) {
    d.cd = st.cooldown;
    w.events.fx(u.id, u.weapon === 'spear' ? [Math.round(u.x), Math.round(u.y - 14), Math.round(loc.x), Math.round(loc.y - 10)] : null);
    const dmg = st.damage * (0.85 + Math.random() * 0.3);
    if (kind === 'animal') w.damageAnimal(target as never, dmg, u.id);
    else if (kind === 'unit') w.damageUnit(target as never, dmg, u.id);
    else w.damageBuilding(target as never, dmg * 0.6);
  }
}

/** Ближайшая готовая кузница племени. */
export function forgeNear(w: World, u: { x: number; y: number }, tribeId: string): Building | null {
  return nearest(w.state.buildings.values(), u, (b) => b.tribe === tribeId && b.kind === 'forge' && w.isBuilt(b));
}

function doCraft(w: World, u: Unit, d: UnitData, job: Extract<Job, { type: 'craft' }>, tribe: Tribe, dt: number) {
  if (u.weapon === job.weapon) return idle(w, u, d);
  const forge = w.state.buildings.get(job.forge);
  if (!forge || !w.isBuilt(forge)) {
    const other = forgeNear(w, u, u.tribe);
    if (!other) {
      w.log(u.tribe, `${u.name}: кузницы больше нет.`, 'bad');
      return idle(w, u, d);
    }
    job.forge = other.id;
    d.path = null;
    return;
  }
  const r = BUILDING_STATS.forge.radius;
  if (!goTo(w, u, d, forge.x, forge.y + 8, r + 14, dt)) return;
  const cost = WEAPONS[job.weapon].wood, what = WEAPON_LABEL[job.weapon].toLowerCase();
  if (!job.paid) {
    // дерево берём, когда пришли: работу могли прервать и вернуть дерево
    if (w.tribeRes(tribe).wood < cost) {
      w.log(u.tribe, `${u.name}: не хватает дерева на ${what}, нужно ${cost} 🪵.`, 'bad');
      return idle(w, u, d);
    }
    w.addTribeRes(tribe, 0, -cost);
    job.paid = cost;
  }
  setIfChanged(u, 'dir', forge.x > u.x ? 1 : -1);
  d.task = 'build';
  job.progress += dt / WEAPONS[job.weapon].time;
  if (job.progress < 1) return;
  job.paid = 0;
  u.armed = true;
  u.weapon = job.weapon;
  w.log(
    u.tribe,
    job.weapon === 'spear'
      ? `${u.name} сделал копьё! Теперь он воин и может охотиться издалека.`
      : `${u.name} сделал топор! Теперь он воин: бьёт вплотную, но сильно.`,
    'good',
  );
  idle(w, u, d);
}

function hutOf(w: World, u: Unit, id: string): Building | null {
  const b = w.state.buildings.get(id);
  return b && b.tribe === u.tribe ? b : null;
}

/** Хижина для семьи — склад для этого не годится. */
const homeOf = (w: World, u: Unit, id: string) => {
  const b = hutOf(w, u, id);
  return b && b.kind === 'hut' ? b : null;
};

function doBuild(w: World, u: Unit, d: UnitData, job: Extract<Job, { type: 'build' }>, dt: number) {
  const b = hutOf(w, u, job.building);
  const bd = b && w.buildings.get(b.id);
  if (!b || !bd || bd.progress >= 1) return idle(w, u, d);
  const r = BUILDING_STATS[b.kind as BuildingKind].radius;
  if (goTo(w, u, d, b.x, b.y + 8, r + 14, dt)) {
    setIfChanged(u, 'dir', b.x > u.x ? 1 : -1);
    d.task = 'build';
    bd.progress = Math.min(1, bd.progress + dt / BUILDING_STATS[b.kind as BuildingKind].buildTime);
    setIfChanged(b, 'progress', Math.floor(bd.progress * 100));
    if (bd.progress >= 1) {
      w.log(
        u.tribe,
        b.kind === 'storage'
          ? `Склад построен! Места под еду и дерево стало больше, добыча сносится сюда, если он ближе ратуши.`
          : b.kind === 'forge'
            ? 'Кузница построена! Выделите жителей и сделайте им копья или топоры.'
            : b.kind === 'kitchen'
              ? 'Кухня построена! Выделите женщину и кликните ПКМ по кухне — она станет поваром. Раненые сами придут сюда поесть.'
            : 'Хижина построена! Граница племени раздвинулась, места для людей стало больше. Заселите сюда семью.',
        'good',
      );
      idle(w, u, d);
    }
  }
}

function doSettle(w: World, u: Unit, d: UnitData, job: Extract<Job, { type: 'settle' }>, dt: number) {
  const b = homeOf(w, u, job.building);
  if (!b || !w.isBuilt(b)) return idle(w, u, d);
  const partner = u.partner ? w.state.units.get(u.partner) : undefined;
  if (!partner) {
    w.log(u.tribe, `${u.name} не в семье. Сначала создайте семью: выделите мужчину и женщину и нажмите «Создать семью».`, 'bad');
    return idle(w, u, d);
  }
  const family = [b.familyMan, b.familyWoman].filter(Boolean);
  if (family.some((id) => id !== u.id && id !== partner.id)) {
    w.log(u.tribe, 'В этой хижине уже живёт другая семья.', 'bad');
    return idle(w, u, d);
  }
  const man = u.sex === 'm' ? u : partner;
  const woman = u.sex === 'm' ? partner : u;
  // супруг уже заселил семью — просто подходим к дому
  const settled = b.familyMan === man.id && b.familyWoman === woman.id;
  if (!goTo(w, u, d, b.x, b.y + 10, BUILDING_STATS.hut.radius + 14, dt)) return;
  if (settled) return idle(w, u, d);
  settleFamily(w, b, man, woman);
  w.log(u.tribe, `Семья ${man.name} и ${woman.name} поселилась в хижине. Выберите хижину, чтобы родить ребёнка.`, 'good');
  idle(w, u, d);
}

/** Поселить мужа и жену в хижину, выселив из прежних. */
export function settleFamily(w: World, b: Building, man: Unit, woman: Unit) {
  for (const p of [man, woman]) {
    if (p.home && p.home !== b.id) {
      const old = w.state.buildings.get(p.home);
      if (old) {
        if (old.familyMan === p.id) old.familyMan = '';
        if (old.familyWoman === p.id) old.familyWoman = '';
      }
    }
    p.home = b.id;
  }
  b.familyMan = man.id;
  b.familyWoman = woman.id;
}

/**
 * Муж и жена идут в хижину, держась за руки: жена ведёт, муж идёт рядом.
 * У двери оба заходят внутрь (их не видно), хижина трясётся — и через время выходят с ребёнком.
 */
function doBirth(w: World, u: Unit, d: UnitData, job: Extract<Job, { type: 'birth' }>, tribe: Tribe, dt: number) {
  const b = homeOf(w, u, job.building);
  const bd = b && w.buildings.get(b.id);
  const partner = u.partner ? w.state.units.get(u.partner) : undefined;
  const pj = partner && w.units.get(partner.id)?.job;
  if (!b || !bd || !partner || pj?.type !== 'birth' || pj.building !== b.id) {
    u.inside = '';
    return idle(w, u, d);
  }
  const door = { x: b.x, y: b.y + 8 };
  if (u.sex === 'm') {
    // муж держит жену за руку и идёт с её стороны; внутри — ждёт
    if (u.inside) return;
    const side = u.x <= partner.x ? -1 : 1;
    goTo(w, u, d, partner.x + side * HAND_GAP, partner.y, 3, dt);
    return;
  }
  if (!u.inside) {
    // жена ждёт мужа, если он отстал
    if (Math.hypot(partner.x - u.x, partner.y - u.y) > HAND_GAP * 2.5) return;
    if (!goTo(w, u, d, door.x, door.y, 14, dt)) return;
    for (const p of [u, partner]) {
      p.inside = b.id;
      p.x = door.x;
      p.y = door.y;
    }
    return;
  }
  bd.birth = Math.min(1, bd.birth + dt / TIMES.birth);
  setIfChanged(b, 'birth', Math.max(1, Math.floor(bd.birth * 100)));
  if (bd.birth < 1) return;
  job.paid = 0;
  bd.birth = 0;
  b.birth = 0;
  const sex = Math.random() < 0.5 ? 'm' : 'f';
  const child = w.spawnUnit(tribe, 'child', sex, door.x, door.y + 22);
  child.home = b.id;
  b.kids++;
  tribe.born++;
  w.log(
    u.tribe,
    sex === 'm' ? `Родился сын ${child.name}! Через минуту он станет жителем.` : `Родилась дочь ${child.name}! Через минуту она станет женщиной.`,
    'good',
  );
  if (b.kids >= LIMITS.kidsPerHut) w.log(u.tribe, 'В этой хижине больше нет места для детей — постройте новую.');
  // выходят из хижины по обе стороны от ребёнка
  u.inside = partner.inside = '';
  u.x = door.x + 14;
  partner.x = door.x - 14;
  u.y = partner.y = door.y + 14;
  idle(w, u, d);
  idle(w, partner, w.units.get(partner.id)!);
}

// ---------- кухня ----------

/** Где на кухне стоит повар и где сидят обедающие — от центра очага (совпадает с картинкой building/kitchen). */
const COOK_SPOT = { x: 40, y: 26 };
export const KITCHEN_SEATS = [
  { x: -72, y: -2 },
  { x: 72, y: -2 },
  { x: -41, y: -24 },
  { x: 41, y: -24 },
];
/** Когда последний раз говорили племени, что повару нечего варить (чтобы не повторять). */
const noFoodWarned = new Map<string, number>();

function kitchenOf(w: World, u: Unit, id: string): Building | null {
  const b = w.state.buildings.get(id);
  return b && b.tribe === u.tribe && b.kind === 'kitchen' && w.isBuilt(b) ? b : null;
}

/** Ближайшая готовая кухня племени. */
export function kitchenNear(w: World, u: { x: number; y: number }, tribeId: string): Building | null {
  return nearest(w.state.buildings.values(), u, (b) => b.tribe === tribeId && b.kind === 'kitchen' && w.isBuilt(b));
}

/**
 * Повар: если в руках еда — несёт её на кухню; есть сырая еда — варит порцию;
 * порций мало — идёт за едой на склад или в ратушу; всё сварено — ждёт у очага.
 */
function doCook(w: World, u: Unit, d: UnitData, job: Extract<Job, { type: 'cook' }>, tribe: Tribe, dt: number) {
  const b = kitchenOf(w, u, job.kitchen);
  const bd = b && w.buildings.get(b.id);
  if (!b || !bd) {
    w.log(u.tribe, `${u.name}: кухни больше нет.`, 'bad');
    return idle(w, u, d);
  }
  const other = b.cook && b.cook !== u.id ? w.units.get(b.cook) : undefined;
  if (other?.job.type === 'cook' && other.job.kitchen === b.id) {
    w.log(u.tribe, `${u.name}: на этой кухне уже есть повар.`, 'bad');
    return idle(w, u, d);
  }
  setIfChanged(b, 'cook', u.id);
  const spot = { x: b.x + COOK_SPOT.x, y: b.y + COOK_SPOT.y };
  if (d.carry > 0 && u.carryType === 'wood') {
    // дерево из рук — сначала на склад
    const drop = dropPoint(w, u, tribe);
    if (goTo(w, u, d, drop.x, drop.y, drop.r, dt)) deposit(w, u, d, tribe);
    return;
  }
  if (d.carry > 0) {
    if (!goTo(w, u, d, spot.x, spot.y, 8, dt)) return;
    bd.raw += d.carry;
    d.carry = 0;
    setIfChanged(u, 'carry', 0);
    setIfChanged(u, 'carryType', '');
    return;
  }
  if (bd.raw >= KITCHEN.mealFood - 0.01 && bd.meals < KITCHEN.mealMax) {
    if (!goTo(w, u, d, spot.x, spot.y, 8, dt)) return;
    setIfChanged(u, 'dir', -1);
    d.task = 'pick';
    job.progress += dt / KITCHEN.cookTime;
    if (job.progress >= 1) {
      job.progress = 0;
      bd.raw -= KITCHEN.mealFood;
      bd.meals = Math.min(KITCHEN.mealMax, bd.meals + 1);
      setIfChanged(b, 'meals', Math.ceil(bd.meals - 1e-6));
    }
    return;
  }
  const need = KITCHEN.mealMax - bd.meals - bd.raw / KITCHEN.mealFood;
  const food = w.tribeRes(tribe).food;
  if (need < 1 || food < 1) {
    if (need >= 1 && Date.now() - (noFoodWarned.get(tribe.id) ?? 0) > 30000) {
      noFoodWarned.set(tribe.id, Date.now());
      w.log(u.tribe, `${u.name}: на складе нет еды — нечего готовить. Отправьте людей за ягодами и на охоту.`, 'bad');
    }
    goTo(w, u, d, spot.x, spot.y, 8, dt);
    return;
  }
  // за едой — в ближайшее к кухне место, куда её сносят
  const drop = dropPoint(w, b, tribe);
  if (!goTo(w, u, d, drop.x, drop.y, drop.r, dt)) return;
  const take = Math.min(UNIT_STATS[u.kind as UnitKind].carry, food, Math.ceil(need) * KITCHEN.mealFood);
  w.addTribeRes(tribe, -take, 0);
  d.carry = take;
  setIfChanged(u, 'carry', Math.floor(take));
  setIfChanged(u, 'carryType', 'food');
}

/**
 * Раненый на кухне: садится на свободное место у очага (или ждёт снаружи в очереди), ест сваренное
 * и лечится; наелся — возвращается к прежней работе.
 */
function doEat(w: World, u: Unit, d: UnitData, job: Extract<Job, { type: 'eat' }>, dt: number) {
  const b = kitchenOf(w, u, job.kitchen);
  const bd = b && w.buildings.get(b.id);
  if (!b || !bd || d.hp >= u.maxHp) return idle(w, u, d);
  if (job.seat < 0) {
    const free = bd.seats.indexOf('');
    if (free >= 0 && (!bd.queue.length || bd.queue[0] === u.id)) {
      bd.seats[free] = u.id;
      bd.queue = bd.queue.filter((id) => id !== u.id);
      job.seat = free;
      d.path = null;
    } else {
      // мест нет — встаёт в очередь перед кухней и ждёт, пока кто-нибудь не выйдет
      if (!bd.queue.includes(u.id) && dist(u, b) < 200) bd.queue.push(u.id);
      const i = Math.max(0, bd.queue.indexOf(u.id));
      const r = BUILDING_STATS.kitchen.radius;
      goTo(w, u, d, b.x - 40 + (i % 5) * 20, b.y + r + 12 + Math.floor(i / 5) * 18, 6, dt);
      return;
    }
  }
  const seat = KITCHEN_SEATS[job.seat];
  if (!goTo(w, u, d, b.x + seat.x, b.y + seat.y, 5, dt)) return;
  setIfChanged(u, 'dir', seat.x > 0 ? -1 : 1);
  // порций нет — сидит и ждёт, пока повар сварит
  if (bd.meals <= 0.001) return;
  d.task = 'pick';
  const perMeal = KITCHEN.mealHeal * u.maxHp;
  const heal = Math.min(u.maxHp * KITCHEN.eatRate * dt, u.maxHp - d.hp, bd.meals * perMeal);
  d.hp += heal;
  bd.meals = Math.max(0, bd.meals - heal / perMeal);
  setIfChanged(u, 'hp', Math.ceil(d.hp));
  setIfChanged(b, 'meals', Math.ceil(bd.meals - 1e-6));
  if (d.hp >= u.maxHp - 0.01) {
    d.hp = u.maxHp;
    setIfChanged(u, 'hp', u.maxHp);
    idle(w, u, d);
  }
}

/** Отправить поесть по приказу игрока: 'full' — сыт, 'none' — нет кухни. */
export function sendToEat(w: World, u: Unit, kitchenId?: string): 'ok' | 'full' | 'none' {
  const d = w.units.get(u.id);
  if (!d) return 'none';
  if (d.hp >= u.maxHp) return 'full';
  const k = kitchenId ? kitchenOf(w, u, kitchenId) : kitchenNear(w, u, u.tribe);
  if (!k) return 'none';
  if (d.job.type === 'eat' && d.job.kitchen === k.id) return 'ok';
  w.setJob(u, { type: 'eat', kitchen: k.id, seat: -1 });
  return 'ok';
}

/** Раненый (меньше KITCHEN.hungryAt здоровья) сам бросает дела и идёт есть на кухню, потом вернётся к работе. */
function goEatIfHurt(w: World, u: Unit, d: UnitData) {
  if (u.inside || d.hp >= u.maxHp * KITCHEN.hungryAt) return;
  const t = d.job.type;
  if (t === 'eat' || t === 'birth' || t === 'flee') return;
  const k = kitchenNear(w, u, u.tribe);
  if (!k) return;
  const resume = t === 'idle' || t === 'move' || (t === 'attack' && d.job.auto) ? null : d.job;
  w.setJob(u, { type: 'eat', kitchen: k.id, seat: -1 }, resume);
}

// ---------- реакция на опасность ----------

function isHostileAnimalNear(w: World, u: Unit, radius: number): string {
  let best = '';
  let bestD = radius * radius;
  for (const a of w.state.animals.values()) {
    const ad = w.animals.get(a.id)!;
    const hostile = (ANIMAL_STATS[a.kind as AnimalKind].aggro > 0 && ad.fed <= 0) || ad.angerT > 0;
    if (!hostile) continue;
    const dd = dist2(a, u);
    if (dd < bestD) {
      bestD = dd;
      best = a.id;
    }
  }
  return best;
}

function reactToDanger(w: World, u: Unit, d: UnitData) {
  const attacked = d.lastAttacker && w.time - d.attackedAt < 2.5 && d.lastAttacker !== 'hunger';
  const attackerAlive = attacked && (w.state.animals.has(d.lastAttacker) || w.state.units.has(d.lastAttacker));
  if (u.kind === 'warrior') {
    // раненый уходит есть и в драку не ввязывается
    const busyFighting = d.job.type === 'attack' || d.job.type === 'eat';
    if (busyFighting) return;
    let target = attackerAlive ? d.lastAttacker : '';
    // стоящий без дела воин сам встречает хищника, подошедшего близко
    if (!target && (d.job.type === 'idle' || d.job.type === 'gather' || d.job.type === 'build')) target = isHostileAnimalNear(w, u, 170);
    if (target) w.setJob(u, { type: 'attack', target, auto: true }, d.job.type === 'idle' ? null : d.job);
    return;
  }
  if (d.job.type === 'flee') return;
  // женщины и дети убегают на стоянку от нападения или от зверя, который на них охотится
  let hunted = attackerAlive;
  if (!hunted) {
    for (const [id, ad] of w.animals) {
      if (ad.target !== u.id && ad.angerBy !== u.id) continue;
      const a = w.state.animals.get(id);
      if (a && dist2(a, u) < 220 * 220) {
        hunted = true;
        break;
      }
    }
  }
  if (hunted && !w.inFireZone(u)) w.setJob(u, { type: 'flee' });
}

function growChild(w: World, u: Unit, d: UnitData, dt: number) {
  d.growth = Math.min(1, d.growth + dt / TIMES.growUp);
  setIfChanged(u, 'growth', Math.floor(d.growth * 100));
  if (d.growth < 1) return;
  const kind: UnitKind = u.sex === 'm' ? 'warrior' : 'woman';
  u.kind = kind;
  // взрослым нужна своя хижина и своя семья
  u.home = '';
  u.maxHp = UNIT_STATS[kind].hp;
  d.hp = u.maxHp;
  u.hp = u.maxHp;
  w.setJob(u, { type: 'idle' });
  w.log(
    u.tribe,
    kind === 'warrior'
      ? `${u.name} вырос и стал жителем! Сделайте ему копьё — станет воином. Или создайте ему семью.`
      : `${u.name} выросла и стала женщиной! Создайте ей семью — в хижине у них будут дети.`,
    'good',
  );
}

export function updateUnit(w: World, u: Unit, dt: number) {
  const d = w.units.get(u.id);
  const tribe = w.state.tribes.get(u.tribe);
  if (!d || !tribe) return;
  d.cd = Math.max(0, d.cd - dt);
  if (u.kind === 'child') growChild(w, u, d, dt);
  if (!u.inside) reactToDanger(w, u, d);
  goEatIfHurt(w, u, d);
  d.task = '';

  const job = d.job;
  switch (job.type) {
    case 'move':
      if (goTo(w, u, d, job.x, job.y, 6, dt)) idle(w, u, d);
      break;
    case 'gather':
      doGather(w, u, d, job, tribe, dt);
      break;
    case 'deposit': {
      const drop = dropPoint(w, u, tribe);
      if (goTo(w, u, d, drop.x, drop.y, drop.r, dt)) {
        deposit(w, u, d, tribe);
        idle(w, u, d);
      }
      break;
    }
    case 'attack':
      doAttack(w, u, d, job, dt);
      break;
    case 'build':
      doBuild(w, u, d, job, dt);
      break;
    case 'settle':
      doSettle(w, u, d, job, dt);
      break;
    case 'birth':
      doBirth(w, u, d, job, tribe, dt);
      break;
    case 'craft':
      doCraft(w, u, d, job, tribe, dt);
      break;
    case 'cook':
      doCook(w, u, d, job, tribe, dt);
      break;
    case 'eat':
      doEat(w, u, d, job, dt);
      break;
    case 'flee':
      if (goTo(w, u, d, tribe.x, tribe.y, FIRE_SAFE_RADIUS * 0.4, dt)) w.setJob(u, { type: 'idle' });
      break;
    case 'idle':
      break;
  }
  setIfChanged(u, 'task', d.task);
}

/** Мягко расталкиваем людей, чтобы они не стояли друг в друге. */
export function separateUnits(w: World) {
  const list = [...w.state.units.values()].filter((u) => !u.inside);
  const minD = 14;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) >= minD || Math.abs(dy) >= minD) continue;
      const dd = Math.hypot(dx, dy);
      if (dd >= minD) continue;
      const push = (minD - dd) / 2;
      const nx = dd > 0.01 ? dx / dd : Math.random() - 0.5, ny = dd > 0.01 ? dy / dd : Math.random() - 0.5;
      const ax = a.x - nx * push, ay = a.y - ny * push, bx = b.x + nx * push, by = b.y + ny * push;
      const pa = w.outsideBuildings(ax, ay), pb = w.outsideBuildings(bx, by);
      if (w.grid.walkableAt(pa.x, pa.y)) {
        a.x = pa.x;
        a.y = pa.y;
      }
      if (w.grid.walkableAt(pb.x, pb.y)) {
        b.x = pb.x;
        b.y = pb.y;
      }
    }
  }
}
