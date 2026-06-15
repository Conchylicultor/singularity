import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { ComponentType } from "react";
import type { Agent } from "../shared/resources";
import type { SystemAgentDescriptor } from "./system-agents";

export const Agents = {
  List: defineRenderSlot<{
    id: string;
    component: ComponentType;
  }>("agents.list", { docLabel: (p) => p.id }),
  ListActions: defineRenderSlot<{
    id: string;
    component: ComponentType;
  }>("agents.list-actions", { docLabel: (p) => p.id }),
  View: defineRenderSlot<{
    id: string;
    title?: string;
    component: ComponentType<{ agentId: string }>;
  }>("agents.view", { docLabel: (p) => p.title ?? p.id }),
  AgentActions: defineItemActions<Agent>("agents.agent-actions"),
  SystemAgent: defineRenderSlot<SystemAgentDescriptor>("agents.system-agent", {
    docLabel: (p) => p.name,
  }),
};
