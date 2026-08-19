// The one logging surface for every script in this repository.
// Format is fixed and parseable: LEVEL [namespace.check] message {json}
// Everything goes to stderr, so a script's stdout stays its result.

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// A plain object rather than an enum: `erasableSyntaxOnly` forbids enums,
// because Node strips types instead of compiling them.
export const LEVELS: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};

export const DEFAULT_LEVEL: LogLevel = 'INFO';

/**
 * Resolve a LOG_LEVEL string to a level name.
 * Anything unrecognised — including undefined and an empty string — is INFO,
 * so a typo in the environment makes the tooling talkative, never silent.
 */
export function resolveLevel(value: string | undefined): LogLevel {
  const candidate = (value ?? '').trim().toUpperCase();
  // `hasOwn`, not `in`: `in` walks the prototype chain, so `LOG_LEVEL=toString`
  // would resolve. Uppercasing happens to hide that today; relying on it would
  // make the guard depend on how Object.prototype happens to be spelled.
  return Object.hasOwn(LEVELS, candidate) ? (candidate as LogLevel) : DEFAULT_LEVEL;
}

export type Loggable = Record<string, unknown>;

export interface Logger {
  readonly namespace: string;
  readonly level: LogLevel;
  log(level: LogLevel, check: string, message: string, data?: Loggable): void;
  debug(check: string, message: string, data?: Loggable): void;
  info(check: string, message: string, data?: Loggable): void;
  warn(check: string, message: string, data?: Loggable): void;
  error(check: string, message: string, data?: Loggable): void;
}

export interface LoggerOptions {
  /** Overrides the level resolved from LOG_LEVEL. Used by tests. */
  level?: LogLevel;
  /** Overrides the sink. Used by tests. */
  write?: (line: string) => void;
}

/** Render one line without emitting it — the format lives in exactly one place. */
export function formatLine(
  level: LogLevel,
  namespace: string,
  check: string,
  message: string,
  data?: Loggable,
): string {
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  return `${level} [${namespace}.${check}] ${message}${suffix}\n`;
}

/**
 * Create a logger for one script. The floor is read from LOG_LEVEL once, at
 * creation: a run that changes the environment halfway through would otherwise
 * produce a log whose own verbosity cannot be reconstructed afterwards.
 */
export function createLogger(namespace: string, options: LoggerOptions = {}): Logger {
  const level = options.level ?? resolveLevel(process.env['LOG_LEVEL']);
  const floor = LEVELS[level];
  const write = options.write ?? ((line: string) => { process.stderr.write(line); });

  const log = (
    entryLevel: LogLevel,
    check: string,
    message: string,
    data?: Loggable,
  ): void => {
    if (LEVELS[entryLevel] < floor) return;
    write(formatLine(entryLevel, namespace, check, message, data));
  };

  return {
    namespace,
    level,
    log,
    debug: (check, message, data) => log('DEBUG', check, message, data),
    info: (check, message, data) => log('INFO', check, message, data),
    warn: (check, message, data) => log('WARN', check, message, data),
    error: (check, message, data) => log('ERROR', check, message, data),
  };
}
