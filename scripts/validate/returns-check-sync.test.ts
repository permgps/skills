// `sync.mts --returns-check`: build step 1's mechanical half, run on every
// executor return before anything in it is read.
//
// Driven through the copied `sync.mts` inside a real temporary project, the way
// commits-check-sync.test.ts drives it, over a real repository and real capture
// files. Each test is one rule of decision D3 in the plan "A Return Is Checked
// At Intake": the parser's own rules, a commit or red run that is not the
// handed base, an existing check the base does not hold, a capture that is
// missing, altered or outside the worktree, and a git that cannot answer. The
// check is read-only, so one test holds the whole project byte for byte.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RETURN_FORMAT } from '../../skills/maestro/tools/runtime/execution-return.mts';

const SYNC = 'skills/maestro/tools/sync.mts';

const hasGit = spawnSync('git', ['--version']).status === 0;
const needsGit = { skip: hasGit ? false : 'git is not on PATH' };

interface Finding { rule: string; checkId: string | null; line: number; message: string }
interface Unchecked { checkId: string | null; fact: string; reason: string }
type Outcome = { ok?: boolean; blocks?: number; findings?: Finding[]; unchecked?: Unchecked[]; error?: string; code: number };

interface Project {
  root: string;
  base: string;
  /** A second commit on top of the base: a sha the executor was not handed. */
  later: string;
  capture(relative: string, body: string): Promise<string>;
  check(returnText: string | null, args?: string[], env?: NodeJS.ProcessEnv): Promise<Outcome>;
  dispose(): Promise<void>;
}

const sha256 = (body: string): string => createHash('sha256').update(body).digest('hex');

