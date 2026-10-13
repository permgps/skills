// An executor's `maestro-execution-return/1` blocks, read by label, and the
// findings that keep a block from being imported as a result.
//
// The rule it exists for: a check that was never seen failing proves nothing,
// so every block that ran a check carries a `red:` run — the same check failing
// on one of its named assertions before the implementation landed. A block
// without one is refused, however green the rest of it is.
//
// This lives in the shipped runtime because a rule held only by repository
// tooling is a rule a прогон does not have. An outside report (2026-10-13)
// found formal acceptance dragging on tests nobody had seen fail: the parser
// existed, but nothing in a run called it, so a missing red run was caught only
// by the reviewer, a whole phase later. Build step 1 now runs it on every
// return before reading anything else (`--returns-check`).
//
// What the parser does not check, because it never sees the worktree:
// whether `commit` and the red run's `against` name the base the таск was
// handed, whether an existing check pre-dates the таск, and whether each
// capture exists with its hash. `--returns-check` checks those against the
// worktree and git. What nothing here can check — whether the red run truly
// came before the implementation, and whether an assertion recomputes what the
// implementation computes — is the reviewer's, against the diff.
//
// Contract: docs/spec/phases.md, "Tests An Executor Writes";
// docs/spec/verification.md, "Attribution and Dispatch".

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { runGit } from './history.mts';
import { CHECK_RESULTS, FAILURE_CAUSES, type CheckResult } from './state/contract.mts';
import { createLogger } from './shared/log.mts';

const log = createLogger('execution-return');

/** The first line of every block an executor returns, one block per check. */
export const RETURN_FORMAT = 'maestro-execution-return/1';

/** Labels a block must carry whatever its result; `red` has rules of its own. */
export const REQUIRED_LABELS = [
  'checkId', 'result', 'invocation', 'exitCode', 'tool', 'host',
  'readinessId', 'fingerprint', 'assertions', 'captures', 'commit',
] as const;

/** The only two reasons a block may give for having no red run. */
export const RED_NOT_APPLICABLE = ['existing check', 'unavailable'] as const;

// `not_run` and `stale` are states the orchestrator gives an execution in the
// run state. An executor that ran nothing returns `unavailable` with a cause,
// and staleness is decided after import, so neither is a result a return
// may carry.
const RETURN_RESULTS: readonly CheckResult[] =
  CHECK_RESULTS.filter(result => result !== 'not_run' && result !== 'stale');

// The causes `closure.mts` accepts on an unavailable execution. Repeated here
// rather than imported, because the runtime states them as a rule, not as a
// constant; `scripts/state/readiness.test.ts` holds the runtime side.
const UNAVAILABLE_CAUSES = ['setup', 'unavailable_capability'] as const;

// Words a test runner uses for a test it did not run. None of them is a result.
const SKIP_WORDS = ['skipped', 'skip', 'pending', 'todo'];

export interface ReturnAssertion {
  name: string;
  /** As written; anything other than `passed` or `failed` is a finding. */
  result: string;
}

export interface ReturnCapture {
  path: string;
  /** Empty when the line carries no `sha256 <hex>`. */
  sha256: string;
}

export interface RedRun {
  against: string | null;
  invocation: string | null;
  exitCode: string | null;
  failedAssertion: string | null;
  capture: ReturnCapture | null;
}

export type RedField =
  | { kind: 'run'; run: RedRun }
  | { kind: 'not-applicable'; reason: string };

export interface ExecutionReturnBlock {
  /** 1-based line of the opening fence. */
  line: number;
  /** Every scalar label as written, trimmed; a list label maps to ''. */
  labels: Map<string, string>;
  assertions: ReturnAssertion[];
  captures: ReturnCapture[];
  /** `null` when the block carries no `red:` label at all. */
  red: RedField | null;
  /** True when the red run's fields sat at the block's own indent, not under `red:`. */
  redUnindented: boolean;
}

/** One reason a block cannot be imported, in the runtime's own shape. */
export interface ReturnFinding {
  rule: string;
  /** The block's `checkId`, or `null` when it carries none. */
  checkId: string | null;
  /** 1-based line of the block's opening fence; 0 for the file as a whole. */
  line: number;
  message: string;
}

