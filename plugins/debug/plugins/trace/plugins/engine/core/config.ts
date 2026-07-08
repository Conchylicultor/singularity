import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Trace-engine admission knobs (the four flight-recorder fields, re-homed). They
// govern how often a trigger may persist a trace and how far back the captured
// window reaches — NOT what counts as slow (each trigger source owns its own
// threshold). All render for free in Settings → Config; captureTrace reads them
// synchronously at trip time via getConfig (in-memory, cheap), so a change takes
// effect on the next trip with no restart.
export const traceConfig = defineConfig({
  name: "trace",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, captureTrace is a no-op and no traces are recorded (existing rows are untouched).",
    }),
    cooldownMs: intField({
      default: 10_000,
      min: 0,
      label: "Per-trigger cooldown (ms)",
      description:
        "Minimum time between two traces for the same trigger (kind:label). A repeatedly-tripping trigger produces one trace per cooldown window, not one per occurrence.",
    }),
    maxPerMin: intField({
      default: 30,
      min: 0,
      label: "Global trace cap (per minute)",
      description:
        "Hard cap on traces persisted per minute across all triggers, so a slow-event storm cannot saturate the engine.",
    }),
    windowMs: intField({
      default: 10_000,
      min: 0,
      label: "Minimum lookback window (ms)",
      description:
        "Minimum lookback for the captured window; the actual window is max(trigger duration, this), so a long trip always covers its own lifetime.",
    }),
  },
});
