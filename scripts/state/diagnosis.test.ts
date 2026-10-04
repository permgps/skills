// The diagnosis a repeated repair carries.
//
// The diagnostician used to propose "one grounded next approach", and nothing
// asked it what else could explain the failure. A repeated repair now carries
// three to five ranked hypotheses inside the existing `diagnosis` text, and the
// closure rules refuse one that does not — so a single-hypothesis diagnosis is
// sent back instead of being acted on. The text's shape is all that is held:
// whether the probe is the cheapest, or the reproduction minimal, is judgement.

import test from 'node:test';
import assert from 'node:assert/strict';

import { DIAGNOSIS_HYPOTHESES, readDiagnosis } from './closure.ts';
import { rankedDiagnosis, repairContract6State, v3Attempt } from './fixtures/verification.ts';
import { validateState } from './validate.ts';

const messages = (state: unknown): string => validateState(state).map(item => `${item.field}: ${item.message}`).join('\n');
const minute = (value: number): string => `2026-09-29T10:${String(value).padStart(2, '0')}:00Z`;
const lines = (...rows: string[]): string => rows.join('\n');
const hypothesis = (rank: number, cause = `Cause ${rank}`): string => `H${rank}: ${cause} — falsified by: observation ${rank}`;
const TAIL = ['Probe: read the log — result: leaves H1', 'Reproduction: one call', 'Seam: the unit test'];

/** Task 01 in repair with RA-1 behind it and a repeat RA-2 diagnosed as given. */
function repeated(diagnosis: { hypothesis: string; diagnosis: string }): ReturnType<typeof repairContract6State> {
  const state = repairContract6State();
  state.verification!.repairAttempts = [
    v3Attempt('RA-1', 'F-1', 'DF-1', minute(10)),
    v3Attempt('RA-2', 'F-1', 'DF-1', minute(20), { predecessorId: 'RA-1', repeatKind: 'new_cause_same_surface',
      diagnosisDispatchId: 'diagnosis-1', diagnosisReturnId: 'diagnosis-return-1', novelty: 'accepted', ...diagnosis }),
  ];
  return state;
}

test('three ranked hypotheses with falsifiers, a probe, a reproduction and a seam are a well-formed diagnosis', () => {
  const reading = readDiagnosis(rankedDiagnosis().diagnosis);
  assert.deepEqual(reading.problems, []);
  assert.equal(reading.hypotheses.length, 3);
  assert.deepEqual(reading.hypotheses[0], { rank: 1, cause: 'The hover handler is never bound',
    falsifiedBy: 'a pointer listener on the trigger after mount' });
  assert.equal(reading.seam, 'the menu component\'s pointer test');
  assert.equal(reading.noCorrectSeam, undefined);
});

test('a diagnosis naming one hypothesis is a problem that says how many it named and how many it needs', () => {
  const reading = readDiagnosis(lines(hypothesis(1), ...TAIL));
  assert.equal(reading.problems.length, 1);
  assert.match(reading.problems[0]!, /names 1 hypothesis; send it back to the diagnostician for three to five ranked hypotheses/);
});

test('six hypotheses are more than the ranking can hold', () => {
  const reading = readDiagnosis(lines(...[1, 2, 3, 4, 5, 6].map(rank => hypothesis(rank)), ...TAIL));
  assert.equal(DIAGNOSIS_HYPOTHESES.max, 5);
  assert.match(reading.problems.join('\n'), /names 6 hypotheses/);
});

test('hypotheses numbered out of order or with a gap are not a ranking', () => {
  const gap = readDiagnosis(lines(hypothesis(1), hypothesis(3), hypothesis(4), ...TAIL));
  assert.match(gap.problems.join('\n'), /numbered H1, H3, H4; rank them H1 to H3 in order/);
  const swapped = readDiagnosis(lines(hypothesis(2), hypothesis(1), hypothesis(3), ...TAIL));
  assert.match(swapped.problems.join('\n'), /numbered H2, H1, H3/);
});

