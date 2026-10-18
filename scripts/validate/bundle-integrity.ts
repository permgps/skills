#!/usr/bin/env node
// Checks a skill bundle's structure: frontmatter, link targets, and the
// dependency rule that keeps the context budget honest — a phase file never
// links to another phase file.
//
// For a bundle whose profile carries them, it also holds the resident budget and
// who may start the skill. `SKILL.md` and its description stay in context for a
// whole run, so each has an exact ceiling that can only come down; and the skill
// starts on the user's word alone, declared once per host. The cost: the ceiling
// holds length, not quality — which sentence goes is the sentence test's
// judgement, and no check reads it.

import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkCodexRuntime } from './host-degradation.ts';
import { GLOSSARY_NAMING_MESSAGE, bareGlossaryLines } from './spec-integrity.ts';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
// The helper's own reader, so the field held equal to `package.json` here is
// exactly the field the прогон reads to say a newer Maestro is out.
import { metadataVersion } from '../../skills/maestro/tools/runtime/update-check.mts';
import { closingSubject } from '../../skills/maestro/tools/runtime/history.mts';
import { FACTS_START } from '../../skills/maestro/tools/runtime/plan-units.mts';
import { KNOWN_MEMORY_FILES } from '../memory/markers.ts';
import { PROGRESS_FILE } from '../memory/progress.ts';

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
  /**
   * The size of what stays in context for a whole run: `SKILL.md`'s line count
   * (its `\n` characters, which is `wc -l`) and the `description`'s length in
   * code points, since the description is resident on every turn of every
   * session. Each is an exact ceiling, not an upper bound — a file under its
   * ceiling is refused until the constant comes down to match, so slack never
   * builds up and the number can only fall. Absent means the bundle carries no
   * budget.
   */
  resident?: { skillLines: number; descriptionChars: number };
  /**
   * `'explicit-only'` means only the user starts the skill, and both hosts are
   * told so: `disable-model-invocation: true` in the frontmatter for Claude Code,
   * `policy.allow_implicit_invocation: false` in `agents/openai.yaml` for Codex.
   * One declaration without the other is the two hosts drifting apart.
   */
  invocation?: 'explicit-only';
  /**
   * `SKILL.md` carries `metadata.version`, equal to `package.json`'s. The
   * helper reads it to tell the user a newer Maestro is out, and no release
   * script exists to bump both, so this check is what keeps them together.
   * Absent means the bundle carries no version.
   */
  versioned?: boolean;
}

export const MAESTRO_BUNDLE: BundleProfile = {
  name: 'maestro',
  steps: 'phases',
  prompts: 'prompts',
  other: ['references'],
  // Lowered with every shortening, never raised; raising one is a decision for
  // the roadmap, not a fix.
  resident: { skillLines: 547, descriptionChars: 256 },
  invocation: 'explicit-only',
  versioned: true,
};

/** Where Codex reads a skill's invocation policy, relative to the bundle. */
const CODEX_POLICY_FILE = path.join('agents', 'openai.yaml');

const lineCount = (text: string): number => (text.match(/\n/g) ?? []).length;

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
  { file: 'phases/4-plan.md', literal: "| Term | Meaning | Name in code | Words to avoid | User's wording |",
    why: 'interfaces.md names each domain word once, so two таски cannot name one thing two ways' },
  { file: 'prompts/task-reader.md', literal: 'Words to avoid',
    why: 'the task reader is what holds a task file to the Terms table' },
  { file: 'phases/0-preflight.md', literal: 'project glossary not read:',
    why: 'a project glossary past the limit is a decision taken for the user, and it reaches the отчёт through debt.assumptions' },
  { file: 'phases/4-plan.md', literal: 'contradicts project glossary, because',
    why: 'a Terms row that departs from the user\'s own word has to say so' },
  { file: 'phases/4-plan.md', literal: 'fix the project glossary or the бриф',
    why: 'the user, not the прогон, settles which of the two files is wrong' },
  { file: 'phases/9-memory.md', literal: 'term — meaning (not: x, y)',
    why: 'the words to avoid survive the carry, so the next прогон does not give one thing a second name' },
  { file: 'phases/9-memory.md', literal: 'Leave out a term the project glossary already defines',
    why: 'each word has one source of truth, and the block stays short' },
  { file: 'phases/0-preflight.md', literal: '--commit-summary',
    why: 'past thirty commits prior.md is written only on the second call, with the commit reader\'s lines' },
  { file: 'phases/0-preflight.md', literal: 'commits since the last closure not summarised:',
    why: 'a history nobody summarised is a decision taken for the user, and it reaches the отчёт through debt.assumptions' },
  { file: 'phases/2-briefing.md', literal: '### Leftovers —',
    why: 'work an earlier прогон left open is offered once, under the one heading G1 accepts without an R##' },
  { file: 'phases/3-spec.md', literal: 'changed since the last closure',
    why: 'the existing-code reader reads first what changed outside Maestro, handed as paths, never as prior.md' },
  { file: 'phases/7-acceptance.md', literal: 'PROGRESS.md',
    why: 'the closing publish writes where the work stands, and a failure is said to the user' },
  // The commit reader summarises what the helper would have listed, so it has to
  // read the same history: the range string carries no `--no-merges` and no
  // pathspec, and the reader adds both itself. The excluded names come from the
  // runtime's own list, so a memory file added there is a finding here.
  { file: 'prompts/commit-reader.md', literal: '--no-merges',
    why: 'the range it is handed still holds merge commits, which the listed form leaves out; tell the reader to pass --no-merges itself' },
  ...KNOWN_MEMORY_FILES.map(name => ({ file: 'prompts/commit-reader.md', literal: `\`${name}\``,
    why: 'the helper leaves the memory files out of the commits over code; name each one so the reader leaves it out too' })),
];

/**
 * The project glossary's file names. A brief that names one hands its субагент
 * the user's words directly, past `prior.md`, which every blind reader
 * withholds. The runtime's copy is `GLOSSARY_MAPS` and `GLOSSARY_FILES` in
 * `skills/maestro/tools/runtime/memory.mts`; a name added there and not here
 * is a door this check does not watch.
 */
export const PROJECT_GLOSSARY_FILES: readonly string[] = ['GLOSSARY-MAP.md', 'CONTEXT-MAP.md', 'GLOSSARY.md', 'CONTEXT.md'];

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
  { file: 'prompts/executor.md', literal: '`commit` is the HEAD you worked on, unchanged',
    why: 'an executor told never to commit cannot also be asked for the commit that holds its work' },
  { file: 'references/verification-procedures.md', literal: 'whose commit is not the base the таск was handed',
    why: 'the import runs before the orchestrator commits, so it can only hold a return to the base' },
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
  // A return is checked at intake (plan "A Return Is Checked At Intake", D2–D4):
  // the parser ran nowhere in a прогон, so a missing red run waited a phase for
  // the reviewer, and a refused return had no defined path back.
  { file: 'phases/5-build.md',
    literal: 'node .maestro/sync.mts --returns-check <return file> --root <its worktree, or the project root> --base <the commit the таск was handed>',
    why: 'build step 1 runs the shipped check before anything in a return is read' },
  { file: 'phases/5-build.md', literal: 'A resend is not a retry',
    why: 'a refused return goes back once to its author without spending a retry or opening a repair' },
  { file: 'phases/8-repair.md', literal: '--base <the parent commit>',
    why: 'a repair attempt is checked against the commit it started from' },
  { file: 'references/verification-procedures.md',
    literal: '`sync.mts --returns-check` is the mechanical half of this refusal',
    why: 'the prose refusal and the command must name each other, or one drifts' },
  { file: 'prompts/executor.md', literal: 'checked mechanically before anything in it is read',
    why: 'an executor that knows the block is checked writes it to pass the check, not the reader' },
  { file: 'prompts/reviewer.md', literal: 'the facts intake left `unchecked`',
    why: 'a fact git could not decide at intake is decided against the diff, never dropped' },
  // A whole-project review (2026-10-14) found an implementation таск that owns no check always
  // refused as `no-block`, and its discoveries read before the check ran.
  { file: 'phases/5-build.md', literal: 'Add `--owns-no-check` when the verification map names no check this таск',
    why: 'an implementation таск whose checks another таск runs returns no block, and must not be refused for it' },
  { file: 'phases/5-build.md', literal: 'Only a return step 1 accepted is read for them',
    why: 'a refused return hands dependents no discovered interfaces' },
  { file: 'prompts/executor.md', literal: 'no check — another таск executes every check it serves — returns no block',
    why: 'the executor that owns no check knows an empty return is the right one' },
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
  // A требование only the target can prove gets a check written to run there
  // (plan "A Return Is Checked At Intake", D7): an outside report found a
  // missed dependency only on the server, after every local check had passed.
  { file: 'phases/4-plan.md', literal: 'A check only the target environment can run is written to run there',
    why: 'a target-only требование without a runnable check is handed over as a sentence, not a command' },
  { file: 'phases/3-spec.md', literal: 'an observation only the target environment can make is named as such',
    why: 'the plan cuts a target check only for an observation the spec named as target-only' },
  { file: 'prompts/executor.md', literal: 'A check written to run on the target',
    why: 'the executor returns a target check unavailable with the command to run, never as a local pass' },
  { file: 'prompts/task-reader.md', literal: 'A target check with nothing to run',
    why: 'the task reader is where a target check with no command is still free to fix' },
  // S3 makes a требование `placeholder`, and a whole-project review (2026-10-14)
  // found G2 and G3 accepting only `in-spec`: the прогон stopped at G2 or the
  // таск that built it was refused as unasked-for work.
  { file: 'phases/3-spec.md', literal: 'Every live требование is `in-spec`, `placeholder`, `deferred` or `dropped`',
    why: 'a placeholder требование is built around its gap, so G2 settles it with the missing fact as its reason' },
  { file: 'phases/4-plan.md', literal: 'every `in-spec` or `placeholder` требование maps to at least one таск',
    why: 'G3 holds a placeholder требование to the same map as an in-spec one' },
  { file: 'SKILL.md', literal: 'Every in-spec or placeholder требование maps to at least one таск',
    why: 'the resident gate table agrees with the gate scripts' },
];

