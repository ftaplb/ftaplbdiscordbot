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
].map(([name, roblox, rank], i) => ({ name, roblox, rank, username: name, position: i + 1, color: RANKS.find(item => item.name === rank).color }));
const png = await sharp(Buffer.from(cardSvg(players, defaults().settings, { total: 10, updatedAt: new Date('2026-10-04T18:00:00Z') }))).png().toBuffer();
fs.writeFileSync('preview.png', png);
console.log('Saved preview.png (sample data).');
