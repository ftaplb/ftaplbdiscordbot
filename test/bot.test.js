import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ChannelType, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { defaults, DEVICE_ROLES, GUILD_ID, RANKS, REGION_ROLES, STAFF_ROLES } from '../src/config.js';
import { canUse, commands, dispatch, safeRankRole } from '../src/commands.js';
import { memberChangeAffectsBoard, movePlayer, standings } from '../src/leaderboard.js';
import { Board } from '../src/board.js';
import { Store } from '../src/store.js';
import { boardPages, cardSvg, renderPage } from '../src/render.js';
import { number, tokenize, UserError } from '../src/util.js';

function fixture(count = 0) {
  const state = defaults();
  const roles = RANKS.map((rank, i) => ({ id: `${200000000000000000n + BigInt(i)}`, name: rank.name }));
  const guild = { id: GUILD_ID, roles: { cache: new Map(roles.map(role => [role.id, role])) }, members: { cache: new Map() } };
  function member(id, rankIndex, extra = {}) {
    const result = {
      id: String(id), displayName: `Player ${id}`, guild,
      user: { username: `user${id}`, bot: false },
      roles: { cache: new Map(rankIndex === null ? [] : [[roles[rankIndex].id, roles[rankIndex]]]) },
      ...extra,
    };
    guild.members.cache.set(result.id, result);
    return result;
  }
  for (let i = 1; i <= count; i++) member(`${300000000000000000n + BigInt(i)}`, (i - 1) % RANKS.length);
  return { state, roles, guild, member };
}

function temporaryStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ftap-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new Store(directory);
}

test('the screenshot rank order is fixed and contains only its 12 ranks', () => {
  assert.deepEqual(RANKS.map(rank => rank.name), ['Fling God', 'Advanced III', 'Advanced II', 'Advanced I', 'Expert III', 'Expert II', 'Expert I', 'Skillful III', 'Skillful II', 'Skillful I', 'Apprentice', 'Casual']);
  const f = fixture();
  f.member('1', 11);
  f.member('2', 0);
  f.member('3', null);
  f.member('4', 0, { user: { bot: true, username: 'bot' } });
  assert.deepEqual(standings(f.guild, f.state).map(row => row.id), ['2', '1']);
});

test('a member with multiple rank roles appears once at their highest rank', () => {
  const f = fixture();
  const member = f.member('1', 11);
  member.roles.cache.set(f.roles[3].id, f.roles[3]);
  assert.equal(standings(f.guild, f.state).length, 1);
  assert.equal(standings(f.guild, f.state)[0].rank, 'Advanced I');
});

test('adding and removing screenshot rank roles changes the board; unrelated roles do not', () => {
  const f = fixture();
  const before = f.member('1', null);
  const after = { ...before, roles: { cache: new Map([[f.roles[6].id, f.roles[6]]]) } };
  assert.equal(memberChangeAffectsBoard(before, after, f.state), true);
  assert.equal(memberChangeAffectsBoard(after, before, f.state), true);
  const unrelated = { ...before, roles: { cache: new Map([['999', { id: '999', name: 'Random role' }]]) } };
  assert.equal(memberChangeAffectsBoard(before, unrelated, f.state), false);
  f.guild.members.cache.set('1', after);
  assert.equal(standings(f.guild, f.state).length, 1);
  f.guild.members.cache.set('1', before);
  assert.equal(standings(f.guild, f.state).length, 0);
});

test('every supplied region and device role is read from roles and updates ranked members immediately', () => {
  const f = fixture();
  const person = f.member('1', 3);
  assert.equal(standings(f.guild, f.state)[0].region, '');
  assert.equal(standings(f.guild, f.state)[0].device, '');
  for (const [key, mappings] of [['region', REGION_ROLES], ['device', DEVICE_ROLES]]) {
    for (const [label, id] of Object.entries(mappings)) {
      const before = { ...person, roles: { cache: new Map(person.roles.cache) } };
      person.roles.cache.set(id, { id, name: 'Renamed Discord role' });
      assert.equal(standings(f.guild, f.state)[0][key], label);
      assert.equal(memberChangeAffectsBoard(before, person, f.state), true);
      const withLabel = { ...person, roles: { cache: new Map(person.roles.cache) } };
      person.roles.cache.delete(id);
      assert.equal(memberChangeAffectsBoard(withLabel, person, f.state), true);
      assert.equal(standings(f.guild, f.state)[0][key], '');
    }
  }
  person.roles.cache.set(REGION_ROLES.Europe, {});
  person.roles.cache.set(REGION_ROLES.Asia, {});
  person.roles.cache.set(DEVICE_ROLES.PC, {});
  person.roles.cache.set(DEVICE_ROLES.Mobile, {});
  assert.equal(standings(f.guild, f.state)[0].region, 'Asia / Europe');
  assert.equal(standings(f.guild, f.state)[0].device, 'PC / Mobile');
  const unranked = f.member('2', null);
  const before = { ...unranked, roles: { cache: new Map() } };
  unranked.roles.cache.set(REGION_ROLES.Europe, {});
  assert.equal(memberChangeAffectsBoard(before, unranked, f.state), false);
});

