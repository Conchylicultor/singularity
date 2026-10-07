import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "scroll-safety/no-adhoc-scroll-write",
    paths: ["web"],
    kind: "sanctioned",
    reason:
      "The auto-scroll primitive is the one sanctioned home for raw scroll writes — its whole web/ folder, so a new scroll role added there is covered.",
  },
] satisfies Exemptions;