async function project(): Promise<Project> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-returns-check-'));
  const maestro = path.join(root, '.maestro');
  await mkdir(maestro);
  await copyFile(SYNC, path.join(maestro, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(maestro, 'runtime'), { recursive: true });

  const git = (...args: string[]): string => {
    const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
    return done.stdout.trim();
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Returns Check Test');
  appendFileSync(path.join(root, '.git', 'info', 'exclude'), '.maestro/\nreturns/\ncaptures/\n');
  await mkdir(path.join(root, 'tests'));
  await writeFile(path.join(root, 'tests', 'old.test.ts'), 'export {};\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  await writeFile(path.join(root, 'tests', 'later.test.ts'), 'export {};\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'later');
  const later = git('rev-parse', 'HEAD');
  git('checkout', '-q', base);

  return {
    root, base, later,
    async capture(relative, body) {
      const file = path.join(root, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
      return sha256(body);
    },
    async check(returnText, args = ['--root', root, '--base', base], env = process.env) {
      const file = path.join(root, 'returns', 'T03.md');
      if (returnText !== null) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, returnText);
      }
      const done = spawnSync(process.execPath, [path.join(maestro, 'sync.mts'), '--returns-check', file, ...args],
        { encoding: 'utf8', env: { ...env, MAESTRO_SYNC_NO_OPEN: '1' } });
      return { ...JSON.parse(done.stdout.split('\n')[0] || '{}') as Record<string, unknown>, code: done.status ?? -1 };
    },
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}

/** One block in the template's shape, red run against the base unless a test says otherwise. */
function block(options: {
  commit: string; capture: string; redCapture: string;
  against?: string; red?: string[]; captures?: string[];
}): string {
  const red = options.red ?? [
    'red:',
    `  against: ${options.against}`,
    '  invocation: node --test tests/cart.test.ts',
    '  exitCode: 1',
    '  failedAssertion: total includes the delivery fee',
    `  capture: captures/C03-red.txt sha256 ${options.redCapture}`,
  ];
  return [
    'What now exists: the cart total.',
    '',
    '```text',
    `format: ${RETURN_FORMAT}`,
    'checkId: C03',
    'result: passed',
    'invocation: node --test tests/cart.test.ts',
    'exitCode: 0',
    'tool: node --test 22.18.0',
    'host: darwin-arm64, local',
    'readinessId: RD01',
    'fingerprint: reference ref-1, runtime node 22.18.0',
    'assertions:',
    '- total includes the delivery fee: passed',
    ...red,
    'captures:',
    ...(options.captures ?? [`- captures/C03.txt sha256 ${options.capture}`]),
    `commit: ${options.commit}`,
    '```',
    '',
  ].join('\n');
}

async function cleanBlock(target: Project, overrides: Partial<Parameters<typeof block>[0]> = {}): Promise<string> {
  const capture = await target.capture('captures/C03.txt', 'ok 1 total includes the delivery fee\n');
  const redCapture = await target.capture('captures/C03-red.txt', 'not ok 1 total includes the delivery fee\n');
  return block({ commit: target.base.slice(0, 7), capture, redCapture, against: `base ${target.base.slice(0, 7)}`, ...overrides });
}

const rules = (outcome: Outcome): string[] => (outcome.findings ?? []).map(finding => finding.rule);

test('a clean return against the handed base exits 0 with nothing found and nothing unchecked', needsGit, async () => {
  const target = await project();
  try {
    const outcome = await target.check(await cleanBlock(target));
    assert.equal(outcome.code, 0);
    assert.deepEqual({ ok: outcome.ok, blocks: outcome.blocks, findings: outcome.findings, unchecked: outcome.unchecked },
      { ok: true, blocks: 1, findings: [], unchecked: [] });
  } finally { await target.dispose(); }
});

test('a block the parser refuses is refused here with the same rule', needsGit, async () => {
  const target = await project();
  try {
    const outcome = await target.check(await cleanBlock(target, { red: [] }));
    assert.equal(outcome.code, 1);
    assert.deepEqual(rules(outcome), ['red-missing']);
    assert.equal(outcome.findings![0]!.checkId, 'C03');
  } finally { await target.dispose(); }
});

test('a return that holds no block at all is refused, never read as nothing to refuse', needsGit, async () => {
  const target = await project();
  try {
    const outcome = await target.check('All checks passed.\n');
    assert.equal(outcome.code, 1);
    assert.deepEqual(rules(outcome), ['no-block']);
  } finally { await target.dispose(); }
});

test('a таск that owns no check returns no block, and --owns-no-check accepts that', needsGit, async () => {
  const target = await project();
  try {
    const outcome = await target.check('Implemented the search page; T07 runs its checks.\n',
      ['--root', target.root, '--base', target.base, '--owns-no-check']);
    assert.equal(outcome.code, 0, JSON.stringify(outcome));
    assert.deepEqual(rules(outcome), []);
    assert.equal(outcome.blocks, 0);
  } finally { await target.dispose(); }
});

test('--owns-no-check still checks a block the таск returned anyway', needsGit, async () => {
  const target = await project();
  try {
    const outcome = await target.check(await cleanBlock(target, { red: [] }),
      ['--root', target.root, '--base', target.base, '--owns-no-check']);
    assert.equal(outcome.code, 1);
    assert.deepEqual(rules(outcome), ['red-missing']);
  } finally { await target.dispose(); }
});

test('a commit that is not the handed base is refused', needsGit, async () => {
  const target = await project();
  try {
    const outcome = await target.check(await cleanBlock(target, { commit: target.later.slice(0, 7) }));
    assert.equal(outcome.code, 1);
    assert.deepEqual(rules(outcome), ['commit-not-base']);
  } finally { await target.dispose(); }
});

test('a red run against a commit that is not the handed base is refused, by base or by parent', needsGit, async () => {
  const target = await project();
  try {
    for (const word of ['base', 'parent']) {
      const outcome = await target.check(await cleanBlock(target, { against: `${word} ${target.later.slice(0, 9)}` }));
      assert.equal(outcome.code, 1, word);
      assert.deepEqual(rules(outcome), ['red-against-not-base'], word);
    }
    const stub = await target.check(await cleanBlock(target, { against: 'stub of cartTotal(items: Item[]): number' }));
    assert.equal(stub.code, 0);
  } finally { await target.dispose(); }
});

test('an existing check the base does not hold is refused, and one it holds is accepted', needsGit, async () => {
  const target = await project();
  try {
    await target.capture('tests/new.test.ts', 'export {};\n');
    const added = await target.check(await cleanBlock(target, { red: ['red: not applicable — existing check tests/new.test.ts'] }));
    assert.equal(added.code, 1);
    assert.deepEqual(rules(added), ['existing-check-new']);
    const held = await target.check(await cleanBlock(target, { red: ['red: not applicable — existing check tests/old.test.ts'] }));
    assert.equal(held.code, 0);
  } finally { await target.dispose(); }
});

test('a capture that is missing, or whose bytes are not the hash it declares, is refused', needsGit, async () => {
  const target = await project();
  try {
    const text = await cleanBlock(target);
    await target.capture('captures/C03.txt', 'ok 1 rewritten afterwards\n');
    const altered = await target.check(text);
    assert.equal(altered.code, 1);
    assert.deepEqual(rules(altered), ['capture-hash-mismatch']);

    await rm(path.join(target.root, 'captures', 'C03-red.txt'));
    const missing = await target.check(text);
    assert.deepEqual(rules(missing).sort(), ['capture-hash-mismatch', 'capture-missing']);
  } finally { await target.dispose(); }
});

test('a capture outside the worktree is refused without being read', needsGit, async () => {
  const target = await project();
  try {
    const outcome = await target.check(await cleanBlock(target, { captures: [`- ../outside.txt sha256 ${'c'.repeat(64)}`] }));
    assert.equal(outcome.code, 1);
    assert.deepEqual(rules(outcome), ['capture-outside-root']);
  } finally { await target.dispose(); }
});

test('a git that is not on PATH leaves the base facts unchecked and refuses nothing on that ground', needsGit, async () => {
  const target = await project();
  try {
    const outcome = await target.check(await cleanBlock(target), undefined, { ...process.env, PATH: '' });
    assert.equal(outcome.code, 0);
    assert.deepEqual(outcome.findings, []);
    assert.deepEqual(outcome.unchecked!.map(item => item.fact).sort(), ['commit', 'red.against']);
    assert.match(outcome.unchecked![0]!.reason, /git/);
  } finally { await target.dispose(); }
});

test('without a base, the facts that need one are unchecked and the captures are still read', needsGit, async () => {
  const target = await project();
  try {
    const text = await cleanBlock(target);
    await target.capture('captures/C03.txt', 'ok 1 rewritten afterwards\n');
    const outcome = await target.check(text, ['--root', target.root]);
    assert.deepEqual(rules(outcome), ['capture-hash-mismatch']);
    assert.deepEqual(outcome.unchecked!.map(item => item.fact).sort(), ['commit', 'red.against']);
  } finally { await target.dispose(); }
});

test('no return file, or one that cannot be read, exits 2 with the reason', needsGit, async () => {
  const target = await project();
  try {
    const unreadable = await target.check(null);
    assert.equal(unreadable.code, 2);
    assert.match(unreadable.error ?? '', /cannot read/);
    const done = spawnSync(process.execPath, [path.join(target.root, '.maestro', 'sync.mts'), '--returns-check'],
      { encoding: 'utf8', env: { ...process.env, MAESTRO_SYNC_NO_OPEN: '1' } });
    assert.equal(done.status, 2);
  } finally { await target.dispose(); }
});

async function snapshot(root: string): Promise<string> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter(entry => entry.isFile() && !entry.parentPath.includes(`${path.sep}.git`))
    .map(entry => path.join(entry.parentPath, entry.name)).sort();
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update(await readFile(file));
  return hash.digest('hex');
}

