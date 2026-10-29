import { Room, type Client } from '@colyseus/core';
import type { JoinOptions, ServerMessages } from '@game/shared';
import type { WorldState } from '../state/schema';
import { World } from '../game/World';
import { parseCommand } from '../game/commands';

type PlayerClient = Client<{ userData: { tribeId: string; token: string; chatAt: number; ready: boolean } }>;

const TICK_MS = 50;

/** Одна общая комната = один мир, в котором живут все племена. */
export class WorldRoom extends Room<{ state: WorldState; client: PlayerClient }> {
  maxClients = 64;
  autoDispose = false;
  patchRate = TICK_MS;

  private world!: World;
  private fxBuffer: ServerMessages['fx'] = [];
  /** Сообщения племени, пока его клиент ещё не готов их принять. */
  private pending = new Map<string, ServerMessages['log'][]>();

  onCreate() {
    this.world = new World({
      log: (tribeId, text, tone) => this.sendToTribe(tribeId, 'log', { text, tone }),
      fx: (id, spear) => this.fxBuffer.push(spear ? { id, spear } : { id }),
      chat: (text) => this.broadcastChat(null, null, text),
      tribeGone: (tribe, reason) => {
        this.sendToTribe(tribe.id, 'dead', { name: tribe.name });
        this.broadcastChat(null, null, `${tribe.name} ${reason === 'left' ? 'покинуло мир' : 'вымерло'}.`);
      },
    });
    this.setState(this.world.state);

    this.setSimulationInterval((dtMs) => {
      this.world.tick(Math.min(dtMs, 200) / 1000);
      if (this.fxBuffer.length) {
        this.broadcast('fx', this.fxBuffer);
        this.fxBuffer = [];
      }
    }, TICK_MS);

    this.onMessage('cmd', (client: PlayerClient, raw: unknown) => {
      const cmd = parseCommand(raw);
      const tribeId = client.userData?.tribeId;
      if (cmd && tribeId) this.world.command(tribeId, cmd);
    });

    // клиент сообщает, что подписался на сообщения — теперь можно присылать ему данные
    this.onMessage('hello', (client: PlayerClient) => {
      const ud = client.userData;
      if (!ud || ud.ready) return;
      ud.ready = true;
      client.send('you', { tribeId: ud.tribeId, token: ud.token } satisfies ServerMessages['you']);
      for (const log of this.pending.get(ud.tribeId) ?? []) client.send('log', log);
      this.pending.delete(ud.tribeId);
    });

    this.onMessage('chat', (client: PlayerClient, raw: unknown) => {
      const ud = client.userData;
      if (!ud || typeof raw !== 'string') return;
      const now = Date.now();
      if (now - ud.chatAt < 800) return;
      ud.chatAt = now;
      const text = raw.trim().slice(0, 140);
      const tribe = this.state.tribes.get(ud.tribeId);
      if (text && tribe) this.broadcastChat(tribe.name, tribe.color, text);
    });
  }

  onJoin(client: PlayerClient, options: JoinOptions = {}) {
    let tribe = typeof options.token === 'string' ? this.world.findTribeByToken(options.token) : undefined;
    let token = options.token ?? '';
    if (!tribe && options.token && !options.name) throw new Error('NO_TRIBE');
    if (!tribe) {
      let name = String(options.name ?? '').replace(/[<>]/g, '').trim().slice(0, 20) || 'Безымянные';
      if (!/племя/i.test(name)) name = `Племя ${name}`;
      const created = this.world.createTribe(name, false);
      tribe = created.tribe;
      token = created.token;
      this.broadcastChat(null, null, `${tribe.name} появилось в мире!`);
    } else {
      this.world.log(tribe.id, 'С возвращением, вождь!', 'good');
    }
    tribe.online = true;
    this.world.tribes.get(tribe.id)!.offlineT = 0;
    client.userData = { tribeId: tribe.id, token, chatAt: 0, ready: false };
  }

  onLeave(client: PlayerClient) {
    const tribeId = client.userData?.tribeId;
    if (!tribeId) return;
    const stillHere = this.clients.some((c) => c !== client && c.userData?.tribeId === tribeId);
    const tribe = this.state.tribes.get(tribeId);
    if (tribe && !stillHere) tribe.online = false;
  }

  private sendToTribe<K extends keyof ServerMessages>(tribeId: string, type: K, payload: ServerMessages[K]) {
    let sent = false;
    for (const c of this.clients)
      if (c.userData?.tribeId === tribeId && c.userData.ready) {
        c.send(type, payload);
        sent = true;
      }
    if (!sent && type === 'log') {
      const list = this.pending.get(tribeId) ?? [];
      list.push(payload as ServerMessages['log']);
      if (list.length > 20) list.shift();
      this.pending.set(tribeId, list);
    }
  }

  private broadcastChat(name: string | null, color: string | null, text: string) {
    this.broadcast('chat', { name, color, text } satisfies ServerMessages['chat']);
  }
}
