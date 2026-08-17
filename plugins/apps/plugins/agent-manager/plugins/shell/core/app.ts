import { defineApp } from "@plugins/primitives/plugins/pane/core";

export const agentManagerApp = defineApp({
  id: "agent-manager",
  name: "Agent Manager",
  basePath: "/agents",
  iconKey: "chat_bubble",
});
