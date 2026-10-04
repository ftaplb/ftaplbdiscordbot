import { RANKS } from './config.js';
import { requireThat } from './util.js';

export function rankByName(value) {
  const rank = RANKS.find(item => item.name.toLowerCase() === String(value).trim().toLowerCase());
  requireThat(rank, 'Unknown rank. Use $ranks for the exact names.');
  return rank;
}

export function roleMap(guild, state) {
  return new Map(RANKS.map(rank => {
    if (Object.hasOwn(state.rankRoles, rank.name)) return [rank.name, guild.roles.cache.get(state.rankRoles[rank.name]) ?? null];
    const matches = [...guild.roles.cache.values()].filter(role => role.name.trim().toLowerCase() === rank.name.toLowerCase());
    return [rank.name, matches.length === 1 ? matches[0] : null];
  }));
}

export function memberRank(member, roles) {
  return RANKS.find(rank => roles.get(rank.name) && member.roles.cache.has(roles.get(rank.name).id)) ?? null;
}

export function memberChangeAffectsBoard(before, after, state) {
  const ids = [...roleMap(after.guild, state).values()].filter(Boolean).map(role => role.id);
  return ids.some(id => before.roles.cache.has(id) !== after.roles.cache.has(id)) ||
    (before.displayName !== after.displayName && ids.some(id => after.roles.cache.has(id)));
}

export function standings(guild, state) {
  const roles = roleMap(guild, state);
  const excluded = new Set(state.excluded);
  const order = new Map(state.order.map((id, i) => [id, i]));
  const rows = [];
  for (const member of guild.members.cache.values()) {
    if (member.user.bot || excluded.has(member.id)) continue;
    const rank = memberRank(member, roles);
    if (!rank) continue;
    const profile = state.players[member.id] ?? {};
    rows.push({
      id: member.id, name: profile.name || member.displayName,
      username: member.user.username, roblox: profile.roblox || '',
      score: profile.score ?? 0, wins: profile.wins ?? 0, losses: profile.losses ?? 0,
      rank: rank.name, rankIndex: rank.index, color: rank.color,
    });
  }
  rows.sort((a, b) => {
    if (a.rankIndex !== b.rankIndex) return a.rankIndex - b.rankIndex;
    if (state.settings.sort === 'score' && a.score !== b.score) return b.score - a.score;
    if (state.settings.sort === 'wins' && a.wins !== b.wins) return b.wins - a.wins;
    if (state.settings.sort === 'manual') {
      const difference = (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity);
      if (!Number.isNaN(difference) && difference !== 0) return difference;
    }
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  });
  return rows.map((row, i) => ({ ...row, position: i + 1 }));
}

export function movePlayer(state, rows, id, position) {
  const player = rows.find(row => row.id === id);
  const target = rows[position - 1];
  requireThat(player && target, 'Both positions must be on the full leaderboard.');
  requireThat(player.rank === target.rank, 'Move players within their rank. Change their rank to move between tiers.');
  const next = rows.map(row => row.id).filter(item => item !== id);
  next.splice(position - 1, 0, id);
  state.order = next;
  state.settings.sort = 'manual';
}
