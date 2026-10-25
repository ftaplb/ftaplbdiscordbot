import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { defaults, DEVICE_ROLES, GUILD_ID, RANKS, REGION_ROLES, STAFF_ROLES } from '../src/config.js';
import { canUse, commands, dispatch } from '../src/commands.js';
import { rankByName, ranksToRemove, roleMap, standings } from '../src/leaderboard.js';
import { Servers } from '../src/servers.js';
import { Coordinator } from '../src/coordinator.js';
import { UserError } from '../src/util.js';
import { Store } from '../src/store.js';
import { readBackupAttachment, validateBackup } from '../src/backup.js';
import { storageInfo } from '../src/storage.js';

const SECOND_SERVER = '600000000000000000';
const ACTOR = '700000000000000000';
const TARGET = '800000000000000000';

function fixture(t, guildId = GUILD_ID) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ftap-servers-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const servers = new Servers(directory);
  if (guildId !== GUILD_ID) servers.enable(guildId);
  const store = servers.store(guildId);
  const roleCache = new Map(RANKS.map((rank, i) => {
    const id = String(900000000000000000n + BigInt(i));
    return [id, { id, name: rank.name, permissions: new PermissionsBitField(), managed: false, position: i + 1 }];
  }));
  const guild = { id: guildId, name: 'Test server', ownerId: '999999999999999999', roles: { cache: roleCache, fetch: async id => id ? roleCache.get(id) : roleCache } };
  const actor = { id: ACTOR, displayName: 'Evaluator', guild, permissions: new PermissionsBitField(), roles: { cache: new Map() }, user: { bot: false } };
  const unrelated = { id: '910000000000000000', name: 'Friends' };
  const target = {
    id: TARGET, displayName: 'Player', guild, manageable: true,
    permissions: new PermissionsBitField(),
    user: { bot: false, username: 'player' },
    roles: {
      cache: new Map([[unrelated.id, unrelated]]),
      add: async id => { assert.equal(typeof id, 'string'); target.roles.cache.set(id, roleCache.get(id)); },
      remove: async id => { assert.equal(typeof id, 'string', 'Remove must use individual DELETEs, not a full member PATCH'); target.roles.cache.delete(id); },
    },
  };
  guild.members = {
    cache: new Map([[ACTOR, actor], [TARGET, target]]),
    fetch: async options => guild.members.cache.get(typeof options === 'string' ? options : options.user),
    fetchMe: async () => ({ permissions: new PermissionsBitField(PermissionFlagsBits.ManageRoles), roles: { highest: { position: 100 } } }),
  };
  const board = { rows: () => standings(guild, store.state), membersReady: true };
  const services = { servers, store, board, schedule() {}, cooldowns: new Map(), client: { guilds: { cache: new Map([[guildId, guild]]) } } };
  const replies = [];
  async function run(content, author = actor) {
    const message = { author: { id: author.id, bot: false }, guildId, guild, content, reply: async payload => { replies.push(payload); return payload; } };
    return dispatch(message, { ...services, cooldowns: new Map() });
  }
  return { directory, servers, store, guild, actor, target, services, replies, run, unrelated };
}

test('all 12 ranks accept their requested aliases, numbers, and Roman numerals', () => {
  const examples = {
    fg: 'Fling God', 'fling god': 'Fling God',
    adv1: 'Advanced I', adv2: 'Advanced II', adv3: 'Advanced III',
    e1: 'Expert I', e2: 'Expert II', e3: 'Expert III',
    sk1: 'Skillful I', sk2: 'Skillful II', sk3: 'Skillful III',
    app: 'Apprentice', cas: 'Casual',
    'skillful 1': 'Skillful I', 'EXPERT 2': 'Expert II', 'advanced 3': 'Advanced III',
    'Skillful III': 'Skillful III', 'skillfull 1': 'Skillful I',
  };
  for (const [input, expected] of Object.entries(examples)) assert.equal(rankByName(input).name, expected, input);
  for (const invalid of ['Administrator', 'staff', 'e4', 'sk0', 'adv4', 'Random Role']) assert.throws(() => rankByName(invalid), UserError);
});

