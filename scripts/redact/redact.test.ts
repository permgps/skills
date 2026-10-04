import test from 'node:test';
import assert from 'node:assert/strict';

import { redact, toVarName, PLACEHOLDER_PATTERN } from './redact.ts';

/** The one assertion every test here shares: the value is gone. */
function assertGone(result: { text: string; names: string[] }, value: string): void {
  assert.equal(result.text.includes(value), false, `value survived: ${value}`);
  for (const name of result.names) {
    assert.equal(name.includes(value), false, `value leaked into a name: ${name}`);
    assert.match(`[REDACTED:${name}]`, PLACEHOLDER_PATTERN);
  }
}

test('text with no credentials comes back byte-identical', () => {
  const input = [
    '# Landing page',
    '',
    'Три секции: герой, цены, форма. Ширина 1200px, отступ 24.',
    'Контакт: hello@example.com, https://example.com/pricing?ref=1',
    'width: 100',
    '',
  ].join('\n');

  const result = redact(input);
  assert.equal(result.text, input);
  assert.deepEqual(result.names, []);
});

test('an empty string is left alone', () => {
  assert.deepEqual(redact(''), { text: '', names: [] });
});

test('a credential-shaped assignment is replaced and named after its key', () => {
  const secret = 'p4ssw0rd-not-a-real-one';
  const result = redact(`DB_PASSWORD=${secret}\n`);

  assertGone(result, secret);
  assert.equal(result.text, '[REDACTED:DB_PASSWORD]\n'.replace('[', 'DB_PASSWORD=['));
  assert.deepEqual(result.names, ['DB_PASSWORD']);
});

test('a quoted json pair is handled like an assignment', () => {
  const secret = 'abcdef0123456789abcdef';
  const result = redact(`{ "apiKey": "${secret}" }`);

  assertGone(result, secret);
  assert.deepEqual(result.names, ['APIKEY']);
});

test('an ordinary assignment is not touched', () => {
  for (const input of ['width = 100', 'name: maestro', 'PORT=3000', 'timeout: 30']) {
    assert.deepEqual(redact(input), { text: input, names: [] });
  }
});

test('a bearer token is replaced', () => {
  const secret = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc';
  const result = redact(`Authorization: Bearer ${secret}`);

  assertGone(result, secret);
  assert.deepEqual(result.names, ['BEARER_TOKEN']);
});

test('a header value that is only a scheme word is not a secret', () => {
  // After the bearer rule runs, the assignment rule sees Authorization: Bearer.
  const result = redact('Authorization: Bearer AAAABBBBCCCCDDDDEEEE');
  assert.deepEqual(result.names, ['BEARER_TOKEN']);
  assert.equal(result.text, 'Authorization: Bearer [REDACTED:BEARER_TOKEN]');
});

test('a short value under a key that names a credential outright is still removed', () => {
  const result = redact('DB_PASSWORD=hunter2');
  assert.deepEqual(result.names, ['DB_PASSWORD']);
  assert.equal(result.text.includes('hunter2'), false);
});

test('a short value under a merely suspicious key is left alone', () => {
  assert.deepEqual(redact('AUTH_MODE=oauth'), { text: 'AUTH_MODE=oauth', names: [] });
});

test('provider keys are recognised by prefix and named by provider', () => {
  const cases: Array<[string, string]> = [
    ['sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF', 'ANTHROPIC_API_KEY'],
    ['sk-AAAABBBBCCCCDDDDEEEEFFFFGGGG', 'OPENAI_API_KEY'],
    ['ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH', 'GITHUB_TOKEN'],
    ['github_pat_AAAABBBBCCCCDDDDEEEEFFFF', 'GITHUB_TOKEN'],
    ['glpat-AAAABBBBCCCCDDDDEEEE', 'GITLAB_TOKEN'],
    ['xoxb-1234567890-AAAABBBBCCCC', 'SLACK_TOKEN'],
    ['AKIAIOSFODNN7EXAMPLE', 'AWS_ACCESS_KEY_ID'],
    ['AIzaSyAAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH', 'GOOGLE_API_KEY'],
    ['sk_live_AAAABBBBCCCCDDDDEEEE', 'STRIPE_SECRET_KEY'],
  ];

  for (const [secret, expected] of cases) {
    const result = redact(`use ${secret} for the call`);
    assertGone(result, secret);
    assert.deepEqual(result.names, [expected], `for ${expected}`);
  }
});

