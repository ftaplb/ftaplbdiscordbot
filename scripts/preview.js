import fs from 'node:fs';
import sharp from 'sharp';
import { defaults, RANKS } from '../src/config.js';
import { cardSvg } from '../src/render.js';

// Sample data for the design preview; never imported into the live board.
const players = [
  ['Chamo', 'speedproaso', 'Advanced I'],
  ['Kalon', 'cheeseman1608', 'Expert III'],
  ['Sleepyhead', 'pcport_1', 'Expert II'],
  ['@', 'p5rce', 'Expert II'],
  ['#wrld', 'sc6ot', 'Expert II'],
  ['BigAlecrim', 'ruansemjj', 'Expert II'],
  ['DeSper', 'murander73', 'Expert II'],
  ['diogoxFPC', 'diogo_bpa', 'Expert II'],
  ['Lal', 'lal_chmo', 'Expert II'],
  ['Index', 'indequo', 'Expert I'],
  ['Huracan', '', 'Expert I'], ['IortFaeky', '', 'Expert I'],
  ['Rain2', '', 'Expert I'], ['Illani', '', 'Expert I'],
  ['Whack_Fl7ng', '', 'Skillful III'], ['Meliodas', '', 'Skillful III'],
  ['Max', '', 'Skillful II'], ['yumi', '', 'Skillful II'],
  ['Morph', '', 'Skillful I'], ['MrRobloxian', '', 'Skillful I'],
  ['SmartDev', '', 'Apprentice'], ['KL_Cabs', '', 'Apprentice'],
  ['REALISM', '', 'Casual'], ['Oni', '', 'Casual'], ['Olen', '', 'Casual'],
].map(([name, roblox, rank], i) => ({
  name, roblox, rank, username: name, position: i + 1,
  color: RANKS.find(item => item.name === rank).color,
  rating: 2147 - i * 24, rd: 110 + (i * 13) % 130,
  country: ['Germany', 'Russia', 'United States', 'United Kingdom', 'Thailand'][i % 5],
  clan: ['WN', '', 'DKM', '', 'RC'][i % 5],
}));
const settings = { ...defaults().settings, footer: 'Layout sample' };
const png = await sharp(Buffer.from(cardSvg(players, settings, { total: players.length, updatedAt: new Date('2026-10-04T18:00:00Z') }))).png().toBuffer();
fs.writeFileSync('preview.png', png);
console.log('Saved preview.png (sample data).');
