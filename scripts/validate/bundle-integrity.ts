#!/usr/bin/env node
// Checks a skill bundle's structure: frontmatter, link targets, and the
// dependency rule that keeps the context budget honest — a phase file never
// links to another phase file.

import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { pathToFileURL } from 'node:url';

import { checkCodexRuntime } from './host-degradation.ts';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';

export type { Violation };

const log = createLogger('bundle-integrity');

const REQUIRED_KEYS = ['name', 'description', 'argument-hint'];

/**
 * One bundle's directory names.
 *
 * The package holds two skills and they do not use the same word for the thing
 * read one file at a time: Maestro has `phases/`, Scout has `steps/`. Both mean
 * the same rule — linked only from `SKILL.md`, never from each other — so the
 * checker learns the name rather than the rule learning a second name.
 *
 * **What the widening costs.** Before it, a bundle either had `phases/` or was
 * silently unchecked: `listMarkdown` returns nothing for a directory that is not
 * there, the reachability pass reports zero files, and the run says OK. That is
 * how Scout's five step files passed this checker while nothing had read them.
 * A profile table does not remove that failure mode, it only moves it — a third
 * bundle whose directory is named something else fails open in exactly the same
 * way. So the profile carries `other`, the markdown directories a bundle
 * deliberately does not read one at a time, and any directory of markdown that
 * no profile accounts for is a violation. Fail-open became fail-loud; the price
 * is that adding a bundle means adding a row here, and forgetting to is now an
 * error rather than a silence.
 */
export interface BundleProfile {
  name: string;
  /** Read one file at a time, linked only from `SKILL.md`. */
  steps: string;
  /** Handed to a субагент; linked from anywhere in the bundle. */
  prompts: string;
  /** Markdown that is neither, and is opened deliberately by something else. */
  other: string[];
}

export const MAESTRO_BUNDLE: BundleProfile = {
  name: 'maestro',
  steps: 'phases',
  prompts: 'prompts',
  other: ['references'],
};

export const SCOUT_BUNDLE: BundleProfile = {
  name: 'scout',
  steps: 'steps',
  prompts: 'prompts',
  other: [],
};

/** Resolved by the bundle's own directory name, which is also its skill name. */
export function bundleProfileFor(bundleDir: string): BundleProfile {
  return path.basename(path.resolve(bundleDir)) === 'scout' ? SCOUT_BUNDLE : MAESTRO_BUNDLE;
}

export interface Frontmatter {
  keys: Map<string, string>;
  /** 1-based line of the closing `---`, or 0 when there is no frontmatter. */
  endLine: number;
}

/**
 * Read the leading `---` block as flat `key: value` pairs.
 *
 * Deliberately not a YAML parser: the frontmatter this checker validates is a
 * handful of scalars, and pulling in a parser to read them would put a runtime
 * dependency in a repository whose whole point is not having one. A nested or
 * multi-line value is left unparsed rather than half-parsed.
 */
export function parseFrontmatter(markdown: string): Frontmatter {
  const lines = markdown.split('\n');
  const keys = new Map<string, string>();
  if ((lines[0] ?? '').trim() !== '---') return { keys, endLine: 0 };

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '---') return { keys, endLine: i + 1 };

    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key = '', rawValue = ''] = match;
    keys.set(key, rawValue.trim().replace(/^["']|["']$/g, ''));
  }

  // Opened but never closed: report it as absent rather than swallowing the
  // whole document as frontmatter.
  return { keys: new Map(), endLine: 0 };
}

export interface Link {
  target: string;
  line: number;
}

const INLINE_LINK = /\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

/**
 * Every inline markdown link that points at a file in this repository.
 * Absolute URLs, mail links and bare anchors are somebody else's problem.
 */
export function findRelativeLinks(markdown: string): Link[] {
  const links: Link[] = [];

  markdown.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(INLINE_LINK)) {
      const target = match[1] ?? '';
      if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      links.push({ target: target.split('#')[0] ?? '', line: index + 1 });
    }
  });

  return links.filter(link => link.target !== '');
}

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

