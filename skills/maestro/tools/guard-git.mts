#!/usr/bin/env node
// An optional Claude Code `PreToolUse` hook that refuses the git commands S4
// would otherwise only ask about: push, `reset --hard`, `clean -f`,
// `branch -D`, and a checkout, switch or restore that overwrites the working
// tree.
//
// It is offered in docs/install.md and installed by the user, never by a
// прогон: wiring it means editing the user's settings, which is outside S5's
// boundary, and asking for it would put a technical question to a person who
// dictated a brief. That is also why no bundle Markdown names it, and why it
// sits beside `sync.mts` rather than under `runtime/`, which preflight copies
// into every project.
//
// It reads the command line it is handed, the way a shell would split it, and
// nothing else. A git alias, a script or an `npm run` target that calls git
// internally passes, so the prose rule stays the floor and this only raises it
// on the one host that has a hook to raise it with. A command that names no
// destructive form is answered with silence, never with `allow`: an `allow`
// would skip the user's own permission prompt.
//
// No log line, deny reason or error carries the command or any of its words.
// A push URL can hold a token, and the guard must not widen a secret's blast
// radius while refusing to send it anywhere.
//
// Nothing at `npm run check` proves Claude Code calls this file. The unit tests
// hold what it decides; the dated record in docs/install.md holds that the host
// asked it.
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLogger } from './runtime/shared/log.mts';

const log = createLogger('guard-git', process.env['MAESTRO_GUARD_DEBUG'] === '1' ? { level: 'DEBUG' } : {});

/** Each rule's one sentence; the deny reason and the docs table are built from it. */
export const GUARD_RULES = {
  'push': 'git push publishes history',
  'reset-hard': 'git reset --hard discards uncommitted work',
  'clean-force': 'git clean -f deletes untracked files',
  'branch-force-delete': 'git branch -D deletes a branch whether or not it was merged',
  'discarding-checkout': 'git checkout over paths overwrites uncommitted changes',
  'discarding-switch': 'git switch --discard-changes overwrites uncommitted changes',
  'discarding-restore': 'git restore of the working tree overwrites uncommitted changes',
  'unreadable': 'a command substitution whose quote never closes cannot be read, so what it hides is not cleared',
} as const;
export type GuardRule = keyof typeof GUARD_RULES;

/** `subcommand` is null when the line could not be read far enough to find one. */
export type Verdict =
  | { blocked: false; segments: number }
  | { blocked: true; rule: GuardRule; subcommand: string | null };

/** What the agent is told. It names the rule and never the command. */
export function denyReason(rule: GuardRule): string {
  return `Maestro git guard: ${GUARD_RULES[rule]}. It is blocked in every mode. `
    + 'If the user wants it done, ask them to run it in their own terminal.';
}

// A nested shell deeper than this is not read further. Sixteen levels of
// `bash -c` is not a command anyone types; it is a loop in a generator.
const MAX_DEPTH = 16;

type Via = 'substitution' | 'backtick' | 'process substitution' | 'shell -c' | 'eval' | 'env -S';

/** One simple command: its words after quote removal, in reading order. */
interface Segment { words: string[] }

const SEPARATORS = new Set([';', '&', '|', '(', ')', '\n']);
const WORD_END = new Set([' ', '\t', ...SEPARATORS, '<', '>']);

type Quote = 'single' | 'double';

/**
 * A quote inside a substitution that never closes. Outside a substitution an
 * unclosed quote only swallows the rest of the line as one word, and the
 * command before it is still read; inside one it decides where the
 * substitution ends, so any guess could hide the commands after it.
 */
class UnreadableCommandError extends Error {
  readonly quote: Quote;
  constructor(quote: Quote) {
    super(`a ${quote} quote inside a command substitution never closes`);
    this.name = 'UnreadableCommandError';
    this.quote = quote;
  }
}

interface Heredoc { delimiter: string; tabs: boolean }

/**
 * The delimiter word after `<<` or `<<-`, quotes removed, read literally the
 * way a shell does: no substitution inside it runs. `unclosed` names a quote
 * in it that never closes.
 */
