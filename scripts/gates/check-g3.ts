#!/usr/bin/env node
// G3 — the gate after the plan phase.
//
// Pass condition, from docs/spec/gates.md: every in-spec требование maps to at
// least one таск, every таск traces back to at least one требование, and a
// reader given exactly what an executor will be given finds each task file
// buildable without asking a question. Two mechanical rules came from a run
// whose repairs kept reopening each other: таски sharing a path in `files` or
// `zone` are ordered by `blockedBy`, and a check's execution owner transitively
// depends on every integration prerequisite of that check.
//
// Both directions of the map, because either alone is worth little. A cut can
// cover every требование and still carry two таски invented along the way; it
// can be perfectly traceable while quietly leaving a требование out. The gate is
// the map, and a map with an unmatched entry on either side is not a map.
//
// The third half is not mechanical — like G2's reader, it is a subagent's
// verdict — so what this script checks is the trace it leaves. The first
// end-to-end прогон is why it exists: four of five task files contradicted
// themselves or left something undefined, every one of them passed the map, and
// the one whose executor had nothing to fall back on shipped wrong.
//
// From contract 8 it also holds who builds each таск. A producer of a seam and
// the skeleton are `strong` by rule, so a machine can check them: the Seams
// table of `interfaces.md` names the producers, the waves name the skeleton, and
// each task file's `Model` row must agree with `tasks[].model`. From contract 8
// it also holds that a comparable reaches the таски that build what it shows:
// each task file's `References` row cites `REF-*` ids the register in
// `state.verification.references` holds, each with a location, and every
// available visual reference and contextual example is cited by some таск. The
// `Model` and `References` rows are all it reads of a task file — whether the
// task files agree with each other is still the plan-consistency reader's verdict.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import type { ReferenceRole, RunState } from '../state/contract.ts';
import { forState, ROOT } from '../state/paths.ts';
import { validateCompletionRecords } from '../state/verification.ts';
import { runGate, targetFromArgv, type GateFinding } from './cli.ts';

export type { GateFinding };

const log = createLogger('gate-g3');

/**
 * Every таск reachable through `blockedBy` from `id`, the таск itself excluded.
 * A visited set rather than recursion, so a cycle — reported elsewhere — ends the walk.
 */
function upstreamOf(id: string, blockers: Map<string, string[]>): Set<string> {
  const reached = new Set<string>();
  const pending = [...(blockers.get(id) ?? [])];
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (next === id || reached.has(next)) continue;
    reached.add(next);
    pending.push(...(blockers.get(next) ?? []));
  }
  return reached;
}

