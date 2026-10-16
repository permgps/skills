// Repair ledger publication uses the same locked candidate boundary as every writer.
import { candidateMode, type Viewer, type ValidationEnvelope } from './publication.mts';
import type { RunState } from './state/contract.mts';
import { createLogger } from './shared/log.mts';
const log = createLogger('repair-dispatch');
export async function repairDispatchCommand(args: string[], dir: string, viewer: Viewer,
  snapshots: (state: RunState | null, envelope: ValidationEnvelope) => Promise<void>) {
  const outcome = await candidateMode(['--publish', ...args.slice(1)], dir, viewer, snapshots, async state => {
    if (state.verification?.version !== 3 || !state.verification.repairDispatches || !state.verification.repairAccounting) {
      return [{ field: 'verification.repairDispatches', message: 'repairDispatches and repairAccounting are required' }];
    }
    const pending = state.verification.repairDispatches.filter(d => ['reserved', 'dispatched'].includes(d.status)).length;
    log.debug('capacity', 'validated repair ledger', { pending, returned: state.verification.repairAttempts.length });
    return [];
  });
  log[outcome.code === 0 ? 'info' : 'error']('publish', 'repair ledger publication finished', { code: outcome.code });
  return outcome;
}
