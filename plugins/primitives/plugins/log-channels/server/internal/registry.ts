import type { FileSink } from "@plugins/infra/plugins/file-sink/core";

export type LogStream = "stdout" | "stderr";

export interface LogEntry {
  seq: number;
  line: string;
  stream: LogStream;
  timestamp: number;
}

/**
 * One line as a CALLER states it, before the channel stamps a `seq` on it. The
 * registry's own vocabulary — `timestamp`, matching `publish`'s parameter name,
 * not the `t` the on-disk envelope and the emit wire use. The rename happens once,
 * at the ingress boundary (`client-ingress.ts`).
 */
export interface PublishLine {
  line: string;
  stream?: LogStream;
  timestamp?: number;
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
  /**
   * Publish MANY lines as ONE durable write — the batch form of `publish`, and
   * the reason a caller holding an array (the browser ingress, whose POST carries
   * up to `MAX_EMIT_LINES`) never has to loop. Per-line WS delivery is unchanged:
   * one listener callback per line, in array order.
   */
  publishAll(items: readonly PublishLine[]): void;
}

const registry = new Map<string, InternalChannel>();
/** Ring-buffer depth per channel. Exported for the tests that pin the trim. */
export const MAX_HISTORY = 10_000;

function makeChannel(internal: InternalChannel): LogChannel {
  const publishAll = (items: readonly PublishLine[]): void => {
    if (items.length === 0) return;

    // Build the whole batch first, so the ring, the sink and the listeners all
    // see exactly the same entries. The JSON envelope is minted HERE: file-sink
    // is a generic bounded-append primitive that writes a plain string verbatim,
    // so log-channels owns the `{t,stream,line}` wire format the read path
    // parses back.
    const built: LogEntry[] = [];
    const envelopes: string[] = [];
    for (const item of items) {
      const stream = item.stream ?? "stdout";
      const t = item.timestamp ?? Date.now();
      built.push({
        seq: internal.nextSeq++,
        line: item.line,
        stream,
        timestamp: t,
      });
      envelopes.push(JSON.stringify({ t, stream, line: item.line }));
    }

    // ORDER: ring → sink → listeners. "Durable before broadcast" then holds per
    // batch — strictly stronger than the old per-line interleave, where it held
    // nowhere.
    //
    // Push one at a time rather than `entries.push(...built)`: `publishAll` is
    // public and takes a caller-supplied array, and spreading a large one blows
    // the stack. Then trim ONCE for the whole batch — a single ~76 KB `splice`
    // instead of 500 `shift()`s (~40 MB of memmove per POST against a full
    // 10 k ring). `entries` stays a plain oldest-first array, so `subscribe()`
    // is untouched.
    for (const entry of built) internal.entries.push(entry);
    const overflow = internal.entries.length - MAX_HISTORY;
    if (overflow > 0) internal.entries.splice(0, overflow);

    // Resolve the durable sink on first publish (deferred so declaration is
    // import-safe — see InternalChannel.makeSink). One write for the batch.
    if (!internal.sink && internal.makeSink)
      internal.sink = internal.makeSink();
    if (internal.sink) internal.sink.appendAll(envelopes);

    for (const entry of built) {
      for (const fn of internal.listeners) fn(entry);
    }
  };

  return {
    // `publishAll` is the SINGLE implementation; `publish` delegates with a
    // one-element array. Same anti-drift argument as file-sink's
    // `append`/`appendAll`: two copies is exactly how the envelope format, the
    // ring trim and the ring→sink→listeners order would silently diverge.
    publish: (line, stream, timestamp) =>
      publishAll([{ line, stream, timestamp }]),
    publishAll,
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

  return makeChannel(internal);
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

  return makeChannel(internal);
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
