// `.maestro/PROGRESS.md`: where the work stands between прогоны.
//
// Every closing publish rewrites the file whole, from the closing state, the
// file it replaces and this run's `prior.md`. Rewriting whole is what keeps it
// true — a file each run appended to would hold every item ever left open,
// including the ones a later run finished. The cost is that a rewrite forgets
// whatever it does not regenerate, so every item carries a key,
// `<origin dir>#<state id>`: a run that closes again drops its own keys and
// regenerates them, an item from another run is carried until the user takes
// or dismisses it (`leftovers`, decision D2), and an item nobody answered is
// never lost because the file was rewritten.
//
// Only *Settled By The User* is ever trimmed. Open work is what the next run
// asks about, and a budget that dropped a known bug to save a line would
// forget exactly what the file exists to remember. A line the parser cannot
// read is kept verbatim for the same reason: user text is never dropped.
//
// Pure: no file is read or written here. Publication and preflight own the I/O.

import { createLogger } from './shared/log.mts';
import type { LeftoverEntry, RunState } from './state/contract.mts';
import { LEFTOVER_KEY_PATTERN, WIP_SUFFIX } from './state/paths.mts';
import { deriveVerification, type VerificationSummary } from './state/verification.mts';

const log = createLogger('progress');

/** The file's name under `.maestro/`. */
export const PROGRESS_FILE = 'PROGRESS.md';

/** About how long the file may grow before the oldest settled items give way. */
export const PROGRESS_LINE_BUDGET = 60;

/** The longest item text; longer ones are cut with an ellipsis. */
export const ITEM_MAX = 160;

/** One line of an owned section. `key` is absent only on a line kept verbatim. */
export interface ProgressItem {
  key?: string;
  text: string;
}

export interface ProgressHeader {
  dir: string;
  closedAt: string;
  outcome: string;
  /** The commit `HEAD` named at that closure, or null when git was unavailable. */
  commit: string | null;
}

export type ProgressSection = 'settled' | 'notDone' | 'knownBugs';

export interface ParsedProgress {
  header?: ProgressHeader;
  settled: ProgressItem[];
  notDone: ProgressItem[];
  knownBugs: ProgressItem[];
  /** The user's own lines under *Fixes Without Maestro*, verbatim. */
  fixes: string[];
  /** Owned-section lines kept verbatim because they carry no readable key. */
  unparsed: { section: ProgressSection; line: number }[];
  /** How many settled items earlier closures already trimmed. */
  settledOmitted: number;
}

export interface ProgressItems {
  settled: ProgressItem[];
  notDone: ProgressItem[];
  knownBugs: ProgressItem[];
}

const TITLE = '# Where The Work Stands';
const PREAMBLE = [
  'Maestro rewrites this file at every closure. Add lines only under «Fixes Without Maestro».',
  'Decisions are not repeated here: each run\'s `decisions.md` and the memory block hold them.',
  'What a run assumed on its own is in that run\'s `report.md` › Assumptions.',
];
const HEADINGS: Record<string, ProgressSection | 'fixes'> = {
  'Settled By The User': 'settled',
  'Not Done': 'notDone',
  'Known Bugs': 'knownBugs',
  'Fixes Without Maestro': 'fixes',
};
const EMPTY = 'None.';
const HEADER_LINE = /^Closed (\S+) on (\S+), outcome (\S+), at commit (\S+)\.$/;
const ITEM_LINE = /^- \[([^\]]+)\] (.+)$/;
const OMITTED_LINE = /^- (\d+) earlier settled items?: see the reports under \.maestro\/$/;

const omittedLine = (count: number): string => `- ${count} earlier settled items: see the reports under .maestro/`;

/**
 * One line of at most {@link ITEM_MAX} characters. A cut that would land inside
 * a closing quotation shortens the quote instead and keeps its `»`, so the
 * user's words never read as running on into the next line.
 */
export function clip(text: string): string {
  const flat = text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (flat.length <= ITEM_MAX) return flat;
  const quote = /«([^«»]*)»$/.exec(flat);
  if (quote) {
    const prefix = flat.slice(0, quote.index + 1);
    const room = ITEM_MAX - prefix.length - 2;
    if (room >= 1) return `${prefix}${quote[1]!.slice(0, room)}…»`;
  }
  const cut = quote ? Math.min(ITEM_MAX - 1, quote.index) : ITEM_MAX - 1;
  return `${flat.slice(0, cut).trimEnd()}…`;
}

