import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";
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
    // A FRACTION OF THE DEADLINE, and the bounds are the point. `deadlineMsFor`
    // is when a run of that class is aborted; reporting at a fraction strictly
    // below 1 makes warn-before-kill true by construction for every class at
    // every settable value, instead of a coincidence of two independently-chosen
    // numbers that an operator could invert with one config edit.
    //
    // THE UPPER BOUND IS LOAD-BEARING, not taste. At exactly 1.0 the warning
    // fires on the same instant as the abort, so a job would be killed and
    // warned about simultaneously — which is the same as never being warned.
    // Every value below it leaves real headroom between the two. Do not raise
    // `max` to 1; if a wider range is ever wanted, the fix is an exclusive bound
    // on `floatField`, not a `max` that lets the ordering collapse.
    //
    // 0.05 / 0.95 rather than an exclusive `(0, 1)` because `floatField`'s
    // min/max compile to `z.number().min()/.max()`, which are INCLUSIVE — there
    // is no exclusive spelling in the field type today. The lower bound is the
    // mirror case: at 0 every dispatch trips on arrival.
    //
    // Replaces the old `slotHogHoldFactor` (an int × the class's WORK ceiling).
    // That knob measured the wrong quantity — a multiple of a work ceiling used
    // as a hold threshold — and at its default of 3 it put `minutes` at 90 min,
    // i.e. AFTER the deadline: a job killed before it was ever warned about.
    slotHogDeadlineFraction: floatField({
      default: 0.5,
      min: 0.05,
      max: 0.95,
      step: 0.05,
      label: "Slot-hog threshold (fraction of the class deadline)",
      description:
        "File a queue-slot-hog report when a job has held a worker slot (locked/running) for more than this fraction of its hold class's deadline — the wall-clock point at which a run of that class is aborted. A fraction rather than a duration, so the alarm scales with what the job declared; strictly below 1, so the warning always precedes the kill.",
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
