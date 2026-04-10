import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { TerminalView } from "./components/terminal";

export function terminalPane(
  opts?: { command?: string[]; title?: string },
): PaneDescriptor {
  const Component = () => <TerminalView command={opts?.command} />;
  return { title: opts?.title ?? "Terminal", component: Component };
}
