// Removes credentials from text before the text reaches a file.
//
// The contract is narrow and absolute: the value never leaves this module. Not
// in the returned text, not in a thrown error, not in a log line. What survives
// is the name of the thing that was found, because a user who is told
// "ANTHROPIC_API_KEY was removed, rotate it" can act, and a user who is told
// "a secret was removed" cannot.
//
// The rules are applied by scanning, not by rewriting in place. Every offset a
// caller sees therefore points into the text it passed in — which is what lets
// the sweep report the line a secret is actually on.

import { createLogger } from '../shared/log.ts';

const log = createLogger('redact');

export const PLACEHOLDER_PATTERN = /^\[REDACTED:[A-Z0-9_]+\]$/;

const placeholder = (name: string): string => `[REDACTED:${name}]`;

/** Uppercase, underscore-separated, safe to put inside a placeholder. */
export function toVarName(value: string): string {
  const name = value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return name === '' ? 'SECRET' : name;
}

interface Rule {
  id: string;
  pattern: RegExp;
  /** Which capture group holds the value to remove. */
  group: number;
  /** The name to record, from the match. */
  name: (match: RegExpExecArray) => string;
}

/** Key prefixes that identify a provider on sight. */
const PROVIDER_KEYS: Array<{ id: string; pattern: RegExp; name: string }> = [
  { id: 'anthropic', pattern: /\b(sk-ant-[A-Za-z0-9_-]{16,})/g, name: 'ANTHROPIC_API_KEY' },
  { id: 'openai', pattern: /\b(sk-(?!ant-)[A-Za-z0-9_-]{20,})/g, name: 'OPENAI_API_KEY' },
  { id: 'github-pat', pattern: /\b(github_pat_[A-Za-z0-9_]{20,})/g, name: 'GITHUB_TOKEN' },
  { id: 'github', pattern: /\b(gh[pousr]_[A-Za-z0-9]{20,})/g, name: 'GITHUB_TOKEN' },
  { id: 'gitlab', pattern: /\b(glpat-[A-Za-z0-9_-]{16,})/g, name: 'GITLAB_TOKEN' },
  { id: 'slack', pattern: /\b(xox[baprs]-[A-Za-z0-9-]{10,})/g, name: 'SLACK_TOKEN' },
  { id: 'aws', pattern: /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/g, name: 'AWS_ACCESS_KEY_ID' },
  { id: 'google', pattern: /\b(AIza[A-Za-z0-9_-]{20,})/g, name: 'GOOGLE_API_KEY' },
  { id: 'stripe', pattern: /\b((?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,})/g, name: 'STRIPE_SECRET_KEY' },
];

/** Assignment keys whose value is a credential by definition of the name. */
const SECRET_KEY = /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIALS?|AUTH|PASSPHRASE|PRIVATE)/i;

/** The subset of those keys that name a credential and nothing else. */
const STRONG_SECRET_KEY =
  /(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|API_?KEY|PASSPHRASE|CREDENTIALS?|PRIVATE_?KEY)/i;

/**
 * Characters a credential is drawn from. Anything outside this set means the
 * "value" is a fragment of code: `Map<string`, `Array<string>`, `() => void`.
 */
const VALUE_CHARSET = /^[A-Za-z0-9._~+/=:@-]+$/;

/** Marks of a generated secret rather than a word: digits and token punctuation. */
const TOKEN_SHAPE = /[0-9_~+/=-]/;

/**
 * Shortest value an `=` assignment will treat as a credential.
 *
 * `Authorization: Bearer <token>` is the case that forces this: after the
 * bearer rule has done its work, the assignment rule sees the key
 * `Authorization` and the value `Bearer`, and a six-letter English word is not
 * a secret. A key that names a credential outright gets a lower bar, because
 * `DB_PASSWORD=hunter2` is exactly the thing being looked for.
 */
const MIN_VALUE_LENGTH = 8;
const MIN_VALUE_LENGTH_STRONG = 4;

/** Length at which a `:` value is credential-shaped on size alone. */
const MIN_COLON_VALUE_LENGTH = 12;

