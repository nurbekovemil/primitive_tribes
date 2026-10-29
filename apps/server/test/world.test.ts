import { describe, expect, it } from 'vitest';
import { BUILDING_STATS, COSTS, FOOTPRINT, TIMES, placementProblem, pushOutOf } from '@game/shared';
import { World } from '../src/game/World';
import type { Tribe } from '../src/state/schema';

function removePredators(w: World) {
  for (const a of [...w.state.animals.values()]) {
    if (a.kind === 'deer') continue;
    w.state.animals.delete(a.id);
    w.animals.delete(a.id);
  }
}

function makeWorld() {
  const logs: string[] = [];
  const w = new World({ log: (_t, text) => logs.push(text), fx: () => {}, chat: () => {}, tribeGone: () => {} });
  w.botTribes = 0;
  // в тестах убираем хищников, чтобы они не мешали проверять экономику
  removePredators(w);
  const { tribe } = w.createTribe('Племя Тест', false);
  return { w, tribe, logs };
}

function run(w: World, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) {
    w.tick(0.05);
    removePredators(w);
  }
}

function hutSpot(w: World, tribe: Tribe, kind: 'hut' | 'kitchen' = 'hut') {
  for (let i = 0; i < 200; i++) {
    const a = i * 0.7, r = 130 + i * 2;
    const x = tribe.x + Math.cos(a) * r, y = tribe.y + Math.sin(a) * r;
    const ok = !placementProblem(kind, x, y, {
      terrain: w.state.terrain,
      buildings: w.state.buildings.values(),
      resources: w.state.resources.values(),
      campfires: w.state.tribes.values(),
      ownTribe: tribe,
    });
    if (ok) return { x, y };
  }
  throw new Error('нет места для хижины');
}

