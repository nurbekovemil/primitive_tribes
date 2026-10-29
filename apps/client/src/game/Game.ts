import Phaser from 'phaser';
import {
  COLS,
  ROWS,
  TERRAIN,
  VISION,
  WORLD,
  buildRadius,
  placementProblem,
  type BuildingKind,
  type BuildingView,
  type Command,
  type ServerMessages,
  type TribeView,
  type UnitView,
  type WorldView,
} from '@game/shared';
import type { Session } from '../net/connection';
import { store } from '../store';
import { applySprite, baseOf, loadManifest, makeSprite, preloadSprites, type Manifest } from './assets';
import { drawTerrain } from './gfx/ground';
import { hash2 } from './gfx/random';
import { knock } from './sfx';
import { AnimalSprite, BuildingSprite, CampSprite, DEPTH, ResourceSprite, UnitSprite } from './views';
import { InputController } from './input';
import { Fog } from './fog';

interface Spear {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  g: Phaser.GameObjects.Graphics;
}

interface Marker {
  x: number;
  y: number;
  t: number;
  color: number;
  g: Phaser.GameObjects.Graphics;
}

interface Decor {
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
}

/** Сцена Phaser: загружает картинки и каждый кадр отдаёт управление игре. */
class WorldScene extends Phaser.Scene {
  constructor(
    private readonly manifest: Manifest,
    private readonly onReady: (scene: WorldScene) => void,
    readonly onFrame: (dt: number) => void,
  ) {
    super('world');
  }

  preload() {
    preloadSprites(this, this.manifest);
  }

  create() {
    this.onReady(this);
  }

  update(_time: number, delta: number) {
    this.onFrame(Math.min(0.1, delta / 1000));
  }
}

export class Game {
  /** Камера в единицах мира; zoom — без учёта плотности пикселей экрана. */
  readonly camera = { x: WORLD.width / 2, y: WORLD.height / 2, zoom: 1.4 };
  readonly fog = new Fog();
  /** Позиция курсора в мире — для призрака постройки. */
  mouseWorld = { x: 0, y: 0 };
  private scene!: WorldScene;
  private decor: Decor[] = [];
  private decorTribes = -1;
  private ghostHut!: Phaser.GameObjects.Sprite;
  private ghostZone!: Phaser.GameObjects.Graphics;
  /** Руки мужа и жены, которые идут в хижину вместе. */
  private hands!: Phaser.GameObjects.Graphics;
  private readonly units = new Map<string, UnitSprite>();
  private readonly animals = new Map<string, AnimalSprite>();
  private readonly buildings = new Map<string, BuildingSprite>();
  private readonly resources = new Map<string, ResourceSprite>();
  private readonly camps = new Map<string, CampSprite>();
  private spears: Spear[] = [];
  private markers: Marker[] = [];
  private input!: InputController;
  private terrainBuilt = false;
  private uiTimer = 0;
  private fogTimer = 0;
  private cameraPlaced = false;
  private offFx: () => void = () => {};
  private destroyed = false;
  private readonly dpr = Math.min(2, devicePixelRatio || 1);
  private readonly resizer: ResizeObserver;

  private constructor(
    readonly host: HTMLElement,
    readonly session: Session,
    readonly manifest: Manifest,
    readonly phaser: Phaser.Game,
  ) {
    // холст рисуется в полном разрешении экрана, а на странице занимает размер контейнера
    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(host);
    // для отладки из консоли браузера
    if (import.meta.env.DEV) Object.assign(window, { game: this });
  }

