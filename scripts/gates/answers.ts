// The mechanical half of «briefing proposes, the user disposes»: every question
// the брифинг put to the user is recorded in `answers.md` with the option it
// ended on, written out in full.
//
// A delegated answer — «как советуешь», «на твой выбор», a bare «да» — says
// nothing on its own. The acceptance reader never sees the question, so an entry
// that keeps only the reply has lost the decision. The check therefore reads
// labels, never phrases: matching «да» and «ок» and «yes» in two languages is a
// list that is always one word short, while a missing `Chosen:` line is missing
// whatever the user typed.
//
// What this does not check, and cannot: whether the recommendation was the
// right one, whether the question was worth asking, and whether the chosen text
// was actually shown back to the user. Those are the phase file's discipline.
//
// Entries without an `Options:` block are skipped. They are facts settled by
// reading, and the entries of runs recorded before this rule existed — a gate
// that failed a finished прогон on its history would be reporting the rule's
// age, not a defect.

import { createLogger } from '../shared/log.ts';
import type { GateFinding } from './cli.ts';

const log = createLogger('gate-answers');

/** The `Chosen:` value for an answer the user composed rather than picked. */
export const OWN_ANSWER = 'own answer';

/** The `Answer:` value for a fork the прогон settled itself. */
export const SELF_BRIEFED = 'self-briefed';

const RECOMMENDED_MARKER = '(recommended';

export interface AnswerOption {
  /** The option's text with its `(recommended — …)` suffix removed. */
  text: string;
  recommended: boolean;
}

export interface AnswerEntry {
  heading: string;
  /** 1-based line of the `### ` heading. */
  line: number;
  /** The `R##` the heading names, or empty when it names none. */
  requirementId: string;
  /** The heading text after the id and its separator. */
  gist: string;
  asked: string;
  /** `null` when the entry has no `Options:` block at all. */
  options: AnswerOption[] | null;
  answer: string | null;
  chosen: string | null;
  settledByReading: string | null;
}

type Field = 'asked' | 'answer' | 'chosen' | 'settledByReading';

const LABELS: Array<[RegExp, Field | 'options']> = [
  [/^Asked:\s*/, 'asked'],
  [/^Options:\s*/, 'options'],
  [/^Answer:\s*/, 'answer'],
  [/^Chosen:\s*/, 'chosen'],
  [/^Settled by reading:\s*/, 'settledByReading'],
];

const ENTRY_HEADING = /^###\s+(.*)$/;
const SECTION_END = /^#{1,3}\s/;
const OPTION_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const REQUIREMENT_ID = /\bR\d{2,}\b/;

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

function toOption(raw: string): AnswerOption {
  const index = raw.toLowerCase().indexOf(RECOMMENDED_MARKER);
  if (index < 0) return { text: collapse(raw), recommended: false };
  return { text: collapse(raw.slice(0, index)), recommended: true };
}

function headingParts(heading: string): { requirementId: string; gist: string } {
  const match = REQUIREMENT_ID.exec(heading);
  if (!match) return { requirementId: '', gist: collapse(heading) };
  const rest = heading.slice(match.index + match[0].length);
  return { requirementId: match[0], gist: collapse(rest.replace(/^\s*[—–:-]+\s*/, '')) };
}

/**
 * Read the `### ` entries of an `answers.md`.
 *
 * Labels are matched at the start of a line; a line that starts no label
 * continues the value above it, so a long question or a wrapped option reads
 * back as one value.
 */
export function parseAnswers(markdown: string): AnswerEntry[] {
  const entries: AnswerEntry[] = [];
  let entry: AnswerEntry | null = null;
  let field: Field | 'options' | null = null;
  // Each option's lines as written. A continuation is joined to the raw text,
  // not to the parsed one: once `(recommended` has been cut off, the rest of a
  // wrapped reason would otherwise land in the option text itself.
  let rawOptions: string[] = [];

  const close = (): void => {
    if (entry) {
      log.debug('parse', 'entry read', {
        requirementId: entry.requirementId, line: entry.line,
        options: entry.options?.length ?? null, hasChosen: entry.chosen !== null,
      });
      entries.push(entry);
    }
    entry = null;
    field = null;
  };

  markdown.split(/\r?\n/).forEach((text, index) => {
    const heading = ENTRY_HEADING.exec(text);
    if (heading) {
      close();
      entry = {
        heading: heading[1]!.trim(), line: index + 1, ...headingParts(heading[1]!),
        asked: '', options: null, answer: null, chosen: null, settledByReading: null,
      };
      return;
    }
    if (SECTION_END.test(text)) {
      close();
      return;
    }
    if (!entry) return;
    const current: AnswerEntry = entry;

    for (const [label, name] of LABELS) {
      const match = label.exec(text);
      if (!match) continue;
      field = name;
      const value = text.slice(match[0].length);
      if (name === 'options') {
        current.options = [];
        rawOptions = [];
      }
      else current[name] = collapse(value);
      return;
    }

    if (text.trim() === '' || field === null) return;
    if (field === 'options') {
      const item = OPTION_ITEM.exec(text);
      const options = current.options!;
      if (item) {
        rawOptions.push(item[1]!);
        options.push(toOption(item[1]!));
      } else if (options.length > 0) {
        const last = rawOptions.length - 1;
        rawOptions[last] = `${rawOptions[last]} ${text}`;
        options[last] = toOption(rawOptions[last]!);
      }
      return;
    }
    current[field] = collapse(`${current[field] ?? ''} ${text}`);
  });
  close();

  return entries;
}

