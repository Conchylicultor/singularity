import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, inlineChip } from "@plugins/active-data/web";
import { TASK_ID_RE } from "../core";
import { TaskLinkChip } from "./components/task-link-chip";

export { TaskLinkChip };

export default {
  description:
    "Renders raw `task-<id>` strings inline as clickable chips that open the task detail pane. Models emit the bare id, no tag wrapping needed.",
  contributions: [
    ActiveData.Tag(
      inlineChip({
        id: "task-link",
        pattern: TASK_ID_RE,
        surfaces: ["transcript", "document"],
        component: TaskLinkChip,
      }),
    ),
  ],
} satisfies PluginDefinition;
