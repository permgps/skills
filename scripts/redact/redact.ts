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
//
// Two costs shape every pattern here. A miss writes a credential to disk; a
// false positive in the sweep is rule S2, a stop. And the function runs over
// whole transcripts, so every pattern must stay linear in its input: each one
// that can start on a run of word characters is anchored on its left, so the
// engine tries it once per run rather than once per character.

import { createLogger } from '../shared/log.ts';

const log = createLogger('redact');

export const PLACEHOLDER_PATTERN = /^\[REDACTED:[A-Z0-9_]+\]$/;

const placeholder = (name: string): string => `[REDACTED:${name}]`;

/** What a value already redacted on an earlier pass starts with. */
const PLACEHOLDER_PREFIX = '[REDACTED:';

/** Uppercase, underscore-separated, safe to put inside a placeholder. */
export function toVarName(value: string): string {
  const name = value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return name === '' ? 'SECRET' : name;
}

interface Rule {
  id: string;
  /** Carries the `d` flag: the value's offsets come from `match.indices`. */
  pattern: RegExp;
  /** Which capture group holds the value to remove. */
  group: number;
  /** The name to record, from the match. */
  name: (match: RegExpExecArray) => string;
  /** A veto, for a rule whose match alone is not proof. */
  accept?: (match: RegExpExecArray) => boolean;
}

/**
 * Formats that identify a provider on sight.
 *
 * These run before the bearer rule, so `Authorization: token ghp_…` is named
 * GITHUB_TOKEN rather than BEARER_TOKEN: the provider is what tells the user
 * which console to rotate it in.
 */
const PROVIDER_KEYS: Array<{ id: string; pattern: RegExp; name: string }> = [
  { id: 'anthropic', pattern: /\b(sk-ant-[A-Za-z0-9_-]{16,})/dg, name: 'ANTHROPIC_API_KEY' },
  { id: 'openai', pattern: /\b(sk-(?!ant-)[A-Za-z0-9_-]{20,})/dg, name: 'OPENAI_API_KEY' },
  { id: 'github-pat', pattern: /\b(github_pat_[A-Za-z0-9_]{20,})/dg, name: 'GITHUB_TOKEN' },
  { id: 'github', pattern: /\b(gh[pousr]_[A-Za-z0-9]{20,})/dg, name: 'GITHUB_TOKEN' },
  { id: 'gitlab', pattern: /\b(glpat-[A-Za-z0-9_-]{16,})/dg, name: 'GITLAB_TOKEN' },
  { id: 'slack', pattern: /\b(xox[abeoprs]-[A-Za-z0-9-]{10,})/dg, name: 'SLACK_TOKEN' },
  { id: 'slack-app', pattern: /\b(xapp-\d+-[A-Za-z0-9-]{10,})/dg, name: 'SLACK_TOKEN' },
  {
    // The path after the endpoint is the credential: anyone holding it can
    // post to the channel. The host stays so the reader knows what it was.
    id: 'slack-webhook',
    pattern: /\bhttps:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/([A-Za-z0-9_/-]+)/dg,
    name: 'SLACK_WEBHOOK_URL',
  },
  { id: 'npm', pattern: /\b(npm_[A-Za-z0-9]{36})(?![A-Za-z0-9])/dg, name: 'NPM_TOKEN' },
  { id: 'aws', pattern: /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/dg, name: 'AWS_ACCESS_KEY_ID' },
  { id: 'google', pattern: /\b(AIza[A-Za-z0-9_-]{20,})/dg, name: 'GOOGLE_API_KEY' },
  { id: 'stripe', pattern: /\b((?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,})/dg, name: 'STRIPE_SECRET_KEY' },
  {
    // A signed JWT is a bearer credential whether or not a header names it.
    // Header and payload must both be base64 JSON objects (`eyJ` is `{"`), which
    // is what separates a token from any dotted base64. Anchored by lookbehind
    // rather than \b, because \b holds after every `-` in a base64url run.
    id: 'jwt',
    pattern: /(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)/dg,
    name: 'JWT',
  },
];

