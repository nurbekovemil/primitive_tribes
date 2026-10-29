import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, SERVER_PORT, type JoinOptions, type ServerMessages, type WorldView } from '@game/shared';

const TOKEN_KEY = 'tribeToken';

export interface Session {
  room: Room<any, WorldView>;
  tribeId: string;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function hasSavedTribe() {
  return !!readToken();
}

export function forgetTribe() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* хранилище недоступно — не страшно */
  }
}

/**
 * Подключиться к миру. Без имени — пытаемся вернуться к своему племени по токену.
 * Обработчики сообщений регистрирует вызывающий код в onReady до того, как сервер начнёт их присылать.
 */
export async function connect(name: string | null, onReady: (room: Room<any, WorldView>) => void): Promise<Session> {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const client = new Client(`${proto}://${location.hostname}:${SERVER_PORT}`);
  const options: JoinOptions = name === null ? { token: readToken() ?? undefined } : { name };
  const room = (await client.joinOrCreate(ROOM_NAME, options)) as Room<any, WorldView>;

  const you = new Promise<ServerMessages['you']>((resolve) => room.onMessage('you', resolve));
  onReady(room);
  room.send('hello');
  const me = await you;
  try {
    localStorage.setItem(TOKEN_KEY, me.token);
  } catch {
    /* без сохранения просто не получится вернуться к племени после перезагрузки */
  }
  return { room, tribeId: me.tribeId };
}
