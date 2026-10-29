import {
  ACTION_HINT,
  ANIMAL_LABEL,
  BUILDING_LABEL,
  RESOURCE_LABEL,
  unitLabel,
  actionFor,
  entityType,
  type AnimalKind,
  type ResourceKind,
  type BuildingKind,
  type TargetInfo,
  type UnitKind,
} from '@game/shared';
import { store } from '../store';
import type { Game } from './Game';
import { pickAt } from './picking';

const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const EDGE = 14;

/** Мышь и клавиатура: выделение, приказы, камера. */
export class InputController {
  private keys = new Set<string>();
  private box: { sx: number; sy: number; ex: number; ey: number } | null = null;
  private pan: { sx: number; sy: number; cx: number; cy: number } | null = null;
  private mouse = { x: -1, y: -1, inside: false };
  private lastClick = { id: '', time: 0 };
  private groups = new Map<string, string[]>();
  /** Рамка выделения — обычный div поверх холста. */
  private readonly boxEl = document.createElement('div');
  private hintT = 0;
  private readonly canvas: HTMLCanvasElement;

  constructor(private readonly game: Game) {
    this.canvas = game.canvas;
    this.boxEl.className = 'select-box';
    game.host.appendChild(this.boxEl);
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointerleave', this.onLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('contextmenu', this.prevent);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  destroy() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.prevent);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.boxEl.remove();
  }

  update(dt: number) {
    const cam = this.game.camera;
    let dx = 0, dy = 0;
    for (const k of this.keys) {
      const v = PAN_KEYS[k];
      if (v) {
        dx += v[0];
        dy += v[1];
      }
    }
    const { w, h } = this.game.screen;
    if (this.mouse.inside && !this.box && !this.pan && document.hasFocus()) {
      if (this.mouse.x < EDGE) dx -= 1;
      if (this.mouse.x > w - EDGE) dx += 1;
      if (this.mouse.y < EDGE) dy -= 1;
      if (this.mouse.y > h - EDGE) dy += 1;
    }
    const speed = (700 / cam.zoom) * dt;
    cam.x += dx * speed;
    cam.y += dy * speed;

    this.boxEl.style.display = this.box ? 'block' : 'none';
    if (this.box) {
      const { sx, sy, ex, ey } = this.box;
      Object.assign(this.boxEl.style, {
        left: `${Math.min(sx, ex)}px`,
        top: `${Math.min(sy, ey)}px`,
        width: `${Math.abs(ex - sx)}px`,
        height: `${Math.abs(ey - sy)}px`,
      });
    }
    this.game.mouseWorld = this.game.toWorld(this.mouse.x, this.mouse.y);
    this.hintT -= dt;
    if (this.hintT <= 0) {
      this.hintT = 0.1;
      this.updateHint();
    }
  }

  // ---------- мышь ----------

