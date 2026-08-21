import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkBrief,
  checkProposal,
  type BriefLine,
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
