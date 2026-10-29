import type { ReactNode } from 'react';
import {
  ACTION_LABEL,
  ANIMAL_LABEL,
  BUILDING_LABEL,
  BUILDING_STATS,
  COSTS,
  LIMITS,
  WEAPONS,
  RESOURCE_LABEL,
  TIMES,
  unitLabel,
  entityType,
  marriageProblem,
  KITCHEN,
  type AnimalKind,
  type BuildingKind,
  type FamilyCandidate,
  type ResourceKind,
  type UnitAction,
  type UnitKind,
  type UnitView,
  type WeaponKind,
} from '@game/shared';
import { useStore } from '../store';
import { useGame, useTick } from './GameScreen';

const ICON: Record<string, string> = { warrior: '🗡️', woman: '👩', child: '🧒' };

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
    </div>
  );
}

function Action({
  label,
  onClick,
  disabled,
  title,
  hot,
}: {
  label: string;
  onClick: () => void;
  disabled?: string | false | null;
  title?: string;
  hot?: string;
}) {
  return (
    <button onClick={onClick} disabled={!!disabled} title={disabled || title}>
      {label}
      {hot && <kbd>{hot}</kbd>}
    </button>
  );
}

function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="panel selection">
      <div className="info">{children}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

const UNIT_TIPS: Record<UnitKind, string> = {
  warrior: 'ПКМ по зверю — охота, по дереву — рубить лес, по туше — разделать, по чужому — атака.',
  woman: 'ПКМ по кусту — собирать ягоды, по дереву — рубить, по туше — разделать.',
  child: 'Дети растут и пока не работают. Уводите их от хищников к ратуше.',
};

function UnitCard({ u }: { u: UnitView }) {
  const game = useGame();
  const partner = u.partner ? game.state.units.get(u.partner) : undefined;
  const left = Math.ceil(((100 - u.growth) / 100) * TIMES.growUp);
  return (
    <>
      <div className="title">
        <span className="avatar">{u.chief ? '👑' : ICON[u.kind]}</span>
        <div>
          <b>{u.name}</b> — {u.chief ? `Вождь · ${unitLabel(u).toLowerCase()}` : unitLabel(u)}
          <div className="muted">{ACTION_LABEL[u.action as UnitAction] ?? u.action}</div>
        </div>
      </div>
      <div className="row">
        ❤️ <Bar value={u.hp} max={u.maxHp} color={u.hp / u.maxHp > 0.5 ? '#5fd35f' : '#e04040'} /> {u.hp}/{u.maxHp}
      </div>
      {u.kind === 'child' && (
        <div className="row">
          🌱 <Bar value={u.growth} max={100} color="#7ec8ff" /> вырастет через {left} с
        </div>
      )}
      {u.kind !== 'child' && (
        <div className="row muted">
          {partner ? `💞 Семья с ${partner.name}` : '💔 Не в семье'} · {u.home ? '🛖 Есть дом' : 'Без дома'}
          {u.carry > 0 && ` · Несёт ${u.carry} ${u.carryType === 'wood' ? '🪵' : '🍖'}`}
        </div>
      )}
      <div className="tip">
        {u.kind === 'warrior' && !u.armed
          ? `Житель: рубит лес, собирает ягоды и строит. В кузнице ему можно сделать копьё (${WEAPONS.spear.wood} 🪵) или топор (${WEAPONS.axe.wood} 🪵) — станет воином.`
          : u.weapon === 'axe'
            ? 'Воин с топором: бьёт вплотную, но сильнее копейщика. ПКМ по зверю или чужому — атака, по дереву — рубить.'
            : UNIT_TIPS[u.kind as UnitKind]}
      </div>
    </>
  );
}