/**
 * The literal text that carries «review sees what nobody asked for».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The reviewer tags
 * behaviour nobody asked for as an `unrequested` observation and is never told
 * the depth; the review phase disposes of it under `strict`, looks for debug
 * output a repair left behind, and runs one standards pass per прогон; the
 * executor tags and removes its diagnostics; the standards reader labels a smell
 * a judgement; the отчёт and the memory phase each read their share of the
 * standards pass. Whether a reviewer recognises unrequested behaviour, whether a
 * promotion under `strict` was right, and whether a smell judgement is fair are
 * the readers' and the orchestrator's judgement, so no anchor stands for them.
 * The reviewer also checks five risk categories from the diff, blocking only on
 * a concrete counterexample. Whether a category applies and whether a
 * counterexample is real are the reviewer's judgement, so the anchors hold the
 * rule, the one exception for absence and the tag, never the verdict.
 * The debug-tag condition itself is also held executably, by
 * `scripts/gates/debug-tags.ts`. The places the standards reader's documents
 * are gathered from are held by `npm run readers`, which reads the spec as
 * well; only the sentence that filters what the search finds is held here.
 */
export const REVIEW_ANCHORS: readonly Anchor[] = [
  { file: 'prompts/reviewer.md', literal: 'tagged `unrequested`, and never blocking',
    why: 'a reviewer that blocks on extra behaviour is weighing a depth it was never told' },
  { file: 'prompts/reviewer.md', literal: '`unrequested` is a tag on an observation, not a third kind',
    why: 'a third kind of finding is the middle grade the two kinds exist to refuse' },
  { file: 'prompts/reviewer.md', literal: 'marked `observation · unrequested`',
    why: 'the отчёт and the strict disposition find these observations by their tag' },
  { file: 'phases/6-review.md',
    literal: 'that no later commit of the same таск removes is a blocking finding of your own',
    why: 'debug output a repair left behind otherwise ships in the build' },
  { file: 'phases/6-review.md', literal: 'It names the tag id and the path, never the line',
    why: 'a tagged line is debug output, and a value that must not travel sits in it' },
  { file: 'phases/6-review.md', literal: 'Under `strict`, you dispose of each `unrequested` observation',
    why: 'nothing else checks the strict promise after the spec' },
  { file: 'phases/6-review.md', literal: 'Depth changes one disposition, never the measurement',
    why: 'a review whose measurement moved with the depth would judge a таск by words it never had' },
  { file: 'phases/6-review.md', literal: 'One standards pass',
    why: 'duplication across таски is invisible to every per-таск review' },
  { file: 'phases/6-review.md', literal: 'is read only if it describes how code is written',
    why: 'a search that hands over every file it matches makes a brand guide a coding standard' },
  { file: 'phases/6-review.md', literal: 'finds it and does not run the pass again',
    why: 'a standards axis does not converge, so a repeated pass loops' },
  { file: 'phases/7-acceptance.md', literal: 'the standards pass\'s observations from `reviews/standards.md`',
    why: 'observations nobody carries into the отчёт are never read' },
  { file: 'phases/9-memory.md', literal: 'the seam-level items of `reviews/standards.md`',
    why: 'a seam-level smell is a fact about the project the next session would rediscover' },
  { file: 'prompts/executor.md', literal: 'carries `[maestro-debug:<DF-id>]` on the same line',
    why: 'an untagged diagnostic cannot be told from code the таск meant to ship' },
  { file: 'prompts/executor.md', literal: 'Remove every tagged line before you return',
    why: 'a tag is a promise to remove the line, and the review phase checks it' },
  { file: 'prompts/acceptance-reader.md', literal: 'Extra is the per-таск review\'s question',
    why: 'a question pointed «somewhere else» is a question nobody owns' },
  { file: 'prompts/standards-reader.md', literal: 'labelled `judgement: <smell>`',
    why: 'an unlabelled smell reads as the project\'s own standard' },
  { file: 'prompts/standards-reader.md', literal: 'never a violation',
    why: 'a smell called a violation turns a judgement into a blocking finding' },
  { file: 'prompts/standards-reader.md', literal: '`scope: seam`',
    why: 'the memory phase reads only the seam-level items' },
  { file: 'prompts/reviewer.md', literal: 'the one place an absence is a finding',
    why: 'without it a missing permission check reads as something the task file never asked for' },
  { file: 'prompts/reviewer.md', literal: 'a concrete counterexample',
    why: 'a risk blocked on suspicion is the middle grade again, and a counterexample is what repair can test' },
  { file: 'prompts/reviewer.md', literal: 'marked `blocking · risk:<category>`',
    why: 'the review file and the отчёт find risk findings by their tag' },
  { file: 'phases/6-review.md', literal: 'A `risk:` finding is written with its tag',
    why: 'a risk finding rewritten without its tag is lost to the отчёт' },
];

/**
 * The literal text that carries «repair diagnoses by competing hypotheses».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The diagnostician ranks
 * three to five hypotheses, each with what falsifies it, runs the cheapest probe
 * first, minimises the reproduction, changes one variable, and names a seam or
 * `noCorrectSeam:`; the repair phase sends a diagnosis that breaks this back
 * once; the executor runs a probe that needs a change before any change; the
 * отчёт and the memory phase each carry the `noCorrectSeam:` lines, and never
 * the hypotheses. Whether a probe is the cheapest, a reproduction minimal, one
 * variable changed or a baseline measured, and whether a `noCorrectSeam` reason
 * is true, are the diagnostician's and the executor's judgement, so no anchor
 * stands for them. The diagnosis text's shape is also held executably, by the
 * closure rules in `tools/runtime/state/closure.mts`.
 */
