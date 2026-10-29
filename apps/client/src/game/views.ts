import Phaser from 'phaser';
import { CRAWL, RUN_K, UNARMED, WEAPONS, type AnimalView, type BuildingView, type ResourceView, type TribeView, type UnitView } from '@game/shared';
import { applySprite, baseOf, makeSprite, type Manifest } from './assets';
import { hash2 } from './gfx/random';

type Scene = Phaser.Scene;
const { Container, Graphics, Text } = Phaser.GameObjects;

/** Слои по глубине: объекты мира сортируются по y (0..высота мира), остальное — над или под ними. */
export const DEPTH = { ground: -3e6, flat: -2e6, fx: 1e6, fog: 2e6, ghost: 3e6 } as const;

/**
 * Кадры людей (см. полосы person/*-side.png): 0 — стоит, 1-6 — шаг, 7-8 — удар, 9-10 — рубка, 11-12 — сбор,
 * 13-19 — то же, что 0-6, но с ношей в руках, 20-21 — рубка (взмах и отдача), 22 — оглядывается, задрав голову,
 * 23-28 — бег в атаку (корпус наклонён вперёд).
 * Спереди и сзади: 0-6, 7-13 с ношей, 14-15 — смотрит влево / вправо.
 */
export const WALK_FRAMES = [1, 2, 3, 4, 5, 6];
const RUN_FRAMES = [23, 24, 25, 26, 27, 28];
/** Бой: 7 — замах (копьё над плечом, топор или кулак отведены назад), 8 — бросок или удар (копья в руке уже нет). */
const WINDUP_FRAME = 7, STRIKE_FRAME = 8;
/** Сколько секунд держится кадр удара после него и сколько длится замах перед следующим. */
const STRIKE_HOLD = 0.4, WINDUP_TIME = 0.45;
const PICK_FRAMES = [11, 12];
/** Рубка: долгий замах, быстрый взмах, удар (тут дерево вздрагивает), отдача. [кадр, секунды]. */
const CHOP_SEQ: [number, number][] = [[9, 0.4], [20, 0.07], [10, 0.24], [21, 0.26]];
const CHOP_IMPACT = 2;
const CHOP_CYCLE = CHOP_SEQ.reduce((t, [, d]) => t + d, 0);
const LOOK_UP_FRAME = 22;
const LOOK_SIDE_FRAMES = [14, 15];
const CARRY_FRAME = { side: 13, front: 7, back: 7 } as const;
/** Где руки держат ношу у взрослого мужчины (у женщины всё в 1.08 раза ниже). */
const CARRY_AT = { side: [17, -27], front: [0, -25], back: [0, -26] } as const;

const smooth = (dt: number) => 1 - Math.exp(-dt * 14);
const colorNum = (hex: string) => parseInt(hex.slice(1), 16);

function drawBar(g: Phaser.GameObjects.Graphics, y: number, w: number, k: number, color: number) {
  g.clear();
  g.fillStyle(0x2a1a10).fillRect(-w / 2 - 2, y - 2, w + 4, 8);
  g.fillStyle(0x5a3a20).fillRect(-w / 2, y, w, 4);
  g.fillStyle(color).fillRect(-w / 2, y, Math.round(w * Math.max(0, Math.min(1, k))), 4);
}

/** Мягкая падающая тень: свет слева сверху, поэтому тень чуть сдвинута вправо. Высоким объектам — длиннее. */
function shadow(scene: Scene, rx: number, ry: number, tall = 0) {
  const g = new Graphics(scene);
  const ox = rx * 0.18 + tall * 0.25;
  for (const [k, a] of [[1.25, 0.05], [1, 0.08], [0.72, 0.1]] as const) {
    g.fillStyle(0x1a1006, a).fillEllipse(ox, ry * 0.15, 2 * (rx * k + tall * 0.3 * k), 2 * ry * k);
  }
  return g;
}

const label = (scene: Scene, size: number) =>
  new Text(scene, 0, 0, '', {
    fontSize: `${size}px`,
    fontFamily: 'Trebuchet MS, sans-serif',
    fontStyle: 'bold',
    color: '#ffffff',
    stroke: '#2a1a10',
    strokeThickness: 4,
  })
    .setOrigin(0.5, 1)
    .setResolution(3);

const ring = (g: Phaser.GameObjects.Graphics, y: number, rx: number, ry: number, width: number, color: number, alpha = 1) =>
  g.lineStyle(width, color, alpha).strokeEllipse(0, y, rx * 2, ry * 2);

/** Плавное следование за серверной позицией. */
const FLASH_TIME = 0.75;

