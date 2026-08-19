import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  startTranscriptWatcher,
  stopTranscriptWatcher,
} from "./internal/watcher";
import { foreignSessionKind } from "./internal/foreign-session-kind";

export { watchTranscript, refreshConversationChain } from "./internal/watcher";
export type { TranscriptSnapshot } from "./internal/watcher";
// The BOUND signature only. `statChain` / `chainEtag` / `chainFileEtag` stay internal:
// a consumer that assembles its own signature from the halves is a second authority.
export { transcriptChainSignature } from "./internal/chain-signature";
export {
  readJsonlEvents,
  readJsonlEventsFromChain,
  readChainLines,
} from "./internal/parse-jsonl";
export { findTranscriptPath } from "./internal/find-transcript-path";
export { resolveConversationTranscriptPaths } from "./internal/resolve-chain";
// The ownership partition itself, for consumers that need the rejected half —
// a monitor auditing chains, or the poller's adoption gate — rather than just
// the files to read.
export { resolveAnchoredChain } from "./internal/anchor";
export type { AnchoredChain, AnchoredEntry } from "./internal/anchor";

export default {
  description:
    "Single @parcel/watcher-based JSONL transcript watcher. Replaces two independent 500ms pollers with one fan-out subscription.",
  contributions: [foreignSessionKind],
  onReady: async () => {
    await startTranscriptWatcher();
  },
  onShutdown: async () => {
    await stopTranscriptWatcher();
  },
} satisfies ServerPluginDefinition;
