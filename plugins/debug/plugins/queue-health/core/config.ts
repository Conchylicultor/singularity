import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Tunable thresholds for the queue-health watchdog. The watchdog reads these
// live via getConfig each tick, so changes take effect on the next tick without
// a restart. Mirrors slowOpConfig's shape (one defineConfig with field
// factories rendered for free in Settings → Config).
//
// Note what is NOT here: the watchdog's own 30s tick interval. That is a module
// constant in `watchdog.ts`, not config — same as the stuck-lock sweeper's
// `SWEEP_INTERVAL_MS`. The cadence is a property of the detector (how many
// samples fit in the wedge window), not a threshold an operator tunes.
export const queueHealthConfig = defineConfig({
  name: "queue-health",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, the watchdog tick returns early and files no queue-health reports.",
    }),
    backlogDepthThreshold: intField({
      default: 200,
      min: 0,
      label: "Backlog depth threshold",
      description:
        "File a queue-backlog report when the number of ready (overdue, unlocked, retry-eligible) jobs exceeds this count.",
    }),
    oldestOverdueMinutes: intField({
      default: 10,
      min: 0,
      label: "Oldest overdue threshold (minutes)",
      description:
        "File a queue-backlog report when the oldest ready job has been overdue longer than this many minutes (a stall signal).",
    }),
    runningJobMinutes: intField({
      default: 5,
      min: 0,
      label: "Slot-hog threshold (minutes)",
      description:
        "File a queue-slot-hog report when a job has held a worker slot (locked/running) longer than this many minutes.",
    }),
    wedgeMinutes: intField({
      default: 3,
      min: 1,
      label: "Wedge threshold (minutes)",
      description:
        "File a queue-wedged report when every worker slot has been held by the same set of live jobs, with ready work waiting behind them, continuously for this many minutes.",
    }),
  },
});
