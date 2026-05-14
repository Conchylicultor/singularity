import type { PluginDefinition } from "@core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { MdPrecisionManufacturing } from "react-icons/md";
import {
  agentsRootPane,
  agentDetailPane,
  systemAgentDetailPane,
  agentSidePane,
} from "./panes";
import { AgentAvatarRow } from "./components/agent-avatar-row";
import { AgentAvatarTitlePrefix } from "./components/agent-avatar-title-prefix";
import { DeleteAgentAction } from "./components/delete-agent-action";
import { ExpandAgentButton } from "./components/expand-agent-button";
import { ExpandCollapseAllAction } from "./components/expand-collapse-all-action";
import { Agents as AgentsSlots } from "./slots";

export {
  agentsRootPane,
  agentDetailPane,
  systemAgentDetailPane,
  agentSidePane,
} from "./panes";
export { Agents } from "./slots";
export { agentsResource } from "../shared/resources";
export { defineSystemAgent } from "./system-agents";
export type { SystemAgentDescriptor } from "./system-agents";
export { patchAgent } from "./components/agents-list";

export default {
  id: "agents",
  name: "Agents",
  description: "Named agent definitions that launch conversations.",
  contributions: [
    Pane.Register({ pane: agentsRootPane }),
    Pane.Register({ pane: agentDetailPane }),
    Pane.Register({ pane: systemAgentDetailPane }),
    Pane.Register({ pane: agentSidePane }),
    agentSidePane.Actions({ component: ExpandAgentButton }),
    Shell.Sidebar({
      id: "agents",
      ...sidebarNavItem({ title: "Agents", icon: MdPrecisionManufacturing, onClick: () => openPane(agentsRootPane, {}, { mode: "root" }) }),
    }),
    Item.Avatar({
      match: (conv) => conv.kind === "agent",
      component: AgentAvatarRow,
    }),
    Conversation.TitlePrefix({ component: AgentAvatarTitlePrefix }),
    AgentsSlots.AgentActions({
      id: "expand-collapse-all",
      component: ExpandCollapseAllAction,
    }),
    AgentsSlots.AgentActions({ id: "delete", component: DeleteAgentAction }),
  ],
} satisfies PluginDefinition;
