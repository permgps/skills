// Structural validation of a run state read from disk.
//
// The input is `unknown` on purpose: a state file is JSON that some earlier run
// wrote, possibly under an older contract, possibly hand-edited. Trusting its
// shape because our own writer produced it is how a broken dashboard becomes a
// mystery instead of an error message.

import { createLogger } from '../shared/log.ts';
import {
  CONTRACT_VERSION,
  DEPTHS,
  GATE_IDS,
  GATE_STATUSES,
  MODES,
  REQUIREMENT_STATUSES,
  STAGE_IDS,
  STAGE_STATUSES,
  TASK_STATUSES,
  type RunState,
} from './contract.ts';

const log = createLogger('state');

/**
 * A finding anchored to a field path rather than to a file and line.
 *
 * Deliberately not the shared `Violation`: a state defect lives at
 * `requirements[2].reason`, and squeezing that into a line number would lose the
 * only piece of information that makes it fixable.
 */
export interface StateViolation {
  field: string;
  message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A gap between two стадии, in the coarsest unit that still names it. */
const describeGap = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
};

/** Statuses whose meaning is incomplete without a reason. */
const REASON_REQUIRED = ['open', 'deferred', 'dropped', 'placeholder'];

export function validateState(value: unknown): StateViolation[] {
  const violations: StateViolation[] = [];
  const add = (field: string, message: string): void => {
    violations.push({ field, message });
    log.error('validate', message, { field });
  };

  if (!isRecord(value)) {
    add('', 'state is not an object');
    return violations;
  }

  log.debug('validate', 'validating state', { runId: String(value['runId'] ?? '<none>') });

  const requireString = (field: string, raw: unknown): void => {
    if (typeof raw !== 'string' || raw === '') add(field, `${field} must be a non-empty string`);
  };
  const requireOneOf = (field: string, raw: unknown, allowed: readonly string[]): void => {
    if (typeof raw !== 'string' || !allowed.includes(raw)) {
      add(field, `${field} must be one of ${allowed.join(', ')} — got ${JSON.stringify(raw)}`);
    }
  };
  const requireArray = (field: string, raw: unknown): raw is unknown[] => {
    if (!Array.isArray(raw)) {
      add(field, `${field} must be an array`);
      return false;
    }
    return true;
  };
  const optionalString = (field: string, raw: unknown): void => {
    if (raw !== undefined && typeof raw !== 'string') add(field, `${field} must be a string`);
  };
  const requireStringArray = (field: string, raw: unknown): void => {
    if (!requireArray(field, raw)) return;
    raw.forEach((item, position) => {
      if (typeof item !== 'string') {
        add(`${field}[${position}]`, `${field}[${position}] must be a string`);
      }
    });
  };
  const requireCount = (field: string, raw: unknown): void => {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      add(field, `${field} must be a non-negative integer — got ${JSON.stringify(raw)}`);
    }
  };
  /** `null` is accepted for a suite that has not run: it is what an initialised state carries. */
  const optionalTests = (field: string, raw: unknown): void => {
    if (raw === undefined || raw === null) return;
    if (!isRecord(raw)) return add(field, `${field} must be an object`);
    requireCount(`${field}.passed`, raw['passed']);
    requireCount(`${field}.failed`, raw['failed']);
  };

  // --- scalars --------------------------------------------------------------
  const version = value['contractVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    add('contractVersion', 'contractVersion must be an integer');
  } else if (version > CONTRACT_VERSION) {
    add('contractVersion',
      `contractVersion ${version} is newer than this build knows (${CONTRACT_VERSION})`);
  } else if (version < 1) {
    add('contractVersion', `contractVersion ${version} is not a known contract`);
  }

  requireString('runId', value['runId']);
  requireString('slug', value['slug']);
  requireString('startedAt', value['startedAt']);
  requireOneOf('mode', value['mode'], MODES);
  requireOneOf('depth', value['depth'], DEPTHS);
  if (typeof value['polish'] !== 'boolean') add('polish', 'polish must be a boolean');
  requireOneOf('currentStage', value['currentStage'], STAGE_IDS);
  optionalString('finishedAt', value['finishedAt']);
  optionalString('interruptedAt', value['interruptedAt']);

  /**
   * Whether this state promises what contract 2 added.
   *
   * A прогон written under contract 1 is still a valid прогон — the metrics tool
   * reads finished runs, and the one this repository has was written before any
   * of these fields existed. Demanding them of it would turn "this run predates
   * the field" into "this run is corrupt", which is the wrong sentence and the
   * one that stops a measurement nobody can redo.
   */
  const atLeastV2 = typeof version === 'number' && version >= 2;
  if (atLeastV2) requireString('updatedAt', value['updatedAt']);
  else optionalString('updatedAt', value['updatedAt']);

  // --- dialChanges[] --------------------------------------------------------
  const dialChanges = value['dialChanges'];
  if (requireArray('dialChanges', dialChanges)) {
    dialChanges.forEach((entry, index) => {
      const at = `dialChanges[${index}]`;
      if (!isRecord(entry)) return add(at, `${at} must be an object`);
      requireOneOf(`${at}.dial`, entry['dial'], ['mode', 'depth', 'polish']);
      requireString(`${at}.from`, entry['from']);
      requireString(`${at}.to`, entry['to']);
      requireOneOf(`${at}.atPhase`, entry['atPhase'], STAGE_IDS);
    });
  }

  // --- stages[] -------------------------------------------------------------
  const stages = value['stages'];
  if (requireArray('stages', stages)) {
    stages.forEach((entry, index) => {
      const at = `stages[${index}]`;
      if (!isRecord(entry)) return add(at, `${at} must be an object`);
      requireOneOf(`${at}.id`, entry['id'], STAGE_IDS);
      requireOneOf(`${at}.status`, entry['status'], STAGE_STATUSES);
      optionalString(`${at}.startedAt`, entry['startedAt']);
      optionalString(`${at}.finishedAt`, entry['finishedAt']);
      optionalString(`${at}.note`, entry['note']);

      // A stage nobody ran and nobody explained is indistinguishable on screen
      // from a прогон that stalled there.
      const note = entry['note'];
      if (entry['status'] === 'skipped' && (typeof note !== 'string' || note.trim() === '')) {
        add(`${at}.note`, `stage "${String(entry['id'])}" is skipped with no recorded reason`);
      }
    });

    // A стадия opens in the same write that closes the one before it, so
    // `finishedAt` of one is `startedAt` of the next. Anything else is an
    // interval belonging to no стадия: on screen it is a stopped clock on a
    // phase that already finished, and `scripts/metrics/` cannot see it at all,
    // because it measures `stages[]`.
    //
    // Two things break the comparison rather than failing it. A `skipped`
    // стадия is stepped over — it is explained by a note and owns no clock. A
    // стадия absent from the list breaks the chain outright: whether time
    // belonged to it is unknowable from a record that does not mention it, and
    // a missing стадия is a different defect than a misplaced one.
    let previous: Record<string, unknown> | null = null;

    for (const id of STAGE_IDS) {
      const entry = stages.find((candidate) => isRecord(candidate) && candidate['id'] === id);
      if (!isRecord(entry)) { previous = null; continue; }
      if (entry['status'] === 'skipped') continue;

      const before = previous;
      previous = entry;
      if (!before) continue;

      const closed = Date.parse(String(before['finishedAt'] ?? ''));
      const opened = Date.parse(String(entry['startedAt'] ?? ''));
      // A стадия still running has no `finishedAt`, and the one after it has not
      // started. Neither is a defect; there is simply nothing to compare yet.
      if (Number.isNaN(closed) || Number.isNaN(opened) || closed === opened) continue;

      const ids = `"${String(before['id'])}" and "${String(id)}"`;
      add(
        `stages[${String(id)}].startedAt`,
        opened > closed
          ? `${describeGap(opened - closed)} between ${ids} belongs to no стадия`
          : `${ids} overlap by ${describeGap(closed - opened)}`,
      );
    }
  }

  // --- tasks[] --------------------------------------------------------------
  const tasks = value['tasks'];
  if (requireArray('tasks', tasks)) {
    tasks.forEach((entry, index) => {
      const at = `tasks[${index}]`;
      if (!isRecord(entry)) return add(at, `${at} must be an object`);
      requireString(`${at}.id`, entry['id']);
      requireString(`${at}.title`, entry['title']);
      requireOneOf(`${at}.status`, entry['status'], TASK_STATUSES);

      const ids = entry['requirementIds'];
      if (requireArray(`${at}.requirementIds`, ids)) {
        // Half of G3 lives here: a таск that traces to nothing is work nobody
        // asked for, and the cheapest place to catch it is before it runs.
        if (ids.length === 0) {
          add(`${at}.requirementIds`, `${at} traces to no требование`);
        }
        ids.forEach((id, position) => {
          if (typeof id !== 'string' || id === '') {
            add(`${at}.requirementIds[${position}]`, 'requirement id must be a non-empty string');
          }
        });
      }
      if (requireArray(`${at}.blockedBy`, entry['blockedBy'])) {
        (entry['blockedBy'] as unknown[]).forEach((id, position) => {
          if (typeof id !== 'string' || id === '') {
            add(`${at}.blockedBy[${position}]`, 'task id must be a non-empty string');
          }
        });
      }
      optionalString(`${at}.startedAt`, entry['startedAt']);
      optionalString(`${at}.finishedAt`, entry['finishedAt']);
      optionalTests(`${at}.tests`, entry['tests']);
      optionalString(`${at}.commit`, entry['commit']);

      if (atLeastV2) {
        // The wave is a layer, and a layer starts at one. A таск carrying zero
        // is a таск the plan phase never placed.
        const wave = entry['wave'];
        if (typeof wave !== 'number' || !Number.isInteger(wave) || wave < 1) {
          add(`${at}.wave`, `${at}.wave must be an integer of 1 or more — got ${JSON.stringify(wave)}`);
        }
        requireStringArray(`${at}.zone`, entry['zone']);
        requireStringArray(`${at}.files`, entry['files']);
        requireCount(`${at}.retries`, entry['retries']);
        requireCount(`${at}.repairs`, entry['repairs']);
        requireCount(`${at}.handoffs`, entry['handoffs']);
      }
    });
  }

  // --- requirements[] -------------------------------------------------------
  const requirements = value['requirements'];
  if (requireArray('requirements', requirements)) {
    requirements.forEach((entry, index) => {
      const at = `requirements[${index}]`;
      if (!isRecord(entry)) return add(at, `${at} must be an object`);
      requireString(`${at}.id`, entry['id']);
      requireOneOf(`${at}.status`, entry['status'], REQUIREMENT_STATUSES);
      optionalString(`${at}.reason`, entry['reason']);

      const status = entry['status'];
      const reason = entry['reason'];
      if (typeof status === 'string' && REASON_REQUIRED.includes(status)
        && (typeof reason !== 'string' || reason.trim() === '')) {
        add(`${at}.reason`, `требование with status "${status}" has no recorded reason`);
      }
    });
  }

  // --- gates[] --------------------------------------------------------------
  const gates = value['gates'];
  if (requireArray('gates', gates)) {
    gates.forEach((entry, index) => {
      const at = `gates[${index}]`;
      if (!isRecord(entry)) return add(at, `${at} must be an object`);
      requireOneOf(`${at}.id`, entry['id'], GATE_IDS);
      requireOneOf(`${at}.status`, entry['status'], GATE_STATUSES);
      if (requireArray(`${at}.findings`, entry['findings'])) {
        (entry['findings'] as unknown[]).forEach((finding, position) => {
          if (typeof finding !== 'string') {
            add(`${at}.findings[${position}]`, 'finding must be a string');
          }
        });
      }
    });
  }

  // --- debt, additions and the suite ----------------------------------------
  optionalTests('tests', value['tests']);

  if (atLeastV2) {
    const debt = value['debt'];
    if (!isRecord(debt)) {
      add('debt', 'debt must be an object');
    } else {
      requireStringArray('debt.placeholders', debt['placeholders']);
      requireStringArray('debt.assumptions', debt['assumptions']);
      requireStringArray('debt.emptyEnv', debt['emptyEnv']);

      // S2 says a credential is never written. The list of environment
      // variables is where that rule is broken by accident rather than on
      // purpose, so the shape of a name is checked rather than trusted.
      if (Array.isArray(debt['emptyEnv'])) {
        debt['emptyEnv'].forEach((name, position) => {
          if (typeof name === 'string' && /[=\s]/.test(name)) {
            add(`debt.emptyEnv[${position}]`,
              'debt.emptyEnv holds variable names only — this entry looks like a value');
          }
        });
      }
    }
    requireStringArray('additions', value['additions']);
  }

  log.debug('validate', 'validation finished', { violations: violations.length });
  return violations;
}

/** A narrowing wrapper for callers that only need the yes/no answer. */
export function isValidState(value: unknown): value is RunState {
  return validateState(value).length === 0;
}