describe('мир', () => {
  it('люди без приказа стоят на месте', () => {
    const { w, tribe } = makeWorld();
    const units = w.unitsOf(tribe.id);
    const before = units.map((u) => [u.x, u.y]);
    run(w, 5);
    units.forEach((u, i) => {
      expect(Math.hypot(u.x - before[i][0], u.y - before[i][1])).toBeLessThan(15);
      expect(u.action).toBe('idle');
    });
  });

  it('женщина собирает ягоды и приносит их к костру по приказу', () => {
    const { w, tribe } = makeWorld();
    const woman = w.unitsOf(tribe.id).find((u) => u.kind === 'woman')!;
    const bush = [...w.state.resources.values()]
      .filter((r) => r.kind === 'bush')
      .sort((a, b) => Math.hypot(a.x - tribe.x, a.y - tribe.y) - Math.hypot(b.x - tribe.x, b.y - tribe.y))[0];
    const food0 = w.tribeRes(tribe).food;
    w.command(tribe.id, { type: 'act', units: [woman.id], target: bush.id });
    expect(woman.action).toBe('gather');
    run(w, 90);
    // за 90 секунд племя съело 12 еды, а собрано должно быть заметно больше
    expect(w.tribeRes(tribe).food).toBeGreaterThan(food0 + 10);
  });

  it('стройка хижины, семья, заселение, роды и взросление', () => {
    const { w, tribe, logs } = makeWorld();
    const [man, woman] = w.unitsOf(tribe.id).sort((a) => (a.kind === 'warrior' ? -1 : 1));
    expect(man.partner).toBe(woman.id);

    const spot = hutSpot(w, tribe);
    const wood0 = w.tribeRes(tribe).wood;
    w.command(tribe.id, { type: 'build', units: [man.id, woman.id], building: 'hut', x: spot.x, y: spot.y });
    expect(w.tribeRes(tribe).wood).toBe(wood0 - BUILDING_STATS.hut.wood);
    const hut = [...w.state.buildings.values()][0];
    run(w, 30);
    expect(w.isBuilt(hut)).toBe(true);

    w.command(tribe.id, { type: 'act', units: [man.id], target: hut.id });
    run(w, 15);
    expect(hut.familyMan).toBe(man.id);
    expect(hut.familyWoman).toBe(woman.id);

    w.addTribeRes(tribe, 100, 0);
    const food0 = w.tribeRes(tribe).food;
    w.command(tribe.id, { type: 'birth', building: hut.id });
    expect(w.tribeRes(tribe).food).toBe(food0 - COSTS.birthFood);
    run(w, TIMES.birth + 10);
    const child = w.unitsOf(tribe.id).find((u) => u.kind === 'child');
    expect(child).toBeDefined();
    expect(hut.kids).toBe(1);

    run(w, TIMES.growUp + 1);
    expect(['warrior', 'woman']).toContain(w.state.units.get(child!.id)!.kind);
    expect(logs.some((l) => l.includes('вырос'))).toBe(true);
  });

  it('прерванные роды возвращают еду', () => {
    const { w, tribe } = makeWorld();
    const [man, woman] = w.unitsOf(tribe.id).sort((a) => (a.kind === 'warrior' ? -1 : 1));
    const spot = hutSpot(w, tribe);
    w.command(tribe.id, { type: 'build', units: [man.id, woman.id], building: 'hut', x: spot.x, y: spot.y });
    run(w, 30);
    const hut = [...w.state.buildings.values()][0];
    w.command(tribe.id, { type: 'act', units: [man.id], target: hut.id });
    run(w, 15);
    w.addTribeRes(tribe, 100, 0);
    const food0 = w.tribeRes(tribe).food;
    w.command(tribe.id, { type: 'birth', building: hut.id });
    w.command(tribe.id, { type: 'stop', units: [woman.id] });
    expect(w.tribeRes(tribe).food).toBe(food0);
  });

  it('кусты большие, здоровье само не растёт, раненые едят на кухне у повара', () => {
    const { w, tribe } = makeWorld();
    for (const r of w.state.resources.values()) if (r.kind === 'bush') expect(r.amount).toBeGreaterThanOrEqual(200);
    const [man, woman] = w.unitsOf(tribe.id);
    // кухня готова сразу
    const spot = hutSpot(w, tribe, 'kitchen');
    const k = w.addBuilding(tribe, 'kitchen', spot.x, spot.y);
    w.buildings.get(k.id)!.progress = 1;
    k.progress = 100;
    w.addTribeRes(tribe, 100, 0);
    w.damageUnit(man, man.maxHp * 0.5, 'test');
    run(w, 3);
    // 50% — ещё не идёт есть и сам не лечится
    expect(man.hp).toBe(Math.ceil(man.maxHp * 0.5));
    w.command(tribe.id, { type: 'act', units: [woman.id], target: k.id });
    expect(woman.action).toBe('cook');
    w.damageUnit(man, man.maxHp * 0.3, 'test');
    run(w, 4);
    expect(man.action).toBe('eat');
    run(w, 60);
    expect(k.cook).toBe(woman.id);
    expect(man.hp).toBe(man.maxHp);
    expect(man.action).toBe('idle');
  });

  it('игрок сам отправляет раненого поесть, сытый не идёт', () => {
    const { w, tribe, logs } = makeWorld();
    const spot = hutSpot(w, tribe, 'kitchen');
    const k = w.addBuilding(tribe, 'kitchen', spot.x, spot.y);
    w.buildings.get(k.id)!.progress = 1;
    const [man, woman] = w.unitsOf(tribe.id);
    w.command(tribe.id, { type: 'act', units: [man.id], target: k.id });
    expect(man.action).toBe('idle');
    expect(logs.at(-1)).toContain('сыт');
    w.damageUnit(man, 20, 'test');
    w.command(tribe.id, { type: 'act', units: [man.id], target: k.id });
    expect(man.action).toBe('eat');
    // женщина по клику становится поваром, вторая женщина при живом поваре идёт есть
    w.command(tribe.id, { type: 'act', units: [woman.id], target: k.id });
    expect(woman.action).toBe('cook');
    const other = w.spawnUnit(tribe, 'woman', 'f', tribe.x, tribe.y + 40);
    w.damageUnit(other, 10, 'test');
    w.command(tribe.id, { type: 'act', units: [other.id], target: k.id });
    expect(other.action).toBe('eat');
    run(w, 40);
    expect(man.hp).toBe(man.maxHp);
    expect(other.hp).toBe(other.maxHp);
  });

  it('на кухне едят четверо, остальные ждут в очереди', () => {
    const { w, tribe } = makeWorld();
    const spot = hutSpot(w, tribe, 'kitchen');
    const k = w.addBuilding(tribe, 'kitchen', spot.x, spot.y);
    w.buildings.get(k.id)!.progress = 1;
    const hurt = [0, 1, 2, 3, 4, 5].map((i) => w.spawnUnit(tribe, 'warrior', 'm', tribe.x + i * 20, tribe.y + 40));
    for (const u of hurt) w.damageUnit(u, u.maxHp * 0.8, 'test');
    run(w, 20);
    const kd = w.buildings.get(k.id)!;
    expect(kd.seats.filter(Boolean).length).toBe(4);
    expect(kd.queue.length).toBe(2);
    for (const id of kd.queue) expect(Math.hypot(w.state.units.get(id)!.x - k.x, w.state.units.get(id)!.y - k.y)).toBeLessThan(140);
  });

  it('люди обходят постройки, а не проходят сквозь них', () => {
    const { w, tribe } = makeWorld();
    const spot = hutSpot(w, tribe);
    const hut = w.addBuilding(tribe, 'hut', spot.x, spot.y);
    const f = FOOTPRINT.hut, cy = spot.y + f.dy;
    const u = w.spawnUnit(tribe, 'warrior', 'm', spot.x - f.rx - 30, cy);
    w.command(tribe.id, { type: 'move', units: [u.id], x: spot.x + f.rx + 30, y: cy });
    for (let t = 0; t < 12; t += 0.05) {
      w.tick(0.05);
      removePredators(w);
      expect(pushOutOf(u.x, u.y, hut.x, hut.y, f)).toBeNull();
    }
    expect(Math.hypot(u.x - (spot.x + f.rx + 30), u.y - cy)).toBeLessThan(20);
  });

  it('нельзя командовать чужими людьми', () => {
    const { w, tribe } = makeWorld();
    const other = w.createTribe('Племя Чужих', false).tribe;
    const stranger = w.unitsOf(other.id)[0];
    w.command(tribe.id, { type: 'move', units: [stranger.id], x: 100, y: 100 });
    expect(stranger.action).toBe('idle');
  });

  it('нельзя создать семью из уже женатых', () => {
    const { w, tribe, logs } = makeWorld();
    w.spawnUnit(tribe, 'woman', 'f', tribe.x, tribe.y + 40);
    const [man] = w.unitsOf(tribe.id).filter((u) => u.kind === 'warrior');
    const bride = w.unitsOf(tribe.id).find((u) => u.kind === 'woman' && !u.partner)!;
    w.command(tribe.id, { type: 'marry', units: [man.id, bride.id] });
    expect(bride.partner).toBe('');
    expect(logs.at(-1)).toContain('уже в семье');
  });
});

describe('поиск пути', () => {
  it('находит путь в обход препятствий', () => {
    const { w } = makeWorld();
    for (let i = 0; i < 50; i++) {
      const from = w.grid.nearestWalkable(Math.random() * 4000, Math.random() * 3000)!;
      const to = w.grid.nearestWalkable(Math.random() * 4000, Math.random() * 3000)!;
      const path = w.grid.findPath(from, to, 20000);
      if (!path) continue;
      let prev = from;
      for (const p of path) {
        expect(w.grid.lineOfSight(prev, p)).toBe(true);
        prev = p;
      }
    }
  });
});
