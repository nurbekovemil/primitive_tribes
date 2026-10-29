import { COLS, ROWS, TERRAIN, WORLD } from '@game/shared';
import { hash2, rng } from './random';

/** Плотность «поля» цветов: 0.5 пикселя на единицу мира, потом сглаженно растягивается. */
const LR = 0.5;
/** Размер куска земли в единицах мира и разрешение кусков. */
export const CHUNK = 1000;
const CHUNK_RES = 1;

const enum Ground {
  Grass,
  Dirt,
  Shore,
  Water,
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const mix = (a: number, b: number, t: number) => {
  t = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const C = {
  grassA: 0x74c24a,
  grassB: 0x88d055,
  grassDark: 0x5ca43a,
  grassRim: 0x5f9e36,
  dirtA: 0xa87a48,
  dirtB: 0xbb8d58,
  dirtRim: 0x8a5c33,
  shore: 0xcdb98c,
  shoreDark: 0xb19c70,
  shallow: 0x4e93d2,
  deep: 0x2d66a6,
  foam: 0x9ccbf0,
};

export interface TerrainChunk {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

/** Рисует землю по карте сервера кусками: мягкие переходы + травинки, камешки и блики. Карта у каждого мира своя, поэтому земля не картинка. */
export function drawTerrain(terrain: string): TerrainChunk[] {
  const w = Math.ceil(WORLD.width * LR), h = Math.ceil(WORLD.height * LR);
  const T = WORLD.tile;
  const tileWater = (tx: number, ty: number) => {
    tx = Math.max(0, Math.min(COLS - 1, tx));
    ty = Math.max(0, Math.min(ROWS - 1, ty));
    return terrain[ty * COLS + tx] === TERRAIN.water ? 1 : 0;
  };

  const kind = new Uint8Array(w * h);
  const pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const wx = (x + 0.5) / LR, wy = (y + 0.5) / LR;
      const fx = wx / T - 0.5, fy = wy / T - 0.5;
      const tx = Math.floor(fx), ty = Math.floor(fy), ax = fx - tx, ay = fy - ty;
      let v =
        tileWater(tx, ty) * (1 - ax) * (1 - ay) + tileWater(tx + 1, ty) * ax * (1 - ay) + tileWater(tx, ty + 1) * (1 - ax) * ay + tileWater(tx + 1, ty + 1) * ax * ay;
      v += (valueNoise(wx / 22, wy / 22, 9) - 0.5) * 0.22;
      const i = y * w + x;
      let col: number;
      if (v > 0.5) {
        kind[i] = Ground.Water;
        col = mix(C.shallow, C.deep, smooth(0.55, 0.85, v));
        if (v < 0.54) col = mix(C.foam, C.shallow, (v - 0.5) / 0.04);
      } else if (v > 0.38) {
        kind[i] = Ground.Shore;
        col = mix(C.shore, C.shoreDark, valueNoise(wx / 6, wy / 6, 2));
      } else {
        const d = valueNoise(wx / 300, wy / 300, 3) * 0.65 + valueNoise(wx / 90, wy / 90, 4) * 0.35;
        const tone = valueNoise(wx / 70, wy / 70, 5);
        if (d < 0.34) {
          kind[i] = Ground.Dirt;
          col = mix(C.dirtA, C.dirtB, tone);
          col = mix(col, C.dirtRim, smooth(0.31, 0.34, d) * 0.8);
        } else {
          kind[i] = Ground.Grass;
          col = mix(C.grassA, C.grassB, tone);
          const m = valueNoise(wx / 20, wy / 20, 6);
          col = mix(col, C.grassDark, smooth(0.6, 0.85, m) * 0.6);
          col = mix(col, C.grassRim, (1 - smooth(0.34, 0.37, d)) * 0.7);
        }
      }
      pixels[i] = 0xff000000 | ((col & 0xff) << 16) | (col & 0xff00) | ((col >> 16) & 0xff);
    }

  const field = document.createElement('canvas');
  field.width = w;
  field.height = h;
  field.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), w, h), 0, 0);
  const kindAt = (wx: number, wy: number) => kind[Math.min(h - 1, Math.floor(wy * LR)) * w + Math.min(w - 1, Math.floor(wx * LR))];

  const chunks: TerrainChunk[] = [];
  for (let cy = 0; cy < WORLD.height; cy += CHUNK)
    for (let cx = 0; cx < WORLD.width; cx += CHUNK) {
      const cw = Math.min(CHUNK, WORLD.width - cx), ch = Math.min(CHUNK, WORLD.height - cy);
      const c = document.createElement('canvas');
      c.width = cw * CHUNK_RES;
      c.height = ch * CHUNK_RES;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(field, cx * LR, cy * LR, cw * LR, ch * LR, 0, 0, c.width, c.height);
      ctx.scale(CHUNK_RES, CHUNK_RES);
      ctx.translate(-cx, -cy);
      ctx.lineCap = 'round';
      const r = rng(cx * 7 + cy * 13 + 1);
      // травинки
      for (let i = 0; i < 1400; i++) {
        const x = cx + r() * cw, y = cy + r() * ch;
        if (kindAt(x, y) !== Ground.Grass) continue;
        const len = 3 + r() * 4, bend = (r() - 0.5) * 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + bend * 0.3, y - len * 0.6, x + bend, y - len);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = r() < 0.55 ? 'rgba(160, 225, 110, 0.45)' : 'rgba(60, 120, 40, 0.35)';
        ctx.stroke();
      }
      // камешки и ямки на тропинках
      for (let i = 0; i < 220; i++) {
        const x = cx + r() * cw, y = cy + r() * ch;
        const k = kindAt(x, y);
        if (k !== Ground.Dirt && k !== Ground.Shore) continue;
        const s = 1 + r() * 2.2;
        ctx.beginPath();
        ctx.ellipse(x, y, s * 1.3, s, 0, 0, Math.PI * 2);
        ctx.fillStyle = r() < 0.5 ? 'rgba(90, 60, 30, 0.2)' : 'rgba(220, 200, 170, 0.35)';
        ctx.fill();
      }
      // блики на воде
      for (let i = 0; i < 60; i++) {
        const x = cx + r() * cw, y = cy + r() * ch;
        if (kindAt(x, y) !== Ground.Water || kindAt(x, y + 12) !== Ground.Water) continue;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.quadraticCurveTo(x, y - 2.5, x + 6, y);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(210, 235, 255, 0.55)';
        ctx.stroke();
      }
      chunks.push({ canvas: c, x: cx, y: cy });
    }
  return chunks;
}
