// The plan's task files as units, the facts they share, and whether a reader
// gave a verdict on every unit it was asked about.
//
// A G3 reader handed a 50–268 KB task file samples it: in one прогон, sixty-one
// rounds found something new each time, and most late findings quoted text
// that twenty earlier readers had been given and not flagged. So the plan
// phase numbers every instruction of a task file as a unit (`` - `U<n>` ``), a
// reader returns one verdict line per unit it is asked about, and this module
// says which units a reader skipped, and which units changed since the last
// covered round, so the next round reads only those.
//
// A fact more than one таск needs — a source row, an oracle, a decision about
// either — lives once in `shared.md` as `### F-<n> — <title>`. A task file cites
// it inside its units, and `--plan-render` copies every cited entry into the
// task file's marked facts section, so an executor and a reader still receive
// one file, and a fix lands in one place.
//
// `--plan-units` and `--plan-coverage` read and report; the orchestrator
// decides (decision D1). `--plan-units --record` and `--plan-render` write,
// and only inside the run directory's `tasks/`.
//
// Contract: docs/spec/phases.md, section "Task Granularity";
// docs/spec/state-contract.md, `--plan-units`, `--plan-render`, `--plan-coverage`.

import { createHash } from 'node:crypto';
import { readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from './shared/log.mts';
import { extractStateLiteral } from './state/read.mts';

const log = createLogger('plan-units');

/** A unit opens a list item with its id in backticks: `` - `U3` … ``. */
export const UNIT_ITEM = /^\s*[-*]\s+`(U\d+)`/;
/** A shared fact is a third-level heading: `### F-12 — title`. */
export const FACT_HEADING = /^###\s+(F-\d+)\s+[—-]\s+(.+?)\s*$/;
/** One verdict per line: a unit, a таск (`T03`) or a seam, then `ok` or `finding`. */
export const VERDICT_LINE = /^\s*(?:[-*]\s+)?`?(U\d+|T\d\d|seam .+?)`?:\s+(ok|finding)\b/;
export const FACTS_START = '<!-- maestro:facts:start -->';
export const FACTS_END = '<!-- maestro:facts:end -->';
export const FACTS_NOTICE = 'Generated from `shared.md` by `node .maestro/sync.mts --plan-render`. Never edit between these markers; change `shared.md` and render again.';
/** A sentence this long, outside the facts section, in two task files is a restated fact. */
export const RESTATED_MIN = 160;
export const SEAMS_HEADER = '| Seam | Producer task | Consumer tasks | Integration owner | Integration check |';
export const BASELINE_FILE = 'units.json';
const TASK_FILE = /^(\d\d)-.+\.md$/;
const HEADING = /^#{1,6}\s/;
const FACT_ID = /\bF-\d+\b/g;

export interface Unit { id: string; hash: string; facts: string[] }
export interface Fact { id: string; title: string; hash: string; body: string }
export interface Violation { kind: string; task?: string; id?: string; detail: string }
/** `frames` holds, per таск, the hash of its text outside every unit; a baseline recorded before it existed lacks it. */
export interface Baseline { interfaces: string; facts: Record<string, string>; tasks: Record<string, Record<string, string>>; frames?: Record<string, string> }
export interface ParsedTask { units: Unit[]; frame: string }
export interface Coverage { missing: string[]; unknown: string[]; duplicate: string[]; findings: number }

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const normalise = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The task file without its generated facts section, which holds no units. */
export function withoutFacts(text: string): string {
  const start = text.indexOf(FACTS_START);
  if (start === -1) return text;
  const end = text.indexOf(FACTS_END, start);
  return end === -1 ? text.slice(0, start) : text.slice(0, start) + text.slice(end + FACTS_END.length);
}

/**
 * Every unit of one task file, in order, what is wrong with them, and the hash
 * of its frame: the text outside every unit and outside the facts section — the
 * header table, Boundaries, the headings — which a reader is handed as context.
 */
export function parseTaskUnits(text: string): ParsedTask & { violations: Violation[] } {
  const units: Unit[] = [];
  const frame: string[] = [];
  const violations: Violation[] = [];
  const seen = new Set<string>();
  let current: { id: string; lines: string[] } | undefined;
  const close = (): void => {
    if (!current) return;
    const body = normalise(current.lines.join('\n'));
    units.push({ id: current.id, hash: digest(body), facts: [...new Set(body.match(FACT_ID) ?? [])].sort(byNumber) });
    current = undefined;
  };
  for (const line of withoutFacts(text).split('\n')) {
    const opened = line.match(UNIT_ITEM);
    if (opened) {
      close();
      const id = opened[1]!;
      if (seen.has(id)) violations.push({ kind: 'duplicate-unit', id, detail: `${id} opens more than one item` });
      seen.add(id);
      current = { id, lines: [line] };
    } else if (HEADING.test(line)) {
      close();
      frame.push(line);
    } else if (current) {
      current.lines.push(line);
    } else {
      frame.push(line);
    }
  }
  close();
  if (units.length === 0) violations.push({ kind: 'no-units', detail: 'no item opens with a `U<n>` id, so a reader cannot be held to every instruction' });
  return { units, frame: digest(normalise(frame.join('\n'))), violations };
}

/** Every fact `shared.md` defines, and any id it defines twice. */
export function parseSharedFacts(text: string): { facts: Fact[]; violations: Violation[] } {
  const facts: Fact[] = [];
  const violations: Violation[] = [];
  let current: { id: string; title: string; lines: string[] } | undefined;
  const close = (): void => {
    if (!current) return;
    const body = current.lines.join('\n').replace(/^\n+|\s+$/g, '');
    if (facts.some(fact => fact.id === current!.id)) {
      violations.push({ kind: 'duplicate-fact', id: current.id, detail: `${current.id} is defined more than once in shared.md` });
    } else {
      facts.push({ id: current.id, title: current.title, body, hash: digest(normalise(`${current.title}\n${body}`)) });
    }
    current = undefined;
  };
  for (const line of text.split('\n')) {
    const heading = line.match(FACT_HEADING);
    if (heading) { close(); current = { id: heading[1]!, title: heading[2]!, lines: [] }; continue; }
    if (/^#{2,3}\s/.test(line)) { close(); continue; }
    current?.lines.push(line);
  }
  close();
  return { facts: facts.sort((a, b) => byNumber(a.id, b.id)), violations };
}

function byNumber(a: string, b: string): number {
  return Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, ''));
}

