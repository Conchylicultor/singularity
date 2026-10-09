import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { claudeCliCallsPane, claudeCliCallDetailPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { claudeCliCallsPane, claudeCliCallDetailPane } from "./panes";

export default {
  description:
    "Debug pane listing every single-shot `claude --print` call (Haiku/Sonnet/Opus) as a live DataView — searchable over prompt/output/error, filterable by source, model, status, duration and time — with a detail pane per call (prompt, system, output or error, context, meta).",
  contributions: [
    Pane.Register({ pane: claudeCliCallsPane }),
    Pane.Register({ pane: claudeCliCallDetailPane }),
    DebugApp.Sidebar({
      id: "claude-cli-calls",
      title: "Claude CLI Calls",
      icon: symbol("auto-awesome"),
      opens: { pane: claudeCliCallsPane, params: {} },
    }),
  ],
  slots: {
    "claude-cli-calls": claudeCliCallsPane,
    "claude-cli-call-detail": claudeCliCallDetailPane,
  },
} satisfies PluginDefinition;
