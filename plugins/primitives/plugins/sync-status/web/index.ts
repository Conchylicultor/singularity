import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SyncStatusIndicator } from "./components/sync-status-indicator";
export { SyncStatusProvider } from "./internal/provider";
export { useReportSync, type ReportSyncArgs } from "./internal/use-report-sync";
export type { SyncPhase } from "./internal/store";

export default {
  description:
    "Per-surface forced sync-status indicator: optimistic/autosave surfaces report {phase,label,retry} via useReportSync; the universal SyncStatusIndicator (mounted once per surface) renders a Google-Keep-style cloud (saving → saved → error+retry). Scoped per surface via scoped-store; tolerates no Provider.",
  contributions: [],
} satisfies PluginDefinition;
