import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";

// Tunable thresholds for the live-state churn monitor. The scheduled monitor job
// reads these live via getConfig each tick, so changes take effect on the next
// run without a restart. Mirrors queueHealthConfig's shape (one defineConfig with
// field factories rendered for free in Settings → Config).
export const liveStateChurnConfig = defineConfig({
  name: "live-state-churn",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, the monitor job returns early and files no live-state churn reports.",
    }),
    noopRateThreshold: floatField({
      default: 1,
      min: 0,
      label: "No-op rate threshold (per second)",
      description:
        "File a live-state-noop report when a resource sustains this many no-op (empty-diff) pushes per second over the window.",
    }),
    windowSeconds: intField({
      default: 60,
      min: 1,
      label: "Window (seconds)",
      description:
        "Sliding window over which the no-op push rate is measured.",
    }),
    minNoopSamples: intField({
      default: 30,
      min: 0,
      label: "Minimum no-op samples",
      description:
        "Minimum number of no-op pushes that must occur in the window before a report fires — avoids boot-time false positives.",
    }),
  },
});
