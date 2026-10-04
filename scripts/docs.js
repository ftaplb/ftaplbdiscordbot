import fs from 'node:fs';
import { commands } from '../src/commands.js';

const lines = ['# Command reference', '', `${commands.size} commands. The default prefix is \`$\`; replace it with your server’s prefix if changed.`, '', 'Staff means a configured staff role. The home server starts with roles `1541427910198427809` and `1538609206763061308`.', '', 'Evaluators get `setrank` and `removerank` only, plus public commands. Editors can also use `rank`, `promote`, and `demote`. Access lists, prefix, and channel selection require Administrator. Only home-server administrators can manage enabled servers.', ''];
const labels = { staff: 'Staff', admin: 'Administrator', homeadmin: 'Home-server administrator', editor: 'Editor or staff', rank: 'Evaluator, editor, or staff', public: 'Everyone' };
for (const category of new Set([...commands.values()].map(entry => entry.category))) {
  lines.push(`## ${category}`, '', '| Command | What it does | Access |', '| --- | --- | --- |');
  for (const entry of commands.values()) {
    if (entry.category !== category) continue;
    const usage = `$${entry.name}${entry.usage ? ` ${entry.usage}` : ''}`.replaceAll('|', '\\|');
    const access = labels[entry.access];
    lines.push(`| \`${usage}\` | ${entry.description} | ${access} |`);
  }
  lines.push('');
}
lines.push('## Rank aliases', '', '| Rank | Alias |', '| --- | --- |', '| Fling God | `fg` |', '| Advanced I / II / III | `adv1` / `adv2` / `adv3` |', '| Expert I / II / III | `e1` / `e2` / `e3` |', '| Skillful I / II / III | `sk1` / `sk2` / `sk3` |', '| Apprentice | `app` |', '| Casual | `cas` |', '', 'Numbered full names work too: `$setrank @member skillful 1`. A unique one-character typo is accepted; ambiguous or unknown names are rejected.', '', '`$removerank @member skillful` removes Skillful I–III only. `$removerank @member e1` removes Expert I only. Omit the rank to remove all game ranks. Unrelated roles stay unchanged.', '', 'For `$restore`, choose a local backup ID from `$backups`. Undo/redo/restore do not alter Discord roles, the selected board channel, the prefix, or access lists.', '');
fs.writeFileSync('COMMANDS.md', lines.join('\n'));
console.log('Updated COMMANDS.md.');
