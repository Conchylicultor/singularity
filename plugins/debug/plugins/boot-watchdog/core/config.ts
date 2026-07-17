import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Config for the boot-watchdog monitor. The scheduled monitor job reads these
// live via getConfig each tick, so changes take effect on the next run without a
// restart. Mirrors bootBudgetConfig's shape (one defineConfig with field
// factories rendered for free in Settings → Config).
//
// The `name` is a load-bearing literal (persisted config); do not rename.
export const bootWatchdogConfig = defineConfig({
  name: "boot-watchdog",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, the monitor job returns early and files no boot-wedge reports.",
    }),
    bootReadyBudgetMs: intField({
      default: 120_000,
      min: 0,
      label: "Boot-ready budget (ms)",
      description:
        "File a boot-wedge report when a backend has not reached the boot `ready` line within this many ms of its process start. The default 120s is generous — a healthy boot (migrations + registry + onReady) is seconds; crossing two minutes means the backend is wedged, not merely slow.",
    }),
    lookbackMs: intField({
      default: 1_800_000,
      min: 0,
      label: "Lookback window (ms)",
      description:
        "How far back each tick sweeps every worktree's boot channel for never-ready boots. 30 min comfortably covers a wedged boot that outlives many watchdog ticks while keeping old, already-superseded outages from re-surfacing forever.",
    }),
  },
});
