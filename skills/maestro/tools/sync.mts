#!/usr/bin/env node
// The sole installed command entrypoint; roots come from this copied file, never cwd.
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLogger } from './runtime/shared/log.mts';
import { candidateMode, candidateViolations, isRecord, validationEnvelope, writeValidation } from './runtime/publication.mts';
import { mirror, snapshots, placeIndex, mirrorValidation } from './runtime/dashboard.mts';
import { FOLDED, spoken, legacyReports, movedMessage } from './runtime/legacy.mts';
import { openPage, openingMessage } from './runtime/opener.mts';
import { ensureViewer, serveDirectory } from './runtime/server.mts';
import { extractStateLiteral } from './runtime/state/read.mts';

export const RUN_DIR = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('sync', process.env['MAESTRO_SYNC_DEBUG'] === '1' ? { level: 'DEBUG' } : {});
async function viewer(noOpen: boolean): Promise<string | null> {
  try { await readFile(path.join(RUN_DIR, 'dashboard.html')); }
  catch { return null; }
  await placeIndex(RUN_DIR);
  const url = (await ensureViewer(RUN_DIR)).url;
  await openPage(RUN_DIR, url, false, noOpen);
  return url;
}
async function refresh(args: string[]): Promise<number> {
  let source: string;
  try { source = await readFile(path.join(RUN_DIR, 'state.js'), 'utf8'); }
  catch { process.stdout.write('sync: no state.js beside this script — nothing to mirror yet\n'); return 2; }
  let text: string;
  try { text = extractStateLiteral(source); }
  catch { process.stdout.write('sync: state assignment has no object literal — the прогон is now invisible\n'); return 1; }
  let state: unknown = null;
  try { state = JSON.parse(text); } catch { log.warn('legacy', 'historical literal is not JSON'); }
  if (isRecord(state) && typeof state['contractVersion'] === 'number' && state['contractVersion'] >= 4) {
    const errors = await candidateViolations(state, RUN_DIR);
    const envelope = validationEnvelope(errors.length ? 'invalid' : 'valid', state, errors, errors.length ? null : state);
    await writeValidation(RUN_DIR, envelope);
    await mirrorValidation(RUN_DIR, envelope);
    if (errors.length) {
      const url = await viewer(args.includes('--no-open'));
      process.stdout.write(`sync: verified-contract state rejected before mirroring; diagnostic at ${url}\n`);
      return 1;
    }
  }
  await mirror(RUN_DIR, text);
  await placeIndex(RUN_DIR);
  const address = await ensureViewer(RUN_DIR);
  const url = address.url;
  if (!address.record) process.stdout.write(`sync: no server — open ${path.join(RUN_DIR, 'dashboard.html')} directly; it shows the snapshot and will not tick\n`);
  if (address.movedFrom !== undefined) process.stdout.write(movedMessage(spoken(state), address.movedFrom, !!address.taken) + '\n');
  process.stdout.write(`${url}\n${FOLDED[spoken(state)]}\n`);
  const message = openingMessage(spoken(state), await openPage(RUN_DIR, url, args.includes('--reopen'), args.includes('--no-open')), url);
  if (message) process.stdout.write(message + '\n');
  if (state === null) {
    process.stdout.write('sync: state.js is valid JavaScript but not valid JSON.\n      The dashboard renders it; scripts/metrics/measure.ts cannot read it.\n      Quote every key and use JSON values — the writer emits JSON.stringify output.\n');
    return 1;
  }
  const reports = legacyReports(state);
  if (reports.length) process.stdout.write(reports.join('\n') + '\n');
  return reports.length ? 1 : 0;
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  if (args[0] === '--serve') {
    try { await serveDirectory(RUN_DIR, Number(args[args.indexOf('--port') + 1]), args[args.indexOf('--instance') + 1] ?? ''); return 0; }
    catch { log.error('serve', 'listener could not start', { dir: RUN_DIR }); return 2; }
  }
  if (['--validate', '--project', '--publish'].includes(args[0] ?? '')) {
    const outcome = await candidateMode(args, RUN_DIR, viewer, (state, envelope) => snapshots(RUN_DIR, state, envelope));
    process.stdout.write(JSON.stringify(outcome.result) + '\n');
    return outcome.code;
  }
  try { return await refresh(args); }
  catch { log.error('refresh', 'state or dashboard could not be refreshed', { dir: RUN_DIR }); return 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main());
}