/** The facts section a task file must carry for the facts it cites; empty when it cites none. */
export function renderFactsSection(cited: readonly string[], facts: readonly Fact[]): { section: string; unknown: string[] } {
  const known = new Map(facts.map(fact => [fact.id, fact]));
  const unknown = cited.filter(id => !known.has(id));
  const present = [...new Set(cited)].filter(id => known.has(id)).sort(byNumber);
  if (present.length === 0) return { section: '', unknown };
  const entries = present.map(id => { const fact = known.get(id)!; return `### ${fact.id} — ${fact.title}\n\n${fact.body}\n`; });
  return { section: `${FACTS_START}\n${FACTS_NOTICE}\n\n${entries.join('\n')}${FACTS_END}`, unknown };
}

/** The facts section as the file holds it, markers included; empty when absent. */
export function currentFactsSection(text: string): string {
  const start = text.indexOf(FACTS_START);
  if (start === -1) return '';
  const end = text.indexOf(FACTS_END, start);
  return end === -1 ? text.slice(start) : text.slice(start, end + FACTS_END.length);
}

/** The task file with its facts section replaced by `section`, appended when absent, removed when empty. */
export function withFactsSection(text: string, section: string): string {
  const existing = currentFactsSection(text);
  if (existing) {
    const replaced = text.replace(existing, section);
    return section ? replaced : replaced.replace(/\n{3,}$/, '\n\n').replace(/\s+$/, '\n');
  }
  return section ? `${text.replace(/\s+$/, '')}\n\n${section}\n` : text;
}

/** Sentences of at least `RESTATED_MIN` characters that two or more task files both carry, outside their facts sections. */
export function restatedPassages(tasks: ReadonlyMap<string, string>): Array<{ text: string; tasks: string[] }> {
  const where = new Map<string, Set<string>>();
  for (const [id, text] of tasks) {
    for (const sentence of withoutFacts(text).split(/(?<=[.!?])\s+|\n{2,}/)) {
      const flat = normalise(sentence);
      if (flat.length < RESTATED_MIN) continue;
      if (!where.has(flat)) where.set(flat, new Set());
      where.get(flat)!.add(id);
    }
  }
  return [...where].filter(([, ids]) => ids.size > 1)
    .map(([text, ids]) => ({ text: text.slice(0, 200), tasks: [...ids].sort() }));
}

