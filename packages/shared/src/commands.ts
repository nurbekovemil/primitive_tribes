import type { BuildingKind, WeaponKind } from './constants';

/** Приказы, которые игрок отправляет серверу (сообщение `cmd`). */
export type Command =
  /** Идти в точку. */
  | { type: 'move'; units: string[]; x: number; y: number }
  /** «Умный» приказ по правому клику: собрать, атаковать, строить, заселиться, сдать добычу. */
  | { type: 'act'; units: string[]; target: string }
  /** Заложить постройку и отправить выбранных строить. */
  | { type: 'build'; units: string[]; building: BuildingKind; x: number; y: number }
  | { type: 'stop'; units: string[] }
  /** Мужчины идут в кузницу и делают себе копья или топоры из дерева племени. */
  | { type: 'craft'; units: string[]; weapon: WeaponKind }
  /** Мужчины с оружием идут тренироваться на площадку — станут воинами. */
  | { type: 'train'; units: string[] }
  /** Раненые идут поесть на ближайшую кухню и лечатся. */
  | { type: 'eat'; units: string[] }
  /** Создать семью из мужчины и женщины. */
  | { type: 'marry'; units: [string, string] }
  /** Родить ребёнка в хижине семьи. */
  | { type: 'birth'; building: string };

export type LogTone = 'info' | 'good' | 'bad';

/** Сообщения сервера клиенту. */
export interface ServerMessages {
  you: { tribeId: string; token: string };
  log: { text: string; tone: LogTone };
  chat: { name: string | null; color: string | null; text: string };
  /** Удары людей (по ним идёт анимация замаха); у копья — полёт [x1, y1, x2, y2]. */
  fx: { id: string; spear?: number[] }[];
  dead: { name: string };
}

export interface JoinOptions {
  name?: string;
  token?: string;
}
