import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { MdPrecisionManufacturing } from "react-icons/md";
import {
  agentsRootPane,
  agentDetailPane,
  agentConversationPane,
  systemAgentDetailPane,
} from "./panes";
import { AgentChipRow } from "./components/agent-chip-row";
import { AgentChipToolbar } from "./components/agent-chip-toolbar";

export {
  agentsRootPane,
  agentDetailPane,
  agentConversationPane,
  systemAgentDetailPane,
} from "./panes";
export { Agents } from "./slots";
export { defineSystemAgent } from "./system-agents";
export type { SystemAgentDescriptor } from "./system-agents";

export default {
  id: "agents",
  name: "Agents",
  description: "Named agent definitions that launch conversations.",
  contributions: [
    Pane.Register({ pane: agentsRootPane }),
    Pane.Register({ pane: agentDetailPane }),
    Pane.Register({ pane: agentConversationPane }),
    Pane.Register({ pane: systemAgentDetailPane }),
    Shell.Sidebar({
      title: "Agents",
      icon: MdPrecisionManufacturing,
      group: "System",
      onClick: () => agentsRootPane.open({}),
    }),
    Item.Chips({ component: AgentChipRow }),
    conversationPane.Actions({ component: AgentChipToolbar, position: "left" }),
  ],
} satisfies PluginDefinition;
