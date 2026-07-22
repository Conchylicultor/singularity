import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Config for the op-wedge-watchdog monitor. The scheduled monitor job reads
// these live via getConfig each tick, so changes take effect on the next run
// without a restart. Mirrors bootWatchdogConfig's shape (one defineConfig with
// field factories rendered for free in Settings → Config).
//
// The `name` is a load-bearing literal (persisted config); do not rename.
export const opWedgeWatchdogConfig = defineConfig({
  name: "op-wedge-watchdog",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, the monitor job returns early and files no cli-op-wedge reports.",
    }),
    budgetMs: intField({
      default: 900_000,
      min: 0,
      label: "Op budget (ms)",
      description:
        "File a cli-op-wedge report when a live `./singularity {build,check,push}` op marker is older than this. The default 15 min is well past any legitimate build or check on this box, and well under the 8-17h wedges actually observed — so it trips on a wedge and never on a slow-but-progressing op.",
    }),
    capture: boolField({
      default: true,
      label: "Capture forensics",
      description:
        "Run the forensic capture (`sample`, the recursive child-process tree, `lsof`, and the twice-sampled CPU delta) against the wedged process before filing. Turning this off still files the report — with a 'capture skipped' note — but throws away the evidence the report exists to collect. Off is for a box already in so much trouble that a `sample` would make it worse.",
    }),
    jsProbe: boolField({
      default: true,
      label: "JS interrogation",
      description:
        "For an ARMED wedge (op marker carries the pre-armed `bun --inspect` ws URL), run the JS-level interrogation after the native capture: JSC internal sampling profiler accumulated over the probe window (names the hot function even when the burn is native — the mode that cracked the 2026-07-22 specimen), heap-allocation delta, protected-object histogram, and a second lsof. Unarmed wedges skip it with an explicit marker.",
    }),
    jsProbeSeconds: intField({
      default: 60,
      min: 10,
      label: "JS probe window (s)",
      description:
        "How long the JSC sampling profiler accumulates inside the wedged process. A native microtask storm yields only a few JS-visible samples per minute, so shorter windows risk an empty (inconclusive) profile.",
    }),
    reap: boolField({
      default: true,
      label: "Reap after capture",
      description:
        "Kill the wedged process (SIGTERM, then SIGKILL after 5s) once ALL forensics are banked — including when the capture is partial. Safe by construction: the push mutex and cpu-slots are kernel flocks that auto-release on death, and op markers self-heal on the next read. Turning this off restores stakeout behavior: the specimen stays alive (and the fleet stays gridlocked behind it) for manual interrogation.",
    }),
  },
});
