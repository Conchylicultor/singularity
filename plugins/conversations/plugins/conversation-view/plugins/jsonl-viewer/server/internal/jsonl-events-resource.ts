import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { watchTranscript } from "@plugins/conversations/plugins/transcript-watcher/server";
import { JsonlEventsPayloadSchema } from "../../core/protocol";
import { evictJsonlEvents, jsonlEventsMemo, primeJsonlEvents } from "./jsonl-events-cache";

type Params = { id: string };

const unsubscribes = new Map<string, () => void>();

export const jsonlEventsResource = defineExternalResource({
  key: "jsonl-events",
  // `push` is a DELIVERY choice — an `update` frame ships the whole event array, and
  // the client renders it without a refetch. It is no longer a correctness crutch: the
  // ETag and the value come from one authority (jsonl-events-cache.ts), so this
  // resource is sound under `invalidate` too. Switching is now a pure frame-size
  // decision, which is the entire point of that binding.
  mode: "push",
  schema: JsonlEventsPayloadSchema,
  // The ETag and the value are produced by ONE authority: `jsonlEventsMemo` is a
  // `createSignedMemo` binding `transcriptChainSignature` to `readJsonlEventsFromChain`
  // at its single declaration site, both over the chain `resolveConversationTranscriptPaths`
  // returns. `revalidate` and `loader` are therefore provably the same function of the
  // same inputs, not two probes agreeing by convention — which is what they were.
  loader: ({ id }: Params) => jsonlEventsMemo.get(id),
  revalidate: ({ id }: Params): Promise<string> => jsonlEventsMemo.signature(id),
  onFirstSubscribe({ id }: Params) {
    if (unsubscribes.has(id)) return;
    const unsub = watchTranscript(id, ({ events, signature }) => {
      // Prime BEFORE notify: the watcher holds both halves of the pair, and the
      // `drainEntry` that `notify` schedules calls the loader — which is then a memo
      // hit instead of a second full read + parse of the chain the watcher just read.
      primeJsonlEvents(id, signature, events);
      jsonlEventsResource.notify({ id });
    });
    unsubscribes.set(id, unsub);
  },
  onLastUnsubscribe({ id }: Params) {
    unsubscribes.get(id)?.();
    unsubscribes.delete(id);
    // Pure lifecycle cleanup. A late prime landing across this evict is harmless: the
    // entry it resurrects carries its own signature, and any reader probes the CURRENT
    // one, so a surviving entry is served only if it still matches the chain on disk.
    evictJsonlEvents(id);
  },
});
