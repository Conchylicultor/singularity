import noUntrackedDetachedWork from "./no-untracked-detached-work";
import noRawSetInterval from "./no-raw-set-interval";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "detached-work-safety",
  rules: {
    "no-untracked-detached-work": noUntrackedDetachedWork,
    // Sibling concern: a periodic loop. `defineTimer` is the one way to declare
    // one in server/central code; a raw interval is banned outright.
    "no-raw-set-interval": noRawSetInterval,
  },
} satisfies LintContribution;