/** Every markdown file under one of the bundle's directories, relative to its root. */
async function listMarkdown(bundleDir: string, directory: string): Promise<string[]> {
  const found: string[] = [];

  const walk = async (relative: string): Promise<void> => {
    const entries = await readdir(path.join(bundleDir, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.name.endsWith('.md')) found.push(child);
    }
  };

  if (await exists(path.join(bundleDir, directory))) await walk(directory);
  return found;
}

/** Declared procedure scaffolding; these checks do not establish semantic quality. */
export function checkProcedure(body: string): string[] {
  const requirements: Array<[string, RegExp]> = [
    ['entry inputs', /(?:Entry|prerequisites|entry inputs)\s*:/i],
    ['numbered actions', /^\s*1\. /m],
    ['output fields', /(?:Return|Output|fields)\s*(?:JSON|fields)?\s*:/i],
    ['missing-capability outcome', /unavailable|incomplete|pending/i],
    ['valid example', /Valid:/], ['invalid example', /Invalid:/],
    ['next action', /next action|exit|return once|For failed|For passed|then|next/i],
  ];
  return requirements.filter(([, pattern]) => !pattern.test(body)).map(([name]) => name);
}

export const COMPLETION_PROCEDURES = [
  ['prompts/manifest-reader.md', ''], ['prompts/repair-diagnostician.md', ''],
  ['prompts/strategy-reviewer.md', ''],
  ['phases/1-manifest.md', '5a. Independently audit before agreement'],
  ['phases/3-spec.md', 'Integrated Outcomes And Readiness'],
  ['phases/4-plan.md', 'Journey And Control Ownership'],
  ['phases/5-build.md', 'Execute Journeys And Selected Controls'],
  ['phases/6-review.md', 'Verify Execution Handoffs'],
  ['phases/7-acceptance.md', 'Completion Reconciliation After Blind Discovery'],
  ['phases/8-repair.md', '1a. Split the finding into defects'],
  ['phases/8-repair.md', '2b. Strategy review'],
  ['phases/0-preflight.md', 'Explicit Historical Resume'],
  ['references/verification-procedures.md', 'Readiness Protocol'],
  ['references/verification-procedures.md', 'Journey Protocol'],
  ['references/verification-procedures.md', 'Selective Negative-Control Protocol'],
] as const;

/**
 * The one sentence every brief under `prompts/` carries.
 *
 * The skill's own trigger is someone describing what they want built, and that
 * is exactly what a task file reads like. A субагент free to invoke a skill can
 * recognise its таск as a new бриф and start a nested прогон inside the first
 * one, and the fan-out multiplies at every level — a review pass that did this
 * went past fifty agents. Only the orchestrator dispatches.
 *
 * Matched as the literal sentence, not as a marker the way `viewer-ownership`
 * matches its rule. There each brief words its share of the rule for its own
 * role, so only a marker is stable. Here the sentence is the same in every brief
 * and *is* the instruction the субагент reads: a marker would keep passing after
 * the sentence beside it was deleted.
 */
export const LEAF_RULE = 'Invoke no skill and dispatch no agent; do the work in this context.';

/** Whitespace-normalised, so re-wrapping a paragraph never fails the check. */
export function carriesLeafRule(body: string): boolean {
  return body.replace(/\s+/g, ' ').includes(LEAF_RULE);
}

/** One literal a bundle file must carry, and what breaks without it. */
export interface Anchor { file: string; literal: string; why: string }

/**
 * The literal text that carries the memory read path through the bundle.
 *
 * Phase 9 writes what a прогон learned and preflight reads it back for the next
 * one. Each step of that path lives in a different file, and the path is broken
 * the moment any one of them loses its line. Each anchor is the instruction
 * itself — a command, a template, a table header — matched literally for the
 * reason `LEAF_RULE` is: a marker would keep passing after the words beside it
 * were deleted. Whether a decision clears the threshold for `decisions.md` is
 * a judgement, so no anchor stands for it; `phases/9-memory.md` says so.
 */
