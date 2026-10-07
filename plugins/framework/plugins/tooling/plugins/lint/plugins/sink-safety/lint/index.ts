import noAdhocFileSink from "./no-adhoc-file-sink";
import noAdhocProfilerSeam from "./no-adhoc-profiler-seam";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "sink-safety",
  rules: {
    "no-adhoc-file-sink": noAdhocFileSink,
    "no-adhoc-profiler-seam": noAdhocProfilerSeam,
  },
} satisfies LintContribution;
