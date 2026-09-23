import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  conversationChainTag,
  watchPaths,
} from "@plugins/conversations/plugins/transcript-watcher/server";
import type { SubagentRef, SubagentTranscript } from "../../core";
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

type Params = { id: string } & SubagentRef;

const unsubscribes = new Map<string, () => void>();

export const subagentTranscriptResource = defineExternalResource(descriptor, {
  mode: "push",
  loader: ({ id, by, key }: Params) =>
    subagentTranscriptMemo.get(transcriptMemoKey(id, { by, key })),
  revalidate: ({ id, by, key }: Params): Promise<string> =>
    subagentTranscriptMemo.signature(transcriptMemoKey(id, { by, key })),
  onFirstSubscribe({ id, by, key: refKey }: Params) {
    const ref: SubagentRef = { by, key: refKey };
    const key = transcriptMemoKey(id, ref);
    if (unsubscribes.has(key)) return;
    const unsub = watchPaths<SubagentTranscript>(
      {
        key: `subagent-transcript:${id}:${by}:${refKey}`,
        refreshOn: conversationChainTag(id),
        resolve: () => resolveTranscriptTargets(id, ref),
        // The RAW read, not the memo — the room primes the memo with the pair it
        // just produced (see activity-resource.ts).
        read: () => readSubagentTranscript(id, ref),
      },
      ({ value, signature }) => {
        primeSubagentTranscript(key, signature, value);
        subagentTranscriptResource.notify({ id, ...ref });
      },
    );
    unsubscribes.set(key, unsub);
  },
  onLastUnsubscribe({ id, by, key: refKey }: Params) {
    const key = transcriptMemoKey(id, { by, key: refKey });
    unsubscribes.get(key)?.();
    unsubscribes.delete(key);
    evictSubagentTranscript(key);
  },
});