export const DIAGNOSIS_ANCHORS: readonly Anchor[] = [
  { file: 'prompts/repair-diagnostician.md', literal: 'List three to five ranked hypotheses for the failure, most likely first',
    why: 'a repeat built on the one cause the diagnostician thought of first is the guess this brief exists to stop' },
  { file: 'prompts/repair-diagnostician.md', literal: 'Each names the observation that would falsify it',
    why: 'a hypothesis nothing could falsify cannot be told apart from the others' },
  { file: 'prompts/repair-diagnostician.md', literal: 'Name the cheapest probe that tells them apart, and run it first',
    why: 'a repair chosen before the probe acts on the ranking instead of the evidence' },
  { file: 'prompts/repair-diagnostician.md', literal: 'Minimise the reproduction until every element in it is needed',
    why: 'an element the failure does not need hides which change fixed it' },
  { file: 'prompts/repair-diagnostician.md', literal: 'The next action changes one variable',
    why: 'two changes at once leave the passing one unattributed' },
  { file: 'prompts/repair-diagnostician.md', literal: 'write `noCorrectSeam:` and why',
    why: 'a missing seam left unsaid becomes an invented seam or a silent gap' },
  { file: 'prompts/repair-diagnostician.md', literal: 'Hypotheses go into `diagnosis` and to the next executor, never to the user',
    why: 'unconfirmed causes read to the user as things wrong with their project' },
  { file: 'phases/8-repair.md', literal: 'A diagnosis that breaks the brief\'s text is sent back once',
    why: 'a single-hypothesis diagnosis acted on spends the root\'s last attempt on a guess' },
  { file: 'phases/8-repair.md', literal: 'A send-back spends no repair attempt',
    why: 'charging the budget for the diagnostician\'s form would punish the repair for it' },
  { file: 'phases/8-repair.md', literal: 'Hypotheses never reach the user',
    why: 'the orchestrator is the one who talks to the user, so the rule has to be in its phase' },
  { file: 'prompts/executor.md', literal: 'When the brief\'s probe runs first, run it before any change',
    why: 'a repair made on a falsified hypothesis ships a change nobody can explain' },
  { file: 'prompts/executor.md', literal: 'Change one variable at a time',
    why: 'the executor is where the variables are actually changed' },
  { file: 'prompts/executor.md', literal: 'measure the baseline before any change',
    why: 'a performance repair with no baseline cannot be told from noise' },
  { file: 'phases/7-acceptance.md',
    literal: 'each `noCorrectSeam:` line of a repeated repair\'s diagnosis, as a defect repaired without a regression check',
    why: 'a repair with no regression check is something the user builds on without knowing' },
  { file: 'phases/7-acceptance.md', literal: 'the reason as written — never the hypotheses',
    why: 'the отчёт is the user\'s, and hypotheses stay with the прогон' },
  { file: 'phases/9-memory.md', literal: 'the `noCorrectSeam:` lines of repeated repairs\' diagnoses',
    why: 'a missing seam is a fact the next session would rediscover when it tests the same thing' },
  { file: 'phases/9-memory.md', literal: 'A `noCorrectSeam:` line passes the same test',
    why: 'without the entry test a limitation of this прогон fills the memory file' },
];

/**
 * The literal text that carries «the report hands over what only the user can
 * do».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The spec phase writes a
 * placeholder as a labelled line that keeps one question per missing fact; the
 * review phase records what is hard to undo from the per-commit diffs; preflight
 * seeds that record; the acceptance phase turns the placeholders into a
 * questionnaire with one question per idea, the most important first and a blank
 * for the answer, says "not recorded" rather than "nothing" when no scan ran, and
 * speaks the questionnaire in the прогон's language. The section list itself is
 * held by `report-sections.ts`, and the scan's mechanical half by
 * `scripts/gates/one-way.ts`. How two questions with the same number of
 * требования are ordered is the orchestrator's judgement, so no anchor stands
 * for it.
 */
export const REPORT_ANCHORS: readonly Anchor[] = [
  { file: 'phases/7-acceptance.md', literal: 'In the same closing candidate write `result`',
    why: 'a closed contract-10 run publishes only with the sentence saying what now exists, and the page prints it' },
  { file: 'phases/0-preflight.md', literal: 'drops `outcome`, `finishedAt` and `result`',
    why: 'a reopened run that kept its result would be refused as an active run with a closing sentence' },
  { file: 'phases/3-spec.md', literal: 'The `debt.placeholders` entry is one line with fixed labels',
    why: 'a bare placeholder line gives the questionnaire nothing to ask and no reason to give' },
  { file: 'phases/3-spec.md', literal: '`matters:` is what stays a placeholder until they do',
    why: 'a question with no stake in it is the one nobody forwards' },
  { file: 'phases/3-spec.md', literal: 'The same missing fact keeps the same `question:` text',
    why: 'two wordings of one fact become two questions to the same person' },
  { file: 'phases/0-preflight.md', literal: 'the review phase appends what is hard to undo',
    why: 'an unseeded record cannot tell "nothing found" from "never scanned"' },
  { file: 'phases/6-review.md', literal: 'Then record what is hard to undo',
    why: 'the отчёт reads one-way changes only from the state, so a scan nobody runs is a section that always says nothing' },
  { file: 'phases/6-review.md', literal: 'a `D` path that no run commit added',
    why: 'a file the прогон created and removed is not the user\'s, and listing it buries the ones that are' },
  { file: 'phases/6-review.md', literal: 'a review after a repair does not add a line that is already there',
    why: 'a re-review would otherwise report one deletion twice' },
  { file: 'phases/6-review.md', literal: 'This is a record, not a finding',
    why: 'a one-way change the user asked for is not a defect, and blocking on it would stall the review' },
  { file: 'phases/7-acceptance.md', literal: 'One question per idea',
    why: 'one fact asked three times reads as three facts to whoever has to answer' },
  { file: 'phases/7-acceptance.md', literal: 'Most important first',
    why: 'the reader may answer only the first few' },
  { file: 'phases/7-acceptance.md', literal: '`Answer: ______`',
    why: 'a questionnaire with nowhere to answer comes back as a conversation' },
  { file: 'phases/7-acceptance.md', literal: 'The block carries no `R##`, no path',
    why: 'the block is sent to somebody outside the прогон, who cannot read its ids' },
  { file: 'phases/7-acceptance.md', literal: 'Not recorded: this прогон began before the scan existed.',
    why: 'saying "nothing" when nobody looked is a claim nobody checked' },
  { file: 'phases/7-acceptance.md', literal: 'A check with neither an invocation nor a procedure says `no command recorded`',
    why: 'a command the прогон never ran, written into the отчёт, is a command nobody has seen work' },
  { file: 'phases/7-acceptance.md', literal: 'are Questions to forward, Hard to undo and Checks to run on the target',
    why: 'a list assembled again at the end differs from the state exactly on what was forgotten' },
  { file: 'phases/7-acceptance.md',
    literal: 'give them in the chat in the прогон\'s language, as one block the user can copy and send on as it is',
    why: 'the отчёт on disk is English, and the person who knows the answer may not read it' },
];

/** Repeated evidence reaches the exact producers and consumers that must retain it. */
export const INTERMITTENT_ANCHORS: readonly Anchor[] = [
  { file: 'phases/8-repair.md', literal: 'intermittent-repairs.md', why: 'observed intermittency must reach the bounded protocol' },
  { file: 'phases/5-build.md', literal: 'import every sample, including failures', why: 'intake cannot discard inconvenient samples' },
  { file: 'prompts/executor.md', literal: 'all five intermittent labels', why: 'sample attribution must survive the executor return' },
  { file: 'prompts/repair-diagnostician.md', literal: 'preserve the original alongside the minimized case', why: 'minimization must not replace the trigger' },
  { file: 'prompts/reviewer.md', literal: 'Both the original and minimized workload', why: 'review must cover both workload shapes' },
  { file: 'phases/7-acceptance.md', literal: 'partial/stale series stay incomplete', why: 'acceptance must report insufficient evidence' },
  ...['phases/6-review.md', 'prompts/reviewer.md'].flatMap(file => [
    { file, literal: '`verification.intermittentRepairs` entry', why: 'review needs the published criteria, not a producer summary' },
    { file, literal: 'observed executions and conditions captures', why: 'review needs the original trigger and replay conditions' },
    { file, literal: 'all baseline/candidate samples for both original and minimized scenarios', why: 'review must inspect complete evidence for both workloads' },
    { file, literal: 'even when their checks have different execution owners', why: 'task ownership must not truncate the repair evidence' },
  ]),
];

