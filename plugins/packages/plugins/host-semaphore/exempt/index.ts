import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "spawn-safety/no-raw-bun-spawn",
    paths: ["server/internal/host-semaphore.ts"],
    kind: "sanctioned",
    reason:
      '`spawnWait` reads "granted\\n" off live stdout while holding stdin open as the release channel: the whole protocol is the open pipe, so temp-file capture is structurally impossible.',
  },
] satisfies Exemptions;
