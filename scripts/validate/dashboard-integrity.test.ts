import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkDashboard,
  customProperties,
  scriptBlock,
  stripComments,
  type SpecSources,
} from './dashboard-integrity.ts';

const VOCABULARY = `# Vocabulary

## Stage Labels

| Stage id | Label | Label (en) |
|---|---|---|
| preflight | Подготовка | Setup |
| build | Разработка | Development |

## Value Labels

| Field | Value | Label | Label (en) |
|---|---|---|---|
| \`stages[].status\` | \`pending\` | Ожидает | Waiting |
| \`tasks[].status\` | \`queued\` | В очереди | Queued |
| \`requirements[].status\` | \`open\` | Открыто | Open |
| \`gates[].status\` | \`pending\` | Ожидает | Waiting |
| \`mode\` | \`semi\` | Полуавтомат | Semi |
| \`depth\` | \`normal\` | Обычная | Normal |
| \`polish\` | \`false\` | Выключена | Off |
| \`explain\` | \`plain\` | Простые | Plain |

## Screen Labels

| Label | Label (en) | What it names |
|---|---|---|
| Ход разработки | Development progress | The таски as they are being built |

## Plain Words

| Shorthand | Say instead |
|---|---|
| гейт, гейты | проверка |
| медиана | серединное значение |

| Shorthand (en) | Say instead (en) |
|---|---|
| gate, gates | check |
| median | middle value |
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

const DASHBOARD = `# Dashboard

## What It Renders

| Key | Region | Shows | Source |
|---|---|---|---|
| \`progress\` | Прогресс проекта | the whole road | \`stages[]\` |
| \`gates\` | Gates | G1-G4 | \`gates[]\` |
`;

const SPEC: SpecSources = {
  'vocabulary.md': VOCABULARY,
  'phases.md': PHASES,
  'gates.md': GATES,
  'dashboard.md': DASHBOARD,
};

/** What the page exports beside its words: the lists no language owns. */
const LOGIC = {
  STAGE_ORDER: "['preflight', 'build']",
  GATE_AFTER: "{ G1: 'preflight' }",
  EXPLAIN_ORDER: "['progress', 'gates']",
  explain: "function (key) { return key === 'nothing' ? [] : ['what it is', 'what it holds']; }",
};

/** One language's branch of `L10N`, which is where every word lives. */
const RU = {
  STAGE_LABEL: "{ preflight: 'Подготовка', build: 'Разработка' }",
  STAGE_STATUS: "{ pending: 'Ожидает' }",
  TASK_STATUS: "{ queued: 'В очереди' }",
  REQUIREMENT_STATUS: "{ open: 'Открыто' }",
  GATE_STATUS: "{ pending: 'Ожидает' }",
  MODE: "{ semi: 'Полуавтомат' }",
  DEPTH: "{ normal: 'Обычная' }",
  POLISH: "{ 'false': 'Выключена' }",
  REGISTER: "{ plain: 'Простые' }",
  UI: "{ viewNote: 'Кнопки меняют только эту страницу.' }",
};

const EN = {
  STAGE_LABEL: "{ preflight: 'Setup', build: 'Development' }",
  STAGE_STATUS: "{ pending: 'Waiting' }",
  TASK_STATUS: "{ queued: 'Queued' }",
  REQUIREMENT_STATUS: "{ open: 'Open' }",
  GATE_STATUS: "{ pending: 'Waiting' }",
  MODE: "{ semi: 'Semi' }",
  DEPTH: "{ normal: 'Normal' }",
  POLISH: "{ 'false': 'Off' }",
  REGISTER: "{ plain: 'Plain' }",
  UI: "{ viewNote: 'These buttons change this page and nothing else.' }",
};

/** The regions of the What It Renders table, as the markup marks them. */
const EXPLAINED = ['progress', 'gates'];

const REGIONS = [
  'run-clock', 'stage-clock', 'dials', 'progress', 'cards',
  'stages', 'tasks', 'now', 'requirements', 'gates',
];