export function checkG3(state: RunState): GateFinding[] {
  const findings: GateFinding[] = [];
  const blockers = new Map(state.tasks.map(task => [task.id, task.blockedBy]));
  const upstream = new Map<string, Set<string>>();
  const ancestors = (id: string): Set<string> => {
    let known = upstream.get(id);
    if (!known) upstream.set(id, known = upstreamOf(id, blockers));
    return known;
  };

  const status = new Map<string, string>();
  for (const requirement of state.requirements) {
    if (requirement.id !== '') status.set(requirement.id, requirement.status);
  }

  // --- forward: every таск traces to требования that exist and are live -----
  const reached = new Set<string>();
  const seenTasks = new Set<string>();
  let edges = 0;

  state.tasks.forEach((task, index) => {
    const taskId = task.id === '' ? `tasks[${index}]` : task.id;

    if (seenTasks.has(taskId)) {
      findings.push({ requirementId: taskId, message: `таск id ${taskId} appears more than once` });
    }
    seenTasks.add(taskId);

    // An empty requirementIds is refused by the state validator before a gate
    // ever sees it; re-checking it here would put one rule in two places.
    for (const requirementId of task.requirementIds) {
      edges += 1;
      const requirementStatus = status.get(requirementId);

      if (requirementStatus === undefined) {
        findings.push({
          requirementId,
          message: `таск ${taskId} traces to ${requirementId}, which is not in the манифест`,
        });
        continue;
      }
      if (requirementStatus !== 'in-spec') {
        findings.push({
          requirementId,
          message: `таск ${taskId} traces to ${requirementId}, which is "${requirementStatus}" `
            + '— building it is work nobody asked for',
        });
        continue;
      }
      reached.add(requirementId);
    }
  });

  // --- backward: every in-spec требование was reached by some таск ----------
  for (const [id, requirementStatus] of status) {
    if (requirementStatus === 'in-spec' && !reached.has(id)) {
      findings.push({
        requirementId: id,
        message: `требование ${id} is in-spec and no таск builds it — it was dropped `
          + 'between the specification and the cut',
      });
    }
  }

  // --- two таски writing one path are ordered, or they collide --------------
  // Waves keep wave-mates apart and say nothing about таски in different waves
  // that never wait for each other: two such таски that share a route file both
  // land, and the second one's review judges the first one's code.
  const writers = new Map<string, string[]>();
  for (const task of state.tasks) {
    for (const path of new Set([...(task.files ?? []), ...(task.zone ?? [])])) {
      writers.set(path, [...(writers.get(path) ?? []), task.id]);
    }
  }
  let collisions = 0;
  const reportedPairs = new Set<string>();
  for (const [path, owners] of writers) {
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) {
        const [a, b] = [owners[i]!, owners[j]!];
        if (a === b || ancestors(a).has(b) || ancestors(b).has(a)) continue;
        const pair = [a, b].sort().join('/');
        if (reportedPairs.has(pair)) continue;
        reportedPairs.add(pair);
        collisions += 1;
        findings.push({ requirementId: a,
          message: `таски ${a} and ${b} both write ${path} and neither waits for the other — `
            + `add one to the other's blockedBy, or move ${path} into one таск` });
      }
    }
  }
  log.debug('g3', 'file ownership checked', { paths: writers.size, collisions });

  if (state.contractVersion >= 4 && state.verification) {
    const record = state.verification;
    if (record.version !== 1) {
      for (const violation of validateCompletionRecords(state, record)) findings.push({ requirementId: '',
        message: `${violation.field}: ${violation.message}` });
    }
    const tasks = new Map(state.tasks.map(task => [task.id, task]));
    const checks = new Map(record.checks.map(check => [check.id, check]));
    const obligations = record.obligations.filter(item => item.targetRevision === record.targetRevision);
    const covered = new Set<string>();
    for (const obligation of obligations) {
      for (const requirementId of obligation.requirementIds) covered.add(requirementId);
      const requiredChecks = obligation.checkIds.map(id => checks.get(id)).filter(check => check?.required);
      if (requiredChecks.length === 0) findings.push({ requirementId: obligation.requirementIds[0] ?? '',
        message: `obligation ${obligation.id} has no required executable check` });
      for (const ownerId of obligation.implementationTaskIds) {
        const owner = tasks.get(ownerId);
        if (!owner || !obligation.requirementIds.some(id => owner.requirementIds.includes(id))) {
          findings.push({ requirementId: obligation.requirementIds[0] ?? '',
            message: `obligation ${obligation.id} has no matching implementation owner ${ownerId}` });
        }
      }
      for (const check of requiredChecks) {
        if (!check) continue;
        const executionOwner = check.executionTaskId ? tasks.get(check.executionTaskId) : undefined;
        if (!executionOwner || !obligation.requirementIds.some(id => executionOwner.requirementIds.includes(id))) {
          findings.push({ requirementId: obligation.requirementIds[0] ?? '',
            message: `check ${check.id} has no matching execution owner` });
        }
        for (const dependency of obligation.implementationTaskIds) {
          if (!check.integrationDependencies.includes(dependency)) findings.push({
            requirementId: obligation.requirementIds[0] ?? '',
            message: `check ${check.id} omits implementation prerequisite ${dependency}` });
        }
        for (const dependency of check.integrationDependencies) {
          if (!tasks.has(dependency)) findings.push({ requirementId: obligation.requirementIds[0] ?? '',
            message: `check ${check.id} has missing integration prerequisite ${dependency}` });
          else if (executionOwner && dependency !== executionOwner.id
            && !ancestors(executionOwner.id).has(dependency)) findings.push({
            requirementId: obligation.requirementIds[0] ?? '',
            message: `execution owner ${executionOwner.id} of check ${check.id} does not transitively depend on `
              + `integration prerequisite ${dependency} — add ${dependency} to the blockedBy chain of ${executionOwner.id}` });
        }
        if (check.method.includes('source') && /browser|pointer|keyboard|hover|visible/i.test(obligation.expectation)) {
          findings.push({ requirementId: obligation.requirementIds[0] ?? '',
            message: `source-only check ${check.id} cannot establish UI behavior ${obligation.id}` });
        }
      }
    }
    for (const [id, requirementStatus] of status) {
      if (requirementStatus === 'in-spec' && !covered.has(id)) findings.push({ requirementId: id,
        message: `requirement ${id} has no current observable obligation` });
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        findings.push({ requirementId: id, message: `task dependency cycle includes ${id}` });
        return;
      }
      visiting.add(id);
      for (const dependency of tasks.get(id)?.blockedBy ?? []) {
        if (!tasks.has(dependency)) findings.push({ requirementId: id,
          message: `task ${id} has missing prerequisite ${dependency}` });
        else visit(dependency);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of tasks.keys()) visit(id);
    log.info('verification', 'ownership graph checked', {
      obligations: obligations.length, checks: record.checks.length, tasks: tasks.size,
    });
  }

  // --- the task-file reader's verdict was recorded, not filed ---------------
  const gate = state.gates.find(entry => entry.id === 'G3');
  if (gate === undefined) {
    findings.push({
      requirementId: '',
      message: 'the run state has no G3 entry — the task-file reader left no verdict',
    });
  } else if (gate.status === 'passed' && gate.findings.length > 0) {
    findings.push({
      requirementId: '',
      message: `G3 is recorded as passed while carrying ${gate.findings.length} finding(s). `
        + 'A gate is never passed with notes: fix each task file, or record the finding as an '
        + 'explicit deferral against a requirement id',
    });
  }

  log.info('g3', 'traceability map built', {
    tasks: state.tasks.length,
    requirements: state.requirements.length,
    inSpec: [...status.values()].filter(value => value === 'in-spec').length,
    edges,
  });

  return findings;
}

