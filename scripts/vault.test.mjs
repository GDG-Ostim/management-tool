import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildIndex, validate, snapshot } from './vault.mjs';

function fixture(extra = '') {
  const contents = new Map(['00 - Başlangıç', 'Harita', 'Sistem/AI Başlangıç'].map((p, i) =>
    [`vault/${p}.md`, `---\ntur: sistem\nalan: test\nguncelleme: 2026-10-13\nozet: "Kısa not"\n---\n# Başlık ${i}\n${i === 0 ? extra : ''}\n`]));
  contents.set('vault/context-index.json', JSON.stringify(buildIndex(contents), null, 2) + '\n');
  return contents;
}

test('Türkçe bağlantı ve görsel dosyası çözülür', () => {
  const contents = fixture('[[Harita]] ![[Tasarım/örnek.png]]');
  const paths = new Set([...contents.keys(), 'vault/Tasarım/örnek.png']);
  assert.deepEqual(validate(contents, paths, '2026-10-13'), []);
});

test('kırık bağlantı, bozuk tarih, stale index ve secret reddedilir', () => {
  const contents = fixture('[[Eksik]]');
  const path = 'vault/00 - Başlangıç.md';
  contents.set(path, contents.get(path).replace('2026-10-13', '2026-02-30').replace('Kısa not', 'Yeni özet'));
  const errors = validate(contents, new Set([...contents.keys(), '.env']), '2026-10-13');
  assert.ok(errors.some(e => e.includes('kırık')));
  assert.ok(errors.some(e => e.includes('tarih')));
  assert.ok(errors.some(e => e.includes('indeksi')));
  assert.ok(errors.some(e => e.includes('.env')));
});

test('unstaged düzeltme staged bozuk notu gizlemez', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gdg-vault-test-'));
  try {
    execFileSync('git', ['init', '--quiet', dir]);
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: dir });
    const contents = fixture('[[Eksik]]');
    for (const [path, text] of contents) {
      await mkdir(join(dir, path, '..'), { recursive: true });
      await writeFile(join(dir, path), text);
    }
    execFileSync('git', ['add', '.'], { cwd: dir });
    await writeFile(join(dir, 'vault/00 - Başlangıç.md'), contents.get('vault/00 - Başlangıç.md').replace('[[Eksik]]', '[[Harita]]'));
    const staged = await snapshot(true, dir);
    const current = await snapshot(false, dir);
    assert.ok(validate(staged.contents, staged.paths, '2026-10-13').some(e => e.includes('kırık')));
    assert.deepEqual(validate(current.contents, current.paths, '2026-10-13'), []);
  } finally {
    const target = resolve(dir);
    if (!target.startsWith(resolve(tmpdir()) + sep + 'gdg-vault-test-')) throw new Error('Güvensiz test temizleme yolu');
    await rm(dir, { recursive: true, force: true });
  }
});
