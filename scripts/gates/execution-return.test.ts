import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkExecutionReturns, parseExecutionReturns, RETURN_FORMAT } from './execution-return.ts';

const SCRIPT = fileURLToPath(new URL('./execution-return.ts', import.meta.url));
const HASH = 'a'.repeat(64);
const RED_HASH = 'b'.repeat(64);

const RED_RUN = [
  'red:',
  '  against: stub of cartTotal(items: Item[]): number',
  '  invocation: node --test tests/cart.test.ts',
  '  exitCode: 1',
  '  failedAssertion: total includes the delivery fee',
  `  capture: captures/C03-red.txt sha256 ${RED_HASH}`,
];

/** One block in the shape `prompts/executor.md` ships, with the parts a test varies. */
function block({
  result = 'passed',
  exitCode = '0',
  assertions = ['total includes the delivery fee: passed'],
  red = RED_RUN as string[] | null,
  cause = null as string | null,
  limitation = null as string | null,
  commit = '4f2c9e1',
  drop = [] as string[],
}: {
  result?: string; exitCode?: string; assertions?: string[]; red?: string[] | null;
  cause?: string | null; limitation?: string | null; commit?: string; drop?: string[];
} = {}): string {
  const lines = [
    '```text',
    `format: ${RETURN_FORMAT}`,
    'checkId: C03',
    `result: ${result}`,
    'invocation: node --test tests/cart.test.ts',
    `exitCode: ${exitCode}`,
    'tool: node --test 22.18.0',
    'host: darwin-arm64, local',
    'readinessId: RD01',
    'fingerprint: reference ref-1, build 4f2c9e1, runtime node 22.18.0',
    'assertions:',
    ...assertions.map(assertion => `- ${assertion}`),
    ...(red ?? []),
    'captures:',
    `- captures/C03.txt sha256 ${HASH}`,
    `commit: ${commit}`,
    ...(cause === null ? [] : [`failureCause: ${cause}`]),
    ...(limitation === null ? [] : [`limitation: ${limitation}`]),
    '```',
  ];
  return lines.filter(line => !drop.some(label => line.startsWith(`${label}:`))).join('\n');
}

const check = (markdown: string) => checkExecutionReturns(parseExecutionReturns(markdown), 'return.md');
const rules = (markdown: string): string[] => check(markdown).map(violation => violation.check);

test('a complete passed block with a red run on a named assertion is accepted', () => {
  assert.deepEqual(check(block()), []);
});

test('a synthetic return whose passed block has no red field is refused on that block', () => {
  const markdown = `What now exists: the cart total.\n\n${block({ red: null })}\n`;
  const violations = check(markdown);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]!.check, 'red-missing');
  assert.equal(violations[0]!.line, 3);
  assert.match(violations[0]!.message, /^C03: .*never seen failing/);
});

test('a red run that exited 0 is refused', () => {
  const red = RED_RUN.map(line => line.replace('exitCode: 1', 'exitCode: 0'));
  assert.deepEqual(rules(block({ red })), ['red-invalid']);
});

test('a red run that failed on no assertion of the block is refused', () => {
  const red = RED_RUN.map(line => line.replace(
    'failedAssertion: total includes the delivery fee', 'failedAssertion: Cannot find module ../src/cart'));
  const violations = check(block({ red }));
  assert.deepEqual(violations.map(violation => violation.check), ['red-invalid']);
  assert.match(violations[0]!.message, /not red/);
});

test('a red run that names neither a stub, a base nor a parent is refused', () => {
  for (const against of ['4f2c9e1', 'the implementation', 'base', 'stub of']) {
    const red = RED_RUN.map(line => line.startsWith('  against:') ? `  against: ${against}` : line);
    assert.deepEqual(rules(block({ red })), ['red-invalid'], against);
  }
});

test('a red run against the base commit, or a repair\'s parent commit, is accepted', () => {
  for (const against of ['base 1a2b3c4', 'parent 9f8e7d6c5b4a']) {
    const red = RED_RUN.map(line => line.startsWith('  against:') ? `  against: ${against}` : line);
    assert.deepEqual(check(block({ red })), [], against);
  }
});

test('a red capture without a SHA-256 is refused', () => {
  const red = RED_RUN.map(line => line.startsWith('  capture:') ? '  capture: captures/C03-red.txt' : line);
  assert.deepEqual(rules(block({ red })), ['red-invalid']);
});

test('a red run missing its fields names each one it lacks', () => {
  const violations = check(block({ red: ['red:', '  exitCode: 1'] }));
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.message, /lacks against, invocation, failedAssertion, capture/);
});

test('a skipped or a pending result is refused with the sentence that says what to report instead', () => {
  for (const result of ['skipped', 'pending']) {
    const violations = check(block({ result }));
    assert.deepEqual(violations.map(violation => violation.check), ['skip-is-not-pass'], result);
    assert.match(violations[0]!.message, /`unavailable` with its cause, never as `passed`/);
  }
});