/** The closing run's directory, which is every key's prefix; never the `--wip` name. */
function originDir(state: RunState): string {
  const dir = state.dir ?? state.slug;
  return dir.endsWith(WIP_SUFFIX) ? dir.slice(0, -WIP_SUFFIX.length) : dir;
}

function summaryOf(state: RunState): VerificationSummary | undefined {
  if (state.contractVersion < 4 || !state.verification) return undefined;
  try {
    return deriveVerification(state);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn('derive', 'verification could not be derived; requirement results are left out', { runId: state.runId, reason });
    return undefined;
  }
}

/**
 * What the closing state says is settled, not done, or known broken — the
 * fact table of the plan, one item per fact, keyed by this run's directory.
 */
export function itemsFromState(state: RunState): ProgressItems {
  const dir = originDir(state);
  const key = (id: string): string => `${dir}#${id}`;
  const summary = summaryOf(state);
  const record = state.verification;
  const named = (id: string): string => {
    const title = state.requirements.find(item => item.id === id)?.title?.trim();
    return title ? `${id} ${title}` : `${id} (see .maestro/${dir}/manifest.md)`;
  };
  const items: ProgressItems = { settled: [], notDone: [], knownBugs: [] };

  for (const requirement of state.requirements) {
    const result = summary?.requirementResults[requirement.id];
    const reason = requirement.reason?.trim() ?? '';
    if (requirement.status === 'dropped') {
      items.settled.push({ key: key(requirement.id), text: clip(`${named(requirement.id)} — dropped: «${reason}»`) });
    } else if (requirement.status === 'deferred') {
      items.notDone.push({ key: key(requirement.id), text: clip(`${named(requirement.id)} — deferred: ${reason}`) });
    } else if (requirement.status === 'placeholder') {
      items.notDone.push({ key: key(requirement.id), text: clip(`${named(requirement.id)} — waiting on the user: ${reason}`) });
    } else if (requirement.status === 'in-spec' && result === 'incomplete') {
      items.notDone.push({ key: key(requirement.id), text: clip(`${named(requirement.id)} — not built: acceptance found it incomplete`) });
    }
  }
  for (const task of state.tasks) {
    if (task.status !== 'failed') continue;
    const served = task.requirementIds.length > 0 ? ` (${task.requirementIds.join(', ')})` : '';
    items.notDone.push({ key: key(`T${task.id}`), text: clip(`таск ${task.id} ${task.title} — failed${served}`) });
  }

  const open = record?.findings.filter(item => item.status === 'open') ?? [];
  const accepted = new Map<string, string>();
  for (const decision of record?.decisions ?? []) {
    if (decision.kind !== 'accepted_exception') continue;
    for (const id of decision.selectedFindingIds) accepted.set(id, decision.authorization);
  }
  for (const found of open) {
    const served = found.requirementIds.length > 0 ? ` (${found.requirementIds.join(', ')})` : '';
    const authorization = accepted.get(found.id);
    const text = authorization === undefined
      ? `${found.description}${served}`
      : `${found.description}${served} — accepted by the user: «${authorization}»`;
    items.knownBugs.push({ key: key(found.id), text: clip(text) });
  }
  for (const requirement of state.requirements) {
    if (requirement.status !== 'in-spec' || summary?.requirementResults[requirement.id] !== 'failed') continue;
    if (open.some(item => item.requirementIds.includes(requirement.id))) continue;
    items.knownBugs.push({ key: key(requirement.id), text: clip(`${named(requirement.id)} — failed acceptance`) });
  }
  log.debug('items', 'facts read from the closing state', {
    dir, settled: items.settled.length, notDone: items.notDone.length, knownBugs: items.knownBugs.length,
  });
  return items;
}

/** The closure the file records, read back from its own fixed header line. */
export function parseHeaderCommit(text: string): ProgressHeader | null {
  for (const line of text.split(/\r?\n/)) {
    const match = HEADER_LINE.exec(line);
    if (!match) continue;
    return { dir: match[1]!, closedAt: match[2]!, outcome: match[3]!, commit: match[4] === 'none' ? null : match[4]! };
  }
  return null;
}

/**
 * Read a progress file back. Anything the parser does not recognise stays:
 * an owned-section line without a key is kept as a verbatim item, and stray
 * text before the first section or under an unknown heading joins the fixes.
 */
