import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { SystemAgentDescriptor } from "./system-agents";

export const Agents = {
  List: defineSlot<{
    id: string;
    component: ComponentType;
  }>("agents.list"),
  View: defineSlot<{
    id: string;
    title?: string;
    component: ComponentType<{ agentId: string }>;
  }>("agents.view"),
  AgentActions: defineSlot<{
    id: string;
    component: ComponentType<{ agentId: string; hasChildren: boolean }>;
  }>("agents.agent-actions"),
  SystemAgent: defineSlot<SystemAgentDescriptor>("agents.system-agent"),
};