test('the board renders only position, player, rank, region, and device', () => {
  const f = fixture(1);
  const person = [...f.guild.members.cache.values()][0];
  person.roles.cache.set(REGION_ROLES['North America'], {});
  person.roles.cache.set(DEVICE_ROLES.Laptop, {});
  const svg = cardSvg(standings(f.guild, f.state), f.state.settings);
  for (const label of ['#', 'Player', 'Rank', 'Region', 'Device', 'North America', 'Laptop']) assert.ok(svg.includes(`>${label}</text>`), label);
  for (const label of ['Rating', 'RD', 'Country', 'Clan']) assert.ok(!svg.includes(`>${label}</text>`), label);
});

test('exact-name matching rejects ambiguous roles and accepts explicit mappings', () => {
  const f = fixture();
  f.guild.roles.cache.set('other', { id: 'other', name: 'Casual' });
  f.member('1', 11);
  assert.equal(standings(f.guild, f.state).length, 0);
  f.state.rankRoles.Casual = f.roles[11].id;
  assert.equal(standings(f.guild, f.state).length, 1);
  f.state.rankRoles.Casual = 'deleted';
  assert.equal(standings(f.guild, f.state).length, 0);
});

test('scores and manual moves never put a lower rank above a higher rank', () => {
  const f = fixture();
  f.member('1', 3);
  f.member('2', 5);
  f.member('3', 5);
  f.state.settings.sort = 'score';
  f.state.players['2'] = { score: 9999 };
  assert.deepEqual(standings(f.guild, f.state).map(row => row.id), ['1', '2', '3']);
  assert.throws(() => movePlayer(f.state, standings(f.guild, f.state), '2', 1), UserError);
  movePlayer(f.state, standings(f.guild, f.state), '3', 2);
  assert.deepEqual(standings(f.guild, f.state).map(row => row.id), ['1', '3', '2']);
});

test('excluded and departed members disappear', () => {
  const f = fixture(3);
  const ids = [...f.guild.members.cache.keys()];
  f.state.excluded.push(ids[0]);
  f.guild.members.cache.delete(ids[1]);
  assert.deepEqual(standings(f.guild, f.state).map(row => row.id), [ids[2]]);
});

test('original staff tools and the new rank/access commands have explicit permissions', () => {
  assert.ok(commands.size >= 53);
  assert.ok([...commands.values()].filter(entry => entry.access === 'staff' && entry.name !== 'participants').length >= 47);
  assert.equal(commands.get('setchannel').access, 'manage');
  assert.equal(commands.get('help').access, 'public');
  assert.equal(commands.get('setrank').access, 'rank');
  assert.equal(commands.get('removerank').access, 'rank');
  assert.equal(commands.get('addserver').access, 'homeadmin');
  assert.equal(commands.get('addevaluator').access, 'manage');
  assert.equal(commands.get('prefix').access, 'manage');
  assert.equal(commands.get('addsetrank').access, 'manage');
});

test('Administrator does not bypass the two staff-role requirement', () => {
  const admin = { permissions: new PermissionsBitField(PermissionFlagsBits.Administrator), roles: { cache: new Map() } };
  assert.equal(canUse(admin, 'admin'), true);
  assert.equal(canUse(admin, 'staff'), false);
  for (const id of STAFF_ROLES) {
    const staff = { permissions: new PermissionsBitField(), roles: { cache: new Map([[id, {}]]) } };
    assert.equal(canUse(staff, 'staff'), true);
    assert.equal(canUse(staff, 'admin'), false);
  }
});

test('every protected command rejects an ordinary member before executing', async () => {
  const actor = { id: '123', permissions: new PermissionsBitField(), roles: { cache: new Map() } };
  let replies = 0;
  for (const entry of commands.values()) {
    if (entry.access === 'public') continue;
    const message = { author: { id: '123', bot: false }, guildId: GUILD_ID, content: `$${entry.name}`, guild: { members: { fetch: async () => actor } }, reply: async () => { replies++; } };
    await assert.rejects(dispatch(message, { cooldowns: new Map() }), /need|home-server administrator/);
  }
  assert.equal(replies, 0);
});