/**
 * Вспышка объекта, по которому отдан приказ: поверх картинки на миг кладётся её светлая копия
 * (сложение цветов) — объект трижды ярко мигает, видно, что клик попал.
 */
export class Flash {
  private twin: Phaser.GameObjects.Sprite | null = null;
  private t = 0;

  start() {
    this.t = FLASH_TIME;
  }

  /** src — что мигает; top — копию класть поверх всего контейнера (у людей поверх одежды). */
  update(src: Phaser.GameObjects.Sprite, dt: number, top = false) {
    if (this.t <= 0 && !this.twin) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.twin?.destroy();
      this.twin = null;
      return;
    }
    const c = src.parentContainer;
    if (!this.twin) {
      this.twin = new Phaser.GameObjects.Sprite(src.scene, 0, 0, src.texture.key).setBlendMode(Phaser.BlendModes.ADD);
      if (top) c.add(this.twin);
      else c.addAt(this.twin, c.getIndex(src) + 1);
    }
    const k = (FLASH_TIME - this.t) / FLASH_TIME;
    this.twin
      .setTexture(src.texture.key, src.frame.name)
      .setOrigin(src.originX, src.originY)
      .setScale(src.scaleX, src.scaleY)
      .setPosition(src.x, src.y)
      .setRotation(src.rotation)
      .setVisible(src.visible)
      .setAlpha(0.75 * Math.abs(Math.sin(k * Math.PI * 3)));
  }
}

abstract class Movable {
  readonly root: Phaser.GameObjects.Container;
  protected moving = false;
  /** Сглаженная скорость на экране — по ней видно, куда идёт персонаж. */
  protected vx = 0;
  protected vy = 0;
  private placed = false;

  constructor(protected readonly scene: Scene) {
    this.root = scene.add.container();
  }

  protected follow(x: number, y: number, dt: number) {
    const r = this.root;
    if (!this.placed || Math.hypot(x - r.x, y - r.y) > 250) {
      r.setPosition(x, y);
      this.placed = true;
      this.moving = false;
    } else {
      const k = smooth(dt);
      const dx = (x - r.x) * k, dy = (y - r.y) * k;
      r.x += dx;
      r.y += dy;
      this.moving = Math.hypot(dx, dy) > 0.15;
      if (dt > 0) {
        this.vx = this.vx * 0.8 + (dx / dt) * 0.2;
        this.vy = this.vy * 0.8 + (dy / dt) * 0.2;
      }
    }
    r.setDepth(r.y);
  }

  destroy() {
    this.root.destroy();
  }
}

// ---------- люди ----------

/** Скорость шага людей в кадрах в секунду: подобрана под скорость ходьбы, чтобы ноги не «скользили». */
const PERSON_STEP_FPS = 13;

export class UnitSprite extends Movable {
  private readonly figure: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Sprite;
  /** Одежда — отдельный слой (*-color), красится в цвет племени. */
  private readonly cloth: Phaser.GameObjects.Sprite;
  private readonly carry: Phaser.GameObjects.Sprite;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  /** Куда смотрит: сбоку, к нам (идёт вниз) или спиной (идёт вверх). */
  private facing: 'side' | 'front' | 'back' = 'front';
  private animT = Math.random() * 4;
  private chopT = 0;
  private chopStep = -1;
  /** Секунд с последнего удара (по сообщению сервера): по нему идут замах и удар. */
  private strikeT = 99;
  readonly flash = new Flash();
  private breathT = Math.random() * 10;
  /** Стоя без дела, человек иногда оглядывается: смотрит в другую сторону или по сторонам. */
  private idleT = 1 + Math.random() * 4;
  private look: { frame: number; flip: boolean } | null = null;
  private barKey = '';
  private ringKey = '';

  constructor(scene: Scene, private readonly m: Manifest) {
    super(scene);
    this.body = makeSprite(scene, m, 'person/man-front');
    this.cloth = makeSprite(scene, m, 'person/man-front-color');
    this.carry = makeSprite(scene, m, 'item/basket');
    this.figure = new Container(scene, 0, 0, [this.body, this.cloth, this.carry]);
    this.ring = new Graphics(scene);
    this.bar = new Graphics(scene);
    this.name = label(scene, 13);
    this.root.add([shadow(scene, 14, 5, 16), this.ring, this.figure, this.bar, this.name]);
  }

  /** Сервер засчитал удар этого человека. */
  strike() {
    this.strikeT = 0;
  }

