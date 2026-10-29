import { useEffect, useRef } from 'react';
import { COLS, ROWS, TERRAIN, WORLD } from '@game/shared';
import { useGame } from './GameScreen';

const W = 220, H = 165;

export function Minimap() {
  const game = useGame();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const ground = document.createElement('canvas');
    ground.width = W;
    ground.height = H;
    let groundReady = false;
    const sx = W / WORLD.width, sy = H / WORLD.height;

    const draw = () => {
      const s = game.state;
      if (!s?.tribes) return;
      if (!groundReady && s.terrain) {
        const g = ground.getContext('2d')!;
        g.fillStyle = '#56783a';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#3f7fb5';
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++)
            if (s.terrain[y * COLS + x] === TERRAIN.water) g.fillRect((x * W) / COLS, (y * H) / ROWS, W / COLS + 0.6, H / ROWS + 0.6);
        groundReady = true;
      }
      ctx.drawImage(ground, 0, 0);
      ctx.fillStyle = '#2f5a24';
      s.resources.forEach((r) => {
        if (r.kind === 'tree') ctx.fillRect(r.x * sx - 0.5, r.y * sy - 0.5, 1.5, 1.5);
      });
      s.animals.forEach((a) => {
        if (!game.fog.canSee(a.x, a.y)) return;
        ctx.fillStyle = a.kind === 'mammoth' ? '#7a4a20' : a.kind === 'deer' ? '#d9b06a' : '#ff3b3b';
        const r = a.kind === 'mammoth' ? 3 : 2;
        ctx.fillRect(a.x * sx - r / 2, a.y * sy - r / 2, r, r);
      });
      s.buildings.forEach((b) => {
        if (!game.canSeeEntity(b.id)) return;
        ctx.fillStyle = s.tribes.get(b.tribe)?.color ?? '#fff';
        ctx.fillRect(b.x * sx - 2, b.y * sy - 2, 4, 4);
      });
      s.units.forEach((u) => {
        if (!game.canSeeEntity(u.id)) return;
        ctx.fillStyle = s.tribes.get(u.tribe)?.color ?? '#fff';
        ctx.fillRect(u.x * sx - 1, u.y * sy - 1, 2, 2);
      });
      // туман войны поверх карты
      ctx.drawImage(game.fog.canvas, 0, 0, W, H);
      s.tribes.forEach((t) => {
        if (!game.canSeeEntity(t.id)) return;
        ctx.fillStyle = t.color;
        ctx.strokeStyle = t.id === game.tribeId ? '#fff' : '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(t.x * sx, t.y * sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      const { w, h } = game.screen;
      const z = game.camera.zoom;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect((game.camera.x - w / 2 / z) * sx, (game.camera.y - h / 2 / z) * sy, (w / z) * sx, (h / z) * sy);
    };
    draw();
    const timer = setInterval(draw, 250);
    return () => clearInterval(timer);
  }, [game]);

  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    game.centerOn(((e.clientX - r.left) / r.width) * WORLD.width, ((e.clientY - r.top) / r.height) * WORLD.height);
  };

  return (
    <div className="panel minimap">
      <canvas ref={ref} width={W} height={H} onPointerDown={jump} onPointerMove={jump} />
    </div>
  );
}
