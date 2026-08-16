import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  registerRemovalChannel,
  unregisterRemovalChannel,
} from "./internal/channel";
import { externalRemovalKind } from "./internal/removal-kind";
import {
  startWorktreeRemovalAudit,
  stopWorktreeRemovalAudit,
} from "./internal/watcher";

export {
  startWorktreeRemovalAudit,
  stopWorktreeRemovalAudit,
} from "./internal/watcher";
export {
  CORRELATION_WINDOW_MS,
  classifyDisappearance,
  diffVanished,
} from "./internal/classify";
export type { Attribution, DisappearanceVerdict } from "./internal/classify";
export { ExternalRemovalPayloadSchema } from "./internal/removal-kind";
export type { ExternalRemovalPayload } from "./internal/removal-kind";

export default {
  description:
    "Worktree checkout disappearance audit: a main-only watcher over <repo>/.claude/worktrees that diffs the top-level checkout set on every filesystem event and records each vanished checkout to the worktree-removal channel — attributed to an in-app removeWorktree call when one claims it, or filed as a worktree-removed-externally report (Debug → Reports + bell) with a process snapshot when none does.",
  contributions: [externalRemovalKind],
  onReady: async () => {
    registerRemovalChannel();
    await startWorktreeRemovalAudit();
  },
  onShutdown: async () => {
    unregisterRemovalChannel();
    await stopWorktreeRemovalAudit();
  },
} satisfies ServerPluginDefinition;