test('a private key block is removed whole, body and all', () => {
  const body = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ';
  const input = `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----\n`;
  const result = redact(input);

  assertGone(result, body);
  assert.deepEqual(result.names, ['PRIVATE_KEY']);
  // The fences survive, so the reader can see what kind of thing was there.
  assert.match(result.text, /BEGIN RSA PRIVATE KEY/);
});

test('a connection string loses its password and keeps its host', () => {
  const secret = 'sup3rs3cret';
  const result = redact(`postgres://appuser:${secret}@db.internal:5432/app`);

  assertGone(result, secret);
  assert.deepEqual(result.names, ['POSTGRES_PASSWORD']);
  assert.match(result.text, /appuser/);
  assert.match(result.text, /db\.internal:5432\/app/);
});

test('several different secrets are each named once, in order', () => {
  const result = redact([
    'DB_PASSWORD=first-secret-value',
    'Authorization: Bearer AAAABBBBCCCCDDDDEEEE',
    'key sk-ant-api03-ZZZZYYYYXXXXWWWWVVVV',
  ].join('\n'));

  assertGone(result, 'first-secret-value');
  assertGone(result, 'AAAABBBBCCCCDDDDEEEE');
  assertGone(result, 'sk-ant-api03-ZZZZYYYYXXXXWWWWVVVV');
  assert.deepEqual(result.names, ['DB_PASSWORD', 'BEARER_TOKEN', 'ANTHROPIC_API_KEY']);
});

test('the same name appearing twice is recorded once', () => {
  const result = redact('API_TOKEN=aaaaaaaaaaaa\nAPI_TOKEN=bbbbbbbbbbbb\n');
  assert.deepEqual(result.names, ['API_TOKEN']);
  assert.equal(result.text.includes('aaaaaaaaaaaa'), false);
  assert.equal(result.text.includes('bbbbbbbbbbbb'), false);
});

test('redaction is idempotent — a placeholder is not a second secret', () => {
  const once = redact('DB_PASSWORD=first-secret-value');
  const twice = redact(once.text);

  assert.equal(twice.text, once.text);
  assert.deepEqual(twice.names, []);
});

test('a provider key inside an assignment is named after the provider, once', () => {
  const secret = 'sk-ant-api03-QQQQWWWWEEEERRRRTTTT';
  const result = redact(`ANTHROPIC_API_KEY=${secret}`);

  assertGone(result, secret);
  assert.deepEqual(result.names, ['ANTHROPIC_API_KEY']);
});

test('toVarName produces a name a placeholder can carry', () => {
  assert.equal(toVarName('db.password'), 'DB_PASSWORD');
  assert.equal(toVarName('  api-key  '), 'API_KEY');
  assert.equal(toVarName('!!!'), 'SECRET');
  assert.equal(toVarName(''), 'SECRET');
});

// --- regression: pasted code must survive redaction --------------------------

test('a TypeScript type annotation is not a credential', () => {
  // Reported by /aif-review: `keys` matches KEY and `Map<string` is longer than
  // the eight-character floor, so a pasted interface came back mangled.
  const source = [
    'export interface Frontmatter {',
    '  keys: Map<string, string>;',
    '  token: string;',
    '  secrets: Array<string>;',
    '}',
  ].join('\n');

  assert.deepEqual(redact(source), { text: source, names: [] });
});

test('a real credential inside a fenced code block is still removed', () => {
  // The mirror of the test above: a fenced block is exactly where somebody
  // pastes an .env file, so fences must not become a hiding place.
  const source = '```\nDB_PASSWORD=s3cr3t-value-here\n```\n';
  const result = redact(source);

  assert.equal(result.text.includes('s3cr3t-value-here'), false);
  assert.deepEqual(result.names, ['DB_PASSWORD']);
});

test('a YAML password written with a colon is still removed', () => {
  // The mirror of the type-annotation test: `:` must not become a blind spot.
  const result = redact('database:\n  password: correcthorsebatterystaple\n');

  assert.equal(result.text.includes('correcthorsebatterystaple'), false);
  assert.deepEqual(result.names, ['PASSWORD']);
});

test('a colon value that is short but obviously generated is removed', () => {
  const result = redact('api_key: a1b2c3d4');
  assert.equal(result.text.includes('a1b2c3d4'), false);
  assert.deepEqual(result.names, ['API_KEY']);
});

test('a member expression under a credential-shaped key survives', () => {
  // `keys` matches KEY but does not name a credential outright, and
  // `frontmatter.keys.size` is written rather than generated.
  const source = "log.info('frontmatter', 'checked', { keys: frontmatter.keys.size });";
  assert.deepEqual(redact(source), { text: source, names: [] });
});