export const MEMORY_ANCHORS: readonly Anchor[] = [
  { file: 'phases/0-preflight.md', literal: 'sync.mts --memory-read',
    why: 'preflight is where the memory and earlier decisions are read; without it nothing ever reads them' },
  { file: 'phases/9-memory.md', literal: 'sync.mts --memory-write',
    why: 'the block is spliced by the helper, never re-derived in prose' },
  { file: 'phases/2-briefing.md', literal: 'prior.md',
    why: 'a fork the прогон settles itself is checked against what earlier runs decided' },
  { file: 'phases/2-briefing.md', literal: 'contradicts <date> decision, because',
    why: 'an answer that overrides an earlier decision has to say so' },
  { file: 'phases/3-spec.md', literal: 'prior.md',
    why: 'the spec reads what earlier runs decided before it settles the same thing' },
  { file: 'phases/3-spec.md', literal: 'contradicts <date> decision, because',
    why: 'a spec entry against an earlier decision is never a silent override' },
  { file: 'phases/4-plan.md', literal: "| Term | Meaning | Words to avoid | User's wording |",
    why: 'interfaces.md names each domain word once, so two таски cannot name one thing two ways' },
  { file: 'prompts/task-reader.md', literal: 'Words to avoid',
    why: 'the task reader is what holds a task file to the Terms table' },
];

/**
 * The literal text that carries «briefing proposes, the user disposes».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The fork-table rows are
 * the rows that route a question: losing the repository-fact row sends a
 * question the code answers back to the user, and losing a contradiction row
 * lets two sentences of the бриф that disagree reach the spec unasked. Whether a
 * recommendation was the right one is a judgement, so no anchor stands for it;
 * what G1 can hold of it is the `answers.md` entry (`scripts/gates/answers.ts`).
 */
export const BRIEFING_ANCHORS: readonly Anchor[] = [
  { file: 'phases/2-briefing.md', literal: 'The answer is a fact about the repository',
    why: 'a question the code answers is read in every mode, never put to the user' },
  { file: 'phases/2-briefing.md', literal: 'Two sentences of the бриф contradict each other',
    why: 'a contradiction inside the бриф is a fork, quoted both ways' },
  { file: 'phases/2-briefing.md', literal: 'The бриф contradicts the existing code',
    why: 'a бриф that disagrees with the code is a fork, not a silent pick' },
  { file: 'phases/2-briefing.md', literal: 'One word is used for two things',
    why: 'an overloaded word is a fork, settled before two таски name one thing two ways' },
  { file: 'phases/2-briefing.md', literal: 'at most two rounds',
    why: 'rounds are bounded, so a run cannot interview the user without end' },
  { file: 'phases/2-briefing.md', literal: '(recommended — <reason in one clause>)',
    why: 'every question carries the прогон\'s own answer and its reason' },
  { file: 'phases/2-briefing.md', literal: 'Chosen:',
    why: 'a delegated reply is recorded as the full text of the option it chose' },
  { file: 'phases/2-briefing.md', literal: 'own answer',
    why: 'a composed reply is recorded as composed, never forced into an option' },
  { file: 'SKILL.md', literal: 'never travels alone',
    why: 'an R## the user reads always carries the gist of its требование' },
  { file: 'SKILL.md', literal: '«Не понял» is not an answer',
    why: 'a reply that did not understand leaves the stop open and re-asks with the premise' },
];

/**
 * The literal text that carries «executors write tests that can fail».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The executor brief says
 * how a test is written and that a check is seen red before it counts green;
 * the reviewer brief makes the three ways round that blocking; the plan phase
 * and the task reader give every таск the surface its tests go through; the
 * verification procedures refuse the import. A file that loses its line keeps
 * the others intact and the rule broken. What the return block itself must
 * carry is held by `scripts/gates/execution-return.ts`, against the template the
 * executor brief ships. Whether a red run truly came first, and whether an
 * assertion recomputes the implementation, are the reviewer's judgement, so no
 * anchor stands for them.
 */
