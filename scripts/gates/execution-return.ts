// The repository face of the build phase's import refusal: an executor's
// `maestro-execution-return/1` blocks, read by label, and the blocks that could
// not be imported as a result, printed as `Violation`s.
//
// The parser and its rules live in the shipped runtime
// (`skills/maestro/tools/runtime/execution-return.mts`), because a прогон runs
// them on every return through `sync.mts --returns-check`. This file keeps the
// CLI the repository has always had and the finding shape every checker here
// prints, so the template the executor brief ships and the rules both sides
// apply cannot drift apart (`bundle-integrity.test.ts` parses that template).
//
// The rule it exists for: a check that was never seen failing proves nothing,
// so every block that ran a check carries a `red:` run. What no parser can see
// — whether the red run truly happened first, and whether an assertion
// recomputes the implementation — stays the reviewer's, against the diff.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  parseExecutionReturns,
  returnFindings,
  RETURN_FORMAT,
  type ExecutionReturnBlock,
} from '../../skills/maestro/tools/runtime/execution-return.mts';
import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';

export * from '../../skills/maestro/tools/runtime/execution-return.mts';

const log = createLogger('gate-execution-return');

/** The blocks a build phase would refuse to import, one violation per broken rule. */
export function checkExecutionReturns(blocks: readonly ExecutionReturnBlock[], file: string): Violation[] {
  return returnFindings(blocks).map(({ rule, line, message }) => ({ check: rule, file, line, message }));
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