export function parseProgress(text: string): ParsedProgress {
  const parsed: ParsedProgress = { settled: [], notDone: [], knownBugs: [], fixes: [], unparsed: [], settledOmitted: 0 };
  let current: ProgressSection | 'fixes' | 'preamble' = 'preamble';
  text.split(/\r?\n/).forEach((line, index) => {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      const section = HEADINGS[heading[1]!.trim()];
      if (section) {
        current = section;
      } else {
        log.warn('parse', 'unknown section kept under the fixes', { line: index + 1 });
        current = 'fixes';
        parsed.fixes.push(line);
      }
      return;
    }
    const trimmed = line.trim();
    if (current === 'preamble') {
      const header = HEADER_LINE.exec(line);
      if (header) {
        parsed.header = { dir: header[1]!, closedAt: header[2]!, outcome: header[3]!, commit: header[4] === 'none' ? null : header[4]! };
      } else if (trimmed !== '' && trimmed !== TITLE && !PREAMBLE.includes(trimmed)) {
        log.warn('parse', 'text before the first section kept under the fixes', { line: index + 1 });
        parsed.fixes.push(line);
      }
      return;
    }
    if (trimmed === '' || trimmed === EMPTY) return;
    if (current === 'fixes') {
      parsed.fixes.push(line);
      return;
    }
    if (current === 'settled') {
      const omitted = OMITTED_LINE.exec(trimmed);
      if (omitted) {
        parsed.settledOmitted += Number(omitted[1]);
        return;
      }
    }
    const item = ITEM_LINE.exec(line);
    if (item && LEFTOVER_KEY_PATTERN.test(item[1]!)) {
      parsed[current].push({ key: item[1]!, text: item[2]! });
      return;
    }
    log.warn('parse', 'line without a readable key kept verbatim', { section: current, line: index + 1 });
    parsed.unparsed.push({ section: current, line: index + 1 });
    parsed[current].push({ text: line });
  });
  return parsed;
}

/** The heading under which preflight copies this file into `prior.md`. */
export const PRIOR_PROGRESS_HEADING = '## Where The Work Stands';

/**
 * The progress file as this run's preflight copied it into `prior.md`: the
 * fenced block under {@link PRIOR_PROGRESS_HEADING}, or null when the section
 * holds no copy (no file existed then, or the `prior.md` predates the section).
 */