test('removerank supports an exact alias, a whole family, and all ranks', () => {
  assert.deepEqual(ranksToRemove('skillful').map(rank => rank.name), ['Skillful III', 'Skillful II', 'Skillful I']);
  assert.deepEqual(ranksToRemove('sk').map(rank => rank.name), ['Skillful III', 'Skillful II', 'Skillful I']);
  assert.deepEqual(ranksToRemove('e1').map(rank => rank.name), ['Expert I']);
  assert.equal(ranksToRemove('').length, 12);
  assert.throws(() => ranksToRemove('admin'), UserError);
});

test('automatic role lookup accepts rank aliases but never fuzzy-matches unrelated roles', t => {
  const f = fixture(t);
  const expert = [...f.guild.roles.cache.values()].find(role => role.name === 'Expert I');
  expert.name = 'e1';
  assert.equal(roleMap(f.guild, f.store.state).get('Expert I').id, expert.id);
  expert.name = 'expertt 1';
  assert.equal(roleMap(f.guild, f.store.state).get('Expert I'), null);
});

test('evaluators get exactly setrank and removerank among protected commands', t => {
  const f = fixture(t);
  f.store.runtime(next => { next.access.evaluators.push(ACTOR); });
  const allowed = [...commands.values()].filter(command => command.access !== 'public' && canUse(f.actor, command.access, f.store.state, GUILD_ID)).map(command => command.name);
  assert.deepEqual(allowed.sort(), ['removerank', 'setrank']);
});

test('editors cannot change settings, access lists, profiles, or arbitrary roles', async t => {
  const f = fixture(t);
  f.store.runtime(next => { next.access.editors.push(ACTOR); });
  for (const name of ['prefix', 'addserver', 'addeditor', 'addevaluator', 'rankrole', 'staffrole', 'restore', 'country', 'score', 'add']) {
    await assert.rejects(f.run(`$${name}`), /need|home-server/);
  }
  await assert.rejects(f.run(`$setrank <@${TARGET}> Administrator`), /Unknown rank/);
  assert.deepEqual([...f.target.roles.cache.keys()], [f.unrelated.id]);
});

test('an evaluator can assign every allowed rank and replace only game roles', async t => {
  const f = fixture(t);
  f.store.runtime(next => { next.access.evaluators.push(ACTOR); });
  for (const alias of ['fg', 'adv3', 'adv2', 'adv1', 'e3', 'e2', 'e1', 'sk3', 'sk2', 'sk1', 'app', 'cas']) {
    await f.run(`$setrank <@${TARGET}> ${alias}`);
    assert.ok(f.target.roles.cache.has(f.unrelated.id));
    const rankIds = [...roleMap(f.guild, f.store.state).values()].filter(role => role && f.target.roles.cache.has(role.id));
    assert.equal(rankIds.length, 1);
    assert.equal(rankIds[0].name, rankByName(alias).name);
  }
});

test('family removal preserves other game tiers and unrelated roles', async t => {
  const f = fixture(t);
  f.store.runtime(next => { next.access.evaluators.push(ACTOR); });
  for (const role of f.guild.roles.cache.values()) if (role.name.startsWith('Skillful') || role.name === 'Expert I') f.target.roles.cache.set(role.id, role);
  await f.run(`$removerank <@${TARGET}> skillful`);
  assert.deepEqual([...f.target.roles.cache.values()].map(role => role.name).sort(), ['Expert I', 'Friends']);
  await f.run(`$removerank <@${TARGET}>`);
  assert.deepEqual([...f.target.roles.cache.keys()], [f.unrelated.id]);
});

test('a rank mapped to a privileged or configured staff role cannot be assigned or removed', async t => {
  const f = fixture(t);
  f.store.runtime(next => { next.access.evaluators.push(ACTOR); });
  const role = [...f.guild.roles.cache.values()].find(role => role.name === 'Casual');
  role.permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
  await assert.rejects(f.run(`$setrank <@${TARGET}> cas`), /staff permissions/);
  f.target.roles.cache.set(role.id, role);
  await assert.rejects(f.run(`$removerank <@${TARGET}> cas`), /staff permissions/);
  assert.ok(f.target.roles.cache.has(role.id));
  role.permissions = new PermissionsBitField();
  f.store.runtime(next => { next.access.staffRoles.push(role.id); });
  await assert.rejects(f.run(`$setrank <@${TARGET}> cas`), /staff or managed/);
});

