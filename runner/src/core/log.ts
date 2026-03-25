import { sanitizeValue } from './sanitize';

export type LogLevel = "INFO" | "WARN" | "ERROR";

type LogContext = {
  runId?: string;
  targetUrl?: string;
  auditRunId?: string;
};

let baseContext: LogContext = {};

/** Set global log context that will be attached to all log events. */
export function setLogContext(context: LogContext) {
  baseContext = { ...baseContext, ...context };
}

// Minimal JSON logger for the runner; logs one line per event.
export function logEvent(event: string, payload: Record<string, unknown> = {}, level: LogLevel = "INFO") {
  const safePayload = sanitizeValue(payload) as Record<string, unknown>;
  const record = {
    ts: new Date().toISOString(),
    level,
    service: "runner",
    event,
    ...baseContext,
    ...safePayload,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(record));
}