const FENCE = /^(\s*)(`{3,}|~{3,})/;
const LABEL = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/;
const SUB_LABEL = /^\s{2,}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/;
const ITEM = /^\s*-\s+(.*)$/;
const CAPTURE = /^(.*?)\s+sha256\s+(\S+)\s*$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
// An exit code as a process returns it; `Number()` alone would read "abc" as
// non-zero and accept a red run that never reported one.
const EXIT_CODE = /^-?\d+$/;
const NOT_APPLICABLE = /^not applicable\s*[—–-]+\s*(.*)$/i;
// The one allowed reason that carries a path. Whitespace after "check" is
// required, so "existing checks foo" is not read as "existing check s foo".
const EXISTING_CHECK = /^existing check\s+(\S.*)$/i;
// Labels only a red run has. Seen at the block's own indent right under an
// empty `red:`, they are a run written without its indent; `invocation` and
// `exitCode` are block labels too, so they join the run only after one of these.
const RED_ONLY_LABELS = ['against', 'failedAssertion', 'capture'];

/** The path an `existing check <path>` reason names, or `null` for any other reason. */
export function existingCheckPath(reason: string): string | null {
  const match = EXISTING_CHECK.exec(reason.trim());
  return match ? match[1]!.trim() : null;
}

function toAssertion(text: string): ReturnAssertion {
  // The name may itself carry a colon; the result is the last word after one.
  const split = text.lastIndexOf(':');
  if (split < 0) return { name: text.trim(), result: '' };
  return { name: text.slice(0, split).trim(), result: text.slice(split + 1).trim().toLowerCase() };
}

function toCapture(text: string): ReturnCapture {
  const match = CAPTURE.exec(text.trim());
  if (!match) return { path: text.trim(), sha256: '' };
  return { path: match[1]!.trim(), sha256: match[2]!.trim() };
}

function emptyRun(): RedRun {
  return { against: null, invocation: null, exitCode: null, failedAssertion: null, capture: null };
}

/** Read the body of one fence, already known to open with the format line. */
function readBlock(lines: readonly string[], line: number): ExecutionReturnBlock {
  const block: ExecutionReturnBlock = {
    line, labels: new Map(), assertions: [], captures: [], red: null, redUnindented: false,
  };
  let list: 'assertions' | 'captures' | null = null;
  let inRed = false;

  for (const text of lines) {
    if (text.trim() === '') continue;

    if (inRed && block.red?.kind === 'run') {
      const sub = SUB_LABEL.exec(text);
      const flat = sub ? null : LABEL.exec(text);
      const unindented = flat !== null
        && (RED_ONLY_LABELS.includes(flat[1]!) || (block.redUnindented && ['invocation', 'exitCode'].includes(flat[1]!)));
      if (sub || unindented) {
        const [, name, value] = (sub ?? flat)!;
        if (unindented) block.redUnindented = true;
        const run = block.red.run;
        if (name === 'capture') run.capture = toCapture(value!);
        else if (name === 'against' || name === 'invocation' || name === 'exitCode' || name === 'failedAssertion') {
          run[name] = value!.trim();
        }
        continue;
      }
    }

    const label = LABEL.exec(text);
    if (label) {
      const [, name, value] = label;
      inRed = false;
      list = null;
      if (name === 'red') {
        const notApplicable = NOT_APPLICABLE.exec(value!.trim());
        block.red = value!.trim() === ''
          ? { kind: 'run', run: emptyRun() }
          : { kind: 'not-applicable', reason: notApplicable ? notApplicable[1]!.trim() : value!.trim() };
        inRed = block.red.kind === 'run';
        continue;
      }
      block.labels.set(name!, value!.trim());
      if (name === 'assertions' || name === 'captures') list = name;
      continue;
    }

    const item = ITEM.exec(text);
    if (item && list === 'assertions') block.assertions.push(toAssertion(item[1]!));
    else if (item && list === 'captures') block.captures.push(toCapture(item[1]!));
  }

  return block;
}

/**
 * Find every fenced block whose first non-empty line is
 * `format: maestro-execution-return/1`. Prose around the fences, and fences
 * holding anything else, are ignored: an executor's return is five parts of
 * text and only the fifth is read here.
 */
export function parseExecutionReturns(markdown: string): ExecutionReturnBlock[] {
  const blocks: ExecutionReturnBlock[] = [];
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const open = FENCE.exec(lines[index]!);
    if (!open) continue;
    const indent = open[1]!.length;
    const marker = open[2]!;

    const body: string[] = [];
    let end = index + 1;
    for (; end < lines.length; end += 1) {
      const close = FENCE.exec(lines[end]!);
      if (close && close[2]!.startsWith(marker[0]!) && close[2]!.length >= marker.length) break;
      // A fence inside a numbered list is indented with it; its body is too.
      body.push(lines[end]!.slice(Math.min(indent, lines[end]!.length - lines[end]!.trimStart().length)));
    }

    const first = body.find(text => text.trim() !== '');
    if (first?.trim() === `format: ${RETURN_FORMAT}`) {
      const block = readBlock(body.slice(body.indexOf(first) + 1), index + 1);
      log.debug('parse', 'block read', {
        line: block.line, checkId: block.labels.get('checkId') ?? null, result: block.labels.get('result') ?? null,
        red: block.red === null ? 'missing' : block.red.kind, assertions: block.assertions.length,
      });
      blocks.push(block);
    }
    index = end;
  }

  return blocks;
}

// What a red run may have run against: a stub of the Test surface signature,
// the base the change starts from, or a repair's parent commit. Comparing it
// with the block's `commit` was the alternative, and it fails: an executor does
// not commit, so that field can name the very base a legitimate red ran on.
// Whether the run truly came first is the reviewer's, against the diff.
const RED_AGAINST = /^(?:stub of\s+\S|base\s+[0-9a-f]{7,40}\b|parent\s+[0-9a-f]{7,40}\b)/i;

type Finding = { rule: string; message: string };

function redFindings(block: ExecutionReturnBlock, result: string): Finding[] {
  const red = block.red;
  if (red === null) {
    return [{ rule: 'red-missing', message: result === 'unavailable'
      ? 'no "red:" field — an unavailable check writes "red: not applicable — unavailable"'
      : 'no "red:" field — run the check against a stub of its Test surface signature first and record the '
        + 'failing assertion on a "red:" block; a pass never seen failing proves nothing' }];
  }

  if (red.kind === 'not-applicable') {
    if (red.reason === 'unavailable') {
      return result === 'unavailable' ? [] : [{ rule: 'red-not-applicable', message:
        `"red: not applicable — unavailable" on a ${result} result — a check that ran was seen running, so record its red run` }];
    }
    if (existingCheckPath(red.reason) !== null) return [];
    return [{ rule: 'red-not-applicable', message:
      `"red: not applicable — ${red.reason}" gives a reason the brief does not allow — the only two are `
      + '"existing check <path>" for a check you ran but did not write, and "unavailable"' }];
  }

  // Every field would read as missing; the one slip is the indent, so say that.
  if (block.redUnindented) {
    return [{ rule: 'red-unindented', message:
      'the "red:" run\'s fields sit at the block\'s own indent — indent the red run\'s fields under `red:` '
      + 'by two spaces, as the return template shows' }];
  }

  const run = red.run;
  const findings: Finding[] = [];
  const missing: string[] = (['against', 'invocation', 'exitCode', 'failedAssertion'] as const)
    .filter(name => run[name] === null || run[name] === '');
  if (run.capture === null) missing.push('capture');
  if (missing.length > 0) {
    findings.push({ rule: 'red-invalid', message:
      `the "red:" run lacks ${missing.join(', ')} — record what it ran against, the command, its exit code, the `
      + 'assertion it failed on and its captured output with a SHA-256' });
  }

  if (run.exitCode !== null && run.exitCode !== '' && !EXIT_CODE.test(run.exitCode)) {
    findings.push({ rule: 'red-invalid', message:
      `the "red:" run's exit code is "${run.exitCode}" — write the actual exit code the failing run returned, a whole number` });
  } else if (run.exitCode !== null && run.exitCode !== '' && Number(run.exitCode) === 0) {
    findings.push({ rule: 'red-invalid', message:
      'the "red:" run exited 0 — a red run is one the check failed; run it against the stub or the base until it fails on its assertion' });
  }

  if (run.failedAssertion !== null && run.failedAssertion !== ''
    && !block.assertions.some(assertion => assertion.name === run.failedAssertion)) {
    findings.push({ rule: 'red-invalid', message:
      `the "red:" run failed on "${run.failedAssertion}", which is none of this block's assertions — an import error, `
      + 'a missing module or a harness crash is not red; name the assertion the check failed on' });
  }

  if (run.against !== null && run.against !== '' && !RED_AGAINST.test(run.against)) {
    findings.push({ rule: 'red-invalid', message:
      `the "red:" run is against "${run.against}" — red is seen before the implementation lands; write `
      + '"stub of <signature from interfaces.md>", "base <commit>" or, for a repair, "parent <commit>"' });
  }

  if (run.capture !== null && !SHA256.test(run.capture.sha256)) {
    findings.push({ rule: 'red-invalid', message:
      'the "red:" capture has no SHA-256 — write it as "<path> sha256 <64 hex>", so the failure text can be read back' });
  }
  return findings;
}