function UnitsPanel({ units }: { units: UnitView[] }) {
  const game = useGame();
  const adults = units.filter((u) => u.kind !== 'child');
  const tribe = game.myTribe();
  const ids = units.map((u) => u.id);
  const pairProblem =
    units.length === 2
      ? marriageProblem(units[0] as unknown as FamilyCandidate, units[1] as unknown as FamilyCandidate)
      : 'Выделите ровно двоих: мужчину и женщину';
  const wood = tribe?.wood ?? 0;
  const men = units.filter((u) => u.kind === 'warrior');
  let forge = false, kitchen = false;
  game.state.buildings.forEach((b) => {
    if (b.tribe !== game.tribeId || b.progress < 100) return;
    if (b.kind === 'forge') forge = true;
    if (b.kind === 'kitchen') kitchen = true;
  });
  const hurt = units.filter((u) => u.hp < u.maxHp);
  const build = (kind: BuildingKind, label: string, hot: string) => {
    const cost = BUILDING_STATS[kind].wood;
    return (
      <Action
        label={`${label} ${cost}🪵`}
        hot={hot}
        disabled={!adults.length ? 'Строить могут только взрослые' : wood < cost ? `Нужно ${cost} дерева` : null}
        onClick={() => game.startPlacing(kind)}
      />
    );
  };
  const craft = (weapon: WeaponKind, label: string) => {
    const who = men.filter((u) => u.weapon !== weapon);
    if (!who.length) return null;
    const cost = WEAPONS[weapon].wood;
    return (
      <Action
        label={`${label} ${cost}🪵`}
        title={weapon === 'spear' ? 'Копьё: бросает издалека, можно охотиться' : 'Топор: бьёт вплотную, но сильнее'}
        disabled={
          !forge ? 'Оружие делают только в кузнице — постройте её' : wood < cost ? `Нужно ${cost} дерева` : null
        }
        onClick={() => game.send({ type: 'craft', units: who.map((u) => u.id), weapon })}
      />
    );
  };
  const actions = (
    <>
      <Action label="✋ Стоп" hot="X" onClick={() => game.send({ type: 'stop', units: ids })} />
      {build('hut', '🛖 Хижина', 'B')}
      {build('storage', '📦 Склад', 'V')}
      {build('forge', '⚒️ Кузница', 'N')}
      {build('kitchen', '🍲 Кухня', 'K')}
      <Action
        label="🍲 Поесть"
        hot="E"
        title="Раненые идут на кухню, едят и лечатся"
        disabled={!kitchen ? 'Нет готовой кухни — постройте её' : !hurt.length ? 'Все сыты и здоровы' : null}
        onClick={() => game.send({ type: 'eat', units: hurt.map((u) => u.id) })}
      />
      {craft('spear', '🔱 Копьё')}
      {craft('axe', '🪓 Топор')}
      {units.length === 2 && (
        <Action
          label="💞 Создать семью"
          disabled={pairProblem}
          onClick={() => game.send({ type: 'marry', units: [units[0].id, units[1].id] })}
        />
      )}
    </>
  );
  if (units.length === 1) return <Shell actions={actions}>{<UnitCard u={units[0]} />}</Shell>;
  return (
    <Shell actions={actions}>
      <div className="title">
        <b>Выделено: {units.length}</b>
        <span className="muted">
          {' '}
          🗡️ {units.filter((u) => u.kind === 'warrior' && u.armed).length} · 🧑{' '}
          {units.filter((u) => u.kind !== 'child' && !(u.kind === 'warrior' && u.armed)).length} · 🧒{' '}
          {units.filter((u) => u.kind === 'child').length}
        </span>
      </div>
      <div className="chips">
        {units.slice(0, 40).map((u) => (
          <button
            key={u.id}
            className="chip"
            title={`${u.name}: ${ACTION_LABEL[u.action as UnitAction] ?? ''}`}
            onClick={() => game.select([u.id])}
          >
            {ICON[u.kind]}
            <span className="hpline" style={{ width: `${(u.hp / u.maxHp) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="tip">ПКМ — приказ всем выделенным. Ctrl+1…9 — запомнить отряд, 1…9 — выбрать.</div>
    </Shell>
  );
}

function HutPanel({ id }: { id: string }) {
  const game = useGame();
  const b = game.state.buildings.get(id)!;
  const tribe = game.myTribe();
  const own = b.tribe === game.tribeId;
  const owner = game.state.tribes.get(b.tribe);
  if (b.kind !== 'hut') return <BuildingPanel id={id} />;
  if (!own)
    return (
      <Shell>
        <div className="title">
          <span className="avatar">🛖</span>
          <div>
            <b>Хижина</b> — {owner?.name ?? 'чужая'}
            <div className="muted">Выделите воинов и кликните ПКМ, чтобы разрушить.</div>
          </div>
        </div>
        <div className="row">
          🛡️ <Bar value={b.hp} max={b.maxHp} color="#e04040" />
        </div>
      </Shell>
    );
  const built = b.progress >= 100;
  const man = game.state.units.get(b.familyMan),
    woman = game.state.units.get(b.familyWoman);
  const family = man && woman && man.partner === woman.id;
  const birthProblem = !built
    ? 'Хижина ещё строится'
    : !family
      ? 'В хижине должна жить семья'
      : b.kids >= LIMITS.kidsPerHut
        ? 'В хижине больше нет места для детей'
        : b.birth > 0 || woman?.action === 'birth'
          ? 'Уже рожает'
          : game.myUnits().length >= (tribe?.popCap ?? 0)
            ? `Нет места для людей (${tribe?.popCap ?? 0}) — постройте ещё хижину`
            : (tribe?.food ?? 0) < COSTS.birthFood
              ? `Нужно ${COSTS.birthFood} еды`
              : null;
  return (
    <Shell
      actions={
        <>
          <Action
            label={`👶 Родить ребёнка ${COSTS.birthFood}🍖`}
            disabled={birthProblem}
            onClick={() => game.send({ type: 'birth', building: id })}
          />
          {(man || woman) && (
            <Action
              label="Выделить семью"
              onClick={() => game.select([man?.id, woman?.id].filter((x): x is string => !!x))}
            />
          )}
        </>
      }
    >
      <div className="title">
        <span className="avatar">🛖</span>
        <div>
          <b>Хижина</b>
          <div className="muted">{built ? 'Построена' : `Строится: ${b.progress}%`}</div>
        </div>
      </div>
      {!built && (
        <div className="row">
          🔨 <Bar value={b.progress} max={100} color="#ffd24a" />
        </div>
      )}
      {b.birth > 0 && (
        <div className="row">
          👶 <Bar value={b.birth} max={100} color="#ff9ad5" /> роды
        </div>
      )}
      <div className="row muted">
        {man || woman
          ? `Семья: ${man?.name ?? '—'} и ${woman?.name ?? '—'}`
          : 'Пусто — выделите мужчину и женщину и ПКМ по хижине'}{' '}
        · Дети: {b.kids}/{LIMITS.kidsPerHut}
      </div>
      <div className="tip">
        {built
          ? 'Выделите мужчину и женщину и кликните ПКМ по хижине: они зайдут туда, держась за руки, и выйдут с ребёнком. Ребёнок вырастает за минуту.'
          : 'Выделите взрослых и кликните ПКМ по стройке, чтобы помочь.'}
      </div>
    </Shell>
  );
}

const BUILDING_ICON: Record<string, string> = { storage: '📦', forge: '⚒️', kitchen: '🍲' };

/** Склад, кузница и кухня: прочность или ход стройки и подсказка. */
function BuildingPanel({ id }: { id: string }) {
  const game = useGame();
  const b = game.state.buildings.get(id)!;
  const own = b.tribe === game.tribeId;
  const built = b.progress >= 100;
  const kitchen = b.kind === 'kitchen';
  const tip =
    b.kind === 'storage'
      ? `Каждый склад даёт место ещё ${LIMITS.resPerStorage} еды и ${LIMITS.resPerStorage} дерева. Добытчики несут добычу в ближайшее место: на склад или в ратушу — ставьте склады у дальнего леса.`
      : kitchen
        ? `Здоровье само не восстанавливается. Раненые (меньше ${KITCHEN.hungryAt * 100}% жизни) сами приходят сюда поесть: мест ${KITCHEN.seats}, остальные ждут в очереди. Любого раненого можно отправить сюда и самому: ПКМ по кухне или кнопка «Поесть» (E). Повар — женщина (выделите её и ПКМ по кухне): носит еду со склада и варит.`
        : `Здесь мужчины делают оружие: копьё (${WEAPONS.spear.wood} 🪵) — бросает издалека и годится для охоты, топор (${WEAPONS.axe.wood} 🪵) — бьёт вплотную, но сильнее. Выделите жителей и нажмите кнопку оружия.`;
  const cook = kitchen && b.cook ? game.state.units.get(b.cook) : undefined;
  let eating = 0;
  if (kitchen) game.state.units.forEach((u) => u.tribe === b.tribe && u.action === 'eat' && eating++);
  return (
    <Shell>
      <div className="title">
        <span className="avatar">{BUILDING_ICON[b.kind] ?? '🏠'}</span>
        <div>
          <b>{BUILDING_LABEL[b.kind as BuildingKind]}</b>
          {own ? '' : ` — ${game.state.tribes.get(b.tribe)?.name ?? 'чужой'}`}
          <div className="muted">
            {!own
              ? 'Выделите воинов и кликните ПКМ, чтобы разрушить.'
              : built
                ? b.kind === 'storage' ? 'Построен' : 'Построена'
                : `Строится: ${b.progress}%`}
          </div>
        </div>
      </div>
      <div className="row">
        {built ? '🛡️' : '🔨'}{' '}
        <Bar value={built ? b.hp : b.progress} max={built ? b.maxHp : 100} color={built ? '#e04040' : '#ffd24a'} />
      </div>
      {own && kitchen && built && (
        <>
          <div className="row">
            🍲 <Bar value={b.meals} max={KITCHEN.mealMax} color="#e0a040" /> {b.meals}/{KITCHEN.mealMax} порций
          </div>
          <div className="row muted">
            {cook ? `👩‍🍳 Повар: ${cook.name}` : '👩‍🍳 Нет повара — выделите женщину и ПКМ по кухне'} · Едят и ждут: {eating}
          </div>
        </>
      )}
      {own && <div className="tip">{built ? tip : 'Выделите взрослых и кликните ПКМ по стройке, чтобы помочь.'}</div>}
    </Shell>
  );
}

function CampfirePanel({ id }: { id: string }) {
  const game = useGame();
  const t = game.state.tribes.get(id)!;
  const own = id === game.tribeId;
  let pop = 0;
  game.state.units.forEach((u) => {
    if (u.tribe === id) pop++;
  });
  return (
    <Shell
      actions={
        own && (
          <>
            <Action
              label="🗡️ Все воины к ратуше"
              onClick={() => {
                const ids = game
                  .myUnits()
                  .filter((u) => u.kind === 'warrior' && u.armed)
                  .map((u) => u.id);
                if (ids.length) game.send({ type: 'move', units: ids, x: t.x, y: t.y + 40 });
              }}
            />
          </>
        )
      }
    >
      <div className="title">
        <span className="avatar">🏛️</span>
        <div>
          <b>{own ? 'Ратуша племени' : `Ратуша: ${t.name}`}</b>
          <div className="muted">
            👥 {pop}/{t.popCap} · родилось {t.born} · добыто зверей {t.kills}
          </div>
        </div>
      </div>
      {own && (
        <div className="tip">
          Сюда и на склады носят добычу. Хищники не подходят к ратуше: здесь люди в безопасности. Лечатся раненые только едой на кухне.
          Граница племени — {t.border} шагов от ратуши; каждая хижина раздвигает её и даёт место ещё {LIMITS.popPerHut}{' '}
          людям.
        </div>
      )}
    </Shell>
  );
}

function InfoPanel({ id }: { id: string }) {
  const game = useGame();
  const s = game.state;
  const type = entityType(id);
  if (type === 'animal') {
    const a = s.animals.get(id)!;
    const danger =
      a.kind === 'wolf' || a.kind === 'tiger'
        ? 'Хищник! Нападает на людей.'
        : a.kind === 'mammoth'
          ? 'Опасен, если разозлить. Охотьтесь отрядом воинов.'
          : 'Быстро убегает.';
    return (
      <Shell>
        <div className="title">
          <span className="avatar">{{ deer: '🦌', mammoth: '🦣', wolf: '🐺', tiger: '🐅' }[a.kind]}</span>
          <div>
            <b>{ANIMAL_LABEL[a.kind as AnimalKind]}</b>
            <div className="muted">{danger}</div>
          </div>
        </div>
        <div className="row">
          ❤️ <Bar value={a.hp} max={a.maxHp} color="#e04040" /> {a.hp}/{a.maxHp}
        </div>
        <div className="tip">Выделите воинов и кликните ПКМ по зверю, чтобы охотиться.</div>
      </Shell>
    );
  }
  if (type === 'resource') {
    const r = s.resources.get(id)!;
    return (
      <Shell>
        <div className="title">
          <span className="avatar">{{ tree: '🌲', bush: '🫐', carcass: '🍖' }[r.kind]}</span>
          <div>
            <b>{RESOURCE_LABEL[r.kind as ResourceKind]}</b>
            <div className="muted">
              Осталось: {r.amount} {r.kind === 'tree' ? '🪵' : '🍖'}
            </div>
          </div>
        </div>
        <div className="tip">
          {r.kind === 'bush'
            ? 'Ягоды собирают женщины и жители — понемногу за раз. Куст не отрастает.'
            : r.kind === 'tree'
              ? 'Дерево рубят воины и женщины.'
              : 'Туша скоро испортится — разделайте её быстрее.'}
        </div>
      </Shell>
    );
  }
  const u = s.units.get(id);
  if (u) {
    const t = s.tribes.get(u.tribe);
    return (
      <Shell>
        <div className="title">
          <span className="avatar">{ICON[u.kind]}</span>
          <div>
            <b>{u.name}</b> — {unitLabel(u)} ({t?.name ?? 'чужие'})
          </div>
        </div>
        <div className="row">
          ❤️ <Bar value={u.hp} max={u.maxHp} color="#e04040" />
        </div>
      </Shell>
    );
  }
  return null;
}

export function SelectionPanel() {
  useTick();
  const game = useGame();
  const selection = useStore((s) => s.selection);
  const s = game.state;
  if (!selection.length)
    return (
      <Shell>
        <div className="tip big">
          Выделите людей: клик или рамка левой кнопкой мыши. Приказ — правая кнопка: по кусту, дереву, зверю, хижине или
          земле. Двойной клик — все такие же на экране.
        </div>
      </Shell>
    );
  const first = selection[0];
  switch (entityType(first)) {
    case 'unit': {
      const units = selection.map((id) => s.units.get(id)).filter((u): u is UnitView => !!u);
      const own = units.filter((u) => u.tribe === game.tribeId);
      if (!own.length) return <InfoPanel id={first} />;
      return <UnitsPanel units={own} />;
    }
    case 'building':
      return s.buildings.has(first) ? <HutPanel id={first} /> : null;
    case 'tribe':
      return s.tribes.has(first) ? <CampfirePanel id={first} /> : null;
    default:
      return <InfoPanel id={first} />;
  }
}
