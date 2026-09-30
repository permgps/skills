#!/usr/bin/env node
// Isolated integrated-browser regression for the preservation contract.
// It uses an already installed Chrome/Chromium executable and Node built-ins.

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFile, mkdtemp, rm, writeFile, mkdir, copyFile, cp, realpath } from 'node:fs/promises';
import { tmpdir, hostname, homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';

import { verifiedState } from '../state/fixtures/verification.ts';
import { importEvidence, validateEvidence } from '../state/evidence.ts';
import { writeState } from '../state/write.ts';
import { createLogger } from '../shared/log.ts';

const log = createLogger('parity-browser');

class BrowserUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserUnavailableError';
  }
}

export const VARIANTS = [
  'correct', 'missing-binding', 'unmounted', 'synthetic-only',
  'premature-close', 'missing-column', 'missing-promotion', 'missing-image',
  'hidden-panel', 'changed-shared-asset', 'resource-failure',
] as const;
export type Variant = typeof VARIANTS[number];

export interface Probe {
  visible: boolean;
  columns: string[];
  promotion: boolean;
  image: boolean;
  imageLoaded: boolean;
  signature: string;
}
export interface Scenario {
  variant: Variant;
  initial: Probe;
  hover: Probe;
  panel: Probe;
  exit: Probe;
  screenshots: Record<string, { path: string; sha256: string }>;
  passed: boolean;
  failures: string[];
}
export interface BrowserSuiteResult {
  scenarios: Scenario[];
  browser: string;
  browserVersion: string;
  host: string;
  fixtureSha256: string;
  evidenceState: string;
  changedInputInvalidated: boolean;
  persistenceControls: PersistenceControls;
  workflowFixtureOracle: { reference: WorkflowPageProbe; broken: WorkflowPageProbe };
}

export interface WorkflowPageProbe {
  passed: boolean;
  failures: string[];
  browserVersion: string;
  screenshots?: Record<string, { path: string; sha256: string }>;
}

const fixturePath = path.join(import.meta.dirname, 'fixtures', 'parity', 'menu.html');
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

export function browserExecutable(): string | undefined {
  if (process.env.MAESTRO_BROWSER) return process.env.MAESTRO_BROWSER;
  if (process.platform === 'darwin') {
    const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(homedir(), 'Library', 'Caches', 'ms-playwright');
    try {
      const releases = fs.readdirSync(cache)
        .filter(name => /^chromium_headless_shell-\d+$/.test(name))
        .sort((a, b) => Number(b.split('-').at(-1)) - Number(a.split('-').at(-1)));
      for (const release of releases) {
        const candidate = path.join(cache, release, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
        if (requireExecutable(candidate)) return candidate;
      }
    } catch { /* The Playwright cache is optional. */ }
    const installedChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (requireExecutable(installedChrome)) return installedChrome;
  }
  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of ['chromium', 'chromium-browser', 'google-chrome']) {
      const candidate = path.join(entry, name);
      if (requireExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}

function requireExecutable(candidate: string): boolean {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

class Cdp {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private socket: WebSocket;
  private listeners = new Map<string, Array<(params: any) => void>>();
  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
        return;
      }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result ?? {});
    });
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method: string, listener: (params: any) => void): void {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }
  close(): void { this.socket.close(); }
}

async function connect(url: string): Promise<Cdp> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('browser DevTools socket failed')), { once: true });
  });
  return new Cdp(socket);
}

