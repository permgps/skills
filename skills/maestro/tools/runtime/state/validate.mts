// Structural validation of a run state read from disk.
//
// The input is `unknown` on purpose: a state file is JSON that some earlier run
// wrote, possibly under an older contract, possibly hand-edited. Trusting its
// shape because our own writer produced it is how a broken dashboard becomes a
// mystery instead of an error message.

import { createLogger } from '../shared/log.mts';
import {
  AWAITING_KINDS,
  AWAITING_NOTE_MAX,
  CONTRACT_VERSION,
  CLOSURE_OUTCOMES,
  DEPTHS,
  GATE_IDS,
  GATE_STATUSES,
  LANGUAGES,
  LEFTOVER_DISPOSITIONS,
  LIFECYCLES,
  MODEL_TIERS,
  MODES,
  ONE_WAY_KINDS,
  REGISTERS,
  REQUIREMENT_STATUSES,
  RESULT_MAX,
  SIGNAL_KINDS,
  STAGE_IDS,
  STAGE_STATUSES,
  TASK_STATUSES,
  isAwaitingNote,
  isMoment,
  isResultLine,
  type RunState,
} from './contract.mts';
import { validateDispatchRecord } from './repair-dispatch.mts';
import { validateClosureRecord } from './closure.mts';
import { validateVerificationRecord } from './verification.mts';
import { LEFTOVER_KEY_PATTERN, WIP_SUFFIX, parseRunDir, toRunDir } from './paths.mts';

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

/**
 * A state that failed the rules above, refused rather than handed on.
 *
 * It lives beside the violations it carries: both the writer and the reader
 * throw it, and putting it in either one would make the other import its
 * counterpart to name the error it raises itself.
 */
export class InvalidStateError extends Error {
  readonly violations: StateViolation[];

