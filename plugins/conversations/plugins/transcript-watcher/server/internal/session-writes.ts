import { basename, dirname } from "node:path";
import type { FileChangeEvent } from "@plugins/infra/plugins/file-watcher/server";

// "A session's transcript was written" as a broadcast, fed by the one projects-
// dir subscription (watcher.ts) BEFORE room dispatch — so a transcript nobody
// has a room for yet (a session id not yet recorded anywhere) still reaches a
// listener. The status reconciler is why: it may only adopt a session id once
// that id's transcript exists, and the CLI creates the file a moment AFTER the
// sessions-file write that woke it — so it waits for this.

type Listener = (sessionIds: ReadonlySet<string>) => void;

const listeners = new Set<Listener>();

/** A top-level session transcript is `<projects>/<dir>/<uuid>.jsonl`. */
const SESSION_FILE_RE = /^([0-9a-f-]{36})\.jsonl$/;

/**
 * The session ids whose top-level transcript a batch created or appended to.
 * Sub-agent files sit deeper (`<dir>/<session>/subagents/…`) and are not
 * sessions. Creates and updates are both counted: FSEvents may coalesce a
 * file's birth with its first write into one `update`, and a listener filters
 * by the ids it is waiting on anyway.
 */
export function writtenSessionIds(
  events: readonly FileChangeEvent[],
  projectsDir: string,
): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === "delete") continue;
    if (dirname(dirname(event.path)) !== projectsDir) continue;
    const match = SESSION_FILE_RE.exec(basename(event.path));
    if (match) ids.add(match[1]!);
  }
  return ids;
}

/**
 * Hear about every session transcript written on this host, as the set of
 * session ids each watcher batch touched. Called on the watcher's batch, so a
 * listener must be cheap (a map lookup) and must not throw. Returns the
 * unsubscribe.
 */
export function onSessionTranscriptWritten(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fan a watcher batch out to the listeners. */
export function notifySessionTranscriptWrites(
  events: readonly FileChangeEvent[],
  projectsDir: string,
): void {
  if (listeners.size === 0) return;
  const ids = writtenSessionIds(events, projectsDir);
  if (ids.size === 0) return;
  for (const listener of listeners) listener(ids);
}
