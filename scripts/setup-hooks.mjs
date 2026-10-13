import { execFileSync } from 'node:child_process';
execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
console.log('Pre-commit hook etkin: staged vault ve bağlam indeksi doğrulanır.');
