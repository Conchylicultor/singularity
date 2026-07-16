import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Twin-probe knobs (Settings -> Config). `enabled` is the kill switch and
// defaults OFF: the probes are armed only for controlled experiments (the fat
// variants each allocate ~fatSizeMb of resident-then-cold heap). All fields take
// effect on the next main-backend restart — the supervisor reads them once at
// onReady and passes them to the child processes as argv, so there is no live
// re-tuning (a mid-run change would invalidate the measurement anyway).
export const pagingProbeConfig = defineConfig({
  name: "paging-probe",
  fields: {
    enabled: boolField({
      default: false,
      label: "Enabled",
      description:
        "When off, the twin probes do not run. Main backend only, restart to apply. Kept off by default — the fat variants each allocate ~fatSizeMb of cold heap.",
    }),
    fatSizeMb: intField({
      default: 400,
      min: 0,
      label: "Fat heap size (MB)",
      description:
        "Heap each fat-* probe allocates (mixed-entropy, touched resident once, then left cold). Restart to apply.",
    }),
    touchSliceMb: intField({
      default: 25,
      min: 1,
      label: "Touch slice (MB)",
      description:
        "Size of the random contiguous slice the fat-touch probe faults back in every 10 s tick. Restart to apply.",
    }),
    gcEachMinute: boolField({
      default: true,
      label: "GC each minute",
      description:
        "When on, the fat-touch probe runs a timed Bun.gc(true) once per minute to measure GC marking over a cold heap. Restart to apply.",
    }),
    boostQos: boolField({
      default: false,
      label: "Boost QoS",
      description:
        "When on, each probe raises its own thread to user-interactive QoS (a boosted second axis). Off by default — the fair twin is a normal, default-QoS app. Restart to apply.",
    }),
  },
});
