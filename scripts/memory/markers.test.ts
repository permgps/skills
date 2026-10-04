import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, chmod, writeFile, lstat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  BEGIN_MARKER,
  END_MARKER,
  MEMORY_FILES_BY_HOST,
  MarkerError,
  MemoryFileConflictError,
  MemoryFileMarkerError,
  UnknownHostError,
  resolveMemoryFile,
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

async function put(dir: string, file: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
  await writeFile(path.join(dir, file), text, 'utf8');
}

test('writeMemoryBlock creates the host\'s own file when the project has no memory file', async () => {
  for (const [host, expected] of [['claude-code', 'CLAUDE.md'], ['codex', 'AGENTS.md'], ['gemini-cli', 'GEMINI.md']] as const) {
    await withDir(async dir => {
      const result = await writeMemoryBlock(dir, 'A fact.', host);
      assert.equal(result.file, expected);
      assert.equal(result.file, MEMORY_FILES_BY_HOST[host].creates);
      assert.equal(result.path, path.join(dir, expected));
      assert.equal(result.action, 'created');
      assert.equal(result.loadedByHost, true);
      assert.equal(await readFile(result.path, 'utf8'), `${wrap('A fact.')}\n`);
      assert.deepEqual(await readdir(dir), [expected], 'one file created, nothing else');
    });
  }
});

test('writeMemoryBlock leaves an existing file untouched outside the block', async () => {
  await withDir(async dir => {
    const target = path.join(dir, 'CLAUDE.md');
    await writeFile(target, '# Their file\n\nTheir paragraph.\n', 'utf8');

    const first = await writeMemoryBlock(dir, 'A fact.', 'claude-code');
    assert.equal(first.action, 'appended');
    assert.equal(first.reason, 'host-file');

    const second = await writeMemoryBlock(dir, 'A different fact.', 'claude-code');
    assert.equal(second.action, 'replaced');

    const text = await readFile(target, 'utf8');
    assert.equal(text, `# Their file\n\nTheir paragraph.\n\n${wrap('A different fact.')}\n`);
    assert.equal((await readdir(dir)).length, 1, 'no temporary file left behind');
  });
});

test('a rewrite keeps the permissions the project gave its memory file', async () => {
  await withDir(async dir => {
    await put(dir, 'AGENTS.md', 'Theirs.\n');
    await chmod(path.join(dir, 'AGENTS.md'), 0o664);
    await writeMemoryBlock(dir, 'A fact.', 'codex');
    assert.equal((await stat(path.join(dir, 'AGENTS.md'))).mode & 0o777, 0o664);
  });
});

test('a project that already has AGENTS.md gets its block there even on a host that loads CLAUDE.md', async () => {
  await withDir(async dir => {
    await put(dir, 'AGENTS.md', 'Theirs.\n');
    const result = await writeMemoryBlock(dir, 'A fact.', 'claude-code');
    assert.equal(result.file, 'AGENTS.md');
    assert.equal(result.reason, 'host-file');
    assert.equal(result.loadedByHost, true, 'Claude Code reads AGENTS.md when no CLAUDE file exists');
    assert.deepEqual((await readdir(dir)).sort(), ['AGENTS.md'], 'no second memory file');
  });
});

test('a file the host does not load is still written rather than creating a second one, and says so', async () => {
  await withDir(async dir => {
    await put(dir, 'AGENTS.md', 'Theirs.\n');
    const result = await writeMemoryBlock(dir, 'A fact.', 'gemini-cli');
    assert.equal(result.file, 'AGENTS.md');
    assert.equal(result.reason, 'existing-file');
    assert.equal(result.loadedByHost, false);
    assert.deepEqual(await readdir(dir), ['AGENTS.md']);
  });
});

test('the host\'s own file wins over another existing memory file', async () => {
  await withDir(async dir => {
    await put(dir, 'AGENTS.md', 'Codex notes.\n');
    await put(dir, 'CLAUDE.md', 'Claude notes.\n');
    const result = await writeMemoryBlock(dir, 'A fact.', 'claude-code');
    assert.equal(result.file, 'CLAUDE.md');
    assert.equal(result.loadedByHost, true);
    assert.equal(await readFile(path.join(dir, 'AGENTS.md'), 'utf8'), 'Codex notes.\n');
  });
});

test('a count-only file is never written and shadows the file the block lands in', async () => {
  await withDir(async dir => {
    await put(dir, 'CLAUDE.local.md', 'Mine.\n');
    await put(dir, 'AGENTS.md', 'Team.\n');
    const result = await writeMemoryBlock(dir, 'A fact.', 'claude-code');
    assert.equal(result.file, 'AGENTS.md');
    assert.equal(result.loadedByHost, false, 'CLAUDE.local.md stops Claude Code reading AGENTS.md');
    assert.equal(await readFile(path.join(dir, 'CLAUDE.local.md'), 'utf8'), 'Mine.\n');
  });
  await withDir(async dir => {
    await put(dir, 'AGENTS.override.md', 'Override.\n');
    const result = await writeMemoryBlock(dir, 'A fact.', 'codex');
    assert.equal(result.file, 'AGENTS.md');
    assert.equal(result.action, 'created');
    assert.equal(result.loadedByHost, false, 'AGENTS.override.md outranks AGENTS.md');
    assert.equal(await readFile(path.join(dir, 'AGENTS.override.md'), 'utf8'), 'Override.\n');
  });
});