test('administrator can add and revoke evaluators with immediate effect', async t => {
  const f = fixture(t);
  f.actor.permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
  await f.run(`$addevaluator <@${TARGET}>`);
  assert.ok(canUse(f.target, 'rank', f.store.state));
  await f.run(`$removeevaluator ${TARGET}`);
  assert.equal(canUse(f.target, 'rank', f.store.state), false);
  f.actor.permissions = new PermissionsBitField();
  await assert.rejects(f.run(`$addevaluator <@${TARGET}>`), /Administrator/);
});

test('a custom prefix persists, changes help, and ignores the old prefix', async t => {
  const f = fixture(t);
  f.actor.permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
  await f.run('$prefix ft!');
  assert.equal(f.store.state.prefix, 'ft!');
  assert.equal(new Servers(f.directory).store(GUILD_ID).state.prefix, 'ft!');
  const count = f.replies.length;
  await f.run('$help');
  assert.equal(f.replies.length, count);
  await f.run('ft!help setrank');
  assert.ok(JSON.stringify(f.replies.at(-1)).includes('ft!setrank'));
  assert.ok(!JSON.stringify(f.replies.at(-1)).includes('$setrank'));
  await assert.rejects(f.run('ft!prefix "bad prefix"'), /1–8/);
  await f.run('ft!prefix $$');
  assert.ok(f.replies.at(-1).content.includes('$$help'));
  await f.run('$$help setrank');
  assert.ok(JSON.stringify(f.replies.at(-1)).includes('$$setrank'));
});

test('only the home-server administrator can enable other servers', async t => {
  const f = fixture(t, SECOND_SERVER);
  f.actor.permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
  assert.equal(canUse(f.actor, 'homeadmin', f.store.state, SECOND_SERVER), false);
  await assert.rejects(f.run('$addserver 650000000000000000'), /home-server/);
  assert.equal(canUse(f.actor, 'homeadmin', f.store.state, GUILD_ID), true);
});

test('a newly enabled server uses local staff roles, not the original server IDs', async t => {
  const f = fixture(t, SECOND_SERVER);
  f.actor.roles.cache.set(STAFF_ROLES[0], {});
  assert.equal(canUse(f.actor, 'staff', f.store.state), false);
  f.actor.permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
  const role = { id: '920000000000000000', name: 'Local staff', managed: false };
  f.guild.roles.cache.set(role.id, role);
  await f.run(`$staffrole ${role.id}`);
  f.actor.roles.cache.set(role.id, role);
  assert.equal(canUse(f.actor, 'staff', f.store.state), true);
  const game = [...f.guild.roles.cache.values()].find(candidate => candidate.name === 'Casual');
  await assert.rejects(f.run(`$staffrole ${game.id}`), /game rank/);
});

test('channels, prefixes, editor lists, stats, and backup history are isolated per server', t => {
  const f = fixture(t);
  const second = f.servers.enable(SECOND_SERVER);
  f.store.runtime(next => { next.prefix = '!'; next.access.editors.push(ACTOR); next.delivery.channelId = '111'; });
  f.store.change(ACTOR, 'rating', next => { next.players[TARGET] = { score: 2000 }; });
  assert.equal(second.state.prefix, '$');
  assert.equal(second.state.access.editors.length, 0);
  assert.equal(second.state.delivery.channelId, null);
  assert.equal(second.state.players[TARGET], undefined);
  assert.equal(second.state.undo.length, 0);
  f.servers.disable(SECOND_SERVER);
  assert.equal(new Servers(f.directory).enabled(SECOND_SERVER), false);
  f.servers.enable(SECOND_SERVER);
  assert.equal(f.servers.store(SECOND_SERVER).state.prefix, '$');
  assert.throws(() => f.servers.disable(GUILD_ID), /home server/);
});

