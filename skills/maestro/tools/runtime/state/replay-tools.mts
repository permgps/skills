// Replay metadata is optional history, but declared tools never silently disappear.
import { isDeepStrictEqual } from 'node:util';
import type { RunState, ReplayTool } from './contract.mts';
import type { StateViolation } from './validate.mts';
export const replayTools = (state: RunState): ReplayTool[] => state.verification?.version === 3 ? state.verification.replayTools ?? [] : [];
export function validateReplayTools(state: RunState): StateViolation[] {
  const record = state.verification;
  if (!record || !('replayTools' in record) || record.replayTools === undefined) return [];
  const error = (message: string): StateViolation[] => [{ field: 'verification.replayTools', message }];
  if (record.version !== 3 || !Array.isArray(record.replayTools)) return error('replayTools requires a verification-3 array');
  const ids = new Set<string>();
  for (const raw of record.replayTools as unknown[]) {
    if (!raw || typeof raw !== 'object') return error('replay tool must be an object');
    const tool = raw as ReplayTool;
    if (typeof tool.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(tool.id) || ids.has(tool.id)
      || record.evidence.some(e => e.id === tool.id)) return error('tool IDs must be unique and separate from evidence IDs');
    ids.add(tool.id);
    if (typeof tool.path !== 'string' || !tool.path.startsWith(`_orchestrator/${tool.id}/`)
      || !tool.path.endsWith('.mts') || tool.path.includes('\\') || tool.path.split('/').some(p => p === '..' || p === '.' || p === '')) return error('tool path must use _orchestrator/<id>/<script>.mts without traversal');
    if (typeof tool.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(tool.sha256)) return error('tool needs a SHA-256');
    if (typeof tool.invocation !== 'string' || !tool.invocation.trim()) return error('retain the original invocation separately from its replay locator');
    if (!Array.isArray(tool.checkIds) || new Set(tool.checkIds).size !== tool.checkIds.length
      || tool.checkIds.some(id => !record.checks.some(c => c.id === id))) return error('tool checkIds must name known checks; coordinator-only tools may use an empty list');
  }
  return [];
}
export function validateReplayTransition(previous: RunState, next: RunState): StateViolation[] {
  return replayTools(previous).filter(tool => !isDeepStrictEqual(tool, replayTools(next).find(t => t.id === tool.id)))
    .map(tool => ({ field: `verification.replayTools[${tool.id}]`, message: 'published replay tools are immutable; append a new ID and retain the original' }));
}
