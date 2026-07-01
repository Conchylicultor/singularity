import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Tunable per-kind call-rate thresholds for the op-rate monitor. The scheduled
// monitor job reads these live via getConfig each tick, so changes take effect
// on the next run without a restart. Mirrors slowOpConfig's per-kind shape (one
// defineConfig with field factories rendered for free in Settings → Config).
// Each threshold is "calls in one monitor window" (the cron interval); a kind
// trips when its per-op delta since the previous tick exceeds the threshold.
// `db` / `flush` are inherently high-count (every query / every internal notify
// cycle), so they carry looser thresholds — a single floor would drown the
// signal.
export const opRateConfig = defineConfig({
  name: "op-rate",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, the monitor job returns early and files no op-rate reports.",
    }),
    httpPerWindow: intField({
      default: 500,
      min: 0,
      label: "HTTP calls per window",
      description:
        "File an op-rate report when an HTTP request label is called more than this many times within one monitor window.",
    }),
    loaderPerWindow: intField({
      default: 500,
      min: 0,
      label: "Loader calls per window",
      description:
        "File an op-rate report when a resource loader label runs more than this many times within one monitor window.",
    }),
    subPerWindow: intField({
      default: 500,
      min: 0,
      label: "Subscription calls per window",
      description:
        "File an op-rate report when a WS-subscription origin entry fires more than this many times within one monitor window.",
    }),
    pushPerWindow: intField({
      default: 500,
      min: 0,
      label: "Push calls per window",
      description:
        "File an op-rate report when a push/cascade origin entry fires more than this many times within one monitor window.",
    }),
    flushPerWindow: intField({
      default: 1000,
      min: 0,
      label: "Flush calls per window",
      description:
        "File an op-rate report when a live-state notify-flush cycle runs more than this many times within one monitor window (internally high-count).",
    }),
    dbPerWindow: intField({
      default: 5000,
      min: 0,
      label: "DB calls per window",
      description:
        "File an op-rate report when a database query label runs more than this many times within one monitor window (leaf-level, naturally high).",
    }),
    jobPerWindow: intField({
      default: 500,
      min: 0,
      label: "Job runs per window",
      description:
        "File an op-rate report when a job label runs more than this many times within one monitor window.",
    }),
  },
});
