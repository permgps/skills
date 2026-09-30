// URL handoff is argv-only; once-per-address records outlive helper invocations.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from './shared/log.mts';
import { atomicText } from './state/write.mts';
import type { Language } from './legacy.mts';

const log = createLogger('sync');
/** POSIX shlex-style splitting, with no expansion or shell execution. */
export function splitArguments(source: string): string[] {
  const args: string[] = [];
  let token = ''; let quote = ''; let started = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (!quote && /\s/.test(char)) {
      if (started) args.push(token);
      token = ''; started = false; continue;
    }
    started = true;
    if (char === quote) { quote = ''; continue; }
    if (!quote && (char === '"' || char === "'")) { quote = char; continue; }
    if (char === '\\' && quote !== "'") {
      const next = source[index + 1];
      if (next === undefined) throw new Error('opener override has a trailing escape');
      if (quote === '"' && next !== '"' && next !== '\\') token += char;
      else { token += next; index += 1; }
      continue;
    }
    token += char;
  }
  if (quote) throw new Error('opener override has an unclosed quote');
  if (started) args.push(token);
  return args;
}
export function openerCommand(platform = process.platform, override = process.env['MAESTRO_SYNC_OPENER']): string[] {
  if (override) return splitArguments(override);
  if (platform === 'darwin') return ['open'];
  if (platform === 'win32') return ['cmd', '/c', 'start', ''];
  return ['xdg-open'];
}
export type Opening = 'shown' | 'remote' | null;
export async function openPage(dir: string, url: string, force = false, noOpen = false): Promise<Opening> {
  if (noOpen || process.env['MAESTRO_SYNC_NO_OPEN']) { log.debug('open', 'opening suppressed by host'); return null; }
  if (['SSH_CONNECTION', 'SSH_TTY', 'CI'].some(name => !!process.env[name])) { log.debug('open', 'opening suppressed in remote session'); return 'remote'; }
  const file = path.join(dir, 'opened.json');
  if (!force) {
    try {
      if ((JSON.parse(await readFile(file, 'utf8')) as { url?: string }).url === url) { log.debug('open', 'address already opened'); return null; }
    } catch { /* An absent/unreadable record cannot establish prior opening. */ }
  }
  try {
    const command = openerCommand();
    if (!command[0]) throw new Error('empty opener command');
    const child = spawn(command[0], [...command.slice(1), url], { detached: true, stdio: 'ignore', windowsHide: true });
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
  } catch { log.warn('open', 'opener could not be started; address remains available'); return null; }
  try { await atomicText(file, JSON.stringify({ url }) + '\n'); }
  catch { log.warn('open', 'opened address could not be recorded', { file }); }
  log.info('open', 'viewer opening requested', { url });
  return 'shown';
}
export function openingMessage(language: Language, opening: Opening, url: string): string | null {
  if (opening === 'shown') return language === 'ru'
    ? 'sync: панель открыта в браузере. Если окно не появилось — откройте адрес выше.'
    : 'sync: the panel is open in a browser. If no window appeared, open the address above.';
  if (opening === 'remote') return language === 'ru'
    ? `sync: удалённая сессия — ничего не открываю. Страница здесь: ${url}`
    : `sync: remote session — opening nothing. The page is at ${url}`;
  return null;
}
