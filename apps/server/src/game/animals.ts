import { ANIMAL_STATS, FIRE_SAFE_RADIUS, WILD_DISTANCE, WORLD, type AnimalKind } from '@game/shared';
import type { Animal } from '../state/schema';
import type { AnimalData, World } from './World';
import { dist, dist2, nearest, rand, randInt, setIfChanged, type Pt } from './util';

const KINDS: AnimalKind[] = ['deer', 'mammoth', 'wolf', 'tiger'];

/** Сколько зверей каждого вида держать в мире в зависимости от числа племён. */
const POPULATION: Record<AnimalKind, (tribes: number) => number> = {
  deer: (n) => 28 + 5 * n,
  mammoth: (n) => 6 + 2 * n,
  wolf: (n) => 6 + 2 * n,
  tiger: (n) => 2 + n,
};

/** Звери ходят по прямой; если впереди вода — шаг не делается. */
function move(w: World, a: Animal, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - a.x, dy = ty - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;
  const s = Math.min(speed * dt, len);
  const nx = a.x + (dx / len) * s, ny = a.y + (dy / len) * s;
  if (!w.grid.walkableAt(nx, ny) && w.grid.walkableAt(a.x, a.y)) {
    if (w.grid.isWaterAt(nx, ny) || !w.grid.walkableAt(nx, a.y)) return false;
  }
  a.x = Math.max(20, Math.min(WORLD.width - 20, nx));
  a.y = Math.max(20, Math.min(WORLD.height - 20, ny));
  if (Math.abs(dx) > 0.5) setIfChanged(a, 'dir', dx > 0 ? 1 : -1);
  return s >= len - 0.01;
}

function moveAway(w: World, a: Animal, from: Pt, speed: number, dt: number) {
  let dx = a.x - from.x, dy = a.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  if (!move(w, a, a.x + dx * 60, a.y + dy * 60, speed, dt)) {
    // упёрлись в воду — уходим вбок
    move(w, a, a.x - dy * 60, a.y + dx * 60, speed, dt);
  }
}

function wander(w: World, a: Animal, d: AnimalData, dt: number) {
  const st = ANIMAL_STATS[a.kind as AnimalKind];
  if (Math.hypot(d.wx - a.x, d.wy - a.y) > 4) {
    setIfChanged(a, 'action', 'walk');
    if (!move(w, a, d.wx, d.wy, st.walk, dt)) {
      d.wx = a.x;
      d.wy = a.y;
    }
    return;
  }
  // забрёл к племени (погоня, бегство) — уходит прочь от ратуши, не дожидаясь
  const camp = w.nearCamp(a);
  setIfChanged(a, 'action', 'idle');
  d.wait -= dt;
  if (d.wait > 0 && !camp) return;
  d.wait = rand(1.5, 5);
  for (let i = 0; i < 8; i++) {
    let x = a.x + rand(-260, 260), y = a.y + rand(-260, 260);
    if (camp) {
      const len = Math.hypot(a.x - camp.x, a.y - camp.y) || 1;
      x = a.x + ((a.x - camp.x) / len) * 220 + rand(-80, 80);
      y = a.y + ((a.y - camp.y) / len) * 220 + rand(-80, 80);
    }
    x = Math.max(40, Math.min(WORLD.width - 40, x));
    y = Math.max(40, Math.min(WORLD.height - 40, y));
    if (!w.grid.walkableAt(x, y)) continue;
    // к племенам звери не ходят: у ратуш они только в погоне или убегая
    if (!camp && w.nearCamp({ x, y })) continue;
    d.wx = x;
    d.wy = y;
    return;
  }
}

function melee(w: World, a: Animal, d: AnimalData, targetId: string, run: number, dt: number): boolean {
  const st = ANIMAL_STATS[a.kind as AnimalKind];
  const loc = w.locate(targetId);
  if (!loc) return false;
  const reach = st.radius + loc.r + 6;
  setIfChanged(a, 'action', 'run');
  if (dist(a, loc) > reach) move(w, a, loc.x, loc.y, run, dt);
  if (dist(a, loc) <= reach + 2) {
    setIfChanged(a, 'action', 'attack');
    if (d.cd <= 0) {
      d.cd = st.cooldown;
      const dmg = st.damage * (0.8 + Math.random() * 0.4);
      const u = w.state.units.get(targetId);
      if (u) w.damageUnit(u, dmg, a.id);
      const other = w.state.animals.get(targetId);
      if (other) w.damageAnimal(other, dmg, a.id);
    }
  }
  return true;
}

