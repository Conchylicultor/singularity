import { defineResource } from "@server/resources";
import { findTranscriptPath } from "@plugins/conversations/server";
import { getConversationClaudeSessionId } from "@plugins/tasks-core/server";
import { readJsonlEvents } from "./parse-jsonl";
import { watchJsonl } from "./watch-jsonl";

type Params = { id: string };

const unsubscribes = new Map<string, () => void>();

export const jsonlEventsResource = defineResource({
  key: "jsonl-events",
  mode: "push",
  loader: async ({ id }: Params) => {
    const claudeSessionId = await getConversationClaudeSessionId(id);
    if (!claudeSessionId) return [];
    const path = await findTranscriptPath(claudeSessionId);
    if (!path) return [];
    return readJsonlEvents(path);
  },
  async onFirstSubscribe({ id }: Params) {
    if (unsubscribes.has(id)) return;
    let first = true;
    const unsub = watchJsonl(id, () => {
      if (first) {
        first = false;
        return;
      }
      jsonlEventsResource.notify({ id });
    });
    unsubscribes.set(id, unsub);
  },
  onLastUnsubscribe({ id }: Params) {
    unsubscribes.get(id)?.();
    unsubscribes.delete(id);
  },
});