/** The reader's own controls: one button per theme, one per language. */
const SWITCHES = [
  '<button data-theme-choice="light"></button>',
  '<button data-theme-choice="dark"></button>',
  '<button data-language-choice="ru">RU</button>',
  '<button data-language-choice="en">EN</button>',
].join('\n');

/** The three theme states, with one token apiece so the sets can be compared. */
const STYLE = `<style>
  :root,
  :root[data-theme="light"] { --bg: #fff; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) { --bg: #000; }
  }
  :root[data-theme="dark"] { --bg: #000; }
</style>`;

/** A page shaped like the real one, small enough that a test can bend one part of it. */
function page(overrides: {
  logic?: Partial<Record<keyof typeof LOGIC, string>>;
  /** One language's maps, overridden the way the real page nests them. */
  ru?: Partial<Record<keyof typeof RU, string>>;
  en?: Partial<Record<keyof typeof EN, string>>;
  regions?: string[];
  /** Regions marked with `data-region`, which is where each i is hung. */
  explained?: string[];
  body?: string;
  omitLogicBlock?: boolean;
  logicSource?: string;
  /** The body of the page's plain-explanation literal, read as source. */
  plain?: string | null;
  plainEn?: string | null;
  /** The body of the snapshot block. `null` leaves the block out entirely. */
  snapshot?: string | null;
  /** The reader's two switches, and the stylesheet that gives the theme three states. */
  switches?: string;
  style?: string;
} = {}): string {
  const root = { ...LOGIC, ...(overrides.logic ?? {}) };
  const entries = Object.entries(root).map(([name, value]) => `${name}: ${value}`).join(',\n    ');
  const branch = (maps: Record<string, string>): string =>
    Object.entries(maps).map(([name, value]) => `${name}: ${value}`).join(',\n      ');
  const l10n = `var L10N = {\n    ru: {\n      ${branch({ ...RU, ...(overrides.ru ?? {}) })}\n    },`
    + `\n    en: {\n      ${branch({ ...EN, ...(overrides.en ?? {}) })}\n    }\n  };\n`;
  const regions = (overrides.regions ?? REGIONS)
    .map(id => `<div id="${id}"></div>`).join('\n');
  const explained = (overrides.explained ?? EXPLAINED)
    .map(key => `<section data-region="${key}"><h2>${key}</h2></section>`).join('\n');
  const plainBody = overrides.plain === undefined
    ? "progress: function () { return ['простыми словами']; }"
    : overrides.plain;
  const plainEnBody = overrides.plainEn === undefined
    ? "progress: function () { return ['in words anyone has']; }"
    : overrides.plainEn;
  const plainLiteral =
    (plainBody === null ? '' : `L10N.ru.EXPLAIN_PLAIN = {\n    ${plainBody}\n  };\n`)
    + (plainEnBody === null ? '' : `L10N.en.EXPLAIN_PLAIN = {\n    ${plainEnBody}\n  };\n`);
  const source = overrides.logicSource
    ?? `${l10n}${plainLiteral}globalThis.MAESTRO_LOGIC = {\n    ${entries},\n    L10N: L10N\n  };`;
  const logicBlock = overrides.omitLogicBlock ? '' : `<script id="logic">\n${source}\n</script>`;
  const snapshotBody = overrides.snapshot === undefined
    ? '/* maestro:snapshot:start */\nglobalThis.MAESTRO_SNAPSHOT = null;\n/* maestro:snapshot:end */'
    : overrides.snapshot;
  const snapshotBlock = snapshotBody === null
    ? '' : `<script id="snapshot">\n${snapshotBody}\n</script>`;

  return [
    '<!doctype html>', '<html lang="ru">', '<head><title>Maestro</title>',
    overrides.style ?? STYLE, '</head>', '<body>',
    '<h2>Ход разработки</h2>', '<h2>Development progress</h2>',
    overrides.switches ?? SWITCHES,
    regions, explained, overrides.body ?? '', snapshotBlock, logicBlock, '</body>', '</html>',
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
  const found = messages(page({ ru: { STAGE_LABEL: "{ preflight: 'Подготовка', build: 'Сборка' }" } }));
  assert.match(found, /"build" is labelled "Сборка" in the page and "Разработка" in the specification/);
});