/**
 * The comparable part of a `Chosen:` value: no recommendation suffix copied
 * along with the option, and no `follows …` / `contradicts …` citation of an
 * earlier decision, which the phase file puts on the same line.
 */
export function chosenText(chosen: string): string {
  const withoutCitation = chosen.replace(
    /\s*[—–;,-]?\s*\(?\b(?:follows|contradicts)\s+\d{4}-\d{2}-\d{2}\s+decision\b[\s\S]*$/i, '');
  return toOption(withoutCitation).text.replace(/[.;,]$/, '').trim();
}

// Trailing punctuation is dropped on both sides. `chosenText` already drops it
// from `Chosen:`, where it is left behind by a cut citation, so an option that
// ends in a full stop would otherwise never match its own text copied verbatim.
const comparable = (text: string): string => text.replace(/[.;,]$/, '').trim().toLowerCase();
const same = (a: string, b: string): boolean => comparable(a) === comparable(b);

function entryFindings(entry: AnswerEntry): Array<{ rule: string; message: string }> {
  const findings: Array<{ rule: string; message: string }> = [];
  const options = entry.options ?? [];
  const where = `answers.md line ${entry.line}`;

  if (entry.requirementId === '') {
    findings.push({ rule: 'heading', message:
      `${where}: the entry names no требование — head it "### R## — <gist>", so the answer arrives attached to something` });
  } else if (entry.gist === '') {
    findings.push({ rule: 'heading', message:
      `${where}: ${entry.requirementId} travels alone — add a short gist of the требование after it, "### ${entry.requirementId} — <gist>"` });
  }

  const recommended = options.filter(option => option.recommended);
  if (recommended.length !== 1) {
    findings.push({ rule: 'recommended', message:
      `${where}: ${recommended.length} options are marked "(recommended — …)" — mark exactly one, the answer \`full\` would self-brief, with its reason in one clause` });
  }

  if (entry.answer === null || entry.answer === '') {
    findings.push({ rule: 'answer', message:
      `${where}: no "Answer:" line — record the user's reply verbatim after redaction, or "${SELF_BRIEFED}" for a fork the прогон settled itself` });
  }

  if (entry.chosen === null || entry.chosen === '') {
    findings.push({ rule: 'chosen', message:
      `${where}: no "Chosen:" line — write the full text of the option the reply selected, or "${OWN_ANSWER}"; a bare "да" or «как советуешь» tells the acceptance reader nothing` });
    return findings;
  }

  const chosen = chosenText(entry.chosen);
  if (same(chosen, OWN_ANSWER)) {
    if (entry.answer !== null && same(entry.answer, SELF_BRIEFED)) {
      findings.push({ rule: 'self-briefed', message:
        `${where}: a self-briefed answer cannot be "${OWN_ANSWER}" — it is the recommended option, written out` });
    }
    return findings;
  }

  const match = options.find(option => same(option.text, chosen));
  if (!match) {
    log.debug('chosen', 'Chosen names no offered option', {
      requirementId: entry.requirementId, line: entry.line, chosen, offered: options.map(option => option.text),
    });
    findings.push({ rule: 'chosen', message:
      `${where}: "Chosen: ${chosen}" is none of the offered options — copy the selected option's full text, or write "${OWN_ANSWER}" when the user composed their own` });
    return findings;
  }

  if (entry.answer !== null && same(entry.answer, SELF_BRIEFED) && !match.recommended) {
    findings.push({ rule: 'self-briefed', message:
      `${where}: a self-briefed answer chose an option that is not the recommended one — the recommendation is what the прогон would self-brief, so the two must agree` });
  }
  return findings;
}

/** G1's findings for the entries that put options to the user. */
export function checkAnswers(entries: readonly AnswerEntry[]): GateFinding[] {
  const findings: GateFinding[] = [];
  let checked = 0;

  for (const entry of entries) {
    if (entry.options === null) continue;
    checked += 1;
    for (const { rule, message } of entryFindings(entry)) {
      log.debug('rule', 'entry fails a rule', { requirementId: entry.requirementId, line: entry.line, rule });
      findings.push({ requirementId: entry.requirementId, message });
    }
  }

  log.info('answers', 'answers checked', {
    entries: entries.length, checked, skipped: entries.length - checked, findings: findings.length,
  });
  return findings;
}