  /** Возвращает true в миг удара топором по дереву или молотком по стройке (смотри u.task). */
  /** royal — вождь или его жена: у них корона из костей. */
  update(u: UnitView, color: string, selected: boolean, mine: boolean, royal: boolean, dt: number): boolean {
    this.follow(u.x, u.y, dt);
    const child = u.kind === 'child';
    // мужчина без копья рисуется отдельной картинкой
    let kind = child ? (u.sex === 'm' ? 'boy' : 'girl') : u.kind === 'warrior' ? (!u.armed ? 'man' : u.weapon === 'axe' ? 'axeman' : 'warrior') : u.kind;
    if (royal && !child) kind += u.kind === 'woman' ? '-queen' : '-king';
    const working = !this.moving && (u.task !== '' || u.action === 'attack');
    if (this.moving) {
      const ax = Math.abs(this.vx), ay = Math.abs(this.vy);
      // с запасом, чтобы при ходьбе по диагонали вид не мигал
      if (ay > ax * 1.25) this.facing = this.vy < 0 ? 'back' : 'front';
      else if (ax > ay * 0.8) this.facing = 'side';
    } else if (working) this.facing = 'side';
    const side = this.facing === 'side';
    // во время работы руки заняты топором или сбором — ношу не рисуем
    const carrying = u.carry > 0 && !child && !working;
    const idle = !this.moving && !working;

    let frame = 0;
    let impact = false;
    if (this.moving) {
      // в атаку бегут: чаще шаг, сбоку — наклон вперёд (спереди и сзади — тот же шаг, только быстрее)
      const run = u.action === 'attack';
      this.animT += dt * PERSON_STEP_FPS * (run ? RUN_K : 1);
      const frames = run && side ? RUN_FRAMES : WALK_FRAMES;
      frame = frames[Math.floor(this.animT) % frames.length];
    } else if (u.task === 'chop' || u.task === 'build') {
      this.chopT = (this.chopT + dt) % CHOP_CYCLE;
      let step = 0;
      for (let t = this.chopT; step < CHOP_SEQ.length - 1 && t >= CHOP_SEQ[step][1]; step++) t -= CHOP_SEQ[step][1];
      impact = step === CHOP_IMPACT && this.chopStep !== CHOP_IMPACT;
      this.chopStep = step;
      frame = CHOP_SEQ[step][0];
    } else if (u.task === 'pick') {
      this.animT += dt * 1.5;
      frame = PICK_FRAMES[Math.floor(this.animT) % PICK_FRAMES.length];
    } else if (working) {
      // бой: удар — в миг, когда сервер его засчитал, замах — перед следующим (по перезарядке оружия)
      const cd = u.weapon && u.armed ? WEAPONS[u.weapon as keyof typeof WEAPONS].cooldown : UNARMED.cooldown;
      frame = this.strikeT < STRIKE_HOLD ? STRIKE_FRAME : this.strikeT > cd - WINDUP_TIME ? WINDUP_FRAME : 0;
    }
    this.strikeT += dt;
    if (u.task !== 'chop' && u.task !== 'build') this.chopT = this.chopStep = 0;

    if (idle) {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        if (this.look) {
          this.look = null;
          this.idleT = 2.5 + Math.random() * 5;
        } else {
          const r = Math.random();
          // с ношей руки заняты — только поворачивает голову в другую сторону
          if (side || carrying) this.look = r < 0.55 || carrying ? { frame: 0, flip: true } : { frame: side ? LOOK_UP_FRAME : 0, flip: false };
          else this.look = this.facing === 'back' ? { frame: 0, flip: true } : { frame: LOOK_SIDE_FRAMES[r < 0.5 ? 0 : 1], flip: false };
          this.idleT = 1 + Math.random() * 1.5;
        }
      }
      if (this.look && !carrying) frame = this.look.frame;
    } else {
      this.look = null;
      this.idleT = 1 + Math.random() * 3;
    }
    this.figure.scaleX = (side && u.dir < 0 ? -1 : 1) * (this.look?.flip ? -1 : 1);
    // спереди и сзади только стойка и шаг (кадры 0..6); с ношей — руки прижимают её к груди
    if (!side) frame = Math.min(frame, 6);
    if (carrying) frame += CARRY_FRAME[this.facing];
    let key = `person/${kind}-${this.facing}`;
    if (child && u.growth < CRAWL.until) {
      // малыш ещё не ходит: сидит или ползёт на четвереньках, всегда сбоку
      key = `person/baby-${kind}-side`;
      frame = this.moving ? 1 + (Math.floor(this.animT * 0.5) % 4) : 0;
      this.figure.scaleX = u.dir < 0 ? -1 : 1;
    }
    applySprite(this.body, this.m, key, frame);
    applySprite(this.cloth, this.m, `${key}-color`, frame);
    this.cloth.setTint(colorNum(color));
    // дыхание: грудь чуть поднимается и опускается
    this.breathT += dt;
    if (idle) this.body.scaleY *= 1 + 0.018 * Math.sin(this.breathT * 2.3);
    this.cloth.scaleY = this.body.scaleY;

