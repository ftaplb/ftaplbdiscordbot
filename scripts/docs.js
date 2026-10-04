import fs from 'node:fs';
import { commands } from '../src/commands.js';

const lines = ['# Command reference', '', '53 commands total: `$help`, `$setchannel`, `$participants`, and 50 additional staff commands.', '', 'Staff means a member with role `1541427910198427809` or `1538609206763061308`. Administrator alone does not bypass staff access.', ''];
for (const category of new Set([...commands.values()].map(entry => entry.category))) {
  lines.push(`## ${category}`, '', '| Command | What it does | Access |', '| --- | --- | --- |');
  for (const entry of commands.values()) {
    if (entry.category !== category) continue;
    const usage = `$${entry.name}${entry.usage ? ` ${entry.usage}` : ''}`.replaceAll('|', '\\|');
    const access = entry.access === 'staff' ? 'Staff' : entry.access === 'admin' ? 'Administrator' : 'Everyone';
    lines.push(`| \`${usage}\` | ${entry.description} | ${access} |`);
  }
  lines.push('');
}
lines.push('For multiword ranks, use the exact name, e.g. `$rank @member Advanced III`.', '', 'For `$restore`, choose a local backup ID from `$backups`. Undo/redo/restore do not alter Discord roles or the selected board channel.', '');
fs.writeFileSync('COMMANDS.md', lines.join('\n'));
console.log('Updated COMMANDS.md.');