/** A seam's or a reference's text as a finding quotes it: no markup, at most 60 characters. */
const name = (text: string): string => text.replace(/[`*]/g, '').slice(0, 60);

/** The Seams table's header, exactly as `4-plan.md` fixes it. */
export const SEAMS_HEADER = '| Seam | Producer task | Consumer tasks | Integration owner | Integration check |';

/** One id, or a range written with an en dash or a hyphen. */
const PRODUCER_TOKEN = /^(\d{2,})(?:\s*[–-]\s*(\d{2,}))?/;

/**
 * The most ids one range may name. No plan is cut into a thousand таски, and a
 * cell such as `00000000–99999999` would otherwise be expanded into memory
 * before a single finding was written.
 */
const MAX_RANGE = 999;

/**
 * The таск ids a Producer task cell starts with: `02`, `02, 05`, `02–13`, and
 * any prose after them (`02–13, one file each`). A range is read only when its
 * endpoints share a width, run forwards and name at most {@link MAX_RANGE}
 * ids; anything else — a date such as `2026-10-11`, `13–02`, `01–99999999` —
 * ends the ids there, because guessing which таски it meant would hide the
 * typo. `null` when the cell starts with no id, because a producer named only
 * in words is a producer no machine can find.
 */
export function parseProducerIds(cell: string): string[] | null {
  let rest = cell.replace(/[`*]/g, '').trim();
  const ids: string[] = [];
  for (;;) {
    const match = PRODUCER_TOKEN.exec(rest);
    if (!match) break;
    const [first, last] = [match[1]!, match[2] ?? match[1]!];
    const [from, to] = [Number(first), Number(last)];
    if (first.length !== last.length || to < from || to - from >= MAX_RANGE) {
      log.debug('producers', 'range refused', { first, last });
      break;
    }
    for (let id = from; id <= to; id += 1) ids.push(String(id).padStart(first.length, '0'));
    rest = rest.slice(match[0].length);
    const separator = /^\s*,\s*(?=\d{2,})/.exec(rest);
    if (!separator) break;
    rest = rest.slice(separator[0].length);
  }
  return ids.length === 0 ? null : ids;
}

/** Each row under {@link SEAMS_HEADER}: the seam's name and its Producer task cell. */
function seamRows(markdown: string): Array<{ seam: string; producer: string }> {
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => line.trim().replace(/\s+/g, ' ') === SEAMS_HEADER);
  if (start === -1) return [];
  const rows: Array<{ seam: string; producer: string }> = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
    rows.push({ seam: cells[0] ?? '', producer: cells[1] ?? '' });
  }
  return rows;
}

/**
 * The first word of a task file's `| Model |` row, backticked or bare, in lower
 * case, or `null` when there is no row. The label may be bold and either word
 * capitalised: a hand-edited file that says `| **Model** | Strong |` means
 * `strong`, and reporting it as a missing row would send someone to add a row
 * that is already there.
 */
