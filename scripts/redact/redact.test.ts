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
