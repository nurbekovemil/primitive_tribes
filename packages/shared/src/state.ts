/**
 * Форма синхронизируемого состояния мира, как её видит клиент.
 * Сервер описывает то же самое через Colyseus Schema (apps/server/src/state/schema.ts),
 * а тест типов на сервере проверяет, что формы совпадают.
 */

export interface MapView<T> {
  readonly size: number;
  get(key: string): T | undefined;
  has(key: string): boolean;
  values(): IterableIterator<T>;
  forEach(cb: (value: T, key: string) => void): void;
}

export interface TribeView {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  food: number;
  wood: number;
  /** Лимиты от построек: людей, еды и дерева (каждого), радиус границы. */
  popCap: number;
  resCap: number;
  border: number;
  bot: boolean;
  online: boolean;
  born: number;
  kills: number;
}

export interface UnitView {
  id: string;
  tribe: string;
  kind: string;
  sex: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  growth: number;
  /** Возраст в годах. */
  age: number;
  carry: number;
  carryType: string;
  action: string;
  /** chop — рубит, pick — собирает или разделывает, build — строит, '' — ничего. */
  task: string;
  dir: number;
  partner: string;
  home: string;
  /** Есть оружие (только у мужчин). */
  armed: boolean;
  /** Какое оружие: spear, axe или ''. */
  weapon: string;
  /** Прошёл тренировку — воин: охраняет племя, не работает. */
  trained: boolean;
  /** Вождь — первый мужчина племени. */
  chief: boolean;
  /** Внутри какой хижины (там его не видно), '' — снаружи. */
  inside: string;
}

export interface AnimalView {
  id: string;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dir: number;
  action: string;
}

export interface BuildingView {
  id: string;
  tribe: string;
  kind: string;
  x: number;
  y: number;
  progress: number;
  hp: number;
  maxHp: number;
  familyMan: string;
  familyWoman: string;
  kids: number;
  birth: number;
  /** Кухня: сваренных порций и кто повар (id, '' — нет). */
  meals: number;
  cook: string;
}

export interface ResourceView {
  id: string;
  kind: string;
  x: number;
  y: number;
  amount: number;
  max: number;
}

export interface WorldView {
  terrain: string;
  tribes: MapView<TribeView>;
  units: MapView<UnitView>;
  animals: MapView<AnimalView>;
  buildings: MapView<BuildingView>;
  resources: MapView<ResourceView>;
}
