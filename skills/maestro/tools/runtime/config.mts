// The project's defaults file, `.maestro/config.json`, and the one change a
// прогон makes to it once it exists.
//
// The file is the user's. Preflight writes it once, on the first прогон, and the
// rule is to never rewrite a file that is already there. The models pin is the
// single exception: it is asked once per project *and host*, so a second host
// meets a file the first one wrote, and its answer has to go into that file
// without touching anything else in it. A hand-merged JSON edit is exactly the
// ritual-by-hand the helper exists to remove, so the merge is code with tests:
// it sets `models.<host>` and keeps every other key and value as it found them.
//
// Contract: docs/spec/dials.md, section "Models"; docs/spec/artifacts.md,
// `config.json`.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { HOST_IDS, UnknownHostError, isHostId, replaceKeepingMode } from './memory.mts';
import { createLogger } from './shared/log.mts';

const log = createLogger('config');

export const CONFIG_FILE = 'config.json';

/**
 * Every key the file may carry. `npm run state` holds this to the key table in
 * `docs/spec/dials.md`; a reader ignores a key it does not know, which is why
 * adding one leaves `configVersion` at 1.
 */
export const CONFIG_KEYS = ['configVersion', 'mode', 'explain', 'language', 'models'] as const;

/** One host's pin: each half `session` or a model name that host reports. */
export interface ModelPin {
  strong: string;
  standard: string;
}

/**
 * - `written`: the pin is in the file.
 * - `absent`: there is no file. Creating one would read as "the register and the
 *   mode were asked", and preflight step 3b always writes it first, so this means
 *   3b did not run.
 * - `unreadable`: the file will not parse, or is not an object. It is left byte
 *   for byte as it was, because guessing what the user meant is the edit this
 *   module refuses to make.
 */
export type PinResult = 'written' | 'absent' | 'unreadable';

export interface PinOutcome {
  result: PinResult;
  path: string;
  /** Whether this host already had a pin, stale or not, that the write replaced. */
  replaced: boolean;
}

/** A pin with an empty half: the caller resolved nothing, and `session` is how to say "no model". */
export class EmptyModelPinError extends Error {
  readonly half: keyof ModelPin;

  constructor(half: keyof ModelPin) {
    super(`models.${half} is empty — write "session" to pass no model, or a model name the host reports`);
    this.name = 'EmptyModelPinError';
    this.half = half;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The file's text, or `null` when there is no file. Any other failure to read is `unreadable`. */
async function readConfigText(target: string): Promise<string | null | Error> {
  try { return await readFile(target, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Set `models.<host>` in `<maestroDir>/config.json`, keeping every other key.
 *
 * Written through a temporary file and a rename with the file's own mode, by the
 * memory file's writer, for its reason: a person or the next session reading the
 * file mid-write must never see half of it.
 */
export async function pinModels(maestroDir: string, host: string, pin: ModelPin): Promise<PinOutcome> {
  if (!isHostId(host)) throw new UnknownHostError(host);
  for (const half of ['strong', 'standard'] as const) {
    if (typeof pin[half] !== 'string' || pin[half].trim() === '') throw new EmptyModelPinError(half);
  }
  const target = path.join(maestroDir, CONFIG_FILE);
  const text = await readConfigText(target);
  if (text === null) {
    log.warn('refused', 'no config.json to pin into; the pin holds for this прогон only', { path: target, result: 'absent' });
    return { result: 'absent', path: target, replaced: false };
  }
  let parsed: unknown;
  try { parsed = text instanceof Error ? undefined : JSON.parse(text); }
  catch { parsed = undefined; }
  if (!isRecord(parsed)) {
    log.warn('refused', 'config.json is not a JSON object; left as it is', { path: target, result: 'unreadable' });
    return { result: 'unreadable', path: target, replaced: false };
  }
  log.debug('parse', 'config.json parsed', { path: target, keys: Object.keys(parsed) });

  // An invalid `models` is dropped on its own, the way a reader ignores it; the
  // rest of the file is the user's and stays as it is.
  const models = isRecord(parsed['models']) ? parsed['models'] : {};
  const replaced = Object.hasOwn(models, host);
  log.debug('pin', 'pinning the models for this host', { host, replaced });
  const next = { ...parsed, models: { ...models, [host]: { strong: pin.strong, standard: pin.standard } } };
  await replaceKeepingMode(target, `${JSON.stringify(next, null, 2)}\n`);
  log.info('written', 'models pinned', { path: target, host });
  return { result: 'written', path: target, replaced };
}

export interface ConfigCommandOutcome {
  result: Record<string, unknown>;
  code: number;
}

const optionOf = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

/**
 * `--config-models --host <id>`, `{"strong":"…","standard":"…"}` on stdin.
 * Exit 0 written; 1 when the file refuses the pin (`absent`, `unreadable`) — the
 * pin then holds for this прогон only; 2 when the host or the pin could not be
 * used. `runDir` is `.maestro/`.
 */
export async function configCommand(
  args: string[], runDir: string, readInput: () => Promise<string | null>,
): Promise<ConfigCommandOutcome> {
  const host = optionOf(args, '--host');
  log.debug('command', 'config action', { action: args[0], host });
  if (host === undefined || !isHostId(host)) {
    log.error('command', 'host missing or unknown', { host });
    return { result: { error: new UnknownHostError(host ?? '').message, hosts: [...HOST_IDS] }, code: 2 };
  }
  const input = await readInput();
  let pin: unknown;
  try { pin = input === null ? undefined : JSON.parse(input); }
  catch { pin = undefined; }
  if (!isRecord(pin)) {
    return { result: { error: 'pipe {"strong":"…","standard":"…"} on stdin, each "session" or a model name the host reports' }, code: 2 };
  }
  try {
    const outcome = await pinModels(runDir, host, { strong: pin['strong'] as string, standard: pin['standard'] as string });
    return { result: { ...outcome, host }, code: outcome.result === 'written' ? 0 : 1 };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('command', 'models could not be pinned', { host, reason });
    return { result: { error: reason }, code: 2 };
  }
}
