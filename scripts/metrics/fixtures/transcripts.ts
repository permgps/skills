// Hand-written transcript lines in the shape Claude Code writes them, for the
// cost measurement's tests.
//
// Nothing here is copied from a real session — the architecture refuses run
// artifacts of a real run in this repository — but every field the reader
// looks at sits where `MAPPED_HOST_VERSION` puts it. Each line carries
// `SENTINEL` text in the places a session's words live (thinking, text, tool
// input, tool result, description), so a test can prove none of it reaches the
// output.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { MAPPED_HOST_VERSION } from '../transcripts.ts';

export const SENTINEL = 'SENTINEL-do-not-print';

export interface FixtureUsage {
  input?: number;
  write5m?: number;
  write1h?: number;
  read?: number;
  output?: number;
  /** Drop the 5m/1h split, as an older host did. */
  noSplit?: boolean;
}

export interface AssistantLine {
  id: string;
  at: string;
  model?: string;
  usage?: FixtureUsage;
  block?: 'thinking' | 'text' | 'tool_use';
  sidechain?: boolean;
  agentId?: string;
  skill?: string;
  version?: string;
}

export function assistantLine(line: AssistantLine): string {
  const usage = line.usage ?? {};
  const write5m = usage.write5m ?? 0;
  const write1h = usage.write1h ?? 0;
  const block = line.block ?? 'text';
  const content = block === 'thinking'
    ? [{ type: 'thinking', thinking: `${SENTINEL} thinking` }]
    : block === 'tool_use'
      ? [{ type: 'tool_use', id: `toolu_${line.id}`, name: 'Bash', input: { command: `echo ${SENTINEL}` } }]
      : [{ type: 'text', text: `${SENTINEL} text` }];
  return JSON.stringify({
    parentUuid: null,
    isSidechain: line.sidechain ?? false,
    ...line.agentId === undefined ? {} : { agentId: line.agentId },
    ...line.skill === undefined ? {} : { attributionSkill: line.skill },
    type: 'assistant',
    timestamp: line.at,
    version: line.version ?? MAPPED_HOST_VERSION,
    message: {
      id: line.id,
      model: line.model ?? 'claude-opus-5-5',
      role: 'assistant',
      content,
      usage: {
        input_tokens: usage.input ?? 0,
        cache_creation_input_tokens: write5m + write1h,
        cache_read_input_tokens: usage.read ?? 0,
        ...usage.noSplit === true ? {} : { cache_creation: { ephemeral_5m_input_tokens: write5m, ephemeral_1h_input_tokens: write1h } },
        output_tokens: usage.output ?? 0,
      },
    },
  });
}

/** One call written the way the host writes it: a line per block, the same usage on each. */
export const callLines = (line: Omit<AssistantLine, 'block'>, blocks: ReadonlyArray<AssistantLine['block']> = ['thinking', 'text', 'tool_use']): string[] =>
  blocks.map(block => assistantLine({ ...line, ...block === undefined ? {} : { block } }));

export function userLine(at: string): string {
  return JSON.stringify({ type: 'user', timestamp: at, version: MAPPED_HOST_VERSION, message: { role: 'user', content: `${SENTINEL} prompt` } });
}

/** The parent's record of a launched subagent, carrying its id and description. */
export function dispatchResultLine(agentId: string, description: string, at: string): string {
  return JSON.stringify({
    type: 'user', timestamp: at, version: MAPPED_HOST_VERSION,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${agentId}`, content: `${SENTINEL} result` }] },
    toolUseResult: { isAsync: true, status: 'async_launched', agentId, description, prompt: `${SENTINEL} prompt` },
  });
}

export async function writeSession(logDir: string, sessionId: string, lines: readonly string[]): Promise<string> {
  await mkdir(logDir, { recursive: true });
  const file = path.join(logDir, `${sessionId}.jsonl`);
  await writeFile(file, `${lines.join('\n')}\n`);
  return file;
}

export async function writeSubagent(
  logDir: string, sessionId: string, agentId: string, lines: readonly string[], description?: string,
): Promise<string> {
  const dir = path.join(logDir, sessionId, 'subagents');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `agent-${agentId}.jsonl`);
  await writeFile(file, `${lines.join('\n')}\n`);
  if (description !== undefined) {
    await writeFile(path.join(dir, `agent-${agentId}.meta.json`),
      JSON.stringify({ agentType: 'general-purpose', description, toolUseId: `toolu_${agentId}` }));
  }
  return file;
}
