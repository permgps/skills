import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkDashboard,
  scriptBlock,
  stripComments,
  type SpecSources,
} from './dashboard-integrity.ts';

const VOCABULARY = `# Vocabulary

## Stage Labels

| Stage id | Label |
|---|---|
| preflight | Подготовка |
| build | Разработка |

## Value Labels

| Field | Value | Label |
|---|---|---|
| \`stages[].status\` | \`pending\` | Ожидает |
| \`tasks[].status\` | \`queued\` | В очереди |
| \`requirements[].status\` | \`open\` | Открыто |
| \`gates[].status\` | \`pending\` | Ожидает |
| \`mode\` | \`semi\` | Полуавтомат |
| \`depth\` | \`normal\` | Обычная |
| \`polish\` | \`false\` | Выключена |
`;

const PHASES = `# Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | a | b |
| build | Build | yes | a | b |
| memory | Memory | no | a | b |
`;

const GATES = `# Gates

| Gate | After phase | Pass condition |
|---|---|---|
| G1 | preflight | something |
`;

const SPEC: SpecSources = {
  'vocabulary.md': VOCABULARY,
  'phases.md': PHASES,
  'gates.md': GATES,
};

const LOGIC = {
  STAGE_ORDER: "['preflight', 'build']",
  STAGE_LABEL: "{ preflight: 'Подготовка', build: 'Разработка' }",
  STAGE_STATUS: "{ pending: 'Ожидает' }",
  TASK_STATUS: "{ queued: 'В очереди' }",
  REQUIREMENT_STATUS: "{ open: 'Открыто' }",
  GATE_STATUS: "{ pending: 'Ожидает' }",
  MODE: "{ semi: 'Полуавтомат' }",
  DEPTH: "{ normal: 'Обычная' }",
  POLISH: "{ 'false': 'Выключена' }",
  GATE_AFTER: "{ G1: 'preflight' }",
};

const REGIONS = ['run-clock', 'stage-clock', 'dials', 'stages', 'tasks', 'requirements', 'gates'];

/** A page shaped like the real one, small enough that a test can bend one part of it. */
function page(overrides: {
  logic?: Partial<Record<keyof typeof LOGIC, string>>;
  regions?: string[];
  body?: string;
  omitLogicBlock?: boolean;
  logicSource?: string;
} = {}): string {
  const maps = { ...LOGIC, ...(overrides.logic ?? {}) };
  const entries = Object.entries(maps).map(([name, value]) => `${name}: ${value}`).join(',\n    ');
  const regions = (overrides.regions ?? REGIONS)
    .map(id => `<div id="${id}"></div>`).join('\n');
  const source = overrides.logicSource
    ?? `globalThis.MAESTRO_LOGIC = {\n    ${entries}\n  };`;
  const logicBlock = overrides.omitLogicBlock ? '' : `<script id="logic">\n${source}\n</script>`;

  return [
    '<!doctype html>', '<html lang="ru">', '<head><title>Maestro</title></head>', '<body>',
    regions, overrides.body ?? '', logicBlock, '</body>', '</html>',
  ].join('\n');
}

const messages = (html: string, spec: SpecSources = SPEC): string =>
  checkDashboard(html, spec).map(v => v.message).join('\n');

test('a page that matches the specification passes', () => {
  assert.deepEqual(checkDashboard(page(), SPEC), []);
});

test('an external stylesheet is reported', () => {
  const found = messages(page({ body: '<link rel="stylesheet" href="https://cdn.example/a.css">' }));
  assert.match(found, /reaches off the page/);
});

test('a protocol-relative script source is reported', () => {
  const found = messages(page({ body: '<script src="//cdn.example/a.js"></script>' }));
  assert.match(found, /reaches off the page/);
});

test('a CSS url on another origin is reported', () => {
  const found = messages(page({ body: '<style>body { background: url(https://x/y.png); }</style>' }));
  assert.match(found, /reaches off the page/);
});

test('a runtime network call is reported', () => {
  const found = messages(page({ body: '<script>fetch("state.js");</script>' }));
  assert.match(found, /"fetch\(" is a network call/);
});

test('a network API named inside a comment is not reported', () => {
  // The page explains why it does not use fetch. A checker that reads its own
  // comments reports the page for saying what it does not do.
  const html = page({ body: '<!-- state.js is not read with fetch or XMLHttpRequest -->' });
  assert.deepEqual(checkDashboard(html, SPEC), []);
});

