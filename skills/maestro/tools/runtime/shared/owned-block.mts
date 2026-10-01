// The one region of a shared file that Maestro owns, between two marker lines.
//
// Two files carry such a region: the project memory file, whose block the
// memory phase writes, and the run register, whose rows publication rewrites.
// The splice lives here once because the rule it holds — everything outside the
// markers stays byte for byte — fails by silently overwriting text Maestro does
// not own, and a second copy of it would be a second place to get that wrong.

/** The two marker lines that bound an owned region. */
export interface Markers {
  begin: string;
  end: string;
}

/** The owned region, with 1-based line numbers for the two marker lines. */
export interface Block {
  start: number;
  end: number;
  body: string;
}

/** The markers are malformed. Always a defect in the file, never a configuration. */
export class MarkerError extends Error {
  readonly lines: number[];

  constructor(message: string, lines: number[]) {
    super(lines.length === 0 ? message : `${message} (line${lines.length > 1 ? 's' : ''} ${lines.join(', ')})`);
    this.name = 'MarkerError';
    this.lines = lines;
  }
}

/**
 * A marker is a line, not a substring.
 *
 * The alternative — matching anywhere on a line — would let a sentence *about*
 * the markers become one, and the files most likely to contain such a sentence
 * are the very files the markers live in.
 */
const isMarker = (line: string, marker: string): boolean => line.trim() === marker;

/**
 * Locate the owned region, or `null` when the file has none.
 *
 * Anything other than exactly zero or exactly one well-formed pair is an error.
 * Guessing which pair was meant is how a splice ends up deleting the text
 * between two of them.
 */
export function findOwnedBlock(text: string, markers: Markers): Block | null {
  const lines = text.split('\n');
  const begins: number[] = [];
  const ends: number[] = [];

  lines.forEach((line, index) => {
    if (isMarker(line, markers.begin)) begins.push(index + 1);
    if (isMarker(line, markers.end)) ends.push(index + 1);
  });

  if (begins.length === 0 && ends.length === 0) return null;
  if (begins.length > 1) throw new MarkerError('more than one begin marker', begins);
  if (ends.length > 1) throw new MarkerError('more than one end marker', ends);
  if (begins.length === 0) throw new MarkerError('end marker with no begin marker', ends);
  if (ends.length === 0) throw new MarkerError('begin marker with no end marker', begins);

  const start = begins[0] ?? 0;
  const end = ends[0] ?? 0;
  if (end < start) throw new MarkerError('end marker precedes begin marker', [start, end]);

  return { start, end, body: lines.slice(start, end - 1).join('\n') };
}

/** The owned region as it is written: the two markers with the body between them. */
export function renderOwnedBlock(body: string, markers: Markers): string {
  const trimmed = body.replace(/^\n+|\n+$/g, '');
  return trimmed === ''
    ? `${markers.begin}\n${markers.end}`
    : `${markers.begin}\n${trimmed}\n${markers.end}`;
}

/**
 * Replace the owned region, or append one when the file has none.
 *
 * Everything before the begin marker and after the end marker is returned
 * unchanged, with one deliberate exception: the result ends with exactly one
 * newline. That is the only byte this function decides on its own, and it is
 * decided at the end of the file, where nothing the user wrote lives.
 */
export function spliceOwnedBlock(text: string, body: string, markers: Markers): string {
  if (body.includes(markers.begin) || body.includes(markers.end)) {
    throw new MarkerError('the body carries a marker of its own', []);
  }

  const block = renderOwnedBlock(body, markers);
  const found = findOwnedBlock(text, markers);

  if (found === null) {
    const head = text.replace(/\n+$/, '');
    return head === '' ? `${block}\n` : `${head}\n\n${block}\n`;
  }

  const lines = text.split('\n');
  const before = lines.slice(0, found.start - 1);
  const after = lines.slice(found.end);
  const merged = [...before, ...block.split('\n'), ...after].join('\n');
  return `${merged.replace(/\n+$/, '')}\n`;
}
