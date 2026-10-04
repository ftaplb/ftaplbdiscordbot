import path from 'node:path';
import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { GUILD_ID, RANKS } from './config.js';
import { Store } from './store.js';
import { Board } from './board.js';
import { dispatch } from './commands.js';
import { memberChangeAffectsBoard } from './leaderboard.js';
import { errorLabel, UserError } from './util.js';

const token = process.env.DISCORD_TOKEN?.trim();
if (!token || token === 'put_your_bot_token_here') {
  console.error('Set DISCORD_TOKEN in Railway Variables or in a local .env file.');
  process.exit(1);
}

const store = new Store(process.env.DATA_DIR || path.resolve('data'));
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  allowedMentions: { parse: [], repliedUser: false },
});

let board;
let pending = Promise.resolve();
let updateTimer;
let syncTimer;
let stopping = false;
const cooldowns = new Map();

function enqueue(task) {
  const result = pending.then(task);
  pending = result.catch(() => {});
  return result;
}

function boardFailure(error) {
  if (board) board.lastError = error instanceof UserError ? error.message : errorLabel(error);
  console.error(`Board update failed: ${errorLabel(error)}`);
}

function schedule() {
  if (stopping || !board) return;
  clearTimeout(updateTimer);
  // Coalesce a batch of role changes into one edit instead of hammering Discord.
  updateTimer = setTimeout(() => enqueue(() => board.publish()).catch(boardFailure), 3000);
}

function periodicSync() {
  if (stopping) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try { await enqueue(async () => { await board.sync(); await board.publish(); }); }
    catch (error) { boardFailure(error); }
    periodicSync();
  }, store.state.settings.interval * 60000);
}

client.once(Events.ClientReady, ready => {
  enqueue(async () => {
    const guild = ready.guilds.cache.get(GUILD_ID);
    if (!guild) throw new UserError(`Invite this bot to server ${GUILD_ID}, then restart it.`);
    board = new Board(client, store, guild);
    await board.sync();
    if (!store.state.settings.paused) await board.publish(true);
    ready.user.setActivity('$help · FTAP leaderboard', { type: ActivityType.Watching });
    console.log(`Connected as ${ready.user.tag}. Server ${GUILD_ID}; ${board.rows().length} ranked members.`);
    periodicSync();
  }).catch(error => {
    console.error(error instanceof UserError ? error.message : `Startup failed: ${errorLabel(error)}. Check bot permissions and privileged intents.`);
    void shutdown(1);
  });
});

client.on(Events.MessageCreate, message => {
  if (!board || stopping) return;
  enqueue(() => dispatch(message, { client, store, board, schedule, cooldowns })).catch(async error => {
    const explanation = error instanceof UserError ? error.message : 'That failed. Check my channel and role permissions, then try again.';
    if (!(error instanceof UserError)) console.error(`Command failed: ${errorLabel(error)}`);
    await message.reply({ content: explanation, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  });
});

client.on(Events.GuildMemberUpdate, (before, after) => {
  if (!board || after.guild.id !== GUILD_ID) return;
  if (memberChangeAffectsBoard(before, after, store.state)) schedule();
});
client.on(Events.GuildMemberAdd, member => {
  if (member.guild.id === GUILD_ID) schedule();
});
client.on(Events.GuildMemberRemove, member => {
  if (member.guild.id === GUILD_ID) schedule();
});
client.on(Events.UserUpdate, (before, after) => {
  if (board && before.username !== after.username && board.guild.members.cache.has(after.id)) schedule();
});

function relevantRole(role) {
  return role.guild.id === GUILD_ID && (RANKS.some(rank => rank.name.toLowerCase() === role.name.trim().toLowerCase()) || Object.values(store.state.rankRoles).includes(role.id));
}
client.on(Events.GuildRoleUpdate, (before, after) => { if (relevantRole(before) || relevantRole(after)) schedule(); });
client.on(Events.GuildRoleCreate, role => { if (relevantRole(role)) schedule(); });
client.on(Events.GuildRoleDelete, role => { if (relevantRole(role)) schedule(); });
client.on(Events.MessageDelete, message => {
  if (store.state.delivery.messageIds.includes(message.id)) enqueue(async () => {
    store.runtime(next => { next.delivery.fingerprint = null; });
    schedule();
  }).catch(boardFailure);
});
client.on(Events.Error, error => console.error(`Discord client: ${errorLabel(error)}`));
client.on(Events.Warn, warning => console.warn(String(warning).replaceAll(token, '[redacted]')));

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(updateTimer);
  clearTimeout(syncTimer);
  const deadline = setTimeout(() => process.exit(code), 8000);
  deadline.unref();
  await pending;
  client.destroy();
  process.exit(code);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.on('unhandledRejection', error => {
  console.error(`Unhandled failure: ${errorLabel(error ?? {})}`);
  void shutdown(1);
});

client.login(token).catch(error => {
  console.error(`Discord login failed: ${errorLabel(error)}. Check DISCORD_TOKEN and enable Server Members and Message Content intents.`);
  void shutdown(1);
});
