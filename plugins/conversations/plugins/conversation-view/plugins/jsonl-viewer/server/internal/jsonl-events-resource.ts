import { defineResource } from "@server/resources";
import { findTranscriptPath } from "@plugins/conversations/server";
import { getConversationClaudeSessionId } from "@plugins/tasks-core/server";
import { JsonlEventsPayloadSchema } from "../../shared/protocol";
import { readJsonlEvents } from "./parse-jsonl";
import { watchJsonl } from "./watch-jsonl";

type Params = { id: string };

const unsubscribes = new Map<string, () => void>();

export const jsonlEventsResource = defineResource({
  key: "jsonl-events",
  mode: "push",
  schema: JsonlEventsPayloadSchema,
  loader: async ({ id }: Params) => {
    const claudeSessionId = await getConversationClaudeSessionId(id);
    if (!claudeSessionId) return [];
    const path = await findTranscriptPath(claudeSessionId);
    if (!path) return [];
    return readJsonlEvents(path);
  },
  async onFirstSubscribe({ id }: Params) {
    if (unsubscribes.has(id)) return;
    const unsub = watchJsonl(id, () => {
      jsonlEventsResource.notify({ id });
    });
    unsubscribes.set(id, unsub);
  },
  onLastUnsubscribe({ id }: Params) {
    unsubscribes.get(id)?.();
    unsubscribes.delete(id);
  },
});
