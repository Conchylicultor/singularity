import type { FileSink } from "@plugins/infra/plugins/file-sink/core";

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
  // A durable channel resolves its bounded-append file sink LAZILY on first
  // publish: `makeSink` builds it (its path needs the per-worktree logs dir, whose
  // resolution reads SINGULARITY_WORKTREE and must NOT run at module import — the
  // log-channels/server barrel is imported nearly everywhere, incl. inside the
  // import-safe @plugins/database/server graph). An ephemeral channel has
  // `makeSink === null` and stays memory-only. Durability is a declaration
  // (`defineLogSink` / the client-ingress family), never a flag.
  makeSink: (() => FileSink) | null;
  sink: FileSink | null;
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
    // Resolve the durable sink on first publish (deferred so declaration is
    // import-safe — see InternalChannel.makeSink). The JSON envelope lives HERE:
    // file-sink is a generic bounded-append primitive that writes a plain string
    // verbatim, so log-channels owns the `{t,stream,line}` wire format the read
    // path parses back.
    if (!internal.sink && internal.makeSink) internal.sink = internal.makeSink();
    if (internal.sink) internal.sink.append(JSON.stringify({ t, stream, line }));
  };
}

/**
 * Register a channel exactly once (throws on a duplicate id). `makeSink` is the
 * deferred factory for the channel's durable backing store (built on first
 * publish), or `null` for an ephemeral memory-only channel.
 */
export function createChannel(
  id: string,
  makeSink: (() => FileSink) | null = null,
): LogChannel {
  if (registry.has(id)) throw new Error(`Log channel "${id}" already exists`);

  const internal: InternalChannel = {
    id,
    entries: [],
    listeners: new Set(),
    nextSeq: 1,
    makeSink,
    sink: null,
  };
  registry.set(id, internal);

  return { publish: makePublisher(internal) };
}

/**
 * Idempotent channel accessor for the client-log ingress, whose channel ids are
 * browser-supplied and unbounded. `makeSink` is stored (not invoked) on first
 * sight and resolved on the channel's first publish.
 */
export function getOrCreateChannel(
  id: string,
  makeSink?: () => FileSink,
): LogChannel {
  let internal = registry.get(id);
  if (!internal) {
    internal = {
      id,
      entries: [],
      listeners: new Set(),
      nextSeq: 1,
      makeSink: makeSink ?? null,
      sink: null,
    };
    registry.set(id, internal);
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
