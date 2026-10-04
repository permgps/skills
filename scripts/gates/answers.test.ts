import test from 'node:test';
import assert from 'node:assert/strict';

import { checkAnswers, chosenText, parseAnswers, OWN_ANSWER } from './answers.ts';

const OPTION_ONE = 'Оплата картой на сайте';
const OPTION_TWO = 'Оплата при получении';

/** One entry in the shape `phases/2-briefing.md` prescribes, with the parts a test varies. */
function entry({
  heading = 'R03 — способ оплаты',
  answer = 'как советуешь' as string | null,
  chosen = OPTION_ONE as string | null,
  recommended = [true, false],
}: {
  heading?: string; answer?: string | null; chosen?: string | null; recommended?: boolean[];
} = {}): string {
  const mark = (index: number): string =>
    recommended[index] ? ' (recommended — деньги приходят до отправки)' : '';
  return [
    `### ${heading}`,
    'Asked: Как гость платит за заказ?',
    'Options:',
    `1. ${OPTION_ONE}${mark(0)}`,
    `2. ${OPTION_TWO}${mark(1)}`,
    ...(answer === null ? [] : [`Answer: ${answer}`]),
    ...(chosen === null ? [] : [`Chosen: ${chosen}`]),
    '',
  ].join('\n');
}

const findingsFor = (markdown: string) => checkAnswers(parseAnswers(markdown));

test('a delegated answer whose Chosen line carries the recommended option in full passes', () => {
  assert.deepEqual(findingsFor(entry()), []);
});

test('the same delegated answer without a Chosen line is one finding on its требование', () => {
  const findings = findingsFor(entry({ chosen: null }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.requirementId, 'R03');
  assert.match(findings[0]!.message, /no "Chosen:" line/);
});

test('a bare «да» whose Chosen line names no offered option is a finding', () => {
  const findings = findingsFor(entry({ answer: 'да', chosen: 'да' }));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /none of the offered options/);
});

test('an answer the user composed passes when Chosen says own answer', () => {
  assert.deepEqual(findingsFor(entry({
    answer: 'картой, но для оптовиков счёт на юрлицо', chosen: OWN_ANSWER,
  })), []);
});

test('a self-briefed answer passes when Chosen is the recommended option', () => {
  assert.deepEqual(findingsFor(entry({ answer: 'self-briefed' })), []);
});

test('a self-briefed answer that chose the option not recommended is a finding', () => {
  const findings = findingsFor(entry({ answer: 'self-briefed', chosen: OPTION_TWO }));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /not the recommended one/);
});

test('two recommended options and none are each a finding', () => {
  assert.equal(findingsFor(entry({ recommended: [true, true] })).length, 1);
  const none = findingsFor(entry({ recommended: [false, false] }));
  assert.equal(none.length, 1);
  assert.match(none[0]!.message, /0 options are marked/);
});

test('a heading that is a bare R## is a finding, because an id never travels alone', () => {
  const findings = findingsFor(entry({ heading: 'R03' }));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /R03 travels alone/);
});

test('a heading that names no требование at all is a finding with an empty id', () => {
  const findings = findingsFor(entry({ heading: 'Способ оплаты' }));
  assert.deepEqual(findings.map(f => f.requirementId), ['']);
});

test('a missing Answer line is a finding even when Chosen is present', () => {
  const findings = findingsFor(entry({ answer: null }));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /no "Answer:" line/);
});

test('a fact settled by reading and an entry from before the rule are both skipped', () => {
  const markdown = [
    '### R04 — где хранятся заказы',
    'Settled by reading: src/db/schema.ts',
    'Orders live in the `orders` table; nothing to ask.',
    '',
    '### R05',
    'Question: what colour?',
    'Answer: да',
    '',
  ].join('\n');
  assert.deepEqual(findingsFor(markdown), []);
  assert.equal(parseAnswers(markdown).length, 2);
});

test('a Chosen line carrying a contradicts citation still matches its option', () => {
  const chosen = `${OPTION_TWO} — contradicts 2026-09-30 decision, because the shop now ships only locally`;
  assert.deepEqual(findingsFor(entry({ answer: 'при получении', chosen })), []);
  assert.equal(chosenText(chosen), OPTION_TWO);
});

test('a Chosen line carrying a follows citation still matches its option', () => {
  const chosen = `${OPTION_ONE} — follows 2026-09-30 decision (2026-09-30-shop)`;
  assert.deepEqual(findingsFor(entry({ chosen })), []);
});

test('a wrapped question and a wrapped option read back as one value each', () => {
  const markdown = [
    '### R07 — повторная оплата',
    'Asked: Если гость нажмёт «оплатить» дважды,',
    '  что он должен увидеть?',
    'Options:',
    '1. Второе нажатие ничего не делает,',
    '   кнопка уже неактивна (recommended — так не бывает двойных списаний)',
    '2. Второе нажатие показывает «платёж уже идёт»',
    'Answer: первое',
    'Chosen: Второе нажатие ничего не делает, кнопка уже неактивна',
    '',
  ].join('\n');
  const [parsed] = parseAnswers(markdown);
  assert.equal(parsed?.asked, 'Если гость нажмёт «оплатить» дважды, что он должен увидеть?');
  assert.deepEqual(parsed?.options?.map(o => o.recommended), [true, false]);
  assert.deepEqual(checkAnswers(parseAnswers(markdown)), []);
});

test('every entry in a file is checked, not just the first', () => {
  const markdown = [
    entry({ heading: 'R01 — оплата', chosen: null }),
    entry({ heading: 'R02 — доставка' }),
    entry({ heading: 'R03 — возврат', chosen: null }),
  ].join('\n');
  assert.deepEqual(findingsFor(markdown).map(f => f.requirementId), ['R01', 'R03']);
});

test('a level-two heading ends an entry, so its text does not leak into the next one', () => {
  const markdown = `${entry({ chosen: null })}\n## Round 2\nChosen: ${OPTION_ONE}\n`;
  assert.equal(findingsFor(markdown).length, 1);
});