export const TESTING_ANCHORS: readonly Anchor[] = [
  { file: 'prompts/executor.md', literal: 'format: maestro-execution-return/1',
    why: 'the return block is the one shape the import step and the parser read' },
  { file: 'prompts/executor.md', literal: 'Red observed',
    why: 'a check never seen failing can pass by construction' },
  { file: 'prompts/executor.md', literal: 'never recomputed the way the code computes them',
    why: 'an expected value recomputed like the code agrees with it whatever the code does' },
  { file: 'prompts/executor.md', literal: 'only external services, time and randomness',
    why: 'a mock of the code under test tests the mock' },
  { file: 'prompts/executor.md', literal: 'A skipped or pending test is not a pass',
    why: 'a worktree lacks ignored fixtures and credentials, so a test can skip itself and exit green' },
  { file: 'prompts/reviewer.md', literal: 'no red observed',
    why: 'a missing red run is a blocking check-quality finding' },
  { file: 'prompts/reviewer.md', literal: 'recomputes the implementation',
    why: 'an assertion that recomputes the implementation is a blocking check-quality finding' },
  { file: 'prompts/reviewer.md', literal: 'a skipped or pending test counted as passed',
    why: 'a skip counted as a pass is a blocking check-quality finding' },
  { file: 'prompts/task-reader.md', literal: 'A missing test surface',
    why: 'the task reader holds every task file to naming what its tests call' },
  { file: 'phases/4-plan.md', literal: '| Test surface |',
    why: 'every task file names the interface its tests go through' },
  { file: 'phases/4-plan.md', literal: 'Fewer seam rows are better',
    why: 'every seam is a contract two executors must both meet, and the user never confirms one' },
  { file: 'references/verification-procedures.md',
    literal: 'executor writes is seen failing on one of its named assertions',
    why: 'detector qualification covers a first build, not only a repair' },
  { file: 'references/verification-procedures.md', literal: 'skipped or pending test reported as `passed`',
    why: 'the import step refuses a skip reported as a pass' },
];

/**
 * The literal text that carries «the plan cuts for width and for something to
 * show».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The plan phase states
 * four preferences and where a declined one is named; the build phase hands a
 * dependent таск its blockers' `D##` rows, and the executor brief says those
 * rows are facts rather than contract; the task reader reports a *done means*
 * only a stub can meet; the consistency reader checks a command against the
 * Project conventions section. A file that loses its line keeps the others
 * intact and the rule broken. Whether a declined preference's reason is true,
 * whether a prefactor really preserves behaviour, and whether a dependent used
 * the rows it was handed are the readers' and the review's judgement, so no
 * anchor stands for them.
 */
export const CUT_ANCHORS: readonly Anchor[] = [
  { file: 'phases/4-plan.md', literal: 'Each is a preference the plan may decline with a stated reason',
    why: 'a preference the plan states as a hard rule fights the width it was meant to buy' },
  { file: 'phases/4-plan.md', literal: 'A thin path end to end',
    why: 'a таск whose done means is something that visibly works is checked against the real thing' },
  { file: 'phases/4-plan.md', literal: 'Prefactor to unlock width (existing code only)',
    why: 'a shared file otherwise serialises таски or merges them into one oversized таск' },
  { file: 'phases/4-plan.md', literal: 'Cut it only when an existing check already covers',
    why: 'a preservation check the prefactor wrote for itself passes on the old code at once, '
      + 'and a check never seen failing proves nothing' },
  { file: 'phases/4-plan.md', literal: 'Expand, migrate, contract',
    why: 'a many-file change cut as one таск hands off over and over' },
  { file: 'phases/4-plan.md', literal: 'It opens with **Project conventions**',
    why: 'without it every executor rediscovers the test command, and two rediscover it differently' },
  { file: 'phases/4-plan.md', literal: 'a task file is buildable without the `D##` rows',
    why: 'the rows a dependent is handed do not exist when its task file is read' },
  { file: 'phases/4-plan.md', literal: 'A declined preference is named, never silent',
    why: 'a preference declined without a reason is indistinguishable from one forgotten' },
  { file: 'phases/5-build.md', literal: 'is also handed the `D##` rows its blockers recorded',
    why: 'the D## rows are written for the dependent таск and otherwise reach no one' },
  { file: 'phases/5-build.md', literal: 'D## — from таск NN — <fact>',
    why: 'a dependent is handed its blockers\' rows by the таск each row names' },
  { file: 'prompts/executor.md', literal: 'Those rows are facts, not contract',
    why: 'an executor that adapts to a row silently hides the divergence that would route it' },
  { file: 'prompts/executor.md', literal: 'Project conventions section of `interfaces.md`',
    why: 'the executor runs the commands the plan wrote once rather than rediscovering them' },
  { file: 'prompts/task-reader.md', literal: 'A *done means* only a stub can meet',
    why: 'a done means that needs a таск it does not depend on can be met only against a stand-in' },
  { file: 'prompts/plan-consistency-reader.md',
    literal: 'The Project conventions section of `interfaces.md` is what a command is checked against',
    why: 'a stale instruction needs one place to be stale against' },
];

