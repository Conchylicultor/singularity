import { join } from "node:path";
import { defineFileSink, openDynamicSink } from "@plugins/infra/plugins/file-sink/core";
import { getOrCreateChannel } from "./registry";
import type { LogStream } from "./registry";
import { logsDir } from "./persist";

// The browser `clientLog` ingress. This is the ONE genuinely open-ended sink
// family: `POST /api/logs/emit` carries an ARBITRARY, browser-supplied channel
// id, so each such channel can't be its own `defineFileSink` (no fixed path
// known ahead of time). They ALL share the same 128 MB × 3 rotation via
// `openDynamicSink`, which sanitizes the id into the logs dir and does NOT touch
// the sink registry (registering each dynamic id would make the registry itself
// unbounded).
//
// The whole family is declared ONCE as a single `file:client-log` bound so it is
// enumerable and growth-bounded in `getFileSinks()` — the whole point of the
// durable-sink invariant. `defineFileSink` is per-path, which the family isn't;
// this representative entry (path `<logsDir>/client-log.jsonl`, never itself
// written unless a browser literally names a channel "client-log") stands in for
// the family. The real per-channel writes go to sibling `<channel>.jsonl` files
// under the same rotation.
//
// It is declared LAZILY on the first ingress (not at module eval): resolving the
// logs dir reads SINGULARITY_WORKTREE, and this module is on the import path of
// the log-channels/server barrel, which must stay import-safe. First-ingress is
// also exactly when the first client-log file starts existing.
let familyBoundDeclared = false;
function ensureFamilyBound(): void {
  if (familyBoundDeclared) return;
  familyBoundDeclared = true;
  defineFileSink({
    id: "client-log",
    description:
      "Family bound for browser clientLog ingress channels (open-ended, " +
      "browser-supplied ids). Every <channel>.jsonl written by POST /api/logs/emit " +
      "shares this 128 MB × 3 rotation via openDynamicSink; this representative " +
      "entry makes the family enumerable/bounded in getFileSinks().",
    path: join(logsDir(), "client-log.jsonl"),
  });
}

/**
 * Ingest one browser-supplied log line. Route-internal ONLY (the `/api/logs/emit`
 * handler) — NOT exported from the plugin barrel. Persistence here is inherent to
 * the ingress (client logs must survive to disk), which is exactly why this can't
 * be a general `Log.emit` callable from arbitrary server code: durable sinks are
 * declared, and the one open-ended family is declared above.
 */
export function emitClientLog(
  channelId: string,
  line: string,
  stream?: LogStream,
  t?: number,
): void {
  ensureFamilyBound();
  const channel = getOrCreateChannel(channelId, () =>
    openDynamicSink(logsDir(), channelId),
  );
  channel.publish(line, stream, t);
}
