// Historical display checks are deliberately narrower than complete candidate validation.
// No state text is evaluated here, including old JavaScript object literals.
import { STAGE_STATUSES, TASK_STATUSES, REQUIREMENT_STATUSES, GATE_STATUSES } from './state/contract.mts';
import type { StateViolation } from './state/validate.mts';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export type Language = 'ru' | 'en';
export function spoken(value: unknown): Language {
  return record(value) && value['language'] === 'en' ? 'en' : 'ru';
}
export interface StatusViolation { field: string; found: unknown; allowed: readonly string[] }
export function statusViolations(state: unknown): StatusViolation[] {
  if (!record(state)) return [];
  const errors: StatusViolation[] = [];
  for (const [field, allowed] of [['stages', STAGE_STATUSES], ['tasks', TASK_STATUSES],
    ['requirements', REQUIREMENT_STATUSES], ['gates', GATE_STATUSES]] as const) {
    if (!Array.isArray(state[field])) continue;
    for (const [index, item] of state[field].entries()) {
      if (record(item) && !allowed.includes(item['status'] as never)) errors.push({
        field: `${field}[${index}].status`, found: item['status'] ?? null, allowed });
    }
  }
  return errors;
}
export function languageViolations(state: unknown): StateViolation[] {
  if (!record(state) || state['language'] !== 'ru') return [];
  const errors: StateViolation[] = [];
  for (const [field, key, many] of [['gates', 'findings', true], ['tasks', 'title', false], ['stages', 'note', false]] as const) {
    if (!Array.isArray(state[field])) continue;
    for (const [index, item] of state[field].entries()) {
      if (!record(item)) continue;
      const lines: unknown[] = many && Array.isArray(item[key]) ? item[key] : [item[key]];
      for (const [offset, line] of lines.entries()) {
        if (typeof line === 'string' && /[A-Za-z]/.test(line) && !/[\u0400-\u04ff]/.test(line)) {
          errors.push({ field: `${field}[${index}].${key}${many ? `[${offset}]` : ''}`, message: 'has no Russian in it — this прогон speaks ru' });
        }
      }
    }
  }
  return errors;
}
export const FOLDED = {
  ru: 'sync: скажите адрес в чате и добавьте, что панель, если она свернулась в строку, открывается нажатием на неё.',
  en: 'sync: say the address in the chat, and add that the panel opens on a press if it landed folded into a row.',
};
export function legacyReports(state: unknown): string[] {
  const messages = statusViolations(state).map(error => `sync: ${error.field} is ${JSON.stringify(error.found)} — the contract allows ${error.allowed.join(', ')}`);
  if (messages.length) messages.push('      The page cannot count a status it cannot name: it shows such an entry as written, and the entry counts towards no progress at all.');
  const unspoken = languageViolations(state);
  for (const error of unspoken) messages.push(`sync: ${error.field} ${error.message}`);
  // Historical refresh quotes only the three public display fields, as before.
  if (unspoken.length && record(state)) {
    for (const error of unspoken) {
      const match = /^(\w+)\[(\d+)\]\.(\w+)(?:\[(\d+)\])?$/.exec(error.field)!;
      const item = (state[match[1]!] as Record<string, unknown>[])[Number(match[2])];
      const value = item?.[match[3]!];
      const line = match[4] === undefined ? value : (value as unknown[])[Number(match[4])];
      messages.push('      ' + JSON.stringify(String(line).slice(0, 100)));
    }
    messages.push("      The panel prints these three fields word for word, so they carry the dial's language: gates[].findings, tasks[].title, stages[].note. Every other file the прогон writes stays English.");
  }
  return messages;
}

export function movedMessage(language: Language, port: number, taken: boolean): string {
  const old = `http://localhost:${port}/dashboard.html`;
  return language === 'ru'
    ? `sync: адрес панели сменился. Прежний (${old}) больше не отвечает${taken ? ' — его занял кто-то другой' : ''}. Откройте новый и скажите его пользователю.`
    : `sync: the panel has a new address. The old one (${old}) is dead${taken ? ' — something else took it' : ''}. Open the new one and say it to the user.`;
}