test('commands ignore other servers and bot-authored messages', async () => {
  await dispatch({ author: { bot: false }, guildId: 'wrong', content: '$setchannel 1' }, {});
  await dispatch({ author: { bot: true }, guildId: GUILD_ID, content: '$setchannel 1' }, {});
});

test('staff participants command validates 1–100 and survives a restart', async t => {
  const store = temporaryStore(t);
  const id = '123';
  const actor = { id, permissions: new PermissionsBitField(), roles: { cache: new Map([[STAFF_ROLES[0], {}]]) } };
  const message = { author: { id, bot: false }, guildId: GUILD_ID, content: '$participants 37', guild: { members: { fetch: async () => actor } }, reply: async () => {} };
  await dispatch(message, { store, cooldowns: new Map(), schedule() {} });
  assert.equal(new Store(store.directory).state.settings.limit, 37);
  for (const input of ['0', '101', '2.5', '-1', '10x', '']) assert.throws(() => number(input, 1, 100), UserError);
});

test('undo, redo, and ordinary backup restore preserve the selected channel', t => {
  const store = temporaryStore(t);
  store.runtime(next => { next.delivery.channelId = '123'; });
  store.change('staff', 'limit', next => { next.settings.limit = 25; });
  const backup = store.backup();
  store.runtime(next => { next.delivery.channelId = '456'; });
  store.rewind('staff', 'undo');
  assert.equal(store.state.settings.limit, 100);
  assert.equal(store.state.delivery.channelId, '456');
  store.rewind('staff', 'redo');
  assert.equal(store.state.settings.limit, 25);
  store.change('staff', 'limit', next => { next.settings.limit = 5; });
  store.restore('staff', backup);
  assert.equal(store.state.settings.limit, 25);
  assert.equal(store.state.delivery.channelId, '456');
  assert.throws(() => store.restore('staff', '../state'), UserError);
});

test('corrupt state is never silently discarded', t => {
  const store = temporaryStore(t);
  fs.writeFileSync(store.file, '{broken');
  assert.throws(() => new Store(store.directory), SyntaxError);
  assert.equal(fs.readFileSync(store.file, 'utf8'), '{broken');
});

test('privileged roles cannot be bound or assigned as game ranks', () => {
  const guild = { id: GUILD_ID };
  const role = { id: '99', position: 1, managed: false, permissions: new PermissionsBitField(PermissionFlagsBits.Administrator) };
  assert.throws(() => safeRankRole(role, guild), /staff permissions/);
  role.permissions = new PermissionsBitField();
  role.id = STAFF_ROLES[0];
  assert.throws(() => safeRankRole(role, guild), /staff or managed/);
  role.id = '99';
  assert.throws(() => safeRankRole(role, guild, { roles: { highest: { position: 1 } } }), /above/);
});

test('100 members fit in card pages and attachments stay within Discord limits', async () => {
  const f = fixture(100);
  for (const entry of f.guild.members.cache.values()) entry.displayName = '<>& " 🎮 '.repeat(10);
  f.state.settings.pageSize = 25;
  const rows = standings(f.guild, f.state);
  const pages = boardPages(rows, f.state.settings);
  assert.equal(pages.length, 4);
  assert.equal(pages.flat().length, 100);
  const payload = await renderPage(pages[0], f.state.settings, { page: 1, pages: 4, total: 100 });
  const embed = payload.embeds[0].toJSON?.() ?? payload.embeds[0];
  assert.ok(JSON.stringify(embed).length < 6000);
  assert.ok(payload.files[0].description.length <= 1024);
  assert.equal((await sharp(payload.files[0].attachment).metadata()).format, 'png');
  assert.equal(payload.allowedMentions.parse.length, 0);
  const svg = cardSvg(pages[0], f.state.settings);
  assert.ok(svg.includes('&lt;&gt;&amp;'));
  assert.ok(!svg.includes('<script'));
});

test('help shows all commands in one valid Discord embed', async t => {
  const store = temporaryStore(t);
  const actor = { id: '123' };
  let payload;
  await dispatch({ author: { id: '123', bot: false }, guildId: GUILD_ID, content: '$help', guild: { members: { fetch: async () => actor } }, reply: async value => { payload = value; } }, { store, cooldowns: new Map() });
  const embed = payload.embeds[0].toJSON?.() ?? payload.embeds[0];
  assert.ok(embed.fields.every(field => field.value.length <= 1024));
  assert.ok(JSON.stringify(embed).length < 6000);
  const help = embed.fields.map(field => field.value).join('\n');
  for (const name of commands.keys()) assert.ok(help.includes(`$${name}`));
});

