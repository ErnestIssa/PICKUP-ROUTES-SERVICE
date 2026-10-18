export type LogFields = Record<string, unknown>;

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/** One JSON object per line: easy for log tools to search and filter. */
export function createJsonLogger(write: (line: string) => void = console.log): Logger {
  const log =
    (level: string) =>
    (message: string, fields: LogFields = {}) =>
      write(JSON.stringify({ ...fields, time: new Date().toISOString(), level, message }));

  return { info: log("info"), warn: log("warn"), error: log("error") };
}

/** For tests, so they stay quiet. */
export const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};