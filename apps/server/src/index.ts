import { defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Encoder } from '@colyseus/schema';
import { ROOM_NAME, SERVER_PORT } from '@game/shared';
import { WorldRoom } from './rooms/WorldRoom';

// мир с лесами у каждой ратуши не помещается в стандартные 8 КБ при первой отправке
Encoder.BUFFER_SIZE = 256 * 1024;

const port = Number(process.env.GAME_PORT) || SERVER_PORT;

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    [ROOM_NAME]: defineRoom(WorldRoom),
  },
});

await server.listen(port);
console.log(`Сервер мира запущен: ws://localhost:${port}`);
