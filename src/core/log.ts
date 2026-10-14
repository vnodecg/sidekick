import type { Clock } from "./clock.js";

/*
 * The entry type has no field for tool arguments or results, so user content
 * cannot be logged by construction. `detail` is for startup diagnostics (bad env
 * var, module load failure) and must never carry user text.
 */
export type LogEntry = {
  event: string;
  tool?: string;
  module?: string;
  ok?: boolean;
  ms?: number;
  errClass?: string;
  detail?: string;
};

export type Log = (entry: LogEntry) => void;
export type LogSink = (line: string) => void;

export const stderrSink: LogSink = (line) => {
  process.stderr.write(line);
};

export function createLog(sink: LogSink, clock: Clock): Log {
  return (entry) => {
    sink(`${JSON.stringify({ ts: new Date(clock.now() * 1000).toISOString(), ...entry })}\n`);
  };
}

export function failure(event: string, error: unknown, extra: Pick<LogEntry, "module"> = {}): LogEntry {
  const known = error instanceof Error;
  return { event, ok: false, errClass: known ? error.name : "UnknownError", detail: known ? error.message : undefined, ...extra };
}
