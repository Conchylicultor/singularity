import type { ComponentType } from "react";
import { TerminalView } from "./components/terminal";

export function terminalPane(
  opts?: { command?: string[]; title?: string },
): { title: string; component: ComponentType } {
  const Component = () => <TerminalView command={opts?.command} />;
  return { title: opts?.title ?? "Terminal", component: Component };
}
