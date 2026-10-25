import fs from 'node:fs';
import path from 'node:path';
import { defaults, GUILD_ID } from './config.js';
import { requireThat } from './util.js';
import { validateBackup } from './backup.js';

const legacyEditable = ['settings', 'players', 'order', 'excluded', 'rankRoles'];
const editable = [...legacyEditable, 'customRanks', 'regionRoles', 'deviceRoles'];
export const snapshot = state => Object.fromEntries(editable.map(key => [key, structuredClone(state[key])]));
const restoredData = data => Object.fromEntries(editable.filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])]));

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
    this.ensureBackup();
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
    Object.assign(next, restoredData(entry.data));
    this.record(next, actor, `${direction}: ${entry.action}`);
    this.save(next);
    return entry.action;
  }

  backupData() {
    return { version: 2, guildId: this.state.guildId, createdAt: new Date().toISOString(), data: snapshot(this.state),
      configuration: { prefix: this.state.prefix, access: structuredClone(this.state.access), delivery: structuredClone(this.state.delivery) } };
  }

  ensureBackup() {
    const newest = Number(this.backups()[0] ?? 0);
    if (Date.now() - newest >= 24 * 60 * 60 * 1000) this.backup();
  }

  backup() {
    const id = `${Math.max(Date.now(), Number(this.backups()[0] ?? 0) + 1)}`;
    fs.writeFileSync(path.join(this.directory, 'backups', `${id}.json`), JSON.stringify(this.backupData(), null, 2), { mode: 0o600 });
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
    requireThat([1, 2].includes(saved.version) && saved.data && legacyEditable.every(key => Object.hasOwn(saved.data, key)), 'That backup is invalid.');
    this.change(actor, `restore ${id}`, next => Object.assign(next, restoredData(saved.data)));
  }

  readBackup(id) {
    requireThat(/^\d+$/.test(id ?? '') && this.backups().includes(id), 'Use a backup ID from $backups.');
    return JSON.parse(fs.readFileSync(path.join(this.directory, 'backups', `${id}.json`), 'utf8'));
  }

  restoreConfiguration(actor, payload) {
    let compatible = payload;
    if (payload?.version === 1) {
      requireThat(payload.data && legacyEditable.every(key => Object.hasOwn(payload.data, key)), 'That legacy backup is invalid.');
      requireThat(!payload.guildId || payload.guildId === this.state.guildId, 'That backup belongs to a different server.');
      // Legacy downloads contain board data only. Preserve all current configuration.
      compatible = this.backupData();
      for (const key of legacyEditable) compatible.data[key] = structuredClone(payload.data[key]);
    }
    const saved = validateBackup(compatible, this.state.guildId);
    const previous = this.backup();
    const next = { ...structuredClone(this.state), ...saved.data, ...saved.configuration, undo: [], redo: [] };
    next.delivery.fingerprint = null;
    this.record(next, actor, 'restore full configuration');
    this.save(next);
    return previous;
  }
}