/**
 * The units a reader must judge again: new, rewritten, or citing a fact that
 * changed. With no baseline, an `interfaces.md` that changed, or a frame that
 * changed, every unit of the task: an edit to Boundaries or Prerequisites sits
 * in no unit, and every unit is judged against it.
 */
export function changedUnits(
  task: string,
  parsed: ParsedTask,
  facts: readonly Fact[],
  interfacesHash: string,
  baseline: Baseline | undefined,
): string[] {
  const { units } = parsed;
  if (!baseline || baseline.interfaces !== interfacesHash || baseline.frames?.[task] !== parsed.frame) {
    return units.map(unit => unit.id);
  }
  const before = baseline.tasks[task] ?? {};
  const factHash = new Map(facts.map(fact => [fact.id, fact.hash]));
  return units.filter(unit => before[unit.id] !== unit.hash
    || unit.facts.some(id => baseline.facts[id] !== factHash.get(id))).map(unit => unit.id);
}

/** Seam names from the Seams table, each with the таск ids its producer and consumer cells name. */
export function parseSeams(interfaces: string): Array<{ seam: string; tasks: string[] }> {
  const lines = interfaces.split('\n');
  const at = lines.findIndex(line => normalise(line) === SEAMS_HEADER);
  if (at === -1) return [];
  const seams: Array<{ seam: string; tasks: string[] }> = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.trim().startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length < 3) continue;
    seams.push({ seam: seamName(cells[0]!), tasks: taskIds(`${cells[1]} ${cells[2]}`) });
  }
  return seams;
}

