import { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { GUILD_ID, PREFIX, RANKS, STAFF_ROLES } from './config.js';
import { memberRank, movePlayer, rankByName, roleMap } from './leaderboard.js';
import { chunks, number, plain, requireThat, snowflake, text, tokenize, UserError } from './util.js';

export const commands = new Map();
function command(name, category, usage, description, run, access = 'staff') {
  commands.set(name, { name, category, usage, description, run, access });
}

export function canUse(member, access) {
  if (access === 'public') return true;
  if (access === 'admin') return member.permissions.has(PermissionFlagsBits.Administrator);
  return STAFF_ROLES.some(id => member.roles.cache.has(id));
}

async function reply(message, content) {
  const payload = typeof content === 'string' ? { content } : content;
  return message.reply({ ...payload, allowedMentions: { parse: [], repliedUser: false } });
}

async function list(ctx, title, lines) {
  for (const group of chunks(lines.length ? lines : ['Nothing here yet.'], 20)) {
    await reply(ctx.message, { embeds: [new EmbedBuilder().setColor(ctx.store.state.settings.color).setTitle(title).setDescription(group.join('\n').slice(0, 4000))] });
  }
}

async function member(ctx, value) {
  const result = await ctx.guild.members.fetch({ user: snowflake(value), force: true }).catch(() => null);
  requireThat(result && !result.user.bot, 'That member must be a person in this server.');
  return result;
}

function playerChange(ctx, target, action, edit) {
  ctx.store.change(ctx.actor.id, `${action} ${target.id}`, next => {
    next.players[target.id] ??= {};
    edit(next.players[target.id], next);
  });
  ctx.schedule();
}

function setting(ctx, key, value) {
  ctx.store.change(ctx.actor.id, `${key}: ${value ?? 'off'}`, next => { next.settings[key] = value; });
  ctx.schedule();
}

const unsafePermissions = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.MentionEveryone,
];

export function safeRankRole(role, guild, me) {
  requireThat(role && role.id !== guild.id && !role.managed && !STAFF_ROLES.includes(role.id), 'Choose an ordinary rank role, not a staff or managed role.');
  requireThat(!unsafePermissions.some(permission => role.permissions.has(permission, false)), 'Rank roles must not grant staff permissions.');
  if (me) requireThat(role.position < me.roles.highest.position, 'Move my bot role above all 12 rank roles.');
}

async function setRank(ctx, target, rank) {
  const me = await ctx.guild.members.fetchMe();
  requireThat(me.permissions.has(PermissionFlagsBits.ManageRoles), 'I need Manage Roles to change ranks.');
  requireThat(target.manageable && target.id !== ctx.guild.ownerId, 'That member is above my role or owns the server.');
  const roles = roleMap(ctx.guild, ctx.store.state);
  const destination = roles.get(rank.name);
  safeRankRole(destination, ctx.guild, me);
  const old = [...roles.values()].filter(role => role && role.id !== destination.id && target.roles.cache.has(role.id));
  for (const role of old) safeRankRole(role, ctx.guild, me);
  // Add first, then remove lower/higher rank roles. The highest role determines the board.
  await target.roles.add(destination.id, `FTAP rank set by ${ctx.actor.id}`);
  if (old.length) {
    try { await target.roles.remove(old.map(role => role.id), `FTAP rank set by ${ctx.actor.id}`); }
    catch {
      ctx.schedule();
      throw new UserError('The new role was added, but an old rank role could not be removed. Check my role permissions and try again.');
    }
  }
  ctx.store.runtime(next => ctx.store.record(next, ctx.actor.id, `rank ${target.id}: ${rank.name}`));
  ctx.schedule();
}

const rowLine = row => `**${row.position}.** ${plain(row.name).slice(0, 60)} · ${row.rank}${row.roblox ? ` · ${plain(row.roblox)}` : ''}`;

