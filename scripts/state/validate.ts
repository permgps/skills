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
  REGISTERS,
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
  const optionalOneOf = (field: string, raw: unknown, allowed: readonly string[]): void => {
    if (raw === undefined) return;
    requireOneOf(field, raw, allowed);
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
  // Absent is lawful at every contract version, including this one: the register
  // arrived after 2 was already in use, so a state that predates it is not a
  // state that lost a field.
  optionalOneOf('explain', value['explain'], REGISTERS);
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

      // What a стадия's own stamps must say, given its own status. The chain
      // below compares neighbours and can only speak when both sides carry a
      // clock — so a half-written стадия stays invisible there until a later
      // one arrives to be measured against it. This speaks about one entry
      // alone, which is what makes the hole visible while it is still the only
      // thing wrong.
      //
      // `skipped` is left out on purpose: the contract says such a стадия needs
      // no timestamps of its own, and needing none is not the same as being
      // forbidden them. `failed` is asked for a `startedAt` and nothing more —
      // a стадия cannot fail before it begins, but no phase in the bundle
      // writes one, and the contract does not say whether a failed стадия
      // closes.
      const status = entry['status'];
      const named = `стадия "${String(entry['id'])}"`;
      const present = (field: string): boolean =>
        typeof entry[field] === 'string' && entry[field] !== '';

      // A stamp is a moment, not a note. `Date.parse` is what every reader of
      // this state uses — the chain rule below, `scripts/metrics/`, the page —
      // so a string none of them can read is a стадия with no clock wearing the
      // shape of one, and the rules below would take it for a clock. Said
      // separately from a missing stamp because the repair differs: one field
      // has to be written, the other has to be corrected.
      const unreadable = (field: string): void => {
        if (present(field) && Number.isNaN(Date.parse(String(entry[field])))) {
          add(`${at}.${field}`,
            `${named} carries a ${field} that is not a moment: ${JSON.stringify(entry[field])}`);
        }
      };

      if (status === 'pending') {
        // Presence is the whole finding here, and what the stamp says does not
        // change the repair: a стадия that has not begun owns no clock, so the
        // field goes rather than gets corrected.
        if (present('startedAt')) {
          add(`${at}.startedAt`, `${named} has not begun and carries a startedAt`);
        }
        if (present('finishedAt')) {
          add(`${at}.finishedAt`, `${named} has not begun and carries a finishedAt`);
        }
      } else {
        unreadable('startedAt');
        unreadable('finishedAt');
      }

      if ((status === 'active' || status === 'done' || status === 'failed') && !present('startedAt')) {
        add(`${at}.startedAt`, `${named} is "${String(status)}" and carries no startedAt`);
      }
      // The other half of the forgotten write: the closing stamp was made and
      // the status was never moved off `active`, so the clock on screen keeps
      // running on a phase that has a recorded end.
      if (status === 'active' && present('finishedAt')) {
        add(`${at}.finishedAt`, `${named} is still active and already carries a finishedAt`);
      }
      if (status === 'done' && !present('finishedAt')) {
        add(`${at}.finishedAt`, `${named} is done and carries no finishedAt`);
      }
    });

    // Two стадии open at once is the same forgotten write as the rule below
    // catches, arriving in a state that has nothing to compare. A прогон can
    // open the next стадия without stamping it, and then the chain has no
    // `startedAt` to measure the abandoned one against — so this counts
    // statuses rather than clocks, and it names every open стадия, because
    // which one was meant to be closed is not derivable from the state.
    const open = STAGE_IDS.filter((id) => stages.some(
      (entry) => isRecord(entry) && entry['id'] === id && entry['status'] === 'active'));
    if (open.length > 1) {
      add('stages', `${open.length} стадии are active at once: ${open.map(id => `"${id}"`).join(', ')}`);
    }

    // `currentStage` is where the прогон says it stands, and the page believes
    // it over the search for the active стадия — `currentStage()` in
    // `dashboard.html` takes the entry with this id and only falls back to the
    // search when no entry has it. A value naming a стадия that has not begun
    // therefore puts the wrong phase on screen, at the wrong position in the
    // eight, under the word «ожидает», and nothing anywhere complains.
    //
    // Only `pending` is a contradiction. `done` is what a finished прогон
    // carries, and a `currentStage` that names a стадия some other one has
    // overtaken is the truthful half of that defect — the lie is in `stages[]`,
    // and the rule above is what says so. A стадия absent from the list is not
    // a finding either, for the reason the chain gives below: a record that
    // does not mention a стадия says nothing about it.
    const current = stages.find(
      (entry) => isRecord(entry) && entry['id'] === value['currentStage']);
    if (isRecord(current) && current['status'] === 'pending') {
      add('currentStage',
        `currentStage is "${String(value['currentStage'])}", a стадия that has not begun`);
    }

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

      // The стадия that is running now has no `finishedAt` — but the one after
      // it has not started either, and that pair is what the give-up below is
      // for. An earlier стадия left open while a later one has already been
      // stamped is the other case, and it is the defect itself: the write that
      // opened the next стадия was supposed to close this one, and half of it
      // was forgotten. Nothing downstream notices — the стадия keeps a running
      // clock on a phase that ended, and `scripts/metrics/` attributes the
      // interval to neither.
      if (Number.isNaN(closed) && !Number.isNaN(opened)) {
        add(
          `stages[${String(before['id'])}].finishedAt`,
          `"${String(before['id'])}" is still open, and "${id}" has already started`,
        );
        continue;
      }

      // Nothing to compare yet: the run has not reached this pair.
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
