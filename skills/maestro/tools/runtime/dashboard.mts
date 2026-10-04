// Dashboard snapshots are derived outputs; they never authorize state transitions.
import { readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from './shared/log.mts';
import { atomicText } from './state/write.mts';
import type { RunState } from './state/contract.mts';
import type { ValidationEnvelope } from './publication.mts';

const log = createLogger('sync');
// Each marker owns a whole line. The serialized literal is one line, so a marker spelled inside a state
// string can never stand alone on one; an unanchored lazy match stopped at such a copy and left the old
// tail in the page as code.
const snapshot = /^([ \t]*\/\*\s*maestro:snapshot:start\s*\*\/)$[\s\S]*?^([ \t]*\/\*\s*maestro:snapshot:end\s*\*\/)$/m;
const diagnostic = /^([ \t]*\/\*\s*maestro:validation:start\s*\*\/)$[\s\S]*?^([ \t]*\/\*\s*maestro:validation:end\s*\*\/)$/m;
// The HTML tokenizer ends an inline script at `</script` and enters escaped states at `<!--` / `<script`,
// whatever the JS around them means. Inside a string literal \u003c is the same character.
const breaking = /<(?=\/?script|!--)/gi;
// JSON puts `*/` only inside strings, where `*\/` reads the same; escaping it keeps a comment-shaped
// marker out of the literal entirely, so the line anchors above are not the only thing holding.
const closing = /\*\//g;
function inline(file: string, literal: string): string {
  const escaped = literal.replace(breaking, '\\u003c').replace(closing, '*\\/');
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
