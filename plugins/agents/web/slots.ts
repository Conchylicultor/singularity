import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { SystemAgentDescriptor } from "./system-agents";

export const Agents = {
  List: defineSlot<{
    id: string;
    component: ComponentType;
  }>("agents.list", { docLabel: (p) => p.id }),
  ListActions: defineSlot<{
    id: string;
    component: ComponentType;
  }>("agents.list-actions", { docLabel: (p) => p.id }),
  View: defineSlot<{
    id: string;
    title?: string;
    component: ComponentType<{ agentId: string }>;
  }>("agents.view", { docLabel: (p) => p.title ?? p.id }),
  AgentActions: defineSlot<{
    id: string;
    component: ComponentType<{ agentId: string; hasChildren: boolean }>;
  }>("agents.agent-actions", { docLabel: (p) => p.id }),
  SystemAgent: defineSlot<SystemAgentDescriptor>("agents.system-agent", {
    docLabel: (p) => p.name,
  }),
};
