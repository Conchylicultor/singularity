import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "spawn-safety/no-raw-bun-spawn",
    paths: ["server/internal/run/supervisor.ts"],
    kind: "sanctioned",
    reason:
      "The supervised-run primitive, and the one place `detached: true` is meant to be written. Every property that makes it exempt is the point of it: the child outlives the call BY DESIGN (that is what surviving a backend restart means), its stdout and stderr are a caller-owned file descriptor rather than temp files read after exit, and its output is published while it runs by tailing that file. As build, release and deploy migrate onto it, their three entries below are deleted — the exemption converges on this one line instead of spreading.",
  },
] satisfies Exemptions;
