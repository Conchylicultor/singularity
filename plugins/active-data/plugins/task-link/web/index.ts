import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  InlineChip,
  inlineChip,
} from "@plugins/primitives/plugins/text-editor/plugins/inline-chip/web";
import { TASK_ID_RE } from "../core";
import { TaskLinkChip } from "./components/task-link-chip";

export { TaskLinkChip };

export default {
  description:
    "Renders raw `task-<id>` strings inline as clickable chips that open the task detail pane. Models emit the bare id, no tag wrapping needed.",
  contributions: [
    InlineChip.Tag(
      inlineChip({
        id: "task-link",
        pattern: TASK_ID_RE,
        surfaces: ["transcript", "document"],
        component: TaskLinkChip,
      }),
    ),
  ],
} satisfies PluginDefinition;
