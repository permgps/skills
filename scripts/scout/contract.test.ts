import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  checkBrief,
  checkGrillQuestion,
  checkProposal,
  resolveDelegatedReply,
  type BriefLine,
  type GrillOption,
  type GrillQuestion,
  type Proposal,
} from './contract.ts';

const user = (text: string): BriefLine => ({ text, source: { kind: 'user' } });

// --- the composed бриф -----------------------------------------------------

test('a бриф of plain lines in the user\'s words passes', () => {
  assert.deepEqual(
    checkBrief([
      user('Учитель не ставится в два кабинета в одно и то же время'),
      user('Расписание составляется на неделю'),
      { text: 'У старших классов не больше одного окна в день',
        source: { kind: 'accepted', proposal: 'P03' } },
    ]),
    [],
  );
});

test('two things joined by "и" on one line fail', () => {
  const violations = checkBrief([
    user('Учителя не ставятся в два кабинета одновременно, и окна у старших классов не больше одного'),
  ]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'shape');
  assert.match(violations[0]?.message ?? '', /joins two things/);
});

test('two things joined by "and" on one line fail', () => {
  const violations = checkBrief([
    user('Teachers are never in two rooms at once and senior classes have at most one window'),
  ]);
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /joins two things/);
});

test('a conjunction naming one thing is not a join', () => {
  // «расписание для учителей и учеников» is one asked-for thing. The rule is
  // about two things on one line, and a checker that fired here would teach the
  // compose step to avoid the word rather than avoid the defect.
  assert.deepEqual(checkBrief([user('Расписание для учителей и учеников')]), []);
});

test('a line addressed to a tool fails, in Russian', () => {
  const violations = checkBrief([
    user('Поищи в интернете все что касается составления расписания для школы'),
  ]);
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /addresses a tool/);
});

test('a line addressed to a tool fails, in English', () => {
  const violations = checkBrief([
    user('Search the internet for everything about school timetabling'),
  ]);
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /addresses a tool/);
});

test('a line asking for help writing the ТЗ fails — this is R42 through R47', () => {
  const violations = checkBrief([
    user('Это тз неполное, тебе нужно помочь мне составить его полностью'),
  ]);
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /addresses a tool/);
});

test('a бриф line whose source is a находка fails', () => {
  const violations = checkBrief([
    { text: 'Поддерживаются подгруппы', source: { kind: 'finding', finding: 'F07' } },
  ]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'source');
  assert.match(violations[0]?.message ?? '', /F07/);
});

test('a pre-numbered line fails', () => {
  const violations = checkBrief([user('R01 — Расписание составляется на неделю')]);
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /already numbered/);
});

test('an empty line is reported once and nothing else is claimed about it', () => {
  const violations = checkBrief([user('   ')]);
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /empty/);
});

test('violations point at the line that caused them', () => {
  const violations = checkBrief([
    user('Расписание составляется на неделю'),
    user('Поищи в интернете примеры расписаний'),
  ]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.line, 2);
});

// --- one reconcile proposal ------------------------------------------------

const answer = (): Proposal['source'] =>
  ({ kind: 'answer', question: 'Q04', quote: 'да, подгруппы нужны' });

test('an add forced by an answer passes', () => {
  assert.deepEqual(
    checkProposal({ id: 'P01', kind: 'add', source: answer(), after: 'Класс делится на подгруппы' }),
    [],
  );
});

