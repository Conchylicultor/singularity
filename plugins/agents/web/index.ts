import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { MdPrecisionManufacturing } from "react-icons/md";
import {
  agentsRootPane,
  agentDetailPane,
  agentConversationPane,
  systemAgentDetailPane,
  agentSidePane,
} from "./panes";
import { AgentAvatarRow } from "./components/agent-avatar-row";
import { AgentAvatarTitlePrefix } from "./components/agent-avatar-title-prefix";

export {
  agentsRootPane,
  agentDetailPane,
  agentConversationPane,
  systemAgentDetailPane,
  agentSidePane,
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
    Pane.Register({ pane: agentSidePane }),
    Shell.Sidebar({
      title: "Agents",
      icon: MdPrecisionManufacturing,
      group: "System",
      onClick: () => agentsRootPane.open({}),
    }),
    Item.Avatar({
      match: (conv) => conv.kind === "agent",
      component: AgentAvatarRow,
    }),
    Conversation.TitlePrefix({ component: AgentAvatarTitlePrefix }),
  ],
} satisfies PluginDefinition;
