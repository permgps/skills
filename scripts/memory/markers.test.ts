import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  BEGIN_MARKER,
  END_MARKER,
  MEMORY_FILE,
  MarkerError,
  findBlock,
  renderBlock,
  spliceBlock,
  writeMemoryBlock,
} from './markers.ts';

const wrap = (body: string): string => `${BEGIN_MARKER}\n${body}\n${END_MARKER}`;

async function withDir(body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'memory-markers-'));
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('findBlock returns null for a file with no markers', () => {
  assert.equal(findBlock(''), null);
  assert.equal(findBlock('# Project\n\nSome notes the user wrote.\n'), null);
});

test('findBlock locates the block and its body', () => {
  const text = `# Project\n\n${wrap('One fact.\nAnother.')}\n\nTrailing user text.\n`;
  const block = findBlock(text);
  assert.ok(block);
  assert.equal(block.start, 3);
  assert.equal(block.end, 6);
  assert.equal(block.body, 'One fact.\nAnother.');
});

test('a marker inside a sentence is not a marker', () => {
  const text = `The block is opened by ${BEGIN_MARKER} and closed by ${END_MARKER}.\n`;
  assert.equal(findBlock(text), null);
});

test('malformed markers are an error, never a guess', () => {
  const cases: Array<[string, string, number[]]> = [
    [`${BEGIN_MARKER}\nbody\n`, 'begin marker with no end marker', [1]],
    [`body\n${END_MARKER}\n`, 'end marker with no begin marker', [2]],
    [`${END_MARKER}\nbody\n${BEGIN_MARKER}\n`, 'end marker precedes begin marker', [3, 1]],
    [`${wrap('a')}\n${wrap('b')}\n`, 'more than one begin marker', [1, 4]],
  ];

  for (const [text, message, lines] of cases) {
    assert.throws(() => findBlock(text), (error: unknown) => {
      assert.ok(error instanceof MarkerError, `${message}: wrong error type`);
      assert.match(error.message, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.deepEqual(error.lines, lines);
      return true;
    });
  }
});

test('renderBlock trims the body it was handed and keeps an empty one legal', () => {
  assert.equal(renderBlock('\n\nfact\n\n'), wrap('fact'));
  assert.equal(renderBlock(''), `${BEGIN_MARKER}\n${END_MARKER}`);
});

test('spliceBlock appends to a file that has no block', () => {
  const before = '# Project\n\nUser text.\n';
  const after = spliceBlock(before, 'A fact.');
  assert.equal(after, `# Project\n\nUser text.\n\n${wrap('A fact.')}\n`);
});

test('spliceBlock on an empty file writes the block alone', () => {
  assert.equal(spliceBlock('', 'A fact.'), `${wrap('A fact.')}\n`);
});

test('spliceBlock preserves the user text on both sides of the block', () => {
  const before = `Above the block.\n\n${wrap('old')}\n\nBelow the block.\n`;
  const after = spliceBlock(before, 'new');
  assert.equal(after, `Above the block.\n\n${wrap('new')}\n\nBelow the block.\n`);
  assert.ok(after.startsWith('Above the block.\n\n'));
  assert.ok(after.endsWith('\nBelow the block.\n'));
});

test('spliceBlock is idempotent', () => {
  const once = spliceBlock('User text.\n', 'A fact.');
  assert.equal(spliceBlock(once, 'A fact.'), once);
});

test('spliceBlock refuses a body carrying a marker of its own', () => {
  assert.throws(
    () => spliceBlock('User text.\n', `a\n${BEGIN_MARKER}\nb`),
    (error: unknown) => error instanceof MarkerError,
  );
});

test('the result ends with exactly one newline', () => {
  for (const before of ['', 'User text.', 'User text.\n\n\n', `${wrap('old')}\n\n\n`]) {
    const after = spliceBlock(before, 'A fact.');
    assert.ok(after.endsWith('\n'));
    assert.ok(!after.endsWith('\n\n'));
  }
});

test('writeMemoryBlock creates the file when it is absent', async () => {
  await withDir(async dir => {
    const result = await writeMemoryBlock(dir, 'A fact.');
    assert.equal(result.path, path.join(dir, MEMORY_FILE));
    assert.equal(result.created, true);
    assert.equal(result.hadBlock, false);
    assert.equal(await readFile(result.path, 'utf8'), `${wrap('A fact.')}\n`);
  });
});

test('writeMemoryBlock leaves an existing file untouched outside the block', async () => {
  await withDir(async dir => {
    const target = path.join(dir, MEMORY_FILE);
    await writeFile(target, '# Their file\n\nTheir paragraph.\n', 'utf8');

    const first = await writeMemoryBlock(dir, 'A fact.');
    assert.equal(first.created, false);
    assert.equal(first.hadBlock, false);

    const second = await writeMemoryBlock(dir, 'A different fact.');
    assert.equal(second.hadBlock, true);

    const text = await readFile(target, 'utf8');
    assert.equal(text, `# Their file\n\nTheir paragraph.\n\n${wrap('A different fact.')}\n`);
    assert.equal((await readdir(dir)).length, 1, 'no temporary file left behind');
  });
});