/** Conditional research and freshness anchors; semantic source judgement stays with the reader. */
export const RESEARCH_ANCHORS: readonly Anchor[] = [
  { file: 'phases/3-spec.md', literal: 'No material uncertainty means no artifact and no dispatch',
    why: 'ordinary changes must not acquire a research stage' },
  { file: 'phases/3-spec.md', literal: 'technical-research.md',
    why: 'material uncertainty must reach the bounded procedure' },
  { file: 'phases/4-plan.md', literal: 'Copy only relevant established facts',
    why: 'task contracts must not present unresolved evidence as established' },
  { file: 'phases/5-build.md', literal: 'A new unresolved record invalidates the old fact',
    why: 'dispatch must recheck changed assumptions' },
  { file: 'phases/8-repair.md', literal: 'A new unresolved record invalidates the old fact',
    why: 'repair must not reuse obsolete evidence' },
  { file: 'prompts/technical-researcher.md', literal: 'Inspect installed source/types first',
    why: 'research must establish the installed contract before reading newer documentation' },
  { file: 'prompts/technical-researcher.md', literal: 'mismatch requires two known different versions',
    why: 'unknown versions cannot be classified as a resolved mismatch' },
  { file: 'prompts/technical-researcher.md', literal: 'never more than eight source inspections and ten minutes',
    why: 'research is bounded even when access fails' },
];

/**
 * The literal text that carries «a project's OpenSpec requirements are read, and
 * a closed run exports what it verified».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. Briefing runs the
 * index and records the disposition on one line the closing publish reads for
 * authority; the existing-code reader turns the requirements into decision
 * rows; the spec cites the line for a departure. Whether a requirement is
 * relevant to a требование is reader judgement, so no anchor stands for it.
 * Who is handed `openspec/`, and who is denied it, is held by `npm run readers`.
 */
export const OPENSPEC_ANCHORS: readonly Anchor[] = [
  { file: 'phases/2-briefing.md', literal: 'node .maestro/sync.mts --openspec-index',
    why: 'the index is read by the helper, so briefing and the export compare the same names' },
  { file: 'phases/2-briefing.md', literal: 'OpenSpec: <capability> › <Requirement name> — keep | replace | remove | rename → <new name>',
    why: 'the line is the only authority the export accepts for changing approved behaviour' },
  { file: 'phases/2-briefing.md', literal: 'It is always the recommended option',
    why: 'keep is what full self-briefs, so no self-briefed fork changes approved behaviour' },
  { file: 'prompts/existing-code-reader.md', literal: 'OpenSpec requirements are decision records too',
    why: 'approved requirements reach the spec and the G2 architecture reader as current records' },
  { file: 'phases/3-spec.md', literal: 'cites the `OpenSpec:` line of its `answers.md` entry',
    why: 'a spec departure from an approved requirement has a user-answered source' },
];

/**
 * The literal text that carries «existing code is read once, before the spec».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. Preflight records
 * whether the project has code; the spec phase reads it once into
 * `codebase.md`; the plan names things after it; executors are handed it and
 * the task reader is not. The Terms header that gained *Name in code* is held in
 * `MEMORY_ANCHORS`, where the header already lived. Who is handed the file is
 * held by `npm run readers`, not here.
 *
 * The brief states a 300-line budget for `codebase.md`. Nothing at
 * `npm run check` can measure a прогон's artifact, so only the brief's sentence
 * is held, and the size of a real `codebase.md` is not checked anywhere.
 */
export const CODEBASE_ANCHORS: readonly Anchor[] = [
  { file: 'prompts/existing-code-reader.md', literal: '## Architectural decisions',
    why: 'the discovery output has one declared home' },
  { file: 'prompts/existing-code-reader.md', literal: 'Only read documented decision locations',
    why: 'discovery is bounded to project locations and affected areas' },
  { file: 'prompts/existing-code-reader.md', literal: 'Never infer acceptance from a filename',
    why: 'unknown status cannot silently become binding' },
  { file: 'prompts/existing-code-reader.md', literal: 'Never create or edit architectural decision records',
    why: 'discovery must remain read-only' },
  { file: 'phases/3-spec.md', literal: 'architectural decisions incomplete',
    why: 'a search limit must reach the recorded assumptions' },
  { file: 'phases/3-spec.md', literal: 'do not redispatch discovery',
    why: 'resuming a legacy snapshot must preserve the read-once boundary' },
  { file: 'phases/3-spec.md', literal: 'decision disposition:',
    why: 'a conflicting spec entry must expose its source and outcome' },
  { file: 'phases/3-spec.md', literal: 'No relevant records means no architecture-reader dispatch',
    why: 'ordinary local work must not pay for an extra reader' },
  { file: 'prompts/spec-architecture-reader.md', literal: 'A silent contradiction is a finding',
    why: 'G2 must expose silent reversal of a current decision' },
  { file: 'prompts/spec-architecture-reader.md', literal: 'Never treat an obsolete record as binding',
    why: 'historical decisions must not block a valid current request' },
  { file: 'phases/0-preflight.md', literal: '`existingCode`',
    why: 'preflight records the flag phase 3 decides on; without it no reader is ever dispatched' },
  { file: 'phases/3-spec.md', literal: '`.maestro/<dir>/codebase.md`',
    why: 'the output row: the file exists and the spec phase is its one writer' },
  { file: 'phases/3-spec.md', literal: 'existing code not read before the spec:',
    why: 'a failed read is a decision taken for the user, and it reaches the отчёт through debt.assumptions' },
  { file: 'phases/3-spec.md', literal: '`order`, not `zakaz`',
    why: 'identifiers that travel through the spec are English words, never transliterations' },
  { file: 'phases/4-plan.md', literal: 'buildable without `codebase.md`',
    why: 'the task reader is not handed it, so a task file must not depend on it' },
  { file: 'phases/5-build.md', literal: 'and, when the прогон has one, `codebase.md`',
    why: 'executors are handed what the repository already held, so they do not rediscover it' },
  { file: 'phases/8-repair.md', literal: 'and, when the прогон has one, `codebase.md`',
    why: 'a repair executor works in the same code as the build executor did' },
  { file: 'prompts/executor.md', literal: '`interfaces.md` wins over `codebase.md`',
    why: 'interfaces.md stays the authority on names; a disagreement is reported, never followed silently' },
  { file: 'prompts/executor.md', literal: '`order`, not `zakaz`',
    why: 'identifiers are English words, and in existing code the recorded convention wins' },
  { file: 'prompts/task-reader.md', literal: 'Name in code',
    why: 'a task file that names an existing thing differently is a finding' },
  { file: 'prompts/existing-code-reader.md', literal: '## Names the work will touch',
    why: 'the section the spec and the plan take names from' },
  { file: 'prompts/existing-code-reader.md', literal: 'never what to build',
    why: 'the reader reports what exists; a reader that designs is a second spec writer' },
];

/**
 * The literal text that carries «the прогон says when a newer Maestro is out».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The comparison lives in
 * the helper and is held by its tests; the version it reads is held equal to
 * `package.json` by the `version` check. What only prose can carry is that
 * preflight calls the helper at all, and that the announcement shows its line.
 */
export const UPDATE_ANCHORS: readonly Anchor[] = [
  { file: 'phases/0-preflight.md', literal: 'sync.mts --update-check',
    why: 'preflight is the one place the прогон asks; without the call nothing ever tells the user an update is out' },
  { file: 'phases/0-preflight.md', literal: '**Add the update line**',
    why: 'the helper composes the line, and the announcement is where the user reads it' },
];

/**
 * The literal text that carries «each субагент runs on its tier's model».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The plan marks each
 * таск and G3 holds the producer and skeleton rule mechanically; the phases
 * that dispatch pass the tier; preflight pins the models through the helper;
 * the reviewer judges risk whatever the mark says; the отчёт counts the tiers.
 * Which brief runs on which tier is held by `npm run readers`, and the token
 * rule by `npm run dials`, not here.
 */