  constructor(violations: StateViolation[]) {
    const summary = violations.map(v => `${v.field}: ${v.message}`).join('; ');
    super(`refusing to write an invalid state — ${summary}`);
    this.name = 'InvalidStateError';
    this.violations = violations;
  }
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

/**
 * The run directory name against the state that names it.
 *
 * From contract 7 `dir` is the only thing paths are built from, so a name whose
 * date, slug or suffix disagrees with the state is a run that would be written
 * somewhere its own record says it is not. Each message carries the name the
 * state actually implies, because the repair is to write exactly that.
 */
function checkRunDir(value: Record<string, unknown>, add: (field: string, message: string) => void): void {
  const version = value['contractVersion'];
  const dir = value['dir'];
  // A newer contract is refused as a whole; guessing which of its fields it kept is the mistake.
  if (typeof version === 'number' && version > CONTRACT_VERSION) return;
  if (typeof version !== 'number' || version < 7) {
    if (dir !== undefined) add('dir', 'dir arrives with contract 7 — a run written under an older contract keeps its slug directory and carries no dir');
    return;
  }
  if (typeof dir !== 'string' || dir === '') {
    add('dir', 'contract 7 requires dir, the run directory under .maestro/');
    return;
  }
  const slug = value['slug'];
  const startedAt = value['startedAt'];
  const active = value['lifecycle'] === 'active';
  let expected: string | undefined;
  try {
    // Only a moment dates a directory: V8 reads "attempt 1" as a day in 2001,
    // and a name built from that would send the repair to the wrong field.
    if (typeof slug === 'string' && isMoment(startedAt)) expected = toRunDir(startedAt, slug, active);
  } catch {
    // An unsafe slug: the contract-4 slug rule reports it, and there is no name to compare with.
  }
  const parsed = parseRunDir(dir);
  if (!parsed) {
    add('dir', `dir "${dir}" is not <YYYY-MM-DD>-<slug> with an optional --wip${expected ? ` — write "${expected}"` : ''}`);
    return;
  }
  if (expected === undefined || dir === expected) return;
  log.debug('validate', 'run directory disagrees with the state', { expected, found: dir });
  if (typeof startedAt === 'string' && parsed.date !== expected.slice(0, 10)) {
    add('dir', `dir is dated ${parsed.date}, but the run started on ${expected.slice(0, 10)} (UTC) — write "${expected}"`);
  } else if (parsed.slug !== slug) {
    add('dir', `dir names slug "${parsed.slug}", but the state's slug is "${String(slug)}" — write "${expected}"`);
  } else if (active) {
    add('dir', `dir must end in ${WIP_SUFFIX} while the прогон is active — write "${expected}"`);
  } else {
    add('dir', `dir must not end in ${WIP_SUFFIX} once the прогон is closed — write "${expected}"`);
  }
}

/**
 * The sentence a closed прогон leaves, against the contract and lifecycle that
 * carry it.
 *
 * From contract 10 a closed run must say what now exists and an active one has
 * nothing to say yet — a reopened run drops the sentence, and this is what holds
 * it to that. Below 10 the field is refused rather than ignored, as `models` is
 * below 8: a contract-9 run closes without it, and a sentence it carried would be
 * one its own rules never asked for.
 */
function checkResult(value: Record<string, unknown>, add: (field: string, message: string) => void): void {
  const version = value['contractVersion'];
  const result = value['result'];
  const lifecycle = value['lifecycle'];
  // A newer contract is refused as a whole, exactly as checkRunDir does.
  if (typeof version === 'number' && version > CONTRACT_VERSION) return;
  const refuse = (problem: 'active' | 'missing' | 'shape', message: string): void => {
    log.debug('closure-result', 'result refused', { version, lifecycle, present: result !== undefined, problem });
    add('result', message);
  };
  if (typeof version !== 'number' || version < 10) {
    if (result === undefined) return;
    log.debug('version-gate', 'field refused for its contract version', { version, field: 'result' });
    const holder = typeof version === 'number' ? `a contract-${version} run` : 'a state that names no contract version';
    add('result', `result arrives with contract 10 — ${holder} closes without it; remove it`);
    return;
  }
  if (lifecycle !== 'closed') {
    if (result !== undefined) refuse('active', 'an active прогон has no result yet — remove it; a reopened run drops it');
    return;
  }
  if (result === undefined) {
    refuse('missing', 'contract 10 requires result once the прогон is closed — write one line saying what now exists');
  } else if (!isResultLine(result)) {
    refuse('shape', `result must be one non-empty line of at most ${RESULT_MAX} characters — say what now exists`);
  }
}

/**
 * The user's disposition of items an earlier прогон left open (D2).
 *
 * Optional at every version from 7, so it raises no contract version; below 7
 * it is refused, because its keys name contract-7 run directories that such a
 * run never had. Each entry is held to the shape the closing publish relies
 * on: a key it can match, one entry per key, the user's own words and a moment.
 */
function checkLeftovers(value: Record<string, unknown>, add: (field: string, message: string) => void): void {
  const version = value['contractVersion'];
  const leftovers = value['leftovers'];
  if (leftovers === undefined) return;
  // A newer contract is refused as a whole, exactly as checkRunDir does.
  if (typeof version === 'number' && version > CONTRACT_VERSION) return;
  if (typeof version !== 'number' || version < 7) {
    log.debug('version-gate', 'field refused for its contract version', { version, field: 'leftovers' });
    add('leftovers', 'leftovers arrives with contract 7 — an older run has no progress file to dispose of; remove it');
    return;
  }
  if (!Array.isArray(leftovers)) {
    add('leftovers', 'leftovers must be a list of { key, disposition, answer, at } — one entry per item the user named');
    return;
  }
  const refuse = (at: string, key: unknown, problem: 'key' | 'duplicate' | 'answer' | 'at' | 'disposition', message: string): void => {
    log.debug('leftovers', 'entry refused', { key: typeof key === 'string' ? key : null, problem });
    add(at, message);
  };
  const seen = new Set<string>();
  leftovers.forEach((entry, position) => {
    const at = `leftovers[${position}]`;
    if (!isRecord(entry)) {
      add(at, 'a leftover must be an object { key, disposition, answer, at }');
      return;
    }
    const key = entry['key'];
    if (typeof key !== 'string' || !LEFTOVER_KEY_PATTERN.test(key)) {
      refuse(`${at}.key`, key, 'key',
        'a leftover key is <YYYY-MM-DD>-<slug>#<id>, copied from the [key] the progress file shows — write it as the file has it');
    } else if (seen.has(key)) {
      refuse(`${at}.key`, key, 'duplicate', `${key} appears twice — keep one entry per item, with the user's last word on it`);
    } else {
      seen.add(key);
    }
    if (typeof entry['disposition'] !== 'string' || !(LEFTOVER_DISPOSITIONS as readonly string[]).includes(entry['disposition'])) {
      refuse(`${at}.disposition`, key, 'disposition',
        `a leftover disposition is one of ${LEFTOVER_DISPOSITIONS.join(', ')} — an item left for later gets no entry`);
    }
    const answer = entry['answer'];
    if (typeof answer !== 'string' || answer.trim() === '') {
      refuse(`${at}.answer`, key, 'answer', 'a leftover carries the user\'s reply verbatim, after redaction — only the user disposes of an item');
    }
    if (!isMoment(entry['at'])) {
      refuse(`${at}.at`, key, 'at', 'a leftover\'s at is the ISO 8601 moment, with its zone, when the user answered');
    }
  });
}

/** A `oneWay` line: one of the kinds, the dash, then a subject. */
const ONE_WAY_LINE = new RegExp(`^(${ONE_WAY_KINDS.join('|')}) — \\S`);

/** A `signals` line: its id, one of the kinds, a subject, then who it is about. */
const SIGNAL_LINE = new RegExp(`^(SIG-[1-9][0-9]*) (${SIGNAL_KINDS.join('|')}) — \\S.* — \\S`);

/** Statuses whose meaning is incomplete without a reason. */
const REASON_REQUIRED = ['open', 'deferred', 'dropped', 'placeholder'];

export function validateState(value: unknown, options: { historical?: boolean } = {}): StateViolation[] {
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
  // Absent is lawful at every contract version, including this one: the register
  // arrived after 2 was already in use, so a state that predates it is not a
  // state that lost a field.
  optionalOneOf('explain', value['explain'], REGISTERS);
  optionalOneOf('language', value['language'], LANGUAGES);
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

  /**
   * Whether this state promises the rename version 3 made.
   *
   * Below it a таск carries `commit`, a single string, and nothing here demands
   * `commits` of a прогон written before the list existed — the same courtesy
   * contract 1 is shown above, and for the same reason: a run that predates a
   * field is not a run that lost one.
   */
  const atLeastV3 = typeof version === 'number' && version >= 3;
  const atLeastV4 = typeof version === 'number' && version >= 4 && version <= CONTRACT_VERSION;
  /**
   * Whether this state promises the models dial. Below it a field from 8 is
   * refused rather than ignored: a contract-7 прогон runs every таск on the
   * session's model, and a tier it carried would claim a choice nothing made.
   */
  const atLeastV8 = typeof version === 'number' && version >= 8 && version <= CONTRACT_VERSION;
  const refuseBelowV8 = (field: string, raw: unknown): void => {
    if (raw === undefined) return;
    log.debug('version-gate', 'field refused for its contract version', { version, field });
    add(field, `${field} arrives with contract 8 — a contract-7 run keeps running on the session's model; remove it`);
  };
  /**
   * Whether this state promises what contract 9 added: the six kinds, the note
   * and the closed waits. Below it each is refused rather than ignored, as
   * `models` is below 8 — a contract-8 прогон keeps today's arithmetic, and a
   * wait it carried would be subtracted by nothing.
   */
  const atLeastV9 = typeof version === 'number' && version >= 9 && version <= CONTRACT_VERSION;
  const refuseBelowV9 = (field: string): void => {
    log.debug('version-gate', 'field refused for its contract version', { version, field });
    add(field, `${field} arrives with contract 9 — a contract-${String(version)} run keeps waiting for an answer only; remove it`);
  };
  /**
   * The finish dial was retired in contract 8, so its switch is refused from 8 and stays
   * a required boolean below it: a contract-7 прогон is still valid under its
   * own rules, and nothing reads the value any more.
   */
  if (atLeastV8) {
    if (value['polish'] !== undefined) {
      log.debug('version-gate', 'retired field refused for its contract version', { version, field: 'polish' });
      add('polish', 'polish was retired in contract 8 — remove it');
    }
  } else if (typeof value['polish'] !== 'boolean') {
    add('polish', 'polish must be a boolean');
  }

  /**
   * Whether a stamp is a moment, under the rule its contract is read by.
   *
   * From contract 4 — every contract publication accepts — that is `isMoment`,
   * the one rule verification and closure order their records by. A прогон
   * written before it is still read by metrics and the page, and it was
   * written against "readable by `Date.parse`"; holding it to the stricter
   * rule would turn "this run predates the rule" into "this run is corrupt",
   * the wrong sentence the contract-1 courtesy below already refuses to say.
   */
  const isStamp = (raw: unknown): boolean => atLeastV4
    ? isMoment(raw)
    : typeof raw === 'string' && !Number.isNaN(Date.parse(raw));
  /** A contract-4 stamp that is present, a string, and no moment; absent and non-string are other rules' findings. */
  const requireMoment = (field: string, raw: unknown): void => {
    if (!atLeastV4 || typeof raw !== 'string' || isMoment(raw)) return;
    add(field, `${field} is not a moment: ${JSON.stringify(raw)} — write ISO 8601 with Z or a ±hh:mm offset`);
  };
  /**
   * The first entry an id belongs to. Every reader finds an entry by its id and
   * takes the first, so a second one under the same id — a failed G4 behind a
   * passed one, an open R01 behind an in-spec one — would be published and
   * never read by anything that decides.
   */
  const requireUniqueIds = (collection: string, entries: unknown[]): void => {
    const first = new Map<string, number>();
    entries.forEach((entry, index) => {
      if (!isRecord(entry) || typeof entry['id'] !== 'string' || entry['id'] === '') return;
      const earlier = first.get(entry['id']);
      if (earlier === undefined) { first.set(entry['id'], index); return; }
      add(`${collection}[${index}].id`,
        `${collection}[${earlier}] already carries id "${entry['id']}" — merge the two entries or give this one its own id`);
    });
  };

  /** A wait's edge as milliseconds, or NaN after reporting why it is no moment. */
  const waitEdge = (field: string, raw: unknown): number => {
    if (isMoment(raw)) return Date.parse(String(raw));
    log.debug('validate', 'wait rejected', { field, found: raw ?? null });
    add(field, `${field} must be a moment — write ISO 8601 with Z or a ±hh:mm offset`);
    return Number.NaN;
  };

  requireMoment('startedAt', value['startedAt']);
  requireMoment('updatedAt', value['updatedAt']);
  requireMoment('interruptedAt', value['interruptedAt']);

  // --- heldBy ---------------------------------------------------------------
  // Optional at every version, and absent means unclaimed rather than free: the
  // field arrived after 2 was already in use, and a прогон nobody claimed never
  // carries one. What is checked is that a claim which is there is a claim that
  // can be acted on — a token to name the holder, and a `since` a reader can
  // turn into a moment.
  const heldBy = value['heldBy'];
  if (heldBy !== undefined) {
    if (!isRecord(heldBy)) {
      add('heldBy', 'heldBy must be an object');
    } else {
      requireString('heldBy.token', heldBy['token']);
      requireString('heldBy.since', heldBy['since']);

      // A stamp is a moment, not a note — the same rule the стадии are held to
      // below, and reported separately from a missing `since` for the same
      // reason: one field has to be written, the other has to be corrected.
      const since = heldBy['since'];
      if (typeof since === 'string' && since !== '' && !isStamp(since)) {
        add('heldBy.since', `heldBy.since is not a moment: ${JSON.stringify(since)}`);
      }
    }
  }

  // --- awaiting --------------------------------------------------------------
  // Optional at every version, like `heldBy`, and absent means the page applies
  // its ordinary silence rule. A run that is finished waits for nobody, so a
  // closed state carrying the field is a write that forgot to clear it — and the
  // page would tell the user their reply is awaited by a run that has ended.
  // A question is not an interruption either: the page reads `interruptedAt`
  // first, so a state carrying both would show a stopped run to a user whose
  // reply is the only thing missing.
  const awaiting = value['awaiting'];
  if (awaiting !== undefined) {
    if (!isRecord(awaiting)) {
      log.debug('validate', 'awaiting rejected', { field: 'awaiting', found: typeof awaiting });
      add('awaiting', "awaiting must be an object — { kind: 'answer', since }");
    } else {
      const kind = awaiting['kind'];
      if (typeof kind !== 'string' || !AWAITING_KINDS.includes(kind as typeof AWAITING_KINDS[number])) {
        log.debug('validate', 'awaiting rejected', { field: 'awaiting.kind', found: kind ?? null });
        requireOneOf('awaiting.kind', kind, AWAITING_KINDS);
      } else if (kind !== 'answer' && !atLeastV9) {
        refuseBelowV9('awaiting.kind');
      }
      requireString('awaiting.since', awaiting['since']);
      const since = awaiting['since'];
      if (typeof since === 'string' && since !== '' && !isStamp(since)) {
        log.debug('validate', 'awaiting rejected', { field: 'awaiting.since', found: since });
        add('awaiting.since', `awaiting.since is not a moment: ${JSON.stringify(since)}`);
      }
      // The note is published on the page and in every snapshot, so it is held
      // to one short line: a paragraph would be a second channel for the
      // question itself, and the question belongs in the chat.
      const note = awaiting['note'];
      if (note !== undefined && !atLeastV9) {
        refuseBelowV9('awaiting.note');
      } else if (note !== undefined && !isAwaitingNote(note)) {
        log.debug('validate', 'awaiting rejected', { field: 'awaiting.note', found: typeof note === 'string' ? note.length : typeof note });
        add('awaiting.note', `awaiting.note must be one non-empty line of at most ${AWAITING_NOTE_MAX} characters — say what is awaited, never a value`);
      }
    }
    if (value['lifecycle'] === 'closed' || typeof value['finishedAt'] === 'string') {
      log.debug('validate', 'awaiting on a finished run', { lifecycle: value['lifecycle'], finishedAt: value['finishedAt'] });
      add('awaiting', 'a closed прогон waits for nobody — remove awaiting in the write that closes the run');
    } else if (typeof value['interruptedAt'] === 'string') {
      log.debug('validate', 'awaiting on an interrupted run', { field: 'awaiting', found: value['interruptedAt'] });
      add('awaiting', 'a question is not an interruption — a stop on a question writes awaiting and leaves interruptedAt out');
    }
  }

  // --- waits[] ---------------------------------------------------------------
  // The closed waits, kept by sync.mts. Every clock on the page subtracts them,
  // so each must be a span a reader can measure, and two that overlapped would
  // subtract the same minutes twice.
  const waits = value['waits'];
  if (waits !== undefined && !atLeastV9) {
    refuseBelowV9('waits');
  } else if (waits !== undefined && requireArray('waits', waits)) {
    let lastUntil = Number.NEGATIVE_INFINITY;
    waits.forEach((entry, index) => {
      const at = `waits[${index}]`;
      if (!isRecord(entry)) {
        log.debug('validate', 'wait rejected', { field: at, found: typeof entry });
        add(at, `${at} must be an object — { since, until }`);
        return;
      }
      const since = waitEdge(`${at}.since`, entry['since']);
      const until = waitEdge(`${at}.until`, entry['until']);
      if (Number.isNaN(since) || Number.isNaN(until)) return;
      if (until < since) {
        log.debug('validate', 'wait rejected', { field: `${at}.until`, since: entry['since'], until: entry['until'] });
        add(`${at}.until`, `${at} ends before it begins — a wait closes at or after its since`);
        return;
      }
      if (since < lastUntil) {
        log.debug('validate', 'wait rejected', { field: `${at}.since`, since: entry['since'] });
        add(`${at}.since`, `${at} begins before waits[${index - 1}] ended — waits are kept oldest first and never overlap`);
      }
      lastUntil = Math.max(lastUntil, until);
    });
    const open = isRecord(awaiting) ? awaiting['since'] : undefined;
    if (isMoment(open) && Date.parse(String(open)) < lastUntil) {
      log.debug('validate', 'awaiting rejected', { field: 'awaiting.since', found: open, lastUntil: new Date(lastUntil).toISOString() });
      add('awaiting.since', 'awaiting.since is before the last closed wait ended — a new question is asked after the previous one was answered');
    }
  }

  // --- dialChanges[] --------------------------------------------------------
  const dialChanges = value['dialChanges'];
  if (requireArray('dialChanges', dialChanges)) {
    dialChanges.forEach((entry, index) => {
      const at = `dialChanges[${index}]`;
      if (!isRecord(entry)) return add(at, `${at} must be an object`);
      // `polish` left with the finish dial in contract 8; an older прогон may still record a move of it.
      requireOneOf(`${at}.dial`, entry['dial'], atLeastV8 ? ['mode', 'depth'] : ['mode', 'depth', 'polish']);
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

      // A stamp is a moment, not a note. A string the readers of this state —
      // the chain rule below, `scripts/metrics/`, the page — cannot agree on is
      // a стадия with no clock wearing the shape of one, and the rules below
      // would take it for a clock. `isStamp` is the rule, so a стадия is held to
      // the same moment as every other stamp of its contract. Said separately
      // from a missing stamp because the repair differs: one field has to be
      // written, the other has to be corrected.
      const unreadable = (field: string): void => {
        if (present(field) && !isStamp(entry[field])) {
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
    requireUniqueIds('stages', stages);

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

      // A stamp the rule above refused is no clock here either, or a "2001"
      // read out of "attempt 1" would be measured as a gap of decades.
      const instant = (raw: unknown): number => isStamp(raw) ? Date.parse(String(raw)) : Number.NaN;
      const closed = instant(before['finishedAt']);
      const opened = instant(entry['startedAt']);

      // The стадия that is running now has no `finishedAt` — but the one after
      // it has not started either, and that pair is what the give-up below is
      // for. An earlier стадия left open while a later one has already been
      // stamped is the other case, and it is the defect itself: the write that
      // opened the next стадия was supposed to close this one, and half of it
      // was forgotten. Nothing downstream notices — the стадия keeps a running
      // clock on a phase that ended, and `scripts/metrics/` attributes the
      // interval to neither.
      //
      // A `pending` стадия in that position is a different record and gets a
      // different sentence. «Still open» was false twice for it: nothing was
      // open, and nothing needs closing — a `finishedAt` written onto it would
      // only be refused by the rule above for a стадия that has not begun. The
      // finding stays, because the record is still wrong, and it points at the
      // status: a стадия stepped over is `skipped` with a note, and one that ran
      // unrecorded gets its stamps. No writer closes or skips it on its own —
      // the write that opens the next стадия already owns that, and a second
      // mechanism would cost more than it buys.
      if (before['status'] === 'pending' && !Number.isNaN(opened)) {
        add(
          `stages[${String(before['id'])}].status`,
          `"${String(before['id'])}" never opened, and "${id}" has already started: ` +
            'mark it skipped with a note saying why, or stamp the interval it ran',
        );
        continue;
      }

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
      // A таск's finishedAt counts closures for the closure batch rule.
      requireMoment(`${at}.startedAt`, entry['startedAt']);
      requireMoment(`${at}.finishedAt`, entry['finishedAt']);
      optionalTests(`${at}.tests`, entry['tests']);

      // A таск that has not landed yet carries an empty list, not a missing
      // one: the array is written with the таск, like every other list here, so
      // nothing downstream increments it from `undefined`. Each entry is named
      // by its own index, because a list reported as a whole makes the caller
      // count the elements to find the one that is wrong.
      const commits = entry['commits'];
      if (atLeastV3 || commits !== undefined) {
        if (requireArray(`${at}.commits`, commits)) {
          (commits as unknown[]).forEach((sha, position) => {
            if (typeof sha !== 'string' || sha === '') {
              add(`${at}.commits[${position}]`, 'commit must be a non-empty string');
            }
          });
        }
      }

      // A sha in both lists would be reviewed as the таск's work and declared
      // lost at once; a resume moves it, so the overlap is a half-done move.
      const lostCommits = entry['lostCommits'];
      if (lostCommits !== undefined && requireArray(`${at}.lostCommits`, lostCommits)) {
        const recorded = new Set(Array.isArray(commits) ? commits : []);
        const seen = new Set<unknown>();
        (lostCommits as unknown[]).forEach((sha, position) => {
          const where = `${at}.lostCommits[${position}]`;
          if (typeof sha !== 'string' || sha === '') add(where, 'lost commit must be a non-empty string');
          else if (recorded.has(sha)) add(where, `commit ${sha} is both recorded and lost; remove it from commits`);
          else if (seen.has(sha)) add(where, `commit ${sha} is declared lost twice; keep one entry`);
          seen.add(sha);
        });
      }

      // The plan's estimate is compared with what git says the таск changed,
      // so it must be a count the comparison can divide by. Zero is legal: a
      // verification-only таск is expected to change no product code. Checked
      // at every version, because the field is optional at every version.
      const estimate = entry['estimatedLines'];
      if (estimate !== undefined && (typeof estimate !== 'number' || !Number.isInteger(estimate) || estimate < 0)) {
        add(`${at}.estimatedLines`,
          'estimatedLines must be a whole number of changed lines, tests included, 0 or more — '
          + `got ${JSON.stringify(estimate)}; write the plan's step-2 estimate for this таск, or leave the field out`);
      }

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

      const model = entry['model'];
      if (!atLeastV8) {
        refuseBelowV8(`${at}.model`, model);
      } else if (model === undefined) {
        add(`${at}.model`, `contract 8 requires ${at}.model — write strong or standard, as the plan marked the таск`);
      } else {
        requireOneOf(`${at}.model`, model, MODEL_TIERS);
      }
    });
    requireUniqueIds('tasks', tasks);
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
      if (entry['title'] !== undefined && (typeof entry['title'] !== 'string' || entry['title'].trim() === '')) {
        log.debug('validate', 'requirement title rejected', { field: `${at}.title`, found: typeof entry['title'] });
      }
      optionalString(`${at}.title`, entry['title']);
      if (typeof entry['title'] === 'string' && entry['title'].trim() === '') {
        add(`${at}.title`, `${at}.title is empty — write one English line or leave the field out`);
      }

      const status = entry['status'];
      const reason = entry['reason'];
      if (typeof status === 'string' && REASON_REQUIRED.includes(status)
        && (typeof reason !== 'string' || reason.trim() === '')) {
        add(`${at}.reason`, `требование with status "${status}" has no recorded reason`);
      }
    });
    requireUniqueIds('requirements', requirements);
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
    requireUniqueIds('gates', gates);
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

    // Optional, not required: a contract-7 run already in progress has no
    // `oneWay`, and an added optional field does not raise CONTRACT_VERSION.
    // Preflight seeds it empty, so absence still means "never scanned".
    if (value['oneWay'] !== undefined) {
      requireStringArray('oneWay', value['oneWay']);
      if (Array.isArray(value['oneWay'])) {
        value['oneWay'].forEach((line, position) => {
          if (typeof line === 'string' && !ONE_WAY_LINE.test(line)) {
            add(`oneWay[${position}]`,
              `oneWay[${position}] must start with ${ONE_WAY_KINDS.slice(0, -1).join(', ')} or `
              + `${ONE_WAY_KINDS[ONE_WAY_KINDS.length - 1]} and " — "; write one change per line`);
          }
        });
      }
    }

    // Optional for the reason `oneWay` is, and seeded empty by preflight for
    // the same one: absence means the прогон began before the field existed,
    // which the metrics tool reports as not recorded rather than as none.
    if (value['signals'] !== undefined) {
      requireStringArray('signals', value['signals']);
      if (Array.isArray(value['signals'])) {
        const seen = new Set<string>();
        value['signals'].forEach((line, position) => {
          if (typeof line !== 'string') return;
          const match = SIGNAL_LINE.exec(line);
          if (match === null) {
            add(`signals[${position}]`,
              `signals[${position}] must read "SIG-<n> <kind> — <subject> — <who>", the kind being `
              + `${SIGNAL_KINDS.slice(0, -1).join(', ')} or ${SIGNAL_KINDS[SIGNAL_KINDS.length - 1]}; write one signal per line`);
            return;
          }
          const id = match[1]!;
          if (seen.has(id)) {
            add(`signals[${position}]`, `${id} appears twice; append with the next number`);
          }
          seen.add(id);
        });
      }
    }
  }

  // Optional at every version: a run already in progress has no
  // `existingCode`, and an added optional field does not raise CONTRACT_VERSION.
  // Absence means phase 3 dispatches no reader, exactly as before the field.
  if (value['existingCode'] !== undefined && typeof value['existingCode'] !== 'boolean') {
    add('existingCode',
      'existingCode must be a boolean — write true or false from --memory-read\'s existingCode.present');
  }

  if (atLeastV4) {
    if (typeof value['slug'] !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value['slug'])) {
      add('slug', 'contract-4 slug must be a canonical safe path segment');
    }
  }
  checkRunDir(value, add);
  checkResult(value, add);
  checkLeftovers(value, add);

