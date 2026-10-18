// The mechanical half of «briefing proposes, the user disposes»: every question
// the брифинг put to the user is recorded in `answers.md` with the option it
// ended on, written out in full.
//
// A delegated answer — «как советуешь», «на твой выбор», a bare «да» — says
// nothing on its own. The acceptance reader never sees the question, so an entry
// that keeps only the reply has lost the decision. The check therefore reads
// labels, never phrases: matching «да» and «ок» and «yes» in two languages is a
// list that is always one word short, while a missing `Chosen:` line is missing
// whatever the user typed.
//
// What this does not check, and cannot: whether the recommendation was the
// right one, whether the question was worth asking, and whether the chosen text
// was actually shown back to the user. Those are the phase file's discipline.
//
// Entries without an `Options:` block are skipped. They are facts settled by
// reading, and the entries of runs recorded before this rule existed — a gate
// that failed a finished прогон on its history would be reporting the rule's
// age, not a defect.

import { createLogger } from '../shared/log.ts';
import type { GateFinding } from './cli.ts';
import { LEFTOVERS_HEADING, OWN_ANSWER, SELF_BRIEFED, toOption, type AnswerEntry } from '../../skills/maestro/tools/runtime/answers.mts';

// The parser moved into the shipped runtime, which the closing publish also
// uses; these names stay importable from here for G1 and its tests.
export {
  LEFTOVERS_HEADING, OWN_ANSWER, SELF_BRIEFED, parseAnswers, parseOpenSpecDisposition,
  type AnswerEntry, type AnswerOption, type OpenSpecDisposition,
} from '../../skills/maestro/tools/runtime/answers.mts';

const log = createLogger('gate-answers');
/**
 * The comparable part of a `Chosen:` value: no recommendation suffix copied
 * along with the option, and no `follows …` / `contradicts …` citation of an
 * earlier decision, which the phase file puts on the same line.
 */
export function chosenText(chosen: string): string {
  const withoutCitation = chosen.replace(
    /\s*[—–;,-]?\s*\(?\b(?:follows|contradicts)\s+\d{4}-\d{2}-\d{2}\s+decision\b[\s\S]*$/i, '');
  return toOption(withoutCitation).text.replace(/[.;,]$/, '').trim();
}

// Trailing punctuation is dropped on both sides. `chosenText` already drops it
// from `Chosen:`, where it is left behind by a cut citation, so an option that
// ends in a full stop would otherwise never match its own text copied verbatim.
const comparable = (text: string): string => text.replace(/[.;,]$/, '').trim().toLowerCase();
const same = (a: string, b: string): boolean => comparable(a) === comparable(b);

function entryFindings(entry: AnswerEntry): Array<{ rule: string; message: string }> {
  const findings: Array<{ rule: string; message: string }> = [];
  const options = entry.options ?? [];
  const where = `answers.md line ${entry.line}`;

  if (entry.leftovers) {
    log.debug('rule', 'heading exception applies', { heading: 'leftovers', line: entry.line });
    if (entry.gist === '') {
      findings.push({ rule: 'heading', message:
        `${where}: ${LEFTOVERS_HEADING} travels alone — add a short gist after it, "### ${LEFTOVERS_HEADING} — <gist>"` });
    }
  } else if (entry.requirementId === '') {
    findings.push({ rule: 'heading', message:
      `${where}: the entry names no требование — head it "### R## — <gist>", so the answer arrives attached to something` });
  } else if (entry.gist === '') {
    findings.push({ rule: 'heading', message:
      `${where}: ${entry.requirementId} travels alone — add a short gist of the требование after it, "### ${entry.requirementId} — <gist>"` });
  }

  const recommended = options.filter(option => option.recommended);
  if (recommended.length !== 1) {
    findings.push({ rule: 'recommended', message:
      `${where}: ${recommended.length} options are marked "(recommended — …)" — mark exactly one, the answer \`full\` would self-brief, with its reason in one clause` });
  }

  if (entry.answer === null || entry.answer === '') {
    findings.push({ rule: 'answer', message:
      `${where}: no "Answer:" line — record the user's reply verbatim after redaction, or "${SELF_BRIEFED}" for a fork the прогон settled itself` });
  }

  if (entry.chosen === null || entry.chosen === '') {
    findings.push({ rule: 'chosen', message:
      `${where}: no "Chosen:" line — write the full text of the option the reply selected, or "${OWN_ANSWER}"; a bare "да" or «как советуешь» tells the acceptance reader nothing` });
    return findings;
  }

  const chosen = chosenText(entry.chosen);
  if (same(chosen, OWN_ANSWER)) {
    if (entry.answer !== null && same(entry.answer, SELF_BRIEFED)) {
      findings.push({ rule: 'self-briefed', message:
        `${where}: a self-briefed answer cannot be "${OWN_ANSWER}" — it is the recommended option, written out` });
    }
    return findings;
  }

  const match = options.find(option => same(option.text, chosen));
  if (!match) {
    log.debug('chosen', 'Chosen names no offered option', {
      requirementId: entry.requirementId, line: entry.line, chosen, offered: options.map(option => option.text),
    });
    findings.push({ rule: 'chosen', message:
      `${where}: "Chosen: ${chosen}" is none of the offered options — copy the selected option's full text, or write "${OWN_ANSWER}" when the user composed their own` });
    return findings;
  }

  if (entry.answer !== null && same(entry.answer, SELF_BRIEFED) && !match.recommended) {
    findings.push({ rule: 'self-briefed', message:
      `${where}: a self-briefed answer chose an option that is not the recommended one — the recommendation is what the прогон would self-brief, so the two must agree` });
  }
  return findings;
}

/** G1's findings for the entries that put options to the user. */
export function checkAnswers(entries: readonly AnswerEntry[]): GateFinding[] {
  const findings: GateFinding[] = [];
  let checked = 0;

  for (const entry of entries) {
    if (entry.options === null) continue;
    checked += 1;
    for (const { rule, message } of entryFindings(entry)) {
      log.debug('rule', 'entry fails a rule', { requirementId: entry.requirementId, line: entry.line, rule });
      findings.push({ requirementId: entry.requirementId, message });
    }
  }

  log.info('answers', 'answers checked', {
    entries: entries.length, checked, skipped: entries.length - checked, findings: findings.length,
  });
  return findings;
}
