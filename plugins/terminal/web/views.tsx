import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { TerminalView } from "./components/terminal";

export function terminalPane(): PaneDescriptor {
  return { title: "Terminal", component: TerminalView };
}
