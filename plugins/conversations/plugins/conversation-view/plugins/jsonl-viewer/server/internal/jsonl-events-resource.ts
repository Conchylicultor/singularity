import { lstat } from "node:fs/promises";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  resolveConversationTranscriptPaths,
  readJsonlEventsFromChain,
  watchTranscript,
} from "@plugins/conversations/plugins/transcript-watcher/server";
import { JsonlEventsPayloadSchema } from "../../core/protocol";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { jsonlChainEtag } from "./jsonl-etag";

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
    return readJsonlEventsFromChain(await resolveConversationTranscriptPaths(id));
  },
  // Cheap ETag: the conversation's session-chain files are the source of truth, and
  // an appended event changes a file's (mtime, size). We fingerprint every chain
  // file via one `lstat` each, NOT the in-memory `cachedEvents` map (empty after a
  // restart, exactly when this matters). Cost: N `lstat`s vs. the loader's full read
  // + JSON parse + merge of the whole chain.
  revalidate: async ({ id }: Params): Promise<string> => {
    const paths = await resolveConversationTranscriptPaths(id);
    const files: { path: string; mtimeMs: number; size: number }[] = [];
    for (const path of paths) {
      try {
        const st = await lstat(path);
        files.push({ path, mtimeMs: st.mtimeMs, size: st.size });
      } catch (err) {
        // ENOENT: this chain file vanished between resolve and stat — omit it, which
        // moves the signature and degrades to a recompute. Anything else is
        // unexpected and re-thrown so it fails loudly.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
    return jsonlChainEtag(paths.length, files);
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
