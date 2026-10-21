/**
 * Structured logger: one JSON object per line (stdout for info, stderr for warn/error).
 * The only file in the server allowed to call `console.log`.
 */
type Fields = Record<string, unknown>;

function line(level: 'info' | 'warn' | 'error', msg: string, fields?: Fields): string {
  return JSON.stringify({ ...fields, level, time: new Date().toISOString(), msg });
}

export const log = {
  info(msg: string, fields?: Fields): void {
    console.log(line('info', msg, fields));
  },
  warn(msg: string, fields?: Fields): void {
    console.warn(line('warn', msg, fields));
  },
  error(msg: string, fields?: Fields): void {
    console.error(line('error', msg, fields));
  },
};