test('a network API named in a JavaScript comment is not reported either', () => {
  const html = page({ body: '<script>\n/* not a fetch( call */\n// XMLHttpRequest is blocked here\n</script>' });
  assert.deepEqual(checkDashboard(html, SPEC), []);
});

test('a missing region is reported by name', () => {
  const found = messages(page({ regions: REGIONS.filter(id => id !== 'gates') }));
  assert.match(found, /no element with id "gates"/);
});

test('every missing region is reported, not only the first', () => {
  const violations = checkDashboard(page({ regions: [] }), SPEC);
  assert.equal(violations.filter(v => v.check === 'regions').length, REGIONS.length);
});

test('a page with no logic block is reported and checking stops there', () => {
  const violations = checkDashboard(page({ omitLogicBlock: true }), SPEC);
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /no <script id="logic">/);
});

test('a logic block that needs a DOM is reported', () => {
  const found = messages(page({ logicSource: 'globalThis.MAESTRO_LOGIC = { x: document.title };' }));
  assert.match(found, /does not evaluate on its own/);
});

test('a logic block that exports nothing is reported', () => {
  const found = messages(page({ logicSource: 'var unused = 1;' }));
  assert.match(found, /did not export MAESTRO_LOGIC/);
});

test('a stage label the page words differently is reported with both wordings', () => {
  const found = messages(page({
    logic: { STAGE_LABEL: "{ preflight: 'Подготовка', build: 'Сборка' }" },
  }));
  assert.match(found, /"build" is labelled "Сборка" in the page and "Разработка" in the specification/);
});

test('a stage the vocabulary labels and the page forgot is reported', () => {
  const found = messages(page({ logic: { STAGE_LABEL: "{ preflight: 'Подготовка' }" } }));
  assert.match(found, /stage "build" has a label in the specification and none in the page/);
});

test('a label the page invented is reported', () => {
  const found = messages(page({
    logic: { STAGE_LABEL: "{ preflight: 'Подготовка', build: 'Разработка', ghost: 'Призрак' }" },
  }));
  assert.match(found, /stage "ghost" is labelled in the page and defined nowhere/);
});

test('a value label is checked the same way as a stage label', () => {
  const found = messages(page({ logic: { TASK_STATUS: "{ queued: 'В работе' }" } }));
  assert.match(found, /tasks\[\]\.status "queued" is labelled "В работе" in the page/);
});

test('every value map is compared, not just the first', () => {
  const found = messages(page({
    logic: { MODE: "{ semi: 'Ручной' }", DEPTH: "{ normal: 'Глубокая' }" },
  }));
  assert.match(found, /mode "semi"/);
  assert.match(found, /depth "normal"/);
});

test('a stage order that differs from phases.md is reported', () => {
  const found = messages(page({ logic: { STAGE_ORDER: "['build', 'preflight']" } }));
  assert.match(found, /STAGE_ORDER is \[build, preflight\] and phases.md is \[preflight, build\]/);
});

test('a non-stage phase does not belong in the stage order', () => {
  const found = messages(page({ logic: { STAGE_ORDER: "['preflight', 'build', 'memory']" } }));
  assert.match(found, /STAGE_ORDER is \[preflight, build, memory\]/);
});

test('a gate pointing at the wrong stage is reported', () => {
  const found = messages(page({ logic: { GATE_AFTER: "{ G1: 'build' }" } }));
  assert.match(found, /gate "G1" is labelled "build" in the page and "preflight" in the specification/);
});

test('a vocabulary with no value table is reported once, not as every field', () => {
  const spec: SpecSources = { ...SPEC, 'vocabulary.md': '# Vocabulary\n\n| Stage id | Label |\n|---|---|\n| preflight | Подготовка |\n| build | Разработка |\n' };
  const violations = checkDashboard(page(), spec).filter(v => v.check === 'labels');
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /no table with columns Field, Value and Label/);
});

test('stripComments keeps every line number in place', () => {
  const source = 'a\n<!--\nb\n-->\nc';
  const stripped = stripComments(source);
  assert.equal(stripped.split('\n').length, source.split('\n').length);
  assert.equal(stripped.split('\n')[4], 'c');
  assert.doesNotMatch(stripped, /b/);
});

test('stripComments leaves a URL inside code alone', () => {
  // Blanking a trailing `//` comment must not eat the `//` of a real origin,
  // which is the one thing this checker exists to find.
  const stripped = stripComments('  var a = "https://example.test";');
  assert.match(stripped, /https:\/\/example\.test/);
});

test('scriptBlock returns null for a block that is not there', () => {
  assert.equal(scriptBlock('<html></html>', 'logic'), null);
});