async function startFixtureServer(html: string): Promise<{ server: Server; port: number }> {
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/menu')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    } else {
      response.writeHead(404);
      response.end('missing fixture resource');
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    throw new BrowserUnavailableError(`loopback fixture server failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server has no port');
  return { server, port: address.port };
}

async function startPageServer(root: string): Promise<{ server: Server; port: number }> {
  const realRoot = await realpath(root);
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      const requested = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
      const target = await realpath(path.resolve(root, requested));
      if (!target.startsWith(`${realRoot}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const contents = await readFile(target);
      const contentType = target.endsWith('.html') ? 'text/html; charset=utf-8'
        : target.endsWith('.css') ? 'text/css; charset=utf-8'
          : target.endsWith('.js') ? 'text/javascript; charset=utf-8'
            : target.endsWith('.svg') ? 'image/svg+xml'
              : target.endsWith('.png') ? 'image/png' : 'application/octet-stream';
      response.writeHead(200, { 'content-type': contentType }).end(contents);
    } catch {
      response.writeHead(404).end('missing page resource');
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    throw new BrowserUnavailableError(`loopback page server failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('page server has no port');
  return { server, port: address.port };
}

async function stopBrowser(child: ChildProcess, closed: Promise<void>): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const forceStop = setTimeout(() => child.kill('SIGKILL'), 5_000);
  try {
    await closed;
    log.info('cleanup', '[FIX] browser process closed', { pid: child.pid });
  } finally {
    clearTimeout(forceStop);
  }
}

async function startBrowser(executable: string, profile: string): Promise<{
  process: ChildProcess; closed: Promise<void>; cdp: Cdp;
}> {
  if (!requireExecutable(executable)) throw new BrowserUnavailableError(`browser unavailable: ${executable}`);
  const child = spawn(executable, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });
  const closed = new Promise<void>(resolve => {
    child.once('close', () => resolve());
  });
  try {
    let spawnError: Error | undefined;
    child.once('error', error => { spawnError = error; });
    const activePort = path.join(profile, 'DevToolsActivePort');
    let debugPort: number | undefined;
    for (let i = 0; i < 100; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`browser exited before DevTools opened (${child.exitCode})`);
      try { debugPort = Number((await readFile(activePort, 'utf8')).split('\n')[0]); break; }
      catch { await sleep(50); }
    }
    if (!debugPort) throw new Error('browser DevTools port did not become ready');
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as Array<{
      type: string; webSocketDebuggerUrl: string;
    }>;
    const target = targets.find(item => item.type === 'page');
    if (!target) throw new Error('browser has no page target');
    return { process: child, closed, cdp: await connect(target.webSocketDebuggerUrl) };
  } catch (error) {
    await stopBrowser(child, closed);
    throw new BrowserUnavailableError(`browser did not start: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function evaluate<T>(cdp: Cdp, expression: string): Promise<T> {
  const result = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error('browser evaluation failed');
  return result.result.value as T;
}

async function pointer(cdp: Cdp, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sleep(100);
}

const probeExpression = `(() => {
  const panel = document.getElementById('panel');
  const rect = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  const image = document.getElementById('hero');
  return {
    visible: style.display !== 'none' && style.visibility !== 'hidden'
      && rect.width > 0 && rect.height > 0,
    columns: [...panel.querySelectorAll('.column')].map(node => node.textContent.trim()),
    promotion: Boolean(document.getElementById('promotion')),
    image: Boolean(image),
    imageLoaded: Boolean(image && image.complete && image.naturalWidth > 0),
    signature: window.fixtureSignature,
  };
})()`;

async function screenshot(cdp: Cdp, dir: string, name: string): Promise<{ path: string; sha256: string }> {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const bytes = Buffer.from(result.data, 'base64');
  const target = path.join(dir, `${name}.png`);
  await writeFile(target, bytes);
  return { path: target, sha256: digest(bytes) };
}

export function assess(probes: Pick<Scenario, 'initial' | 'hover' | 'panel' | 'exit'>): string[] {
  const failures: string[] = [];
  if (probes.initial.visible) failures.push('panel visible before pointer input');
  if (!probes.hover.visible) failures.push('real pointer hover did not open panel');
  if (!probes.panel.visible) failures.push('panel closed before pointer entered content');
  if (probes.exit.visible) failures.push('panel remained visible after pointer exit');
  if (!probes.panel.columns.includes('Accounts') || !probes.panel.columns.includes('Cards'))
    failures.push('required menu column missing');
  if (!probes.panel.promotion) failures.push('required promotion missing');
  if (!probes.panel.image || !probes.panel.imageLoaded) failures.push('required image missing or failed');
  return failures;
}

async function runScenario(cdp: Cdp, port: number, variant: Variant, dir: string): Promise<Scenario> {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/menu?variant=${variant}` });
  let loaded = false;
  for (let i = 0; i < 100; i++) {
    const ready = await evaluate<boolean>(cdp,
      `document.readyState === "complete" && location.search === "?variant=${variant}"`);
    if (ready) { loaded = true; break; }
    await sleep(20);
  }
  if (!loaded) throw new Error(`fixture ${variant} did not become ready`);
  await pointer(cdp, 700, 400);
  const initial = await evaluate<Probe>(cdp, probeExpression);
  const screenshots: Scenario['screenshots'] = {};
  screenshots.initial = await screenshot(cdp, dir, `${variant}-initial`);
  await pointer(cdp, 75, 40);
  const hover = await evaluate<Probe>(cdp, probeExpression);
  screenshots.hover = await screenshot(cdp, dir, `${variant}-hover`);
  await pointer(cdp, 75, 110);
  const panel = await evaluate<Probe>(cdp, probeExpression);
  screenshots.panel = await screenshot(cdp, dir, `${variant}-panel`);
  await pointer(cdp, 700, 400);
  const exit = await evaluate<Probe>(cdp, probeExpression);
  screenshots.exit = await screenshot(cdp, dir, `${variant}-exit`);
  const failures = assess({ initial, hover, panel, exit });
  return { variant, initial, hover, panel, exit, screenshots, failures, passed: failures.length === 0 };
}

/** Grade the final workflow page by real pointer input against its known menu surface. */
export async function probeWorkflowPage(htmlPath: string, captureDir?: string): Promise<WorkflowPageProbe> {
  const executable = browserExecutable();
  if (!executable) throw new BrowserUnavailableError('browser unavailable for workflow page probe');
  const { server, port } = await startPageServer(path.dirname(htmlPath));
  const profile = await mkdtemp(path.join(tmpdir(), 'maestro-workflow-chrome-'));
  let child: ChildProcess | undefined;
  let closed: Promise<void> | undefined;
  let cdp: Cdp | undefined;
  try {
    const started = await startBrowser(executable, profile);
    child = started.process;
    closed = started.closed;
    cdp = started.cdp;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 900, height: 500, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${path.basename(htmlPath)}` });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      ready = await evaluate<boolean>(cdp, 'document.readyState === "complete"');
      if (ready) break;
      await sleep(20);
    }
    if (!ready) throw new Error('workflow page did not become ready');
    const nodes = await evaluate<{ trigger: boolean; panel: boolean }>(cdp, `({
      trigger: Boolean(document.querySelector('#services')),
      panel: Boolean(document.querySelector('#details')),
    })`);
    if (!nodes.trigger || !nodes.panel) {
      const version = await cdp.send('Browser.getVersion');
      if (captureDir) await mkdir(captureDir, { recursive: true });
      return {
        passed: false,
        failures: [
          ...(!nodes.trigger ? ['required Services trigger missing'] : []),
          ...(!nodes.panel ? ['required Services panel missing'] : []),
        ],
        browserVersion: String(version.product ?? 'Chrome/Chromium'),
        ...(captureDir ? { screenshots: { initial: await screenshot(cdp, captureDir, 'initial') } } : {}),
      };
    }
    if (captureDir) await mkdir(captureDir, { recursive: true });
    const screenshots: Record<string, { path: string; sha256: string }> = {};
    const point = await evaluate<{ x: number; y: number }>(cdp, `(() => {
      const rect = document.querySelector('#services').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    const visible = (): Promise<boolean> => evaluate<boolean>(cdp!, `(() => {
      const panel = document.querySelector('#details');
      if (!panel) return false;
      const style = getComputedStyle(panel);
      const rect = panel.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    })()`);
    await pointer(cdp, 800, 400);
    const initial = await visible();
    if (captureDir) screenshots.initial = await screenshot(cdp, captureDir, 'initial');
    await pointer(cdp, point.x, point.y);
    const hover = await visible();
    if (captureDir) screenshots.hover = await screenshot(cdp, captureDir, 'hover');
    const panelPoint = await evaluate<{ x: number; y: number }>(cdp, `(() => {
      const rect = document.querySelector('#details').getBoundingClientRect();
      return { x: rect.x + Math.min(rect.width / 2, 80), y: rect.y + Math.min(rect.height / 2, 80) };
    })()`);
    await pointer(cdp, panelPoint.x, panelPoint.y);
    const panel = await visible();
    if (captureDir) screenshots.panel = await screenshot(cdp, captureDir, 'panel');
    const structure = await evaluate<boolean>(cdp, `(() => {
      const content = document.querySelector('#details')?.textContent ?? '';
      return ['Accounts', 'Cards', 'Featured offer'].every(item => content.includes(item));
    })()`);
    await pointer(cdp, 800, 400);
    const exit = await visible();
    if (captureDir) screenshots.exit = await screenshot(cdp, captureDir, 'exit');
    const failures = [
      ...(initial ? ['panel visible before pointer input'] : []),
      ...(!hover ? ['real pointer hover did not open panel'] : []),
      ...(!panel ? ['panel closed before pointer entered content'] : []),
      ...(exit ? ['panel remained visible after pointer exit'] : []),
      ...(!structure ? ['required menu content missing'] : []),
    ];
    const version = await cdp.send('Browser.getVersion');
    return { passed: failures.length === 0, failures,
      browserVersion: String(version.product ?? 'Chrome/Chromium'),
      ...(captureDir ? { screenshots } : {}) };
  } finally {
    cdp?.close();
    if (child && closed) await stopBrowser(child, closed);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

async function publishPositiveEvidence(
  outputDir: string,
  reference: Scenario,
  browser: string,
  browserVersion: string,
  fixtureSha256: string,
): Promise<{ statePath: string; changedInputInvalidated: boolean }> {
  const state = verifiedState();
  const record = state.verification!;
  const observedAt = new Date().toISOString();
  state.runId = `parity-browser-${Date.now()}`;
  state.startedAt = observedAt;
  state.updatedAt = observedAt;
  state.lifecycle = 'active';
  delete state.outcome;
  delete state.finishedAt;
  state.stages[0]!.startedAt = observedAt;
  state.stages[0]!.status = 'active';
  delete state.stages[0]!.finishedAt;
  state.gates.find(gate => gate.id === 'G4')!.status = 'pending';
  record.coverageReviews = [];
  record.acceptanceRounds = [];
  record.executions[0]!.executedAt = observedAt;
  for (const capture of record.evidence) capture.capturedAt = observedAt;
  const referenceCapture = reference.screenshots.panel!;
  const buildCapture = reference.screenshots.hover!;
  record.evidence[0]!.path = 'evidence/REF-1/reference.png';
  record.evidence[0]!.sha256 = referenceCapture.sha256;
  record.evidence[0]!.mediaType = 'image/png';
  record.evidence[1]!.path = 'evidence/X-1/build.png';
  record.evidence[1]!.sha256 = buildCapture.sha256;
  record.evidence[1]!.mediaType = 'image/png';
  record.executions[0]!.invocation = 'CDP Input.dispatchMouseEvent: initial, hover, panel, exit';
  record.executions[0]!.tool = `${browserVersion} via CDP`;
  record.executions[0]!.host = hostname();
  record.executions[0]!.viewport = '900x500';
  record.executions[0]!.assertions = [
    { name: 'initial hidden, hover visible, panel usable, exit hidden', result: 'passed', evidenceIds: ['E-1'] },
    { name: 'required columns, promotion, and loaded image', result: 'passed', evidenceIds: ['E-1'] },
  ];
  const referenceInput = path.join(outputDir, 'reference', 'menu.html');
  const buildInput = path.join(outputDir, 'build', 'menu.html');
  await mkdir(path.dirname(referenceInput), { recursive: true });
  await mkdir(path.dirname(buildInput), { recursive: true });
  await copyFile(fixturePath, referenceInput);
  await copyFile(fixturePath, buildInput);
  for (const fingerprint of [record.checks[0]!.currentFingerprint, record.executions[0]!.fingerprint]) {
    fingerprint.reference = fixtureSha256;
    fingerprint.build = fixtureSha256;
    fingerprint.runtime = `${browserVersion}:900x500`;
    fingerprint.relevantPaths = ['reference/menu.html', 'build/menu.html'];
    fingerprint.inputHashes = {
      'reference/menu.html': fixtureSha256,
      'build/menu.html': fixtureSha256,
    };
  }
  const sources = {
    'E-REF': path.basename(referenceCapture.path),
    'E-1': path.basename(buildCapture.path),
  };
  const imported = await importEvidence(state, outputDir, outputDir, sources);
  if (imported.length) throw new Error(`browser captures failed import: ${imported.map(item => item.message).join('; ')}`);
  const stateDir = path.join(outputDir, '.maestro');
  await writeState(stateDir, state);
  const statePath = path.join(stateDir, 'state.js');
  await writeFile(buildInput, `${await readFile(buildInput, 'utf8')}\n<!-- changed shared asset -->\n`);
  const changedInputInvalidated = (await validateEvidence(state, outputDir))
    .some(item => /relevant input changed/.test(item.message));
  await copyFile(fixturePath, buildInput);
  if (!changedInputInvalidated) throw new Error('changed build input did not invalidate browser evidence');
  return { statePath, changedInputInvalidated };
}

export async function runBrowserSuite(outputDir: string): Promise<BrowserSuiteResult> {
  const executable = browserExecutable();
  if (!executable) throw new BrowserUnavailableError('browser unavailable: set MAESTRO_BROWSER to an installed Chrome/Chromium executable');
  const html = await readFile(fixturePath, 'utf8');
  const { server, port } = await startFixtureServer(html);
  const profile = await mkdtemp(path.join(tmpdir(), 'maestro-parity-chrome-'));
  let child: ChildProcess | undefined;
  let closed: Promise<void> | undefined;
  let cdp: Cdp | undefined;
  try {
    const started = await startBrowser(executable, profile);
    child = started.process;
    closed = started.closed;
    cdp = started.cdp;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 900, height: 500, deviceScaleFactor: 1, mobile: false,
    });
    const version = await cdp.send('Browser.getVersion');
    const scenarios: Scenario[] = [];
    for (const variant of VARIANTS) {
      scenarios.push(await runScenario(cdp, port, variant, outputDir));
    }
    const reference = scenarios.find(item => item.variant === 'correct');
    if (!reference?.passed) throw new Error('reference control failed browser assertions');
    const negative = scenarios.filter(item => item.variant !== 'correct');
    if (negative.some(item => item.passed)) throw new Error('a broken variant passed the reference oracle');
    if (negative.some(item => item.hover.signature !== reference.hover.signature))
      throw new Error('signature control changed between reference and broken build');
    const fixtureSha256 = digest(Buffer.from(html));
    const evidence = await publishPositiveEvidence(outputDir, reference, executable,
      String(version.product ?? 'Chrome/Chromium'), fixtureSha256);
    const workflowFixtureOracle = {
      reference: await probeWorkflowPage(path.join(import.meta.dirname, 'fixtures', 'parity-workflow', 'legacy', 'index.html')),
      broken: await probeWorkflowPage(path.join(import.meta.dirname, 'fixtures', 'parity-workflow', 'starter', 'index.html')),
    };
    if (!workflowFixtureOracle.reference.passed || workflowFixtureOracle.broken.passed) {
      throw new Error('workflow fixture pointer oracle failed its positive or negative control');
    }
    const persistenceControls = await runPersistenceControls(path.join(outputDir, 'persistence'));
    return {
      persistenceControls, scenarios, browser: executable, browserVersion: String(version.product ?? 'Chrome/Chromium'),
      host: hostname(), fixtureSha256, evidenceState: evidence.statePath,
      changedInputInvalidated: evidence.changedInputInvalidated, workflowFixtureOracle,
    };
  } finally {
    cdp?.close();
    if (child && closed) await stopBrowser(child, closed);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    log.info('cleanup', '[FIX] browser profile removed', { profile });
  }
}

export interface PersistenceObservation {
  variant: string;
  saved: boolean;
  retainedAfterRestart: boolean;
  limitRespected?: boolean;
  noOutboundRequests?: boolean;
  captures: Record<string, { path: string; sha256: string }>;
  browserVersion: string;
}

export interface PersistenceControls {
  observations: PersistenceObservation[];
  oracle: string;
  fixtureSha256: string;
  mainUnchanged: boolean;
}

export function assessPersistence(observation: Pick<PersistenceObservation, 'saved' | 'retainedAfterRestart'>): string[] {
  return [...(!observation.saved ? ['save action did not retain entry'] : []),
    ...(!observation.retainedAfterRestart ? ['entry lost after process restart'] : [])];
}

/** Disposable fixture and browser profiles; the authority and production inputs stay unchanged. */
export async function runPersistenceControls(outputDir: string, fixtureFile?: string, variants = ['clean', 'disabled-save', 'volatile-only', 'restored'], entryLimit?: number): Promise<PersistenceControls> {
  const executable = browserExecutable();
  if (!executable) throw new BrowserUnavailableError('browser unavailable for persistence control');
  const source = fixtureFile ?? path.join(import.meta.dirname, 'fixtures', 'completion-workflow', 'persistence.html');
  const original = await readFile(source);
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-persistence-copy-'));
  await mkdir(outputDir, { recursive: true });
  if (fixtureFile) await cp(path.dirname(fixtureFile), root, { recursive: true });
  await writeFile(path.join(root, 'index.html'), original);
  const { server, port } = await startPageServer(root);
  const observations: PersistenceObservation[] = [];
  const oracle = 'save action retains entry; same entry remains after process restart';
  let child: ChildProcess | undefined;
  let closed: Promise<void> | undefined;
  let cdp: Cdp | undefined;
  const navigate = async (variant: string): Promise<void> => {
    await cdp!.send('Page.enable'); await cdp!.send('Runtime.enable');
    await cdp!.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html?variant=${variant}` });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate<boolean>(cdp!, `document.readyState === 'complete' && Boolean(document.querySelector('#entry')) && location.search === '?variant=${variant}'`)) return;
      await sleep(20);
    }
    throw new Error('persistence fixture did not start');
  };
  const click = async (selector: string): Promise<void> => {
    const point = await evaluate<{ x: number; y: number }>(cdp!, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await cdp!.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await cdp!.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  try {
    for (const variant of variants) {
      const requests: string[] = [];
      const profile = path.join(root, `profile-${variant}`);
      await mkdir(profile);
      const start = async (): Promise<void> => {
        await rm(path.join(profile, 'DevToolsActivePort'), { force: true });
        const started = await startBrowser(executable, profile);
        child = started.process; closed = started.closed; cdp = started.cdp;
        cdp.on('Network.requestWillBeSent', params => requests.push(String(params.request?.url ?? '')));
        await cdp.send('Network.enable');
      };
      await start(); await navigate(variant);
      const captures: PersistenceObservation['captures'] = {};
      captures.initial = await screenshot(cdp!, outputDir, `${variant}-initial`);
      await click('#entry'); await cdp!.send('Input.insertText', { text: 'retained-example' });
      await click('#save');
      const saved = await evaluate<boolean>(cdp!, `document.querySelector('#entries').textContent.includes('retained-example')`);
      captures.saved = await screenshot(cdp!, outputDir, `${variant}-saved`);
      cdp!.close(); cdp = undefined;
      await stopBrowser(child!, closed!); child = undefined; closed = undefined;
      await start(); await navigate(variant);
      const retainedAfterRestart = await evaluate<boolean>(cdp!, `document.querySelector('#entries').textContent.includes('retained-example')`);
      captures.reopened = await screenshot(cdp!, outputDir, `${variant}-reopened`);
      const version = await cdp!.send('Browser.getVersion');
      let limitRespected: boolean | undefined;
      if (entryLimit !== undefined) {
        for (let index = 2; index <= entryLimit + 1; index++) {
          await evaluate(cdp!, `document.querySelector('#entry').value = ''`);
          await click('#entry'); await cdp!.send('Input.insertText', { text: `limit-${index}` });
          await click('#save');
        }
        const text = await evaluate<string>(cdp!, `document.querySelector('#entries').textContent`);
        limitRespected = text.includes('retained-example') && text.includes(`limit-${entryLimit}`)
          && !text.includes(`limit-${entryLimit + 1}`);
        captures.limit = await screenshot(cdp!, outputDir, `${variant}-limit`);
      }
      const noOutboundRequests = requests.every(url => url.startsWith(`http://127.0.0.1:${port}/`)
        || /^(?:data|blob|about):/.test(url));
      observations.push({ variant, saved, retainedAfterRestart,
        ...(limitRespected !== undefined ? { limitRespected } : {}), noOutboundRequests, captures, browserVersion: String(version.product) });
      cdp!.close(); cdp = undefined;
      await stopBrowser(child!, closed!); child = undefined; closed = undefined;
      log.info('persistence', 'restart journey executed', { variant, saved, retainedAfterRestart });
    }
    const mainUnchanged = digest(await readFile(source)) === digest(original);
    if (!mainUnchanged) throw new Error('persistence authority changed during control');
    for (const observation of observations) {
      const shouldPass = observation.variant === 'clean' || observation.variant === 'restored';
      if ((assessPersistence(observation).length === 0) !== shouldPass) throw new Error(`persistence oracle failed control ${observation.variant}`);
    }
    return { observations, oracle, mainUnchanged, fixtureSha256: digest(original) };
  } finally {
    cdp?.close(); if (child && closed) await stopBrowser(child, closed);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

async function main(): Promise<number> {
  const outputDir = process.argv[2] ?? await mkdtemp(path.join(tmpdir(), 'maestro-parity-browser-'));
  await fs.promises.mkdir(outputDir, { recursive: true });
  try {
    const result = await runBrowserSuite(outputDir);
    await writeFile(path.join(outputDir, 'results.json'), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`parity-browser: OK; results ${outputDir}\n`);
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', '[FIX] browser suite failed', { reason });
    const unavailable = error instanceof BrowserUnavailableError;
    process.stderr.write(`parity-browser: ${unavailable ? 'unavailable' : 'failed'} — ${reason}\n`);
    return unavailable ? 2 : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exit(await main());
}
