import type { PluginDefinition } from "@core";
import { MdBolt } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Debug } from "@plugins/debug/web";
import { eventsTestPane } from "./panes";

export { eventsTestPane } from "./panes";

export default {
  id: "events-test",
  name: "Events Test",
  description: "Dummy UI for exercising the events plugin end-to-end.",
  contributions: [
    Pane.Register({ pane: eventsTestPane }),
    Debug.Item({
      id: "events-test",
      title: "Events Test",
      icon: MdBolt,
      onClick: () => eventsTestPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
