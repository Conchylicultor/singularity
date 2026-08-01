import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskHeader } from "./components/task-header";

export default {
  description:
    "Top section of the task detail pane: editable title, status chip, hold/drop buttons, author, auto-start, and Launch buttons.",
  contributions: [
    TaskDetailSlots.Section({
      id: "header",
      label: "Header",
      component: TaskHeader,
      // The pane's identity block, not a panel: a title input + status + launch
      // controls must never collapse behind a card titled "Header".
      //
      // Deliberately NOT `excludeFromReorder` — that flag means "pinned LAST"
      // (reorder/web/internal/sorting.ts, "Excluded items pinned last"), which
      // would sink the identity block to the foot of the pane. First position
      // comes from registration order instead. Pinning it there needs a
      // pin-first notion reorder does not have yet.
      chrome: "none",
    }),
  ],
} satisfies PluginDefinition;