test('old Railway state and backups migrate without losing the board or custom order', t => {
  const f = fixture(t);
  const legacy = defaults();
  delete legacy.access;
  delete legacy.prefix;
  delete legacy.guildId;
  legacy.settings.pageSize = 15;
  legacy.order = [TARGET];
  legacy.players[TARGET] = { name: 'Old name', score: 1500 };
  legacy.delivery.channelId = '950000000000000000';
  legacy.delivery.messageIds = ['960000000000000000'];
  const separate = path.join(f.directory, 'legacy');
  fs.mkdirSync(path.join(separate, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(separate, 'state.json'), JSON.stringify(legacy));
  fs.writeFileSync(path.join(separate, 'backups', '123.json'), '{"version":1}');
  const registry = new Servers(separate);
  const migrated = registry.store(GUILD_ID);
  assert.equal(migrated.state.players[TARGET].name, 'Old name');
  assert.deepEqual(migrated.state.order, [TARGET]);
  assert.equal(migrated.state.delivery.channelId, legacy.delivery.channelId);
  assert.deepEqual(migrated.state.delivery.messageIds, legacy.delivery.messageIds);
  assert.deepEqual(migrated.state.access.staffRoles, STAFF_ROLES);
  assert.equal(migrated.state.prefix, '$');
  assert.ok(fs.existsSync(path.join(migrated.directory, 'backups', '123.json')));
  assert.ok(fs.existsSync(path.join(separate, 'state.json')));
});

test('undo and backups cannot replace administrator-controlled access lists or prefixes', t => {
  const f = fixture(t);
  f.store.change(ACTOR, 'limit', next => { next.settings.limit = 10; });
  const backup = f.store.backup();
  f.store.runtime(next => { next.prefix = '!'; next.access.evaluators.push(TARGET); });
  f.store.rewind(ACTOR, 'undo');
  assert.equal(f.store.state.prefix, '!');
  assert.deepEqual(f.store.state.access.evaluators, [TARGET]);
  const file = path.join(f.store.directory, 'backups', `${backup}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.data.access = { editors: [ACTOR], staffRoles: [] };
  data.data.prefix = '?';
  fs.writeFileSync(file, JSON.stringify(data));
  f.store.restore(ACTOR, backup);
  assert.equal(f.store.state.prefix, '!');
  assert.deepEqual(f.store.state.access.evaluators, [TARGET]);
  assert.deepEqual(f.store.state.access.editors, []);
});

test('playerprofile is public and follows region/device roles instead of legacy columns', async t => {
  const f = fixture(t);
  f.store.change(ACTOR, 'profile', next => { next.players[TARGET] = { score: 1800, rd: 110, country: 'Germany', clan: 'WN', roblox: 'sampleuser' }; });
  f.target.roles.cache.set(REGION_ROLES.Europe, {});
  f.target.roles.cache.set(DEVICE_ROLES.PC, {});
  await f.run(`$playerprofile <@${TARGET}>`);
  const result = f.replies.at(-1).embeds[0];
  assert.ok(result.fields.some(field => field.name === 'Region' && field.value === 'Europe'));
  assert.ok(result.fields.some(field => field.name === 'Device' && field.value === 'PC'));
  assert.ok(!result.fields.some(field => ['Country', 'Clan', 'Rating / RD'].includes(field.name)));
});

test('per-server queues do not let one slow server block another', async t => {
  const f = fixture(t);
  const coordinator = new Coordinator({ guilds: { cache: new Map() } }, f.servers);
  let release;
  const first = coordinator.enqueue(GUILD_ID, () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  assert.equal(await coordinator.enqueue(SECOND_SERVER, () => 42), 42);
  release();
  await first;
  await coordinator.close();
});

test('enabling a server requires an actual bot membership; failed sync rolls authorization back', async t => {
  const f = fixture(t);
  const client = { guilds: { cache: new Map() } };
  const coordinator = new Coordinator(client, f.servers, () => {});
  await assert.rejects(coordinator.enable(SECOND_SERVER), /Invite/);
  assert.equal(f.servers.enabled(SECOND_SERVER), false);
  client.guilds.cache.set(SECOND_SERVER, { id: SECOND_SERVER, roles: { fetch: async () => { throw new Error('no members intent'); } }, members: { cache: new Map() } });
  await assert.rejects(coordinator.enable(SECOND_SERVER), /no members intent/);
  assert.equal(f.servers.enabled(SECOND_SERVER), false);
  assert.equal(coordinator.boards.has(SECOND_SERVER), false);
  await coordinator.close();
});

test('home-server addserver starts an independent board and enables local public commands', async t => {
  const f = fixture(t);
  f.actor.permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
  const secondGuild = {
    id: SECOND_SERVER, name: 'Second server',
    roles: { cache: new Map(), fetch: async () => new Map() },
    members: { cache: new Map(), fetch: async () => new Map() },
  };
  const client = { guilds: { cache: new Map([[GUILD_ID, f.guild], [SECOND_SERVER, secondGuild]]) } };
  const coordinator = new Coordinator(client, f.servers, () => {});
  const message = { author: { id: ACTOR, bot: false }, guildId: GUILD_ID, guild: f.guild, content: `$addserver ${SECOND_SERVER}`, reply: async () => {} };
  await dispatch(message, { ...f.services, client, coordinator });
  assert.equal(f.servers.enabled(SECOND_SERVER), true);
  assert.equal(coordinator.boards.get(SECOND_SERVER).guild.id, SECOND_SERVER);
  assert.equal(coordinator.boards.get(SECOND_SERVER).membersReady, true);
  const services = coordinator.services(SECOND_SERVER);
  secondGuild.members.fetch = async () => ({ id: ACTOR });
  let answered = false;
  await dispatch({ author: { id: ACTOR, bot: false }, guildId: SECOND_SERVER, guild: secondGuild, content: '$help', reply: async () => { answered = true; } }, services);
  assert.equal(answered, true);
  coordinator.disable(SECOND_SERVER);
  assert.equal(coordinator.boards.has(SECOND_SERVER), false);
  await coordinator.close();
});

test('staff members can delegate and revoke access using the new syntax, with restart persistence', async t => {
  const f = fixture(t);
  f.actor.roles.cache.set(STAFF_ROLES[0], {});
  await f.run(`$staff add <@${TARGET}>`);
  assert.equal(canUse(f.target, 'staff', f.store.state), true);
  assert.equal(canUse(f.target, 'manage', f.store.state), true);
  assert.deepEqual(new Servers(f.directory).store(GUILD_ID).state.access.staff, [TARGET]);
  for (const [singular, plural] of [['editor', 'editors'], ['evaluator', 'evaluators']]) {
    await f.run(`$${singular} add <@${ACTOR}>`, f.target);
    assert.deepEqual(f.store.state.access[plural], [ACTOR]);
    await f.run(`$${plural}`, f.target);
    assert.ok(f.replies.at(-1).embeds[0].description.includes(ACTOR));
    assert.deepEqual(f.replies.at(-1).allowedMentions.parse, []);
    await f.run(`$${singular} remove <@${ACTOR}>`, f.target);
    assert.deepEqual(f.store.state.access[plural], []);
  }
  const role = { id: '920000000000000000', name: 'Board staff', managed: false };
  f.guild.roles.cache.set(role.id, role);
  await f.run(`$staffrole add <@&${role.id}>`, f.target);
  assert.ok(f.store.state.access.staffRoles.includes(role.id));
  await f.run('$staffroles', f.target);
  assert.ok(f.replies.at(-1).embeds[0].description.includes(role.id));
  await f.run(`$staffrole remove <@&${role.id}>`, f.target);
  assert.ok(!f.store.state.access.staffRoles.includes(role.id));
  await f.run('$staff', f.target);
  assert.ok(f.replies.at(-1).embeds[0].description.includes(TARGET));
  await f.run(`$staff remove <@${TARGET}>`);
  assert.equal(canUse(f.target, 'staff', f.store.state), false);
  await assert.rejects(f.run(`$editor add <@${ACTOR}>`, f.target), /staff access/);
});

test('staff can approve custom ranks; evaluators assign them but cannot edit the allowlist', async t => {
  const f = fixture(t);
  const role = { id: '930000000000000000', name: 'Legend', hexColor: '#aabbcc', managed: false, permissions: new PermissionsBitField(), position: 5 };
  f.guild.roles.cache.set(role.id, role);
  f.actor.roles.cache.set(STAFF_ROLES[0], {});
  await f.run(`$addsetrank <@&${role.id}>`);
  await f.run(`$addsetrank <@&${role.id}>`).then(() => assert.fail('duplicate accepted'), error => assert.match(error.message, /already/));
  f.actor.roles.cache.clear();
  f.store.runtime(next => { next.access.evaluators.push(ACTOR); });
  await assert.rejects(f.run(`$addsetrank <@&${role.id}>`), /staff access/);
  for (const value of ['Legend', `<@&${role.id}>`, role.id]) {
    await f.run(`$setrank <@${TARGET}> ${value}`);
    assert.ok(f.target.roles.cache.has(role.id));
    assert.ok(f.target.roles.cache.has(f.unrelated.id));
    assert.equal(standings(f.guild, f.store.state)[0].rank, 'Legend');
  }
  assert.deepEqual(new Servers(f.directory).store(GUILD_ID).state.customRanks, f.store.state.customRanks);
  await f.run(`$setrank <@${TARGET}> cas`);
  assert.ok(!f.target.roles.cache.has(role.id));
  await f.run(`$setrank <@${TARGET}> Legend`);
  await f.run(`$removerank <@${TARGET}> Legend`);
  assert.ok(!f.target.roles.cache.has(role.id));
  await f.run(`$setrank <@${TARGET}> Legend`);
  await f.run(`$removerank <@${TARGET}>`);
  assert.deepEqual([...f.target.roles.cache.keys()], [f.unrelated.id]);
  f.actor.roles.cache.set(STAFF_ROLES[0], {});
  await f.run(`$removesetrank <@&${role.id}>`);
  await assert.rejects(f.run(`$setrank <@${TARGET}> Legend`), /Unknown rank/);
});

test('approving a built-in alias binds its tier and rank approval rejects unsafe roles', async t => {
  const f = fixture(t);
  f.actor.permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
  const role = { id: '930000000000000000', name: 'sk1', permissions: new PermissionsBitField(), managed: false, position: 2 };
  f.guild.roles.cache.set(role.id, role);
  await f.run(`$addsetrank <@&${role.id}>`);
  assert.equal(f.store.state.rankRoles['Skillful I'], role.id);
  assert.equal(f.store.state.customRanks.length, 0);
  const privileged = { ...role, id: '930000000000000001', name: 'Powerful', permissions: new PermissionsBitField(PermissionFlagsBits.ManageRoles) };
  f.guild.roles.cache.set(privileged.id, privileged);
  await assert.rejects(f.run(`$addsetrank <@&${privileged.id}>`), /staff permissions/);
  privileged.permissions = new PermissionsBitField();
  privileged.managed = true;
  await assert.rejects(f.run(`$addsetrank <@&${privileged.id}>`), /staff or managed/);
  privileged.managed = false;
  privileged.position = 100;
  await assert.rejects(f.run(`$addsetrank <@&${privileged.id}>`), /above/);
  privileged.position = 2;
  f.store.runtime(next => { next.access.staffRoles.push(privileged.id); });
  await assert.rejects(f.run(`$addsetrank <@&${privileged.id}>`), /staff or managed/);
});

test('region and device mappings can change without a deploy and stay isolated per server', async t => {
  const f = fixture(t);
  f.actor.roles.cache.set(STAFF_ROLES[0], {});
  const role = { id: '930000000000000000', name: 'Region!', managed: false };
  const device = { ...role, id: '930000000000000001', name: 'Device!' };
  f.guild.roles.cache.set(role.id, role);
  f.guild.roles.cache.set(device.id, device);
  await f.run(`$regionrole North America <@&${role.id}>`);
  await f.run(`$devicerole PC <@&${device.id}>`);
  const reloaded = new Servers(f.directory).store(GUILD_ID).state;
  assert.equal(reloaded.regionRoles['North America'], role.id);
  assert.equal(reloaded.deviceRoles.PC, device.id);
  const second = f.servers.enable(SECOND_SERVER);
  assert.deepEqual(second.state.regionRoles, {});
  assert.deepEqual(second.state.deviceRoles, {});
  await assert.rejects(f.run(`$regionrole Europe <@&${role.id}>`), /already mapped/);
  await f.run('$regionrole North America off');
  await f.run('$devicerole PC off');
  assert.equal(f.store.state.regionRoles['North America'], undefined);
  assert.equal(f.store.state.deviceRoles.PC, undefined);
});

test('complete recovery restores channels, message IDs, access, mappings, and players after a fresh deployment', t => {
  const f = fixture(t);
  f.store.runtime(next => {
    next.prefix = '!'; next.access.staff = [ACTOR]; next.access.editors = [TARGET];
    next.delivery.channelId = '940000000000000000'; next.delivery.messageIds = ['950000000000000000'];
    next.settings.logChannelId = '960000000000000000'; next.settings.limit = 42;
    next.players[TARGET] = { name: 'Saved player', score: 1234 };
    next.customRanks = [{ name: 'Legend', roleId: '930000000000000000', color: '#aabbcc' }];
    next.regionRoles.Europe = '930000000000000001';
  });
  const id = f.store.backup();
  const exported = f.store.readBackup(id);
  assert.equal(exported.version, 2);
  const fresh = new Store(path.join(f.directory, 'fresh'));
  const previous = fresh.restoreConfiguration(ACTOR, exported);
  assert.ok(fresh.backups().includes(previous));
  const reloaded = new Store(fresh.directory).state;
  assert.equal(reloaded.prefix, '!');
  assert.deepEqual(reloaded.access, f.store.state.access);
  assert.equal(reloaded.delivery.channelId, f.store.state.delivery.channelId);
  assert.deepEqual(reloaded.delivery.messageIds, f.store.state.delivery.messageIds);
  assert.equal(reloaded.delivery.fingerprint, null);
  assert.equal(reloaded.settings.logChannelId, f.store.state.settings.logChannelId);
  assert.equal(reloaded.settings.limit, 42);
  assert.deepEqual(reloaded.players, f.store.state.players);
  assert.deepEqual(reloaded.customRanks, f.store.state.customRanks);
  assert.deepEqual(reloaded.regionRoles, f.store.state.regionRoles);
  assert.deepEqual(reloaded.undo, []);
  assert.throws(() => fresh.restoreConfiguration(ACTOR, { ...exported, guildId: SECOND_SERVER }), /different server/);
  const malformed = structuredClone(exported);
  malformed.data.settings.pageSize = 0;
  assert.throws(() => fresh.restoreConfiguration(ACTOR, malformed), /Invalid backup/);
  assert.equal(new Store(fresh.directory).state.settings.pageSize, 25);
  assert.equal(fresh.readBackup(previous).configuration.prefix, '$');
});

test('complete backups reject malformed and privilege-conflicting data before saving', t => {
  const f = fixture(t);
  for (const edit of [
    backup => { backup.data.customRanks.push({ name: 'fg', roleId: TARGET, color: '#aabbcc' }); },
    backup => { backup.configuration.access.staff = ['not-an-id']; },
    backup => { backup.data.settings.thumbnail = 'file:///etc/passwd'; },
    backup => { backup.configuration.delivery.messageIds = 'wrong'; },
    backup => { backup.data.rankRoles.Casual = STAFF_ROLES[0]; },
    backup => { backup.data.regionRoles.Unlisted = TARGET; },
  ]) {
    const backup = f.store.backupData();
    edit(backup);
    assert.throws(() => validateBackup(backup, GUILD_ID), /Invalid backup/);
  }
});

test('legacy downloaded backups restore board data while keeping current channels, access, and new mappings', t => {
  const f = fixture(t);
  const legacy = { version: 1, data: Object.fromEntries(['settings', 'players', 'order', 'excluded', 'rankRoles'].map(key => [key, structuredClone(f.store.state[key])])) };
  legacy.data.settings.limit = 13;
  legacy.data.players[TARGET] = { score: 1777 };
  legacy.data.access = { staff: [TARGET] };
  legacy.data.prefix = '?';
  f.store.runtime(next => { next.delivery.channelId = '940000000000000000'; next.access.staff = [ACTOR]; next.prefix = '!'; });
  f.store.restoreConfiguration(ACTOR, legacy);
  assert.equal(f.store.state.settings.limit, 13);
  assert.equal(f.store.state.players[TARGET].score, 1777);
  assert.equal(f.store.state.delivery.channelId, '940000000000000000');
  assert.deepEqual(f.store.state.access.staff, [ACTOR]);
  assert.equal(f.store.state.prefix, '!');
  assert.deepEqual(f.store.state.regionRoles, REGION_ROLES);
});

test('backup attachment import restricts downloads and validates size and JSON', async () => {
  const attachment = { name: 'backup.json', size: 100, url: 'https://cdn.discordapp.com/attachments/1/2/backup.json?signature=value' };
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.equal(url.hostname, 'cdn.discordapp.com');
    return new Response('{"version":2}');
  };
  assert.deepEqual(await readBackupAttachment(attachment, fetcher), { version: 2 });
  for (const url of ['http://cdn.discordapp.com/attachments/a', 'https://example.com/attachments/a', 'https://cdn.discordapp.com/other', 'https://user:password@cdn.discordapp.com/attachments/a']) {
    await assert.rejects(readBackupAttachment({ ...attachment, url }, () => assert.fail('must not fetch')), /Discord JSON/);
  }
  await assert.rejects(readBackupAttachment({ ...attachment, size: 6000000 }, fetcher), /5 MB/);
  await assert.rejects(readBackupAttachment(attachment, async () => new Response('bad')), /valid JSON/);
  await assert.rejects(readBackupAttachment(attachment, async () => new Response('x'.repeat(5 * 1024 * 1024 + 1))), /5 MB/);
});

test('importbackup restores downloaded configuration through the staff command', async t => {
  const f = fixture(t);
  f.actor.permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
  const backup = f.store.backupData();
  backup.configuration.prefix = '!';
  backup.configuration.access.staff = [ACTOR];
  backup.data.settings.limit = 17;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(backup));
  t.after(() => { globalThis.fetch = previousFetch; });
  const message = { author: { id: ACTOR, bot: false }, guildId: GUILD_ID, guild: f.guild, content: '$importbackup',
    attachments: { first: () => ({ name: 'backup.json', size: 1000, url: 'https://cdn.discordapp.com/attachments/1/2/backup.json' }) },
    reply: async payload => f.replies.push(payload) };
  await dispatch(message, f.services);
  assert.equal(f.store.state.prefix, '!');
  assert.equal(f.store.state.settings.limit, 17);
  assert.deepEqual(f.store.state.access.staff, [ACTOR]);
  assert.ok(f.replies.at(-1).content.includes('!help'));
  assert.equal(canUse(f.actor, 'staff', f.store.state), true);
});

test('Railway volume detection uses the persistent path and warns about overrides outside it', () => {
  const mount = path.resolve('volume');
  assert.equal(storageInfo({ RAILWAY_VOLUME_MOUNT_PATH: mount }).directory, mount);
  assert.equal(storageInfo({ RAILWAY_VOLUME_MOUNT_PATH: mount }).persistent, true);
  assert.equal(storageInfo({ RAILWAY_VOLUME_MOUNT_PATH: mount, DATA_DIR: path.join(mount, 'bot') }).persistent, true);
  const outside = storageInfo({ RAILWAY_VOLUME_MOUNT_PATH: mount, DATA_DIR: path.resolve('elsewhere'), RAILWAY_ENVIRONMENT_ID: 'production' });
  assert.equal(outside.persistent, false);
  assert.match(outside.warning, /NOT configured/);
  assert.equal(storageInfo({}).directory, path.resolve('data'));
  assert.ok(storageInfo({ RAILWAY_ENVIRONMENT_ID: 'production' }).warning);
});
