import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Shed-engine knobs (the sentinelConfig template). Every knob is read per
// admit via getConfig (in-memory, cheap), so tuning is live — a change applies
// to the next observability write, no restart.
export const duressConfig = defineConfig({
  name: "duress",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, shedding is disabled: every observability write persists through its normal durable path even under duress. Buffered items from earlier episodes still flush.",
    }),
    persistFirstN: intField({
      default: 3,
      min: 0,
      label: "Persist first N per cascade",
      description:
        "During a duress episode, the first N items per cascade key still persist durably (the onset evidence); the rest are buffered in memory until the episode clears.",
    }),
    bufferMaxEntries: intField({
      default: 2000,
      min: 0,
      label: "Buffer max entries",
      description:
        "Per-buffer cap on in-memory shed items. On overflow the newest incoming item is dropped (first-N already captured the onset); only its per-cascade dropped count survives into the shed summary.",
    }),
    bufferMaxBytes: intField({
      default: 4_194_304,
      min: 0,
      label: "Buffer max bytes",
      description:
        "Soft per-buffer byte cap (JSON.stringify-length estimate, accumulated on insert). Overflow drops the newest incoming item, same as the entry cap.",
    }),
    flushDelayMs: intField({
      default: 30_000,
      min: 0,
      label: "Flush delay (ms)",
      description:
        "One-shot delay between the first admit that observes the episode cleared and the buffered replay. Re-checked at fire time, so a re-trip never flushes mid-episode.",
    }),
  },
});
