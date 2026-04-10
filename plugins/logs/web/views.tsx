import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { LogViewer } from "./components/log-viewer";

export function logPane(args?: { channel?: string }): PaneDescriptor {
  const Component = () => <LogViewer initialChannel={args?.channel} />;
  return { title: "Logs", component: Component };
}