/** Every anchor in `anchors` the documents fail to carry, as violations under `check`. */
function missingAnchors(
  byFile: ReadonlyMap<string, string>,
  anchors: readonly Anchor[],
  check: string,
): Violation[] {
  const missing: Violation[] = [];
  for (const anchor of anchors) {
    const found = carriesLiteral(byFile.get(anchor.file) ?? '', anchor.literal);
    log.debug(check, 'anchor checked', { file: anchor.file, literal: anchor.literal, found });
    if (!found) {
      missing.push({ check, file: anchor.file.split('/').join(path.sep), line: 0,
        message: `does not carry "${anchor.literal}" — ${anchor.why}` });
    }
  }
  log.info(check, 'anchors checked', { anchors: anchors.length, missing: missing.length });
  return missing;
}

const PRIOR_MEMORY_FILE = 'prior.md';
const NOT_GIVEN_HEADING = 'What You Are Not Given';

/** Whitespace-normalised, as for the leaf rule. */
const carriesLiteral = (body: string, literal: string): boolean =>
  body.replace(/\s+/g, ' ').includes(literal.replace(/\s+/g, ' '));

export function procedureSection(body: string, heading: string): string {
  if (!heading) return body;
  const lines = body.split('\n');
  const index = lines.findIndex(line => line.replace(/^#+ /, '') === heading);
  if (index < 0) return '';
  const depth = /^#+/.exec(lines[index]!)![0].length;
  const end = lines.findIndex((line, cursor) => cursor > index && /^#+ /.test(line)
    && /^#+/.exec(line)![0].length <= depth);
  return lines.slice(index + 1, end < 0 ? undefined : end).join('\n');
}

export async function checkBundle(
  bundleDir: string,
  profile: BundleProfile = MAESTRO_BUNDLE,
): Promise<Violation[]> {
  const PHASES_DIR = profile.steps;
  const PROMPTS_DIR = profile.prompts;
  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  // --- the entry point exists ----------------------------------------------
  const skillPath = path.join(bundleDir, 'SKILL.md');
  if (!(await exists(skillPath))) {
    add('entry', 'SKILL.md', 0, 'bundle has no SKILL.md');
    return violations;
  }
  const skill = await readFile(skillPath, 'utf8');

  // --- frontmatter ----------------------------------------------------------
  const frontmatter = parseFrontmatter(skill);
  if (frontmatter.endLine === 0) {
    add('frontmatter', 'SKILL.md', 1, 'SKILL.md has no closed --- frontmatter block');
  } else {
    for (const key of REQUIRED_KEYS) {
      const value = frontmatter.keys.get(key);
      if (value === undefined) {
        add('frontmatter', 'SKILL.md', 1, `frontmatter is missing "${key}"`);
      } else if (value === '') {
        add('frontmatter', 'SKILL.md', 1, `frontmatter key "${key}" is empty`);
      }
    }

    const declared = frontmatter.keys.get('name');
    const directory = path.basename(path.resolve(bundleDir));
    if (declared !== undefined && declared !== '' && declared !== directory) {
      add('frontmatter', 'SKILL.md', 1,
        `frontmatter name "${declared}" does not match directory "${directory}"`);
    }
    log.info('frontmatter', 'frontmatter checked', { keys: frontmatter.keys.size });
  }

  // --- no markdown directory is outside every profile ----------------------
  for (const entry of await readdir(bundleDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === PHASES_DIR || entry.name === PROMPTS_DIR) continue;
    if (profile.other.includes(entry.name)) continue;
    if ((await listMarkdown(bundleDir, entry.name)).length === 0) continue;
    add('directories', entry.name, 0,
      `"${entry.name}" holds markdown and profile "${profile.name}" does not account for it — `
      + 'a directory no profile names is a directory nothing reads');
  }

  // --- links resolve, everywhere in the bundle ------------------------------
  const phaseFiles = await listMarkdown(bundleDir, PHASES_DIR);
  const promptFiles = await listMarkdown(bundleDir, PROMPTS_DIR);
  log.debug('phases', 'phase files found', { count: phaseFiles.length, files: phaseFiles });
  log.debug('prompts', 'prompt files found', { count: promptFiles.length, files: promptFiles });

  const documents: Array<{ file: string; body: string }> = [
    { file: 'SKILL.md', body: skill },
  ];
  for (const file of [...phaseFiles, ...promptFiles]) {
    documents.push({ file, body: await readFile(path.join(bundleDir, file), 'utf8') });
  }

  let linkCount = 0;
  const linkedFromSkill = new Set<string>();
  const linkedAnywhere = new Set<string>();

  for (const { file, body } of documents) {
    const fromDir = path.dirname(file);
    const fromPrompt = file.startsWith(`${PROMPTS_DIR}${path.sep}`);

    for (const link of findRelativeLinks(body)) {
      linkCount += 1;
      const resolved = path.normalize(path.join(fromDir, link.target));

      if (resolved.startsWith('..')) {
        add('links', file, link.line, `link "${link.target}" escapes the bundle`);
        continue;
      }
      if (!(await exists(path.join(bundleDir, resolved)))) {
        add('links', file, link.line, `link "${link.target}" resolves to nothing`);
        continue;
      }
      if (file === 'SKILL.md') linkedFromSkill.add(resolved);
      linkedAnywhere.add(resolved);

      // --- nothing but SKILL.md reaches into phases/ -------------------------
      const insidePhases = resolved.startsWith(`${PHASES_DIR}${path.sep}`);
      if (file !== 'SKILL.md' && insidePhases && resolved !== file) {
        add('cross-phase', file, link.line, fromPrompt
          ? `prompt links to "${link.target}" — a subagent brief that reaches a phase's `
            + 'rules stops being an independent brief'
          : `${PHASES_DIR} file links to "${link.target}" — hoist the shared rule into SKILL.md `
            + 'or give it its own file each phase opens deliberately');
      }
    }
  }
  log.info('links', 'links checked', { count: linkCount, documents: documents.length });

  // --- nothing under phases/ or prompts/ is orphaned ------------------------
  for (const file of phaseFiles) {
    if (!linkedFromSkill.has(file)) {
      add('reachability', file, 0, `${PHASES_DIR} file is not linked from SKILL.md`);
    }
  }
  // A prompt is opened by whichever phase hands it over, so any document in the
  // bundle may be the one that reaches it.
  for (const file of promptFiles) {
    if (!linkedAnywhere.has(file)) {
      add('reachability', file, 0, 'prompt file is not linked from anywhere in the bundle');
    }
  }
  log.info('reachability', 'phase and prompt files checked', {
    phases: phaseFiles.length,
    linkedPhases: phaseFiles.filter(file => linkedFromSkill.has(file)).length,
    prompts: promptFiles.length,
    linkedPrompts: promptFiles.filter(file => linkedAnywhere.has(file)).length,
  });

  // --- every brief keeps its субагент a leaf --------------------------------
  // See `LEAF_RULE` for why, and why the sentence rather than a marker.
  let carrying = 0;
  for (const { file, body } of documents) {
    if (!file.startsWith(`${PROMPTS_DIR}${path.sep}`)) continue;
    if (carriesLeafRule(body)) {
      carrying += 1;
      log.debug('leaf', 'brief carries the leaf rule', { file });
      continue;
    }
    add('leaf', file, 0,
      `brief does not carry "${LEAF_RULE}" — a субагент free to invoke a skill or `
      + 'dispatch an agent can read its таск as a new бриф and start a nested прогон, '
      + 'and the fan-out multiplies with every level');
  }
  log.info('leaf', 'leaf rule checked', { prompts: promptFiles.length, carrying });

  // --- the memory read path, end to end -------------------------------------
  // Only a bundle with a memory phase has a path to hold; Scout has none.
  const byFile = new Map(documents.map(({ file, body }) => [file.split(path.sep).join('/'), body]));
  if (byFile.has('phases/9-memory.md')) {
    for (const v of missingAnchors(byFile, MEMORY_ANCHORS, 'memory')) add(v.check, v.file, v.line, v.message);
    // Executors and reviewers are not in the gate reader table, so the
    // withholding `npm run readers` holds has to be held here for them.
    for (const { file, body } of documents) {
      if (!file.startsWith(`${PROMPTS_DIR}${path.sep}`)) continue;
      const notGiven = procedureSection(body, NOT_GIVEN_HEADING);
      const outside = notGiven === '' ? body : body.replace(notGiven, '');
      if (outside.includes(PRIOR_MEMORY_FILE)) {
        add('memory', file, 0,
          `brief mentions ${PRIOR_MEMORY_FILE} outside "## ${NOT_GIVEN_HEADING}" — no субагент is handed `
          + 'what earlier runs decided; only withhold it');
      }
    }
    log.info('memory', 'memory read path checked', { anchors: MEMORY_ANCHORS.length });
  }

  // --- briefing proposes, the user disposes ---------------------------------
  // Only a брифинг phase SKILL.md actually opens routes questions this way. An
  // orphan file of that name is reachability's finding, not this one's, and
  // Scout grills by its own step file.
  if (byFile.has('phases/2-briefing.md') && skill.includes('phases/2-briefing.md')) {
    for (const v of missingAnchors(byFile, BRIEFING_ANCHORS, 'briefing')) add(v.check, v.file, v.line, v.message);
  }

  // --- executors write tests that can fail -----------------------------------
  // Only a bundle with an executor brief builds anything; Scout has none. The
  // procedures live under references/, which the link pass above never reads,
  // so the one file this check needs from there is read for it alone.
  if (byFile.has('prompts/executor.md')) {
    const testing = new Map(byFile);
    const procedures = 'references/verification-procedures.md';
    const body = await readFile(path.join(bundleDir, procedures), 'utf8').catch(() => '');
    testing.set(procedures, body);
    for (const v of missingAnchors(testing, TESTING_ANCHORS, 'testing')) add(v.check, v.file, v.line, v.message);
  }

  // --- the plan cuts for width and for something to show ---------------------
  // Only a bundle with a plan phase cuts таски; Scout has none.
  if (byFile.has('phases/4-plan.md')) {
    for (const v of missingAnchors(byFile, CUT_ANCHORS, 'cut')) add(v.check, v.file, v.line, v.message);
  }

  if (skill.includes('<!-- maestro:delegation:native-explicit -->') || skill.includes('<!-- maestro:runtime:node -->')) {
    if (!skill.includes('<!-- maestro:runtime:node -->')) add('runtime', 'SKILL.md', 0, 'declare the autonomous Node runtime marker');
    violations.push(...await checkRuntimeImports(path.join(bundleDir, 'tools')));
    for (const file of ['SKILL.md', ...phaseFiles, ...await listMarkdown(bundleDir, 'references')]) {
      const body = await readFile(path.join(bundleDir, file), 'utf8');
      if (/python(?:3)?\s+[^\n]*sync\.py|coordinator-sync\.py/.test(body)) add('runtime', file, 0, 'replace the obsolete helper invocation with node sync.mts');
    }
  }

  if (skill.includes('<!-- maestro:delegation:native-explicit -->')) {
    violations.push(...await checkCodexRuntime(bundleDir));
  }

  if (skill.includes('<!-- maestro:completion-protocols -->')) {
    for (const [file, heading] of COMPLETION_PROCEDURES) {
      const body = await readFile(path.join(bundleDir, file), 'utf8').catch(() => '');
      for (const missing of checkProcedure(procedureSection(body, heading))) {
        add('procedure', file, 0, `declared procedure "${heading || file}" lacks ${missing}`);
      }
    }
    log.info('procedure', 'completion procedure scaffolding checked', { count: COMPLETION_PROCEDURES.length });
  }
  return violations;
}

/** Tokenize enough syntax to avoid treating quoted data or comments as imports. */
export function runtimeImports(source: string): { imports: string[]; computed: boolean } {
  const tokens = [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g)]
    .map(match => match[0]).filter(token => !token.startsWith('//') && !token.startsWith('/*'));
  const imports: string[] = [];
  let computed = false;
  const literal = (token: string | undefined): boolean => token?.startsWith("'") === true || token?.startsWith('"') === true;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.startsWith('`') && /\b(?:import|require)\s*\(/.test(token)) computed = true;
    if (token === 'require' && tokens[index + 1] === '(') computed = true;
    if (token === 'import' && tokens[index + 1] === '(') {
      if (!literal(tokens[index + 2]) || tokens[index + 3] !== ')') computed = true;
      else imports.push(tokens[index + 2]!.slice(1, -1));
    } else if ((token === 'from' || token === 'import') && literal(tokens[index + 1])) {
      imports.push(tokens[index + 1]!.slice(1, -1));
    }
  }
  return { imports, computed };
}

/** The installed executable import closure cannot rely on the repository or packages. */
export async function checkRuntimeImports(toolsDir: string): Promise<Violation[]> {
  const root = path.resolve(toolsDir);
  const violations: Violation[] = [];
  const add = (file: string, message: string): void => {
    violations.push({ check: 'runtime', file, line: 0, message });
    log.error('runtime', message, { file });
  };
  if (!await exists(path.join(root, 'sync.mts'))) add('tools/sync.mts', 'ship the sole Node command entrypoint');
  if (!await exists(path.join(root, 'runtime'))) add('tools/runtime', 'ship the complete autonomous runtime tree');
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.mts')) files.push(file);
      else if (entry.name.endsWith('.py')) add(path.relative(root, file), 'remove the obsolete Python helper from the shipped bundle');
    }
  };
  await walk(root);
  for (const file of files) {
    const relative = path.relative(root, file);
    const source = await readFile(file, 'utf8');
    const parsed = runtimeImports(source);
    if (parsed.computed) {
      add(relative, 'use explicit static bundle-local imports or node:* built-ins');
    }
    if (/\b(?:spawn|execFile)\s*\(\s*['"]python(?:3)?['"]/.test(source)) {
      add(relative, 'do not invoke a Python runtime');
    }
    for (const target of parsed.imports) {
      if (target.startsWith('node:')) {
        if (!builtinModules.includes(target.slice(5)) && !builtinModules.includes(target)) add(relative, `unknown Node built-in ${target}`);
        continue;
      }
      if (!target.startsWith('.') || !target.endsWith('.mts')) {
        add(relative, `import ${target} must be an explicit relative .mts module`);
        continue;
      }
      const resolved = path.resolve(path.dirname(file), target);
      if (!resolved.startsWith(root + path.sep)) {
        add(relative, `import ${target} escapes the installed tools tree`);
        continue;
      }
      try {
        const actual = await realpath(resolved);
        if (!actual.startsWith((await realpath(root)) + path.sep) || !(await stat(actual)).isFile()) {
          add(relative, `import ${target} does not resolve to a confined runtime file`);
        }
      } catch { add(relative, `import ${target} resolves to a missing runtime file`); }
    }
  }
  log.info('runtime', 'autonomous import closure checked', { files: files.length, violations: violations.length });
  return violations;
}

async function main(): Promise<number> {
  const bundleDir = process.argv[2] ?? 'skills/maestro';
  const profile = bundleProfileFor(bundleDir);
  log.info('run', 'checking bundle', { bundleDir, profile: profile.name });

  let violations: Violation[];
  try {
    violations = await checkBundle(bundleDir, profile);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'bundle could not be read', { bundleDir, reason });
    process.stdout.write(`bundle-integrity: cannot read ${bundleDir}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('bundle-integrity: OK\n');
    return 0;
  }
  for (const violation of violations) process.stdout.write(formatViolation(violation));
  process.stdout.write(`bundle-integrity: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
