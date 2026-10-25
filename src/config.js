export const GUILD_ID = '1502470371826204772';
export const STAFF_ROLES = ['1541427910198427809', '1538609206763061308'];
export const PREFIX = '$';
export const REGION_ROLES = {
  Oceania: '1502722238586032258',
  Africa: '1502722242147258449',
  'South America': '1502722243770454159',
  'North America': '1502722245355634718',
  Asia: '1502722247276888176',
  Antarctica: '1558128103291887788',
  Europe: '1502722248656814211',
};
export const DEVICE_ROLES = {
  PC: '1502723058077536256',
  Laptop: '1502723077195173969',
  Console: '1502723078554386495',
  Mobile: '1502723080324387057',
};
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

export function defaults(guildId = GUILD_ID) {
  return {
    version: 1, guildId, prefix: PREFIX,
    access: { staff: [], editors: [], evaluators: [], staffRoles: guildId === GUILD_ID ? [...STAFF_ROLES] : [] },
    settings: {
      limit: 100, pageSize: 25, interval: 2, paused: false,
      title: 'Community leaderboard', description: 'Fling Things and People',
      color: '#d6d18e', thumbnail: null, footer: 'FTAP Community',
      sort: 'manual', logChannelId: null,
    },
    players: {}, order: [], excluded: [], rankRoles: {}, customRanks: [],
    regionRoles: guildId === GUILD_ID ? { ...REGION_ROLES } : {},
    deviceRoles: guildId === GUILD_ID ? { ...DEVICE_ROLES } : {},
    delivery: { channelId: null, messageIds: [], fingerprint: null, updatedAt: null },
    history: [], undo: [], redo: [],
  };
}
