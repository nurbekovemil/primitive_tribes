/**
 * Все сущности мира имеют строковый id с префиксом типа:
 * u — человек, a — зверь, b — постройка, r — ресурс, t — племя (его костёр).
 */
export type EntityType = 'unit' | 'animal' | 'building' | 'resource' | 'tribe';

const PREFIX: Record<string, EntityType> = { u: 'unit', a: 'animal', b: 'building', r: 'resource', t: 'tribe' };

export function entityType(id: string): EntityType | null {
  return PREFIX[id[0]] ?? null;
}
