import { describe, expect, it } from 'vitest';
import { COLS, ROWS, TERRAIN, WORLD } from './constants';
import { actionFor, marriageProblem, placementProblem, tribeLimits, type FamilyCandidate } from './rules';

describe('правый клик', () => {
  it('воин охотится, рубит и атакует чужих, но не собирает ягоды', () => {
    expect(actionFor('warrior', { entity: 'animal' })).toBe('attack');
    expect(actionFor('warrior', { entity: 'resource', kind: 'tree' })).toBe('gather');
    expect(actionFor('warrior', { entity: 'resource', kind: 'bush' })).toBeNull();
    expect(actionFor('warrior', { entity: 'resource', kind: 'bush' }, false)).toBe('gather');
    expect(actionFor('warrior', { entity: 'unit', own: false })).toBe('attack');
    expect(actionFor('warrior', { entity: 'unit', own: true })).toBeNull();
  });

  it('женщина собирает ягоды, но не охотится', () => {
    expect(actionFor('woman', { entity: 'resource', kind: 'bush' })).toBe('gather');
    expect(actionFor('woman', { entity: 'animal' })).toBeNull();
  });

  it('стройка, заселение и сдача добычи', () => {
    expect(actionFor('woman', { entity: 'building', own: true, built: false, kind: 'hut' })).toBe('build');
    expect(actionFor('warrior', { entity: 'building', own: true, built: true, kind: 'hut' })).toBe('settle');
    expect(actionFor('woman', { entity: 'building', own: true, built: true, kind: 'storage' })).toBe('deposit');
    expect(actionFor('woman', { entity: 'tribe', own: true })).toBe('deposit');
  });

  it('дети не выполняют работу', () => {
    expect(actionFor('child', { entity: 'resource', kind: 'bush' })).toBeNull();
    expect(actionFor('child', { entity: 'building', own: true, built: false, kind: 'hut' })).toBeNull();
  });
});

describe('семья', () => {
  const p = (o: Partial<FamilyCandidate>): FamilyCandidate => ({ id: 'u1', tribe: 't1', kind: 'warrior', sex: 'm', partner: '', ...o });
  it('мужчина и женщина одного племени могут создать семью', () => {
    expect(marriageProblem(p({}), p({ id: 'u2', kind: 'woman', sex: 'f' }))).toBeNull();
  });
  it('нельзя: дети, один пол, уже в семье, разные племена', () => {
    expect(marriageProblem(p({}), p({ id: 'u2', kind: 'child', sex: 'f' }))).toBeTruthy();
    expect(marriageProblem(p({}), p({ id: 'u2' }))).toBeTruthy();
    expect(marriageProblem(p({ partner: 'u9' }), p({ id: 'u2', kind: 'woman', sex: 'f' }))).toBeTruthy();
    expect(marriageProblem(p({}), p({ id: 'u2', kind: 'woman', sex: 'f', tribe: 't2' }))).toBeTruthy();
  });
});

describe('место для хижины', () => {
  const grass = TERRAIN.grass.repeat(COLS * ROWS);
  const tribe = { id: 't1', x: 1000, y: 1000, border: 650 };
  const world = (extra: Partial<Parameters<typeof placementProblem>[3]> = {}) => ({
    terrain: grass,
    buildings: [],
    resources: [],
    campfires: [tribe],
    ownTribe: tribe,
    ...extra,
  });

  it('можно рядом с ратушей на свободной траве', () => {
    expect(placementProblem('hut', 1200, 1000, world())).toBeNull();
  });
  it('нельзя вплотную к ратуше и слишком далеко', () => {
    expect(placementProblem('hut', 1060, 1000, world())).toMatch(/близко/);
    expect(placementProblem('hut', 1900, 1000, world())).toMatch(/границ/);
    // склад можно дальше — у дальнего леса
    expect(placementProblem('storage', 1900, 1000, world())).toBeNull();
  });
  it('нельзя на воде, на дереве и на другой хижине', () => {
    const T = WORLD.tile;
    const cells = grass.split('');
    cells[Math.floor(1000 / T) * COLS + Math.floor(1200 / T)] = TERRAIN.water;
    expect(placementProblem('hut', 1200, 1000, world({ terrain: cells.join('') }))).toMatch(/вода/);
    expect(placementProblem('hut', 1200, 1000, world({ resources: [{ x: 1210, y: 1005, kind: 'tree' }] }))).toMatch(/дерево/);
    expect(placementProblem('hut', 1200, 1000, world({ buildings: [{ x: 1240, y: 1000, kind: 'hut' }] }))).toMatch(/постройка/);
  });
});

describe('лимиты племени', () => {
  it('хижины растят население и границу, склады — место под добычу', () => {
    const base = tribeLimits(0, 0);
    const more = tribeLimits(2, 1);
    expect(more.pop).toBeGreaterThan(base.pop);
    expect(more.border).toBeGreaterThan(base.border);
    expect(more.res).toBeGreaterThan(base.res);
    expect(tribeLimits(1000, 0).pop).toBe(60);
  });
  it('по готовой кузнице ПКМ ничего не делает', () => {
    expect(actionFor('warrior', { entity: 'building', own: true, built: true, kind: 'forge' })).toBeNull();
  });
});
