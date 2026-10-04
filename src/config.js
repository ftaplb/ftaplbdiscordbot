export const GUILD_ID = '1502470371826204772';
export const STAFF_ROLES = ['1541427910198427809', '1538609206763061308'];
export const PREFIX = '$';
export const RANKS = [
  ['Fling God', '#f5ca55'],
  ['Advanced III', '#ff616f'],
  ['Advanced II', '#ff616f'],
  ['Advanced I', '#ff616f'],
  ['Expert III', '#d779f2'],
  ['Expert II', '#ba85ee'],
  ['Expert I', '#a08ce6'],
  ['Skillful III', '#72cbff'],
  ['Skillful II', '#56b5f7'],
  ['Skillful I', '#4b98ee'],
  ['Apprentice', '#79d69e'],
  ['Casual', '#acb5c4'],
].map(([name, color], index) => ({ name, color, index }));

export function defaults() {
  return {
    version: 1,
    settings: {
      limit: 100, pageSize: 15, interval: 2, paused: false,
      title: 'Community leaderboard', description: 'Fling Things and People',
      color: '#f5ca55', thumbnail: null, footer: 'FTAP Community',
      sort: 'manual', logChannelId: null,
    },
    players: {}, order: [], excluded: [], rankRoles: {},
    delivery: { channelId: null, messageIds: [], fingerprint: null, updatedAt: null },
    history: [], undo: [], redo: [],
  };
}
