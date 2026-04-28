import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Debug } from "@plugins/debug/web";
import { MdQueue } from "react-icons/md";
import { queuePane } from "./panes";

export { queuePane } from "./panes";

export default {
  id: "debug-queue",
  name: "Queue",
  description:
    "Inspect and debug the jobs queue, events emission log, and active triggers.",
  contributions: [
    Pane.Register({ pane: queuePane }),
    Debug.Item({
      id: "queue",
      title: "Queue",
      icon: MdQueue,
      onClick: () => queuePane.open({}),
    }),
  ],
} satisfies PluginDefinition;