  // The models each tier runs on. Each half is `session` or a name the host
  // reported; which names the host reports is the dials phase's question, never
  // this file's, so only the shape is held here.
  const models = value['models'];
  if (!atLeastV8) {
    refuseBelowV8('models', models);
  } else if (!isRecord(models)) {
    add('models', 'contract 8 requires models — write { strong, standard }, each "session" or a model name the host reports');
  } else {
    for (const half of MODEL_TIERS) {
      const name = models[half];
      if (typeof name !== 'string' || name.trim() === '') {
        add(`models.${half}`, `models.${half} must be a non-empty string — write "session" to pass no model, or a model name the host reports`);
      }
    }
  }

  if (atLeastV4) {
    requireOneOf('lifecycle', value['lifecycle'], LIFECYCLES);
    optionalOneOf('outcome', value['outcome'], CLOSURE_OUTCOMES);
    optionalString('stopReason', value['stopReason']);
    if (!isRecord(value['verification'])) {
      add('verification', 'contract 4 requires a verification object');
    } else if (Array.isArray(tasks) && Array.isArray(requirements) && Array.isArray(gates)) {
      const record = validateVerificationRecord(value as unknown as RunState, options.historical);
      for (const violation of record) add(violation.field, violation.message);
      // The closure graph is traversed only once the graph it hangs from is sound.
      if (record.length === 0) {
        for (const violation of [...validateClosureRecord(value as unknown as RunState), ...validateDispatchRecord(value as unknown as RunState)]) add(violation.field, violation.message);
      }
    }
  }

  log.debug('validate', 'validation finished', { violations: violations.length });
  return violations;
}

/** A narrowing wrapper for callers that only need the yes/no answer. */
export function isValidState(value: unknown): value is RunState {
  return validateState(value).length === 0;
}