const RULES: Rule[] = [
  {
    // A whole block, matched first: its body contains base64 that every later
    // rule would otherwise chew on one line at a time.
    id: 'private-key',
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----([\s\S]*?)-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g,
    group: 1,
    name: () => 'PRIVATE_KEY',
  },
  {
    // scheme://user:password@host — only the password is removed, because the
    // host and the user are usually the point of pasting the string at all.
    id: 'connection-string',
    pattern: /\b([a-z][a-z0-9+.-]*):\/\/([^\s:/@]+):([^\s@/]+)@/gi,
    group: 3,
    name: match => `${toVarName(match[1] ?? '')}_PASSWORD`,
  },
  {
    id: 'bearer',
    pattern: /\b(?:Bearer|Token)\s+([A-Za-z0-9._~+/=-]{16,})/gi,
    group: 1,
    name: () => 'BEARER_TOKEN',
  },
  ...PROVIDER_KEYS.map(provider => ({
    id: provider.id,
    pattern: provider.pattern,
    group: 1,
    name: () => provider.name,
  })),
  {
    // KEY=value and "key": "value" alike. The name comes from the key, which is
    // the only part of the pair that is safe to keep. Groups: 1 opening quote,
    // 2 key, 3 separator, 4 opening value quote, 5 value.
    //
    // The spacing is [ \t]* rather than \s*, and that is not cosmetic: \s
    // matches a newline, so in YAML the pair `database:` would reach across the
    // line break and swallow the `password` key underneath it as its own value.
    // A key and its value are on one line.
    id: 'assignment',
    pattern: /(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1[ \t]*([:=])[ \t]*(["']?)([^\s"',;]+)\4/g,
    group: 5,
    name: match => toVarName(match[2] ?? ''),
  },
];

/**
 * Decide whether a `key <sep> value` pair is a credential.
 *
 * The separator carries most of the signal. `=` is env-file syntax, where a
 * credential-shaped key means what it says. `:` is also how every typed
 * language writes an annotation and every object writes a member, so
 * `token: string` and `keys: frontmatter.keys.size` reach this function looking
 * exactly like a secret. For `:` the key must therefore name a credential
 * outright, and the value must look generated rather than written.
 */
function isCredentialAssignment(match: RegExpExecArray): boolean {
  const key = match[2] ?? '';
  const separator = match[3] ?? '';
  const value = match[5] ?? '';

  if (!SECRET_KEY.test(key)) return false;
  if (!VALUE_CHARSET.test(value)) return false;

  const strong = STRONG_SECRET_KEY.test(key);
  if (value.length < (strong ? MIN_VALUE_LENGTH_STRONG : MIN_VALUE_LENGTH)) return false;

  if (separator === ':') {
    if (!strong) return false;
    if (!TOKEN_SHAPE.test(value) && value.length < MIN_COLON_VALUE_LENGTH) return false;
  }

  return true;
}

interface Hit {
  name: string;
  /** Offset of the value to remove, in the text that was passed in. */
  index: number;
  length: number;
  /** Offset where the whole construct starts — the line a reader should look at. */
  matchIndex: number;
}

/**
 * Find every credential in `text` without changing it.
 *
 * Rules are ordered, and an earlier rule's whole match claims its span: that is
 * what stops `Authorization: Bearer <token>` from being read a second time as
 * an assignment whose value is the word "Bearer", and what stops
 * `ANTHROPIC_API_KEY=sk-ant-…` from being counted twice.
 */
function scanRules(text: string): Hit[] {
  const hits: Hit[] = [];
  const claimed: Array<[number, number]> = [];
  const overlapsClaimed = (start: number, end: number): boolean =>
    claimed.some(([from, to]) => start < to && from < end);

  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const whole = match[0];
      const value = match[rule.group];
      if (value === undefined || value === '') continue;

      const matchIndex = match.index;
      const matchEnd = matchIndex + whole.length;
      if (overlapsClaimed(matchIndex, matchEnd)) continue;
      if (rule.id === 'assignment' && !isCredentialAssignment(match)) continue;

      claimed.push([matchIndex, matchEnd]);
      hits.push({
        name: rule.name(match),
        index: matchIndex + whole.lastIndexOf(value),
        length: value.length,
        matchIndex,
      });
    }
  }

  return hits.sort((a, b) => a.index - b.index);
}

export interface RedactionResult {
  /** The input with every detected value replaced by a named placeholder. */
  text: string;
  /** Names of what was removed, first appearance first, without duplicates. */
  names: string[];
}

/**
 * Replace every credential in `text` with `[REDACTED:<NAME>]`.
 *
 * Text with no credentials comes back byte-identical — the function is a filter
 * on a path every piece of user text takes, so a formatting change it made
 * would be a change nobody asked for on every brief.
 */
export function redact(text: string): RedactionResult {
  const hits = scanRules(text);
  if (hits.length === 0) {
    log.debug('redact', 'no values found');
    return { text, names: [] };
  }

  const names: string[] = [];
  const seen = new Set<string>();
  let result = '';
  let cursor = 0;

  for (const hit of hits) {
    if (!seen.has(hit.name)) {
      seen.add(hit.name);
      names.push(hit.name);
    }
    result += text.slice(cursor, hit.index) + placeholder(hit.name);
    cursor = hit.index + hit.length;
  }
  result += text.slice(cursor);

  // Names only. Logging a count and a list of variable names is the whole of
  // what may be said about a redaction.
  log.info('redact', 'values removed', { count: names.length, names });

  return { text: result, names };
}

export interface SecretLocation {
  name: string;
  /** 1-based line in the text that was passed in. */
  line: number;
}

/**
 * Where the credentials are, without producing redacted text.
 *
 * The line is the one the construct starts on, so a private key block is
 * reported at its `-----BEGIN` fence rather than at the base64 underneath.
 */
export function findSecrets(text: string): SecretLocation[] {
  const hits = scanRules(text);
  if (hits.length === 0) return [];

  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }

  const lineOf = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };

  return hits
    .map(hit => ({ name: hit.name, line: lineOf(hit.matchIndex) }))
    .sort((a, b) => a.line - b.line);
}
