import noRawEventsWrite from "./no-raw-events-write";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "events",
  rules: {
    "no-raw-events-write": noRawEventsWrite,
  },
} satisfies LintContribution;
