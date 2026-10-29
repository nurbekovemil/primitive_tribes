import { schema, t, type SchemaType } from '@colyseus/schema';

// Синхронизируемое состояние мира. Клиент получает только изменения (дельты).
// Служебные данные (приказы, пути, таймеры) живут на сервере в World, а не здесь.

export const Tribe = schema(
  {
    id: t.string().default(''),
    name: t.string().default(''),
    color: t.string().default(''),
    /** Позиция стоянки (тотема). */
    x: t.float32().default(0),
    y: t.float32().default(0),
    food: t.uint16().default(0),
    wood: t.uint16().default(0),
    /** Лимиты от построек: людей, еды и дерева (каждого), радиус границы. */
    popCap: t.uint16().default(0),
    resCap: t.uint16().default(0),
    border: t.uint16().default(0),
    bot: t.boolean().default(false),
    online: t.boolean().default(false),
    born: t.uint16().default(0),
    kills: t.uint16().default(0),
  },
  'Tribe',
);
export type Tribe = SchemaType<typeof Tribe>;

export const Unit = schema(
  {
    id: t.string().default(''),
    tribe: t.string().default(''),
    kind: t.string().default(''),
    sex: t.string().default(''),
    name: t.string().default(''),
    x: t.float32().default(0),
    y: t.float32().default(0),
    hp: t.uint16().default(0),
    maxHp: t.uint16().default(0),
    /** Рост ребёнка 0..100. */
    growth: t.uint8().default(0),
    /** Возраст в годах. */
    age: t.uint8().default(0),
    carry: t.uint8().default(0),
    carryType: t.string().default(''),
    action: t.string().default(''),
    /** Чем занят прямо сейчас: chop — рубит, pick — собирает, build — строит. */
    task: t.string().default(''),
    dir: t.int8().default(1),
    partner: t.string().default(''),
    home: t.string().default(''),
    armed: t.boolean().default(false),
    /** Оружие: spear, axe или ''. */
    weapon: t.string().default(''),
    /** Прошёл тренировку — воин. */
    trained: t.boolean().default(false),
    chief: t.boolean().default(false),
    /** Внутри какой хижины (там его не видно), '' — снаружи. */
    inside: t.string().default(''),
  },
  'Unit',
);
export type Unit = SchemaType<typeof Unit>;

export const Animal = schema(
  {
    id: t.string().default(''),
    kind: t.string().default(''),
    x: t.float32().default(0),
    y: t.float32().default(0),
    hp: t.uint16().default(0),
    maxHp: t.uint16().default(0),
    dir: t.int8().default(1),
    action: t.string().default(''),
  },
  'Animal',
);
export type Animal = SchemaType<typeof Animal>;

export const Building = schema(
  {
    id: t.string().default(''),
    tribe: t.string().default(''),
    kind: t.string().default(''),
    x: t.float32().default(0),
    y: t.float32().default(0),
    /** Стройка 0..100. */
    progress: t.uint8().default(0),
    hp: t.uint16().default(0),
    maxHp: t.uint16().default(0),
    familyMan: t.string().default(''),
    familyWoman: t.string().default(''),
    kids: t.uint8().default(0),
    /** Ход родов 0..100, 0 — никто не рожает. */
    birth: t.uint8().default(0),
    /** Кухня: сваренных порций и кто повар. */
    meals: t.uint8().default(0),
    cook: t.string().default(''),
  },
  'Building',
);
export type Building = SchemaType<typeof Building>;

export const Resource = schema(
  {
    id: t.string().default(''),
    kind: t.string().default(''),
    x: t.float32().default(0),
    y: t.float32().default(0),
    amount: t.uint16().default(0),
    max: t.uint16().default(0),
  },
  'Resource',
);
export type Resource = SchemaType<typeof Resource>;

export const WorldState = schema(
  {
    terrain: t.string().default(''),
    tribes: t.map(Tribe),
    units: t.map(Unit),
    animals: t.map(Animal),
    buildings: t.map(Building),
    resources: t.map(Resource),
  },
  'WorldState',
);
export type WorldState = SchemaType<typeof WorldState>;

// Проверка на этапе компиляции: схема совпадает с формой состояния, которую ждёт клиент.
type Assert<T extends true> = T;
type Matches<A, B> = A extends B ? true : false;
export type SchemaMatchesView = [
  Assert<Matches<Tribe, import('@game/shared').TribeView>>,
  Assert<Matches<Unit, import('@game/shared').UnitView>>,
  Assert<Matches<Animal, import('@game/shared').AnimalView>>,
  Assert<Matches<Building, import('@game/shared').BuildingView>>,
  Assert<Matches<Resource, import('@game/shared').ResourceView>>,
];