test('a stage the vocabulary labels and the page forgot is reported', () => {
  const found = messages(page({ ru: { STAGE_LABEL: "{ preflight: 'Подготовка' }" } }));
  assert.match(found, /stage \(ru\) "build" has a label in the specification and none in the page/);
});

// The whole point of nesting the words by language: the same defect in the
// other branch is found by the same loop, and names the language it is in.
test('the same drift in the English branch is reported and names the language', () => {
  const found = messages(page({ en: { STAGE_LABEL: "{ preflight: 'Setup' }" } }));
  assert.match(found, /stage \(en\) "build" has a label in the specification and none in the page/);
});

test('a language the page carries and this checker does not know is reported', () => {
  const html = page().replace('en: {', 'de: {}, en: {');
  assert.match(messages(html), /carries a "de" branch in L10N/);
});

test('a language the page has stopped carrying is reported', () => {
  const html = page().replace(/\n    en: \{[\s\S]*?\n    \}/, '')
    .replace('L10N.en.EXPLAIN_PLAIN', 'var UNUSED_EN');
  assert.match(messages(html), /carries no "en" branch in L10N/);
});

test('a label the page invented is reported', () => {
  const found = messages(page({
    ru: { STAGE_LABEL: "{ preflight: 'Подготовка', build: 'Разработка', ghost: 'Призрак' }" },
  }));
  assert.match(found, /stage \(ru\) "ghost" is labelled in the page and defined nowhere/);
});

test('a value label is checked the same way as a stage label', () => {
  const found = messages(page({ ru: { TASK_STATUS: "{ queued: 'В работе' }" } }));
  assert.match(found, /tasks\[\]\.status \(ru\) "queued" is labelled "В работе" in the page/);
});

