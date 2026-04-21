export type LogStream = "stdout" | "stderr";

export interface LogEntry {
  seq: number;
  line: string;
  stream: LogStream;
  timestamp: number;
}

interface InternalChannel {
  id: string;
  entries: LogEntry[];
  listeners: Set<(entry: LogEntry) => void>;
  nextSeq: number;
}

export interface LogChannel {
  publish(line: string, stream?: LogStream): void;
}

const registry = new Map<string, InternalChannel>();
const MAX_HISTORY = 10_000;

export function createChannel(id: string): LogChannel {
  if (registry.has(id)) throw new Error(`Log channel "${id}" already exists`);

  const internal: InternalChannel = {
    id,
    entries: [],
    listeners: new Set(),
    nextSeq: 1,
  };
  registry.set(id, internal);

  return {
    publish(line: string, stream: LogStream = "stdout") {
      const entry: LogEntry = {
        seq: internal.nextSeq++,
        line,
        stream,
        timestamp: Date.now(),
      };
      internal.entries.push(entry);
      if (internal.entries.length > MAX_HISTORY) internal.entries.shift();
      for (const fn of internal.listeners) fn(entry);
    },
  };
}

export function getChannelIds(): string[] {
  return Array.from(registry.keys());
}

export function subscribe(
  id: string,
  listener: (entry: LogEntry) => void,
  fromSequence?: number,
): { history: LogEntry[]; unsubscribe: () => void } {
  const internal = registry.get(id);
  if (!internal) throw new Error(`Log channel "${id}" not found`);

  const history =
    fromSequence === undefined
      ? [...internal.entries]
      : internal.entries.filter((e) => e.seq > fromSequence);
  internal.listeners.add(listener);

  return {
    history,
    unsubscribe: () => internal.listeners.delete(listener),
  };
}