function modelRow(markdown: string): string | null {
  const row = /^\|\s*\**\s*model\s*\**\s*\|([^|\n]*)\|/im.exec(markdown);
  if (!row) return null;
  return /`?([a-z]+)`?/i.exec(row[1] ?? '')?.[1]?.toLowerCase() ?? '';
}

/**
 * The models half of G3, from contract 8: every producer and the skeleton are
 * `strong`, and every task file's `Model` row says what `tasks[].model` says.
 * A missing `interfaces.md` or tasks directory throws — the gate exits `2`,
 * because nothing was checked.
 */
export async function checkG3Models(state: RunState, target: string): Promise<GateFinding[]> {
  if (state.contractVersion < 8) return [];
  const paths = forState(state);
  const underTarget = (file: string): string => path.join(target, path.relative(ROOT, file));
  const interfaces = await readFile(underTarget(paths.interfaces()), 'utf8');
  const tasksDir = underTarget(paths.tasksDir());
  const taskFiles = (await readdir(tasksDir)).filter(name => name.endsWith('.md') && !name.endsWith('-handoff.md'));

  const findings: GateFinding[] = [];
  const tasks = new Map(state.tasks.map(task => [task.id, task]));

  const producers = new Map<string, string>();
  const rows = seamRows(interfaces);
  for (const row of rows) {
    const ids = parseProducerIds(row.producer);
    if (ids === null) {
      findings.push({ requirementId: '',
        message: `the seam «${name(row.seam)}» names its producer as "${row.producer}" — name the producer by its таск id, first in the Producer task cell: \`02\`, \`02, 05\`, or a forward range \`02–13\`` });
      continue;
    }
    for (const id of ids) {
      if (!tasks.has(id)) {
        findings.push({ requirementId: '',
          message: `the seam «${name(row.seam)}» names producer ${id}, which is not a таск of this plan — name the таск that produces it` });
      } else if (!producers.has(id)) {
        producers.set(id, row.seam);
      }
    }
  }
  log.debug('seams', 'seams read', { rows: rows.length, producers: [...producers.keys()] });

  for (const [id, seam] of producers) {
    if (tasks.get(id)?.model !== 'strong') {
      findings.push({ requirementId: id, message: `mark таск ${id} \`strong\`: it produces the seam «${name(seam)}»` });
    }
  }

  const firstWave = state.tasks.filter(task => task.wave === 1);
  const skeleton = firstWave.length === 1 ? firstWave[0]! : undefined;
  log.debug('skeleton', 'skeleton found', { id: skeleton?.id ?? null });
  if (skeleton && skeleton.model !== 'strong' && !producers.has(skeleton.id)) {
    findings.push({ requirementId: skeleton.id,
      message: `mark таск ${skeleton.id} \`strong\`: it is the skeleton, the sole таск of wave 1` });
  }

  for (const task of state.tasks) {
    const file = taskFiles.find(entry => entry.startsWith(`${task.id}-`));
    if (file === undefined) {
      findings.push({ requirementId: task.id,
        message: `no task file for таск ${task.id} in tasks/ — write ${task.id}-<slug>.md with its \`| Model | ${task.model ?? 'strong or standard'} |\` row, as the plan phase cuts it` });
      continue;
    }
    const written = modelRow(await readFile(path.join(tasksDir, file), 'utf8'));
    if (written === null) {
      findings.push({ requirementId: task.id,
        message: `task file for таск ${task.id} has no Model row — add \`| Model | ${task.model ?? 'strong or standard'} |\` between Depends on and Prerequisites` });
    } else if (written !== task.model) {
      findings.push({ requirementId: task.id,
        message: `task file ${file} says Model ${written || '(empty)'}, and the run state says ${task.model ?? 'nothing'} — write the same tier in both` });
    }
  }
  log.info('models', 'producers, skeleton and model rows checked', { findings: findings.length });
  return findings;
}

/**
 * The cell of a task file's `| References |` row, trimmed, or `null` when there
 * is no row. Found with the tolerance {@link modelRow} has: a bold label or a
 * capitalised one is the row that is already there.
 */
export function referencesRow(markdown: string): string | null {
  const row = /^\|\s*\**\s*references\s*\**\s*\|([^|\n]*)\|/im.exec(markdown);
  return row ? (row[1] ?? '').trim() : null;
}

/** A cited id: backticked, so «supersedes REF-3» in a location stays prose. */
const REFERENCE_ID = /`(REF-[A-Za-z0-9-]+)`/g;