function heredocDelimiter(text: string, start: number): { delimiter: string; end: number; unclosed: Quote | null } {
  let i = start;
  while (text[i] === ' ' || text[i] === '\t') i += 1;
  let delimiter = '';
  while (i < text.length && !WORD_END.has(text[i]!)) {
    const ch = text[i]!;
    if (ch === "'" || ch === '"') {
      const end = text.indexOf(ch, i + 1);
      if (end < 0) return { delimiter: delimiter + text.slice(i + 1), end: text.length, unclosed: ch === "'" ? 'single' : 'double' };
      delimiter += text.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (ch === '\\') { delimiter += text[i + 1] ?? ''; i += 2; continue; }
    delimiter += ch;
    i += 1;
  }
  return { delimiter, end: i, unclosed: null };
}

/**
 * The index past the bodies of the pending here-documents, which start at
 * `start`, the line after their operators. Inside a substitution bash also
 * ends a body at a delimiter line the closing `)` follows directly; the index
 * of that `)` is returned so the caller closes the substitution there. Ending
 * a body too late would hide every command after it, so the early reading wins.
 */
function skipHeredocBodies(text: string, start: number, heredocs: readonly Heredoc[], inSubstitution: boolean): number {
  let i = start;
  for (const { delimiter, tabs } of heredocs) {
    while (i < text.length) {
      const eol = text.indexOf('\n', i);
      const line = text.slice(i, eol < 0 ? text.length : eol);
      const bare = tabs ? line.replace(/^\t+/, '') : line;
      if (inSubstitution && bare.startsWith(`${delimiter})`)) return i + (line.length - bare.length) + delimiter.length;
      i = eol < 0 ? text.length : eol + 1;
      if (bare === delimiter) break;
    }
  }
  return i;
}

/** Whether `index` starts a word, so a `#` there opens a comment. */
function atWordStart(text: string, index: number, first: number): boolean {
  return index === first || WORD_END.has(text[index - 1]!);
}

/**
 * The index just past the `)` that closes a `$(` or `<(` opened before `start`.
 *
 * Here-document bodies and comments are skipped, because both are text a
 * quote in them does not open: `Don't` in a commit message written through
 * `cat <<'EOF'` would otherwise start a quoted run that swallows the rest of
 * the line, `&& git push` included.
 *
 * @throws UnreadableCommandError when a quote inside never closes.
 */
function closingParen(text: string, start: number): number {
  let depth = 1;
  let i = start;
  const heredocs: Heredoc[] = [];
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\') { i += 2; continue; }
    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) throw new UnreadableCommandError('single');
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      const end = closingDouble(text, i + 1);
      if (end < 0) throw new UnreadableCommandError('double');
      i = end;
      continue;
    }
    if (ch === '#' && atWordStart(text, i, start)) {
      const eol = text.indexOf('\n', i);
      i = eol < 0 ? text.length : eol;
      continue;
    }
    if (text.startsWith('<<', i) && !text.startsWith('<<<', i)) {
      const tabs = text[i + 2] === '-';
      const read = heredocDelimiter(text, i + (tabs ? 3 : 2));
      if (read.unclosed !== null) throw new UnreadableCommandError(read.unclosed);
      heredocs.push({ delimiter: read.delimiter, tabs });
      i = read.end;
      continue;
    }
    if (ch === '\n' && heredocs.length) {
      i = skipHeredocBodies(text, i + 1, heredocs, true);
      heredocs.length = 0;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') { depth -= 1; if (depth === 0) return i + 1; }
    i += 1;
  }
  return text.length;
}

/** The index just past the `"` that closes a double-quoted run starting at `start`, or -1 when none does. */
function closingDouble(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\') { i += 2; continue; }
    if (ch === '"') return i + 1;
    if (ch === '$' && text[i + 1] === '(') { i = closingParen(text, i + 2); continue; }
    i += 1;
  }
  return -1;
}

/** The index just past the backtick that closes one opened before `start`. */
function closingBacktick(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === '`') return i + 1;
    i += 1;
  }
  return text.length;
}

/** The body between an opener and its closer; an unclosed body runs to the end. */
function body(text: string, start: number, end: number, closer: string): string {
  return text.slice(start, text[end - 1] === closer && end > start ? end - 1 : end);
}

