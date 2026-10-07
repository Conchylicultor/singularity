import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "spawn-safety/no-raw-bun-spawn",
    paths: ["check/internal/fd-double-close-probe.ts"],
    kind: "sanctioned",
    reason:
      "The `bun-runtime` check's probe. It is the one file whose PURPOSE is an extra stdio pipe: it proves the running Bun does not close a finished child's extra fds a second time (oven-sh/bun#33828), which it cannot do without handing a child one. Temp-file capture would remove the very thing under test. It spawns `/bin/sh -c 'printf hi >&3'`, which exits immediately, so the wedge this rule guards has no room to happen.",
  },
] satisfies Exemptions;
