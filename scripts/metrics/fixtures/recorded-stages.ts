// The stage stamps of the six finished прогоны on record, and nothing else.
//
// They are the only measurement of how long review and acceptance take against
// development, and «Осталось» needs that share before either stage has run.
// The states themselves cannot be read here: five of the six were written by
// contracts 1–3, and `readState` rejects them, as it should. So the build,
// review and acceptance stamps were copied once, by hand, out of
// `test2/.maestro/<slug>/state-final.js`, `test2/.maestro/state.js` and
// `shadle/.maestro/state.js` on 2026-10-12. No title, no requirement, no text
// came with them.
//
// A new прогон is added by appending its three stages from `measure` and
// re-running `node scripts/metrics/shares.ts`; `shares.test.ts` then fails until
// the page's `STAGE_SHARE` and the table in `docs/spec/dashboard.md` follow.
//
// None of the six recorded its waits, so every span here is wall time with the
// user's pauses inside it. `school-timetable` was stamped after the fact: its
// review spans two days and its acceptance is zero-width.

export interface RecordedStage {
  id: 'build' | 'review' | 'acceptance';
  startedAt?: string;
  finishedAt?: string;
}

export interface RecordedRun {
  runId: string;
  contractVersion: number;
  stages: readonly RecordedStage[];
}

export const RECORDED_STAGES: readonly RecordedRun[] = [
  {
    runId: 'maestro-tic-tac-toe-20260819',
    contractVersion: 1,
    stages: [
      { id: 'build', startedAt: '2026-08-19T16:30:32Z', finishedAt: '2026-08-19T16:56:34Z' },
      { id: 'review', startedAt: '2026-08-19T16:56:34Z', finishedAt: '2026-08-19T17:07:20Z' },
      { id: 'acceptance', startedAt: '2026-08-19T17:07:20Z', finishedAt: '2026-08-19T17:13:01Z' },
    ],
  },
  {
    runId: 'maestro-run-2026-08-19-daynight',
    contractVersion: 1,
    stages: [
      { id: 'build', startedAt: '2026-08-19T17:20:46Z', finishedAt: '2026-08-19T17:30:32Z' },
      { id: 'review', startedAt: '2026-08-19T17:30:32Z', finishedAt: '2026-08-19T17:40:15Z' },
      { id: 'acceptance', startedAt: '2026-08-19T17:40:15Z', finishedAt: '2026-08-19T17:44:03Z' },
    ],
  },
  {
    runId: 'maestro-board-sizes-2026-08-19',
    contractVersion: 2,
    stages: [
      { id: 'build', startedAt: '2026-08-19T19:06:52Z', finishedAt: '2026-08-19T19:56:51Z' },
      { id: 'review', startedAt: '2026-08-19T20:31:24Z', finishedAt: '2026-08-19T21:27:04Z' },
      { id: 'acceptance', startedAt: '2026-08-19T21:27:04Z', finishedAt: '2026-08-19T21:31:32Z' },
    ],
  },
  {
    runId: 'maestro-cube-3d-2026-08-20',
    contractVersion: 2,
    stages: [
      { id: 'build', startedAt: '2026-08-20T11:26:17Z', finishedAt: '2026-08-20T13:02:52Z' },
      { id: 'review', startedAt: '2026-08-20T13:02:52Z', finishedAt: '2026-08-20T13:10:02Z' },
      { id: 'acceptance', startedAt: '2026-08-20T13:10:02Z', finishedAt: '2026-08-20T13:30:39Z' },
    ],
  },
  {
    runId: 'maestro-run-2026-08-20',
    contractVersion: 2,
    stages: [
      { id: 'build', startedAt: '2026-08-20T16:58:26Z', finishedAt: '2026-08-20T17:42:28Z' },
      { id: 'review', startedAt: '2026-08-20T17:42:28Z', finishedAt: '2026-08-20T17:46:28Z' },
      { id: 'acceptance', startedAt: '2026-08-20T17:46:28Z', finishedAt: '2026-08-20T19:15:20Z' },
    ],
  },
  {
    runId: 'school-timetable-2026-08-21b',
    contractVersion: 3,
    stages: [
      { id: 'build', startedAt: '2026-08-21T00:35:19Z', finishedAt: '2026-08-21T16:35:00Z' },
      { id: 'review', startedAt: '2026-08-21T16:35:00Z', finishedAt: '2026-08-23T11:08:18Z' },
      { id: 'acceptance', startedAt: '2026-08-23T11:08:18Z', finishedAt: '2026-08-23T11:08:18Z' },
    ],
  },
];
