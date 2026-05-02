import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { taskFilePeekPane } from "./panes";

export { taskFilePeekPane } from "./panes";

export default {
  id: "task-file-peek",
  name: "Task: File peek",
  description:
    "Right-panel preview for files referenced from a task description. Opens as a child pane (Miller column) of taskDetailPane.",
  contributions: [Pane.Register({ pane: taskFilePeekPane })],
} satisfies PluginDefinition;
