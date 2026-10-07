import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "host-pools-declared",
    paths: ["server"],
    kind: "sanctioned",
    reason:
      "The registry: the one legitimate owner of createHostSemaphore, through which every host pool is declared (defineHostPool).",
  },
] satisfies Exemptions;
