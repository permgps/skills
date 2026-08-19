import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { scanDirectory, scanText, looksBinary } from './scan.ts';

type Tree = Record<string, string | Buffer>;

async function withTree(tree: Tree, body: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'redact-scan-'));
  try {
    for (const [name, body_] of Object.entries(tree)) {
      const target = path.join(root, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body_);
    }
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('looksBinary is decided by content, not by extension', () => {
  assert.equal(looksBinary(Buffer.from('# Just markdown\n', 'utf8')), false);
  assert.equal(looksBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d])), true);
});

test('scanText anchors a finding to its line and names the variable', () => {
  const violations = scanText('brief.md', 'line one\nDB_PASSWORD=s3cr3t-value\nline three\n');

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.file, 'brief.md');
  assert.equal(violations[0]?.line, 2);
  assert.match(violations[0]?.message ?? '', /DB_PASSWORD/);
  // The value itself never appears in a finding.
  assert.equal(violations[0]?.message.includes('s3cr3t-value'), false);
});

test('scanText finds a multi-line private key block', () => {
  const content = [
    '# notes',
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n');

  const violations = scanText('key.pem', content);
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /PRIVATE_KEY/);
});

test('a clean tree produces no findings', async () => {
  await withTree({
    'brief.md': '# Landing page\n\nТри секции. Ширина 1200px.\n',
    'tasks/01-hero.md': 'Build the hero. PORT=3000\n',
  }, async root => {
    const summary = await scanDirectory(root);
    assert.deepEqual(summary.violations, []);
    assert.equal(summary.filesScanned, 2);
  });
});

test('a tree with one secret reports it once, with a path relative to the root', async () => {
  await withTree({
    'brief.md': '# Landing page\n',
    'answers.md': 'They pasted:\nANTHROPIC_API_KEY=sk-ant-api03-AAAABBBBCCCCDDDDEEEE\n',
  }, async root => {
    const summary = await scanDirectory(root);

    assert.equal(summary.violations.length, 1);
    assert.equal(summary.violations[0]?.file, 'answers.md');
    assert.equal(summary.violations[0]?.line, 2);
    assert.match(summary.violations[0]?.message ?? '', /ANTHROPIC_API_KEY/);
  });
});

test('the sweep reports and never rewrites', async () => {
  const content = 'DB_PASSWORD=s3cr3t-value\n';
  await withTree({ 'answers.md': content }, async root => {
    await scanDirectory(root);
    // The file is exactly as it was: acting on the finding is S2's business.
    assert.equal(await readFile(path.join(root, 'answers.md'), 'utf8'), content);
  });
});

test('a binary file is skipped rather than decoded', async () => {
  await withTree({
    'brief.md': '# clean\n',
    'assets/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x0d]),
  }, async root => {
    const summary = await scanDirectory(root);

    assert.deepEqual(summary.violations, []);
    assert.equal(summary.filesScanned, 1);
    assert.equal(summary.filesSkipped, 1);
  });
});

test('a binary file containing something secret-shaped is still skipped', async () => {
  const payload = Buffer.concat([
    Buffer.from([0x00, 0x01, 0x02]),
    Buffer.from('DB_PASSWORD=s3cr3t-value', 'utf8'),
  ]);
  await withTree({ 'blob.bin': payload }, async root => {
    const summary = await scanDirectory(root);
    assert.deepEqual(summary.violations, []);
    assert.equal(summary.filesSkipped, 1);
  });
});

test('ignored directories are not walked', async () => {
  await withTree({
    'brief.md': '# clean\n',
    'node_modules/pkg/index.js': 'const API_TOKEN="aaaaaaaaaaaaaaaa";\n',
  }, async root => {
    const summary = await scanDirectory(root);
    assert.deepEqual(summary.violations, []);
    assert.equal(summary.filesScanned, 1);
  });
});

test('nested directories are walked and paths keep their nesting', async () => {
  await withTree({
    'tasks/03-checkout.md': 'STRIPE_SECRET_KEY=sk_live_AAAABBBBCCCCDDDDEEEE\n',
  }, async root => {
    const summary = await scanDirectory(root);
    assert.equal(summary.violations.length, 1);
    assert.equal(summary.violations[0]?.file, path.join('tasks', '03-checkout.md'));
  });
});

test('several findings in one file are reported per line', async () => {
  await withTree({
    'answers.md': 'DB_PASSWORD=first-secret-value\nAPI_TOKEN=second-secret-value\n',
  }, async root => {
    const summary = await scanDirectory(root);
    assert.deepEqual(summary.violations.map(v => v.line), [1, 2]);
  });
});

test('a single file can be swept directly', async () => {
  await withTree({ 'answers.md': 'DB_PASSWORD=s3cr3t-value\n' }, async root => {
    const summary = await scanDirectory(path.join(root, 'answers.md'));
    assert.equal(summary.filesScanned, 1);
    assert.equal(summary.violations.length, 1);
    assert.equal(summary.violations[0]?.file, 'answers.md');
  });
});

// --- regression: line numbers must survive a multi-line secret ---------------

test('a finding after a multi-line secret keeps its own line number', () => {
  // Reported by /aif-review: the private key block collapses to one line during
  // redaction, and every finding below it was reported six lines too high.
  const content = [
    'line 1',                          // 1
    '-----BEGIN RSA PRIVATE KEY-----', // 2
    'AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE',
    '-----END RSA PRIVATE KEY-----',   // 8
    'line 9',                          // 9
    'DB_PASSWORD=s3cr3t-value-here',   // 10
  ].join('\n');

  const violations = scanText('answers.md', content);

  assert.equal(violations.length, 2);
  assert.equal(violations[0]?.line, 2, 'the private key block starts on line 2');
  assert.equal(violations[1]?.line, 10, 'the password is on line 10 of the source');
});

test('two secrets separated by a multi-line block are both placed correctly', () => {
  const content = [
    'API_TOKEN=aaaaaaaaaaaa',          // 1
    '-----BEGIN PRIVATE KEY-----',     // 2
    'XXXX', 'YYYY',
    '-----END PRIVATE KEY-----',       // 5
    'DB_PASSWORD=s3cr3t-value-here',   // 6
  ].join('\n');

  assert.deepEqual(scanText('answers.md', content).map(v => v.line), [1, 2, 6]);
});

test('two secrets on one line are reported as a single finding naming both', () => {
  const violations = scanText('answers.md', 'DB_PASSWORD=s3cr3t-value-here API_TOKEN=aaaaaaaaaaaa\n');

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.line, 1);
  assert.match(violations[0]?.message ?? '', /DB_PASSWORD, API_TOKEN/);
});

test('a secret on the very first line is reported at line 1', () => {
  const violations = scanText('answers.md', 'DB_PASSWORD=s3cr3t-value-here\nrest\n');
  assert.equal(violations[0]?.line, 1);
});

test('CRLF line endings do not shift line numbers', () => {
  const content = 'one\r\ntwo\r\nDB_PASSWORD=s3cr3t-value-here\r\n';
  const violations = scanText('answers.md', content);

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.line, 3);
});

test('a secret on the last line without a trailing newline is located', () => {
  const violations = scanText('answers.md', 'one\ntwo\nDB_PASSWORD=s3cr3t-value-here');
  assert.equal(violations[0]?.line, 3);
});
