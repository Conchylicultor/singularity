import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { startTranscriptWatcher, stopTranscriptWatcher } from "./internal/watcher";

export { watchTranscript } from "./internal/watcher";
export { readJsonlEvents } from "./internal/parse-jsonl";
export { findTranscriptPath } from "./internal/find-transcript-path";

export default {
  id: "conversation-transcript-watcher",
  name: "Conversation: Transcript Watcher",
  description:
    "Single @parcel/watcher-based JSONL transcript watcher. Replaces two independent 500ms pollers with one fan-out subscription.",
  onReady: async () => {
    await startTranscriptWatcher();
  },
  onShutdown: async () => {
    await stopTranscriptWatcher();
  },
} satisfies ServerPluginDefinition;
