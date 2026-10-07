import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "agent-origin-safety/no-unmarked-app-fetch",
    paths: ["e2e/app-fetch.ts", "e2e/deploy-identity.ts"],
    kind: "sanctioned",
    reason:
      "`agentFetch` is the one sanctioned home for the idiom — it IS the marked fetch the rule points everyone at, so it necessarily contains the unmarked one.  `deploy-identity.ts` is the other half of that: `agentFetch` awaits its memo before every request, so a probe made THROUGH `agentFetch` would be waiting on itself and the run would hang before it started. It is also the one call here with nothing to mark — a GET of `/.build-id`, a static file the gateway serves out of the published dist, which creates no page and writes no config document for the revert ledger to record.",
  },
] satisfies Exemptions;