    this.carry.setVisible(carrying);
    if (carrying) {
      const wood = u.carryType === 'wood';
      applySprite(this.carry, this.m, wood ? 'item/log' : u.action === 'gather' || u.carryType === 'food' ? 'item/basket' : 'item/meat');
      const k = u.kind === 'woman' ? 1 / 1.08 : 1;
      const [cx, cy] = CARRY_AT[this.facing];
      // покачивается в такт шагу; со спины ноша за телом
      const bob = this.moving ? Math.abs(Math.sin((Math.floor(this.animT) % 6) * (Math.PI / 3))) : 0;
      this.carry.setPosition(cx * k, cy * k - bob);
      this.carry.rotation = wood ? (side ? -0.12 : 0) : 0;
      this.figure.bringToTop(this.facing === 'back' ? this.body : this.carry);
      if (this.facing === 'back') this.figure.bringToTop(this.cloth);
    }

    const ringKey = `${selected}|${mine}|${color}`;
    if (ringKey !== this.ringKey) {
      this.ringKey = ringKey;
      this.ring.clear();
      if (selected) ring(this.ring, 0, 17, 7, 2.5, mine ? 0x9cff6a : 0xff6a6a);
      else if (mine) ring(this.ring, 0, 15, 6, 2, colorNum(color), 0.85);
    }

    const top = child ? (u.growth < CRAWL.until ? 30 : 42) : 60;
    const showBar = selected || u.hp < u.maxHp;
    const barKey = showBar ? `${u.hp}|${u.maxHp}|${top}` : '';
    if (barKey !== this.barKey) {
      this.barKey = barKey;
      if (showBar) drawBar(this.bar, -top - 10, 30, u.hp / u.maxHp, u.hp / u.maxHp > 0.5 ? 0x6ad84a : 0xe04040);
      else this.bar.clear();
    }
    this.name.setVisible(selected);
    if (selected) {
      const text = child ? `${u.name} ${u.growth}%` : u.name;
      if (this.name.text !== text) this.name.setText(text);
      this.name.y = -top - 14;
    }
    this.flash.update(this.body, dt, true);
    return impact;
  }
}

// ---------- звери ----------

const ANIMAL_H: Record<string, number> = { deer: 80, mammoth: 98, wolf: 50, tiger: 52 };
const ANIMAL_SHADOW: Record<string, [number, number]> = { deer: [26, 6], mammoth: [62, 14], wolf: [30, 6], tiger: [36, 7] };
/** Шаг зверя: кадры 1 и 2 — ноги врозь, 0 — стоит. */
const ANIMAL_WALK = [1, 0, 2, 0];

export class AnimalSprite extends Movable {
  private readonly img: Phaser.GameObjects.Sprite;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly alert: Phaser.GameObjects.Text;
  private readonly key: string;
  private readonly height: number;
  private barKey = '';
  private animT = Math.random() * 4;
  readonly flash = new Flash();

  constructor(scene: Scene, private readonly m: Manifest, kind: string) {
    super(scene);
    this.key = m[`animal/${kind}`] ? `animal/${kind}` : 'animal/deer';
    this.height = ANIMAL_H[kind] ?? 60;
    this.img = makeSprite(scene, m, this.key);
    this.bar = new Graphics(scene);
    this.alert = label(scene, 18).setText('!').setColor('#ff4030');
    this.alert.y = -this.height - 4;
    const [sx, sy] = ANIMAL_SHADOW[kind] ?? [20, 6];
    this.root.add([shadow(scene, sx, sy), this.img, this.bar, this.alert]);
  }

  update(a: AnimalView, selected: boolean, dt: number) {
    this.follow(a.x, a.y, dt);
    let frame = 0;
    if (this.moving) {
      this.animT += dt * (a.action === 'run' ? 7 : 3.5);
      frame = ANIMAL_WALK[Math.floor(this.animT) % 4];
    }
    applySprite(this.img, this.m, this.key, frame);
    this.flash.update(this.img, dt);
    this.img.scaleX = (a.dir < 0 ? -1 : 1) * Math.abs(this.img.scaleX);
    this.alert.setVisible(a.kind !== 'deer' && (a.action === 'run' || a.action === 'attack'));
    const showBar = selected || a.hp < a.maxHp;
    const barKey = showBar ? `${a.hp}` : '';
    if (barKey !== this.barKey) {
      this.barKey = barKey;
      if (showBar) drawBar(this.bar, -this.height - 12, Math.max(30, this.height * 0.5), a.hp / a.maxHp, 0xe04040);
      else this.bar.clear();
    }
  }
}

