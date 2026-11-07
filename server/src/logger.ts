type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(minLevel: Level = (process.env.LOG_LEVEL as Level) || 'info'): Logger {
  const write = (level: Level, msg: string, meta?: Record<string, unknown>) => {
    if (order[level] < order[minLevel]) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`;
    const out = meta ? `${line} ${JSON.stringify(meta, errorReplacer)}` : line;
    if (level === 'error' || level === 'warn') console.error(out);
    else console.log(out);
  };
  return {
    debug: (m, meta) => write('debug', m, meta),
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
  };
}

function errorReplacer(_key: string, value: unknown) {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
