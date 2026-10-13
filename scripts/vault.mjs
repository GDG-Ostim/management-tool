import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { basename, dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = 'vault/context-index.json';
const slash = p => p.replaceAll('\\', '/');
const normalize = text => text.replaceAll('\r\n', '\n');

async function walk(dir, base = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.obsidian') continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, base));
    else files.push(slash(path.slice(base.length + 1)));
  }
  return files;
}

export function metadata(content) {
  const header = normalize(content).match(/^---\n([\s\S]*?)\n---\n/);
  const fields = {};
  if (!header) return fields;
  for (const line of header[1].split('\n')) {
    const match = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (match) fields[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
  return fields;
}

export function buildIndex(contents) {
  return [...contents].filter(([path]) => path.startsWith('vault/') && path.endsWith('.md'))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([path, content]) => {
      const m = metadata(content);
      return { path, alan: m.alan, ozet: m.ozet };
    });
}

export function validate(contents, paths, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  const notes = [...contents].filter(([p]) => p.startsWith('vault/') && p.endsWith('.md'));
  const notePaths = notes.map(([p]) => p);
  for (const required of ['vault/00 - Başlangıç.md', 'vault/Harita.md', 'vault/Sistem/AI Başlangıç.md']) {
    if (!paths.has(required)) errors.push(`Eksik başlangıç dosyası: ${required}`);
  }
  const titles = new Set();
  for (const [path, content] of notes) {
    const m = metadata(content);
    for (const field of ['tur', 'alan', 'guncelleme', 'ozet']) {
      if (!m[field]) errors.push(`${path}: eksik ${field}`);
    }
    const stamp = m.guncelleme;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(stamp ?? '') &&
      !Number.isNaN(Date.parse(stamp)) && new Date(stamp).toISOString().slice(0, 10) === stamp;
    if (!validDate || stamp > today) errors.push(`${path}: geçersiz/gelecek tarih`);
    if (Buffer.byteLength(content) > 25 * 1024) errors.push(`${path}: 25 KB sınırı`);
    const heading = normalize(content).match(/^# (.+)$/m)?.[1];
    if (!heading || titles.has(heading)) errors.push(`${path}: eksik/yinelenen ana başlık`);
    if (heading) titles.add(heading);
    for (const match of content.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
      const target = match[1].split('|')[0].split('#')[0].trim();
      if (!target) continue;
      const clean = target.replace(/\.md$/, '');
      const candidates = new Set([
        `vault/${target}`, `vault/${clean}.md`,
        posix.normalize(`${posix.dirname(path)}/${target}`),
        posix.normalize(`${posix.dirname(path)}/${clean}.md`),
      ]);
      const exact = [...candidates].some(p => p.startsWith('vault/') && paths.has(p));
      const matches = target.includes('/') ? [] : notePaths.filter(p => basename(p, '.md') === clean);
      if (!exact && matches.length !== 1) errors.push(`${path}: kırık/belirsiz wiki link ${target}`);
    }
  }
  for (const path of paths) {
    const name = basename(path);
    if ((name.startsWith('.env') && name !== '.env.example') || /\.(db|sqlite)(-|$)/.test(name) ||
      path.startsWith('secrets/') || /(^|\/)\.obsidian\/workspace/.test(path)) {
      errors.push(`Git kapsamına alınmaması gereken dosya: ${path}`);
    }
  }
  const expected = JSON.stringify(buildIndex(contents), null, 2) + '\n';
  if (normalize(contents.get(indexPath) ?? '') !== expected) errors.push('Bağlam indeksi eski/eksik: npm run vault:index');
  return errors;
}

export async function snapshot(staged = false, cwd = root) {
  let list;
  if (staged) {
    list = execFileSync('git', ['ls-files', '--cached', '-z'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
  } else {
    list = (await walk(resolve(cwd, 'vault'))).map(p => `vault/${p}`);
  }
  const paths = new Set(list);
  const contents = new Map();
  for (const path of list.filter(p => p.startsWith('vault/') && (p.endsWith('.md') || p === indexPath))) {
    const text = staged
      ? execFileSync('git', ['show', `:${path}`], { cwd, encoding: 'utf8' })
      : await readFile(resolve(cwd, path), 'utf8');
    contents.set(path, text);
  }
  return { contents, paths };
}

async function main() {
  const mode = process.argv[2] ?? 'check';
  if (!['check', 'index', 'staged'].includes(mode)) throw new Error(`Bilinmeyen mod: ${mode}`);
  const { contents, paths } = await snapshot(mode === 'staged');
  if (mode === 'index') {
    await writeFile(resolve(root, indexPath), JSON.stringify(buildIndex(contents), null, 2) + '\n');
    console.log(`Bağlam indeksi güncellendi: ${buildIndex(contents).length} not.`);
    return;
  }
  const errors = validate(contents, paths);
  if (errors.length) {
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
  } else console.log(`Vault ${mode}: ${buildIndex(contents).length} not, bağlantılar ve indeks doğrulandı.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
