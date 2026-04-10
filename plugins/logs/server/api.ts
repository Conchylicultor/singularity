export type LogStream = "stdout" | "stderr";

interface LogEntry {
  line: string;
  stream: LogStream;
  timestamp: number;
}

interface InternalChannel {
  id: string;
  entries: LogEntry[];
  listeners: Set<(entry: LogEntry) => void>;
}

const registry = new Map<string, InternalChannel>();
const MAX_HISTORY = 10_000;

export interface LogChannel {
  publish(line: string, stream?: LogStream): void;
}

export const Log = {
  channel(id: string): LogChannel {
    if (registry.has(id)) throw new Error(`Log channel "${id}" already exists`);

    const internal: InternalChannel = {
      id,
      entries: [],
      listeners: new Set(),
    };
    registry.set(id, internal);

    return {
      publish(line: string, stream: LogStream = "stdout") {
        const entry: LogEntry = { line, stream, timestamp: Date.now() };
        internal.entries.push(entry);
        if (internal.entries.length > MAX_HISTORY) internal.entries.shift();
        for (const fn of internal.listeners) fn(entry);
      },
    };
  },
};