function blockFindings(block: ExecutionReturnBlock): Finding[] {
  const findings: Finding[] = [];

  const missing = REQUIRED_LABELS.filter(name => {
    if (!block.labels.has(name)) return true;
    return name !== 'assertions' && name !== 'captures' && block.labels.get(name) === '';
  });
  if (missing.length > 0) {
    findings.push({ rule: 'incomplete', message:
      `the block lacks ${missing.join(', ')} — a block missing a field is an incomplete return, never a partial pass` });
  }

  const result = (block.labels.get('result') ?? '').toLowerCase();
  if (result === '') return [...findings, ...redFindings(block, result)];
  if (SKIP_WORDS.includes(result)) {
    findings.push({ rule: 'skip-is-not-pass', message:
      `"result: ${result}" — report a skipped or pending test as \`unavailable\` with its cause, never as \`passed\`, `
      + 'and name the skipped tests in its limitation' });
    return findings;
  }
  if (!RETURN_RESULTS.includes(result as CheckResult)) {
    findings.push({ rule: 'result', message:
      `"result: ${result}" is not a result — write one of ${RETURN_RESULTS.join(', ')}` });
    return findings;
  }

  if (result === 'passed') {
    const exitCode = block.labels.get('exitCode') ?? '';
    if (exitCode !== '' && Number(exitCode) !== 0) {
      findings.push({ rule: 'passed-with-failure', message:
        `a passed result with exit code ${exitCode} — return the result the run actually had` });
    }
    const notPassed = block.assertions.filter(assertion => assertion.result !== 'passed');
    if (notPassed.length > 0) {
      const skipped = notPassed.some(assertion => SKIP_WORDS.includes(assertion.result));
      findings.push({ rule: skipped ? 'skip-is-not-pass' : 'passed-with-failure', message: skipped
        ? `a passed result with ${notPassed.map(assertion => `"${assertion.name}: ${assertion.result}"`).join(', ')} — `
          + 'a skipped or pending test is not a pass; report the check `unavailable` with its cause'
        : `a passed result with ${notPassed.map(assertion => `"${assertion.name}: ${assertion.result}"`).join(', ')} — `
          + 'no assertion that did not pass may sit under a passed result' });
    }
    if (block.assertions.length === 0) {
      findings.push({ rule: 'passed-with-failure', message:
        'a passed result with no assertions — name each assertion the check made and its result' });
    }
  }

  if (result === 'failed' || result === 'unavailable') {
    const cause = block.labels.get('failureCause') ?? '';
    if (cause === '') {
      findings.push({ rule: 'cause', message:
        `a ${result} result with no "failureCause:" — name one of ${FAILURE_CAUSES.join(', ')}` });
    } else if (!(FAILURE_CAUSES as readonly string[]).includes(cause)) {
      findings.push({ rule: 'cause', message:
        `"failureCause: ${cause}" is not a cause — write one of ${FAILURE_CAUSES.join(', ')}` });
    } else if (result === 'unavailable' && !(UNAVAILABLE_CAUSES as readonly string[]).includes(cause)) {
      findings.push({ rule: 'cause', message:
        `an unavailable result caused by "${cause}" — a check that could not run names ${UNAVAILABLE_CAUSES.join(' or ')}` });
    }
  }
  if (result === 'unavailable' && (block.labels.get('limitation') ?? '') === '') {
    findings.push({ rule: 'cause', message:
      'an unavailable result with no "limitation:" — state what could not run and why' });
  }

  return [...findings, ...redFindings(block, result)];
}