test('the file that already carries the block keeps it, whichever host writes next', async () => {
  await withDir(async dir => {
    await put(dir, 'AGENTS.md', `Team.\n\n${wrap('old')}\n`);
    await put(dir, 'CLAUDE.md', 'Claude notes.\n');
    const result = await writeMemoryBlock(dir, 'new', 'claude-code');
    assert.equal(result.file, 'AGENTS.md');
    assert.equal(result.reason, 'block');
    assert.equal(result.action, 'replaced');
    assert.equal(result.loadedByHost, false, 'CLAUDE.md shadows AGENTS.md on Claude Code');
    assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), 'Claude notes.\n');
    assert.equal(await readFile(path.join(dir, 'AGENTS.md'), 'utf8'), `Team.\n\n${wrap('new')}\n`);
  });
});

test('the block in two files is refused, naming both, and nothing is written', async () => {
  await withDir(async dir => {
    await put(dir, 'AGENTS.md', `${wrap('one')}\n`);
    await put(dir, '.claude/CLAUDE.md', `${wrap('two')}\n`);
    await assert.rejects(writeMemoryBlock(dir, 'new', 'claude-code'), (error: unknown) => {
      assert.ok(error instanceof MemoryFileConflictError);
      assert.deepEqual(error.files, ['AGENTS.md', '.claude/CLAUDE.md']);
      return true;
    });
    assert.equal(await readFile(path.join(dir, 'AGENTS.md'), 'utf8'), `${wrap('one')}\n`);
  });
});

test('malformed markers in a memory file are refused with the file and the lines', async () => {
  await withDir(async dir => {
    await put(dir, 'GEMINI.md', `text\n${BEGIN_MARKER}\nbody\n`);
    await assert.rejects(writeMemoryBlock(dir, 'new', 'gemini-cli'), (error: unknown) => {
      assert.ok(error instanceof MemoryFileMarkerError);
      assert.equal(error.file, 'GEMINI.md');
      assert.deepEqual(error.lines, [2]);
      return true;
    });
  });
});

test('an unknown host is refused before any file is read or written', async () => {
  await withDir(async dir => {
    await assert.rejects(writeMemoryBlock(dir, 'A fact.', 'cursor'), UnknownHostError);
    await assert.rejects(resolveMemoryFile(dir, ''), UnknownHostError);
    assert.deepEqual(await readdir(dir), []);
  });
});

// `CLAUDE.md -> AGENTS.md` is how many projects give two hosts one file. A rename
// onto the link replaced it with a regular file, and from then on the two names
// held different text with nobody told.
test('a memory file reached through a symlink is written through it, and the link survives', async () => {
  await withDir(async dir => {
    await put(dir, 'AGENTS.md', 'Team.\n');
    await symlink('AGENTS.md', path.join(dir, 'CLAUDE.md'));
    await writeMemoryBlock(dir, 'A fact.', 'claude-code');
    assert.ok((await lstat(path.join(dir, 'CLAUDE.md'))).isSymbolicLink(), 'the link was replaced by a file');
    assert.equal(await readFile(path.join(dir, 'AGENTS.md'), 'utf8'), `Team.\n\n${wrap('A fact.')}\n`);
    assert.deepEqual((await readdir(dir)).sort(), ['AGENTS.md', 'CLAUDE.md'], 'no temporary file left behind');
  });
});

test('one file under two names is one memory file, so a second write replaces its block', async () => {
  await withDir(async dir => {
    await put(dir, 'AGENTS.md', 'Team.\n');
    await symlink('AGENTS.md', path.join(dir, 'CLAUDE.md'));
    await writeMemoryBlock(dir, 'A fact.', 'claude-code');
    const second = await writeMemoryBlock(dir, 'A different fact.', 'claude-code');
    assert.equal(second.action, 'replaced');
    assert.equal(await readFile(path.join(dir, 'AGENTS.md'), 'utf8'), `Team.\n\n${wrap('A different fact.')}\n`);
  });
});

test('a symlinked memory file outside the known names is written through, not replaced', async () => {
  await withDir(async dir => {
    await put(dir, 'docs/agents.md', 'Team.\n');
    await symlink('docs/agents.md', path.join(dir, 'CLAUDE.md'));
    await writeMemoryBlock(dir, 'A fact.', 'claude-code');
    assert.ok((await lstat(path.join(dir, 'CLAUDE.md'))).isSymbolicLink());
    assert.equal(await readFile(path.join(dir, 'docs/agents.md'), 'utf8'), `Team.\n\n${wrap('A fact.')}\n`);
  });
});

test('a memory file that is a symlink to nothing is refused, not replaced by a new file', async () => {
  await withDir(async dir => {
    await symlink('missing.md', path.join(dir, 'CLAUDE.md'));
    await assert.rejects(writeMemoryBlock(dir, 'A fact.', 'claude-code'), /symlink to a file that does not exist/);
    assert.ok((await lstat(path.join(dir, 'CLAUDE.md'))).isSymbolicLink(), 'the dangling link was replaced');
    assert.deepEqual(await readdir(dir), ['CLAUDE.md'], 'nothing else was created');
  });
});