test('two hypotheses naming the same cause are one hypothesis counted twice', () => {
  const reading = readDiagnosis(lines(hypothesis(1, 'Stale cache'), hypothesis(2, 'stale cache '), hypothesis(3), ...TAIL));
  assert.match(reading.problems.join('\n'), /H1 and H2 name the same cause/);
});

test('a hypothesis with no observation that falsifies it is a problem', () => {
  const reading = readDiagnosis(lines(hypothesis(1), 'H2: The cache is stale', hypothesis(3), ...TAIL));
  assert.match(reading.problems.join('\n'), /hypothesis H2 names no observation that falsifies it/);
  const empty = readDiagnosis(lines(hypothesis(1), 'H2: The cache is stale — falsified by:   ', hypothesis(3), ...TAIL));
  assert.match(empty.problems.join('\n'), /hypothesis H2 names no observation that falsifies it/);
});

test('a missing probe and a missing reproduction are each their own problem', () => {
  const reading = readDiagnosis(lines(hypothesis(1), hypothesis(2), hypothesis(3), 'Seam: the unit test'));
  const text = reading.problems.join('\n');
  assert.match(text, /names no probe/);
  assert.match(text, /names no reproduction/);
  assert.equal(reading.problems.length, 2);
});

test('a diagnosis names exactly one of a seam and noCorrectSeam, never both and never neither', () => {
  const head = [hypothesis(1), hypothesis(2), hypothesis(3), TAIL[0]!, TAIL[1]!];
  assert.match(readDiagnosis(lines(...head)).problems.join('\n'), /names no seam/);
  assert.match(readDiagnosis(lines(...head, 'Seam: the unit test', 'noCorrectSeam: none exists')).problems.join('\n'),
    /names both a Seam: and a noCorrectSeam:/);
});

test('a noCorrectSeam line is read as the limitation it records', () => {
  const reading = readDiagnosis(rankedDiagnosis({ seam: 'noCorrectSeam' }).diagnosis);
  assert.deepEqual(reading.problems, []);
  assert.equal(reading.seam, undefined);
  assert.match(reading.noCorrectSeam ?? '', /^the hover reaches the panel only through the browser's pointer events/);
});

test('free lines between labelled ones are ignored, and `falsified by:` is matched in any case', () => {
  const reading = readDiagnosis(lines('Ranked by how much of the log each explains.', hypothesis(1),
    'H2: Cause 2 — Falsified By: observation 2', '', hypothesis(3), 'The probe is read-only.', ...TAIL));
  assert.deepEqual(reading.problems, []);
  assert.equal(reading.hypotheses[1]!.falsifiedBy, 'observation 2');
});

test('a first repair stays undiagnosed: its prose diagnosis is accepted', () => {
  const state = repairContract6State();
  state.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(10))];
  assert.deepEqual(validateState(state), []);
});

test('a repeated repair with a well-formed diagnosis is accepted', () => {
  assert.deepEqual(validateState(repeated(rankedDiagnosis())), []);
});

test('a repeated repair whose hypothesis is none of its diagnosis\'s causes is refused', () => {
  const state = repeated({ ...rankedDiagnosis(), hypothesis: 'Something the diagnosis never ranked' });
  assert.match(messages(state), /repairAttempts\[RA-2\]: the attempt's hypothesis is not one of its diagnosis's H causes/);
});

test('a repeated repair inherited from contract 5 keeps its prose diagnosis', () => {
  const state = repeated({ hypothesis: 'Wrong import', diagnosis: 'Launch error' });
  assert.match(messages(state), /repairAttempts\[RA-2\]: a repeat repair's diagnosis names 0 hypotheses/);
  state.verification!.inheritedAttemptIds = ['RA-1', 'RA-2'];
  assert.doesNotMatch(messages(state), /diagnosis/);
});
