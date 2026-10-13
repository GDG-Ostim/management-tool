// Kullanıcı tarafından yetkilendirilmiş ilk MVP backlog kurulumu; tekrar çalıştırma mükerrer issue açmaz.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './vault.mjs';

const repo = 'GDG-Ostim/management-tool';
const gh = args => execFileSync('gh', args, { cwd: root, encoding: 'utf8' }).trim();
const tasks = JSON.parse(await readFile(resolve(root, 'scripts/issues.json'), 'utf8'));
const existing = JSON.parse(gh(['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '1000', '--json', 'number,title,body,url,assignees']));
const results = [];
await mkdir(resolve(root, '.tmp'), { recursive: true });
for (const task of tasks) {
  const marker = `<!-- ${task.key} -->`;
  let issue = existing.find(i => i.body.includes(marker));
  if (!issue) {
    const link = `https://github.com/${repo}/blob/main/vault/${task.note.split('/').map(encodeURIComponent).join('/')}`;
    const bodyFile = resolve(root, '.tmp', `${task.key}.md`);
    await writeFile(bodyFile, `${task.summary}\n\nPlan: [${task.note.replace(/\.md$/, '')}](${link})\n\n${marker}\n`);
    const url = gh(['issue', 'create', '--repo', repo, '--title', task.title, '--assignee', task.assignee, '--body-file', bodyFile]);
    issue = JSON.parse(gh(['issue', 'view', url, '--json', 'number,title,url,assignees']));
  }
  const item = JSON.parse(gh(['project', 'item-add', '1', '--owner', 'GDG-Ostim', '--url', issue.url, '--format', 'json']));
  // İlk backlog kurulumu için tüm yeni işler Yapılacak; mevcut işin ilerlemesini değiştirme.
  if (!existing.some(i => i.number === issue.number)) {
    gh(['project', 'item-edit', '--id', item.id, '--project-id', 'PVT_kwDOFBRV1M4Bm4mZ', '--field-id', 'PVTSSF_lADOFBRV1M4Bm4mZzhlfvIA', '--single-select-option-id', 'f75ad846']);
  }
  results.push({ ...task, number: issue.number, url: issue.url, itemId: item.id });
  await writeFile(resolve(root, '.tmp/issues-results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`${task.key}: #${issue.number} → ${task.assignee}`);
}
