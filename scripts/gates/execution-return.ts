// The mechanical half of the build phase's import refusal: an executor's
// `maestro-execution-return/1` blocks are read by label, and a block that could
// not be imported as a result is reported before anything trusts it.
//
// This is not a manifest gate. It sits beside `answers.ts` because both parse
// the fixed format of a run artifact in repository tooling; neither is shipped,
// and a прогон refuses a return through the orchestrator's import step and the
// reviewer's blocking finding. What this module holds is that the format the
// executor brief ships and the rules both of them apply cannot drift apart.
//
// The rule it exists for: a check that was never seen failing proves nothing,
// so every block that ran a check carries a `red:` run — the same check failing
// on one of its named assertions before the implementation landed. A block
// without one is refused, however green the rest of it is.
//
// What this does not check, and cannot, because it never sees the diff: whether
// the red run truly happened before the implementation, whether a check claimed
// as an existing one pre-dates the таск, and whether an assertion recomputes
// what the implementation computes. Those are the reviewer's, against the diff.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
import { CHECK_RESULTS, FAILURE_CAUSES, type CheckResult } from '../state/contract.ts';

const log = createLogger('gate-execution-return');

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
}

const FENCE = /^(\s*)(`{3,}|~{3,})/;
const LABEL = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/;
const SUB_LABEL = /^\s{2,}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/;
const ITEM = /^\s*-\s+(.*)$/;
const CAPTURE = /^(.*?)\s+sha256\s+(\S+)\s*$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const NOT_APPLICABLE = /^not applicable\s*[—–-]+\s*(.*)$/i;

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
  const block: ExecutionReturnBlock = { line, labels: new Map(), assertions: [], captures: [], red: null };
  let list: 'assertions' | 'captures' | null = null;
  let inRed = false;

  for (const text of lines) {
    if (text.trim() === '') continue;

    if (inRed && block.red?.kind === 'run') {
      const sub = SUB_LABEL.exec(text);
      if (sub) {
        const [, name, value] = sub;
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
        hasRed: block.red !== null, assertions: block.assertions.length,
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
    if (red.reason.startsWith('existing check') && red.reason.slice('existing check'.length).trim() !== '') return [];
    return [{ rule: 'red-not-applicable', message:
      `"red: not applicable — ${red.reason}" gives a reason the brief does not allow — the only two are `
      + '"existing check <path>" for a check you ran but did not write, and "unavailable"' }];
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

  if (run.exitCode !== null && run.exitCode !== '' && Number(run.exitCode) === 0) {
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

/** The blocks a build phase would refuse to import, one violation per broken rule. */
export function checkExecutionReturns(blocks: readonly ExecutionReturnBlock[], file: string): Violation[] {
  const violations: Violation[] = [];

  for (const block of blocks) {
    const checkId = block.labels.get('checkId') || null;
    for (const { rule, message } of blockFindings(block)) {
      log.debug('rule', 'block fails a rule', { line: block.line, checkId, rule });
      violations.push({ check: rule, file, line: block.line, message: checkId ? `${checkId}: ${message}` : message });
    }
  }

  log.info('returns', 'execution returns checked', { blocks: blocks.length, violations: violations.length });
  return violations;
}

async function main(): Promise<number> {
  const file = process.argv[2];
  if (!file) {
    process.stdout.write('execution-return: usage: node scripts/gates/execution-return.ts <return-file>\n');
    return 2;
  }

  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.debug('read', 'return file not read', { path: file, found: false, reason });
    process.stdout.write(`execution-return: cannot read ${file}\n`);
    return 2;
  }
  log.debug('read', 'return file read', { path: file, found: true });

  const blocks = parseExecutionReturns(text);
  const violations = checkExecutionReturns(blocks, file);
  if (blocks.length === 0) {
    process.stdout.write(`execution-return: ${file} holds no "format: ${RETURN_FORMAT}" block\n`);
    return 1;
  }
  if (violations.length === 0) {
    process.stdout.write(`execution-return: OK (${blocks.length} block(s))\n`);
    return 0;
  }
  for (const violation of violations) process.stdout.write(formatViolation(violation));
  process.stdout.write(`execution-return: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