  static async create(host: HTMLElement, session: Session): Promise<Game> {
    const manifest = await loadManifest();
    return new Promise((resolve) => {
      let game: Game | null = null;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const scene = new WorldScene(
        manifest,
        (s) => {
          game!.start(s);
          resolve(game!);
        },
        (dt) => game?.frame(dt),
      );
      const phaser = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host,
        width: Math.max(1, host.clientWidth * dpr),
        height: Math.max(1, host.clientHeight * dpr),
        backgroundColor: '#2d4a1e',
        antialias: true,
        // иначе при zoom ≠ 1 Phaser включает пиксель-арт и картинка становится ступенчатой
        pixelArt: false,
        roundPixels: false,
        banner: false,
        audio: { noAudio: true },
        // мышь и клавиатуру обрабатываем сами (input.ts)
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
        scene,
      });
      game = new Game(host, session, manifest, phaser);
    });
  }

  private start(scene: WorldScene) {
    this.scene = scene;
    this.fog.attach(scene, DEPTH.fog);
    this.ghostZone = scene.add.graphics().setDepth(DEPTH.ghost);
    this.hands = scene.add.graphics();
    this.ghostHut = scene.add.existing(makeSprite(scene, this.manifest, 'building/hut')).setDepth(DEPTH.ghost).setAlpha(0.65);
    this.ghostZone.setVisible(false);
    this.ghostHut.setVisible(false);
    this.input = new InputController(this);
    this.offFx = this.session.room.onMessage('fx', (hits: ServerMessages['fx']) => {
      for (const { id, spear } of hits) {
        this.units.get(id)?.strike();
        if (!spear) continue;
        // копьё вылетает из руки над плечом, а не от ног
        const [x1, y1, x2, y2] = spear, d = Math.sign(x2 - x1) || 1;
        this.spears.push({ x1: x1 + d * 14, y1: y1 - 22, x2, y2, t: 0, g: scene.add.graphics().setDepth(DEPTH.fx) });
      }
    });
    this.resize();
  }

  destroy() {
    this.destroyed = true;
    this.offFx();
    this.resizer.disconnect();
    this.input?.destroy();
    this.phaser.destroy(true);
  }

  get canvas(): HTMLCanvasElement {
    return this.phaser.canvas;
  }

  private resize() {
    if (this.destroyed) return;
    const { w, h } = this.screen;
    this.phaser.scale.resize(Math.max(1, w * this.dpr), Math.max(1, h * this.dpr));
    this.phaser.scale.setZoom(1 / this.dpr);
  }

  // ---------- доступ к миру ----------

  get state(): WorldView {
    return this.session.room.state;
  }

  get tribeId() {
    return this.session.tribeId;
  }

  myTribe(): TribeView | undefined {
    return this.state.tribes?.get(this.tribeId);
  }

  myUnits(): UnitView[] {
    const out: UnitView[] = [];
    this.state.units?.forEach((u) => {
      if (u.tribe === this.tribeId) out.push(u);
    });
    return out;
  }

  send(cmd: Command) {
    this.session.room.send('cmd', cmd);
  }

  // ---------- камера ----------

  /** Размер области игры в CSS-пикселях. */
  get screen() {
    if (this.destroyed) return { w: 0, h: 0 };
    return { w: this.host.clientWidth, h: this.host.clientHeight };
  }

  toWorld(sx: number, sy: number) {
    const { w, h } = this.screen;
    return { x: (sx - w / 2) / this.camera.zoom + this.camera.x, y: (sy - h / 2) / this.camera.zoom + this.camera.y };
  }

  toScreen(x: number, y: number) {
    const { w, h } = this.screen;
    return { x: (x - this.camera.x) * this.camera.zoom + w / 2, y: (y - this.camera.y) * this.camera.zoom + h / 2 };
  }

  centerOn(x: number, y: number) {
    this.camera.x = x;
    this.camera.y = y;
  }

  centerHome() {
    const t = this.myTribe();
    if (t) this.centerOn(t.x, t.y);
  }

  zoomAt(sx: number, sy: number, direction: number) {
    const before = this.toWorld(sx, sy);
    this.camera.zoom = Math.max(0.7, Math.min(1.8, this.camera.zoom * (direction > 0 ? 1.12 : 1 / 1.12)));
    const after = this.toWorld(sx, sy);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
  }

  // ---------- выделение и приказы для интерфейса ----------

  select(ids: string[]) {
    store.set({ selection: ids });
  }

  selectGroup(filter: (u: UnitView) => boolean) {
    this.select(this.myUnits().filter(filter).map((u) => u.id));
  }

  selectedUnits(): UnitView[] {
    return store
      .get()
      .selection.map((id) => this.state.units.get(id))
      .filter((u): u is UnitView => !!u && u.tribe === this.tribeId);
  }

  startPlacing(kind: BuildingKind) {
    if (!this.selectedUnits().some((u) => u.kind !== 'child')) {
      store.addLog({ text: 'Сначала выделите взрослых строителей.', tone: 'bad' });
      return;
    }
    store.set({ placing: kind });
  }

  cancelPlacing() {
    store.set({ placing: null });
  }

  placementProblemAt(x: number, y: number): string | null {
    const tribe = this.myTribe();
    if (!tribe) return 'Нет племени';
    return placementProblem(store.get().placing ?? 'hut', x, y, {
      terrain: this.state.terrain,
      buildings: this.state.buildings.values(),
      resources: this.state.resources.values(),
      campfires: this.state.tribes.values(),
      ownTribe: tribe,
    });
  }

  /** Мигнуть объектом, по которому отдан приказ. */
  flashEntity(id: string) {
    (this.resources.get(id) ?? this.animals.get(id) ?? this.buildings.get(id) ?? this.units.get(id) ?? this.camps.get(id))?.flash.start();
  }

  addMarker(x: number, y: number, color: number) {
    this.markers.push({ x, y, t: 0, color, g: this.scene.add.graphics().setDepth(DEPTH.fx) });
  }

  // ---------- кадр ----------

  /** Муж и жена по пути в хижину держатся за руки: рисуем сцепленные руки между ними. */
  private drawHands() {
    const g = this.hands.clear();
    let depth = -Infinity;
    this.state.units.forEach((w) => {
      if (w.sex !== 'f' || w.action !== 'birth' || w.inside) return;
      const m = this.state.units.get(w.partner);
      const a = this.units.get(w.id)?.root, b = this.units.get(w.partner)?.root;
      if (!m || m.action !== 'birth' || m.inside || !a || !b || !a.visible || !b.visible) return;
      if (Math.hypot(a.x - b.x, a.y - b.y) > 34) return;
      const s = b.x >= a.x ? 1 : -1;
      const x1 = a.x + s * 9, y1 = a.y - 16, x2 = b.x - s * 9, y2 = b.y - 16;
      g.lineStyle(6, 0x23150b).lineBetween(x1, y1, x2, y2);
      g.lineStyle(3.5, 0xc4885a).lineBetween(x1, y1, x2, y2);
      g.fillStyle(0x23150b).fillCircle((x1 + x2) / 2, (y1 + y2) / 2, 4.5);
      g.fillStyle(0xc4885a).fillCircle((x1 + x2) / 2, (y1 + y2) / 2, 3);
      depth = Math.max(depth, a.y, b.y);
    });
    g.setDepth(depth + 1);
  }

  private frame(dt: number) {
    const state = this.state;
    if (!this.scene || !state?.tribes) return;
    if (!this.terrainBuilt && state.terrain) {
      this.buildGround(state.terrain);
      this.terrainBuilt = true;
    }
    this.hideDecorNearCamps();
    const me = this.myTribe();
    if (me && !this.cameraPlaced) {
      this.centerOn(me.x, me.y);
      this.cameraPlaced = true;
    }
    this.input.update(dt);
    this.applyCamera();
    this.sync(dt);
    this.updateFx(dt);
    this.updateGhost();
    this.fogTimer -= dt;
    if (this.fogTimer <= 0) {
      this.fogTimer = 0.15;
      this.updateFog();
    }

    this.uiTimer += dt;
    if (this.uiTimer > 0.2) {
      this.uiTimer = 0;
      this.pruneSelection();
      store.set({ frame: store.get().frame + 1 });
    }
  }

  private applyCamera() {
    const c = this.camera;
    c.x = Math.max(0, Math.min(WORLD.width, c.x));
    c.y = Math.max(0, Math.min(WORLD.height, c.y));
    const cam = this.scene.cameras.main;
    cam.setZoom(c.zoom * this.dpr);
    cam.centerOn(c.x, c.y);
  }

  /** Земля (рисуется по карте мира) и декор: трава, цветы, папоротники, камни — одинаково у всех игроков. */
  private buildGround(terrain: string) {
    const s = this.scene;
    drawTerrain(terrain).forEach((c, i) => {
      s.textures.addCanvas(`ground-${i}`, c.canvas);
      s.add.image(c.x, c.y, `ground-${i}`).setOrigin(0).setDepth(DEPTH.ground);
    });
    const avoid = [...this.state.resources.values()];
    const T = WORLD.tile;
    const pick = (name: string, n: number, h: number) => `nature/${name}-${1 + (Math.floor(h * 1000) % n)}`;
    for (let ty = 0; ty < ROWS; ty++)
      for (let tx = 0; tx < COLS; tx++) {
        if (terrain[ty * COLS + tx] === TERRAIN.water) continue;
        for (let k = 0; k < 2; k++) {
          const h = hash2(tx, ty, 41 + k * 7);
          let key = '';
          if (h < 0.06) key = `nature/tuft-${1 + (Math.floor(h * 100) % 3)}`;
          else if (h < 0.08) key = pick('flowers', 5, h);
          else if (h < 0.095) key = pick('fern', 3, h);
          else if (h < 0.103) key = pick('rock', 2, h);
          else if (h < 0.107) key = pick('boulder', 2, h);
          if (!key) continue;
          const x = tx * T + hash2(tx, ty, 42 + k) * T, y = ty * T + hash2(tx, ty, 43 + k) * T;
          if (avoid.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 36 * 36)) continue;
          const sp = s.add.existing(makeSprite(s, this.manifest, key)).setPosition(x, y);
          if (hash2(tx, ty, 44 + k) < 0.5) sp.scaleX *= -1;
          // трава и цветы лежат на земле, остальное сортируется с объектами
          sp.setDepth(h < 0.08 ? DEPTH.flat + 1 : y);
          this.decor.push({ sprite: sp, x, y });
        }
      }
  }

  private sync(dt: number) {
    const s = this.state;
    const scene = this.scene;
    const m = this.manifest;
    const selected = new Set(store.get().selection);
    const { w, h } = this.screen;
    const view = {
      x0: this.camera.x - w / 2 / this.camera.zoom - 120,
      x1: this.camera.x + w / 2 / this.camera.zoom + 120,
      y0: this.camera.y - h / 2 / this.camera.zoom - 60,
      y1: this.camera.y + h / 2 / this.camera.zoom + 160,
    };
    const visible = (x: number, y: number) => x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1;
    const colorOf = (tribeId: string) => s.tribes.get(tribeId)?.color ?? '#999999';

    syncMap(this.units, s.units, () => new UnitSprite(scene, m), (v, u) => {
      const own = u.tribe === this.tribeId;
      const royal = u.chief || (!!u.partner && !!s.units.get(u.partner)?.chief);
      const impact = v.update(u, colorOf(u.tribe), selected.has(u.id), own, royal, dt);
      if (v.landed && visible(u.x, u.y) && (own || this.fog.canSee(u.x, u.y))) {
        // ноша упала на землю у склада: бревно — громче, еда — тихо
        const far = Math.hypot(u.x - this.camera.x, u.y - this.camera.y) * this.camera.zoom;
        knock((v.landed === 'wood' ? 0.22 : 0.1) * Math.max(0, 1 - far / 1400));
      }
      if (impact && u.task === 'build') {
        // удар по стройке: стук, пыль, постройка вздрагивает
        let best: BuildingView | null = null, bestD = 110 * 110;
        for (const b of s.buildings.values()) {
          if (b.progress >= 100) continue;
          const d = (b.x - u.x) ** 2 + (b.y - u.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = b;
          }
        }
        if (best) this.buildings.get(best.id)?.hit(u.x - best.x);
        if (visible(u.x, u.y) && (own || this.fog.canSee(u.x, u.y))) {
          const far = Math.hypot(u.x - this.camera.x, u.y - this.camera.y) * this.camera.zoom;
          knock(0.3 * Math.max(0, 1 - far / 1400));
        }
      } else if (impact) {
        // удар топором: вздрагивает ближайшее дерево перед человеком
        const hx = u.x + u.dir * 22;
        let best: string | null = null, bestD = 45 * 45;
        for (const r of s.resources.values()) {
          if (r.kind !== 'tree') continue;
          const d = (r.x - hx) ** 2 + (r.y - u.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = r.id;
          }
        }
        if (best) this.resources.get(best)?.shake(u.dir);
      }
      // зашедших в хижину не видно
      v.root.setVisible(!u.inside && visible(v.root.x, v.root.y) && (own || this.fog.canSee(u.x, u.y)));
    });
    this.drawHands();
    syncMap(this.animals, s.animals, (a) => new AnimalSprite(scene, m, a.kind), (v, a) => {
      v.update(a, selected.has(a.id), dt);
      v.root.setVisible(visible(v.root.x, v.root.y) && this.fog.canSee(a.x, a.y));
    });
    syncMap(this.buildings, s.buildings, (b) => new BuildingSprite(scene, m, b.kind), (v, b) => {
      v.update(b, colorOf(b.tribe), selected.has(b.id), dt);
      v.setVisible(visible(b.x, b.y) && (b.tribe === this.tribeId || this.fog.canSee(b.x, b.y)));
    });
    syncMap(this.resources, s.resources, (r) => new ResourceSprite(scene, m, r), (v, r) => {
      const vis = visible(r.x, r.y);
      v.root.setVisible(vis);
      if (vis) v.update(r, selected.has(r.id), dt);
    });
    syncMap(this.camps, s.tribes, (t) => new CampSprite(scene, m, parseInt(t.id.slice(1), 36) || 1), (v, t) => {
      const vis = visible(t.x, t.y) && (t.id === this.tribeId || this.fog.canSee(t.x, t.y));
      v.setVisible(vis);
      if (vis) v.update(t, t.id === this.tribeId, selected.has(t.id), dt);
    });
  }

  private updateFx(dt: number) {
    this.spears = this.spears.filter((s) => {
      // копьё летит по дуге: чем дальше бросок, тем дольше полёт и выше дуга
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), dur = 0.12 + len / 650;
      s.t += dt;
      if (s.t >= dur) {
        s.g.destroy();
        return false;
      }
      const q = s.t / dur;
      const x = s.x1 + (s.x2 - s.x1) * q, y = s.y1 + (s.y2 - s.y1) * q - Math.sin(q * Math.PI) * (10 + len * 0.15);
      s.g.clear();
      s.g.lineStyle(2, 0x7a5228).lineBetween(-12, 0, 8, 0);
      s.g.fillStyle(0x9a9a9a).fillTriangle(8, -3, 14, 0, 8, 3);
      s.g.setPosition(x, y);
      // наконечник смотрит по касательной к дуге: сначала вверх, потом вниз
      s.g.rotation = Math.atan2(s.y2 - s.y1 - Math.cos(q * Math.PI) * Math.PI * (10 + len * 0.15), s.x2 - s.x1);
      return true;
    });
    this.markers = this.markers.filter((m) => {
      m.t += dt;
      if (m.t >= 0.6) {
        m.g.destroy();
        return false;
      }
      m.g.clear();
      m.g.lineStyle(3, m.color, 1 - m.t / 0.6).strokeCircle(m.x, m.y, 8 + m.t * 40);
      return true;
    });
  }

  private updateGhost() {
    const placing = store.get().placing;
    this.ghostHut.setVisible(!!placing);
    this.ghostZone.setVisible(!!placing);
    if (!placing) return;
    const { x, y } = this.mouseWorld;
    const ok = !this.placementProblemAt(x, y);
    applySprite(this.ghostHut, this.manifest, `building/${placing}`);
    this.ghostHut.setPosition(x, y).setTint(ok ? 0x9cff9c : 0xff8080);
    const tribe = this.myTribe();
    this.ghostZone.clear();
    if (tribe) {
      this.ghostZone.lineStyle(2, 0xffffff, 0.35).strokeCircle(tribe.x, tribe.y, buildRadius(placing, tribe.border));
      // круг лежит на земле по основанию постройки, как при выделении
      const [ry0, rx, ry] = baseOf(this.manifest, `building/${placing}`);
      this.ghostZone.lineStyle(2, ok ? 0x7dff6a : 0xff5050).strokeEllipse(x, y + ry0, rx * 2, ry * 2);
    }
  }

  /** Обзор: свои люди, построенные хижины и склады, ратуша. */
  private updateFog() {
    const s = this.state;
    const sources: { x: number; y: number; r: number }[] = [];
    const me = this.myTribe();
    if (me) sources.push({ x: me.x, y: me.y, r: VISION.camp });
    s.units.forEach((u) => {
      if (u.tribe === this.tribeId) sources.push({ x: u.x, y: u.y, r: VISION[u.kind as keyof typeof VISION] ?? VISION.child });
    });
    s.buildings.forEach((b) => {
      if (b.tribe === this.tribeId && b.progress >= 100) sources.push({ x: b.x, y: b.y, r: VISION[b.kind as BuildingKind] ?? VISION.hut });
    });
    this.fog.update(sources);
  }

  /** Можно ли видеть сущность: своё видно всегда, чужое — только в зоне обзора. */
  canSeeEntity(id: string): boolean {
    const s = this.state;
    const u = s.units.get(id);
    if (u) return u.tribe === this.tribeId || this.fog.canSee(u.x, u.y);
    const a = s.animals.get(id);
    if (a) return this.fog.canSee(a.x, a.y);
    const b = s.buildings.get(id);
    if (b) return b.tribe === this.tribeId || this.fog.canSee(b.x, b.y);
    const t = s.tribes.get(id);
    if (t) return t.id === this.tribeId || this.fog.canSee(t.x, t.y);
    return true;
  }

  /** Декор не должен торчать посреди лагерей племён. */
  private hideDecorNearCamps() {
    const tribes = this.state.tribes;
    if (tribes.size === this.decorTribes) return;
    this.decorTribes = tribes.size;
    const camps = [...tribes.values()];
    const r = 200;
    for (const d of this.decor) d.sprite.setVisible(!camps.some((t) => (t.x - d.x) ** 2 + (t.y - d.y) ** 2 < r * r));
  }

  /** Убираем из выделения погибших и чужих. */
  private pruneSelection() {
    const sel = store.get().selection;
    const s = this.state;
    const alive = sel.filter((id) => s.units.has(id) || s.buildings.has(id) || s.tribes.has(id) || s.animals.has(id) || s.resources.has(id));
    if (alive.length !== sel.length) store.set({ selection: alive });
  }
}

/** Создать/обновить/удалить отображения по карте состояния. */
function syncMap<V extends { destroy(): void }, T extends { id: string }>(
  views: Map<string, V>,
  items: { forEach(cb: (v: T, k: string) => void): void; has(k: string): boolean },
  create: (item: T) => V,
  update: (view: V, item: T) => void,
) {
  items.forEach((item, key) => {
    let v = views.get(key);
    if (!v) {
      v = create(item);
      views.set(key, v);
    }
    update(v, item);
  });
  for (const [key, v] of views) {
    if (!items.has(key)) {
      v.destroy();
      views.delete(key);
    }
  }
}
