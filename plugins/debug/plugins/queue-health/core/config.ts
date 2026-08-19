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
    slotHogHoldFactor: intField({
      default: 3,
      min: 1,
      label: "Slot-hog hold factor (× the class ceiling)",
      description:
        "File a queue-slot-hog report when a job has held a worker slot (locked/running) for more than this many times its hold class's work ceiling — 10s for instant, 2min for seconds, 30min for minutes. One factor rather than one duration, so the alarm scales with what the job declared instead of restating a number the class already owns.",
    }),
    slotBlockedWaitSeconds: intField({
      default: 5,
      min: 1,
      label: "Slot-blocked wait floor (seconds)",
      description:
        "File a queue-slot-blocked report when a job's average run spends at least this many seconds waiting on an admission gate AND more than half its slot hold is that wait — i.e. it is holding a worker slot to wait, not to work.",
    }),
    wedgeMinutes: intField({
      default: 3,
      min: 1,
      label: "Wedge threshold (minutes)",
      description:
        "File a queue-wedged report when every worker slot has been held by the same set of live jobs, with ready work waiting behind them, continuously for this many minutes. Also the floor of the queue-class-starved window (a class's own window is the longer of this and its work ceiling).",
    }),
  },
});
