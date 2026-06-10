import { appendEntry } from "./persist";

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
  persist: boolean;
}

export interface LogChannel {
  publish(line: string, stream?: LogStream, timestamp?: number): void;
}

const registry = new Map<string, InternalChannel>();
const MAX_HISTORY = 10_000;

function makePublisher(internal: InternalChannel): LogChannel["publish"] {
  return (line: string, stream: LogStream = "stdout", timestamp?: number) => {
    const t = timestamp ?? Date.now();
    const entry: LogEntry = {
      seq: internal.nextSeq++,
      line,
      stream,
      timestamp: t,
    };
    internal.entries.push(entry);
    if (internal.entries.length > MAX_HISTORY) internal.entries.shift();
    for (const fn of internal.listeners) fn(entry);
    if (internal.persist) appendEntry(internal.id, { t, stream, line });
  };
}

export function createChannel(id: string): LogChannel {
  if (registry.has(id)) throw new Error(`Log channel "${id}" already exists`);

  const internal: InternalChannel = {
    id,
    entries: [],
    listeners: new Set(),
    nextSeq: 1,
    persist: false,
  };
  registry.set(id, internal);

  return { publish: makePublisher(internal) };
}

export function getOrCreateChannel(
  id: string,
  opts?: { persist?: boolean },
): LogChannel {
  let internal = registry.get(id);
  if (!internal) {
    internal = {
      id,
      entries: [],
      listeners: new Set(),
      nextSeq: 1,
      persist: opts?.persist ?? false,
    };
    registry.set(id, internal);
  } else if (opts?.persist) {
    // Upgrading an existing channel to persist is one-way (never disabled).
    internal.persist = true;
  }

  return { publish: makePublisher(internal) };
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
