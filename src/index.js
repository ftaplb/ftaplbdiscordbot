import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { GUILD_ID } from './config.js';
import { Servers } from './servers.js';
import { Coordinator } from './coordinator.js';
import { commandText, dispatch } from './commands.js';
import { isRankRoleName, memberChangeAffectsBoard, trackedRoleIds } from './leaderboard.js';
import { storageInfo } from './storage.js';
import { errorLabel, UserError } from './util.js';

const token = process.env.DISCORD_TOKEN?.trim();
if (!token || token === 'put_your_bot_token_here') {
  console.error('Set DISCORD_TOKEN in Railway Variables or in a local .env file.');
  process.exit(1);
}

const storage = storageInfo();
console.log(`Storage: ${storage.directory}. ${storage.status}`);
if (storage.warning) console.warn(storage.warning);
const servers = new Servers(storage.directory);
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  allowedMentions: { parse: [], repliedUser: false },
});
const coordinator = new Coordinator(client, servers);
let stopping = false;

client.once(Events.ClientReady, async ready => {
  ready.user.setActivity('FTAP leaderboard', { type: ActivityType.Watching });
  console.log(`Connected as ${ready.user.tag}. ${servers.state.enabled.length} enabled servers.`);
  if (!ready.guilds.cache.has(GUILD_ID)) console.warn(`Invite the bot to home server ${GUILD_ID} to manage server access.`);
  await Promise.allSettled(servers.state.enabled.filter(id => ready.guilds.cache.has(id)).map(id =>
    coordinator.enqueue(id, () => coordinator.start(id)).catch(error => coordinator.failure(id, error)),
  ));
});

client.on(Events.MessageCreate, message => {
  if (stopping || message.author.bot || !message.guildId || !servers.enabled(message.guildId)) return;
  const prefix = servers.store(message.guildId).state.prefix;
  if (!message.content.startsWith(prefix)) return;
  coordinator.enqueue(message.guildId, async () => {
    if (!servers.enabled(message.guildId)) return;
    await dispatch(message, coordinator.services(message.guildId));
  }).catch(async error => {
    const explanation = error instanceof UserError ? commandText(error.message, servers.store(message.guildId).state.prefix) : 'That failed. Check my channel and role permissions, then try again.';
    if (!(error instanceof UserError)) console.error(`Command failed in ${message.guildId}: ${errorLabel(error)}`);
    await message.reply({ content: explanation, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  });
});

client.on(Events.GuildMemberUpdate, (before, after) => {
  if (!servers.enabled(after.guild.id)) return;
  if (memberChangeAffectsBoard(before, after, servers.store(after.guild.id).state)) coordinator.schedule(after.guild.id);
});
for (const event of [Events.GuildMemberAdd, Events.GuildMemberRemove]) client.on(event, member => coordinator.schedule(member.guild.id));
client.on(Events.UserUpdate, (before, after) => {
  if (before.username !== after.username) for (const [id, board] of coordinator.boards) {
    if (board.guild.members.cache.has(after.id)) coordinator.schedule(id);
  }
});

function relevantRole(role) {
  if (!servers.enabled(role.guild.id)) return false;
  return isRankRoleName(role.name) || trackedRoleIds(servers.store(role.guild.id).state).includes(role.id);
}
client.on(Events.GuildRoleUpdate, (before, after) => { if (relevantRole(before) || relevantRole(after)) coordinator.schedule(after.guild.id); });
for (const event of [Events.GuildRoleCreate, Events.GuildRoleDelete]) client.on(event, role => { if (relevantRole(role)) coordinator.schedule(role.guild.id); });
client.on(Events.GuildCreate, guild => {
  if (servers.enabled(guild.id)) coordinator.enqueue(guild.id, () => coordinator.start(guild.id)).catch(error => coordinator.failure(guild.id, error));
});
client.on(Events.GuildDelete, guild => coordinator.stopServer(guild.id));
client.on(Events.MessageDelete, message => {
  if (!message.guildId || !servers.enabled(message.guildId)) return;
  const store = servers.store(message.guildId);
  if (store.state.delivery.messageIds.includes(message.id)) coordinator.enqueue(message.guildId, async () => {
    store.runtime(next => { next.delivery.fingerprint = null; });
    coordinator.schedule(message.guildId);
  }).catch(error => coordinator.failure(message.guildId, error));
});
client.on(Events.Error, error => console.error(`Discord client: ${errorLabel(error)}`));
client.on(Events.Warn, warning => console.warn(String(warning).replaceAll(token, '[redacted]')));

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(code), 8000);
  deadline.unref();
  await coordinator.close();
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
