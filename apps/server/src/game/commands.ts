import {
  BUILDING_LABEL,
  BUILDING_STATS,
  type BuildingKind,
  COSTS,
  LIMITS,
  actionFor,
  marriageProblem,
  placementProblem,
  type Command,
  type FamilyCandidate,
  type UnitKind,
  WEAPONS,
  type WeaponKind,
} from '@game/shared';
import type { Tribe, Unit } from '../state/schema';
import type { World } from './World';
import { forgeNear, sendToEat, settleFamily } from './units';
import { nearest } from './util';

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 32;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.length <= 200 && v.every(isStr);

/** Проверяем форму приказа, пришедшего из сети. */
export function parseCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case 'move':
      return isIds(c.units) && isNum(c.x) && isNum(c.y) ? { type: 'move', units: c.units, x: c.x, y: c.y } : null;
    case 'act':
      return isIds(c.units) && isStr(c.target) ? { type: 'act', units: c.units, target: c.target } : null;
    case 'build':
      return isIds(c.units) && (c.building === 'hut' || c.building === 'storage' || c.building === 'forge' || c.building === 'kitchen' || c.building === 'training') && isNum(c.x) && isNum(c.y)
        ? { type: 'build', units: c.units, building: c.building, x: c.x, y: c.y }
        : null;
    case 'stop':
      return isIds(c.units) ? { type: 'stop', units: c.units } : null;
    case 'train':
      return isIds(c.units) ? { type: 'train', units: c.units } : null;
    case 'craft':
      return isIds(c.units) && (c.weapon === 'spear' || c.weapon === 'axe') ? { type: 'craft', units: c.units, weapon: c.weapon } : null;
    case 'eat':
      return isIds(c.units) ? { type: 'eat', units: c.units } : null;
    case 'marry':
      return isIds(c.units) && c.units.length === 2 ? { type: 'marry', units: [c.units[0], c.units[1]] } : null;
    case 'birth':
      return isStr(c.building) ? { type: 'birth', building: c.building } : null;
    default:
      return null;
  }
}

function ownUnits(w: World, tribeId: string, ids: string[]): Unit[] {
  const out: Unit[] = [];
  for (const id of new Set(ids)) {
    const u = w.state.units.get(id);
    if (u && u.tribe === tribeId) out.push(u);
  }
  return out;
}

/** Точки построения отряда вокруг цели (спираль), чтобы люди не толпились в одной точке. */
function formation(w: World, x: number, y: number, n: number) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 0 : 18 * Math.sqrt(i);
    const a = i * 2.39996;
    pts.push(w.grid.nearestWalkable(x + Math.cos(a) * r, y + Math.sin(a) * r) ?? { x, y });
  }
  return pts;
}

export function applyCommand(w: World, tribeId: string, cmd: Command) {
  const tribe = w.state.tribes.get(tribeId);
  if (!tribe) return;
  switch (cmd.type) {
    case 'move': {
      const units = ownUnits(w, tribeId, cmd.units);
      const pts = formation(w, cmd.x, cmd.y, units.length);
      units.forEach((u, i) => w.setJob(u, { type: 'move', x: pts[i].x, y: pts[i].y }));
      return;
    }
    case 'stop':
      for (const u of ownUnits(w, tribeId, cmd.units)) w.setJob(u, { type: 'idle' });
      return;
    case 'craft':
      return craft(w, tribe, ownUnits(w, tribeId, cmd.units), cmd.weapon);
    case 'act':
      return act(w, tribe, ownUnits(w, tribeId, cmd.units), cmd.target);
    case 'build':
      return build(w, tribe, ownUnits(w, tribeId, cmd.units), cmd.building, cmd.x, cmd.y);
    case 'eat':
      return eat(w, tribe, ownUnits(w, tribeId, cmd.units));
    case 'train':
      return train(w, tribe, ownUnits(w, tribeId, cmd.units));
    case 'marry':
      return marry(w, tribe, cmd.units);
    case 'birth':
      return birth(w, tribe, cmd.building);
  }
}

