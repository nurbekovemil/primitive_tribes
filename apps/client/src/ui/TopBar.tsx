import type { UnitView } from '@game/shared';
import { useGame, useTick } from './GameScreen';

export function TopBar() {
  useTick();
  const game = useGame();
  const tribe = game.myTribe();
  if (!tribe) return null;
  const units = game.myUnits();
  const count = (k: string) => units.filter((u) => u.kind === k).length;
  const isWarrior = (u: UnitView) => u.kind === 'warrior' && u.trained;
  const isCitizen = (u: UnitView) => u.kind !== 'child' && !isWarrior(u);
  const idle = units.filter((u) => u.kind !== 'child' && u.action === 'idle');
  let huts = 0;
  game.state.buildings.forEach((b) => {
    if (b.tribe === tribe.id && b.kind === 'hut' && b.progress >= 100) huts++;
  });

  return (
    <div className="panel topbar">
      <div className="tribe">
        <span className="dot" style={{ background: tribe.color }} />
        {tribe.name}
      </div>
      <div className={`res${tribe.food >= tribe.resCap ? ' full' : ''}`} title="Еда — кормить племя и рожать детей. Склады увеличивают запас.">
        🍖 <b>{tribe.food}</b>/{tribe.resCap}
      </div>
      <div className={`res${tribe.wood >= tribe.resCap ? ' full' : ''}`} title="Дерево — на постройки и оружие. Склады увеличивают запас.">
        🪵 <b>{tribe.wood}</b>/{tribe.resCap}
      </div>
      <div className="res" title="Готовые хижины: каждая раздвигает границу племени и даёт место 4 людям">
        🛖 <b>{huts}</b>
      </div>
      <div className={`res${units.length >= tribe.popCap ? ' full' : ''}`} title="Население и сколько людей может жить в племени. Больше места — больше хижин.">
        👥 <b>{units.length}</b>/{tribe.popCap}
      </div>
      <div className="sep" />
      <button title="Выделить всех воинов (обученных на площадке для тренировок)" onClick={() => game.selectGroup(isWarrior)}>
        🗡️ Воины {units.filter(isWarrior).length}
      </button>
      <button title="Выделить всех жителей: женщин и мужчин без оружия" onClick={() => game.selectGroup(isCitizen)}>
        🧑 Жители {units.filter(isCitizen).length}
      </button>
      <button title="Дети не работают, они растут" onClick={() => game.selectGroup((u) => u.kind === 'child')}>
        🧒 Дети {count('child')}
      </button>
      <button
        className={idle.length ? 'attention' : ''}
        title="Выделить взрослых, которые ничего не делают"
        onClick={() => {
          game.select(idle.map((u) => u.id));
          if (idle[0]) game.centerOn(idle[0].x, idle[0].y);
        }}
      >
        💤 Без дела {idle.length}
      </button>
      <button title="Камера к ратуше (Пробел)" onClick={() => game.centerHome()}>
        🏛️ К ратуше
      </button>
    </div>
  );
}