// ---------- хижины и склады ----------

/** Флажок или ленточка цвета племени на шесте постройки: колышется по ветру (8 кадров волны). */
class Flag {
  readonly parts: Phaser.GameObjects.Sprite[] = [];
  private readonly key: string = '';
  private t = Math.random() * 8;
  private readonly fps = 8 + Math.random() * 3;

  constructor(scene: Scene, private readonly m: Manifest, main: string) {
    const f = m[main]?.flag;
    if (!f) return;
    this.key = `building/${f[0]}`;
    for (const k of [this.key, `${this.key}-color`]) this.parts.push(makeSprite(scene, m, k).setPosition(f[1], f[2]));
  }

  update(dt: number, color: string) {
    if (!this.key) return;
    this.t += dt * this.fps;
    const frame = Math.floor(this.t) % 8;
    applySprite(this.parts[0], this.m, this.key, frame);
    applySprite(this.parts[1], this.m, `${this.key}-color`, frame).setTint(colorNum(color));
  }

  setVisible(v: boolean) {
    for (const sp of this.parts) sp.setVisible(v);
  }
}

/**
 * Картинки построек: три этапа стройки (полоса из 3 кадров), сама постройка, флажок цвета племени; высота полоски
 * и откуда идёт дым при стройке. Круг выделения и тень берутся из основания картинки (base в sprites.json).
 */
const BUILDING_LOOK: Record<string, { build: string; main: string; bar: number; smoke: number; fire?: [number, number] }> = {
  hut: { build: 'building/hut-build', main: 'building/hut', bar: -172, smoke: -150 },
  storage: { build: 'building/storage-build', main: 'building/storage', bar: -155, smoke: -110 },
  // у готовой кузницы дымит труба горна (fire — её верх от точки опоры, печатает tools/art/run.sh buildings)
  forge: { build: 'building/forge-build', main: 'building/forge', bar: -160, smoke: -110, fire: [-29, -148] },
  // кухня под открытым небом: точка опоры — центр очага, дым идёт прямо из огня
  kitchen: { build: 'building/kitchen-build', main: 'building/kitchen', bar: -125, smoke: -60, fire: [0, -26] },
};
/** Этап стройки по прогрессу: 0, 1, 2 — кадры полосы *-build, 3 — готово. */
const buildStage = (progress: number) => (progress >= 100 ? 3 : Math.min(2, Math.floor(progress / 34)));

/** Облачко пыли или дыма: летит, растёт и тает. */
type Puff = { sp: Phaser.GameObjects.Sprite; age: number; life: number; vx: number; vy: number; s0: number; s1: number; a: number };

export class BuildingSprite {
  readonly root: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Sprite;
  private readonly tepee: Phaser.GameObjects.Sprite;
  private readonly flag: Flag;
  /** Огонь в очаге (у кухни): языки пламени пляшут. */
  private readonly flame: Phaser.GameObjects.Sprite | null;
  private flameT = Math.random() * 6;
  readonly flash = new Flash();
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly puffs: Puff[] = [];
  private key = '';
  private readonly look: (typeof BUILDING_LOOK)[string];
  /** Этап стройки на прошлом кадре (-1 — ещё не рисовали): при смене этапа — клуб пыли. */
  private stage = -1;
  private lastProgress = -1;
  /** Сколько ещё секунд стройка считается идущей (после последнего прироста прогресса). */
  private busyT = 0;
  private smokeT = 0;
  /** Постройка вздрагивает от удара молотка. */
  private hitT = 0;

  constructor(scene: Scene, private readonly m: Manifest, kind: string) {
    this.look = BUILDING_LOOK[kind] ?? BUILDING_LOOK.hut;
    this.root = scene.add.container();
    this.ring = new Graphics(scene);
    this.frame = makeSprite(scene, m, this.look.build);
    this.tepee = makeSprite(scene, m, this.look.main);
    this.flag = new Flag(scene, m, this.look.main);
    const f = m[this.look.main]?.flame;
    this.flame = f ? makeSprite(scene, m, 'building/flame').setPosition(f[0], f[1]) : null;
    this.bar = new Graphics(scene);
    const [by, brx, bry] = baseOf(m, this.look.main);
    this.root.add([this.ring, shadow(scene, brx * 0.9, bry * 0.9, 30).setY(by), this.frame, this.tepee, ...(this.flame ? [this.flame] : []), ...this.flag.parts, this.bar]);
  }

