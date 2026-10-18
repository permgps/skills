/**
 * Disposable OpenSpec projects for exercising the shipped briefing rule, the
 * existing-code reader and the OpenSpec writer in fresh contexts. Every file is
 * written here by hand; nothing is copied from OpenSpec (D1). Expected outcomes
 * live in `expected`, outside what any reader is handed: no string comparison
 * can prove a model read a requirement correctly, so the runs are judged
 * against these sentences by a person, and the helper's check judges the
 * writer's draft mechanically.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const RUN_DIR = '2026-10-18-checkout-wallet';

const CHECKOUT = [
  '# Checkout', '', '## Purpose', 'How a guest pays for an order and what they receive once it is paid.', '',
  '## Requirements',
  '### Requirement: Card payment', 'The system SHALL take card payment before the order ships.', '',
  '#### Scenario: Paid order', '- **WHEN** the guest pays by card', '- **THEN** the order is marked paid', '',
  '#### Scenario: Declined card', '- **WHEN** the card is declined', '- **THEN** the order stays unpaid and the guest sees why', '',
  '### Requirement: Receipt', 'The system MUST email a receipt for every paid order.', '',
  '#### Scenario: Receipt sent', '- **WHEN** an order is paid', '- **THEN** a receipt is emailed to the guest', '',
  '```markdown', '### Requirement: Example only — not a requirement', '```', '',
].join('\n');

const USER_AUTH = [
  '# User auth', '', '## Purpose', 'How a returning guest signs in to see their past orders.', '',
  '## Requirements',
  '### Requirement: Sign in by email link', 'The system SHALL sign a guest in through a one-time email link.', '',
  '#### Scenario: Link used', '- **WHEN** the guest opens the link within 15 minutes', '- **THEN** they are signed in', '',
].join('\n');

/** The combined project: approved specs, a foreign proposal, an earlier Maestro change and an archived one. */
export const PROJECT: Record<string, string> = {
  'README.md': '# Shop\n\nA small shop. Behaviour is specified with OpenSpec under openspec/.\n',
  'openspec/config.yaml': 'schema: spec-driven\n',
  'openspec/specs/checkout/spec.md': CHECKOUT,
  'openspec/specs/identity/user-auth/spec.md': USER_AUTH,
  'openspec/changes/add-dark-mode/proposal.md': '## Why\nGuests asked for a dark theme in the evening; this proposal has not been approved.\n\n## What Changes\n- ADDED Dark theme\n',
  'openspec/changes/add-dark-mode/specs/theme/spec.md': '## ADDED Requirements\n### Requirement: Dark theme\nThe system SHALL offer a dark theme.\n\n#### Scenario: Toggle\n- **WHEN** the guest toggles the theme\n- **THEN** the page turns dark\n',
  'openspec/changes/maestro-2026-10-01-menu/.openspec.yaml': 'schema: spec-driven\ncreated: 2026-10-01\nx-maestro-run: 2026-10-01-menu\nx-maestro-requirements: {"menu › Hover opens the menu": ["R01"]}\n',
  'openspec/changes/maestro-2026-10-01-menu/specs/menu/spec.md': '## ADDED Requirements\n### Requirement: Hover opens the menu\nThe menu SHALL open on hover.\n\n#### Scenario: Pointer over the trigger\n- **WHEN** the pointer rests on the trigger\n- **THEN** the menu opens\n',
  'openspec/changes/archive/2026-09-20-maestro-2026-09-19-cart/proposal.md': '## Why\nThe cart run, already merged into the specs by the user.\n\n## What Changes\n- ADDED Cart total\n',
  'src/checkout.ts': 'export function pay(order: { total: number }, card: string): boolean {\n  return card.length > 0 && order.total > 0;\n}\n\nexport function sendReceipt(email: string): void {\n  void email;\n}\n',
};

/** The manifest the briefing and the existing-code reader are handed. */
export const MANIFEST = [
  '# Manifest', '',
  'R01: A guest can pay with a digital wallet as well as by card.',
  'R02: A receipt is emailed only when the guest ticks "email me a receipt" at checkout.',
  'R03: Card payment keeps working as it does today.',
  'R04: The order page shows the paid amount with currency.',
  'R05: A guest can download past receipts as PDF.',
  '',
].join('\n');