test('two secrets on adjacent lines are both removed and both named', () => {
  const result = redact('DB_PASSWORD=first-secret-value\nAPI_TOKEN=second-secret-val\n');

  assert.equal(result.text.includes('first-secret-value'), false);
  assert.equal(result.text.includes('second-secret-val'), false);
  assert.deepEqual(result.names, ['DB_PASSWORD', 'API_TOKEN']);
});

test('CRLF line endings survive redaction unchanged', () => {
  const result = redact('line one\r\nDB_PASSWORD=s3cr3t-value-here\r\nline three\r\n');

  assert.equal(result.text.includes('s3cr3t-value-here'), false);
  // The carriage returns are not part of the value and must still be there.
  assert.equal(result.text, 'line one\r\nDB_PASSWORD=[REDACTED:DB_PASSWORD]\r\nline three\r\n');
});

test('a secret on the last line without a trailing newline is removed', () => {
  const result = redact('notes\nDB_PASSWORD=s3cr3t-value-here');

  assert.equal(result.text, 'notes\nDB_PASSWORD=[REDACTED:DB_PASSWORD]');
  assert.deepEqual(result.names, ['DB_PASSWORD']);
});

// --- regression: the assignment rule must stay linear -------------------------

/** Wall-clock time of one redaction, in milliseconds. */
function timeRedaction(input: string): number {
  const started = performance.now();
  redact(input);
  return performance.now() - started;
}

test('a long run of identifier characters is redacted in linear time', () => {
  // Reported by review: with no left anchor the assignment rule restarted the
  // key at every offset, and 40 000 letters took two seconds.
  const elapsed = timeRedaction('a'.repeat(200_000));
  assert.ok(elapsed < 200, `took ${Math.round(elapsed)} ms`);
});

test('a long base64url line is redacted in linear time', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let line = '';
  let seed = 7;
  for (let i = 0; i < 200_000; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    line += alphabet[seed % alphabet.length];
  }

  const elapsed = timeRedaction(line);
  assert.ok(elapsed < 200, `took ${Math.round(elapsed)} ms`);
});

// --- regression: values the old rules cut short or never saw ------------------

/** Redacted under `name`, and no trace of `secret` anywhere in the output. */
function assertRemoved(input: string, secret: string, name: string): void {
  const result = redact(input);
  assertGone(result, secret);
  assert.ok(result.names.includes(name), `expected ${name}, got [${result.names.join(', ')}]`);
}

test('a password wrapped in backticks or parentheses is removed without its wrapper leaking it', () => {
  assertRemoved('Set `DB_PASSWORD=hunter22` in env', 'hunter22', 'DB_PASSWORD');
  assertRemoved('(DB_PASSWORD=hunter22)', 'hunter22', 'DB_PASSWORD');
});

test('a password made of punctuation is removed whole, whatever its characters', () => {
  assertRemoved('DB_PASSWORD=hunter2!', 'hunter2', 'DB_PASSWORD');
  assertRemoved('DB_PASSWORD=Tr0ub4dor&3#x', 'Tr0ub4dor', 'DB_PASSWORD');
  assertRemoved('DB_PASSWORD=Tr0ub4dor&3#x', '&3#x', 'DB_PASSWORD');
  assertRemoved('{"password": "S3cr3t!pass"}', 'S3cr3t', 'PASSWORD');
  assertRemoved('{"password": "S3cr3t!pass"}', '!pass', 'PASSWORD');
});

test('a quoted password keeps its spaces inside the redaction', () => {
  const result = redact('PASSWORD="correct horse battery staple"');
  for (const word of ['correct', 'horse', 'battery', 'staple']) assertGone(result, word);
  assert.deepEqual(result.names, ['PASSWORD']);
});

test('a semicolon inside an unquoted password does not split it', () => {
  // The old value class stopped at `;`, so the tail after it reached the file.
  assertRemoved('DB_PASSWORD=abcdef;ghij', 'ghij', 'DB_PASSWORD');
  assertRemoved('DB_PASSWORD=abc;defghij', 'defghij', 'DB_PASSWORD');
});

test('a connection string password containing @ or / is removed whole', () => {
  assert.deepEqual(redact('postgres://admin:p@ss@db.example/x'), {
    text: 'postgres://admin:[REDACTED:POSTGRES_PASSWORD]@db.example/x',
    names: ['POSTGRES_PASSWORD'],
  });
  assert.deepEqual(redact('postgres://admin:pa/ss123@db.example/x'), {
    text: 'postgres://admin:[REDACTED:POSTGRES_PASSWORD]@db.example/x',
    names: ['POSTGRES_PASSWORD'],
  });
});