/** Every reason each block cannot be imported, one finding per broken rule. */
export function returnFindings(blocks: readonly ExecutionReturnBlock[]): ReturnFinding[] {
  const findings: ReturnFinding[] = [];

  for (const block of blocks) {
    const checkId = block.labels.get('checkId') || null;
    for (const { rule, message } of blockFindings(block)) {
      log.warn('rule', 'block fails a rule', { line: block.line, checkId, rule });
      findings.push({ rule, checkId, line: block.line, message: checkId ? `${checkId}: ${message}` : message });
    }
  }

  log.info('returns', 'execution returns checked', { blocks: blocks.length, findings: findings.length });
  return findings;
}

/** A fact `--returns-check` could not decide, named so the reviewer can. */
export interface UncheckedFact {
  checkId: string | null;
  /** `commit`, `red.against` or `red.existingCheck`. */
  fact: string;
  reason: string;
}

// The base forms of `red.against`; `stub of …` names no commit, so there is
// nothing about it a worktree can confirm.
const AGAINST_COMMIT = /^(base|parent)\s+([0-9a-f]{7,40})\b/i;

type Resolved = { sha: string } | { absent: true } | { unavailable: string };

/**
 * One revision as a full commit sha. A git that answered "no such commit" is
 * `absent`; a git that could not answer at all is `unavailable` — the first
 * refuses a block, the second never does.
 */