/**
 * The closed run the writer is handed: `answers.md` with the user choosing
 * replace for R02, and the verification projection. R03 failed, R04 passed but
 * an accepted exception covers it, R05 was deferred.
 */
export const ANSWERS = [
  '### R02 — чек по почте',
  'Asked: В OpenSpec записано «Receipt»: чек уходит на почту за каждый оплаченный заказ. В брифе — только если гость отметил галочку. Что верно?',
  'Options:',
  '1. Оставить как в OpenSpec (recommended — это одобренное поведение)',
  '2. Чек только по галочке — поменять одобренное поведение',
  'Answer: 2',
  'Chosen: Чек только по галочке — поменять одобренное поведение',
  'OpenSpec: checkout › Receipt — replace',
  '',
].join('\n');

export const PROJECTION = {
  requirements: {
    R01: { result: 'passed', checks: [
      { method: 'browser', target: 'checkout page', procedure: ['choose wallet', 'confirm in the wallet sandbox'], oracle: 'the order shows "paid"', result: 'passed' },
    ] },
    R02: { result: 'passed', checks: [
      { method: 'integration', target: 'POST /orders/:id/pay', procedure: ['pay with the box ticked'], oracle: 'one receipt email is queued', result: 'passed' },
      { method: 'integration', target: 'POST /orders/:id/pay', procedure: ['pay with the box unticked'], oracle: 'no receipt email is queued', result: 'passed' },
    ] },
    R03: { result: 'failed', checks: [
      { method: 'browser', target: 'checkout page', procedure: ['pay with a declined test card'], oracle: 'the guest sees why', result: 'failed' },
    ] },
    R04: { result: 'passed', exception: 'accepted by the user: «currency symbol can wait»', checks: [] },
    R05: { result: 'deferred', checks: [] },
  },
} as const;

export const TASKS = [
  { id: '01', title: 'Wallet payment at checkout', requirementIds: ['R01'] },
  { id: '02', title: 'Receipt only on request', requirementIds: ['R02'] },
  { id: '03', title: 'Declined card message', requirementIds: ['R03'] },
] as const;

export const SPEC = [
  '# Spec', '',
  '## R01 — wallet payment', 'Add `payWithWallet(order, token)` beside `pay` in src/checkout.ts, through the provider sandbox.', '',
  '## R02 — receipt on request', '`Order.receiptRequested: boolean`, set by the checkout checkbox; `sendReceipt` runs only when it is true.', '',
].join('\n');

/** What a correct reading or draft looks like, never handed to a reader. */
export const EXPECTED = {
  index: 'present; capabilities checkout (Card payment, Receipt) and identity/user-auth (Sign in by email link); the fenced example is not a requirement; changes add-dark-mode (no owner) and maestro-2026-10-01-menu (owner 2026-10-01-menu); archived maestro-2026-09-19-cart.',
  briefing: 'R02 contradicts checkout › Receipt: a fork with keep recommended; R03 agrees with checkout › Card payment: Settled by reading; R01, R04 and R05 touch no approved requirement; no fork about the dark theme proposal.',
  reader: 'Section 7 rows: checkout › Receipt and checkout › Card payment current (approved); menu › Hover opens the menu current (earlier Maestro change); theme › Dark theme historical (proposal) if listed at all; nothing under archive is binding; no edit to any openspec file.',
  writer: 'ADDED Wallet payment (R01) with a scenario from the wallet check; MODIFIED Receipt (R02) restating the requirement with "Receipt sent" kept and a scenario for the unticked box; R03, R04, R05 left out with reasons in proposal.md; passes checkOpenSpecDraft and openspec validate --strict.',
} as const;

/** Write the combined project under the caller's disposable root, never a real project. */
export async function prepareOpenSpecProject(root: string, options: { closedRun?: boolean } = {}): Promise<void> {
  const files: Record<string, string> = { ...PROJECT };
  if (options.closedRun) {
    files[`.maestro/${RUN_DIR}/manifest.md`] = MANIFEST;
    files[`.maestro/${RUN_DIR}/answers.md`] = ANSWERS;
    files[`.maestro/${RUN_DIR}/spec.md`] = SPEC;
  }
  for (const [relative, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), body);
  }
}