test('a connection string with a password and no user loses the password', () => {
  assert.deepEqual(redact('redis://:s3cretpass@cache:6379'), {
    text: 'redis://:[REDACTED:REDIS_PASSWORD]@cache:6379',
    names: ['REDIS_PASSWORD'],
  });
});

test('a bare JWT is removed', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  assertRemoved(`the session token was ${jwt} yesterday`, jwt, 'JWT');
  assertRemoved(`the session token was ${jwt} yesterday`, 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', 'JWT');
});

test('a PGP private key block is removed whole, body and all', () => {
  const body = 'lQOYBF0A1B2C3D4E5F6G7H8I9J0KLMNOPQRSTUVWXYZabcdef';
  const input = `-----BEGIN PGP PRIVATE KEY BLOCK-----\n\n${body}\n=AbCd\n-----END PGP PRIVATE KEY BLOCK-----\n`;
  assertRemoved(input, body, 'PRIVATE_KEY');
});

test('a private key with no END fence still loses its body', () => {
  const body = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ';
  assertRemoved(`-----BEGIN RSA PRIVATE KEY-----\n${body}\n${body}\n`, body, 'PRIVATE_KEY');
});

// Built from parts, like the tokens above: a whole token-shaped literal in the
// source is refused by the remote's secret scanning, fake or not.
test('a Slack app token and a Slack webhook URL are removed', () => {
  const app = ['xapp', '1', 'A0123456789', '1234567890123', 'abcdef0123456789'.repeat(4)].join('-');
  assertRemoved(`token: ${app}`, app, 'SLACK_TOKEN');
  assertRemoved(`token: ${app}`, 'abcdef0123456789abcdef', 'SLACK_TOKEN');

  const hook = ['https://hooks.slack.com/services', 'T00000000', 'B00000000', 'X'.repeat(24)].join('/');
  assertRemoved(`post to ${hook} when done`, 'XXXXXXXXXXXXXXXXXXXXXXXX', 'SLACK_WEBHOOK_URL');
});

test('an npm token is removed', () => {
  const token = `npm_${'a1B2c3D4e5'.repeat(3)}abcdef`;
  assert.equal(token.length, 40);
  assertRemoved(`//registry.npmjs.org/:_authToken=${token}`, token, 'NPM_TOKEN');
  assertRemoved(`use ${token} to publish`, token, 'NPM_TOKEN');
});

// --- regression: no new false positives, because S2 stops the run -------------

test('a key that only contains a credential word inside a longer word is not a credential', () => {
  // The strong-key test was a substring test, so AUTHOR matched AUTH and
  // MONKEY matched KEY — and in the sweep a false positive is a stop.
  for (const input of ['AUTHOR=JohnSmith1', 'MONKEY_NAME=bananas123']) {
    assert.deepEqual(redact(input), { text: input, names: [] });
  }
});

test('an ordinary URL and ordinary prose are left byte-identical', () => {
  for (const input of [
    'https://example.com/path?x=1',
    'a = b + c',
    'ratio: 3',
    'open http://localhost:3000/@vite/client in the browser',
  ]) {
    assert.deepEqual(redact(input), { text: input, names: [] });
  }
});

test('code that fetches a credential is not itself a credential', () => {
  for (const input of [
    'password = getpass()',
    'PASSWORD = os.environ["PASSWORD"]',
    'token := getToken()',
    "if (token === '') return;",
    'const handler = token => token.trim();',
  ]) {
    assert.deepEqual(redact(input), { text: input, names: [] });
  }
});

// --- regression: a provider token is named after its provider -----------------

test('a GitHub token sent as an Authorization token is named GITHUB_TOKEN', () => {
  const token = `ghp_${'A1b2C3d4E5f6'.repeat(3)}`;
  assert.equal(token.length, 40);
  const result = redact(`Authorization: token ${token}`);
  assertGone(result, token);
  assert.deepEqual(result.names, ['GITHUB_TOKEN']);
});

test('an Anthropic key sent as a bearer token is named ANTHROPIC_API_KEY', () => {
  const key = 'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF';
  const result = redact(`Authorization: Bearer ${key}`);
  assertGone(result, key);
  assert.deepEqual(result.names, ['ANTHROPIC_API_KEY']);
});