  private puff(x: number, y: number, o: Partial<Omit<Puff, 'sp' | 'age'>>) {
    const sp = makeSprite(this.root.scene, this.m, 'item/puff').setPosition(x, y);
    sp.rotation = Math.random() * Math.PI * 2;
    this.root.addAt(sp, this.root.getIndex(this.bar));
    const p = { sp, age: 0, life: 1.2, vx: 0, vy: -20, s0: 0.5, s1: 1.2, a: 0.7, ...o };
    sp.setScale(p.s0 * 0.5).setAlpha(0);
    this.puffs.push(p);
  }

  /** Удар молотком со стороны человека (x — его смещение от центра постройки): пыль у основания, постройка вздрагивает. */
  hit(dx: number) {
    const [by, rx] = baseOf(this.m, this.look.main);
    const x = Math.max(-rx, Math.min(rx, dx)) * 0.8;
    for (let i = 0; i < 2; i++) {
      this.puff(x + (Math.random() - 0.5) * 16, by + 4 - Math.random() * 10, {
        life: 0.7 + Math.random() * 0.3,
        vx: (Math.random() - 0.5) * 40 - Math.sign(dx) * 10,
        vy: -12 - Math.random() * 10,
        s0: 0.35,
        s1: 0.8,
        a: 0.55,
      });
    }
    this.hitT = 0.18;
  }

