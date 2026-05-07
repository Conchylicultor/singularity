import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Debug } from "@plugins/debug/web";
import { MdSpeed } from "react-icons/md";
import { profilingPane } from "./panes";

export { profilingPane } from "./panes";

export default {
  id: "debug-profiling",
  name: "Boot Profiling",
  description: "Gantt chart of server startup phases and plugin spans.",
  contributions: [
    Pane.Register({ pane: profilingPane }),
    Debug.Item({
      id: "profiling",
      title: "Boot Profiling",
      icon: MdSpeed,
      onClick: () => profilingPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
