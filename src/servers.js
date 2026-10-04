import fs from 'node:fs';
import path from 'node:path';
import { GUILD_ID } from './config.js';
import { Store } from './store.js';
import { requireThat, snowflake } from './util.js';

export class Servers {
  constructor(directory) {
    this.directory = path.resolve(directory);
    fs.mkdirSync(this.directory, { recursive: true });
    this.file = path.join(this.directory, 'servers.json');
    this.stores = new Map();
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { version: 1, enabled: [GUILD_ID] };
    requireThat(this.state.version === 1 && Array.isArray(this.state.enabled), 'Invalid server registry. Restore servers.json from a volume backup.');
    this.migrate();
    this.save();
  }

  migrate() {
    const legacy = path.join(this.directory, 'state.json');
    const destination = path.join(this.directory, 'servers', GUILD_ID);
    if (!fs.existsSync(legacy) || fs.existsSync(path.join(destination, 'state.json'))) return;
    // Copy the old database and backups; leave the originals available for recovery.
    fs.mkdirSync(path.join(destination, 'backups'), { recursive: true });
    const oldBackups = path.join(this.directory, 'backups');
    if (fs.existsSync(oldBackups)) for (const name of fs.readdirSync(oldBackups)) {
      if (/^\d+\.json$/.test(name)) fs.copyFileSync(path.join(oldBackups, name), path.join(destination, 'backups', name));
    }
    fs.copyFileSync(legacy, path.join(destination, 'state.json'));
  }

  save() {
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(`${this.file}.tmp`, this.file);
  }

  enabled(id) { return this.state.enabled.includes(id); }

  store(id) {
    snowflake(id);
    if (!this.stores.has(id)) this.stores.set(id, new Store(path.join(this.directory, 'servers', id), id));
    return this.stores.get(id);
  }

  enable(id) {
    snowflake(id);
    const store = this.store(id);
    if (!this.enabled(id)) { this.state.enabled.push(id); this.save(); }
    return store;
  }

  disable(id) {
    requireThat(id !== GUILD_ID, 'The home server cannot be disabled.');
    this.state.enabled = this.state.enabled.filter(item => item !== id);
    this.save();
  }
}
