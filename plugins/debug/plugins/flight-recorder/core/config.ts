import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Flight-recorder knobs. Slow thresholds are NOT duplicated here — the hook
// reuses the `slow-op` config (single source of "what is slow"); these fields
// only govern how often a trip may persist a snapshot and how far back the
// captured window reaches. All render for free in Settings → Config; the
// server reads them live via watchConfig so changes take effect without a
// restart.
export const flightRecorderConfig = defineConfig({
  name: "flight-recorder",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, the slow-span hook is not installed and no flight snapshots are recorded.",
    }),
    cooldownMs: intField({
      default: 10_000,
      min: 0,
      label: "Per-op cooldown (ms)",
      description:
        "Minimum time between two snapshots for the same operation (kind:label). A repeatedly-slow op produces one snapshot per cooldown window, not one per occurrence.",
    }),
    maxPerMin: intField({
      default: 30,
      min: 0,
      label: "Global snapshot cap (per minute)",
      description:
        "Hard cap on snapshots persisted per minute across all operations, so a slow-event storm cannot saturate the recorder.",
    }),
    windowMs: intField({
      default: 10_000,
      min: 0,
      label: "Minimum lookback window (ms)",
      description:
        "Minimum lookback for the captured window; the actual window is max(trip duration, this), so a long trip always covers its own lifetime.",
    }),
  },
});
