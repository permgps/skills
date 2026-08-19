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

/** Statuses whose meaning is incomplete without a reason. */
const REASON_REQUIRED = ['open', 'deferred', 'dropped'];

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
    });
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

  log.debug('validate', 'validation finished', { violations: violations.length });
  return violations;
}

/** A narrowing wrapper for callers that only need the yes/no answer. */
export function isValidState(value: unknown): value is RunState {
  return validateState(value).length === 0;
}
