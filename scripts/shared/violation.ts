// One finding shape for every checker in this repository, so a caller can
// render results from any of them with the same three lines of code.

export interface Violation {
  /** Which check produced it — the second half of the log namespace. */
  check: string;
  /** Path relative to the tree being checked. */
  file: string;
  /** 1-based source line, or 0 when the finding is about the file as a whole. */
  line: number;
  message: string;
}

/** Render one finding the way every CLI in this repository prints it. */
export const formatViolation = (v: Violation): string =>
  `${v.file}:${v.line}  [${v.check}] ${v.message}\n`;