async function resolveCommit(root: string, revision: string, gitBinary: string): Promise<Resolved> {
  const outcome = await runGit(root, ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`], gitBinary);
  if ('stdout' in outcome) return { sha: outcome.stdout.trim() };
  return outcome.exit === null ? { unavailable: outcome.unavailable } : { absent: true };
}

interface Mechanical {
  findings: ReturnFinding[];
  unchecked: UncheckedFact[];
}

/** The checks that need the worktree and git, for one block. */
async function blockMechanics(
  block: ExecutionReturnBlock, root: string, base: { sha: string } | { reason: string }, gitBinary: string,
): Promise<Mechanical> {
  const checkId = block.labels.get('checkId') || null;
  const findings: ReturnFinding[] = [];
  const unchecked: UncheckedFact[] = [];
  const found = (rule: string, message: string): void => {
    log.warn('rule', 'block fails a rule', { line: block.line, checkId, rule });
    findings.push({ rule, checkId, line: block.line, message: checkId ? `${checkId}: ${message}` : message });
  };
  const skip = (fact: string, reason: string): void => {
    log.debug('fact', 'fact left unchecked', { checkId, fact, verdict: 'unchecked', reason });
    unchecked.push({ checkId, fact, reason });
  };
  const decided = (fact: string, verdict: string): void => log.debug('fact', 'fact checked', { checkId, fact, verdict });

  // What a commit a block names has to be: the very base the таск was handed.
  const sameAsBase = async (fact: string, revision: string): Promise<'same' | 'other' | 'absent' | null> => {
    if (!('sha' in base)) { skip(fact, base.reason); return null; }
    const resolved = await resolveCommit(root, revision, gitBinary);
    if ('unavailable' in resolved) { skip(fact, resolved.unavailable); return null; }
    const verdict = 'absent' in resolved ? 'absent' : resolved.sha === base.sha ? 'same' : 'other';
    decided(fact, verdict);
    return verdict;
  };

  const commit = block.labels.get('commit') ?? '';
  if (commit !== '') {
    const verdict = await sameAsBase('commit', commit);
    if (verdict === 'other' || verdict === 'absent') {
      found('commit-not-base', `"commit: ${commit}" is not the commit this таск was handed — `
        + 'write the HEAD you worked on, unchanged; you never commit');
    }
  }

  const red = block.red;
  if (red?.kind === 'run' && red.run.against) {
    const against = AGAINST_COMMIT.exec(red.run.against);
    if (against) {
      const verdict = await sameAsBase('red.against', against[2]!);
      if (verdict === 'other' || verdict === 'absent') {
        found('red-against-not-base', `the "red:" run is against "${red.run.against}", which is not the commit this таск `
          + `was handed — a red run on the ${against[1]!.toLowerCase()} runs on the commit you started from`);
      }
    }
  }

  const existing = red?.kind === 'not-applicable' ? existingCheckPath(red.reason) : null;
  if (existing !== null) {
    if (!('sha' in base)) skip('red.existingCheck', base.reason);
    else {
      const relative = path.posix.normalize(existing.replaceAll('\\', '/')).replace(/^\.\//, '');
      const outcome = await runGit(root, ['cat-file', '-e', `${base.sha}:${relative}`], gitBinary);
      if (!('stdout' in outcome) && outcome.exit === null) skip('red.existingCheck', outcome.unavailable);
      else {
        decided('red.existingCheck', 'stdout' in outcome ? 'held' : 'new');
        if (!('stdout' in outcome)) {
          found('existing-check-new', `"existing check ${existing}" is not in the commit this таск was handed — `
            + 'a check this таск wrote is seen failing first; record its red run');
        }
      }
    }
  }

  const captures = [...block.captures];
  if (red?.kind === 'run' && red.run.capture && red.run.capture.path !== '' && SHA256.test(red.run.capture.sha256)) {
    captures.push(red.run.capture);
  }
  for (const capture of captures) {
    if (!SHA256.test(capture.sha256)) {
      found('capture-hash-missing', `the capture "${capture.path}" has no SHA-256 — write it as "<path> sha256 <64 hex>"`);
      continue;
    }
    const absolute = path.resolve(root, capture.path);
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      found('capture-outside-root', `the capture "${capture.path}" is outside the worktree — keep captures in the `
        + 'task-owned location inside it');
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(absolute);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.debug('fact', 'capture not read', { checkId, path: capture.path, reason });
      found('capture-missing', `the capture "${capture.path}" is not in the worktree — return the file the hash was taken of`);
      continue;
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    decided(`capture ${capture.path}`, actual === capture.sha256.toLowerCase() ? 'matches' : 'differs');
    if (actual !== capture.sha256.toLowerCase()) {
      found('capture-hash-mismatch', `the capture "${capture.path}" does not hash to the SHA-256 the block declares — `
        + 'hash the file as it is now, or return the file the hash was taken of');
    }
  }

  return { findings, unchecked };
}

function option(args: readonly string[], name: string): string | null {
  const at = args.indexOf(name);
  return at >= 0 && at + 1 < args.length ? args[at + 1]! : null;
}

/**
 * `--returns-check <file> [--root <dir>] [--base <sha>] [--owns-no-check]`: one JSON result.
 * Exit 0 when nothing is found, 1 on any finding, 2 on a missing or unreadable
 * file. It reads and reports; the orchestrator decides, and nothing is written.
 */
export async function returnsCheckCommand(
  args: string[], runDir: string, gitBinary = 'git',
): Promise<{ result: Record<string, unknown>; code: number }> {
  const file = args[1];
  if (!file || file.startsWith('--')) {
    log.error('check', 'no return file named', { args });
    return { result: { error: 'usage: --returns-check <return file> [--root <worktree>] [--base <commit handed>] [--owns-no-check]' }, code: 2 };
  }

  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('check', 'return file not read', { path: file, reason });
    return { result: { error: `cannot read ${file}: ${reason}` }, code: 2 };
  }

  const root = path.resolve(option(args, '--root') ?? path.dirname(runDir));
  const blocks = parseExecutionReturns(text);
  const findings = returnFindings(blocks);
  // An implementation таск whose checks another таск executes owns none, so
  // it returns no block. Only the orchestrator, holding the verification map,
  // can say so; without the flag an empty return is a lost block, not a quiet one.
  const ownsNoCheck = args.includes('--owns-no-check');
  if (blocks.length === 0 && ownsNoCheck) log.info('check', 'no block expected', { ownsNoCheck });
  if (blocks.length === 0 && !ownsNoCheck) {
    findings.push({ rule: 'no-block', checkId: null, line: 0, message:
      `the return holds no "format: ${RETURN_FORMAT}" block — return one block per check, in the template's shape` });
  }

  const baseArg = option(args, '--base');
  let base: { sha: string } | { reason: string } = { reason: 'no --base was given' };
  if (baseArg !== null) {
    const resolved = await resolveCommit(root, baseArg, gitBinary);
    base = 'sha' in resolved ? resolved
      : 'unavailable' in resolved ? { reason: resolved.unavailable }
        : { reason: `--base ${baseArg} is not a commit in ${root}` };
  }

  const unchecked: UncheckedFact[] = [];
  for (const block of blocks) {
    const mechanical = await blockMechanics(block, root, base, gitBinary);
    findings.push(...mechanical.findings);
    unchecked.push(...mechanical.unchecked);
  }

  log.info('check', 'return checked', { blocks: blocks.length, findings: findings.length, unchecked: unchecked.length });
  return {
    result: { ok: findings.length === 0, blocks: blocks.length, findings, unchecked },
    code: findings.length === 0 ? 0 : 1,
  };
}