export function progressInPrior(prior: string): string | null {
  const lines = prior.split(/\r?\n/);
  const start = lines.indexOf(PRIOR_PROGRESS_HEADING);
  if (start === -1) return null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.startsWith('## ')) return null;
    const fence = /^(`{3,})/.exec(line);
    if (!fence) continue;
    const end = lines.indexOf(fence[1]!, index + 1);
    return end === -1 ? null : `${lines.slice(index + 1, end).join('\n')}\n`;
  }
  return null;
}

/**
 * The fixes lines a run's preflight already read, which its closure removes:
 * null when the run has no `prior.md`, so every line is kept; empty when the
 * `prior.md` carries no copy of the file, so again every line is kept.
 */
export function fixesReadAtPreflight(prior: string | null): string[] | null {
  if (prior === null) return null;
  const copy = progressInPrior(prior);
  return copy === null ? [] : parseProgress(copy).fixes;
}

function render(header: string, items: ProgressItems, fixes: readonly string[], omitted: number): string {
  const block = (lines: string[]): string[] => (lines.length > 0 ? lines : [EMPTY]);
  const itemLines = (list: readonly ProgressItem[]): string[] =>
    list.map(item => (item.key === undefined ? item.text : `- [${item.key}] ${item.text}`));
  const settled = [...(omitted > 0 ? [omittedLine(omitted)] : []), ...itemLines(items.settled)];
  return [
    TITLE, '',
    header,
    ...PREAMBLE, '',
    '## Settled By The User', '', ...block(settled), '',
    '## Not Done', '', ...block(itemLines(items.notDone)), '',
    '## Known Bugs', '', ...block(itemLines(items.knownBugs)), '',
    '## Fixes Without Maestro', '', ...block([...fixes]), '',
  ].join('\n');
}

const lineCount = (text: string): number => text.trimEnd().split('\n').length;

export interface BuildProgressInput {
  /** The closing state, as it is about to be published. */
  state: RunState;
  /** The `PROGRESS.md` on disk at the closing publish, or null when there is none. */
  previous: string | null;
  /**
   * The fixes lines this run's preflight copied into `prior.md`, or null when
   * this run has no `prior.md` — then every fixes line is kept.
   */
  priorFixes: readonly string[] | null;
  /** `HEAD` at the closing publish, or null when git could not say. */
  commit: string | null;
  /**
   * Items the closing publish learned beside the state — the OpenSpec export's
   * outcome. Keyed under this run like every own item, so a re-closure
   * regenerates them rather than carrying a stale one.
   */
  extra?: { notDone: ReadonlyArray<{ key: string; text: string }>; knownBugs: ReadonlyArray<{ key: string; text: string }> };
}

/** The whole new file: the carry table applied, then the line budget. */
export function buildProgress(input: BuildProgressInput): string {
  const { state, previous, priorFixes, commit, extra } = input;
  const dir = originDir(state);
  const own = `${dir}#`;
  const fresh = itemsFromState(state);
  const prior = previous === null ? null : parseProgress(previous);
  const dispositions = new Map<string, LeftoverEntry>((state.leftovers ?? []).map(entry => [entry.key, entry]));

  const settled: ProgressItem[] = [];
  const notDone: ProgressItem[] = [];
  const knownBugs: ProgressItem[] = [];
  const dismissed: ProgressItem[] = [];
  const seen = new Set<string>();
  const keep = (list: ProgressItem[], item: ProgressItem): void => {
    if (item.key !== undefined) {
      if (seen.has(item.key)) return;
      seen.add(item.key);
    }
    list.push(item);
  };

  for (const item of prior?.settled ?? []) {
    if (item.key?.startsWith(own)) {
      log.debug('carry', 'own item regenerated from the state', { key: item.key, outcome: 'regenerated' });
      continue;
    }
    if (item.key !== undefined) log.debug('carry', 'settled item carried', { key: item.key, outcome: 'carried' });
    keep(settled, item);
  }
  for (const [section, target] of [['notDone', notDone], ['knownBugs', knownBugs]] as const) {
    for (const item of prior?.[section] ?? []) {
      if (item.key === undefined) {
        keep(target, item);
        continue;
      }
      if (item.key.startsWith(own)) {
        log.debug('carry', 'own item regenerated from the state', { key: item.key, outcome: 'regenerated' });
        continue;
      }
      const disposition = dispositions.get(item.key);
      if (disposition?.disposition === 'taken') {
        log.debug('carry', 'item taken into this run', { key: item.key, outcome: 'taken' });
        continue;
      }
      if (disposition?.disposition === 'dismissed') {
        log.debug('carry', 'item dismissed by the user', { key: item.key, outcome: 'dismissed' });
        dismissed.push({ key: item.key, text: clip(`${item.text} — dismissed ${disposition.at.slice(0, 10)}: «${disposition.answer}»`) });
        continue;
      }
      log.debug('carry', 'open item carried', { key: item.key, outcome: 'carried' });
      keep(target, item);
    }
  }
  for (const item of [...dismissed, ...fresh.settled]) keep(settled, item);
  for (const item of fresh.notDone) keep(notDone, item);
  for (const item of fresh.knownBugs) keep(knownBugs, item);
  for (const item of extra?.notDone ?? []) keep(notDone, { key: item.key, text: clip(item.text) });
  for (const item of extra?.knownBugs ?? []) keep(knownBugs, { key: item.key, text: clip(item.text) });

  const read = priorFixes === null ? null : new Set(priorFixes.map(line => line.trim()));
  const fixes = (prior?.fixes ?? []).filter(line => read === null || !read.has(line.trim()));

  const header = `Closed ${dir} on ${state.finishedAt ?? state.updatedAt ?? state.startedAt}, outcome ${state.outcome ?? 'none'}, at commit ${commit ?? 'none'}.`;
  let omitted = prior?.settledOmitted ?? 0;
  let dropped = 0;
  const items: ProgressItems = { settled, notDone, knownBugs };
  let text = render(header, items, fixes, omitted);
  while (lineCount(text) > PROGRESS_LINE_BUDGET) {
    const oldest = settled.findIndex(item => item.key !== undefined);
    if (oldest === -1) break;
    settled.splice(oldest, 1);
    omitted += 1;
    dropped += 1;
    text = render(header, items, fixes, omitted);
  }
  if (dropped > 0) log.debug('trim', 'oldest settled items gave way to the line budget', { dropped });
  log.info('build', 'progress file built', {
    settled: settled.length, notDone: notDone.length, knownBugs: knownBugs.length, fixes: fixes.length, lines: lineCount(text),
  });
  return text;
}
