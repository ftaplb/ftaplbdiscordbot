import { defaults, DEVICE_ROLES, REGION_ROLES, RANKS } from './config.js';
import { requireThat, UserError } from './util.js';
import { isRankRoleName } from './leaderboard.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ids = value => Array.isArray(value) && value.length <= 100000 && value.every(id => typeof id === 'string' && /^\d{17,20}$/.test(id));
const shortString = (value, max) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const https = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};
function check(condition) { requireThat(condition, 'Invalid backup contents. Use a complete JSON file downloaded with $backup.'); }

export function validateBackup(payload, guildId) {
  check(object(payload) && payload.version === 2 && object(payload.data) && object(payload.configuration));
  requireThat(payload.guildId === guildId, 'That backup belongs to a different server.');
  const { data, configuration } = payload;
  const initial = defaults(guildId);
  check(object(data.settings) && object(data.players) && object(data.rankRoles));
  check(ids(data.order) && ids(data.excluded));
  check(Object.keys(data.settings).every(key => Object.hasOwn(initial.settings, key)));
  const settings = { ...initial.settings, ...data.settings };
  check(integer(settings.limit, 1, 100) && integer(settings.pageSize, 10, 50) && integer(settings.interval, 2, 60));
  check(typeof settings.paused === 'boolean' && ['manual', 'name', 'score', 'wins'].includes(settings.sort));
  check(shortString(settings.title, 38) && shortString(settings.description, 78) && shortString(settings.footer, 42));
  check(/^#[0-9a-f]{6}$/i.test(settings.color) && (settings.thumbnail === null || (shortString(settings.thumbnail, 500) && https(settings.thumbnail))));
  check(settings.logChannelId === null || ids([settings.logChannelId]));
  check(Object.keys(data.players).length <= 100000);
  for (const [id, profile] of Object.entries(data.players)) {
    check(ids([id]) && object(profile));
    for (const [key, value] of Object.entries(profile)) {
      if (['name', 'roblox', 'country', 'clan'].includes(key)) check(value === null || shortString(value, { name: 48, roblox: 20, country: 40, clan: 16 }[key]));
      else if (['score', 'wins', 'losses', 'rd'].includes(key)) check(integer(value, 0, key === 'rd' ? 1000 : 1000000000));
      else check(false);
    }
  }
  const rankNames = new Set(RANKS.map(rank => rank.name.toLowerCase().replace(/[\s_-]+/g, '')));
  check(Object.entries(data.rankRoles).every(([name, id]) => RANKS.some(rank => rank.name === name) && ids([id])));
  check(Array.isArray(data.customRanks) && data.customRanks.length <= 50);
  const roleIds = new Set(Object.values(data.rankRoles));
  for (const rank of data.customRanks) {
    check(object(rank) && shortString(rank.name, 48) && rank.name.trim().length && ids([rank.roleId]) && /^#[0-9a-f]{6}$/i.test(rank.color));
    const name = rank.name.toLowerCase().replace(/[\s_-]+/g, '');
    check(!isRankRoleName(rank.name) && !['all', 'sk', 'skillful', 'e', 'expert', 'adv', 'advanced'].includes(rank.name.toLowerCase()));
    check(!rankNames.has(name) && !roleIds.has(rank.roleId));
    rankNames.add(name); roleIds.add(rank.roleId);
  }
  for (const [key, choices] of [['regionRoles', REGION_ROLES], ['deviceRoles', DEVICE_ROLES]]) {
    check(object(data[key]) && Object.entries(data[key]).every(([name, id]) => Object.hasOwn(choices, name) && ids([id])));
    check(new Set(Object.values(data[key])).size === Object.values(data[key]).length);
  }
  check(shortString(configuration.prefix, 8) && configuration.prefix.length && !/[\s`<>]/.test(configuration.prefix));
  check(object(configuration.access) && Object.keys(initial.access).every(key => ids(configuration.access[key])));
  check(configuration.access.staffRoles.every(id => !roleIds.has(id)));
  const delivery = configuration.delivery;
  check(object(delivery) && (delivery.channelId === null || ids([delivery.channelId])) && ids(delivery.messageIds) && delivery.messageIds.length <= 10);
  return { data: { settings, players: data.players, order: data.order, excluded: data.excluded, rankRoles: data.rankRoles,
    customRanks: data.customRanks.map(({ name, roleId, color }) => ({ name, roleId, color })), regionRoles: data.regionRoles, deviceRoles: data.deviceRoles },
  configuration: { prefix: configuration.prefix, access: Object.fromEntries(Object.keys(initial.access).map(key => [key, [...new Set(configuration.access[key])]])),
    delivery: { channelId: delivery.channelId, messageIds: delivery.messageIds, fingerprint: null, updatedAt: null } } };
}

export async function readBackupAttachment(attachment, fetcher = fetch) {
  requireThat(attachment && attachment.name?.endsWith('.json'), 'Attach the JSON file downloaded with $backup to this command.');
  const maxBytes = 5 * 1024 * 1024;
  requireThat(attachment.size <= maxBytes, 'Backup files must be at most 5 MB.');
  let url;
  try { url = new URL(attachment.url); } catch { throw new UserError('Use a Discord JSON attachment.'); }
  requireThat(url.protocol === 'https:' && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443') && url.pathname.startsWith('/attachments/'), 'Use a Discord JSON attachment.');
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  requireThat(response.ok && response.body, 'Could not download that attachment. Upload it again.');
  const buffers = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    requireThat(length <= maxBytes, 'Backup files must be at most 5 MB.');
    buffers.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(buffers).toString('utf8')); }
  catch { throw new UserError('That attachment is not valid JSON.'); }
}