export const MODEL_ANCHORS: readonly Anchor[] = [
  { file: 'phases/4-plan.md', literal: '| Seam | Producer task | Consumer tasks | Integration owner | Integration check |',
    why: 'G3 finds the producers by this exact header; a reworded one hides every producer' },
  { file: 'phases/4-plan.md', literal: '| Model | `strong` or `standard`',
    why: 'the task-file row G3 reads and the executor is dispatched by' },
  { file: 'phases/4-plan.md', literal: 'sole таск of wave 1',
    why: 'the skeleton rule is mechanical only while the skeleton has a definition a machine can apply' },
  { file: 'SKILL.md', literal: 'A judge never runs `standard`',
    why: 'the resident rule every dispatching phase applies; a gate rests on its judge being no weaker' },
  { file: 'phases/0-preflight.md', literal: '--config-models',
    why: 'the one helper-owned change to the user\'s config; a hand-merged edit is the ritual it removes' },
  { file: 'phases/3-spec.md', literal: 'on the `standard` model',
    why: 'the existing-code reader reads, it does not judge, and runs on the cheaper tier' },
  { file: 'phases/5-build.md', literal: 'Dispatch the executor on its таск\'s tier',
    why: 'the build is where the plan\'s mark is spent' },
  { file: 'phases/8-repair.md', literal: 'Every repair and retry executor runs `strong`',
    why: 'a таск that failed once is not handed back to the tier that failed it' },
  { file: 'phases/4-plan.md', literal: 'A contract-7 run writes no `model`',
    why: 'a reopened contract-7 run is refused every field from 8, so its таски carry no tier and run on the session\'s model' },
  { file: 'prompts/reviewer.md', literal: 'whatever the task file\'s `Model` row says',
    why: 'the plan picks who builds; the reviewer still judges risk from the diff, and neither relies on the other' },
  { file: 'phases/7-acceptance.md', literal: 'Models: N таски on strong (<name>), M on standard (<name>)',
    why: 'the отчёт\'s one line that says which model built what' },
];

/**
 * The literal text that carries «the reference reaches the executor first».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The plan writes each
 * таск's References row, G3 reads it by that row's label, and the executor and
 * the reviewer open what it names and nothing else; each half lives in a
 * different file, and a comparable that falls out of one reaches nobody. Which
 * reference a таск follows is the plan's judgement, so no anchor stands for it.
 */
export const REFERENCE_ANCHORS: readonly Anchor[] = [
  { file: 'phases/4-plan.md', literal: '| References | each `REF-*` id this таск follows',
    why: 'the task-file row G3 reads by its label, and the one way a comparable reaches the executor' },
  { file: 'phases/4-plan.md',
    literal: 'Every available `visual_reference` and `contextual_example` is cited by at least one таск, and G3 refuses a plan where one is not',
    why: 'a comparable nobody cites is a look no executor ever opens' },
  { file: 'phases/5-build.md', literal: '`reference.md` is never handed to an executor',
    why: 'the whole register handed over is every look at once, and the таск follows the wrong one' },
  { file: 'prompts/executor.md', literal: 'Never write, move, reformat or regenerate a reference',
    why: 'a reference is the user\'s, and an executor that rewrites it erases what G4 measures against' },
  { file: 'prompts/executor.md', literal: 'A `contextual_example` is inspiration, not a ruler',
    why: 'an example followed as a ruler overrides the task file it was meant to serve' },
  { file: 'prompts/reviewer.md', literal: 'A difference from a `contextual_example` is not a defect unless',
    why: 'a reviewer that measures against an example sends a таск to repair for a look nobody required' },
  { file: 'phases/2-briefing.md',
    literal: 'set its role to `other` and its `roleDescription` to `superseded by REF-n; was <its former role>`',
    why: 'a replaced look left as a visual reference is one G2 maps and G3 makes the plan cite, and the executor follows the look the user replaced' },
];

/**
 * The literal text that carries «the phases record what the retrospective
 * reads».
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. Preflight seeds
 * `signals`; build, review and acceptance each append the line for the
 * signal they used to be told only to "record" — a reader asking for an input it
 * is denied, a reviewer returning a patch, a таск writing outside its files. The
 * line's grammar is held by the state validator, and the kinds by
 * `state-matches-spec`. Whether an orchestrator notices a reader asking is its
 * judgement, so no anchor stands for it.
 */
export const SIGNAL_ANCHORS: readonly Anchor[] = [
  { file: 'phases/0-preflight.md', literal: '| `signals` | empty — build, review and acceptance append',
    why: 'an unseeded list cannot tell "nothing recorded" from "never recorded"' },
  { file: 'phases/5-build.md', literal: '`SIG-<n> withheld-request — spec.md — executor <taskId>` to `signals`',
    why: 'an executor asking for the spec is the plan\'s signal, and a signal with no field is never read' },
  { file: 'phases/6-review.md', literal: '`SIG-<n> out-of-zone-write — <path> — <taskId>',
    why: 'a write outside a таск\'s files lives otherwise only in a free-text finding' },
  { file: 'phases/6-review.md', literal: '`SIG-<n> withheld-request — spec.md — reviewer <taskId>` to `signals`',
    why: 'a reviewer asking for the spec says the task file did not carry what it needed' },
  { file: 'phases/6-review.md',
    literal: '`SIG-<n> brief-exceeded — patch instead of finding — reviewer <taskId>` to `signals`',
    why: 'a reviewer returning code is a brief that did not hold' },
  { file: 'phases/7-acceptance.md',
    literal: '`SIG-<n> withheld-request — <spec.md or brief.md> — acceptance-reader G4` to `signals`',
    why: 'the blind reader asking for what it is denied is the gate\'s own signal' },
];

/**
 * The literal text that carries what a прогон does when it stops, or meets a
 * capability it lacks, where the promise and the doing sit in different files.
 *
 * Matched literally for the reason `MEMORY_ANCHORS` is. The state contract
 * says a stop that is not a question writes `interruptedAt`; the build phase
 * promises that review reads the working tree where there is no version
 * control; the safety table says an irreversible or outward-facing action is a
 * question. Each was stated in one file and done in none, and each failure is
 * silent: a stopped прогон that looks frozen, a review that stops on its first
 * таск, an executor that publishes because nobody told it S4. Whether a given
 * action is outward-facing is the executor's judgement, so no anchor stands for it.
 */
export const STOP_ANCHORS: readonly Anchor[] = [
  { file: 'SKILL.md', literal: 'writes `interruptedAt`',
    why: 'a stop that writes neither `awaiting` nor `interruptedAt` shows the user a frozen прогон and raises the silence alarm' },
  { file: 'phases/8-repair.md', literal: 'writes `interruptedAt`',
    why: 'the repair stops are the ones a прогон most often ends on' },
  { file: 'phases/6-review.md', literal: '<!-- maestro:degrades:version-control -->',
    why: 'the build promises review will read the working tree; without the branch review stops on the first таск' },
  { file: 'prompts/executor.md', literal: 'Do no irreversible or outward-facing action',
    why: 'S4 binds the orchestrator, and the executor doing real integration work is the one holding the shell' },
  // Each stop on a question names its kind where it is taken, so the page can
  // say what the прогон waits for; a stop that lost its kind reads as a plain answer.
  { file: 'SKILL.md', literal: '`one-way-action`',
    why: 'an S4 action is asked from any phase, so only the resident file can name its kind' },
  { file: 'phases/2-briefing.md', literal: '`briefing-round`',
    why: 'the брифинг block is the stop the page would otherwise call a plain answer' },
  { file: 'phases/3-spec.md', literal: '`spec-gate`',
    why: 'a manual прогон waits on the spec, and the page names what it waits for only from this kind' },
  { file: 'phases/4-plan.md', literal: '`plan-gate`',
    why: 'a manual прогон waits on the plan, and the page names what it waits for only from this kind' },
  { file: 'phases/8-repair.md', literal: '`repair-limit`',
    why: 'a spent repair budget is the one repair stop that asks, and the user must see it is a decision, not a reply' },
];

/**
 * The literal text that says a стадия transition in the chat.
 *
 * An outside report (2026-10-13) found the user not told quickly enough where
 * the work stood. The state is written at transitions, and the page shows it,
 * but nothing required a word in the chat, and on a host where the page is not
 * in view the user saw nothing between questions. One line per transition is a
 * status, not the textual stand-in for the dashboard that preflight forbids.
 * Matched literally for the reason `MEMORY_ANCHORS` is.
 */
export const PROGRESS_LINE_ANCHORS: readonly Anchor[] = [
  { file: 'SKILL.md', literal: 'Say one line of it in the chat at every стадия transition and when a wave closes',
    why: 'a прогон quiet between questions looks the same as one that is stuck, wherever the page is not in view' },
];

