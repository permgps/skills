#!/usr/bin/env node
// G4 — the gate after приёмка, and the last one of the прогон.
//
// Pass condition, from docs/spec/gates.md: the build is checked against
// manifest/additions after blind discovery, with every current required check
// passing and complete coverage; failed/incomplete evidence stays failed/pending.
//
// The withholding cannot be checked from here. What a script reads is the state
// a прогон left behind, and no field in it records what a reader was handed. So
// this gate checks the other half — that the check happened, that what it found
// was written down against требования that exist, and that the build it judged
// was the one the прогон had finished reviewing. A G4 that ran blind and then
// reported nothing anybody can act on has failed in the only way this file can
// see.

import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import type { RunState } from '../state/contract.ts';
import { deriveVerification } from '../state/verification.ts';
import { runGate, targetFromArgv, type GateFinding } from './cli.ts';

export type { GateFinding };

const log = createLogger('gate-g4');

/** `R01`, `R12` — the manifest's identifier scheme, wherever it appears in prose. */
const REQUIREMENT_ID = /R\d{2,}/g;

export function checkG4(state: RunState): GateFinding[] {
  const findings: GateFinding[] = [];

  const known = new Set(state.requirements.map(requirement => requirement.id).filter(id => id !== ''));
  const gate = state.gates.find(entry => entry.id === 'G4');

  if (state.contractVersion >= 4 && state.verification) {
    const summary = deriveVerification(state);
    if (!gate || gate.status !== summary.g4) findings.push({ requirementId: '',
      message: `G4 must equal the current derived result ${summary.g4}` });
    if (!summary.currentRoundId && state.lifecycle === 'closed'
      && state.outcome === 'completed') findings.push({ requirementId: '',
        message: 'completed closure has no current acceptance round' });
    for (const id of summary.failedIds) findings.push({ requirementId: id,
      message: `requirement ${id} has a current failed verification result` });
    for (const id of summary.incompleteIds) findings.push({ requirementId: id,
      message: `requirement ${id} has incomplete current coverage or execution` });
    if (state.lifecycle === 'closed' && state.outcome === 'completed' && summary.g4 !== 'passed') {
      findings.push({ requirementId: '', message: 'completed closure requires current passing G4' });
    }
    if (state.lifecycle === 'closed'
      && state.verification.promisedWork.some(item => item.status === 'open')) findings.push({
      requirementId: '', message: 'open promised work blocks closure' });
    log.info('g4', 'verification result checked', {
      g4: summary.g4, round: summary.currentRoundId ?? null,
      failed: summary.failedIds.length, incomplete: summary.incompleteIds.length,
    });
    return findings;
  }

  // --- the blind check actually ran -----------------------------------------
  if (gate === undefined) {
    findings.push({
      requirementId: '',
      message: 'the run state has no G4 entry — приёмка left no verdict at all',
    });
  } else if (gate.status === 'pending') {
    findings.push({
      requirementId: '',
      message: 'G4 is still pending — the прогон reached приёмка and the build was never '
        + 'checked against the манифест',
    });
  }

  // --- the verdict agrees with what was found -------------------------------
  if (gate !== undefined && gate.status === 'passed' && gate.findings.length > 0) {
    findings.push({
      requirementId: '',
      message: `G4 is recorded as passed while carrying ${gate.findings.length} finding(s). `
        + 'A gate is never passed with notes: act on each one, or record it as an explicit '
        + 'deferral against a requirement id',
    });
  }
  if (gate !== undefined && gate.status === 'failed' && gate.findings.length === 0) {
    findings.push({
      requirementId: '',
      message: 'G4 is recorded as failed and names nothing — a прогон stopped by приёмка '
        + 'must say which требования disagreed',
    });
  }

  // --- every disagreement names a требование that exists ---------------------
  gate?.findings.forEach((finding, index) => {
    const named = finding.match(REQUIREMENT_ID) ?? [];

    if (named.length === 0) {
      findings.push({
        requirementId: '',
        message: `G4 finding ${index + 1} names no требование — a disagreement nobody can `
          + 'trace back to the манифест cannot be acted on',
      });
      return;
    }

    for (const id of named) {
      if (!known.has(id)) {
        findings.push({
          requirementId: id,
          message: `G4 finding ${index + 1} names ${id}, which is not in the манифест`,
        });
      }
    }
  });

  // --- the build judged was the one the прогон had finished ------------------
  for (const task of state.tasks) {
    if (task.status !== 'done') {
      findings.push({
        requirementId: task.id === '' ? '' : task.id,
        message: `таск ${task.id === '' ? '(unnamed)' : task.id} is "${task.status}" at приёмка `
          + '— the build in front of the reader is not one the прогон had accepted',
      });
    }
  }

  log.info('g4', 'acceptance checked', {
    status: gate?.status ?? 'absent',
    disagreements: gate?.findings.length ?? 0,
    requirements: state.requirements.length,
    tasks: state.tasks.length,
  });

  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runGate('check-g4', checkG4, targetFromArgv()));
}
