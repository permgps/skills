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
}

export const MAESTRO_BUNDLE: BundleProfile = {
  name: 'maestro',
  steps: 'phases',
  prompts: 'prompts',
  other: ['references'],
  // Lowered with every shortening, never raised; raising one is a decision for
  // the roadmap, not a fix.
  resident: { skillLines: 626, descriptionChars: 515 },
  invocation: 'explicit-only',
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
 * The debug-tag condition itself is also held executably, by
 * `scripts/gates/debug-tags.ts`.
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
  { file: 'phases/7-acceptance.md', literal: 'are Questions to forward and Hard to undo',
    why: 'a list assembled again at the end differs from the state exactly on what was forgotten' },
  { file: 'phases/7-acceptance.md',
    literal: 'give them in the chat in the прогон\'s language, as one block the user can copy and send on as it is',
    why: 'the отчёт on disk is English, and the person who knows the answer may not read it' },
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

  // --- the отчёт hands over what only the user can do -------------------------
  // Only a bundle with an acceptance phase writes an отчёт; Scout has none.
  if (byFile.has('phases/7-acceptance.md')) {
    for (const v of missingAnchors(byFile, REPORT_ANCHORS, 'report')) add(v.check, v.file, v.line, v.message);
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
