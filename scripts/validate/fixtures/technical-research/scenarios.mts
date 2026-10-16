// Synthetic source scenarios exercise provenance decisions without network access.
import type { ResearchRecord } from '../../../../skills/maestro/tools/runtime/technical-research.mts';
export function installedRecord(): ResearchRecord {
  return { id: 'Q01', question: 'Does client.send accept a signal?', impact: 'task-boundary', requirementIds: ['R01'],
    dependency: { name: 'fixture-client', version: '1.0.0', versionSource: 'node_modules/fixture-client/package.json:version' },
    assumptions: ['The installed client remains at version 1.0.0'], status: 'established',
    fact: 'The installed declaration exposes send(message: string): void, with no signal option.', uncertainty: [],
    sources: [{ kind: 'installed-types', location: 'node_modules/fixture-client/index.d.ts:send', version: '1.0.0',
      applicability: 'applicable', supports: 'send(message: string): void', conflict: false },
    { kind: 'official-docs', location: 'https://fixture.invalid/v2/client#send', version: '2.0.0',
      applicability: 'mismatch', supports: 'v2 accepts an options object with signal', conflict: true }],
    budget: { inspections: 3, minutes: 2 }, supersedes: null };
}
export function unavailableRecord(): ResearchRecord {
  return { ...installedRecord(), status: 'unresolved', fact: null, sources: [],
    uncertainty: ['Installed types are absent and version-matched official documentation is unavailable.'],
    budget: { inspections: 2, minutes: 10 } };
}
export const READER_SCENARIOS = [
  { name: 'installed-v1-versus-latest-v2', question: 'Does client.send accept a signal?',
    evidence: 'Installed package version is 1.0.0. Installed types declare send(message: string): void. Official 2.0.0 documentation declares send(message: string, options: {signal?: AbortSignal}): void.' },
  { name: 'applicable-conflict', question: 'Does client.send accept a signal?',
    evidence: 'Installed 1.0.0 types declare a signal option. Official 1.0.0 specification explicitly says signal is unsupported. No source resolves this conflict.' },
  { name: 'unavailable-access', question: 'Does client.send accept a signal?',
    evidence: 'No installed source or types are readable. All official documentation access is unavailable. No other source is authorized.' },
  { name: 'no-external-uncertainty', question: 'Change a literal local heading.',
    evidence: 'No external API or dependency fact changes feasibility or ownership.' },
] as const;
