// The shell every gate CLI wears: read the state, run one pass condition,
// report, and map the outcome onto an exit code.
//
// The exit-code contract lives here and only here. Copied into each gate it
// would sit in three places, and the third copy is where it stops agreeing —
// a gate that exits 0 on a finding is worse than no gate at all.
//
// What is deliberately *not* here is any pass condition. A gate answers one
// question about a прогон; this file only asks it.
//
// Most of that question is the run state. Some of it is not: what the user was
// asked and what they chose lives in `answers.md`, and a gate that needs it
// passes a second check that reads run artifacts. A read that fails there is
// the same `2` as an unreadable state — nothing was checked either way.

import { createLogger } from '../shared/log.ts';
import type { RunState } from '../state/contract.ts';
import { readState } from '../state/read.ts';

const log = createLogger('gate');

/**
 * One finding from a gate. Anchored to a requirement id rather than to a file
 * and line: a gate reads the run state, where a defect lives at
 * `requirements[2]`, not at a line of source.
 */
export interface GateFinding {
  /** The requirement or таск the finding is about; empty when it is about the run. */
  requirementId: string;
  message: string;
}

/** A gate's whole contribution: the state in, its findings out. */
export type GateCheck = (state: RunState) => GateFinding[];

/**
 * The part of a gate that reads run artifacts beside the state. `target` is
 * the run root the state was read from, so a path the state names is resolved
 * under the same root. A throw means the artifact could not be read.
 */
export type GateFileCheck = (state: RunState, target: string) => Promise<GateFinding[]>;

/** Where the state lives, from the command line. */
export const targetFromArgv = (argv: readonly string[] = process.argv): string =>
  argv[2] ?? '.maestro';

/**
 * Run one gate against the state under `target`.
 *
 * Exit codes: `0` the gate passes, `1` the gate fails with findings, `2` the
 * state, or a run artifact `files` reads, could not be read at all. The last is
 * kept distinct because an unreadable input is not a failed gate — nothing was
 * checked, and reporting it as a failure would send the phase back to redo work
 * that was never judged.
 */
export async function runGate(
  gate: string,
  check: GateCheck,
  target: string,
  files?: GateFileCheck,
): Promise<number> {
  log.info('run', 'checking gate', { gate, target });

  let state: RunState;
  try {
    state = await readState(target);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'state could not be read', { gate, target, reason });
    process.stdout.write(`${gate}: ${reason}\n`);
    return 2;
  }

  const findings = [...check(state)];
  if (files) {
    try {
      findings.push(...await files(state, target));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.error('run', 'run artifact could not be read', { gate, target, reason });
      process.stdout.write(`${gate}: ${reason}\n`);
      return 2;
    }
  }
  if (findings.length === 0) {
    process.stdout.write(`${gate}: pass\n`);
    return 0;
  }

  for (const finding of findings) {
    log.error('run', finding.message, { gate, requirementId: finding.requirementId });
    process.stdout.write(`  ${finding.message}\n`);
  }
  process.stdout.write(
    `${gate}: fail — ${findings.length} finding(s). `
    + 'A failed gate is not a warning: the phase it follows runs again with these as input.\n',
  );
  return 1;
}
