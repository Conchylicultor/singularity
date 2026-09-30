import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { TaskNotification } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/task-notification/web";
import { shellOutputPane } from "./panes";
import { useShellNotificationClaim } from "./internal/use-shell-claim";

export { shellOutputPane } from "./panes";
export { ShellStateChip } from "./components/shell-state-chip";
export {
  useConversationShells,
  useShellOutput,
} from "./internal/use-conversation-shells";
export type { ConversationShells } from "./internal/use-conversation-shells";
export { shellStateDisplay } from "./internal/state-display";
export type { ShellStateDisplay } from "./internal/state-display";

export default {
  description:
    "The background-shell surfaces: every background Bash shell of a conversation and its state (useConversationShells, folded from the transcript the view already holds), its live output tail (useShellOutput), the one state chip every surface shows, and the read-only output pane that streams it.",
  contributions: [
    Pane.Register({ pane: shellOutputPane }),
    TaskNotification.Open({
      id: "background-shell",
      useClaim: useShellNotificationClaim,
    }),
  ],
  slots: { "shell-output": shellOutputPane },
} satisfies PluginDefinition;