/**
 * Key segments that make an assignment worth a second look.
 *
 * A key is judged by its segments — split at `_`, `.`, `-` and camelCase
 * humps — and never by substring. A substring test reads AUTHOR as AUTH and
 * MONKEY_NAME as KEY, and in the sweep that false positive is a stop.
 */
const SECRET_SEGMENTS = new Set([
  'KEY', 'KEYS', 'TOKEN', 'TOKENS', 'SECRET', 'SECRETS', 'PASSWORD', 'PASSWORDS', 'PASSWD', 'PWD',
  'CREDENTIAL', 'CREDENTIALS', 'AUTH', 'AUTHORIZATION', 'PASSPHRASE', 'PRIVATE',
]);

/** The subset of those segments that name a credential and nothing else. */
const STRONG_SEGMENTS = new Set([
  'PASSWORD', 'PASSWD', 'PWD', 'SECRET', 'TOKEN', 'PASSPHRASE', 'CREDENTIAL', 'CREDENTIALS',
  'APIKEY', 'PRIVATEKEY', 'SECRETKEY',
]);

/** Adjacent segments that name a credential together: API_KEY, privateKey. */
const STRONG_PAIRS: Array<[string, string]> = [['API', 'KEY'], ['PRIVATE', 'KEY']];

/**
 * A segment ending in one of these is strong even when glued to a prefix —
 * ACCESSTOKEN, DBPASSWORD. Only words long enough to be unambiguous at the end
 * of another word are here: KEY would bring MONKEY and TURKEY back.
 */
const STRONG_SUFFIX = /(?:PASSWORD|PASSWD|SECRET|TOKEN|PASSPHRASE)$/;

type KeyStrength = 'none' | 'weak' | 'strong';

function keyStrength(key: string): KeyStrength {
  const segments = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toUpperCase()
    .split(/[_.-]+/)
    .filter(segment => segment !== '');

  const strong = segments.some((segment, i) =>
    STRONG_SEGMENTS.has(segment)
    || STRONG_SUFFIX.test(segment)
    || STRONG_PAIRS.some(([first, second]) => segment === first && segments[i + 1] === second));
  if (strong) return 'strong';
  return segments.some(segment => SECRET_SEGMENTS.has(segment)) ? 'weak' : 'none';
}

/**
 * Characters a generated credential is drawn from. Used only where the value
 * could equally be code — a `:` member or annotation, a merely suspicious key —
 * because `Map<string`, `Array<string>` and `() => void` fall outside it. Under
 * a key that names a credential outright the charset proves nothing:
 * `Tr0ub4dor&3#x` is exactly what a person types.
 */
const VALUE_CHARSET = /^[A-Za-z0-9._~+/=:@-]+$/;

/** Marks of a generated secret rather than a word: digits and token punctuation. */
const TOKEN_SHAPE = /[0-9_~+/=-]/;

/**
 * What `key = value` looks like when it is code rather than configuration:
 * `password = getpass()`, `PASSWORD = os.environ["PASSWORD"]`. Applied only
 * when the `=` is spaced, because an env file never spaces it and a password
 * with a bracket in it is still a password there.
 */