function deliveryFixture(t, count = 26) {
  const f = fixture(count);
  const store = temporaryStore(t);
  const records = new Map();
  let sent = 0;
  let edited = 0;
  let failSecond = false;
  const channel = {
    id: '400000000000000000', type: ChannelType.GuildText,
    permissionsFor: () => new PermissionsBitField(PermissionFlagsBits.Administrator),
    messages: { fetch: async id => { if (!records.has(id)) throw Object.assign(new Error(), { code: 10008 }); return records.get(id); } },
    send: async payload => {
      if (failSecond && sent === 1) throw new Error('temporary API failure');
      const id = String(++sent);
      const message = { id, author: { id: 'bot' }, edit: async () => { edited++; }, delete: async () => { records.delete(id); }, payload };
      records.set(id, message);
      return message;
    },
  };
  f.guild.channels = { fetch: async () => channel };
  f.guild.members.fetchMe = async () => ({});
  const board = new Board({ user: { id: 'bot' } }, store, f.guild);
  board.membersReady = true;
  store.runtime(next => { next.delivery.channelId = channel.id; });
  return { ...f, store, board, records, channel, sent: () => sent, edited: () => edited, fail: value => { failSecond = value; } };
}

test('updates reuse existing posts, skip unchanged boards, and delete surplus pages', async t => {
  const f = deliveryFixture(t);
  await f.board.publish();
  assert.equal(f.sent(), 2);
  assert.equal(await f.board.publish(), false);
  f.store.change('staff', 'limit', next => { next.settings.limit = 10; });
  await f.board.publish();
  assert.equal(f.sent(), 2);
  assert.equal(f.edited(), 1);
  assert.equal(f.records.size, 1);
  assert.equal(f.store.state.delivery.messageIds.length, 1);
});

test('a redeployed board reloads its channel and edits the saved posts instead of duplicating them', async t => {
  const f = deliveryFixture(t);
  await f.board.publish();
  const store = new Store(f.store.directory);
  const restarted = new Board(f.board.client, store, f.guild);
  restarted.membersReady = true;
  assert.equal(store.state.delivery.channelId, f.channel.id);
  await restarted.publish(true);
  assert.equal(f.sent(), 2);
  assert.equal(f.edited(), 2);
  assert.equal(f.records.size, 2);
});

test('a failed second page retries without duplicating the successful first post', async t => {
  const f = deliveryFixture(t);
  f.fail(true);
  await assert.rejects(f.board.publish(), /temporary/);
  assert.equal(f.store.state.delivery.messageIds.length, 1);
  f.fail(false);
  await f.board.publish();
  assert.equal(f.sent(), 2);
  assert.equal(f.edited(), 1);
  assert.equal(f.records.size, 2);
});

test('paused boards hold changes, but forced refresh works', async t => {
  const f = deliveryFixture(t, 1);
  f.store.change('staff', 'pause', next => { next.settings.paused = true; });
  assert.equal(await f.board.publish(), false);
  assert.equal(f.sent(), 0);
  await f.board.publish(true);
  assert.equal(f.sent(), 1);
});

test('deleted board posts are recreated and a loading cache cannot publish', async t => {
  const f = deliveryFixture(t, 1);
  f.board.membersReady = false;
  await assert.rejects(f.board.publish(true), /loading/);
  f.board.membersReady = true;
  await f.board.publish();
  f.records.clear();
  await f.board.publish(true);
  assert.equal(f.sent(), 2);
  assert.deepEqual(f.store.state.delivery.messageIds, ['2']);
});

test('full sync removes departed members whose leave event was missed', async t => {
  const f = deliveryFixture(t, 2);
  const ids = [...f.guild.members.cache.keys()];
  f.guild.roles.fetch = async () => f.guild.roles.cache;
  f.guild.members.fetch = async () => new Map([[ids[0], f.guild.members.cache.get(ids[0])]]);
  await f.board.sync();
  assert.equal(f.board.rows().length, 1);
  assert.equal(f.guild.members.cache.has(ids[1]), false);
});

test('quoted names and multiword rank names are parsed correctly', () => {
  assert.deepEqual(tokenize('rename <@123> "a name with spaces"'), ['rename', '<@123>', 'a name with spaces']);
  assert.deepEqual(tokenize('rank <@123> Expert II'), ['rank', '<@123>', 'Expert', 'II']);
});
