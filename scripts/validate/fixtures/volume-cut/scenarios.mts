/**
 * Specifications for exercising the plan phase's volume-sized cut with a fresh
 * reader. Expected outcomes and the per-item estimates live here, outside what
 * a reader is handed: the reader gets `spec.md` and, in existing code,
 * `codebase.md`, and must estimate the volume itself. No string comparison can
 * prove a cut, so these are inputs for a fresh reading recorded in
 * `docs/parity-verification.md`, not a check `npm run check` runs; the test
 * beside this file holds only that each scenario is the case it claims to be.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '../../../shared/log.ts';

const log = createLogger('volume-cut');

/** The borrowed ceiling `phases/4-plan.md` step 2 sizes against. */
export const CEILING_LINES = 3000;

/** One surface or edit, with the changed lines, tests included, it is expected to carry. */
export interface VolumeItem {
  what: string;
  files: string[];
  lines: number;
}

export interface VolumeScenario {
  id: string;
  /** What the reader is handed as `spec.md`. */
  spec: string;
  /** What the reader is handed as `codebase.md`; absent in a new project. */
  codebase?: string;
  /** The author's estimate, never handed to the reader. */
  items: VolumeItem[];
  total: number;
  side: 'under' | 'over';
  expected: string;
}

const EDITS: VolumeItem[] = [
  { what: 'R01 cart total rounds to whole cents', files: ['src/cart/total.ts', 'src/cart/total.test.ts'], lines: 70 },
  { what: 'R02 empty cart shows a message instead of a zero table', files: ['src/cart/view.tsx'], lines: 40 },
  { what: 'R03 quantity input refuses zero and negatives', files: ['src/cart/view.tsx', 'src/cart/view.test.tsx'], lines: 105 },
  { what: 'R04 checkout button disabled while the order posts', files: ['src/checkout/form.tsx'], lines: 45 },
  { what: 'R05 postcode accepts a space in the middle', files: ['src/checkout/validate.ts', 'src/checkout/validate.test.ts'], lines: 60 },
  { what: 'R06 phone field optional', files: ['src/checkout/validate.ts', 'src/checkout/form.tsx'], lines: 50 },
  { what: 'R07 order confirmation e-mail names the delivery date', files: ['src/mail/confirmation.ts', 'src/mail/confirmation.test.ts'], lines: 90 },
  { what: 'R08 order confirmation e-mail subject carries the order number', files: ['src/mail/confirmation.ts'], lines: 25 },
  { what: 'R09 product page shows "out of stock" instead of the buy button', files: ['src/product/page.tsx', 'src/product/page.test.tsx'], lines: 135 },
  { what: 'R10 product images lazy-load', files: ['src/product/page.tsx'], lines: 30 },
  { what: 'R11 search ignores letter case', files: ['src/search/query.ts', 'src/search/query.test.ts'], lines: 70 },
  { what: 'R12 search results keep the filter on reload', files: ['src/search/query.ts', 'src/search/results.tsx'], lines: 160 },
  { what: 'R13 admin order list sorts newest first', files: ['src/admin/orders.ts', 'src/admin/orders.test.ts'], lines: 65 },
  { what: 'R14 admin order list paginates at 50', files: ['src/admin/orders.ts'], lines: 85 },
  { what: 'R15 admin can mark an order shipped', files: ['src/admin/orders.ts', 'src/admin/orders.test.ts'], lines: 170 },
  { what: 'R16 footer year is the current year', files: ['src/layout/footer.tsx'], lines: 15 },
  { what: 'R17 404 page links back to the catalogue', files: ['src/layout/not-found.tsx'], lines: 30 },
  { what: 'R18 README documents the new admin action', files: ['README.md'], lines: 25 },
];

const EDIT_SPEC = `# Specification

The shop exists and works. This change is a list of fixes and small features,
each against the code \`codebase.md\` records. Nothing new is added beyond what
each item says.

${EDITS.map(item => `- **${item.what.slice(0, 3)}** — ${item.what.slice(4)}. Files: ${item.files.map(file => `\`${file}\``).join(', ')}.`).join('\n')}

Every item keeps the existing tests passing and adds or extends a test where
the item names a test file.
`;

const EDIT_CODEBASE = `# Existing code

A TypeScript storefront, React views, Node API handlers, \`npm test\` runs
\`node --test\` over \`src/**/*.test.ts(x)\`. About 9,000 lines in all.

| File | Lines | What it holds |
|---|---|---|
| \`src/cart/total.ts\` | 120 | cart total, discounts, VAT |
| \`src/cart/view.tsx\` | 260 | the cart table and quantity inputs |
| \`src/checkout/form.tsx\` | 310 | the checkout form |
| \`src/checkout/validate.ts\` | 140 | field validation |
| \`src/mail/confirmation.ts\` | 90 | order confirmation e-mail |
| \`src/product/page.tsx\` | 280 | the product page |
| \`src/search/query.ts\` | 170 | search parsing and filtering |
| \`src/search/results.tsx\` | 150 | search results |
| \`src/admin/orders.ts\` | 220 | admin order list and actions |
| \`src/layout/footer.tsx\` | 40 | site footer |
| \`src/layout/not-found.tsx\` | 25 | 404 page |
| \`README.md\` | 120 | setup and admin guide |
`;