const EXPRESSION_SHAPE = /[()[\]{}<>]/;

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
    // rule would otherwise chew on one line at a time. A block cut off before
    // its END fence is still a key, and nothing says where its body stops, so
    // it runs to the end of the text: losing the rest of a paste is cheaper
    // than writing one line of a private key.
    id: 'private-key',
    pattern:
      /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----([\s\S]*?)(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|$)/dg,
    group: 1,
    name: () => 'PRIVATE_KEY',
  },
  ...PROVIDER_KEYS.map(provider => ({
    id: provider.id,
    pattern: provider.pattern,
    group: 1,
    name: () => provider.name,
  })),
  {
    // scheme://user:password@host — only the password is removed, because the
    // host and the user are usually the point of pasting the string at all.
    // The password runs to the last `@` before whitespace, `?` or `#`: an
    // unencoded `@` or `/` in it is common, and stopping at the first one wrote
    // the rest to disk. The user may be empty, as in redis://:password@host.
    // The search for that `@` stops at the next `://`; without the stop, text
    // repeating `a://b:` with no `@` rescans to its end from every scheme.
    id: 'connection-string',
    pattern: /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*):\/\/([^\s:/@]*):((?:(?!:\/\/)[^\s?#])+)@/dgi,
    group: 3,
    name: match => `${toVarName(match[1] ?? '')}_PASSWORD`,
    // `http://localhost:3000/@vite/client` has the same shape: a port, a path,
    // and an `@` in the path. A password that is a port number followed by a
    // path is that, not a password.
    accept: match => !/^\d{1,5}\//.test(match[3] ?? ''),
  },
  {
    id: 'bearer',
    pattern: /\b(?:Bearer|Token)\s+([A-Za-z0-9._~+/=-]{16,})/dgi,
    group: 1,
    name: () => 'BEARER_TOKEN',
  },
];

/**
 * `KEY=value` and `"key": "value"` alike, up to the start of the value. Groups:
 * 1 opening key quote, 2 key, 3 spacing before the separator, 4 separator,
 * 5 spacing after it.
 *
 * The lookbehind is the linearity guarantee: without it a run of letters with
 * no separator is retried as a key from every one of its offsets, which is
 * quadratic — 40 000 letters took two seconds. Leading dashes stay outside the
 * key so `--password=…` still matches.
 *
 * The spacing is [ \t]* rather than \s*, and that is not cosmetic: \s matches a
 * newline, so in YAML the pair `database:` would reach across the line break
 * and swallow the `password` key underneath it as its own value. A key and its
 * value are on one line.
 *
 * The value is read by `readValue` rather than by this pattern, because only a
 * credential-shaped key earns a value at all, and a rejected pair must leave
 * the scan inside its value — `?api_key=…` sits inside a URL's value.
 */
const ASSIGNMENT_HEAD = /(["']?)(?<![A-Za-z0-9_.-])-{0,2}([A-Za-z_][A-Za-z0-9_.-]*)\1([ \t]*)([:=])([ \t]*)/g;

const QUOTES = new Set(['"', "'", '`']);
const WHITESPACE = /\s/;
/** A `"` followed by one of these closes a JSON string rather than sitting in a value. */
const JSON_CLOSER = /[\s,}\]:]/;
/** Wrapping that sits around a value in prose and code, never part of it. */
const LEADING_WRAP = new Set(['"', "'", '`']);
const TRAILING_WRAP = new Set(['`', ')', ']', '}', ',', ';', '.', '"', "'"]);

interface ValueSpan {
  start: number;
  end: number;
  /** Where the construct ends, closing quote included. */
  constructEnd: number;
  quoted: boolean;
}

/**
 * Read the value that starts at `from`.
 *
 * Quoted, it is everything up to the matching quote on the same line, spaces
 * included. Unquoted, it is the whole run up to whitespace, minus wrapping at
 * its edges — `(DB_PASSWORD=hunter22)`. The run does not stop at `;` or `,`:
 * it did once, and the part after the punctuation reached the file.
 */
function readValue(text: string, from: number): ValueSpan | null {
  const opening = text[from];
  if (opening !== undefined && QUOTES.has(opening)) {
    for (let i = from + 1; i < text.length; i += 1) {
      const c = text[i];
      if (c === '\n' || c === '\r') break;
      if (c === '\\' && text[i + 1] !== '\n' && text[i + 1] !== '\r') {
        i += 1;
        continue;
      }
      if (c === opening) return { start: from + 1, end: i, constructEnd: i + 1, quoted: true };
    }
    // Unclosed: read it as a run, and the trim below drops the stray quote.
  }

  let end = from;
  while (end < text.length) {
    const c = text[end] ?? '';
    if (WHITESPACE.test(c)) break;
    if (c === '\\') {
      end += WHITESPACE.test(text[end + 1] ?? ' ') ? 1 : 2;
      continue;
    }
    // In a JSON transcript the value of `"text":"DB_PASSWORD=x"` ends at the
    // string's closing quote; running past it would take the next field too.
    if (c === '"' && JSON_CLOSER.test(text[end + 1] ?? ' ')) break;
    end += 1;
  }
  const constructEnd = Math.min(end, text.length);

  let start = from;
  while (start < end && LEADING_WRAP.has(text[start] ?? '')) start += 1;
  while (end > start && TRAILING_WRAP.has(text[end - 1] ?? '')) end -= 1;
  return start < end ? { start, end, constructEnd, quoted: false } : null;
}

/**
 * Decide whether a `key <sep> value` pair is a credential.
 *
 * The separator carries most of the signal. `=` is env-file syntax, where a
 * credential-shaped key means what it says. `:` is also how every typed
 * language writes an annotation and every object writes a member, so
 * `token: string` and `keys: frontmatter.keys.size` reach this function looking
 * exactly like a secret. For `:` the key must therefore name a credential
 * outright, and the value must look generated rather than written.
 *
 * Every test here judges the whole value. None of them may shorten it: a value
 * that is a credential is removed whole, and one that is not is left whole.
 */
function isCredentialAssignment(
  strength: KeyStrength,
  separator: string,
  spaced: boolean,
  value: string,
  quoted: boolean,
): boolean {
  if (strength === 'none') return false;
  // An earlier pass already did this; a placeholder is not a second secret.
  if (value.startsWith(PLACEHOLDER_PREFIX)) return false;
  // `==`, `===`, `=>`, `:=` — an operator, not a value.
  if (/^[=>]/.test(value)) return false;

  const strong = strength === 'strong';
  if (value.length < (strong ? MIN_VALUE_LENGTH_STRONG : MIN_VALUE_LENGTH)) return false;

  if (separator === ':') {
    if (!strong) return false;
    if (WHITESPACE.test(value)) return false;
    if (!quoted && !VALUE_CHARSET.test(value)) return false;
    return TOKEN_SHAPE.test(value) || value.length >= MIN_COLON_VALUE_LENGTH;
  }

  if (!strong) return VALUE_CHARSET.test(value);
  if (!spaced) return true;

  // Spaced `=` is how code assigns. A quoted fragment with an edge space is a
  // string being concatenated — `token = 'Bearer ' + value`.
  if (quoted) return value.trim() === value;
  return !EXPRESSION_SHAPE.test(value);
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
      const span = match.indices?.[rule.group];
      if (span === undefined || span[0] === span[1]) continue;
      if (PLACEHOLDER_PATTERN.test(text.slice(span[0], span[1]).trim())) continue;

      const matchIndex = match.index;
      const matchEnd = matchIndex + match[0].length;
      if (overlapsClaimed(matchIndex, matchEnd)) continue;
      if (rule.accept && !rule.accept(match)) continue;

      claimed.push([matchIndex, matchEnd]);
      hits.push({ name: rule.name(match), index: span[0], length: span[1] - span[0], matchIndex });
    }
  }

  const head = new RegExp(ASSIGNMENT_HEAD.source, ASSIGNMENT_HEAD.flags);
  for (let match = head.exec(text); match !== null; match = head.exec(text)) {
    const key = match[2] ?? '';
    const strength = keyStrength(key);
    if (strength === 'none') continue;

    const value = readValue(text, match.index + match[0].length);
    if (value === null) continue;

    const spaced = (match[3] ?? '') !== '' || (match[5] ?? '') !== '';
    const content = text.slice(value.start, value.end);
    if (!isCredentialAssignment(strength, match[4] ?? '', spaced, content, value.quoted)) continue;
    if (overlapsClaimed(match.index, value.constructEnd)) continue;

    claimed.push([match.index, value.constructEnd]);
    hits.push({
      name: toVarName(key),
      index: value.start,
      length: value.end - value.start,
      matchIndex: match.index,
    });
    head.lastIndex = value.constructEnd;
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
