import { BUILDING_STATS, COSTS, LIMITS, WEAPONS, placementProblem, type BuildingKind } from '@game/shared';
import type { Tribe, Unit } from '../state/schema';
import type { World } from './World';
import { applyCommand } from './commands';
import { nearest } from './util';

/**
 * Простой ИИ для компьютерных племён. Он отдаёт те же приказы, что и игрок,
 * поэтому подчиняется тем же правилам и ценам.
 */
export function runBots(w: World) {
  for (const tribe of w.state.tribes.values()) if (tribe.bot) think(w, tribe);
}

function think(w: World, tribe: Tribe) {
  const cmd = (c: Parameters<typeof applyCommand>[2]) => applyCommand(w, tribe.id, c);
  const units = w.unitsOf(tribe.id);
  const res = w.tribeRes(tribe);
  const job = (u: Unit) => w.units.get(u.id)!.job.type;
  const own = [...w.state.buildings.values()].filter((b) => b.tribe === tribe.id);
  const huts = own.filter((b) => b.kind === 'hut');
  const forge = own.find((b) => b.kind === 'forge');

  // семьи
  const singleMen = units.filter((u) => u.kind === 'warrior' && !u.partner);
  const singleWomen = units.filter((u) => u.kind === 'woman' && !u.partner);
  for (let i = 0; i < Math.min(singleMen.length, singleWomen.length); i++) cmd({ type: 'marry', units: [singleMen[i].id, singleWomen[i].id] });

  // заселение и стройка
  const homeless = units.find((u) => u.kind === 'warrior' && u.partner && !u.home);
  const unfinished = own.find((b) => !w.isBuilt(b));
  // новый муж вдовы переезжает в её хижину
  const wifeHome = homeless ? w.state.units.get(homeless.partner)?.home : '';
  const freeHut = huts.find((b) => w.isBuilt(b) && (b.id === wifeHome || (!b.familyMan && !b.familyWoman)));
  if (homeless && freeHut && job(homeless) !== 'settle') cmd({ type: 'act', units: [homeless.id], target: freeHut.id });
  else if (homeless && !freeHut && !unfinished && res.wood >= BUILDING_STATS.hut.wood) {
    const spot = findSpot(w, tribe, 'hut', own.length);
    if (spot) cmd({ type: 'build', units: [homeless.id], building: 'hut', x: spot.x, y: spot.y });
  }

  // роды
  for (const b of huts) {
    if (!w.isBuilt(b) || b.birth || b.kids >= LIMITS.kidsPerHut || !b.familyWoman) continue;
    if (res.food >= COSTS.birthFood + units.length * 2) {
      cmd({ type: 'birth', building: b.id });
      break;
    }
  }

  // кузница после первой хижины
  const builder = units.find((u) => u.kind === 'warrior' && job(u) === 'idle');
  if (!forge && !unfinished && builder && huts.some((b) => w.isBuilt(b)) && res.wood >= BUILDING_STATS.forge.wood + 5) {
    const spot = findSpot(w, tribe, 'forge', own.length);
    if (spot) cmd({ type: 'build', units: [builder.id], building: 'forge', x: spot.x, y: spot.y });
  }

  // кухня после кузницы: без неё раненые не лечатся; повар — одна из женщин
  const kitchen = own.find((b) => b.kind === 'kitchen');
  if (!kitchen && forge && w.isBuilt(forge) && !unfinished && builder && res.wood >= BUILDING_STATS.kitchen.wood + 5) {
    const spot = findSpot(w, tribe, 'kitchen', own.length);
    if (spot) cmd({ type: 'build', units: [builder.id], building: 'kitchen', x: spot.x, y: spot.y });
  }
  const cook = kitchen && w.isBuilt(kitchen) && !kitchen.cook ? units.find((u) => u.kind === 'woman' && job(u) !== 'birth') : undefined;
  if (kitchen && cook) cmd({ type: 'act', units: [cook.id], target: kitchen.id });

  // площадка для тренировок после кухни; мужчины с оружием идут учиться и становятся воинами
  const ground = own.find((b) => b.kind === 'training');
  if (!ground && kitchen && w.isBuilt(kitchen) && !unfinished && builder && res.wood >= BUILDING_STATS.training.wood + 5) {
    const spot = findSpot(w, tribe, 'training', own.length);
    if (spot) cmd({ type: 'build', units: [builder.id], building: 'training', x: spot.x, y: spot.y });
  }
  const recruit = units.find((u) => u.kind === 'warrior' && u.armed && !u.trained && job(u) === 'idle');
  if (recruit && ground && w.isBuilt(ground)) cmd({ type: 'train', units: [recruit.id] });

  // оружие для безоружных мужчин: в основном копья, иногда топоры
  const unarmed = units.find((u) => u.kind === 'warrior' && !u.armed && job(u) === 'idle');
  const weapon = Math.random() < 0.7 ? 'spear' : 'axe';
  if (unarmed && forge && w.isBuilt(forge) && res.wood >= WEAPONS[weapon].wood) cmd({ type: 'craft', units: [unarmed.id], weapon });

  // работа для бездельников
  for (const u of units) {
    // воины не работают — охраняют племя
    if (job(u) !== 'idle' || u.kind === 'child' || u.trained) continue;
    if (unfinished) {
      cmd({ type: 'act', units: [u.id], target: unfinished.id });
      continue;
    }
    if (u.kind === 'woman') {
      const target =
        nearest(w.state.resources.values(), u, (r) => r.kind === 'carcass' && w.amountOf(r) >= 5, 500) ??
        nearest(w.state.resources.values(), u, (r) => r.kind === 'bush' && w.amountOf(r) >= 3, 1000);
      if (target) cmd({ type: 'act', units: [u.id], target: target.id });
      continue;
    }
    const needWood = res.wood < BUILDING_STATS.hut.wood + 10;
    const tree = nearest(w.state.resources.values(), u, (r) => r.kind === 'tree' && w.amountOf(r) >= 5, 1200);
    const deer = u.armed ? nearest(w.state.animals.values(), u, (a) => a.kind === 'deer', 900) : null;
    const target = needWood && Math.random() < 0.5 ? tree : (deer ?? tree);
    if (target) cmd({ type: 'act', units: [u.id], target: target.id });
  }
}

function findSpot(w: World, tribe: Tribe, kind: BuildingKind, n: number) {
  for (let i = 0; i < 60; i++) {
    const a = (n + i) * 2.39996;
    const r = 130 + 25 * Math.sqrt(n + i);
    const x = tribe.x + Math.cos(a) * r, y = tribe.y + Math.sin(a) * r * 0.85;
    const problem = placementProblem(kind, x, y, {
      terrain: w.state.terrain,
      buildings: w.state.buildings.values(),
      resources: w.state.resources.values(),
      campfires: w.state.tribes.values(),
      ownTribe: tribe,
    });
    if (!problem) return { x, y };
  }
  return null;
}