test('the check writes nothing anywhere in the project', needsGit, async () => {
  const target = await project();
  try {
    const text = await cleanBlock(target, { commit: target.later.slice(0, 7) });
    await target.check(text);
    const before = await snapshot(target.root);
    await target.check(text);
    assert.equal(await snapshot(target.root), before);
  } finally { await target.dispose(); }
});

test('intermittent sample intake requires all attribution fields while preserving ordinary returns', needsGit, async () => {
  const target = await project();
  try {
    const ordinary = await cleanBlock(target);
    const partial = ordinary.replace('checkId: C03', 'checkId: C03\nintermittentPlanId: IP-1');
    assert.ok(rules(await target.check(partial)).includes('intermittent-attribution'));
    const attributed = ordinary.replace('checkId: C03', [
      'checkId: C03', 'intermittentPlanId: IP-1', 'intermittentScenario: original',
      'intermittentPhase: candidate', 'intermittentSample: 2', 'intermittentElapsedMs: 20',
    ].join('\n'));
    assert.equal((await target.check(attributed)).code, 0);
    assert.ok(rules(await target.check(attributed.replace('intermittentSample: 2', 'intermittentSample: 0'))).includes('intermittent-attribution'));
    assert.ok(rules(await target.check(attributed.replace('intermittentElapsedMs: 20', 'intermittentElapsedMs: NaN'))).includes('intermittent-attribution'));
    assert.equal((await target.check(ordinary)).code, 0);
  } finally { await target.dispose(); }
});
