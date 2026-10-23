// Holds every scenario fixture under `scripts/validate/fixtures/` to a mention
// in the specification's README.
//
// A `scenarios.mts` is the input of a fresh-context reading, not of a check
// `npm run check` runs, so nothing else ever opens it: a fixture the README does
// not name is one a maintainer cannot find or rerun. Two of four had drifted
// out of it by 2026-10-23 (patch 2026-10-23-15.27). The set is enumerated from
// the directory rather than listed here, so a new fixture is held the moment it
// exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const SPEC_README = new URL('../../docs/spec/README.md', import.meta.url);

/** Every `scripts/validate/fixtures/<name>/scenarios.mts`, as the README would cite it. */
async function scenarioFixtures(): Promise<string[]> {
  const entries = await readdir(fileURLToPath(FIXTURES), { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const files = await readdir(fileURLToPath(new URL(`${entry.name}/`, FIXTURES)));
    if (files.includes('scenarios.mts')) found.push(`scripts/validate/fixtures/${entry.name}/scenarios.mts`);
  }
  return found.sort();
}

test('every scenario fixture is named in the specification README, so a maintainer can find and rerun it', async () => {
  const fixtures = await scenarioFixtures();
  assert.ok(fixtures.length > 0, 'no scenarios.mts found under scripts/validate/fixtures');
  const readme = (await readFile(fileURLToPath(SPEC_README), 'utf8')).replace(/\s+/g, ' ');
  const unnamed = fixtures.filter(fixture => !readme.includes(`\`${fixture}\``));
  assert.deepEqual(unnamed, [], `docs/spec/README.md names none of: ${unnamed.join(', ')} — add a paragraph beside the other scenario fixtures`);
});
