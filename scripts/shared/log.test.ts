import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createLogger,
  formatLine,
  resolveLevel,
  DEFAULT_LEVEL,
  LEVELS,
  type LogLevel,
} from './log.ts';

/** Collect lines instead of writing them, so a test never pollutes stderr. */
function sink(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line: string) => { lines.push(line); } };
}

test('resolveLevel accepts every known level, case-insensitively', () => {
  for (const level of Object.keys(LEVELS) as LogLevel[]) {
    assert.equal(resolveLevel(level), level);
    assert.equal(resolveLevel(level.toLowerCase()), level);
    assert.equal(resolveLevel(`  ${level}  `), level);
  }
});

test('resolveLevel falls back to INFO for unknown, empty and missing values', () => {
  assert.equal(resolveLevel('TRACE'), DEFAULT_LEVEL);
  assert.equal(resolveLevel(''), DEFAULT_LEVEL);
  assert.equal(resolveLevel('   '), DEFAULT_LEVEL);
  assert.equal(resolveLevel(undefined), DEFAULT_LEVEL);
  assert.equal(DEFAULT_LEVEL, 'INFO');
});

test('resolveLevel does not resolve inherited object properties', () => {
  // "constructor" and "toString" live on Object.prototype, so a membership
  // test using `in` would accept them as levels and then index undefined.
  assert.equal(resolveLevel('constructor'), DEFAULT_LEVEL);
  assert.equal(resolveLevel('toString'), DEFAULT_LEVEL);
});

test('formatLine produces the exact documented shape', () => {
  assert.equal(
    formatLine('ERROR', 'spec-integrity', 'gates', 'gate G1 runs after unknown phase'),
    'ERROR [spec-integrity.gates] gate G1 runs after unknown phase\n',
  );
  assert.equal(
    formatLine('INFO', 'bundle', 'links', 'links checked', { count: 12 }),
    'INFO [bundle.links] links checked {"count":12}\n',
  );
});

test('a logger writes the same shape through its level helpers', () => {
  const { lines, write } = sink();
  const log = createLogger('state', { level: 'DEBUG', write });

  log.debug('validate', 'entering', { runId: 'r-1' });
  log.info('validate', 'fields checked', { count: 15 });
  log.warn('validate', 'field is stale');
  log.error('validate', 'unknown field', { field: 'mode' });

  assert.deepEqual(lines, [
    'DEBUG [state.validate] entering {"runId":"r-1"}\n',
    'INFO [state.validate] fields checked {"count":15}\n',
    'WARN [state.validate] field is stale\n',
    'ERROR [state.validate] unknown field {"field":"mode"}\n',
  ]);
});

test('the floor suppresses everything below it and nothing above it', () => {
  const { lines, write } = sink();
  const log = createLogger('bundle', { level: 'WARN', write });

  log.debug('links', 'invisible');
  log.info('links', 'invisible');
  log.warn('links', 'visible');
  log.error('links', 'visible');

  assert.deepEqual(lines, [
    'WARN [bundle.links] visible\n',
    'ERROR [bundle.links] visible\n',
  ]);
});

test('ERROR as a floor still lets errors through', () => {
  const { lines, write } = sink();
  const log = createLogger('redact', { level: 'ERROR', write });

  log.warn('scan', 'invisible');
  log.error('scan', 'visible');

  assert.deepEqual(lines, ['ERROR [redact.scan] visible\n']);
});

test('the level is read from LOG_LEVEL once, at creation', () => {
  const original = process.env['LOG_LEVEL'];
  try {
    process.env['LOG_LEVEL'] = 'debug';
    const { lines, write } = sink();
    const log = createLogger('paths', { write });
    assert.equal(log.level, 'DEBUG');

    // Changing the environment afterwards must not change this logger.
    process.env['LOG_LEVEL'] = 'ERROR';
    log.debug('build', 'still visible');
    assert.deepEqual(lines, ['DEBUG [paths.build] still visible\n']);
  } finally {
    if (original === undefined) delete process.env['LOG_LEVEL'];
    else process.env['LOG_LEVEL'] = original;
  }
});

test('an unknown LOG_LEVEL leaves the logger at INFO', () => {
  const original = process.env['LOG_LEVEL'];
  try {
    process.env['LOG_LEVEL'] = 'chatty';
    const { lines, write } = sink();
    const log = createLogger('gates', { write });

    assert.equal(log.level, 'INFO');
    log.debug('g1', 'invisible');
    log.info('g1', 'visible');
    assert.deepEqual(lines, ['INFO [gates.g1] visible\n']);
  } finally {
    if (original === undefined) delete process.env['LOG_LEVEL'];
    else process.env['LOG_LEVEL'] = original;
  }
});
