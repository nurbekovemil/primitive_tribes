import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Room } from '@colyseus/sdk';
import type { ServerMessages, WorldView } from '@game/shared';
import { connect, forgetTribe, hasSavedTribe, type Session } from './net/connection';
import { store } from './store';
import { Lobby } from './ui/Lobby';
import { GameScreen } from './ui/GameScreen';
import { ArtGallery } from './ui/ArtGallery';

function listen(room: Room<any, WorldView>, onDead: (name: string) => void, onLost: () => void) {
  room.onMessage('log', (m: ServerMessages['log']) => store.addLog({ text: m.text, tone: m.tone }));
  room.onMessage('chat', (m: ServerMessages['chat']) =>
    store.addLog(m.name ? { text: m.text, tone: 'chat', name: m.name, color: m.color ?? undefined } : { text: m.text, tone: 'system' }),
  );
  room.onMessage('dead', (m: ServerMessages['dead']) => onDead(m.name));
  room.onLeave(() => onLost());
}

interface Callbacks {
  onDead: (name: string) => void;
  onLost: (room: Room<any, WorldView>) => void;
}

/** Подключиться к миру, не трогая состояние React: результат применяет вызывающий. */
async function tryConnect(name: string | null, cb: Callbacks): Promise<{ session: Session } | { error: string }> {
  try {
    const session = await connect(name, (room) => listen(room, cb.onDead, () => cb.onLost(room)));
    return { session };
  } catch (e) {
    if (name === null) {
      forgetTribe();
      return { error: '' };
    }
    return { error: `Не удалось подключиться к серверу. Запущен ли он? (${(e as Error).message ?? e})` };
  }
}

export function App() {
  if (location.search.includes('art')) return <ArtGallery />;
  return <Main />;
}

function Main() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState(() => (hasSavedTribe() ? 'Возвращаемся к своему племени…' : ''));
  const [busy, setBusy] = useState(hasSavedTribe);

  const callbacks = useMemo<Callbacks>(
    () => ({
      onDead: (dead) => {
        forgetTribe();
        setSession(null);
        setStatus(`${dead} вымерло… Основать новое племя?`);
      },
      onLost: (room) => {
        setSession((cur) => (cur && cur.room === room ? null : cur));
        setStatus((cur) => cur || 'Соединение с сервером потеряно.');
      },
    }),
    [],
  );

  const apply = useCallback((result: { session: Session } | { error: string }) => {
    setBusy(false);
    if ('session' in result) {
      store.set({ selection: [] });
      setStatus('');
      setSession(result.session);
    } else setStatus(result.error);
  }, []);

  const join = (name: string) => {
    setBusy(true);
    setStatus('Подключение…');
    store.set({ logs: [] });
    void tryConnect(name, callbacks).then(apply);
  };

  // вернуться к своему племени после перезагрузки страницы
  useEffect(() => {
    if (hasSavedTribe()) void tryConnect(null, callbacks).then(apply);
  }, [callbacks, apply]);

  if (!session) return <Lobby status={status} busy={busy} onPlay={join} />;
  return <GameScreen session={session} />;
}