/**
 * The literal text that tells a small манифест what a прогон costs.
 *
 * An outside report (2026-10-13) found the прогон disproportionate for a small
 * change, and nothing the orchestrator reads compared the size of the бриф
 * with that cost: the README said a small fix needs no прогон, and no running
 * прогон ever read the README. The manifest phase now counts the требования and
 * says so once, at the cheapest moment, and the user decides. Matched literally
 * for the reason `MEMORY_ANCHORS` is; the threshold is in the literal, so a
 * changed number is a changed rule and fails here until the spec agrees.
 */
export const SIZE_ANCHORS: readonly Anchor[] = [
  { file: 'phases/1-manifest.md', literal: '2 or fewer требования',
    why: 'the size notice is said at the манифест, before the прогон has spent anything' },
  { file: 'phases/1-manifest.md', literal: 'The прогон never stops itself on size',
    why: 'the notice offers a stop; it never takes one, because the user started the прогон' },
  // A closed contract-10 state without `result` is refused at publish; the
  // stop first listed its closing fields without it.
  { file: 'phases/1-manifest.md', literal: '`finishedAt`, `result` — one line',
    why: 'the stop at the манифест is a closure, and a closure publishes only with its result line' },
  { file: 'phases/8-repair.md', literal: 'closure as stopped_incomplete, written as the acceptance phase writes its closing candidate',
    why: 'a repair that stops closes with the same fields, `result` included, or the publish is refused' },
];

/**
 * The literal text that makes a прогон's commits traceable from the history.
 *
 * Each таск and repair commit carries `Maestro-Run:` and `Requirements:`
 * trailers, and the memory run ends every closure with a commit whose subject
 * preflight greps for when a rebase has rewritten the commit the progress
 * file's header names. Nothing reads a trailer mechanically, so a phase that
 * loses one fails silently: the commits are made, and a later session cannot
 * tie them to a требование. The closing subject comes from `history.mts`, so
 * the phase file and the grep cannot spell it two ways.
 */
export const TRACE_ANCHORS: readonly Anchor[] = [
  { file: 'phases/5-build.md', literal: 'Maestro-Run: <dir without --wip>',
    why: 'таск numbers restart every прогон; without the run trailer a commit cannot be tied back to its run' },
  { file: 'phases/5-build.md', literal: 'Requirements: R01, R02',
    why: 'the requirement trailer is how a later session finds every change one требование caused' },
  { file: 'phases/8-repair.md', literal: 'Maestro-Run:',
    why: 'a repair commit without the run trailer drops out of the slice by requirement' },
  { file: 'phases/8-repair.md', literal: 'Requirements:',
    why: 'a repair commit without the requirement trailer drops out of the slice by requirement' },
  { file: 'phases/9-memory.md', literal: closingSubject('<dir>'),
    why: 'preflight finds the last closure by this exact subject when a rebase rewrote the commit the progress file names' },
  { file: 'phases/9-memory.md', literal: 'Maestro-Run: <dir>',
    why: 'the closing commit is a прогон commit like any other, and carries the run trailer' },
  { file: 'phases/9-memory.md', literal: '-- .maestro <memory file>',
    why: 'the closing commit takes .maestro/ and the memory file only; without the pathspec it takes whatever the user staged' },
  { file: 'phases/0-preflight.md', literal: 'closing-commit',
    why: 'preflight has to know the read can start from the closing commit, or it reads a rebased history by date' },
  { file: 'SKILL.md', literal: 'once after every closure',
    why: 'a closure on the repair path runs the memory phase too, or it never makes its closing commit' },
];

/**
 * The literal text that makes a resumed прогон check its commits are still there.
 *
 * A reset, a rebase or a checkout between sessions takes a таск's commit off
 * `HEAD`'s history, and nothing in the state says so: `tasks[].commits` still
 * names it. Only `sync.mts --commits-check` asks git, and only the prose calls
 * it, so a phase that loses the call or the reference fails silently — the
 * прогон resumes and reviews code that is not there.
 */
export const RESUME_ANCHORS: readonly Anchor[] = [
  { file: 'SKILL.md', literal: '--commits-check',
    why: 'a resumed прогон that never runs the check builds on a commit HEAD no longer holds' },
  { file: 'SKILL.md', literal: 'references/lost-commits.md',
    why: 'a lost commit with no reference opened is reset by guesswork, or not at all' },
  { file: 'references/lost-commits.md', literal: 'lostCommits',
    why: 'a reset that drops the lost sha instead of moving it is refused by the publish, and the прогон stalls' },
  { file: 'references/lost-commits.md', literal: '## Lost Commit',
    why: 'the relaunched executor tells a lost-commit handoff from a record of finished work by this heading' },
  { file: 'references/lost-commits.md', literal: 'awaiting.kind: "answer"',
    why: 'a checkout answered by rebuilding the таски here duplicates work that is one branch switch away' },
  { file: 'references/lost-commits.md', literal: 'onBranch',
    why: 'without the branch the check named, a checkout cannot be told apart from a reset' },
  { file: 'prompts/executor.md', literal: '## Lost Commit',
    why: 'an executor that reads a lost-commit handoff as finished work skips what the zone no longer holds' },
  { file: 'phases/0-preflight.md', literal: '--commits-check',
    why: 'a reopened run trusts the commits it recorded when it closed, and the history may have moved since' },
];

/**
 * How many rounds a gate that sends its phase back may run before the прогон
 * stops and asks the user, held to one number in every file that states it.
 *
 * The other stop counts only the same finding failing three times. A прогон
 * whose plan gate found something new in each of sixty rounds never met it and
 * ran twelve hours, because each fix gave a fresh reader new text to question.
 * The budget counts rounds, whatever they found.
 */
export const GATE_ROUND_BUDGET = 60;

/** The phrase every gate's own phase file and `SKILL.md` carry for the budget. */
export const GATE_ROUND_PHRASE = `at most ${GATE_ROUND_BUDGET} rounds`;

/**
 * The files that state the round budget: the resident rule, and the phase each
 * of G1–G3 sends back. G4 sends no phase back, so it has no budget of rounds.
 */
export const ROUND_ANCHORS: readonly Anchor[] = [
  { file: 'SKILL.md', literal: GATE_ROUND_PHRASE,
    why: 'the resident gate rule is the one a прогон re-reads after a compaction, and without the budget a gate that finds something new each round never stops' },
  { file: 'phases/2-briefing.md', literal: GATE_ROUND_PHRASE,
    why: 'G1 sends брифинг back, and its round budget is applied where the phase reruns' },
  { file: 'phases/3-spec.md', literal: GATE_ROUND_PHRASE,
    why: 'G2 sends the spec back, and its round budget is applied where the phase reruns' },
  { file: 'phases/4-plan.md', literal: GATE_ROUND_PHRASE,
    why: 'G3 sends the plan back, and a plan gate is where sixty rounds once ran without a stop' },
];

/**
 * The literal text that makes a G3 reader an enumeration rather than a sample.
 *
 * The helper numbers units, renders shared facts and checks each return's
 * coverage, but only the plan phase calls it and only the briefs ask for one
 * verdict line per unit. A phase that loses a call, or a brief that loses its
 * verdict format, fails silently: readers go back to returning what they
 * happened to notice, and G3 goes back to finding something new every round.
 */
export const PLAN_UNIT_ANCHORS: readonly Anchor[] = [
  { file: 'phases/4-plan.md', literal: '--plan-units',
    why: 'without it no round knows which units changed, and every round re-reads every unit' },
  { file: 'phases/4-plan.md', literal: '--plan-render',
    why: 'a fact edited in shared.md and never rendered leaves every citing task file on the old text' },
  { file: 'phases/4-plan.md', literal: '--plan-coverage',
    why: 'a return nobody checks for coverage is a sample again' },
  { file: 'phases/4-plan.md', literal: 'shared.md',
    why: 'a fact two таски need, restated in each, is how three task files came to say three things about one row' },
  { file: 'phases/4-plan.md', literal: FACTS_START,
    why: 'the marker is how the helper finds the section it owns; a phase naming another marker sends the orchestrator to edit by hand' },
  { file: 'phases/4-plan.md', literal: 'never append',
    why: 'a fix appended beside the text it corrects is the contradiction the next reader finds' },
  { file: 'phases/8-repair.md', literal: '--plan-coverage consistency <return file> --all',
    why: 'repair re-reads a plan whose units did not move since the last round; without --all the check asks about nothing and refuses every return' },
  { file: 'prompts/task-reader.md', literal: 'one verdict line per unit',
    why: 'a reader not asked for a verdict per unit reports what it noticed, and the coverage check has nothing to count' },
  { file: 'prompts/plan-consistency-reader.md', literal: 'One verdict line per таск and per seam',
    why: 'the consistency reader is held to every таск and seam only if it writes a line for each' },
];

