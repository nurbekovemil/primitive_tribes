import { TIMES } from '@game/shared';
import type { Unit } from '../state/schema';
import type { World } from './World';

/** Лимиты от построек, питание, голод и удаление племён ушедших игроков. Здоровье само не восстанавливается — лечит только кухня. */
export function updateTribes(w: World, dt: number) {
  const byTribe = new Map<string, Unit[]>();
  for (const u of w.state.units.values()) {
    const list = byTribe.get(u.tribe);
    if (list) list.push(u);
    else byTribe.set(u.tribe, [u]);
  }

  for (const tribe of [...w.state.tribes.values()]) {
    const td = w.tribes.get(tribe.id)!;
    const members = byTribe.get(tribe.id) ?? [];
    w.refreshLimits(tribe);

    if (!tribe.bot && !tribe.online) {
      td.offlineT += dt;
      if (td.offlineT > TIMES.offlineKeep) {
        w.removeTribe(tribe.id, 'left');
        continue;
      }
    }

    td.eatT += dt;
    if (td.eatT >= TIMES.eatEvery) {
      td.eatT = 0;
      let cost = 0;
      for (const u of members) cost += u.kind === 'child' ? 0.5 : 1;
      cost = Math.ceil(cost);
      if (td.food >= cost) w.addTribeRes(tribe, -cost, 0);
      else {
        w.addTribeRes(tribe, -td.food, 0);
        for (const u of members) w.damageUnit(u, 10, 'hunger');
        w.log(tribe.id, 'Голод! Людям нечего есть — отправьте женщин за ягодами, а воинов на охоту.', 'bad');
      }
    }
  }
}
