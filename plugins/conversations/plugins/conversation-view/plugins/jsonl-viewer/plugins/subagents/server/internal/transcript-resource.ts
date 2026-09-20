import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  conversationChainTag,
  watchPaths,
} from "@plugins/conversations/plugins/transcript-watcher/server";
import type { SubagentTranscript } from "../../core";
import { subagentTranscriptResource as descriptor } from "../../core";
import {
  evictSubagentTranscript,
  primeSubagentTranscript,
  subagentTranscriptMemo,
  transcriptMemoKey,
} from "./caches";
import {
  readSubagentTranscript,
  resolveTranscriptTargets,
} from "./transcript-read";

type Params = { id: string; toolUseId: string };

const unsubscribes = new Map<string, () => void>();

export const subagentTranscriptResource = defineExternalResource(descriptor, {
  mode: "push",
  loader: ({ id, toolUseId }: Params) =>
    subagentTranscriptMemo.get(transcriptMemoKey(id, toolUseId)),
  revalidate: ({ id, toolUseId }: Params): Promise<string> =>
    subagentTranscriptMemo.signature(transcriptMemoKey(id, toolUseId)),
  onFirstSubscribe({ id, toolUseId }: Params) {
    const key = transcriptMemoKey(id, toolUseId);
    if (unsubscribes.has(key)) return;
    const unsub = watchPaths<SubagentTranscript>(
      {
        key: `subagent-transcript:${id}:${toolUseId}`,
        refreshOn: conversationChainTag(id),
        resolve: () => resolveTranscriptTargets(id, toolUseId),
        // The RAW read, not the memo — the room primes the memo with the pair it
        // just produced (see activity-resource.ts).
        read: () => readSubagentTranscript(id, toolUseId),
      },
      ({ value, signature }) => {
        primeSubagentTranscript(key, signature, value);
        subagentTranscriptResource.notify({ id, toolUseId });
      },
    );
    unsubscribes.set(key, unsub);
  },
  onLastUnsubscribe({ id, toolUseId }: Params) {
    const key = transcriptMemoKey(id, toolUseId);
    unsubscribes.get(key)?.();
    unsubscribes.delete(key);
    evictSubagentTranscript(key);
  },
});
