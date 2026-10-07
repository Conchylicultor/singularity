import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "spawn-safety/no-raw-bun-spawn",
    paths: ["server/internal/tmux-runtime.ts"],
    kind: "sanctioned",
    reason:
      "`tmux load-buffer -b … -` reads the buffer from stdin as a stream.",
  },
] satisfies Exemptions;