  /** Клуб пыли по кругу основания: новый этап стройки или постройка готова. */
  private burst() {
    const [by, rx, ry] = baseOf(this.m, this.look.main);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const c = Math.cos(a), s = Math.sin(a);
      this.puff(c * rx * 0.9, by + s * ry * 0.9, { life: 1 + Math.random() * 0.6, vx: c * 34, vy: s * 10 - 14, s0: 0.6, s1: 1.5, a: 0.7 });
    }
  }

  /** Пока идёт стройка, над ней тянется дым от костра строителей и висит пыль. */
  private animateBuild(b: BuildingView, dt: number) {
    if (this.lastProgress >= 0 && b.progress > this.lastProgress) this.busyT = 1.5;
    this.lastProgress = b.progress;
    this.busyT = Math.max(0, this.busyT - dt);
    const stage = buildStage(b.progress);
    if (this.stage >= 0 && stage !== this.stage && b.progress > 0) this.burst();
    this.stage = stage;
    this.smokeT -= dt;
    if (this.busyT > 0 && stage < 3 && this.smokeT <= 0) {
      this.smokeT = 0.35 + Math.random() * 0.25;
      const [, rx] = baseOf(this.m, this.look.main);
      // дым тянется вверх и чуть вправо, по ветру
      this.puff(-rx * 0.2 + (Math.random() - 0.5) * rx, this.look.smoke * (0.15 + Math.random() * 0.25), {
        life: 2.4 + Math.random(),
        vx: 10 + Math.random() * 8,
        vy: -26 - Math.random() * 10,
        s0: 0.5,
        s1: 1.9,
        a: 0.38,
      });
    }
    const fire = this.look.fire;
    if (stage === 3 && fire && this.smokeT <= 0) {
      this.smokeT = 0.5 + Math.random() * 0.4;
      this.puff(fire[0] + (Math.random() - 0.5) * 6, fire[1], { life: 2.6 + Math.random(), vx: 6 + Math.random() * 6, vy: -22 - Math.random() * 8, s0: 0.3, s1: 1.4, a: 0.32 });
    }
    for (const p of this.puffs) {
      p.age += dt;
      const k = p.age / p.life;
      p.sp.x += p.vx * dt;
      p.sp.y += p.vy * dt;
      p.vx *= 1 - dt * 1.2;
      p.sp.rotation += dt * 0.4;
      p.sp.setScale((p.s0 + (p.s1 - p.s0) * Math.sqrt(k)) * 0.5);
      // быстро появляется, медленно тает
      p.sp.setAlpha(p.a * Math.min(1, k * 8) * (1 - k));
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      if (this.puffs[i].age >= this.puffs[i].life) {
        this.puffs[i].sp.destroy();
        this.puffs.splice(i, 1);
      }
    }
    this.hitT = Math.max(0, this.hitT - dt);
    const wob = this.hitT > 0 ? Math.sin(this.hitT * 70) * 0.012 * (this.hitT / 0.18) : 0;
    this.frame.rotation = wob;
  }

  /** Сердечки, вылетающие из хижины, пока там пара делает ребёнка. */
  private hearts: { t: Phaser.GameObjects.Text; age: number; vx: number }[] = [];
  private heartT = 0;
  private shakeT = 0;

  /** Пока в хижине пара — хижина трясётся, из макушки летят сердечки. */
  private animateLove(b: BuildingView, dt: number) {
    const love = b.birth > 0;
    this.shakeT = love ? this.shakeT + dt : 0;
    const rot = love ? Math.sin(this.shakeT * 26) * 0.035 * (0.6 + 0.4 * Math.sin(this.shakeT * 3.1)) : 0;
    for (const sp of [this.tepee, ...this.flag.parts]) sp.rotation = rot;
    this.heartT -= dt;
    if (love && this.heartT <= 0) {
      this.heartT = 0.3 + Math.random() * 0.25;
      const t = new Text(this.root.scene, (Math.random() - 0.5) * 24, this.look.bar + 30, '❤', {
        fontSize: `${14 + Math.floor(Math.random() * 8)}px`,
        fontFamily: 'Trebuchet MS, sans-serif',
        color: Math.random() < 0.5 ? '#ff4d6d' : '#ff8fab',
        stroke: '#5a1020',
        strokeThickness: 3,
      })
        .setOrigin(0.5)
        .setResolution(3);
      this.root.add(t);
      this.hearts.push({ t, age: 0, vx: (Math.random() - 0.5) * 30 });
    }
    for (const h of this.hearts) {
      h.age += dt;
      h.t.x += h.vx * dt + Math.sin(h.age * 6) * 0.4;
      h.t.y -= 38 * dt;
      h.t.setAlpha(Math.max(0, 1 - h.age / 1.4)).setScale(0.7 + h.age * 0.4);
    }
    this.hearts = this.hearts.filter((h) => (h.age < 1.4 ? true : (h.t.destroy(), false)));
  }

  update(b: BuildingView, color: string, selected: boolean, dt: number) {
    this.root.setPosition(b.x, b.y).setDepth(b.y);
    const built = b.progress >= 100;
    this.animateLove(b, dt);
    this.animateBuild(b, dt);
    if (built) this.flag.update(dt, color);
    this.flash.update(built ? this.tepee : this.frame, dt);
    if (this.flame) {
      this.flameT += dt * 12;
      if (built) applySprite(this.flame, this.m, 'building/flame', Math.floor(this.flameT) % 6);
    }
    const key = `${b.progress}|${b.hp}|${b.birth}|${selected}|${color}`;
    if (key === this.key) return;
    this.key = key;
    // стройка идёт в три этапа: тренога или столбы → весь каркас → шкуры наполовину; потом готовая постройка
    this.frame.setVisible(!built);
    if (!built) applySprite(this.frame, this.m, this.look.build, buildStage(b.progress));
    this.flag.setVisible(built);
    this.flame?.setVisible(built);
    this.tepee.setVisible(built);
    this.ring.clear();
    if (selected) ring(this.ring, ...baseOf(this.m, this.look.main), 2.5, 0x9cff6a);
    const y = this.look.bar;
    if (!built) drawBar(this.bar, y, 60, b.progress / 100, 0xffd24a);
    else if (b.birth > 0) drawBar(this.bar, y, 60, b.birth / 100, 0xff9ad5);
    else if (b.hp < b.maxHp) drawBar(this.bar, y, 60, b.hp / b.maxHp, 0xe04040);
    else this.bar.clear();
  }

  destroy() {
    this.root.destroy();
  }
}

// ---------- ресурсы ----------

const TREE_SHAKE = 0.7;

export class ResourceSprite {
  readonly root: Phaser.GameObjects.Container;
  private readonly img: Phaser.GameObjects.Sprite;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly tree: string | null = null;
  private readonly bush: string;
  private key = '';
  private shakeT = 0;
  private shakeDir = 1;

