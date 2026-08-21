// The two things Scout produces that have a readable shape: the composed бриф
// and one reconcile proposal.
//
// Neither of these runs during `npm run check` — this repository contains no
// Scout session for them to read, exactly as it contains no прогон for the gate
// scripts under `scripts/gates/`. What they are for is making the two contracts
// in `docs/spec/scout/` executable and tested rather than only described.
//
// Read `docs/spec/scout/output.md` and `docs/spec/scout/reconcile.md` first.
// This file states those rules in a form that can be proven; where the two
// disagree, the specification is right and this is the bug.

import { createLogger } from '../shared/log.ts';
import type { Violation } from '../shared/violation.ts';

export type { Violation };

const log = createLogger('scout-contract');

// --- the composed бриф -----------------------------------------------------

/**
 * Where a line of the бриф came from. There are exactly three possibilities and
 * only the first two are allowed — `finding` exists in this type so that a bug
 * producing one is representable and therefore testable.
 */
export type LineSource =
  | { kind: 'user' }
  | { kind: 'accepted'; proposal: string }
  | { kind: 'finding'; finding: string };

export interface BriefLine {
  text: string;
  source: LineSource;
}

/**
 * Conjunctions that join two asked-for things into one line, and the signal that
 * tells a join from a coordination inside one thing.
 *
 * The rule this serves is `output.md`'s: one asked-for thing per line, because
 * Maestro turns each line into one `R##` and the last gate has no verdict for a
 * требование that is half-built.
 *
 * The detection is a heuristic and it is written here rather than hidden.
 * «Расписание для учителей и учеников» is one thing named with a conjunction and
 * must not fire; «Учителя не ставятся в два кабинета одновременно, и окна у
 * старших классов не больше одного» is two things and must. Substantial text on
 * both sides does not separate them — «в одно и то же время» has it too.
 *
 * What separates them is the comma. Russian punctuation puts one before «и»
 * joining two clauses and none before «и» joining two words, so the comma is not
 * a heuristic there at all: it is the language's own marker for the thing being
 * checked. English has no such rule, so ` and ` fires on word count alone, which
 * is why the English case is the looser of the two and is documented as such.
 *
 * What this does not catch: an English join whose right side is short, and any
 * join phrased without either conjunction. `docs/spec/scout/output.md` is the
 * guarantee; this is the part of it a program can hold.
 */
const CONJUNCTIONS: Array<{ token: string; needsComma: boolean }> = [
  { token: ' and ', needsComma: false },
  { token: ' и ', needsComma: true },
];
const SUBSTANTIAL_WORDS = 3;

/**
 * Markers of a line addressed to a tool rather than describing the product.
 *
 * Honest about what this is: a marker list, in both languages, drawn from the
 * прогон that produced the rule — a бриф whose last paragraph asked the
 * orchestrator to search the internet and help write the ТЗ, and which became
 * `R42`–`R47`. It catches that shape. A process instruction phrased in a way no
 * marker covers reaches the бриф, and the specification says so: the step file
 * is the guarantee, and this is the part of it a program can hold.
 */
// `\b` is ASCII-only in JavaScript, so it does not fire beside a Cyrillic
// letter — `/\bпоищи\b/` matches nothing in «Поищи в интернете». Unicode
// lookarounds are the boundary that works in both alphabets, and the `u` flag is
// what makes `\p{L}` legal.
const B = String.raw`(?<!\p{L})`;
const E = String.raw`(?!\p{L})`;
const marker = (body: string): RegExp => new RegExp(`${B}${body}${E}`, 'iu');

const TOOL_MARKERS = [
  marker('поищ[иа]'),
  marker('найди'),
  marker('изучи'),
  marker('посмотри'),
  marker('предлагай'),
  marker(String.raw`помоги\s+(мне\s+)?(составить|написать|дописать)`),
  marker(String.raw`тебе\s+нужно`),
  marker(String.raw`ты\s+(должен|можешь)`),
  marker(String.raw`search\s+the\s+(internet|web)`),
  marker(String.raw`look\s+up`),
  marker(String.raw`study\s+(several|some|existing)`),
  marker(String.raw`help\s+me\s+(write|complete|finish)`),
  marker(String.raw`you\s+(should|must|need\s+to)`),
];

