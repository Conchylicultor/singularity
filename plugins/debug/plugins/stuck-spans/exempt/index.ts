import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "timer/no-unlisted-timer",
    paths: ["server/internal/watchdog.ts"],
    kind: "sanctioned",
    reason:
      "Reports requests / steps stuck in THIS process's profiler every 15 s — must run while the queue is wedged, and below cron's 1-minute floor.",
  },
  {
    rule: "sink-safety/no-adhoc-profiler-seam",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "Reads the open-span set on its own 15 s tick: a hang is only visible while the span is still open, and getRuntimeProfile has no in-flight set. Its evidence still goes through captureTrace.",
  },
] satisfies Exemptions;
