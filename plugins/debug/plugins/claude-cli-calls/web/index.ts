import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { claudeCliCallsPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { claudeCliCallsPane } from "./panes";

export default {
  description:
    "Debug pane listing every single-shot `claude --print` call (Haiku/Sonnet/Opus) with prompt, output, source, and duration.",
  contributions: [
    Pane.Register({ pane: claudeCliCallsPane }),
    DebugApp.Sidebar({
      id: "claude-cli-calls",
      title: "Claude CLI Calls",
      icon: symbol("auto-awesome"),
      onClick: () => openPane(claudeCliCallsPane, {}, { mode: "root" }),
    }),
  ],
  slots: { "claude-cli-calls": claudeCliCallsPane },
} satisfies PluginDefinition;
