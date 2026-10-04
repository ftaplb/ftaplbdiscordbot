import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { defaults, GUILD_ID, RANKS, STAFF_ROLES } from '../src/config.js';
import { canUse, commands, dispatch } from '../src/commands.js';
import { rankByName, ranksToRemove, roleMap, standings } from '../src/leaderboard.js';
import { Servers } from '../src/servers.js';
import { Coordinator } from '../src/coordinator.js';
import { UserError } from '../src/util.js';

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

test('playerprofile is public and uses local profile fields', async t => {
  const f = fixture(t);
  f.store.change(ACTOR, 'profile', next => { next.players[TARGET] = { score: 1800, rd: 110, country: 'Germany', clan: 'WN', roblox: 'sampleuser' }; });
  await f.run(`$playerprofile <@${TARGET}>`);
  const result = f.replies.at(-1).embeds[0];
  assert.ok(result.fields.some(field => field.name === 'Country' && field.value === 'Germany'));
  assert.ok(result.fields.some(field => field.name === 'Rating / RD' && field.value === '1800 / 110'));
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