command('help', 'Start here', '[command or category]', 'Show every command, or help for one command.', async ctx => {
  const query = ctx.args.join(' ').toLowerCase();
  const entry = commands.get(query.replace(/^\$/, ''));
  if (entry) {
    await list(ctx, `$${entry.name}`, [entry.description, `Usage: \`$${entry.name}${entry.usage ? ` ${entry.usage}` : ''}\``, `Access: ${entry.access === 'staff' ? 'One of the two staff roles' : entry.access === 'admin' ? 'Administrator permission' : 'Everyone'}`]);
    return;
  }
  const categories = [...new Set([...commands.values()].map(item => item.category))];
  requireThat(!query || categories.some(name => name.toLowerCase() === query), 'Use $help or $help <command>.');
  const selected = [...commands.values()].filter(item => !query || item.category.toLowerCase() === query);
  const embed = new EmbedBuilder().setColor(ctx.store.state.settings.color).setTitle('FTAP commands')
    .setDescription('Use `$help command` for details and examples.\n**Everyone:** $help · **Administrator:** $setchannel\n**Staff:** $participants and all 50 commands below.');
  for (const category of categories) {
    const entries = selected.filter(item => item.category === category);
    if (entries.length) embed.addFields({ name: category, value: entries.map(item => `\`$${item.name}${item.usage ? ` ${item.usage}` : ''}\``).join('\n') });
  }
  await reply(ctx.message, { embeds: [embed] });
}, 'public');

command('setchannel', 'Start here', '<channel ID>', 'Choose the channel for the live leaderboard.', async ctx => {
  const id = snowflake(ctx.args[0]);
  await ctx.board.setChannel(id, ctx.actor.id);
  await reply(ctx.message, `Leaderboard channel set to <#${id}>.`);
}, 'admin');

command('participants', 'Start here', '<1–100>', 'Set the maximum number of players displayed.', async ctx => {
  const limit = number(ctx.args[0], 1, 100, 'Participants');
  setting(ctx, 'limit', limit);
  await reply(ctx.message, `Showing up to ${limit} participants.`);
});

