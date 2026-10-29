import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { BuildingKind } from '@game/shared';
import type { Session } from '../net/connection';
import { Game } from '../game/Game';
import { useStore } from '../store';
import { TopBar } from './TopBar';
import { SelectionPanel } from './SelectionPanel';
import { Minimap } from './Minimap';
import { EventLog } from './EventLog';
import { Help } from './Help';

const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const g = useContext(GameContext);
  if (!g) throw new Error('useGame вне игры');
  return g;
}

/** Перерисовывать компонент вместе с тиком интерфейса (5 раз в секунду). */
export function useTick() {
  return useStore((s) => s.frame);
}

function Hint() {
  const hint = useStore((s) => s.hint);
  if (!hint) return null;
  return (
    <div className="hint" style={{ left: hint.x + 16, top: hint.y + 18 }}>
      {hint.text}
    </div>
  );
}

const PLACE_NAME: Record<BuildingKind, string> = { hut: 'хижины', storage: 'склада', forge: 'кузницы', kitchen: 'кухни', training: 'площадки для тренировок' };

function PlacingBanner() {
  const placing = useStore((s) => s.placing);
  if (!placing) return null;
  return <div className="placing">Выберите место для {PLACE_NAME[placing]}: ЛКМ — построить, Shift — несколько, ПКМ или Esc — отмена</div>;
}

export function GameScreen({ session }: { session: Session }) {
  const host = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: Game | null = null;
    void Game.create(host.current!, session).then((g) => {
      if (cancelled) return g.destroy();
      created = g;
      setGame(g);
    });
    return () => {
      cancelled = true;
      created?.destroy();
    };
  }, [session]);

  return (
    <div className="game">
      <div ref={host} className="canvas-host" />
      {game && (
        <GameContext.Provider value={game}>
          <TopBar />
          <SelectionPanel />
          <Minimap />
          <EventLog />
          <Help />
          <PlacingBanner />
          <Hint />
        </GameContext.Provider>
      )}
    </div>
  );
}
