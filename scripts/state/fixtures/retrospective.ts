// A synthetic contract-6 run shaped like the failed run the retrospective
// describes. Nothing here is real run data: the IDs, titles and texts are
// invented, and only the shape is kept — twenty-two tasks, an upstream schema
// task that downstream tasks wait on, one broad root finding that holds five
// causes, a readiness record whose bootstrap failed in setup, and a batch of
// repair attempts that closed no task.

import type { ReadinessProbe, TaskEntry } from '../contract.ts';
import { defect, finding, repairContract6State, sha256, v3Attempt } from './verification.ts';

export const minute = (value: number): string =>
  `2026-09-29T1${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}:00Z`;

/** The five causes the broad root F-1 actually held, each its own defect. */
export const BROAD_CAUSES = [
  'Totals read the field the schema renamed',
  'The empty list renders no placeholder',
  'Translated labels are applied after mount',
  'The pager drops the locale from its links',
  'The export button posts to the old route',
] as const;

export const bootstrapDenied: ReadinessProbe = { kind: 'bootstrap', result: 'setup_failed', evidenceIds: [],
  limitation: 'the verification copy root is denied by the file-access restriction' };

/**
 * Task 01 is the parent of the broad root and owns check C-1. Task 02 is the
 * upstream schema task, still in repair. Task 04 waits on 02 and is in repair
 * itself; 05–22 wait on 04. Root F-1 is split into DF-1 … DF-5, and roots F-2 …
 * F-9 each hold one more defect of task 01 for the batch.
 */
export function retrospectiveState(): ReturnType<typeof repairContract6State> {
  const state = repairContract6State();
  const parent = state.tasks[0]!;
  const task = (id: string, extra: Partial<TaskEntry>): TaskEntry => ({ ...parent, id, title: `Synthetic task ${id}`,
    status: 'queued', blockedBy: [], repairs: 0, commits: [], ...extra });
  delete parent.finishedAt;
  state.tasks.push(task('02', { title: 'Schema and DTOs', status: 'repair', repairs: 1, commits: ['0a0a0a0'] }));
  state.tasks.push(task('03', {}));
  state.tasks.push(task('04', { title: 'Orders screen', status: 'repair', repairs: 1, blockedBy: ['02'], commits: ['0c0c0c0'] }));
  for (let index = 5; index <= 22; index += 1) state.tasks.push(task(String(index).padStart(2, '0'), { blockedBy: ['04'] }));

  const record = state.verification!;
  record.findings = [
    finding('F-1', { description: 'Orders page is broken' }),
    ...Array.from({ length: 8 }, (_, index) => finding(`F-${index + 2}`)),
    finding('F-10', { description: 'Schema omits the renamed total field' }),
    finding('F-11', { description: 'Orders screen reads totals the schema does not yet provide' }),
  ];
  record.defects = [
    ...BROAD_CAUSES.map((counterexample, index) => defect(`DF-${index + 1}`, 'F-1', { counterexample })),
    ...Array.from({ length: 8 }, (_, index) => defect(`DF-${index + 6}`, `F-${index + 2}`)),
    defect('DF-14', 'F-10', { parentTaskId: '02', residualParentCriteria: [] }),
    defect('DF-15', 'F-11', { parentTaskId: '04', residualParentCriteria: [] }),
  ];
  return state;
}

/** The batch as it happened: eight bounded repairs on roots F-2 … F-9, ten minutes apart. */
export function batchAttempts(count = 8): ReturnType<typeof v3Attempt>[] {
  return Array.from({ length: count }, (_, index) =>
    v3Attempt(`RA-${index + 1}`, `F-${index + 2}`, `DF-${index + 6}`, minute(20 + index * 10)));
}

/** A superseding readiness record: the copy's root allowed, bootstrap passed. */
export function correctedReadiness(state: ReturnType<typeof retrospectiveState>): void {
  const record = state.verification!;
  record.evidence.push({ id: 'E-RD-2', path: 'evidence/RD-2/probes.txt', sha256: sha256('bootstrap:passed\n'),
    mediaType: 'text/plain', capturedAt: '2026-09-29T09:14:30Z', origin: 'execution' });
  record.readiness.push({ ...record.readiness[0]!, id: 'RD-2', supersedes: 'RD-1', executedAt: '2026-09-29T09:14:30Z',
    probes: (['source_identity', 'secrets_excluded', 'browser', 'bootstrap'] as const)
      .map(kind => ({ kind, result: 'passed' as const, evidenceIds: ['E-RD-2'] })) });
}