function act(w: World, tribe: Tribe, units: Unit[], target: string) {
  const info = w.describe(target, tribe.id);
  const loc = w.locate(target);
  if (!info || !loc) return;
  // мужчина и женщина, отправленные в свою готовую хижину, идут туда за ребёнком
  if (info.entity === 'building' && info.kind === 'hut' && info.own && info.built && units.length === 2) {
    const man = units.find((u) => u.sex === 'm' && u.kind !== 'child'), woman = units.find((u) => u.sex === 'f' && u.kind !== 'child');
    if (man && woman) return coupleToHut(w, tribe, man, woman, target);
  }
  const walkers: Unit[] = [];
  const full: Unit[] = [];
  const unarmed: Unit[] = [];
  for (const u of units) {
    const action = actionFor(u.kind as UnitKind, info, u.armed, u.trained);
    switch (action) {
      case 'gather': {
        const r = w.state.resources.get(target)!;
        w.setJob(u, { type: 'gather', res: target, kind: r.kind as never, returning: false });
        break;
      }
      case 'attack':
        w.setJob(u, { type: 'attack', target, auto: false });
        break;
      case 'build':
        w.setJob(u, { type: 'build', building: target });
        break;
      case 'settle':
        if (u.partner) w.setJob(u, { type: 'settle', building: target });
        else walkers.push(u);
        break;
      case 'deposit':
        w.setJob(u, { type: 'deposit' });
        break;
      case 'cook': {
        // у кухни один повар; если он уже есть — женщина идёт поесть, а одну из выделенных назначаем, только когда повара нет
        const b = w.state.buildings.get(target)!;
        const cook = b.cook && b.cook !== u.id ? w.units.get(b.cook) : undefined;
        if (cook?.job.type === 'cook' && cook.job.kitchen === target) {
          if (sendToEat(w, u, target) === 'full') full.push(u);
          break;
        }
        w.setJob(u, { type: 'cook', kitchen: target, progress: 0 });
        b.cook = u.id;
        break;
      }
      case 'eat':
        if (sendToEat(w, u, target) === 'full') full.push(u);
        break;
      case 'train':
        if (!u.armed) unarmed.push(u);
        else w.setJob(u, { type: 'train', ground: target, progress: 0, phase: 'run', t: 0, lap: 0 });
        break;
      default:
        walkers.push(u);
    }
  }
  if (full.length) w.log(tribe.id, fullText(full));
  if (unarmed.length) w.log(tribe.id, 'Тренироваться можно только с оружием — сначала сделайте копьё или топор в кузнице.', 'bad');
  if (info.entity === 'building' && info.kind === 'training' && units.some((u) => u.trained)) w.log(tribe.id, 'Воины уже обучены.');
  const pts = formation(w, loc.x, loc.y + loc.r + 10, walkers.length);
  walkers.forEach((u, i) => w.setJob(u, { type: 'move', x: pts[i].x, y: pts[i].y }));
  if (info.entity === 'building' && info.kind === 'hut' && info.own && info.built && units.length && units.every((u) => !u.partner)) {
    w.log(tribe.id, 'Заселить хижину может только семья. Выделите мужчину и женщину и нажмите «Создать семью».');
  }
}

const fullText = (full: Unit[]) =>
  full.length === 1 ? `${full[0].name} сыт и здоров — есть не пойдёт.` : `Сытые и здоровые есть не пойдут (${full.length}).`;

function eat(w: World, tribe: Tribe, units: Unit[]) {
  const full: Unit[] = [];
  let none = false;
  for (const u of units) {
    const r = sendToEat(w, u);
    if (r === 'full') full.push(u);
    if (r === 'none') none = true;
  }
  if (none) return w.log(tribe.id, 'Нет готовой кухни — постройте её, там раненые едят и лечатся.', 'bad');
  if (full.length) w.log(tribe.id, fullText(full));
}

/** Мужчины с оружием идут на ближайшую площадку для тренировок. */
function train(w: World, tribe: Tribe, units: Unit[]) {
  const men = units.filter((u) => u.kind === 'warrior' && !u.trained);
  if (!men.length) return;
  const ground = nearest(w.state.buildings.values(), men[0], (b) => b.tribe === tribe.id && b.kind === 'training' && w.isBuilt(b));
  if (!ground) return w.log(tribe.id, 'Нет готовой площадки для тренировок — постройте её.', 'bad');
  act(w, tribe, men, ground.id);
}

function craft(w: World, tribe: Tribe, units: Unit[], weapon: WeaponKind) {
  const men = units.filter((u) => u.kind === 'warrior' && u.weapon !== weapon);
  if (!men.length) return;
  const forge = forgeNear(w, men[0], tribe.id);
  if (!forge) return w.log(tribe.id, 'Оружие делают только в кузнице — сначала постройте её.', 'bad');
  // каждому нужно своё дерево; берём, сколько хватит
  const cost = WEAPONS[weapon].wood, what = weapon === 'spear' ? ['копьё', 'копья'] : ['топор', 'топора'];
  const can = Math.floor(w.tribeRes(tribe).wood / cost);
  if (!can) return w.log(tribe.id, `Не хватает дерева: на ${what[0]} нужно ${cost} 🪵.`, 'bad');
  for (const u of men.slice(0, can)) w.setJob(u, { type: 'craft', weapon, forge: forgeNear(w, u, tribe.id)!.id, progress: 0, paid: 0 });
  if (men.length > can) w.log(tribe.id, `Дерева хватит только на ${can} ${can === 1 ? what[0] : what[1]}.`, 'bad');
}

