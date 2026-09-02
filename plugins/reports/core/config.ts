import { defineConfig } from "@plugins/config_v2/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Fan-out ceiling knobs for the reports engine — the cross-fingerprint twin of
// the per-fingerprint velocity throttle. Every knob is read per admit via
// getConfig (in-memory, cheap), so tuning is live: a change applies to the next
// report, no restart.
//
// There is deliberately no "off" switch. A kind may RAISE its own ceiling
// (`ReportKindSpec.meta.fanOutPerWindow`) and the whole mechanism is temporary
// by construction — the budget refills every window, so a persistent problem
// mints its own row within one window. Removing the ceiling entirely is what
// produced the 2026-09-02 incident (422 alerts in 24 s), so it has no spelling.
export const reportsConfig = defineConfig({
  name: "reports",
  fields: {
    fanOutPerWindow: intField({
      default: 20,
      min: 1,
      label: "Fan-out per window",
      description:
        "How many DISTINCT fingerprints of one report kind may raise their own alert per window. A fingerprint that already alerted this window is not fan-out — its row, count and bell cooldown behave normally. Past the budget, new fingerprints fold into one report-storm rollup instead.",
    }),
    fanOutWindowMs: intField({
      default: 60_000,
      min: 1_000,
      label: "Fan-out window (ms)",
      description:
        "The budget window, and the one-shot delay before a storm rollup is filed. Each window re-grants the full budget, so collapse is temporary: a persistent problem mints its own row in the next window.",
    }),
    stormRosterMax: intField({
      default: 50,
      min: 1,
      // A readability bound, not a safety one — the roster is a subset of the
      // engine's tracked-fingerprint set by construction, so no value here can
      // make the rollup's truncation count disagree with it. Past a few
      // hundred names the rollup stops being an index and becomes the wall of
      // text it exists to replace.
      max: 1_000,
      label: "Storm roster max",
      description:
        "How many collapsed fingerprints a report-storm rollup names inline. Past the cap the tail only increments the rollup's truncated + occurrence counts — the accounting survives even when the individual key does not.",
    }),
  },
});
