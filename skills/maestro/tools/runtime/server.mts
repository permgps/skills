// A directory-bound HTTP identity is required before advertising or stopping a viewer.
// Process-table discovery is only an orphan/legacy adapter, never a startup prerequisite.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { atomicText } from './state/write.mts';
import { createLogger } from './shared/log.mts';

const log = createLogger('sync');
const execute = promisify(execFile);
export const IDENTITY_PATH = '/.maestro-viewer-identity';
export interface ViewerRecord {
  pid: number; port: number; root: string; instance: string;
  previousPort?: number; runtime?: 'node' | 'legacy';
}
export interface ViewerAddress { url: string; record: ViewerRecord | null; movedFrom?: number; taken?: boolean }
const alive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
};
const validPort = (port: unknown): port is number => Number.isInteger(port) && Number(port) > 0 && Number(port) < 65536;
const inside = (root: string, file: string): boolean => file.startsWith(root + path.sep);
const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function httpText(port: number, resource: string): Promise<string | null> {
  return new Promise(resolve => {
    const req = request({ host: '127.0.0.1', port, path: resource, method: 'GET', timeout: 300 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) req.destroy(); });
      response.on('end', () => resolve(response.statusCode === 200 ? body : null));
      response.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(null)); req.end();
  });
}
async function identity(port: number): Promise<ViewerRecord | null> {
  try {
    const body = await httpText(port, IDENTITY_PATH);
    const value = JSON.parse(body ?? 'null') as ViewerRecord | null;
    return value && validPort(value.port) && Number.isInteger(value.pid) && typeof value.root === 'string'
      && typeof value.instance === 'string' && value.instance.length > 0 ? value : null;
  } catch { return null; }
}
export async function readViewerRecord(dir: string): Promise<Partial<ViewerRecord> | null> {
  try { return JSON.parse(await readFile(path.join(dir, 'serve.json'), 'utf8')) as Partial<ViewerRecord>; }
  catch { return null; }
}
async function processCommand(pid: number): Promise<string> {
  if (process.platform === 'win32') return '';
  try { return (await execute('ps', ['-p', String(pid), '-o', 'command='], { timeout: 1500 })).stdout.trim(); }
  catch { return ''; }
}
export async function legacyOwner(dir: string, pid: number, port: number, command?: string): Promise<boolean> {
  if (!alive(pid)) return false;
  const line = command ?? await processCommand(pid);
  // Only the exact legacy invocation that Maestro shipped can be adopted.
  const match = /^(?:\S*\/)?python(?:3(?:\.\d+)?)?\s+-m http\.server (\d+) --bind 127\.0\.0\.1 --directory (.+)$/i.exec(line);
  if (!match || Number(match[1]) !== port) return false;
  try {
    if (await realpath(match[2]!) !== dir) return false;
    const served = await httpText(port, '/dashboard.html');
    return served !== null && served === await readFile(path.join(dir, 'dashboard.html'), 'utf8');
  } catch { return false; }
}
export async function verifyViewer(dir: string, record: Partial<ViewerRecord>): Promise<ViewerRecord | null> {
  const root = await realpath(dir);
  if (!validPort(record.port) || typeof record.pid !== 'number' || !alive(record.pid)) return null;
  if (record.root === root && typeof record.instance === 'string' && record.runtime !== 'legacy') {
    const found = await identity(record.port);
    if (found && found.root === root && found.pid === record.pid && found.port === record.port && found.instance === record.instance) {
      return { ...found, ...(record.previousPort === undefined ? {} : { previousPort: record.previousPort }), runtime: 'node' };
    }
    return null;
  }
  if (await legacyOwner(root, record.pid, record.port)) {
    return { pid: record.pid, port: record.port, root, instance: 'legacy-command', runtime: 'legacy' };
  }
  return null;
}
async function discover(dir: string): Promise<ViewerRecord | null> {
  if (process.platform === 'win32') {
    log.warn('ownership', 'forgotten viewer discovery unavailable on this platform', { dir }); return null;
  }
  let listing: string;
  try { listing = (await execute('ps', ['-A', '-o', 'pid=,command='], { timeout: 2000, maxBuffer: 4 * 1024 * 1024 })).stdout; }
  catch { log.warn('ownership', 'process discovery unavailable; foreign listeners preserved', { dir }); return null; }
  for (const line of listing.split('\n')) {
    const entry = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!entry) continue;
    const pid = Number(entry[1]); const command = entry[2]!;
    const serve = / --serve --port (\d+) --instance ([A-Za-z0-9-]+)$/.exec(command);
    if (serve) {
      const found = await identity(Number(serve[1]));
      if (found && found.root === dir && found.pid === pid && found.instance === serve[2]) {
        // HTTP and command must identify the same entry/root, including paths with spaces.
        const prefix = command.slice(0, serve.index);
        for (const boundary of prefix.matchAll(/\s(?=\/)/g)) {
          const entrypoint = prefix.slice(boundary.index + 1);
          try {
            if (await realpath(entrypoint) === path.join(dir, 'sync.mts')) return { ...found, runtime: 'node' };
          } catch { /* This boundary was inside the executable or a spaced path. */ }
        }
      }
    }
    const legacy = / -m http\.server (\d+) /.exec(command);
    if (legacy && await legacyOwner(dir, pid, Number(legacy[1]), command)) {
      return { pid, port: Number(legacy[1]), root: dir, instance: 'legacy-command', runtime: 'legacy' };
    }
  }
  return null;
}
export async function findOwnedViewer(dir: string): Promise<ViewerRecord | null> {
  const root = await realpath(dir);
  const record = await readViewerRecord(root);
  const owned = record ? await verifyViewer(root, record) : null;
  if (owned) return owned;
  if (typeof record?.pid === 'number' && alive(record.pid)) {
    log.warn('ownership', 'recorded viewer ownership unestablished; process preserved', { dir: root, pid: record.pid });
  }
  return discover(root);
}
export async function stopOwnedViewer(dir: string): Promise<boolean> {
  const owned = await findOwnedViewer(dir);
  if (!owned) { log.debug('ownership', 'no verified owned viewer to stop', { dir }); return false; }
  // Recheck identity immediately before signalling; a stale PID is never enough.
  if (!await verifyViewer(dir, owned)) return false;
  try { process.kill(owned.pid, 'SIGTERM'); }
  catch { return false; }
  for (let attempt = 0; attempt < 100 && alive(owned.pid); attempt += 1) await pause(20);
  if (alive(owned.pid)) { log.warn('ownership', 'owned viewer has not stopped', { dir, pid: owned.pid }); return false; }
  log.info('ownership', 'owned viewer stopped', { dir, pid: owned.pid, port: owned.port });
  return true;
}
async function portFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}
async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') { probe.close(); reject(new Error('no available port')); return; }
      probe.close(() => resolve(address.port));
    });
  });
}
export async function ensureViewer(dir: string, entrypoint = path.join(dir, 'sync.mts')): Promise<ViewerAddress> {
  try { return await prepareViewer(dir, entrypoint); }
  catch {
    log.warn('viewer', 'viewer unavailable; use the file snapshot', { dir });
    const root = await realpath(dir).catch(() => path.resolve(dir));
    return { url: pathToFileURL(path.join(root, 'dashboard.html')).href, record: null };
  }
}
async function prepareViewer(dir: string, entrypoint: string): Promise<ViewerAddress> {
  const root = await realpath(dir);
  const fallback: ViewerAddress = { url: pathToFileURL(path.join(root, 'dashboard.html')).href, record: null };
  const remembered = await readViewerRecord(root);
  const owned = await findOwnedViewer(root);
  if (owned) {
    await atomicText(path.join(root, 'serve.json'), JSON.stringify(owned) + '\n');
    log.info('viewer', remembered?.pid === owned.pid ? 'viewer reused' : 'forgotten viewer adopted', { pid: owned.pid, port: owned.port, dir: root });
    return { url: `http://localhost:${owned.port}/dashboard.html`, record: owned };
  }
  const previous = validPort(remembered?.port) ? remembered.port : undefined;
  const taken = previous !== undefined && !await portFree(previous);
  const port = previous !== undefined && !taken ? previous : await availablePort();
  const instance = randomUUID();
  const child = spawn(process.execPath, [await realpath(entrypoint), '--serve', '--port', String(port), '--instance', instance], {
    detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: process.env,
  });
  const ready = await new Promise<ViewerRecord | null>(resolve => {
    const timer = setTimeout(() => resolve(null), 5000);
    const finish = (record: ViewerRecord | null): void => { clearTimeout(timer); resolve(record); };
    child.once('error', () => finish(null)); child.once('exit', () => finish(null));
    child.once('message', message => finish(message as ViewerRecord));
  });
  if (child.connected) child.disconnect();
  child.unref();
  if (!ready || !await verifyViewer(root, ready).catch(() => null)) {
    // This handle is the child just spawned, so signalling it needs no PID-file trust.
    child.kill('SIGTERM'); log.warn('viewer', 'viewer startup failed; use the file snapshot', { dir: root }); return fallback;
  }
  const movedFrom = previous !== undefined && previous !== ready.port ? previous : undefined;
  const record: ViewerRecord = { ...ready, runtime: 'node', ...(movedFrom === undefined ? {} : { previousPort: movedFrom }) };
  try { await atomicText(path.join(root, 'serve.json'), JSON.stringify(record) + '\n'); }
  catch { child.kill('SIGTERM'); log.warn('viewer', 'viewer record could not be written; use file snapshot', { dir: root }); return fallback; }
  log.info('viewer', movedFrom === undefined ? 'viewer started' : 'viewer address moved', { dir: root, port: ready.port, ...(movedFrom === undefined ? {} : { previousPort: movedFrom }) });
  return { url: `http://localhost:${ready.port}/dashboard.html`, record, ...(movedFrom === undefined ? {} : { movedFrom, taken }) };
}
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
// Binding to 127.0.0.1 keeps other machines out but not other origins: a page whose name is rebound to
// 127.0.0.1 reaches this socket with its own name in Host. Only the loopback names the viewer hands out
// are answered.
const loopbackHost = (host: string | undefined, port: number): boolean =>
  host !== undefined && [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(host.toLowerCase());
async function serveRequest(root: string, record: ViewerRecord, req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!loopbackHost(req.headers.host, record.port)) {
    log.warn('viewer', 'foreign host refused', { host: req.headers.host ?? null, port: record.port });
    res.writeHead(403).end(); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  let resource: string;
  try { resource = decodeURIComponent((req.url ?? '/').split('?')[0]!); }
  catch { res.writeHead(400).end(); return; }
  if (resource === IDENTITY_PATH) { res.writeHead(200, { 'Content-Type': MIME['.json']!, 'Cache-Control': 'no-store' }).end(JSON.stringify(record)); return; }
  if (resource.includes('\0') || resource.includes('\\') || resource.split('/').includes('..')) { res.writeHead(403).end(); return; }
  const file = path.resolve(root, '.' + (resource === '/' ? '/dashboard.html' : resource));
  if (!inside(root, file)) { res.writeHead(403).end(); return; }
  try {
    const actual = await realpath(file);
    if (!inside(root, actual)) { res.writeHead(403).end(); return; }
    if (!(await stat(actual)).isFile()) { res.writeHead(404).end(); return; }
    const body = await readFile(actual);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(actual)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end(); }
}
export async function serveDirectory(dir: string, port: number, instance: string): Promise<void> {
  const root = await realpath(dir);
  let record: ViewerRecord = { root, port, pid: process.pid, instance, runtime: 'node' };
  const server = createServer((req, res) => { void serveRequest(root, record, req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('listener has no port');
  record = { ...record, port: address.port };
  process.send?.(record);
  const stop = (): void => { server.close(); server.closeAllConnections(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  await new Promise<void>(resolve => server.once('close', resolve));
}