export function updateAnimal(w: World, a: Animal, dt: number) {
  const d = w.animals.get(a.id);
  if (!d || d.hp <= 0) return;
  const st = ANIMAL_STATS[a.kind as AnimalKind];
  d.cd = Math.max(0, d.cd - dt);
  d.angerT = Math.max(0, d.angerT - dt);

  if (a.kind === 'deer') {
    let threat: Pt | null = null;
    if (d.fleeT > 0) {
      d.fleeT -= dt;
      threat = d.fleeFrom;
    }
    if (!threat) threat = nearest(w.state.units.values(), a, (u) => !u.inside, 120);
    if (threat) {
      const tired = d.stamina <= 0;
      d.stamina = Math.max(0, d.stamina - dt);
      setIfChanged(a, 'action', tired ? 'walk' : 'run');
      moveAway(w, a, threat, tired ? st.walk * 1.4 : st.run, dt);
    } else {
      d.stamina = Math.min(4, d.stamina + dt * 0.5);
      wander(w, a, d, dt);
    }
    return;
  }

  if (a.kind === 'mammoth') {
    if (d.angerT > 0 && d.angerBy) {
      const loc = w.locate(d.angerBy);
      if (loc && dist2(loc, a) < 700 * 700 && melee(w, a, d, d.angerBy, st.run, dt)) return;
      d.angerBy = '';
      d.angerT = 0;
    }
    wander(w, a, d, dt);
    return;
  }

  // ---- хищники ----
  if (d.fed > 0) {
    d.fed -= dt;
    d.target = '';
    wander(w, a, d, dt);
    return;
  }
  // раненый хищник убегает
  if (d.hp < a.maxHp * 0.3 && d.lastAttacker) {
    const src = w.locate(d.lastAttacker);
    if (src && dist2(src, a) < 400 * 400) {
      setIfChanged(a, 'action', 'run');
      d.target = '';
      moveAway(w, a, src, st.run, dt);
      return;
    }
  }
  const fire = w.inFireZone(a);
  if (fire) {
    d.target = '';
    setIfChanged(a, 'action', 'run');
    moveAway(w, a, fire, st.run, dt);
    return;
  }
  let target = '';
  if (d.angerT > 0 && w.state.units.has(d.angerBy)) target = d.angerBy;
  if (!target && d.target) {
    const u = w.state.units.get(d.target);
    if (u && dist2(u, a) < (st.aggro * 2) ** 2) target = u.id;
  }
  if (!target) target = nearest(w.state.units.values(), a, (u) => !u.inside && !w.inFireZone(u), st.aggro)?.id ?? '';
  const victim = target ? w.state.units.get(target) : undefined;
  if (!victim || dist2(victim, w.state.tribes.get(victim.tribe) ?? { x: -1e9, y: -1e9 }) < (FIRE_SAFE_RADIUS * 0.9) ** 2) {
    d.target = '';
    wander(w, a, d, dt);
    return;
  }
  d.target = victim.id;
  melee(w, a, d, victim.id, st.run, dt);
  if (victim.hp <= 0) {
    d.fed = 20;
    d.target = '';
  }
}

export function spawnAnimals(w: World) {
  const tribes = [...w.state.tribes.values()];
  const counts: Record<AnimalKind, number> = { deer: 0, mammoth: 0, wolf: 0, tiger: 0 };
  for (const a of w.state.animals.values()) counts[a.kind as AnimalKind]++;
  for (const kind of KINDS) {
    if (counts[kind] >= POPULATION[kind](tribes.length)) continue;
    let spot: Pt | null = null;
    for (let i = 0; i < 30; i++) {
      const c = { x: rand(60, WORLD.width - 60), y: rand(60, WORLD.height - 60) };
      if (!w.grid.walkableAt(c.x, c.y)) continue;
      if (tribes.some((t) => dist2(t, c) < (WILD_DISTANCE + 150) ** 2)) continue;
      spot = c;
      break;
    }
    if (!spot) continue;
    const group = kind === 'mammoth' ? randInt(2, 3) : kind === 'wolf' ? randInt(2, 3) : kind === 'deer' ? randInt(2, 4) : 1;
    for (let i = 0; i < group; i++) w.spawnAnimal(kind, spot.x + rand(-60, 60), spot.y + rand(-60, 60));
  }
}
