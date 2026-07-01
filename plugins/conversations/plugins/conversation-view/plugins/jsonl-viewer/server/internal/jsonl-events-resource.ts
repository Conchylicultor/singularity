import { lstat } from "node:fs/promises";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  findTranscriptPath,
  readJsonlEvents,
  watchTranscript,
} from "@plugins/conversations/plugins/transcript-watcher/server";
import { getConversationClaudeSessionId } from "@plugins/tasks/plugins/tasks-core/server";
import { JsonlEventsPayloadSchema } from "../../core/protocol";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { jsonlEtag } from "./jsonl-etag";

type Params = { id: string };

const unsubscribes = new Map<string, () => void>();
const cachedEvents = new Map<string, JsonlEvent[]>();

export const jsonlEventsResource = defineExternalResource({
  key: "jsonl-events",
  mode: "push",
  schema: JsonlEventsPayloadSchema,
  loader: async ({ id }: Params) => {
    const cached = cachedEvents.get(id);
    if (cached) return cached;
    const claudeSessionId = await getConversationClaudeSessionId(id);
    if (!claudeSessionId) return [];
    const path = await findTranscriptPath(claudeSessionId);
    if (!path) return [];
    return readJsonlEvents(path);
  },
  // Cheap ETag: the transcript file is the source of truth, and an appended event
  // changes its (mtime, size). We fingerprint the FILE via one `lstat`, NOT the
  // in-memory `cachedEvents` map (empty after a restart, exactly when this matters).
  // No session / no path / vanished file ⇒ "none" — which never matches a prior
  // real path-etag, so it degrades to a recompute (safe), never a stale match.
  // Cost: 1 `lstat` vs. the loader's full file read + JSON parse of the transcript.
  revalidate: async ({ id }: Params): Promise<string> => {
    const claudeSessionId = await getConversationClaudeSessionId(id);
    if (!claudeSessionId) return "none";
    const path = await findTranscriptPath(claudeSessionId);
    if (!path) return "none";
    try {
      const st = await lstat(path);
      return jsonlEtag(path, st.mtimeMs, st.size);
    } catch (err) {
      // ENOENT: the resolved path vanished — degrade to a recompute. Anything else
      // is unexpected and re-thrown so it fails loudly.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return "none";
    }
  },
  async onFirstSubscribe({ id }: Params) {
    if (unsubscribes.has(id)) return;
    const unsub = watchTranscript(id, (events) => {
      cachedEvents.set(id, events);
      jsonlEventsResource.notify({ id });
    });
    unsubscribes.set(id, unsub);
  },
  onLastUnsubscribe({ id }: Params) {
    unsubscribes.get(id)?.();
    unsubscribes.delete(id);
    cachedEvents.delete(id);
  },
});