/** A line the бриф arrived pre-numbered with. Numbering is Maestro's. */
const NUMBERED = /^\s*(R\s*\d+|\d+)\s*[.):—-]/i;

const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Check one composed бриф. `lines` is the pasteable block only — whatever the
 * compose step printed after it is a different document and is not checked here.
 */
export function checkBrief(lines: BriefLine[], file = 'brief'): Violation[] {
  const violations: Violation[] = [];
  const add = (check: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  lines.forEach((entry, index) => {
    const at = index + 1;
    const text = entry.text.trim();

    if (text === '') {
      add('shape', at, 'a бриф line is empty');
      return;
    }

    if (entry.source.kind === 'finding') {
      add('source', at,
        `this line's source is находка "${entry.source.finding}" — a находка feeds a `
        + 'question, and only the user\'s answer becomes a требование');
    }

    if (NUMBERED.test(text)) {
      add('shape', at,
        'this line arrives already numbered — the бриф is unnumbered text, and a '
        + 'pre-numbered one invites a манифест that renumbers it');
    }

    for (const { token, needsComma } of CONJUNCTIONS) {
      const found = text.toLowerCase().indexOf(needsComma ? `,${token}` : token);
      if (found === -1) continue;
      const before = text.slice(0, found);
      const after = text.slice(found + token.length + (needsComma ? 1 : 0));
      if (words(before) < SUBSTANTIAL_WORDS || words(after) < SUBSTANTIAL_WORDS) continue;
      add('shape', at,
        `this line joins two things with "${token.trim()}" — one требование that is `
        + 'half-done when half of it is built has no verdict at the last gate');
      break;
    }

    for (const marker of TOOL_MARKERS) {
      if (!marker.test(text)) continue;
      add('shape', at,
        'this line addresses a tool rather than describing what is built — numbered as a '
        + 'требование it has nothing to build, which is the defect Scout exists to prevent');
      break;
    }
  });

  log.info('brief', 'бриф checked', { lines: lines.length, violations: violations.length });
  return violations;
}

// --- one reconcile proposal ------------------------------------------------

/** What forced a proposal. Only the first two may be shown to the user. */
export type ProposalSource =
  | { kind: 'answer'; question: string; quote: string }
  | { kind: 'contradiction'; quotes: [string, string] }
  | { kind: 'finding'; finding: string }
  | { kind: 'none' };

export interface Proposal {
  id: string;
  kind: 'add' | 'fix' | 'remove';
  source: ProposalSource;
  /** Required by `fix` and `remove`; the line as it stands today. */
  before?: string;
  /** Required by `add` and `fix`; the line as it would read. */
  after?: string;
}

export function checkProposal(proposal: Proposal, file = 'proposals'): Violation[] {
  const violations: Violation[] = [];
  const add = (check: string, message: string): void => {
    violations.push({ check, file, line: 0, message });
    log.error(check, message, { file, proposal: proposal.id });
  };

  if (proposal.source.kind === 'none') {
    add('source', `${proposal.id} names nothing that forced it — a proposal with no named `
      + 'source is not shown');
  }

  if (proposal.source.kind === 'finding') {
    add('source', `${proposal.id} is forced by находка "${proposal.source.finding}" — a sweep `
      + 'is a reason to ask, never a reason to edit. Ask, and cite the answer');
  }

  if (proposal.kind === 'remove' && proposal.source.kind !== 'contradiction') {
    add('remove', `${proposal.id} removes a line and its source is `
      + `"${proposal.source.kind}" — a remove may cite only a contradiction with something `
      + 'else the user wrote. An addition is visible in the манифест afterwards; a removal '
      + 'is visible nowhere');
  }

  if (proposal.kind === 'fix' && (!proposal.before || !proposal.after)) {
    add('shape', `${proposal.id} is a fix and does not show both before and after — a fix `
      + 'that quietly dropped a clause looks exactly like a fix');
  }

  if (proposal.kind === 'add' && !proposal.after) {
    add('shape', `${proposal.id} adds nothing`);
  }

  if (proposal.kind === 'remove' && !proposal.before) {
    add('shape', `${proposal.id} removes nothing`);
  }

  return violations;
}
