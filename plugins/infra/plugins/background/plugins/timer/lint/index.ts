import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";
import noUnlistedTimer from "./no-unlisted-timer";

// The register of in-process loops is the set of `exempt/index.ts` entries for
// `timer/no-unlisted-timer`, each declared by the plugin that owns the timer,
// with its reason. A timer is not a polling escape hatch (CLAUDE.md "No
// polling"): an entry needs the reason a job, watcher or event cannot do the
// work.
export default {
  name: "timer",
  rules: {
    "no-unlisted-timer": noUnlistedTimer,
  },
} satisfies LintContribution;