  private prevent = (e: Event) => e.preventDefault();

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.mouse = { x: e.offsetX, y: e.offsetY, inside: true };
    const placing = store.get().placing;
    if (e.button === 0) {
      if (placing) return this.place(e.shiftKey);
      this.box = { sx: e.offsetX, sy: e.offsetY, ex: e.offsetX, ey: e.offsetY };
    } else if (e.button === 2) {
      if (placing) return this.game.cancelPlacing();
      this.order(e.offsetX, e.offsetY);
    } else if (e.button === 1) {
      e.preventDefault();
      this.pan = { sx: e.offsetX, sy: e.offsetY, cx: this.game.camera.x, cy: this.game.camera.y };
    }
  };

  private onMove = (e: PointerEvent) => {
    this.mouse = { x: e.offsetX, y: e.offsetY, inside: true };
    if (this.box) {
      this.box.ex = e.offsetX;
      this.box.ey = e.offsetY;
    }
    if (this.pan) {
      const z = this.game.camera.zoom;
      this.game.camera.x = this.pan.cx - (e.offsetX - this.pan.sx) / z;
      this.game.camera.y = this.pan.cy - (e.offsetY - this.pan.sy) / z;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.button === 1) this.pan = null;
    if (e.button !== 0 || !this.box) return;
    const b = this.box;
    this.box = null;
    if (Math.abs(b.ex - b.sx) < 6 && Math.abs(b.ey - b.sy) < 6) this.clickSelect(b.sx, b.sy, e.shiftKey);
    else this.boxSelect(b, e.shiftKey);
  };

  private onLeave = () => {
    this.mouse.inside = false;
    store.set({ hint: null });
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.game.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1 : -1);
  };

  // ---------- выделение ----------

  private clickSelect(sx: number, sy: number, add: boolean) {
    const g = this.game;
    const p = g.toWorld(sx, sy);
    const id = pickAt(g.state, p.x, p.y, { canSee: (id) => g.canSeeEntity(id) });
    const sel = store.get().selection;
    if (!id) {
      if (!add) g.select([]);
      return;
    }
    const unit = g.state.units.get(id);
    const own = unit && unit.tribe === g.tribeId;
    if (own) {
      const now = performance.now();
      if (this.lastClick.id === id && now - this.lastClick.time < 350) {
        // двойной клик — все такие же на экране
        const { w, h } = g.screen;
        g.selectGroup((u) => {
          const s = g.toScreen(u.x, u.y);
          return u.kind === unit.kind && s.x >= 0 && s.y >= 0 && s.x <= w && s.y <= h;
        });
      } else if (add && sel.every((s) => entityType(s) === 'unit')) {
        g.select(sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);
      } else g.select([id]);
      this.lastClick = { id, time: now };
      return;
    }
    // чужие и прочие объекты выделяем для просмотра
    g.select([id]);
  }

  private boxSelect(b: { sx: number; sy: number; ex: number; ey: number }, add: boolean) {
    const g = this.game;
    const x0 = Math.min(b.sx, b.ex), x1 = Math.max(b.sx, b.ex), y0 = Math.min(b.sy, b.ey), y1 = Math.max(b.sy, b.ey);
    const ids = g
      .myUnits()
      .filter((u) => {
        const s = g.toScreen(u.x, u.y - 15);
        return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
      })
      .map((u) => u.id);
    const prev = add ? store.get().selection.filter((s) => entityType(s) === 'unit') : [];
    g.select([...new Set([...prev, ...ids])]);
  }

  // ---------- приказы ----------

  private order(sx: number, sy: number) {
    const g = this.game;
    const units = g.selectedUnits();
    if (!units.length) return;
    const p = g.toWorld(sx, sy);
    const target = pickAt(g.state, p.x, p.y, { canSee: (id) => g.canSeeEntity(id) });
    const ids = units.map((u) => u.id);
    if (target && !ids.includes(target)) {
      g.send({ type: 'act', units: ids, target });
      g.flashEntity(target);
      const loc = locate(g, target);
      const hostile = entityType(target) === 'animal' || (loc && 'tribe' in loc && loc.tribe !== g.tribeId);
      g.addMarker(loc?.x ?? p.x, loc?.y ?? p.y, hostile ? 0xff4040 : 0xffd24a);
    } else {
      g.send({ type: 'move', units: ids, x: Math.round(p.x), y: Math.round(p.y) });
      g.addMarker(p.x, p.y, 0x7dff6a);
    }
  }

  private place(keep: boolean) {
    const g = this.game;
    const { x, y } = g.mouseWorld;
    const problem = g.placementProblemAt(x, y);
    if (problem) {
      store.addLog({ text: `Здесь нельзя строить: ${problem.toLowerCase()}.`, tone: 'bad' });
      return;
    }
    const builders = g.selectedUnits().filter((u) => u.kind !== 'child');
    const kind = store.get().placing;
    if (!builders.length || !kind) return g.cancelPlacing();
    g.send({ type: 'build', units: builders.map((u) => u.id), building: kind, x: Math.round(x), y: Math.round(y) });
    if (!keep) g.cancelPlacing();
  }

  // ---------- клавиатура ----------

  private onKeyDown = (e: KeyboardEvent) => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    const g = this.game;
    if (PAN_KEYS[e.code]) {
      this.keys.add(e.code);
      e.preventDefault();
      return;
    }
    const digit = /^Digit([0-9])$/.exec(e.code)?.[1];
    if (digit) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups.set(digit, g.selectedUnits().map((u) => u.id));
        store.addLog({ text: `Отряд ${digit} запомнен.`, tone: 'info' });
      } else {
        const ids = (this.groups.get(digit) ?? []).filter((id) => g.state.units.has(id));
        if (ids.length) {
          const same = store.get().selection.join() === ids.join();
          g.select(ids);
          if (same) {
            const u = g.state.units.get(ids[0])!;
            g.centerOn(u.x, u.y);
          }
        }
      }
      return;
    }
    switch (e.code) {
      case 'Equal':
      case 'NumpadAdd':
        g.zoomAt(g.screen.w / 2, g.screen.h / 2, 1);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        g.zoomAt(g.screen.w / 2, g.screen.h / 2, -1);
        break;
      case 'KeyB':
        g.startPlacing('hut');
        break;
      case 'KeyV':
        g.startPlacing('storage');
        break;
      case 'KeyN':
        g.startPlacing('forge');
        break;
      case 'KeyK':
        g.startPlacing('kitchen');
        break;
      case 'KeyE':
        if (g.selectedUnits().length) g.send({ type: 'eat', units: g.selectedUnits().map((u) => u.id) });
        break;
      case 'KeyX':
        if (g.selectedUnits().length) g.send({ type: 'stop', units: g.selectedUnits().map((u) => u.id) });
        break;
      case 'Escape':
        if (store.get().placing) g.cancelPlacing();
        else g.select([]);
        break;
      case 'Space':
      case 'KeyH':
        e.preventDefault();
        g.centerHome();
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => this.keys.clear();

  // ---------- подсказка под курсором ----------

  private updateHint() {
    const g = this.game;
    if (!this.mouse.inside || store.get().placing || this.box) {
      if (store.get().hint) store.set({ hint: null });
      return;
    }
    const p = g.toWorld(this.mouse.x, this.mouse.y);
    const id = pickAt(g.state, p.x, p.y, { canSee: (id) => g.canSeeEntity(id) });
    let text = '';
    if (id) {
      const name = describeName(g, id);
      const units = g.selectedUnits();
      const info = targetInfo(g, id);
      const action = units.length && info && !units.some((u) => u.id === id) ? units.map((u) => actionFor(u.kind as UnitKind, info, u.armed)).find(Boolean) : null;
      text = action ? `${name} — ПКМ: ${ACTION_HINT[action]}` : name;
    }
    const prev = store.get().hint;
    if (!text) {
      if (prev) store.set({ hint: null });
    } else if (!prev || prev.text !== text || prev.x !== this.mouse.x || prev.y !== this.mouse.y) {
      store.set({ hint: { x: this.mouse.x, y: this.mouse.y, text } });
    }
  }
}

