// Whether a newer Maestro is out, asked of a real loopback server.
//
// Every test here serves the "published" SKILL.md from 127.0.0.1, because the
// claim worth holding is what the module does with a real HTTP answer — a
// refused port, a server that never answers, a 404, a body past the limit —
// and a mocked `fetch` would prove nothing about any of those. No test reaches
// the real network: the published URL is passed in, never the default.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DISABLE_ENV, MAX_PUBLISHED_BYTES, PUBLISHED_SKILL_URL, checkForUpdate, compareVersions,
  metadataVersion, updateCommand, updateLine,
} from '../../skills/maestro/tools/runtime/update-check.mts';

const skillWith = (version: string | null): string =>
  version === null
    ? '---\nname: maestro\ndescription: x\n---\n\n# Maestro\n'
    : `---\nname: maestro\ndescription: x\nmetadata:\n  version: "${version}"\n---\n\n# Maestro\n`;

async function withSkill(version: string | null, body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'maestro-update-'));
  try {
    await writeFile(path.join(dir, 'SKILL.md'), skillWith(version));
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

interface Served { url: string; requests: { url: string; bodyBytes: number }[] }

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  body: (served: Served) => Promise<void>,
): Promise<void> {
  const requests: Served['requests'] = [];
  const server: Server = createServer((req, res) => {
    let bodyBytes = 0;
    req.on('data', (chunk: Buffer) => { bodyBytes += chunk.byteLength; });
    req.on('end', () => {
      requests.push({ url: req.url ?? '', bodyBytes });
      handler(req, res);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await body({ url: `http://127.0.0.1:${port}/skills/maestro/SKILL.md`, requests });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

const serving = (text: string, status = 200) => (_req: IncomingMessage, res: ServerResponse): void => {
  res.writeHead(status, { 'content-type': 'text/plain' });
  res.end(text);
};

const ENABLED: NodeJS.ProcessEnv = {};

test('a published version above the installed one is newer, and both versions are reported', async () => {
  await withSkill('0.0.13-alpha', dir => withServer(serving(skillWith('0.0.14-alpha')), async ({ url }) => {
    assert.deepEqual(await checkForUpdate({ skillDir: dir, env: ENABLED, url }),
      { result: 'newer', installed: '0.0.13-alpha', published: '0.0.14-alpha' });
  }));
});

test('a published version equal to the installed one is current', async () => {
  await withSkill('0.0.13-alpha', dir => withServer(serving(skillWith('0.0.13-alpha')), async ({ url }) => {
    assert.deepEqual(await checkForUpdate({ skillDir: dir, env: ENABLED, url }),
      { result: 'current', installed: '0.0.13-alpha', published: '0.0.13-alpha' });
  }));
});

test('an installed version ahead of the published one, as in a local checkout, is current', async () => {
  await withSkill('0.0.14-alpha', dir => withServer(serving(skillWith('0.0.13-alpha')), async ({ url }) => {
    assert.equal((await checkForUpdate({ skillDir: dir, env: ENABLED, url })).result, 'current');
  }));
});

test('MAESTRO_NO_UPDATE_CHECK=1 is disabled before the installed file is read or any request is made', async () => {
  await withServer(serving(skillWith('9.9.9')), async ({ url, requests }) => {
    const outcome = await checkForUpdate({ skillDir: '/nonexistent/skill', env: { [DISABLE_ENV]: '1' }, url });
    assert.deepEqual(outcome, { result: 'disabled' });
    assert.equal(requests.length, 0);
  });
});

test('only the exact value 1 disables the check', async () => {
  await withSkill('0.0.13-alpha', dir => withServer(serving(skillWith('0.0.14-alpha')), async ({ url }) => {
    assert.equal((await checkForUpdate({ skillDir: dir, env: { [DISABLE_ENV]: 'true' }, url })).result, 'newer');
  }));
});

test('an installed SKILL.md that is missing or carries no version is unknown, and no request is made', async () => {
  await withServer(serving(skillWith('9.9.9')), async ({ url, requests }) => {
    assert.deepEqual(await checkForUpdate({ skillDir: '/nonexistent/skill', env: ENABLED, url }), { result: 'unknown' });
    await withSkill(null, async dir => {
      assert.deepEqual(await checkForUpdate({ skillDir: dir, env: ENABLED, url }), { result: 'unknown' });
    });
    await withSkill('not-a-version', async dir => {
      assert.deepEqual(await checkForUpdate({ skillDir: dir, env: ENABLED, url }), { result: 'unknown' });
    });
    assert.equal(requests.length, 0);
  });
});

test('a refused connection is unknown, carrying the installed version and no reason', async () => {
  let url = '';
  await withServer(serving(''), async served => { url = served.url; });
  await withSkill('0.0.13-alpha', async dir => {
    assert.deepEqual(await checkForUpdate({ skillDir: dir, env: ENABLED, url }), { result: 'unknown', installed: '0.0.13-alpha' });
  });
});

test('a server that never answers is unknown once the timeout runs out', async () => {
  await withSkill('0.0.13-alpha', dir => withServer(() => { /* never answers */ }, async ({ url }) => {
    const started = Date.now();
    const outcome = await checkForUpdate({ skillDir: dir, env: ENABLED, url, timeoutMs: 100 });
    assert.deepEqual(outcome, { result: 'unknown', installed: '0.0.13-alpha' });
    assert.ok(Date.now() - started < 1500, 'the timeout bounds the wait');
  }));
});

test('a 404 is unknown', async () => {
  await withSkill('0.0.13-alpha', dir => withServer(serving(skillWith('0.0.14-alpha'), 404), async ({ url }) => {
    assert.equal((await checkForUpdate({ skillDir: dir, env: ENABLED, url })).result, 'unknown');
  }));
});

test('a body past the size limit is unknown even when it starts with a newer version', async () => {
  const oversized = skillWith('0.0.14-alpha') + 'x'.repeat(MAX_PUBLISHED_BYTES);
  await withSkill('0.0.13-alpha', dir => withServer(serving(oversized), async ({ url }) => {
    assert.equal((await checkForUpdate({ skillDir: dir, env: ENABLED, url })).result, 'unknown');
  }));
});

test('a published file with no frontmatter or no version is unknown', async () => {
  for (const text of ['# Maestro\n', skillWith(null), skillWith('banana')]) {
    await withSkill('0.0.13-alpha', dir => withServer(serving(text), async ({ url }) => {
      assert.deepEqual(await checkForUpdate({ skillDir: dir, env: ENABLED, url }), { result: 'unknown', installed: '0.0.13-alpha' });
    }));
  }
});

test('the request carries no query string and no body', async () => {
  await withSkill('0.0.13-alpha', dir => withServer(serving(skillWith('0.0.13-alpha')), async ({ url, requests }) => {
    await checkForUpdate({ skillDir: dir, env: ENABLED, url });
    assert.deepEqual(requests, [{ url: '/skills/maestro/SKILL.md', bodyBytes: 0 }]);
  }));
});

test('the default published URL is the maestro SKILL.md on the default branch', () => {
  assert.equal(PUBLISHED_SKILL_URL, 'https://raw.githubusercontent.com/permgps/skills/main/skills/maestro/SKILL.md');
});

test('versions order as semver does, prerelease tags included', () => {
  const cases: [string, string, number][] = [
    ['0.0.14-alpha', '0.0.13-alpha', 1],
    ['0.0.13', '0.0.13-alpha', 1],
    ['0.0.13-alpha', '0.0.13', -1],
    ['0.0.13-alpha.2', '0.0.13-alpha.1', 1],
    ['0.0.13-alpha.10', '0.0.13-alpha.9', 1],
    ['0.0.13-alpha.1', '0.0.13-alpha', 1],
    ['0.0.13-beta', '0.0.13-alpha', 1],
    ['0.0.13-alpha.1', '0.0.13-alpha.beta', -1],
    ['0.1.0', '0.0.99', 1],
    ['1.0.0', '1.0.0', 0],
    ['0.0.13-alpha', '0.0.13-alpha', 0],
  ];
  for (const [a, b, expected] of cases) assert.equal(compareVersions(a, b), expected, `${a} vs ${b}`);
  assert.equal(compareVersions('0.0', '0.0.1'), null);
  assert.equal(compareVersions('v0.0.1', '0.0.1'), null);
});

test('metadata.version is read only from under metadata, quoted or not, and only from closed frontmatter', () => {
  assert.equal(metadataVersion(skillWith('0.0.13-alpha')), '0.0.13-alpha');
  assert.equal(metadataVersion('---\nmetadata:\n  version: 0.0.13-alpha\n---\n'), '0.0.13-alpha');
  assert.equal(metadataVersion("---\nmetadata:\n  author: x\n  version: '1.2.3'\n---\n"), '1.2.3');
  assert.equal(metadataVersion('---\nversion: 1.2.3\n---\n'), null);
  assert.equal(metadataVersion('---\nother:\n  version: 1.2.3\nmetadata:\n  author: x\n---\n'), null);
  assert.equal(metadataVersion('---\nmetadata:\n  version: 1.2.3\n'), null);
  assert.equal(metadataVersion('# no frontmatter\nmetadata:\n  version: 1.2.3\n'), null);
});

test('the announcement line names both versions and npx skills update, in Russian and in English', () => {
  assert.equal(updateLine('ru', '0.0.13-alpha', '0.0.14-alpha'),
    'Вышла новая версия Maestro — 0.0.14-alpha (у вас 0.0.13-alpha). Обновить: npx skills update');
  assert.equal(updateLine('en', '0.0.13-alpha', '0.0.14-alpha'),
    'A newer Maestro is out — 0.0.14-alpha (you have 0.0.13-alpha). Update with: npx skills update');
});

async function withRunDir(language: string | null, body: (runDir: string) => Promise<void>): Promise<void> {
  const runDir = await mkdtemp(path.join(tmpdir(), 'maestro-update-run-'));
  try {
    if (language !== null) {
      await writeFile(path.join(runDir, 'state.js'), `globalThis.MAESTRO_STATE = ${JSON.stringify({ contractVersion: 8, language })};\n`);
    }
    await body(runDir);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

test('the command exits 0 with no line when nothing is newer, and with no --skill makes no request', async () => {
  await withRunDir(null, async runDir => {
    await withServer(serving(skillWith('9.9.9')), async ({ url, requests }) => {
      assert.deepEqual(await updateCommand(['--update-check'], runDir, { env: ENABLED, url }), { result: { result: 'unknown' }, code: 0 });
      assert.deepEqual(await updateCommand(['--update-check'], runDir, { env: { [DISABLE_ENV]: '1' }, url }), { result: { result: 'disabled' }, code: 0 });
      assert.equal(requests.length, 0);
    });
    await withSkill('0.0.13-alpha', dir => withServer(serving(skillWith('0.0.13-alpha')), async ({ url }) => {
      assert.deepEqual(await updateCommand(['--update-check', '--skill', dir], runDir, { env: ENABLED, url }),
        { result: { result: 'current', installed: '0.0.13-alpha', published: '0.0.13-alpha' }, code: 0 });
    }));
  });
});

test('a newer version carries the line in the language the state speaks, and in Russian when no state can be read', async () => {
  for (const [language, expected] of [['en', 'en'], ['ru', 'ru'], [null, 'ru']] as const) {
    await withRunDir(language, runDir => withSkill('0.0.13-alpha', dir => withServer(serving(skillWith('0.0.14-alpha')), async ({ url }) => {
      const outcome = await updateCommand(['--update-check', '--skill', dir], runDir, { env: ENABLED, url });
      assert.deepEqual(outcome, {
        result: { result: 'newer', installed: '0.0.13-alpha', published: '0.0.14-alpha', line: updateLine(expected, '0.0.13-alpha', '0.0.14-alpha') },
        code: 0,
      });
    })));
  }
});
