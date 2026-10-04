#!/usr/bin/env node
// G1 — the gate after брифинг.
//
// Pass condition, from docs/spec/gates.md: every требование has a status, and
// none is left open without a recorded reason. Every question put to the user
// is recorded in `answers.md` with one recommended option and the option the
// reply chose, written out in full (`./answers.ts`).
//
// This is the mechanical half. The other half — whether the recorded reason is
// a real answer or a placeholder somebody typed to get past the gate — is the
// phase file's business, because it needs the брифинг in front of it.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import type { RunState, RequirementStatus } from '../state/contract.ts';
import { hasFreshManifestAudit } from '../state/verification.ts';
import { forState, ROOT } from '../state/paths.ts';
import { checkAnswers, parseAnswers } from './answers.ts';
import { runGate, targetFromArgv, type GateFinding } from './cli.ts';

export type { GateFinding };

const log = createLogger('gate-g1');

/** Statuses that are incomplete without a reason. */
const REASON_REQUIRED: RequirementStatus[] = ['open', 'deferred', 'dropped'];

export function checkG1(state: RunState): GateFinding[] {
  const findings: GateFinding[] = [];
  const counts = new Map<string, number>();
  const seen = new Set<string>();

  state.requirements.forEach((requirement, index) => {
    const id = requirement.id === '' ? `requirements[${index}]` : requirement.id;
    counts.set(requirement.status, (counts.get(requirement.status) ?? 0) + 1);

    if (seen.has(id)) {
      findings.push({ requirementId: id, message: `requirement id ${id} appears more than once` });
    }
    seen.add(id);

    if (REASON_REQUIRED.includes(requirement.status)
      && (requirement.reason === undefined || requirement.reason.trim() === '')) {
      findings.push({
        requirementId: id,
        message: `требование ${id} is "${requirement.status}" with no recorded reason`,
      });
    }
  });

  if (state.requirements.length === 0) {
    findings.push({
      requirementId: '',
      message: 'the манифест has no требования — nothing was recorded from the бриф',
    });
  }

  if (state.contractVersion >= 5 && (!state.verification || state.verification.version === 1
    || !hasFreshManifestAudit(state.verification, state.requirements.map(item => item.id)) || !state.verification.scopeBaseline)) {
    findings.push({ requirementId: '', message: 'G1 requires a fresh independent source audit and frozen original agreement' });
    log.warn('audit', 'source agreement is not established', { runId: state.runId });
  }
  log.info('g1', 'requirements checked', {
    total: state.requirements.length,
    ...Object.fromEntries(counts),
  });

  return findings;
}

/**
 * The answers half of G1: `answers.md` of the run the state describes.
 *
 * A missing file is zero entries, not a finding — a бриф that opens no forks
 * writes nothing, and that is a normal бриф. Any other failure to read is
 * rethrown, so the gate exits `2` instead of passing over a file it never saw.
 */
export async function checkG1Answers(state: RunState, target: string): Promise<GateFinding[]> {
  const file = path.join(target, path.relative(ROOT, forState(state).answers()));
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      log.debug('answers', 'answers.md resolved', { path: file, found: false });
      return [];
    }
    throw error;
  }
  log.debug('answers', 'answers.md resolved', { path: file, found: true });

  const entries = parseAnswers(text);
  if (entries.length === 0 && state.mode !== 'full'
    && state.requirements.some(requirement => requirement.status === 'in-spec')) {
    log.warn('answers', 'answers.md exists but holds no entries', { path: file, mode: state.mode });
  }
  return checkAnswers(entries);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runGate('check-g1', checkG1, targetFromArgv(), checkG1Answers));
}