  constructor(
    scene: Scene,
    private readonly m: Manifest,
    r: ResourceView,
  ) {
    const h = hash2(Math.floor(r.x), Math.floor(r.y), 3);
    this.bush = h < 0.35 ? 'nature/bush-blue' : 'nature/bush-red';
    if (r.kind === 'tree') {
      const pick = 1 + Math.floor(hash2(Math.floor(r.y), Math.floor(r.x), 4) * 3);
      this.tree = h < 0.45 ? `nature/tree-${pick}` : `nature/pine-${pick}`;
    }
    this.img = makeSprite(scene, m, this.tree ?? (r.kind === 'bush' ? this.bush : 'item/meat'), this.bushFrame(r));
    if (r.kind === 'tree' && hash2(Math.floor(r.x), 7, 7) < 0.5) this.img.scaleX *= -1;
    this.ring = new Graphics(scene);
    let sh: Phaser.GameObjects.Graphics;
    if (r.kind === 'tree') sh = shadow(scene, 40, 11, 60);
    else if (r.kind === 'bush') sh = shadow(scene, 28, 7);
    else sh = new Graphics(scene).fillStyle(0x781e14, 0.35).fillEllipse(0, 0, 44, 16);
    this.root = scene.add.container(r.x, r.y, [sh, this.ring, this.img]).setDepth(r.y);
  }

  /** Кадр куста 0..10 — сколько ягод осталось от начального запаса. */
  private bushFrame(r: ResourceView) {
    return Math.max(0, Math.min(10, Math.ceil((r.amount / Math.max(1, r.max)) * 10)));
  }

  /** Дерево вздрагивает от удара топором и покачивается, затихая; dir — куда толкнули. */
  shake(dir: number) {
    this.shakeT = TREE_SHAKE;
    this.shakeDir = dir < 0 ? -1 : 1;
  }

  readonly flash = new Flash();

  update(r: ResourceView, selected: boolean, dt: number) {
    this.flash.update(this.img, dt);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeT / TREE_SHAKE;
      this.img.rotation = this.shakeDir * 0.05 * k * k * Math.sin((TREE_SHAKE - this.shakeT) * 30);
    }
    const key = `${r.amount}|${selected}`;
    if (key === this.key) return;
    this.key = key;
    this.ring.clear();
    if (selected) ring(this.ring, 2, 34, 11, 2.5, 0xffffff, 0.85);
    if (r.kind === 'tree') applySprite(this.img, this.m, r.amount < 1 ? 'nature/stump' : this.tree!);
    else if (r.kind === 'bush') applySprite(this.img, this.m, this.bush, this.bushFrame(r));
  }

  destroy() {
    this.root.destroy();
  }
}

// ---------- стоянка племени ----------

/** Ратуша стоит позади точки сдачи добычи (центра племени), чтобы люди подходили к ней спереди. */
const TOWNHALL_Y = -30;

/** Центр племени: вытоптанная поляна и ратуша с флагом цвета племени. */
export class CampSprite {
  /** Поляна лежит на земле, под всеми объектами. */
  readonly ground: Phaser.GameObjects.Sprite;
  readonly root: Phaser.GameObjects.Container;
  private readonly flag: Flag;
  private readonly name: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly base: [number, number, number];
  private key = '';
  private readonly hall: Phaser.GameObjects.Sprite;
  readonly flash = new Flash();

  constructor(scene: Scene, m: Manifest, seed: number) {
    this.ground = scene.add.existing(makeSprite(scene, m, `building/camp-${(seed % 3) + 1}`)).setDepth(DEPTH.flat);
    const hall = (this.hall = makeSprite(scene, m, 'building/townhall'));
    this.flag = new Flag(scene, m, 'building/townhall');
    this.name = label(scene, 17);
    this.name.y = -172;
    this.ring = new Graphics(scene);
    const [by, brx, bry] = baseOf(m, 'building/townhall');
    this.base = [by, brx, bry];
    this.root = scene.add.container(0, 0, [shadow(scene, brx * 0.9, bry * 0.9, 30).setY(by), this.ring, hall, ...this.flag.parts, this.name]);
  }

  update(t: TribeView, mine: boolean, selected: boolean, dt: number) {
    this.ground.setPosition(t.x, t.y);
    this.flag.update(dt, t.color);
    this.flash.update(this.hall, dt);
    this.root.setPosition(t.x, t.y + TOWNHALL_Y).setDepth(t.y + TOWNHALL_Y);
    const key = `${t.name}|${t.color}|${mine}|${t.bot}|${t.online}|${selected}`;
    if (key === this.key) return;
    this.key = key;
    this.name.setText(t.name + (mine ? ' (вы)' : t.bot ? ' 🤖' : t.online ? '' : ' 💤'));
    this.name.setColor(t.color);
    this.ring.clear();
    if (selected) ring(this.ring, ...this.base, 2.5, 0x9cff6a);
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
    this.ground.setVisible(v);
  }

  destroy() {
    this.ground.destroy();
    this.root.destroy();
  }
}