const BOOKING: VolumeItem[] = [
  { what: 'data model and migrations: rooms, slots, bookings, customers', files: ['db/'], lines: 650 },
  { what: 'availability engine: opening hours, buffers, overlaps, holidays', files: ['src/availability/'], lines: 1300 },
  { what: 'booking API: create, change, cancel, with idempotency keys', files: ['src/api/bookings/'], lines: 1250 },
  { what: 'staff admin UI: calendar week view, drag to move, room settings', files: ['web/admin/'], lines: 1700 },
  { what: 'public booking widget: pick room, slot, contact details', files: ['web/widget/'], lines: 1000 },
  { what: 'e-mail notifications: confirmation, change, cancellation, reminder', files: ['src/notify/'], lines: 650 },
  { what: 'README and operator guide', files: ['README.md'], lines: 150 },
  { what: 'monthly occupancy report as CSV', files: ['src/reports/'], lines: 300 },
];

const BOOKING_SPEC = `# Specification

A room-booking service for a coworking space, built from nothing: a Node and
PostgreSQL back end, a staff admin web app, and a public widget embedded on the
space's site. Every surface below ships with tests.

## Data

Rooms (name, capacity, hourly price, active flag), opening hours per weekday,
holidays, slots derived from opening hours in 30-minute steps, bookings (room,
start, end, customer, status: held, confirmed, cancelled), customers (name,
e-mail, phone). Migrations create and seed all of it; a booking never overlaps
another confirmed or held booking of the same room, enforced in the database.

## Availability

Given a room and a day, return free intervals. Opening hours, a 15-minute
cleaning buffer after each booking, holidays, and bookings held less than ten
minutes ago all reduce availability. A week query returns all rooms at once.
Daylight-saving transitions and bookings that cross midnight are handled.

## Booking API

Create (hold, then confirm), change time or room, cancel, list by customer and
by room. Every write takes an idempotency key; a repeated key returns the first
result. A hold expires after ten minutes. Errors are typed: overlap, outside
hours, holiday, expired hold, unknown room.

## Staff admin

A week calendar with one column per room, bookings drawn as blocks. Staff drag
a block to move it (the API validates the move), click to cancel, and edit
rooms, opening hours and holidays on settings pages. Sign-in with a staff
password.

## Public widget

Three steps: choose a room, choose a free slot from a calendar, enter contact
details and confirm. It shows the price, works on a phone, and embeds with one
script tag.

## Notifications

E-mails on confirmation, change and cancellation, and a reminder 24 hours
before. Templates in two languages.

## Reports

A monthly occupancy CSV per room: hours booked, hours open, share.

## Documentation

A README for developers and a short operator guide for staff.
`;

const NEIGHBOURS: VolumeItem[] = [
  { what: 'unit converter page: length, weight, temperature, with tests', files: ['converter.html', 'converter.js', 'converter.test.js'], lines: 520 },
  { what: 'conversion history export to CSV, with tests', files: ['export.js', 'export.test.js'], lines: 260 },
  { what: 'README describing the converter page', files: ['README.md'], lines: 40 },
];

const NEIGHBOURS_SPEC = `# Specification

A single offline web page that converts units, built from nothing.

## Converter

\`converter.html\` with \`converter.js\`: the user picks a category (length,
weight, temperature), a from-unit and a to-unit, types a value and sees the
result as they type. Temperature handles Celsius, Fahrenheit and Kelvin.
Results show up to four significant decimals. Tests cover every conversion
pair and the rounding rule.

## History export

\`export.js\`: every conversion is kept in the page's memory; a button saves the
history as a CSV file with columns time, category, from, to, input, result.
Commas and quotes in values are escaped. It shares no file with the converter
and could be built at the same time. Tests cover escaping and an empty history.

## README

\`README.md\` describes how to open the converter page and what each category
converts.
`;

export const VOLUME_SCENARIOS: readonly VolumeScenario[] = [
  {
    id: 'edit-list',
    spec: EDIT_SPEC,
    codebase: EDIT_CODEBASE,
    items: EDITS,
    total: EDITS.reduce((sum, item) => sum + item.lines, 0),
    side: 'under',
    expected: 'One таск carrying all 18 edits, wave 1, no worktree, one review; the step-8 line names the estimate under the borrowed ceiling.',
  },
  {
    id: 'seven-thousand',
    spec: BOOKING_SPEC,
    items: BOOKING,
    total: BOOKING.reduce((sum, item) => sum + item.lines, 0),
    side: 'over',
    expected: 'About three таски (two to four), cut along ownership — e.g. data and availability, API and notifications, the two web apps — with the README inside the таск it describes; no таск far under the ceiling unless a rule forces it.',
  },
  {
    id: 'neighbours',
    spec: NEIGHBOURS_SPEC,
    items: NEIGHBOURS,
    total: NEIGHBOURS.reduce((sum, item) => sum + item.lines, 0),
    side: 'under',
    expected: 'One таск: the converter and the export are merged although they share no file and could share a wave, and the README goes with the converter; no width split.',
  },
];

/**
 * Write each scenario's reader inputs into its own directory under `root`:
 * `spec.md`, and `codebase.md` where the project has code. The expected
 * outcome and the per-item estimates are never written there.
 */
export async function prepareVolumeScenarios(root: string): Promise<Record<string, string>> {
  const directories: Record<string, string> = {};
  for (const scenario of VOLUME_SCENARIOS) {
    const directory = path.join(root, scenario.id);
    await mkdir(directory, { recursive: true });
    const files = ['spec.md'];
    await writeFile(path.join(directory, 'spec.md'), scenario.spec);
    if (scenario.codebase !== undefined) {
      await writeFile(path.join(directory, 'codebase.md'), scenario.codebase);
      files.push('codebase.md');
    }
    log.debug('scenario', 'reader inputs written', { id: scenario.id, files });
    directories[scenario.id] = directory;
  }
  return directories;
}
