import { Board } from './board.js';
import { errorLabel, requireThat, UserError } from './util.js';

export class Coordinator {
  constructor(client, servers, report = console.error) {
    this.client = client;
    this.servers = servers;
    this.report = report;
    this.boards = new Map();
    this.queues = new Map();
    this.timers = new Map();
    this.cooldowns = new Map();
    this.stopping = false;
  }

  enqueue(id, task) {
    const result = (this.queues.get(id) || Promise.resolve()).then(task);
    this.queues.set(id, result.catch(() => {}));
    return result;
  }

  failure(id, error) {
    const board = this.boards.get(id);
    if (board) board.lastError = error instanceof UserError ? error.message : errorLabel(error);
    this.report(`Server ${id}: ${error instanceof UserError ? error.message : errorLabel(error)}`);
  }

  async start(id) {
    const guild = this.client.guilds.cache.get(id);
    requireThat(guild, 'Invite the bot to that server first, then run $addserver <id> again.');
    const store = this.servers.store(id);
    const board = this.boards.get(id) || new Board(this.client, store, guild);
    this.boards.set(id, board);
    this.timers.set(id, this.timers.get(id) || {});
    try {
      await board.sync();
      if (!store.state.settings.paused) await board.publish(true);
      return board;
    } finally { this.periodic(id); }
  }

  async enable(id) {
    requireThat(this.client.guilds.cache.has(id), 'Invite the bot to that server first, then run $addserver <id> again.');
    requireThat(!this.servers.enabled(id), 'That server is already enabled.');
    this.servers.enable(id);
    try { return await this.enqueue(id, () => this.start(id)); }
    catch (error) { this.servers.disable(id); this.stopServer(id); throw error; }
  }

  disable(id) {
    this.servers.disable(id);
    this.stopServer(id);
  }

  stopServer(id) {
    const timers = this.timers.get(id);
    clearTimeout(timers?.update);
    clearTimeout(timers?.sync);
    this.timers.delete(id);
    this.boards.delete(id);
  }

  schedule(id) {
    if (this.stopping || !this.servers.enabled(id) || !this.boards.has(id)) return;
    const timers = this.timers.get(id) || {};
    clearTimeout(timers.update);
    timers.update = setTimeout(() => this.enqueue(id, async () => {
      if (this.servers.enabled(id)) await this.boards.get(id)?.publish();
    }).catch(error => this.failure(id, error)), 3000);
    this.timers.set(id, timers);
  }

  periodic(id) {
    if (this.stopping || !this.servers.enabled(id) || !this.boards.has(id)) return;
    const timers = this.timers.get(id) || {};
    clearTimeout(timers.sync);
    timers.sync = setTimeout(async () => {
      try {
        await this.enqueue(id, async () => {
          const board = this.boards.get(id);
          if (!this.servers.enabled(id) || !board) return;
          await board.sync();
          await board.publish();
        });
      } catch (error) { this.failure(id, error); }
      this.periodic(id);
    }, this.servers.store(id).state.settings.interval * 60000);
    this.timers.set(id, timers);
  }

  services(id) {
    return {
      client: this.client, servers: this.servers, coordinator: this,
      store: this.servers.store(id), board: this.boards.get(id),
      schedule: () => this.schedule(id), cooldowns: this.cooldowns,
    };
  }

  async close() {
    this.stopping = true;
    for (const id of this.timers.keys()) this.stopServer(id);
    await Promise.allSettled(this.queues.values());
  }
}
