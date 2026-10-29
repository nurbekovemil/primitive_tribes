import Phaser from 'phaser';

/**
 * Все картинки игры лежат в public/assets и описаны в public/assets/sprites.json.
 * Чтобы заменить картинку, положите PNG с тем же именем и тем же размером кадра.
 */
export interface SpriteInfo {
  file: string;
  /** Кадры идут слева направо в одной полосе. */
  frames: number;
  /** Размер одного кадра в пикселях. */
  w: number;
  h: number;
  /** Точка опоры (ступни, корни, низ стены) в долях кадра. */
  ax: number;
  ay: number;
  /** Сколько единиц мира в одном пикселе картинки. */
  scale: number;
  /** Основание постройки на земле в единицах мира: [центр по y от точки опоры, полуось x, полуось y]. По нему рисуются круги выделения и постройки. */
  base?: [number, number, number];
  /** Флажок на постройке: какой ('flag' или 'ribbon', картинки building/<вид> и building/<вид>-color) и где верхушка шеста от точки опоры. */
  flag?: [string, number, number];
  /** Где у постройки горит огонь (анимированный building/flame) — от точки опоры. */
  flame?: [number, number];
}

export type Manifest = Record<string, SpriteInfo>;

const BASE = '/assets/';

/** Основание постройки на земле — эллипс, который совпадает с нарисованным низом здания. */
export const baseOf = (m: Manifest, key: string): [number, number, number] => m[key]?.base ?? [0, 40, 16];

export async function loadManifest(): Promise<Manifest> {
  const r = await fetch(`${BASE}sprites.json`);
  return (await r.json()) as Manifest;
}

export function preloadSprites(scene: Phaser.Scene, m: Manifest) {
  for (const [key, s] of Object.entries(m)) {
    if (s.frames > 1) scene.load.spritesheet(key, BASE + s.file, { frameWidth: s.w, frameHeight: s.h });
    else scene.load.image(key, BASE + s.file);
  }
}

/** Создать спрайт по имени картинки: с точкой опоры и масштабом (в сцену не добавляется — кладите в контейнер). */
export function makeSprite(scene: Phaser.Scene, m: Manifest, key: string, frame = 0): Phaser.GameObjects.Sprite {
  const sp = new Phaser.GameObjects.Sprite(scene, 0, 0, key, m[key].frames > 1 ? frame : undefined);
  return applySprite(sp, m, key, frame);
}

/** Сменить картинку спрайта, сохранив отражение по горизонтали. */
export function applySprite(sp: Phaser.GameObjects.Sprite, m: Manifest, key: string, frame = 0): Phaser.GameObjects.Sprite {
  const s = m[key];
  if (sp.texture.key !== key || (s.frames > 1 && sp.frame.name !== String(frame))) sp.setTexture(key, s.frames > 1 ? frame : undefined);
  sp.setOrigin(s.ax, s.ay);
  sp.setScale(Math.sign(sp.scaleX || 1) * s.scale, s.scale);
  return sp;
}
