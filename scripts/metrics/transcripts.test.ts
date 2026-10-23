import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  SENTINEL, assistantLine, callLines, dispatchResultLine, userLine, writeSession, writeSubagent,
} from './fixtures/transcripts.ts';
import {
  DEFAULT_RATIOS, MAPPED_HOST_VERSION, TranscriptsUnavailableError, defaultLogDir, ratiosFor, readTranscripts, unitsOf,
  type Context, type Transcripts,
} from './transcripts.ts';

async function withLogDir(body: (logDir: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-transcripts-'));
  try {
    await body(path.join(root, 'logs'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const callCount = (transcripts: Transcripts): number =>
  transcripts.contexts.reduce((total, context) => total + context.calls.length, 0);

const only = (transcripts: Transcripts, predicate: (context: Context) => boolean): Context => {
  const found = transcripts.contexts.filter(predicate);
  assert.equal(found.length, 1, `expected one matching context, found ${found.length}`);
  return found[0] as Context;
};

const USAGE = { input: 10, write5m: 1000, read: 5000, output: 200 };

test('one call written over three lines with identical usage counts once, where a sum over lines would triple it', async () => {
  await withLogDir(async logDir => {
    await writeSession(logDir, 'session-a', [userLine('2026-10-23T10:00:00Z'), ...callLines({ id: 'msg_1', at: '2026-10-23T10:00:01Z', usage: USAGE })]);
    const transcripts = await readTranscripts(logDir);

    assert.equal(callCount(transcripts), 1);
    assert.equal(transcripts.duplicateLines, 2);
    const call = only(transcripts, context => context.kind === 'main').calls[0];
    assert.ok(call);
    assert.equal(call.usage.output, 200);
    assert.equal(call.contextTokens, 6010);

    const counted = unitsOf(call.usage, call.model);
    const perLineSum = 3 * counted;
    assert.equal(counted, 10 + 1000 * 1.25 + 5000 * 0.05 + 200 * 5);
    assert.equal(perLineSum / counted, 3);
  });
});

test('the same call replayed into a resumed session\'s file counts once and stays with the first session', async () => {
  await withLogDir(async logDir => {
    const call = assistantLine({ id: 'msg_1', at: '2026-10-23T10:00:01Z', usage: USAGE });
    await writeSession(logDir, 'a-original', [call]);
    await writeSession(logDir, 'b-resumed', [call, assistantLine({ id: 'msg_2', at: '2026-10-23T11:00:00Z', usage: USAGE })]);
    const transcripts = await readTranscripts(logDir);

    assert.equal(callCount(transcripts), 2);
    assert.deepEqual(only(transcripts, context => context.sessionId === 'a-original').calls.map(c => c.messageId), ['msg_1']);
    assert.deepEqual(only(transcripts, context => context.sessionId === 'b-resumed').calls.map(c => c.messageId), ['msg_2']);
  });
});

test('a call\'s usage is taken from its last record when its lines differ', async () => {
  await withLogDir(async logDir => {
    await writeSession(logDir, 'session-a', [
      assistantLine({ id: 'msg_1', at: '2026-10-23T10:00:01Z', usage: { ...USAGE, output: 5 } }),
      assistantLine({ id: 'msg_1', at: '2026-10-23T10:00:09Z', usage: { ...USAGE, output: 321 } }),
    ]);
    const call = only(await readTranscripts(logDir), context => context.kind === 'main').calls[0];
    assert.equal(call?.usage.output, 321);
    assert.equal(call?.at, '2026-10-23T10:00:01Z');
  });
});

test('a subagent\'s description comes from its meta file, else from the parent\'s dispatch result, else it has none', async () => {
  await withLogDir(async logDir => {
    await writeSession(logDir, 'session-a', [dispatchResultLine('a2', 'maestro:reviewer 02', '2026-10-23T10:00:00Z')]);
    const line = (id: string, agentId: string): string =>
      assistantLine({ id, at: '2026-10-23T10:01:00Z', sidechain: true, agentId, usage: USAGE });
    await writeSubagent(logDir, 'session-a', 'a1', [line('msg_1', 'a1')], 'maestro:executor 01');
    await writeSubagent(logDir, 'session-a', 'a2', [line('msg_2', 'a2')]);
    await writeSubagent(logDir, 'session-a', 'a3', [line('msg_3', 'a3')]);
    const transcripts = await readTranscripts(logDir);

    const byAgent = (agentId: string): Context => only(transcripts, context => context.agentId === agentId);
    assert.deepEqual([byAgent('a1').description, byAgent('a1').descriptionSource], ['maestro:executor 01', 'meta']);
    assert.deepEqual([byAgent('a2').description, byAgent('a2').descriptionSource], ['maestro:reviewer 02', 'tool-result']);
    assert.deepEqual([byAgent('a3').description, byAgent('a3').descriptionSource], [undefined, 'none']);
  });
});

test('an unparsable line is counted with its position and the rest of the file is still read', async () => {
  await withLogDir(async logDir => {
    const file = await writeSession(logDir, 'session-a', [
      assistantLine({ id: 'msg_1', at: '2026-10-23T10:00:01Z', usage: USAGE }),
      '{"type":"assistant", truncated',
      assistantLine({ id: 'msg_2', at: '2026-10-23T10:00:02Z', usage: USAGE }),
    ]);
    const transcripts = await readTranscripts(logDir);
    assert.deepEqual(transcripts.unparsed, [{ file, line: 2 }]);
    assert.equal(callCount(transcripts), 2);
  });
});

test('an assistant record without usage is counted as unparsed, never as a free call', async () => {
  await withLogDir(async logDir => {
    const broken = JSON.parse(assistantLine({ id: 'msg_1', at: '2026-10-23T10:00:01Z' })) as { message: Record<string, unknown> };
    delete broken.message['usage'];
    const file = await writeSession(logDir, 'session-a', [JSON.stringify(broken)]);
    const transcripts = await readTranscripts(logDir);
    assert.deepEqual(transcripts.unparsed, [{ file, line: 1 }]);
    assert.equal(callCount(transcripts), 0);
  });
});

test('the host\'s own synthetic messages are excluded and counted, not taken for model calls', async () => {
  await withLogDir(async logDir => {
    await writeSession(logDir, 'session-a', [
      assistantLine({ id: 'local-1', at: '2026-10-23T10:00:01Z', model: '<synthetic>' }),
      assistantLine({ id: 'msg_1', at: '2026-10-23T10:00:02Z', usage: USAGE }),
    ]);
    const transcripts = await readTranscripts(logDir);
    assert.equal(transcripts.syntheticRecords, 1);
    assert.equal(callCount(transcripts), 1);
  });
});

test('a subagent written inline into its parent\'s file gets a context of its own', async () => {
  await withLogDir(async logDir => {
    await writeSession(logDir, 'session-a', [
      assistantLine({ id: 'msg_1', at: '2026-10-23T10:00:01Z', usage: USAGE }),
      assistantLine({ id: 'msg_2', at: '2026-10-23T10:00:02Z', usage: USAGE, sidechain: true, agentId: 'old' }),
    ]);
    const transcripts = await readTranscripts(logDir);
    assert.equal(only(transcripts, context => context.kind === 'main').calls.length, 1);
    const inline = only(transcripts, context => context.inlineSidechain);
    assert.deepEqual([inline.agentId, inline.calls.length], ['old', 1]);
  });
});

test('a record without the 5m/1h split counts every write as 5-minute and says so', async () => {
  await withLogDir(async logDir => {
    await writeSession(logDir, 'session-a', [assistantLine({ id: 'msg_1', at: '2026-10-23T10:00:01Z', usage: { write5m: 400, noSplit: true } })]);
    const call = only(await readTranscripts(logDir), context => context.kind === 'main').calls[0];
    assert.deepEqual([call?.usage.cacheWrite5m, call?.usage.cacheWrite1h, call?.usage.writeSplit], [400, 0, false]);
  });
});

test('a missing log directory is refused with its path, and an empty one measures zero', async () => {
  await withLogDir(async logDir => {
    await assert.rejects(readTranscripts(logDir), (error: unknown) =>
      error instanceof TranscriptsUnavailableError && error.logDir === logDir);
    await writeSession(logDir, 'unused', []);
    await rm(path.join(logDir, 'unused.jsonl'));
    const transcripts = await readTranscripts(logDir);
    assert.deepEqual([transcripts.contexts.length, transcripts.unparsed.length], [0, 0]);
  });
});

test('a log path that is a file is refused, not read as an empty directory', async () => {
  await withLogDir(async logDir => {
    await writeSession(logDir, 'session-a', []);
    const file = path.join(logDir, 'session-a.jsonl');
    await assert.rejects(readTranscripts(file), TranscriptsUnavailableError);
  });
});

test('the host versions seen are reported, the mapped one among them', async () => {
  await withLogDir(async logDir => {
    await writeSession(logDir, 'session-a', [
      assistantLine({ id: 'msg_1', at: '2026-10-23T10:00:01Z', usage: USAGE }),
      assistantLine({ id: 'msg_2', at: '2026-10-23T10:00:02Z', usage: USAGE, version: '9.9.9' }),
    ]);
    assert.deepEqual((await readTranscripts(logDir)).hostVersions, [MAPPED_HOST_VERSION, '9.9.9'].sort());
  });
});

test('the default log directory encodes every character outside letters and digits as a dash', () => {
  assert.equal(
    defaultLogDir('/Users/a.b/My_project dir', {}, '/home/u'),
    path.join('/home/u/.claude/projects', '-Users-a-b-My-project-dir'),
  );
  assert.equal(
    defaultLogDir('/Users/alex/Projects/My/maestro', { CLAUDE_CONFIG_DIR: '/cfg' }, '/home/u'),
    path.join('/cfg/projects', '-Users-alex-Projects-My-maestro'),
  );
});

test('the cache read is priced per model and everything else is the same multiple', () => {
  assert.equal(ratiosFor('claude-opus-5-5').cacheRead, 0.05);
  assert.equal(ratiosFor('claude-fable-5-1').cacheRead, 0.025);
  assert.equal(ratiosFor('claude-mythos-5-1').cacheRead, 0.025);
  assert.equal(ratiosFor('claude-sonnet-5-5').cacheRead, 0.1);
  assert.deepEqual({ ...ratiosFor('claude-opus-5-5'), cacheRead: DEFAULT_RATIOS.cacheRead }, DEFAULT_RATIOS);
});

test('nothing a session said survives the parse', async () => {
  await withLogDir(async logDir => {
    await writeSession(logDir, 'session-a', [
      userLine('2026-10-23T10:00:00Z'),
      ...callLines({ id: 'msg_1', at: '2026-10-23T10:00:01Z', usage: USAGE }),
      dispatchResultLine('a1', 'maestro:executor 01', '2026-10-23T10:00:02Z'),
    ]);
    await writeSubagent(logDir, 'session-a', 'a1', [
      assistantLine({ id: 'msg_2', at: '2026-10-23T10:01:00Z', sidechain: true, agentId: 'a1', usage: USAGE, block: 'tool_use' }),
    ]);
    await appendFile(path.join(logDir, 'session-a.jsonl'), `${JSON.stringify({ type: 'summary', summary: SENTINEL })}\n`);
    await writeFile(path.join(logDir, 'notes.txt'), SENTINEL);
    const transcripts = await readTranscripts(logDir);
    assert.equal(callCount(transcripts), 2);
    assert.ok(!JSON.stringify(transcripts).includes(SENTINEL));
  });
});
