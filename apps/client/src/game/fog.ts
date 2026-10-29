import type Phaser from 'phaser';
import { WORLD } from '@game/shared';

/** Сколько единиц мира приходится на один пиксель тумана (туман мягкий, детали ему не нужны). */
const CELL = 8;

export interface VisionSource {
  x: number;
  y: number;
  r: number;
}

/**
 * Туман войны: тёмное там, где ещё не были; полутьма там, где были, но сейчас никого нет;
 * ясно вокруг своих людей, хижин и стоянки.
 */
export class Fog {
  /** Готовая картинка тумана — её же рисует мини-карта. */
  readonly canvas: HTMLCanvasElement;
  private readonly explored: HTMLCanvasElement;
  private texture: Phaser.Textures.CanvasTexture | null = null;
  private sources: VisionSource[] = [];

  constructor() {
    const w = Math.ceil(WORLD.width / CELL), h = Math.ceil(WORLD.height / CELL);
    this.canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.explored = Object.assign(document.createElement('canvas'), { width: w, height: h });
  }

  /** Показать туман в сцене поверх мира. */
  attach(scene: Phaser.Scene, depth: number) {
    this.texture = scene.textures.addCanvas('fog', this.canvas);
    scene.add.image(0, 0, 'fog').setOrigin(0).setScale(CELL).setDepth(depth);
  }

  update(sources: VisionSource[]) {
    this.sources = sources;
    const e = this.explored.getContext('2d')!;
    for (const s of sources) {
      e.fillStyle = '#fff';
      e.beginPath();
      e.arc(s.x / CELL, s.y / CELL, (s.r * 0.95) / CELL, 0, Math.PI * 2);
      e.fill();
    }
    const c = this.canvas.getContext('2d')!;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.fillStyle = 'rgba(14, 18, 12, 0.92)';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // разведанное — полутьма
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = 0.45;
    c.drawImage(this.explored, 0, 0);
    c.globalAlpha = 1;
    // видимое сейчас — ясно, с мягким краем
    for (const s of sources) {
      const x = s.x / CELL, y = s.y / CELL, r = s.r / CELL;
      const g = c.createRadialGradient(x, y, r * 0.55, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    this.texture?.refresh();
  }

  /** Видна ли точка сейчас хоть одному своему. */
  canSee(x: number, y: number) {
    for (const s of this.sources) if ((s.x - x) ** 2 + (s.y - y) ** 2 < (s.r * 0.85) ** 2) return true;
    return false;
  }
}