function locate(g: Game, id: string): { x: number; y: number; tribe?: string } | undefined {
  const s = g.state;
  return s.units.get(id) ?? s.animals.get(id) ?? s.buildings.get(id) ?? s.resources.get(id) ?? s.tribes.get(id);
}

function targetInfo(g: Game, id: string): TargetInfo | null {
  const s = g.state;
  switch (entityType(id)) {
    case 'resource': {
      const r = s.resources.get(id);
      return r ? { entity: 'resource', kind: r.kind as ResourceKind } : null;
    }
    case 'animal':
      return { entity: 'animal' };
    case 'unit':
      return { entity: 'unit', own: s.units.get(id)?.tribe === g.tribeId };
    case 'building': {
      const b = s.buildings.get(id);
      return b ? { entity: 'building', own: b.tribe === g.tribeId, built: b.progress >= 100, kind: b.kind as BuildingKind } : null;
    }
    case 'tribe':
      return { entity: 'tribe', own: id === g.tribeId };
    default:
      return null;
  }
}

export function describeName(g: Game, id: string): string {
  const s = g.state;
  switch (entityType(id)) {
    case 'unit': {
      const u = s.units.get(id);
      if (!u) return '';
      const tribe = u.tribe === g.tribeId ? '' : ` (${s.tribes.get(u.tribe)?.name ?? 'чужие'})`;
      return `${unitLabel(u)} ${u.name}${tribe}`;
    }
    case 'animal': {
      const a = s.animals.get(id);
      return a ? ANIMAL_LABEL[a.kind as AnimalKind] : '';
    }
    case 'resource': {
      const r = s.resources.get(id);
      return r ? `${RESOURCE_LABEL[r.kind as ResourceKind]} (${r.amount})` : '';
    }
    case 'building': {
      const b = s.buildings.get(id);
      if (!b) return '';
      const name = BUILDING_LABEL[b.kind as BuildingKind] ?? 'Постройка';
      return b.tribe === g.tribeId ? name : `${name} (${s.tribes.get(b.tribe)?.name ?? 'чужой'})`;
    }
    case 'tribe':
      return id === g.tribeId ? 'Ратуша племени' : `Ратуша: ${s.tribes.get(id)?.name ?? ''}`;
    default:
      return '';
  }
}
