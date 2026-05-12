import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdAutoAwesome } from "react-icons/md";
import { claudeCliCallsPane } from "./panes";

export { claudeCliCallsPane } from "./panes";

export default {
  id: "debug-claude-cli-calls",
  name: "Claude CLI Calls",
  description:
    "Debug pane listing every single-shot `claude --print` call (Haiku/Sonnet/Opus) with prompt, output, source, and duration.",
  contributions: [
    Pane.Register({ pane: claudeCliCallsPane }),
    DebugApp.Sidebar({
      id: "claude-cli-calls",
      ...sidebarNavItem({ title: "Claude CLI Calls", icon: MdAutoAwesome, onClick: () => claudeCliCallsPane.open({}) }),
    }),
  ],
} satisfies PluginDefinition;
