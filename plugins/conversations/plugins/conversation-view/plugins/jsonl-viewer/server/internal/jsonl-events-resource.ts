import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  findTranscriptPath,
  readJsonlEvents,
  watchTranscript,
} from "@plugins/conversations/plugins/transcript-watcher/server";
import { getConversationClaudeSessionId } from "@plugins/tasks/plugins/tasks-core/server";
import { JsonlEventsPayloadSchema } from "../../core/protocol";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

type Params = { id: string };

const unsubscribes = new Map<string, () => void>();
const cachedEvents = new Map<string, JsonlEvent[]>();

export const jsonlEventsResource = defineResource({
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
