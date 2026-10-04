import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const directory of ['src', 'scripts', 'test']) {
  for (const name of readdirSync(directory).filter(file => file.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', `${directory}/${name}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('Syntax checks passed.');
