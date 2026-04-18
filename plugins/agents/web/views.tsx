import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { AgentsPanel } from "./components/agents-panel";

export function agentsPane(args?: { id?: string }): PaneDescriptor {
  const Component = () => <AgentsPanel selectedId={args?.id} />;
  const path = args?.id ? `/agents/${args.id}` : "/agents";
  return { title: "Agents", component: Component, path };
}