/**
 * The entries of a References cell: `none`, or each backticked `REF-*` id with
 * the text up to the next id as its location. `null` when the cell is neither,
 * because a row that names references in words is a row no machine can check.
 */
export function parseReferenceEntries(cell: string): { none: boolean; entries: { id: string; location: string }[] } | null {
  if (cell.replace(/[`*]/g, '').trim().toLowerCase() === 'none') return { none: true, entries: [] };
  const ids = [...cell.matchAll(REFERENCE_ID)];
  if (ids.length === 0) return null;
  const entries = ids.map((match, index) => {
    const start = match.index + match[0].length;
    const end = ids[index + 1]?.index ?? cell.length;
    const location = cell.slice(start, end).replace(/^[\s—–\-:,;]+/, '').replace(/[\s,;`]+$/, '');
    return { id: match[1]!, location };
  });
  return { none: false, entries };
}

/**
 * The roles a таск must cite when available. An authoritative behaviour reaches
 * its таски through `verification.obligations[].implementationTaskIds`, which the
 * map half already checks; `other` is no look to follow.
 */
const REQUIRED_ROLES: readonly ReferenceRole[] = ['visual_reference', 'contextual_example'];

/**
 * The references half of G3, from contract 8: every task file has a References
 * row, each cited id is one the register holds and carries a location, and every
 * available visual reference and contextual example is cited by some таск. It
 * reads the register from the state, never `reference.md`, which is only its
 * projection. A таск with no task file is the models half's finding, not this one's.
 */
export async function checkG3References(state: RunState, target: string): Promise<GateFinding[]> {
  if (state.contractVersion < 8) return [];
  const tasksDir = path.join(target, path.relative(ROOT, forState(state).tasksDir()));
  const taskFiles = (await readdir(tasksDir)).filter(file => file.endsWith('.md') && !file.endsWith('-handoff.md'));
  const register = state.verification?.references ?? [];
  const held = new Set(register.map(reference => reference.id));

  const findings: GateFinding[] = [];
  const citedBy = new Map<string, string[]>();
  for (const task of state.tasks) {
    const file = taskFiles.find(entry => entry.startsWith(`${task.id}-`));
    if (file === undefined) continue;
    const cell = referencesRow(await readFile(path.join(tasksDir, file), 'utf8'));
    if (cell === null) {
      findings.push({ requirementId: task.id,
        message: `task file for таск ${task.id} has no References row — add \`| References | none |\` or the \`REF-*\` ids it follows, each with its location, after User contract and authority` });
      continue;
    }
    const parsed = parseReferenceEntries(cell);
    log.debug('references', 'references row read', { task: task.id, none: parsed?.none ?? false, ids: parsed?.entries.map(entry => entry.id) ?? null });
    if (parsed === null) {
      findings.push({ requirementId: task.id,
        message: `task file ${file} References row reads "${cell.slice(0, 60)}" — write \`none\` or each followed reference as \`REF-n\` in backticks followed by its location` });
      continue;
    }
    for (const entry of parsed.entries) {
      if (entry.location === '') {
        findings.push({ requirementId: task.id,
          message: `task file ${file} cites ${entry.id} with no location — write where the executor opens it` });
      }
      if (!held.has(entry.id)) {
        findings.push({ requirementId: task.id,
          message: `task file ${file} cites ${entry.id}, which the reference register does not hold — cite a REF id from reference.md or remove it` });
        continue;
      }
      citedBy.set(entry.id, [...(citedBy.get(entry.id) ?? []), task.id]);
    }
  }

  const required = register.filter(reference => reference.available === true && REQUIRED_ROLES.includes(reference.role));
  for (const reference of required) {
    const tasks = citedBy.get(reference.id) ?? [];
    log.debug('references', 'required reference checked', { ref: reference.id, citedBy: tasks });
    if (tasks.length > 0) continue;
    findings.push({ requirementId: '',
      message: `no таск cites ${reference.id} (${reference.role.replace(/_/g, ' ')}: ${name(reference.location)}) — add it to the References row of each таск that builds what it shows` });
  }
  log.info('references', 'references rows checked', { required: required.length, findings: findings.length });
  return findings;
}

/**
 * Both file halves of G3, in one call: `runGate` takes one file check, and the
 * models and references halves read the same task files for different rows.
 */
export async function checkG3Files(state: RunState, target: string): Promise<GateFinding[]> {
  return [...await checkG3Models(state, target), ...await checkG3References(state, target)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runGate('check-g3', checkG3, targetFromArgv(), checkG3Files));
}