/**
 * Split a command line into simple commands, the way a shell would, and read
 * every substitution inside it as a command list of its own.
 *
 * Only what finding a command needs is modelled: quotes, escapes, separators,
 * substitutions, redirections and here-documents. Expansion, globbing and
 * arithmetic are not, because none of them can turn a word into `git push`
 * that the line did not already spell.
 */
function splitCommands(text: string, depth: number, out: Segment[]): void {
  let words: string[] = [];
  let word: string | null = null;
  const heredocs: Heredoc[] = [];
  let i = 0;

  const endWord = (): void => { if (word !== null) words.push(word); word = null; };
  const endCommand = (): void => { endWord(); if (words.length) out.push({ words }); words = []; };
  const nested = (inner: string, via: Via): void => {
    if (depth + 1 > MAX_DEPTH) { log.warn('classify', 'nesting too deep to read', { depth, via }); return; }
    log.debug('classify', 'nested command read', { depth: depth + 1, via });
    splitCommands(inner, depth + 1, out);
  };
  /** One redirection target, quotes removed. */
  const readTarget = (): string => {
    while (text[i] === ' ' || text[i] === '\t') i += 1;
    let target = '';
    while (i < text.length && !WORD_END.has(text[i]!)) {
      const ch = text[i]!;
      if (ch === "'") { const end = text.indexOf("'", i + 1); const stop = end < 0 ? text.length : end; target += text.slice(i + 1, stop); i = stop + 1; continue; }
      if (ch === '"') { const close = closingDouble(text, i + 1); const end = close < 0 ? text.length : close; target += body(text, i + 1, end, '"'); i = end; continue; }
      if (ch === '\\') { target += text[i + 1] ?? ''; i += 2; continue; }
      if (ch === '$' && text[i + 1] === '(') { const end = closingParen(text, i + 2); nested(body(text, i + 2, end, ')'), 'substitution'); i = end; continue; }
      target += ch;
      i += 1;
    }
    return target;
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\') {
      if (text[i + 1] === '\n') { i += 2; continue; }
      word = (word ?? '') + (text[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end < 0 ? text.length : end;
      word = (word ?? '') + text.slice(i + 1, stop);
      i = stop + 1;
      continue;
    }
    if (ch === '"') {
      word ??= '';
      i += 1;
      while (i < text.length && text[i] !== '"') {
        const inner = text[i]!;
        if (inner === '\\' && '"\\$`\n'.includes(text[i + 1] ?? '')) {
          if (text[i + 1] !== '\n') word += text[i + 1];
          i += 2;
          continue;
        }
        if (inner === '$' && text[i + 1] === '(') {
          const end = closingParen(text, i + 2);
          nested(body(text, i + 2, end, ')'), 'substitution');
          word += '$()';
          i = end;
          continue;
        }
        if (inner === '`') {
          const end = closingBacktick(text, i + 1);
          nested(body(text, i + 1, end, '`'), 'backtick');
          word += '``';
          i = end;
          continue;
        }
        word += inner;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === '$' && text[i + 1] === '(') {
      const end = closingParen(text, i + 2);
      nested(body(text, i + 2, end, ')'), 'substitution');
      word = (word ?? '') + '$()';
      i = end;
      continue;
    }
    if (ch === '`') {
      const end = closingBacktick(text, i + 1);
      nested(body(text, i + 1, end, '`'), 'backtick');
      word = (word ?? '') + '``';
      i = end;
      continue;
    }
    if (ch === '#' && word === null) {
      const eol = text.indexOf('\n', i);
      i = eol < 0 ? text.length : eol;
      continue;
    }
    if (ch === '<' || ch === '>') {
      if ((text[i + 1] === '(') && word === null) {
        const end = closingParen(text, i + 2);
        nested(body(text, i + 2, end, ')'), 'process substitution');
        word = '<()';
        i = end;
        continue;
      }
      // A word of digits directly before the operator is its file descriptor.
      if (word !== null && /^\d+$/.test(word)) word = null;
      endWord();
      if (text.startsWith('<<<', i)) { i += 3; readTarget(); continue; }
      if (text.startsWith('<<', i)) {
        const tabs = text[i + 2] === '-';
        const read = heredocDelimiter(text, i + (tabs ? 3 : 2));
        heredocs.push({ delimiter: read.delimiter, tabs });
        i = read.end;
        continue;
      }
      i += 1;
      while (text[i] === '>' || text[i] === '<' || text[i] === '&' || text[i] === '|') i += 1;
      readTarget();
      continue;
    }
    if (ch === ' ' || ch === '\t') { endWord(); i += 1; continue; }
    if (SEPARATORS.has(ch)) {
      endCommand();
      i += 1;
      if (ch === '\n' && heredocs.length) { i = skipHeredocBodies(text, i, heredocs, false); heredocs.length = 0; }
      continue;
    }
    word = (word ?? '') + ch;
    i += 1;
  }
  endCommand();
}

// `time` is a reserved word too, but it takes flags (`time -p`), so it is
// stripped as a wrapper below rather than here.
const RESERVED = new Set(['!', '{', '}', 'if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Flags of a wrapper that consume the following word as their value. */
const VALUE_FLAGS: Record<string, ReadonlySet<string>> = {
  nice: new Set(['-n', '--adjustment']),
  env: new Set(['-u', '--unset', '-C', '--chdir']),
  sudo: new Set(['-u', '-g', '-C', '-D', '-p', '-U', '-r', '-t', '-T', '-h']),
  timeout: new Set(['-s', '--signal', '-k', '--kill-after']),
  xargs: new Set(['-I', '-n', '-P', '-L', '-d', '-E', '-s', '-a']),
  time: new Set(['-f', '-o']),
};

/** What is left of a simple command once the words that only launch it are gone. */
type Stripped = { words: string[] } | { reenter: string; via: Via };

/**
 * Drop assignments, reserved words and launching wrappers from the front of a
 * simple command, repeatedly, until the word that names the program is first.
 * A shell's `-c` string and `eval`'s words are handed back to be read again.
 */
function stripPrefixes(input: readonly string[]): Stripped {
  let words = [...input];
  for (;;) {
    const first = words[0];
    if (first === undefined) return { words };
    if (ASSIGNMENT.test(first) || RESERVED.has(first)) { words = words.slice(1); continue; }
    const program = path.basename(first);
    if (program === 'eval') return { reenter: words.slice(1).join(' '), via: 'eval' };
    if (SHELLS.has(program)) {
      const flag = words.findIndex((w, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(w));
      if (flag < 0) return { words };
      return { reenter: words[flag + 1] ?? '', via: 'shell -c' };
    }
    if (program === 'command' || program === 'builtin') {
      if (words[1] === '-v' || words[1] === '-V') return { words: [] };
      words = words.slice(words[1] === '-p' ? 2 : 1);
      continue;
    }
    if (program === 'exec' || program === 'nohup') { words = words.slice(1); continue; }
    const values = VALUE_FLAGS[program];
    if (values === undefined) return { words };
    let index = 1;
    while (index < words.length) {
      const word = words[index]!;
      if (word === '--') { index += 1; break; }
      if (program === 'env' && (word === '-S' || word === '--split-string')) {
        return { reenter: words.slice(index + 1).join(' '), via: 'env -S' };
      }
      if (program === 'env' && ASSIGNMENT.test(word)) { index += 1; continue; }
      if (!word.startsWith('-')) break;
      index += values.has(word) ? 2 : 1;
    }
    // `timeout` takes its duration as the first word after its flags.
    if (program === 'timeout') index += 1;
    words = words.slice(index);
  }
}

/** Global options that take their value as the following word. */
const GIT_VALUE_GLOBALS = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--exec-path']);

interface GitInvocation { subcommand: string; args: string[]; dirs: string[] }

/** The subcommand and its words, with `-C` directories collected and other global options skipped. */
function gitInvocation(words: readonly string[]): GitInvocation | null {
  const dirs: string[] = [];
  let index = 1;
  while (index < words.length) {
    const word = words[index]!;
    if (word === '-C') { dirs.push(words[index + 1] ?? '.'); index += 2; continue; }
    if (GIT_VALUE_GLOBALS.has(word)) { index += 2; continue; }
    if (!word.startsWith('-')) break;
    index += 1;
  }
  const subcommand = words[index];
  if (subcommand === undefined) return null;
  return { subcommand, args: words.slice(index + 1), dirs };
}

/** A run of single-letter options in one word, such as `-xdf`. */
function isCluster(word: string): boolean {
  return /^-[A-Za-z]{2,}$/.test(word);
}

/**
 * Whether `word` spells the long option `name`, whole or abbreviated, with any
 * `=value` ignored. Git's option parser takes any prefix that is unique among
 * the subcommand's options, so `--har` is `--hard` and `--del` is `--delete`.
 *
 * `shortest` is the shortest spelling read as `name`. For an option that makes
 * a command destructive it stays at `--` and one letter: a prefix git finds
 * ambiguous is refused by git itself, so reading it as the dangerous option
 * costs a command that would not have run, while a longer floor would let
 * through a prefix that happens to be unique (`--h` is `--hard` to
 * `git reset`). No other option of the subcommands read here is spelled by a
 * prefix of a dangerous one, so an exact match elsewhere cannot be misread.
 */
function isLongOption(word: string, name: string, shortest = 3): boolean {
  if (!word.startsWith('--')) return false;
  const stem = word.split('=', 1)[0]!;
  return stem.length >= shortest && name.startsWith(stem);
}

/** Whether the options carry any of the long forms, whole or abbreviated. */
function hasLong(options: readonly string[], ...long: string[]): boolean {
  return options.some((w) => long.some((name) => isLongOption(w, name)));
}

/** Whether the options (the words before `--`) carry a short letter, alone or clustered, or a long form. */
function hasOption(options: readonly string[], letter: string, ...long: string[]): boolean {
  return options.some((w) => w === `-${letter}` || (isCluster(w) && w.includes(letter))) || hasLong(options, ...long);
}

// `--staged` is the one long option here that makes a command safe, so its
// floor runs the other way: `--s` is also `--source` to `git restore`, and only
// a prefix git cannot read as anything else clears the restore.
const STAGED_SHORTEST = '--st'.length;

function optionsOf(args: readonly string[]): string[] {
  const end = args.indexOf('--');
  return end < 0 ? [...args] : args.slice(0, end);
}

/** A word git would read as a pathspec whatever exists on disk. */
function isPathspec(word: string): boolean {
  return word === '.' || word.endsWith('/.') || /[*?[]/.test(word) || word.startsWith(':(') || word.startsWith(':/');
}

const CHECKOUT_VALUES = new Set(['-b', '-B', '--orphan', '--conflict']);

function discardingCheckout(args: readonly string[], dir: string): boolean {
  const separator = args.indexOf('--');
  if (separator >= 0 && separator < args.length - 1) return true;
  const options = optionsOf(args);
  if (hasOption(options, 'f', '--force') || hasOption(options, 'p', '--patch')) return true;
  if (hasLong(options, '--ours', '--theirs', '--pathspec-from-file')) return true;
  for (let index = 0; index < options.length; index += 1) {
    const word = options[index]!;
    if (CHECKOUT_VALUES.has(word)) { index += 1; continue; }
    if (word.startsWith('-')) continue;
    if (isPathspec(word) || existsSync(path.resolve(dir, word))) return true;
  }
  return false;
}

/** The rule a git subcommand breaks, or null. `dir` is where its paths resolve. */
function ruleFor(subcommand: string, args: readonly string[], dir: string): GuardRule | null {
  const options = optionsOf(args);
  switch (subcommand) {
    case 'push':
      return 'push';
    case 'reset':
      return hasLong(options, '--hard') ? 'reset-hard' : null;
    case 'clean':
      return hasOption(options, 'f', '--force') ? 'clean-force' : null;
    case 'branch': {
      if (hasOption(options, 'D')) return 'branch-force-delete';
      const deletes = hasOption(options, 'd', '--delete');
      return deletes && hasOption(options, 'f', '--force') ? 'branch-force-delete' : null;
    }
    case 'checkout':
      return discardingCheckout(args, dir) ? 'discarding-checkout' : null;
    case 'switch':
      return hasOption(options, 'f', '--force', '--discard-changes') ? 'discarding-switch' : null;
    case 'restore': {
      const staged = hasOption(options, 'S') || options.some((w) => isLongOption(w, '--staged', STAGED_SHORTEST));
      const worktree = hasOption(options, 'W', '--worktree');
      return staged && !worktree ? null : 'discarding-restore';
    }
    default:
      return null;
  }
}

/**
 * Decide one command line. `cwd` is where it runs; a `cd` inside the line
 * moves it for the simple commands after, and `git -C` moves it for one.
 */
export function classify(command: string, cwd: string): Verdict {
  try {
    const segments: Segment[] = [];
    splitCommands(command, 0, segments);
    return decide(segments, cwd, 0, { count: 0 });
  } catch (error) {
    if (!(error instanceof UnreadableCommandError)) throw error;
    // Denied rather than guessed at: where the substitution ends is exactly
    // what decides whether a later `git push` is read or hidden.
    log.info('classify', 'unreadable substitution', { quote: error.quote });
    return { blocked: true, rule: 'unreadable', subcommand: null };
  }
}

function decide(segments: readonly Segment[], start: string, depth: number, read: { count: number }): Verdict {
  let cwd = start;
  for (const segment of segments) {
    read.count += 1;
    const stripped = stripPrefixes(segment.words);
    if ('reenter' in stripped) {
      if (depth + 1 > MAX_DEPTH) { log.warn('classify', 'nesting too deep to read', { depth, via: stripped.via }); continue; }
      log.debug('classify', 'nested command read', { depth: depth + 1, via: stripped.via });
      const inner: Segment[] = [];
      splitCommands(stripped.reenter, depth + 1, inner);
      const verdict = decide(inner, cwd, depth + 1, read);
      if (verdict.blocked) return verdict;
      continue;
    }
    const [first, ...rest] = stripped.words;
    if (first === undefined) continue;
    const program = path.basename(first);
    if (program === 'cd') {
      const target = rest[0];
      if (target !== undefined && target !== '-') cwd = path.resolve(cwd, target);
      log.debug('classify', 'segment read', { index: read.count, program, subcommand: null });
      continue;
    }
    if (program !== 'git') {
      log.debug('classify', 'segment read', { index: read.count, program, subcommand: null });
      continue;
    }
    const git = gitInvocation(stripped.words);
    log.debug('classify', 'segment read', { index: read.count, program, subcommand: git?.subcommand ?? null });
    if (git === null) continue;
    const rule = ruleFor(git.subcommand, git.args, path.resolve(cwd, ...git.dirs));
    if (rule !== null) return { blocked: true, rule, subcommand: git.subcommand };
  }
  return { blocked: false, segments: read.count };
}

/** The hook payload from stdin; null when nothing is piped, so a terminal never hangs. */
async function stdinText(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Unreadable = 'empty' | 'not json' | 'no command';

/**
 * Exit 2 is this repository's "the input could not be read" and Claude Code's
 * "block this call and show stderr to the model". The two meanings agree: a
 * guard that could not read the call has not cleared it.
 */
function unreadable(reason: Unreadable): number {
  log.warn('payload', 'unreadable', { reason });
  process.stderr.write(reason === 'no command'
    ? 'guard-git: the Bash call carried no command string; the call is blocked until the hook receives what Claude Code sends\n'
    : 'guard-git: the hook payload was not a JSON object; the call is blocked until the hook receives what Claude Code sends\n');
  return 2;
}

/** Read one `PreToolUse` payload and answer it: a deny line, or silence. */
export async function main(input: () => Promise<string | null> = stdinText): Promise<number> {
  const text = (await input()) ?? '';
  if (!text.trim()) return unreadable('empty');
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return unreadable('not json'); }
  if (!isRecord(payload)) return unreadable('not json');
  const tool = payload['tool_name'];
  if (tool !== 'Bash') {
    log.debug('payload', 'tool ignored', { tool: typeof tool === 'string' ? tool : null });
    return 0;
  }
  const toolInput = payload['tool_input'];
  const command = isRecord(toolInput) ? toolInput['command'] : undefined;
  if (typeof command !== 'string') return unreadable('no command');
  const cwd = typeof payload['cwd'] === 'string' ? payload['cwd'] : process.cwd();
  const verdict = classify(command, cwd);
  if (!verdict.blocked) {
    log.debug('decision', 'allowed', { segments: verdict.segments });
    return 0;
  }
  log.info('decision', 'blocked', { rule: verdict.rule, subcommand: verdict.subcommand });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: denyReason(verdict.rule),
    },
  }) + '\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main());
}