command('leaderboard', 'Board', '', 'Link to the live leaderboard.', async ctx => {
  const { channelId, messageIds } = ctx.store.state.delivery;
  requireThat(channelId && messageIds.length, 'An administrator needs to run $setchannel <id> first.');
  await reply(ctx.message, `https://discord.com/channels/${GUILD_ID}/${channelId}/${messageIds[0]}`);
});
command('refresh', 'Board', '', 'Rebuild the live board now, including while paused.', async ctx => {
  requireThat(ctx.store.state.delivery.channelId, 'Set a leaderboard channel first.');
  await ctx.board.publish(true);
  await reply(ctx.message, 'Leaderboard updated.');
});
command('preview', 'Board', '[page]', 'Show a preview here without changing the live board.', async ctx => {
  await reply(ctx.message, await ctx.board.preview(ctx.args[0] ? number(ctx.args[0], 1, 10, 'Page') : 1));
});
command('status', 'Board', '', 'Show connection, update, and participant status.', async ctx => {
  const state = ctx.store.state;
  await list(ctx, 'Bot status', [
    `Gateway: ${Math.max(0, Math.round(ctx.client.ws.ping))} ms`,
    `Updates: ${state.settings.paused ? 'paused' : 'active'}`,
    `Ranked members: ${ctx.board.rows().length} · Display limit: ${state.settings.limit}`,
    `Last update: ${state.delivery.updatedAt ?? 'not posted yet'}`,
    `Last board error: ${ctx.board.lastError ?? 'none'}`,
  ]);
});
for (const [name, paused] of [['pause', true], ['resume', false]]) command(name, 'Board', '', `${paused ? 'Pause' : 'Resume'} automatic leaderboard updates.`, async ctx => {
  setting(ctx, 'paused', paused);
  await reply(ctx.message, paused ? 'Automatic updates paused. $refresh still works.' : 'Automatic updates resumed.');
});
for (const [name, key, max] of [['title', 'title', 38], ['description', 'description', 78], ['footer', 'footer', 42]]) command(name, 'Board', '<text>', `Change the leaderboard ${name}.`, async ctx => {
  const value = text(ctx.args.join(' '), max);
  setting(ctx, key, value);
  await reply(ctx.message, `${name[0].toUpperCase()}${name.slice(1)} updated.`);
});
command('color', 'Board', '<#RRGGBB>', 'Change the board accent color.', async ctx => {
  requireThat(/^#[0-9a-f]{6}$/i.test(ctx.args[0] ?? ''), 'Use a hex color, like $color #f5ca55.');
  setting(ctx, 'color', ctx.args[0]);
  await reply(ctx.message, 'Accent color updated.');
});
command('thumbnail', 'Board', '<https URL | off>', 'Set or remove the small embed image.', async ctx => {
  const value = ctx.args[0] === 'off' ? null : text(ctx.args[0], 500, 'URL');
  if (value) {
    let url;
    try { url = new URL(value); } catch { throw new UserError('Use an HTTPS image URL or off.'); }
    requireThat(url.protocol === 'https:' && !url.username && !url.password, 'Use an HTTPS image URL.');
  }
  setting(ctx, 'thumbnail', value);
  await reply(ctx.message, value ? 'Thumbnail updated.' : 'Thumbnail removed.');
});
command('pagesize', 'Board', '<10–25>', 'Set the number of players per leaderboard card.', async ctx => {
  setting(ctx, 'pageSize', number(ctx.args[0], 10, 25, 'Page size'));
  await reply(ctx.message, 'Page size updated.');
});

command('add', 'Players', '<@member> [rank]', 'Include a member, optionally assigning a rank.', async ctx => {
  const target = await member(ctx, ctx.args[0]);
  if (ctx.args.length > 1) await setRank(ctx, target, rankByName(ctx.args.slice(1).join(' ')));
  else requireThat(memberRank(target, roleMap(ctx.guild, ctx.store.state)), 'That member needs one of the 12 rank roles. Example: $add @member Expert II');
  playerChange(ctx, target, 'add', (_, next) => { next.excluded = next.excluded.filter(id => id !== target.id); });
  await reply(ctx.message, `${plain(target.displayName)} is included.`);
});
command('remove', 'Players', '<@member>', 'Hide a member and clear their saved profile; keep Discord roles.', async ctx => {
  const target = await member(ctx, ctx.args[0]);
  ctx.store.change(ctx.actor.id, `remove ${target.id}`, next => {
    delete next.players[target.id];
    next.excluded = [...new Set([...next.excluded, target.id])];
    next.order = next.order.filter(id => id !== target.id);
  });
  ctx.schedule();
  await reply(ctx.message, 'Member removed from the board. Their Discord roles are unchanged.');
});
command('player', 'Players', '<@member>', 'Show a player’s rank, position, and recorded stats.', async ctx => {
  const target = await member(ctx, ctx.args[0]);
  const row = ctx.board.rows().find(item => item.id === target.id);
  const profile = ctx.store.state.players[target.id] ?? {};
  const rank = memberRank(target, roleMap(ctx.guild, ctx.store.state));
  await list(ctx, plain(profile.name || target.displayName), [
    `Rank: ${rank?.name ?? 'unranked'}`,
    `Position: ${row?.position ?? 'not on board'}`,
    `Roblox: ${plain(profile.roblox || 'not linked')}`,
    `Recorded score: ${profile.score ?? 0}`,
    `Recorded wins / losses: ${profile.wins ?? 0} / ${profile.losses ?? 0}`,
  ]);
});
command('rename', 'Players', '<@member> <name | off>', 'Set a board display name without changing the Discord nickname.', async ctx => {
  const target = await member(ctx, ctx.args[0]);
  const value = ctx.args.slice(1).join(' ');
  const name = value === 'off' ? null : text(value, 48, 'Name');
  playerChange(ctx, target, 'rename', profile => { profile.name = name; });
  await reply(ctx.message, name ? 'Board name updated.' : 'Board name now follows their Discord nickname.');
});
command('roblox', 'Players', '<@member> <username | off>', 'Record a Roblox username for the board.', async ctx => {
  const target = await member(ctx, ctx.args[0]);
  const username = ctx.args[1];
  requireThat(username === 'off' || /^[a-z0-9_]{3,20}$/i.test(username ?? ''), 'Use a Roblox username (3–20 letters, numbers, or underscores), or off.');
  playerChange(ctx, target, 'roblox', profile => { profile.roblox = username === 'off' ? null : username; });
  await reply(ctx.message, username === 'off' ? 'Roblox username removed.' : 'Roblox username saved.');
});
command('rank', 'Players', '<@member> <rank>', 'Assign one of the 12 ranks and remove their other rank roles.', async ctx => {
  const target = await member(ctx, ctx.args[0]);
  const rank = rankByName(ctx.args.slice(1).join(' '));
  await setRank(ctx, target, rank);
  await reply(ctx.message, `${plain(target.displayName)} → ${rank.name}.`);
});
for (const [name, offset] of [['promote', -1], ['demote', 1]]) command(name, 'Players', '<@member>', `${name === 'promote' ? 'Raise' : 'Lower'} a member by one rank.`, async ctx => {
  const target = await member(ctx, ctx.args[0]);
  const current = memberRank(target, roleMap(ctx.guild, ctx.store.state));
  requireThat(current, 'That member has no rank. Use $rank first.');
  const next = RANKS[current.index + offset];
  requireThat(next, `Already at the ${offset < 0 ? 'highest' : 'lowest'} rank.`);
  await setRank(ctx, target, next);
  await reply(ctx.message, `${plain(target.displayName)} → ${next.name}.`);
});
for (const key of ['score', 'wins', 'losses']) command(key, 'Players', '<@member> <number>', `Set a player’s manually recorded ${key}.`, async ctx => {
  const target = await member(ctx, ctx.args[0]);
  const value = number(ctx.args[1], 0, 1000000000, key);
  playerChange(ctx, target, key, profile => { profile[key] = value; });
  await reply(ctx.message, `${key[0].toUpperCase()}${key.slice(1)} set to ${value}.`);
});
for (const name of ['exclude', 'include']) command(name, 'Players', '<@member>', `${name === 'exclude' ? 'Hide a member while keeping their saved profile' : 'Allow a member back onto the board if they have a rank role'}.`, async ctx => {
  const target = await member(ctx, ctx.args[0]);
  ctx.store.change(ctx.actor.id, `${name} ${target.id}`, next => {
    next.excluded = next.excluded.filter(id => id !== target.id);
    if (name === 'exclude') next.excluded.push(target.id);
  });
  ctx.schedule();
  await reply(ctx.message, name === 'exclude' ? 'Member hidden. Their profile is saved.' : 'Member included. They will appear when they have a rank role.');
});
command('members', 'Players', '[page]', 'List ranked members, including those below the display limit.', async ctx => {
  const rows = ctx.board.rows();
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const page = ctx.args[0] ? number(ctx.args[0], 1, pages, 'Page') : 1;
  await list(ctx, `Ranked members · ${page}/${pages}`, rows.slice((page - 1) * 20, page * 20).map(rowLine));
});

command('move', 'Ordering', '<@member> <position>', 'Move a member within their own rank; switch to manual sorting.', async ctx => {
  const target = await member(ctx, ctx.args[0]);
  const rows = ctx.board.rows();
  const position = number(ctx.args[1], 1, rows.length, 'Position');
  ctx.store.change(ctx.actor.id, `move ${target.id} ${position}`, next => movePlayer(next, rows, target.id, position));
  ctx.schedule();
  await reply(ctx.message, `Moved to position ${position}.`);
});
command('swap', 'Ordering', '<@member> <@member>', 'Swap two members within the same rank.', async ctx => {
  const first = await member(ctx, ctx.args[0]);
  const second = await member(ctx, ctx.args[1]);
  const rows = ctx.board.rows();
  const a = rows.findIndex(row => row.id === first.id);
  const b = rows.findIndex(row => row.id === second.id);
  requireThat(a >= 0 && b >= 0 && rows[a].rank === rows[b].rank, 'Both members must be on the board and have the same rank.');
  ctx.store.change(ctx.actor.id, `swap ${first.id} ${second.id}`, next => {
    next.order = rows.map(row => row.id);
    [next.order[a], next.order[b]] = [next.order[b], next.order[a]];
    next.settings.sort = 'manual';
  });
  ctx.schedule();
  await reply(ctx.message, 'Positions swapped.');
});
command('sort', 'Ordering', '<manual | name | score | wins>', 'Choose sorting within each rank; rank order always comes first.', async ctx => {
  requireThat(['manual', 'name', 'score', 'wins'].includes(ctx.args[0]), 'Use $sort manual, name, score, or wins.');
  setting(ctx, 'sort', ctx.args[0]);
  await reply(ctx.message, `Sorting by ${ctx.args[0]} within each rank.`);
});
command('top', 'Ordering', '[1–25]', 'Show the highest-ranked members here.', async ctx => {
  const count = ctx.args[0] ? number(ctx.args[0], 1, 25) : 10;
  await list(ctx, `Top ${count}`, ctx.board.rows().slice(0, count).map(rowLine));
});
command('search', 'Ordering', '<name>', 'Search Discord and recorded Roblox names.', async ctx => {
  const query = text(ctx.args.join(' '), 48).toLowerCase();
  const rows = ctx.board.rows().filter(row => [row.name, row.username, row.roblox].some(value => value.toLowerCase().includes(query)));
  await list(ctx, `Search · ${rows.length} matches`, rows.slice(0, 40).map(rowLine));
});
command('compare', 'Ordering', '<@member> <@member>', 'Compare two members’ rank, position, and recorded stats.', async ctx => {
  const first = await member(ctx, ctx.args[0]);
  const second = await member(ctx, ctx.args[1]);
  const rows = ctx.board.rows();
  await list(ctx, 'Player comparison', [first, second].map(target => {
    const row = rows.find(item => item.id === target.id);
    const stats = ctx.store.state.players[target.id] ?? {};
    return `**${plain(target.displayName)}**\n${row ? `${row.rank} · #${row.position}` : 'Not on the board'}\nScore ${stats.score ?? 0} · Wins ${stats.wins ?? 0} · Losses ${stats.losses ?? 0}`;
  }));
});

command('ranks', 'Ranks', '', 'Show the exact rank order and mapped role IDs.', async ctx => {
  const roles = roleMap(ctx.guild, ctx.store.state);
  await list(ctx, 'Ranks · best to worst', RANKS.map(rank => `${rank.index + 1}. **${rank.name}** · ${roles.get(rank.name)?.id ?? 'missing or ambiguous — use $rankrole'}`));
});
command('rankrole', 'Ranks', '<rank> <role ID>', 'Bind one of the 12 ranks to its Discord role.', async ctx => {
  const roleId = snowflake(ctx.args.at(-1));
  const rank = rankByName(ctx.args.slice(0, -1).join(' '));
  const role = await ctx.guild.roles.fetch(roleId);
  safeRankRole(role, ctx.guild, null);
  const roles = roleMap(ctx.guild, ctx.store.state);
  requireThat(!RANKS.some(other => other.name !== rank.name && roles.get(other.name)?.id === roleId), 'That role is already used by another rank.');
  ctx.store.change(ctx.actor.id, `rankrole ${rank.name} ${roleId}`, next => { next.rankRoles[rank.name] = roleId; });
  ctx.schedule();
  await reply(ctx.message, `${rank.name} linked to role ${roleId}.`);
});
command('rankclear', 'Ranks', '<rank>', 'Remove a role override and return to exact-name role matching.', async ctx => {
  const rank = rankByName(ctx.args.join(' '));
  ctx.store.change(ctx.actor.id, `rankclear ${rank.name}`, next => { delete next.rankRoles[rank.name]; });
  ctx.schedule();
  await reply(ctx.message, `${rank.name} now matches its exact role name.`);
});
command('rankmembers', 'Ranks', '<rank>', 'List players whose highest rank is the given rank.', async ctx => {
  const rank = rankByName(ctx.args.join(' '));
  await list(ctx, rank.name, ctx.board.rows().filter(row => row.rank === rank.name).map(rowLine));
});
command('rankstats', 'Ranks', '', 'Show participant counts per highest rank.', async ctx => {
  const rows = ctx.board.rows();
  await list(ctx, 'Rank distribution', RANKS.map(rank => `${rank.name}: **${rows.filter(row => row.rank === rank.name).length}**`));
});

command('settings', 'Settings', '', 'Show board settings and fixed access roles.', async ctx => {
  const state = ctx.store.state;
  await list(ctx, 'Board settings', [
    `Server: ${GUILD_ID}`, `Channel: ${state.delivery.channelId ?? 'not set'}`,
    `Staff roles: ${STAFF_ROLES.join(', ')}`,
    ...Object.entries(state.settings).map(([key, value]) => `${key}: ${plain(value ?? 'off')}`),
  ]);
});
command('setlogchannel', 'Settings', '<channel ID>', 'Choose a channel for staff command audit entries.', async ctx => {
  const channel = await ctx.board.channel(snowflake(ctx.args[0]));
  setting(ctx, 'logChannelId', channel.id);
  await reply(ctx.message, 'Staff log channel set.');
});
command('logoff', 'Settings', '', 'Turn off Discord audit posts; keep local history.', async ctx => {
  setting(ctx, 'logChannelId', null);
  await reply(ctx.message, 'Discord audit posts disabled.');
});
command('interval', 'Settings', '<2–60>', 'Set the fallback member-sync interval in minutes.', async ctx => {
  setting(ctx, 'interval', number(ctx.args[0], 2, 60, 'Minutes'));
  await reply(ctx.message, 'Sync interval updated. Role changes still update automatically.');
});
command('sync', 'Settings', '', 'Fetch all members and roles, then rebuild the board.', async ctx => {
  await ctx.board.sync();
  await ctx.board.publish(true);
  await reply(ctx.message, `Synced ${ctx.guild.members.cache.size} members.`);
});

command('export', 'Data', '', 'Download the full standings as CSV.', async ctx => {
  const escape = value => {
    let result = String(value);
    if (/^[=+\-@\t\r]/.test(result)) result = `'${result}`;
    return `"${result.replace(/"/g, '""')}"`;
  };
  const rows = ctx.board.rows();
  const header = ['position', 'discord_id', 'name', 'roblox', 'rank', 'score', 'wins', 'losses'];
  const csv = [header.join(','), ...rows.map(row => [row.position, row.id, row.name, row.roblox, row.rank, row.score, row.wins, row.losses].map(escape).join(','))].join('\r\n');
  await reply(ctx.message, { files: [new AttachmentBuilder(Buffer.from(`\ufeff${csv}`), { name: 'ftap-leaderboard.csv' })] });
});
command('backup', 'Data', '', 'Save a local backup and download its JSON copy.', async ctx => {
  const id = ctx.store.backup();
  const { snapshot } = await import('./store.js');
  await reply(ctx.message, { content: `Backup saved: ${id}`, files: [new AttachmentBuilder(Buffer.from(JSON.stringify({ version: 1, data: snapshot(ctx.store.state) }, null, 2)), { name: `ftap-backup-${id}.json` })] });
});
command('backups', 'Data', '', 'List the 30 most recent local backups.', async ctx => {
  await list(ctx, 'Saved backups', ctx.store.backups().map(id => `${id} · ${new Date(Number(id)).toISOString()}`));
});
command('restore', 'Data', '<backup ID>', 'Restore settings and player data; keep the administrator’s channel choice.', async ctx => {
  ctx.store.restore(ctx.actor.id, ctx.args[0]);
  ctx.schedule();
  await reply(ctx.message, 'Backup restored. Discord roles and the board channel are unchanged.');
});
command('history', 'Data', '[1–30]', 'Show recent saved changes and rank actions.', async ctx => {
  const count = ctx.args[0] ? number(ctx.args[0], 1, 30) : 10;
  await list(ctx, 'Recent changes', ctx.store.state.history.slice(-count).reverse().map(entry => `${entry.at.slice(0, 16).replace('T', ' ')} UTC · ${entry.actor}\n${plain(entry.action)}`));
});
for (const name of ['undo', 'redo']) command(name, 'Data', '', `${name === 'undo' ? 'Undo' : 'Redo'} a saved settings/player-data change; Discord roles are unaffected.`, async ctx => {
  const action = ctx.store.rewind(ctx.actor.id, name);
  ctx.schedule();
  await reply(ctx.message, `${name === 'undo' ? 'Undid' : 'Redid'} ${plain(action)}. Discord roles are unchanged.`);
});
command('resetstats', 'Data', '<@member>', 'Reset one player’s recorded score, wins, and losses.', async ctx => {
  const target = await member(ctx, ctx.args[0]);
  playerChange(ctx, target, 'resetstats', profile => { profile.score = 0; profile.wins = 0; profile.losses = 0; });
  await reply(ctx.message, 'Recorded stats reset. $undo can restore them.');
});

export async function dispatch(message, services) {
  if (message.author.bot || message.guildId !== GUILD_ID || !message.content.startsWith(PREFIX)) return;
  const [name = '', ...args] = tokenize(message.content.slice(PREFIX.length));
  const entry = commands.get(name.toLowerCase());
  if (!entry) {
    if (name) await reply(message, 'Unknown command. Use $help.');
    return;
  }
  // Fetch current permissions instead of trusting a cached staff role after removal.
  const actor = await message.guild.members.fetch({ user: message.author.id, force: true });
  requireThat(canUse(actor, entry.access), entry.access === 'admin' ? 'You need Administrator permission for $setchannel.' : 'You need one of the two staff roles to use that command.');
  const now = Date.now();
  const previous = services.cooldowns.get(actor.id) ?? 0;
  requireThat(now - previous >= 1500, 'Wait a moment before your next command.');
  services.cooldowns.set(actor.id, now);
  for (const [id, at] of services.cooldowns) if (now - at > 60000) services.cooldowns.delete(id);
  const ctx = { ...services, message, guild: message.guild, actor, args };
  await entry.run(ctx);
  if (entry.access !== 'public' && services.store.state.settings.logChannelId) {
    const log = await message.guild.channels.fetch(services.store.state.settings.logChannelId).catch(() => null);
    if (log?.isTextBased()) await log.send({ content: `${actor.id} · $${plain(name)} ${plain(args.join(' ')).slice(0, 500)}`, allowedMentions: { parse: [] } }).catch(() => {});
  }
}
