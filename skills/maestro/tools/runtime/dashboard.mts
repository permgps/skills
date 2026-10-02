// Dashboard snapshots are derived outputs; they never authorize state transitions.
import { readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from './shared/log.mts';
import { atomicText } from './state/write.mts';
import type { RunState } from './state/contract.mts';
import type { ValidationEnvelope } from './publication.mts';

const log = createLogger('sync');
const snapshot = /(\/\*\s*maestro:snapshot:start\s*\*\/)[\s\S]*?(\/\*\s*maestro:snapshot:end\s*\*\/)/;
const diagnostic = /(\/\*\s*maestro:validation:start\s*\*\/)[\s\S]*?(\/\*\s*maestro:validation:end\s*\*\/)/;
// The HTML tokenizer ends an inline script at `</script` and enters escaped states at `<!--` / `<script`,
// whatever the JS around them means. Inside a string literal \u003c is the same character.
const breaking = /<(?=\/?script|!--)/gi;
function inline(file: string, literal: string): string {
  const escaped = literal.replace(breaking, '\\u003c');
  if (escaped !== literal) log.debug('snapshot', 'script-breaking sequences escaped', { file });
  return escaped;
}
export async function mirror(dir: string, text: string): Promise<boolean> {
  const file = path.join(dir, 'dashboard.html');
  const page = await readFile(file, 'utf8');
  if (!snapshot.test(page)) throw new Error('dashboard.html has no maestro:snapshot markers');
  const updated = page.replace(snapshot, (_match, start: string, end: string) => `${start}\nglobalThis.MAESTRO_SNAPSHOT = ${inline(file, text)};\n${end}`);
  if (page === updated) return false;
  await atomicText(file, updated);
  log.debug('snapshot', 'state snapshot mirrored', { file });
  return true;
}
export async function mirrorValidation(dir: string, envelope: ValidationEnvelope): Promise<void> {
  const file = path.join(dir, 'dashboard.html');
  let page: string;
  try { page = await readFile(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  const updated = page.replace(diagnostic, (_match, start: string, end: string) => `${start}\nglobalThis.MAESTRO_VALIDATION_SNAPSHOT = ${inline(file, JSON.stringify(envelope))};\n${end}`);
  if (page !== updated) await atomicText(file, updated);
}
export async function snapshots(dir: string, state: RunState | null, envelope: ValidationEnvelope): Promise<void> {
  await mirrorValidation(dir, envelope);
  if (state) {
    try { await mirror(dir, JSON.stringify(state)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
export async function placeIndex(dir: string): Promise<boolean> {
  try { await symlink('dashboard.html', path.join(dir, 'index.html')); return true; }
  catch { log.debug('index', 'index link unavailable; root is served directly', { dir }); return false; }
}
