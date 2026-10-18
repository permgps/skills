// The shape of an `answers.md` entry, read the one way every reader reads it.
//
// G1 checks each entry's labels; the closing publish reads its `OpenSpec:`
// lines to learn which approved requirements the user authorised changing.
// Two parsers of one file would disagree about a wrapped line the first time
// someone wraps one, so the parser lives here, in the shipped runtime, and
// `scripts/gates/answers.ts` builds G1's findings on top of it.
//
// What G1 does with the entries — and the reasons behind each of its rules —
// is in scripts/gates/answers.ts.

import { createLogger } from './shared/log.mts';

const log = createLogger('gate-answers');


/** The `Chosen:` value for an answer the user composed rather than picked. */
export const OWN_ANSWER = 'own answer';

/** The `Answer:` value for a fork the прогон settled itself. */
export const SELF_BRIEFED = 'self-briefed';

/**
 * The one heading accepted without an `R##`: the question that offers work an
 * earlier прогон left open (`### Leftovers — <gist>`). It belongs to no
 * требование, because the items it lists are in no манифест yet. Every other
 * rule — options, one recommended, `Answer:`, `Chosen:` — still holds.
 */
export const LEFTOVERS_HEADING = 'Leftovers';

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
  /** The entry is the leftovers question, which names no требование by design. */
  leftovers: boolean;
  asked: string;
  /** `null` when the entry has no `Options:` block at all. */
  options: AnswerOption[] | null;
  answer: string | null;
  chosen: string | null;
  settledByReading: string | null;
  /** The value of an `OpenSpec:` line, collapsed; `null` when the entry has none. */
  openspec: string | null;
}

type Field = 'asked' | 'answer' | 'chosen' | 'settledByReading' | 'openspec';

const LABELS: Array<[RegExp, Field | 'options']> = [
  [/^Asked:\s*/, 'asked'],
  [/^Options:\s*/, 'options'],
  [/^Answer:\s*/, 'answer'],
  [/^Chosen:\s*/, 'chosen'],
  [/^Settled by reading:\s*/, 'settledByReading'],
  // Bold and any case: the line is written by a model and read for authority,
  // so a spelling the phase file allows must never fall into `Chosen:`.
  [/^\s*(?:\*\*)?openspec:(?:\*\*)?\s*/i, 'openspec'],
];

const ENTRY_HEADING = /^###\s+(.*)$/;
const SECTION_END = /^#{1,3}\s/;
const OPTION_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const REQUIREMENT_ID = /\bR\d{2,}\b/;

export const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

export function toOption(raw: string): AnswerOption {
  const index = raw.toLowerCase().indexOf(RECOMMENDED_MARKER);
  if (index < 0) return { text: collapse(raw), recommended: false };
  return { text: collapse(raw.slice(0, index)), recommended: true };
}

const LEFTOVERS = new RegExp(`^\\s*${LEFTOVERS_HEADING}(?:\\s*[—–:-]+\\s*(.*))?$`);

function headingParts(heading: string): { requirementId: string; gist: string; leftovers: boolean } {
  // Checked first: a gist may mention an R## it lists, and that must not make the
  // question belong to one требование.
  const leftovers = LEFTOVERS.exec(heading);
  if (leftovers) return { requirementId: '', gist: collapse(leftovers[1] ?? ''), leftovers: true };
  const match = REQUIREMENT_ID.exec(heading);
  if (!match) return { requirementId: '', gist: collapse(heading), leftovers: false };
  const rest = heading.slice(match.index + match[0].length);
  return { requirementId: match[0], gist: collapse(rest.replace(/^\s*[—–:-]+\s*/, '')), leftovers: false };
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
        asked: '', options: null, answer: null, chosen: null, settledByReading: null, openspec: null,
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

export type OpenSpecDispositionKind = 'keep' | 'replace' | 'remove' | 'rename';

export interface OpenSpecDisposition {
  /** The capability path under `openspec/specs/`, as written. */
  capability: string;
  /** The requirement name, as written; the export normalises it the way OpenSpec does. */
  requirement: string;
  disposition: OpenSpecDispositionKind;
  /** The new name, only for `rename`. */
  renamedTo: string | null;
}

const DISPOSITIONS: readonly OpenSpecDispositionKind[] = ['keep', 'replace', 'remove', 'rename'];
const DASHES = ['—', '–', '-'];

/**
 * Read `<capability> › <Requirement name> — keep | replace | remove | rename → <new name>`.
 * `>` stands for `›`, any of three dashes splits, and the last dash before the
 * keyword is the split, so a name holding a dash keeps it. Anything else is
 * `null`: a line that cannot be read authorises nothing. Written as scans
 * rather than one regex, because the value is model-written free text.
 */
export function parseOpenSpecDisposition(raw: string): OpenSpecDisposition | null {
  const value = collapse(raw);
  const separator = [' › ', ' > '].map(mark => ({ mark, at: value.indexOf(mark) })).filter(found => found.at > 0)
    .sort((a, b) => a.at - b.at)[0];
  if (!separator) return null;
  const capability = value.slice(0, separator.at).trim();
  const rest = value.slice(separator.at + separator.mark.length);
  let split = -1;
  let width = 0;
  for (const dash of DASHES) {
    const at = rest.lastIndexOf(` ${dash} `);
    if (at > split) { split = at; width = dash.length + 2; }
  }
  if (split <= 0) return null;
  const requirement = rest.slice(0, split).trim();
  const tail = rest.slice(split + width).trim();
  const keyword = tail.split(' ', 1)[0]!.toLowerCase() as OpenSpecDispositionKind;
  if (!capability || !requirement || !DISPOSITIONS.includes(keyword)) return null;
  const after = tail.slice(keyword.length).trim();
  if (keyword !== 'rename') return after === '' ? { capability, requirement, disposition: keyword, renamedTo: null } : null;
  const arrow = after.startsWith('→') ? 1 : after.startsWith('->') ? 2 : 0;
  const renamedTo = arrow ? after.slice(arrow).trim() : '';
  return renamedTo ? { capability, requirement, disposition: 'rename', renamedTo } : null;
}