const seamName = (cell: string): string => normalise(cell.replace(/`/g, ''));

/** Two-digit таск ids a cell names, a forward range `02–13` expanded. */
function taskIds(cell: string): string[] {
  const ids = new Set<string>();
  for (const range of cell.matchAll(/\b(\d\d)\s*[–-]\s*(\d\d)\b/g)) {
    for (let n = Number(range[1]); n <= Number(range[2]); n += 1) ids.add(String(n).padStart(2, '0'));
  }
  for (const single of cell.matchAll(/\b(\d\d)\b/g)) ids.add(single[1]!);
  return [...ids].sort();
}

/** Which requested ids a reader's return judged, skipped, invented or judged twice. */
export function checkCoverage(requested: readonly string[], returnText: string): Coverage {
  const key = (id: string): string => id.startsWith('seam ') ? `seam ${seamName(id.slice(5))}` : id;
  const counts = new Map<string, number>();
  let findings = 0;
  const wanted = new Set(requested.map(key));
  for (const line of returnText.split('\n')) {
    const verdict = line.match(VERDICT_LINE);
    if (!verdict) continue;
    const id = key(verdict[1]!);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (verdict[2] === 'finding' && wanted.has(id)) findings += 1;
  }
  return {
    missing: [...wanted].filter(id => !counts.has(id)),
    unknown: [...counts.keys()].filter(id => !wanted.has(id)),
    duplicate: [...counts].filter(([, n]) => n > 1).map(([id]) => id),
    findings,
  };
}

// --- the command layer --------------------------------------------------------

interface Plan {
  planDir: string;
  tasks: Map<string, { file: string; text: string }>;
  facts: Fact[];
  factViolations: Violation[];
  interfaces: string;
  baseline: Baseline | undefined;
}

type Outcome = { result: Record<string, unknown>; code: number };

async function loadPlan(runDir: string): Promise<Plan | Outcome> {
  let dir: unknown;
  try {
    dir = (JSON.parse(extractStateLiteral(await readFile(path.join(runDir, 'state.js'), 'utf8'))) as Record<string, unknown>)['dir'];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('plan', 'state could not be read; nothing listed', { runDir, reason });
    return { result: { error: `no readable state.js beside this script — publish the state first (${reason})` }, code: 2 };
  }
  if (typeof dir !== 'string' || dir === '') {
    log.error('plan', 'state names no run directory', { runDir });
    return { result: { error: 'state.js carries no dir — this command needs a contract-7 or later run' }, code: 2 };
  }
  const planDir = path.join(runDir, dir);
  const tasksDir = path.join(planDir, 'tasks');
  let names: string[];
  try { names = (await readdir(tasksDir)).filter(name => TASK_FILE.test(name)).sort(); }
  catch (error) {
    log.error('plan', 'tasks directory could not be read', { path: tasksDir, reason: (error as Error).message });
    return { result: { error: `no tasks/ in ${dir} — write the task files first` }, code: 2 };
  }
  const tasks = new Map<string, { file: string; text: string }>();
  for (const name of names) {
    const file = path.join(tasksDir, name);
    tasks.set(name.slice(0, 2), { file, text: await readFile(file, 'utf8') });
  }
  const shared = await readFile(path.join(planDir, 'shared.md'), 'utf8').catch(() => '');
  const { facts, violations: factViolations } = parseSharedFacts(shared);
  const interfaces = await readFile(path.join(planDir, 'interfaces.md'), 'utf8').catch(() => '');
  let baseline: Baseline | undefined;
  try { baseline = JSON.parse(await readFile(path.join(tasksDir, BASELINE_FILE), 'utf8')) as Baseline; }
  catch { baseline = undefined; }
  return { planDir, tasks, facts, factViolations, interfaces, baseline };
}

function listTasks(plan: Plan): { tasks: Array<Record<string, unknown>>; violations: Violation[]; changed: number } {
  const interfacesHash = digest(plan.interfaces);
  const violations: Violation[] = [...plan.factViolations];
  const tasks: Array<Record<string, unknown>> = [];
  let changed = 0;
  for (const [task, { text }] of plan.tasks) {
    const parsed = parseTaskUnits(text);
    violations.push(...parsed.violations.map(violation => ({ ...violation, task })));
    const cited = [...new Set(parsed.units.flatMap(unit => unit.facts))];
    const rendered = renderFactsSection(cited, plan.facts);
    for (const id of rendered.unknown) violations.push({ kind: 'unknown-fact', task, id, detail: `${id} is cited and shared.md does not define it` });
    if (rendered.unknown.length === 0 && currentFactsSection(text) !== rendered.section) {
      violations.push({ kind: 'stale-facts', task, detail: 'the facts section differs from shared.md — run --plan-render' });
    }
    const fresh = new Set(changedUnits(task, parsed, plan.facts, interfacesHash, plan.baseline));
    changed += fresh.size;
    tasks.push({ id: task, frame: parsed.frame, units: parsed.units.map(unit => ({ ...unit, changed: fresh.has(unit.id) })) });
    log.debug('units', 'task parsed', { task, units: parsed.units.length, facts: cited.length, changed: fresh.size });
  }
  for (const violation of violations) log.warn('units', violation.detail, { task: violation.task, kind: violation.kind, id: violation.id });
  return { tasks, violations, changed };
}

async function replaceFile(target: string, body: string): Promise<void> {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, body, 'utf8');
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    log.error('write', 'file could not be replaced', { path: target, reason: (error as Error).message });
    throw error;
  }
}

/**
 * `--plan-units [--record]`, `--plan-render` and `--plan-coverage <NN|consistency> <return-file>... [--all]`:
 * one JSON result each. See the contract named at the top of this file for
 * every exit code.
 */
export async function planUnitsCommand(args: string[], runDir: string): Promise<Outcome> {
  const loaded = await loadPlan(runDir);
  if ('code' in loaded) return loaded;
  const plan = loaded;

  if (args[0] === '--plan-render') {
    const updates: Array<{ task: string; file: string; body: string }> = [];
    const unknown: Violation[] = [];
    for (const [task, { file, text }] of plan.tasks) {
      const cited = [...new Set(parseTaskUnits(text).units.flatMap(unit => unit.facts))];
      const rendered = renderFactsSection(cited, plan.facts);
      for (const id of rendered.unknown) unknown.push({ kind: 'unknown-fact', task, id, detail: `${id} is cited and shared.md does not define it` });
      const body = withFactsSection(text, rendered.section);
      if (body !== text) updates.push({ task, file, body });
    }
    if (unknown.length > 0 || plan.factViolations.length > 0) {
      const violations = [...plan.factViolations, ...unknown];
      for (const violation of violations) log.warn('render', violation.detail, { task: violation.task, kind: violation.kind, id: violation.id });
      log.info('render', 'nothing rendered', { violations: violations.length });
      return { result: { result: 'refused', violations }, code: 1 };
    }
    for (const update of updates) await replaceFile(update.file, update.body);
    log.info('render', 'facts sections rendered', { tasks: plan.tasks.size, changed: updates.length, facts: plan.facts.length });
    return { result: { result: 'rendered', changed: updates.map(update => update.task) }, code: 0 };
  }

  if (args[0] === '--plan-coverage') {
    const scope = args[1];
    // `--all` asks about everything, baseline or not: repair re-reads a built plan whose units did not move.
    const everything = args.includes('--all');
    // Every return of one reader slot in one round: the first, then each one sent back for the units it skipped.
    const returnFiles = args.slice(2).filter(arg => arg !== '--all');
    if (!scope || returnFiles.length === 0 || (scope !== 'consistency' && !plan.tasks.has(scope))) {
      log.error('coverage', 'bad arguments', { scope, returnFiles });
      return { result: { error: 'usage: --plan-coverage <NN|consistency> <return-file>... [--all], NN a task file of this run' }, code: 2 };
    }
    const returns: string[] = [];
    for (const returnFile of returnFiles) {
      try { returns.push(await readFile(path.resolve(returnFile), 'utf8')); }
      catch (error) {
        log.error('coverage', 'return file could not be read', { path: returnFile, reason: (error as Error).message });
        return { result: { error: `cannot read ${returnFile}` }, code: 2 };
      }
    }
    const returnText = returns.join('\n');
    const listed = listTasks(plan);
    const changedOf = (task: Record<string, unknown>): string[] =>
      (task['units'] as Array<{ id: string; changed: boolean }>).filter(unit => everything || unit.changed).map(unit => unit.id);
    let requested: string[];
    if (scope === 'consistency') {
      const touched = listed.tasks.filter(task => changedOf(task).length > 0).map(task => String(task['id']));
      const seams = parseSeams(plan.interfaces).filter(seam => everything || seam.tasks.some(id => touched.includes(id)));
      requested = [...touched.map(id => `T${id}`), ...seams.map(seam => `seam ${seam.seam}`)];
    } else {
      requested = changedOf(listed.tasks.find(task => task['id'] === scope)!);
    }
    const coverage = checkCoverage(requested, returnText);
    const covered = coverage.missing.length === 0 && coverage.unknown.length === 0 && coverage.duplicate.length === 0;
    log.info('coverage', covered ? 'return covered' : 'return incomplete', { scope, all: everything, returns: returnFiles.length, requested: requested.length, ...coverage });
    return { result: { result: covered ? 'covered' : 'incomplete', requested, ...coverage }, code: covered ? 0 : 1 };
  }

  const listed = listTasks(plan);
  const restated = restatedPassages(new Map([...plan.tasks].map(([id, { text }]) => [id, text])));
  for (const passage of restated) log.warn('units', 'a passage is restated in several task files; it belongs in shared.md', { tasks: passage.tasks });
  if (args.includes('--record')) {
    const baseline: Baseline = {
      interfaces: digest(plan.interfaces),
      facts: Object.fromEntries(plan.facts.map(fact => [fact.id, fact.hash])),
      tasks: Object.fromEntries(listed.tasks.map(task => [String(task['id']),
        Object.fromEntries((task['units'] as Unit[]).map(unit => [unit.id, unit.hash]))])),
      frames: Object.fromEntries(listed.tasks.map(task => [String(task['id']), String(task['frame'])])),
    };
    await replaceFile(path.join(plan.planDir, 'tasks', BASELINE_FILE), `${JSON.stringify(baseline, null, 1)}\n`);
    log.info('record', 'baseline recorded', { tasks: listed.tasks.length });
  }
  log.info('units', 'plan listed', { tasks: listed.tasks.length, changed: listed.changed, violations: listed.violations.length, restated: restated.length });
  const clean = listed.violations.length === 0 && restated.length === 0;
  return {
    result: { result: 'listed', tasks: listed.tasks, facts: plan.facts.map(({ id, title, hash }) => ({ id, title, hash })),
      changed: listed.changed, violations: listed.violations, restated, ...(args.includes('--record') ? { recorded: true } : {}) },
    code: clean ? 0 : 1,
  };
}
