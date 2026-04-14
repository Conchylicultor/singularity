import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { LogViewer } from "./components/log-viewer";

export function logPane(args?: { channel?: string }): PaneDescriptor {
  const Component = () => <LogViewer initialChannel={args?.channel} />;
  const path = args?.channel ? `/logs/${args.channel}` : "/logs";
  return { title: "Logs", component: Component, path };
}