function build(w: World, tribe: Tribe, units: Unit[], kind: BuildingKind, x: number, y: number) {
  const builders = units.filter((u) => u.kind !== 'child');
  if (!builders.length) return w.log(tribe.id, 'Строить могут только взрослые.', 'bad');
  const cost = BUILDING_STATS[kind].wood;
  if (w.tribeRes(tribe).wood < cost) return w.log(tribe.id, `Не хватает дерева: нужно ${cost} 🪵.`, 'bad');
  const problem = placementProblem(kind, x, y, {
    terrain: w.state.terrain,
    buildings: w.state.buildings.values(),
    resources: w.state.resources.values(),
    campfires: w.state.tribes.values(),
    ownTribe: tribe,
  });
  if (problem) return w.log(tribe.id, `Здесь нельзя строить: ${problem.toLowerCase()}.`, 'bad');
  w.addTribeRes(tribe, 0, -cost);
  const b = w.addBuilding(tribe, kind, x, y);
  for (const u of builders) w.setJob(u, { type: 'build', building: b.id });
  w.log(tribe.id, `${kind === 'storage' ? 'Заложен' : 'Заложена'} ${BUILDING_LABEL[kind].toLowerCase()}. Чем больше строителей, тем быстрее стройка.`);
}

function marry(w: World, tribe: Tribe, ids: [string, string]) {
  const [a, b] = ids.map((id) => w.state.units.get(id));
  if (!a || !b || a.tribe !== tribe.id || b.tribe !== tribe.id) return;
  const problem = marriageProblem(a as unknown as FamilyCandidate, b as unknown as FamilyCandidate);
  if (problem) return w.log(tribe.id, `Нельзя создать семью: ${problem.toLowerCase()}.`, 'bad');
  a.partner = b.id;
  b.partner = a.id;
  const man = a.sex === 'm' ? a : b, woman = a.sex === 'm' ? b : a;
  w.log(tribe.id, `${man.name} и ${woman.name} теперь семья! Выделите их и кликните правой кнопкой по хижине — там у них родится ребёнок.`, 'good');
}

function birth(w: World, tribe: Tribe, buildingId: string) {
  const b = w.state.buildings.get(buildingId);
  if (!b || b.tribe !== tribe.id) return;
  const man = w.state.units.get(b.familyMan), woman = w.state.units.get(b.familyWoman);
  if (!man || !woman || man.partner !== woman.id) return w.log(tribe.id, 'В хижине должна жить семья: муж и жена.', 'bad');
  coupleToHut(w, tribe, man, woman, b.id);
}

/** Мужчина и женщина становятся семьёй (если ещё нет), поселяются в хижину и идут туда, держась за руки, за ребёнком. */
function coupleToHut(w: World, tribe: Tribe, man: Unit, woman: Unit, hutId: string) {
  const b = w.state.buildings.get(hutId);
  if (!b || b.tribe !== tribe.id || b.kind !== 'hut') return;
  if (!w.isBuilt(b)) return w.log(tribe.id, 'Хижина ещё не построена.', 'bad');
  if (man.partner !== woman.id) {
    const problem = marriageProblem(man as unknown as FamilyCandidate, woman as unknown as FamilyCandidate);
    if (problem) return w.log(tribe.id, `Нельзя создать семью: ${problem.toLowerCase()}.`, 'bad');
  }
  const others = [b.familyMan, b.familyWoman].filter((id) => id && id !== man.id && id !== woman.id);
  if (others.length) return w.log(tribe.id, 'В этой хижине уже живёт другая семья.', 'bad');
  if (b.kids >= LIMITS.kidsPerHut) return w.log(tribe.id, 'В этой хижине больше нет места для детей — постройте новую.', 'bad');
  if (b.birth > 0 || w.units.get(woman.id)?.job.type === 'birth') return;
  if (w.popOf(tribe.id) >= tribe.popCap) {
    return w.log(tribe.id, `Нет места для новых людей (${tribe.popCap}). Постройте ещё хижину — каждая даёт место ${LIMITS.popPerHut} людям.`, 'bad');
  }
  if (w.tribeRes(tribe).food < COSTS.birthFood) return w.log(tribe.id, `Не хватает еды: нужно ${COSTS.birthFood} 🍖.`, 'bad');
  if (man.partner !== woman.id) {
    man.partner = woman.id;
    woman.partner = man.id;
    w.log(tribe.id, `${man.name} и ${woman.name} теперь семья!`, 'good');
  }
  settleFamily(w, b, man, woman);
  w.addTribeRes(tribe, -COSTS.birthFood, 0);
  w.setJob(woman, { type: 'birth', building: b.id, paid: COSTS.birthFood });
  w.setJob(man, { type: 'birth', building: b.id, paid: 0 });
  w.log(tribe.id, `${man.name} и ${woman.name} идут в хижину за ребёнком.`);
}
