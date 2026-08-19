// Removes credentials from text before the text reaches a file.
//
// The contract is narrow and absolute: the value never leaves this module. Not
// in the returned text, not in a thrown error, not in a log line. What survives
// is the name of the thing that was found, because a user who is told
// "ANTHROPIC_API_KEY was removed, rotate it" can act, and a user who is told
// "a secret was removed" cannot.

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
  name: (match: RegExpMatchArray) => string;
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
 * Shortest value an assignment rule will treat as a credential.
 *
 * `Authorization: Bearer <token>` is the case that forces this: after the
 * bearer rule has done its work, the assignment rule sees the key
 * `Authorization` and the value `Bearer`, and a six-letter English word is not
 * a secret. A key that names a credential outright gets a lower bar, because
 * `DB_PASSWORD=hunter2` is exactly the thing being looked for.
 */
const MIN_VALUE_LENGTH = 8;
const MIN_VALUE_LENGTH_STRONG = 4;

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
    // the only part of the pair that is safe to keep.
    id: 'assignment',
    pattern: /(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1\s*[:=]\s*(["']?)([^\s"',;]+)\3/g,
    group: 4,
    name: match => toVarName(match[2] ?? ''),
  },
];

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
  const names: string[] = [];
  const seen = new Set<string>();
  let result = text;

  const record = (name: string): string => {
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
    return placeholder(name);
  };

  for (const rule of RULES) {
    result = result.replace(rule.pattern, (...args: unknown[]) => {
      const groups = args.slice(0, -2) as Array<string | undefined>;
      const whole = groups[0] ?? '';
      const value = groups[rule.group];
      if (value === undefined || value === '') return whole;

      // A span an earlier rule already touched is not a second secret. The
      // whole match is checked, not just the value: `Authorization: Bearer
      // [REDACTED:BEARER_TOKEN]` would otherwise be read as an assignment whose
      // value is the word "Bearer".
      if (whole.includes('[REDACTED:')) return whole;

      // The assignment rule is the broad one: without a credential-shaped key
      // it would redact every `width: 100` in the брифе.
      if (rule.id === 'assignment') {
        const key = groups[2] ?? '';
        if (!SECRET_KEY.test(key)) return whole;
        const minimum = STRONG_SECRET_KEY.test(key) ? MIN_VALUE_LENGTH_STRONG : MIN_VALUE_LENGTH;
        if (value.length < minimum) return whole;
      }

      const match = groups as unknown as RegExpMatchArray;
      const start = whole.lastIndexOf(value);
      return whole.slice(0, start) + record(rule.name(match)) + whole.slice(start + value.length);
    });
  }

  // Rules run in their own order, which is not the reader's. Sorting by where
  // each placeholder ended up puts the list in the order the отчёт will want it.
  names.sort((a, b) => result.indexOf(placeholder(a)) - result.indexOf(placeholder(b)));

  // Names only. Logging a count and a list of variable names is the whole of
  // what may be said about a redaction.
  if (names.length > 0) log.info('redact', 'values removed', { count: names.length, names });
  else log.debug('redact', 'no values found');

  return { text: result, names };
}