test('every value map is compared, not just the first', () => {
  const found = messages(page({
    ru: { MODE: "{ semi: 'Ручной' }", DEPTH: "{ normal: 'Глубокая' }" },
  }));
  assert.match(found, /mode \(ru\) "semi"/);
  assert.match(found, /depth \(ru\) "normal"/);
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
  // The screen-label table is missing from this fixture too, and says so
  // separately; the point here is that one absent value table is one finding
  // rather than seven.
  const violations = checkDashboard(page(), spec)
    .filter(v => v.check === 'labels')
    .filter(v => /no table with columns Field, Value and Label/.test(v.message));
  // One per language rather than one in all: the table is missing for both, and
  // each language is a repair of its own column.
  assert.equal(violations.length, 2);
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

// --- the snapshot, and the reason it must stay empty here --------------------

test('a page with no snapshot block is reported', () => {
  const found = messages(page({ snapshot: null }));
  assert.match(found, /no <script id="snapshot"> block/);
});

test('a snapshot block without its markers is reported', () => {
  // The sync tool replaces what lies between the markers. Without them it has
  // nothing to find, and the page would show the same state for the whole run.
  const found = messages(page({ snapshot: 'globalThis.MAESTRO_SNAPSHOT = null;' }));
  assert.match(found, /carries no maestro:snapshot:start … maestro:snapshot:end pair/);
});

test('a snapshot carrying a real run is reported', () => {
  // This is the one that matters: the asset is the copy nothing rewrites, so a
  // run left in it ships into every project the skill is installed into.
  const found = messages(page({
    snapshot: '/* maestro:snapshot:start */\n'
      + 'globalThis.MAESTRO_SNAPSHOT = { runId: "r1", slug: "someones-project", stages: [] };\n'
      + '/* maestro:snapshot:end */',
  }));
  assert.match(found, /snapshot in this repository is not empty/);
});

test('an empty snapshot with untidy whitespace still passes', () => {
  const found = messages(page({
    snapshot: '/* maestro:snapshot:start */\n\n  globalThis.MAESTRO_SNAPSHOT = null;  \n\n/* maestro:snapshot:end */',
  }));
  assert.doesNotMatch(found, /snapshot/);
});

test('a screen label the specification owns and the page dropped is reported', () => {
  // The card labels are static text, so no value map can see them drift.
  const spec: SpecSources = {
    ...SPEC,
    'vocabulary.md': VOCABULARY.replace('| Ход разработки |', '| Ход сборки |'),
  };
  const violations = checkDashboard(page(), spec).filter(v => v.check === 'labels');
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /"Ход сборки".*does not carry it/s);
});

test('a vocabulary with no screen label table is reported', () => {
  const spec: SpecSources = {
    ...SPEC,
    'vocabulary.md': VOCABULARY.slice(0, VOCABULARY.indexOf('## Screen Labels')),
  };
  const messages = checkDashboard(page(), spec)
    .filter(v => v.check === 'labels').map(v => v.message).join('\n');
  assert.match(messages, /no table with columns Label and What it names/);
});

test('a region the specification names and the page cannot explain is reported', () => {
  const found = messages(page({ logic: { EXPLAIN_ORDER: "['progress']" } }));
  assert.match(found, /names the region "gates" and the page's EXPLAIN_ORDER does not carry it/);
});

test('a region the page explains and the specification does not name is reported', () => {
  const found = messages(page({ logic: { EXPLAIN_ORDER: "['progress', 'gates', 'weather']" } }));
  assert.match(found, /the page explains "weather" and the What It Renders table does not name it/);
});

test('a region marked twice, or not at all, is reported', () => {
  // The i is hung on the element carrying the attribute, so two of them means
  // two i for one region, and none means a region nobody can ask about.
  assert.match(
    messages(page({ explained: ['progress', 'gates', 'gates'] })),
    /region "gates" carries 2 data-region attribute\(s\)/,
  );
  assert.match(
    messages(page({ explained: ['progress'] })),
    /region "gates" carries 0 data-region attribute\(s\)/,
  );
});

test('markup that marks a region the specification does not know is reported', () => {
  const found = messages(page({ explained: ['progress', 'gates', 'weather'] }));
  assert.match(found, /the markup marks "weather" as a region/);
});

test('a region whose explanation comes back empty is reported', () => {
  // An i that opens an empty popover is worse than no i: it promises an answer
  // and then has none.
  const found = messages(page({
    logic: { explain: "function () { return []; }" },
  }));
  assert.match(found, /region "progress" has no explanation behind it/);
});

test('a region with nothing to hang its i on is reported', () => {
  // `page` gives every marked region an h2. A region built without one, and
  // without naming itself, mounts no button at all.
  const found = messages(page({
    body: '<section data-region="progress"><p>без заголовка</p></section>',
    explained: ['gates'],
  }));
  assert.match(found, /region "progress" has neither an h2 to hang its i beside/);
});

test('a region that names itself needs no heading', () => {
  const html = page({ explained: ['gates'] })
    .replace('<section data-region="gates"><h2>gates</h2></section>',
      '<section data-region="gates"><h2>gates</h2></section>'
      + '<div data-region="progress" data-region-label="Тумблеры"></div>');
  assert.deepEqual(checkDashboard(html, SPEC), []);
});

// --- the plain register ----------------------------------------------------

test('a region explained in one register and silent in the other is reported', () => {
  const found = messages(page({
    logic: {
      explain: "function (key, state, now, marks, register) {"
        + " return register === 'plain' ? [] : ['что это', 'что сейчас']; }",
    },
  }));
  assert.match(found, /region "progress" has no explanation behind it in the plain register/);
  assert.doesNotMatch(found, /in the normal register/);
});

test('a plain explanation carrying banned shorthand is reported, with the word named', () => {
  const found = messages(page({
    plain: "progress: function () { return ['считается по медиана после гейта']; }",
  }));
  assert.match(found, /a plain string in the plain explanations \(ru\) says "медиана"/);
  assert.match(found, /says "гейт"/);
});

// A branch a fixture never reaches still ships, and the empty state of a region
// is exactly the branch a fixture forgets — so the block is read, not called.
test('shorthand in a branch that is never taken is reported all the same', () => {
  const found = messages(page({
    plain: "progress: function (state) { return [state.tasks ? 'всё хорошо' : 'нет медиана']; }",
  }));
  assert.match(found, /says "медиана"/);
});

test('a label the screen shows is exempt, in its exact form and nowhere else', () => {
  const spec: SpecSources = {
    ...SPEC,
    'vocabulary.md': SPEC['vocabulary.md']
      .replace('| Ход разработки | Development progress | The таски as they are being built |',
        '| Ход разработки | Development progress | The таски as they are being built |'
        + '\n| Гейты | Checks | The four checks |'),
  };
  const withLabel = (body: string): string =>
    page({ plain: body })
      .replace('<h2>Ход разработки</h2>', '<h2>Ход разработки</h2><h2>Гейты</h2><h2>Checks</h2>');

  // The block the reader just clicked on is called «Гейты» on the screen, and a
  // popover forbidden from naming it could not teach it.
  assert.deepEqual(
    checkDashboard(withLabel("progress: function () { return ['Блок «Гейты» — это проверки']; }"), spec),
    [],
  );
  // The same word as ordinary prose is still shorthand.
  assert.match(
    checkDashboard(withLabel("progress: function () { return ['сразу после гейта']; }"), spec)
      .map(v => v.message).join('\n'),
    /says "гейт"/,
  );
});

test('a page with no plain-explanation block at all is reported', () => {
  assert.match(messages(page({ plain: null })),
    /carries no L10N\.ru\.EXPLAIN_PLAIN block to check/);
  assert.match(messages(page({ plainEn: null })),
    /carries no L10N\.en\.EXPLAIN_PLAIN block to check/);
});

test('a specification with no Plain Words table is reported', () => {
  const spec: SpecSources = {
    ...SPEC,
    'vocabulary.md': SPEC['vocabulary.md'].replace('| гейт, гейты | проверка |', ''),
  };
  // The table itself is what is missing, not one of its rows.
  const stripped: SpecSources = {
    ...spec,
    'vocabulary.md': spec['vocabulary.md']
      .replace(/## Plain Words[\s\S]*$/, ''),
  };
  assert.match(messages(page(), stripped),
    /vocabulary\.md has no table with columns Shorthand and Say instead/);
});


// --- the reader's own two controls ------------------------------------------
//
// Neither can be pressed from here. What is held instead is that each choice is
// offered once, that the theme has all three of its states in the stylesheet,
// and that the language control still carries the sentence saying what it does
// not do.

test('a theme with no button is reported', () => {
  const found = messages(page({
    switches: SWITCHES.replace('<button data-theme-choice="dark"></button>', ''),
  }));
  assert.match(found, /the theme "dark" is offered 0 time\(s\)/);
});

test('a language the page carries and cannot be switched to is reported', () => {
  const found = messages(page({
    switches: SWITCHES.replace('<button data-language-choice="en">EN</button>', ''),
  }));
  assert.match(found, /the language "en" is offered 0 time\(s\)/);
});

// The state nobody clicks to reach, and therefore the one a change loses: no
// attribute at all, with the media query deciding.
test('a stylesheet with no follow-the-system dark block is reported', () => {
  const found = messages(page({
    style: STYLE.replace(':root:not([data-theme]) { --bg: #000; }', ''),
  }));
  assert.match(found, /no "system dark" theme block/);
});

test('a colour defined in one theme and not the other is reported', () => {
  const found = messages(page({
    style: STYLE.replace(':root[data-theme="dark"] { --bg: #000; }',
      ':root[data-theme="dark"] { --bg: #000; --ink: #fff; }'),
  }));
  assert.match(found, /"--ink" is declared in the "chosen dark" theme block and not in the light one/);
});

test('a language control with nothing said beside it is reported', () => {
  const found = messages(page({ en: { UI: "{ }" } }));
  assert.match(found, /the en branch carries no viewNote/);
});

test('customProperties reads a block and nothing past its brace', () => {
  const css = ':root { --a: 1; --b: 2; }\n:root[data-theme="dark"] { --c: 3; }';
  assert.deepEqual(customProperties(css, ':root {'), ['--a', '--b']);
  assert.deepEqual(customProperties(css, ':root[data-theme="dark"] {'), ['--c']);
  assert.equal(customProperties(css, ':root[data-theme="sepia"] {'), null);
});
