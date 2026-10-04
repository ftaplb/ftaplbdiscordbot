import fs from 'node:fs';
import path from 'node:path';
import { defaults, GUILD_ID } from './config.js';
import { requireThat } from './util.js';

const editable = ['settings', 'players', 'order', 'excluded', 'rankRoles'];
export const snapshot = state => Object.fromEntries(editable.map(key => [key, structuredClone(state[key])]));

export class Store {
  constructor(directory, guildId = GUILD_ID) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'state.json');
    fs.mkdirSync(this.directory, { recursive: true });
    const initial = defaults(guildId);
    const saved = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : initial;
    requireThat(saved.version === 1 && saved.settings && saved.delivery, 'Unsupported state file. Keep a copy and restore a valid backup.');
    this.state = { ...initial, ...saved, settings: { ...initial.settings, ...saved.settings }, access: { ...initial.access, ...saved.access } };
    requireThat(!saved.guildId || saved.guildId === guildId, 'This state file belongs to a different server.');
    fs.mkdirSync(path.join(this.directory, 'backups'), { recursive: true });
    this.save(this.state);
  }

  save(next) {
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    this.state = next;
  }

  change(actor, action, edit) {
    const next = structuredClone(this.state);
    const before = snapshot(next);
    edit(next);
    next.undo.push({ action, data: before });
    next.undo = next.undo.slice(-50);
    next.redo = [];
    this.record(next, actor, action);
    this.save(next);
  }

  record(next, actor, action) {
    next.history.push({ at: new Date().toISOString(), actor, action });
    next.history = next.history.slice(-200);
  }

  runtime(edit) {
    const next = structuredClone(this.state);
    edit(next);
    this.save(next);
  }

  rewind(actor, direction) {
    const next = structuredClone(this.state);
    const from = direction === 'undo' ? next.undo : next.redo;
    const to = direction === 'undo' ? next.redo : next.undo;
    requireThat(from.length, `Nothing to ${direction}.`);
    const entry = from.pop();
    to.push({ action: entry.action, data: snapshot(next) });
    Object.assign(next, entry.data);
    this.record(next, actor, `${direction}: ${entry.action}`);
    this.save(next);
    return entry.action;
  }

  backup() {
    const id = `${Date.now()}`;
    fs.writeFileSync(path.join(this.directory, 'backups', `${id}.json`), JSON.stringify({ version: 1, data: snapshot(this.state) }, null, 2), { mode: 0o600 });
    // Keep the newest 30 local snapshots; exported downloads are independent.
    for (const old of this.backups().slice(30)) fs.unlinkSync(path.join(this.directory, 'backups', `${old}.json`));
    return id;
  }

  backups() {
    return fs.readdirSync(path.join(this.directory, 'backups')).filter(name => /^\d+\.json$/.test(name)).map(name => name.slice(0, -5)).sort().reverse();
  }

  restore(actor, id) {
    requireThat(/^\d+$/.test(id ?? '') && this.backups().includes(id), 'Use a backup ID from $backups.');
    const saved = JSON.parse(fs.readFileSync(path.join(this.directory, 'backups', `${id}.json`), 'utf8'));
    requireThat(saved.version === 1 && editable.every(key => Object.hasOwn(saved.data, key)), 'That backup is invalid.');
    this.change(actor, `restore ${id}`, next => Object.assign(next, Object.fromEntries(editable.map(key => [key, saved.data[key]]))));
  }
}