/**
 * Names of what contract 8 retired, held out of every shipped file.
 *
 * A dead Markdown link to a deleted phase is already the link pass's finding;
 * a prose mention is not, and it is how a retired mode lives on — a phase that
 * still says "after доводка" sends a model looking for a phase that is gone.
 * Matched case-insensitively on the stem, so every inflection is caught. The
 * bare word `polish` is not on the list: the runtime must still name the
 * contract-7 field it refuses from 8.
 */
export const RETIRED_NAMES: readonly RegExp[] = [/7-polish/i, /polish-reader/i, /доводк/i];

const RETIRED_MESSAGE = 'доводка was retired in contract 8 — remove this mention; a comparable now reaches the executor through the task file\'s References row';

/** Every line of every shipped file under `bundleDir` that names a retired thing. */
export async function checkRetiredNames(bundleDir: string): Promise<Violation[]> {
  const files: string[] = [];
  const walk = async (relative: string): Promise<void> => {
    const entries = await readdir(path.join(bundleDir, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) files.push(child);
    }
  };
  await walk('');
  const found: Violation[] = [];
  for (const file of files) {
    const lines = (await readFile(path.join(bundleDir, file), 'utf8')).split('\n');
    let hits = 0;
    lines.forEach((text, index) => {
      if (!RETIRED_NAMES.some(name => name.test(text))) return;
      hits += 1;
      found.push({ check: 'retired', file, line: index + 1, message: RETIRED_MESSAGE });
    });
    log.debug('retired', 'file scanned', { file, hits });
  }
  log.info('retired', 'retired names scanned', { files: files.length, hits: found.length });
  return found;
}

/** A phase file's hand-off to the next phase, which must be the last thing read in it. */
const HANDOFF_LINE = /^Then read the .+ phase file\.\s*$/;

/**
 * Text after a phase file's hand-off line, as violations under `handoff`.
 *
 * A phase file is read top to bottom, and the hand-off sends the reader to the
 * next file. A section placed after it is read only by an executor that ignores
 * the instruction it just followed, so it is skipped by exactly the one that obeys.
 */
