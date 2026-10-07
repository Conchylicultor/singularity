import noAdhocMarkerScan from "./no-adhoc-marker-scan";
import noAdhocBindingScan from "./no-adhoc-binding-scan";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "marker-scan-safety",
  rules: {
    "no-adhoc-marker-scan": noAdhocMarkerScan,
    // Sibling concern: a global `const <name> = <call>(` binding scanner run over
    // RAW (un-masked) source — the fully-unmasked twin of the `{ strings: false }`
    // footgun `no-adhoc-marker-scan` covers. Both route through `markerCallSpans`.
    "no-adhoc-binding-scan": noAdhocBindingScan,
  },
} satisfies LintContribution;
