import fs from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';
import { defaults, DEVICE_ROLES, RANKS, REGION_ROLES } from '../src/config.js';
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
  region: Object.keys(REGION_ROLES)[i % 7],
  device: Object.keys(DEVICE_ROLES)[i % 4],
}));
const settings = { ...defaults().settings, footer: 'Layout sample' };
const png = await sharp(Buffer.from(cardSvg(players, settings, { total: players.length, updatedAt: new Date('2026-10-04T18:00:00Z') }))).png().toBuffer();
const destination = process.argv[2] || 'preview.png';
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, png);
console.log(`Saved ${destination} (sample data).`);