test('a passed block with a skipped assertion is refused as a skip, not as a pass', () => {
  const assertions = ['total includes the delivery fee: passed', 'total rounds to kopecks: skipped'];
  assert.deepEqual(rules(block({ assertions })), ['skip-is-not-pass']);
});

test('a passed block whose run exited non-zero is refused', () => {
  assert.deepEqual(rules(block({ exitCode: '1' })), ['passed-with-failure']);
});

test('a passed block with a failed assertion is refused', () => {
  const assertions = ['total includes the delivery fee: passed', 'total rounds to kopecks: failed'];
  assert.deepEqual(rules(block({ assertions })), ['passed-with-failure']);
});

test('an unavailable block with a setup cause, a limitation and no red run is accepted', () => {
  const markdown = block({
    result: 'unavailable', exitCode: '0', assertions: [], cause: 'setup',
    limitation: 'tests/cart.test.ts skipped 2 tests: the fixture data/prices.json is ignored by git',
    red: ['red: not applicable — unavailable'],
  });
  assert.deepEqual(check(markdown), []);
});

test('an unavailable block caused by the product is refused', () => {
  const markdown = block({
    result: 'unavailable', assertions: [], cause: 'product', limitation: 'no browser',
    red: ['red: not applicable — unavailable'],
  });
  assert.deepEqual(rules(markdown), ['cause']);
});

test('an unavailable block without a limitation is refused', () => {
  const markdown = block({
    result: 'unavailable', assertions: [], cause: 'unavailable_capability',
    red: ['red: not applicable — unavailable'],
  });
  assert.deepEqual(rules(markdown), ['cause']);
});

test('a failed block names its cause and keeps its red run', () => {
  const assertions = ['total includes the delivery fee: failed'];
  assert.deepEqual(check(block({ result: 'failed', exitCode: '1', assertions, cause: 'product' })), []);
  assert.deepEqual(rules(block({ result: 'failed', exitCode: '1', assertions })), ['cause']);
});

test('red not applicable because unavailable, on a passed block, is refused', () => {
  assert.deepEqual(rules(block({ red: ['red: not applicable — unavailable'] })), ['red-not-applicable']);
});

test('red not applicable for an existing check the executor only ran is accepted', () => {
  assert.deepEqual(check(block({ red: ['red: not applicable — existing check tests/cart.test.ts'] })), []);
});

test('red not applicable for any other reason, or an existing check with no path, is refused', () => {
  for (const red of ['red: not applicable — trivial', 'red: not applicable — existing check']) {
    assert.deepEqual(rules(block({ red: [red] })), ['red-not-applicable'], red);
  }
});

test('a block missing its commit is one incomplete violation, never a partial pass', () => {
  const violations = check(block({ drop: ['commit'] }));
  assert.deepEqual(violations.map(violation => violation.check), ['incomplete']);
  assert.match(violations[0]!.message, /lacks commit/);
});

test('a result outside the return results is refused, including the orchestrator-only ones', () => {
  for (const result of ['stale', 'not_run', 'green']) {
    assert.deepEqual(rules(block({ result })), ['result'], result);
  }
});

test('two blocks in one return are checked independently and prose outside a fence is ignored', () => {
  const markdown = [
    'Check results:',
    'red: this prose line is not a field',
    block(),
    '',
    '```ts',
    'export const total = 0;',
    '```',
    block({ red: null }),
  ].join('\n');
  const blocks = parseExecutionReturns(markdown);
  assert.equal(blocks.length, 2);
  const violations = checkExecutionReturns(blocks, 'return.md');
  assert.deepEqual(violations.map(violation => [violation.check, violation.line]), [['red-missing', blocks[1]!.line]]);
});

test('a block fenced inside a numbered list reads the same as one at the margin', () => {
  const indented = block().split('\n').map(line => `   ${line}`).join('\n');
  const markdown = `5. **Check results and captures**\n\n${indented}\n`;
  assert.equal(parseExecutionReturns(markdown).length, 1);
  assert.deepEqual(check(markdown), []);
});

test('CRLF line endings read the same as LF', () => {
  assert.deepEqual(check(block({ red: null }).replace(/\n/g, '\r\n')).map(violation => violation.check), ['red-missing']);
});

async function runCli(content: string | null): Promise<{ status: number | null; stdout: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'execution-return-'));
  try {
    const file = path.join(dir, 'return.md');
    if (content !== null) await writeFile(file, content);
    const done = spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
    return { status: done.status, stdout: done.stdout };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('the CLI exits 1 on a return whose block was never seen failing, and prints the finding', async () => {
  const { status, stdout } = await runCli(block({ red: null }));
  assert.equal(status, 1);
  assert.match(stdout, /\[red-missing\]/);
});

test('the CLI exits 0 on a clean return', async () => {
  const { status, stdout } = await runCli(block());
  assert.equal(status, 0);
  assert.match(stdout, /OK \(1 block/);
});

test('the CLI exits 1 on a return that holds no block at all', async () => {
  const { status } = await runCli('All checks passed.\n');
  assert.equal(status, 1);
});

test('the CLI exits 2 on a path it cannot read', async () => {
  const { status } = await runCli(null);
  assert.equal(status, 2);
});
