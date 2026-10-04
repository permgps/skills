import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkReadme,
  DIAL_VALUES,
  extractLinks,
  findBrokenLinks,
  findOutlineDrift,
  findUnknownNpmScripts,
  findUnknownSyncFlags,
  headingSlugs,
  README_SECTIONS,
} from './readme-references.ts';

const PACKAGE = JSON.stringify({ scripts: { check: 'x', metrics: 'y', 'parity:workflow:prepare': 'z' } });
const HELPER = "if (args.includes('--reopen') || args.includes('--no-open')) {}\nconst EXPECT = '--expect';";

function outlineReadme(sections: readonly string[] = README_SECTIONS, dials: readonly string[] = DIAL_VALUES): string {
  return ['# Maestro', '', ...sections.flatMap(name => [
    `## ${name}`, '', name === 'Dials' ? dials.map(value => `\`${value}\``).join(' ') : 'Text.', '',
  ])].join('\n');
}

async function withDir(body: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'readme-references-'));
  try {
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('relative links and anchors are extracted, absolute URLs and links shown as code are not', () => {
  const links = extractLinks([
    'See [install](docs/install.md#codex-cli-and-app) and ![shot](docs/assets/a.png "title").',
    'Site: [web](https://example.com/x#y), mail [me](mailto:a@b.c), self [top](#quick-start).',
    'Example only: `[fake](missing.md)`',
    '```',
    '[also fake](missing.md)',
    '```',
  ].join('\n'));
  assert.deepEqual(links, [
    { target: 'docs/install.md', anchor: 'codex-cli-and-app', line: 1 },
    { target: 'docs/assets/a.png', anchor: null, line: 1 },
    { target: '', anchor: 'quick-start', line: 2 },
  ]);
});

test('heading slugs follow GitHub: punctuation dropped, Cyrillic kept, a repeated heading suffixed', () => {
  assert.deepEqual(headingSlugs([
    '## Optional: A Guard Against Destructive Git',
    '## The Отчёт',
    '## `sync.mts` flags',
    '## Notes — first',
    '## Notes — first',
    '```',
    '## not a heading',
    '```',
  ].join('\n')), [
    'optional-a-guard-against-destructive-git',
    'the-отчёт',
    'syncmts-flags',
    'notes--first',
    'notes--first-1',
  ]);
});

test('a missing file and a missing anchor are each reported, and a present one is not', async () => {
  await withDir(async root => {
    await mkdir(path.join(root, 'docs'));
    await writeFile(path.join(root, 'docs', 'page.md'), '# Page\n\n## Real Heading\n');
    const readme = path.join(root, 'README.md');
    const markdown = [
      '## Here',
      '[ok](docs/page.md#real-heading) [dir](docs/) [self](#here)',
      '[gone](docs/nope.md)',
      '[bad anchor](docs/page.md#unreal-heading) [bad self](#nowhere)',
    ].join('\n');
    await writeFile(readme, markdown);
    const violations = await findBrokenLinks(readme, markdown);
    assert.deepEqual(violations.map(v => [v.check, v.line]), [['links', 3], ['anchors', 4], ['anchors', 4]]);
  });
});

test('an npm script package.json does not define is reported with the line it is on', () => {
  const violations = findUnknownNpmScripts('npm run check\nrun `npm run metrics -- .maestro --json`\nnpm run lint', PACKAGE);
  assert.deepEqual(violations.map(v => [v.check, v.line]), [['npm', 3]]);
  assert.match(violations[0]?.message ?? '', /npm run lint/);
});

test('a script name with a colon is read whole, not cut at the colon', () => {
  assert.deepEqual(findUnknownNpmScripts('npm run parity:workflow:prepare', PACKAGE), []);
  assert.equal(findUnknownNpmScripts('npm run parity:browser', PACKAGE).length, 1);
});

test('a flag on a sync.mts line must be one the helper parses; flags on other lines are not its business', () => {
  const violations = findUnknownSyncFlags([
    'node .maestro/sync.mts --reopen',
    'node .maestro/sync.mts --no-open --expect x',
    'node .maestro/sync.mts --close',
    'npm run metrics -- --json',
  ].join('\n'), HELPER);
  assert.deepEqual(violations.map(v => [v.check, v.line]), [['flags', 3]]);
});

test('a README with every outline section in order and every dial value reports nothing', () => {
  assert.deepEqual(findOutlineDrift(outlineReadme()), []);
});

test('a missing section, a reordered section and an unnamed dial value are each reported', () => {
  const sections = README_SECTIONS.filter(name => name !== 'Scout');
  const swapped = [sections[1] ?? '', sections[0] ?? '', ...sections.slice(2)];
  const drift = findOutlineDrift(outlineReadme(swapped, DIAL_VALUES.filter(value => value !== 'deep')));
  assert.deepEqual(drift.map(v => v.check), ['outline', 'outline', 'dials']);
  assert.match(drift[0]?.message ?? '', /"## Scout"/);
  assert.match(drift[2]?.message ?? '', /`deep`/);
});

test('the real README links only to files and headings that exist, and names only real scripts and sync flags', async () => {
  const violations = await checkReadme();
  const references = violations.filter(v => v.check !== 'outline' && v.check !== 'dials');
  assert.deepEqual(references, []);
});

test('the real README carries the planned sections in order and names every dial value', async () => {
  const markdown = await readFile('README.md', 'utf8');
  assert.deepEqual(findOutlineDrift(markdown), []);
});