test('a proposal with no named source fails', () => {
  const violations = checkProposal({
    id: 'P02', kind: 'add', source: { kind: 'none' }, after: 'Класс делится на подгруппы',
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'source');
  assert.match(violations[0]?.message ?? '', /names nothing that forced it/);
});

test('a proposal forced by a находка fails', () => {
  const violations = checkProposal({
    id: 'P03', kind: 'add', source: { kind: 'finding', finding: 'F12' }, after: 'Есть звонки',
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /never a reason to edit/);
});

test('a remove whose source is an answer fails — only a contradiction may force one', () => {
  const violations = checkProposal({
    id: 'P04', kind: 'remove', source: answer(), before: 'Расписание печатается на A3',
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'remove');
  assert.match(violations[0]?.message ?? '', /only a contradiction/);
});

test('a remove citing a contradiction between two things the user wrote passes', () => {
  assert.deepEqual(
    checkProposal({
      id: 'P05',
      kind: 'remove',
      source: { kind: 'contradiction', quotes: ['уроки только до 14:00', 'седьмой урок в 14:30'] },
      before: 'Седьмой урок начинается в 14:30',
    }),
    [],
  );
});

test('a remove forced by a находка fails twice, and both reasons are said', () => {
  const violations = checkProposal({
    id: 'P06', kind: 'remove', source: { kind: 'finding', finding: 'F03' }, before: 'Экспорт в PDF',
  });
  assert.equal(violations.length, 2);
  assert.deepEqual(violations.map(v => v.check).sort(), ['remove', 'source']);
});

test('a fix showing only the after fails', () => {
  const violations = checkProposal({
    id: 'P07', kind: 'fix', source: answer(), after: 'Расписание составляется на две недели',
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /before and after/);
});

test('a fix showing both passes', () => {
  assert.deepEqual(
    checkProposal({
      id: 'P08',
      kind: 'fix',
      source: answer(),
      before: 'Расписание составляется на неделю',
      after: 'Расписание составляется на две недели',
    }),
    [],
  );
});

// --- one grill question and a delegated reply ------------------------------

const option = (text: string, recommended = false, yes?: boolean): GrillOption =>
  (yes === undefined ? { text, recommended } : { text, recommended, yes });

const question = (id: string, ...options: GrillOption[]): GrillQuestion => ({ id, options });

test('a question with one recommended option passes', () => {
  assert.deepEqual(
    checkGrillQuestion(question('Q01',
      option('Расписание на неделю', true),
      option('Расписание на две недели'))),
    [],
  );
});

test('a question with no candidate answers fails', () => {
  const violations = checkGrillQuestion(question('Q02'));
  assert.deepEqual(violations.map(v => v.check), ['shape']);
  assert.match(violations[0]?.message ?? '', /Q02 offers no candidate answers/);
});

test('a question recommending two options fails', () => {
  const violations = checkGrillQuestion(question('Q03',
    option('Подгруппы делятся пополам', true),
    option('Подгруппы задаются вручную', true)));
  assert.deepEqual(violations.map(v => v.check), ['recommendation']);
  assert.match(violations[0]?.message ?? '', /Q03 marks 2 options recommended/);
});

test('a question recommending none fails unless it asks a fact about the user', () => {
  const options = [option('Шесть уроков'), option('Семь уроков')];
  assert.deepEqual(checkGrillQuestion({ id: 'Q04', options }).map(v => v.check), ['recommendation']);
  assert.deepEqual(checkGrillQuestion({ id: 'Q04', options, fact: true }), []);
});

test('a fact about the user that recommends an answer fails — B1', () => {
  const violations = checkGrillQuestion({
    id: 'Q05',
    fact: true,
    options: [option('1500 ₽ в месяц', true), option('Не знаю пока')],
  });
  assert.deepEqual(violations.map(v => v.check), ['recommendation']);
  assert.match(violations[0]?.message ?? '', /B1/);
});

test('a yes/no question recommending «нет» fails, and names its Q##', () => {
  const violations = checkGrillQuestion(question('Q06',
    option('Да, учитывать окна', false, true),
    option('Нет, не учитывать', true)));
  assert.deepEqual(violations.map(v => v.check), ['polarity']);
  assert.match(violations[0]?.message ?? '', /Q06 is a yes\/no question whose recommendation is «нет»/);
});

test('a yes/no question recommending «да» passes', () => {
  assert.deepEqual(
    checkGrillQuestion(question('Q07',
      option('Да, учитывать окна', true, true),
      option('Нет, не учитывать'))),
    [],
  );
});

test('a bare «да» to the block resolves every Q## to its recommended option\'s full text, in block order', () => {
  const block = [
    question('Q01', option('Расписание на неделю', true), option('На две недели')),
    question('Q02', option('Нет'), option('Да, подгруппы делятся пополам', true, true)),
  ];
  assert.deepEqual(resolveDelegatedReply(block), [
    { id: 'Q01', chosen: 'Расписание на неделю' },
    { id: 'Q02', chosen: 'Да, подгруппы делятся пополам' },
  ]);
});

test('a fact about the user stays open under a bare «да»', () => {
  const block: GrillQuestion[] = [
    { id: 'Q01', fact: true, options: [option('До 1000 ₽'), option('Больше 1000 ₽')] },
  ];
  assert.deepEqual(resolveDelegatedReply(block), [{ id: 'Q01', open: true }]);
});

test('a question without exactly one recommendation stays open, never resolved to its first option', () => {
  const block = [
    question('Q01', option('Первый'), option('Второй')),
    question('Q02', option('Первый', true), option('Второй', true)),
  ];
  assert.deepEqual(resolveDelegatedReply(block), [
    { id: 'Q01', open: true },
    { id: 'Q02', open: true },
  ]);
});

test('a question the user answered in their own words is not resolved again', () => {
  const block = [
    question('Q01', option('Расписание на неделю', true), option('На две недели')),
    question('Q02', option('Шесть уроков', true), option('Семь уроков')),
  ];
  assert.deepEqual(resolveDelegatedReply(block, new Set(['Q01'])), [
    { id: 'Q02', chosen: 'Шесть уроков' },
  ]);
});

// --- the two delegation rules, held where they are stated ------------------
// The contract above reads no session, so the rules a session follows are held
// by their wording: one literal per rule, in the step file and in the
// specification. `npm run bundle:scout` cannot do this — it never sees
// `docs/spec/scout/`.

const GRILL_ANCHORS = [
  'so that «да» accepts the recommended answer',
  'is resolved per `Q##`',
];

const fromRoot = (relative: string): URL => new URL(`../../${relative}`, import.meta.url);

const missingAnchors = async (relative: string): Promise<string[]> => {
  const body = await readFile(fromRoot(relative), 'utf8');
  return GRILL_ANCHORS.filter(anchor => !body.includes(anchor))
    .map(anchor => `${relative} does not say "${anchor}"`);
};

test('the shipped grill step states both delegation rules', async () => {
  assert.deepEqual(await missingAnchors('skills/scout/steps/3-grill.md'), []);
});

test('the Scout specification states both delegation rules', async () => {
  assert.deepEqual(await missingAnchors('docs/spec/scout/steps.md'), []);
});