export function textAfterHandoff(file: string, body: string): Violation[] {
  const lines = body.split(/\r?\n/);
  let handoff = -1;
  lines.forEach((line, index) => { if (HANDOFF_LINE.test(line)) handoff = index; });
  if (handoff < 0) return [];
  const after = lines.findIndex((line, index) => index > handoff && line.trim() !== '');
  if (after < 0) return [];
  return [{ check: 'handoff', file, line: after + 1,
    message: `text follows the hand-off on line ${handoff + 1} — an executor that obeys "${lines[handoff]!.trim()}" never reads it; move it above the hand-off, into the step that runs it` }];
}

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
  /** `package.json`'s version; absent, a versioned bundle is checked for carrying one at all. */
  packageVersion?: string,
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

  // --- the version the прогон compares against the published one -----------
  if (profile.versioned) {
    const before = violations.length;
    const skillVersion = metadataVersion(skill);
    log.debug('version', 'version read', { skillVersion, packageVersion: packageVersion ?? null });
    if (skillVersion === null) {
      add('version', 'SKILL.md', 1,
        'SKILL.md frontmatter has no metadata.version; add it equal to package.json\'s version — the helper reads it to tell the user a newer Maestro is out');
    } else if (packageVersion !== undefined && skillVersion !== packageVersion) {
      add('version', 'SKILL.md', 1,
        `metadata.version is ${skillVersion} and package.json says ${packageVersion}; bump both in the same commit — there is no release script`);
    }
    log.info('version', 'version checked', { violations: violations.length - before });
  }

  // --- the resident budget --------------------------------------------------
  if (profile.resident) {
    const before = violations.length;
    const { skillLines: lineCeiling, descriptionChars: descriptionCeiling } = profile.resident;
    const lines = lineCount(skill);
    const description = frontmatter.keys.get('description');
    const descriptionChars = description === undefined ? undefined : [...description].length;
    log.debug('resident', 'resident budget read', { lines, lineCeiling, descriptionChars, descriptionCeiling });

    if (lines > lineCeiling) {
      add('resident', 'SKILL.md', 0,
        `SKILL.md has ${lines} lines, over the ceiling of ${lineCeiling}; delete a sentence that does not change the прогон's behaviour, or move its reasoning to docs/spec/ — raising the ceiling is not the fix`);
    } else if (lines < lineCeiling) {
      add('resident', 'SKILL.md', 0,
        `SKILL.md has ${lines} lines and its ceiling is ${lineCeiling}; lower resident.skillLines in scripts/validate/bundle-integrity.ts to ${lines} — it only goes down`);
    }

    // A missing description is already a frontmatter finding; it is not also a budget one.
    if (descriptionChars !== undefined && descriptionChars > descriptionCeiling) {
      add('resident', 'SKILL.md', 1,
        `description has ${descriptionChars} characters, over the ceiling of ${descriptionCeiling}; it is resident on every turn of every session, so it carries trigger conditions only — raising the ceiling is not the fix`);
    } else if (descriptionChars !== undefined && descriptionChars < descriptionCeiling) {
      add('resident', 'SKILL.md', 1,
        `description has ${descriptionChars} characters and its ceiling is ${descriptionCeiling}; lower resident.descriptionChars in scripts/validate/bundle-integrity.ts to ${descriptionChars} — it only goes down`);
    }
    log.info('resident', 'resident budget checked', { violations: violations.length - before });
  }

  // --- who starts the skill -------------------------------------------------
  if (profile.invocation === 'explicit-only') {
    const before = violations.length;
    const claude = frontmatter.keys.get('disable-model-invocation') ?? null;
    let policy: string | null = null;
    try {
      policy = await readFile(path.join(bundleDir, CODEX_POLICY_FILE), 'utf8');
    } catch {
      // Absent or unreadable is the finding below, not exit 2: a missing file is
      // exactly what this check exists to report.
    }
    // Read by line rather than parsed, like the frontmatter: the policy is one
    // scalar under one key, and a YAML parser would be this repository's first
    // dependency. The flag counts only inside the top-level `policy:` block.
    const policyLines = policy?.split('\n') ?? [];
    const policyStart = policyLines.findIndex(line => /^policy:\s*$/.test(line));
    let flagLine = 0;
    let codex: string | null = null;
    for (let i = policyStart + 1; policyStart >= 0 && i < policyLines.length; i += 1) {
      const line = policyLines[i] ?? '';
      if (/^\S/.test(line)) break;
      const match = /^\s+allow_implicit_invocation:\s*(\S*)\s*$/.exec(line);
      if (match) {
        flagLine = i + 1;
        codex = match[1] ?? '';
        break;
      }
    }
    log.debug('invocation', 'invocation policy read', { claude, codex });

    if (claude !== 'true') {
      add('invocation', 'SKILL.md', 1,
        'the skill is started by the user only: set disable-model-invocation: true, and keep agents/openai.yaml saying the same to Codex');
    }
    if (codex !== 'false') {
      add('invocation', CODEX_POLICY_FILE, flagLine,
        'Codex needs agents/openai.yaml with policy.allow_implicit_invocation: false, or it starts the skill on its own');
    }
    log.info('invocation', 'invocation policy checked', { violations: violations.length - before });
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
      // The progress file is earlier runs' open work: it reaches a run only
      // through prior.md, so a brief that names it hands it on past the rule above.
      if (outside.includes(PROGRESS_FILE)) {
        add('memory', file, 0,
          `brief mentions ${PROGRESS_FILE} outside "## ${NOT_GIVEN_HEADING}" — the work earlier runs left open `
          + `reaches a run only through ${PRIOR_MEMORY_FILE}, which no субагент is handed; only withhold it`);
      }
      const named = PROJECT_GLOSSARY_FILES.filter(name => new RegExp(`(?<![\\w-])${name.replace('.', '\\.')}`).test(outside));
      if (named.length > 0) {
        add('memory', file, 0,
          `brief names ${named.join(', ')} outside "## ${NOT_GIVEN_HEADING}" — the project glossary reaches a `
          + `run only through ${PRIOR_MEMORY_FILE}, which no субагент is handed; its terms reach executors through `
          + 'the Terms table of interfaces.md');
      }
    }
    log.info('memory', 'memory read path checked', { anchors: MEMORY_ANCHORS.length });
  }

  // --- the user's file of words is called the project glossary -------------
  // Every profile: Scout borrows Maestro's words, and a bare «glossary» there
  // would blur the same three things. References are read for it alone, as the
  // link pass never opens them.
  const naming = [...documents];
  for (const directory of profile.other) {
    for (const file of await listMarkdown(bundleDir, directory)) {
      naming.push({ file, body: await readFile(path.join(bundleDir, file), 'utf8') });
    }
  }
  let namingHits = 0;
  for (const { file, body } of naming) {
    for (const line of bareGlossaryLines(body)) {
      namingHits += 1;
      add('naming', file, line, GLOSSARY_NAMING_MESSAGE);
    }
  }
  log.info('naming', 'bundle scanned for a bare glossary', { files: naming.length, hits: namingHits });

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

  // --- review sees what nobody asked for --------------------------------------
  // Only a bundle with a review phase reviews таски; Scout has none.
  if (byFile.has('phases/6-review.md')) {
    for (const v of missingAnchors(byFile, REVIEW_ANCHORS, 'review')) add(v.check, v.file, v.line, v.message);
  }

  // --- repair diagnoses by competing hypotheses -------------------------------
  // Only a bundle with a repair phase diagnoses a repeat; Scout has none.
  if (byFile.has('phases/8-repair.md')) {
    for (const v of missingAnchors(byFile, DIAGNOSIS_ANCHORS, 'diagnosis')) add(v.check, v.file, v.line, v.message);
  }

  // --- the phases record what the retrospective reads -------------------------
  // Only a bundle with a review phase records signals; Scout has none.
  if (byFile.has('phases/6-review.md')) {
    for (const v of missingAnchors(byFile, SIGNAL_ANCHORS, 'signals')) add(v.check, v.file, v.line, v.message);
  }

  // --- existing code is read once, before the spec ----------------------------
  // Only a bundle with a spec phase reads the existing code; Scout has none.
  if (byFile.has('phases/3-spec.md')) {
    for (const v of missingAnchors(byFile, INTERMITTENT_ANCHORS, 'intermittent')) add(v.check, v.file, v.line, v.message);
    for (const v of missingAnchors(byFile, RESEARCH_ANCHORS, 'research')) add(v.check, v.file, v.line, v.message);
    for (const v of missingAnchors(byFile, CODEBASE_ANCHORS, 'codebase')) add(v.check, v.file, v.line, v.message);
    for (const v of missingAnchors(byFile, OPENSPEC_ANCHORS, 'openspec')) add(v.check, v.file, v.line, v.message);
  }

  // --- the прогон says when a newer Maestro is out ----------------------------
  // Only a versioned bundle has a version to compare; Scout has none.
  if (profile.versioned && byFile.has('phases/0-preflight.md')) {
    for (const v of missingAnchors(byFile, UPDATE_ANCHORS, 'update')) add(v.check, v.file, v.line, v.message);
  }

  // --- each субагент runs on its tier's model ---------------------------------
  // Only a bundle with a plan phase marks tiers; Scout has none.
  if (byFile.has('phases/4-plan.md')) {
    for (const v of missingAnchors(byFile, MODEL_ANCHORS, 'models')) add(v.check, v.file, v.line, v.message);
  }

  // --- the reference reaches the executor first --------------------------------
  // Only a bundle with a plan phase writes task files; Scout has none.
  if (byFile.has('phases/4-plan.md')) {
    for (const v of missingAnchors(byFile, REFERENCE_ANCHORS, 'references')) add(v.check, v.file, v.line, v.message);
  }

  // --- the отчёт hands over what only the user can do -------------------------
  // Only a bundle with an acceptance phase writes an отчёт; Scout has none.
  if (byFile.has('phases/7-acceptance.md')) {
    for (const v of missingAnchors(byFile, REPORT_ANCHORS, 'report')) add(v.check, v.file, v.line, v.message);
  }

  // --- a stop says it stopped, and a missing capability has a path ------------
  // Only a bundle with an executor brief builds and stops; Scout has none.
  if (byFile.has('prompts/executor.md')) {
    for (const v of missingAnchors(byFile, STOP_ANCHORS, 'stops')) add(v.check, v.file, v.line, v.message);
  }

  // --- a стадия transition is said in the chat ---------------------------------
  // Only a bundle with a build phase has стадии long enough to report; Scout has none.
  if (byFile.has('SKILL.md') && byFile.has('phases/5-build.md')) {
    for (const v of missingAnchors(byFile, PROGRESS_LINE_ANCHORS, 'progress-line')) add(v.check, v.file, v.line, v.message);
  }

  // --- a small манифест is told what a прогон costs ----------------------------
  // Only a bundle that numbers требования and then builds them has a cost to
  // state; Scout has neither, and a bundle with no build phase builds nothing.
  if (byFile.has('phases/1-manifest.md') && byFile.has('phases/5-build.md')) {
    for (const v of missingAnchors(byFile, SIZE_ANCHORS, 'size')) add(v.check, v.file, v.line, v.message);
  }

  // --- a gate that sends its phase back runs a bounded number of rounds -------
  // Only a bundle with a plan phase has gates that send a phase back; Scout has none.
  if (byFile.has('phases/4-plan.md')) {
    for (const v of missingAnchors(byFile, ROUND_ANCHORS, 'rounds')) add(v.check, v.file, v.line, v.message);
    for (const v of missingAnchors(byFile, PLAN_UNIT_ANCHORS, 'units')) add(v.check, v.file, v.line, v.message);
  }

  // --- commits a later session can trace ---------------------------------------
  // Only a bundle with a memory phase closes a прогон with a commit; Scout has none.
  if (byFile.has('phases/9-memory.md')) {
    for (const v of missingAnchors(byFile, TRACE_ANCHORS, 'trace')) add(v.check, v.file, v.line, v.message);
  }

  // --- a resumed прогон checks its commits are still there --------------------
  // Only a bundle with a memory phase records commits a resume could lose; Scout
  // has none. The reference lives under references/, which the link pass never
  // reads, so it is read for this check alone, as the procedures are above.
  if (byFile.has('phases/9-memory.md')) {
    const resume = new Map(byFile);
    const lostCommits = 'references/lost-commits.md';
    resume.set(lostCommits, await readFile(path.join(bundleDir, lostCommits), 'utf8').catch(() => ''));
    for (const v of missingAnchors(resume, RESUME_ANCHORS, 'resume')) add(v.check, v.file, v.line, v.message);
  }

  // --- what contract 8 retired stays out of the shipped bundle -----------------
  // Only the bundle that once shipped доводка can still carry a mention of it.
  if (byFile.has('phases/7-acceptance.md')) {
    for (const v of await checkRetiredNames(bundleDir)) add(v.check, v.file, v.line, v.message);
  }

  // --- the hand-off is the last line a phase file holds ------------------------
  for (const { file, body } of documents) {
    if (!file.startsWith(`${PHASES_DIR}${path.sep}`)) continue;
    for (const v of textAfterHandoff(file, body)) add(v.check, v.file, v.line, v.message);
  }
  log.info('handoff', 'phase hand-offs checked', { phases: phaseFiles.length });

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

  // Resolved from this file, never from cwd: the version belongs to this
  // repository's package, whichever directory the check is run from.
  const packageFile = fileURLToPath(new URL('../../package.json', import.meta.url));
  let packageVersion: string;
  try {
    const parsed = JSON.parse(await readFile(packageFile, 'utf8')) as { version?: unknown };
    if (typeof parsed.version !== 'string') throw new Error('package.json has no string "version"');
    packageVersion = parsed.version;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'package.json could not be read', { packageFile, reason });
    process.stdout.write(`bundle-integrity: cannot read ${packageFile}\n`);
    return 2;
  }

  let violations: Violation[];
  try {
    violations = await checkBundle(bundleDir, profile, packageVersion);
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
